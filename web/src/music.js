/* Sage Quest music. One small state machine: music.to(state, { world, layers, intensity, phase }).
   States: off, title, onboard, camp, explore, combat, boss, payoff, card.
   - Shared score (own work, rendered by script): seven stems of one 8-bar loop in D minor that the questions add
     one by one, a D major twin for the end card, and three one-shot stings.
   - Per world: one stem in the shared loop (the "colour") plus three sourced CC0 loops (explore, combat, boss); see
     web/assets/ASSET_SOURCES.md.
   Every file is a seamless loop: each tail is folded into its head. Changes between states are
   crossfades; the beat before the boss and the boss payoff are silence on purpose.
   Audio graph: sources -> per-layer gain -> group gain (+ lowpass for intensity) -> music gain -> the game's master
   chain after the mix duck (sfx.js sfxVoice().out), so effects and voices stay on top and the limiter covers both.
   Nothing here runs per frame: a 250 ms timer reads the game state (window.__sq) and a 500 ms timer schedules loops.
   Flags: ?music=0 (no music), ?musiclog=1 (console line per state change).
   Key M mutes the music (kept in localStorage). */
import { sfxVoice } from './sfx.js';
import { CUES } from './music-cues.js';

const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const OFF = Q.get('music') === '0' || Q.get('music') === 'off';
const LOG = Q.get('musiclog') === '1';
const BASE = 'assets/music/';
const WORLDS = ['dark', 'edo', 'neon', 'frontier', 'storybook'];
/* the level of each state against the file level (files sit at about -18 LUFS; the master chain adds about -3 dB) */
const LEVEL = { title: 0.7, onboard: 0.66, camp: 0.48, explore: 0.56, combat: 0.8, boss: 0.9, card: 0.5, payoff: 0, off: 0 };
const MASTER = 1.2; /* the music bus: about -30 dBFS RMS on a walk, -25 in a fight, -20 at the boss */
const ONBOARD_ORDER = ['on_pad', 'on_pulse', 'col', 'on_stars', null, 'on_heart', 'on_enemy', 'on_lift']; /* index = answers given; null = the pad and pulse rise */
const STEM_GAIN = { on_pad: 0.9, on_pulse: 0.85, col: 1, on_stars: 0.9, on_heart: 1, on_enemy: 0.9, on_lift: 0.9 };
const COL_GAIN = { dark: 1.9, neon: 1.15 }; /* the quiet colour stems come up to the others */

let meter = null; let meterBuf = null;
let ctx = null; let out = null; let ext = null; let muted = false; let userVol = 1;
const buffers = new Map(); /* name -> AudioBuffer | Promise | null (failed) */
const groups = new Map();  /* id -> Group */
const st = { state: 'off', world: null, layers: 0, intensity: 0, phase: 0, since: 0, errors: [], log: [] };
try { muted = localStorage.getItem('sq-music-mute') === '1'; } catch { /* storage is optional */ }

function note(msg) { const row = { t: +(performance.now() / 1000).toFixed(2), msg }; st.log.push(row); if (st.log.length > 400) st.log.shift(); if (LOG) console.log('[music]', row.t, msg); }
function pickExt() {
  if (ext) return ext;
  try { const a = document.createElement('audio'); ext = a.canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'mp3'; } catch { ext = 'mp3'; }
  if (Q.get('musicfmt') === 'mp3') ext = 'mp3';
  return ext;
}
function attach() {
  if (ctx) return true;
  const V = sfxVoice(); if (!V) return false;
  ctx = V.ctx; out = ctx.createGain(); out.gain.value = muted ? 0 : MASTER * userVol; out.connect(V.music || V.out);
  if (LOG || Q.has('musicmeter')) { try { meter = ctx.createAnalyser(); meter.fftSize = 2048; out.connect(meter); meterBuf = new Float32Array(meter.fftSize); } catch { meter = null; } } /* tests: music.level() */
  note('audio attached, format ' + pickExt());
  return true;
}
/* decode with a callback form too: old Safari has no promise form */
function decode(ab) { return new Promise((res, rej) => { try { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); } catch (e) { rej(e); } }); }
async function fetchBuf(name, e) { const r = await fetch(`${BASE}${name}.${e}`); if (!r.ok) throw new Error(`${name}.${e} ${r.status}`); return decode(await r.arrayBuffer()); }
function load(name) {
  if (buffers.has(name)) return buffers.get(name);
  const p = (async () => {
    let buf = null;
    try { buf = await fetchBuf(name, pickExt()); } catch (e1) { if (pickExt() !== 'mp3') { try { buf = await fetchBuf(name, 'mp3'); } catch (e2) { st.errors.push(String(e2.message || e2)); } } else st.errors.push(String(e1.message || e1)); }
    if (buf) { buf._trim = trimOf(buf, name); } else note('missing ' + name);
    buffers.set(name, buf); return buf;
  })();
  buffers.set(name, p); return p;
}
/* Every cue has an exact length (music-cues.js). Ogg Opus decodes to that length. An MP3 can decode with padding at
   both ends: then play exactly the cue length, from after the encoder delay (1105 samples), so the loop has no gap. */
function trimOf(buf, name) {
  const D = CUES[name]?.dur; if (!D) return { start: 0, dur: buf.duration };
  const extra = buf.duration - D; if (extra < 0.002) return { start: 0, dur: Math.min(D, buf.duration) };
  return { start: Math.min(extra, 1105 / buf.sampleRate), dur: D };
}

/* A group = layers that share one loop clock. Each cycle starts one source per sounding layer; consecutive cycles
   overlap by X seconds (30 ms: the files are already seamless). A layer that joins late starts inside the cycle. */
class Group {
  constructor(id, period) {
    this.id = id; this.period = period || 0; this.X = 0.03; this.layers = new Map(); this.t0 = 0; this.k = -1; this.live = false; this.srcs = new Set();
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.5;
    this.lp.connect(this.gain); this.gain.connect(out);
  }
  layer(name, buf, level = 1) {
    let L = this.layers.get(name);
    if (!L) { L = { name, buf: null, gain: ctx.createGain(), level: 0 }; L.gain.gain.value = 0; L.gain.connect(this.lp); this.layers.set(name, L); }
    if (buf && !L.buf) { L.buf = buf; if (!this.period) this.period = buf._trim.dur - this.X; if (this.want) { const w = this.want; this.want = null; this.start(w.level, w.secs); } else if (this.live) this.join(L); }
    this.setLayer(name, level, 0.05);
    return L;
  }
  setLayer(name, level, secs = 1.5) {
    const L = this.layers.get(name); if (!L || L.level === level) return; L.level = level;
    const t = ctx.currentTime; const g = L.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(level, t + Math.max(0.02, secs));
  }
  one(L, when, offset, len) {
    const src = ctx.createBufferSource(); src.buffer = L.buf; const e = ctx.createGain(); const X = this.X;
    e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(1, when + X);
    e.gain.setValueAtTime(1, when + len); e.gain.linearRampToValueAtTime(0, when + len + X);
    src.connect(e); e.connect(L.gain); src.start(when, L.buf._trim.start + offset); src.stop(when + len + X + 0.02);
    this.srcs.add(src); src.onended = () => { this.srcs.delete(src); try { e.disconnect(); } catch { /* gone */ } };
  }
  cycle() { /* schedule the next cycle of every layer that has its buffer */
    this.k++; const when = this.t0 + this.k * this.period;
    for (const L of this.layers.values()) if (L.buf) this.one(L, when, 0, this.period);
  }
  join(L) { /* a layer arrives while the loop runs: start it inside the current cycle, in time */
    const now = ctx.currentTime + 0.03; const cyc = this.t0 + this.k * this.period;
    if (now < cyc) { this.one(L, cyc, 0, this.period); return; }
    const off = now - cyc; if (off < this.period - 0.1) this.one(L, now, off, this.period - off);
  }
  start(level, secs) {
    if (!this.period) return false;
    if (!this.live) { for (const s of this.srcs) { try { s.stop(); } catch { /* ended */ } } this.live = true; this.t0 = ctx.currentTime + 0.06; this.k = -1; this.cycle(); }
    this.fade(level, secs); return true;
  }
  tick() { if (this.live && this.t0 + (this.k + 1) * this.period - ctx.currentTime < 1.6) this.cycle(); }
  fade(level, secs = 1.5) { const t = ctx.currentTime; const g = this.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(level, t + Math.max(0.02, secs)); this.level = level; }
  bright(hz, secs = 1.2) { const t = ctx.currentTime; const f = this.lp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.exponentialRampToValueAtTime(Math.max(200, hz), t + secs); }
  stop(secs = 1.5) {
    if (!this.live) return; this.fade(0, secs); this.live = false; const srcs = [...this.srcs]; const at = ctx.currentTime + secs + 0.05;
    for (const s of srcs) { try { s.stop(at); } catch { /* ended */ } }
  }
}
function group(id) { let g = groups.get(id); if (!g) { g = new Group(id); groups.set(id, g); } return g; }

let timer = null; let pending = false;
function pump() { for (const g of groups.values()) g.tick(); }
function sting(name, level = 0.9, delay = 0) {
  Promise.resolve(load(name)).then((buf) => { if (!buf || !ctx) return; const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = level; s.connect(g); g.connect(out); s.start(ctx.currentTime + delay, buf._trim.start); s.onended = () => { try { g.disconnect(); } catch { /* gone */ } }; note('sting ' + name); });
}

/* ---------------------------------------------------------------- what each state plays */
const SHARED = ['on_pad', 'on_pulse', 'on_stars', 'on_heart', 'on_enemy', 'on_lift'];
/* the title and question 1 play on_pad + on_stars only. The other four stems
   (~620 kB) load 6 s into question 1, at the first answer, or in any later state. A stem that arrives while the mix
   already wants it fades in over 1.5 s on the loop clock (no hard entry). */
const FIRST = new Set(['on_pad', 'on_stars']); let restT = 0; let restGo = false;
function score() { /* the shared 8-bar loop: all stems on one clock, most of them silent until asked for */
  const g = group('score');
  if (!restGo && !(st.state === 'title' || (st.state === 'onboard' && st.layers < 1))) restGo = true;
  if (!restGo && st.state === 'onboard' && !restT) restT = setTimeout(() => { restGo = true; score(); }, 6000);
  for (const n of SHARED) {
    const L = g.layers.get(n); if (!L) g.layer(n, null, 0);
    if ((L && L.buf) || (!restGo && !FIRST.has(n)) || g.layers.get(n).asked) continue; g.layers.get(n).asked = true;
    Promise.resolve(load(n)).then((b) => { if (!b) return; const lv = g.layers.get(n)?.level || 0;
      if (lv === 0 || !g.live) { g.layer(n, b, lv); return; }
      g.setLayer(n, 0, 0.02); g.layer(n, b, 0); g.setLayer(n, lv, 1.5); });
  }
  return g;
}
function colour(world) {
  const g = group('score'); const name = 'col_' + world;
  for (const w of WORLDS) if (w !== world && g.layers.has('col_' + w)) g.setLayer('col_' + w, 0, 1.5);
  if (!g.layers.has(name)) g.layer(name, null, 0);
  if (!g.layers.get(name).buf) Promise.resolve(load(name)).then((b) => { if (b) g.layer(name, b, g.layers.get(name).level); });
  return name;
}
function scoreMix(want) { const g = score(); for (const [n, L] of g.layers) g.setLayer(n, want[n] || 0, L.buf ? 2.0 : 0.05); }
function worldLoop(kind, world) {
  const id = `${kind}_${world}`; const g = group(id);
  if (!g.layers.has(id)) { g.layer(id, null, 1); Promise.resolve(load(id)).then((b) => { if (b && groups.get(id) === g) g.layer(id, b, 1); }); }
  return g;
}
function play(g, level, secs) { if (!g.start(level, secs)) g.want = { level, secs }; }
/* drop the groups (and their decoded audio) that the rest of the run does not need */
function gc(keep) {
  setTimeout(() => { for (const [id, g] of groups) { if (keep.includes(id) || g.live) continue; try { g.gain.disconnect(); } catch { /* gone */ } groups.delete(id); for (const n of g.layers.keys()) buffers.delete(n); } }, 5000);
}
function hush(except, secs) { for (const [id, g] of groups) if (!except.includes(id)) { g.want = null; g.stop(secs); } }

function apply(prev) {
  const { state, world } = st; const w = WORLDS.includes(world) ? world : 'dark';
  if (state === 'off' || state === 'payoff') { hush([], state === 'payoff' ? 0.3 : 1.5); return; }
  if (state === 'title') { scoreMix({ on_pad: 0.8, on_stars: 0.7 }); play(score(), LEVEL.title, 2.5); hush(['score'], 1.5); return; }
  if (state === 'onboard') {
    const n = Math.max(0, Math.min(7, st.layers | 0)); const want = {}; const col = n >= 2 ? colour(w) : null;
    for (let i = 0; i <= n; i++) { const k = ONBOARD_ORDER[i]; if (!k) continue; want[k === 'col' ? col : k] = STEM_GAIN[k] * (k === 'col' ? (COL_GAIN[w] || 1) : 1); }
    if (n >= 4) { want.on_pad = 1; want.on_pulse = 1; }
    scoreMix(want); play(score(), LEVEL.onboard * (0.72 + 0.04 * n), 1.5); hush(['score'], 1.5); return;
  }
  if (state === 'camp') { const col = colour(w); scoreMix({ on_pad: 0.9, on_heart: 0.9, on_stars: 0.5, [col]: 0.45 * (COL_GAIN[w] || 1) }); play(score(), LEVEL.camp, 2.5); hush(['score'], 2.5); return; }
  if (state === 'card') { const g = worldLoop('end', 'card'); play(g, LEVEL.card, 2.5); hush([g.id], 1.0); if (prev !== 'card') sting('sting_win', 0.8); return; }
  if (state === 'explore') { const g = worldLoop('explore', w); play(g, LEVEL.explore, prev === 'combat' ? 4 : 2.5); hush([g.id], prev === 'combat' ? 4 : 2); return; }
  if (state === 'combat') {
    const g = worldLoop('combat', w); const k = Math.max(0, Math.min(1, st.intensity));
    play(g, LEVEL.combat * (0.78 + 0.22 * k), 1.2); g.bright(2200 * Math.pow(8, k), 1.5); hush([g.id], 1.5); return;
  }
  if (state === 'boss') {
    const g = worldLoop('boss', w); const p = Math.max(0, Math.min(2, st.phase | 0));
    if (prev !== 'boss') { /* the beat before the boss: silence, the sting, then the loop comes in on the sting's hit */
      hush([], 0.5); sting('sting_boss', 0.9, 0.9);
      clearTimeout(apply.bossT); apply.bossT = setTimeout(() => { if (st.state === 'boss') { play(g, LEVEL.boss * 0.8, 0.6); g.bright(5200, 0.1); } }, 2300);
      return;
    }
    play(g, LEVEL.boss * [0.8, 0.9, 1][p], 0.8); g.bright([5200, 9500, 19000][p], 0.8); hush([g.id], 1.0);
  }
}

/* ---------------------------------------------------------------- public */
export { CUES };
export const music = {
  /* music.to('combat', { world: 'edo', intensity: 0.6 }) ; a repeat of the same state only updates the numbers */
  to(state, o = {}) {
    if (OFF) return;
    const prev = st.state; const same = prev === state && (o.world == null || o.world === st.world) && (o.layers == null || o.layers === st.layers) && (o.phase == null || o.phase === st.phase) && (o.intensity == null || Math.abs(o.intensity - st.intensity) < 0.2);
    if (same) return;
    if (o.world != null) st.world = o.world; if (o.layers != null) st.layers = o.layers; if (o.intensity != null) st.intensity = o.intensity;
    const phaseUp = state === 'boss' && prev === 'boss' && o.phase != null && o.phase > st.phase; if (o.phase != null) st.phase = o.phase;
    st.state = state; st.since = performance.now();
    if (!attach()) { pending = true; return; } /* audio is still locked: the state is kept and applied at the unlock */
    pending = false;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch { /* later */ } }
    if (!timer) timer = setInterval(pump, 500);
    note(`${prev} -> ${state}${st.world ? ' ' + st.world : ''}${state === 'onboard' ? ' layers ' + st.layers : ''}${state === 'combat' ? ' k ' + st.intensity.toFixed(2) : ''}${state === 'boss' ? ' phase ' + st.phase : ''}`);
    if (phaseUp) sting('sting_phase', 0.8);
    try { apply(prev); } catch (e) { st.errors.push(String(e.message || e)); }
    if (state === 'explore' || state === 'combat') preloadWorld(st.world);
    if (prev !== state) { const w = WORLDS.includes(st.world) ? st.world : 'dark'; if (state === 'boss') gc(['boss_' + w]); else if (state === 'card') gc(['end_card']); else if (state === 'title') gc(['score']); }
  },
  mute(on = !muted) { muted = !!on; try { localStorage.setItem('sq-music-mute', muted ? '1' : '0'); } catch { /* optional */ } if (out) { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(muted ? 0 : MASTER * userVol, t + 0.3); } note(muted ? 'muted' : 'unmuted'); return muted; },
  volume(v) { userVol = Math.max(0, Math.min(1.5, +v || 0)); if (out && !muted) out.gain.setTargetAtTime(MASTER * userVol, ctx.currentTime, 0.1); },
  /* a bench or a test asks for one cue by name */
  preload(names) { if (OFF || !attach()) return Promise.resolve([]); return Promise.all(names.map((n) => Promise.resolve(load(n)))); },
  status() { return { off: OFF, attached: !!ctx, ctx: ctx?.state || null, format: ext, muted, ...st, log: undefined, groups: [...groups.values()].filter((g) => g.live).map((g) => ({ id: g.id, level: +(g.level ?? 0).toFixed(2), layers: [...g.layers.values()].filter((L) => L.level > 0 && L.buf).map((L) => L.name) })), loaded: [...buffers].filter(([, b]) => b && !(b instanceof Promise)).map(([n]) => n), errors: st.errors.slice(-5) }; },
  log() { return st.log.slice(); },
  /* tests (?musiclog=1): the music level now, in dBFS RMS before the master chain (-120 = silence) */
  level() { if (!meter) return null; meter.getFloatTimeDomainData(meterBuf); let e = 0; for (let i = 0; i < meterBuf.length; i++) e += meterBuf[i] * meterBuf[i]; return +(10 * Math.log10(e / meterBuf.length + 1e-12)).toFixed(1); },
};
function preloadWorld(world) { const w = WORLDS.includes(world) ? world : 'dark'; for (const k of ['explore', 'combat', 'boss']) load(`${k}_${w}`); load('sting_boss'); load('sting_phase'); load('sting_win'); load('end_card'); }

/* ---------------------------------------------------------------- the director: read the game, pick the state */
let lastFoe = 0; let wasBoss = false; let lastState = '';
function read() {
  const sq = window.__sq; if (!sq || !sq.S) return;
  const S = sq.S; const f = sq.fight; const body = document.body.classList; const world = S.world || 'dark';
  if (!ctx && !attach()) return; /* locked: wait for the first key or click */
  if (pending) { pending = false; if (!timer) timer = setInterval(pump, 500); note('unlocked in ' + st.state); try { apply('off'); } catch { /* later */ } } /* the state set while locked */
  if (S.stage === 'title') return music.to('title', { world });
  if (S.stage === 'card') return music.to('card', { world });
  if (S.stage === 'build') {
    let n = (S.step | 0) + (S.holding ? 1 : 0); if (S.weapon && S.step >= 6) n = 7;
    if (n >= 2) load('col_' + (WORLDS.includes(world) ? world : 'dark'));
    if (n >= 5) preloadWorld(world);
    return music.to('onboard', { world, layers: Math.max(0, Math.min(7, n)) });
  }
  if (S.camping) return music.to('camp', { world });
  if (S.stage !== 'fight' || !f) return;
  const now = performance.now();
  const bossAlive = (f.bossFoe && f.bossFoe.state !== 'dead') || (f.boss && !f.boss.dead);
  const bossDown = f.bossStarted && !bossAlive && (f.bossFoe || f.boss);
  if (f.over || bossDown || f.deathCam) { wasBoss = false; return music.to(f.over && !bossDown && f.hp <= 0 ? 'off' : 'payoff', { world }); }
  if (f.bossStarted) {
    if (!bossAlive) return; /* the boss is still on its way in: hold what plays */
    const hp = typeof f.bossFrac === 'function' ? f.bossFrac() : 1; wasBoss = true;
    return music.to('boss', { world, phase: hp <= 0.3 ? 2 : hp <= 0.6 ? 1 : 0 });
  }
  const foes = Array.isArray(f.foes) ? f.foes.filter((x) => x.state !== 'dead' && x.state !== 'spawn' && !x.hold).length : 0;
  if (foes > 0) { lastFoe = now; const hurt = f.maxHp ? 1 - f.hp / f.maxHp : 0; return music.to('combat', { world, intensity: Math.min(1, 0.25 + foes * 0.17 + hurt * 0.35) }); }
  if (st.state === 'combat' && now - lastFoe < 3500) return; /* the last foe just fell: hold the fight music a moment */
  return music.to('explore', { world });
}
function startDirector() {
  if (OFF || typeof window === 'undefined') return;
  setInterval(() => { try { read(); const s = st.state; if (s !== lastState) lastState = s; } catch (e) { st.errors.push(String(e.message || e)); } }, 250);
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !out) return; const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t);
    if (document.hidden) out.gain.linearRampToValueAtTime(0, t + 0.4);
    else { try { if (ctx.state === 'suspended') ctx.resume(); } catch { /* later */ } out.gain.linearRampToValueAtTime(muted ? 0 : MASTER * userVol, t + 0.8); for (const g of groups.values()) if (g.live) { g.live = false; g.srcs.forEach((s) => { try { s.stop(); } catch { /* ended */ } }); g.start(g.level || 0, 0.5); } }
  });
  window.addEventListener('keydown', (e) => { if (e.code !== 'KeyM' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || window.__sqAudioBar /* the audio bar owns M */ || /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return; music.mute(); });
}
if (typeof window !== 'undefined') { window.__sqMusic = music; if (!Q.has('nomusicauto')) startDirector(); }

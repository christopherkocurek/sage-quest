/* the boss payoff. Every boss death in every world runs through this one module (fight.js makes a
   DeathDirector when a boss dies: killFoe, the dragon in updateBoss; it calls tick(dt) from holdDeath and camera(cam, dt)
   after its own camera pose each frame). The kill is now one sequence, 9-12 s, real seconds from the killing hit (dd.t), skippable with Space, Enter or Escape
   after 2 s. No text on screen except the vow line.

     1  THE BLOW      0 - 1.2    the killing hit: time falls to 15 % for 0.9 s, the whole mix ducks to near silence except
                                  one low hit and a ring-out, the lens pushes in. No text.
     2  THE FALL      1.2 - 4.5  the death cut, shorter and quiet.
                                  The boss's own module plays the break; nothing is written over it.
     3  THE LAND ANSWERS 4.5 - 8 the first-person camera returns. Because the enemy is gone, the land changes (class Dawn):
                                  the weather stops, the fog pulls back to show the far land, the sky and the light warm
                                  toward dawn over about 3 s, far lights come on one by one. The view holds the horizon,
                                  then turns slowly toward the ones the hero fights for.
     4  THE PEOPLE    6 - 9      the named companions come to the hero and cheer; the dog runs a circle round them.
                                  Nobody named: skipped.
     5  THE VOW       8 - 11.2   one line, large, alone on screen: the player's own vow as speech (story.recall, the text generator's vow echo; the freed
                                  line when no vow was said), a rising procedural chord under it that resolves as the card
                                  comes in.
     6  the end card (main.js showCard), as before.

   Also here: climax() / climaxHit(), the last fifth of the boss's health (a low drone rises, the boss's blows land in a short
   slow; sound and a flick of time only, no difficulty numbers).

   The death cut (shots A, B, C) is the cut of
     A  the hero's eye on the killing blow (the view eases onto the boss, the lens narrows: the push-in)
     B  a medium shot from the side or the low front while the boss breaks (its own module plays the knee, the light dying)
     C  the wide shot: the camera stands on the hero's side of the boss (where each world's arena puts its landmark behind
        the boss), low for a giant, and pulls back slowly; the companions stand in the frame when the quest has them
   The camera always holds the boss: each shot's place is chosen from candidates by line-of-sight tests (land height along
   the line, ray tests against the props and buildings, never on the side the body falls to); small props on the line are
   hidden for the shot, other foes and corpses on or near the line are hidden; the lens never comes inside the boss (the
   fight's joint points push it back) or under the land.

   Per-boss hooks (all optional) on the boss dress handle (foe.dress) or the dragon:
     dress.fallDir     Vector3 (world, unit, y 0): where the body falls; the medium and wide shots stand off that side
     dress.deathSize   metres: the subject height for framing (default: lookAt height over the ground, or 1.9 x scale)
     dress.landmark    Vector3 (world): a point the wide shot should hold behind the boss (default: the hero's side)
   Every step is guarded: a failure in any beat is caught and the sequence goes on; real-time watchdogs end the fight and
   bring the card even if the frame loop stalls. Dense one-line code uses block comments only. */
import * as THREE from 'three';
import { sfxDuck, sfxVoice } from './sfx.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3(); const _d = new THREE.Vector3();
const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _up = new THREE.Vector3(0, 1, 0);
const ray = new THREE.Raycaster();
const dirOf = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)]; /* the fight's yaw: forward = (-sin, -cos) */

/* ======================================================================================================================
   Sound: procedural voices past the mix duck (sfx.js sfxVoice / sfxDuck). Plain WebAudio nodes, so an OfflineAudioContext
   can render them for tests (the functions take { ctx, out, ir }).
   ====================================================================================================================== */
function noiseBuf(ctx, secs) { const n = Math.max(1, Math.floor(ctx.sampleRate * secs)); const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0); let s = 1234567; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; } return b; }
function reverbSend(V, from, amount) { if (!V.ir) return; const cv = V.ctx.createConvolver(); cv.buffer = V.ir; const g = V.ctx.createGain(); g.gain.value = amount; from.connect(g); g.connect(cv); cv.connect(V.out); }

/* the killing blow: one low hit and a ring-out, 0.9 s and 4 s */
export function blowSound(V, when = 0.012) {
  const { ctx, out } = V; const t = ctx.currentTime + when;
  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(out);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.55);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + 1.1);
  /* the body of the hit: low-passed noise */
  const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(ctx, 0.35); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 0.5;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.55, t + 0.006); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  ns.connect(lp); lp.connect(ng); ng.connect(bus); ns.start(t); ns.stop(t + 0.36);
  /* the ring-out: struck steel, four partials, the top ones die first; most of it goes to the reverb */
  const ring = ctx.createGain(); ring.gain.value = 0.9; const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 3200; ring.connect(rl); rl.connect(bus); reverbSend(V, rl, 0.7);
  for (const [m, a, d] of [[1, 0.5, 5.2], [2.0, 0.3, 4.2], [2.76, 0.2, 3.2], [5.4, 0.07, 1.6]]) {
    const r = ctx.createOscillator(); r.type = 'sine'; r.frequency.value = 392 * m; const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t + 0.02); rg.gain.linearRampToValueAtTime(a * 0.5, t + 0.03); rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + d);
    r.connect(rg); rg.connect(ring); r.start(t + 0.02); r.stop(t + 0.05 + d);
  }
}

/* the vow chord: four partials (sine and triangle, each a pair a few cents apart), a slow attack over 3 s with the filter opening;
   resolve() moves the suspended note up to the third and lets it go over about 2.8 s; stop(fade) cuts it */
export function makeChord(V) {
  const { ctx, out } = V; const t0 = ctx.currentTime + 0.03;
  const master = ctx.createGain(); master.gain.setValueAtTime(0.0001, t0); master.gain.exponentialRampToValueAtTime(0.3, t0 + 3.0);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4; lp.frequency.setValueAtTime(320, t0); lp.frequency.exponentialRampToValueAtTime(2600, t0 + 3.2);
  master.connect(lp); const dry = ctx.createGain(); dry.gain.value = 0.85; lp.connect(dry); dry.connect(out); reverbSend(V, lp, 0.5);
  const oscs = []; let top = [];
  /* A2, E3, A3 and the suspended B3 (which resolves to C#4) */
  for (const [f, type, a, isTop] of [[110, 'sine', 0.55, false], [164.81, 'triangle', 0.4, false], [220, 'sine', 0.38, false], [246.94, 'triangle', 0.3, true]]) {
    for (const det of [-4, 4]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; const g = ctx.createGain(); g.gain.value = a * 0.5;
      o.connect(g); g.connect(master); o.start(t0); oscs.push(o); if (isTop) top.push(o);
    }
  }
  let done = false;
  const end = (at) => { for (const o of oscs) { try { o.stop(at); } catch { /* stopped */ } } };
  return {
    resolve() {
      if (done) return; done = true; const now = ctx.currentTime;
      for (const o of top) { o.frequency.cancelScheduledValues(now); o.frequency.setValueAtTime(o.frequency.value, now); o.frequency.linearRampToValueAtTime(277.18, now + 0.9); }
      master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now); master.gain.linearRampToValueAtTime(0.34, now + 0.8); master.gain.exponentialRampToValueAtTime(0.0001, now + 3.0); end(now + 3.1);
    },
    stop(fade = 0.4) {
      if (done) return; done = true; const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now); master.gain.exponentialRampToValueAtTime(0.0001, now + fade); end(now + fade + 0.05);
    },
  };
}

/* the climax drone: two low sines and a low-passed saw under a slow pulse; set(k) 0..1 raises its level, its brightness and its pulse */
export function makeDrone(V) {
  const { ctx, out } = V; const t = ctx.currentTime;
  const master = ctx.createGain(); master.gain.value = 0.0001; master.connect(out);
  const trem = ctx.createGain(); trem.gain.value = 0.75; trem.connect(master);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120; lp.Q.value = 0.7; lp.connect(trem);
  const oscs = [];
  for (const [f, type, a] of [[55, 'sine', 0.8], [82.41, 'sine', 0.45], [110, 'sawtooth', 0.22]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(lp); o.start(t); oscs.push(o); }
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.9; const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); oscs.push(lfo);
  return {
    set(k) { const now = ctx.currentTime; master.gain.setTargetAtTime(0.0001 + 0.17 * k * k + 0.015 * k, now, 0.3); lp.frequency.setTargetAtTime(110 + 280 * k, now, 0.4); lfo.frequency.setTargetAtTime(0.9 + 0.9 * k, now, 0.5); },
    stop(fade = 0.5) { const now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now); master.gain.exponentialRampToValueAtTime(0.0001, now + fade); for (const o of oscs) { try { o.stop(now + fade + 0.05); } catch { /* stopped */ } } },
  };
}

/* the boss's last fifth of health (fight.updateBoss calls climax every frame, fight.takeHit calls climaxHit): the drone rises
   as the health falls from 20 % to 0. It stops by itself when the fight stops calling it. Sound only. */
export function climax(f, hp, dt) {
  try {
    const C = f._climax || (f._climax = { k: 0, v: null, seen: 0, timer: 0, cut(fade = 0.5) { try { this.v?.stop(fade); } catch { /* audio is optional */ } this.v = null; clearInterval(this.timer); this.timer = 0; this.k = 0; } });
    C.seen = performance.now();
    const want = f.active && !f.over && !f.deathCam && !f.dd && hp > 0 && hp < 0.2 ? clamp((0.2 - hp) / 0.2, 0, 1) : 0;
    C.k += (want - C.k) * Math.min(1, dt * 1.6);
    if (C.k > 0.02 && !C.v) { const V = sfxVoice(); if (V) { C.v = makeDrone(V); C.timer = setInterval(() => { if (performance.now() - C.seen > 700) C.cut(0.6); }, 250); } }
    if (C.v) { if (want === 0 && C.k < 0.02) C.cut(0.5); else C.v.set(C.k); }
  } catch { /* audio is optional */ }
}
export function climaxHit(f, foe) {
  try {
    const C = f._climax; if (!C || C.k < 0.05 || f.over) return;
    if (foe !== f.bossFoe && foe?.actor) return; /* the boss's own blows (its rings, bolts, the dragon): not a minion's */
    f.slow = Math.max(f.slow || 0, 0.14); f.slowK = 0.5;
  } catch { /* none */ }
}

/* ======================================================================================================================
   THE LAND ANSWERS. One table per world: where the sky, the fog and the light go, and what the far lights look like.
   Hex colours; k = how far the colour is taken (0..1).
   ====================================================================================================================== */
const DAWN = {
  dark: { sky: { top: 0x3a5584, hor: 0xf2a37c, k: 0.8 }, band: [0xffa66e, 0.9], glow: [0xff9561, 1.2], sun: 0xffd4a8, rays: 0, cloud: [0x6e4c62, 0xffb38a, 0.6], stars: 0,
    fog: { col: 0xd9a58c, k: 0.55, dens: 0.38, max: 0.5, start: 30, scat: 0xffc58f }, key: { col: 0xffc690, i: 0.9, hemi: 0.35, exp: 0.3, gain: [1.1, 1.0, 0.88], sat: 0.16, lift: 0x2a1a1a, liftK: 0.5 }, disc: [0xffcf9a, 0xff9a62],
    lights: { cols: [0xffb066, 0xffc888, 0xff9a52], n: 8, size: [2.6, 4.2] } },
  frontier: { sky: { top: 0x4a7cc4, hor: 0xffdcae, k: 1.0 }, band: [0xffc088, 0.8], glow: [0xffa468, 1.1], sun: 0xffdcb0, rays: 0, cloud: [0xb0a0a8, 0xffe6c8, 0.4], stars: 0,
    fog: { col: 0xe9c29c, k: 0.4, dens: 0.4, max: 0.45, start: 36, scat: 0xffd09a }, key: { col: 0xffd4a4, i: 0.55, hemi: 0.3, exp: 0.2, gain: [1.06, 1.0, 0.92], sat: 0.16 }, disc: [0xffd8a8, 0xffb070],
    lights: { cols: [0xffa458, 0xffc080], n: 7, size: [2.4, 3.8] } },
  edo: { sky: { top: 0xdcd4de, hor: 0xffd6c6, k: 0.95 }, /* ink look: a mid-blue zenith turned into a dark flat cap, so the zenith is pale paper */ band: [0xffb4a0, 0.5], glow: [0xff9a86, 0.8], sun: 0xffd6c0, rays: 0, cloud: [0xc4aeb8, 0xffeadf, 0.2], stars: 0,
    fog: { col: 0xf0c8c0, k: 0.45, dens: 0.4, max: 0.5, start: 28, scat: 0xffd2b8 }, key: { col: 0xffd2b8, i: 0.9, hemi: 0.4, exp: 0.3, gain: [1.12, 1.0, 0.9], sat: 0.14, lift: 0x34202a, liftK: 0.7 }, disc: [0xffd0b8, 0xffa890],
    lights: { cols: [0xff9c4a, 0xffb868], n: 9, size: [2.2, 3.6] } },
  neon: { sky: { top: 0x5a4a8e, hor: 0xff9a8c, k: 0.8 }, band: [0xff8aa0, 0.9], glow: [0xff7a92, 1.1], sun: 0xffc0b0, rays: 0, cloud: [0x5a4670, 0xff9ab0, 0.6], stars: 0,
    fog: { col: 0xd89aaa, k: 0.55, dens: 0.4, max: 0.5, start: 30, scat: 0xffb0a8 }, key: { col: 0xffb8a0, i: 0.8, hemi: 0.35, exp: 0.3, gain: [1.08, 0.98, 0.96], sat: 0.12, lift: 0x2c1830, liftK: 0.6 }, disc: [0xffc0b0, 0xff8a9a],
    lights: { cols: [0x3ef2ff, 0xff3aa0, 0xffa53a], n: 10, size: [2.8, 4.8] } },
  storybook: { sky: { top: 0x3f7fe0, hor: 0xffe6bc, k: 0.7 }, band: [0xffd89a, 0.22], glow: [0xffc880, 0.4], sun: 0xfff0c8, rays: 0, cloud: [0xe0d4cc, 0xfff2d8, 0.6], stars: 0,
    fog: { col: 0xf6e2bc, k: 0.12, dens: 0.6, max: 0.45, start: 16, scat: 0xffe6b8 }, key: { col: 0xffe6b8, i: 0.3, hemi: 0.1, exp: 0.05, gain: [1.05, 1.0, 0.93], sat: 0.1 }, disc: [0xfff0c0, 0xffd890],
    lights: { cols: [0xffe2a0, 0xffd080], n: 7, size: [2.2, 3.4] } },
};
const SKY_FLOATS = [['clouds', 'uClouds'], ['band', 'uBand'], ['stars', 'uStars'], ['aurora', 'uAurora'], ['ember', 'uEmber'], ['glowK', 'uGlowK'], ['rays', 'uRays'], ['cells', 'uCells']];
const SKY_COLS = [['cloudCol', 'uCloudCol'], ['cloudLit', 'uCloudLit'], ['bandCol', 'uBandCol'], ['sunCol', 'uSunCol'], ['emberCol', 'uEmberCol']];
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(c); GLOW_TEX.colorSpace = THREE.SRGBColorSpace; return GLOW_TEX;
}

class Dawn {
  constructor(f, kitId) {
    this.f = f; this.w = f.world; this.S = DAWN[kitId] || DAWN.dark; this.p = 0; this.pw = 0; this.t = 0; this.dead = false; this.started = false;
    this.lights = []; this.cFog = new THREE.Color(this.S.fog.col); this.cScat = new THREE.Color(this.S.fog.scat); this.cKey = new THREE.Color(this.S.key.col);
    this.cGain = new THREE.Color(...this.S.key.gain); this.cLift = new THREE.Color(this.S.key.lift ?? 0); this.cDisc = new THREE.Color(this.S.disc[0]); this.cDiscH = new THREE.Color(this.S.disc[1]);
    this.cTop = new THREE.Color(this.S.sky.top); this.cHor = new THREE.Color(this.S.sky.hor); this.tmp = new THREE.Color();
  }
  /* freeze the land's state as the base the dawn grows from, and put the look pass's output under our hand */
  start() {
    if (this.started) return; this.started = true; const w = this.w; const L = w.lands; const u = L?.skyU; const st = L?.skyTarget; const S = this.S;
    this.u = u; this.st = st; this.land = L?.current || null; this.base = { f: {}, st: {}, c: {}, top: null, hor: null, own: 0, glowDir: null, glowCol: null };
    if (u && st) {
      for (const [k, n] of SKY_FLOATS) { this.base.f[n] = u[n].value; this.base.st[k] = st[k]; }
      for (const [k, n] of SKY_COLS) { this.base.c[n] = u[n].value.clone(); this.base.st[k] = st[k]?.clone?.() ?? null; }
      this.base.own = u.uOwn.value; this.base.stOwn = st.own; this.base.top = u.uSkyTop.value.clone(); this.base.hor = u.uSkyHor.value.clone();
      this.base.glowDir = u.uGlowDir.value.clone(); this.base.glowCol = u.uGlowCol.value.clone(); this.base.lightning = st.lightning;
      /* the horizon glow sits toward the key (the moon or the sun) unless the land already has its own */
      this.ownGlow = u.uGlowK.value > 0.05; const key = w._look?.key; if (!this.ownGlow && key) u.uGlowDir.value.set(key.x, 0.1, key.z);
    }
    /* weather: every GPU particle layer of the land fades out */
    this.parts = (this.land?.particles || []).map((pt) => ({ pt, base: pt.material.userData.target ?? pt.material.uniforms.uOpacity.value }));
    /* lightning flashes stop (the land's own ticker calls world.flash; the director's own flashes pass) */
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k); const me = this;
    this.flash0 = w.flash; this.flashOwn = own(w, 'flash'); this.flashHook = function flash(a) { if (!me.dead && me.p > 0.02 && a > 0.25) return; return me.flash0.call(w, a); }; w.flash = this.flashHook;
    /* the look pass runs after the updaters: its output (fog, light, grade, the disc) is moved after it has run */
    this.look0 = w.applyLook; this.lookOwn = own(w, 'applyLook'); const prev = this.look0;
    this.hook = function applyLook(dt, focus) { prev.call(w, dt, focus); try { me.afterLook(); } catch (err) { if (!me.warned) { me.warned = true; console.warn('dawn look', err); } } };
    w.applyLook = this.hook;
    void S;
  }
  update(dt, t) {
    if (!this.started) return; this.t = t;
    this.p = sstep(0, 3.3, t); this.pw = sstep(0, 1.5, t);
    /* the sky (after the land's own update this frame, before the render): absolute values from the saved base */
    const u = this.u; const st = this.st; const S = this.S; const p = this.p; if (!u || !st) return;
    const quick = new Set(['uClouds', 'uStars', 'uCells', 'uAurora', 'uEmber']); /* the weather and the night go in 1.5 s, the colour takes 3 s */
    const mixF = (key, n, to) => { const k = quick.has(n) ? this.pw : p; const v = this.base.f[n] + (to - this.base.f[n]) * k; u[n].value = v; if (key) st[key] = v; };
    for (const [k, n] of SKY_FLOATS) {
      let to = this.base.f[n];
      if (n === 'uClouds') to = this.base.f[n] * S.cloud[2] + 0.0; else if (n === 'uBand') to = Math.max(this.base.f[n], S.band[1]); else if (n === 'uStars') to = 0; else if (n === 'uCells' || n === 'uAurora' || n === 'uEmber') to = 0;
      else if (n === 'uGlowK') to = this.ownGlow ? this.base.f[n] : S.glow[1]; else if (n === 'uRays') to = Math.max(this.base.f[n], S.rays);
      mixF(k, n, to);
    }
    st.lightning = this.base.lightning && p < 0.05;
    const mixC = (k, n, hex, kk) => { u[n].value.copy(this.base.c[n]).lerp(this.tmp.set(hex), kk * p); if (st[k]?.copy) st[k].copy(u[n].value); };
    mixC('cloudCol', 'uCloudCol', S.cloud[0], 0.75); mixC('cloudLit', 'uCloudLit', S.cloud[1], 0.8); mixC('bandCol', 'uBandCol', S.band[0], 1); mixC('sunCol', 'uSunCol', S.sun, 0.7);
    if (!this.ownGlow) u.uGlowCol.value.copy(this.base.glowCol).lerp(this.tmp.set(S.glow[0]), p);
    /* the gradient: a land with its own sky blends toward the dawn gradient; one without takes it over by uOwn */
    const sk = S.sky.k * p;
    if (this.base.own > 0.5) { u.uSkyTop.value.copy(this.base.top).lerp(this.cTop, sk); u.uSkyHor.value.copy(this.base.hor).lerp(this.cHor, sk); }
    else { u.uSkyTop.value.copy(this.cTop); u.uSkyHor.value.copy(this.cHor); const o = this.base.own + (1 - this.base.own) * sk; u.uOwn.value = o; st.own = o; }
    /* weather */
    for (const { pt, base } of this.parts) { const tg = base * (1 - this.pw); pt.material.userData.target = tg; const pu = pt.material.uniforms.uOpacity; if (pu.value > tg) pu.value = tg; }
  }
  /* after world.applyLook: the post fog, the light, the grade and the disc */
  afterLook() {
    const p = this.p; if (this.dead || p <= 0.001) return; const w = this.w; const S = this.S; const fu = w.fogPass.uniforms; const v = fu.uFog.value;
    v.x *= 1 - (1 - S.fog.dens) * p; v.y *= 1 - (1 - S.fog.dens) * 0.85 * p; v.w += (Math.min(v.w, S.fog.max) - v.w) * p;
    fu.uStart.value += S.fog.start * p; fu.uSky.value *= 1 - 0.25 * p;
    fu.uFogCol.value.lerp(this.cFog, S.fog.k * p); fu.uScatCol.value.lerp(this.cScat, p).multiplyScalar(1 + (S.fog.boost ?? 0.5) * p);
    const K = S.key; const fl = w.film.uniforms; fl.sat.value += K.sat * p; fl.gain.value.lerp(this.cGain, 0.5 * p); if (K.lift != null) fl.lift.value.lerp(this.cLift, (K.liftK ?? 0.5) * p);
    w.sun.color.lerp(this.cKey, 0.75 * p); w.sun.intensity *= 1 + K.i * p; w.hemi.intensity *= 1 + K.hemi * p; w.hemi.color.lerp(this.cKey, 0.3 * p);
    w.target.exposure *= 1 + K.exp * p;
    if (w.disc?.visible) { const du = w.disc.material.uniforms; du.uCol.value.lerp(this.cDisc, 0.85 * p); du.uHalo.value.lerp(this.cDiscH, 0.85 * p); du.uI.value *= 1 + 0.5 * p; du.uHaloI.value *= 1 + 1.2 * p; }
  }
  /* the far lights: small warm glows on the far land, each coming on at its own moment, in the arc the camera will cover */
  placeLights(eye, yawA, yawB, gy, solids = null, t0 = 0.6, t1 = 3.1) {
    const sp = this.S.lights; const r = (() => { let s = 1013904223; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
    /* half of them in the first view (the land beyond the fallen boss), half where the camera ends up */
    const picks = []; const list = solids || [];
    for (let tries = 0; tries < 160 && picks.length < sp.n; tries++) {
      const base = picks.length % 2 ? yawB : yawA; const ang = base + (r() - 0.5) * 1.15; const dist = 48 + r() * 110; const [dx, dz] = dirOf(ang); const x = eye.x + dx * dist; const z = eye.z + dz * dist; const y = gy(x, z) + 0.9 + r() * 1.4;
      if (picks.some((q) => Math.abs(wrap(q.ang - ang)) < 0.13)) continue;
      let seen = true; for (let i = 1; i < 12; i++) { const k = i / 12; if (gy(eye.x + (x - eye.x) * k, eye.z + (z - eye.z) * k) > eye.y + (y - eye.y) * k - 0.4) { seen = false; break; } }
      if (seen && list.length) { _d.set(x - eye.x, y - eye.y, z - eye.z); const L = _d.length(); _d.multiplyScalar(1 / L); ray.set(eye, _d); ray.near = 1; ray.far = L - 1; let hits = []; try { hits = ray.intersectObjects(list, false); } catch { hits = []; }
        for (const h of hits) { const o = h.object; const g = o.geometry; const sc = _b.setFromMatrixScale(o.matrixWorld); const rad = o.isInstancedMesh ? 2 : g.boundingSphere?.radius * Math.max(sc.x, sc.y, sc.z); if (rad > 2.2) { seen = false; break; } } }
      if (!seen) continue; picks.push({ ang, x, y, z, dist });
    }
    picks.sort(() => r() - 0.5);
    picks.forEach((q, i) => {
      const col = new THREE.Color(sp.cols[Math.floor(r() * sp.cols.length)]).multiplyScalar(3.4); const m = new THREE.SpriteMaterial({ map: glowTex(), color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const s = new THREE.Sprite(m); const size = (sp.size[0] + r() * (sp.size[1] - sp.size[0])) * (1.4 + q.dist / 80); s.scale.setScalar(size); s.position.set(q.x, q.y, q.z); s.renderOrder = 7; s.frustumCulled = false; this.w.scene.add(s);
      this.lights.push({ s, m, size, on: t0 + (i / Math.max(1, picks.length - 1)) * (t1 - t0) + (r() - 0.5) * 0.25, ph: r() * 6 });
    });
  }
  tickLights(t, dt) {
    for (const L of this.lights) { const k = sstep(L.on, L.on + 0.7, t); const fl = 0.93 + 0.07 * Math.sin(t * 6.1 + L.ph) * Math.sin(t * 2.3 + L.ph * 2); L.m.opacity = k * fl; L.s.scale.setScalar(L.size * (0.55 + 0.45 * k)); }
    void dt;
  }
  /* everything back as the land had it (the card builds its own sky) */
  stop() {
    if (this.dead) return; this.dead = true; const w = this.w;
    try { if (this.flashHook && w.flash === this.flashHook) { if (this.flashOwn) w.flash = this.flash0; else delete w.flash; } } catch { /* none */ }
    try { if (this.hook && w.applyLook === this.hook) { if (this.lookOwn) w.applyLook = this.look0; else delete w.applyLook; } } catch { /* none */ }
    const u = this.u; const st = this.st;
    if (this.started && u && st && this.base) {
      for (const [k, n] of SKY_FLOATS) { u[n].value = this.base.f[n]; st[k] = this.base.st[k]; }
      for (const [k, n] of SKY_COLS) { u[n].value.copy(this.base.c[n]); if (this.base.st[k] && st[k]?.copy) st[k].copy(this.base.st[k]); }
      u.uSkyTop.value.copy(this.base.top); u.uSkyHor.value.copy(this.base.hor); u.uOwn.value = this.base.own; st.own = this.base.stOwn; u.uGlowDir.value.copy(this.base.glowDir); u.uGlowCol.value.copy(this.base.glowCol); st.lightning = this.base.lightning;
    }
    for (const { pt, base } of this.parts || []) { try { pt.material.userData.target = base; } catch { /* gone */ } }
    for (const L of this.lights) { L.s.removeFromParent(); L.m.dispose(); } this.lights.length = 0;
  }
}

/* ======================================================================================================================
   The director
   ====================================================================================================================== */
export class DeathDirector {
  /* fight: the Fight; D: fight.deathCam ({ t, dur, foe } or { dragon: true }) */
  constructor(fight, D) {
    this.f = fight; this.D = D; this.t = 0; this.shot = 'A'; this.hidden = []; this.hiddenFoes = []; this.ended = false; this.skipped = false;
    /* the beats (real seconds from the killing hit) */
    this.tA = 1.2; this.tB = 2.9; this.tF = 4.5; this.tTurn0 = 5.6; this.tTurn1 = 8.2; this.tRun = 6.0; this.tVow = 8.0;
    this.finishAt = this.tF; this.line = null; this.vowTxt = null; this.freedText = '';
    /* the line of beat 5 is the text generator's own vow echo (story.recall: “...,” you roar), said again once; no vow said = the freed line (freed()) */
    try { this.vowTxt = fight.vow && typeof fight.story?.recall === 'function' ? (fight.story.recall(fight.vow, fight.resolve?.id) || null) : null; } catch { this.vowTxt = null; }
    this.line = this.vowTxt; this.reschedule();
    const cam = fight.world.camera; this.q0 = cam.quaternion.clone(); this.fov0 = cam.fov;
    this.hero = fight.pos.clone(); this.heroY = cam.position.y;
    /* the subject: where it stands, how tall it is, how wide */
    const foe = D.foe; this.foe = foe || null;
    if (D.dragon) { const v = fight.boss?.deathView?.(); this.c0 = (v?.look || fight.boss?.J || fight.pos).clone(); this.H = 7; this.R = 5; }
    else { this.c0 = foe.pos.clone(); const dr = foe.dress; const la = dr?.lookAt && dr.lookAt.lengthSq() > 0 ? dr.lookAt.y : 0;
      this.H = dr?.deathSize || Math.max(1.9 * (foe.scale || 1), la ? la - this.gy(this.c0.x, this.c0.z) + 0.2 : 0);
      this.R = Math.max(0.9 * (foe.scale || 1) + 0.5, Math.min(dr?.keepOut || 0, 6) * 0.55); }
    this.c0.y = this.gy(this.c0.x, this.c0.z);
    this.giant = this.H > 4.2;
    /* boss to hero, on the ground: the fight's own axis. The arena's landmark stands behind the boss on this line */
    this.toHero = new THREE.Vector3(this.hero.x - this.c0.x, 0, this.hero.z - this.c0.z); if (this.toHero.lengthSq() < 1e-4) this.toHero.set(Math.sin(fight.yaw), 0, Math.cos(fight.yaw)); this.toHero.normalize();
    const lm = foe?.dress?.landmark; if (lm) { this.toHero.set(this.c0.x - lm.x, 0, this.c0.z - lm.z); if (this.toHero.lengthSq() < 1e-4) this.toHero.set(0, 0, 1); this.toHero.normalize(); }
    this.aim = new THREE.Vector3().copy(this.c0).setY(this.c0.y + this.H * 0.55);
    this.camP = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.blockers = null; this.B = null; this.C = null;
    /* 1 THE BLOW: time falls to 15 % for 0.9 s (a short freeze first), the mix ducks to near silence, one low hit and its ring-out */
    fight.hitstop = Math.max(fight.hitstop || 0, 0.07); fight.slow = Math.max(fight.slow || 0, 0.9); fight.slowK = 0.15; fight.world.flash?.(0.12);
    try { if (!fight.vowReading?.()) fight.hud?.line?.('', '', 1); } catch { /* none */ } /* the blow carries no text: a line still up from the fight goes, except the vow echo inside its reading time */
    try { const c = fight._climax; if (c) c.cut(0.12); } catch { /* none */ }
    try { sfxDuck(0.05, 0.03); const V = sfxVoice(); if (V) blowSound(V); } catch { /* audio is optional */ }
    this.duckStage = 0;
    /* the world: its table by the kit id */
    const kid = fight.kit?.id; this.kid = kid && DAWN[kid] ? kid : 'dark';
    this.dawn = null; try { this.dawn = new Dawn(fight, this.kid); } catch (err) { console.warn('dawn', err); }
    this.people = []; this.fpStarted = false; this.vowEl = null; this.chord = null; this.chordResolved = false; this.dimmed = false;
    /* skip: Space, Enter or Escape after 2 s (a key held from the fight does not count: no repeats) */
    this._key = (e) => { if (e.repeat || !['Space', 'Enter', 'Escape', 'NumpadEnter'].includes(e.code)) return; this.skip(); };
    try { window.addEventListener('keydown', this._key, true); } catch { /* none */ }
    /* watchdogs in real time: the fight ends and the card comes even if the frame loop stalls */
    this.wd = [setTimeout(() => { try { if (!fight.over && !D.done) { D.done = true; fight.deathDone = true; fight.finish(true); } } catch (err) { console.warn('payoff watchdog', err); } }, 7000),
      setTimeout(() => { try { this.forceEnd(); } catch (err) { console.warn('payoff watchdog', err); } }, 26000)];
  }

  /* when the card comes: the vow beat is 3.2 s with a line to say, 1.2 s of dawn without one */
  reschedule() { if (!this.skipped) this.T = this.tVow + (this.line ? 3.2 : 1.2); }
  /* fight.finish: the freed line (story.freed / story.ending). It stands in for the vow line when no vow was said; it is never a caption over the fall. */
  freed(text) { this.freedText = text || ''; if (!this.vowTxt) this.line = this.freedText || null; this.reschedule(); }
  forceEnd() { if (this.ended) return; this.ended = true; const fn = this.onEnd; this.onEnd = null; if (fn) fn(); }
  /* a key: after 2 s the rest of the sequence goes in half a second */
  skip() {
    if (this.skipped || this.ended || this.t < 2) return; this.skipped = true; const f = this.f; const D = this.D;
    try { if (!D.done) { D.done = true; f.deathDone = true; f.finish(true); } } catch (err) { console.warn('payoff skip', err); }
    this.T = Math.min(this.T, this.t + 0.55); try { this.chord?.stop(0.4); } catch { /* none */ } if (this.vowEl) this.vowEl.style.opacity = '0';
  }

  /* ground under a point: the walk's ground (journey), else the land's, else 0 */
  gy(x, z) { const j = this.f.journey; if (j?.gy) { try { return j.gy(x, z); } catch { /* none */ } } const g = this.f.world.scene.userData.groundAt; if (g) { try { const v = g(x, z); if (Number.isFinite(v)) return v; } catch { /* none */ } } return 0; }

  /* the subject's look point now (the head or the falling body), eased so the camera never jerks */
  target(dt) {
    let raw = null;
    if (this.D.dragon) raw = this.f.boss?.deathView?.()?.look;
    else raw = this.foe?.dress?.lookAt && this.foe.dress.lookAt.lengthSq() > 0 ? this.foe.dress.lookAt : this.foe?.pos;
    if (raw) { _a.copy(raw); const g = this.gy(_a.x, _a.z); _a.y = Math.max(_a.y, g + Math.min(1.2, this.H * 0.3)); this.aim.lerp(_a, Math.min(1, dt * 3)); }
    return this.aim;
  }

  /* the scene meshes a line of sight is tested against (made once): solid, visible, not a body, not grass, not the land */
  solids() {
    if (this.blockers) return this.blockers;
    const skip = new Set(); const f = this.f;
    for (const x of f.foes || []) x.actor?.root?.traverse((o) => skip.add(o));
    for (const w of f.wisps || []) w.c?.traverse?.((o) => skip.add(o));
    f.vm?.traverse((o) => skip.add(o));
    const list = [];
    f.world.scene.traverse((o) => {
      if (!o.isMesh || skip.has(o) || o.isSkinnedMesh || !o.visible) return;
      let p = o; while (p) { if (!p.visible) return; p = p.parent; }
      const mt = Array.isArray(o.material) ? o.material[0] : o.material; if (!mt || mt.depthWrite === false || (mt.transparent && mt.opacity < 0.5) || mt.blending === THREE.AdditiveBlending) return;
      const g = o.geometry; if (!g?.attributes?.position) return;
      if (o.isInstancedMesh && o.count > 1500) return;
      if (!g.boundingSphere) g.computeBoundingSphere(); const s = _b.setFromMatrixScale(o.matrixWorld); const r = g.boundingSphere.radius * Math.max(s.x, s.y, s.z);
      if (!o.isInstancedMesh && r > 150) return; /* the land, the sea, the sky dome: the land is tested by its height instead */
      if ((g.index ? g.index.count : g.attributes.position.count) / 3 > 90000) return;
      list.push(o);
    });
    this.blockers = list; return list;
  }

  /* how clear a camera place is: the land along each line, the props on it. Returns { s, hide[] } */
  rate(P, pts) {
    let s = 0; const hide = []; const list = this.solids();
    for (const Q of pts) {
      _d.subVectors(Q, P); const L = _d.length(); _d.multiplyScalar(1 / L);
      for (let i = 1; i < 10; i++) { const k = i / 10; const x = P.x + (Q.x - P.x) * k; const y = P.y + (Q.y - P.y) * k; const z = P.z + (Q.z - P.z) * k; if (this.gy(x, z) > y - 0.15) { s -= 3; break; } }
      ray.set(P, _d); ray.near = 0.2; ray.far = Math.max(0.5, L - this.R * 0.9);
      let hits = []; try { hits = ray.intersectObjects(list, false); } catch { hits = []; }
      for (const h of hits) { const o = h.object; const g = o.geometry; const sc = _b.setFromMatrixScale(o.matrixWorld); const r = o.isInstancedMesh ? 2 : g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
        if (r < 5.5 && !o.userData.noHide) { if (!hide.includes(o)) hide.push(o); s -= 0.6; } else { s -= 4; break; } }
    }
    /* the lens itself: nothing solid within 0.9 m round it */
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) { ray.set(P, _c.set(x, y, z)); ray.near = 0; ray.far = 0.9; let h = []; try { h = ray.intersectObjects(list, false); } catch { h = []; } if (h.length) { s -= 2.5; break; } }
    return { s, hide };
  }

  /* pick a shot place: angles off the boss-to-hero line, a distance and a height; the best rated wins */
  pick(angles, dist, height, aimK, cen = this.c0, side = false) {
    const c = cen; const fall = this.foe?.dress?.fallDir || this.fallDir || null; let best = null;
    for (const [i, th] of angles.entries()) {
      const co = Math.cos(th); const si = Math.sin(th); const dx = this.toHero.x * co - this.toHero.z * si; const dz = this.toHero.z * co + this.toHero.x * si;
      const P = new THREE.Vector3(c.x + dx * dist, 0, c.z + dz * dist); P.y = Math.max(this.gy(P.x, P.z) + height, c.y + height * 0.6);
      const pts = [new THREE.Vector3(c.x, c.y + this.H * aimK, c.z), new THREE.Vector3(c.x, c.y + this.H * 0.2, c.z), new THREE.Vector3(c.x, c.y + this.H * 0.9, c.z)];
      const r = this.rate(P, pts); let s = r.s - i * 0.25;
      if (fall && fall.lengthSq() > 0.5) { const dot = dx * fall.x + dz * fall.z; if (dot > 0.35) s -= 6 * dot; if (side) s += 1.6 * (1 - Math.abs(dot)); }
      if (!best || s > best.s) best = { s, th, dist, height, P, hide: r.hide, dx, dz, cen: c };
    }
    return best;
  }

  hideOn(list) { for (const o of list) if (o.visible) { o.visible = false; this.hidden.push(o); } }
  restoreHidden() {
    for (const o of this.hidden) o.visible = true; this.hidden.length = 0;
    for (const x of this.hiddenFoes) if (x.actor?.root) x.actor.root.visible = true; this.hiddenFoes.length = 0;
  }

  /* other foes and corpses on or near the line of sight (or between the lens and the boss) go for the shot */
  clearFoes(P) {
    const c = this.c0;
    for (const x of this.f.foes || []) {
      if (x === this.foe || !x.actor?.root || !x.actor.root.visible) continue;
      const px = x.pos.x - P.x; const pz = x.pos.z - P.z; const lx = c.x - P.x; const lz = c.z - P.z; const L2 = lx * lx + lz * lz || 1;
      const k = clamp((px * lx + pz * lz) / L2, 0, 1); const ex = P.x + lx * k - x.pos.x; const ez = P.z + lz * k - x.pos.z;
      const near = Math.hypot(ex, ez) < 1.6 + 0.8 * (x.scale || 1) || Math.hypot(px, pz) < 3;
      if (near) { x.actor.root.visible = false; this.hiddenFoes.push(x); }
    }
  }

  /* the medium shot B and the wide shot C are chosen at the kill (during the hit-stop) */
  plan() {
    const H = this.H; const deg = Math.PI / 180;
    const dB = clamp(H * 1.15 + 2.6, 5.2, 19); const hB = clamp(H * 0.2, 0.9, 2.4);
    this.B = this.pick([75, -75, 55, -55, 100, -100, 35, -35, 125, -125].map((a) => a * deg), dB, hB, 0.55);
    /* a body that falls a long way (the Tower, a giant) is framed on the middle of where it will lie, from across its fall */
    const fall = this.foe?.dress?.fallDir; const cen = fall && H > 3 ? this.c0.clone().addScaledVector(fall, H * 0.35) : this.c0;
    const dC = this.giant ? clamp(H * 1.0 + 5, 8, 22) : clamp(H * 1.0 + 3.4, 5.6, 8); /* a man-sized boss stays big enough to read on the ground */ const hC = this.giant ? clamp(H * 0.16, 1.1, 2.6) : 2.1;
    /* the hero's side first (each arena puts its landmark behind the boss on that line); a body that falls along that line
       (the Tower) is taken from the side by the bonus in pick */
    const ang = [22, -22, 38, -38, 6, 55, -55, 75, -75].map((a) => a * deg);
    /* the wide shot never repeats the medium shot's side and angle exactly */
    this.C = this.pick(ang, dC, hC, 0.5, cen, !!fall);
    if (this.B && this.C && Math.abs(this.B.th - this.C.th) < 0.3) { const alt = this.pick(ang.filter((a) => Math.abs(a - this.B.th) > 0.45), dC, hC, 0.5, cen, !!fall); if (alt && alt.s > this.C.s - 3) this.C = alt; }
  }

  /* placed in the wide frame: the companions stand half way from the lens to the boss */
  placeCompanions(P) {
    const ws = (this.f.wisps || []).filter((w) => w.c); if (!ws.length) return;
    const c = this.c0; const lx = c.x - P.x; const lz = c.z - P.z; const L = Math.hypot(lx, lz) || 1; const ux = lx / L; const uz = lz / L;
    ws.forEach((w, i) => {
      const k = (this.giant ? 0.5 : 0.64) + (i % 2) * 0.06; const sd = (i % 2 ? 1 : -1) * (L * 0.1 + 0.9 + Math.floor(i / 2) * 1.1); /* mid-ground, well inside the frame */
      const x = P.x + ux * L * k - uz * sd; const z = P.z + uz * L * k + ux * sd;
      const p = w.c.position; p.set(x, this.gy(x, z), z); w.c.rotation && (w.c.rotation.y = Math.atan2(c.x - x, c.z - z));
      if (w.sp?.position && w.sp.position !== p) w.sp.position.copy(p);
    });
  }

  /* ---------------------------------------------------------------- the beats */

  /* 3 THE LAND ANSWERS: the first-person camera returns. Decided once, at the cut */
  beginFP() {
    this.fpStarted = true; const f = this.f; const hp = f.pos; this.restoreHidden();
    try { if (!f.vowReading?.()) f.hud?.line?.(''); } catch { /* none */ }
    const key = f.world._look?.key; const yB = Math.atan2(-(this.c0.x - hp.x), -(this.c0.z - hp.z)); const yS = key ? Math.atan2(-key.x, -key.z) : yB;
    const dS = wrap(yS - yB); const sgn = dS >= 0 ? 1 : -1;
    /* the first view: the land beyond the fallen boss with the sun on the edge of the frame */
    this.yaw0 = yB + clamp(dS, -0.8, 0.8) * 0.95; this.pitch0 = 0.02; this.pitch1 = 0.1; /* toward the sun or moon: the corpse stays at the edge of the frame and the horizon is in it */
    /* the ones who come: only bodies (a light that follows the hero, or a cause, is not a person) */
    this.people = (f.wisps || []).filter((w) => w.c && w.c.kind !== 'flame' && w.c.position).map((w, i) => ({ w, c: w.c, i, kind: w.c.kind === 'animal' ? 'animal' : 'person' }));
    const yC = this.yaw0 + sgn * 1.6; this.yaw1 = this.people.length ? yC : this.yaw0 + sgn * clamp(Math.abs(dS) * 0.5, 0.45, 0.9);
    const persons = this.people.filter((q) => q.kind === 'person');
    persons.forEach((q, j) => { const off = [0.2, -0.3, 0.55][j % 3]; const d = 3.3 + 0.5 * j; const [dx, dz] = dirOf(yC + off); q.stand = new THREE.Vector3(hp.x + dx * d, 0, hp.z + dz * d); q.stand.y = this.gy(q.stand.x, q.stand.z); });
    const hub = persons[0]?.stand || (() => { const [dx, dz] = dirOf(yC); const v = new THREE.Vector3(hp.x + dx * 4.4, 0, hp.z + dz * 4.4); v.y = this.gy(v.x, v.z); return v; })();
    this.hub = hub;
    this.people.forEach((q, i) => {
      q.w.dir = true; try { if (q.c.label) q.c.label.visible = false; } catch { /* none */ }
      const off = q.kind === 'person' ? (i * 0.5 - 0.1) : 0.45 + sgn * 0.2; const dist = q.kind === 'person' ? 9.5 + i * 1.3 : 10.5; const [dx, dz] = dirOf(yC + sgn * 0.3 + off);
      const x = hp.x + dx * dist; const z = hp.z + dz * dist; q.c.position.set(x, this.gy(x, z), z); q.c.first = true; q.c.vel?.set(0, 0, 0); q.c.last?.copy(q.c.position);
      q.from = q.c.position.clone(); q.phase = 'wait'; q.t = 0;
    });
    /* the far lights: in the arc the camera covers, in the dawn's own colours */
    try { const eye = new THREE.Vector3(hp.x, this.gy(hp.x, hp.z) + 2.0, hp.z); /* the hero's eye (the camera still stands at the wide shot) */ this.dawn?.start(); this.dawn?.placeLights(eye, this.yaw0, this.yaw1, (x, z) => this.gy(x, z), this.solids()); } catch (err) { console.warn('dawn lights', err); }
    this.dawnT0 = this.t; this.shot = 'F'; this.cut('F');
  }

  /* a soft flash of warm light where a freed companion stands (it grows and goes in 0.9 s) */
  burst(at, y = 1.2) {
    const m = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(this.S.lights.cols[0]).multiplyScalar(3.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const sp = new THREE.Sprite(m); sp.position.set(at.x, at.y + y, at.z); sp.scale.setScalar(0.5); sp.renderOrder = 8; sp.frustumCulled = false; this.f.world.scene.add(sp); (this.bursts ||= []).push({ sp, m, t: 0 });
  }
  tickBursts(dt) {
    for (let i = (this.bursts || []).length - 1; i >= 0; i--) { const b = this.bursts[i]; b.t += dt; const k = clamp(b.t / 0.9, 0, 1); b.sp.scale.setScalar(0.5 + 6.5 * (1 - (1 - k) * (1 - k))); b.m.opacity = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k) * 1.1;
      if (k >= 1) { b.sp.removeFromParent(); b.m.dispose(); this.bursts.splice(i, 1); } }
  }

  /* the camera of the first-person beats: the fight's own pose with a slow turn, the lens opening */
  tickFP(dt) {
    const f = this.f; const t = this.t; const e = sstep(this.tTurn0, this.tTurn1, t);
    f.yaw = this.yaw0 + wrap(this.yaw1 - this.yaw0) * e; f.pitch = this.pitch0 + (this.pitch1 - this.pitch0) * sstep(this.tF, this.tF + 2.6, t) - 0.03 * Math.sin(e * Math.PI);
    /* the dawn */
    const dn = this.dawn; if (dn) { dn.start(); dn.update(dt, t - this.dawnT0); dn.tickLights(t - this.dawnT0, dt); }
    /* the people */
    this.tickBursts(dt);
    for (const q of this.people) { try { this.walk(q, dt, t); } catch (err) { if (!q.warned) { q.warned = true; console.warn('payoff people', err); } } }
  }

  /* one companion's choreography: wait, come to the hero (the dog runs a circle round the group first), cheer */
  walk(q, dt, t) {
    const c = q.c; const hp = this.f.pos; const p = c.position; q.t += dt;
    /* the enemy is dead: a light caged above the fight breaks free where it stands (questprops 'return': the cage opens, the thread goes) */
    if (!q.freed && t >= this.tRun - 0.15) { q.freed = true; try { c.setState('return'); } catch { /* none */ } this.burst(p, q.kind === 'animal' ? 0.6 : 1.2); }
    if (q.phase === 'wait') { if (t >= this.tRun + (q.kind === 'animal' ? 0.15 : q.i * 0.12)) { q.phase = 'run'; q.t = 0; } else return; }
    const gyAt = (x, z) => this.gy(x, z);
    if (q.kind === 'person') {
      const S = q.stand; const dx = S.x - p.x; const dz = S.z - p.z; const d = Math.hypot(dx, dz);
      if (q.phase === 'run') {
        const sp = 6.2 * clamp(d / 1.6, 0.18, 1); const st = Math.min(d, sp * dt); if (d > 1e-4) { p.x += dx / d * st; p.z += dz / d * st; }
        p.y = gyAt(p.x, p.z); if (d < 0.18) { q.phase = 'cheer'; q.t = 0; c.focus = { x: hp.x, z: hp.z, until: c.t + 99 }; c.mood = { clip: 'Yes', until: c.t + 2.6, move: false }; /* a raised fist (Dance_Loop barely moved the body) */ try { if (c.P) c.P.flare = 1; } catch { /* none */ } }
      }
    } else {
      const R = 1.9; const H = this.hub;
      if (!q.circ) { const ax = q.from.x - H.x; const az = q.from.z - H.z; q.a0 = Math.atan2(az, ax); q.circ = true; }
      if (q.phase === 'run') {
        /* to the circle's edge, then round it once (about 1.8 s), then settle at the hero's side */
        const ex = H.x + Math.cos(q.a0) * R; const ez = H.z + Math.sin(q.a0) * R; const dx = ex - p.x; const dz = ez - p.z; const d = Math.hypot(dx, dz);
        if (d > 0.3) { const st = Math.min(d, 7.5 * dt); p.x += dx / d * st; p.z += dz / d * st; } else { q.phase = 'circle'; q.t = 0; q.ang = q.a0; }
        p.y = gyAt(p.x, p.z);
      } else if (q.phase === 'circle') {
        const w = 7 / R; q.ang += w * dt * (q.a0 > 0 ? -1 : 1); const x = H.x + Math.cos(q.ang) * R; const z = H.z + Math.sin(q.ang) * R; p.set(x, gyAt(x, z), z);
        if (q.t * w >= Math.PI * 2) { q.phase = 'settle'; q.t = 0; }
      } else if (q.phase === 'settle') {
        const [fx, fz] = dirOf(Math.atan2(-(H.x - hp.x), -(H.z - hp.z)) + 0.5); const sx = hp.x + fx * 2.5; const sz = hp.z + fz * 2.5; const dx = sx - p.x; const dz = sz - p.z; const d = Math.hypot(dx, dz);
        if (d > 0.15) { const st = Math.min(d, 4.5 * clamp(d / 1.2, 0.25, 1) * dt); p.x += dx / d * st; p.z += dz / d * st; p.y = gyAt(p.x, p.z); } else { q.phase = 'cheer'; c.focus = { x: hp.x, z: hp.z, until: c.t + 99 }; c.mood = { clip: 'wag', until: c.t + 99, move: false }; }
      }
    }
    if (q.w.sp?.position && q.w.sp.position !== p) q.w.sp.position.copy(p);
  }

  /* 5 THE VOW: one line, large, alone on screen; a scrim dims the picture behind it */
  showVow(text) {
    if (this.vowEl || !text) return;
    const el = document.createElement('div'); el.id = 'dd-vow'; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;inset:0;z-index:7;display:flex;align-items:center;justify-content:center;padding:0 10vw;box-sizing:border-box;text-align:center;pointer-events:none;opacity:0;transition:opacity 1.2s ease;background:radial-gradient(ellipse 58% 21% at 50% 50%,rgba(6,5,9,.52),rgba(6,5,9,.2) 62%,rgba(6,5,9,0) 100%);';
    const p = document.createElement('p'); p.textContent = text;
    p.style.cssText = 'margin:0;max-width:28em;font-family:var(--serif,Georgia,serif);font-style:italic;font-weight:500;font-size:clamp(30px,6.4vh,76px);line-height:1.18;letter-spacing:.005em;color:var(--cream,#f4ecd8);text-shadow:0 0 28px rgba(0,0,0,.92),0 0 11px rgba(0,0,0,.85),0 2px 4px rgba(0,0,0,.8);';
    el.appendChild(p); document.body.appendChild(el); this.vowEl = el; requestAnimationFrame(() => requestAnimationFrame(() => { if (this.vowEl === el) el.style.opacity = '1'; }));
  }

  /* the mix: ducked at the blow, a little less through the fall, back for the dawn */
  mix(t) {
    try {
      if (this.duckStage < 1 && t >= this.tA) { this.duckStage = 1; sfxDuck(0.2, 0.7); }
      if (this.duckStage < 2 && t >= this.tF - 0.35) { this.duckStage = 2; sfxDuck(1, 1.9); }
    } catch { /* audio is optional */ }
  }

  /* game time (the fight's raw frame time): the fight calls this from holdDeath */
  tick(dt) {
    this.t += dt; const t = this.t;
    if (!this.B && t > 0.02) { try { this.plan(); } catch (err) { console.warn('death director plan', err); } }
    if (t < 0.12) { this.f.slow = Math.max(this.f.slow || 0, 0.9 - t); this.f.slowK = 0.15; }
    /* no text through the blow: a line the fight raises in the kill's own frame (the vow recall at a third of the boss's health) is cleared each frame */
    if (t < this.tA && document.getElementById('line')?.classList.contains('on') && !this.f.vowReading?.()) { try { this.f.hud?.line?.('', '', 1); } catch { /* none */ } } /* the kill's own later slow (killFoe) never shortens the blow */
    this.mix(t);
    /* the letterbox stays on through the whole sequence (a chapter card that ended during the kill takes it off: hud.cinema(false)) */
    if (t > 0.2 && !document.body.classList.contains('cine')) { try { this.f.hud?.cinema?.(true); } catch { /* none */ } }
    if (t >= this.tF && !this.fpStarted) { try { this.beginFP(); } catch (err) { console.warn('payoff first person', err); this.fpStarted = true; this.shot = 'F'; } }
    if (this.fpStarted) { try { this.tickFP(dt); } catch (err) { console.warn('payoff land', err); } }
    /* 5 the vow line and the chord */
    if (t >= this.tVow && !this.vowShown) { this.vowShown = true; try { if (this.line) { this.showVow(this.line); const V = sfxVoice(); if (V) this.chord = makeChord(V); } } catch (err) { console.warn('payoff vow', err); } }
    if (this.chord && !this.chordResolved && t >= this.T - 0.9) { this.chordResolved = true; try { this.chord.resolve(); } catch { /* none */ } }
    if (this.vowEl && t >= this.T - 0.85 && this.vowEl.style.opacity !== '0') this.vowEl.style.opacity = '0';
    /* no dimming here: main.js holds the last frame as a still and the card cross-fades in over it (a dim before the still popped back to bright) */
    if (t >= this.T && !this.ended && this.onEnd) { this.ended = true; const fn = this.onEnd; this.onEnd = null; fn(); }
  }

  /* the camera of this frame (after the fight's own first-person pose) */
  camera(cam, dt) {
    const t = this.t; const f = this.f;
    if (this.fpStarted) {
      /* 3 and after: the fight's own first-person camera (yaw and pitch are set in tickFP); the lens opens a little */
      if (f.vm) f.vm.visible = false; /* the weapon is down: a lowered pistol or maul filled the bottom of the frame */
      const fov = 60 + 8 * sstep(this.tF, this.tF + 3.5, t); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      return;
    }
    const aim = this.target(dt);
    const shot = t < this.tA || !this.B ? 'A' : t < this.tB ? 'B' : 'C';
    if (shot !== this.shot) { this.shot = shot; this.cut(shot); }
    if (f.vm) f.vm.visible = shot === 'A';
    let fov = 58;
    if (shot === 'A') {
      /* the hero's own eye: the view eases onto the boss, the lens narrows (the push-in) */
      const k = sstep(0, 0.45, t); _m.lookAt(cam.position, aim, _up); _q.setFromRotationMatrix(_m); cam.quaternion.copy(this.q0).slerp(_q, k);
      fov = this.fov0 + (55 - this.fov0) * sstep(0, 1.1, t);
    } else {
      const S = shot === 'B' ? this.B : this.C; const k = shot === 'B' ? (t - this.tA) / (this.tB - this.tA) : (t - this.tB) / (this.tF - this.tB);
      const e = sstep(0, 1, k);
      /* B dollies in 10 % and arcs 6 degrees; C pulls back 30 %, arcs 14 degrees and rises a little: never a still frame */
      const dist = S.dist * (shot === 'B' ? 1 - 0.1 * e : 1 + (this.giant ? 0.3 : 0.16) * e); const th = S.th + (S.th >= 0 ? 1 : -1) * (shot === 'B' ? 0.1 : 0.24) * e;
      const co = Math.cos(th); const si = Math.sin(th); const dx = this.toHero.x * co - this.toHero.z * si; const dz = this.toHero.z * co + this.toHero.x * si;
      const cen = S.cen || this.c0; const P = this.camP.set(cen.x + dx * dist, 0, cen.z + dz * dist);
      P.y = Math.max(this.gy(P.x, P.z) + S.height + (shot === 'C' ? (this.giant ? 0.9 : 0.5) * e : 0), this.c0.y + S.height * 0.6);
      /* the lens never comes inside the boss: its joints push it back along the line */
      this.keepOff(P);
      /* the look: B holds the breaking body (its look point), C holds the boss low in the frame with the world above it */
      const L = this.look;
      if (shot === 'B') L.copy(aim);
      else { L.copy(cen).setY(this.c0.y + this.H * (this.giant ? 0.62 : 0.72)); L.lerp(aim, 0.35 + 0.5 * e); } /* the fallen body draws the look down as it lands */
      cam.position.copy(P); _m.lookAt(P, L, _up); cam.quaternion.setFromRotationMatrix(_m);
      if (shot === 'B') cam.rotateZ(0.025 * (S.th >= 0 ? 1 : -1));
      fov = shot === 'B' ? 46 - 3 * e : 48 + 4 * e;
      if (shot === 'C') this.placeCompanions(P);
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.rotation.setFromQuaternion(cam.quaternion, 'YXZ');
  }

  /* a cut: the next shot's blockers go, the foes on its line go */
  cut(shot) {
    /* a line still up from the fight (the vow recall at a third of the boss's health) never talks over the cut */
    try { if (!this.f.vowReading?.()) this.f.hud?.line?.(''); } catch { document.getElementById('line')?.classList.remove('on'); }
    this.restoreHidden();
    const S = shot === 'B' ? this.B : shot === 'C' ? this.C : null; if (!S) return;
    this.hideOn(S.hide); this.clearFoes(S.P);
    if (shot === 'C') this.clearFoes(this.hero);
  }

  keepOff(P) {
    const foe = this.foe; if (!foe) return;
    let pts = []; try { pts = this.f.clearPts(foe); } catch { pts = []; }
    const R = Math.max(1.2, 0.75 * (foe.scale || 1) + 0.6);
    for (let it = 0; it < 3; it++) {
      let worst = 0; let wx = 0; let wz = 0;
      for (const q of pts) { if (q.p) _a.copy(q.p).applyMatrix4(q.o.matrixWorld); else _a.setFromMatrixPosition(q.o.matrixWorld);
        const d = _a.distanceTo(P); if (d < R && R - d > worst) { worst = R - d; wx = P.x - _a.x; wz = P.z - _a.z; } }
      for (const v of [foe.dress?.lookAt, foe.dress?.maulHead]) if (v && v.lengthSq() > 0) { const d = v.distanceTo(P); if (d < R && R - d > worst) { worst = R - d; wx = P.x - v.x; wz = P.z - v.z; } }
      if (worst <= 0) break; const l = Math.hypot(wx, wz) || 1; P.x += (wx / l) * (worst + 0.3); P.z += (wz / l) * (worst + 0.3);
    }
    P.y = Math.max(P.y, this.gy(P.x, P.z) + 0.6);
  }

  dispose() {
    for (const id of this.wd || []) clearTimeout(id); this.wd = [];
    try { window.removeEventListener('keydown', this._key, true); } catch { /* none */ }
    this.restoreHidden();
    if (this.f.vm) this.f.vm.visible = true;
    for (const q of this.people || []) { try { q.w.dir = false; if (q.c.label && !q.c.noLabel) q.c.label.visible = true; q.c.mood = null; q.c.focus = null; } catch { /* gone */ } }
    try { this.dawn?.stop(); } catch (err) { console.warn('dawn stop', err); }
    for (const b of this.bursts || []) { try { b.sp.removeFromParent(); b.m.dispose(); } catch { /* gone */ } } this.bursts = [];
    /* the chord rings out if the card is coming (it is already resolving); a cut chord fades */
    try { if (this.chord && !this.chordResolved) this.chord.stop(0.5); } catch { /* none */ }
    try { sfxDuck(1, 0.4); } catch { /* none */ }
    if (this.vowEl) { const p = this.vowEl; this.vowEl = null; p.style.transition = 'opacity .5s ease'; p.style.opacity = '0'; setTimeout(() => p.remove(), 600); }
  }
}

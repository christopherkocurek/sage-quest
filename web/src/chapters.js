/* chapters II and III by shape. Each chapter of a quest asks
   for a different act:
     freedom  I break the chains (walk)   II hold them off while the freed one works the last lock   III stand by them when the enemy chains them again
     wonder   I find three things (walk)  II light the beacons (fight.js, unchanged)                  III follow the light a companion carries
     glory    I three challengers (walk)  II hold the gate: runners go for it, none may pass         III the name is tested (fight.js, unchanged)
   protect and revenge keep their chapters (fight.js).
   fight.js calls second(fight, ctx) in second() and twist(fight, ctx) in setupTwist(); false = the shape keeps its chapter in fight.js.
   prepare(fight) (called by journey.js when the walk starts) sets the chapter card lines, so the card says the new task.
   Lines come from story.chapters.<shape> when game/story.mjs has them, else from the defaults here. */
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { dotTexture } from './world.js';
import * as Q2 from './quest2.js'; /* the nine-row plan */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const FIELD = 13.5; /* inside the fight's 15 m ring */

/* the companion who acts in a chapter: a person first, then any body, then a light */
function actor(f) {
  const ws = (f.wisps || []).filter((w) => w.state === 'with' || w.state === 'return' || w.state === 'work');
  /* freedom: the one freed from the cage (journey.js keeps its name) */
  const kept = f.story?.shape === 'chains' ? f.story?.walk?.cage?.label : null; const k = kept && ws.find((w) => w.c && w.name === kept); if (k) return k;
  return ws.find((w) => w.c?.kind === 'person') || ws.find((w) => w.c && w.c.kind !== 'flame') || null;
}
const nameOf = (w) => (w ? w.name : 'someone');
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/* the lines of each new chapter (defaults; story.chapters.<shape> wins) */
function lines(f) {
  const st = f.story || {}; const own = st.chapters || {}; const ww = f.ww || ((t) => t);
  const w = actor(f); const who = (f.story?.shape === 'chains' && st.walk?.cage?.label) || nameOf(w); const enemy = st.enemy || 'The enemy'; const foe = enemy.replace(/^The /, 'the ');
  const D = {
    /* each beat once. Chapter I frees Wren from the cage (the lock breaks there). Chapter II is a different
       thing: a sealed bar shuts the way out, and Wren breaks the seal while the hero holds them off. Chapter III: the enemy
       throws a chain round Wren (Wren is not caged again or freed again; the hero breaks the chain) */
    chains: {
      title: 'The Seal', task: `${who} can break the seal on the way out. Keep ${foe}'s people away from ${who}.`, goal: `Guard ${who}`, start: `${who} is breaking the seal.`, startSub: '',
      hit: `They reach ${who}.`, hitSub: '', open: 'The seal breaks.',
      twist: `${enemy} throws a chain round ${who}.`, twistSub: '', twistGoal: 'Break the chain', freed: `${who} is free. Attack now.`,
    },
    dark: {
      /* a day world caps the dark at 0.3, so "puts out the light" did not match the frame: there the enemy
         brings a storm shadow, and the lantern ring is the safe ground */
      twist: f.dayWorld?.() ? `${enemy} draws a storm over the sun.` : `${enemy} puts out the light.` /* "lantern" read as a medieval prop in the neon city */, twistSub: '', twistGoal: 'Stay in the light', lost: 'Back to the light', in: 'In the light',
    },
    trial: {
      task: `${cap(foe)}'s people are running for the gate. Stop every one.`, goal: 'Hold the gate', start: '', startSub: '',
      past: 'One gets past you.', held: 'The gate holds.',
    },
  };
  const out = {}; for (const k of Object.keys(D)) { out[k] = { ...D[k] }; for (const [kk, v] of Object.entries(own[k] || {})) if (v) out[k][kk] = v; for (const kk of Object.keys(out[k])) out[k][kk] = ww(out[k][kk]); }
  return out;
}

/* the chapter card and goal lines, set before chapter II's card shows */
export function prepare(f) {
  const st = f.story; if (!st) return;
  const L = lines(f);
  /* the chapter's end is said once (secondWon; guardLock and holdGate say no line of their own at the end) */
  /* the chapter is named for its own task: chapter I broke the chains, chapter II breaks a seal */
  if (st.shape === 'chains' && actor(f) !== null) { st.second = { ...st.second, title: L.chains.title, line: L.chains.task }; st.goal = L.chains.goal; st.secondWon = L.chains.open; }
  if (st.shape === 'trial') { st.second = { ...st.second, line: L.trial.task }; st.goal = L.trial.goal; }
  /* the twist lines: freedom and wonder */
  if (st.twist && st.shape === 'chains') st.twist = { ...st.twist, line: L.chains.twist, sub: L.chains.twistSub, goal: L.chains.twistGoal, done: L.chains.freed };
  if (st.twist && st.shape === 'dark') st.twist = { ...st.twist, line: L.dark.twist, sub: L.dark.twistSub, goal: L.dark.twistGoal, in: L.dark.in, done: null };
  try { Q2.prepare(f); } catch (err) { console.warn('quest prepare', err); } /* the new beats' lines */
}

/* a foe that runs for a place (the worker, the gate) and turns on the hero when the hero comes near or strikes it */
function runFor(f, foe, at, { reach = 1.5, near = 4.2, speed = 3.6, onReach }) {
  const R = { going: true, cd: 0 }; foe.going = true;
  foe.drive = (dt, moveTo, idle) => {
    if (!R.going) return false;
    const dh = Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z);
    if (dh < near || foe.hp < foe.maxHp) { R.going = false; foe.going = false; return false; }
    const p = typeof at === 'function' ? at() : at; const dx = p.x - foe.pos.x; const dz = p.z - foe.pos.z; const d = Math.hypot(dx, dz) || 1;
    foe.yaw = Math.atan2(dx, dz);
    if (R.cd > 0) { R.cd -= dt; if (R.cd < 1.8) foe.actor.play(idle, { fade: 0.25 }); return true; }
    if (d > reach) { moveTo(V(p.x, 0, p.z), speed, 'Jog_Fwd_Loop'); return true; }
    R.cd = onReach(foe, R) ?? 2.6; return true;
  };
  return R;
}

/* ---------- chapter II ---------- */
export async function second(f, ctx) {
  const st = f.story; if (!st) return false;
  if (st.shape === 'chains') return guardLock(f, ctx);
  if (st.shape === 'trial') return holdGate(f, ctx);
  if (st.shape === 'vigil' && ctx.preFire) return holdFire(f, ctx);
  return false;
}

/* a hold chapter must not be dead air: the camera used to face the foes with the thing held behind it, so the
   player looked at a barrier pole while the companion was off screen. One rule
   for every hold, in every world:
   1. an establishing look: the view turns to the thing held, with the companions by it, before the first foe comes;
   2. the foes come from beyond it, so a hero who faces the foes faces the thing held;
   3. the thing changes as the clock runs (the seal glows hotter, the gate's lamps light one by one, the fire grows);
   4. it lasts about 30 s. */
function establish(f, at, { dur = 2.4, y = 1.0 } = {}) {
  const aim = V(at.x, y, at.z); let t = 0;
  const off = f.world.addUpdater((dt) => {
    t += dt; if (t > dur || f.over || !f.active) { off(); return; }
    if (f.lock && t > 0.9) return; /* a foe the hero locked onto wins after the first look */
    const k = Math.sin(Math.PI * clamp(t / dur, 0, 1)) * 0.6 + 0.4;
    f.turnToward(aim, Math.min(1, dt * 3.4 * k));
    const d = Math.max(1, Math.hypot(aim.x - f.pos.x, aim.z - f.pos.z)); const pw = clamp(Math.atan2(aim.y - 2.0, d), -0.35, 0.25); f.pitch += (pw - f.pitch) * Math.min(1, dt * 2.5 * k);
  });
  return off;
}
/* a place for a foe beyond `at` as the hero sees it: dist m past it, spread up to `spread` rad either side */
function beyond(f, at, dist, spread, i = 0) {
  const a0 = Math.atan2(at.x - f.pos.x, at.z - f.pos.z); const a = a0 + ((i % 3) - 1) * spread * 0.8 + (Math.random() - 0.5) * spread * 0.5;
  const p = V(at.x + Math.sin(a) * dist, 0, at.z + Math.cos(a) * dist); if (p.length() > FIELD) p.setLength(FIELD); return p;
}
/* the field turns its view to the held thing again when it has been off screen for a while and no foe is locked */
function keepInView(f, at, st, dt, y = 1.0) {
  const v = V(at.x, y, at.z).project(f.world.camera); const seen = v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.9;
  st.off = seen ? 0 : (st.off || 0) + dt;
  if (st.off > 3.5 && !f.lock && !st.turning) { st.turning = true; establish(f, at, { dur: 1.4, y }); setTimeout(() => { st.turning = false; st.off = 0; }, 1500); }
}
/* a small glow that heats with progress: dim red at 0, white-hot gold at 1 */
function heatGlow(f, at, y) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xff5020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.0 }));
  sp.position.set(at.x, y, at.z); sp.renderOrder = 8; f.world.scene.add(sp); (f.tethers ||= []).push(sp);
  const cold = new THREE.Color(0xc02a08); const hot = new THREE.Color(0xfff0b0);
  return { sp, set(k, t) { const fl = 0.9 + 0.1 * Math.sin(t * 17) * Math.sin(t * 5.3); sp.material.color.copy(cold).lerp(hot, k).multiplyScalar(1.2 + 1.6 * k); sp.material.opacity = (0.25 + 0.75 * k) * fl; sp.scale.setScalar(0.5 + 1.5 * k); } };
}

/* freedom II: the freed one kneels at a sealed bar across the way out and breaks the seal (about 26 s while no foe is at
   them); foes come from beyond the seal and go for the worker; the hero keeps them off. A blow on the worker sets it back. */
async function guardLock(f, { set, finish }) {
  const w = actor(f); if (!w) return false;
  const L = lines(f).chains; const fwd = f.forward(); const right = V(-fwd.z, 0, fwd.x);
  /* the seal stands 7 m ahead and a little aside: the view starts on it with the worker beside it */
  const at = V().copy(f.pos).addScaledVector(fwd, 7).addScaledVector(right, 1.6); if (at.length() > FIELD - 4) at.setLength(FIELD - 4);
  const lock = f.addProp('anchor', at.x, at.z, 999); lock.kind = 'lock'; /* not struck by the hero (hitProps takes anchors only) */
  const toHero = V(f.pos.x - at.x, 0, f.pos.z - at.z).normalize(); const side = V(-toHero.z, 0, toHero.x);
  /* the worker kneels on the hero's side of the seal and a step aside, so the body never hides the seal */
  const spot = V(at.x + toHero.x * 1.2 + side.x * 0.9, 0, at.z + toHero.z * 1.2 + side.z * 0.9);
  w.state = 'work'; w.workAt = spot; w.sp.position.x = spot.x; w.sp.position.z = spot.z;
  const glow = heatGlow(f, at, 1.5);
  let prog = 0; let hits = 0; let t = 0; let spawnT = 3.2; let wave = 0; const LEN = 26; let flinch = 0; const vs = {};
  establish(f, at, { dur: 2.6, y: 1.2 });
  f.hud.line?.(L.start, L.startSub, 2800); sfx('clangBig', { gain: 0.35 });
  f.director?.event?.('The freed one works at the seal on the way out. The hero must hold the foes off.');
  const seen = new Set();
  const strike = (foe) => {
    foe.actor.play('Sword_Regular_A', { loop: false, fade: 0.08, restart: true });
    setTimeout(() => {
      if (foe.gone || foe.state === 'dead' || w.state !== 'work') return;
      prog = Math.max(0, prog - 0.1); hits++; flinch = 1.4; w.flare = 1; sfx('hit', { gain: 0.5 }); sfx('hurt', { gain: 0.3 });
      f.sparks?.(V(w.sp.position.x, 0.9, w.sp.position.z), V(0, 0.5, 0), 0xffc890, 12, 4);
      if (hits === 1 || hits % 3 === 0) f.hud.line?.(L.hit, L.hitSub, 2000);
    }, 260);
    return 2.6;
  };
  const claim = () => { for (const foe of f.foes) { if (seen.has(foe) || foe.state === 'dead' || foe.boss) continue; seen.add(foe); runFor(f, foe, () => w.sp.position, { onReach: strike }); } };
  /* two foes at a time, from beyond the seal (the hero turns to them and sees the seal and the worker) */
  const send = () => { const types = [['minion', 'rogue'], ['minion', 'warrior'], ['rogue', 'minion'], ['warrior', 'minion']][wave % 4]; wave++; f.spawnWave(null, { quiet: true, spec: types.map((ty, i) => [ty, 1, { place: () => beyond(f, at, 9 + i * 1.5, 0.7, i + wave) }]) }); };
  f.task = { update: (dt) => {
    t += dt; claim();
    const p = w.sp.position; p.x += (spot.x - p.x) * Math.min(1, dt * 4); p.z += (spot.z - p.z) * Math.min(1, dt * 4); p.y = 0;
    flinch = Math.max(0, flinch - dt);
    if (w.c) { w.c.mood = { clip: flinch > 0 ? 'Hit_Knockback' : 'Fixing_Kneeling', until: (w.c.t || 0) + 0.5, move: false }; w.c.focus = { x: at.x, z: at.z, until: (w.c.t || 0) + 0.5 }; }
    const atWorker = f.foes.some((x) => x.state !== 'dead' && x.state !== 'spawn' && Math.hypot(x.pos.x - p.x, x.pos.z - p.z) < 2.4);
    if (!atWorker && flinch <= 0 && t > 2.2) prog = Math.min(1, prog + dt / LEN);
    glow.set(prog, f.clock);
    /* sparks fly from the seal while the worker is at it, more as it heats */
    if (!atWorker && flinch <= 0 && Math.random() < dt * (2 + prog * 8)) f.sparks?.(V(at.x - toHero.x * 0.2, 1.2 + Math.random() * 0.6, at.z - toHero.z * 0.2), V(toHero.x, 0.6, toHero.z), 0xffc070, 4 + Math.round(prog * 6), 3);
    spawnT -= dt; if (spawnT <= 0 && prog < 0.88 && !f.spawning && f.foes.filter((x) => x.state !== 'dead').length < 3) { spawnT = 6.5; send(); }
    keepInView(f, at, vs, dt, 1.2);
    set(atWorker ? L.hit : `${L.progress || 'The seal'}  ·  ${Math.round(prog * 100)}%`, prog); /* the header is "Guard Wren"; the line under it said "4% · Guard Wren" again */
    if (prog >= 1) {
      try { lock.h?.break?.(V(-toHero.x, 0, -toHero.z)); } catch { /* fallback post */ }
      lock.hp = 0; f.world.flash(0.3); sfx('breakPart'); sfx('soul'); f.slow = Math.max(f.slow || 0, 0.3); glow.sp.visible = false;
      f.embers?.(V(at.x, 1.4, at.z), 0xffd08a, 60, 4);
      w.state = 'with'; w.workAt = null; w.flare = 1; if (w.c) w.c.mood = { clip: 'Yes', until: (w.c.t || 0) + 2, react: true };
      f.purge(); finish(true); /* fight.js says st.secondWon ("The seal breaks.") once */
    }
  } };
  return true;
}

/* glory II: the gate the hero walked through stands behind them (journey.js leaves it at the field, walls either side).
   The hero turns to face it from 5 m; runners come from beyond it and try to get through the opening; one that gets
   through is past. The gate stays between the hero and the foes, so it is in view the whole time. 30 s.
   Five lamps on the gate light one by one as the clock runs; a runner that gets through puts one out. */
async function holdGate(f, { set, finish }) {
  const L = lines(f).trial; const fwd = f.forward();
  const G = f.fieldGate ? V(f.fieldGate.x, 0, f.fieldGate.z) : V().copy(f.pos).addScaledVector(fwd, -6);
  const away = V(f.pos.x - G.x, 0, f.pos.z - G.z).normalize(); const side = V(-away.z, 0, away.x);
  const gw = f.fieldGate?.w || 2.6;
  let t = 0; let past = 0; let held = 0; let spawnT = 2.6; const LEN = 30; let k = 0; const vs = {};
  const seen = new Set();
  /* the hero steps to 6.5 m in front of the gate and looks at it */
  { const want = V(G.x + away.x * 5, 0, G.z + away.z * 5); let gt = 0; const from = f.pos.clone(); const off = f.world.addUpdater((dt) => { gt = Math.min(1, gt + dt / 1.2); const e = gt * gt * (3 - 2 * gt); f.pos.x = from.x + (want.x - from.x) * e; f.pos.z = from.z + (want.z - from.z) * e; if (gt >= 1) off(); }); }
  establish(f, G, { dur: 2.8, y: 2.6 });
  const lamps = [0, 1, 2, 3, 4].map((i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(0xffc27a).multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const o = (i - 2) / 2 * (gw + 0.6); sp.position.set(G.x + side.x * o, 3.6 + (i === 2 ? 0.5 : i % 2 ? 0.25 : 0), G.z + side.z * o); sp.scale.setScalar(0.9); sp.renderOrder = 8;
    f.world.scene.add(sp); (f.tethers ||= []).push(sp); return { sp, k: 0 };
  });
  f.hud.line?.(L.start, L.startSub, 2800); sfx('roar', { gain: 0.5 });
  f.director?.event?.('Foes run for the gate behind the hero. None may pass.');
  const gateAt = (foe) => { const o = foe._gateOff || 0; return { x: G.x + side.x * o + away.x * 1.6, z: G.z + side.z * o + away.z * 1.6 }; }; /* through: 1.6 m past the opening on the hero's side */
  const through = (foe) => {
    past++; sfx('dodge'); sfx('clangBig', { gain: 0.4 }); f.hud.toast?.(L.past); f.shake = Math.max(f.shake || 0, 0.25);
    f.sparks?.(V(foe.pos.x, 1.6, foe.pos.z), V(-away.x, 0.4, -away.z), 0xffc27a, 24, 5);
    try { f.journeyGate?.flare?.(); } catch { /* no handle */ }
    /* through the gate: it is gone from the field (not a kill) */
    try { f.releaseToken?.(foe); foe.state = 'dead'; foe.group.members = foe.group.members.filter((x) => x !== foe); foe.actor.dispose(); foe.gone = true; if (f.lock === foe) f.lock = null; f.foes = f.foes.filter((x) => x !== foe); } catch { /* gone */ }
    return 9;
  };
  /* runners come from beyond the gate (the far side, by the keep) and make for the opening */
  const spawnRunner = async () => {
    const types = ['minion', 'rogue', 'minion', 'warrior']; const type = types[k % types.length]; const s = k % 2 ? -1 : 1; k++;
    const p = V().copy(G).addScaledVector(away, -(5 + Math.random() * 2)).addScaledVector(side, s * (1 + Math.random() * 3)); if (p.length() > FIELD + 3) p.setLength(FIELD + 3);
    await f.spawnWave(null, { quiet: true, spec: [[type, 1, { place: () => p.clone() }]] });
  };
  /* the place to hold: the hero's side of the opening (the bot keeps to it; a hero who chases runners through the gate
     loses sight of it) */
  f.chapterGoal = { x: G.x + away.x * 4.0, z: G.z + away.z * 4.0, r: 1.8, hold: true, act: Q2.QN(f) ? 'Stop them at the gate' : 'Stand here and stop them at the gate' }; /* act = the prompt at the place */
  f.task = { update: (dt) => {
    t += dt;
    for (const foe of f.foes) { if (seen.has(foe) || foe.state === 'dead' || foe.boss) continue; seen.add(foe); foe._gateOff = (Math.random() - 0.5) * gw * 0.8; runFor(f, foe, () => gateAt(foe), { reach: 1.0, near: 3.4, speed: 3.0, onReach: through }); }
    spawnT -= dt; const alive = f.foes.filter((x) => x.state !== 'dead').length;
    if (t < LEN - 4 && spawnT <= 0 && !f.spawning && alive < 3) { spawnT = t < 10 ? 3.4 : 2.6; spawnRunner(); }
    const lit = clamp(Math.floor((t / LEN) * 5.0001) - past, 0, 5);
    lamps.forEach((l, i) => { const on = i < lit ? 1 : 0; l.k += (on - l.k) * Math.min(1, dt * 3); l.sp.material.opacity = l.k * (0.85 + 0.15 * Math.sin(f.clock * 9 + i)); l.sp.scale.setScalar(0.5 + l.k * 0.7); });
    keepInView(f, G, vs, dt, 2.4);
    held = Math.max(0, Math.ceil(LEN - t));
    set(`${held} second${held === 1 ? '' : 's'}  ·  ${past} through`, clamp(t / LEN, 0, 1));
    if (Q2.gateLost(f, past, t)) { f.purge(); f.chapterGoal = null; f.hud.line?.('The gate is lost.', '', 2400); finish(false); return; } /* three through and it is lost */
    if (t >= LEN) { f.purge(); f.chapterGoal = null; const st = f.story; if (st) st.secondWon = past === 0 ? L.held : `${past === 1 ? 'One' : cap(['', 'one', 'two', 'three', 'four', 'five'][past] || String(past))} got past.`; /* one sentence */ finish(true); }
  } };
  return true;
}

/* protect II: the fire the walk lit, with the companions sitting by it. The view starts on it; foes come from beyond it
   and go for the fire; the fire grows from a small flame to a full blaze as the night holds (30 s). It dies if the foes
   stay at it, or if the hero walks away. */
async function holdFire(f, { set, finish, preFire: fire }) {
  const st = f.story; const LEN = 30; let t = 0; let spawnT = 3.4; let wave = 0; const vs = {};
  for (const w of f.wisps) w.state = 'hearth';
  f.hearth = fire; fire.hp = 100;
  establish(f, fire.pos, { dur: 2.8, y: 0.9 });
  f.director?.event?.('Foes come out of the night for the fire. The hero holds it.');
  const send = () => { const types = [['rogue', 'minion'], ['minion', 'minion', 'warrior'], ['rogue', 'warrior'], ['minion', 'rogue', 'minion']][wave % 4]; wave++; f.spawnWave(null, { quiet: true, spec: types.map((ty, i) => [ty, 1, { place: () => beyond(f, fire.pos, 9.5 + i, 0.9, i + wave) }]) }); };
  f.task = { update: (dt) => {
    t += dt;
    const away = Math.hypot(f.pos.x - fire.pos.x, f.pos.z - fire.pos.z) > 6.5; const near = f.foes.filter((x) => x.state !== 'dead' && x.state !== 'spawn' && Math.hypot(x.pos.x - fire.pos.x, x.pos.z - fire.pos.z) < 2.4).length;
    fire.hp -= dt * ((away ? 5 : 0) + near * 2.2);
    /* the blaze: it grows with the clock (0.45 to 1), and is beaten down while foes are at it */
    const grow = 0.45 + 0.55 * clamp(t / LEN, 0, 1); const life = clamp(fire.hp / 100, 0, 1);
    if (fire.h) { fire.args.hp = Math.min(grow, life); fire.args.threatened = near > 0; fire.args.away = away; } else fire.flame.scale.setScalar(0.5 + 0.9 * Math.min(grow, life) + Math.sin(f.clock * 9) * 0.06);
    spawnT -= dt; if (spawnT <= 0 && t < LEN - 5 && !f.spawning && f.foes.filter((x) => x.state !== 'dead').length < 3) { spawnT = 6.5; send(); }
    keepInView(f, fire.pos, vs, dt, 0.9);
    const n = Math.max(0, Math.ceil(LEN - t));
    set(away ? f.ww('Go back inside the ring') : near ? f.ww('They are at the fire: hit them') : `${n} s left`, /* plain words for what to do */ away || near ? life : 1 - t / LEN);
    if (fire.hp <= 0) { fire.args && (fire.args.hp = 0, fire.args.away = false); try { fire.h?.die(); } catch { /* fallback fire */ } f.hearth = null; for (const w of f.wisps) w.state = 'with'; finish(false); }
    else if (t >= LEN) { fire.args && (fire.args.away = false, fire.args.threatened = false, fire.args.hp = 1); try { fire.h?.flare(); } catch { /* fallback fire */ } f.hearth = null; for (const w of f.wisps) { w.state = 'with'; w.flare = 1; } f.purge(); finish(true); }
  } };
  void st;
  return true;
}

/* ---------- chapter III (the twist in the last fight) ---------- */
export function twist(f, { tw, spot, line, sub, words }) {
  const st = f.story; if (!st) return false;
  if (Q2.twist(f, { tw, spot, line, sub, words })) return true;
  if (Q2.boundBoss(f)) return false; /* freedom keeps the bound enemy (fight.js anchors) */
  if (st.shape === 'chains') return rebind(f, { tw, spot, line, sub, words });
  if (st.shape === 'dark') return carryLight(f, { tw, line, sub, words });
  return false;
}

/* freedom III: below 70% the enemy chains the freed one again, at the edge of the field; the hero's blows glance off while
   they are bound; standing by them for 2.5 s breaks the chain */
function rebind(f, { tw, spot, line, sub, words }) {
  const w = actor(f); if (!w) return false;
  let state = 'wait'; let hold = 0; const HOLD = 2.5; let at = null;
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(f.world.biome?.accent ?? 0xff4a12).multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const geo = new THREE.CylinderGeometry(0.04, 0.04, 1, 5, 1, true); geo.translate(0, 0.5, 0);
  const chain = new THREE.Mesh(geo, mat); chain.frustumCulled = false; chain.visible = false; f.world.scene.add(chain); (f.tethers ||= []).push(chain);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.95, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0b0), transparent: true, opacity: 0, depthWrite: false, fog: false }));
  ring.visible = false; f.world.scene.add(ring); (f.tethers ||= []).push(ring);
  const UP = V(0, 1, 0); const bp = V(); const dir = V();
  f.twistFn = (dt, hp) => {
    if (state === 'wait') {
      if (hp >= 0.7) return;
      state = 'bound'; at = spot(1.5, (Math.random() < 0.5 ? -1 : 1) * 7.5); w.state = 'work'; w.workAt = at; f.bossMul = 0.35;
      sfx('clangBig'); f.shake = Math.max(f.shake || 0, 0.4); line(tw.line, tw.sub, 3200); establish(f, at, { dur: 1.8, y: 1.2 }); /* the view goes to Wren as the chain is thrown */
    }
    if (state === 'bound') {
      const p = w.sp.position; p.x += (at.x - p.x) * Math.min(1, dt * 2); p.z += (at.z - p.z) * Math.min(1, dt * 2); p.y = 0;
      if (w.c) w.c.mood = { clip: 'Hit_Knockback', until: (w.c.t || 0) + 0.4, move: false };
      const b = f.bossPoint(bp);
      if (b) { chain.visible = true; chain.position.set(p.x, 1.1, p.z); dir.subVectors(b, chain.position); const len = dir.length() || 1; chain.scale.set(1, len, 1); chain.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / len)); mat.opacity = 0.6 + Math.sin(f.clock * 7) * 0.25; } else chain.visible = false;
      const d = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); const near = d < 2.6; f.chapterGoal = { x: p.x, z: p.z, r: 1.8, act: 'Stand here to break the chain', fill: hold / HOLD }; /* the bot (tools/lib/quest-driver.mjs) stands there */
      ring.visible = true; ring.position.set(p.x, 0.06, p.z); ring.material.opacity = 0.35 + (near ? 0.4 : 0.15 * Math.sin(f.clock * 4));
      hold = near ? hold + dt : Math.max(0, hold - dt * 1.5);
      sub(near ? `${f.ww ? f.ww('Breaking the chain') : 'Breaking the chain'} · ${Math.round(hold / HOLD * 100)}%` : tw.goal || 'Free them');
      if (hold >= HOLD) {
        state = 'free'; f.chapterGoal = null; chain.visible = false; ring.visible = false; w.state = 'with'; w.workAt = null; w.flare = 1; f.bossMul = 1.25;
        f.world.flash(0.3); sfx('breakPart'); sfx('soul'); line(tw.done, '', 2600); sub(words);
        if (w.c) w.c.mood = { clip: 'Yes', until: (w.c.t || 0) + 2, react: true };
      }
    }
  };
  return true;
}

/* wonder III: the dark comes down; a companion walks a slow ring round the field with a lantern raised. In its light the
   hero's blows land (x1.4); out of it they glance (x0.6) and the dark closes in */
function carryLight(f, { tw, line, sub, words }) {
  const w = actor(f) || (f.wisps || []).find((x) => x.state === 'with') || null;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(0xffc27a).multiplyScalar(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.setScalar(1.3); f.world.scene.add(glow);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(5.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb060).multiplyScalar(0.35), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  f.world.scene.add(pool);
  /* the edge of the light: a warm ring on the ground (a day world keeps its day, so the dark alone does not show the pool) */
  const edge = new THREE.Mesh(new THREE.RingGeometry(4.95, 5.2, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.45), transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false, fog: false }));
  edge.renderOrder = 3; f.world.scene.add(edge);
  (f.tethers ||= []).push(glow, pool, edge); /* no new light: a light added mid-fight recompiles every lit material */
  /* The light is 5 m wide and Wren keeps 3 m from the hero, drifting round
     them, so the fight stays in it; outside it blows still land at 0.75 (was 0.6), inside at 1.5 (was 1.4). A competent
     player ends the chapter in 60 to 90 s. */
  const R = 3.0; let a = Math.atan2(f.pos.x, f.pos.z); let inK = 0; let started = false; let t0 = 0; const P = V(); const Q = V();
  f.twistFn = (dt) => {
    if (!started) { started = true; t0 = f.clock; f.darkness(0.85, 6); setTimeout(() => line(tw.line, tw.sub, 3200), 1400); if (w) { w.state = 'work'; } }
    a += dt * 0.22; /* Wren drifts round the hero at 3 m, at walking pace (1.8 m/s at most) */
    Q.set(f.pos.x + Math.sin(a) * R, 0, f.pos.z + Math.cos(a) * R); if (Q.length() > FIELD - 1) Q.setLength(FIELD - 1);
    if (w) { const p = w.sp.position; const dx = Q.x - p.x; const dz = Q.z - p.z; const d = Math.hypot(dx, dz); const st = Math.min(d, 1.8 * dt * clamp(d / 1.5, 0.3, 1.6)); if (d > 1e-4) { p.x += dx / d * st; p.z += dz / d * st; } p.y = w.c ? 0 : 1.4; if (w.c) w.c.mood = null; P.set(p.x, 0, p.z); } else P.copy(Q);
    glow.position.set(P.x, 2.3, P.z); pool.position.set(P.x, 0.05, P.z); edge.position.set(P.x, 0.07, P.z); edge.material.opacity = 0.55 + 0.15 * Math.sin(f.clock * 3);
    const fl = 0.9 + 0.1 * Math.sin(f.clock * 9) * Math.sin(f.clock * 3.1);
    glow.material.opacity = 0.9 * fl; pool.material.opacity = 0.55;
    const inside = Math.hypot(f.pos.x - P.x, f.pos.z - P.z) < 5.2; f.chapterGoal = { x: P.x, z: P.z, r: 3.6, act: 'Stay in the light', quiet: inside };
    inK += ((inside ? 1 : 0) - inK) * Math.min(1, dt * 3);
    if (f.clock - t0 > 1.2) f.darkness(0.85 - inK * 0.65, 6 + inK * 6);
    f.bossMul = 0.75 + inK * 0.75;
    sub(inside ? tw.in || 'In the light' : (tw.goal || 'Stay in the light'));
    void words;
  };
  return true;
}

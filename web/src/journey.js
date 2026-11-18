/* Chapter I on the open land: a walk, not a fight. One route for every quest, a different verb for each shape.
   The hero leaves the camp spot and walks about 140 m along the open line toward the nemesis (lands.js keeps that line
   low and free of big props). A tall soft shaft of light marks the end. What happens on the way depends on the shape:
     farlight (wonder)  no pickups. A small light (or the world's songbird, paper lantern, orb) leads 9 m ahead; it
                        stops at three places and shows what lies there; one watcher, one ambush (updateLure).
     hearth   (protect) the first companion walks with the hero to a cold hearth; three bundles of wood to gather;
                        two lone foes come for the companion, not the hero (it is knocked down, never lost).
     trail    (revenge) a chase from the first second. The scout stands 11 m ahead and bolts as the card goes; it
                        runs past its three signs to its camp; a hit makes it stumble; caught or at its camp it fights.
     cage     (freedom) someone the enemy keeps, in a cage at the far end; three chained anchors hold it shut, one guard
                        each; the hero breaks them with the weapon; at the cage the lock breaks and the freed one follows.
     gate     (glory)   a marked road to a gate; watchers along it turn as the hero passes; three named duels (the first 20 m from
                        the start), each in a ring of watchers who cheer a hit; each win cuts the hero's name into a marker.
   At the end: a moment, a second of black, and the hero stands at the arena centre (every later chapter assumes the origin).
   fight.js calls startJourney(fight) and reads fight.journey.gy(x, z) / fight.journey.lead(tgt, clock, wisp). */
import * as THREE from 'three';
import { dotTexture } from './world.js';
import { sfx } from './sfx.js';
import { setpiece, kinds as setKinds, hummock } from './props/setpieces.js';
import { FOES, byId } from '/game/kit.mjs';
import { prepare as prepareChapters } from './chapters.js'; /* chapters II/III that ask for a new act; the card lines are set now */
import { stakeParts } from './props/stakes.js'; /* designed trail stakes per world */
import * as Q2 from './quest2.js'; /* the nine-row plan (new beats on the walk) */
import { makeNav } from './journey-nav.js'; /* the walk's route finder (the way round a wall to its gate) */

const NEM = Math.atan2(-84, 30); /* the line toward the nemesis, as lands.js measures it (x = cos, z = sin) */
const DIST = 140;
const CELL = 2;
const GATHER_R = 2.5;
const GATHER_T = 1.6;
const FIND_AT = [36, 74, 108];
/* the three challengers on the glory road have names of their world */
const CHALLENGERS = { dark: ['Garrow', 'Wren the Grey', 'Captain Hollis'], storybook: ['Sir Bramble', 'Mags the Miller', 'Sir Pellam'], edo: ['Hayato', 'Ito of the Spear', 'Captain Sora'], neon: ['Vex', 'Kilo', 'Captain Rook'], frontier: ['Jed Cutter', 'Lou Haskett', 'Captain Pike'] };
const MODE_OF = { farlight: 'farlight', hearth: 'hearth', trail: 'trail', cage: 'cage', 'road-gate': 'gate' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (k) => k * k * (3 - 2 * k);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* soft light shaft: bright down the middle, soft at the edges, fading up its height */
const SHAFT_VERT = 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vY = uv.y; gl_Position = projectionMatrix * viewMatrix * wp; }';
const SHAFT_FRAG = 'uniform vec3 uCol; uniform float uK; uniform float uTime; uniform float uPow; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float fade = smoothstep(0.0, 0.02, vY) * pow(1.0 - vY, uPow); float fl = 0.86 + 0.14 * sin(uTime * 1.3 + vY * 11.0); gl_FragColor = vec4(uCol * (e * fade * uK * fl), 1.0); }';
/* a pool of light on the ground: radial falloff */
const POOL_FRAG = 'uniform vec3 uCol; uniform float uK; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.4); gl_FragColor = vec4(uCol * a * uK, 1.0); }';
const POOL_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
/* the end of each walk: the colour of its shaft (and how strong), so the far mark reads as a different thing per quest */
const END_LOOK = {
  farlight: { o: 0xffd49a, i: 0xfff0d6, k: 1 },
  hearth: { o: 0xffa060, i: 0xffd8a8, k: 0.62 },
  trail: { o: 0xff5a32, i: 0xff9a70, k: 0.42 },
  cage: { o: 0x8ab0ff, i: 0xd8e6ff, k: 0.7 },
  gate: { o: 0xffc070, i: 0xfff0d0, k: 0.8 },
};

export async function startJourney(fight) {
  try { await fight.journeyWarm; } catch { /* the walk goes on cold */ }
  const j = new Journey(fight);
  if (!document.body.classList.contains('qcard')) { j.build(); return j; } /* no quest card over the world (a skip): built in one go, nothing half made on screen */
  /* under the "HERE'S YOUR QUEST!" card (opaque, #qc) the 3D is not drawn (world.p5Hold, read in quality.js): the walk is
     built in slices of about 10 ms a frame (one 260 ms frame at phone x4 before), then every program of the scene links in the
     background (compileAsync, with the walk's new lights already in) and the new textures go to the GPU one a frame, each
     decoded off the main thread first. The hold ends when that is done or the card goes, whichever is first. */
  const w = j.w; const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const covered = () => document.body.classList.contains('qcard');
  w.p5Hold = true;
  try {
    let t0 = performance.now(); const it = j.steps();
    for (let s = it.next(); !s.done; s = it.next()) if (performance.now() - t0 > 10 && covered()) { await frame(); t0 = performance.now(); } /* the card gone (a skip): the rest at once */
  } catch (err) { w.p5Hold = false; throw err; }
  warmUnder(j, covered).catch(() => { /* drawn and linked on first use, as before */ }).finally(() => { w.p5Hold = false; });
  return j;
}
async function warmUnder(j, covered) {
  const w = j.w; const R = w.renderer; await new Promise((r) => requestAnimationFrame(() => r())); if (!covered()) return;
  const hidden = (j.stops || []).filter((fd) => fd.g && !fd.g.visible); for (const fd of hidden) fd.g.visible = true;
  let p = null; try { p = R.compileAsync ? R.compileAsync(w.scene, w.camera) : null; } finally { for (const fd of hidden) fd.g.visible = false; }
  const gone = new Promise((r) => { const iv = setInterval(() => { if (!covered()) { clearInterval(iv); r(); } }, 16); });
  if (p) await Promise.race([p.catch(() => {}), gone, new Promise((r) => setTimeout(r, 2500))]);
  if (covered()) await sendTextures(w.scene, R, covered);
}
/* every texture under root not on the GPU yet: an <img> is decoded first (img.decode, off the main thread), then initTexture, one a frame, while ok() */
async function sendTextures(root, R, ok = () => true) {
  if (!R?.initTexture) return; const list = new Set();
  root.traverse((o) => { for (const m of [].concat(o.material || [])) { for (const k in m) { const t = m[k]; if (t?.isTexture && !t.isRenderTargetTexture) list.add(t); } for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture && !u.value.isRenderTargetTexture) list.add(u.value); } });
  for (const t of list) {
    if (!ok()) return;
    if (R.properties.get(t).__webglInit || !t.image) continue;
    const im = t.image; if (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement) { if (!im.complete) continue; try { await im.decode(); } catch { continue; } }
    if (R.properties.get(t).__webglInit) continue; R.initTexture(t);
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
}
/* The first foe on a walk compiled about 7 shader programs on the frame it came (150 ms quiet, seconds under load: the
   stall nobody traced). fight.js calls this while the chapter I card is up: one hidden foe of each kind the walk uses is
   made far behind the hero, its programs compile without blocking (compileAsync), and it is removed. */
/* a world with no props entry gets the fire its words name (Edo says "the brazier" and stood the dark world's pyre) */
export const FIRE_STYLE = { frontier: 'campfire', edo: 'brazier' };
const WARM = { farlight: [['rogue']], hearth: [['rogue']], trail: [['rogue']], cage: [['minion'], ['rogue'], ['warrior']], 'road-gate': [['rogue'], ['warrior'], ['warrior', true], ['minion']] };
export async function warmJourney(f) {
  const list = WARM[f.story?.first?.id]; if (!list) return;
  const R = f.world.renderer; const warm = []; const fwd = f.forward(); const pos = new THREE.Vector3(f.pos.x - fwd.x * 70, 0, f.pos.z - fwd.z * 70);
  for (const [type, captain] of list) {
    const base = byId(f.kit?.FOES || FOES, type) || byId(FOES, type); const def = { ...base, own: true };
    const g = { id: 'warm', def, members: [], size: 1, tactic: 'charge', last: null, softStreak: 0, called: true, since: -9, captain: !!captain, place: () => pos.clone(), hold: true };
    try { const foe = await f.spawnFoe(g, 0, 1); foe.hold = true; warm.push(foe); } catch (err) { console.warn('journey warm', err); }
  }
  /* the world's own walk props: one of each, hidden far behind, compiled with the foes (their programs are shared by type) */
  const pieces = []; let WP = f.WP;
  if (!WP && f.kit?.id && f.kit.id !== 'dark') { try { WP = await import(`./props/${f.kit.id}.js`); } catch { WP = null; } }
  if (WP) {
    const at = new THREE.Vector3(pos.x, 0, pos.z); const mk = [
      () => WP.anchor?.(f.world.scene, { accent: 0xffffff, to: at.clone().setY(2), index: 0 }), () => WP.cage?.(f.world.scene, {}), () => WP.beacon?.(f.world.scene, { index: 0 }),
      () => WP.kindling?.(f.world.scene, {}), () => WP.marker?.(f.world.scene, { name: 'x' }), () => WP.gate?.(f.world.scene, {}), () => WP.sign?.(f.world.scene, { i: 0 }), () => WP.sign?.(f.world.scene, { i: 1 }), () => WP.sign?.(f.world.scene, { i: 2 }),
      () => WP.waymark?.(f.world.scene, { kind: 'stop' }), () => WP.waymark?.(f.world.scene, { kind: 'goal' })];
    for (const m of mk) { try { const h = m(); if (h) { h.group.position.copy(at); h.update?.(0.016, { k: 1, near: 0, t: 0, charge: 0, lit: false }); pieces.push(h); } } catch (err) { console.warn('warm piece', err); } }
  }
  try { if (R?.compileAsync) await R.compileAsync(f.world.scene, f.world.camera); else R?.compile(f.world.scene, f.world.camera); } catch (err) { console.warn('prewarm', err); }
  /* kept, hidden, until the walk ends: a disposed material frees its program and the next prop would compile it again */
  for (const h of pieces) h.group.visible = false; f.warmPieces = pieces;
  for (const foe of warm) { f.foes = f.foes.filter((x) => x !== foe); try { foe.fdress?.dispose?.(); foe.actor.dispose(); } catch { /* gone */ } foe.gone = true; }
}

class Journey {
  constructor(f) {
    this.f = f; const w = f.world; this.w = w;
    const lands = w.lands; const land = lands?.current;
    this.H = (x, z) => lands.groundAt(x, z);
    this.terrain = land?.terrain || null;
    this.level = land?.ctx?.f?.level ?? null;
    this.placed = land?.ctx?.placed || []; this.landSolids = land?.ctx?.solids || [];
    this.r = rng(9173 + (land?.variant || 0) * 31 + (w.biome?.id || '').length * 977);
    this.t = 0; this.found = 0; this.arriving = false; this.done = false; this.lineUntil = 0;
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.tmp3 = new THREE.Vector3();
    this.foes = []; this.handles = [];
    this.mode = MODE_OF[f.story?.first?.id] || 'farlight';
    this.T = f.story?.walk?.[this.mode] || {};
    const ps = { ...(FIRE_STYLE[f.kit?.id] ? { fire: FIRE_STYLE[f.kit.id] } : {}), ...(f.kit?.props || {}) }; this.ps = ps; this.style = ps.fire || 'dark'; /* frontier has no props entry, so its camp fire was the dark world's tall bonfire */
    /* outside the dark world: the world's own props (web/src/props/<world>.js) and no magic light: no shafts, motes or glow */
    this.WP = f.WP || null; this.beams = !this.WP;
    this.accent = w.biome?.accent ?? 0xff4a12;
    if (this.mode !== 'farlight' && !f.QP) throw new Error(`journey ${this.mode}: quest props did not load`);
  }

  /* ---------- the route: heading, bounds, ground cache ---------- */
  wet(h) { return this.level != null && h < this.level - 0.75; }
  /* a place the hero may not walk to: deep water, or ground far below the route (the floor; set after the ground cache) */
  sunk(x, z) { return this.floor != null && this.gy(x, z) < this.floor; }
  P(t, s, out = { x: 0, z: 0 }) { out.x = this.ux * t + this.nx * s; out.z = this.uz * t + this.nz * s; return out; }
  along(x, z) { return x * this.ux + z * this.uz; }
  rough(x, z, r = 2) { const h = this.H(x, z); let m = 0; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; m = Math.max(m, Math.abs(this.H(x + Math.cos(a) * r, z + Math.sin(a) * r) - h)); } return m; }
  /* a stop that sits within a land footprint + 1.5 m moves to the nearest clear, flat, dry place on a ring round it */
  /* ---------- the vantage: one more beat on every walk, not more distance. A high place a little off the line, past the
     middle: the hero stops, the enemy is seen on the horizon, and two short lines are said (built from the answers) ---------- */
  buildView() {
    const at = ({ hearth: 92, trail: 90, cage: 80, gate: 64, farlight: 88 }[this.mode] || 88) * this.k;
    const side = this.side || 1; let sp = this.spot(at, -side, [9, 12, 15], { flatK: -0.25, ts: [-6, -3, 0, 3, 6] });
    if (this.nav && !this.legOK({ x: this.f.pos.x, z: this.f.pos.z }, sp, 2.4)) sp = this.reseat(at, -side, [9, 12, 15], { flatK: -0.25 }, { x: this.f.pos.x, z: this.f.pos.z }, sp, 2.4); /* a high place that a route reaches */
    this.view = { t: at, x: sp.x, z: sp.z, active: false, done: false, busy: false };
  }
  updateView(dt, foeD) {
    const V = this.view; if (!V || V.done || this.arriving) return;
    const f = this.f; const along = this.along(f.pos.x, f.pos.z);
    /* not while a stop short of it is still to find (the dark trail went past sign 2 to the vantage, then back) */
    if (!V.active && along > V.t - 38 && !(this.stops || []).some((s) => !s.got && s.x != null && this.along(s.x, s.z) < V.t - 4)) V.active = true;
    if (V.active && !V.wm && this.WP?.waymark) { const h = this.WP.waymark(this.group, { kind: 'stop', accent: this.accent }); h.wmk = true; this.capMark(h); this.handles.push(h); const ls = Math.sign(V.x * this.nx + V.z * this.nz) || 1; const wx = V.x + this.nx * ls * 2.8; const wz = V.z + this.nz * ls * 2.8; h.group.position.set(wx, this.low(wx, wz, 0.6), wz); V.wm = h; V.k = 0; }
    if (V.wm) { V.k += ((V.busy ? 0 : 1) - V.k) * Math.min(1, dt * 1.5); const W = this.viewArgs || (this.viewArgs = { k: 0, near: 0, t: 0 }); W.k = V.k; W.near = Math.hypot(V.x - this.f.pos.x, V.z - this.f.pos.z) < 9 ? 1 : 0; W.t = this.w.time; V.wm.update(dt, W); }
    if (!V.active || V.busy) return;
    /* gone on far past it (a chase, a fight): the beat is skipped */
    if (along > V.t + 30 || (this.mode === 'trail' && this.scout && this.scout.state !== 'rest')) { V.done = true; return; }
    if (foeD > 12 && Math.hypot(V.x - f.pos.x, V.z - f.pos.z) < 2.6) this.lookout();
  }
  /* the look at the enemy. One holder (this.view), one updater, one release.
     The old beat paused the player for 7.8 s, walked the body 11 m along the route and steered the view with no cue; players
     read that as a fault.
     Now: the player is never paused and the body is never moved. The view only LEANS toward the far figure while the player
     gives no input; a mouse look or a move key lets go at once; a foe, the arrival, a card, the end of the walk or 6.4 s end it. */
  lookout() {
    const V = this.view; if (!V || V.busy || V.done) return; V.busy = true;
    const f = this.f; const L = this.T.view || {};
    const figure = this.figurePoint(); const far = this.P(DIST + 220, 0, { x: 0, z: 0 });
    const look = figure || new THREE.Vector3(far.x, 16, far.z);
    const endLook = new THREE.Vector3(this.lx, this.light.position.y + (this.mode === 'gate' ? 4 : this.mode === 'cage' ? 1.6 : 1.2), this.lz);
    const toEnd = this.mode === 'cage' || this.mode === 'gate' || this.mode === 'hearth' || this.mode === 'farlight';
    const DUR = toEnd ? 6.4 : 4.4; const look0 = f.lookT ?? -9; let t = 0; let k = 0; let let_go = false; let said2 = false; let off = null;
    const release = () => { if (V.done) return; V.done = true; V.busy = false; try { off?.(); } catch { /* gone */ } };
    V.release = release;
    off = this.w.addUpdater((dt) => {
      t += dt;
      /* every exit goes through release(): time, the walk's end, a fight, a card or the arrival taking the view */
      if (t > DUR || this.done || this.disposed || this.arriving || f.over || f.paused || f.stage > 1 || f.deathCam || (this.foeD ?? 99) < 12 || Math.hypot(V.x - f.pos.x, V.z - f.pos.z) > 9) { release(); return; }
      /* the player's own input wins: a mouse look or a move key after the first 0.35 s lets the view go for good */
      const keys = f.keys; const moving = keys && (keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD') || keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight'));
      if ((f.lookT ?? -9) > look0 || (moving && t > 0.35) || f.swing || f.charge || f.dodge || f.lock) let_go = true;
      if (!said2 && toEnd && t > 4.0) { said2 = true; this.react('talk', endLook.x, endLook.z, 2.4); }
      const aim = toEnd && t > 4.0 ? endLook : look;
      k += ((let_go ? 0 : 1) - k) * Math.min(1, dt * (let_go ? 12 : 2.5));
      if (k < 0.01) return;
      const kk = k * Math.min(1, (DUR - t) / 0.8); /* eases out at the end: no snap when the view is handed back */
      f.turnToward(aim, Math.min(1, dt * 1.6 * kk)); const d = Math.max(1, Math.hypot(aim.x - f.pos.x, aim.z - f.pos.z)); const pw = clamp(Math.atan2(aim.y - (f.footY + 2.08), d), -0.35, 0.3); f.pitch += (pw - f.pitch) * Math.min(1, dt * 1.6 * kk);
    });
    try {
      f.director.event('The hero stands on a high place and looks at the enemy on the horizon.');
      this.react('look', look.x, look.z, 4.0);
      this.lineUntil = 0; this.say(L.a || 'The enemy is out there.', L.aSub || '', 3900);
    } catch (err) { console.warn('lookout', err); release(); }
  }
  /* the far figure's middle (two thirds up its height), or null when there is none */
  figurePoint() {
    const nm = this.w.nemesis; if (!nm?.holder || nm.leaving) return null;
    try { const b = new THREE.Box3().setFromObject(nm.holder); if (b.isEmpty() || !Number.isFinite(b.max.y)) return null; const c = b.getCenter(new THREE.Vector3()); return new THREE.Vector3(c.x, b.min.y + (b.max.y - b.min.y) * 0.3, c.z); /* low on the body: the figure stands above the line of text in the middle of the screen */ } catch { return null; }
  }
  clearStops() {
    const R = (c) => (c.w ? Math.hypot(c.w, c.d) / 2 : c.r || 0);
    const hit = (x, z) => this.landSolids.some((c) => Math.hypot(c.x - x, c.z - z) < R(c) + 1.5);
    for (const fd of this.stops) {
      if (!(fd.kind === 'find' || fd.kind === 'sign' || fd.kind === 'post') || !hit(fd.x, fd.z)) continue;
      let best = null; let bc = 1e9;
      for (const r of [3, 5, 7, 9, 12, 15]) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const x = fd.x + Math.cos(a) * r; const z = fd.z + Math.sin(a) * r; if (hit(x, z) || this.wet(this.gy(x, z)) || this.sunk(x, z)) continue; const c = r + this.rough(x, z) * 4; if (c < bc) { bc = c; best = { x, z }; } if (best && r > 5) break; }
      if (best) { fd.x = best.x; fd.z = best.z; fd.y = this.gy(best.x, best.z); }
    }
    /* every stop and the end must stay above the floor (a find in a hollow lowers it): no stop is ever out of reach */
    for (const fd of this.stops) if (fd.x != null) this.floor = Math.min(this.floor, this.gy(fd.x, fd.z) - 1.0);
    if (this.lx != null) this.floor = Math.min(this.floor, this.gy(this.lx, this.lz) - 1.0);
  }
  near(x, z, r) { for (const p of this.placed) { const rr = Math.min(p.rad, 2) + r; if ((p.x - x) ** 2 + (p.z - z) ** 2 < rr * rr) return true; } for (const c of this.landSolids) { const rr = c.r + r + 1; if ((c.x - x) ** 2 + (c.z - z) ** 2 < rr * rr) return true; } return false; }
  heading() {
    let best = NEM; let bc = 1e9;
    for (let k = -4; k <= 4; k++) {
      const a = NEM + k * 0.07; const c = Math.cos(a); const s = Math.sin(a); let cost = Math.abs(k) * 0.6; let prev = 0;
      for (let d = 3; d <= this.dist + 9; d += 3) { const x = c * d; const z = s * d; const h = this.H(x, z); cost += Math.max(0, Math.abs(h - prev) / 3 - 0.2) * 12 + (this.wet(h) ? 4 : 0) + (this.near(x, z, 0.8) ? 3 : 0); prev = h; }
      if (cost < bc) { bc = cost; best = a; }
    }
    return best;
  }
  /* true when the straight walk a -> b passes through a land footprint (the bot and most players walk straight at the light) */
  blocked(ax, az, bx, bz, pad = 0.9) {
    const dx = bx - ax; const dz = bz - az; const L2 = dx * dx + dz * dz || 1;
    for (const c of this.landSolids) { const u = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / L2)); const ex = ax + dx * u - c.x; const ez = az + dz * u - c.z; const rr = c.r + pad; if (ex * ex + ez * ez < rr * rr) return true; }
    return false;
  }
  /* the best spot near (t, s) on one side of the line: flat, dry, clear of props, reachable from the line */
  spot(t0, side, lats, { flatK = 0.3, ts = [-6, -3, 0, 3, 6], from = null, want = 21, all = false } = {}) {
    let best = null; let bc = 1e9; const q = { x: 0, z: 0 }; const cands = []; /* all = every candidate, best first (the placement guard picks the first one a route reaches) */
    for (const lat of lats) for (const dt of ts) {
      const t = t0 + dt; this.P(t, lat * side, q); const h = this.H(q.x, q.z);
      let path = 0; let prev = this.H(this.ux * t, this.uz * t);
      for (let s = 3; s <= lat; s += 3) { this.P(t, s * side, q); const hh = this.H(q.x, q.z); path = Math.max(path, Math.abs(hh - prev) / 3); prev = hh; }
      this.P(t, lat * side, q);
      const cost = (this.sunk(q.x, q.z) ? 60 : 0) + this.rough(q.x, q.z) * 4 + Math.max(0, path - 0.3) * 10 + (this.wet(h) ? 6 : 0) + (this.level != null && h < this.level ? 1.5 : 0) + (this.near(q.x, q.z, 2.2) ? 8 : 0) + (from && this.blocked(from.x, from.z, q.x, q.z) ? 40 : 0) + Math.abs(h) * flatK + Math.abs(lat - want) * 0.06;
      if (all) cands.push({ x: q.x, z: q.z, t, s: lat * side, cost });
      if (cost < bc) { bc = cost; best = { x: q.x, z: q.z, t, s: lat * side }; }
    }
    return all ? cands.sort((a, b) => a.cost - b.cost) : best;
  }
  /* a spot on one side; if the straight walk to it is blocked, a wider search; if no route reaches it (or the route is a
     maze), the best spot that a route does reach (every stop must be reachable from the one before it) */
  stopSpot(t, side, lats, opt, from) {
    const p0 = this.spot(t, side, lats, { ...opt, from });
    const p1 = this.blocked(from.x, from.z, p0.x, p0.z) ? this.spot(t, side, [...new Set([8, 10, 13, ...lats, 32])], { ...opt, from, ts: [-18, -14, -10, -6, -3, 0, 3, 6, 10, 14, 18] }) : p0;
    return this.legOK(from, p1) ? p1 : this.reseat(t, side, lats, opt, from, p1);
  }
  /* the walk from `a` to `p` has a route (to within 2.3 m of p, the gather reach) that is not a maze */
  legOK(a, p, rg = 2.3, loose = false) { const nav = this.nav; if (!nav) return true; const r = nav.route(a.x, a.z, p.x, p.z, rg, !loose); return !!r && r.len <= 1.7 * Math.hypot(p.x - a.x, p.z - a.z) + 14; }
  /* a spot that the route reaches: the cheapest of both sides and a wide fan of lateral offsets and places along the line */
  reseat(t, side, lats, opt, from, fallback, rg = 2.3) {
    const lat = [...new Set([6, 8, 10, 13, 16, 19, 22, 25, 28, 32, ...lats])]; const ts = [-18, -14, -10, -6, -3, 0, 3, 6, 10, 14, 18, 24, 30];
    const cands = [...this.spot(t, side, lat, { ...opt, from, ts, all: true }), ...this.spot(t, -side, lat, { ...opt, from, ts, all: true })].sort((a, b) => a.cost - b.cost);
    /* a route that keeps off steep ground first; a place that only a zigzag climb reaches only when no other is left */
    for (const loose of [false, true]) { if (loose && this.legOK(from, fallback, rg, true)) return fallback; let tries = 0; for (const c of cands) { if (c.cost > 120 || tries++ > 40) break; if (this.legOK(from, c, rg, loose)) return { x: c.x, z: c.z, t: c.t, s: c.s }; } }
    return fallback;
  }
  /* after clearStops() the stops may have moved: each leg (start, stop 1, 2, 3) still needs a route */
  guardStops() {
    if (!this.nav) return; let a = { x: this.f.pos.x, z: this.f.pos.z };
    for (const fd of this.stops) {
      if (fd.kind === 'duel' || fd.x == null) { a = fd; continue; }
      if (!this.legOK(a, fd)) { const p = this.reseat(fd.t ?? this.along(fd.x, fd.z), Math.sign(fd.s) || this.side, [16, 19, 22], {}, a, fd); if (p !== fd) { fd.x = p.x; fd.z = p.z; fd.t = p.t; fd.s = p.s; fd.y = this.gy(p.x, p.z); } }
      a = fd;
    }
  }
  /* the end (the far light, the hearth, the cage, the gate) must be reached from the last stop within its arrival reach
     (6.2 m); when it is not, the nearest good place back along the line (the lands of the dark world with the sea ahead) */
  guardEnd() {
    if (!this.nav) return; const f = this.f; const last = [...this.stops].reverse().find((fd) => fd.x != null) || { x: f.pos.x, z: f.pos.z }; const start = { x: f.pos.x, z: f.pos.z };
    const ok = (p, loose) => this.legOK(last, p, 6.2, loose) && this.legOK(start, p, 6.2, loose);
    if (ok(this.L, false)) return;
    const ts = [0, -3, -6, -10, -14, -18, -24, -30, -40].map((x) => x + 0); const lat = [0, 3, 6, 10, 14, 20];
    const cands = [...this.spot(this.D, 1, lat, { flatK: 0.1, ts, all: true }), ...this.spot(this.D, -1, lat, { flatK: 0.1, ts, all: true })].sort((a, b) => a.cost - b.cost);
    for (const loose of [false, true]) { if (loose && ok(this.L, true)) return; let tries = 0; for (const c of cands) { if (tries++ > 40) break; if (ok(c, loose)) { this.L = { x: c.x, z: c.z, t: c.t, s: c.s }; this.floor = Math.min(this.floor, this.gy(c.x, c.z) - 1.0); return; } } }
  }
  gy(x, z) {
    const gx = (x - this.x0) / CELL; const gz = (z - this.z0) / CELL; const ix = Math.floor(gx); const iz = Math.floor(gz);
    const k = this.terrain ? this.terrain.scale.y : 1;
    if (ix < 0 || iz < 0 || ix >= this.gw - 1 || iz >= this.gh - 1) return this.H(x, z) * k;
    const fx = gx - ix; const fz = gz - iz;
    const a = this.cell(ix, iz); const b = this.cell(ix + 1, iz); const c = this.cell(ix, iz + 1); const d = this.cell(ix + 1, iz + 1);
    return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * k;
  }
  cell(i, j) { const n = j * this.gw + i; let v = this.grid[n]; if (v !== v) { v = this.H(this.x0 + i * CELL, this.z0 + j * CELL); this.grid[n] = v; } return v; }
  /* the ground under a footprint: its lowest point, so nothing hangs over a slope */
  low(x, z, r) { let m = this.gy(x, z); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; m = Math.min(m, this.gy(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return m; }

  build() { for (const _ of this.steps()) { /* one go */ } } /* eslint-disable-line no-unused-vars */
  /* the build as steps; startJourney runs a few a frame (a bare yield = a place the build may wait for the next frame) */
  *steps() {
    const f = this.f; const st = f.story; const r = this.r;
    /* the glory road is 30% longer (about 55 s was short for a procession) with one more beat: the road's people line
       it between the last challenger and the gate and say the name (the lane, updateGate) */
    this.dist = this.mode === 'gate' ? Math.round(DIST * 1.3) : DIST;
    this.q2on = Q2.QN(f); if (this.q2on && Q2.WALK[this.mode]) this.dist = Q2.WALK[this.mode]; /* the empty road is cut */
    const a = this.heading(); this.ux = Math.cos(a); this.uz = Math.sin(a); this.nx = -this.uz; this.nz = this.ux;
    /* a cached ground grid over the whole walk; filled now, in one go, so no cell is first read on a busy frame */
    const xs = []; const zs = []; for (const [t, s] of [[-30, -70], [-30, 70], [this.dist + 35, -70], [this.dist + 35, 70]]) { const p = this.P(t, s); xs.push(p.x); zs.push(p.z); }
    this.x0 = Math.min(...xs); this.z0 = Math.min(...zs); this.gw = Math.ceil((Math.max(...xs) - this.x0) / CELL) + 2; this.gh = Math.ceil((Math.max(...zs) - this.z0) / CELL) + 2;
    this.grid = new Float32Array(this.gw * this.gh).fill(NaN);
    yield* this.fillSteps();
    /* the floor: never more than 1 m below the lowest point of the route line (a dock bay, a pit, a quarry); the line itself is always walkable */
    /* the walk ends before the line drops off a cliff or into a cloud sea (storybook cloudpeaks fell 20 m at 120 m and the
       last 20 s of the walk were a white-out): D = where the ground first falls 4 m below the start or steps 3.5 m in 6 m */
    { let D = this.dist; let prev = this.gy(0, 0); const h0 = prev; for (let d = 6; d <= this.dist + 12; d += 3) { const q = this.P(d, 0); const h = this.gy(q.x, q.z); const q6 = this.P(d - 6, 0); if (h < h0 - 4 || Math.abs(h - this.gy(q6.x, q6.z)) > 3.5) { D = clamp(d - 14, 96, this.dist); break; } prev = h; } void prev; this.D = D; this.k = D / DIST; } /* gate k = 1.3 on open ground: every stop, the vantage and the end move out by 30% */
    { let lo = Infinity; for (let d = -6; d <= this.D + 12; d += 3) { const q = this.P(d, 0); lo = Math.min(lo, this.gy(q.x, q.z)); } this.floor = lo - 1.0; }
    /* the end: the flattest dry spot near the end of the line */
    const L = this.spot(this.D, 1, [0, 3, 6], { flatK: 0.1, ts: [-8, -4, 0, 4, 8].map((x) => (this.D < this.dist ? x - 4 : x)) }); const L2 = this.spot(this.D, -1, [3, 6], { flatK: 0.1, ts: [-8, -4, 0, 4, 8].map((x) => (this.D < DIST ? x - 4 : x)) }); this.floor = Math.min(this.floor, this.gy(L.x, L.z) - 1.0, this.gy(L2.x, L2.z) - 1.0);
    this.L = (this.rough(L2.x, L2.z) < this.rough(L.x, L.z) - 0.1 ? L2 : L);
    /* the walk's footprints and a route finder come first, so a stop is placed only where a route reaches it
       (the finds' own solids and the set pieces join this.solids later; the finder is built again for the walk itself) */
    this.solids = [];
    const onRoute = (x, z) => { const lt = x * this.ux + z * this.uz; const ls = x * this.nx + z * this.nz; return lt > -30 && lt < this.dist + 40 && Math.abs(ls) < 75; };
    for (const c of this.landSolids) if ((c.r > 0 || (c.w && c.d)) && onRoute(c.x, c.z)) this.solids.push(c.w && c.d ? { x: c.x, z: c.z, r: c.r || Math.hypot(c.w, c.d) / 2, w: c.w, d: c.d, ry: c.ry || 0 } : { x: c.x, z: c.z, r: c.r });
    for (const p of this.placed) { if (!onRoute(p.x, p.z)) continue; const r0 = p.solid != null ? p.solid : clamp(p.rad * 0.6, 0.6, 1.8); if (r0 > 0.05) this.solids.push({ x: p.x, z: p.z, r: r0 }); }
    this.nav = makeNav(this);
    this.side = r() < 0.5 ? 1 : -1; const side = this.side;
    /* the stops on the way, by shape */
    let from = { x: 0, z: 0 };
    const pick = (t, i, lats, opt = {}) => { const p = this.stopSpot(t * this.k, i % 2 ? -side : side, lats, opt, from); from = p; return p; };
    if (this.mode === 'farlight') {
      const lines = st.finds({ weaponName: window.__sq?.S?.weaponName || null, weapon: f.weapon?.gear || 'blade', material: f.material?.label });
      this.stops = FIND_AT.map((t, i) => ({ i, kind: 'find', ...pick(t, i, [16, 19, 22, 25, 28], { flatK: i === 1 ? 1.2 : 0.3 }), ...lines[i], got: false, hold: 0, seen: false, fly: -1 }));
    } else if (this.mode === 'hearth') {
      /* the wood lies closer to the road: the companion walks the road and the hero must not leave it for long */
      const lines = this.T.finds || [];
      this.stops = [30, 66, 100].map((t, i) => ({ i, kind: 'kindling', ...pick(t, i, [9, 11, 13, 15], { want: 11 }), ...(lines[i] || { title: 'Kindling', line: '' }), got: false, hold: 0, seen: false, fly: -1 }));
    } else if (this.mode === 'trail') {
      /* each sign turns the route: the signs swing from one side of the line to the other.: the signs stand at 28, 52 and 86 m, 14 m off the line (were 30, 66, 100 and 22 m) */
      const lines = this.T.signs || [];
      this.stops = [28, 52, 86].map((t, i) => ({ i, kind: 'sign', ...(this.f.kit?.id === 'neon' ? pick(t, i, [9, 11, 13, 15], { want: 11 }) : pick(t, i, [12, 14, 17, 20], { want: 14 })) /* neon signs stand on the lit kerb, not against the black base of a tower */, ...(lines[i] || { title: 'A sign', line: '' }), got: false, hold: 0, seen: false, fly: -1 }));
      const rp = this.spot(118 * this.k, 0, [0], { ts: [-4, 0, 4] }); this.rest = rp;
    } else if (this.mode === 'cage') {
      this.stops = [36, 72, 104].map((t, i) => ({ i, kind: 'post', ...pick(t, i, [8, 10, 12, 14], { want: 10 }), got: false, seen: false }));
    } else {
      /* the challenges stand on the road itself; the marker stands at its side */
      /* the first duel stands 20 m from the start (was 44 m: 25 s of road before any fight) */
      /* the three duels are fought in one ring of watchers, 13 m from the start */
      this.stops = (this.q2on ? [13, 14.2, 15.4].map((x) => x / this.k) : [15, 58, 102]).map((t0, i) => { const t = t0 * this.k; const p = this.spot(t, 1, [0], { ts: [-3, 0, 3], flatK: 0.6 }); const ms = this.spot(p.t, i % 2 ? -side : side, [3.4, 4], { ts: [0, 1.5, -1.5] }); return { i, kind: 'duel', x: p.x, z: p.z, t: p.t, s: 0, mx: ms.x, mz: ms.z, ms: ms.s, got: false, seen: false, state: 'wait' }; });
    }
    /* protect has no pickups on the road (it is ambushed); freedom has two chains, not three */
    if (this.q2on && this.mode === 'hearth') { this.stops = []; this.found = 3; }
    if (this.q2on && this.mode === 'cage') { this.stops = this.stops.slice(1); this.found = 1; }
    /* the watcher (the far light): on a rise across the line from the second find */
    if (this.mode === 'farlight') {
      let wbest = null; let wh = -1e9; const q = { x: 0, z: 0 };
      for (const lat of [34, 40, 46]) for (const dt of [-8, 0, 8]) { this.P(58 + dt, lat * side, q); const h = this.H(q.x, q.z); const ok = !this.wet(h) && this.rough(q.x, q.z, 1.5) < 1.2 && !this.near(q.x, q.z, 1.5); if (ok && h > wh) { wh = h; wbest = { x: q.x, z: q.z, t: 58 + dt }; } }
      this.watchAt = wbest;
    }
    /* props that the hero cannot walk through on the walk (the land's own footprints and each placed prop's solid base;
       a land built before the footprints existed falls back to 60 % of the spacing radius), and the walk's own props */
    this.clearStops();
    this.guardStops(); this.guardEnd(); /* every stop and the end must still be reached by a route after the footprint moves */
    if (!this.q2on || this.mode === 'farlight') this.buildView(); /* the high ground is the wonder walk's own beat; the other walks have none */
    for (const fd of this.stops) { if (fd.kind === 'find') this.solids.push({ x: fd.x, z: fd.z, r: 0.75 }); else if (fd.kind === 'post') this.solids.push({ x: fd.x, z: fd.z, r: 0.85 }); else if (fd.kind === 'sign' && fd.i === 1) this.solids.push({ x: fd.x, z: fd.z, r: 0.7 }); else if (fd.kind === 'duel') this.solids.push({ x: fd.mx, z: fd.mz, r: 0.55 }); }
    yield;
    this.buildLooks();
    yield;
    yield* this.setsSteps();
    yield;
    this.nav = null; /* the finder for the walk is built again on first use, with the finds' solids and the set pieces in it */
    this.buildHud();
    /* the chapter is a task with no wave: wave 1 so the end of the task opens chapter II as before */
    f.wave = 1; f.stats.waves = 1; f.waveStart = f.clock; f.arena = 1e5; f.journey = this; f.pace = 1;
    this.px = f.pos.x; this.pz = f.pos.z;
    f.task = { update: (dt) => this.update(dt) };
    f.director.event({ farlight: 'A small light leads the hero across the land toward a far light.', hearth: 'The hero walks the companions to a safe fire and gathers wood on the way.', trail: 'A scout sees the hero and runs; the hero chases it.', cage: 'The hero goes to free someone the enemy keeps in a cage.', gate: 'Three challengers hold the road to the gate; the hero duels them one at a time, with the road\'s people watching.' }[this.mode]);
    if (this.mode === 'farlight') this.spawnWatcher();
    let q2own = false; try { q2own = Q2.startWalk(this); } catch (err) { console.warn('quest walk', err); } /* the ring, the ambushes, the enemy's first visit */
    if (this.mode === 'trail' && !q2own) this.spawnScout();
    if (this.mode === 'hearth') { this.startEscort(); if (this.q2on) this.raidAt = []; }
    if (this.mode === 'cage') this.setupKept();
    try { prepareChapters(f); } catch (err) { console.warn('chapters prepare', err); }
    yield;
    this.prewarm();
  }
  /* every cell of the walk's ground, read now (about 6,000 ground reads at the start, none later on a walking frame) */
  fillGrid() { for (let j = 0; j < this.gh; j++) for (let i = 0; i < this.gw; i++) this.cell(i, j); }
  *fillSteps() { for (let j = 0; j < this.gh; j++) { for (let i = 0; i < this.gw; i++) this.cell(i, j); if (j % 6 === 5) yield; } } /* the same reads, in slices */
  /* every material of the walk is compiled before the first frame that shows it: the finds, the shafts and the end piece
     sit far off at the start, out of the view, and their programs used to compile on the frame they came into view */
  prewarm() {
    const R = this.w.renderer; if (!R?.compile) return;
    if (this.w.p5Hold && document.body.classList.contains('qcard')) return; /* under the quest card, startJourney links the whole scene in the background instead (warmUnder) */
    const hidden = this.stops.filter((fd) => fd.g && !fd.g.visible); for (const fd of hidden) fd.g.visible = true;
    try { R.compile(this.w.scene, this.w.camera); } catch (err) { console.warn('prewarm', err); }
    for (const fd of hidden) fd.g.visible = false;
  }

  /* a world's waymark (neon's chevrons on a 10 m pole, a kite, a lantern pole) is a guide, not a set piece: it stays under
     about 15 % of the screen height (measured as if it were at least 10 m off) and keeps below the objective text at the top
     (the top fifth of the screen, the middle 60 % across). The world's own update runs first; its scale is kept and the cap
     multiplies it, so nothing compounds frame to frame. */
  capMark(h) {
    if (!h?.group || h.capped) return; h.capped = true;
    const g = h.group; const orig = h.update?.bind(h); const own = g.scale.clone(); const self = this;
    const st = { s: 1, top: 0 };
    h.update = (dt, W) => {
      g.scale.copy(own); if (st.hid) { g.visible = true; st.hid = false; } if (orig) orig(dt, W); own.copy(g.scale);
      const k = self.markCap(h, st); st.s += (k - st.s) * Math.min(1, (dt || 0.016) * 3);
      g.scale.copy(own).multiplyScalar(Math.max(st.s, 1e-3)); if (st.s < 0.03 && g.visible) { g.visible = false; st.hid = true; }
    };
  }
  markCap(h, st) {
    const g = h.group; const cam = this.w.camera; if (!g.visible) return st.s;
    const A = this.capV || (this.capV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    g.updateWorldMatrix(true, true);
    const base = A[0].setFromMatrixPosition(g.matrixWorld);
    /* the height of the piece over its base per unit of the world's own scale (measured again every 2 s: rigs bob) */
    if (st.rel == null || this.t - st.at > 2) { const box = new THREE.Box3().setFromObject(g); st.rel = Math.max(0, box.max.y - base.y) / Math.max(1e-3, g.scale.y); st.at = this.t; }
    const tall = st.rel * g.scale.y; if (tall < 0.05) return 1;
    const d = Math.hypot(base.x - cam.position.x, base.z - cam.position.z);
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    let k = Math.min(1, (0.15 * 2 * Math.max(d, 10) * tanH) / tall);
    /* the text band: the top of the piece stays under 0.62 of the view's half height when it is in the middle 60 % */
    const b = A[1].copy(base).project(cam); const t = A[2].copy(base).setY(base.y + tall * k).project(cam);
    if (b.z < 1 && Math.abs(t.x) < 0.6 && t.y > 0.62 && t.y > b.y) k *= clamp((0.62 - b.y) / (t.y - b.y), 0.35, 1); /* never below 0.35: a mark must not vanish */
    return k;
  }

  /* ---------- the props of the walk ---------- */
  buildLooks() {
    const w = this.w; const f = this.f; const scene = w.scene; const env = scene.environment; const r = this.r; const QP = f.QP;
    this.group = new THREE.Group(); scene.add(this.group);
    this.owned = [];
    const own = (x) => { this.owned.push(x); return x; };
    this.own = own;
    this.rock = own(new THREE.MeshStandardMaterial({ color: 0x35312c, roughness: 0.96, metalness: 0, flatShading: true, envMap: env, envMapIntensity: 0.3 }));
    const rockGeo = (rad, seed) => { const g = new THREE.DodecahedronGeometry(rad, 1); const p = g.attributes.position; const rr = rng(seed); const v = new THREE.Vector3(); const seen = new Map(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`; let k = seen.get(key); if (k == null) { k = 0.8 + rr() * 0.35; seen.set(key, k); } v.multiplyScalar(k); v.y *= 0.62; p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return own(g); };
    this.rockGeo = rockGeo;
    const shaftMat = (col, k, pow) => own(new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(col) }, uK: { value: k }, uTime: { value: 0 }, uPow: { value: pow } }, vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const glowMat = (col, k) => own(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(col).multiplyScalar(k), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const motes = (n, col, size) => { const g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const m = own(new THREE.PointsMaterial({ map: dotTexture(), color: new THREE.Color(col).multiplyScalar(2.2), size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })); const pts = new THREE.Points(g, m); pts.frustumCulled = false; const seed = new Float32Array(n * 4); for (let i = 0; i < n; i++) { seed[i * 4] = r(); seed[i * 4 + 1] = 0.35 + r() * 0.65; seed[i * 4 + 2] = Math.sqrt(r()); seed[i * 4 + 3] = r() * Math.PI * 2; } pts.userData.seed = seed; return pts; };
    this.glowMat = glowMat;
    const findShaft = own(new THREE.CylinderGeometry(0.11, 0.08, 6.5, 10, 1, true)); findShaft.translate(0, 3.25, 0); /* a thin faint wisp, 6.5 m tall (was 0.3 m wide, 10 m) */
    /* the ring is a small mark on the ground at the thing (the 2.5 m gather ring drew a huge white arc round the camera) */
    const ringGeo = own(new THREE.RingGeometry(0.92, 1.04, 48)); ringGeo.rotateX(-Math.PI / 2);
    const fillGeo = own(new THREE.RingGeometry(0.12, 0.9, 48)); fillGeo.rotateX(-Math.PI / 2);
    const items = this.mode === 'farlight' || this.mode === 'trail' ? this.itemMeshes(own) : null;
    /* the stops that are gathered or read by standing by them: a piece, a faint shaft, rising motes and a ring that fills */
    const tint = { find: [0xbcd2ff, 0xffd9a8, 0xd8e4ff], kindling: [0xffc890, 0xffd9a8, 0xffd0a0], sign: [0xff8a60, 0xffc0a0, 0xffa080] };
    for (const fd of this.stops) {
      if (fd.kind === 'post' || fd.kind === 'duel') continue;
      const g = new THREE.Group(); const gy = this.low(fd.x, fd.z, 0.6); g.position.set(fd.x, gy, fd.z); this.group.add(g); fd.g = g;
      if (fd.kind === 'find') {
        /* each find lies on a grassy hummock with tussocks (the text says "in the grass"; it lay over open water) */
        let y = -0.08; if (this.beams) { const hm = hummock(g, { seed: 70 + fd.i * 11, r: 2.0, env }); this.handles.push({ update() {}, dispose: hm.dispose }); y += hm.top; } [0.3, 0.23, 0.17, 0.12].forEach((rad, k) => { const m = new THREE.Mesh(rockGeo(rad, 41 + fd.i * 7 + k), this.rock); m.position.set((r() - 0.5) * 0.08, y + rad * 0.55, (r() - 0.5) * 0.08); m.rotation.set((r() - 0.5) * 0.4, r() * 6.3, (r() - 0.5) * 0.4); m.castShadow = true; m.receiveShadow = true; g.add(m); y += rad * 0.95; });
        fd.top = y + 0.32;
        const item = items[fd.item] || items.stone; const im = item.clone(true); im.position.y = fd.top; g.add(im); fd.im = im;
      } else if (fd.kind === 'kindling') {
        const h = this.WP?.kindling ? this.WP.kindling(this.group, {}) : QP.makeKindling(this.group, { style: this.style }); this.handles.push(h); h.group.removeFromParent(); g.add(h.group); fd.im = h.group; fd.top = 0; fd.still = true;
        h.group.scale.multiplyScalar(1.8); /* a bundle you can see from the road */
      } else {
        if (this.WP?.sign) { const h = this.WP.sign(this.group, { i: fd.i }); this.handles.push(h); h.group.removeFromParent(); fd.im = h.group; } else fd.im = this.signPiece(fd, items, own);
        g.add(fd.im); fd.top = 0; fd.still = true; fd.noFly = true;
      }
      const [cs, cr, cm] = tint[fd.kind];
      const glow = new THREE.Sprite(glowMat(cr, 2.4)); glow.scale.setScalar(0.85); glow.position.y = fd.kind === 'find' ? fd.top : 0.4; g.add(glow); fd.glow = glow;
      const sh = new THREE.Mesh(findShaft, shaftMat(cs, 0.42, 1.6)); sh.position.y = 0; g.add(sh); fd.shaft = sh;
      const ring = new THREE.Mesh(ringGeo, own(new THREE.MeshBasicMaterial({ color: new THREE.Color(cr).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); ring.position.y = 0.09; g.add(ring); fd.ring = ring;
      const fill = new THREE.Mesh(fillGeo, own(new THREE.MeshBasicMaterial({ color: new THREE.Color(cr).multiplyScalar(1.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); fill.position.y = 0.08; g.add(fill); fd.fill = fill;
      const mo = motes(34, cm, 0.16); g.add(mo); fd.motes = mo; fd.k = 1;
      if (!this.beams) { sh.visible = false; mo.visible = false; glow.material.opacity = 0; if (this.WP.waymark && fd.kind !== 'find') { const h = this.WP.waymark(this.group, { kind: 'stop', accent: this.accent }); h.wmk = true; this.capMark(h); this.handles.push(h); h.group.removeFromParent(); g.add(h.group); fd.wm = h; /* beside the stop, on the far side from the line: never in the face of the hero who stands there */ const ls = Math.sign(fd.x * this.nx + fd.z * this.nz) || 1; h.group.position.set(this.nx * ls * 2.6, 0, this.nz * ls * 2.6); } }
      if (fd.kind === 'sign') { fd.k = 0; g.visible = fd.i === 0; }
    }
    if (this.mode === 'farlight') this.buildLure(glowMat);
    /* the end: a light group on the ground at the end of the line (shaft, pool, motes and the mode's own piece) */
    const L = new THREE.Group(); this.light = L; this.group.add(L);
    const back = Math.atan2(-this.uz, -this.ux); /* the side the hero comes in from */
    this.stones = [];
    const EL = END_LOOK[this.mode];
    if (this.mode === 'farlight' && !this.beams && this.WP?.farlight) {
      /* a world's own far light (storybook: a painted plinth with a brass lamp-post); it brings its own halo */
      const h = this.WP.farlight(this.group, { accent: this.accent }); this.handles.push(h); h.group.removeFromParent(); L.add(h.group); this.farPiece = h;
      this.altarTop = h.altarTop ?? 0.73; const sr = h.slotR ?? 0.55; this.farSolid = h.solidR ?? null;
      this.slots = [0, 1, 2].map((i) => { const aa = back + Math.PI + (i - 1) * 2.1; return [Math.cos(aa) * sr, Math.sin(aa) * sr]; });
    } else if (this.mode === 'farlight') {
      /* outside the dark world: a plain dressed-stone plinth, no ring of standing stones (that ring reads as dark-world ritual) */
      const plinth = this.beams ? this.rock : own(new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.9, metalness: 0 }));
      const altar = new THREE.Mesh(own(new THREE.CylinderGeometry(1.0, 1.28, 0.8, 9)), plinth); altar.position.y = 0.2; altar.castShadow = true; altar.receiveShadow = true; L.add(altar);
      const slab = new THREE.Mesh(own(new THREE.CylinderGeometry(1.12, 1.08, 0.14, 9)), plinth); slab.position.y = 0.66; slab.rotation.y = 0.2; slab.castShadow = true; L.add(slab);
      this.altarTop = 0.73;
      const stoneGeo = own(new THREE.BoxGeometry(0.7, 1, 0.42, 2, 4, 2)); { const p = stoneGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 - Math.max(0, y) * 0.35; p.setXYZ(i, p.getX(i) * k + (r() - 0.5) * 0.06, y + 0.5 + (y > 0.45 ? (r() - 0.5) * 0.25 : 0), p.getZ(i) * k + (r() - 0.5) * 0.05); } stoneGeo.computeVertexNormals(); }
      for (const off of this.beams ? [0.75, 1.6, 2.45, -0.75, -1.6, -2.45, Math.PI] : []) {
        if (r() < 0.22 && Math.abs(off) < 2) continue;
        const ang = back + off + (r() - 0.5) * 0.15; const R = 3.9 + (r() - 0.5) * 0.4; const h = 1.1 + r() * 1.2;
        const m = new THREE.Mesh(stoneGeo, this.rock); m.scale.set(0.85 + r() * 0.4, h, 0.85 + r() * 0.3); m.rotation.set((r() - 0.5) * 0.16, -ang + (r() - 0.5) * 0.3, (r() - 0.5) * 0.2); m.castShadow = true; m.receiveShadow = true;
        m.userData.local = [Math.cos(ang) * R, Math.sin(ang) * R]; m.userData.ang = ang; L.add(m); this.stones.push(m);
      }
      this.slots = [0, 1, 2].map((i) => { const aa = back + Math.PI + (i - 1) * 2.1; return [Math.cos(aa) * 0.55, Math.sin(aa) * 0.55]; });
    } else if (this.mode === 'hearth') {
      /* the hearth: the world's own fire (the one chapter II holds), down to its last embers until the wood is laid.
         It is made now, not at the arrival: a new light changes the light count and every lit material would recompile there */
      const fire = f.addProp('fire', this.L.x, this.L.z, 100); fire.args.hp = 0.05; this.fire = fire;
      this.slots = [0, 1, 2].map((i) => { const aa = back + Math.PI + (i - 1) * 2.1; return [Math.cos(aa) * 0.38, Math.sin(aa) * 0.38]; });
    } else if (this.mode === 'trail') {
      /* where the scout runs to: its fire, a thin red column of lit smoke far down the line */
    } else if (this.mode === 'cage') {
      const cage = this.WP?.cage ? this.WP.cage(this.group, { accent: this.accent }) : QP.makeCage(this.group, { accent: this.accent, style: this.style }); this.handles.push(cage); cage.group.removeFromParent(); L.add(cage.group); this.cage = cage;
      cage.group.rotation.y = Math.atan2(this.ux, this.uz);
    } else {
      const gate = this.WP?.gate ? this.WP.gate(this.group, { accent: this.accent }) : QP.makeGate(this.group, { accent: this.accent, style: this.style }); this.handles.push(gate); gate.group.removeFromParent(); L.add(gate.group); this.gate = gate;
      gate.group.rotation.y = Math.atan2(this.ux, this.uz);
      /* walls run out from the posts and a keep stands past the gate (questprops makeGateWalls) */
      try { const wl = QP.makeGateWalls({ style: this.style, width: gate.width || 2.6, accent: this.accent }); gate.group.add(wl.group); this.gateWalls = wl; const gd = gate.dispose.bind(gate); gate.dispose = () => { try { wl.dispose(); } catch { /* gone */ } gd(); }; /* the walls go with the gate (it carries into chapter II) */ } catch (err) { console.warn('gate walls', err); }
    }
    const shaftO = own(new THREE.CylinderGeometry(1.1, 0.8, 160, 24, 1, true)); shaftO.translate(0, 80, 0);
    const shaftI = own(new THREE.CylinderGeometry(0.26, 0.18, 160, 14, 1, true)); shaftI.translate(0, 80, 0);
    /* the end column is a thin soft thread of light (2.6 m wide and bright, it cut the frame in two) */
    this.shaftO = new THREE.Mesh(shaftO, shaftMat(EL.o, 1.0, 1.05)); this.shaftI = new THREE.Mesh(shaftI, shaftMat(EL.i, 2.4, 1.4));
    for (const m of [this.shaftO, this.shaftI]) { m.frustumCulled = false; m.renderOrder = 5; m.visible = this.beams; L.add(m); }
    if (!this.beams && this.WP.waymark && !this.farPiece && this.mode !== 'hearth' /* the protect walk's goal IS the fire. Frontier's goal waymark is a signal fire on a timber tower 9.5 m past the campfire: a player may walk to that fire, and the walk only ends within 8 m of the campfire */ /* a world's own far light is the mark (frontier's signal-fire smoke read as a black smudge over it) */) { const h = this.WP.waymark(this.group, { kind: 'goal', accent: this.accent }); h.wmk = true; this.capMark(h); this.handles.push(h); h.group.removeFromParent(); L.add(h.group); this.goalWm = h; /* the far mark stands past the end piece, so the arrival shot shows the fire, cage or gate, not the mark */ h.group.position.set(this.ux * (this.mode === 'gate' ? 11 : 9) - this.nx * 3, 0, this.uz * (this.mode === 'gate' ? 11 : 9) - this.nz * 3); }
    if (this.mode === 'gate') { this.shaftO.position.set(this.ux * 3.5, 0, this.uz * 3.5); this.shaftI.position.copy(this.shaftO.position); }
    const pool = new THREE.Mesh(own(new THREE.PlaneGeometry(12, 12)), own(new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(EL.o) }, uK: { value: 0.55 } }, vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.12; pool.renderOrder = 2; L.add(pool); this.pool = pool;
    this.lightGlow = new THREE.Sprite(glowMat(EL.i, 3)); this.lightGlow.scale.setScalar(4); this.lightGlow.position.y = 1.4; L.add(this.lightGlow);
    this.lightMotes = motes(90, EL.i, 0.2); L.add(this.lightMotes);
    if (!this.beams) { pool.visible = false; this.lightGlow.visible = false; this.lightMotes.visible = false; }
    this.lightK = EL.k; this.baseK = EL.k; this.flare = 0;
    this.placeLight(this.L.x, this.L.z, (x, z, rr) => this.low(x, z, rr));
    if (this.fire) this.fire.group.position.y = this.light.position.y;
    /* the shape's own things on the way */
    if (this.mode === 'trail') this.buildTracks(own);
    if (this.beams) this.buildLitter(own);
    if (this.mode === 'cage') this.buildPosts();
    if (this.mode === 'gate') { this.buildRoad(own); const tg = this.along(this.L.x, this.L.z) - 7; this.gateCrowd = this.crowd(tg, 8, this.L.x * this.nx + this.L.z * this.nz); /* rows either side of the GATE (it may stand 6 m off the line: the hero's arrival glide ended inside a person, a grey slab in neon) */ }
  }
  /* stones, sunk roots and reed tufts scattered 3 to 16 m either
     side of the route line, two draws in all (instanced), on the ground; nothing on the line itself */
  buildLitter(own) {
    const r = this.r; const N = 150; const NR = 110; const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const v = new THREE.Vector3(); const sc = new THREE.Vector3();
    const stones = new THREE.InstancedMesh(this.rockGeo(0.5, 913), this.rock, N); stones.castShadow = false; stones.receiveShadow = true;
    for (let i = 0; i < N; i++) { const t = -6 + r() * (this.D + 10); const sd = (r() < 0.5 ? -1 : 1) * (3 + r() * r() * 13); const p = this.P(t, sd); const s0 = 0.12 + r() * r() * 0.6; v.set(p.x, this.gy(p.x, p.z) - s0 * 0.25, p.z); q.setFromEuler(e.set(r() * 0.5, r() * 6.3, r() * 0.5)); sc.set(s0 * (0.8 + r() * 0.6), s0 * (0.5 + r() * 0.5), s0 * (0.8 + r() * 0.6)); stones.setMatrixAt(i, m.compose(v, q, sc)); }
    this.group.add(stones);
    const reedG = own(new THREE.ConeGeometry(0.035, 1, 4, 1)); reedG.translate(0, 0.5, 0);
    const reedM = own(new THREE.MeshStandardMaterial({ color: 0x4a4a32, roughness: 0.95 }));
    const reeds = new THREE.InstancedMesh(reedG, reedM, NR * 5);
    let k = 0; for (let i = 0; i < NR; i++) { const t = -6 + r() * (this.D + 10); const sd = (r() < 0.5 ? -1 : 1) * (3.5 + r() * 14); const p = this.P(t, sd); const gy = this.gy(p.x, p.z); for (let j = 0; j < 5; j++) { const a = r() * 6.3; const rr = r() * 0.25; v.set(p.x + Math.cos(a) * rr, gy, p.z + Math.sin(a) * rr); q.setFromEuler(e.set((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5)); const h = 0.35 + r() * 0.8; sc.set(1, h, 1); reeds.setMatrixAt(k++, m.compose(v, q, sc)); } }
    reeds.count = k; this.group.add(reeds);
  }
  /* a set piece every 20 to 30 m of the route (web/src/props/setpieces.js), from the world's own life: a hay cart, a
     well and a sheepfold in storybook; flooded paddies, jizo and a rice rack in edo; a noodle stall, parked cars and ad
     screens in neon; wagons and a corral in frontier; ruins and dead trees in dark. Each stands 5 to 9 m off the line,
     clear of the stops, the vantage and the land's own props; the hero and the companions walk round it. */
  buildSets() { for (const _ of this.setsSteps()) { /* one go */ } } /* eslint-disable-line no-unused-vars */
  *setsSteps() { /* a slice per set piece */
    const f = this.f; const world = f.kit?.id || 'dark'; const night = !(f.kit?.ui?.day); const list = setKinds(world);
    this.sets = []; const q = { x: 0, z: 0 }; let n = 0;
    const clearOf = (x, z, r) => this.stops.every((fd) => Math.hypot((fd.x ?? 0) - x, (fd.z ?? 0) - z) > r + 7 /* fights at a stop drifted into a set piece and the camera stood in its roof */ && (fd.mx == null || Math.hypot(fd.mx - x, fd.mz - z) > r + 3)) && (!this.view || Math.hypot(this.view.x - x, this.view.z - z) > r + 4) && Math.hypot(this.L.x - x, this.L.z - z) > r + 8 && (!this.rest || Math.hypot(this.rest.x - x, this.rest.z - z) > r + 9) /* the scout's rest is a fight: a car parked on it boxed the hero in (neon) */;
    /* the walk is not a straight line (the trail turns at each sign): keep set pieces off the legs between the stops too (a car sat across the last leg in neon and boxed the hero in) */
    const legs = []; { let px = this.f.pos.x; let pz = this.f.pos.z; for (const p of [...this.stops.filter((fd) => fd.x != null), this.rest, this.L].filter(Boolean)) { legs.push([px, pz, p.x, p.z]); px = p.x; pz = p.z; } }
    const offLegs = (x, z, r) => legs.every(([ax, az, bx, bz]) => { const dx = bx - ax; const dz = bz - az; const L2 = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(ax + dx * u - x, az + dz * u - z) > r + 4.5; });
    for (const t0 of [14, 36, 58, 80, 102, 124]) {
      const t = t0 * this.k; if (t > this.D - 10) break;
      const kind = list[n % list.length]; const wide = kind === 'paddy' ? 5.6 : kind === 'fold' ? 3.4 : 2.6;
      let best = null; let bc = 1e9;
      for (const side of [n % 2 ? -1 : 1, n % 2 ? 1 : -1]) for (const lat of [wide + 2.6, wide + 4, wide + 6]) for (const dt of [0, -4, 4, -8, 8]) {
        this.P(t + dt, lat * side, q); const h = this.gy(q.x, q.z);
        const wetOk = world === 'dark' && kind !== 'paddy'; /* dark: a set piece in the fen stands on its own islet */
        if ((this.wet(h) && !wetOk) || this.sunk(q.x, q.z) || this.near(q.x, q.z, wide * 0.7) || !clearOf(q.x, q.z, wide) || (kind !== 'paddy' && !offLegs(q.x, q.z, wide))) continue;
        const c = this.rough(q.x, q.z, wide * 0.7) * 6 + Math.abs(dt) * 0.15 + (lat - wide) * 0.2 + (side !== (n % 2 ? -1 : 1) ? 1.5 : 0);
        if (c < bc) { bc = c; best = { x: q.x, z: q.z, side }; }
      }
      n++; if (!best || bc > 14) continue;
      let h; try { h = setpiece(this.group, { world, kind, seed: 31 + n * 17 + (this.r() * 1000 | 0), night, env: this.w.scene.environment }); } catch (err) { console.warn('setpiece', kind, err); continue; }
      let gy0 = this.low(best.x, best.z, kind === 'paddy' ? 3 : 1.2) - (kind === 'paddy' ? 0.02 : 0.04);
      if (world === 'dark' && this.level != null && gy0 < this.level + 0.25) { const hm = hummock(this.group, { seed: 300 + n, r: wide + 0.9, env: this.w.scene.environment }); hm.group.position.set(best.x, this.level - 0.05, best.z); hm.group.scale.y = 1.6; this.handles.push({ update() {}, dispose: hm.dispose }); gy0 = this.level - 0.05 + hm.top * 1.6 - 0.12; }
      h.group.position.set(best.x, gy0, best.z);
      /* turned to show its face to the road */
      h.group.rotation.y = Math.atan2(-best.side * this.nx, -best.side * this.nz) + (kind === 'car' ? Math.PI / 2 + (this.r() - 0.5) * 0.3 : (this.r() - 0.5) * 0.4);
      this.handles.push(h); this.sets.push({ h, x: best.x, z: best.z });
      if (h.r > 0) this.solids.push({ x: best.x, z: best.z, r: h.r });
      yield;
    }
  }
  /* sets the light group on the ground at (x, z); every stone sits on its own ground */
  placeLight(x, z, ground) {
    const base = ground(x, z, 1.1); this.light.position.set(x, base, z); this.lx = x; this.lz = z;
    for (const m of this.stones) { const [sx, sz] = m.userData.local; m.position.set(sx, ground(x + sx, z + sz, 0.4) - base - 0.25, sz); }
    if (this.mode === 'farlight') this.solidsL = [{ x, z, r: this.farSolid || 1.55 }, ...this.stones.map((m) => ({ x: x + m.userData.local[0], z: z + m.userData.local[1], r: 0.62 }))];
    else if (this.mode === 'hearth') this.solidsL = [{ x, z, r: 1.45 }];
    else if (this.mode === 'cage') this.solidsL = [{ x, z, r: 1.4 }];
    else if (this.mode === 'gate') { const W = this.gate?.width || 2.6; this.solidsL = [-1, 1].map((k) => ({ x: x + this.nx * W * k, z: z + this.nz * W * k, r: 0.5 })); const sg = this.gateFlip ? -1 : 1; for (const q of this.gateWalls?.solids || []) this.solidsL.push({ x: x + sg * (q.x * this.uz + q.z * this.ux), z: z + sg * (-q.x * this.ux + q.z * this.uz), r: q.r }); }
    else this.solidsL = [];
  }
  itemMeshes(own) {
    const f = this.f; const env = this.w.scene.environment;
    const mat = (o) => own(new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.8, ...o }));
    /* the finds were a white egg and a lump at 10 m: bigger, darker, each with one clear mark */
    const stone = new THREE.Group(); { const body = new THREE.Mesh(own(new THREE.DodecahedronGeometry(0.17, 1)), mat({ color: 0x4a4640, roughness: 0.8, envMapIntensity: 0.4 })); body.scale.set(1.15, 0.6, 0.9); stone.add(body); const band = new THREE.Mesh(own(new THREE.TorusGeometry(0.15, 0.018, 6, 24)), own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8c8a0).multiplyScalar(1.2) }))); band.rotation.x = Math.PI / 2; band.scale.set(1.18, 0.92, 1); band.position.y = 0.01; stone.add(band); }
    const star = new THREE.Group(); { const sm = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(3) })); const sg = own(new THREE.OctahedronGeometry(0.06, 0)); for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(sg, sm); p.scale.set(0.6, 2.2, 0.6); p.rotation.set(k * 1.1, k * 0.7, k * 1.3); star.add(p); } }
    const cord = new THREE.Mesh(own(new THREE.TorusKnotGeometry(0.06, 0.015, 64, 6, 2, 3)), mat({ color: 0x7a2e22, roughness: 0.85, emissive: 0x200806 }));
    const bell = new THREE.Group(); bell.add(new THREE.Mesh(own(new THREE.CylinderGeometry(0.025, 0.06, 0.085, 12, 1, true)), mat({ color: 0xc09a58, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }))); bell.add(new THREE.Mesh(own(new THREE.TorusGeometry(0.07, 0.008, 6, 20)), mat({ color: 0x6a2a20, roughness: 0.9 }))); bell.children[1].position.y = 0.06;
    const m = f.material || {}; const shard = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.11, 0)), mat({ color: m.color ?? 0xa8b0b8, metalness: m.metal ?? 0.9, roughness: 0.25, envMapIntensity: 1.4, emissive: 0x1a120a })); shard.scale.set(0.55, 3.0, 0.3); shard.rotation.z = 0.5;
    return { stone, star, cord, bell, shard };
  }
  /* a sign the scout left: 0 a dropped thing in a smear of ash, 1 a stone cut with the enemy's mark, 2 its cold fire */
  signPiece(fd, items, own) {
    const g = new THREE.Group(); const r = this.r;
    const ashMat = this.ashMat || (this.ashMat = own(new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
    const smear = (rad, sx = 1) => { const m = new THREE.Mesh(own(new THREE.CircleGeometry(rad, 18)), ashMat); m.rotation.x = -Math.PI / 2; m.scale.set(sx, 1, 1); m.position.y = 0.04; g.add(m); return m; };
    const mark = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent).multiplyScalar(1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    if (fd.i === 0) {
      smear(0.7, 1.6).rotation.z = r() * 3;
      const c = items.cord.clone(); c.scale.setScalar(2.2); c.rotation.x = Math.PI / 2; c.position.y = 0.08; g.add(c);
      for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(this.rockGeo(0.07 + r() * 0.05, 500 + k), this.rock); m.position.set((r() - 0.5) * 1.1, 0.03, (r() - 0.5) * 0.8); g.add(m); }
    } else if (fd.i === 1) {
      const st = new THREE.Mesh(this.rockGeo(0.62, 777), this.rock); st.scale.set(1, 1.9, 0.8); st.position.y = 0.45; st.castShadow = true; st.receiveShadow = true; g.add(st);
      /* three cuts of the mark on the face toward the road, glowing faintly in the enemy's colour */
      const face = new THREE.Group(); face.rotation.y = Math.atan2(-fd.s * this.nx, -fd.s * this.nz); g.add(face);
      for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(own(new THREE.BoxGeometry(0.045, 0.62, 0.02)), mark); m.position.set((k - 1) * 0.14, 0.62, 0.47); m.rotation.z = 0.32; face.add(m); }
      smear(0.9);
    } else {
      smear(0.75);
      for (let k = 0; k < 8; k++) { const aa = (k / 8) * Math.PI * 2; const m = new THREE.Mesh(this.rockGeo(0.13 + r() * 0.05, 600 + k), this.rock); m.position.set(Math.cos(aa) * 0.6, 0.06, Math.sin(aa) * 0.6); g.add(m); }
      const log = own(new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9, emissive: 0x501808, emissiveIntensity: 0.6 }));
      for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(own(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 7)), log); m.rotation.set(Math.PI / 2 - 0.15, k * 2.1, 0); m.position.y = 0.12; g.add(m); }
      const em = new THREE.Sprite(this.glowMat(0xff6a2a, 1.6)); em.scale.setScalar(0.9); em.position.y = 0.15; g.add(em);
    }
    return g;
  }
  /* the tracks: prints every 1.1 m from the start to sign 1, sign 1 to sign 2 and so on to the scout's rest; each run shows
     only once the sign before it is read (drawn as one instanced mesh; .count grows as the run is revealed) */
  buildTracks(own) {
    const pts = [{ x: this.ux * 4, z: this.uz * 4 }, ...this.stops.map((s) => ({ x: s.x, z: s.z })), { x: this.rest.x, z: this.rest.z }];
    const mats = []; this.trackEnds = []; const q = new THREE.Quaternion(); const q2 = new THREE.Quaternion(); const n = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0); const pos = new THREE.Vector3(); const sc = new THREE.Vector3(1, 1, 1); const m4 = new THREE.Matrix4();
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]; const b = pts[k + 1]; const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz); const ux = dx / len; const uz = dz / len;
      const yaw = Math.atan2(ux, uz); const steps = Math.floor((len - 2.4) / 1.1);
      for (let i = 1; i <= steps; i++) {
        const along = 1.2 + i * 1.1; const lr = i % 2 ? 0.17 : -0.17; const wig = Math.sin(along * 0.21 + k) * 0.8;
        const x = a.x + ux * along + uz * (lr + wig); const z = a.z + uz * along - ux * (lr + wig);
        const e = 0.6; n.set(this.gy(x - e, z) - this.gy(x + e, z), 2 * e, this.gy(x, z - e) - this.gy(x, z + e)).normalize();
        q.setFromUnitVectors(up, n); q2.setFromAxisAngle(up, yaw); q.multiply(q2);
        pos.set(x, this.gy(x, z) + 0.04, z); m4.compose(pos, q, sc); mats.push(m4.clone());
      }
      this.trackEnds.push(mats.length);
    }
    /* bigger, darker prints, and a world's own trail stake
       every 8 m beside the revealed run (a ribboned stake, a bamboo stake with a paper streamer, a chem-light post, a surveyor's
       stake with a rag, a little cairn) */
    const day = !this.beams;
    const geo = own(new THREE.CircleGeometry(0.1, 10)); geo.rotateX(-Math.PI / 2); geo.scale(day ? 1.25 : 0.9, 1, day ? 2.3 : 1.7);
    const dark = new THREE.InstancedMesh(geo, own(new THREE.MeshBasicMaterial({ color: day ? 0x1a120a : 0x080605, transparent: true, opacity: day ? 0.85 : 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })), mats.length);
    const glow = new THREE.InstancedMesh(geo, own(new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent).multiplyScalar(0.55), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), mats.length);
    mats.forEach((m, i) => { dark.setMatrixAt(i, m); glow.setMatrixAt(i, m); });
    for (const m of [dark, glow]) { m.frustumCulled = false; m.renderOrder = 2; m.count = 0; this.group.add(m); }
    glow.visible = !day; /* the additive accent dots read as faint orange specks on day grass */
    this.prints = [dark, glow]; this.printShown = 0;
    this.buildStakes(pts, own);
  }
  buildStakes(pts, own) {
    const world = this.f.kit?.id || 'dark';
    const LOOK = { storybook: { pole: 0xf2ead8, flag: 0xd8342a, h: 1.25 }, edo: { pole: 0x8a9a52, flag: 0xf4f0e6, h: 1.5 }, neon: { pole: 0x2a2e34, flag: 0x30f0ff, h: 1.0, glow: true }, frontier: { pole: 0x8a6a48, flag: 0xb02a1a, h: 1.15 }, dark: { pole: 0x3a3632, flag: 0xff6a2a, h: 0.55, cairn: true, glow: true } }[world] || { pole: 0x8a6a48, flag: 0xc03020, h: 1.2 };
    const env = this.w.scene.environment; const list = []; const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0); const pos = new THREE.Vector3(); const sc = new THREE.Vector3(1, 1, 1);
    let printAt = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]; const b = pts[k + 1]; const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz); const ux = dx / len; const uz = dz / len; const steps = Math.floor((len - 2.4) / 1.1);
      for (let d = 6; d < len - 4; d += 8) {
        const side = (Math.floor(d / 8) % 2 ? 1 : -1) * 1.15; const x = a.x + ux * d + uz * side; const z = a.z + uz * d - ux * side;
        if (this.near(x, z, 0.2) || this.wet(this.gy(x, z))) continue;
        q.setFromAxisAngle(up, Math.atan2(ux, uz) + (this.r() - 0.5) * 0.5); pos.set(x, this.low(x, z, 0.15) - 0.05, z); m4.compose(pos, q, sc);
        list.push({ m: m4.clone(), at: printAt + Math.min(steps, Math.floor((d - 1.2) / 1.1)) });
      }
      printAt += Math.max(0, steps);
    }
    if (!list.length) return;
    /* a world's designed stake, one InstancedMesh per part */
    const parts = stakeParts(world, env);
    if (parts) { const ms = parts.map((p) => { own(p.geo); own(p.mat); if (p.mat.map) own(p.mat.map); const m = new THREE.InstancedMesh(p.geo, p.mat, list.length); list.forEach((it, i) => m.setMatrixAt(i, it.m)); m.count = 0; m.castShadow = true; m.frustumCulled = false; this.group.add(m); return m; });
      this.stakes = { pm: ms[0], fm: ms[1] || ms[0], more: ms.slice(2), at: list.map((it) => it.at) }; return; }
    const H = LOOK.h;
    const poleG = own(LOOK.cairn ? new THREE.DodecahedronGeometry(0.22, 0) : new THREE.CylinderGeometry(0.028, 0.035, H, 6)); if (LOOK.cairn) { poleG.scale(1, 0.7, 1); poleG.translate(0, 0.12, 0); } else poleG.translate(0, H / 2, 0);
    const flagG = own(LOOK.cairn ? new THREE.SphereGeometry(0.07, 8, 6) : new THREE.PlaneGeometry(0.34, world === 'edo' ? 0.42 : 0.2)); if (LOOK.cairn) flagG.translate(0, 0.3, 0); else flagG.translate(0.18, H - (world === 'edo' ? 0.26 : 0.14), 0);
    const pm = new THREE.InstancedMesh(poleG, own(new THREE.MeshStandardMaterial({ color: LOOK.pole, roughness: 0.8, envMap: env, envMapIntensity: 0.5, flatShading: !!LOOK.cairn })), list.length);
    const fm = new THREE.InstancedMesh(flagG, own(LOOK.glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(LOOK.flag).multiplyScalar(1.6), toneMapped: false }) : new THREE.MeshStandardMaterial({ color: LOOK.flag, roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color(LOOK.flag), emissiveIntensity: 0.25 })), list.length);
    list.forEach((it, i) => { pm.setMatrixAt(i, it.m); fm.setMatrixAt(i, it.m); });
    for (const m of [pm, fm]) { m.count = 0; m.castShadow = true; m.frustumCulled = false; this.group.add(m); }
    this.stakes = { pm, fm, at: list.map((it) => it.at) };
  }
  /* the cage's three anchors: chains of the world's own anchor run from each to the top of the cage */
  buildPosts() {
    const f = this.f; const QP = f.QP; const top = new THREE.Vector3();
    this.cage.group.updateWorldMatrix(true, false); top.copy(this.cage.top); this.cage.group.localToWorld(top);
    for (const fd of this.stops) {
      const h = this.WP?.anchor ? this.WP.anchor(this.w.scene, { accent: this.accent, to: top.clone(), index: fd.i }) : QP.makeAnchor(this.w.scene, { accent: this.accent, to: top.clone(), index: fd.i, style: this.ps.anchor || 'dark' });
      if (!this.beams && this.WP.waymark) { const w = this.WP.waymark(this.group, { kind: 'stop', accent: this.accent }); w.wmk = true; this.capMark(w); this.handles.push(w); w.group.position.set(fd.x + this.nx * 2.6, this.low(fd.x, fd.z, 0.7), fd.z + this.nz * 2.6); fd.wm = w; }
      h.group.position.set(fd.x, this.low(fd.x, fd.z, 0.7), fd.z);
      /* the post to break now wears a ring on the ground round it (paint-flat in the day worlds, a soft glow in dark) */
      { const dark = this.beams; const rg = this.own(new THREE.RingGeometry(1.45, 1.75, 48)); rg.rotateX(-Math.PI / 2);
        const rm = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent).multiplyScalar(dark ? 1.6 : 1.1), transparent: true, opacity: 0, depthWrite: false, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        const ring = new THREE.Mesh(rg, rm); ring.position.set(fd.x, this.low(fd.x, fd.z, 1.7) + 0.06, fd.z); ring.renderOrder = 3; this.group.add(ring); fd.hl = ring; }
      const p = { id: `jp${fd.i}`, kind: 'anchor', pos: new THREE.Vector3(fd.x, 0, fd.z), hp: 4, maxHp: 4, group: h.group, h, lit: true, t: 0, journey: true };
      (f.props ||= []).push(p); fd.prop = p;
    }
  }
  /* the marked road: a pole with a cloth every 16 m on alternate sides; the three markers stand blank at their places */
  buildRoad(own) {
    const f = this.f; const QP = f.QP; const ui = f.kit?.id && f.kit.id !== 'dark' ? f.kit.ui : null;
    const poles = []; const q = { x: 0, z: 0 };
    for (let t = 12, k = 0; t < this.D - 8; t += 16, k++) { const s = (k % 2 ? -1 : 1) * 4.6; this.P(t, s, q); if (this.near(q.x, q.z, 0.4) || this.wet(this.H(q.x, q.z))) continue; poles.push({ x: q.x, z: q.z, y: this.low(q.x, q.z, 0.2), s }); }
    const poleGeo = own(new THREE.CylinderGeometry(0.05, 0.065, 3.2, 6)); poleGeo.translate(0, 1.6, 0);
    const clothGeo = own(new THREE.PlaneGeometry(0.55, 1.3)); clothGeo.translate(0.3, 2.45, 0);
    const pm = new THREE.InstancedMesh(poleGeo, own(new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.85 })), poles.length);
    /* the dark road flies torn war banners (questprops roadCloth: weave, folds, a tarnished sigil, wind) */
    const rc = !ui && QP?.roadCloth ? QP.roadCloth({ accent: this.accent }) : null;
    if (rc) { this.roadCloth = own(rc); }
    const cm = new THREE.InstancedMesh(rc ? rc.geometry : clothGeo, rc ? rc.material : own(new THREE.MeshStandardMaterial({ color: new THREE.Color(this.accent).multiplyScalar(0.6), roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color(this.accent), emissiveIntensity: 0.18 })), poles.length);
    const m4 = new THREE.Matrix4(); const qq = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0); const pos = new THREE.Vector3(); const sc = new THREE.Vector3(1, 1, 1);
    poles.forEach((p, i) => { qq.setFromAxisAngle(up, Math.atan2(this.ux, this.uz) + Math.PI / 2 + (p.s > 0 ? Math.PI : 0)); pos.set(p.x, p.y - 0.1, p.z); m4.compose(pos, qq, sc); pm.setMatrixAt(i, m4); cm.setMatrixAt(i, m4); });
    pm.castShadow = true; cm.castShadow = true; this.group.add(pm, cm);
    for (const fd of this.stops) {
      const h = (this.WP?.marker || ((sc, o) => QP.makeMarker(sc, { ...o, style: this.style })))(this.group, { name: this.f.story.who, accent: this.accent, serif: ui?.serif, cream: ui?.cream }); this.handles.push(h);
      h.group.position.set(fd.mx, this.low(fd.mx, fd.mz, 0.45), fd.mz); h.group.rotation.y = Math.atan2(-fd.ms * this.nx, -fd.ms * this.nz); fd.marker = h;
    }
  }

  /* ---------- the HUD: a quiet line at the top and a mark toward where to go ---------- */
  /* the objective block. Line 1 is a plain instruction with a verb and the thing on screen ("Pick up the
     firewood (1/3)", "Walk Wren to the campfire"); line 2 says how or how far. The mark over the target, the edge arrow,
     the prompt at the object and the nudges live in web/src/guide.js (fight.updateGuide draws them from guideTarget()). */
  buildHud() {
    const host = document.getElementById('labels') || document.body;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);text-align:center;color:#ede6d6;text-shadow:0 2px 6px rgba(0,0,0,.9),0 0 24px rgba(0,0,0,.6);pointer-events:none;z-index:5;transition:opacity .5s;opacity:0';
    el.innerHTML = '<div style="font-family:var(--sans, system-ui, sans-serif);font-weight:600;font-size:26px;line-height:1.15;white-space:nowrap"></div><div style="font-size:16px;opacity:.82;margin-top:4px;letter-spacing:.02em"></div><div style="display:none;width:300px;height:6px;margin:9px auto 0;background:rgba(0,0,0,.55);border:1px solid rgba(237,230,214,.35);border-radius:3px;overflow:hidden"><i style="display:block;height:100%;width:100%;background:#ede6d6;transition:width .15s"></i></div>';
    /* the old top-strip diamond is gone (the guide's mark replaces it); the element stays so other code can remove it */
    const mark = document.createElement('div'); mark.style.display = 'none';
    host.appendChild(el); host.appendChild(mark); this.el = el; this.head = el.children[0]; this.sub = el.children[1]; this.bar = el.children[2]; this.barK = -1; /* the challenger's health in a duel */ this.mark = mark; this.subText = ''; this.headText = '';
    this.tgt = { x: 0, z: 0, y: null, h: 2.2, via: null, len: 0, act: '', near: 9, fill: null, foe: false, name: '' };
  }
  /* the world's word for a thing ("the campfire", "spike"), from its words entry; the dark world's own word otherwise */
  word(k, dflt) { const W = this.f.kit?.id && this.f.kit.id !== 'dark' ? this.f.kit.words || {} : {}; return W[k] || dflt; }
  /* what to do now and where: { line, sub, x, z, act, foe, h, hold } (x == null: no mark) */
  objective() {
    const f = this.f; const T = this.T; const o = this._obj || (this._obj = {}); o.x = null; o.z = null; o.act = ''; o.foe = false; o.fly = false; o.h = 2.2; o.fill = null; o.name = ''; o.near = 9;
    const G = this.next(); const fireW = this.word('fire', 'the fire'); const n = this.found;
    if (this.q2) { const own = Q2.objective(this, o); if (own) return own; }
    const at = (p, act, h = 2.2) => { o.x = p.x; o.z = p.z; o.act = act; o.h = h; };
    const stopFill = (fd) => (fd && fd.hold > 0 ? clamp(fd.hold / (fd.kind === 'sign' ? 1.3 : GATHER_T), 0, 1) : null);
    /* a foe that must be dealt with first (a raider at the companion, the scout on the run) */
    if (this.mode === 'hearth' && this.esc) { const lead = T.lead || 'them'; const R = this.raid?.find((x) => x.going && !x.foe.gone);
      if (R) { o.line = `Protect ${lead}`; o.sub = ''; at(R.foe.pos, `Hit the ${R.foe.def?.label || 'attacker'}`, 2.6); o.foe = true; return o; }
      if (this.esc.stun > 0) { o.line = `Stay by ${lead}`; o.sub = ''; at(this.esc, '', 2.4); o.near = 4; return o; } }
    /* the wonder walk has no pickups: the lure (a light, a songbird, a paper lantern, an orb) leads and the hero follows */
    if (this.mode === 'farlight') {
      const F = f.story?.farlight || {}; const L = this.lure; const climb = this.view?.active && !this.view.done;
      o.line = F.follow || 'Follow the light'; o.sub = ''; /* one line; the mark on the light shows where */
      if (n >= 3 && !climb && Math.hypot(this.lx - f.pos.x, this.lz - f.pos.z) < 16) { o.line = 'Walk to the far light'; at({ x: this.lx, z: this.lz }, this.q2on ? 'The far light' : 'Stand here', 2.6); o.near = 8; }
      else if (L) { at(L, '', 2.7); o.fly = true; o.near = 0; }
      return o;
    }
    if (this.view?.active && !this.view.done) { o.line = 'Climb to the high ground'; o.sub = ''; at(this.view, this.q2on ? 'Look out' : 'Stand here'); o.near = 6; return o; }
    if (this.mode === 'hearth') {
      const E = this.esc; const lead = T.lead || 'them'; const R = this.raid?.find((x) => x.going && !x.foe.gone);
      if (R) { o.line = `Protect ${lead}`; o.sub = ''; at(R.foe.pos, `Hit the ${R.foe.def?.label || 'attacker'}`, 2.6); o.foe = true; return o; }
      if (E.stun > 0) { o.line = `Stay by ${lead}`; o.sub = ''; at(E, '', 2.4); o.near = 4; return o; }
      if (n < 3) { const fd = G.fd; o.line = `Pick up the ${T.kindling || 'firewood'} (${n}/3)`; o.sub = fd && fd.hold > 0 ? 'Stand still' : ''; if (fd) { at(fd, 'Stand here to pick it up', 1.6); o.fill = stopFill(fd); o.near = 7; } return o; }
      o.line = this.q2on ? (f.story?.loved ? `Walk ${lead} home` : 'Walk home') : f.story?.loved ? `Walk ${lead} to ${fireW}` : `Walk to ${fireW}`; o.sub = ''; at({ x: this.lx, z: this.lz }, this.q2on ? 'Home' : `Light ${fireW}: wait here`, 1.6); /* no fire prompt and no wait on the new protect walk */ o.near = 8; return o;
    }
    if (this.mode === 'trail') {
      const S = this.scout; if (S && (S.dead || S.foe.state === 'dead') && this._objNow) return this._objNow; /* the scout is down: the walk ends in a moment */
      /* the chase starts at once; the sub line counts down the scout's road to its camp */
      if (S && S.state === 'fight' && S.foe.state !== 'dead' && !S.foe.gone) { o.line = 'Kill the scout'; o.sub = ''; at(S.foe.pos, 'Hit it', 2.6); o.foe = true; return o; }
      o.line = T.chase || 'Catch the scout';
      if (S && !S.foe.gone) { const m = Math.max(0, Math.round(this.along(this.rest.x, this.rest.z) - this.along(S.foe.pos.x, S.foe.pos.z))); o.sub = S.state === 'run' ? (T.chaseSub ? T.chaseSub(m) : 'Run after it: hold W') : ''; at(S.foe.pos, 'Hit it', 2.6); o.foe = true; o.name = 'Scout'; } else o.sub = '';
      return o;
    }
    if (this.mode === 'cage') {
      const pw = this.word('anchor', 'anchor'); const who = T.label || 'them';
      if (n < 3 && G.fd) { const fd = G.fd; const gd = fd.guard && !fd.guard.gone && fd.guard.state !== 'dead' && !fd.guard.hold ? fd.guard : null;
        o.line = this.q2on ? `Break the ${pw}s (${n - 1}/2)${Q2.clockText(this)}` : `Break the ${pw}s (${n}/3)`;
        if (gd) { o.sub = `Beat the ${gd.def?.label || 'guard'} first`; at(gd.pos, `Hit the ${gd.def?.label || 'guard'}`, 2.6); o.foe = true; return o; }
        o.sub = ''; at(fd, `Hit the ${pw}`, 3.2); o.near = 7; const p = fd.prop; if (p && p.maxHp) { o.fill = 1 - clamp(p.hp / p.maxHp, 0, 1); if (o.fill < 0.01) o.fill = null; } return o; }
      o.line = `Free ${who}${this.q2on ? Q2.clockText(this) : ''}`; o.sub = ''; at({ x: this.lx, z: this.lz }, this.q2on ? 'Open the cage' : 'Stand here to break the lock', 2.8); o.near = 7; return o;
    }
    /* the road to the gate: three challengers stand on the road, one at a time */
    if (n < 3) { const fd = this.stops.find((s) => !s.got); const c = fd?.foe;
      const duel = T.duel ? T.duel(fd ? fd.i : n) : `Duel ${n + 1} of 3`; o.line = duel;
      if (c && !c.gone && c.state !== 'dead') { o.line = fd.state === 'fight' ? (this.q2on ? `Beat ${fd.short || 'the challenger'}` : `${duel}: beat ${fd.short || 'the challenger'}`) : duel; o.sub = fd.state === 'fight' ? '' : `Walk up to ${fd.short || 'the challenger'}`; at(c.pos, fd.state === 'fight' ? '' : 'Walk up to fight', 2.6); o.foe = fd.state === 'fight'; return o; }
      if (fd) { o.sub = ''; at(fd, '', 2.4); } return o; }
    o.line = `Walk to ${this.word('gate', 'the gate')}`; o.sub = ''; at({ x: this.lx, z: this.lz }, 'Walk through', 4); o.near = 8; return o;
  }
  /* the guide's target this frame (fight.updateGuide reads it); null while a beat holds the view */
  guideTarget() {
    if (this.arriving || this.done || !this.tgt) return null;
    const body = document.body.classList; if (body.contains('chap') || body.contains('cine')) return null;
    const o = this._objNow; if (!o || o.x == null) return null;
    const t = this.tgt; t.x = o.x; t.z = o.z; t.y = null; t.h = o.h; t.act = o.act; t.near = o.near; t.fill = o.fill; t.foe = o.foe; t.name = o.name;
    /* the arrow never points through a wall: the route's next corner when the straight walk is shut */
    t.via = null; t.len = 0; if (!o.foe && !o.fly) { const wp = this.guideTo(o.x, o.z, 2.3); if (wp) { t.via = wp; t.len = wp.len; } }
    return t;
  }
  /* no progress for 10 s: say the instruction again; a companion calls the way (level 2 and on) */
  nudge(level) {
    const o = this._objNow; if (!o || this.arriving || this.done || this.f.paused) return;
    const who = (this.f.wisps || []).find((w) => w.c && w.c.kind === 'person' && (w.state === 'with' || w.state === 'return'));
    this.lineUntil = 0;
    if (level >= 2 && who && !o.foe) { this.say(`${who.name}: “This way.”`, '', 2600); if (o.x != null) { const c = who.c; if (c) { c.focus = { x: o.x, z: o.z, until: c.t + 2.6 }; c.mood = { clip: 'Idle_Talking_Loop', until: c.t + 2.2, react: true }; } } }
    else this.say(o.line, '', 2400);
    this.el.classList.remove('gd-flash'); void this.el.offsetWidth; this.el.classList.add('gd-flash');
  }
  hud() {
    const body = document.body.classList; const hide = body.contains('chap') || body.contains('cine') || this.arriving;
    const op0 = hide ? '0' : '1'; if (this.el.style.opacity !== op0) this.el.style.opacity = op0;
    /* text changes a few times a second at most (distance in whole metres) */
    this.hudT = (this.hudT || 0) + 1;
    if (this.hudT % 4 === 0 || !this._objNow) {
      const o = this.objective(); this._objNow = o;
      if (o.line !== this.headText) { const first = !this.headText; this.headText = o.line; this.head.textContent = o.line; if (!hide) this.f.guideM?.cue(this.el, !first); }
      const sub = o.sub || ''; if (sub !== this.subText) { this.subText = sub; this.sub.textContent = sub; }
      { const fd = this.mode === 'gate' ? this.stops.find((x) => x.state === 'fight') : null; const c = fd?.foe; const k = c && !c.gone && c.state !== 'dead' ? Math.round(clamp(c.hp / c.maxHp, 0, 1) * 50) : -1; if (k !== this.barK) { this.barK = k; this.bar.style.display = k < 0 ? 'none' : 'block'; if (k >= 0) this.bar.firstChild.style.width = `${k * 2}%`; } }
    }
  }
  /* where to go now, by shape: the nearest thing not found (far light, hearth, cage); the next sign or challenge in order (trail, gate) */
  next() {
    const f = this.f; let best = null; let bd = 1e9;
    const o = this._next || (this._next = { x: 0, y: 0, z: 0, end: false, foe: false });
    o.end = false; o.foe = false; o.fd = null;
    if (this.view?.active && !this.view.done) { o.x = this.view.x; o.z = this.view.z; o.y = this.gy(o.x, o.z); return o; }
    if (this.mode === 'trail' && this.scout && this.scout.state !== 'rest' && !this.scout.foe.gone) { const p = this.scout.foe.pos; o.x = p.x; o.z = p.z; o.y = this.gy(p.x, p.z); o.foe = true; return o; }
    if (this.mode === 'trail' && this.found >= 3) { o.x = this.rest.x; o.z = this.rest.z; o.y = this.gy(o.x, o.z); return o; }
    if (this.mode === 'hearth' && this.raid) for (const x of this.raid) if (x.going && !x.foe.gone) { o.x = x.foe.pos.x; o.z = x.foe.pos.z; o.y = this.gy(o.x, o.z); o.foe = true; return o; }
    const ordered = this.mode === 'trail' || this.mode === 'gate' || this.mode === 'farlight';
    for (const fd of this.stops) if (!fd.got) { if (ordered) { best = fd; break; } const d = (fd.x - f.pos.x) ** 2 + (fd.z - f.pos.z) ** 2; if (d < bd) { bd = d; best = fd; } }
    if (best) { o.x = best.x; o.z = best.z; o.y = this.gy(best.x, best.z); o.fd = best; } else { o.x = this.lx; o.z = this.lz; o.y = this.light.position.y; o.end = true; }
    return o;
  }
  /* called by fight.updateWisps for each companion: far light = the first light walks a little ahead, toward where to go;
     hearth = the first companion is the one the hero walks home (its own pace), the rest keep at its side;
     cage = a named one waits in the cage until it is opened */
  lead(tgt, clock, w = null) {
    if (this.done) return;
    if (this.mode === 'cage' && w && w === this.keptWisp && !this.freed) { tgt.x = this.lx; tgt.z = this.lz; return; }
    if (!w) return;
    /* every companion walks with the hero on every walk, in view (ahead toward the next goal, a little aside), at its
       own pace (never a slide of metres); the protect walk's first companion is the one the raiders come for (this.esc) */
    const S = this.mode === 'hearth' && this.esc && w.i === 0 ? this.esc : this.cstate(w); tgt.x = S.x; tgt.z = S.z;
    /* fight.js eases the body toward this point (p.lerp(tgt, dt * 3.2)), so a walking body trailed its point by about
       1.6 m and came that much closer to the hero than the distance rule allows (storybook: Wren at the frame edge). The
       target is set so that the ease lands on the point itself. */
    const a = Math.min(1, (this.cdt || 0) * (w.state === 'return' ? 1.6 : 3.2)); const p = w.sp?.position;
    if (p && a > 0.02 && a < 1 && Math.hypot(S.x - p.x, S.z - p.z) < 2.5 /* a knock-back or a jump still eases */) { tgt.x = p.x + (S.x - p.x) / a; tgt.z = p.z + (S.z - p.z) / a; }
  }
  /* one companion's walking point (kept per companion, moved at most `speed` m/s toward where it wants to be) */
  cstate(w) {
    const m = this.cs || (this.cs = new Map()); let S = m.get(w);
    if (!S) { const p = w.sp.position; S = { x: p.x, z: p.z, px: p.x, pz: p.z, t: -1 }; m.set(w, S); }
    return S;
  }
  /* who walks: the companions not in the cage, in order; slot k gets a side and a distance */
  walkers() { return (this.f.wisps || []).filter((w) => !(this.mode === 'cage' && w === this.keptWisp && !this.freed) && (w.state === 'with' || w.state === 'return')); }
  /* where companion slot k wants to stand now: ahead of the hero toward the goal; behind the hero when a foe is near
     (a person) or between the hero and the foe (the dog); the dog runs ahead to the next thing to find and waits by it */
  formation(k, kind, out) {
    const f = this.f; const G = this.arriving ? { x: this.lx, z: this.lz, end: true } : this.next();
    let ux = G.x - f.pos.x; let uz = G.z - f.pos.z; let ud = Math.hypot(ux, uz);
    if (ud < 3) { const fw = f.forward(); ux = fw.x; uz = fw.z; ud = 1; } else { ux /= ud; uz /= ud; }
    const px = -uz; const pz = ux; const side = k % 2 ? -1 : 1; out.mood = null; out.focus = null;
    const foe = this.nearFoe;
    if (foe && this.foeD < 14 && !this.arriving) {
      let fx = foe.pos.x - f.pos.x; let fz = foe.pos.z - f.pos.z; const fd = Math.hypot(fx, fz) || 1; fx /= fd; fz /= fd;
      if (kind === 'animal') { out.x = f.pos.x + fx * 2.2 - fz * side * 1.6; out.z = f.pos.z + fz * 2.2 + fx * side * 1.6; out.mood = 'growl'; }
      else { out.x = f.pos.x - fx * 3.4 - fz * side * (1.8 + k * 0.8); out.z = f.pos.z - fz * 3.4 + fx * side * (1.8 + k * 0.8); out.mood = 'Crouch_Idle_Loop'; }
      out.focus = foe.pos; return out;
    }
    /* the dog finds it first: it runs to the next stop (when the hero is within 32 m of it) and waits beside it */
    if (kind === 'animal' && !G.end && !G.foe && ud < 32 && ud > 3.2 && (this.mode === 'farlight' || this.mode === 'hearth' || this.mode === 'trail' || this.mode === 'cage')) {
      out.x = G.x - ux * 1.5 + px * side * 1.1; out.z = G.z - uz * 1.5 + pz * side * 1.1; out.mood = ud < 9 ? 'wag' : null; out.focus = { x: G.x, z: G.z }; return out;
    }
    const ahead = 6.4 + Math.floor(k / 2) * 1.6; const lat = 3.3 + Math.floor(k / 2) * 0.6; /* a little further out (Wren clipped the frame edge at 5.2 / 2.9) */
    out.x = f.pos.x + ux * ahead + px * side * lat; out.z = f.pos.z + uz * ahead + pz * side * lat;
    return out;
  }
  /* each frame (before fight.updateWisps reads lead): every walker moves toward its formation point at its own pace */
  updateCompanions(dt) {
    this.cdt = dt; const f = this.f; const list = this.walkers(); const hs = (f.archetype?.speed || 5.2) * Math.max(1, f.pace);
    const o = this._fo || (this._fo = { x: 0, z: 0 });
    let k = 0;
    for (const w of list) {
      const kind = w.c?.kind || 'flame'; const S = this.cstate(w);
      if (this.mode === 'hearth' && this.esc && w.i === 0) { S.x = this.esc.x; S.z = this.esc.z; this.moodOf(w, this.esc.stun > 0 ? 'Hit_Knockback' : this.foeD < 14 ? 'Crouch_Idle_Loop' : null, this.nearFoe?.pos); k++; continue; }
      this.formation(k, kind, o); k++;
      /* the first frame of the walk puts each companion on its own walk point (storybook: Wren stood in the lens under the chapter title) */
      if (S.t === -1) { S.t = 0; if (Math.hypot(S.x - f.pos.x, S.z - f.pos.z) < 4.8) { S.x = S.px = o.x; S.z = S.pz = o.z; this.push(this.solids, S, S.x, S.z); if (w.sp?.position) { w.sp.position.x = S.x; w.sp.position.z = S.z; } } }
      const dx = o.x - S.x; const dz = o.z - S.z; const d = Math.hypot(dx, dz);
      /* far behind (a fade, a jump of the hero): it catches up at a run */
      const sp = (kind === 'animal' ? 1.35 : 1.22) * hs /* faster than the hero, so they get ahead into view and stay there (neon: they dropped out of view) */ * (d > 12 ? 1.5 : 1) * clamp(d / 1.2, 0, 1);
      const step = Math.min(d, sp * dt);
      S.px = S.x; S.pz = S.z; if (d > 1e-4) { S.x += (dx / d) * step; S.z += (dz / d) * step; }
      this.push(this.solids, S, S.px, S.pz);
      /* and never square in the middle of the view up close: a person straight ahead within 6 m steps aside, out of the centre */
      { const fw = f.forward(); const ax = S.x - f.pos.x; const az = S.z - f.pos.z; const ad = Math.hypot(ax, az); const fl = Math.hypot(fw.x, fw.z) || 1; const fx = fw.x / fl; const fz = fw.z / fl;
        const along = ax * fx + az * fz; const side = ax * -fz + az * fx;
        if (kind !== 'animal' && ad < 6 && along > 0 && Math.abs(side) < 2.6) { const sg = side >= 0 ? 1 : -1; const ns = sg * 2.6; S.x = f.pos.x + fx * along + -fz * ns; S.z = f.pos.z + fz * along + fx * ns; } }
      /* the distance rule runs last, so the step aside never brings a person closer than it */
      /* never in the camera: at least 3.2 m from the hero (a person at 2.3 m filled the edge of the frame); a dog may come to 2.4 m */
      const hx = S.x - f.pos.x; const hz = S.z - f.pos.z; const hd = Math.hypot(hx, hz); const fw0 = f.forward();
      /* a person in the front half of the view keeps 4.8 m off (at 3.2 m storybook's Wren filled the edge of the frame) */
      const minD = kind === 'animal' ? 2.4 : (hx * fw0.x + hz * fw0.z > 0 ? 4.8 : 3.2);
      if (hd < minD) { const kx = hd > 1e-3 ? hx / hd : -f.forward().z; const kz = hd > 1e-3 ? hz / hd : f.forward().x; S.x = f.pos.x + kx * minD; S.z = f.pos.z + kz * minD; }
      this.moodOf(w, o.mood, o.focus);
    }
  }
  /* a companion's mood and where it looks (folk.js reads c.mood and c.focus); short moods (a nod, a wag) set by react() win */
  moodOf(w, clip, focus) {
    const c = w.c; if (!c) return;
    if (c.mood?.react && c.t < c.mood.until) return;
    if (clip) { if (c.mood?.clip !== clip || c.t > c.mood.until - 0.2) c.mood = { clip, until: c.t + 0.6, move: clip === 'growl' || clip === 'wag' }; } else if (c.mood && !c.mood.react) c.mood = null;
    c.focus = focus ? { x: focus.x, z: focus.z, until: c.t + 0.6 } : c.focus;
  }
  /* the companions react: at a find (a nod, a wag), a blow, an arrival; they look at (x, z) */
  react(kind, x, z, dur = 1.8) {
    for (const w of this.f.wisps || []) {
      const c = w.c; if (!c) continue;
      const clip = c.kind === 'animal' ? 'wag' : kind === 'find' ? 'Yes' : kind === 'cheer' ? 'Dance_Loop' : kind === 'talk' ? 'Idle_Talking_Loop' : kind === 'fear' ? 'Crouch_Idle_Loop' : kind === 'look' ? 'Idle_FoldArms_Loop' : 'Yes';
      c.mood = { clip, until: c.t + dur, move: c.kind === 'animal', react: true };
      if (x != null) c.focus = { x, z, until: c.t + dur };
    }
  }
  say(text, sub = '', ms = 3000) {
    const f = this.f; const now = f.clock; const at = Math.max(now, this.lineUntil); const gen = this.arriving;
    this.lineUntil = at + ms / 1000 + 0.3;
    const go = () => { if (!f.over && !this.disposed && this.arriving === gen) f.hud.line?.(text, sub, ms); };
    if (at <= now) go(); else setTimeout(go, (at - now) * 1000);
  }

  /* ---------- foes on the way ---------- */
  async spawnOne(type, def, pos, hold, opt = {}) {
    const f = this.f;
    await f.spawnWave(null, { quiet: true, spec: [[type, 1, { def, hold, ...opt, place: () => new THREE.Vector3(pos.x, 0, pos.z) }]] });
    const foe = f.foes.find((x) => x.def === def); if (!foe) return null;
    foe.actor.noBlob = true; /* the world's contact blobs sit at y = 0; on the walk the ground is not */
    if (this.disposed || this.arriving) { this.despawn(foe); return null; }
    this.foes.push(foe); return foe;
  }
  foeDef(type, label) { const f = this.f; const base = byId(f.kit?.FOES || FOES, type) || byId(FOES, type); return { ...base, label: label || f.nameOf(base), own: true }; }
  async spawnWatcher() {
    if (!this.watchAt) return;
    const f = this.f;
    const def = this.foeDef('rogue', f.story?.farlight?.watcherName || `${f.minions?.one || 'Hollow'} Watcher`); /* the world's own watcher name */
    const foe = await this.spawnOne('rogue', def, this.watchAt, true);
    if (!foe) return; foe.group.since = 1e9; /* no tactic for it: it only watches */
    this.watcher = { foe, state: 'watch', t: 0 };
  }
  despawn(foe) {
    const f = this.f; if (!foe || foe.gone) return;
    f.releaseToken?.(foe); foe.state = 'dead'; foe.group.members = foe.group.members.filter((x) => x !== foe);
    try { foe.actor.dispose(); } catch { /* gone */ } foe.gone = true; if (f.lock === foe) f.lock = null;
  }
  updateWatcher(dt) {
    const W = this.watcher; if (!W || W.state === 'gone') return; const f = this.f; const foe = W.foe;
    if (foe.gone || foe.state === 'dead') { W.state = 'gone'; return; }
    W.t += dt; const d = Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z);
    const along = f.pos.x * this.ux + f.pos.z * this.uz;
    if (W.state === 'watch' && (d < 26 || along > this.watchAt.t + 6 || foe.hp < foe.maxHp)) {
      W.state = 'leave'; W.t = 0; foe.hold = false; foe.flee = true;
      /* no line: the watcher's plate and the roar say it */ sfx('roar', { gain: 0.35 });
      f.director.event('A watcher saw the hero and runs to tell the enemy.');
    } else if (W.state === 'leave') {
      foe.flee = true;
      if (W.t > 3.5) foe.actor.fade(clamp(1 - (W.t - 3.5) / 1.4, 0, 1));
      if (W.t > 5) { this.despawn(foe); W.state = 'gone'; }
    }
  }

  /* ---------- per frame ---------- */
  live() { const f = this.f; let n = null; let nd = 1e9; for (const x of f.foes) { if (x.state === 'dead' || x.hold || x.flee || x.gone || x.going) continue; const d = Math.hypot(x.pos.x - f.pos.x, x.pos.z - f.pos.z); if (d < nd) { nd = d; n = x; } } this.nearFoe = n; return n ? nd : 1e9; }
  push(list, p, px, pz) {
    let x = p.x; let z = p.z;
    for (const c of list) {
      if (c.w && c.d) {
        /* a long footprint (a house, a wall): a box (w along its own x, d along z, turned by ry); out along the nearest edge */
        const cs = Math.cos(c.ry || 0); const sn = Math.sin(c.ry || 0); const dx = x - c.x; const dz = z - c.z;
        const lx = dx * cs - dz * sn; const lz = dx * sn + dz * cs; const hw = c.w / 2 + 0.35; const hd = c.d / 2 + 0.35;
        if (Math.abs(lx) < hw && Math.abs(lz) < hd) { let ox = lx; let oz = lz; if (hw - Math.abs(lx) < hd - Math.abs(lz)) ox = Math.sign(lx || 1) * hw; else oz = Math.sign(lz || 1) * hd; x = c.x + ox * cs + oz * sn; z = c.z - ox * sn + oz * cs; }
        continue;
      } const dx = x - c.x; const dz = z - c.z; const d2 = dx * dx + dz * dz; if (d2 < c.r * c.r && d2 > 1e-6) { const d = Math.sqrt(d2); const nx = dx / d; const nz = dz / d; const mx = x - px; const mz = z - pz; const side = this.slideT > 0 && px === this.px ? this.slideSide * -1 : (mx * nz - mz * nx >= 0 ? 1 : -1); const pen = c.r - d; /* walking straight into a post: slide round it, not stop dead */ x = c.x + nx * c.r - nz * side * pen * 0.6; z = c.z + nz * c.r + nx * side * pen * 0.6; } }
    p.x = x; p.z = z;
  }
  constrain() {
    const f = this.f; const p = f.pos;
    this.push(this.solids, p, this.px, this.pz); this.push(this.solidsL, p, this.px, this.pz);
    let x = p.x; let z = p.z;
    /* a soft box around the walk; the land goes on far past it, so no edge shows */
    const t = clamp(x * this.ux + z * this.uz, -24, this.D + 26); const s = clamp(x * this.nx + z * this.nz, -58, 58);
    x = this.ux * t + this.nx * s; z = this.uz * t + this.nz * s;
    /* no climbing cliffs, no walking into deep water: slide along, or stay */
    const step = Math.hypot(x - this.px, z - this.pz);
    if (step > 1e-4) {
      const h0 = this.gy(this.px, this.pz); const bad = (xx, zz) => { const h = this.gy(xx, zz); return (h - h0) / Math.max(step, 0.05) > 1.0 || this.wet(h) || (h < this.floor && h < h0 - 0.02); };
      if (bad(x, z)) { if (!bad(x, this.pz)) z = this.pz; else if (!bad(this.px, z)) x = this.px; else { x = this.px; z = this.pz; } }
    }
    p.x = x; p.z = z; this.px = x; this.pz = z;
  }
  /* ---------- the way round a wall ---------- */
  navNow() { return this.nav || (this.nav = makeNav(this)); }
  /* the next corner of the route to (gx, gz) when the straight walk is shut (a wall, a fence of footprints, water, a cliff);
     null when the straight walk is open or no route reaches the goal. rg = how close counts as there (2.3 m a find, 6.2 m the end).
     The answer is kept for 0.25 s and while the hero stays within 1.5 m of where it was made (the HUD asks every frame). */
  guideTo(gx, gz, rg = 2.3, fresh = false) {
    const f = this.f; const C = this.gd; const now = performance.now();
    if (!fresh && C && Math.abs(C.gx - gx) < 0.5 && Math.abs(C.gz - gz) < 0.5 && now - C.at < 250 && Math.hypot(C.px - f.pos.x, C.pz - f.pos.z) < 1.5) return C.out;
    const nav = this.navNow(); const dx = gx - f.pos.x; const dz = gz - f.pos.z; const d = Math.hypot(dx, dz) || 1; const short = Math.min(d, rg * 0.7);
    let out = null;
    if (!nav.clear(f.pos.x, f.pos.z, gx - (dx / d) * short, gz - (dz / d) * short)) {
      const R = nav.route(f.pos.x, f.pos.z, gx, gz, rg);
      if (R && R.pts.length > 1) { let i = 1; while (i < R.pts.length - 1 && Math.hypot(R.pts[i].x - f.pos.x, R.pts[i].z - f.pos.z) < 1.4) i++; out = { x: R.pts[i].x, z: R.pts[i].z, len: R.len }; }
    }
    this.gd = { gx, gz, at: now, px: f.pos.x, pz: f.pos.z, out };
    return out;
  }
  /* where the HUD mark points: the goal, or the next corner of the route to it */
  markAt(G) {
    if (G.foe || this.arriving || this.done) return G;
    const wp = this.guideTo(G.x, G.z, G.end ? 6.2 : 2.3); if (!wp) return G;
    const M = this._mk || (this._mk = { x: 0, y: 0, z: 0 }); M.x = wp.x; M.z = wp.z; M.y = this.gy(wp.x, wp.z); return M;
  }
  /* the stuck guard counts progress toward the goal (the next stop), not motion: a snap back or a slide to and fro is
     no progress. 2 s with W held and no gain of 0.5 m: inside a footprint = back to the last free place; then a detour
     point round the side of the blocking cluster with the shorter arc (the bot walks to it; a player is slid that way) */
  watchStuck(dt) {
    const f = this.f; const G0 = this.next(); const wp = G0.foe || this.arriving ? null : this.guideTo(G0.x, G0.z, G0.end ? 6.2 : 2.3); const G = wp || G0; /* with a route, the walk to the next corner is the progress that counts; a find never moves while a route reaches it */
    const S = this.stuck || (this.stuck = { best: 1e9, gx: G.x, gz: G.z, t: 0, k: 0 });
    if (this.detour && (f.clock > this.detour.until || Math.hypot(this.detour.x - f.pos.x, this.detour.z - f.pos.z) < 1.2)) this.detour = null;
    const gd = Math.hypot(G.x - f.pos.x, G.z - f.pos.z);
    if (Math.hypot(G.x - S.gx, G.z - S.gz) > 3 || !f.keys.has('KeyW') || this.foeD < 14 || G.foe) { S.gx = G.x; S.gz = G.z; S.best = gd; S.t = 0; return; }
    if (gd < S.best - 0.5) { S.best = gd; S.t = 0; if (!this.nearSolid(f.pos.x, f.pos.z, 0.6)) { const L = this.lastFree || (this.lastFree = { x: 0, z: 0 }); L.x = f.pos.x; L.z = f.pos.z; } return; }
    S.t += dt; if (S.t < 2) return;
    S.t = 0; S.k++;
    /* the third try round the same goal has failed: the thing to find sits where no one can reach it (a building's corner
       the footprints do not cover). It moves to a clear place just short of it, on the hero's side */
    if (S.k >= 3 && S.k % 3 === 0) {
      const fd = this.stops.find((x) => x.g && !x.got && Math.abs(x.x - G.x) < 0.01 && Math.abs(x.z - G.z) < 0.01);
      if (fd) { const dx = f.pos.x - fd.x; const dz = f.pos.z - fd.z; const dd = Math.hypot(dx, dz) || 1; fd.x = f.pos.x - (dx / dd) * Math.min(dd, 2.2); fd.z = f.pos.z - (dz / dd) * Math.min(dd, 2.2); fd.g.position.set(fd.x, this.low(fd.x, fd.z, 0.6), fd.z); S.gx = fd.x; S.gz = fd.z; S.best = 1e9; return; }
    }
    if (this.lastFree && this.inSolid(f.pos.x, f.pos.z)) { f.pos.x = this.lastFree.x; f.pos.z = this.lastFree.z; this.px = f.pos.x; this.pz = f.pos.z; f.vel.set(0, 0, 0); }
    const D = this.around(f.pos.x, f.pos.z, G.x, G.z, S.k) || this.sidestep(f.pos.x, f.pos.z, G.x, G.z, S.k); if (D) { this.detour = { x: D.x, z: D.z, until: f.clock + 6 }; if (D.side) { this.slideSide = D.side; this.slideT = 6; } }
  }
  /* no footprint in the way (a ledge, a hollow): a point 6 m to one side and 4 m on, alternating sides */
  sidestep(x, z, gx, gz, k) { let ux = gx - x; let uz = gz - z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul; const side = k % 2 ? 1 : -1; return { x: x - uz * side * 6 + ux * 4, z: z + ux * side * 6 + uz * 4, side: 0 }; }
  inSolid(x, z) { for (const c of this.solids) { if (c.w) { const cs = Math.cos(c.ry || 0); const sn = Math.sin(c.ry || 0); const dx = x - c.x; const dz = z - c.z; if (Math.abs(dx * cs - dz * sn) < c.w / 2 && Math.abs(dx * sn + dz * cs) < c.d / 2) return true; } else if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r - 0.05) ** 2) return true; } return false; }
  /* the cluster of footprints in the way (those touching the hero, and every one within 1.5 m of those), and a point past
     its side: side +1/-1 = left/right of the line to the goal; the shorter side first, the other when that one is blocked
     or on every second try */
  around(x, z, gx, gz, k) {
    let ux = gx - x; let uz = gz - z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul; const qx = -uz; const qz = ux;
    const R = (c) => (c.w ? Math.hypot(c.w, c.d) / 2 : c.r);
    const set = this.solids.filter((c) => Math.hypot(c.x - x, c.z - z) < R(c) + 2.5); if (!set.length) return null;
    for (let i = 0; i < set.length; i++) for (const c of this.solids) if (!set.includes(c)) { const a = set[i]; if (Math.hypot(c.x - a.x, c.z - a.z) < R(a) + R(c) + 1.5) set.push(c); }
    let lo = 0; let hi = 0; let al = 0; for (const c of set) { const ls = (c.x - x) * qx + (c.z - z) * qz; const la = (c.x - x) * ux + (c.z - z) * uz; lo = Math.min(lo, ls - R(c)); hi = Math.max(hi, ls + R(c)); al = Math.max(al, la); }
    const sides = hi < -lo ? [1, -1] : [-1, 1]; if (k % 2 === 0) sides.reverse();
    for (const side of sides) for (const extra of [2, 4]) {
      const off = side > 0 ? hi + extra : lo - extra; const along = clamp(al, 1, ul);
      const px = x + qx * off + ux * along * 0.5; const pz = z + qz * off + uz * along * 0.5;
      if (!this.blocked(x, z, px, pz, 0.6) && !this.wet(this.gy(px, pz)) && !this.sunk(px, pz)) return { x: px, z: pz, side };
    }
    const side = sides[0]; const off = side > 0 ? hi + 3 : lo - 3; return { x: x + qx * off, z: z + qz * off, side };
  }
  nearSolid(x, z, pad) { for (const c of this.solids) { const r = (c.w ? Math.hypot(c.w, c.d) / 2 : c.r) + pad; if ((c.x - x) ** 2 + (c.z - z) ** 2 < r * r) return true; } return false; }
  update(dt) {
    if (this.done) return;
    const f = this.f; this.t += dt; const time = this.w.time;
    if (!this.arriving) { if (this.slideT > 0) this.slideT -= dt; this.constrain(); this.watchStuck(dt); }
    const g = this.gy(f.pos.x, f.pos.z); f.footY += (g - f.footY) * Math.min(1, dt * 14);
    const foeD = this.live(); this.foeD = foeD;
    this.updateCompanions(dt); /* also while arriving: the camera turns to the end, and a companion left standing in its path filled the frame (edo gate) */
    /* travel pace: with W held and no foe near, the hero walks on at a faster pace */
    /* the trail is read, not run: a slower top pace; no pace at all while the scout runs (the chase is on foot) */
    const top = this.mode === 'trail' ? 1.05 : this.mode === 'gate' ? 1.0 : 1.3; /* the glory road is a procession, walked, not run */ const chase = this.scout && this.scout.state === 'run';
    const want = !this.arriving && !chase && foeD > 18 && f.keys.has('KeyW') && !f.blocking && !f.swing ? top : 1;
    f.pace += (want - f.pace) * Math.min(1, dt * (want > f.pace ? 1.2 : 4));
    for (const h of this.handles) if (!h.wmk) h.update(dt);
    if (this.kept) this.kept.update(dt, f.clock, this.w.camera);
    if (this.mode === 'farlight') { this.updateWatcher(dt); this.updateLure(dt); }
    else if (this.mode === 'hearth') this.updateEscort(dt);
    else if (this.mode === 'trail') this.updateTrail(dt);
    else if (this.mode === 'cage') this.updateCage(dt);
    else this.updateGate(dt);
    /* one goal at a time: only the current target stop shows its mark (shaft, waymark, ring); the others wait unmarked */
    { const G = this.next(); this.target = G.fd || null; }
    /* the stops gathered or read by standing by them */
    for (const fd of this.stops) if (fd.g) this.updateStop(fd, dt, time, foeD);
    this.updateView(dt, foeD);
    if (this.q2) { try { Q2.tickWalk(this, dt); } catch (err) { console.warn('quest walk', err); } }
    /* the end */
    this.roadCloth?.update(dt);
    this.tickLight(dt);
    if (!this.arriving) this.checkEnd(foeD);
    this.hud();
  }
  updateStop(fd, dt, time, foeD) {
    const f = this.f; const d = Math.hypot(fd.x - f.pos.x, fd.z - f.pos.z);
    /* nothing is picked up on the wonder walk: the thing lies there, and it glows once the lure has shown it */
    if (this.mode === 'farlight') {
      if (!fd.got && fd.i === 1 && !this.ambushed && d < 4.5 && !this.arriving) { this.ambushed = true; this.ambush(fd); }
      fd.shaft.visible = false; fd.motes.visible = false; fd.ring.material.opacity = 0; fd.fill.material.opacity = 0;
      fd.glow.material.opacity += ((this.beams && fd.got ? 0.8 : 0) - fd.glow.material.opacity) * Math.min(1, dt * 2); fd.glow.position.y = fd.top;
      if (fd.got) fd.im.rotation.y += dt * 0.6;
      return;
    }
    const shown = fd.kind !== 'sign' || fd.i <= this.found;
    if (fd.kind === 'sign') { fd.g.visible = shown || fd.k > 0.02; if (!shown) return; }
    if (!fd.got && !fd.seen && d < 34) { fd.seen = true; fd.pulse = 1; sfx('soul', { gain: 0.45 }); }
    fd.pulse = Math.max(0, (fd.pulse || 0) - dt * 0.6);
    if (!fd.got && !this.arriving) {
      /* the second find (far light): something waits there */
      if (this.mode === 'farlight' && fd.i === 1 && !this.ambushed && d < 4.5) { this.ambushed = true; this.ambush(fd); }
      const blocked = foeD < 12 || f.spawning;
      const T = fd.kind === 'sign' ? 1.3 : GATHER_T;
      if (d < GATHER_R && !blocked && fd.kind !== 'sign') { /* the scout's signs are passed on the run, not read */
        fd.hold += dt;
        /* the reach: the hero bends down for it; the hand is lowest as the hold fills */
        if (!fd.reached && fd.kind !== 'sign' && fd.hold > T - 0.75) { /* a sign is read standing up, not reached for */ fd.reached = f.reachOut?.(1.15) !== false; if (fd.reached) sfx('dodge', { gain: 0.32 }); }
        if (fd.hold >= T) this.take(fd);
      } else { fd.hold = Math.max(0, fd.hold - dt * 1.5); if (fd.hold === 0) fd.reached = false; }
    }
    /* looks: the shaft and motes fade once it is taken (a sign fades in when the one before it is read); the ring fills */
    const T = fd.kind === 'sign' ? 1.3 : GATHER_T;
    fd.k += ((fd.got ? 0 : shown ? (fd === this.target || d < 8 ? 1 : 0.12) : 0) - fd.k) * Math.min(1, dt * 1.5);
    fd.shaft.material.uniforms.uK.value = 0.9 * fd.k * (1 + fd.pulse * 1.5); fd.shaft.material.uniforms.uTime.value = time;
    fd.motes.material.opacity = 0.9 * fd.k; fd.motes.visible = this.beams && fd.k > 0.02; fd.shaft.visible = this.beams && fd.k > 0.02;
    if (fd.wm) { const W = this.wmArgs || (this.wmArgs = { k: 0, near: 0, t: 0 }); W.k = fd.k * Math.min(1, 0.3 + d / 12); W.near = !fd.got && d < 6 ? 1 : 0; W.t = time; fd.wm.update(dt, W); }
    const ch = fd.got ? 0 : clamp(fd.hold / T, 0, 1); const near = !fd.got && d < 6 ? 1 : 0;
    fd.ring.material.opacity += ((near ? 0.35 + ch * 0.5 : 0) - fd.ring.material.opacity) * Math.min(1, dt * 6); fd.fill.material.opacity = ch * 0.22;
    fd.fill.scale.setScalar(0.15 + ch * 0.85);
    if (!this.beams) { fd.glow.material.opacity = 0; if (fd.fly < 0 && !fd.still) { fd.im.position.y = fd.top; } else if (fd.fly >= 0 && fd.fly < 1) { fd.fly = Math.min(1, fd.fly + dt / 0.5); fd.im.scale.setScalar(1 - ease(fd.fly) * 0.9); if (fd.fly >= 0.55) fd.im.visible = false; } }
    else if (fd.noFly) { fd.glow.material.opacity = fd.k * 0.7; }
    else if (fd.fly < 0) { if (!fd.still) { fd.im.position.y = fd.top + Math.sin(time * 1.6 + fd.i) * 0.04; fd.im.rotation.y += dt * 0.8; } fd.glow.position.y = fd.still ? 0.4 : fd.im.position.y; fd.glow.scale.setScalar(0.85 + ch * 0.6 + Math.sin(time * 3 + fd.i) * 0.04); }
    else if (fd.fly < 1) {
      /* the found thing comes to the hero's hand, then it is carried */
      fd.fly = Math.min(1, fd.fly + dt / 0.8); const e = ease(fd.fly); const cam = this.w.camera;
      cam.getWorldDirection(this.tmp2); this.tmp.copy(cam.position).addScaledVector(this.tmp2, 1.6); this.tmp.y -= 0.5; fd.g.worldToLocal(this.tmp);
      fd.im.position.set(fd.im.position.x + (this.tmp.x - fd.im.position.x) * e * 0.5, fd.im.position.y + (this.tmp.y - fd.im.position.y) * e * 0.5, fd.im.position.z + (this.tmp.z - fd.im.position.z) * e * 0.5);
      fd.glow.position.copy(fd.im.position); const s = 1 - e * 0.85; fd.im.scale.setScalar(s); fd.glow.scale.setScalar(0.85 * (1 + e)); fd.glow.material.opacity = 1 - e;
      if (fd.fly >= 0.55) { fd.im.visible = false; fd.glow.visible = false; }
    }
    this.animMotes(fd.motes, 34, 6, 0.9, time, fd.k);
  }
  checkEnd(foeD) {
    const f = this.f; const dl = Math.hypot(this.lx - f.pos.x, this.lz - f.pos.z);
    if (this.mode === 'farlight') {
      if (this.found >= 3 && dl < 7.2 && foeD > 12) this.arrive();
    } else if (this.mode === 'hearth') {
      const E = this.esc; const de = Math.hypot(this.lx - E.x, this.lz - E.z);
      if (this.found >= 3 && (this.q2on ? dl < 11 && de < 14 : dl < 8 && de < 4.5) && foeD > 12) this.arriveAt(); /* no wait at the end of the new protect walk */
      else if (this.found < 3 && (dl < 9 || de < 4) && !this.toldBack) { this.toldBack = true; this.say(this.T.missing?.(3 - this.found) || 'There is more to find.', '', 2600); }
    } else if (this.mode === 'cage') {
      if (this.found >= 3 && dl < (this.q2on ? 9.5 : 6.5) && foeD > 12) this.arriveAt();
      else if (this.found < 3 && dl < 8 && !this.toldBack) { this.toldBack = true; this.say(`${3 - this.found === 1 ? 'One chain still holds' : `${3 - this.found} chains still hold`} it.`, '', 2600); }
    } else if (this.mode === 'gate') {
      if (this.found >= 3 && dl < 7.5 && foeD > 12) this.arriveAt();
    }
    /* the trail ends at the kill (updateTrail) */
  }
  animMotes(pts, n, height, rad, time, k) {
    if (k < 0.02) return;
    const pos = pts.geometry.attributes.position; const a = pos.array; const sd = pts.userData.seed;
    for (let i = 0; i < n; i++) {
      const ph = sd[i * 4]; const sp = sd[i * 4 + 1]; const rr = sd[i * 4 + 2] * rad; const an = sd[i * 4 + 3] + time * (0.25 + sp * 0.3);
      const u = (ph + time * sp * 0.06) % 1;
      a[i * 3] = Math.cos(an) * rr * (1 - u * 0.4); a[i * 3 + 1] = 0.2 + u * height; a[i * 3 + 2] = Math.sin(an) * rr * (1 - u * 0.4);
    }
    pos.needsUpdate = true;
  }
  tickLight(dt) {
    const time = this.w.time;
    this.flare = Math.max(0, this.flare - dt * 0.45);
    /* the far end stays a faint glow while the finds are out (two bright pillars at once read as two goals) */
    const want0 = this.mode === 'farlight' && this.found < 3 && !this.arriving && !this.done ? 0.07 : 1; this.endK = (this.endK ?? want0) + (want0 - (this.endK ?? want0)) * Math.min(1, dt * 0.8);
    const k = this.lightK * this.endK * (1 + this.flare * 2.2);
    /* in the dark world the far pillar read as a red laser: a faint haze with a thin, dim core there */
    const dk = (this.f.kit?.id || 'dark') === 'dark' && this.mode !== 'farlight'; this.shaftO.material.uniforms.uK.value = 2.2 * k * (dk ? 0.45 : 1); this.shaftI.material.uniforms.uK.value = 5.0 * k * (dk ? 0.12 : 1);
    this.shaftO.material.uniforms.uTime.value = time; this.shaftI.material.uniforms.uTime.value = time * 1.3;
    this.pool.material.uniforms.uK.value = 0.55 * k; this.lightGlow.material.opacity = Math.min(1, 0.85 * k); this.lightGlow.scale.setScalar(4 + this.flare * 5);
    this.lightMotes.material.opacity = Math.min(1, 0.9 * k); if (this.beams) this.animMotes(this.lightMotes, 90, 14 + this.flare * 10, 2.2 + this.flare * 2.5, time, k);
    if (this.farPiece) this.farPiece.update?.(dt, { k: clamp(k, 0, 1), flare: this.flare });
    if (this.goalWm) { const W = this.goalArgs || (this.goalArgs = { k: 1, near: 0, t: 0 }); /* the mark does not follow the light's dimming in chapter II (it shrank and grew back): it holds, and fades out over 0.5 s when the enemy comes */ this.goalK = (this.goalK ?? 1) + (((this.done && this.f.stage >= 3) ? 0 : 1) - (this.goalK ?? 1)) * Math.min(1, dt * 2); W.k = this.goalK; W.t = time; W.near = this.arriving ? 1 : 0; this.goalWm.update(dt, W); }
    /* the laid finds turn slowly on the altar */
    if (this.laid && this.mode === 'farlight') for (const fd of this.laid) { fd.im.rotation.y += dt * 0.6; }
  }

  /* a stop is done: gathered (far light, hearth) or read (trail) */
  take(fd) {
    const f = this.f; fd.got = true; fd.hold = 0; this.found++;
    if (!fd.noFly) fd.fly = 0;
    if (fd.kind === 'sign') { sfx('soul', { gain: 0.7 }); sfx('dodge', { gain: 0.3 }); this.w.flash(0.08); }
    else { sfx('soul'); sfx('piece', { gain: 0.6 }); sfx('drop', { gain: 0.45 }); this.w.flash(0.18); for (const w of f.wisps) w.flare = 1; }
    /* the wood needs no line (the count is in the objective); a find that shows the player's own words keeps one line */
    if (this.mode !== 'hearth') this.say(fd.line, '', 3600);
    this.react('find', fd.x, fd.z, 2.2);
    if (this.mode === 'farlight') {
      f.director.event(`The light stops and shows the hero something: ${fd.title.toLowerCase()}.`);
    } else if (this.mode === 'hearth') {
      f.director.event(`The hero gathers wood for the fire. ${this.found} of 3.`);
    } else if (this.mode === 'trail') {
      f.director.event('The scout runs past one of its own signs.');
    }
  }
  async ambush(fd) {
    const f = this.f; const fwd = f.forward();
    const pos = { x: f.pos.x - fwd.x * 7 + fwd.z * 2.5, z: f.pos.z - fwd.z * 7 - fwd.x * 2.5 };
    sfx('roar');
    await this.spawnOne('rogue', this.foeDef('rogue'), pos, false);
    f.director.event('One foe waited at the second place and attacks.');
  }

  /* ---------- far light: the lure ( quests) ----------
     The wonder walk had three things to pick up, like the protect walk's wood. Now a small light leads: it keeps about 9 m
     ahead of the hero on the way to the next place, waits when the hero stops, and circles each place until the hero
     comes up; then it shows what lies there (the line with the player's own words) and goes on. At the end it flies into
     the far light. A world with words.lure brings its own thing (WP.cause: a songbird, a paper lantern, an orb). */
  buildLure(glowMat) {
    const g = new THREE.Group(); this.group.add(g); let h = null; const own = this.f.kit?.words?.lure && this.WP?.cause;
    if (own) { try { h = this.WP.cause(this.group, {}); h.group.removeFromParent(); h.group.position.set(0, 0, 0); g.add(h.group); this.handles.push({ update() {}, dispose: () => { try { h.dispose?.(); } catch { /* gone */ } } }); } catch (err) { console.warn('lure', err); h = null; } }
    const L = { g, h, x: 0, z: 0, y: 0, yaw: 0, pause: 0, at: null, wp: null, wpT: 0, s0: h ? 1.5 : 1, sprites: [] };
    if (!h) { const day = !this.beams; const core = new THREE.Sprite(glowMat(0xfff0c8, day ? 1.6 : 3.2)); core.scale.setScalar(0.5); const halo = new THREE.Sprite(glowMat(0xffc878, day ? 0.5 : 1.1)); halo.scale.setScalar(2.4); g.add(halo, core); L.sprites = [core, halo]; }
    g.scale.setScalar(L.s0);
    const p = this.P(7, 2.5 * (this.side || 1)); L.x = p.x; L.z = p.z; L.y = this.gy(p.x, p.z) + 1.7; g.position.set(L.x, L.y, L.z);
    this.lure = L;
  }
  /* the next corner of the route from the hero to (gx, gz), or null when the straight walk is open (guideTo without its cache) */
  corner(gx, gz, rg) {
    const f = this.f; const nav = this.navNow(); const dx = gx - f.pos.x; const dz = gz - f.pos.z; const d = Math.hypot(dx, dz) || 1; const short = Math.min(d, rg * 0.7);
    if (nav.clear(f.pos.x, f.pos.z, gx - (dx / d) * short, gz - (dz / d) * short)) return null;
    const R = nav.route(f.pos.x, f.pos.z, gx, gz, rg); if (!R || R.pts.length < 2) return null;
    let i = 1; while (i < R.pts.length - 1 && Math.hypot(R.pts[i].x - f.pos.x, R.pts[i].z - f.pos.z) < 3) i++; return { x: R.pts[i].x, z: R.pts[i].z };
  }
  updateLure(dt) {
    const L = this.lure; if (!L || L.gone) return; const f = this.f; const time = this.w.time; const AHEAD = 9;
    const V = this.view; let fd = null; let T;
    if (L.pause > 0 && L.at) { L.pause -= dt; T = L.at; }
    else if (V?.active && !V.done) T = V;
    else { fd = this.stops.find((s) => !s.got) || null; T = fd || this._lureEnd || (this._lureEnd = { x: 0, z: 0, end: true }); if (T.end) { T.x = this.lx; T.z = this.lz; } }
    L.at = T;
    const hx = f.pos.x; const hz = f.pos.z; const dT = Math.hypot(T.x - hx, T.z - hz);
    let wx = T.x; let wz = T.z;
    if (dT > AHEAD && !(L.pause > 0)) {
      L.wpT -= dt; if (L.wpT <= 0) { L.wpT = 0.35; try { L.wp = this.corner(T.x, T.z, T.end ? 6.2 : 2.3); } catch { L.wp = null; } }
      let cx = L.wp ? L.wp.x : T.x; let cz = L.wp ? L.wp.z : T.z; let dc = Math.hypot(cx - hx, cz - hz);
      if (dc < 3) { cx = T.x; cz = T.z; dc = dT; }
      const k = Math.min(1, AHEAD / dc); wx = hx + (cx - hx) * k; wz = hz + (cz - hz) * k;
    }
    const dx = wx - L.x; const dz = wz - L.z; const d = Math.hypot(dx, dz); const sp = Math.min(d, (d > 14 ? 18 : 8.5) * dt);
    if (d > 0.02) { L.x += (dx / d) * sp; L.z += (dz / d) * sp; if (d > 0.4) L.yaw = Math.atan2(dx, dz); }
    const atT = Math.hypot(T.x - L.x, T.z - L.z) < 1.2; const circ = atT ? (T.end ? 0.3 : 0.95) : 0.22; const ang = time * 1.8;
    const px = L.x + Math.cos(ang) * circ; const pz = L.z + Math.sin(ang) * circ;
    const want = this.gy(px, pz) + (atT && fd ? (fd.top || 0.6) + 0.75 : 1.75) + Math.sin(time * 2.3) * 0.12; L.y += (want - L.y) * Math.min(1, dt * 4);
    L.g.position.set(px, L.y, pz); L.g.rotation.y = atT ? -ang : L.yaw;
    try { L.h?.update?.(dt, { t: time }); } catch { /* a cause with no update */ }
    if (L.sprites.length) { const b = 1 + Math.sin(time * 5.1) * 0.08 + (L.pause > 0 ? 0.35 : 0); L.sprites[0].scale.setScalar(0.5 * b); L.sprites[1].scale.setScalar(2.4 * b);
      /* the light circles a place at eye height, 0.95 m out; with the hero 1 m from the place it passed through
         the lens and its additive halo (2.4 m) filled the view pale yellow. The glow fades with the distance to the lens:
         full from 4 m, almost nothing at 1 m (the core keeps a trace, so the light is still seen to pass). */
      const cp = this.w.camera.position; const gp = L.g.position; const dl = Math.hypot(cp.x - gp.x, cp.y - gp.y, cp.z - gp.z); const u = clamp((dl - 1) / 3, 0, 1); const nk = u * u * (3 - 2 * u);
      L.sprites[0].material.opacity = 0.1 + 0.9 * nk; L.sprites[1].material.opacity = 0.03 + 0.97 * nk; }
    /* the hero comes up while it circles a place: it shows what lies there */
    if (fd && atT && !this.arriving && !f.paused && Math.hypot(fd.x - hx, fd.z - hz) < 4.8 && this.foeD > 12 && !f.spawning) { fd.noFly = true; this.take(fd); L.pause = 2.8; L.at = fd; }
  }

  /* ---------- hearth: the walk home with a companion ---------- */
  startEscort() {
    /* he starts on his walk point (6.4 m ahead, 3.3 m aside), not 3 m ahead in the lens under the chapter title */
    const f = this.f; const x = f.pos.x + this.ux * 6.4 + this.nx * 3.3; const z = f.pos.z + this.uz * 6.4 + this.nz * 3.3;
    this.esc = { x, z, px: x, pz: z, stun: 0, waitT: 0, t: this.along(x, z), placed: false };
    this.raid = []; this.raidAt = f.story?.loved ? [42 * this.k, 86 * this.k] : []; /* nobody named: no light is escorted, so no raider comes for it */
  }
  updateEscort(dt) {
    const f = this.f; const E = this.esc; const T = this.T;
    if (!E.placed) { const w0 = (f.wisps || []).find((w) => w.i === 0); if (w0?.sp?.position) { E.placed = true; if (!w0.hidden) this.push(this.solids, E, E.x, E.z); /* with no loved one named nothing walks there */ w0.sp.position.x = E.x; w0.sp.position.z = E.z; } }
    E.stun = Math.max(0, E.stun - dt);
    const dHero = Math.hypot(E.x - f.pos.x, E.z - f.pos.z); const toL = Math.hypot(this.lx - E.x, this.lz - E.z);
    E.t = this.along(E.x, E.z);
    if (!this.arriving && E.stun <= 0 && toL > 2.6) {
      /* the one the hero walks home keeps WITH the hero (ahead toward the next goal, in view), not on the road by itself:
         it walked 70 m off while the hero gathered and was never seen. Near the end it walks into the fire's ring. */
      const o = this._eo || (this._eo = { x: 0, z: 0 }); this.formation(0, 'person', o);
      const near = this.found >= 3 && toL < 14; const tx = near ? this.lx + (E.x - this.lx) / Math.max(toL, 1e-3) * 2.4 : o.x; const tz = near ? this.lz + (E.z - this.lz) / Math.max(toL, 1e-3) * 2.4 : o.z;
      const dx = tx - E.x; const dz = tz - E.z; const d = Math.hypot(dx, dz);
      const sp = (f.archetype?.speed || 5.2) * Math.max(1, f.pace) * 1.05 * clamp(d / 1.2, 0, 1) * (d > 12 ? 1.5 : 1);
      E.px = E.x; E.pz = E.z; if (d > 1e-4) { const st = Math.min(d, sp * dt); E.x += (dx / d) * st; E.z += (dz / d) * st; }
      this.push(this.solids, E, E.px, E.pz);
      const hx = E.x - f.pos.x; const hz = E.z - f.pos.z; const hd = Math.hypot(hx, hz); const fw = f.forward(); const mD = hx * fw.x + hz * fw.z > 0 ? 4.8 : 3.2; /* in front of the view he keeps 4.8 m (edo: his kasa filled the lens) */ if (hd < mD && hd > 1e-3) { E.x = f.pos.x + hx / hd * mD; E.z = f.pos.z + hz / hd * mD; }
      E.waitT = 0;
    }
    void dHero; void T;
    /* two lone foes come for the companion, one at a time, at points on the road */
    if (!this.arriving && this.raidAt.length && Math.max(E.t, this.along(f.pos.x, f.pos.z)) >= this.raidAt[0] && !this.raidSpawning) { this.raidAt.shift(); this.spawnRaider(); }
  }
  async spawnRaider() {
    const f = this.f; const E = this.esc; this.raidSpawning = true;
    const side = Math.sign((E.x - f.pos.x) * this.nx + (E.z - f.pos.z) * this.nz) || this.side;
    const q = this.P(E.t + 13, side * 13);
    const def = this.foeDef('rogue');
    try {
      const foe = await this.spawnOne('rogue', def, q, false); if (!foe) return;
      const R = { foe, going: true, cd: 0 }; this.raid.push(R); foe.going = true;
      foe.drive = (dt, moveTo, idle) => this.raidFrame(R, dt, moveTo, idle);
      /* the objective turns to "Protect <name>": no second line */ sfx('roar', { gain: 0.5 });
      f.director.event('A lone foe comes for the companion, not the hero.');
    } finally { this.raidSpawning = false; }
  }
  /* the raider: goes for the companion; when the hero stands near it or strikes it, it turns on the hero (normal fighting) */
  raidFrame(R, dt, moveTo, idle) {
    const f = this.f; const foe = R.foe; const E = this.esc;
    if (!R.going) return false;
    const dh = Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z);
    if (dh < 4.2 || foe.hp < foe.maxHp || this.arriving) { R.going = false; foe.going = false; return false; }
    const dx = E.x - foe.pos.x; const dz = E.z - foe.pos.z; const d = Math.hypot(dx, dz) || 1;
    foe.yaw = Math.atan2(dx, dz);
    if (R.cd > 0) { R.cd -= dt; if (R.cd < 1.9) foe.actor.play(idle, { fade: 0.25 }); return true; }
    if (d > 1.5) { moveTo(this.tmp3.set(E.x, 0, E.z), 3.4, 'Jog_Fwd_Loop'); return true; }
    /* it reaches the companion: a blow, the companion is knocked back and lies a moment; the hero must come */
    foe.actor.play('Sword_Regular_A', { loop: false, fade: 0.08, restart: true }); R.cd = 2.8;
    setTimeout(() => this.struck(foe), 260);
    return true;
  }
  struck(foe) {
    if (this.arriving || this.done || foe.gone || foe.state === 'dead') return;
    const f = this.f; const E = this.esc; const dx = E.x - foe.pos.x; const dz = E.z - foe.pos.z; const d = Math.hypot(dx, dz) || 1;
    E.px = E.x; E.pz = E.z; E.x += (dx / d) * 2.4; E.z += (dz / d) * 2.4; this.push(this.solids, E, E.px, E.pz); E.stun = 3.4;
    const w0 = f.wisps[0]; if (w0) { w0.flare = 1; f.sparks?.(new THREE.Vector3(E.x, this.gy(E.x, E.z) + 0.9, E.z), new THREE.Vector3(dx / d, 0.4, dz / d), 0xffc890, 14, 4); }
    sfx('hit', { gain: 0.55 }); sfx('hurt', { gain: 0.3 });
    if (!this.saidStruck || f.clock - this.saidStruck > 8) { this.saidStruck = f.clock; this.lineUntil = 0; this.say(this.T.struck || 'They are knocked down.', '', 2600); }
    f.director.event('The foe reaches the companion and knocks it down.');
  }

  /* ---------- trail: tracks revealed sign by sign, then the scout ---------- */
  updateTrail(dt) {
    const f = this.f;
    /* the prints of the run after the last sign read come up one by one, ahead of the hero */
    if (this.prints) { const want = this.trackEnds[Math.min(this.found, this.trackEnds.length - 1)]; if (this.printShown < want) { this.printShown = Math.min(want, this.printShown + dt * 28); const n = Math.floor(this.printShown); this.prints[0].count = n; this.prints[1].count = n; if (this.stakes) { let c = 0; while (c < this.stakes.at.length && this.stakes.at[c] < n) c++; this.stakes.pm.count = c; this.stakes.fm.count = c; if (this.stakes.more) for (const m of this.stakes.more) m.count = c; } } }
    if (this.noScout && !this.arriving) { this.noScoutT = (this.noScoutT || 0) + dt; if (this.noScoutT > 4) this.arriveAt(); return; }
    const S = this.scout; if (!S || !S.foe) return;
    const foe = S.foe; if (foe.gone) return;
    if (foe.state === 'dead') { if (!S.dead) { S.dead = true; foe.quickGone = true; /* the body at the hero's feet starts to go after 0.9 s (fight.js near-corpse rule), not 2.2 s: it lay face-up under the camera */ f.director.event('The hero runs the scout down and kills it.'); setTimeout(() => this.arriveAt(), 1400); } return; }
    /* the chase starts as the chapter card goes. The scout runs its own road (the three signs, then its camp);
       a hit makes it stumble; under 55 % health it turns and fights; at its camp it turns with two friends (it has warned them) */
    if (S.state === 'ready') { S.t += dt; if (S.t > 0.45 || foe.hp < foe.maxHp) { S.state = 'run'; S.t = 0; foe.hold = false; this.lineUntil = 0; /* the objective says "Catch the scout" */ sfx('roar', { gain: 0.6 }); sfx('dodge'); f.director.event('The scout sees the hero and runs.'); } return; }
    if (S.state !== 'run') return;
    S.t += dt; if (S.slow > 0) S.slow -= dt;
    if (foe.hp < S.hp - 0.5) { S.slow = 0.9; if (!S.toldHit && foe.hp > foe.maxHp * 0.55) { S.toldHit = true; } } S.hp = foe.hp;
    /* the signs it passes: its prints for the next run come up, and the sign is done */
    while (S.mark < 3 && S.i > S.marks[S.mark]) { const fd = this.stops[S.mark]; if (fd && !fd.got) { fd.got = true; this.found++; sfx('dodge', { gain: 0.25 }); } S.mark++; }
    if (foe.hp < foe.maxHp * 0.55) { S.state = 'fight'; foe.going = false; this.found = 3; return; }
    if (S.i >= S.path.length) {
      S.state = 'fight'; S.warned = true; foe.going = false; this.found = 3; this.lineUntil = 0; this.say(this.T.camp || 'It reached its camp.', '', 2800); sfx('roar', { gain: 0.5 });
      f.director.event('The scout reaches its camp and warns the others; two come out.');
      for (const k of [-1, 1]) { const q = this.P(this.along(foe.pos.x, foe.pos.z) + 4, k * 3.5); this.spawnOne('minion', this.foeDef('minion'), q, false).catch(() => {}); }
    }
  }
  async spawnScout() {
    const f = this.f; const def = this.foeDef('rogue', this.T.scout || `${f.minions?.one || 'Hollow'} Scout`); def.hp = Math.round(def.hp * 1.4);
    const at = this.P(11, 0);
    const foe = await this.spawnOne('rogue', def, at, true); if (!foe) { this.noScout = true; return; }
    foe.group.since = 1e9; foe.going = true; foe.yaw = Math.atan2(f.pos.x - at.x, f.pos.z - at.z);
    /* its road: a route (journey-nav) from sign to sign, then to its camp, so it never runs into a rock or the water */
    const path = []; const marks = []; let a = at; let nav = null; try { nav = this.navNow(); } catch { nav = null; }
    for (const b of [...this.stops, this.rest]) { let R = null; try { R = nav ? nav.route(a.x, a.z, b.x, b.z, 1.6) : null; } catch { R = null; } if (R && R.pts.length > 1) for (const q of R.pts.slice(1)) path.push({ x: q.x, z: q.z }); else path.push({ x: b.x, z: b.z }); marks.push(path.length - 1); a = b; }
    const S = { foe, state: 'ready', t: 0, path, marks, i: 0, mark: 0, hp: foe.hp, slow: 0, warned: false }; this.scout = S;
    foe.drive = (dt, moveTo) => {
      if (S.state !== 'run') return false;
      let q = S.path[S.i]; while (q && Math.hypot(q.x - foe.pos.x, q.z - foe.pos.z) < 1.6) { S.i++; q = S.path[S.i]; }
      if (!q) return false;
      moveTo(this.tmp3.set(q.x, 0, q.z), (f.archetype.speed || 5.2) * 0.86 * (S.slow > 0 ? 0.45 : 1), 'Jog_Fwd_Loop'); foe.yaw = Math.atan2(q.x - foe.pos.x, q.z - foe.pos.z); return true;
    };
  }

  /* ---------- cage: three anchors, one guard each ---------- */
  updateCage(dt) {
    const f = this.f;
    if (!this.keptReady) this.setupKept();
    for (const fd of this.stops) {
      const p = fd.prop; const d = Math.hypot(fd.x - f.pos.x, fd.z - f.pos.z);
      if (fd.wm) { fd.k = (fd.k ?? 1) + ((fd.got ? 0 : fd === this.target ? 1 : 0) - (fd.k ?? 1)) * Math.min(1, dt * 1.5); const W = this.wmArgs || (this.wmArgs = { k: 0, near: 0, t: 0 }); W.k = fd.k * Math.min(1, 0.3 + d / 12); W.near = d < 6 ? 1 : 0; W.t = this.w.time; fd.wm.update(dt, W); }
      if (fd.hl) { const on = !fd.got && fd === this.target ? 0.55 + 0.25 * Math.sin(this.w.time * 3.2) : 0; fd.hl.material.opacity += (on - fd.hl.material.opacity) * Math.min(1, dt * 4); fd.hl.visible = fd.hl.material.opacity > 0.01; }
      if (!fd.guard && !fd.guarding && d < 44 && !fd.got) { fd.guarding = true; this.spawnGuard(fd); }
      if (fd.guard && !fd.guard.gone && fd.guard.hold && (d < 10 || fd.guard.hp < fd.guard.maxHp)) { fd.guard.hold = false; fd.guardT = 0; }
      /* the guard line is said only while the guard is on screen; after 0.8 s off screen the view turns to it */
      if (fd.guard && !fd.guard.gone && !fd.guard.hold && !fd.toldGuard && fd.guard.state !== 'dead') {
        fd.guardT = (fd.guardT || 0) + dt; const g = fd.guard.pos; const v = (this._gv || (this._gv = this.f.pos.clone())).set(g.x, this.gy(g.x, g.z) + 1.3 * (fd.guard.scale || 1), g.z).project(this.w.camera);
        const seen = v.z < 1 && Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.85;
        if (seen) { fd.toldGuard = true; }
        else if (fd.guardT > 0.8 && fd.guardT < 3.5 && !f.lock) f.turnToward(g, Math.min(1, dt * 3));
        else if (fd.guardT >= 3.5) fd.toldGuard = true; }
      if (!fd.got && p.hp <= 0) {
        fd.got = true; this.found++; this.lineUntil = 0; if (this.found >= 3) this.say(this.T.broke?.[2] || 'Break the lock.', '', 2600); this.react('find', fd.x, fd.z, 2);
        for (const w of f.wisps) w.flare = 1; if (this.cage) this.flare = Math.max(this.flare, 0.5);
        f.director.event(`The hero breaks a chained anchor. ${this.found} of 3.`);
      }
    }
  }
  async spawnGuard(fd) {
    const types = ['minion', 'rogue', 'warrior']; const type = types[fd.i] || 'minion';
    const dx = this.f.pos.x - fd.x; const dz = this.f.pos.z - fd.z; const d = Math.hypot(dx, dz) || 1;
    const foe = await this.spawnOne(type, this.foeDef(type), { x: fd.x + (dx / d) * 2.4, z: fd.z + (dz / d) * 2.4 }, true);
    if (foe) fd.guard = foe;
  }
  /* who waits in the cage: the first named one (it walks there now), else someone the enemy keeps (a new companion) */
  setupKept() {
    this.keptReady = true; const f = this.f; const T = this.T;
    const y = this.light.position.y + 0.17;
    if (!T.stranger && f.wisps[0]) { this.keptWisp = f.wisps[0]; this.keptWisp.sp.position.set(this.lx, y, this.lz); return; }
    if (this.WP) {
      /* outside the dark world the one in the cage is a real person of that world (web/src/props/folk.js) */
      import('./props/folk.js').then(({ makeFolk }) => { if (this.done) return; const h = makeFolk(this.w.scene, [T.label || 'Stranger'], { kinds: ['person'], kit: f.kit, WP: this.WP }); this.kept = h; const c = h.list[0]; c.position.set(this.lx, this.light.position.y, this.lz); this.keptC = c; }).catch((err) => console.warn('journey kept', err));
      return;
    }
    try {
      const h = f.QP.makeCompanions(this.w.scene, [T.label || 'Stranger'], { kinds: ['person'], accent: this.accent, style: f.kit?.companion || 'dark' });
      this.kept = h; const c = h.list[0]; c.position.set(this.lx, y, this.lz); this.keptC = c;
    } catch (err) { console.warn('journey kept', err); }
  }

  /* ---------- gate: watchers, three challengers, the name cut ---------- */
  updateGate(dt) {
    const f = this.f; const along = this.along(f.pos.x, f.pos.z);
    /* the lane: halfway from the last challenger to the gate the road's people stand in two rows and say the name as the
       hero walks between them (the crowd and its cheer are the gate's own; no new art) */
    if (!this.lane && this.stops[2] && this.L) { const tg = this.along(this.L.x, this.L.z); this.lane = { t: this.stops[2].t + (tg - this.stops[2].t) * 0.5 }; if (tg - this.stops[2].t < 30) this.lane.skip = true; }
    const ln = this.lane;
    if (ln && !ln.skip) {
      if (!ln.crowd && this.stops[2].got && along > ln.t - 40) ln.crowd = this.crowd(ln.t, 10);
      if (ln.crowd && !ln.said && along > ln.t - 5) { ln.said = true; this.lineUntil = 0; this.crowdCheer({ crowd: ln.crowd }); this.react('cheer', f.pos.x, f.pos.z, 2.4); f.director.event('The road\'s people line the road and say the hero\'s name.'); }
      if (ln.crowd && along > ln.t + 24 && !ln.gone) { ln.gone = true; this.dropCrowd(ln.crowd); }
    }
    for (const fd of this.stops) {
      const d = Math.hypot(fd.x - f.pos.x, fd.z - f.pos.z);
      if (!fd.spawned && !fd.got && fd.t - along < 46 && (!this.q2on || fd.i === 0 || this.stops[fd.i - 1].got)) { fd.spawned = true; this.spawnDuel(fd); } /* one ring: the next challenger steps in when the last is down */
      /* watchers fade out once the hero is well past them */
      if (fd.crowd && along > fd.t + 26 && !fd.crowdGone && (!this.q2on || this.found >= 3)) { fd.crowdGone = true; this.dropCrowd(fd.crowd); }
      if (fd.watch && along > fd.t + 22 && !fd.watchGone) { fd.watchT = (fd.watchT || 0) + dt; for (const w of fd.watch) if (!w.gone) w.actor.fade(clamp(1 - fd.watchT / 1.2, 0, 1)); if (fd.watchT > 1.3) { fd.watchGone = true; for (const w of fd.watch) this.despawn(w); } }
      const c = fd.foe; if (!c) { if (fd.spawnDone && !fd.got) { fd.got = true; this.found++; } continue; }
      if (fd.state === 'wait' && (d < 9 || c.hp < c.maxHp)) {
        fd.state = 'fight'; c.hold = false; this.lineUntil = 0; this.say(this.T.says?.[fd.i] || '', '', 2800); sfx('roar', { gain: 0.45 });
        f.director.event(`A challenger steps onto the road: ${c.def.label}.`);
      } else if (fd.state === 'fight' && c.state !== 'dead' && !c.gone) {
        /* the watchers cheer a hit that lands (at most every 2.4 s) */
        if (c.hp < (fd.hpSeen ?? c.maxHp) - 0.5 && f.clock - (fd.cheerAt || -9) > 2.4 && fd.crowd?.h && !fd.crowd.gone) { fd.cheerAt = f.clock; fd.crowd.h.list.forEach((x, k) => { if ((k + fd.i) % 2 === 0) x.mood = { clip: 'Dance_Loop', until: x.t + 1.1, after: true }; });  const H = fd.crowd; setTimeout(() => { if (H.h && !H.gone) for (const x of H.h.list) if (x.mood?.clip === 'Dance_Loop') x.mood = { clip: 'Idle_FoldArms_Loop', until: 1e9 }; }, 1200); }
        fd.hpSeen = c.hp;
      } else if (fd.state === 'fight' && (c.state === 'dead' || c.gone)) {
        fd.state = 'cut'; fd.got = true; this.found++;
        setTimeout(() => { if (this.disposed) return; fd.marker?.carve(); sfx('forge', { gain: 0.5 }); if (fd.marker && this.foeD > 8) this.glance(fd.mx, this.gy(fd.mx, fd.mz) + 1.3, fd.mz, 2.2); /* the plate is seen as the name lights up */ this.say(this.T.cuts?.[fd.i] || this.T.cut || 'The name is cut.', '', 3000); for (const w of f.wisps) w.flare = 1; this.react('cheer', fd.mx, fd.mz, 2.6); this.crowdCheer?.(fd); }, 900);
        f.director.event(`The hero beats the challenger; the name is cut into a marker. ${this.found} of 3.`);
      }
    }
  }
  async spawnDuel(fd) {
    const f = this.f; const types = [['rogue', {}], ['warrior', {}], ['warrior', { captain: true }]]; const [type, opt] = types[fd.i];
    const one = f.nameOf(byId(f.kit?.FOES || FOES, type) || byId(FOES, type));
    const title = this.T.challenger ? this.T.challenger(one) : one; const nm = (CHALLENGERS[f.kit?.id || 'dark'] || CHALLENGERS.dark)[fd.i];
    const def = this.foeDef(type, nm ? `${nm}, ${title}` : title); fd.short = nm || title;
    const q = this.P(fd.t + 2.5, 0);
    fd.foe = await this.spawnOne(type, def, q, true, opt); fd.spawnDone = true;
    if (fd.foe) fd.foe.group.since = 1e9;
    /* two watchers stand back from the road at each place and turn to follow the hero */
    fd.watch = [];
    /* the road's people watch each challenge (folk of the world, not foes): three a side, arms folded; they cheer when
       the name is cut. They go once the hero is well past them. */
    /* a ring of ten round the duel ground, open on the side the hero comes from */
    fd.crowd = this.q2on ? (fd.i === 0 ? this.crowd(fd.t + 2.4, 14, 0, 8.4) : this.stops[0].crowd) : this.crowd(fd.t + 1.2, 10, 0, 7.2); /* one crowd for the three */
  }

  /* a crowd of the world's folk at route distance t, n people in two rows either side of the road, facing it */
  crowd(t, n, s0 = 0, ring = 0) {
    const f = this.f; const H = { list: [], h: null, gone: false };
    import('./props/folk.js').then(({ makeFolk }) => {
      if (this.disposed || this.done) return;
      const names = Array.from({ length: n }, () => ''); const h = makeFolk(this.w.scene, names, { kinds: names.map(() => 'person'), kit: f.kit, WP: this.WP, crowd: true }); /* the road's own people, not copies of Wren */
      h.list.forEach((c, i) => {
        const side = i % 2 ? -1 : 1; const row = Math.floor(i / 2); const ra = ring ? (0.42 + (row / Math.max(1, Math.ceil(n / 2) - 1)) * 2.45) * side : 0; const rr = ring + (this.r() - 0.5) * 0.9; /* ring: from 24 deg off the way in round to the far side, both sides */
        const p = ring ? this.P(t - Math.cos(ra) * rr, s0 + Math.sin(ra) * rr) : this.P(t + (row - 1) * 2.2 + (this.r() - 0.5) * 0.8, s0 + side * (5.4 + (row % 2) * 1.1 + this.r() * 0.6));
        c.position.set(p.x, this.gy(p.x, p.z), p.z); c.label.visible = false; c.mood = { clip: i % 3 === 0 ? 'Idle_Talking_Loop' : 'Idle_FoldArms_Loop', until: 1e9 };
      });
      H.h = h; this.handles.push({ update: (dt) => { if (H.gone) return; for (const c of h.list) c.position.y = this.gy(c.position.x, c.position.z); h.update(dt, f.clock, this.w.camera); }, dispose: () => { if (!H.gone) { H.gone = true; h.dispose(); } } });
    }).catch((err) => console.warn('journey crowd', err));
    return H;
  }
  dropCrowd(H) { if (!H?.h || H.gone) return; for (const c of H.h.list) c.state = 'taken'; setTimeout(() => { if (!H.gone) { H.gone = true; H.h.dispose(); } }, 1600); }
  crowdCheer(fd) { const H = fd?.crowd; if (!H?.h) return; for (const c of H.h.list) c.mood = { clip: 'Dance_Loop', until: c.t + 3.2, after: true }; setTimeout(() => { if (H.h && !H.gone) for (const c of H.h.list) c.mood = { clip: 'Idle_FoldArms_Loop', until: 1e9 }; }, 3300); }

  /* ---------- the end of the walk: far light ---------- */
  /* the arrival owns the view (pause, letterbox, glide, turn). It always gives it back: a throw or a hang
     (25 s) ends the cut, puts the hero on the field and frees the player; the letterbox and the pause never outlive it. */
  async arrive() {
    if (this.arriving) return; this.arriving = true;
    try { this.view?.release?.(); } catch { /* gone */ }
    let hung = null; const guard = new Promise((res) => { hung = setTimeout(() => res('hung'), 25000); });
    let r; try { r = await Promise.race([this._arrive(), guard]); } catch (err) { console.warn('arrive', err); r = 'threw'; }
    clearTimeout(hung);
    if (r === 'hung' || r === 'threw') { if (r === 'hung') console.warn('arrive: no end after 25 s, released'); this.arriveFail(() => this.teleport()); }
  }
  async _arrive() {
    const f = this.f; const st = f.story; const gear = { weaponName: window.__sq?.S?.weaponName || null };
    for (const foe of this.foes) if (!foe.gone && foe.state !== 'dead') this.despawn(foe);
    f.paused = true; f.keys.clear(); f.swing = null; f.charge = null; f.hud.cinema?.(true); f.vmAway = true; /* the weapon hand drops out of the walk's cinema beats (neon's buckler filled the gate shot) */
    const look = new THREE.Vector3(this.lx, this.light.position.y + 1.2, this.lz);
    /* step to a clear view of the altar: around the ring to the nearest gap between the stones, 6.6 m out */
    const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    const a0 = Math.atan2(f.pos.z - this.lz, f.pos.x - this.lx); const r0 = Math.hypot(f.pos.x - this.lx, f.pos.z - this.lz); let a1 = a0;
    for (let k = 0; k <= 40; k++) { const c = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.06; if (this.stones.every((m) => Math.abs(wrap(c - m.userData.ang)) > 0.34)) { a1 = c; break; } }
    let gt = 0; const glide = this.w.addUpdater((dt) => { gt = Math.min(1, gt + dt / 1.3); const e = ease(gt); const a = a0 + wrap(a1 - a0) * e; const rr = r0 + (8.4 - r0) * e; f.pos.x = this.lx + Math.cos(a) * rr; f.pos.z = this.lz + Math.sin(a) * rr; if (gt >= 1) glide(); });
    const turn = this.w.addUpdater((dt) => { if (this.done) return; f.turnToward(look, Math.min(1, dt * 2.2)); const d = Math.max(1, Math.hypot(look.x - f.pos.x, look.z - f.pos.z)); const pw = clamp(Math.atan2(look.y - (f.footY + 2.08), d), -0.5, 0.4); f.pitch += (pw - f.pitch) * Math.min(1, dt * 2); });
    f.director.event('The hero reaches the far light; the small light flies into it.');
    this.lineUntil = 0; this.say(st.farlight.at, '', 4200);
    await wait(700);
    /* nothing is laid down: the lure flies into the far light */
    if (this.lure) { const L = this.lure; L.gone = true; const p0 = L.g.position.clone(); const p1 = new THREE.Vector3(this.lx, this.light.position.y + (this.farPiece?.top ?? 2.4), this.lz); let lt = 0;
      const fly = this.w.addUpdater((dt) => { lt = Math.min(1, lt + dt / 1.5); const e = ease(lt); L.g.position.lerpVectors(p0, p1, e); L.g.position.y += Math.sin(e * Math.PI) * 1.2; L.g.scale.setScalar(L.s0 * (1 - e * 0.7)); L.h?.update?.(dt, { t: this.w.time }); if (lt >= 1) { L.g.visible = false; fly(); } });
      sfx('soul', { gain: 0.6 }); await wait(1500); }
    await wait(300);
    /* the light flares and the companions gather at it */
    this.flare = 1; this.w.flash(0.45); sfx('forge'); sfx('soul'); f.shake = Math.max(f.shake, 0.25);
    for (const w of f.wisps) { w.flare = 1; }
    await wait(2600);
    await this.blackout(() => this.teleport(), turn);
    this.finishWalk();
  }
  /* the arrival failed or hung: the hero goes to the field, the view and the keys are the player's again */
  arriveFail(during) {
    const f = this.f; if (this.arriveDead) return; this.arriveDead = true;
    if (!this.done) { try { during(); } catch (err) { console.warn('arrive fallback', err); } }
    f.paused = false; f.keys.clear(); f.vmAway = false; try { f.hud.cinema?.(false); f.hud.unfreeze?.(300); } catch { /* no hud */ }
    if (!this.done) { try { this.finishWalk(); } catch (err) { console.warn('finish walk', err); this.done = true; if (f.journey === this) f.journey = null; } }
  }
  /* a second of black; `during` runs while the screen is black */
  async blackout(during, turn) {
    const f = this.f; if (this.arriveDead) return;
    /* hold the last walk frame as a still (main.js hud.freeze), move the hero under it, then cross-fade to the field:
       no second of pure black. The black path stays for a freeze that could not grab a frame. */
    if (await f.hud.freeze?.()) {
      during(); turn?.(); f.hud.cinema?.(false);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      f.paused = false; f.keys.clear(); f.vmAway = false;
      f.hud.unfreeze?.(800); await wait(800);
      return;
    }
    const black = document.createElement('div'); black.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;transition:opacity .6s;pointer-events:none;z-index:40'; document.body.appendChild(black);
    requestAnimationFrame(() => { black.style.opacity = '1'; });
    await wait(750);
    during();
    await wait(900);
    black.style.opacity = '0'; f.hud.cinema?.(false);
    await wait(500);
    turn?.();
    f.paused = false; f.keys.clear(); f.vmAway = false;
    await wait(400);
    black.remove();
  }
  /* the hero stands at the arena centre, facing +u; the end piece (if it stays) at u * 3.2 */
  heroToField() {
    const f = this.f;
    const hx = -this.ux * 2.6; const hz = -this.uz * 2.6; const ax = this.ux * 3.2; const az = this.uz * 3.2;
    f.pos.set(hx, 0, hz); f.vel.set(0, 0, 0); this.px = hx; this.pz = hz; f.footY = 0;
    f.yaw = Math.atan2(-(ax - hx), -(az - hz)); f.pitch = 0.06;
    return { ax, az };
  }
  teleport() {
    const f = this.f; const { ax, az } = this.heroToField();
    this.placeLight(ax, az, () => 0);
    for (const fd of this.stops) { fd.g?.removeFromParent(); }
    for (const w of f.wisps) { const a = w.i * 2.1; w.sp.position.set(ax + Math.cos(a) * 2.6, w.c ? 0 : 1.4, az + Math.sin(a) * 2.6); }
    this.lightK = 0.95; this.flare = 0.35;
  }

  /* ---------- the end of the walk: hearth, trail, cage, gate ---------- */
  /* the arrival owns the view (pause, letterbox, glide, turn). It always gives it back: a throw or a hang
     (25 s) ends the cut, puts the hero on the field and frees the player; the letterbox and the pause never outlive it. */
  async arriveAt() {
    if (this.arriving) return; this.arriving = true;
    try { this.view?.release?.(); } catch { /* gone */ }
    let hung = null; const guard = new Promise((res) => { hung = setTimeout(() => res('hung'), 25000); });
    let r; try { r = await Promise.race([this._arriveAt(), guard]); } catch (err) { console.warn('arriveAt', err); r = 'threw'; }
    clearTimeout(hung);
    if (r === 'hung' || r === 'threw') { if (r === 'hung') console.warn('arriveAt: no end after 25 s, released'); this.arriveFail(() => this.toField()); }
  }
  async _arriveAt() {
    const f = this.f; const T = this.T;
    for (const foe of this.foes) if (!foe.gone && foe.state !== 'dead') this.despawn(foe);
    f.paused = true; f.keys.clear(); f.swing = null; f.charge = null; f.hud.cinema?.(true); f.vmAway = true; /* the weapon hand drops out of the walk's cinema beats (neon's buckler filled the gate shot) */
    /* the view: the end piece from 7 m on the hero's side (the trail: where the scout fell) */
    const cx = this.mode === 'trail' ? (this.scout?.foe?.pos.x ?? f.pos.x) : this.lx; const cz = this.mode === 'trail' ? (this.scout?.foe?.pos.z ?? f.pos.z) : this.lz;
    const look = new THREE.Vector3(cx, this.gy(cx, cz) + (this.mode === 'gate' ? 2.6 : 0.9), cz);
    if (this.mode !== 'trail') {
      let R = this.mode === 'gate' ? 9 : this.mode === 'cage' ? 5.6 : 6.4;
      const a0 = Math.atan2(f.pos.z - cz, f.pos.x - cx); let a1 = this.mode === 'gate' ? Math.atan2(-this.uz, -this.ux) : a0; const r0 = Math.hypot(f.pos.x - cx, f.pos.z - cz);
      /* the glide ends where nothing stands at the lens (neon: a land forklift with no walk solid filled the left of the gate shot) */
      if (this.mode === 'gate') { const best = this.clearSpot(cx, cz, a1, R); a1 = best.a; R = best.r; }
      const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
      let gt = 0; const glide = this.w.addUpdater((dt) => { gt = Math.min(1, gt + dt / 1.3); const e = ease(gt); const a = a0 + wrap(a1 - a0) * e; const rr = r0 + (R - r0) * e; f.pos.x = cx + Math.cos(a) * rr; f.pos.z = cz + Math.sin(a) * rr; if (gt >= 1) glide(); });
    }
    const turn = this.w.addUpdater((dt) => { if (this.done) return; f.turnToward(look, Math.min(1, dt * 2.2)); const d = Math.max(1, Math.hypot(look.x - f.pos.x, look.z - f.pos.z)); const pw = clamp(Math.atan2(look.y - (f.footY + 2.08), d), -0.5, 0.4); f.pitch += (pw - f.pitch) * Math.min(1, dt * 2); });
    this.lineUntil = 0; this.say(T.at || '', (this.mode === 'trail' && this.scout?.warned && T.warned) || '', 4200);
    await wait(900);
    if (this.mode === 'hearth') {
      f.director.event('The hero lays the wood at the hearth and the fire is lit.');
      /* the three bundles are laid in the ring, one by one, and the fire catches */
      for (let i = 0; i < 3; i++) {
        const fd = this.stops[i]; fd.im.removeFromParent(); this.light.add(fd.im); const [sx, sz] = this.slots[i];
        fd.im.visible = true; fd.im.scale.setScalar(1); fd.im.position.set(sx, 0.02, sz); fd.im.rotation.set(0, i * 2.1, 0); sfx('piece'); await wait(380);
      }
      await wait(250);
      const fire = this.fire; fire.args.hp = 1; f.hearthFire = fire;
      this.lightK = 0.2; this.flare = 0.8; this.w.flash(0.35); sfx('forge'); sfx('soul');
      for (const w of f.wisps) { w.flare = 1; }
    } else if (this.mode === 'cage') {
      f.director.event('The hero breaks the lock; the one in the cage is free and walks with the hero.');
      this.cage.open(); sfx('breakPart'); sfx('clangBig', { gain: 0.6 }); this.w.flash(0.3); this.flare = 1; f.shake = Math.max(f.shake, 0.3);
      await wait(700);
      this.free(); this.react('cheer', this.lx, this.lz, 3);
    } else if (this.mode === 'gate') {
      f.director.event('The hero reaches the gate; the name is known on the road.');
      this.gate.flare(); this.flare = 1; this.w.flash(0.3); sfx('forge'); sfx('win', { gain: 0.6 });
      /* the moment at the gate: the people there cheer the name, the companions with them, and the hero holds a beat */
      this.crowdCheer({ crowd: this.gateCrowd }); this.react('cheer', this.lx, this.lz, 4);
      await wait(1800);
    } else {
      this.flare = 0.4; sfx('soul');
    }
    await wait(2600);
    await this.blackout(() => this.toField(), turn);
    this.finishWalk();
  }
  /* the one in the cage steps out and joins the companions */
  /* a camera spot on a ring round (cx, cz) near angle a and radius r, with no mesh or solid within 2.4 m (read once, at the arrival) */
  clearSpot(cx, cz, a, r) {
    const cands = []; for (const dr of [0, 1.5, -1.5]) for (const da of [0, 0.22, -0.22, 0.45, -0.45]) cands.push({ a: a + da, r: r + dr });
    const blobs = []; const V = new THREE.Vector3(); const M = new THREE.Matrix4(); const keep = (o) => { let p = o; while (p) { if (p === this.gate?.group || p.userData?.fp) return false; p = p.parent; } return true; };
    try {
      this.w.scene.traverse((o) => {
        if (!o.isMesh || !o.visible || /^fp_|^gear_/.test(o.name) || !o.geometry) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const bs = o.geometry.boundingSphere; if (!bs) return;
        if (o.isInstancedMesh) { if (o.count > 600) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.premultiply(o.matrixWorld); const rr = bs.radius * M.getMaxScaleOnAxis(); if (rr > 6) continue; V.copy(bs.center).applyMatrix4(M); if (Math.hypot(V.x - cx, V.z - cz) < r + 10) blobs.push({ x: V.x, z: V.z, r: rr }); } return; }
        const rr = bs.radius * o.matrixWorld.getMaxScaleOnAxis(); if (rr > 6 || !keep(o)) return; V.copy(bs.center).applyMatrix4(o.matrixWorld); if (Math.hypot(V.x - cx, V.z - cz) < r + 10) blobs.push({ x: V.x, z: V.z, r: rr });
      });
    } catch (err) { console.warn('clearSpot', err); }
    for (const s of this.solids || []) if (Math.hypot(s.x - cx, s.z - cz) < r + 10) blobs.push({ x: s.x, z: s.z, r: s.r });
    const f = this.f; let best = cands[0]; let bestRoom = -1e9;
    for (const c of cands) {
      const x = cx + Math.cos(c.a) * c.r; const z = cz + Math.sin(c.a) * c.r; let room = 1e9;
      for (const b of blobs) { if (Math.hypot(b.x - f.pos.x, b.z - f.pos.z) < 0.6 && b.r < 1.2) continue; room = Math.min(room, Math.hypot(b.x - x, b.z - z) - b.r); }
      if (room >= 2.4) return c; if (room > bestRoom) { bestRoom = room; best = c; }
    }
    return best;
  }
  free() {
    const f = this.f; this.freed = true;
    if (this.keptWisp) { this.keptWisp.flare = 1; this.keptWisp.state = 'with'; return; }
    const c = this.keptC; if (!c) return;
    const label = { position: { set() {} }, material: { opacity: 0 } };
    const w = { name: c.name, c, sp: { position: c.position, scale: { setScalar() {} } }, label, state: 'with', t: 0, i: f.wisps.length, flare: 1, from: new THREE.Vector3() };
    f.wisps.push(w); try { c.setState('return'); } catch { /* fine */ }
  }
  toField() {
    const f = this.f; const { ax, az } = this.heroToField();
    /* the gate comes with the cut. It stands
       7.5 m behind the hero at the field, so chapter II opens just past it; chapter II (chapters.js) is held at it */
    if (this.mode === 'gate' && this.gate) {
      this.keepGate = true; this.handles = this.handles.filter((h) => h !== this.gate && h !== this.goalWm);
      try { this.goalWm?.dispose(); } catch { /* gone */ } this.goalWm = null;
      this.light.removeFromParent(); this.w.scene.add(this.light);
      for (const m of [this.shaftO, this.shaftI, this.pool, this.lightGlow, this.lightMotes]) if (m) m.visible = false;
      this.gateFlip = true; this.placeLight(-this.ux * 7.5, -this.uz * 7.5, () => 0); f.fieldGate = { x: this.lx, z: this.lz, w: this.gate.width || 2.6 }; this.gate.group.rotation.y += Math.PI; /* the hero is through the gate now, so the walls' keep stands on the far side of it */
    }
    if (this.fire) { this.fire.pos.set(ax, 0, az); this.fire.group.position.set(ax, 0, az); }
    for (const w of f.wisps) { const a = w.i * 2.1 + 0.6; w.sp.position.set(ax + Math.cos(a) * 2.6, w.c ? 0 : 1.4, az + Math.sin(a) * 2.6); }
    this.disposeLooks();
  }
  /* the walk's own props go; what carries into chapter II stays (the far light, the hearth fire, the freed one) */
  disposeLooks() {
    const f = this.f;
    for (const p of f.props || []) if (p.journey) { try { p.h?.dispose(); } catch { /* gone */ } p.gone = true; }
    f.props = (f.props || []).filter((p) => !p.journey);
    for (const h of this.handles) { try { h.dispose(); } catch { /* gone */ } } this.handles = [];
    this.group.removeFromParent(); for (const o of this.owned) o.dispose?.(); this.owned = [];
  }
  finishWalk() {
    if (this.walkFinished) return; this.walkFinished = true;
    const f = this.f; this.done = true;
    f.journey = null; f.arena = 15; f.footY = 0; f.pace = 1;
    if (this.mode === 'farlight') {
      /* the light stays at the field: it gutters in the dark of chapter II and goes out when the enemy comes */
      const prop = { id: 'farlight', kind: 'farlight', pos: new THREE.Vector3(this.lx, 0, this.lz), hp: 1, maxHp: 1, group: this.light, lit: true, t: 0, args: null, rad: 1.6, /* the solid plinth, not its painted ground patch (a 3 m push held the hero on the far side of it) */
        h: { update: (dt) => this.afterTick(dt, prop), dispose: () => this.dispose() } };
      (f.props ||= []).push(prop); this.prop = prop;
    } else if (this.keepGate) {
      const prop = { id: 'gate', kind: 'gate', pos: new THREE.Vector3(this.lx, 0, this.lz), hp: 1, maxHp: 1, group: null, lit: true, t: 0, args: null, rad: 0.5,
        h: { update: (dt) => this.gateTick(dt, prop), dispose: () => this.dispose() } };
      (f.props ||= []).push(prop); this.prop = prop;
    } else if (this.kept) {
      /* the freed stranger walks with the hero to the end: its figure keeps updating as a prop (fight.stop disposes it) */
      const h = this.kept; this.kept = null;
      (f.props ||= []).push({ id: 'kept', kind: 'companion', pos: new THREE.Vector3(), hp: 1, maxHp: 1, group: null, lit: true, t: 0, args: null, h: { update: (dt) => h.update(dt, f.clock, this.w.camera), dispose: () => h.dispose() } });
      this.disposed = true;
    } else this.disposed = true;
    this.el.remove(); this.mark.remove();
    f.endTask();
  }
  /* after the walk (glory): the gate behind the hero at the field; it sinks when the enemy comes */
  gateTick(dt, prop) {
    const f = this.f; if (this.gateGone) return;
    this.gate?.update?.(dt);
    if (f.stage >= 3) {
      this.sink = (this.sink || 0) + dt / 2.2; this.light.position.y = -ease(clamp(this.sink, 0, 1)) * 7;
      if (this.sink >= 1) { this.gateGone = true; prop.gone = true; f.props = (f.props || []).filter((x) => x !== prop); f.fieldGate = null; this.dispose(); }
      return;
    }
    if (f.paused) return;
    const p = f.pos; for (const c of this.solidsL) { const dx = p.x - c.x; const dz = p.z - c.z; const d2 = dx * dx + dz * dz; if (d2 < c.r * c.r && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * c.r; p.z = c.z + (dz / d) * c.r; } }
  }
  /* a short look at a thing (the name plate as the name lights up): the view leans toward it for `dur` seconds */
  glance(x, y, z, dur = 1.8) {
    const f = this.f; const aim = new THREE.Vector3(x, y, z); let t = 0;
    const off = this.w.addUpdater((dt) => { t += dt; if (t > dur || this.done || this.arriving || f.paused) { off(); return; } const k = Math.sin(Math.PI * clamp(t / dur, 0, 1)); f.turnToward(aim, Math.min(1, dt * 3.2 * k)); const d = Math.max(1, Math.hypot(aim.x - f.pos.x, aim.z - f.pos.z)); const pw = clamp(Math.atan2(aim.y - (f.footY + 2.08), d), -0.4, 0.3); f.pitch += (pw - f.pitch) * Math.min(1, dt * 2.4 * k); });
  }
  /* after the walk (far light): the light at the field centre, with its stones solid */
  afterTick(dt, prop) {
    const f = this.f; if (this.disposed) return;
    const want = f.stage >= 3 ? 0 : f.inSecond ? 0.14 : 0.9;
    this.lightK += (want - this.lightK) * Math.min(1, dt * (want < this.lightK ? 0.8 : 1.5));
    this.tickLight(dt);
    if (f.stage >= 3) {
      /* the enemy comes: the light goes out and the stones sink into the ground */
      this.sink = (this.sink || 0) + dt / 2.2; const s = ease(clamp(this.sink, 0, 1));
      this.light.position.y = -s * 3.6;
      if (this.sink >= 1) { prop.gone = true; f.props = (f.props || []).filter((x) => x !== prop); this.dispose(); return; }
    }
    if (f.paused || prop.gone) return;
    const p = f.pos;
    for (const c of this.solidsL) { const dx = p.x - c.x; const dz = p.z - c.z; const d2 = dx * dx + dz * dz; if (d2 < c.r * c.r && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * c.r; p.z = c.z + (dz / d) * c.r; } }
  }
  dispose() {
    if (this.disposed && this.mode === 'farlight' && !this.group.parent) return;
    this.disposed = true; this.done = true;
    try { this.view?.release?.(); } catch { /* gone */ }
    for (const foe of this.foes) if (!foe.gone && foe.state !== 'dead') this.despawn(foe);
    try { this.disposeLooks(); } catch { /* gone */ }
    try { this.kept?.dispose(); } catch { /* gone */ } this.kept = null;
    if (this.keepGate) { try { this.gate?.dispose(); } catch { /* gone */ } this.light?.removeFromParent(); this.keepGate = false; }
    for (const h of this.f.warmPieces || []) { try { h.dispose(); } catch { /* gone */ } } this.f.warmPieces = null;
    this.el?.remove(); this.mark?.remove();
    if (this.f.journey === this) { this.f.journey = null; this.f.arena = 15; this.f.footY = 0; this.f.pace = 1; }
  }
  /* test hook (tools/lib/quest-driver.mjs): what to do now. { x, z, r } walk there and stand; hit: strike the thing at (x, z);
     fight: a foe to fight (the bot's fight code aims); runner: a foe that runs (keep at its heels) */
  /* the bot follows the route's next corner whenever a wall or water shuts the straight walk (a hero goes where the mark points) */
  botTarget() {
    const t = this.botTarget0(); if (!t || t.fight || t.runner || t.x == null || this.arriving) return t;
    const wp = this.guideTo(t.x, t.z, t.end ? 6.2 : Math.max(1.8, (t.r || 1) + 0.8)); return wp ? { x: wp.x, z: wp.z, r: 1.1 } : t;
  }
  botTarget0() {
    if (this.arriving || this.done) return null;
    const f = this.f;
    if (this.detour) return { x: this.detour.x, z: this.detour.z, r: 1 };
    if (this.mode === 'trail' && this.scout && this.scout.state !== 'rest' && !this.scout.foe.gone && this.scout.foe.state !== 'dead') return { fight: true, runner: this.scout.state === 'run' };
    if (this.mode === 'hearth' && this.raid?.some((x) => x.going && !x.foe.gone)) { const R = this.raid.find((x) => x.going && !x.foe.gone); return { x: R.foe.pos.x, z: R.foe.pos.z, r: 3.5 }; }
    if (this.foeD < 14) return { fight: true };
    if (this.view?.active && !this.view.done) return { x: this.view.x, z: this.view.z, r: 1.6 };
    if (this.mode === 'cage') { const fd = this.stops.filter((s) => !s.got).sort((a, b) => Math.hypot(a.x - f.pos.x, a.z - f.pos.z) - Math.hypot(b.x - f.pos.x, b.z - f.pos.z))[0]; if (fd) { /* the post pushes the hero out to f.propRad (2.15 to 2.3 m on some worlds); the bot strikes from there (decide() strikes inside r + 0.5), never needing to stand closer than the push-out ring */ let rad = 0; try { rad = fd.prop ? f.propRad(fd.prop) : 0; } catch { rad = 0; } return { x: fd.x, z: fd.z, r: Math.max(1.7, rad - 0.2), hit: true }; } return { x: this.lx, z: this.lz, r: 4, end: true }; }
    if (this.mode === 'hearth' && this.found >= 3 && !this.q2on) { const E = this.esc; const tl = Math.hypot(this.lx - E.x, this.lz - E.z); if (tl > 4.5) return { x: E.x - this.ux * 4 + this.nx * 2, z: E.z - this.uz * 4 + this.nz * 2, r: 2.5 } /* the bot walks behind him and a little aside, never through him */; }
    if (this.mode === 'hearth' && Math.hypot(this.esc.x - f.pos.x, this.esc.z - f.pos.z) > 13) return { x: this.esc.x, z: this.esc.z, r: 6 };
    const G = this.next(); return { x: G.x, z: G.z, r: G.end ? 4 : this.mode === 'gate' ? 3 : 1.3, end: G.end };
  }
}

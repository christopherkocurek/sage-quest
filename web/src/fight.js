/* First-person melee. Code runs movement, moves, hits, poise, armour breaks and physics.
   Sage2 picks each foe group's tactic and the director picks the next wave. */
import * as THREE from 'three';
import { applyFoeBody, foesOn, sealFoeBody, hasFoeSpecs, FOE_URL, heroSeed } from './bodies.js';
import { makeActor, makeGear, mountGear, styleGear, dotTexture, loadGLB, KNIGHT_URL, worldMod, worldWear, LAND_LOOK, PERF, plateLift, isShield, fpMount, addNearFade, NEAR_FADE } from './world.js';
import { api, feed } from './net.js';
import { sfx, sfxFoot, footStride } from './sfx.js';
import { tellStory, wordSwap } from '/game/story.mjs';
import { FOES, BOSSES, TACTICS, BEATS, RESOLVES, MINIONS, byId } from '/game/kit.mjs';
import { kitFor } from '/game/worlds.mjs';
import { loadHandPoses } from './ranged-hands.js'; /* the posed hand meshes of a gun or a bow, loaded with the arms */
import { Ranged, weaponFeel } from './ranged.js'; /* guns and bows (fight.rg) and the feel of each weapon class */
import { Powers } from './powers.js'; /* the E-key power, its particles, decals and light (fight.powers) */
import { DeathDirector, climax, climaxHit } from './death-director.js'; /* every boss death is one staged cut (fight.dd); the payoff, and the last fifth of the boss's health (climax) */
import { FoeReact } from './react.js'; /* how a foe takes a blow and dies (fight.react) */
import { BOSS_ATK, bossBrain, phaseLine, PHASE_AT } from './boss-moves.js'; /* boss numbers, moves and choices */
import { lightSet, holdNewLights, warmNewLights } from './quality.js'; /* perf */
import * as Q2 from './quest2.js'; /* the nine-row plan (new beats per shape) */
import { NearCam } from './nearcam.js'; /* one near-frame system (protected volume, cinema clear, plates) */
import { Guide } from './guide.js'; /* the mark, the edge arrow, the prompt at the object, the nudges */
import { Teach } from './teach.js'; /* the combat lessons, one prompt at a time */
import * as CHAP from './chapters.js'; /* chapters II and III that ask for a new act (freedom, wonder, glory) */
import * as C2 from './combat2.js'; /* combat2 (combat): armour, punish windows, counters, phases */
import * as PWR from './powerup.js'; /* the heart answer's power works in the fight and shows when it does */
/* a/an by the first sound of the next word ("an Enforcer", "a Clerk") */
const aAn = (t) => String(t).replace(/\b(A|a)n? (?=([A-Za-z]))/g, (m, a, c) => `${a}${/[aeiouAEIOU]/.test(c) ? 'n' : ''} `);
/* first-person arm parts: /assets/real/fp_<part>.glb, or fp_<part>_<world>.glb when the world sets `fp` (dark if missing) */
const fpUrl = (part, fp) => (fp ? `/assets/real/fp_${part}_${fp}.glb` : `/assets/real/fp_${part}.glb`);
/* a world fp set covers hand, forearm and upper by default; the leg comes from the world only when its entry lists it (fpParts), so a missing file is never asked for */
const FP_PARTS = ['hand', 'forearm', 'upper'];
/* the real hand. A real hand mesh is posed (Blender Studio Human Base Meshes, CC0) into
   fp2_<pose>_<look>.glb: a TRUE right hand in the fist frame (handle +Y, knuckles -Z, back +X, wrist +Z); the left hand is its
   mirror. A world listed here shows it in place of the sculpted hand; HAND2_WRIST is its wrist centre in the fist frame. */
/* every world. look = the mesh set (skin: a bare hand; glove: the same hand a millimetre fatter); color = what
   the shading in COLOR_0 is multiplied with; rough = its roughness. A bare hand takes the hero's own skin tone when the hero
   bodies give one (window.__sq.heroSkin, a hex number: web/src/bodies.js), else the world's. */
export const HAND2 = {
  dark: { look: 'glove', color: 0x4a382a, rough: 0.7 }, edo: { look: 'glove', color: 0x2a3148, rough: 0.85 }, neon: { look: 'glove', color: 0x23262d, rough: 0.5 },
  frontier: { look: 'skin', color: 0xb9754a, rough: 0.6 }, storybook: { look: 'glove', color: 0x7a4a2c, rough: 0.72 },
};
export const hand2Tone = (H) => { const hs = H.look === 'skin' ? (typeof window !== 'undefined' ? window.__sq?.heroSkin : null) : null; return typeof hs === 'number' ? hs : H.color; };
export const hand2Url = (pose, look) => `/assets/real/fp2_${pose}_${look}.glb`;
const HAND2_WRIST = [0.02, -0.002, 0.084];
const loadFp = (part, fp, parts = FP_PARTS) => (fp && parts.includes(part) ? loadGLB(fpUrl(part, fp)).catch(() => loadGLB(fpUrl(part, null))) : loadGLB(fpUrl(part, null)));
/* a hero may carry its own arm set (world heroes.<id>.fp = 'storybook_cloth' -> fp_<part>_storybook_cloth.glb for
   hand, forearm and upper); a missing file falls back to the world's set, then to dark. The leg stays the world's. */
const loadArm = (part, own, fp) => (own ? loadGLB(fpUrl(part, own)).catch(() => loadFp(part, fp)) : loadFp(part, fp));

export { styleGear };

const EYE = 2.08;
const CORPSE = 6; const CORPSE_FADE = 1.7; /* a body lies (2.2 s near the camera), then goes out in the world's way (6 s, then 1.7 s of ash, petals, glitch, dust or sparkle) */
const PARRY = 0.3;
const ARENA = 15;
const TICK = 1.0;
const HOLD = 2.0;
const BUDGET_MS = 600;
const LATE_MS = 1500;
const SOFT = new Set(['guard', 'retreat', 'feint']);
const WAVES = {
  first: [['minion', 2], ['warrior', 1]],
  reinforce_thralls: [['minion', 4]],
  reinforce_stalkers: [['rogue', 2], ['minion', 1]],
  reinforce_guard: [['warrior', 1, { captain: true }], ['warrior', 1]],
  reinforce_brute: [['brute', 1], ['minion', 2]],
};
/* "Knife Men", "Spike Men", not "Knife Mans" */
const many = (label) => (/(^|\s)(Wo)?[Mm]an$/.test(label) ? label.replace(/an$/, 'en') : /(s|sh|ch|x)$/.test(label) ? `${label}es` : `${label}s`);
const plural = (n, label) => `${n} ${n === 1 ? label : many(label)}`;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* where the enemy waits on the horizon, and where it holds what it took */
const HORIZON = new THREE.Vector3(30, 15, -84);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ---------- foe attacks. `hits` are clip times in seconds; `tell` is the warning time before the first hit ---------- */
const ATK = {
  slashA: { clip: 'Sword_Regular_A', hits: [0.25], tell: 0.7, post: 1.0, end: 0.42, rec: 'Sword_Regular_A_Rec', recover: 0.95, lunge: 1.0, dmg: 1 },
  slashB: { clip: 'Sword_Regular_B', hits: [0.27], tell: 0.75, post: 1.0, end: 0.5, recover: 0.9, lunge: 0.8, dmg: 1 },
  chop: { clip: 'Sword_Attack', hits: [0.4], tell: 0.85, post: 1.25, end: 1.0, recover: 0.9, lunge: 0.9, dmg: 1.2, guardBreak: 2 },
  combo: { clip: 'Sword_Regular_Combo', hits: [0.25, 0.73, 1.56], tell: 0.75, post: 1.05, end: 2.1, recover: 1.1, lunge: 0.7, dmg: 1 },
  bash: { clip: 'Shield_OneShot', hits: [0.1], tell: 0.65, post: 1.0, end: 0.7, recover: 0.9, lunge: 1.6, dmg: 0.5, guardBreak: 2, push: 3.2, blunt: true },
  hook: { clip: 'Melee_Hook', hits: [0.25], tell: 0.6, post: 1.0, end: 0.45, rec: 'Melee_Hook_Rec', recover: 0.8, lunge: 1.1, dmg: 1 },
  dash: { clip: 'Sword_Dash', hits: [0.33], tell: 0.75, post: 1.0, end: 1.2, recover: 1.0, lunge: 4.2, range: 6.5, dmg: 1.3 },
  scratch: { clip: 'Zombie_Scratch', hits: [0.56], tell: 0.75, post: 1.2, end: 1.2, recover: 0.8, lunge: 0.6, dmg: 1 },
  smash: { clip: 'Sword_Attack', hits: [0.4], tell: 1.15, post: 0.9, end: 1.1, recover: 1.3, lunge: 1.2, dmg: 1.7, unblockable: true, hyper: true, quake: true },
  quake: { clip: 'Sword_Attack', hits: [0.4], tell: 1.25, post: 0.9, end: 1.1, recover: 1.6, lunge: 1.6, dmg: 1.4, unblockable: true, hyper: true, quake: true, wave: true },
  bolt: { clip: 'Spell_Simple_Shoot', hits: [0.1], tell: 0.9, post: 1.0, end: 0.46, recover: 0.5, lunge: 0, range: 15, dmg: 1, projectile: true },
  sweep: { clip: 'Sword_Heavy_Combo', hits: [0.45, 1.17], tell: 0.95, post: 1.0, end: 1.7, recover: 1.2, lunge: 0.8, dmg: 1.2, guardBreak: 2, hyper: true },
  ...BOSS_ATK, /* the boss moves (web/src/boss-moves.js) */
};

/* ---------- player view-model. All in camera space: x right, y up, the camera looks along -z ----------
   A pose is a hand position p, the direction d that the blade points, and the direction e that its edge faces.
   A cut is a path of the hand and a sweep of the blade from d[0] through d[1] to d[2]; the edge always leads. */
const D = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const POSE = (px, py, pz, d, e) => ({ p: V(px, py, pz), d, e });
/* the rest holds keep the blade in the lower-right third: the fist low right, the blade up and a little out, so its
   tip stays right of x = 0.36 (NDC) and never crosses the screen centre, a title or the target (was a diagonal through it) */
const REST = {
  /* the Skyrim hold. The fist sits nearer the eye (0.42 m, was 0.6: the hand is about a fifth of the frame high,
     not a tenth), low right; the blade rises forward and a little in, and its EDGE leads forward and down, away from the
     player (it faced left: the flat was square to the eye and the hand was seen from its finger side) */
  one: POSE(0.235, -0.195, -0.4, D(-0.06, 0.8, -0.6), D(0.75, -0.3, -0.6)),
  two: POSE(0.2, -0.27, -0.44, D(-0.1, 0.78, -0.62), D(0.4, -0.35, -0.85)),
  dual: POSE(0.27, -0.23, -0.44, D(0.02, 0.76, -0.65), D(0.3, -0.4, -0.87)),
  pole: POSE(0.26, -0.3, -0.4, D(-0.42, 0.3, -0.86), D(0.3, -0.85, -0.4)),
};
const GUARD = {
  one: POSE(0.06, -0.22, -0.6, D(-0.8, 0.56, -0.22), D(0.4, 0.75, -0.5)),
  two: POSE(0.12, -0.22, -0.6, D(-0.78, 0.6, -0.2), D(0.4, 0.75, -0.5)),
  dual: POSE(0.17, -0.28, -0.58, D(-0.55, 0.8, -0.2), D(0.4, 0.7, -0.55)), /* the crossed daggers guard low, under the target (they crossed over it: 36% of the reticle box) */
  pole: POSE(0.2, -0.24, -0.56, D(-0.96, 0.26, -0.1), D(0, 0.8, -0.6)),
};
/* a gun or a bow guards on the right with the forearm across, the weapon tipped out of the centre (the sword
   guard held a pistol over the target: a quarter of the frame) */
const GUN_GUARD = POSE(0.24, -0.28, -0.56, D(-0.45, 0.85, -0.15), D(0.3, 0.25, -0.92));
const ARCS = {
  rl: { p: [V(0.42, -0.06, -0.52), V(0.2, -0.2, -0.84), V(-0.24, -0.3, -0.62)], d: [D(0.6, 0.75, 0.3), D(-0.5, 0.3, -0.82), D(-0.95, -0.25, -0.1)], side: 'L', roll: -0.05, cone: 0.3 },
  lr: { p: [V(-0.12, -0.1, -0.54), V(0.12, -0.22, -0.84), V(0.5, -0.3, -0.6)], d: [D(-0.7, 0.65, 0.3), D(0.5, 0.28, -0.82), D(0.95, -0.25, -0.1)], side: 'R', roll: 0.05, cone: 0.3 },
  over: { p: [V(0.3, -0.02, -0.56), V(0.24, -0.16, -0.86), V(0.18, -0.4, -0.64)], d: [D(0.14, 0.68, 0.72), D(0, 0.55, -0.84), D(0, -0.62, -0.78)], side: 'H', pitch: -0.05, cone: 0.55 },
  thrust: { p: [V(0.4, -0.3, -0.46), V(0.26, -0.27, -0.76), V(0.1, -0.24, -1.04)], d: [D(-0.1, 0.12, -1), D(-0.05, 0.08, -1), D(0, 0.04, -1)], e: D(0, -1, 0), side: 'C', cone: 0.8, single: true },
  sweep: { p: [V(0.46, -0.12, -0.56), V(0.1, -0.2, -0.86), V(-0.32, -0.28, -0.6)], d: [D(0.94, 0.3, 0.3), D(-0.35, 0.12, -0.93), D(-0.98, -0.1, 0.05)], side: 'L', roll: -0.09, cone: -0.15 },
  slam: { p: [V(0.3, 0.02, -0.56), V(0.24, -0.16, -0.86), V(0.18, -0.44, -0.64)], d: [D(0.1, 0.52, 0.86), D(0, 0.55, -0.84), D(0, -0.78, -0.62)], side: 'H', pitch: -0.09, cone: 0.45 },
};
/* Timing of every cut as fractions of its length: the wind-up coils back past the start of the arc, then one
   unbroken sweep speeds up, peaks at about 40% and runs out past the end of the arc; the rest is the recovery. */
const WIND = 0.3; const SPAN = 0.46; const CUT = SPAN * 0.66; const U0 = -0.08; const U1 = 1.1;
const sweepU = (T) => (1 - Math.cos(Math.PI * Math.pow(T, 0.75))) / 2;
{ let t0 = 0; let t1 = 1; for (let T = 0; T <= 1; T += 0.005) { const u = U0 + (U1 - U0) * sweepU(T); if (u < 0.18) t0 = T; if (u < 0.94) t1 = T; }
  for (const a of Object.values(ARCS)) a.hit = [WIND + SPAN * t0, WIND + SPAN * t1]; }
const MOVESETS = {
  one: { lights: ['rl', 'lr', 'over'], heavy: 'slam' },
  two: { lights: ['rl', 'lr', 'over'], heavy: 'sweep' },
  dual: { lights: ['rl', 'L:rl', 'thrust', 'L:thrust'], heavy: 'sweep' },
  pole: { lights: ['thrust', 'thrust', 'rl'], heavy: 'sweep' },
};
const ease = (k) => k * k * (3 - 2 * k);
/* a boss whose head is more than TALL_H m over the eye is "very tall": the pitch stays under TALL_PITCH (rad)
   and the view backs off up to TALL_BACK m instead */
const TALL_H = 2.6; const TALL_PITCH = 0.34; const TALL_BACK = 3.6; const TALL_FACE = 0.34; /* the face sits TALL_FACE rad over the view centre: about 0.5 up the half frame, under the boss bar */
const _m = new THREE.Matrix4(); const _x = new THREE.Vector3(); const _y = new THREE.Vector3(); const _z = new THREE.Vector3();
/* blade along +Y, edge along +X */
function quatOf(d, e, out) {
  _y.copy(d).normalize(); _x.copy(e).addScaledVector(_y, -e.dot(_y));
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _x.normalize(); _z.crossVectors(_x, _y);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}
const bez = (a, b, c, u, out) => out.set(0, 0, 0).addScaledVector(a, (1 - u) * (1 - u)).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(c, u * u);
const _d0 = new THREE.Vector3(); const _d1 = new THREE.Vector3(); const _e = new THREE.Vector3();
/* the hand and blade at the point u of a cut (0..1, a little outside is fine); the blade may trail the hand by lag */
function cutPose(arc, u, flip, outP, outQ, lag = 0) {
  bez(arc.p[0], arc.p[1], arc.p[2], u, outP);
  const ud = u - lag;
  bez(arc.d[0], arc.d[1], arc.d[2], ud, _d0).normalize();
  if (arc.eb) bez(arc.eb[0], arc.eb[1], arc.eb[2], ud, _e); /* a gun's own arc gives the barrel as a path */
  else if (arc.e) _e.copy(arc.e);
  else { bez(arc.d[0], arc.d[1], arc.d[2], ud + 0.03, _d1).normalize(); _e.subVectors(_d1, bez(arc.d[0], arc.d[1], arc.d[2], ud - 0.03, _y).normalize()); }
  if (flip) { outP.x = -outP.x; _d0.x = -_d0.x; _e.x = -_e.x; }
  return quatOf(_d0, _e, outQ);
}
const _rp = new THREE.Vector3(); const _rq = new THREE.Quaternion(); const _tq = new THREE.Quaternion(); const _reachQ = new THREE.Quaternion(); const _reachAx = new THREE.Vector3(1, 0, 0.35).normalize(); const _reachAxG = new THREE.Vector3(1, 0, 0);
/* A whole move at time k (0..1). It starts from the pose the hand has now (from), so a chain flows from one cut into the next. */
function movePose(arc, rest, k, flip, outP, outQ, from = null) {
  _rp.copy(rest.p);
  if (rest.q) _rq.copy(rest.q); /* a gun's hold comes as a turn already */
  else { quatOf(rest.d, rest.e, _rq); if (flip) { _rp.x = -_rp.x; _d0.copy(rest.d); _d0.x = -_d0.x; _e.copy(rest.e); _e.x = -_e.x; quatOf(_d0, _e, _rq); } }
  if (k < WIND) { cutPose(arc, U0, flip, outP, outQ); _tq.copy(outQ); const t = ease(k / WIND); outP.lerpVectors(from ? from.p : _rp, outP, t); outQ.slerpQuaternions(from ? from.q : _rq, _tq, t); return; }
  if (k < WIND + SPAN) { const T = (k - WIND) / SPAN; cutPose(arc, U0 + (U1 - U0) * sweepU(T), flip, outP, outQ, arc.single ? 0 : 0.1 * Math.sin(Math.PI * Math.min(1, T * 1.6))); return; }
  cutPose(arc, U1, flip, outP, outQ);
  const t = ease(clamp((k - WIND - SPAN) / (1 - WIND - SPAN), 0, 1));
  outP.lerp(_rp, t); outQ.slerp(_rq, t);
}
/* in the wide arcs (the wind-up of rl and slam, the end of rl and sweep) the blade lay with its flat face to the
   lens and read as a broad flat plank. When the face turns more than about 60 degrees toward the eye, the blade rolls about
   its own axis, part of the way to edge-on (at most 0.8 rad), so it reads as a blade. */
const _eoV = new THREE.Vector3(); const _eoX = new THREE.Vector3(); const _eoZ = new THREE.Vector3(); const _eoQ = new THREE.Quaternion(); const _eoY = new THREE.Vector3(0, 1, 0);
function edgeOn(p, q) {
  _eoV.copy(p).normalize(); _eoX.set(1, 0, 0).applyQuaternion(q); _eoZ.set(0, 0, 1).applyQuaternion(q);
  const a = _eoZ.dot(_eoV); const b = _eoX.dot(_eoV); if (Math.abs(a) < 0.5) return;
  let th = Math.atan2(-a, b); if (th > Math.PI / 2) th -= Math.PI; else if (th < -Math.PI / 2) th += Math.PI;
  const k = clamp((Math.abs(a) - 0.5) / 0.3, 0, 1) * 0.7; q.multiply(_eoQ.setFromAxisAngle(_eoY, clamp(th * k, -0.8, 0.8)));
}
/* The fist holds the handle in a hammer grip: the wrist sits behind the edge (-x of the grip). It may turn only so far from there. */
function gripTurn(want) { let d = want + Math.PI / 2; d = Math.atan2(Math.sin(d), Math.cos(d)); return -Math.PI / 2 + clamp(d, -1.75, 1.75); }
/* how far the body has turned into a move: -1 coiled, +1 swung through */
function bodyTurn(k) { return k < WIND ? -ease(k / WIND) : k < WIND + SPAN ? -1 + 2 * sweepU((k - WIND) / SPAN) : 1 - ease(clamp((k - WIND - SPAN) / (1 - WIND - SPAN), 0, 1)); }

/* the first-person shield poses (preallocated: leftTarget runs every frame) */
const SHIELD_GUARD_E = new THREE.Euler(-0.1, 0.34, 0.12); const SHIELD_REST_E = new THREE.Euler(-0.3, 1.3, -0.2);
export class Fight {
  /* kit = kitFor(worldId) from game/worlds.mjs (the blueprint's opts.world; `world` is the 3D World here): foe defs, names,
     the boss def by mechanic, fp arms, torch and the boss lines come from it; missing = dark */
  constructor({ world, hud, director, archetype, weapon, material, element, build = 2.5, onEnd, nemesis = null, enemyWords = '', story = null, onCamp = null, resume = null, minions = null, kit = null }) {
    Object.assign(this, { world, hud, director, archetype, weapon, material, element, onEnd, nemesis, enemyWords, story, onCamp, resume });
    this.kit = kit || kitFor('dark');
    NEAR_FADE.value = 0.85; /* foe parts inside 0.85 m of the camera dissolve (world.js addNearFade); was 0.6, and a dark torso 0.6-0.85 m off drew as a flat panel */
    this.near = new URLSearchParams(location.search).get('near') === '0' ? null : new NearCam(this); /* ?near=0 turns it off. the protected volume keeps foes out (nearPad), hides companions, corpses and small props inside it; the dither above is the last guard only */
    /* the world's nouns in the lines the player reads (the fire, the road, beacons, anchors); dark = unchanged */
    this.ww = wordSwap(this.kit.id && this.kit.id !== 'dark' ? this.kit.words : null);
    /* the servants of the enemy carry a name from the player's own words */
    this.minions = minions || null; /* no "Clerks" default any more: no minions = the world's own foe names (main.js picks quick-start minions from words=) */
    /* the quest: chapter 1 the road, 2 the taking, 3 the enemy; the vow picks a gift that changes these numbers */
    /* test hook: ?story=1 on a quick-start link tells the quest with the test persona */
    const sp = new URLSearchParams(location.search).get('story');
    if (!this.story && sp != null) { const mo = ['protect', 'revenge', 'glory', 'freedom', 'wonder'].includes(sp) ? sp : 'protect'; this.story = tellStory({ name: 'Rowan', place: 'New Orleans', land: world.biome?.label, motive: mo, /* &nobody=1 = the player named no one */ mentions: /[?&]nobody=1/.test(location.search) ? [] : [{ text: 'Wren' }, { text: 'Ash' }], kinds: /[?&]nobody=1/.test(location.search) ? [] : ['person', 'animal'], enemyLabel: nemesis?.label, pronoun: nemesis?.pronoun || ([nemesis?.intro, nemesis?.death].some((t) => /^(He|His)\b/.test(t || '')) ? 'he' : undefined) , fellVerb: nemesis?.fellVerb, words: enemyWords, minion: this.minions?.one || this.kit.FOES?.find((d) => d.id === 'minion')?.label?.replace(/^Hollow /, ''), scout: this.kit.foeName?.(this.kit.FOES?.find((d) => d.id === 'rogue'), this.minions)?.replace(/^Hollow /, '') /* the scout's own kind */, worldWords: this.kit.id !== 'dark' ? this.kit.words : undefined }); }
    this.stage = 1; this.taken = false; this.resolve = null; this.vow = null; this.revive = false; this.paused = false; this.wisps = []; this.regenT = 0;
    this.mod = { parry: 1, dodgeCd: 0.75, guardRegen: 1.3, regen: 0, dodgeCrit: false };
    this.rings = []; this.shots = []; this.boss = null; this.bossFoe = null; this.bossStarted = false; this.bossMul = 1; this.twistFn = null; this.twistId = null; this.noAdds = false;
    this.power = 0.85 + (build - 1) * 0.12;
    this.cls = weapon.cls || 'one'; this.feel = weaponFeel(weapon); this.moves = this.feel.moves || MOVESETS[this.cls];
    this.abilityCd = 0; this.abilityMax = 9; this.slow = 0; this.blockSince = -9; this.held = false; this.heldAt = 0;
    this.pos = V(); this.vel = V();
    /* arena: the clamp radius (the far light walk lifts it); footY: ground under the hero; pace: travel speed; journey: web/src/journey.js */
    this.arena = ARENA; this.footY = 0; this.pace = 1; this.journey = null;
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.kickPitch = 0; this.shake = 0; this.twist = 0;
    this.hp = archetype.hp; this.maxHp = archetype.hp;
    this.guard = 3; this.guardRegen = 0; this.stagger = 0;
    this.blocking = false; this.swing = null; this.swingCd = 0; this.chain = 0; this.chainT = 0; this.buffer = null; this.charge = null; this.kick = null; this.kickCd = 0;
    this.dodge = null; this.dodgeCd = 0; this.invuln = 0; this.crit = 0; this.lock = null;
    this.keys = new Set();
    this.foes = []; this.groups = []; this.nextId = 1; this.debris = [];
    this.wave = 0; this.waveStart = 0; this.clock = 0;
    this.stats = { kills: 0, blocks: 0, dodges: 0, parries: 0, abilities: 0, damage: 0, waves: 0, waveBlocks: 0, waveDodges: 0, waveDamage: 0, tactics: {}, late: 0, executes: 0, breaks: 0, kicks: 0, knockdowns: 0, combo: 0 };
    this.tick = 0; this.tickTimer = 0;
    this.hitstop = 0; this.active = false; this.over = false; this.betweenWaves = false;
    this.labels = []; this.reinforcements = 1; this.listeners = [];
    this.sway = V(); this.vmPunch = V(); this.lean = 0; this.nod = 0; this.push = 0; this.lastDrop = 0; this.stepT = 0;
  }

  async start() {
    const fp = this.kit.fp;
    /* the foe body file is parsed and its maps are on the GPU before the first wave (it cost a 0.2-0.3 s
       frame at the first spawn) */
    const warmFoe = foesOn() && hasFoeSpecs(this.kit?.id || 'dark') ? loadGLB(FOE_URL).then((g) => { const R = this.world.renderer; g.scene.traverse((o) => { const m = o.material; if (!m) return; for (const k of ['map', 'normalMap']) if (m[k]) { try { R.initTexture(m[k]); } catch { /* not ready */ } } }); }).catch((err) => console.warn('foe warm', err)) : null;
    await Promise.all([warmFoe, makeActor(KNIGHT_URL).then((a) => a.dispose()), loadArm('hand', this.archetype?.fp, fp), loadArm('forearm', this.archetype?.fp, fp), loadArm('upper', this.archetype?.fp, fp), loadFp('leg', fp, this.kit.fpParts), this.weapon?.ranged ? loadHandPoses() : null]);
    await this.buildViewModel();
    this.prewarm();
    try { this.powers = new Powers(this); } catch (err) { console.warn('powers', err); this.powers = null; } /* built and drawn once here, so a first cast never compiles */
    try { this.react = new FoeReact(this); } catch (err) { console.warn('react', err); this.react = null; } /* hit reaction, death fall, dissolve, kill burst */
    try { PWR.installPower(this); } catch (err) { console.warn('power', err); }
    this.buildTargetUi();
    this.bind();
    this.active = true;
    this.world.camera.fov = 70; this.world.camera.updateProjectionMatrix();
    this.hud.show(true);
    this.remove = this.world.addUpdater((dt) => this.update(dt));
    this.director.event(`The hero is ${this.archetype.label} with ${this.maxHp} health, armed with a ${this.weapon.label.toLowerCase()}.`);
    await this.buildWisps();
    if (window.__sq?.firstWave === 'boss') {
      this.wave = 2; this.stage = 3; this.taken = true; for (const w of this.wisps) { w.state = 'held'; w.sp.position.copy(HORIZON); }
      const rq = new URLSearchParams(location.search).get('resolve'); /* combat2 (test): &wave=boss&resolve=defiance fights with that boon */
      if (this.resume?.resolve || rq) this.applyResolve(byId(RESOLVES, this.resume?.resolve || rq), this.resume?.vow || null);
      if (this.story) await this.chapter(this.story.last);
      await this.startBoss(); return;
    }
    /* a story run opens with its own chapter I (quick-start links set firstWave 'first' by default; any other wave skips it) */
    if (this.story && (!window.__sq?.firstWave || window.__sq.firstWave === 'first')) {
      /* a walk warms its foes' shaders while the chapter card is up (journey.js warmJourney) */
      if (this.story.first?.journey) this.journeyWarm = import('./journey.js').then((m) => m.warmJourney(this)).catch((err) => console.warn('journey warm', err));
      try { Q2.retell(this); } catch (err) { console.warn('quest retell', err); } /* the lines of the new chapter I */
      await this.chapter(this.story.first || this.story.road); if (!this.over) await this.opening(); return;
    }
    await this.spawnWave(window.__sq?.firstWave && WAVES[window.__sq.firstWave] ? window.__sq.firstWave : 'first');
  }
  /* the first kill draws a soul sprite and ember points: their shader programs are built now, one frame at opacity 0, not on the kill frame */
  prewarm() {
    try {
      const sm = new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const sp = new THREE.Sprite(sm); sp.frustumCulled = false; sp.scale.setScalar(0.01);
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const pm = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, color: 0xffffff, size: 0.01, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const pts = new THREE.Points(pg, pm); pts.frustumCulled = false;
      sp.position.set(this.pos.x, EYE, this.pos.z - 2); pts.position.copy(sp.position); this.world.scene.add(sp, pts);
      let n = 0; const off = this.world.addUpdater(() => { if (++n < 3) return; off(); sp.removeFromParent(); pts.removeFromParent(); pg.dispose(); });
      this._warm = [sm, pm];
    } catch (err) { console.warn('prewarm', err); }
  }

  /* ---------- view model: two armoured arms, the weapon, a leg for the kick ---------- */
  async buildViewModel() {
    const vm = new THREE.Group(); vm.scale.setScalar(1.08);
    const steel = new THREE.Color(0xd4d9e2);
    const fp = this.kit.fp;
    const own = this.archetype?.fp; const src = { hand: (await loadArm('hand', own, fp)).scene, fore: (await loadArm('forearm', own, fp)).scene, upper: (await loadArm('upper', own, fp)).scene };
    const look2 = HAND2[this.kit.id || 'dark'] || HAND2.dark;
    const h2 = look2 ? (await loadGLB(hand2Url('grip', look2.look)).catch(() => null))?.scene || null : null; this.hand2 = h2 ? look2 : null;
    const part = (which, left) => {
      const g = new THREE.Group(); const m = (which === 'hand' && h2 ? h2 : src[which]).clone(true);
      if (which === 'hand' && h2) { g.userData.hand2 = look2; m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(hand2Tone(look2)); o.material.roughness = look2.rough; o.material.metalness = 0; } }); }
      m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (/metal_plate/.test(o.material.name)) { o.material.color.copy(steel); o.material.envMapIntensity = 1.3; plateLift(o.material); } else if (!/Leather/.test(o.material.name)) { o.material.color.set(0x2b2520); o.material.roughness = 0.9; o.material.metalness = 0; } } });
      if (left) m.scale.x = -1;
      g.add(m); vm.add(g); return g;
    };
    /* each arm: a fist on the grip, a forearm and an upper arm that an elbow solve places every frame */
    const arm = (left) => ({ fist: part('hand', left), fore: part('fore', left), upper: part('upper', left), holder: new THREE.Group(), p: V(), q: new THREE.Quaternion(), side: left ? -1 : 1 });
    this.hands = { r: arm(false), l: arm(true) };
    /* the real hand holds the grip the way a hand does: the knuckles in line with the edge (a fixed roll about the
       handle, a few degrees of give toward the shoulder), not rolled freely toward the shoulder */
    if (h2) for (const h of [this.hands.r, this.hands.l]) { h.hand2 = true; h.turnBase = -Math.PI / 2; h.turnLim = 0.3; }
    const main = styleGear(await makeGear(this.weapon.gear), this.material, this.element);
    this.hands.r.holder.add(main); this.gear = main; vm.add(this.hands.r.holder);
    this.offKind = this.weapon.offhand || null;
    if (this.cls === 'two' || this.cls === 'pole') {
      /* the second hand grips the same haft */
      this.grip2 = new THREE.Object3D(); this.grip2.position.set(0, this.cls === 'pole' ? 0.46 : -0.22, 0); this.hands.r.holder.add(this.grip2);
    } else if (this.offKind) {
      const off = styleGear(await makeGear(this.offKind), this.material, this.offKind === 'dagger' ? this.element : null);
      if (isShield(this.offKind)) fpMount(off, this.offKind); /* each shield's own first-person mount (world.js) */
      this.hands.l.holder.add(off); this.offGear = off; vm.add(this.hands.l.holder);
    } else { for (const k of ['fist', 'fore', 'upper']) this.hands.l[k].visible = false; }
    const legSrc = (await loadFp('leg', fp, this.kit.fpParts)).scene.clone(true);
    /* the dark leg is painted steel; a world leg keeps its own materials (the arms' rule: plate takes the steel) */
    const ownLeg = !!fp && (this.kit.fpParts || FP_PARTS).includes('leg');
    legSrc.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (!ownLeg) { o.material.color.copy(steel); o.material.envMapIntensity = 1.3; } else if (/metal_plate/.test(o.material.name)) { o.material.color.copy(steel); plateLift(o.material); } } });
    legSrc.rotation.y = Math.PI;
    const leg = new THREE.Group(); leg.add(legSrc); leg.visible = false; vm.add(leg); this.vmLeg = leg;
    vm.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; o.renderOrder = 5; } });
    this.world.camera.add(vm); this.vm = vm;
    /* blade length for the trail and the hit point */
    const box = new THREE.Box3().setFromObject(main); this.bladeLen = Math.max(0.5, box.max.y - 0.1);
    this.buildTrail();
    /* a small fixed set of lights for hit flashes: a new light per hit would recompile shaders */
    this.sparkLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 4, 2); l.userData.t = 9; this.world.scene.add(l); return l; }); this.sparkI = 0;
    { const sl = new THREE.PointLight(0xffffff, 0, 30, 2); this.world.scene.add(sl); this.world.scene.userData.sqSlamLight = sl; this._slamL = sl; } /* see bosses.js slamLight */
    /* A torch at the player: near foes are lit hard, far ones fall into the dark. */
    /* a world may set kit.torch = { color, power, range } (daylight worlds turn it down) */
    /* the land's LOOK.torch wins over the world's kit.torch; false = no torch at all (a daylight land); tint: false keeps the colour off the element */
    const lk = LAND_LOOK?.[this.world.biome?.id]; const TT = lk && lk.torch !== undefined ? lk.torch : this.kit.torch;
    if (TT !== false) {
      const T0 = TT || {}; const tc = new THREE.Color(T0.color ?? 0xffc08a); if (T0.tint !== false) tc.lerp(new THREE.Color(this.element.color), 0.35);
      /* the torch rides at the shoulder (0.35 m ahead), never 1.6 m out: there it sat inside any foe within arm's
         reach and lit the body from within, so close white materials blew out to a flat grey.
         A little more power keeps the far foes as lit as before. */
      /* the point light made a bright pool on the
         ground that moved with the player. It is now a level fill from the player's side: a directional light along the
         view, kept flat (update()), so it lights the bodies in front and never the ground, and has no pool and no edge. */
      this.torch = new THREE.DirectionalLight(tc, (T0.power ?? 1.4) * 0.62); this.torch.castShadow = false;
      this.world.scene.add(this.torch); this.world.scene.add(this.torch.target);
    } else this.torch = null;
    /* a world may move the first-person hold. worldMod().fpPose (or kit.fpPose) =
       { rest: { one|two|dual|pole: { p: [x, y, z], d: [x, y, z], e: [x, y, z] } }, guard: { ... } }, in camera space
       (x right, y up, -z ahead): p the fist, d the blade, e the edge (made square to d). Anything not given keeps the default. */
    const fpp = worldMod()?.fpPose || this.kit.fpPose || null;
    const toPose = (o, base) => (o && Array.isArray(o.p) ? POSE(o.p[0], o.p[1], o.p[2], o.d ? D(...o.d) : base.d.clone(), o.e ? D(...o.e) : base.e.clone()) : base);
    this.REST = { ...REST }; this.GUARD = { ...GUARD };
    for (const k of Object.keys(REST)) { this.REST[k] = toPose(fpp?.rest?.[k], REST[k]); this.GUARD[k] = toPose(fpp?.guard?.[k], GUARD[k]); }
    const rest = this.REST[this.cls];
    this.hands.r.p.copy(rest.p); quatOf(rest.d, rest.e, this.hands.r.q);
    this.leftTarget(false, this.hands.l.p, this.hands.l.q);
    this.rg = await Ranged.attach(this); /* null for a melee weapon */
  }

  /* a task names a thing on the field (the fire to hold, an anchor to break, a beacon to light): when that thing is out of
     view, a small diamond at the edge of the screen points to it, as on the walk */
  /* one target at a time in every chapter (web/src/guide.js draws the mark, the edge arrow, the prompt at the
     object and the nudges). Chapter I: the walk's own target (journey.guideTarget). Chapters II and III: taskTarget(). */
  updateGuide(dt = 0.016) {
    if (!this.guideM) { try { this.guideM = new Guide(this, { onNudge: (lv, t) => (this.journey ? this.journey.nudge(lv, t) : this.taskNudge(lv, t)) }); const G = this.guideM; this.listeners.push(() => G.dispose()); } catch (err) { console.warn('guide', err); this.updateGuide = () => {}; return; } }
    let t = null;
    if (!this.over && !this.paused && !this.deathCam && !this.dd) { try { t = this.journey ? this.journey.guideTarget() : this.taskTarget(); } catch (err) { console.warn('guide target', err); } }
    this.guideM.set(t); this.guideM.update(dt);
    if (!this.teach && this.teach !== false) { try { this.teach = new Teach(this); const T = this.teach; this.listeners.push(() => T.dispose()); } catch (err) { console.warn('teach', err); this.teach = false; } }
    if (this.teach) { try { this.teach.update(dt); } catch (err) { console.warn('teach', err); this.teach.dispose(); this.teach = false; } }
  }
  /* chapters II and III: the fire to keep, the post to break, the beacon to light, the place to hold, the marked foe, the boss */
  taskTarget() {
    const T = this._gt || (this._gt = { x: 0, z: 0, y: 0, h: 2.2, act: '', near: 9, fill: null, foe: false, quiet: false, name: '', via: null, len: 0 });
    const put = (x, z, act, o = {}) => { T.x = x; T.z = z; T.y = 0; T.act = act; T.h = o.h ?? 2.2; T.near = o.near ?? 9; T.fill = o.fill ?? null; T.foe = !!o.foe; T.quiet = !!o.quiet; T.name = o.name || ''; return T; };
    const W = this.kit.id && this.kit.id !== 'dark' ? this.kit.words || {} : {};
    const CG = this.chapterGoal; if (CG) { const d = Math.hypot(this.pos.x - CG.x, this.pos.z - CG.z); if (CG.quiet || d < CG.r + (CG.hold ? 2.5 : 0)) return null; /* in the place already: nothing to point at */ return put(CG.x, CG.z, CG.act || 'Stand here', { near: Math.max(6, CG.r + 3), fill: CG.fill > 0.01 ? CG.fill : null, quiet: CG.quiet || d < CG.r + (CG.hold ? 2.5 : 0), h: 1.8 }); }
    if (this.hearth && !this.hearth.gone) { const p = this.hearth.pos; const d = Math.hypot(this.pos.x - p.x, this.pos.z - p.z); if (d < 6) return null; /* inside the ring: nothing to point at */ return put(p.x, p.z, `Go back to ${W.fire || 'the fire'}`, { near: 7, h: 1.6 }); }
    let best = null; let bd = 1e9;
    for (const p of this.props || []) { if (p.journey || p.gone || p.done) continue; const want = (p.kind === 'anchor' && p.hp > 0) || (p.kind === 'beacon' && !p.lit); if (!want) continue; const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z); if (d < bd) { bd = d; best = p; } }
    if (best) { const an = best.kind === 'anchor'; return put(best.pos.x, best.pos.z, an ? (best.q2seal ? 'Hit the seal' : `Hit the ${W.anchor || 'anchor'}`) : (best.q2act || `Stand here to light the ${W.beacon || 'beacon'}`), { near: 7, h: an ? 3.2 : 2.8, fill: an ? (best.hp < best.maxHp ? 1 - best.hp / best.maxHp : null) : (best.args?.charge > 0.01 ? best.args.charge : null) }); }
    const mk = this.foes.find((f) => f.def?.marked && f.state !== 'dead' && !f.gone); if (mk) return put(mk.pos.x, mk.pos.z, '', { foe: true, quiet: true, h: 2.6 });
    const bf = this.bossFoe && this.bossFoe.state !== 'dead' ? this.bossFoe.pos : this.boss && !this.boss.dead ? this.boss.focus?.() : null; if (bf) return put(bf.x, bf.z, '', { foe: true, quiet: true, h: 3 });
    /* a wave with no foe in view: the arrow shows where the nearest one is (only off screen) */
    if (!this.betweenWaves) { let nf = null; let nd = 1e9; for (const f of this.foes) { if (f.state === 'dead' || f.gone || f.hold) continue; const d = Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z); if (d < nd) { nd = d; nf = f; } } if (nf && nd > 6) return put(nf.pos.x, nf.pos.z, '', { foe: true, quiet: true, h: 2.4 }); }
    return null;
  }
  /* chapters II and III: no progress for 10 s: the instruction again, as a line */
  taskNudge(level, t) {
    if (this.over || this.paused || !t || t.foe) return;
    const title = this.taskEl?.querySelector('span')?.textContent || '';
    this.hud.line?.(t.act || title, t.act && title !== t.act ? title : 'Follow the arrow', 2400);
  }
  /* journey.js: the hero bends and reaches down for something (dur s); no blow starts while the hand is down */
  reachOut(dur = 1.1) { if (this.swing || this.charge || this.reach) return false; this.reach = { t: 0, dur }; return true; }
  reachK() { const r = this.reach; if (!r) return 0; const k = clamp(r.t / r.dur, 0, 1); return k < 0.4 ? ease(k / 0.4) : k < 0.62 ? 1 : 1 - ease((k - 0.62) / 0.38); }
  /* where the left hand rests or guards when it holds its own gear */
  leftTarget(blocking, outP, outQ) {
    if (isShield(this.offKind)) {
      /* at rest the shield hangs low and edge-on (only its rim shows), on block it comes up full */
      if (blocking) { outP.set(-0.32, -0.5, -0.64); outQ.setFromEuler(SHIELD_GUARD_E); } /* a little lower, further and left: the shield guards the left half, not the target (it filled 21% of the frame) */
      else { outP.set(-0.48, -1.0, -0.5); outQ.setFromEuler(SHIELD_REST_E); }
      return;
    }
    const src = blocking ? GUARD.dual : REST.dual;
    outP.set(-src.p.x, src.p.y, src.p.z); _d0.copy(src.d); _d0.x = -_d0.x; _e.copy(src.e); _e.x = -_e.x; quatOf(_d0, _e, outQ);
  }

  /* Places one arm: the fist turns about the handle until its wrist looks at the shoulder; a two-bone solve finds the elbow. */
  solveArm(h, grip, gripQ) {
    /* with the real hand the shoulder is where a shoulder is (beside and under the eye), so the forearm comes in
       from the lower corner and the back of the hand shows; the old point was a metre under the hand (the arm stood up like a post) */
    const side = h.side; const S = h.hand2 ? V(0.27 * side, -0.38, 0.08) : V(0.3 * side, -1.0, -0.45);
    const sl = S.clone().sub(grip).applyQuaternion(gripQ.clone().invert());
    let turn = gripTurn(Math.atan2(sl.x, sl.z));
    if (h.turnBase != null) turn = h.turnBase + clamp(turn - h.turnBase, -h.turnLim, h.turnLim); /* a gun hand keeps its own roll (ranged.js) */
    const fistQ = gripQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), turn));
    /* the sculpted hand is true size (scale 1, was a 1.14 fist); its wrist centre sits at
       (0.033, 0, 0.078) in the fist frame, and the forearm keeps the back of the hand up (it rolled with the world up) */
    h.fist.position.copy(grip); h.fist.quaternion.copy(fistQ); h.fist.scale.setScalar(1);
    /* the hand glb is mirrored (thumb on the inner side): its wrist centre and its back are on -x now */
    /* a gun hand shows the sculpt the other way about (ranged.js: the right hand the unmirrored one, the left hand the
       exported one, so each has its own thumb): the wrist centre and the back of the hand sit on the other side of the fist */
    const fl = h.flipX ? -1 : 1;
    const W = (h.hand2 ? V(HAND2_WRIST[0] * side, HAND2_WRIST[1], HAND2_WRIST[2]) : V(-0.033 * side * fl, 0, 0.078)).applyQuaternion(fistQ).add(grip);
    const back = (this._back ||= V()).set(h.hand2 ? side : h.flipX ? -fl * side : -1, 0, 0).applyQuaternion(fistQ);
    let L1 = 0.4; let L2 = 0.36;
    const d = S.clone().sub(W); const len = Math.max(0.05, d.length()); const stretch = Math.max(1, len / (L1 + L2 - 0.01)); L1 *= stretch; L2 *= stretch;
    const dir = d.clone().multiplyScalar(1 / len);
    const a = (L2 * L2 - L1 * L1 + len * len) / (2 * len); const hgt = Math.sqrt(Math.max(0, L2 * L2 - a * a));
    const pole = h.hand2 ? V(0.8 * side, -1, 0.15) : V(0.5 * side, 0, 1); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = W.clone().addScaledVector(dir, a).addScaledVector(pole, hgt);
    const look = (obj, from, to, zScale) => {
      _z.subVectors(to, from).normalize(); _x.copy(back).addScaledVector(_z, -back.dot(_z)); if (_x.lengthSq() < 1e-4) { _x.crossVectors(V(0, 1, 0), _z); if (_x.lengthSq() < 1e-5) _x.set(1, 0, 0); } _x.normalize(); _y.crossVectors(_z, _x);
      obj.position.copy(from); obj.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z)); obj.scale.set(1, 1, zScale);
    };
    /* the real hand has its own wrist (a 28 mm stub): the sleeve or vambrace starts behind it, so its cuff never lies over the back of the hand */
    if (h.hand2) { const W2 = (this._w2 ||= V()).copy(E).sub(W).normalize().multiplyScalar(0.045).add(W); look(h.fore, W2, E, (L2 - 0.045) / 0.3); } else look(h.fore, W, E, L2 / 0.3);
    look(h.upper, E, S, L1 / 0.34);
  }

  /* the slash trail is a thin, fast, tapered steel arc that hugs the path of the blade tip for 0.13 s: white-grey with a
     faint world tint (never pink), at most ~30 degrees of arc however low the frame rate, and drawn in camera space (a turn of
     the view never stretches it across the sky). Points carry their time; the band runs from 0.8 of the blade to the tip and
     narrows to the tip as it ages, so the arc tapers to a point. A Catmull-Rom pass through the kept points bends it. */
  buildTrail() {
    const N = 40; this.trailN = N;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    const alpha = new Float32Array(N * 2); geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const across = new Float32Array(N * 2); for (let i = 0; i < N; i++) across[i * 2 + 1] = 1; geo.setAttribute('across', new THREE.BufferAttribute(across, 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const wt = { dark: 0xc8a090, edo: 0xd0b0b8, neon: 0x9fe8f0, frontier: 0xe0c49a, storybook: 0xf0e0a0 }[this.kit?.id || 'dark'] ?? 0xffffff;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
      uniforms: { color: { value: new THREE.Color(0xdfe2e6).lerp(new THREE.Color(wt), 0.15) }, power: { value: 0 } },
      vertexShader: 'attribute float alpha; attribute float across; varying float vA; varying float vS; varying float vD; void main(){ vA = alpha; vS = across; vD = distance(position, cameraPosition); gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      /* a pale sheen that thickens toward the cutting edge, and a thin bright line on the edge itself */
      fragmentShader: 'uniform vec3 color; uniform float power; varying float vA; varying float vS; varying float vD; void main(){ float body = smoothstep(0.0, 0.85, vS) * smoothstep(1.0, 0.9, vS); float edgeLine = smoothstep(0.82, 0.95, vS) * smoothstep(1.0, 0.96, vS); float near = smoothstep(0.3, 0.6, vD); float a = (body * 0.42 + edgeLine * 0.95) * vA * power * near; if (a < 0.003) discard; gl_FragColor = vec4(mix(color, vec3(1.0), edgeLine * 0.6), a); }',
    });
    this.trail = new THREE.Mesh(geo, mat); this.trail.frustumCulled = false; this.trail.renderOrder = 6;
    this.world.scene.add(this.trail); this.trailPts = [];
  }
  updateTrail(active, hand) {
    const mat = this.trail.material; const now = this.clock; const LIFE = 0.18; /* a slash arc you can see on a phone: longer, wider, brighter edge */
    if (active) {
      const g = hand; g.updateWorldMatrix(true, false);
      const cam = this.world.camera; cam.updateMatrixWorld(); const inv = this._trailInv ||= new THREE.Matrix4(); inv.copy(cam.matrixWorld).invert();
      const base = V(0, this.bladeLen * 0.5, 0).applyMatrix4(g.matrixWorld).applyMatrix4(inv); const tip = V(0, this.bladeLen * 1.02, 0).applyMatrix4(g.matrixWorld).applyMatrix4(inv);
      const last = this.trailPts[0]; if (!last || last.t !== now) this.trailPts.unshift({ b: base, p: tip, t: now });
      mat.uniforms.power.value = 1;
    }
    /* drop old points; then keep at most ~0.55 rad of arc as seen from the eye */
    while (this.trailPts.length && now - this.trailPts[this.trailPts.length - 1].t > LIFE) this.trailPts.pop();
    let arc = 0;
    for (let i = 1; i < this.trailPts.length; i++) { arc += this.trailPts[i].p.angleTo(this.trailPts[i - 1].p); if (arc > 1.0) { this.trailPts.length = i + 1; break; } }
    const pts = this.trailPts; const n = pts.length;
    const pos = this.trail.geometry.attributes.position; const al = this.trail.geometry.attributes.alpha; const cm = this.world.camera.matrixWorld;
    const A = this._tA ||= V(); const B = this._tB ||= V(); const tmpP = this._tP ||= V(); const Q0 = this._tQ ||= V();
    const cr = (out, k, f, key) => { /* Catmull-Rom between point k and k+1 at f */
      const p0 = pts[Math.max(0, k - 1)][key]; const p1 = pts[k][key]; const p2 = pts[Math.min(n - 1, k + 1)][key]; const p3 = pts[Math.min(n - 1, k + 2)][key];
      const f2 = f * f; const f3 = f2 * f;
      return out.set(0, 0, 0).addScaledVector(p0, -0.5 * f3 + f2 - 0.5 * f).addScaledVector(p1, 1.5 * f3 - 2.5 * f2 + 1).addScaledVector(p2, -1.5 * f3 + 2 * f2 + 0.5 * f).addScaledVector(p3, 0.5 * f3 - 0.5 * f2);
    };
    let w = 0;
    if (n >= 2) {
      const sub = Math.max(1, Math.floor((this.trailN - 1) / (n - 1)));
      for (let k = 0; k < n - 1 && w < this.trailN; k++) for (let j = 0; j < sub && w < this.trailN; j++) {
        const f = j / sub; const age = (now - (pts[k].t + (pts[k + 1].t - pts[k].t) * f)) / LIFE; const u = (k + f) / (n - 1);
        cr(tmpP, k, f, 'b'); cr(Q0, k, f, 'p'); tmpP.lerp(Q0, Math.min(1, u * 0.9)); /* the band narrows to the tip toward its tail */
        A.copy(tmpP).applyMatrix4(cm); B.copy(Q0).applyMatrix4(cm);
        pos.setXYZ(w * 2, A.x, A.y, A.z); pos.setXYZ(w * 2 + 1, B.x, B.y, B.z);
        const a = Math.pow(clamp(1 - Math.max(age, u), 0, 1), 1.4); al.setX(w * 2, a); al.setX(w * 2 + 1, a); w++;
      }
      if (w < this.trailN) { const q = pts[n - 1]; A.copy(q.p).applyMatrix4(cm); pos.setXYZ(w * 2, A.x, A.y, A.z); pos.setXYZ(w * 2 + 1, A.x, A.y, A.z); al.setX(w * 2, 0); al.setX(w * 2 + 1, 0); w++; }
    }
    /* unused pairs collapse onto the last written vertex (zero area, no stray triangle) */
    const lx = w ? pos.getX(w * 2 - 1) : 0; const ly = w ? pos.getY(w * 2 - 1) : -99; const lz = w ? pos.getZ(w * 2 - 1) : 0;
    for (let i = w; i < this.trailN; i++) { pos.setXYZ(i * 2, lx, ly, lz); pos.setXYZ(i * 2 + 1, lx, ly, lz); al.setX(i * 2, 0); al.setX(i * 2 + 1, 0); }
    if (n < 2) mat.uniforms.power.value = 0;
    pos.needsUpdate = true; al.needsUpdate = true;
  }

  poseViewModel(dt, rawDt) {
    const t = this.clock; const rest = (this.REST || REST)[this.cls]; const R = this.hands.r; const L = this.hands.l;
    const tp = this._tp ||= V(); const tq = this._tq ||= new THREE.Quaternion(); const lp = this._lp ||= V(); const lq = this._lq ||= new THREE.Quaternion();
    tp.copy(rest.p); quatOf(rest.d, rest.e, tq);
    const ownLeft = L.holder.parent === this.vm;
    if (ownLeft) this.leftTarget(this.blocking, lp, lq);
    let trailGear = null; let fast = false; let lean = 0; let nod = 0; let push = 0;
    if (this.swing) {
      const s = this.swing; const arc = ARCS[s.arc]; let k = clamp(s.t / s.dur, 0, 1);
      if (s.bounced) k = Math.max(0, s.bounceK - (s.t - s.bounceT) * 1.6);
      fast = true;
      const turn = bodyTurn(k) * (s.heavy ? 1.5 : 1) * (this.cls === 'two' ? 1.35 : 1) * (s.hand === 'l' && ownLeft ? -1 : 1);
      if (arc.side === 'L') lean = turn; else if (arc.side === 'R') lean = -turn; else if (arc.side === 'H') nod = turn; else push = turn;
      if (s.hand === 'l' && ownLeft) { movePose(arc, REST.dual, k, true, lp, lq, s.from); if (!s.bounced && k > arc.hit[0] - 0.16 && k < arc.hit[1] + 0.1) trailGear = this.offGear; }
      else {
        /* a gun or a bow swings its own arcs (barrel out in front) and comes back to its own hold, with no steel trail on a gun */
        const gb = this.rg?.blow(s.arc);
        if (gb) movePose(gb, this.rg.restPose(), k, false, tp, tq, s.from); else { movePose(arc, rest, k, false, tp, tq, s.from); edgeOn(tp, tq); }
        if (!s.bounced && !(gb && this.rg.P.kind === 'gun') && k > arc.hit[0] - 0.16 && k < arc.hit[1] + 0.1) trailGear = this.gear;
      }
    } else if (this.charge) {
      /* the charge holds the top of the heavy cut, so the release flows out of it */
      const u = ease(clamp(this.charge.t / 0.4, 0, 1)); const cp = V(); const cq = new THREE.Quaternion();
      cutPose(ARCS[this.moves.heavy], U0, false, cp, cq); tp.lerp(cp, u); tq.slerp(cq, u); const hs = ARCS[this.moves.heavy].side; if (hs === 'H') nod = -u; else lean = (hs === 'R' ? 1 : -1) * u * 1.3;
      const shake = Math.min(1, this.charge.t / 0.9) * 0.008; tp.x += Math.sin(t * 61) * shake; tp.y += Math.cos(t * 53) * shake;
    } else if (this.blocking && !isShield(this.offKind)) {
      const g = this.rg ? GUN_GUARD : (this.GUARD || GUARD)[this.cls]; tp.copy(g.p); quatOf(g.d, g.e, tq); /* a gun or a bow: ranged.js guardPose() replaces this just below */
    } else if (this.blocking) { tp.y -= 0.1; tp.x += 0.06; }
    if (this.rg) this.rg.pose(tp, tq, rawDt); /* a gun or a bow holds its own way (rest, aim, reload) */
    /* the kick and the stagger keep the grip in the frame (NDC y above about -0.95): the hand moves out to the
       side for the kick so the leg and the blade share the view; the stagger drops it a little and rolls it less */
    if (this.kick) { tp.x += 0.16; tp.y -= 0.02; }
    if (this.stagger > 0) { tp.y -= 0.03; tp.x -= 0.02; tq.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.22)); lp.y -= 0.1; }
    /* a reach (journey.js: a find, a sign, a bundle): the weapon hand drops low and in, the blade turns down out of the way, then it comes back */
    if (this.reach && (this.swing || this.charge || this.blocking || this.dodge)) this.reach = null;
    /* the weapon tips FORWARD and down out of the way (the angle was positive: the blade stood straight up in the middle of the view; a gun stood on its muzzle with the grip at the lens). A gun only dips. */
    if (this.reach) { this.reach.t += rawDt; const e = this.reachK(); tp.x -= 0.14 * e; tp.y -= 0.3 * e; tp.z -= 0.16 * e; tq.premultiply(_reachQ.setFromAxisAngle(this.rg ? _reachAxG : _reachAx, (this.rg ? -0.3 : -0.8) * e)); lp.y -= 0.3 * e; if (this.reach.t >= this.reach.dur) this.reach = null; }
    const bobA = this.moving ? 0.016 : 0.004; const bobF = this.moving ? 10 : 1.7;
    const ph = this.stepPh || 0; /* walking, the arms bob once per step (stride phase, in step with the footfalls); idle keeps the slow breath */
    const bob = this.moving ? (Math.abs(Math.cos(ph)) - 0.64) * bobA * 2 : Math.sin(t * bobF) * bobA; const bobX = this.moving ? Math.sin(ph) * bobA * 0.8 : Math.cos(t * bobF * 0.5) * bobA * 0.8;
    const follow = (h, p, q, rate) => {
      const s = Math.min(1, rawDt * rate); h.p.lerp(p, s); h.q.slerp(q, s);
      h.holder.position.set(h.p.x + bobX + this.sway.x + this.vmPunch.x, h.p.y + bob + this.sway.y + this.vmPunch.y, Math.min(-0.38, h.p.z + this.vmPunch.z));
      h.holder.quaternion.copy(h.q);
    };
    follow(R, tp, tq, fast && this.swing.hand !== 'l' ? 46 : 13);
    if (ownLeft) follow(L, lp, lq, this.swing?.hand === 'l' ? 46 : 14);
    this.rg?.recoil(R, rawDt);
    /* the body turns with the blow: it coils away in the wind-up and swings through with the cut */
    const br = Math.min(1, rawDt * 20); this.lean += (lean - this.lean) * br; this.nod += (nod - this.nod) * br; this.push += (push - this.push) * br;
    this.vm.rotation.set(-this.nod * 0.07, this.lean * 0.13, this.lean * 0.05); this.vm.position.set(this.lean * 0.03, -Math.abs(this.lean) * 0.012 - Math.max(0, this.nod) * 0.03, -Math.max(0, this.push) * 0.05 - Math.max(0, this.nod) * 0.03);
    /* the blade drops out of the frame while a boss dies */
    this.vmDrop = (this.vmDrop || 0) + ((this.deathCam || this.vmAway ? 1 : 0) - (this.vmDrop || 0)) /* vmAway = a walk cinema beat (journey.js) */ * Math.min(1, rawDt * 3); if (this.vmDrop > 0.002) { this.vm.position.y -= this.vmDrop * 0.55; this.vm.rotation.x -= this.vmDrop * 0.5; }
    this.sway.multiplyScalar(Math.max(0, 1 - rawDt * 9)); this.vmPunch.multiplyScalar(Math.max(0, 1 - rawDt * 14));
    this.solveArm(R, R.holder.position, R.holder.quaternion);
    if (this.grip2) this.solveArm(L, this.grip2.position.clone().applyQuaternion(R.holder.quaternion).add(R.holder.position), R.holder.quaternion);
    else if (ownLeft) this.solveArm(L, L.holder.position, L.holder.quaternion);
    this.rg?.afterPose();
    /* the kick: the shin swings up from below and snaps forward */
    if (this.kick) {
      const k = clamp(this.kick.t / this.kick.dur, 0, 1); const e = k < 0.42 ? ease(k / 0.42) : 1 - ease((k - 0.42) / 0.58);
      this.vmLeg.visible = true;
      /* the leg stays low and reaches far: the boot toe shows at the bottom of the frame, the thigh never comes up
         to the lens (its cut end read as a giant grey disc over the centre) */
      this.vmLeg.position.set(0.14, -1.15 + 0.62 * e, -0.3 - 0.5 * e);
      this.vmLeg.rotation.set(0.35 + 1.1 * e, 0.1 * e, 0.22 * e);
    } else this.vmLeg.visible = false;
    this.updateTrail(!!trailGear, trailGear || this.gear);
  }

  /* ---------- input ---------- */
  bind() {
    const canvas = this.world.renderer.domElement;
    const on = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); this.listeners.push(() => target.removeEventListener(type, fn, opt)); };
    on(window, 'keydown', (e) => {
      if (!this.active || e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { e.preventDefault(); this.tryDodge(); }
      if (e.code === 'KeyJ') this.tryAttack();
      if (e.code === 'KeyK') this.tryAttack(true);
      if (e.code === 'KeyF' || e.code === 'KeyV') this.tryKick();
      if (e.code === 'KeyQ') this.toggleLock();
      if (e.code === 'KeyR' && this.rg?.P.kind === 'gun') this.rg.reloadKey(); /* R reloads a gun; E is the power */
      else if (e.code === 'KeyE' || e.code === 'KeyR') this.castAbility();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => { this.keys.clear(); this.mouseBlock = false; this.held = false; });
    on(canvas, 'mousedown', (e) => {
      if (!this.active) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); }
      if (e.button === 0) { this.held = true; this.heldAt = performance.now(); this.tryAttack(); }
      if (e.button === 1) { e.preventDefault(); this.toggleLock(); }
      if (e.button === 2) this.mouseBlock = true;
    });
    on(window, 'mouseup', (e) => {
      if (e.button === 2) this.mouseBlock = false;
      if (e.button === 0 && this.held) { this.held = false; if (this.charge) this.releaseCharge(); }
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(document, 'mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== canvas) return;
      const k = this.lock ? 0.35 : 1;
      this.yaw -= e.movementX * 0.0023 * k; this.pitch = clamp(this.pitch - e.movementY * 0.0023, -1.1, 1.1); this.lookT = this.clock; /* the boss framing waits while the player aims */
      this.sway.x = clamp(this.sway.x - e.movementX * 0.00012, -0.05, 0.05); this.sway.y = clamp(this.sway.y + e.movementY * 0.00012, -0.04, 0.04);
    });
    if (!document.body.classList.contains('touch')) canvas.requestPointerLock?.(); /* a phone has no pointer to lock (the request was an error on Android) */
  }

  /* ---------- player moves ---------- */
  /* what a foe is called on screen */
  nameOf(def) { return this.kit.foeName(def, this.minions); }
  busy() { return this.over || this.paused || this.stagger > 0 || !!this.kick; }
  moveFor(heavy, charged = 0) {
    const w = this.weapon;
    if (heavy) return { arc: this.moves.heavy, hand: 'r', dur: w.swing * 1.75, dmg: w.damage * (2.2 + charged * 0.8), poise: w.poise * (2.6 + charged), knock: 2.6, heavy: true, breaksGuard: true, knockdown: true };
    const i = this.chain % this.moves.lights.length; const spec = this.moves.lights[i]; const left = spec.startsWith('L:');
    const last = i === this.moves.lights.length - 1;
    return { arc: left ? spec.slice(2) : spec, hand: left ? 'l' : 'r', dur: w.swing * (last ? 1.2 : 1), dmg: w.damage * (last ? 1.5 : 1), poise: w.poise * (last ? 1.7 : 1), knock: last ? 1.9 : 0.9, finisher: last, breaksGuard: false, index: i };
  }
  tryAttack(heavy = false, charged = 0) {
    if (this.rg && !heavy && this.rg.trigger()) return; /* a gun or a bow shoots; it swings only when empty and a foe is close */
    if (this.busy() || this.blocking && !heavy && false) return;
    if (this.swing) { if (this.swing.t / this.swing.dur > 0.3) this.buffer = { heavy, t: this.clock }; return; }
    if (this.swingCd > 0) { this.buffer = { heavy, t: this.clock }; return; }
    if (!heavy && this.clock - this.chainT > 0.9) this.chain = 0;
    const m = this.moveFor(heavy, charged);
    const hh = m.hand === 'l' && this.hands.l.holder.parent === this.vm ? this.hands.l : this.hands.r;
    this.swing = { ...m, t: 0, hitSet: new Set(), contact: false, from: { p: hh.p.clone(), q: hh.q.clone() } };
    if (!heavy) { this.chain++; this.stats.combo = Math.max(this.stats.combo, this.chain); } else this.chain = 0;
    this.chainT = this.clock + m.dur;
    /* step into the target: melee needs to close the last gap by itself */
    const tgt = this.pickTarget(this.weapon.reach + 3.0, 0.5);
    this.swing.target = tgt;
    if (tgt) {
      /* the step in stops at the foe's hold-off: a lunge never carries the camera into a big body */
      const d = tgt.pos.distanceTo(this.pos); const want = Math.max(1.9, this.weapon.reach * 0.72, (tgt.actor ? this.holdOff(tgt) : 0) + 0.05);
      const gap = clamp(d - want, 0, heavy ? 3.4 : 2.4);
      const dir = V().subVectors(tgt.pos, this.pos).setY(0).normalize();
      this.lunge = { dir, speed: gap / (m.dur * ARCS[m.arc].hit[0]), until: m.dur * ARCS[m.arc].hit[0] };
      for (const f of this.foes) this.reactToSwing(f, f === tgt);
    } else this.lunge = null;
  }
  releaseCharge() {
    const c = this.charge; this.charge = null; if (!c) return;
    this.tryAttack(true, clamp((c.t - 0.3) / 0.7, 0, 1));
    /* the charge already holds the coil: the blow leaves at once */
    if (this.swing?.heavy && this.swing.t === 0) { this.swing.t = this.swing.dur * WIND * 0.7; if (this.lunge) { this.lunge.speed *= 2.2; } }
  }
  tryKick() {
    if (this.busy() || this.kickCd > 0 || this.swing) return;
    this.kick = { t: 0, dur: 0.5, hit: false }; this.kickCd = 0.9; this.charge = null; sfx('swing'); this.vel.addScaledVector(this.forward(), 3.2); this.kickPitch -= 0.05;
  }
  tryDodge() {
    if (this.over || this.paused || this.dodge || this.dodgeCd > 0 || this.stagger > 0) return;
    const d = this.moveVector();
    if (d.lengthSq() < 0.01) d.copy(this.forward()).multiplyScalar(-1);
    this.dodge = { t: 0, dur: 0.3, dir: d.normalize() };
    /* a dodge just before a blow lands is rewarded */
    const threatened = this.foes.some((f) => f.state === 'attack' && f.atk && !f.atk.done && f.atk.clipT > f.atk.def.hits[f.atk.hitIdx] - 0.16 * (f.atk.def.hits[0] / f.atk.def.tell) - 0.02 && f.pos.distanceTo(this.pos) < f.reach + 2);
    this.invuln = 0.4; this.dodgeCd = this.mod.dodgeCd; this.swing = null; this.charge = null; sfx('dodge');
    if (threatened) { this.slow = 0.35; this.crit = 2.2; this.hud.toast('Perfect dodge'); this.world.flash(0.25); } else if (this.mod.dodgeCrit) this.crit = Math.max(this.crit, 1.4);
  }
  toggleLock() {
    if (this.boss) { this.bossLock = !this.bossLock; return; }
    if (this.lock) { this.lock = null; return; }
    this.lock = this.pickTarget(16, 0.2) || null;
  }
  pickTarget(range, minDot) {
    if (this.lock && this.lock.state !== 'dead' && this.lock.pos.distanceTo(this.pos) < range) return this.lock;
    const fwd = this.forward(); let best = null; let bs = -1e9;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      const to = V().subVectors(f.pos, this.pos); const d = to.length(); if (d > range) continue;
      const dot = to.normalize().dot(fwd); if (dot < minDot) continue;
      const s = dot * 3 - d * 0.35; if (s > bs) { bs = s; best = f; }
    }
    return best;
  }
  moveVector() {
    const k = this.keys; let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0); let r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const tm = this.touchMove; if (tm && (tm.f || tm.r)) { f = tm.f; r = tm.r; } /* the touch stick (touch.js), analog */
    const v = V();
    v.x = -Math.sin(this.yaw) * f + Math.cos(this.yaw) * r;
    v.z = -Math.cos(this.yaw) * f - Math.sin(this.yaw) * r;
    return v;
  }
  forward() { return V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  yawTo(p) { return Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z)); }
  /* The boss dies: the view turns to it and stays, the hero keeps a distance, then the fight ends. */
  holdDeath(dt) {
    const D = this.deathCam; D.t += dt; this.lock = null; this.swing = null; this.charge = null; this.keys.clear();
    /* the death director stages the cut (web/src/death-director.js); it calls the end itself */
    if (this.dd) { try { this.dd.tick(dt); } catch (err) { console.warn('death director', err); this.dd.dispose?.(); this.dd = null; }
      if (this.dd) { if (!D.done && this.dd.t >= this.dd.finishAt) { D.done = true; this.deathDone = true; this.finish(true); } return; } }
    const view = D.dragon ? this.boss?.deathView?.() : null;
    const raw = D.dragon ? view?.look : (D.foe.dress?.lookAt || D.foe.pos);
    const big = D.dragon || D.foe.scale > 2;
    /* a copy: the handle's vector is never changed; a falling body never pulls the view down to bare ground */
    const look = raw ? (this._deathLook ||= V()).copy(raw) : null;
    if (look && !D.dragon) look.y = Math.max(look.y, 1.0);
    if (look && big) look.y *= 0.8 + 0.2 * clamp(D.t - 1, 0, 1);
    const centre = D.dragon ? look : D.foe.pos; const keep = D.dragon ? Math.max(11, view?.dist || 9) : Math.max(3.4, (D.foe.dress?.keepOut || 0) + 2.6);
    if (look) {
      const k = Math.min(1, D.t / 0.5);
      this.turnToward(look, Math.min(1, dt * 5 * k));
      const d = Math.max(1, Math.hypot(look.x - this.pos.x, look.z - this.pos.z));
      const want = clamp(Math.atan2((D.dragon ? look.y * 0.6 : look.y) - EYE, d), D.dragon ? -0.5 : -0.35, 0.5);
      this.pitch += (want - this.pitch) * Math.min(1, dt * 4 * k);
      const dx = this.pos.x - centre.x; const dz = this.pos.z - centre.z; const dist = Math.hypot(dx, dz) || 1;
      /* once the body is down the hold is never a still: the view pushes in slowly (to 78 % of the distance) and arcs
         round the fallen boss (about 0.075 rad/s, eased in) */
      const hk = D.dragon ? 0 : clamp((D.t - 1.4) / 4.5, 0, 1); const hs = hk * hk * (3 - 2 * hk); const kNow = keep * (1 - 0.22 * hs);
      if (dist < kNow) { const step = Math.min(kNow - dist, dt * 7); this.pos.x += dx / dist * step; this.pos.z += dz / dist * step; }
      else if (hk > 0 && dist > kNow && dist < keep + 0.6) { const step = Math.min(dist - kNow, dt * 0.9); this.pos.x -= dx / dist * step; this.pos.z -= dz / dist * step; }
      else if (!D.dragon && dist > keep + 0.5) { const step = Math.min(dist - keep - 0.5, dt * Math.max(8, (dist - keep) * 3)); this.pos.x -= dx / dist * step; this.pos.z -= dz / dist * step; }
      else if (D.dragon && dist > 15) { const step = Math.min(dist - 15, dt * 10); this.pos.x -= dx / dist * step; this.pos.z -= dz / dist * step; }
      if (hk > 0) { const a = dt * 0.075 * Math.min(1, (D.t - 1.4) / 0.8) * (D.arc ||= 1); const ox = this.pos.x - centre.x; const oz = this.pos.z - centre.z; const c = Math.cos(a); const sn = Math.sin(a); this.pos.x = centre.x + ox * c - oz * sn; this.pos.z = centre.z + ox * sn + oz * c; }
    }
    /* a title beat just after the impact: "The Giant falls." in the serif line, the world's death words under it */
    if (!D.titled && (D.dragon || D.foe) && D.t >= 2.3) { D.titled = true; const L = D.dragon ? (this.nemesis?.label || 'The dragon') : D.foe.def.label || 'The enemy'; const dark = !this.kit.id || this.kit.id === 'dark';
      const fv = { knelt: 'kneels' }[this.nemesis?.fellVerb]; const verb = dark && D.foe ? ({ lich: 'is gone', twin: 'breaks' }[D.foe.def.id] || 'falls') : (D.foe && fv) || 'falls'; /* the Lord kneels */ const dw = D.foe?.def.death;
      this.hud.line?.(`${L} ${verb}.`, dw ? String(dw).replace(/\.?$/, '.') : '', 2600); }
    /* the end is called while the view still holds: the card comes over the death, never over an empty field */
    if (!D.done && D.t >= Math.max(2.2, D.dur * 0.45)) { D.done = true; this.deathDone = true; this.finish(true); }
  }
  turnToward(p, amount) { let d = this.yawTo(p) - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; this.yaw += d * amount; }

  /* ---------- waves ---------- */
  async spawnWave(key, { spec: custom = null, quiet = false, label: own = null } = {}) {
    this.spawning = true;
    if (!quiet) { this.wave++; this.stats.waves = this.wave; this.waveStart = this.clock; } this.betweenWaves = false;
    this.stats.waveBlocks = 0; this.stats.waveDodges = 0; this.stats.waveDamage = 0;
    const spec = custom || WAVES[key] || WAVES.reinforce_thralls;
    const parts = [];
    try {
    for (const [type, count, opt] of spec) {
      const def = opt?.def || byId(this.kit.FOES, type);
      const group = { id: `g${this.nextId++}`, def, members: [], size: count, tactic: 'charge', last: null, softStreak: 0, called: !!quiet, since: -HOLD, captain: !!opt?.captain, place: opt?.place || null, hold: !!opt?.hold };
      this.groups.push(group);
      for (let i = 0; i < count; i++) await this.spawnFoe(group, i, count);
      parts.push(plural(count, opt?.captain ? `${def.label} captain` : def.label));
    }
    } finally { this.spawning = false; }
    const label = own ? own : key === 'first' ? (this.minions && this.nemesis ? `${this.nemesis.label} sends ${({ he: 'his', she: 'her' })[this.nemesis.pronoun || ([this.nemesis.intro, this.nemesis.death].some((t) => /^(He|His)\b/.test(t || '')) ? 'he' : '')] || 'its'} ${this.minions.many}` : this.ww('The road is guarded')) : aAn(this.ww((byId(BEATS, key)?.label || '').replace(/Hollow (Thrall|Guard|Stalker|Brute)/g, (_, k) => this.nameOf(byId(this.kit.FOES, { Thrall: 'minion', Guard: 'warrior', Stalker: 'rogue', Brute: 'brute' }[k]))).replace(/\bits maul\b/, (m) => { if (!this.kit.id || this.kit.id === 'dark') return m; const d = byId(this.kit.FOES, 'brute'); const w = d?.weaponWord || this.kit.words?.bruteWeapon || String(d?.gear || '').replace(/^(neon|edo|frontier|storybook|[a-z]+(?=_))_/, '').replace(/_/g, ' '); return w ? `its ${w}` : m; } /* the weapon word comes from the world's brute: weaponWord, then words.bruteWeapon, then its gear id */)));
    if (!quiet) { this.hud.banner(`Wave ${this.wave}`, label); this.bannerAt = this.clock; }
    this.director.event(quiet ? `More arrive: ${parts.join(' and ')}.` : `Wave ${this.wave} starts: ${parts.join(' and ')}.`);
    this.spawning = false;
    sfx('spawn');
  }

  async spawnFoe(group, i, count) {
    const def = group.def;
    const actor = await makeActor(KNIGHT_URL);
    const fwd = this.forward();
    const baseAng = Math.atan2(fwd.x, fwd.z);
    const ang = baseAng + (count === 1 ? 0 : (i / (count - 1) - 0.5) * 0.9) + (Math.random() - 0.5) * 0.5 + (this.groups.length % 2 ? 0.55 : -0.55) * (this.groups.length > 1 ? 1 : 0);
    const dist = def.boss ? 13 : 10.5 + Math.random() * 3;
    const pos = group.place ? group.place(i, count) : V(this.pos.x + Math.sin(ang) * dist, 0, this.pos.z + Math.cos(ang) * dist);
    const lim = this.arena - 0.5; if (pos.length() > lim) pos.setLength(lim);
    actor.root.position.copy(pos);
    const scale = (group.captain ? 1.18 : 1) * (def.size || 1);
    if (def.boss && def.id === 'twin' && def.mirror !== false) { def.gear = this.weapon.gear; def.offhand = this.weapon.offhand; def.look = { ...def.look, helm: { knight: 'great', barbarian: 'sallet', mage: 'hood', rogue: 'hood' }[this.archetype.id] || 'great', robe: this.archetype.id === 'mage' }; }
    actor.root.scale.setScalar(scale);
    const accent = this.world.biome?.accent ?? 0xff4a12;
    const look = { ...(def.look || {}) };
    if (group.captain) Object.assign(look, { crown: look.helm === 'great', horns: look.helm !== 'great', heavy: true, steel: 0x6b4a44, cloth: 0x2a0b0e });
    if (look.wear && worldWear()) await actor.wear(worldWear());
    actor.look({ steel: 0x9aa1ad, ...look, eye: accent, eyePower: 7 });
    /* a human foe, and a boss that is a person, wears the low-poly real body (web/src/bodies.js FOE_SPECS; no
       spec = the old body). The Twin takes the hero's own body and seed; every other foe a seed of its own. */
    if (foesOn()) { try { const bk = def.boss ? `boss:${def.nemesis || def.id}` : def.id; const hs = heroSeed(); /* the hero's seed (its low bit picks the body type) */
      const seed = def.boss ? (def.id === 'twin' ? hs : hs + 1) : ((this.nextId + 1) * 7919 + (this.foeSalt ??= Math.floor(Math.random() * 1e5))) % 1e6;
      await applyFoeBody(actor, this.kit?.id || 'dark', bk, actor.lastLook, seed, this.archetype?.model || null); } catch (err) { console.warn('foe body', err); } }
    /* the foe's own body (not its gear, which may share a material with the hero's weapon) dissolves near the camera */
    actor.root.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) addNearFade(m); });
    /* a back banner (wear part Sashimono, its own cloned material) fades from 1.44 m, not 0.6 m */
    actor.root.traverse((o) => { if (o.isMesh && /^Sashimono/i.test(o.userData.part || '')) addNearFade(o.material, 1.7); }); /* 1.7 x the 0.85 m fade = 1.44 m, as before */
    const hand = actor.slot('handslotr');
    const gear = [];
    const gdim = worldMod()?.gearLook?.dim ?? 0.6; const dim = (g) => { if (gdim !== 1) g.traverse((o) => { if (o.isMesh) o.material.color.multiplyScalar(gdim); }); return g; };
    if (hand && def.gear) { const g = dim(await makeGear(def.gear)); hand.add(g); gear.push(g); }
    if (def.offhand) { const slot = actor.slot(isShield(def.offhand) ? 'armslotl' : 'handslotl'); if (slot) { const g = dim(await makeGear(def.offhand)); mountGear(g, def.offhand); slot.add(g); gear.push(g); } }
    /* the gear too (makeGear clones its materials per piece, none is shared with the hero's weapon): a maul haft or a
       club that swings at the lens dissolves like the body */
    for (const g of gear) g.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) addNearFade(m); });
    this.world.scene.add(actor.root);
    const hp = Math.round(def.hp * (group.captain ? 1.8 : 1));
    const order = this.breakOrder(actor);
    const foe = { id: this.nextId++, def, group, actor, gear, pos, vel: V(), yaw: Math.atan2(this.pos.x - pos.x, this.pos.z - pos.z), hp, maxHp: hp, poise: def.poise, maxPoise: def.poise * (group.captain ? 1.4 : 1), poiseT: 0,
      state: 'spawn', t: 0, cd: 0.8 + Math.random() * 1.2, role: i, phase: 0, damage: def.damage + (group.captain ? 1 : 0), reach: def.reach * scale, speed: def.speed, scale,
      order, broken: 0, blockHits: 0, dodgeCd: 0, hitFlip: false, eye: accent, soulOut: false, hold: !!group.hold, flee: false,
      /* def.fly (m): a hovering foe (neon's Drone). flyY = its height now (bob, wobble, the fall on death); the contact shadow stays on the ground */
      /* wide (m): a world look with a broad body (sleeves, a troll's belly) keeps the hero further out: def.wide or def.look.wide */
      wide: def.wide ?? def.look?.wide ?? 0,
      fly: def.fly > 0 ? def.fly : 0, flyY: 0, flyV: 0, flyPh: Math.random() * 6.28, wobble: 0, landed: false };
    if (foe.fly) { actor.hover = foe.fly; actor.blobOp = 0.55; }
    /* a world module may dress a plain foe (a code-built drone, a wolf head): dressFoe(actor, foeId, ctx) -> { update(dt, s), onDeath(pos), dispose() } | null */
    const wmf = worldMod();
    const preDress = new Set(this.world.scene.children);
    if (!def.boss && wmf?.dressFoe) { try { foe.fdress = wmf.dressFoe(actor, def.id, { scene: this.world.scene, def, accent, makeGear, mountGear, biome: this.world.biome?.id, captain: !!group.captain }) || null; } catch (err) { console.warn('world foe dress', err); } }
    /* the dark world's own foe dress (bosses.js: rim, bare-coif Thrall, horned Brute); it returns null in a world */
    else if (!def.boss && !wmf) { try { foe.fdress = (await import('./bosses.js')).dressFoe(actor, def.id, { def, biome: this.world.biome?.id, captain: !!group.captain }) || null; } /* ctx with the rank and the land, and the handle (rank cape, rim off on death) */ catch (err) { console.warn('dark foe dress', err); } }
    /* what a dress hung on the actor or put in the scene (a drone shell, a hood, a wolf head) fades near the lens
       too; before this only the body and the gear did, and a dress part drew as a flat dark panel over the view */
    sealFoeBody(actor); /* the wardrobe pieces the real body replaced stay off after the dress */
    if (!def.boss) { const fadeAll = (root) => root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) addNearFade(m); });
      fadeAll(actor.root); for (const c of this.world.scene.children) if (!preDress.has(c) && c !== actor.root) fadeAll(c); }
    const dur = actor.play('Jump_Land', { loop: false, speed: 1.1 });
    foe.t = -(dur ? dur * 0.75 : 1.0);
    if (def.boss) {
      foe.boss = true; foe.blinkCd = 4; foe.summoned = 0; this.bossFoe = foe;
      /* each boss has its own body, effects and arrival (web/src/bosses.js) */
      try {
        const { dressBoss } = await import('./bosses.js');
        /* a world module may dress its own boss (ctx.dress); bosses.js falls back to the dark dress when it returns null */
        const wm = worldMod(); const nid = def.nemesis || def.id; const before = new Set(this.world.scene.children); const lb = lightSet(this.world.scene);
        foe.dress = dressBoss(actor, def.id, { scene: this.world.scene, accent, heroLook: def.look, heroGear: def.mirror === false ? null : [this.weapon.gear, this.weapon.offhand].filter(Boolean), makeGear, /* a twin with its own gear never takes the hero's offhand */ mountGear, biome: this.world.biome?.id,
          nemesis: nid, size: def.nemesis ? def.size : undefined, bare: !!def.bare, dress: wm?.dressBoss ? (a, id, c) => wm.dressBoss(a, nid, c) : null });
        /* the boss's own dress (a sledge, a club, a coat, plates) dissolves near the lens like the body: what it hung on
           the actor, and what it put straight into the scene */
        const fadeIn = (root) => root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) addNearFade(m); });
        fadeIn(actor.root); for (const c of this.world.scene.children) if (!before.has(c) && c !== actor.root) fadeIn(c);
        { /* perf: the boss's lights (slam, lantern) link every lit program in the background first; the boss and its dress stay hidden meanwhile (no unposed frame) */
          holdNewLights(this.world.scene, lb); const hid = [actor.root, ...this.world.scene.children.filter((c) => !before.has(c) && c !== actor.root && c.visible)]; const vis = hid.map((o) => o.visible); for (const o of hid) o.visible = false;
          try { await warmNewLights(this.world.renderer, this.world.scene, this.world.camera, lb); } finally { hid.forEach((o, i) => { o.visible = vis[i]; }); } }
        const w = this.world;
        if (!w._darkWrap && w.applyLook) { const base = w.applyLook.bind(w); w._dark = 0; w.applyLook = (dt, fc) => { base(dt, fc); const d = w._dark || 0; if (d > 0) { if (w.sun) w.sun.intensity *= 1 - d; if (w.hemi) w.hemi.intensity *= 1 - d * 0.95; if (w.rim) w.rim.intensity *= 1 - d * 0.8; } }; w._darkWrap = true; }
      } catch (err) { console.warn('boss dress', err); }
    }
    /* the spawn warm after the dress. The dress (bosses.js darkRim, foe-look matte, a world's dressFoe) grows each
       material's onBeforeCompile chain, so a warm before it linked programs the foe never drew (about one per material kind
       per wave) and the dressed ones linked again on the first frame. The foe and what its dress put in the scene stay hidden
       while their programs link; a kind seen before resolves at once. */
    { const R = this.world.renderer; const key = `${def.id}|${group.captain ? 1 : 0}|${def.boss ? def.nemesis || 1 : 0}`; const W = this.spawnWarm || (this.spawnWarm = new Set());
      if (R?.compileAsync && !W.has(key)) { W.add(key); const par = actor.root.parent; const hid = this.world.scene.children.filter((c) => !preDress.has(c) && c !== actor.root && c.visible);
        for (const o of hid) o.visible = false; par?.remove(actor.root); /* out of the scene for the warm: one compile call for the whole body */
        try { await Promise.race([R.compileAsync(actor.root, this.world.camera, this.world.scene), new Promise((r) => setTimeout(r, 2500))]); } catch (err) { console.warn('spawn warm', err); } finally { if (par && !actor.root.parent) par.add(actor.root); for (const o of hid) o.visible = true; } } }
    group.members.push(foe); this.foes.push(foe);
    try { Q2.onSpawn(this, foe); } catch (err) { console.warn('quest spawn', err); } /* the enemy's kind adds one rule */
    if (!def.boss) this.warmFade(actor, `${def.id}|${group.captain ? 1 : 0}|${def.label || ''}`);
    return foe;
  }
  /* a body that fades (a corpse, a foe sent away on the walk) turns its materials transparent, and three.js links a new
     shader program for each one on that frame (the long frame when the first find was taken: SQ_Cloth, SQ_Under). The
     transparent twins are linked now, in the background, once per kind of foe, while it drops in. */
  async warmFade(actor, key) {
    const W = this.fadeWarm || (this.fadeWarm = new Set()); if (W.has(key)) return; W.add(key);
    const R = this.world.renderer; if (!R?.compileAsync) return;
    const meshes = []; const mats = [];
    actor.root.traverse((o) => { if (o.isMesh) { meshes.push(o); for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !m.transparent && !mats.includes(m)) mats.push(m); } });
    try {
      await R.compileAsync(this.world.scene, this.world.camera);
      if (!this.active || actor.root.parent == null) return;
      /* the body is not drawn while its transparent twins link (a frame drawn with an unlinked program would link it there
         and then, the very stall this avoids); each mesh is compiled on its own, as the hidden root is skipped */
      actor.root.visible = false;
      for (const m of mats) { m.transparent = true; m.needsUpdate = true; }
      await Promise.all(meshes.map((o) => R.compileAsync(o, this.world.camera, this.world.scene).catch(() => {})));
    } catch (err) { console.warn('prewarm fade', err); } finally {
      /* back to solid, unless the body began to fade meanwhile */
      for (const m of mats) if (m.transparent && m.opacity >= 0.999) { m.transparent = false; m.needsUpdate = true; }
      actor.root.visible = true;
    }
  }
  breakOrder(actor) {
    const worn = new Set(actor.wornParts());
    /* only plates that can come off a fighter (shoulders, helm, the skirt); gauntlets, greaves and arm plates
       stay on, so a hit never throws a loose hand or boot */
    const pref = ['HeavyL', 'HeavyR', 'PauldronL', 'PauldronR', 'Helm_great', 'Helm_sallet', 'Helm_kettle', 'Hood', 'Fauld'];
    /* a world adds its own breakable wardrobe parts (export const breakable = ['Kabuto', ...]) after the knight names */
    const extra = (worldMod()?.breakable || []).filter((p) => !pref.includes(p));
    return [...pref, ...extra].filter((p) => worn.has(p));
  }

  /* ---------- tactics: Sage2 picks, code executes ---------- */
  legalFor(g) {
    const alive = g.members.length;
    const hpFrac = g.members.reduce((s, f) => s + f.hp, 0) / Math.max(1, g.members.reduce((s, f) => s + f.maxHp, 0));
    const near = g.members.some((f) => f.pos.distanceTo(this.pos) < 6);
    const legal = ['charge'];
    if (g.def.boss) { if (near) legal.push('feint'); if (g.def.blocks && g.softStreak < 2) legal.push('guard'); return { legal, hpFrac }; }
    if (alive >= 2) legal.push('flank');
    if (near && g.softStreak < 2) legal.push('feint');
    if (g.softStreak < 2 && g.def.id !== 'brute') legal.push('guard');
    if (alive === 1 && hpFrac < 0.4 && g.last !== 'retreat' && g.def.id !== 'brute') legal.push('retreat');
    if (!g.called && alive <= g.size / 2 && this.reinforcements > 0 && g.def.id !== 'brute') legal.push('call');
    return { legal, hpFrac };
  }
  factsFor(g, hpFrac) {
    const d = Math.min(...g.members.map((f) => f.pos.distanceTo(this.pos)));
    const others = this.groups.filter((o) => o !== g && o.members.length > 0).reduce((s, o) => s + o.members.length, 0);
    const doing = this.rg?.doing() || (this.blocking ? 'blocking' : this.swing ? 'swinging a weapon' : this.dodge ? 'dodging' : this.moving ? 'moving' : 'standing still');
    return [
      `Group: ${plural(g.members.length, g.def.label)} left of ${g.size}.`,
      `The group has lost half of its members or more: ${g.members.length <= g.size / 2 ? 'yes' : 'no'}.`,
      `Group health: ${hpFrac >= 0.75 ? 'healthy' : hpFrac >= 0.4 ? 'hurt' : 'badly hurt'}.`,
      `Distance to the intruder: ${d < 3.5 ? 'close' : d < 8 ? 'medium' : 'far away'} (${d.toFixed(0)} paces).`,
      `The intruder is ${doing}.`,
      `Intruder health: ${this.hp} of ${this.maxHp}${this.hp <= this.maxHp * 0.4 ? ', the intruder is hurt' : ''}.`,
      `Other allies in the fight: ${others}.`,
      `The group ${g.members.length + others > 1 ? 'outnumbers' : 'does not outnumber'} the intruder.`,
      `Reinforcements available: ${!g.called && this.reinforcements > 0 ? 'yes' : 'no'}.`,
    ];
  }
  localTactic(g, legal) {
    if (legal.includes('flank') && this.blocking) return 'flank';
    if (legal.includes('call')) return 'call';
    return 'charge';
  }
  setTactic(g, tactic, source) {
    g.since = this.clock;
    g.softStreak = SOFT.has(tactic) ? g.softStreak + 1 : 0;
    this.stats.tactics[tactic] = (this.stats.tactics[tactic] || 0) + 1;
    if (tactic === g.tactic && g.last !== null) { g.last = tactic; return; }
    g.last = g.tactic; g.tactic = tactic;
    for (const f of g.members) { f.phase = 0; f.phaseT = 0; }
    const lead = g.members[0];
    if (lead) this.label(lead, `${byId(TACTICS, tactic).label}`, source);
    this.director.event(`${g.def.label}s take the tactic ${tactic}.`);
    sfx('tactic');
  }
  runTick() {
    const ready = this.groups.filter((g) => g.members.length > 0 && this.clock - g.since >= HOLD && g.members.some((f) => f.state !== 'spawn'));
    /* a group with one legal tactic has nothing to decide: it gets that tactic here and is not sent */
    const due = [];
    for (const g of ready) { const { legal } = this.legalFor(g); if (legal.length === 1) this.setTactic(g, legal[0], 'rule'); else due.push(g); }
    if (due.length === 0) return;
    const tick = ++this.tick;
    const sent = performance.now();
    const meta = new Map();
    const body = { tick, groups: due.map((g) => { const { legal, hpFrac } = this.legalFor(g); meta.set(g.id, { g, legal }); return { id: g.id, type: g.def.id, ...(g.def.nemesis ? { nemesis: g.def.nemesis } : {}), legal, facts: this.factsFor(g, hpFrac) }; }), ...(this.kit.id !== 'dark' ? { world: this.kit.id } : {}) };
    /* 600 ms budget, then the local table acts. A Sage2 answer that comes within
       LATE_MS still replaces the local pick when it is still legal; later ones are dropped. */
    let usedLocal = false; let answered = false;
    const fallback = setTimeout(() => {
      if (answered) return; usedLocal = true;
      for (const { g, legal } of meta.values()) if (g.members.length) this.setTactic(g, this.localTactic(g, legal), 'local');
    }, BUDGET_MS);
    api('/api/tactics', body, 3000).then((r) => {
      const age = performance.now() - sent;
      if (!r || r.tick !== tick || age > LATE_MS || this.over) { if (r) { this.stats.late++; feed.dropped++; } return; }
      answered = true; clearTimeout(fallback);
      for (const pick of r.picks) {
        const m = meta.get(pick.id); if (!m || !m.g.members.length) continue;
        const choice = pick.chosen ?? pick.lead;
        const legalNow = this.legalFor(m.g).legal;
        if (choice && m.legal.includes(choice) && legalNow.includes(choice)) this.setTactic(m.g, choice, 'sage', pick.leadP);
        else if (!usedLocal) this.setTactic(m.g, this.localTactic(m.g, m.legal), 'local');
      }
    });
  }

  /* ---------- per-frame ---------- */
  update(rawDt) {
    if (!this.active) return;
    let dt = Math.min(rawDt, 0.05);
    if (this.hitstop > 0) { this.hitstop -= rawDt; dt *= 0.04; }
    else if (this.slow > 0) { this.slow -= rawDt; dt *= this.slowK || 0.25; if (this.slow <= 0) this.slowK = 0; } /* slowK = a deeper or lighter slow for one beat (the killing blow 0.15, the boss's last hits 0.5) */
    this.clock += dt;
    if (this.deathCam) this.holdDeath(Math.min(rawDt, 0.05));
    if (!this.paused) this.updatePlayer(dt);
    /* a pause (a walk cut, a card) while the player aims froze the aim: ranged.update() does not run, so the
       state stayed 'aim' and the lens stayed zoomed (rifle 52 deg) for the whole cut. A pause lets go of the aim. */
    else if (this.rg && (this.rg.st === 'tell' || this.rg.st === 'aim' || this.rg.st === 'draw')) { this.rg.st = 'ready'; this.rg.k = 0; }
    this.updateWisps(dt);
    for (const p of this.props || []) if (p.h) { try { p.h.update(dt, p.args); } catch (err) { console.warn('prop', err); p.h = null; } }
    this.react?.tick(dt); /* the clock of the lean springs (slowed by the hit-stop, so a blow freezes on its pose) */
    if (!this.dbg?.freeze) for (const f of this.foes) this.updateFoe(f, dt * (f.timeK ?? 1)); /* a chilled or snared foe runs on a slower clock */
    this.separate();
    for (const f of this.foes) { f.actor.root.position.copy(f.pos); if (this.journey) f.actor.root.position.y = this.journey.gy(f.pos.x, f.pos.z); f.actor.root.rotation.y = f.yaw;
      if (f.sinkY) f.actor.root.position.y -= f.sinkY;
      if (f.fly) this.hover(f, dt);
      if (f.fdress?.update) { try { f.fdress.update(dt, { pos: f.pos, yaw: f.yaw, flyY: f.flyY, attacking: f.state === 'attack', dead: f.state === 'dead', down: f.state === 'down' || f.state === 'stagger', hpFrac: f.hp / f.maxHp, player: this.pos }); } catch (err) { console.warn('world foe dress', err); f.fdress = null; } }
        /* a dress may build its parts on its first update (neon's drone) or after a load (a boss's own wear): every part
           under the actor takes the near fade on its 2nd and 45th frame */
        f.fdFade = (f.fdFade || 0) + 1; if (f.fdFade === 2 || f.fdFade === 45) f.actor.root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) addNearFade(m); }); f.actor.mixer.update(f.state === 'frozen' ? 0 : dt * (f.timeK ?? 1));
      if (f.dress) { try { const a = f.atk; f.dress.update(dt, { pos: f.pos, yaw: f.yaw, phase: f.stage || 0, attacking: f.state === 'attack', moving: f.vel.lengthSq() > 0.2 || f.moving === true, hpFrac: f.hp / f.maxHp, player: this.pos, atkK: a ? a.clipT / a.def.hits[0] : 0, atkKind: a && !a.fake ? a.def.kind || null : null /* slam, sweep, stomp, charge, lunge, combo, break, bolt */, recovering: f.state === 'recover', dead: f.state === 'dead' }); this.shake = Math.max(this.shake, f.dress.takeShake?.() || 0); this.world._dark = f.state === 'dead' ? 0 : (f.dress.darkness || 0); } catch (err) { console.warn('boss dress', err); f.dress = null; } } }
    this.foes = this.foes.filter((f) => !f.gone);
    this.updateDebris(dt); this.updateRings(dt); this.updateShots(dt); this.updateBoss(dt);
    if (this.powers) { try { this.powers.update(dt); } catch (err) { console.warn('powers', err); } }
    if (this.torch) { const cm = this.world.camera; const tv = this._tv || (this._tv = new THREE.Vector3()); cm.getWorldDirection(tv); tv.y = 0; if (tv.lengthSq() < 1e-6) tv.set(0, 0, -1); tv.normalize(); cm.getWorldPosition(this.torch.position); this.torch.target.position.copy(this.torch.position).add(tv); }
    for (const l of this.sparkLights) { l.userData.t += rawDt; l.intensity = (l.userData.i || 3) * Math.max(0, 1 - l.userData.t / 0.14); }
    if (!this.over && !this.betweenWaves && !this.spawning) {
      this.tickTimer += dt;
      if (this.tickTimer >= TICK) { this.tickTimer = 0; this.runTick(); }
      if (this.task) this.task.update(dt);
      else if (!this.inSecond && this.groups.every((g) => g.members.length === 0) && this.wave > 0 && !this.deathCam && !(this.boss && !this.boss.dead)) this.endWave();
    }
    const cam = this.world.camera;
    this.shake = Math.max(0, this.shake - rawDt * 2.6); this.roll += (0 - this.roll) * Math.min(1, rawDt * 9); this.kickPitch += (0 - this.kickPitch) * Math.min(1, rawDt * 10); this.twist += (0 - this.twist) * Math.min(1, rawDt * 6);
    const sh = this.shake * this.shake;
    const dip = this.dodge ? -0.3 * Math.sin((this.dodge.t / this.dodge.dur) * Math.PI) : 0;
    const walk = this.moving && !this.dodge ? (Math.abs(Math.cos(this.stepPh || 0)) - 0.64) * 0.07 : 0; /* lowest at each footfall (stepPh = k*pi + pi/2) */
    cam.position.set(this.pos.x + (Math.random() - 0.5) * sh * 0.5, EYE + this.footY + dip + walk + (Math.random() - 0.5) * sh * 0.4 - (this.stagger > 0 ? 0.18 : 0), this.pos.z + (Math.random() - 0.5) * sh * 0.5);
    const rk = this.reach ? this.reachK() : 0;
    if (rk > 0) cam.position.y -= 0.32 * rk;
    this.clearView(cam, rawDt);
    cam.rotation.set(this.pitch + this.kickPitch - this.nod * 0.035 - 0.42 * rk, this.yaw + this.twist + this.lean * 0.03, this.roll - this.lean * 0.028 + (Math.random() - 0.5) * sh * 0.12, 'YXZ');
    /* the death director owns the lens (place, aim, fov) while a boss dies */
    this.ddCam = false; if (this.dd) { try { this.dd.camera(cam, Math.min(rawDt, 0.05)); this.ddCam = true; } catch (err) { console.warn('death director camera', err); } }
    /* the camera is final here (play view, back-off, death director): push, step aside, hide, clear the cinema lens */
    if (this.near) { try { this.near.frame(cam, Math.min(rawDt, 0.05)); this.labelFloor(); /* the tags again, with this frame's final camera */ } catch (err) { console.warn('nearcam', err); this.near = null; } }
    this.poseViewModel(dt, Math.min(rawDt, 0.05) * (this.hitstop > 0 ? 0.04 : 1));
    this.updateLabels(); this.updateTargetUi(); this.updateCue(); this.updateGuide(Math.min(rawDt, 0.1));
    const wantFov = (this.deathCam ? 70 - 26 * Math.min(1, this.deathCam.t / 1.2) : 70) + this.world.impact * 6 + (this.swing?.heavy ? 5 : 0) - (this.charge ? Math.min(1, this.charge.t) * 7 : 0) + (this.dodge ? 5 : 0) - (this.rg?.zoomNow || 0);
    if (!this.ddCam && Math.abs(cam.fov - wantFov) > 0.05) { cam.fov += (wantFov - cam.fov) * Math.min(1, rawDt * (this.deathCam ? 2.5 : 12)); cam.updateProjectionMatrix(); }
    this.hud.set({ hp: this.hp, maxHp: this.maxHp, guard: this.guard, stagger: this.stagger > 0, foes: this.foes.filter((f) => f.state !== 'dead').length, ability: this.powers ? this.powers.hudName() : this.element.ability, abilityReady: 1 - this.abilityCd / this.abilityMax });
  }

  updatePlayer(dt) {
    if (this.over) return;
    /* test hook: hold one moment of a move still, to look at it */
    if (this.dbg) {
      const d = this.dbg; this.swing = null; this.charge = null; this.kick = null; this.blocking = !!d.block; this.moving = false;
      if (d.arc) { const m = this.moveFor(!!d.heavy); this.swing = { ...m, arc: d.arc, hand: d.hand || 'r', t: d.k * 1, dur: 1, hitSet: new Set(), bounced: false }; }
      if (d.charge) this.charge = { t: d.charge };
      if (d.kick != null) this.kick = { t: d.kick * 0.46, dur: 0.46, hit: true };
      this.dbgWas = true; return;
    }
    if (this.dbgWas) { this.dbgWas = false; this.swing = null; this.charge = null; this.kick = null; }
    const k = this.keys;
    if (k.has('ArrowLeft')) this.yaw += dt * 2.4;
    if (k.has('ArrowRight')) this.yaw -= dt * 2.4;
    this.swingCd = Math.max(0, this.swingCd - dt); this.dodgeCd = Math.max(0, this.dodgeCd - dt); this.kickCd = Math.max(0, this.kickCd - dt);
    this.invuln = Math.max(0, this.invuln - dt); this.stagger = Math.max(0, this.stagger - dt); this.crit = Math.max(0, this.crit - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    if (this.mod.regen && this.hp > 0 && this.hp < this.maxHp) { this.regenT += dt * this.mod.regen * (this.bossFoe?.c2 && C2.on(this) ? 0.4 : 1); /* combat2: a boss fight is not won by waiting it out */ if (this.regenT >= 1) { this.regenT = 0; this.hp++; } }
    /* a towering boss: the view lifts to its head while it winds up, so the blow can be read */
    /* a very tall boss (head more than TALL_H over the eye: neon's Tower, the Storm Giant, the dark Giant) never cranes the
       view: the pitch stays under TALL_PITCH (a little street stays in the lower third) and the camera backs off instead
       (clearView), so the face sits about 0.6 up the frame */
    { const bf = this.bossFoe; const hH = bf?.dress?.lookAt && bf.state !== 'dead' ? bf.dress.lookAt.y - EYE - this.footY : 0;
      if (hH > TALL_H && !this.cineLook && !this.deathCam) { const o = this.camOff; const d = Math.max(1, bf.pos.distanceTo(this.pos) + (o ? Math.hypot(o.x, o.z) : 0));
        const want = clamp(Math.atan2(hH, d) - TALL_FACE, 0, TALL_PITCH);
        if (this.pitch > TALL_PITCH) this.pitch += (TALL_PITCH - this.pitch) * Math.min(1, dt * 3);
        else if (this.pitch < want - 0.02) this.pitch += (want - this.pitch) * Math.min(1, dt * 1.2); } }
    { const bf = this.bossFoe; if (bf && bf.scale > 2 && bf.state !== 'dead' && bf.dress?.lookAt && !(bf.dress.lookAt.y - EYE - this.footY > TALL_H)) { const d = Math.max(1, bf.pos.distanceTo(this.pos)); if (d < 9) { const want = clamp(Math.atan2(bf.dress.lookAt.y * 0.72 - EYE, d), 0, 0.72); if (this.pitch < want - 0.05) this.pitch += (want - this.pitch) * Math.min(1, dt * (bf.state === 'attack' ? 1.8 : 0.9)); }
      /* the boss bar and name sit at the top of the screen; the view keeps the boss's head about a quarter down from the top
         (head angle less 0.36 rad, half of a 70 degree view), a gentle pull, never more than 0.72 */
      if (d < 12) { const head = Math.atan2(bf.dress.lookAt.y - EYE - this.footY, d); const keep = clamp(head - 0.36, 0, 0.72); if (this.pitch < keep - 0.02) this.pitch += (keep - this.pitch) * Math.min(1, dt * 1.2); } } }
    /* the boss stays in the frame. When the player has not aimed for 0.8 s and the live boss is off the
       middle of the view (more than 0.5 rad aside: at the edge or behind), the view turns to it; when the view looks over
       its head into the sky, it comes down to the head. Never during a death cut, a cinematic look or a lock. */
    { const bf = this.bossFoe; if (bf && bf.state !== 'dead' && bf.state !== 'spawn' && !this.cineLook && !this.deathCam && !this.lock && !this.over && this.clock - (this.lookT ?? -9) > 0.8) {
      let d = this.yawTo(bf.pos) - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 0.5) this.yaw += d * Math.min(1, dt * (bf.state === 'attack' ? 3.2 : 1.8)) * (1 - 0.5 / Math.abs(d));
      const top = bf.dress?.lookAt?.y ?? (bf.pos.y + 2 * bf.scale); const dh = Math.max(1, Math.hypot(bf.pos.x - this.pos.x, bf.pos.z - this.pos.z)); const head = Math.atan2(top - EYE - this.footY, dh);
      if (this.pitch > head + 0.12) this.pitch += (head + 0.12 - this.pitch) * Math.min(1, dt * 2); } }
    if (this.cineLook) { this.turnToward(this.cineLook, Math.min(1, dt * 2.2)); this.pitch += (0.12 - this.pitch) * Math.min(1, dt * 2); }
    if (this.lock && (this.lock.state === 'dead' || this.lock.gone)) this.lock = null;
    if (this.lock) this.turnToward(this.lock.pos, Math.min(1, dt * 9));
    else if (this.bossLock && this.boss?.focus?.()) this.turnToward(this.boss.focus(), Math.min(1, dt * 6));
    const wasBlocking = this.blocking;
    const blockKey = this.mouseBlock || k.has('ShiftLeft');
    if (blockKey && !this.blockKeyWas) { this.blockUntil = this.clock + 0.32; this.blockSince = this.clock; if (this.swing && this.swing.t / this.swing.dur > WIND + CUT) this.swing = null; }
    this.blockKeyWas = blockKey;
    this.blocking = (blockKey || this.clock < (this.blockUntil || 0)) && !this.swing && !this.kick && this.stagger <= 0 && this.guard > 0 && (!this.rg || this.rg.canBlock());
    if (this.blocking && !wasBlocking) { this.charge = null; }
    if (!this.blocking && this.guard < 3) { this.guardRegen += dt; if (this.guardRegen > this.mod.guardRegen) { this.guard++; this.guardRegen = 0; } } else this.guardRegen = 0;
    /* hold the button to charge a heavy blow */
    if (this.held && !this.rg && !this.swing && !this.charge && !this.busy() && !this.blocking && performance.now() - this.heldAt > 230) { this.charge = { t: 0.2 }; sfx('charge'); }
    if (this.charge) { this.charge.t += dt; if (this.charge.t > 1.25) { this.held = false; this.releaseCharge(); } }
    if (this.buffer && this.clock - this.buffer.t > 0.5) this.buffer = null;
    const v = this.moveVector();
    this.moving = v.lengthSq() > 0.01;
    if (this.dodge) {
      this.dodge.t += dt; this.pos.addScaledVector(this.dodge.dir, (5.6 / this.dodge.dur) * dt * (1 - 0.5 * (this.dodge.t / this.dodge.dur)));
      if (this.dodge.t >= this.dodge.dur) this.dodge = null;
    } else if (this.moving && this.stagger <= 0) {
      v.normalize(); this.pos.addScaledVector(v, this.archetype.speed * this.pace * (this.blocking ? 0.45 : this.charge ? 0.4 : this.swing ? 0.35 : 1) * (this.rg ? this.rg.moveK() : 1) * dt);
      /* the hero's steps fall on stride distance at this speed (sfxFoot below), not on a fixed timer */
      this.footSp = this.archetype.speed * this.pace * (this.blocking ? 0.45 : this.charge ? 0.4 : this.swing ? 0.35 : 1) * (this.rg ? this.rg.moveK() : 1);
    }
    /* the bob phase runs on stride distance like the steps: pi per step, so one dip per footfall */
    { const sp = this.footSp || 0; if (sp > 0.3) this.stepPh = (this.stepPh || 0) + ((sp * dt) / footStride(sp)) * Math.PI; else this.stepPh = 0.2 * Math.PI; /* sfx.js puts the first step at 30 % of a stride: the first dip meets it */ }
    sfxFoot(dt, this.footSp || 0, this.world.biome?.id); this.footSp = 0; /* steps (silent when still) and the world's ambience bed */
    this.pos.addScaledVector(this.vel, dt); this.vel.multiplyScalar(Math.max(0, 1 - dt * 7));
    if (this.swing) {
      const s = this.swing; const arc = ARCS[s.arc];
      s.t += dt; const kk = s.t / s.dur;
      if (this.lunge && s.t < this.lunge.until && !s.bounced) this.pos.addScaledVector(this.lunge.dir, this.lunge.speed * dt);
      if (s.target && s.target.state !== 'dead' && kk < arc.hit[0] && !this.lock) this.turnToward(s.target.pos, Math.min(1, dt * 6));
      if (!s.loosed && kk >= WIND - 0.04) { s.loosed = true; sfx(s.heavy || this.feel.heavySound ? 'swingHeavy' : arc.single ? 'thrust' : 'swing'); if (!this.lunge) this.vel.addScaledVector(this.forward(), s.heavy ? 2.6 : 1.4); }
      if (!s.bounced && kk >= arc.hit[0] && kk <= arc.hit[1]) this.resolveSwing(s, arc);
      const chainAt = s.heavy ? 0.9 : 0.66;
      if (this.buffer && kk >= chainAt && !s.bounced) { const b = this.buffer; this.buffer = null; this.swing = null; this.swingCd = 0; this.tryAttack(b.heavy); }
      else if (kk >= 1 || (s.bounced && s.t - s.bounceT > 0.4)) { this.swing = null; this.swingCd = s.bounced ? 0.25 : 0.06; }
    }
    if (!this.swing && this.buffer && this.swingCd <= 0 && !this.busy()) { const b = this.buffer; this.buffer = null; this.tryAttack(b.heavy); }
    if (this.kick) {
      const kq = this.kick; kq.t += dt;
      if (!kq.hit && kq.t >= kq.dur * 0.4) { kq.hit = true; this.resolveKick(); }
      if (kq.t >= kq.dur) this.kick = null;
    }
    this.rg?.update(dt);
    /* the hero cannot walk into the dragon's body */
    if (this.boss && !this.boss.dead) for (const h of this.boss.hittable()) {
      if (h.pos.y > 3.6) continue;
      const dx = this.pos.x - h.pos.x; const dz = this.pos.z - h.pos.z; const d = Math.hypot(dx, dz); const min = (h.radius ?? 0.6) + 0.75;
      if (d < min && d > 0.001) { this.pos.x += (dx / d) * (min - d); this.pos.z += (dz / d) * (min - d); }
    }
    for (const p of this.props || []) { if (p.gone) continue; const dx = this.pos.x - p.pos.x; const dz = this.pos.z - p.pos.z; const d = Math.hypot(dx, dz); const min = this.propRad(p); if (d < min && d > 0.001) { this.pos.x += (dx / d) * (min - d); this.pos.z += (dz / d) * (min - d); } }
    if (this.pos.length() > this.arena) this.pos.setLength(this.arena);
  }

  /* a foe may answer the start of a swing: a guard raises the shield, a stalker steps away */
  reactToSwing(f, targeted) {
    if (!targeted || f.state !== 'idle' || f.pos.distanceTo(this.pos) > this.weapon.reach + 2.4) return;
    if (f.def.blocks && Math.random() < (f.group.tactic === 'guard' ? 0.9 : f.boss ? 0.65 : 0.4)) { f.state = 'block'; f.t = 0; f.blockFor = 0.9; f.actor.play('Sword_Block', { loop: false, fade: 0.08, speed: 1.4 }); }
    else if (f.def.dodges && f.dodgeCd <= 0 && Math.random() < 0.5) {
      const side = Math.random() < 0.5 ? 1 : -1; const to = V().subVectors(this.pos, f.pos).setY(0).normalize();
      f.state = 'dodge'; f.t = 0; f.dodgeDir = V(to.z * side, 0, -to.x * side); f.dodgeCd = 2.6;
      f.actor.play('Roll', { loop: false, fade: 0.06, speed: 2.4 });
    }
  }

  contactPoint(f, h = 1.55) { const to = V().subVectors(this.pos, f.pos).setY(0).normalize(); return V(f.pos.x + to.x * 0.45 * f.scale, f.fly ? f.flyY + 0.95 * f.scale : Math.min(2.5, h * f.scale), f.pos.z + to.z * 0.45 * f.scale); }

  resolveSwing(s, arc) {
    this.hitProps(s);
    const fwd = this.forward(); let best = null; let bd = 1e9;
    const cands = [];
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn' || s.hitSet.has(f.id)) continue;
      const to = V().subVectors(f.pos, this.pos).setY(0); const d = to.length();
      if (d > this.weapon.reach + (s.heavy ? 0.9 : 0.5) + Math.max((f.scale - 1) * 0.6, (f.dress?.keepOut || 0) - 2.2, this.holdOff(f) - 1.9)) continue;
      to.normalize(); if (to.dot(fwd) < arc.cone) continue;
      cands.push({ f, to, d }); if (d < bd) { bd = d; best = f; }
    }
    if (this.boss && !s.bossHit) this.swingAtBoss(s, arc, fwd);
    for (const { f, to } of cands) {
      if (arc.single && (f !== best || s.hitSet.size > 0)) continue;
      s.hitSet.add(f.id);
      if (f.state === 'dodge') continue;
      const facing = V(Math.sin(f.yaw), 0, Math.cos(f.yaw)).dot(to) < -0.3;
      const at = this.contactPoint(f, arc.side === 'H' ? 2.0 : 1.5);
      if (f.state === 'block' && facing && f.c2 && C2.on(this)) { const g = C2.guardHit(this, f, s); if (g === 'parry') { s.hitSet.add(f.id); C2.parryHero(this, f, s, this.contactPoint(f, 1.5), to); continue; } if (g === 'break') { s.hitSet.add(f.id); C2.guardBroken(this, f); this.sparks(at, to.clone().negate(), 0xffe2b0, 22, 8); continue; } } /* combat2: a duelist who reads you parries the blow you repeat; the other blow breaks its guard */
      if (f.state === 'block' && facing && !s.breaksGuard && !(this.crit > 0)) {
        /* the blade rings off the guard and bounces back */
        f.blockHits++; f.poise -= s.poise * 0.5 * (f.c2 && C2.on(this) ? 0.35 : 1); /* combat2: a guard takes poise like armour */ this.clash(at, to.clone().negate(), 0xffe2b0, 16, 7); sfx('deflect');
        s.bounced = true; s.bounceT = s.t; s.bounceK = s.t / s.dur; this.shake = Math.max(this.shake, 0.45); this.hitstop = 0.05; this.vmPunch.set(0.06 * (arc.side === 'L' ? 1 : -1), 0.03, 0.08);
        if (f.c2 && C2.on(this) && (f.blockHits >= 3 || f.poise <= 0)) { f.poise = Math.max(f.poise, 1); C2.guardBroken(this, f); } /* combat2: a worn guard drops, no free stagger */
        else if (f.blockHits >= 3 || f.poise <= 0) this.staggerFoe(f, to, 'Guard broken');
        else { f.blockFor = Math.max(f.blockFor, 0.5); f.pos.addScaledVector(to, 0.25); }
        continue;
      }
      if (f.state === 'block' && facing && s.breaksGuard) { if (f.boss && f.c2 && C2.on(this)) C2.guardBroken(this, f); else this.staggerFoe(f, to, 'Guard broken'); this.sparks(at, to.clone().negate(), 0xffe2b0, 22, 8); } /* combat2: a broken guard opens the boss for a moment, no stagger */
      let dmg = s.dmg * this.power;
      this.damageFoe(f, dmg, to, { knock: s.knock, heavy: s.heavy || !!this.feel.crush, finisher: s.finisher, poise: s.poise, side: arc.side, at, knockdown: s.knockdown });
      if (!s.contact) {
        s.contact = true;
        const fe = this.feel; this.hitstop = (s.heavy ? 0.14 : s.finisher ? 0.1 : 0.065) * fe.stop; this.shake = Math.max(this.shake, (s.heavy ? 0.85 : 0.5) * fe.shake);
        this.world.kick((s.heavy ? 0.22 : 0.1) * fe.kick); this.vmPunch.set(0, 0, (s.heavy ? 0.1 : 0.05) * fe.kick);
        if (this.lunge) this.lunge.until = 0;
      }
    }
  }

  resolveKick() {
    const fwd = this.forward(); let any = false;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn' || f.fly) continue; /* a kick passes under a flying foe */
      const to = V().subVectors(f.pos, this.pos).setY(0); const d = to.length(); if (d > 2.9 + (f.scale - 1)) continue;
      to.normalize(); if (to.dot(fwd) < 0.55) continue;
      any = true; this.stats.kicks++;
      const at = this.contactPoint(f, 1.15);
      this.sparks(at, to, 0xffffff, 8, 5);
      if (f.def.armor && f.state !== 'stagger') { f.vel.addScaledVector(to, 2.5); f.poise -= 2; if (f.poise <= 0) this.staggerFoe(f, to); continue; }
      if (f.boss && f.c2 && C2.on(this)) { if (f.state === 'block') C2.guardBroken(this, f); else { f.poise = Math.max(0, f.poise - C2.kickPoise(this, f)); if (f.poise <= 0) C2.afterBossHit(this, f, to); f.vel.addScaledVector(to, f.state === 'attack' ? 0.6 : 3); } } /* combat2: a kick breaks a guard (a short opening), never a blow; its poise is armoured like any hit */
      else if (f.boss) { f.poise -= 3; if (f.state === 'block' || f.poise <= 0) this.staggerFoe(f, to, f.state === 'block' ? 'Guard broken' : null); else f.vel.addScaledVector(to, 3); }
      else if (f.state === 'stagger' || f.state === 'block' || f.hp <= f.maxHp * 0.5) this.knockDown(f, to, 9);
      else { this.staggerFoe(f, to); f.vel.addScaledVector(to, 7.5); }
      this.damageFoe(f, 1, null, { poise: 0, quiet: true, at });
    }
    if (any) { sfx('kick'); this.hitstop = 0.08; this.shake = Math.max(this.shake, 0.6); this.world.kick(0.12); this.kickPitch += 0.03; }
  }

  /* Every hit on a foe goes through here: swings, kicks and abilities. */
  damageFoe(f, dmg, dir, { knock = 1.0, heavy = false, finisher = false, poise = 1, side = 'C', at = null, knockdown = false, quiet = false, color = null, shot = false, aim = 0, pierce = false } = {}) {
    if (f.state === 'dead') return;
    if (this.powers) dmg = this.powers.onHit(f, dmg, heavy); /* a mark bursts, a frozen foe shatters */
    const exposed = f.state === 'stagger' || f.state === 'down' || f.state === 'getup' || f.state === 'frozen';
    const critical = exposed || this.crit > 0;
    if (critical) dmg *= 2; else if (f.state === 'recover') { dmg *= 1.5; poise *= 1.5; }
    if (f.boss) dmg *= this.bossMul;
    let c2 = null; if (f.boss && f.c2 && C2.on(this)) { c2 = C2.bossHit(this, f, dmg, poise, { heavy, shot, aim, head: side === 'H', pierce }); dmg = c2.dmg; poise = c2.poise; } /* combat2: armoured or open */
    else { try { dmg = Q2.onDamage(this, f, dmg, { heavy, dir }); } catch (err) { console.warn('quest damage', err); } }
    at = at || this.contactPoint(f);
    /* an exposed foe at low health is finished in one blow */
    const execute = !f.boss && exposed && f.hp - dmg <= f.maxHp * (f.def.armor ? 0.12 : 0.3);
    f.hp -= dmg; if (f.minHp && f.hp < f.minHp) f.hp = f.minHp; /* the enemy's first visit never ends it */ f.poise -= poise * (this.clock < (f.steadyUntil || 0) ? 0.3 : 1); f.poiseT = 0;
    if (!quiet) {
      sfx(c2?.sound || (f.order.length - f.broken > 0 ? (heavy ? 'clangBig' : 'clang') : (this.swing && this.feel.hitSound) || 'flesh')); if (c2?.open) sfx('flesh'); /* combat2: an armoured hit tinks */
      if (f.hp > 0 && !execute && !f.boss) sfx('foeHurt'); /* the foe's grunt (per world, sfx-pools.js) */
      { const ws = worldMod()?.stain; this.sparks(at, dir ? dir.clone() : V(0, 1, 0), color ?? (critical ? 0xffffff : 0xffd9a0), heavy || critical ? 26 : 14, heavy ? 9 : 6, { stain: ws === null || ws === false ? null : ws ?? undefined }); } /* the blow's own look, thrown along the blow */
      /* no eye-colour embers on every hit (they hung in the air as green and red motes) */
    }
    /* the struck body takes a short rim pulse on its silhouette (world.js actor.flash; never a full-body colour),
       warm white for steel, the power's colour for a power; and leans away from the blow (react.js) */
    try { f.actor.flash?.(color != null ? color : 0xfff0dc, critical || heavy ? 110 : 80, quiet ? 0.04 : critical || heavy ? 0.12 : 0.085); } catch { /* a dress without flash */ }
    if (dir && !f.boss) { try { this.react?.hit(f, dir, { heavy: heavy || knockdown, critical, finisher, side }); } catch (err) { console.warn('react', err); } }
    if (f.dress?.onHit) { try { const r = f.dress.onHit(at, heavy) || {}; if (r.slow) this.slow = Math.max(this.slow, r.slow); if (r.flash) this.world.flash(r.flash); } catch (err) { console.warn(err); } }
    if (f.hp <= 0 || execute) { this.killFoe(f, { dir, execute: execute || heavy || f.boss, at, side, heavy }); return; }
    if (f.boss) this.bossPhase(f);
    /* armour comes off as the foe is worn down */
    const want = Math.floor((1 - f.hp / f.maxHp) * f.order.length * 0.6) + (heavy || critical ? 1 : 0);
    this.breakArmour(f, clamp(want - f.broken, 0, heavy ? 3 : 2), dir, side, heavy ? 7 : 4.5);
    if (dir) f.vel.addScaledVector(dir, knock * 3.2 * (c2?.armoured ? 0.3 : 1));
    if (c2) { C2.afterBossHit(this, f, dir); return; } /* combat2: a boss staggers only through its poise bar, never flinches mid-blow */
    if (f.state === 'frozen') return;
    if (knockdown && (f.poise <= 0 || exposed) && !f.def.armor && !f.boss) { this.knockDown(f, dir, 7); return; }
    if (f.poise <= 0 && !exposed) { this.staggerFoe(f, dir); return; }
    /* a foe that has begun a blow finishes it unless its poise breaks: trading hits is a risk */
    const hyper = f.def.armor || (f.state === 'attack' && (f.atk?.def.hyper || (f.def.id !== 'minion' && f.atk.clipT > f.atk.def.hits[0] * 0.45)));
    if (!hyper && f.state !== 'stagger' && f.state !== 'down' && f.state !== 'getup') {
      this.releaseToken(f); f.state = 'hit'; f.t = 0; f.atk = null; f.hitFlip = !f.hitFlip;
      /* Hit_Chest / Hit_Head double the body forward, into the lens (a bow toward the hero); the blow cancels the
         move into the stance and react.js throws the chest and head back along the blow */
      if (this.react) f.actor.play(f.def.blocks ? 'Idle_Shield_Loop' : f.def.id === 'minion' ? 'Zombie_Idle_Loop' : 'Sword_Idle', { fade: 0.08 });
      else f.actor.play(side === 'H' || f.hitFlip ? 'Hit_Head' : 'Hit_Chest', { loop: false, fade: 0.04, restart: true });
      f.cd = Math.max(f.cd, 0.45);
      if (f.group.tactic === 'guard') f.counter = true;
    }
  }

  breakArmour(f, count, dir, side, force) {
    for (let n = 0; n < count && f.broken < f.order.length; n++) {
      /* the blow takes the piece on the side it lands on first */
      let i = f.order.findIndex((p) => !f.gonePart?.has(p) && (side === 'H' ? /^Helm|Hood/.test(p) : side === 'L' ? /L$/.test(p) : side === 'R' ? /R$/.test(p) : true));
      if (i < 0) i = f.order.findIndex((p) => !f.gonePart?.has(p));
      if (i < 0) return;
      const part = f.order[i]; (f.gonePart ||= new Set()).add(part); f.broken++;
      this.throwPieces(f.actor.breakPart(part), dir, force, f.pos);
      this.stats.breaks++; sfx('breakPart');
      if (/^Helm|Hood/.test(part)) { f.actor.eyes(11); this.embers(V(f.pos.x, 2.1 * f.scale, f.pos.z), f.eye, 8); }
    }
  }
  /* outside the dark world a broken piece never falls as a black shard: a near-black material takes the land's earth tone */
  worldTone(m) {
    if (!this.kit.id || this.kit.id === 'dark') return;
    m.traverse?.((o) => { const mt = o.material; if (!mt || !mt.color || Array.isArray(mt)) return; const c = mt.color; if (c.r + c.g + c.b < 0.12 && !mt.userData?.toned) { o.material = mt.clone(); o.material.color.setHex(0x6a5846); o.material.userData = { toned: true }; if (o.material.emissive) o.material.emissive.setHex(0); } });
  }
  throwPieces(pieces, dir, force, origin) {
    for (const m of pieces) {
      this.world.scene.add(m); this.worldTone(m);
      const out = V(m.position.x - origin.x, 0, m.position.z - origin.z).normalize();
      const v = out.multiplyScalar(rand(0.6, 2)); if (dir) v.addScaledVector(dir, force * rand(0.35, 0.8)); v.y = rand(0.9, 2.4) * (force / 5);
      m.geometry.computeBoundingSphere();
      this.debris.push({ m, v, w: V(rand(-3.5, 3.5), rand(-3.5, 3.5), rand(-3.5, 3.5)), r: Math.max(0.06, m.geometry.boundingSphere.radius * 0.45), t: 0, rest: false, hits: 0 });
    }
    while (this.debris.length > 90) { const d = this.debris.shift(); d.m.removeFromParent(); d.stain?.removeFromParent(); if (!d.group) d.m.geometry.dispose(); }
  }
  /* one shared disc and material for every stain (no new program per stain) */
  stainAt(d, gy) {
    if (d.stain) return;
    /* a world names its stain (worldMod().stain: a colour, or null for none; storybook = a soft petal tint) */
    const wst = worldMod()?.stain; if (wst === null || wst === false) return;
    /* a soft, broken, fading stain from the fx decals (a flat jittered polygon read as brown squares); storybook leaves no mark at all */
    if (this.powers) { const stub = (off) => ({ userData: { s: 1 }, scale: { setScalar() {} }, removeFromParent: off }); if (this.kit?.id === 'storybook') { d.stain = stub(() => {}); return; } const dk = this.powers.decals.add({ kind: 'splat', x: d.m.position.x, z: d.m.position.z, y: gy, size: rand(0.35, 0.55), len: rand(0.5, 0.8), color: wst ?? 0x2a0806, glow: 1, alpha: 0.7, life: 8, fade: 0.4 }); d.stain = stub(() => this.powers?.decals.remove(dk)); return; }
    if (!this.stainKit) { const g = new THREE.CircleGeometry(1, 14); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 1; i < p.count; i++) { const k = 0.75 + Math.random() * 0.4; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } this.stainKit = { g, m: new THREE.MeshBasicMaterial({ color: wst ?? 0x1e0504, transparent: true, opacity: wst == null ? 0.75 : 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) }; this.listeners.push(() => { this.stainKit.g.dispose(); this.stainKit.m.dispose(); }); }
    const st = new THREE.Mesh(this.stainKit.g, this.stainKit.m); const s = rand(0.3, 0.55); st.userData.s = s; st.scale.setScalar(s); st.rotation.y = rand(0, 6.28);
    st.position.set(d.m.position.x, gy + 0.025, d.m.position.z); st.renderOrder = 1; this.world.scene.add(st); d.stain = st;
  }
  updateDebris(dt) {
    for (const d of this.debris) {
      d.t += dt;
      if (!d.rest) {
        d.v.y -= 26 * dt; d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
        /* rest on the real ground of the land (hills and hollows), not on y = 0 */
        const gfn = this.world.scene.userData.groundAt; let gy = 0; if (gfn) { try { gy = gfn(d.m.position.x, d.m.position.z) || 0; } catch { gy = 0; } }
        if (d.m.position.y < gy + d.r) {
          d.m.position.y = gy + d.r; d.hits++;
          if (Math.abs(d.v.y) > 2 && this.clock - this.lastDrop > 0.07) { this.lastDrop = this.clock; sfx('drop'); }
          /* a limb thuds and stops (low bounce, the spin dies), and leaves a dark stain where it lies */
          d.v.y *= -0.15; d.v.x *= 0.35; d.v.z *= 0.35; d.w.multiplyScalar(0.2);
          /* a dropped weapon (grip at the origin, shaft along +y) tips over and lies flat on the ground: it
             never comes to rest standing on its pommel  */
          if (d.flat && !d.flatQ) {
            /* its thinnest local axis turns to face up (a blade lies on its flat, a shield on its face, a baton on its side) */
            const q0 = d.m.quaternion.clone(); const p0 = d.m.position.clone(); const s0 = d.m.scale.clone(); d.m.quaternion.identity(); d.m.position.set(0, 0, 0); d.m.updateMatrixWorld(true);
            const sz = new THREE.Box3().setFromObject(d.m).getSize(V()); d.m.quaternion.copy(q0); d.m.position.copy(p0); d.m.scale.copy(s0); d.m.updateMatrixWorld(true);
            const ax = sz.x <= sz.y && sz.x <= sz.z ? V(1, 0, 0) : sz.y <= sz.z ? V(0, 1, 0) : V(0, 0, 1); const thin = ax.applyQuaternion(q0); const up = V(0, thin.y >= 0 ? 1 : -1, 0);
            d.flatQ = new THREE.Quaternion().setFromUnitVectors(thin, up).multiply(q0); d.flatH = Math.min(sz.x, sz.y, sz.z) * 0.5 + 0.01; d.w.set(0, 0, 0); d.r = d.flatH; d.v.y = Math.min(d.v.y, 0.6); }
          if (d.hits > 2 || d.v.lengthSq() < 0.8) { d.rest = true; d.v.set(0, 0, 0); this.stainAt(d, gy); }
        }
        const r = Math.hypot(d.m.position.x, d.m.position.z); if (r > this.arena + 6) { d.v.x *= -0.3; d.v.z *= -0.3; }
      }
      if (d.flatQ) { d.m.quaternion.slerp(d.flatQ, Math.min(1, dt * 16)); if (d.rest) { const gfn = this.world.scene.userData.groundAt; let gy = 0; if (gfn) { try { gy = gfn(d.m.position.x, d.m.position.z) || 0; } catch { gy = 0; } } d.m.position.y += (gy + (d.flatH ?? 0.035) - d.m.position.y) * Math.min(1, dt * 12); } }
      if (d.t > 9) { const s = Math.max(0, 1 - (d.t - 9) / 1.5); /* nothing lies about for 16 s */ d.m.scale.setScalar(s); if (d.stain) d.stain.scale.setScalar(d.stain.userData.s * s); if (s <= 0) { d.m.removeFromParent(); if (!d.group) d.m.geometry.dispose(); d.stain?.removeFromParent(); d.gone = true; } }
    }
    if (this.debris.some((d) => d.gone)) this.debris = this.debris.filter((d) => !d.gone);
  }

  /* a flying foe: rises out of its spawn, bobs at def.fly, wobbles where a walker would fall, and on death drops with
     sparks and stays on the ground as debris (no allocations: reuses the foe's own fields) */
  hover(f, dt) {
    const r = f.actor.root;
    if (f.state === 'dead') {
      if (!f.landed) { f.flyV -= 13 * dt; f.flyY += f.flyV * dt; if (f.flyY <= 0) { f.flyY = 0; f.landed = true; f.flyV = 0; this.sparks(V(f.pos.x, 0.2, f.pos.z), V(0, 1, 0), 0xffd27a, 18, 5); sfx('breakPart', { gain: 0.6 }); this.shake = Math.max(this.shake, 0.25); } else if (Math.random() < dt * 14) this.sparks(V(f.pos.x, f.flyY + 0.9 * f.scale, f.pos.z), V(0, -1, 0), 0xffd27a, 3, 3); }
      r.rotation.z = f.landed ? 0.5 : Math.min(0.5, r.rotation.z + dt * 2.5);
    } else {
      const want = f.state === 'spawn' ? f.fly * clamp(1 + f.t, 0, 1) : f.fly + Math.sin(this.clock * 2.1 + f.flyPh) * 0.12;
      f.flyY += (want - f.flyY) * Math.min(1, dt * 4);
      f.wobble = Math.max(0, f.wobble - dt * 1.4);
      r.rotation.z = f.wobble * 0.45 * Math.sin(this.clock * 17 + f.flyPh); r.rotation.x = f.wobble * 0.3 * Math.sin(this.clock * 13);
    }
    r.position.y += f.flyY;
  }
  staggerFoe(f, dir, note) {
    if (f.state === 'dead' || f.state === 'down') return;
    f.state = 'stagger'; f.t = 0; f.atk = null; f.blockHits = 0; f.poise = f.maxPoise; this.releaseToken(f);
    f.actor.play('Idle_Shield_Break', { loop: false, fade: 0.05, speed: 0.75, restart: true });
    if (dir) f.vel.addScaledVector(dir, 3.5);
    f.actor.eyes(2.5); sfx('stagger');
    if (note) this.hud.toast(note);
  }
  knockDown(f, dir, speed = 7) {
    if (f.state === 'dead') return;
    /* a flying foe cannot be floored: it wobbles in the air and is open like a stagger */
    if (f.fly) { f.wobble = 1; if (dir) f.vel.addScaledVector(dir, speed * 0.6); this.staggerFoe(f, dir); return; }
    f.state = 'down'; f.t = 0; f.atk = null; f.poise = f.maxPoise; this.releaseToken(f); this.stats.knockdowns++;
    if (dir) { f.vel.copy(dir).multiplyScalar(speed); f.yaw = Math.atan2(-dir.x, -dir.z); }
    f.actor.play('Hit_Knockback', { loop: false, fade: 0.05, restart: true }); f.flat = false;
    f.actor.eyes(2.5); f.bowled = new Set();
    this.director.event(`The hero knocks a ${f.def.label} to the ground.`);
  }

  /* One ability per element. Code runs it; the kit names it. */
  castAbility() {
    if (this.powers) { this.powers.cast(); return; } /* web/src/powers.js; the code below is the fallback */
    if (this.over || this.abilityCd > 0 || this.stagger > 0) return;
    const el = this.element; const fwd = this.forward();
    const live = this.foes.filter((f) => f.state !== 'dead' && f.state !== 'spawn').map((f) => ({ f, d: f.pos.distanceTo(this.pos), to: V().subVectors(f.pos, this.pos).setY(0).normalize() })).sort((a, b) => a.d - b.d);
    let hit = 0;
    if (el.id === 'fire') {
      for (const { f, d, to } of live) if (d < 8 && to.dot(fwd) > 0.5) { this.damageFoe(f, 4 * this.power, to, { knock: 1.6, poise: 4, color: el.color }); hit++; }
      this.cone(fwd, el.color);
    } else if (el.id === 'frost') {
      for (const { f, d, to } of live) if (d < 7) { this.damageFoe(f, 1, to, { knock: 0.2, poise: 0, color: el.color }); if (f.state !== 'dead') { this.releaseToken(f); f.state = 'frozen'; f.t = 0; f.atk = null; f.actor.flash(el.color, 2600, 0.03); } hit++; }
      this.ring(el.color);
    } else if (el.id === 'storm') {
      const chain = live.filter((x) => x.d < 12).slice(0, 4); let from = this.pos.clone().setY(1.5);
      for (const { f, to } of chain) { const at = f.pos.clone().setY(1.4); this.bolt(from, at, el.color); from = at; this.damageFoe(f, 3 * this.power, to, { knock: 0.6, poise: 6, color: el.color }); hit++; }
    } else if (el.id === 'shadow') {
      const t = live.find((x) => x.d < 14);
      if (t) {
        this.embers(this.pos.clone().setY(1.2), el.color, 30);
        this.pos.copy(t.f.pos).addScaledVector(t.to, 2.1);
        if (this.pos.length() > this.arena) this.pos.setLength(this.arena);
        this.yaw = this.yawTo(t.f.pos);
        this.invuln = 0.6; this.crit = 1.6;
        this.damageFoe(t.f, this.weapon.damage * this.power * 2, V().subVectors(t.f.pos, this.pos).setY(0).normalize(), { knock: 1.4, heavy: true, poise: 9, color: el.color }); hit++;
      }
    }
    if (this.boss) { const h = this.boss.hittable().sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos))[0]; if (h && h.pos.distanceTo(this.pos) < 12) { this.boss.damage(h.id, 6 * this.power, V().subVectors(h.pos, this.pos).setY(0).normalize(), { heavy: true, crit: false }); hit++; } }
    this.abilityCd = this.abilityMax; this.stats.abilities++;
    this.world.flash(0.55); this.world.kick(0.18); this.shake = Math.max(this.shake, 0.7); sfx('forge');
    this.hud.toast(el.ability);
    this.director.event(`The hero uses ${el.ability} and hits ${hit} enem${hit === 1 ? 'y' : 'ies'}.`);
  }

  killFoe(f, { dir = null, execute = false, at = null, side = 'C', heavy = false } = {}) {
    if (f.state === 'dead') return;
    const wasDown = f.state === 'down' || f.state === 'getup';
    /* every body settles into the flat lying pose (LayToIdle, first frame). Death01 ends with both arms raised
       straight up, and a kill during the get-up let LayToIdle play on, so the corpse stood up. settleAt = seconds after the kill */
    f.settleAt = f.state === 'getup' ? 0 : f.state === 'down' ? (f.flat ? 0 : Math.max(0, 0.7 - f.t)) : 99; /* a standing kill holds its own fall (the clip's last frame, settled by react.js), never LayToIdle's raised arm */
    f.state = 'dead'; f.t = 0; f.atk = null; this.releaseToken(f); f.lying = wasDown;
    try { Q2.onKill(this, f, { dir }); } catch (err) { console.warn('quest kill', err); }
    /* a boss plays its own death; the fight holds the view on it and ends when it is over */
    let staged = 0;
    if (f.boss && f.dress?.onDeath) { try { staged = f.dress.onDeath(f.pos.clone()) || 0; } catch (err) { console.warn('boss death', err); } }
    if (f.boss && f.def.death) this.hud.toast(f.def.death);
    if (f.fdress?.onDeath) { try { f.fdress.onDeath(f.pos.clone()); } catch (err) { console.warn('world foe dress', err); } }
    if (staged > 0) { f.staged = true; f.vel.set(0, 0, 0); this.deathCam = { t: 0, dur: staged, foe: f }; this.hud.cinema?.(true); if (!this.vowReading()) this.hud.line?.('', '', 1); this.hud.boon?.('', ''); if (this.bossEl) this.bossEl.style.opacity = '0'; }
    /* a boss with no death of its own (Death01 on the floor) gets the same staged cut */
    else if (f.boss && !this.deathCam) { this.deathCam = { t: 0, dur: 4.6, foe: f }; this.hud.cinema?.(true); if (!this.vowReading()) this.hud.line?.('', '', 1); this.hud.boon?.('', ''); if (this.bossEl) this.bossEl.style.opacity = '0'; }
    if (f.boss && this.deathCam?.foe === f && !this.dd) { try { this.dd = new DeathDirector(this, this.deathCam); } catch (err) { console.warn('death director', err); this.dd = null; } }
    /* the body falls as one, along the blow, clear of the bodies already down (react.die picks the yaw) */
    if (!staged && !f.boss && !wasDown) { try { this.react?.die(f, dir, { execute, side, heavy }); } catch (err) { console.warn('react', err); } }
    if (staged > 0) { /* no ragdoll */ } else if (!wasDown) { f.thrown = execute; const sp = execute ? rand(0.95, 1.1) : rand(1.15, 1.45); const clip = execute ? 'Hit_Knockback' : 'Death01'; const at = execute ? 0.72 : 1.5; /* held where the body lies flat, before the clip lifts the arms */ if (this.react && f.actor.hold) f.actor.hold(clip, at, { fade: 0.06, speed: sp }); else f.actor.play(clip, { loop: false, fade: 0.06, restart: true, speed: sp }); this.react?.clipLen(f, at / sp); }
    else if (wasDown && !f.boss) this.react?.die(f, null, { lying: true }); /* a body already on the ground settles its limbs */
    if (dir && !staged) { f.vel.addScaledVector(dir, execute ? 6 : 2.2); if (!wasDown && !this.react) f.yaw = Math.atan2(-dir.x, -dir.z); }
    f.group.members = f.group.members.filter((x) => x !== f);
    if (this.lock === f) this.lock = null;
    this.stats.kills++; if (execute) this.stats.executes++; this.hud.kill?.();
    /* the body goes down whole (no burst of loose hands and boots). Only a heavy
       weapon's finishing blow knocks the helm off, one time in three: a brutal beat that matches the foe's own dress */
    const left = f.order.filter((p) => !f.gonePart?.has(p) && /^Helm_|^Hood$|Kabuto|Hat|Helm/.test(p));
    const n = staged || f.boss ? 0 : execute && /maul|great|axe|hammer|club|kanabo|sledge|tetsubo|odachi/i.test(this.weapon?.id || '') && Math.random() < 0.34 ? 1 : 0;
    for (const part of left.slice(0, n)) { (f.gonePart ||= new Set()).add(part); this.throwPieces(f.actor.breakPart(part), dir, 4.5, f.pos); }
    f.broken = f.order.length;
    for (const g of staged ? [] : f.gear) {
      g.updateWorldMatrix(true, false); const p = V(); const q = new THREE.Quaternion(); const sc = V(); g.matrixWorld.decompose(p, q, sc);
      g.removeFromParent(); g.position.copy(p); g.quaternion.copy(q); g.scale.copy(sc); this.world.scene.add(g);
      const v = V(rand(-1, 1), rand(1, 2.5), rand(-1, 1)); if (dir) v.addScaledVector(dir, 2.5);
      this.debris.push({ m: g, v, w: V(rand(-4, 4), rand(-4, 4), rand(-4, 4)), r: 0.06, t: 0, rest: false, hits: 0, group: true, flat: true }); /* a dropped weapon lies flat */
    }
    if (!staged) f.gear = [];
    if (!staged && !f.boss) { try { this.react?.killFx(f, dir, at, execute); } catch (err) { console.warn('react fx', err); } } /* the kill burst and its ground mark */
    const dead = this.foes.filter((x) => x.state === 'dead' && x !== f).sort((x, y) => y.t - x.t);
    /* no heap of bodies: at most three lie on the field; the oldest goes first */
    for (const old of dead.slice(0, Math.max(0, dead.length - 3))) old.t = Math.max(old.t, CORPSE);
    const last = this.groups.every((g) => g.members.length === 0);
    sfx(execute ? 'execute' : 'kill'); if (!f.boss) sfx('foeDie'); setTimeout(() => sfx('down'), execute ? 420 : 900);
    this.shake = Math.max(this.shake, execute ? 1 : 0.7); this.world.kick(execute ? 0.3 : 0.16);
    if (execute || last) { this.slow = last ? 0.7 : 0.4; this.hitstop = Math.max(this.hitstop, 0.12); this.world.flash(execute ? 0.2 : 0.1); }
    this.embers(V(f.pos.x, 1.4 * f.scale, f.pos.z), f.eye, execute ? 8 : 4, 2); /* fewer (they hung as motes) */
    if (execute) this.hp = Math.min(this.maxHp, this.hp + 1);
    if (!f.staged) this.soul(f); /* a staged boss death keeps its frame clear (the soul flew across the falling Tower) */
    this.director.event(`The hero kills a ${f.def.label}${execute ? ' with a finishing blow' : ''}. Hero health ${this.hp} of ${this.maxHp}.`);
  }

  /* A blow reaches the hero. `foe` needs pos, damage and def.label; a real foe also has an actor. Returns what happened. */
  takeHit(foe, atk) {
    if (this.over) return 'dodged';
    climaxHit(this, foe); /* a boss's blow in its last fifth lands in a short slow */
    const name = foe.def?.label || 'blow';
    if (this.invuln > 0) { this.stats.dodges++; this.stats.waveDodges++; this.director.event(`The hero dodges a ${name}.`); return 'dodged'; }
    { const w = this.powers?.guard(foe, atk); if (w) return w; } /* a ward turns the blow back */
    const to = V().subVectors(foe.pos, this.pos).setY(0).normalize(); const front = to.dot(this.forward()) > 0.2;
    const dmg = Math.max(1, Math.round(foe.damage * (atk.dmg || 1)));
    const at = V(this.pos.x + to.x * 0.9, EYE - 0.35, this.pos.z + to.z * 0.9);
    if (this.blocking && front && !atk.unblockable && this.clock - this.blockSince <= PARRY * this.mod.parry) {
      this.stats.parries++; this.stats.blocks++; this.stats.waveBlocks++;
      if (foe.actor) { this.staggerFoe(foe, to); foe.t = foe.c2 && C2.on(this) ? -0.2 : -0.5; } /* combat2: a parried boss reels a little shorter */
      this.slow = 0.32; this.crit = 2.2; this.clash(at, to, 0xfff0c0, 30, 9); sfx('parry'); this.world.kick(0.16); this.world.flash(0.22); this.shake = Math.max(this.shake, 0.55); this.hud.toast('Parry. Strike now');
      this.director.event(`The hero parries a ${name} and leaves it open.`);
      return 'parried';
    }
    if (this.blocking && front && !atk.unblockable) {
      this.guard = Math.max(0, this.guard - (atk.guardBreak || 1)); this.stats.blocks++; this.stats.waveBlocks++;
      sfx('deflect'); this.world.kick(0.06); this.shake = Math.max(this.shake, 0.4); this.clash(at, to, 0xffe2b0, 14, 6);
      this.vel.addScaledVector(to, -(atk.push || 1.2) * 2.2); this.vmPunch.set(0, -0.03, 0.09);
      if (this.guard <= 0) { this.stagger = 1.1; this.hud.toast('Guard broken'); sfx('stagger'); }
      this.director.event(`The hero blocks a ${name}.`);
      return 'blocked';
    }
    const taken = atk.unblockable && this.blocking && front ? Math.max(1, dmg - 1) : dmg;
    if (atk.unblockable && this.blocking && front) { this.guard = 0; this.stagger = 0.9; this.hud.toast('Guard broken'); }
    this.hp = Math.max(0, this.hp - taken); this.stats.damage += taken; this.stats.waveDamage += taken;
    sfx('hurt'); sfx(atk.blunt ? 'kick' : 'flesh'); this.world.kick(0.24); this.world.hurt = 1; this.hud.hurt();
    this.shake = Math.max(this.shake, 0.9); this.roll += (Math.random() < 0.5 ? 1 : -1) * 0.09; this.kickPitch += 0.06;
    this.vel.addScaledVector(to, -(atk.push || 1.6) * 2.4);
    if (atk.unblockable || !this.swing || this.swing.t / this.swing.dur < 0.3) { this.swing = null; this.chain = 0; this.stagger = Math.max(this.stagger, atk.unblockable ? 0.55 : 0.18); }
    this.charge = null;
    this.director.event(`A ${name} hits the hero for ${taken}. Hero health ${this.hp} of ${this.maxHp}.`);
    if (this.hp <= 0 && this.q2guard) { this.hp = 1; this.q2guard.hit = true; this.invuln = Math.max(this.invuln || 0, 3); } /* the first meeting beats the hero down, never kills */
    if (this.hp <= 0) {
      if (this.revive) {
        /* the gift of the ones they fight for: one killing blow is taken back */
        this.revive = false; this.hp = Math.ceil(this.maxHp * 0.5); this.guard = 3; this.invuln = 2.2; this.slow = 0.7; this.stagger = 0;
        this.world.flash(0.9); sfx('soul'); if (this.hud.line) this.hud.line(this.story?.rise || 'Not yet.', '', 2400); else this.hud.toast(this.story?.rise || 'Not yet.');
        for (const f of this.foes) if (f.state !== 'dead' && f.actor && f.pos.distanceTo(this.pos) < 5 && !f.boss) this.staggerFoe(f, V().subVectors(this.pos, f.pos).setY(0).normalize());
        this.embers(V(this.pos.x, 1.4, this.pos.z), 0xffc27a, 60, 5); this.hud.boon?.('', '');
        this.director.event('The hero falls and rises again.');
      } else this.finish(false);
    }
    return 'hit';
  }

  /* ---------- the quest: what the hero fights for walks beside them as small lights, until the enemy takes them ---------- */
  chapter(c) {
    if (!c) return Promise.resolve();
    if (this.hud.chapter) return this.hud.chapter(c);
    this.hud.banner(`${c.numeral} · ${c.title}`, c.line || ''); return wait(1900);
  }
  nameSprite(text) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const g = cv.getContext('2d');
    /* the world's serif and cream (game/worlds/<id>.mjs ui); dark = Playfair on warm cream */
    const ui = this.kit.id !== 'dark' ? this.kit.ui : null;
    g.font = `italic 44px ${ui?.serif || '"Playfair Display", Georgia, serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 12; g.fillStyle = ui?.cream || '#f3e3c4'; g.fillText(String(text).slice(0, 22), 256, 48);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })); sp.scale.set(1.5, 0.28, 1); if (document.body.classList.contains('touch')) sp.scale.multiplyScalar(0.8); /* a near name filled a phone screen */ sp.renderOrder = 4;
    return sp;
  }
  /* a quest with no loved one (glory: the cause is the hero's own name) made a companion that carried the hero's name
     as its label: a second "Rowan" on screen. That light walks with no label. */
  unnameHero() {
    const hero = String(this.story?.who || window.__sq?.S?.name || '').trim().toLowerCase();
    /* a cause flame ("Your name", "The far light", "The open trail": no loved one named) carries no text at all; the
       words were a placeholder floating by the lantern through the whole quest */
    const cause = !!this.story && !this.story.loved;
    for (const c of this.comp?.list || []) if ((cause || (hero && String(c.name).trim().toLowerCase() === hero)) && c.label) { c.label.visible = false; c.noLabel = true; }
  }
  async buildWisps() {
    const names = (this.story?.flames || []).slice(0, 3);
    /* the designed props and companions (web/src/questprops.js); the plain lights below are the fallback */
    try { this.QP = await import('./questprops.js'); await this.QP.preload?.(); } catch (err) { console.warn('quest props', err); this.QP = null; }
    /* a world's own quest props (web/src/props/<world>.js): chain posts, cage, beacons, markers, gate, waymarks, the cause */
    this.WP = null; if (this.kit.id && this.kit.id !== 'dark') { try { this.WP = await import(`./props/${this.kit.id}.js`); } catch (err) { console.warn('world props', err); } }
    /* the player named no one: no light follows the hero. The cause stays as logic only (state and position for the twists and chapters), never drawn. */
    if (this.story && !this.story.loved) {
      this.comp = null;
      this.wisps = names.map((name, i) => ({ name, hidden: true, sp: { position: V(this.pos.x, 1.4, this.pos.z - 2.4), scale: { setScalar() {} } }, label: { position: { set() {} }, material: { opacity: 0 } }, state: 'with', t: 0, i, flare: 0, from: V() }));
      return;
    }
    if (this.WP && names.length) {
      try {
        const { makeFolk } = await import('./props/folk.js');
        this.comp = makeFolk(this.world.scene, names, { kinds: this.story.kinds, kit: this.kit, WP: this.WP });
        this.unnameHero();
        this.wisps = this.comp.list.map((c, i) => { { const fw = this.forward(); const sd = (i % 2 ? -1 : 1) * (3 + Math.floor(i / 2) * 1.2); c.position.set(this.pos.x + fw.x * 6 - fw.z * sd, 0, this.pos.z + fw.z * 6 + fw.x * sd); } /* 6 m ahead and 3 m aside, never at the lens in the opening beat */ return { name: c.name, c, sp: { position: c.position, scale: { setScalar() {} } }, label: { position: { set() {} }, material: { opacity: 0 } }, state: 'with', t: 0, i, flare: 0, from: V() }; });
        return;
      } catch (err) { console.warn('folk', err); this.comp = null; }
    }
    if (this.QP && names.length) {
      try {
        this.comp = this.QP.makeCompanions(this.world.scene, names, { kinds: this.story.kinds, accent: this.world.biome?.accent ?? 0xb04aff, style: this.kit.companion || 'dark' });
        /* a companion body that comes to the lens dissolves like a foe (folk.js companions fade on their own) */
        for (const c of this.comp.list || []) c.traverse?.((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSprite) for (const m of Array.isArray(o.material) ? o.material : [o.material]) addNearFade(m); });
        this.unnameHero();
        this.wisps = this.comp.list.map((c, i) => { { const fw = this.forward(); const sd = (i % 2 ? -1 : 1) * (3 + Math.floor(i / 2) * 1.2); c.position.set(this.pos.x + fw.x * 6 - fw.z * sd, 0, this.pos.z + fw.z * 6 + fw.x * sd); } /* 6 m ahead and 3 m aside, never at the lens in the opening beat */ return { name: c.name, c, sp: { position: c.position, scale: { setScalar() {} } }, label: { position: { set() {} }, material: { opacity: 0 } }, state: 'with', t: 0, i, flare: 0, from: V() }; });
        return;
      } catch (err) { console.warn('companions', err); this.comp = null; }
    }
    this.wisps = names.map((name, i) => {
      const mat = new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(0xffc27a).multiplyScalar(2.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const sp = new THREE.Sprite(mat); sp.scale.setScalar(0.26); sp.renderOrder = 4;
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(0xfff4dc).multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); core.scale.setScalar(0.35); sp.add(core);
      const label = this.nameSprite(name);
      sp.position.set(this.pos.x + (i - 1) * 0.8, 1.4, this.pos.z - 2.4); this.world.scene.add(sp, label);
      return { name, sp, mat, label, state: 'with', t: 0, i, flare: 0, from: V() };
    });
  }
  updateWisps(dt) {
    if (!this.wisps.length) return;
    const fwd = this.forward(); const right = V(-fwd.z, 0, fwd.x); const n = this.wisps.length;
    /* after the walk a companion with a body walks to a point behind the hero, away from the nearest foe, on a
       slow heading (not the camera's), so it never swings round the hero when the view turns */
    let ch = null;
    if (!this.journey && this.wisps.some((w) => w.c)) {
      ch = this._compHead || (this._compHead = { a: Math.atan2(fwd.x, fwd.z) });
      let best = null; let bd = 1e9; for (const f of this.foes) { if (f.state === 'dead') continue; const d = f.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = f; } }
      if (best && bd > 0.5) { const ta = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z); let da = ta - ch.a; da = Math.atan2(Math.sin(da), Math.cos(da)); ch.a += da * Math.min(1, dt * 0.9); }
    }
    for (const w of this.wisps) {
      w.t += dt; w.flare = Math.max(0, w.flare - dt * 0.7);
      if (w.dir) continue; /* the payoff (death-director.js) walks this companion itself */
      if (ch && w.c && w.state === 'with') {
        const hx = Math.sin(ch.a); const hz = Math.cos(ch.a); const sd = (w.i % 2 ? -1 : 1) * (2.4 + Math.floor(w.i / 2) * 0.8);
        const tgt = V(this.pos.x - hx * (4.4 + w.i * 0.5) - hz * sd, 0, this.pos.z - hz * (4.4 + w.i * 0.5) + hx * sd);
        if (tgt.length() > ARENA - 1.5) tgt.setLength(ARENA - 1.5);
        const p = w.sp.position; const dx = tgt.x - p.x; const dz = tgt.z - p.z; const d = Math.hypot(dx, dz);
        const step = Math.min(d, (d > 8 ? 7 : 4.2) * clamp(d / 1.2, 0, 1) * dt); if (d > 1e-4) { p.x += (dx / d) * step; p.z += (dz / d) * step; } p.y += (0 - p.y) * Math.min(1, dt * 3.2);
        w.sp.scale.setScalar(0.26); w.label.position.set(p.x, p.y - 0.34, p.z);
        const lo = this.clock < 9 || this.betweenWaves || this.hp <= this.maxHp * 0.35 ? 1 : 0; w.label.material.opacity += (lo - w.label.material.opacity) * Math.min(1, dt * 3);
        if (w.c.state !== 'with') { try { w.c.setState('with'); } catch { /* unknown state */ } }
        continue;
      }
      const p = w.sp.position; let size = 0.26; let labelOn = 0;
      if (w.state === 'with' || w.state === 'return') {
        /* they keep to the edge of the view, a little ahead: with the hero, never in the way of a blow */
        const side = (w.i % 2 ? -1 : 1) * ((w.c ? 2.7 : 1.5) + Math.floor(w.i / 2) * 0.7 + (n === 1 ? 0.2 : 0));
        const tgt = V().copy(this.pos).addScaledVector(fwd, (w.c ? 5.6 : 3.0) + w.i * 0.35).addScaledVector(right, side);
        /* on the walk to the far light the first light drifts ahead toward the next thing to find */
        if (this.journey) this.journey.lead(tgt, this.clock, w);
        tgt.y = (this.journey ? this.journey.gy(tgt.x, tgt.z) : 0) + (w.c ? 0 : 1.25 + Math.sin(this.clock * 1.7 + w.i * 2.1) * 0.14 + (this.hp <= this.maxHp * 0.35 ? 0.25 : 0));
        p.lerp(tgt, Math.min(1, dt * (w.state === 'return' ? 1.6 : 3.2)));
        labelOn = w.state === 'with' ? (this.clock < 9 || this.betweenWaves || this.hp <= this.maxHp * 0.35 ? 1 : 0) : (p.distanceTo(tgt) < 6 ? 1 : 0);
        if (w.state === 'return') size = 0.45;
      } else if (w.state === 'taking') {
        /* dragged up and away, to the enemy on the horizon */
        const k = clamp(w.t / 3.4, 0, 1); const e = k * k * (3 - 2 * k);
        p.lerpVectors(w.from, HORIZON, e); p.y += Math.sin(k * Math.PI) * 7; p.x += Math.sin(k * 9 + w.i * 2) * (1 - k) * 0.8;
        size = 0.5 + e * 2.6; labelOn = k < 0.5 ? 1 : 0;
        if (!w.hidden && Math.random() < 0.6) this.points(1, 0xffc27a, 0.6, 0.05, () => ({ p: p.clone(), v: V(rand(-0.4, 0.4), rand(-1.2, -0.2), rand(-0.4, 0.4)) }));
        if (k >= 1) { w.state = 'held'; w.t = 0; }
      } else if (w.state === 'hearth' && this.hearth) {
        if (w.c) { let a = 0.7 + w.i * (Math.PI * 2 / Math.max(3, n)); const H = this.hearth.pos;
          /* a companion at the fire never stands in the lens: a spot within 2.6 m of the hero moves to the far side
             of the fire (away from the hero, spread by its index) */
          if (Math.hypot(H.x + Math.cos(a) * 2.3 - this.pos.x, H.z + Math.sin(a) * 2.3 - this.pos.z) < 2.6) a = Math.atan2(H.z - this.pos.z, H.x - this.pos.x) + (w.i - (n - 1) / 2) * 0.7;
          p.lerp(V(H.x + Math.cos(a) * 2.3, 0, H.z + Math.sin(a) * 2.3), Math.min(1, dt * 2.5)); }
        else { const a = this.clock * 0.9 + w.i * (Math.PI * 2 / n); p.lerp(V(this.hearth.pos.x + Math.cos(a) * 0.9, 1.9 + Math.sin(this.clock * 2 + w.i) * 0.15, this.hearth.pos.z + Math.sin(a) * 0.9), Math.min(1, dt * 2.5)); } labelOn = 1;
      } else if (w.state === 'held') {
        p.set(HORIZON.x + Math.cos(this.clock * 0.5 + w.i * 2.1) * 3, HORIZON.y + Math.sin(this.clock * 0.8 + w.i) * 1.5, HORIZON.z); size = 2.2 + Math.sin(this.clock * 3 + w.i) * 0.5;
      } else if (w.state === 'boss') {
        /* held above the fight, out of reach */
        const a = this.clock * 0.35 + w.i * (Math.PI * 2 / n); const tgt = V(Math.cos(a) * 4.5, 9.5 + Math.sin(this.clock * 1.3 + w.i) * 0.4, Math.sin(a) * 4.5 - 2);
        p.lerp(tgt, Math.min(1, dt * 0.9)); size = 0.75 + w.flare * 0.9;
      }
      w.sp.scale.setScalar(size * (1 + Math.sin(this.clock * 6.3 + w.i * 1.7) * 0.07));
      w.label.position.set(p.x, p.y - 0.34, p.z); w.label.material.opacity += (labelOn - w.label.material.opacity) * Math.min(1, dt * 3);
      if (w.c) { const st = w.state === 'taking' ? 'taken' : w.state; if (w.c.state !== st) { try { w.c.setState(st); } catch { /* unknown state */ } } }
    }
    try { this.comp?.update(dt, this.clock, this.world.camera); } catch (err) { console.warn('companions', err); this.comp = null; }
    this.labelFloor();
  }
  /* a companion's name tag never shrinks below about 30 px of sprite (15 px of text) on screen: at range a world-sized
     tag read as an 8 px smudge. The module's own scale is kept; the floor multiplies it. */
  labelFloor() {
    const cam = this.world.camera; const H = window.innerHeight || 720; const tanH = Math.tan((cam.fov * Math.PI) / 360);
    const own = this._labOwn || (this._labOwn = new WeakMap()); const _p = this._lp || (this._lp = V()); const _s = this._ls || (this._ls = V());
    for (const c of this.comp?.list || []) {
      const L = c.label; if (!L || c.noLabel || !L.parent) continue;
      /* a name tag waits while a title, a chapter card or a cinema shot is on, and while a live foe stands in
         front of its companion on the same line of sight (a "Ash" tag read as the foe's name) */
      if (this.tagHidden(L, c)) { L.visible = false; continue; } L.visible = true;
      let o = own.get(L); if (!o || L.scale.x !== o.wx || L.scale.y !== o.wy) { o = { sx: L.scale.x, sy: L.scale.y, wx: 0, wy: 0 }; own.set(L, o); }
      L.parent.updateWorldMatrix(true, false); _s.setFromMatrixScale(L.parent.matrixWorld); _p.setFromMatrixPosition(L.parent.matrixWorld).add(L.position);
      const d = Math.max(0.5, _p.distanceTo(cam.position)); const px = (o.sy * _s.y * H) / (2 * d * tanH);
      const m = clamp(48 / Math.max(px, 1e-3), 1, 6); /* the floor is 48 px of sprite, about 22 px of text (was 30 px, 14 px) */
      L.scale.set(o.sx * m, o.sy * m, 1); o.wx = L.scale.x; o.wy = L.scale.y;
    }
    /* two tags never overlap ("Junifliam"): the nearer companion keeps its tag, the farther one waits */
    const shown = []; for (const c of this.comp?.list || []) { const L = c.label; if (!L || !L.visible || c.noLabel || !L.parent) continue; const p = V().setFromMatrixPosition(L.parent.matrixWorld).add(L.position); const d = p.distanceTo(cam.position); p.project(cam); shown.push({ L, d, x: p.x * innerWidth / 2, y: p.y * innerHeight / 2 }); }
    shown.sort((a, b) => a.d - b.d);
    for (let i = 0; i < shown.length; i++) for (let j = 0; j < i; j++) { const A = shown[j]; const B = shown[i]; if (A.L.visible && Math.abs(A.x - B.x) < 110 && Math.abs(A.y - B.y) < 26) { B.L.visible = false; break; } }
  }
  tagHidden(L, c) {
    const bc = document.body.classList; if (bc.contains('chap') || bc.contains('cine') || bc.contains('titling')) return true;
    if (this.near && c && this.near.tagBlocked(c, L)) return true; /* named figure hidden, at the elbow, off screen, behind a wall or a body, or the tag on the HUD, a caption or the foe plate */
    const cam = this.world.camera; const p = (this._tagP || (this._tagP = V())).setFromMatrixPosition(L.parent.matrixWorld).add(L.position);
    const dC = p.distanceTo(cam.position); p.project(cam); if (p.z > 1 || Math.abs(p.x) > 0.94 || Math.abs(p.y) > 0.92) return true; /* a tag whose companion is off screen is hidden (a clipped "Ta" sat at the edge) */
    const q = this._tagQ || (this._tagQ = V());
    for (const f of this.foes) {
      if (f.state === 'dead' || f.boss || !f.pos) continue;
      q.set(f.pos.x, (f.footY ?? f.pos.y ?? 0) + 1.2 * (f.scale || 1), f.pos.z); const dF = q.distanceTo(cam.position); if (dF >= dC) continue;
      q.project(cam); if (Math.abs(q.x - p.x) * innerWidth < 70 && Math.abs(q.y - p.y) * innerHeight < 110) return true;
    }
    return false;
  }
  /* Chapter II opens: the enemy takes what the hero fights for. */
  async theTaking() {
    if (!this.story || this.taken || this.over) return;
    this.taken = true; this.stage = 2; this.betweenWaves = true;
    this.hud.cinema?.(true);
    this.cineLook = HORIZON; sfx('roar'); this.shake = Math.max(this.shake, 0.7); this.world.flash(0.4); this.world.setTone?.(1);
    for (const w of this.wisps) { w.state = 'taking'; w.t = -w.i * 0.25; w.from.copy(w.sp.position); }
    this.director.event(`${this.story.enemy} takes ${this.story.taken}.`);
    if (this.inSecond && this.hud.line) { this.hud.line(this.story.taking.line, this.story.taking.sub, 3400); await wait(3600); }
    else { await this.chapter(this.story.taking); if (this.hud.line) { this.hud.line(this.story.taking.line, this.story.taking.sub, 2400); await wait(1500); } else await wait(900); }
    this.cineLook = null; this.hud.cinema?.(false);
  }
  /* ---------- chapter I: the opening, by the shape of the quest ---------- */
  /* the dark around the hero: drawn by the renderer when it can; a page overlay is the fallback (endTask and stop remove both) */
  /* a day world (a daylight land, or a world torch under 0.3, or worldMod().day) keeps its day: the chapter dark is
     held to a dusk (0.3), so the land never flips from day to night and back */
  dayWorld() { if (this._day == null) { const lk = LAND_LOOK?.[this.world.biome?.id]; this._day = !!(worldMod()?.day ?? (lk?.torch === false || (this.kit.torch?.power ?? 1) < 0.3)); } return this._day; }
  darkness(k, r = 9) {
    if (this.dayWorld()) k = Math.min(k, 0.3);
    if (this.world.setDark) { this.world.setDark(clamp(k, 0, 1), r); return; }
    if (!this.darkEl && k > 0) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;transition:opacity 1.6s;background:radial-gradient(circle at 50% 55%, rgba(0,0,0,0) 14%, rgba(0,0,0,0.9) 46%, rgba(0,0,0,0.97) 70%)'; document.body.appendChild(d); this.darkEl = d; }
    if (this.darkEl) this.darkEl.style.opacity = String(clamp(k, 0, 1));
  }
  async opening() {
    const st = this.story; const first = st.first || {}; const shape = st.shape;
    /* chapter I on the open land (web/src/journey.js): every shape has its own walk; a failed load falls back to the old fight */
    if (first.journey) { try { const { startJourney } = await import('./journey.js'); await startJourney(this); return; } catch (err) { console.warn('journey', err); this.journey = null; this.arena = ARENA; this.footY = 0; this.pace = 1; this.task = null; } }
    if (shape === 'vigil' || !first.goal) { await this.spawnWave('first'); return; }
    const fwd = this.forward(); const a0 = Math.atan2(fwd.x, fwd.z);
    const at = (ang, r) => { const p = V(this.pos.x + Math.sin(ang) * r, 0, this.pos.z + Math.cos(ang) * r); if (p.length() > ARENA - 1) p.setLength(ARENA - 1); return p; };
    const live = () => this.foes.filter((f) => f.state !== 'dead' && !f.boss).length;
    const set = this.taskUi(first.goal);
    /* a line waits for the wave banner to go */
    const say = (t, sub = '') => { if (t) setTimeout(() => { if (!this.over) this.hud.line?.(t, sub, 2600); }, Math.max(0, ((this.bannerAt ?? -9) + 2.5 - this.clock) * 1000)); };
    /* the chapter ends when its task is done and the field is clear; endWave then opens chapter II */
    const close = () => { if (!this.task) return; this.endTask(); };
    this.task = { update() {} };
    if (shape === 'hunt') {
      /* one scout runs for the far side; run it down, then the pack it warned comes */
      const base = byId(this.kit.FOES, 'rogue'); const def = { ...base, hp: Math.round(base.hp * 1.5), label: `${this.minions?.one || 'Hollow'} Scout`, own: true };
      await this.spawnWave(null, { label: first.goal, spec: [['rogue', 1, { def, place: () => at(a0, 7.5) }]] });
      const scout = this.foes.find((f) => f.def === def); let stamina = 7; let pack = false;
      this.task = { update: (dt) => {
        if (!pack) {
          if (!scout || scout.state === 'dead') { pack = true; say(first.after); this.spawnWave(null, { quiet: true, spec: [['rogue', 3], ['minion', 2]] }); return; }
          const d = Math.hypot(scout.pos.x - this.pos.x, scout.pos.z - this.pos.z);
          scout.flee = stamina > 0 && d < 7 && scout.hp > scout.maxHp * 0.35; if (scout.flee) stamina -= dt;
          set(scout.flee ? 'It runs' : stamina > 0 ? def.label : 'It cannot run now', scout.hp / scout.maxHp);
        } else if (this.cleared()) close(); else set(first.after, 0);
      } };
    } else if (shape === 'trial') {
      /* a duel at the gate: the captain alone; the rest stand in a ring and come only when it falls */
      const base = byId(this.kit.FOES, 'warrior'); const def = { ...base, label: 'Captain of the Gate', own: true };
      await this.spawnWave(null, { label: first.goal, spec: [['warrior', 1, { def, captain: true, place: () => at(a0, 6.5) }], ['minion', 4, { hold: true, place: (i) => at(a0 + (i + 1) * (Math.PI * 2 / 5), 9.5) }]] });
      const cpt = this.foes.find((f) => f.def === def); let free = false;
      say(first.say, def.label);
      this.task = { update: () => {
        if (!free) {
          if (cpt && cpt.state !== 'dead') { set(def.label, cpt.hp / cpt.maxHp); return; }
          free = true; for (const f of this.foes) f.hold = false; say(first.after); sfx('roar');
        }
        if (this.cleared()) close(); else set(first.after, 0);
      } };
    } else if (shape === 'chains') {
      /* a full ring close around the hero; when it breaks, more come from one side */
      const ring = (k) => at(a0 + k * (Math.PI / 3), 4.6);
      await this.spawnWave(null, { label: first.goal, spec: [['minion', 4, { place: (i) => ring([0, 1, 3, 4][i]) }], ['warrior', 1, { place: () => ring(2) }], ['rogue', 1, { place: () => ring(5) }]] });
      const k0 = this.stats.kills; let more = false; const side = a0 + Math.PI / 2;
      this.task = { update: () => {
        const down = this.stats.kills - k0;
        if (!more) {
          set(`${Math.min(6, down)} of 6 down`, down / 6);
          if (live() <= 2 && !this.spawning) { more = true; say(first.after); this.spawnWave(null, { quiet: true, spec: [['warrior', 1, { captain: true, place: () => at(side, 12) }], ['minion', 2, { place: (i) => at(side + (i - 0.5) * 0.5, 12.5) }]] }); }
        } else if (this.cleared()) close(); else set(first.after, 1);
      } };
    } else {
      /* the last light: the dark closes in; they come out of it in small groups */
      this.darkness(0.9, 7);
      const groupAt = () => { const a = a0 + rand(-2.6, 2.6); return [['rogue', 1, { place: () => at(a, 11) }], ['minion', 1, { place: () => at(a + 0.35, 11.5) }]]; };
      await this.spawnWave(null, { label: first.goal, spec: groupAt() });
      let sent = 1; const N = 3;
      this.task = { update: () => {
        set(`${Math.max(0, N - sent)} more in the dark`, sent / N);
        if (sent < N && live() <= 1 && !this.spawning) { sent++; this.spawnWave(null, { quiet: true, spec: groupAt() }); sfx('spawn'); }
        else if (sent >= N && this.cleared()) close(); /* the light coming back says it; a line here would sit over the chapter II card */
      } };
    }
  }

  /* ---------- chapter III: one twist in the last fight, by the shape; it works for the dragon and the foe bosses ---------- */
  vowReading() { return !!this.vowSaidAt && performance.now() - this.vowSaidAt < 3600; } /* the boss's vow echo (at 45 % health) is still inside its reading time: the death cut never wipes it */
  bossFrac() { return this.boss ? this.boss.hp / this.boss.maxHp : this.bossFoe ? this.bossFoe.hp / this.bossFoe.maxHp : 1; }
  /* heal (k > 0) or wear (k < 0) the boss by a part of its health; never kills */
  bossMend(k) {
    const b = this.boss;
    if (b && !b.dead && typeof b._hp === 'number') b._hp = clamp(b._hp + b._max * k, 1, b._max);
    const f = this.bossFoe; if (f && f.state !== 'dead') f.hp = clamp(f.hp + f.maxHp * k, 1, f.maxHp);
  }
  bossPoint(out) {
    const f = this.bossFoe; if (f && f.state !== 'dead') return out.set(f.pos.x, 1.6 * f.scale, f.pos.z);
    const p = this.boss && !this.boss.dead ? this.boss.focus?.() : null; return p ? out.copy(p) : null;
  }
  setupTwist() {
    const st = this.story; const tw = st?.twist; if (!tw || this.twistFn) return;
    this.twistId = tw.id;
    const fwd = this.forward(); const right = V(-fwd.z, 0, fwd.x);
    const spot = (f, r) => { const p = V().copy(this.pos).addScaledVector(fwd, f).addScaledVector(right, r); if (p.length() > ARENA - 2.5) p.setLength(ARENA - 2.5); return p; };
    const line = (t, sub = '', ms = 3000) => { if (t) { this.hud.line?.(t, sub, ms); this.twistSaid = this.clock; } };
    const words = this.enemyWords ? `“${this.enemyWords}”` : '';
    const sub = (t) => { const em = this.bossEl?.querySelector('em'); if (em && em.textContent !== t) em.textContent = t; };
    let fired = false;
    let own = false; try { own = CHAP.twist(this, { tw, spot, line, sub, words }); } catch (err) { console.warn('twist chapters', err); } /* web/src/chapters.js; false = the shape's own twist below */
    if (own) { /* chapters.js set twistFn */ } else if (st.shape === 'vigil') {
      if (!this.taken && this.wisps.length) {
        /* they keep a fire at the edge of the field; by it the hero heals */
        /* the fire stands ahead and to the side (it stood behind the hero, and "They keep the fire. Stand by
           it." showed over an empty field); the view turns to it as the line shows */
        const p = spot(4.5, -6); const old = (this.props || []).find((q) => q.kind === 'fire' && !q.gone && q.h); if (old) { old.done = false; old.hp = 100; if (old.args) { old.args.hp = 1; old.args.away = false; old.args.threatened = false; } } const fire = old || this.addProp('fire', p.x, p.z, 100); /* the fire of chapter II, if it still burns (two fires stood on the field) */ this.hearth = fire; for (const w of this.wisps) w.state = 'hearth';
        let acc = 0; setTimeout(() => { line(tw.kept); let gt = 0; const off = this.world.addUpdater((dt) => { gt += dt; if (gt > 1.6 || this.over || this.lock) { off(); return; } this.turnToward(fire.pos, Math.min(1, dt * 3 * Math.sin(Math.PI * gt / 1.6) + dt)); }); }, 1800);
        this.twistFn = (dt) => {
          if (fire.args) { fire.args.hp = 1; fire.args.away = false; fire.args.threatened = false; }
          const near = Math.hypot(this.pos.x - fire.pos.x, this.pos.z - fire.pos.z) < 6.5;
          if (near && this.hp < this.maxHp) { acc += dt * 0.5; if (acc >= 1) { acc -= 1; this.hp = Math.min(this.maxHp, this.hp + 1); } }
        };
      } else if (this.taken && this.wisps.length) {
        /* at half health the lights break free and come back */
        this.twistFn = (dt, hp) => {
          if (fired || hp >= 0.5) return; fired = true;
          for (const w of this.wisps) { w.state = 'return'; w.t = 0; w.flare = 1; }
          this.hp = Math.min(this.maxHp, this.hp + Math.ceil(this.maxHp * 0.3)); this.world.flash(0.35); sfx('soul'); line(tw.freed);
        };
      }
    } else if (st.shape === 'hunt') {
      /* below 45%: marked; it takes more from each blow, and calls one pack */
      this.twistFn = (dt, hp) => {
        if (fired || hp >= 0.45) return; fired = true; this.bossMul = 1.5;
        const span = this.bossEl?.querySelector('span'); if (span) span.textContent = `${span.textContent} · Marked`;
        const b = this.bossPoint(V()); if (b) this.embers(b, 0xff3a22, 50, 4);
        sfx('roar'); line(tw.line, tw.sub); this.spawnWave(null, { quiet: true, spec: [['rogue', 2], ['minion', 1]] });
      };
    } else if (st.shape === 'trial') {
      /* no help comes; at half health it stands up once more */
      this.noAdds = true;
      this.twistFn = (dt, hp) => {
        if (fired || hp >= 0.5) return; fired = true; this.bossMend(0.15);
        const b = this.bossPoint(V()); if (b) this.embers(b, 0xffc27a, 50, 4);
        sfx('roar'); this.shake = Math.max(this.shake, 0.6); line(tw.line, tw.sub);
      };
    } else if (st.shape === 'chains') {
      /* chained to two anchors: blows glance off until both break */
      const anchors = [-1, 1].map((k) => { const p = spot(2.5, k * 8.5); return this.addProp('anchor', p.x, p.z, Q2.anchorHp(this)); });
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.world.biome?.accent ?? 0xff4a12).multiplyScalar(2.2), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 5, 1, true); geo.translate(0, 0.5, 0);
      this.tethers = anchors.map(() => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; this.world.scene.add(m); return m; });
      /* a world whose anchor lays a real chain to the boss (worldMod().tether === false) draws no glow tether */
      const ownChain = worldMod()?.tether === false;
      const UP = V(0, 1, 0); const bp = V(); const dir = V();
      this.bossMul = 0.35; setTimeout(() => line(tw.line, tw.sub, 3200), 1600);
      this.twistFn = () => {
        let left = 0; for (const a of anchors) if (a.hp > 0) left++; const b = this.bossPoint(bp);
        for (let i = 0; i < anchors.length; i++) {
          const a = anchors[i]; const m = this.tethers[i];
          if (!b || a.hp <= 0) { m.visible = false; continue; }
          m.visible = !ownChain; m.position.set(a.pos.x, 2.5, a.pos.z); dir.subVectors(b, m.position); const len = dir.length() || 1;
          m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / len)); mat.opacity = 0.6 + Math.sin(this.clock * 6) * 0.25;
        }
        if (left > 0) sub(Q2.QN(this) ? this.ww(`Anchors ${2 - left}/2`) : this.ww(`${2 - left} of 2 anchors broken · ${tw.goal}`)); /* a short line */
        else if (!fired) { fired = true; this.bossMul = 1; sub(words); line(tw.done); sfx('breakPart'); this.world.flash(0.3); }
      };
    } else if (st.shape === 'dark') {
      /* dark around the hero; two beacons widen the light, and each one weakens it */
      const beacons = [-1, 1].map((k) => { const p = spot(1.5, k * 8); return this.addProp('beacon', p.x, p.z, 1); });
      this.darkness(0.85, 7); let hold = 0; setTimeout(() => line(tw.line, tw.sub, 3200), 1600);
      this.twistFn = (dt) => {
        let lit = 0; let near = null; for (const p of beacons) if (p.lit) lit++;
        for (const p of beacons) if (!p.lit && Math.hypot(this.pos.x - p.pos.x, this.pos.z - p.pos.z) < Math.max(2.3, this.propRad(p) + 0.7)) near = p;
        for (const p of beacons) { if (p.h) { p.args.lit = p.lit; p.args.charge = p === near ? hold / 2.4 : 0; } else p.flame.scale.setScalar(p.lit ? 1.5 + Math.sin(this.clock * 9 + p.pos.z) * 0.12 : 0.16 + Math.sin(this.clock * 4 + p.pos.x) * 0.05); }
        if (near) {
          hold += dt;
          if (hold >= 2.4) {
            hold = 0; near.lit = true; try { near.h?.light(); } catch { /* fallback beacon */ }
            sfx('forge'); this.world.flash(0.25); if (!near.h) this.embers(V(near.pos.x, 1.6, near.pos.z), 0xffc27a, 60, 4);
            this.darkness(lit + 1 >= 2 ? 0 : 0.45, lit + 1 >= 2 ? 9 : 12); this.bossMend(-0.08); this.bossMul += 0.15;
            if (lit + 1 >= 2) { sub(words); line(tw.done); }
            return;
          }
        } else hold = Math.max(0, hold - dt * 2);
        if (lit < 2) sub(near ? this.ww(`Stand by the beacon · ${Math.round(hold / 2.4 * 100)}%`) : `${lit} of 2 lit · ${tw.goal}`);
      };
    }
  }

  /* ---------- chapter II: one of five tasks, by what the hero fights for ---------- */
  /* the chapter II objective as a plain instruction with the thing on screen ("Hold the fire" -> "Stay near the
     campfire"); a goal that chapters.js set ("Guard Wren", "Hold the gate") stays */
  plainGoal(st) {
    const W = this.kit.id && this.kit.id !== 'dark' ? this.kit.words || {} : {}; const g = st.goal;
    if (st.shape === 'vigil' && !Q2.QN(this)) return `Stay near ${W.fire || 'the fire'}`; /* the new chapter II walks the companion to the fire */
    if (st.shape === 'dark' && /^Light the beacons$/.test(g)) return `Light the 3 ${W.beacon || 'beacon'}s`;
    if (st.shape === 'chains' && /^Break the chains$/.test(g)) return `Break the 3 ${W.anchor || 'anchor'}s`;
    if (st.shape === 'trial' && /^Beat the five$/.test(g)) return 'Beat 5 challengers, one at a time';
    return g;
  }
  taskUi(title) {
    const el = document.createElement('div'); el.className = 'boss-ui task-ui';
    el.innerHTML = '<span></span><em></em><i><b></b></i>'; el.querySelector('span').textContent = title;
    document.getElementById('labels').appendChild(el); this.taskEl = el; this.guideM?.cue(el); /* a new objective slides in with a tick */
    return (sub, frac) => { el.querySelector('em').textContent = sub; el.querySelector('b').style.width = `${clamp(frac, 0, 1) * 100}%`; };
  }
  endTask() { this.task = null; this.taskEl?.remove(); this.taskEl = null; for (const p of this.props || []) { if (p.h) { p.done = true; continue; } p.gone = true; p.group.removeFromParent(); } this.props = (this.props || []).filter((p) => !p.gone); if (this.darkEl) { this.darkEl.remove(); this.darkEl = null; } this.world.setDark?.(0, 9); }
  cleared() { return !this.spawning && this.groups.every((g) => g.members.length === 0); }
  /* every foe that still stands falls at once */
  purge() { for (const f of [...this.foes]) if (f.state !== 'dead' && !f.boss) this.killFoe(f, { dir: V().subVectors(f.pos, this.pos).setY(0).normalize() }); }
  /* a thing that stands on the field: an anchor, a beacon, the fire */
  addProp(kind, x, z, hp = 3) {
    if (this.QP) {
      try {
        const ac = this.world.biome?.accent ?? 0xff4a12; const n = (this.props || []).filter((q) => q.kind === kind).length;
        const ps = { ...({ frontier: { fire: 'campfire' }, edo: { fire: 'brazier' } }[this.kit.id] || {}), ...(this.kit.props || {}) }; /* Edo's words say "the brazier"; it stood the dark pyre */ /* the world's prop styles (world entry props: { fire, anchor, beacon }) */
        const WP = this.WP; const wk = kind === 'anchor' ? WP?.anchor : kind === 'beacon' ? WP?.beacon : null;
        const h = wk ? wk(this.world.scene, kind === 'anchor' ? { accent: ac, to: HORIZON.clone(), index: n } : { accent: ac, index: n }) : kind === 'fire' ? this.QP.makeBonfire(this.world.scene, { accent: 0xff7a2a, radius: 6.5, style: ps.fire || 'dark' }) : kind === 'anchor' ? this.QP.makeAnchor(this.world.scene, { accent: ac, to: HORIZON.clone(), index: n, style: ps.anchor || 'dark' }) : this.QP.makeBeacon(this.world.scene, { accent: 0xffb050, index: n, style: ps.beacon || 'dark' });
        h.group.position.set(x, 0, z);
        const q = { id: `p${this.nextId++}`, kind, pos: V(x, 0, z), hp, maxHp: hp, group: h.group, h, lit: kind !== 'beacon', t: 0, args: kind === 'fire' ? { hp: 1, threatened: false, away: false } : kind === 'beacon' ? { charge: 0, lit: false } : undefined };
        (this.props ||= []).push(q); return q;
      } catch (err) { console.warn('prop', err); }
    }
    const accent = new THREE.Color(this.world.biome?.accent ?? 0xff4a12);
    const group = new THREE.Group(); group.position.set(x, 0, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.85, metalness: 0.1 });
    const glow = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(2.2), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(kind === 'anchor' ? 0.42 : 0.5, kind === 'anchor' ? 0.62 : 0.34, kind === 'anchor' ? 2.6 : 1.1, 7), stone); base.position.y = kind === 'anchor' ? 1.3 : 0.55; base.castShadow = true; group.add(base);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(kind === 'anchor' ? accent : 0xffc27a).multiplyScalar(2.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    flame.position.y = kind === 'anchor' ? 2.8 : 1.45; flame.scale.setScalar(kind === 'beacon' ? 0.001 : 1.3); group.add(flame);
    let beam = null;
    if (kind === 'anchor') {
      /* the chain: a taut line of light from the stone to the enemy on the horizon */
      const to = V().subVectors(HORIZON, V(x, 2.8, z)); const len = to.length();
      beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 5, 1, true), glow); beam.position.copy(to.clone().multiplyScalar(0.5)).add(V(0, 2.8, 0));
      beam.quaternion.setFromUnitVectors(V(0, 1, 0), to.normalize()); group.add(beam);
    }
    if (kind === 'fire') { const ring = new THREE.Mesh(new THREE.RingGeometry(6.4, 6.55, 72), glow); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; group.add(ring); }
    this.world.scene.add(group);
    const p = { id: `p${this.nextId++}`, kind, pos: V(x, 0, z), hp, maxHp: hp, group, base, flame, beam, lit: kind !== 'beacon', t: 0 };
    (this.props ||= []).push(p); return p;
  }
  /* SQ: a bullet, bolt or arrow on a quest anchor: one point of damage, the same sparks and break as a blow */
  shotProp(p, at, dir) {
    if (!p || p.kind !== 'anchor' || p.hp <= 0) return;
    p.hp -= 1; const to = dir.clone().setY(0).normalize();
    this.sparks(at, to.clone().multiplyScalar(-1), 0xffe2b0, 18, 6); sfx(p.hp <= 0 ? 'breakPart' : 'clangBig'); this.hitstop = Math.max(this.hitstop, 0.05); this.shake = Math.max(this.shake, 0.4);
    if (p.h) { try { p.h.hit(Math.max(0, p.hp) / p.maxHp, at, to.clone().multiplyScalar(-1)); if (p.hp <= 0) { p.h.break(to.clone()); this.world.flash(0.3); this.slow = Math.max(this.slow, 0.3); } } catch (err) { console.warn(err); } }
    else if (p.hp <= 0) { p.beam.visible = false; p.flame.visible = false; p.base.scale.set(1.15, 0.35, 1.15); p.base.position.y = 0.45; this.world.flash(0.3); this.slow = Math.max(this.slow, 0.3); }
  }
  hitProps(s) {
    if (!this.props?.length) return;
    const fwd = this.forward();
    for (const p of this.props) {
      if (p.kind !== 'anchor' || p.hp <= 0 || s.hitSet.has(p.id)) continue;
      const to = V().subVectors(p.pos, this.pos).setY(0); const d = to.length(); if (d > this.weapon.reach + 0.9 || to.normalize().dot(fwd) < 0.25) continue;
      s.hitSet.add(p.id); p.hp -= s.heavy ? 2 : 1; const at = V(p.pos.x - to.x * 0.5, 1.5 + (this.journey ? this.journey.gy(p.pos.x, p.pos.z) : 0), p.pos.z - to.z * 0.5);
      this.sparks(at, to.clone().multiplyScalar(-1), 0xffe2b0, 22, 7); sfx(p.hp <= 0 ? 'breakPart' : 'clangBig'); this.hitstop = Math.max(this.hitstop, 0.07); this.shake = Math.max(this.shake, 0.5); this.world.kick(0.08);
      if (p.h) { try { p.h.hit(Math.max(0, p.hp) / p.maxHp, at, to.clone().multiplyScalar(-1)); if (p.hp <= 0) { p.h.break(to.clone()); this.world.flash(0.3); this.slow = Math.max(this.slow, 0.3); } } catch (err) { console.warn(err); } }
      else if (p.hp <= 0) { p.beam.visible = false; p.flame.visible = false; p.base.scale.set(1.15, 0.35, 1.15); p.base.position.y = 0.45; this.embers(V(p.pos.x, 1.6, p.pos.z), this.world.biome?.accent ?? 0xff4a12, 70, 5); this.world.flash(0.3); this.slow = Math.max(this.slow, 0.3); }
    }
  }
  async second(beat) {
    const st = this.story; this.stage = 2; this.betweenWaves = true; this.inSecond = true;
    /* the road home lit this fire (journey.js hands it over at the field); else a new one */
    const preFire = st.shape === 'vigil' ? (this.hearthFire && this.props?.includes(this.hearthFire) ? this.hearthFire : this.addProp('fire', 0, -2.5, 100)) : null; this.hearthFire = null;
    await this.chapter(st.second);
    if (this.over) return;
    this.wave++; this.stats.waves = this.wave; this.waveStart = this.clock;
    const set = this.taskUi(this.plainGoal(st)); const pack = WAVES[beat] ? beat : 'reinforce_thralls';
    const done = new Promise((res) => { this.taskDone = res; });
    const finish = (won) => { if (!this.task) return; this.endTask(); this.taskDone(won); };
    let t = 0; let spawnT = 6;
    const trickle = (dt, every, cap, key = 'reinforce_thralls') => { spawnT -= dt; if (spawnT <= 0 && !this.spawning && this.foes.filter((f) => f.state !== 'dead').length < cap) { spawnT = every; this.spawnWave(key, { quiet: true }); } };
    let own = false; try { own = await Q2.second(this, { set, finish, trickle, pack, preFire }); } catch (err) { console.warn('quest second', err); } /* the new chapter II; false = chapters.js */
    try { if (!own) own = await CHAP.second(this, { set, finish, trickle, pack, preFire }); } catch (err) { console.warn('chapters', err); } /* web/src/chapters.js; false = the shape's own task below */
    if (own) { /* chapters.js set this.task */ } else if (st.shape === 'vigil') {
      /* hold the fire for a minute; if it dies, the enemy takes the lights */
      const fire = preFire; for (const w of this.wisps) w.state = 'hearth';
      this.hearth = fire; await this.spawnWave(pack, { quiet: true }); const LEN = 55;
      this.task = { update: (dt) => {
        t += dt; trickle(dt, 13, 4);
        const away = Math.hypot(this.pos.x - fire.pos.x, this.pos.z - fire.pos.z) > 6.5; const near = this.foes.filter((f) => f.state !== 'dead' && f.state !== 'spawn' && Math.hypot(f.pos.x - fire.pos.x, f.pos.z - fire.pos.z) < 2.4).length;
        fire.hp -= dt * ((away ? 5 : 0) + near * 1.6); if (fire.h) { fire.args.hp = clamp(fire.hp / 100, 0, 1); fire.args.threatened = near > 0; fire.args.away = away; } else fire.flame.scale.setScalar(0.5 + 0.9 * clamp(fire.hp / 100, 0, 1) + Math.sin(this.clock * 9) * 0.06);
        /* when foes reach the fire and it is out of view, the view turns to it for about a second */
        if (near && !this._wasNear && !this.lock) { const v = V(fire.pos.x, 0.8, fire.pos.z).project(this.world.camera); if (v.z > 1 || Math.abs(v.x) > 0.8) this._fireLook = 1.1; }
        this._wasNear = near > 0; if (this._fireLook > 0) { this._fireLook -= dt; this.turnToward(fire.pos, Math.min(1, dt * 3)); }
        set(away ? this.ww('Go back inside the ring') : near ? this.ww('They are at the fire: hit them') : (() => { const n = Math.max(0, Math.ceil(LEN - t)); return `${n} s left`; })(), /* plain words for what to do */ away || near ? fire.hp / 100 : 1 - t / LEN); /* the bar runs down with the clock; while the fire is in danger (the line says so) it shows the fire's health */
        if (fire.hp <= 0) { fire.args && (fire.args.hp = 0, fire.args.away = false); try { fire.h?.die(); } catch { /* fallback fire */ } this.hearth = null; for (const w of this.wisps) w.state = 'with'; finish(false); } else if (t >= LEN) { fire.args && (fire.args.away = false, fire.args.threatened = false); try { fire.h?.flare(); } catch { /* fallback fire */ } this.hearth = null; for (const w of this.wisps) { w.state = 'with'; w.flare = 1; } this.purge(); finish(true); }
      } };
    } else if (st.shape === 'hunt') {
      /* one marked foe; it runs twice and its servants cover it */
      const base = byId(this.kit.FOES, 'warrior'); const def = { ...base, hp: Math.round(base.hp * 3.4), label: `The Marked ${this.minions?.one || String(byId(this.kit.FOES, 'minion')?.label || 'One').replace(/^Hollow /, '')}`, size: 1.2, marked: true, own: true }; /* own: its plate never reads "Captain The Marked One" */
      await this.spawnWave(null, { quiet: true, spec: [['warrior', 1, { def, captain: true }]] });
      const mark = this.foes.find((f) => f.def === def); let fled = 0;
      this.task = { update: () => {
        if (!mark || mark.state === 'dead') { if (this.cleared()) finish(true); else set('Finish the rest', 0); return; }
        const frac = mark.hp / mark.maxHp; set('', frac); /* the goal above names it; the bar needs no second name */
        if (fled < 2 && frac < (fled === 0 ? 0.66 : 0.33) && !this.spawning) {
          fled++; this.embers(V(mark.pos.x, 1.6, mark.pos.z), mark.eye, 50, 4); sfx('dodge');
          const away = V().subVectors(mark.pos, this.pos).setY(0).normalize(); mark.pos.copy(this.pos).addScaledVector(away, 12); if (mark.pos.length() > ARENA - 1) mark.pos.setLength(ARENA - 1);
          this.releaseToken(mark); mark.state = 'idle'; mark.atk = null; mark.cd = 5; this.hud.toast(`${mark.def.label} runs`); this.spawnWave(fled === 1 ? pack : 'reinforce_stalkers', { quiet: true });
        }
      } };
    } else if (st.shape === 'trial') {
      /* five challengers, one at a time, each harder */
      const order = [['minion', {}], ['rogue', {}], ['warrior', {}], ['warrior', { captain: true }], ['brute', { captain: true }]]; let n = 0; let gap = 0.2;
      this.task = { update: (dt) => {
        set(`Challenger ${Math.min(n + (this.cleared() ? 1 : 0), 5)} of 5`, n / 5 - (this.cleared() ? 0 : 0.1));
        if (!this.cleared()) return;
        gap -= dt; if (gap > 0) return;
        if (n >= 5) { finish(true); return; }
        const [type, opt] = order[n]; n++; gap = 1.1; this.hp = Math.min(this.maxHp, this.hp + 1); this.spawnWave(null, { quiet: true, spec: [[type, 1, opt]] });
      } };
    } else if (st.shape === 'chains') {
      /* three anchors chain the road; foes keep coming until they are broken */
      const a0 = Math.atan2(this.forward().x, this.forward().z); const anchors = [0, 1, 2].map((i) => { const a = a0 + (i - 1) * 1.7 + Math.PI; return this.addProp('anchor', Math.sin(a) * -10, Math.cos(a) * -10, 4); });
      await this.spawnWave(pack, { quiet: true });
      this.task = { update: (dt) => {
        const left = anchors.filter((p) => p.hp > 0).length; for (const p of anchors) if (p.hp > 0 && !p.h) p.beam.material.opacity = 0.55 + Math.sin(this.clock * 5 + p.pos.x) * 0.25;
        if (left > 0) { trickle(dt, 12, 4); set(`${3 - left} of 3 broken`, (3 - left) / 3); } else if (this.cleared()) finish(true); else set('Finish the rest', 1);
      } };
    } else {
      /* the dark: three beacons to light, and stalkers in the black */
      /* the dark is drawn by the renderer when it can, so the HUD stays readable; a page overlay is the fallback */
      let dark = null;
      if (!this.world.setDark) { dark = document.createElement('div'); dark.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;transition:opacity 1.6s;background:radial-gradient(circle at 50% 55%, rgba(0,0,0,0) 14%, rgba(0,0,0,0.9) 46%, rgba(0,0,0,0.97) 70%)'; document.body.appendChild(dark); this.darkEl = dark; }
      const setDark = (k) => { if (this.dayWorld()) k = Math.min(k, 0.3); if (this.world.setDark) this.world.setDark(clamp(k, 0, 1), 9); else if (dark) dark.style.opacity = String(k); }; setDark(1);
      const a0 = Math.atan2(this.forward().x, this.forward().z); const beacons = [0, 1, 2].map((i) => { const a = a0 + (i - 1) * 1.9; return this.addProp('beacon', this.pos.x * 0 + Math.sin(a) * 9.5, Math.cos(a) * 9.5, 1); });
      let hold = 0;
      this.task = { update: (dt) => {
        const lit = beacons.filter((p) => p.lit).length; const near = beacons.find((p) => !p.lit && Math.hypot(this.pos.x - p.pos.x, this.pos.z - p.pos.z) < Math.max(2.3, this.propRad(p) + 0.7));
        for (const p of beacons) { if (p.h) { p.args.lit = p.lit; p.args.charge = p === near ? hold / 2.4 : 0; } else if (!p.lit) p.flame.scale.setScalar(0.16 + Math.sin(this.clock * 4 + p.pos.x) * 0.05); else p.flame.scale.setScalar(1.5 + Math.sin(this.clock * 9 + p.pos.z) * 0.12); }
        if (near) { hold += dt; if (hold >= 2.4) { hold = 0; near.lit = true; try { near.h?.light(); } catch { /* fallback beacon */ } sfx('forge'); this.world.flash(0.25); if (!near.h) this.embers(V(near.pos.x, 1.6, near.pos.z), 0xffc27a, 60, 4); setDark(1 - (lit + 1) / 3.4); if (lit + 1 < 3) this.spawnWave('reinforce_stalkers', { quiet: true }); } } else hold = Math.max(0, hold - dt * 2);
        if (lit >= 3) { if (this.cleared()) finish(true); else set('Finish the rest', 1); } else set(near ? this.ww('Stand by the beacon') : `${lit} of 3 lit`, near ? hold / 2.4 : lit / 3);
      } };
      await this.spawnWave('reinforce_stalkers', { quiet: true });
    }
    this.betweenWaves = false;
    const won = await done;
    this.failedII = !won; /* a lost chapter II changes the last fight (quest2.js bossOpen) */
    this.betweenWaves = true;
    if (this.over) return;
    if (won) { this.deed = st.secondWon; if (this.hud.line) this.hud.line(st.secondWon, '', 2600); else this.hud.toast(st.secondWon); sfx('soul'); await wait(3300); }
    else { await this.theTaking(); /* the foes that guard what was taken */ this.betweenWaves = false; await new Promise((res) => { const iv = setInterval(() => { if (this.over || this.cleared()) { clearInterval(iv); res(); } }, 200); }); this.betweenWaves = true; }
    this.inSecond = false;
  }

  /* Chapter II closes at a dark camp: one question, and the answer picks the gift for the last fight. */
  async camp({ early = false } = {}) {
    if (this.over) return;
    /* the vow was made on the road (revenge): only the last card is left */
    if (this.resolve) { if (!early && this.q2early) { this.q2early = false; this.betweenWaves = true; this.stage = 3; if (this.story) await this.chapter(this.story.last); } return; }
    const bw = this.betweenWaves; this.betweenWaves = true; this.paused = true; this.keys.clear(); this.mouseBlock = false; this.held = false; this.charge = null; this.swing = null;
    /* the question card is not shown over a field of bodies: they fade and sink as it comes up */
    for (const f of this.foes) if (f.state === 'dead' && !f.staged) f.t = Math.max(f.t, CORPSE);
    let r = null;
    if (this.onCamp && this.story) { if (document.pointerLockElement) document.exitPointerLock?.(); try { r = await this.onCamp(this.taken ? { ...this.story, camp: this.story.campLost } : this.story); } catch (err) { console.warn('camp', err); } }
    this.paused = false;
    if (this.over) return;
    if (r?.resolve || this.story) this.applyResolve(r?.resolve || byId(RESOLVES, 'defiance'), r?.vow || null);
    try { await PWR.resolveMoment(this); } catch (err) { console.warn('power', err); } /* the vow's boon, before act 3; chapter III waits for it */
    if (this.over) return;
    this.director.event(this.resolve ? `Asked why they go on, the hero answers ${this.resolve.label.toLowerCase()}.` : 'The hero walks on.');
    if (early) { this.q2early = true; this.betweenWaves = bw; return; }
    this.stage = 3;
    if (this.story) await this.chapter(this.story.last);
  }
  applyResolve(res, vow) {
    if (!res) return;
    this.resolve = res; this.vow = vow;
    if (res.id === 'love') { this.revive = true; this.hp = Math.min(this.maxHp, this.hp + Math.ceil(this.maxHp * 0.4)); }
    else if (res.id === 'wrath') { this.power *= 1.3; this.abilityMax *= 0.5; this.abilityCd = Math.min(this.abilityCd, this.abilityMax); }
    else if (res.id === 'defiance') { this.mod.dodgeCd = 0.45; this.mod.dodgeCrit = true; }
    else if (res.id === 'duty') { this.mod.guardRegen = 0.55; this.mod.parry = 1.5; }
    else if (res.id === 'hope') { this.hp = this.maxHp; this.mod.regen = 0.3; }
    /* "Their light" is the dark world's phrase; elsewhere the boon of love reads plainly */
    const boon = res.plainBoon && this.kit.id && this.kit.id !== 'dark' ? res.plainBoon : res.boon;
    if (this.hud.boon) this.hud.boon(boon, res.note); else this.hud.toast(`${boon}: ${res.note}`);
  }

  /* ---------- the nemesis in person ---------- */
  async startBoss() {
    if (this.bossStarted) return; this.bossStarted = true; this.betweenWaves = true;
    const n = this.nemesis || { id: 'giant', label: 'The Giant' };
    let lostII = false; try { lostII = Q2.bossOpen(this); } catch (err) { console.warn('quest boss', err); } /* no rest before it when chapter II was lost */
    if (!lostII) this.hp = Math.min(this.maxHp, this.hp + Math.ceil(this.maxHp * 0.5)); this.guard = 3;
    if (this.world.nemesis) { this.world.nemesis.leaving = true; this.world.nemesis.t = 0; }
    if (!this.story) this.hud.banner(n.label, n.intro || (this.enemyWords ? `It wears the face of “${this.enemyWords}”` : this.ww('The end of the road')));
    this.stage = 3; for (const w of this.wisps) w.state = this.taken ? 'boss' : 'with';
    this.director.event(this.ww(`${n.label} comes down to the road in person.`));
    sfx('roar'); this.shake = Math.max(this.shake, 0.6);
    this.buildBossUi(n.label);
    /* the intro banner names the boss: the bar comes in after the banner has gone, so the title never shows twice */
    if (!this.story && this.bossEl) { const el = this.bossEl; el.classList.add('wait'); setTimeout(() => el.classList.remove('wait'), 2700); }
    /* a world nemesis (edo 'lord') runs on a mechanic (n.mech = 'twin'); dark nemeses are their own mechanic */
    let id = n.mech || n.id;
    if (id === 'dragon') {
      try {
        const { DragonBoss } = await import('./dragon.js');
        const lb = lightSet(this.world.scene); /* perf: the dragon's lights link their programs in the background (quality.js) */
        const boss = new DragonBoss({ scene: this.world.scene, camera: this.world.camera, accent: this.world.biome?.accent ?? 0xff4a12, arena: ARENA, sfx,
          player: { pos: this.pos, forward: () => this.forward(), eye: EYE, hit: (o) => this.takeHit({ pos: V().copy(this.pos).addScaledVector(o.dir || this.forward(), -3), damage: o.dmg || 2, def: { label: o.kind || 'dragon' } }, { dmg: 1, unblockable: !!o.unblockable, guardBreak: o.guardBreak || 1, push: o.push || 1.6, blunt: o.kind !== 'bite' }) },
          fx: { sparks: (...a) => this.sparks(...a), embers: (...a) => this.embers(...a), shake: (x) => { this.shake = Math.max(this.shake, x); }, flash: (x) => this.world.flash(x), slow: (x) => { this.slow = Math.max(this.slow, x); },
            debris: (m, v, w) => { this.world.scene.add(m); this.worldTone(m); m.geometry?.computeBoundingSphere?.(); this.debris.push({ m, v: v.clone(), w: (w || V()).clone(), r: Math.max(0.08, (m.geometry?.boundingSphere?.radius || 0.3) * 0.45), t: 0, rest: false, hits: 0, group: !m.geometry }); } } });
        holdNewLights(this.world.scene, lb); await boss.load(); await warmNewLights(this.world.renderer, this.world.scene, this.world.camera, lb, 3000, boss.group ? [boss.group] : []); boss.start(); this.boss = boss; this.betweenWaves = false; this.wave++; this.stats.waves = this.wave;
        this.setupTwist(); try { Q2.bossReady(this); } catch (err) { console.warn('quest boss', err); } if (C2.on(this)) C2.bossReady(this); /* combat2 */ return;
      } catch (err) { console.warn('dragon not ready, the giant comes instead', err); id = 'giant'; }
    }
    const def = id === (n.mech || n.id) ? this.kit.bossFor(n) : byId(BOSSES, id) || BOSSES[0];
    const group = { id: `g${this.nextId++}`, def, members: [], size: 1, tactic: 'charge', last: null, softStreak: 0, called: true, since: -HOLD, captain: false };
    this.groups.push(group); this.spawning = true;
    try { await this.spawnFoe(group, 0, 1); } finally { this.spawning = false; }
    this.wave++; this.stats.waves = this.wave; this.waveStart = this.clock; this.betweenWaves = false;
    this.setupTwist(); try { Q2.bossReady(this); } catch (err) { console.warn('quest boss', err); } if (C2.on(this)) C2.bossReady(this); /* combat2 */
  }
  /* a boss changes as it is worn down */
  bossPhase(f) {
    const frac = f.hp / f.maxHp; const PA = this.phaseAt || (C2.on(this) ? C2.PHASE_AT : PHASE_AT); /* each shape has its own points */ const stage = frac < PA[1] ? 2 : frac < PA[0] ? 1 : 0; /* 60 % and 30 % */
    if (stage <= (f.stage || 0)) return; f.stage = stage;
    this.bossNote(phaseLine(f, stage), 3400); sfx('roar'); /* a short line per boss that says what changes */
    if (f.state === 'idle' || (f.state === 'recover' && !(f.c2 && C2.on(this) && this.clock < f.c2.openUntil))) { f.state = 'taunt'; f.t = 0.6; f.actor.play('Spell_Simple_Shoot', { loop: false, fade: 0.1, speed: 0.6 }); } /* it rears up: the change reads */ this.shake = Math.max(this.shake, 0.7); f.actor.eyes(16);
    this.embers(V(f.pos.x, 2 * f.scale, f.pos.z), f.eye, 40, 4);
    try { f.dress?.onPhase?.(stage); } catch (err) { console.warn(err); }
    if (f.def.summons && !this.noAdds) this.summon(f);
    f.speed *= 1.12;
    if (C2.on(this)) C2.onPhase(this, f, stage); /* combat2: adds, aftershock, a quicker read */
  }
  async summon(f) {
    /* a world boss may summon another foe (def.summon = 'rogue', a flier keeps its fly) and say its own line (words.summon) */
    const def = byId(this.kit.FOES, f.def.summon || f.dress?.summon || 'minion') || byId(this.kit.FOES, 'minion');
    const group = { id: `g${this.nextId++}`, def, members: [], size: 2, tactic: 'charge', last: null, softStreak: 0, called: true, since: -HOLD, captain: false };
    this.groups.push(group); this.spawning = true;
    try { for (let i = 0; i < 2; i++) { if (this.over) return; await this.spawnFoe(group, i, 2); } } finally { this.spawning = false; }
    try { if (f.dress?.onSummon) { f.dress.onSummon(group.members.map((m) => m.pos.clone())); for (const m of group.members) f.dress.rise?.(m.actor); } } catch (err) { console.warn(err); }
    this.hud.toast((this.kit.id !== 'dark' && this.kit.words?.summon) || 'The dead answer'); sfx('spawn');
  }
  /* a ring that runs along the ground from a heavy blow: dodge through it */
  shockwave(origin, damage, label) {
    const geo = new THREE.RingGeometry(0.82, 1, 64); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.world.biome?.accent ?? 0xff4a12).multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.position.set(origin.x, 0.12, origin.z); this.world.scene.add(m);
    this.rings.push({ m, origin: origin.clone().setY(0), r: 1, speed: 10, max: 13, damage, label, done: false });
    sfx('quake'); this.shake = Math.max(this.shake, 0.9);
    this.points(60, 0xbba58a, 0.9, 0.06, (i) => { const a = (i / 60) * Math.PI * 2; return { p: V(origin.x + Math.cos(a), 0.2, origin.z + Math.sin(a)), v: V(Math.cos(a) * 8, rand(1, 3), Math.sin(a) * 8) }; }, 9, 1.5);
  }
  updateRings(dt) {
    for (const r of this.rings) {
      r.r += r.speed * dt; r.m.scale.set(r.r, 1, r.r); r.m.material.opacity = 0.8 * clamp(1 - r.r / r.max, 0, 1);
      const d = Math.hypot(this.pos.x - r.origin.x, this.pos.z - r.origin.z);
      if (!r.done && Math.abs(d - r.r) < 0.55) { r.done = true; if (r.srcFoe?.c2 && C2.on(this) && C2.ringDodged(this, r)) { C2.noteResult(this, r.srcFoe, 'dodged'); continue; } /* combat2: any dodge in the last 0.75 s clears a ring (a player dodges away from a giant) */ const res = this.takeHit({ pos: r.origin, damage: r.damage, def: { label: r.label } }, { dmg: 1, unblockable: true, push: 2.2, blunt: true }); if (r.srcFoe?.c2 && !r.c2after) C2.noteResult(this, r.srcFoe, res); } /* combat2: the aftershock hurts but never takes the window away */
      if (r.r >= r.max) { r.gone = true; r.m.removeFromParent(); r.m.geometry.dispose(); r.m.material.dispose(); }
    }
    if (this.rings.some((r) => r.gone)) this.rings = this.rings.filter((r) => !r.gone);
  }
  /* a slow bolt: block it, or parry it back at its caster */
  fireBolt(f) {
    const from = V(f.pos.x + Math.sin(f.yaw) * 0.8, 1.9 * f.scale, f.pos.z + Math.cos(f.yaw) * 0.8);
    /* a boss dress may set boltLook = { color, scale, mesh(sprite) -> Object3D that rides the bolt } */
    const BL = f.dress?.boltLook || null;
    const mat = new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(BL?.color ?? f.eye).multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(mat); sp.scale.setScalar(BL?.scale ?? 0.55); sp.position.copy(from); this.world.scene.add(sp);
    if (BL?.mesh) { try { const o = BL.mesh(sp); if (o) sp.add(o); } catch (err) { console.warn('boltLook', err); } }
    const aim = V(this.pos.x, EYE - 0.5, this.pos.z).sub(from).normalize();
    this.shots.push({ sp, mat, vel: aim.multiplyScalar(11), srcFoe: f, t: 0, back: false, eye: f.eye });
    sfx('bolt');
  }
  updateShots(dt) {
    for (const s of this.shots) {
      s.t += dt; s.sp.position.addScaledVector(s.vel, dt);
      if (Math.random() < 0.5) this.points(1, s.eye, 0.4, 0.04, () => ({ p: s.sp.position.clone(), v: V(rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5)) }));
      const end = () => { s.gone = true; s.sp.removeFromParent(); s.mat.dispose(); };
      if (s.back) {
        const o = s.srcFoe; if (!o || o.state === 'dead') { end(); continue; }
        const tgt = V(o.pos.x, 1.6 * o.scale, o.pos.z); s.vel.copy(tgt.clone().sub(s.sp.position).normalize().multiplyScalar(20));
        if (s.sp.position.distanceTo(tgt) < 0.9) { this.damageFoe(o, 9, s.vel.clone().setY(0).normalize(), { poise: 40, heavy: true, color: s.eye, pierce: true }); this.hud.toast('Returned'); end(); }
      } else {
        const tgt = V(this.pos.x, EYE - 0.5, this.pos.z);
        if (s.sp.position.distanceTo(tgt) < 0.8) {
          const res = this.takeHit({ pos: s.sp.position.clone().addScaledVector(s.vel, -0.2), damage: 2, def: { label: 'bolt' } }, { dmg: 1, guardBreak: 1, push: 0.8, blunt: true }); if (s.srcFoe?.c2) C2.noteResult(this, s.srcFoe, res);
          if (res === 'parried') { s.back = true; s.sp.scale.setScalar(0.75); } else end();
        } else if (s.t > 4 || s.sp.position.y < 0.1) end();
      }
    }
    if (this.shots.some((s) => s.gone)) this.shots = this.shots.filter((s) => !s.gone);
  }
  buildBossUi(label) {
    const el = document.createElement('div'); el.className = 'boss-ui';
    el.innerHTML = '<span></span><em></em><i><b></b></i><small></small>';
    el.querySelector('span').textContent = label; el.querySelector('em').textContent = this.enemyWords ? `“${this.enemyWords}”` : '';
    document.getElementById('labels').appendChild(el); this.bossEl = el;
    /* the player's words under the name are a beat at the intro, not a label for the whole fight: they go after ~9 s */
    const em = el.querySelector('em'); if (em.textContent) setTimeout(() => em.classList.add('gone'), 9000);
  }
  /* a line about the boss sits under its bar, not over the fight */
  bossNote(text, ms = 2200) {
    const n = this.bossEl?.querySelector('small'); if (!n) { this.hud.toast(text); return; }
    n.textContent = text; n.classList.add('on'); clearTimeout(this.bossNoteT); this.bossNoteT = setTimeout(() => n.classList.remove('on'), ms);
  }
  updateBoss(dt) {
    if (C2.on(this) && (this.boss || this.bossFoe?.c2)) C2.update(this, dt); /* combat2: the bar's state, the first-tell lesson, rings after a dodge, aftershocks */
    if (this.boss) {
      this.boss.update(dt);
      if (this.boss.dead && !this.over && !this.deathCam && !this.deathDone) { this.stats.kills++; this.slow = 1.0; if (this.boss.deathView) { if (!this.vowReading()) this.hud.line?.('', '', 1); this.hud.boon?.('', ''); this.deathCam = { t: 0, dur: 7, dragon: true }; this.hud.cinema?.(true); if (this.bossEl) this.bossEl.style.opacity = '0'; try { this.dd = new DeathDirector(this, this.deathCam); } catch (err) { console.warn('death director', err); this.dd = null; } } else { this.deathDone = true; this.finish(true); } }
    }
    if (this.bossEl) {
      const hp = this.boss ? this.boss.hp / this.boss.maxHp : this.bossFoe ? this.bossFoe.hp / this.bossFoe.maxHp : 1;
      this.bossEl.querySelector('b').style.width = `${clamp(hp, 0, 1) * 100}%`;
      climax(this, hp, dt); /* the last fifth of the boss's health: a low drone rises (sound only) */
      /* the enemy speaks the player's words; near the end the hero's own vow comes back */
      if (this.deathCam && this.twistId && !this.twistEnded) { this.twistEnded = true; this.darkness(0, 9); for (const m of this.tethers || []) m.visible = false; }
      if (this.twistFn && !this.over && !this.deathCam) { try { this.twistFn(dt, hp); } catch (err) { console.warn('twist', String(err && err.stack || err)); this.twistFn = null; this.bossMul = 1; } }
      if (this.story && !this.over && (this.boss || this.bossFoe)) {
        if (!this.said2 && !this.deathCam && hp < 0.45 && this.clock - (this.twistSaid ?? -9) > 3.2) { /* never during the death cut (no caption over the fall) */ /* at 45 %, so the vow is read before the last blows */
          this.said2 = true; this.vowSaidAt = performance.now(); this.hud.line?.(this.story.recall(this.vow, this.resolve?.id), '', 3600); sfx('soul'); this.world.flash(0.35); this.slow = Math.max(this.slow, 0.5);
          this.hp = Math.min(this.maxHp, this.hp + Math.ceil(this.maxHp * 0.25)); this.crit = Math.max(this.crit, 3); for (const w of this.wisps) w.flare = 1;
        }
      }
    }
  }

  swingAtBoss(s, arc, fwd) {
    let best = null; let bd = 1e9;
    for (const h of this.boss.hittable()) {
      const to = V().subVectors(h.pos, V(this.pos.x, Math.min(h.pos.y, EYE), this.pos.z)); const d = to.length() - (h.radius ?? h.r ?? 0.6);
      if (d > this.weapon.reach + (s.heavy ? 0.9 : 0.5)) continue;
      if (V(to.x, 0, to.z).normalize().dot(fwd) < Math.min(arc.cone, 0.3)) continue;
      const score = d - (h.open ? 2 : 0) - (h.part === 'head' ? 1 : 0); if (score < bd) { bd = score; best = h; }
    }
    if (!best) return;
    s.bossHit = true;
    const dir = V().subVectors(best.pos, this.pos).setY(0).normalize(); const crit = this.crit > 0;
    const res = this.boss.damage(best.id, s.dmg * this.power * (crit ? 2 : 1) * this.bossMul * (C2.on(this) ? C2.dragonHit(this, this.boss, best, 1, {}) : 1), dir, { heavy: !!s.heavy, crit }) || {}; /* combat2: closed plates are armoured */
    this.hitstop = s.heavy ? 0.14 : 0.07; this.shake = Math.max(this.shake, s.heavy ? 0.85 : 0.5); this.world.kick(s.heavy ? 0.22 : 0.1); this.vmPunch.set(0, 0, 0.06);
    if (this.lunge) this.lunge.until = 0;
    if (res.plateBroken) { this.stats.breaks++; sfx('breakPart'); }
  }

  /* ---------- foes ---------- */
  attackers() { return this.foes.filter((f) => f.token && f.state === 'attack').length; }
  releaseToken(f) { f.token = false; }
  startAttack(f, key, opt = {}) {
    const def = ATK[key] || ATK.slashA;
    if (f.boss && !opt.fake && C2.on(this)) opt = C2.attackStart(this, f, key, def, opt); /* combat2: phone tells, the window resets */
    f.state = 'attack'; f.t = 0; f.token = true; if (!opt.fake) this.lastAtkStart = this.clock;
    /* tellK scales the wind-up (a boss strikes faster as it weakens) */
    const tell = def.tell * (opt.tellK || 1);
    f.atk = { def, key, clipT: 0, hitIdx: 0, done: false, fake: !!opt.fake, lungeLeft: def.lunge || 0, tell };
    f.actor.play(def.clip, { loop: false, fade: 0.1, speed: def.hits[0] / tell, restart: true });
    if (!opt.fake) sfx(def.unblockable ? 'warn' : 'tactic');
    if (!opt.fake && f.boss && def.kind) sfx({ charge: 'charge', slam: 'swingHeavy', stomp: 'stagger', sweep: 'swingHeavy', lunge: 'charge', break: 'swingHeavy' }[def.kind] || 'swing'); /* a boss wind-up has its own sound */
    f.actor.eyes(def.unblockable ? 16 : 11, def.unblockable ? 0xff2a1a : null);
  }
  updateFoe(f, dt) {
    f.t += dt; f.cd = Math.max(0, f.cd - dt); f.dodgeCd = Math.max(0, f.dodgeCd - dt);
    f.pos.addScaledVector(f.vel, dt); f.vel.multiplyScalar(Math.max(0, 1 - dt * (f.state === 'down' ? 3.2 : 8)));
    f.poiseT += dt; if (f.poiseT > 3.5 && f.poise < f.maxPoise) f.poise = Math.min(f.maxPoise, f.poise + dt * 2);
    if (f.state === 'dead') {
      f.actor.eyes(7 * clamp(1 - f.t / 1.6, 0, 1));
      /* a thrown body ends flat on its back */
      if (f.staged) return;
      if (!f.settled && f.t >= (f.settleAt ?? 0.7)) { f.settled = f.lying = true; f.actor.play('LayToIdle', { loop: false, fade: f.settleAt === 0 ? 0.3 : 0.5, speed: 0, restart: true }); }
      /* a body near the camera (within about 2 m, more for a big one: it lies across the view and covers the bars) goes
         2.2 s after the kill, not at the corpse timer */
      { const rr = 2.0 + 0.6 * Math.max(0, f.scale - 1); if (f.t > (f.quickGone ? 0.9 : 2.2) && f.t < CORPSE && !(f.boss && this.dd) /* the boss's body stays for its death cut */ && (f.pos.x - this.pos.x) ** 2 + (f.pos.z - this.pos.z) ** 2 < rr * rr) f.t = CORPSE; }
      /* it fades and sinks into the ground as it goes */
      /* in the world's own way (dark ash, edo petals and smoke, neon a glitch, frontier dust, storybook a soft sparkle) */
      if (f.t > CORPSE) { const k = clamp((f.t - CORPSE) / CORPSE_FADE, 0, 1); f.actor.fade(1 - k * k); f.sinkY = k * k * (this.react ? this.react.sinkK() : 0.45) * f.scale; if (this.react && !f.boss) { try { this.react.dissolve(f, k, dt); } catch (err) { console.warn('react dissolve', err); } } if (f.t > CORPSE + CORPSE_FADE) { f.actor.dispose(); try { f.fdress?.dispose?.(); } catch { /* gone */ } f.gone = true; } }
      return;
    }
    const to = V().subVectors(this.pos, f.pos); to.y = 0; const dist = to.length(); to.normalize();
    const face = (rate = 10) => { const want = Math.atan2(to.x, to.z); let d = want - f.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; f.yaw += d * Math.min(1, dt * rate); };
    const idleClip = f.def.blocks ? 'Idle_Shield_Loop' : f.def.id === 'minion' ? 'Zombie_Idle_Loop' : 'Sword_Idle';
    switch (f.state) {
      case 'spawn': face(); if (f.t >= 0) { f.state = 'idle'; f.actor.eyes(7, f.eye); } return;
      case 'hit': if (f.t > 0.32) f.state = 'idle'; return;
      case 'stagger': if (f.t > (f.def.armor ? 1.1 : 1.6)) { f.state = 'idle'; f.actor.eyes(7, f.eye); f.cd = 0.15; f.steadyUntil = this.clock + 3.5; } return;
      case 'frozen': if (f.t > 2.6) { f.state = 'idle'; } return;
      case 'block': face(6); if (f.t > f.blockFor + (f.c2 && !f.c2.reading && C2.on(this) ? 0.3 : 0)) { f.state = 'idle'; const hit = f.blockHits > 0; f.blockHits = 0; if (f.c2 && C2.on(this) && !hit) f.cd = Math.max(f.cd, 0.5); else if (f.cd <= 0.3 && dist <= f.reach + 0.6 && this.attackers() < this.cap()) this.startAttack(f, 'slashA'); } return; /* combat2: a boss guard lasts 0.3 s longer (time to hold attack); it ends in a beat for a hero who waited, in a swing for one who hacked at it */
      case 'dodge': f.pos.addScaledVector(f.dodgeDir, 7.5 * dt * (1 - f.t / 0.5)); if (f.t > 0.5) { f.state = 'idle'; f.cd = Math.min(f.cd, 0.25); } return;
      case 'down': {
        /* a foe that slides into others bowls them over */
        if (f.vel.lengthSq() > 9) for (const o of this.foes) { if (o === f || o.state === 'dead' || o.state === 'down' || f.bowled.has(o.id)) continue; if (o.pos.distanceTo(f.pos) < 1.5) { f.bowled.add(o.id); this.staggerFoe(o, f.vel.clone().normalize()); this.sparks(V(o.pos.x, 1.2, o.pos.z), V(0, 1, 0), 0xffe2b0, 10, 5); sfx('clang'); } }
        if (!f.flat && f.t > 0.7) { f.flat = true; f.actor.play('LayToIdle', { loop: false, fade: 0.3, speed: 0, restart: true }); }
        if (f.t > (f.def.armor ? 1.2 : 1.8)) { f.state = 'getup'; f.t = 0; f.flat = false; f.actor.play('LayToIdle', { loop: false, fade: 0.1, speed: 1.35, restart: true }); }
        return;
      }
      case 'getup': if (f.t > 1.05) { f.state = 'idle'; f.actor.eyes(7, f.eye); f.cd = 0.15; f.steadyUntil = this.clock + 3.5; } return;
      case 'recover': face(2.5); if (f.t > f.recoverFor) { f.state = 'idle'; f.actor.eyes(7, f.eye); } return;
      case 'taunt': face(); if (f.t > 1.5) { f.state = 'idle'; if (!f.group.called && this.reinforcements > 0) { f.group.called = true; this.reinforcements--; this.callHelp(f.group); } } return;
      case 'attack': {
        const a = f.atk; const def = a.def; const pre = a.clipT < def.hits[0];
        const tellNow = a.tell || def.tell; const speed = pre ? def.hits[0] / tellNow : def.post; a.clipT += dt * speed; f.actor.setSpeed(speed);
        face(pre ? (f.boss && f.scale > 2 ? 3.5 : 7) : 1.5); /* a giant turns slowly into its blow: a side step beats it */
        /* close the gap during the wind-up so the blow can land */
        { const stopAt = f.boss ? Math.max(f.reach * 0.7, this.holdOff(f) + (def.kind === 'charge' ? 1.1 : 0.3)) : f.reach * 0.7; /* a boss's charge stops short of the lens; its blow still reaches */
          if (pre && a.lungeLeft > 0 && dist > stopAt) { const step = Math.min(a.lungeLeft, (def.lunge / tellNow) * dt, Math.max(0, dist - stopAt)); f.pos.addScaledVector(to, step); a.lungeLeft -= step; } }
        if (pre) f.actor.eyes((def.unblockable ? 9 : 7) + 9 * (a.clipT / def.hits[0]));
        if (a.fake && a.clipT > def.hits[0] * 0.75) { f.state = 'idle'; f.atk = null; this.releaseToken(f); f.cd = 0.05; f.phase = 2; f.phaseT = 0; f.actor.eyes(7, f.eye); return; }
        while (a.hitIdx < def.hits.length && a.clipT >= def.hits[a.hitIdx]) {
          a.hitIdx++;
          if (def.projectile) { this.fireBolt(f); continue; }
          /* a stomp lands at the boss's front foot (a third of the way to the hero), a slam where the weapon head is */
          const fwdK = def.kind === 'stomp' ? Math.min(f.reach * 0.6, dist * 0.4) : f.reach * 0.6; const ground = V(f.pos.x + Math.sin(f.yaw) * fwdK, 0, f.pos.z + Math.cos(f.yaw) * fwdK);
          if (def.quake && f.dress?.onSlam) { try { const at = f.dress.maulHead && def.kind !== 'stomp' ? f.dress.maulHead.clone().setY(0) : ground.clone(); const r = f.dress.onSlam(at) || {}; this.shake = Math.max(this.shake, r.shake || 0); if (r.flash) this.world.flash(r.flash * 0.5); if (r.slow) this.slow = Math.max(this.slow, r.slow); } catch (err) { console.warn(err); } }
          if (def.wave) this.shockwave(ground, 2, 'shockwave');
          const inFront = V(Math.sin(f.yaw), 0, Math.cos(f.yaw)).dot(to) > (def.wide ? -0.35 : 0.25); /* a sweep hits wide */
          const landed = dist <= f.reach + 0.75 && inFront;
          if (landed) { const res = this.takeHit(f, def); if (f.c2) C2.noteResult(this, f, res); }
          else if (def.quake && !def.wave) { this.shake = Math.max(this.shake, 0.5); sfx('down'); this.sparks(V(f.pos.x + Math.sin(f.yaw) * 1.6, 0.1, f.pos.z + Math.cos(f.yaw) * 1.6), V(0, 1, 0), 0xffe2b0, 18, 6); }
          /* the boss impact: a ground ring to dodge through (it spares a hero the blow already hit), its sound, a shake */
          if (f.boss && def.kind) {
            if (def.ring) { this.shockwave(ground, def.ring, def.kind === 'stomp' ? 'stomp' : 'shockwave'); const rg = this.rings[this.rings.length - 1]; if (rg) rg.srcFoe = f; if (rg) { rg.done = landed; if (def.kind === 'stomp') rg.max = 8; } }
            if (def.quake) { if (!def.ring) sfx('quake'); } else if (def.kind === 'sweep' || def.kind === 'charge') { sfx('clangBig'); this.shake = Math.max(this.shake, f.scale > 2 ? 0.45 : 0.2); }
          }
          if (f.state !== 'attack') return;
          f.actor.eyes(7, f.eye);
        }
        if (a.clipT >= def.end) {
          a.done = true; f.state = 'recover'; f.t = 0; f.recoverFor = def.recover; f.actor.eyes(2.5); f.atk = null; this.releaseToken(f); if (f.c2 && C2.on(this)) C2.attackEnd(this, f, def); /* combat2: an avoided blow opens it */ f.cd = rand(0.8, 1.7) * (f.group.tactic === 'charge' ? 0.75 : 1);
          if (def.rec) f.actor.play(def.rec, { loop: false, fade: 0.08, speed: 1.5 });
        }
        return;
      }
      default:
    }
    /* idle: follow the group tactic */
    const tactic = f.group.tactic;
    const moveTo = (target, speed, clip) => {
      const d = V().subVectors(target, f.pos); d.y = 0; const len = d.length();
      if (len > 0.2) {
        d.normalize(); f.pos.addScaledVector(d, Math.min(len, speed * dt));
        const run = speed > 3.4; const c = clip || (f.def.id === 'minion' && !run ? 'Zombie_Walk_Fwd_Loop' : run ? 'Jog_Fwd_Loop' : 'Walk_Loop');
        f.actor.play(c, { speed: c === 'Jog_Fwd_Loop' ? speed / 3.9 : c === 'Walk_Loop' ? speed / 1.7 : speed / 1.3, fade: 0.2 });
        return false;
      }
      return true;
    };
    const canAttack = () => f.cd <= 0 && (f.boss || this.attackers() < this.cap()) && this.clock - (this.lastAtkStart || -9) > 0.85;
    const pick = () => { const list = f.def.attacks || ['slashA']; const near = list.filter((k) => !(ATK[k].range)); return near[Math.floor(Math.random() * near.length)]; };
    /* a walk foe (journey.js) may be driven: it goes for a companion, or runs along the route; true = handled this frame */
    if (f.drive && f.drive(dt, moveTo, idleClip)) return;
    if (f.hold) { face(4); f.actor.play(idleClip, { fade: 0.25 }); return; }
    if (f.flee) { const away = f.pos.clone().addScaledVector(to, -4); if (away.length() > this.arena - 1) away.setLength(this.arena - 1); f.yaw = Math.atan2(-to.x, -to.z); moveTo(away, Math.min(f.speed, (this.archetype.speed || 5) * 0.85), 'Jog_Fwd_Loop'); return; }
    face();
    if (f.boss && f.def.blinks) {
      f.blinkCd -= dt;
      if (dist < 3.4 && f.blinkCd <= 0) {
        this.embers(V(f.pos.x, 1.6 * f.scale, f.pos.z), f.eye, 40, 3);
        const ang = this.yaw + Math.PI + rand(-0.7, 0.7); /* it lands inside the view (was +-1.2 rad: off the screen edge) */ f.pos.set(this.pos.x + Math.sin(ang) * 10, 0, this.pos.z + Math.cos(ang) * 10); if (f.pos.length() > ARENA - 1) f.pos.setLength(ARENA - 1);
        this.embers(V(f.pos.x, 1.6 * f.scale, f.pos.z), f.eye, 40, 3); f.blinkCd = 6; f.cd = Math.max(f.cd, 0.5); sfx('dodge'); return;
      }
    }
    /* every boss runs on its own brain (web/src/boss-moves.js): attack range, stand-off and moves come
       from one set of numbers per boss, so a boss always comes to blows (the giants stood off and never swung) */
    if (f.boss && f.c2 && C2.on(this) && C2.brain(this, f, dt, { dist })) return; /* combat2: the counter to a streak of armoured hits */
    if (f.boss && bossBrain(this, f, dt, { to, dist, face, moveTo, idleClip: f.def.blinks && dist > 7.5 ? 'Spell_Simple_Idle_Loop' : idleClip })) return;
    if (tactic === 'retreat') {
      if (dist < 11) { const away = f.pos.clone().addScaledVector(to, -3); if (away.length() > this.arena - 0.5) away.setLength(this.arena - 0.5); moveTo(away, f.speed * 0.8, 'Walk_Loop'); f.actor.setSpeed(-1.2); } else f.actor.play(idleClip);
      return;
    }
    if (tactic === 'call' && !f.group.called && f === f.group.members[0]) { f.state = 'taunt'; f.t = 0; f.actor.play('Spell_Simple_Shoot', { loop: false, fade: 0.1, speed: 0.5 }); f.actor.eyes(14); return; }
    if (tactic === 'guard') {
      if (f.counter && dist <= f.reach + 0.6 && canAttack()) { f.counter = false; this.startAttack(f, f.def.blocks ? 'bash' : pick()); return; }
      if (dist > 5.5) moveTo(this.pos, f.speed * 0.6);
      else if (dist < 2.6) { moveTo(f.pos.clone().addScaledVector(to, -2), f.speed * 0.5, 'Walk_Loop'); f.actor.setSpeed(-1); }
      else f.actor.play(f.def.blocks ? 'Idle_Shield_Loop' : 'Sword_Block', { fade: 0.2 });
      if (dist <= f.reach + 0.3 && canAttack() && (this.swing || Math.random() < dt * 0.5)) this.startAttack(f, pick());
      return;
    }
    if (tactic === 'feint') {
      f.phaseT = (f.phaseT || 0) + dt;
      if (f.phase === 1) f.phase = 0;
      if (f.phase === 0) { if (dist <= f.reach + 0.8 && this.attackers() < this.cap()) { f.phase = 1; this.startAttack(f, 'slashA', { fake: true }); } else moveTo(this.pos, f.speed); return; }
      if (f.phase === 2) { if (f.phaseT < 0.4) { moveTo(f.pos.clone().addScaledVector(to, -2), f.speed * 1.3, 'Walk_Loop'); f.actor.setSpeed(-1.6); return; } f.phase = 3; }
      if (f.phase === 3) { if (dist <= f.reach + 0.4 && canAttack()) { f.phase = 0; this.startAttack(f, 'chop'); } else moveTo(this.pos, f.speed * 1.35); return; }
      return;
    }
    let target = this.pos;
    if (tactic === 'flank' && dist > f.reach) {
      const n = Math.max(2, f.group.members.length);
      const idx = f.group.members.indexOf(f);
      const side = (idx % 2 === 0 ? 1 : -1) * (Math.PI * (0.55 + 0.45 * Math.floor(idx / 2) / Math.max(1, Math.ceil(n / 2))));
      const ring = Math.max(f.reach * 0.9, Math.min(dist, 4.5) * 0.75);
      const pPos = V(this.pos.x + Math.sin(this.yaw + Math.PI + side) * ring, 0, this.pos.z + Math.cos(this.yaw + Math.PI + side) * ring);
      const behind = V().subVectors(f.pos, this.pos).normalize().dot(this.forward()) < -0.1;
      target = behind ? this.pos : pPos;
    }
    /* a ranged opener for foes that have one */
    const far = (f.def.attacks || []).find((k) => ATK[k].range);
    if (far && dist > 4 && dist < ATK[far].range && canAttack() && Math.random() < dt * 1.6) { this.startAttack(f, far); return; }
    if (dist <= f.reach + 0.2) {
      if (canAttack()) { this.startAttack(f, pick()); return; }
      /* no attack slot: hold just outside the reach and wait */
      if (this.attackers() >= this.cap() && dist < 3.0) { moveTo(f.pos.clone().addScaledVector(to, -1.5), f.speed * 0.5, 'Walk_Loop'); f.actor.setSpeed(-1); return; }
      f.actor.play(idleClip, { fade: 0.2 }); return;
    }
    if (target === this.pos && this.attackers() >= this.cap() && dist < 3.6) { f.actor.play(idleClip, { fade: 0.2 }); return; }
    moveTo(target, f.speed * (tactic === 'charge' ? 1.15 : 1));
  }
  cap() { return 2; }

  async callHelp(group) {
    this.hud.toast(`${many(this.nameOf(group.def))} call for help`);
    this.director.event(`${group.def.label}s call for help. Two more arrive.`);
    this.spawning = true;
    try { for (let i = 0; i < 2; i++) { if (this.over) return; await this.spawnFoe(group, i, 2); } } finally { this.spawning = false; }
    sfx('spawn');
  }

  /* how close the hero may stand to a quest prop: its own footprint (a storybook beacon is a wide tower; the camera stood
     pressed to the brick) plus 0.9 m, never less than the old 1.5 (fire) / 1.25 m. Measured once, the base only (below 3 m). */
  propRad(p) {
    if (p.rad == null) {
      let r = 0; try { const box = new THREE.Box3(); p.group.updateWorldMatrix(true, true); p.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry && o.visible) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (b.min.y < p.pos.y + 3 && b.max.x - b.min.x < 8 && b.max.z - b.min.z < 8) box.union(b); } });
        if (!box.isEmpty()) r = Math.max(Math.abs(box.max.x - p.pos.x), Math.abs(box.min.x - p.pos.x), Math.abs(box.max.z - p.pos.z), Math.abs(box.min.z - p.pos.z)); } catch { r = 0; }
      p.rad = Math.max(p.kind === 'fire' ? 1.5 : 1.25, Math.min(r + 0.9, 3));
      /* a tall piece (a beacon tower) fills the view from close by: the hero stands 1.9 m off its wall */
      try { const tb = new THREE.Box3().setFromObject(p.group); if (p.kind === 'beacon' && !tb.isEmpty() && tb.max.y - p.pos.y > 3.5 && r > 0) p.rad = Math.max(p.rad, Math.min(r + 1.9, 3.6)); } catch { /* keep */ }
      /* any beacon (a thin signal pole, a lamp post) keeps the lens at least 2.4 m off: its lamp head filled the view */
      if (p.kind === 'beacon') p.rad = Math.max(p.rad, 2.4);
    }
    return p.rad;
  }
  /* how close the hero (and the camera) may stand to a foe's centre. A big foe (a troll, a brute: scale over 1) stands
     further out than its scale alone: its attack clips lean the torso and the weapon about a metre toward the hero. */
  holdOff(f) {
    if (f.state === 'down') return Math.max(1.2, f.wide ? f.wide * f.scale + 0.85 : 0);
    const base = f.boss ? (f.dress?.keepOut ?? (f.scale > 2 ? 1.3 + 0.8 * f.scale : 1.3 + 0.45 * f.scale)) : Math.max(1.6, 1.55 * f.scale + Math.max(0, f.scale - 1) * 2.4);
    /* a world foe may stand further off (a hat brim, a broad hood): def.standOff or def.look.standOff, metres for a
       foe of size 1 or less, scaled up for a bigger one. Only the keep-out reads it; the ranged hit size (wide) is unchanged.
       A small foe (a goblin, 0.72) keeps at least 1.6 m: it walked to 1.1 m and its hood filled the low half of the view. */
    const so = f.def?.standOff ?? f.def?.look?.standOff ?? 0;
    const hb = Math.max(base, so ? so * Math.max(1, f.scale) : 0, f.wide ? f.wide * f.scale + 0.85 : 0);
    f.nearBase = hb; return hb + (f.nearPad || 0); /* a foe whose head, hat, hands or weapon reach the protected volume stands further off */
  }
  /* the points of a foe that can come at the lens: head, neck, chest, shoulders, elbows, hands, the ends of its gear
     (cached once per foe; gear ends are local points on the long axis of each piece) */
  clearPts(f) {
    if (f.cpts && f.cptsGear === f.gear.length) return f.cpts;
    const pts = [];
    for (const n of ['Head', 'neck_01', 'spine_03', 'spine_02', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r']) { const o = f.actor.slot(n); if (o) pts.push({ o, p: null }); }
    for (const g of f.gear) {
      const box = new THREE.Box3(); g.updateWorldMatrix(true, true); const inv = g.matrixWorld.clone().invert();
      g.traverse((m) => { if (m.isMesh && m.geometry && !m.isSkinnedMesh) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))); } });
      if (box.isEmpty()) continue;
      const s = box.getSize(V()); const c = box.getCenter(V()); const ax = s.x > s.y ? (s.x > s.z ? 'x' : 'z') : (s.y > s.z ? 'y' : 'z');
      const a = c.clone(); a[ax] = box.min[ax]; const b = c.clone(); b[ax] = box.max[ax];
      pts.push({ o: g, p: a }, { o: g, p: c }, { o: g, p: b });
    }
    f.cpts = pts; f.cptsGear = f.gear.length; return pts;
  }
  /* the camera backs off (the view only; the hero stays where it stands) when a live foe's body or weapon comes
     within reach of the lens: big bosses lean and swing well past their keep-out. It eases back in when clear. */
  clearView(cam, rawDt) {
    let px = 0; let pz = 0; let need = 0; const _w = this._cw || (this._cw = V());
    const pl = this._cpl || (this._cpl = []); pl.length = 0; /* every joint near the lens, to check the push below */
    if (!this.over || this.deathCam) for (const f of this.foes) {
      if (f.state === 'spawn' || f.gone || (f.state === 'dead' && !f.staged)) continue;
      const fx = f.pos.x - cam.position.x; const fz = f.pos.z - cam.position.z; const reachOut = 3 + 3 * f.scale;
      if (fx * fx + fz * fz > reachOut * reachOut) continue;
      const R = f.boss ? Math.max(1.7, 0.9 * f.scale + 0.7) : f.scale > 1.1 ? 1.7 + 1.0 * (f.scale - 1) : 0.9; /* from joint centres: a troll's forearm is thick */
      const extra = [f.dress?.maulHead, f.dress?.lookAt].filter((v) => v && v.lengthSq() > 0);
      const pts = this.clearPts(f);
      for (let i = 0; i < pts.length + extra.length; i++) {
        if (i < pts.length) { const q = pts[i]; if (q.p) _w.copy(q.p).applyMatrix4(q.o.matrixWorld); else _w.setFromMatrixPosition(q.o.matrixWorld); if (!q.o.visible && !q.p) continue; } else _w.copy(extra[i - pts.length]);
        const dx = cam.position.x - _w.x; const dz = cam.position.z - _w.z; const dy = cam.position.y - _w.y;
        const d3 = Math.hypot(dx, dy, dz); if (d3 < R + 1.7 && pl.length < 240) pl.push(_w.x, _w.y, _w.z, R); if (d3 >= R) continue;
        const dh = Math.hypot(dx, dz) || 1e-3; const push = R - d3;
        /* away from the point, on the ground plane; a point straight above or below pushes back along the view */
        let ux = dx / dh; let uz = dz / dh; if (dh < 0.15) { ux = Math.sin(this.yaw); uz = Math.cos(this.yaw); }
        if (push > need) { need = push; px = ux * push; pz = uz * push; }
      }
    }
    /* a very tall boss: the view stands far enough back that its head fits under TALL_PITCH (see update) */
    let cap = 1.6; const bf = this.bossFoe;
    if (bf && bf.state !== 'dead' && !this.deathCam && !this.over && bf.dress?.lookAt) {
      const hH = bf.dress.lookAt.y - EYE - this.footY;
      if (hH > TALL_H) { const dx = this.pos.x - bf.pos.x; const dz = this.pos.z - bf.pos.z; const dh = Math.hypot(dx, dz) || 1e-3; const back = clamp(hH / Math.tan(TALL_PITCH + TALL_FACE) - dh, 0, TALL_BACK);
        if (back > need) { need = back; px = (dx / dh) * back; pz = (dz / dh) * back; } cap = Math.max(cap, back); } }
    const len = Math.hypot(px, pz); if (len > cap) { px *= cap / len; pz *= cap / len; }
    const o = this.camOff || (this.camOff = { x: 0, z: 0 });
    /* fast out (a blow comes fast), slow back in */
    const out = px * px + pz * pz > o.x * o.x + o.z * o.z; const k = Math.min(1, rawDt * (out ? 16 : 2.5));
    o.x += (px - o.x) * k; o.z += (pz - o.z) * k;
    /* the back-off never carries the lens into another body (a second foe at the side or behind): the dark panel
       of was a foe's torso 0.5-0.8 m from a camera that had backed away from the first foe. The offset shrinks
       until no joint ends nearer than its radius (or nearer than it was with no offset). */
    if ((o.x || o.z) && pl.length) {
      let s = 1;
      for (; s > 0.01; s -= 0.25) {
        const cx = cam.position.x + o.x * s; const cz = cam.position.z + o.z * s; let ok = true;
        for (let i = 0; i < pl.length; i += 4) { const R = pl[i + 3]; const d = Math.hypot(cx - pl[i], cam.position.y - pl[i + 1], cz - pl[i + 2]); if (d < R) { const d0 = Math.hypot(cam.position.x - pl[i], cam.position.y - pl[i + 1], cam.position.z - pl[i + 2]); if (d < d0 - 0.02) { ok = false; break; } } }
        if (ok) break;
      }
      s = Math.max(0, s); o.x *= s; o.z *= s;
    }
    cam.position.x += o.x; cam.position.z += o.z;
  }
  separate() {
    const live = this.foes.filter((f) => f.state !== 'dead');
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]; const b = live[j]; const d = V().subVectors(a.pos, b.pos); d.y = 0; const len = d.length(); const min = 1.65 * (a.scale + b.scale) / 2;
        if (len < min && len > 0.001) { d.multiplyScalar((min - len) / len / 2); a.pos.add(d); b.pos.sub(d); }
      }
      const f = live[i]; const d = V().subVectors(f.pos, this.pos); d.y = 0; const len = d.length(); const min = this.holdOff(f);
      if (len < min && len > 0.001) f.pos.addScaledVector(d, (min - len) / len);
      if (f.pos.length() > this.arena + 1) {
        f.pos.setLength(this.arena + 1); f.vel.multiplyScalar(0.2);
        /* the clamp may pull a boss back into the hero: the keep-out wins, the hero is pushed (in toward the centre) */
        if (f.boss) { const hx = this.pos.x - f.pos.x; const hz = this.pos.z - f.pos.z; const hl = Math.hypot(hx, hz); if (hl < min) { const k = hl > 0.001 ? min / hl : 0; if (k) { this.pos.x = f.pos.x + hx * k; this.pos.z = f.pos.z + hz * k; } else { this.pos.copy(f.pos).setLength(Math.max(0, f.pos.length() - min)); } } }
      }
    }
  }

  /* ---------- director: next wave ---------- */
  async endWave() {
    this.betweenWaves = true;
    if (this.bossStarted) { if (this.deathCam) { this.betweenWaves = false; return; } this.finish(true); return; }
    const secs = Math.round(this.clock - this.waveStart);
    this.director.event(`Wave ${this.wave} ends after ${secs} seconds. Hero health ${this.hp} of ${this.maxHp}${this.hp <= this.maxHp * 0.4 ? ', badly hurt' : this.hp >= this.maxHp * 0.75 ? ', high health' : ', medium health'}. This wave: ${this.stats.waveDamage} damage taken, ${this.stats.waveBlocks} blocks, ${this.stats.waveDodges} dodges. Enemies killed so far: ${this.stats.kills}. Waves fought: ${this.wave}.`);
    if (this.wave >= 2) { await wait(1100); if (!this.over) { if (!this.story) await this.theTaking(); await this.camp(); if (!this.over) await this.startBoss(); } return; }
    const answers = await this.director.ask();
    if (this.over) return;
    const b = answers?.beat;
    let beat = b?.chosen ?? b?.lead ?? null;
    let source = 'sage';
    if (!beat || !WAVES[beat] && beat !== 'rest') { beat = this.hp <= this.maxHp * 0.4 ? 'rest' : 'reinforce_thralls'; source = 'local'; }
    this.lastBeat = { beat, source, p: b?.leadP ?? 0, pressure: answers?.pressure?.expectation ?? null };
    this.director.event(`The director chooses: ${beat}.`);
    if (beat === 'rest') this.hp = Math.min(this.maxHp, this.hp + Math.ceil(this.maxHp * 0.3));
    await wait(700);
    if (this.over) return;
    if (this.story) { await this.second(beat === 'rest' ? 'reinforce_thralls' : beat); if (!this.over) { await this.camp(); if (!this.over) await this.startBoss(); } return; }
    if (beat === 'rest') { await this.startBoss(); return; }
    await this.spawnWave(beat);
  }

  finish(won) {
    if (this.over) return;
    this.over = true;
    this.director.event(won ? this.ww('The road is clear. The hero stands.') : this.ww('The hero falls on the road.'));
    if (won) sfx('win');
    const freed = won && this.story && (this.taken || this.story.ending);
    if (freed) { for (const w of this.wisps) { w.state = 'return'; w.t = 0; w.flare = 1; } if (this.dd && won) { this.dd.freed(this.taken ? this.story.freed : this.story.ending); setTimeout(() => sfx('soul'), 900); } /* on the death cut's title plate */ else setTimeout(() => { this.hud.line?.(this.taken ? this.story.freed : this.story.ending, '', 3000); sfx('soul'); }, 900); }
    /* a staged boss death holds on the fallen boss: the card comes 2.5 s after the old cut at the earliest, and not before
       the fall has played out (its length capped at 6.5 s) plus a beat. Then the view fades to night, so the field is never
       seen empty between the fight and the card. */
    const D = this.deathCam; const base = freed ? 4300 : won ? 1900 : 1200;
    const hold = D && D.foe && won ? Math.max(base + 600, freed ? 4300 : 2500, (Math.min(D.dur || 0, 6.5) + 1.0 - D.t) * 1000) : base;
    /* the death shot freezes on screen (main.js hud.freeze) and the card cross-fades in over it; the fade to night is the fallback */
    let ended = false; const toCard = async () => { if (ended) return; ended = true; if (this.hud.freeze && await this.hud.freeze()) { this.endNow(won); return; } this.hud.fade?.(1, 450); setTimeout(() => this.endNow(won), this.hud.fade ? 480 : 0); };
    /* the death director calls the card at the end of its cut (game time); a timer is only the safety net */
    if (this.dd && won) { this.dd.onEnd = toCard; setTimeout(toCard, Math.max(0, (this.dd.T - this.dd.t) * 1000) + 5000); return; }
    setTimeout(toCard, hold);
  }
  endNow(won) {
    { this.stop(); this.onEnd({ won, stats: this.stats, hp: this.hp, maxHp: this.maxHp, lastBeat: this.lastBeat, seconds: Math.round(this.clock), stage: this.stage, resolve: this.resolve, vow: this.vow, lost: this.taken, deed: this.deed || null, shape: this.story?.shape || null, opening: this.story?.first?.id || null, twist: this.twistId }); }
  }

  stop() {
    this.active = false; NEAR_FADE.value = 0; try { this.near?.dispose(); } catch { /* gone */ } /* every hidden mesh back on its layer */
    try { this.dd?.dispose(); } catch { /* gone */ } this.dd = null;
    for (const off of this.listeners) off();
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.remove?.();
    this.vm?.removeFromParent(); this.torch?.target?.removeFromParent(); this.torch?.removeFromParent(); this.trail?.removeFromParent(); if (this._slamL) { this._slamL.removeFromParent(); if (this.world.scene.userData.sqSlamLight === this._slamL) this.world.scene.userData.sqSlamLight = null; this._slamL = null; } for (const l of this.sparkLights || []) l.removeFromParent();
    for (const f of this.foes) { try { f.dress?.dispose(); } catch { /* gone */ } f.actor.dispose(); }
    for (const p of this.props || []) { try { p.h?.dispose(); } catch { /* gone */ } if (!p.h) p.group?.removeFromParent(); } this.props = [];
    try { this.comp?.dispose(); } catch { /* gone */ } try { this.journey?.dispose(); } catch { /* gone */ } this.world.setDark?.(0, 9); for (const m of this.tethers || []) m.removeFromParent(); this.darkEl?.remove();
    if (this.world._dark) this.world._dark = 0;
    for (const d of this.debris) { d.m.removeFromParent(); d.stain?.removeFromParent(); }
    for (const l of this.labels) l.el.remove();
    this.targetEl?.remove(); this.cueEl?.remove(); this.bossEl?.remove(); this.boss?.dispose?.();
    for (const r of this.rings) r.m.removeFromParent(); for (const sh of this.shots) sh.sp.removeFromParent();
    try { this.powers?.dispose(); } catch { /* gone */ }
    this.hud.show(false);
  }

  /* ---------- effects ---------- */
  points(count, color, life, size, init, gravity = 0, drag = 0) {
    const geo = new THREE.BufferGeometry(); const arr = new Float32Array(count * 3); const vel = [];
    for (let i = 0; i < count; i++) { const { p, v } = init(i); arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; vel.push(v); }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, color: new THREE.Color(color).multiplyScalar(2.6), size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; this.world.scene.add(pts);
    let t = 0;
    const off = this.world.addUpdater((rdt) => {
      const dt = rdt * (this.hitstop > 0 ? 0.05 : this.slow > 0 ? 0.3 : 1); t += dt;
      const dk = Math.max(0, 1 - drag * dt);
      for (let i = 0; i < count; i++) { vel[i].y -= gravity * dt; vel[i].multiplyScalar(dk); arr[i * 3] += vel[i].x * dt; arr[i * 3 + 1] = Math.max(0.03, arr[i * 3 + 1] + vel[i].y * dt); arr[i * 3 + 2] += vel[i].z * dt; }
      geo.attributes.position.needsUpdate = true; m.opacity = Math.max(0, 1 - t / life);
      if (t > life) { off(); pts.removeFromParent(); geo.dispose(); m.dispose(); }
    });
  }
  /* hot steel sparks that fly off along the blow */
  /* the hit look lives in powers.js (Powers.impact: a flare, streak sparks with gravity, the world's debris: blood, ink,
     leaves and stars, neon arcs, dust) and draws in its two instanced pools, so a hit makes no new geometry or material.
     o: { steel: true } = sparks only (a guard, the ground, a part); { stain } = the world's ground stain colour (null = none) */
  sparks(at, dir, color, n = 12, speed = 6, o = null) {
    if (this.powers) { try { this.powers.impact(at, dir, color, n, speed, o || { steel: true }); } catch (err) { console.warn('fx', err); } }
    else this.points(n, color, 0.4, 0.035, () => { const v = dir.clone().multiplyScalar(speed * rand(0.3, 1)); v.x += rand(-1, 1) * speed * 0.5; v.y += rand(-0.2, 1) * speed * 0.5; v.z += rand(-1, 1) * speed * 0.5; return { p: at.clone(), v }; }, 16, 1.5);
    /* the hit light sits 0.6 m off the body toward the eye and is soft: at the contact point itself (12-22) it
       burned the struck body to a flat white or pink cut-out */
    const l = this.sparkLights[this.sparkI++ % this.sparkLights.length]; l.color.set(color); l.position.copy(at); { const cp = this.world.camera.getWorldPosition(this._slc ||= V()); const off = cp.sub(at); const dd = off.length(); if (dd > 0.01) l.position.addScaledVector(off, Math.min(0.6, dd * 0.4) / dd); } l.userData.i = n >= 20 ? 3.2 : 2; l.userData.t = 0;
  }
  /* a parry or a blade turned on a guard: a bright star and sparks thrown one way */
  clash(at, dir, color, n = 16, speed = 7) {
    if (this.powers) { try { this.powers.clash(at, dir, color); } catch (err) { console.warn('fx', err); } const l = this.sparkLights[this.sparkI++ % this.sparkLights.length]; l.color.set(color); l.position.copy(at); l.userData.i = 8; l.userData.t = 0; } /* 30 burned the blade and the foe white */
    else this.sparks(at, dir, color, n, speed);
  }
  /* slow embers: what a hollow foe is made of */
  embers(at, color, n = 10, spread = 2) {
    const P = this.powers;
    if (P) { const c = new THREE.Color(color).multiplyScalar(2.4); const e = new THREE.Color(color).multiplyScalar(0.6); for (let i = 0; i < n; i++) P.add.emit(at.x + rand(-0.25, 0.25), at.y + rand(-0.4, 0.3), at.z + rand(-0.25, 0.25), rand(-1, 1) * spread, rand(0.5, 2.6), rand(-1, 1) * spread, rand(0.7, 1.2), 0.06, 0.03, c, e, 1, -1.2, 2.2, 0.03, 2); return; }
    this.points(n, color, 1.0, 0.04, () => ({ p: V(at.x + rand(-0.25, 0.25), at.y + rand(-0.4, 0.3), at.z + rand(-0.25, 0.25)), v: V(rand(-1, 1) * spread, rand(0.5, 2.6), rand(-1, 1) * spread) }), -1.2, 2.2);
  }
  /* the spark that leaves a dead foe flies to the hero and feeds the weapon's power */
  soul(f) {
    const mat = new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(f.eye).multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    /* it rises from above the head (from the chest it crossed the face of a body still standing, like glowing orbs on
       the foes' faces), smaller, and fades in */
    const s = new THREE.Sprite(mat); s.scale.setScalar(0.18); s.position.set(f.pos.x, 2.25 * f.scale + 0.15, f.pos.z); mat.opacity = 0; this.world.scene.add(s);
    let t = 0; const from = s.position.clone();
    const off = this.world.addUpdater((dt) => {
      t += dt * (this.slow > 0 ? 0.35 : 1);
      if (!this.active) { off(); s.removeFromParent(); mat.dispose(); return; }
      if (t < 0.6) { s.position.y = from.y + t * 1.0; mat.opacity = Math.min(1, t / 0.25); return; }
      const k = clamp((t - 0.6) / 0.5, 0, 1); const to = V(this.pos.x, EYE - 0.5, this.pos.z);
      s.position.lerpVectors(V(from.x, from.y + 0.6, from.z), to, k * k); s.scale.setScalar(0.18 * (1 - k * 0.9));
      if (k >= 1) { off(); s.removeFromParent(); mat.dispose(); this.abilityCd = Math.max(0, this.abilityCd - 1.5); sfx('soul'); }
    });
  }
  cone(fwd, color) {
    const origin = this.pos.clone().setY(1.6).addScaledVector(fwd, 0.8);
    this.points(220, color, 0.75, 0.24, () => { const v = fwd.clone().multiplyScalar(8 + Math.random() * 9); v.x += (Math.random() - 0.5) * 7; v.y += (Math.random() - 0.3) * 4; v.z += (Math.random() - 0.5) * 7; return { p: origin.clone(), v }; }, 0, 1.2);
  }
  ring(color) {
    const origin = this.pos.clone().setY(0.5);
    this.points(260, color, 0.9, 0.22, (i) => { const a = (i / 260) * Math.PI * 2; return { p: origin.clone(), v: V(Math.cos(a) * 9, Math.random() * 2.5, Math.sin(a) * 9) }; }, 0, 1.4);
  }
  bolt(a, b, color) {
    const pts = []; const n = 9;
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); if (i > 0 && i < n) { p.x += (Math.random() - 0.5) * 0.7; p.y += (Math.random() - 0.5) * 0.7; p.z += (Math.random() - 0.5) * 0.7; } pts.push(p); }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.05, 5, false);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true }));
    this.world.scene.add(mesh); let t = 0;
    const off = this.world.addUpdater((dt) => { t += dt; mesh.material.opacity = Math.max(0, 1 - t / 0.28); if (t > 0.28) { off(); mesh.removeFromParent(); geo.dispose(); mesh.material.dispose(); } });
  }

  /* ---------- labels and the target marker ---------- */
  label(foe, text, source) {
    /* no chip over a boss (its bar is up) or while a wave banner is on screen */
    if (foe.boss || this.clock - this.waveStart < 3.2 || this.betweenWaves) return;
    /* the pack's tactic is Sage2's choice: it shows only while the Tab feed is open (in play it read as a debug chip) */
    if (document.getElementById('feed')?.classList.contains('hidden')) return;
    const el = document.createElement('div');
    el.className = `tactic-label ${source}`; el.textContent = text;
    for (const l of this.labels) l.el.remove(); this.labels = [];
    document.getElementById('labels').appendChild(el);
    this.labels.push({ el, foe, t: this.clock });
  }
  updateLabels() {
    const cam = this.world.camera; const v = V();
    this.labels = this.labels.filter((l) => {
      const age = this.clock - l.t;
      if (age > 1.8 || l.foe.gone) { l.el.remove(); return false; }
      v.set(l.foe.pos.x, (this.journey ? this.journey.gy(l.foe.pos.x, l.foe.pos.z) : 0) + (l.foe.fly ? l.foe.flyY + 2.3 * l.foe.scale : 3.25 * l.foe.scale), l.foe.pos.z).project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      l.el.style.display = vis ? 'block' : 'none';
      l.el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; l.el.style.top = `${Math.max(this.task || this.bossEl ? 0.2 : 0.07, -v.y * 0.5 + 0.5) * 100}%`; l.el.style.marginTop = '-34px';
      l.el.style.opacity = String(Math.min(1, (1.8 - age) / 0.4));
      return true;
    });
  }
  buildTargetUi() {
    const el = document.createElement('div'); el.className = 'target-ui';
    el.innerHTML = '<span class="t-name"></span><i class="t-hp"><b></b></i><i class="t-poise"><b></b></i><em class="t-note"></em>';
    document.getElementById('labels').appendChild(el); this.targetEl = el;
    const cue = document.createElement('div'); cue.className = 'cue'; cue.innerHTML = '<i></i><span></span>'; cue.style.opacity = '0';
    document.getElementById('labels').appendChild(cue); this.cueEl = cue;
  }
  updateTargetUi() {
    const el = this.targetEl; if (!el) return; if (PERF.has('tplate')) { el.style.display = 'none'; return; }
    /* the plate's foe is the one at the reticle (nearer weighs more; the old pick took any attacker within 72
       degrees, so a goblin off at the side named the brigand in the sights), never one behind a nearer body; its anchor is the
       head bone, not a fixed 2.65 m (that floated 180 px over a brigand) */
    let f = null; if (this.near) { if (!this.over) f = this.near.plateTarget(); }
    else { const threat = this.foes.find((x) => x.state === 'attack' && x.pos.distanceTo(this.pos) < 6 && V().subVectors(x.pos, this.pos).normalize().dot(this.forward()) > 0.3); f = this.over ? null : (this.lock || threat || this.pickTarget(9, 0.6)); }
    this._plateFoe = f;
    if (!f || f.boss) { el.style.display = 'none'; if (this.near) this.near.plateBox = null; return; } /* a boss has its bar at the top: one name, one bar */
    /* on a walk the foe stands on the land, not at y = 0: the plate rides its ground */
    const v = this.near ? this.near.plateAnchor(f, V()).project(this.world.camera) : V(f.pos.x, (this.journey ? this.journey.gy(f.pos.x, f.pos.z) : 0) + (f.fly ? f.flyY + 1.7 * f.scale : 2.65 * f.scale), f.pos.z).project(this.world.camera);
    if (v.z >= 1) { el.style.display = 'none'; return; }
    /* no plate for a foe out of view (the edge cue shows threats behind): its body must be on screen, and the plate not pushed far off its head */
    { const b = this._plateV || (this._plateV = new THREE.Vector3()); b.set(f.pos.x, (this.journey ? this.journey.gy(f.pos.x, f.pos.z) : 0) + (f.fly ? f.flyY : 1.1 * f.scale), f.pos.z).project(this.world.camera); if (b.z >= 1 || Math.abs(b.x) > 0.98 || Math.abs(b.y) > 0.98 || Math.abs(v.x) > 0.98 || v.y > 1.15) { el.style.display = 'none'; return; } }
    /* the plate keeps clear of the wave banner, the task bar and the boss bar at the top of the screen */
    if (this.clock - this.waveStart < 2.6 && !f.boss) { el.style.display = 'none'; return; }
    const top = Math.max(this.task || this.bossEl ? 0.24 : 0.12, -v.y * 0.5 + 0.5); /* the plate's bottom edge (it sits above this point) */
    /* a plate is never clamped off its foe (it floated in the sky over a foe at arm's length): if its head is above
       the free band, or the plate would sit on the HUD or a caption, it waits */
    if (this.near) { const px = (v.x * 0.5 + 0.5) * innerWidth; const py = top * innerHeight; if (top > -v.y * 0.5 + 0.5 + 0.035 || this.near.plateBlocked(px, py)) { el.style.display = 'none'; this.near.plateBox = null; return; } this.near.plateBox = this.near.plateRect(px, py); }
    el.style.display = 'block'; el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; el.style.top = `${top * 100}%`;
    el.classList.toggle('locked', this.lock === f);
    el.querySelector('.t-name').textContent = f.boss ? '' : `${f.group.captain && !f.def.own && !f.def.marked ? 'Captain ' : ''}${this.nameOf(f.def)}`;
    el.querySelector('.t-hp b').style.width = `${clamp(f.hp / f.maxHp, 0, 1) * 100}%`;
    el.querySelector('.t-poise b').style.width = `${clamp(f.poise / f.maxPoise, 0, 1) * 100}%`;
    const open = f.state === 'stagger' || f.state === 'down' || f.state === 'getup' || f.state === 'frozen';
    const punish = f.state === 'recover';
    const warn = f.state === 'attack' && f.atk?.def.unblockable && f.atk.clipT < f.atk.def.hits[0];
    /* one clear word at the moment it matters: when to get out, and when to hit */
    el.querySelector('.t-note').textContent = open || punish ? 'Strike' : ''; /* "Dodge" is the cue's word (it showed twice); the plate turns red */
    el.classList.toggle('open', open || punish); el.classList.toggle('warn', !!warn);
  }

  /* the next blow that will land on the hero: seconds until it lands, its whole wind-up, and the answer to it */
  incoming() {
    let best = null;
    for (const f of this.foes) {
      const a = f.atk; if (f.state !== 'attack' || !a || a.fake || a.hitIdx >= a.def.hits.length) continue;
      if (f.pos.distanceTo(this.pos) > f.reach + (a.lungeLeft || 0) + 1.2) continue;
      const pre = a.clipT < a.def.hits[0];
      const t = pre ? (a.def.hits[0] - a.clipT) * a.def.tell / a.def.hits[0] : (a.def.hits[a.hitIdx] - a.clipT) / a.def.post;
      if (!best || t < best.t) best = { t, total: pre ? a.def.tell : 0.5, kind: a.def.unblockable || (f.c2 && (a.def.guardBreak || 0) >= 3 && C2.on(this)) ? 'dodge' : 'block', foe: f }; /* combat2: a blow that breaks a full guard says Dodge */
    }
    const b = this.boss?.cue?.(); if (b && (!best || b.t < best.t)) best = b;
    for (const r of this.rings) { if (r.done) continue; const t = (Math.hypot(this.pos.x - r.origin.x, this.pos.z - r.origin.z) - r.r) / r.speed; if (t > 0 && (!best || t < best.t)) best = { t, total: 1, kind: 'dodge', from: r.origin }; }
    for (const sh of this.shots) { if (sh.back) continue; const t = sh.sp.position.distanceTo(V(this.pos.x, EYE - 0.5, this.pos.z)) / 11; if (!best || t < best.t) best = { t, total: 1.2, kind: 'block', from: sh.sp.position }; }
    return best;
  }
  updateCue() {
    const el = this.cueEl; if (!el) return;
    const c = this.over ? null : this.incoming();
    if (!c || c.t > 1.3) { el.style.opacity = '0'; this.cueNow = false; return; }
    const now = c.t <= PARRY;
    el.style.opacity = '1'; el.className = `cue ${c.kind}${now ? ' now' : ''}`;
    el.firstChild.style.transform = `scale(${1 + 2.6 * clamp(c.t / Math.max(0.3, c.total), 0, 1)})`;
    /* a blow from outside the view: the cue moves to that edge and says so, so it never reads as a prompt with no threat */
    const src = c.foe ? c.foe.pos : c.from || null; let side = 0;
    if (src) { const dx = src.x - this.pos.x; const dz = src.z - this.pos.z; const ang = Math.atan2(dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw), -dx * Math.sin(this.yaw) - dz * Math.cos(this.yaw)); if (Math.abs(ang) > 0.8) side = Math.abs(ang) > 2.3 ? 2 : ang < 0 ? -1 : 1; }
    if (side !== this.cueSide) { this.cueSide = side; el.style.left = side === 0 || side === 2 ? '' : side < 0 ? '9%' : '91%'; el.style.top = side === 2 ? '63%' : ''; } /* the behind cue sits over the caption slot, not in it */
    const word = c.kind === 'dodge' ? 'Dodge' : 'Block'; /* one word for one action ("Block", "Block now" and "Behind · Block"): the ring says now, an arrow says where */
    el.lastChild.textContent = side === 0 ? word : side === 2 ? `▼ ${word}` : side < 0 ? `◀ ${word}` : `${word} ▶`;
    if (now && !this.cueNow) sfx('cueNow');
    this.cueNow = now;
  }

  debug() {
    return { nearHold: (() => { let bd = 1e9; let h = 0; for (const f of this.foes) { if (f.state === 'dead' || f.hold) continue; const d = f.pos.distanceTo(this.pos); if (d < bd) { bd = d; h = this.holdOff(f); } } return h; })(), bossDist: this.bossFoe && this.bossFoe.state !== 'dead' ? Math.max(this.weapon.reach + 0.3 + (this.bossFoe.scale - 1) * 0.6, (this.bossFoe.dress?.keepOut || 0) + 0.4) : this.boss ? 4 : 0, bossHp: this.bossFoe?.hp ?? this.boss?.hp ?? null, hp: this.hp, wave: this.wave, foes: this.foes.filter((f) => f.state !== 'dead').length, over: this.over, tactics: this.groups.map((g) => `${g.def.id}:${g.tactic}`), states: this.foes.map((f) => `${f.def.id}:${f.state}`), debris: this.debris.length, stats: this.stats };
  }
  aimNearest() {
    let best = null; let bd = 1e9;
    for (const f of this.foes) { if (f.state === 'dead' || f.hold) continue; const d = f.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = f; } }
    if (!best && this.boss && !this.boss.dead) {
      const hs = this.boss.hittable(); const f = this.boss.focus?.();
      const tgt = hs.length ? hs.reduce((m, h) => (h.pos.distanceTo(this.pos) < m.pos.distanceTo(this.pos) ? h : m)).pos : f;
      if (!tgt) return null;
      this.yaw = this.yawTo(tgt); return hs.length ? Math.hypot(tgt.x - this.pos.x, tgt.z - this.pos.z) : 99;
    }
    if (!best) return null;
    this.yaw = this.yawTo(best.pos);
    return bd;
  }
}

/* Sage Quest sound engine.
   Real CC0 recordings (web/assets/sfx, see web/assets/real/CREDITS.md) layered per sound name, with a master chain:
   glue compressor, a short generated stone-hall reverb send, a hard limiter and a soft clip that keeps every peak under -1 dBFS.
   Until a sample is decoded, a quiet version of the old synth plays for that name. UI beeps stay synth. */

import { SURFACE_OF, SURFACE_OF_WORLD, SURFACES, AMBIENCE, RECIPES as WORLD_RECIPES, WVOL } from './worlds/sfx-pools.js';
import { PROC, PROC_SR } from './sfx-proc.js';

const BASE = new URL('../assets/sfx/', import.meta.url).href;

/* pool name -> number of variations (files are <pool>_<n>.ogg, n = 1..count). Order = load order. */
const POOLS = {
  wl: 4, wh: 4, st: 3, clang: 5, plate: 4, clunk: 4, mace: 4, ring: 3, tink: 4, shield: 4,
  flesh: 4, wet: 4, thump: 4, punch: 3, gore: 3, hurt: 4, boot: 4, msteps: 5, mail: 3, drop: 4, brk: 4,
  sub: 2, roar: 3, growl: 3, chg: 2, droar: 2, fire: 3, flame: 2, wing: 2, quake: 2, rocks: 2,
  anvil: 3, bell: 2, zap: 2, shade: 2, spark: 1,
};

/* A layer: pool (or "pool#n" for one fixed variation), linear gain, and options:
   rate (playback rate), delay (s), lp / hp (Hz), dur (cut after s), sat (0..1 soft saturation: adds harmonics so deep layers still read on laptop speakers).
   A recipe: layers plus vol (calibrated loudness trim), send (reverb), pri (0 low, 2 high),
   max (plays at once), gap (min seconds between plays), synth (gain of an extra old-synth layer, for UI sounds). */
const L = (pool, g, o = {}) => ({ pool, g, ...o });
const R = (layers, o = {}) => ({ layers, vol: 1, send: 0.12, pri: 1, ...o });

const RECIPES = {
  swing: R([L('wl', 1), L('wh', 0.2, { rate: 1.4, lp: 3000 })], { send: 0.1 }),
  swingHeavy: R([L('wh', 1, { rate: 0.92 }), L('wh', 0.5, { rate: 0.68, lp: 1800, delay: 0.02 }), L('wl', 0.35, { rate: 0.75 }), L('thump', 0.18, { rate: 0.7, delay: 0.1 })], { send: 0.14, pri: 2 }),
  thrust: R([L('st', 1), L('wl', 0.3, { rate: 1.3 })], { send: 0.08 }),
  dodge: R([L('wl', 0.5, { rate: 1.1 }), L('mail', 0.45, { hp: 500, delay: 0.02 }), L('boot', 0.4, { rate: 1.1, delay: 0.05 })], { send: 0.08, pri: 0 }),
  clang: R([L('clang', 1), L('clunk', 0.5, { rate: 1.3, lp: 3000 }), L('ring', 0.1)], { send: 0.2, pri: 2 }),
  clangBig: R([L('plate', 0.8), L('mace', 1), L('clunk', 0.5, { rate: 0.8 }), L('thump', 0.5, { delay: 0.004 }), L('ring', 0.3, { rate: 0.8, dur: 1.1, delay: 0.01 })], { send: 0.22, pri: 2 }),
  deflect: R([L('tink', 0.8), L('clang', 0.55, { rate: 1.15, hp: 800 }), L('ring', 0.08, { rate: 1.4, dur: 0.5 })], { send: 0.16, pri: 2 }),
  parry: R([L('clang', 0.9, { rate: 1.1 }), L('ring', 0.7, { rate: 1.15 }), L('ring', 0.35, { rate: 1.5, delay: 0.012, dur: 1.0 }), L('tink', 0.6, { rate: 1.3 }), L('thump', 0.35, { rate: 1.1 })], { send: 0.24, pri: 2 }),
  block: R([L('shield', 1), L('clang', 0.3, { rate: 0.9, hp: 400 }), L('thump', 0.4)], { send: 0.14, pri: 2 }),
  flesh: R([L('flesh', 0.85), L('wet', 0.5, { delay: 0.004 }), L('thump', 1, { lp: 400, sat: 0.25 }), L('punch', 0.3, { delay: 0.002 })], { send: 0.1, pri: 2 }),
  hit: R([L('flesh', 0.85, { rate: 1.05 }), L('thump', 1, { lp: 400, sat: 0.25 }), L('wet', 0.4, { delay: 0.004 }), L('punch', 0.3, { delay: 0.002 })], { send: 0.1, pri: 2 }),
  kick: R([L('punch', 1, { sat: 0.3 }), L('thump', 0.6), L('boot', 0.5)], { send: 0.1, pri: 2 }),
  kill: R([L('punch', 1, { rate: 0.9 }), L('flesh', 0.8), L('gore', 0.7, { delay: 0.03 }), L('sub#1', 0.45, { delay: 0.02, dur: 1.4, sat: 0.35 }), L('thump', 0.7, { rate: 0.8 })], { send: 0.18, pri: 2 }),
  execute: R([L('plate', 0.9), L('mace', 0.6), L('gore', 0.9, { delay: 0.06 }), L('flesh', 0.8), L('sub#1', 0.6, { dur: 1.8, sat: 0.35 }), L('thump', 0.7, { rate: 0.75 }), L('ring', 0.25, { rate: 0.7, delay: 0.04, dur: 1.2 })], { send: 0.24, pri: 2 }),
  breakPart: R([L('clunk', 0.9, { rate: 0.9 }), L('brk', 0.7, { delay: 0.01, lp: 9000 }), L('plate', 0.8), L('ring', 0.2, { dur: 0.9 })], { send: 0.18, pri: 2 }),
  drop: R([L('drop', 1)], { send: 0.1, pri: 0, max: 3, gap: 0.05 }),
  stagger: R([L('plate', 0.8, { rate: 1.1 }), L('thump', 0.6), L('mail', 0.5, { delay: 0.02 }), L('shield', 0.3)], { send: 0.14, pri: 2 }),
  down: R([L('thump', 1, { rate: 0.8, sat: 0.3 }), L('plate', 0.7, { rate: 0.85 }), L('mail', 0.6, { delay: 0.03 }), L('brk', 0.35, { delay: 0.08 }), L('sub#2', 0.4, { sat: 0.35 })], { send: 0.2, pri: 2 }),
  hurt: R([L('hurt', 1), L('thump', 0.35, { rate: 1.2 })], { send: 0.1, pri: 2 }),
  /* 'step' is now only the dragon's foot (dragon.js). The hero's feet are procedural: see sfxFoot below. The old recipe had a chain-mail jingle (4 kHz) in every step. */
  step: R([L('thump', 1, { rate: 0.8, lp: 320 }), L('boot', 0.55, { rate: 0.78, lp: 1100 }), L('rocks', 0.12, { lp: 1500, dur: 0.3 })], { send: 0.1, pri: 0, max: 2, gap: 0.12 }),
  charge: R([L('chg', 1)], { send: 0.1, pri: 1 }),
  spawn: R([L('shade', 0.7), L('sub#1', 0.45, { dur: 1.6 }), L('flame', 0.35, { rate: 0.8 })], { send: 0.28 }),
  quake: R([L('quake', 1), L('sub#1', 0.8, { dur: 2.0, sat: 0.4 }), L('rocks', 0.6, { delay: 0.15 }), L('thump', 0.8, { rate: 0.6 })], { send: 0.3, pri: 2 }),
  roar: R([L('roar', 1), L('growl', 0.45)], { send: 0.26, pri: 2 }),
  dragonRoar: R([L('droar', 1), L('droar', 0.7, { rate: 0.85 }), L('roar', 0.4, { rate: 0.6, delay: 0.05 }), L('sub#1', 0.4, { dur: 2.0, sat: 0.5 }), L('quake', 0.25, { delay: 0.1 })], { send: 0.32, pri: 2 }),
  dragonGrowl: R([L('growl', 1, { rate: 0.85 }), L('growl', 0.6, { rate: 0.65, delay: 0.03 }), L('sub#2', 0.2, { sat: 0.4 })], { send: 0.22, pri: 2 }),
  fireBreath: R([L('fire', 1), L('fire', 0.7, { rate: 0.75, delay: 0.1 }), L('flame', 0.8), L('wh', 0.3, { rate: 0.6 })], { send: 0.2, pri: 2 }),
  wingBeat: R([L('wing', 1, { sat: 0.6 }), L('wh', 0.9, { rate: 0.8 }), L('thump', 0.3, { rate: 0.6, sat: 0.5 })], { send: 0.2, pri: 0, max: 2, gap: 0.2 }),
  bolt: R([L('zap', 0.9), L('wl', 0.5, { rate: 1.4 })], { send: 0.14 }),
  soul: R([L('spark', 0.6), L('bell', 0.1, { rate: 2, dur: 0.9 })], { send: 0.2, synth: 0.35 }),
  /* one sound per question step (six steps shared 'piece'): a chisel on stone, wind and a low swell, a star
     chime, a strike, steps and a warm chord, a low horn. Built from the pools above; levels set by ear-free estimate (vol). */
  qName: R([L('rocks', 0.5, { lp: 1800, dur: 0.35 }), L('tink', 0.5, { rate: 0.7 }), L('thump', 0.35, { rate: 0.9 })], { send: 0.18, vol: 0.8 }),
  qLand: R([L('p:pwWind', 0.7), L('sub#1', 0.3, { dur: 1.6 }), L('bell', 0.08, { rate: 0.6, dur: 1.6, delay: 0.25 })], { send: 0.24, vol: 0.7 }),
  qBorn: R([L('p:pwRainStars', 0.7), L('bell', 0.1, { rate: 1.9, dur: 1.2, delay: 0.1 })], { send: 0.26, vol: 0.6 }),
  qClass: R([L('p:pwSkyStrike', 0.55), L('bell', 0.22, { rate: 1.2, dur: 1.2, delay: 0.02 }), L('thump', 0.5, { rate: 0.8 })], { send: 0.24, vol: 0.7, pri: 2 }),
  qHeart: R([L('boot', 0.5, { rate: 0.9, lp: 1400 }), L('boot', 0.45, { rate: 0.95, lp: 1400, delay: 0.24 }), L('bell', 0.16, { rate: 0.75, dur: 1.5, delay: 0.3 }), L('bell', 0.12, { rate: 0.94, dur: 1.5, delay: 0.36 }), L('bell', 0.1, { rate: 1.125, dur: 1.5, delay: 0.42 })], { send: 0.22, vol: 0.8 }),
  qEnemy: R([L('growl', 0.5, { rate: 0.5 }), L('sub#1', 0.6, { dur: 2.0, sat: 0.4 }), L('roar', 0.18, { rate: 0.45, delay: 0.05 })], { send: 0.3, vol: 0.6, pri: 2 }),
  piece: R([L('clunk', 0.5, { rate: 1.2 }), L('tink', 0.5, { rate: 0.8 }), L('mail', 0.6)], { send: 0.16, synth: 0.3 }),
  forge: R([L('anvil', 1), L('clang', 0.6, { rate: 0.9 }), L('ring', 0.35, { rate: 0.9, dur: 1.2 }), L('bell', 0.3, { rate: 1.4, dur: 1.1 }), L('thump', 0.5)], { send: 0.28, synth: 0.3, pri: 2 }),
  win: R([L('bell', 0.9, { rate: 0.75 }), L('bell', 0.6, { delay: 0.18 }), L('bell', 0.5, { rate: 1.26, delay: 0.36 })], { send: 0.3, synth: 0.35 }),
  /* pure UI sounds: no sample layers, the synth is the sound */
  warn: R([], { synth: 1, send: 0.04, pri: 2 }),
  cueNow: R([], { synth: 1, send: 0.02, pri: 2 }),
  tactic: R([], { synth: 1, send: 0.04 }),
  /* ranged weapons and powers. "p:<name>" is a procedural pool (web/src/sfx-proc.js), made once at start, no files.
     Level order: a shot sits with the hits, at or under them; the gun's handling sits with the swings. */
  gunshot: R([L('p:gunshot', 1)], { send: 0.03, pri: 2, max: 4 }),
  rifleShot: R([L('p:rifleShot', 1)], { send: 0.03, pri: 2, max: 3 }),
  gunCock: R([L('p:gunCock', 1)], { send: 0.02, max: 2 }),
  leverCycle: R([L('p:leverCycle', 1)], { send: 0.03, max: 2 }),
  gunDry: R([L('p:gunDry', 1)], { send: 0.02, max: 2, gap: 0.08 }),
  gunOpen: R([L('p:gunOpen', 1)], { send: 0.02, max: 1 }),
  gunLoad: R([L('p:gunLoad', 1)], { send: 0.02, max: 2, gap: 0.08 }),
  gunClose: R([L('p:gunClose', 1)], { send: 0.03, max: 1 }),
  stunCharge: R([L('p:stunCharge', 1)], { send: 0.03, max: 2 }),
  stunShot: R([L('p:stunShot', 1)], { send: 0.08, pri: 2, max: 4 }),
  stunVent: R([L('p:stunVent', 1)], { send: 0.06, max: 1 }),
  bowDraw: R([L('p:bowDraw', 1)], { send: 0.03, max: 1 }),
  bowLoose: R([L('p:bowLoose', 1)], { send: 0.05, pri: 2, max: 2 }),
  arrowFlight: R([L('p:arrowFlight', 1)], { send: 0.04, pri: 0, max: 3 }),
  arrowHit: R([L('p:arrowHit', 1)], { send: 0.06, pri: 2, max: 3 }),
  arrowWood: R([L('p:arrowWood', 1)], { send: 0.08, max: 3 }),
  arrowArmor: R([L('p:arrowArmor', 1)], { send: 0.12, pri: 2, max: 3 }),
  pistolWhip: R([L('p:pistolWhip', 1), L('punch', 0.45, { rate: 0.9, lp: 3000 })], { send: 0.08, pri: 2 }),
  pwBreath: R([L('p:pwBreath', 1)], { send: 0.12, pri: 2, max: 1 }),
  pwGust: R([L('p:pwGust', 1)], { send: 0.1, pri: 2, max: 1 }),
  pwSizzle: R([L('p:pwSizzle', 1)], { send: 0.06, pri: 0, max: 1, gap: 0.3 }),
  pwRime: R([L('p:pwRime', 1)], { send: 0.08, pri: 0, max: 1, gap: 0.3 }),
  pwFreeze: R([L('p:pwFreeze', 1)], { send: 0.2, pri: 2, max: 1 }),
  pwCryo: R([L('p:pwCryo', 1)], { send: 0.18, pri: 2, max: 1 }),
  pwShatter: R([L('p:pwShatter', 1)], { send: 0.18, pri: 2, max: 2 }),
  pwBolt: R([L('p:pwBolt', 1)], { send: 0.16, pri: 2, max: 2 }),
  pwChain: R([L('p:pwChain', 1)], { send: 0.12, pri: 2, max: 3, gap: 0.04 }),
  pwMark: R([L('p:pwMark', 1)], { send: 0.2, pri: 2, max: 1 }),
  pwMarkDusk: R([L('p:pwMarkDusk', 1)], { send: 0.12, pri: 2, max: 1 }),
  pwBurst: R([L('p:pwBurst', 1)], { send: 0.2, pri: 2, max: 2 }),
  pwSummon: R([L('p:pwSummon', 1)], { send: 0.24, pri: 2, max: 1 }),
  pwDrone: R([L('p:pwDrone', 1)], { send: 0.1, pri: 2, max: 1 }),
  pwWisp: R([L('p:pwWisp', 1)], { send: 0.18, max: 3 }),
  pwWispHit: R([L('p:pwWispHit', 1)], { send: 0.18, pri: 2, max: 3 }),
  pwDroneShot: R([L('p:pwDroneShot', 1)], { send: 0.1, pri: 2, max: 2 }),
  pwWard: R([L('p:pwWard', 1)], { send: 0.26, pri: 2, max: 1 }),
  pwWardHearth: R([L('p:pwWardHearth', 1)], { send: 0.22, pri: 2, max: 1 }),
  pwReflect: R([L('p:pwReflect', 1)], { send: 0.24, pri: 2, max: 2 }),
  pwRainWarn: R([L('p:pwRainWarn', 1)], { send: 0.12, pri: 2, max: 1 }),
  pwRainStars: R([L('p:pwRainStars', 1)], { send: 0.24, pri: 2, max: 1 }),
  pwSkyStrike: R([L('p:pwSkyStrike', 1)], { send: 0.16, pri: 2, max: 3 }),
  pwStarFall: R([L('p:pwStarFall', 1)], { send: 0.16, max: 3 }),
  pwStar: R([L('p:pwStar', 1)], { send: 0.24, pri: 2, max: 3 }),
  pwDash: R([L('p:pwDash', 1)], { send: 0.1, pri: 2, max: 1 }),
  pwDashWind: R([L('p:pwDashWind', 1)], { send: 0.14, pri: 2, max: 1 }),
  pwCut: R([L('p:pwCut', 1)], { send: 0.14, pri: 2, max: 3, gap: 0.05 }),
  pwSlamUp: R([L('p:pwSlamUp', 1)], { send: 0.08, pri: 2, max: 1 }),
  pwSlam: R([L('p:pwSlam', 1)], { send: 0.2, pri: 2, max: 1 }),
  pwPulse: R([L('p:pwPulse', 1)], { send: 0.16, pri: 2, max: 1 }),
  pwThrow: R([L('p:pwThrow', 1)], { send: 0.06, max: 1 }),
  pwFuse: R([L('p:pwFuse', 1)], { send: 0.06, max: 2 }),
  pwBounce: R([L('p:pwBounce', 1)], { send: 0.08, max: 2 }),
  pwBlast: R([L('p:pwBlast', 1)], { send: 0.05, pri: 2, max: 2 }),
  pwWind: R([L('p:pwWind', 1)], { send: 0.1, pri: 2, max: 1 }),
  pwWhirl: R([L('p:pwWhirl', 1)], { send: 0.06, pri: 0, max: 1 }),
  pwWindEnd: R([L('p:pwWindEnd', 1)], { send: 0.14, pri: 2, max: 1 }),
  pwThorns: R([L('p:pwThorns', 1)], { send: 0.16, pri: 2, max: 1 }),
  pwSnare: R([L('p:pwSnare', 1)], { send: 0.1, max: 2, gap: 0.15 }),
  /* foe voices (CC0 creature pools, pitched per world in sfx-pools.js): a grunt when struck, a cry when it falls */
  foeHurt: R([L('hurt', 1, { rate: 0.82, lp: 2600 }), L('growl', 0.2, { rate: 1.1, lp: 2000, dur: 0.5 })], { send: 0.1, max: 2, gap: 0.15 }),
  foeDie: R([L('hurt', 1, { rate: 0.72, lp: 2400 }), L('growl', 0.35, { rate: 0.9, lp: 1800, dur: 0.9 })], { send: 0.16, pri: 2, max: 2 }),
};

/* Loudness trims, set by rendering every sound offline through the master chain and measuring BS.1770 momentary loudness
   (see report in the project notes). Edit a number to make one sound louder or quieter; 0.1 is about 1 dB. */
/* VOL-BEGIN */
const VOL = {
  swing: 0.898,
  swingHeavy: 0.831,
  thrust: 1.036,
  dodge: 0.882,
  clang: 3.009,
  clangBig: 1.52,
  deflect: 2.003,
  parry: 1.663,
  block: 1.8,
  flesh: 0.42,
  hit: 0.426,
  kick: 0.44,
  kill: 0.619,
  execute: 0.632,
  breakPart: 0.841,
  drop: 0.649,
  stagger: 1.093,
  down: 0.351,
  hurt: 0.497,
  step: 0.422,
  charge: 0.318,
  spawn: 0.53,
  quake: 0.468,
  roar: 0.413,
  dragonRoar: 0.282,
  dragonGrowl: 0.294,
  fireBreath: 0.384,
  wingBeat: 0.123,
  bolt: 0.624,
  soul: 1.255,
  piece: 1.128,
  forge: 1.063,
  win: 1.285,
  gunshot: 1.238,
  rifleShot: 1.347,
  pistolWhip: 1.266,
  stunShot: 1.506,
  arrowHit: 1.901,
  arrowArmor: 0.744,
  arrowWood: 1.622,
  pwBlast: 0.927,
  pwBurst: 0.959,
  pwSlam: 1.07,
  pwReflect: 0.661,
  pwShatter: 1.134,
  pwPulse: 0.847,
  pwCut: 1.051,
  pwSkyStrike: 0.707,
  pwWindEnd: 0.769,
  pwChain: 2.082,
  pwStar: 0.582,
  pwFreeze: 0.484,
  pwCryo: 0.365,
  pwBolt: 0.724,
  pwThorns: 0.62,
  pwBreath: 0.389,
  pwGust: 0.316,
  pwWard: 0.243,
  pwWardHearth: 0.388,
  pwDash: 0.531,
  pwDashWind: 0.469,
  pwWispHit: 1.039,
  pwMarkDusk: 0.272,
  pwMark: 0.314,
  pwSummon: 0.27,
  pwDroneShot: 2.385,
  pwWind: 0.373,
  pwDrone: 0.279,
  foeDie: 0.353,
  foeHurt: 0.331,
  bowLoose: 0.611,
  pwRainWarn: 0.315,
  pwRainStars: 0.178,
  pwSnare: 0.638,
  pwSlamUp: 0.404,
  pwThrow: 0.51,
  leverCycle: 0.696,
  gunClose: 1.294,
  pwBounce: 1.063,
  pwWisp: 0.434,
  gunCock: 1.032,
  stunVent: 0.175,
  gunOpen: 1.208,
  stunCharge: 0.199,
  bowDraw: 0.215,
  pwFuse: 0.196,
  pwStarFall: 0.129,
  arrowFlight: 0.333,
  gunDry: 1.918,
  gunLoad: 1.159,
  pwSizzle: 0.403,
  pwRime: 0.4,
  pwWhirl: 0.228,
};
/* VOL-END */
for (const [n, v] of Object.entries(VOL)) if (RECIPES[n]) RECIPES[n].vol = v;
/* per-world overrides (web/src/worlds/sfx-pools.js). Their trim is WVOL[world][name], else the dark trim. */
for (const [w, set] of Object.entries(WORLD_RECIPES)) for (const [n, r] of Object.entries(set)) r.vol = WVOL[w]?.[n] ?? VOL[n] ?? 1;

/* ---------------------------------------------------------------- the old synth (fallback and UI beeps) */
let ctx = null;
let dest = null; /* where the synth helpers connect; set for each call */
function noise(dur) {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; return src;
}
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(type, f0, f1, dur, peak, when = 0) {
  const t = ctx.currentTime + when; const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.006, peak, dur); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function hiss(f0, f1, dur, peak, q = 1.2, when = 0) {
  const t = ctx.currentTime + when; const n = noise(dur); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
  f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, 0.01, peak, dur); n.connect(f).connect(g).connect(dest); n.start(t); n.stop(t + dur + 0.02);
}
/* A struck plate: a short noise crack and a few inharmonic partials that ring. */
function clangSynth(base, dur, peak) {
  const parts = [1, 2.76, 5.4, 8.93];
  parts.forEach((m, i) => tone(i % 2 ? 'triangle' : 'sine', base * m * (0.97 + Math.random() * 0.06), base * m * 0.985, dur * (1 - i * 0.18), peak / (1 + i * 0.9)));
  hiss(6000, 2500, 0.05, peak * 1.6, 1.5);
}
function thud(f, dur, peak) { tone('sine', f, f * 0.35, dur, peak); hiss(900, 120, dur * 0.8, peak * 0.5, 0.5); }
const SYNTH = {
  swingHeavy: () => { hiss(260, 1700, 0.34, 0.6, 0.8); tone('sine', 90, 60, 0.3, 0.2); },
  thrust: () => hiss(900, 3400, 0.14, 0.45, 1.1),
  clang: () => clangSynth(620 + Math.random() * 240, 0.5, 0.2),
  clangBig: () => { clangSynth(310 + Math.random() * 90, 0.9, 0.3); thud(110, 0.25, 0.8); },
  deflect: () => { clangSynth(1150, 0.3, 0.2); hiss(7000, 4000, 0.07, 0.4, 2); },
  parry: () => { clangSynth(1480, 0.7, 0.26); tone('sine', 2960, 2900, 0.9, 0.08, 0.02); },
  flesh: () => { thud(140, 0.14, 0.9); },
  kick: () => { thud(95, 0.2, 1.0); hiss(500, 150, 0.12, 0.5, 0.6); },
  breakPart: () => { clangSynth(430 + Math.random() * 200, 0.6, 0.24); hiss(3000, 600, 0.18, 0.45, 0.7); },
  drop: () => clangSynth(520 + Math.random() * 500, 0.22, 0.07),
  stagger: () => { tone('sawtooth', 240, 110, 0.22, 0.2); hiss(1200, 300, 0.2, 0.3, 0.6); },
  down: () => { thud(70, 0.35, 1.0); clangSynth(260, 0.4, 0.12); },
  warn: () => { tone('square', 196, 196, 0.16, 0.12); tone('square', 277, 277, 0.2, 0.12, 0.05); },
  charge: () => { tone('sine', 110, 330, 0.5, 0.16); hiss(300, 1400, 0.5, 0.12, 2); },
  soul: () => { tone('sine', 880, 1760, 0.5, 0.1); tone('sine', 1320, 2640, 0.6, 0.07, 0.06); },
  execute: () => { thud(60, 0.5, 1.0); clangSynth(220, 1.2, 0.3); hiss(4000, 300, 0.5, 0.5, 0.5); },
  step: () => thud(80, 0.06, 0.12),
  cueNow: () => { tone('sine', 1760, 1760, 0.09, 0.12); },
  bolt: () => { hiss(1200, 4200, 0.25, 0.3, 2); tone('sawtooth', 220, 660, 0.25, 0.08); },
  quake: () => { thud(48, 0.7, 1.0); hiss(300, 60, 0.6, 0.6, 0.4); },
  roar: () => { tone('sawtooth', 110, 55, 1.2, 0.3); tone('sawtooth', 164, 70, 1.1, 0.2, 0.05); hiss(500, 150, 1.1, 0.5, 0.5); },
  swing: () => hiss(500, 2600, 0.22, 0.5, 0.9),
  hit: () => { tone('sine', 150, 50, 0.16, 0.9); hiss(2400, 500, 0.09, 0.5, 0.7); },
  kill: () => { tone('sine', 120, 38, 0.3, 0.9); hiss(1600, 200, 0.28, 0.5, 0.6); },
  block: () => { tone('square', 1250, 1180, 0.14, 0.16); tone('square', 1870, 1790, 0.11, 0.12); hiss(5000, 3000, 0.06, 0.3, 2); },
  hurt: () => { tone('sawtooth', 190, 70, 0.25, 0.4); hiss(700, 200, 0.2, 0.4, 0.8); },
  dodge: () => hiss(900, 300, 0.2, 0.3, 0.7),
  spawn: () => { tone('sine', 55, 90, 0.7, 0.6); hiss(200, 700, 0.6, 0.25, 0.8); },
  piece: () => { tone('sine', 660, 660, 0.5, 0.2); tone('sine', 990, 990, 0.7, 0.14, 0.07); },
  forge: () => { tone('square', 900, 860, 0.2, 0.14); tone('sine', 1320, 1300, 0.9, 0.2, 0.02); hiss(4000, 1500, 0.3, 0.3, 1.5); },
  tactic: () => tone('triangle', 320, 240, 0.12, 0.14),
  win: () => { tone('sine', 523, 523, 0.5, 0.2); tone('sine', 659, 659, 0.5, 0.2, 0.14); tone('sine', 784, 784, 0.9, 0.22, 0.28); },
  dragonRoar: () => { tone('sawtooth', 92, 48, 1.6, 0.32); tone('sawtooth', 61, 40, 1.8, 0.28, 0.05); hiss(400, 160, 1.6, 0.5, 0.6); hiss(2600, 700, 1.2, 0.18, 0.9, 0.1); },
  dragonGrowl: () => { tone('sawtooth', 70, 52, 0.7, 0.2); hiss(300, 140, 0.7, 0.3, 0.7); },
  fireBreath: () => { hiss(1800, 500, 1.6, 0.55, 0.5); hiss(240, 120, 1.6, 0.45, 0.8); tone('sine', 55, 45, 1.5, 0.25); },
  wingBeat: () => { hiss(180, 70, 0.45, 0.6, 0.6); tone('sine', 50, 35, 0.35, 0.3); },
};

/* ---------------------------------------------------------------- master chain */
const MASTER = 0.65; /* about -2.8 dB: leaves headroom for stacked sounds */
const WET = 0.5;
const RATE_JIT = 0.06; /* +-6 % playback rate per layer */
const GAIN_JIT_DB = 1.5; /* +-1.5 dB per layer */
const VOICE_CAP = 64; /* layers playing at once; low-priority sounds are dropped above this */

/* A small stone hall: decaying noise that gets darker with time, a pre-delay and four early reflections. */
function makeIR(c) {
  const sr = c.sampleRate; const len = Math.floor(sr * 1.7); const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch); let y = 0; const pre = Math.floor(sr * 0.012);
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr; const k = Math.min(0.94, 0.3 + 0.64 * Math.min(1, t / 0.9));
      y = y * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = y * Math.exp(-6.9 * t / 1.15) * Math.min(1, t / 0.02);
    }
    [0.009, 0.017, 0.029, 0.041].forEach((tt, j) => { const p = Math.floor(sr * (tt + ch * 0.0017)); if (p < len) d[p] += (j % 2 ? -1 : 1) * 0.5 / (1 + j * 0.7); });
  }
  return ir;
}
function makeChain(c) {
  const bus = c.createGain();
  const glue = c.createDynamicsCompressor();
  glue.threshold.value = -14; glue.knee.value = 14; glue.ratio.value = 2.5; glue.attack.value = 0.006; glue.release.value = 0.2;
  const trim = c.createGain(); trim.gain.value = MASTER;
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.09;
  /* soft clip: |out| < 0.85 (-1.4 dBFS) for any input, near-linear below 0.5. No oversampling, so the bound is exact (2x oversampling rings above the bound). */
  const shaper = c.createWaveShaper(); const N = 2048; const curve = new Float32Array(N);
  for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 4 - 2; curve[i] = 0.85 * Math.tanh(x / 0.85); }
  shaper.curve = curve; shaper.oversample = 'none';
  const sfxGate = c.createGain(); sfxGate.connect(glue); bus.connect(sfxGate); /* audio bar: sfxGate = sound effects on/off (the music joins at glue) */
  const master = c.createGain(); /* audio bar: the one master mute + volume, last before the speakers */
  glue.connect(trim); trim.connect(lim); lim.connect(shaper); shaper.connect(master); master.connect(c.destination);
  const verb = c.createConvolver(); verb.buffer = makeIR(c);
  const wet = c.createGain(); wet.gain.value = WET; verb.connect(wet); wet.connect(sfxGate);
  return { bus, verb, wet, glue, sfxGate, master };
}

/* ---------------------------------------------------------------- samples */
const buffers = {}; /* pool -> AudioBuffer[] (index n-1, undefined while missing) */
const history = {}; /* pool -> recent picks, so a variation never repeats at once */
const status = { total: 0, loaded: 0, failed: [], started: false, done: false };
let chain = null;
let uiOut = null;

function toMono(buf) {
  if (buf.numberOfChannels === 1) return buf;
  const m = ctx.createBuffer(1, buf.length, buf.sampleRate); m.getChannelData(0).set(buf.getChannelData(0)); return m;
}
async function loadOne(pool, n) {
  const url = `${BASE}${pool}_${n}.ogg`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.arrayBuffer();
    const buf = toMono(await ctx.decodeAudioData(raw));
    (buffers[pool] || (buffers[pool] = []))[n - 1] = buf; status.loaded++;
  } catch (e) { status.failed.push({ url, error: String(e && e.message || e) }); }
}
/* worlds: setSfxWorld(id, pools) swaps a pool to web/assets/sfx/<id>/<pool>_<n>.ogg; a pool (or a file) the world does
   not have plays the dark one. pools = the world module's sfxPools { pool: count }; only those files are fetched. */
let worldId = 'dark'; let worldPools = {}; const worldBuffers = {};
async function loadWorldOne(id, pool, n) {
  const url = `${BASE}${id}/${pool}_${n}.ogg`;
  try {
    const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = toMono(await ctx.decodeAudioData(await res.arrayBuffer()));
    const per = worldBuffers[id] || (worldBuffers[id] = {}); (per[pool] || (per[pool] = []))[n - 1] = buf;
  } catch (e) { status.failed.push({ url, error: String(e && e.message || e) }); }
}
function loadWorldPools() {
  if (!ctx || worldId === 'dark') return;
  const id = worldId;
  for (const [pool, count] of Object.entries(worldPools)) { if (lateGo && !EARLY.has(pool)) continue; /* fight-only pools wait for the late gate */
    for (let n = 1; n <= count; n++) if (!worldBuffers[id]?.[pool]?.[n - 1] && !worldAsked.has(`${id}/${pool}_${n}`)) { worldAsked.add(`${id}/${pool}_${n}`); loadWorldOne(id, pool, n); } }
}
/* the pools the title, the questions and the forge play (qName..qEnemy, piece, forge, soul, deflect, fireBreath,
   spawn, win) load first; the fight-only pools (about 50 of 86 files) wait until the forge is done (body.built), the fight
   starts (body.st-fight) or LATE_MS after the audio unlock, or start at
   once when a sound needs one of them (a quick-start fight). Question 1 then does not share a phone's bandwidth with them.
   */
const EARLY = new Set(['rocks', 'tink', 'thump', 'sub', 'bell', 'boot', 'growl', 'roar', 'clunk', 'mail', 'anvil', 'clang', 'ring', 'spark', 'shade', 'flame', 'fire', 'wh']);
const LATE_MS = 60000; /* 2 workers only: the questions' Sage2 calls keep free connections (HTTP/1.1 allows 6 per host; a 4-worker load at 9 s timed out a question call) */ const worldAsked = new Set();
let lateGo = null; const lateP = new Promise((r) => { lateGo = r; });
function startLate() { if (!lateGo) return; const go = lateGo; lateGo = null; go(); loadWorldPools(); }
export function setSfxWorld(id = 'dark', pools = {}) {
  worldId = id || 'dark'; worldPools = worldId === 'dark' ? {} : { ...(pools || {}) };
  loadWorldPools(); prewarm();
}
/* the buffers of a pool in the current world, or the dark ones */
function poolOf(pool) { if (pool.startsWith('p:')) return procPool(pool.slice(2)); const w = worldId !== 'dark' ? worldBuffers[worldId]?.[pool] : null; return w && w.some(Boolean) ? w : buffers[pool]; }
async function loadAll() {
  const jobs = [];
  for (const [pool, count] of Object.entries(POOLS)) for (let n = 1; n <= count; n++) jobs.push([pool, n]);
  status.total = jobs.length;
  jobs.sort((a, b) => (EARLY.has(b[0]) ? 1 : 0) - (EARLY.has(a[0]) ? 1 : 0)); /* early pools first (stable sort keeps the pool order) */
  const nEarly = jobs.filter(([p]) => EARLY.has(p)).length;
  let next = 0;
  const worker = async (end) => { while (next < end) { const [p, n] = jobs[next++]; await loadOne(p, n); } };
  await Promise.all([worker(nEarly), worker(nEarly), worker(nEarly), worker(nEarly), worker(nEarly), worker(nEarly)]);
  if (next < jobs.length) { await lateP; await Promise.all([worker(jobs.length), worker(jobs.length)]); }
  status.done = true;
}

function pick(pool, forced) {
  const arr = poolOf(pool); if (!arr) return null;
  const avail = []; for (let i = 0; i < arr.length; i++) if (arr[i]) avail.push(i);
  if (!avail.length) return null;
  if (forced != null) return arr[avail[forced % avail.length]];
  if (avail.length === 1) return arr[avail[0]];
  const h = history[pool] || (history[pool] = []); let i; let tries = 0;
  do { i = avail[Math.floor(Math.random() * avail.length)]; } while (h.includes(i) && ++tries < 12);
  h.push(i); if (h.length > Math.min(2, avail.length - 1)) h.shift();
  return arr[i];
}
function layerReady(l) { const a = poolOf(l.pool.split('#')[0]); return !!(a && a.some(Boolean)); }
/* the recipe of a name in the current world (an override from sfx-pools.js, else the dark one) */
function rec(name) { return (worldId !== 'dark' && WORLD_RECIPES[worldId]?.[name]) || RECIPES[name]; }
function ready(name) { const r = rec(name); return !!r && r.layers.every(layerReady); }

/* ---------------------------------------------------------------- playing */
const active = []; /* {name, t, end, layers} */
let layerCount = 0;

const satCurves = {};
function satCurve(a) {
  if (satCurves[a]) return satCurves[a];
  const N = 1024; const k = 1 + a * 5; const cv = new Float32Array(N);
  for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); }
  return (satCurves[a] = cv);
}

/* Plays the sample layers of a recipe into c / ch at time t. Returns the end time. */
function playLayers(c, ch, name, o, t) {
  const r = rec(name);
  const out = c.createGain(); out.gain.value = r.vol * (o.gain == null ? 1 : o.gain);
  const send = c.createGain(); send.gain.value = r.send;
  let tail = out;
  if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); out.connect(p); tail = p; }
  tail.connect(ch.bus); tail.connect(send); send.connect(ch.verb);
  let end = t; let n = 0;
  for (const l of r.layers) {
    const [pool, idx] = l.pool.split('#');
    const buf = pick(pool, idx ? Number(idx) - 1 : (o.variant != null ? o.variant : null));
    if (!buf) continue;
    const src = c.createBufferSource(); src.buffer = buf;
    const jit = o.fixed ? 1 : 1 + (Math.random() * 2 - 1) * RATE_JIT;
    const rate = (l.rate || 1) * (o.rate || 1) * jit; src.playbackRate.value = rate;
    let node = src;
    if (l.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = l.hp; f.Q.value = 0.6; node.connect(f); node = f; }
    if (l.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = l.lp; f.Q.value = 0.6; node.connect(f); node = f; }
    if (l.sat) { const w = c.createWaveShaper(); w.curve = satCurve(l.sat); w.oversample = '2x'; node.connect(w); node = w; }
    const g = c.createGain(); const gj = o.fixed ? 1 : Math.pow(10, ((Math.random() * 2 - 1) * GAIN_JIT_DB) / 20);
    g.gain.value = l.g * gj; node.connect(g); g.connect(out);
    const t0 = t + (l.delay || 0); const len = buf.duration / rate; const stop = l.dur ? Math.min(len, l.dur) : len;
    if (l.dur && l.dur < len) { g.gain.setValueAtTime(l.g * gj, t0 + stop - 0.05); g.gain.linearRampToValueAtTime(0, t0 + stop); }
    src.start(t0); src.stop(t0 + stop + 0.01);
    end = Math.max(end, t0 + stop); n++;
    if (c === ctx) { layerCount++; src.onended = () => { layerCount--; }; }
  }
  return { end, n, out };
}
function playSynth(name, gain, to) {
  const fn = SYNTH[name]; if (!fn) return;
  const g = ctx.createGain(); g.gain.value = gain; g.connect(to); dest = g;
  try { fn(); } finally { dest = null; }
}

/* the boss payoff (death-director.js) ducks the whole mix (every sample, bed, step and reverb return) to a
   level (1 = normal) over `secs`, and plays its own voices past the duck: sfxVoice() = { ctx, out, ir } (out = the master
   compressor input, ir = the reverb impulse), or null while audio is locked. Both are safe to call at any time. */
export function sfxDuck(level = 1, secs = 0.25) {
  if (!ctx || !chain) return;
  try { const t = ctx.currentTime; const L = Math.max(0, Math.min(1, level)); const d = Math.max(0.02, secs);
    for (const [g, base] of [[chain.bus.gain, 1], [chain.wet.gain, WET]]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(base * L, t + d); } } catch { /* audio is optional */ }
}
export function sfxVoice() { return ctx && chain ? { ctx, out: chain.sfxGate, music: chain.glue, ir: chain.verb.buffer } : null; } /* out = sound effects (gated by the audio bar), music = the score's input */
export function sfxBus() { return ctx && chain ? { ctx, master: chain.master, sfxGate: chain.sfxGate } : null; } /* audio-bar.js */
export function sfxDuckLevel() { return ctx && chain ? +chain.bus.gain.value.toFixed(3) : null; } /* tests: the mix duck now (1 = normal) */

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    chain = makeChain(ctx);
    uiOut = ctx.createGain(); uiOut.gain.value = 1; uiOut.connect(chain.bus);
    try { window.dispatchEvent(new Event('sq-audio-ready')); } catch { /* the audio bar applies its saved state here */ }
    status.started = true;
    loadAll().catch(() => { status.done = true; }); loadWorldPools(); prewarm(); procWarm();
    if (lateGo) { const t0 = performance.now(); const iv = setInterval(() => { const c = document.body?.classList; if (!lateGo || (c && (c.contains('built') || c.contains('st-fight'))) || performance.now() - t0 > LATE_MS) { clearInterval(iv); startLate(); } }, 1000); } /* the fight-only pools follow at the forge */
  } catch { ctx = null; }
}

/* sfx(name) or sfx(name, { gain, rate, pan }). Dev options: synth (force the old synth), variant (force one variation). */
export function sfx(name, o = {}) {
  if (!ctx || !RECIPES[name]) return;
  try {
    const r = rec(name); const now = ctx.currentTime;
    for (let i = active.length - 1; i >= 0; i--) if (active[i].end < now) active.splice(i, 1);
    const same = active.filter((a) => a.name === name);
    if (r.max && same.length >= r.max) return;
    if (r.gap && same.length && now - same[same.length - 1].t < r.gap) return;
    if (r.pri < 2 && layerCount > VOICE_CAP) return;
    const gain = o.gain == null ? 1 : o.gain;
    const useSamples = !o.synth && r.layers.length > 0 && ready(name);
    if (!useSamples && lateGo && r.layers.some((l) => !l.pool.startsWith('p:') && !EARLY.has(l.pool.split('#')[0]))) startLate(); /* a fight sound before the gate opens: load the rest now */
    if (!useSamples) {
      /* fallback (samples still loading) is quiet; pure UI sounds and a forced synth play at the old level */
      const ui = !r.layers.length || o.synth;
      playSynth(name, (ui ? 0.5 : 0.22) * gain, uiOut);
      active.push({ name, t: now, end: now + 0.6 });
      return;
    }
    const res = playLayers(ctx, chain, name, o, now + 0.005);
    if (r.synth) playSynth(name, r.synth * 0.5 * gain, res.out);
    active.push({ name, t: now, end: res.end });
  } catch { /* audio is optional */ }
}

/* ---------------------------------------------------------------- procedural footsteps and ambience beds
   No files: every buffer is made here once, from seeded noise and sines, at the context's rate.
   Footsteps: shaped, low-passed bodies with a soft attack (no high-passed noise burst, no chain-mail layer).
   Mix order (post-chain momentary loudness): hits and parries on top, boss sounds, the hurt grunt,
   ambience beds, then footsteps and cloth lowest. FOOT_DB and BED_DB are the two knobs. */
const FOOT_DB = -21; /* footstep level against the old step; 0.1 dB steps are fine */
const BED_DB = -6;   /* ambience bed level */
const FOOT_VARIANTS = 8;

function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* RBJ biquad, one stage; kind 'lp' | 'hp' | 'bp'. h.set(f) moves the corner and keeps the state (a moving band). */
function bq(kind, f, q, sr) {
  let c = null; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (ff) => {
    const w = 2 * Math.PI * Math.min(ff, sr * 0.45) / sr; const cs = Math.cos(w); const al = Math.sin(w) / (2 * q); let b0, b1, b2;
    if (kind === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (kind === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al; c = [b0 / a0, b1 / a0, b2 / a0, (-2 * cs) / a0, (1 - al) / a0];
  };
  set(f);
  const h = (x) => { const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  h.set = set; return h;
}
function filt(d, kind, f, q, sr, passes = 1) { for (let p = 0; p < passes; p++) { const h = bq(kind, f, q, sr); for (let i = 0; i < d.length; i++) d[i] = h(d[i]); } return d; }
function rmsOf(d) { let e = 0; for (let i = 0; i < d.length; i++) e += d[i] * d[i]; return Math.sqrt(e / d.length) || 1; }
/* a soft envelope: raised-cosine attack, exponential decay */
function envAt(t, atk, tau) { return t < 0 ? 0 : t < atk ? 0.5 - 0.5 * Math.cos(Math.PI * t / atk) : Math.exp(-(t - atk) / tau); }

/* One footstep (mono Float32Array). P = SURFACES[x]; r = seeded random. */
function stepVoice(P, r, sr) {
  const n = Math.floor(sr * 0.34); const out = new Float32Array(n); const jit = (k) => 1 + (r() * 2 - 1) * k;
  const atk = (P.atk || 0.005) * jit(0.25);
  const burst = (g, lp, tau, delay, a = atk) => {
    const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    filt(d, 'lp', lp, 0.7, sr, 2); const k = g * 0.5 / rmsOf(d);
    for (let i = 0; i < n; i++) out[i] += d[i] * k * envAt(i / sr - delay, a, tau);
  };
  if (P.heel) burst(P.heel[0] * jit(0.15), P.heel[1] * jit(0.15), P.heel[2] * jit(0.2), 0);
  if (P.toe) burst(P.toe[0] * jit(0.25), P.toe[1] * jit(0.15), P.toe[2] * jit(0.2), P.toe[3] * jit(0.18), atk * 1.6);
  if (P.thump) { const [g, f0, tau] = P.thump; const f = f0 * jit(0.1); let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += 2 * Math.PI * f * (1 + 0.35 * Math.exp(-t / 0.012)) / sr; out[i] += Math.sin(ph) * g * envAt(t, 0.003, tau * jit(0.2)); } }
  if (P.grain) {
    const [g, fc, cnt, win] = P.grain; const k = Math.max(1, Math.round(cnt * (0.7 + 0.6 * r()))); const d = new Float32Array(n);
    for (let j = 0; j < k; j++) {
      const t0 = Math.pow(r(), 1.4) * win; const len = Math.floor(sr * (0.003 + r() * 0.006)); const a = (0.4 + 0.6 * r()) * Math.exp(-t0 / (win * 0.7)); const s0 = Math.floor(t0 * sr);
      for (let i = 0; i < len && s0 + i < n; i++) d[s0 + i] += (r() * 2 - 1) * a * Math.sin(Math.PI * i / len);
    }
    filt(d, 'bp', fc * jit(0.2), 1.1, sr); filt(d, 'lp', fc * 1.4, 0.7, sr); let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < n; i++) out[i] += d[i] * g / (pk || 1);
  }
  if (P.modes) for (const [f0, tau, g] of P.modes) { const f = f0 * jit(0.04); const ph0 = r() * 6.28; const td = P.toe ? P.toe[3] : 0.06; for (let i = 0; i < n; i++) { const t = i / sr; out[i] += Math.sin(ph0 + 2 * Math.PI * f * t) * g * (envAt(t, 0.0015, tau) + 0.35 * envAt(t - td, 0.0015, tau * 0.8)); } }
  if (P.squelch) {
    const [g, f0, f1, dur] = P.squelch; const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    const h = bq('bp', f0, 2.2, sr); const t0 = 0.02 * jit(0.3); const k0 = 0.5 / rmsOf(Float32Array.from(d).map(bq('bp', (f0 + f1) / 2, 2.2, sr)));
    for (let i = 0; i < n; i++) { const t = i / sr - t0; if (i % 32 === 0) { const k = Math.min(1, Math.max(0, t / dur)); h.set(f0 * Math.pow(f1 / f0, k)); } const e = t < 0 ? 0 : t < 0.03 ? t / 0.03 : t < dur ? 1 : Math.exp(-(t - dur) / 0.03); out[i] += h(d[i]) * g * k0 * e; }
  }
  if (P.splash) {
    const [g, fc, tau] = P.splash; const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    filt(d, 'bp', fc * jit(0.2), 0.8, sr); const t0 = 0.004 + r() * 0.01; const k = 0.5 / rmsOf(d);
    for (let i = 0; i < n; i++) out[i] += d[i] * g * k * envAt(i / sr - t0, 0.006, tau * jit(0.25));
  }
  if (P.cloth) { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1; filt(d, 'bp', 1100 * jit(0.2), 0.6, sr); const kc = 0.5 / rmsOf(d); for (let i = 0; i < n; i++) out[i] += d[i] * P.cloth * kc * envAt(i / sr - 0.015, 0.045, 0.07); }
  filt(out, 'lp', P.lp * jit(0.08), 0.707, sr, 2); filt(out, 'hp', 40, 0.707, sr);
  const fo = Math.floor(sr * 0.04); for (let i = 0; i < fo; i++) out[n - 1 - i] *= i / fo;
  return out;
}
/* Generated work runs in slices of a few ms (setTimeout), so a new surface or bed never stalls a frame.
   build(key, gen) returns the result when done, else null and keeps working; drain(gen) runs one at once (offline renders). */
const builds = {};
function drain(g) { let r; do { r = g.next(); } while (!r.done); return r.value; }
function build(key, make) {
  const b = builds[key]; if (b) return b.done ? b.value : null;
  const job = builds[key] = { done: false, value: null, g: make() };
  BUILDQ.push(job); if (!BUILDQ.on) { BUILDQ.on = true; setTimeout(pumpBuilds, 0); }
  return null;
}
/* perf: ONE queue for every sliced build, at most 5 ms of work per frame in all. Each job used to run its own
   6 ms setTimeout loop, so 15 jobs at unlock took about 90 ms of every frame for 1.5 s (frames of 100 to 117 ms, 85 MB of
   garbage): the stutter at the start of a fight or at the first key on the title. */
const BUILDQ = []; BUILDQ.on = false;
function pumpBuilds() {
  const t0 = performance.now();
  while (BUILDQ.length && performance.now() - t0 < 5) {
    const job = BUILDQ[0];
    try { const r = job.g.next(); if (r.done) { job.done = true; job.value = r.value; BUILDQ.shift(); } } catch (e) { job.done = true; job.value = null; BUILDQ.shift(); }
  }
  if (!BUILDQ.length) { BUILDQ.on = false; return; }
  /* the next slice after the next frame is drawn (a hidden tab has no frames: a plain timer then) */
  if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) requestAnimationFrame(() => setTimeout(pumpBuilds, 0)); else setTimeout(pumpBuilds, 16);
}
function* footGen(c, surface) {
  const P = SURFACES[surface] || SURFACES.stone; const r = rng32(0x5eed + surface.length * 977 + surface.charCodeAt(0) * 131);
  const vs = []; for (let v = 0; v < FOOT_VARIANTS; v++) { vs.push(stepVoice(P, r, c.sampleRate)); yield; }
  let pk = 0; for (const d of vs) for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  const k = 0.5 / (pk || 1);
  return vs.map((d) => { const b = c.createBuffer(1, d.length, c.sampleRate); const ch = b.getChannelData(0); for (let i = 0; i < d.length; i++) ch[i] = d[i] * k; return b; });
}
const footSync = {};
function footSet(c, surface) { const key = surface + '@' + c.sampleRate; return footSync[key] || (footSync[key] = drain(footGen(c, surface))); }
function footLive(surface) { return build('foot:' + surface, () => footGen(ctx, surface)); }

/* procedural pools. Each PROC entry (web/src/sfx-proc.js) becomes n AudioBuffers at PROC_SR, peak-normalised as a set to 0.5
   like a decoded pool, so a recipe trim (VOL) sets its level. Live: made in slices at unlock (procWarm). Offline renders: at once. */
let procSync = false;
const procSeed = (id) => { let seed = 0x9e3779b1; for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 0x01000193) >>> 0; return seed; };
/* raw = [[Float32Array per channel] per variation] -> AudioBuffers, peak-normalised as a set */
function procBuffers(raw) {
  let pk = 0; for (const chs of raw) for (const d of chs) for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  const k = 0.5 / (pk || 1);
  return raw.map((chs) => { const b = new AudioBuffer({ numberOfChannels: chs.length, length: chs[0].length, sampleRate: PROC_SR }); chs.forEach((d, c) => { const o = b.getChannelData(c); for (let i = 0; i < d.length; i++) o[i] = d[i] * k; }); return b; });
}
function* procGen(id) {
  const P = PROC[id]; const seed = procSeed(id);
  const raw = []; for (let v = 0; v < (P.n || 3); v++) { const d = P.gen(rng32(seed + v * 7919), v); raw.push(Array.isArray(d) ? d : [d]); yield; }
  return procBuffers(raw);
}
/* live, the set is made in a worker (web/src/sfx-proc-worker.js): it was about 1.3 s of main-thread work in slices
   during the first fight seconds. No worker (old browser, a load error): the sliced build as before. ?sfxw=0 turns it off. */
let procW = null; let procWBad = (() => { try { return new URLSearchParams(location.search).get('sfxw') === '0'; } catch { return true; } })(); const procWait = new Map();
function procFallback() { procWBad = true; try { procW?.terminate(); } catch { /* gone */ } procW = null; for (const [id, job] of procWait) { job.g = procGen(id); BUILDQ.push(job); } procWait.clear(); if (BUILDQ.length && !BUILDQ.on) { BUILDQ.on = true; setTimeout(pumpBuilds, 0); } }
function procWorker() {
  if (procW || procWBad || typeof Worker !== 'function') return procW;
  try {
    procW = new Worker(new URL('./sfx-proc-worker.js', import.meta.url), { type: 'module' });
    procW.onmessage = (e) => { const { id, raw } = e.data || {}; const job = procWait.get(id); if (!job) return; procWait.delete(id); if (!raw) { job.g = procGen(id); BUILDQ.push(job); if (!BUILDQ.on) { BUILDQ.on = true; setTimeout(pumpBuilds, 0); } return; } try { job.value = procBuffers(raw); } catch { job.value = null; } job.done = true; };
    procW.onerror = () => procFallback(); procW.onmessageerror = () => procFallback();
  } catch { procWBad = true; procW = null; }
  return procW;
}
function procPool(id) {
  if (!PROC[id]) return null; const key = 'proc:' + id;
  if (procSync) { const b = builds[key]; if (b && b.done) return b.value; const g = b && b.g ? b.g : procGen(id); const value = drain(g); if (b) { b.done = true; b.value = value; procWait.delete(id); } else builds[key] = { done: true, value, g }; return value; }
  const b = builds[key]; if (b) return b.done ? b.value : null;
  const w = procWorker();
  if (w) { const job = builds[key] = { done: false, value: null, g: null }; procWait.set(id, job); try { w.postMessage({ id, seed: procSeed(id) }); } catch { procFallback(); } return null; }
  return build(key, () => procGen(id));
}
function procWarm() { try { for (const id of Object.keys(PROC)) procPool(id); } catch { /* optional */ } }
/* starts making the world's footsteps and bed in the background (sliced), so the first step and the bed are ready */
function prewarm() { if (!ctx) return; try { footLive(SURFACE_OF_WORLD[worldId] || 'stone'); const k = AMBIENCE[worldId]?.kind; if (k) { bedBuffer(ctx, k); shotBuffers(ctx, k); } } catch { /* optional */ } }
/* the land arg of sfxFoot may also be a surface id ('plank', 'paddy', ...). A probe set by the world (setSfxSurfaceProbe)
   can name the surface under the hero at this moment (a plank footbridge over a paddy); null = the land's own surface. */
let surfaceProbe = null;
export function setSfxSurfaceProbe(fn) { surfaceProbe = typeof fn === 'function' ? fn : null; }
export function surfaceOf(land) {
  if (surfaceProbe) { try { const s = surfaceProbe(land); if (s && SURFACES[s]) return s; } catch { /* the probe is optional */ } }
  return (SURFACES[land] && land) || SURFACE_OF[land] || SURFACE_OF_WORLD[worldId] || 'stone';
}
/* stride length (m) for a speed (m/s): longer at speed, so the cadence rises gently (about 1.7 steps/s at 1.8 m/s, 3 steps/s at 6 m/s) */
export function footStride(speed) { return 0.9 + 0.17 * speed; }
const footHist = {};
/* plays one footstep into c / ch at time t. foot = -1 left, 1 right. */
function playFoot(c, ch, surface, speed, foot, t, fixedV) {
  const set = c === ctx ? footLive(surface) : footSet(c, surface); if (!set) return; const h = footHist[surface] || (footHist[surface] = []);
  let i; let tries = 0; if (fixedV != null) i = fixedV % set.length; else { do { i = Math.floor(Math.random() * set.length); } while (h.includes(i) && ++tries < 12); h.push(i); if (h.length > 2) h.shift(); }
  const P = SURFACES[surface] || SURFACES.stone;
  const src = c.createBufferSource(); src.buffer = set[i];
  const jr = fixedV != null ? 1 : 1 + (Math.random() * 2 - 1) * 0.04; src.playbackRate.value = jr * (foot < 0 ? 0.985 : 1.015) * (speed < 3 ? 0.97 : 1);
  const spk = Math.max(0.5, Math.min(1.25, 0.45 + 0.1 * speed)); const jg = fixedV != null ? 1 : Math.pow(10, ((Math.random() * 2 - 1) * 1.5) / 20);
  const g = c.createGain(); g.gain.value = Math.pow(10, FOOT_DB / 20) * (P.level || 1) * spk * jg;
  let node = src; node.connect(g); node = g;
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = foot * 0.12; node.connect(p); node = p; }
  node.connect(ch.bus);
  if (surface === 'stone' || surface === 'wet') { const sd = c.createGain(); sd.gain.value = 0.04; node.connect(sd); sd.connect(ch.verb); }
  src.start(t); src.stop(t + set[i].duration / src.playbackRate.value + 0.01);
}
const foot = { d: 0, side: 1, last: 0, n: 0, surface: null };
/* Call every frame from the hero's update: dt (s), speed (m/s, 0 when still), land id (world.biome.id).
   Steps fall on real stride distance; still = silent. It also keeps the world's ambience bed alive (it fades out when not called). */
export function sfxFoot(dt, speed, land) {
  if (!ctx) return;
  try {
    bedKeep(land);
    if (!(speed > 0.3)) { foot.d = Math.max(foot.d, footStride(1.5) * 0.7); return; } /* still: the first step comes soon after the start */
    const L = footStride(speed); foot.d += speed * dt;
    if (foot.d < L) return; foot.d = Math.min(foot.d - L, L * 0.5);
    const now = ctx.currentTime; if (now - foot.last < 0.18) return; foot.last = now; foot.side = -foot.side;
    foot.surface = surfaceOf(land); playFoot(ctx, chain, foot.surface, speed, foot.side, now + 0.005); foot.n++;
  } catch { /* audio is optional */ }
}

/* ---------------- ambience beds: a 12 s seamless stereo loop per world, plus one-shots (train, birds, cars) */
const BED_LEN = 12; const BED_X = 1.5; const BED_SR = 24000; /* beds are made at 24 kHz (nothing in them is above 6 kHz) */
function* bedGen(kind, sr) {
  const N = Math.floor(sr * (BED_LEN + BED_X)); const L = new Float32Array(N); const Rr = new Float32Array(N); const r = rng32(0xbed + kind.length * 31);
  const T = BED_LEN; const ph = [0, 1, 2, 3, 4, 5].map(() => r() * 6.28);
  /* a gust curve 0..1 with whole cycles in the loop, one value per 64 samples */
  const gust = (ks, k, off) => { const n = Math.ceil(N / 64) + 1; const g = new Float32Array(n); for (let b = 0; b < n; b++) { const t = (b * 64) / sr + off; let a = 0; ks.forEach(([kk, w], j) => { a += w * Math.sin(2 * Math.PI * kk * t / T + ph[j]); }); g[b] = 0.5 + 0.5 * Math.tanh(k * a); } return g; };
  const noiseCh = (d) => { for (let i = 0; i < N; i++) d[i] = r() * 2 - 1; return d; };
  for (const [ci, D] of [[0, L], [1, Rr]]) {
    const w = noiseCh(new Float32Array(N)); yield;
    if (kind === 'frontier' || kind === 'storybook' || kind === 'edo') {
      /* wind: brown-ish noise through a band that opens with the gust */
      let b = 0; const br = new Float32Array(N); for (let i = 0; i < N; i++) { b = b * 0.985 + w[i] * 0.12; br[i] = b; }
      const cen = kind === 'frontier' ? [260, 520] : kind === 'edo' ? [700, 1100] : [380, 420];
      const h = bq('bp', cen[0], 0.9, sr); const gain = kind === 'frontier' ? 1 : kind === 'edo' ? 0.3 : 0.5;
      const G = gust([[1, 0.7], [2, 0.45], [5, 0.25]], 1.6, ci * 0.35); yield;
      for (let i = 0; i < N; i++) { const g = G[i >> 6]; if ((i & 63) === 0) h.set(cen[0] + cen[1] * g); D[i] += h(br[i]) * gain * (0.25 + 0.75 * g * g) * 3; }
      yield;
      if (kind === 'edo') { /* reeds: a soft high rustle that follows the gust */
        const d = noiseCh(new Float32Array(N)); filt(d, 'bp', 2400, 0.7, sr); filt(d, 'lp', 4000, 0.7, sr);
        for (let i = 0; i < N; i++) { const g = G[i >> 6]; D[i] += d[i] * 0.05 * g * g; }
        yield;
      }
      if (kind === 'storybook') { /* leaves: a light rustle, mostly below 3 kHz */
        const d = noiseCh(new Float32Array(N)); filt(d, 'bp', 1500, 0.6, sr); filt(d, 'lp', 3000, 0.7, sr);
        const G2 = gust([[2, 0.6], [3, 0.4], [7, 0.3]], 2, ci * 0.1);
        for (let i = 0; i < N; i++) { const g = G2[i >> 6]; D[i] += d[i] * 0.04 * g * g; }
        yield;
      }
    }
    if (kind === 'neon') {
      /* rain: dense soft hiss (no top end) and many tiny drops; city hum: a low rumble and a faint mains tone */
      const d = Float32Array.from(w); filt(d, 'hp', 450, 0.7, sr); filt(d, 'lp', 4200, 0.7, sr, 2);
      for (let i = 0; i < N; i++) D[i] += d[i] * 0.16;
      yield;
      const drops = new Float32Array(N); const nd = Math.floor(BED_LEN * 55);
      for (let j = 0; j < nd; j++) { const s0 = Math.floor(r() * N); const f = 1800 + r() * 2600; const a = 0.02 + 0.06 * r() * r(); const len = Math.floor(sr * 0.012); for (let i = 0; i < len && s0 + i < N; i++) drops[s0 + i] += Math.sin(2 * Math.PI * f * i / sr) * a * Math.exp(-i / (sr * 0.0025)); }
      filt(drops, 'lp', 5000, 0.7, sr); for (let i = 0; i < N; i++) D[i] += drops[i];
      yield;
      let b = 0; const rum = new Float32Array(N); for (let i = 0; i < N; i++) { b = b * 0.995 + w[(i * 7 + 13) % N] * 0.05; rum[i] = b; } filt(rum, 'lp', 220, 0.7, sr);
      for (let i = 0; i < N; i++) { const t = i / sr; D[i] += rum[i] * 1.2 * (0.7 + 0.3 * Math.sin(2 * Math.PI * t / T + ph[ci])) + 0.012 * (Math.sin(2 * Math.PI * 120 * t) + 0.5 * Math.sin(2 * Math.PI * 240 * t + 1)); }
      yield;
    }
    if (kind === 'edo') {
      /* night insects: four crickets, each a 4 kHz-ish carrier pulsed in short chirps, spread left and right */
      for (let c = 0; c < 4; c++) {
        const f = 3600 + r() * 1300; const period = 0.5 + r() * 0.35; const pulses = 2 + Math.floor(r() * 3); const pan = (c % 2 ? 1 : -1) * (0.3 + 0.5 * r()); const a = (0.03 + 0.03 * r()) * (ci === 0 ? 1 - pan * 0.5 : 1 + pan * 0.5);
        const off = r() * period; const w0 = 2 * Math.PI * f / sr;
        for (let i = 0; i < N; i++) {
          const t = i / sr + off; const tc = t % period; const pi = Math.floor(tc / 0.045); const tp = tc - pi * 0.045;
          if (pi < pulses && tp < 0.022) D[i] += Math.sin(w0 * i) * a * Math.sin(Math.PI * tp / 0.022) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 3 * t / T + c));
        }
        yield;
      }
    }
  }
  /* seamless loop: crossfade the extra tail into the head (equal power), then set the bed to -22 dBFS RMS */
  const X = Math.floor(sr * BED_X); const M = N - X; const out = [new Float32Array(M), new Float32Array(M)]; let e = 0;
  [L, Rr].forEach((D, ci) => { const o = out[ci]; for (let i = 0; i < M; i++) o[i] = D[i]; for (let i = 0; i < X; i++) { const k = i / X; o[i] = D[i] * Math.sin(k * Math.PI / 2) + D[M + i] * Math.cos(k * Math.PI / 2); } for (let i = 0; i < M; i++) e += o[i] * o[i]; });
  const k = Math.pow(10, -22 / 20) / Math.sqrt(e / (2 * M) || 1); for (const o of out) for (let i = 0; i < M; i++) o[i] *= k;
  return out;
}
/* one-shots: a far train (frontier), a bird phrase (storybook), a passing car on wet road (neon) */
function shotVoice(kind, r, sr) {
  if (kind === 'frontier') {
    const n = Math.floor(sr * 7); const d = new Float32Array(n); const tones = [415, 523, 622]; /* a steam whistle chord, far off */
    for (const [t0, len] of [[0.6, 1.5], [2.5, 0.6]]) for (const f of tones) { for (let i = Math.floor(t0 * sr); i < Math.min(n, (t0 + len + 0.8) * sr); i++) { const t = i / sr - t0; const e = Math.min(1, t / 0.25) * (t < len ? 1 : Math.exp(-(t - len) / 0.25)); const ff = f * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t)); d[i] += (Math.sin(2 * Math.PI * ff * t) + 0.3 * Math.sin(4 * Math.PI * ff * t)) * e * 0.13; } }
    const ch = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr; const pulse = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 2.6 * t)), 6); ch[i] = (r() * 2 - 1) * pulse * Math.sin(Math.PI * t / 7) * 0.5; }
    filt(ch, 'lp', 260, 0.7, sr, 2); for (let i = 0; i < n; i++) d[i] += ch[i];
    filt(d, 'lp', 1700, 0.7, sr, 2); /* far away: no top end */
    const dl = Math.floor(sr * 0.21); for (let i = n - 1; i >= dl; i--) d[i] += d[i - dl] * 0.3; /* a canyon echo */
    return d;
  }
  if (kind === 'storybook') {
    const n = Math.floor(sr * 1.4); const d = new Float32Array(n); let t0 = 0.02; const syl = 2 + Math.floor(r() * 5); const base = 2400 + r() * 1800; const up = r() < 0.5;
    for (let s = 0; s < syl; s++) {
      const len = 0.04 + r() * 0.09; const f0 = base * (0.85 + 0.3 * r()); const f1 = f0 * (up ? 1.25 + r() * 0.4 : 0.6 + r() * 0.2); let ph = 0;
      for (let i = Math.floor(t0 * sr); i < Math.min(n, (t0 + len) * sr); i++) { const t = i / sr - t0; const k = t / len; ph += 2 * Math.PI * (f0 + (f1 - f0) * k) * (1 + 0.03 * Math.sin(2 * Math.PI * 38 * t)) / sr; d[i] += Math.sin(ph) * Math.sin(Math.PI * k) * 0.16; }
      t0 += len + 0.03 + r() * 0.08;
    }
    return d;
  }
  if (kind === 'neon') {
    const n = Math.floor(sr * 3); const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    const h = bq('bp', 400, 1.2, sr); for (let i = 0; i < n; i++) { const k = i / n; if (i % 64 === 0) h.set(350 + 900 * Math.sin(Math.PI * k)); d[i] = h(d[i]) * Math.pow(Math.sin(Math.PI * k), 2) * 0.35; }
    return d;
  }
  return null;
}
const SHOT_EVERY = { frontier: [40, 80], storybook: [1.8, 5.5], neon: [7, 16] };
const bed = { kind: null, src: null, gain: null, seen: 0, next: 0, timer: null };
function* bedBufGen(c, kind) {
  const [l, r] = yield* bedGen(kind, BED_SR); const b = c.createBuffer(2, l.length, BED_SR); b.getChannelData(0).set(l); b.getChannelData(1).set(r); return b;
}
function* shotGen(c, kind) {
  const r = rng32(0x5407 + kind.length); const out = [];
  for (let i = 0; i < (kind === 'storybook' ? 10 : 3); i++) { const d = shotVoice(kind, r, BED_SR); if (!d) break; const b = c.createBuffer(1, d.length, BED_SR); b.getChannelData(0).set(d); out.push(b); yield; }
  return out;
}
/* offline (tests): made at once and kept per context; live: made in slices */
const bedSync = new WeakMap();
function syncOf(c) { let m = bedSync.get(c); if (!m) bedSync.set(c, (m = {})); return m; }
function bedBuffer(c, kind) { if (c === ctx) return build('bed:' + kind, () => bedBufGen(ctx, kind)); const m = syncOf(c); return m['b' + kind] || (m['b' + kind] = drain(bedBufGen(c, kind))); }
function shotBuffers(c, kind) { if (c === ctx) return build('shot:' + kind, () => shotGen(ctx, kind)) || []; const m = syncOf(c); return m['s' + kind] || (m['s' + kind] = drain(shotGen(c, kind))); }
function bedLevel(kind) { return Math.pow(10, BED_DB / 20) * (AMBIENCE[worldId]?.level ?? 1); }
function playShot(c, out, kind, t, i) {
  const set = shotBuffers(c, kind); if (!set.length) return;
  const src = c.createBufferSource(); src.buffer = set[(i ?? Math.floor(Math.random() * set.length)) % set.length];
  const g = c.createGain(); g.gain.value = kind === 'storybook' ? 0.5 + 0.5 * Math.random() : 1; src.connect(g);
  let node = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = (Math.random() * 2 - 1) * 0.7; node.connect(p); node = p; }
  node.connect(out); src.start(t);
}
function bedStop(fade = 1.0) {
  if (!bed.src) return; const t = ctx.currentTime; const g = bed.gain; const s = bed.src;
  g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); s.stop(t + fade + 0.05);
  bed.src = null; bed.gain = null; bed.kind = null; if (bed.timer) { clearInterval(bed.timer); bed.timer = null; }
}
function bedTick() {
  if (!ctx || !bed.src) return;
  if (performance.now() - bed.seen > 700) { bedStop(1.2); return; } /* the hero's update stopped (menu, camp, end): fade out */
  const ev = SHOT_EVERY[bed.kind]; if (!ev) return; const t = ctx.currentTime;
  if (t >= bed.next) { playShot(ctx, bed.gain, bed.kind, t + 0.02); bed.next = t + ev[0] + Math.random() * (ev[1] - ev[0]); }
}
function bedKeep(land) {
  bed.seen = performance.now();
  const kind = AMBIENCE[worldId]?.kind || null;
  if (kind === bed.kind) return;
  if (!kind) { bedStop(1.0); return; }
  const buf = bedBuffer(ctx, kind); if (!buf) return; /* still being made: try again next frame */
  bedStop(1.0);
  const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(bedLevel(kind), t + 2.0); g.connect(chain.bus);
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g); src.start(t); shotBuffers(ctx, kind);
  const ev = SHOT_EVERY[kind]; bed.next = t + (ev ? (kind === 'frontier' ? 12 : ev[0]) : 1e9);
  Object.assign(bed, { kind, src, gain: g }); bed.timer = setInterval(bedTick, 250);
}

/* ---------------- offline renders for loudness measurement */
/* steps: a walk of `count` steps at `speed` on `surface` through the full master chain */
export async function sfxRenderSteps(surface, o = {}) {
  const sr = o.sr || 48000; const speed = o.speed ?? 5.2; const count = o.count || 8; const gap = footStride(speed) / speed;
  const oc = new OfflineAudioContext(2, Math.floor(sr * (0.4 + count * gap + 0.5)), sr); const ch = makeChain(oc);
  for (let i = 0; i < count; i++) playFoot(oc, ch, surface, speed, i % 2 ? 1 : -1, 0.2 + i * gap, o.fixed ? i : null);
  return oc.startRendering();
}
/* one ambience bed for `seconds`, with a one-shot at 1 s (o.shot) */
export async function sfxRenderBed(world, o = {}) {
  const sr = o.sr || 48000; const kind = AMBIENCE[world]?.kind; if (!kind) return null;
  const oc = new OfflineAudioContext(2, Math.floor(sr * (o.seconds || 12)), sr); const ch = makeChain(oc);
  const g = oc.createGain(); g.gain.value = Math.pow(10, BED_DB / 20) * (AMBIENCE[world]?.level ?? 1); g.connect(ch.bus);
  const src = oc.createBufferSource(); src.buffer = bedBuffer(oc, kind); src.loop = true; src.connect(g); src.start(0);
  if (o.shot) playShot(oc, g, kind, 1, 0);
  return oc.startRendering();
}
export function sfxSurfaces() { return Object.keys(SURFACES); }
export function sfxWorldHas(w, n) { return !!WORLD_RECIPES[w]?.[n]; }
/* a short mixed scene (bed, run on the world's surface, a swing, a hit, a parry, a roar) to hear the level order together */
export async function sfxRenderScene(world, o = {}) {
  const was = worldId; worldId = world;
  try {
    const sr = o.sr || 48000; const oc = new OfflineAudioContext(2, sr * 7, sr); const ch = makeChain(oc);
    const kind = AMBIENCE[world]?.kind;
    if (kind) { const g = oc.createGain(); g.gain.value = Math.pow(10, BED_DB / 20) * (AMBIENCE[world]?.level ?? 1); g.connect(ch.bus); const src = oc.createBufferSource(); src.buffer = bedBuffer(oc, kind); src.loop = true; src.connect(g); src.start(0); }
    const surface = SURFACE_OF_WORLD[world] || 'stone'; const gap = footStride(5.2) / 5.2;
    for (let i = 0; i * gap < 5.5; i++) playFoot(oc, ch, surface, 5.2, i % 2 ? 1 : -1, 0.3 + i * gap, i);
    for (const [n, t] of [['swing', 1.4], ['hit', 1.6], ['swing', 2.8], ['clang', 3.0], ['parry', 4.2], ['roar', 5.2]]) if (ready(n)) playLayers(oc, ch, n, { fixed: true }, t);
    return await oc.startRendering();
  } finally { worldId = was; }
}
/* raw generated buffers (no chain), for tests: sfxRaw(c, 'foot', 'dust') or sfxRaw(c, 'bed', 'neon') or sfxRaw(c, 'shot', 'frontier') */
export function sfxRaw(c, what, id) { return what === 'foot' ? footSet(c, id) : what === 'bed' ? bedBuffer(c, id) : shotBuffers(c, id); }

/* ---------------------------------------------------------------- test and listening tools */
export function sfxNames() { return Object.keys(RECIPES); }
export function sfxStatus() {
  const names = {}; for (const n of Object.keys(RECIPES)) names[n] = ready(n) || RECIPES[n].layers.length === 0;
  return { ...status, failed: status.failed.slice(), pools: Object.fromEntries(Object.entries(POOLS).map(([p, c]) => [p, (buffers[p] || []).filter(Boolean).length + '/' + c])), names, state: ctx ? ctx.state : 'none', world: worldId, steps: foot.n, surface: foot.surface, bed: bed.kind };
}
export function sfxRecipe(name) {
  const r = rec(name); if (!r) return '';
  const ls = r.layers.map((l) => `${l.pool} x${l.g}${l.rate ? ` r${l.rate}` : ''}${l.delay ? ` +${l.delay}s` : ''}${l.lp ? ` lp${l.lp}` : ''}${l.hp ? ` hp${l.hp}` : ''}${l.sat ? ` sat${l.sat}` : ''}`);
  if (r.synth) ls.push(`old synth x${r.synth}`);
  return `${ls.join(' + ')}  [vol ${r.vol} send ${r.send}]`;
}
export function sfxPools() { return Object.entries(POOLS).map(([pool, count]) => ({ pool, count, loaded: (buffers[pool] || []).filter(Boolean).length })); }
/* Plays one raw sample, for judging a single file: playPool('clang', 3). */
export function playPool(pool, n, rate = 1) {
  if (!ctx || !buffers[pool] || !buffers[pool][n - 1]) return;
  const src = ctx.createBufferSource(); src.buffer = buffers[pool][n - 1]; src.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = 0.8; src.connect(g); g.connect(chain.bus); src.start();
}
/* Renders one sound through the full master chain offline (stereo AudioBuffer). o.variant picks one variation for every layer. */
export async function sfxRender(name, o = {}) {
  if (!ctx) throw new Error('call unlockAudio() first');
  const sr = o.sr || 44100; const oc = new OfflineAudioContext(2, Math.floor(sr * (o.seconds || 4.5)), sr);
  const ch = makeChain(oc);
  if (!Array.isArray(o.seq) && (!rec(name).layers.length || o.synth)) return null;
  procSync = true;
  try {
    if (Array.isArray(o.seq)) for (const [n, t] of o.seq) { if (RECIPES[n] && rec(n).layers.length && ready(n)) playLayers(oc, ch, n, {}, 0.05 + t); }
    else playLayers(oc, ch, name, { ...o, fixed: true }, 0.05);
  } finally { procSync = false; }
  return oc.startRendering();
}
/* a fixed sequence through one chain, for level-order and masking tests: seq = [[name, t, { variant, gain }], ...] in world o.world */
export async function sfxRenderSeq(seq, o = {}) {
  if (!ctx) throw new Error('call unlockAudio() first');
  const was = worldId; if (o.world) worldId = o.world; procSync = true;
  try {
    const sr = o.sr || 48000; const oc = new OfflineAudioContext(2, Math.floor(sr * (o.seconds || 3)), sr); const ch = makeChain(oc);
    for (const [n, t, opt] of seq) if (RECIPES[n] && rec(n).layers.length && ready(n)) playLayers(oc, ch, n, { fixed: true, variant: 0, ...(opt || {}) }, 0.05 + t);
    return await oc.startRendering();
  } finally { worldId = was; procSync = false; }
}
/* makes every procedural pool now (tests) */
export function sfxProcAll() { procSync = true; try { for (const id of Object.keys(PROC)) procPool(id); } finally { procSync = false; } return Object.keys(PROC).length; }
export function sfxHasSamples(name) { return !!RECIPES[name] && rec(name).layers.length > 0 && ready(name); }
export function sfxVariants(name) { const r = RECIPES[name] && rec(name); return r ? Math.max(1, ...r.layers.map((l) => (poolOf(l.pool.split('#')[0]) || []).filter(Boolean).length)) : 0; }

/* Per-world sound tables for web/src/sfx.js.
   Nothing here makes sound by itself: sfx.js reads these tables.
   - SURFACE_OF: land id (a dark climate id or a world land id) -> footstep surface.
   - SURFACE_OF_WORLD: the fallback surface per world.
   - SURFACES: the shape of a footstep per surface (procedural, see stepVoice in sfx.js). All values are plain numbers:
       lp      final low-pass (Hz): the main "softness" control. Keep it low; a bright step reads as crunchy.
       heel    [gain, low-pass Hz, decay s]   the soft noise body of the heel strike
       thump   [gain, Hz, decay s]            a low sine under the heel (weight), very short
       toe     [gain, low-pass Hz, decay s, delay s]   the roll onto the toe
       grain   [gain, centre Hz, count, window s]      sparse soft grains (snow, sand, grit), band-limited
       modes   [[Hz, decay s, gain], ...]     damped resonances (a plank)
       squelch [gain, from Hz, to Hz, dur s]  a swept band (mud)
       splash  [gain, centre Hz, decay s]     a thin film of water (wet concrete)
       cloth   gain of a slow cloth rustle on the stride
       level   linear trim per surface, set by measurement
   - AMBIENCE: the bed per world (generated in sfx.js, no files).
   - RECIPES: per-world overrides of the combat recipes in sfx.js (same layer format). A name not listed plays the dark recipe.
   All sources are procedural or the CC0 pools already in web/assets/sfx (see web/assets/real/CREDITS.md). */

export const SURFACE_OF = {
  /* dark climates */
  ashlands: 'stone', frostpass: 'snow', drownedfen: 'mud', vinewild: 'earth', barrowmoor: 'mud',
  dusksteppe: 'earth', deepwood: 'earth', stormcoast: 'stone',
  /* edo (the paddies yard is wet earth; a plank footbridge plays 'plank' through setSfxSurfaceProbe in sfx.js) */ paddies: 'paddy', castleroad: 'earth',
  /* neon */ rainline: 'wet', dockyard: 'wet',
  /* frontier */ mesa: 'dust', railhead: 'dust',
  /* storybook */ meadow: 'grass', cloudpeaks: 'grass',
};
export const SURFACE_OF_WORLD = { dark: 'stone', edo: 'earth', neon: 'wet', frontier: 'dust', storybook: 'grass' };

export const SURFACES = {
  /* dry packed dust and sand: a soft "hff", a short sandy hiss with no click */
  dust: { lp: 2200, heel: [0.7, 900, 0.04], thump: [0.18, 85, 0.03], toe: [0.5, 1200, 0.06, 0.055], grain: [0.1, 1400, 12, 0.09], cloth: 0.1, level: 1.412 },
  /* wet concrete: a dull tap and a thin film of water under the sole */
  wet: { lp: 2800, heel: [0.75, 800, 0.028], thump: [0.15, 95, 0.03], toe: [0.35, 1000, 0.04, 0.05], splash: [0.28, 1600, 0.06], cloth: 0.08, level: 2.352 },
  /* bare earth: a dull, round thud */
  earth: { lp: 2400, heel: [0.85, 900, 0.045], thump: [0.25, 80, 0.04], toe: [0.45, 1100, 0.055, 0.06], grain: [0.06, 1200, 4, 0.06], cloth: 0.1, level: 1.421 },
  /* the paddy yard: packed wet earth, a soft thud with a thin film of water and a small suck as the foot lifts */
  paddy: { lp: 2200, heel: [0.75, 850, 0.045], thump: [0.22, 80, 0.04], toe: [0.35, 1000, 0.05, 0.06], splash: [0.2, 1300, 0.07], squelch: [0.16, 300, 650, 0.1], cloth: 0.08, atk: 0.008, level: 1.4 },
  /* a plank over the paddy: a hollow, damped knock */
  plank: { lp: 2800, heel: [0.5, 1300, 0.022], thump: [0.18, 110, 0.035], toe: [0.3, 1300, 0.035, 0.06], modes: [[190, 0.06, 0.35], [430, 0.045, 0.3], [780, 0.03, 0.2], [1260, 0.02, 0.1]], cloth: 0.08, level: 1.969 },
  /* grass: a soft brush, slower attack, no hard strike */
  grass: { lp: 2400, heel: [0.5, 800, 0.05], thump: [0.15, 80, 0.03], toe: [0.6, 1400, 0.1, 0.04], grain: [0.08, 1600, 10, 0.12], cloth: 0.12, atk: 0.012, level: 1.463 },
  /* snow: a soft squeak-crunch, kept below 2 kHz */
  snow: { lp: 2300, heel: [0.55, 750, 0.05], thump: [0.15, 80, 0.035], toe: [0.4, 1000, 0.07, 0.06], grain: [0.2, 1400, 18, 0.14], cloth: 0.1, atk: 0.008, level: 1.486 },
  /* mud: a low suck and a slow release */
  mud: { lp: 1600, heel: [0.6, 650, 0.05], thump: [0.25, 70, 0.045], toe: [0.25, 800, 0.05, 0.08], squelch: [0.5, 250, 700, 0.15], cloth: 0.08, atk: 0.01, level: 0.916 },
  /* dark stone: a soft leather-on-rock tap with a little grit */
  stone: { lp: 2200, heel: [0.8, 1000, 0.025], thump: [0.2, 90, 0.03], toe: [0.4, 1100, 0.035, 0.05], grain: [0.06, 1300, 4, 0.05], cloth: 0.1, level: 1.734 },
};

/* Ambience beds. kind = the generator in sfx.js; level = linear trim set by measurement. */
export const AMBIENCE = {
  frontier: { kind: 'frontier', level: 0.173 }, /* dry wind in gusts, a far train now and then */
  neon: { kind: 'neon', level: 0.368 },         /* steady rain, drips, a low city hum */
  edo: { kind: 'edo', level: 0.167 },           /* night insects, wind in the reeds */
  storybook: { kind: 'storybook', level: 0.187 }, /* a soft breeze, birds */
  dark: null,                               /* dark lands: as before (no bed) */
};

/* ---------------------------------------------------------------- per-world combat timbre */
const L = (pool, g, o = {}) => ({ pool, g, ...o });
const R = (layers, o = {}) => ({ layers, vol: 1, send: 0.12, pri: 1, ...o });

export const RECIPES = {
  /* frontier: a cavalry sabre in open air. Thin whoosh, short dry ring, little reverb. */
  frontier: {
    swing: R([L('wl', 1, { rate: 1.08 }), L('st', 0.3, { rate: 1.2, hp: 600 })], { send: 0.05 }),
    thrust: R([L('st', 1, { rate: 1.1 }), L('wl', 0.25, { rate: 1.4 })], { send: 0.05 }),
    clang: R([L('clang', 1, { rate: 1.15 }), L('tink', 0.5, { rate: 1.05 }), L('ring', 0.07, { rate: 1.2, dur: 0.4 })], { send: 0.08, pri: 2 }),
    deflect: R([L('tink', 0.9, { rate: 1.1 }), L('clang', 0.45, { rate: 1.25, hp: 900 })], { send: 0.08, pri: 2 }),
    parry: R([L('clang', 0.9, { rate: 1.2 }), L('ring', 0.55, { rate: 1.3, dur: 0.7 }), L('tink', 0.6, { rate: 1.25 }), L('thump', 0.3, { rate: 1.1 })], { send: 0.12, pri: 2 }),
    block: R([L('shield', 0.9, { rate: 1.1 }), L('tink', 0.35), L('thump', 0.4)], { send: 0.07, pri: 2 }),
    /* outlaws, dry open air */
    foeHurt: R([L('hurt', 1, { rate: 0.86, lp: 3000 })], { send: 0.05, max: 2, gap: 0.15 }),
    foeDie: R([L('hurt', 1, { rate: 0.76, lp: 2800 }), L('thump', 0.3, { rate: 0.8, lp: 400, delay: 0.05 })], { send: 0.08, pri: 2, max: 2 }),
  },
  /* edo: a katana. A sharp quick "shing" swing, a bright steel ring on contact. */
  edo: {
    swing: R([L('st', 1, { rate: 1.2 }), L('wl', 0.4, { rate: 1.5, hp: 1500 })], { send: 0.1 }),
    swingHeavy: R([L('wh', 1, { rate: 1.05 }), L('st', 0.5, { rate: 1.1, delay: 0.02 }), L('thump', 0.12, { rate: 0.8, delay: 0.1 })], { send: 0.12, pri: 2 }),
    clang: R([L('tink', 0.9), L('clang', 0.6, { rate: 1.3, hp: 900 }), L('ring', 0.25, { rate: 1.6, dur: 0.8 })], { send: 0.16, pri: 2 }),
    deflect: R([L('tink', 1, { rate: 1.15 }), L('ring', 0.15, { rate: 1.8, dur: 0.5 })], { send: 0.14, pri: 2 }),
    parry: R([L('tink', 0.9, { rate: 1.2 }), L('ring', 0.8, { rate: 1.7 }), L('bell', 0.12, { rate: 2.4, dur: 0.6 }), L('clang', 0.4, { rate: 1.4, hp: 1200 })], { send: 0.2, pri: 2 }),
    block: R([L('clang', 0.7, { rate: 1.2, hp: 600 }), L('tink', 0.6), L('thump', 0.35)], { send: 0.12, pri: 2 }),
    /* ashigaru, a clipped shout */
    foeHurt: R([L('hurt', 1, { rate: 0.92, lp: 3000, dur: 0.45 })], { send: 0.1, max: 2, gap: 0.15 }),
    foeDie: R([L('hurt', 1, { rate: 0.8, lp: 2600 }), L('growl', 0.15, { rate: 1.0, lp: 1600, dur: 0.6 })], { send: 0.14, pri: 2, max: 2 }),
  },
  /* neon: a stun baton and riot gear. A heavier blunt whoosh with a faint electric hum, dull polymer and steel knocks, no long ring. */
  neon: {
    swing: R([L('wh', 1, { rate: 0.88, lp: 2600 }), L('zap', 0.1, { rate: 1.6, lp: 6000, dur: 0.25 })], { send: 0.14 }),
    swingHeavy: R([L('wh', 1, { rate: 0.8, lp: 2200 }), L('wh', 0.4, { rate: 0.62, lp: 1500, delay: 0.02 }), L('zap', 0.12, { rate: 1.3, dur: 0.35 }), L('thump', 0.2, { rate: 0.7, delay: 0.1 })], { send: 0.16, pri: 2 }),
    clang: R([L('clunk', 1), L('punch', 0.5), L('plate', 0.4, { rate: 1.3 }), L('zap', 0.1, { rate: 2, dur: 0.15 })], { send: 0.18, pri: 2 }),
    deflect: R([L('clunk', 0.8, { rate: 1.2 }), L('tink', 0.4, { rate: 0.9 }), L('zap', 0.12, { rate: 1.8, dur: 0.15 })], { send: 0.16, pri: 2 }),
    parry: R([L('clunk', 0.9, { rate: 1.1 }), L('tink', 0.6, { rate: 1.6 }), L('zap', 0.3, { rate: 1.5, dur: 0.4 }), L('thump', 0.4, { rate: 1.1 })], { send: 0.2, pri: 2 }),
    block: R([L('shield', 1, { rate: 0.8, lp: 3000 }), L('clunk', 0.5), L('thump', 0.5)], { send: 0.16, pri: 2 }),
    hit: R([L('thump', 1, { lp: 450, sat: 0.3 }), L('punch', 0.7), L('flesh', 0.5)], { send: 0.12, pri: 2 }),
    roar: R([L('roar', 1, { rate: 0.9 }), L('growl', 0.4), L('zap', 0.25, { rate: 0.5, dur: 0.6 })], { send: 0.24, pri: 2 }),
    /* riot helmets muffle the grunt; a falling suit shorts out */
    foeHurt: R([L('hurt', 1, { rate: 0.8, lp: 1600 })], { send: 0.1, max: 2, gap: 0.15 }),
    foeDie: R([L('hurt', 1, { rate: 0.74, lp: 1500 }), L('zap', 0.12, { rate: 0.7, lp: 4000, dur: 0.3, delay: 0.08 })], { send: 0.14, pri: 2, max: 2 }),
  },
  /* storybook: a bright fairy-tale sword. A clean ring with a small bell in it; hits are soft bumps, no gore. */
  storybook: {
    swing: R([L('wl', 1, { rate: 1.15 }), L('bell', 0.03, { rate: 3, dur: 0.3 })], { send: 0.12 }),
    clang: R([L('clang', 0.9, { rate: 1.2 }), L('bell', 0.22, { rate: 1.5, dur: 0.7 }), L('tink', 0.5)], { send: 0.18, pri: 2 }),
    parry: R([L('bell', 0.5, { rate: 2 }), L('ring', 0.5, { rate: 1.4, dur: 0.9 }), L('tink', 0.7, { rate: 1.3 }), L('clang', 0.5, { rate: 1.2 })], { send: 0.24, pri: 2 }),
    flesh: R([L('punch', 0.8), L('thump', 1, { lp: 450 }), L('flesh', 0.3)], { send: 0.1, pri: 2 }),
    hit: R([L('punch', 0.8, { rate: 1.05 }), L('thump', 1, { lp: 450 }), L('flesh', 0.3)], { send: 0.1, pri: 2 }),
    kill: R([L('punch', 1, { rate: 0.9 }), L('thump', 0.8, { rate: 0.85 }), L('bell', 0.25, { rate: 1.8, delay: 0.05, dur: 0.8 }), L('spark', 0.35, { delay: 0.04 })], { send: 0.2, pri: 2 }),
    execute: R([L('plate', 0.7), L('punch', 0.9), L('thump', 0.8, { rate: 0.75 }), L('bell', 0.35, { rate: 1.5, delay: 0.05, dur: 1.0 }), L('spark', 0.4, { delay: 0.05 })], { send: 0.24, pri: 2 }),
    roar: R([L('roar', 0.7, { rate: 1.15 }), L('growl', 0.6, { rate: 1.2 })], { send: 0.24, pri: 2 }),
    /* goblins squeak and grumble; a fallen one leaves a small sparkle, no gore */
    foeHurt: R([L('hurt', 1, { rate: 1.32, lp: 3200 }), L('growl', 0.25, { rate: 1.5, lp: 2600, dur: 0.35 })], { send: 0.12, max: 2, gap: 0.15 }),
    foeDie: R([L('hurt', 1, { rate: 1.22, lp: 3000 }), L('bell', 0.08, { rate: 2, dur: 0.6, delay: 0.12 })], { send: 0.18, pri: 2, max: 2 }),
  },
};
/* Loudness trims for the overrides (BEGIN/END mark the block that the loudness calibration rewrites). */
/* WVOL-BEGIN */
export const WVOL = {
  frontier: { swing: 0.912, thrust: 1.114, clang: 2.534, deflect: 1.991, parry: 2.076, block: 1.855, foeHurt: 0.345, foeDie: 0.385 },
  neon: { swing: 0.875, swingHeavy: 0.853, clang: 1.731, deflect: 3.481, parry: 2.34, block: 1.453, hit: 0.435, roar: 0.416, foeHurt: 0.347, foeDie: 0.397 },
  edo: { swing: 1.114, swingHeavy: 0.94, clang: 1.902, deflect: 1.92, parry: 1.932, block: 2.061, foeHurt: 0.358, foeDie: 0.395 },
  storybook: { swing: 0.968, clang: 2.541, parry: 2.319, flesh: 0.781, hit: 0.805, kill: 0.917, execute: 1.084, roar: 0.481, foeHurt: 0.403, foeDie: 0.496 },
};
/* WVOL-END */

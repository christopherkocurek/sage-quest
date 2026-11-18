/* The Neon City world's 3D module (loaded only when the world is neon).
   lands + looks + grime: web/src/worlds/neon-lands.js. Wardrobe: wear_neon.glb. Gear: gear_neon_*.glb
   First-person arms: fp_*_neon.glb (all modelled by script in Blender). Boss dress: neon-boss.js. Drone rotors: neon-drone.js. Camp: neon-camp.js. */
export { lands, looks, grime } from './neon-lands.js';

export const wear = '/assets/real/wear_neon.glb';
export const parts = ['Visor', 'Visor_band', 'Hood_tech', 'Mask_cloth', 'Mask_resp', 'Goggles', 'Cap_knit', 'Jacket', 'Jacket_suit', 'Vest', 'Coat_long', 'Tank', 'Wraps', 'Backpack', 'Drone', 'Exo', 'Parka', 'Helm_corp', 'Badge_corp', 'Jacket_corp', 'Band_corp', 'Armor_corp'];
export const gear = ['neon_monoblade', 'neon_buckler', 'neon_cleaver', 'neon_hammer', 'neon_fireaxe', 'neon_boxknife', 'neon_pike', 'neon_stunstaff', 'neon_pipe', 'neon_baton', 'neon_riot', 'neon_prod', 'neon_whip', 'neon_sledge'];
/* city gear for each class (read from mod.heroGear when present) */
export const heroGear = { knight: ['neon_baton', 'neon_riot'], barbarian: ['neon_sledge'], mage: ['neon_prod'], rogue: ['neon_boxknife', 'neon_boxknife'] };
export { dressBoss } from './neon-boss.js';
export { camp, skyNemesis } from './neon-camp.js';
export { dressFoe } from './neon-drone.js';
/* the buckler and the riot shield are shields: on the forearm in the straps, like the dark heater (same frame: face -Y, up +Z) */
export const mounts = { neon_buckler: { r: [0, Math.PI, 0], p: [-0.08, -0.06, -0.05], shield: true, fp: { s: 1.6, p: [0.12, 0.1, -0.07] } }, neon_riot: { r: [0, Math.PI, 0], p: [-0.09, -0.06, -0.06], shield: true } };
/* gear: chrome-bright blades, dark gunmetal fittings, little wear (a clean city, not a battlefield) */
/* bladeEnv 0.35 (the shared default 0.9 is for day lands): at night the room-light reflection made the mono-blade a flat, pale, wood-like grey */
export const gearLook = { wear: 0.1, blade: 0xb4bcc6, steel: 0x2c3036, bladeEnv: 0.35 };
export const sfxPools = {};

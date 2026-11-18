/* The Old Edo world's 3D module (loaded only when the world is Old Edo).
   lands + looks + grime: web/src/worlds/edo-lands.js. Wardrobe: wear_edo.glb. Gear: gear_edo_*.glb
   First-person arms: fp_*_edo.glb (all modelled by script in Blender). Boss dress and camp: below. */
export { lands, looks, grime } from './edo-lands.js';

export const wear = '/assets/real/wear_edo.glb';
export const parts = ['Helm_great', 'Helm_kettle', 'Helm_sallet', 'Chest', 'Fauld', 'PauldronL', 'PauldronR', 'ForeArmL', 'ForeArmR', 'ShinL', 'ShinR',
  'Maedate', 'Kuwagata', 'Menpo', 'Mask_oni_lord', 'Mask_oni', 'Mask_cloth', 'Zukin', 'Zukin_black', 'Headband', 'Eboshi', 'Veil',
  'Kimono', 'Kimono_open', 'Hakama', 'Kesa', 'Wraps', 'Sashimono'];
/* crests and the horo come off in a fight after the armour (fight.breakOrder) */
export const breakable = ['Kuwagata', 'Maedate'];
/* the gear each hero carries in a turnaround or a card when no weapon is chosen yet (the dark sword and shield
   are the fallback): the samurai a katana, the monk a naginata (sohei), the priest
   the shakujo, the ronin a katana. No shield anywhere in Edo. */
export const heroGear = { knight: ['edo_katana'], barbarian: ['edo_naginata'], mage: ['edo_shakujo'], rogue: ['edo_katana'] };
export const gear = ['edo_katana', 'edo_nodachi', 'edo_kanabo', 'edo_ono', 'edo_tanto', 'edo_naginata', 'edo_shakujo', 'edo_kama'];
export { dressBoss, skyNemesis, dressFoe } from './edo-boss.js';
export { camp } from './edo-camp.js';
export const sfxPools = {};
/* the first-person hold, read by fight.js (worldMod().fpPose). Two-handed block: a high diagonal guard
   (jodan-uke), the blade up and to the left at about 50 degrees, never level across the screen. */
export const fpPose = { guard: { two: { p: [0.22, -0.2, -0.62], d: [-0.55, 0.78, -0.3], e: [0.35, 0.5, -0.8] } } };
/* the war-banner anchor lays a real iron chain to the Lord, so fight.js draws no glow tether */
export const tether = false;

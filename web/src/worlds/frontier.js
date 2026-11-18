/* The Frontier's 3D module: lands (frontier-lands.js), wardrobe, gear, boss dress and camp.
   Registered by web/src/worlds/index.js through registerWorld. */
import * as THREE from 'three';
import { lands, looks, grime } from './frontier-lands.js';
import { worldById } from '/game/worlds.mjs';
import { skyFigure } from './sky-figure.js';

export { lands, looks, grime };
export { dressBoss } from './frontier-boss.js';
export { camp } from './frontier-camp.js';
/* the plain foes' colour blocks, builds and idle clocks */
export { dressFoe } from './frontier-foes.js';
export const wear = '/assets/real/wear_frontier.glb';
export const parts = ['Head_shade', 'Hat_brim', 'Hat_slouch', 'Hat_flat', 'Hat_top', 'Hat_bowler', 'Cap_rail', 'Face', 'Face_baron', 'Moustache', 'Bandana', 'Bandana_dark', 'Bandana_neck', 'Collar', 'Collar_wing', 'Chops', 'Monocle',
  'Shirt', 'Vest', 'Badge', 'Suspenders', 'Sash', 'Apron', 'Duster', 'Poncho', 'Chain_gold', 'Trousers', 'Chaps', 'Boots', 'Gloves', 'Cuffs'];
export const gear = ['frontier_sabre', 'frontier_pick', 'frontier_cleaver', 'frontier_sledge', 'frontier_axe', 'frontier_bowie', 'frontier_pitchfork', 'frontier_pickhandle', 'frontier_hatchet', 'frontier_board'];
/* the far shape on the nemesis line: the real rig in the nemesis's own clothes as one dark rim-lit
   outline on the skyline (web/src/worlds/sky-figure.js), not primitives. other: the Other Drifter, 32 m in the haze: slouch hat, the long duster blowing out behind him in the wind, a wide
          still stance, the sabre hung low in his right hand, point down; his head turns to the walker and holds; now and
          then the sun runs down the blade.
   baron: the Baron, 40 m and broad: top hat, frock coat, the rail sledge head-down in the dust at his side like a cane,
          a cigar ember that glows on the draw and lets out a wisp of smoke (the land's train smokes behind him). */
export async function skyNemesis(id, ctx) {
  if (id !== 'baron' && id !== 'other') return null;
  const n = worldById('frontier').nemeses.find((x) => x.id === id); if (!n) return null;
  const baron = id === 'baron';
  const F = await skyFigure(ctx, {
    look: n.look, wearUrl: wear, height: baron ? 40 : 32, dist: baron ? 220 : 205, clip: 'Idle_Loop', speed: 0.4,
    color: 0x0c0907, wind: ['Duster', 'Bandana_neck'], windAmp: baron ? 0.09 : 0.17, windTop: 1.15, windBottom: 0.35,
    stance: baron ? 0.1 : 0.2, lean: baron ? 0.05 : 0.14, arms: baron ? [0.16, 0.06] : [0.14, 0.2], wide: baron ? 1.12 : 1, crown: baron ? 0.42 : 0.24,
    dust: 0xc89a70, dustOp: 0.36, dustN: 14,
    weapon: baron ? sledgeFar : sabreFar, weaponRot: baron ? [0.05, 0, -0.1] : [0.32, 0, -0.22],
    extras: baron ? cigar : glint,
  });
  /* when the fight's Baron arrives (frontier-boss.js finds this hook in the
     scene), the far giant crouches, rises off the trestle and drops below the skyline; the near Baron lands a beat later */
  if (baron && F?.object) {
    let leapT = -1; const H = 40; const up = F.update;
    F.object.userData.frFar = { id, leap: () => { if (leapT < 0) leapT = 0; } };
    F.update = (dt, t) => {
      up?.(dt, t);
      if (leapT < 0) return;
      leapT += dt; const k = leapT;
      const dy = k < 0.12 ? -H * 0.03 * Math.sin(k / 0.12 * Math.PI) : k < 0.4 ? H * 0.12 * Math.sin((k - 0.12) / 0.28 * Math.PI / 2) : H * 0.12 - H * 2.6 * (k - 0.4) ** 2;
      F.object.position.y += dy; if (k > 1.3) F.object.visible = false;
    };
  }
  return F;
}
/* the far weapons, metres at human size, the grip at the origin, hanging down (-y) */
function sabreFar(T, mat, geos) {
  const g = new T.Group();
  const bl = new T.Shape(); bl.moveTo(-0.026, 0); bl.quadraticCurveTo(-0.04, -0.45, 0.022, -0.88); bl.lineTo(0.034, -0.8); bl.quadraticCurveTo(0.02, -0.42, 0.028, 0); bl.closePath();
  const bg = new T.ExtrudeGeometry(bl, { depth: 0.01, bevelEnabled: false }); bg.translate(0, -0.1, -0.005); geos.push(bg); g.add(new T.Mesh(bg, mat));
  const gu = new T.BoxGeometry(0.1, 0.02, 0.03); gu.translate(0, -0.09, 0); geos.push(gu); g.add(new T.Mesh(gu, mat));
  const gr = new T.CylinderGeometry(0.016, 0.016, 0.16, 6); gr.translate(0, 0.0, 0); geos.push(gr); g.add(new T.Mesh(gr, mat));
  g.userData.tip = new T.Vector3(0.02, -0.9, 0); g.userData.mid = new T.Vector3(0.0, -0.5, 0);
  return g;
}
function sledgeFar(T, mat, geos) {
  const g = new T.Group();
  const h = new T.CylinderGeometry(0.022, 0.026, 0.95, 6); h.translate(0, -0.42, 0); geos.push(h); g.add(new T.Mesh(h, mat));
  const hd = new T.BoxGeometry(0.34, 0.14, 0.14); hd.translate(0, -0.9, 0); geos.push(hd); g.add(new T.Mesh(hd, mat));
  return g;
}
/* the Drifter's blade catches the low sun every few seconds: a short warm glint that runs down it */
function glint({ add, sprite, H, weapon }) {
  const sp = sprite(0xffd7a0, H * 0.09, { add: true, fog: false }); add(sp);
  let next = 4; let on = -1; const P = new THREE.Vector3();
  return {
    update(dt, t, f) {
      next -= dt; if (next < 0 && on < 0) { on = 0; next = 5 + Math.random() * 5; }
      if (on >= 0) {
        on += dt; const k = on / 0.7; if (k >= 1) { on = -1; sp.material.opacity = 0; return; }
        if (weapon) { P.set(0.01, -0.15 - 0.7 * k, 0.012); weapon.localToWorld(P); sp.parent.worldToLocal(P); sp.position.copy(P); }
        sp.material.opacity = f * Math.sin(k * Math.PI) * 0.9;
      } else sp.material.opacity = 0;
    },
  };
}
/* the Baron's cigar: an ember at the mouth that glows on a slow draw, then a grey wisp rises and leans downwind */
function cigar({ add, sprite, H, headPos }) {
  const M = H / 1.95;
  const ember = sprite(0xff7a2a, M * 0.07, { add: true, fog: false }); add(ember);
  const halo = sprite(0xff8a3a, M * 0.22, { add: true, fog: false }); add(halo);
  const puffs = []; for (let i = 0; i < 6; i++) { const sp = sprite(0x8a8078, M * 0.3); sp.position.set(0, H * 0.85, 0); add(sp); puffs.push({ sp, life: -1, p: new THREE.Vector3() }); }
  const mouth = new THREE.Vector3(); let draw = 3; let pull = 0; let pi = 0; let emit = 0;
  return {
    update(dt, t, f) {
      headPos(mouth); mouth.y -= M * 0.07; mouth.z += M * 0.13; mouth.x += M * 0.03;
      draw -= dt; if (draw < 0) { draw = 6 + Math.random() * 4; pull = 1.4; }
      if (pull > 0) { pull -= dt; if (pull < 0.2 && pull + dt >= 0.2) emit = 1.6; }
      const glow = pull > 0 ? Math.sin(Math.min(1, (1.4 - pull) / 1.2) * Math.PI * 0.5) : 0;
      ember.position.copy(mouth); halo.position.copy(mouth);
      ember.material.opacity = f * (0.45 + 0.55 * glow); halo.material.opacity = f * 0.22 * glow;
      if (emit > 0) { emit -= dt; if ((emit * 6 | 0) !== ((emit + dt) * 6 | 0)) { const q = puffs[pi++ % puffs.length]; q.life = 0; q.p.copy(mouth); } }
      for (const q of puffs) {
        if (q.life < 0) { q.sp.material.opacity = 0; continue; }
        q.life += dt; const k = q.life / 4.5; if (k >= 1) { q.life = -1; continue; }
        q.sp.position.set(q.p.x + k * M * 0.9, q.p.y + k * M * 0.6, q.p.z - k * M * 0.2);
        q.sp.scale.setScalar(M * (0.12 + k * 0.6)); q.sp.material.opacity = f * 0.45 * Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k);
      }
    },
  };
}
export const sfxPools = {};
/* the Hired Hand's plank board straps to the left forearm like the dark shield (same frame: planks up, face out) */
/* the tailgate's planks: grey weathered wood in three tones, a dark scrawl (no bright dark-world paint) */
/* blades keep less of the bright dusk sky (the sabre read as a white sliver), and the forge wear specks are fewer */
export const gearLook = { bladeEnv: 0.55, wear: 0.08, shieldPaint: [[0x4a3a2c, 0x24180f], [0x3e3226, 0x1e140c], [0x54402e, 0x2a1c12]] };
export const mounts = { frontier_board: { r: [0, Math.PI, 0], p: [-0.09, -0.06, -0.06], shield: true } };
/* the frontier keeps no first-person rest override. fight.js's shared rest (the fist low right, the
   tip right of centre) now applies, so the sabre never stands upright through the screen centre. */
export const fpPose = {};
/* the gear each class carries in a turnaround or a card (read from mod.heroGear): the Railman with the
   rail pick, never the butcher's cleaver */
export const heroGear = { knight: ['frontier_sabre', null], barbarian: ['frontier_pick', null], mage: ['frontier_pickhandle', null], rogue: ['frontier_bowie', 'frontier_bowie'] };

/* First-person hands for the ranged weapons. the same hand as the sword fist, in other poses.
   The hands were capsules on joints, with both hands on one spot and tube fingers. Now every pose is
   one sculpted mesh, modelled by script in Blender (fp_pose_<pose>.glb: grip, trigger, hook, open, cup, pinch), the very hand that
   the world fist glb (fp_hand_<world>.glb) holds in its grip pose. Each pose glb carries one baked colour set per world
   (COLOR_0 dark, COLOR_1 edo, COLOR_2 neon, COLOR_3 frontier, COLOR_4 storybook, COLOR_5 storybook_cloth): the hand takes
   the set of its world and the fist's own material (grain texture, metal or leather), so a pose hand is dressed as the fist.
   A pose change swaps the mesh (no bending joints). Until the glbs are in, the world fist stays on screen.
   The hand lives inside the fist group of fight.js (fight.hands.r / .l .fist), in the fist frame after the glTF export:
   the handle runs along +Y through the origin, the knuckles face -Z, the back of a right hand faces +X, the wrist leaves
   toward +Z. the pose glbs are mirrored like the fist: the back of the hand is on -X,
   so the thumb sits on the inner side of each hand. A left hand is the same hand mirrored (scale.x = -1), as fight.js does it. */
import * as THREE from 'three';
import { loadGLB } from './world.js';
import { hand2Tone } from './fight.js';

const NAMES = ['grip', 'trigger', 'hook', 'open', 'cup', 'pinch'];
const WORLDS = ['dark', 'edo', 'neon', 'frontier', 'storybook', 'storybook_cloth'];
let LOAD = null;
/* the real hand (fight.js HAND2). It has two poses so far, grip and trigger; any
   other pose shows the grip. These meshes are a TRUE right hand: the right hand shows them as they are, the left mirrored. */
const LOAD2 = {};
function loadHand2(look) {
  LOAD2[look] ||= Promise.all(NAMES.map((n) => loadGLB(`/assets/real/fp2_${n}_${look}.glb`).then((g) => { let m = null; g.scene.traverse((o) => { if (!m && o.isMesh) m = o; }); return [n, m]; })))
    .then((l) => Object.fromEntries(l)).catch((err) => { console.warn('hand2 poses', err); return null; });
  return LOAD2[look];
}
/* the six pose meshes (shared geometry; each hand clones what it shows) */
export function loadHandPoses() {
  LOAD ||= Promise.all(NAMES.map((n) => loadGLB(`/assets/real/fp_pose_${n}.glb`).then((g) => { let m = null; g.scene.traverse((o) => { if (!m && o.isMesh) m = o; }); return [n, m]; })))
    .then((l) => Object.fromEntries(l)).catch((err) => { console.warn('hand poses', err); return null; });
  return LOAD;
}

/* the world of a fist, from its material name (names: SQH_metal_plate_gauntlet, SQH_Leather_<world>_glove) */
function fistLook(fist) {
  let mat = null; fist.traverse((o) => { if (!mat && o.isMesh && o.material && o.geometry?.attributes?.color) mat = o.material; });
  if (!mat) fist.traverse((o) => { if (!mat && o.isMesh && o.material) mat = o.material; });
  const n = mat?.name || '';
  let w = 'dark'; const m = /SQH_Leather_(.+?)_(glove|tekko)/.exec(n); if (m && WORLDS.includes(m[1])) w = m[1];
  return { mat, set: WORLDS.indexOf(w) };
}

export class RangedHand {
  /* fist = fight.hands.r.fist or .l.fist; left = mirrored */
  constructor(fist, left) {
    this.fist = fist; this.left = left; this.on = false; this.cur = null; this.want = 'grip';
    /* the exported sculpt is a left-hand shape (its thumb is on the inside of a RIGHT slot only by the roll that the
       sword grip gives it). On a gun the roll is another one, and the right hand showed its thumb on the wrong side, with the
       trigger finger across the grip. So here the right hand is the sculpt turned about x = 0 (a true right hand) and the left hand
       is the exported one, unturned (a true left hand): each has its own thumb. */
    this.flipped = !left;
    const root = new THREE.Group(); root.name = 'rangedHand'; root.visible = false;
    this.root = root; fist.add(root); this.meshes = {}; this.geos = []; this.ready = false;
    this.look2 = fist.userData.hand2 || null;
    if (this.look2) { this.flipped = left; loadHand2(this.look2.look).then((P) => { if (this.gone) return; if (P?.grip) this.build2(P); else { this.look2 = null; this.flipped = !left; loadHandPoses().then((Q) => { if (Q && !this.gone) this.build(Q); }); } }); }
    else loadHandPoses().then((P) => { if (!P || this.gone) return; this.build(P); });
  }
  build(P) {
    const { mat, set } = fistLook(this.fist);
    const m = mat ? mat.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
    m.vertexColors = true; m.side = THREE.FrontSide; this.mat = m;
    for (const n of NAMES) {
      const src = P[n]; if (!src) continue;
      const g = src.geometry.clone(); const key = set > 0 ? `color_${set}` : 'color';
      if (g.attributes[key]) g.setAttribute('color', g.attributes[key]);
      for (let i = 1; i < WORLDS.length; i++) g.deleteAttribute(`color_${i}`);
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, m); mesh.userData.base = src.matrixWorld.clone(); mesh.matrix.copy(src.matrixWorld); mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 5; mesh.frustumCulled = false; mesh.castShadow = false; mesh.visible = false;
      this.root.add(mesh); this.meshes[n] = mesh;
    }
    this.ready = true; if (this.flipped) this.flipX(true); this.set(this.want); this.use(this.on);
  }
  build2(P) {
    for (const n of NAMES) {
      const src = P[n] || P.grip; if (!this.mat) { this.mat = src.material.clone(); this.mat.color.set(hand2Tone(this.look2)); this.mat.roughness = this.look2.rough; this.mat.metalness = 0; }
      const mesh = new THREE.Mesh(src.geometry, this.mat); mesh.userData.base = src.matrixWorld.clone(); mesh.matrix.copy(src.matrixWorld); mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 5; mesh.frustumCulled = false; mesh.castShadow = false; mesh.visible = false;
      this.root.add(mesh); this.meshes[n] = mesh;
    }
    this.ready = true; if (this.flipped) this.flipX(true); this.set(this.want); this.use(this.on);
  }
  /* show this hand in place of the world fist (or put the fist back); the fist stays until the poses are in */
  use(on) {
    this.on = on; const show = on && this.ready;
    for (const c of this.fist.children) if (c !== this.root) c.visible = !show;
    this.root.visible = show;
  }
  /* turn the sculpt about the x = 0 plane (the pose glbs are mirrored at export) */
  flipX(on) {
    this.flipped = !!on; const S = new THREE.Matrix4().makeScale(-1, 1, 1);
    for (const k of NAMES) { const m = this.meshes[k]; if (!m) continue; m.matrix.copy(m.userData.base); if (on) m.matrix.premultiply(S); m.matrixWorldNeedsUpdate = true; }
  }
  /* switch to a pose (k is kept for the old API: a pose is a mesh, it snaps) */
  set(name) {
    const n = NAMES.includes(name) ? name : 'grip'; this.want = n;
    if (!this.ready || this.cur === n) return;
    for (const k of NAMES) if (this.meshes[k]) this.meshes[k].visible = k === n;
    this.cur = n;
  }
  /* move the whole hand inside the fist frame (an open hand under a grip, a pinch at a gate) */
  offset(x, y, z) { this.root.position.set(this.left ? -x : x, y, z); }
  dispose() {
    this.gone = true; this.root.removeFromParent(); this.use(false);
    for (const g of this.geos) g.dispose(); this.mat?.dispose();
  }
}

/* The Frontier's boss dress (web/src/worlds/frontier.js exports it as dressBoss).
   baron: the dark giant (web/src/bosses.js dressGiant: the body, the walk, the slam rings, the kneel and the topple) in the
          Baron's clothes (top hat, frock coat, gold chain, no plate), dusty instead of frosted, a rail sledge in place of the
          giant maul, an iron spike driven into the ground at each slam, and at the death his hat falls and rolls in the dust.
   other: a rival drifter in a pale coat (the twin mechanic, bare: no glass). */
import * as THREE from 'three';
import { railSledge } from '../props/sledge.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { dressBoss as darkDress } from '../bosses.js';
import { turnWorld, softTex } from './sky-figure.js';

const UP = new THREE.Vector3(0, 1, 0);

/* a rail sledge, in the giant maul's frame: a short thick hickory handle along +Y, a big square-faced steel head at
   y = L across X, a wedge of iron where the handle goes through (no long shaft, no point: it must never read as a spear) */
/* a real sledge. A long pale hickory haft with a dark grip wrap, a big square
   block of black iron (about 0.4 x 0.2 x 0.2 of the haft's length scale, three times the old volume) with bright
   struck faces, chamfered corners and an iron collar where the haft goes in */
function sledge(L) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.7, metalness: 0 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.85, metalness: 0 });
  /* dark forged iron (it mirrored the pale sky
     as flat grey), a rounded, hammered block with bright worn edges only on the struck faces */
  const iron = new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.66, metalness: 0.55, envMapIntensity: 0.55 });
  const face = new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.38, metalness: 1, envMapIntensity: 0.8 });
  const g = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.046, L + 0.22, 12), wood); haft.position.y = L / 2 - 0.1; g.add(haft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.05, 0.3, 12), wrap); grip.position.y = -0.02; g.add(grip);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.05, 12), wrap); knob.position.y = -0.2; g.add(knob);
  /* a longer, deeper head (a rail sledge is a block, not a blade) */
  const HW = 0.74; const HS = 0.3;
  const head = new THREE.Mesh(new RoundedBoxGeometry(HW - 0.08, HS, HS, 3, 0.045), iron); head.position.y = L; g.add(head);
  for (const sx of [-1, 1]) {
    /* the struck faces: a chamfered square plug, bright where it rings on the rail */
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(HS * 0.6, HS * 0.707, 0.05, 4, 1), iron); ch.rotation.set(0, Math.PI / 4, -sx * Math.PI / 2, 'ZYX'); ch.position.set(sx * (HW / 2 - 0.015), L, 0); g.add(ch);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.012, HS * 0.84, HS * 0.84), face); f.position.set(sx * (HW / 2 + 0.006), L, 0); g.add(f);
  }
  /* the eye's collar and the wedge on top */
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, HS + 0.03), iron); collar.position.y = L - HS / 2 - 0.02; g.add(collar);
  const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, HS * 0.7), face); wedge.position.y = L + HS / 2 + 0.008; g.add(wedge);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.giantMaul = true; } });
  return { g, mats: [wood, wrap, iron, face] };
}

/* a top hat to roll: a crown that flares a little at the top, a silk band, a brim curled up at the sides and rolled at
   the edge (the same shape as the wardrobe's Hat_top); dull silk, so it never flashes as a cream disc */
const HAT_K = 0.85;
function rollingHat(S) {
  const silk = new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.62, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide });
  const band = new THREE.MeshStandardMaterial({ color: 0x2e1e14, roughness: 0.75, envMapIntensity: 0.3 });
  const g = new THREE.Group();
  const prof = [[0.0, 0.245], [0.117, 0.245], [0.121, 0.236], [0.115, 0.2], [0.108, 0.12], [0.11, 0.03], [0.113, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const crown = new THREE.Mesh(new THREE.LatheGeometry(prof.slice().reverse(), 22), silk); g.add(crown);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1145, 0.1145, 0.04, 22, 1, true), band); b.position.y = 0.024; g.add(b);
  /* the brim: a ring whose sides curl up and whose front and back dip, with a rolled edge */
  const brimGeo = new THREE.RingGeometry(0.11, 0.2, 32, 3); brimGeo.rotateX(-Math.PI / 2);
  const p = brimGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const z = p.getZ(i); const r = Math.hypot(x, z); const a = Math.atan2(z, x); const k = Math.max(0, (r - 0.13) / 0.07);
    p.setY(i, k * k * (0.045 * Math.cos(a) ** 2 - 0.012 * Math.sin(a) ** 2));
  }
  brimGeo.computeVertexNormals();
  const brim = new THREE.Mesh(brimGeo, silk); g.add(brim);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 5, 32), silk); edge.rotation.x = Math.PI / 2; g.add(edge);
  { const e = edge.geometry.attributes.position; for (let i = 0; i < e.count; i++) { const x = e.getX(i); const yy = e.getY(i); const a = Math.atan2(yy, x); e.setZ(i, e.getZ(i) - 0.045 * Math.cos(a) ** 2 + 0.012 * Math.sin(a) ** 2); } edge.geometry.computeVertexNormals(); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  /* the pivot at the crown's centre, so it can roll on its brim and tumble about its middle */
  for (const c of g.children) c.position.y -= 0.1;
  const root = new THREE.Group(); root.add(g); root.scale.setScalar(S * HAT_K); /* 1.27 -> 0.85: the hat was about twice the size of the head */
  return { g: root, mats: [silk, band] };
}

/* the Other Drifter: a rival in a pale coat, no glass. The twin mechanic runs bare (no dark parts or effects); his clothes
   are the nemesis look, his blade the frontier sabre (mirror false).
   the cream coat read as a clean bathrobe and the
   face as a friendly cartoon. Now: a sun-bleached, dust-dulled duster; the dark kerchief, not the red one; the head
   carried low so the brim shades the face; the face itself in hat shadow (its tones darkened) with a pale scar down the
   left cheek and two small cold glints where the eyes catch the light; a gun belt with a holstered revolver on the
   right thigh (gear of his own: he does not need it, he wants the blade). */
const OTHER_CLOTH = 0x665a48;
function dressOther(actor, ctx) {
  const H = darkDress(actor, 'twin', { ...ctx, dress: null, bare: true });
  if (ctx.heroLook) {
    const wear = (ctx.heroLook.wear || []).map((p) => (p === 'Bandana_neck' ? 'Bandana_dark' : p));
    actor.look({ ...ctx.heroLook, wear, cloth: OTHER_CLOTH, eye: 0x000000, eyePower: 0, vary: false });
  }
  const own = []; const geos = []; const off = [];
  /* bind space (the rig, metres, +z = his front, +x = his left) -> a bone's frame, from a skinned part's inverse */
  const bindTo = (name) => {
    for (const m of actor.meshes) { if (!m.isSkinnedMesh) continue; const i = m.skeleton.bones.findIndex((b) => b.name === name); if (i >= 0) return { bone: m.skeleton.bones[i], inv: m.skeleton.boneInverses[i].clone().multiply(m.bindMatrix) }; }
    return null;
  };
  const place = (B, obj, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    obj.matrixAutoUpdate = false; obj.matrix.copy(B.inv).multiply(M); B.bone.add(obj); off.push(() => obj.removeFromParent());
  };
  let done = false;
  const dress = () => {
    if (done || !actor.parts?.has('Face')) return; done = true;
    /* the face in the brim's shadow: every face tone (skin, brows, eyes) at a third */
    for (const m of actor.parts.get('Face') || []) { const mt = m.material; if (mt?.color) { mt.color.multiplyScalar(0.36); mt.emissive?.setScalar(0); } }
    const head = bindTo('Head'); const thigh = bindTo('thigh_r');
    if (head) {
      /* the scar: a pale raised line from the brow down across the left cheek */
      const scarMat = new THREE.MeshStandardMaterial({ color: 0xc49a84, roughness: 0.6 }); own.push(scarMat);
      const sg = new THREE.BoxGeometry(0.007, 0.068, 0.006); geos.push(sg);
      place(head, new THREE.Mesh(sg, scarMat), 0.05, 1.7, 0.146, -0.2, 0.35, -0.42);
      /* the eyes catch the light under the brim */
      const gl = new THREE.SpriteMaterial({ color: 0xffe8c8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }); own.push(gl);
      for (const sx of [-1, 1]) { const sp = new THREE.Sprite(gl); sp.scale.setScalar(0.03); const o = new THREE.Group(); o.add(sp); place(head, o, sx * 0.034, 1.716, 0.156); }
    }
    if (thigh) {
      /* the gun belt's holster on the right thigh, a revolver grip standing out of it, butt back */
      const leather = new THREE.MeshStandardMaterial({ color: 0x2c1d13, roughness: 0.8 }); const grip = new THREE.MeshStandardMaterial({ color: 0x3c2618, roughness: 0.55 }); const steel = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.35, metalness: 0.9 }); own.push(leather, grip, steel);
      const hg = new THREE.BoxGeometry(0.05, 0.2, 0.085); const gg = new THREE.BoxGeometry(0.032, 0.085, 0.04); const cg = new THREE.CylinderGeometry(0.022, 0.022, 0.045, 8); const bg = new THREE.BoxGeometry(0.06, 0.04, 0.012); geos.push(hg, gg, cg, bg);
      place(thigh, new THREE.Mesh(hg, leather), -0.155, 0.86, 0.0, 0.12, 0, 0.1);
      place(thigh, new THREE.Mesh(cg, steel), -0.157, 0.975, 0.0, Math.PI / 2, 0, 0.1);
      place(thigh, new THREE.Mesh(gg, grip), -0.16, 1.02, -0.035, -0.7, 0, 0.1);
    }
  };
  dress();
  /* the head carried low: the brim over the eyes (after every mixer update, held poses too) */
  const ax = new THREE.Vector3(); const q = new THREE.Quaternion();
  const unpose = actor.pose?.('Head', (b) => { actor.root.getWorldQuaternion(q); ax.set(1, 0, 0).applyQuaternion(q); turnWorld(b, ax, 0.1); }) || (() => {});
  const update = H.update;
  H.update = (dt, st) => { if (!done) dress(); return update?.(dt, st); };
  const dispose = H.dispose;
  H.dispose = () => { dispose?.(); unpose(); for (const f of off) f(); for (const g of geos) g.dispose(); for (const m of own) m.dispose(); };
  return H;
}

/* clods and split timber: a dark earth rock for the giant's shard pool */
function clodGeometry() {
  /* welded vertices, so the clod shades round, not as flat facets */
  const g0 = new THREE.IcosahedronGeometry(0.5, 2); g0.deleteAttribute('uv'); g0.deleteAttribute('normal'); const g = mergeVertices(g0); g0.dispose(); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const k = 0.78 + 0.3 * Math.abs(Math.sin(x * 9.1 + y * 5.3 + z * 7.7));
    p.setXYZ(i, x * k * 1.1, y * k * 0.85, z * k);
  }
  g.computeVertexNormals(); return g;
}

export function dressBoss(actor, nid, ctx) {
  if (nid === 'other') return dressOther(actor, ctx);
  if (nid !== 'baron') return null;
  const S = ctx.size || 1.6;
  const sc0 = ctx.scene || actor.root.parent; const before = new Set(sc0 ? sc0.children : []);
  /* the giant's body and effects, dusty (the ash mode of dressGiant: brown dust, no white frost) */
  /* visor: false: a top hat over an open, shaded face, so no furnace glow behind a slit */
  const H = darkDress(actor, 'giant', { ...ctx, dress: null, size: S, biome: 'dusksteppe', frost: 0x2e241c, visor: false,
    cracks: { color: 0x6a4c34, glow: false } /* a dry split in the dirt, not an ink spill */, debris: { color: 0x4e3a2a, lift: 0.35 } });
  /* the slam's earth: the shard pool takes round lumpy clods in dark earth, the crater's raised paper-thin rim is hidden
     (its rubble stays), and the white slam light becomes a short warm flash */
  let slamLight = null;
  if (sc0) for (const o of sc0.children) {
    if (before.has(o)) continue;
    if (o.isInstancedMesh && o.material?.isMeshStandardMaterial) { o.geometry = clodGeometry(); o.material.color.set(0x4e3a2a); o.material.roughness = 1; o.material.flatShading = false; o.material.needsUpdate = true; }
    if (o.isGroup) for (const c of o.children) if (c.isMesh && c.geometry?.type === 'RingGeometry') c.visible = false;
    if (o.isPointLight) slamLight = o;
  }
  /* the giant's rime reads as pale blobs on a black coat: a thin film of dust only */
  if (H.frost?.k) H.frost.k.value = 0.25;
  if (H.frostLow?.k) H.frostLow.k.value = 0.12;
  /* his own clothes over the giant's proportions: no plate shows; work gloves over the giant's big hands */
  if (ctx.heroLook) actor.look({ ...ctx.heroLook, eye: 0x000000, eyePower: 0 });
  /* the hero stands well clear of the coat: at the giant's 1.5 x size the camera came inside his chest in a lunge */
  /* 1.84 x size = 2.95 m. Holding the hero at 4.2 m, but his reach (the giant's 1.85 x size = 2.96 m) never got
     there, so he walked at the hero for the whole fight and never swung. Under his
     reach + 0.2 he swings; fight.js clearPts keeps his hands and the sledge off the lens. */
  /* at 2.6 x size the view from 4.8 m cut his hat under the boss bar: he holds the hero at 2.0 x size (5.2 m) and his
     reach (game/worlds/frontier.mjs, 2.15 x size = 5.6 m) still covers it */
  H.keepOut = 2.0 * S;
  const scene = ctx.scene || actor.root.parent;
  const owned = []; let maulHolder = null;
  /* the sledge: the giant maul's meshes hidden, the rail sledge added to the same group (it keeps the swing and the drop) */
  const swap = () => {
    let maul = null;
    actor.root.traverse((o) => { if (!maul && o.isMesh && o.userData.giantMaul && !o.userData.frSledge) maul = o.parent; });
    if (!maul) return false;
    maulHolder = maul.parent;
    for (const c of maul.children) if (c.isMesh) c.visible = false; else c.traverse((o) => { if (o.isMesh) o.visible = false; });
    const s = railSledge(1.0); /* the forged rail sledge, same frame as sledge() */ s.g.traverse((o) => { o.userData.frSledge = true; }); maul.add(s.g); owned.push(...s.mats);
    return true;
  };
  let swapped = swap();
  /* his phases show on the sledge: the iron head runs hot (orange under 60 %, glowing under 30 %) */
  { const ph0 = H.onPhase; H.onPhase = (p) => { try { ph0?.(p); } catch { /* the giant's own */ } actor.root.traverse((o) => { if (o.isMesh && o.userData.frSledge && o.material?.emissive && o.material.metalness > 0.3) { o.material.emissive.set(0xff5a1a); o.material.emissiveIntensity = p >= 2 ? 1.1 : 0.5; } }); }; }
  /* the spike: at each slam an iron rail spike is driven into the ground where the sledge lands, then rusts there a while */
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.6, metalness: 0.7 }); owned.push(spikeMat);
  const spikeGeo = new THREE.BoxGeometry(0.05, 0.6, 0.05); spikeGeo.translate(0, 0.3, 0);
  const headGeo = new THREE.BoxGeometry(0.11, 0.035, 0.08); headGeo.translate(0.02, 0.6, 0);
  const spikes = [];
  /* split timber: the slam breaks a rail tie, and its planks and splinters fly with the clods and lie in the dust */
  const TN = 18; const tieMat = new THREE.MeshStandardMaterial({ color: 0x5a422c, roughness: 0.95 }); owned.push(tieMat);
  const tieGeo = new THREE.BoxGeometry(0.5, 0.07, 0.12); const ties = new THREE.InstancedMesh(tieGeo, tieMat, TN); ties.castShadow = true; ties.frustumCulled = false;
  const tp = new Float32Array(TN * 3); const tv = new Float32Array(TN * 3); const tw = new Float32Array(TN * 3); const tr = new Float32Array(TN * 3); const tl = new Float32Array(TN).fill(-1); const ts = new Float32Array(TN); let tNext = 0;
  const _o = new THREE.Object3D();
  for (let i = 0; i < TN; i++) { _o.scale.setScalar(0); _o.updateMatrix(); ties.setMatrixAt(i, _o.matrix); }
  if (scene) scene.add(ties);
  const slam = H.onSlam;
  H.onSlam = (pos) => {
    const r = slam(pos);
    if (slamLight) { slamLight.intensity *= 0.35; slamLight.color.set(0xffc890); }
    if (pos) for (let k = 0; k < 7; k++) {
      const i = tNext; tNext = (tNext + 1) % TN; const a = Math.random() * 6.283; const sp = 2 + Math.random() * 4;
      tp.set([pos.x + Math.cos(a) * 0.5, 0.3, pos.z + Math.sin(a) * 0.5], i * 3); tv.set([Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp], i * 3);
      tw.set([(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12], i * 3); tr.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      tl[i] = 6; ts[i] = (0.6 + Math.random() * 0.8) * (k < 2 ? 1.4 : 0.7);
    }
    if (pos && scene) {
      const g = new THREE.Group(); g.add(new THREE.Mesh(spikeGeo, spikeMat), new THREE.Mesh(headGeo, spikeMat));
      g.scale.setScalar(S * 0.9); g.position.set(pos.x, 0.25 * S, pos.z); g.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * 6.28, (Math.random() - 0.5) * 0.12);
      scene.add(g); spikes.push({ g, t: 0 });
      while (spikes.length > 4) spikes.shift().g.removeFromParent();
    }
    return r;
  };
  /* proportions: the dark giant sinks its small head into the collar and hangs long arms from wide shoulders. The Baron
     keeps the bulk but holds his head up out of the wing collar (so the hat sits on a head, not on a stump) and his arms
     stay a man's arms: shoulders and hands closer to human. Applied after the giant's own shape on every mixer update. */
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const bone = (n) => actor.model?.getObjectByName(n);
  const head = bone('Head');
  const restH = head ? head.position.clone().divideScalar(0.15) : null; /* dressGiant set it to rest x 0.15 */
  const arms = ['l', 'r'].map((sd) => ({ ua: bone('upperarm_' + sd), hand: bone('hand_' + sd) })).map((o) => ({ ...o, rest: o.ua ? o.ua.position.clone().divideScalar(1.55) : null }));
  const reshape = () => {
    if (head && restH) head.position.copy(restH).multiplyScalar(0.55 + (H.sqDeathT >= 0 ? 0.35 * sst(0, 0.45, H.sqDeathT) : 0));
    for (const o of arms) { if (o.ua && o.rest) o.ua.position.copy(o.rest).multiplyScalar(1.3); if (o.hand) o.hand.scale.setScalar(1.22); }
  };
  if (actor.mixer) { const mu = actor.mixer.update.bind(actor.mixer); actor.mixer.update = (dt) => { const r = mu(dt); reshape(); return r; }; }
  reshape();

  /* the death ("4.0": seven frames of a black shape face down, the face a white disc, the hat back on his
     head, an agave over the moment). Now: he drops to his knees (the giant's kneel), the hat leaves his head at the knees
     and rolls away to his left, past the sledge, out in the open, and stays there; he sways, then goes over BACKWARD and
     to his RIGHT, away from the hat and the sledge, so he lands on his back and side with his chest, chops and face turned up to the hero.
     His back straightens and his head tips back as he goes; on the ground his chest heaves twice and his head rolls to
     the hero. The sagebrush, rocks and branches between the hero and the fall are cleared when the death camera comes up. */
  let hat = null; let deathT = -1; let impactPuff = false;
  const kneel = H.onKneel;
  H.onKneel = (t) => { kneel?.(t); if (deathT < 0) deathT = 0; };
  const vel = new THREE.Vector3(); const hp = new THREE.Vector3(); const hq = new THREE.Quaternion(); const _up = new THREE.Vector3();
  const qa = new THREE.Quaternion(); const qb = new THREE.Quaternion(); const qc = new THREE.Quaternion(); const ZA = new THREE.Vector3(0, 0, 1);
  let roll = -1; const rollDir = 1; let spin = 0; let ang = 0; const R = 0.2 * S * HAT_K; /* the brim's radius in metres */
  const ROLL_T = 2.6; /* seconds on its brim before it lies still: it is still moving through the hold before the card */
  /* the fall: a clock from the killing blow, the model's pose at that moment, a pivot at his right knee (root-local -x) */
  let dk = -1; const mQ0 = new THREE.Quaternion(); const mP0 = new THREE.Vector3(); const PIV = new THREE.Vector3(-0.24, 0.06, 0.02);
  /* knees first, then over onto his RIGHT SIDE (a little back), so he lies
     across the view at the same depth as the hat and the sledge, not tipped away from the camera */
  const FALL0 = 1.35; const FALL1 = 2.2; const BACK = 0.3; const SIDE = 1.38;
  const _rq = new THREE.Quaternion(); const _rz = new THREE.Quaternion(); const AX = new THREE.Vector3(1, 0, 0); const AZ = new THREE.Vector3(0, 0, 1);
  /* the body's own axes in the world (they turn with the fall): his left (x) and his front (z) */
  const _mq = new THREE.Quaternion(); const bodyX = new THREE.Vector3(); const bodyY = new THREE.Vector3(); const bodyZ = new THREE.Vector3();
  const bodyAxes = () => { actor.model.getWorldQuaternion(_mq); bodyX.set(1, 0, 0).applyQuaternion(_mq); bodyY.set(0, 1, 0).applyQuaternion(_mq); bodyZ.set(0, 0, 1).applyQuaternion(_mq); };
  const lean = () => (dk < 0 ? 0 : sst(FALL0 - 0.25, FALL1 - 0.1, dk));
  const heave = () => (dk < FALL1 ? 0 : Math.sin(Math.min(1, (dk - FALL1) / 2.4) * Math.PI * 4) * Math.exp(-(dk - FALL1) * 0.7));
  const lolled = () => (dk < FALL1 ? 0 : sst(FALL1 + 0.3, FALL1 + 1.6, dk));
  const unposes = []; const pelvis = bone('pelvis') || bone('spine_01');
  /* the bones the fallen body rests on and their thickness in metres (coat and padding) */
  const REST = [['Head', 0.13], ['spine_03', 0.2], ['spine_02', 0.2], ['pelvis', 0.18], ['upperarm_l', 0.1], ['upperarm_r', 0.1], ['thigh_l', 0.12], ['thigh_r', 0.12]].map(([n, r]) => [bone(n), r * S / 1.6]).filter(([b]) => b); const _fa = new THREE.Vector3(); const _fb = new THREE.Vector3();
  /* the kneel clip keys no spine, neck or head rotation: a turn added after the mixer would pile up frame on frame (the
     body spun). Each pose starts from the clip's value when the clip wrote one this frame, else from the last base. */
  const absPose = (name, fn) => {
    const base = new THREE.Quaternion(); const last = new THREE.Quaternion(); let wrote = false;
    return actor.pose(name, (b) => {
      if (wrote && b.quaternion.equals(last)) b.quaternion.copy(base); else base.copy(b.quaternion);
      fn(b); last.copy(b.quaternion); wrote = true;
    });
  };
  if (actor.pose) {
    /* the kneel clip bows his back and head over his knees: straighten the back and tip the head back as he falls, so the
       face and chops look up and out of the brim's shadow, never down into the dirt */
    unposes.push(absPose('spine_02', (b) => { const w = lean(); if (w <= 0) return; bodyAxes(); turnWorld(b, bodyX, -0.32 * w); }));
    unposes.push(absPose('spine_03', (b) => { const w = lean(); if (w <= 0) return; bodyAxes(); turnWorld(b, bodyX, -0.3 * w + 0.05 * heave()); }));
    unposes.push(absPose('neck_01', (b) => { const w = lean(); if (w <= 0) return; bodyAxes(); turnWorld(b, bodyX, -0.3 * w); }));
    unposes.push(absPose('Head', (b) => { const w = lean(); if (w <= 0) return; bodyAxes(); turnWorld(b, bodyX, -0.4 * w); turnWorld(b, bodyY, 0.25 * lolled()); }));
    /* the kneel rests both hands on the knees: tipped back, they would stand up in the air. The arms swing down along his
       sides as he goes over: the upper (left) one across his waistcoat, the lower (right) one out on the ground */
    unposes.push(absPose('upperarm_l', (b) => { const w = lean(); if (w <= 0) return; bodyAxes(); turnWorld(b, bodyX, 1.0 * w); turnWorld(b, bodyZ, -0.35 * w); }));
    unposes.push(absPose('upperarm_r', (b) => { const w = lean(); if (w <= 0) return; bodyAxes(); turnWorld(b, bodyX, 0.7 * w); turnWorld(b, bodyZ, -0.55 * w); }));
  }
  /* the view line: every tall clump of scatter (sagebrush, rocks, branches) between the death camera and the fall goes */
  let player = null; const hidden = []; H.frHidden = hidden;
  const _m = new THREE.Matrix4(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3(); const _qq = new THREE.Quaternion(); const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const clearView = () => {
    if (!scene) return;
    const c = actor.root.position; const camD = 2.5 * S + 2.6; /* bosses.js: the death keep-out, + 2.6 m (fight.js holdDeath) */
    let dx = (player?.x ?? c.x + Math.sin(actor.root.rotation.y)) - c.x; let dz = (player?.z ?? c.z + Math.cos(actor.root.rotation.y)) - c.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    scene.traverse((o) => {
      if (!o.isInstancedMesh || o === ties || o.count > 3000 || o.userData.sqKeep) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const gh = o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y; let changed = false;
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, _m); _m.premultiply(o.matrixWorld); _m.decompose(_p, _qq, _s);
        const h = gh * _s.y; if (h < 0.3 || h > 3.5) continue;
        const ax = _p.x - c.x; const az = _p.z - c.z; const along = ax * dx + az * dz; const lat = Math.abs(ax * dz - az * dx);
        const fromCam = camD - along; /* metres in front of the death camera */
        if (along < -3.5 || fromCam < 0.2) continue;
        if (lat > Math.min(4.5, 1.2 + 0.7 * Math.max(0, fromCam))) continue;
        const m0 = new THREE.Matrix4(); o.getMatrixAt(i, m0); hidden.push({ o, i, m0 }); o.setMatrixAt(i, ZERO); changed = true;
      }
      if (changed) { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere?.(); }
    });
  };
  /* the dust of the death. Soft brown puffs that rise, spread and thin out: at the knees, where the sledge lands, where the
     hat first hits, and a tall cloud along the body when he goes down */
  const DN = 48; const dustMat = []; const dust = [];
  for (let i = 0; i < DN; i++) {
    const m = new THREE.SpriteMaterial({ map: softTex(), color: 0x9a7656, transparent: true, opacity: 0, depthWrite: false, fog: true }); dustMat.push(m); owned.push(m);
    const sp = new THREE.Sprite(m); sp.visible = false; dust.push({ sp, life: -1, dur: 1, v: new THREE.Vector3(), s0: 1, s1: 2, a: 0.3 });
  }
  let dNext = 0; const dustG = new THREE.Group(); for (const d of dust) dustG.add(d.sp); if (scene) scene.add(dustG);
  const puff = (at, n, size, rise = 0.5) => {
    for (let k = 0; k < n; k++) {
      const d = dust[dNext]; dNext = (dNext + 1) % DN; const a = Math.random() * 6.283; const r = Math.random() * size * 0.6;
      d.sp.position.set(at.x + Math.cos(a) * r, Math.max(0.15, (scene?.userData?.groundAt?.(at.x, at.z) || 0) + size * 0.3), at.z + Math.sin(a) * r);
      d.v.set(Math.cos(a) * size * 0.5, rise * (0.6 + Math.random() * 0.8), Math.sin(a) * size * 0.5);
      d.life = 0; d.dur = 2 + Math.random() * 1.6; d.s0 = size * (0.6 + Math.random() * 0.4); d.s1 = d.s0 * 2.6; d.a = 0.32 + Math.random() * 0.14; d.sp.visible = true;
    }
  };
  const dustTick = (dt) => {
    for (const d of dust) {
      if (d.life < 0) continue; d.life += dt; const k = d.life / d.dur;
      if (k >= 1) { d.life = -1; d.sp.visible = false; d.sp.material.opacity = 0; continue; }
      d.sp.position.addScaledVector(d.v, dt); d.v.multiplyScalar(Math.exp(-dt * 1.4)); d.sp.scale.setScalar(d.s0 + (d.s1 - d.s0) * Math.sqrt(k));
      d.sp.material.opacity = d.a * Math.min(1, k * 6) * (1 - k) ** 1.4;
    }
  };
  const kneelPuff = H.onKneel;
  H.onKneel = (t) => { kneelPuff?.(t); const p = actor.root.position; puff(p, 8, 0.55 * S, 0.4); };
  /* it drops from his hand and falls flat on the ground
     BESIDE him, on his left (the side away from his fall), the haft along his body and the head out toward the hero's
     right, never in front of the lens. This pose overrides the giant's own drop (bosses.js) every frame. */
  const sQ0 = new THREE.Quaternion(); const sQ1 = new THREE.Quaternion(); const sP0 = new THREE.Vector3(); const sP1 = new THREE.Vector3(); let sT = -1; let sLanded = false;
  const death = H.onDeath;
  H.onDeath = (pos) => {
    const first = dk < 0;
    if (first) { dk = 0; mQ0.copy(actor.model.quaternion); mP0.copy(actor.model.position); try { clearView(); } catch (err) { console.warn('frontier clearView', err); } }
    const r = death(pos);
    /* the death camera narrows to 44 degrees and pushes in to 78 %: at 2.6 x size the giant's 2.5 x size cut the hat
       and the sledge off the frame edge. Stand further back. */
    H.keepOut = 3.3 * S;
    /* he goes over to his right and a little back: the death director's shots stand off that side */
    { const yw = actor.root.rotation.y; const fx = Math.sin(yw); const fz = Math.cos(yw); H.fallDir = new THREE.Vector3(-fz * 1.38 - fx * 0.3, 0, fx * 1.38 - fz * 0.3).normalize(); }
    if (first && maulHolder) {
      maulHolder.updateMatrixWorld(true); sP0.setFromMatrixPosition(maulHolder.matrixWorld); maulHolder.getWorldQuaternion(sQ0);
      const yaw = actor.root.rotation.y; const fx = Math.sin(yaw); const fz = Math.cos(yaw); const lx = fz; const lz = -fx; /* his left */
      const gy = scene?.userData?.groundAt ? scene.userData.groundAt(actor.root.position.x, actor.root.position.z) : 0;
      /* the grip by his left boot, the head out to his left and a little toward the hero */
      sP1.set(actor.root.position.x + lx * 0.45 * S - fx * 0.15 * S, gy + 0.14 * S, actor.root.position.z + lz * 0.45 * S - fz * 0.15 * S);
      const dir = new THREE.Vector3(lx * 0.92 + fx * 0.38, 0.05, lz * 0.92 + fz * 0.38).normalize();
      sQ1.setFromUnitVectors(UP, dir).premultiply(new THREE.Quaternion().setFromAxisAngle(dir, 0.35));
      sT = 0;
    }
    return r;
  };
  /* the arrival. The far
     giant on the trestle (frontier.js skyNemesis hook) leaps off the skyline; a beat later this Baron drops out of the sky
     from behind his mark and lands on his boots (the spawn's Jump_Land clip) with a slam: dust, clods, a driven spike and a
     shake. Model-local offsets only, so the fight's own foe position is never touched. */
  const far = []; if (scene) scene.traverse((o) => { if (o.userData?.frFar?.leap) far.push(o.userData.frFar); });
  let entT = 0; const ENT0 = 0.35; const ENT1 = 1.1; const DROP = 24; const BACK_IN = 6; let entDone = false; const my0 = actor.model ? actor.model.position.clone() : null;
  for (const f of far) { try { f.leap(); } catch { /* the far figure is gone */ } }
  const entry = (dt) => {
    if (entDone || !my0 || dk >= 0) return;
    entT += dt; const k = Math.min(1, Math.max(0, (entT - ENT0) / (ENT1 - ENT0)));
    const Sr = Math.max(1e-3, actor.root.scale.y);
    actor.model.position.set(my0.x, my0.y + DROP * (1 - k * k) / Sr, my0.z - BACK_IN * (1 - k) / Sr);
    if (k >= 1) {
      entDone = true; actor.model.position.copy(my0);
      const yaw = actor.root.rotation.y; const at = actor.root.position.clone(); at.x += Math.sin(yaw) * 0.4 * S; at.z += Math.cos(yaw) * 0.4 * S; at.y = 0;
      try { H.onSlam(at); } catch (err) { console.warn('frontier entry', err); }
    }
  };
  /* the cigar: a short dark cigar in the corner of his mouth with a live ember. It glows on a slow draw, so his face is
     found in the dark twist ("The Baron hides in the dark") and the far giant's cigar is the same man's */
  let cigar = null;
  { const hb = (() => { for (const m of actor.meshes) { if (!m.isSkinnedMesh) continue; const i = m.skeleton.bones.findIndex((b) => b.name === 'Head'); if (i >= 0) return { bone: m.skeleton.bones[i], inv: m.skeleton.boneInverses[i].clone().multiply(m.bindMatrix) }; } return null; })();
    if (hb) {
      const leaf = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.8 }); owned.push(leaf);
      const emb = new THREE.SpriteMaterial({ map: softTex(), color: 0xff8a3a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }); owned.push(emb);
      const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.12, 8), leaf); c.rotation.x = Math.PI / 2; c.position.z = 0.06; g.add(c);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.01, 8), new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false })); tip.rotation.x = Math.PI / 2; tip.position.z = 0.122; g.add(tip); owned.push(tip.material);
      const sp = new THREE.Sprite(emb); sp.scale.setScalar(0.05); sp.position.z = 0.128; g.add(sp);
      const M = new THREE.Matrix4().compose(new THREE.Vector3(-0.035, 1.635, 0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, -0.35, 0)), new THREE.Vector3(1, 1, 1));
      g.matrixAutoUpdate = false; g.matrix.copy(hb.inv).multiply(M); hb.bone.add(g);
      cigar = { g, sp, tip, draw: 2, pull: 0 };
    }
  }
  const puffCigar = (dt) => {
    if (!cigar) return;
    if (dk >= FALL1) { cigar.sp.material.opacity *= Math.exp(-dt * 0.8); cigar.tip.material.color.setHex(0x7a3a1a); return; }
    cigar.draw -= dt; if (cigar.draw < 0) { cigar.draw = 3 + Math.random() * 3; cigar.pull = 1.2; }
    if (cigar.pull > 0) cigar.pull -= dt;
    const glow = cigar.pull > 0 ? Math.sin((1.2 - cigar.pull) / 1.2 * Math.PI) : 0;
    cigar.sp.material.opacity = 0.55 + 0.45 * glow; cigar.sp.scale.setScalar(0.045 + 0.04 * glow);
  };
  const update = H.update;
  H.update = (dt, st = {}) => {
    if (st.player) player = st.player;
    entry(dt);
    update?.(dt, st);
    puffCigar(dt);
    /* the aim point is the crown of the top hat (the giant's own is its helm top, 0.35 x size over the head): at 2.6 x the
       hat stood up under the boss bar and its crown was cut */
    if (dk < 0 && !st.dead) H.lookAt.y += 0.17 * S;
    /* the death's knee burst, killing-blow flash and impact (bosses.js, up to 240 cold white) lit the coat flat white
       (one white frame at the fall); the slam was tamed, the death was not: cap it to the same short warm flash */
    if (slamLight && dk >= 0 && slamLight.intensity > 40) { slamLight.intensity = 40; slamLight.color.set(0xffc890); }
    /* the giant's death frost grows over the plate; on a black coat it reads as grey wash, so the dust stays a thin film */
    if (H.frost?.k && H.frost.k.value > 0.3) H.frost.k.value = 0.3;
    if (H.frostLow?.k && H.frostLow.k.value > 0.15) H.frostLow.k.value = 0.15;
    if (!swapped) swapped = swap();
    const ground = scene?.userData?.groundAt;
    for (let i = 0; i < TN; i++) {
      if (tl[i] < 0) continue; tl[i] -= dt; const j = i * 3; const gy = (ground ? ground(tp[j], tp[j + 2]) : 0) + 0.035;
      if (tp[j + 1] > gy || tv[j + 1] > 0) { tv[j + 1] -= 9.8 * dt; tp[j] += tv[j] * dt; tp[j + 1] += tv[j + 1] * dt; tp[j + 2] += tv[j + 2] * dt; tr[j] += tw[j] * dt; tr[j + 1] += tw[j + 1] * dt; tr[j + 2] += tw[j + 2] * dt; }
      if (tp[j + 1] < gy) { tp[j + 1] = gy; tv[j] *= 0.3; tv[j + 2] *= 0.3; tv[j + 1] = 0; tr[j] = 0; tr[j + 2] = 0; tw[j] = tw[j + 1] = tw[j + 2] = 0; }
      _o.position.set(tp[j], tp[j + 1], tp[j + 2]); _o.rotation.set(tr[j], tr[j + 1], tr[j + 2]); _o.scale.setScalar(tl[i] > 0 ? ts[i] * Math.min(1, tl[i] / 0.6) : 0); _o.updateMatrix(); ties.setMatrixAt(i, _o.matrix);
    }
    ties.instanceMatrix.needsUpdate = true;
    dustTick(dt);
    /* the sledge's drop beside him: it tips out of the hand, falls flat (gravity ease-in) and bounces once */
    if (sT >= 0 && maulHolder) {
      sT += dt; const k = Math.min(1, sT / 0.75); const e = k * k;
      maulHolder.position.lerpVectors(sP0, sP1, e); maulHolder.quaternion.slerpQuaternions(sQ0, sQ1, Math.min(1, e * 1.15));
      if (k >= 1) { const b = sT - 0.75; maulHolder.position.y = sP1.y + 0.08 * S * Math.max(0, Math.sin(Math.min(b * 10, Math.PI))) * Math.exp(-b * 3); }
      if (k >= 1 && !sLanded) { sLanded = true; const hp2 = new THREE.Vector3(0, 1.0, 0); maulHolder.children[0]?.localToWorld(hp2); puff(hp2, 8, 0.45 * S, 0.5); H.shake = Math.max(H.shake || 0, 0.25); }
    }
    for (const s of spikes) { s.t += dt; const k = Math.min(1, s.t / 0.12); s.g.position.y = (0.25 - 0.4 * k) * S; }
    /* lands.js rewrites its scatter matrices every frame while the land still grows in: keep the cleared ones cleared */
    if (hidden.length) { let dirty = null; for (const h of hidden) { h.o.getMatrixAt(h.i, _m); if (_m.elements[0] !== 0 || _m.elements[5] !== 0) { h.o.setMatrixAt(h.i, ZERO); (dirty ||= new Set()).add(h.o); } } if (dirty) for (const o of dirty) o.instanceMatrix.needsUpdate = true; }
    /* the fall, over the giant's forward topple (bosses.js wrote the model's pose this frame; this one wins) */
    if (dk >= 0) {
      dk += dt; const t = dk;
      if (t > FALL0 - 0.5) {
        let back = 0; let side = 0;
        if (t < FALL0) back = 0.06 * Math.sin((t - FALL0 + 0.5) / 0.5 * Math.PI); /* a sway forward first: he tries to stay up */
        else {
          const u = Math.min(1, (t - FALL0) / (FALL1 - FALL0)); const e = u * u * (1.6 - 0.6 * u);
          back = -BACK * e; side = SIDE * u * u * u;
          if (u >= 1) { const b = t - FALL1; const bounce = 0.06 * Math.sin(Math.min(b * 9, Math.PI)) * Math.exp(-b * 2.5); back = -BACK + bounce; side = SIDE - bounce * 0.8; }
        }
        if (t >= FALL1 && !impactPuff) { impactPuff = true; actor.root.updateMatrixWorld(true); for (const b of [bone('spine_03'), pelvis, head]) if (b) { b.getWorldPosition(_fa); puff(_fa, 7, 0.7 * S, 0.8); } }
        _rq.setFromAxisAngle(AX, back); _rz.setFromAxisAngle(AZ, side); _rq.multiply(_rz);
        actor.model.quaternion.copy(_rq).multiply(mQ0);
        actor.model.position.copy(mP0).sub(PIV).applyQuaternion(_rq).add(PIV);
        actor.model.position.y -= 0.03 * sst(FALL1 + 0.3, 6, t);
        /* he rests ON the ground. The giant's own ground rest (bosses.js restOnGround) measures the giant's forward
           topple, not this backward fall, and this pose overwrote it: the kneel keeps the hips high, so the turn about the
           knee left the coat floating. Lift when a bone goes under, and after the impact settle down until the lowest
           bone (back, hips, head) touches the dirt. */
        actor.root.updateMatrixWorld(true);
        const gy = scene?.userData?.groundAt ? scene.userData.groundAt(actor.root.position.x, actor.root.position.z) : actor.root.position.y;
        let gap = Infinity; for (const [b, rr] of REST) { b.getWorldPosition(_fa); gap = Math.min(gap, _fa.y - rr - gy); }
        if (Number.isFinite(gap)) { const k = 1 / Math.max(1e-3, actor.root.scale.y); const down = gap > 0 ? gap * sst(FALL1 - 0.15, FALL1 + 0.1, t) : gap; actor.model.position.y -= down * k; }
      }
    }
    if (deathT < 0 || !scene) return;
    deathT += dt;
    if (!hat && head) {
      for (const m of actor.meshes) if (m.userData.part === 'Hat_top') m.visible = false;
      const h = rollingHat(S); hat = h.g; owned.push(...h.mats);
      /* where the worn hat sat: along the head's up axis above the head bone, tilted as the head was */
      head.getWorldPosition(hp); head.getWorldQuaternion(hq); _up.set(0, 1, 0).applyQuaternion(hq);
      hp.addScaledVector(_up, 0.25 * S * HAT_K); hat.position.copy(hp); hat.quaternion.copy(hq); scene.add(hat);
      /* off his head toward the hero and a little out to his left (root-local +x: the sledge's side), so it lands in the
         open dirt in front of his knees and rolls off across the frame; he falls the other way, to his right */
      const yaw = actor.root.rotation.y; const fx = Math.sin(yaw); const fz = Math.cos(yaw);
      vel.set(fx * 0.15 + fz * 0.9, 2.4, fz * 0.15 - fx * 0.9);
      spin = 5 + Math.random() * 2;
    }
    if (!hat) return;
    if (roll < 0) {
      /* the throw: up off his head and down in front of him, tumbling */
      vel.y -= 9.8 * dt; hat.position.addScaledVector(vel, dt);
      qa.setFromAxisAngle(_up.set(fz0(), 0, -fx0()).normalize(), spin * dt); hat.quaternion.premultiply(qa);
      /* it lands on its brim and rolls off slowly, half across the view and half toward the hero, about a metre, so it stays
         in the frame beside him while the death camera pushes in (never off past the lens) */
      if (hat.position.y <= R && vel.y < 0) { hat.position.y = R; const fx = fx0(); const fz = fz0(); vel.set(fz * 0.75 + fx * 0.1, 0, -fx * 0.75 + fz * 0.1); roll = 0; puff(hat.position, 6, 0.5); }
    } else {
      /* on its brim: it rolls in a slow arc out across the dirt, slows, wobbles and settles on its side, still turning a
         little through the hold (ROLL_T), never back toward the body */
      roll += dt; const sp = Math.max(0, 1 - roll / ROLL_T);
      hat.position.x += vel.x * sp * dt; hat.position.z += vel.z * sp * dt;
      vel.applyAxisAngle(UP, rollDir * 0.7 * dt * sp);
      ang += Math.hypot(vel.x, vel.z) * sp * dt / R;
      const lie = sst(ROLL_T - 0.6, ROLL_T, roll);
      qa.setFromAxisAngle(UP, Math.atan2(vel.x, vel.z)); /* heading: it rolls along its velocity */
      qb.setFromAxisAngle(ZA, Math.PI / 2 + 0.3 * lie + 0.1 * Math.sin(roll * 11) * sp); /* rolling on the brim, then it settles on its side, crown end down */
      qc.setFromAxisAngle(UP, ang); /* the roll about the crown axis */
      hat.quaternion.copy(qa).multiply(qb).multiply(qc);
      hat.position.y = R * (1 - 0.25 * lie);
    }
    /* frame the man first and the hat beside him: the view aims between his face and his belt, 15% of the way to the hat
       (set fresh each frame, so it never creeps onto the hat); his face stays in the frame through the push-in */
    if (dk >= FALL0 && head && pelvis) {
      head.getWorldPosition(_fa); pelvis.getWorldPosition(_fb); _fa.lerp(_fb, 0.45); _fa.y = Math.max(_fa.y, 1.6);
      /* the frame holds the man, the hat and the sledge: aim a third of the way to the hat, high enough that the body
         lies under the title */
      H.lookAt.copy(_fa).lerp(hp.copy(hat.position).setY(1.6), 0.32);
    }
  };
  const fx0 = () => Math.sin(actor.root.rotation.y); const fz0 = () => Math.cos(actor.root.rotation.y);
  const restore = () => { const seen = new Set(); for (const h of hidden) { h.o.setMatrixAt(h.i, h.m0); seen.add(h.o); } for (const o of seen) o.instanceMatrix.needsUpdate = true; hidden.length = 0; };
  const dispose = H.dispose;
  H.dispose = () => { dispose?.(); restore(); dustG.removeFromParent(); for (const u of unposes) u(); ties.removeFromParent(); tieGeo.dispose(); ties.dispose(); hat?.removeFromParent(); for (const s of spikes) s.g.removeFromParent(); spikeGeo.dispose(); headGeo.dispose(); for (const m of owned) m.dispose?.(); };
  H.disposers?.push(() => { restore(); dustG.removeFromParent(); cigar?.g.removeFromParent(); hat?.removeFromParent(); for (const s of spikes) s.g.removeFromParent(); });
  return H;
}

/* share, the boss in the picture.
   bossFigure()   the run's boss as a lit figure (the world's own far figure, or the dark one, or the Hollow Dragon), base at
                  y = 0, facing +z, at a height in metres. Its materials take light (the far line draws the same figure as a
                  silhouette).
   shareShot()    the 1600 x 900 share picture from the card's camp: fell = the boss stands lit over the kneeling hero, the
                  weapon on the ground, the fire low, a rim in the world's colour; won = the hero faces the camera in a
                  victory pose, the boss down behind, bright. One synchronous render: every light, the camera and the
                  renderer size come back before the next frame.
   landingStage() the landing's own small scene (its own canvas and renderer, so the title variants under it never matter):
                  the boss alive and lit, eyes on the camera, and the sender as a warm spirit figure, the companion-to-be.
   Dense one-line code uses block comments only. */
import * as THREE from 'three';
import { makeActor, KNIGHT_URL } from './world.js';
import { makeSun, makeSky, paintStage, embers } from './cover.js';
import { RIM_UNIFORMS } from './world.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RM = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
/* metres, boots to the top of the head: large over a kneeling hero, never a speck */
const BOSS_H = { giant: 6.4, lich: 4.6, twin: 4.0, dragon: 4.6 };

/* ---------------- the boss ---------------- */
export async function bossFigure({ worldId = 'dark', nemId = null, mech = 'twin', accent = 0xff5a1e, height = null } = {}) {
  const acc = new THREE.Color(accent); const mats = [];
  /* mats[0] is the glow: the figure's sprites follow its opacity (the far line fades it in; here it stays at 1) */
  const glow = new THREE.MeshBasicMaterial({ color: acc.clone().multiplyScalar(3), fog: false }); mats.push(glow);
  const lift = new THREE.Color(0x2e2b33);
  const sil = (opts = {}) => {
    const c = new THREE.Color(opts.color ?? 0x17161a).lerp(lift, 0.4);
    const m = new THREE.MeshStandardMaterial({ ...opts, color: c, roughness: 0.5, metalness: 0.4, envMapIntensity: 0.25, transparent: false, opacity: 1 });
    mats.push(m); return m;
  };
  const ctx = { THREE, accent: acc, sil, glow, mats, dir: V3(0, 0, -1), dist: 215 };
  let r = null;
  try {
    if (worldId && worldId !== 'dark') { const { loadWorld } = await import('./worlds/index.js'); const mod = await loadWorld(worldId); if (typeof mod?.skyNemesis === 'function') r = await mod.skyNemesis(nemId || mech, ctx); }
    if (!r && (mech === 'giant' || mech === 'lich' || mech === 'twin')) r = await (await import('./bosses.js')).skyNemesis(mech, ctx);
  } catch (err) { console.warn('share boss figure', err); r = null; }
  const root = new THREE.Group(); root.name = 'share-boss';
  let update = null; let actor = null; let dragon = null; let dispose = () => {};
  if (r) {
    const obj = r.isObject3D ? r : r.object;
    if (obj?.isObject3D) { root.add(obj); update = typeof r.update === 'function' ? r.update.bind(r) : null; actor = r.actor || null; dispose = () => { try { r.dispose?.(); } catch { /* gone */ } }; }
  }
  if (!root.children.length && mech === 'dragon') {
    try {
      const { DragonBoss } = await import('./dragon.js');
      const hold = new THREE.Group();
      dragon = new DragonBoss({ scene: hold, camera: null, accent: acc.getHex(), sfx: () => {}, player: { pos: V3(0, 0, 30), forward: () => V3(0, 0, -1), eye: 2 } });
      await dragon.load();
      for (const l of [dragon.fireLight, dragon.throatLight]) l?.removeFromParent();
      for (const o of [dragon.flames?.mesh, dragon.smoke?.mesh, dragon.ring, dragon.line]) if (o) o.visible = false;
      dragon.group.visible = true; dragon.state = 'air'; dragon.air = { phase: 'glide' }; dragon.landing = null; dragon.J.set(0, 0, 0); dragon.resetPose();
      root.add(hold);
      update = (dt, t) => { dragon.yaw = 0; dragon.clock += dt; const g = dragon.tgt; g.pitch = -0.08; g.roll = 0; const beat = Math.max(0, Math.sin(t * 0.9)); dragon.flightPose(g, 0.35 + 0.6 * beat * beat, 0.9); g.throat = 0.6; g.eyes = 1; dragon.animate(Math.min(dt, 1 / 20)); };
      update(0.016, 0.4);
      dispose = () => { try { dragon.dispose(); } catch { /* gone */ } };
    } catch (err) { console.warn('share dragon', err); dragon = null; }
  }
  if (!root.children.length) {
    /* the plain knight in the boss's look (world.js setNemesis SPEC), lit */
    const a = await makeActor(KNIGHT_URL); a.noBlob = true;
    a.look({ steel: 0x6a6f7a, helm: mech === 'lich' ? 'hood' : mech === 'giant' ? 'sallet' : 'great', horns: mech === 'giant', crown: mech === 'twin', cloak: mech !== 'lich', robe: mech === 'lich', eye: acc.getHex(), eyePower: 6 });
    a.play(mech === 'lich' ? 'Spell_Simple_Idle_Loop' : 'Sword_Idle', { speed: 0.6, fade: 0 });
    root.add(a.root); actor = a; update = (dt) => a.mixer.update(dt); dispose = () => a.dispose();
  }
  /* eyes on the camera: a figure with no eyes of its own (the twin, a world's man) gets two hot points under the brow */
  let eyes = null;
  if (actor && mech !== 'giant' && mech !== 'lich') {
    const head = actor.model?.getObjectByName?.('Head');
    if (head) {
      const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
      const em = new THREE.SpriteMaterial({ map: tex, color: acc.clone().lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false });
      eyes = [-1, 1].map((sx) => { const sp = new THREE.Sprite(em); sp.userData.sx = sx; head.add(sp); return sp; });
      /* head bone space: up is +y, the face looks along +z (knight rig); sizes in the bone's own units */
      for (const sp of eyes) { sp.position.set(sp.userData.sx * 0.045, 0.085, 0.13); sp.scale.setScalar(0.07); sp.renderOrder = 6; }
    }
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  /* to the asked height, base on the ground, centred */
  /* in a scaled holder first: a world figure treats a scaled parent as posed (no land offset, no side step), as it will be */
  const inner = new THREE.Group(); while (root.children.length) inner.add(root.children[0]); root.add(inner); inner.scale.setScalar(1.001);
  update?.(0.016, 0.5);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner); const size = box.getSize(V3());
  const want = height ?? (BOSS_H[mech] || 0) ?? 0;
  const k = (want > 0 ? want / Math.max(0.01, size.y) : 1) * 1.001;
  inner.scale.setScalar(k); const c = box.getCenter(V3()).divideScalar(1.001);
  inner.position.set(-c.x * k, -box.min.y / 1.001 * k, -c.z * k);
  update?.(0.016, 0.6);
  /* the figure's own dispose (actor, dragon, sky foe) leaves its textures and geometry on the GPU: free every
     geometry, material, texture and skeleton (its bone texture) under the root (before the figure's own dispose takes its parts out). A texture shared with a cache is uploaded again by three.js on its next use. */
  const free = dispose; let freed = false;
  dispose = () => { if (freed) return; freed = true;
    const seen = new Set(); const drop = (x) => { if (x && !seen.has(x)) { seen.add(x); try { x.dispose(); } catch { /* gone */ } } };
    root.traverse((o) => { if (o.isLight) { drop(o.shadow?.map); drop(o); } if (o.isSkinnedMesh) drop(o.skeleton); drop(o.geometry); for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v?.isTexture) drop(v); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) drop(u.value); drop(m); } });
    for (const m of mats) drop(m); try { free(); } catch { /* gone */ } root.removeFromParent(); };
  return { object: root, inner, mats, glow, eyes, update, actor, dragon, dispose, height: size.y * k, mech };
}

/* the hero lies where the boss struck: the forged weapon leaves the hand and lies on the ground (put back after) */
function dropWeapon(hero, at, yaw) {
  const hand = hero.slot?.('handslotr'); const g = hand && hand.children.find((c) => c.userData.forged); const parent = hero.root.parent;
  if (!g || !parent) return null;
  const saved = { g, hand, p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() };
  /* the weapon's long axis (in its own frame) lies flat along the ground, turned by yaw */
  g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(); const lb = new THREE.Box3(); const m = new THREE.Matrix4();
  g.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); lb.union(o.geometry.boundingBox.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); } });
  const sz = lb.isEmpty() ? V3(0, 1, 0) : lb.getSize(V3()); const ax = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z';
  const long = V3(); long[ax] = 1;
  parent.attach(g);
  const ws = g.getWorldScale(V3()); const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const want = V3(Math.sin(yaw), 0, Math.cos(yaw));
  const q = new THREE.Quaternion().setFromUnitVectors(long, want);
  /* a quarter turn about the long axis so the blade lies on its flat side */
  q.multiply(new THREE.Quaternion().setFromAxisAngle(long, Math.PI / 2));
  g.quaternion.copy(pq.multiply(q)); g.scale.copy(saved.s); void ws;
  g.position.copy(at); g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g); g.position.y += 0.02 - box.min.y;
  return saved;
}
function putBack(saved) { if (!saved) return; const { g, hand, p, q, s } = saved; hand.add(g); g.position.copy(p); g.quaternion.copy(q); g.scale.copy(s); }

/* ---------------- the share picture ---------------- */
/* opts: { world, camp, hero, fig (bossFigure), won, accent, W, H, clip (victory clip name) } -> canvas W x H */
/* the knobs (window.__shareTune overrides them from the console for tuning the look) */
const TUNE = {
  fell: { side: 1.05, dist: 3.3, camY: 0.38, fov: 50, back: 2.4, backK: 0.22, off: 0.08, lookK: 0.45, lookY: 3.0, dropF: 1.2, dropR: 0.9, low: 0.32, clip: 'Hit_Knockback', at: 0.72, turn: 2.0, fireK: 0.55, rim: 22, key: 0.6, fire: 30, exp: 1.05 },
  won: { side: -0.25, dist: 4.8, camY: 1.15, fov: 38, back: 2.0, backK: 0.2, off: 0.8, lookY: 1.25, clip: 'OverhandThrow', at: 0.25, turn: 0.6, rim: 3.5, key: 4.2, exp: 1.1, heroKey: 3, hemi: 4.2 },
};
export function shareShot({ world, camp, hero, fig, won, accent = 0xff5a1e, W = 1600, H = 900, aside = 0.2, lift = 0, sun = null }) {
  const R = world.renderer; const cam = world.camera; const scene = world.scene;
  const T = { ...(won ? TUNE.won : TUNE.fell), ...((typeof window !== 'undefined' && window.__shareTune?.[won ? 'won' : 'fell']) || {}) };
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const undo = [];
  const set = (o, k, v) => { if (!o) return; const old = o[k]; undo.push(() => { o[k] = old; }); o[k] = v; };
  const setCol = (c, v) => { if (!c) return; const old = c.clone(); undo.push(() => c.copy(old)); c.set(v); };
  const setVec = (vec, v) => { if (!vec) return; const old = vec.clone(); undo.push(() => vec.copy(old)); vec.copy(v); };
  try {
    const hp = hero.root.position.clone(); const yaw = hero.root.rotation.y;
    const fwd = V3(Math.sin(yaw), 0, Math.cos(yaw));
    /* the camera: in front of the hero and to the side (a three-quarter view shows the face), low on a fall, chest high on a win */
    const side = T.side; const dir = fwd.clone().applyAxisAngle(V3(0, 1, 0), side);
    const dist = T.dist; const camY = T.camY;
    const cp = hp.clone().addScaledVector(dir, dist).setY(camY);
    /* the boss: behind the hero on the line from the camera, a little off to one side so the hero never hides it */
    const back = hp.clone().sub(cp).setY(0).normalize(); const right = V3(back.z, 0, -back.x);
    const bh = fig?.height || 4;
    if (fig) {
      const o = fig.object; set(o, 'visible', true);
      if (won) {
        /* down: on its back behind the hero, across the frame */
        const bp = hp.clone().addScaledVector(back, T.back + bh * T.backK).addScaledVector(right, T.off);
        setVec(o.position, bp); o.rotation.order = 'YXZ'; setVec(o.rotation, new THREE.Euler(-Math.PI / 2 + 0.06, Math.atan2(right.x, right.z), 0, 'YXZ'));
        set(fig.glow, 'visible', false); for (const e of fig.eyes || []) set(e, 'visible', false);
      } else {
        const bp = hp.clone().addScaledVector(back, T.back + bh * T.backK + (fig.dragon ? 3.5 : 0)).addScaledVector(right, bh * T.off);
        if (fig.dragon) bp.y += 1.2;
        setVec(o.position, bp); setVec(o.rotation, new THREE.Euler(0, Math.atan2(cp.x - bp.x, cp.z - bp.z), 0));
      }
      o.updateMatrixWorld(true);
      if (!won && fig.update) { try { fig.update(0, 1.0); } catch { /* still */ } }
    }
    /* what stays out of this picture: the far nemesis, the named spirits, their labels, the stone */
    if (world.nemesis?.holder) set(world.nemesis.holder, 'visible', false);
    for (const c of camp?.companions || []) { for (const x of [c.fig?.object3D, c.holder, c.actor?.root, c.pts]) if (x?.isObject3D) set(x, 'visible', false); }
    for (const L of camp?.labels || []) if (L.s) set(L.s, 'visible', false);
    if (camp?.stone) set(camp.stone, 'visible', false);
    if (camp?.dress?.signH) set(camp.dress.signH, 'visible', false);
    if (camp?.nemGlow) set(camp.nemGlow, 'visible', false);
    /* the hero's weapon on the ground beside the knee (fell) */
    let dropped = null;
    if (!won && !T.noDrop) { const at = hp.clone().addScaledVector(dir, T.dropF).addScaledVector(right, T.dropR); dropped = dropWeapon(hero, at, Math.atan2(right.x, right.z) + 0.9); }
    undo.push(() => putBack(dropped));
    /* the pose for this picture only (every bone comes back after): a win = a victory pose, a fall = the fall's pose */
    if (T.turn != null) set(hero.root.rotation, 'y', Math.atan2(cp.x - hp.x, cp.z - hp.z) + T.turn);
    if (T.clip && hero.has?.(T.clip)) {
      const bones = []; hero.model.traverse((b) => { if (b.isBone || b.isObject3D) bones.push([b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]); });
      const cur = hero.current;
      undo.push(() => { if (cur && hero.has(cur)) hero.play(cur, { fade: 0 }); for (const [b, p, q, s] of bones) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(s); } });
      hero.play(T.clip, { fade: 0, loop: false, restart: true }); hero.mixer.update(T.at);
      /* on the ground: a lying pose keeps its hips at standing height in some clips */
      if (!won) { hero.root.updateMatrixWorld(true); const hb = new THREE.Box3(); hero.root.traverse((o) => { if (o.isSkinnedMesh && o.visible) { o.computeBoundingBox?.(); if (o.boundingBox) hb.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
        if (!hb.isEmpty() && hb.min.y > hp.y + 0.05) set(hero.root.position, 'y', hero.root.position.y - (hb.min.y - hp.y - 0.04)); hero.root.updateMatrixWorld(true); }
    }
    /* light: the world's colour as a hard rim from behind the boss and the hero; a cool or warm key on the faces */
    const acc = new THREE.Color(accent);
    if (world.rim) { setVec(world.rim.position, hp.clone().addScaledVector(back, 14).setY(won ? 9 : 6)); setVec(world.rim.target.position, hp.clone().setY(1)); setCol(world.rim.color, acc); set(world.rim, 'intensity', T.rim); world.rim.target.updateMatrixWorld(); }
    if (world.sun) { setVec(world.sun.position, cp.clone().add(V3(0, won ? 30 : 8, 0)).addScaledVector(right, -12)); setVec(world.sun.target.position, hp.clone().setY(1)); set(world.sun, 'intensity', T.key); setCol(world.sun.color, won ? 0xffe6c4 : 0xbfcaff); world.sun.target.updateMatrixWorld(); }
    if (world.hemi) set(world.hemi, 'intensity', (world.hemi.intensity || 0.4) * (won ? T.hemi : 0.8));
    if (camp?.heroKey) { setVec(camp.heroKey.position, hp.clone().addScaledVector(dir, 1.4).setY(won ? 2.0 : 1.3)); set(camp.heroKey, 'intensity', won ? T.heroKey : 7); setCol(camp.heroKey.color, won ? 0xffe2c0 : 0xffc89a); set(camp.heroKey, 'distance', 6); }
    /* the second rim: behind the hero on a win; behind the boss on a fall (between them it lit the boss's front flat) */
    if (camp?.heroRim) { const bpos = fig?.object.position || hp; const rp = won ? hp.clone().addScaledVector(back, 1.2).setY(2.2) : bpos.clone().addScaledVector(back, 1.4).setY(bh * 0.75); setVec(camp.heroRim.position, rp); set(camp.heroRim, 'intensity', won ? 18 : 60); setCol(camp.heroRim.color, acc); set(camp.heroRim, 'distance', won ? 6 : 9); }
    /* fell: the fire's light comes low from the side, as embers would (the fire itself burns low) */
    if (camp?.light) { set(camp.light, 'intensity', won ? 30 : T.fire); if (!won) { const fp = T.fireK != null && fig ? hp.clone().lerp(fig.object.position, T.fireK).addScaledVector(dir, 0.8).setY(0.45) : hp.clone().addScaledVector(right, 1.6).addScaledVector(dir, 0.6).setY(0.35); setVec(camp.light.position, fp); camp.light.updateMatrixWorld?.(); } }
    if (camp?.flameU?.uPower) set(camp.flameU.uPower, 'value', won ? camp.flameU.uPower.value : 0.4);
    if (!won && camp?.smokeU?.uOpacity) set(camp.smokeU.uOpacity, 'value', 0.06);
    if (fig && !won && fig.glow) { setCol(fig.glow.color, acc.clone().multiplyScalar(4)); }
    set(R, 'toneMappingExposure', R.toneMappingExposure * T.exp);
    /* the depth fog would wash the far banded sun out; this picture is graded instead */
    /* (the fog is fused into the bloom pass on most tiers: its sky term goes to zero, the ground keeps its haze) */
    if (sun && world.fogPass?.uniforms?.uSky) set(world.fogPass.uniforms.uSky, 'value', 0);
    /* the camera: looks between the hero and the boss's head on a fall (up at it), at the hero's chest on a win */
    let look = won ? hp.clone().setY(T.lookY) : hp.clone().lerp(fig ? fig.object.position : hp, T.lookK).setY(Math.min(bh * 0.55, T.lookY));
    /* a fall: the hero on the ground low in the frame and the boss's head under the top edge (the camera backs off for a tall boss) */
    if (!won && fig) {
      const vf = (T.fov * Math.PI) / 180; const bp = fig.object.position; const top = V3(bp.x, bh * 1.04, bp.z); const low = hp.clone().setY(0.1);
      const el = (p) => Math.atan2(p.y - cp.y, Math.hypot(p.x - cp.x, p.z - cp.z));
      for (let i = 0; i < 14 && el(top) - el(low) > vf * 0.86; i++) { cp.addScaledVector(dir, 0.5); cp.y = camY + i * 0.06; }
      const pitch = el(low) + vf * (T.low ?? 0.4); const flat = Math.hypot(look.x - cp.x, look.z - cp.z) || 1; look = look.clone().setY(cp.y + Math.tan(pitch) * flat);
    }
    setVec(cam.position, cp); const q0 = cam.quaternion.clone(); undo.push(() => cam.quaternion.copy(q0));
    cam.lookAt(look);
    set(cam, 'fov', T.fov); set(cam, 'aspect', W / H);
    /* the subject sits right of centre: the words take the left */
    const view0 = cam.view ? { ...cam.view } : null; undo.push(() => { if (view0?.enabled) cam.setViewOffset(view0.fullWidth, view0.fullHeight, view0.offsetX, view0.offsetY, view0.width, view0.height); else cam.clearViewOffset(); });
    cam.setViewOffset(W, H, -W * aside, H * lift, W, H);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    /* render at the picture's size */
    const pr = R.getPixelRatio(); const sz = R.getSize(new THREE.Vector2());
    undo.push(() => { R.setPixelRatio(pr); world.composer?.setPixelRatio?.(pr); R.setSize(sz.x, sz.y, false); world.composer?.setSize(sz.x, sz.y); });
    R.setPixelRatio(1); world.composer?.setPixelRatio?.(1); R.setSize(W, H, false); world.composer?.setSize(W, H);
    /* nothing stands between the lens and the subject: any prop within 1.6 m of the camera leaves this picture */
    const keepOut = new Set(); hero.root.traverse((o) => keepOut.add(o)); if (fig) fig.object.traverse((o) => keepOut.add(o));
    const _s = new THREE.Sphere();
    /* small scatter (grass, reeds) drawn as one instanced field stands between a low lens and the hero: it leaves too */
    scene.traverse((o) => { if (!o.isInstancedMesh || !o.visible || keepOut.has(o) || !o.geometry) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const sc = o.matrixWorld.getMaxScaleOnAxis(); if (o.geometry.boundingSphere.radius * sc < 1.2) set(o, 'visible', false); });
    scene.traverse((o) => { if (!o.isMesh || o.isInstancedMesh || !o.visible || keepOut.has(o) || !o.geometry) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (_s.radius > 25) return; if (_s.center.distanceTo(cp) - _s.radius < 1.6) set(o, 'visible', false); });
    /* a fall: camp props where the hero lies (a pole, a stake) would pierce the body; they leave this picture */
    if (!won) { if (dropped?.g) dropped.g.traverse((o) => keepOut.add(o)); const flat = V3();
      scene.traverse((o) => { if (!o.isMesh || o.isInstancedMesh || !o.visible || keepOut.has(o) || !o.geometry) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (_s.radius > 1.6) return; flat.copy(_s.center).sub(hp).setY(0); if (flat.length() - _s.radius < 1.1) set(o, 'visible', false); }); }
    /* the title's banded sun behind the boss (a fall) or over the hero's shoulder (a win); the card's own sun hides */
    scene.traverse((o) => { if (o.name === 'cover-sun' && o.visible && o !== sun?.mesh) set(o, 'visible', false); });
    if (sun) {
      /* the title's sky behind everything, the world's fog warmed to its horizon, a teal rim beside the orange */
      const sky = makeSky(scene.fog?.color?.getHex?.() ?? 0x000000); sky.mesh.position.copy(cam.position); scene.add(sky.mesh); undo.push(() => sky.dispose());
      if (scene.fog?.color) setCol(scene.fog.color, sky.hor.clone().multiplyScalar(0.55));
      if (scene.background?.isColor) setCol(scene.background, sky.hor);
      if (camp?.heroRim) { setCol(camp.heroRim.color, 0x2ee8ff); }
      scene.add(sun.mesh); undo.push(() => sun.dispose());
      /* a setting sun: on the horizon behind the boss's body (fall) or beside the hero's raised arm (win) */
      const tgt = won ? hp.clone().addScaledVector(right, -0.2) : (fig ? fig.object.position.clone() : hp.clone());
      const dir = tgt.sub(cam.position).setY(0).normalize(); dir.y = won ? Math.tan(0.2) : Math.tan(0.14);
      sun.place(cam, dir, won ? 0.55 : 0.62, 500);
    }
    const draw = () => { if (world.composer) world.composer.render(); else R.render(scene, cam); };
    /* the first frame tells the boss's head where the lens is; it turns to it, then the picture is taken */
    if (fig?.update && !won) { draw(); for (let i = 0; i < 6; i++) { try { fig.update(0.5, 1.5 + i * 0.5); } catch { break; } } }
    draw();
    out.getContext('2d').drawImage(R.domElement, 0, 0, W, H);
  } finally {
    for (let i = undo.length - 1; i >= 0; i--) { try { undo[i](); } catch (err) { console.warn('share shot undo', err); } }
    if (fig) fig.object.visible = false;
    cam.updateProjectionMatrix(); world.resize?.();
  }
  return out;
}

/* ---------------- the title's stage for the share pictures and the card ---------------- */
/* The hero and the boss leave the camp for one render: a painted title sky with the banded sun and a neon floor behind them,
   the title's lights on them. A fall: the boss a black shape inside the sun, eyes lit, the hero down in front. A win:
   the hero up with the weapon raised in front of the sun, the boss down as a black shape low on it.
   opts: { world, hero, fig, won, tint (the world's colour), W, H, aside (subject to the right), top/bottom (free margins, 0..1) } */
const STAGE = {
  fell: { cam: [1.6, 2.2, 6.6], fov: 34, boss: [-4, 0, -7], bossK: 1.5, dragonZ: -8, dragonK: 0.55, turn: 2.0, clip: 'Hit_Knockback', at: 0.72, key: 1.4, exp: 1.05, eyes: 2.2 },
  won: { cam: [-0.7, 0.42, 5.2], fov: 34, boss: [8, 0, -18], kneelK: 1.1, kneelDrop: 0.8, dragonAt: [15, -42], giantDrop: 1.6, turn: -0.3, clip: 'Cheer', at: 0.3, rimK: 10, key: 3.4, exp: 1.08 },
};
export function titleShot({ world, hero, fig, won, tint = 0xff5a2a, W = 1600, H = 900, aside = 0.2, top = 0.08, bottom = 0.06, paint }) {
  const R = world.renderer; const T = { ...(won ? STAGE.won : STAGE.fell), ...((typeof window !== 'undefined' && window.__stageTune?.[won ? 'won' : 'fell']) || {}) };
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const undo = []; const stage = new THREE.Scene(); stage.environment = world.scene.environment || null;
  const move = (o) => { const p = o.parent; const s = { p: o.position.clone(), r: o.rotation.clone(), v: o.visible }; undo.push(() => { o.position.copy(s.p); o.rotation.copy(s.r); o.visible = s.v; if (p) p.add(o); else o.removeFromParent(); }); stage.add(o); o.visible = true; };
  const bgCv = document.createElement('canvas'); bgCv.width = W; bgCv.height = H; const bg = new THREE.CanvasTexture(bgCv); bg.colorSpace = THREE.SRGBColorSpace;
  try {
    /* the hero at the stage's centre, turned to the lens; the pose for this picture only (every bone comes back after) */
    move(hero.root); hero.root.position.set(0, 0, 0);
    const cp = V3(...T.cam); hero.root.rotation.set(0, Math.atan2(cp.x, cp.z) + T.turn, 0);
    if (T.clip && hero.has?.(T.clip)) {
      const bones = []; hero.model.traverse((b) => bones.push([b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]));
      const cur = hero.current;
      undo.push(() => { if (cur && hero.has(cur)) hero.play(cur, { fade: 0 }); for (const [b, p, q, s] of bones) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(s); } });
      hero.play(T.clip, { fade: 0, loop: false, restart: true }); hero.mixer.update(T.at);
    }
    hero.root.updateMatrixWorld(true);
    const hb = new THREE.Box3(); hero.root.traverse((o) => { if (o.isSkinnedMesh && o.visible) { o.computeBoundingBox?.(); if (o.boundingBox) hb.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    if (!hb.isEmpty() && Math.abs(hb.min.y) > 0.03) { hero.root.position.y -= hb.min.y - 0.02; hero.root.updateMatrixWorld(true); hb.translate(V3(0, -(hb.min.y - 0.02), 0)); }
    let dropped = null;
    if (!won) { dropped = dropWeapon(hero, V3(0.95, 0, 0.75), 1.1); undo.push(() => putBack(dropped)); }
    /* the boss: far behind (a fall: standing, facing the lens; a win: down on its back across the frame) */
    const bh = fig?.height || 4.5; const bp = V3(...T.boss); if (fig?.dragon && !won) bp.set(T.dragonX ?? 0, 0, T.dragonZ ?? bp.z);
    /* a win shows the boss down only when it has a body to lie down (a rigged figure); a tower, a paper giant or a dragon lying flat read as a black slab */
    /* a cloud giant has a body (its solid parts, the halo off): it slumps forward, small, at the horizon; a tower stays out */
    const showBoss = fig && (!won || fig.actor || fig.dragon || fig.mech === 'giant');
    if (showBoss) {
      const o = fig.object; move(o); o.position.copy(bp);
      /* a fell: a small foe (a man-sized lord) is grown so every boss stands about as tall in the sun */
      if (!won && !fig.dragon) { const s2 = o.scale.clone(); undo.push(() => o.scale.copy(s2)); o.scale.multiplyScalar(Math.min(1.8, Math.max(1, 4.2 / bh)) * (T.bossK ?? 1)); }
      if (fig.dragon && !won && T.dragonK) { const s1 = o.scale.clone(); undo.push(() => o.scale.copy(s1)); o.scale.multiplyScalar(T.dragonK); }
      if (won && fig.dragon) { o.position.set(T.dragonAt?.[0] ?? 9, -0.4, T.dragonAt?.[1] ?? -26); o.rotation.set(0, -1.2, 0.5); const s3 = o.scale.clone(); undo.push(() => o.scale.copy(s3)); o.scale.multiplyScalar(T.dragonWonK ?? 0.75); }
      else if (won) {
        /* beaten: down on one knee (the landing's kneel), far back and low on the sun, turned three-quarter to the lens; a figure with no kneel lies down */
        const s0 = o.scale.clone(); undo.push(() => o.scale.copy(s0));
        const kneel = fig.actor?.has?.('Fixing_Kneeling');
        if (kneel) { const a = fig.actor; const cur = a.current; const bones = []; a.model.traverse((b) => bones.push([b, b.quaternion.clone(), b.position.clone()]));
          undo.push(() => { for (const [b, q, p] of bones) { b.quaternion.copy(q); b.position.copy(p); } if (cur && a.has(cur)) a.play(cur, { fade: 0 }); });
          a.play('Fixing_Kneeling', { fade: 0, speed: 0.5, restart: true }); a.mixer.update(1.2);
          o.rotation.set(0, Math.atan2(cp.x - bp.x, cp.z - bp.z) - 0.5, 0); o.scale.multiplyScalar(T.kneelK ?? 1.4);
          o.updateMatrixWorld(true); const kb = new THREE.Box3().setFromObject(o, true); if (!kb.isEmpty()) o.position.y -= kb.min.y + (T.kneelDrop ?? 0); }
        else if (fig.mech === 'giant') { o.rotation.order = 'YXZ'; o.rotation.set(0.55, Math.atan2(cp.x - bp.x, cp.z - bp.z) - 0.4, 0.12); o.scale.multiplyScalar(T.giantK ?? 0.8);
          o.updateMatrixWorld(true); const gb = new THREE.Box3().setFromObject(o, true); if (!gb.isEmpty()) o.position.y -= gb.min.y + (T.giantDrop ?? 0.6); }
        else { o.rotation.order = 'YXZ'; o.rotation.set(-Math.PI / 2 + 0.06, -Math.PI / 2 + 0.25, 0); o.scale.multiplyScalar(T.downK ?? 2.4); }
      }
      else { if (fig.dragon) { o.position.y += 1.2; o.position.z = T.dragonZ ?? o.position.z; o.position.x = 0; } o.rotation.set(0, Math.atan2(cp.x - bp.x, cp.z - bp.z), 0); }
      /* a clean black shape: every surface goes to one unlit near-black; the eyes (glow, sprites) stay lit on a fall */
      let glowUsed = false; let ownEyes = false;
      const SIL = new THREE.MeshBasicMaterial({ color: 0x0a0210, fog: false }); const sils = new Map(); undo.push(() => { SIL.dispose(); for (const m of sils.values()) m.dispose(); });
      /* a cut-out figure (paper planes with an alpha map or a transparent map) keeps its outline: the black takes its alpha */
      /* a soft cloud body (a shader with lit and shade colours) goes black in its own shape; a figure's own bright eyes (unlit, past white) and additive glows stay */
      const keepLit = (x) => !!x && ((x.isMeshBasicMaterial && x.toneMapped === false && !x.transparent) || x.blending === THREE.AdditiveBlending);
      const silOf = (x) => { if (keepLit(x)) { ownEyes = true; return x; }
        if (x?.isShaderMaterial && x.uniforms?.uLit && x.uniforms?.uShade) { if (!sils.has(x)) { const m = x.clone(); m.uniforms.uLit.value = new THREE.Color(0x0a0210); m.uniforms.uShade.value = new THREE.Color(0x0a0210); if (m.uniforms.uA) m.uniforms.uA.value = Math.max(0.95, x.uniforms.uA?.value ?? 1); sils.set(x, m); } return sils.get(x); }
        if (x?.isShaderMaterial) return x;
        if (!x || !(x.alphaMap || (x.map && (x.transparent || x.alphaTest > 0)))) return SIL; if (!sils.has(x)) { const m = new THREE.MeshBasicMaterial({ color: 0x0a0210, fog: false, alphaMap: x.alphaMap || null, map: x.alphaMap ? null : x.map, alphaTest: Math.max(0.35, x.alphaTest || 0), side: x.side, transparent: false }); sils.set(x, m); } return sils.get(x); };
      /* a cloud figure's soft halo (big transparent shells) reads as a smudge in black: the solid body alone makes the silhouette */
      o.updateMatrixWorld(true); o.traverse((m) => { if (!(m.isMesh || m.isSprite || m.isPoints)) return; const mt = m.material;
        /* a figure's own effect shaders (wind, flash; shown on a timer) are lit, not black: kept off this camera's layer */
        if (mt?.isShaderMaterial && !mt.uniforms?.uLit) { const l0 = m.layers.mask; m.layers.set(31); undo.push(() => { m.layers.mask = l0; }); return; }
        if (!m.visible) return; const shell = mt?.isShaderMaterial && mt.uniforms?.uLit && mt.uniforms?.uRise;
        /* a big additive glow (a storm flash, an aura) is not an eye: it washes the silhouette out */
        const flash = !shell && mt?.blending === THREE.AdditiveBlending && (() => { const bb = new THREE.Box3().setFromObject(m); return !bb.isEmpty() && bb.max.y - bb.min.y > bh * 0.12; })();
        if (shell || flash) { m.visible = false; undo.push(() => { m.visible = true; }); } });
      o.traverse((m) => { if (!m.isMesh) return; const old = m.material; const isGlow = (x) => { const y = x === fig.glow; if (y && m.visible) glowUsed = true; return y; };
        const nu = Array.isArray(old) ? old.map((x) => (isGlow(x) ? x : silOf(x))) : isGlow(old) ? old : silOf(old);
        if (nu !== old) { m.material = nu; undo.push(() => { m.material = old; }); } });
      if (won) { const gv = fig.glow.visible; fig.glow.visible = false; undo.push(() => { fig.glow.visible = gv; }); for (const e of fig.eyes || []) { e.visible = false; undo.push(() => { e.visible = true; }); } }
      else { for (const e of fig.eyes || []) { const k0 = e.scale.x; const c0 = e.material.color.clone(); e.scale.setScalar(k0 * (T.eyes || 1)); const dt0 = e.material.depthTest; e.material.depthTest = false; e.renderOrder = 20; undo.push(() => { e.material.depthTest = dt0; }); e.material.color.copy(new THREE.Color(tint).lerp(new THREE.Color(0xff3020), 0.5).multiplyScalar(1.6)); undo.push(() => { e.scale.setScalar(k0); e.material.color.copy(c0); }); } }
      if (!won && fig.glow) { const c0 = fig.glow.color.clone(); fig.glow.color.copy(new THREE.Color(tint).lerp(new THREE.Color(0xffd080), 0.35).multiplyScalar(4)); undo.push(() => fig.glow.color.copy(c0)); }
      o.updateMatrixWorld(true);
      /* a figure with no eyes of its own gets two hot points under the top of its shape, toward the lens */
      if (!won && !fig.dragon && !ownEyes && !(fig.eyes?.length)) { void glowUsed;
        const fb = new THREE.Box3().setFromObject(o); const h = fb.max.y - fb.min.y; const c = fb.getCenter(V3());
        const tex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(cv); })();
        const em = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(tint).lerp(new THREE.Color(0xff3020), 0.5).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
        const to = cp.clone().sub(c).setY(0).normalize(); const side = V3(to.z, 0, -to.x);
        for (const sx of [-1, 1]) { const sp = new THREE.Sprite(em); sp.position.copy(c).setY(fb.max.y - h * 0.13).addScaledVector(to, (fb.max.z - fb.min.z) * 0.3).addScaledVector(side, sx * h * 0.035); sp.scale.setScalar(h * 0.05); sp.renderOrder = 9; stage.add(sp); }
        undo.push(() => { tex.dispose(); em.dispose(); });
      }
    }
    /* the title's light: the sun's orange rim from behind, a teal rim from the left, a warm key on the face, a blue fill */
    const L = [];
    L.push(new THREE.HemisphereLight(0xff6a50, 0x200830, 0.9));
    const rimO = new THREE.DirectionalLight(0xff5a2a, 34); rimO.position.set(3, 4, -10); L.push(rimO);
    const rimT = new THREE.DirectionalLight(0x2ee8ff, 6); rimT.position.set(-8, 5, -6); L.push(rimT);
    const key = new THREE.DirectionalLight(0xffb878, T.key * 1.3); key.position.set(cp.x * 1.5 - 2, 5, cp.z + 2); L.push(key);
    const fill = new THREE.DirectionalLight(0x4a7cff, 1.6); fill.position.set(6, 2, 6); L.push(fill);
    const warm = new THREE.PointLight(0xff8a3a, won ? 10 : 16, 6, 2); warm.position.set(0.8, won ? 1.6 : 0.6, 1.6); L.push(warm);
    for (const l of L) { stage.add(l); if (l.target) { l.target.position.set(0, 1, 0); stage.add(l.target); } }
    /* the lens: fit the low point (the hero's feet or body) and the high one (the boss's head on a fall, the hero's hands on a win) */
    const cam = new THREE.PerspectiveCamera(T.fov, W / H, 0.1, 3000);
    const lowP = won ? V3(0, 0, 0) : V3(0, 0.02, 0.2);
    const hiP = won ? V3(0, Math.max(hb.isEmpty() ? 2.2 : hb.max.y, 2.0), 0) : V3(bp.x, (fig?.dragon ? 1.2 : 0) + bh * 1.02, bp.z);
    const tgtX = won ? 0 : bp.x * 0.35;
    const vf = (T.fov * Math.PI) / 180; const th = Math.tan(vf / 2);
    const el = (p, c) => Math.atan2(p.y - c.y, Math.hypot(p.x - c.x, p.z - c.z));
    const frac = (e, pitch) => 0.5 + Math.tan(e - pitch) / (2 * th);
    const away = cp.clone().sub(V3(tgtX, 0, won ? 0 : bp.z * 0.3)).setY(0).normalize();
    let pitch = 0;
    /* every corner of the boss's box (and the hero's) stays inside the picture: under the top margin, right of the words */
    const boxes = []; if (!hb.isEmpty()) boxes.push(hb.clone()); if (showBoss && !won) boxes.push(new THREE.Box3().setFromObject(fig.object));
    const corners = []; boxes.forEach((bx, bi) => { for (let c = 0; c < 8; c++) { const v = V3(c & 1 ? bx.max.x : bx.min.x, c & 2 ? bx.max.y : bx.min.y, c & 4 ? bx.max.z : bx.min.z); v.userData = bi > 0 ? 'boss' : 'hero'; corners.push(v); } });
    const xMin = aside > 0 ? W * (won ? 0.42 : 0.56) : W * 0.03; const xMax = W * (won && aside > 0 ? (T.wonXMax ?? 0.9) : 0.985); const _v = V3();
    const aim = () => { cam.position.copy(cp); const flat = V3(tgtX - cp.x, 0, (won ? 0 : bp.z * 0.3) - cp.z); const fl = flat.length();
      cam.lookAt(cp.x + flat.x, cp.y + Math.tan(pitch) * fl, cp.z + flat.z);
      cam.setViewOffset(W, H, -W * side, 0, W, H); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); };
    /* too far left: the subject slides right first (the frame has room), the lens backs off only when it cannot */
    let side = aside;
    for (let i = 0; i < 140; i++) {
      pitch = el(lowP, cp) - Math.atan((bottom - 0.5) * 2 * th); aim();
      let ok = frac(el(hiP, cp), pitch) <= 1 - top; let x0 = Infinity; let x1 = -Infinity; let yTop = Infinity;
      for (const c of corners) { _v.copy(c).project(cam); const x = (_v.x + 1) / 2 * W; if (!(fig?.dragon && c.userData === 'boss')) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } yTop = Math.min(yTop, (1 - _v.y) / 2 * H); }
      if (corners.length && yTop < H * top * 0.9) ok = false;
      if (ok && corners.length && (x0 < xMin || x1 > xMax)) {
        if (x0 < xMin && x1 + (xMin - x0) <= xMax && aside > 0) { side += (xMin - x0) / W; continue; }
        ok = false;
      }
      if (ok) break; cp.addScaledVector(away, 0.4);
    }
    /* where the horizon, the boss and the hero fall in the picture, for the painted sky */
    const scr = (p) => { const v = p.clone().project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
    const fwd = cam.getWorldDirection(V3()).setY(0).normalize();
    const hor = scr(cp.clone().addScaledVector(fwd, 2500).setY(0));
    const bossTop = scr(V3(bp.x, hiP.y, bp.z)); const bossFoot = scr(V3(bp.x, 0, bp.z)); const heroFoot = scr(V3(0, 0, 0)); const heroTop = scr(V3(0, hiP.y, 0));
    let sunX; let sunY; let sunR;
    if (won) { sunR = Math.min(H * 0.42, (heroFoot.y - heroTop.y) * 0.62); sunX = heroFoot.x + sunR * 0.12; sunY = hor.y - sunR * 0.5; }
    else { let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; if (showBoss) { const fb = new THREE.Box3().setFromObject(fig.object); for (let c = 0; c < 8; c++) { _v.set(c & 1 ? fb.max.x : fb.min.x, c & 2 ? fb.max.y : fb.min.y, c & 4 ? fb.max.z : fb.min.z).project(cam); const x = (_v.x + 1) / 2 * W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, (1 - _v.y) / 2 * H); } }
      const bH = Math.max(40, bossFoot.y - (Number.isFinite(y0) ? y0 : bossTop.y)); const bW = Number.isFinite(x0) ? x1 - x0 : 0;
      sunR = Math.min(H * 0.46, Math.max(bH * 0.6, bW * 0.42, H * 0.26)); sunX = Number.isFinite(x0) ? (x0 + x1) / 2 : bossFoot.x; sunY = Math.min(bossFoot.y - bH * 0.48, hor.y - sunR * 0.2); }
    const feet = [{ x: heroFoot.x, y: heroFoot.y, w: W * 0.12 }]; if (showBoss) feet.push({ x: bossFoot.x, y: bossFoot.y, w: W * (won ? 0.16 : 0.09) });
    const bg2 = bgCv.getContext('2d'); (paint || paintStage)(bg2, W, H, { horY: hor.y, sunX, sunY, sunR, tint, feet });
    bg.needsUpdate = true; stage.background = bg;
    /* render at the picture's size, without the world's passes */
    const pr = R.getPixelRatio(); const sz = R.getSize(new THREE.Vector2()); const ex = R.toneMappingExposure;
    undo.push(() => { R.setPixelRatio(pr); R.setSize(sz.x, sz.y, false); R.toneMappingExposure = ex; });
    R.setPixelRatio(1); R.setSize(W, H, false); R.toneMappingExposure = T.exp; R.setRenderTarget(null);
    /* the hero's fresnel rim (world.js addRim) in the sun's hot orange, from the sun's side */
    if (RIM_UNIFORMS) { const c0 = RIM_UNIFORMS.col.value.clone(); const k0 = RIM_UNIFORMS.key.value.clone(); undo.push(() => { RIM_UNIFORMS.col.value.copy(c0); RIM_UNIFORMS.key.value.copy(k0); });
      RIM_UNIFORMS.col.value.setRGB(1.0, 0.36, 0.12).multiplyScalar(T.rimK ?? 9); RIM_UNIFORMS.key.value.set(0.55, 0.45, -0.7).normalize(); }
    if (showBoss && fig?.update && !won) { R.render(stage, cam); for (let i = 0; i < 6; i++) { try { fig.update(0.5, 1.5 + i * 0.5); } catch { break; } } }
    R.render(stage, cam);
    out.getContext('2d').drawImage(R.domElement, 0, 0, W, H); embers(out.getContext('2d'), W, H, { n: Math.round(W / 22), hy: hor.y });
    out.stage = { horY: hor.y, sunX, sunY, sunR };
    for (const l of L) { l.dispose?.(); }
  } finally {
    for (let i = undo.length - 1; i >= 0; i--) { try { undo[i](); } catch (err) { console.warn('title shot undo', err); } }
    bg.dispose(); if (fig) fig.object.visible = false;
    hero.root.updateMatrixWorld(true); world.resize?.();
  }
  return out;
}

/* ---------------- the landing's scene ---------------- */
const SPIRIT = () => {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa04a, emissiveIntensity: 0.95, roughness: 1, metalness: 0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { float fr = 1.0 - abs(dot(normalize(vViewPosition), normal)); totalEmissiveRadiance *= 0.14 + 2.1 * pow(fr, 2.2); }'); };
  m.customProgramCacheKey = () => 'share-spirit';
  return m;
};
const SKY_VERT = 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FRAG = 'uniform vec3 uTop, uHor, uLow; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mix(uHor, vec3(0.42, 0.06, 0.38), smoothstep(0.0, 0.22, y)), uTop, smoothstep(0.18, 0.6, y)) : uHor; gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';

/* host: the landing element. opts: { worldId, nemId, mech, accent, sky: { top, hor, low }, name, label (el for the name) } */
export function landingStage(host, { worldId = 'dark', nemId = null, mech = 'twin', accent = 0xff5a1e, sky = {}, label = null, won = false, heroModel = null, heroBodyType = null, tint = 0x2ee8ff } = {}) {
  const cv = document.createElement('canvas'); cv.className = 'share-stage'; cv.setAttribute('aria-hidden', 'true');
  host.prepend(cv);
  let R;
  try { R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' }); } catch (err) { console.warn('share stage', err); cv.remove(); return { stop() {}, ready: Promise.resolve(false) }; }
  const phone = document.body.classList.contains('touch') || Math.min(innerWidth, innerHeight) < 560;
  R.setPixelRatio(Math.min(devicePixelRatio || 1, phone ? 1.5 : 2));
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.15; R.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); const acc = new THREE.Color(accent);
  const top = new THREE.Color(sky.top ?? 0x0b0d16); const hor = new THREE.Color(sky.hor ?? 0x2a1c22); const low = new THREE.Color(sky.low ?? 0x07070a);
  const skyM = new THREE.ShaderMaterial({ uniforms: { uTop: { value: top }, uHor: { value: hor }, uLow: { value: low } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyM); skyMesh.renderOrder = -10; scene.add(skyMesh);
  /* the ground fades into the horizon colour (the fog is the horizon), so there is no hard edge */
  scene.fog = new THREE.FogExp2(hor.clone(), 0.014);
  { const gh = new THREE.GridHelper(160, 120, tint, tint); gh.material.transparent = true; gh.material.opacity = 0.55; gh.material.depthWrite = false; gh.position.y = 0.01; scene.add(gh); }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ color: 0x2a0820, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  /* the glow on the ground where the companion stands (no light: a soft additive disc) */
  const discTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,170,90,0.9)'); r.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; scene.add(disc);
  scene.add(new THREE.HemisphereLight(top.clone().lerp(new THREE.Color(0xffffff), 0.3), 0x1a1210, 0.5));
  const key = new THREE.DirectionalLight(0xffd8b0, 2.4); key.position.set(-4, 6, 10); scene.add(key, key.target);
  /* a teal rim from the left, the sun's orange rim from the right, a violet-blue fill */
  const rimL = new THREE.DirectionalLight(0x2ee8ff, 8); rimL.position.set(-9, 8, -16); scene.add(rimL, rimL.target);
  const rimR = new THREE.DirectionalLight(0xff5a2a, 10); rimR.position.set(10, 5, -14); scene.add(rimR, rimR.target);
  const moon = new THREE.DirectionalLight(0x6d6cff, 2.4); moon.position.set(6, 10, -8); scene.add(moon, moon.target);
  const under = new THREE.PointLight(0xff8a3a, 40, 18, 2); under.position.set(-0.8, 0.6, 1.2); scene.add(under);
  /* a warm fill on the companion's face (the fire beside them) */
  const warm = new THREE.PointLight(0xffb070, 34, 7, 2); scene.add(warm);
  /* embers */
  const EN = phone ? 60 : 140; const eg = new THREE.BufferGeometry(); const ep = new Float32Array(EN * 3); const ev = [];
  const spawn = (i, any) => { ep[i * 3] = (Math.random() - 0.5) * 14; ep[i * 3 + 1] = any ? Math.random() * 9 : 0; ep[i * 3 + 2] = -4 + Math.random() * 7; ev[i] = [(Math.random() - 0.5) * 0.3, 0.4 + Math.random() * 0.9]; };
  for (let i = 0; i < EN; i++) spawn(i, true);
  eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  /* the title's banded sun, low behind the boss */
  const sun = makeSun({ motion: !RM }); scene.add(sun.mesh); const sunDir = V3();
  const pts = new THREE.Points(eg, new THREE.PointsMaterial({ color: new THREE.Color(0xffa040), size: 0.06, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
  let fig = null; let rowan = null; let heroHeld = false; let stopped = false; let raf = 0; let t = 0; let last = performance.now();
  /* the frame: the boss right of centre and up, the companion low and nearer; on a tall phone the boss stands top centre */
  const BOSS_AT = V3(2.2, 0, -3.6); const ROWAN_AT = V3(0.2, 0, 1.4);
  const frame = () => {
    const W = host.clientWidth || innerWidth; const H = host.clientHeight || innerHeight; const tall = H > W * 1.1;
    R.setSize(W, H, false); cam.aspect = W / H;
    cam.fov = tall ? 58 : 42;
    if (tall) { BOSS_AT.set(0.7, 0, -5.4); ROWAN_AT.set(-0.6, 0, 1.4); } else if (H < 520) { BOSS_AT.set(4.4, 0, -3.4); ROWAN_AT.set(1.3, 0, 0.3); } else { BOSS_AT.set(3.9, 0, -3.4); ROWAN_AT.set(0.0, 0, 0.3); }
    if (fig) { fig.object.position.copy(BOSS_AT); if (won) fig.object.position.add(V3(tall ? 2.2 : 4.2, 0, -9)); }
    if (rowan) { rowan.root.position.copy(ROWAN_AT); disc.position.set(ROWAN_AT.x, 0.02, ROWAN_AT.z); warm.position.set(ROWAN_AT.x + 0.9, 1.6, ROWAN_AT.z + 1.4); }
    cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(frame); ro.observe(host);
  const _h = V3(); const _p = V3();
  const loop = () => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const W = host.clientWidth || innerWidth; const H = host.clientHeight || innerHeight; const tall = H > W * 1.1;
    const m = RM ? 0 : 1;
    /* a slow push in with a small sway */
    const cz = (tall ? 7.6 : 6.6) - m * Math.min(1, t / 14) * 0.6; const cx = (tall ? 0 : -0.2) + m * Math.sin(t * 0.13) * 0.25;
    cam.position.set(cx, tall ? 1.15 : 1.0, cz);
    const bh = fig?.height || 4.6; cam.lookAt(tall ? 0.15 : 0.55, tall ? 1.5 + (bh - 4.6) * 0.3 : 2.3 + (bh - 4.6) * 0.42, -3);
    cam.updateMatrixWorld(); sunDir.copy(won ? ROWAN_AT : BOSS_AT).sub(cam.position).setY(0).normalize(); sunDir.x += tall ? 0 : 0.08; sunDir.y = Math.tan(tall ? 0.16 : 0.09); sun.place(cam, sunDir, tall ? 0.62 : 0.6, 300); sun.u.uT.value = t;
    if (fig?.update) { try { fig.update(RM ? 0 : dt, t + 2); } catch (err) { console.warn('share stage boss', err); fig.update = null; } }
    if (fig && !won) fig.object.position.y = m * Math.sin(t * 0.7) * 0.03;
    if (rowan && !heroHeld) rowan.mixer.update(RM ? 0 : dt);
    for (let i = 0; i < EN; i++) { const v = ev[i]; ep[i * 3] += (v[0] + Math.sin(t + i) * 0.15) * dt * m; ep[i * 3 + 1] += v[1] * dt * m; if (ep[i * 3 + 1] > 9) spawn(i, false); }
    eg.attributes.position.needsUpdate = true;
    under.intensity = 40 * (0.85 + 0.15 * Math.sin(t * 9.3) * Math.sin(t * 3.1) * m);
    R.render(scene, cam);
    /* the name under the spirit's feet */
    if (label && rowan) { rowan.root.getWorldPosition(_h); _p.copy(_h).setY(_h.y + 2.25).project(cam); const x = (_p.x + 1) / 2 * W; const y = (1 - _p.y) / 2 * H; label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`; label.classList.toggle('on', _p.z < 1); }
  };
  const ready = (async () => {
    const h = mech === 'giant' ? 8.0 : mech === 'lich' ? 6.0 : mech === 'dragon' ? null : 5.6;
    try { fig = await bossFigure({ worldId, nemId, mech, accent, height: h }); } catch (err) { console.warn('share stage boss', err); }
    if (stopped) { fig?.dispose(); return false; }
    if (fig) { scene.add(fig.object); fig.object.rotation.y = -0.3;
      /* the boss as the title's clean black shape in the sun (its eyes stay lit), as on the pictures */
      { const SIL = new THREE.MeshBasicMaterial({ color: 0x0a0210, fog: false }); fig.object.traverse((m) => { if (!m.isMesh) return; const o = m.material; m.material = Array.isArray(o) ? o.map((x) => (x === fig.glow ? x : SIL)) : o === fig.glow ? o : SIL; }); }
      /* a won link: the boss is beaten, down on one knee, its eyes still on the one who plays */
      /* a won link: the boss lies beaten behind the hero, a black shape low on the sun (as on the picture) */
      if (won && fig.actor?.has?.('Fixing_Kneeling')) { fig.actor.play('Fixing_Kneeling', { fade: 0, speed: 0.5 }); fig.actor.mixer.update(1.2); fig.update = null; }
      else if (won) { fig.object.rotation.order = 'YXZ'; fig.object.rotation.set(-Math.PI / 2 + 0.06, Math.PI / 2 - 0.25, 0); fig.update = null; } }
    try {
      const a = await makeActor(KNIGHT_URL); a.noBlob = true;
      /* the sender in their own class (the link's ninth field), warm-lit like someone by a fire; the spirit look without one */
      let real = false;
      if (heroModel) { try { const { dressHero } = await import('./camp.js'); if (heroBodyType === 'm' || heroBodyType === 'f') a.bodyType = heroBodyType; /* the sender's body type, from the link */ await dressHero(a, heroModel, false); real = true; } catch (err) { console.warn('share stage hero', err); } }
      if (real) { a.eyes?.(0); a.root.traverse((n) => { if (n.isMesh && n.material?.emissive) { n.material = n.material.clone(); n.material.emissive.set(0xff8a3a); n.material.emissiveIntensity = 0.06; } }); }
      else { a.look({ helm: 'hood', cloak: true, tabard: false, pauldrons: false, robe: false, eye: 0x000000, eyePower: 0 });
        const mat = SPIRIT(); const keep = new Set(['Mannequin', 'Hood', 'Cloak']);
        for (const mesh of a.meshes) { mesh.material = mat; mesh.visible = keep.has(mesh.userData.part); mesh.castShadow = false; } }
      a.play(real ? (a.has('Idle_Loop') ? 'Idle_Loop' : 'Idle') : a.has('Idle_Lantern_Loop') ? 'Idle_Lantern_Loop' : 'Idle', { fade: 0 }); a.mixer.update(0.7);
      /* turned to the one who plays, three-quarter on: the companion waits at their side */
      a.root.rotation.y = 0.45;
      /* a won link: the sender's victory, the weapon raised (the picture's pose), held still */
      if (won && real && a.has('Cheer')) { a.play('Cheer', { fade: 0, loop: false, restart: true }); a.mixer.update(0.3); a.root.rotation.y = -0.5; heroHeld = true; }
      if (stopped) { a.dispose(); return false; }
      scene.add(a.root); rowan = a;
    } catch (err) { console.warn('share stage spirit', err); }
    frame();
    try { await R.compileAsync?.(scene, cam); } catch { /* compiles on the first frame */ }
    if (stopped) return false;
    cv.classList.add('on');
    last = performance.now(); loop();
    return true;
  })();
  frame();
  return {
    ready,
    stop() {
      stopped = true; cancelAnimationFrame(raf); ro.disconnect();
      try { fig?.dispose(); } catch { /* gone */ }
      try { rowan?.dispose(); } catch { /* gone */ }
      scene.traverse((o) => { if (o.isMesh || o.isPoints) { o.geometry?.dispose?.(); } });
      try { R.dispose(); R.forceContextLoss(); } catch { /* gone */ }
      cv.remove();
    },
  };
}

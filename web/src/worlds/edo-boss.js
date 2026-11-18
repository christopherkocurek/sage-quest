/* Old Edo bosses. The Lord (twin mechanic, mirror false): no glass, no shatter. He fights in his own lacquered o-yoroi
   and oni menpo, a sashimono on his back and a long nodachi, his nobori round the field; a hit lights a brief ember glint;
   at death he kneels, lays the blade before him and bows, and stays on the knee while sakura petals drift and
   burst and the camera closes in (card at 3.6 s). The Other Ronin (twin, mirror false): cloth and ink under a kasa with a katana; at death he kneels
   and his hat falls off and rolls away.
   skyNemesis: the Lord looms behind his keep; the Other Ronin stands far down the road under his kasa (both the real
   rig as a dark silhouette, web/src/worlds/sky-figure.js). Dense one-line code uses block comments only. */
import * as THREE from 'three';
import { worldById } from '/game/worlds.mjs';
import { skyFigure } from './sky-figure.js';
import { finishFoe, foeRng, rankKit, build, HEAVY } from './foe-look.js';

const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3();
const _f = new THREE.Vector3(); const _Y = new THREE.Vector3(0, 1, 0); const _m3 = new THREE.Vector3(); const _m4 = new THREE.Vector3(); const _r = new THREE.Vector3(); const _m = new THREE.Matrix4(); const _e = new THREE.Euler();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ================================================================ dressBoss */
export function dressBoss(actor, nemesisId, ctx = {}) {
  if (nemesisId === 'lord') return dressDuelist(actor, ctx, 'lord');
  if (nemesisId === 'other') return dressDuelist(actor, ctx, 'other');
  return null;
}

/* a sakura petal: a rounded fan with a notch at the outer tip, cupped, pale at the tip and pink at the base (flat squares
   read as confetti) */
function petalGeo() {
  const sh = new THREE.Shape(); sh.moveTo(0, 0);
  sh.bezierCurveTo(-0.032, 0.012, -0.046, 0.052, -0.026, 0.078); sh.lineTo(-0.008, 0.07); sh.lineTo(0, 0.058); sh.lineTo(0.008, 0.07); sh.lineTo(0.026, 0.078);
  sh.bezierCurveTo(0.046, 0.052, 0.032, 0.012, 0, 0);
  const g = new THREE.ShapeGeometry(sh, 6); const p = g.attributes.position; const col = new Float32Array(p.count * 3);
  const c0 = new THREE.Color(0xd87a92); const c1 = new THREE.Color(0xfbe6ea); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); p.setZ(i, x * x * 9 - y * 0.15); c.copy(c0).lerp(c1, Math.min(1, y / 0.06)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.translate(0, -0.035, 0); g.computeVertexNormals();
  return g;
}
/* the lord's mon on a nobori: black cloth, a white ring with three tomoe, a red band at the top */
function monCanvas() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#121014'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#8a1a14'; g.fillRect(0, 0, 64, 14);
  g.strokeStyle = '#e8e0cc'; g.fillStyle = '#e8e0cc'; g.lineWidth = 3; g.beginPath(); g.arc(32, 60, 22, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 - Math.PI / 2; g.beginPath(); g.arc(32 + Math.cos(a) * 7, 60 + Math.sin(a) * 7, 6, 0, Math.PI * 2); g.fill(); g.lineWidth = 4; g.beginPath(); g.arc(32, 60, 13, a + 0.2, a + 1.6); g.stroke(); }
  /* no kanji (the cloth is double-sided, so any text read mirrored from one side): a second, smaller mon low on the
     cloth and two thin cream bands, like a clan field banner */
  g.fillRect(6, 112, 52, 3); g.fillRect(6, 232, 52, 3);
  g.lineWidth = 2; g.beginPath(); g.arc(32, 172, 12, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + Math.PI / 6; g.beginPath(); g.arc(32 + Math.cos(a) * 4, 172 + Math.sin(a) * 4, 3.4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* The Lord and the Other Ronin: duelists in the twin mechanic (mirror false). kind 'lord': o-yoroi, a sashimono on his
   back, a long nodachi, his nobori behind the field, at death he kneels, lays the blade down and bows, and stays on the knee.
   kind 'other': cloth and ink under a straw kasa, a katana, at death he kneels and his hat falls and rolls away. */
function dressDuelist(actor, ctx, kind) {
  const lord = kind === 'lord';
  const H = { id: 'twin', float: 0, darkness: 0, lookAt: new THREE.Vector3(), shake: 0, time: 0, disposers: [], warmMats: [], warmShow: [] };
  H.takeShake = () => { const s = H.shake; H.shake = 0; return s; };
  H.onStep = () => 0; H.onSlam = () => ({ shake: 0, flash: 0, slow: 0 }); H.onSummon = () => 0; H.rise = () => {}; H.onPhase = () => {}; H.onParry = () => ({});
  const scale = ctx.size || (lord ? 1.35 : 1.05); actor.root.scale.setScalar(scale);
  const look = ctx.heroLook || {};
  actor.look({ ...look, eye: 0xff5a2a, eyePower: 1, vary: false });
  /* a hit: a brief low ember glint on the lacquer (a cold full-body tint read as a ghost) */
  const base = actor.flash.bind(actor);
  actor.flash = () => base(0xff7a40, 55, 0.035);
  /* every hit rocks him back a little; a heavy hit staggers him (the chest
     snaps back, the head turns away) for about half a second */
  H.stag = 0; H.stagSide = 1;
  H.onHit = (at, heavy) => { base(0xff7a40, 60, 0.045); H.shake = Math.max(H.shake, heavy ? 0.3 : 0.15); H.stag = Math.max(H.stag, heavy ? 1 : 0.4); H.stagSide = Math.random() < 0.5 ? -1 : 1; if (heavy) H.flare = 1; return {}; };
  const breakOrig = actor.breakPart.bind(actor);
  actor.breakPart = () => [];
  H.boltLook = { color: 0x000000, scale: 1, mesh: () => {
    const g = new THREE.Group(); const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 1, roughness: 0.28, emissive: 0x2a2e36 }); const wrap = new THREE.MeshStandardMaterial({ color: 0x1a1214, roughness: 0.8 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.024, 0.006), steel); blade.position.x = 0.1; const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.014), wrap); grip.position.x = -0.05;
    g.add(blade, grip); g.onBeforeRender = () => { g.rotation.z -= 0.55; }; g.userData.dispose = () => { blade.geometry.dispose(); grip.geometry.dispose(); steel.dispose(); wrap.dispose(); };
    return g; } };
  const scene = ctx.scene || actor.root.parent;
  /* the lord's field: six nobori with his mon. they stood at 14.5 m, inside the 15 m fight floor, so one often stood
     between the camera and the Lord. Now they stand outside the floor
     (19.5 m), in an arc behind the Lord's start as seen from the hero, and one that still comes into the sight line
     (the death camera may leave the floor) is hidden until it is clear. */
  let field = null;
  if (lord && scene) {
    field = new THREE.Group(); const tex = monCanvas(); const cloth = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
    const pole = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.6 });
    const pg = new THREE.CylinderGeometry(0.035, 0.045, 5.2, 6); pg.translate(0, 2.6, 0); const bg = new THREE.PlaneGeometry(0.7, 2.8, 1, 6); bg.translate(0.38, 3.35, 0);
    const xg = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5); xg.rotateZ(Math.PI / 2); xg.translate(0.4, 4.78, 0);
    const banners = [];
    for (let i = 0; i < 6; i++) { const g = new THREE.Group();
      const ban = new THREE.Mesh(bg, cloth); g.add(new THREE.Mesh(pg, pole), new THREE.Mesh(xg, pole), ban); field.add(g); banners.push({ ban, g, ph: i * 1.7 }); }
    field.userData.banners = banners; field.visible = false; /* placed on the first update, when the hero and the Lord stand where they start */
    scene.add(field); H.disposers.push(() => { field.removeFromParent(); for (const x of [pg, bg, xg, cloth, pole, tex]) x.dispose(); });
  }
  const FIELD_R = 19.5; const _sa = new THREE.Vector3(); const _sb = new THREE.Vector3();
  const placeField = (st) => {
    const banners = field.userData.banners; const lp = st.pos || actor.root.position; const pp = st.player;
    if (!field.userData.placed && pp) {
      field.userData.placed = true; field.visible = true;
      let dx = lp.x - pp.x; let dz = lp.z - pp.z; if (Math.hypot(dx, dz) < 0.5) { dx = 0; dz = -1; }
      const base = Math.atan2(dz, dx); const gy = scene.userData?.groundAt;
      banners.forEach((b, i) => { const a = base + (i - 2.5) * 0.36; b.g.position.set(Math.cos(a) * FIELD_R, 0, Math.sin(a) * FIELD_R); b.g.rotation.y = -a - Math.PI / 2; if (gy) b.g.position.y = gy(b.g.position.x, b.g.position.z) || 0; });
    }
    for (const b of banners) {
      b.ban.rotation.y = Math.sin(H.time * 1.3 + b.ph) * 0.12;
      /* hidden while it stands within 1.4 m of the line from the hero to the Lord, between them */
      if (pp) { _sa.set(lp.x - pp.x, 0, lp.z - pp.z); const L2 = _sa.lengthSq() || 1; _sb.set(b.g.position.x - pp.x, 0, b.g.position.z - pp.z);
        const u = _sb.dot(_sa) / L2; const off = u > -0.05 && u < 1.05 ? _sb.addScaledVector(_sa, -u).length() : 99; b.g.visible = off > 1.4; }
    }
  };
  let death = null;
  const hand = actor.slot('handslotr');
  const DUR = 8; /* the card comes at 0.45 x DUR = 3.6 s */
  H.keepOut = lord ? 2.6 : 1.8; /* the twin's lunge clips step in by about 1 m x scale: at 1.35 a 2.2 m keep let his helmet reach the camera */
  const B = {}; for (const n of ['pelvis', 'spine_01', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'calf_l', 'calf_r']) B[n] = actor.root.getObjectByName(n);
  const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _t = new THREE.Vector3(); const _qa = new THREE.Quaternion(); const _qb = new THREE.Quaternion(); const _qc = new THREE.Quaternion();
  const aim = (bone, tip, dir, w) => {
    if (!bone || !tip || w <= 0) return;
    bone.getWorldPosition(_a); tip.getWorldPosition(_b); _b.sub(_a).normalize();
    _qa.setFromUnitVectors(_b, _t.copy(dir).normalize()); _qa.slerp(_qc.identity(), 1 - w);
    bone.getWorldQuaternion(_qb); bone.parent.getWorldQuaternion(_qc);
    bone.quaternion.copy(_qc.invert().multiply(_qa.multiply(_qb)));
    bone.updateMatrixWorld(true);
  };
  H.onKneel = () => { H.shake = Math.max(H.shake, 0.12); };
  /* petals: a slow drift from the kneel, a burst when he falls */
  let petals = null;
  const startPetals = (at) => {
    const N = 90; const geo = petalGeo(); const mat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x3a1a20, roughness: 0.75, side: THREE.DoubleSide });
    const m = new THREE.InstancedMesh(geo, mat, N); m.frustumCulled = false; const P = [];
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2; const r = 0.5 + Math.random() * 3.4; P.push({ x: at.x + Math.cos(a) * r, y: 1.0 + Math.random() * 3.6, z: at.z + Math.sin(a) * r, vx: 0, vz: 0, vy: 0.2 + Math.random() * 0.18, ph: Math.random() * 6.28, sp: 1 + Math.random() * 2, s: 0.8 + Math.random() * 0.5 }); }
    scene.add(m); petals = { m, P, geo, mat };
  };
  const burst = (at) => { if (!petals) return; const P = petals.P; for (let i = 0; i < P.length; i += 2) { const q = P[i]; const a = Math.random() * Math.PI * 2; q.x = at.x + Math.cos(a) * 0.3; q.z = at.z + Math.sin(a) * 0.3; q.y = 0.2 + Math.random() * 0.5; q.vx = Math.cos(a) * (0.6 + Math.random() * 1.2); q.vz = Math.sin(a) * (0.6 + Math.random() * 1.2); q.vy = -(0.9 + Math.random() * 0.9); } };
  const tickPetals = (dt, t) => {
    if (!petals) return; const { m, P } = petals;
    for (let i = 0; i < P.length; i++) { const q = P[i];
      if (q.vy < 0) { q.vy += 2.2 * dt; q.x += q.vx * dt; q.z += q.vz * dt; q.y -= q.vy * dt; q.vx *= 0.97; q.vz *= 0.97; if (q.vy >= 0) q.vy = 0.15 + Math.random() * 0.15; }
      else q.y = Math.max(0.012, q.y - q.vy * dt);
      const sw = Math.sin(t * q.sp + q.ph); const down = q.y <= 0.015;
      _p.set(q.x + (down ? 0 : sw * 0.3), q.y, q.z + (down ? 0 : Math.cos(t * q.sp * 0.7 + q.ph) * 0.2));
      if (down) _e.set(-Math.PI / 2, q.ph, 0); else _e.set(t * q.sp + q.ph, q.ph, sw * 1.2);
      _q.setFromEuler(_e); _s.setScalar(q.s); _m.compose(_p, _q, _s); m.setMatrixAt(i, _m); }
    m.instanceMatrix.needsUpdate = true;
  };
  /* the other ronin's hat: the skinned kasa is copied into a plain mesh where it sits at that moment, hidden on him, and
     the copy falls off the bowed head, lands on its rim and rolls away in an arc, then tips flat */
  const detachHat = () => {
    const ms = actor.parts?.get('Helm_sallet') || []; if (!ms.length) return null;
    const g = new THREE.Group(); const c = new THREE.Vector3(); let n = 0; const geos = [];
    for (const sm of ms) { if (!sm.isSkinnedMesh || !sm.visible) continue; sm.updateMatrixWorld(true); const src = sm.geometry.attributes.position; const out = new Float32Array(src.count * 3); const v = new THREE.Vector3();
      for (let i = 0; i < src.count; i++) { v.fromBufferAttribute(src, i); sm.applyBoneTransform(i, v); v.applyMatrix4(sm.matrixWorld); out.set([v.x, v.y, v.z], i * 3); c.add(v); n++; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(out, 3)); if (sm.geometry.index) geo.setIndex(sm.geometry.index); geo.computeVertexNormals(); geos.push([geo, sm.material]); sm.visible = false; }
    if (!n) return null; c.multiplyScalar(1 / n);
    for (const [geo, mat] of geos) { geo.translate(-c.x, -c.y, -c.z); const mm = new THREE.Mesh(geo, mat); mm.castShadow = true; g.add(mm); }
    g.position.copy(c); scene.add(g); H.disposers.push(() => { g.removeFromParent(); for (const [geo] of geos) geo.dispose(); });
    return { g, from: c.clone(), q0: g.quaternion.clone() };
  };
  /* ---------------------------------------------------------------- acting
     - the sashimono is rigid and upright: the skinned banner (rigid to spine_03) swung flat across the screen when he
       crouched. It is baked once, hidden on the body, and a rigid copy follows the back, upright, with 15 % of the lean;
     - a wind-up before each blow: he draws back (chest up, weight back) and the blade flashes a glint at the top of it;
     - a stagger on heavy hits (onHit above) and a small rock on light ones;
     - wounds as his bar drops: cuts across the do and the kusazuri, the crest cut away (it falls), the banner torn,
       and a heavy breath when he is low. */
  let acting = null;
  const setupActing = () => {
    const model = actor.model || actor.root.children[0]; if (!model || !B.spine_03) return null;
    actor.root.updateMatrixWorld(true);
    const A = { sashi: null, glint: null, gear: null, wounds: [], crest: null, crestBits: [], t: 0 };
    const own = [];
    /* the rigid banner */
    const sm = (actor.parts?.get('Sashimono') || []).filter((m) => m.visible && m.isSkinnedMesh);
    if (sm.length) {
      /* the bind pose: the raw geometry is in the armature's space (upright); spine_03's bind matrix comes from the skin */
      const g = new THREE.Group(); const arm0 = sm[0].parent; const sk = sm[0].skeleton; const bi = sk.bones.findIndex((b) => b.name === 'spine_03');
      const bind = new THREE.Matrix4().copy(sk.boneInverses[Math.max(0, bi)]).invert(); const pb = new THREE.Vector3(); const qb = new THREE.Quaternion(); bind.decompose(pb, qb, _s);
      for (const m of sm) { const geo = m.geometry.clone(); geo.translate(-pb.x, -pb.y, -pb.z); const b = new THREE.Mesh(geo, m.material); b.castShadow = true; b.frustumCulled = false; g.add(b); own.push(geo); m.visible = false; m.userData.rigidCopy = true; }
      scene.add(g); A.sashi = { g, arm: arm0, qBind: qb, tear: 0, src: sm };
    }
    /* the glint on the blade */
    const gear = hand?.children.find((c) => c.isObject3D && !c.isBone);
    if (gear) {
      gear.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(gear.matrixWorld).invert(); let top = 0;
      gear.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld)); top = Math.max(top, bb.max.y); } });
      const tex = glintTex(); const mat = new THREE.SpriteMaterial({ map: tex, color: 0xfff2dc, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: 0 });
      const sp = new THREE.Sprite(mat); sp.position.set(0, top * 0.72, 0); sp.scale.setScalar(Math.max(0.05, top * 0.5)); sp.renderOrder = 8; gear.add(sp);
      A.glint = { sp, mat, tex, base: Math.max(0.05, top * 0.5) }; A.gear = gear;
    }
    /* wounds (lord): cuts laid on the armour where a ray from the front meets it, then carried by the bone */
    if (lord) {
      const cutMat = new THREE.MeshStandardMaterial({ color: 0x1c0504, emissive: 0x9a160a, emissiveIntensity: 1.4, roughness: 0.6 });
      const edgeMat = new THREE.MeshStandardMaterial({ color: 0xc8c0b4, metalness: 1, roughness: 0.3 });
      const fwd = model.getWorldDirection(new THREE.Vector3()); fwd.y = 0; fwd.normalize(); const side = new THREE.Vector3().crossVectors(_Y, fwd);
      const ray = new THREE.Raycaster(); const S = scale * 1.27;
      const cut = (part, bone, up, lat, len, roll, at) => {
        const ms = (actor.parts?.get(part) || []).filter((m) => m.visible); const bn = B[bone]; if (!ms.length || !bn) return;
        const o = actor.root.position.clone().addScaledVector(_Y, up * S).addScaledVector(side, lat * S).addScaledVector(fwd, 1.2 * S);
        ray.set(o, fwd.clone().negate()); ray.far = 2.4 * S; const hit = ray.intersectObjects(ms, false)[0]; if (!hit) return;
        const g = new THREE.Group(); const w = len * S;
        const core = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012 * S, 0.004 * S), cutMat); const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.003 * S, 0.003 * S), edgeMat); edge.position.y = 0.006 * S;
        own.push(core.geometry, edge.geometry); g.add(core, edge);
        g.position.copy(hit.point).addScaledVector(fwd, 0.006 * S); g.lookAt(hit.point.clone().addScaledVector(fwd, 1)); g.rotateZ(roll);
        g.visible = false; bn.attach(g); A.wounds.push({ g, at, on: false });
      };
      cut('Chest', 'spine_03', 1.32, 0.03, 0.26, 0.55, 0.8);
      cut('Fauld', 'pelvis', 0.9, -0.08, 0.2, -0.4, 0.6);
      cut('Chest', 'spine_03', 1.2, -0.05, 0.22, -0.7, 0.3);
      A.cutMat = cutMat; own.push(cutMat, edgeMat);
    }
    A.update = (dt, st) => {
      A.t += dt;
      const hp = st.hpFrac ?? 1;
      actor.root.updateMatrixWorld(true);
      const fwd = model.getWorldDirection(_t); fwd.y = 0; fwd.normalize(); const lat = _m4.crossVectors(fwd, _Y).normalize(); /* +angle about lat = lean back */
      const turn = (b, axis, ang) => { if (!b || Math.abs(ang) < 1e-4) return; b.getWorldQuaternion(_qb); _r.copy(axis).applyQuaternion(_qb.invert()).normalize(); b.quaternion.multiply(_qa.setFromAxisAngle(_r, ang)); b.updateMatrixWorld(true); };
      if (!death) {
        /* the wind-up: weight back and chest up while the blow draws, released into the cut */
        const k = st.attacking ? Math.min(1.2, st.atkK || 0) : 0;
        const wind = st.attacking ? sstep(0.0, 0.55, k) * (1 - sstep(0.88, 1.0, k)) : 0;
        A.wind = (A.wind || 0) + (wind - (A.wind || 0)) * Math.min(1, dt * 12);
        /* the stagger: fast back, eased return */
        H.stag = Math.max(0, H.stag - dt * 2.0); const sg = H.stag * H.stag * (3 - 2 * H.stag);
        const low = hp < 0.35 && !st.attacking ? Math.sin(A.t * 3.1) * 0.045 + 0.06 : 0; /* a heavy breath, bent a little */
        turn(B.spine_01, lat, 0.1 * A.wind + 0.2 * sg - low * 0.6);
        turn(B.spine_03, lat, 0.14 * A.wind + 0.24 * sg - low * 0.5);
        turn(B.neck_01, lat, -0.08 * A.wind + 0.12 * sg);
        turn(B.Head, _Y, 0.35 * sg * H.stagSide);
        if (A.glint) { const g = sstep(0.62, 0.86, k) * (1 - sstep(0.9, 1.0, k)); A.glint.mat.opacity = g; A.glint.sp.scale.setScalar(A.glint.base * (0.6 + 0.8 * g)); A.glint.mat.rotation = A.t * 1.5; }
        /* wounds open as the bar drops, each with a brief ember flare */
        for (const w of A.wounds) if (!w.on && hp < w.at) { w.on = true; w.g.visible = true; A.flareT = 1; }
        if (A.cutMat) { A.flareT = Math.max(0, (A.flareT || 0) - dt * 1.5); A.cutMat.emissiveIntensity = 1.2 + 3 * A.flareT + (hp < 0.35 ? 0.4 * Math.sin(A.t * 3.1) : 0); }
        /* the crest is cut away at 60 % (was 45 %): the gold kuwagata falls and stays in the field */
        if (lord && !A.crest && hp < 0.6) { /* at his first phase (60 %), as the line says */
          A.crest = true;
          for (const pc of breakOrig('Kuwagata')) { pc.quaternion.identity(); scene.add(pc); own.push(pc.geometry); A.crestBits.push({ m: pc, v: new THREE.Vector3((Math.random() - 0.5) * 1.6, 2.6, (Math.random() - 0.5) * 1.6).addScaledVector(fwd, -1.2), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), rest: false }); }
          H.shake = Math.max(H.shake, 0.2);
        }
      } else { if (A.glint) A.glint.mat.opacity = 0; for (const w of A.wounds) if (!w.on) { w.on = true; w.g.visible = true; } } /* a beaten man shows every cut */
      for (const c of A.crestBits) {
        if (c.rest) continue; const gy = scene.userData?.groundAt?.(c.m.position.x, c.m.position.z) ?? 0;
        c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
        if (c.m.position.y < gy + 0.03) { c.m.position.y = gy + 0.03; if (Math.abs(c.v.y) < 1.2) { c.rest = true; c.m.rotation.x = Math.PI / 2; } else { c.v.y *= -0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.4); } }
      }
      /* the rigid banner: at the back of the chest, upright, with a little of the lean */
      if (A.sashi) {
        const S = A.sashi; for (const m of S.src) m.visible = false; /* a later look() would show the skinned banner again */
        S.g.visible = actor.root.visible; B.spine_03.getWorldPosition(S.g.position); S.arm.getWorldQuaternion(Qw); S.arm.getWorldScale(S.g.scale);
        B.spine_03.getWorldQuaternion(_qc).premultiply(_qb.copy(Qw).invert()); /* the spine's turn in the armature's frame */
        _qa.copy(S.qBind).invert().premultiply(_qc); _qb.identity().slerp(_qa, 0.15); /* 15 % of its turn from the bind pose */
        S.g.quaternion.copy(Qw).multiply(_qb);
        /* torn when he is low: the banner hangs crooked */
        if (hp < 0.3 && S.tear < 1) { S.tear = Math.min(1, S.tear + dt * 2); }
        if (S.tear > 0) S.g.rotateZ(0.12 * S.tear);
      }
    };
    A.dispose = () => { A.sashi?.g.removeFromParent(); for (const w of A.wounds) w.g.removeFromParent(); for (const c of A.crestBits) c.m.removeFromParent(); if (A.glint) { A.glint.sp.removeFromParent(); A.glint.mat.dispose(); A.glint.tex.dispose(); } for (const x of own) x.dispose?.(); };
    return A;
  };
  H.onDeath = (pos) => {
    if (death) return DUR;
    actor.root.updateMatrixWorld(true);
    death = { t: 0, model: actor.root.children.map((c) => [c, c.position.clone(), c.quaternion.clone()]), pos: pos.clone(), blade: null, stage: 0, kneel: 9, knelt: false, head: new THREE.Vector3(), fell: false, side: 1, hat: null };
    actor.play('Hit_Chest', { loop: false, fade: 0.08, restart: true, speed: 0.8 });
    return DUR;
  };
  H.update = (dt, st = {}) => { try { update(dt, st); } catch (err) { if (!H.warned) { H.warned = true; console.warn('boss dress edo', err); } } };
  const qT = new THREE.Quaternion(); const qY = new THREE.Quaternion(); const axis = new THREE.Vector3(); const piv = new THREE.Vector3(); const rootQ = new THREE.Quaternion(); const Qw = new THREE.Quaternion();
  const update = (dt, st) => {
    H.time += dt;
    if (field) placeField(st);
    actor.root.updateMatrixWorld(true);
    const head = actor.slot('Head') || actor.root;
    if (!acting && !death) H.acting = acting = setupActing();
    if (acting) acting.update(dt, st);
    if (!death) { head.getWorldPosition(H.lookAt); return; }
    const d = death; d.t += dt;
    actor.root.getWorldDirection(_f); _f.y = 0; _f.normalize();
    /* three-quarter profile: the body turns 0.85 rad on the knee */
    const tk = sstep(0.25, 1.3, d.t) * 0.85;
    /* the Lord no longer falls:
       after the blade is down he bows (1.9-2.5 s) and stays on the knee, head bowed, while the camera closes in; the
       other ronin bows lower and stays kneeling while his hat rolls. The topple code stays for fallK 0. */
    const fallK = 0;
    /* the fall side: the one where the toppled body moves away from the player (tested on the real topple, world space) */
    if (lord && !d.sideSet && st.player) { d.sideSet = true; actor.root.getWorldQuaternion(rootQ); axis.set(Math.sin(0.85), 0, Math.cos(0.85)); qT.setFromAxisAngle(axis, -1.42);
      const tip = _m3.set(0, 1, 0).applyQuaternion(qT).applyQuaternion(rootQ); tip.y = 0; d.side = tip.dot(_r.subVectors(st.player, d.pos)) > 0 ? -1 : 1; }
    /* the model under the root: yaw turn, then the topple about a ground line beside the hips (root-local) */
    qY.setFromAxisAngle(_Y, tk);
    axis.set(Math.sin(tk), 0, Math.cos(tk)); qT.setFromAxisAngle(axis, -d.side * fallK * 1.42);
    piv.set(Math.cos(tk) * 0.3 * d.side, 0, -Math.sin(tk) * 0.3 * d.side);
    for (const [c, p0, q0] of d.model) { c.quaternion.copy(qT).multiply(qY).multiply(q0); c.position.copy(p0).sub(piv).applyQuaternion(qT).add(piv); c.position.y -= 0.06 * fallK; }
    actor.root.updateMatrixWorld(true);
    if (lord && d.t >= 2.5 && !d.fell) { d.fell = true; H.shake = Math.max(H.shake, 0.08); burst(d.pos); } /* the petals burst as the bow ends */
    head.getWorldPosition(d.head);
    const k0 = sstep(0.4, 2.0, d.t);
    /* the Lord's
       view aims between his knee and the blade laid before him, low, so the kneel and the blade share one medium-wide frame */
    if (lord) { _p.copy(d.pos).addScaledVector(_m4.copy(_f).applyAxisAngle(_Y, 0.85), 0.45 * scale); _p.y = (d.pos.y || 0) + 0.8 * scale; }
    else { _p.copy(d.pos).addScaledVector(_f, 0.2 * scale); _p.y = (d.pos.y || 0) + (0.95 - 0.45 * fallK) * scale; }
    H.lookAt.lerpVectors(d.head, _p, k0);
    if (d.stage === 0 && d.t > 0.25) { d.stage = 1; d.kneel = d.t + actor.hold('Fixing_Kneeling', 1.25, { speed: 0.95, fade: 0.35 }); }
    if (!d.knelt && d.t >= d.kneel) { d.knelt = true; H.onKneel?.(d.t); }
    if (d.stage >= 1 && !petals) startPetals(d.pos);
    tickPetals(dt, d.t);
    /* the pose fix after the mixer, in the frame of the toppled body (Qw = the topple in world space) */
    actor.root.getWorldQuaternion(rootQ); Qw.copy(rootQ).multiply(qT).multiply(_qa.copy(rootQ).invert());
    /* the pose fix takes over by 0.75 s (it ramped to the knee at about 1.6 s, and the kneel clip's raised right arm
       passed through the kabuto on the way) */
    const w = sstep(0.2, 0.75, d.t);
    if (w > 0) {
      const fwd = _t.copy(_f).applyAxisAngle(_Y, tk).applyQuaternion(Qw).clone(); const up = _Y.clone().applyQuaternion(Qw);
      const bow = lord ? sstep(1.9, 2.5, d.t) * 0.3 : sstep(1.4, 2.6, d.t) * 0.7; /* the Lord's bow is shallow, so the menpo and kuwagata still read (a deep bow hid the head) */
      const sk = sstep(d.kneel + 0.2, d.kneel + 3, d.t); const breath = d.t > d.kneel && !d.fell ? Math.sin((d.t - d.kneel) * 2.4) * 0.05 * (1 - sk) : 0;
      aim(B.spine_01, B.neck_01, _m3.copy(fwd).multiplyScalar(0.16 + bow + breath).add(up), w);
      aim(B.neck_01, B.Head, _m3.copy(fwd).multiplyScalar(lord ? 0.15 + bow : 0.3 + bow * 1.4).add(up), w);
      for (const sd of ['l', 'r']) {
        const side = sd === 'l' ? 1 : -1; const lat = _m4.copy(fwd).cross(up).multiplyScalar(-side);
        const limp = fallK; /* fallen: the arms go slack along the ground, forward */
        aim(B['upperarm_' + sd], B['lowerarm_' + sd], _m3.copy(up).multiplyScalar(-1 + limp * 0.6).addScaledVector(fwd, 0.35 + limp * 0.8).addScaledVector(lat, 0.16), w);
        aim(B['lowerarm_' + sd], B['hand_' + sd], _m3.copy(up).multiplyScalar(-0.9 + limp * 0.7).addScaledVector(fwd, 0.75 + limp * 0.3).addScaledVector(lat, -0.05), w);
      }
      /* the camera closes in slowly while he kneels (the hold distance is keepOut + 2.6 m): no dead static hold */
      /* the Lord's hold is medium-wide (keep 4.3 + 2.6 = 6.9 m; the fight's slow push stops at 78 %, about 5.4 m), never the
         close-up that showed the slab armour */
      H.keepOut = lord ? 4.3 : 2.0;
    }
    /* the blade leaves his hand just before the knee lands and is laid flat before him */
    if (d.stage === 1 && d.t > d.kneel - 0.3) {
      d.stage = 2; d.b0 = d.t;
      const g = hand?.children.find((c) => c.isObject3D && !c.isBone);
      if (g) {
        g.updateWorldMatrix(true, false); g.matrixWorld.decompose(_p, _q, _s);
        g.removeFromParent(); g.position.copy(_p); g.quaternion.copy(_q); g.scale.copy(_s); scene.add(g);
        const fwd = _m3.copy(_f).applyAxisAngle(_Y, 0.85).clone(); const yaw = Math.atan2(fwd.x, fwd.z);
        _e.set(0, yaw, 0); _q2.setFromEuler(_e);
        const lie = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2, 'ZYX'));
        const to = _q2.clone().multiply(lie);
        const at = d.pos.clone();
        if (B.calf_l && B.calf_r) { B.calf_l.getWorldPosition(_a); B.calf_r.getWorldPosition(_b); at.set((_a.x + _b.x) / 2, 0, (_a.z + _b.z) / 2); }
        at.addScaledVector(fwd, 0.5 * scale); at.y = (d.pos.y || 0) + 0.025;
        d.blade = g; d.from = { p: _p.clone(), q: _q.clone() }; d.to = { p: at, q: to };
      }
    }
    if (d.stage === 2 && d.blade) {
      const k = sstep(d.b0, d.b0 + 0.8, d.t);
      d.blade.position.lerpVectors(d.from.p, d.to.p, k); d.blade.position.y += Math.sin(k * Math.PI) * 0.1;
      d.blade.quaternion.slerpQuaternions(d.from.q, d.to.q, k);
    }
    /* the other ronin: the hat slides off the bowed head at 1.9 s, lands on its rim and rolls in an arc, then tips flat */
    if (!lord) {
      if (!d.hat && d.t > 1.9) { d.hat = detachHat() || { g: null }; if (d.hat.g) { d.hat.dir = _m3.copy(_f).applyAxisAngle(_Y, 0.85 + 0.9).clone(); d.hat.t0 = d.t; } }
      const h = d.hat; if (h?.g) {
        const u = d.t - h.t0; const gy = d.pos.y || 0;
        const drop = Math.min(1, u / 0.45); const roll = Math.max(0, u - 0.45); const dist = 1.9 * (1 - Math.exp(-roll * 1.2)); const ang = roll * 0.9;
        const dir = _m4.copy(h.dir).applyAxisAngle(_Y, ang * 0.5);
        h.g.position.copy(h.from).addScaledVector(dir, 0.35 * drop + dist); h.g.position.y = drop < 1 ? lerp(h.from.y, gy + 0.32, drop * drop) : gy + 0.32 * (1 - sstep(1.4, 2.0, roll)) + 0.05;
        /* on its rim: the brim stands up (90 degrees about the side axis), spins as it rolls, then falls flat */
        const side = _r.set(dir.z, 0, -dir.x); const up = sstep(0.1, 0.5, u) * (1 - sstep(1.4, 2.0, roll));
        _q.setFromAxisAngle(side, up * Math.PI / 2 + (1 - up) * (roll > 1.4 ? -0.05 : 0.6 * drop)); _q2.setFromAxisAngle(_Y, ang + dist * 2.2);
        h.g.quaternion.copy(_q).multiply(_q2).multiply(h.q0);
        if (!h.landed && roll > 1.95) { h.landed = true; H.shake = Math.max(H.shake, 0.06); }
      }
    }
  };
  H.dispose = () => { if (death?.blade) death.blade.removeFromParent(); acting?.dispose(); if (petals) { petals.m.removeFromParent(); petals.geo.dispose(); petals.mat.dispose(); petals = null; } for (const f of H.disposers) f(); };
  H.prewarm = () => {};
  return H;
}
const lerp = (a, b, t) => a + (b - a) * t;

/* ================================================================ skyNemesis */
/* the far shapes were cylinders and cones (a tower of a man; the Lord at half size hid behind his own keep).
   Now the real rig in the nemesis look, one dark silhouette with a moonlit rim (web/src/worlds/sky-figure.js):
   lord:  the Lord looms behind his keep and to its side, 84 m: the horned kabuto and its two kuwagata blades, the wide sode, the
          sashimono on his back, the nodachi planted point-down in the ground before him under his right hand, the hakama
          moving in the night wind, two dim embers in the oni menpo's eyes; his head turns to the walker.
   other: the Other Ronin far down the road, 30 m: the deep kasa, kimono and hakama in the wind, the katana held low and
          back in his right hand, a still wide stance. Mist drifts round the feet of both. */
const EDO_WEAR = '/assets/real/wear_edo.glb';
export async function skyNemesis(nemesisId, ctx) {
  if (nemesisId !== 'lord' && nemesisId !== 'other') return null;
  const n = worldById('edo').nemeses.find((x) => x.id === nemesisId); if (!n) return null;
  const lord = nemesisId === 'lord';
  return skyFigure(ctx, {
    look: n.look, wearUrl: EDO_WEAR, height: lord ? 66 : 30, dist: lord ? 160 : 210, side: lord ? 30 : 0, /* the Lord nearer (was 84 m at 330 m) and clear of the keep. the post fog grows with distance (about 48 % at 220 m, 38 % at 160 m), so he stands nearer again, a little smaller, and inside the walk frame (side 30 m, clear of the keep on the line) */ clip: 'Idle_Loop', speed: 0.35,
    color: lord ? 0x040304 : 0x0b090c, wind: ['Hakama', 'Kimono', 'Kimono_open'], windAmp: lord ? 0.06 : 0.12, windTop: 1.0, windBottom: 0.2,
    stance: lord ? 0.13 : 0.17, lean: lord ? 0.02 : 0.1, arms: lord ? [0.2, 0.05] : [0.12, 0.22], crown: lord ? 0.62 : 0.22,
    dust: 0x6a6070, dustOp: 0.4, dustN: 12,
    weapon: lord ? nodachiFar : katanaFar, weaponRot: lord ? [0.22, 0, 0] : [-0.55, 0, -0.3],
    extras: lord ? oniEyes : null,
  });
}
/* the far blades (metres at human size, the grip at the origin, the point down -y) */
function bladeFar(T, mat, geos, len, w) {
  const g = new T.Group();
  const sh = new T.Shape(); sh.moveTo(-w / 2, 0); sh.quadraticCurveTo(-w * 0.6, -len * 0.5, -w * 0.1, -len); sh.lineTo(w / 2, -len * 0.88); sh.quadraticCurveTo(w * 0.5, -len * 0.5, w / 2, 0); sh.closePath();
  const bg = new T.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }); bg.translate(0, -0.06, -0.006); geos.push(bg); g.add(new T.Mesh(bg, mat));
  const tg = new T.CylinderGeometry(0.045, 0.045, 0.015, 10); tg.translate(0, -0.055, 0); geos.push(tg); g.add(new T.Mesh(tg, mat)); /* tsuba */
  const hg = new T.CylinderGeometry(0.017, 0.017, len * 0.28, 6); hg.translate(0, len * 0.12, 0); geos.push(hg); g.add(new T.Mesh(hg, mat));
  return g;
}
function nodachiFar(T, mat, geos) { return bladeFar(T, mat, geos, 1.45, 0.05); }
function katanaFar(T, mat, geos) { return bladeFar(T, mat, geos, 0.78, 0.04); }
/* the Lord's eyes: two dim embers behind the oni menpo, breathing slowly */
function oniEyes({ add, sprite, H, headPos }) {
  const M = H / 1.95; const eyes = [-1, 1].map(() => { const sp = sprite(0xff3a1a, M * 0.075, { add: true, fog: false }); add(sp); return sp; });
  const P = new THREE.Vector3();
  return {
    update(dt, t, f) {
      headPos(P);
      eyes.forEach((sp, i) => { sp.position.set(P.x + (i ? 1 : -1) * M * 0.035, P.y + M * 0.02, P.z + M * 0.12); sp.material.opacity = f * (0.8 + 0.2 * Math.sin(t * 0.7)); });
    },
  };
}

/* ================================================================ dressFoe: seeded variety for plain foes
   Two foes of one kind never wear the same set: each picks its own head, its own robe, a missing kote or shin guard, its
   own cloth tone, and starts its idle at its own time (no two in step). */
/* bare heads get a Face (skin, brows, eyes, nose, mouth, stubble) and hair (a wild mop under the headband for a
   bandit, a chonmage for a retainer); hoods show eyes in their slit (wear_edo.glb). The headband sits on the skull. */
/* the beige hood was a
   bandit's cloth mask (the bandit's cloth dyed toward the land's mud), so bandits no longer wear it. A bandit is now one of
   three men, each with his own head, robe colours, skin, build and stance (like frontier-foes.js):
     brawler: hachimaki over a wild mop, open robe and bare chest, rust or ochre cloth, broad and hunched forward;
     kasa:    a straw kasa over a face, closed robe in indigo or grey-blue, tall and lean, head down under the brim;
     shaved:  a shaved pate and topknot, closed robe in dark brown or faded green, short and stocky, a low wide crouch.
   The shinobi wears dark indigo from the hood (wear_edo.glb EDO_ClothShinobi) to the hakama, and dark kote. */
const FOE_SETS = {
  warrior: { heads: [['Helm_kettle', 'Menpo'], ['Helm_kettle'], ['Headband', 'Menpo', 'Face', 'Hair_knot'], ['Helm_sallet', 'Menpo', 'Face']], robes: [['Kimono']], drop: ['ForeArmL', 'ForeArmR'] },
  /* three shinobi (the black hood; the hood with a cloth mask over it; a bare-headed one, headband and mask) and three
     oni (the red mask, an indigo one, a black one, each on its own frame) */
  rogue: { heads: [['Zukin_black'], ['Zukin_black'], ['Headband', 'Menpo', 'Face', 'Hair_wild']], robes: [['Kimono']], drop: ['ForeArmL', 'ForeArmR'] },
  brute: { heads: [['Mask_oni']], robes: [['Kimono_open'], []], drop: ['Fauld', 'ShinL'] },
};
const BANDITS = [
  { head: ['Headband', 'Face', 'Hair_wild'], robe: 'Kimono_open', cloth: [0x6a2a18, 0x7a4a1c, 0x5a2414], band: [0xd8d0bc, 0x8a2016, 0xb8a888], hakama: [0x2a2620, 0x3a3026],
    build: [1.1, 0.95], pose: { hunch: 0.26, lift: -0.16, lean: 0.06 } },
  { head: ['Helm_sallet', 'Face'], robe: 'Kimono', cloth: [0x1e2a44, 0x2a3446, 0x30384a], hakama: [0x1c1e26, 0x2a2a30],
    build: [0.93, 1.06], pose: { hunch: 0.04, lift: 0.14, lean: -0.04 } },
  { head: ['Face', 'Hair_knot'], robe: 'Kimono', alt: 'Kimono_open', cloth: [0x3a2a1c, 0x34402a, 0x2a2420], hakama: [0x3a3228, 0x2a2e26],
    build: [1.06, 0.92], pose: { hunch: 0.18, lift: -0.04, lean: -0.08, drop: 0.12 } },
];
const SKIN = [0x6a4c38, 0x7c5a42, 0x5a3e2e, 0x86664a];
const HEAD_PARTS = ['Headband', 'Mask_cloth', 'Helm_sallet', 'Helm_kettle', 'Menpo', 'Zukin_black', 'Mask_oni', 'Face', 'Hair_wild', 'Hair_knot'];
const ROBE_PARTS = ['Kimono', 'Kimono_open'];
let BANDIT_N = Math.floor(Math.random() * 3); /* the bandits of one wave take the three men in turn, so a pack of three is never two of one */
const ONI = [0x7a2a20, 0x24305a, 0x1c1a1c];
/* a captain carries the sashimono and the gilt kuwagata; red lacquer pauldrons over any kind (worlds/foe-look.js) */
const E_STYLE = {
  matte: { metal: { rough: 0.5, env: 0.35 }, cloth: { rough: 0.92, env: 0.16 } },
  rank(actor, foeId, kit) {
    const show = (p) => { for (const m of actor.parts.get(p) || []) m.visible = true; };
    show('Sashimono'); if (foeId === 'warrior') { show('Helm_kettle'); show('Kuwagata'); for (const p of ['Headband', 'Hair_knot', 'Helm_sallet']) for (const m of actor.parts.get(p) || []) m.visible = false; }
    return [kit.pauldrons(actor, 0x6a1410, { r: foeId === 'brute' ? 0.2 : 0.16, metal: 0.2, rough: 0.45, trim: 0xa8863a }), kit.sash(actor, 0xb8a888, { w: 0.05 })];
  },
};
export function dressFoe(actor, foeId, ctx = {}) {
  if (!actor.parts) return null;
  const R = foeRng(ctx, foeId); const pick = R.pick; const vi = R.variant(3);
  const show = (p, on) => { for (const m of actor.parts.get(p) || []) m.visible = on; };
  const paint = (re, hex, k = 1) => { const done = new Set(); for (const m of actor.meshes || []) { const mt = m.material; if (!mt?.color || done.has(mt) || !re.test(mt.name || '')) continue; done.add(mt); mt.color.set(hex).multiplyScalar(k); } };
  const paintPart = (part, re, hex) => { for (const m of actor.parts.get(part) || []) if (m.material?.color && re.test(m.material.name || '')) m.material.color.set(hex); };
  const lift = 0.9 + Math.random() * 0.2;
  const po = actor.posture; const r = () => Math.random() - 0.5;
  if (foeId === 'minion') {
    /* a captain shows his face and his sashimono, so he is never the kasa man (the brim hides both) */
    let bi = ctx.seed != null ? vi : BANDIT_N++ % 3; if (ctx.captain && bi === 1) bi = 0;
    const B = BANDITS[bi];
    for (const p of HEAD_PARTS) if (actor.parts.has(p)) show(p, B.head.includes(p));
    const robe = B.alt && Math.random() < 0.35 ? B.alt : B.robe; for (const p of ROBE_PARTS) if (actor.parts.has(p)) show(p, p === robe);
    if (Math.random() < 0.4) show(pick(['ShinL', 'Wraps']), false);
    const skin = pick(SKIN);
    paint(/^SQ_Cloth/, pick(B.cloth), lift); paint(/^EDO_Hakama/, pick(B.hakama), lift); paint(/^EDO_Skin/, skin);
    for (const m of actor.parts.get('Mannequin') || []) m.material?.color?.set(skin);
    if (B.band) paintPart('Headband', /^EDO_ClothCream/, pick(B.band));
    if (actor.model) { const s = actor.model.scale; s.set(s.x * B.build[0] * (0.97 + Math.random() * 0.06), s.y * B.build[1] * (0.98 + Math.random() * 0.04), s.z * B.build[0] * (0.97 + Math.random() * 0.06)); }
    if (po) { const P = B.pose; po.hunch = P.hunch + r() * 0.08; po.lift = P.lift + r() * 0.06; po.lean = (P.lean || 0) + r() * 0.06; po.drop = (P.drop || 0) + r() * 0.16; po.tilt = r() * 0.3; po.turn = r() * 0.4; }
  } else {
    const set = FOE_SETS[foeId]; if (!set) return null;
    const head = set.heads.length === 3 ? set.heads[vi] : pick(set.heads); for (const p of HEAD_PARTS) if (actor.parts.has(p)) show(p, head.includes(p));
    if (set.robes.length > 1) { const robe = pick(set.robes); for (const p of ROBE_PARTS) if (actor.parts.has(p)) show(p, robe.includes(p)); }
    if (Math.random() < 0.45) show(pick(set.drop), false);
    if (foeId === 'rogue') {
      /* indigo head to foot: the fight dyes look cloth toward the land's mud (it read beige), so set it after the look */
      { const C = [[0x1a2136, 0x161a28, 0x1e2640], [0x2a2a2c, 0x1c1c1e, 0x303032], [0x2e1a18, 0x1e1414, 0x3a2020]][vi]; paint(/^SQ_Cloth/, C[0], lift); paint(/^EDO_Hakama/, C[1], lift); paint(/^EDO_ClothShinobi/, C[2], lift); } /* indigo, charcoal, dried-blood brown */
      paint(/metal_plate/, 0x1a181c); paint(/^EDO_WrapsLeather/, 0x24262e);
      if (po) { po.hunch = 0.12 + Math.random() * 0.12; po.lift = -po.hunch * 0.4; po.tilt = r() * 0.3; }
    } else {
      if (foeId === 'brute') { paint(/OniMask/, ONI[vi]); if (po) { po.hunch = 0.3 + vi * 0.08; po.lift = -po.hunch * 0.7; } }
      /* cloth tone: a small turn of hue and a lighter or darker dye, per foe (materials are the actor's own) */
      const dh = (Math.random() - 0.5) * 0.06; const dl = (Math.random() - 0.5) * 0.08; const done = new Set();
      for (const m of actor.meshes || []) { const mt = m.material; if (!mt || done.has(mt) || !/Cloth/i.test(mt.name || '')) continue; done.add(mt); mt.color?.offsetHSL(dh, 0, dl); }
    }
  }
  /* the idle clock: each looped clip runs at its own pace and the first one starts at its own time */
  const pace = 0.88 + Math.random() * 0.24;
  const play = actor.play.bind(actor);
  actor.play = (name, opt = {}) => play(name, opt.loop === false ? opt : { ...opt, speed: (opt.speed ?? 1) * pace });
  let t0 = 0.2 + Math.random() * 1.6;
  const unbuild = foeId === 'brute' ? build(actor, [HEAVY, { ...HEAVY, spine_03: 1.2, upperarm_l: 1.18, upperarm_r: 1.18 }, { ...HEAVY, spine_02: 1.14, thigh_l: 1.16, thigh_r: 1.16 }][vi]) : null;
  const fin = finishFoe(actor, foeId, ctx, E_STYLE, R);
  return { update(dt, s) { if (t0 > 0 && actor.mixer) { const k = Math.min(t0, 0.4); t0 -= k; actor.mixer.update(k); } fin.update(dt, s); }, onDeath() {}, dispose() { actor.play = play; fin.dispose(); unbuild?.(); } };
}

/* a four-point star with a soft core: the blade's glint at the top of a wind-up */
function glintTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,236,200,0.6)'); r.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 5], [5, 128], [70, 3], [3, 70]]) { const lg = g.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2); lg.addColorStop(0, 'rgba(255,240,210,0)'); lg.addColorStop(0.5, 'rgba(255,250,235,0.95)'); lg.addColorStop(1, 'rgba(255,240,210,0)'); g.fillStyle = lg; g.save(); if (w === 70 || h === 70) { g.translate(64, 64); g.rotate(Math.PI / 4); g.translate(-64, -64); } g.fillRect(64 - w / 2, 64 - h / 2, w, h); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

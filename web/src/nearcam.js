import * as THREE from 'three';
import { FOLK_LIVE } from './props/folk.js';
/* ---------- ONE near-frame system ----------
   One system controls what touches the camera. Separate pieces (a
   0.85 m dither fade on foes, a per-foe stand-off, the camera back-off, companions that faded inside 2.3 m, a dog that hid
   inside 2.2 m) did not add up: straw hats, a shoulder through the katana, see-through companions,
   a stake or a drone in the lens, plates in the sky or on the wrong thing.
   The rule here: a PROTECTED VOLUME in front of the lens, a slice of the view out to DEPTH (1.5 m) at the centre of the view and
   EDGE x DEPTH at the frame edge, plus a LENS ball (0.35 m) all round. Every dynamic thing has a class and a rule:
     foe, boss, drone   pushed back: f.nearPad grows the foe's keep-out (fight.holdOff) until it stands clear; never hidden,
                        never a ghost (the old dither in world.js addNearFade stays as the last guard only).
     companion          steps aside out of the view cone at a walk; a companion still inside is HIDDEN (not faded).
     crowd, kept folk   hidden while inside.
     corpse             hidden while inside (the whole body with its gear).
     debris             each piece hidden while inside.
     quest prop         each small piece (under 0.9 m: pickups, markers, rings, chain links, ribbons, chevrons) hidden
                        while inside; tall posts keep out by placement (fight.propRad, journey solids).
   Hiding moves the meshes to a layer the camera does not draw (HIDE_LAYER), so it never fights code that sets `visible`.
   Cinema (the death director, walk arrivals and chapter beats, the death camera): a GPU probe renders the view with
   far = 1.5 m and flat colour; if more than 2 % of the centre is covered, the camera backs (and rises) along its own axis
   to the first spot that is clear, at once on a cut, smoothly inside a shot (the camera inside the Giant's head, grass on
   the lens).
   Plates: plateTarget() picks the foe whose plate shows (the one at the reticle, nearer wins, a foe hidden behind a nearer
   body never), plateAnchor() pins it to the head bone; tagBlocked() hides a companion tag whose figure is hidden, at the
   elbow (< 3.2 m), off screen, behind a wall or another body, or whose tag would sit on the HUD, a caption or the foe plate. */
export const NEAR = { DEPTH: 1.5, EDGE: 0.65, LENS: 0.35, HIDE_LAYER: 30, CINE_COVER: 0.02 };
const _q = new THREE.Vector3(); const _w = new THREE.Vector3(); const _v = new THREE.Vector3(); const _s = new THREE.Vector3(); const _m = new THREE.Matrix4();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const BONES = ['head', 'Head', 'neck_01', 'spine_03', 'spine_01', 'pelvis', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
const BONE_R = { head: 0.42, Head: 0.42, neck_01: 0.3, spine_03: 0.34, spine_01: 0.3, pelvis: 0.3, upperarm_l: 0.16, upperarm_r: 0.16, lowerarm_l: 0.13, lowerarm_r: 0.13, hand_l: 0.12, hand_r: 0.12, thigh_l: 0.16, thigh_r: 0.16, calf_l: 0.13, calf_r: 0.13, foot_l: 0.12, foot_r: 0.12 };
const KEEP_SEL = ['#who', '#vitals', '#banner', '#line', '#chapter', '#hint', '#lane', '.boss-ui', '.task-ui'];

/* the share of the centre 60 % of a view covered by anything within NEAR.DEPTH of the lens, for each spot place(i) puts the
   camera on (flat colour; no glows, particles, sprites, lines, mist sheets or the camera's own children) */
const PROBE = { P: null };
/* place(i) moves the camera to the i-th spot (false = no more); got(i, cover) returns true to try the next spot */
export function lensProbe(R, scene, cam, place, got) {
  if (!R || !scene) return;
  const P = PROBE.P || (PROBE.P = { rt: new THREE.WebGLRenderTarget(64, 36), mat: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false }), buf: new Uint8Array(64 * 36 * 4), c: new THREE.PerspectiveCamera() });
  const off = [];
  scene.traverse((o) => { if (!o.visible) return; if (o.isPoints || o.isSprite || o.isLine) { off.push(o); return; } if (o.isMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; const big = m?.transparent && (o.geometry?.boundingSphere?.radius || 0) > 30; if (!m || big || m.blending === THREE.AdditiveBlending || (m.transparent && m.opacity < 0.04)) off.push(o); } });
  for (const o of cam.children) if (o.visible) off.push(o);
  for (const o of off) o.visible = false;
  const c = P.c; c.copy(cam, false); c.far = NEAR.DEPTH; c.near = Math.min(cam.near, 0.05); c.updateProjectionMatrix(); c.matrixAutoUpdate = false; c.matrixWorldAutoUpdate = false;
  const bg = scene.background; const fog = scene.fog; const ov = scene.overrideMaterial; const rt0 = R.getRenderTarget(); const cc = R.getClearColor(new THREE.Color()); const ca = R.getClearAlpha(); const sa = R.shadowMap.autoUpdate;
  scene.background = null; scene.fog = null; scene.overrideMaterial = P.mat; R.shadowMap.autoUpdate = false;
  try {
    for (let i = 0; place(i); i++) {
      c.matrixWorld.copy(cam.matrixWorld); c.matrixWorldInverse.copy(cam.matrixWorldInverse);
      R.setRenderTarget(P.rt); R.setClearColor(0x000000, 1); R.clear(); R.render(scene, c); R.readRenderTargetPixels(P.rt, 0, 0, 64, 36, P.buf);
      let n = 0; let hit = 0; for (let y = 7; y < 29; y++) for (let x = 13; x < 51; x++) { n++; if (P.buf[(y * 64 + x) * 4] > 20) hit++; }
      if (!got(i, hit / n)) break;
    }
  } finally {
    R.setRenderTarget(rt0); R.setClearColor(cc, ca); R.shadowMap.autoUpdate = sa; scene.background = bg; scene.fog = fog; scene.overrideMaterial = ov;
    for (const o of off) o.visible = true;
  }
}


/* for a still shot made outside a fight (the end card, a portrait): back the camera off along its own axis, and up a little,
   to the first spot where nothing covers the centre of the lens within 1.5 m. Returns the cover left (0..1). */
export function clearLens(R, scene, cam) {
  const base = cam.position.clone(); const q = cam.quaternion; const tries = [[0, 0], [0.15, 0.4], [0.3, 0.9], [0.45, 1.5], [0.6, 2.2]]; let best = 0; let bc = 2;
  lensProbe(R, scene, cam, (i) => { if (i >= tries.length) return false; cam.position.copy(base).add(_v.set(0, tries[i][0], tries[i][1]).applyQuaternion(q)); cam.updateMatrixWorld(); return true; }, (i, c) => { if (c < bc) { bc = c; best = i; } return c > NEAR.CINE_COVER; });
  cam.position.copy(base).add(_v.set(0, tries[best][0], tries[best][1]).applyQuaternion(q)); cam.updateMatrixWorld(); return bc;
}

export class NearCam {
  constructor(fight) {
    this.f = fight; this.hidden = new Map(); /* object -> { last: clock it was last inside } */ this.masks = new Map();
    this.n = 0; this.keep = []; this.vi = new THREE.Matrix4(); this.cOff = new THREE.Vector3(); this.cWant = new THREE.Vector3(); this.cBase = null;
    this.bones = new WeakMap(); this.spheres = new WeakMap(); this.inst = new Map(); this.stats = { hidden: 0, pushed: 0, cine: 0 };
  }
  /* ---------- the protected volume ---------- */
  setCam(cam) {
    cam.updateMatrixWorld(); this.vi.copy(cam.matrixWorldInverse); this.cam = cam;
    const t = Math.tan((cam.fov * Math.PI) / 360); this.ty = t; this.tx = t * cam.aspect;
  }
  /* metres a sphere (world centre p, radius r) reaches into the volume; 0 = clear */
  intr(p, r) {
    _q.copy(p).applyMatrix4(this.vi);
    const dist = _q.length(); if (dist - r < NEAR.LENS) return NEAR.LENS - (dist - r) + 0.01;
    const depth = -_q.z; if (depth + r <= 0.05) return 0;
    const dz = Math.max(depth, 0.08); const nx = _q.x / (dz * this.tx); const ny = _q.y / (dz * this.ty); const ex = (r * 1.15) / (dz * this.tx); const ey = (r * 1.15) / (dz * this.ty);
    const ox = Math.abs(nx) - ex; const oy = Math.abs(ny) - ey; if (ox > 1 || oy > 1) return 0;
    const rn = clamp(Math.hypot(Math.max(0, ox), Math.max(0, oy)), 0, 1);
    const lim = NEAR.DEPTH * (1 - (1 - NEAR.EDGE) * rn);
    const into = lim - (depth - r); return into > 0 ? into : 0;
  }
  bonesOf(root) {
    let b = this.bones.get(root); if (b) return b; b = [];
    const seen = new Set(); for (const n of BONES) { const o = root.getObjectByName(n); if (o && !seen.has(o)) { seen.add(o); b.push([o, BONE_R[n] || 0.15]); } }
    this.bones.set(root, b); return b;
  }
  /* the deepest reach of an actor's body (bones; scale = the actor's size) */
  actorIntr(root, scale = 1, extra = 0) {
    let m = 0; for (const [o, r] of this.bonesOf(root)) { _w.setFromMatrixPosition(o.matrixWorld); const k = this.intr(_w, r * scale + extra); if (k > m) m = k; } return m;
  }
  /* a mesh's own sphere in world space (geometry bound x the largest world scale) */
  meshSphere(o, out) {
    const g = o.geometry; if (!g) return 0; if (!g.boundingSphere) g.computeBoundingSphere(); const bs = g.boundingSphere; if (!bs) return 0;
    out.copy(bs.center).applyMatrix4(o.matrixWorld); _s.setFromMatrixScale(o.matrixWorld); return bs.radius * Math.max(_s.x, _s.y, _s.z);
  }
  /* the deepest reach of any small mesh under root (cap = the largest radius that counts; bigger pieces are structure) */
  groupIntr(root, cap = 1.2, near = 4) {
    let m = 0; const cp = this.cam.position;
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
      const e = o.matrixWorld.elements; const dx = e[12] - cp.x; const dy = e[13] - cp.y; const dz = e[14] - cp.z; if (dx * dx + dy * dy + dz * dz > near * near) return;
      const r = this.meshSphere(o, _v); if (r > cap) return; const k = this.intr(_v, r); if (k > m) m = k;
    });
    return m;
  }
  /* the rigid meshes under an actor (gear, dress parts), each as three spheres along its long axis (cached in local space) */
  rigidIntr(root) {
    let m = 0; const cp = this.cam.position;
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.visible) return;
      let P = this.spheres.get(o);
      if (!P) { const g = o.geometry; if (!g) return; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox; const sz = b.getSize(new THREE.Vector3()); const c = b.getCenter(new THREE.Vector3());
        const ax = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z'; const rest = [sz.x, sz.y, sz.z].sort((p, q) => q - p); const r = Math.max(0.04, rest[1] / 2);
        P = []; const n = Math.max(2, Math.min(6, Math.ceil(sz[ax] / Math.max(0.2, 2 * r)) + 1)); for (let i = 0; i < n; i++) { const p = c.clone(); p[ax] = b.min[ax] + (sz[ax] * i) / (n - 1); P.push(p); } P.r = r; this.spheres.set(o, P); }
      const e = o.matrixWorld.elements; const dx = e[12] - cp.x; const dy = e[13] - cp.y; const dz = e[14] - cp.z; if (dx * dx + dy * dy + dz * dz > 64) return;
      _s.setFromMatrixScale(o.matrixWorld); const sc = Math.max(_s.x, _s.y, _s.z);
      for (const p of P) { _w.copy(p).applyMatrix4(o.matrixWorld); const k = this.intr(_w, P.r * sc); if (k > m) m = k; }
    });
    return m;
  }
  /* hide by layer, restore exactly */
  hide(o, clock) {
    const h = this.hidden.get(o); if (h) { h.last = clock; return; }
    this.hidden.set(o, { last: clock }); o.traverse((x) => { if (!this.masks.has(x)) this.masks.set(x, x.layers.mask); x.layers.mask = 1 << NEAR.HIDE_LAYER; });
  }
  show(o) {
    this.hidden.delete(o); o.traverse((x) => { const m = this.masks.get(x); x.layers.mask = m ?? 1; this.masks.delete(x); });
  }
  isHidden(o) { for (let q = o; q; q = q.parent) if (this.hidden.has(q)) return true; return false; }

  /* ---------- each frame, after the camera is final ---------- */
  frame(cam, dt) { const t0 = performance.now(); try { this.frame0(cam, dt); } finally { const ms = performance.now() - t0; this.ms = this.ms == null ? ms : this.ms * 0.98 + ms * 0.02; this.msMax = Math.max(this.msMax || 0, ms); } } /* cost, read by tests */
  frame0(cam, dt) {
    const f = this.f; this.n++; const clock = f.clock || 0; this.setCam(cam);
    const seen = new Set(); const want = (o, k) => { if (k > 0) { this.hide(o, clock); seen.add(o); } };
    /* foes, bosses, drones: pushed back, never hidden. nearPad grows fast while a part is inside, eases off when clear */
    for (const x of f.foes) {
      if (x.state === 'dead') { if (!x.gone && !x.boss) want(x.actor.root, this.actorIntr(x.actor.root, x.scale || 1, 0.05)); continue; } /* the fallen boss is framed by the cinema rule, never hidden */
      if (x.state === 'spawn' || x.gone) continue;
      let k = 0; const extra = x.fly ? 0.55 : x.boss ? 0.1 : 0.12; /* a drone's rotor ring; a hat brim or hood over the head bone */
      try { for (const q of f.clearPts(x)) { if (q.p) _w.copy(q.p).applyMatrix4(q.o.matrixWorld); else { if (!q.o.visible) continue; _w.setFromMatrixPosition(q.o.matrixWorld); } const kk = this.intr(_w, 0.16 * (x.scale || 1) + extra); if (kk > k) k = kk; } } catch { /* a foe mid-dress */ }
      const h = this.actorIntr(x.actor.root, x.scale || 1, x.fly ? 0.4 : 0); if (h > k) k = h;
      const g = this.rigidIntr(x.actor.root); if (g > k) k = g; /* a club, a sledge, a shield, a hat: every rigid piece it carries */
      if (x.boss && k > 0) { /* the camera yields to a boss too (its club comes at the lens faster than the body can be held off) */
        const ax = cam.position.x - x.pos.x; const az = cam.position.z - x.pos.z; const al = Math.hypot(ax, az) || 1;
        const y = this.yieldV || (this.yieldV = new THREE.Vector3()); const amt = Math.min(1.4, (this.yieldA || 0) + k * Math.min(1, dt * 12)); this.yieldA = amt; y.set((ax / al) * amt, 0, (az / al) * amt); this.yieldT = clock; }
      const base = x.nearBase ?? 0; const cap = x.boss ? 1.2 : clamp((x.reach || 1.6) + 0.55 - base, 0.3, 0.9);
      x.nearPad = k > 0 ? Math.min(cap, (x.nearPad || 0) + Math.max(k, 0.05) * Math.min(1, dt * 14)) : Math.max(0, (x.nearPad || 0) - dt * 0.35);
      if (k > 0) this.stats.pushed++;
    }
    /* the boss yield eases back in 0.5 s after the last touch */
    if (this.yieldA > 0) { if (clock - (this.yieldT || 0) > 0.5) this.yieldA = Math.max(0, this.yieldA - dt * 1.2); if (this.yieldA > 0.005 && !this.cineOn()) { this.yieldV.setLength(this.yieldA); cam.position.add(this.yieldV); this.setCam(cam); } }
    /* companions: a step aside out of the view cone, then hidden if still inside */
    const fw = f.forward(); const fl = Math.hypot(fw.x, fw.z) || 1; const fx = fw.x / fl; const fz = fw.z / fl;
    for (const c of f.comp?.list || []) {
      if (!c.object3D || !c.position) continue;
      const free = !['taking', 'taken', 'held', 'boss'].includes(c.state) && !f.deathCam;
      if (free) {
        const ax = c.position.x - cam.position.x; const az = c.position.z - cam.position.z; const along = ax * fx + az * fz; const side = ax * -fz + az * fx;
        const halfW = 0.95 + Math.max(0, along) * 0.55; /* the cone a body must leave: about the centre 60 % of a 70 degree view */
        if (along > -0.4 && along < 3.0 && Math.abs(side) < halfW) { const sg = side >= 0 ? 1 : -1; const step = Math.min(halfW - Math.abs(side) + 0.05, 4.5 * dt); c.position.x += -fz * sg * step; c.position.z += fx * sg * step; }
      }
      want(c.object3D, this.compIntr(c));
    }
    /* the road's people and any other folk (journey crowds, the kept stranger) */
    /* cost: the crowd, debris, prop and set passes run every third frame (a hidden thing stays hidden 0.2 s, so nothing blinks) */
    const slow = this.n % 3 === 0;
    if (slow) for (const h of FOLK_LIVE) { if (h === f.comp) continue; for (const c of h.list) if (c.object3D) want(c.object3D, this.compIntr(c)); }
    /* debris and quest props: each small piece */
    if (slow) for (const d of f.debris || []) if (d.m && d.m.parent) { const r = this.meshSphere(d.m, _v); want(d.m, this.intr(_v, r)); }
    const props = []; if (slow) for (const p of f.props || []) if (p.group) props.push(p.group); if (slow && f.journey?.group) props.push(f.journey.group);
    for (const g of props) g.traverse((m) => {
      if (!m.isMesh || m.isSkinnedMesh) return;
      if (m.isInstancedMesh) { if (m.count <= 400) this.instHide(m); return; } /* a chain: only the links in the lens go */
      const e = m.matrixWorld.elements; const dx = e[12] - cam.position.x; const dy = e[13] - cam.position.y; const dz = e[14] - cam.position.z; if (dx * dx + dy * dy + dz * dz > 16) return;
      const r = this.meshSphere(m, _v); if (r <= 0.9) want(m, this.intr(_v, r)); /* a pickup, a ring, a ribbon, a chevron; a tall post keeps out by placement */
    });
    /* the land's own small pieces (a banner pole, a lantern, a fence post, a rock) that stand still: hidden while in the lens */
    if (slow) for (const m of this.setNear(cam)) { if (m.isInstancedMesh) this.instHide(m); else { const r = this.meshSphere(m, _v); want(m, this.intr(_v, r)); } }
    /* restore what has been clear for 0.2 s (no flicker at the edge) */
    for (const [o, h] of this.hidden) if (!seen.has(o) && (clock - h.last > 0.2 || !o.parent)) this.show(o);
    this.stats.hidden = this.hidden.size;
    this.cine(cam, dt);
  }
  /* an instanced prop (chain links): each instance in the lens is scaled to nothing, and put back when clear (unless its own code
     has set a new matrix meanwhile) */
  instHide(m) {
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!m.boundingSphere) m.computeBoundingSphere();
    const cp = this.cam.position; _v.copy(m.boundingSphere.center).applyMatrix4(m.matrixWorld); _s.setFromMatrixScale(m.matrixWorld); const ms = Math.max(_s.x, _s.y, _s.z);
    let st = this.inst.get(m); if (_v.distanceTo(cp) > m.boundingSphere.radius * ms + 3 && !st?.size) return;
    if (!st) { st = new Map(); this.inst.set(m, st); }
    const r0 = g.boundingSphere.radius; let changed = false; const M = this._im || (this._im = new THREE.Matrix4()); const Z = this._iz || (this._iz = new THREE.Matrix4().makeScale(0, 0, 0));
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, M); const sv = st.get(i); const zero = M.elements[0] === 0 && M.elements[5] === 0 && M.elements[10] === 0;
      if (sv && !zero) st.delete(i);
      const real = sv && zero ? sv : M;
      _w.copy(g.boundingSphere.center).applyMatrix4(real).applyMatrix4(m.matrixWorld); _s.setFromMatrixScale(real);
      const k = this.intr(_w, r0 * Math.max(_s.x, _s.y, _s.z) * ms);
      if (k > 0 && !(sv && zero)) { st.set(i, M.clone()); m.setMatrixAt(i, Z); changed = true; }
      else if (k <= 0 && sv && zero) { m.setMatrixAt(i, sv); st.delete(i); changed = true; }
    }
    if (changed) m.instanceMatrix.needsUpdate = true;
  }
  instRestore() { for (const [m, st] of this.inst) { for (const [i, sv] of st) m.setMatrixAt(i, sv); if (st.size) m.instanceMatrix.needsUpdate = true; } this.inst.clear(); }
  /* static set pieces near the lens: every 3 s the scene is walked once; a mesh of 0.05..3 m that is not a body, a prop, a
     companion or under the camera, and that stood in the same place at the last walk, goes into a 4 m grid. Each frame only the
     cells round the camera are tested. Something that moves (a boss's club, a dress part) never qualifies. */
  setNear(cam) {
    const f = this.f; const now = f.clock || 0;
    if (!this.grid || now - this.gridT > 3 || now < this.gridT) {
      this.gridT = now; const scene = f.world.scene; const skip = new Set([cam]);
      for (const x of f.foes) skip.add(x.actor.root); for (const h of FOLK_LIVE) for (const c of h.list) if (c.object3D) skip.add(c.object3D);
      for (const c of f.comp?.list || []) if (c.object3D) skip.add(c.object3D); for (const p of f.props || []) if (p.group) skip.add(p.group); if (f.journey?.group) skip.add(f.journey.group);
      const prev = this.lastPos || new Map(); const pos = new Map(); const grid = new Map();
      const walk = (o) => {
        if (skip.has(o)) return;
        if (o.isMesh && !o.isSkinnedMesh) {
          const e = o.matrixWorld.elements; const key = `${e[12].toFixed(2)},${e[13].toFixed(2)},${e[14].toFixed(2)}`; pos.set(o, key);
          if (prev.get(o) === key) {
            let ok = false;
            if (o.isInstancedMesh) ok = o.count <= 400 && (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere)).radius < 3;
            else { const r = this.meshSphere(o, _v); ok = r > 0.05 && r < 3; }
            const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || m.blending === THREE.AdditiveBlending || (m.transparent && m.opacity < 0.05)) ok = false;
            /* never a piece of the ground (a road slab, a paddy plot, a decal): only what stands higher than 0.6 m over the land */
            if (ok) { const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = this._bb || (this._bb = new THREE.Box3()); bb.copy(g.boundingBox); if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); bb.copy(o.boundingBox); } bb.applyMatrix4(o.matrixWorld);
              const gy = f.journey ? f.journey.gy((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2) : 0; if (bb.max.y < gy + 0.6 || bb.max.y - bb.min.y < 0.3) ok = false; }
            if (ok) { if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); _v.copy(o.boundingSphere.center).applyMatrix4(o.matrixWorld); } else this.meshSphere(o, _v); const gk = `${Math.floor(_v.x / 4)},${Math.floor(_v.z / 4)}`; let a = grid.get(gk); if (!a) grid.set(gk, (a = [])); a.push(o); }
          }
        }
        for (const c of o.children) walk(c);
      };
      for (const c of scene.children) walk(c);
      this.lastPos = pos; this.grid = grid;
    }
    const out = this._setOut || (this._setOut = []); out.length = 0; const cx = Math.floor(cam.position.x / 4); const cz = Math.floor(cam.position.z / 4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = this.grid.get(`${cx + i},${cz + j}`); if (a) for (const m of a) if (m.parent) out.push(m); }
    return out;
  }
  compIntr(c) {
    if (c.actor) return this.actorIntr(c.actor.root, c.object3D.scale?.y || 1, 0.04);
    if (c.hound?.D) { let m = 0; const D = c.hound.D; for (const [o, r] of [[D.head, 0.22], [D.neck, 0.2], [D.body, 0.36], [D.tail?.[0], 0.15]]) { if (!o) continue; _w.setFromMatrixPosition(o.matrixWorld); const k = this.intr(_w, r); if (k > m) m = k; } return m; }
    return this.groupIntr(c.object3D, 1.4);
  }

  /* ---------- cinema: the camera never sits in a body or behind a prop at the lens ---------- */
  cineOn() { const f = this.f; const bc = document.body.classList; return !!(f.ddCam || f.deathCam || bc.contains('cine')); }
  cine(cam, dt) {
    if (!this.cineOn()) { this.cBase = null; this.cOff.set(0, 0, 0); return; }
    const base = _s.copy(cam.position);
    const cut = !this.cBase || this.cBase.distanceTo(base) > 0.8; this.cBase = (this.cBase || new THREE.Vector3()).copy(base);
    if (cut || this.n % 10 === 0) {
      const q = cam.quaternion; let best = null; let bc = 2;
      const tries = [[0, 0], [0, 0.6], [0.3, 1.1], [0.5, 1.7], [0.7, 2.5], [0.9, 3.4]];
      this.probe(cam, (i) => {
        if (i >= tries.length) return false; const [up, back] = tries[i];
        _v.set(0, up, back).applyQuaternion(q); cam.position.copy(base).add(_v); cam.updateMatrixWorld(); return true;
      }, (i, cov) => { if (cov < bc) { bc = cov; best = tries[i]; } return cov > NEAR.CINE_COVER; });
      cam.position.copy(base); cam.updateMatrixWorld(); this.cWant.set(0, best ? best[0] : 0, best ? best[1] : 0); this.stats.cine = bc;
      if (cut) this.cOff.copy(this.cWant);
    }
    const k = 1 - Math.exp(-dt * 7); this.cOff.lerp(this.cWant, k);
    if (this.cOff.lengthSq() > 1e-6) { _v.copy(this.cOff).applyQuaternion(cam.quaternion); cam.position.add(_v); cam.updateMatrixWorld(); }
  }
  /* the share of the centre 60 % of the view covered by anything within DEPTH (flat colour, no glow, no particles) */
  probe(cam, place, got) { const w = this.f.world; lensProbe(w.renderer, w.scene, cam, place, got); }

  /* ---------- plates ---------- */
  headOf(x, out) {
    const root = x.actor?.root; const b = root ? this.bonesOf(root).find(([o]) => o.name === 'head' || o.name === 'Head') : null;
    if (b) { out.setFromMatrixPosition(b[0].matrixWorld); return out; }
    const gy = this.f.journey ? this.f.journey.gy(x.pos.x, x.pos.z) : 0; return out.set(x.pos.x, gy + (x.fly ? x.flyY : 1.75 * (x.scale || 1)), x.pos.z);
  }
  /* the plate's anchor: a little over the head bone */
  plateAnchor(x, out) { this.headOf(x, out); out.y += (x.fly ? 0.55 : 0.34) * (x.scale || 1); return out; }
  /* the foe whose plate shows: the locked one, else the one nearest the reticle (nearer foes weigh more); a foe whose head is
     off screen, or behind a nearer body on the same line, never takes the plate */
  plateTarget() {
    const f = this.f; if (f.over) return null; const cam = this.cam || f.world.camera;
    if (f.lock && f.lock.state !== 'dead' && !f.lock.gone) return this.onScreen(f.lock) ? f.lock : null;
    const live = []; for (const x of f.foes) { if (x.state === 'dead' || x.state === 'spawn' || x.gone || x.boss) continue; const d = x.pos.distanceTo(f.pos); if (d > 14) continue; const h = this.headOf(x, new THREE.Vector3()); const mid = new THREE.Vector3(x.pos.x, (h.y + (f.journey ? f.journey.gy(x.pos.x, x.pos.z) : 0)) / 2, x.pos.z); h.project(cam); mid.project(cam); live.push({ x, d, h, mid }); }
    let best = null; let bs = 1e9;
    for (const L of live) {
      if (L.h.z >= 1 || Math.abs(L.h.x) > 0.9 || Math.abs(L.h.y) > 0.92 || Math.abs(L.mid.x) > 0.95) continue;
      /* behind a nearer body: a nearer foe's centre line sits within its width of this head */
      if (live.some((o) => o !== L && o.d < L.d - 0.5 && Math.abs(o.mid.x - L.h.x) < 0.09 * (6 / Math.max(2, o.d)) && L.h.y < o.h.y + 0.05)) continue;
      const atk = L.x.state === 'attack' && L.d < 6 ? 0.12 : 0;
      const s = Math.hypot(L.h.x, (L.h.y - 0.1) * 0.6) + L.d / 18 - atk;
      if (s < bs) { bs = s; best = L.x; }
    }
    return best && bs < 0.95 ? best : null;
  }
  onScreen(x) { const v = this.headOf(x, _w).project(this.cam || this.f.world.camera); return v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95; }
  /* screen rects the plates keep off: the HUD band (bottom 130 px), the HUD and caption boxes, refreshed every 12 frames */
  keepRects() {
    if (this.n - (this.keepN ?? -99) < 12) return this.keep;
    this.keepN = this.n; const out = [{ left: 0, right: innerWidth, top: innerHeight - 130, bottom: innerHeight }];
    for (const sel of KEEP_SEL) for (const el of document.querySelectorAll(sel)) { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.1) continue; const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4) out.push(r); }
    this.keep = out; return out;
  }
  hits(r, list) { for (const k of list) if (r.left < k.right && k.left < r.right && r.top < k.bottom && k.top < r.bottom) return true; return false; }
  /* the foe plate's box (it is drawn centred over x, bottom edge at y: .target-ui is 300 px wide, about 46 px high) */
  plateRect(x, y) { const w = this.f.targetEl?.querySelector('.t-name')?.offsetWidth || 160; return { left: x - w / 2 - 6, right: x + w / 2 + 6, top: y - 46, bottom: y }; }
  plateBlocked(x, y) { return this.hits(this.plateRect(x, y), this.keepRects()); }
  /* a companion tag: hidden when its figure is hidden, at the elbow, off screen, behind a wall or a nearer body, or when it would
     sit on the HUD, a caption or the foe plate */
  tagBlocked(c, L) {
    /* once blocked, a tag waits 0.45 s before it may show again: no blinking at the edge of the HUD band or behind a body */
    const now = this.f.clock || 0; const b = this.tagBlocked0(c, L); if (b) c.nearTagOff = now + 0.45;
    return b || now < (c.nearTagOff || 0);
  }
  tagBlocked0(c, L) {
    const f = this.f; const cam = this.cam || f.world.camera;
    if (!c || this.isHidden(c.object3D) || c.object3D.visible === false) return true;
    const ox = c.position.x - cam.position.x; const oz = c.position.z - cam.position.z; const hd = Math.hypot(ox, oz); if (hd < 3.2) return true;
    _w.copy(c.position); _w.y += c.kind === 'animal' ? 0.45 : 1.1; const mid = _w.project(cam); if (mid.z >= 1 || Math.abs(mid.x) > 0.95 || Math.abs(mid.y) > 0.95) return true;
    const mx = mid.x; const my = mid.y;
    /* a wall or a set piece on the line (journey solids, 2D) */
    for (const s of f.journey?.solids || []) { const r = s.w ? Math.hypot(s.w, s.d) / 2 * 0.8 : s.r; if (!(r > 0.3)) continue; const sx = s.x - cam.position.x; const sz = s.z - cam.position.z; const t = (sx * ox + sz * oz) / (hd * hd); if (t <= 0.05 || t >= 0.95) continue; const px = sx - ox * t; const pz = sz - oz * t; if (px * px + pz * pz < r * r) return true; }
    /* a nearer body (another companion, a foe, a corpse) over the figure on screen */
    const bodies = []; for (const o of f.comp?.list || []) if (o !== c && o.object3D?.visible && !this.isHidden(o.object3D)) bodies.push([o.position, o.kind === 'animal' ? 0.6 : 1.8, 0.45]); for (const x of f.foes) if (!x.gone) bodies.push([x.pos, x.state === 'dead' ? 0.5 : 1.8 * (x.scale || 1), 0.4 * (x.scale || 1)]);
    for (const [p, ht, wd] of bodies) {
      const d = Math.hypot(p.x - cam.position.x, p.z - cam.position.z); if (d >= hd - 0.3) continue;
      const gy = f.journey ? f.journey.gy(p.x, p.z) : 0; _v.set(p.x, gy + ht * 0.5, p.z).project(cam); if (_v.z >= 1) continue;
      const halfW = (wd / Math.max(0.5, d)) / this.tx; const halfH = ((ht * 0.5 + 0.2) / Math.max(0.5, d)) / this.ty;
      if (Math.abs(_v.x - mx) < halfW + 0.02 && Math.abs(_v.y - my) < halfH) return true;
    }
    /* the tag's own box on screen against the HUD, the captions and the foe plate */
    L.updateWorldMatrix(true, false); _w.setFromMatrixPosition(L.matrixWorld); const d = _w.distanceTo(cam.position); _s.setFromMatrixScale(L.matrixWorld); _w.project(cam);
    const H = innerHeight; const W = innerWidth; const ph = (_s.y * H) / (2 * d * this.ty) * 0.6; const pw = (_s.x * H) / (2 * d * this.ty) * 0.7; const cen = L.center || { x: 0.5, y: 0.5 };
    const cx = (_w.x * 0.5 + 0.5) * W; const cy = (-_w.y * 0.5 + 0.5) * H; const r = { left: cx - pw * cen.x, right: cx + pw * (1 - cen.x), top: cy - ph * (1 - cen.y), bottom: cy + ph * cen.y };
    if (this.hits(r, this.keepRects())) return true;
    const tp = f.targetEl; if (tp && tp.style.display !== 'none' && this.plateBox && this.hits(r, [this.plateBox])) return true;
    return false;
  }
  dispose() { for (const o of [...this.hidden.keys()]) this.show(o); this.instRestore();  }
}

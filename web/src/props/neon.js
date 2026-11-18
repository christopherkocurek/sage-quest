/* The Neon City quest props (Sage Quest): city hardware, not dark-fantasy magic.
   anchor   a steel bollard with a mag-lock collar, an LED status ticker and a heavy power cable (sparks, the lock pops)
   cage     a mesh holding cell on skids with a red status light and a keypad door
   beacon   a signal mast with a rotating amber lamp (cold, smouldering, lit)
   kindling a bundle of fuel cell canisters
   marker   a holo plate in a steel frame that shows the name
   gate     a security checkpoint arch with barrier arms (flare: the arms lift, the lights go green)
   sign     three trail clues: a dropped data shard, a tagged wall, a dead charging pad
   waymark  a hovering marker drone with a chevron stack (stop) and a searchlight (goal)
   cause    a small hover drone orb
   Rules kept: no runes, no cracks, no spirit glow, no light pillars. Light is city light (LED strips, lamps, a searchlight).
   Emissive colour stays under 1.0 except tiny LED points. Metres, Y up, origin = base centre on the ground.
   Every handle owns its geometry, materials and textures and frees them in dispose(). No allocation in update(). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { farlight as worldFarlight } from './farlights.js'; /* the wonder walk's far light */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const FONT = "'Chakra Petch', 'Arial Narrow', Arial, sans-serif";
const PAL = { cyan: 0x3ef2ff, magenta: 0xff3aa0, amber: 0xffa53a, red: 0xff2a30, green: 0x38ff8a };

/* ---------------------------------------------------------------- resource tracking, geometry and texture helpers */
function bag() {
  const geos = []; const mats = []; const texs = [];
  return {
    g: (x) => { geos.push(x); return x; }, m: (x) => { mats.push(x); return x; }, t: (x) => { texs.push(x); return x; },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const t of texs) t.dispose(); geos.length = mats.length = texs.length = 0; },
  };
}
const _mx = new THREE.Matrix4(); const _qq = new THREE.Quaternion(); const _ee = new THREE.Euler(); const _pp = new THREE.Vector3(); const _ss = new THREE.Vector3();
function put(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { _ee.set(rx, ry, rz); _qq.setFromEuler(_ee); _mx.compose(_pp.set(x, y, z), _qq, _ss.set(sx, sy, sz)); g.applyMatrix4(_mx); return g; }
const bx = (w, h, d, ...r) => put(new THREE.BoxGeometry(w, h, d), ...r);
const cy = (rt, rb, h, seg, ...r) => put(new THREE.CylinderGeometry(rt, rb, h, seg), ...r);
const cyo = (rt, rb, h, seg, ...r) => put(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), ...r);
const sph = (rad, ...r) => put(new THREE.SphereGeometry(rad, 14, 10), ...r);
const tor = (rad, tube, rs, ts, ...r) => put(new THREE.TorusGeometry(rad, tube, rs, ts), ...r);
/* merge a list into one geometry (all non-indexed so Lathe, Extrude and Box mix); the sources are freed */
function merge(list) { const flat = list.map((g) => (g.index ? g.toNonIndexed() : g)); const out = mergeGeometries(flat, false); for (const g of list) g.dispose(); for (const g of flat) g.dispose(); return out; }
/* planar UVs from the baked position and normal, so a stripe or grit texture tiles evenly (tile = metres per repeat) */
function bakeUV(g, tile = 0.5) {
  const p = g.attributes.position; const n = g.attributes.normal; const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)); const ay = Math.abs(n.getY(i)); const az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile); else if (ax >= az) uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile); else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
  }
  uv.needsUpdate = true; return g;
}
function cv(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function tex(B, w, h, draw, repeat = false) {
  const t = new THREE.CanvasTexture(cv(w, h, draw)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return B.t(t);
}
function drawHazard(g, w, h) {
  g.fillStyle = '#14151a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c99a1c'; g.lineWidth = 16;
  for (let i = -w; i <= w * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - h, h); g.stroke(); }
  const r = seeded(5); for (let i = 0; i < 240; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '8,8,10' : '90,80,60'},${0.1 + r() * 0.3})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
}
function drawConcrete(g, w, h) {
  g.fillStyle = '#7a7c7f'; g.fillRect(0, 0, w, h); const r = seeded(9);
  for (let i = 0; i < 900; i++) { const v = 90 + r() * 90; g.fillStyle = `rgba(${v},${v},${v + 4},${0.08 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 4); }
  for (let i = 0; i < 6; i++) { const x = r() * w; const y = r() * h; const gr = g.createRadialGradient(x, y, 0, x, y, 20 + r() * 30); gr.addColorStop(0, 'rgba(20,24,28,0.35)'); gr.addColorStop(1, 'rgba(20,24,28,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
}
/* the shared hardware materials of a prop */
function kit(B) {
  const hazT = tex(B, 64, 64, drawHazard, true); const concT = tex(B, 128, 128, drawConcrete, true);
  const std = (color, rough, metal, extra) => B.m(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  return {
    steel: std(0x2c3139, 0.48, 0.78), plate: std(0x1b1f25, 0.55, 0.7), light: std(0x5b626b, 0.45, 0.8), rubber: std(0x0b0c0e, 0.85, 0.05),
    conc: std(0x8a8c90, 0.92, 0, { map: concT }), haz: std(0xffffff, 0.62, 0.15, { map: hazT }),
  };
}
const glow = (B, hex, k, extra) => B.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), ...extra }));
const DEF = new THREE.Vector3(0, 0, -1);
const mesh = (geo, mat, parent, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; if (parent) parent.add(m); return m; };

/* ---------------------------------------------------------------- particles: sparks (points) and chips (instanced boxes) */
function sparkPool(B, parent, n = 40) {
  const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3); const base = new Float32Array(n * 3); const vel = new Float32Array(n * 3); const life = new Float32Array(n); const maxL = new Float32Array(n);
  const geo = B.g(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = tex(B, 32, 32, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const mat = B.m(new THREE.PointsMaterial({ size: 0.085, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; parent.add(pts); let head = 0;
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -50;
  return {
    emit(x, y, z, vx, vy, vz, l, r, g, b) { const i = head; head = (head + 1) % n; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; life[i] = maxL[i] = l; base[i * 3] = r; base[i * 3 + 1] = g; base[i * 3 + 2] = b; },
    /* an electric spark: cyan-white or orange, thrown out around (vx,vy,vz) */
    zap(x, y, z, vx, vy, vz, spread = 1.4) {
      const o = Math.random() < 0.55; const s = 0.55 + Math.random() * 0.4;
      this.emit(x, y, z, vx + (Math.random() - 0.5) * spread, vy + (Math.random() - 0.3) * spread, vz + (Math.random() - 0.5) * spread, 0.25 + Math.random() * 0.45, o ? 0.95 * s : 0.55 * s, o ? 0.5 * s : 0.8 * s, o ? 0.15 * s : 0.95 * s);
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        life[i] -= dt; const k = Math.max(0, life[i] / maxL[i]); const f = k * k;
        vel[i * 3 + 1] -= 9 * dt; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.6; vel[i * 3 + 2] *= 0.6; }
        col[i * 3] = base[i * 3] * f; col[i * 3 + 1] = base[i * 3 + 1] * f; col[i * 3 + 2] = base[i * 3 + 2] * f;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}
const _dm = new THREE.Matrix4(); const _dq = new THREE.Quaternion(); const _de = new THREE.Euler(); const _dp = new THREE.Vector3(); const _ds = new THREE.Vector3();
function chipPool(B, parent, mat, n = 20, size = 0.05) {
  const geo = B.g(new THREE.BoxGeometry(size, size * 0.5, size * 1.4));
  const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; im.castShadow = false; parent.add(im);
  const P = new Float32Array(n * 3); const V = new Float32Array(n * 3); const R = new Float32Array(n * 3); const W = new Float32Array(n * 3); const L = new Float32Array(n); const S = new Float32Array(n);
  _dm.makeScale(0, 0, 0); for (let i = 0; i < n; i++) im.setMatrixAt(i, _dm); let head = 0;
  return {
    emit(x, y, z, vx, vy, vz, sc = 1) { const i = head; head = (head + 1) % n; P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz; W[i * 3] = (Math.random() - 0.5) * 18; W[i * 3 + 1] = (Math.random() - 0.5) * 18; W[i * 3 + 2] = (Math.random() - 0.5) * 18; R[i * 3] = R[i * 3 + 1] = R[i * 3 + 2] = Math.random() * 6; L[i] = 3 + Math.random() * 2; S[i] = sc * (0.6 + Math.random() * 0.9); },
    update(dt) {
      for (let i = 0; i < n; i++) {
        if (L[i] <= 0) continue; L[i] -= dt;
        if (P[i * 3 + 1] > 0.015) { V[i * 3 + 1] -= 9 * dt; P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt; R[i * 3] += W[i * 3] * dt; R[i * 3 + 1] += W[i * 3 + 1] * dt; R[i * 3 + 2] += W[i * 3 + 2] * dt; }
        if (P[i * 3 + 1] <= 0.015) { P[i * 3 + 1] = 0.015; if (V[i * 3 + 1] < -0.8) { V[i * 3 + 1] *= -0.3; V[i * 3] *= 0.6; V[i * 3 + 2] *= 0.6; } else { V[i * 3] = V[i * 3 + 1] = V[i * 3 + 2] = 0; W[i * 3] = W[i * 3 + 1] = W[i * 3 + 2] = 0; } }
        const sc = S[i] * sstep(0, 0.6, L[i]);
        _de.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]); _dq.setFromEuler(_de); _dm.compose(_dp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), _dq, _ds.set(sc, sc, sc)); im.setMatrixAt(i, _dm);
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---------------------------------------------------------------- a power cable: a tube whose centre line is rewritten in place */
function cableTube(B, mat, N = 28, S = 6) {
  const nV = (N + 1) * (S + 1); const pos = new Float32Array(nV * 3); const nor = new Float32Array(nV * 3); const uv = new Float32Array(nV * 2); const idx = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) { const a = i * (S + 1) + j; const b = a + S + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = B.g(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.castShadow = true;
  const P = new Float32Array((N + 1) * 3); const Rr = new Float32Array(N + 1);
  const rebuild = () => {
    let arc = 0;
    for (let i = 0; i <= N; i++) {
      const a = Math.max(0, i - 1) * 3; const b = Math.min(N, i + 1) * 3;
      let tx = P[b] - P[a]; let ty = P[b + 1] - P[a + 1]; let tz = P[b + 2] - P[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let rx = 0; let ry = 1; let rz = 0; if (Math.abs(ty) > 0.92) { rx = 1; ry = 0; }
      let ux = ty * rz - tz * ry; let uy = tz * rx - tx * rz; let uz = tx * ry - ty * rx; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const vx = ty * uz - tz * uy; const vy = tz * ux - tx * uz; const vz = tx * uy - ty * ux;
      if (i > 0) arc += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
      for (let j = 0; j <= S; j++) {
        const an = (j / S) * TAU; const c = Math.cos(an); const s = Math.sin(an); const k = (i * (S + 1) + j);
        const nx = ux * c + vx * s; const ny = uy * c + vy * s; const nz = uz * c + vz * s;
        pos[k * 3] = P[i * 3] + nx * Rr[i]; pos[k * 3 + 1] = P[i * 3 + 1] + ny * Rr[i]; pos[k * 3 + 2] = P[i * 3 + 2] + nz * Rr[i];
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz; uv[k * 2] = arc / 1.4; uv[k * 2 + 1] = j / S;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true; geo.attributes.uv.needsUpdate = true;
  };
  return { mesh: m, P, R: Rr, N, rebuild };
}

/* ================================================================ ANCHOR: the steel bollard with a mag-lock collar */
export function anchor(scene, { accent = PAL.cyan, to, index = 0 } = {}) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  const toRef = to || new THREE.Vector3(0, 2.2, -14);
  const R_SH = 0.2; const Y0 = 0.56;
  /* static base: a concrete footing with anchor bolts, a hazard skirt, a flange */
  const conc = mesh(B.g(bakeUV(merge([bx(1.0, 0.14, 1.0, 0, 0.07, 0), bx(0.9, 0.05, 0.9, 0, 0.165, 0, 0, 0.785)]), 0.6)), M.conc, group);
  const skirt = mesh(B.g(bakeUV(merge([cy(0.285, 0.3, 0.42, 20, 0, 0.35, 0)]), 0.4)), M.haz, group);
  const baseSteel = mesh(B.g(merge([cy(0.33, 0.33, 0.05, 20, 0, 0.19, 0), cy(0.25, 0.25, 0.04, 20, 0, 0.56, 0), ...[0.7, 2.35, 3.93, 5.5].map((a) => cy(0.03, 0.03, 0.07, 6, Math.cos(a) * 0.4, 0.17, Math.sin(a) * 0.4))])), M.steel, group);
  /* the lean (world-frame tilt about the shaft foot) > the yaw (the gland faces the chain) > the post */
  const lean = new THREE.Group(); lean.position.y = Y0; group.add(lean);
  const yaw = new THREE.Group(); lean.add(yaw);
  const post = new THREE.Group(); post.position.y = -Y0; yaw.add(post);
  const lockSeat = B.m(new THREE.MeshStandardMaterial({ color: 0xa87a14, roughness: 0.6, metalness: 0.5 }));
  const shaftG = merge([
    cy(R_SH, R_SH + 0.01, 1.24, 20, 0, Y0 + 0.62, 0), sph(R_SH, 0, 1.8, 0, 0, 0, 0, 1, 0.55, 1),
    
    cy(0.075, 0.075, 0.12, 12, 0, 1.68, 0.24, Math.PI / 2), cy(0.06, 0.036, 0.2, 10, 0, 1.68, 0.38, Math.PI / 2),
    bx(0.32, 0.4, 0.15, 0, 0.92, -0.29), bx(0.34, 0.03, 0.17, 0, 1.12, -0.29), cy(0.025, 0.025, 0.55, 8, 0.1, 0.62, -0.3), cy(0.03, 0.03, 0.12, 8, 0, 1.0, -0.2, Math.PI / 2),
    ...[0, 1, 2, 3].map((i) => bx(0.3, 0.014, 0.01, 0, 0.84 + i * 0.045, -0.372)),
    cy(0.036, 0.036, 0.05, 10, 0, 1.94, 0),
  ]);
  const steel = mesh(B.g(shaftG), M.steel, post);
  const seat = mesh(B.g(cy(R_SH + 0.012, R_SH + 0.012, 0.24, 20, 0, 1.01, 0)), lockSeat, post, false);
  /* the LED ticker band: a wrapped display, three modules round the shaft (a padlock and the word) */
  const bandCv = document.createElement('canvas'); bandCv.width = 256; bandCv.height = 120; const bandG = bandCv.getContext('2d');
  const bandT = B.t(new THREE.CanvasTexture(bandCv)); bandT.colorSpace = THREE.SRGBColorSpace; bandT.wrapS = THREE.RepeatWrapping; bandT.repeat.set(3, 1); bandT.anisotropy = 4;
  let bandState = -1;
  const setBand = (s) => {
    if (s === bandState) return; bandState = s; const W = 256; const H = 120; bandG.fillStyle = '#060708'; bandG.fillRect(0, 0, W, H);
    if (s < 3) {
      const col = s === 0 ? '#ff3a30' : '#ffb028'; const word = s === 0 ? 'SEALED' : s === 1 ? 'FAULT' : 'ERR 7F';
      bandG.fillStyle = col; bandG.font = `700 44px ${FONT}`; bandG.textBaseline = 'middle'; bandG.textAlign = 'center'; bandG.fillText(word, W * 0.62, H / 2 + 3);
      /* a padlock pictogram (the shackle is open when the lock is failing) */
      const lx = 52; bandG.fillRect(lx - 20, H / 2 - 2, 40, 34); bandG.strokeStyle = col; bandG.lineWidth = 8; bandG.beginPath();
      if (s === 0) bandG.arc(lx, H / 2 - 2, 14, Math.PI, 0); else bandG.arc(lx + 12, H / 2 - 10, 14, Math.PI * 1.1, Math.PI * 0.05);
      bandG.stroke();
    }
    bandG.fillStyle = 'rgba(0,0,0,0.5)'; for (let y = 0; y < H; y += 4) bandG.fillRect(0, y, W, 1.4); for (let x = 0; x < W; x += 4) bandG.fillRect(x, 0, 1.2, H);
    bandT.needsUpdate = true;
  };
  setBand(0);
  const bandM = B.m(new THREE.MeshBasicMaterial({ map: bandT, color: new THREE.Color(0.85, 0.85, 0.85) }));
  const band = mesh(B.g(cyo(R_SH + 0.006, R_SH + 0.006, 0.2, 24, 0, 1.45, 0)), bandM, post, false);
  mesh(B.g(merge([tor(R_SH + 0.012, 0.01, 6, 24, 0, 1.56, 0, Math.PI / 2), tor(R_SH + 0.012, 0.01, 6, 24, 0, 1.34, 0, Math.PI / 2)])), M.light, post, false);
  const ringM = glow(B, accent, 0.8);
  mesh(B.g(merge([tor(R_SH + 0.008, 0.007, 5, 28, 0, 0.78, 0, Math.PI / 2), tor(R_SH + 0.008, 0.007, 5, 28, 0, 1.72, 0, Math.PI / 2)])), ringM, post, false);
  /* the lock collar: a chunky ring with two clamps and an LED strip; it works loose when hit and pops off when the post breaks */
  const collar = new THREE.Group(); collar.position.set(0, 1.01, 0); post.add(collar);
  const profile = [new THREE.Vector2(0.2, -0.11), new THREE.Vector2(0.255, -0.11), new THREE.Vector2(0.288, -0.078), new THREE.Vector2(0.288, 0.078), new THREE.Vector2(0.255, 0.11), new THREE.Vector2(0.2, 0.11)];
  const collarG = merge([new THREE.LatheGeometry(profile, 26), bx(0.13, 0.2, 0.17, 0.3, 0, 0), bx(0.13, 0.2, 0.17, -0.3, 0, 0), cy(0.03, 0.03, 0.04, 6, 0.0, 0.13, 0.0)]);
  mesh(B.g(collarG), B.m(new THREE.MeshStandardMaterial({ color: 0x848c96, roughness: 0.38, metalness: 0.7 })), collar);
  const ledM = glow(B, PAL.red, 0.85); ledM.toneMapped = false; ledM.color.multiplyScalar(1.15);
  const strip = mesh(B.g(merge([cyo(0.291, 0.291, 0.034, 26, 0, 0, 0), bx(0.012, 0.1, 0.09, 0.368, 0, 0), bx(0.012, 0.1, 0.09, -0.368, 0, 0)])), ledM, collar, false);
  const lamp = mesh(B.g(sph(0.032, 0, 1.97, 0)), ledM, post, false);
  /* the cable */
  const cableT = tex(B, 128, 16, (g, w, h) => { g.fillStyle = '#17191d'; g.fillRect(0, 0, w, h); g.fillStyle = '#c99a1c'; g.fillRect(w * 0.84, 0, w * 0.1, h); g.fillStyle = '#2a2e35'; g.fillRect(0, h * 0.18, w, 2); g.fillRect(0, h * 0.62, w, 2); g.fillStyle = `#${new THREE.Color(accent).getHexString()}`; g.fillRect(w * 0.7, 0, 3, h); }, true);
  const cableM = B.m(new THREE.MeshStandardMaterial({ map: cableT, roughness: 0.55, metalness: 0.3 }));
  const cable = cableTube(B, cableM, 28, 6); group.add(cable.mesh);
  const sparks = sparkPool(B, group, 48);
  const chips = chipPool(B, group, B.m(new THREE.MeshStandardMaterial({ color: 0x424a54, roughness: 0.5, metalness: 0.7 })), 24, 0.05);

  const h = { group, height: 1.4, hp: 1, update() {}, hit() {}, break: () => 1.4, dispose() {} };
  /* state */
  const toL = new THREE.Vector3(); const S0 = new THREE.Vector3(); const E0 = new THREE.Vector3(); const dirL = new THREE.Vector3(); const ptL = new THREE.Vector3(); const mi = new THREE.Matrix4(); const gq = new THREE.Quaternion();
  let t = Math.random() * 10; let dmg = 0; let broken = false; let brokenT = 0; let flash = 0; let leak = 0; let far = false; let dist = 0; let shiver = 0; let shiverT = 0;
  let lx = 0; let lz = 0; let vx = 0; let vz = 0; let tx = 0; let tz = 0;
  const cv_ = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, free: false, rest: false };
  /* the dropped cable: a verlet rope pinned at the far end */
  const N = cable.N; const px = new Float32Array(N + 1); const py = new Float32Array(N + 1); const pz = new Float32Array(N + 1); const qx = new Float32Array(N + 1); const qy = new Float32Array(N + 1); const qz = new Float32Array(N + 1);
  let rest = 0.5; let dropped = false;
  const CAB_R = 0.065;
  const setBandState = () => { const s = broken ? (brokenT < 0.7 ? 2 : 3) : dmg < 0.2 ? 0 : dmg < 0.55 ? 1 : 2; setBand(s); };
  h.update = (dt) => {
    dt = Math.min(dt, 0.05); t += dt; if (broken) brokenT += dt;
    group.updateWorldMatrix(true, false); mi.copy(group.matrixWorld).invert(); toL.copy(toRef).applyMatrix4(mi);
    const dl = Math.hypot(toL.x, toL.z); if (dl > 0.4) yaw.rotation.y = Math.atan2(toL.x, toL.z);
    /* lean spring (world frame about the foot) */
    tx = broken ? lerp(0, 0.14, 1) * (dirL.x) : dmg * 0.05 * dirL.x; tz = broken ? 0.14 * dirL.z : dmg * 0.05 * dirL.z;
    vx += (-95 * (lx - tx) - 7 * vx) * dt; vz += (-95 * (lz - tz) - 7 * vz) * dt; lx += vx * dt; lz += vz * dt;
    lean.rotation.x = lz; lean.rotation.z = -lx;
    /* the collar works loose */
    if (!cv_.free) { collar.position.y = 1.01 - dmg * 0.05; collar.rotation.x = dmg * 0.3; collar.rotation.z = dmg * 0.42; }
    else {
      if (!cv_.rest) {
        cv_.vy -= 9.5 * dt; cv_.x += cv_.vx * dt; cv_.y += cv_.vy * dt; cv_.z += cv_.vz * dt; cv_.rx += cv_.wx * dt; cv_.rz += cv_.wz * dt;
        if (cv_.y < 0.12) { cv_.y = 0.12; if (cv_.vy < -1.2) { cv_.vy *= -0.32; cv_.vx *= 0.6; cv_.vz *= 0.6; cv_.wx *= 0.5; cv_.wz *= 0.5; } else { cv_.rest = true; } }
      } else { cv_.rx = damp(cv_.rx, Math.round(cv_.rx / Math.PI) * Math.PI, 12, dt); cv_.rz = damp(cv_.rz, Math.round(cv_.rz / Math.PI) * Math.PI, 12, dt); cv_.y = damp(cv_.y, 0.11, 10, dt); }
      collar.position.set(cv_.x, cv_.y, cv_.z); collar.rotation.set(cv_.rx, cv_.ry, cv_.rz);
    }
    /* the LED strip and ticker */
    flash = Math.max(0, flash - dt * 6);
    const live = !broken || brokenT < 0.5; const flick = dmg > 0.15 ? (Math.sin(t * 31) * Math.sin(t * 17) > 1 - dmg * 1.1 ? 0 : 1) : 1;
    const base = broken ? (brokenT < 0.5 ? 0.4 * (Math.random() < 0.5 ? 1 : 0) : 0) : (0.55 + 0.25 * Math.sin(t * 2.2)) * flick;
    const amber = dmg > 0.2 ? Math.min(1, (dmg - 0.2) * 1.6) : 0;
    ledM.color.setRGB((1.0 * (1 - amber) + 1.0 * amber) * base * 1.1, (0.12 * (1 - amber) + 0.55 * amber) * base * 1.1, 0.08 * base * 1.1);
    bandM.color.setScalar(live ? 0.85 * (0.85 + 0.15 * flick) + flash * 0.15 : 0.0);
    if (broken && brokenT > 0.7) bandM.color.setScalar(0.3);
    setBandState();
    /* leaking sparks from a damaged lock */
    if (!broken && dmg > 0.3) { leak += dt * (1.5 + dmg * dmg * 9); while (leak > 1) { leak -= 1; const a = Math.random() * TAU; sparks.zap(Math.cos(a) * 0.3, 1.05 - dmg * 0.04, Math.sin(a) * 0.3, Math.cos(a) * 0.9, 0.7, Math.sin(a) * 0.9); } }
    if (broken && brokenT < 3 && Math.random() < dt * 5) { const a = Math.random() * TAU; sparks.zap(Math.cos(a) * 0.12, 1.0, Math.sin(a) * 0.12, Math.cos(a) * 0.5, 1.2, Math.sin(a) * 0.5, 0.8); }
    sparks.update(dt); chips.update(dt);
    /* the cable */
    S0.set(Math.sin(yaw.rotation.y) * 0.4, 1.68, Math.cos(yaw.rotation.y) * 0.4);
    dirL.y = 0;
    if (!dropped) {
      let ex = toL.x - S0.x; let ey = toL.y - S0.y; let ez = toL.z - S0.z; const L = Math.hypot(ex, ey, ez) || 1; far = L > 35; dist = L;
      if (far) { const k = 30 / L; ex *= k; ey *= k; ez *= k; }
      const Lc = far ? 30 : L; const sag = far ? 0.9 : clamp(Lc * 0.06, 0.25, 2.4);
      shiverT += dt; const sh = shiver * Math.exp(-3 * shiverT);
      for (let i = 0; i <= N; i++) {
        const s = i / N; const wob = sh * Math.sin(s * Math.PI) * Math.sin(shiverT * 16 - s * 5) * 0.22;
        P_set(cable.P, i, S0.x + ex * s, Math.max(0.07, S0.y + ey * s - sag * 4 * s * (1 - s) + wob), S0.z + ez * s);
        cable.R[i] = CAB_R * (far ? 1 - sstep(0.55, 1, s) : 1) * (i === 0 ? 0.8 : 1);
      }
      E0.set(S0.x + ex, S0.y + ey, S0.z + ez);
      cable.rebuild();
    } else {
      /* verlet: gravity, ground, the far end pinned */
      const g = 9.8 * dt * dt;
      for (let i = 0; i < N; i++) {
        const nx = px[i] + (px[i] - qx[i]) * 0.992; let ny = py[i] + (py[i] - qy[i]) * 0.992 - g; const nz = pz[i] + (pz[i] - qz[i]) * 0.992;
        qx[i] = px[i]; qy[i] = py[i]; qz[i] = pz[i]; px[i] = nx; py[i] = ny; pz[i] = nz;
      }
      px[N] = E0.x; py[N] = E0.y; pz[N] = E0.z; qx[N] = E0.x; qy[N] = E0.y; qz[N] = E0.z;
      for (let it = 0; it < 16; it++) {
        for (let i = 0; i < N; i++) {
          let dx = px[i + 1] - px[i]; let dy = py[i + 1] - py[i]; let dz = pz[i + 1] - pz[i]; const l = Math.hypot(dx, dy, dz) || 1e-6; const df = (l - rest) / l;
          dx *= df; dy *= df; dz *= df;
          if (i + 1 === N) { px[i] += dx; py[i] += dy; pz[i] += dz; } else { px[i] += dx * 0.5; py[i] += dy * 0.5; pz[i] += dz * 0.5; px[i + 1] -= dx * 0.5; py[i + 1] -= dy * 0.5; pz[i + 1] -= dz * 0.5; }
        }
        for (let i = 0; i < N; i++) if (py[i] < CAB_R) { py[i] = CAB_R; qx[i] += (px[i] - qx[i]) * 0.35; qz[i] += (pz[i] - qz[i]) * 0.35; }
      }
      for (let i = 0; i <= N; i++) { P_set(cable.P, i, px[i], py[i], pz[i]); cable.R[i] = CAB_R * (far ? 1 - sstep(0.55, 1, i / N) : 1) * (i === 0 ? 0.8 : 1); }
      cable.rebuild();
    }
  };
  function P_set(P, i, x, y, z) { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; }
  const toLocalDir = (dir) => { group.getWorldQuaternion(gq); gq.invert(); dirL.copy(dir).applyQuaternion(gq); dirL.y = 0; const l = Math.hypot(dirL.x, dirL.z) || 1; dirL.x /= l; dirL.z /= l; };
  h.hit = (k, point, dir) => {
    if (broken) return; toLocalDir(dir || DEF); h.hp = clamp(k, 0, 1); dmg = 1 - h.hp; flash = 1; shiver = 1; shiverT = 0;
    vx += dirL.x * 1.5; vz += dirL.z * 1.5;
    if (point) { ptL.copy(point); group.worldToLocal(ptL); } else ptL.set(0, 1.3, 0.2);
    const nB = 7 + Math.round(dmg * 6);
    for (let i = 0; i < nB; i++) sparks.zap(ptL.x, ptL.y, ptL.z, -dirL.x * 1.3, 0.6, -dirL.z * 1.3, 2.2);
    for (let i = 0; i < 4; i++) chips.emit(ptL.x, ptL.y, ptL.z, -dirL.x * 1.2 + (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, -dirL.z * 1.2 + (Math.random() - 0.5) * 2, 0.8);
  };
  h.break = (dir) => {
    if (broken) return 1.4; broken = true; brokenT = 0; h.hp = 0; dmg = 1; toLocalDir(dir || DEF); flash = 1;
    vx += dirL.x * 3.2; vz += dirL.z * 3.2;
    /* the lock pops: the collar flies off in the blow direction */
    group.attach(collar); cv_.x = collar.position.x; cv_.y = collar.position.y; cv_.z = collar.position.z; cv_.rx = collar.rotation.x; cv_.ry = collar.rotation.y; cv_.rz = collar.rotation.z;
    cv_.vx = dirL.x * 3.4 + (Math.random() - 0.5) * 0.8; cv_.vz = dirL.z * 3.4 + (Math.random() - 0.5) * 0.8; cv_.vy = 4.2; cv_.wx = (Math.random() - 0.5) * 12; cv_.wz = (Math.random() - 0.5) * 12; cv_.free = true;
    for (let i = 0; i < 30; i++) sparks.zap(Math.sin(yaw.rotation.y) * 0.05, 1.02, Math.cos(yaw.rotation.y) * 0.05, dirL.x * 1.4, 1.4, dirL.z * 1.4, 3.4);
    for (let i = 0; i < 14; i++) chips.emit(0, 1.0, 0, dirL.x * 2 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, dirL.z * 2 + (Math.random() - 0.5) * 3, 1);
    /* the cable lets go at the post end and falls, pinned at the far end */
    for (let i = 0; i <= N; i++) { px[i] = qx[i] = cable.P[i * 3]; py[i] = qy[i] = cable.P[i * 3 + 1]; pz[i] = qz[i] = cable.P[i * 3 + 2]; }
    let len = 0; for (let i = 0; i < N; i++) len += Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i], pz[i + 1] - pz[i]); rest = len / N * 0.985;
    for (let i = 0; i < 8; i++) { qx[i] -= dirL.x * 0.05 * (8 - i); qz[i] -= dirL.z * 0.05 * (8 - i); }
    dropped = true; return 1.4;
  };
  h.dispose = () => { group.removeFromParent(); B.dispose(); };
  return h;
}

/* ================================================================ CAGE: a mesh holding cell on skids */
export function cage(scene, { accent = PAL.cyan } = {}) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  const HW = 0.98; const TOPY = 2.18;
  /* frame: corner posts, rails, door frame, skids, a roof plate */
  const fr = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) fr.push(bx(0.08, TOPY - 0.1, 0.08, sx * HW, 0.1 + (TOPY - 0.1) / 2, sz * HW));
  for (const y of [0.14, 1.12, TOPY - 0.04]) { for (const sz of [-1, 1]) fr.push(bx(2 * HW, 0.06, 0.07, 0, y, sz * HW)); for (const sx of [-1, 1]) fr.push(bx(0.07, 0.06, 2 * HW, sx * HW, y, 0)); }
  for (const sx of [-1, 1]) { fr.push(bx(0.07, 1.92, 0.07, sx * 0.47, 1.06, -HW)); }
  fr.push(bx(1.0, 0.1, 0.09, 0, 2.02, -HW), bx(0.09, 0.12, 2 * HW + 0.2, -HW, 0.0, 0), bx(0.09, 0.12, 2 * HW + 0.2, HW, 0.0, 0));
  /* the lock box, the lamp base and a lifting lug */
  fr.push(bx(0.12, 0.26, 0.07, 0.58, 1.1, -HW - 0.03), cy(0.1, 0.12, 0.05, 14, 0.78, TOPY + 0.09, -0.78), bx(0.14, 0.05, 0.1, 0, TOPY + 0.12, 0), tor(0.07, 0.022, 6, 14, 0, TOPY + 0.24, 0, 0, Math.PI / 2));
  for (const sx of [-1, 1]) fr.push(bx(0.07, 0.07, 2 * HW - 0.08, sx * 0.6, 0.06, 0));
  const steel = mesh(B.g(merge(fr)), M.steel, group);
  /* wire mesh: real thin bars, 0.1 m cells, so it reads at any range */
  const bars = []; const bt = 0.018;
  const panel = (len, cx, cz, ry, y0 = 0.16, y1 = TOPY - 0.06) => {
    const n = Math.round(len / 0.1);
    for (let i = 0; i <= n; i++) { const u = -len / 2 + (i / n) * len; bars.push(bx(bt, y1 - y0, bt, Math.cos(ry) * u + cx, (y0 + y1) / 2, -Math.sin(ry) * u + cz)); }
    const m = Math.round((y1 - y0) / 0.1);
    for (let j = 0; j <= m; j++) bars.push(bx(len, bt, bt, cx, y0 + (j / m) * (y1 - y0), cz, 0, ry));
  };
  panel(2 * HW - 0.08, -HW, 0, Math.PI / 2); panel(2 * HW - 0.08, HW, 0, Math.PI / 2); panel(2 * HW - 0.08, 0, HW, 0);
  panel(0.5, -0.725, -HW, 0); panel(0.5, 0.725, -HW, 0);
  mesh(B.g(merge(bars)), M.light, group, false);
  /* floor grate and roof plate */
  const plates = [bx(2 * HW - 0.04, 0.05, 2 * HW - 0.04, 0, 0.1, 0), bx(2 * HW + 0.16, 0.06, 2 * HW + 0.16, 0, TOPY + 0.03, 0)];
  mesh(B.g(merge(plates)), M.plate, group);
  const hz = [bx(2 * HW + 0.16, 0.02, 0.1, 0, TOPY + 0.07, 0.98 + 0.03), bx(2 * HW + 0.16, 0.02, 0.1, 0, TOPY + 0.07, -0.98 - 0.03), bx(0.1, 0.02, 2 * HW, 0.98 + 0.03, TOPY + 0.07, 0), bx(0.1, 0.02, 2 * HW, -0.98 - 0.03, TOPY + 0.07, 0), bx(1.0, 0.04, 0.12, 0, 0.13, -HW - 0.06)];
  for (const g of hz) bakeUV(g, 0.3);
  mesh(B.g(merge(hz)), M.haz, group, false);
  /* the door: a frame with bars, hinged at x = -0.47, swings out toward -z */
  const door = new THREE.Group(); door.position.set(-0.45, 0, -HW); group.add(door);
  const dg = [bx(0.06, 1.86, 0.06, 0.03, 1.05, 0), bx(0.06, 1.86, 0.06, 0.87, 1.05, 0), bx(0.9, 0.06, 0.06, 0.45, 0.14, 0), bx(0.9, 0.06, 0.06, 0.45, 1.97, 0), bx(0.9, 0.05, 0.06, 0.45, 1.05, 0)];
  const dbars = []; for (let i = 1; i < 9; i++) dbars.push(bx(bt, 1.8, bt, i * 0.1, 1.05, 0)); for (let j = 0; j <= 18; j++) dbars.push(bx(0.84, bt, bt, 0.45, 0.17 + j * 0.1, 0));
  mesh(B.g(merge(dg)), M.steel, door); mesh(B.g(merge(dbars)), M.light, door, false);
  mesh(B.g(merge([bx(0.1, 0.06, 0.08, 0.8, 1.05, -0.04), bx(0.07, 0.07, 0.05, 0.04, 0.5, 0), bx(0.07, 0.07, 0.05, 0.04, 1.6, 0)])), M.plate, door);
  /* status lights: the keypad LED (red, then green), the roof lamp (red pulse, then dark), cyan door-frame strips, a cold ceiling panel */
  const lockM = glow(B, PAL.red, 1.0); lockM.toneMapped = false; lockM.color.multiplyScalar(1.2);
  mesh(B.g(bx(0.05, 0.03, 0.02, 0.58, 1.17, -HW - 0.07)), lockM, group, false);
  const lampM = glow(B, PAL.red, 0.9, { transparent: true, opacity: 1 });
  mesh(B.g(sph(0.095, 0.78, TOPY + 0.115, -0.78, 0, 0, 0, 1, 0.9, 1)), lampM, group, false);
  const stripM = glow(B, accent, 0.8);
  mesh(B.g(merge([bx(0.02, 1.9, 0.012, -0.5, 1.06, -HW - 0.045), bx(0.02, 1.9, 0.012, 0.5, 1.06, -HW - 0.045), bx(1.02, 0.02, 0.012, 0, 2.1, -HW - 0.045)])), stripM, group, false);
  const ceilM = glow(B, 0xcfe6ff, 0.55);
  mesh(B.g(bx(0.6, 0.02, 0.18, 0, TOPY - 0.08, 0.2)), ceilM, group, false);
  /* the plate over the door */
  const plateT = tex(B, 256, 80, (g, w, h) => { g.fillStyle = '#0a0b0d'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c99a1c'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#ffb028'; g.font = `700 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HOLD 07', w / 2, h / 2 + 3); });
  const plate = new THREE.Mesh(B.g(new THREE.PlaneGeometry(0.62, 0.2)), B.m(new THREE.MeshBasicMaterial({ map: plateT, color: new THREE.Color(0.75, 0.75, 0.75) }))); plate.position.set(0, 2.1 + 0.16 - 0.02, -HW - 0.06); plate.rotation.y = Math.PI; plate.rotation.y = Math.PI; group.add(plate);
  plate.rotation.y = Math.PI; plate.position.set(0, 2.17 + 0.17, -HW - 0.06);
  const topPt = new THREE.Vector3(0, TOPY + 0.32, 0);
  let t = Math.random() * 6; let opening = false; let ot = 0; let ang = 0; let vel = 0; let dtgt = 0;
  const h = {
    group, top: topPt, update(dt) {
      dt = Math.min(dt, 0.05); t += dt;
      if (opening) { ot += dt; if (ot > 0.12) { dtgt = 1.75; } const k = 120; vel += (-k * (ang - dtgt) - 9 * vel) * dt; ang += vel * dt; if (ang < 0) { ang = 0; vel = 0; } door.rotation.y = ang; }
      const g = opening ? sstep(0.1, 0.5, ot) : 0;
      lockM.color.setRGB(lerp(1.2, 0.04, g), lerp(0.03, 1.1, g), lerp(0.04, 0.3, g));
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.2); const lampK = opening ? Math.max(0, 1 - ot * 1.4) * 0.35 : 0.25 + 0.65 * pulse * pulse;
      lampM.color.setRGB(lampK * 0.95, lampK * 0.05, lampK * 0.06);
    },
    open() { if (!opening) { opening = true; ot = 0; dtgt = 0.05; } return 1.2; },
    dispose() { group.removeFromParent(); B.dispose(); },
  };
  return h;
}


/* ================================================================ BEACON: a signal mast with a rotating amber lamp */
export function beacon(scene, { accent = PAL.amber, index = 0 } = {}) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  const HEAD = 3.4; const MY0 = 0.24; const MY1 = 3.3;
  mesh(B.g(bakeUV(merge([bx(1.1, 0.22, 1.1, 0, 0.11, 0), bx(0.9, 0.04, 0.9, 0, 0.24, 0, 0, 0.785)]), 0.6)), M.conc, group);
  /* the mast: a square lattice (four legs, rings, X braces) tapering to the head */
  const hw = (y) => lerp(0.21, 0.1, (y - MY0) / (MY1 - MY0)); const lat = [];
  const strut = (x0, y0, z0, x1, y1, z1, r) => { const dx = x1 - x0; const dy = y1 - y0; const dz = z1 - z0; const len = Math.hypot(dx, dy, dz); const g = cy(r, r, len, 5); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)); g.applyQuaternion(q); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); lat.push(g); };
  const sx4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of sx4) strut(sx * hw(MY0), MY0, sz * hw(MY0), sx * hw(MY1), MY1, sz * hw(MY1), 0.02);
  const levels = [MY0, 0.95, 1.65, 2.35, MY1];
  for (let k = 0; k < levels.length; k++) for (let n = 0; n < 4; n++) { const [ax, az] = sx4[n]; const [bxx, bz] = sx4[(n + 1) % 4]; const y = levels[k]; strut(ax * hw(y), y, az * hw(y), bxx * hw(y), y, bz * hw(y), 0.013); }
  for (let k = 0; k < levels.length - 1; k++) for (let n = 0; n < 4; n++) { const [ax, az] = sx4[n]; const [bxx, bz] = sx4[(n + 1) % 4]; const y0 = levels[k]; const y1 = levels[k + 1]; strut(ax * hw(y0), y0, az * hw(y0), bxx * hw(y1), y1, bz * hw(y1), 0.011); if (k % 2) strut(bxx * hw(y0), y0, bz * hw(y0), ax * hw(y1), y1, az * hw(y1), 0.011); }
  const haz = [bx(0.62, 0.1, 0.5, 0.45, 0.78, 0), bx(0.66, 0.06, 0.54, 0.45, 0.27, 0)]; for (const g of haz) bakeUV(g, 0.3);
  mesh(B.g(merge(haz)), M.haz, group, false);
  const st = [
    ...lat,
    bx(0.56, 0.52, 0.46, 0.45, 0.52, 0), bx(0.62, 0.05, 0.52, 0.45, 0.83, 0), cy(0.03, 0.03, 0.34, 8, 0.2, 0.55, 0, 0, 0, Math.PI / 2),
    ...[0, 1, 2, 3].map((k) => bx(0.3, 0.014, 0.01, 0.45, 0.42 + k * 0.05, 0.235)), ...[0, 1, 2, 3].map((k) => bx(0.3, 0.014, 0.01, 0.45, 0.42 + k * 0.05, -0.235)), bx(0.04, 0.12, 0.03, 0.45, 0.6, 0.24),
    bx(1.5, 0.05, 0.05, 0, 2.6, 0), bx(0.05, 0.44, 0.05, -0.72, 2.78, 0), bx(0.05, 0.44, 0.05, 0.72, 2.78, 0), bx(0.18, 0.6, 0.03, -0.72, 2.86, 0.04), bx(0.18, 0.6, 0.03, 0.72, 2.86, -0.04),
    put(new THREE.SphereGeometry(0.22, 14, 6, 0, TAU, 0, 1.0), 0, 2.05, 0.2, 1.1, 0, 0), cy(0.02, 0.02, 0.26, 6, 0, 2.05, 0.15, Math.PI / 2),
    cy(0.26, 0.26, 0.07, 20, 0, HEAD - 0.035, 0), cy(0.24, 0.24, 0.06, 20, 0, HEAD + 0.33, 0), cy(0.09, 0.09, 0.07, 14, 0, HEAD + 0.4, 0), cy(0.008, 0.008, 0.5, 5, 0, HEAD + 0.7, 0),
    ...[0, 1, 2, 3].map((k) => cy(0.01, 0.01, 0.3, 5, Math.cos(k * 1.571 + 0.78) * 0.228, HEAD + 0.15, Math.sin(k * 1.571 + 0.78) * 0.228)),
    ...[0.06, 0.15, 0.24].map((y) => tor(0.206, 0.01, 5, 24, 0, HEAD + y, 0, Math.PI / 2)),
  ];
  mesh(B.g(merge(st)), M.steel, group);
  /* the charge column: six LED rings standing round the mast, filled from the bottom as the hold builds */
  const ringG = B.g(tor(0.25, 0.017, 5, 24, 0, 0, 0, Math.PI / 2));
  const ringM = B.m(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const rings = new THREE.InstancedMesh(ringG, ringM, 6); rings.frustumCulled = false; group.add(rings);
  const _c = new THREE.Color(); const RY = [1.1, 1.27, 1.44, 1.61, 1.78, 1.95];
  for (let i = 0; i < 6; i++) { _dm.makeTranslation(0, RY[i], 0); rings.setMatrixAt(i, _dm); rings.setColorAt(i, _c.setRGB(0.09, 0.05, 0.012)); }
  const standM = glow(B, PAL.red, 1.0); standM.toneMapped = false;
  mesh(B.g(merge([bx(0.04, 0.025, 0.012, 0.45, 0.7, 0.241), bx(0.04, 0.025, 0.012, 0.45, 0.7, -0.241)])), standM, group, false);
  /* a lit status screen on both cabinet ends and
     a cyan ground ring, so an unlit mast reads in the dark as a numbered machine waiting for a charge */
  const scrT = tex(B, 256, 160, (g, w, h) => {
    g.fillStyle = '#04161c'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(62,242,255,0.9)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#3ef2ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "800 46px 'Rajdhani', 'Arial Narrow', Arial, sans-serif"; g.fillText(`MAST 0${(index % 9) + 1}`, w / 2, 48);
    g.font = "700 26px 'Rajdhani', 'Arial Narrow', Arial, sans-serif"; g.fillStyle = '#ffa53a'; g.fillText('STANDBY', w / 2, 96);
    g.fillStyle = 'rgba(62,242,255,0.55)'; for (let i = 0; i < 6; i++) g.fillRect(40 + i * 30, 124, 22, 14);
  });
  const scrM = B.m(new THREE.MeshBasicMaterial({ map: scrT, color: 0xb0b0b0 })); scrM.toneMapped = false;
  mesh(B.g(merge([put(new THREE.PlaneGeometry(0.4, 0.25), 0.731, 0.56, 0, 0, Math.PI / 2, 0), put(new THREE.PlaneGeometry(0.4, 0.25), 0.169, 0.56, 0, 0, -Math.PI / 2, 0)])), scrM, group, false);
  const ringT = tex(B, 128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(62,242,255,0)'); gr.addColorStop(0.55, 'rgba(62,242,255,0.75)'); gr.addColorStop(0.7, 'rgba(62,242,255,0.2)'); gr.addColorStop(1, 'rgba(62,242,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const gRingM = B.m(new THREE.MeshBasicMaterial({ map: ringT, transparent: true, depthWrite: false, opacity: 0.55, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh(B.g(put(new THREE.PlaneGeometry(2.6, 2.6), 0, 0.03, 0, -Math.PI / 2, 0, 0)), gRingM, group, false);
  /* the signal head: an amber lens drum, a rotating reflector and bulb inside */
  const lensM = B.m(new THREE.MeshStandardMaterial({ color: 0x20120a, roughness: 0.25, metalness: 0.1, emissive: new THREE.Color(PAL.amber), emissiveIntensity: 0.02, transparent: true, opacity: 0.92 }));
  mesh(B.g(cyo(0.2, 0.2, 0.3, 24, 0, HEAD + 0.18, 0)), lensM, group, false).renderOrder = 2;
  const head = new THREE.Group(); head.position.y = HEAD + 0.18; group.add(head);
  mesh(B.g(merge([bx(0.02, 0.22, 0.16, 0.12, 0, 0), bx(0.02, 0.22, 0.16, -0.12, 0, 0)])), M.light, head, false);
  const bulbM = glow(B, PAL.amber, 0.02); bulbM.toneMapped = false;
  mesh(B.g(sph(0.06, 0, 0, 0)), bulbM, head, false);
  /* two soft sweep fans (flat, normal blended, low alpha): the lamp turning in the rain */
  const fanT = tex(B, 128, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,170,60,0.7)'); gr.addColorStop(0.45, 'rgba(255,150,40,0.3)'); gr.addColorStop(1, 'rgba(255,140,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in'; const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, w, h); });
  const fanM = B.m(new THREE.MeshBasicMaterial({ map: fanT, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 }));
  const fanG = B.g(merge([put(new THREE.PlaneGeometry(3.2, 1.1), 1.8, 0, 0, -Math.PI / 2 + 0.16), put(new THREE.PlaneGeometry(3.2, 1.1), -1.8, 0, 0, -Math.PI / 2 - 0.16, 0, Math.PI)]));
  const fans = new THREE.Mesh(fanG, fanM); fans.frustumCulled = false; fans.renderOrder = 3; head.add(fans);
  /* the one light, created now at intensity 0 */
  const lamp = new THREE.PointLight(0xffa238, 0, 16, 2); lamp.position.set(0, HEAD + 0.2, 0); lamp.castShadow = false; group.add(lamp);
  const sparks = sparkPool(B, group, 24);
  let t = Math.random() * 20; let lit = false; let ign = -1; let rot = Math.random() * 6; let ramp = 0; let sp = 0; let lastC = -1; let spawn = 0;
  const h = {
    group, update(dt, st = {}) {
      dt = Math.min(dt, 0.05); t += dt; const charge = clamp(st.charge || 0, 0, 1);
      if (st.lit && !lit) { lit = true; if (ign < 0) ign = 0; }
      if (ign >= 0) ign += dt;
      /* rings: fill by charge (smouldering), chase when lit */
      const q = lit ? 6 : charge * 6;
      if (lit || Math.abs(q - lastC) > 0.01 || charge > 0) {
        lastC = q;
        for (let i = 0; i < 6; i++) {
          let v = lit ? 0.55 + 0.35 * Math.pow(0.5 + 0.5 * Math.sin(t * 5 - i * 0.9), 2) : clamp(q - i, 0, 1);
          if (!lit && i === Math.floor(q) && q < 6) v *= 0.6 + 0.4 * Math.sin(t * 13);
          rings.setColorAt(i, _c.setRGB(0.09 + 0.83 * v, 0.05 + 0.41 * v, 0.012 + 0.06 * v)); /* amber, under 1.0; dim standby floor */
        }
        rings.instanceColor.needsUpdate = true;
      }
      /* the lamp */
      let lensK = 0.02 + 0.55 * Math.pow(charge, 1.3) * (0.7 + 0.3 * Math.sin(t * 23) * Math.sin(t * 11)); let bulbK = 0.02 + 0.5 * charge * (0.6 + 0.4 * Math.sin(t * 17)); let fan = 0; let lampI = 0;
      if (lit) {
        const ig = ign < 0.9 ? (Math.sin(ign * 41) * Math.sin(ign * 23) > -0.15 + ign * 0.8 ? 1 : 0.1) * sstep(0, 0.9, ign) : 1; ramp = sstep(0.4, 1.8, ign);
        const sw = 0.5 + 0.5 * Math.cos(2 * rot);
        lensK = (0.55 + 0.35 * sw) * ig; bulbK = 1.4 * ig; fan = 0.85 * ramp; lampI = 150 * (0.55 + 0.45 * sw) * ramp * ig;
      }
      /* a standby glow from the head (the same light, so no new light): the mast reads in the dark before it is lit */
      lampI = Math.max(lampI, (lit ? 0 : 7) + 30 * charge);
      lensM.emissiveIntensity = Math.max(lensK, 0.12); bulbM.color.setRGB(bulbK * 1.0, bulbK * 0.55, bulbK * 0.1); lensM.opacity = 0.92 - 0.1 * lensK;
      fanM.opacity = fan; lamp.intensity = lampI;
      scrM.color.setScalar(lit ? 0.35 : 0.7 + 0.08 * Math.sin(t * 3));
      sp = damp(sp, lit ? 3.4 * ramp : 0.4 * charge, 3, dt); rot += sp * dt; head.rotation.y = rot;
      standM.color.setRGB(lit ? 0 : (Math.sin(t * 2.4) > 0.8 ? 1.0 : 0.06), 0.02, 0.02);
      /* a failing lamp throws sparks while it smoulders */
      if (!lit && charge > 0.15) { spawn += dt * charge * 6; while (spawn > 1) { spawn -= 1; const a = Math.random() * TAU; sparks.zap(Math.cos(a) * 0.2, HEAD + 0.2 + Math.random() * 0.15, Math.sin(a) * 0.2, Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5, 0.8); } }
      sparks.update(dt);
    },
    light() { lit = true; if (ign < 0) ign = 0; return 1.0; },
    dispose() { lamp.dispose?.(); group.removeFromParent(); B.dispose(); },
  };
  return h;
}

/* ================================================================ KINDLING: a bundle of fuel cell canisters */
export function kindling(scene) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  const prof = [[0, 0], [0.07, 0], [0.086, 0.014], [0.09, 0.05], [0.09, 0.29], [0.075, 0.335], [0.05, 0.35], [0, 0.35]].map(([r, y]) => new THREE.Vector2(r, y));
  const bodyG = []; const capG = []; const hzG = []; const winG = []; const labG = [];
  /* one cell in its own frame (axis = y, base at 0, front = +z); xf places it */
  const cell = (xf) => {
    const wnd = bx(0.03, 0.17, 0.008, Math.sin(0.35) * 0.0905, 0.2, Math.cos(0.35) * 0.0905, 0, 0.35);
    const lb = new THREE.PlaneGeometry(0.075, 0.095); lb.rotateY(-1.0); lb.translate(Math.sin(-1.0) * 0.0925, 0.19, Math.cos(-1.0) * 0.0925);
    const parts = [[new THREE.LatheGeometry(prof, 16), bodyG], [cy(0.05, 0.05, 0.05, 12, 0, 0.375, 0), capG], [cy(0.034, 0.034, 0.04, 10, 0, 0.42, 0), capG], [tor(0.05, 0.01, 5, 12, 0, 0.35, 0, Math.PI / 2), capG], [cyo(0.0915, 0.0915, 0.07, 16, 0, 0.11, 0), hzG], [wnd, winG], [lb, labG]];
    for (const [g, list] of parts) { xf(g); list.push(g); }
  };
  cell((g) => g.translate(-0.105, 0, 0)); cell((g) => { g.rotateY(-0.7); g.translate(0.105, 0, 0.01); });
  /* the lying cell: axis along x, yawed, resting on the ground in front of the two */
  cell((g) => { g.translate(0, -0.21, 0); g.rotateZ(Math.PI / 2); g.rotateY(0.28); g.translate(0.02, 0.092, 0.21); });
  mesh(B.g(merge(bodyG)), B.m(new THREE.MeshStandardMaterial({ color: 0xb4461a, roughness: 0.5, metalness: 0.45 })), group);
  mesh(B.g(merge(capG)), M.steel, group, false);
  for (const g of hzG) bakeUV(g, 0.12);
  mesh(B.g(merge(hzG)), M.haz, group, false);
  const winM = glow(B, PAL.amber, 0.75); mesh(B.g(merge(winG)), winM, group, false);
  const labT = tex(B, 64, 80, (g, w, h) => { g.fillStyle = '#d8aa1e'; g.fillRect(0, 0, w, h); g.fillStyle = '#101114'; g.beginPath(); g.moveTo(38, 8); g.lineTo(14, 44); g.lineTo(30, 44); g.lineTo(24, 72); g.lineTo(50, 32); g.lineTo(34, 32); g.closePath(); g.fill(); });
  mesh(B.g(merge(labG)), B.m(new THREE.MeshStandardMaterial({ map: labT, roughness: 0.6 })), group, false);
  /* the strap round the two upright cells, a second one near the caps, and a carry loop */
  const strap = [put(new THREE.TorusGeometry(0.105, 0.011, 5, 24), 0, 0.22, 0.005, Math.PI / 2, 0, 0, 1.95, 1, 1), put(new THREE.TorusGeometry(0.105, 0.011, 5, 24), 0, 0.31, 0.005, Math.PI / 2, 0, 0, 1.95, 1, 1), put(new THREE.TorusGeometry(0.105, 0.011, 5, 14, Math.PI), 0, 0.4, 0.005), bx(0.045, 0.06, 0.03, 0.205, 0.265, 0.0)];
  mesh(B.g(merge(strap)), M.rubber, group, false);
  const led = glow(B, PAL.green, 1.2); led.toneMapped = false; mesh(B.g(merge([sph(0.012, -0.105, 0.43, 0.04), sph(0.012, 0.105, 0.43, 0.05)])), led, group, false);
  let t = Math.random() * 5;
  return { group, update(dt) { t += dt; const k = 0.4 + 0.6 * (Math.sin(t * 2.4) > 0.3 ? 1 : 0.2); led.color.setRGB(0.1 * k, 1.1 * k, 0.5 * k); winM.color.setRGB(0.7 + 0.06 * Math.sin(t * 1.3), 0.36, 0.06); }, dispose() { group.removeFromParent(); B.dispose(); } };
}

/* ================================================================ MARKER: a holo plate in a steel frame that shows the name */
export function marker(scene, { name = '', accent = PAL.cyan, serif } = {}) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  const font = serif || FONT; const PW = 0.92; const PH = 1.22; const PY = 1.12;
  mesh(B.g(bakeUV(merge([bx(1.2, 0.22, 0.56, 0, 0.11, 0), bx(1.0, 0.04, 0.4, 0, 0.24, 0)]), 0.6)), M.conc, group);
  const hzg = [bx(1.2, 0.1, 0.03, 0, 0.14, 0.295), bx(1.2, 0.1, 0.03, 0, 0.14, -0.295)]; for (const g of hzg) bakeUV(g, 0.25);
  mesh(B.g(merge(hzg)), M.haz, group, false);
  const fr = [bx(0.07, 1.7, 0.09, -0.54, 1.07, 0), bx(0.07, 1.7, 0.09, 0.54, 1.07, 0), bx(1.2, 0.09, 0.14, 0, 1.79, 0), bx(1.12, 0.07, 0.12, 0, 0.5, 0), bx(PW + 0.06, PH + 0.06, 0.05, 0, PY, -0.0),
    bx(0.05, 0.3, 0.2, -0.54, 0.4, 0.0), bx(0.05, 0.3, 0.2, 0.54, 0.4, 0.0), cy(0.03, 0.03, 0.35, 8, 0.3, 0.35, -0.12, 0.4, 0, 0), cy(0.1, 0.1, 0.04, 10, 0, 1.86, 0)];
  mesh(B.g(merge(fr)), M.steel, group);
  mesh(B.g(merge([bx(PW + 0.1, 0.03, 0.09, 0, PY + PH / 2 + 0.03, 0), bx(PW + 0.1, 0.03, 0.09, 0, PY - PH / 2 - 0.03, 0), bx(0.03, PH, 0.09, -PW / 2 - 0.035, PY, 0), bx(0.03, PH, 0.09, PW / 2 + 0.035, PY, 0)])), M.light, group, false);
  /* the name face */
  const CW = 512; const CH = 672; const cvn = document.createElement('canvas'); cvn.width = CW; cvn.height = CH; const g2 = cvn.getContext('2d');
  const nameT = B.t(new THREE.CanvasTexture(cvn)); nameT.anisotropy = 8;
  let drawn = '';
  const drawName = (nm) => {
    const text = (nm || '').toUpperCase().slice(0, 24); if (text + font === drawn) return; drawn = text + font;
    g2.clearRect(0, 0, CW, CH); g2.fillStyle = '#000'; g2.fillRect(0, 0, CW, CH);
    /* the frame marks and barcode in green; the name and rule in red (two masks in one texture) */
    g2.strokeStyle = '#00ff00'; g2.lineWidth = 5; for (const [x, y, sx, sy] of [[26, 26, 1, 1], [CW - 26, 26, -1, 1], [26, CH - 26, 1, -1], [CW - 26, CH - 26, -1, -1]]) { g2.beginPath(); g2.moveTo(x, y + 46 * sy); g2.lineTo(x, y); g2.lineTo(x + 46 * sx, y); g2.stroke(); }
    const r = seeded(11); g2.fillStyle = '#00ff00'; let bxp = 96; while (bxp < CW - 96) { const w = 2 + Math.floor(r() * 5); g2.fillRect(bxp, CH - 130, w, 52); bxp += w + 2 + Math.floor(r() * 5); }
    g2.fillRect(96, 74, 120, 6);
    const lines = text.split(' ').length > 1 && text.length > 9 ? [text.split(' ')[0], text.split(' ').slice(1).join(' ')] : [text];
    const fit = (s) => { let px = lines.length > 1 ? 150 : 215; g2.font = `700 ${px}px ${font}`; while (g2.measureText(s).width > CW - 90 && px > 28) { px -= 4; g2.font = `700 ${px}px ${font}`; } return px; };
    g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillStyle = '#ff0000'; g2.shadowColor = '#ff0000'; g2.shadowBlur = 14;
    lines.forEach((ln, i) => { const px = fit(ln); const y = CH * 0.45 + (i - (lines.length - 1) / 2) * 140; g2.font = `700 ${px}px ${font}`; g2.fillText(ln, CW / 2, y); g2.fillText(ln, CW / 2, y); });
    g2.shadowBlur = 0; g2.fillRect(70, CH * 0.45 + lines.length * 75 + 12, CW - 140, 7);
    nameT.needsUpdate = true;
  };
  drawName(name);
  const dispM = B.m(new THREE.ShaderMaterial({
    uniforms: { uMap: { value: nameT }, uReveal: { value: 0 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(0.02, 0.62, 0.8) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D uMap; uniform float uReveal; uniform float uTime; uniform vec3 uCol; varying vec2 vUv;
      float hh(float n){ return fract(sin(n * 91.3) * 43758.5453); }
      void main(){
        vec4 tx = texture2D(uMap, vUv); float yy = 1.0 - vUv.y; float live = step(0.0001, uReveal);
        float head = uReveal * 1.25 - 0.08; float vis = smoothstep(head, head - 0.05, yy) * live;
        float flick = 1.0 - 0.2 * step(0.88, hh(floor(uTime * 22.0) + floor(yy * 36.0))) * (1.0 - smoothstep(0.85, 1.0, uReveal));
        float scan = 0.9 + 0.1 * sin(vUv.y * 380.0);
        vec3 col = vec3(0.004, 0.014, 0.02) + vec3(0.0, 0.012, 0.018) * (0.5 + 0.5 * sin(vUv.y * 90.0 + uTime * 0.6)) * 0.4;
        col += uCol * 0.09 * (1.0 - live) * (0.75 + 0.25 * sin(vUv.y * 140.0 - uTime * 3.0)) + uCol * tx.g * 0.25 * (1.0 - live); /* a lit, waiting plate (it read as a black box) */
        col += uCol * (tx.r + tx.g * 0.5) * vis * flick * scan;
        col += uCol * smoothstep(0.014, 0.0, abs(yy - head)) * live * step(head, 1.12) * 0.7;
        float sb = step(0.93, vUv.x) * step(vUv.x, 0.965) * step(0.03, vUv.y) * step(vUv.y, 0.05) * step(0.5, fract(uTime * 0.7)) * (1.0 - live);
        col += vec3(0.0, 0.25, 0.3) * sb;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  const faceF = new THREE.PlaneGeometry(PW, PH); faceF.translate(0, PY, 0.03); const faceB = new THREE.PlaneGeometry(PW, PH); faceB.rotateY(Math.PI); faceB.translate(0, PY, -0.03);
  const face = mesh(B.g(merge([faceF, faceB])), dispM, group, false);
  const barM = glow(B, accent, 0.12); mesh(B.g(merge([bx(0.62, 0.025, 0.02, 0, 1.745, 0.075), bx(0.62, 0.025, 0.02, 0, 1.745, -0.075)])), barM, group, false);
  let reveal = 0; let carving = false; let ct = 0; let t = 0;
  group.scale.setScalar(1.45); /* the plate reads from the road (it was never seen) */
  const h = {
    group, update(dt) {
      dt = Math.min(dt, 0.05); t += dt; dispM.uniforms.uTime.value = t;
      if (carving) { ct += dt; reveal = sstep(0, 1.5, ct); dispM.uniforms.uReveal.value = reveal; }
      const k = 0.12 + 0.78 * reveal * (0.92 + 0.08 * Math.sin(t * 3)); barM.color.setRGB(0.05 * k, 0.88 * k, 1.0 * k);
    },
    carve() { if (!carving) { carving = true; ct = 0; drawName(name); document.fonts?.load?.(`700 100px ${font}`).then(() => { drawName(name); }).catch(() => {}); } return 1.5; },
    dispose() { group.removeFromParent(); B.dispose(); },
  };
  return h;
}

/* ================================================================ GATE: a security checkpoint arch with barrier arms */
export function gate(scene, { accent = PAL.cyan } = {}) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  const GW = 2.6; const PX = GW + 0.55; const PH = 5.3; const BEAM_Y = 5.75;
  /* concrete plinths and wedge barriers */
  const conc = []; for (const sx of [-1, 1]) { conc.push(bx(1.5, 0.3, 1.4, sx * PX, 0.15, 0), bx(0.5, 0.7, 1.9, sx * (PX + 1.0), 0.35, 0.0), bx(0.5, 0.7, 1.9, sx * (PX + 1.0), 0.35, 0.0, 0, 0, 0)); }
  mesh(B.g(bakeUV(merge(conc), 0.7)), M.conc, group);
  /* the lower pylon skirt carries hazard stripes */
  const hz = []; for (const sx of [-1, 1]) hz.push(bx(1.14, 0.75, 1.04, sx * PX, 0.675, 0)); for (const g of hz) bakeUV(g, 0.3);
  mesh(B.g(merge(hz)), M.haz, group);
  const st = [];
  for (const sx of [-1, 1]) {
    st.push(bx(1.1, PH - 1.05, 1.0, sx * PX, 1.05 + (PH - 1.05) / 2, 0), bx(1.2, 0.12, 1.1, sx * PX, PH, 0), bx(0.12, PH - 1.2, 1.06, sx * (PX - 0.58), 3.0, 0), bx(0.12, 0.5, 1.2, sx * (PX + 0.5), 4.8, 0));
    for (let k = 0; k < 6; k++) st.push(bx(0.9, 0.025, 0.02, sx * PX, 1.8 + k * 0.07, 0.505), bx(0.9, 0.025, 0.02, sx * PX, 1.8 + k * 0.07, -0.505));
    /* the reader: a post on the inner face with a screen */
    st.push(bx(0.2, 0.55, 0.36, sx * (GW - 0.12), 1.35, 0), bx(0.14, 0.1, 0.3, sx * (GW - 0.12), 1.7, 0));
    /* signal head, camera dome mounts, hinge blocks */
    st.push(bx(0.3, 0.86, 0.26, sx * (GW - 0.16), 3.35, 0), bx(0.36, 0.05, 0.34, sx * (GW - 0.16), 3.8, 0), bx(0.14, 0.2, 0.2, sx * (GW - 0.1), 0.95, 0));
    st.push(cy(0.05, 0.05, 0.26, 8, sx * (GW - 0.18), 4.95, 0.0));
  }
  st.push(bx(2 * PX + 1.0, 0.9, 1.0, 0, BEAM_Y, 0), bx(2 * PX + 1.5, 0.12, 1.3, 0, BEAM_Y + 0.51, 0), bx(2 * PX - 0.4, 0.1, 0.16, 0, BEAM_Y - 0.5, 0.45), bx(2 * PX - 0.4, 0.1, 0.16, 0, BEAM_Y - 0.5, -0.45));
  for (const x of [-1.4, 1.4]) st.push(bx(0.04, 0.5, 0.04, x, 4.98, 0.0), bx(0.5, 0.2, 0.34, x * 1.9, BEAM_Y + 0.67, 0), cy(0.02, 0.02, 1.1, 6, x * 1.95, BEAM_Y + 1.2, 0));
  for (const x of [-1.6, 1.6]) for (const z of [-0.44, 0.44]) st.push(cy(0.012, 0.012, 0.3, 4, x, 5.03, z));
  mesh(B.g(merge(st)), M.steel, group);
  /* camera domes (dark glass) */
  const glass = B.m(new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.08, metalness: 0.9 }));
  mesh(B.g(merge([sph(0.15, -(GW - 0.2), 5.12, 0, 0, 0, 0, 1, 0.8, 1), sph(0.15, GW - 0.2, 5.12, 0, 0, 0, 0, 1, 0.8, 1)])), glass, group, false);
  /* the sign hung under the beam, readable from both sides */
  const SW = 1024; const SH = 176; const scv = document.createElement('canvas'); scv.width = SW; scv.height = SH; const sg = scv.getContext('2d');
  const signT = B.t(new THREE.CanvasTexture(scv)); signT.colorSpace = THREE.SRGBColorSpace; signT.anisotropy = 8;
  const drawSign = (go) => {
    sg.fillStyle = '#05080a'; sg.fillRect(0, 0, SW, SH); const col = go ? '#46ff96' : `#${new THREE.Color(accent).getHexString()}`;
    sg.strokeStyle = col; sg.lineWidth = 8; sg.strokeRect(8, 8, SW - 16, SH - 16); sg.fillStyle = col; sg.font = `700 100px ${FONT}`; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.fillText(go ? 'CLEARED' : 'CHECKPOINT 9', SW / 2, SH / 2 + 6);
    sg.font = `700 90px ${FONT}`; const a = go ? '>>' : '||'; sg.textAlign = 'left'; sg.fillText(a, 50, SH / 2 + 4); sg.textAlign = 'right'; sg.fillText(a, SW - 50, SH / 2 + 4);
    sg.fillStyle = 'rgba(0,0,0,0.45)'; for (let y = 0; y < SH; y += 4) sg.fillRect(0, y, SW, 1.4); signT.needsUpdate = true;
  };
  drawSign(false);
  const signM = B.m(new THREE.MeshBasicMaterial({ map: signT, color: new THREE.Color(0.8, 0.8, 0.8) }));
  const SWD = 3.9; const SHT = SWD * SH / SW; const sf = new THREE.PlaneGeometry(SWD, SHT); sf.translate(0, 4.45 - 0.05, 0.1); const sb = new THREE.PlaneGeometry(SWD, SHT); sb.rotateY(Math.PI); sb.translate(0, 4.45 - 0.05, -0.1);
  mesh(B.g(merge([sf, sb])), signM, group, false);
  mesh(B.g(merge([bx(SWD + 0.1, SHT + 0.06, 0.1, 0, 4.4, 0), ...[-1.6, -0.5, 0.5, 1.6].map((x) => bx(0.03, 0.4, 0.03, x, 4.8, 0))])), M.plate, group);
  /* LED strips: pylon inner faces, the beam underside, the reader screens */
  const stripM = glow(B, accent, 0.85); const stripG = [bx(0.07, 3.6, 0.03, -(GW - 0.005), 2.9, 0.0), bx(0.07, 3.6, 0.03, GW - 0.005, 2.9, 0), bx(2 * GW - 0.3, 0.05, 0.03, 0, BEAM_Y - 0.43, 0.44), bx(2 * GW - 0.3, 0.05, 0.03, 0, BEAM_Y - 0.43, -0.44), bx(0.01, 0.28, 0.2, -(GW - 0.02), 1.4, 0), bx(0.01, 0.28, 0.2, GW - 0.02, 1.4, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stripG.push(bx(0.05, 3.6, 0.02, sx * (GW + 0.1), 3.0, sz * 0.512));
  for (const sz of [-1, 1]) stripG.push(bx(2 * PX - 0.5, 0.05, 0.02, 0, BEAM_Y - 0.28, sz * 0.512), bx(2 * PX - 0.5, 0.04, 0.02, 0, BEAM_Y + 0.3, sz * 0.512));
  mesh(B.g(merge(stripG)), stripM, group, false);
  /* signal lamps (two faces each): red on top, green below */
  const redM = glow(B, PAL.red, 0.9); const greenM = glow(B, PAL.green, 0.9);
  const lampG = (y) => { const l = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) l.push(cy(0.085, 0.085, 0.04, 14, sx * (GW - 0.16), y, sz * 0.14, Math.PI / 2)); return l; };
  const redG = lampG(3.6); const greenG = lampG(3.15);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) redG.push(cy(0.03, 0.03, 0.03, 8, sx * (GW - 0.1) - (sx * 0.0), 0.95, 0));
  mesh(B.g(merge(redG)), redM, group, false); mesh(B.g(merge(greenG)), greenM, group, false);
  /* the barrier arms: hinged on the inner faces at 0.95 m, hazard striped, red tips */
  const armG = bx(GW - 0.14, 0.13, 0.13, (GW - 0.14) / 2, 0, 0); bakeUV(armG, 0.26); B.g(armG);
  const armL = new THREE.Group(); armL.position.set(-(GW - 0.02), 0.95, 0); group.add(armL); mesh(armG, M.haz, armL);
  const armR = new THREE.Group(); armR.position.set(GW - 0.02, 0.95, 0); armR.rotation.y = Math.PI; group.add(armR); mesh(armG, M.haz, armR);
  const tipG = B.g(merge([sph(0.05, GW - 0.14, 0.0, 0.07)])); const tipM = glow(B, PAL.red, 1.0); tipM.toneMapped = false;
  mesh(tipG, tipM, armL, false); mesh(tipG, tipM, armR, false);
  const accC = new THREE.Color(accent); let t = Math.random() * 4; let fl = -1; let ang = 0; let vel = 0; let go = 0;
  const h = {
    group, width: GW, update(dt) {
      dt = Math.min(dt, 0.05); t += dt; if (fl >= 0) fl += dt;
      const target = fl >= 0 && fl > 0.15 ? 1.38 : 0; vel += (-70 * (ang - target) - 8 * vel) * dt; ang += vel * dt; if (ang < 0) { ang = 0; vel = 0; }
      armL.rotation.z = ang; armR.rotation.z = ang;
      go = damp(go, fl >= 0 ? 1 : 0, 6, dt);
      const blink = 0.35 + 0.55 * (Math.sin(t * 3.1) > 0 ? 1 : 0.25);
      redM.color.setRGB(blink * (1 - go) * 1.0, 0.03 * blink * (1 - go), 0.03 * blink * (1 - go));
      greenM.color.setRGB(0.03 * go, (0.06 + 0.84 * go) * (0.9 + 0.1 * Math.sin(t * 6)), 0.2 * go);
      tipM.color.setRGB(1.0 * (1 - go) * (0.3 + 0.7 * (Math.sin(t * 6) > 0 ? 1 : 0)), 0.1 + go * 0.9, 0.05 + go * 0.3);
      stripM.color.setRGB(lerp(accC.r * 0.85, 0.05, go), lerp(accC.g * 0.85, 0.85, go), lerp(accC.b * 0.85, 0.4, go));
    },
    flare() { if (fl < 0) { fl = 0; drawSign(true); } },
    dispose() { group.removeFromParent(); B.dispose(); },
  };
  return h;
}

/* ================================================================ SIGN: three trail clues */
export function sign(scene, { i = 0 } = {}) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  let upd = () => {}; const idx = ((i % 3) + 3) % 3;
  if (idx === 0) {
    /* what it took: a dropped data shard still pinging */
    const sh = new THREE.Shape(); sh.moveTo(-0.25, -0.16); sh.lineTo(0.25, -0.16); sh.lineTo(0.25, 0.08); sh.lineTo(0.15, 0.16); sh.lineTo(-0.25, 0.16); sh.lineTo(-0.25, -0.16);
    const slabG = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
    const faceG = new THREE.ShapeGeometry(sh); { const p = faceG.attributes.position; const uv = faceG.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, (p.getX(k) + 0.25) / 0.5, (p.getY(k) + 0.16) / 0.32); }
    const circ = tex(B, 256, 160, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3ef2ff'; g.lineWidth = 3; const r = seeded(21);
      for (let k = 0; k < 14; k++) { let x = 20 + r() * 200; let y = 14 + r() * 130; g.beginPath(); g.moveTo(x, y); for (let n = 0; n < 4; n++) { if (r() < 0.5) x += (r() - 0.5) * 90; else y += (r() - 0.5) * 60; g.lineTo(clamp(x, 10, 246), clamp(y, 10, 150)); } g.stroke(); g.fillStyle = '#3ef2ff'; g.fillRect(x - 4, y - 4, 8, 8); }
      g.fillStyle = '#3ef2ff'; g.fillRect(96, 52, 64, 56); g.fillStyle = '#000'; g.fillRect(104, 60, 48, 40); g.fillStyle = '#3ef2ff'; for (let k = 0; k < 4; k++) g.fillRect(108 + k * 11, 66, 6, 28);
      g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(238, 40); g.lineTo(200, 64); g.lineTo(212, 98); g.lineTo(176, 150); g.stroke();
    });
    const shard = new THREE.Group(); shard.position.set(0.0, 0.07, 0.0); shard.rotation.set(-Math.PI / 2 + 0.16, 0.5, 0.1); shard.scale.setScalar(1.4); group.add(shard);
    mesh(B.g(slabG), B.m(new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.2, metalness: 0.8 })), shard);
    const faceM = B.m(new THREE.MeshStandardMaterial({ color: 0x05080a, roughness: 0.2, metalness: 0.3, emissive: 0xffffff, emissiveMap: circ, emissiveIntensity: 0.9 }));
    const face = mesh(B.g(faceG), faceM, shard, false); face.position.z = 0.0375;
    const ledM = glow(B, PAL.red, 1.0); ledM.toneMapped = false; const led = mesh(B.g(bx(0.025, 0.025, 0.01, 0.2, -0.12, 0)), ledM, shard, false); led.position.z = 0.036;
    /* a bent connector stub, a snapped lanyard and a bolt as debris */
    const cableC = new THREE.CatmullRomCurve3([new THREE.Vector3(0.3, 0.012, 0.1), new THREE.Vector3(0.45, 0.014, 0.2), new THREE.Vector3(0.62, 0.012, 0.12), new THREE.Vector3(0.7, 0.012, 0.28), new THREE.Vector3(0.62, 0.012, 0.4)]);
    const lan = B.g(new THREE.TubeGeometry(cableC, 24, 0.012, 5, false));
    mesh(B.g(merge([lan, cy(0.03, 0.03, 0.05, 8, 0.62, 0.02, 0.4, Math.PI / 2), cy(0.018, 0.018, 0.08, 6, -0.45, 0.02, 0.15, Math.PI / 2, 0.7)])), M.rubber, group, false);
    const ringsM = [0, 1].map(() => B.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cyan).multiplyScalar(0.8), transparent: true, opacity: 0, depthWrite: false })));
    const rg = B.g(new THREE.RingGeometry(0.43, 0.5, 40).rotateX(-Math.PI / 2));
    const rms = ringsM.map((m) => { const r = new THREE.Mesh(rg, m); r.position.y = 0.012; r.frustumCulled = false; group.add(r); return r; });
    let t = 0;
    upd = (dt) => {
      t += dt; faceM.emissiveIntensity = 0.8 + 0.25 * Math.sin(t * 3) + (Math.sin(t * 37) > 0.97 ? -0.3 : 0);
      ledM.color.setRGB(Math.sin(t * 5) > 0.2 ? 1.1 : 0.05, 0.03, 0.03);
      rms.forEach((r, n) => { const ph = (t * 0.55 + n * 0.5) % 1; r.scale.setScalar(0.3 + ph * 1.25); ringsM[n].opacity = 0.75 * (1 - ph) * (1 - ph); });
    };
  } else if (idx === 1) {
    /* whose it is: the enemy's mark sprayed over a concrete wall panel, a can dropped at its foot */
    const WW = 1.3; const WH = 1.05; const cvw = 640; const cvh = 516;
    const spray = (g, pts, col, w, a = 0.5) => { g.strokeStyle = col; g.lineWidth = w * 1.4; g.lineCap = 'round'; g.globalAlpha = a * 0.7; g.beginPath(); pts.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); g.globalAlpha = 1; g.fillStyle = col; for (let k = 0; k < pts.length - 1; k++) { const [x0, y0] = pts[k]; const [x1, y1] = pts[k + 1]; const n = Math.max(6, Math.hypot(x1 - x0, y1 - y0) * 2); for (let q = 0; q < n; q++) { const u = q / n; const ox = (Math.random() + Math.random() + Math.random() - 1.5) * w; const oy = (Math.random() + Math.random() + Math.random() - 1.5) * w; g.globalAlpha = a * (0.4 + Math.random() * 0.6); const s = 1 + Math.random() * 2.2; g.fillRect(x0 + (x1 - x0) * u + ox, y0 + (y1 - y0) * u + oy, s, s); } } g.globalAlpha = 1; };
    const glyph = (g, col, w, a) => {
      const cx = cvw / 2; const cy0 = cvh * 0.47; const R = 215;
      spray(g, [[cx, cy0 - R], [cx + R, cy0], [cx, cy0 + R], [cx - R, cy0], [cx, cy0 - R]], col, w, a);
      spray(g, [[cx - 135, cy0], [cx - 50, cy0 - 62], [cx + 50, cy0 - 62], [cx + 135, cy0], [cx + 50, cy0 + 62], [cx - 50, cy0 + 62], [cx - 135, cy0]], col, w * 0.9, a);
      spray(g, [[cx, cy0 - 90], [cx, cy0 + 90]], col, w * 1.8, a); for (let q = 0; q < 30; q++) { g.globalAlpha = 0.8; g.fillRect(cx - 9 + Math.random() * 18, cy0 - 18 + Math.random() * 36, 2.4, 2.4); } g.globalAlpha = 1;
      for (const k of [-1, 0, 1]) spray(g, [[cx + k * 70, cy0 - R + 20 - Math.abs(k) * 6], [cx + k * 70, cy0 - R - 56 + Math.abs(k) * 22]], col, w, a);
      spray(g, [[cx - 215, cy0 + 205], [cx + 215, cy0 - 205]], col, w * 1.2, a * 0.8);
      for (const [dx, len] of [[-R + 60, 70], [0, 100], [R - 55, 55]]) spray(g, [[cx + dx, cy0 + R - Math.abs(dx) * 0.9], [cx + dx, cy0 + R - Math.abs(dx) * 0.9 + len]], col, 3, a);
    };
    const wallT = tex(B, cvw, cvh, (g, w, h) => {
      drawConcrete(g, w, h); const r = seeded(3); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(20,22,26,${0.1 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 2, 20 + r() * 120); }
      spray(g, [[40, 440], [130, 380], [200, 450], [290, 390]], '#2bd8e8', 4, 0.5); spray(g, [[460, 470], [540, 400], [600, 460]], '#e0a030', 4, 0.45);
      glyph(g, '#ff2fa0', 7, 0.6); glyph(g, '#ff7ac8', 3, 0.5);
    });
    const emT = tex(B, cvw, cvh, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); glyph(g, '#ff2fa0', 7, 0.6); });
    const wallM = B.m(new THREE.MeshStandardMaterial({ map: wallT, color: 0x6c7078, roughness: 0.9, emissive: 0xffffff, emissiveMap: emT, emissiveIntensity: 0.8 }));
    const slab = new THREE.Mesh(B.g(new THREE.BoxGeometry(WW, WH, 0.16)), [M.conc, M.conc, M.conc, M.conc, wallM, M.conc]); slab.position.set(0, 0.16 + WH / 2, 0); slab.castShadow = true; slab.receiveShadow = true; group.add(slab);
    mesh(B.g(merge([bx(0.34, 0.16, 0.6, -0.42, 0.08, 0.05), bx(0.34, 0.16, 0.6, 0.42, 0.08, 0.05)])), M.conc, group, true);
    /* a rusted rebar stub and the dropped can */
    mesh(B.g(merge([cy(0.033, 0.033, 0.16, 12, 0.25, 0.035, 0.34, 0, 0, Math.PI / 2, 1, 1, 1)])), B.m(new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.7 })), group, false);
    mesh(B.g(cy(0.026, 0.026, 0.05, 10, 0.36, 0.035, 0.34, 0, 0, Math.PI / 2)), glow(B, 0xff2fa0, 0.8), group, false);
    upd = (dt) => { wallM.emissiveIntensity = 0.45 + 0.08 * Math.sin(performance.now() * 0.002); };
  } else {
    /* where it went: a dead charging pad and its post, cold */
    const padT = tex(B, 256, 256, (g, w, h) => {
      g.fillStyle = '#15181c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2c3138'; g.lineWidth = 6; for (const r of [60, 95, 120]) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, TAU); g.stroke(); }
      g.fillStyle = '#272b31'; g.beginPath(); g.moveTo(138, 62); g.lineTo(100, 138); g.lineTo(124, 138); g.lineTo(112, 198); g.lineTo(156, 116); g.lineTo(130, 116); g.closePath(); g.fill();
      const r = seeded(31); for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '6,6,8' : '70,66,60'},${0.12 + r() * 0.25})`; g.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 4); }
      const sc = g.createRadialGradient(w * 0.45, h * 0.55, 8, w * 0.45, h * 0.55, 86); sc.addColorStop(0, 'rgba(0,0,0,0.7)'); sc.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sc; g.fillRect(0, 0, w, h);
    });
    const padTop = new THREE.CircleGeometry(0.5, 6); padTop.rotateX(-Math.PI / 2); padTop.rotateY(Math.PI / 6); padTop.translate(0, 0.081, 0);
    { const p = padTop.attributes.position; const uv = padTop.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / 1.0 + 0.5, p.getZ(k) / 1.0 + 0.5); }
    const padE = tex(B, 256, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff2a20'; g.beginPath(); g.moveTo(138, 62); g.lineTo(100, 138); g.lineTo(124, 138); g.lineTo(112, 198); g.lineTo(156, 116); g.lineTo(130, 116); g.closePath(); g.fill(); });
    const padM = B.m(new THREE.MeshStandardMaterial({ map: padT, roughness: 0.65, metalness: 0.15, emissive: 0xffffff, emissiveMap: padE, emissiveIntensity: 0 }));
    mesh(B.g(padTop), padM, group, false);
    mesh(B.g(merge([cy(0.56, 0.58, 0.08, 6, 0, 0.04, 0, 0, Math.PI / 6)])), M.plate, group);
    const dimM = glow(B, PAL.cyan, 0.045); mesh(B.g(merge([put(new THREE.RingGeometry(0.22, 0.235, 36).rotateX(-Math.PI / 2), 0, 0.083, 0), put(new THREE.RingGeometry(0.34, 0.352, 36).rotateX(-Math.PI / 2), 0, 0.083, 0)])), dimM, group, false);
    /* the post: a slim charger with a dead screen, a cable down to a plug on the pad */
    const post = [bx(0.16, 1.1, 0.16, 0.78, 0.55, -0.1), bx(0.3, 0.34, 0.14, 0.78, 1.17, -0.1), bx(0.3, 0.05, 0.2, 0.78, 0.04, -0.1), cy(0.025, 0.025, 0.16, 6, 0.78, 0.7, 0.0, Math.PI / 2)];
    mesh(B.g(merge(post)), M.steel, group);
    const scrT = tex(B, 128, 96, (g, w, h) => { g.fillStyle = '#06080a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a1210'; g.lineWidth = 5; g.beginPath(); g.moveTo(40, 24); g.lineTo(88, 72); g.moveTo(88, 24); g.lineTo(40, 72); g.stroke(); g.strokeStyle = 'rgba(80,90,100,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 70); g.lineTo(46, 52); g.lineTo(70, 96); g.moveTo(46, 52); g.lineTo(80, 20); g.stroke(); });
    const scrM = B.m(new THREE.MeshBasicMaterial({ map: scrT, color: new THREE.Color(0.5, 0.5, 0.5) }));
    const scr = new THREE.Mesh(B.g(new THREE.PlaneGeometry(0.24, 0.24 * 96 / 128)), scrM); scr.position.set(0.78, 1.17, -0.026); scr.rotation.y = Math.PI; group.add(scr);
    const scr2 = new THREE.Mesh(scr.geometry, scrM); scr2.position.set(0.78, 1.17, -0.174); group.add(scr2);
    const cab = new THREE.CatmullRomCurve3([new THREE.Vector3(0.78, 0.7, 0.0), new THREE.Vector3(0.9, 0.3, 0.2), new THREE.Vector3(0.7, 0.02, 0.5), new THREE.Vector3(0.4, 0.016, 0.52), new THREE.Vector3(0.2, 0.09, 0.3)]);
    mesh(B.g(merge([new THREE.TubeGeometry(cab, 28, 0.016, 6, false), bx(0.07, 0.05, 0.12, 0.17, 0.09, 0.27, 0, 0.5)])), M.rubber, group, false);
    /* a spent fuel cell on its side and a crushed foil wrap */
    mesh(B.g(merge([cy(0.08, 0.08, 0.34, 12, -0.78, 0.085, 0.3, 0, 0.5, Math.PI / 2), cy(0.035, 0.035, 0.06, 8, -0.92, 0.085, 0.37, 0, 0.5, Math.PI / 2)])), B.m(new THREE.MeshStandardMaterial({ color: 0x5a2c18, roughness: 0.6, metalness: 0.5 })), group);
    const ledM = glow(B, PAL.red, 1.0); ledM.toneMapped = false; mesh(B.g(bx(0.04, 0.025, 0.012, 0.78, 1.0, -0.186)), ledM, group, false); mesh(B.g(bx(0.04, 0.025, 0.012, 0.78, 1.0, -0.014)), ledM, group, false);
    let t = 0;
    upd = (dt) => { t += dt; const on = (t % 3.2) < 0.18; ledM.color.setRGB(on ? 1.0 : 0.04, 0.02, 0.02); padM.emissiveIntensity = on ? 0.9 : 0.0; };
  }
  /* the clue was parking-meter sized and read from nowhere: each sign now stands by a hacked street kiosk, a
     2.6 m column with a screen on each face showing what the clue is (a shard, the Tower's mark, a boot print), so it reads
     from 30 m down the street. The small clue piece stays at its foot. */
  {
    const words = [['TAKEN', 'DATA SHARD'], ['MARKED', 'TOWER SIGIL'], ['RESTED', 'STILL WARM']][idx]; const col = ['#3ef2ff', '#ff3aa0', '#ffa53a'][idx];
    const scr = tex(B, 256, 512, (g, w, h) => {
      g.fillStyle = '#04060a'; g.fillRect(0, 0, w, h); g.strokeStyle = col; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = col; g.font = 'bold 52px "Chakra Petch", Arial'; g.textAlign = 'center'; g.fillText(words[0], w / 2, 90);
      g.lineWidth = 10; g.beginPath();
      if (idx === 0) { g.moveTo(70, 330); g.lineTo(190, 330); g.lineTo(190, 200); g.lineTo(150, 160); g.lineTo(70, 160); g.closePath(); g.stroke(); g.fillRect(105, 210, 46, 60); }
      else if (idx === 1) { g.moveTo(128, 140); g.lineTo(200, 330); g.lineTo(56, 330); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(128, 200); g.lineTo(128, 300); g.stroke(); }
      else { g.ellipse(128, 260, 46, 92, 0, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(92 + k * 24, 150, 12, 0, Math.PI * 2); g.stroke(); } }
      g.font = '30px "Chakra Petch", Arial'; g.fillStyle = '#e8f6ff'; g.fillText(words[1], w / 2, 410);
      for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y, w, 1); }
    });
    const K = new THREE.Group(); K.position.set(0.9, 0, -0.5); group.add(K);
    mesh(B.g(bakeUV(merge([bx(0.62, 0.3, 0.62, 0, 0.15, 0), bx(0.5, 2.3, 0.5, 0, 1.45, 0), bx(0.64, 0.12, 0.64, 0, 2.66, 0)]), 0.5)), M.plate, K);
    const sm = B.m(new THREE.MeshBasicMaterial({ map: scr, toneMapped: false, color: 0xd0d0d0 }));
    for (let k = 0; k < 4; k++) { const pl = mesh(B.g(new THREE.PlaneGeometry(0.44, 0.88)), sm, K, false); const a = k * Math.PI / 2; pl.position.set(Math.sin(a) * 0.256, 1.75, Math.cos(a) * 0.256); pl.rotation.y = a; }
    const old = upd; let tk = 0; upd = (dt) => { old(dt); tk += dt; sm.color.setScalar(0.78 + (Math.sin(tk * 23) > 0.92 ? -0.25 : 0.05 * Math.sin(tk * 3))); };
  }
  return { group, update(dt) { upd(Math.min(dt, 0.05)); }, dispose() { group.removeFromParent(); B.dispose(); } };
}

/* ================================================================ WAYMARK: a hovering marker drone (stop), a searchlight (goal) */
const BEAM_V = 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const BEAM_F = 'uniform vec3 uCol; uniform float uA; uniform float uPow; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.3); float a = uA * pow(clamp(vH, 0.0, 1.0), uPow) * f; gl_FragColor = vec4(uCol, a); }';
export function waymark(scene, { kind = 'stop', accent = PAL.cyan } = {}) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  const acc = new THREE.Color(accent);
  if (kind !== 'goal') {
    const HOV = 10.2; const RS = 2.3; const rig = new THREE.Group(); rig.position.y = HOV; rig.scale.setScalar(RS); group.add(rig);
    /* the drone: an octagonal body, a ring light, four rotor pods, a down lens */
    const dr = [cy(0.34, 0.4, 0.1, 8, 0, 0, 0), sph(0.2, 0, 0.05, 0, 0, 0, 0, 1, 0.55, 1), cy(0.1, 0.12, 0.12, 12, 0, -0.1, 0), cy(0.01, 0.01, 0.34, 4, 0, 0.3, 0)];
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.785; dr.push(cy(0.03, 0.03, 0.04, 8, Math.cos(a) * 0.56, 0.02, Math.sin(a) * 0.56), bx(0.34, 0.03, 0.04, Math.cos(a) * 0.3, 0.0, Math.sin(a) * 0.3, 0, -a)); }
    const body = new THREE.Group(); rig.add(body); mesh(B.g(merge(dr)), M.steel, body);
    const rotM = B.m(new THREE.MeshBasicMaterial({ color: 0x1a1d22, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    mesh(B.g(merge(Array.from({ length: 4 }, (_, k) => { const a = (k / 4) * TAU + 0.785; return put(new THREE.CircleGeometry(0.2, 18), Math.cos(a) * 0.56, 0.06, Math.sin(a) * 0.56, -Math.PI / 2); }))), rotM, body, false);
    const ringM = glow(B, accent, 0.9); mesh(B.g(tor(0.42, 0.03, 5, 32, 0, -0.02, 0, Math.PI / 2)), ringM, body, false);
    const coreM = B.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(acc).multiplyScalar(2.2), toneMapped: false })); mesh(B.g(sph(0.26, 0, 0.3, 0)), coreM, body, false);
    const navM = glow(B, accent, 2.6, { toneMapped: false }); mesh(B.g(merge([0, 1, 2, 3].map((k) => sph(0.055, Math.cos(k * 1.571) * 0.42, -0.02, Math.sin(k * 1.571) * 0.42)))), navM, body, false);
    const lensM = glow(B, 0xcfe6ff, 0.8); mesh(B.g(cy(0.07, 0.07, 0.02, 12, 0, -0.17, 0)), lensM, body, false);
    const ledM = glow(B, PAL.red, 1.0); ledM.toneMapped = false; mesh(B.g(sph(0.02, 0, 0.47, 0)), ledM, body, false);
    /* the chevron stack: two crossed stacks so one face always shows; instanced, colour chases downward */
    const chev = B.g(merge([bx(1.28, 0.3, 0.1, -0.56, 0.12, 0, 0, 0, -0.53), bx(1.28, 0.3, 0.1, 0.56, 0.12, 0, 0, 0, 0.53)]));
    const chM = B.m(new THREE.MeshBasicMaterial({ color: 0xffffff })); const chevs = new THREE.InstancedMesh(chev, chM, 6); chevs.frustumCulled = false; rig.add(chevs);
    const _p = new THREE.Vector3(); const _qq2 = new THREE.Quaternion(); const _sc = new THREE.Vector3(); const _cc = new THREE.Color();
    const SC = [1.0, 0.86, 0.72]; for (let n = 0; n < 6; n++) { const lvl = n % 3; const cross = n < 3 ? 0 : Math.PI / 2; _qq2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), cross); _dm.compose(_p.set(0, -0.95 - lvl * 0.62, 0), _qq2, _sc.setScalar(SC[lvl])); chevs.setMatrixAt(n, _dm); chevs.setColorAt(n, _cc.set(0)); }
    /* the soft down-light cone and the ground ring */
    const coneG = B.g(new THREE.ConeGeometry(1, 1, 28, 1, true)); coneG.translate(0, 0.5, 0);
    const coneM = B.m(new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(acc).multiplyScalar(0.8) }, uA: { value: 0.12 }, uPow: { value: 1.6 } }, vertexShader: BEAM_V, fragmentShader: BEAM_F, transparent: true, depthWrite: true, side: THREE.DoubleSide }));
    const cone = new THREE.Mesh(coneG, coneM); cone.scale.set(3.0, HOV - 0.9, 3.0); cone.position.y = 0; cone.frustumCulled = false; cone.renderOrder = 2; group.add(cone);
    const gringM = B.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(acc).multiplyScalar(0.8), transparent: true, opacity: 0.3, depthWrite: false }));
    const gring = new THREE.Mesh(B.g(new THREE.RingGeometry(1.25, 1.42, 48).rotateX(-Math.PI / 2)), gringM); gring.position.y = 0.025; group.add(gring);
    let t = Math.random() * 6; let nearS = 0;
    return {
      group, update(dt, st = {}) {
        dt = Math.min(dt, 0.05); t = st.t != null && st.t > 0 ? st.t : t + dt; const k = clamp(st.k ?? 1, 0, 1); nearS = damp(nearS, clamp(st.near || 0, 0, 1), 5, dt);
        group.visible = k > 0.005; const sc = 0.2 + 0.8 * sstep(0, 1, k); group.scale.setScalar(sc);
        rig.position.y = HOV - 1.8 * nearS + Math.sin(t * 1.4) * 0.15; rig.scale.setScalar(RS * (1 - 0.3 * nearS)); body.rotation.y = t * 0.8; body.rotation.z = Math.sin(t * 1.1) * 0.04; body.rotation.x = Math.cos(t * 0.9) * 0.04;
                for (let n = 0; n < 6; n++) { const lvl = n % 3; const ph = (t * 1.6 - (2 - lvl) * 0.33) % 1; const v = 0.5 + 0.45 * Math.pow(Math.max(0, 1 - Math.abs(ph - 0.15) * 2.4), 1.4); chevs.setColorAt(n, _cc.setRGB(acc.r * v, acc.g * v, acc.b * v)); }
        chevs.instanceColor.needsUpdate = true;
        coneM.uniforms.uA.value = 0.13 * k * (1 - 0.85 * nearS); gringM.opacity = 0.3 * k * (0.7 + 0.3 * Math.sin(t * 3)); gring.scale.setScalar(1 + 0.04 * Math.sin(t * 3));
        ledM.color.setRGB(Math.sin(t * 5) > 0.3 ? 1.1 : 0.05, 0.03, 0.03); const nv = 0.45 + 2.4 * (Math.sin(t * 5.5) > 0.2 ? 1 : 0); navM.color.setRGB(acc.r * nv, acc.g * nv, acc.b * nv); const cv2 = 1.3 + 1.1 * Math.max(0, Math.sin(t * 3)); coreM.color.setRGB(acc.r * cv2, acc.g * cv2, acc.b * cv2);
      },
      dispose() { group.removeFromParent(); B.dispose(); },
    };
  }
  /* goal: a searchlight on a lattice mast, sweeping */
  const MH = 8.5; const legs = [];
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.5; const bxp = Math.cos(a) * 0.7; const bzp = Math.sin(a) * 0.7; const txp = Math.cos(a) * 0.22; const tzp = Math.sin(a) * 0.22;
    const len = Math.hypot(txp - bxp, MH, tzp - bzp); const g = cy(0.045, 0.06, len, 6); const dir = new THREE.Vector3(txp - bxp, MH, tzp - bzp).normalize(); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.applyQuaternion(q); g.translate((bxp + txp) / 2, MH / 2, (bzp + tzp) / 2); legs.push(g); }
  for (const f of [0.18, 0.45, 0.72]) { const rr = lerp(0.7, 0.22, f) * 0.98; legs.push(tor(rr, 0.02, 4, 3, 0, MH * f, 0, Math.PI / 2, 0, 0.52)); }
  legs.push(bx(1.6, 0.18, 1.6, 0, 0.09, 0), cy(0.5, 0.5, 0.06, 10, 0, MH, 0), bx(0.9, 0.18, 0.05, 0, MH + 0.12, 0.12, 0, 0, 0), cy(0.025, 0.025, 0.5, 5, 0, MH + 0.3, -0.2));
  mesh(B.g(merge(legs)), M.steel, group);
  mesh(B.g(bakeUV(bx(1.5, 0.3, 1.5, 0, 0.15, 0), 0.5)), M.conc, group);
  const head = new THREE.Group(); head.position.y = MH + 0.62; group.add(head); const pitch = new THREE.Group(); pitch.rotation.x = -1.0; head.add(pitch);
  mesh(B.g(merge([cy(0.44, 0.4, 0.74, 20, 0, 0, 0.0, Math.PI / 2), cy(0.47, 0.47, 0.06, 20, 0, 0, 0.4, Math.PI / 2), cy(0.3, 0.3, 0.14, 12, 0, 0, -0.42, Math.PI / 2), bx(0.06, 0.5, 0.06, 0.5, -0.2, 0), bx(0.06, 0.5, 0.06, -0.5, -0.2, 0)])), M.steel, pitch);
  mesh(B.g(merge(Array.from({ length: 6 }, (_, k) => bx(0.5, 0.025, 0.2, 0, 0.24 + k * 0.045, -0.3)))), M.light, pitch, false);
  const lensM = B.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.75, 0.95) }));
  mesh(B.g(cy(0.41, 0.41, 0.02, 24, 0, 0, 0.44, Math.PI / 2)), lensM, pitch, false);
  const beamG = B.g(new THREE.ConeGeometry(1, 1, 28, 1, true)); beamG.translate(0, -0.5, 0); beamG.rotateX(-Math.PI / 2);
  /* cone: apex at the lens (y = 0), axis along +z after the rotation; the scale sets length and spread */
    const bm = B.m(new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(0.4, 0.82, 1.0).multiplyScalar(0.8) }, uA: { value: 0.3 }, uPow: { value: 0.8 } }, vertexShader: BEAM_V.replace('vH = position.y;', 'vH = 1.0 - position.z;'), fragmentShader: BEAM_F, transparent: true, depthWrite: true, side: THREE.DoubleSide }));
  const beam = new THREE.Mesh(beamG, bm); beam.scale.set(3.6, 3.6, 62); beam.position.z = 0.45; beam.frustumCulled = false; beam.renderOrder = 2; pitch.add(beam);
  const redM = glow(B, PAL.red, 1.0); redM.toneMapped = false; mesh(B.g(sph(0.09, 0, MH + 0.62 + 0.86, -0.2)), redM, group, false);
  const strobeM = B.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 1.9), toneMapped: false })); const strobe = mesh(B.g(sph(0.28, 0, 0, 0)), strobeM, pitch, false); strobe.position.z = 0.6;
  let t = Math.random() * 8;
  return {
    group, update(dt, st = {}) {
      dt = Math.min(dt, 0.05); t = st.t != null && st.t > 0 ? st.t : t + dt; const k = clamp(st.k ?? 1, 0, 1);
      group.visible = k > 0.005; group.scale.setScalar(0.25 + 0.75 * sstep(0, 1, k));
      head.rotation.y = t * 0.55; bm.uniforms.uA.value = 0.34 * k * (1 - 0.5 * clamp(st.near || 0, 0, 1));
      lensM.color.setRGB(0.3 * (0.92 + 0.08 * Math.sin(t * 9)), 0.75, 0.95); redM.color.setRGB(Math.sin(t * 2.6) > 0.4 ? 1.4 : 0.05, 0.03, 0.03); const sv = 0.5 + 1.4 * (Math.sin(t * 7) > -0.2 ? 1 : 0.15); strobeM.color.setRGB(0.5 * sv, 1.4 * sv * 0.9, 1.9 * sv * 0.9);
    },
    dispose() { group.removeFromParent(); B.dispose(); },
  };
}

/* ================================================================ CAUSE: a small hover drone orb at shoulder height */
export function cause(scene) {
  const B = bag(); const M = kit(B); const group = new THREE.Group(); scene.add(group);
  const rig = new THREE.Group(); group.add(rig); const inner = new THREE.Group(); rig.add(inner);
  const shell = B.m(new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.3, metalness: 0.85 }));
  mesh(B.g(merge([sph(0.13, 0, 0, 0), cy(0.02, 0.02, 0.14, 6, 0, 0.17, 0), cy(0.024, 0.024, 0.02, 8, 0, 0.1, 0), ...[0, 1, 2].map((k) => cy(0.022, 0.03, 0.04, 8, Math.cos(k * 2.09) * 0.07, -0.12, Math.sin(k * 2.09) * 0.07))])), shell, inner);
  mesh(B.g(merge([tor(0.131, 0.007, 5, 28, 0, 0, 0, Math.PI / 2), tor(0.131, 0.005, 5, 28, 0, 0.06, 0, Math.PI / 2, 0, 0.0)])), M.light, inner, false);
  const bandM = glow(B, PAL.cyan, 0.7); mesh(B.g(tor(0.1355, 0.006, 5, 28, 0, 0.0, 0, Math.PI / 2)), bandM, inner, false);
  const lensM = glow(B, 0xcfe6ff, 1.8, { toneMapped: false }); const lens = mesh(B.g(new THREE.CircleGeometry(0.045, 16)), lensM, inner, false); lens.position.set(0, 0.015, 0.1295);
  mesh(B.g(tor(0.052, 0.008, 5, 16)), M.rubber, inner, false).position.set(0, 0.015, 0.128);
  const gyro = new THREE.Group(); inner.add(gyro); mesh(B.g(tor(0.2, 0.008, 5, 36, 0, 0, 0, Math.PI / 2)), M.light, gyro, false);
  const ledM = glow(B, PAL.red, 1.0); ledM.toneMapped = false; mesh(B.g(sph(0.014, 0, 0.245, 0)), ledM, inner, false);
  const prev = new THREE.Vector3(); let primed = false; let t = Math.random() * 6; let vx = 0; let vz = 0; let yawA = 0; let tiltX = 0; let tiltZ = 0; const wp = new THREE.Vector3();
  return {
    group, update(dt, st = {}) {
      dt = Math.min(dt, 0.05); t = st.t != null && st.t > 0 ? st.t : t + dt;
      group.getWorldPosition(wp); if (!primed) { prev.copy(wp); primed = true; }
      const ivx = (wp.x - prev.x) / Math.max(dt, 1e-4); const ivz = (wp.z - prev.z) / Math.max(dt, 1e-4); prev.copy(wp);
      vx = damp(vx, clamp(ivx, -6, 6), 6, dt); vz = damp(vz, clamp(ivz, -6, 6), 6, dt);
      const sp = Math.hypot(vx, vz); if (sp > 0.4) { let d = Math.atan2(vx, vz) - yawA; d = Math.atan2(Math.sin(d), Math.cos(d)); yawA += d * Math.min(1, dt * 5); } else yawA += (Math.sin(t * 0.4) * 0.9 - yawA) * Math.min(1, dt * 1.2);
      rig.rotation.y = yawA; tiltX = damp(tiltX, clamp(sp * 0.05, 0, 0.25), 6, dt); tiltZ = damp(tiltZ, Math.sin(t * 1.1) * 0.03, 4, dt);
      inner.rotation.x = tiltX; inner.rotation.z = tiltZ; inner.position.y = Math.sin(t * 1.9) * 0.035;
      gyro.rotation.x = t * 1.3; gyro.rotation.z = t * 0.7;
      lensM.color.setRGB(0.9 * (0.9 + 0.1 * Math.sin(t * 7)), 1.5, 1.7); ledM.color.setRGB(Math.sin(t * 3.4) > 0.6 ? 1.1 : 0.05, 0.03, 0.03); bandM.color.setRGB(0.03, 0.6 + 0.1 * Math.sin(t * 2), 0.7);
    },
    dispose() { group.removeFromParent(); B.dispose(); },
  };
}

/* the far light at the end of the wonder walk (web/src/props/farlights.js) */
export function farlight(scene) { return worldFarlight('neon', scene); }

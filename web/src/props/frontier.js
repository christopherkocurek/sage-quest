/* The Frontier's quest props (a western): a rail tie post with a staple and a spike, a prison wagon, a signal fire on a
   water-tank frame, split wood, a burned grave plank, a ranch gate, three trail clues, the waymarks and a hurricane lamp.
   NO runes, NO magic cracks, NO light pillars. Everything is timber, iron, canvas and dust; fire is a real fire with smoke.
   Metres, Y up, origin = base centre on the ground. Props: anchor, cage, beacon, kindling, marker, gate, sign, waymark and cause.
   Colours stay under 1.0 on screen except tiny sparks. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { farlight as worldFarlight } from './farlights.js'; /* the wonder walk's far light */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3(); const _d = new THREE.Vector3();
const _q = new THREE.Quaternion(); const _qr = new THREE.Quaternion(); const _m = new THREE.Matrix4(); const _s = new THREE.Vector3(); const _o = new THREE.Object3D(); const _e = new THREE.Euler();
const _col = new THREE.Color();
const lin = (hex) => { _col.set(hex); return [_col.r, _col.g, _col.b]; };
const C_DUST = lin(0x6e5642); const C_FLAME_CORE = lin(0xffc860); const C_FLAME = lin(0xf08a2a); const C_SMOKE_D = lin(0x3a322c); const C_SMOKE_L = lin(0x6a625a); const C_BURN = lin(0x8a8078);
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

/* ------------------------------------------------------------------ resource tracking, textures */
function bag() { const list = []; return { own(x) { list.push(x); return x; }, free() { for (const o of list) { try { o.dispose?.(); } catch (e) { /* already gone */ } } list.length = 0; } }; }
function canvasTex(w, h, draw, { repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/* weathered grey-brown timber: long grain, a knot or two, a crack, a dust wash. Tiles at 0.5 m x 1 m. */
const TW = 0.5; const TH = 1.0;
const woodDraw = (base, seed) => (g, w, h) => {
  const r = seeded(seed * 97 + 5);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 100; i++) {
    const x0 = r() * w; const dark = r() < 0.55; const pts = []; for (let y = 0; y <= h + 8; y += 8) pts.push((r() - 0.5) * 1.8);
    g.strokeStyle = dark ? `rgba(28,18,10,${0.06 + r() * 0.17})` : `rgba(236,214,176,${0.05 + r() * 0.11})`; g.lineWidth = 0.6 + r() * 2.4;
    for (const off of [-w, 0, w]) { g.beginPath(); let x = x0 + off; g.moveTo(x, 0); pts.forEach((d, k) => { x += d; g.lineTo(x, k * 8); }); g.stroke(); }
  }
  for (let k = 0; k < 2; k++) { const x = 20 + r() * (w - 40); const y = 20 + r() * (h - 40); for (let j = 1; j < 6; j++) { g.strokeStyle = `rgba(30,18,10,${0.5 - j * 0.07})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, 2 + j * 1.5, 5 + j * 3.4, 0, 0, TAU); g.stroke(); } }
  for (let k = 0; k < 3; k++) { let x = r() * w; g.strokeStyle = 'rgba(14,8,4,0.55)'; g.lineWidth = 0.9; g.beginPath(); const y0 = r() * h * 0.6; g.moveTo(x, y0); for (let y = y0; y < y0 + 50 + r() * 90; y += 6) { x += (r() - 0.5) * 2; g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = 'rgba(150,138,120,0.10)'; g.fillRect(0, 0, w, h);
};
const softDraw = (g, w, h) => {
  const r = seeded(4);
  for (let i = 0; i < 9; i++) { const x = w * (0.3 + r() * 0.4); const y = h * (0.3 + r() * 0.4); const rad = Math.min(w * (0.16 + r() * 0.2), x - 1, w - x - 1, y - 1, h - y - 1); /* the puff stays inside the quad (a cut edge read as a hard brown square) */ const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
};
const flameDraw = (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) { const t = i / 5; const cy = h * (0.72 - t * 0.38); const rx = w * (0.34 - t * 0.2); const ry = h * (0.26 - t * 0.05); g.save(); g.translate(w / 2, cy); g.scale(rx / ry, 1); const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ry, 0, TAU); g.fill(); g.restore(); }
};
const woodMat = (B, hex, seed, rough = 0.93, tone = 0.62) => B.own(new THREE.MeshStandardMaterial({ map: B.own(canvasTex(128, 256, woodDraw(hex, seed), { repeat: true })), color: new THREE.Color(tone, tone * 0.96, tone * 0.92), roughness: rough }));
const paleMat = (B) => woodMat(B, '#c8ae84', 77, 0.9, 0.95);
const ironMat = (B, hex = 0x38332f) => B.own(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.68, metalness: 0.55 }));
const vcMat = (B, rough = 1, flat = false) => B.own(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: rough, flatShading: flat }));

/* ------------------------------------------------------------------ geometry helpers */
function xf(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix(); g.applyMatrix4(_o.matrix); return g; }
const NI = (g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; };
class Parts {
  constructor() { this.b = {}; }
  add(k, g) { (this.b[k] ||= []).push(NI(g)); return this; }
  has(k) { return !!(this.b[k] && this.b[k].length); }
  mesh(B, k, mat, parent, { cast = true, recv = true } = {}) {
    if (!this.has(k)) return null;
    const g = mergeGeometries(this.b[k]); this.b[k].forEach((x) => x.dispose()); this.b[k] = [];
    const m = new THREE.Mesh(B.own(g), mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
  }
}
/* lean timber, grain along its length, a hand-hewn wobble; hash of position keeps the edges joined */
function warp(g, h, { jit = 0.007, bow = 0.01, seed = 1 } = {}) {
  const p = g.attributes.position; const a = seed * 1.7; const b = seed * 2.9;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const t = y / (h || 1);
    p.setXYZ(i, x + Math.sin(t * 4.1 + a) * bow + (hash3(x, y, z) - 0.5) * 2 * jit, y, z + Math.sin(t * 3.3 + b) * bow + (hash3(z + 1.3, x, y) - 0.5) * 2 * jit);
  }
  g.computeVertexNormals(); return g;
}
function wbox(w, h, d, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d, o.sw || 1, Math.max(1, Math.round(h / 0.3)), o.sd || 1);
  const p = g.attributes.position; const n = g.attributes.normal; const uv = g.attributes.uv; const so = (o.seed || 1) * 0.37;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const ax = Math.abs(n.getX(i)); const ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, x / TW + so, z / TH); else if (ax > 0.5) uv.setXY(i, z / TW + so, y / TH + so * 3); else uv.setXY(i, x / TW + so, y / TH + so * 3);
    if (o.teethTop && y > h / 2 - 1e-4) p.setY(i, y + hash3(x * 7.3, 1.1, z * 9.1) * o.teethTop);
    if (o.teethBot && y < -h / 2 + 1e-4) p.setY(i, y - hash3(x * 7.3, 2.1, z * 9.1) * o.teethBot);
  }
  return warp(g, h, o);
}
function wpole(r0, r1, h, o = {}) {
  const seg = o.seg || 7; const g = new THREE.CylinderGeometry(r1, r0, h, seg, Math.max(1, Math.round(h / 0.4)));
  const uv = g.attributes.uv; const so = (o.seed || 1) * 0.37; const circ = TAU * (r0 + r1) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / TW + so, (uv.getY(i) - 0.5) * h / TH);
  return warp(g, h, { jit: o.jit ?? 0.004, bow: o.bow ?? 0.012, seed: o.seed || 1 });
}
/* orient a Y-long geometry so it runs from a to b */
function between(g, ax, ay, az, bx, by, bz, roll = 0) {
  _a.set(bx - ax, by - ay, bz - az).normalize(); _q.setFromUnitVectors(UP, _a);
  if (roll) { _qr.setFromAxisAngle(UP, roll); _q.multiply(_qr); }
  _m.compose(_c.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m); return g;
}
const beam = (P, key, w, d, a, b, o = {}) => P.add(key, between(wbox(w, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), d, o), a[0], a[1], a[2], b[0], b[1], b[2], o.roll || 0));
const rod = (P, key, r, a, b, seg = 5) => P.add(key, between(new THREE.CylinderGeometry(r, r, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), seg, 1), a[0], a[1], a[2], b[0], b[1], b[2]));
const ibox = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => xf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
/* per-triangle flat colour, so stones, soil and straw merge into one draw call */
function tint(g, hex, vary = 0.18, seed = 1, k0 = 1) {
  const n = g.index ? NI(g) : g; const pos = n.attributes.position; const col = new Float32Array(pos.count * 3); _col.set(hex).multiplyScalar(k0);
  for (let i = 0; i < pos.count; i += 3) { const k = 1 + (hash3(pos.getX(i) * 9 + seed, pos.getY(i) * 9, pos.getZ(i) * 9) - 0.5) * 2 * vary; for (let j = 0; j < 3; j++) { col[(i + j) * 3] = _col.r * k; col[(i + j) * 3 + 1] = _col.g * k; col[(i + j) * 3 + 2] = _col.b * k; } }
  n.setAttribute('color', new THREE.BufferAttribute(col, 3)); return n;
}
function rockG(r, seed, flat = 0.7, hex = 0x7a6858) {
  const g = new THREE.IcosahedronGeometry(r, 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const k = 0.78 + hash3(x * 5.1 + seed, y * 5.1, z * 5.1 + seed) * 0.46; p.setXYZ(i, x * k, Math.max(y * k * flat, -r * 0.2), z * k); }
  g.computeVertexNormals(); return tint(g, hex, 0.22, seed, 0.6);
}
/* a packed earth mound: smooth, lumpy, dark, with its foot sunk into the ground */
function moundG(r0, r1, h, seed, hex = 0x3c3229) {
  const m = new THREE.CylinderGeometry(r0, r1, h, 22, 5); const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const ang = Math.atan2(z, x); const k = 1 + 0.12 * Math.sin(ang * 3 + seed) + 0.07 * Math.sin(ang * 5 + seed * 2.1) + (hash3(x * 5 + seed, y * 5, z * 5) - 0.5) * 0.06; const lump = (hash3(x * 9, seed, z * 9) - 0.5) * h * 0.35 * (y > 0 ? 1 : 0.3); p.setXYZ(i, x * k, y + lump, z * k); }
  m.translate(0, h / 2 - 0.02, 0); m.computeVertexNormals(); return tint(m, hex, 0.1, seed, 1);
}
function rocksRing(P, key, n, rad, size, seed, hex, y = 0.05) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.5; const d = rad * (0.8 + r() * 0.4); const s = size * (0.6 + r() * 0.7); P.add(key, xf(rockG(s, seed + i, 0.7, hex), Math.cos(a) * d, y + s * 0.12, Math.sin(a) * d, 0, r() * TAU, 0, 1 + r() * 0.5, 1, 1 + r() * 0.4)); }
}

/* ------------------------------------------------------------------ particles: sparks (points), chips (instanced slivers), puffs (instanced billboards) */
class Sparks {
  constructor(parent, n, tex, size = 0.05) {
    this.n = n; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.base = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1); this.cur = 0;
    this.pos.fill(0); for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ size, map: tex, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9; parent.add(this.mesh); this.g = g;
  }
  emit(x, y, z, vx, vy, vz, life, r, g, b) { const i = this.cur; this.cur = (i + 1) % this.n; const j = i * 3; this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz; this.life[i] = this.max[i] = life; this.base[j] = r; this.base[j + 1] = g; this.base[j + 2] = b; }
  update(dt, grav = 9, floor = 0.02) {
    const { pos, vel, col, base, life, max } = this;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      if (life[i] > 0) {
        life[i] -= dt; vel[j + 1] -= grav * dt; pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        if (pos[j + 1] < floor) { pos[j + 1] = floor; vel[j + 1] *= -0.3; vel[j] *= 0.5; vel[j + 2] *= 0.5; }
        const k = clamp(life[i] / max[i], 0, 1); col[j] = base[j] * k; col[j + 1] = base[j + 1] * k * k; col[j + 2] = base[j + 2] * k * k;
        if (life[i] <= 0) { pos[j + 1] = -999; col[j] = col[j + 1] = col[j + 2] = 0; }
      }
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.color.needsUpdate = true;
  }
  dispose() { this.g.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}
class Chips {
  constructor(parent, n, geo, mat) {
    this.n = n; this.mesh = new THREE.InstancedMesh(geo, mat, n); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.castShadow = false; parent.add(this.mesh);
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.r = new Float32Array(n * 3); this.sp = new Float32Array(n * 3); this.life = new Float32Array(n); this.size = new Float32Array(n).fill(1); this.cur = 0; this.dead = new Uint8Array(n).fill(1);
    _m.makeScale(0, 0, 0); for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, _m);
  }
  emit(x, y, z, vx, vy, vz, size, life) { const i = this.cur; this.cur = (i + 1) % this.n; const j = i * 3; this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz; this.r[j] = Math.random() * TAU; this.r[j + 1] = Math.random() * TAU; this.r[j + 2] = Math.random() * TAU; this.sp[j] = (Math.random() - 0.5) * 16; this.sp[j + 1] = (Math.random() - 0.5) * 16; this.sp[j + 2] = (Math.random() - 0.5) * 16; this.size[i] = size; this.life[i] = life; this.dead[i] = 0; }
  update(dt) {
    const { p, v, r, sp, life } = this; let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.dead[i]) continue; const j = i * 3; any = true;
      life[i] -= dt; v[j + 1] -= 9.5 * dt; p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (p[j + 1] < 0.015) { p[j + 1] = 0.015; v[j + 1] *= -0.22; v[j] *= 0.45; v[j + 2] *= 0.45; sp[j] *= 0.3; sp[j + 1] *= 0.3; sp[j + 2] *= 0.3; }
      r[j] += sp[j] * dt; r[j + 1] += sp[j + 1] * dt; r[j + 2] += sp[j + 2] * dt;
      if (life[i] <= 0) { this.dead[i] = 1; _m.makeScale(0, 0, 0); } else { const sc = this.size[i] * Math.min(1, life[i] / 0.5); _q.setFromEuler(_e.set(r[j], r[j + 1], r[j + 2])); _m.compose(_a.set(p[j], p[j + 1], p[j + 2]), _q, _s.set(sc, sc, sc)); }
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.dispose(); this.mesh.removeFromParent(); }
}
/* camera-facing soft quads, one draw call: dust, smoke, flame (normal blending, so nothing clips to white) */
class Puffs {
  constructor(parent, n, tex, order = 5) {
    this.n = n; const q = new THREE.PlaneGeometry(1, 1); const g = new THREE.InstancedBufferGeometry(); g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv); q.dispose?.();
    this.pos = new Float32Array(n * 3); this.sa = new Float32Array(n * 2); this.col = new Float32Array(n * 3);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSA', new THREE.InstancedBufferAttribute(this.sa, 2).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aCol', new THREE.InstancedBufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = n; this.g = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute vec3 aPos; attribute vec2 aSA; attribute vec3 aCol; varying vec2 vUv; varying vec4 vC; void main(){ vUv = uv; vC = vec4(aCol, aSA.y); vec4 mvPosition = modelViewMatrix * vec4(aPos, 1.0); mvPosition.xy += position.xy * aSA.x; gl_Position = projectionMatrix * mvPosition; }',
      fragmentShader: 'uniform sampler2D uMap; varying vec2 vUv; varying vec4 vC; void main(){ float a = texture2D(uMap, vUv).a * vC.a; if (a < 0.004) discard; gl_FragColor = vec4(vC.rgb, a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = order; parent.add(this.mesh);
    this.age = new Float32Array(n).fill(1e9); this.life = new Float32Array(n).fill(1); this.vel = new Float32Array(n * 3); this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.drag = new Float32Array(n); this.rise = new Float32Array(n); this.cur = 0;
  }
  emit(x, y, z, vx, vy, vz, s0, s1, life, a0, r, g, b, drag = 0.5, rise = 0) {
    const i = this.cur; this.cur = (i + 1) % this.n; const j = i * 3; this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.s0[i] = s0; this.s1[i] = s1; this.life[i] = life; this.a0[i] = a0; this.age[i] = 0; this.col[j] = r; this.col[j + 1] = g; this.col[j + 2] = b; this.drag[i] = drag; this.rise[i] = rise;
  }
  /* write one puff by hand (the dust devil is computed from its phase) */
  set(i, x, y, z, size, alpha, r, g, b) { const j = i * 3; this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.sa[i * 2] = size; this.sa[i * 2 + 1] = alpha; this.col[j] = r; this.col[j + 1] = g; this.col[j + 2] = b; this.age[i] = 1e9; }
  update(dt, manual = false) {
    if (!manual) {
      for (let i = 0; i < this.n; i++) {
        if (this.age[i] >= this.life[i]) { this.sa[i * 2] = 0; this.sa[i * 2 + 1] = 0; continue; }
        const j = i * 3; this.age[i] += dt; const u = this.age[i] / this.life[i]; const dk = Math.exp(-this.drag[i] * dt);
        this.vel[j] *= dk; this.vel[j + 1] = this.vel[j + 1] * dk + this.rise[i] * dt; this.vel[j + 2] *= dk;
        this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
        this.sa[i * 2] = lerp(this.s0[i], this.s1[i], u); this.sa[i * 2 + 1] = this.a0[i] * Math.min(1, u / 0.12) * (1 - u);
      }
    }
    const A = this.g.attributes; A.aPos.needsUpdate = true; A.aSA.needsUpdate = true; A.aCol.needsUpdate = true;
  }
  dispose() { this.g.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}

/* ------------------------------------------------------------------ cloth: a flat grid we ripple by hand, shape cut by the texture alpha */
function clothGeo(w, h, sx, sy, pinX) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy); if (pinX) g.translate(w / 2, 0, 0); else g.translate(0, -h / 2, 0);
  g.userData.orig = g.attributes.position.array.slice(); g.userData.w = w; g.userData.h = h; return g;
}
function ripple(g, pinX, t, amp, freq, speed, ph = 0) {
  const p = g.attributes.position; const o = g.userData.orig; const size = pinX ? g.userData.w : g.userData.h;
  for (let i = 0; i < p.count; i++) {
    const x = o[i * 3]; const y = o[i * 3 + 1]; const u = pinX ? x / size : -y / size;
    const wv = Math.sin(u * freq - t * speed + (pinX ? y : x) * 2.3 + ph);
    p.setXYZ(i, x, y - (pinX ? wv * amp * 0.25 * u : 0), amp * u * wv);
  }
  p.needsUpdate = true; g.userData.n = (g.userData.n || 0) + 1; if (g.userData.n % 3 === 1) g.computeVertexNormals();
}
const clothMat = (B, tex) => B.own(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }));

/* ================================================================== ANCHOR: a rail tie post, an iron staple, a rail spike, a heavy chain */
export function anchor(scene, { accent = 0xd98a3a, to = new THREE.Vector3(0, 2.2, -14), index = 0 } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const r = seeded(300 + index * 17);
  const wood = woodMat(B, '#4a3c30', 3 + index, 0.93, 0.78); const pale = paleMat(B); const iron = ironMat(B); const earthM = vcMat(B);
  const tilt = new THREE.Group(); group.add(tilt); const body = new THREE.Group(); tilt.add(body);
  const PW = 0.26; const PD = 0.2; const PH = 1.85; const BRK = 0.8; const SY = 1.1;
  const mk = (geo, mat, parent, y) => { const m = new THREE.Mesh(B.own(geo), mat); m.position.y = y; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  mk(wbox(PW, PH, PD, { seed: 3 + index, jit: 0.006, bow: 0.008 }), wood, body, PH / 2).name = 'post';
  const post = body.children[0];
  const stump = mk(wbox(PW, BRK, PD, { seed: 3 + index, sw: 3, sd: 3, teethTop: 0.22 }), wood, body, BRK / 2); stump.visible = false;
  const upperG = new THREE.Group(); upperG.position.y = BRK; body.add(upperG); upperG.visible = false;
  mk(wbox(PW, PH - BRK, PD, { seed: 9 + index, sw: 3, sd: 3, teethBot: 0.2 }), wood, upperG, (PH - BRK) / 2);
  /* iron: a strap round the post, a tie plate and a rail spike */
  const P = new Parts();
  for (const [w, d, x, z] of [[PW + 0.05, 0.014, 0, PD / 2 + 0.007], [PW + 0.05, 0.014, 0, -PD / 2 - 0.007], [0.014, PD + 0.05, PW / 2 + 0.007, 0], [0.014, PD + 0.05, -PW / 2 - 0.007, 0]]) P.add('i', ibox(w, 0.075, d, x, 0.4, z));
  for (const x of [-0.08, 0.08]) P.add('i', xf(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6), x, 0.4, PD / 2 + 0.018, Math.PI / 2));
  /* on the back face (the staple is on the chain side): a tie plate with a rail spike driven through it */
  P.add('i', ibox(0.14, 0.21, 0.012, 0, 0.78, -PD / 2 - 0.006));
  P.add('i', ibox(0.022, 0.022, 0.11, 0.01, 0.785, -PD / 2 - 0.05, -0.12, 0, 0.05)); P.add('i', ibox(0.056, 0.05, 0.016, 0.014, 0.792, -PD / 2 - 0.104, -0.12, 0, 0.05));
  for (const [x, y] of [[-0.05, 0.86], [0.05, 0.7]]) P.add('i', xf(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 6), x, y, -PD / 2 - 0.014, Math.PI / 2));
  P.mesh(B, 'i', iron, body);
  /* a second strap and a flat iron on the end grain: they go with the top of the post */
  const topIron = new THREE.Group(); body.add(topIron);
  { const T = new Parts(); for (const [w, d, x, z] of [[PW + 0.05, 0.014, 0, PD / 2 + 0.007], [PW + 0.05, 0.014, 0, -PD / 2 - 0.007], [0.014, PD + 0.05, PW / 2 + 0.007, 0], [0.014, PD + 0.05, -PW / 2 - 0.007, 0]]) T.add('i', ibox(w, 0.07, d, x, 1.55, z));
    for (const x of [-0.08, 0.08]) T.add('i', xf(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 6), x, 1.55, PD / 2 + 0.017, Math.PI / 2));
    T.add('i', ibox(PW + 0.04, 0.025, 0.05, 0, PH + 0.012, 0)); T.add('i', ibox(0.05, 0.025, PD + 0.04, 0, PH + 0.012, 0)); T.mesh(B, 'i', iron, topIron); }
  /* the staple: a hoop of bar iron driven into the face; it pulls out as the post is struck */
  const stapleG = new THREE.Group(); stapleG.position.set(0, SY, PD / 2); body.add(stapleG);
  { const Q = new Parts(); Q.add('i', ibox(0.034, 0.2, 0.034, 0, 0, 0.042)); Q.add('i', ibox(0.03, 0.03, 0.07, 0, 0.085, 0.01)); Q.add('i', ibox(0.03, 0.03, 0.07, 0, -0.085, 0.01)); Q.add('i', xf(new THREE.TorusGeometry(0.085, 0.022, 6, 16), 0, -0.02, 0.042 + 0.065, Math.PI / 2, 0, 0, 1, 1, 1)); Q.mesh(B, 'i', iron, stapleG); }
  /* the ground: a packed mound with stones against the post */
  const E = new Parts();
  E.add('g', moundG(0.5, 1.05, 0.34, 3 + index)); rocksRing(E, 'g', 8, 0.44, 0.16, 40 + index, 0x6a5c50, 0.2); rocksRing(E, 'g', 10, 0.8, 0.13, 61 + index, 0x5e5248, 0.06); rocksRing(E, 'g', 6, 1.05, 0.08, 71 + index, 0x54483e, 0.03);
  E.mesh(B, 'g', earthM, group);
  /* fresh gouges where the post has been struck */
  const gougeG = B.own(mergeGeometries([new THREE.BoxGeometry(0.2, 0.15, 0.022), xf(new THREE.BoxGeometry(0.022, 0.12, 0.012), -0.08, 0.1, 0.02, 0.5, 0, 0.3), xf(new THREE.BoxGeometry(0.02, 0.1, 0.012), 0.05, 0.1, 0.02, 0.6, 0, -0.2), xf(new THREE.BoxGeometry(0.02, 0.11, 0.012), 0.09, -0.1, 0.02, -0.5, 0, 0.4), xf(new THREE.BoxGeometry(0.02, 0.1, 0.012), -0.06, -0.1, 0.02, -0.6, 0, -0.3)].map(NI)));
  const gouges = []; for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(gougeG, pale); m.visible = false; body.add(m); gouges.push(m); }
  /* the chain: heavy links, instanced */
  const NL = 300; const PITCH = 0.1; const linkG = B.own(new THREE.TorusGeometry(0.04, 0.014, 6, 12)); linkG.scale(1, 1.55, 1);
  const chainMat = ironMat(B, 0x403a35); const links = new THREE.InstancedMesh(linkG, chainMat, NL); links.instanceMatrix.setUsage(THREE.DynamicDrawUsage); links.castShadow = true; links.frustumCulled = false; group.add(links);
  const sparks = new Sparks(group, 56, B.own(canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); })), 0.05);
  const chips = new Chips(group, 36, B.own(new THREE.BoxGeometry(0.016, 0.1, 0.01)), pale);
  const dust = new Puffs(group, 14, B.own(canvasTex(64, 64, softDraw)), 5);
  /* chain path */
  const NS = 160; const path = new Float32Array(NS * 3); const cum = new Float32Array(NS); let total = 1; let far = false; let tY = 0; let toTotal = 1;
  const lastAt = new THREE.Vector3(Infinity, 0, 0); const lastTo = new THREE.Vector3(Infinity, 0, 0); let lastRy = 1e9; const toL = new THREE.Vector3(); const startL = new THREE.Vector3();
  const node = new Float32Array(NL * 3); const prev = new Float32Array(NL * 3); const NV = 34; const snake = new Float32Array(NL); for (let i = 0; i < NL; i++) snake[i] = Math.sin(i * 0.37 + index) * 0.22 + (r() - 0.5) * 0.08;
  const S = { t: 0, hp: 1, quiver: 0, broken: false, bt: 0, dir: new THREE.Vector3(0, 0, -1), lean: 0, hits: 0, sv: new THREE.Vector3(), sp: new THREE.Vector3(), sr: new THREE.Vector3(), ss: new THREE.Vector3(), th: 0, tw: 0, bounced: 0, yaw: 0 };
  function layout() {
    group.updateMatrixWorld(true); toL.copy(to); group.worldToLocal(toL);
    S.yaw = Math.atan2(toL.x, toL.z); body.rotation.y = S.yaw;
    const zf = PD / 2 + 0.2; startL.set(zf * Math.sin(S.yaw), SY - 0.02, zf * Math.cos(S.yaw));
    const d = startL.distanceTo(toL); far = d > 33; const L = far ? 30 : d; _a.subVectors(toL, startL).normalize(); _b.copy(startL).addScaledVector(_a, L); if (!far) _b.copy(toL);
    const sag = L * 0.035; tY = _b.y; let acc = 0;
    for (let i = 0; i < NS; i++) {
      const u = i / (NS - 1); const x = lerp(startL.x, _b.x, u); const z = lerp(startL.z, _b.z, u); const y = Math.max(0.12, lerp(startL.y, _b.y, u) - sag * 4 * u * (1 - u));
      path[i * 3] = x; path[i * 3 + 1] = y; path[i * 3 + 2] = z; if (i) acc += Math.hypot(x - path[i * 3 - 3], y - path[i * 3 - 2], z - path[i * 3 - 1]); cum[i] = acc;
    }
    total = acc; toTotal = total;
    for (let i = 0; i < NL; i++) { pointAt(i * PITCH, _a); node[i * 3] = prev[i * 3] = _a.x; node[i * 3 + 1] = prev[i * 3 + 1] = _a.y; node[i * 3 + 2] = prev[i * 3 + 2] = _a.z; }
  }
  function pointAt(s, out) {
    s = clamp(s, 0, total); let lo = 0; let hi = NS - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid; else hi = mid; }
    const k = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return out.set(lerp(path[lo * 3], path[hi * 3], k), lerp(path[lo * 3 + 1], path[hi * 3 + 1], k), lerp(path[lo * 3 + 2], path[hi * 3 + 2], k));
  }
  /* where a link lies after the break: slumped on the ground in a snake, hanging from the cage at the far end */
  function dropAt(i, s, out) {
    pointAt(s, out); pointAt(s + 0.1, _d); _d.sub(out); _d.y = 0; _d.normalize(); const k = sstep(0, 0.7, S.bt - i * 0.0035); const Hh = Math.max(0.5, tY - 0.03);
    const hang = far ? 0 : sstep(total - Hh, total, s); const yDrop = 0.03 + hang * Hh; out.y = lerp(out.y, yDrop, k * k); out.x += -_d.z * snake[i] * k; out.z += _d.x * snake[i] * k; return out;
  }
  const X = new THREE.Vector3(); const Y = new THREE.Vector3(); const Z = new THREE.Vector3();
  function placeLink(i, p, tan, roll, sc) {
    Y.copy(tan).normalize(); X.crossVectors(Y, UP); if (X.lengthSq() < 1e-6) X.set(1, 0, 0); X.normalize(); Z.crossVectors(X, Y);
    if (roll) { _b.copy(X); X.copy(Z); Z.copy(_b).negate(); }
    _m.makeBasis(X, Y, Z); _m.scale(_s.setScalar(sc)); _m.setPosition(p); links.setMatrixAt(i, _m);
  }
  function chainFrame() {
    const nUse = Math.min(NL, Math.floor(total / PITCH)); const off = Math.sin(S.lean) * SY * 0.9;
    for (let i = 0; i < NL; i++) {
      if (i >= nUse) { links.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      const s = i * PITCH; const fade = far ? 1 - sstep(24, 30, s) : 1;
      if (S.broken && i < NV) { const j = i * 3; const k2 = Math.min(NV, i + 1) * 3; const k1 = Math.max(0, i - 1) * 3; _a.set(node[j], node[j + 1], node[j + 2]); _b.set(node[k2] - node[k1], node[k2 + 1] - node[k1 + 1], node[k2 + 2] - node[k1 + 2]); if (_b.lengthSq() < 1e-8) _b.set(0, 1, 0); placeLink(i, _a, _b, i % 2, fade); continue; }
      if (S.broken) { dropAt(i, s, _a); dropAt(i, s + 0.07, _c); _c.sub(_a); if (_c.lengthSq() < 1e-8) _c.set(1, 0, 0); placeLink(i, _a, _c, i % 2, fade); continue; }
      pointAt(s, _a); pointAt(s + 0.07, _c); _c.sub(_a); const w = Math.max(0, 1 - s / 1.6); if (w > 0) _a.addScaledVector(S.dir, off * w);
      if (S.quiver > 0) _a.y += Math.sin(S.t * 60 - s * 4) * 0.01 * S.quiver * Math.exp(-s * 0.15);
      _a.y += Math.sin(S.t * 0.9 + s * 0.2) * 0.012 * Math.min(1, s * 0.3);
      placeLink(i, _a, _c, i % 2, fade);
    }
    links.instanceMatrix.needsUpdate = true;
  }
  function verlet(dt) {
    const g = -11 * dt * dt;
    for (let i = 0; i < NV; i++) { const j = i * 3; const vx = (node[j] - prev[j]) * 0.985; const vy = (node[j + 1] - prev[j + 1]) * 0.985; const vz = (node[j + 2] - prev[j + 2]) * 0.985; prev[j] = node[j]; prev[j + 1] = node[j + 1]; prev[j + 2] = node[j + 2]; node[j] += vx; node[j + 1] += vy + g; node[j + 2] += vz; }
    dropAt(NV, NV * PITCH, _a); node[NV * 3] = _a.x; node[NV * 3 + 1] = _a.y; node[NV * 3 + 2] = _a.z;
    for (let it = 0; it < 7; it++) {
      for (let i = 0; i < NV; i++) { const a = i * 3; const b = a + 3; const dx = node[b] - node[a]; const dy = node[b + 1] - node[a + 1]; const dz = node[b + 2] - node[a + 2]; const d = Math.hypot(dx, dy, dz) || 1e-6; const k = (d - PITCH) / d; const wa = 0.5; const wb = i + 1 === NV ? 0 : 0.5; const sc = wb === 0 ? 1 : 1; node[a] += dx * k * (wb === 0 ? 1 : wa) * sc; node[a + 1] += dy * k * (wb === 0 ? 1 : wa) * sc; node[a + 2] += dz * k * (wb === 0 ? 1 : wa) * sc; if (wb) { node[b] -= dx * k * wb; node[b + 1] -= dy * k * wb; node[b + 2] -= dz * k * wb; } }
      for (let i = 0; i < NV; i++) { const j = i * 3; if (node[j + 1] < 0.03) { node[j + 1] = 0.03; prev[j] = node[j] - (node[j] - prev[j]) * 0.5; prev[j + 2] = node[j + 2] - (node[j + 2] - prev[j + 2]) * 0.5; prev[j + 1] = node[j + 1]; } }
    }
  }
  const SPK = [1, 0.74, 0.34]; const SPK2 = [1, 0.55, 0.2];
  const h = {
    group, height: 1.3, hp: 1, index,
    update(dt) {
      dt = Math.min(dt, 1 / 20); S.t += dt;
      if (!group.position.equals(lastAt) || group.rotation.y !== lastRy || !to.equals(lastTo)) { lastAt.copy(group.position); lastRy = group.rotation.y; lastTo.copy(to); layout(); }
      S.quiver = Math.max(0, S.quiver - dt * 2.2);
      if (!S.broken) {
        /* a struck post is loosened in its packing: it leans away from the blows and shivers */
        const target = (1 - S.hp) * 0.17; S.lean = damp(S.lean, target, 10, dt); const q = S.quiver > 0 ? Math.sin(S.t * 70) * 0.012 * S.quiver : 0;
        _a.set(S.dir.z, 0, -S.dir.x); tilt.quaternion.setFromAxisAngle(_a, S.lean + q);
        stapleG.position.z = PD / 2 + (1 - S.hp) * 0.075; stapleG.rotation.x = (1 - S.hp) * 0.45 + (S.quiver > 0 ? Math.sin(S.t * 55) * 0.05 * S.quiver : 0);
      } else {
        S.bt += dt;
        /* the top of the post tips over about the break */
        S.tw += (6.5 * Math.sin(Math.min(S.th, 1.6)) + 1.5) * dt; S.th += S.tw * dt;
        if (S.th > 1.45 && S.bounced < 2) { S.th = 1.45; S.tw = -S.tw * 0.25; S.bounced++; for (let i = 0; i < 8; i++) { const a = r() * TAU; dust.emit(S.dir.x * 0.7, 0.15, S.dir.z * 0.7, Math.cos(a) * 0.5, 0.3, Math.sin(a) * 0.5, 0.2, 0.9, 1.1, 0.3, ...C_DUST, 1.2, 0.2); } }
        const e = clamp(S.th / 1.45, 0, 1); _a.set(S.dir.z, 0, -S.dir.x); upperG.quaternion.setFromAxisAngle(_a, S.th); upperG.position.set(S.dir.x * 0.55 * e * e, BRK - 0.7 * e * e, S.dir.z * 0.55 * e * e);
        /* the staple is thrown clear */
        if (S.sp.y > 0.04 || S.sv.lengthSq() > 0.01) { S.sv.y -= 9.8 * dt; S.sp.addScaledVector(S.sv, dt); if (S.sp.y < 0.03) { S.sp.y = 0.03; S.sv.multiplyScalar(0.3); S.sv.y = Math.abs(S.sv.y) * 0.3; S.sr.multiplyScalar(0.4); } stapleG.position.copy(S.sp); stapleG.rotation.x += S.sr.x * dt; stapleG.rotation.y += S.sr.y * dt; stapleG.rotation.z += S.sr.z * dt; }
        verlet(Math.min(dt, 1 / 30));
      }
      chainFrame(); sparks.update(dt); chips.update(dt); dust.update(dt);
    },
    /* a blow: k = health left (0..1); point and dir in world space */
    hit(k, point, dir) {
      if (S.broken) return;
      S.hp = h.hp = clamp(k, 0, 1); S.quiver = 1; group.updateMatrixWorld(true); _m.copy(group.matrixWorld).invert();
      _a.copy(dir || _d.set(0, 0, -1)).transformDirection(_m); _a.y = 0; if (_a.lengthSq() < 1e-6) _a.set(0, 0, -1); S.dir.copy(_a.normalize());
      _c.copy(point || _b.set(0, 1.3, 0).add(group.position)); group.worldToLocal(_c);
      /* a pale gouge on the face that took the blow */
      const cy = Math.cos(S.yaw); const sy = Math.sin(S.yaw); const nx = -(S.dir.x * cy - S.dir.z * sy); const nz = -(S.dir.x * sy + S.dir.z * cy); const px = _c.x * cy - _c.z * sy; const pz = _c.x * sy + _c.z * cy;
      const gm = gouges[S.hits % 4]; S.hits++; gm.visible = true; const yy = clamp(_c.y, 0.45, 1.6) + (r() - 0.5) * 0.1; gm.rotation.order = 'YXZ';
      if (Math.abs(nx) > Math.abs(nz)) { const sg = Math.sign(nx) || 1; gm.position.set(sg * (PW / 2 + 0.004), yy, clamp(pz, -0.05, 0.05)); gm.rotation.set(0, sg * Math.PI / 2, (r() - 0.5) * 1.0); } else { const sg = Math.sign(nz) || 1; gm.position.set(clamp(px, -0.07, 0.07), yy, sg * (PD / 2 + 0.004)); gm.rotation.set(0, sg > 0 ? 0 : Math.PI, (r() - 0.5) * 1.0); }
      const out = _d.copy(S.dir).negate();
      for (let i = 0; i < 18; i++) { const sp = 2 + r() * 4.5; sparks.emit(_c.x, _c.y, _c.z, out.x * sp + (r() - 0.5) * 3, (r() - 0.1) * 3.5, out.z * sp + (r() - 0.5) * 3, 0.25 + r() * 0.4, ...(i % 3 ? SPK : SPK2)); }
      for (let i = 0; i < 7; i++) chips.emit(_c.x, _c.y, _c.z, out.x * 1.8 + (r() - 0.5) * 2.4, 0.8 + r() * 2.2, out.z * 1.8 + (r() - 0.5) * 2.4, 0.6 + r() * 0.9, 2.4);
      for (let i = 0; i < 4; i++) dust.emit(_c.x, _c.y, _c.z, out.x * 0.5 + (r() - 0.5) * 0.4, 0.15 + r() * 0.3, out.z * 0.5 + (r() - 0.5) * 0.4, 0.1, 0.5, 0.8, 0.28, ...C_DUST, 1.5, 0.1);
    },
    /* the staple tears out, the post splits at the break, the chain drops: returns seconds */
    break(dir) {
      if (S.broken) return 0;
      if (dir) { group.updateMatrixWorld(true); _m.copy(group.matrixWorld).invert(); _a.copy(dir).transformDirection(_m); _a.y = 0; if (_a.lengthSq() > 1e-6) S.dir.copy(_a.normalize()); }
      S.broken = true; S.bt = 0; S.hp = h.hp = 0; tilt.quaternion.identity(); post.visible = false; stump.visible = true; upperG.visible = true; S.th = 0; S.tw = 0.5; S.bounced = 0;
      for (const gm of gouges) if (gm.visible && gm.position.y > BRK) { gm.position.y -= BRK; upperG.add(gm); }
      upperG.add(topIron); topIron.position.y = -BRK;
      /* the staple flies off the face with a lump of wood */
      stapleG.getWorldPosition(_c); group.worldToLocal(_c); S.sp.copy(_c); body.remove(stapleG); group.add(stapleG); stapleG.rotation.set(0, S.yaw, 0);
      S.sv.set(S.dir.x * -1.8 + (r() - 0.5), 3.2, S.dir.z * -1.8 + (r() - 0.5)); S.sr.set(9, 5, 7);
      for (let i = 0; i < 40; i++) sparks.emit(_c.x, _c.y, _c.z, (r() - 0.5) * 7, r() * 5.5, (r() - 0.5) * 7, 0.35 + r() * 0.5, ...(i % 2 ? SPK : SPK2));
      for (let i = 0; i < 24; i++) { const a = r() * TAU; const y = 0.5 + r() * 1.0; chips.emit(Math.cos(a) * 0.1, y, Math.sin(a) * 0.1, Math.cos(a) * (1.2 + r() * 2.5), 1 + r() * 3, Math.sin(a) * (1.2 + r() * 2.5), 0.7 + r() * 1.2, 3 + r() * 1.5); }
      for (let i = 0; i < 9; i++) { const a = r() * TAU; dust.emit(Math.cos(a) * 0.2, 0.4 + r() * 0.9, Math.sin(a) * 0.2, Math.cos(a) * 0.9, 0.3, Math.sin(a) * 0.9, 0.25, 1.1, 1.6, 0.32, ...C_DUST, 1.0, 0.15); }
      for (let i = 0; i < NV; i++) { const j = i * 3; const kk = 1 - i / NV; prev[j] = node[j] - S.dir.x * 0.025 * kk; prev[j + 1] = node[j + 1] - 0.07 * kk; prev[j + 2] = node[j + 2] - S.dir.z * 0.025 * kk; }
      return 2.4;
    },
    dispose() { sparks.dispose(); chips.dispose(); dust.dispose(); group.removeFromParent(); B.free(); },
  };
  return h;
}

/* ================================================================== CAGE: a timber-and-iron-strap prison wagon, door to -z */
export function cage(scene, { accent = 0xd98a3a } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const r = seeded(808);
  const wood = woodMat(B, '#6a5644', 21, 0.93, 0.7); const iron = ironMat(B, 0x302c29); const straw = vcMat(B);
  const P = new Parts(); const D = new Parts();
  const FL = 0.66; const RT = 2.24; const HX = 0.75; const HZ = 1.0;
  /* the bed, sills, cross beams */
  for (let i = 0; i < 7; i++) P.add('w', xf(wbox(0.215, 2.06, 0.08, { seed: 30 + i }), -0.66 + i * 0.22, 0.625, 0, Math.PI / 2, 0, 0));
  for (const sx of [-1, 1]) P.add('w', xf(wbox(0.14, 2.1, 0.14, { seed: 41 + sx }), sx * 0.68, 0.52, 0, Math.PI / 2, 0, 0));
  for (const z of [-0.8, 0, 0.8]) P.add('w', xf(wbox(0.1, 1.5, 0.1, { seed: 50 + z }), 0, 0.52, z, 0, 0, Math.PI / 2));
  /* corner posts, rails, bars */
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.add('w', xf(wbox(0.13, RT + 0.1 - FL, 0.13, { seed: 60 + sx + sz * 3 }), sx * 0.72, (RT + 0.1 + FL) / 2, sz * 0.97));
  for (const y of [RT, 1.0, 1.62]) { for (const sz of [-1, 1]) P.add('w', xf(wbox(0.1, 1.5, 0.08, { seed: 70 + y }), 0, y, sz * 0.99, 0, 0, Math.PI / 2)); for (const sx of [-1, 1]) P.add('w', xf(wbox(0.1, 2.0, 0.08, { seed: 80 + y }), sx * 0.74, y, 0, Math.PI / 2, 0, 0)); }
  for (let i = 0; i < 11; i++) for (const sx of [-1, 1]) P.add('w', xf(wbox(0.07, RT - FL, 0.07, { seed: 90 + i * 2 + sx }), sx * 0.745, (RT + FL) / 2, -0.85 + i * 0.17));
  for (let i = 0; i < 8; i++) P.add('w', xf(wbox(0.07, RT - FL, 0.07, { seed: 120 + i }), -0.595 + i * 0.17, (RT + FL) / 2, 0.995));
  for (const sx of [-1, 1]) P.add('w', xf(wbox(0.12, RT - FL, 0.1, { seed: 140 + sx }), sx * 0.66, (RT + FL) / 2, -0.99));
  /* the roof boards */
  for (let i = 0; i < 7; i++) P.add('w', xf(wbox(0.215, 2.14, 0.05, { seed: 150 + i }), -0.66 + i * 0.22, RT + 0.075, 0, Math.PI / 2, 0, 0));
  /* wheels and axles */
  const R = 0.4;
  for (const z of [-0.62, 0.62]) {
    P.add('w', xf(wbox(0.1, 1.95, 0.1, { seed: 160 + z }), 0, 0.4, z, 0, 0, Math.PI / 2));
    for (const sx of [-1, 1]) {
      const x = sx * 0.83;
      P.add('w', xf(new THREE.TorusGeometry(R - 0.045, 0.045, 6, 20), x, 0.4, z, 0, Math.PI / 2, 0, 1, 1, 1.5));
      P.add('i', xf(new THREE.TorusGeometry(R - 0.012, 0.015, 5, 28), x, 0.4, z, 0, Math.PI / 2, 0, 1, 1, 1.6));
      P.add('w', xf(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 8), x, 0.4, z, 0, 0, Math.PI / 2));
      P.add('i', xf(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 8), x + sx * 0.09, 0.4, z, 0, 0, Math.PI / 2));
      for (let k = 0; k < 5; k++) P.add('w', xf(new THREE.BoxGeometry(0.045, R * 2 - 0.12, 0.04), x, 0.4, z, k * Math.PI / 5, 0, 0));
    }
  }
  /* the tongue, propped on a forked stick */
  beam(P, 'w', 0.11, 0.1, [0, 0.46, 0.62], [0, 0.24, 1.95], { seed: 170 }); P.add('w', xf(wbox(0.26, 0.05, 0.05, { seed: 171 }), 0, 0.26, 1.96));
  rod(P, 'w', 0.03, [0.0, 0.0, 1.5], [0.0, 0.3, 1.5]); P.add('w', xf(new THREE.BoxGeometry(0.2, 0.04, 0.04), 0, 0.31, 1.5));
  /* iron straps with rivets, a roof eye */
  for (const y of [0.92, 1.5, RT - 0.07]) {
    for (const sx of [-1, 1]) P.add('i', ibox(0.012, 0.05, 2.04, sx * (HX + 0.044), y, 0)); P.add('i', ibox(1.56, 0.05, 0.012, 0, y, HZ + 0.044));
    for (let i = 0; i < 11; i++) for (const sx of [-1, 1]) P.add('i', xf(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 5), sx * (HX + 0.052), y, -0.85 + i * 0.17, 0, 0, Math.PI / 2));
    for (let i = 0; i < 8; i++) P.add('i', xf(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 5), -0.595 + i * 0.17, y, HZ + 0.052, Math.PI / 2, 0, 0));
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.add('i', ibox(0.02, 0.4, 0.15, sx * 0.79, RT - 0.1, sz * 0.97)); P.add('i', ibox(0.15, 0.4, 0.02, sx * 0.72, RT - 0.1, sz * 1.04)); }
  P.add('i', ibox(0.34, 0.025, 0.34, 0, RT + 0.145, 0)); P.add('i', xf(new THREE.TorusGeometry(0.07, 0.02, 6, 14), 0, RT + 0.21, 0, 0, Math.PI / 2, 0)); P.add('i', xf(new THREE.TorusGeometry(0.05, 0.016, 6, 12), 0, RT + 0.3, 0, 0, 0, 0));
  /* inside: a ring bolt, a short chain and a leg iron on the floor; straw */
  P.add('i', xf(new THREE.TorusGeometry(0.06, 0.014, 5, 10), -0.3, FL + 0.01, 0.55, Math.PI / 2, 0, 0));
  for (let i = 0; i < 4; i++) P.add('i', xf(new THREE.TorusGeometry(0.03, 0.01, 5, 8), -0.3 + 0.07 + i * 0.065, FL + 0.01, 0.55 + 0.02 * i, i % 2 ? Math.PI / 2 : 0, 0, 0, 1, 1.5, 1));
  P.add('i', xf(new THREE.TorusGeometry(0.065, 0.016, 5, 12, Math.PI * 1.6), 0.02, FL + 0.065, 0.65, 0, 0, 0.3));
  for (let i = 0; i < 38; i++) { const g = new THREE.BoxGeometry(0.22 + r() * 0.12, 0.008, 0.014); P.add('s', tint(xf(g, (r() - 0.5) * 1.2, FL + 0.006 + r() * 0.02, -0.4 + r() * 1.3, 0, r() * TAU, 0), 0xb09860, 0.2, i)); }
  P.mesh(B, 'w', wood, group); P.mesh(B, 'i', iron, group); P.mesh(B, 's', straw, group, { cast: false });
  /* the door: hinged on +x, swings out to -z */
  const doorG = new THREE.Group(); doorG.position.set(0.62, 0, -HZ + 0.0); group.add(doorG);
  for (let i = 0; i < 7; i++) D.add('w', xf(wbox(0.07, RT - FL - 0.04, 0.07, { seed: 200 + i }), -0.1 - i * 0.17, (RT + FL) / 2, -0.005));
  for (const y of [FL + 0.1, RT - 0.1]) D.add('w', xf(wbox(0.12, 1.2, 0.06, { seed: 210 + y }), -0.62, y, -0.04, 0, 0, Math.PI / 2));
  beam(D, 'w', 0.1, 0.05, [-1.1, FL + 0.16, -0.045], [-0.1, RT - 0.16, -0.045], { seed: 215 });
  for (const y of [0.95, 1.9]) { D.add('i', ibox(0.9, 0.06, 0.014, -0.45, y, -0.082)); D.add('i', xf(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 7), -0.02, y, -0.03)); for (let k = 0; k < 4; k++) D.add('i', xf(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 5), -0.15 - k * 0.22, y, -0.09, Math.PI / 2, 0, 0)); }
  D.add('i', ibox(0.07, 0.34, 0.014, -1.12, 1.46, -0.085)); D.add('i', ibox(0.05, 0.05, 0.05, -1.12, 1.28, -0.115));
  D.mesh(B, 'w', wood, doorG); D.mesh(B, 'i', iron, doorG);
  /* the padlock: heavy, it falls off when the door opens */
  const lockG = new THREE.Group(); lockG.position.set(-1.12, 1.27, -0.15); doorG.add(lockG);
  { const L = new Parts(); L.add('i', ibox(0.11, 0.13, 0.05, 0, -0.06, 0)); L.add('i', xf(new THREE.TorusGeometry(0.04, 0.012, 5, 10, Math.PI), 0, 0.0, 0)); L.add('i', ibox(0.02, 0.025, 0.012, 0, -0.07, 0.028)); L.mesh(B, 'i', ironMat(B, 0x4a3f33), lockG); }
  const S = { t: 0, open: false, ot: 0, lock: false, lv: new THREE.Vector3(), la: 0 };
  return {
    group, top: new THREE.Vector3(0, RT + 0.33, 0),
    update(dt) {
      dt = Math.min(dt, 1 / 20); S.t += dt;
      if (S.open) {
        S.ot += dt; const k = clamp(S.ot / 0.95, 0, 1); const e = 1 - Math.pow(1 - k, 3); const over = S.ot > 0.95 ? Math.exp(-(S.ot - 0.95) * 5) * Math.sin((S.ot - 0.95) * 14) * 0.05 : 0;
        doorG.rotation.y = -(e * 1.85) - over;
        if (S.lock) { S.lv.y -= 9.8 * dt; lockG.position.addScaledVector(S.lv, dt); lockG.rotation.x += S.la * dt; if (lockG.position.y < 0.07) { lockG.position.y = 0.07; S.lv.y = Math.abs(S.lv.y) * 0.25; S.lv.x *= 0.4; S.lv.z *= 0.4; S.la *= 0.3; } }
      }
    },
    open() { if (S.open) return 0; S.open = true; S.ot = 0; S.lock = true; lockG.getWorldPosition(_c); group.worldToLocal(_c); group.add(lockG); lockG.position.copy(_c); lockG.rotation.set(0, 0, 0); S.lv.set(-0.3, 0.4, -0.5); S.la = 5; return 1.5; },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

/* ================================================================== fire frame (water-tank style tower) shared by the beacon and the goal */
function fireFrame(B, s, seed) {
  const P = new Parts(); const H = 2.7 * s; const bx = 0.85 * s; const tx = 0.5 * s; const lw = 0.15 * Math.pow(s, 0.7); const pw = 0.09 * Math.pow(s, 0.7); const pd = 0.04 * Math.pow(s, 0.7);
  const legAt = (sx, sz, y) => [sx * lerp(bx, tx, y / H), y, sz * lerp(bx, tx, y / H)];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) beam(P, 'w', lw, lw, legAt(sx, sz, 0), legAt(sx, sz, H + 0.15 * s), { seed: seed + sx * 3 + sz });
  for (const f of [0.36, 0.72]) corners.forEach(([sx, sz], k) => { const [nx, nz] = corners[(k + 1) % 4]; beam(P, 'w', pw, pw * 1.2, legAt(sx, sz, H * f), legAt(nx, nz, H * f), { seed: seed + 10 + k }); });
  corners.forEach(([sx, sz], k) => { const [nx, nz] = corners[(k + 1) % 4]; beam(P, 'w', pw, pd, legAt(sx, sz, 0.03 * H), legAt(nx, nz, H * 0.36), { seed: seed + 20 + k }); beam(P, 'w', pw, pd, legAt(nx, nz, 0.03 * H), legAt(sx, sz, H * 0.36), { seed: seed + 30 + k }); beam(P, 'w', pw, pd, legAt(sx, sz, H * 0.36), legAt(nx, nz, H * 0.72), { seed: seed + 40 + k }); });
  /* the deck and a rail */
  const dw = 2 * tx + 0.25 * s; for (let i = 0; i < 6; i++) P.add('w', xf(wbox(dw / 6 - 0.01 * s, dw, 0.07 * s, { seed: seed + 50 + i }), -dw / 2 + (i + 0.5) * dw / 6, H + 0.04 * s, 0, Math.PI / 2, 0, 0));
  /* ladder up the +x face */
  const lx0 = bx + 0.34 * s; const lx1 = tx + 0.14 * s; const lpw = Math.pow(s, 0.7); for (const sz of [-1, 1]) beam(P, 'w', 0.07 * lpw, 0.045 * lpw, [lx0, 0, sz * 0.2 * s], [lx1, H + 0.4 * s, sz * 0.2 * s], { seed: seed + 60 + sz });
  const rungs = Math.max(6, Math.round(H / (0.3 * lpw))); for (let i = 1; i < rungs; i++) { const t = i / rungs; rod(P, 'w', 0.022 * lpw, [lerp(lx0, lx1, t), t * (H + 0.4 * s), -0.2 * s], [lerp(lx0, lx1, t), t * (H + 0.4 * s), 0.2 * s], 5); }
  /* iron: strap bands at the leg tops and the basket */
  const bY = H + 0.09 * s; const bR = 0.36 * s; const bT = 0.44 * s;
  P.add('i', xf(new THREE.TorusGeometry(bR * 0.82, 0.022 * s, 5, 16), 0, bY + 0.015 * s, 0, Math.PI / 2, 0, 0)); P.add('i', xf(new THREE.TorusGeometry(bR + 0.015 * s, 0.026 * s, 5, 18), 0, bY + 0.22 * s, 0, Math.PI / 2, 0, 0)); P.add('i', xf(new THREE.TorusGeometry(bR + 0.035 * s, 0.03 * s, 5, 20), 0, bY + bT, 0, Math.PI / 2, 0, 0));
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; rod(P, 'i', 0.016 * s, [Math.cos(a) * bR * 0.82, bY, Math.sin(a) * bR * 0.82], [Math.cos(a) * (bR + 0.035 * s), bY + bT, Math.sin(a) * (bR + 0.035 * s)], 4); }
  P.add('i', xf(new THREE.CylinderGeometry(bR * 0.86, bR * 0.5, 0.05 * s, 12), 0, bY - 0.005 * s, 0));
  for (const [sx, sz] of corners) P.add('i', xf(new THREE.BoxGeometry(lw * 1.25, 0.05 * s, lw * 1.25), ...legAt(sx, sz, H - 0.1 * s)));
  return { P, H, bY, bR, bT };
}
function logsBucket(s, seed) {
  const r = seeded(seed); const L = new Parts();
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + r(); const lg = rod2(0.06 * s, 0.075 * s, 0.8 * s); L.add('l', between(lg, Math.cos(a) * 0.26 * s, 0.07 * s, Math.sin(a) * 0.26 * s, -Math.cos(a) * 0.05 * s, 0.4 * s, -Math.sin(a) * 0.05 * s)); }
  L.add('l', xf(new THREE.CylinderGeometry(0.24 * s, 0.28 * s, 0.05 * s, 9), 0, 0.075 * s, 0));
  return L;
}
const rod2 = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, 6, 1);

/* the shared fire: logs, hot spots, flame + smoke puffs, sparks, one light */
function makeFire(B, group, frame, s, { lightPower, lightDist, lightY }) {
  const logM = B.own(new THREE.MeshStandardMaterial({ color: 0x1d1814, roughness: 1 }));
  const hotM = B.own(new THREE.MeshStandardMaterial({ color: 0x1a120c, emissive: 0xff5a14, emissiveIntensity: 0, roughness: 0.9 }));
  const L = logsBucket(s, 5); const lm = L.mesh(B, 'l', logM, group, { recv: false }); lm.position.y = frame.bY;
  const ash = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.19 * s, 0.21 * s, 0.01 * s, 10)), B.own(new THREE.MeshStandardMaterial({ color: 0x6a645c, roughness: 1 }))); ash.position.y = frame.bY + 0.1 * s; group.add(ash);
  const HP = new Parts(); const rr = seeded(12); for (let i = 0; i < 9; i++) { const a = rr() * TAU; const d = rr() * 0.2 * s; HP.add('h', xf(new THREE.BoxGeometry(0.075 * s, 0.03 * s, 0.07 * s), Math.cos(a) * d, frame.bY + (0.16 + rr() * 0.12) * s, Math.sin(a) * d, rr() * 2, rr() * 2, rr() * 2)); }
  HP.mesh(B, 'h', hotM, group, { cast: false, recv: false });
  const flames = new Puffs(group, s > 1.5 ? 76 : 36, B.own(canvasTex(64, 128, flameDraw)), 6); const smoke = new Puffs(group, s > 1.5 ? 120 : 28, B.own(canvasTex(64, 64, softDraw)), 7);
  const sparks = new Sparks(group, 36, B.own(canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); })), 0.04 * Math.max(1, s * 0.6));
  const light = new THREE.PointLight(0xff9a45, 0, lightDist, 1.7); light.position.set(0, frame.bY + lightY * s, 0); group.add(light);
  const S = { t: 0, flame: 0, lit: false, litAge: 99, accF: 0, accS: 0, accE: 0, heat: 0 };
  const r = Math.random;
  return {
    S, flames, smoke, sparks, light, hotM,
    /* charge 0..1 smoulders, lit burns */
    step(dt, charge, lit) {
      S.t += dt; if (lit && !S.lit) S.litAge = 0; S.lit = lit; S.litAge += dt;
      const small = !lit ? sstep(0.78, 1, charge) * 0.3 : 0; const ft = lit ? 1 : small; S.flame = damp(S.flame, ft, lit ? 3.5 : 2, dt);
      const smoulder = lit ? 1 : sstep(0.02, 1, charge); S.heat = damp(S.heat, smoulder, 4, dt);
      const fl = 0.92 + 0.08 * Math.sin(S.t * 13.1) * Math.sin(S.t * 5.3 + 1) + 0.04 * Math.sin(S.t * 31);
      hotM.emissiveIntensity = (lit ? 0.9 : 0.75 * Math.pow(S.heat, 1.2)) * fl; light.intensity = lightPower * S.flame * fl * (lit && S.litAge < 0.5 ? 1 + (1 - S.litAge / 0.5) * 0.5 : 1);
      const y0 = frame.bY + 0.34 * s; const rad = 0.2 * s;
      /* flame tongues */
      S.accF += S.flame * (s > 1.5 ? 85 : 50) * dt; while (S.accF >= 1) { S.accF -= 1; const a = r() * TAU; const d = Math.sqrt(r()) * rad * (0.4 + 0.6 * S.flame); const core = r() < 0.4; const fc = core ? C_FLAME_CORE : C_FLAME;
        flames.emit(Math.cos(a) * d, y0 + r() * 0.06 * s, Math.sin(a) * d, (r() - 0.5) * 0.3 * s, (1.3 + r() * 1.0) * s * (0.5 + 0.5 * S.flame) * (s < 1.5 ? 1.25 : 1), (r() - 0.5) * 0.3 * s, (0.36 + r() * 0.14) * s * (0.5 + 0.5 * S.flame) * (s < 1.5 ? 1.25 : 1), 0.12 * s, 0.55 + r() * 0.3, core ? 0.85 : 0.75, fc[0], fc[1], fc[2], 0.8, 1.2 * s); }
      /* smoke: thin and pale while it smoulders, dark and tall when it burns */
      S.accS += (lit ? 7 : S.heat * 3.6) * (s > 1.5 ? 2.4 : 1) * dt; while (S.accS >= 1) { S.accS -= 1; const a = r() * TAU; const d = Math.sqrt(r()) * rad;
        const sc = lit ? C_SMOKE_D : C_SMOKE_L; smoke.emit(Math.cos(a) * d, y0 + 0.1 * s, Math.sin(a) * d, 0.35 + (r() - 0.5) * 0.3 + (s > 1.5 ? 0.9 : 0), (lit ? 1.3 : 0.7) * (0.7 + r() * 0.6) * (s > 1.5 ? 3.4 : 1), (r() - 0.5) * 0.3, 0.3 * s, (lit ? 1.9 : 1.1) * s * (0.8 + r() * 0.5), (lit ? 3.4 : 3.0) * (s > 1.5 ? 2.2 : 1), (lit ? (s > 1.5 ? 0.62 : 0.4) : 0.22), sc[0], sc[1], sc[2], s > 1.5 ? 0.05 : 0.35, 0.12); }
      /* embers */
      S.accE += (lit ? 12 : 0) * dt; while (S.accE >= 1) { S.accE -= 1; const a = r() * TAU; const d = r() * rad; sparks.emit(Math.cos(a) * d, y0 + 0.1 * s, Math.sin(a) * d, (r() - 0.5) * 0.8 + 0.3, (1.2 + r() * 1.6) * Math.sqrt(s), (r() - 0.5) * 0.8, 0.8 + r() * 0.9, 1, 0.55 + r() * 0.2, 0.18); }
      flames.update(dt); smoke.update(dt); sparks.update(dt, -0.4, -50);
    },
    dispose() { flames.dispose(); smoke.dispose(); sparks.dispose(); light.removeFromParent(); light.dispose?.(); },
  };
}

/* ================================================================== BEACON: a signal fire in an iron basket on a water-tank frame */
export function beacon(scene, { accent = 0xd98a3a, index = 0 } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group);
  const wood = woodMat(B, '#66523f', 51 + index, 0.93, 0.68); const iron = ironMat(B, 0x2e2a27);
  const F = fireFrame(B, 1, 100 + index * 7); F.P.mesh(B, 'w', wood, group); F.P.mesh(B, 'i', iron, group);
  /* a rain barrel at the foot of the frame: it is a working post */
  { const bl = new THREE.LatheGeometry([[0, 0], [0.23, 0], [0.26, 0.1], [0.285, 0.31], [0.26, 0.52], [0.23, 0.62], [0, 0.62]].map(([x, y]) => new THREE.Vector2(x, y)), 12); bl.computeVertexNormals(); const G = new Parts(); G.add('b', xf(bl, -1.35, 0, 0.5));
    for (const [y, rr] of [[0.1, 0.262], [0.31, 0.288], [0.52, 0.262]]) G.add('h', xf(new THREE.TorusGeometry(rr, 0.011, 4, 14), -1.35, y, 0.5, Math.PI / 2, 0, 0));
    G.mesh(B, 'b', wood, group); G.mesh(B, 'h', iron, group); }
  const fire = makeFire(B, group, F, 1, { lightPower: 16, lightDist: 16, lightY: 0.55 });
  const S = { lit: false, lt: 0 };
  return {
    group,
    update(dt, st = {}) { dt = Math.min(dt, 1 / 20); const lit = !!(st.lit || S.lit); fire.step(dt, clamp(st.charge || 0, 0, 1), lit); },
    light() { S.lit = true; S.lt = 0; return 1.4; },
    dispose() { fire.dispose(); group.removeFromParent(); B.free(); },
  };
}

/* ================================================================== KINDLING: a stack of split wood */
export function kindling(scene) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const r = seeded(77);
  const mat = vcMat(B, 0.95, true); const P = new Parts();
  const BARK = new THREE.Color(0x3a2a1d); const PALE = new THREE.Color(0xb59868);
  /* a split log: a half round (bark up, flat face down) or a quarter wedge, bark dark, split faces pale */
  const logG = (len, rad, quarter) => {
    const s = new THREE.Shape(); const a = quarter ? 1.45 : Math.PI; s.moveTo(0, 0); s.lineTo(rad, 0); s.absarc(0, 0, rad, 0, a, false); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 6 }); g.translate(quarter ? -rad * 0.3 : 0, 0, -len / 2); const n = NI(g); n.computeVertexNormals();
    const pos = n.attributes.position; const nor = n.attributes.normal; const col = new Float32Array(pos.count * 3); const v = 0.8 + r() * 0.4; const ox = quarter ? rad * 0.3 : 0;
    for (let i = 0; i < pos.count; i += 3) { let bark = true; for (let j = 0; j < 3; j++) { const x = pos.getX(i + j) + ox; const y = pos.getY(i + j); if (Math.abs(nor.getZ(i + j)) > 0.9 || Math.hypot(x, y) < rad * 0.97) bark = false; } const c = bark ? BARK : PALE; for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r * v; col[(i + j) * 3 + 1] = c.g * v; col[(i + j) * 3 + 2] = c.b * v; } }
    n.setAttribute('color', new THREE.BufferAttribute(col, 3)); return n;
  };
  const rad = 0.072; const len = 0.46; const layers = [[4, Math.PI / 2], [3, 0], [3, Math.PI / 2], [2, 0]];
  layers.forEach(([n, ry], li) => {
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * rad * 2.05 + (r() - 0.5) * 0.012; const y = 0.004 + li * rad * 1.42; const quarter = r() < 0.3;
      const x = ry ? (r() - 0.5) * 0.03 : off; const z = ry ? off : (r() - 0.5) * 0.03; const roll = quarter ? r() * TAU : (r() - 0.5) * 0.5 + (r() < 0.2 ? Math.PI : 0);
      P.add('l', xf(logG(len * (0.9 + r() * 0.2), rad * (0.92 + r() * 0.2), quarter), x, y + (quarter ? rad * 0.35 : 0), z, 0, ry, roll));
    }
  });
  /* thin sticks and a handful of shavings on top, chips on the ground */
  for (let i = 0; i < 7; i++) P.add('l', tint(xf(new THREE.CylinderGeometry(0.011, 0.014, 0.38 + r() * 0.15, 5), (r() - 0.5) * 0.25, 0.3, (r() - 0.5) * 0.2, Math.PI / 2 + (r() - 0.5) * 0.3, r() * TAU, 0), 0x8a6a46, 0.15, i));
  for (let i = 0; i < 9; i++) P.add('l', tint(xf(new THREE.BoxGeometry(0.06, 0.008, 0.025), (r() - 0.5) * 0.8, 0.006, (r() - 0.5) * 0.7, 0, r() * TAU, (r() - 0.5) * 0.4), 0xb09468, 0.2, i + 30));
  /* a rope tie round the stack */
  P.add('l', tint(xf(new THREE.TorusGeometry(0.28, 0.01, 4, 20), 0.0, 0.15, 0, 0, Math.PI / 2, 0, 1, 0.6, 1), 0x8a7650, 0.1, 5));
  P.mesh(B, 'l', mat, group, { recv: true });
  group.scale.setScalar(1.2);
  return { group, update() {}, dispose() { group.removeFromParent(); B.free(); } };
}

/* ================================================================== MARKER: a grave plank with the name burned in */
export function marker(scene, { name = '', accent = 0xd98a3a, serif, cream } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group);
  /*a flat pale plank lit by the low sun went one flat orange, and from the road it was seen edge-on as a pole.
     Now a hewn square tie post, dark weathered timber with strong grain, a cut top, an iron band and a horseshoe; the name
     is carved DOWN all four faces in big stacked capitals, so it reads from any side the camera comes from. */
  const wood = woodMat(B, '#5a4632', 71, 0.93, 0.52); const iron = ironMat(B, 0x2c2825);
  const PW = 0.3; const Hh = 2.0;
  const plank = new THREE.Group(); plank.rotation.z = 0.025; plank.rotation.x = -0.015; group.add(plank);
  const P = new Parts(); const E = new Parts();
  P.add('w', xf(wbox(PW, Hh, PW, { seed: 5, jit: 0.006, bow: 0.008, teethBot: 0.0 }), 0, Hh / 2, 0));
  /* a hipped cut top (four planes like an axe-dressed post head) */
  P.add('w', xf(new THREE.ConeGeometry(PW * 0.72, 0.16, 4, 1), 0, Hh + 0.08, 0, 0, Math.PI / 4, 0));
  P.mesh(B, 'w', wood, plank);
  /* an iron band below the head, its nails, and a horseshoe nailed on two faces */
  E.add('i', xf(new THREE.BoxGeometry(PW + 0.02, 0.05, PW + 0.02), 0, Hh - 0.12, 0));
  for (const a of [0, 1, 2, 3]) { const c = Math.cos(a * Math.PI / 2); const s = Math.sin(a * Math.PI / 2); for (const o of [-0.08, 0.08]) E.add('i', xf(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6), s * (PW / 2 + 0.012) + c * o, Hh - 0.12, c * (PW / 2 + 0.012) - s * o, Math.PI / 2, a * Math.PI / 2, 0)); }
  /* (no horseshoe under the name: it read as one more letter) a second iron band low on the post where it meets the stones */
  E.add('i', xf(new THREE.BoxGeometry(PW + 0.02, 0.04, PW + 0.02), 0, 0.3, 0));
  E.mesh(B, 'i', iron, plank);
  /* the mound and stones in front, dry grass */
  const M = new Parts();
  M.add('g', moundG(0.42, 0.9, 0.3, 7)); rocksRing(M, 'g', 8, 0.4, 0.13, 90, 0x6a5c50, 0.2); rocksRing(M, 'g', 8, 0.75, 0.1, 91, 0x5e5248, 0.05);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; M.add('g', tint(xf(new THREE.ConeGeometry(0.02, 0.22, 4), Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75, Math.sin(a * 3) * 0.2, 0, Math.cos(a * 2) * 0.2), 0x9a8350, 0.25, i)); }
  M.mesh(B, 'g', vcMat(B), group);
  /* the name: carved down each face, top letter first. A V-cut letter: a pale fresh-cut lower lip (lit from above), a near-black
     groove, a charred halo where the knife and the hot iron went. Letters stack, so a 0.3 m face holds the whole name. */
  const ff = serif || "'Zilla Slab', Georgia, serif"; const label = String(name || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 12);
  const chars = [...label]; const NL = Math.max(1, chars.length);
  const LH = Math.min(0.24, 1.4 / NL); const DW = PW - 0.03; const DH = LH * NL + 0.06;
  const CW = 160; const CH = Math.round(CW * DH / DW);
  const draw = (g, w, h) => {
    g.clearRect(0, 0, w, h); if (!label) return; g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = (h - CW * 0.06 / DW * 1) / NL; const fs = Math.min(w * 0.86, step * 0.94); g.font = `800 ${Math.round(fs)}px ${ff}`;
    chars.forEach((ch, i) => {
      if (ch === ' ') return; const y = (i + 0.5) * step + 6; const x = w / 2;
      g.save(); g.shadowColor = 'rgba(20,10,4,0.75)'; g.shadowBlur = 9; g.fillStyle = 'rgba(40,22,10,0.55)'; g.fillText(ch, x, y); g.restore(); /* char halo */
      g.fillStyle = '#c99f6c'; g.fillText(ch, x + 2.5, y + 3.5); /* the fresh-cut lower lip catches the light */
      g.fillStyle = '#140904'; g.fillText(ch, x, y); /* the groove */
      g.fillStyle = 'rgba(70,36,14,0.9)'; g.fillText(ch, x - 1.5, y - 2); /* the upper wall in shade */
      g.fillStyle = '#0c0502'; g.font = `800 ${Math.round(fs * 0.92)}px ${ff}`; g.fillText(ch, x - 0.5, y - 0.5); g.font = `800 ${Math.round(fs)}px ${ff}`;
    });
  };
  const tex = B.own(canvasTex(CW, CH, draw)); const U = { k: { value: 0 } };
  const nameMat = B.own(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  nameMat.onBeforeCompile = (sh2) => {
    sh2.uniforms.uK = U.k; sh2.fragmentShader = sh2.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uK;').replace('#include <map_fragment>', `#include <map_fragment>
      float rv = (1.0 - vMapUv.y) * 0.9 + vMapUv.x * 0.1; float front = uK * 1.2 - 0.1;
      float seen = 1.0 - smoothstep(front - 0.03, front + 0.01, rv);
      float heat = exp(-pow((rv - front) / 0.045, 2.0)) * step(0.001, uK) * (1.0 - smoothstep(0.9, 1.0, uK));
      diffuseColor.a *= seen; totalEmissiveRadiance += vec3(0.8, 0.26, 0.05) * heat * diffuseColor.a;`);
  };
  nameMat.customProgramCacheKey = () => 'frontier-marker-carve';
  const NY = 0.5 + DH / 2 + 0.06; const T = PW;
  const dg = mergeGeometries([0, 1, 2, 3].map((a) => NI(xf(new THREE.PlaneGeometry(DW, DH), Math.sin(a * Math.PI / 2) * (PW / 2 + 0.008), NY, Math.cos(a * Math.PI / 2) * (PW / 2 + 0.008), 0, a * Math.PI / 2, 0))));
  const decal = new THREE.Mesh(B.own(dg), nameMat); decal.renderOrder = 3; plank.add(decal);
  let alive = true;
  if (document.fonts?.load && label) document.fonts.load(`800 60px ${ff}`).then(() => { if (alive) { draw(tex.image.getContext('2d'), CW, CH); tex.needsUpdate = true; } }).catch(() => {});
  const sparks = new Sparks(group, 18, B.own(canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); })), 0.035);
  const smoke = new Puffs(group, 12, B.own(canvasTex(64, 64, softDraw)), 7);
  const S = { carving: false, t: 0, acc: 0 };
  return {
    group,
    update(dt) {
      dt = Math.min(dt, 1 / 20);
      if (S.carving && U.k.value < 1) {
        S.t += dt; U.k.value = clamp(S.t / 1.5, 0, 1); const front = U.k.value * 1.2 - 0.1; const yy = NY + DH / 2 - clamp(front, 0, 1) * DH; S.acc += dt * 28;
        while (S.acc >= 1) { S.acc -= 1; const a = Math.floor(Math.random() * 4) * Math.PI / 2; const ox = (Math.random() - 0.5) * DW * 0.8; const fx = Math.sin(a) * (T / 2 + 0.03) + Math.cos(a) * ox; const fz = Math.cos(a) * (T / 2 + 0.03) - Math.sin(a) * ox; sparks.emit(fx, yy + (Math.random() - 0.5) * 0.06, fz, Math.sin(a) * 0.4 + (Math.random() - 0.5) * 0.3, 0.4 + Math.random() * 0.6, Math.cos(a) * 0.4 + (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, 1, 0.55, 0.18); if (Math.random() < 0.3) smoke.emit(fx, yy + 0.05, fz, 0.02, 0.18, 0.05, 0.03, 0.18, 1.5, 0.22, C_BURN[0], C_BURN[1], C_BURN[2], 0.5, 0.02); }
      }
      sparks.update(dt, 1.2, -9); smoke.update(dt);
    },
    carve() { if (S.carving) return 0; S.carving = true; S.t = 0; return 1.6; },
    dispose() { alive = false; sparks.dispose(); smoke.dispose(); group.removeFromParent(); B.free(); },
  };
}

/* ================================================================== GATE: a ranch gate, two big posts, a crossbeam, a hanging sign (blank) */
export function gate(scene, { accent = 0xd98a3a } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const r = seeded(404);
  const wood = woodMat(B, '#6a5744', 91, 0.93, 0.66); const iron = ironMat(B, 0x2f2b28); const stoneM = vcMat(B);
  const GAP = 2.6; const PX = GAP + 0.28; const PH = 6.0; const BY = 5.62;
  const P = new Parts(); const G = new Parts();
  for (const sx of [-1, 1]) {
    P.add('w', xf(wbox(0.56, PH, 0.5, { seed: 100 + sx, jit: 0.014, bow: 0.02 }), sx * PX, PH / 2, 0)); P.add('w', xf(wbox(0.68, 0.12, 0.62, { seed: 103 + sx }), sx * PX, PH + 0.06, 0));
    beam(P, 'w', 0.22, 0.26, [sx * GAP, 4.0, 0.0], [sx * (GAP - 1.25), BY - 0.25, 0.0], { seed: 110 + sx });
    for (const y of [BY + 0.0]) { P.add('i', ibox(0.62, 0.07, 0.56, sx * PX, y - 0.3, 0)); P.add('i', ibox(0.62, 0.07, 0.56, sx * PX, y + 0.3, 0)); }
    for (const [x, y] of [[sx * (GAP - 0.3), BY], [sx * (GAP - 0.9), BY - 0.5]]) P.add('i', xf(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), x, y, 0.26, Math.PI / 2));
    /* horseshoe, open end up, nailed on the post face */
    P.add('i', xf(new THREE.TorusGeometry(0.1, 0.02, 5, 14, Math.PI * 1.65), sx * PX, 2.1, 0.27, 0, 0, Math.PI * 0.675));
    /* footing: stacked stones */
    G.add('g', moundG(0.75, 1.5, 0.3, 300 + sx)); rocksRing(G, 'g', 10, 0.62, 0.3, 300 + sx, 0x6a5c50, 0.2); rocksRing(G, 'g', 9, 1.1, 0.19, 310 + sx, 0x5e5248, 0.06);
    for (const g of G.b.g.splice(0)) P.add('g', xf(g, sx * PX, 0, 0));
    /* the pole for the pennant, iron bracket for the lantern */
    P.add('w', xf(wpole(0.03, 0.022, 1.7, { seed: 130 + sx }), sx * PX, PH + 0.12 + 0.85, 0));
    P.add('i', ibox(0.34, 0.04, 0.04, sx * (GAP - 0.17), 3.4, 0.0)); beamI(P, sx * GAP, 3.0, sx * (GAP - 0.3), 3.4); P.add('i', xf(new THREE.TorusGeometry(0.02, 0.006, 4, 8), sx * (GAP - 0.3), 3.35, 0, 0, Math.PI / 2, 0));
  }
  function beamI(Q, x0, y0, x1, y1) { Q.add('i', between(new THREE.BoxGeometry(0.035, Math.hypot(x1 - x0, y1 - y0), 0.035), x0, y0, 0, x1, y1, 0)); }
  /* the crossbeam, with the log ends showing past the posts */
  P.add('w', xf(wbox(0.5, 7.9, 0.42, { seed: 120, jit: 0.012 }), 0, BY, 0, 0, 0, Math.PI / 2));
  for (const sx of [-1, 1]) { P.add('w', xf(wbox(0.12, 0.34, 0.12, { seed: 125 + sx }), sx * (PX + 0.12), BY + 0.28, 0.3)); P.add('w', xf(wbox(0.12, 0.34, 0.12, { seed: 126 + sx }), sx * (PX - 0.12), BY - 0.28, 0.3)); }
  P.mesh(B, 'w', wood, group); P.mesh(B, 'i', iron, group); P.mesh(B, 'g', stoneM, group);
  /* the hanging sign: two chains, a weathered board with a pale blank panel */
  const signG = new THREE.Group(); signG.position.set(0, BY - 0.25, 0); group.add(signG);
  const SW = 3.5; const SH = 0.8;
  const signTex = B.own(canvasTex(1024, 256, (g, w, h) => {
    const rr = seeded(15); g.fillStyle = '#7a6850'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `rgba(40,28,16,${0.35})`; g.fillRect(0, y, w, 3); }
    for (let i = 0; i < 260; i++) { const x = rr() * w; const y = rr() * h; g.strokeStyle = rr() < 0.5 ? 'rgba(30,18,10,0.14)' : 'rgba(230,208,170,0.12)'; g.lineWidth = 0.8 + rr() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 + rr() * 140, y + (rr() - 0.5) * 3); g.stroke(); }
    /* the town's name in sign-painter's letters,
       cream on a dark-red field, black drop shade, flaked by the sun; a small line under it */
    g.fillStyle = '#5a1e14'; g.fillRect(70, 26, w - 140, h - 52); g.strokeStyle = 'rgba(232,212,170,0.85)'; g.lineWidth = 5; g.strokeRect(86, 40, w - 172, h - 80);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = "900 112px 'Zilla Slab', Rockwell, Georgia, serif";
    const word = 'SILVER CREEK'; const fit = Math.min(1, (w - 230) / g.measureText(word).width);
    g.save(); g.translate(w / 2, h * 0.43); g.scale(fit, 1);
    g.fillStyle = '#120806'; g.fillText(word, 6, 6); g.fillStyle = '#ecdcb4'; g.fillText(word, 0, 0); g.restore();
    g.font = "700 34px 'Zilla Slab', Georgia, serif"; g.fillStyle = '#120806'; g.fillText('★  EST. 1871  ★', w / 2 + 2, h * 0.8 + 2); g.fillStyle = '#e0c690'; g.fillText('★  EST. 1871  ★', w / 2, h * 0.8);
    /* the sun has flaked the paint: wood shows through in small chips, more along the top edge */
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 420; i++) { const x = 70 + rr() * (w - 140); const y = 26 + Math.pow(rr(), 1.6) * (h - 52); g.fillStyle = rr() < 0.7 ? 'rgba(122,104,80,0.85)' : 'rgba(40,26,16,0.7)'; g.fillRect(x, y, 2 + rr() * 9, 1 + rr() * 4); }
    for (let i = 0; i < 140; i++) { const x = rr() * w; const y = rr() * h; g.strokeStyle = 'rgba(30,18,10,0.22)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + rr() * 90, y + (rr() - 0.5) * 2); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(40,24,12,0.7)'; g.lineWidth = 5; g.strokeRect(12, 12, w - 24, h - 24);
    for (const x of [40, w - 40]) { g.fillStyle = 'rgba(30,20,12,0.85)'; g.beginPath(); g.arc(x, h / 2, 10, 0, TAU); g.fill(); }
  }));
  const signMat = B.own(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.92 }));
  const sign = new THREE.Mesh(B.own(new THREE.BoxGeometry(SW, SH, 0.07)), signMat); sign.position.y = -0.55 - SH / 2; sign.castShadow = true; signG.add(sign);
  { const C = new Parts(); for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) C.add('i', xf(new THREE.TorusGeometry(0.03, 0.009, 4, 8), sx * 1.5, -0.05 - i * 0.085, 0, 0, i % 2 ? Math.PI / 2 : 0, 0, 1, 1.4, 1)); for (const sx of [-1, 1]) C.add('i', ibox(0.12, 0.04, 0.09, sx * 1.5, -0.55, 0));
    for (const sx of [-1, 1]) { C.add('i', ibox(0.2, 0.05, 0.085, sx * 1.62, -0.55 - SH, 0)); } C.mesh(B, 'i', iron, signG); }
  /* the bell */
  const bellG = new THREE.Group(); bellG.position.set(-2.12, BY - 0.25, 0); group.add(bellG);
  { const prof = [[0.0, 0.0], [0.045, 0.0], [0.05, -0.05], [0.07, -0.12], [0.11, -0.2], [0.17, -0.3], [0.19, -0.33], [0.175, -0.345], [0.1, -0.3], [0.0, -0.3]].map(([x, y]) => new THREE.Vector2(x, y)); const bm = B.own(new THREE.LatheGeometry(prof, 14)); bm.computeVertexNormals();
    const bell = new THREE.Mesh(bm, B.own(new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }))); bell.position.y = -0.14; bell.castShadow = true; bellG.add(bell);
    const Y = new Parts(); Y.add('i', ibox(0.28, 0.04, 0.05, 0, -0.12, 0)); Y.add('i', xf(new THREE.TorusGeometry(0.04, 0.012, 4, 8), 0, -0.05, 0, 0, Math.PI / 2, 0)); Y.add('i', xf(new THREE.SphereGeometry(0.035, 7, 5), 0, -0.47, 0)); Y.add('i', ibox(0.012, 0.3, 0.012, 0, -0.32, 0)); Y.mesh(B, 'i', iron, bellG); }
  /* two lanterns on iron arms */
  const lampM = B.own(new THREE.MeshStandardMaterial({ color: 0x3a2814, emissive: 0xff9a40, emissiveIntensity: 0.55, roughness: 0.35 }));
  const LAMPS = [];
  for (const sx of [-1, 1]) { const lg = new THREE.Group(); lg.position.set(sx * (GAP - 0.3), 3.1, 0); group.add(lg);
    const glass = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.075, 0.09, 0.22, 8)), lampM); lg.add(glass);
    const I = new Parts(); I.add('i', xf(new THREE.ConeGeometry(0.1, 0.1, 8), 0, 0.16, 0)); I.add('i', xf(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 8), 0, -0.125, 0)); I.add('i', xf(new THREE.TorusGeometry(0.045, 0.008, 4, 8, Math.PI), 0, 0.23, 0)); for (const a of [0, 1, 2, 3]) I.add('i', xf(new THREE.CylinderGeometry(0.007, 0.007, 0.25, 4), Math.cos(a * 1.57 + 0.78) * 0.092, 0, Math.sin(a * 1.57 + 0.78) * 0.092)); I.mesh(B, 'i', iron, lg); LAMPS.push(lg); }
  /* pennants on the post poles */
  const penTex = (hex, band) => B.own(canvasTex(128, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = hex; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h / 2); g.lineTo(0, h); g.closePath(); g.fill(); g.fillStyle = band; g.beginPath(); g.moveTo(0, h * 0.36); g.lineTo(w * 0.62, h / 2); g.lineTo(0, h * 0.64); g.closePath(); g.fill(); }));
  const pens = [];
  [['#a8402e', '#e8d6a8'], ['#c98a2c', '#3a2a1c']].forEach(([a, b], i) => { const sx = i ? 1 : -1; const g = clothGeo(1.5, 0.6, 14, 3, true); B.own(g); const m = new THREE.Mesh(g, clothMat(B, penTex(a, b))); m.position.set(sx * PX + 0.03, PH + 0.12 + 1.45, 0); group.add(m); pens.push({ m, g, ph: i * 1.7 }); });
  const S = { t: 0, fl: 0, lift: 0 };
  return {
    group, width: GAP,
    update(dt) {
      dt = Math.min(dt, 1 / 20); S.t += dt; S.fl = Math.max(0, S.fl - dt * 0.28); const f = Math.min(1, S.fl * 1.3); S.lift = damp(S.lift, f, 3, dt);
      for (const p of pens) { p.m.rotation.z = lerp(-1.1, 0.12, S.lift) + Math.sin(S.t * 0.8 + p.ph) * 0.05; ripple(p.g, true, S.t, lerp(0.05, 0.2, S.lift), 6, 3 + S.lift * 5, p.ph); }
      lampM.emissiveIntensity = 0.5 + 0.06 * Math.sin(S.t * 7.3) * Math.sin(S.t * 2.1) + f * 0.35;
      bellG.rotation.z = Math.sin(S.t * 7) * 0.5 * Math.pow(f, 1.2) * Math.exp(0) + Math.sin(S.t * 0.7) * 0.01; signG.rotation.x = Math.sin(S.t * 0.6) * 0.008 + Math.sin(S.t * 2.3) * 0.03 * f;
    },
    flare() { S.fl = 1; },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

/* a painted signpost at eye height: a tall post, a board with two lines of hand-painted letters, two iron nails. The camera that
   reads a clue aims at the clue's middle, so the board sits at 1.45-1.95 m (eye height) and the camera never tips to the dirt. */
const SIGN_WORDS = [['WATER', '2 MI  \u2192'], ['RED MESA LINE', 'NO TRESPASS'], ["BARON'S LAND", 'KEEP OFF']];
function signpost(B, P, group, i, x, z, ry) {
  const [l1, l2] = SIGN_WORDS[i % 3];
  const tex = B.own(canvasTex(512, 224, (g, w, h) => {
    woodDraw('#8a7254', 300 + i)(g, w, h);
    g.fillStyle = 'rgba(30,18,10,0.25)'; g.fillRect(0, h * 0.5 - 2, w, 3);
    g.fillStyle = '#1e120a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "bold 70px 'Zilla Slab', Georgia, serif"; g.fillText(l1, w / 2, h * 0.3, w * 0.9);
    g.font = "bold 62px 'Zilla Slab', Georgia, serif"; g.fillText(l2, w / 2, h * 0.72, w * 0.9);
    g.fillStyle = 'rgba(236,214,176,0.12)'; for (let k = 0; k < 30; k++) g.fillRect((k * 97) % w, (k * 53) % h, 18, 2);
  }));
  const sg = new THREE.Group(); sg.position.set(x, 0, z); sg.rotation.y = ry; group.add(sg);
  const post = new THREE.Mesh(B.own(wpole(0.06, 0.05, 2.15, { seed: 30 + i })), woodMat(B, '#5a4632', 90 + i, 0.93, 0.7)); post.position.y = 1.075; post.castShadow = true; sg.add(post);
  const board = new THREE.Mesh(B.own(new THREE.BoxGeometry(1.05, 0.46, 0.04)), B.own(new THREE.MeshStandardMaterial({ map: tex, color: 0xa8a098, roughness: 0.9 })));
  board.position.set(0, 1.7, 0.06); board.rotation.z = (i - 1) * 0.03; board.castShadow = true; sg.add(board);
  /* the same words on the back: a reader may come from either side */
  const back = board.clone(); back.position.z = -0.06; back.rotation.y = Math.PI; back.rotation.z = -(i - 1) * 0.03; sg.add(back);
  for (const yy of [1.84, 1.56]) { const n = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6)), ironMat(B, 0x2c2825)); n.rotation.x = Math.PI / 2; n.position.set(0, yy, 0.085); sg.add(n); }
  return sg;
}

/* ================================================================== SIGN: the three trail clues, each beside a painted signpost */
export function sign(scene, { i = 0 } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const r = seeded(500 + i * 13);
  const wood = woodMat(B, '#66523f', 111 + i, 0.93, 0.68); const iron = ironMat(B, 0x2c2825); const P = new Parts(); const E = new Parts();
  /* a scuffed patch of dark dust under each clue */
  const scuff = new THREE.Mesh(B.own(new THREE.CircleGeometry(0.75, 20)), B.own(new THREE.MeshStandardMaterial({ color: 0x3a281a, roughness: 1, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))); scuff.rotation.x = -Math.PI / 2; scuff.position.y = 0.012; scuff.renderOrder = 2; group.add(scuff);
  let tickFn = () => {};
  if (i === 0) {
    /* a torn kerchief snagged on a splintered stake */
    P.add('w', xf(wbox(0.11, 1.15, 0.08, { seed: 5, sw: 3, sd: 3, teethTop: 0.2 }), 0, 0.575, 0, 0, 0.3, 0.05)); P.add('w', xf(wbox(0.022, 0.24, 0.012, { seed: 6 }), 0.075, 1.17, 0.03, 0, 0, -0.5));
    rocksRing(E, 'g', 6, 0.18, 0.07, 3, 0x3c342c, 0.04);
    const g = clothGeo(0.74, 0.72, 10, 10, false); B.own(g);
    const tex = B.own(canvasTex(128, 128, (c, w, h) => {
      const edge = [[0, 0], [w, 0], [w * 0.97, h * 0.26], [w * 0.84, h * 0.4], [w * 0.8, h * 0.52], [w * 0.66, h * 0.58], [w * 0.62, h * 0.8], [w * 0.52, h * 0.7], [w * 0.47, h * 0.98], [w * 0.36, h * 0.76], [w * 0.24, h * 0.7], [w * 0.2, h * 0.5], [w * 0.07, h * 0.4], [0, h * 0.2]];
      c.clearRect(0, 0, w, h); c.save(); c.beginPath(); edge.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
      c.fillStyle = '#b02a20'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(240,226,200,0.9)'; const rr = seeded(8); for (let k = 0; k < 40; k++) { const x = rr() * w; const y = rr() * h; c.beginPath(); c.arc(x, y, 2 + rr() * 2.2, 0, TAU); c.fill(); }
      c.strokeStyle = 'rgba(240,226,200,0.85)'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, 9); c.lineTo(w, 9); c.stroke();
      c.fillStyle = 'rgba(60,20,14,0.2)'; c.fillRect(0, 0, w, h); c.restore();
      c.strokeStyle = 'rgba(176,42,32,0.9)'; c.lineWidth = 1.5; for (let k = 0; k < 7; k++) { const [x, y] = edge[3 + k]; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rr() - 0.5) * 8, y + 5 + rr() * 7); c.stroke(); }
    }));
    const cm = new THREE.Mesh(g, clothMat(B, tex)); cm.position.set(0.02, 1.12, 0.06); cm.rotation.z = 0.1; cm.rotation.y = 0.12; cm.castShadow = true; group.add(cm);
    tickFn = (t) => ripple(g, false, t, 0.07, 5, 2.4, 0.5);
  } else if (i === 1) {
    /* a plank on two stakes with a brand burned in, and a boot print */
    const tex = B.own(canvasTex(1024, 420, (g, w, h) => {
      woodDraw('#6e5c48', 123)(g, w, h); const rr = seeded(2); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(40,28,16,0.35)'; g.fillRect(0, k * 70 + 4, w, 2); }
      g.save(); g.translate(300, 215); g.shadowColor = 'rgba(70,30,10,0.7)'; g.shadowBlur = 16; g.strokeStyle = '#1c0e08'; g.fillStyle = '#1c0e08'; g.lineWidth = 22; g.beginPath(); g.arc(0, 0, 138, 0, TAU); g.stroke(); g.lineWidth = 20; g.beginPath(); g.moveTo(0, -112); g.lineTo(94, 0); g.lineTo(0, 112); g.lineTo(-94, 0); g.closePath(); g.stroke(); g.lineWidth = 22; g.beginPath(); g.moveTo(-170, 0); g.lineTo(170, 0); g.stroke(); g.beginPath(); g.moveTo(0, -60); g.lineTo(0, 60); g.stroke(); g.restore();
      g.save(); g.translate(745, 215); g.rotate(-0.12); g.shadowColor = 'rgba(70,30,10,0.55)'; g.shadowBlur = 10; g.fillStyle = '#1c0e08';
      g.beginPath(); g.moveTo(-70, -150); g.bezierCurveTo(-95, -110, -90, -30, -62, 10); g.bezierCurveTo(-55, 40, -52, 70, -50, 90); g.lineTo(52, 90); g.bezierCurveTo(52, 60, 56, 20, 62, -10); g.bezierCurveTo(88, -70, 90, -130, 66, -150); g.bezierCurveTo(30, -168, -30, -168, -70, -150); g.closePath(); g.fill();
      g.beginPath(); g.rect(-52, 104, 106, 62); g.fill(); g.lineWidth = 8; g.strokeStyle = 'rgba(138,118,96,0.75)'; for (let y = -120; y < 40; y += 24) { g.beginPath(); g.moveTo(-70, y); g.lineTo(70, y + 4); g.stroke(); } g.beginPath(); g.moveTo(-60, 97); g.lineTo(60, 97); g.stroke(); g.restore();
      /* the spur: a small star */
      g.save(); g.translate(740, 380); g.fillStyle = '#1c0e08'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; const rad = k % 2 ? 7 : 16; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.closePath(); g.fill(); g.restore();
    }));
    const board = new THREE.Mesh(B.own(new THREE.BoxGeometry(1.4, 0.58, 0.05)), B.own(new THREE.MeshStandardMaterial({ map: tex, color: 0x908880, roughness: 0.92 }))); board.position.set(0, 0.78, 0); board.rotation.z = -0.035; board.castShadow = true; group.add(board);
    for (const sx of [-1, 1]) P.add('w', xf(wbox(0.09, 1.15, 0.07, { seed: 20 + sx, sw: 2, teethTop: 0.1 }), sx * 0.5, 0.5, -0.06, 0.04, 0, sx * 0.04));
    for (const [x, y] of [[-0.62, 1.0], [0.62, 0.96], [-0.62, 0.6], [0.62, 0.56]]) P.add('i', xf(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 6), x, y, 0.028, Math.PI / 2));
    rocksRing(E, 'g', 5, 0.3, 0.06, 4, 0x3c342c, 0.04);
  } else {
    /* a cold camp: a ring of stones, grey ash, black sticks, a coffee pot on a tripod, a tin cup */
    rocksRing(E, 'g', 10, 0.36, 0.085, 11, 0x6a5c50, 0.07);
    { const ashG = new THREE.CircleGeometry(0.3, 14); ashG.rotateX(-Math.PI / 2); const p = ashG.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, 0.025 + hash3(p.getX(k) * 9, 1, p.getZ(k) * 9) * 0.02); ashG.computeVertexNormals(); E.add('g', tint(ashG, 0x46423c, 0.22, 9)); }
    for (let k = 0; k < 5; k++) { const a = r() * TAU; E.add('g', tint(between(new THREE.CylinderGeometry(0.02, 0.026, 0.4, 5), Math.cos(a) * 0.22, 0.03, Math.sin(a) * 0.22, Math.cos(a) * 0.04, 0.17, Math.sin(a) * 0.04), 0x1e1a17, 0.2, k)); }
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.4; beam(P, 'w', 0.05, 0.05, [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62], [Math.cos(a) * 0.05, 1.12, Math.sin(a) * 0.05], { seed: 40 + k }); }
    P.add('i', ibox(0.012, 0.3, 0.012, 0, 0.9, 0));
    const pot = new THREE.Group(); pot.position.set(0, 0.56, 0); pot.scale.setScalar(1.35); group.add(pot);
    const pm = B.own(new THREE.MeshStandardMaterial({ color: 0x2a2c2d, roughness: 0.5, metalness: 0.45 }));
    const body = new THREE.Mesh(B.own(new THREE.LatheGeometry([[0, -0.1], [0.075, -0.1], [0.085, -0.085], [0.075, 0.07], [0.055, 0.1], [0.058, 0.112], [0, 0.115]].map(([x, y]) => new THREE.Vector2(x, y)), 12)), pm); body.castShadow = true; pot.add(body);
    const sp = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.012, 0.024, 0.14, 6)), pm); sp.position.set(-0.1, 0.03, 0); sp.rotation.z = 0.8; pot.add(sp);
    const hd = new THREE.Mesh(B.own(new THREE.TorusGeometry(0.075, 0.006, 4, 14, Math.PI)), iron); hd.position.y = 0.1; pot.add(hd);
    const kn = new THREE.Mesh(B.own(new THREE.SphereGeometry(0.016, 7, 5)), iron); kn.position.y = 0.12; pot.add(kn);
    const cup = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.045, 0.036, 0.07, 10, 1, true)), B.own(new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }))); cup.position.set(0.5, 0.035, 0.22); cup.rotation.z = 0.35; cup.castShadow = true; group.add(cup);
    tickFn = (t) => { pot.rotation.z = Math.sin(t * 0.7) * 0.012; };
  }
  /* the post stands 1.3 m off the clue, so a reader who stands at the clue sees the board at eye height, not under his feet */
  { const a = [2.2, -0.6, 0.9][i % 3]; signpost(B, P, group, i, Math.cos(a) * 1.3, Math.sin(a) * 1.3, -a + Math.PI / 2); }
  P.mesh(B, 'w', wood, group); P.mesh(B, 'i', iron, group); E.mesh(B, 'g', vcMat(B), group, { cast: false });
  let t = 0;
  return { group, update(dt) { t += Math.min(dt, 0.05); tickFn(t); }, dispose() { group.removeFromParent(); B.free(); } };
}

/* ================================================================== WAYMARK: a flag, a dust devil and circling birds (stop); a signal fire tower (goal) */
const C_DEVIL = lin(0x9a7a5a); const C_DEVIL_HI = lin(0xc8a882); /* pale dust, not a black smudge (it read as a foe, "the Thrall") */
export function waymark(scene, { kind = 'stop', accent = 0xd98a3a } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const r = seeded(kind === 'goal' ? 909 : 606);
  const flagTex = (field, band, tail) => B.own(canvasTex(256, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = field; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); if (tail) { g.lineTo(w * 0.8, h / 2); g.lineTo(w, h); } else g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    g.fillStyle = band; g.fillRect(0, 0, w * 0.07, h); g.fillStyle = 'rgba(30,14,8,0.22)'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 0; k < 9; k++) g.fillRect(0, k * 18 + 5, w, 2);
  }));
  if (kind === 'goal') {
    const wood = woodMat(B, '#5e4c3a', 81, 0.93, 0.72); const iron = ironMat(B, 0x2a2623); const sc = 5.5;
    const inner = new THREE.Group(); group.add(inner);
    const F = fireFrame(B, sc, 400); F.P.mesh(B, 'w', wood, inner); F.P.mesh(B, 'i', iron, inner);
    const fire = makeFire(B, inner, F, sc, { lightPower: 330, lightDist: 110, lightY: 1.0 });
    group.add(fire.light); fire.light.position.set(0, F.bY + 1.0 * sc, 0);
    const pole = new THREE.Mesh(B.own(wpole(0.11, 0.06, 9, { seed: 7 })), wood); pole.position.set(F.bR * 3.1, F.H + 4.5, -F.bR * 3.1); pole.castShadow = true; inner.add(pole);
    const pg = clothGeo(6.4, 2.8, 16, 4, true); B.own(pg); const pm = new THREE.Mesh(pg, clothMat(B, flagTex('#7c2214', '#2a1a10', true))); pm.position.set(F.bR * 3.1 + 0.05, F.H + 7.4, -F.bR * 3.1); inner.add(pm);
    let t = 0; const S = { k: 0 };
    return {
      group,
      update(dt, st = {}) {
        dt = Math.min(dt, 1 / 20); t = st.t ?? (t + dt); const k = st.k ?? 1; S.k = damp(S.k, k, 8, dt); const sk = sstep(0, 1, S.k); inner.visible = S.k > 0.01;
        if (!inner.visible) { fire.light.intensity = 0; return; }
        inner.scale.setScalar(0.02 + 0.98 * sk); ripple(pg, true, t, 0.6, 6, 4.5, 0); pm.rotation.z = 0.05 + Math.sin(t * 0.7) * 0.05; fire.step(dt, 1, true); fire.light.intensity *= sk;
      },
      dispose() { fire.dispose(); group.removeFromParent(); B.free(); },
    };
  }
  /* stop: a tall pole in a cairn with a flag; a dust devil beside it; vultures soaring above it */
  const wood = woodMat(B, '#5e4c3a', 83, 0.93, 0.72); const P = new Parts(); const E = new Parts();
  const PH = 12;
  P.add('w', xf(wpole(0.17, 0.1, PH, { seed: 3, seg: 8 }), 0, PH / 2, 0));
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.4; beam(P, 'w', 0.13, 0.09, [Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9], [0, 1.5, 0], { seed: 5 + k }); }
  rocksRing(E, 'g', 9, 0.65, 0.3, 77, 0x8a7662, 0.1); rocksRing(E, 'g', 8, 1.2, 0.2, 78, 0x75624f, 0.05);
  const poleG = new THREE.Group(); poleG.rotation.z = 0.015; group.add(poleG);
  P.mesh(B, 'w', wood, poleG); E.mesh(B, 'g', vcMat(B), group);
  /* the flag: dark brick red with a bleached band, a swallow-tail: a dark shape against the dusk sky */
  const fg = clothGeo(5.2, 3.1, 20, 6, true); B.own(fg); const flag = new THREE.Mesh(fg, clothMat(B, flagTex('#7c2214', '#2a1a10', true))); flag.position.set(0.12, PH - 1.9, 0); flag.castShadow = true; poleG.add(flag);
  /* the dust devil: a leaning whirl that widens as it climbs */
  const N = 64; const dev = new Puffs(group, N, B.own(canvasTex(64, 64, softDraw)), 7); const DX = 5.2; const DZ = 1.8; const HT = 32;
  /* vultures: flat dark silhouettes, instanced, soaring */
  const bg = new THREE.BufferGeometry(); const bv = new Float32Array([0, 0, -0.3, -0.5, 0.06, 0.1, 0, 0, 0.18, 0, 0, -0.3, 0, 0, 0.18, 0.5, 0.06, 0.1, 0, 0, -0.1, -0.06, 0, 0.5, 0.06, 0, 0.5]); bg.setAttribute('position', new THREE.BufferAttribute(bv, 3)); bg.scale(5, 5, 5);
  const birdM = B.own(new THREE.MeshBasicMaterial({ color: 0x120d0a, side: THREE.DoubleSide })); const NB = 5; const birds = new THREE.InstancedMesh(B.own(bg), birdM, NB); birds.frustumCulled = false; group.add(birds);
  const bph = []; for (let k = 0; k < NB; k++) bph.push({ a: r() * TAU, rad: 9 + r() * 8, y: 18 + r() * 14, w: (0.2 + r() * 0.12) * (k % 2 ? -1 : 1), bob: r() * TAU });
  let t = 0; const S = { k: 0 };
  return {
    group,
    update(dt, st = {}) {
      dt = Math.min(dt, 1 / 20); t = st.t ?? (t + dt); const k = st.k ?? 1; S.k = damp(S.k, k, 8, dt); group.visible = S.k > 0.01; if (!group.visible) return;
      const near = clamp(st.near || 0, 0, 1); const sk = sstep(0, 1, S.k); group.scale.setScalar(0.02 + 0.98 * sk);
      ripple(fg, true, t, 0.34, 5.5, 4.2, 0); flag.rotation.y = Math.sin(t * 0.5) * 0.06;
      const al = 0 * sk * (1 - near); /* the dust devil is off: at any size its puffs read as a smudge ("the Thrall") or a white ghost */ /* the dust devil is gone when the hero stands at the mark (its quads filled a third of the frame) */
      for (let i = 0; i < N; i++) {
        const u = (t * 0.07 + i / N) % 1; const a = i * 2.4 + t * 1.8 + u * 4; const y = 0.5 + u * HT; const rad = 0.2 + u * u * 4.2 + u * 0.6; const lean = u * 5;
        const jx = Math.sin(i * 5.1) * 0.2; const hi = sstep(0.2, 1, u); const fadeIn = u < 0.04 ? u / 0.04 : 1;
        dev.set(i, DX + Math.cos(a) * rad + lean * 0.6 + jx, y, DZ + Math.sin(a) * rad + lean * 0.25, 1.3 + u * 6.2, Math.min(1, Math.sin(Math.PI * Math.pow(u, 0.65)) * 1.15) * 0.34 * al * (0.65 + 0.35 * Math.sin(i * 3.7)) * fadeIn, lerp(C_DEVIL[0], C_DEVIL_HI[0], hi), lerp(C_DEVIL[1], C_DEVIL_HI[1], hi), lerp(C_DEVIL[2], C_DEVIL_HI[2], hi));
      }
      dev.update(dt, true);
      for (let i = 0; i < NB; i++) {
        const b = bph[i]; const sg = b.w > 0 ? 1 : -1; const an = b.a + t * b.w; _o.position.set(DX + 3 + Math.cos(an) * b.rad, b.y + Math.sin(t * 0.3 + b.bob) * 0.8, DZ + Math.sin(an) * b.rad);
        _o.rotation.set(0, Math.atan2(Math.sin(an) * sg, -Math.cos(an) * sg), -sg * 0.3 + Math.sin(t * 0.8 + b.bob) * 0.06, 'YXZ'); _o.scale.setScalar(sk); _o.updateMatrix(); birds.setMatrixAt(i, _o.matrix);
      }
      birds.instanceMatrix.needsUpdate = true;
    },
    dispose() { dev.dispose(); birds.dispose(); group.removeFromParent(); B.free(); },
  };
}

/* ================================================================== CAUSE: a hurricane lamp hung from a crook post */
const CAUSE_Y = 1.45; /* the lamp's middle under the crook arm's chain (arm at 2.2 m) */
export function cause(scene, { name = '' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group);
  /* the lamp hangs from a shepherd's crook: an upright post in a small cairn and an iron arm; only the lamp swings */
  const crook = new THREE.Group(); group.add(crook);
  const cw = woodMat(B, '#5a4632', 97, 0.93, 0.7);
  const cpost = new THREE.Mesh(B.own(wpole(0.05, 0.04, 2.3, { seed: 61 })), cw); cpost.position.set(-0.55, 1.15, 0); cpost.castShadow = true; crook.add(cpost);
  const arm = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 6)), ironMat(B, 0x2c2825)); arm.rotation.z = Math.PI / 2; arm.position.set(-0.26, 2.2, 0); crook.add(arm);
  const chain = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 4)), ironMat(B, 0x2c2825)); chain.position.set(0, 2.02, 0); crook.add(chain);
  { const E2 = new Parts(); rocksRing(E2, 'g', 6, 0.16, 0.08, 62, 0x5a4c40, 0.05); const cm = E2.mesh(B, 'g', vcMat(B), crook); if (cm) cm.position.x = -0.55; }
  const lamp = new THREE.Group(); lamp.position.y = CAUSE_Y; lamp.scale.setScalar(1.6); group.add(lamp);
  const brass = B.own(new THREE.MeshStandardMaterial({ color: 0x7e6334, roughness: 0.45, metalness: 0.75 })); const tin = B.own(new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.5, metalness: 0.7 }));
  const glassM = B.own(new THREE.MeshStandardMaterial({ color: 0xd9a05a, emissive: 0xc8601c, emissiveIntensity: 0.3, roughness: 0.2, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  const lat = (pts, seg = 14) => B.own(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));
  const font = new THREE.Mesh(lat([[0, -0.17], [0.058, -0.17], [0.07, -0.15], [0.078, -0.12], [0.07, -0.098], [0.05, -0.09], [0, -0.09]]), brass); lamp.add(font);
  const glass = new THREE.Mesh(lat([[0.046, -0.09], [0.06, -0.06], [0.072, -0.02], [0.064, 0.04], [0.04, 0.085], [0.032, 0.11], [0.034, 0.15]]), glassM); glass.renderOrder = 4; lamp.add(glass);
  const flame = new THREE.Mesh(lat([[0, -0.075], [0.012, -0.06], [0.02, -0.03], [0.016, 0.01], [0.007, 0.045], [0, 0.06]], 8), B.own(new THREE.MeshBasicMaterial({ color: 0xd8741c }))); lamp.add(flame);
  const P = new Parts();
  P.add('t', xf(new THREE.ConeGeometry(0.058, 0.07, 10), 0, 0.17, 0)); P.add('t', xf(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 6), 0, 0.225, 0)); P.add('t', xf(new THREE.CylinderGeometry(0.052, 0.052, 0.014, 10), 0, 0.14, 0));
  for (const a of [0, 1.57, 3.14, 4.71]) rod(P, 't', 0.0045, [Math.cos(a + 0.78) * 0.074, -0.09, Math.sin(a + 0.78) * 0.074], [Math.cos(a + 0.78) * 0.05, 0.14, Math.sin(a + 0.78) * 0.05], 4);
  P.add('t', xf(new THREE.TorusGeometry(0.066, 0.0045, 4, 16, Math.PI), 0, 0.15, 0, 0, 0, 0)); P.add('t', xf(new THREE.TorusGeometry(0.066, 0.0045, 4, 16, Math.PI), 0, 0.15, 0, 0, Math.PI / 2, 0));
  P.add('t', xf(new THREE.TorusGeometry(0.014, 0.004, 4, 8), 0, 0.2 + 0.0, 0, Math.PI / 2, 0, 0)); P.add('t', ibox(0.03, 0.012, 0.012, 0.085, -0.13, 0)); P.add('t', xf(new THREE.TorusGeometry(0.02, 0.005, 4, 8), 0, 0.275, 0, 0, Math.PI / 2, 0));
  P.mesh(B, 't', tin, lamp, { recv: false });
  const halo = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: B.own(canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,200,120,0.5)'); gr.addColorStop(0.35, 'rgba(255,150,60,0.16)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); halo.scale.set(0.42, 0.42, 0.42); halo.position.y = -0.01; lamp.add(halo);
  let t = 0; void name;
  return {
    group,
    update(dt) {
      t += Math.min(dt, 0.05); const fl = 0.9 + 0.1 * Math.sin(t * 11) * Math.sin(t * 4.3 + 1) + 0.04 * Math.sin(t * 27);
      lamp.position.y = CAUSE_Y; lamp.rotation.z = Math.sin(t * 0.9) * 0.05; lamp.rotation.x = Math.sin(t * 0.7 + 1) * 0.04; lamp.rotation.y = Math.sin(t * 0.35) * 0.4;
      flame.scale.set(0.9 + 0.1 * fl, 0.85 + 0.25 * fl, 0.9 + 0.1 * fl); glassM.emissiveIntensity = 0.24 + 0.08 * fl; halo.material.opacity = 0.28 + 0.12 * fl;
    },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

/* the far light at the end of the wonder walk (web/src/props/farlights.js) */
export function farlight(scene) { return worldFarlight('frontier', scene); }

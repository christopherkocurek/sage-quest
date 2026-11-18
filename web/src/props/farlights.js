/* the far light of the wonder walk for frontier, edo and neon (storybook has its own lamp-post plinth).
   Each world has its own object (a plain white octagon read as nothing):
     frontier  a survey tower: a timber trestle with a railroad signal lantern on top and a flat cairn under it
     edo       an ishidoro: a tall stone lantern on a stepped stone platform, its fire box lit
     neon      a relay mast: a steel lattice mast on a hazard-striped plinth, a turning amber beacon and a cyan ring
   -> { group, altarTop, slotR, update(dt, { k, flare }), dispose() } (journey.js lays the three finds at altarTop on slotR) */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const _o = new THREE.Object3D(); const _c = new THREE.Color();
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* parts painted by vertex colour, one mesh per material key */
function Parts(seed = 1) {
  const r = seeded(seed); const L = new Map();
  const add = (key, g, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, jit = 0.1) => {
    let q = g.index ? g.toNonIndexed() : g; if (q !== g) g.dispose();
    for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k);
    _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix(); q.applyMatrix4(_o.matrix);
    const n = q.attributes.position.count; const col = new Float32Array(n * 3); _c.setHex(hex);
    for (let i = 0; i < n; i += 3) { const k = 1 + (r() - 0.5) * jit; for (let j = 0; j < 3 && i + j < n; j++) col.set([_c.r * k, _c.g * k, _c.b * k], (i + j) * 3); }
    q.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (!L.has(key)) L.set(key, []); L.get(key).push(q); return q;
  };
  const beam = (key, a, b, w, hex, round = false) => { const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = v.length(); const g = round ? new THREE.CylinderGeometry(w, w, len, 7) : new THREE.BoxGeometry(w, len, w); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); const e = new THREE.Euler().setFromQuaternion(q); return add(key, g, hex, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z); };
  const rock = (key, rad, hex, x, y, z, flat = 0.6) => { const g = new THREE.IcosahedronGeometry(rad, 1); const p = g.attributes.position; const seen = new Map(); for (let i = 0; i < p.count; i++) { const kk = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; let k = seen.get(kk); if (k == null) { k = 0.8 + r() * 0.35; seen.set(kk, k); } p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * flat, p.getZ(i) * k); } g.computeVertexNormals(); return add(key, g, hex, x, y, z, 0, r() * TAU, 0); };
  return { r, add, beam, rock, L };
}
function bake(P, group, mats, owned) {
  for (const [key, list] of P.L) { const g = mergeGeometries(list, false); for (const x of list) x.dispose(); g.computeVertexNormals(); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mats[key]); m.castShadow = true; m.receiveShadow = true; group.add(m); owned.push(g); }
}
function grainTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = seeded(kind.length * 31 + 7);
  g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, 128, 128);
  if (kind === 'wood') for (let i = 0; i < 70; i++) { const v = 140 + r() * 100; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.6 + r() * 1.5; g.beginPath(); const x = r() * 128; g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 8, 128); g.stroke(); }
  else for (let i = 0; i < 1500; i++) { const v = 130 + r() * 120; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/* box UVs in metres so the grain has one size on every part */
function boxUV(g) { const P = g.attributes.position; const N = g.attributes.normal; const uv = new Float32Array(P.count * 2); for (let i = 0; i < P.count; i++) { const nx = Math.abs(N.getX(i)); const ny = Math.abs(N.getY(i)); const nz = Math.abs(N.getZ(i)); if (ny >= nx && ny >= nz) { uv[i * 2] = P.getX(i); uv[i * 2 + 1] = P.getZ(i); } else if (nx >= nz) { uv[i * 2] = P.getZ(i); uv[i * 2 + 1] = P.getY(i); } else { uv[i * 2] = P.getX(i); uv[i * 2 + 1] = P.getY(i); } } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
function haloTex(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},0.9)`); gr.addColorStop(0.25, `rgba(${rgb},0.35)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function halo(owned, rgb, s) { const t = haloTex(rgb); const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); owned.push(t, m); const sp = new THREE.Sprite(m); sp.scale.setScalar(s); sp.renderOrder = 6; return sp; }

export function farlight(world, scene) {
  const group = new THREE.Group(); scene.add(group); const owned = []; const P = Parts(world.length * 13 + 5);
  const mat = (o) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o }); owned.push(m); return m; };
  const wood = grainTex('wood'); const stone = grainTex('stone'); owned.push(wood, stone);
  const mats = { wood: mat({ map: wood }), stone: mat({ map: stone, roughness: 0.95 }), iron: mat({ roughness: 0.5, metalness: 0.75 }), paint: mat({ roughness: 0.55, metalness: 0.3 }) };
  let lampY = 3; let altarTop = 0.73; let slotR = 0.6; const glows = []; let spin = null; let ring = null;
  const glassM = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); owned.push(glassM);
  if (world === 'frontier') {
    /* a flat-topped cairn of mesa stone, the survey tower over it, the signal lantern on the top platform */
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; P.rock('stone', 0.42, 0x8a6a52, Math.cos(a) * 0.62, 0.2, Math.sin(a) * 0.62, 0.7); }
    P.add('stone', new THREE.CylinderGeometry(0.78, 0.92, 0.5, 9), 0x7a5e48, 0, 0.42, 0); P.add('stone', new THREE.CylinderGeometry(0.82, 0.8, 0.1, 9), 0x9a7a60, 0, 0.7, 0, 0, 0.3, 0);
    const H = 5.6; const F = 1.55; const T = 0.55;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.beam('wood', [sx * F, 0, sz * F], [sx * T, H, sz * T], 0.13, 0x6a5038);
    for (let lv = 0; lv < 3; lv++) { const y0 = 0.9 + lv * 1.55; const y1 = y0 + 1.55; const w0 = F - (F - T) * (y0 / H); const w1 = F - (F - T) * (y1 / H);
      for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) { P.beam('wood', [a[0] * w0, y0, a[1] * w0], [b[0] * w1, y1, b[1] * w1], 0.06, 0x7a5c40); P.beam('wood', [a[0] * w0, y0, a[1] * w0], [b[0] * w0, y0, b[1] * w0], 0.07, 0x5e462f); } }
    P.add('wood', new THREE.BoxGeometry(1.6, 0.1, 1.6), 0x6a5038, 0, H, 0); for (const s of [-1, 1]) { P.beam('wood', [s * 0.75, H, -0.75], [s * 0.75, H + 0.75, -0.75], 0.05, 0x5e462f); P.beam('wood', [s * 0.75, H, 0.75], [s * 0.75, H + 0.75, 0.75], 0.05, 0x5e462f); P.beam('wood', [s * 0.75, H + 0.75, -0.75], [s * 0.75, H + 0.75, 0.75], 0.05, 0x7a5c40); }
    /* the ladder up one face */
    for (const s of [-0.22, 0.22]) P.beam('wood', [s, 0, F + 0.1], [s, H, T + 0.08], 0.05, 0x5e462f); for (let k = 1; k < 12; k++) { const u = k / 12; const z = F + 0.1 + (T + 0.08 - F - 0.1) * u; P.add('wood', new THREE.BoxGeometry(0.5, 0.04, 0.04), 0x7a5c40, 0, H * u, z); }
    /* the railroad lantern: iron frame, a fat red-amber globe, a chimney with a bail handle */
    lampY = H + 0.62;
    P.add('iron', new THREE.CylinderGeometry(0.26, 0.3, 0.1, 12), 0x2a2522, 0, H + 0.1, 0); P.add('iron', new THREE.CylinderGeometry(0.24, 0.26, 0.08, 12), 0x2a2522, 0, H + 1.1, 0); P.add('iron', new THREE.ConeGeometry(0.2, 0.22, 12), 0x2a2522, 0, H + 1.26, 0); P.add('iron', new THREE.CylinderGeometry(0.05, 0.06, 0.18, 8), 0x2a2522, 0, H + 1.44, 0);
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; P.beam('iron', [Math.cos(a) * 0.25, H + 0.12, Math.sin(a) * 0.25], [Math.cos(a) * 0.23, H + 1.08, Math.sin(a) * 0.23], 0.025, 0x2a2522, true); }
    P.add('iron', new THREE.TorusGeometry(0.3, 0.018, 4, 16, Math.PI), 0x2a2522, 0, H + 1.4, 0);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), glassM); globe.scale.set(1, 1.25, 1); globe.position.y = lampY; group.add(globe); owned.push(globe.geometry); glows.push({ m: glassM, rgb: [1.0, 0.55, 0.22] });
    altarTop = 0.75; slotR = 0.5;
    const h1 = halo(owned, '255,170,90', 5); h1.position.y = lampY; group.add(h1); const h2 = halo(owned, '255,210,150', 1.6); h2.position.y = lampY; group.add(h2); glows.push({ h: h1, s: 5 }, { h: h2, s: 1.6 });
  } else if (world === 'edo') {
    /* a stepped stone platform and a tall ishidoro: base, pillar, platform, the fire box with paper windows, the roof with curled corners, the jewel */
    P.add('stone', new THREE.BoxGeometry(2.6, 0.3, 2.6), 0x6e6a62, 0, 0.15, 0); P.add('stone', new THREE.BoxGeometry(2.2, 0.32, 2.2), 0x7c776e, 0, 0.46, 0);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3; P.rock('stone', 0.28, 0x5e5a52, Math.cos(a) * 1.75, 0.08, Math.sin(a) * 1.75, 0.6); }
    const b = 0.62; P.add('stone', new THREE.CylinderGeometry(0.42, 0.5, 0.22, 6), 0x8a857a, 0, b + 0.11, 0); P.add('stone', new THREE.CylinderGeometry(0.2, 0.24, 1.2, 12), 0x8a857a, 0, b + 0.82, 0);
    P.add('stone', new THREE.CylinderGeometry(0.46, 0.34, 0.22, 6), 0x8a857a, 0, b + 1.53, 0);
    const fb = b + 1.95; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.add('stone', new THREE.BoxGeometry(0.1, 0.56, 0.1), 0x8a857a, Math.cos(a) * 0.32, fb, Math.sin(a) * 0.32, 0, -a, 0); }
    P.add('stone', new THREE.CylinderGeometry(0.4, 0.4, 0.07, 6), 0x8a857a, 0, fb - 0.3, 0); P.add('stone', new THREE.CylinderGeometry(0.4, 0.4, 0.06, 6), 0x8a857a, 0, fb + 0.3, 0);
    const roof = new THREE.ConeGeometry(0.82, 0.48, 6); { const p = roof.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.2) p.setY(i, y + 0.1 * (Math.hypot(p.getX(i), p.getZ(i)) > 0.78 ? 1 : 0)); } roof.computeVertexNormals(); }
    P.add('stone', roof, 0x777267, 0, fb + 0.56, 0); P.add('stone', new THREE.CylinderGeometry(0.12, 0.16, 0.12, 8), 0x8a857a, 0, fb + 0.86, 0); P.add('stone', new THREE.SphereGeometry(0.13, 10, 8), 0x8a857a, 0, fb + 1.0, 0, 0, 0, 0, 1, 1.25, 1); P.add('stone', new THREE.ConeGeometry(0.06, 0.12, 8), 0x8a857a, 0, fb + 1.17, 0);
    lampY = fb;
    const box = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.5, 6), glassM); box.position.y = fb; group.add(box); owned.push(box.geometry); glows.push({ m: glassM, rgb: [1.0, 0.62, 0.3] });
    altarTop = 0.62; slotR = 0.85;
    const h1 = halo(owned, '255,170,90', 4.2); h1.position.y = fb; group.add(h1); glows.push({ h: h1, s: 4.2 });
  } else {
    /* neon: a hazard-striped concrete plinth, a steel lattice mast, an amber beacon that turns, a cyan ring round the mast */
    P.add('paint', new THREE.CylinderGeometry(1.05, 1.15, 0.62, 8), 0x55585c, 0, 0.31, 0); P.add('paint', new THREE.CylinderGeometry(1.1, 1.1, 0.12, 8), 0x2a2c30, 0, 0.67, 0);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.add('paint', new THREE.BoxGeometry(0.42, 0.14, 0.04), k % 2 ? 0xd8a020 : 0x1a1a1c, Math.cos(a) * 1.11, 0.2, Math.sin(a) * 1.11, 0, -a + Math.PI / 2, 0); }
    const H = 5.4; const W = 0.32;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.beam('iron', [sx * W, 0.7, sz * W], [sx * W * 0.6, H, sz * W * 0.6], 0.04, 0x5a5e64, true);
    for (let y = 0.9; y < H - 0.2; y += 0.55) { const w0 = W - (W * 0.4) * ((y - 0.7) / (H - 0.7)); const w1 = W - (W * 0.4) * ((y + 0.55 - 0.7) / (H - 0.7)); for (const [a, c] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) P.beam('iron', [a[0] * w0, y, a[1] * w0], [c[0] * w1, y + 0.55, c[1] * w1], 0.018, 0x6a6e74, true); }
    P.add('iron', new THREE.BoxGeometry(0.6, 0.08, 0.6), 0x3a3d42, 0, H, 0); P.add('iron', new THREE.CylinderGeometry(0.16, 0.2, 0.2, 10), 0x2a2c30, 0, H + 0.12, 0);
    lampY = H + 0.42;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), glassM); dome.scale.set(1, 1.3, 1); dome.position.y = lampY; group.add(dome); owned.push(dome.geometry); glows.push({ m: glassM, rgb: [1.0, 0.6, 0.12] });
    /* the turning beam: two flat additive fans */
    const fanM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.15), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }); owned.push(fanM);
    const fanG = new THREE.PlaneGeometry(7, 0.5); fanG.translate(3.6, 0, 0); owned.push(fanG); spin = new THREE.Group(); spin.position.y = lampY; group.add(spin);
    for (const a of [0, Math.PI]) { const m = new THREE.Mesh(fanG, fanM); m.rotation.y = a; spin.add(m); }
    const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.9, 1.0), toneMapped: false }); owned.push(ringM); const rg = new THREE.TorusGeometry(0.62, 0.025, 6, 40); owned.push(rg); ring = new THREE.Mesh(rg, ringM); ring.rotation.x = Math.PI / 2; ring.position.y = 3.1; group.add(ring);
    altarTop = 0.73; slotR = 0.72;
    const h1 = halo(owned, '255,170,60', 4.5); h1.position.y = lampY; group.add(h1); glows.push({ h: h1, s: 4.5 });
  }
  for (const list of P.L.values()) for (const g of list) boxUV(g);
  bake(P, group, mats, owned);
  const S = { t: 0, f: 0 };
  return {
    group, altarTop, slotR, top: lampY, solidR: world === 'frontier' ? 2.3 : world === 'edo' ? 1.45 : 1.3,
    update(dt, st = {}) {
      S.t += dt; const k = clamp(st.k ?? 1); S.f = Math.max(clamp(st.flare || 0), S.f - dt * 0.4);
      const p = (0.25 + 0.75 * k) * (1 + 0.05 * Math.sin(S.t * 2.3) + 0.03 * Math.sin(S.t * 7.1)) * (1 + S.f * 0.9);
      for (const g of glows) { if (g.m) g.m.color.setRGB(g.rgb[0] * 1.8 * p, g.rgb[1] * 1.8 * p, g.rgb[2] * 1.8 * p); if (g.h) { g.h.scale.setScalar(g.s * (0.6 + 0.4 * p) * (1 + S.f * 0.8)); g.h.material.opacity = clamp(0.35 + 0.65 * k); } }
      if (spin) { spin.rotation.y += dt * 1.6; spin.children.forEach((m) => { m.material.opacity = 0.32 * k; }); }
      if (ring) ring.position.y = 3.1 + Math.sin(S.t * 1.2) * 0.25;
    },
    dispose() { group.removeFromParent(); for (const o of owned) o.dispose?.(); },
  };
}

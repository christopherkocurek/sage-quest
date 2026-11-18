/* Set pieces along the walk chapter: one readable thing every 20 to 30 m of the route, built from each
   world's own life, so the walk never crosses 30 m of empty ground.
   setpiece(scene, { world, kind, seed, accent, night }) -> { group, r, kind, update(dt, t), dispose() }
     r = the solid radius (the walk keeps the hero and the companions out of it).
   kinds(world) -> the list of kinds for that world, in route order (the walk cycles it).
   World rules kept: no magic light outside dark (no shafts, runes or glow pillars); emissive colours stay below 1.0
   outside neon; no PointLight (the light count must not change mid-walk: every lit material would recompile).
   Every surface carries a canvas grain map and vertex colour variation: no flat untextured blocks.
   Life-size metres, Y up, origin = base centre on the ground. Dense one-line code uses block comments only. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _e = new THREE.Euler(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3(); const _c = new THREE.Color();
const rng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const KINDS = {
  dark: ['ruin', 'deadtree', 'cart', 'shrine', 'ruin', 'deadtree'],
  storybook: ['haycart', 'well', 'fold', 'haystack', 'well', 'fold'],
  edo: ['paddy', 'jizo', 'paddy', 'hasa', 'paddy', 'jizo'],
  neon: ['stall', 'car', 'billboard', 'stall', 'car', 'billboard'],
  frontier: ['wagon', 'corral', 'barrels', 'wagon', 'corral', 'barrels'],
};
export function kinds(world) { return KINDS[world] || KINDS.dark; }

/* ---------- textures (shared, made once) ---------- */
const TEX = {};
function grain(kind) {
  if (TEX[kind]) return TEX[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = rng(kind.length * 97 + 11);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 128);
  if (kind === 'wood') { for (let i = 0; i < 60; i++) { const y = r() * 128; const v = 150 + r() * 90; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.6 + r() * 1.6; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 128; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2); g.stroke(); } }
  else if (kind === 'stone') { for (let i = 0; i < 900; i++) { const v = 140 + r() * 110; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 3); } for (let i = 0; i < 10; i++) { g.strokeStyle = 'rgba(70,70,70,0.5)'; g.beginPath(); g.moveTo(r() * 128, r() * 128); g.lineTo(r() * 128, r() * 128); g.stroke(); } }
  else if (kind === 'straw') { for (let i = 0; i < 700; i++) { const v = 150 + r() * 105; g.strokeStyle = `rgb(${v},${v},${v * 0.9})`; g.lineWidth = 0.7; const x = r() * 128; const y = r() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + 8 + r() * 10); g.stroke(); } }
  else if (kind === 'metal') { for (let i = 0; i < 400; i++) { const v = 170 + r() * 80; g.fillStyle = `rgba(${v},${v},${v},0.6)`; g.fillRect(r() * 128, r() * 128, 6 + r() * 30, 1); } for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(90,70,60,${0.15 + r() * 0.25})`; g.beginPath(); g.arc(r() * 128, r() * 128, 2 + r() * 8, 0, TAU); g.fill(); } }
  else { for (let i = 0; i < 1600; i++) { const v = 150 + r() * 100; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 1, 1); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; TEX[kind] = t; return t;
}

/* ---------- a part list: geometry placed and painted by vertex colour, merged into one mesh per material ---------- */
function Parts(seed) {
  const r = rng(seed); const lists = new Map();
  const add = (key, g, hex, x = 0, y = 0, z = 0, rot = [0, 0, 0], sc = 1, jit = 0.12) => {
    const q = g.index ? g.toNonIndexed() : g; if (q !== g) g.dispose();
    for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') q.deleteAttribute(k);
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    const s3 = Array.isArray(sc) ? sc : [sc, sc, sc];
    _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(s3[0], s3[1], s3[2])); q.applyMatrix4(_m);
    /* uv in metres (so the grain map has the same size on every part), from the dominant axis of each face */
    const P = q.attributes.position; const N = q.attributes.normal; const U = q.attributes.uv;
    for (let i = 0; i < P.count; i++) { const nx = Math.abs(N.getX(i)); const ny = Math.abs(N.getY(i)); const nz = Math.abs(N.getZ(i)); if (ny >= nx && ny >= nz) U.setXY(i, P.getX(i), P.getZ(i)); else if (nx >= nz) U.setXY(i, P.getZ(i), P.getY(i)); else U.setXY(i, P.getX(i), P.getY(i)); }
    const n = P.count; const col = new Float32Array(n * 3); _c.setHex(hex); const k = 1 + (r() - 0.5) * 2 * jit;
    for (let i = 0; i < n; i += 3) { const kk = k * (1 + (r() - 0.5) * jit * 0.5); for (let j = 0; j < 3 && i + j < n; j++) { col[(i + j) * 3] = _c.r * kk; col[(i + j) * 3 + 1] = _c.g * kk; col[(i + j) * 3 + 2] = _c.b * kk; } }
    q.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!lists.has(key)) lists.set(key, []); lists.get(key).push(q); return q;
  };
  /* a beam between two points */
  const beam = (key, a, b, w, d, hex, round = false) => { const dx = b[0] - a[0]; const dy = b[1] - a[1]; const dz = b[2] - a[2]; const L = Math.hypot(dx, dy, dz); const g = round ? new THREE.CylinderGeometry(w, d ?? w, L, 7) : new THREE.BoxGeometry(w, L, d); _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize()); _e.setFromQuaternion(_q); return add(key, g, hex, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, [_e.x, _e.y, _e.z]); };
  const rock = (key, rad, hex, x, y, z, flat = 0.7) => { const g = new THREE.IcosahedronGeometry(rad, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.78 + r() * 0.4; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * flat, p.getZ(i) * k); } g.computeVertexNormals(); return add(key, g, hex, x, y, z, [0, r() * TAU, 0]); };
  return { r, add, beam, rock, lists };
}
const MATS = {
  wood: (night) => new THREE.MeshStandardMaterial({ vertexColors: true, map: grain('wood'), roughness: 0.9, metalness: 0, envMapIntensity: night ? 0.25 : 0.6 }),
  stone: (night) => new THREE.MeshStandardMaterial({ vertexColors: true, map: grain('stone'), roughness: 0.95, metalness: 0, envMapIntensity: night ? 0.25 : 0.6 }),
  straw: (night) => new THREE.MeshStandardMaterial({ vertexColors: true, map: grain('straw'), roughness: 1, metalness: 0, envMapIntensity: night ? 0.25 : 0.6 }),
  metal: (night) => new THREE.MeshStandardMaterial({ vertexColors: true, map: grain('metal'), roughness: 0.45, metalness: 0.7, envMapIntensity: night ? 0.6 : 1 }),
  cloth: (night) => new THREE.MeshStandardMaterial({ vertexColors: true, map: grain('cloth'), roughness: 0.95, metalness: 0, side: THREE.DoubleSide, envMapIntensity: night ? 0.2 : 0.5 }),
  paint: (night) => new THREE.MeshStandardMaterial({ vertexColors: true, map: grain('metal'), roughness: 0.38, metalness: 0.35, envMapIntensity: night ? 0.5 : 0.9 }),
  plain: (night) => new THREE.MeshStandardMaterial({ vertexColors: true, map: grain('plain'), roughness: 0.85, metalness: 0, envMapIntensity: night ? 0.3 : 0.6 }),
};
function finish(group, parts, night, env, extra = {}) {
  const owned = [];
  for (const [key, list] of parts.lists) {
    const g = mergeGeometries(list, false); for (const x of list) x.dispose(); g.computeBoundingSphere();
    const mat = extra[key] || (MATS[key] || MATS.plain)(night); if (env && 'envMap' in mat) mat.envMap = env;
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; group.add(m); owned.push(g, mat);
  }
  return owned;
}
function disposer(group, owned) { return () => { group.removeFromParent(); for (const o of owned) o.dispose?.(); }; }

/* a small field of instanced blades (grass, rice, reeds) on a disc or a rectangle */
function tufts(group, owned, { n, w, d, h, hex, tip, seed, lean = 0.25, round = false }) {
  const g = new THREE.ConeGeometry(0.03, 1, 3, 1, true); g.translate(0, 0.5, 0);
  const col = new Float32Array(g.attributes.position.count * 3); const a = new THREE.Color(hex); const b = new THREE.Color(tip);
  for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i); const c = a.clone().lerp(b, y); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(g, mat, n); const r = rng(seed);
  for (let i = 0; i < n; i++) { let x; let z; if (round) { const aa = r() * TAU; const rr = Math.sqrt(r()) * w; x = Math.cos(aa) * rr; z = Math.sin(aa) * rr; } else { x = (r() - 0.5) * w; z = (r() - 0.5) * d; } _e.set((r() - 0.5) * lean, r() * TAU, (r() - 0.5) * lean); _q.setFromEuler(_e); const hh = h * (0.6 + r() * 0.6); _m.compose(_p.set(x, 0, z), _q, _s.set(1, hh, 1)); im.setMatrixAt(i, _m); }
  im.castShadow = false; im.receiveShadow = true; group.add(im); owned.push(g, mat); return im;
}
/* small drifting lights (fireflies, embers): additive points, each under 0.6 m */
function motes(group, owned, { n, w, h, hex, size, seed }) {
  const r = rng(seed); const g = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3); const sd = [];
  for (let i = 0; i < n; i++) sd.push([(r() - 0.5) * w, 0.3 + r() * h, (r() - 0.5) * w, r() * TAU, 0.3 + r() * 0.6]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: hex, size, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; group.add(pts); owned.push(g, mat);
  return (t) => { for (let i = 0; i < n; i++) { const s = sd[i]; pos[i * 3] = s[0] + Math.sin(t * s[4] + s[3]) * 0.6; pos[i * 3 + 1] = s[1] + Math.sin(t * s[4] * 1.7 + s[3]) * 0.25; pos[i * 3 + 2] = s[2] + Math.cos(t * s[4] * 0.8 + s[3]) * 0.6; } g.attributes.position.needsUpdate = true; mat.opacity = 0.55 + 0.4 * Math.sin(t * 2.3); };
}
/* a sign or a screen face drawn on a canvas */
function faceTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

/* ================================================================ the generators */
const B = {};

/* ---------- dark ---------- */
B.ruin = (P) => { /* a broken wall with an arch, fallen blocks and moss */
  /* hewn stones
     (each block chamfered and knocked out of square, no two the same size), pale lichen-grey limestone that holds the night
     light, a dark mortar line under each course, a real voussoir arch, moss on the tops, frost in the joints, rubble and a
     fallen capstone at the foot */
  const S = [0x8a857c, 0x7a766e, 0x958e82, 0x6e6a62]; const MOSS = 0x4a5a34; const MORTAR = 0x2a2824;
  const hewn = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const edge = (Math.abs(x) > w * 0.49 ? 1 : 0) + (Math.abs(y) > h * 0.49 ? 1 : 0) + (Math.abs(z) > d * 0.49 ? 1 : 0); const k = edge >= 2 ? 0.9 : 1; p.setXYZ(i, x * k + (P.r() - 0.5) * 0.03, y * k + (P.r() - 0.5) * 0.025, z * k + (P.r() - 0.5) * 0.03); } g.computeVertexNormals(); return g; };
  for (let i = 0; i < 9; i++) { const x = -2.4 + i * 0.62; const top = 1.2 + Math.sin(i * 1.7) * 0.9 + (i > 2 && i < 6 ? 1.4 : 0); let y = 0; let row = 0;
    while (y < top) { const h = 0.32 + P.r() * 0.14; if (!(i >= 3 && i <= 5 && y < 1.7)) { const w = 0.5 + P.r() * 0.18; P.add('stone', hewn(w, h - 0.03, 0.5 + P.r() * 0.08), S[(i + row) % 4], x + (row % 2) * 0.12, y + h / 2, (P.r() - 0.5) * 0.06, [0, (P.r() - 0.5) * 0.1, (P.r() - 0.5) * 0.05]);
        P.add('stone', new THREE.BoxGeometry(0.6, 0.03, 0.44), MORTAR, x + (row % 2) * 0.12, y + 0.012, 0); if (y + h >= top) P.add('plain', hewn(w * 0.9, 0.06, 0.48), P.r() < 0.6 ? MOSS : 0xd8dee6, x + (row % 2) * 0.12, y + h + 0.01, 0); }
      y += h; row++; } }
  /* the arch: wedge-shaped voussoirs round a half circle, a keystone a little proud */
  for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; const g = new THREE.CylinderGeometry(0.22, 0.16, 0.34, 4, 1); g.rotateY(Math.PI / 4); g.scale(1, 1, 1.6); P.add('stone', g, k === 4 ? 0x9a948a : S[k % 4], Math.cos(a) * -0.66 - 0.53, 1.7 + Math.sin(a) * 0.62, 0, [0, 0, a - Math.PI / 2], k === 4 ? 1.15 : 1); }
  /* fallen blocks, a broken capstone and small rubble at the foot */
  for (let k = 0; k < 6; k++) P.add('stone', hewn(0.5 + P.r() * 0.2, 0.36, 0.5), S[k % 4], 1.2 + P.r() * 2, 0.17, 1 + P.r() * 1.4, [P.r() * 0.4, P.r() * 3, P.r() * 0.4]);
  P.add('stone', hewn(1.4, 0.24, 0.62), 0x8e887e, -1.6, 0.14, 1.1, [0.05, 0.6, 0.12]);
  for (let k = 0; k < 14; k++) P.rock('stone', 0.08 + P.r() * 0.12, S[k % 4], -2.6 + P.r() * 5.4, 0.04, 0.5 + P.r() * 1.6, 0.6);
  for (let k = 0; k < 7; k++) P.rock('stone', 0.3 + P.r() * 0.2, MOSS, -2.6 + P.r() * 5, 0.05, (P.r() - 0.5) * 1.6, 0.4);
  return 2.8;
};
B.deadtree = (P) => { /* a dead tree, split trunk and bare limbs, with a cairn at its foot */
  const W = 0x2c2622;
  P.beam('wood', [0, -0.2, 0], [0.2, 3.2, 0.1], 0.32, 0.22, W, true);
  const limb = (a, b, r0) => P.beam('wood', a, b, r0, r0 * 0.6, W, true);
  limb([0.15, 2.4, 0.05], [1.5, 3.6, 0.4], 0.12); limb([0.1, 2.9, 0.1], [-1.2, 4.2, -0.3], 0.1); limb([0.2, 3.1, 0.1], [0.6, 4.6, -0.6], 0.09); limb([1.0, 3.2, 0.3], [1.9, 3.3, 1.0], 0.05); limb([-0.7, 3.6, -0.1], [-1.6, 3.5, 0.6], 0.05);
  for (let k = 0; k < 5; k++) P.beam('wood', [0, 0.1, 0], [Math.cos(k * 1.3) * 1.1, -0.1, Math.sin(k * 1.3) * 1.1], 0.09, 0.05, W, true);
  let y = 0; [0.42, 0.33, 0.25, 0.17].forEach((rr, k) => { P.rock('stone', rr, 0x5c5850, 1.4, y + rr * 0.5, 0.9 + k * 0.03, 0.62); y += rr * 0.95; });
  return 1.2;
};
B.cart = (P) => { /* a broken cart on its side, a wheel off, sacks spilled */
  const W = 0x4a3a2a;
  for (let k = 0; k < 6; k++) P.add('wood', new THREE.BoxGeometry(2.4, 0.06, 0.24), W, 0, 0.5 + k * 0.01, -0.62 + k * 0.25, [0.32, 0, 0]);
  for (const s of [-1, 1]) P.add('wood', new THREE.BoxGeometry(2.5, 0.4, 0.07), W, 0, 0.55, s * 0.72, [0.32, 0, 0]);
  P.beam('wood', [1.2, 0.35, 0], [3.0, 0.1, 0.3], 0.07, 0.07, W); P.beam('wood', [1.2, 0.35, 0.5], [3.0, 0.1, 0.8], 0.07, 0.07, W);
  const wheel = (x, y, z, rx) => { P.add('wood', new THREE.TorusGeometry(0.55, 0.06, 6, 16), 0x3a2c20, x, y, z, rx); for (let k = 0; k < 6; k++) P.add('wood', new THREE.BoxGeometry(0.04, 1.05, 0.05), 0x3a2c20, x, y, z, [rx[0], rx[1], k * Math.PI / 6]); };
  wheel(-0.8, 0.56, -0.95, [0, 0, 0]); wheel(1.6, 0.08, 1.4, [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) P.add('cloth', new THREE.SphereGeometry(0.3, 8, 6), 0x6a5a44, -0.3 + k * 0.5, 0.18, 1.0 + P.r() * 0.4, [0, 0, 0], [1, 0.6, 0.8]);
  return 2.6;
};
B.shrine = (P) => { /* a roadside stone with a little roof and a cold offering bowl */
  P.add('stone', new THREE.BoxGeometry(0.8, 0.5, 0.8), 0x4e4a44, 0, 0.25, 0); P.add('stone', new THREE.BoxGeometry(0.5, 1.4, 0.4), 0x5a564e, 0, 1.2, 0, [0, 0, 0.03]);
  P.add('wood', new THREE.ConeGeometry(0.75, 0.5, 4), 0x2c2420, 0, 2.15, 0, [0, Math.PI / 4, 0]);
  for (const s of [-1, 1]) P.beam('wood', [s * 0.45, 0.5, 0.35], [s * 0.45, 1.95, 0.35], 0.05, 0.05, 0x2c2420);
  P.add('metal', new THREE.CylinderGeometry(0.18, 0.1, 0.12, 10), 0x4a3a2a, 0, 0.56, 0.3);
  for (let k = 0; k < 6; k++) P.rock('stone', 0.18 + P.r() * 0.12, 0x56524a, Math.cos(k) * 0.9, 0.05, Math.sin(k) * 0.9);
  return 0.9;
};

/* ---------- storybook ---------- */
B.haycart = (P) => { /* a red hay cart with yellow wheels, hay piled high, a pitchfork leaning on it */
  for (let k = 0; k < 5; k++) P.add('wood', new THREE.BoxGeometry(2.4, 0.07, 0.26), 0xb8402c, 0, 0.75, -0.55 + k * 0.27);
  for (const s of [-1, 1]) P.add('wood', new THREE.BoxGeometry(2.4, 0.5, 0.06), 0xc8452e, 0, 1.0, s * 0.68);
  for (const s of [-1, 1]) P.add('wood', new THREE.BoxGeometry(0.06, 0.5, 1.4), 0xc8452e, s * 1.2, 1.0, 0);
  const wheel = (x, z) => { P.add('wood', new THREE.TorusGeometry(0.5, 0.07, 6, 18), 0xe8b83c, x, 0.5, z); P.add('wood', new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), 0xe8b83c, x, 0.5, z, [Math.PI / 2, 0, 0]); for (let k = 0; k < 6; k++) P.add('wood', new THREE.BoxGeometry(0.05, 0.95, 0.05), 0xe8b83c, x, 0.5, z, [0, 0, k * Math.PI / 6]); };
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.78, 0.78]) wheel(sx, sz);
  P.add('straw', new THREE.SphereGeometry(1, 12, 8), 0xe8c862, 0, 1.25, 0, [0, 0, 0], [1.25, 0.75, 0.75]);
  P.add('straw', new THREE.SphereGeometry(0.7, 10, 7), 0xf0d478, 0.2, 1.75, 0.05, [0, 0, 0], [1, 0.7, 0.8]);
  P.beam('wood', [1.2, 0.6, 0], [2.6, 0.3, 0], 0.05, 0.05, 0x8a5a2a, true); P.beam('wood', [1.2, 0.6, 0.4], [2.6, 0.3, 0.4], 0.05, 0.05, 0x8a5a2a, true);
  P.beam('wood', [-1.35, 0, 0.9], [-1.15, 2.0, 0.75], 0.025, 0.025, 0x8a5a2a, true);
  return 1.7;
};
B.well = (P) => { /* a round stone well with a little blue roof, a bucket on a rope, flowers round it */
  for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; for (let y = 0; y < 3; y++) P.add('stone', new THREE.BoxGeometry(0.42, 0.28, 0.26), y % 2 ? 0xc8bca0 : 0xb8ac90, Math.cos(a + y * 0.2) * 0.85, 0.14 + y * 0.29, Math.sin(a + y * 0.2) * 0.85, [0, -(a + y * 0.2), 0]); }
  for (const s of [-1, 1]) P.add('wood', new THREE.BoxGeometry(0.12, 2.2, 0.12), 0x8a5a2a, s * 0.85, 1.1, 0);
  P.add('wood', new THREE.CylinderGeometry(0.07, 0.07, 1.9, 8), 0x7a4a22, 0, 1.75, 0, [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) P.add('wood', new THREE.BoxGeometry(2.1, 0.06, 0.95), 0x2f5fb0, 0, 2.48, s * 0.4, [s * 0.55, 0, 0]);
  P.add('cloth', new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), 0xd8c8a0, 0, 1.45, 0); P.add('wood', new THREE.CylinderGeometry(0.16, 0.12, 0.24, 10), 0x9a6a32, 0, 1.05, 0);
  const F = [0xe8809a, 0xe8b83c, 0xffffff, 0xc8402c];
  for (let k = 0; k < 22; k++) { const a = P.r() * TAU; const rr = 1.15 + P.r() * 0.5; P.add('plain', new THREE.SphereGeometry(0.06, 6, 4), F[k % 4], Math.cos(a) * rr, 0.2 + P.r() * 0.1, Math.sin(a) * rr); P.add('plain', new THREE.CylinderGeometry(0.01, 0.01, 0.22, 3), 0x3f8a3a, Math.cos(a) * rr, 0.1, Math.sin(a) * rr); }
  return 1.15;
};
B.fold = (P, o) => { /* a wattle fence round a few sheep (wool balls, black faces); they turn their heads */
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU * 0.8 + 0.6; P.add('wood', new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6), 0x7a5a32, Math.cos(a) * 2.6, 0.5, Math.sin(a) * 2.6); }
  for (const y of [0.4, 0.75]) for (let k = 0; k < 15; k++) { const a0 = k / 16 * TAU * 0.8 + 0.6; const a1 = (k + 1) / 16 * TAU * 0.8 + 0.6; P.beam('wood', [Math.cos(a0) * 2.6, y, Math.sin(a0) * 2.6], [Math.cos(a1) * 2.6, y + 0.03, Math.sin(a1) * 2.6], 0.03, 0.03, 0x9a7442, true); }
  o.sheep = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group(); const a = k * 1.7; g.position.set(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.2); g.rotation.y = P.r() * TAU;
    const wool = new THREE.MeshStandardMaterial({ color: 0xf2ede0, map: grain('cloth'), roughness: 1 }); const face = new THREE.MeshStandardMaterial({ color: 0x1e1a18, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), wool); body.scale.set(1, 0.8, 1.35); body.position.y = 0.62; body.castShadow = true; g.add(body);
    const head = new THREE.Group(); head.position.set(0, 0.78, 0.55); g.add(head);
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), face); hm.scale.set(0.85, 1, 1.25); head.add(hm);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), face); ear.scale.set(1.6, 0.5, 0.8); ear.position.set(s * 0.15, 0.05, -0.02); head.add(ear); }
    for (const [x, z] of [[-0.18, 0.3], [0.18, 0.3], [-0.18, -0.3], [0.18, -0.3]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 5), face); l.position.set(x, 0.21, z); g.add(l); }
    o.group.add(g); o.sheep.push({ g, head, ph: P.r() * TAU }); o.owned.push(wool, face, body.geometry, hm.geometry);
  }
  return 2.8;
};
B.haystack = (P) => { /* two round haystacks and a scarecrow in a patched coat */
  P.add('straw', new THREE.SphereGeometry(1.1, 12, 9), 0xe0bc58, 0, 0.7, 0, [0, 0, 0], [1, 1.05, 1]); P.add('straw', new THREE.ConeGeometry(0.9, 0.9, 12), 0xd8b450, 0, 1.75, 0);
  P.add('straw', new THREE.SphereGeometry(0.8, 12, 9), 0xe8c862, 1.8, 0.5, 0.6, [0, 0, 0], [1, 0.95, 1]);
  P.beam('wood', [-1.8, 0, -0.6], [-1.8, 2.3, -0.6], 0.05, 0.05, 0x7a5a32, true); P.beam('wood', [-2.5, 1.7, -0.6], [-1.1, 1.7, -0.6], 0.04, 0.04, 0x7a5a32, true);
  P.add('cloth', new THREE.BoxGeometry(0.6, 0.8, 0.3), 0x2f5fb0, -1.8, 1.45, -0.6); P.add('cloth', new THREE.BoxGeometry(0.2, 0.2, 0.31), 0xc8402c, -1.7, 1.55, -0.6);
  P.add('straw', new THREE.SphereGeometry(0.2, 8, 6), 0xe8d8ae, -1.8, 2.0, -0.6); P.add('cloth', new THREE.ConeGeometry(0.32, 0.4, 8), 0x7a5a32, -1.8, 2.28, -0.6);
  return 1.5;
};

/* ---------- edo ---------- */
B.paddy = (P, o) => { /* a flooded rice plot: low earth dikes round still water (the moon in it), rice in rows, reeds at the edge, fireflies */
  const W = 7.5; const D = 5.5;
  for (const [x, z, w, d] of [[0, -D / 2, W + 0.6, 0.6], [0, D / 2, W + 0.6, 0.6], [-W / 2, 0, 0.6, D], [W / 2, 0, 0.6, D]]) { P.add('stone', new THREE.BoxGeometry(w, 0.9, d), 0x3a3428, x, -0.25, z); P.add('plain', new THREE.BoxGeometry(w * 0.98, 0.04, d * 0.6), 0x3c4a2a, x, 0.22, z); }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, D - 0.5), new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.06, metalness: 0.85, envMapIntensity: 1.6 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.08; water.receiveShadow = true; o.group.add(water); o.owned.push(water.geometry, water.material);
  const rice = new THREE.Group(); rice.position.y = 0.06; o.group.add(rice);
  const g = new THREE.ConeGeometry(0.035, 1, 3, 1, true); g.translate(0, 0.5, 0); const mat = new THREE.MeshStandardMaterial({ color: 0x5a7a34, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x0c1406 });
  const rows = []; for (let x = -W / 2 + 0.7; x < W / 2 - 0.5; x += 0.5) for (let z = -D / 2 + 0.6; z < D / 2 - 0.5; z += 0.45) for (let k = 0; k < 3; k++) rows.push([x + (P.r() - 0.5) * 0.1, z + (P.r() - 0.5) * 0.1]);
  const im = new THREE.InstancedMesh(g, mat, rows.length); rows.forEach(([x, z], i) => { _e.set((P.r() - 0.5) * 0.4, P.r() * TAU, (P.r() - 0.5) * 0.4); _q.setFromEuler(_e); _m.compose(_p.set(x, 0, z), _q, _s.set(1, 0.4 + P.r() * 0.25, 1)); im.setMatrixAt(i, _m); });
  rice.add(im); o.owned.push(g, mat);
  const reeds = new THREE.Group(); reeds.position.set(-W / 2 - 0.2, 0, D / 2 + 0.2); o.group.add(reeds); tufts(reeds, o.owned, { n: 70, w: 1.4, d: 1.4, h: 1.5, hex: 0x2c3a1c, tip: 0x8a8a4a, seed: 7, round: true });
  const r2 = new THREE.Group(); r2.position.set(W / 2 + 0.2, 0, -D / 2 - 0.1); o.group.add(r2); tufts(r2, o.owned, { n: 50, w: 1.1, d: 1.1, h: 1.3, hex: 0x2c3a1c, tip: 0x8a8a4a, seed: 9, round: true });
  o.tick = motes(o.group, o.owned, { n: 26, w: W, h: 1.6, hex: 0xd8ff7a, size: 0.09, seed: 13 });
  o.flat = true; return 0; /* walkable: the hero may wade through (the route crosses it) */
};
B.jizo = (P) => { /* three little stone jizo in red bibs under a plank roof, a bamboo water pipe, offerings */
  for (let k = -1; k <= 1; k++) { const x = k * 0.55; P.add('stone', new THREE.CylinderGeometry(0.17, 0.2, 0.55, 10), 0x7a7468, x, 0.28, 0); P.add('stone', new THREE.SphereGeometry(0.15, 10, 8), 0x84786c, x, 0.68, 0); P.add('cloth', new THREE.ConeGeometry(0.22, 0.26, 10, 1, true), 0xa02a20, x, 0.42, 0.02); }
  P.add('stone', new THREE.BoxGeometry(2.0, 0.12, 0.8), 0x5a554c, 0, 0.0, 0);
  for (const s of [-1, 1]) for (const z of [-0.35, 0.35]) P.add('wood', new THREE.BoxGeometry(0.08, 1.5, 0.08), 0x3a2a1c, s * 0.95, 0.75, z);
  for (const s of [-1, 1]) P.add('wood', new THREE.BoxGeometry(2.3, 0.05, 0.7), 0x2a2018, 0, 1.6, s * 0.28, [s * 0.35, 0, 0]);
  for (let k = 0; k < 3; k++) P.add('plain', new THREE.SphereGeometry(0.05, 6, 4), 0xe8e0c8, -0.55 + k * 0.55, 0.12, 0.3);
  P.beam('wood', [1.4, 0.9, 0.2], [1.4, 0.0, 0.2], 0.05, 0.05, 0x7a8a3a, true); P.add('stone', new THREE.CylinderGeometry(0.3, 0.32, 0.25, 10), 0x5a554c, 1.4, 0.12, 0.6);
  return 1.1;
};
B.hasa = (P) => { /* a rice-drying rack: bundles of straw hung on a bamboo rail between crossed poles */
  for (const x of [-2.2, 0, 2.2]) { P.beam('wood', [x - 0.4, 0, 0], [x + 0.25, 2.1, 0], 0.04, 0.04, 0x7a6a3a, true); P.beam('wood', [x + 0.4, 0, 0], [x - 0.25, 2.1, 0], 0.04, 0.04, 0x7a6a3a, true); }
  for (const y of [1.15, 1.75]) P.beam('wood', [-2.6, y, 0], [2.6, y, 0], 0.045, 0.045, 0x8a7a42, true);
  for (const y of [1.15, 1.75]) for (let x = -2.4; x < 2.4; x += 0.22) { P.add('straw', new THREE.ConeGeometry(0.11, 0.7, 6), 0xb89a52, x, y - 0.3, 0.06, [0, 0, (P.r() - 0.5) * 0.1]); P.add('straw', new THREE.ConeGeometry(0.11, 0.7, 6), 0xa88a48, x + 0.05, y - 0.3, -0.06, [0, 0, (P.r() - 0.5) * 0.1]); }
  return 1.0;
};

/* ---------- neon ---------- */
const NEON = [0x3ef2ff, 0xff3aa0, 0xffa53a, 0x38ff8a];
B.stall = (P, o) => { /* a noodle stall: counter, awning, steam, stools, a lit menu board and paper lanterns */
  P.add('metal', new THREE.BoxGeometry(2.6, 1.0, 0.9), 0x3a3c42, 0, 0.5, 0); P.add('wood', new THREE.BoxGeometry(2.8, 0.06, 1.1), 0x6a4a32, 0, 1.03, 0.08);
  for (const s of [-1, 1]) P.add('metal', new THREE.BoxGeometry(0.08, 2.5, 0.08), 0x2a2c30, s * 1.3, 1.25, -0.4);
  P.add('cloth', new THREE.BoxGeometry(3.0, 0.05, 1.6), 0xa0283a, 0, 2.45, 0.3, [-0.25, 0, 0]);
  for (let k = 0; k < 3; k++) { P.add('metal', new THREE.CylinderGeometry(0.2, 0.18, 0.05, 10), 0x2a2c30, -0.8 + k * 0.8, 0.62, 0.95); P.add('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), 0x2a2c30, -0.8 + k * 0.8, 0.3, 0.95); }
  P.add('metal', new THREE.CylinderGeometry(0.28, 0.26, 0.4, 12), 0x8a8e96, -0.7, 1.25, -0.05);
  const tex = faceTex(512, 256, (g, w, h) => { g.fillStyle = '#120a14'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff3aa0'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#ffd0ec'; g.font = 'bold 120px "Chakra Petch", Arial'; g.textAlign = 'center'; g.fillText('RAMEN', w / 2, 140); g.fillStyle = '#3ef2ff'; g.font = '48px "Chakra Petch", Arial'; g.fillText('OPEN ALL NIGHT', w / 2, 210); });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xbbbbbb })); board.position.set(0, 3.1, 0.02); o.group.add(board); o.owned.push(board.geometry, board.material, tex);
  /* paper lanterns with ribs, black caps and a cord,
     lit from inside (emissive) and shaded by the street light, brighter at the belly than at the caps */
  { const prof = []; for (let i = 0; i <= 16; i++) { const v = i / 16; const y = (v - 0.5) * 0.46; const rr = 0.2 * Math.sin(Math.PI * (0.08 + v * 0.84)) * (1 + 0.04 * Math.cos(v * Math.PI * 16)); prof.push(new THREE.Vector2(Math.max(0.05, rr), y)); }
    const lg = new THREE.LatheGeometry(prof, 18); const n = lg.attributes.position.count; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const y = lg.attributes.position.getY(i); const k = 1 - Math.abs(y) / 0.23; const v = (y + 0.23) / 0.46; const rib = 0.66 + 0.34 * Math.abs(Math.cos(v * Math.PI * 8)); const c = (0.28 + 0.72 * Math.pow(Math.max(0, k), 0.9)) * rib; col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c; } lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lm = new THREE.MeshStandardMaterial({ color: 0xc8402a, emissive: 0xff7040, emissiveIntensity: 0.8, roughness: 0.75, vertexColors: true, side: THREE.DoubleSide });
    /* the inner light follows the vertex shade too (belly bright, ribs and caps dim), so the lantern never reads as a flat disc */
    lm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb * vColor.rgb;'); };
    const cap = new THREE.CylinderGeometry(0.075, 0.085, 0.05, 12); const capM = new THREE.MeshStandardMaterial({ color: 0x141012, roughness: 0.5, metalness: 0.4 }); const cord = new THREE.CylinderGeometry(0.006, 0.006, 0.35, 4);
    o.owned.push(lg, lm, cap, capM, cord);
    for (const s of [-1, 1]) { const g = new THREE.Group(); g.position.set(s * 1.1, 2.1, 0.9); const l = new THREE.Mesh(lg, lm); g.add(l); for (const y of [0.245, -0.245]) { const c = new THREE.Mesh(cap, capM); c.position.y = y; g.add(c); } const cd = new THREE.Mesh(cord, capM); cd.position.y = 0.44; g.add(cd); o.group.add(g); } }
  o.tick = motes(o.group, o.owned, { n: 14, w: 0.5, h: 1.4, hex: 0x6a6a72, size: 0.35, seed: 4 });
  return 1.6;
};
B.car = (P, o) => { /* a parked car, rain on its roof, tail lights lit */
  const C = [0x1c2a3a, 0x3a1c22, 0x2a2a2e][Math.floor(P.r() * 3)];
  P.add('paint', new THREE.BoxGeometry(1.8, 0.62, 4.3), C, 0, 0.6, 0); P.add('paint', new THREE.CylinderGeometry(0.62, 0.86, 0.55, 4, 1), C, 0, 1.18, -0.2, [0, Math.PI / 4, 0], [1.2, 1, 2.2]);
  P.add('plain', new THREE.BoxGeometry(1.3, 0.36, 2.1), 0x0a0c10, 0, 1.2, -0.2);
  for (const sx of [-0.85, 0.85]) for (const sz of [-1.35, 1.35]) P.add('plain', new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), 0x101010, sx, 0.34, sz, [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(2) })); l.position.set(s * 0.65, 0.78, -2.16); o.group.add(l); o.owned.push(l.geometry, l.material);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(1.2) })); h.position.set(s * 0.6, 0.72, 2.16); o.group.add(h); o.owned.push(h.geometry, h.material); }
  return 2.2;
};
B.billboard = (P, o) => { /* a street ad screen on two posts, as big as a door is tall: a face of the company that owns the city */
  for (const s of [-1, 1]) P.add('metal', new THREE.BoxGeometry(0.16, 4.2, 0.16), 0x2a2c30, s * 1.6, 2.1, 0);
  P.add('metal', new THREE.BoxGeometry(3.6, 2.2, 0.2), 0x1a1c20, 0, 3.4, -0.08);
  const c = NEON[Math.floor(P.r() * 4)]; const hex = `#${new THREE.Color(c).getHexString()}`;
  const words = [['BUY', 'NOW'], ['OBEY', 'THE TOWER'], ['WORK', 'SLEEP'], ['OWNED', 'BY THE CITY']][Math.floor(P.r() * 4)];
  const tex = faceTex(512, 320, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a0814'); gr.addColorStop(1, '#1a0a20'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = hex; g.font = 'bold 130px "Chakra Petch", Arial'; g.textAlign = 'center'; g.fillText(words[0], w / 2, 150); g.font = '56px "Chakra Petch", Arial'; g.fillStyle = '#f0f0ff'; g.fillText(words[1], w / 2, 240); for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, w, 1); } });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.0), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xcccccc })); scr.position.set(0, 3.4, 0.03); o.group.add(scr); o.owned.push(scr.geometry, scr.material, tex);
  for (let k = 0; k < 4; k++) P.add('plain', new THREE.BoxGeometry(0.5, 0.4, 0.5), 0x3a3428, -1 + k * 0.6 + P.r() * 0.2, 0.2, 0.7 + P.r() * 0.3, [0, P.r(), 0]);
  o.screen = scr; return 1.8;
};

/* ---------- frontier ---------- */
B.wagon = (P) => { /* a covered wagon, canvas on hoops, a water barrel lashed to its side */
  P.add('wood', new THREE.BoxGeometry(1.5, 0.5, 3.2), 0x6a4a2c, 0, 1.0, 0);
  /* the hoops stand across the bed and the canvas is a half
     tube along the wagon over them (both were turned a quarter the wrong way), sagging a little between the hoops */
  for (let k = 0; k < 5; k++) { const z = -1.4 + k * 0.7; P.add('wood', new THREE.TorusGeometry(0.78, 0.03, 4, 14, Math.PI), 0x5a3a22, 0, 1.25, z); }
  { const g = new THREE.CylinderGeometry(0.82, 0.82, 3.0, 16, 12, true, -Math.PI / 2, Math.PI); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const sag = 1 - 0.035 * Math.abs(Math.sin((y + 1.5) / 0.7 * Math.PI)); p.setX(i, p.getX(i) * sag); p.setZ(i, p.getZ(i) * sag); }
    g.computeVertexNormals(); P.add('cloth', g, 0xd8ccaa, 0, 1.25, 0, [-Math.PI / 2, 0, 0]); }
  for (const z of [-1.5, 1.5]) P.add('cloth', new THREE.TorusGeometry(0.62, 0.05, 5, 14, Math.PI), 0xc8b894, 0, 1.25, z);
  const wheel = (x, z, r) => { P.add('wood', new THREE.TorusGeometry(r, 0.05, 6, 18), 0x4a3020, x, r, z, [0, Math.PI / 2, 0]); for (let k = 0; k < 7; k++) P.add('wood', new THREE.BoxGeometry(0.04, r * 2, 0.04), 0x4a3020, x, r, z, [k * Math.PI / 7, 0, 0]); };
  for (const s of [-0.82, 0.82]) { wheel(s, -1.1, 0.55); wheel(s, 1.15, 0.7); }
  P.beam('wood', [0, 0.8, 1.6], [0, 0.35, 3.4], 0.06, 0.06, 0x5a3a22);
  P.add('wood', new THREE.CylinderGeometry(0.28, 0.3, 0.7, 12), 0x7a5434, 0.95, 1.1, -0.4); for (const y of [0.85, 1.35]) P.add('metal', new THREE.TorusGeometry(0.29, 0.02, 4, 14), 0x2a2420, 0.95, y, -0.4, [Math.PI / 2, 0, 0]);
  return 3.0;
};
B.corral = (P) => { /* a split-rail corral corner, a water trough, a saddle on the top rail */
  const posts = [[-3, -1.5], [-1, -1.5], [1, -1.5], [3, -1.5], [3, 0.5], [3, 2.5]];
  for (const [x, z] of posts) P.add('wood', new THREE.BoxGeometry(0.16, 1.5, 0.16), 0x5a4030, x, 0.75, z, [0, P.r(), 0.03]);
  for (let k = 0; k < posts.length - 1; k++) for (const y of [0.55, 1.15]) P.beam('wood', [posts[k][0], y, posts[k][1]], [posts[k + 1][0], y + (P.r() - 0.5) * 0.1, posts[k + 1][1]], 0.07, 0.07, 0x7a5a3c, true);
  P.add('wood', new THREE.BoxGeometry(2.0, 0.5, 0.7), 0x5a4030, 0, 0.25, -0.6); P.add('plain', new THREE.BoxGeometry(1.84, 0.04, 0.54), 0x1a2a2a, 0, 0.47, -0.6);
  P.add('cloth', new THREE.SphereGeometry(0.35, 10, 6, 0, TAU, 0, Math.PI / 2), 0x6a3a1e, 1, 1.15, -1.5, [0, 0, 0], [1, 0.5, 0.8]);
  return 0.9;
};
B.barrels = (P) => { /* barrels and crates by a hitching post, a lantern hook, a coiled rope */
  for (let k = 0; k < 4; k++) { const x = -0.8 + (k % 2) * 0.75; const z = k < 2 ? 0 : 0.7; P.add('wood', new THREE.CylinderGeometry(0.32, 0.34, 0.9, 12), 0x7a5434, x, 0.45, z); for (const y of [0.15, 0.75]) P.add('metal', new THREE.TorusGeometry(0.335, 0.02, 4, 14), 0x2a2420, x, y, z, [Math.PI / 2, 0, 0]); }
  P.add('wood', new THREE.CylinderGeometry(0.32, 0.34, 0.9, 12), 0x6a4a2c, -0.4, 1.35, 0.35);
  for (let k = 0; k < 3; k++) P.add('wood', new THREE.BoxGeometry(0.7, 0.6, 0.7), 0x8a6a44, 0.9 + (k === 2 ? 0.3 : k * 0.75), 0.3 + (k === 2 ? 0.6 : 0), 0.2, [0, P.r() * 0.3, 0]);
  P.add('wood', new THREE.BoxGeometry(0.14, 1.2, 0.14), 0x5a4030, 2.4, 0.6, -0.6); P.add('wood', new THREE.BoxGeometry(0.14, 1.2, 0.14), 0x5a4030, 2.4, 0.6, 1.0); P.beam('wood', [2.4, 1.1, -0.7], [2.4, 1.1, 1.1], 0.06, 0.06, 0x7a5a3c, true);
  P.add('cloth', new THREE.TorusGeometry(0.22, 0.04, 6, 14), 0xb8a070, 0, 0.04, -0.7, [Math.PI / 2, 0, 0]);
  return 1.4;
};

export function setpiece(scene, { world = 'dark', kind = null, seed = 1, night = true, env = null } = {}) {
  const group = new THREE.Group(); scene.add(group);
  const k = kind || kinds(world)[0]; const P = Parts(seed * 7919 + k.length);
  const o = { group, owned: [], tick: null };
  const fn = B[k] || B.ruin; const r = fn(P, o);
  const owned = [...o.owned, ...finish(group, P, night, env)];
  if (env) group.traverse((m) => { if (m.isMesh && m.material?.isMeshStandardMaterial && !m.material.envMap) m.material.envMap = env; });
  let t = 0;
  return {
    group, r, kind: k, flat: !!o.flat,
    update(dt) {
      t += dt; o.tick?.(t);
      if (o.sheep) for (const s of o.sheep) { s.head.rotation.y = Math.sin(t * 0.5 + s.ph) * 0.5; s.head.rotation.x = 0.25 + Math.sin(t * 0.3 + s.ph) * 0.3; }
      if (o.screen) o.screen.material.color.setScalar(0.75 + 0.1 * Math.sin(t * 7) * (Math.sin(t * 0.7) > 0.8 ? 1 : 0) + 0.1);
    },
    dispose: disposer(group, owned),
  };
}

/* a grassy hummock under a find (dark: the finds lay over open fen water while the text said "in the grass"): a low mound
   of turf with tussocks and a few stones; the find's cairn stands on its crown. -> { group, top, dispose() } */
export function hummock(parent, { seed = 1, r = 2.2, env = null, grass = 0x3a4a2a, tip = 0x8a8a52 } = {}) {
  const group = new THREE.Group(); parent.add(group); const owned = [];
  const P = Parts(seed);
  const g = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2); const p = g.attributes.position; const rr = rng(seed + 3);
  for (let i = 0; i < p.count; i++) { const k = 0.85 + rr() * 0.25; p.setXYZ(i, p.getX(i) * r * k, p.getY(i) * 0.55 - 0.18, p.getZ(i) * r * k); }
  g.computeVertexNormals(); P.add('plain', g, 0x2e3a22, 0, 0, 0, [0, 0, 0], 1, 0.18);
  for (let k = 0; k < 5; k++) { const a = rr() * TAU; P.rock('stone', 0.16 + rr() * 0.12, 0x56524a, Math.cos(a) * r * 0.8, 0.05, Math.sin(a) * r * 0.8); }
  owned.push(...finish(group, P, true, env));
  const tg = new THREE.Group(); tg.position.y = 0.2; group.add(tg); tufts(tg, owned, { n: 90, w: r * 0.95, d: 0, h: 0.55, hex: grass, tip, seed: seed + 5, round: true });
  return { group, top: 0.37, dispose: disposer(group, owned) };
}

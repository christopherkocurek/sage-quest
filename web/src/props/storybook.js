/* Storybook quest props: the picture-book meadow. Painted posts with ribbons and a brass padlock, a wicker bird-cage,
   a watch-fire tower with a pennant, a ribboned bundle of sticks, a painted milestone, a flowered tournament arch,
   three trail clues, kites and butterflies, a songbird. Bright saturated gouache colours, soft shading, no glow, no runes.
   Dense one-line code uses block comments only. Plain ES module: three + BufferGeometryUtils. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const seeded = (n) => { let s = ((n * 2654435761) >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const PAL = { red: 0xc8402c, cream: 0xe8d8ae, blue: 0x2f5fb0, sky: 0x6fa8e0, yellow: 0xe8b83c, green: 0x4f9a3e, leaf: 0x3f8a3a, pink: 0xe8809a, orange: 0xe07a2c, wood: 0x9a6a3c, dark: 0x5a3a22, stone: 0xb4ad9c, brass: 0xd9a62e, steel: 0x7a869c, iron: 0x44506a, straw: 0xe0c060, plum: 0x8a4a8a };
const _o = new THREE.Object3D();
const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3(); const _d = new THREE.Vector3();
const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion(); const _m = new THREE.Matrix4(); const _e = new THREE.Euler();
const X_AXIS = new THREE.Vector3(1, 0, 0); const UP = new THREE.Vector3(0, 1, 0);

/* ---- tracker of every geometry, material and texture a prop makes */
function bag() { const l = []; return { own(x) { l.push(x); return x; }, free() { for (const x of l) x.dispose?.(); l.length = 0; } }; }

/* ---- merged vertex-colour geometry: put() adds a transformed copy of a primitive in one colour, bake() merges to one mesh with a soft ground shade */
function put(list, geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv'); g.deleteAttribute('uv1');
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix(); g.applyMatrix4(_o.matrix);
  if (color !== null) {
    const n = g.attributes.position.count; const c = new THREE.Color(color); const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  list.push(g);
}
function bake(B, list, mat, shadeH = 2.5, shadow = true, shade = true) {
  const g = mergeGeometries(list, false); for (const x of list) x.dispose(); list.length = 0;
  const p = g.attributes.position; const c = g.attributes.color;
  if (shade) for (let i = 0; i < p.count; i++) { const f = 0.8 + 0.2 * clamp(p.getY(i) / shadeH); c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f); }
  B.own(g); const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; return m;
}
const vcMat = (B, o = {}) => B.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, ...o }));
/* an arc of a horizontal ring (x = cos p, z = sin p) from angle for len radians */
function arcGeo(R, tube, p0, len, seg = 24) { const g = new THREE.TorusGeometry(R, tube, 6, Math.max(3, Math.round(seg * len / TAU)), len); g.rotateX(Math.PI / 2); g.rotateY(-p0); return g; }
function tubeGeo(pts, r, seg = 8, rad = 5) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false); }

/* ---- canvas textures */
function canvasTex(B, w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = B.own(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
/* a soft additive glow (a camera-facing sprite): stands in for a PointLight, which would change the light count */
function glowSprite(B, color) {
  const map = canvasTex(B, 64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const m = B.own(new THREE.SpriteMaterial({ map, color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  const s = new THREE.Sprite(m); s.renderOrder = 6; return s;
}
/* helical painted stripes for a post: colours[] repeat nu times round and nv times along the height */
function stripeTex(B, colors, nu, nv) {
  return canvasTex(B, 192, 384, (g, w, h) => {
    const im = g.createImageData(w, h); const r = seeded(5); const K = colors.length; const rgb = colors.map((c) => new THREE.Color(c).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = ((((x / w) * nu + (y / h) * nv) % 1) + 1) % 1 * K; const k = Math.floor(t); const f = t - k; const c0 = rgb[k % K]; const c1 = rgb[(k + 1) % K];
      const m = clamp((f - (1 - 0.06)) / 0.06); const n = 1 + (r() - 0.5) * 0.06; const i = (y * w + x) * 4;
      im.data[i] = lerp(c0.r, c1.r, m) * 255 * n; im.data[i + 1] = lerp(c0.g, c1.g, m) * 255 * n; im.data[i + 2] = lerp(c0.b, c1.b, m) * 255 * n; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
}

/* ---- tapered cloth strips (ribbons, pennants, bunting, scarves in the wind) with live vertex positions.
   S: { root:[x,y,z], dir:[..] rest direction, side:[..] width direction, len, w0, w1, color, color2, bands (segments per colour),
        amp (wave, fraction of length), freq, speed, phase, droop (fraction of length), push (wind drift, fraction), wind:[wx,wz] }
   update(t, boost 0..1): boost raises the waving (flare) */
function strips(B, S, seg = 8, matOpts = {}) {
  const n = S.length; const nv = seg * 4;
  const pos = new Float32Array(n * nv * 3); const nor = new Float32Array(n * nv * 3); const col = new Float32Array(n * nv * 3); const idx = [];
  const c1 = new THREE.Color(); const c2 = new THREE.Color();
  S.forEach((s, k) => {
    s.dir = new THREE.Vector3(...s.dir).normalize(); s.side = new THREE.Vector3(...s.side).normalize(); s.nrm = new THREE.Vector3().crossVectors(s.dir, s.side).normalize(); s.root = new THREE.Vector3(...s.root);
    s.amp ??= 0.1; s.freq ??= 5; s.speed ??= 5; s.phase ??= 0; s.droop ??= 0; s.push ??= 0; s.wind ??= [1, 0]; s.w0 ??= 0.1; s.w1 ??= s.w0;
    c1.set(s.color); c2.set(s.color2 ?? s.color);
    for (let i = 0; i < seg; i++) {
      const cc = s.bands && Math.floor(i / s.bands) % 2 ? c2 : c1; const a = k * nv + i * 4;
      for (let j = 0; j < 4; j++) { col[(a + j) * 3] = cc.r; col[(a + j) * 3 + 1] = cc.g; col[(a + j) * 3 + 2] = cc.b; }
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geo = B.own(new THREE.BufferGeometry());
  const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage); const na = new THREE.BufferAttribute(nor, 3); na.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('normal', na); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, B.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, ...matOpts }))); mesh.frustumCulled = false; mesh.castShadow = true;
  const rowP = new Float32Array((seg + 1) * 6); const rowN = new Float32Array((seg + 1) * 3);
  function update(t, boost = 0) {
    for (let q = 0; q < n; q++) {
      const s = S[q]; const amp = s.amp * (1 + 1.3 * boost); const droop = s.droop * (1 - boost); const sp = s.speed * (1 + 0.5 * boost);
      for (let i = 0; i <= seg; i++) {
        const u = i / seg; const ph = u * s.freq - t * sp + s.phase; const sn = Math.sin(ph); const cs = Math.cos(ph);
        const out = amp * u * s.len * sn; const slope = amp * (sn + u * s.freq * cs); const dr = droop * u * u * s.len; const pu = s.push * u * u * s.len; const w = lerp(s.w0, s.w1, u) * 0.5;
        const px = s.root.x + s.dir.x * u * s.len + s.nrm.x * out + s.wind[0] * pu; const py = s.root.y + s.dir.y * u * s.len + s.nrm.y * out - dr; const pz = s.root.z + s.dir.z * u * s.len + s.nrm.z * out + s.wind[1] * pu;
        rowP[i * 6] = px - s.side.x * w; rowP[i * 6 + 1] = py - s.side.y * w; rowP[i * 6 + 2] = pz - s.side.z * w; rowP[i * 6 + 3] = px + s.side.x * w; rowP[i * 6 + 4] = py + s.side.y * w; rowP[i * 6 + 5] = pz + s.side.z * w;
        let nx = s.nrm.x - s.dir.x * slope; let ny = s.nrm.y - s.dir.y * slope; let nz = s.nrm.z - s.dir.z * slope; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        rowN[i * 3] = nx; rowN[i * 3 + 1] = ny; rowN[i * 3 + 2] = nz;
      }
      for (let i = 0; i < seg; i++) {
        const v = (q * nv + i * 4) * 3;
        for (let j = 0; j < 4; j++) { const r = i + (j >> 1); const side = j & 1; const o = v + j * 3; pos[o] = rowP[r * 6 + side * 3]; pos[o + 1] = rowP[r * 6 + side * 3 + 1]; pos[o + 2] = rowP[r * 6 + side * 3 + 2]; nor[o] = rowN[r * 3]; nor[o + 1] = rowN[r * 3 + 1]; nor[o + 2] = rowN[r * 3 + 2]; }
      }
    }
    pa.needsUpdate = true; na.needsUpdate = true;
  }
  update(0, 0);
  return { mesh, update, S };
}

/* ---- fixed particle pool on one InstancedMesh (chips, petals, smoke): spawn() writes the next slot, update() integrates */
function pool(B, parent, geo, n, { g = 9, drag = 0, bounce = 0.35, floor = 0.02, colors = [0xffffff], grow = 0, sway = 0, mat = null } = {}) {
  const m = mat || B.own(new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }));
  const mesh = B.own(new THREE.InstancedMesh(B.own(geo), m, n)); mesh.frustumCulled = false; parent.add(mesh);
  const P = new Float32Array(n * 6); const A = new Float32Array(n * 6); const L = new Float32Array(n * 4);
  const cols = colors.map((c) => new THREE.Color(c));
  _o.position.set(0, 0, 0); _o.rotation.set(0, 0, 0); _o.scale.setScalar(0); _o.updateMatrix();
  for (let i = 0; i < n; i++) { mesh.setMatrixAt(i, _o.matrix); mesh.setColorAt(i, cols[0]); }
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let next = 0; let live = 0;
  return {
    mesh,
    spawn(x, y, z, vx, vy, vz, ttl, size, ci = 0, spin = 8, rx = 0, ry = 0, rz = 0) {
      const i = next; next = (next + 1) % n; const j = i * 6; P[j] = x; P[j + 1] = y; P[j + 2] = z; P[j + 3] = vx; P[j + 4] = vy; P[j + 5] = vz;
      A[j] = rx; A[j + 1] = ry; A[j + 2] = rz; A[j + 3] = (Math.random() - 0.5) * spin; A[j + 4] = (Math.random() - 0.5) * spin; A[j + 5] = (Math.random() - 0.5) * spin;
      L[i * 4] = 0; L[i * 4 + 1] = ttl; L[i * 4 + 2] = size; L[i * 4 + 3] = Math.random() * 6.28;
      mesh.setColorAt(i, cols[ci % cols.length]); mesh.instanceColor.needsUpdate = true; live++;
    },
    update(dt) {
      if (!live) return; let alive = 0;
      for (let i = 0; i < n; i++) {
        const ttl = L[i * 4 + 1]; if (ttl <= 0) continue;
        const life = (L[i * 4] += dt);
        if (life >= ttl) { L[i * 4 + 1] = 0; _o.scale.setScalar(0); _o.updateMatrix(); mesh.setMatrixAt(i, _o.matrix); continue; }
        alive++; const j = i * 6;
        P[j + 4] -= g * dt; if (drag) { const f = Math.max(0, 1 - drag * dt); P[j + 3] *= f; P[j + 4] *= f; P[j + 5] *= f; }
        if (sway) { P[j + 3] += Math.sin(life * 4 + L[i * 4 + 3]) * sway * dt; P[j + 5] += Math.cos(life * 3.3 + L[i * 4 + 3]) * sway * dt; }
        P[j] += P[j + 3] * dt; P[j + 1] += P[j + 4] * dt; P[j + 2] += P[j + 5] * dt;
        if (P[j + 1] < floor) { P[j + 1] = floor; P[j + 4] = -P[j + 4] * bounce; P[j + 3] *= 0.6; P[j + 5] *= 0.6; A[j + 3] *= 0.5; A[j + 4] *= 0.5; A[j + 5] *= 0.5; }
        A[j] += A[j + 3] * dt; A[j + 1] += A[j + 4] * dt; A[j + 2] += A[j + 5] * dt;
        const k = life / ttl; const s = L[i * 4 + 2] * (grow ? 1 + grow * k : 1) * clamp((1 - k) / 0.25) * clamp(life / 0.06);
        _o.position.set(P[j], P[j + 1], P[j + 2]); _o.rotation.set(A[j], A[j + 1], A[j + 2]); _o.scale.setScalar(s); _o.updateMatrix(); mesh.setMatrixAt(i, _o.matrix);
      }
      live = alive; mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---- a big brass padlock facing +z. Origin = the centre of the shackle arc; the body hangs below it. k scales it. */
function rrShape(w, h, r) { const s = new THREE.Shape(); s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return s; }
function lockMesh(B, k = 1) {
  const L = [];
  const bg = new THREE.ExtrudeGeometry(rrShape(0.3 * k, 0.26 * k, 0.06 * k), { depth: 0.08 * k, bevelEnabled: true, bevelThickness: 0.02 * k, bevelSize: 0.02 * k, bevelSegments: 2, curveSegments: 6 }); bg.translate(0, 0, -0.04 * k);
  put(L, bg, PAL.brass, 0, -0.23 * k, 0); bg.dispose();
  const fp = new THREE.ExtrudeGeometry(rrShape(0.22 * k, 0.17 * k, 0.04 * k), { depth: 0.006 * k, bevelEnabled: false, curveSegments: 5 });
  put(L, fp, 0xf0c85a, 0, -0.225 * k, 0.062 * k); fp.dispose();
  const sh = new THREE.TorusGeometry(0.07 * k, 0.024 * k, 6, 12, Math.PI); put(L, sh, PAL.steel, 0, 0, 0); sh.dispose();
  const lg = new THREE.CylinderGeometry(0.024 * k, 0.024 * k, 0.1 * k, 6); put(L, lg, PAL.steel, 0.07 * k, -0.05 * k, 0); put(L, lg, PAL.steel, -0.07 * k, -0.05 * k, 0); lg.dispose();
  const kh = new THREE.CylinderGeometry(0.026 * k, 0.026 * k, 0.012 * k, 10); put(L, kh, 0x3a2610, 0, -0.2 * k, 0.072 * k, Math.PI / 2, 0, 0); kh.dispose();
  const ks = new THREE.BoxGeometry(0.02 * k, 0.065 * k, 0.012 * k); put(L, ks, 0x3a2610, 0, -0.245 * k, 0.072 * k); ks.dispose();
  return bake(B, L, vcMat(B, { roughness: 0.42, metalness: 0.3 }), 9, true);
}


/* ---- shared bits: a patch of flowers, grass and field stones at a prop's foot; a heater shield; a lathe flame tongue */
function groundPatch(list, rnd, { n = 6, r0 = 0.5, r1 = 0.9, stones = 5, mound = 0 } = {}) {
  if (mound) put(list, new THREE.SphereGeometry(mound, 12, 6), 0x6f8a3a, 0, 0, 0, 0, 0, 0, 1, 0.22, 1);
  for (let i = 0; i < stones; i++) { const a = (i / stones) * TAU + rnd() * 0.4; const r = r0 * 0.85 + rnd() * 0.1; put(list, new THREE.DodecahedronGeometry(0.12, 0), PAL.stone, Math.cos(a) * r, 0.06, Math.sin(a) * r, rnd() * 3, rnd() * 3, rnd() * 3, 1.2, 0.75, 1); }
  for (let i = 0; i < n + 4; i++) { const a = rnd() * TAU; const r = r0 + rnd() * (r1 - r0); put(list, new THREE.ConeGeometry(0.035, 0.3 + rnd() * 0.2, 4), i % 2 ? PAL.green : PAL.leaf, Math.cos(a) * r, 0.15, Math.sin(a) * r, (rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5); }
  const FC = [PAL.pink, PAL.yellow, 0xf2eee0, PAL.red, PAL.sky];
  for (let i = 0; i < n; i++) { const a = rnd() * TAU; const r = r0 + rnd() * (r1 - r0); const x = Math.cos(a) * r; const z = Math.sin(a) * r; put(list, new THREE.CylinderGeometry(0.01, 0.012, 0.3, 4), PAL.green, x, 0.15, z); put(list, new THREE.SphereGeometry(0.055, 7, 5), FC[i % FC.length], x, 0.32, z, 0, 0, 0, 1, 0.6, 1); put(list, new THREE.SphereGeometry(0.022, 5, 4), PAL.yellow, x, 0.345, z); }
}
function shieldGeo(w, h, depth = 0.05) { const s = new THREE.Shape(); s.moveTo(-w / 2, h / 2); s.lineTo(w / 2, h / 2); s.lineTo(w / 2, 0); s.quadraticCurveTo(w / 2, -h * 0.35, 0, -h / 2); s.quadraticCurveTo(-w / 2, -h * 0.35, -w / 2, 0); s.lineTo(-w / 2, h / 2); return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.016, bevelSegments: 1, curveSegments: 8 }); }
function tongueGeo(w, h, bend) { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(Math.max(w * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.25 * t), 0.0001), t * h)); } const g = new THREE.LatheGeometry(pts, 10); const p = g.attributes.position; const col = new Float32Array(p.count * 3); const c0 = new THREE.Color(0xf9d65a); const c1 = new THREE.Color(0xf5a62e); const c2 = new THREE.Color(0xe5551c); const cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / h; p.setX(i, p.getX(i) + bend * t * t * h); if (t < 0.45) cc.lerpColors(c0, c1, t / 0.45); else cc.lerpColors(c1, c2, (t - 0.45) / 0.55); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g; }
const stoneTex = (B, rep) => { const t = canvasTex(B, 128, 128, (g, w, h) => { g.fillStyle = '#857c6a'; g.fillRect(0, 0, w, h); const r = seeded(3); for (let row = 0; row < 4; row++) for (let c = -1; c < 5; c++) { const off = (row % 2) * 16; const k = r(); g.fillStyle = `rgb(${(196 + k * 26 + r() * 8) | 0},${(186 + k * 20) | 0},${(160 + (1 - k) * 22) | 0})`; g.fillRect(c * 32 + off + 1.5, row * 32 + 1.5, 29, 29); g.fillStyle = 'rgba(255,248,224,0.22)'; g.fillRect(c * 32 + off + 2.5, row * 32 + 2, 27, 3); } }); t.repeat.set(rep[0], rep[1]); return t; };

/* =================================================================== ANCHOR: a painted post, ribbons, a brass padlock, an iron chain */
export function anchor(scene, { accent = 0xf2b84a, to = new THREE.Vector3(0, 2.2, -14), index = 0 } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const lean = new THREE.Group(); lean.scale.setScalar(1.18); group.add(lean);
  const rnd = seeded(index * 31 + 7); const toW = to.clone(); const RIB = [[PAL.blue, PAL.yellow, PAL.pink], [PAL.pink, PAL.blue, PAL.green], [PAL.yellow, PAL.red, PAL.blue]][index % 3];
  /*a giant's mooring post, not a carnival pole. An eight-sided oak post, axe-dressed, grey-brown with grain
     and cracks, a band of faded folk paint (red with cream diamonds and a blue rim) round its upper third, two studded iron
     bands, an acorn finial in dull brass, and the ribbons knotted on with rope instead of plastic rings */
  const postTex = canvasTex(B, 256, 512, (g, w, h) => {
    const r = seeded(index * 13 + 5); g.fillStyle = '#7e6a52'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) { let x = r() * w; g.strokeStyle = r() < 0.6 ? `rgba(40,28,16,${0.12 + r() * 0.2})` : `rgba(220,200,160,${0.08 + r() * 0.12})`; g.lineWidth = 0.8 + r() * 2.2; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 12) { x += (r() - 0.5) * 1.6; g.lineTo(x, y); } g.stroke(); }
    for (let k = 0; k < 6; k++) { let x = r() * w; const y0 = r() * h * 0.8; g.strokeStyle = 'rgba(20,12,6,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y0); for (let y = y0; y < y0 + 40 + r() * 80; y += 6) { x += (r() - 0.5) * 2; g.lineTo(x, y); } g.stroke(); }
    /* the painted band, v from 0.14 to 0.34 of the canvas (the post's upper third), sun-faded and chipped */
    const b0 = h * 0.12; const b1 = h * 0.34; g.fillStyle = '#b8402c'; g.fillRect(0, b0, w, b1 - b0); g.fillStyle = '#2f5fb0'; g.fillRect(0, b0, w, 9); g.fillRect(0, b1 - 9, w, 9);
    g.fillStyle = '#ecdcb0'; const dw = w / 8; for (let k = 0; k < 8; k++) { const cx = (k + 0.5) * dw; const cy = (b0 + b1) / 2; g.beginPath(); g.moveTo(cx, cy - 26); g.lineTo(cx + dw * 0.32, cy); g.lineTo(cx, cy + 26); g.lineTo(cx - dw * 0.32, cy); g.closePath(); g.fill(); }
    for (let k = 0; k < 140; k++) { g.fillStyle = 'rgba(126,106,82,0.9)'; g.fillRect(r() * w, b0 + r() * (b1 - b0), 2 + r() * 7, 1 + r() * 3); }
    g.fillStyle = 'rgba(255,240,210,0.08)'; g.fillRect(0, b0, w, b1 - b0);
    const gr = g.createLinearGradient(0, h * 0.75, 0, h); gr.addColorStop(0, 'rgba(40,50,20,0)'); gr.addColorStop(1, 'rgba(40,50,20,0.55)'); g.fillStyle = gr; g.fillRect(0, h * 0.75, w, h * 0.25); /* moss and earth at the foot */
  });
  const postG = new THREE.CylinderGeometry(0.2, 0.24, 1.9, 8, 1); const post = new THREE.Mesh(B.own(postG), B.own(new THREE.MeshStandardMaterial({ map: postTex, roughness: 0.88, flatShading: true })));
  post.position.y = 0.95; post.rotation.y = Math.PI / 8; post.castShadow = true; post.receiveShadow = true; lean.add(post);
  const L = []; const top = []; const Cc = PAL;
  /* the acorn finial and its cap, dull brass; two iron bands with stud heads */
  put(top, new THREE.CylinderGeometry(0.17, 0.2, 0.08, 8), 0x6a5034, 0, 1.94, 0); put(top, new THREE.SphereGeometry(0.15, 10, 8), 0x9a7a3a, 0, 2.08, 0, 0, 0, 0, 1, 1.15, 1); put(top, new THREE.SphereGeometry(0.155, 10, 6, 0, TAU, 0, Math.PI / 2), 0x6a5a30, 0, 2.11, 0); put(top, new THREE.CylinderGeometry(0.02, 0.03, 0.08, 6), 0x6a5a30, 0, 2.29, 0);
  for (const y of [1.87, 0.42]) { put(top, new THREE.CylinderGeometry(0.235 - y * 0.02, 0.235 - y * 0.02, 0.07, 8), 0x3a3a3e, 0, y, 0, 0, Math.PI / 8, 0); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; put(top, new THREE.SphereGeometry(0.018, 5, 4), 0x5a5a60, Math.sin(a) * (0.24 - y * 0.02), y, Math.cos(a) * (0.24 - y * 0.02)); } }
  [[1.62, RIB[0], 0.9], [1.2, RIB[1], 3.2], [1.76, RIB[2], 5.2]].forEach(([y, c, a]) => {
    /* the ribbon is knotted on with a turn of rope */
    put(top, new THREE.TorusGeometry(0.212, 0.014, 5, 16), 0x9a8058, 0, y, 0, Math.PI / 2);
    const kx = Math.sin(a) * 0.22; const kz = Math.cos(a) * 0.22; put(top, new THREE.SphereGeometry(0.04, 7, 5), c, kx, y, kz, 0, 0, 0, 1, 0.8, 1);
  });
  lean.add(bake(B, top, vcMat(B), 2.5));
  /* ground dressing: earth mound, field stones, tufts and flowers */
  put(L, new THREE.SphereGeometry(0.6, 12, 6), 0x6f8a3a, 0, 0, 0, 0, 0, 0, 1, 0.22, 1);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + rnd() * 0.3; const r = 0.4 + rnd() * 0.1; put(L, new THREE.DodecahedronGeometry(0.14, 0), PAL.stone, Math.cos(a) * r, 0.07, Math.sin(a) * r, rnd() * 3, rnd() * 3, rnd() * 3, 1.2, 0.8, 1); }
  for (let i = 0; i < 9; i++) { const a = rnd() * TAU; const r = 0.5 + rnd() * 0.35; put(L, new THREE.ConeGeometry(0.035, 0.34 + rnd() * 0.2, 4), i % 2 ? PAL.green : PAL.leaf, Math.cos(a) * r, 0.17, Math.sin(a) * r, (rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5); }
  [[0.2, 0.62, PAL.pink], [-0.62, 0.3, PAL.yellow], [0.6, -0.5, 0xf2eee0], [-0.25, -0.66, PAL.red], [0.7, 0.12, PAL.yellow]].forEach(([x, z, c]) => { put(L, new THREE.CylinderGeometry(0.01, 0.012, 0.3, 4), PAL.green, x, 0.15, z); put(L, new THREE.SphereGeometry(0.055, 7, 5), c, x, 0.32, z, 0, 0, 0, 1, 0.6, 1); put(L, new THREE.SphereGeometry(0.022, 5, 4), PAL.yellow, x, 0.345, z); });
  group.add(bake(B, L, vcMat(B), 2.5));
  /* collar with the ring and the padlock, turns on the post */
  const collar = new THREE.Group(); lean.add(collar); const CL = [];
  put(CL, new THREE.CylinderGeometry(0.225, 0.225, 0.12, 18), PAL.iron, 0, 1.45, 0); put(CL, new THREE.TorusGeometry(0.228, 0.018, 5, 18), PAL.steel, 0, 1.51, 0, Math.PI / 2); put(CL, new THREE.TorusGeometry(0.228, 0.018, 5, 18), PAL.steel, 0, 1.39, 0, Math.PI / 2);
  put(CL, new THREE.BoxGeometry(0.06, 0.06, 0.12), PAL.iron, 0, 1.45, 0.27); put(CL, new THREE.TorusGeometry(0.068, 0.02, 6, 12), PAL.steel, 0, 1.45, 0.325, 0, Math.PI / 2, 0);
  collar.add(bake(B, CL, vcMat(B, { roughness: 0.55, metalness: 0.25 }), 2.5));
  const lock = new THREE.Group(); lock.position.set(0, 1.343, 0.325); const lm = lockMesh(B, 1.3); lock.add(lm); collar.add(lock);
  const ring = new THREE.Object3D(); ring.position.set(0, 1.45, 0.345); collar.add(ring);
  /* ribbon tails */
  const rib = strips(B, [[1.62, RIB[0], 0.9], [1.2, RIB[1], 3.2], [1.76, RIB[2], 5.2]].map(([y, c, a], k) => ({ root: [Math.sin(a) * 0.22, y, Math.cos(a) * 0.22], dir: [Math.sin(a) * 0.1, -1, Math.cos(a) * 0.1], side: [Math.cos(a), 0, -Math.sin(a)], len: 1.0 - k * 0.12, w0: 0.11, w1: 0.07, color: c, color2: 0xf4ecd8, bands: 3, amp: 0.1, freq: 6, speed: 5.5, phase: k * 2, push: 0.45, wind: [0.8, 0.6] })), 9);
  lean.add(rib.mesh);
  /* damage: pale wood bites pressed where the blows land */
  const GL = []; const gg = new THREE.IcosahedronGeometry(0.11, 0); put(GL, gg, 0xe9cf98, 0, 0, 0, 0, 0, 0, 0.9, 1.25, 0.32); put(GL, gg, 0xb98a50, 0, 0.01, 0.012, 0, 0, 0, 0.5, 0.85, 0.3); gg.dispose();
  for (const [x, y, r] of [[-0.1, 0.1, 0.5], [0.11, 0.05, -0.4], [0.02, -0.14, 0.1], [-0.05, -0.12, -0.7]]) put(GL, new THREE.BoxGeometry(0.02, 0.13, 0.012), 0xf2dca8, x, y, 0.03, 0.5, 0, r);
  const gougeGeo = B.own(mergeGeometries(GL, false)); GL.forEach((g) => g.dispose());
  const gouges = B.own(new THREE.InstancedMesh(gougeGeo, B.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })), 4)); gouges.frustumCulled = false; lean.add(gouges);
  const gAge = [-1, -1, -1, -1]; const gPos = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; const gRot = [0, 0, 0, 0]; const gYaw = [0, 0, 0, 0];
  _o.scale.setScalar(0); _o.updateMatrix(); for (let i = 0; i < 4; i++) gouges.setMatrixAt(i, _o.matrix); gouges.instanceMatrix.needsUpdate = true;
  /* chips: paint flakes and splinters */
  const chips = pool(B, group, new THREE.BoxGeometry(0.07, 0.035, 0.012), 36, { g: 9, bounce: 0.3, colors: [PAL.red, PAL.cream, 0xe9cf98, 0xb98a50, PAL.blue] });
  /* the chain: instanced oval links along a sagging line */
  const NL = 190; const linkG = new THREE.TorusGeometry(0.065, 0.021, 5, 9); linkG.scale(1.45, 1, 1);
  const chain = B.own(new THREE.InstancedMesh(B.own(linkG), B.own(new THREE.MeshStandardMaterial({ color: 0x40444c, roughness: 0.48, metalness: 0.55 })), NL)); /* dark iron (a bright blue band crossed the frame) */ chain.frustumCulled = false; chain.castShadow = true; chain.count = 0; group.add(chain);
  const S = { t: 0, turned: false, theta: 0, thetaT: 0, rattle: 99, excite: 0, placed: 0, broken: -1, leanA: 0, leanDir: 0, fallen: false, lp: new THREE.Vector3(), lv: new THREE.Vector3(), lr: new THREE.Euler(), lw: new THREE.Vector3(), lyaw: 0 };
  const A0 = new THREE.Vector3(); const E = new THREE.Vector3(); const Tl = new THREE.Vector3(); const Ag = new THREE.Vector3(); const dirL = new THREE.Vector3();
  const h = { group, height: 1.6, hp: 1 };
  h.hit = (k, point, dir) => {
    h.hp = k; group.updateWorldMatrix(true, false); S.rattle = 0; S.excite = 1;
    if (point) _a.copy(point); else _a.set(0, 1.3, 0.3).applyMatrix4(group.matrixWorld); group.worldToLocal(_a); dirL.copy(dir || _b.set(0, 0, -1)).transformDirection(_m.copy(group.matrixWorld).invert()); dirL.y = 0; if (dirL.lengthSq() < 1e-6) dirL.set(0, 0, -1); dirL.normalize();
    { const th = Math.atan2(-dirL.x, -dirL.z); let d = th - S.theta; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 1.1) S.thetaT = S.theta + d; S.turned = true; }
    if (S.placed < 4) { const i = S.placed++; const ang = Math.atan2(_a.x, _a.z); let da = ang - S.thetaT; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); const y = da < 0.8 ? 0.5 + rnd() * 0.35 : clamp(_a.y, 0.55, 1.25); gPos[i].set(Math.sin(ang) * 0.205, y, Math.cos(ang) * 0.205); gYaw[i] = ang; gRot[i] = (rnd() - 0.5) * 1.2; gAge[i] = 0; }
    const px = _a.x; const py = clamp(_a.y, 0.4, 1.9); const pz = _a.z;
    for (let i = 0; i < 9; i++) chips.spawn(px, py, pz, dirL.x * (1.2 + rnd() * 2.4) + (rnd() - 0.5) * 1.6, 1 + rnd() * 2.4, dirL.z * (1.2 + rnd() * 2.4) + (rnd() - 0.5) * 1.6, 0.9 + rnd() * 0.6, 1, Math.floor(rnd() * 5), 14);
  };
  h.break = (dir) => {
    if (S.broken >= 0) return 1.6; S.broken = 0; h.hp = 0; group.updateWorldMatrix(true, false);
    dirL.copy(dir || _b.set(0, 0, -1)).transformDirection(_m.copy(group.matrixWorld).invert()); dirL.y = 0; if (dirL.lengthSq() < 1e-6) dirL.set(0, 0, -1); dirL.normalize(); S.leanDir = Math.atan2(dirL.x, dirL.z);
    /* the lock pops off: it leaves the collar and tumbles */
    const th = S.theta; S.lp.set(Math.sin(th) * 0.325, 1.343, Math.cos(th) * 0.325); S.lv.set(dirL.x * 1.8 + Math.sin(th) * 1.2, 3.2, dirL.z * 1.8 + Math.cos(th) * 1.2); S.lr.set(0, th, 0); S.lw.set((rnd() - 0.5) * 14, (rnd() - 0.5) * 9, (rnd() - 0.5) * 14); S.lyaw = th;
    collar.remove(lock); group.add(lock); lock.position.copy(S.lp); lock.rotation.copy(S.lr); S.fallen = true;
    for (let i = 0; i < 26; i++) chips.spawn((rnd() - 0.5) * 0.3, 0.5 + rnd() * 1.5, (rnd() - 0.5) * 0.3, dirL.x * (1 + rnd() * 3) + (rnd() - 0.5) * 3, 1.5 + rnd() * 3, dirL.z * (1 + rnd() * 3) + (rnd() - 0.5) * 3, 1 + rnd() * 0.8, 1.2, Math.floor(rnd() * 5), 16);
    S.excite = 1.6; return 1.6;
  };
  h.update = (dt) => {
    S.t += dt; group.updateWorldMatrix(true, false);
    /* where the chain should run */
    Tl.copy(toW); group.worldToLocal(Tl);
    if (!S.turned) { S.theta = S.thetaT = Math.atan2(Tl.x, Tl.z) + Math.PI / 2; }
    else { let d = S.thetaT - S.theta; S.theta += d * Math.min(1, dt * 7); }
    collar.rotation.y = S.theta;
    S.excite = Math.max(0, S.excite - dt * 1.6); S.rattle += dt;
    if (!S.fallen) { lock.rotation.x = Math.sin(S.rattle * 22) * 0.55 * Math.exp(-S.rattle * 4.5); lock.rotation.z = Math.sin(S.rattle * 17 + 1) * 0.25 * Math.exp(-S.rattle * 4.5); }
    /* gouges grow in */
    for (let i = 0; i < 4; i++) { if (gAge[i] < 0) continue; gAge[i] += dt; const sc = smooth(gAge[i] / 0.15) * 1.35; _o.position.copy(gPos[i]); _o.rotation.set(0, gYaw[i], gRot[i]); _o.scale.setScalar(sc); _o.updateMatrix(); gouges.setMatrixAt(i, _o.matrix); if (gAge[i] < 0.2) gouges.instanceMatrix.needsUpdate = true; }
    rib.update(S.t, clamp(S.excite)); chips.update(dt);
    /* break: the post leans, the lock falls */
    if (S.broken >= 0) {
      S.broken += dt; const k = smooth(S.broken / 0.5); const a = 0.16 * k + Math.sin(S.broken * 18) * 0.02 * Math.exp(-S.broken * 3);
      lean.rotation.set(a * Math.cos(S.leanDir), 0, -a * Math.sin(S.leanDir));
      S.lv.y -= 12 * dt; S.lp.addScaledVector(S.lv, dt);
      if (S.lp.y < 0.2) { S.lp.y = 0.2; S.lv.y = -S.lv.y * 0.3; S.lv.x *= 0.55; S.lv.z *= 0.55; S.lw.multiplyScalar(0.5); S.lr.x = lerp(S.lr.x, -Math.PI / 2, 0.18); }
      S.lr.x += S.lw.x * dt; S.lr.y += S.lw.y * dt; S.lr.z += S.lw.z * dt; lock.position.copy(S.lp); lock.rotation.copy(S.lr);
    } else { lean.rotation.set(0, 0, 0); }
    /* chain */
    ring.updateWorldMatrix(true, false); ring.getWorldPosition(A0); group.worldToLocal(A0);
    const bk = S.broken >= 0 ? smooth(S.broken / 0.9) : 0;
    if (bk > 0) { A0.x = lerp(A0.x, A0.x * 2.4 + dirL.x * 0.5, bk); A0.z = lerp(A0.z, A0.z * 2.4 + dirL.z * 0.5, bk); A0.y = lerp(A0.y, 0.06, bk); }
    _a.subVectors(Tl, A0); const dist = _a.length(); const far = dist > 32; const span = far ? 28 : dist;
    E.copy(A0).addScaledVector(_a, span / (dist || 1)); if (!far) E.copy(Tl);
    const sag = lerp(clamp(0.06 * span, 0.25, 1.5), 9, bk); const len = span + (8 * sag * sag) / (3 * Math.max(span, 1));
    const n = clamp(Math.ceil(len / 0.2), 2, NL); chain.count = n;
    for (let i = 0; i < n; i++) {
      const s0 = (i + 0.5) / n; const ds = 0.5 / n;
      for (let w = 0; w < 2; w++) { const s = w ? clamp(s0 + ds, 0, 1) : clamp(s0 - ds, 0, 1); const v = w ? _c : _b; v.lerpVectors(A0, E, s); v.y -= sag * 4 * s * (1 - s); if (bk > 0) v.y = Math.max(v.y, 0.06); v.y = Math.max(v.y, 0.05); }
      _a.lerpVectors(A0, E, s0); _a.y -= sag * 4 * s0 * (1 - s0); if (_a.y < 0.05) _a.y = 0.05;
      _d.subVectors(_c, _b).normalize(); _q.setFromUnitVectors(X_AXIS, _d); _q2.setFromAxisAngle(X_AXIS, i & 1 ? Math.PI / 2 : 0); _q.multiply(_q2);
      const fade = far ? 1 - smooth((s0 - 0.6) / 0.4) : 1; _o.position.copy(_a); _o.quaternion.copy(_q); _o.scale.setScalar(1.25 * fade); _o.updateMatrix(); chain.setMatrixAt(i, _o.matrix);
    }
    chain.instanceMatrix.needsUpdate = true;
  };
  h.dispose = () => { group.removeFromParent(); B.free(); };
  return h;
}


/* =================================================================== CAGE: a round wicker bird-cage with a domed top, a red-painted frame and a brass padlock */
export function cage(scene, { accent = 0xf2b84a } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); void accent;
  const R = 0.95; const H0 = 0.15; const Hs = 1.35; const Ht = 2.0; const PHD = -Math.PI / 2; const GAP = 0.46;
  const rad = (y) => (y <= Hs ? R : R * Math.sqrt(Math.max(0.0036, 1 - ((y - Hs) / (Ht - Hs)) ** 2)));
  const barPts = (ph, y0, y1) => { const pts = []; for (let i = 0; i <= 10; i++) { const y = lerp(y0, y1, i / 10); const r = rad(y); pts.push(new THREE.Vector3(Math.cos(ph) * r, y, Math.sin(ph) * r)); } return pts; };
  const L = []; const D = [];
  /* floor, straw, sill ring */
  put(L, new THREE.CylinderGeometry(1.08, 1.1, 0.15, 32), PAL.wood, 0, 0.075, 0); put(L, new THREE.TorusGeometry(1.0, 0.05, 6, 36), PAL.red, 0, 0.15, 0, Math.PI / 2);
  put(L, new THREE.CylinderGeometry(0.78, 0.86, 0.07, 20), PAL.straw, 0, 0.185, 0);
  const rnd = seeded(11); for (let i = 0; i < 20; i++) { const a = rnd() * TAU; const r = rnd() * 0.7; put(L, new THREE.CylinderGeometry(0.009, 0.009, 0.5, 4), i % 3 ? PAL.straw : 0xc9a040, Math.cos(a) * r, 0.23, Math.sin(a) * r, Math.PI / 2 + (rnd() - 0.5) * 0.3, rnd() * 3, 0); }
  /* bars (cream), skipping the door gap below the lintel */
  const NB = 24;
  for (let i = 0; i < NB; i++) { const ph = (i / NB) * TAU; let d = ph - PHD; d = Math.atan2(Math.sin(d), Math.cos(d)); const inGap = Math.abs(d) < GAP + 0.02; put(L, tubeGeo(barPts(ph, inGap ? 1.78 : H0 + 0.02, Ht - 0.03), 0.021, 10, 5), PAL.cream); }
  /* hoops (blue), a red lintel, the red jambs */
  for (const y of [0.64, 1.02, 1.36]) put(L, arcGeo(rad(y) + 0.005, 0.03, PHD + GAP, TAU - 2 * GAP, 36), y === 1.02 ? PAL.blue : PAL.red);
  put(L, arcGeo(rad(1.62), 0.028, 0, TAU, 36), PAL.blue); put(L, arcGeo(rad(1.84), 0.026, 0, TAU, 32), PAL.red);
  put(L, arcGeo(R, 0.035, PHD - GAP, 2 * GAP, 12), PAL.red, 0, 1.78, 0);
  for (const sg of [-1, 1]) { const ph = PHD + sg * GAP; put(L, tubeGeo([new THREE.Vector3(Math.cos(ph) * R, H0, Math.sin(ph) * R), new THREE.Vector3(Math.cos(ph) * R, 1.78, Math.sin(ph) * R)], 0.036, 2, 6), PAL.red); }
  /* finial: a gold ball, a ring to hang the chains from */
  put(L, new THREE.SphereGeometry(0.1, 10, 8), PAL.yellow, 0, Ht + 0.01, 0); put(L, new THREE.TorusGeometry(0.1, 0.027, 6, 14), PAL.iron, 0, Ht + 0.2, 0, 0, Math.PI / 2, 0);
  const top = new THREE.Vector3(0, Ht + 0.3, 0);
  group.add(bake(B, L, vcMat(B), 2.2));
  /* the wicker skirt: a woven band round the foot */
  const weave = canvasTex(B, 128, 64, (g, w, h) => { g.fillStyle = '#6a4120'; g.fillRect(0, 0, w, h); const r = seeded(9); for (let c = 0; c < 8; c++) for (let rw = 0; rw < 4; rw++) { const horiz = (c + rw) % 2 === 0; for (let k = 0; k < 2; k++) { const kk = 0.86 + r() * 0.28; g.fillStyle = `rgb(${Math.min(255, 218 * kk) | 0},${Math.min(255, 164 * kk) | 0},${Math.min(255, 88 * kk) | 0})`; if (horiz) { g.fillRect(c * 16 + 0.5, rw * 16 + k * 8 + 1, 15, 6); g.fillStyle = 'rgba(255,240,200,0.3)'; g.fillRect(c * 16 + 1, rw * 16 + k * 8 + 1.5, 14, 1.5); } else { g.fillRect(c * 16 + k * 8 + 1, rw * 16 + 0.5, 6, 15); g.fillStyle = 'rgba(255,240,200,0.3)'; g.fillRect(c * 16 + k * 8 + 1.5, rw * 16 + 1, 1.5, 14); } } } });
  weave.repeat.set(12, 1);
  const skirtG = new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.5, 44, 1, true, Math.PI + GAP, TAU - 2 * GAP);
  const skirt = new THREE.Mesh(B.own(skirtG), B.own(new THREE.MeshStandardMaterial({ map: weave, roughness: 0.9, side: THREE.DoubleSide }))); skirt.position.y = H0 + 0.27; skirt.castShadow = true; skirt.receiveShadow = true; group.add(skirt);
  /* the door: a red frame with cream bars, hinged on the left jamb */
  const ph0 = PHD - GAP + 0.04; const ph1 = PHD + GAP - 0.04; const hx = Math.cos(ph0) * R; const hz = Math.sin(ph0) * R;
  for (const ph of [ph0, ph1]) put(D, tubeGeo([new THREE.Vector3(Math.cos(ph) * R, H0, Math.sin(ph) * R), new THREE.Vector3(Math.cos(ph) * R, 1.74, Math.sin(ph) * R)], 0.03, 2, 6), PAL.red, -hx, 0, -hz);
  for (const y of [0.3, 1.0, 1.74]) put(D, arcGeo(R, 0.028, ph0, ph1 - ph0, 10), PAL.red, -hx, y, -hz);
  for (let i = 1; i < 5; i++) { const ph = lerp(ph0, ph1, i / 5); put(D, tubeGeo([new THREE.Vector3(Math.cos(ph) * R, 0.32, Math.sin(ph) * R), new THREE.Vector3(Math.cos(ph) * R, 1.72, Math.sin(ph) * R)], 0.02, 2, 5), PAL.cream, -hx, 0, -hz); }
  put(D, new THREE.TorusGeometry(0.07, 0.02, 6, 12), PAL.steel, Math.cos(ph1) * (R + 0.04) - hx, 1.1, Math.sin(ph1) * (R + 0.04) - hz, 0, Math.PI / 2 - ph1, 0);
  const door = new THREE.Group(); door.position.set(hx, 0, hz); door.add(bake(B, D, vcMat(B), 2.2)); group.add(door);
  /* the padlock hangs from the door's ring and can drop */
  const lock = new THREE.Group(); const lm = lockMesh(B, 1.15); lock.add(lm);
  const lockHome = new THREE.Vector3(Math.cos(ph1) * (R + 0.05), 1.1 - 0.06, Math.sin(ph1) * (R + 0.05)); const lockYaw = Math.PI / 2 - ph1;
  lock.position.copy(lockHome); lock.rotation.y = lockYaw; group.add(lock);
  const S = { t: -1, lp: new THREE.Vector3(), lv: new THREE.Vector3(), lw: new THREE.Vector3(), lr: new THREE.Euler(), door: 0, doorV: 0, rattle: 99 };
  const h = { group, top };
  h.open = () => { if (S.t >= 0) return 1.5; S.t = 0; S.lp.copy(lockHome); S.lv.set(0.5, 1.2, -1.2); S.lw.set(6, 3, -5); S.lr.set(0, lockYaw, 0); return 1.5; };
  h.update = (dt) => {
    if (S.t < 0) return; S.t += dt;
    S.lv.y -= 12 * dt; S.lp.addScaledVector(S.lv, dt);
    if (S.lp.y < 0.18) { S.lp.y = 0.18; S.lv.y = -S.lv.y * 0.3; S.lv.x *= 0.5; S.lv.z *= 0.5; S.lw.multiplyScalar(0.45); S.lr.x = lerp(S.lr.x, -Math.PI / 2, 0.2); }
    S.lr.x += S.lw.x * dt; S.lr.y += S.lw.y * dt; S.lr.z += S.lw.z * dt; lock.position.copy(S.lp); lock.rotation.copy(S.lr);
    const k = smooth((S.t - 0.25) / 1.0); door.rotation.y = k * 1.95 + Math.sin(S.t * 9) * 0.04 * Math.exp(-(S.t - 1.2) * 2) * (S.t > 1.2 ? 1 : 0);
  };
  h.dispose = () => { group.removeFromParent(); B.free(); };
  return h;
}


/* =================================================================== BEACON: a watch-fire on a small stone tower with a pennant */
export function beacon(scene, { accent = 0xf2b84a, index = 0 } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); void accent;
  const rnd = seeded(index * 13 + 5); const PEN = [[PAL.red, PAL.yellow], [PAL.blue, PAL.yellow], [PAL.green, PAL.cream]][index % 3];
  const wall = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.8, 0.95, 2.5, 22, 1, true)), B.own(new THREE.MeshStandardMaterial({ map: stoneTex(B, [4, 2.2]), roughness: 0.92 }))); wall.position.y = 1.25; wall.castShadow = true; wall.receiveShadow = true; group.add(wall);
  const T = [];
  put(T, new THREE.CylinderGeometry(0.82, 0.82, 0.12, 22), 0xb8b09c, 0, 2.5, 0); put(T, new THREE.CylinderGeometry(0.9, 0.8, 0.16, 22), 0xa89f8a, 0, 2.38, 0);
  put(T, new THREE.TorusGeometry(0.84, 0.055, 6, 24), PAL.red, 0, 2.28, 0, Math.PI / 2); put(T, new THREE.TorusGeometry(0.94, 0.05, 6, 24), PAL.blue, 0, 0.5, 0, Math.PI / 2); put(T, new THREE.CylinderGeometry(1.02, 1.1, 0.2, 22), 0x9a927e, 0, 0.1, 0);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; put(T, new THREE.BoxGeometry(0.36, 0.4, 0.2), 0xc6bda6, Math.cos(a) * 0.82, 2.76, Math.sin(a) * 0.82, 0, -(a + Math.PI / 2), 0); }
  put(T, new THREE.BoxGeometry(0.5, 0.8, 0.08), 0x5a3a22, 0, 0.55, 0.93); put(T, new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12), 0x5a3a22, 0, 0.95, 0.93, Math.PI / 2); put(T, new THREE.TorusGeometry(0.28, 0.03, 5, 12, Math.PI), 0xc6bda6, 0, 0.95, 0.93); put(T, new THREE.SphereGeometry(0.035, 6, 5), PAL.brass, 0.14, 0.55, 0.98);
  for (const a of [0.55, 2.55, 4.1]) put(T, new THREE.BoxGeometry(0.13, 0.4, 0.08), 0x2a3550, Math.cos(a) * 0.85, 1.7, Math.sin(a) * 0.85, 0, -(a + Math.PI / 2) + Math.PI, 0);
  /* the iron fire-basket with a stack of logs, cold until lit */
  const bowl = []; for (const [r, y] of [[0, 0], [0.3, 0], [0.5, 0.16], [0.64, 0.36], [0.6, 0.38], [0.46, 0.2], [0, 0.08]]) bowl.push(new THREE.Vector2(r, y));
  put(T, new THREE.LatheGeometry(bowl, 14), PAL.iron, 0, 2.56, 0); put(T, new THREE.TorusGeometry(0.62, 0.035, 6, 18), PAL.red, 0, 2.94, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + rnd() * 0.5; put(T, new THREE.CylinderGeometry(0.07, 0.08, 0.85, 6), i % 3 ? 0x3a2a22 : 0x6a4428, Math.cos(a) * 0.12, 2.74 + (i % 2) * 0.1, Math.sin(a) * 0.12, Math.sin(a) * 0.6, a, Math.PI / 2 + Math.cos(a) * 0.35); }
  const pa = 0.39; const px = Math.cos(pa) * 0.74; const pz = Math.sin(pa) * 0.74;
  put(T, new THREE.CylinderGeometry(0.035, 0.045, 3.0, 6), PAL.wood, px, 3.9, pz); put(T, new THREE.SphereGeometry(0.08, 8, 6), PAL.yellow, px, 5.42, pz);
  groundPatch(T, rnd, { n: 7, r0: 1.25, r1: 1.7, stones: 6 });
  group.add(bake(B, T, vcMat(B, { side: THREE.DoubleSide }), 2.5));
  const pen = strips(B, [{ root: [px + 0.04, 5.2, pz], dir: [1, 0, 0], side: [0, 1, 0], len: 1.55, w0: 0.62, w1: 0.02, color: PEN[0], color2: PEN[1], bands: 2, amp: 0.1, freq: 5.5, speed: 4.5, droop: 0.1 }], 8); group.add(pen.mesh);
  /* fire: cartoon tongues in three flat layers (unlit colours stay under white), a coal bed, a smoulder of smoke and embers, one warm light */
  const FY = 2.9; const fl = { out: [], mid: [] };
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; put(fl.out, tongueGeo(0.24, 1.0 + (i % 3) * 0.22, 0.22), null, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, 0, -a, 0); }
  put(fl.mid, tongueGeo(0.32, 1.9, 0.12), null, 0, 0, 0); for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.9; put(fl.mid, tongueGeo(0.2, 1.1 + (i % 2) * 0.25, 0.18), null, Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12, 0, -a, 0); }
  const flMat = B.own(new THREE.MeshBasicMaterial({ vertexColors: true })); const flames = ['out', 'mid'].map((k) => { const m = bake(B, fl[k], flMat, 1, false, false); m.position.y = FY; m.visible = false; group.add(m); return m; });
  const coalMat = B.own(new THREE.MeshBasicMaterial({ color: 0x2a1c16 })); const coal = new THREE.Mesh(B.own(new THREE.CircleGeometry(0.46, 16)), coalMat); coal.rotation.x = -Math.PI / 2; coal.position.y = 2.72; group.add(coal);
  /* no PointLight: a light added or shown mid-walk changes the light count and recompiles every lit material (the walk stall). A soft additive glow does the job. */
  const light = glowSprite(B, 0xffb050); light.position.set(0, FY + 0.8, 0); light.scale.setScalar(0.001); group.add(light);
  const smokeMat = B.own(new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }));
  const smoke = pool(B, group, new THREE.IcosahedronGeometry(0.5, 1), 24, { g: -0.5, drag: 0.5, floor: -9, grow: 2.2, colors: [0xc9c9ce, 0x9a9aa2], mat: smokeMat });
  const embers = pool(B, group, new THREE.BoxGeometry(0.07, 0.07, 0.07), 24, { g: -0.4, drag: 0.3, floor: -9, mat: B.own(new THREE.MeshBasicMaterial({ color: 0xe8741f })) });
  const S = { t: 0, lit: false, ign: 0, flame: 0, smokeAcc: 0, emberAcc: 0, c1: new THREE.Color(0x2a1c16), c2: new THREE.Color(0xc84a1c), c3: new THREE.Color(0xe8661c) };
  const h = { group };
  h.light = () => { if (!S.lit) { S.lit = true; S.ign = 0; for (let i = 0; i < 10; i++) embers.spawn((rnd() - 0.5) * 0.4, FY + 0.2, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 1.2, 1.4 + rnd() * 1.6, (rnd() - 0.5) * 1.2, 0.9 + rnd() * 0.7, 1, 0, 0); } return 1.2; };
  h.update = (dt, st = {}) => {
    const charge = st.charge || 0; S.t += dt; if (st.lit && !S.lit) h.light();
    if (S.lit) S.ign += dt; const tgt = S.lit ? 1 : 0; const k = S.lit ? 1 + 0.12 * Math.sin(Math.min(1, S.ign / 0.9) * Math.PI) * Math.exp(-S.ign * 2) * 3 : 0; S.flame = lerp(S.flame, tgt, Math.min(1, dt * 6)); const fk = S.flame * (S.lit ? clamp(k, 0.9, 1.35) : 0);
    flames.forEach((m, i) => { m.visible = S.flame > 0.02; const ph = i * 1.7; const fl2 = 1 + 0.12 * Math.sin(S.t * 11 + ph) + 0.06 * Math.sin(S.t * 17.3 + ph * 2); m.scale.set(fk * (1 + 0.05 * Math.sin(S.t * 9 + ph)), fk * fl2, fk * (1 + 0.05 * Math.cos(S.t * 8 + ph))); m.rotation.z = Math.sin(S.t * 5 + ph) * 0.05; m.rotation.x = Math.cos(S.t * 4.3 + ph) * 0.05; });
    coalMat.color.copy(S.c1).lerp(S.c2, S.lit ? 1 : clamp(charge * 1.1)).lerp(S.c3, S.lit ? 0.5 : 0);
    light.scale.setScalar(Math.max(0.001, S.flame * (3.6 + 0.3 * Math.sin(S.t * 13) + 0.2 * Math.sin(S.t * 23)))); light.material.opacity = S.flame * 0.85;
    const sr = S.lit ? 2.6 : charge * 4.5; S.smokeAcc += dt * sr; while (S.smokeAcc > 1) { S.smokeAcc -= 1; smoke.spawn((rnd() - 0.5) * 0.4, S.lit ? 4.4 : 2.95, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.15 + 0.12, 0.55 + rnd() * 0.3, (rnd() - 0.5) * 0.15, S.lit ? 1.5 + rnd() * 0.5 : 2.6 + rnd(), S.lit ? 0.3 : 0.5, S.lit ? 1 : 0, 0); }
    const er = S.lit ? 3 : charge * 7; S.emberAcc += dt * er; while (S.emberAcc > 1) { S.emberAcc -= 1; embers.spawn((rnd() - 0.5) * 0.5, 2.85, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.4, 0.5 + rnd() * 0.9, (rnd() - 0.5) * 0.4, 0.8 + rnd() * 0.8, 1, 0, 0); }
    smoke.update(dt); embers.update(dt); pen.update(S.t, S.lit ? 0.5 : charge * 0.3);
  };
  h.dispose = () => { group.removeFromParent(); B.free(); };
  return h;
}

/* =================================================================== KINDLING: a bundle of sticks tied with a red ribbon and a sprig of holly */
export function kindling(scene) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const L = []; const rnd = seeded(21);
  const cols = [0x8a5a30, 0x6a4428, 0xa87a44, 0xc29555, 0x7a4e2c];
  for (let i = 0; i < 15; i++) { const a = (i / 15) * TAU + rnd() * 0.4; const r = i < 9 ? 0.05 + rnd() * 0.03 : rnd() * 0.025; const len = 0.44 + rnd() * 0.14; const rad = 0.016 + rnd() * 0.012; put(L, new THREE.CylinderGeometry(rad * 0.75, rad, len, 5), cols[i % 5], (rnd() - 0.5) * 0.06, 0.1 + Math.sin(a) * r, Math.cos(a) * r, 0, (rnd() - 0.5) * 0.22, Math.PI / 2 + (rnd() - 0.5) * 0.08); }
  put(L, new THREE.TorusGeometry(0.108, 0.02, 5, 14), PAL.red, 0, 0.1, 0, 0, Math.PI / 2, 0); put(L, new THREE.SphereGeometry(0.038, 7, 5), PAL.red, 0, 0.2, 0);
  for (const s of [-1, 1]) { put(L, new THREE.TorusGeometry(0.05, 0.015, 5, 10), PAL.red, s * 0.06, 0.215, 0, 0.5, 0, 0, 1.2, 0.85, 1); put(L, new THREE.BoxGeometry(0.03, 0.15, 0.008), PAL.red, s * 0.045, 0.14, 0.095, 0.3, 0, s * 0.35); }
  for (const [x, z, a] of [[0.02, 0.02, 0.4], [-0.02, -0.01, -0.5]]) put(L, new THREE.IcosahedronGeometry(0.06, 0), 0x2f6a34, x, 0.215, z, 0, a, 0.3, 1.2, 0.22, 0.55);
  for (const [x, z] of [[0.04, -0.03], [0.065, 0.015], [0.03, 0.04]]) put(L, new THREE.SphereGeometry(0.02, 6, 5), PAL.red, x, 0.23, z);
  const mesh = bake(B, L, vcMat(B), 0.5); group.add(mesh); group.rotation.y = 0.4;
  const h = { group, update(dt) { void dt; }, dispose() { group.removeFromParent(); B.free(); } };
  return h;
}

/* =================================================================== MARKER: a painted milestone; the name is painted on it with a brush after the duel */
export function marker(scene, { name = '', accent = 0xf2b84a, serif = "'Fraunces', serif", cream = '#fffaf0' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); void accent; const rnd = seeded(String(name).length * 7 + 3); void cream;
  const L = [];
  const slab = new THREE.ExtrudeGeometry(rrShape(0.98, 1.3, 0.07), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, curveSegments: 8 }); slab.translate(0, 0.81, -0.15); put(L, slab, 0xcbc4b0); slab.dispose();
  put(L, new THREE.BoxGeometry(1.3, 0.16, 0.66), 0xa59d88, 0, 0.08, 0);
  const rs = new THREE.Shape(); rs.moveTo(-0.72, 0); rs.lineTo(0.72, 0); rs.lineTo(0, 0.44); rs.lineTo(-0.72, 0); const roof = new THREE.ExtrudeGeometry(rs, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }); roof.translate(0, 1.5, -0.3); put(L, roof, PAL.red); roof.dispose();
  put(L, new THREE.BoxGeometry(1.36, 0.05, 0.66), PAL.cream, 0, 1.485, 0); put(L, new THREE.SphereGeometry(0.06, 8, 6), PAL.yellow, 0, 1.97, 0); put(L, new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5), PAL.wood, 0, 1.93, 0);
  put(L, new THREE.BoxGeometry(1.06, 0.09, 0.38), PAL.red, 0, 0.5, 0); put(L, new THREE.BoxGeometry(1.06, 0.07, 0.38), PAL.blue, 0, 0.37, 0);
  for (let i = -2; i <= 2; i++) put(L, new THREE.CylinderGeometry(0.022, 0.022, 0.012, 8), PAL.cream, i * 0.2, 0.5, 0.192, Math.PI / 2);
  put(L, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14), PAL.yellow, 0, 1.28, 0.19, Math.PI / 2);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; put(L, new THREE.ConeGeometry(0.03, 0.09, 4), PAL.orange, Math.cos(a) * 0.15, 1.28 + Math.sin(a) * 0.15, 0.19, 0, 0, a - Math.PI / 2); }
  groundPatch(L, rnd, { n: 6, r0: 0.75, r1: 1.05, stones: 0 });
  group.add(bake(B, L, vcMat(B), 2.2));
  /* the blank panel: cream gouache in a blue border */
  const PW = 0.76; const PHt = 0.5; const PY = 0.86;
  const panelTex = canvasTex(B, 384, 256, (g, w, h) => { g.fillStyle = '#efe3c2'; g.fillRect(0, 0, w, h); const r = seeded(4); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${150 + r() * 60},${120 + r() * 50},80,0.06)`; g.fillRect(r() * w, r() * h, 20 + r() * 40, 2 + r() * 3); } g.strokeStyle = '#2f5fb0'; g.lineWidth = 12; g.strokeRect(14, 14, w - 28, h - 28); g.strokeStyle = '#c8402c'; g.lineWidth = 3; g.strokeRect(30, 30, w - 60, h - 60); g.fillStyle = '#e8b83c'; for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { g.beginPath(); g.arc(x, y, 12, 0, TAU); g.fill(); } });
  const panel = new THREE.Mesh(B.own(new THREE.PlaneGeometry(PW, PHt)), B.own(new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.9 }))); panel.position.set(0, PY, 0.192); panel.receiveShadow = true; group.add(panel);
  /* the name, painted in ink-blue, wiped in from the left by a brush */
  const txt = String(name).slice(0, 16) || ' '; let tw = 0.5;
  const nameTex = canvasTex(B, 512, 160, (g, w, h) => { let fs = 104; g.font = `italic 700 ${fs}px ${serif}`; while (g.measureText(txt).width > 440 && fs > 36) { fs -= 4; g.font = `italic 700 ${fs}px ${serif}`; } g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1f3a78'; g.fillText(txt, w / 2, h * 0.5); tw = g.measureText(txt).width / w; g.strokeStyle = '#c8402c'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(w / 2 - tw * w * 0.5, h * 0.88); g.quadraticCurveTo(w / 2, h * 0.98, w / 2 + tw * w * 0.5, h * 0.86); g.stroke(); });
  const NW = 0.66; const U = { uReveal: { value: 0 } };
  const nameMat = B.own(new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.8, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  nameMat.onBeforeCompile = (sd) => { sd.uniforms.uReveal = U.uReveal; sd.fragmentShader = sd.fragmentShader.replace('void main() {', 'uniform float uReveal;\nvoid main() {').replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.a *= 1.0 - smoothstep(uReveal - 0.05, uReveal, vMapUv.x);'); };
  const nameM = new THREE.Mesh(B.own(new THREE.PlaneGeometry(NW, NW * 160 / 512)), nameMat); nameM.position.set(0, PY, 0.196); nameM.renderOrder = 3; group.add(nameM);
  /* the brush */
  const BR = []; put(BR, new THREE.ConeGeometry(0.016, 0.06, 6), PAL.red, 0, 0.03, 0); put(BR, new THREE.CylinderGeometry(0.014, 0.014, 0.05, 6), PAL.steel, 0, 0.085, 0); put(BR, new THREE.CylinderGeometry(0.011, 0.014, 0.3, 6), PAL.wood, 0, 0.26, 0);
  const brush = bake(B, BR, vcMat(B), 1, false, false); const brushG = new THREE.Group(); brushG.add(brush); brushG.visible = false; group.add(brushG);
  const S = { t: 0, carve: -1 };
  const h = { group };
  h.carve = () => { if (S.carve < 0) S.carve = S.t; return 1.6; };
  h.update = (dt) => {
    S.t += dt; if (S.carve < 0) return; const k = clamp((S.t - S.carve) / 1.5); const e = smooth(k);
    const u0 = 0.5 - tw / 2 - 0.03; const u1 = 0.5 + tw / 2 + 0.05; U.uReveal.value = k >= 1 ? 2 : lerp(u0, u1, e);
    const bx = (lerp(u0, u1, e) - 0.5) * NW; const done = clamp((S.t - S.carve - 1.5) / 0.35);
    brushG.visible = done < 1; brushG.position.set(bx, PY - 0.05 + Math.sin(S.t * 19) * 0.035 + done * 0.3, 0.215); brushG.rotation.set(0.35, 0, -0.6 + Math.sin(S.t * 13) * 0.08); brushG.scale.setScalar(1 - done);
  };
  h.dispose = () => { group.removeFromParent(); B.free(); };
  return h;
}


/* =================================================================== GATE: a flowered tournament arch with pennants, bunting, shields and a brass bell */
export function gate(scene, { accent = 0xf2b84a } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); void accent;
  const W = 2.9; const PH = 4.2; const AB = 1.55; const rnd = seeded(77); const Z = new THREE.Vector3(0, 0, 1);
  /* the two striped posts */
  const pg = []; for (const sg of [-1, 1]) { const g = new THREE.CylinderGeometry(0.27, 0.32, PH, 18, 1); g.translate(sg * W, PH / 2, 0); pg.push(g); }
  const postGeo = B.own(mergeGeometries(pg, false)); pg.forEach((g) => g.dispose());
  const posts = new THREE.Mesh(postGeo, B.own(new THREE.MeshStandardMaterial({ map: stripeTex(B, [PAL.cream, PAL.cream, PAL.yellow], 1, 3), roughness: 0.85 }))); posts.castShadow = true; posts.receiveShadow = true; group.add(posts);
  const T = []; const ell = (u, a = W, b = AB, y0 = PH) => _a.set(Math.cos(u) * a, y0 + Math.sin(u) * b, 0);
  for (const sg of [-1, 1]) {
    put(T, new THREE.CylinderGeometry(0.46, 0.52, 0.5, 18), 0xa59d88, sg * W, 0.25, 0); put(T, new THREE.TorusGeometry(0.44, 0.05, 6, 18), PAL.blue, sg * W, 0.52, 0, Math.PI / 2);
    put(T, new THREE.TorusGeometry(0.31, 0.05, 6, 16), PAL.blue, sg * W, PH - 0.02, 0, Math.PI / 2); put(T, new THREE.SphereGeometry(0.36, 14, 10), PAL.yellow, sg * W, PH + 0.1, 0);
    put(T, new THREE.CylinderGeometry(0.03, 0.04, 2.5, 6), PAL.wood, sg * W, PH + 1.35, 0); put(T, new THREE.SphereGeometry(0.08, 8, 6), PAL.yellow, sg * W, 7.0, 0);
    for (const z of [-1, 1]) { const f = shieldGeo(0.56, 0.68, 0.05); put(T, f, PAL.yellow, sg * W, 2.45, z * 0.33 + (z > 0 ? 0 : -0.05), 0, z > 0 ? 0 : Math.PI, 0, 1.1, 1.1, 1); f.dispose(); const m = shieldGeo(0.48, 0.58, 0.05); put(T, m, sg > 0 ? PAL.red : PAL.blue, sg * W, 2.45, z * 0.375, 0, z > 0 ? 0 : Math.PI, 0); m.dispose(); put(T, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), PAL.cream, sg * W, 2.5, z * 0.43, Math.PI / 2); }
  }
  /* the arch, painted in striped lengths */
  const ARC = [PAL.red, PAL.cream, PAL.blue, PAL.cream]; const NSEG = 16;
  for (let i = 0; i < NSEG; i++) { const pts = []; for (let k = 0; k <= 5; k++) { ell(((i + k / 5) / NSEG) * Math.PI); pts.push(_a.clone()); } put(T, tubeGeo(pts, 0.2, 5, 8), ARC[i % 4]); }
  /* the crown: a back-to-back painted shield on the crest */
  for (const z of [-1, 1]) { const f = shieldGeo(0.86, 1.04, 0.06); put(T, f, PAL.yellow, 0, PH + AB + 0.52, z * 0.07, 0, z > 0 ? 0 : Math.PI, 0, 1.1, 1.1, 1); f.dispose(); const m = shieldGeo(0.74, 0.92, 0.06); put(T, m, PAL.red, 0, PH + AB + 0.52, z * 0.115, 0, z > 0 ? 0 : Math.PI, 0); m.dispose(); put(T, new THREE.BoxGeometry(0.2, 0.9, 0.02), PAL.cream, 0, PH + AB + 0.52, z * 0.2); put(T, new THREE.BoxGeometry(0.62, 0.2, 0.02), PAL.cream, 0, PH + AB + 0.58, z * 0.2); }
  /* bunting string and bell hanger */
  { const pts = []; for (let k = 0; k <= 20; k++) { ell(0.1 * Math.PI + (k / 20) * 0.8 * Math.PI, W - 0.26, AB - 0.26); pts.push(_a.clone()); } put(T, tubeGeo(pts, 0.014, 20, 4), PAL.dark); }
  put(T, new THREE.CylinderGeometry(0.012, 0.012, 0.2, 4), PAL.dark, 0, PH + AB - 0.4, 0);
  group.add(bake(B, T, vcMat(B, { side: THREE.DoubleSide }), 3));
  const bell = new THREE.Group(); bell.position.set(0, PH + AB - 0.5, 0); { const BL = []; const prof = []; for (const [r, y] of [[0.02, 0.0], [0.07, -0.01], [0.1, -0.06], [0.13, -0.16], [0.175, -0.27], [0.18, -0.29], [0.16, -0.285], [0.11, -0.24], [0.08, -0.12], [0.0, -0.05]]) prof.push(new THREE.Vector2(r, y)); put(BL, new THREE.LatheGeometry(prof, 12), PAL.brass); put(BL, new THREE.SphereGeometry(0.035, 6, 5), PAL.iron, 0, -0.3, 0); bell.add(bake(B, BL, vcMat(B, { side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 }), 9, true)); } group.add(bell);
  /* flowers and leaves wound over the arch and up the posts */
  const place = []; const normals = [];
  for (let i = 0; i < 100; i++) { const u = (i / 100) * Math.PI + (rnd() - 0.5) * 0.03; ell(u); const nx = Math.cos(u) / W; const ny = Math.sin(u) / AB; const nl = Math.hypot(nx, ny); const line = i % 3; const p = _a.clone(); const n = new THREE.Vector3(); if (line === 2) { n.set(nx / nl, ny / nl, 0); p.addScaledVector(n, 0.2); p.z += (rnd() - 0.5) * 0.2; } else { n.set(0, 0, line ? 1 : -1); p.z += n.z * 0.2; p.x += (rnd() - 0.5) * 0.1; p.y += (rnd() - 0.5) * 0.12; } place.push(p); normals.push(n); }
  for (let i = 0; i < 36; i++) { const sg = i % 2 ? 1 : -1; const y = 0.7 + (Math.floor(i / 2) / 18) * (PH - 1.0); const a = Math.floor(i / 2) * 1.1 + (sg > 0 ? 0 : 2); const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); place.push(new THREE.Vector3(sg * W + n.x * 0.34, y, n.z * 0.34)); normals.push(n); }
  const petalL = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; put(petalL, new THREE.IcosahedronGeometry(0.075, 0), 0xffffff, Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0, 0, 0, a, 1, 0.65, 0.4); }
  const petalGeo = B.own(mergeGeometries(petalL, false)); petalL.forEach((g) => g.dispose());
  const FC = [PAL.pink, 0xf4ecd8, 0xf0c030, 0xd8452c, 0x8a5ac0, 0x5a8ae0, PAL.pink]; const NF = place.length;
  const heads = B.own(new THREE.InstancedMesh(petalGeo, B.own(new THREE.MeshStandardMaterial({ roughness: 0.85 })), NF)); const cents = B.own(new THREE.InstancedMesh(B.own(new THREE.SphereGeometry(0.045, 6, 5)), B.own(new THREE.MeshStandardMaterial({ color: 0xe89a20, roughness: 0.8 })), NF));
  const leafG = B.own(new THREE.OctahedronGeometry(0.1, 0)); const NLF = 150; const leaves = B.own(new THREE.InstancedMesh(leafG, B.own(new THREE.MeshStandardMaterial({ roughness: 0.85 })), NLF));
  const LC = [0x3f8a3a, 0x4fa040, 0x2f7a3a, 0x5aaa44]; const col = new THREE.Color();
  for (let i = 0; i < NF; i++) { const sc = 1 + rnd() * 0.7; _q.setFromUnitVectors(Z, normals[i]); _q2.setFromAxisAngle(Z, rnd() * 6.28); _q.multiply(_q2); _o.position.copy(place[i]); _o.quaternion.copy(_q); _o.scale.setScalar(sc); _o.updateMatrix(); heads.setMatrixAt(i, _o.matrix); _o.position.addScaledVector(normals[i], 0.02 * sc); _o.updateMatrix(); cents.setMatrixAt(i, _o.matrix); heads.setColorAt(i, col.set(FC[Math.floor(rnd() * FC.length)])); }
  for (let i = 0; i < NLF; i++) { const j = Math.floor(rnd() * NF); _o.position.copy(place[j]); _o.position.x += (rnd() - 0.5) * 0.3; _o.position.y += (rnd() - 0.5) * 0.3; _o.position.addScaledVector(normals[j], -0.01); _q.setFromUnitVectors(Z, normals[j]); _q2.setFromAxisAngle(Z, rnd() * 6.28); _q.multiply(_q2); _o.quaternion.copy(_q); const ls = 0.9 + rnd() * 0.8; _o.scale.set(0.7 * ls, 1.5 * ls, 0.3 * ls); _o.updateMatrix(); leaves.setMatrixAt(i, _o.matrix); leaves.setColorAt(i, col.set(LC[i % 4])); }
  for (const m of [heads, cents, leaves]) { m.frustumCulled = false; m.castShadow = false; group.add(m); }
  /* cloth: pennants on the poles and long ribbons off the capitals, bunting under the arch */
  const cloth = strips(B, [
    { root: [-W - 0.03, 6.82, 0], dir: [-1, 0, 0], side: [0, 1, 0], len: 1.9, w0: 0.72, w1: 0.02, color: PAL.red, color2: PAL.yellow, bands: 2, amp: 0.1, freq: 5.5, speed: 4.5, droop: 0.12 },
    { root: [W + 0.03, 6.82, 0], dir: [1, 0, 0], side: [0, 1, 0], len: 1.9, w0: 0.72, w1: 0.02, color: PAL.blue, color2: PAL.yellow, bands: 2, amp: 0.1, freq: 5.5, speed: 4.2, phase: 1.3, droop: 0.12 },
    ...[-1, 1].flatMap((sg, k) => [[0.28, PAL.pink], [-0.28, PAL.yellow]].map(([x, c], j) => ({ root: [sg * W + x, PH + 0.04, 0.0], dir: [0, -1, 0], side: [0, 0, 1], len: 1.6, w0: 0.17, w1: 0.14, color: c, color2: PAL.cream, bands: 3, amp: 0.1, freq: 6, speed: 5, phase: k * 2 + j * 1.2, push: 0.3, wind: [0.2, 1] }))),
  ], 9); group.add(cloth.mesh);
  const BC = [PAL.red, PAL.yellow, PAL.blue, PAL.cream, PAL.pink, PAL.green]; const bunting = [];
  for (let i = 0; i < 11; i++) { ell(0.1 * Math.PI + (i / 10) * 0.8 * Math.PI, W - 0.26, AB - 0.26); bunting.push({ root: [_a.x, _a.y - 0.02, 0], dir: [0, -1, 0], side: [1, 0, 0], len: 0.52, w0: 0.4, w1: 0.0, color: BC[i % 6], amp: 0.05, freq: 3, speed: 4, phase: i * 0.8, droop: 0 }); }
  const bunt = strips(B, bunting, 1); group.add(bunt.mesh);
  /* petals for the flare */
  const petals = pool(B, group, new THREE.PlaneGeometry(0.12, 0.08), 56, { g: 1.3, drag: 0.7, bounce: 0.1, floor: 0.02, sway: 3, colors: [PAL.pink, 0xf4ecd8, 0xf0c030, PAL.pink] });
  const S = { t: 0, flare: 0, f: 0, left: 0, acc: 0, bellA: 0 };
  const h = { group, width: 2.6 };
  h.flare = () => { S.flare = 1; S.f = 0; S.left = 44; S.bellA = 0.5; };
  h.update = (dt) => {
    S.t += dt; S.f += dt; S.flare = Math.max(0, S.flare - dt * 0.35); const boost = smooth(S.flare);
    cloth.update(S.t, boost); bunt.update(S.t, boost);
    S.bellA = Math.max(0, S.bellA - dt * 0.22); bell.rotation.x = Math.sin(S.t * 5.2) * S.bellA + Math.sin(S.t * 0.9) * 0.01; bell.rotation.z = Math.cos(S.t * 4.1) * S.bellA * 0.4;
    if (S.left > 0) { S.acc += dt * 70; while (S.acc >= 1 && S.left > 0) { S.acc -= 1; S.left--; const u = rnd() * Math.PI; ell(u); petals.spawn(_a.x + (rnd() - 0.5) * 0.4, _a.y + 0.1, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 2.2, 1.6 + rnd() * 2.4, (rnd() - 0.5) * 2.2, 2.6 + rnd() * 1.4, 1, Math.floor(rnd() * 4), 12); } }
    petals.update(dt);
  };
  h.dispose = () => { group.removeFromParent(); B.free(); };
  return h;
}


/* ---- a ribbon laid along a curve (the scarf lying on the grass) */
function ribbonStrip(curve, t0, t1, w, n = 8) {
  const pos = []; const idx = [];
  for (let i = 0; i <= n; i++) { const t = lerp(t0, t1, i / n); curve.getPointAt(t, _a); curve.getTangentAt(t, _b); _c.crossVectors(_b, UP).normalize(); pos.push(_a.x - _c.x * w / 2, _a.y, _a.z - _c.z * w / 2, _a.x + _c.x * w / 2, _a.y + 0.012, _a.z + _c.z * w / 2); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

/* =================================================================== SIGN: the three trail clues */
export function sign(scene, { i = 0 } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const rnd = seeded(i * 19 + 11); const T = []; let cloth = null; let tick = null;
  const mat = vcMat(B, { side: THREE.DoubleSide });
  if (i === 0) {
    /* what it took: a striped scarf snagged on a dead bramble, a red mitten in the grass below */
    const tops = [];
    for (let b = 0; b < 6; b++) { const dx = (rnd() - 0.5) * 0.7; const dz = (rnd() - 0.5) * 0.7; const hh = b === 0 ? 1.15 : 0.7 + rnd() * 0.4; const pts = [new THREE.Vector3((rnd() - 0.5) * 0.1, 0, (rnd() - 0.5) * 0.1), new THREE.Vector3(dx * 0.3, hh * 0.45, dz * 0.3), new THREE.Vector3(dx * 0.7, hh * 0.78, dz * 0.7), new THREE.Vector3(b === 0 ? 0.12 : dx, hh, b === 0 ? 0 : dz)]; put(T, tubeGeo(pts, 0.016 + rnd() * 0.01, 6, 5), 0x5a3a22); tops.push(pts[3]); for (let k = 0; k < 3; k++) { const p = pts[1 + (k % 3)]; put(T, new THREE.ConeGeometry(0.012, 0.05, 4), 0x4a2e1a, p.x + (rnd() - 0.5) * 0.04, p.y, p.z + (rnd() - 0.5) * 0.04, rnd() * 2, 0, rnd() * 2); put(T, new THREE.IcosahedronGeometry(0.05, 0), PAL.leaf, p.x + (rnd() - 0.5) * 0.1, p.y + 0.03, p.z + (rnd() - 0.5) * 0.1, 0, 0, 0, 1, 0.45, 0.8); } }
    for (const [x, y, z] of [[0.3, 0.55, 0.1], [-0.2, 0.7, -0.15], [0.1, 0.9, 0.25]]) put(T, new THREE.SphereGeometry(0.022, 6, 5), PAL.red, x, y, z);
    const top = tops[0];
    cloth = strips(B, [{ root: [top.x, top.y + 0.04, top.z], dir: [0, -1, 0], side: [1, 0, 0], len: 0.95, w0: 0.3, w1: 0.28, color: PAL.red, color2: PAL.cream, bands: 1, amp: 0.14, freq: 4.5, speed: 3, push: 0.25, wind: [1, 0.3] }, { root: [top.x - 0.02, top.y + 0.0, top.z + 0.02], dir: [0, -1, 0], side: [0, 0, 1], len: 0.6, w0: 0.3, w1: 0.28, color: PAL.blue, color2: PAL.yellow, bands: 1, amp: 0.08, freq: 6, speed: 3.4, phase: 2, push: 0.2, wind: [-1, 0.2] }], 8);
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(0.22, 0.03, 0.05), new THREE.Vector3(0.5, 0.045, 0.3), new THREE.Vector3(0.85, 0.035, 0.28), new THREE.Vector3(1.15, 0.05, 0.55), new THREE.Vector3(1.4, 0.03, 0.5)]); const SC = [PAL.red, PAL.cream, PAL.blue, PAL.cream, PAL.yellow, PAL.cream];
    for (let k = 0; k < 11; k++) put(T, ribbonStrip(cv, k / 11, (k + 1) / 11, 0.28, 3), SC[k % 6]);
    cv.getPointAt(1, _a); for (let k = 0; k < 7; k++) put(T, new THREE.CylinderGeometry(0.01, 0.008, 0.1, 4), k % 2 ? PAL.cream : PAL.red, _a.x + 0.05, 0.04, _a.z + (k - 3) * 0.04, 0, 0, Math.PI / 2);
    /* the mitten */
    const mx = 0.7; const mz = -0.55; put(T, new THREE.SphereGeometry(0.1, 10, 8), PAL.red, mx, 0.05, mz, 0, 0.5, 0, 1.0, 0.5, 1.3); put(T, new THREE.CapsuleGeometry(0.035, 0.07, 4, 6), PAL.red, mx - 0.09, 0.04, mz - 0.04, Math.PI / 2, 0.5, 1.0); put(T, new THREE.CylinderGeometry(0.075, 0.075, 0.1, 10), PAL.cream, mx + 0.1, 0.06, mz + 0.14, Math.PI / 2, 0.5, 0); put(T, new THREE.TorusGeometry(0.076, 0.012, 5, 10), PAL.blue, mx + 0.1, 0.06, mz + 0.14, 0, 0.5, 0);
    for (const [dx, dz] of [[0, 0], [0.04, -0.06], [-0.04, 0.05]]) put(T, new THREE.SphereGeometry(0.018, 6, 5), PAL.cream, mx + dx, 0.09, mz + dz, 0, 0, 0, 1, 0.5, 1);
    const yarn = tubeGeo([new THREE.Vector3(mx + 0.17, 0.03, mz + 0.22), new THREE.Vector3(mx + 0.3, 0.02, mz + 0.3), new THREE.Vector3(mx + 0.5, 0.025, mz + 0.38), new THREE.Vector3(1.1, 0.025, 0.1)], 0.006, 12, 4); put(T, yarn, PAL.red);
    groundPatch(T, rnd, { n: 4, r0: 0.9, r1: 1.4, stones: 0 });
  } else if (i === 1) {
    /* whose it is: a picket fence slashed by great claws */
    const post = new THREE.BoxGeometry(0.13, 1.2, 0.13); for (const x of [-0.66, 0.66]) { put(T, post, 0xd8cdb0, x, 0.6, 0, 0, 0, (rnd() - 0.5) * 0.04); put(T, new THREE.SphereGeometry(0.08, 8, 6), PAL.blue, x, 1.22, 0); }
    for (const y of [0.4, 0.82]) put(T, new THREE.BoxGeometry(1.4, 0.075, 0.05), 0xcabf9f, 0, y, -0.07);
    const ps = new THREE.Shape(); ps.moveTo(-0.07, 0); ps.lineTo(0.07, 0); ps.lineTo(0.07, 0.8); ps.lineTo(0, 0.93); ps.lineTo(-0.07, 0.8); ps.lineTo(-0.07, 0); const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.04, bevelEnabled: false });
    const PC = [0xf0e8d0, 0xe8dfc6, 0xf2ecd8];
    for (let k = 0; k < 7; k++) { const x = -0.54 + k * 0.18; if (k === 3) continue; put(T, pg, PC[k % 3], x, 0.03, -0.02, 0, 0, (rnd() - 0.5) * 0.05); }
    /* the torn-out picket lies in the grass, splinters round it */
    put(T, pg, 0xe8dfc6, 0.35, 0.03, 0.5, -Math.PI / 2 + 0.05, 0.5, 0.2); for (let k = 0; k < 7; k++) put(T, new THREE.BoxGeometry(0.02, 0.1 + rnd() * 0.08, 0.008), 0xf2dca8, (rnd() - 0.5) * 0.7, 0.01, 0.15 + rnd() * 0.4, Math.PI / 2, rnd() * 3, 0);
    /* three deep gashes, pale wood bare inside, across the pickets */
    for (let k = 0; k < 4; k++) { const ox = -0.3 + k * 0.17; const ln = 0.88 - Math.abs(k - 1.5) * 0.08; put(T, new THREE.BoxGeometry(0.05, ln, 0.012), 0x3a2412, ox, 0.52, 0.026, 0, 0, -0.42); put(T, new THREE.BoxGeometry(0.018, ln * 0.92, 0.014), 0xe9cf98, ox + 0.012, 0.52, 0.028, 0, 0, -0.42); put(T, new THREE.BoxGeometry(0.03, 0.06, 0.02), 0x3a2412, ox + Math.sin(0.42) * ln * 0.5, 0.52 - Math.cos(0.42) * ln * 0.5, 0.03, 0, 0, 0.8); }
    for (const [x, y, z, sc] of [[-0.66, 0.66, 0.08, 1], [-0.62, 0.62, 0.1, 0.8], [-0.7, 0.7, 0.07, 0.7]]) put(T, new THREE.IcosahedronGeometry(0.06, 0), 0x4a3a30, x, y, z, 0, 0, 0, 1.3 * sc, 0.8 * sc, 0.8 * sc);
    groundPatch(T, rnd, { n: 4, r0: 0.9, r1: 1.2, stones: 0 });
  } else {
    /* where it went: a cold camp, a pot on a tripod over grey ash, a spoon, a tin mug */
    const legTop = new THREE.Vector3(0, 1.2, 0);
    for (let k = 0; k < 3; k++) { const a = 0.4 + (k / 3) * TAU; const foot = new THREE.Vector3(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62); put(T, tubeGeo([foot, legTop.clone().lerp(foot, 0.02)], 0.026, 2, 5), 0x7a5230); }
    put(T, new THREE.TorusGeometry(0.05, 0.016, 5, 8), PAL.red, 0, 1.17, 0, Math.PI / 2); put(T, new THREE.CylinderGeometry(0.012, 0.012, 0.26, 4), PAL.iron, 0, 1.05, 0);
    const prof = []; for (const [r, y] of [[0, 0], [0.17, 0], [0.26, 0.09], [0.29, 0.21], [0.25, 0.3], [0.27, 0.32], [0.0, 0.32]]) prof.push(new THREE.Vector2(r, y)); put(T, new THREE.LatheGeometry(prof, 14), 0x3b4660, 0, 0.55, 0);
    put(T, new THREE.TorusGeometry(0.27, 0.014, 5, 18, Math.PI), PAL.iron, 0, 0.87, 0, 0, 0, 0); put(T, new THREE.TorusGeometry(0.28, 0.02, 5, 18), PAL.red, 0, 0.87, 0, Math.PI / 2);
    const lid = []; for (const [r, y] of [[0, 0.07], [0.1, 0.06], [0.24, 0.02], [0.27, 0.0]]) lid.push(new THREE.Vector2(r, y)); put(T, new THREE.LatheGeometry(lid, 12), 0x4b577a, 0.04, 0.88, 0.0, 0.18, 0, 0.2); put(T, new THREE.SphereGeometry(0.03, 6, 5), PAL.brass, 0.05, 0.96, 0);
    put(T, new THREE.CylinderGeometry(0.52, 0.55, 0.04, 16), 0x8d8d88, 0, 0.02, 0);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI + 0.3; put(T, new THREE.CylinderGeometry(0.035, 0.04, 0.55, 5), k % 2 ? 0x2a2420 : 0x3c322c, Math.cos(a) * 0.05, 0.07, Math.sin(a) * 0.05, Math.PI / 2, -a, 0.1); }
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU + 0.2; put(T, new THREE.DodecahedronGeometry(0.13, 0), PAL.stone, Math.cos(a) * 0.66, 0.07, Math.sin(a) * 0.66, rnd() * 3, rnd() * 3, rnd() * 3, 1.2, 0.8, 1); }
    put(T, new THREE.CylinderGeometry(0.012, 0.016, 0.42, 5), PAL.wood, 0.78, 0.2, 0.42, 0.5, 0.4, 0.35); put(T, new THREE.SphereGeometry(0.05, 7, 5), PAL.wood, 0.7, 0.4, 0.39, 0.3, 0.4, 0, 1, 0.4, 1.4);
    put(T, new THREE.CylinderGeometry(0.06, 0.05, 0.1, 9), PAL.steel, -0.5, 0.05, 0.85); put(T, new THREE.TorusGeometry(0.04, 0.01, 4, 8, Math.PI), PAL.steel, -0.44, 0.06, 0.85, 0, 0, -Math.PI / 2);
    groundPatch(T, rnd, { n: 4, r0: 0.95, r1: 1.3, stones: 0 });
  }
  group.add(bake(B, T, mat, 2.5)); if (cloth) group.add(cloth.mesh);
  void tick; let t = 0;
  return { group, update(dt) { t += dt; cloth?.update(t, 0); }, dispose() { group.removeFromParent(); B.free(); } };
}


/* =================================================================== WAYMARK: a kite and a pennant on a tall painted pole with butterflies (stop); a striped turret with a flag and one warm lamp (goal) */
export function waymark(scene, { kind = 'stop', accent = 0xf2b84a } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); void accent; const goal = kind === 'goal'; const rnd = seeded(goal ? 9 : 4);
  const G = new THREE.Group(); const GS = goal ? 2.2 : 2.0; G.scale.setScalar(GS); group.add(G); const NF = { fog: false };
  const T = []; const Tb = []; const mat = vcMat(B, { side: THREE.DoubleSide, fog: false }); const S = { t: 0, k: 1 };
  let light = null; let upd = null;
  if (!goal) {
    /* a cairn of painted stones and a pole banded red and cream */
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; put(Tb, new THREE.DodecahedronGeometry(0.28, 0), k % 2 ? 0xb4ad9c : 0xa59d88, Math.cos(a) * 0.32, 0.16, Math.sin(a) * 0.32, rnd() * 3, rnd() * 3, rnd() * 3, 1.1, 0.8, 1); }
    put(T, new THREE.CylinderGeometry(0.05, 0.07, 7.2, 8), PAL.wood, 0, 3.6, 0);
    for (let k = 0; k < 7; k++) put(T, new THREE.CylinderGeometry(0.062, 0.07 - k * 0.001, 0.38, 8), k % 2 ? PAL.cream : PAL.yellow, 0, 0.4 + k * 0.76, 0);
    put(T, new THREE.SphereGeometry(0.11, 8, 6), PAL.yellow, 0, 7.28, 0); groundPatch(Tb, rnd, { n: 9, r0: 0.7, r1: 1.4, stones: 0 });
    /* the kite: four painted quarters on crossed sticks, with a long bowed tail */
    const kg = new THREE.Group(); G.add(kg); const KL = [];
    const tri = (a, b, c, col) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c)]); g.computeVertexNormals(); put(KL, g, col); g.dispose(); };
    const tp = [0, 1.7, 0]; const rp = [1.15, 0.45, 0]; const bp = [0, -1.8, 0]; const lp = [-1.15, 0.45, 0]; const cp = [0, 0.35, 0.0];
    tri(tp, rp, cp, PAL.red); tri(rp, bp, cp, PAL.yellow); tri(bp, lp, cp, PAL.blue); tri(lp, tp, cp, PAL.pink);
    put(KL, new THREE.BoxGeometry(0.05, 3.5, 0.05), PAL.dark, 0, -0.05, 0.02); put(KL, new THREE.BoxGeometry(2.3, 0.05, 0.05), PAL.dark, 0, 0.45, 0.02);
    const kite = bake(B, KL, mat, 99, true, false); kg.add(kite); kg.scale.setScalar(1.35);
    const tail = strips(B, [{ root: [0, -2.0, 0], dir: [0, -1, 0], side: [1, 0, 0], len: 4.4, w0: 0.22, w1: 0.22, color: PAL.red, color2: PAL.cream, bands: 1, amp: 0.13, freq: 7, speed: 5, push: 0.18, wind: [1, 0] }], 14, NF); kg.add(tail.mesh);
    const pen = strips(B, [{ root: [0.06, 6.85, 0], dir: [1, 0, 0], side: [0, 1, 0], len: 2.5, w0: 0.95, w1: 0.03, color: PAL.red, color2: PAL.yellow, bands: 2, amp: 0.1, freq: 5.5, speed: 4.5, droop: 0.1 }], 10, NF); G.add(pen.mesh);
    const stringM = B.own(new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.014, 0.014, 1, 4)), B.own(new THREE.MeshBasicMaterial({ color: 0x4a3a2a, fog: false })))); G.add(stringM);
    /* butterflies: two wing meshes and a body mesh, small and bright */
    const wing = new THREE.Shape(); wing.moveTo(0, 0.02); wing.bezierCurveTo(0.05, 0.16, 0.2, 0.14, 0.17, 0.02); wing.bezierCurveTo(0.2, -0.1, 0.08, -0.12, 0.02, -0.03); wing.lineTo(0, 0.02);
    const wR = B.own(new THREE.ShapeGeometry(wing, 6)); const wL = B.own(wR.clone().scale(-1, 1, 1)); const NBF = 6;
    const wmat = B.own(new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, fog: false }));
    const meshR = B.own(new THREE.InstancedMesh(wR, wmat, NBF)); const meshL = B.own(new THREE.InstancedMesh(wL, wmat, NBF)); const body = B.own(new THREE.InstancedMesh(B.own(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 4)), B.own(new THREE.MeshStandardMaterial({ color: 0x2a2018 })), NBF));
    const BC = [PAL.yellow, 0xf0f0f0, PAL.sky, PAL.orange, PAL.pink, PAL.yellow]; const col = new THREE.Color(); for (let i = 0; i < NBF; i++) { meshR.setColorAt(i, col.set(BC[i])); meshL.setColorAt(i, col.set(BC[i])); }
    for (const m of [meshR, meshL, body]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); G.add(m); }
    const bf = Array.from({ length: NBF }, (_, i) => ({ r: 0.9 + rnd() * 1.3, w: 0.5 + rnd() * 0.5, ph: rnd() * 6.28, hgt: 0.9 + rnd() * 1.4, fl: 10 + rnd() * 5 }));
    upd = (dt, st) => {
      const t = S.t; const near = st.near || 0;
      kg.position.set(1.5 + Math.sin(t * 0.6) * 0.35, 9.5 + Math.sin(t * 0.85) * 0.35, 0); kg.rotation.set(-0.18 + Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.45) * 0.55, Math.sin(t * 0.9) * 0.1);
      _a.set(0, 7.2, 0); _b.set(kg.position.x * 0.9, kg.position.y - 1.3, 0); _c.subVectors(_b, _a); const ln = _c.length(); stringM.position.copy(_a).addScaledVector(_c, 0.5); stringM.scale.set(1, ln, 1); stringM.quaternion.setFromUnitVectors(UP, _c.multiplyScalar(1 / ln));
      tail.update(t, near * 0.5); pen.update(t, near * 0.4);
      for (let i = 0; i < NBF; i++) {
        const f = bf[i]; const a = t * f.w + f.ph; const r = f.r * lerp(1, 0.6, near); const x = Math.cos(a) * r; const z = Math.sin(a) * r; const y = f.hgt + Math.sin(t * 2.1 + f.ph) * 0.25; const open = 0.25 + 0.75 * Math.abs(Math.sin(t * f.fl + f.ph));
        _o.position.set(x, y, z); _o.rotation.set(0.25, -a + 1.1, 0); _o.scale.set(open * 1.3, 1.3, 1.3); _o.updateMatrix(); meshR.setMatrixAt(i, _o.matrix); meshL.setMatrixAt(i, _o.matrix);
        _o.scale.set(1, 1, 1); _o.updateMatrix(); body.setMatrixAt(i, _o.matrix);
      }
      meshR.instanceMatrix.needsUpdate = true; meshL.instanceMatrix.needsUpdate = true; body.instanceMatrix.needsUpdate = true;
    };
  } else {
    /* a fairy tower: cream masonry with a gold ribbon that winds up it, arrow slits, a gallery, a glowing lantern room
       (warm glass panes, emissive above 1 so the bloom takes it; no PointLight: see beacon), a tall blue cone roof and a flag */
    const tg = new THREE.CylinderGeometry(0.66, 0.92, 9.4, 20, 1); const tower = new THREE.Mesh(B.own(tg), B.own(new THREE.MeshStandardMaterial({ map: stoneTex(B, [5, 7]), roughness: 0.9, fog: false }))); tower.position.y = 0.6 + 4.7; tower.castShadow = true; G.add(tower);
    /* the gold ribbon: a helix of short flat pieces round the shaft */
    for (let k = 0; k < 44; k++) { const t = k / 44; const a = t * TAU * 2.5; const y = 1.0 + t * 8.6; const rr = lerp(0.92, 0.66, (y - 0.6) / 9.4) + 0.02; put(T, new THREE.BoxGeometry(0.42, 0.16, 0.05), PAL.yellow, Math.cos(a) * rr, y, Math.sin(a) * rr, 0, -a + Math.PI / 2, -0.36); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; const y = 3.0 + k * 1.7; const rr = lerp(0.92, 0.66, (y - 0.6) / 9.4) + 0.01; put(T, new THREE.BoxGeometry(0.12, 0.5, 0.06), 0x2a3550, Math.cos(a) * rr, y, Math.sin(a) * rr, 0, -a + Math.PI / 2, 0); }
    put(T, new THREE.CylinderGeometry(1.15, 1.25, 0.6, 18), 0xa59d88, 0, 0.3, 0); put(T, new THREE.TorusGeometry(1.1, 0.06, 6, 20), PAL.blue, 0, 0.62, 0, Math.PI / 2);
    put(T, new THREE.BoxGeometry(0.6, 0.95, 0.12), 0x5a3a22, 0, 1.05, 0.88); put(T, new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), 0x5a3a22, 0, 1.52, 0.88, Math.PI / 2);
    put(T, new THREE.CylinderGeometry(1.05, 0.72, 0.4, 18), 0xe8d8ae, 0, 10.14, 0); put(T, new THREE.TorusGeometry(1.03, 0.07, 6, 20), PAL.yellow, 0, 10.3, 0, Math.PI / 2);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; put(T, new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), PAL.yellow, Math.cos(a) * 0.86, 10.95, Math.sin(a) * 0.86); }
    put(T, new THREE.CylinderGeometry(1.05, 1.05, 0.14, 18), PAL.cream, 0, 11.6, 0); put(T, new THREE.ConeGeometry(1.25, 3.0, 18), PAL.blue, 0, 13.15, 0); put(T, new THREE.TorusGeometry(1.06, 0.07, 6, 20), PAL.yellow, 0, 11.7, 0, Math.PI / 2);
    put(T, new THREE.CylinderGeometry(0.035, 0.05, 2.2, 6), PAL.wood, 0, 15.6, 0); put(T, new THREE.SphereGeometry(0.14, 8, 6), PAL.yellow, 0, 16.75, 0);
    groundPatch(Tb, rnd, { n: 8, r0: 2.4, r1: 3.6, stones: 0 });
    const lampM = B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc870).multiplyScalar(2.2), fog: false, toneMapped: false }));
    const lamp = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.72, 0.72, 1.1, 16)), lampM); lamp.position.y = 10.95; G.add(lamp);
    light = glowSprite(B, 0xffc060); light.position.set(0, 10.95, 0); light.scale.setScalar(5); G.add(light);
    const flag = strips(B, [{ root: [0.06, 16.5, 0], dir: [1, 0, 0], side: [0, 1, 0], len: 4.2, w0: 1.7, w1: 0.04, color: PAL.yellow, color2: PAL.blue, bands: 2, amp: 0.1, freq: 5, speed: 4, droop: 0.1 }], 10, NF); G.add(flag.mesh);
    upd = (dt, st) => { flag.update(S.t, (st.near || 0) * 0.4); const p = 1 + Math.sin(S.t * 1.7) * 0.06; light.scale.setScalar(5 * p * S.k); light.material.opacity = 0.75 * S.k; lampM.color.setRGB(1, 0.78, 0.44).multiplyScalar(2.0 + 0.3 * Math.sin(S.t * 1.7)); };
  }
  G.add(bake(B, T, mat, 3)); if (Tb.length) group.add(bake(B, Tb, mat, 3));
  return {
    group,
    update(dt, st = {}) { S.t += dt; const k = clamp(st.k ?? 1); S.k = smooth(k); const th = 1 - 0.6 * clamp(st.near || 0); G.scale.set(GS * th, GS, GS * th); group.visible = k > 0.01; group.scale.setScalar(Math.max(0.001, S.k)); if (!group.visible) return; upd(dt, st); },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

/* =================================================================== FARLIGHT: the far light itself (the end of the far-light walk).
   A round painted plinth (cream, a blue band with gold studs) whose top holds the three finds at altarTop (0.73 m, slots
   0.55 m out), and at its centre a brass lamp-post with a big lantern of warm glass that glows (emissive above 1 for the
   bloom, a soft halo; no PointLight). update(dt, { k, flare }): flare 0..1 brightens it when the three are laid.
   Wired by journey.js when WP.farlight exists; it replaces the grey stone plinth. */
export function farlight(scene, { accent = 0xf2b84a } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); void accent; const rnd = seeded(31);
  const T = [];
  put(T, new THREE.CylinderGeometry(1.0, 1.2, 0.62, 20), PAL.cream, 0, 0.31, 0); put(T, new THREE.CylinderGeometry(1.12, 1.08, 0.14, 20), 0xf2e6c8, 0, 0.66, 0);
  put(T, new THREE.TorusGeometry(1.1, 0.07, 6, 24), PAL.blue, 0, 0.36, 0, Math.PI / 2); put(T, new THREE.TorusGeometry(1.13, 0.035, 6, 24), PAL.yellow, 0, 0.6, 0, Math.PI / 2);
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; put(T, new THREE.SphereGeometry(0.05, 6, 5), PAL.yellow, Math.cos(a) * 1.16, 0.36, Math.sin(a) * 1.16); }
  /* the lamp-post: a fluted brass post, a scroll bracket, the lantern frame and a little roof with a finial */
  put(T, new THREE.CylinderGeometry(0.13, 0.17, 0.16, 12), PAL.brass, 0, 0.81, 0); put(T, new THREE.CylinderGeometry(0.05, 0.07, 1.5, 10), PAL.brass, 0, 1.6, 0);
  put(T, new THREE.TorusGeometry(0.1, 0.02, 6, 12), PAL.brass, 0, 2.3, 0, Math.PI / 2); put(T, new THREE.CylinderGeometry(0.3, 0.22, 0.08, 6), PAL.brass, 0, 2.4, 0);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; put(T, new THREE.BoxGeometry(0.035, 0.66, 0.035), PAL.brass, Math.cos(a) * 0.3, 2.77, Math.sin(a) * 0.3); }
  put(T, new THREE.CylinderGeometry(0.34, 0.3, 0.08, 6), PAL.brass, 0, 3.12, 0); put(T, new THREE.ConeGeometry(0.4, 0.42, 6), PAL.blue, 0, 3.37, 0); put(T, new THREE.SphereGeometry(0.07, 8, 6), PAL.yellow, 0, 3.62, 0);
  groundPatch(T, rnd, { n: 9, r0: 1.4, r1: 2.0, stones: 6 });
  group.add(bake(B, T, vcMat(B), 3));
  const glassM = B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd080).multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.95 }));
  const glass = new THREE.Mesh(B.own(new THREE.CylinderGeometry(0.28, 0.25, 0.64, 6)), glassM); glass.position.y = 2.77; group.add(glass);
  const flameM = B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), toneMapped: false }));
  const flame = new THREE.Mesh(B.own(new THREE.SphereGeometry(0.09, 10, 8)), flameM); flame.scale.set(1, 1.6, 1); flame.position.y = 2.72; group.add(flame);
  const halo = glowSprite(B, 0xffc060); halo.position.y = 2.77; halo.scale.setScalar(3.4); group.add(halo);
  const halo2 = glowSprite(B, 0xffe0a0); halo2.position.y = 2.77; halo2.scale.setScalar(1.2); group.add(halo2);
  const S = { t: 0, f: 0 };
  return {
    group, altarTop: 0.73, slotR: 0.55,
    update(dt, st = {}) { S.t += dt; const k = clamp(st.k ?? 1); S.f = Math.max(clamp(st.flare || 0), S.f - dt * 0.4); const p = 1 + 0.05 * Math.sin(S.t * 2.3) + 0.03 * Math.sin(S.t * 7.1);
      glassM.color.setRGB(1, 0.82, 0.5).multiplyScalar((1.8 + S.f * 1.6) * p * k); halo.scale.setScalar((3.4 + S.f * 4) * p); halo.material.opacity = 0.8 * k; halo2.material.opacity = k; flame.scale.set(1, 1.6 + 0.2 * Math.sin(S.t * 9), 1); },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

/* =================================================================== CAUSE: a small blue songbird that flutters at the hero's shoulder */
export function cause(scene) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const bird = new THREE.Group(); bird.scale.setScalar(1.9); group.add(bird);
  const L = []; const BL = 0x3f7fd0; const DK = 0x2a5ea8;
  put(L, new THREE.SphereGeometry(1, 12, 9), BL, 0, 0, 0, 0, 0, 0, 0.09, 0.09, 0.135); put(L, new THREE.SphereGeometry(1, 10, 8), 0xf4e6b0, 0, -0.03, 0.025, 0, 0, 0, 0.078, 0.07, 0.11);
  put(L, new THREE.SphereGeometry(0.075, 10, 8), BL, 0, 0.07, 0.12); put(L, new THREE.ConeGeometry(0.022, 0.07, 6), 0xf0a020, 0, 0.065, 0.205, Math.PI / 2); put(L, new THREE.ConeGeometry(0.014, 0.05, 4), DK, 0, 0.145, 0.1, -0.5); put(L, new THREE.ConeGeometry(0.012, 0.04, 4), DK, 0.02, 0.145, 0.09, -0.3, 0, -0.3);
  for (const s of [-1, 1]) { put(L, new THREE.SphereGeometry(0.017, 6, 5), 0x1a1a22, s * 0.052, 0.085, 0.17); put(L, new THREE.SphereGeometry(0.006, 4, 3), 0xffffff, s * 0.056, 0.092, 0.182); put(L, new THREE.SphereGeometry(0.02, 6, 5), PAL.pink, s * 0.062, 0.05, 0.15, 0, 0, 0, 1, 0.6, 0.5); }
  put(L, new THREE.BoxGeometry(0.075, 0.012, 0.17), DK, 0, 0.02, -0.2, -0.22, 0, 0); put(L, new THREE.BoxGeometry(0.07, 0.013, 0.04), PAL.yellow, 0, 0.035, -0.285, -0.22, 0, 0);
  put(L, new THREE.CylinderGeometry(0.006, 0.006, 0.05, 3), 0xc07820, 0.03, -0.1, 0.0); put(L, new THREE.CylinderGeometry(0.006, 0.006, 0.05, 3), 0xc07820, -0.03, -0.1, 0.0);
  bird.add(bake(B, L, vcMat(B, { roughness: 0.85 }), 9, true, false));
  const wing = (s) => { const W = []; put(W, new THREE.SphereGeometry(1, 8, 6), DK, s * 0.1, 0, -0.01, 0, 0, 0, 0.1, 0.012, 0.06); put(W, new THREE.SphereGeometry(1, 6, 5), 0x9cc4f0, s * 0.17, 0, -0.02, 0, 0, 0, 0.04, 0.01, 0.05); const m = bake(B, W, vcMat(B, { side: THREE.DoubleSide }), 9, true, false); const g = new THREE.Group(); g.position.set(s * 0.06, 0.04, 0.02); g.add(m); bird.add(g); return g; };
  const wl = wing(-1); const wr = wing(1); const S = { t: 0 };
  return {
    group,
    update(dt, st = {}) {
      S.t += dt; const t = st.t ?? S.t; const flap = Math.sin(t * 22) * 0.75;
      wl.rotation.z = -flap - 0.1; wr.rotation.z = flap + 0.1; bird.position.y = Math.sin(t * 3.1) * 0.06 + Math.sin(t * 22) * 0.012; bird.rotation.set(0.14 + Math.sin(t * 2.2) * 0.06, Math.sin(t * 0.8) * 0.7, Math.sin(t * 1.7) * 0.12);
    },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

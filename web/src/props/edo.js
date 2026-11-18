/* Old Edo quest props (walk chapters and chapter II). One file, no imports but three. Life-size metres, Y up, origin = base centre on the ground.
   Pieces: anchor (wooden stake bound with shimenawa and shide, iron chain) / cage (lashed bamboo) / beacon (stone toro) / kindling (charcoal basket)
   / marker (kosatsu notice board, name in brush ink) / gate (castle yagura-mon) / sign 0 1 2 (waraji + bundle, mon board, cold brazier + straw bed)
   / waymark stop (chochin + nobori on a bamboo pole, thin smoke) and goal (lantern tower) / cause (a floating chochin).
   Rules kept: no runes, no glow pillars, no additive sprite over 0.6 m, emissive colour stays under 1.0, one PointLight per beacon/goal, made at build.
   Dense one-line JS uses comments of the block kind only. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { farlight as worldFarlight } from './farlights.js'; /* the wonder walk's far light */

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const rng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let R = rng(1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _s = new V3(), _c = new THREE.Color();

/* ---------------------------------------------------------------- geometry helpers */
/* a part: geometry g moved to (x,y,z), painted hex as a vertex colour (jit = random brightness), non-indexed with position normal uv color */
function at(g, hex, x = 0, y = 0, z = 0, o = {}) {
  const q = g.index ? g.toNonIndexed() : g.clone();
  const r = o.r || [0, 0, 0]; const sc = o.s === undefined ? 1 : o.s; const s3 = Array.isArray(sc) ? sc : [sc, sc, sc];
  _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(s3[0], s3[1], s3[2])); q.applyMatrix4(_m);
  for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') q.deleteAttribute(k);
  if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
  if (o.flat) q.computeVertexNormals();
  _c.setHex(hex); if (o.jit) _c.multiplyScalar(1 + (R() - 0.5) * 2 * o.jit);
  const n = q.attributes.position.count; const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  q.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.dispose(); return q;
}
const solid = (parts) => { const g = mergeGeometries(parts); for (const p of parts) p.dispose(); return g; };
const cylY = (rt, rb, h, seg = 8, hs = 1) => new THREE.CylinderGeometry(rt, rb, h, seg, hs).translate(0, h / 2, 0);
const boxY = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
/* a pole lying between two points */
function pole(a, b, r, hex, o = {}) {
  const d = _p.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length(); const g = new THREE.CylinderGeometry(r, o.rb ?? r, L, o.seg || 6, 1);
  _q.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); _e.setFromQuaternion(_q);
  return at(g, hex, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { r: [_e.x, _e.y, _e.z], jit: o.jit ?? 0.1 });
}
/* a hewn log between y0 and y1: slightly irregular, optional jagged ends (a broken stake) */
function logGeo(y0, y1, r0, r1, { jagTop = 0, jagBot = 0, amp = 0.02, seed = 1 } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 14, 12); g.translate(0, (y0 + y1) / 2, 0); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const rr = Math.hypot(x, z);
    if (rr > 1e-4) { const n = (hash3(Math.round(x * 90) + seed, Math.round(y * 6), Math.round(z * 90)) - 0.5) * 2 * amp; p.setX(i, x + (x / rr) * n); p.setZ(i, z + (z / rr) * n); }
    if (jagTop && y > y1 - 1e-4) p.setY(i, y + (hash3(Math.round(x * 60) + seed, 1, Math.round(z * 60)) - 0.35) * jagTop + (rr < 1e-4 ? jagTop * 0.5 : 0));
    if (jagBot && y < y0 + 1e-4) p.setY(i, y - (hash3(Math.round(x * 60) + seed, 2, Math.round(z * 60)) - 0.35) * jagBot - (rr < 1e-4 ? jagBot * 0.5 : 0));
  }
  g.computeVertexNormals(); return g;
}
const rockGeo = (r, seed) => { const g = new THREE.IcosahedronGeometry(r, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.75 + hash3(Math.round(p.getX(i) * 40) + seed, Math.round(p.getY(i) * 40), Math.round(p.getZ(i) * 40)) * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); } g.computeVertexNormals(); return g; };
/* a folded zigzag paper strip hanging from y = 0 downward */
function shideGeo(w, len, folds) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= folds; i++) { const y = -len * i / folds; const z = (i % 2 ? 1 : -1) * w * 0.3; pos.push(-w / 2, y, z, w / 2, y, z); uv.push(0, i / folds, 1, i / folds); }
  for (let i = 0; i < folds; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/* a lathe from [radius, y] pairs */
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/* ---------------------------------------------------------------- textures and materials */
function ctex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (rep) t.repeat.set(rep[0], rep[1]); return t;
}
const grainTex = (seed = 3) => ctex(64, 256, (g, w, h) => {
  const r = rng(seed); g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 110; i++) { const x = r() * w; g.strokeStyle = `rgba(${r() < 0.55 ? '40,32,24' : '255,255,255'},${0.05 + r() * 0.16})`; g.lineWidth = 0.6 + r() * 1.8; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 7, h * 0.33, x + (r() - 0.5) * 7, h * 0.66, x + (r() - 0.5) * 4, h); g.stroke(); }
});
const stoneTex = (seed = 5) => ctex(128, 128, (g, w, h) => {
  const r = rng(seed); g.fillStyle = '#c4c2bb'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { const v = 150 + r() * 100; g.fillStyle = `rgba(${v},${v},${v - 4},${0.1 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 12; i++) { const x = r() * w, y = r() * h; const gr = g.createRadialGradient(x, y, 0, x, y, 10 + r() * 14); gr.addColorStop(0, 'rgba(110,130,80,0.3)'); gr.addColorStop(1, 'rgba(110,130,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
});
const strawTex = (seed = 8) => ctex(128, 128, (g, w, h) => {
  const r = rng(seed); g.fillStyle = '#b9a26a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) { const x = r() * w; g.strokeStyle = `rgba(${r() < 0.5 ? '90,66,30' : '236,214,150'},${0.25 + r() * 0.3})`; g.lineWidth = 0.7 + r() * 1.3; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 10, h); g.stroke(); }
});
const ropeTex = () => ctex(64, 64, (g, w, h) => {
  g.fillStyle = '#b9a272'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,52,26,0.7)'; g.lineWidth = 5;
  for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 40, h); g.stroke(); }
  g.strokeStyle = 'rgba(240,226,180,0.35)'; g.lineWidth = 2; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 16 + 8, 0); g.lineTo(i * 16 + 48, h); g.stroke(); }
}, [10, 1.5]);
const paperTex = (ribs = 11) => ctex(64, 128, (g, w, h) => {
  g.fillStyle = '#eadfc4'; g.fillRect(0, 0, w, h); const r = rng(4);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(150,120,70,${0.05 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 4); }
  g.strokeStyle = 'rgba(70,46,22,0.6)'; g.lineWidth = 1.6; for (let i = 1; i < ribs; i++) { const y = h * i / ribs; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});
const flameTex = () => ctex(64, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.74, 2, w / 2, h * 0.6, h * 0.5); gr.addColorStop(0, 'rgba(255,238,180,1)'); gr.addColorStop(0.35, 'rgba(255,170,70,0.85)'); gr.addColorStop(1, 'rgba(210,70,14,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(w / 2, 4); g.bezierCurveTo(w * 0.98, h * 0.45, w * 0.95, h * 0.97, w / 2, h * 0.97); g.bezierCurveTo(w * 0.05, h * 0.97, w * 0.02, h * 0.45, w / 2, 4); g.fill();
});
const smokeTex = () => ctex(32, 128, (g, w, h) => {
  const im = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = (x / (w - 1)) * 2 - 1; const v = y / (h - 1); const a = Math.exp(-u * u * 3.2) * Math.pow(Math.sin(Math.PI * v), 0.7) * 0.8; const i = (y * w + x) * 4; im.data[i] = 190; im.data[i + 1] = 196; im.data[i + 2] = 210; im.data[i + 3] = Math.round(a * 255); }
  g.putImageData(im, 0, 0);
});
const std = (scene, o = {}) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, envMapIntensity: 0.3, ...o }); if (scene.environment) m.envMap = scene.environment; return m; };
const woodMat = (scene, seed = 3, o = {}) => std(scene, { vertexColors: true, map: grainTex(seed), roughness: 0.9, ...o });
const ironMat = (scene, o = {}) => std(scene, { vertexColors: true, metalness: 0.72, roughness: 0.52, envMapIntensity: 0.9, ...o });
const stoneMat = (scene, seed = 5, o = {}) => std(scene, { vertexColors: true, map: stoneTex(seed), roughness: 0.96, envMapIntensity: 0.3, side: THREE.DoubleSide, ...o });
const mesh = (parent, geo, mat, { cast = true, recv = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m; };
function disposeTree(group) {
  group.removeFromParent();
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) { for (const k of ['map', 'emissiveMap', 'alphaMap', 'roughnessMap']) if (m[k]) m[k].dispose(); m.dispose(); }
  });
}

/* ---------------------------------------------------------------- small shared things */
/* a flame: two crossed planes, additive, kept at or under 0.6 m wide; set(scale, t) flickers it */
function makeFlame(w = 0.34, h = 0.5) {
  const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0); const b = a.clone().rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b]); a.dispose(); b.dispose();
  const mat = new THREE.MeshBasicMaterial({ map: flameTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0.86, 0.8, 0.72), side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false;
  return { mesh: m, set(s, t, ph = 0) { m.visible = s > 0.02; if (!m.visible) return; const f = 1 + 0.1 * Math.sin(t * 17 + ph) + 0.06 * Math.sin(t * 29 + ph * 2); m.scale.set(s * (1 + 0.05 * Math.sin(t * 23 + ph)), s * f, s); m.rotation.y = t * 0.8 + ph; } };
}
/* a thin rising ribbon of smoke (two crossed strips). update(t, k) sways it and sets its strength */
function makeSmoke(H, w, seg = 14, sway = 0.5) {
  const n = seg + 1; const pos = new Float32Array(n * 4 * 3); const uv = new Float32Array(n * 4 * 2); const idx = [];
  for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++) { const o = (s * n + i) * 2; uv.set([0, i / seg, 1, i / seg], o * 2); if (i < seg) { const a = o; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.5, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 2;
  return { mesh: m, update(t, k) {
    m.visible = k > 0.01; if (!m.visible) return; mat.opacity = k;
    for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++) {
      const f = i / seg; const y = H * f; const cx = Math.sin(t * 0.9 + i * 0.5 + s) * sway * Math.pow(f, 1.3) + f * f * sway * 0.6; const cz = Math.cos(t * 0.7 + i * 0.45) * sway * 0.6 * f; const hw = w * (0.45 + f * 1.1);
      const o = (s * n + i) * 2 * 3; if (s === 0) { pos[o] = cx - hw; pos[o + 1] = y; pos[o + 2] = cz; pos[o + 3] = cx + hw; pos[o + 4] = y; pos[o + 5] = cz; } else { pos[o] = cx; pos[o + 1] = y; pos[o + 2] = cz - hw; pos[o + 3] = cx; pos[o + 4] = y; pos[o + 5] = cz + hw; }
    }
    g.attributes.position.needsUpdate = true;
  } };
}
/* a paper lantern (chochin): ribbed paper body that glows, black lacquer caps, a hanging ring. Origin = centre of the body. */
function makeChochin(w = 0.36, h = 0.5, glow = 0.7, scene = null) {
  const g = new THREE.Group(); const pts = [];
  for (let j = 0; j <= 12; j++) { const t = j / 12; pts.push([(w / 2) * (0.5 + 0.5 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.6)), (t - 0.5) * h * 0.9]); }
  const tex = paperTex(11);
  const paper = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xff9a50, emissiveMap: tex, emissiveIntensity: glow, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.1 }); if (scene && scene.environment) paper.envMap = scene.environment;
  mesh(g, lathe(pts, 14), paper, { cast: false, recv: false });
  const cap = (y) => at(cylY(w * 0.3, w * 0.3, h * 0.07, 10), 0x15110f, 0, y, 0);
  const capsMat = std(scene || {}, { vertexColors: true, roughness: 0.45, envMapIntensity: 0.4 });
  const caps = [cap(h * 0.45 - h * 0.01), cap(-h * 0.45 - h * 0.06), at(new THREE.TorusGeometry(w * 0.08, 0.008, 5, 10), 0x15110f, 0, h * 0.45 + h * 0.1, 0)];
  mesh(g, solid(caps), capsMat, { cast: false, recv: false });
  return { group: g, paper, h };
}
const ironRing = (r, t, hex = 0x2b2825, x = 0, y = 0, z = 0, rot) => at(new THREE.TorusGeometry(r, t, 5, 12), hex, x, y, z, { r: rot || [0, 0, 0] });
/* an instanced pool of pale wood splinters (local space) */
function makeSplinters(N = 48) {
  const geo = new THREE.BoxGeometry(0.024, 0.024, 0.15); const mat = new THREE.MeshStandardMaterial({ color: 0xd8bb88, roughness: 0.9, envMapIntensity: 0.2 });
  const im = new THREE.InstancedMesh(geo, mat, N); im.frustumCulled = false; im.count = N;
  const st = { p: new Float32Array(N * 3), v: new Float32Array(N * 3), r: new Float32Array(N * 3), w: new Float32Array(N * 3), life: new Float32Array(N), next: 0, any: false };
  const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < N; i++) im.setMatrixAt(i, z);
  const burst = (n, px, py, pz, dx, dy, dz, power = 1, spread = 1) => {
    for (let k = 0; k < n; k++) {
      const i = st.next; st.next = (st.next + 1) % N; const o = i * 3;
      st.p[o] = px + (R() - 0.5) * 0.08; st.p[o + 1] = py + (R() - 0.5) * 0.1; st.p[o + 2] = pz + (R() - 0.5) * 0.08;
      st.v[o] = dx * power * (0.5 + R()) + (R() - 0.5) * 1.3 * spread; st.v[o + 1] = dy * power + 0.8 + R() * 1.6 * power; st.v[o + 2] = dz * power * (0.5 + R()) + (R() - 0.5) * 1.3 * spread;
      st.r[o] = R() * TAU; st.r[o + 1] = R() * TAU; st.r[o + 2] = R() * TAU; st.w[o] = (R() - 0.5) * 18; st.w[o + 1] = (R() - 0.5) * 18; st.w[o + 2] = (R() - 0.5) * 18; st.life[i] = 1.4 + R() * 0.9;
    }
    st.any = true;
  };
  const update = (dt) => {
    if (!st.any) return; let live = false;
    for (let i = 0; i < N; i++) {
      if (st.life[i] <= 0) continue; const o = i * 3; st.life[i] -= dt; live = true;
      if (st.p[o + 1] > 0.025) { st.v[o + 1] -= 9.8 * dt; st.p[o] += st.v[o] * dt; st.p[o + 1] += st.v[o + 1] * dt; st.p[o + 2] += st.v[o + 2] * dt; st.r[o] += st.w[o] * dt; st.r[o + 1] += st.w[o + 1] * dt; st.r[o + 2] += st.w[o + 2] * dt; if (st.p[o + 1] <= 0.025) { st.p[o + 1] = 0.025; st.r[o] = 0; st.r[o + 2] = 0; } }
      const s = st.life[i] > 0.4 ? 1 : Math.max(0, st.life[i] / 0.4);
      _e.set(st.r[o], st.r[o + 1], st.r[o + 2]); _q.setFromEuler(_e); _m.compose(_p.set(st.p[o], st.p[o + 1], st.p[o + 2]), _q, _s.set(s, s, s)); im.setMatrixAt(i, _m);
    }
    im.instanceMatrix.needsUpdate = true; st.any = live;
  };
  return { mesh: im, burst, update };
}

/* ================================================================ ANCHOR: the chain post */
const LINKS = 240, PITCH = 0.165;
/* Three different chained things, so one quest never asks to break the same prop three times:
   - 'stake' (the walk, chains running to the cage close by): a wooden stake bound with shimenawa and shide;
   - 'edict' (chapter II, chains running to the horizon): the lord's kosatsu, a roofed edict board on a post; cutting it
     down is open defiance;
   - 'banner' (chapter III, the Lord bound to his posts: a boss on the field, or the 4th and 5th anchor of the fight): his war
     banner pole, a tall nobori with his mon on a stone-weighted post; when it breaks the banner comes down. */
const anchorKind = (to, index) => {
  /* the fight's chains run to its HORIZON point, 15 m up; a walk's chains run to the cage top, about 2 m up */
  const far = !to || to.y > 8; if (!far) return 'stake';
  const f = globalThis.__sq?.fight; const boss = f?.bossFoe && f.bossFoe.state !== 'dead';
  return boss || index >= 3 ? 'banner' : 'edict';
};
const edictTex = () => ctex(128, 96, (g, w, h) => {
  g.fillStyle = '#d8ceb4'; g.fillRect(0, 0, w, h); const r = rng(31); for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(120,96,60,${0.05 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  g.fillStyle = '#1a1612'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 22px 'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif`; g.fillText('定', w * 0.5, 16);
  g.font = `500 11px 'Shippori Mincho', 'Hiragino Mincho ProN', serif`;
  for (let c = 0; c < 8; c++) for (let k = 0; k < 5; k++) if (r() < 0.85) g.fillText('一年貢米田村法度'[(c + k * 3) % 8], w - 14 - c * 14, 38 + k * 12);
  g.fillStyle = '#9c2c1c'; g.fillRect(10, h - 22, 13, 13);
});
const lordBannerTex = () => ctex(64, 256, (g, w, h) => {
  g.fillStyle = '#141216'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a1a14'; g.fillRect(0, 0, w, 16);
  g.strokeStyle = '#e8e0cc'; g.fillStyle = '#e8e0cc'; g.lineWidth = 3; g.beginPath(); g.arc(32, 64, 22, 0, TAU); g.stroke();
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3 - Math.PI / 2; g.beginPath(); g.arc(32 + Math.cos(a) * 7, 64 + Math.sin(a) * 7, 6, 0, TAU); g.fill(); g.lineWidth = 4; g.beginPath(); g.arc(32, 64, 13, a + 0.2, a + 1.6); g.stroke(); }
});
export function anchor(scene, { to, index = 0 } = {}) {
  R = rng(11 + index * 7);
  const kind = anchorKind(to, index);
  const group = new THREE.Group(); scene.add(group);
  const toV = to || new V3(0, 2.2, -14);
  const wood = woodMat(scene, 3 + index); const iron = ironMat(scene);
  const H = 2.55, SPLIT = 0.95; const rAt = (y) => lerp(0.2, 0.15, clamp(y / H, 0, 1));
  const woodC = kind === 'stake' ? 0x8e6e48 : kind === 'edict' ? 0x6a5640 : 0x2a2220;
  const mk = (geo, mat, parent, o) => mesh(parent, geo, mat, o);
  /* the mound of stones at the foot */
  const stones = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + R() * 0.4; const rr = 0.27 + R() * 0.12; stones.push(at(rockGeo(0.09 + R() * 0.07, i * 13), 0x6c675e, Math.cos(a) * rr, 0.04, Math.sin(a) * rr, { jit: 0.15, r: [0, R() * 3, 0] })); }
  mk(solid(stones), stoneMat(scene, 6), group);
  const pivot = new THREE.Group(); pivot.position.y = SPLIT; group.add(pivot);
  const inner = new THREE.Group(); inner.position.y = -SPLIT; pivot.add(inner);
  const post = mk(solid([at(logGeo(0, H, 0.2, 0.15, { jagTop: 0.05, seed: 3 + index }), woodC, 0, 0, 0, { jit: 0.06 })]), wood, inner);
  const top = mk(solid([at(logGeo(SPLIT - 0.12, H, rAt(SPLIT - 0.12), 0.15, { jagBot: 0.34, jagTop: 0.05, seed: 9 + index }), woodC, 0, 0, 0, { jit: 0.06 })]), wood, inner); top.visible = false;
  const stump = mk(solid([at(logGeo(0, SPLIT + 0.12, 0.2, rAt(SPLIT + 0.12), { jagTop: 0.36, seed: 17 + index }), woodC, 0, 0, 0, { jit: 0.06 })]), wood, group); stump.visible = false;
  /* shimenawa: a thick twisted rope wound three times round the post */
  const rp = []; for (let j = 0; j <= 54; j++) { const f = j / 54; const th = f * TAU * 2.7 + index; const y = 1.34 + 0.36 * f + Math.sin(f * 17) * 0.015; const rr = rAt(y) + 0.045; rp.push(new V3(Math.cos(th) * rr, y, Math.sin(th) * rr)); }
  const ropeM = std(scene, { map: ropeTex(), roughness: 0.95, envMapIntensity: 0.15 });
  if (kind === 'stake') mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp), 110, 0.052, 6, false), ropeM, inner);
  /* shide: white zigzag paper strips hanging from the rope */
  const sh = []; for (let k = 0; k < 6; k++) { const th = k * (TAU / 6) + 0.3 + index; const rr = rAt(1.3) + 0.075; sh.push(at(shideGeo(0.12, 0.46, 5), 0xf0ece0, Math.cos(th) * rr, 1.3, Math.sin(th) * rr, { r: [0, -th + Math.PI / 2, 0] })); }
  const shideM = std(scene, { vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.15 });
  const shide = mk(solid(sh), shideM, inner, { cast: false }); shide.visible = kind === 'stake';
  /* the edict board: a roofed kosatsu on top of the post, the lord's law in brush ink, a red seal; two iron bands */
  let flag = null;
  if (kind === 'edict') {
    const fr = []; const BW = 1.05, BH = 0.72, BY = 1.72;
    fr.push(at(new THREE.BoxGeometry(BW + 0.1, 0.07, 0.09), 0x4a3a2a, 0, BY - 0.04, 0.12), at(new THREE.BoxGeometry(BW + 0.1, 0.07, 0.09), 0x4a3a2a, 0, BY + BH + 0.04, 0.12));
    for (const sx of [-1, 1]) fr.push(at(new THREE.BoxGeometry(0.07, BH + 0.16, 0.09), 0x4a3a2a, sx * (BW / 2 + 0.02), BY + BH / 2, 0.12));
    /* the little gabled roof */
    for (const sx of [-1, 1]) fr.push(at(new THREE.BoxGeometry(BW + 0.4, 0.04, 0.42), 0x2a2420, sx * 0.0, BY + BH + 0.2, 0.12 + sx * 0.14, { r: [sx * 0.55, 0, 0] }));
    fr.push(at(new THREE.BoxGeometry(BW + 0.44, 0.06, 0.06), 0x1c1816, 0, BY + BH + 0.31, 0.12));
    for (const y of [1.2, 1.5]) fr.push(at(cylY(rAt(y) + 0.012, rAt(y) + 0.012, 0.06, 12), 0x2b2825, 0, y, 0));
    mk(solid(fr), wood, inner);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), std(scene, { map: edictTex(), roughness: 0.9, envMapIntensity: 0.15 })); bm.position.set(0, BY + BH / 2, 0.168); bm.castShadow = true; inner.add(bm);
    const back = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, 0.04), wood); back.position.set(0, BY + BH / 2, 0.14); inner.add(back);
  }
  /* the war banner pole: the post goes on up to 5.6 m, a cross arm at the top, his black nobori with the white mon; a
     ring of fist-sized stones weighs the foot; iron bands */
  if (kind === 'banner') {
    const fr = [at(cylY(0.07, 0.09, 3.1, 8), 0x1e1a18, 0, H - 0.05, 0, { jit: 0.05 }), at(cylY(0.03, 0.03, 0.78, 6), 0x1e1a18, 0.39, H + 2.92, 0, { r: [0, 0, Math.PI / 2] })];
    for (const y of [1.2, 1.6, 2.4]) fr.push(at(cylY(rAt(y) + 0.014, rAt(y) + 0.014, 0.07, 12), 0x2b2825, 0, y, 0));
    mk(solid(fr), wood, inner);
    flag = makeBanner(0.76, 2.9, lordBannerTex()); flag.mesh.position.set(0.02, H + 2.9, 0.0); flag.mesh.material.emissiveIntensity = 0.08; inner.add(flag.mesh);
  }
  /* the iron collar and the eye the chain hangs from; the ring turns to face the chain */
  const ringPivot = new THREE.Group(); ringPivot.position.y = 1.08; inner.add(ringPivot);
  mk(solid([at(cylY(rAt(1.08) + 0.02, rAt(1.08) + 0.02, 0.1, 14), 0x2b2825, 0, -0.05, 0), ironRing(0.075, 0.019, 0x2b2825, rAt(1.08) + 0.085, 0, 0), at(boxY(0.06, 0.06, 0.05), 0x2b2825, rAt(1.08) + 0.02, -0.03, 0)]), iron, ringPivot);
  const eye = new V3(rAt(1.08) + 0.16, 0, 0);
  /* the gashes a blow leaves: four slots, shown one by one */
  const gashGeo = solid([at(new THREE.BoxGeometry(0.11, 0.34, 0.04), 0xe6c890, 0, 0, 0, { r: [0, 0, 0.12] }), at(new THREE.BoxGeometry(0.028, 0.28, 0.05), 0x24170f, 0.01, 0, 0.002, { r: [0, 0, -0.1] }), at(new THREE.BoxGeometry(0.07, 0.1, 0.045), 0xf0d6a4, -0.05, 0.12, 0.004, { r: [0, 0, 0.5] })]);
  const gashes = new THREE.InstancedMesh(gashGeo, wood, 5); gashes.frustumCulled = false; { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < 5; i++) gashes.setMatrixAt(i, z); } inner.add(gashes);
  const spl = makeSplinters(48); group.add(spl.mesh);
  /* the chain: one instanced mesh of iron links, laid in update from the ring to `to` */
  const linkG = at(new THREE.TorusGeometry(0.062, 0.0175, 4, 8).scale(1.6, 1, 1), 0x2c2926, 0, 0, 0);
  const chain = new THREE.InstancedMesh(linkG, iron, LINKS); chain.frustumCulled = false; chain.count = 0; chain.castShadow = true; group.add(chain);
  const _A = new V3(), _B = new V3(), _P = new V3(), _Q = new V3(), _T = new V3(), _N = new V3(), _Bn = new V3(), _up = new V3(0, 1, 0), _inv = new THREE.Matrix4(), _lm = new THREE.Matrix4(), _lp = new V3(), _d = new V3(), _ax = new V3(), _hd = new V3();
  const H_ = { group, height: 1.4, hp: 1 };
  let hits = 0, shake = 0, t = 0, broken = false, tb = 0, th = 0, om = 0, slack = 0, bumpSag = 0, dirDirty = true, lastKey = NaN, hold = 0, lastYaw = 99;
  const sagAt = (D) => Math.min(1.7, 0.05 * D + 0.12);
  function lay() {
    group.updateWorldMatrix(true, true); _inv.copy(group.matrixWorld).invert();
    const gy = group.matrixWorld.elements[13];
    _A.copy(eye); ringPivot.localToWorld(_A); _B.copy(toV);
    let D = _A.distanceTo(_B); const far = D > 35; if (far) { _B.sub(_A).normalize().multiplyScalar(28).add(_A); D = 28; }
    const n = clamp(Math.round(D / PITCH), 4, LINKS); const sag = sagAt(D) * (1 + slack * 0.6) + bumpSag + slack * D * 0.18;
    const pos = (f, out) => { out.lerpVectors(_A, _B, f); out.y -= sag * 4 * f * (1 - f); if (out.y < gy + 0.06) out.y = gy + 0.06; return out; };
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n; pos(f, _P); pos(Math.min(1, f + 0.5 / n), _Q); pos(Math.max(0, f - 0.5 / n), _T); _T.subVectors(_Q, _T).normalize();
      _N.crossVectors(_up, _T); if (_N.lengthSq() < 1e-4) _N.set(1, 0, 0); _N.normalize(); _Bn.crossVectors(_T, _N).normalize();
      _P.applyMatrix4(_inv); _T.transformDirection(_inv); _N.transformDirection(_inv); _Bn.transformDirection(_inv);
      if (i % 2) _lm.makeBasis(_T, _Bn, _N.negate()); else _lm.makeBasis(_T, _N, _Bn);
      const fade = far ? 1 - sm(0.6, 1, f) * 0.95 : 1; _lm.scale(_s.setScalar(Math.max(0.01, fade))); _lm.setPosition(_P); chain.setMatrixAt(i, _lm);
    }
    chain.count = n; chain.instanceMatrix.needsUpdate = true;
  }
  H_.update = (dt) => {
    t += dt; if (shake > 0.01) { shake *= Math.exp(-5 * dt); } else shake = 0;
    if (!broken) { pivot.rotation.x = Math.sin(t * 42) * shake * 0.022; pivot.rotation.z = Math.cos(t * 37) * shake * 0.022 + (1 - H_.hp) * 0.035; }
    shide.rotation.y = Math.sin(t * 1.3) * 0.03 + Math.sin(t * 38) * shake * 0.12; if (flag) flag.update(t, index);
    bumpSag = shake * 0.12;
    if (broken) {
      tb += dt;
      if (th < 1.42 || Math.abs(om) > 0.05) {
        om += 9 * Math.sin(th + 0.1) * dt; th += om * dt;
        if (th >= 1.42) { th = 1.42; om = -om * 0.28; if (Math.abs(om) < 0.35) om = 0; }
        const f = Math.pow(clamp(th / 1.42, 0, 1), 2); pivot.quaternion.setFromAxisAngle(_ax, th); pivot.position.set(_hd.x * f * 0.9, lerp(SPLIT, 0.17, f), _hd.z * f * 0.9);
      }
      slack = sm(0.2, 1.6, tb);
    }
    _d.copy(toV); _d.sub(group.position); const yaw = Math.atan2(-_d.z, _d.x) - group.rotation.y;
    if (Math.abs(yaw - lastYaw) > 1e-3) { ringPivot.rotation.y = yaw - (broken ? pivot.rotation.y : 0); lastYaw = yaw; dirDirty = true; }
    group.updateWorldMatrix(true, true); _A.copy(eye); ringPivot.localToWorld(_A);
    const key = _A.x * 1.3 + _A.y * 7.1 + _A.z * 2.9 + toV.x * 0.7 + toV.y * 3.3 + toV.z * 1.7 + group.position.x * 0.31 + bumpSag * 5 + slack * 9;
    if (key !== lastKey || dirDirty || broken) { lay(); lastKey = key; dirDirty = false; }
    spl.update(dt);
  };
  H_.hit = (k, point, dir) => {
    H_.hp = clamp(k, 0, 1); shake = 1; group.updateWorldMatrix(true, false);
    _hd.copy(point); group.worldToLocal(_hd); const y = [0.75, 1.98, 1.02, 2.18, 0.58][hits % 5] + (R() - 0.5) * 0.12; /* slots clear of the rope and the shide */ let nx = _hd.x, nz = _hd.z; const nl = Math.hypot(nx, nz); if (nl < 1e-3) { nx = 0; nz = 1; } else { nx /= nl; nz /= nl; } { const oa = (R() - 0.5) * 0.7, c = Math.cos(oa), sn = Math.sin(oa); const rx = nx * c - nz * sn; nz = nx * sn + nz * c; nx = rx; }
    const r = rAt(y) + 0.012; _e.set(0, 0, (R() - 0.5) * 1.5); _q.setFromEuler(_e); const yq = new THREE.Quaternion().setFromAxisAngle(_up, Math.atan2(nx, nz)); yq.multiply(_q);
    _m.compose(_p.set(nx * r, y, nz * r), yq, _s.set(0.8 + R() * 0.5, 0.7 + R() * 0.6, 1)); gashes.setMatrixAt(hits % 5, _m); gashes.instanceMatrix.needsUpdate = true; hits++;
    _d.copy(dir).applyAxisAngle(_up, -group.rotation.y);
    spl.burst(8, nx * r, y, nz * r, -_d.x * 0.6 + nx * 0.8, 0.4, -_d.z * 0.6 + nz * 0.8, 1, 1);
  };
  H_.break = (dir) => {
    if (broken) return 1.8; broken = true; tb = 0; th = 0.12; om = 0.25; slack = 0;
    _hd.set(dir ? dir.x : 0, 0, dir ? dir.z : -1).applyAxisAngle(_up, -group.rotation.y); if (_hd.lengthSq() < 1e-4) _hd.set(0, 0, -1); _hd.normalize(); _ax.crossVectors(_up, _hd).normalize();
    post.visible = false; top.visible = true; stump.visible = true;
    const px = _hd.x, pz = _hd.z; spl.burst(14, 0, SPLIT, 0, px, 0.3, pz, 1.2, 1.4); spl.burst(12, 0, SPLIT + 0.2, 0, -px * 0.4, 0.5, -pz * 0.4, 1.0, 1.6); shake = 1; return 1.8;
  };
  H_.dispose = () => disposeTree(group);
  H_.update(0); return H_;
}

/* ================================================================ CAGE: lashed bamboo */
export function cage(scene) {
  R = rng(77);
  const group = new THREE.Group(); scene.add(group);
  const W = 1.7, D = 1.5, H = 2.15; const BAM = 0x8f9558, ROPE = 0x6e5834; const bam = woodMat(scene, 12, { roughness: 0.62, envMapIntensity: 0.4 });
  const body = [], door = [];
  const bar = (list, a, b, r = 0.026, hex = BAM) => list.push(pole(a, b, r, hex, { jit: 0.1 }));
  const band = (list, x, y, z, ax) => list.push(at(cylY(0.04, 0.04, 0.034, 6), ROPE, x, y - 0.017, z, { r: ax === 'x' ? [0, 0, Math.PI / 2] : ax === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0], jit: 0.12 }));
  const rails = [0.12, 0.7, 1.3, 1.95];
  /* corner posts, thick, with nodes */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = (sx * W) / 2, z = (sz * D) / 2; bar(body, [x, 0, z], [x, H + 0.12, z], 0.05, 0x9a9a5a); for (let y = 0.3; y < H; y += 0.42) body.push(at(cylY(0.058, 0.058, 0.03, 7), 0x7a7a46, x, y, z)); }
  const side = (x0, z0, x1, z1, skip) => {
    const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(2, Math.round(len / 0.165)); const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z';
    for (let i = 1; i < n; i++) { const f = i / n; const x = lerp(x0, x1, f), z = lerp(z0, z1, f); if (skip && skip(x, z)) continue; bar(body, [x, 0, z], [x, H, z]); for (const y of rails) band(body, x, y, z, ax); }
    for (const y of rails) bar(body, [x0, y, z0], [x1, y, z1], 0.034, 0xa09a5a);
  };
  side(-W / 2, D / 2, W / 2, D / 2); side(-W / 2, -D / 2, -W / 2, D / 2); side(W / 2, -D / 2, W / 2, D / 2);
  side(-W / 2, -D / 2, W / 2, -D / 2, (x) => Math.abs(x) < 0.47);
  /* the roof grid, a ridge pole and the eye the chains attach to */
  for (let i = 0; i <= 8; i++) { const z = lerp(-D / 2, D / 2, i / 8); bar(body, [-W / 2 - 0.08, H + 0.05, z], [W / 2 + 0.08, H + 0.05, z], 0.03, 0xa4a05c); }
  for (const x of [-0.6, 0, 0.6]) bar(body, [x, H + 0.1, -D / 2 - 0.06], [x, H + 0.1, D / 2 + 0.06], 0.036, 0x969a58);
  body.push(at(cylY(0.05, 0.05, 0.2, 7), 0x8c8c52, 0, H + 0.1, 0)); body.push(ironRing(0.1, 0.022, 0x2b2825, 0, H + 0.34, 0), at(cylY(0.07, 0.07, 0.05, 8), 0x2b2825, 0, H + 0.28, 0));
  for (const x of [-0.6, 0, 0.6]) band(body, x, H + 0.13, 0, 'z');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.push(at(boxY(0.14, 0.05, 0.14), 0x4a3c2a, sx * W / 2, -0.02, sz * D / 2));
  mesh(group, solid(body), bam);
  /* the door: hinged at the left (x = -0.45), swings out toward -z */
  const dw = 0.9, dh = 1.88; const dp = new THREE.Group(); dp.position.set(-0.45, 0, -D / 2); group.add(dp);
  const hing = (a, b, r = 0.03, hex = BAM) => door.push(pole(a, b, r, hex, { jit: 0.1 }));
  hing([0, 0.02, 0], [0, dh, 0], 0.045, 0x9a9a5a); hing([dw, 0.02, 0], [dw, dh, 0], 0.045, 0x9a9a5a);
  for (let i = 1; i < 6; i++) { const x = (dw * i) / 6; hing([x, 0.02, 0], [x, dh, 0]); for (const y of [0.3, 1.0, 1.7]) door.push(at(cylY(0.04, 0.04, 0.034, 6), ROPE, x, y - 0.017, 0, { r: [0, 0, Math.PI / 2] })); }
  for (const y of [0.3, 1.0, 1.7]) hing([0, y, 0], [dw, y, 0], 0.034, 0xa09a5a);
  hing([-0.03, dh - 0.02, 0], [dw + 0.03, dh - 0.02, 0], 0.035, 0xa09a5a);
  door.push(at(boxY(0.12, 0.05, 0.07), 0x3a2e22, dw - 0.04, 1.0, -0.05), at(boxY(0.05, 0.3, 0.06), 0x2b2825, dw - 0.05, 0.9, -0.045), ironRing(0.06, 0.016, 0x2b2825, dw - 0.05, 0.74, -0.06));
  mesh(dp, solid(door), bam);
  /* a straw mat on the ground inside */
  const straw = std(scene, { map: strawTex(2), roughness: 1, envMapIntensity: 0.1 }); const mat = mesh(group, new THREE.BoxGeometry(W - 0.12, 0.05, D - 0.12), straw, { cast: false }); mat.position.y = 0.025;
  const topV = new V3(0, H + 0.33, 0);
  let t = 0, ot = -1, ang = 0;
  const H_ = { group, top: topV, update(dt) { t += dt; if (ot >= 0) { ot += dt; const x = 1 - Math.exp(-4.5 * ot) * Math.cos(8 * ot); ang = 1.95 * x; dp.rotation.y = ang; } }, open() { ot = 0; return 1.4; }, dispose() { disposeTree(group); } };
  return H_;
}

/* ================================================================ BEACON: stone toro */
export function beacon(scene, { index = 0 } = {}) {
  R = rng(40 + index * 5);
  const group = new THREE.Group(); scene.add(group); const GR = 0x9a978f;
  const stone = stoneMat(scene, 5 + index);
  const P = [];
  P.push(at(new THREE.CylinderGeometry(0.66, 0.72, 0.14, 6), GR, 0, 0.07, 0, { jit: 0.06, flat: true }));
  P.push(at(new THREE.CylinderGeometry(0.47, 0.55, 0.24, 6), GR, 0, 0.26, 0, { jit: 0.06, flat: true, r: [0, 0.3, 0] }));
  P.push(at(new THREE.CylinderGeometry(0.15, 0.185, 1.18, 10), GR, 0, 0.9, 0, { jit: 0.05 }));
  P.push(at(new THREE.TorusGeometry(0.2, 0.05, 6, 12), 0x8d8a82, 0, 0.98, 0, { r: [Math.PI / 2, 0, 0] }));
  P.push(at(new THREE.CylinderGeometry(0.5, 0.36, 0.14, 6), GR, 0, 1.56, 0, { jit: 0.06, flat: true, r: [0, 0.3, 0] }), at(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 6), 0x8d8a82, 0, 1.66, 0, { flat: true, r: [0, 0.3, 0] }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(at(boxY(0.1, 0.62, 0.1), GR, sx * 0.3, 1.69, sz * 0.3, { jit: 0.05 }));
  P.push(at(boxY(0.8, 0.1, 0.8), GR, 0, 2.31, 0, { jit: 0.05 }));
  P.push(at(lathe([[0.04, 0.56], [0.1, 0.5], [0.26, 0.34], [0.48, 0.18], [0.78, 0.07], [1.0, 0.04], [1.1, 0.11], [1.06, 0.0], [0.82, -0.02], [0.4, 0.0], [0.0, 0.0]], 6), 0x8f8c84, 0, 2.41, 0, { flat: true, jit: 0.03, r: [0, 0.52, 0] }));
  P.push(at(new THREE.ConeGeometry(0.1, 0.1, 8), GR, 0, 3.0, 0), at(new THREE.SphereGeometry(0.095, 10, 8), 0xa09d95, 0, 3.12, 0));
  mesh(group, solid(P), stone);
  const paperM = std(scene, { color: 0x2a2018, emissive: 0xffa24c, emissiveIntensity: 0, roughness: 1, envMapIntensity: 0.1 });
  const pb = mesh(group, new THREE.BoxGeometry(0.5, 0.56, 0.5), paperM, { cast: false }); pb.position.y = 1.97;
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })); ember.position.y = 1.72; group.add(ember); ember.visible = false;
  const flame = makeFlame(0.3, 0.46); flame.mesh.position.y = 1.72; group.add(flame.mesh);
  const smoke = makeSmoke(2.6, 0.07, 14, 0.35); smoke.mesh.position.y = 2.2; group.add(smoke.mesh);
  const light = new THREE.PointLight(0xffa860, 0, 18, 1.7); light.position.set(0, 2.0, 0); group.add(light);
  let t = 0, ramp = 0, forced = false;
  return { group,
    update(dt, st = {}) {
      t += dt; const L = forced || !!st.lit; ramp = clamp(ramp + (L ? dt / 1.0 : -dt / 0.5), 0, 1); const charge = clamp(st.charge || 0, 0, 1);
      const em = L ? 0 : charge * (0.7 + 0.3 * Math.sin(t * 5 + Math.sin(t * 1.7) * 2));
      ember.visible = em > 0.02; if (ember.visible) ember.material.color.setRGB(0.85 * em, 0.26 * em, 0.05 * em);
      flame.set(ramp, t, index);
      paperM.emissiveIntensity = Math.max(ramp * 0.62 * (0.92 + 0.08 * Math.sin(t * 11)), em * 0.18);
      light.intensity = ramp * 12 * (0.92 + 0.08 * Math.sin(t * 13 + 1) + 0.04 * Math.sin(t * 31));
      smoke.update(t, L ? ramp * 0.07 : clamp(charge * 1.6, 0, 0.55) * 0.55);
    },
    light() { forced = true; return 1.0; }, dispose() { disposeTree(group); } };
}

/* ================================================================ KINDLING: a charcoal basket */
export function kindling(scene) {
  R = rng(91);
  const group = new THREE.Group(); scene.add(group);
  const cane = woodMat(scene, 21, { roughness: 0.85 }); const parts = [];
  const rb = (y) => lerp(0.19, 0.27, y / 0.34);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; parts.push(pole([Math.cos(a) * rb(0), 0.0, Math.sin(a) * rb(0)], [Math.cos(a) * rb(0.34), 0.34, Math.sin(a) * rb(0.34)], 0.011, 0xb08c58, { jit: 0.15, seg: 4 })); }
  for (const y of [0.04, 0.12, 0.2, 0.28]) parts.push(at(new THREE.TorusGeometry(rb(y) + 0.008, 0.009, 4, 24), 0x8a6a40, 0, y, 0, { r: [Math.PI / 2, 0, 0], jit: 0.1 }));
  parts.push(at(new THREE.TorusGeometry(rb(0.34) + 0.01, 0.02, 5, 24), 0x7a5c36, 0, 0.345, 0, { r: [Math.PI / 2, 0, 0] }), at(new THREE.CircleGeometry(0.2, 14).rotateX(-Math.PI / 2), 0x4a3522, 0, 0.02, 0));
  parts.push(at(new THREE.TorusGeometry(0.27, 0.014, 4, 18, Math.PI), 0xcdb890, 0, 0.345, 0, { s: [1, 0.62, 1] }));
  mesh(group, solid(parts), cane);
  const coal = [];
  coal.push(at(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 12), 0x0d0c0b, 0, 0.32, 0));
  for (let i = 0; i < 20; i++) { const a = R() * TAU, r = Math.sqrt(R()) * 0.2; const L = 0.14 + R() * 0.12; const tilt = 0.25 + R() * 0.8; coal.push(at(new THREE.CylinderGeometry(0.014 + R() * 0.012, 0.022 + R() * 0.014, L, 5), R() < 0.3 ? 0x2a2a2c : 0x0f0e0d, Math.cos(a) * r, 0.34 + R() * 0.05, Math.sin(a) * r, { r: [Math.cos(a) * tilt, R() * TAU, Math.sin(a) * tilt], jit: 0.35 })); }
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; coal.push(at(rockGeo(0.035, i), 0x1e1c1a, Math.cos(a) * 0.38, 0.025, Math.sin(a) * 0.38, { jit: 0.3 })); }
  mesh(group, solid(coal), std(scene, { vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.12 }));
  group.scale.setScalar(1.3);
  return { group, update() {}, dispose() { disposeTree(group); } };
}

/* ================================================================ MARKER: a kosatsu notice board */
export function marker(scene, { name = 'Rowan', serif } = {}) {
  R = rng(55);
  const group = new THREE.Group(); scene.add(group);
  const wood = woodMat(scene, 31); const P = []; const WD = 0x5e4932, DK = 0x3d2f22;
  for (const sx of [-1, 1]) P.push(at(boxY(0.13, 1.92, 0.13), WD, sx * 0.54, 0, 0, { jit: 0.07 }));
  P.push(at(boxY(1.28, 0.1, 0.1), DK, 0, 1.0, -0.01), at(boxY(1.3, 0.09, 0.12), DK, 0, 0.66, 0)); /* two cross rails */
  P.push(at(boxY(1.0, 0.74, 0.06), 0x7a6444, 0, 0.98, 0.04, { jit: 0.04 })); /* the board */
  /* a small tiled roof: two slabs and a ridge */
  for (const s of [-1, 1]) P.push(at(boxY(1.46, 0.06, 0.42), 0x34323a, 0, 1.95, s * 0.17, { r: [s * 0.5, 0, 0], jit: 0.06 }));
  P.push(at(boxY(1.5, 0.09, 0.1), 0x26242a, 0, 2.08, 0));
  const wm = mesh(group, solid(P), wood);
  const stones = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + R() * 0.3; stones.push(at(rockGeo(0.07 + R() * 0.05, i * 7), 0x6c675e, Math.cos(a) * 0.62 + (i % 2) * 0.1, 0.03, Math.sin(a) * 0.3, { jit: 0.15 })); }
  mesh(group, solid(stones), stoneMat(scene, 9));
  /* the washi sheet, blank until carve() */
  const sheet = mesh(group, new THREE.PlaneGeometry(0.92, 0.68), std(scene, { color: 0xe4d9bd, emissive: 0xe4d9bd, emissiveIntensity: 0.06, roughness: 0.95, envMapIntensity: 0.1 }), { cast: false }); sheet.position.set(0, 0.98, 0.075);
  const fam = serif || "'Shippori Mincho', 'Hiragino Mincho ProN', serif";
  const tex = ctex(1024, 756, (g, w, h) => {
    g.clearRect(0, 0, w, h); let size = 300; g.font = `700 ${size}px ${fam}`; const tw = g.measureText(String(name)).width; if (tw > w * 0.84) { size = Math.floor(size * (w * 0.84) / tw); g.font = `700 ${size}px ${fam}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [dx, dy, a] of [[3, 2, 0.5], [-2, 1, 0.5], [0, 0, 1], [1, -2, 0.7]]) { g.fillStyle = `rgba(18,14,11,${a})`; g.fillText(String(name), w / 2 + dx, h * 0.4 + dy); }
    g.fillStyle = 'rgba(18,14,11,0.9)'; g.fillRect(w * 0.18, h * 0.66, w * 0.64, 7);
    g.fillStyle = '#b8321e'; g.fillRect(w * 0.72, h * 0.73, 96, 96); g.fillStyle = '#efe3c8'; g.font = `700 74px ${fam}`; g.fillText('勝', w * 0.72 + 48, h * 0.73 + 52);
  });
  const uRev = { value: 0 };
  const inkM = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, envMapIntensity: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
  inkM.onBeforeCompile = (sh) => { sh.uniforms.uRev = uRev; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRev;').replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.a *= 1.0 - smoothstep(uRev * 1.2 - 0.2, uRev * 1.2, vMapUv.x);'); };
  inkM.customProgramCacheKey = () => 'edo-ink';
  const ink = mesh(group, new THREE.PlaneGeometry(0.92, 0.68), inkM, { cast: false }); ink.position.set(0, 0.98, 0.079); ink.renderOrder = 3;
  let ct = -1; void wm;
  return { group, update(dt) { if (ct >= 0) { ct = Math.min(1.5, ct + dt); const x = ct / 1.5; uRev.value = x * x * (3 - 2 * x); } }, carve() { ct = 0; return 1.5; }, dispose() { disposeTree(group); } };
}

/* ================================================================ GATE: a vermilion torii */
/* the glory walk ends at a CASTLE gate (yagura-mon), not a torii: a torii marks a shrine, and the chapter promises
   the castle's gate. Stone plinths, black timber posts and lintel, iron-studded doors swung open, a white plaster
   gatehouse with black lattice windows over it, a hipped tile roof with ridge ends, two lanterns hung under the lintel. */
export function gate(scene) {
  R = rng(63);
  const group = new THREE.Group(); scene.add(group);
  /* the journey turns the group's +z down the road, away from the hero: the face (mon, windows, the doors swung in) is built on +z and turned round */
  const body = new THREE.Group(); body.rotation.y = Math.PI; group.add(body);
  const W = 2.6; const BK = 0x1a1512; const WD = 0x2c2118; const ST = 0x6a665c; const PL = 0xe8e2d4; const TL = 0x2a2e33;
  const S = []; const T = []; const P = []; const L = []; const I = [];
  /* stone plinths (kirikomi-hagi blocks) and the low stone walls that run off each side */
  for (const s of [-1, 1]) {
    for (let y = 0; y < 3; y++) for (let k = 0; k < 3; k++) S.push(at(new THREE.BoxGeometry(0.62, 0.52, 1.5), ST, s * (W + 0.45 + k * 0.6), 0.26 + y * 0.53, 0, { jit: 0.12 }));
    for (let k = 0; k < 6; k++) for (let y = 0; y < 2; y++) S.push(at(new THREE.BoxGeometry(0.9, 0.5, 1.1), ST, s * (W + 2.4 + k * 0.92), 0.25 + y * 0.52, 0.1, { jit: 0.14 }));
    for (let k = 0; k < 6; k++) P.push(at(new THREE.BoxGeometry(0.9, 0.9, 0.9), PL, s * (W + 2.4 + k * 0.92), 1.48, 0.1, { jit: 0.03 }));
    for (let k = 0; k < 6; k++) T.push(at(new THREE.BoxGeometry(0.98, 0.14, 1.3), TL, s * (W + 2.4 + k * 0.92), 2.0, 0.1, { jit: 0.05 }));
  }
  /* the main posts, the back posts and the lintel */
  for (const s of [-1, 1]) { T.push(at(boxY(0.42, 4.3, 0.46), BK, s * W, 0, 0, { jit: 0.05 })); T.push(at(boxY(0.3, 3.9, 0.3), BK, s * W, 0, -1.6, { jit: 0.05 })); T.push(at(new THREE.BoxGeometry(0.22, 0.28, 1.9), BK, s * W, 3.2, -0.8)); }
  T.push(at(new THREE.BoxGeometry(2 * W + 1.4, 0.48, 0.5), BK, 0, 4.3, 0, { jit: 0.04 }));
  T.push(at(new THREE.BoxGeometry(2 * W + 1.0, 0.3, 0.36), BK, 0, 3.92, -1.6));
  /* the doors: two leaves swung in, planks with iron bands and studs */
  for (const s of [-1, 1]) {
    const ang = s * 1.25; const cx = s * W - Math.cos(ang) * s * 1.25; const cz = -Math.sin(Math.abs(ang)) * 1.25;
    T.push(at(boxY(2.5, 3.7, 0.14), WD, cx, 0.02, cz, { r: [0, -ang, 0], jit: 0.08 }));
    for (const y of [0.6, 1.9, 3.2]) { I.push(at(new THREE.BoxGeometry(2.5, 0.12, 0.17), 0x24201c, cx, y, cz, { r: [0, -ang, 0] })); for (let k = 0; k < 7; k++) { const u = -1.1 + k * 0.37; I.push(at(new THREE.SphereGeometry(0.04, 6, 4), 0x3a342c, cx + Math.cos(-ang) * u + Math.sin(-ang) * 0.09, y, cz - Math.sin(-ang) * u + Math.cos(-ang) * 0.09)); } }
  }
  /* the gatehouse: plaster walls, black base band and corner posts, lattice windows */
  const GW = 2 * W + 2.2; const GD = 3.0; const y0 = 4.55; const GH = 1.9;
  P.push(at(boxY(GW, GH, GD), PL, 0, y0, -0.7, { jit: 0.02 }));
  T.push(at(boxY(GW + 0.06, 0.5, GD + 0.06), BK, 0, y0, -0.7));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.push(at(boxY(0.2, GH, 0.2), BK, sx * GW / 2, y0, -0.7 + sz * GD / 2));
  for (let k = -2; k <= 2; k++) { if (k === 0) continue; T.push(at(new THREE.BoxGeometry(0.9, 0.6, 0.06), 0x14100e, k * 1.45, y0 + 1.15, -0.7 + GD / 2 + 0.03)); for (let b = 0; b < 5; b++) T.push(at(new THREE.BoxGeometry(0.05, 0.6, 0.08), BK, k * 1.45 - 0.36 + b * 0.18, y0 + 1.15, -0.7 + GD / 2 + 0.06)); }
  /* the roof: a hipped tile roof, wide eaves, a ridge and two tall ridge ends (shachi blocks) */
  const RY = y0 + GH; const RW = GW + 1.6; const RD = GD + 1.6;
  for (const sz of [-1, 1]) for (let k = 0; k < 6; k++) { const f = k / 6; L.push(at(new THREE.BoxGeometry(RW * (1 - f * 0.4), 0.26, RD / 2 * 0.34), TL, 0, RY + 0.15 + f * 1.25, -0.7 + sz * (RD / 2 - f * RD / 2 * 0.95 - RD * 0.07), { r: [sz * -0.5, 0, 0], jit: 0.06 })); }
  for (const sx of [-1, 1]) L.push(at(new THREE.BoxGeometry(0.16, 1.1, RD * 0.82), TL, sx * (RW / 2 - 0.9), RY + 0.6, -0.7, { r: [0, 0, sx * 0.62] }));
  L.push(at(new THREE.BoxGeometry(RW * 0.55, 0.3, 0.42), 0x1c1f22, 0, RY + 1.65, -0.7));
  for (const sx of [-1, 1]) L.push(at(new THREE.BoxGeometry(0.28, 0.75, 0.32), 0x8a7a3a, sx * RW * 0.27, RY + 2.0, -0.7, { r: [0, 0, sx * -0.25] }));
  /* eave ends: a band of round tile ends along the front */
  for (let k = 0; k < 30; k++) L.push(at(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8), 0x3a3e44, -RW / 2 + 0.2 + k * (RW - 0.4) / 29, RY + 0.07, -0.7 + RD / 2 + 0.02, { r: [Math.PI / 2, 0, 0] }));
  mesh(body, solid(S), stoneMat(scene, 5));
  mesh(body, solid(T), woodMat(scene, 40, { roughness: 0.7 }));
  mesh(body, solid(P), std(scene, { vertexColors: true, roughness: 0.93, envMapIntensity: 0.25 })); /* lime plaster: clean white, no stone map (it read as green moss) */
  mesh(body, solid(L), std(scene, { vertexColors: true, map: stoneTex(12), roughness: 0.55, metalness: 0.2, envMapIntensity: 0.6 }));
  mesh(body, solid(I), ironMat(scene));
  /* a lord's mon board over the opening */
  const mon = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), std(scene, { map: ctex(128, 80, (g, w, h) => { g.fillStyle = '#16120f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b8902c'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#e8d8b0'; g.beginPath(); g.arc(w / 2, h / 2, 22, 0, TAU); g.fill(); g.fillStyle = '#16120f'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(w / 2 + Math.cos(k * 2.1) * 9, h / 2 + Math.sin(k * 2.1) * 9, 7, 0, TAU); g.fill(); } }), roughness: 0.6 }));
  mon.position.set(0, 4.32, 0.26); body.add(mon);
  /* two chochin lanterns hanging under the lintel */
  const lan = []; for (const s of [-1, 1]) { const Lc = makeChochin(0.5, 0.72, 0.6, scene); const hold = new THREE.Group(); hold.position.set(s * (W - 0.8), 3.55, 0.1); hold.add(Lc.group); body.add(hold);
    mesh(hold, new THREE.CylinderGeometry(0.008, 0.008, 0.52, 4).translate(0, 0.6, 0), ironMat(scene, { vertexColors: false, color: 0x1a1816 }), { cast: false }); lan.push({ hold, L: Lc, ph: s }); }
  let t = 0, fl = 0;
  return { group, width: W,
    update(dt) { t += dt; fl = Math.max(0, fl - dt / 3.2); const k = sm(0, 1, fl);
      for (const o of lan) { o.hold.rotation.z = Math.sin(t * 1.1 + o.ph) * (0.02 + 0.09 * k); o.hold.rotation.x = Math.cos(t * 0.9 + o.ph) * (0.015 + 0.05 * k); o.L.paper.emissiveIntensity = 0.6 + 0.35 * k + 0.05 * Math.sin(t * 9 + o.ph); } },
    flare() { fl = 1; }, dispose() { disposeTree(group); } };
}

/* ================================================================ SIGNS */
export function sign(scene, { i = 0 } = {}) {
  R = rng(130 + i * 9);
  const group = new THREE.Group(); scene.add(group);
  const wearTex = (g, w, h, n, a0) => { const r = rng(n); for (let k = 0; k < 70; k++) { g.strokeStyle = `rgba(${r() < 0.5 ? '30,22,16' : '120,100,76'},${a0 + r() * 0.1})`; g.lineWidth = 1 + r() * 2.5; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 10); g.stroke(); } };
  if (i === 0) { /* a dropped pair of waraji (straw sandals), a furoshiki bundle, rice balls and a red cloth, half in the mud */
    const sh = new THREE.Shape(); const Lh = 0.135; sh.moveTo(0, -Lh);
    sh.bezierCurveTo(0.07, -Lh, 0.08, -0.05, 0.065, 0.02); sh.bezierCurveTo(0.075, 0.09, 0.05, Lh, 0, Lh); sh.bezierCurveTo(-0.05, Lh, -0.075, 0.09, -0.065, 0.02); sh.bezierCurveTo(-0.08, -0.05, -0.07, -Lh, 0, -Lh);
    const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 12 }); sg.rotateX(-Math.PI / 2);
    const tex = strawTex(15); tex.repeat.set(5, 5); const strawM = std(scene, { map: tex, roughness: 1, envMapIntensity: 0.1 });
    const sa = mesh(group, sg, strawM); sa.position.set(-0.14, 0.02, 0.05); sa.rotation.set(0.12, 0.7, 0.22);
    const sb = mesh(group, sg.clone(), strawM); sb.position.set(-0.4, 0.045, 0.24); sb.rotation.set(0.05, -0.45, Math.PI * 0.97);
    const cord = [at(new THREE.TorusGeometry(0.06, 0.0085, 4, 12, Math.PI), 0xa02a28), at(new THREE.TorusGeometry(0.05, 0.0085, 4, 12, Math.PI * 0.9), 0xa02a28, 0, 0, 0, { r: [0, Math.PI / 2, 0] })];
    const ch = mesh(group, solid(cord), std(scene, { vertexColors: true, roughness: 0.9 })); ch.position.set(-0.14, 0.06, 0.02); ch.rotation.set(0.1, 0.7, 0.2); ch.scale.setScalar(1.2);
    const bun = [at(new THREE.SphereGeometry(0.16, 14, 10), 0x2c3a62, 0, 0.1, 0, { s: [1.05, 0.72, 1], jit: 0.05 }), at(new THREE.SphereGeometry(0.05, 8, 6), 0x2c3a62, 0, 0.2, 0, { s: [1.5, 0.9, 1.2] }), at(new THREE.ConeGeometry(0.035, 0.1, 6), 0x34446e, 0.06, 0.21, 0.02, { r: [0, 0, -0.9] }), at(new THREE.ConeGeometry(0.035, 0.1, 6), 0x34446e, -0.06, 0.21, -0.01, { r: [0, 0, 0.9] })];
    for (let k = 0; k < 9; k++) { const a = R() * TAU, r = R() * 0.1; bun.push(at(new THREE.CircleGeometry(0.014, 6), 0xd8d4c8, Math.cos(a) * r, 0.1 + 0.115 * (1 - (r / 0.16) ** 2), Math.sin(a) * r, { r: [-Math.PI / 2 + Math.cos(a) * 0.4, 0, 0] })); }
    const b = mesh(group, solid(bun), std(scene, { vertexColors: true, roughness: 0.95, envMapIntensity: 0.15 })); b.position.set(0.2, 0, -0.08); b.rotation.y = 0.5;
    const spill = [at(new THREE.BoxGeometry(0.34, 0.006, 0.12), 0x9c2a26, 0.3, 0.005, 0.2, { r: [0, 0.5, 0] })];
    for (const [x, z] of [[0.46, 0.04], [0.52, 0.12], [0.38, -0.05]]) spill.push(at(new THREE.SphereGeometry(0.04, 8, 6), 0xe4e0d2, x, 0.03, z, { s: [1, 0.85, 1], jit: 0.06 }), at(new THREE.BoxGeometry(0.05, 0.03, 0.02), 0x141210, x, 0.028, z + 0.03));
    mesh(group, solid(spill), std(scene, { vertexColors: true, roughness: 0.9, envMapIntensity: 0.15 }), { cast: false });
    mesh(group, solid([at(rockGeo(0.05, 1), 0x1a1612, 0.12, 0.012, 0.18, { s: [1.5, 0.3, 1] }), at(rockGeo(0.07, 2), 0x1a1612, -0.12, 0.01, 0.04, { s: [2, 0.25, 1.3] })]), std(scene, { vertexColors: true, roughness: 0.4 }), { cast: false });
    group.scale.setScalar(1.45);
  } else if (i === 1) { /* the lord's mon painted on three weathered planks nailed to two stakes */
    const tex = ctex(512, 320, (g, w, h) => {
      const tones = ['#2e231a', '#251c15', '#30251c']; for (let k = 0; k < 3; k++) { g.fillStyle = tones[k]; g.fillRect((w * k) / 3, 0, w / 3 + 1, h); }
      wearTex(g, w, h, 5, 0.07);
      for (const x of [w / 3, (2 * w) / 3]) { g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(x - 3, 0, 6, h); g.fillStyle = 'rgba(176,146,106,0.22)'; g.fillRect(x + 3, 0, 2, h); }
      const cx = w / 2, cy = h / 2, Rr = h * 0.4; g.strokeStyle = '#e4dcc6'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, Rr * 1.0, 0, TAU); g.stroke();
      g.fillStyle = '#e4dcc6'; for (let k = 0; k < 3; k++) { g.save(); g.translate(cx, cy); g.rotate((k * TAU) / 3); g.beginPath(); g.arc(0, -Rr * 0.5, Rr * 0.26, 0, TAU); g.fill();
        g.beginPath(); for (let j = 0; j <= 16; j++) { const f = j / 16; const th = -Math.PI / 2 + f * 2.1; const ro = Rr * lerp(0.76, 0.5, Math.pow(f, 1.1)); g.lineTo(Math.cos(th) * ro, Math.sin(th) * ro); } for (let j = 16; j >= 0; j--) { const f = j / 16; const th = -Math.PI / 2 + f * 2.1; const ri = Rr * lerp(0.3, 0.5, Math.pow(f, 0.7)); g.lineTo(Math.cos(th) * ri, Math.sin(th) * ri); } g.closePath(); g.fill(); g.restore(); }
      g.globalCompositeOperation = 'destination-out'; const r2 = rng(9); for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(0,0,0,${0.2 + r2() * 0.4})`; g.fillRect(cx - Rr * 1.1 + r2() * Rr * 2.2, cy - Rr * 1.1 + r2() * Rr * 2.2, 1 + r2() * 5, 1 + r2() * 3); } g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(228,220,198,0.55)'; for (let k = 0; k < 6; k++) { const x = cx - Rr * 0.8 + R() * Rr * 1.6; g.fillRect(x, cy + Rr * 1.0, 3 + R() * 3, 6 + R() * 24); }
    });
    const wd = woodMat(scene, 51); const P = [];
    for (const sx of [-1, 1]) P.push(at(boxY(0.09, 1.0, 0.09), 0x7a5e3e, sx * 0.32, 0, -0.04, { jit: 0.1 }));
    P.push(at(new THREE.BoxGeometry(1.04, 0.64, 0.045), 0x2a2018, 0, 0.7, 0.02), at(new THREE.BoxGeometry(0.1, 0.66, 0.05), 0x5c442c, -0.5, 0.7, 0.02, { jit: 0.1 }), at(new THREE.BoxGeometry(0.1, 0.66, 0.05), 0x5c442c, 0.5, 0.7, 0.02, { jit: 0.1 }));
    const bd = new THREE.Group(); bd.rotation.x = -0.07; group.add(bd); mesh(bd, solid(P), wd);
    const face = mesh(bd, new THREE.PlaneGeometry(0.94, 0.58), std(scene, { map: tex, transparent: true, roughness: 0.6, envMapIntensity: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.06 }), { cast: false }); face.position.set(0, 0.7, 0.046);
    mesh(group, solid([at(rockGeo(0.06, 4), 0x6c675e, -0.5, 0.03, 0.1, { jit: 0.1 }), at(rockGeo(0.05, 5), 0x6c675e, 0.52, 0.025, 0.08, { jit: 0.1 }), at(rockGeo(0.04, 6), 0x6c675e, 0.1, 0.02, 0.22, { jit: 0.1 })]), stoneMat(scene, 11));
  } else { /* a cold camp: a black iron brazier of grey ash, a straw bed, an iron kettle */
    const iron = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.68, envMapIntensity: 0.55, side: THREE.DoubleSide, envMap: scene.environment || null });
    const bowl = lathe([[0.0, 0.0], [0.2, 0.02], [0.36, 0.1], [0.48, 0.24], [0.51, 0.32], [0.47, 0.335], [0.43, 0.26], [0.3, 0.12], [0.0, 0.07]], 20);
    const B = [at(bowl, 0x1d1a18, 0, 0.36, 0, { jit: 0.1 }), ironRing(0.4, 0.024, 0x1d1a18, 0, 0.26, 0, [Math.PI / 2, 0, 0])];
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.3; B.push(pole([Math.cos(a) * 0.3, 0.0, Math.sin(a) * 0.3], [Math.cos(a) * 0.17, 0.42, Math.sin(a) * 0.17], 0.032, 0x1d1a18, { jit: 0.05 })); }
    mesh(group, solid(B), iron);
    const ash = [at(new THREE.CylinderGeometry(0.43, 0.41, 0.05, 18), 0x4c4a47, 0, 0.62, 0, { jit: 0.08 })];
    for (let k = 0; k < 9; k++) { const a = R() * TAU, r = Math.sqrt(R()) * 0.32; ash.push(at(new THREE.CylinderGeometry(0.016, 0.024, 0.16 + R() * 0.1, 5), 0x151412, Math.cos(a) * r, 0.66, Math.sin(a) * r, { r: [Math.cos(a) * 0.8, R() * TAU, Math.sin(a) * 0.8], jit: 0.3 })); }
    mesh(group, solid(ash), std(scene, { vertexColors: true, roughness: 1, envMapIntensity: 0.1 }));
    /* the straw bed: a rounded straw mat, a bound roll for a pillow, a crumpled blanket half over it */
    const tx = strawTex(3); tx.repeat.set(1, 1); const strawM = std(scene, { map: tx, color: 0xd8caa6, roughness: 1, envMapIntensity: 0.1 });
    const rs = new THREE.Shape(); const mw = 0.52, mh = 0.29, rr = 0.07; rs.moveTo(-mw + rr, -mh); rs.lineTo(mw - rr, -mh); rs.quadraticCurveTo(mw, -mh, mw, -mh + rr); rs.lineTo(mw, mh - rr); rs.quadraticCurveTo(mw, mh, mw - rr, mh); rs.lineTo(-mw + rr, mh); rs.quadraticCurveTo(-mw, mh, -mw, mh - rr); rs.lineTo(-mw, -mh + rr); rs.quadraticCurveTo(-mw, -mh, -mw + rr, -mh);
    const mg = new THREE.ExtrudeGeometry(rs, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }); mg.rotateX(-Math.PI / 2);
    const bed = mesh(group, mg, strawM, { cast: false }); bed.position.set(0.98, 0.0, -0.1); bed.rotation.y = 0.3;
    const roll = mesh(group, new THREE.CylinderGeometry(0.095, 0.095, 0.5, 10).rotateZ(Math.PI / 2), strawM); roll.position.set(0.7, 0.14, -0.3); roll.rotation.y = 0.3;
    mesh(group, solid([at(cylY(0.102, 0.102, 0.035, 10), 0x4e3a22, 0, 0, 0, { r: [0, 0, Math.PI / 2] }), at(cylY(0.102, 0.102, 0.035, 10), 0x4e3a22, 0.14, 0, 0, { r: [0, 0, Math.PI / 2] })]), std(scene, { vertexColors: true, roughness: 0.9 }), { cast: false }).position.set(0.64, 0.14, -0.3);
    const bl = mesh(group, solid([at(rockGeo(0.3, 21), 0x3c3e52, 0, 0, 0, { s: [1.5, 0.45, 1.0], jit: 0.12, r: [0, 0.3, 0] })]), std(scene, { vertexColors: true, roughness: 1, envMapIntensity: 0.1 })); bl.position.set(1.12, 0.05, -0.06);
    const strands = []; for (let k = 0; k < 26; k++) strands.push(at(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 3).rotateZ(Math.PI / 2), 0xffffff, 0.45 + R() * 1.1, 0.05 + R() * 0.07, -0.42 + R() * 0.6, { r: [(R() - 0.5) * 0.5, R() * TAU, (R() - 0.5) * 0.5] }));
    mesh(group, solid(strands), strawM, { cast: false });
    /* the kettle (tetsubin): a squat iron pot with a lid, a spout and a handle, tipped on its side */
    const kt = [at(lathe([[0, 0], [0.12, 0.0], [0.17, 0.06], [0.185, 0.14], [0.15, 0.22], [0.09, 0.25], [0.0, 0.25]], 14), 0x1d1a18), at(new THREE.SphereGeometry(0.03, 8, 6), 0x1d1a18, 0, 0.27, 0), at(new THREE.CylinderGeometry(0.016, 0.03, 0.17, 6), 0x1d1a18, 0.21, 0.14, 0, { r: [0, 0, -1.0] }), at(new THREE.TorusGeometry(0.17, 0.01, 4, 14, Math.PI), 0x26221f, 0, 0.2, 0)];
    const k = mesh(group, solid(kt), iron); k.position.set(-0.78, 0.17, 0.32); k.rotation.set(0, 0.5, 1.2);
    mesh(group, new THREE.CircleGeometry(0.66, 18).rotateX(-Math.PI / 2), std(scene, { color: 0x24211f, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), { cast: false }).position.set(0, 0.006, 0);
  }
  return { group, update() {}, dispose() { disposeTree(group); } };
}

/* ================================================================ WAYMARK: stop = chochin + nobori banners on a bamboo pole; goal = lantern tower */
/* a nobori banner hanging from its top-left corner, swaying (BW wide, BL long) */
function makeBanner(BW, BL, tex) {
  const g = new THREE.PlaneGeometry(BW, BL, 4, 14); g.translate(BW / 2, -BL / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffe8c0, emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.1 });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; const bp = g.attributes.position; const x0 = new Float32Array(bp.count); for (let i = 0; i < bp.count; i++) x0[i] = bp.getX(i);
  return { mesh: m, update(t, ph = 0) { for (let i = 0; i < bp.count; i++) { const f = clamp(-bp.getY(i) / BL, 0, 1); bp.setX(i, x0[i] + Math.sin(t * 2.1 - f * 3 + ph) * 0.1 * f * (x0[i] / BW + 0.1)); bp.setZ(i, Math.sin(t * 1.7 - f * 2.4 + x0[i] * 2 + ph) * 0.14 * f); } bp.needsUpdate = true; g.computeVertexNormals(); } };
}
const noboriTex = () => ctex(128, 512, (g, w, h) => {
  g.fillStyle = '#e8dfc6'; g.fillRect(0, 0, w, h); const r = rng(6); for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(150,120,70,${0.04 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 6); }
  g.fillStyle = '#9c2c1c'; g.fillRect(0, 0, 9, h); g.fillRect(w - 9, 0, 9, h);
  g.beginPath(); g.arc(w / 2, h * 0.17, w * 0.28, 0, TAU); g.fill(); g.fillStyle = '#e8dfc6'; g.beginPath(); g.arc(w / 2, h * 0.17, w * 0.17, 0, TAU); g.fill();
  g.fillStyle = '#9c2c1c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(w * 0.74)}px 'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
  g.fillText('道', w / 2, h * 0.43); g.fillText('標', w / 2, h * 0.68); g.fillRect(w * 0.4, h * 0.84, w * 0.2, 6);
});
/* many lanterns as two instanced meshes (paper body and black caps); list = [x, y, z, width, height] */
function makeLanternSet(list, glow, scene) {
  const g = new THREE.Group(); const pts = [];
  for (let j = 0; j <= 10; j++) { const t = j / 10; pts.push([0.5 * (0.5 + 0.5 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.6)), (t - 0.5) * 0.9]); }
  const tex = paperTex(9); const paper = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xff9a50, emissiveMap: tex, emissiveIntensity: glow, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.1 });
  const body = new THREE.InstancedMesh(lathe(pts, 12), paper, list.length); const capG = solid([at(cylY(0.3, 0.3, 0.07, 8), 0x15110f, 0, 0.44, 0), at(cylY(0.3, 0.3, 0.07, 8), 0x15110f, 0, -0.51, 0)]);
  const caps = new THREE.InstancedMesh(capG, std(scene, { vertexColors: true, roughness: 0.5 }), list.length);
  list.forEach(([x, y, z, w, h], k) => { _m.compose(_p.set(x, y, z), _q.identity(), _s.set(w, h, w)); body.setMatrixAt(k, _m); caps.setMatrixAt(k, _m); });
  body.frustumCulled = false; caps.frustumCulled = false; g.add(body, caps); return { group: g, paper };
}
export function waymark(scene, { kind = 'stop' } = {}) {
  R = rng(kind === 'goal' ? 211 : 170);
  const root = new THREE.Group(); scene.add(root); const group = root; const BAM = 0x8f9558;
  const ease = (st) => { const k = st.k === undefined ? 1 : clamp(st.k, 0, 1); root.visible = k > 0.01; const e = sm(0, 1, k); root.scale.set(0.3 + 0.7 * e, e + 0.0001, 0.3 + 0.7 * e); return e; };
  if (kind !== 'goal') {
    const PH = 10; const bam = woodMat(scene, 14, { roughness: 0.65 });
    const P = [pole([0, 0, 0], [0, PH, 0], 0.055, BAM, { rb: 0.08, jit: 0.05, seg: 6 })];
    for (let y = 0.8; y < PH; y += 0.9) P.push(at(cylY(0.065, 0.065, 0.03, 6), 0x7a7a46, 0, y, 0));
    P.push(pole([-1.8, PH - 0.2, 0], [1.8, PH - 0.2, 0], 0.035, 0xa09a5a, { jit: 0.05 }), pole([0, PH - 0.2, 0], [0, PH - 0.55, 0], 0.009, 0x2a2018, { seg: 4 }), at(cylY(0.035, 0.055, 0.16, 6), 0x7a7a46, 0, PH, 0));
    for (const x of [-0.08, 0.08]) P.push(at(rockGeo(0.15, 3), 0x6c675e, x * 3, 0.07, 0.1, { jit: 0.1 }));
    mesh(root, solid(P), bam, { cast: false });
    const tex = noboriTex(); const b1 = makeBanner(1.1, 6.4, tex), b2 = makeBanner(1.1, 6.4, tex);
    b1.mesh.position.set(-1.8, PH - 0.2, 0.02); b2.mesh.position.set(0.7, PH - 0.2, 0.02); root.add(b1.mesh, b2.mesh);
    const LC = makeChochin(0.9, 1.25, 0.85, scene); LC.group.position.set(0, PH - 0.55 - 0.62 - 0.05, 0); root.add(LC.group);
    const sm1 = makeSmoke(6.5, 0.1, 18, 0.8); sm1.mesh.position.set(0, PH + 0.12, 0); root.add(sm1.mesh);
    let t = 0;
    return { group, update(dt, st = {}) {
      t += dt; const e = ease(st); const near = clamp(st.near || 0, 0, 1);
      LC.paper.emissiveIntensity = (0.82 + 0.14 * near) * (0.94 + 0.06 * Math.sin(t * 9) + 0.03 * Math.sin(t * 23));
      b1.update(t, 0); b2.update(t, 1.7); sm1.update(t, 0.5 * e);
    }, dispose() { disposeTree(group); } };
  }
  /* goal: a timber fire-watch tower (hinomi yagura) with a paper-lit lantern room under a hipped roof, a ladder, two nobori banners and one soft light */
  const TH = 10.5; const wood = woodMat(scene, 19, { roughness: 0.9 }); const P = []; const WC = 0x8a6c48, WB = 0x7a5e3e;
  const hw0 = 2.2, hw1 = 1.2; const hAt = (y) => lerp(hw0, hw1, y / TH); const lvl = [3.4, 5.8, 8.0, 10.2];
  const CR = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of CR) { P.push(pole([sx * hw0, 0, sz * hw0], [sx * hw1, TH + 0.1, sz * hw1], 0.12, WC, { rb: 0.19, jit: 0.08, seg: 8 })); P.push(at(rockGeo(0.28, 3), 0x6c675e, sx * hw0, 0.07, sz * hw0, { jit: 0.12 })); }
  for (const y of lvl) { const h = hAt(y); for (let f = 0; f < 4; f++) { const a = CR[f], b = CR[(f + 1) % 4]; P.push(pole([a[0] * h, y, a[1] * h], [b[0] * h, y, b[1] * h], 0.07, WB, { jit: 0.08 })); } }
  for (let k = 0; k < 3; k++) { const y0 = lvl[k], y1 = lvl[k + 1]; for (let f = 0; f < 4; f++) { let a = CR[f], b = CR[(f + 1) % 4]; if ((f + k) % 2) { const t2 = a; a = b; b = t2; } P.push(pole([a[0] * hAt(y0), y0, a[1] * hAt(y0)], [b[0] * hAt(y1), y1, b[1] * hAt(y1)], 0.05, WB, { jit: 0.08 })); } }
  for (const x of [-0.32, 0.32]) P.push(pole([x, 0, hw0 + 0.08], [x, TH, hw1 + 0.08], 0.04, 0x5c442c, { jit: 0.08 }));
  for (let y = 0.4; y < TH - 0.2; y += 0.5) { const z = hAt(y) + 0.08; P.push(pole([-0.32, y, z], [0.32, y, z], 0.025, 0x5c442c, { jit: 0.1, seg: 5 })); }
  const hp = hw1 + 0.4; P.push(at(new THREE.BoxGeometry(2 * hp, 0.16, 2 * hp), 0x5c442c, 0, TH + 0.08, 0, { jit: 0.05 }));
  for (const [sx, sz] of CR) P.push(pole([sx * hp, TH, sz * hp], [sx * hp, TH + 1.0, sz * hp], 0.05, WC, { jit: 0.06 }));
  for (const s2 of [-1, 1]) { P.push(pole([s2 * hp, TH + 0.95, -hp], [s2 * hp, TH + 0.95, hp], 0.04, WB), pole([-hp, TH + 0.95, s2 * hp], [hp, TH + 0.95, s2 * hp], 0.04, WB)); }
  /* the lantern room: four corner posts, rails, a paper-lit box between them */
  const RW = 0.92, RH = 2.2, RY = TH + 0.16;
  for (const [sx, sz] of CR) P.push(at(boxY(0.13, RH + 0.1, 0.13), WC, sx * RW, RY, sz * RW, { jit: 0.05 }));
  for (const y of [0.0, RH / 2, RH]) for (let f = 0; f < 4; f++) { const a = CR[f], b = CR[(f + 1) % 4]; P.push(pole([a[0] * RW, RY + y + 0.04, a[1] * RW], [b[0] * RW, RY + y + 0.04, b[1] * RW], 0.04, WB)); }
  mesh(root, solid(P), wood, { cast: false });
  const sTex = ctex(128, 256, (g, w, h) => { g.fillStyle = '#efe0bc'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,46,22,0.85)'; g.lineWidth = 4; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo((w * k) / 4, 0); g.lineTo((w * k) / 4, h); g.stroke(); } for (let k = 0; k <= 7; k++) { g.beginPath(); g.moveTo(0, (h * k) / 7); g.lineTo(w, (h * k) / 7); g.stroke(); } });
  const roomM = new THREE.MeshStandardMaterial({ map: sTex, emissive: 0xff9a50, emissiveMap: sTex, emissiveIntensity: 0.9, roughness: 0.9, envMapIntensity: 0.1 }); if (scene.environment) roomM.envMap = scene.environment;
  const room = mesh(root, new THREE.BoxGeometry(RW * 2 - 0.1, RH - 0.08, RW * 2 - 0.1), roomM, { cast: false }); room.position.y = RY + RH / 2 + 0.04;
  const roofG = lathe([[0.04, 0.56], [0.1, 0.5], [0.26, 0.34], [0.48, 0.18], [0.78, 0.07], [1.0, 0.04], [1.1, 0.11], [1.06, 0.0], [0.82, -0.02], [0.4, 0.0], [0.0, 0.0]], 4).scale(1.95, 1.55, 1.95);
  mesh(root, solid([at(roofG, 0x2e2e34, 0, RY + RH + 0.1, 0, { flat: true, r: [0, Math.PI / 4, 0] }), at(new THREE.SphereGeometry(0.12, 8, 6), 0x9a8a5a, 0, RY + RH + 0.1 + 0.95, 0)]), std(scene, { vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), { cast: false });
  const list = []; for (const y of [8.0, 5.8]) { const h = hAt(y) + 0.22; for (const [sx, sz] of CR) list.push([sx * h, y - 0.5, sz * h, 0.6, 0.85]); }
  const SL = makeLanternSet(list, 0.7, scene); root.add(SL.group);
  const tex = noboriTex(); const b1 = makeBanner(1.2, 6.2, tex), b2 = makeBanner(1.2, 6.2, tex); b1.mesh.position.set(-hp - 1.35, TH + 0.95, 0.1); b2.mesh.position.set(hp + 0.15, TH + 0.95, -0.1); root.add(b1.mesh, b2.mesh);
  for (const s2 of [-1, 1]) mesh(root, new THREE.CylinderGeometry(0.035, 0.035, 1.5, 5).rotateZ(Math.PI / 2), wood, { cast: false }).position.set(s2 * (hp + 0.7), TH + 0.95, 0);
  const light = new THREE.PointLight(0xffa860, 0, 26, 1.6); light.position.set(0, RY + RH / 2, 0); root.add(light);
  let t = 0;
  return { group, update(dt, st = {}) {
    t += dt; const e = ease(st); const near = clamp(st.near || 0, 0, 1); const fl = 0.93 + 0.05 * Math.sin(t * 8) + 0.03 * Math.sin(t * 19);
    roomM.emissiveIntensity = (0.9 + 0.08 * near) * fl; SL.paper.emissiveIntensity = 0.7 * (0.95 + 0.04 * Math.sin(t * 7));
    light.intensity = e * (55 + 20 * near) * fl; b1.update(t, 0.4); b2.update(t, 2.1);
  }, dispose() { disposeTree(group); } };
}

/* ================================================================ CAUSE: a paper lantern that floats at the shoulder */
export function cause(scene) {
  R = rng(5);
  const group = new THREE.Group(); scene.add(group);
  const L = makeChochin(0.34, 0.46, 0.72, scene); const hang = new THREE.Group(); hang.add(L.group); group.add(hang);
  const tas = []; tas.push(at(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 4), 0x9a2a28, 0, -0.29, 0), at(new THREE.ConeGeometry(0.022, 0.1, 6), 0xb8322a, 0, -0.38, 0, { r: [Math.PI, 0, 0] }));
  mesh(hang, solid(tas), std(scene, { vertexColors: true, roughness: 0.9 }), { cast: false });
  let t = 0; hang.position.y = 1.3;
  return { group, update(dt) { t += dt; hang.position.y = 1.3 + Math.sin(t * 1.5) * 0.045; hang.rotation.z = Math.sin(t * 1.1) * 0.06; hang.rotation.x = Math.cos(t * 0.9) * 0.05; hang.rotation.y = t * 0.25; L.paper.emissiveIntensity = 0.72 * (0.94 + 0.05 * Math.sin(t * 8) + 0.03 * Math.sin(t * 21)); }, dispose() { disposeTree(group); } };
}

/* the far light at the end of the wonder walk (web/src/props/farlights.js) */
export function farlight(scene) { return worldFarlight('edo', scene); }

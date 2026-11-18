/* The Storybook Day: the 3D module (web/src/worlds/storybook.js). Loaded only when this world is chosen.
   Lands: meadow (The Bright Meadow) and cloudpeaks (The Cloud Peaks), each a LOOKS-shape entry (lands.js) plus a
   LOOK-shape daylight entry (world.js). The render chain is tuned for night, so the daylight look lives here:
   a warm low key, a cool sky fill from the horizon colour, soft long shadows, blue aerial haze, a light grade,
   and the fight torch near zero (game/worlds/storybook.mjs `torch`).
   Dense one-line code uses block comments only. */
import * as THREE from 'three';
import { LANDKIT as K } from '../lands.js';
export { dressBoss } from './storybook-boss.js';
import { finishFoe, foeRng, rankKit } from './foe-look.js';
import { cloudMaterial, cloudMesh, glowBoltGeo, glowBoltMaterial, lumpGeo, bindFrame, bindPosOf, rainPool, STORM } from './storybook-boss.js';
export { camp } from './storybook-camp.js';

const { TAU, FRONT, NEMESIS_ANG, ARENA_R, polar, fbm, ridged, smooth, lerp, clamp, angOff, lineDist, bump, windingPath, ranges, rng } = K;
const NEM = polar(NEMESIS_ANG, 300);

/* ---------- small geometry makers (code-built, instanced) ---------- */
/* a tuft of wildflowers: thin stems with a five-petal head each, petals in one colour, the eye in another; unit height ~1 */
function flowerTuft(r, petal, eye, n = 6) {
  const parts = []; const cp = new THREE.Color(petal); const ce = new THREE.Color(eye); const cs = new THREE.Color(0x3c6a24);
  const paint = (g, c) => { const k = g.attributes.position.count; const a = new Float32Array(k * 3); for (let i = 0; i < k; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  for (let i = 0; i < n; i++) {
    const h = 0.55 + r() * 0.45; const x = (r() - 0.5) * 0.5; const z = (r() - 0.5) * 0.5; const lean = (r() - 0.5) * 0.3;
    const st = new THREE.PlaneGeometry(0.035, h, 1, 2); st.translate(0, h / 2, 0); st.rotateY(r() * TAU); st.rotateZ(lean); st.translate(x, 0, z); parts.push(paint(st.toNonIndexed(), cs));
    const head = new THREE.CircleGeometry(0.12 + r() * 0.05, 5); const p = head.attributes.position;
    for (let k = 1; k < p.count; k++) { const a = Math.atan2(p.getY(k), p.getX(k)); const rr = Math.hypot(p.getX(k), p.getY(k)) * (0.75 + 0.25 * Math.cos(a * 5)); p.setXY(k, Math.cos(a) * rr, Math.sin(a) * rr); }
    const cols = new Float32Array(p.count * 3); for (let k = 0; k < p.count; k++) { const c = k === 0 ? ce : cp; cols.set([c.r, c.g, c.b], k * 3); } head.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    head.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.7); head.rotateY(r() * TAU); head.translate(x - Math.sin(lean) * h, h * Math.cos(lean), z);
    parts.push(head.toNonIndexed());
  }
  return mergeKeepColor(parts);
}
/* merge non-indexed geometries keeping position, normal and color */
function mergeKeepColor(parts0) {
  /* indexed parts (smooth lathes, spheres) are made non-indexed first, so the count is right */
  const parts = parts0.map((p) => { if (!p.index) return p; const q = p.toNonIndexed(); p.dispose(); return q; });
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const col = new Float32Array(n * 3); let o = 0;
  for (const p of parts) { const q = p.index ? p.toNonIndexed() : p; if (!q.attributes.normal) q.computeVertexNormals(); const c = q.attributes.position.count;
    pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3); if (q.attributes.color) col.set(q.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3); o += c; q.dispose(); if (q !== p) p.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/* paint a geometry one colour (vertex colours), so pieces of one building can share a material */
function tinted(g, hex, jitter = 0, r = Math.random) {
  const q = g.index ? g.toNonIndexed() : g; if (q !== g) g.dispose(); q.deleteAttribute('uv'); q.computeVertexNormals();
  const c = new THREE.Color(hex); const k = q.attributes.position.count; const a = new Float32Array(k * 3);
  for (let i = 0; i < k; i += 3) { const j = 1 + (r() - 0.5) * jitter; for (let t = 0; t < 3 && i + t < k; t++) a.set([c.r * j, c.g * j, c.b * j], (i + t) * 3); }
  q.setAttribute('color', new THREE.BufferAttribute(a, 3)); return q;
}
/* a flat vertex colour on a smooth geometry (keeps its normals, unlike tinted, which facets) */
function paintV(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
const box = (w, h, d, x, y, z, ry = 0) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateY(ry); b.translate(x, y, z); return b; };

/* a soft painterly material: vertex colours, a little noise in the value so flat faces are not plastic, a soft
   terminator (wrap) so the shadow side stays light and coloured, as in gouache */
function paintMaterial({ rough = 0.85, wrap = 0.35, grain = 0.12, side = THREE.FrontSide, tint = 0xffffff } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: tint, roughness: rough, metalness: 0, side, envMapIntensity: 0.25 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${K.WORLD_VARY_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${K.WORLD_VARY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${K.WORLD_VARY_PARS} ${K.NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float sbN = sqN2(vW.xz * 1.7 + vW.y * 1.3) * 0.6 + sqN2(vW.xy * 5.0 + vW.z) * 0.4; diffuseColor.rgb *= ${(1 - grain).toFixed(3)} + ${(grain * 2).toFixed(3)} * sbN; }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse += diffuseColor.rgb * ${wrap.toFixed(3)} * 0.25;`);
  };
  mat.customProgramCacheKey = () => `sb-paint-${wrap}-${grain}`;
  return mat;
}

/* a pennant on a pole: a long triangle that flutters (vertex shader), bright heraldic colour */
function pennantMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.2 });
  const U = { uTime: { value: 0 } }; mat.userData.wind = { uTime: U.uTime, uGrow: { value: 1 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sbPh = 0.0;
        #ifdef USE_INSTANCING
        sbPh = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.21;
        #endif
        float sbK = uv.x; transformed.z += (sin(uTime * 4.2 - sbK * 6.0 + sbPh) * 0.16 + sin(uTime * 7.1 - sbK * 11.0 + sbPh) * 0.05) * sbK; transformed.y -= sbK * sbK * 0.12;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.85 + 0.25 * smoothstep(0.0, 0.6, vNormal.z * 0.5 + 0.5);');
  };
  mat.customProgramCacheKey = () => 'sb-pennant';
  return mat;
}
function pennantGeo() { const g = new THREE.PlaneGeometry(1.8, 0.62, 10, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i) / 1.8 + 0.5; p.setY(i, p.getY(i) * (1 - u * 0.92)); p.setX(i, u * 1.8); } g.computeVertexNormals(); return g; }

/* ---------- set pieces ---------- */
/* oak trees: a short stout trunk and two or three bright crowns of leaf-cluster cards */
function buildOaks(ctx, L, spots, { tones = [0x3e6e2a, 0x78ac40, 0xc4e478], trans = 0x5a7a20, bark = 0xb8a088 } = {}) {
  const r = ctx.r; const land = L.current;
  const barkM = K.triMaterial('bark_brown_02', { tint: bark, tile: 1.2, desat: 0.25, nstr: 1.3, specMax: 0.05 });
  const kinds = [0, 1, 2].map(() => K.trunkGeo(r, { radius: 0.1, radial: 10, roots: 6, stubs: false, buttress: true }).bark);
  const crowns = [0, 1].map(() => { const g = K.crownClusterGeo(r, { ends: 12, per: 64, size: 0.27, spread: 0.32, flat: 0.8, tones }); g.translate(0, -0.35, 0); return g; });
  const leaf = K.leafClusterMaterial(0xffffff, { trans });
  const masses = [0, 1].map(() => crownMassGeo(r)); const massM = paintMaterial({ wrap: 0.5, grain: 0.1, rough: 0.95 });
  const tl = [[], [], []]; const cl = [[], []];
  for (const [x, z, H] of spots) {
    const y = ctx.H(x, z) - 0.15; const ht = H * 0.4;
    tl[Math.floor(r() * 3)].push({ x, y, z, ry: r() * TAU, tx: (r() - 0.5) * 0.08, tz: (r() - 0.5) * 0.08, s: ht, sy: 1 });
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) { const a = r() * TAU; const o = i === 0 ? 0 : H * 0.2; const s = H * (0.36 + r() * 0.08) * (i === 0 ? 1.1 : 0.8);
      cl[Math.floor(r() * 2)].push({ x: x + Math.cos(a) * o, y: y + ht * 0.82 + (i === 0 ? H * 0.12 : r() * H * 0.1), z: z + Math.sin(a) * o, ry: r() * TAU, s, sy: 0.85 }); }
    if (Math.hypot(x, z) < 140) K.solid(ctx, x, z, ht * 0.07 + 0.25, 'tree');
  }
  tl.forEach((l, k) => L.instanced(kinds[k], barkM, l, { ownGeo: false }));
  /* soft rounded leaf masses only (the leaf-card clusters read as shards) */
  cl.forEach((l, k) => L.instanced(masses[k], massM, l.map((o) => ({ ...o, s: o.s * 1.02 })), { ownGeo: false }));
  land.owned.push(...kinds, ...crowns, ...masses, barkM, leaf, massM);
  (ctx.blobs || (ctx.blobs = [])).push(...spots.filter(([x, z]) => Math.hypot(x, z) < 110).map(([x, z, H]) => [x, z, H * 0.45]));
}
/* a rounded oak crown mass: lumpy spheres in a dome, lit top, cool shaded underside (vertex colours), same frame as crownClusterGeo */
function crownMassGeo(r, { lumps = 9, top = 0xd4ee8a, mid = 0x7eb24a, under = 0x4e7c3c } = {}) {
  const parts = []; const cT = new THREE.Color(top); const cM = new THREE.Color(mid); const cU = new THREE.Color(under); const c = new THREE.Color();
  for (let i = 0; i < lumps; i++) {
    const a = r() * TAU; const u = i === 0 ? 0 : 0.35 + r() * 0.5; const rad = i === 0 ? 0.42 : 0.3 + r() * 0.14;
    const cx = Math.cos(a) * u * 0.55; const cz = Math.sin(a) * u * 0.55; const cy = 0.1 + (1 - u) * 0.28 + r() * 0.06;
    const g = new THREE.IcosahedronGeometry(rad, 3).toNonIndexed(); const p = g.attributes.position; const nr = g.attributes.normal;
    /* smooth normals from the lump centre (a soft painted mass, no facets) */
    for (let k = 0; k < p.count; k++) { const x = p.getX(k); const y = p.getY(k); const z = p.getZ(k); const l = Math.hypot(x, y * 0.82, z) || 1; nr.setXYZ(k, x / l, y * 0.82 / l, z / l); const n = 1 + 0.07 * (Math.sin(x * 13 + i) * Math.sin(y * 11 + 2 * i) * Math.sin(z * 15)); p.setXYZ(k, cx + x * n, cy + y * n * 0.82, cz + z * n); } const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) { const ny = nr.getY(k); const hy = p.getY(k); if (ny > 0) c.copy(cM).lerp(cT, Math.min(1, ny * 1.0 + hy * 0.4)); else c.copy(cM).lerp(cU, Math.min(1, -ny * 0.9 + 0.1)); col.set([c.r, c.g, c.b], k * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); parts.push(g);
  }
  const g = mergeKeepColor(parts); g.translate(0, -0.35, 0); return g;
}
/* wildflowers in drifts: four colours, each one instanced batch */
function buildFlowers(ctx, L, { n = 900, d = [3, 70], colors = [[0xfffaf0, 0xf2c030], [0xf2c43a, 0xc0781a], [0xd8402e, 0x2a1a10], [0x6a8ae0, 0xf0e0a0]], density = null, size = [0.28, 0.5] } = {}) {
  const r = ctx.r; const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide, envMapIntensity: 0.15 }); K.windPatch(mat, 0.14);
  const lists = colors.map(() => []);
  for (let i = 0; i < n * 3 && lists.reduce((s, l) => s + l.length, 0) < n; i++) {
    const a = r() * TAU; const dist = d[0] + Math.pow(r(), 1.3) * (d[1] - d[0]); const [x, z] = polar(a, dist);
    const keep = density ? density(ctx, x, z, dist) : smooth(0.45, 0.62, fbm(x * 0.05 + 3, z * 0.05 - 7, 3)); if (r() > keep) continue;
    const kind = Math.floor(clamp(fbm(x * 0.02 + 11, z * 0.02, 2) * 1.6 - 0.3 + (r() - 0.5) * 0.5, 0, 0.999) * colors.length);
    const s = size[0] + r() * (size[1] - size[0]);
    lists[kind].push({ x, y: ctx.H(x, z) - 0.02, z, ry: r() * TAU, s, sy: 1 });
  }
  colors.forEach(([p, e], k) => { const g = flowerTuft(r, p, e, 5 + (k % 3)); L.instanced(g, mat, lists[k], { shadow: false }); });
}
/* pennants on poles: heraldic colours along the path and round a place */
function buildPennants(ctx, L, spots, colors = [0xc8302a, 0x2a4ea8, 0xf2b84a]) {
  const r = ctx.r; const poleG = new THREE.CylinderGeometry(0.05, 0.065, 1, 6); poleG.translate(0, 0.5, 0);
  const knob = new THREE.SphereGeometry(0.09, 8, 6); knob.translate(0, 1.0, 0);
  const pg = K.mergeClean([poleG, knob]);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.8, envMapIntensity: 0.2 });
  const poles = []; const flags = colors.map(() => []);
  spots.forEach(([x, z, H = 4.5], i) => { const y = ctx.H(x, z) - 0.2; const ry = r() * 0.6 + 2.4; poles.push({ x, y, z, ry, tx: (r() - 0.5) * 0.05, tz: (r() - 0.5) * 0.05, s: 1, sy: H }); flags[i % colors.length].push({ x, y: y + H - 0.25, z, ry, s: 0.9 + r() * 0.3, sy: 1 }); if (Math.hypot(x, z) < 140) K.solid(ctx, x, z, 0.3, 'pole'); });
  L.instanced(pg, wood, poles);
  const pgeo = pennantGeo();
  colors.forEach((c, k) => { const m = pennantMaterial(c); L.current.winds.push(m.userData.wind); L.instanced(pgeo, m, flags[k], { ownGeo: false, shadow: true }); });
  L.current.owned.push(pgeo);
}
/* the hill castle: round towers with pointed roofs, a curtain wall with merlons, a tall keep, pennants on top */
function buildCastle(ctx, L, cx, cz, face, { scale = 1 } = {}) {
  const r = rng(ctx.seed + 404); const st = []; const roofB = []; const roofR = []; const dark = []; const S = scale;
  const y0 = ctx.H(cx, cz) - 1.5; const c = Math.cos(face); const s = Math.sin(face);
  const P = (lx, lz) => [lx * c + lz * s, -lx * s + lz * c];
  const tower = (lx, lz, R, H, red) => { const [x, z] = P(lx, lz); const t = new THREE.CylinderGeometry(R, R * 1.08, H, 14, 1); t.translate(x, H / 2, z); st.push(t);
    const ring = new THREE.CylinderGeometry(R * 1.18, R * 1.18, 1.2, 14); ring.translate(x, H + 0.6, z); st.push(ring);
    const roof = new THREE.ConeGeometry(R * 1.32, R * 2.9, 14); roof.translate(x, H + 1.2 + R * 1.45, z); (red ? roofR : roofB).push(roof);
    for (let k = 0; k < 3; k++) { const a = r() * TAU; const w = new THREE.BoxGeometry(0.5, 1.1, 0.2); w.rotateY(-a + Math.PI / 2); w.translate(x + Math.cos(a) * R * 1.01, H * (0.45 + k * 0.15), z + Math.sin(a) * R * 1.01); dark.push(w); }
    return [x, H + 1.2 + R * 2.9, z]; };
  const wall = (ax, az, bx, bz, H, T = 2.2) => { const [x0, z0] = P(ax, az); const [x1, z1] = P(bx, bz); const len = Math.hypot(x1 - x0, z1 - z0); const ang = Math.atan2(x1 - x0, z1 - z0);
    st.push(box(T, H, len, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, ang));
    const n = Math.floor(len / 1.6); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; st.push(box(T * 1.05, 0.9, 0.8, lerp(x0, x1, t), H + 0.45, lerp(z0, z1, t), ang)); } };
  const W = 26 * S; const D = 20 * S; const Hw = 9 * S;
  wall(-W / 2, -D / 2, W / 2, -D / 2, Hw); wall(W / 2, -D / 2, W / 2, D / 2, Hw); wall(W / 2, D / 2, -W / 2, D / 2, Hw); wall(-W / 2, D / 2, -W / 2, -D / 2, Hw);
  const tops = [tower(-W / 2, -D / 2, 3.2 * S, 15 * S, false), tower(W / 2, -D / 2, 3.2 * S, 15 * S, true), tower(W / 2, D / 2, 3.2 * S, 14 * S, false), tower(-W / 2, D / 2, 3.2 * S, 14 * S, true)];
  /* the keep: a tall square block with a steep pyramid roof and a slender round tower on its corner */
  { const [x, z] = P(-2 * S, 1 * S); const kh = 24 * S; st.push(box(11 * S, kh, 10 * S, x, kh / 2, z, face)); for (let k = 0; k < 4; k++) { const a = face + k * Math.PI / 2; const [ex, ez] = [x + Math.sin(a) * 5.8 * S, z + Math.cos(a) * 5.8 * S]; for (let m = -2; m <= 2; m++) st.push(box(0.9 * S, 1.1 * S, 0.9 * S, ex + Math.cos(a) * m * 2.2 * S, kh + 0.55 * S, ez - Math.sin(a) * m * 2.2 * S, a)); }
    const pr = new THREE.ConeGeometry(7.4 * S, 9 * S, 4); pr.rotateY(Math.PI / 4 - face); pr.translate(x, kh + 1.1 * S + 4.5 * S, z); roofB.push(pr);
    tops.push(tower(-2 * S + 5.2 * S, 1 * S - 4.8 * S, 1.9 * S, 31 * S, true)); }
  /* the gate: a dark arch in the front wall */
  { const [x, z] = P(0, D / 2 + 0.2); dark.push(box(4 * S, 5.5 * S, 0.6, x, 2.75 * S, z, face)); }
  const wallM = paintMaterial({ wrap: 0.4, grain: 0.1 });
  const g = mergeKeepColor(st.map((q) => tinted(q, 0xf1e6cf, 0.08, r)));
  const gr = mergeKeepColor([...roofB.map((q) => tinted(q, 0x2f5fb0, 0.06, r)), ...roofR.map((q) => tinted(q, 0xc0402c, 0.06, r)), ...dark.map((q) => tinted(q, 0x2a2420, 0, r))]);
  for (const geo of [g, gr]) { const m = new THREE.Mesh(geo, wallM); m.position.set(cx, y0, cz); m.castShadow = true; m.receiveShadow = true; L.add(m); }
  K.solid(ctx, cx, cz, 22 * S, 'castle');
  return tops.map(([x, y, z]) => [cx + x, y0 + y, cz + z]);
}
/* the windmill: a white tapered tower, a red cap, four lattice sails turning slowly */
function buildWindmill(ctx, L, x, z, face) {
  const r = rng(ctx.seed + 77); const y0 = ctx.H(x, z) - 0.4; const parts = []; const land = L.current;
  const body = new THREE.CylinderGeometry(1.9, 2.9, 10, 8, 3); body.translate(0, 5, 0); parts.push(tinted(body, 0xf4eee0, 0.05, r));
  const band = new THREE.CylinderGeometry(3.05, 3.05, 0.5, 8); band.translate(0, 0.25, 0); parts.push(tinted(band, 0x9a8a72, 0, r));
  const cap = new THREE.ConeGeometry(2.5, 2.8, 8); cap.translate(0, 11.4, 0); parts.push(tinted(cap, 0xb8402c, 0.05, r));
  const capr = new THREE.CylinderGeometry(2.35, 2.2, 0.8, 8); capr.translate(0, 10.2, 0); parts.push(tinted(capr, 0x6a4a30, 0, r));
  parts.push(tinted(box(1.3, 2.2, 0.3, 0, 1.1, 2.75), 0x5a3c26, 0, r));
  for (const yy of [3.6, 6.8]) parts.push(tinted(box(0.8, 0.9, 0.3, 0, yy, 2.45 - (yy - 3.6) * 0.09), 0x3a3028, 0, r));
  const mat = paintMaterial({ wrap: 0.45, grain: 0.08 });
  const tower = new THREE.Mesh(mergeKeepColor(parts), mat); tower.position.set(x, y0, z); tower.rotation.y = face; tower.castShadow = true; tower.receiveShadow = true; L.add(tower);
  /* sails: a hub, four stocks with a lattice of bars and a cream canvas on each */
  const sp = []; const canvas = [];
  sp.push(tinted(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 8).rotateX(Math.PI / 2), 0x3a2c22, 0, r));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.3; const arm = []; arm.push(box(0.22, 8.6, 0.22, 0, 4.4, 0)); for (let j = 0; j < 7; j++) arm.push(box(1.7, 0.08, 0.08, 0.75, 1.6 + j * 1.1, 0)); for (const xx of [0.15, 1.6]) arm.push(box(0.08, 7, 0.08, xx, 5, 0));
    const cv = new THREE.PlaneGeometry(1.45, 6.8); cv.translate(0.88, 5.0, -0.05);
    for (const q of arm) { q.rotateZ(a); sp.push(tinted(q, 0x7a5a3a, 0.1, r)); } cv.rotateZ(a); canvas.push(tinted(cv, 0xf6eedc, 0.04, r)); }
  const hub = new THREE.Group(); const hubY = 9.6; const off = 2.9;
  const sm = new THREE.Mesh(mergeKeepColor(sp), mat); const cm = new THREE.Mesh(mergeKeepColor(canvas), paintMaterial({ wrap: 0.6, grain: 0.05, side: THREE.DoubleSide }));
  for (const m of [sm, cm]) { m.castShadow = true; hub.add(m); land.owned.push(m.geometry); }
  land.owned.push(cm.material);
  const holder = new THREE.Group(); holder.position.set(x, y0 + hubY, z); holder.rotation.y = face; hub.position.set(0, 0, off); holder.add(hub); L.add(holder);
  land.tickers.push((t, dt) => { hub.rotation.z -= dt * 0.7; });
  K.solid(ctx, x, z, 3.2, 'windmill');
}
/* a dry-stone wall that runs over the hills: rough stones laid along a line */
function buildStoneWall(ctx, L, pts, { tint = 0xcfc6b2 } = {}) {
  const r = ctx.r; const geos = [0, 1, 2].map(() => { const g = K.chunkGeo(r, { w: 1, h: 1, d: 1, chip: 0.3 }); if (!g.index) smoothNormals(g, 40); else g.computeVertexNormals(); return g; });
  const lists = [[], [], []];
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i]; const [bx, bz] = pts[i + 1]; const len = Math.hypot(bx - ax, bz - az); const ang = Math.atan2(bx - ax, bz - az);
    for (let d = 0; d < len; d += 0.75) { const t = d / len; const x = lerp(ax, bx, t); const z = lerp(az, bz, t); if (Math.hypot(x, z) < ARENA_R + 2) continue; if (angOff(Math.atan2(z, x)) < 0.12 && Math.hypot(x, z) < 260) continue;
      const y = ctx.H(x, z); for (let row = 0; row < 2; row++) lists[Math.floor(r() * 3)].push({ x: x + (r() - 0.5) * 0.15, y: y - 0.1 + row * 0.45, z: z + (r() - 0.5) * 0.15, ry: ang + (r() - 0.5) * 0.3, tx: (r() - 0.5) * 0.15, tz: (r() - 0.5) * 0.15, s: 0.65 + r() * 0.3, sy: 0.6 + r() * 0.25 }); } }
  const mat = K.triMaterial('castle_wall_slates', { tint, tile: 1.2, desat: 0.35, cover: 0x6a9a3a, coverAmt: 0.45, nstr: 1.3, specMax: 0.1 });
  lists.forEach((l, k) => L.instanced(geos[k], mat, l, { ownGeo: false }));
  L.current.owned.push(...geos);
}
/* a storm on the nemesis line: dark cloud masses that boil on the horizon (the giant stands in them) */
function buildStormCells(ctx, L, { n = 5, dist = [240, 330], low = 0x3a4256, high = 0x8a94a8, alpha = 0.85, size = 70, y = 40 } = {}) {
  const r = ctx.r;
  for (let i = 0; i < n; i++) { const a = NEMESIS_ANG + (i / Math.max(1, n - 1) - 0.5) * 0.7 + (r() - 0.5) * 0.08; const d = dist[0] + r() * (dist[1] - dist[0]); const [x, z] = polar(a, d);
    for (let k = 0; k < 2; k++) K.addSmoke(L, [x + (r() - 0.5) * size * 0.8, y + 25 + k * size * 0.35 + r() * 20, z + (r() - 0.5) * size * 0.6], { n: 12, size: size * (0.45 + r() * 0.3), rise: 30, life: 70 + r() * 30, wind: [0.15, 0, 0.05], low, high, hot: 0x000000, alpha: alpha * (k ? 0.8 : 1) }); }
}
/* a towering cumulus or storm wall far out on the nemesis line: painted cloud billboards (no smoke), a flat base, a
   column, a spreading anvil top. shade sets the underside (light grey-blue for fair weather, slate for a storm). */
function buildAnvils(ctx, L, { n = 1, spread = 0, dist = 420, H = 150, W = 90, lit = 0xffffff, shade = 0xa4b4cc, base = 20, seed = 5 } = {}) {
  const land = L.current; const r = rng(ctx.seed + seed); const mat = sbCloud(land, cloudMaterial({ lit, shade, grad: 0.85 })); mat.fog = false;
  for (let k = 0; k < n; k++) {
    const a = NEMESIS_ANG + (n > 1 ? (k / (n - 1) - 0.5) * spread : 0) + (r() - 0.5) * 0.05; const d = dist * (0.9 + r() * 0.2); const [x, z] = polar(a, d);
    const h = H * (0.8 + r() * 0.4); const w = W * (0.8 + r() * 0.4); const P = [];
    for (let i = 0; i < 26; i++) { const t = r(); P.push([(r() - 0.5) * w * (0.7 - t * 0.3), base + t * h * 0.7, (r() - 0.5) * w * 0.3, w * (0.22 + r() * 0.08), 0.7 - t * 0.5]); }
    for (let i = 0; i < 22; i++) { const u = r() - 0.5; P.push([u * w * 1.9, base + h * (0.72 + r() * 0.2) - Math.abs(u) * h * 0.12, (r() - 0.5) * w * 0.35, w * (0.13 + r() * 0.07), 0.25 + r() * 0.2]); }
    for (let i = 0; i < 12; i++) P.push([(r() - 0.5) * w * 1.1, base + r() * h * 0.08, (r() - 0.5) * w * 0.3, w * (0.2 + r() * 0.05), 0.85]);
    const m = cloudMesh(P, mat, Math.floor(r() * 1e6)); m.position.set(x, 0, z); m.renderOrder = 0; land.group.add(m); land.owned.push(m.geometry);
  }
  land.owned.push(mat); land.tickers.push((t) => { mat.uniforms.uTime.value = t * 0.3; });
}
/* soft lightning far out in the storm: a bolt now and then, no full-screen flash (the meadow stays calm) */
function buildFarLightning(ctx, L, { every = [5, 9], flash = 0, dist = [250, 330] } = {}) {
  const land = L.current; const r = rng(ctx.seed + 91); const w = L.world;
  /* a glowing bolt (white core, blue glow, branches), not a flat ribbon */
  const mat = glowBoltMaterial(0x9cc4ff, 2.6);
  const bolts = [0, 1, 2].map(() => { const m = new THREE.Mesh(glowBoltGeo(r, 150, 26, 3), mat); m.visible = false; m.frustumCulled = false; land.group.add(m); land.owned.push(m.geometry); return m; });
  land.owned.push(mat);
  let next = 2 + r() * 2; let show = 0; let cur = null;
  land.tickers.push((t, dt, cx, cz) => {
    next -= dt;
    if (next <= 0) { next = every[0] + r() * (every[1] - every[0]); show = 0.3; cur = bolts[Math.floor(r() * 3)]; const a = NEMESIS_ANG + (r() - 0.5) * 0.6; const d = dist[0] + r() * (dist[1] - dist[0]); cur.position.set(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d); cur.rotation.y = r() * TAU; if (flash) w.flash?.(flash); }
    if (show > 0) { show -= dt; mat.uniforms.uA.value = show > 0.2 || (show > 0.07 && show < 0.13) ? 1 : 0.25; for (const b of bolts) b.visible = b === cur; } else for (const b of bolts) b.visible = false;
  });
}
/* painted standing stones: grey slabs with ochre, red and blue bands and chevrons in vertex colours */
function paintedSlab(r, baseHex = 0x9c978c) {
  const g = K.slabGeo(r); g.scale(0.85, 1.3, 0.62); const p = g.attributes.position; const n = p.count; const col = new Float32Array(n * 3);
  /* weathered menhirs: grey stone, paint faded into it, moss at the foot, lichen spots */
  const base = new THREE.Color(baseHex); const fade = (h) => new THREE.Color(h).lerp(base, 0.45); const paints = [fade(0xc8862a), fade(0xb03a2a), fade(0x2c4f9a), fade(0xf2ead6)]; const moss = new THREE.Color(0x5e7a34); const lichen = new THREE.Color(0xc8c49a);
  const band = 0.18 + r() * 0.2; const pick = Math.floor(r() * 3); const chev = r() < 0.6; const c = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    let y = 0; let x = 0; for (let k = 0; k < 3; k++) { y += p.getY(i + k) / 3; x += p.getX(i + k) / 3; }
    c.copy(base).multiplyScalar(0.82 + K.vnoise(x * 9, y * 9) * 0.3);
    if (y < 0.1 + K.vnoise(x * 13, 3.1) * 0.12) c.lerp(moss, 0.75);
    else if (K.vnoise(x * 31 + 7, y * 31) > 0.78) c.lerp(lichen, 0.5);
    else if (Math.abs(y - band) < 0.045 && K.vnoise(x * 20, y * 20) > 0.3) c.copy(paints[pick]);
    else if (Math.abs(y - band - 0.12) < 0.025) c.copy(paints[3]);
    else if (chev && y > band + 0.2 && y < band + 0.6 && Math.abs(((y - band - 0.2) * 6 - Math.abs(x) * 9) % 2) < 0.5) c.copy(paints[(pick + 1) % 3]);
    else if (!chev && y > band + 0.25 && Math.hypot(x * 1.6, y - band - 0.42) < 0.12 && Math.hypot(x * 1.6, y - band - 0.42) > 0.07) c.copy(paints[(pick + 2) % 3]);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g;
}
function buildStones(ctx, L, spots) {
  /* four kinds of stone (warm sandstone, grey, pale chalk, red-brown), each with its own paint; heights, widths and leans vary */
  const r = ctx.r; const kinds = [0xa8a49a, 0x949088, 0xb4b0a4, 0x9a9488].map((b) => smoothNormals(paintedSlab(r, b), 40)); const lists = [[], [], [], []];
  for (const [x, z, H, face] of spots) { const k = Math.floor(r() * 4); const w = 0.75 + r() * 0.6; lists[k].push({ x, y: ctx.H(x, z) - 0.3, z, ry: face ?? r() * TAU, tx: (r() - 0.5) * 0.28, tz: (r() - 0.5) * 0.28, s: H * w, sy: (0.75 + r() * 0.6) / w }); if (Math.hypot(x, z) < 140) K.solid(ctx, x, z, H * 0.28, 'stone'); }
  const mat = paintMaterial({ wrap: 0.3, grain: 0.18, rough: 0.9 });
  kinds.forEach((g, k) => L.instanced(g, mat, lists[k], { ownGeo: false }));
  L.current.owned.push(...kinds);
  (ctx.blobs || (ctx.blobs = [])).push(...spots.filter(([x, z]) => Math.hypot(x, z) < 100).map(([x, z, H]) => [x, z, H * 0.5]));
}
/* cottages: timber-frame walls (cream panels, dark oak beams and braces), a deep gable thatch roof with soft eaves,
   a stone chimney, a red door, windows with flower boxes */
function buildCottage(ctx, L, x, z, rot, { W = 5, D = 4, H = 2.6, wall = 0xf6eedc, roof = 0xd2a65a, ridge = 0xa87a3a, door = 0xb03a2a, shutter = 0x2c5a8a } = {}) {
  const r = rng(ctx.seed + Math.floor(x * 13 + z * 7)); const y0 = ctx.H(x, z) - 0.3; const parts = []; const OAK = 0x4a3324;
  parts.push(tinted(box(W, H + 0.3, D, 0, (H + 0.3) / 2, 0), wall, 0.04, r));
  /* beams: corner posts, a sill and a mid rail, studs and diagonal braces on the long walls */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(tinted(box(0.24, H + 0.32, 0.24, sx * W / 2, (H + 0.3) / 2, sz * D / 2), OAK, 0.05, r));
  for (const sz of [-1, 1]) { for (const yy of [0.15, H * 0.55, H + 0.2]) parts.push(tinted(box(W, 0.16, 0.08, 0, yy, sz * (D / 2 + 0.03)), OAK, 0.05, r));
    for (const u of [-0.25, 0.25]) parts.push(tinted(box(0.14, H, 0.08, u * W, H / 2 + 0.2, sz * (D / 2 + 0.035)), OAK, 0.05, r));
    for (const sx of [-1, 1]) { const b = box(0.12, H * 0.62, 0.07, 0, 0, 0); b.rotateZ(sx * 0.62); b.translate(sx * W * 0.38, H * 0.3 + 0.2, sz * (D / 2 + 0.04)); parts.push(tinted(b, OAK, 0.05, r)); } }
  for (const sx of [-1, 1]) for (const yy of [0.15, H * 0.55, H + 0.2]) parts.push(tinted(box(0.08, 0.16, D, sx * (W / 2 + 0.03), yy, 0), OAK, 0.05, r));
  /* the gable roof: a thatch prism with soft overhanging eaves, a darker ridge */
  const tri = new THREE.Shape(); const ow = W / 2 + 0.55; tri.moveTo(-ow, 0); tri.lineTo(ow, 0); tri.lineTo(0, 2.3); tri.lineTo(-ow, 0);
  const roofCol = roof; const roofG = new THREE.ExtrudeGeometry(tri, { depth: D + 0.9, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.16, bevelSegments: 2, steps: 1 }); roofG.translate(0, H + 0.25, -(D + 0.9) / 2);
  parts.push(tinted(roofG, roofCol, 0.1, r));
  parts.push(tinted(box(0.5, 0.3, D + 1.2, 0, H + 2.5, 0), ridge, 0.05, r));
  /* gable ends: cream with a beam triangle */
  parts.push(tinted(box(0.14, 0.12, D, 0, H + 1.3, 0), OAK, 0.05, r));
  /* the door, two windows with shutters and flower boxes */
  parts.push(tinted(box(1.0, 1.8, 0.12, 0, 0.9, D / 2 + 0.06), door, 0, r));
  for (const sx of [-1, 1]) { const wx = sx * W * 0.3;
    parts.push(tinted(box(0.8, 0.7, 0.1, wx, 1.5, D / 2 + 0.06), 0x3a4a5e, 0, r));
    for (const k of [-1, 1]) parts.push(tinted(box(0.32, 0.74, 0.06, wx + k * 0.58, 1.5, D / 2 + 0.08), shutter, 0.05, r));
    parts.push(tinted(box(0.9, 0.18, 0.26, wx, 1.07, D / 2 + 0.16), 0x6a4a2c, 0, r));
    for (let f = 0; f < 6; f++) parts.push(tinted(box(0.13, 0.13, 0.13, wx - 0.36 + f * 0.145, 1.23, D / 2 + 0.2 + (r() - 0.5) * 0.06), [0xe0402a, 0xf6d040, 0xfffaf0, 0xe86a9a][f % 4], 0.08, r)); }
  /* a stone chimney through the thatch */
  parts.push(tinted(box(0.75, 2.4, 0.75, W * 0.28, H + 1.6, -D * 0.12), 0xb0a490, 0.08, r));
  parts.push(tinted(box(0.9, 0.18, 0.9, W * 0.28, H + 2.85, -D * 0.12), 0x8a7e6c, 0, r));
  const m = new THREE.Mesh(mergeKeepColor(parts), paintMaterial({ wrap: 0.45, grain: 0.12 })); m.position.set(x, y0, z); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; L.add(m);
  L.current.owned.push(m.material); K.solid(ctx, x, z, Math.max(W, D) * 0.6, 'hut');
}
/* a village well: a round stone wall, two posts, a little red roof, a bucket */
function buildWell(ctx, L, x, z, rot) {
  const r = rng(ctx.seed + 606); const y0 = ctx.H(x, z) - 0.1; const parts = [];
  const ring = new THREE.CylinderGeometry(0.95, 1.0, 0.85, 20, 1, true); ring.translate(0, 0.42, 0); parts.push(tinted(ring, 0xb8b0a0, 0.12, r));
  const rim = new THREE.TorusGeometry(0.98, 0.1, 6, 20); rim.rotateX(Math.PI / 2); rim.translate(0, 0.86, 0); parts.push(tinted(rim, 0xa49c8c, 0.08, r));
  const water = new THREE.CircleGeometry(0.9, 20); water.rotateX(-Math.PI / 2); water.translate(0, 0.5, 0); parts.push(tinted(water, 0x2a4a6a, 0, r));
  for (const sx of [-1, 1]) parts.push(tinted(box(0.14, 2.1, 0.14, sx * 0.9, 1.05, 0), 0x5a3e28, 0.05, r));
  parts.push(tinted(box(2.1, 0.12, 0.12, 0, 1.95, 0), 0x5a3e28, 0.05, r));
  const rf = new THREE.ConeGeometry(1.5, 0.9, 4); rf.rotateY(Math.PI / 4); rf.scale(1, 1, 0.75); rf.translate(0, 2.45, 0); parts.push(tinted(rf, 0xb8402c, 0.06, r));
  const bucket = new THREE.CylinderGeometry(0.16, 0.13, 0.25, 10); bucket.translate(0.3, 1.3, 0); parts.push(tinted(bucket, 0x7a5a3a, 0.05, r));
  const m = new THREE.Mesh(mergeKeepColor(parts), paintMaterial({ wrap: 0.45, grain: 0.12 })); m.position.set(x, y0, z); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; L.add(m);
  L.current.owned.push(m.material); K.solid(ctx, x, z, 1.2, 'well');
}
/* haystacks: soft golden domes with a darker skirt, in the fields */
function buildHaystacks(ctx, L, spots) {
  const r = ctx.r; const g = new THREE.SphereGeometry(1, 14, 10, 0, TAU, 0, Math.PI * 0.55); const p = g.attributes.position; const col = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + 0.05 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 7 + y * 9); p.setXYZ(i, p.getX(i) * k, y * 1.25, p.getZ(i) * k); c.set(0xb08a40).lerp(new THREE.Color(0xf2d27a), Math.min(1, y * 1.1 + 0.15)); col.set([c.r, c.g, c.b], i * 3); }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv');
  const mat = paintMaterial({ wrap: 0.5, grain: 0.2, rough: 0.95 }); const list = spots.map(([x, z]) => ({ x, y: ctx.H(x, z) - 0.15, z, ry: r() * TAU, s: 1.0 + r() * 0.5, sy: 1 }));
  L.instanced(g, mat, list); L.current.owned.push(g, mat);
  for (const [x, z] of spots) if (Math.hypot(x, z) < 140) K.solid(ctx, x, z, 1.2, 'stone');
}
/* hedgerows: low rounded bushes along a line */
function buildHedge(ctx, L, pts, { tones = [0x24481a, 0x4a8030, 0x8ab850] } = {}) {
  const r = ctx.r; const g = K.crownClusterGeo(r, { ends: 7, per: 30, size: 0.24, spread: 0.32, flat: 0.55, tones }); const mat = K.leafClusterMaterial(0xffffff, { trans: 0x2a4a10 }); const list = [];
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i]; const [bx, bz] = pts[i + 1]; const len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += 1.6) { const t = d / len; const x = lerp(ax, bx, t) + (r() - 0.5) * 0.5; const z = lerp(az, bz, t) + (r() - 0.5) * 0.5; if (Math.hypot(x, z) < ARENA_R + 2) continue; if (angOff(Math.atan2(z, x)) < 0.12 && Math.hypot(x, z) < 260) continue;
      list.push({ x, y: ctx.H(x, z) + 0.2, z, ry: r() * TAU, s: 1.1 + r() * 0.6, sy: 0.9 }); } }
  L.instanced(g, mat, list); L.current.owned.push(g, mat);
}


/* one art language. Faceted pieces (stones, wall chunks) get smooth normals: the same soft painted read as the oaks */
function smoothNormals(g, q = 1e3) {
  const p = g.attributes.position; const n = g.attributes.normal; if (!n) { g.computeVertexNormals(); return g; } const acc = new Map(); const key = (i) => `${Math.round(p.getX(i) * q)},${Math.round(p.getY(i) * q)},${Math.round(p.getZ(i) * q)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i); const a = acc.get(k) || [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
  for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)); const l = Math.hypot(a[0], a[1], a[2]) || 1; n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  n.needsUpdate = true; return g;
}
/* storybook peaks: tall rounded spires and broad snowy domes, painted (slate-blue rock darkening to the base, soft
   snow on the upper third and on every upward face), a collar of cloud round the foot so they rise through the haze or
   the cloud sea. list = [x, z, H, R, y0]. */
function buildPeaks(ctx, L, list, { rock = [0x4e5c7c, 0x8494b4], snow = 0xf6f8fc, snowAt = 0.55, collar = true, collarY = 6, lit = 0xffffff, shade = 0xb4c2d8 } = {}) {
  const land = L.current; const r = rng(ctx.seed + 919); const geos = [];
  const cR0 = new THREE.Color(rock[0]); const cR1 = new THREE.Color(rock[1]); const cS = new THREE.Color(snow); const c = new THREE.Color();
  /* no row of identical cones. Each peak gets 0-2 lower shoulder peaks round its foot (a massif, not a spike), and a
     third of them are broad snowy domes; the shoulder bump on the profile is stronger, so the outlines step */
  const all = [];
  for (const e of list) { all.push(e); const [x, z, H, R, y0] = e; const ns = Math.floor(r() * 2.6);
    for (let k = 0; k < ns; k++) { const a = r() * TAU; const d = R * (0.55 + r() * 0.35); all.push([x + Math.cos(a) * d, z + Math.sin(a) * d, H * (0.4 + r() * 0.25), R * (0.55 + r() * 0.25), y0, r(), true]); } }
  for (const [x, z, H, R, y0, spire = 0.5, shoulder = false] of all) {
    /* the shoulders are broad domes half the time; a main peak stays a spire (a spire on a dome read as a nipple) */
    const dome = shoulder && r() < 0.5; const HH = dome ? H * 0.62 : H; const pts = []; const N = 30; const sh = 0.25 + r() * 0.3; const shK = 0.12 + r() * 0.16;
    for (let i = 0; i <= N; i++) { const t = i / N; const prof = (dome ? Math.pow(Math.max(0, 1 - Math.pow(t, 1.6)), 0.6) : Math.pow(1 - t, 0.55 + spire * 0.9) * (1 - 0.12 * Math.sin(t * Math.PI))) * (1 + shK * Math.exp(-(((t - sh) / 0.12) ** 2))); pts.push(new THREE.Vector2(Math.max(0.001, R * prof), t * HH)); }
    const g = new THREE.LatheGeometry(pts, 48); const p = g.attributes.position; const sd = r() * 50; const lean = r() - 0.5;
    for (let i = 0; i < p.count; i++) { const px = p.getX(i); const py = p.getY(i); const pz = p.getZ(i); const t = py / HH; const rad = Math.hypot(px, pz); if (rad < 1e-4) { p.setX(i, px + t * t * R * 0.28 * lean); continue; } const a = Math.atan2(pz, px);
      const k = 1 + 0.22 * (fbm(Math.cos(a) * 2.2 + sd, Math.sin(a) * 2.2 + t * 3, 3) - 0.5) * 2 + 0.1 * (ridged(Math.cos(a) * 4 + sd, t * 6 + Math.sin(a) * 4, 2) - 0.5);
      p.setXYZ(i, px * k + t * t * R * 0.28 * lean, py, pz * k); }
    g.computeVertexNormals(); const nn = g.attributes.normal; const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / HH; const a = Math.atan2(p.getZ(i), p.getX(i)); c.copy(cR0).lerp(cR1, smooth(0.0, 0.7, t)); c.multiplyScalar(0.7 + 0.45 * ridged(Math.cos(a) * 5 + sd, Math.sin(a) * 5 + t * 2.5, 2));
      const sn = smooth(snowAt - 0.06, snowAt + 0.04, t + (fbm(Math.cos(a) * 3 + sd, Math.sin(a) * 3 + t * 5, 3) - 0.5) * 0.3 + Math.max(0, nn.getY(i) - 0.6) * 0.15);
      c.lerp(cS, sn * 0.96); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); g.translate(x, y0, z); geos.push(g);
  }
  if (!geos.length) return;
  const mat = paintMaterial({ wrap: 0.55, grain: 0.06, rough: 0.95 }); mat.envMapIntensity = 0.5;
  const m = new THREE.Mesh(mergeKeepColor(geos), mat); m.castShadow = false; m.receiveShadow = false; L.add(m); land.owned.push(m.geometry, mat);
  if (!collar) return;
  const cm = sbCloud(land, cloudMaterial({ lit, shade, grad: 0.8 })); const P = [];
  for (const [x, z, H, R] of list) for (let k = 0; k < 16; k++) { const a = r() * TAU; const d = R * (0.75 + r() * 0.4); P.push([x + Math.cos(a) * d, collarY + r() * H * 0.12, z + Math.sin(a) * d, R * (0.22 + r() * 0.14), 0.35 + r() * 0.3]); }
  const cl = cloudMesh(P, cm, 3131); cl.renderOrder = 1; land.group.add(cl); land.owned.push(cl.geometry, cm); land.tickers.push((t) => { cm.uniforms.uTime.value = t * 0.3; });
}
/* peak spots on a ring, never on the nemesis line (the giant's storm owns it) */
function peakRing(ctx, n, d0, d1, H0, H1, R0, R1, skip = 0.45, y0 = 0) {
  const r = rng(ctx.seed + 4141); const out = []; let guard = 0;
  while (out.length < n && guard++ < 400) { const a = r() * TAU; if (angOff(a) < skip) continue; const d = d0 + r() * (d1 - d0); const [x, z] = polar(a, d); const R = R0 + r() * (R1 - R0);
    if (out.some(([ox, oz, , oR]) => Math.hypot(ox - x, oz - z) < (oR + R) * 0.8)) continue; out.push([x, z, H0 + r() * (H1 - H0), R, typeof y0 === 'function' ? y0(x, z) : y0, r()]); }
  return out;
}

/* ---------- the cloud world (Cloud Peaks) ---------- */
/* a sea of cloud below the plateau: one big lumpy sheet, lit white on the billows, lilac-blue in the troughs, warm toward
   the sun; it melts into the haze at the horizon. The plateau's edge drops into it. */
function buildCloudSea(ctx, L, { y = -3, R = 1300, seg = 170 } = {}) {
  const land = L.current; const g = new THREE.PlaneGeometry(R * 2, R * 2, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; const col = new Float32Array(p.count * 3); const lo = new THREE.Color(0xa4b6d2); const hi = new THREE.Color(0xffffff); const warm = new THREE.Color(0xfff6e6); const far = new THREE.Color(0xdae6f2); const c = new THREE.Color();
  const sun = new THREE.Vector2(-0.6, 0.68).normalize();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); const z = p.getZ(i);
    const b = fbm(x * 0.005 + 3, z * 0.005 - 2, 4); const m = fbm(x * 0.022 - 7, z * 0.022 + 4, 3); const k = Math.pow(clamp(b * 1.15 - 0.1, 0, 1), 1.6);
    const rr0 = Math.hypot(x, z); const h = y + k * 15 + m * 4 + 4 * smooth(250, 700, rr0); p.setY(i, h);
    const t = clamp((h - y) / 15 + (m - 0.5) * 0.4, 0, 1); c.copy(lo).lerp(hi, smooth(0.05, 0.7, t)); const rr = Math.hypot(x, z) || 1; c.lerp(warm, clamp((x / rr * sun.x + z / rr * sun.y) * 0.5 + 0.1, 0, 1) * 0.45 * t); c.lerp(far, smooth(450, 1250, rr) * 0.85); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); g.deleteAttribute('uv');
  /* fog off: the haze would turn it to the plateau's colour; the sheet fades to the horizon colour by itself */
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, emissive: 0x485468, emissiveIntensity: 0.4, envMapIntensity: 0.6, fog: false });
  const m = new THREE.Mesh(g, mat); m.receiveShadow = false; m.castShadow = false; L.add(m); land.owned.push(g, mat);
  land.tickers.push((t) => { m.position.x = Math.sin(t * 0.01) * 6; m.position.z = t * 0.6 % 40; });
}
/* banks of cloud that lie on the meadow (soft painted billboards, no solids): the hero walks between them; a thicker
   rim of cloud where the plateau drops into the sea */
function buildCloudBanks(ctx, L, { n = 11, d = [24, 90], rim = [128, 200] } = {}) {
  const land = L.current; const r = rng(ctx.seed + 333); const f = ctx.f;
  const mat = sbCloud(land, cloudMaterial({ lit: 0xfffaf2, shade: 0xb8b8d8, grad: 0.9 })); const P = [];
  for (let i = 0, made = 0; i < 200 && made < n; i++) { const a = r() * TAU; if (angOff(a) < 0.32) continue; const dd = d[0] + r() * (d[1] - d[0]); const [x, z] = polar(a, dd);
    if (lineDist(f.path, x, z) < 6 || (f.ring && Math.hypot(x - f.ring.x, z - f.ring.z) < 16)) continue;
    const clear = (px, pz, rad) => !(f.oaks || []).some(([ox, oz, H]) => Math.hypot(ox - px, oz - pz) < rad + H * 0.55) && !(f.stones || []).some(([sx, sz]) => Math.hypot(sx - px, sz - pz) < rad + 1.5);
    if (!clear(x, z, 8)) continue; made++;
    const len = 8 + r() * 14; const ang = r() * TAU;
    for (let k = 0; k < 18; k++) { const u = (r() - 0.5) * len; const v = (r() - 0.5) * 4; const hh = r(); const sz = 2.2 + r() * 2.6 - hh * 0.8; const px = x + Math.cos(ang) * u - Math.sin(ang) * v; const pz = z + Math.sin(ang) * u + Math.cos(ang) * v;
      if (!clear(px, pz, sz)) continue;
      /* the puff's lower edge rides above the highest ground under it, so no card cuts a hill */
      const gy = Math.max(ctx.H(px, pz), ctx.H(px + sz, pz), ctx.H(px - sz, pz), ctx.H(px, pz + sz), ctx.H(px, pz - sz));
      P.push([px, gy + sz * 1.05 + hh * 3.0, pz, sz, 0.55 - hh * 0.4]); } }
  for (let i = 0; i < 150; i++) { const a = r() * TAU; if (angOff(a) < 0.14) continue; const dd = rim[0] + r() * (rim[1] - rim[0]); const [x, z] = polar(a, dd); const hh = r(); P.push([x, 2 + hh * 16, z, 14 + r() * 12 - hh * 4, 0.55 - hh * 0.45]); }
  /* a LOW rim on the nemesis line too: the gap showed the cloud sea's far edge as thin white streaks beside the giant
. These puffs top out near 25 m, so the giant (92 m, wading in the sea) still stands clear above them */
  { const r2 = rng(ctx.seed + 334); for (let i = 0; i < 26; i++) { const a = NEMESIS_ANG + (r2() - 0.5) * 0.34; const dd = rim[0] + r2() * (rim[1] - rim[0] + 40); const [x, z] = polar(a, dd); P.push([x, -4 + r2() * 4, z, 8 + r2() * 5, 0.5]); } }
  const m = cloudMesh(P, mat, 4242); m.renderOrder = 1; land.group.add(m); land.owned.push(m.geometry, mat);
  land.tickers.push((t) => { mat.uniforms.uTime.value = t * 0.4; });
}
/* floating sky islands: a grassy top with round storybook trees over a hanging root of ochre rock, bobbing slowly */
function buildSkyIslands(ctx, L, { n = 8 } = {}) {
  const land = L.current; const r = rng(ctx.seed + 515); const mat = paintMaterial({ wrap: 0.5, grain: 0.08, rough: 0.92 }); mat.envMapIntensity = 0.5;
  const isl = [];
  for (let i = 0, made = 0; i < 80 && made < n; i++) { const a = r() * TAU; if (angOff(a) < 0.4) continue; const dd = 150 + r() * 210; const [x, z] = polar(a, dd); if (isl.some((q) => Math.hypot(q.x - x, q.z - z) < 70)) continue; made++;
    /* never higher than about 20 degrees over the eye, so no island is cut by the top of the first views */
    const R = 9 + r() * 14 * (dd / 250); const y = Math.min(38 + r() * 70 + dd * 0.08, dd * 0.36); const parts = [];
    /* the hanging rock: a rounded, lumpy bulb that narrows to a root (not a spinning top) */
    /* smooth, painted (no facets): a rounded bulb of warm rock in soft strata, a thick rounded turf lip, roots and vines hanging off */
    const RH = R * (1.1 + r() * 0.5); const rock = new THREE.SphereGeometry(R, 32, 18, 0, TAU, Math.PI / 2, Math.PI / 2); { const q = rock.attributes.position; for (let k = 0; k < q.count; k++) { const qx = q.getX(k); const qy = q.getY(k); const qz = q.getZ(k); const t = -qy / R; const nn = (1 - 0.55 * t * t) * (1 + 0.18 * (fbm(qx * 0.12 + i, qz * 0.12 + qy * 0.08, 2) - 0.5) * 2); q.setXYZ(k, qx * nn, qy * RH / R, qz * nn); } }
    rock.computeVertexNormals();
    { const q = rock.attributes.position; const cc = new Float32Array(q.count * 3); const c = new THREE.Color(); const cA = new THREE.Color(0xb88e60); const cB = new THREE.Color(0x8a6244); const cD = new THREE.Color(0x5e4636); const cM = new THREE.Color(0x6a9a3e);
      for (let k = 0; k < q.count; k++) { const t = -q.getY(k) / RH; const band = 0.5 + 0.5 * Math.sin(t * 9 + fbm(q.getX(k) * 0.1, q.getZ(k) * 0.1, 2) * 3); c.copy(cA).lerp(cB, band * 0.6).lerp(cD, smooth(0.5, 1, t) * 0.6); c.lerp(cM, smooth(0.12, 0, t) * 0.7); cc.set([c.r, c.g, c.b], k * 3); }
      rock.setAttribute('color', new THREE.BufferAttribute(cc, 3)); rock.deleteAttribute('uv'); }
    parts.push(rock);
    const lip = new THREE.TorusGeometry(R * 0.97, R * 0.07, 10, 32); lip.rotateX(Math.PI / 2); lip.translate(0, R * 0.04, 0); lip.computeVertexNormals(); parts.push(paintV(lip, 0x7cba48));
    const grassTop = new THREE.CylinderGeometry(R * 0.98, R * 0.98, R * 0.1, 32); grassTop.translate(0, R * 0.06, 0); parts.push(paintV(grassTop, 0x9ad25c));
    /* roots and vines: thin tapering strands that hang from the rock */
    for (let k = 0; k < 7; k++) { const a = r() * TAU; const rr0 = R * (0.3 + r() * 0.55); const yb = -RH * (1 - rr0 / R) * 0.9 - 0.2; const len = R * (0.3 + r() * 0.5); const v = new THREE.CylinderGeometry(0.06, R * 0.025, len, 5); v.translate(0, -len / 2, 0); v.rotateZ((r() - 0.5) * 0.3); v.translate(Math.cos(a) * rr0, yb + 0.5, Math.sin(a) * rr0); v.computeVertexNormals(); parts.push(paintV(v, k % 3 ? 0x7a5a3e : 0x5e8a34)); }
    const nt = 1 + Math.floor(r() * 3);
    for (let k = 0; k < nt; k++) { const ta = r() * TAU; const tr = r() * R * 0.55; const th = 3 + r() * 3; const tx = Math.cos(ta) * tr; const tz = Math.sin(ta) * tr;
      const tk = new THREE.CylinderGeometry(0.35, 0.55, th, 10); tk.translate(tx, R * 0.08 + th / 2, tz); parts.push(paintV(tk, 0x8a6a4a));
      const cr = crownMassGeo(r); const cs = th * 1.4; cr.scale(cs, cs, cs); cr.translate(tx, R * 0.08 + th + cs * 0.3, tz); parts.push(cr); }
    if (made === 1) { const tw = new THREE.CylinderGeometry(1.6, 1.9, 11, 16); tw.translate(R * 0.3, R * 0.08 + 5.5, -R * 0.2); parts.push(paintV(tw, 0xf1e6cf)); const rf = new THREE.ConeGeometry(2.3, 5, 16); rf.translate(R * 0.3, R * 0.08 + 13.5, -R * 0.2); parts.push(paintV(rf, 0x2f5fb0)); }
    const g = mergeKeepColor(parts); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = r() * TAU; m.castShadow = false; m.receiveShadow = true; L.add(m); land.owned.push(g);
    isl.push({ x, z, m, y, ph: r() * TAU });
  }
  land.owned.push(mat);
  land.tickers.push((t) => { for (const q of isl) q.m.position.y = q.y + Math.sin(t * 0.25 + q.ph) * 1.2; });
}

/* the near field: keep the lower third of each land view filled with low props, not empty grass. From the arena
   centre the lower half of the frame is the ground, 3-30 m out, and the fight needs the inner 16 m flat and free of solids.
   So: inside the arena only low, walk-through flora (dense drifts of big wildflowers in patches, low leafy clumps, a few
   pebbles); on the arena's rim (17-26 m) a split-rail fence in runs that break for the path and the nemesis line, with hay
   bales or cairns beside it. Both first views (FRONT and its reverse) get some of each. */
function fenceSegGeo(r, len) {
  const parts = [];
  parts.push(tinted(box(0.15, 1.25, 0.15, 0, 0.55, 0), 0x6a4a2e, 0.1, r));
  parts.push(tinted(new THREE.ConeGeometry(0.11, 0.12, 4).rotateY(Math.PI / 4).translate(0, 1.23, 0), 0x5a3e26, 0.05, r));
  for (const [y, sag] of [[0.95, 0.03], [0.5, 0.02]]) { const rail = new THREE.CylinderGeometry(0.055, 0.06, len, 6); rail.rotateX(Math.PI / 2); rail.translate(0, y - sag, len / 2); parts.push(tinted(rail, 0x8a6a46, 0.12, r)); }
  return mergeKeepColor(parts);
}
function buildFence(ctx, L, runs) {
  const r = rng(ctx.seed + 2323); const SEG = 2.7; const g = fenceSegGeo(r, SEG); const list = [];
  const f = ctx.f; const paths = [f.path, f.road].filter(Boolean);
  for (const [a0, a1, R] of runs) {
    const n = Math.max(2, Math.round(Math.abs(a1 - a0) * R / SEG));
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / n); const b = a0 + (a1 - a0) * ((i + 1) / n); const rr = R + Math.sin(a * 3.1) * 0.8;
      const [x, z] = polar(a, rr); const [x2, z2] = polar(b, R + Math.sin(b * 3.1) * 0.8);
      if (angOff(a) < 0.3 || paths.some((p) => lineDist(p, x, z) < 3 || lineDist(p, x2, z2) < 3)) continue;
      const ry = Math.atan2(x2 - x, z2 - z); const len = Math.hypot(x2 - x, z2 - z);
      list.push({ x, y: ctx.H(x, z) - 0.05, z, ry, tx: (r() - 0.5) * 0.06, tz: (r() - 0.5) * 0.06, s: 1, sy: 1, sz: len / SEG });
      K.solid(ctx, x, z, 0.25, 'pole');
    }
  }
  /* the instancer takes one scale (s) and a y scale (sy): runs are cut so each segment is close to SEG long */
  L.instanced(g, paintMaterial({ wrap: 0.45, grain: 0.15, rough: 0.9 }), list.map((o) => ({ ...o, s: Math.min(1.15, Math.max(0.85, o.sz)) })));
}
/* round hay bales: golden drums with a wound face, lying on their side */
function buildBales(ctx, L, spots) {
  const r = rng(ctx.seed + 919); const g = new THREE.CylinderGeometry(0.75, 0.75, 1.1, 18, 2); g.rotateZ(Math.PI / 2); g.translate(0, 0.72, 0);
  { const p = g.attributes.position; const col = new Float32Array(p.count * 3); const c = new THREE.Color(); for (let i = 0; i < p.count; i++) { const rad = Math.hypot(p.getY(i) - 0.72, p.getZ(i)); const face = Math.abs(p.getX(i)) > 0.54; c.set(face ? 0xd8b058 : 0xe8c870).multiplyScalar(face ? 0.82 + 0.18 * Math.sin(rad * 40) : 0.9 + (r() - 0.5) * 0.12); col.set([c.r, c.g, c.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); }
  L.instanced(g, paintMaterial({ wrap: 0.5, grain: 0.22, rough: 0.95 }), spots.map(([x, z]) => ({ x, y: ctx.H(x, z) - 0.05, z, ry: r() * TAU, s: 0.9 + r() * 0.25, sy: 1 })));
  for (const [x, z] of spots) K.solid(ctx, x, z, 0.9, 'stone');
}
/* cairns: four to six flat stones stacked, a little off true */
function buildCairns(ctx, L, spots) {
  const r = rng(ctx.seed + 717); const parts = []; let y = 0;
  for (let k = 0; k < 5; k++) { const w = 0.62 - k * 0.09; const h = 0.22 - k * 0.015; const s = new THREE.SphereGeometry(1, 10, 6); s.scale(w, h, w * 0.85); s.rotateY(r() * TAU); s.translate((r() - 0.5) * 0.06, y + h * 0.8, (r() - 0.5) * 0.06); parts.push(tinted(s, [0xb8b2a4, 0xa49e90, 0xc4beb0][k % 3], 0.1, r)); y += h * 1.55; }
  const g = mergeKeepColor(parts); smoothNormals(g, 60);
  L.instanced(g, paintMaterial({ wrap: 0.35, grain: 0.2, rough: 0.9 }), spots.map(([x, z]) => ({ x, y: ctx.H(x, z) - 0.05, z, ry: r() * TAU, s: 1 + r() * 0.5, sy: 1 })));
  for (const [x, z] of spots) K.solid(ctx, x, z, 0.6, 'stone');
}
/* low leafy clumps (knee high, walk-through) in the near field */
function buildClumps(ctx, L, { n = 40, d = [5, 15], tones = [0x2e5a1e, 0x5a9a34, 0x9ccc58] } = {}) {
  const r = rng(ctx.seed + 5151); const g = K.crownClusterGeo(r, { ends: 6, per: 26, size: 0.22, spread: 0.3, flat: 0.5, tones }); const mat = K.leafClusterMaterial(0xffffff, { trans: 0x2a4a10 }); const list = [];
  for (let i = 0; i < n * 4 && list.length < n; i++) { const a = r() * TAU; if (angOff(a) < 0.25) continue; const dd = d[0] + r() * (d[1] - d[0]); const [x, z] = polar(a, dd);
    if (lineDist(ctx.f.path, x, z) < 2 || fbm(x * 0.08 + 7, z * 0.08, 2) < 0.45) continue; list.push({ x, y: ctx.H(x, z) + 0.08, z, ry: r() * TAU, s: 0.42 + r() * 0.3, sy: 0.75 }); }
  L.instanced(g, mat, list, { shadow: true }); L.current.owned.push(g, mat);
}
/* the near field for one land: runs of fence on the arena rim in both views, and its own pieces beside them */
function buildNearField(ctx, L, { bales = true } = {}) {
  const r = rng(ctx.seed + 3131);
  const runs = [[FRONT - 0.75, FRONT - 0.18, 19.5], [FRONT + 0.32, FRONT + 0.9, 21], [FRONT + Math.PI - 0.7, FRONT + Math.PI - 0.12, 20], [FRONT + Math.PI + 0.25, FRONT + Math.PI + 0.85, 22.5]];
  buildFence(ctx, L, runs);
  const spots = []; for (const [a0, a1, R] of runs) for (let k = 0; k < 2; k++) { const a = a0 + (a1 - a0) * (0.2 + r() * 0.6); const [x, z] = polar(a, R + 2.2 + r() * 2.5); if (angOff(a) > 0.32 && lineDist(ctx.f.path, x, z) > 3) spots.push([x, z]); }
  if (bales) buildBales(ctx, L, spots); else buildCairns(ctx, L, spots);
  buildClumps(ctx, L);
  /* big wildflowers in drifts right up to the hero's feet (the poppies and daisies of the near field) */
  buildFlowers(ctx, L, { n: 1600, d: [3.2, 19], colors: [[0xe0402a, 0x1e1410], [0xfffaf0, 0xf2c030], [0xf6d040, 0xc8801a], [0xe86a9a, 0xf6e0a0], [0x7a94e8, 0xf0e0a0]], size: [0.42, 0.72],
    density: (ctx, x, z) => (lineDist(ctx.f.path, x, z) < 1.4 ? 0 : smooth(0.4, 0.52, fbm(x * 0.11 + 5, z * 0.11 - 2, 3))) });
}

/* ---------- the storm over the arena (the Storm Giant's fight) ----------
   The Storm Giant writes STORM (storybook-boss.js): k = storm, clear = the bright sky after his death. Each storybook land
   runs one ticker that reads it and moves its own weather with it:
   - the sky: the blue and the fair clouds go to a low slate overcast that races, storm cells flicker inside it, the sky
     flashes with lightning (the sky shader's own lightning, lit by world.flash);
   - the light on the land: this module's LOOK entry (looks.<land>) is the live table world.js reads every frame, so the key
     drops and cools, the sun disc goes, the fill and the environment fall, the haze thickens and greys, the grade loses
     saturation; the painted cloud billboards on the land (anvils, banks, collars) go slate;
   - rain: slanted streaks round the hero with splashes; wind: the grass and the pennants move faster;
   - bolts: a glowing fork comes down out of the overcast somewhere round the field every few seconds;
   - clear: after his death the overcast lifts, the light comes back warmer and more saturated than the plain day (the
     rainbow's moment), then everything eases back to the land's own day when the fight is gone.
   Nothing is written while the card owns the sky (Lands.cardSaved). */
const SB_STORM = {
  meadow: { top: 0x3a4456, hor: 0x8c96a6, fog: 0x7c8898, skyTop: 0x3a4456, skyBot: 0x8c96a6, clouds: 0.98, cloudCol: 0x2e3546, cloudLit: 0x8e98ac, cells: 1, band: 0, spd: 2.6,
    keyI: 1.35, keyCol: 0xbac6dc, fill: 0.8, rimI: 0.2, exp: 0.76, disc: 0, haloI: 0, fogD: 0.0026, fogMax: 0.66, fogSky: 0.55, sat: 0.84, con: 0.2, lift: 0x141c2c, gain: 0xdce6f4, env: 0.45, cloudLitB: 0x9aa4b8, cloudShadeB: 0x343c50 },
  clear: { top: 0x2464c8, hor: 0xd8ecf8, fog: 0xc4dcee, clouds: 0.22, keyI: 3.5, keyCol: 0xfff0c8, sat: 1.32, con: 0.18, fogD: 0.0005, fogMax: 0.3, exp: 0.8, env: 1.0, gain: 0xfff2dc },
};
const _ca = new THREE.Color(); const _cb = new THREE.Color(); const _cc = new THREE.Color();
const mixC = (base, storm, clear, k, c, out = _cc) => { out.set(base); if (k > 0) out.lerp(_ca.set(storm), k); if (c > 0 && clear != null) out.lerp(_cb.set(clear), c); return out; };
const mixN = (base, storm, clear, k, c) => { let v = base + (storm - base) * k; if (clear != null) v += (clear - v) * c; return v; };
/* the land's day look, kept once (the storm writes into looks.<land>, the base never changes) */
const LOOK_BASE = {};
function lookBase(id) { if (!LOOK_BASE[id]) { const L = looks[id]; LOOK_BASE[id] = JSON.parse(JSON.stringify(L)); } return LOOK_BASE[id]; }
function stormLook(id, k, c) {
  const L = looks[id]; const B = lookBase(id); const S = SB_STORM.meadow; const C = SB_STORM.clear;
  L.keyI = mixN(B.keyI, S.keyI, C.keyI, k, c); L.keyCol = mixC(B.keyCol, S.keyCol, C.keyCol, k, c).getHex(); L.fill = mixN(B.fill, S.fill, null, k, c); L.rimI = mixN(B.rimI, S.rimI, null, k, c);
  L.exp = mixN(B.exp, S.exp, C.exp, k, c);
  L.disc.i = mixN(B.disc.i, S.disc, null, k, c); L.disc.haloI = mixN(B.disc.haloI, S.haloI, null, k, c);
  L.fog.d = mixN(B.fog.d, S.fogD, C.fogD, k, c); L.fog.max = mixN(B.fog.max, S.fogMax, C.fogMax, k, c); L.fog.sky = mixN(B.fog.sky, S.fogSky, null, k, c);
  L.grade.sat = mixN(B.grade.sat, S.sat, C.sat, k, c); L.grade.con = mixN(B.grade.con, S.con, C.con, k, c);
  L.grade.lift = mixC(B.grade.lift, S.lift, null, k, c).getHex(); L.grade.gain = mixC(B.grade.gain, S.gain, C.gain, k, c).getHex();
  L.env.intensity = mixN(B.env.intensity, S.env, C.env, k, c);
}
/* every painted cloud material a land builds registers here, so the storm can turn it slate */
function sbCloud(land, mat) { (land.sbClouds || (land.sbClouds = [])).push({ mat, lit: mat.uniforms.uLit.value.clone(), shade: mat.uniforms.uShade.value.clone() }); return mat; }
function buildStorm(ctx, L) {
  const land = L.current; const w = L.world; const st = L.skyTarget; const u = L.skyU; const id = land.id; const A = lands[id];
  if (!st || !looks[id] || !A) return;
  stormLook(id, 0, 0);
  const S = SB_STORM.meadow; const C = SB_STORM.clear;
  const base = { clouds: st.clouds, cells: st.cells, band: st.band, lightning: st.lightning, cloudCol: st.cloudCol.getHex(), cloudLit: st.cloudLit.getHex(), spd: u.uCloudSpd.value, top: A.sky.top, hor: A.sky.hor, pow: A.sky.pow ?? 0.6 };
  /* rain round the hero, leaning with the wind */
  const rain = rainPool(w.scene, 2600, { len: 0.85, width: 0.011, splashes: 140, slant: [0.22, 0.1] }); rain.alpha = 0; land.owned.push(rain);
  /* bolts out of the overcast, round the field */
  const r = rng(ctx.seed + 4747); const bm = glowBoltMaterial(0xbcd6ff, 2.4); land.owned.push(bm);
  const bolts = [0, 1].map(() => { const m = new THREE.Mesh(glowBoltGeo(r, 120, 20, 4), bm); m.visible = false; m.frustumCulled = false; m.renderOrder = 5; land.group.add(m); land.owned.push(m.geometry); return m; });
  let k = 0; let c = 0; let on = false; let gust = 0; let emit = 0; let nextBolt = 2; let nextFlash = 1; let show = 0; let cur = null;
  const write = (kk, cc) => {
    for (const [key, sv, cv] of [['clouds', S.clouds, C.clouds], ['cells', S.cells, 0], ['band', S.band, null]]) st[key] = mixN(base[key], sv, cv, kk, cc);
    st.lightning = base.lightning || kk > 0.25;
    st.cloudCol.copy(mixC(base.cloudCol, S.cloudCol, null, kk, cc)); st.cloudLit.copy(mixC(base.cloudLit, S.cloudLit, null, kk, cc));
    u.uCloudSpd.value = mixN(base.spd, S.spd, null, kk, cc);
    u.uSkyTop.value.copy(mixC(base.top, S.top, C.top, kk, cc)); u.uSkyHor.value.copy(mixC(base.hor, S.hor, C.hor, kk, cc));
    w.target.fog.copy(mixC(A.fogCol, S.fog, C.fog, kk, cc)); w.target.top.copy(mixC(A.skyCols[0], S.skyTop, C.top, kk, cc)); w.target.bottom.copy(mixC(A.skyCols[1], S.skyBot, C.hor, kk, cc));
    for (const q of land.sbClouds || []) { q.mat.uniforms.uLit.value.copy(q.lit).lerp(_ca.set(S.cloudLitB), kk); q.mat.uniforms.uShade.value.copy(q.shade).lerp(_cb.set(S.cloudShadeB), kk); }
    stormLook(id, kk, cc);
  };
  land.tickers.push((t, dt, cx, cz) => {
    k += (STORM.k - k) * Math.min(1, dt * 1.5); c += (STORM.clear - c) * Math.min(1, dt * 1.2);
    if (STORM.k < 1e-3 && k < 0.004) k = 0; if (STORM.clear < 1e-3 && c < 0.004) c = 0;
    const live = k > 0 || c > 0;
    if (!live) { if (on) { on = false; write(0, 0); rain.alpha = 0; for (const b of bolts) b.visible = false; } return; }
    on = true;
    if (L.cardSaved) return;
    write(k, c);
    /* wind: the grass and the pennants sway faster (their phase runs ahead of the clock) */
    gust += dt * k * 2.4; for (const gm of land.grass || []) gm.material.userData.wind.uTime.value = w.time + gust; for (const wu of land.winds) wu.uTime.value = w.time + gust * 1.6;
    /* rain: about 3000 drops a second in a ring 2.6-15.6 m round the hero, from 9-13 m up */
    rain.alpha = Math.min(1, k * 1.3); const gy = ctx.H(cx, cz); rain.ground = gy;
    emit += dt * 3000 * k; while (emit >= 1) { emit -= 1; const a = Math.random() * TAU; const d = 2.6 + Math.sqrt(Math.random()) * 13; /* never in the lens: no drop starts within 2.6 m */ rain.emit(cx + Math.cos(a) * d - 2.2, gy + 9 + Math.random() * 4, cz + Math.sin(a) * d - 1, 13 + Math.random() * 3); }
    rain.update(dt);
    /* lightning: a fork somewhere round the field every 2.5-6 s, the sky flickers between */
    if (k > 0.5) {
      nextBolt -= dt; nextFlash -= dt;
      if (nextBolt <= 0) { nextBolt = 2.5 + Math.random() * 3.5; show = 0.32; cur = bolts[Math.floor(Math.random() * 2)]; const a = Math.random() * TAU; const d = 70 + Math.random() * 110; const bx = cx + Math.cos(a) * d; const bz = cz + Math.sin(a) * d; cur.position.set(bx, ctx.H(bx, bz) - 1, bz); cur.rotation.y = Math.random() * TAU; w.flash?.(0.5 * k); }
      if (nextFlash <= 0) { nextFlash = 1.2 + Math.random() * 2.6; w.flash?.(0.28 * k); }
    }
    if (show > 0) { show -= dt; bm.uniforms.uA.value = (show > 0.2 || (show > 0.07 && show < 0.13) ? 1.2 : 0.3) * k; for (const b of bolts) b.visible = b === cur; } else for (const b of bolts) b.visible = false;
  });
}

/* ======================================================================================================
   The lands (same shape as LOOKS in lands.js)
   ====================================================================================================== */
const GRASS_GREEN = 0xa6f08a;
export const lands = {
  /* ---------------- THE BRIGHT MEADOW: rolling hills, oaks, wildflowers, a hill castle, a windmill, a storm far off ---------------- */
  meadow: {
    sbDay: true, variants: 2, desat: 0.0, groundTint: 0x6a9e3a, fog: [30, 400], hemi: 1, sun: 1, exposure: 1, fogCol: 0xbcd0e2, skyCols: [0x3a74c4, 0xcfe0ee],
    sky: { sunDir: [-0.6, 0.4, 0.68], sunCol: 0x000000, sunGlow: 0, disc: 0, clouds: 0.42, cloudCol: 0xb8c4d6, cloudLit: 0xfffcf4, cloudSpd: 0.5, cloudLo: 0.16, top: 0x2f6cc0, hor: 0xd4e4f0, pow: 0.5, band: 0.12, bandCol: 0xfff0d8 },
    terrain: { A: ['grass_path_2', 6, 0x9cf070], B: ['grass_path_2', 9, 0xc8f468], C: ['castle_wall_slates', 6, 0xd8d0c0], P: 0xffd8a0, rock: [0.55, 0.85], macro: [30, 0.08], nstr: 0.32, rough: [0.95, 0.9], desat: 0.0, bnoise: 0.06, path: 1, haze: [0xb6d4c0, 0.2, 110, 560], specMax: 0.08, env: 0.25 },
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      f.seaAng = NEMESIS_ANG;
      /* the castle on its hill, front left; the windmill on a rise, front right; a hamlet behind */
      f.castle = { a: FRONT - [0.62, 0.78][v] + (r() - 0.5) * 0.06, d: 168 + r() * 20 }; [f.castle.x, f.castle.z] = polar(f.castle.a, f.castle.d);
      f.mill = { a: FRONT + [0.95, 1.1][v] + (r() - 0.5) * 0.1, d: 58 + r() * 10 }; [f.mill.x, f.mill.z] = polar(f.mill.a, f.mill.d);
      f.path = windingPath(r, ...polar(FRONT + Math.PI + 0.25, 150), FRONT - 0.15, 330, 7, 0.18);
      { const [x0, z0] = polar(f.castle.a + 0.18, ARENA_R + 3); const gx = f.castle.x * 0.86; const gz = f.castle.z * 0.86; f.road = []; const N = 26; const px = -(gz - z0); const pz = gx - x0; const pl = Math.hypot(px, pz) || 1;
        for (let i = 0; i <= N; i++) { const t = i / N; const w = Math.sin(t * Math.PI * 2.2 + 0.6) * 9 * Math.sin(t * Math.PI); f.road.push([lerp(x0, gx, t) + px / pl * w, lerp(z0, gz, t) + pz / pl * w]); } }
      f.hamlet = []; for (let i = 0; i < 5; i++) { const a = FRONT + Math.PI + [-0.62, -0.3, -0.05, 0.4, 0.66][i] + (r() - 0.5) * 0.08; f.hamlet.push(polar(a, [46, 66, 84, 52, 72][i] + r() * 8)); }
      f.well = polar(FRONT + Math.PI + 0.16, 30 + r() * 4);
      f.walls = []; for (let i = 0; i < 4; i++) { const a = r() * TAU; if (angOff(a) < 0.4) continue; f.walls.push(windingPath(r, ...polar(a, 34 + r() * 20), a + (r() - 0.5) * 1.8, 60 + r() * 50, 6, 0.4)); }
      f.hay = []; for (let i = 0; i < 40 && f.hay.length < 14; i++) { const a = r() * TAU; if (angOff(a) < 0.3) continue; const d = 30 + r() * 90; const [x, z] = polar(a, d); if (lineDist(f.path, x, z) < 5 || lineDist(f.road, x, z) < 5) continue; for (let k = 0; k < 2 + Math.floor(r() * 3); k++) f.hay.push([x + (r() - 0.5) * 12, z + (r() - 0.5) * 12]); }
      f.hedges = []; for (let i = 0; i < 7; i++) { const a = r() * TAU; if (angOff(a) < 0.4) continue; f.hedges.push(windingPath(r, ...polar(a, 40 + r() * 40), a + Math.PI / 2 + (r() - 0.5) * 0.6, 40 + r() * 40, 6, 0.3)); }
      f.oaks = []; let guard = 0;
      while (f.oaks.length < 70 && guard++ < 4000) {
        const a = r() * TAU; const d = 30 + Math.pow(r(), 0.8) * 180; const [x, z] = polar(a, d);
        if (angOff(a) < 0.22 && d < 280) continue; if (lineDist(f.path, x, z) < 6 || lineDist(f.road, x, z) < 6) continue;
        if (Math.hypot(x - f.castle.x, z - f.castle.z) < 40 || Math.hypot(x - f.mill.x, z - f.mill.z) < 10) continue;
        if (f.hamlet.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 8) || Math.hypot(f.well[0] - x, f.well[1] - z) < 8) continue;
        if (fbm(x * 0.012 + 5, z * 0.012, 2) < 0.42 && r() < 0.8) continue;
        if (f.oaks.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 9)) continue;
        f.oaks.push([x, z, d < 60 ? 6.5 + r() * 2.5 : 9 + r() * 6]); /* near oaks stay small, so the walk does not pass under a frame-filling crown */
      }
      /* a lone great oak near the arena: the first thing on the left */
      f.oaks.push([...polar(FRONT - 1.12 + (r() - 0.5) * 0.1, 44), 12.5]); /* 44 m out (at 27 m it filled the first frame) */
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = (ctx.seed % 97) * 0.37 + ctx.v * 11.3;
      let h = (fbm(x * 0.011 + s, z * 0.011, 4) - 0.42) * 16 * smooth(18, 90, rr) + (fbm(x * 0.035, z * 0.035 + s, 3) - 0.5) * 2.2 * smooth(16, 30, rr);
      h += 30 * Math.pow(smooth(0.35, 0.8, fbm(x * 0.0045 + s, z * 0.0045 - s, 3)), 1.4) * smooth(110, 240, rr);
      h += ranges(x, z, rr, ang, s, { near: [260, 380], far: [420, 640], ampN: 26, ampF: 50, sharp: 1.15, freq: 0.0045, gapK: 0.3 });
      h = Math.max(h, 26 * bump(x, z, f.castle.x, f.castle.z, 70) + h * 0.3);
      h += 5 * bump(x, z, f.mill.x, f.mill.z, 22);
      const dp = Math.min(lineDist(f.path, x, z), lineDist(f.road, x, z)); if (dp < 4 && rr > ARENA_R) h = lerp(h, h * 0.85, smooth(4, 1.5, dp));
      return h;
    },
    mask(ctx, x, z, h, rr) { const f = ctx.f; const n = (fbm(x * 0.3, z * 0.3, 2) - 0.5) * 0.8; const dp = lineDist(f.path, x, z) + n; const dr = lineDist(f.road, x, z) + n; return [Math.max(smooth(1.5, 0.6, dp), smooth(2.4, 1.2, dr)), smooth(0.5, 0.7, fbm(x * 0.025 + 3, z * 0.025, 3)) * 0.8, 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r;
      buildOaks(ctx, L, f.oaks);
      const tops = buildCastle(ctx, L, f.castle.x, f.castle.z, Math.atan2(-f.castle.x, -f.castle.z));
      buildWindmill(ctx, L, f.mill.x, f.mill.z, Math.atan2(-f.mill.x, -f.mill.z) + 0.4);
      /* no copy-paste row: each cottage its own size, facing, wall colour and roof */
      const KINDS = [{ wall: 0xf6eedc, roof: 0xd2a65a, ridge: 0xa87a3a }, { wall: 0xf2d8d0, roof: 0xb4483a, ridge: 0x7a2e24, shutter: 0x3a6a3a }, { wall: 0xdfe6ee, roof: 0x3e5e9a, ridge: 0x2a3e6a, door: 0x6a4a2c }, { wall: 0xf4e4c0, roof: 0xc89848, ridge: 0x8a6430, shutter: 0x8a2a2a }, { wall: 0xeee6d8, roof: 0x8a5a3a, ridge: 0x5a3a24, door: 0x2c5a8a }];
      f.hamlet.forEach(([x, z], i) => { const sc = [1, 1.25, 0.85, 1.1, 0.95][i % 5]; buildCottage(ctx, L, x, z, Math.atan2(-x, -z) + (r() - 0.5) * 1.4, { W: (4.2 + r() * 1.6) * sc, D: (3.4 + r()) * sc, H: (2.3 + r() * 0.5) * sc, ...KINDS[i % 5] }); });
      buildWell(ctx, L, f.well[0], f.well[1], r() * TAU);
      for (const w of f.walls) buildStoneWall(ctx, L, w);
      for (const hgs of f.hedges) buildHedge(ctx, L, hgs);
      /* pennants: along the path just past the arena, and on the castle towers (big, far) */
      const along = []; for (let i = 0; i < f.path.length - 1 && along.length < 8; i++) { const [x, z] = f.path[i]; const d = Math.hypot(x, z); if (d < ARENA_R + 3 || d > 70) continue; if (i % 2) continue; const [bx, bz] = f.path[i + 1]; const dx = bx - x; const dz = bz - z; const l = Math.hypot(dx, dz) || 1; const sd = along.length % 2 ? 1 : -1; along.push([x - dz / l * 2.6 * sd, z + dx / l * 2.6 * sd, 4.2 + r() * 0.8]); }
      for (let i = 3; i < f.road.length - 1; i += 3) { const [x, z] = f.road[i]; const [bx, bz] = f.road[i + 1]; const dx = bx - x; const dz = bz - z; const l = Math.hypot(dx, dz) || 1; const sd = (i / 3) % 2 ? 1 : -1; along.push([x - dz / l * 3.4 * sd, z + dx / l * 3.4 * sd, 4.6 + r() * 0.6]); }
      buildPennants(ctx, L, along);
      { const m = pennantMaterial(0xc8302a); L.current.winds.push(m.userData.wind); const pg = pennantGeo(); const list = tops.map(([x, y, z]) => ({ x, y: y - 0.4, z, ry: 2.6, s: 3.2, sy: 1 })); L.instanced(pg, m, list); }
      buildFlowers(ctx, L, { n: 2600, d: [3, 90], colors: [[0xfffaf0, 0xf2c030], [0xf6d040, 0xc8801a], [0xe0402a, 0x1e1410], [0xfffaf0, 0xf2c030], [0x7a94e8, 0xf0e0a0]], size: [0.22, 0.42], density: (ctx, x, z) => (lineDist(ctx.f.path, x, z) < 1.4 || lineDist(ctx.f.road, x, z) < 2 ? 0 : smooth(0.5, 0.64, fbm(x * 0.045 + 3, z * 0.045 - 7, 3))) });
      /* the giant's weather stays far off: one tall sunlit anvil cloud low on the nemesis line, no smoke */
      buildAnvils(ctx, L, { n: 2, spread: 0.35, dist: 430, H: 150, W: 85, shade: 0xb4c2d6, base: 15 });
      buildFarLightning(ctx, L, { every: [9, 15], dist: [400, 450] });
      buildHaystacks(ctx, L, f.hay);
      /* storybook mountains far off: rounded blue-violet spires with snow, softened by the haze (the old range read as any survival game) */
      buildPeaks(ctx, L, peakRing(ctx, 11, 430, 600, 110, 210, 55, 95, 0.55, (x, z) => ctx.H(x, z) - 30), { rock: [0x343a5e, 0x5a6088], snowAt: 0.74, collarY: 22, lit: 0xfffcf6, shade: 0xc8d4e4 });
      /* a foreground: drifts of poppies and daisies close round the start, both ways */
      buildFlowers(ctx, L, { n: 900, d: [4, 26], colors: [[0xe0402a, 0x1e1410], [0xfffaf0, 0xf2c030], [0xf6d040, 0xc8801a]], size: [0.3, 0.5], density: (ctx, x, z) => (lineDist(ctx.f.path, x, z) < 1.4 ? 0 : smooth(0.48, 0.58, fbm(x * 0.09 + 1, z * 0.09 - 4, 3))) });
      buildNearField(ctx, L, { bales: ctx.look.id === 'meadow' });
      K.addBlobs(ctx, L, ctx.blobs || [], 0.32); ctx.blobs = [];
      buildStorm(ctx, L);
    },
    grass: [
      { n: 78000, h: [0.11, 0.22], root: 0x7cba4c, tip: 0xc6e888, wind: 0.24, r: [2.5, 120], rim: 0xeefcc8, rimK: 0.4, pow: 1.3, dry: 0xf0ecb0, lush: 0xe0f4cc, tintF: 0.03, clump: [6, 18], clumpR: 1.0, wide: 1.2, width: 0.11, blades: 4,
        /* dense everywhere (no bare olive patches), a little thinner in the clumps' gaps */
        density: (ctx, x, z) => { if (lineDist(ctx.f.path, x, z) < 1.3 || lineDist(ctx.f.road, x, z) < 2.2) return 0; const m = fbm(x * 0.05 + 5, z * 0.05, 3); return 0.62 + 0.38 * smooth(0.3, 0.5, m); },
        height: (ctx, x, z) => (1 + 0.6 * smooth(0.5, 0.72, fbm(x * 0.03 + 1, z * 0.03 + 2, 3))) * (Math.hypot(x, z) < 12 ? 0.7 : 1) },
    ],
    props: [
      { m: 'namaqualand_boulder_04', n: 10, s: [1.4, 3], d: [24, 90], sink: 0.35, tint: 0xd8d0c0, cover: 0x7aa84a, coverAmt: 0.55, cluster: [1, 3], spread: 5 },
      { m: 'rock_07', n: 22, s: [0.4, 1.0], d: [8, 60], sink: 0.4, tint: 0xd0c8b8, cover: 0x7aa84a, coverAmt: 0.5, clutter: true, cluster: [1, 4], spread: 4 },
      { m: 'shrub_03', n: 30, s: [1.2, 2.4], d: [18, 90], tint: 0x8ac060, clutter: true, cluster: [1, 3], spread: 4 },
    ],
    particles: [
      { kind: 'dot', n: 420, size: 0.05, vel: [0.5, 0.12, 0.2], var: [0.4, 0.15, 0.3], color: 0xfff8e0, opacity: 0.55, sway: 0.7, box: 14 },
    ],
  },

  /* ---------------- THE CLOUD PEAKS: a high meadow on a plateau that ends in a sea of cloud; banks of cloud lie on
     the grass, sky islands float round it, snowy spires stand up out of the cloud sea far off, the light is warm and low.
     The giant's storm wall stays far out on the nemesis line. ---------------- */
  cloudpeaks: {
    sbDay: true, variants: 2, desat: 0.0, groundTint: 0x6a9e40, fog: [40, 520], hemi: 1, sun: 1, exposure: 1, fogCol: 0xc6d8ea, skyCols: [0x3a78c8, 0xd6e6f2],
    sky: { sunDir: [-0.65, 0.3, 0.66], sunCol: 0x000000, sunGlow: 0, disc: 0, clouds: 0.34, cloudCol: 0xc4cedc, cloudLit: 0xfffcf6, cloudSpd: 0.6, cloudLo: 0.16, top: 0x2f6cc0, hor: 0xd8e6f2, pow: 0.5, cells: 0, band: 0.1, bandCol: 0xfff2dc, lightning: false },
    terrain: { A: ['grass_path_2', 6, 0x9cf070], B: ['snow_field_aerial', 9, 0xffffff], C: ['cliff_side', 14, 0xd8c0a0], P: 0xe8d8b8, rock: [0.3, 0.55], macro: [26, 0.08], nstr: 0.36, rough: [0.95, 0.85], desat: 0.0, bnoise: 0, strata: [0.35, 0.5, 3, 0.2], haze: [0xc4d8e8, 0.2, 220, 820], specMax: 0.1, env: 0.25 },
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      f.seaAng = NEMESIS_ANG;
      f.ring = { a: FRONT + [0.75, -0.8][v] + (r() - 0.5) * 0.1, d: 36 + r() * 6 }; [f.ring.x, f.ring.z] = polar(f.ring.a, f.ring.d);
      f.path = windingPath(r, ...polar(FRONT + Math.PI - 0.3, 110), FRONT + 0.1, 200, 6, 0.22);
      f.knolls = []; for (let i = 0; i < 9; i++) { const a = r() * TAU; if (angOff(a) < 0.3) continue; const d = 34 + r() * 70; const [x, z] = polar(a, d); if (Math.hypot(x - f.ring.x, z - f.ring.z) < 18) continue; f.knolls.push({ x, z, R: 9 + r() * 10, H: 3 + r() * 5 }); }
      f.stones = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + (r() - 0.5) * 0.1; const rd = 8 + r() * 2.4; if (r() < 0.15) continue; f.stones.push([f.ring.x + Math.cos(a) * rd, f.ring.z + Math.sin(a) * rd, 1.9 + r() * 2.4, Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI / 2]); }
      f.stones.push([f.ring.x, f.ring.z, 4.6, r() * TAU]);
      f.oaks = []; for (let i = 0; i < 200 && f.oaks.length < 16; i++) { const a = r() * TAU; if (angOff(a) < 0.3) continue; const d = 30 + r() * 70; const [x, z] = polar(a, d); if (Math.hypot(x - f.ring.x, z - f.ring.z) < 16 || lineDist(f.path, x, z) < 6 || f.oaks.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 12)) continue; f.oaks.push([x, z, 8 + r() * 5]); }
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = (ctx.seed % 97) * 0.37 + ctx.v * 11.3;
      let h = (fbm(x * 0.014 + s, z * 0.014, 4) - 0.42) * 7 * smooth(18, 70, rr) + (fbm(x * 0.05, z * 0.05 + s, 3) - 0.5) * 1.6 * smooth(16, 28, rr);
      for (const k of f.knolls) h += k.H * bump(x, z, k.x, k.z, k.R) + 1.2 * Math.pow(K.ridged(x * 0.08, z * 0.08, 3), 2) * bump(x, z, k.x, k.z, k.R * 0.7);
      /* the plateau's edge: the ground falls away into the cloud sea from about 120 m (a ragged rim) */
      const edge = 105 + 22 * fbm(Math.cos(ang) * 2.2 + s, Math.sin(ang) * 2.2 - s, 3);
      h -= 80 * smooth(edge, edge + 55, rr);
      /* snowy spires stand up out of the cloud sea far off */
      h += ranges(x, z, rr, ang, s, { near: [380, 470], far: [560, 780], ampN: 60, ampF: 120, sharp: 2.6, freq: 0.0052, gapK: 0.55 });
      const dp = lineDist(f.path, x, z); if (dp < 3 && rr > ARENA_R) h = lerp(h, h * 0.9, smooth(3, 1.2, dp));
      const dr = Math.hypot(x - f.ring.x, z - f.ring.z); if (dr < 16) h = lerp(h, Math.min(h, 1.2), smooth(16, 11, dr));
      return h;
    },
    /* snow on the spires above ~10 m over the sea, the path is trodden earth */
    mask(ctx, x, z, h, rr) { const dp = lineDist(ctx.f.path, x, z) + (fbm(x * 0.3, z * 0.3, 2) - 0.5) * 0.7; return [smooth(1.2, 0.5, dp), smooth(10, 40, h + (fbm(x * 0.02, z * 0.02, 3) - 0.5) * 20) * smooth(200, 300, rr), 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f;
      buildStones(ctx, L, f.stones);
      buildOaks(ctx, L, f.oaks);
      buildCloudSea(ctx, L);
      buildCloudBanks(ctx, L);
      buildSkyIslands(ctx, L);
      /* the Cloud Peaks have peaks: snowy spires and domes that rise out of the cloud sea round the plateau, two near
         ones big in the first and the reverse view, a ring of farther ones, each with a collar of cloud at the sea */
      { const near = [[FRONT + 0.5, 250, 190, 70, 0.75], [FRONT - 0.55, 300, 230, 85, 0.45], [FRONT + Math.PI + 0.35, 240, 175, 62, 0.8], [FRONT + Math.PI - 0.5, 290, 210, 90, 0.35]]
          .filter(([a]) => angOff(a) > 0.45).map(([a, d, H, R, sp]) => { const [x, z] = polar(a, d); return [x, z, H, R, -45, sp]; });
        buildPeaks(ctx, L, [...near, ...peakRing(ctx, 9, 330, 520, 110, 240, 50, 95, 0.5, -45)], { rock: [0x262c44, 0x48526e], snowAt: 0.7, collarY: 4, shade: 0xb8c8de }); }
      /* the storm: a tall wall far out on the nemesis line, lit white on top; the plateau stays in the sun */
      buildAnvils(ctx, L, { n: 4, spread: 0.8, dist: 400, H: 170, W: 110, shade: 0x8e98b2, base: 0, seed: 9 });
      buildFarLightning(ctx, L, { every: [4, 7], dist: [360, 430] });
      buildFlowers(ctx, L, { n: 3200, d: [3, 115], colors: [[0xfffaf0, 0xf2c030], [0xf6d040, 0xc8801a], [0xe0402a, 0x1e1410], [0x7a8ee8, 0xf0e0a0], [0xe8e0ff, 0xc0a0e0]], size: [0.22, 0.42], density: (ctx, x, z) => (lineDist(ctx.f.path, x, z) < 1.3 || ctx.H(x, z) < -2 ? 0 : smooth(0.46, 0.6, fbm(x * 0.045 + 9, z * 0.045 - 3, 3))) });
      buildNearField(ctx, L, { bales: ctx.look.id === 'meadow' });
      K.addBlobs(ctx, L, ctx.blobs || [], 0.32); ctx.blobs = [];
      buildStorm(ctx, L);
    },
    grass: [
      { n: 72000, h: [0.11, 0.21], root: 0x7cba4c, tip: 0xcaea8e, wind: 0.42, r: [2.5, 110], rim: 0xeefcf0, rimK: 0.4, pow: 1.35, dry: 0xeae2b0, lush: 0xdcf2d0, tintF: 0.04, clump: [6, 16], clumpR: 1.0, wide: 1.15, width: 0.1, blades: 4,
        density: (ctx, x, z) => { if (lineDist(ctx.f.path, x, z) < 1.1) return 0; const h = ctx.H(x, z); if (h < -3) return 0; const m = fbm(x * 0.05 + 2, z * 0.05, 3); return 0.62 + 0.38 * smooth(0.3, 0.5, m); },
        height: (ctx, x, z) => (Math.hypot(x, z) < 12 ? 0.65 : 1) },
    ],
    props: [
      { m: 'namaqualand_boulder_02', n: 12, s: [2, 4], d: [24, 100], sink: 0.3, tint: 0xe8dccc, cover: 0x8ac85a, coverAmt: 0.5, cluster: [1, 3], spread: 8 },
      { m: 'shrub_03', n: 36, s: [1.2, 2.4], d: [22, 105], tint: 0x8ac860, clutter: true, cluster: [1, 4], spread: 6 },
      { m: 'rock_09', n: 30, s: [0.3, 1.0], d: [6, 60], sink: 0.4, tint: 0xe0d8cc, clutter: true, cluster: [1, 5], spread: 4, cover: 0x8ac85a, coverAmt: 0.4 },
    ],
    particles: [
      { kind: 'dot', n: 500, size: 0.045, vel: [2.6, 0.2, 0.9], var: [0.8, 0.3, 0.5], color: 0xf4f6ea, opacity: 0.5, sway: 0.9, box: 16 },
    ],
  },
};

/* ======================================================================================================
   The daylight looks (same shape as LOOK in world.js). Key from behind the left shoulder of the first view, so the
   fight is front-lit and shadows fall long and forward-right; cool fill from the sky; aerial haze; a warm, light grade.
   ====================================================================================================== */
export const looks = {
  meadow: { key: [-0.6, 0.4, 0.68], keyCol: 0xfff0d8, keyI: 3.0, fill: 1.15, rim: 0xfff6e8, rimI: 0.35, back: 0.5,
    disc: { r: 0.03, col: 0xfff6e0, i: 1.6, soft: 0.12, halo: 0xffe8c0, haloI: 0.35, haloR: 6, veil: 0.5 },
    /* clearer air and more colour */
    fog: { d: 0.00055, h: 0.001, fall: 0.06, max: 0.34, start: 34, sky: 0.2, scatter: 0.22 },
    grade: { sat: 1.24, con: 0.18, lift: 0x141c2e, gain: 0xfff6e6 }, exp: 0.785, campExposure: 1.2,
    env: { top: 0x3a76c8, hor: 0xdce8f2, ground: 0x4a6a2a, sun: 0xfff0d0, intensity: 0.9 }, bloom: { threshold: 1.4, strength: 0.18 } },
  /* warm late-afternoon light over the cloud sea */
  /* one grade for the world: the same clear blue day as the meadow (the warm peach haze read as a second game) */
  cloudpeaks: { key: [-0.65, 0.3, 0.66], keyCol: 0xfff0d8, keyI: 3.1, fill: 1.15, rim: 0xfff6e8, rimI: 0.38, back: 0.5,
    disc: { r: 0.03, col: 0xfff6e0, i: 1.6, soft: 0.12, halo: 0xffe8c0, haloI: 0.35, haloR: 6, veil: 0.5 },
    fog: { d: 0.0004, h: 0.0007, fall: 0.04, max: 0.3, start: 46, sky: 0.18, scatter: 0.2 },
    grade: { sat: 1.24, con: 0.18, lift: 0x141c2e, gain: 0xfff6e6 }, exp: 0.785, campExposure: 1.2,
    env: { top: 0x3a76c8, hor: 0xdce8f2, ground: 0x5a7a3a, sun: 0xfff0d0, intensity: 0.9 }, bloom: { threshold: 1.4, strength: 0.18 } },
};

/* clean steel and bright cloth: no rust, light mud, a warm dye only */
export const grime = {
  meadow: { k: [0, 0.12, 0.02, 0], mud: 0x6a5a3a, dye: 0x8a6a48 },
  cloudpeaks: { k: [0, 0.1, 0.02, 0], mud: 0x6a6a5a, dye: 0x6a6a74 },
};

export const wear = '/assets/real/wear_storybook.glb';
export const parts = ['Helm_open', 'Plume', 'Surcoat', 'Tunic', 'Hood_cloth', 'Boots', 'Belt', 'Gown', 'Cape', 'Ears', 'Loincloth', 'Hood_wolf', 'Face', 'Face_brigand', 'Face_goblin', 'Cap_goblin', 'Troll_body', 'Troll_head', 'Helm_toy'];
export const gear = [];
/* the same 8 gear files, clean and bright: no foe dim, almost no rust, polished blades, heraldic shields */
export const gearLook = { dim: 1, wear: 0.03, blade: 0xdde2e8, steel: 0x9aa0aa, plate: { map: false },
  shieldPaint: [[0x2a4f9a, 0xf2c94a], [0xb83a2c, 0xf6efe0], [0xf2c94a, 0x2a4f9a], [0x2f6a3a, 0xf6efe0], [0xf6efe0, 0xb83a2c]] };
export { skyNemesis } from './storybook-boss.js';
/* where a blow lands the ground takes a soft petal tint, not the dark world's red-black (fight.js stainAt) */
export const stain = 0x9a5a6a;
/* the storybook villain's rank: purple and gold (cape, crest, banner); the Great Troll an iron war-boss */
const SB_STYLE = {
  matte: { cloth: { rough: 0.9, env: 0.2 }, skin: { rough: 0.8, env: 0.2 } },
  rank(actor, foeId, kit) {
    if (foeId === 'brute') return [kit.pauldrons(actor, 0x4a4a50, { r: 0.22, trim: 0xe2b04a }), kit.banner(actor, 0x3a1448, { mark: 0xe2b04a, h: 1.5, flag: [0.36, 0.7] }), kit.crest(actor, 0xe2b04a, { kind: 'feather', y: 1.84 })];
    if (foeId === 'minion') return [kit.cape(actor, 0x3a1448, { len: 0.8, width: 0.5 }), kit.crest(actor, 0xe2b04a, { kind: 'feather', y: 1.86 })];
    if (foeId === 'rogue') return [kit.crest(actor, 0x3a1448, { kind: 'hair', y: 1.9, tall: 0.16 })];
    return [];
  },
};
/* foes: warm faces, no glowing eye slots in this world (the fight lights every foe's eyes) */
function boneNamed(actor, name) { let b = null; actor.root.traverse((n) => { if (!b && n.isBone && n.name === name) b = n; }); return b; }
/* the troll's mallet: a wooden head with two iron bands on an ash haft, along +Y from the grip */
function mallet() {
  const g = new THREE.Group(); const wood = paintMaterial({ wrap: 0.4, grain: 0.15, rough: 0.85 }); const r = rng(311);
  /* tinted() returns a new geometry; the old code merged the disposed originals and threw, so the troll never got its mallet */
  const haft0 = new THREE.CylinderGeometry(0.022, 0.028, 0.95, 8); haft0.translate(0, 0.38, 0); const haft = tinted(haft0, 0x8a6a44, 0.08, r);
  const head = new THREE.CylinderGeometry(0.11, 0.11, 0.34, 12, 3); { const p = head.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + 0.08 * (1 - (y / 0.17) ** 2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
  head.rotateZ(Math.PI / 2); head.translate(0, 0.86, 0);
  const parts = [haft, tinted(head, 0xa07a4c, 0.1, r)];
  for (const x of [-0.12, 0.12]) { const band = new THREE.CylinderGeometry(0.122, 0.122, 0.035, 12); band.rotateZ(Math.PI / 2); band.translate(x, 0.86, 0); parts.push(tinted(band, 0x6e7278, 0, r)); }
  const m = new THREE.Mesh(mergeKeepColor(parts), wood); m.castShadow = true; g.add(m); g.userData.dispose = () => { m.geometry.dispose(); wood.dispose(); };
  return g;
}
/* foes, brought up to the goblin. Changes:
   - The troll's bulk comes from UNIFORM bone scales only. The old non-uniform spine and thigh scales sheared every child
     bone (a rotated child of a squashed parent stretches): the right arm reached twice its length with spaghetti fingers.
     The clavicles and the neck scale back down, so the arms and the head keep a troll's size, not the scaled spine's.
   - Painted skin and cloth (paintFoe): a mottled gouache value in the bind-pose space of each mesh, a warm belly and face
     on the troll and the goblin, a darker back, moss spots and warts on the troll; a soft weave value on cloth.
   - The brigand gets shoulders and a neck: leather pauldrons with a brass stud on each upper arm, a mustard neckerchief.
     The wolfcloak gets a fur ruff on the shoulders. Both read at close range.
   - A gentle exit: a foe falls (its death clip), then at 1.1 s it goes in a puff of leaves and petals with a soft cloud
     (no corpse, no dark patch left on the grass), the body shrinks away under the puff in 0.3 s. */
const PAINT = {
  /* kind: [base hex or null (keep), belly hex, back hex, spots hex, spot amount] */
  troll: [0x8aa266, 0xc8be8a, 0x56703e, 0x5e7a3e, 0.06], /* the spots read as camouflage paint: a faint mottle only */
  goblin: [null, 0xb8d070, 0x3e6a24, 0x4e7a2c, 0.25],
  cloth: [null, null, null, null, 0],
};
function paintFoe(actor, foeId) {
  for (const m of actor.meshes) {
    const mat = m.material; if (!mat || !mat.isMeshStandardMaterial || mat.userData.sbPaint) continue;
    const n = mat.name || ''; const part = m.userData.part || '';
    const skin = /SkinTroll/.test(n) || (foeId === 'brute' && part === 'Mannequin') ? 'troll' : /SkinGoblin/.test(n) || (foeId === 'minion' && part === 'Mannequin') ? 'goblin' : null;
    if (/Eye|Mouth|White|Ivory|Gold|Brass/.test(n)) continue;
    const kind = skin || 'cloth'; const P = PAINT[kind]; mat.userData.sbPaint = kind;
    if (P[0] != null) mat.color.setHex(P[0]);
    const C = (h) => (h == null ? 'vec3(0.0)' : (() => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`; })());
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev?.call(mat, sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSbP; varying vec3 vSbN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSbP = position; vSbN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vSbP; varying vec3 vSbN;
        float sbH3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float sbN3(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(sbH3(i), sbH3(i + vec3(1,0,0)), f.x), mix(sbH3(i + vec3(0,1,0)), sbH3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(sbH3(i + vec3(0,0,1)), sbH3(i + vec3(1,0,1)), f.x), mix(sbH3(i + vec3(0,1,1)), sbH3(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
        .replace('#include <roughnessmap_fragment>', `{
          float sbM = sbN3(vSbP * 9.0) * 0.6 + sbN3(vSbP * 23.0) * 0.4;
          ${kind === 'cloth' ? `diffuseColor.rgb *= 0.9 + 0.2 * sbM; diffuseColor.rgb *= 0.94 + 0.06 * sin(vSbP.y * 160.0 + sbN3(vSbP * 40.0) * 3.0);` : `
          vec3 sbN = normalize(vSbN);
          float sbFront = smoothstep(-0.2, 0.8, sbN.z);
          float sbBack = smoothstep(0.1, -0.8, sbN.z) * 0.8 + smoothstep(0.3, 1.0, sbN.y) * 0.25;
          diffuseColor.rgb = mix(diffuseColor.rgb, ${C(P[1])}, sbFront * 0.45 * smoothstep(0.7, 1.5, vSbP.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, ${C(P[2])}, sbBack * 0.55);
          float sbS = smoothstep(0.66, 0.74, sbN3(vSbP * 22.0 + 3.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, ${C(P[3])}, sbS * ${P[4].toFixed(2)});
          diffuseColor.rgb *= 0.86 + 0.28 * sbM;`}
        }
        #include <roughnessmap_fragment>`);
    };
    const key = mat.customProgramCacheKey?.bind(mat);
    mat.customProgramCacheKey = () => `${key ? key() : ''}|sb-foe-${kind}`;
    mat.needsUpdate = true;
  }
}
/* a leather pauldron (a rounded cap with a rolled edge and a brass stud) and a neckerchief, built once, shared */
let KIT = null;
function foeKit() {
  if (KIT) return KIT;
  const r = rng(731);
  const cap = new THREE.SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI * 0.5); cap.scale(0.085, 0.07, 0.095);
  const rim = new THREE.TorusGeometry(0.088, 0.012, 6, 18); rim.rotateX(Math.PI / 2); rim.scale(1, 1, 1.08);
  const stud = new THREE.SphereGeometry(0.016, 8, 6); stud.translate(0, 0.07, 0);
  const lower = new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, Math.PI * 0.5); lower.scale(0.078, 0.05, 0.088); lower.translate(0, -0.035, 0);
  const pauldron = mergeKeepColor([tinted(cap, 0x5a3a24, 0.08, r), tinted(rim, 0x3a2416, 0, r), tinted(stud, 0xd8b050, 0, r), tinted(lower, 0x4a3020, 0.08, r)]);
  const scarf = new THREE.TorusGeometry(0.075, 0.03, 8, 20); scarf.rotateX(Math.PI / 2); scarf.scale(1.05, 1.0, 0.95);
  const knot = new THREE.ConeGeometry(0.04, 0.12, 6); knot.rotateX(Math.PI); knot.translate(0.0, -0.05, 0.075);
  const neck = mergeKeepColor([tinted(scarf, 0xd8a83a, 0.06, r), tinted(knot, 0xc8962e, 0.06, r)]);
  /* a fur ruff: soft lumps in a ring */
  const ruffL = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; ruffL.push(tinted(new THREE.SphereGeometry(0.06 + r() * 0.02, 8, 6).translate(Math.cos(a) * 0.15, (r() - 0.5) * 0.03, Math.sin(a) * 0.12), i % 2 ? 0x7a7268 : 0x5e574e, 0.1, r)); }
  const ruff = mergeKeepColor(ruffL);
  const mat = paintMaterial({ wrap: 0.4, grain: 0.15, rough: 0.85 });
  /* the brigand's villain kit: black leather pauldrons with an oxblood rim, a black scarf with an oxblood knot, and a
     black domino mask round the eyes with two pale slits (ally and foe must never share a palette) */
  const cap2 = cap.clone(); const rim2 = rim.clone(); const stud2 = stud.clone(); const lower2 = lower.clone();
  const pauldronB = mergeKeepColor([tinted(cap2, 0x231d1e, 0.08, r), tinted(rim2, 0x6a1416, 0, r), tinted(stud2, 0xb8b4ac, 0, r), tinted(lower2, 0x1a1516, 0.08, r)]);
  const scarf2 = scarf.clone(); const knot2 = knot.clone();
  const neckB = mergeKeepColor([tinted(scarf2, 0x1c1719, 0.06, r), tinted(knot2, 0x7a1a1c, 0.06, r)]);
  /* the mask: a band of the head's front (+-72 degrees) at eye height, the face shell's radius plus a little */
  const band = new THREE.CylinderGeometry(0.1, 0.1, 0.038, 24, 1, true, -1.26, 2.52); band.scale(1.04, 1, 1.1);
  const slit = (sx) => { const g = new THREE.CircleGeometry(0.0125, 14); g.scale(1.25, 0.62, 1); g.rotateZ(sx * 0.18); const a = sx * 0.37; g.rotateY(a); g.translate(Math.sin(a) * 0.1 * 1.04 + 0, 0.002, Math.cos(a) * 0.1 * 1.1 + 0.0035); return g; };
  const mask = mergeKeepColor([tinted(band, 0x141012, 0, r), tinted(slit(-1), 0xf4ecd8, 0, r), tinted(slit(1), 0xf4ecd8, 0, r)]);
  const maskMat = paintMaterial({ wrap: 0.4, grain: 0.06, rough: 0.6, side: THREE.DoubleSide });
  KIT = { pauldron, neck, ruff, mat, pauldronB, neckB, mask, maskMat };
  return KIT;
}
function attachAt(actor, bone, at, geo, mat, rot = null, scale = 1) {
  const p = bindPosOf(actor, bone); if (!p) return null; const fr = bindFrame(actor, bone, p.clone().add(at));
  const m = new THREE.Mesh(geo, mat); if (rot) m.rotation.set(...rot); m.scale.setScalar(scale); m.castShadow = true; fr.add(m); return fr;
}
/* the exit puff: one pooled set of leaves and petals (instanced cards) and a soft cloud, shared by every foe in a scene */
let PUFF = null;
function puffPool(scene) {
  if (PUFF && PUFF.scene === scene) return PUFF;
  const N = 320; const leaf = new THREE.PlaneGeometry(0.16, 0.1); { const p = leaf.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (1 - Math.abs(p.getX(i)) * 6)); }
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8, envMapIntensity: 0.3 });
  const mesh = new THREE.InstancedMesh(leaf, mat, N); mesh.frustumCulled = false; mesh.castShadow = false;
  const cols = [0x6aa83a, 0x9ccc4a, 0xd8c040, 0xf2f0e0, 0xe85a4a, 0xc8a8e8]; const c = new THREE.Color(); const m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) { mesh.setColorAt(i, c.setHex(cols[i % cols.length])); m4.makeTranslation(0, -99, 0); mesh.setMatrixAt(i, m4); }
  scene.add(mesh);
  const cm = cloudMaterial({ lit: 0xfffaf0, shade: 0xc8d0dc, grad: 0.8, opacity: 0 });
  const NC = 48; const cloud = cloudMesh(Array.from({ length: NC }, () => [0, -99, 0, 0.3, 0.3]), cm, 77); scene.add(cloud);
  const L = Array.from({ length: N }, () => ({ t: 9, p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Euler() }));
  const CL = Array.from({ length: NC }, () => ({ t: 9, x: 0, y: -99, z: 0, s: 0.3 }));
  let li = 0; let ci = 0; let live = 0; const q = new THREE.Quaternion(); const sv = new THREE.Vector3(); let time = 0;
  PUFF = { scene, lastNow: 0,
    burst(at, size = 1) { for (let k = 0; k < 52; k++) { const o = L[li]; li = (li + 1) % N; o.t = 0; o.p.set(at.x + (Math.random() - 0.5) * 0.5 * size, at.y + Math.random() * 0.9 * size, at.z + (Math.random() - 0.5) * 0.5 * size); const a = Math.random() * TAU; o.v.set(Math.cos(a) * (0.6 + Math.random() * 1.4), 1.4 + Math.random() * 1.8, Math.sin(a) * (0.6 + Math.random() * 1.4)).multiplyScalar(size ** 0.5); o.w.set(Math.random() * 8, Math.random() * 8, Math.random() * 8); }
      for (let k = 0; k < 7; k++) { const o = CL[ci]; ci = (ci + 1) % NC; o.t = 0; o.x = at.x + (Math.random() - 0.5) * 0.6 * size; o.y = at.y + 0.3 + Math.random() * 0.7 * size; o.z = at.z + (Math.random() - 0.5) * 0.6 * size; o.s = (0.1 + Math.random() * 0.08) * size; }
      live = 3; },
    /* every living foe calls this each frame: only the first call in a frame runs */
    update(dt) { if (live <= 0) return; const now = performance.now(); if (now - PUFF.lastNow < 4) return; PUFF.lastNow = now; live -= dt; time += dt; cm.uniforms.uTime.value = time;
      for (let i = 0; i < N; i++) { const o = L[i]; if (o.t > 2.6) continue; o.t += dt; o.v.y -= 2.2 * dt; o.v.multiplyScalar(1 - 1.6 * dt); o.v.y = Math.max(o.v.y, -0.6); o.p.addScaledVector(o.v, dt); o.q.x += o.w.x * dt; o.q.y += o.w.y * dt; o.q.z += o.w.z * dt;
        const s = o.t > 2.6 ? 0 : Math.min(1, o.t * 8) * (1 - Math.max(0, o.t - 1.8) / 0.8); q.setFromEuler(o.q); m4.compose(o.t > 2.6 ? sv.set(0, -99, 0) : o.p, q, sv.setScalar(Math.max(1e-3, s))); mesh.setMatrixAt(i, m4); }
      mesh.instanceMatrix.needsUpdate = true;
      const aP = cloud.geometry.attributes.aP; const aS = cloud.geometry.attributes.aS; let maxA = 0;
      for (let i = 0; i < NC; i++) { const o = CL[i]; if (o.t > 1.6) { aP.setY(i, -99); continue; } o.t += dt; aP.setXYZ(i, o.x, o.y + o.t * 0.5, o.z); aS.setX(i, o.s * (1 + o.t * 1.2)); maxA = Math.max(maxA, 1 - o.t / 1.6); }
      aP.needsUpdate = true; aS.needsUpdate = true; cm.uniforms.uA.value = 0.6 * maxA; },
  };
  return PUFF;
}
/* foes: warm faces, no glowing eye slots in this world (the fight lights every foe's eyes). The troll's mallet replaces the iron maul. */
export function dressFoe(actor, foeId, ctx = {}) {
  const off = () => actor.eyes?.(0, 0x2a2018);
  off();
  /*
     three of each kind (skin, cap or hood, cloth, fur, build) and a captain in the villain's purple and gold */
  const R = foeRng(ctx, foeId); const vi = R.variant(3); const cap = !!ctx.captain; const sbExtras = [];
  const showP = (p, on) => { for (const m of actor.parts.get(p) || []) m.visible = on; };
  /* uniform scales only (see above); [x, y, z] only on the goblin, whose spine is never rotated far */
  const U = (k) => [k, k, k];
  const SHAPE = foeId === 'brute' ? { spine_03: U(1.14), spine_02: U(1.1), clavicle_l: U(0.86), clavicle_r: U(0.86), neck_01: U(0.82), hand_l: U(1.3), hand_r: U(1.3), thigh_l: U(1.08), thigh_r: U(1.08) }
    : foeId === 'minion' ? { spine_03: [0.88, 1.0, 0.85], spine_02: [0.85, 1.0, 0.82], upperarm_l: [0.85, 1.05, 0.85], upperarm_r: [0.85, 1.05, 0.85], thigh_l: [0.85, 1.0, 0.85], thigh_r: [0.85, 1.0, 0.85], hand_l: [1.15, 1.15, 1.15], hand_r: [1.15, 1.15, 1.15] } : null;
  let unwrap = null; let club = null; const extras = [];
  if (SHAPE) {
    const bones = Object.entries(SHAPE).map(([n, v]) => [boneNamed(actor, n), v]).filter(([b]) => b);
    const apply = () => { for (const [b, v] of bones) b.scale.set(v[0], v[1], v[2]); };
    const mix = actor.mixer; const up = mix.update.bind(mix); mix.update = (dt) => { const res = up(dt); apply(); return res; }; apply();
    unwrap = () => { mix.update = up; };
  }
  try { paintFoe(actor, foeId); } catch (err) { console.warn('storybook paint', err); }
  if (foeId === 'brute') { const hand = actor.slot('handslotr'); if (hand) { for (const c of hand.children) c.visible = false; club = mallet(); hand.add(club); } }
  const kit = (foeId === 'warrior' || foeId === 'rogue') ? foeKit() : null;
  if (foeId === 'warrior') {
    /* the villain palette: world.js mixes the land's dye into foe cloth (meadow: ochre), which turned the oxblood brown;
       set it here, per actor: an oxblood tunic, a black hood and boots, two tones of red */
    for (const m of actor.meshes) { const part = m.userData.part || ''; const mat = m.material; if (!mat?.color || m.userData.sbVillain) continue;
      const tone = part === 'Tunic' ? 0x6a161a : part === 'Hood_cloth' ? 0x1c1718 : part === 'Boots' ? 0x161213 : part === 'Belt' ? 0x3a1012 : null;
      if (tone != null) { m.userData.sbVillain = true; mat.color.setHex(tone); } }
    for (const [sd, sx] of [['l', 1], ['r', -1]]) { const fr = attachAt(actor, `upperarm_${sd}`, new THREE.Vector3(sx * 0.03, 0.035, 0), kit.pauldronB, kit.mat, [0, 0, -sx * 0.5]); if (fr) extras.push(fr); }
    const fr = attachAt(actor, 'neck_01', new THREE.Vector3(0, -0.035, 0.0), kit.neckB, kit.mat); if (fr) extras.push(fr);
    /* the mask sits on the face shell (centre z 1.68, 0.03 forward; the eyes at 1.698), bound to the head */
    const hm = new THREE.Mesh(kit.mask, kit.maskMat); hm.castShadow = false; const hf = bindFrame(actor, 'Head', new THREE.Vector3(0, 1.698, 0.03)); hf.add(hm); extras.push(hf);
  }
  if (foeId === 'rogue') { const fr = attachAt(actor, 'spine_03', new THREE.Vector3(0, 0.15, -0.01), kit.ruff, kit.mat); if (fr) extras.push(fr); }
  const recolor = (re, hex, k = 1) => { for (const m of actor.meshes) { const mt = m.material; if (mt?.color && re.test(mt.name || '')) mt.color.setHex(hex).multiplyScalar(k); } };
  const k = R.range(0.9, 1.1);
  if (foeId === 'minion') {
    recolor(/SkinGoblin|^Mannequin|SQ_Under/, [0x5e8a38, 0x6e7a30, 0x4a7a4a][vi], k);
    recolor(/SB_CapRed/, cap ? 0x4a1c5a : [0xb8302a, 0x5a3a24, 0x2a2428][vi]);
    if (actor.model) { const sc = actor.model.scale; sc.multiply(new THREE.Vector3(...[[1, 1, 1], [1.08, 0.92, 1.08], [0.92, 1.08, 0.92]][vi])); }
    if (vi === 1) sbExtras.push(rankKit.rags(actor, 0x6a5238, { at: 'mantle', n: 5, seed: 12 }));
  } else if (foeId === 'warrior') {
    const tunic = cap ? 0x3a1448 : [0x6a161a, 0x4a1030, 0x1e2a2a][vi];
    for (const m of actor.meshes) if (m.userData.part === 'Tunic' && m.material?.color) m.material.color.setHex(tunic);
    if (vi === 2 || cap) { showP('Hood_cloth', false); showP('Helm_open', true); showP('Face_brigand', true); }
    if (cap) { showP('Plume', true); showP('Cape', true); recolor(/SB_Plume/, 0xe2b04a); for (const m of actor.parts.get('Cape') || []) m.material?.color?.setHex(0x3a1448); }
  } else if (foeId === 'rogue') {
    /* a frowning face under the snout, never the heroes' rosy chibi face */
    showP('Face', false); showP('Face_brigand', true);
    const fur = cap ? 0xd8d4cc : [0x6a625a, 0x2e2c30, 0x6a4a32][vi];
    recolor(/^SB_Fur$/, fur); recolor(/SB_FurDark/, cap ? 0x8a8680 : 0x1e1c20);
    for (const m of actor.parts.get('Cape') || []) m.material?.color?.setHex(cap ? 0x3a1448 : [0x4a4238, 0x24222a, 0x4a3424][vi]);
  } else if (foeId === 'brute') {
    recolor(/SkinTroll|^Mannequin|SQ_Under/, [0x5e7046, 0x56626a, 0x6a5a40][vi], k);
    if (vi === 1) sbExtras.push(rankKit.rags(actor, 0x4a4030, { at: 'mantle', n: 6, seed: 21, len: 0.36 }));
    if (vi === 2) sbExtras.push(rankKit.pauldrons(actor, 0x5a5a5e, { r: 0.2, metal: 0.4, rough: 0.7 }));
  }
  const fin = finishFoe(actor, foeId, ctx, SB_STYLE, R);
  const scene = ctx.scene || null; const pool = scene ? puffPool(scene) : null;
  let deadT = -1; let gone = false; const s0 = actor.root.scale.x; const _p = new THREE.Vector3();
  return {
    update(dt, s = {}) {
      off(); pool?.update(dt); fin.update(dt, s);
      if (!s.dead) return;
      if (deadT < 0) deadT = 0; deadT += dt;
      /* 1.1 s: the puff, and the body shrinks away under it */
      if (!gone && deadT > 1.1) { gone = true; actor.noBlob = true; actor.root.getWorldPosition(_p); pool?.burst(_p, foeId === 'brute' ? 1.6 : foeId === 'minion' ? 0.8 : 1.1); }
      if (gone) { const k = Math.max(0, 1 - (deadT - 1.1) / 0.3); actor.root.scale.setScalar(Math.max(1e-3, s0 * k)); if (k <= 0) actor.root.visible = false; }
    },
    onDeath() { deadT = 0; },
    dispose() { fin.dispose(); for (const e of sbExtras) e.obj.removeFromParent(); unwrap?.(); if (club) { club.removeFromParent(); club.userData.dispose(); } for (const e of extras) e.removeFromParent(); },
  };
}
export const sfxPools = {};

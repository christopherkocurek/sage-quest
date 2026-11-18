/* Old Edo lands: The Flooded Paddies and The Castle Road. Code-built geometry on the shared LANDKIT (web/src/lands.js),
   Poly Haven ground textures that the dark lands already ship (CC0). Mood: Kurosawa and ukiyo-e, night and dawn.
   - paddies: a raised earthen yard in a valley of flooded rice terraces that climb the hills. Each terrace holds its own
     mirror of water (one mesh on the terrain grid, per-vertex water level), rice in rows on half the fields, bunds,
     a vermilion torii and a climb of small torii to a hill shrine, stone lanterns, bamboo, a thatched farmhouse with lit
     shoji, black pines, jizo, fireflies. The lord's keep stands far out on the nemesis line.
   - castleroad: the packed-earth road to the lord's keep. Ishigaki wall bases with plaster walls on top, a gate,
     pines, stone lanterns, nobori banners. Variants: moonlit night, red dawn, snow (the frost climate is always snow).
   Fight rules of lands.js: flat at y = 0 inside 16 m, nothing solid inside 16 m, the nemesis line low and open.
   the terrace water is level per triangle (no water on slopes, smooth shores); the paddies yard is a small paddy complex of flooded
   plots, bunds, rice rows, a dry strip and a lantern rim (decals, no footprints); the castle road has a flagstone road with kerbs, kagaribi with
   live flame, mon banners on the honmaru wall, chamfered cap stones on the ishigaki, a lit gatehouse, bigger jizo and clutter at the wall foot. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANDKIT as K } from '../lands.js';
import { setSfxSurfaceProbe } from '../sfx.js';

const { ARENA_R, NEMESIS_ANG, NEM_DIST, TAU, FRONT, rng, hash2, vnoise, fbm, ridged, smooth, clamp, lerp, angOff, sectorK, polar, lineDist, windingPath, bump, ranges,
  canvasTex, triMaterial, windPatch, leafClusterMaterial, bannerMaterial, NOISE, WORLD_VARY_PARS, WORLD_VARY,
  taperTube, bend, chunkGeo, tuftGeo, crownClusterGeo, geoBox, mergeClean,
  addFogSheets, addGlows, addSmoke, addRays, solid, solidAlong } = K;

/* merge keeping uv (mergeClean drops it): every part non-indexed with position, normal and uv (zero uv when missing) */
function mergeUV(parts) {
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') q.deleteAttribute(k);
    if (!q.attributes.normal) q.computeVertexNormals(); if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2)); return q; }));
  for (const p of parts) p.dispose(); return g;
}
const sd0 = (ctx) => (ctx.seed % 97) * 0.37 + ctx.v * 11.3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NEM = polar(NEMESIS_ANG, NEM_DIST);
const WALL_R = 27; /* castle road: the bailey wall ring */
const CUT = 5.5; /* castle road: half width of the road band */
/* castle road bailey: the front wall at a = BY_A, the honmaru stone face at s = BY_S, the open edges at a = -BY_O and s = -BY_O */
const BY_A = 24; const BY_S = 24; const BY_O = 26; const GATE_W = 7;
const CRc = Math.cos(NEMESIS_ANG); const CRs = Math.sin(NEMESIS_ANG);
const crA = (x, z) => x * CRc + z * CRs; const crS = (x, z) => -x * CRs + z * CRc; const crP = (a, s) => [a * CRc - s * CRs, a * CRs + s * CRc];
const xz = ([x, z]) => ({ x, z });
const inBailey = (ctx, x, z, pad = 0) => { const f = ctx.f; if (!f.S) return false; const a = crA(x, z); const s = f.S(x, z); return a > -BY_O - pad && a < BY_A + pad && s > -BY_O - pad && s < BY_S + pad; };

/* ======================================================================== materials */
/* lacquered or painted wood (torii vermilion, black lacquer): weathered from world position, rain streaks down,
   paint worn pale on the edges that face up, no texture needed */
function paintMat(color, { rough = 0.62, streak = 0.35, wear = 0.3, glow = 0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, envMapIntensity: 0.2 });
  const U = { uStreak: { value: streak }, uWearK: { value: wear }, uGlowK: { value: glow } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uStreak; uniform float uWearK; uniform float uGlowK; ${WORLD_VARY_PARS} ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float st = sqN2(vec2(vW.x * 9.0 + vW.z * 7.0, vW.y * 0.6)) * 0.6 + sqN2(vec2(vW.x * 31.0 - vW.z * 23.0, vW.y * 2.0)) * 0.4;
          float grime = smoothstep(0.35, 0.85, st) * uStreak;
          float up = smoothstep(0.55, 0.95, normalize(vWN).y); float wn = sqF2(vW.xz * 3.1 + vW.y * 2.0);
          diffuseColor.rgb *= 1.0 - grime * 0.55;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45 + vec3(0.05), up * smoothstep(0.4, 0.8, wn) * uWearK);
          diffuseColor.rgb *= 0.86 + 0.28 * sqN2(vW.xz * 0.7 + vW.y * 0.3); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uGlowK;');
  };
  mat.customProgramCacheKey = () => 'edo-paint';
  return mat;
}
/* lime plaster (castle walls): cream, rain-stained below the eaves and dirty at the foot */
function plasterMat(color = 0xd8d0c0) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, envMapIntensity: 0.18 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS} varying float vEdoY;`).replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARY} vEdoY = position.y;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS} varying float vEdoY; ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float n = sqF2(vW.xz * 0.9 + vW.y * 0.4); float st = sqN2(vec2((vW.x + vW.z) * 6.0, vW.y * 0.35));
          diffuseColor.rgb *= 0.78 + 0.26 * n; diffuseColor.rgb *= 1.0 - smoothstep(0.55, 0.9, st) * 0.32; }`);
  };
  mat.customProgramCacheKey = () => 'edo-plaster';
  return mat;
}
/* roof tiles (kawara): dark grey ribs down the slope, from the local u (across) of the roof geometry */
const tileTex = () => canvasTex('edo-tiles', 64, 256, (g, w, h) => {
  g.fillStyle = '#3a3a3c'; g.fillRect(0, 0, w, h); const r = rng(13);
  for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#141416'); gr.addColorStop(0.35, '#4a4a4e'); gr.addColorStop(0.6, '#5a5a5e'); gr.addColorStop(1, '#141416'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
  for (let y = 0; y < h; y += 22) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y, w, 2); }
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,96,80' : '10,10,10'},${0.1 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 2 + r() * 18); }
});
function tileMat(tint = 0x8a8a90, snow = 0) {
  const t = tileTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: t, color: tint, roughness: 0.7, metalness: 0.1, envMapIntensity: 0.3, side: THREE.DoubleSide });
  if (snow > 0) {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARY}`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS} ${NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n{ float k = smoothstep(0.25, 0.6, normalize(vWN).y + (sqN2(vW.xz * 2.0) - 0.5) * 0.4) * ${snow.toFixed(2)}; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.8, 0.86), k); }`);
    };
    mat.customProgramCacheKey = () => 'edo-tile-snow';
  }
  return mat;
}
/* thatch: straw streaks along the slope, darker and mossy at the eaves */
const strawTex = () => canvasTex('edo-straw', 256, 256, (g, w, h) => {
  g.fillStyle = '#6a5a40'; g.fillRect(0, 0, w, h); const r = rng(29);
  for (let i = 0; i < 2600; i++) { const x = r() * w; const y = r() * h; const L = 10 + r() * 40; const c = 60 + r() * 90; g.strokeStyle = `rgba(${c + 30},${c + 15},${c - 15},${0.25 + r() * 0.4})`; g.lineWidth = 0.6 + r() * 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + L); g.stroke(); }
  for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(20,14,8,0.25)'; g.fillRect(0, y, w, 3); }
});
function strawMat(tint = 0xb0a080) {
  const t = strawTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: t, color: tint, roughness: 1, metalness: 0, envMapIntensity: 0.1, side: THREE.DoubleSide });
  return mat;
}
/* shoji paper lit from inside: warm, with the dark lattice of the frame */
const shojiTex = () => canvasTex('edo-shoji', 128, 128, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000';
  for (let x = 0; x <= w; x += 32) g.fillRect(x - 3, 0, 6, h);
  for (let y = 0; y <= h; y += 22) g.fillRect(0, y - 2, w, 4);
});
function shojiMat(color = 0xffa860, k = 1.4) {
  const t = shojiTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(color).multiplyScalar(k), toneMapped: true });
}
const woodMat = (tint = 0x4a3e30, o = {}) => triMaterial('bark_brown_02', { tint, tile: 0.8, desat: 0.5, nstr: 1.3, specMax: 0.05, ...o });
const stoneMat = (tint = 0x8a8884, o = {}) => triMaterial('seaside_rock', { tint, tile: 1.1, nstr: 1.5, cover: 0x3a4630, coverAmt: 0.45, ...o });

/* ======================================================================== geometry */
/* a curved beam: a box bent up toward both ends (the kasagi of a torii, a ridge with lifted ends) */
function curvedBeam(L, h, d, lift, { seg = 16, flare = 0 } = {}) {
  const g = new THREE.BoxGeometry(L, h, d, seg, 1, 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (L / 2); const k = Math.pow(Math.abs(x), 2.4); p.setY(i, p.getY(i) * (1 + flare * k) + lift * k); }
  g.computeVertexNormals(); return g;
}
/* a torii (myojin): two leaning pillars, the nuki tie beam, the kasagi lintel with upturned ends (black on top) */
function toriiGeo(S = 1) {
  const red = []; const black = [];
  const H = 4.2 * S; const half = 1.55 * S; const pr = 0.17 * S; const lean = 0.035;
  for (const s of [-1, 1]) {
    const c = new THREE.CylinderGeometry(pr * 0.9, pr, H, 14); c.translate(0, H / 2, 0); c.rotateZ(s * lean); c.translate(s * half, 0, 0); red.push(c);
    const b = new THREE.CylinderGeometry(pr * 1.25, pr * 1.35, 0.45 * S, 14); b.translate(s * half, 0.2 * S, 0); black.push(b);
  }
  red.push(geoBox(half * 2 + 0.9 * S, 0.22 * S, 0.17 * S, 0, H * 0.74, 0));
  red.push(geoBox(0.2 * S, 0.62 * S, 0.14 * S, 0, H * 0.87, 0));
  const shimaki = curvedBeam(half * 2 + 1.6 * S, 0.24 * S, 0.3 * S, 0.12 * S); shimaki.translate(0, H + 0.02 * S, 0); red.push(shimaki);
  const kasa = curvedBeam(half * 2 + 2.1 * S, 0.22 * S, 0.38 * S, 0.34 * S, { flare: 0.4 }); kasa.translate(0, H + 0.25 * S, 0); black.push(kasa);
  return { red: mergeClean(red), black: mergeClean(black) };
}
/* a kasuga stone lantern, 2.3 m: base, hexagonal post, the light box with openings, a hexagonal roof with curled tips, the jewel */
function lanternGeo(r, S = 1) {
  const st = []; const lit = [];
  const hex = (rt, rb, h, y) => { const g = new THREE.CylinderGeometry(rt * S, rb * S, h * S, 6); g.translate(0, (y + h / 2) * S, 0); st.push(g); return g; };
  hex(0.36, 0.42, 0.18, 0); hex(0.28, 0.36, 0.12, 0.18);
  const post = new THREE.CylinderGeometry(0.11 * S, 0.13 * S, 0.9 * S, 8); post.translate(0, 0.75 * S, 0); st.push(post);
  st.push(geoBox(0.08 * S, 0.06 * S, 0.27 * S, 0, 0.62 * S, 0), geoBox(0.27 * S, 0.06 * S, 0.08 * S, 0, 0.98 * S, 0));
  hex(0.34, 0.2, 0.16, 1.2);
  /* the light box: four posts, the openings show the flame card inside */
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; const g = geoBox(0.07 * S, 0.34 * S, 0.07 * S, Math.cos(a) * 0.21 * S, 1.53 * S, Math.sin(a) * 0.21 * S); st.push(g); }
  hex(0.26, 0.26, 0.04, 1.36); hex(0.25, 0.25, 0.04, 1.7);
  /* the roof: a low hexagonal pyramid, tips lifted (warabite) */
  const roof = new THREE.ConeGeometry(0.52 * S, 0.3 * S, 6, 2); const rp = roof.attributes.position;
  for (let i = 0; i < rp.count; i++) { const x = rp.getX(i); const z = rp.getZ(i); const rr = Math.hypot(x, z) / (0.52 * S); rp.setY(i, rp.getY(i) + Math.pow(rr, 6) * 0.09 * S); }
  roof.rotateY(Math.PI / 6); roof.translate(0, 1.89 * S, 0); st.push(roof);
  hex(0.1, 0.13, 0.06, 2.03);
  const jewel = new THREE.SphereGeometry(0.1 * S, 10, 8); jewel.scale(1, 1.3, 1); jewel.translate(0, 2.17 * S, 0); st.push(jewel);
  /* the flame card: a small box of light inside the fire box */
  lit.push(geoBox(0.3 * S, 0.24 * S, 0.3 * S, 0, 1.55 * S, 0));
  const g = mergeClean(st); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * (1 + (vnoise(p.getY(i) * 9, p.getZ(i) * 9) - 0.5) * 0.06)); }
  g.computeVertexNormals();
  return { stone: g, lit: mergeClean(lit), light: 1.55 * S };
}
/* bamboo: a clump of canes with nodes, leaning out a little, leaf sprays at the top. Unit: metres. */
function bambooGeo(r, n = 9, H = 9) {
  const canes = []; const leaves = [];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU; const d = Math.sqrt(r()) * 0.9; const x0 = Math.cos(a) * d; const z0 = Math.sin(a) * d;
    const h = H * (0.65 + r() * 0.45); const R = 0.035 + r() * 0.035; const la = a + (r() - 0.5) * 0.8; const lean = 0.08 + r() * 0.12;
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V(x0 + Math.cos(la) * lean * h * t * t, t * h, z0 + Math.sin(la) * lean * h * t * t)); }
    canes.push(taperTube(pts, R, R * 0.55, 5, 8));
    /* nodes: thin rings every 25-40 cm */
    const cv = new THREE.CatmullRomCurve3(pts);
    /* the node rings were 42 triangles every 28-42 cm, about 9000 triangles a clump: now 20 every 38-55 cm */
    for (let y = 0.3 + r() * 0.2; y < h * 0.92; y += 0.38 + r() * 0.17) { const t = y / h; const c = cv.getPointAt(t); const rr = R * (1 - 0.45 * t) * 1.18; const g = new THREE.TorusGeometry(rr, rr * 0.18, 2, 5); g.rotateX(Math.PI / 2); g.translate(c.x, c.y, c.z); canes.push(g); }
    /* leaf sprays in the top third: drooping cards of narrow leaves */
    for (let k = 0; k < 12; k++) { const t = 0.5 + r() * 0.48; const c = cv.getPointAt(t); const ca = r() * TAU; const L = 0.9 + r() * 0.9;
      const g = new THREE.PlaneGeometry(0.7, L, 1, 3); g.translate(0, -L * 0.45, 0); const p = g.attributes.position; for (let q = 0; q < p.count; q++) { const yy = p.getY(q); p.setZ(q, p.getZ(q) + yy * yy * 0.5); }
      g.rotateX(-0.9 - r() * 0.5); g.rotateY(ca); g.translate(c.x, c.y, c.z); leaves.push(g); }
  }
  const out = { cane: mergeGeometries(canes.map((g) => (g.index ? g.toNonIndexed() : g))), leaves: mergeGeometries(leaves) };
  for (const g of [...canes, ...leaves]) g.dispose();
  return out;
}
/* a cloud pad of a pruned pine: needle cards in a flat dome with a crisp flat underside (the niwaki "cloud").
   rx, rz: half sizes; th: thickness. Cards lie near horizontal, so the pad reads as a layered shelf at range. */
function cloudPadGeo(r, rx, rz, th, tones = [0x0b130d, 0x1c2a1a, 0x3a4a2c]) {
  const parts = []; const c0 = new THREE.Color(tones[0]); const c1 = new THREE.Color(tones[1]); const c2 = new THREE.Color(tones[2]); const c = new THREE.Color();
  const n = Math.round(36 + rx * rz * 40);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU; const d = Math.sqrt(r()); const x = Math.cos(a) * d * rx; const z = Math.sin(a) * d * rz;
    const dome = Math.sqrt(Math.max(0, 1 - d * d)); const y = (r() * 0.85 + 0.15) * dome * th;
    const sz = 0.46 + r() * 0.34;
    const q = new THREE.PlaneGeometry(sz * 1.25, sz); q.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.9); q.rotateY(r() * TAU); q.translate(x, y, z);
    const lit = Math.min(1, (y / th) * 0.75 + d * 0.25) * (0.8 + r() * 0.3);
    if (lit < 0.5) c.copy(c0).lerp(c1, lit / 0.5); else c.copy(c1).lerp(c2, Math.min(1, (lit - 0.5) / 0.5));
    const col = new Float32Array(q.attributes.position.count * 3); for (let k = 0; k < q.attributes.position.count; k++) col.set([c.r, c.g, c.b], k * 3);
    q.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(q);
  }
  const g = mergeGeometries(parts); for (const q of parts) q.dispose();
  const pos = g.attributes.position; const nor = g.attributes.normal; const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); v.x /= rx * 2.2; v.z /= rz * 2.2; v.y = 0.9; v.normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
/* a black pine (kuromatsu), cloud-pruned. Two silhouettes:
   kind 0 'tiered' (an upright S-curved trunk with branches to alternate sides, each holding a flat pad, the pads smaller
   toward a crown pad: the garden niwaki), kind 1 'windswept' (a trunk leaning hard to one side, long level limbs on the lean
   side, a few broad stacked shelves: the coast pine of the prints). Unit: metres; about H tall. */
function pineGeo(r, H = 7, kind = 0) {
  const bark = []; const pads = [];
  const side = r() * TAU; const sd = V(Math.cos(side), 0, Math.sin(side));
  const lean = kind === 1 ? V(sd.x * 0.85, 1, sd.z * 0.85) : V(sd.x * 0.18, 1, sd.z * 0.18);
  const trunk = bend(r, V(0, -0.1, 0), lean, H * (kind === 1 ? 0.95 : 1), 7, kind === 1 ? 0.3 : 0.45);
  const R = 0.17 + r() * 0.07;
  bark.push(taperTube(trunk, R, R * 0.32, 8, 14, 0.8));
  const cv = new THREE.CatmullRomCurve3(trunk);
  const pad = (c, rx, rz, th, ry) => { const g = cloudPadGeo(r, rx, rz, th); g.rotateY(ry); g.translate(c.x, c.y - th * 0.25, c.z); pads.push(g); };
  const tiers = kind === 1 ? [0.36, 0.56, 0.74, 0.88] : [0.3, 0.45, 0.59, 0.72, 0.84];
  tiers.forEach((t, b) => {
    const at = cv.getPointAt(t);
    const ang = kind === 1 ? side + (r() - 0.5) * 1.3 + (b % 2 ? 0.5 : -0.5) : side + Math.PI * (b % 2) + (r() - 0.5) * 0.8 + b * 0.6;
    const len = H * (kind === 1 ? 0.36 - t * 0.16 : 0.27 - t * 0.17) * (0.85 + r() * 0.3);
    const pts = bend(r, at, V(Math.cos(ang), kind === 1 ? 0.05 : 0.18, Math.sin(ang)), len, 4, 0.35);
    bark.push(taperTube(pts, R * (0.55 - t * 0.3), R * 0.14, 5, 6));
    const end = pts[pts.length - 1]; const k = kind === 1 ? 1.15 - t * 0.35 : 1.05 - t * 0.55;
    pad(end.clone().add(V(0, 0.12, 0)), 1.75 * k + 0.4, 1.2 * k + 0.3, 0.55 + 0.15 * k, -ang);
  });
  const top = cv.getPointAt(1);
  pad(top.clone().add(V(0, 0.08, 0)), kind === 1 ? 1.4 : 1.1, kind === 1 ? 1.0 : 0.85, 0.65, -side);
  const out = { bark: mergeGeometries(bark), pads: mergeGeometries(pads) };
  for (const g of [...bark, ...pads]) g.dispose();
  return out;
}
/* a jizo: a lotus plinth, a bell-shaped robe with round shoulders, joined hands, a shaved round head,
   a stone halo behind it; a red collar bib over the chest and a red hood. Unit height about 0.95 m. */
function jizoGeo() {
  const st = []; const bib = [];
  const lat = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg);
  const p1 = new THREE.CylinderGeometry(0.2, 0.27, 0.12, 8); p1.translate(0, 0.06, 0); st.push(p1);
  const p2 = new THREE.CylinderGeometry(0.17, 0.21, 0.07, 8); p2.translate(0, 0.155, 0); st.push(p2);
  st.push(lat([[0.001, 0.19], [0.2, 0.19], [0.195, 0.3], [0.17, 0.5], [0.155, 0.62], [0.125, 0.7], [0.075, 0.74], [0.001, 0.75]]));
  const head = new THREE.SphereGeometry(0.115, 14, 12); head.scale(1, 1.08, 1); head.translate(0, 0.84, 0.005); st.push(head);
  const halo = new THREE.CylinderGeometry(0.21, 0.21, 0.035, 18); halo.rotateX(Math.PI / 2); halo.translate(0, 0.86, -0.12); st.push(halo);
  st.push(geoBox(0.11, 0.07, 0.08, 0, 0.5, 0.15));
  /* a short bib on the chest only, so the grey stone robe, the
     hands and the face carry the figure; the cap stays */
  bib.push(lat([[0.082, 0.735], [0.125, 0.705], [0.17, 0.63], [0.19, 0.57]], 16));
  const hood = new THREE.SphereGeometry(0.128, 14, 8, 0, TAU, 0, Math.PI * 0.47); hood.scale(1, 1.1, 1); hood.translate(0, 0.855, 0.005); bib.push(hood);
  return { stone: mergeClean(st), bib: mergeClean(bib) };
}
/* a hip-and-gable roof (irimoya) over a W x D plan: four slopes with a curve toward the eaves, a small gable at the top.
   Returns geometry with uv (u across the slope, v down it) for the tile or straw map. */
function roofGeo(W, D, H, { over = 0.9, curve = 0.25, gable = 0.35, thick = 0.18, lift = 0 } = {}) {
  const parts = [];
  const hw = W / 2 + over; const hd = D / 2 + over; const ridge = Math.max(0.4, hw - hd * (1 - gable));
  const slope = (side) => {
    /* a grid from the ridge line (top) to the eave (bottom) on one side: side 0/1 = +z/-z long sides, 2/3 = +x/-x hips */
    const nu = 12; const nv = 8; const pos = []; const uv = []; const idx = [];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv; const drop = H * (Math.pow(v, 1 + curve) * (1 - curve * 0.3) + v * curve * 0.3);
      for (let i = 0; i <= nu; i++) {
        const u = i / nu * 2 - 1; let x; let z; let y = H - drop;
        if (side < 2) { const e = lerp(ridge, hw, v); x = u * e; z = (side === 0 ? 1 : -1) * lerp(0.02, hd, v); }
        else { const e = lerp(0.02, hd, v); z = u * e; x = (side === 2 ? 1 : -1) * lerp(ridge, hw, v); }
        /* the eave corners lift (sori) */
        const ck = Math.pow(Math.abs(u), 6) * v * v; y += lift * ck + lift * 0.35 * v * v * Math.pow(Math.abs(u), 2);
        pos.push(x, y, z); uv.push(u * (side < 2 ? hw : hd) * 0.5, v * 2.2);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; const b = a + nu + 1; if (side === 0 || side === 3) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  for (let s = 0; s < 4; s++) parts.push(slope(s));
  /* the eave edge: a thick fascia so the roof does not read as paper */
  const fas = []; for (const sz of [-1, 1]) fas.push(geoBox(hw * 2, thick, 0.12, 0, lift * 0.35, sz * hd)); for (const sx of [-1, 1]) fas.push(geoBox(0.12, thick, hd * 2, sx * hw, lift * 0.35, 0));
  /* the ridge and the small gable triangles */
  const rg = new THREE.BoxGeometry(ridge * 2 + 0.3, 0.32, 0.36); rg.translate(0, H + 0.12, 0); fas.push(rg);
  for (const sx of [-1, 1]) { const tri = new THREE.BufferGeometry(); const gx = sx * (ridge - 0.02); tri.setAttribute('position', new THREE.Float32BufferAttribute([gx, H, -0.3, gx, H, 0.3, gx, H - H * 0.28, 0], 3)); tri.computeVertexNormals(); fas.push(tri); }
  const roof = mergeGeometries(parts); for (const p of parts) p.dispose();
  return { roof, trim: mergeClean(fas) };
}

/* ======================================================================== flooded terraces */
const STEP = 1.15; /* terrace step height */
/* the shape of the paddies: hills across the valley, terraced below TOP; returns { h, lvl } (lvl = terrace water level or null) */
function paddyBase(ctx, x, z, rr, ang) {
  const f = ctx.f; const s = sd0(ctx);
  const ax = Math.cos(f.axis); const az = Math.sin(f.axis); const across = Math.abs(-az * x + ax * z);
  const open = sectorK(ang, 0.16);
  let hill = smooth(14, 120, across) * (6 + 26 * fbm(x * 0.007 + s, z * 0.007, 3)) + smooth(30, 200, rr) * 9 * fbm(x * 0.012 - s, z * 0.012, 3);
  hill *= lerp(0.15, 1, open);
  return hill - 0.55 + (fbm(x * 0.03 + s, z * 0.03, 3) - 0.5) * 1.4;
}
function paddyShape(ctx, x, z, rr, ang) {
  const s = sd0(ctx);
  const base = paddyBase(ctx, x, z, rr, ang);
  const rng_ = ranges(x, z, rr, ang, s, { near: [240, 340], far: [400, 620], ampN: 40, ampF: 110, sharp: 1.6, freq: 0.0055 });
  const TOP = 24 + 10 * fbm(x * 0.01, z * 0.01 + s, 2);
  const far = smooth(170, 230, rr);
  if (base < TOP && far < 1) {
    /* the riser is about 0.9 m wide and the bund 0.6 m wide whatever the slope: their share of a step follows the gradient */
    const e = 1.5; const gx = paddyBase(ctx, x + e, z, rr, ang) - base; const gz = paddyBase(ctx, x, z + e, rr, ang) - base;
    const grad = Math.max(0.004, Math.hypot(gx, gz) / e);
    const wf = clamp(0.9 * grad / STEP, 0.015, 0.45); const bw = clamp(0.6 * grad / STEP, 0.01, 0.2);
    const q = base / STEP; const n = Math.floor(q); const fr = q - n;
    const b0 = 1 - wf - bw * 0.6;
    /* field divisions: straight bunds across the terraces, a new angle per terrace */
    const th = n * 1.37 + s; const c = ((x * Math.cos(th) + z * Math.sin(th)) / (13 + (hash2(n, 3) * 9)) + hash2(n, 7)) % 1; const cc = Math.abs((c + 1) % 1 - 0.5);
    const cross = smooth(0.462, 0.485, cc) * 0.24;
    const bund = 0.26 * Math.exp(-(((fr - b0) / bw) ** 2));
    let h = n * STEP + STEP * smooth(1 - wf, 1, fr) + Math.max(bund, fr < b0 ? cross : 0);
    const lvl = n * STEP + 0.13;
    h = lerp(h, base, far);
    return { h: h + rng_, lvl: fr < b0 - bw * 1.2 && far < 0.5 ? lvl : null, n, fr };
  }
  return { h: base + rng_, lvl: null, n: 99, fr: 0 };
}
/* the water of the terraces: one mesh on the terrain's own polar grid, but every triangle LEVEL: a triangle takes the
   lowest terrace level among its three corners, so no sheet of water ever lies on a slope. The opaque terrain clips the level
   sheet along a smooth contour (no per-vertex depth cut, no sawtooth); only a lip hanging more than 0.34 m over lower ground is
   dropped in the shader. Sky and moon reflected, stars in it, slow ripples. */
const PADDY_VERT = `attribute float aDepth; attribute float aField; varying vec3 vW; varying float vDepth; varying float vField;
void main(){ vDepth = aDepth; vField = aField; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const PADDY_FRAG = `uniform float uTime; uniform vec3 uTint; uniform vec3 uDeep; uniform vec3 uSkyLo; uniform vec3 uSkyHi; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uFade; uniform float uFlash; uniform float uStars; uniform vec4 uTorii; uniform vec2 uToriiAx;
varying vec3 vW; varying float vDepth; varying float vField; ${NOISE}
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
/* the big torii seen in the water: the reflected ray meets the torii's own vertical plane; pillars, nuki and kasagi
   are tested in the torii's frame (uTorii = x, base y, z, scale; uToriiAx = the beam direction). Returns red, black. */
vec2 toriiHit(vec3 o, vec3 d){
  if (uTorii.w <= 0.0) return vec2(0.0);
  vec2 nT = vec2(-uToriiAx.y, uToriiAx.x); float dn = dot(d.xz, nT); if (abs(dn) < 1e-3) return vec2(0.0);
  float t = dot(uTorii.xz - o.xz, nT) / dn; if (t < 0.0 || t > 400.0) return vec2(0.0);
  vec3 p = o + d * t; float u = dot(p.xz - uTorii.xz, uToriiAx) / uTorii.w; float y = (p.y - uTorii.y) / uTorii.w;
  float au = abs(u); float e = 0.04 + t * 0.002;
  float pil = (1.0 - smoothstep(0.17, 0.17 + e, abs(au - 1.55 + y * 0.035))) * step(0.0, y) * (1.0 - smoothstep(4.2, 4.2 + e, y));
  float nuki = (1.0 - smoothstep(2.0, 2.0 + e, au)) * (1.0 - smoothstep(0.11, 0.11 + e, abs(y - 3.11)));
  float lift = 0.34 * pow(min(au / 2.6, 1.0), 2.4); float kas = (1.0 - smoothstep(2.6, 2.6 + e, au)) * step(4.22 + lift * 0.4, y) * (1.0 - smoothstep(4.6 + lift, 4.6 + lift + e, y));
  float shi = (1.0 - smoothstep(2.35, 2.35 + e, au)) * step(4.1, y) * (1.0 - smoothstep(4.24 + lift * 0.4, 4.24 + lift * 0.4 + e, y));
  return vec2(clamp(max(max(pil, nuki), shi), 0.0, 1.0), clamp(kas, 0.0, 1.0));
}
float wh(vec2 p){ return sqN2(p * 1.3 + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + sqN2(p * 3.7 - vec2(uTime * 0.09, -uTime * 0.06)) * 0.4; }
void main(){
  if (vDepth > 0.24) discard;
  float e = 0.06; float h0 = wh(vW.xz); float hx = wh(vW.xz + vec2(e, 0.0)); float hz = wh(vW.xz + vec2(0.0, e));
  float calm = mix(0.05, 0.16, fract(vField * 7.31));
  vec3 n = normalize(vec3(-(hx - h0) / e * calm, 1.0, -(hz - h0) / e * calm));
  vec3 v = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 rf = reflect(-v, n);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.55, rf.y));
  vec3 sp = normalize(rf) * 380.0; vec3 cell = floor(sp); float sr = h3(cell);
  vec3 sf = fract(sp) - 0.5; float st = step(0.993, sr) * smoothstep(0.42, 0.0, length(sf) * 2.0) * smoothstep(0.05, 0.3, rf.y);
  sky += vec3(0.8, 0.86, 1.0) * st * uStars * 1.4;
  vec3 sd = normalize(uSunDir); float s = max(dot(rf, sd), 0.0);
  float moon = smoothstep(0.99955, 0.99975, s) * 2.6 + pow(s, 900.0) * 0.8 + pow(s, 90.0) * 0.22 + pow(s, 14.0) * 0.05;
  sky *= 0.82;
  vec2 tr = toriiHit(vW, normalize(rf)); sky = mix(sky, vec3(0.16, 0.035, 0.025), tr.x * 0.9); sky = mix(sky, vec3(0.012, 0.01, 0.012), tr.y * 0.92);
  vec3 c = mix(uDeep, uTint, 0.4 + 0.4 * h0) * (0.75 + 0.5 * fract(vField * 3.7));
  c = mix(c, sky, clamp(fres * 1.25, 0.0, 0.95));
  /* moonlight glitter on the ripples, in a path toward the moon */
  float glit = pow(s, 70.0) * smoothstep(0.55, 0.9, sqN2(vW.xz * 7.0 + vec2(uTime * 0.4, -uTime * 0.25))) * 1.6;
  /* near the camera the moon path on the ripples broke into a blown-out white mosaic: the glint is soft within about 20 m and the water never goes past a dim silver */
  float nearK = smoothstep(5.0, 22.0, length(cameraPosition - vW));
  c += uSunCol * (moon * mix(0.18, 1.0, nearK) + glit * mix(0.12, 1.0, nearK));
  c = min(c, vec3(0.8, 0.82, 0.86));
  c += uFlash * 0.2 * uSkyHi;
  gl_FragColor = vec4(c, uFade);
}`;
/* the shared water material (the terraces and the yard plots): lands.js drives uTime, uFade, uSkyLo, uSkyHi, uFlash on every mesh in land.waters */
function paddyMat(ctx, { tint = 0x141a1c, deep = 0x050708, stars = 0.6, torii = null } = {}) {
  const mat = new THREE.ShaderMaterial({ vertexShader: PADDY_VERT, fragmentShader: PADDY_FRAG, transparent: true, depthWrite: true,
    uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(tint) }, uDeep: { value: new THREE.Color(deep) }, uSkyLo: { value: new THREE.Color() }, uSkyHi: { value: new THREE.Color() },
      uSunDir: { value: V(...ctx.look.sky.sunDir).normalize() }, uSunCol: { value: new THREE.Color(ctx.look.sky.sunCol ?? 0xffffff) }, uFade: { value: 0 }, uFlash: { value: 0 }, uStars: { value: stars }, uTorii: { value: new THREE.Vector4(0, 0, 0, 0) }, uToriiAx: { value: new THREE.Vector2(1, 0) } } });
  if (torii) { mat.uniforms.uTorii.value.set(torii.x, torii.y, torii.z, torii.s); mat.uniforms.uToriiAx.value.set(Math.cos(torii.ry), -Math.sin(torii.ry)); }
  return mat;
}
function addPaddyWater(ctx, L, { tint = 0x141a1c, deep = 0x050708, stars = 0.6, R1 = 205, torii = null } = {}) {
  const NA = 400; const radii = [];
  let rr = 0; while (rr < 720) { rr = rr * 1.0105 + 0.3; if (rr > ARENA_R + 0.5 && rr < R1) radii.push(rr); }
  const NR = radii.length; const N = NR * (NA + 1);
  const px = new Float32Array(N); const pz = new Float32Array(N); const gnd = new Float32Array(N); const lvl = new Float32Array(N); const fld = new Float32Array(N);
  for (let i = 0; i < NR; i++) for (let j = 0; j <= NA; j++) {
    const ang = (j / NA) * TAU; const x = Math.cos(ang) * radii[i]; const z = Math.sin(ang) * radii[i]; const k = i * (NA + 1) + j;
    const sh = paddyShape(ctx, x, z, radii[i], ang);
    px[k] = x; pz[k] = z; gnd[k] = ctx.H(x, z); lvl[k] = sh.lvl ?? NaN;
    fld[k] = hash2(sh.n * 13 + 1, Math.floor((x * Math.cos(sh.n * 1.37) + z * Math.sin(sh.n * 1.37)) / 15));
  }
  /* the triangles are the terrain's own (same polar grid and winding), each lifted to ONE level: the lowest terrace level of its corners */
  const maxTri = (NR - 1) * NA * 2; const P = new Float32Array(maxTri * 9); const D = new Float32Array(maxTri * 3); const F = new Float32Array(maxTri * 3); let nt = 0;
  const tri = (a, b, c) => {
    let lv = Infinity; let gmax = -Infinity; let gmin = Infinity;
    for (const k of [a, b, c]) { const l = lvl[k]; if (l === l && l < lv) lv = l; if (gnd[k] > gmax) gmax = gnd[k]; if (gnd[k] < gmin) gmin = gnd[k]; }
    if (lv === Infinity || lv - gmax > 0.7) return; /* no terrace level at any corner, or a sheet that would hang in the air */
    /* a triangle on a riser kept the upper terrace's level over the
       lower field, and the part within 0.34 m of the ground drew as a pale sky-lit sheet in mid-air. Such triangles go */
    if (lv - gmin > 0.45) return;
    let o = 0; for (const k of [a, b, c]) { P[nt * 9 + o * 3] = px[k]; P[nt * 9 + o * 3 + 1] = lv; P[nt * 9 + o * 3 + 2] = pz[k]; D[nt * 3 + o] = lv - gnd[k]; F[nt * 3 + o] = fld[k]; o++; }
    nt++;
  };
  for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j; const b = a + NA + 1; tri(a, a + 1, b); tri(b, a + 1, b + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P.slice(0, nt * 9), 3)); geo.setAttribute('aDepth', new THREE.BufferAttribute(D.slice(0, nt * 3), 1)); geo.setAttribute('aField', new THREE.BufferAttribute(F.slice(0, nt * 3), 1));
  const mat = paddyMat(ctx, { tint, deep, stars, torii });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; m.frustumCulled = false;
  L.current.group.add(m); L.current.waters.push(m); L.current.owned.push(geo, mat);
  return m;
}
/* rice in rows on the planted fields: small tufts on a lattice turned per terrace */
function addRice(ctx, L, { d0 = 17, d1 = 62, n = 9000, sector = null, k = 1, blades = 6 } = {}) {
  const r = ctx.r; const list = [];
  const sp = 0.55; const row = 0.8;
  for (let tries = 0; tries < n * 6 && list.length < n; tries++) {
    const a = sector ? sector[0] + (r() - 0.5) * sector[1] : r() * TAU; const d = d0 + Math.sqrt(r()) * (d1 - d0); let [x, z] = polar(a, d);
    const sh = paddyShape(ctx, x, z, d, a); if (sh.lvl == null) continue;
    const th = sh.n * 1.37 + 0.4; const c = Math.cos(th); const s = Math.sin(th);
    /* snap to the field's lattice */
    let u = x * c + z * s; let w = -x * s + z * c; u = Math.round(u / sp) * sp; w = Math.round(w / row) * row; x = u * c - w * s; z = u * s + w * c;
    const field = hash2(sh.n * 13 + 1, Math.floor((x * Math.cos(sh.n * 1.37) + z * Math.sin(sh.n * 1.37)) / 15));
    if (field < 0.45) continue;
    const g = ctx.H(x, z); if (sh.lvl - g < 0.06) continue;
    list.push({ x: x + (r() - 0.5) * 0.06, y: g - 0.02, z: z + (r() - 0.5) * 0.06, ry: r() * TAU, tx: (r() - 0.5) * 0.25, tz: (r() - 0.5) * 0.25, s: (0.32 + r() * 0.16) * k, sy: 1.2 + r() * 0.5, delay: Math.max(0, d - 10) * 0.016 });
  }
  const geo = tuftGeo(r, blades, 0.05 * Math.sqrt(6 / blades), 0.16);
  const cols = new Float32Array(geo.attributes.position.count * 3); const c0 = new THREE.Color(0x1a2a14); const c1 = new THREE.Color(0x5a7a3c); const cc = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) { cc.copy(c0).lerp(c1, Math.pow(geo.attributes.uv.getY(i), 0.8)); cols.set([cc.r, cc.g, cc.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.1 }); windPatch(mat, 0.06);
  L.instanced(geo, mat, list, { shadow: false });
  return list.length;
}

/* ======================================================================== the yard paddies
   The fight floor is flat at y = 0 inside ARENA_R and nothing there may be solid. It was one grey-lilac plane. Now it is a
   small rice paddy complex laid as DECALS: shallow flooded plots (the same water shader as the terraces) at y = 0.02, low earth
   bunds between them (0.08 m at most, no footprint), rice shoots in rows in some plots, a dry packed-earth strip across the middle where
   the hero starts, and a rim bund with lanterns just outside the fight floor. */
const YR = 15.6; /* the plots fill the flat disc out to here; the rim bund runs round it at about 16.2 */
function yardPlan(ctx) {
  const f = ctx.f; const r = rng((ctx.seed * 131 + ctx.v * 17 + 5) >>> 0);
  const th = f.axis + 0.35 + (r() - 0.5) * 0.25; const c = Math.cos(th); const s = Math.sin(th);
  const STRIP = 2.1; const cells = []; const rowsAt = [];
  for (const sd of [-1, 1]) {
    let v = STRIP; while (v < YR + 1) {
      const h = 3.3 + r() * 1.7; const a0 = sd > 0 ? v : -(v + h); const a1 = sd > 0 ? v + h : -v; rowsAt.push(a0, a1);
      let u = -YR - 1 - r() * 5; while (u < YR + 1) {
        const w = 4.4 + r() * 3.6; const u0 = u; const u1 = u + w; u += w;
        const du = Math.max(0, Math.abs((u0 + u1) / 2) - w / 2); const dv = Math.max(0, Math.min(Math.abs(a0), Math.abs(a1)));
        if (Math.hypot(du, dv) > YR - 0.3) continue;
        const roll = r(); let type = roll < 0.52 ? 'water' : roll < 0.9 ? 'rice' : 'dry';
        /* a cell that a path or the road crosses stays dry */
        for (let i = 0; i <= 2 && type !== 'dry'; i++) for (let j = 0; j <= 2; j++) { const [x, z] = [c * (u0 + (u1 - u0) * i / 2) - s * (a0 + (a1 - a0) * j / 2), s * (u0 + (u1 - u0) * i / 2) + c * (a0 + (a1 - a0) * j / 2)]; if (lineDist(f.path, x, z) < 1.6 || lineDist(f.road, x, z) < 1.6) { type = 'dry'; break; } }
        cells.push({ u0, u1, v0: a0, v1: a1, type, id: cells.length });
      }
      v += h;
    }
  }
  return { c, s, th, strip: STRIP, cells, rowsAt, YR };
}
/* the dry packed-earth strip across the yard, as the terrain's path mask (1 on the strip) */
const stripK = (f, x, z, rr) => { const pl = f.plan; if (!pl || rr > YR + 1.5) return 0; const v = -x * pl.s + z * pl.c; return smooth(pl.strip + 0.3, pl.strip - 0.2, Math.abs(v)) * smooth(YR + 1.5, YR - 0.5, rr); };
const planUV = (pl, x, z) => [x * pl.c + z * pl.s, -x * pl.s + z * pl.c];
const planXZ = (pl, u, v) => [u * pl.c - v * pl.s, u * pl.s + v * pl.c];
/* is (x, z) in a flooded plot (water or rice) of the yard? used to keep the stubble grass out of the water */
function inYardWater(ctx, x, z) {
  const pl = ctx.f.plan; if (!pl) return false; if (Math.hypot(x, z) > YR + 0.6) return false;
  const [u, v] = planUV(pl, x, z); if (Math.abs(v) < pl.strip + 0.3) return true;
  for (const q of pl.cells) if (q.type !== 'dry' && u > q.u0 && u < q.u1 && v > q.v0 && v < q.v1) return true;
  return false;
}
function addYardPlots(ctx, L, { torii = null, stars = 0.7 } = {}) {
  const pl = ctx.f.plan; const r = rng((ctx.seed * 17 + 3) >>> 0); const BW = 0.54; const hb = BW / 2;
  const clampR = (x, z) => { const d = Math.hypot(x, z); if (d <= YR) return [x, z]; const k = YR / d; return [x * k, z * k]; };
  /* 1. the flooded plots: one mesh of flat quads at y = 0.02, clamped to the disc so they stay on the flat floor */
  const P = []; const F = []; const D = [];
  for (const q of pl.cells) {
    if (q.type === 'dry') continue;
    const x0 = q.u0 + hb; const x1 = q.u1 - hb; const y0 = q.v0 + hb; const y1 = q.v1 - hb; const nu = Math.max(2, Math.round((x1 - x0) / 1.6)); const nv = Math.max(2, Math.round((y1 - y0) / 1.6)); const fld = (q.id * 0.173) % 1;
    const at = (i, j) => { const [x, z] = planXZ(pl, x0 + (x1 - x0) * i / nu, y0 + (y1 - y0) * j / nv); return clampR(x, z); };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = at(i, j); const b = at(i + 1, j); const c = at(i + 1, j + 1); const d = at(i, j + 1);
      for (const [p0, p1, p2] of [[a, c, b], [a, d, c]]) for (const p of [p0, p1, p2]) { P.push(p[0], 0.02, p[1]); F.push(fld); D.push(0.1); } }
  }
  const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wgeo.setAttribute('aField', new THREE.Float32BufferAttribute(F, 1)); wgeo.setAttribute('aDepth', new THREE.Float32BufferAttribute(D, 1));
  const wmat = paddyMat(ctx, { tint: 0x0c1218, deep: 0x030405, stars, torii });
  const wm = new THREE.Mesh(wgeo, wmat); wm.renderOrder = 1; wm.frustumCulled = false; L.current.group.add(wm); L.current.waters.push(wm); L.current.owned.push(wgeo, wmat);
  /* 1b. a dry plot showed the pale
     path layer of the terrain from edge to edge. Its earth is now dark, wet harvested mud (a low quad grid at 0.012 m),
     except where the road or the path crosses it, so the path still reads through it */
  { const DP = []; const f = ctx.f;
    for (const q of pl.cells) { if (q.type !== 'dry') continue;
      const x0 = q.u0 + hb; const x1 = q.u1 - hb; const y0 = q.v0 + hb; const y1 = q.v1 - hb; const nu = Math.max(2, Math.round((x1 - x0) / 0.5)); const nv = Math.max(2, Math.round((y1 - y0) / 0.5));
      const at = (i, j) => clampR(...planXZ(pl, x0 + (x1 - x0) * i / nu, y0 + (y1 - y0) * j / nv));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = at(i, j); const b = at(i + 1, j); const c = at(i + 1, j + 1); const d = at(i, j + 1); const mx = (a[0] + c[0]) / 2; const mz = (a[1] + c[1]) / 2;
        if ((f.road && lineDist(f.road, mx, mz) < 1.3) || (f.path && lineDist(f.path, mx, mz) < 1.1)) continue;
        for (const p of [a, c, b, a, d, c]) DP.push(p[0], 0.012, p[1]); } }
    if (DP.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(DP, 3)); g.computeVertexNormals();
      const uv = new Float32Array(DP.length / 3 * 2); for (let i = 0; i < DP.length / 3; i++) { uv[i * 2] = DP[i * 3] * 0.4; uv[i * 2 + 1] = DP[i * 3 + 2] * 0.4; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mm = triMaterial('brown_mud_02', { tint: 0x16110c, tile: 1.6, nstr: 0.9, desat: 0.3, specMax: 0.18 }); const m = new THREE.Mesh(g, mm); m.receiveShadow = true; L.add(m, { grow: false, owned: false }); L.current.owned.push(g, mm); } }
  /* 2. the bunds: low mounds (half a cylinder squashed to 0.08 m) along the row lines and the column lines, clipped to the disc */
  const bundG = []; const tufts = []; const seg = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.3) return;
    const g = new THREE.CylinderGeometry(0.3, 0.32, len + 0.4, 8, 1); g.rotateX(Math.PI / 2); g.scale(1, 0.27, 1);
    const ry = Math.atan2(bx - ax, bz - az); g.rotateY(ry); g.translate((ax + bx) / 2, 0, (az + bz) / 2); bundG.push(g);
    for (let t = 0.2; t < len; t += 0.5 + r() * 0.35) { if (r() < 0.38) continue; const x = ax + (bx - ax) * t / len + (r() - 0.5) * 0.3; const z = az + (bz - az) * t / len + (r() - 0.5) * 0.3; tufts.push({ x, y: 0.03, z, ry: r() * TAU, s: 0.5 + r() * 0.6, sy: 0.7 + r() * 0.8, tx: (r() - 0.5) * 0.3, tz: (r() - 0.5) * 0.3 }); }
  };
  const chord = (u0, v0, u1, v1) => { /* clip a segment (in plot coordinates) to the disc YR + 0.4 and emit it */
    const Rb = YR + 0.2; const A = planXZ(pl, u0, v0); const B = planXZ(pl, u1, v1); const dx = B[0] - A[0]; const dz = B[1] - A[1];
    const a = dx * dx + dz * dz; const b = 2 * (A[0] * dx + A[1] * dz); const c = A[0] * A[0] + A[1] * A[1] - Rb * Rb; const disc = b * b - 4 * a * c; if (disc <= 0 || a < 1e-6) return;
    const t0 = Math.max(0, (-b - Math.sqrt(disc)) / (2 * a)); const t1 = Math.min(1, (-b + Math.sqrt(disc)) / (2 * a)); if (t1 - t0 < 0.02) return;
    seg(A[0] + dx * t0, A[1] + dz * t0, A[0] + dx * t1, A[1] + dz * t1);
  };
  const lines = new Set();
  for (const v of pl.rowsAt) { const k = v.toFixed(2); if (lines.has(k)) continue; lines.add(k); chord(-YR - 2, v, YR + 2, v); }
  for (const q of pl.cells) chord(q.u0, q.v0, q.u0, q.v1);
  for (const q of pl.cells) if (q.u1 > YR) chord(q.u1, q.v0, q.u1, q.v1);
  /* the dry strip is edged by its two row lines already (the first row boundary at +-STRIP). The rim bund: a ribbon round the disc, wavering */
  const rimPts = []; const NR2 = 160; const prof = [[-0.62, -0.02], [-0.32, 0.045], [0, 0.09], [0.32, 0.045], [0.62, -0.02]];
  const ph = r() * TAU; const rimC = (a) => 16.55 + 0.25 * Math.sin(a * 3 + ph) + 0.15 * Math.sin(a * 7 + ph * 2); const rimW = (a) => 0.8 + 0.25 * Math.sin(a * 5 + ph * 3);
  const rpos = []; const ridx = [];
  for (let i = 0; i <= NR2; i++) { const a = i / NR2 * TAU; for (const [o, hh] of prof) { const rr2 = rimC(a) + o * rimW(a); const x = Math.cos(a) * rr2; const z = Math.sin(a) * rr2; rpos.push(x, ctx.H(x, z) + hh, z); }
    if (i < NR2) { const k = i * prof.length; for (let q = 0; q < prof.length - 1; q++) ridx.push(k + q, k + q + prof.length, k + q + 1, k + q + 1, k + q + prof.length, k + q + prof.length + 1); }
    if (i % 2 === 0 && i < NR2) for (let q = 0; q < 2; q++) { const t = (r() - 0.5) * 0.7; const x2 = Math.cos(a) * (rimC(a) + t); const z2 = Math.sin(a) * (rimC(a) + t); if (angOff(a) > 0.25 || r() < 0.4) tufts.push({ x: x2, y: ctx.H(x2, z2) + 0.04, z: z2, ry: r() * TAU, s: 0.6 + r() * 0.7, sy: 0.8 + r() * 0.9, tx: (r() - 0.5) * 0.3, tz: (r() - 0.5) * 0.3 }); } }
  const rim = new THREE.BufferGeometry(); rim.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3)); rim.setIndex(ridx); rim.computeVertexNormals();
  const earth = triMaterial('brown_mud_02', { tint: 0x3a2e22, tile: 1.4, nstr: 0.7, desat: 0.35, specMax: 0.12 });
  if (bundG.length) { const bm = new THREE.Mesh(mergeClean(bundG), earth); bm.receiveShadow = true; for (const g of bundG) g.dispose(); L.add(bm, { grow: false }); }
  { const rm = new THREE.Mesh(rim, earth); rm.receiveShadow = true; L.add(rm, { grow: false, owned: false }); L.current.owned.push(rim); }
  /* grass on the bunds and the rim: dark root, dry gold tip */
  if (tufts.length) { const geo = tuftGeo(r, 7, 0.035, 0.22); const cols = new Float32Array(geo.attributes.position.count * 3); const c0 = new THREE.Color(0x131a0e); const c1 = new THREE.Color(0x6a6a3a); const cc = new THREE.Color();
    for (let i = 0; i < geo.attributes.position.count; i++) { cc.copy(c0).lerp(c1, Math.pow(geo.attributes.uv.getY(i), 0.9)); cols.set([cc.r, cc.g, cc.b], i * 3); } geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.1 }); windPatch(gm, 0.05); L.instanced(geo, gm, tufts.map((t) => ({ ...t, delay: 0 })), { shadow: false }); }
  /* 3. rice shoots in rows, on the plots that are planted */
  const rice = []; const sp = 0.5; const row = 0.62;
  for (const q of pl.cells) { if (q.type !== 'rice') continue;
    for (let u = q.u0 + hb + 0.4; u < q.u1 - hb - 0.3; u += sp) for (let v = q.v0 + hb + 0.4; v < q.v1 - hb - 0.3; v += row) {
      const [x, z] = planXZ(pl, u + (r() - 0.5) * 0.05, v + (r() - 0.5) * 0.05); if (Math.hypot(x, z) > YR - 0.5) continue;
      rice.push({ x, y: 0.0, z, ry: r() * TAU, tx: (r() - 0.5) * 0.22, tz: (r() - 0.5) * 0.22, s: 0.34 + r() * 0.14, sy: 1.15 + r() * 0.5, delay: 0 }); } }
  if (rice.length) { const geo = tuftGeo(r, 6, 0.05, 0.16); const cols = new Float32Array(geo.attributes.position.count * 3); const c0 = new THREE.Color(0x1a2a14); const c1 = new THREE.Color(0x6a8a44); const cc = new THREE.Color();
    for (let i = 0; i < geo.attributes.position.count; i++) { cc.copy(c0).lerp(c1, Math.pow(geo.attributes.uv.getY(i), 0.8)); cols.set([cc.r, cc.g, cc.b], i * 3); } geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.1 }); windPatch(mat, 0.06); L.instanced(geo, mat, rice, { shadow: false }); }
  return rice.length;
}
/* small paper lanterns (chochin) on bamboo poles: warm accents on the rim bund. list = [{ x, z, s }] */
function buildPaperLanterns(ctx, L, list, { lamp = 0xffa850 } = {}) {
  if (!list.length) return; const r = ctx.r;
  const pole = new THREE.CylinderGeometry(0.025, 0.035, 2.1, 6); pole.translate(0, 1.05, 0); const arm = new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5); arm.rotateZ(Math.PI / 2); arm.translate(0.2, 2.04, 0);
  const sock = new THREE.CylinderGeometry(0.12, 0.14, 0.1, 8); sock.translate(0, 0.05, 0); const pg = mergeGeometries([pole, arm, sock]); pole.dispose(); arm.dispose(); sock.dispose();
  const tex = canvasTex('edo-chochin', 64, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(120,40,10,0.65)'; for (let x = 0; x <= w; x += 8) g.fillRect(x, 0, 2, h); g.fillStyle = '#5a1a0c'; g.fillRect(0, 0, w, 9); g.fillRect(0, h - 9, w, 9); });
  const lg = new THREE.SphereGeometry(0.2, 12, 10); lg.scale(0.85, 1.25, 0.85); lg.translate(0.4, 1.78, 0);
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2e1e, roughness: 0.9 });
  const paper = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(lamp).multiplyScalar(1.7) });
  const inst = list.map((t) => ({ x: t.x, y: ctx.H(t.x, t.z) - 0.05, z: t.z, ry: t.ry ?? r() * TAU, s: t.s ?? 1, sy: 1, tx: (r() - 0.5) * 0.04, tz: (r() - 0.5) * 0.04 }));
  L.instanced(pg, wood, inst); L.instanced(lg, paper, inst, { shadow: false });
  const glows = []; for (const t of inst) { const x = t.x + Math.cos(t.ry) * 0.4 * t.s; const z = t.z - Math.sin(t.ry) * 0.4 * t.s; glows.push([x, t.y + 1.78 * t.s, z, 0.45 * t.s], [x, t.y + 1.78 * t.s, z, 1.9 * t.s]); }
  addGlows(L, glows, lamp, { alpha: 0.9 });
  for (const t of inst) solid(ctx, t.x, t.z, 0.25, 'lantern');
}

/* ======================================================================== set pieces */
/* place a merged mesh in the land: position, turn, shadows, grow-in */
function place(L, geo, mat, x, y, z, ry = 0, { shadow = true, grow = true } = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow; m.receiveShadow = true; L.add(m, { grow }); return m;
}
/* torii at the given spots [{x, z, ry, s}]: instanced, two materials */
function buildToriis(ctx, L, list, { color = 0xb8321e } = {}) {
  if (!list.length) return;
  const geo = toriiGeo(1); const red = paintMat(color, { streak: 0.45, wear: 0.35 }); const black = paintMat(0x121012, { rough: 0.5, streak: 0.2, wear: 0.4 });
  const inst = list.map((t) => ({ x: t.x, y: ctx.H(t.x, t.z) - 0.05, z: t.z, ry: t.ry, s: t.s, sy: 1 }));
  L.instanced(geo.red, red, inst); L.instanced(geo.black, black, inst);
  for (const t of list) solidAlong(ctx, t.x, t.z, t.ry, [[-1.55 * t.s], [1.55 * t.s]], 0.3 * t.s, 'torii');
}
/* stone lanterns [{x, z, ry, s, lit}]; lit ones glow (and their glow is mirrored in the water below when wet) */
function buildLanterns(ctx, L, list, { lamp = 0xff9a48, water = null, snow = 0 } = {}) {
  if (!list.length) return;
  const r = ctx.r; const g = lanternGeo(r, 1);
  const sm = stoneMat(0x8a8780, snow ? { cover: 0xc8ccd4, coverAmt: 0.95 } : {});
  const inst = list.map((t) => ({ x: t.x, y: ctx.H(t.x, t.z) - 0.04, z: t.z, ry: t.ry ?? r() * TAU, s: t.s ?? 1, sy: 1, tx: (r() - 0.5) * 0.05, tz: (r() - 0.5) * 0.05 }));
  L.instanced(g.stone, sm, inst);
  const lit = inst.filter((_, i) => list[i].lit);
  if (lit.length) {
    L.instanced(g.lit, new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp).multiplyScalar(2.2) }), lit, { shadow: false });
    const glows = []; const mirror = [];
    for (const t of lit) { const y = t.y + g.light * t.s; glows.push([t.x, y, t.z, 0.5 * t.s], [t.x, y, t.z, 2.2 * t.s]); if (water != null) { const wl = water(t.x, t.z); if (wl != null) mirror.push([t.x, 2 * wl - y, t.z, 1.6 * t.s]); } }
    addGlows(L, glows, lamp, { alpha: 1.1 });
    if (mirror.length) addGlows(L, mirror, lamp, { alpha: 0.35 });
  }
  for (const t of inst) solid(ctx, t.x, t.z, 0.5 * t.s, 'lantern');
}
/* bamboo groves: clumps at the given centres; canes in one batch, leaves in another (they sway) */
function buildBamboo(ctx, L, spots, { snow = 0 } = {}) {
  const r = ctx.r; const kinds = [0, 1, 2].map(() => bambooGeo(r, 7 + Math.floor(r() * 5), 8 + r() * 4));
  const cane = new THREE.MeshStandardMaterial({ color: snow ? 0x5a6048 : 0x3a4226, roughness: 0.6, metalness: 0, envMapIntensity: 0.25 });
  const leaf = new THREE.MeshStandardMaterial({ color: snow ? 0x3a4834 : 0x223018, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.1, alphaMap: leafTex(), alphaTest: 0.45 }); windPatch(leaf, 0.035, { local: 0.02 });
  windPatch(cane, 0.012, { local: 0.02 });
  const by = [[], [], []];
  for (const [x, z, n] of spots) for (let i = 0; i < n; i++) { const a = r() * TAU; const d = Math.sqrt(r()) * 3.2; const px = x + Math.cos(a) * d; const pz = z + Math.sin(a) * d; if (Math.hypot(px, pz) < ARENA_R + 1.5) continue; by[i % 3].push({ x: px, y: ctx.H(px, pz) - 0.1, z: pz, ry: r() * TAU, s: 0.85 + r() * 0.3, sy: 1 }); solid(ctx, px, pz, 0.5, 'bamboo'); }
  by.forEach((list, k) => { L.instanced(kinds[k].cane, cane, list); L.instanced(kinds[k].leaves, leaf, list, { shadow: true }); });
}
/* narrow leaf strips (bamboo), white = solid */
const leafTex = () => canvasTex('edo-bamboo-leaf', 64, 128, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; const r = rng(3);
  for (let i = 0; i < 9; i++) { const x = 6 + r() * (w - 12); const y = r() * h * 0.3; g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.5); g.beginPath(); g.ellipse(0, h * 0.3, 3.2, h * 0.3, 0, 0, TAU); g.fill(); g.restore(); }
});
/* the bailey's furniture, all outside the 16 m fight floor: rice bales stacked under a lean-to, a spear rack, a stone well
   with a little roof and an old pine in a stone ring (a flat empty yard read as a car park) */
function buildYard(ctx, L, f, { snow = 0 } = {}) {
  const r = ctx.r; const wood = []; const straw = []; const rope = []; const stone = []; const iron = [];
  const free = (a, d) => { const [x, z] = polar(a, d); return lineDist(f.road, x, z) > CUT + 1.5 ? [x, z] : null; };
  const place = (g, x, z, ry, y = 0) => { g.rotateY(ry); g.translate(x, ctx.H(x, z) + y, z); return g; };
  const spots = f.yardSpots ? [...f.yardSpots] : []; for (let i = 0; i < 40 && !f.yardSpots && spots.length < 4; i++) { const a = NEMESIS_ANG + 0.9 + r() * (TAU - 1.8); const p = free(a, 21 + r() * 1.5); /* footprints stay outside ARENA_R + 2 m */ if (p && spots.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 9)) spots.push(p); }
  const [s0, s1, s2, s3] = spots;
  /* 1: rice bales (tawara) in a 3-2-1 stack, each a fat straw drum with two rope bands, under a shingled lean-to */
  if (s0) { const [x, z] = s0; const ry = Math.atan2(-x, -z);
    const bale = (dx, dy, dz) => { const g = new THREE.LatheGeometry([[0.001, -0.42], [0.2, -0.41], [0.3, -0.3], [0.33, 0], [0.3, 0.3], [0.2, 0.41], [0.001, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 12); g.rotateZ(Math.PI / 2); g.translate(dx, dy, dz); straw.push(place(g, x, z, ry));
      for (const bx of [-0.2, 0.2]) { const b = new THREE.TorusGeometry(0.325, 0.02, 4, 12); b.rotateY(Math.PI / 2); b.translate(dx + bx, dy, dz); rope.push(place(b, x, z, ry)); } };
    for (let row = 0; row < 3; row++) for (let k = 0; k < 3 - row; k++) bale(0, 0.33 + row * 0.58, (k - (2 - row) / 2) * 0.68);
    for (const [px, pz] of [[-0.9, -1.3], [-0.9, 1.3], [0.9, -1.3], [0.9, 1.3]]) wood.push(place(geoBox(0.14, 2.4 + (px < 0 ? 0.5 : 0), 0.14, px, 1.2 + (px < 0 ? 0.25 : 0), pz), x, z, ry));
    const rf = geoBox(2.3, 0.08, 3.2, 0, 2.7, 0); rf.rotateZ(0.22); wood.push(place(rf, x, z, ry)); solid(ctx, x, z, 1.6, 'bales'); }
  /* 2: a spear rack: two posts, two rails, five yari standing in it */
  if (s1) { const [x, z] = s1; const ry = Math.atan2(-x, -z);
    for (const px of [-1.2, 1.2]) wood.push(place(geoBox(0.12, 1.5, 0.12, px, 0.75, 0), x, z, ry));
    for (const py of [0.5, 1.35]) wood.push(place(geoBox(2.6, 0.08, 0.1, 0, py, 0), x, z, ry));
    for (let k = 0; k < 5; k++) { const sx = -0.9 + k * 0.45; const sh = new THREE.CylinderGeometry(0.018, 0.022, 2.6, 5); sh.rotateX(-0.12); sh.translate(sx, 1.3, 0.12); wood.push(place(sh, x, z, ry));
      const hd = new THREE.ConeGeometry(0.03, 0.3, 4); hd.rotateX(-0.12); hd.translate(sx, 2.74, 0.29); iron.push(place(hd, x, z, ry)); }
    solid(ctx, x, z, 1.3, 'rack'); }
  /* 3: a stone well with a two-post roof and a bucket */
  if (s2) { const [x, z] = s2;
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; const b = chunkGeo(r, { w: 0.42, h: 0.75, d: 0.28, chip: 0.2, seg: 1 }); b.rotateY(-a); b.translate(Math.cos(a) * 0.62, 0.38, Math.sin(a) * 0.62); stone.push(place(b, x, z, 0)); }
    for (const px of [-0.8, 0.8]) wood.push(place(geoBox(0.12, 2.3, 0.12, px, 1.15, 0), x, z, 0));
    wood.push(place(geoBox(1.9, 0.1, 0.1, 0, 2.0, 0), x, z, 0));
    for (const sd of [-1, 1]) { const rp = geoBox(2.1, 0.06, 0.8, 0, 2.38, sd * 0.32); rp.rotateX(sd * 0.55); wood.push(place(rp, x, z, 0)); }
    const bk = new THREE.CylinderGeometry(0.14, 0.12, 0.22, 8); bk.translate(0.35, 0.86, 0.1); wood.push(place(bk, x, z, 0)); solid(ctx, x, z, 1.0, 'well'); }
  /* 4: an old pine in a ring of stones */
  if (s3) { const [x, z] = s3; buildPines(ctx, L, [{ x, z, h: 6.5 }], { snow, kinds: 1 });
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; const b = chunkGeo(r, { w: 0.5, h: 0.3, d: 0.4, chip: 0.3, seg: 1 }); b.rotateY(-a); b.translate(Math.cos(a) * 1.3, 0.1, Math.sin(a) * 1.3); stone.push(place(b, x, z, 0)); } }
  if (wood.length) L.add(Object.assign(new THREE.Mesh(mergeClean(wood), woodMat(0x3a2e24)), { castShadow: true, receiveShadow: true }));
  if (straw.length) L.add(Object.assign(new THREE.Mesh(mergeClean(straw), paintMat(snow ? 0x9a9488 : 0x7a6644, { rough: 0.95, streak: 0.6, wear: 0.5 })), { castShadow: true, receiveShadow: true }));
  if (rope.length) L.add(new THREE.Mesh(mergeClean(rope), paintMat(0x2a2016, { rough: 0.9 })));
  if (stone.length) L.add(Object.assign(new THREE.Mesh(mergeClean(stone), stoneMat(0x8a8680, snow ? { cover: 0xd0d4dc, coverAmt: 1 } : {})), { castShadow: true, receiveShadow: true }));
  if (iron.length) L.add(new THREE.Mesh(mergeClean(iron), paintMat(0x6a6a70, { rough: 0.4 })));
}
/* far pines on the hills: the cloud-pruned pine at hill scale (the shared conifer read as stacked Alpine cones) */
function farPines(ctx, { n = 40, d0 = 60, d1 = 190, hMin = 8 } = {}) {
  const r = ctx.r; const out = [];
  for (let i = 0; i < n * 6 && out.length < n; i++) { const a = r() * TAU; const d = d0 + r() * (d1 - d0); const [x, z] = polar(a, d); if (ctx.H(x, z) < hMin && r() > 0.05) continue; if (angOff(a) < 0.12) continue; out.push({ x, z, h: 9 + r() * 6 }); }
  return out;
}
/* black pines [{x, z, h}] */
function buildPines(ctx, L, list, { snow = 0, kinds = 4 } = {}) {
  if (!list.length) return;
  const r = ctx.r; const geos = Array.from({ length: kinds }, (_, k) => pineGeo(r, 7, k % 2)); /* tiered and windswept, two of each */
  const bark = triMaterial('bark_brown_02', { tint: 0x5a4a40, tile: 0.7, desat: 0.4, nstr: 1.6, specMax: 0.05, cover: snow ? 0xc8ccd6 : null, coverAmt: snow ? 0.9 : 0 });
  const pad = leafClusterMaterial(snow ? 0xa0a8a0 : 0xffffff, { rough: 0.85, trans: 0x0a1206 });
  const by = geos.map(() => []);
  list.forEach((t, i) => { by[i % kinds].push({ x: t.x, y: ctx.H(t.x, t.z) - 0.15, z: t.z, ry: r() * TAU, s: t.h / 7, sy: 1 }); solid(ctx, t.x, t.z, 0.25 * t.h / 7, 'pine'); });
  by.forEach((l, k) => { if (!l.length) return; L.instanced(geos[k].bark, bark, l); L.instanced(geos[k].pads, pad, l); });
}
/* a minka: a farmhouse on a stone footing, dark timber, lit shoji, a deep thatched irimoya roof and a smoke hole */
function buildMinka(ctx, L, x, z, rot, { W = 9, D = 6.5, H = 2.7, lamp = 0xffa050, snow = 0, roofH = 4.6, gable = 0.45 } = {}) {
  const r = ctx.r; const y0 = Math.min(ctx.H(x, z), ctx.H(x + 3, z), ctx.H(x - 3, z), ctx.H(x, z + 3), ctx.H(x, z - 3)) - 0.05;
  /* the footprint covers the whole plan with its eaves: circles along the long side, each reaching the corners
     (one circle of 0.62 x W left the corners open and a walk hero got stuck inside a corner) */
  { const L0 = Math.max(W, D) + 1.2; const S0 = Math.min(W, D) + 1.2; const n = Math.max(2, Math.ceil(L0 / S0) + 1); const rr = Math.hypot(S0 / 2, L0 / (2 * (n - 1))) + 0.2;
    const along = W >= D; const pts = []; for (let i = 0; i < n; i++) { const o = -L0 / 2 + S0 / 2 + (i / (n - 1)) * (L0 - S0); pts.push(along ? [o, 0] : [0, o]); }
    solidAlong(ctx, x, z, rot, pts, Math.max(rr, S0 * 0.72), 'minka'); }
  const wood = []; const stone = [];
  /* footing stones and the raised floor */
  for (let xx = -W / 2; xx <= W / 2; xx += W / 4) for (const zz of [-D / 2, 0, D / 2]) { const b = chunkGeo(r, { w: 0.5, h: 0.5, d: 0.5, chip: 0.25 }); b.translate(xx, -0.1, zz); stone.push(b); }
  wood.push(geoBox(W + 0.2, 0.16, D + 0.2, 0, 0.5, 0));
  /* posts and beams */
  for (let xx = -W / 2; xx <= W / 2 + 0.01; xx += W / 4) for (const zz of [-D / 2, D / 2]) wood.push(geoBox(0.2, H, 0.2, xx, 0.5 + H / 2, zz));
  for (const zz of [-D / 2, 0, D / 2]) for (const xx of [-W / 2, W / 2]) wood.push(geoBox(0.2, H, 0.2, xx, 0.5 + H / 2, zz));
  for (const zz of [-D / 2, D / 2]) wood.push(geoBox(W + 0.4, 0.26, 0.24, 0, 0.5 + H, zz), geoBox(W + 0.2, 0.12, 0.16, 0, 0.5 + H * 0.36, zz));
  for (const xx of [-W / 2, W / 2]) wood.push(geoBox(0.24, 0.26, D + 0.4, xx, 0.5 + H, 0));
  /* the engawa: a veranda along the front */
  wood.push(geoBox(W + 0.4, 0.1, 1.1, 0, 0.42, D / 2 + 0.6)); for (let xx = -W / 2; xx <= W / 2; xx += W / 4) wood.push(geoBox(0.14, 0.4, 0.14, xx, 0.2, D / 2 + 1.05));
  /* dark board walls on the back and sides, shoji panels on the front (lit), one panel slid open */
  const shoji = []; const dark = [];
  for (let k = 0; k < 4; k++) { const cx = -W / 2 + W / 8 + k * W / 4; if (k === 2) { dark.push(geoBox(W / 4 - 0.25, H - 0.5, 0.05, cx, 0.5 + (H - 0.5) / 2 + 0.05, D / 2 - 0.08)); continue; } shoji.push(geoBox(W / 4 - 0.22, H * 0.66, 0.04, cx, 0.62 + H * 0.33, D / 2)); wood.push(geoBox(W / 4 - 0.22, H * 0.22, 0.06, cx, 0.5 + H * 0.84, D / 2)); }
  for (const zz of [-D / 2]) wood.push(geoBox(W, H - 0.1, 0.08, 0, 0.5 + H / 2, zz));
  for (const xx of [-W / 2, W / 2]) { wood.push(geoBox(0.08, H - 0.1, D, xx, 0.5 + H / 2, 0)); }
  shoji.push(geoBox(0.04, H * 0.5, 1.4, W / 2 + 0.03, 0.62 + H * 0.4, -D / 4));
  const roof = roofGeo(W, D, roofH, { over: 1.3, curve: 0.15, gable, thick: 0.55, lift: 0.1 });
  const holder = new THREE.Group(); holder.position.set(x, y0, z); holder.rotation.y = rot;
  const add = (g, m, shadow = true) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = shadow; mesh.receiveShadow = true; holder.add(mesh); L.current.owned.push(g, m); return mesh; };
  add(mergeClean(wood), woodMat(0x3a3028)); add(mergeClean(stone), stoneMat(0x7a7870));
  const dm = new THREE.Mesh(mergeClean(dark), new THREE.MeshBasicMaterial({ color: 0x050403 })); holder.add(dm); L.current.owned.push(dm.geometry, dm.material);
  const sm = shojiMat(lamp, 1.25); const sg = mergeGeometries(shoji.map((g) => g.toNonIndexed())); for (const g of shoji) g.dispose(); add(sg, sm, false);
  const rm = add(roof.roof, snow ? tileMat(0xd8dce4, 0) : strawMat(0x9a8a68)); rm.position.y = 0.5 + H - 0.1;
  const tm = add(roof.trim, snow ? new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.9 }) : strawMat(0x6a5a40)); tm.position.y = 0.5 + H - 0.1;
  /* inside dark box behind the shoji, so the paper glows against a black room */
  const inside = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, H - 0.2, D - 0.3), new THREE.MeshBasicMaterial({ color: 0x0a0604, side: THREE.BackSide })); inside.position.y = 0.5 + H / 2; holder.add(inside); L.current.owned.push(inside.geometry, inside.material);
  holder.userData.growY = 1; holder.scale.y = 0.0001; L.current.parts.push(holder); L.current.group.add(holder);
  holder.updateMatrixWorld(true);
  const glows = []; for (let k = 0; k < 4; k++) { if (k === 2) continue; const p = V(-W / 2 + W / 8 + k * W / 4, 0.62 + H * 0.33, D / 2 + 0.6).applyMatrix4(holder.matrixWorld); glows.push([p.x, p.y, p.z, 2.6]); }
  addGlows(L, glows, lamp, { alpha: 0.4 });
  const top = V(0, 0.5 + H + roofH + 0.1, 0).applyMatrix4(holder.matrixWorld);
  addSmoke(L, [top.x, top.y, top.z], { n: 16, size: 2.2, rise: 16, life: 22, wind: [0.4, 0, 0.15], low: 0x3a3a3c, high: 0x5a5c62, alpha: 0.25 });
  return holder;
}
/* a small hill shrine (hokora): a tiny roofed box on a stone plinth, two lanterns, a lit offering glow */
function buildShrine(ctx, L, x, z, rot, { lamp = 0xff9a48 } = {}) {
  const r = ctx.r; const y0 = ctx.H(x, z) - 0.05;
  const holder = new THREE.Group(); holder.position.set(x, y0, z); holder.rotation.y = rot;
  const stone = []; const wood = [];
  stone.push(geoBox(3.4, 0.6, 3.0, 0, 0.3, 0), geoBox(2.6, 0.3, 2.4, 0, 0.75, 0));
  wood.push(geoBox(1.8, 1.4, 1.5, 0, 1.6, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(geoBox(0.14, 1.6, 0.14, sx * 0.85, 1.7, sz * 0.7));
  const roof = roofGeo(1.8, 1.5, 1.1, { over: 0.55, curve: 0.4, gable: 0.2, thick: 0.12, lift: 0.18 });
  const add = (g, m) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; holder.add(mesh); L.current.owned.push(g, m); return mesh; };
  add(mergeClean(stone), stoneMat(0x8a8880)); add(mergeClean(wood), woodMat(0x5a3a2a));
  const rm = add(roof.roof, tileMat(0x9a9aa0)); rm.position.y = 2.3; const tm = add(roof.trim, paintMat(0x1a1616)); tm.position.y = 2.3;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), shojiMat(lamp, 1.5)); door.position.set(0, 1.55, 0.76); holder.add(door); L.current.owned.push(door.geometry, door.material);
  holder.userData.growY = 1; holder.scale.y = 0.0001; L.current.parts.push(holder); L.current.group.add(holder); holder.updateMatrixWorld(true);
  solid(ctx, x, z, 2.2, 'shrine');
  const c = V(0, 1.55, 1.2).applyMatrix4(holder.matrixWorld); addGlows(L, [[c.x, c.y, c.z, 0.9], [c.x, c.y, c.z, 3.5]], lamp, { alpha: 0.8 });
  const lan = []; for (const sx of [-1, 1]) { const p = V(sx * 2.3, 0, 2.2).applyMatrix4(holder.matrixWorld); lan.push({ x: p.x, z: p.z, s: 0.75, lit: true }); }
  return lan;
}
/* jizo in a row by a path, red bibs */
function buildJizo(ctx, L, x, z, rot, n = 5, snow = 0, k = 1) {
  const g = jizoGeo(); const r = ctx.r; const list = [];
  for (let i = 0; i < n; i++) { const lx = (i - (n - 1) / 2) * 0.66 * k; const px = x + Math.cos(rot) * lx; const pz = z - Math.sin(rot) * lx; list.push({ x: px, y: ctx.H(px, pz) - 0.03, z: pz, ry: rot + (r() - 0.5) * 0.3, s: (0.9 + r() * 0.25) * k, sy: 1, tx: (r() - 0.5) * 0.05, tz: (r() - 0.5) * 0.05 }); solid(ctx, px, pz, 0.3 * k, 'jizo'); }
  const sm = stoneMat(snow ? 0xc4c8d0 : 0xc2beb2, snow ? { cover: 0xd0d4dc, coverAmt: 1 } : { cover: 0x4a5a38, coverAmt: 0.25, specMax: 0.5 }); sm.emissive = new THREE.Color(snow ? 0x14161c : 0x1a1e28);
  L.instanced(g.stone, sm, list);
  L.instanced(g.bib, new THREE.MeshStandardMaterial({ color: 0x7a1a12, emissive: 0x140302, roughness: 0.95, side: THREE.DoubleSide }), list); /* faded cloth red, no glow */
}
/* hasa: rice drying racks [[x, z, ry], ...]: poles in crossed pairs, three rails, straw sheaves hung over the rails */
function buildHasa(ctx, L, list) {
  if (!list.length) return;
  const r = ctx.r; const wood = []; const straw = [];
  for (const [x, z, ry] of list) {
    const len = 5 + r() * 2.5; const y = ctx.H(x, z) - 0.1; const at = (g) => { g.rotateY(ry + Math.PI / 2); g.translate(x, y, z); return g; };
    for (let k = 0; k <= 3; k++) { const px = -len / 2 + k * len / 3; for (const sd of [-1, 1]) { const p = new THREE.CylinderGeometry(0.04, 0.05, 2.9, 5); p.translate(0, 1.45, 0); p.rotateX(sd * 0.16); p.translate(px, 0, 0); wood.push(at(p)); } }
    for (const hy of [0.9, 1.55, 2.2]) { const rail = new THREE.CylinderGeometry(0.03, 0.03, len + 0.4, 5); rail.rotateZ(Math.PI / 2); rail.translate(0, hy, 0); wood.push(at(rail));
      for (let s = -len / 2 + 0.2; s < len / 2 - 0.1; s += 0.26 + r() * 0.08) { if (r() < 0.12) continue; const sh = new THREE.ConeGeometry(0.13, 0.62, 5, 1, true); sh.translate(0, hy - 0.28, 0); sh.scale(1, 1, 0.55); sh.rotateY((r() - 0.5) * 0.3); sh.translate(s, 0, 0); straw.push(at(sh)); } }
    solidAlong(ctx, x, z, ry + Math.PI / 2, [[-len / 3], [0], [len / 3]], 0.75, 'hasa');
  }
  L.add(Object.assign(new THREE.Mesh(mergeClean(wood), woodMat(0x4a3e30)), { castShadow: true }));
  L.add(Object.assign(new THREE.Mesh(mergeClean(straw), strawMat(0xa08a5a)), { castShadow: true, receiveShadow: true }));
}
/* a plank footbridge over a flooded field: three planks on low posts, along the angle a from d0 to d1 */
function buildFootbridge(ctx, L, { a, d0, d1 }) {
  const r = ctx.r; const wood = []; const [x0, z0] = polar(a, d0); const [x1, z1] = polar(a, d1); const len = d1 - d0; const ry = Math.atan2(x1 - x0, z1 - z0);
  let top = -1e9; for (let k = 0; k <= 8; k++) { const x = lerp(x0, x1, k / 8); const z = lerp(z0, z1, k / 8); const sh = paddyShape(ctx, x, z, Math.hypot(x, z), Math.atan2(z, x)); top = Math.max(top, (sh.lvl ?? ctx.H(x, z)) + 0.28); }
  for (const o of [-0.3, 0, 0.3]) { const p = geoBox(0.28, 0.06, len * (0.98 + r() * 0.03), o, 0, 0); p.rotateZ((r() - 0.5) * 0.04); wood.push(p); }
  for (let s = -len / 2 + 0.3; s <= len / 2; s += len / 4) for (const o of [-0.4, 0.4]) { const p = geoBox(0.1, 1.2, 0.1, o, -0.6, s); wood.push(p); }
  const g = mergeClean(wood); g.rotateY(ry); g.translate((x0 + x1) / 2, top, (z0 + z1) / 2);
  L.add(Object.assign(new THREE.Mesh(g, woodMat(0x3a3028)), { castShadow: true, receiveShadow: true }));
  /* steps on the planks play 'plank'; anywhere else the land's own surface (null). The probe reads the fight's
     hero position; a later land without this bridge only answers for the 'paddies' land id */
  { const dx = x1 - x0; const dz = z1 - z0; const L2 = dx * dx + dz * dz || 1;
    setSfxSurfaceProbe((land) => { const p = window.__sq?.fight?.pos; if (land !== 'paddies' || !p) return null; const u = ((p.x - x0) * dx + (p.z - z0) * dz) / L2; if (u < -0.02 || u > 1.02) return null; const ex = x0 + dx * u - p.x; const ez = z0 + dz * u - p.z; return ex * ex + ez * ez < 0.7 * 0.7 ? 'plank' : null; }); }
}
/* nobori: tall narrow banners on L-poles along a line; the cloth flutters (bannerMaterial) */
function buildNobori(ctx, L, spots, { color = 0x1a1a24, mon = false, k = 1, ink = '#e8e2d2' } = {}) {
  if (!spots.length) return;
  const pole = new THREE.CylinderGeometry(0.035, 0.045, 5.2, 6); pole.translate(0, 2.6, 0);
  const arm = new THREE.CylinderGeometry(0.025, 0.025, 0.75, 5); arm.rotateZ(Math.PI / 2); arm.translate(0.37, 5.1, 0);
  const pg = mergeGeometries([pole, arm]); pole.dispose(); arm.dispose();
  const cloth = new THREE.PlaneGeometry(0.72, 3.4, 4, 12); cloth.translate(0.38, 3.36, 0);
  const wood = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.9 });
  const cm = bannerMaterial(mon ? 0xffffff : color);
  /* lands.js bannerMaterial replaces map_fragment, so the mon never showed (the cloth was plain white): sample the map in front of its own cloth code */
  if (mon) { cm.map = monTex('#' + new THREE.Color(color).getHexString(), ink); cm.map.colorSpace = THREE.SRGBColorSpace; const prev = cm.onBeforeCompile;
    cm.onBeforeCompile = (sh, rr) => { prev.call(cm, sh, rr); sh.fragmentShader = sh.fragmentShader.replace('vec2 bq = vBUv +', 'diffuseColor.rgb *= texture2D(map, vBUv).rgb; vec2 bq = vBUv +'); }; }
  const list = spots.map(([x, z, ry]) => ({ x, y: ctx.H(x, z) - 0.2, z, ry, s: k, sy: 1, tx: (ctx.r() - 0.5) * 0.08, tz: (ctx.r() - 0.5) * 0.08 }));
  L.instanced(pg, wood, list); L.current.winds.push(cm.userData.wind); L.instanced(cloth, cm, list);
}
/* an ishigaki stone base: dressed stones in courses on a concave face (musha-gaeshi), corner stones at the ends,
   along a polyline [[x, z], ...] facing `out` (+1 / -1 side). Height Hs; a plaster wall with a tiled cap on top (wall). */
function buildIshigaki(ctx, L, path, { Hs = 3.2, depth = 3.4, side = 1, wall = true, snow = 0, ruin = 0, wallH = 1.9, corners = true } = {}) {
  const r = ctx.r; const stones = []; const plaster = []; const cap = []; const posts = []; const lips = [];
  let total = 0; for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  /* the batter: the face leans back, steep at the top (musha-gaeshi); back(t) and its slope */
  const backAt = (t) => (1 - Math.pow(Math.max(0, 1 - t), 1.8)) * Hs * 0.42; const tiltAt = (t) => Math.atan(1.8 * Math.pow(Math.max(0, 1 - t), 0.8) * 0.42);
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]; const [bx, bz] = path[i]; const len = Math.hypot(bx - ax, bz - az); const ux = (bx - ax) / len; const uz = (bz - az) / len;
    const nx = -uz * side; const nz = ux * side; const gy = Math.min(ctx.H(ax, az), ctx.H(bx, bz)) - 0.3;
    const ry0 = Math.atan2(ux, uz) + Math.PI / 2;
    /* irregular courses: each course its own height, each stone its own width, height and sit; every stone is tilted to
       the batter, so the face is one sloped plane of stone (level courses stepped back read as stadium seats) */
    let y = 0; let k = 0;
    while (y < Hs - 0.05) {
      const ch = Math.min(Hs - y, 0.38 + r() * 0.42); const t = (y + ch / 2) / Hs; const back = backAt(t); const tilt = tiltAt(t);
      let s = (k % 2) * (0.3 + r() * 0.5); k++;
      while (s < len) {
        const w = Math.min(len - s, 0.45 + r() * r() * 1.4); if (w < 0.2) break; if (ruin && t > 0.6 && r() < ruin) { s += w; continue; }
        const big = r() < 0.12; const sh = ch * (big ? 1.35 : 0.82 + r() * 0.3);
        const cx = ax + ux * (s + w / 2) - nx * back; const cz = az + uz * (s + w / 2) - nz * back;
        const b = chunkGeo(r, { w: w * 0.94, h: sh, d: 0.75 + r() * 0.2, chip: 0.28, seg: 1 });
        b.translate(0, -sh * 0.5, 0); b.rotateX(side * tilt); b.translate(0, sh * 0.5, (r() - 0.5) * 0.06);
        b.rotateY(ry0); b.translate(cx, gy + y + (r() - 0.5) * 0.05, cz); stones.push(b); s += w;
      }
      y += ch;
    }
    /* sangi-zumi corners at the run's free ends: long dressed blocks laid alternately along and across the corner */
    if (corners) for (const [px, pz, dirS] of [[ax, az, 1], [bx, bz, -1]]) {
      if ((dirS > 0 && i !== 1) || (dirS < 0 && i !== path.length - 1)) continue;
      let yy = 0; let q = 0;
      while (yy < Hs - 0.1) { const hh = 0.5 + r() * 0.12; const t = (yy + hh / 2) / Hs; const back = backAt(t); const long = q % 2 === 0;
        const b = chunkGeo(r, { w: long ? 1.5 : 0.8, h: hh, d: long ? 0.8 : 1.4, chip: 0.12, seg: 1 }); b.translate(0, -hh / 2, 0); b.rotateX(side * tiltAt(t)); b.translate(0, hh / 2, 0);
        b.rotateY(ry0); b.translate(px + ux * dirS * (long ? 0.75 : 0.4) - nx * back, gy + yy, pz + uz * dirS * (long ? 0.75 : 0.4) - nz * back); stones.push(b); yy += hh; q++; }
    }
    /* cap stones: dressed blocks with chamfered, slightly tilted tops along the lip of the face, so the top edge catches the moon */
    if (!ruin) { const bt = backAt(1); let s2 = 0; while (s2 < len - 0.2) { const w = Math.min(len - s2, 0.8 + r() * 0.9); if (w < 0.3) break; const g = bevelBox(r, w - 0.05, 0.2, 1.0, 0.14, 0.035);
        g.rotateY(ry0); g.translate(ax + ux * (s2 + w / 2) - nx * (bt + 0.05), gy + Hs - 0.04, az + uz * (s2 + w / 2) - nz * (bt + 0.05)); lips.push(g); s2 += w; } }
    /* fill behind the face so the top is solid ground */
    const fill = geoBox(len + 1.6, Hs, depth, 0, 0, 0); /* +1.6: on an arc the outer corners of straight runs open wedge gaps; moonlight through them drew white stripes on the yard */ fill.rotateY(-Math.atan2(uz, ux)); fill.translate((ax + bx) / 2 - nx * (depth / 2 + Hs * 0.42), gy + Hs / 2, (az + bz) / 2 - nz * (depth / 2 + Hs * 0.42)); stones.push(fill);
    if (wall) {
      const top = gy + Hs; const ox = -nx * (Hs * 0.42 + 0.4); const oz = -nz * (Hs * 0.42 + 0.4); const ry = -Math.atan2(uz, ux); const WH = wallH;
      const pw = geoBox(len + 0.5, WH, 0.32, 0, 0, 0); pw.rotateY(ry); pw.translate((ax + bx) / 2 + ox, top + WH / 2, (az + bz) / 2 + oz); plaster.push(pw);
      /* the lower third in black boards (shitami-itabari), then white plaster in bays between timber posts; gun ports
 in an uneven rhythm so no two runs repeat */
      const base = geoBox(len + 0.5, WH * 0.4, 0.38, 0, 0, 0); base.rotateY(ry); base.translate((ax + bx) / 2 + ox, top + WH * 0.2, (az + bz) / 2 + oz); posts.push(base);
      const bays = Math.max(1, Math.round(len / (1.7 + r() * 0.6)));
      for (let q = 0; q <= bays; q++) {
        const t = q / bays - 0.5; const px = (ax + bx) / 2 + ox + ux * t * len; const pz = (az + bz) / 2 + oz + uz * t * len;
        const post = geoBox(0.14, WH, 0.37, 0, 0, 0); post.rotateY(ry); post.translate(px, top + WH / 2, pz); posts.push(post);
        if (q < bays && r() < 0.55) { const kind = Math.floor(r() * 3); const h = kind === 2 ? 0.3 : 0.24; const gp = kind === 0 ? new THREE.CylinderGeometry(0.13, 0.13, 0.36, 8) : kind === 1 ? new THREE.CylinderGeometry(0.17, 0.17, 0.36, 3) : geoBox(h, h, 0.36, 0, 0, 0);
          if (kind < 2) { gp.rotateX(Math.PI / 2); if (kind === 1) gp.rotateZ(Math.PI / 2 * 0); } gp.rotateY(ry); gp.translate(px + ux * len / bays / 2, top + WH * 0.7, pz + uz * len / bays / 2); posts.push(gp); }
      }
      /* the coping: a small tiled gable roof with a ridge, wider than the wall */
      const roof = new THREE.CylinderGeometry(0.62, 0.62, len + 0.7, 3, 1); roof.rotateZ(Math.PI / 2); roof.scale(1, 0.48, 1.25); roof.rotateY(ry); roof.translate((ax + bx) / 2 + ox, top + WH + 0.16, (az + bz) / 2 + oz); cap.push(roof);
      const ridge = geoBox(len + 0.7, 0.14, 0.16, 0, 0, 0); ridge.rotateY(ry); ridge.translate((ax + bx) / 2 + ox, top + WH + 0.47, (az + bz) / 2 + oz); posts.push(ridge);
    }
    for (let s = 0; s < len; s += 1.4) solid(ctx, ax + ux * s - nx * 1.2, az + uz * s - nz * 1.2, 1.5, 'wall');
  }
  if (stones.length) { const m = L.add(new THREE.Mesh(mergeClean(stones), stoneMat(0x9a968c, snow ? { cover: 0xd0d4dc, coverAmt: 1 } : { cover: 0x3a4630, coverAmt: 0.5 }))); m.castShadow = true; m.receiveShadow = true; }
  if (lips.length) { const m = new THREE.Mesh(mergeClean(lips), stoneMat(snow ? 0xd0d4dc : 0xd4d0c4, snow ? { cover: 0xe0e4ec, coverAmt: 1, tile: 1.4 } : { tile: 1.4, specMax: 0.8, rough: 0.8, desat: 0.4 })); m.material.emissive = new THREE.Color(snow ? 0x181c24 : 0x1c2230); m.castShadow = true; m.receiveShadow = true; L.add(m); }
  if (plaster.length) { const m = new THREE.Mesh(mergeClean(plaster), plasterMat()); m.castShadow = true; m.receiveShadow = true; L.add(m); }
  if (posts.length) { const m = new THREE.Mesh(mergeClean(posts), paintMat(0x221c18, { streak: 0.3 })); m.castShadow = true; L.add(m); }
  if (cap.length) { const m = new THREE.Mesh(mergeUV(cap), tileMat(0x6a6c76, snow)); m.castShadow = true; L.add(m); }
}
/* a chidori gable (a triangular dormer roof) with its ridge along +z: two tiled slopes and a white plaster face at the
   front, the eave at y = 0. Returns { roof, face } (roof has uv for the tile map). */
function gableGeo(w, h, d) {
  const hw = w / 2; const pos = []; const uv = [];
  for (const sx of [-1, 1]) {
    const q = [[0, h + 0.1, -d / 2], [0, h + 0.1, d / 2 + 0.35], [sx * hw, -0.05, d / 2 + 0.35], [sx * hw, -0.05, -d / 2]];
    const tri = sx < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of tri) { pos.push(...q[i]); uv.push(q[i][2] * 0.5, (1 - q[i][1] / (h + 0.1)) * 2.2); }
  }
  const roof = new THREE.BufferGeometry(); roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); roof.computeVertexNormals();
  const face = new THREE.BufferGeometry(); face.setAttribute('position', new THREE.Float32BufferAttribute([-hw * 0.86, 0.05, d / 2, hw * 0.86, 0.05, d / 2, 0, h * 0.92, d / 2], 3)); face.computeVertexNormals();
  return { roof, face };
}
/* the lord's keep (tenshu) on its stone base: a tall battered ishigaki platform with sangi-zumi corners, tiers that
   taper, short white walls under big dark roofs with deep curved eaves (the roofs carry the silhouette), black boards
   on the lower walls, small barred windows (few lit, warm, never a white panel), chidori gables, gold shachi on the top
   ridge and gold caps on every ridge end. `tiers` 2 makes a corner yagura. Seen from 30 m and from 200 m. */
function buildKeep(ctx, L, x, z, { S = 1, face = 0, lamp = 0xffa050, snow = 0, glowK = 1, tiers: nT = 5, baseH = 12, y = null } = {}) {
  const r = ctx.r; const holder = new THREE.Group(); holder.position.set(x, y ?? Math.min(0, ctx.H(x, z)) - 0.5, z); holder.rotation.y = face;
  const pl = []; const blk = []; const rf = []; const tr = []; const st = []; const gold = []; const win = []; const gf = [];
  /* the base: a stone platform with concave battered walls, and long corner blocks laid alternately */
  const bW = 30 * S; const bH = baseH * S; const steps = 16; const wAt = (t) => bW * (1 - 0.2 * (1 - Math.pow(1 - t, 1.7)));
  for (let k = 0; k < steps; k++) { const t0 = k / steps; const t1 = (k + 1) / steps;
    const g = new THREE.CylinderGeometry(wAt(t1) / Math.SQRT2, wAt(t0) / Math.SQRT2, bH / steps + 0.02, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, bH * (t0 + t1) / 2, 0); st.push(g); }
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) for (let k = 0; k < 9; k++) { const t = (k + 0.5) / 9; const w = wAt(t) / 2; const long = k % 2 === 0;
    const b = chunkGeo(r, { w: long ? 2.2 * S : 1.0 * S, h: bH / 9 * 0.94, d: long ? 1.0 * S : 2.2 * S, chip: 0.1, seg: 1 }); b.translate(cx * (w - (long ? 1.0 : 0.4) * S), bH * k / 9, cz * (w - (long ? 0.4 : 1.0) * S)); st.push(b); }
  let yy = bH;
  const TI = [[4.4, 1.0], [3.4, 0.82], [3.2, 0.68], [3.0, 0.56], [3.6, 0.46]].slice(0, nT);
  TI.forEach(([h, k], i) => {
    const last = i === TI.length - 1; const tw = bW * 0.66 * k; const td = bW * 0.52 * k; const hh = h * S;
    pl.push(geoBox(tw, hh, td, 0, yy + hh / 2, 0));
    blk.push(geoBox(tw + 0.08, hh * 0.4, td + 0.08, 0, yy + hh * 0.2, 0));
    /* small barred windows in the white band: a dark recess, a frame, four bars; one in six lit, dim and warm */
    for (const [axis, span] of [[0, tw], [1, td]]) {
      const nW = Math.max(1, Math.round(span / (3.6 * S)));
      for (let q = 0; q < nW; q++) { const o = (q - (nW - 1) / 2) * (span / nW); const lit = r() < 0.16 * glowK;
        for (const sd of [-1, 1]) { const half = (axis === 0 ? td : tw) / 2; const at = (dx, dy, dn, w, hgt, th) => (axis === 0 ? geoBox(w, hgt, th, o + dx, dy, sd * (half + dn)) : geoBox(th, hgt, w, sd * (half + dn), dy, o + dx));
          const wy = yy + hh * 0.62; (lit ? win : blk).push(at(0, wy, 0.03, 0.82 * S, 0.78 * S, 0.06));
          blk.push(at(0, wy + 0.46 * S, 0.07, 1.1 * S, 0.1 * S, 0.1), at(0, wy - 0.46 * S, 0.07, 1.1 * S, 0.1 * S, 0.1));
          for (const bx of [-0.3, -0.1, 0.1, 0.3]) blk.push(at(bx * S, wy, 0.08, 0.07 * S, 0.84 * S, 0.06)); } }
    }
    /* posts at the corners and a beam under the eaves */
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) blk.push(geoBox(0.3 * S, hh, 0.3 * S, sx * tw / 2, yy + hh / 2, sz * td / 2));
    for (const sz of [-1, 1]) blk.push(geoBox(tw + 0.1, 0.3 * S, 0.1, 0, yy + hh * 0.96, sz * (td / 2 + 0.05)));
    yy += hh;
    /* the roof: deep curved eaves (over), the corners lifted; the top one a tall irimoya */
    const rh = (last ? 4.4 : 2.4) * S;
    const roof = roofGeo(tw, td, rh, { over: (2.2 * k + 0.9) * S, curve: 0.65, gable: last ? 0.45 : 0.12, thick: 0.42 * S, lift: 1.3 * S });
    roof.roof.translate(0, yy, 0); roof.trim.translate(0, yy, 0); rf.push(roof.roof); tr.push(roof.trim);
    const hw = tw / 2 + (2.2 * k + 0.9) * S; const hd = td / 2 + (2.2 * k + 0.9) * S; const ridge = Math.max(0.4, hw - hd * (1 - (last ? 0.45 : 0.12)));
    /* gold caps on the ridge ends; gold shachi (a fish, tail up) on the top ridge */
    for (const sx of [-1, 1]) {
      if (last) { const body = new THREE.ConeGeometry(0.42 * S, 1.6 * S, 6); body.rotateZ(sx * 0.35); body.translate(sx * ridge, yy + rh + 0.9 * S, 0); gold.push(body);
        const tail = new THREE.ConeGeometry(0.5 * S, 0.7 * S, 4); tail.rotateZ(Math.PI + sx * 0.6); tail.translate(sx * (ridge - 0.55 * S), yy + rh + 1.75 * S, 0); tail.scale(1, 1, 0.4); gold.push(tail); }
      else gold.push(geoBox(0.5 * S, 0.5 * S, 0.5 * S, sx * ridge, yy + rh + 0.2 * S, 0));
    }
    /* chidori gables on the long faces of the second and fourth tiers */
    if (!last && (i === 1 || i === 3)) for (const sd of [-1, 1]) { const g = gableGeo(td * 0.55, 2.0 * S, 3.0 * S); const rot = sd > 0 ? 0 : Math.PI;
      g.roof.rotateY(rot); g.face.rotateY(rot); g.roof.translate(0, yy + rh * 0.42, sd * (td / 2 + 0.9 * S)); g.face.translate(0, yy + rh * 0.42, sd * (td / 2 + 0.9 * S)); rf.push(g.roof); gf.push(g.face);
      gold.push(geoBox(0.3 * S, 0.3 * S, 0.3 * S, 0, yy + rh * 0.42 + 2.05 * S, sd * (td / 2 + 0.9 * S + 1.7 * S))); }
    yy += last ? 0 : rh * 0.32;
  });
  const add = (g, m, sh = false) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = sh; mesh.receiveShadow = true; holder.add(mesh); L.current.owned.push(g, m); return mesh; };
  add(mergeClean(st), stoneMat(0x8a8680, { tile: 0.55, ...(snow ? { cover: 0xc8ccd6, coverAmt: 0.6 } : { cover: 0x3a4630, coverAmt: 0.3 }) }));
  add(mergeClean(pl), plasterMat(0xe6e0d2)); add(mergeClean(blk), paintMat(0x14110e, { streak: 0.25, wear: 0.12 }));
  if (gf.length) add(mergeClean(gf), new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.9, side: THREE.DoubleSide }));
  add(mergeUV(rf), tileMat(0x5a5c66, snow));
  add(mergeClean(tr), paintMat(0x16151a, { streak: 0.1 }));
  add(mergeClean(gold), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 1, roughness: 0.42, envMapIntensity: 0.7 }));
  if (win.length) { const wm = new THREE.Mesh(mergeClean(win), new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp).multiplyScalar(0.95) })); holder.add(wm); L.current.owned.push(wm.geometry, wm.material); }
  holder.userData.growY = 1; holder.scale.y = 0.0001; holder.userData.delay = 0.8; L.current.parts.push(holder); L.current.group.add(holder);
  holder.updateMatrixWorld(true);
  solid(ctx, x, z, bW * 0.71 + 1.5, 'keep'); /* the square base's corners sit at 0.707 x its width */
  return holder;
}
/* the wooden gate of the castle road (yaguramon-like, low): two posts, a tiled roof on a cross beam, no doors */
function buildGate(ctx, L, x, z, rot, { snow = 0, w = 4.8 } = {}) {
  const hw = w / 2;
  const holder = new THREE.Group(); holder.position.set(x, ctx.H(x, z) - 0.05, z); holder.rotation.y = rot;
  const wood = [];
  for (const sx of [-1, 1]) { wood.push(geoBox(0.5, 5.6, 0.5, sx * hw, 2.8, 0)); wood.push(geoBox(0.32, 4.2, 0.32, sx * hw, 2.1, -1.6)); wood.push(geoBox(0.24, 0.24, 1.7, sx * hw, 3.8, -0.8)); }
  wood.push(geoBox(w + 1.6, 0.5, 0.56, 0, 5.1, 0), geoBox(w + 0.8, 0.34, 0.4, 0, 4.2, 0));
  const roof = roofGeo(w + 1.6, 2.2, 1.7, { over: 0.9, curve: 0.45, gable: 0.0, thick: 0.25, lift: 0.35 });
  const add = (g, m) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; holder.add(mesh); L.current.owned.push(g, m); return mesh; };
  add(mergeClean(wood), woodMat(0x2e2620)); const rm = add(roof.roof, tileMat(0x8a8a92, snow)); rm.position.y = 5.4; const tm = add(roof.trim, paintMat(0x1a1818)); tm.position.y = 5.4;
  const iron = []; for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) iron.push(geoBox(0.54, 0.08, 0.54, sx * hw, 0.6 + k * 1.1, 0));
  add(mergeClean(iron), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.8, roughness: 0.5 }));
  holder.userData.growY = 1; holder.scale.y = 0.0001; L.current.parts.push(holder); L.current.group.add(holder);
  solidAlong(ctx, x, z, rot, [[-hw], [hw]], 0.5, 'gate');
  return holder;
}

/* the gatehouse (yaguramon): two heavy posts with iron bands, the doors swung open against the walls, and an upper
   storey across the top: white plaster over black boards, barred windows, a tiled irimoya roof with gold ridge caps */
function buildGatehouse(ctx, L, x, z, rot, { snow = 0, w = 7, lamp = 0xffa050 } = {}) {
  const hw = w / 2; const r = ctx.r;
  const holder = new THREE.Group(); holder.position.set(x, ctx.H(x, z) - 0.05, z); holder.rotation.y = rot;
  const wood = []; const pl = []; const blk = []; const iron = []; const gold = []; const win = []; const stone = [];
  for (const sx of [-1, 1]) {
    /* stone plinths under the heavy posts */
    stone.push(chunkGeo(r, { w: 1.5, h: 0.5, d: 1.5, chip: 0.12, seg: 1 }).translate(sx * hw, -0.18, 0), chunkGeo(r, { w: 1.1, h: 0.4, d: 1.1, chip: 0.12, seg: 1 }).translate(sx * hw, -0.18, -2.4));
    wood.push(geoBox(0.7, 4.6, 0.7, sx * hw, 2.3, 0), geoBox(0.4, 4.0, 0.4, sx * hw, 2.0, -2.4), geoBox(0.3, 0.3, 2.4, sx * hw, 3.6, -1.2));
    for (let k = 0; k < 4; k++) iron.push(geoBox(0.74, 0.1, 0.74, sx * hw, 0.5 + k * 1.1, 0));
    /* a door leaf swung open, flat against the inside of the wall line */
    const leaf = geoBox(0.16, 3.7, hw - 0.4, 0, 0, 0); leaf.translate(sx * (hw - 0.45), 1.95, -(hw - 0.4) / 2 - 0.4); wood.push(leaf);
    for (let k = 0; k < 4; k++) iron.push(geoBox(0.18, 0.08, hw - 0.5, sx * (hw - 0.45), 0.6 + k * 1.0, -(hw - 0.4) / 2 - 0.4));
  }
  wood.push(geoBox(w + 1.2, 0.55, 0.8, 0, 4.85, 0));
  /* the upper storey, wider than the gate, on its own floor beam */
  const UW = w + 4; const UD = 4.2; const UH = 2.8; const y0 = 5.1;
  wood.push(geoBox(UW + 0.3, 0.3, UD + 0.3, 0, y0 + 0.15, 0));
  pl.push(geoBox(UW, UH, UD, 0, y0 + 0.3 + UH / 2, 0)); blk.push(geoBox(UW + 0.06, UH * 0.42, UD + 0.06, 0, y0 + 0.3 + UH * 0.21, 0));
  for (let q = 0; q < 4; q++) { const ox = (q - 1.5) * UW / 4.4; for (const sd of [-1, 1]) { (q % 2 === 0 ? win : blk).push(geoBox(1.0, 0.7, 0.06, ox, y0 + 0.3 + UH * 0.66, sd * (UD / 2 + 0.03)));
    for (const bx of [-0.3, -0.1, 0.1, 0.3]) blk.push(geoBox(0.07, 0.76, 0.06, ox + bx, y0 + 0.3 + UH * 0.66, sd * (UD / 2 + 0.08))); } }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) blk.push(geoBox(0.26, UH, 0.26, sx * UW / 2, y0 + 0.3 + UH / 2, sz * UD / 2));
  /* bracket blocks (tokyo) stepping out under the eaves along both long faces, and a ring of rafter tails */
  for (let q = 0; q <= 14; q++) { const ox = (q / 14 - 0.5) * (UW + 1.4); for (const sd of [-1, 1]) { wood.push(geoBox(0.34, 0.26, 0.5, ox, y0 + 0.3 + UH - 0.08, sd * (UD / 2 + 0.25)), geoBox(0.2, 0.16, 0.9, ox, y0 + 0.3 + UH + 0.14, sd * (UD / 2 + 0.55))); } }
  const roof = roofGeo(UW, UD, 2.4, { over: 1.4, curve: 0.55, gable: 0.4, thick: 0.3, lift: 0.7 });
  const ry = y0 + 0.3 + UH; const hwR = UW / 2 + 1.4; const hdR = UD / 2 + 1.4; const ridge = Math.max(0.4, hwR - hdR * 0.6);
  for (const sx of [-1, 1]) gold.push(geoBox(0.35, 0.35, 0.35, sx * ridge, ry + 2.6, 0));
  const add = (g, m) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; holder.add(mesh); L.current.owned.push(g, m); return mesh; };
  add(mergeClean(stone), stoneMat(0x8a8680, snow ? { cover: 0xd0d4dc, coverAmt: 1 } : { cover: 0x3a4630, coverAmt: 0.3 }));
  if (win.length) { const wm = new THREE.Mesh(mergeClean(win), new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp).multiplyScalar(1.0) })); holder.add(wm); L.current.owned.push(wm.geometry, wm.material); }
  add(mergeClean(wood), woodMat(0x2e2620)); add(mergeClean(pl), plasterMat(0xe2dccc)); add(mergeClean(blk), paintMat(0x16120f, { streak: 0.25, wear: 0.15 }));
  add(mergeClean(iron), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.8, roughness: 0.5 }));
  add(mergeClean(gold), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 1, roughness: 0.42 }));
  const rm = add(roof.roof, tileMat(0x5a5c66, snow)); rm.position.y = ry; const tm = add(roof.trim, paintMat(0x16151a)); tm.position.y = ry;
  /* two paper lanterns hung in the passage, lit */
  { const lg = new THREE.SphereGeometry(0.3, 12, 10); lg.scale(0.85, 1.2, 0.85); const cords = []; const pos = []; for (const sx of [-1, 1]) { const g2 = lg.clone(); g2.translate(sx * 1.5, 3.55, 0); pos.push(g2); cords.push(geoBox(0.025, 0.7, 0.025, sx * 1.5, 4.2, 0)); }
    const lm = new THREE.Mesh(mergeClean(pos), new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp).multiplyScalar(1.7) })); holder.add(lm); L.current.owned.push(lm.geometry, lm.material); add(mergeClean(cords), paintMat(0x1a1410)); lg.dispose(); }
  holder.userData.growY = 1; holder.scale.y = 0.0001; L.current.parts.push(holder); L.current.group.add(holder); holder.updateMatrixWorld(true);
  { const gl = []; for (const sx of [-1, 1]) { const p = V(sx * 1.5, 3.55, 0).applyMatrix4(holder.matrixWorld); gl.push([p.x, p.y, p.z, 0.7], [p.x, p.y, p.z, 3.0]); } addGlows(L, gl, lamp, { alpha: 0.9 }); }
  solidAlong(ctx, x, z, rot, [[-hw], [hw]], 0.7, 'gate');
  return holder;
}
/* a five-storey pagoda (gojunoto) and a lit temple hall beside it, the focal point of the reverse views. Dark timber,
   tiled roofs whose eaves lift at the corners, red-lacquer bracket bands, a bronze sorin spire; dim lit doors; stone lanterns.
   S = scale (1 = about 32 m tall). Returns the lantern spots. */
function buildPagoda(ctx, L, x, z, rot, { S = 1, lamp = 0xffa050, snow = 0, hall = true } = {}) {
  const r = ctx.r; const y0 = ctx.H(x, z) - 0.3; const holder = new THREE.Group(); holder.position.set(x, y0, z); holder.rotation.y = rot;
  const st = []; const wd = []; const red = []; const rf = []; const tr = []; const br = []; const win = [];
  st.push(geoBox(13 * S, 1.2 * S, 13 * S, 0, 0.6 * S, 0), geoBox(11 * S, 0.5 * S, 11 * S, 0, 1.45 * S, 0));
  let yy = 1.7 * S;
  for (let i = 0; i < 5; i++) {
    const k = 1 - i * 0.1; const w = 7.2 * S * k; const h = (i ? 3.1 : 3.8) * S;
    wd.push(geoBox(w, h, w, 0, yy + h / 2, 0));
    red.push(geoBox(w + 0.5 * S, 0.45 * S, w + 0.5 * S, 0, yy + h - 0.25 * S, 0)); /* the bracket band under the eaves */
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) red.push(geoBox(0.4 * S, h, 0.4 * S, sx * w / 2, yy + h / 2, sz * w / 2));
    /* a lit door on two faces of the ground storey, dim slits above */
    if (i === 0) for (const sd of [-1, 1]) win.push(geoBox(2.0 * S, 2.4 * S, 0.1, 0, yy + 1.3 * S, sd * (w / 2 + 0.06)));
    else if (r() < 0.6) win.push(geoBox(1.2 * S, 0.5 * S, 0.1, 0, yy + h * 0.5, (r() < 0.5 ? 1 : -1) * (w / 2 + 0.06)));
    yy += h;
    const roof = roofGeo(w, w, 1.6 * S, { over: 2.6 * S * k + 0.6 * S, curve: 0.55, gable: 0.02, thick: 0.35 * S, lift: 1.1 * S });
    roof.roof.translate(0, yy - 0.4 * S, 0); roof.trim.translate(0, yy - 0.4 * S, 0); rf.push(roof.roof); tr.push(roof.trim);
    yy += 0.9 * S;
  }
  /* the sorin: a spire of nine bronze rings, a water flame and a jewel */
  br.push(geoBox(1.2 * S, 0.8 * S, 1.2 * S, 0, yy + 0.4 * S, 0));
  { const c = new THREE.CylinderGeometry(0.16 * S, 0.2 * S, 8.5 * S, 8); c.translate(0, yy + 4.6 * S, 0); br.push(c); }
  for (let q = 0; q < 9; q++) { const t = new THREE.TorusGeometry((0.62 - q * 0.03) * S, 0.09 * S, 4, 12); t.rotateX(Math.PI / 2); t.translate(0, yy + (1.6 + q * 0.62) * S, 0); br.push(t); }
  { const j = new THREE.SphereGeometry(0.4 * S, 10, 6); j.translate(0, yy + 9.1 * S, 0); br.push(j); }
  const add = (g, m, sh = false) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = sh; mesh.receiveShadow = true; holder.add(mesh); L.current.owned.push(g, m); return mesh; };
  add(mergeClean(st), stoneMat(0x8a8680, snow ? { cover: 0xc8ccd6, coverAmt: 0.7 } : {}));
  add(mergeClean(wd), woodMat(0x2a1e18)); add(mergeClean(red), paintMat(0x7a2218, { streak: 0.35, wear: 0.3 }));
  add(mergeUV(rf), tileMat(0x4a4c56, snow)); add(mergeClean(tr), paintMat(0x16151a, { streak: 0.1 }));
  add(mergeClean(br), new THREE.MeshStandardMaterial({ color: 0x6a5a3a, metalness: 0.9, roughness: 0.5, envMapIntensity: 0.6 }));
  add(mergeClean(win), new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp).multiplyScalar(1.6) }));
  /* the temple hall beside it: a long low hall, a deep irimoya roof, shoji lit along the front */
  if (hall) {
    const hw = []; const hwin = []; const hx = 16 * S;
    hw.push(geoBox(14 * S, 1.0 * S, 9 * S, hx, 0.5 * S, 0), geoBox(12 * S, 3.6 * S, 7 * S, hx, 2.8 * S, 0));
    for (let q = 0; q < 5; q++) hwin.push(geoBox(1.8 * S, 2.2 * S, 0.1, hx + (q - 2) * 2.3 * S, 2.6 * S, 3.56 * S));
    add(mergeClean(hw), woodMat(0x2e221a));
    add(mergeClean(hwin), new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp).multiplyScalar(1.25) }));
    const hr = roofGeo(12 * S, 7 * S, 3.6 * S, { over: 1.8 * S, curve: 0.5, gable: 0.4, thick: 0.3 * S, lift: 0.7 * S });
    hr.roof.translate(hx, 4.6 * S, 0); hr.trim.translate(hx, 4.6 * S, 0); add(hr.roof, tileMat(0x4a4c56, snow)); add(hr.trim, paintMat(0x16151a, { streak: 0.1 }));
  }
  holder.userData.growY = 1; holder.scale.y = 0.0001; holder.userData.delay = 0.6; L.current.parts.push(holder); L.current.group.add(holder); holder.updateMatrixWorld(true);
  solid(ctx, x, z, 7 * S, 'pagoda');
  /* warm light: the doors, the hall front, a ring of lanterns round the platform */
  const gl = []; for (const sd of [-1, 1]) { const p = V(0, 3.0 * S, sd * 4.4 * S).applyMatrix4(holder.matrixWorld); gl.push([p.x, p.y, p.z, 2.4 * S], [p.x, p.y, p.z, 7 * S]); }
  if (hall) for (let q = 0; q < 5; q++) { const p = V(16 * S + (q - 2) * 2.3 * S, 2.6 * S, 4.2 * S).applyMatrix4(holder.matrixWorld); gl.push([p.x, p.y, p.z, 3.2 * S]); }
  addGlows(L, gl, lamp, { alpha: 0.85 });
  const lan = []; for (const [lx, lz] of [[-7.5, 7.5], [7.5, 7.5], [-7.5, -7.5], [7.5, -7.5], [10, 6.5], [22, 6.5]]) { const p = V(lx * S, 0, lz * S).applyMatrix4(holder.matrixWorld); lan.push({ x: p.x, z: p.z, s: 1.3 * S, lit: true }); }
  return lan;
}
/* a lower town below the bailey: rows of small houses (dark board walls, tiled roofs), some windows lit */
function buildTown(ctx, L, spots, { lamp = 0xffa050, snow = 0 } = {}) {
  if (!spots.length) return;
  const r = ctx.r; const walls = []; const roofs = []; const trims = []; const glows = [];
  for (const { x, z, ry, w, d } of spots) {
    const y = ctx.H(x, z) - 0.1; const h = 2.4 + r() * 0.8;
    const b = geoBox(w, h, d, 0, h / 2, 0); b.rotateY(ry); b.translate(x, y, z); walls.push(b);
    const rf = roofGeo(w, d, 1.5 + r() * 0.5, { over: 0.7, curve: 0.25, gable: 0.3, thick: 0.14, lift: 0.12 });
    rf.roof.rotateY(ry); rf.roof.translate(x, y + h, z); roofs.push(rf.roof); rf.trim.rotateY(ry); rf.trim.translate(x, y + h, z); trims.push(rf.trim);
    if (r() < 0.45) { const s = Math.sin(ry); const c = Math.cos(ry); glows.push([x + s * (d / 2 + 0.3), y + 1.3, z + c * (d / 2 + 0.3), 1.6]); }
  }
  const wm = new THREE.Mesh(mergeClean(walls), woodMat(0x2a221c)); wm.receiveShadow = true; L.add(wm);
  L.add(new THREE.Mesh(mergeUV(roofs), tileMat(0x5a5c66, snow))); L.add(new THREE.Mesh(mergeClean(trims), paintMat(0x16151a)));
  if (glows.length) addGlows(L, glows, lamp, { alpha: 0.55 });
}
/* a bell tower (shoro): a stone plinth, four splayed posts, a tiled roof, a bronze bell on a beam and its striker log */
function buildBell(ctx, L, x, z, rot, { snow = 0 } = {}) {
  const holder = new THREE.Group(); holder.name = 'edo-bell'; holder.position.set(x, ctx.H(x, z) - 0.05, z); holder.rotation.y = rot;
  const stone = [geoBox(3.2, 0.5, 3.2, 0, 0.25, 0), geoBox(2.8, 0.2, 2.8, 0, 0.6, 0)]; const wood = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.CylinderGeometry(0.11, 0.14, 3.4, 8); p.rotateZ(-sx * 0.05); p.rotateX(sz * 0.05); p.translate(sx * 1.1, 0.7 + 1.7, sz * 1.1); wood.push(p); }
  for (const sz of [-1, 1]) wood.push(geoBox(2.6, 0.18, 0.18, 0, 3.6, sz * 1.1)); wood.push(geoBox(0.2, 0.2, 2.5, 0, 3.55, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const tb = geoBox(0.14, 0.14, 2.4, sx * 1.1, 1.3, 0); if (sz < 0) wood.push(tb); }
  /* a bonsho. A straight bronze cylinder with a rounded shoulder and
     a thin lip, the kesa-dasuki bands (three rings and four uprights), a grid of chi bosses in the upper panels, two lotus
     striking seats (tsukiza) facing the log, a ryuzu loop on the crown; the striker log hangs from the beam on two ropes */
  const BB = 3.37 - 1.26; /* the bell's lip height (its crown at 3.37, under the beam) */
  const log = new THREE.CylinderGeometry(0.12, 0.12, 1.5, 10); log.rotateZ(Math.PI / 2); log.translate(-1.3, BB + 0.34, 0); wood.push(log);
  for (const rx of [-1.75, -0.85]) { const rp = new THREE.CylinderGeometry(0.018, 0.018, 3.5 - (BB + 0.34), 4); rp.translate(rx, (3.5 + BB + 0.34) / 2, 0); wood.push(rp); }
  const bell = new THREE.LatheGeometry([[0.001, 0], [0.345, 0], [0.37, 0.015], [0.372, 0.075], [0.358, 0.095], [0.352, 0.6], [0.348, 1.02], [0.335, 1.12], [0.29, 1.2], [0.18, 1.25], [0.001, 1.26]].map(([a, b]) => new THREE.Vector2(a, b)), 24);
  const bands = [bell];
  for (const yb of [0.12, 0.56, 1.0]) { const t = new THREE.TorusGeometry(0.356, 0.016, 4, 28); t.rotateX(Math.PI / 2); t.translate(0, yb, 0); bands.push(t); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const u = new THREE.BoxGeometry(0.035, 0.88, 0.03); u.translate(0, 0.56, 0.355); u.rotateY(a); bands.push(u); }
  for (let k = 0; k < 4; k++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const a = k * Math.PI / 2 + (c - 1) * 0.3; const b = new THREE.SphereGeometry(0.022, 6, 4); b.scale(1, 1, 0.7); b.translate(0, 0.66 + r * 0.11, 0.356); b.rotateY(a); bands.push(b); }
  for (const sx of [-1, 1]) { const ts = new THREE.CylinderGeometry(0.085, 0.095, 0.03, 16); ts.rotateZ(Math.PI / 2); ts.translate(sx * 0.36, 0.34, 0); bands.push(ts);
    const tr = new THREE.TorusGeometry(0.09, 0.012, 4, 16); tr.rotateY(Math.PI / 2); tr.translate(sx * 0.372, 0.34, 0); bands.push(tr); }
  const ry = new THREE.TorusGeometry(0.1, 0.035, 6, 12, Math.PI); ry.translate(0, 1.25, 0); bands.push(ry);
  for (const b of bands) b.translate(0, BB, 0);
  const roof = roofGeo(2.4, 2.4, 1.5, { over: 0.9, curve: 0.5, gable: 0.4, thick: 0.18, lift: 0.4 });
  const add = (g, m) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; holder.add(mesh); L.current.owned.push(g, m); return mesh; };
  add(mergeClean(stone), stoneMat(0x8a8680, snow ? { cover: 0xd0d4dc, coverAmt: 1 } : {})); add(mergeClean(wood), woodMat(0x3a2e24));
  add(mergeClean(bands), new THREE.MeshStandardMaterial({ color: 0x3a3a2c, metalness: 0.75, roughness: 0.55 })); /* dark bronze with a green patina */
  const rm = add(roof.roof, tileMat(0x5a5c66, snow)); rm.position.y = 3.75; const tm = add(roof.trim, paintMat(0x16151a)); tm.position.y = 3.75;
  holder.userData.growY = 1; holder.scale.y = 0.0001; L.current.parts.push(holder); L.current.group.add(holder);
  solid(ctx, x, z, 2.3, 'bell');
}
/* raked gravel: pale warm stones
   with dark grooves, laid as a flat sheet over the packed earth */
const gravelTex = () => canvasTex('edo-gravel', 512, 512, (g, w, h) => {
  g.fillStyle = '#948c7c'; g.fillRect(0, 0, w, h); const r = rng(41);
  for (let i = 0; i < 34000; i++) { const c = 120 + r() * 120; g.fillStyle = `rgba(${c},${c - 8},${c - 24},${0.3 + r() * 0.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
  for (let y = 0; y < h; y += 32) {
    const ph = r() * TAU; const wob = (x) => Math.sin(x / w * TAU * 2 + ph) * 2.2 + Math.sin(x / w * TAU * 5 + ph * 2) * 0.9;
    for (let x = 0; x < w; x += 4) { const o = wob(x);
      g.fillStyle = 'rgba(22,18,14,0.6)'; g.fillRect(x, y + o, 4, 7); g.fillStyle = 'rgba(40,32,24,0.3)'; g.fillRect(x, y + o + 7, 4, 3);
      g.fillStyle = 'rgba(236,228,208,0.22)'; g.fillRect(x, y + o + 14, 4, 6); }
  }
});
function buildGravel(ctx, L, cx, cz, rot, w, d, { snow = 0 } = {}) {
  const t = gravelTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.PlaneGeometry(w, d, Math.ceil(w), Math.ceil(d)); { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * d / 3); } g.rotateX(-Math.PI / 2); g.rotateY(rot); g.translate(cx, 0, cz);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, ctx.H(p.getX(i), p.getZ(i)) + 0.035); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.1, color: snow ? 0xc8ccd4 : 0xa89f8c, roughness: 0.9, metalness: 0, envMapIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.receiveShadow = true; L.add(m, { grow: false });
}
/* a stone-lined drain (a gutter of flat stones either side of a dark channel) along a line */
function buildDrain(ctx, L, ax, az, bx, bz, { snow = 0 } = {}) {
  const r = ctx.r; const len = Math.hypot(bx - ax, bz - az); const ux = (bx - ax) / len; const uz = (bz - az) / len; const ry = Math.atan2(ux, uz) + Math.PI / 2; const st = []; const ch = [];
  for (const o of [-0.32, 0.32]) for (let s = 0; s < len; ) { const w = 0.35 + r() * 0.4; const b = chunkGeo(r, { w: w * 0.92, h: 0.12, d: 0.3, chip: 0.25, seg: 1 }); b.rotateY(ry); const x = ax + ux * (s + w / 2) - uz * o; const z = az + uz * (s + w / 2) + ux * o; b.translate(x, ctx.H(x, z) - 0.04, z); st.push(b); s += w; }
  const c = geoBox(len, 0.02, 0.32, 0, 0, 0); c.rotateY(-Math.atan2(uz, ux)); c.translate((ax + bx) / 2, ctx.H((ax + bx) / 2, (az + bz) / 2) + 0.005, (az + bz) / 2); ch.push(c);
  L.add(Object.assign(new THREE.Mesh(mergeClean(st), stoneMat(0x8a8680, snow ? { cover: 0xd0d4dc, coverAmt: 1 } : {})), { receiveShadow: true }), { grow: false });
  L.add(new THREE.Mesh(mergeClean(ch), new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 0.3, metalness: 0.2 })), { grow: false });
}
/* the lord's mon on a banner: a white ring with three tomoe (commas) on dark cloth, near the top */
const monTex = (ground = '#15151c', ink = '#e8e2d2') => canvasTex(`edo-mon-${ground}-${ink}`, 64, 256, (g, w, h) => {
  g.fillStyle = ground; g.fillRect(0, 0, w, h); g.fillStyle = ink; g.strokeStyle = ink;
  const cx = w / 2; const cy = 46; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 22, 0, TAU); g.stroke();
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3 - Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, 6.5, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx, cy, 13, a + 0.2, a + 1.6); g.lineWidth = 4; g.stroke(); }
  g.fillRect(0, 0, w, 5); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 90; y < h; y += 40) g.fillRect(0, y, w, 1);
});
/* ======================================================================== castle road dressing */
/* a box with a chamfered, slightly tilted top: the sloped faces catch the moon (cap stones, flagstones, kerbs). Base at y = 0. */
function bevelBox(r, w, h, d, bev = 0.06, tilt = 0.02) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1); const p = g.attributes.position; const tx = (r() - 0.5) * tilt; const tz = (r() - 0.5) * tilt;
  for (let i = 0; i < p.count; i++) { let x = p.getX(i); let y = p.getY(i); let z = p.getZ(i);
    if (y > 0) { x *= Math.max(0.2, 1 - bev * 2 / w); z *= Math.max(0.2, 1 - bev * 2 / d); y += x * tx + z * tz; }
    p.setXYZ(i, x, y, z); }
  g.translate(0, h / 2, 0); g.computeVertexNormals(); return g;
}
/* a straight rod between two points */
function rodGeo(a, b, r0, r1 = r0, seg = 5) {
  const dir = V().subVectors(b, a); const len = dir.length(); const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize())); const m = V().addVectors(a, b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); return g;
}
/* the dressed-stone road (ishidatami) through the bailey and the gate: irregular flagstones in courses on a dark joint bed, big kerb
   stones either side. Visual only (0.07 m high), so it may lie inside the 16 m fight floor. */
function buildFlagRoad(ctx, L, f, { snow = 0 } = {}) {
  const r = ctx.r; const HW = 3.05; const a0 = -BY_O + 0.5; const a1 = BY_A + 9; const ry = -NEMESIS_ANG;
  const groups = [[], [], []]; const kerb = [];
  const put = (g, a, s, y0 = 0, dy = 0) => { const [x, z] = f.P(a, s); g.rotateY(ry); g.translate(x, ctx.H(x, z) + y0 + dy, z); return g; };
  /* the joint bed: a dark plane under the stones */
  { const len = a1 - a0; const g = new THREE.PlaneGeometry(len, HW * 2 + 0.3, Math.ceil(len / 2), 2); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
    const c = f.P((a0 + a1) / 2, 0); g.rotateY(ry); g.translate(c[0], 0, c[1]); const q = g.attributes.position; for (let i = 0; i < q.count; i++) q.setY(i, ctx.H(q.getX(i), q.getZ(i)) + 0.015);
    g.computeVertexNormals(); L.add(Object.assign(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: snow ? 0x8a8e98 : 0x0e0c0a, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })), { receiveShadow: true }), { grow: false }); }
  /* courses across the road: each its own width, each stone its own length and tone */
  let s = -HW; let row = 0;
  while (s < HW - 0.2) {
    const rw = Math.min(HW - s, 0.5 + r() * 0.5); if (rw < 0.3) break; let a = a0 - r() * 0.8;
    while (a < a1) {
      const len = 0.5 + r() * r() * 0.9 + 0.15; const jw = 0.045; const w = Math.max(0.3, len - jw); const d = Math.max(0.28, rw - jw); const h = 0.075 + r() * 0.03;
      const g = bevelBox(r, w, h, d, 0.035, 0.03); put(g, a + len / 2, s + rw / 2 + (r() - 0.5) * 0.02, -0.03, 0); groups[r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2].push(g); a += len;
    }
    s += rw; row++;
  }
  /* the kerb: long dressed blocks, a little proud of the paving */
  for (const sd of [-1, 1]) for (let a = a0; a < a1; ) { const w = 0.9 + r() * 0.9; const g = bevelBox(r, w - 0.04, 0.2 + r() * 0.05, 0.42, 0.05, 0.03); put(g, a + w / 2, sd * (HW + 0.3), -0.06); kerb.push(g); a += w; }
  const tones = snow ? [0xb8bcc4, 0xa8acb6, 0xc4c8d0] : [0x8e8a82, 0x7c7e84, 0x9a948a];
  groups.forEach((gs, i) => { if (!gs.length) return; const m = new THREE.Mesh(mergeClean(gs), stoneMat(tones[i], snow ? { cover: 0xd0d4dc, coverAmt: 0.8, tile: 1.6 } : { tile: 1.6, specMax: 0.5 })); m.receiveShadow = true; L.add(m, { grow: false }); });
  { const m = new THREE.Mesh(mergeClean(kerb), stoneMat(snow ? 0xc0c4cc : 0x6e6c68, snow ? { cover: 0xd0d4dc, coverAmt: 1 } : { tile: 1.4 })); m.receiveShadow = true; m.castShadow = true; L.add(m, { grow: false }); }
}
/* kagaribi: an iron fire basket on a tripod with burning logs. geometry: iron (basket, legs), embers (logs, lit) */
function kagaribiGeo() {
  const iron = []; const logs = []; const H0 = 0.95;
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.4; iron.push(rodGeo(V(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38), V(Math.cos(a) * 0.17, H0, Math.sin(a) * 0.17), 0.034, 0.027, 6)); }
  const ring = (R, y, rr) => { const t = new THREE.TorusGeometry(R, rr, 5, 16); t.rotateX(Math.PI / 2); t.translate(0, y, 0); iron.push(t); };
  ring(0.27, 0.46, 0.015);
  const bot = 0.17; const top = 0.37; const y0 = 0.98; const y1 = 1.5;
  for (let k = 0; k < 11; k++) { const a = k / 11 * TAU; iron.push(rodGeo(V(Math.cos(a) * bot, y0, Math.sin(a) * bot), V(Math.cos(a) * top, y1, Math.sin(a) * top), 0.015, 0.015, 4)); }
  ring(top, y1, 0.022); ring((bot + top) / 2, (y0 + y1) / 2, 0.015); ring(bot, y0, 0.018);
  const plate = new THREE.CylinderGeometry(bot, bot * 0.75, 0.05, 10); plate.translate(0, y0 - 0.02, 0); iron.push(plate);
  for (let k = 0; k < 6; k++) { const l = new THREE.CylinderGeometry(0.055, 0.048, 0.5, 5); l.rotateZ(Math.PI / 2 + (k % 2 ? 0.45 : -0.35)); l.rotateY(k * 1.05); l.translate(0, y0 + 0.1 + (k % 3) * 0.08, 0); logs.push(l); }
  return { iron: mergeClean(iron), logs: mergeClean(logs), flameY: y0 + 0.2, glowY: y0 + 0.75 };
}
/* live flame: camera-facing (about Y) tongues with a flicker, and a warm pool of light on the ground, both additive */
const FLAME_VERT = `attribute vec4 aP; uniform float uTime; varying vec2 vUv; varying float vPh;
void main(){ vUv = uv; vPh = fract(aP.x * 0.173 + aP.z * 0.291 + aP.w) * 6.2831;
  float s = aP.w * (1.0 + 0.11 * sin(uTime * 9.0 + vPh) + 0.07 * sin(uTime * 23.0 + vPh * 2.0));
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  vec3 w = aP.xyz + right * position.x * s * 0.62 + vec3(0.0, position.y * s, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`;
const FLAME_FRAG = `uniform float uTime; uniform float uA; varying vec2 vUv; varying float vPh;
void main(){ float h = vUv.y; float px = vUv.x - 0.5;
  float w = (0.5 - h * 0.44) * (0.86 + 0.14 * sin(uTime * 11.0 + vPh + h * 6.0));
  float sway = 0.09 * sin(uTime * 6.5 + vPh * 3.0 + h * 5.0) * h;
  float d = abs(px - sway) / max(w, 0.03);
  float body = smoothstep(1.0, 0.2, d) * smoothstep(1.0, 0.62, h) * smoothstep(0.0, 0.05, h);
  float tongue = 0.72 + 0.28 * sin(h * 17.0 - uTime * 13.0 + vPh + px * 9.0);
  vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.72, 0.28), smoothstep(0.7, 0.05, h) * smoothstep(1.0, 0.1, d));
  col = mix(col, vec3(1.0, 0.95, 0.72), smoothstep(0.32, 0.0, h) * smoothstep(0.55, 0.0, d));
  gl_FragColor = vec4(col * 1.5, body * tongue * uA); }`;
const POOL_VERT = `attribute vec4 aP; uniform float uTime; varying vec2 vUv; varying float vF;
void main(){ vUv = uv; vF = 0.82 + 0.11 * sin(uTime * 9.0 + aP.x * 1.7) + 0.07 * sin(uTime * 21.0 + aP.z * 2.3);
  gl_Position = projectionMatrix * viewMatrix * vec4(aP.x + position.x * aP.w, aP.y, aP.z + position.z * aP.w, 1.0); }`;
const POOL_FRAG = `uniform float uA; uniform vec3 uCol; varying vec2 vUv; varying float vF;
void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.4) * 0.6 * vF * uA; gl_FragColor = vec4(uCol, a); }`;
function buildFire(ctx, L, spots, { lamp = 0xff8a3a } = {}) {
  if (!spots.length) return; const r = ctx.r; const g = kagaribiGeo();
  const inst = spots.map(([x, z]) => ({ x, y: ctx.H(x, z) - 0.03, z, ry: r() * TAU, s: 1, sy: 1 }));
  L.instanced(g.iron, new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.55, metalness: 0.75, envMapIntensity: 0.3 }), inst);
  L.instanced(g.logs, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1c).multiplyScalar(1.5) }), inst, { shadow: false });
  const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
  const fl = []; for (const it of inst) for (let k = 0; k < 4; k++) fl.push(it.x + (r() - 0.5) * 0.22, it.y + g.flameY + k * 0.03, it.z + (r() - 0.5) * 0.22, 1.2 + r() * 0.6 - k * 0.15);
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(fl), 4)); geo.instanceCount = fl.length / 4;
  const FU = { uTime: { value: 0 }, uA: { value: 0 } };
  const fm = new THREE.ShaderMaterial({ vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: FU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flame = new THREE.Mesh(geo, fm); flame.frustumCulled = false; flame.renderOrder = 5; L.current.group.add(flame); L.current.owned.push(geo, fm, base);
  const pb = new THREE.PlaneGeometry(1, 1); pb.rotateX(-Math.PI / 2); const pg = new THREE.InstancedBufferGeometry(); pg.index = pb.index; pg.attributes.position = pb.attributes.position; pg.attributes.uv = pb.attributes.uv;
  pg.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(inst.flatMap((it) => [it.x, it.y + 0.12, it.z, 7.5])), 4)); pg.instanceCount = inst.length;
  const PU = { uTime: FU.uTime, uA: { value: 0 }, uCol: { value: new THREE.Color(lamp) } };
  const pm = new THREE.ShaderMaterial({ vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, uniforms: PU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pool = new THREE.Mesh(pg, pm); pool.frustumCulled = false; pool.renderOrder = 4; L.current.group.add(pool); L.current.owned.push(pg, pm, pb);
  const gl = addGlows(L, inst.flatMap((it) => [[it.x, it.y + g.glowY, it.z, 0.8], [it.x, it.y + g.glowY, it.z, 3.4]]), lamp, { alpha: 1.0 });
  const land = L.current; L.current.tickers.push((t) => { FU.uTime.value = t; const k = Math.min(1, land.t / 2); FU.uA.value = k; PU.uA.value = k; if (gl) gl.material.uniforms.uA.value *= 0.86 + 0.08 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7); });
  for (const it of inst) solid(ctx, it.x, it.z, 0.5, 'brazier');
}
/* wooden standing shields (tate) leaning on struts, a hand cart with rice bales, buckets: the clutter along the stone face. All outside the 16 m floor. */
function buildWallClutter(ctx, L, f, { snow = 0 } = {}) {
  const r = ctx.r; const wood = []; const dark = []; const straw = []; const rope = []; const mons = [];
  const at = (g, x, z, ry, y = 0) => { g.rotateY(ry); g.translate(x, ctx.H(x, z) + y, z); return g; };
  const ry0 = -NEMESIS_ANG; /* local x along the road, local z across it (toward the honmaru wall = +s) */
  const bale = (cx, cy, cz, x, z, ry, rot = 0) => { const g = new THREE.LatheGeometry([[0.001, -0.42], [0.2, -0.41], [0.3, -0.3], [0.33, 0], [0.3, 0.3], [0.2, 0.41], [0.001, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 12); g.rotateZ(Math.PI / 2); g.rotateY(rot); g.translate(cx, cy, cz); straw.push(at(g, x, z, ry));
    for (const bx of [-0.2, 0.2]) { const b = new THREE.TorusGeometry(0.325, 0.02, 4, 12); b.rotateY(Math.PI / 2); b.rotateY(rot); b.translate(cx + Math.cos(rot) * bx, cy, cz - Math.sin(rot) * bx); rope.push(at(b, x, z, ry)); } };
  /* 1. a rank of tate: boards on rear struts, a mon on each, leaning on the wall's foot */
  { const [x, z] = f.P(-9.5, BY_S - 2.4); const n = 6;
    for (let i = 0; i < n; i++) { const lx = (i - (n - 1) / 2) * 0.72; const lean = 0.16 + (r() - 0.5) * 0.06;
      const px = x + Math.cos(ry0) * lx; const pz = z - Math.sin(ry0) * lx; const yy = ry0 + (r() - 0.5) * 0.12;
      const bd = geoBox(0.6, 1.5, 0.05, 0, 0.78, 0); bd.rotateX(lean); wood.push(at(bd, px, pz, yy));
      wood.push(at(rodGeo(V(0, 1.05, 0.08), V(0, 0, 0.62), 0.028, 0.028, 4), px, pz, yy));
      const cap = geoBox(0.66, 0.06, 0.09, 0, 1.53, 0); cap.rotateX(lean); dark.push(at(cap, px, pz, yy));
      const mon = new THREE.PlaneGeometry(0.5, 1.25); mon.rotateY(Math.PI); mon.translate(0, 0.78, -0.032); mon.rotateX(lean); mons.push(at(mon, px, pz, yy)); }
    solidAlong(ctx, x, z, ry0, [[-1.8], [0], [1.8]], 1.3, 'tate'); }
  /* 2. a hand cart loaded with bales, handles toward the gate */
  { const [x, z] = f.P(7.5, BY_S - 2.6); const ry = ry0 + 0.1;
    const bed = geoBox(2.0, 0.1, 1.1, 0, 0.62, 0); wood.push(at(bed, x, z, ry));
    for (const sz of [-0.52, 0.52]) { const rl = geoBox(2.0, 0.28, 0.06, 0, 0.78, sz); wood.push(at(rl, x, z, ry)); const hd = geoBox(1.9, 0.07, 0.07, 1.9, 0.6, sz * 0.8); wood.push(at(hd, x, z, ry)); }
    for (const sz of [-0.66, 0.66]) { const wh = new THREE.TorusGeometry(0.55, 0.045, 5, 20); wh.translate(-0.1, 0.57, sz); dark.push(at(wh, x, z, ry)); const hub = new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8); hub.rotateX(Math.PI / 2); hub.translate(-0.1, 0.57, sz); dark.push(at(hub, x, z, ry));
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; wood.push(at(rodGeo(V(-0.1, 0.57, sz), V(-0.1 + Math.sin(a) * 0.52, 0.57 + Math.cos(a) * 0.52, sz), 0.022, 0.022, 4), x, z, ry)); } }
    for (let k = 0; k < 3; k++) bale(-0.55 + k * 0.62, 1.04, 0, x, z, ry, 0.0); bale(-0.25, 1.62, 0, x, z, ry, 0.0);
    solidAlong(ctx, x, z, ry, [[-0.6], [0.3], [1.4]], 1.1, 'cart'); }
  /* 3. buckets (oke) with rope handles and a ladle, near the cart */
  { const [x, z] = f.P(3.2, BY_S - 2.2); for (let i = 0; i < 3; i++) { const ox = x + (i - 1) * 0.55 + (r() - 0.5) * 0.15; const oz = z + (r() - 0.5) * 0.4;
      const bk = new THREE.CylinderGeometry(0.2, 0.17, 0.34, 10); bk.translate(0, 0.17, 0); wood.push(at(bk, ox, oz, 0));
      for (const yb of [0.08, 0.26]) { const rg = new THREE.TorusGeometry(0.2 - (0.34 - yb) * 0.05, 0.012, 4, 12); rg.rotateX(Math.PI / 2); rg.translate(0, yb, 0); dark.push(at(rg, ox, oz, 0)); }
      const hd = new THREE.TorusGeometry(0.19, 0.012, 4, 10, Math.PI); hd.rotateZ(0); hd.translate(0, 0.34, 0); rope.push(at(hd, ox, oz, r() * 3)); }
    solid(ctx, x, z, 1.0, 'buckets'); }
  /* 4. a stack of bales against the wall further along */
  { const [x, z] = f.P(-17.5, BY_S - 2.3); const ry = ry0 + 0.05;
    for (let row = 0; row < 3; row++) for (let k = 0; k < 3 - row; k++) bale((k - (2 - row) / 2) * 0.68, 0.33 + row * 0.58, 0, x, z, ry, 0);
    solid(ctx, x, z, 1.4, 'bales'); }
  if (wood.length) L.add(Object.assign(new THREE.Mesh(mergeClean(wood), woodMat(0x7a6648)), { castShadow: true, receiveShadow: true }));
  if (dark.length) L.add(Object.assign(new THREE.Mesh(mergeClean(dark), paintMat(0x2a231c, { rough: 0.5 })), { castShadow: true }));
  if (straw.length) L.add(Object.assign(new THREE.Mesh(mergeClean(straw), paintMat(snow ? 0x9a9488 : 0x8a7448, { rough: 0.95, streak: 0.5, wear: 0.4 })), { castShadow: true, receiveShadow: true }));
  if (rope.length) L.add(new THREE.Mesh(mergeClean(rope), paintMat(0x2a2016, { rough: 0.9 })));
  if (mons.length) { const t = monTex('#7a6648', '#1a1612'); t.colorSpace = THREE.SRGBColorSpace; L.add(new THREE.Mesh(mergeUV(mons), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.1 }))); }
}

/* ======================================================================== the lands */
const moonSky = (o = {}) => ({ sunDir: [-0.42, 0.3, -1], sunCol: 0xefe6d4, sunGlow: 0.35, sunSize: 0.022, stars: 0.9, clouds: 0.35, cloudCol: 0x0a0e1a, cloudLit: 0x5a6680, cloudSpd: 0.35, cloudLo: 0.2,
  top: 0x03050d, hor: 0x2a3550, pow: 0.55, band: 0.3, bandCol: 0x46506a, halo: 0.55, haloCol: 0x8a90a8, ...o });

export const lands = {
  /* ---------------- THE FLOODED PADDIES ---------------- */
  paddies: {
    variants: 3, desat: 0.25, groundTint: 0x2a2620, fog: [12, 150], hemi: 0.9, sun: 0.75, sunOffset: [10, 24, 14], exposure: 1.0, fogCol: 0x1c2436, skyCols: [0x03050d, 0x2a3550],
    sky: moonSky(),
    /* the fight field is a drained, harvested paddy: dark mud and short rice stubble (a bare floor read as a pale slab of ice) */
    grass: [{ n: 4200, h: [0.1, 0.32], root: 0x15140e, tip: 0x5a5030, r: [2, 18], dry: 0x6a5a38, density: (ctx, x, z) => (inYardWater(ctx, x, z) ? 0 : 0.9) },
      /* grass on the bunds, risers and bunds between the flooded plots */
      { n: 5000, h: [0.18, 0.45], root: 0x141a10, tip: 0x4a5a30, r: [18, 120], /* was 12000 */ dry: 0x5a5a38, density: (ctx, x, z) => { const sh = paddyShape(ctx, x, z, Math.hypot(x, z), Math.atan2(z, x)); return sh.lvl == null && sh.n < 99 ? 0.9 : 0; } }],
    terrain: { A: ['brown_mud_02', 3.2, 0x120f0b], B: ['brown_mud_02', 2.0, 0x0a0806], C: ['aerial_grass_rock', 9, 0x1e2418], P: 0x211a13, rock: [0.7, 1.0], macro: [30, 0.25], nstr: 0.6, rough: [0.95, 0.62], desat: 0.16, bnoise: 0.15, haze: [0x1c2436, 0.35, 120, 420], specMax: 0.08, path: 1 },
    heightMap: 160,
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      /* the valley runs toward the keep, a little off the line per variant */
      f.axis = NEMESIS_ANG + [0.08, -0.25, 0.3][v];
      /* the path out of the yard: up a bund to the shrine on the hill (a climb of small torii), away from the nemesis */
      f.shrineAng = FRONT + [-0.95, 1.05, -1.25][v] + (r() - 0.5) * 0.2;
      f.minkaAng = FRONT + [0.75, -0.8, 1.3][v] + (r() - 0.5) * 0.15;
      /* the big torii off to one side and further out, so it is not in every opening shot */
      f.toriiAng = FRONT + [-1.05, 1.15, -1.3][v] + (r() - 0.5) * 0.2;
      f.path = windingPath(r, ...polar(f.shrineAng, 9), f.shrineAng, 90, 5, 0.18);
      f.road = windingPath(r, ...polar(NEMESIS_ANG + Math.PI + 0.3, 10), NEMESIS_ANG + Math.PI + 0.3, 150, 7, 0.12);
      /* the temple on its hill behind the yard, past the end of the back road: the reverse view's focal point */
      f.temple = polar(NEMESIS_ANG + Math.PI - 0.22, 96);
      /* the yard plots: flooded plots, bunds and a dry strip on the flat fight floor (see yardPlan); after the paths, so a plot never floods one */
      f.plan = yardPlan(ctx);
      f.bamboo = []; for (let i = 0; i < [5, 7, 6][v]; i++) { const a = r() * TAU; if (angOff(a) < 0.35) continue; f.bamboo.push([...polar(a, 26 + r() * 40), 8 + Math.floor(r() * 6)]); } /* 8-13 clumps a grove, was 14-23 */
      f.pines = []; for (let i = 0; i < 14; i++) { const a = r() * TAU; if (angOff(a) < 0.3) continue; const [x, z] = polar(a, 20 + r() * 60); f.pines.push({ x, z, h: 5 + r() * 5 }); }
      f.minka = polar(f.minkaAng, 38 + r() * 8);
      /* a raised bund path toward the keep: what the walk follows, 150 m out, with racks, lanterns and a shed beside it */
      f.bund = windingPath(r, ...polar(NEMESIS_ANG, 17), NEMESIS_ANG, 150, 8, 0.14);
      const side = (d, o) => { const i = Math.min(f.bund.length - 2, Math.floor(d / 8)); const [ax, az] = f.bund[i]; const [bx, bz] = f.bund[i + 1]; const l = Math.hypot(bx - ax, bz - az) || 1; return [ax - (bz - az) / l * o, az + (bx - ax) / l * o, Math.atan2(bx - ax, bz - az)]; };
      f.hasa = [36, 64, 98, 126].map((d, i) => side(d + r() * 6, (i % 2 ? 1 : -1) * (4.5 + r() * 2)));
      f.shed = side(80 + r() * 10, (r() < 0.5 ? 1 : -1) * 17);
      f.bridge = { a: f.toriiAng + (f.toriiAng > FRONT ? -0.42 : 0.42), d0: 18.6, d1: 26 };
      /* a few lone pines along the walk, each on a dry hummock */
      f.lone = []; for (let d = 30; d < 150; d += 22 + r() * 10) { const [x, z] = polar(NEMESIS_ANG + (r() < 0.5 ? 1 : -1) * (0.16 + r() * 0.12), d); if (lineDist(f.bund, x, z) > 6) f.lone.push({ x, z, h: 6 + r() * 4 }); }
      const end = f.path[f.path.length - 1];
      const padAt = (x, z, R) => { const sh = paddyShape(ctx, x, z, Math.hypot(x, z), Math.atan2(z, x)); f.pads.push({ x, z, R, h: (sh.lvl ?? sh.h) + 0.3 }); };
      f.pads = [];
      padAt(f.minka[0], f.minka[1], 10); padAt(end[0], end[1], 6); padAt(f.shed[0], f.shed[1], 5.5);
      for (const [x, z] of f.bamboo) padAt(x, z, 5.5);
      for (const p of f.pines) padAt(p.x, p.z, 2.4);
      for (const p of f.lone) padAt(p.x, p.z, 2.6);
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const sh = paddyShape(ctx, x, z, rr, ang); let h = sh.h;
      /* raised bunds: the path to the shrine and the road out of the valley run on top of the terraces */
      const dp = lineDist(f.path, x, z); if (dp < 3.5) h = lerp(h, h + 0.32, smooth(3.5, 1.5, dp));
      const dr = lineDist(f.road, x, z); if (dr < 4) h = lerp(h, Math.max(h + 0.3, 0.1), smooth(4, 2, dr));
      if (rr > 15) { const dd = lineDist(f.bund, x, z); if (dd < 3.2) h = lerp(h, Math.max(h + 0.34, (sh.lvl ?? h) + 0.22), smooth(3.2, 1.3, dd)); }
      /* dry pads: the farmhouse, the shrine, bamboo groves and pines stand on raised ground, never in the water */
      for (const p of f.pads) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.R) h = lerp(h, Math.max(h, p.h), smooth(p.R, p.R * 0.55, d)); }
      /* the temple hill, a terraced mound 9 m up */
      { const dt = Math.hypot(x - f.temple[0], z - f.temple[1]); if (dt < 46) h = lerp(h, Math.max(h, 9 + fbm(x * 0.08, z * 0.08, 2) * 0.6), smooth(46, 22, dt)); }
      /* the yard: packed earth at 0, falling 1 m to the first flooded field */
      const ar = 1 - smooth(16, 21, rr); if (ar > 0) h = lerp(h, (fbm(x * 0.2, z * 0.2) - 0.5) * 0.06, ar);
      return h;
    },
    mask(ctx, x, z, h, rr) { const f = ctx.f; const p = Math.max(smooth(1.6, 0.4, lineDist(f.path, x, z)), smooth(2.2, 0.8, lineDist(f.road, x, z)), rr > 16 ? smooth(1.5, 0.5, lineDist(f.bund, x, z)) : 0, rr < 16 ? 0.25 * smooth(0.45, 0.6, fbm(x * 0.15, z * 0.15, 3)) : 0, stripK(f, x, z, rr)); return [p, smooth(0.3, -0.3, h) * 0.8 + smooth(0.5, 0.65, fbm(x * 0.09 + 3, z * 0.09, 3)) * 0.4 * (rr < 16 ? 1 : 0), 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r;
      const [tx, tz] = polar(f.toriiAng, 34); const try_ = Math.PI / 2 - f.toriiAng;
      addPaddyWater(ctx, L, { tint: 0x0a1016, deep: 0x020304, stars: ctx.v === 1 ? 0.2 : 0.7, torii: { x: tx, y: ctx.H(tx, tz) - 0.05, z: tz, s: 1.35, ry: try_ } });
      const water = (x, z) => { const sh = paddyShape(ctx, x, z, Math.hypot(x, z), Math.atan2(z, x)); return sh.lvl != null && sh.lvl > ctx.H(x, z) ? sh.lvl : null; };
      addYardPlots(ctx, L, { torii: { x: tx, y: ctx.H(tx, tz) - 0.05, z: tz, s: 1.35, ry: try_ }, stars: ctx.v === 1 ? 0.2 : 0.7 });
      addRice(ctx, L, { n: 6500 });
      addRice(ctx, L, { d0: 55, d1: 150, n: 3200, sector: [NEMESIS_ANG, 0.9], k: 1.35, blades: 4 }); /* far rice in half the tufts, a third bigger */
      addFogSheets(ctx, L, [0.4, 1.0], { color: 0x5a6680, alpha: 0.06, R: 95 }); /* thin: three pale sheets turned the dark mud into grey snow */
      addFogSheets(ctx, L, [4.5, 9], { color: 0x4a5670, alpha: 0.08, R: 180 });
      /* the big torii out in the water by the yard, and its lanterns */
      const tlist = [{ x: tx, z: tz, ry: try_, s: 1.35 }];
      /* the climb of small torii along the shrine path */
      for (let i = 4; i < f.path.length - 2; i += 4) { const [ax, az] = f.path[i]; const [bx, bz] = f.path[i + 1]; if (Math.hypot(ax, az) < ARENA_R + 6) continue; tlist.push({ x: ax, z: az, ry: Math.atan2(bx - ax, bz - az), s: 0.62 + r() * 0.08 }); }
      buildToriis(ctx, L, tlist);
      const end = f.path[f.path.length - 1]; const pre = f.path[f.path.length - 3];
      const shrineL = buildShrine(ctx, L, end[0], end[1], Math.atan2(pre[0] - end[0], pre[1] - end[1]));
      const lan = [...shrineL];
      { const s = r() < 0.5 ? 1 : -1; const ox = Math.cos(try_) * 3.4 * s; const oz = -Math.sin(try_) * 3.4 * s; lan.push({ x: tx + ox, z: tz + oz, s: 1.05, lit: true }); }
      /* lanterns along the bund toward the keep, one side then the other */
      for (let i = 3; i < f.bund.length - 1; i += 3) { const [ax, az] = f.bund[i]; const [bx, bz] = f.bund[i + 1]; const l = Math.hypot(bx - ax, bz - az) || 1; const s = (i / 3) % 2 ? 1 : -1; lan.push({ x: ax - (bz - az) / l * 2.2 * s, z: az + (bx - ax) / l * 2.2 * s, s: 0.85 + r() * 0.15, lit: r() < 0.6 }); }
      /* lanterns along the bund path and the road, about every 14 m, most of them lit */
      for (const line of [f.path, f.road]) for (let i = 3; i < line.length - 1; i += 3) { const [ax, az] = line[i]; const [bx, bz] = line[i + 1]; const dx = bx - ax; const dz = bz - az; const l = Math.hypot(dx, dz) || 1; const s = i % 2 ? 1 : -1; const x = ax - dz / l * 2.1 * s; const z = az + dx / l * 2.1 * s; if (Math.hypot(x, z) < ARENA_R + 1.5 || Math.hypot(x, z) > 95) continue; lan.push({ x, z, s: 0.9 + r() * 0.15, lit: r() < 0.7 }); }
      /* the rim bund round the fight floor: lit stone lanterns and paper lanterns on poles, a warm ring against the cold moon (nemesis line kept open) */
      const plan_ = []; { const n = 10; const a0 = r() * TAU; for (let i = 0; i < n; i++) { const a = a0 + (i + (r() - 0.5) * 0.35) / n * TAU; if (angOff(a) < 0.35) continue; const [x, z] = polar(a, 16.9 + r() * 0.3); if (i % 3 === 0) lan.push({ x, z, s: 0.95, lit: true }); else plan_.push({ x, z, s: 0.95 + r() * 0.15, ry: Math.atan2(z, -x) + (r() - 0.5) * 0.4 }); } }
      buildPaperLanterns(ctx, L, plan_);
      buildLanterns(ctx, L, lan, { water });
      /* the farmhouse up on its own terrace */
      const [mx, mz] = f.minka; buildMinka(ctx, L, mx, mz, Math.atan2(-mx, -mz) + (r() - 0.5) * 0.4);
      buildBamboo(ctx, L, f.bamboo);
      buildPines(ctx, L, f.pines);
      buildPines(ctx, L, farPines(ctx, { hMin: 18 }));
      /* jizo by the bund, out on the walk, not by the yard */
      { const i = Math.min(f.bund.length - 2, 7); const [jx, jz] = f.bund[i]; const [kx, kz] = f.bund[i + 1]; const rot = Math.atan2(kx - jx, kz - jz); buildJizo(ctx, L, jx - Math.cos(rot) * 3.0, jz + Math.sin(rot) * 3.0, rot + Math.PI / 2, 3 + Math.floor(r() * 3)); }
      buildHasa(ctx, L, f.hasa);
      { const [sx, sz, sr] = f.shed; buildMinka(ctx, L, sx, sz, sr + Math.PI / 2, { W: 4.4, D: 3.4, H: 2.1, roofH: 2.6, gable: 0.72 }); } /* the 4.6 m roof of the big farmhouse sat on this 4 m shed as a tall pyramid; a lower hip-and-gable roof with a long ridge */
      buildFootbridge(ctx, L, f.bridge);
      buildPines(ctx, L, f.lone);
      /* the lord's keep, far out on the nemesis line, small in the haze, a few lights */
      buildKeep(ctx, L, NEM[0] * 1.15, NEM[1] * 1.15, { S: 0.9, face: Math.atan2(-NEM[0], -NEM[1]), glowK: 0.8 });
      /* the temple on its hill behind the yard (the reverse view), its lanterns, and pines round it */
      { const [px, pz] = f.temple; const tl = buildPagoda(ctx, L, px, pz, Math.atan2(-px, -pz) + 0.35, { S: 1.15 }); buildLanterns(ctx, L, tl);
        const tp = []; for (let i = 0; i < 9; i++) { const a = r() * TAU; const d = 17 + r() * 14; tp.push({ x: px + Math.cos(a) * d, z: pz + Math.sin(a) * d, h: 9 + r() * 4 }); } buildPines(ctx, L, tp); }
      /* far lanterns: a village line on the far hills (warm points) */
      { const list = []; for (let i = 0; i < 30; i++) { const a = r() * TAU; if (angOff(a) < 0.25) continue; const d = 110 + r() * 120; const [x, z] = polar(a, d); list.push([x, ctx.H(x, z) + 1.5, z, 1.4 + r() * 1.2]); } addGlows(L, list, 0xff9040, { alpha: 0.5 }); }
    },
    props: [
      { m: 'boulder_01', n: 10, s: [0.8, 1.8], d: [18, 60], sink: 0.35, tint: 0x5a5850, cover: 0x2a3420, coverAmt: 0.7, where: (ctx, x, z) => (ctx.H(x, z) > -0.2 ? 1 : 0.1) },
      { p: 'reeds', n: 90, h: [0.6, 1.4], d: [17, 70], color: 0x2e3222, cluster: [3, 8], spread: 3, where: (ctx, x, z) => { const h = ctx.H(x, z); return h > -0.2 && h < 0.4 ? 1 : 0.06; } },
      { p: 'fern', n: 40, h: [0.6, 1.1], d: [20, 80], tint: 0x6a7a5a, cluster: [2, 5], spread: 3, where: (ctx, x, z) => (ctx.H(x, z) > 2 ? 1 : 0) },
    ],
    particles: [
      { kind: 'firefly', n: 380, size: 0.1, vel: [0.05, 0.04, 0.02], var: [0.4, 0.25, 0.4], color: 0xd8ff9a, add: true, glow: 2.4, sway: 1.0, y0: 0.1, box: 5, wide: 60 },
      { kind: 'dot', n: 300, size: 0.035, vel: [0.08, -0.02, 0.04], var: [0.15, 0.08, 0.15], color: 0xc8ccd8, opacity: 0.25, sway: 0.4 },
    ],
  },

  /* ---------------- THE CASTLE ROAD ----------------
     A bailey (ni-no-maru) on the road to the keep. Frame: a = along the road toward the keep, s = across it, signed so
     s > 0 is the honmaru side (f.ws flips it per seed). On the honmaru side a tall battered ishigaki rises to the upper
     terrace, a plaster wall and a corner yagura on top. Ahead: a plaster wall on a low stone plinth with the gatehouse
     on the road. The other side and the back stay open: a low stone curb, pines, and a drop to the lower town. Packed
     earth, a band of raked gravel along the stone face, drains, bales, a spear rack, a well, a bell tower, mon banners.
     The keep stands on its own hill at the end of the road, inside a ring of walls and pines. */
  castleroad: {
    variants: 3, desat: 0.3, groundTint: 0x2a2622, fog: [14, 170], hemi: 0.9, sun: 0.8, sunOffset: [12, 24, 14], exposure: 1.0, fogCol: 0x1a2030, skyCols: [0x03050d, 0x2a3550],
    sky: moonSky({ band: 0.5, bandCol: 0x52607e }), /* a brighter moonlit haze on the horizon, so the far hills of the reverse view stand out as layers */
    terrain: { A: ['rocky_terrain_02', 4, 0x4a443a], B: ['grass_path_2', 3, 0x3a3428], C: ['aerial_grass_rock', 9, 0x2a2e24], P: 0x5a5040, rock: [0.45, 0.8], macro: [36, 0.25], nstr: 1.1, rough: [0.95, 0.6], desat: 0.3, bnoise: 0.2, haze: [0x1a2030, 0.35, 140, 480], specMax: 0.1, path: 1 },
    heightMap: 160,
    layout(ctx) {
      const { r } = ctx; const f = ctx.f;
      /* the frost climate always gets the snow; other climates take the seed's variant */
      if (ctx.world?.biome?.climate === 'frostpass') ctx.v = 2;
      const v = ctx.v; f.snow = v === 2 ? 1 : 0;
      applyCastleVariant(v);
      /* the honmaru on the side whose stone face turns to the moon (the other way the whole face was one black mass) */
      f.ws = 1; r();
      f.P = (a, s) => crP(a, s * f.ws); f.S = (x, z) => crS(x, z) * f.ws;
      /* the road: from the town behind, up a ramp into the bailey, out through the gatehouse to the keep's hill */
      f.road = [f.P(-120, -6), f.P(-60, -3), f.P(-30, 0), [0, 0], f.P(60, 0), f.P(130, 1), f.P(NEM_DIST, 0)];
      f.Hs = 5.6 + r() * 0.8;
      /* a temple hill behind the lower town, on the honmaru side of the back road: the reverse view's focal point */
      f.temple = f.P(-112, 28);
      /* a second hill to the right of the temple in the reverse view (it looked at an empty sky over a black band) */
      f.hill2 = [-72, 80];
      /* the honmaru ishigaki (one run, the face toward the yard), the front wall in two runs either side of the gate */
      f.walls = [{ path: [f.P(-BY_O, BY_S), f.P(-8, BY_S + 0.6), f.P(BY_A + 3.5, BY_S)], side: -f.ws, Hs: f.Hs, ruin: 0, wallH: 2.1 }];
      f.front = [{ path: [f.P(BY_A, -BY_O + 1), f.P(BY_A, -GATE_W / 2 - 0.4)], side: f.ws }, { path: [f.P(BY_A, GATE_W / 2 + 0.4), f.P(BY_A, BY_S - 1.2)], side: f.ws }];
      f.gate = f.P(BY_A, 0); f.gate2 = f.P(82, 0);
      f.yagura = f.P(BY_A - 2, BY_S + 5.5);
      /* pines: on the honmaru terrace, along the open edge outside the curb, by the road ahead */
      f.pines = [];
      for (let a = -26; a < BY_A; a += 9 + r() * 4) f.pines.push({ ...xz(f.P(a, BY_S + 6 + r() * 6)), h: 7 + r() * 4 });
      for (let a = -20; a < BY_A; a += 7 + r() * 5) f.pines.push({ ...xz(f.P(a, -BY_O - 3 - r() * 3)), h: 6 + r() * 4 });
      for (let s = -BY_O + 4; s < BY_S; s += 8 + r() * 5) if (Math.abs(s) > 7) f.pines.push({ ...xz(f.P(-BY_O - 3 - r() * 3, s)), h: 6 + r() * 4 });
      for (let a = BY_A + 10; a < 150; a += 11 + r() * 6) for (const sd of [-1, 1]) if (r() < 0.8) f.pines.push({ ...xz(f.P(a, sd * (7 + r() * 6))), h: 7 + r() * 4 });
    },
    height(ctx, x, z, rr) {
      const f = ctx.f; const s0 = sd0(ctx); const a = crA(x, z); const s = f.S(x, z);
      let h = (fbm(x * 0.02 + s0, z * 0.02, 4) - 0.45) * 3.5 * smooth(26, 60, rr);
      h += ranges(x, z, rr, Math.atan2(z, x), s0, { near: [220, 320], far: [380, 600], ampN: 45, ampF: 140, sharp: 2.0, freq: 0.0048 }) * smooth(150, 230, Math.hypot(x - NEM[0], z - NEM[1]));
      /* the walk corridor ahead (140 m, 30 m to each side) never dips more than 0.6 m */
      if (a > 0 && Math.abs(s) < 36) h = Math.max(h, lerp(-0.6, -30, smooth(31, 36, Math.abs(s))));
      /* the road ahead lies on the ground, a little worn in */
      const dr = lineDist(f.road, x, z); if (a > BY_A) h = lerp(h, Math.min(h, 0.05 + Math.max(0, h) * 0.6), smooth(5, 2, dr));
      /* the keep's hill: a plateau 32 m round, 13 m up */
      const dk = Math.hypot(x - NEM[0], z - NEM[1]); h = lerp(h, 13 + fbm(x * 0.05, z * 0.05, 2) * 0.4, smooth(78, 33, dk));
      /* the honmaru terrace behind the stone face */
      const inA = smooth(-36, -31, a) * smooth(BY_A + 8, BY_A + 4, a);
      h = lerp(h, Math.max(h, f.Hs - 0.2 + fbm(x * 0.1, z * 0.1, 2) * 0.3), smooth(BY_S + f.Hs * 0.42 + 0.5, BY_S + f.Hs * 0.42 + 1.8, s) * inA); /* behind the top of the batter: a terrain rise in front of the stones hid the whole face */
      /* the open side and the back fall to the lower town (out of the walk corridor) */
      const ramp = smooth(6, 3, dr) * (a < 0 ? 1 : 0);
      const drop = Math.max(smooth(-BY_O - 1, -BY_O - 8, a), smooth(31, 39, -s) * smooth(36, 22, a)) * (1 - ramp);
      h = lerp(h, -9 + fbm(x * 0.04, z * 0.04, 3) * 1.6, drop);
      if (ramp > 0 && a < -BY_O) h = lerp(h, Math.max(-9, (a + BY_O) * 0.3), ramp);
      /* the temple hill rises out of the lower town, 4 m above the yard */
      { const dt = Math.hypot(x - f.temple[0], z - f.temple[1]); if (dt < 50) h = lerp(h, 4 + fbm(x * 0.08, z * 0.08, 2) * 0.5, smooth(50, 24, dt)); }
      if (f.hill2) { const dh = Math.hypot(x - f.hill2[0], z - f.hill2[1]); if (dh < 44) h = lerp(h, 8 + fbm(x * 0.07, z * 0.07, 2) * 0.8 - dh * 0.06, smooth(44, 14, dh)); }
      /* the bailey floor: packed earth, flat */
      const yard = smooth(BY_A + 0.6, BY_A - 0.4, a) * smooth(-BY_O - 1.2, -BY_O - 0.2, a) * smooth(BY_S + 0.3, BY_S - 0.3, s) * smooth(-BY_O - 1.2, -BY_O - 0.2, s);
      h = lerp(h, (fbm(x * 0.3, z * 0.3, 2) - 0.5) * 0.08, Math.max(yard, 1 - smooth(16, 18, rr)));
      return h;
    },
    mask(ctx, x, z, h, rr) { const f = ctx.f; return [smooth(3.4, 1.2, lineDist(f.road, x, z)), smooth(0.5, 0.7, fbm(x * 0.06, z * 0.06 + 5, 3)) * 0.7, 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r; const snow = f.snow; const lamp = 0xffa050; const gRotE = Math.atan2(CRc, CRs) + Math.PI / 2;
      for (const w of f.walls) buildIshigaki(ctx, L, w.path, { Hs: w.Hs, side: w.side, snow, ruin: w.ruin, wall: true, wallH: w.wallH });
      for (const w of f.front) buildIshigaki(ctx, L, w.path, { Hs: 0.9, depth: 0.7, side: w.side, snow, wall: true, wallH: 2.3, corners: false });
      const gRot = Math.PI / 2 - NEMESIS_ANG;
      buildGatehouse(ctx, L, f.gate[0], f.gate[1], gRot, { snow, w: GATE_W });
      buildGate(ctx, L, f.gate2[0], f.gate2[1], gRot, { snow, w: 6.2 });
      /* the corner yagura on the honmaru terrace */
      { const [tx, tz] = f.yagura; buildKeep(ctx, L, tx, tz, { S: 0.3, face: gRot + Math.PI, snow, glowK: 0.4, tiers: 2, baseH: 3, y: ctx.H(tx, tz) - 0.4 }); }
      /* the open edge: a low curb of rough stones along the side and the back, cut by the road ramp */
      { const st = []; const edge = [[f.P(-BY_O, -BY_O), f.P(BY_A, -BY_O)], [f.P(-BY_O, -BY_O), f.P(-BY_O, BY_S)]];
        for (const [[ax, az], [bx, bz]] of edge) { const len = Math.hypot(bx - ax, bz - az); const ux = (bx - ax) / len; const uz = (bz - az) / len;
          for (let s = 0; s < len; ) { const w = 0.6 + r() * 0.7; const x = ax + ux * (s + w / 2); const z = az + uz * (s + w / 2); s += w; if (lineDist(f.road, x, z) < 4) continue;
            const b = chunkGeo(r, { w, h: 0.45 + r() * 0.25, d: 0.6, chip: 0.3, seg: 1 }); b.rotateY(Math.atan2(ux, uz) + Math.PI / 2); b.translate(x, ctx.H(x, z) - 0.1, z); st.push(b); solid(ctx, x, z, 0.6, 'curb'); } }
        const m = new THREE.Mesh(mergeClean(st), stoneMat(0x8a8680, snow ? { cover: 0xd0d4dc, coverAmt: 1 } : { cover: 0x3a4630, coverAmt: 0.5 })); m.castShadow = true; m.receiveShadow = true; L.add(m); }
      /* the lower town below the open sides */
      { const spots = [];
        for (let a = -70; a < 30; a += 7 + r() * 3) for (let s = -BY_O - 14; s > -90; s -= 8 + r() * 4) { const [x, z] = f.P(a + (r() - 0.5) * 3, s); if (ctx.H(x, z) > -6.5 || lineDist(f.road, x, z) < 6 || r() < 0.25) continue; spots.push({ x, z, ry: gRot + (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.15, w: 4 + r() * 3, d: 3.5 + r() * 2 }); }
        for (let a = -BY_O - 14; a > -90; a -= 8 + r() * 4) for (let s = -10; s < BY_S + 20; s += 7 + r() * 3) { const [x, z] = f.P(a, s); if (ctx.H(x, z) > -6.5 || lineDist(f.road, x, z) < 6 || r() < 0.25) continue; spots.push({ x, z, ry: gRot + (r() - 0.5) * 0.15, w: 4 + r() * 3, d: 3.5 + r() * 2 }); }
        buildTown(ctx, L, spots.slice(0, 60), { lamp, snow }); }
      /* raked gravel along the stone face, a drain at its edge and inside the front wall */
      { const [gx, gz] = f.P(-4, BY_S - 3.2); buildGravel(ctx, L, gx, gz, -NEMESIS_ANG, 50, 5.6, { snow });
        /* the rest of the yard in gravel too, either side of a packed-earth road edged with stones */
        { const [hx, hz] = f.P(-1, (BY_S - 6.4 + 3.4) / 2); buildGravel(ctx, L, hx, hz, -NEMESIS_ANG, 2 * BY_A + 2 - 4, BY_S - 6.4 - 3.4, { snow }); }
        { const [hx, hz] = f.P(-1, (-BY_O + 0.8 - 3.4) / 2); buildGravel(ctx, L, hx, hz, -NEMESIS_ANG, 2 * BY_A + 2 - 4, BY_O - 0.8 - 3.4, { snow }); }
        /* the road itself: dressed flagstones with big kerb stones */
        buildFlagRoad(ctx, L, f, { snow });
        const [a0x, a0z] = f.P(-29, BY_S - 6.2); const [a1x, a1z] = f.P(BY_A - 1, BY_S - 6.2); buildDrain(ctx, L, a0x, a0z, a1x, a1z, { snow });
        const [b0x, b0z] = f.P(BY_A - 1.2, -BY_O + 2); const [b1x, b1z] = f.P(BY_A - 1.2, -GATE_W / 2 - 1); buildDrain(ctx, L, b0x, b0z, b1x, b1z, { snow });
        const [c0x, c0z] = f.P(BY_A - 1.2, GATE_W / 2 + 1); const [c1x, c1z] = f.P(BY_A - 1.2, BY_S - 7); buildDrain(ctx, L, c0x, c0z, c1x, c1z, { snow }); }
      buildPines(ctx, L, f.pines, { snow });
      buildPines(ctx, L, farPines(ctx, { hMin: 8 }), { snow });
      /* the bell tower in the open corner of the yard */
      { const [x, z] = f.P(-17, -BY_O + 5.5); buildBell(ctx, L, x, z, gRot + 0.3, { snow }); }
      /* lanterns: by the gatehouse, along the stone face, along the road ahead to the second gate */
      const lan = [];
      for (const sd of [-1, 1]) { const [x, z] = f.P(BY_A - 2.4, sd * (GATE_W / 2 + 4.6)); lan.push({ x, z, s: 1.15, lit: true }); }
      for (const a of [-18, 12]) { const [x, z] = f.P(a, BY_S - 7.6); lan.push({ x, z, s: 1.1, lit: r() < 0.7 || ctx.v === 2 }); }
      for (const a of [40, 58, 76, 100, 124]) for (const sd of [-1, 1]) { const [x, z] = f.P(a, sd * 4.2); lan.push({ x, z, s: 1.05, lit: a < 90 || r() < 0.5 }); }
      buildLanterns(ctx, L, lan, { snow });
      /* kagaribi (iron fire baskets with live flame): a pair at the gate, one at each side of the yard */
      buildFire(ctx, L, [f.P(BY_A - 2.4, GATE_W / 2 + 2.7), f.P(BY_A - 2.4, -(GATE_W / 2 + 2.7)), f.P(-5, BY_S - 4.5), f.P(14, -17.5)], { lamp: snow ? 0xffb070 : 0xff8a3a });
      /* rows of nobori along the top of the honmaru wall: two staggered rows, indigo and dark red, one and a third times the size, the cloth facing the yard */
      { const sO = BY_S + f.Hs * 0.42 + 1.9; const rowA = []; const rowB = []; const yg = f.yagura;
        for (let a = -24; a < 21; a += 3.1) { for (const [row, off, ds] of [[rowA, 0, 0], [rowB, 1.55, 1.7]]) { const [x, z] = f.P(a + off, sO + ds); if (Math.hypot(x - yg[0], z - yg[1]) < 6) continue; row.push([x, z, -NEMESIS_ANG]); } }
        buildNobori(ctx, L, rowA, { color: 0x1e2438, ink: '#d8d0bc', mon: true, k: 1.35 }); /* indigo (cream cloth with torn hems read as ghosts in the reverse view) */ buildNobori(ctx, L, rowB, { color: 0x7a1c14, ink: '#e8e2d2', mon: true, k: 1.35 }); }
      /* clutter along the foot of the stone face: tate, a cart with bales, buckets, a stack of bales */
      buildWallClutter(ctx, L, f, { snow });
      /* mon banners: a line inside the front wall and pairs along the road ahead */
      const nob = []; for (const s of [-18, -13, 11, 16]) { const [x, z] = f.P(BY_A - 2.2, s); nob.push([x, z, gRot + Math.PI]); }
      for (let a = BY_A + 8; a < 80; a += 12) for (const sd of [-1, 1]) { const [x, z] = f.P(a, sd * 5.6); nob.push([x, z, gRot + (sd > 0 ? 0 : Math.PI)]); }
      buildNobori(ctx, L, nob, { color: ctx.v === 1 ? 0x7a2a1c : 0xd6cfba, ink: '#16161c', mon: true });
      /* yard furniture on fixed slots clear of the gravel, the road and the bell (each footprint 20 m+ from the centre) */
      { const slots = [[19.5, -13], [19.5, 10.5], [-3, -21.5], [9, -21], [-21.5, 10.5], [-21.5, -6]].map(([a, s]) => f.P(a, s)).filter(([x, z]) => Math.hypot(x, z) > 20 && lineDist(f.road, x, z) > 4);
        for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; } f.yardSpots = slots.slice(0, 4); }
      buildYard(ctx, L, f, { snow });
      /* jizo by the ramp down to the town */
      { const [x, z] = f.P(-BY_O + 5.5, 7.5); buildJizo(ctx, L, x, z, gRot, 4, snow, 1.6); }
      /* the reverse view: the temple and its pagoda on the hill behind the town, lanterns down the back road, the
         town's windows and street lamps as warm points (the town sits below the yard edge) */
      { const [px, pz] = f.temple; const tl = buildPagoda(ctx, L, px, pz, gRot + Math.PI * 0.5 + 0.3, { S: 1.3, snow }); buildLanterns(ctx, L, tl, { snow });
        const tp = []; for (let i = 0; i < 12; i++) { const a = r() * TAU; const d = 19 + r() * 16; tp.push({ x: px + Math.cos(a) * d, z: pz + Math.sin(a) * d, h: 9 + r() * 5 }); } buildPines(ctx, L, tp, { snow });
        const bl = []; for (const a of [-36, -48, -60, -74, -90, -106]) for (const sd of [-1, 1]) { const [x, z] = f.P(a, sd * 4.4 - 6 * smooth(-30, -120, a)); bl.push({ x, z, s: 1.05, lit: true }); } buildLanterns(ctx, L, bl, { snow });
        const tg = []; for (let i = 0; i < 70; i++) { const a = -50 - r() * 160; const sd = -60 + r() * 140; const [x, z] = f.P(a, sd); if (Math.hypot(x - px, z - pz) < 26) continue; tg.push([x, ctx.H(x, z) + 1.2 + r() * 1.5, z, 1.1 + r() * 1.3]); }
        /* far villages on the dark hills behind (the reverse horizon was one black band) */
        for (let i = 0; i < 90; i++) { const a = -150 - r() * 200; const sd = -140 + r() * 260; const [x, z] = f.P(a, sd); const hh = ctx.H(x, z); if (hh < -2) continue; tg.push([x, hh + 1.5, z, 2.2 + r() * 2.2]); }
        addGlows(L, tg, 0xff9a48, { alpha: 0.75 }); }
      /* the right half of the reverse view: a hill with a lit hall on its crown, pines
         against the moonlit haze, a torii at its foot facing the yard and lit lanterns up the path between them */
      if (f.hill2) { const [hx, hz] = f.hill2; const d = Math.hypot(hx, hz); const ux = -hx / d; const uz = -hz / d; const face = Math.atan2(-hx, -hz);
        buildMinka(ctx, L, hx, hz, face, { W: 10, D: 7, H: 3.2, lamp, snow });
        buildToriis(ctx, L, [{ x: hx + ux * 25, z: hz + uz * 25, ry: face, s: 1.5 }]);
        const hl = []; for (let k = 7; k <= 22; k += 3.8) for (const sd of [-1, 1]) hl.push({ x: hx + ux * k + uz * sd * 2.4, z: hz + uz * k - ux * sd * 2.4, s: 1.1, lit: true });
        buildLanterns(ctx, L, hl, { snow });
        const hp = []; for (let i = 0; i < 14; i++) { const a = face + Math.PI * 0.35 + r() * Math.PI * 1.3; const dd = 9 + r() * 12; hp.push({ x: hx + Math.sin(a) * dd, z: hz + Math.cos(a) * dd, h: 10 + r() * 6 }); } buildPines(ctx, L, hp, { snow }); }
      /* the keep on its hill: a ring of walls on stone, a gate toward the road, pines on the slope */
      const kH = ctx.H(NEM[0], NEM[1]);
      buildKeep(ctx, L, NEM[0], NEM[1], { S: 1.0, face: Math.atan2(-NEM[0], -NEM[1]), snow, glowK: ctx.v === 1 ? 0.5 : 1, baseH: 13, y: kH - 0.4 });
      { const back = Math.atan2(NEM[1], NEM[0]); const R = 29; const seg = (a0, a1) => { const pts = []; const n = Math.ceil((a1 - a0) * R / 6); for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; pts.push([NEM[0] + Math.cos(t) * R, NEM[1] + Math.sin(t) * R]); } return pts; };
        const gapA = 0.22; buildIshigaki(ctx, L, seg(back + Math.PI + gapA, back + Math.PI * 3 - gapA), { Hs: 3.2, depth: 2.2, side: -1, snow, wall: true });
        const kp = []; for (let i = 0; i < 26; i++) { const t = r() * TAU; const d = 36 + r() * 30; const x = NEM[0] + Math.cos(t) * d; const z = NEM[1] + Math.sin(t) * d; if (lineDist(f.road, x, z) < 6) continue; kp.push({ x, z, h: 8 + r() * 5 }); } buildPines(ctx, L, kp, { snow });
        const kl = []; for (const sd of [-1, 1]) { const [x, z] = [NEM[0] - Math.cos(back) * (R + 3) - Math.sin(back) * sd * 3.5, NEM[1] - Math.sin(back) * (R + 3) + Math.cos(back) * sd * 3.5]; kl.push({ x, z, s: 1.2, lit: true }); } buildLanterns(ctx, L, kl, { snow }); }
      addFogSheets(ctx, L, [0.3, 0.9], { color: snow ? 0xb0b8c8 : 0x7a8498, alpha: snow ? 0.12 : 0.1, R: 95 });
      addFogSheets(ctx, L, [-7.5, -5], { color: snow ? 0x9aa4b8 : 0x4a5468, alpha: 0.12, R: 160 });
      addFogSheets(ctx, L, [6, 14], { color: snow ? 0x8a94a8 : 0x3a4458, alpha: 0.07, R: 220 });
      if (ctx.v === 1) addSmoke(L, [NEM[0] * 0.8 + 30, 2, NEM[1] * 0.8], { n: 20, size: 22, rise: 70, life: 50, wind: [0.5, 0, 0.1], low: 0x2a1c1a, high: 0x4a3430, alpha: 0.35 });
    },
    props: [
      { m: 'boulder_01', n: 14, s: [0.8, 2.2], d: [34, 90], sink: 0.35, tint: 0x5a5852, cover: 0x2a3420, coverAmt: 0.6, where: (ctx, x, z) => (lineDist(ctx.f.road, x, z) > 8 && !inBailey(ctx, x, z, 3) ? 1 : 0) },
      { m: 'moon_rock_01', n: 30, s: [0.3, 0.9], d: [20, 60], sink: 0.5, tint: 0x5a5852, clutter: true, cluster: [2, 4], spread: 3, where: (ctx, x, z) => (lineDist(ctx.f.road, x, z) > 2.5 && !inBailey(ctx, x, z, -1) ? 1 : 0) },
    ],
    grass: [{ n: 9000, h: [0.25, 0.6], root: 0x1e2016, tip: 0x5a5a3a, r: [16, 80], dry: 0x8a7a5a, density: (ctx, x, z) => (lineDist(ctx.f.road, x, z) < 3 || inBailey(ctx, x, z, 1) ? 0 : 0.8) }],
    particles: [{ kind: 'dot', n: 300, size: 0.035, vel: [0.1, -0.03, 0.05], var: [0.15, 0.08, 0.15], color: 0xc8ccd8, opacity: 0.22, sway: 0.4 }],
  },
};

/* ======================================================================== light looks (world.js LOOK shape) */
export const looks = {
  paddies: { key: [-0.4, 0.3, -0.87], keyCol: 0xc8d0e8, keyI: 1.7, fill: 0.2, rim: 0xc8d0e8, rimI: 1.1, back: 1.5,
    disc: { r: 0.03, col: 0xf2ead8, i: 2.4, soft: 0.05, halo: 0x8a90b0, haloI: 0.5, haloR: 6, veil: 0.4, ring: 14, ringI: 0.05 },
    fog: { d: 0.0026, h: 0.004, fall: 0.14, max: 0.9, start: 9, sky: 1, scatter: 0.2 }, grade: { sat: 0.92, con: 0.42, lift: 0x0b0c15, gain: 0xfff0dc }, exp: 1.0 },
  castleroad: { key: [-0.4, 0.3, -0.87], keyCol: 0xc8d0e8, keyI: 1.7, fill: 0.2, rim: 0xc8d0e8, rimI: 1.1, back: 1.5,
    disc: { r: 0.03, col: 0xf2ead8, i: 2.4, soft: 0.05, halo: 0x8a90b0, haloI: 0.5, haloR: 6, veil: 0.4 },
    fog: { d: 0.0024, h: 0.0036, fall: 0.12, max: 0.88, start: 9, sky: 1, scatter: 0.2 }, grade: { sat: 0.78, con: 0.4, lift: 0x070a14, gain: 0xf4eee0 }, exp: 1.0 },
};
/* castle road variants: 0 moonlit night, 1 red dawn behind the keep, 2 snow under a low grey sky.
   The land entry and its light look are this module's own objects, so a variant rewrites them in place before the
   land reads them (world.js reads LOOK every frame; lands.js reads look.sky after layout). */
const CASTLE = {
  0: { sky: moonSky({ sunDir: [-0.5, 0.32, -1] }), fogCol: 0x1a2030, skyCols: [0x03050d, 0x2a3550], exposure: 1.0,
    look: { key: [-0.48, 0.32, -0.82], keyCol: 0xc8d0e8, keyI: 1.7, fill: 0.2, rim: 0xc8d0e8, rimI: 1.1, back: 1.5, disc: { r: 0.03, col: 0xf2ead8, i: 2.4, soft: 0.05, halo: 0x8a90b0, haloI: 0.5, haloR: 6, veil: 0.4 },
      fog: { d: 0.0024, h: 0.0036, fall: 0.12, max: 0.88, start: 9, sky: 1, scatter: 0.2 }, grade: { sat: 0.78, con: 0.4, lift: 0x070a14, gain: 0xf4eee0 }, exp: 1.0 } },
  1: { sky: { sunDir: [0.3, 0.2, -0.93], sunCol: 0xffd8bc, sunGlow: 0.6, sunSize: 0.045, disc: 0.7, stars: 0.3, clouds: 0.32, cloudCol: 0x0c0c1c, cloudLit: 0x6a2a2a, cloudSpd: 0.3, cloudLo: 0.22,
      /* deep indigo overhead, a red band low on the horizon, a pale sun disc low in the haze behind the keep */
      top: 0x0a1236, hor: 0x4a1a2c, pow: 0.38, band: 0.75, bandCol: 0xb03a20, glowK: 0.9, glowCol: 0xc04a24, glowDir: [0.34, 0.02, -0.94], halo: 0.35, haloCol: 0x8a4a3a },
    fogCol: 0x1e1626, skyCols: [0x0a1236, 0x3a1828], exposure: 1.0,
    look: { key: [0.3, 0.2, -0.93], keyCol: 0xff9a6a, keyI: 2.4, fill: 0.22, rim: 0xffa070, rimI: 1.4, back: 1.8,
      disc: { r: 0.04, col: 0xffdcc4, i: 1.4, soft: 0.35, halo: 0xd0603a, haloI: 0.55, haloR: 5, veil: 0.6 }, /* the pale sun behind haze */
      fog: { d: 0.0026, h: 0.004, fall: 0.12, max: 0.88, start: 9, sky: 0.4, scatter: 0.35 }, grade: { sat: 0.74, con: 0.42, lift: 0x080a14, gain: 0xfff0e0 }, exp: 1.0 } },
  2: { sky: { sunDir: [-0.4, 0.25, -1], sunCol: 0xc8d0e0, sunGlow: 0.2, stars: 0, clouds: 0.9, cloudCol: 0x2a3040, cloudLit: 0x6a7488, cloudSpd: 0.2, cloudLo: 0.12,
      top: 0x0c1220, hor: 0x5a6478, pow: 0.6, band: 0.2, bandCol: 0x7a84a0, halo: 0.3, haloCol: 0x6a7490 },
    fogCol: 0x4a5468, skyCols: [0x0c1220, 0x5a6478], exposure: 0.92,
    look: { key: [-0.45, 0.45, -0.77], keyCol: 0xdce4f4, keyI: 2.0, fill: 0.36, rim: 0xb8c8e8, rimI: 0.9, back: 1.2, disc: { r: 0.018, col: 0xe8ecf4, i: 1.2, soft: 0.3, halo: 0x8a94b0, haloI: 0.3, haloR: 4, veil: 0.85 },
      fog: { d: 0.0034, h: 0.005, fall: 0.1, max: 0.92, start: 8, sky: 1, scatter: 0.15 }, grade: { sat: 0.6, con: 0.36, lift: 0x0a0e18, gain: 0xf0f4ff }, exp: 0.86 } },
};
const SNOW_TERRAIN = { A: ['snow_field_aerial', 6, 0x8a94a4], B: ['snow_field_aerial', 3, 0x6a7484], C: ['cliff_side', 10, 0x4a4e58], P: 0x7a7c84, rock: [0.4, 0.7], macro: [40, 0.22], nstr: 0.8, rough: [0.75, 0.6], desat: 0.5, bnoise: 0.3, sastrugi: 0.6, haze: [0x4a5468, 0.35, 120, 420], path: 1 };
const ROAD_TERRAIN = lands.castleroad.terrain;
function applyCastleVariant(v) {
  const C = CASTLE[v] || CASTLE[0]; const E = lands.castleroad;
  E.sky = C.sky; E.fogCol = C.fogCol; E.skyCols = C.skyCols; E.exposure = C.exposure;
  E.terrain = v === 2 ? SNOW_TERRAIN : ROAD_TERRAIN;
  E.particles = v === 2 ? [{ kind: 'flake', n: 1600, size: 0.09, vel: [0.6, -1.1, 0.2], var: [0.4, 0.4, 0.4], color: 0xffffff, opacity: 0.85, sway: 0.7 }]
    : v === 1 ? [{ kind: 'dot', n: 400, size: 0.05, vel: [0.3, 0.15, 0.05], var: [0.2, 0.1, 0.2], color: 0xff8a50, opacity: 0.5, sway: 0.5, add: true, glow: 1.6 }]
      : [{ kind: 'dot', n: 300, size: 0.035, vel: [0.1, -0.03, 0.05], var: [0.15, 0.08, 0.15], color: 0xc8ccd8, opacity: 0.22, sway: 0.4 }];
  E.grass = v === 2 ? [] : [{ n: 9000, h: [0.25, 0.6], root: 0x1e2016, tip: v === 1 ? 0x7a5a3a : 0x5a5a3a, r: [16, 80], dry: 0x8a7a5a, density: (ctx, x, z) => (lineDist(ctx.f.road, x, z) < 3 || inBailey(ctx, x, z, 1) ? 0 : 0.8) }];
  Object.assign(looks.castleroad, C.look);
}
/* the grime the foes carry per land (world.js GRIME_BY_LAND shape: k = rust, mud, soot, frost) */
export const grime = {
  paddies: { k: [0.05, 0.75, 0.1, 0], mud: 0x2a2418, dye: 0x3a3428 },
  castleroad: { k: [0.1, 0.35, 0.3, 0], mud: 0x2a2620, dye: 0x2a2228 },
};
/* exported for the camp and the boss dress */
export { buildLanterns, buildToriis, lanternGeo, toriiGeo, paintMat, plasterMat, stoneMat, woodMat, tileMat, roofGeo, buildKeep };

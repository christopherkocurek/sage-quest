/* Lands: the look of each biome, built by code around the fight.
   One height-field terrain runs from the arena out to 720 m: near rolls, mid-distance mounds, mesas, pools and ridges,
   and far mountain ranges with real ridgelines. A splat shader paints it (two ground textures, rock on slopes, macro
   noise, worn paths, wet patches, lava cracks). Every land has its own layout generator and 2 or 3 seeded variants, so two
   players with the same land get a different frame. The post fog in world.js gives the aerial perspective.
   Assets are Poly Haven (CC0), listed in /assets/real/CREDITS.md. world.js owns the scene; this module fills it.
   each land owns a sky (gradient, cloud speed, storm cells, canopy, aurora, plume glow; the moon or
   sun disc is drawn by world.js), its fog colour (fogCol), strata on rock (cliff_side texture + ledged heights), distance
   haze on the terrain, a specular clamp for wet ground, contact blobs under props, soft ray ribbons (shafts, god rays,
   the lighthouse beam), leaf-cluster crowns, procedural ferns, layered conifers and icosphere standing stones.
   Land materials bind scene.environment explicitly (three r170 ignores envMapIntensity otherwise).
   Fight rules kept here: the ground is flat at y = 0 inside 16 m, nothing solid stands inside 16 m, nothing tall blocks
   the view inside 15 m, and the line toward the nemesis (about 215 m along (30, -84)) stays low and open. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NEMESIS_ANG = Math.atan2(-84, 30);
const NEM_DIST = 215;
const TAU = Math.PI * 2;
const ARENA_R = 16; /* flat and free of solid props inside this radius */
const FRONT = -Math.PI / 2; /* the first view looks down -z */

/* ---------- small helpers ---------- */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi); const b = hash2(xi + 1, yi); const c = hash2(xi, yi + 1); const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) { let s = 0; let a = 0.5; let f = 1; let n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1); n += a; f *= 2.03; a *= 0.5; } return s / n; }
/* ridged noise: sharp crests, the shape of real ridgelines */
function ridged(x, y, oct = 5) { let s = 0; let a = 0.5; let f = 1; let n = 0; let w = 1; for (let i = 0; i < oct; i++) { let v = 1 - Math.abs(vnoise(x * f + i * 31.7, y * f - i * 12.9) * 2 - 1); v *= v; s += a * v * w; w = Math.min(1, v * 1.6); n += a; f *= 2.07; a *= 0.5; } return s / n; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const angOff = (ang, to = NEMESIS_ANG) => Math.abs(wrapA(ang - to));
/* 1 = open land, 0 = inside the nemesis sector */
const sectorK = (ang, half = 0.2) => smooth(half, half + 0.14, angOff(ang));
const polar = (ang, d) => [Math.cos(ang) * d, Math.sin(ang) * d];
/* solid footprints for walk collision (web/src/journey.js): ctx.solids = [{ x, z, r, kind }]. Never touches the rng.
   solidAlong: circles along a local x axis of a piece turned by rot about y (local (lx, lz) -> world as the rubble code). */
function solid(ctx, x, z, r, kind = 'prop') { (ctx.solids || (ctx.solids = [])).push({ x, z, r, kind }); }
function solidAlong(ctx, x, z, rot, pts, r, kind) { const c = Math.cos(rot); const s = Math.sin(rot); for (const [lx, lz = 0] of pts) solid(ctx, x + lx * c + lz * s, z - lx * s + lz * c, r, kind); }
/* distance from a point to a polyline [[x,z],...] */
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax; const dz = bz - az; const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
function lineDist(pts, x, z) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; }
/* a winding path from a start, heading out along an angle */
function windingPath(r, x0, z0, ang, len, step = 6, wob = 0.35) {
  const pts = [[x0, z0]]; let a = ang; let x = x0; let z = z0;
  for (let s = 0; s < len; s += step) { a += (r() - 0.5) * wob; x += Math.cos(a) * step; z += Math.sin(a) * step; pts.push([x, z]); }
  return pts;
}
/* a bump: 1 at the centre, 0 at radius R, smooth */
const bump = (x, z, cx, cz, R) => { const d = Math.hypot(x - cx, z - cz) / R; return d >= 1 ? 0 : (1 - d * d) * (1 - d * d); };

const gltfLoader = new GLTFLoader();
const glbCache = new Map();
const loadModel = (name) => { if (!glbCache.has(name)) glbCache.set(name, gltfLoader.loadAsync(`/assets/real/${name}.glb`)); return glbCache.get(name); };
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function tex(file, srgb) {
  if (!texCache.has(file)) {
    const t = texLoader.load(`/assets/ground/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(file, t);
  }
  return texCache.get(file);
}
const texSet = (id) => id === 'rock' ? { map: tex('rock_diff.jpg', true), normalMap: tex('rock_nor_gl.jpg', false) } : { map: tex(`${id}_diff.jpg`, true), normalMap: tex(`${id}_nor.jpg`, false) };
const pbr = (id) => ({ ...texSet(id), roughnessMap: id === 'rock' ? tex('rock_rough.jpg', false) : tex(`${id}_rough.jpg`, false) });

/* canvas textures drawn once */
const canvasCache = new Map();
function canvasTex(key, w, h, draw) {
  if (canvasCache.has(key)) return canvasCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4;
  canvasCache.set(key, t); return t;
}
/* hanging moss: ragged strands, white = solid */
const mossTex = () => canvasTex('moss', 128, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = rng(77);
  for (let i = 0; i < 70; i++) { const x = r() * w; const len = h * (0.3 + r() * 0.7); g.strokeStyle = `rgba(255,255,255,${0.6 + r() * 0.4})`; g.lineWidth = 1 + r() * 2.5; g.beginPath(); g.moveTo(x, 0); let cx = x; for (let y = 0; y < len; y += 8) { cx += (r() - 0.5) * 3; g.lineTo(cx, y); } g.stroke(); }
});
/* a vine ribbon: a stem with leaves on both sides */
const vineTex = () => canvasTex('vine', 64, 512, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = rng(5);
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); for (let y = 0; y <= h; y += 16) g.lineTo(w / 2 + Math.sin(y * 0.05) * 3, y); g.stroke();
  g.fillStyle = '#fff';
  for (let y = 6; y < h - 6; y += 9 + r() * 8) { const s = r() < 0.5 ? -1 : 1; const len = 10 + r() * 16; g.beginPath(); g.ellipse(w / 2 + s * len * 0.55, y + 3, len * 0.55, 4 + r() * 3, s * 0.5, 0, TAU); g.fill(); }
});

/* ---------- GLSL: shared noise ---------- */
const NOISE = `
float sqH2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sqN2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sqH2(i), sqH2(i + vec2(1.0, 0.0)), f.x), mix(sqH2(i + vec2(0.0, 1.0)), sqH2(i + vec2(1.0, 1.0)), f.x), f.y); }
float sqF2(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * sqN2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.1, 1.7); a *= 0.5; } return s / 0.9375; }
vec2 sqVor(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.0; float d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = vec2(sqH2(i + g), sqH2(i + g + 17.3)); o = 0.5 + 0.42 * sin(o * 6.2831853); vec2 r = g + o - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1)); }
`;
/* world position + world normal varyings, instancing-aware */
const WORLD_VARY_PARS = 'varying vec3 vW; varying vec3 vWN;';
const WORLD_VARY = `{ vec4 sqWp = vec4(transformed, 1.0); vec3 sqNo = objectNormal;
  #ifdef USE_INSTANCING
  sqWp = instanceMatrix * sqWp; sqNo = mat3(instanceMatrix) * sqNo;
  #endif
  sqWp = modelMatrix * sqWp; vW = sqWp.xyz; vWN = normalize(mat3(modelMatrix) * sqNo); }`;

/* ---------- the terrain material ---------- */
const TERRAIN_FRAG_PARS = `
uniform sampler2D tA; uniform sampler2D nA; uniform sampler2D tB; uniform sampler2D nB; uniform sampler2D tC; uniform sampler2D nC;
uniform vec3 uTile; uniform vec3 colA; uniform vec3 colB; uniform vec3 colC; uniform vec3 colP;
uniform vec4 uRock; uniform vec4 uMisc; uniform vec3 uEmis; uniform vec4 uCrack; uniform vec4 uExtra; uniform float uTime;
uniform float uSpecMax; uniform vec4 uStrata; uniform vec3 uHazeCol; uniform vec3 uHazeP; uniform vec4 uVolc; uniform vec3 uLavaCol;
varying vec3 vW; varying vec3 vWN; varying vec4 vMask;
${NOISE}`;
const TERRAIN_MAP = `
  vec3 sqN0 = normalize(vWN); vec2 sqP = vW.xz;
  float sqMac = sqF2(sqP / uRock.z);
  float sqMac2 = sqN2(sqP / (uRock.z * 0.23) + 13.0);
  #ifdef SQ_TRIA
  /* on slopes the macro noise is projected on the side planes too, or it smears into vertical streaks */
  { vec3 sqAw0 = pow(abs(sqN0), vec3(4.0)); sqAw0 /= (sqAw0.x + sqAw0.y + sqAw0.z + 1e-4);
    if (sqAw0.y < 0.97) { sqMac = sqMac * sqAw0.y + sqF2(vW.xy / uRock.z) * sqAw0.z + sqF2(vW.zy / uRock.z + 5.0) * sqAw0.x;
      sqMac2 = sqMac2 * sqAw0.y + sqN2(vW.xy / (uRock.z * 0.23) + 13.0) * sqAw0.z + sqN2(vW.zy / (uRock.z * 0.23) + 29.0) * sqAw0.x; } }
  #endif
  vec2 sqUA = vec2(sqP.x, -sqP.y) / uTile.x;
  vec2 sqUA2 = mat2(0.8, -0.6, 0.6, 0.8) * sqUA * 0.41 + vec2(0.31, 0.17);
  float sqBA = smoothstep(0.3, 0.7, sqN2(sqP * 0.09 + 3.0));
  vec3 sqTA = mix(texture2D(tA, sqUA).rgb, texture2D(tA, sqUA2).rgb, sqBA);
  vec3 sqNA = mix(texture2D(nA, sqUA).xyz, texture2D(nA, sqUA2).xyz, sqBA) * 2.0 - 1.0;
  vec2 sqUB = vec2(sqP.x, -sqP.y) / uTile.y;
  vec3 sqTB = texture2D(tB, sqUB).rgb; vec3 sqNB = texture2D(nB, sqUB).xyz * 2.0 - 1.0;
  float sqSl = 1.0 - sqN0.y;
  float sqRk = smoothstep(uRock.x, uRock.y, sqSl + (sqMac2 - 0.5) * 0.12);
  vec3 sqAw = pow(abs(sqN0), vec3(4.0)); sqAw /= (sqAw.x + sqAw.y + sqAw.z + 1e-4);
  #ifdef SQ_TRIA
  { float sqTk = smoothstep(0.1, 0.3, sqSl);
    if (sqTk > 0.01) {
      /* one triplanar fetch pair, shared by A and B (frost uses the same snow for both; B only differs in tint) */
      vec3 sqTa = texture2D(tA, vW.zy / uTile.x).rgb * sqAw.x + texture2D(tA, vW.xy / uTile.x).rgb * sqAw.z + sqTA * sqAw.y;
      vec3 sqTb = sqTa - sqTA * sqAw.y + sqTB * sqAw.y;
      sqTA = mix(sqTA, sqTa, sqTk); sqTB = mix(sqTB, sqTb, sqTk); sqNA = mix(sqNA, vec3(0.0, 0.0, 1.0), sqTk * 0.7); } }
  #endif
  /* rock: triplanar, only where the slope shows it */
  vec3 sqTC = vec3(0.5); vec3 sqPC = vec3(0.0);
  if (sqRk > 0.003) {
    vec2 sqU1 = vec2(vW.z, vW.y) / uTile.z; vec2 sqU2 = vec2(vW.x, vW.y) / uTile.z; vec2 sqU3 = vec2(sqP.x, -sqP.y) / uTile.z;
    sqTC = texture2D(tC, sqU1).rgb * sqAw.x + texture2D(tC, sqU2).rgb * sqAw.z + texture2D(tC, sqU3).rgb * sqAw.y;
    vec3 sqC1 = texture2D(nC, sqU1).xyz * 2.0 - 1.0; vec3 sqC2 = texture2D(nC, sqU2).xyz * 2.0 - 1.0; vec3 sqC3 = texture2D(nC, sqU3).xyz * 2.0 - 1.0;
    sqPC = vec3(0.0, sqC1.y, sqC1.x) * sqAw.x + vec3(sqC2.x, sqC2.y, 0.0) * sqAw.z + vec3(sqC3.x, 0.0, -sqC3.y) * sqAw.y; }
  float sqBk = clamp(vMask.y + uExtra.y * smoothstep(0.45, 0.62, sqMac * 0.5 + sqMac2 * 0.5), 0.0, 1.0);
  vec3 sqAlb = mix(sqTA * colA, sqTB * colB, sqBk);
  float sqPath = clamp(vMask.x * uExtra.z, 0.0, 1.0);
  sqAlb = mix(sqAlb, sqTA * colP, sqPath);
  /* strata: layered bands on rock faces, warped so they wander like real beds */
  vec3 sqRockC = sqTC * colC;
  if (uStrata.y > 0.0 && sqRk > 0.003) { float sqSy = vW.y * uStrata.x + (sqN2(sqP * 0.025 + 3.0) - 0.5) * uStrata.z + sqN2(sqP * 0.11) * 0.6;
    float sqBand = sqN2(vec2(sqSy, 0.5)) * 0.65 + sqN2(vec2(sqSy * 3.1, 2.5)) * 0.35;
    float sqLedge = smoothstep(0.08, 0.0, abs(fract(sqSy * 0.5) - 0.5) - 0.42);
    sqRockC *= 1.0 + (sqBand - 0.5) * 1.4 * uStrata.y - sqLedge * 0.35 * uStrata.y;
    sqRockC = mix(sqRockC, sqRockC * vec3(1.12, 0.96, 0.86), smoothstep(0.55, 0.8, sqBand) * uStrata.w); }
  sqAlb = mix(sqAlb, sqRockC, sqRk);
  sqAlb *= 1.0 + (sqMac - 0.5) * 2.0 * uRock.w + (sqMac2 - 0.5) * uRock.w * 0.6;
  vec3 sqLava = vec3(0.0);
  #ifdef SQ_CRACK
  { float sqPatch = sqN2(sqP * 0.07 + 7.0) * 0.6 + sqN2(sqP * 0.23) * 0.4;
    float sqAr = smoothstep(16.0, 34.0, length(sqP));
    float sqCk = clamp(vMask.z * smoothstep(0.25, 0.6, sqPatch + vMask.z * 0.3) + uCrack.x * smoothstep(0.55, 0.72, sqPatch), 0.0, 1.0) * (1.0 - sqRk * 0.85) * smoothstep(16.0, 19.0, length(sqP));
    sqLava = uEmis * vMask.w * uCrack.w * 0.85;
    if (sqCk > 0.004) {
    vec2 sqWq = sqP / uCrack.y; sqWq += (vec2(sqF2(sqWq * 0.35), sqF2(sqWq * 0.35 + 9.1)) - 0.5) * 1.4;
    vec2 sqVo = sqVor(sqWq); vec2 sqVo2 = sqVor(sqWq * 2.7 + 3.3);
    float sqWn = sqN2(sqWq * 0.45 + 2.0) * 0.7 + sqN2(sqWq * 1.7) * 0.3;
    float sqW = uCrack.z * (0.12 + 2.2 * sqWn * sqWn);
    float sqLine = 1.0 - smoothstep(0.0, sqW, sqVo.y);
    float sqHair = (1.0 - smoothstep(0.0, uCrack.z * 0.18, sqVo2.y)) * smoothstep(0.55, 0.75, sqN2(sqWq * 0.9 + 4.0));
    float sqOn = smoothstep(0.3, 0.55, sqN2(sqWq * 0.6 + 1.0) + sqCk * 0.3);
    sqLine *= sqOn; sqHair *= sqOn;
    float sqCore = 1.0 - smoothstep(0.0, sqW * 0.35, sqVo.y);
    float sqWide = smoothstep(0.5, 0.85, sqWn);
    float sqHalo = (1.0 - smoothstep(0.0, uCrack.z * 5.0, sqVo.y)) * sqOn * sqWide;
    sqAlb *= 1.0 - (max(sqLine, sqHair * 0.8) * 0.85 + sqHalo * 0.4) * sqCk;
    float sqPulse = 0.8 + 0.2 * sin(uTime * 1.4 + sqN2(sqP * 0.15) * 12.0);
    sqLava = uEmis * (sqLine * sqWide * (0.35 + 1.3 * sqCore) + sqHalo * 0.07) * sqCk * sqPulse * mix(0.25, 1.0, sqAr) + uEmis * vMask.w * uCrack.w * (0.7 + 0.3 * sqPulse); } }
  #endif
  #ifdef SQ_VOLC
  { vec2 sqVd = sqP - uVolc.xy; float sqDv = length(sqVd); float sqA = atan(sqVd.y, sqVd.x); float sqR = uVolc.z;
    if (sqDv < sqR) {
      float sqWarp = sqF2(vec2(sqDv * 0.012, sqA * 1.7)) * 3.2 + sqN2(vec2(sqDv * 0.05, sqA * 4.0)) * 0.6;
      float sqS = abs(sin(sqA * 4.0 + sqWarp));
      float sqWid = 0.06 + 0.05 * sqN2(vec2(sqDv * 0.03, sqA));
      float sqStream = smoothstep(1.0 - sqWid, 1.0 - sqWid * 0.25, sqS) * smoothstep(sqR * 0.97, sqR * 0.5, sqDv) * smoothstep(sqR * 0.06, sqR * 0.14, sqDv);
      float sqFlow = sqF2(vec2(sqA * 26.0 + sqWarp * 3.0, sqDv * 0.09 - uTime * 0.35)) ;
      float sqCrust = smoothstep(0.55, 0.75, sqFlow);
      float sqCrat = smoothstep(sqR * 0.12, sqR * 0.04, sqDv);
      float sqHot = sqStream * (1.0 - sqCrust * 0.75) * (0.55 + 0.6 * sqFlow) + sqCrat * 1.4;
      sqAlb = mix(sqAlb, sqAlb * 0.35, smoothstep(0.0, 0.4, sqStream));
      sqLava += uLavaCol * sqHot * mix(1.0, 0.45, smoothstep(sqR * 0.2, sqR * 0.95, sqDv)); } }
  #endif
  float sqLum = dot(sqAlb, vec3(0.299, 0.587, 0.114)); sqAlb = mix(sqAlb, vec3(sqLum), uMisc.z);
  diffuseColor.rgb *= sqAlb;
`;
const TERRAIN_NORMAL = `
  vec3 sqPert = mix(mix(vec3(sqNA.x, 0.0, -sqNA.y), vec3(sqNB.x, 0.0, -sqNB.y), sqBk), sqPC, sqRk);
  #ifdef SQ_SASTRUGI
  if (sqRk < 0.97 && length(vW - cameraPosition) < 70.0) { vec2 sqQ = mat2(0.94, 0.34, -0.34, 0.94) * sqP * vec2(0.3, 1.9);
    float s0 = sqN2(sqQ) * 0.7 + sqN2(sqQ * 2.1) * 0.3; float sx = sqN2(sqQ + vec2(0.06, 0.0)) * 0.7 + sqN2(sqQ * 2.1 + vec2(0.126, 0.0)) * 0.3; float sz = sqN2(sqQ + vec2(0.0, 0.06)) * 0.7 + sqN2(sqQ * 2.1 + vec2(0.0, 0.126)) * 0.3;
    float sqMacW = smoothstep(0.3, 0.7, sqMac);
    sqPert += vec3(-(sx - s0), 0.0, -(sz - s0)) * 9.0 * uExtra.x * (1.0 - sqRk) * (0.4 + 0.6 * sqMacW) * smoothstep(70.0, 50.0, length(vW - cameraPosition)); }
  #endif
  vec3 sqWn = normalize(sqN0 + sqPert * uMisc.x);
  normal = normalize((viewMatrix * vec4(sqWn, 0.0)).xyz);
`;
function terrainMaterial(T) {
  const A = texSet(T.A[0]); const B = texSet(T.B[0]); const C = texSet(T.C[0]);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: T.env ?? 0.15 });
  const U = {
    tA: { value: A.map }, nA: { value: A.normalMap }, tB: { value: B.map }, nB: { value: B.normalMap }, tC: { value: C.map }, nC: { value: C.normalMap },
    uTile: { value: new THREE.Vector3(T.A[1], T.B[1], T.C[1]) },
    colA: { value: new THREE.Color(T.A[2]) }, colB: { value: new THREE.Color(T.B[2]) }, colC: { value: new THREE.Color(T.C[2]) }, colP: { value: new THREE.Color(T.P ?? T.A[2]) },
    uRock: { value: new THREE.Vector4(T.rock?.[0] ?? 0.25, T.rock?.[1] ?? 0.5, T.macro?.[0] ?? 40, T.macro?.[1] ?? 0.25) },
    uMisc: { value: new THREE.Vector4(T.nstr ?? 1, T.rough?.[1] ?? 0.9, T.desat ?? 0.2, T.rough?.[0] ?? 0.95) },
    uEmis: { value: new THREE.Color(T.emis ?? 0).multiplyScalar(T.emisK ?? 3) },
    uCrack: { value: new THREE.Vector4(T.crack?.[0] ?? 0, T.crack?.[1] ?? 2, T.crack?.[2] ?? 0.05, T.crack?.[3] ?? 0) },
    uExtra: { value: new THREE.Vector4(T.sastrugi ?? 0, T.bnoise ?? 0, T.path ?? 1, T.canopy ?? 0) },
    uTime: { value: 0 },
    uSpecMax: { value: T.specMax ?? 50 },
    uStrata: { value: new THREE.Vector4(...(T.strata || [0.45, 0, 2.5, 0])) },
    uHazeCol: { value: new THREE.Color(T.haze?.[0] ?? 0) }, uHazeP: { value: new THREE.Vector3(T.haze?.[1] ?? 0, T.haze?.[2] ?? 150, T.haze?.[3] ?? 500) },
    uVolc: { value: new THREE.Vector4(0, 0, 1, 1) }, uLavaCol: { value: new THREE.Color(T.lavaCol ?? 0xff4a10).multiplyScalar(T.lavaK ?? 3) },
  };
  mat.userData.terrain = U;
  mat.defines = {}; if (T.crack) mat.defines.SQ_CRACK = ''; if (T.sastrugi) mat.defines.SQ_SASTRUGI = ''; if (T.canopy) mat.defines.SQ_CANOPY = ''; if (T.tri) mat.defines.SQ_TRIA = ''; if (T.volc) mat.defines.SQ_VOLC = '';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nattribute vec4 aMask; varying vec4 vMask; ${WORLD_VARY_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvMask = aMask; ${WORLD_VARY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${TERRAIN_FRAG_PARS}`)
      .replace('#include <map_fragment>', TERRAIN_MAP)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(uMisc.w, uMisc.y, sqBk);')
      .replace('#include <normal_fragment_maps>', TERRAIN_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sqLava;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(uSpecMax));
        reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, vec3(0.05 + uSpecMax * 0.5));
        #ifdef SQ_CANOPY
        { float gap = smoothstep(0.6, 0.72, sqF2(vW.xz * 0.05 + 2.0) * 0.7 + sqN2(vW.xz * 0.3) * 0.3); float k = mix(1.0, 0.12 + 0.88 * gap, uExtra.w); reflectedLight.directDiffuse *= k; reflectedLight.directSpecular *= k; }
        #endif`)
      .replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, uHazeCol, uHazeP.x * smoothstep(uHazeP.y, uHazeP.z, length(vW.xz - cameraPosition.xz)));
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `sq-terrain-${!!T.crack}-${!!T.sastrugi}-${!!T.canopy}-${!!T.tri}-${!!T.volc}`;
  return mat;
}

/* ---------- props: world-space (triplanar) stone and wood, moss on top faces ---------- */
const TRI_FRAG_PARS = `uniform float uTileS; uniform vec3 uCover; uniform float uCoverAmt; uniform float uDesat; uniform vec3 uGlowCol; ${WORLD_VARY_PARS} ${NOISE}`;
const TRI_MAP = `
  vec3 sqN0 = normalize(vWN); vec3 sqAw = pow(abs(sqN0), vec3(4.0)); sqAw /= (sqAw.x + sqAw.y + sqAw.z + 1e-4);
  vec2 sqU1 = vW.zy / uTileS; vec2 sqU2 = vW.xy / uTileS; vec2 sqU3 = vW.xz / uTileS;
  vec4 sampledDiffuseColor = texture2D(map, sqU1) * sqAw.x + texture2D(map, sqU2) * sqAw.z + texture2D(map, sqU3) * sqAw.y;
  diffuseColor *= sampledDiffuseColor;
  float sqMacT = sqN2(vW.xz * 0.3 + vW.y * 0.2);
  diffuseColor.rgb *= 0.8 + 0.4 * sqMacT;
  float sqCov = smoothstep(0.35, 0.75, sqN0.y + (sqMacT - 0.5) * 0.5) * uCoverAmt;
  diffuseColor.rgb = mix(diffuseColor.rgb, uCover, sqCov);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), uDesat);
`;
const TRI_NORMAL = `
  { vec3 c1 = texture2D(normalMap, sqU1).xyz * 2.0 - 1.0; vec3 c2 = texture2D(normalMap, sqU2).xyz * 2.0 - 1.0; vec3 c3 = texture2D(normalMap, sqU3).xyz * 2.0 - 1.0;
    vec3 sqPert = vec3(0.0, c1.y, c1.x) * sqAw.x + vec3(c2.x, c2.y, 0.0) * sqAw.z + vec3(c3.x, 0.0, -c3.y) * sqAw.y;
    /* fade the relief out at grazing angles: a back-lit silhouette edge must not sparkle */
    float sqGz = smoothstep(0.0, 0.4, abs(dot(sqN0, normalize(cameraPosition - vW))));
    vec3 sqWn = normalize(sqN0 + sqPert * normalScale.x * (1.0 - sqCov * 0.6) * sqGz);
    normal = normalize((viewMatrix * vec4(sqWn, 0.0)).xyz); }
`;
/* bark relief and moss at the foot of trunks: object-space height (unit-height geometry) */
const TRI_BASE = `
  #ifdef SQ_BASEMOSS
  { float sqBy = vObjY; float sqSide = 0.5 + 0.5 * dot(normalize(vWN.xz + 1e-4), vec2(0.6, 0.8));
    float sqStreak = (sqN2(vec2(vW.x * 1.5, vW.y * 0.6)) * sqAw.z + sqN2(vec2(vW.z * 1.5 + 7.0, vW.y * 0.6)) * sqAw.x + sqN2(vW.xz * 1.5) * sqAw.y) * 0.6 + sqN2(vW.xz * 2.0 + vW.y * 1.3) * 0.4;
    float sqMk = smoothstep(uBase.y, uBase.y * 0.3, sqBy + (sqStreak - 0.5) * uBase.y * 0.8) * (0.55 + 0.45 * sqSide) * uBase.x;
    diffuseColor.rgb = mix(diffuseColor.rgb, uBaseCol * (0.7 + 0.6 * sqStreak), clamp(sqMk, 0.0, 1.0));
    /* vertical bark furrows: dark grooves that wander up the trunk */
    float sqFur = sqN2(vec2(vW.x * uBase.z, vW.y * 0.3)) * sqAw.z + sqN2(vec2(vW.z * uBase.z + 3.0, vW.y * 0.3)) * sqAw.x + 0.5 * sqAw.y;
    diffuseColor.rgb *= 0.72 + 0.5 * smoothstep(0.25, 0.7, sqFur); }
  #endif
`;
function triMaterial(id, { tint = 0xffffff, tile = 3, cover = null, coverAmt = 0.8, desat = 0.2, rough = 1, nstr = 1.2, side = THREE.FrontSide, specMax = 0.6, base = null } = {}) {
  const set = pbr(id);
  const mat = new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, color: tint, roughness: rough, metalness: 0, envMapIntensity: 0.15, side });
  mat.normalScale.set(nstr, nstr);
  const U = { uTileS: { value: tile }, uCover: { value: new THREE.Color(cover ?? 0) }, uCoverAmt: { value: cover == null ? 0 : coverAmt }, uDesat: { value: desat }, uGlowCol: { value: new THREE.Color(0) }, uSpecMaxT: { value: specMax },
    uBaseCol: { value: new THREE.Color(base?.color ?? 0) }, uBase: { value: new THREE.Vector3(base?.amount ?? 0, base?.h ?? 0.1, base?.furrows ?? 7) } };
  mat.userData.tri = U;
  if (base) mat.defines = { SQ_BASEMOSS: '' };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS} varying float vObjY;`).replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARY} vObjY = position.y;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${TRI_FRAG_PARS} uniform float uSpecMaxT; uniform vec3 uBaseCol; uniform vec3 uBase; varying float vObjY;`)
      .replace('#include <map_fragment>', TRI_MAP + TRI_BASE).replace('#include <normal_fragment_maps>', TRI_NORMAL)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(uSpecMaxT));`);
  };
  mat.customProgramCacheKey = () => `sq-tri${base ? '-base' : ''}`;
  return mat;
}

/* scanned models keep their own UVs: tint, desaturate, moss/snow on top faces */
const COVER_FRAG = `#include <normal_fragment_maps>
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), uDesat);
  { vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    float k = smoothstep(0.42, 0.8, wN.y + (dot(diffuseColor.rgb, vec3(0.33)) - 0.25) * 0.5) * uCoverAmt;
    diffuseColor.rgb = mix(diffuseColor.rgb, uCover, k); roughnessFactor = mix(roughnessFactor, 0.85, k); }`;
let DESAT = 0;
function withCover(mat, color, amount) {
  const uniforms = { uCover: { value: new THREE.Color(color ?? 0) }, uCoverAmt: { value: color == null ? 0 : amount }, uDesat: { value: DESAT } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uCover; uniform float uCoverAmt; uniform float uDesat;').replace('#include <normal_fragment_maps>', COVER_FRAG);
  };
  mat.customProgramCacheKey = () => 'sq-cover';
  return mat;
}
/* glowing cracks in charred surfaces, from world position (works on any mesh, no UVs needed) */
function withEmbers(mat, color, amount = 1, cell = 0.35) {
  const uniforms = { uEmber: { value: new THREE.Color(color).multiplyScalar(2.4 * amount) }, uECell: { value: cell }, uTime: { value: 0 } };
  mat.userData.ember = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform vec3 uEmber; uniform float uECell; uniform float uTime; ${WORLD_VARY_PARS} ${NOISE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec2 q = vec2(vW.x + vW.z * 0.7, vW.y * 1.3 - vW.z * 0.4) / uECell; vec2 vo = sqVor(q);
          float patchy = smoothstep(0.5, 0.75, sqN2(vW.xz * 0.4 + vW.y * 0.6));
          float down = 1.0 - smoothstep(-0.2, 0.6, normalize(vWN).y);
          totalEmissiveRadiance += uEmber * (1.0 - smoothstep(0.0, 0.06, vo.y)) * patchy * (0.5 + 0.5 * down) * (0.75 + 0.25 * sin(uTime * 2.0 + vo.x * 9.0)); }`);
  };
  mat.customProgramCacheKey = () => 'sq-ember';
  return mat;
}
function scanMaterial(src, spec) {
  const m = src.clone();
  if (spec.tint != null && m.color) m.color.multiply(new THREE.Color(spec.tint).multiplyScalar(1.6));
  m.envMapIntensity = 0.18; m.metalness = 0; m.metalnessMap = null;
  if (m.alphaTest > 0 || m.transparent) { m.transparent = false; m.alphaTest = 0.5; m.side = THREE.DoubleSide; } else m.side = THREE.FrontSide;
  withCover(m, spec.cover, spec.coverAmt ?? 1);
  return m;
}
const BARK = { brown: 0xffffff, char: 0x3a3330, grey: 0xb0aaa4, wet: 0x8a8678, pale: 0xd8d0c0, dark: 0x6a5a4c };

/* GPU wind for anything that grows from the ground: the higher the vertex, the more it sways */
function windPatch(mat, amount, { local = 1, prevPatch = null } = {}) {
  const u = mat.userData.wind || { uTime: { value: 0 }, uGrow: { value: 1 } };
  mat.userData.wind = u;
  const prev = prevPatch || mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uGrow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
          ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          #endif
          float k = position.y * position.y * ${local.toFixed(3)};
          transformed.y *= uGrow;
          float gust = 0.6 + 0.4 * sin(uTime * 0.45 + ip.x * 0.03);
          transformed.x += (sin(uTime * 1.6 + ip.x * 0.21 + ip.z * 0.13) * 0.6 + sin(uTime * 3.1 + ip.x * 0.7) * 0.25) * k * ${amount.toFixed(3)} * 5.0 * gust;
          transformed.z += cos(uTime * 1.3 + ip.z * 0.19) * k * ${amount.toFixed(3)} * 2.0 * gust; }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-wind-${amount}-${local}`;
  return mat;
}

/* ---------- geometry makers ---------- */
let uvS = 1;
const scaleUV = (geo, su, sv = su) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; };
function taperTube(points, r0, r1, radial = 7, segs = 10, flare = 0) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position; const uv = geo.attributes.uv;
  const len = curve.getLength(); const c = new THREE.Vector3(); const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; curve.getPointAt(t, c);
    const r = (r0 + (r1 - r0) * t) * (1 + flare * Math.exp(-t * 14));
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
      uv.setXY(k, (j / radial) * Math.max(1, Math.round((TAU * r0 * uvS) / 1.6)), (t * len * uvS) / 1.6);
    }
  }
  geo.computeVertexNormals();
  /* the seam: the first and last vertex of each ring are two copies of one point; give both the same (averaged) normal,
     or a lit trunk shows a hard bright line down its whole height */
  const nor = geo.attributes.normal;
  for (let i = 0; i <= segs; i++) { const a = i * (radial + 1); const b = a + radial; const nx = nor.getX(a) + nor.getX(b); const ny = nor.getY(a) + nor.getY(b); const nz = nor.getZ(a) + nor.getZ(b); const l = Math.hypot(nx, ny, nz) || 1; nor.setXYZ(a, nx / l, ny / l, nz / l); nor.setXYZ(b, nx / l, ny / l, nz / l); }
  return geo;
}
function bend(r, from, dir, len, n, wob) {
  const pts = [from.clone()]; const p = from.clone(); const d = dir.clone().normalize();
  for (let i = 0; i < n; i++) { d.x += (r() - 0.5) * wob; d.z += (r() - 0.5) * wob; d.y += (r() - 0.5) * wob * 0.5; d.normalize(); p.addScaledVector(d, len / n); pts.push(p.clone()); }
  return pts;
}
/* a hanging card from a point: width w, length l, unit-height geometry space */
function hangCard(at, w, l, r) {
  const g = new THREE.PlaneGeometry(w, l, 1, 3); g.translate(0, -l / 2, 0); g.rotateY(r() * Math.PI);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) + y * y * 0.6); }
  g.translate(at.x, at.y, at.z); return g;
}
/* A gnarled dead tree, unit height 1. moss = hanging moss cards. */
function deadTreeGeo(r, { moss = false, roots = 0 } = {}) {
  const parts = []; const cards = [];
  const lean = new THREE.Vector3((r() - 0.5) * 0.35, 1, (r() - 0.5) * 0.35);
  const trunk = bend(r, new THREE.Vector3(0, -0.04, 0), lean, 1, 6, 0.5);
  const R = 0.035 + r() * 0.02;
  parts.push(taperTube(trunk, R, R * 0.22, 8, 12, 1.1));
  const curve = new THREE.CatmullRomCurve3(trunk);
  const nb = 3 + Math.floor(r() * 4);
  for (let b = 0; b < nb; b++) {
    const t = 0.38 + r() * 0.5; const at = curve.getPointAt(t);
    const ang = r() * TAU; const dir = new THREE.Vector3(Math.cos(ang), 0.5 + r() * 0.9, Math.sin(ang));
    const len = (0.22 + r() * 0.3) * (1.1 - t * 0.6);
    const pts = bend(r, at, dir, len, 4, 0.9);
    const br = R * (1 - t * 0.7) * 0.6;
    parts.push(taperTube(pts, br, br * 0.15, 5, 6));
    if (r() < 0.7) { const mid = pts[2]; const d2 = new THREE.Vector3(Math.cos(ang + 1.2), 0.9, Math.sin(ang + 1.2)); const p2 = bend(r, mid, d2, len * 0.5, 3, 1); parts.push(taperTube(p2, br * 0.5, br * 0.08, 4, 4)); }
    if (moss) for (let k = 0; k < 4; k++) { const pt = pts[1 + Math.floor(r() * 3)]; cards.push(hangCard(pt, 0.05 + r() * 0.05, 0.1 + r() * 0.22, r)); }
  }
  /* buttress roots that arch out and dive under the water or mud, and a few knees standing up out of it */
  for (let k = 0; k < roots; k++) { const a = (k / roots) * TAU + r() * 0.7; const o = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); const L2 = 0.1 + r() * 0.1;
    parts.push(taperTube([o.clone().multiplyScalar(R * 0.4).setY(0.05 + r() * 0.04), o.clone().multiplyScalar(R + L2 * 0.45).setY(0.025), o.clone().multiplyScalar(R + L2).setY(-0.03)], R * 0.42, R * 0.1, 5, 6));
    if (r() < 0.5) { const kx = o.x * (R + L2 * 1.3) + (r() - 0.5) * 0.04; const kz = o.z * (R + L2 * 1.3) + (r() - 0.5) * 0.04; parts.push(taperTube([new THREE.Vector3(kx, -0.03, kz), new THREE.Vector3(kx, 0.03 + r() * 0.03, kz)], R * 0.3, R * 0.08, 5, 2)); } }
  const out = { bark: mergeGeometries(parts) };
  if (cards.length) out.moss = mergeGeometries(cards);
  for (const g of [...parts, ...cards]) g.dispose();
  return out;
}
/* A tall straight forest trunk with a root flare, unit height 1. */
function trunkGeo(r, { buttress = false, stubs = false, thin = false, radius = null, radial = 10, roots = null } = {}) {
  const parts = [];
  const pts = bend(r, new THREE.Vector3(0, -0.02, 0), new THREE.Vector3((r() - 0.5) * 0.06, 1, (r() - 0.5) * 0.06), 1, 5, 0.06);
  const R = radius ?? (thin ? 0.011 + r() * 0.006 : 0.022 + r() * 0.01);
  if (stubs) {
    const cv = new THREE.CatmullRomCurve3(pts); const ns = 18;
    for (let i = 0; i < ns; i++) {
      const t = Math.min(0.98, 0.3 + (i / ns) * 0.68 + (r() - 0.5) * 0.02); if (r() < 0.3) continue;
      const at = cv.getPointAt(t); const a = r() * TAU; const len = (0.09 * (1 - t) + 0.012) * (0.5 + r() * 0.9);
      const end = at.clone().add(new THREE.Vector3(Math.cos(a) * len, -len * (0.25 + r() * 0.3), Math.sin(a) * len));
      const mid = at.clone().lerp(end, 0.5); mid.y += len * 0.08;
      parts.push(taperTube([at, mid, end], R * 0.2 * (1 - t * 0.5), R * 0.03, 4, 2));
    }
  }
  parts.push(taperTube(pts, R, R * 0.5, radial, 10, buttress ? 1.8 : 0.9));
  const nRoots = roots ?? (buttress ? 6 : 4);
  for (let i = 0; i < nRoots; i++) {
    const a = (i / nRoots) * TAU + r() * 0.6;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const top = new THREE.Vector3(0, (buttress ? 0.06 : 0.025) + r() * 0.03, 0).addScaledVector(out, R * 0.6);
    const foot = new THREE.Vector3(0, -0.012, 0).addScaledVector(out, R * (buttress ? 4 + r() * 3 : 2.5 + r() * 2));
    const mid = top.clone().lerp(foot, 0.5); mid.y += 0.008;
    parts.push(taperTube([top, mid, foot], R * (buttress ? 0.5 : 0.38), R * 0.08, 5, 6));
  }
  const res = { bark: mergeGeometries(parts) };
  for (const g of parts) g.dispose();
  return res;
}
/* Headstones: arch, cross, slab. Unit height 1. */
function graveGeo(r) {
  const kind = Math.floor(r() * 3); const s = new THREE.Shape();
  if (kind === 0) { const w = 0.32 + r() * 0.1; s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, 0.72); s.absarc(0, 0.72, w, 0, Math.PI, false); s.lineTo(-w, 0); }
  else if (kind === 1) { const a = 0.07; s.moveTo(-a, 0); s.lineTo(a, 0); s.lineTo(a, 0.62); s.lineTo(0.3, 0.62); s.lineTo(0.3, 0.76); s.lineTo(a, 0.76); s.lineTo(a, 1); s.lineTo(-a, 1); s.lineTo(-a, 0.76); s.lineTo(-0.3, 0.76); s.lineTo(-0.3, 0.62); s.lineTo(-a, 0.62); s.lineTo(-a, 0); }
  else { const w = 0.3; s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, 0.88); s.lineTo(w * 0.6, 1); s.lineTo(-w * 0.55, 0.97); s.lineTo(-w, 0.84); s.lineTo(-w, 0); }
  const geo = new THREE.ExtrudeGeometry(s, { depth: kind === 1 ? 0.12 : 0.14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, -0.12, -0.07);
  return geo;
}
/* A rough block with chipped corners: the base of standing stones, ruins and rubble. Size 1, base at y = 0. */
function chunkGeo(r, { w = 1, h = 1, d = 1, chip = 0.18, seg = 3, taper = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg * 2, seg); g.translate(0, h / 2, 0);
  const p = g.attributes.position; const sx = r() * 50; const sz = r() * 50;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i); const y = p.getY(i); let z = p.getZ(i);
    const t = y / h; const k = 1 - taper * t; x *= k; z *= k;
    const n = vnoise(x * 3 + sx, y * 3 + z * 2) - 0.5; const n2 = vnoise(z * 5 + sz, y * 4 + x * 3) - 0.5;
    const edge = (Math.abs(x) / (w / 2)) * (Math.abs(z) / (d / 2));
    p.setXYZ(i, x * (1 + n * chip) - Math.sign(x) * edge * chip * 0.3 * w, y * (1 + n2 * chip * 0.4) + (y > h * 0.9 ? n * chip * h * 0.6 : 0), z * (1 + n2 * chip) - Math.sign(z) * edge * chip * 0.3 * d);
  }
  g.computeVertexNormals(); return g;
}
/* A thick ruined wall: courses of stone 0.8 m deep, a broken top, an arched window. Metres (not unit). */
function ruinWallGeo(r, L = 8, H = 5, D = 0.8) {
  const s = new THREE.Shape(); s.moveTo(-L / 2, 0); s.lineTo(L / 2, 0);
  const steps = 14;
  for (let i = 0; i <= steps; i++) { const x = L / 2 - (i / steps) * L; const y = H * (0.45 + 0.55 * Math.max(0, Math.sin(i * 0.55 + r() * 2.5)) * (0.6 + 0.4 * r())); s.lineTo(x, clamp(y, H * 0.3, H)); }
  s.lineTo(-L / 2, 0);
  const hole = new THREE.Path(); const hx = (r() - 0.5) * L * 0.3; const hw = 0.55 + r() * 0.3;
  hole.moveTo(hx - hw, H * 0.22); hole.lineTo(hx + hw, H * 0.22); hole.lineTo(hx + hw, H * 0.45); hole.absarc(hx, H * 0.45, hw, 0, Math.PI, false); hole.lineTo(hx - hw, H * 0.22);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1, curveSegments: 8, steps: 1 });
  g.translate(0, -0.25, -D / 2);
  return g;
}
/* A broken round tower: an open cylinder with a jagged top and wall thickness. Unit height 1. */
function towerGeo(r) {
  /* sixteen flat faces, ashlar
     courses that step in and out per block (a hashed radial offset per block, held flat across it), a belt course every
     fifth of the height, three tall slit windows pressed into the wall, and the jagged break on top as before */
  const SEG = 16; const ROWS = 40;
  const geo = new THREE.CylinderGeometry(0.16, 0.18, 1, SEG, ROWS, true);
  geo.translate(0, 0.5, 0);
  const p = geo.attributes.position;
  const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i); const x = p.getX(i); const z = p.getZ(i);
    const a = Math.atan2(z, x); const fa = ((a / TAU) + 1) % 1;
    const row = Math.min(ROWS - 1, Math.floor(y * ROWS + 1e-4)); const col = Math.floor(fa * SEG + (row % 2) * 0.5 + 1e-4) % SEG;
    let k = 1 + (hsh(row, col) - 0.5) * 0.05;
    const yb = (y * 5) % 1; if (y > 0.1 && (yb < 0.035 || yb > 0.975)) k += 0.045; /* belt courses */
    for (const wa of [0.4, 2.5, 4.4]) { const da = Math.abs(Math.atan2(Math.sin(a - wa), Math.cos(a - wa))); if (da < 0.12 && y > 0.18 && y < 0.5) k -= 0.09 * (1 - da / 0.12); } /* slit windows */
    p.setX(i, x * k); p.setZ(i, z * k);
    if (y < 0.55) continue;
    const cut = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(a * 2 + 1.3)) * (0.6 + 0.4 * vnoise(a * 3 + 10, 2));
    y = Math.min(y, cut); y = Math.floor(y * ROWS) / ROWS + (hsh(col, 9) < 0.5 ? 0 : 0.5 / ROWS); /* the break steps along the courses */
    p.setY(i, Math.min(p.getY(i), y));
  }
  geo.computeVertexNormals();
  const inner = geo.clone(); inner.scale(0.84, 1, 0.84);
  const ip = inner.index.array; for (let i = 0; i < ip.length; i += 3) { const t = ip[i]; ip[i] = ip[i + 2]; ip[i + 2] = t; }
  const g = mergeGeometries([geo, inner]); g.computeVertexNormals(); geo.dispose(); inner.dispose();
  return g;
}
/* One grass or reed blade, unit height 1. */
function bladeGeo(segs = 4, width = 0.05) {
  const pos = []; const uv = []; const idx = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; const w = width * (1 - t * 0.92); const bendZ = t * t * 0.25; pos.push(-w, t, bendZ, w, t, bendZ); uv.push(0, t, 1, t); }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0.25]), 3));
  g.setIndex(idx);
  return g;
}
function tuftGeo(r, blades = 5, width = 0.04, spread = 0.1) {
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const b = bladeGeo(3, width); b.scale(1, 0.6 + r() * 0.5, 1); b.rotateX(-(0.08 + r() * 0.4)); b.rotateY(r() * TAU); b.translate((r() - 0.5) * spread, 0, (r() - 0.5) * spread);
    parts.push(b);
  }
  const g = mergeGeometries(parts); for (const p of parts) p.dispose();
  return g;
}
/* a heather or low-shrub clump: many short twigs in a dome, unit height 1 */
function shrubGeo(r, n = 26) {
  const parts = [];
  for (let i = 0; i < n; i++) { const b = bladeGeo(2, 0.09); const a = r() * TAU; const lean = 0.3 + r() * 0.9; b.scale(1, 0.5 + r() * 0.5, 1); b.rotateX(-lean); b.rotateY(a); b.translate((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5); parts.push(b); }
  const g = mergeGeometries(parts); for (const p of parts) p.dispose(); return g;
}
/* a leafy crown: a lumpy sphere, unit radius. The leaf shader cuts a ragged edge. */
function crownGeo(r, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail); const p = g.attributes.position; const sx = r() * 40;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const n = fbm(x * 1.4 + sx, z * 1.4 + y * 1.1, 3); const k = 0.72 + n * 0.6; p.setXYZ(i, x * k, y * k * (y < 0 ? 0.55 : 0.9), z * k); }
  g.computeVertexNormals(); return g;
}
/* a clump of foliage: many leaf-cluster cards in an ellipsoid, normals point out from the centre so it shades as a soft mass */
const leafTex = () => canvasTex('leaves', 256, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = rng(31); g.fillStyle = '#fff';
  for (let i = 0; i < 90; i++) { const a = r() * TAU; const d = Math.sqrt(r()) * w * 0.42; const x = w / 2 + Math.cos(a) * d; const y = h / 2 + Math.sin(a) * d; const L = 9 + r() * 14; g.save(); g.translate(x, y); g.rotate(r() * TAU); g.beginPath(); g.ellipse(0, 0, L, L * 0.42, 0, 0, TAU); g.fill(); g.restore(); }
});
function clumpGeo(r, n = 60, size = 0.55, flat = 0.6) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const q = new THREE.PlaneGeometry(size * (0.7 + r() * 0.6), size * (0.7 + r() * 0.6));
    q.rotateX(r() * TAU); q.rotateY(r() * TAU); q.rotateZ(r() * TAU);
    const u = r() * 2 - 1; const a = r() * TAU; const rad = Math.pow(r(), 0.4) * 0.85; const s1 = Math.sqrt(1 - u * u);
    q.translate(Math.cos(a) * s1 * rad, u * rad * flat, Math.sin(a) * s1 * rad); parts.push(q);
  }
  const g = mergeGeometries(parts); for (const p of parts) p.dispose();
  const pos = g.attributes.position; const nor = g.attributes.normal; const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); v.y /= flat; v.y += 0.35; v.normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
/* a sprig of pointed leaves on a stem: the alpha of one leaf-cluster card (soft edges, no blotches) */
const sprigTex = () => canvasTex('sprig', 128, 128, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = rng(17); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.5, h * 0.98); g.quadraticCurveTo(w * 0.52, h * 0.5, w * 0.47, h * 0.08); g.stroke();
  for (let i = 0; i < 9; i++) { const t = 0.12 + i * 0.095; const y = h * (0.98 - t * 0.9); const s = i % 2 ? 1 : -1; const L = w * (0.24 + 0.16 * Math.sin(t * Math.PI)) * (0.85 + r() * 0.3);
    g.save(); g.translate(w * 0.5, y); g.rotate(s * (0.9 + r() * 0.35) - Math.PI / 2 * 0); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.45, -L * 0.34, L, 0); g.quadraticCurveTo(L * 0.45, L * 0.34, 0, 0); g.fill(); g.restore(); }
  g.beginPath(); g.ellipse(w * 0.47, h * 0.1, w * 0.05, h * 0.09, 0, 0, TAU); g.fill();
});
/* A crown of branch-end clusters: each end holds `per` small sprig cards; normals are projected from the crown centre,
   so the mass shades as one soft volume. Vertex colours carry a 3-tone gradient (inside and below dark, tops lit). */
function crownClusterGeo(r, { ends = 9, per = 44, size = 0.13, spread = 0.26, flat = 0.62, tones = [0x1d2f1f, 0x3c5a35, 0x7a9a5a] } = {}) {
  const parts = []; const c0 = new THREE.Color(tones[0]); const c1 = new THREE.Color(tones[1]); const c2 = new THREE.Color(tones[2]); const c = new THREE.Color();
  for (let e = 0; e < ends; e++) {
    const u = 0.15 + r() * 0.85; const a = r() * TAU; const rad = 0.55 + r() * 0.35; const s1 = Math.sqrt(1 - u * u);
    const ex = Math.cos(a) * s1 * rad; const ey = u * rad * flat; const ez = Math.sin(a) * s1 * rad;
    for (let i = 0; i < per; i++) {
      const sz = size * (0.7 + r() * 0.6);
      const q = new THREE.PlaneGeometry(sz, sz); q.rotateX(r() * TAU); q.rotateY(r() * TAU); q.rotateZ(r() * TAU);
      const ox = (r() - 0.5) * 2 * spread; const oy = (r() - 0.5) * 2 * spread * 0.7; const oz = (r() - 0.5) * 2 * spread;
      q.translate(ex + ox, ey + oy, ez + oz);
      const lit = clamp((ey + oy) / (rad * flat) * 0.6 + 0.4 + Math.hypot(ex + ox, ez + oz) * 0.3, 0, 1) * (0.75 + r() * 0.35);
      if (lit < 0.5) c.copy(c0).lerp(c1, lit / 0.5); else c.copy(c1).lerp(c2, (lit - 0.5) / 0.5);
      const col = new Float32Array(q.attributes.position.count * 3); for (let k = 0; k < q.attributes.position.count; k++) col.set([c.r, c.g, c.b], k * 3);
      q.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(q);
    }
  }
  const g = mergeGeometries(parts); for (const p of parts) p.dispose();
  const pos = g.attributes.position; const nor = g.attributes.normal; const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); v.y /= flat; v.y += 0.25; v.normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
function leafClusterMaterial(mul = 0xffffff, { rough = 0.8, trans = 0x000000 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: mul, vertexColors: true, roughness: rough, metalness: 0, envMapIntensity: 0.08, alphaMap: sprigTex(), alphaTest: 0.42, side: THREE.DoubleSide });
  mat.alphaMap.wrapT = THREE.ClampToEdgeWrapping;
  const U = { uTrans: { value: new THREE.Color(trans) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTrans;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal); nonPerturbedNormal = normal;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directSpecular *= 0.0; reflectedLight.indirectSpecular *= 0.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uTrans * diffuseColor.rgb * (1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))));');
  };
  mat.customProgramCacheKey = () => 'sq-leafcl';
  return mat;
}
/* a fern frond strip: a central rib with leaflets, white = solid */
const frondTex = () => canvasTex('frond', 64, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 2); g.stroke();
  for (let y = h - 14; y > 6; y -= 7) { const t = y / h; const L = (w * 0.48) * Math.min(1, t * 1.6) * (0.55 + 0.45 * Math.sin(t * Math.PI));
    for (const s of [-1, 1]) { g.save(); g.translate(w / 2, y); g.rotate(s * 1.15); g.beginPath(); g.ellipse(L * 0.5, 0, L * 0.5, 2.6, 0, 0, TAU); g.fill(); g.restore(); } }
});
/* a fern: fronds that arc up and out from the crown, unit height 1 */
function fernGeo(r, fronds = 9, arch = 0.6) {
  const parts = [];
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * TAU + r() * 0.5; const L = 0.85 + r() * 0.35; const up = 0.55 + r() * 0.35 * arch; const segs = 6;
    const g = new THREE.PlaneGeometry(0.34, L, 1, segs); g.translate(0, L / 2, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / L; const ang = (1 - up) * 0.4 + t * (1.25 - up * 0.6); const rr = Math.sin(ang) * L * t; const yy = Math.cos(ang) * L * t - t * t * L * 0.35 * (1 - up);
      p.setXYZ(k, p.getX(k) * (1 - t * 0.6), yy, rr); }
    g.rotateY(a); parts.push(g);
  }
  const g = mergeGeometries(parts); for (const p of parts) p.dispose();
  let maxY = 0; const p = g.attributes.position; for (let k = 0; k < p.count; k++) maxY = Math.max(maxY, p.getY(k)); g.scale(1 / maxY, 1 / maxY, 1 / maxY);
  g.computeVertexNormals(); return g;
}
/* a conifer of layered skirts, unit height 1: a thin trunk and 7 to 9 drooping cone cards with ragged needle edges */
const needleTex = () => canvasTex('needles', 256, 128, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = rng(9); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h * 0.45);
  g.strokeStyle = '#fff'; for (let i = 0; i < 260; i++) { const x = r() * w; const L = h * (0.25 + r() * 0.5); g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, h * 0.3); g.lineTo(x + (r() - 0.5) * 6, h * 0.3 + L); g.stroke(); }
});
function coniferGeo(r, layers = 8) {
  /* each kind its own build: slim or broad, a crooked or straight stem, gaps where skirts broke off, a dead top */
  const wide = 0.7 + r() * 0.6; const crook = (r() - 0.5) * 0.06; const sparse = r() * 0.3; const deadTop = r() < 0.3;
  const bark = [taperTube([new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(crook + (r() - 0.5) * 0.02, 0.5, (r() - 0.5) * 0.02), new THREE.Vector3(crook * 1.5 + (r() - 0.5) * 0.02, 1, 0)], 0.014, 0.003, 6, 6, 0.6)];
  const skirts = [];
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1); if (i > 1 && i < layers - 2 && r() < sparse) continue; if (deadTop && t > 0.82) continue;
    const R = (0.05 + 0.3 * Math.pow(1 - t, 1.05) * (0.85 + r() * 0.3)) * wide; const H = 0.16 + 0.06 * (1 - t);
    const g = new THREE.CylinderGeometry(0.004, R, H, 12, 2, true); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k); const y = p.getY(k); const z = p.getZ(k); const a = Math.atan2(z, x); const rr = Math.hypot(x, z); const droop = (rr / R) * (rr / R) * H * 0.35; const wob = 1 + (vnoise(a * 3 + i * 7, i) - 0.5) * 0.35;
      p.setXYZ(k, x * wob, y - droop + (vnoise(a * 5, i * 3) - 0.5) * H * 0.2, z * wob); }
    g.rotateY(r() * TAU); g.translate(crook * (0.14 + t * 0.8) * 1.4, 0.14 + t * 0.8 + H / 2, 0); g.computeVertexNormals(); skirts.push(g);
  }
  if (!deadTop && r() < 0.9) { const g = new THREE.ConeGeometry(0.035, 0.12, 8, 1, true); g.translate(0, 1.0, 0); skirts.push(g); }
  const out = { bark: mergeGeometries(bark), needles: mergeGeometries(skirts) };
  for (const g of [...bark, ...skirts]) g.dispose();
  return out;
}
/* a standing stone: a displaced icosphere slab, flat-ish faces and a worn top. Unit height 1, base at 0. */
function slabGeo(r) {
  const g = new THREE.IcosahedronGeometry(1, 3); const p = g.attributes.position; const sx = r() * 40; const w = 0.3 + r() * 0.08; const d = 0.11 + r() * 0.05; const top = 0.85 + r() * 0.3;
  for (let i = 0; i < p.count; i++) { let x = p.getX(i); let y = p.getY(i); let z = p.getZ(i);
    const n = fbm(x * 1.6 + sx, y * 1.4 + z * 1.2, 3) - 0.5; const facet = (vnoise(x * 3 + sx, z * 3 + y * 2) - 0.5) * 0.12;
    /* push the sphere toward a box: flat faces, squared shoulders, a slanted broken top */
    const bx = Math.sign(x) * Math.pow(Math.abs(x), 0.4); const bz = Math.sign(z) * Math.pow(Math.abs(z), 0.4); let by = Math.sign(y) * Math.pow(Math.abs(y), 0.55);
    if (by > 0) by = by * top + bx * 0.14 + facet * 0.6;
    const k = 1 + n * 0.16 + facet * 0.7;
    p.setXYZ(i, bx * w * 0.8 * k * (1 - Math.max(0, by) * 0.3), (by * 0.5 + 0.5) * (1 + n * 0.06), bz * d * k); }
  g.computeVertexNormals(); return g.toNonIndexed();
}
function leafCardMaterial(color, { tint = 0.35 } = {}) {
  const t = leafTex(); t.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, envMapIntensity: 0.1, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying float vLeafK;`).replace('#include <begin_vertex>', `#include <begin_vertex>\nvLeafK = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vLeafK;`).replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= ${(1 - tint).toFixed(2)} + ${(tint * 2).toFixed(2)} * vLeafK;`);
  };
  mat.customProgramCacheKey = () => 'sq-leafcard';
  return mat;
}
/* Leaf material: lit foliage, a ragged see-through silhouette, light through the leaves at the edges */
function leafMaterial(color, { rough = 0.9, cut = 0.5, scale = 1.6, glow = 0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, envMapIntensity: 0.1, side: THREE.DoubleSide });
  const U = { uCut: { value: cut }, uLeafS: { value: scale }, uGlowK: { value: glow } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uCut; uniform float uLeafS; uniform float uGlowK; ${WORLD_VARY_PARS} ${NOISE}`)
      .replace('#include <map_fragment>', `
        vec3 sqV = normalize(cameraPosition - vW); vec3 sqN = normalize(vWN);
        float sqEdge = 1.0 - abs(dot(sqV, sqN));
        float sqL = sqN2(vW.xz * uLeafS + vW.y * uLeafS * 0.7) * 0.6 + sqN2(vW.zy * uLeafS * 2.3 + vW.x) * 0.4;
        if (sqL < uCut * smoothstep(0.35, 0.95, sqEdge)) discard;
        diffuseColor.rgb *= 0.55 + 0.75 * sqL;`);
  };
  mat.customProgramCacheKey = () => 'sq-leaf';
  return mat;
}

/* ---------- the sky (moon, stars, aurora, clouds, embers) ---------- */
const SKY_FRAG = `
uniform vec3 top; uniform vec3 bottom; uniform vec3 uHorizon; uniform float uLand; uniform float uTime; uniform float uFlash;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunSize; uniform float uSunGlow;
uniform float uStars; uniform float uAurora; uniform vec3 uAuroraCol;
uniform float uClouds; uniform vec3 uCloudCol; uniform vec3 uCloudLit;
uniform float uEmber; uniform vec3 uEmberCol; uniform float uBand; uniform vec3 uBandCol;
uniform float uOwn; uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform float uSkyPow;
uniform float uDisc; uniform float uDiscK; uniform vec3 uHaloCol; uniform float uHalo;
uniform float uCloudSpd; uniform float uCloudLo; uniform float uCells; uniform float uCanopy; uniform vec3 uCanopyCol;
uniform vec3 uBigSunDir; uniform float uBigSun; uniform vec3 uBigSunCol; uniform float uRays;
uniform vec3 uGlowDir; uniform vec3 uGlowCol; uniform float uGlowK;
varying vec3 vP;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vP); float h = d.y;
  vec3 c = mix(bottom, top, pow(clamp(h * 1.6 + 0.08, 0.0, 1.0), 0.7));
  c = mix(c, mix(uHorizon, c, smoothstep(-0.04, 0.3, h)), uLand);
  /* the land's own vertical gradient (zenith colour to horizon colour) */
  vec3 own = mix(uSkyHor, uSkyTop, pow(clamp(h, 0.0, 1.0), uSkyPow));
  c = mix(c, own, uOwn * uLand);
  c += uBandCol * uBand * uLand * exp(-max(h, 0.0) * 7.0) * smoothstep(-0.2, 0.0, h);
  /* a glow in one direction near the horizon (the ash plume's red underside) */
  if (uGlowK > 0.0) { float gd = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uGlowDir.x, 0.0, uGlowDir.z))), 0.0); c += uGlowCol * uGlowK * pow(gd, 18.0) * exp(-max(h - uGlowDir.y, 0.0) * 9.0) * uLand; }
  if (uStars > 0.0) {
    vec3 sp = d * 380.0; vec3 cell = floor(sp); float r = h3(cell);
    vec3 f = fract(sp) - 0.5 - (vec3(h3(cell + 3.1), h3(cell + 7.7), h3(cell + 1.3)) - 0.5) * 0.5;
    float st = step(0.993, r) * smoothstep(0.42, 0.0, length(f) * 2.0) * smoothstep(0.02, 0.3, h);
    float tw = 0.65 + 0.35 * sin(uTime * (1.0 + r * 4.0) + r * 91.0);
    c += vec3(0.8, 0.86, 1.0) * st * tw * uStars * 2.2 * (0.4 + 2.0 * fract(r * 97.0));
  }
  if (uAurora > 0.0) {
    float a = 0.0; float az = atan(d.z, d.x);
    for (int i = 0; i < 3; i++) { float fi = float(i);
      float wave = sin(az * (3.0 + fi) + uTime * 0.05 + fi * 2.1) * 0.08 + n3(vec3(az * 2.0 + fi * 4.0, fi, uTime * 0.03)) * 0.12;
      float base = 0.22 + fi * 0.09 + wave; float y = h - base;
      float base2 = base - n3(vec3(az * 23.0 + fi * 7.0, fi, uTime * 0.04)) * 0.05; float y2 = h - base2; float curtain = smoothstep(-0.11, 0.035, y2) * smoothstep(-0.11, 0.0, y2) * exp(-max(y2, 0.0) * (8.0 - fi * 2.0));
      curtain *= 0.45 + 0.55 * n3(vec3(az * 46.0 + fi * 13.0, uTime * 0.25 + fi, 0.0));
      curtain *= smoothstep(0.25, 0.65, n3(vec3(az * 1.3 - uTime * 0.02, fi * 5.0, 1.0)));
      a += curtain * (1.0 - fi * 0.25); }
    vec3 ac = mix(uAuroraCol, vec3(0.55, 0.25, 0.9), smoothstep(0.3, 0.6, h));
    c += mix(vec3(dot(ac, vec3(0.33))), ac, 0.6) * a * uAurora * 0.7;
  }
  float sd = dot(d, normalize(uSunDir));
  float disk = smoothstep(cos(uSunSize * uDiscK), cos(uSunSize * uDiscK * 0.85), sd);
  c += uSunCol * uLand * (disk * 3.0 * uDisc + uSunGlow * (pow(max(sd, 0.0), 60.0) * 0.8 + pow(max(sd, 0.0), 7.0) * 0.18));
  /* a wide soft halo round the moon (mist) */
  if (uHalo > 0.0) c += uHaloCol * uLand * (pow(max(sd, 0.0), 220.0) * 0.9 + pow(max(sd, 0.0), 28.0) * 0.45 + pow(max(sd, 0.0), 6.0) * 0.12) * uHalo;
  /* a huge low sun with a vertical bleed at the horizon (dusk) */
  float bsd = 0.0; float bdisk = 0.0;
  if (uBigSun > 0.0) {
    bsd = dot(d, normalize(uBigSunDir)); bdisk = smoothstep(cos(uBigSun), cos(uBigSun * 0.96), bsd);
    float lim = 0.75 + 0.25 * smoothstep(cos(uBigSun), 1.0, bsd);
    c = mix(c, uBigSunCol * 2.6 * lim, bdisk * uLand);
    c += uBigSunCol * uLand * (pow(max(bsd, 0.0), 300.0) * 0.9 + pow(max(bsd, 0.0), 24.0) * 0.32 + pow(max(bsd, 0.0), 4.0) * 0.1);
    float az = abs(atan(d.z, d.x) - atan(uBigSunDir.z, uBigSunDir.x)); az = min(az, 6.2831853 - az);
    c += uBigSunCol * uLand * 0.35 * exp(-az * az * 120.0) * exp(-abs(h - uBigSunDir.y) * 10.0);
  }
  if (uClouds > 0.0) {
    vec2 q = d.xz / (max(h, 0.0) + uCloudLo) * 0.85;
    float tt = uTime * uCloudSpd;
    float cl = fbm(vec3(q * 1.3 + vec2(tt * 0.015, tt * 0.006), tt * 0.012));
    float cov = smoothstep(0.62 - uClouds * 0.3, 0.86 - uClouds * 0.2, cl) * smoothstep(-0.05, 0.1, h);
    float lit = pow(max(sd, 0.0), 5.0) * 0.8 + (cl - 0.45) * 0.8 + uFlash * 1.4 * cl;
    vec3 cc = mix(uCloudCol, uCloudLit, clamp(lit, 0.0, 1.0));
    /* storm cells: big cloud masses that light up from inside, one at a time, each on its own clock */
    if (uCells > 0.0) {
      vec2 cq = q * 0.55; vec2 ci = floor(cq); vec2 cf = fract(cq) - 0.5;
      float best = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 g = ci + vec2(float(x), float(y)); float hh = h3(vec3(g, 3.7));
        vec2 o = vec2(float(x), float(y)) + (vec2(h3(vec3(g, 1.1)), h3(vec3(g, 2.3))) - 0.5) * 0.7 - cf;
        float clock = uTime * (0.18 + hh * 0.2) + hh * 17.0; float ph = fract(clock);
        float flick = step(0.93, ph) * (0.6 + 0.4 * sin(uTime * 41.0 + hh * 9.0)) * step(0.35, h3(vec3(g, floor(clock))));
        best = max(best, flick * exp(-dot(o, o) * 5.0));
      }
      cc += vec3(0.75, 0.78, 1.0) * best * uCells * (0.4 + cl) * 1.6;
    }
    cc = mix(cc, uHorizon, smoothstep(0.25, 0.0, h) * 0.6);
    c = mix(c, cc, cov * 0.94);
    c += uSunCol * disk * 0.5 * (1.0 - cov) * uDisc;
    if (uBigSun > 0.0) c += uBigSunCol * bdisk * 1.2 * (1.0 - cov) * uLand;
  }
  if (uEmber > 0.0) c += uEmberCol * uEmber * exp(-max(h, 0.0) * 6.0) * 0.5 * (0.85 + 0.15 * sin(uTime * 1.3 + d.x * 7.0));
  /* a closed canopy overhead: leaf masses with a few torn gaps of night sky */
  if (uCanopy > 0.0) {
    vec2 q = d.xz / (max(h, 0.02) + 0.25);
    float leaf = fbm(vec3(q * 2.2, 3.0)) * 0.7 + n3(vec3(q * 11.0, 1.0)) * 0.3;
    float k = smoothstep(0.05, 0.35, h) * smoothstep(0.3, 0.56, leaf);
    c = mix(c, uCanopyCol, k * uCanopy);
  }
  /* god-ray streaks fanning out of the key's side of the sky (warm dusk through the canopy) */
  if (uRays > 0.0) { float az = atan(d.z, d.x) - atan(uSunDir.z, uSunDir.x); float ray = pow(max(0.0, sin(az * 34.0 + n3(vec3(az * 6.0, 0.0, uTime * 0.05)) * 3.0)), 6.0); c += uSunCol * ray * uRays * pow(max(sd, 0.0), 3.0) * smoothstep(0.0, 0.25, h) * uLand; }
  gl_FragColor = vec4(c, 1.0);
}`;

/* ---------- particles: positions are computed on the GPU ---------- */
const PART_VERT = `
attribute vec4 aSeed; uniform float uTime; uniform float uSize; uniform float uScale; uniform vec3 uCenter; uniform vec3 uBox; uniform vec3 uVel; uniform vec3 uVar; uniform float uSway; uniform float uY0; uniform float uKind;
varying float vA; varying float vS;
void main(){
  vec3 v = uVel + (aSeed.wzx - 0.5) * uVar * 2.0;
  vec3 p = aSeed.xyz * uBox + v * uTime;
  p.x += sin(uTime * 0.9 + aSeed.w * 40.0) * uSway; p.z += cos(uTime * 0.7 + aSeed.y * 30.0) * uSway; p.y += sin(uTime * 1.3 + aSeed.x * 20.0) * uSway * 0.3;
  vec3 rel; rel.xz = mod(p.xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5; rel.y = mod(p.y, uBox.y);
  vec3 wp = vec3(uCenter.x, uY0, uCenter.z) + rel;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uSize * uScale / max(0.1, -mv.z), uKind < 0.5 ? 40.0 : 90.0); /* a near dust mote (kind dot) never grows into a big disc */
  float edge = max(abs(rel.x), abs(rel.z)) / (uBox.x * 0.5);
  vA = (1.0 - smoothstep(0.7, 1.0, edge)) * smoothstep(0.0, 0.08, rel.y / uBox.y) * (1.0 - smoothstep(0.85, 1.0, rel.y / uBox.y));
  if (uKind > 2.5) vA *= pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed.w * 2.0) + aSeed.x * 60.0), 3.0);
  vA *= smoothstep(0.8, 3.0, -mv.z);
  vS = aSeed.w;
}`;
const PART_FRAG = `
uniform vec3 uColor; uniform float uOpacity; uniform float uKind; varying float vA; varying float vS;
void main(){
  vec2 q = gl_PointCoord - 0.5; float a;
  if (uKind > 1.5 && uKind < 2.5) { a = smoothstep(0.5, 0.25, length(q)); }
  else { a = smoothstep(0.5, 0.0, length(q)); a *= a; }
  a *= vA * uOpacity; if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (0.8 + 0.4 * vS), a);
}`;
/* rain as true 1-pixel lines: each drop is a segment along its velocity */
const RAIN_VERT = `
attribute vec4 aSeed; attribute float aEnd; uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform vec3 uVel; uniform float uLen;
varying float vA;
void main(){
  vec3 v = uVel * (0.85 + aSeed.w * 0.3);
  vec3 p = aSeed.xyz * uBox + v * uTime;
  vec3 rel; rel.xz = mod(p.xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5; rel.y = mod(p.y, uBox.y);
  vec3 wp = vec3(uCenter.x, 0.0, uCenter.z) + rel - normalize(v) * uLen * aEnd;
  vec4 mv = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mv;
  float edge = max(abs(rel.x), abs(rel.z)) / (uBox.x * 0.5);
  vA = (1.0 - smoothstep(0.75, 1.0, edge)) * (1.0 - aEnd * 0.85) * smoothstep(0.5, 2.5, -mv.z);
}`;
const RAIN_FRAG = `uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uOpacity); }`;
const KIND_ID = { dot: 0, flake: 2, firefly: 3 };
function particles(spec, world) {
  const rain = spec.kind === 'rain';
  const n = spec.n; const per = rain ? 2 : 1;
  const seeds = new Float32Array(n * per * 4); const ends = new Float32Array(n * per);
  for (let i = 0; i < n; i++) { const s = [Math.random(), Math.random(), Math.random(), Math.random()]; for (let k = 0; k < per; k++) { seeds.set(s, (i * per + k) * 4); ends[i * per + k] = k; } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * per * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  if (rain) geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  const box = spec.box ?? 22;
  const color = new THREE.Color(spec.color); if (spec.add) color.multiplyScalar(spec.glow ?? 2);
  const uniforms = {
    uTime: { value: 0 }, uSize: { value: spec.size ?? 0.1 }, uScale: { value: world.renderer.domElement.height * 0.5 },
    uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(spec.wide ?? 70, box, spec.wide ?? 70) }, uVel: { value: new THREE.Vector3(...spec.vel) },
    uVar: { value: new THREE.Vector3(...(spec.var || [0, 0, 0])) }, uSway: { value: spec.sway ?? 0 }, uY0: { value: spec.y0 ?? 0 }, uLen: { value: spec.len ?? 0.6 },
    uKind: { value: KIND_ID[spec.kind] ?? 0 }, uColor: { value: color }, uOpacity: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: rain ? RAIN_VERT : PART_VERT, fragmentShader: rain ? RAIN_FRAG : PART_FRAG, transparent: true, depthWrite: false,
    blending: spec.add ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms,
  });
  mat.userData.target = spec.opacity ?? 0.9;
  const pts = rain ? new THREE.LineSegments(geo, mat) : new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 3;
  return pts;
}

/* ---------- water ---------- */
/* Still water (fen pools, frozen lake melt): glossy, sky reflection with a moon streak, noise ripples. Depth from the baked height map. */
const WATER_VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FRAG = `
uniform float uTime; uniform vec3 uTint; uniform vec3 uDeep; uniform vec3 uSkyLo; uniform vec3 uSkyHi; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform sampler2D tHeight; uniform float uHalf; uniform float uLevel; uniform float uFade; uniform float uFlash; uniform float uRip;
varying vec3 vW;
${NOISE}
float wh(vec2 p){ return sqN2(p * 0.9 + vec2(uTime * 0.12, uTime * 0.05)) * 0.6 + sqN2(p * 2.3 - vec2(uTime * 0.17, -uTime * 0.09)) * 0.3 + sqN2(p * 6.1 + vec2(0.0, uTime * 0.3)) * 0.1; }
void main(){
  vec2 huv = vW.xz / (uHalf * 2.0) + 0.5;
  float ground = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? texture2D(tHeight, huv).r : -3.0;
  float depth = uLevel - ground;
  if (depth < 0.0) discard;
  float e = 0.08; float h0 = wh(vW.xz); float hx = wh(vW.xz + vec2(e, 0.0)); float hz = wh(vW.xz + vec2(0.0, e));
  float rings = 0.0;
  vec3 n = normalize(vec3(-(hx - h0) / e * uRip, 1.0, -(hz - h0) / e * uRip));
  vec3 v = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 rf = reflect(-v, n);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.5, rf.y));
  vec3 sd = normalize(uSunDir);
  float s = max(dot(rf, sd), 0.0);
  float streak = min(pow(s, 700.0) * 1.6 + pow(s, 80.0) * 0.22 + pow(s, 12.0) * 0.04, 0.55);
  vec3 c = mix(uDeep, uTint, 0.5 + 0.3 * h0);
  c = mix(c, sky, fres);
  c += uSunCol * streak * (0.6 + 0.4 * smoothstep(0.02, 0.2, depth));
  c += uFlash * 0.25 * uSkyHi;
  float a = smoothstep(0.0, 0.18, depth) * 0.82 + 0.1;
  a = max(a, fres * 0.8);
  gl_FragColor = vec4(c, a * uFade);
}`;
/* The open sea: Gerstner waves toward the shore, foam on the crests and a breaking band at the shore. */
const SEA_VERT = `
uniform float uTime; uniform vec2 uDir; uniform float uAmp; uniform sampler2D tHeight; uniform float uHalf; uniform float uLevel;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vDepth;
vec3 gerst(vec2 p, vec2 d, float A, float L, float Q, float sp, inout vec3 T, inout vec3 B){
  float k = 6.2831853 / L; float c = sqrt(9.8 / k) * sp; float f = k * (dot(d, p) - c * uTime);
  float s = sin(f); float co = cos(f);
  T += vec3(-d.x * d.x * Q * A * k * s, d.x * A * k * co, -d.x * d.y * Q * A * k * s);
  B += vec3(-d.x * d.y * Q * A * k * s, d.y * A * k * co, -d.y * d.y * Q * A * k * s);
  return vec3(d.x * Q * A * co, A * s, d.y * Q * A * co);
}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 p = w.xz;
  vec2 huv = p / (uHalf * 2.0) + 0.5;
  float ground = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? texture2D(tHeight, huv).r : -20.0;
  float depth = uLevel - ground; vDepth = depth;
  float shoal = clamp(depth / 4.0, 0.15, 1.0);
  vec3 T = vec3(1.0, 0.0, 0.0); vec3 B = vec3(0.0, 0.0, 1.0); vec3 o = vec3(0.0);
  vec2 d1 = normalize(uDir); vec2 d2 = normalize(uDir + vec2(0.35, -0.2)); vec2 d3 = normalize(uDir + vec2(-0.4, 0.25)); vec2 d4 = normalize(vec2(-uDir.y, uDir.x) * 0.3 + uDir);
  o += gerst(p, d1, 0.55 * uAmp * shoal, 26.0, 0.55, 1.0, T, B);
  o += gerst(p, d2, 0.32 * uAmp * shoal, 14.0, 0.5, 1.0, T, B);
  o += gerst(p, d3, 0.18 * uAmp, 7.5, 0.45, 1.0, T, B);
  o += gerst(p, d4, 0.08 * uAmp, 3.1, 0.4, 1.0, T, B);
  w.xyz += o;
  vCrest = o.y / (uAmp * 1.1 + 0.01);
  vN = normalize(cross(B, T));
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SEA_FRAG = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSkyLo; uniform vec3 uSkyHi; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uFade; uniform float uFlash; uniform vec2 uDir;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vDepth;
${NOISE}
void main(){
  if (vDepth < -0.05) discard;
  vec2 p = vW.xz;
  float e = 0.15; float h0 = sqF2(p * 0.35 + uTime * vec2(0.08, 0.05)); float hx = sqF2((p + vec2(e, 0.0)) * 0.35 + uTime * vec2(0.08, 0.05)); float hz = sqF2((p + vec2(0.0, e)) * 0.35 + uTime * vec2(0.08, 0.05));
  vec3 n = normalize(vN + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.25);
  vec3 v = normalize(cameraPosition - vW);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 rf = reflect(-v, n);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(-0.05, 0.45, rf.y));
  float s = max(dot(rf, normalize(uSunDir)), 0.0);
  vec3 c = mix(uShallow, uDeep, smoothstep(0.5, 8.0, vDepth));
  c += uShallow * 0.6 * smoothstep(0.3, 0.9, vCrest) * (0.5 + 0.5 * max(dot(n, normalize(uSunDir)), 0.0));
  c = mix(c, sky, fres * 0.85);
  c += uSunCol * (pow(s, 400.0) * 3.0 + pow(s, 40.0) * 0.25);
  float fn = sqF2(p * 0.9 + uTime * vec2(0.3, 0.1)) * 0.6 + sqN2(p * 3.5 - uTime * 0.4) * 0.4;
  float crest = smoothstep(0.55, 0.95, vCrest + (fn - 0.5) * 0.9) * smoothstep(0.3, 0.65, sqN2(p * 0.035 + uTime * vec2(0.02, 0.01)) + fn * 0.3);
  float sd = vDepth; float along = dot(p, normalize(uDir));
  float brk = smoothstep(2.2, 0.2, sd) * smoothstep(0.35, 0.75, sin(along * 0.55 - uTime * 1.6 + fn * 4.0 + sqN2(p * 0.05) * 6.0) * 0.5 + 0.5 + fn * 0.3);
  float lace = smoothstep(0.45, 0.0, sd) * (0.5 + 0.5 * fn);
  float foam = clamp(crest * 0.85 + brk + lace, 0.0, 1.0) * smoothstep(0.45, 0.65, fn + 0.25);
  c = mix(c, uFoam * (0.7 + 0.5 * max(dot(n, normalize(uSunDir)), 0.2)), foam);
  c += uFlash * 0.35 * uSkyHi;
  float a = smoothstep(-0.05, 0.25, vDepth);
  gl_FragColor = vec4(c, a * uFade);
}`;

/* ---------- the land generator ---------- */
const tmpM = new THREE.Matrix4(); const tmpQ = new THREE.Quaternion(); const tmpE = new THREE.Euler(); const tmpV = new THREE.Vector3(); const tmpS = new THREE.Vector3();
const easeOutBack = (x) => { const c1 = 1.4; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const STRIDE = 9; /* x y z ry tx tz s sy delay */

/* Parts of a scanned model, normalised to a unit footprint with the base at y = 0. Cached. */
const partCache = new Map();
async function scanParts(name) {
  if (partCache.has(name)) return partCache.get(name);
  const job = loadModel(name).then((g) => {
    g.scene.updateMatrixWorld(true);
    const parts = []; const box = new THREE.Box3();
    g.scene.traverse((o) => { if (o.isMesh) { const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); geo.computeBoundingBox(); box.union(geo.boundingBox); parts.push({ geo, mat: o.material }); } });
    const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z); const height = box.max.y - box.min.y;
    const cx = (box.max.x + box.min.x) / 2; const cz = (box.max.z + box.min.z) / 2;
    for (const p of parts) { p.geo.translate(-cx, -box.min.y, -cz); p.geo.scale(1 / size, 1 / size, 1 / size); }
    return { parts, unitH: height / size };
  });
  partCache.set(name, job);
  return job;
}

/* Knights in a held pose, baked to static geometry (charred dead in the Ashlands, frozen dead in the Frost Pass). Cached per pose. */
const corpseCache = new Map();
async function corpseGeo(clip, t) {
  const key = `${clip}@${t}`;
  if (corpseCache.has(key)) return corpseCache.get(key);
  const job = (async () => {
    const W = await import('./world.js');
    const a = await W.makeActor(W.KNIGHT_URL);
    a.noBlob = true;
    a.look?.({ helm: ['great', 'sallet', 'kettle'][Math.floor(t * 7) % 3], cloak: true, tabard: true, heavy: t > 0.5 });
    if (a.has(clip)) { a.play(clip, { loop: false, fade: 0 }); a.mixer.update(0); a.mixer.update(Math.min(t, a.duration(clip) - 0.01)); }
    a.root.updateMatrixWorld(true);
    const steel = []; const cloth = [];
    a.root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible || /Eyes/.test(o.userData.part || '') || /SQ_Eyes/.test(o.material?.name || '')) return;
      const m = W.bakeSkinned(m0(o)); const g = m.geometry; g.translate(m.position.x, m.position.y, m.position.z);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      (o.material.side === THREE.DoubleSide ? cloth : steel).push(g.index ? g.toNonIndexed() : g);
    });
    a.dispose();
    const out = { steel: steel.length ? mergeGeometries(steel) : null, cloth: cloth.length ? mergeGeometries(cloth) : null };
    for (const g of [out.steel, out.cloth]) if (g) { g.computeVertexNormals(); g.computeBoundingBox(); }
    return out;
  })().catch((e) => { console.warn('corpse bake failed', e); return { steel: null, cloth: null }; });
  corpseCache.set(key, job);
  return job;
}
const m0 = (o) => o;

/* the real footprint radius of a scattered prop: trunks for trees (spec.h = height), the base for scale props */
const TRUNK_K = { deadtree: 0.045, trunk: 0.035, conifer: 0.06 };
function solidRadius(spec, size) {
  if (spec.solidK != null) return Math.max(0.15, size * spec.solidK);
  if (spec.h) return Math.max(0.2, size * (TRUNK_K[spec.p] ?? 0.05));
  return Math.max(0.2, size * 0.36);
}
/* world lands (web/src/worlds/<id>.js `lands`): same shape as LOOKS; ids must not clash with the dark lands */
export function registerLands(table = {}) { for (const [k, v] of Object.entries(table || {})) if (!LOOKS[k]) LOOKS[k] = v; }
export const landKnown = (id) => !!LOOKS[id];

export class Lands {
  constructor(world) {
    this.world = world;
    this.current = null; this.leaving = [];
    this.fogColor = world.col.fog;
    this.skyU = {
      top: { value: world.col.top }, bottom: { value: world.col.bottom }, uHorizon: { value: world.col.fog }, uLand: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 0.3, -1) }, uSunCol: { value: new THREE.Color(0) }, uSunSize: { value: 0.03 }, uSunGlow: { value: 0 },
      uStars: { value: 0 }, uAurora: { value: 0 }, uAuroraCol: { value: new THREE.Color(0x2affb0) },
      uClouds: { value: 0 }, uCloudCol: { value: new THREE.Color(0) }, uCloudLit: { value: new THREE.Color(0) },
      uEmber: { value: 0 }, uEmberCol: { value: new THREE.Color(0) }, uBand: { value: 0 }, uBandCol: { value: new THREE.Color(0) },
      uOwn: { value: 0 }, uSkyTop: { value: new THREE.Color(0) }, uSkyHor: { value: new THREE.Color(0) }, uSkyPow: { value: 0.6 },
      uDisc: { value: 1 }, uDiscK: { value: 1 }, uHaloCol: { value: new THREE.Color(0) }, uHalo: { value: 0 },
      uCloudSpd: { value: 1 }, uCloudLo: { value: 0.14 }, uCells: { value: 0 }, uCanopy: { value: 0 }, uCanopyCol: { value: new THREE.Color(0) },
      uBigSunDir: { value: new THREE.Vector3(0, 0.05, -1) }, uBigSun: { value: 0 }, uBigSunCol: { value: new THREE.Color(0) }, uRays: { value: 0 },
      uGlowDir: { value: new THREE.Vector3(0, 0.1, -1) }, uGlowCol: { value: new THREE.Color(0) }, uGlowK: { value: 0 },
    };
    this.skyTarget = null;
    const old = world.sky.material;
    world.sky.material = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU, vertexShader: old.vertexShader, fragmentShader: SKY_FRAG });
    old.dispose();
    this.groundAt = () => 0;
    /* big actors in the mist: (x, z, radius, 0); world.js writes them every frame, the fog sheets read them */
    this.spots = { value: Array.from({ length: 6 }, () => new THREE.Vector4()) };
  }

  /* Builds the land for a biome. The old land shrinks away. */
  async set(biome, seed = 1) {
    const w = this.world; const look = lookOf(biome.id);
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    if (q?.has('landseed')) seed = Number(q.get('landseed')) || seed;
    if (this.current) { this.current.leaving = true; this.current.lt = 0; this.leaving.push(this.current); this.current = null; }
    DESAT = look.desat ?? 0.3;
    /* the still water's height for this land (addStillWater sets it): a fallen boss rests on the water, not under it */
    w.scene.userData.waterLevel = null;
    const land = { id: biome.id, look, group: new THREE.Group(), batches: [], parts: [], waters: [], seas: [], winds: [], tickers: [], t: 0, growEnd: 0, leaving: false, owned: [], particles: [] };
    this.current = land; w.scene.add(land.group);
    /* the variant: which layout this seed gets */
    const nv = look.variants || 1;
    let variant = ((Math.imul(seed >>> 0, 2654435761) >>> 0) >>> 7) % nv;
    if (q?.has('landvar')) variant = Number(q.get('landvar')) % nv;
    const r = rng((seed ^ 0x2545f491 ^ biome.id.length * 977) + variant * 7919);
    const ctx = { seed, v: variant, r, look: { ...look, id: biome.id }, f: {}, land, lands: this, world: w, W: await import('./world.js'), solids: [] };
    if (this.current !== land) return;
    land.variant = variant; land.ctx = ctx;
    look.layout?.(ctx);
    /* the height of the land: the look's shape, flat at 0 in the arena, low along the line to the nemesis */
    const nx = Math.cos(NEMESIS_ANG) * NEM_DIST; const nz = Math.sin(NEMESIS_ANG) * NEM_DIST;
    ctx.H = (x, z) => {
      const rr = Math.hypot(x, z); if (rr < ARENA_R) return 0;
      let h = look.height(ctx, x, z, rr, Math.atan2(z, x));
      h *= smooth(ARENA_R, ARENA_R + 7, rr);
      const off = angOff(Math.atan2(z, x));
      if (rr < 300 && off < 0.3) { const cap = lerp(0.6, 60, smooth(0.08, 0.3, off)) + Math.max(0, rr - 250) * 0.8; if (h > cap) h = lerp(cap, h, smooth(0.2, 0.3, off)); }
      const nb = bump(x, z, nx, nz, 38); if (nb > 0) h = lerp(h, Math.min(h, 0), nb);
      return h;
    };
    this.groundAt = (x, z) => ctx.H(x, z);
    /* ground: hide the world's flat floor, our terrain replaces it */
    w.ground.visible = false;
    w.target.ground.set(look.groundTint ?? 0x404040);
    w.target.fogNear = look.fog?.[0] ?? 14; w.target.fogFar = look.fog?.[1] ?? 140;
    w.landLight = { hemi: look.hemi ?? 0.9, sun: look.sun ?? 0.8, offset: new THREE.Vector3(...(look.sunOffset || [10, 22, 14])), exposure: look.exposure ?? 1, fog: look.fog || [14, 140] };
    w.target.exposure = look.exposure ?? 1;
    /* sky */
    const s = look.sky; const u = this.skyU;
    u.uSunDir.value.set(...s.sunDir).normalize(); u.uSunSize.value = s.sunSize ?? 0.03;
    this.skyTarget = { sunCol: new THREE.Color(s.sunCol ?? 0), sunGlow: s.sunGlow ?? 0, stars: s.stars ?? 0, aurora: s.aurora ?? 0, clouds: s.clouds ?? 0, cloudCol: new THREE.Color(s.cloudCol ?? 0), cloudLit: new THREE.Color(s.cloudLit ?? 0), ember: s.ember ?? 0, emberCol: new THREE.Color(s.emberCol ?? 0), band: s.band ?? 0, bandCol: new THREE.Color(s.bandCol ?? 0), lightning: !!s.lightning,
      own: s.top != null ? 1 : 0, haloCol: new THREE.Color(s.haloCol ?? 0), halo: s.halo ?? 0, canopy: s.canopy ?? 0, cells: s.cells ?? 0, rays: s.rays ?? 0, bigSun: s.bigSun ?? 0, glowK: s.glowK ?? 0 };
    if (s.auroraCol) u.uAuroraCol.value.set(s.auroraCol);
    if (s.top != null) { u.uSkyTop.value.set(s.top); u.uSkyHor.value.set(s.hor); u.uSkyPow.value = s.pow ?? 0.6; }
    u.uDisc.value = s.disc ?? 1; u.uDiscK.value = s.discK ?? 1; u.uCloudSpd.value = s.cloudSpd ?? 1; u.uCloudLo.value = s.cloudLo ?? 0.14;
    u.uCanopyCol.value.set(s.canopyCol ?? 0); u.uBigSunCol.value.set(s.bigSunCol ?? 0); u.uGlowCol.value.set(s.glowCol ?? 0);
    if (s.bigSunDir) u.uBigSunDir.value.set(...s.bigSunDir).normalize();
    if (s.glowDir) u.uGlowDir.value.set(...s.glowDir);
    /* the land's own fog and sky colours (the post fog and the height fog take the fog colour) */
    if (look.fogCol != null) w.target.fog.set(look.fogCol);
    if (look.skyCols) { w.target.top.set(look.skyCols[0]); w.target.bottom.set(look.skyCols[1]); }
    /* terrain */
    const tmat = terrainMaterial(look.terrain);
    const tgeo = this.terrainGeo(ctx);
    const terrain = new THREE.Mesh(tgeo, tmat); terrain.receiveShadow = true; terrain.scale.y = 0.001; terrain.frustumCulled = false; terrain.renderOrder = 5; /* the ground has the dearest shader; drawn after the props and bodies, it skips the pixels they cover */
    land.group.add(terrain); land.terrain = terrain; land.owned.push(tgeo, tmat);
    /* height map for water depth (near area) */
    if (look.heightMap) ctx.hmap = this.heightTexture(ctx, look.heightMap);
    /* particles */
    land.particles = (look.particles || []).map((p) => { const pts = particles(p, w); land.group.add(pts); land.owned.push(pts.geometry, pts.material); return pts; });
    /* grass */
    for (const gs of [].concat(look.grass || [])) this.addGrass(land, gs, r, ctx);
    /* land features (pools, sea, forest, story props) */
    if (look.build) { await look.build(ctx, this); if (this.current !== land) return; }
    /* props: scanned and procedural, instanced */
    const placed = ctx.placed || (ctx.placed = []);
    for (const spec of look.props || []) {
      if (spec.only != null && !([].concat(spec.only)).includes(variant)) continue;
      const variants = await this.variants(spec, r, land);
      if (this.current !== land) return;
      const inst = this.scatter(spec, r, placed, ctx, variants);
      this.addBatches(land, spec, variants, inst);
    }
    if (ctx.blobs?.length) addBlobs(ctx, this, ctx.blobs, look.blobA ?? 0.45);
    /* three r170: with scene.environment set and material.envMap null, envMapIntensity is ignored (the full white room
       environment lights everything). Bind the map so each land material keeps its own low intensity. */
    const env = w.scene.environment;
    if (env) land.group.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.isMeshStandardMaterial && !m.envMap) { m.envMap = env; m.needsUpdate = true; } });
  }

  /* the terrain mesh: a polar grid, fine near the arena and coarse at the horizon */
  terrainGeo(ctx) {
    const NA = 400; const radii = [0];
    let rr = 0; while (rr < 720) { rr = rr * 1.0105 + 0.3; radii.push(Math.min(rr, 720)); }
    const NR = radii.length;
    const pos = new Float32Array(NR * (NA + 1) * 3); const mask = new Float32Array(NR * (NA + 1) * 4); const idx = [];
    const look = ctx.look;
    for (let i = 0; i < NR; i++) {
      const R = radii[i];
      for (let j = 0; j <= NA; j++) {
        const ang = (j / NA) * TAU; const x = Math.cos(ang) * R; const z = Math.sin(ang) * R;
        const h = ctx.H(x, z); const k = i * (NA + 1) + j;
        pos[k * 3] = x; pos[k * 3 + 1] = h - (R < ARENA_R ? 0 : 0.0); pos[k * 3 + 2] = z;
        if (look.mask) { const m = look.mask(ctx, x, z, h, R); mask[k * 4] = m[0]; mask[k * 4 + 1] = m[1]; mask[k * 4 + 2] = m[2]; mask[k * 4 + 3] = m[3]; }
      }
    }
    for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j; const b = a + NA + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
    geo.setIndex(idx); geo.computeVertexNormals();
    /* coarser grids of the same vertices for weak machines and phones (web/src/perf3.js picks one by tier):
       level 1 = every 2nd spoke and ring (a quarter of the triangles), level 2 = every 4th (a sixteenth). The last ring stays. */
    { const mk = (k) => { const rings = []; for (let i = 0; i < NR; i += k) rings.push(i); if (rings[rings.length - 1] !== NR - 1) rings.push(NR - 1); const out = []; for (let a = 0; a < rings.length - 1; a++) for (let j = 0; j < NA; j += k) { const p = rings[a] * (NA + 1) + j; const q = rings[a + 1] * (NA + 1) + j; out.push(p, p + k, q, q, p + k, q + k); } return new THREE.BufferAttribute(new Uint32Array(out), 1); };
      geo.userData.sqLod = [geo.index, mk(2), mk(4)]; }
    /* the seam at angle 0/2pi: average the two copies of each normal */
    const nor = geo.attributes.normal;
    for (let i = 0; i < NR; i++) { const a = i * (NA + 1); const b = a + NA; const nx = nor.getX(a) + nor.getX(b); const ny = nor.getY(a) + nor.getY(b); const nz = nor.getZ(a) + nor.getZ(b); const l = Math.hypot(nx, ny, nz) || 1; nor.setXYZ(a, nx / l, ny / l, nz / l); nor.setXYZ(b, nx / l, ny / l, nz / l); }
    return geo;
  }

  /* terrain heights around the arena as a half-float texture, so water knows its depth */
  heightTexture(ctx, half = 160, N = 256) {
    const data = new Uint16Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = ((i + 0.5) / N - 0.5) * half * 2; const z = ((j + 0.5) / N - 0.5) * half * 2; data[j * N + i] = THREE.DataUtils.toHalfFloat(ctx.H(x, z)); }
    const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    ctx.land.owned.push(t);
    return { tex: t, half };
  }

  /* adds a mesh to the land, owned for disposal; grow = scale in with the land */
  add(mesh, { grow = true, owned = true } = {}) {
    const land = this.current; land.group.add(mesh);
    if (owned) { if (mesh.geometry) land.owned.push(mesh.geometry); if (mesh.material) land.owned.push(...[].concat(mesh.material)); }
    if (grow) { mesh.userData.growY = mesh.scale.y; mesh.scale.y = 0.0001; land.parts.push(mesh); }
    return mesh;
  }

  /* An instanced batch from a list of placements { x, y, z, ry, tx, tz, s, sy } */
  instanced(geo, mat, list, { shadow = true, receive = true, ownGeo = true } = {}) {
    const land = this.current; if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length); mesh.castShadow = shadow; mesh.receiveShadow = receive;
    const data = new Float32Array(list.length * STRIDE);
    list.forEach((it, k) => data.set([it.x, it.y, it.z, it.ry ?? 0, it.tx ?? 0, it.tz ?? 0, it.s ?? 1, it.sy ?? 1, it.delay ?? Math.max(0, Math.hypot(it.x, it.z) - 10) * 0.016], k * STRIDE));
    land.group.add(mesh); const b = { mesh, data, count: list.length }; land.batches.push(b);
    land.growEnd = Math.max(land.growEnd, ...list.map((it, k) => data[k * STRIDE + 8] + 1));
    this.writeMatrices(b, land.t, 0);
    if (ownGeo) land.owned.push(geo); land.owned.push(mat);
    if (mat.userData?.wind) land.winds.push(mat.userData.wind);
    if (mat.userData?.ember) land.tickers.push((t) => { mat.userData.ember.uTime.value = t; });
    return mesh;
  }

  /* The meshes one prop spec draws with: each variant is a list of { geo, mat } plus its unit height. */
  async variants(spec, r, land) {
    if (spec.m) { const sp = await scanParts(spec.m); return [{ parts: sp.parts.map((p) => ({ geo: p.geo, mat: scanMaterial(p.mat, spec), shared: true })), unitH: sp.unitH }]; }
    const out = [];
    const avgH = spec.h ? (spec.h[0] + spec.h[1]) / 2 : 1; uvS = avgH;
    const barkMat = () => { const m = new THREE.MeshStandardMaterial({ ...pbr('bark_brown_02'), color: new THREE.Color(BARK[spec.bark || 'brown']).multiply(new THREE.Color(spec.tint ?? 0xffffff).multiplyScalar(1.6)), roughness: 1, envMapIntensity: 0.15 }); m.normalScale = new THREE.Vector2(1.5, 1.5); if (spec.embers) withEmbers(m, 0xff3a08, 0.8, 0.5); else withCover(m, spec.cover, spec.coverAmt ?? 1); return m; };
    if (spec.p === 'deadtree' || spec.p === 'trunk') {
      const bark = barkMat();
      const moss = new THREE.MeshStandardMaterial({ color: spec.mossCol ?? 0x4a5236, roughness: 1, envMapIntensity: 0.1, alphaMap: mossTex(), alphaTest: 0.45, side: THREE.DoubleSide });
      for (let i = 0; i < (spec.kinds ?? 4); i++) {
        const g = spec.p === 'trunk' ? trunkGeo(r, spec) : deadTreeGeo(r, spec);
        const parts = [{ geo: g.bark, mat: bark }]; if (g.moss) parts.push({ geo: g.moss, mat: moss, noShadow: true });
        land.owned.push(g.bark); if (g.moss) land.owned.push(g.moss);
        out.push({ parts, unitH: 1 });
      }
      land.owned.push(bark, moss);
    } else if (spec.p === 'grave') {
      const mat = triMaterial('seaside_rock', { tint: new THREE.Color(spec.tint ?? 0xffffff).multiplyScalar(1.4), tile: 1.2, cover: 0x3a4428, coverAmt: 0.5 });
      for (let i = 0; i < 5; i++) { const g = graveGeo(r); out.push({ parts: [{ geo: g, mat }], unitH: 1 }); land.owned.push(g); }
      land.owned.push(mat);
    } else if (spec.p === 'tower') {
      const mat = triMaterial('castle_wall_slates', { tint: new THREE.Color(spec.tint ?? 0xffffff).multiplyScalar(1.4), tile: 3, cover: spec.cover, coverAmt: spec.coverAmt ?? 0.6 });
      for (let i = 0; i < 2; i++) { const g = towerGeo(r); out.push({ parts: [{ geo: g, mat }], unitH: 1 }); land.owned.push(g); }
      land.owned.push(mat);
    } else if (spec.p === 'stone') {
      const mat = triMaterial(spec.tex || 'rock', { tint: new THREE.Color(spec.tint ?? 0xffffff).multiplyScalar(1.3), tile: spec.tile ?? 2.5, cover: spec.cover, coverAmt: spec.coverAmt ?? 0.6, nstr: 1.4 });
      for (let i = 0; i < 4; i++) { const g = chunkGeo(r, { w: 0.42 + r() * 0.2, h: 1, d: 0.22 + r() * 0.12, chip: 0.22, taper: 0.25 + r() * 0.2 }); out.push({ parts: [{ geo: g, mat }], unitH: 1 }); land.owned.push(g); }
      land.owned.push(mat);
    } else if (spec.p === 'fern') {
      const tones = spec.tones || [0x1a2616, 0x3c5a35, 0x6a8a52];
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: spec.tint ?? 0xffffff, roughness: 0.85, alphaMap: frondTex(), alphaTest: 0.4, side: THREE.DoubleSide, envMapIntensity: 0.08 });
      windPatch(mat, 0.05);
      for (let i = 0; i < (spec.kinds ?? 3); i++) {
        const g = fernGeo(r, [7, 10, 13, 5, 11, 8][i % 6], [0.3, 0.6, 1, 0.12, 0.85, 0.45][i % 6]); const n = g.attributes.position.count; const cols = new Float32Array(n * 3); const c = new THREE.Color();
        const shade = 0.8 + r() * 0.4;
        for (let k = 0; k < n; k++) { const t = clamp(g.attributes.position.getY(k) * 1.1 + Math.hypot(g.attributes.position.getX(k), g.attributes.position.getZ(k)) * 0.5, 0, 1); c.set(tones[0]).lerp(new THREE.Color(tones[1]), Math.min(1, t * 1.6)); if (t > 0.6) c.lerp(new THREE.Color(tones[2]), (t - 0.6) / 0.4); c.multiplyScalar(shade); cols.set([c.r, c.g, c.b], k * 3); }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        out.push({ parts: [{ geo: g, mat }], unitH: 1, blade: true }); land.owned.push(g);
      }
      land.owned.push(mat);
    } else if (spec.p === 'conifer') {
      const bark = barkMat();
      const nm = new THREE.MeshStandardMaterial({ color: spec.needle ?? 0x1e2c28, roughness: 0.9, alphaMap: needleTex(), alphaTest: 0.45, side: THREE.DoubleSide, envMapIntensity: 0.1 });
      nm.alphaMap.wrapS = THREE.RepeatWrapping; nm.alphaMap.repeat.set(3, 1);
      withCover(nm, spec.cover, spec.coverAmt ?? 0.9);
      for (let i = 0; i < (spec.kinds ?? 3); i++) { const g = coniferGeo(r, 6 + Math.floor(r() * 4)); out.push({ parts: [{ geo: g.bark, mat: bark }, { geo: g.needles, mat: nm }], unitH: 1 }); land.owned.push(g.bark, g.needles); }
      land.owned.push(bark, nm);
    } else if (spec.p === 'slab') {
      const mat = triMaterial(spec.tex || 'rock', { tint: new THREE.Color(spec.tint ?? 0xffffff).multiplyScalar(1.3), tile: spec.tile ?? 1.6, cover: spec.cover, coverAmt: spec.coverAmt ?? 0.5, nstr: 1.6 });
      for (let i = 0; i < 4; i++) { const g = slabGeo(r); out.push({ parts: [{ geo: g, mat }], unitH: 1 }); land.owned.push(g); }
      land.owned.push(mat);
    } else if (spec.p === 'pebble') {
      /* small stones and scoria: a lumpy low icosahedron (80 faces), flat-shaded; far cheaper than a scan for clutter */
      const mat = triMaterial(spec.tex || 'rock', { tint: new THREE.Color(spec.tint ?? 0xffffff).multiplyScalar(1.3), tile: spec.tile ?? 0.7, nstr: 1.4, desat: 0.3, specMax: 0.2 });
      for (let i = 0; i < (spec.kinds ?? 2); i++) { const g = new THREE.IcosahedronGeometry(0.5, 1); const p = g.attributes.position; const sx = r() * 40; const fl = 0.4 + r() * 0.35; const ax = 0.8 + r() * 0.5;
        for (let k = 0; k < p.count; k++) { const x = p.getX(k); const y = p.getY(k); const z = p.getZ(k); const n = fbm(x * 2.2 + sx, y * 2.2 + z * 1.9, 2); const kk = 0.7 + n * 0.6; p.setXYZ(k, x * kk * ax, Math.max(y * kk * fl, -0.08), z * kk); }
        g.translate(0, 0.06, 0); g.computeVertexNormals(); g.deleteAttribute('uv'); out.push({ parts: [{ geo: g, mat }], unitH: 1 }); land.owned.push(g); }
      land.owned.push(mat);
    } else if (spec.p === 'reeds') {
      const mat = new THREE.MeshStandardMaterial({ color: spec.color ?? 0x3e3e2a, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.1 });
      windPatch(mat, 0.12);
      for (const [n, w, sp] of [[14, 0.04, 0.4], [9, 0.028, 0.22], [20, 0.034, 0.6]]) { const g = tuftGeo(r, n, w, sp); out.push({ parts: [{ geo: g, mat }], unitH: 1, blade: true }); land.owned.push(g); }
      land.owned.push(mat);
    } else if (spec.p === 'heather') {
      const g = shrubGeo(r, 30); const cols = new Float32Array(g.attributes.position.count * 3); const c0 = new THREE.Color(spec.root ?? 0x1e1a14); const c1 = new THREE.Color(spec.tip ?? 0x5a3a4a); const c = new THREE.Color();
      for (let i = 0; i < g.attributes.position.count; i++) { c.copy(c0).lerp(c1, Math.pow(g.attributes.uv.getY(i), 0.7)); cols.set([c.r, c.g, c.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.1 }); windPatch(mat, 0.05);
      out.push({ parts: [{ geo: g, mat }], unitH: 1, blade: true }); land.owned.push(g, mat);
    }
    return out;
  }

  /* Picks positions. Big props stay outside the arena and out of the line to the nemesis, spaced apart.
     spec.cluster = [min, max] members per cluster within spec.spread metres; spec.where(ctx, x, z, r) = 0..1 keep chance;
     spec.lean = [min, max] radians of lean for a share spec.leanP; spec.at = fixed list of [x, z] from the layout. */
  scatter(spec, r, placed, ctx, variants) {
    const out = [];
    const [d0, d1] = spec.d || [20, 80]; const n = spec.n;
    const big = !spec.clutter && spec.p !== 'reeds' && spec.p !== 'heather' && spec.p !== 'fern';
    const minD = big ? Math.max(d0, ARENA_R + 2) : Math.max(d0, 2.5);
    const cl = spec.cluster; let center = null; let left = 0;
    const fixed = typeof spec.at === 'function' ? spec.at(ctx) : spec.at;
    for (let i = 0; i < (fixed ? fixed.length : n); i++) {
      let ok = false; let x = 0; let z = 0; let dist = 0; let ang = 0; let size = 1;
      for (let tries = 0; tries < 40 && !ok; tries++) {
        const range = spec.h || spec.s; size = range[0] + r() * (range[1] - range[0]);
        if (fixed) { [x, z] = fixed[i]; if (fixed[i][2] != null) size = fixed[i][2]; }
        else if (cl) {
          if (!center || left <= 0) { const ca = r() * TAU; const cd = minD + Math.pow(r(), 0.8) * (Math.max(d1, minD) - minD); center = polar(ca, cd); left = cl[0] + Math.floor(r() * (cl[1] - cl[0] + 1)); }
          const a = r() * TAU; const rr = Math.sqrt(r()) * (spec.spread ?? 6); x = center[0] + Math.cos(a) * rr; z = center[1] + Math.sin(a) * rr;
        } else { ang = r() * TAU; dist = minD + Math.pow(r(), 0.85) * (Math.max(d1, minD) - minD); [x, z] = polar(ang, dist); }
        dist = Math.hypot(x, z); ang = Math.atan2(z, x);
        if (!fixed) {
          if (dist < minD) { if (cl) left = 0; continue; }
          if (big && dist > 24 && angOff(ang) < 0.2 + Math.min(0.25, size / dist) && dist < 300) { if (cl) left = 0; continue; }
          if (spec.where && r() > spec.where(ctx, x, z, dist)) { if (cl) left--; continue; }
        }
        const rad = big ? size * (spec.radK ?? 0.35) : 0;
        ok = true;
        if (big && !fixed && !spec.overlap) for (const p of placed) { if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.rad + rad) ** 2) { ok = false; break; } }
        /* rad = spacing; solid = the real footprint (a tree's trunk, a rock's base) for collision */
        if (ok && big) placed.push({ x, z, rad, solid: solidRadius(spec, size) });
      }
      if (!ok) continue;
      if (cl) left--;
      const v = variants.length > 1 ? Math.floor(r() * variants.length) : 0;
      const unitH = variants[v].unitH;
      const sc = spec.h ? size / unitH : size;
      let y = -(spec.sink ?? 0) * sc * unitH;
      let tx = (r() - 0.5) * (spec.tilt ?? 0.06); let tz = (r() - 0.5) * (spec.tilt ?? 0.06);
      if (spec.lean && r() < (spec.leanP ?? 1)) { const la = r() * TAU; const l = spec.lean[0] + r() * (spec.lean[1] - spec.lean[0]); tx = Math.cos(la) * l; tz = Math.sin(la) * l; }
      let sy = spec.p === 'reeds' || spec.p === 'deadtree' || spec.p === 'trunk' || spec.p === 'conifer' ? 0.85 + r() * 0.3 : 1;
      let sx = sc;
      if (spec.upright) { tx = (r() - 0.5) * 0.12; tz = (r() - 0.5) * 0.12; sy = 1.9 + r() * 0.5; sx = sc / sy; y = -0.1 * size; }
      if (spec.p === 'grave') { tx = (r() - 0.5) * 0.25; tz = (r() - 0.5) * 0.18; y = -0.05; }
      if (spec.p === 'stone') { tx = (r() - 0.5) * 0.14; tz = (r() - 0.5) * 0.14; y = -0.12 * size; }
      if (spec.p === 'slab') { const la = r() * TAU; const l = 0.09 + r() * 0.17; tx = Math.cos(la) * l; tz = Math.sin(la) * l; y = -0.15 * size; }
      if (spec.p === 'fern') { tx = (r() - 0.5) * 0.3; tz = (r() - 0.5) * 0.3; }
      let ry = r() * TAU;
      if (spec.p === 'grave') ry = Math.atan2(-Math.cos(ang), -Math.sin(ang)) + (r() - 0.5) * 0.35;
      if (spec.face) ry = spec.face(ctx, x, z) + (r() - 0.5) * 0.3;
      /* sit on the lowest point of the footprint, so nothing hangs over a slope */
      const fr = spec.h ? Math.min(1.2, sx * 0.02 + 0.2) : sx * 0.36;
      let gy = this.groundAt(x, z);
      if (spec.p !== 'reeds' && spec.p !== 'heather') for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; gy = Math.min(gy, this.groundAt(x + Math.cos(a) * fr, z + Math.sin(a) * fr)); }
      y += gy + (spec.lift ?? 0);
      if (spec.blob !== false && big && dist < 110 && spec.p !== 'deadtree' && spec.p !== 'trunk' && spec.p !== 'conifer') (ctx.blobs || (ctx.blobs = [])).push([x, z, (spec.h ? 0.6 : sx * 0.62) * (spec.blobK ?? 1)]);
      const delay = Math.max(0, dist - 10) * 0.016 + r() * 0.25;
      if (spec.ring && dist < 120) (ctx.blobs || (ctx.blobs = [])).push([x, z, spec.ring * (0.7 + r() * 0.5), ctx.f.level + 0.012]);
      out.push({ v, x, y, z, ry, tx, tz, s: sx, sy, dist, delay });
      if (spec.p === 'reeds') for (let k = 0; k < 5; k++) { const a = r() * TAU; const rr = r() * 1.6; const hs = (spec.h[0] + r() * (spec.h[1] - spec.h[0])); const xx = x + Math.cos(a) * rr; const zz = z + Math.sin(a) * rr; out.push({ v, x: xx, y: this.groundAt(xx, zz), z: zz, ry: r() * TAU, tx: (r() - 0.5) * 0.4, tz: (r() - 0.5) * 0.4, s: hs, sy: 1, dist, delay }); }
    }
    return out;
  }

  addBatches(land, spec, variants, inst) {
    const shadowMax = spec.shadowMax ?? 40;
    variants.forEach((variant, vi) => {
      const mine = inst.filter((it) => it.v === vi);
      for (const near of spec.shadow === false ? [false] : [true, false]) {
        const list = spec.shadow === false ? mine : mine.filter((it) => (it.dist < shadowMax) === near);
        if (!list.length) continue;
        for (const part of variant.parts) {
          const mesh = new THREE.InstancedMesh(part.geo, part.mat, list.length);
          mesh.castShadow = near && !variant.blade && !part.noShadow && spec.shadow !== false; mesh.receiveShadow = true;
          const data = new Float32Array(list.length * STRIDE);
          list.forEach((it, k) => { data.set([it.x, it.y, it.z, it.ry, it.tx, it.tz, it.s, it.sy, it.delay], k * STRIDE); });
          /* per-instance tint: brightness jitter and a drift toward spec.tintTo by a low-frequency noise, so clones differ */
          if (spec.tintVar) { const ic = new THREE.Color(); const to = new THREE.Color(spec.tintTo ?? 0xffffff); list.forEach((it, k) => { const h = hash2(Math.floor(it.x * 7.3), Math.floor(it.z * 7.9)); const n = fbm(it.x * 0.05 + 9, it.z * 0.05 - 4, 2); ic.setRGB(1, 1, 1).lerp(to, clamp((n - 0.35) * 2.2 + (h - 0.5) * 0.6, 0, 1)).multiplyScalar(1 - spec.tintVar + h * spec.tintVar * 2); mesh.setColorAt(k, ic); }); }
          land.group.add(mesh);
          land.batches.push({ mesh, data, count: list.length });
          land.growEnd = Math.max(land.growEnd, ...list.map((it) => it.delay + 1));
          this.writeMatrices({ mesh, data, count: list.length }, land.t, 0);
          if (part.mat.userData?.wind && !land.winds.includes(part.mat.userData.wind)) land.winds.push(part.mat.userData.wind);
          if (part.mat.userData?.ember) land.tickers.push((t) => { part.mat.userData.ember.uTime.value = t; });
          if (part.shared) land.owned.push(part.mat);
        }
      }
    });
  }

  /* Grass: instanced tufts that sway on the GPU. gs.density(ctx, x, z, r) = 0..1 keep chance; gs.height(ctx, x, z) scales height.
     Light through the blade tips toward the key (rim on the tips). */
  addGrass(land, gs, r, ctx) {
    const g = tuftGeo(r, gs.blades ?? 6, gs.width ?? 0.05, gs.spread ?? 0.12);
    const cols = new Float32Array(g.attributes.position.count * 3);
    const root = new THREE.Color(gs.root); const tip = new THREE.Color(gs.tip); const c = new THREE.Color();
    for (let i = 0; i < g.attributes.position.count; i++) { c.copy(root).lerp(tip, Math.pow(g.attributes.uv.getY(i), 0.8)); cols.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.1 });
    if (gs.rim) {
      const U = { uRimCol: { value: new THREE.Color(gs.rim).multiplyScalar(gs.rimK ?? 1.2) } };
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vTipY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTipY = position.y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRimCol; varying float vTipY;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uRimCol * pow(vTipY, 3.0) * 0.35;');
      };
      mat.customProgramCacheKey = () => 'sq-grass-rim';
    }
    windPatch(mat, gs.wind ?? 0.18);
    /* two tuft shapes (a thin one and a full one), so no two neighbours are clones */
    const g2 = tuftGeo(r, (gs.blades ?? 6) + 2, (gs.width ?? 0.05) * 0.85, (gs.spread ?? 0.12) * 1.8);
    { const c2 = new Float32Array(g2.attributes.position.count * 3); for (let i = 0; i < g2.attributes.position.count; i++) { c.copy(root).lerp(tip, Math.pow(g2.attributes.uv.getY(i), 0.8)); c2.set([c.r, c.g, c.b], i * 3); } g2.setAttribute('color', new THREE.BufferAttribute(c2, 3)); }
    const meshes = [g, g2].map((geo) => { const m = new THREE.InstancedMesh(geo, mat, gs.n); m.receiveShadow = true; m.castShadow = !!gs.shadow; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(gs.n * 3), 3); return m; });
    const counts = [0, 0]; const R0 = gs.r?.[0] ?? 3; const R1 = gs.r?.[1] ?? 105;
    /* clumps, not a grid: a centre by the density mask, then 3 to 12 tufts around it, each clump with its own height and tint */
    const cl = gs.clump ?? [3, 12]; const cR = gs.clumpR ?? 0.9;
    const dry = new THREE.Color(gs.dry ?? 0xc8b890); const lush = new THREE.Color(gs.lush ?? 0xffffff); const ic = new THREE.Color();
    let total = 0;
    for (let i = 0; i < gs.n * 3 && total < gs.n; i++) {
      const ang = r() * TAU; const dist = R0 + Math.pow(r(), gs.pow ?? 1.5) * (R1 - R0);
      const cx = Math.cos(ang) * dist; const cz = Math.sin(ang) * dist;
      const keep = gs.density ? gs.density(ctx, cx, cz, dist) : (fbm(cx * 0.06 + 11, cz * 0.06, 3) < 0.42 ? 0 : 1);
      if (r() > keep) continue;
      const m = cl[0] + Math.floor(r() * (cl[1] - cl[0] + 1)); const ck = 0.7 + r() * 0.6; const cr = cR * (0.5 + r());
      const tone = clamp(fbm(cx * (gs.tintF ?? 0.05) + 31, cz * (gs.tintF ?? 0.05) - 17, 3) * 1.8 - 0.4 + (r() - 0.5) * 0.35, 0, 1);
      for (let j = 0; j < m && total < gs.n; j++) {
        const a = r() * TAU; const rr = Math.pow(r(), 0.7) * cr; const x = cx + Math.cos(a) * rr; const z = cz + Math.sin(a) * rr;
        if (Math.hypot(x, z) < R0) continue;
        const hk = gs.height ? gs.height(ctx, x, z, dist) : 1;
        const h = (gs.h[0] + r() * (gs.h[1] - gs.h[0])) * hk * ck * (1 - 0.35 * (rr / cr));
        tmpE.set((r() - 0.5) * 0.5, r() * TAU, (r() - 0.5) * 0.5); tmpQ.setFromEuler(tmpE);
        const w = h * (gs.wide ?? 0.9) * (0.75 + r() * 0.5);
        tmpM.compose(tmpV.set(x, this.groundAt(x, z), z), tmpQ, tmpS.set(w, h, w));
        const which = r() < 0.45 ? 1 : 0; const mesh = meshes[which]; const k = counts[which]++;
        mesh.setMatrixAt(k, tmpM);
        ic.copy(lush).lerp(dry, tone).multiplyScalar(0.82 + r() * 0.3); mesh.setColorAt(k, ic);
        total++;
      }
    }
    meshes.forEach((mesh, i) => { mesh.count = counts[i]; land.group.add(mesh); if (i === 0) (land.grass || (land.grass = [])).push(mesh); });
    mat.userData.wind.uGrow.value = 0;
    land.owned.push(g, g2, mat);
  }

  writeMatrices(b, t, leave) {
    const d = b.data;
    for (let k = 0; k < b.count; k++) {
      const j = k * STRIDE;
      const g = Math.max(0.0001, Math.min(1.05, easeOutBack(Math.min(1, Math.max(0, (t - d[j + 8]) / 0.8)))) * (1 - leave));
      tmpE.set(d[j + 4], d[j + 3], d[j + 5]); tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(d[j], d[j + 1] * g, d[j + 2]), tmpQ, tmpS.set(d[j + 6], d[j + 6] * d[j + 7] * g, d[j + 6]));
      b.mesh.setMatrixAt(k, tmpM);
    }
    b.mesh.instanceMatrix.needsUpdate = true;
  }

  /* the card sky: a world may want a clear sky on the card (a storybook card is a golden evening, not the land's storm).
     spec = { clouds, cells, top, hor, pow, band, bandCol, cloudCol, cloudLit, hide } sets the sky target; hide (default true)
     takes the land's far sky props out of the picture: anything in land.cardHide, and any fog-free mesh far out (cloud walls,
     far bolts). They go to layer 31, so a ticker that sets visible cannot bring them back. cardSky(null) puts it all back. */
  cardSky(spec) {
    const land = this.current; const st = this.skyTarget; const u = this.skyU;
    if (!spec) {
      const sv = this.cardSaved; if (!sv) return; this.cardSaved = null;
      if (st) Object.assign(st, sv.st); u.uSkyTop.value.copy(sv.top); u.uSkyHor.value.copy(sv.hor); u.uSkyPow.value = sv.pow;
      for (const [o, mask] of sv.hidden) o.layers.mask = mask; return;
    }
    if (!st || this.cardSaved) return;
    const sv = this.cardSaved = { st: { clouds: st.clouds, cells: st.cells, band: st.band, lightning: st.lightning, own: st.own, cloudCol: st.cloudCol.clone(), cloudLit: st.cloudLit.clone(), bandCol: st.bandCol.clone() }, top: u.uSkyTop.value.clone(), hor: u.uSkyHor.value.clone(), pow: u.uSkyPow.value, hidden: [] };
    for (const key of ['clouds', 'cells', 'band']) if (spec[key] != null) st[key] = spec[key];
    for (const key of ['cloudCol', 'cloudLit', 'bandCol']) if (spec[key] != null) st[key] = new THREE.Color(spec[key]);
    st.lightning = false;
    if (spec.top != null) { st.own = 1; u.uSkyTop.value.set(spec.top); u.uSkyHor.value.set(spec.hor ?? spec.top); u.uSkyPow.value = spec.pow ?? u.uSkyPow.value; }
    if (land && spec.hide !== false) {
      const hide = new Set(land.cardHide || []); const p = new THREE.Vector3();
      land.group.traverse((o) => { if (!o.isMesh && !o.isPoints) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m?.fog !== false) return; o.getWorldPosition(p); if (Math.hypot(p.x, p.z) > 200) hide.add(o); });
      for (const o of hide) { sv.hidden.push([o, o.layers.mask]); o.layers.set(31); }
    }
    /* the sky colours ease in over a second or two in update(); the card shot is a still, so snap them now */
    for (const [key, name] of [['clouds', 'uClouds'], ['cells', 'uCells'], ['band', 'uBand'], ['own', 'uOwn']]) u[name].value = st[key];
    u.uCloudCol.value.copy(st.cloudCol); u.uCloudLit.value.copy(st.cloudLit); u.uBandCol.value.copy(st.bandCol);
  }

  update(dt, focus) {
    const w = this.world; const u = this.skyU;
    u.uTime.value = w.time;
    const land = this.current;
    const k = 1 - Math.exp(-dt * 1.6);
    u.uLand.value += ((land ? 1 : 0) - u.uLand.value) * k;
    const st = this.skyTarget;
    if (st) {
      u.uSunCol.value.lerp(st.sunCol, k); u.uCloudCol.value.lerp(st.cloudCol, k); u.uCloudLit.value.lerp(st.cloudLit, k); u.uEmberCol.value.lerp(st.emberCol, k); u.uBandCol.value.lerp(st.bandCol, k);
      u.uHaloCol.value.lerp(st.haloCol, k);
      for (const [key, name] of [['sunGlow', 'uSunGlow'], ['stars', 'uStars'], ['aurora', 'uAurora'], ['clouds', 'uClouds'], ['ember', 'uEmber'], ['band', 'uBand'], ['own', 'uOwn'], ['halo', 'uHalo'], ['canopy', 'uCanopy'], ['cells', 'uCells'], ['rays', 'uRays'], ['bigSun', 'uBigSun'], ['glowK', 'uGlowK']]) u[name].value += (st[key] - u[name].value) * k;
      u.uFlash.value = st.lightning ? w.flashAmount : 0;
    }
    const cx = focus ? focus.x : 0; const cz = focus ? focus.z : 0;
    if (land) {
      land.t += dt;
      if (land.t < land.growEnd + 0.1) for (const b of land.batches) this.writeMatrices(b, land.t, 0);
      for (const p of land.parts) { const gk = clamp((land.t - (p.userData.delay ?? 0.3)) / 1.2, 0, 1); p.scale.y = Math.max(0.0001, p.userData.growY * (gk * gk * (3 - 2 * gk))); }
      if (land.terrain) { land.terrain.scale.y = Math.min(1, land.terrain.scale.y + dt * 0.8); land.terrain.material.userData.terrain.uTime.value = w.time; }
      for (const m of land.waters) { const wu = m.material.uniforms; wu.uTime.value = w.time; wu.uFade.value = Math.min(1, wu.uFade.value + dt * 0.6); if (wu.uSkyLo) { const sk = m.userData.skyK ?? 1; wu.uSkyLo.value.copy(w.col.fog).multiplyScalar(1.1 * sk); wu.uSkyHi.value.copy(w.col.bottom).lerp(w.col.top, 0.4).multiplyScalar(sk); } if (wu.uFlash) wu.uFlash.value = w.flashAmount; }
      for (const gm of land.grass || []) { const gu = gm.material.userData.wind; gu.uTime.value = w.time; gu.uGrow.value = Math.min(1, gu.uGrow.value + dt * 0.7); }
      for (const wu of land.winds) { wu.uTime.value = w.time; }
      for (const fn of land.tickers) fn(w.time, dt, cx, cz);
      for (const p of land.particles) {
        const pu = p.material.uniforms; pu.uTime.value = w.time; pu.uCenter.value.set(cx, 0, cz);
        pu.uOpacity.value = Math.min(p.material.userData.target, pu.uOpacity.value + dt * 0.4);
        pu.uScale.value = w.renderer.domElement.height * 0.5 / Math.tan((w.camera.fov * Math.PI) / 360);
      }
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const old = this.leaving[i]; old.lt += dt;
      const s = Math.max(0.0001, 1 - old.lt * 2.2);
      old.group.scale.y = s;
      for (const p of old.particles) p.material.uniforms.uOpacity.value = Math.max(0, p.material.uniforms.uOpacity.value - dt * 2);
      if (s <= 0.0001) {
        old.group.removeFromParent();
        for (const o of old.owned) o.dispose?.();
        for (const b of old.batches) b.mesh.dispose();
        this.leaving.splice(i, 1);
      }
    }
  }
}

/* ======================================================================================================
   Feature generators shared by the lands
   ====================================================================================================== */

/* still water over the whole land at one level; the height map cuts it where the ground is higher */
function addStillWater(ctx, L, { level = 0, tint = 0x1c2418, deep = 0x070a07, rip = 0.35, R = 300 } = {}) {
  const geo = new THREE.CircleGeometry(R, 96); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: true,
    uniforms: {
      uTime: { value: 0 }, uTint: { value: new THREE.Color(tint) }, uDeep: { value: new THREE.Color(deep) }, uSkyLo: { value: new THREE.Color() }, uSkyHi: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(-0.5, 0.25, -0.8).normalize() }, uSunCol: { value: new THREE.Color(ctx.look.sky.sunCol ?? 0xffffff) },
      tHeight: { value: ctx.hmap.tex }, uHalf: { value: ctx.hmap.half }, uLevel: { value: level }, uFade: { value: 0 }, uFlash: { value: 0 }, uRip: { value: rip },
    },
  });
  const m = new THREE.Mesh(geo, mat); m.position.y = level; m.renderOrder = 1; m.frustumCulled = false;
  L.current.group.add(m); L.current.waters.push(m); L.current.owned.push(geo, mat);
  { const ud = ctx.world?.scene?.userData; if (ud) ud.waterLevel = Math.max(Number.isFinite(ud.waterLevel) ? ud.waterLevel : -Infinity, level); }
  return m;
}
/* low fog sheets that drift: a soft band at the given heights, faded near the eye */
const FOGSHEET_VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
/* uAct: big actors standing in the mist (x, z, radius; world.js fills them each frame): the sheets thin out round them,
   so a giant's legs are not cut by a hard band of mist (soft particles by footprint, no depth read) */
const FOGSHEET_FRAG = `uniform float uTime; uniform vec3 uCol; uniform float uA; uniform vec3 uC; uniform float uR; uniform float uSeed; uniform vec4 uAct[6]; varying vec3 vW; ${NOISE}
void main(){ vec2 p = vW.xz * 0.045 + vec2(uTime * 0.018, uTime * 0.007) + uSeed;
  float n = sqF2(p) * 0.65 + sqF2(p * 2.7 - vec2(uTime * 0.03, 0.0)) * 0.35;
  float d = length(vW.xz - uC.xz); float eye = length(vW - cameraPosition);
  float a = smoothstep(0.32, 0.75, n) * uA * (1.0 - smoothstep(uR * 0.55, uR, d)) * smoothstep(2.0, 9.0, eye);
  for (int i = 0; i < 6; i++) { vec4 s = uAct[i]; if (s.z > 0.0) a *= mix(0.12, 1.0, smoothstep(s.z * 0.45, s.z, length(vW.xz - s.xy))); }
  if (a < 0.004) discard; gl_FragColor = vec4(uCol, a); }`;
function addFogSheets(ctx, L, heights, { color = 0x3a4630, alpha = 0.25, R = 90 } = {}) {
  const land = L.current;
  heights.forEach((h, i) => {
    const geo = new THREE.CircleGeometry(R, 48); geo.rotateX(-Math.PI / 2);
    const U = { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uA: { value: alpha }, uC: { value: new THREE.Vector3() }, uR: { value: R }, uSeed: { value: i * 7.3 }, uAct: L.spots };
    const mat = new THREE.ShaderMaterial({ vertexShader: FOGSHEET_VERT, fragmentShader: FOGSHEET_FRAG, uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.position.y = h; m.renderOrder = 4; m.frustumCulled = false;
    land.group.add(m); land.owned.push(geo, mat);
    land.tickers.push((t, dt, cx, cz) => { U.uTime.value = t * (1 + i * 0.3); m.position.x = cx; m.position.z = cz; U.uC.value.set(cx, 0, cz); U.uA.value = alpha * Math.min(1, land.t / 3); });
  });
}
/* soft additive glow cards that face the camera (torches, shrine light, pool heat, lighthouse lamp) */
const GLOW_VERT = `attribute vec4 aG; uniform float uTime; varying vec2 vUv; varying float vF;
void main(){ vUv = uv; vec3 c = (modelMatrix * vec4(aG.xyz, 1.0)).xyz; vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float fl = 0.85 + 0.15 * sin(uTime * 7.0 + aG.x * 3.0) * sin(uTime * 3.1 + aG.z); vF = fl;
  vec3 p = c + (r * position.x + u * position.y) * aG.w * fl; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const GLOW_FRAG = `uniform vec3 uCol; uniform float uA; varying vec2 vUv; varying float vF; void main(){ float d = length(vUv - 0.5) * 2.0; float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.8, 1.0, d)); gl_FragColor = vec4(uCol * a * uA * vF, 1.0); }`;
function addGlows(L, list, color, { alpha = 1, depthTest = true } = {}) {
  if (!list.length) return null;
  const base = new THREE.PlaneGeometry(1, 1); const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
  geo.setAttribute('aG', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((g) => [g[0], g[1], g[2], g[3]])), 4)); geo.instanceCount = list.length;
  const U = { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uA: { value: alpha } };
  const mat = new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: U, transparent: true, depthWrite: false, depthTest, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 5;
  L.current.group.add(m); L.current.owned.push(geo, mat, base);
  L.current.tickers.push((t) => { U.uTime.value = t; U.uA.value = alpha * Math.min(1, L.current?.t / 2 || 0); });
  return m;
}
/* billowing smoke or steam: camera-facing puffs that rise from a source, grow, and loop */
const SMOKE_VERT = `attribute vec4 aS; uniform float uTime; uniform vec3 uSrc; uniform vec3 uWind; uniform float uRise; uniform float uSize; uniform float uLife;
varying vec2 vUv; varying float vA; varying float vH; varying float vSeed;
void main(){ vUv = uv; vSeed = aS.w;
  float age = fract(uTime / uLife + aS.w); vH = age;
  vec3 c = uSrc + vec3((aS.x - 0.5), 0.0, (aS.z - 0.5)) * uSize * 0.6 + vec3(0.0, uRise * age, 0.0) + uWind * age * age * uRise;
  float sz = uSize * (0.35 + 1.4 * age) * (0.7 + 0.6 * aS.y);
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float rot = aS.w * 6.28 + uTime * 0.05 * (aS.x - 0.5); vec2 pr = vec2(cos(rot) * position.x - sin(rot) * position.y, sin(rot) * position.x + cos(rot) * position.y);
  vec3 p = c + (r * pr.x + u * pr.y) * sz;
  vA = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const SMOKE_FRAG = `uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uHot; uniform float uA; uniform float uTime; varying vec2 vUv; varying float vA; varying float vH; varying float vSeed; ${NOISE}
void main(){ vec2 q = vUv - 0.5; float d = length(q) * 2.0;
  float n = sqF2(vUv * 3.0 + vSeed * 17.0 + uTime * 0.02);
  float a = smoothstep(1.0, 0.25, d + (n - 0.5) * 0.9) * vA * uA; if (a < 0.01) discard;
  vec3 c = mix(uLow, uHigh, smoothstep(0.0, 0.6, vH)) * (0.6 + 0.6 * n);
  c += uHot * smoothstep(0.35, 0.0, vH) * (0.5 + n) * smoothstep(-0.1, 0.4, -q.y);
  gl_FragColor = vec4(c, a); }`;
function addSmoke(L, src, { n = 40, size = 40, rise = 220, life = 40, wind = [0.25, 0, 0.1], low = 0x2a2420, high = 0x4a4440, hot = 0x000000, alpha = 0.85 } = {}) {
  const base = new THREE.PlaneGeometry(1, 1); const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
  const s = new Float32Array(n * 4); for (let i = 0; i < n; i++) s.set([Math.random(), Math.random(), Math.random(), i / n + Math.random() * 0.02], i * 4);
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(s, 4)); geo.instanceCount = n;
  const U = { uTime: { value: 0 }, uSrc: { value: new THREE.Vector3(...src) }, uWind: { value: new THREE.Vector3(...wind) }, uRise: { value: rise }, uSize: { value: size }, uLife: { value: life },
    uLow: { value: new THREE.Color(low) }, uHigh: { value: new THREE.Color(high) }, uHot: { value: new THREE.Color(hot) }, uA: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms: U, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 2;
  L.current.group.add(m); L.current.owned.push(geo, mat, base);
  const land = L.current; land.tickers.push((t) => { U.uTime.value = t + 400; U.uA.value = alpha * Math.min(1, land.t / 3); });
  return m;
}
/* a molten pool surface: crusted plates drifting on glowing lava */
const LAVA_FRAG = `uniform float uTime; uniform vec3 uHot; uniform vec3 uCrust; ${WORLD_VARY_PARS} ${NOISE}`;
function lavaMaterial(hot = 0xff5a14) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.75, metalness: 0, envMapIntensity: 0.1 });
  const U = { uTime: { value: 0 }, uHot: { value: new THREE.Color(hot).multiplyScalar(4.5) }, uCrust: { value: new THREE.Color(0x140c0a) } };
  mat.userData.lava = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${LAVA_FRAG}`)
      .replace('#include <map_fragment>', `vec2 lp = vW.xz * 0.35 + vec2(uTime * 0.03, uTime * 0.012); vec2 lv = sqVor(lp + sqF2(lp * 0.7) * 0.8);
        float seam = 1.0 - smoothstep(0.02, 0.22, lv.y); float cool = sqF2(vW.xz * 0.12 - uTime * 0.01);
        float molten = clamp(seam + smoothstep(0.55, 0.85, cool), 0.0, 1.0);
        diffuseColor.rgb = mix(uCrust * (0.7 + 0.6 * sqN2(vW.xz * 2.0)), vec3(0.3, 0.08, 0.02), molten);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uHot * molten * (0.75 + 0.25 * sin(uTime * 1.7 + lv.x * 6.0)) * (0.6 + 0.4 * sqN2(vW.xz * 0.8 + uTime * 0.2));`);
  };
  mat.customProgramCacheKey = () => 'sq-lava';
  return mat;
}
/* banners on poles: tattered cloth that flutters, some poles snapped */
function bannerMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.1 });
  const U = { uTime: { value: 0 } }; mat.userData.wind = { uTime: U.uTime, uGrow: { value: 1 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec2 vBUv; varying float vBPh;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBUv = uv; float ph = 0.0;
        #ifdef USE_INSTANCING
        ph = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.3;
        #endif
        vBPh = fract(ph * 0.137 + 0.31);
        float kx = 1.0 - uv.x; transformed.z += sin(uTime * 3.0 + kx * 5.0 + uv.y * 2.0 + ph) * 0.18 * kx + sin(uTime * 5.3 + kx * 9.0 + ph) * 0.05 * kx;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vBUv; varying float vBPh; ${NOISE}`)
      .replace('#include <map_fragment>', `vec2 bq = vBUv + vec2(vBPh * 3.7, vBPh * 1.9); float tat = sqF2(bq * vec2(6.0, 3.0)) * 0.6 + sqN2(bq * 22.0) * 0.4;
        float torn = 0.55 + vBPh * 0.35; if (tat < smoothstep(torn, 0.0, vBUv.y) * 0.85 + smoothstep(0.7, 1.0, 1.0 - vBUv.x) * (0.2 + vBPh * 0.3) + step(0.8, vBPh) * smoothstep(0.35, 0.0, abs(vBUv.x - 0.3)) * 0.5) discard;
        diffuseColor.rgb *= mix(0.25, 1.0, smoothstep(0.0, 0.5, vBUv.y)) * (0.65 + 0.5 * tat) * (0.7 + 0.5 * fract(vBPh * 7.3));
        float em = step(0.4, fract(vBPh * 5.1)); float cy = 0.6 + fract(vBPh * 3.3) * 0.18;
        if (em > 0.5 && (abs(vBUv.y - cy) < 0.03 || abs(vBUv.x - 0.5) < 0.025 && vBUv.y > 0.45)) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.28, 0.12), 0.7);`);
  };
  mat.customProgramCacheKey = () => 'sq-banner';
  return mat;
}
/* a camera-independent bolt of lightning: a jagged ribbon, shown for a few frames */
function boltGeo(r, H = 260) {
  const pts = [[0, H, 0]]; let x = 0; let z = 0;
  for (let y = H; y > 0; y -= 8 + r() * 10) { x += (r() - 0.5) * 22; z += (r() - 0.5) * 22; pts.push([x, Math.max(0, y), z]); }
  const pos = []; const idx = [];
  pts.forEach((p, i) => { const w = 1.6 * (1 - i / pts.length) + 0.4; pos.push(p[0] - w, p[1], p[2], p[0] + w, p[1], p[2]); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

/* ======================================================================================================
   The lands
   ====================================================================================================== */
/* Shared terrain shape: far mountain ranges in two layers with gaps, so the horizon has depth and is not one ring. */
function ranges(x, z, r, ang, sd, { near = [150, 260], far = [360, 600], ampN = 50, ampF = 120, sharp = 2.2, freq = 0.005, gapK = 0.5 } = {}) {
  const ridge = ridged(x * freq + sd, z * freq - sd, 5);
  const gap = smooth(0.25, 0.6, fbm(Math.cos(ang) * 3 + sd, Math.sin(ang) * 3 - sd, 3));
  const nearR = smooth(near[0], near[1], r) * (1 - smooth(near[1] + 40, near[1] + 120, r) * 0.4) * lerp(1, gap, gapK);
  const farR = smooth(far[0], far[1], r);
  return Math.pow(ridge, sharp) * (ampN * nearR + ampF * farR) + farR * ampF * 0.18 * fbm(x * 0.003 + 9, z * 0.003, 3);
}
const sd0 = (ctx) => (ctx.seed % 97) * 0.37 + ctx.v * 11.3;

const LOOKS = {
  /* ---------------- ASHLANDS: the hero land. A volcano, molten pools, a lost army on the ash road. ---------------- */
  ashlands: {
    variants: 3, desat: 0.15, groundTint: 0x2a201c, fog: [14, 160], hemi: 0.8, sun: 0.75, sunOffset: [10, 20, 16], exposure: 1.0, fogCol: 0x1e0c08, skyCols: [0x080404, 0x2a0e08],
    /* near-black sky: red only at the horizon and under the plume, so lava is the one bright red */
    sky: { sunDir: [0.55, 0.12, -1], sunCol: 0x000000, sunGlow: 0, disc: 0, top: 0x0a0605, hor: 0x1a0c08, pow: 0.45, clouds: 0.75, cloudCol: 0x0c0605, cloudLit: 0x3a140a, cloudSpd: 0.7, ember: 0.55, emberCol: 0xb02a08, band: 0.45, bandCol: 0x9a2a0a, glowK: 1.3, glowCol: 0xc0300a },
    terrain: { A: ['burned_ground_01', 4.5, 0x4a403c], B: ['rock', 6, 0x221e20], C: ['cliff_side', 12, 0x3a302c], P: 0x5a5450, rock: [0.16, 0.42], macro: [38, 0.35], nstr: 1.25, rough: [0.95, 0.7], desat: 0.25, bnoise: 0.55, emis: 0xff4a10, emisK: 2.4, crack: [0.3, 3.2, 0.05, 1.0], strata: [0.35, 0.5, 3, 0.2], volc: true, lavaCol: 0xff5a14, lavaK: 3.2, haze: [0x2a0e08, 0.35, 200, 520] },
    heightMap: 160,
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      /* volcano: left of the nemesis, far right, or behind on the left; never in the nemesis line */
      f.vAng = [-2.02, -0.62, -2.75][v] + (r() - 0.5) * 0.12; f.vDist = [430, 390, 470][v];
      [f.vx, f.vz] = polar(f.vAng, f.vDist); f.vR = 230; f.vH = 165;
      /* molten pools at mid distance, in the front half */
      const pa = [[-2.15, -1.75, -0.85], [-1.95, -0.55, -2.6], [-2.3, -0.9]][v];
      f.pools = pa.map((a, i) => { const d = 32 + r() * 34 + i * 6; const [x, z] = polar(a + (r() - 0.5) * 0.2, d); return { x, z, R: 6 + r() * 5 }; });
      /* a lava channel from the volcano foothills down to the nearest pool */
      const p0 = f.pools[0]; const towards = Math.atan2(p0.z - f.vz, p0.x - f.vx);
      const start = [f.vx + Math.cos(towards) * f.vR * 0.55, f.vz + Math.sin(towards) * f.vR * 0.55];
      const pts = [start]; let [cx, cz] = start;
      for (let i = 0; i < 40; i++) { const a = Math.atan2(p0.z - cz, p0.x - cx) + Math.sin(i * 0.7 + v) * 0.35; cx += Math.cos(a) * 10; cz += Math.sin(a) * 10; pts.push([cx, cz]); if (Math.hypot(p0.x - cx, p0.z - cz) < p0.R) break; }
      f.channel = pts;
      /* the ash road: from behind the player, past the arena, toward a pool; the lost army lies along it */
      const ra = FRONT + Math.PI + (v - 1) * 0.6;
      f.road = windingPath(r, ...polar(ra, 120), ra + Math.PI, 260, 8, 0.12);
      /* fissures: cracks that glow, near and far, all round (they start outside the arena and wander outward) */
      f.fissures = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + (r() - 0.5) * 0.5; const d0 = 19 + r() * 30; const [x0, z0] = polar(a, d0); f.fissures.push(windingPath(r, x0, z0, a + (r() - 0.5) * 1.6, 18 + r() * 40, 2.2, 0.7)); }
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = sd0(ctx);
      let h = (fbm(x * 0.05 + s, z * 0.05, 3) - 0.4) * 1.6 * smooth(16, 30, rr);
      h += 9 * Math.pow(ridged(x * 0.016 + s, z * 0.016, 4), 2.4) * smooth(26, 70, rr) * (0.5 + fbm(x * 0.01, z * 0.01 + s, 2));
      h += ranges(x, z, rr, ang, s, { near: [140, 240], far: [330, 560], ampN: 55, ampF: 125, sharp: 2.5, freq: 0.0055 });
      const dv = Math.hypot(x - f.vx, z - f.vz);
      if (dv < f.vR) { const k = 1 - dv / f.vR; const va = Math.atan2(z - f.vz, x - f.vx); let vh = f.vH * Math.pow(k, 1.7) * (0.9 + 0.2 * ridged(va * 6, dv * 0.03, 3)) - 5 * Math.pow(Math.abs(Math.sin(va * 11 + fbm(dv * 0.02, va, 2) * 3)), 6) * Math.sin(k * Math.PI) - 2.5 * Math.pow(ridged(va * 23, dv * 0.05, 2), 3) * k; const rim = f.vR * 0.09; if (dv < rim) vh = f.vH * Math.pow(1 - rim / f.vR, 1.7) - (rim - dv) * 0.9; h = Math.max(h, vh); }
      for (const p of f.pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.R * 2.2) { const rim = smooth(p.R * 2.2, p.R * 1.1, d); h = h * (1 - rim) + rim * (d < p.R ? -0.9 : lerp(0.6, -0.9, smooth(p.R * 1.5, p.R, d))); } }
      const dc = lineDist(f.channel, x, z); if (dc < 9) h = lerp(h, Math.min(h, -0.6), smooth(9, 3, dc));
      const dr = lineDist(f.road, x, z); if (dr < 5 && rr > 16) h = lerp(h, h * 0.3, smooth(5, 2, dr));
      if (rr > 17 && rr < 120) { let df = 1e9; for (const fl of f.fissures) df = Math.min(df, lineDist(fl, x, z)); if (df < 2) h -= 0.32 * smooth(2, 0.35, df); }
      /* ash drifts: soft low dunes of pale ash */
      if (rr > 17) h += 0.35 * smooth(0.56, 0.72, fbm(x * 0.045 + 21, z * 0.045 - 8, 3)) * smooth(17, 24, rr);
      return h;
    },
    mask(ctx, x, z, h, rr) {
      const f = ctx.f; let crack = 0; let glow = 0;
      for (const p of f.pools) { const d = Math.hypot(x - p.x, z - p.z); crack = Math.max(crack, smooth(p.R * 3.5, p.R * 1.2, d)); glow = Math.max(glow, smooth(p.R * 1.6, p.R * 0.9, d) * 0.6); }
      const dc = lineDist(f.channel, x, z); crack = Math.max(crack, smooth(14, 4, dc)); glow = Math.max(glow, smooth(4, 1.2, dc) * 1.4);
      const dv = Math.hypot(x - f.vx, z - f.vz);
      if (rr > 120 && h < 6) glow = Math.max(glow, smooth(0.6, 0.85, fbm(x * 0.012 + 3, z * 0.012, 3)) * smooth(6, 0, h) * 1.2);
      let road = smooth(4.5, 1.5, lineDist(f.road, x, z));
      if (rr < 30) { crack *= smooth(16, 30, rr); glow *= smooth(16, 30, rr); }
      if (rr > 17 && rr < 120) { let df = 1e9; for (const fl of f.fissures) df = Math.min(df, lineDist(fl, x, z)); crack = Math.max(crack, smooth(3.4, 0.8, df) * 0.9); glow = Math.max(glow, smooth(1.4, 0.2, df) * 1.1); }
      /* pale ash in the drifts and in streaks downwind; darker bare basalt between */
      road = Math.max(road, smooth(0.54, 0.7, fbm(x * 0.045 + 21, z * 0.045 - 8, 3)) * 0.65 * smooth(5, 24, rr), smooth(0.6, 0.75, fbm(x * 0.03 + z * 0.09, z * 0.03 - x * 0.015, 3)) * 0.4 * smooth(3, 8, rr));
      return [road, 0, crack, glow];
    },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r; const land = L.current;
      /* molten pools */
      const lavaMat = lavaMaterial(0xff5a14); land.tickers.push((t) => { lavaMat.userData.lava.uTime.value = t; });
      for (const p of f.pools) {
        const g = new THREE.CircleGeometry(p.R * 1.25, 48); g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, lavaMat); m.position.set(p.x, -0.35, p.z); m.receiveShadow = true; land.group.add(m); land.owned.push(g);
      }
      /* the channel as molten ribbon */
      { const pts = f.channel; const pos = []; const idx = []; for (let i = 0; i < pts.length; i++) { const a = pts[Math.min(i + 1, pts.length - 1)]; const b = pts[Math.max(i - 1, 0)]; let dx = a[0] - b[0]; let dz = a[1] - b[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const w = 2.2 + Math.sin(i * 0.9) * 0.6; const y = Math.max(ctx.H(pts[i][0], pts[i][1]), -0.6) + 0.12; pos.push(pts[i][0] - dz * w, y, pts[i][1] + dx * w, pts[i][0] + dz * w, y, pts[i][1] - dx * w); if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, lavaMat); land.group.add(m); land.owned.push(g); }
      land.owned.push(lavaMat);
      buildFissures(ctx, L, f.fissures, lavaMat);
      buildBasalt(ctx, L, { clusters: 10 });
      { const sg = [stumpGeo(r), stumpGeo(r)]; const sm = new THREE.MeshStandardMaterial({ ...pbr('bark_brown_02'), color: new THREE.Color(BARK.char).multiplyScalar(1.4), roughness: 1, envMapIntensity: 0.12 }); withEmbers(sm, 0xff3a08, 0.9, 0.3);
        const sl = [[], []]; for (let i = 0; i < 26; i++) { const a = r() * TAU; const d = 18 + Math.pow(r(), 0.8) * 60; const [x, z] = polar(a, d); if (angOff(a) < 0.2 && d > 25) continue; const h = 0.5 + r() * 1.6; const sc = 1.0 + r() * 0.9; sl[i % 2].push({ x, y: ctx.H(x, z) - 0.05, z, ry: r() * TAU, tx: (r() - 0.5) * 0.25, tz: (r() - 0.5) * 0.25, s: sc, sy: h / sc }); }
        sg.forEach((g, k) => L.instanced(g, sm, sl[k])); }
      /* heat glow over the pools and the crater */
      addGlows(L, f.pools.map((p) => [p.x, 1.5, p.z, p.R * 4.5]), 0xff4a10, { alpha: 0.32 });
      const craterY = f.vH * Math.pow(1 - 0.09, 1.7);
      addGlows(L, [[f.vx, craterY + 10, f.vz, 110], [f.vx, craterY + 4, f.vz, 55]], 0xff4010, { alpha: 0.45 });
      land.terrain.material.userData.terrain.uVolc.value.set(f.vx, f.vz, f.vR, f.vH);
      L.skyU.uGlowDir.value.set(f.vx, 0.06, f.vz);
      /* the ash plume: a dense dark core, a wide billow and a high drifting sheet, lit red from below */
      addSmoke(L, [f.vx, craterY - 4, f.vz], { n: 70, size: 70, rise: 160, life: 38, wind: [0.15, 0, 0.05], low: 0x1a0c08, high: 0x241a18, hot: 0xff3a08, alpha: 0.95 });
      addSmoke(L, [f.vx, craterY + 20, f.vz], { n: 80, size: 120, rise: 300, life: 70, wind: [0.4, 0, 0.14], low: 0x2a1410, high: 0x2e2826, hot: 0xb02a08, alpha: 0.85 });
      addSmoke(L, [f.vx + 60, craterY + 200, f.vz + 20], { n: 40, size: 200, rise: 120, life: 90, wind: [0.9, 0, 0.3], low: 0x1e1614, high: 0x262220, hot: 0x000000, alpha: 0.55 });
      /* steam off the pools */
      for (const p of f.pools) addSmoke(L, [p.x, 0, p.z], { n: 10, size: p.R * 0.9, rise: 16, life: 9, wind: [0.4, 0, 0.1], low: 0x6a3a28, high: 0x4a4440, hot: 0xff5a20, alpha: 0.35 });
      /* the lost army on the road and around the arena: corpses, banners, a cart, weapons in the ash */
      const along = (lo, hi, side = 1) => { const pts = f.road; for (let k = 0; k < 40; k++) { const i = Math.floor(r() * (pts.length - 1)); const [ax, az] = pts[i]; const [bx, bz] = pts[i + 1]; const t = r(); const px = lerp(ax, bx, t); const pz = lerp(az, bz, t); const d = Math.hypot(px, pz); if (d < lo || d > hi) continue; const dx = bx - ax; const dz = bz - az; const l = Math.hypot(dx, dz); const o = (r() * 2 - 1) * 4 * side; return [px - dz / l * o, pz + dx / l * o, Math.atan2(dx, dz)]; } const a = r() * TAU; return [...polar(a, lo + r() * (hi - lo)), r() * TAU]; };
      ctx.story = { along };
      await buildDeadArmy(ctx, L, { char: true, n: 9, near: [17, 34] });
      buildBanners(ctx, L, { n: 7, color: 0x5a1612, near: [18, 40] });
      buildCart(ctx, L, ...along(20, 30));
      buildWeapons(ctx, L, { n: 22, near: [16, 36] });
    },
    props: [
      { m: 'namaqualand_cliff_01', n: 10, s: [12, 22], d: [60, 130], sink: 0.15, tint: 0x3a302c, tilt: 0.12 },
      { m: 'rock_face_01', n: 16, s: [4, 9], d: [30, 90], sink: 0.2, tint: 0x4a3e3a, tilt: 0.25, cluster: [2, 4], spread: 10 },
      { m: 'namaqualand_boulder_04', n: 22, s: [1.6, 4], d: [20, 75], sink: 0.25, tint: 0x4a3e3a, tilt: 0.3, cluster: [2, 5], spread: 6 },
      { m: 'rock_09', n: 60, s: [0.4, 1.2], d: [5, 70], sink: 0.35, tint: 0x4a3e3a, tilt: 0.5, clutter: true, cluster: [1, 7], spread: 5, tintVar: 0.25, tintTo: 0x6a5a50 },
      { p: 'pebble', shadow: false, n: 60, s: [0.2, 0.6], d: [5, 60], tint: 0x3a302c, tilt: 0.5, clutter: true, cluster: [1, 6], spread: 4, tintVar: 0.3, tintTo: 0x6a5040 },
      { p: 'pebble', shadow: false, n: 160, s: [0.06, 0.32], d: [3, 30], tint: 0x6a5a52, tilt: 0.9, clutter: true, cluster: [3, 12], spread: 2.6, tintVar: 0.35, tintTo: 0x2a1e1a },
      { p: 'deadtree', n: 24, h: [4, 12], d: [24, 100], tint: 0x1c1512, bark: 'char', embers: true, kinds: 4, cluster: [1, 4], spread: 11, lean: [0.08, 0.5], leanP: 0.55 },
      { m: 'dry_branches_medium_01', n: 30, s: [1.2, 2.2], d: [8, 50], tint: 0x2a221e, clutter: true },
    ],
    particles: [
      { kind: 'dot', n: 1600, size: 0.11, vel: [0.3, 1.3, 0.1], var: [0.6, 0.8, 0.6], color: 0xff6a20, add: true, glow: 2.6, sway: 0.5, opacity: 0.95 },
      { kind: 'flake', n: 1500, size: 0.08, vel: [0.35, -0.5, 0.12], var: [0.4, 0.3, 0.4], color: 0x8a817c, opacity: 0.55, sway: 0.7 },
    ],
  },

  /* ---------------- DROWNED FEN: black water, mud islands, dead groves leaning into the water, low fog ---------------- */
  drownedfen: {
    variants: 3, desat: 0.3, groundTint: 0x1e2220, fog: [7, 90], hemi: 0.95, sun: 0.6, sunOffset: [10, 22, 16], exposure: 1.02, fogCol: 0x34464c, skyCols: [0x05090c, 0x3a5058],
    /* cold blue-green: a low mist sky, stars through thin cloud */
    sky: { sunDir: [-0.55, 0.22, -1], sunCol: 0xc8dcd0, sunGlow: 0.5, stars: 0.35, clouds: 0.55, cloudCol: 0x0a1212, cloudLit: 0x405a64, cloudSpd: 0.5, top: 0x04080c, hor: 0x3e5660, pow: 0.5, band: 0.35, bandCol: 0x4f6a6c },
    terrain: { A: ['brown_mud_02', 3.5, 0x2a2e22], B: ['brown_mud_02', 2.2, 0x080a08], C: ['forest_leaves_04', 4, 0x2a2e22], P: 0x3a3a30, rock: [0.5, 0.9], macro: [30, 0.3], nstr: 1.1, rough: [0.9, 0.3], desat: 0.2, bnoise: 0.2, haze: [0x34484a, 0.3, 60, 300], specMax: 0.05 },
    heightMap: 160,
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      f.level = -0.03;
      /* islands: where the ground rises above the black water */
      f.islands = [];
      const n = [14, 8, 10][v];
      for (let i = 0; i < n; i++) { const a = r() * TAU; const d = 22 + Math.pow(r(), 0.7) * 110; const [x, z] = polar(a, d); f.islands.push({ x, z, R: 5 + r() * 12 }); }
      /* variant 1: a drowned causeway of mud and old posts running away from the arena */
      if (v === 1) { const a = FRONT - 0.55; f.causeway = windingPath(r, ...polar(a, 12), a, 160, 7, 0.2); }
      /* every variant has the landmark: a drowned bell tower out in the water ahead, a signal fire still burning in
         its broken top, the light laid across the water toward the arena */
      { const a = FRONT + [0.3, -0.24, 0.14][v] + (r() - 0.5) * 0.08; f.tower = { pos: polar(a, 44 + r() * 6), tilt: 0.1 + r() * 0.06 }; }
      /* and behind the arena a drowned chapel: broken walls standing in the water at mid range */
      /* 26-30 m (was 36-42): the reverse view's subject; with a second
         signal fire in its broken wall (build) */
      f.ruin2 = { pos: polar(FRONT + Math.PI + [0.28, -0.3, 0.12][v] + (r() - 0.5) * 0.1, 26 + r() * 4), rot: r() * TAU };
      /* a sunken causeway on every variant (variant 1 keeps its own) */
      if (v !== 1) { const a = FRONT + [0.75, 0, Math.PI - 0.6][v]; f.causeway = windingPath(r, ...polar(a, 12), a, 160, 7, 0.2); }
      /* groves: clusters of dead trees, some on islands, some leaning out over the water */
      f.groves = []; for (let i = 0; i < [7, 6, 9][v]; i++) { const a = r() * TAU; const d = 22 + r() * 70; if (angOff(a) < 0.25) continue; f.groves.push(polar(a, d)); }
      /* the walk (web/src/journey.js, along the nemesis line) crossed open water between islets. A winding mud
         bank now runs out along that line, 4-5 m wide, reeds on both edges (props, last spec). No rng: every other draw stays. */
      { const ux = Math.cos(NEMESIS_ANG); const uz = Math.sin(NEMESIS_ANG); f.bank = [];
        for (let t = 10; t <= 190; t += 6) { const w = 3.2 * Math.sin(t * 0.045 + v) + 1.6 * Math.sin(t * 0.13 + 2 * v); f.bank.push([ux * t - uz * w, uz * t + ux * w]); } }
    },
    height(ctx, x, z, rr) {
      const f = ctx.f; const s = sd0(ctx);
      let h = -0.55 + (fbm(x * 0.03 + s, z * 0.03, 4) - 0.5) * 1.1;
      if (f.bank) {
        /* the bank itself, and a marsh shelf either side of the walk line (the finds sit up to 25 m off it): wet mud with
           shallow pools and tussocks, not open water; the open water starts about 30 m out */
        const d = lineDist(f.bank, x, z); if (d < 7) h = Math.max(h, lerp(-0.6, 0.1 + (fbm(x * 0.12, z * 0.12, 2) - 0.5) * 0.16, smooth(6.2, 2.6, d)));
        const ux = Math.cos(NEMESIS_ANG); const uz = Math.sin(NEMESIS_ANG); const ta = x * ux + z * uz; const sl = Math.abs(-x * uz + z * ux);
        const k = smooth(44, 30, sl) * smooth(8, 18, ta) * smooth(205, 185, ta);
        if (k > 0) { const pool = smooth(0.56, 0.64, fbm(x * 0.06 + 7, z * 0.06 - 3, 3)); h = Math.max(h, lerp(-0.6, 0.04 + (fbm(x * 0.18 + 2, z * 0.18, 2) - 0.5) * 0.22 - pool * 0.24, k)); }
      }
      for (const isl of f.islands) h = Math.max(h, -0.6 + 0.95 * bump(x, z, isl.x, isl.z, isl.R) + (fbm(x * 0.2, z * 0.2) - 0.5) * 0.3 * bump(x, z, isl.x, isl.z, isl.R));
      if (f.causeway) { const d = lineDist(f.causeway, x, z); h = Math.max(h, lerp(-0.6, 0.18, smooth(4, 1.6, d))); }
      for (const [gx, gz] of f.groves) h = Math.max(h, -0.4 + 0.55 * bump(x, z, gx, gz, 9));
      h += ranges(x, z, rr, Math.atan2(z, x), s, { near: [260, 360], far: [420, 620], ampN: 12, ampF: 34, sharp: 1.4, freq: 0.006 });
      /* the arena: mud at 0 with shallow puddles */
      const ar = 1 - smooth(14, 24, rr);
      /* the puddles stay a hair over the water line (-0.03): below it the still water showed through and mirrored the pale
         horizon as a flat white blob in the reverse view; the mask keeps them dark wet mud */
      if (ar > 0) { const pud = smooth(0.55, 0.62, fbm(x * 0.07 + 1, z * 0.07, 3)); h = lerp(h, -0.022 * pud, ar); }
      return h;
    },
    mask(ctx, x, z, h, rr) { return [0, Math.max(smooth(0.12, -0.1, h), smooth(0.53, 0.58, fbm(x * 0.07 + 1, z * 0.07, 3))), 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r;
      addStillWater(ctx, L, { level: f.level, tint: 0x1c2418, deep: 0x060806, rip: 0.4, R: 300 });
      addFogSheets(ctx, L, [0.3, 0.7, 1.2], { color: 0x9aa58a, alpha: 0.15, R: 85 });
      addFogSheets(ctx, L, [3.5], { color: 0x6a807c, alpha: 0.12, R: 140 });
      /* will-o'-wisps: a few cold lights low over the water, far out */
      { const list = []; for (let i = 0; i < 9; i++) { const a = r() * TAU; const d = 30 + r() * 60; if (angOff(a) < 0.2) continue; const [x, z] = polar(a, d); list.push([x, 0.6 + r() * 1.2, z, 0.5]); }
        const wm = addGlows(L, list, 0x9affd8, { alpha: 1.6 }); const base = list.map((g) => g.slice());
        if (wm) L.current.tickers.push((t) => { const at = wm.geometry.attributes.aG; base.forEach((b, i) => { at.setXYZ(i, b[0] + Math.sin(t * 0.3 + i) * 2.5, b[1] + Math.sin(t * 0.9 + i * 2) * 0.3, b[2] + Math.cos(t * 0.23 + i) * 2.5); }); at.needsUpdate = true; }); }
      /* two huts on stilts, about 30 m out: one with a lit window and a lantern on its porch, one dark and sagging */
      { const a = FRONT + [0.55, -0.5, 0.4][ctx.v]; const [hx, hz] = polar(a, 30 + r() * 4); const rot = Math.atan2(-hx, -hz) + (r() - 0.5) * 0.6;
        const o = buildHut(ctx, L, hx, hz, rot, { y: Math.min(ctx.H(hx, hz), f.level) - 0.1, stilts: 1.7, wood: 0x4a4436, roofTex: 'forest_leaves_04', roofTint: 0x8a8462, lamp: 0xffb868 });
        f.lantern = o.lamp;
        const a2 = a + (r() < 0.5 ? 1 : -1) * (0.3 + r() * 0.1); const [h2x, h2z] = polar(a2, 38 + r() * 6);
        buildHut(ctx, L, h2x, h2z, Math.atan2(-h2x, -h2z) + (r() - 0.5) * 1.2, { y: Math.min(ctx.H(h2x, h2z), f.level) - 0.1, stilts: 1.3, W: 2.8, D: 2.4, H: 1.9, roofH: 1.1, wood: 0x3e3a30, roofTex: 'forest_leaves_04', roofTint: 0x6a6650, lit: false, sag: 0.35 });
        /* a walk of planks on posts between them */
        { const n = Math.ceil(Math.hypot(h2x - hx, h2z - hz) / 1.1); const wl = []; const pl = []; const ang = Math.atan2(h2z - hz, h2x - hx);
          for (let i = 2; i < n - 2; i++) { const t = i / n; const x = lerp(hx, h2x, t) + Math.sin(t * 6) * 0.4; const z = lerp(hz, h2z, t); if (r() < 0.12) continue; wl.push({ x, y: f.level + 0.35 + (r() - 0.5) * 0.06, z, ry: -ang + (r() - 0.5) * 0.12, tx: (r() - 0.5) * 0.06, tz: (r() - 0.5) * 0.08, s: 1, sy: 1 }); if (i % 3 === 0) for (const sd of [-1, 1]) pl.push({ x: x - Math.sin(ang) * 0.7 * sd, y: f.level - 0.8, z: z + Math.cos(ang) * 0.7 * sd, ry: r() * TAU, tx: (r() - 0.5) * 0.15, tz: (r() - 0.5) * 0.15, s: 1, sy: 1.6 + r() * 0.4 }); }
          const plank = new THREE.BoxGeometry(0.22, 0.05, 1.5); const post = new THREE.CylinderGeometry(0.07, 0.09, 1, 6); post.translate(0, 0.5, 0); const wm = triMaterial('bark_brown_02', { tint: 0x4a4436, tile: 0.9, desat: 0.45, specMax: 0.05 });
          L.instanced(plank, wm, wl); L.instanced(post, wm, pl); } }
      if (f.tower) {
        /* the drowned bell tower: a tall broken shaft with a stump beside it and a wall between, leaning in the water */
        const mat = triMaterial('castle_wall_slates', { tint: 0x9a988a, tile: 3, cover: 0x3e4a2a, coverAmt: 0.6 });
        const [x, z] = f.tower.pos; solid(ctx, x, z, 7, 'tower'); const yaw = r() * TAU;
        const m = new THREE.Mesh(towerGeo(r), mat); m.scale.set(30, 27, 30); m.position.set(x, -3, z); m.rotation.set(f.tower.tilt, yaw, f.tower.tilt * 0.5); m.castShadow = true; m.receiveShadow = true;
        /* the top before L.add (it bakes the transform into the mesh) */ m.updateMatrix(); const top = new THREE.Vector3(0, 0.6, 0).applyMatrix4(m.matrix); /* inside the shaft, just over the lowest break (0.55): the fire burns in the ruin, never floats */ L.add(m);
        const [sx, sz] = [x + Math.cos(yaw) * 9, z + Math.sin(yaw) * 9]; const stub = new THREE.Mesh(towerGeo(r), mat); stub.scale.set(20, 11, 20); stub.position.set(sx, -2.5, sz); stub.rotation.set(-0.08, r() * TAU, 0.14); stub.castShadow = true; L.add(stub);
        { const wall = ruinWallGeo(r, 8, 7, 0.9); wall.deleteAttribute('uv'); const wm = new THREE.Mesh(wall, mat); wm.position.set((x + sx) / 2, -1.2, (z + sz) / 2); wm.rotation.set(0, -yaw, 0.06); wm.castShadow = true; L.add(wm); }
        /* the fire in the broken top: a hot core, a wide warm halo, and the light laid across the water toward the arena */
        
        const FIRE = 0xffa05a;
        /* the fire itself writes depth: the post fog reads the depth buffer, so glow cards alone (no depth) took the fog of
           the sky behind them and vanished at this range */
        { const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(FIRE).multiplyScalar(5), toneMapped: false, fog: false }); const fg = new THREE.IcosahedronGeometry(1, 1);
          const core = new THREE.Mesh(fg, fm); core.position.copy(top); core.scale.set(0.75, 0.55, 0.75); core.name = 'fenFire'; L.current.group.add(core);
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.6, 7, 1, true), fm); flame.position.copy(top).y += 1.2; flame.name = 'fenFlame'; L.current.group.add(flame);
          L.current.owned.push(fm, fg, flame.geometry); L.current.tickers.push((t) => { const k = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.3); flame.scale.set(k, 0.8 + 0.4 * k * Math.sin(t * 5.1 + 1) ** 2, k); flame.rotation.y = t * 0.7; }); }
        addGlows(L, [[top.x, top.y + 0.8, top.z, 8], [top.x, top.y + 0.6, top.z, 3.5]], FIRE, { alpha: 0.9 });
        addGlows(L, [[top.x, top.y + 0.3, top.z, 2.2]], 0xffe2b0, { alpha: 1.6 });
        { const toA = Math.atan2(-z, -x); const len = Math.hypot(x, z) - 14; const gw = new THREE.PlaneGeometry(1, 1); gw.rotateX(-Math.PI / 2);
          const U = { uTime: { value: 0 }, uCol: { value: new THREE.Color(FIRE) }, uA: { value: 0 } };
          const rm = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `uniform float uTime; uniform vec3 uCol; uniform float uA; varying vec2 vUv; ${NOISE}
              void main(){ float across = abs(vUv.x - 0.5) * 2.0; float along = vUv.y; /* 1 at the tower, 0 near the arena */
                float w = mix(0.25, 1.0, along); float core = 1.0 - smoothstep(0.0, w, across);
                float rip = sqF2(vec2(vUv.x * 9.0, vUv.y * 70.0 - uTime * 0.6)); float br = smoothstep(0.35, 0.75, rip);
                float a = core * br * (0.15 + 0.85 * pow(along, 1.6)) * uA; gl_FragColor = vec4(uCol * a, 1.0); }` });
          const rf = new THREE.Mesh(gw, rm); rf.scale.set(5, 1, len); rf.position.set(x + Math.cos(toA) * len / 2, f.level + 0.03, z + Math.sin(toA) * len / 2); rf.rotation.y = Math.PI / 2 - toA; rf.renderOrder = 2; rf.frustumCulled = false; rf.name = 'fenFireReflect';
          L.current.group.add(rf); L.current.owned.push(gw, rm); L.current.tickers.push((t) => { U.uTime.value = t; U.uA.value = 0.9 * Math.min(1, L.current?.t / 2 || 0); }); }
      }
      if (f.ruin2) { buildRuin(ctx, L, f.ruin2, { tint: 0x7a7a6c, cover: 0x3a4a2a });
        /* a small fire still burns among the chapel stones: one warm point in the reverse view */
        const [rx, rz] = f.ruin2.pos; const top = new THREE.Vector3(rx, Math.max(ctx.H(rx, rz), f.level) + 0.5, rz);
        const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa05a).multiplyScalar(5), toneMapped: false, fog: false }); const fg = new THREE.IcosahedronGeometry(1, 1);
        const core = new THREE.Mesh(fg, fm); core.position.copy(top); core.scale.set(0.45, 0.3, 0.45); L.current.group.add(core);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.5, 7, 1, true), fm); flame.position.copy(top).y += 0.7; L.current.group.add(flame);
        L.current.owned.push(fm, fg, flame.geometry); L.current.tickers.push((t) => { const k = 0.85 + 0.15 * Math.sin(t * 8) * Math.sin(t * 2.9); flame.scale.set(k, 0.8 + 0.4 * k * Math.sin(t * 4.7) ** 2, k); });
        addGlows(L, [[top.x, top.y + 0.5, top.z, 5], [top.x, top.y + 0.3, top.z, 2]], 0xffa05a, { alpha: 0.85 }); addGlows(L, [[top.x, top.y + 0.2, top.z, 1.2]], 0xffe2b0, { alpha: 1.4 });
        /* the chapel's bell-cote still stands at the end of the long
           wall: two stacked stone piers 9 m tall, a pointed arch between them, a gable cap with a leaning iron cross and the
           bell still hanging, lit from below by the chapel fire. Inside the ruin's solid at local x -4.5, so no new solid.
           Its own rng, so no later draw of this land moves. */
        { const rb = rng(9071 + ctx.v); const c = Math.cos(f.ruin2.rot); const s = Math.sin(f.ruin2.rot);
          const lx = -4.6; const wx = rx + lx * c; const wz = rz - lx * s; const y0 = ctx.H(rx, rz) - 0.25;
          const stone = []; const PH = 8.6;
          for (const px of [-0.95, 0.95]) { let yy = 0; let k = 0; while (yy < PH) { const hh = 0.55 + rb() * 0.25; const b = chunkGeo(rb, { w: 0.82 - k * 0.012, h: hh, d: 1.0 - k * 0.012, chip: 0.22, seg: 2 }); b.rotateY((rb() - 0.5) * 0.06); b.translate(px + (rb() - 0.5) * 0.05, yy, (rb() - 0.5) * 0.05); stone.push(b.toNonIndexed()); yy += hh; k++; } }
          /* the pointed arch: voussoirs on two arcs that meet at the crown */
          { const SP = PH - 1.4; const RA = 1.08 + 0.17; /* each arc is centred on the opposite springing point (x = -/+0.54) */
            for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { const ph = (i + 0.5) / 5 * (Math.PI / 3); const v = chunkGeo(rb, { w: 0.4, h: 0.34, d: 0.9, chip: 0.2, seg: 2 }); v.translate(0, -0.17, 0);
              v.rotateZ(ph - Math.PI / 2); v.translate(-0.54 + RA * Math.cos(ph), SP + RA * Math.sin(ph), 0); if (sd < 0) v.rotateY(Math.PI); stone.push(v.toNonIndexed()); } }
          { const cap = chunkGeo(rb, { w: 2.9, h: 0.45, d: 1.15, chip: 0.25, seg: 2 }); cap.translate(0, PH, 0); stone.push(cap.toNonIndexed()); }
          { const gb = new THREE.ConeGeometry(1.5, 1.3, 4, 1); gb.rotateY(Math.PI / 4); gb.scale(1, 1, 0.42); gb.translate(0, PH + 0.45 + 0.65, 0); stone.push(gb.toNonIndexed()); }
          const sg = mergeGeometries(stone.map((g) => { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return q; })); for (const g of stone) g.dispose();
          const smat = triMaterial('castle_wall_slates', { tint: 0x8a887a, tile: 2.6, cover: 0x3a4a2a, coverAmt: 0.55, nstr: 1.4 });
          const cote = new THREE.Group(); cote.position.set(wx, y0, wz); cote.rotation.y = f.ruin2.rot + (rb() - 0.5) * 0.08; cote.rotation.z = 0.035;
          const sm = new THREE.Mesh(sg, smat); sm.castShadow = true; sm.receiveShadow = true; cote.add(sm);
          /* the bell: a bronze lathe on a yoke beam, and a leaning iron cross on the gable */
          const bp = [[0.0, 0.02], [0.3, 0.0], [0.42, 0.05], [0.38, 0.14], [0.3, 0.3], [0.26, 0.52], [0.22, 0.66], [0.12, 0.72], [0.0, 0.74]].map(([a, b]) => new THREE.Vector2(a, b));
          const bell = new THREE.LatheGeometry(bp, 14); bell.translate(0, -0.9, 0);
          const bmat = new THREE.MeshStandardMaterial({ color: 0x5a4a2c, roughness: 0.45, metalness: 0.8, envMapIntensity: 0.5, side: THREE.DoubleSide });
          const bm = new THREE.Mesh(bell, bmat); bm.position.set(0, PH - 0.55, 0); bm.rotation.z = 0.12; bm.castShadow = true; cote.add(bm);
          const iron = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.7, metalness: 0.4 });
          const yoke = new THREE.BoxGeometry(1.7, 0.16, 0.18); yoke.translate(0, PH - 0.5, 0);
          const cx1 = new THREE.BoxGeometry(0.09, 1.3, 0.09); cx1.translate(0, 0.65, 0); const cx2 = new THREE.BoxGeometry(0.62, 0.09, 0.09); cx2.translate(0, 0.92, 0);
          const cross = mergeGeometries([cx1, cx2]); cross.rotateZ(0.22); cross.translate(0, PH + 1.65, 0);
          const ig = mergeGeometries([yoke.toNonIndexed(), cross.toNonIndexed()]); for (const g of [yoke, cx1, cx2, cross]) g.dispose(); cote.add(new THREE.Mesh(ig, iron));
          L.current.owned.push(sg, smat, bell, bmat, ig, iron);
          cote.userData.growY = 1; cote.scale.y = 0.0001; L.current.parts.push(cote); L.current.group.add(cote);
          /* the fire's light caught on the bell's lip and the arch soffit */
          cote.updateMatrixWorld(true); const bl = new THREE.Vector3(0, PH - 1.35, 0.1).applyMatrix4(cote.matrixWorld);
          addGlows(L, [[bl.x, bl.y, bl.z, 1.6]], 0xffa05a, { alpha: 0.35 }); } }
      if (f.causeway) {
        /* old posts along the causeway */
        const pts = f.causeway; const list = [];
        for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1]; const [bx, bz] = pts[i]; const dx = bx - ax; const dz = bz - az; const l = Math.hypot(dx, dz) || 1; for (const s of [-1, 1]) { if (r() < 0.25) continue; const x = bx - dz / l * 2.3 * s; const z = bz + dx / l * 2.3 * s; if (Math.hypot(x, z) < ARENA_R + 1) continue; list.push({ x, y: ctx.H(x, z) - 0.3, z, ry: r() * TAU, tx: (r() - 0.5) * 0.35, tz: (r() - 0.5) * 0.35, s: 0.12 + r() * 0.06, sy: (1.2 + r() * 1.4) / (0.15) }); } }
        const g = new THREE.CylinderGeometry(1, 1.15, 1, 7, 1); g.translate(0, 0.5, 0);
        L.instanced(g, triMaterial('bark_brown_02', { tint: 0x5a5244, tile: 1.5, cover: 0x3a4a28, coverAmt: 0.6 }), list);
      }
    },
    props: [
      { p: 'deadtree', n: 34, h: [6, 14], at: (ctx) => { const out = []; const r = ctx.r; for (const [gx, gz] of ctx.f.groves) { const k = 3 + Math.floor(r() * 5); for (let i = 0; i < k && out.length < 40; i++) { const a = r() * TAU; const d = r() * 9; const x = gx + Math.cos(a) * d; const z = gz + Math.sin(a) * d; if (Math.hypot(x, z) > ARENA_R + 2) out.push([x, z]); } } return out; },
        tint: 0x3a3a30, bark: 'wet', moss: true, mossCol: 0x4a5236, cover: 0x4a5a30, coverAmt: 0.5, lean: [0.26, 0.52], leanP: 0.35, shadowMax: 45, roots: 7, kinds: 5, ring: 1.8 },
      { p: 'deadtree', n: 26, h: [5, 10], d: [90, 170], tint: 0x2a2a24, bark: 'wet', moss: true, cluster: [3, 6], spread: 12, lean: [0.1, 0.4], leanP: 0.3, roots: 5 },
      /* reeds and rushes crowd the foot of every grove tree, so no trunk ends in a clean cut at the water */
      { p: 'reeds', n: 60, h: [0.7, 1.8], color: 0x34362a, at: (ctx) => { const out = []; const r = ctx.r; for (const [gx, gz] of ctx.f.groves) for (let i = 0; i < 6; i++) { const a = r() * TAU; const d = 1 + r() * 8; const x = gx + Math.cos(a) * d; const z = gz + Math.sin(a) * d; if (Math.hypot(x, z) > ARENA_R + 1) out.push([x, z]); } return out; } },
      { m: 'root_cluster_01', n: 16, s: [3, 5.5], d: [22, 80], sink: 0.25, tint: 0x4a4a3e, cluster: [1, 3], spread: 8 },
      { m: 'dead_tree_trunk_02', n: 14, s: [4, 8], d: [18, 70], sink: 0.4, tint: 0x4a4a40, cover: 0x3e4e28, coverAmt: 0.8, clutter: true, where: (ctx, x, z) => (Math.hypot(x, z) > ARENA_R + 1 ? 1 : 0) },
      { p: 'reeds', n: 150, h: [0.9, 2.8], d: [17, 85], color: 0x2a2c20, cluster: [3, 9], spread: 4, where: (ctx, x, z) => { const h = ctx.H(x, z); const B = ctx.f.bank; /* tall reeds stay off the walk bank (they filled the view) */ return (h > -0.35 && h < 0.15 ? 1 : 0.05) * (fbm(x * 0.05 + 4, z * 0.05, 3) > 0.48 ? 1 : 0.15) * (B && lineDist(B, x, z) < 10 ? 0.05 : 1); } },
      { p: 'deadtree', n: 3, h: [16, 22], d: [60, 120], tint: 0x14161a, bark: 'wet', moss: true, mossCol: 0x2a3430, lean: [0.05, 0.2], radK: 0.1, shadow: false },
      { m: 'fern_02', n: 26, s: [1.4, 2.4], d: [18, 60], tint: 0x4a5a3a, clutter: true, where: (ctx, x, z) => (ctx.H(x, z) > 0.05 ? 1 : 0) },
      /* reed beds along both edges of the walk bank, in clumps with gaps, so the bank reads as marsh, not a road */
      { p: 'reeds', n: 110, h: [0.7, 1.5], color: 0x30321f, at: (ctx) => { const out = []; const r = ctx.r; const B = ctx.f.bank || [];
        for (let i = 1; i < B.length; i++) { const [ax, az] = B[i - 1]; const [bx, bz] = B[i]; const dx = bx - ax; const dz = bz - az; const l = Math.hypot(dx, dz) || 1;
          for (const sg of [-1, 1]) { if (r() < 0.3) continue; const t = r(); const o = 3.6 + r() * 2.2; const x = ax + dx * t - (dz / l) * o * sg; const z = az + dz * t + (dx / l) * o * sg; if (Math.hypot(x, z) > ARENA_R + 2) out.push([x, z]); } }
        return out; } },
    ],
    particles: [
      { kind: 'firefly', n: 300, size: 0.12, vel: [0.05, 0.05, 0], var: [0.5, 0.3, 0.5], color: 0xd8ff8a, add: true, glow: 2.6, sway: 1.2, y0: 0.2, box: 7 },
      { kind: 'dot', n: 500, size: 0.04, vel: [0.1, -0.05, 0.05], var: [0.2, 0.1, 0.2], color: 0xc8d0b0, opacity: 0.3, sway: 0.4 },
    ],
  },

  /* ---------------- VINEWILD: giant buttress trees, a closed canopy in three depths, hanging vines, a sunken temple ---------------- */
  vinewild: {
    variants: 3, desat: 0.15, groundTint: 0x2a2818, fog: [6, 80], hemi: 1.0, sun: 0.6, sunOffset: [-10, 26, 12], exposure: 1.04, fogCol: 0x4a3c26, skyCols: [0x1a1014, 0x8a6038],
    /* warm dusk through a torn canopy: gold low in the sky, god-ray streaks, the canopy edge overhead */
    sky: { sunDir: [-0.3, 0.5, -1], sunCol: 0xffc070, sunGlow: 1.0, clouds: 0.5, cloudCol: 0x2a1a18, cloudLit: 0xd08a4a, cloudSpd: 0.6, top: 0x1c1418, hor: 0xc08048, pow: 0.55, band: 0.5, bandCol: 0xd9a060 },
    terrain: { A: ['forest_leaves_04', 3.2, 0x4a4430], B: ['rocky_terrain_02', 4, 0x3a3826], C: ['rocky_terrain_02', 7, 0x3e3e30], P: 0x5a4632, rock: [0.3, 0.6], macro: [30, 0.3], nstr: 1.2, rough: [0.9, 0.8], desat: 0.1, bnoise: 0.35, canopy: 0.7, haze: [0x5a4428, 0.3, 60, 260] },
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      /* the giants: big trees close to the arena that hold up the canopy */
      f.giants = []; const ng = [9, 11, 8][v];
      for (let i = 0; i < ng * 3 && f.giants.length < ng; i++) { const a = r() * TAU; const d = 22 + r() * 36; if (angOff(a) < 0.24) continue; const [x, z] = polar(a, d); if (f.giants.some((g) => Math.hypot(g.x - x, g.z - z) < 14)) continue; f.giants.push({ x, z, R: 1.2 + r() * 0.9, H: 30 + r() * 14 }); }
      /* the worn path out of the arena */
      const pa = [FRONT - 0.7, FRONT + 0.6, FRONT + Math.PI * 0.8][v];
      f.path = windingPath(r, ...polar(pa, 6), pa, 120, 6, 0.3);
      /* temple: ahead-left, right, or a ravine variant without a temple */
      /* the temple stood 70-90 m out, past the fog end (80 m): no land view ever showed it and the jungle had no subject.
         It now stands 44-50 m out, 0.45-0.8 rad off the nemesis line, in every variant (the ravine variant too), with a
         fire burning on its top (buildTemple): one warm focal point in the green murk. The r() draws stay the same. */
      { const ta = [-2.05, -0.75, FRONT + 0.5][v] + (r() - 0.5) * 0.15; const td = 70 + r() * 20; const rot = r() * TAU; f.temple = { pos: polar(ta, 44 + (td - 70) * 0.3), rot, fire: true }; }
      f.ravine = v === 2 ? { ang: FRONT - 0.6 + (r() - 0.5) * 0.3 } : null;
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = sd0(ctx);
      let h = (fbm(x * 0.04 + s, z * 0.04, 4) - 0.45) * 3.5 * smooth(16, 40, rr);
      h += ranges(x, z, rr, ang, s, { near: [200, 320], far: [380, 600], ampN: 30, ampF: 70, sharp: 1.6, freq: 0.006 });
      for (const g of f.giants) h += 0.9 * bump(x, z, g.x, g.z, g.R * 6);
      const dp = lineDist(f.path, x, z); if (dp < 4 && rr > 16) h = lerp(h, h * 0.4, smooth(4, 1.5, dp));
      if (f.temple) h = lerp(h, 1.2, bump(x, z, f.temple.pos[0], f.temple.pos[1], 40) > 0.3 ? 1 : 0);
      if (f.ravine) { const off = angOff(ang, f.ravine.ang); h -= 14 * smooth(0.35, 0.05, off) * smooth(36, 60, rr); }
      return h;
    },
    mask(ctx, x, z, h, rr) { return [smooth(3.2, 1.0, lineDist(ctx.f.path, x, z)), 0, 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r; const land = L.current;
      /* the giant trees */
      const bark = triMaterial('bark_brown_02', { tint: 0x8a8670, tile: 2.2, cover: 0x2e4a22, coverAmt: 0.7, desat: 0.2 });
      const kinds = [0, 1, 2].map(() => trunkGeo(r, { buttress: true, radius: 0.04, radial: 14 }).bark);
      const byKind = [[], [], []];
      f.giants.forEach((g, i) => byKind[i % 3].push({ x: g.x, y: ctx.H(g.x, g.z), z: g.z, ry: r() * TAU, s: g.H, sy: 1 * (g.R / (g.H * 0.04)) ** 0 }));
      /* trunk width: unit radius 0.04 x height; scale x/z separately so a 40 m tree is ~1.6 m across */
      byKind.forEach((list, k) => { const m = L.instanced(kinds[k], bark, list.map((it) => ({ ...it, s: it.s, sy: 1 }))); });
      land.owned.push(bark);
      /* the canopy: crowns over the giants, then three walls of crowns at 80, 160 and 300 m */
      const tones = [0x1d2f1f, 0x3c5a35, 0x7a9a5a];
      const crown = crownClusterGeo(r, { ends: 11, per: 56, size: 0.2, spread: 0.24, tones }); const crownFar = crownClusterGeo(r, { ends: 7, per: 30, size: 0.3, spread: 0.3, tones });
      /* two more crown shapes: a tall domed one and a wide flat-topped one, so the walls are not rows of one umbrella */
      const crownTall = crownClusterGeo(r, { ends: 9, per: 44, size: 0.22, spread: 0.3, flat: 0.95, tones }); const crownWide = crownClusterGeo(r, { ends: 13, per: 36, size: 0.26, spread: 0.2, flat: 0.38, tones });
      const pick3 = (list, geos, mat) => { const by = geos.map(() => []); for (const it of list) by[Math.floor(r() * geos.length)].push(it); by.forEach((l, k) => L.instanced(geos[k], mat, l, { shadow: false, ownGeo: false })); };
      const leafNear = leafClusterMaterial(0xfff0d8, { trans: 0x6a4a10 });
      const leafMid = leafClusterMaterial(0xc8b89a, { trans: 0x3a2808 });
      const leafFar = leafClusterMaterial(0x8a8070);
      const near = []; for (const g of f.giants) for (let k = 0; k < 2 + Math.floor(r() * 4); k++) { const a = r() * TAU; const d = r() * 10; near.push({ x: g.x + Math.cos(a) * d, y: ctx.H(g.x, g.z) + g.H * (0.68 + r() * 0.36), z: g.z + Math.sin(a) * d, ry: r() * TAU, s: 6 + r() * 12, sy: 0.45 + r() * 0.5 }); }
      pick3(near, [crown, crownTall, crownWide], leafNear);
      const wall = (d0, d1, n, hMin, hMax, sMin, sMax) => { const out = []; for (let i = 0; i < n; i++) { const a = r() * TAU; const d = d0 + r() * (d1 - d0); if (angOff(a) < 0.18 && d < 300) continue; const [x, z] = polar(a, d); const k = Math.pow(r(), 1.4); out.push({ x, y: ctx.H(x, z) + hMin + k * (hMax - hMin), z, ry: r() * TAU, s: (sMin + r() * (sMax - sMin)) * (0.7 + k * 0.6), sy: 0.4 + r() * 0.55 }); } return out; };
      pick3(wall(70, 110, 120, 12, 36, 8, 17), [crownTall, crownTall, crown, crownWide], leafMid);
      pick3(wall(140, 190, 160, 16, 44, 14, 28), [crownFar, crownTall, crownWide], leafFar);
      L.instanced(crownFar, leafFar, wall(260, 340, 200, 26, 56, 24, 42), { shadow: false, ownGeo: false });
      land.owned.push(crown, crownFar, crownTall, crownWide);
      /* mid and far trunks under those walls */
      const thin = trunkGeo(r, { buttress: true, radius: 0.03, radial: 8 }).bark;
      const trunks = []; for (let i = 0; i < 140; i++) { const a = r() * TAU; const d = 60 + r() * 140; if (angOff(a) < 0.18) continue; const [x, z] = polar(a, d); const hh = (d < 110 ? 14 : 18) + Math.pow(r(), 0.8) * 22; trunks.push({ x, y: ctx.H(x, z), z, ry: r() * TAU, tx: (r() - 0.5) * 0.12, tz: (r() - 0.5) * 0.12, s: hh * (0.8 + r() * 0.4), sy: 1 / (0.8 + r() * 0.4) }); }
      L.instanced(thin, triMaterial('bark_brown_02', { tint: 0x6a6656, tile: 2.2, cover: 0x2e4a22, coverAmt: 0.8, specMax: 0.05 }), trunks, { shadow: false });
      /* understory: young trees 6 to 13 m with low, small crowns between the giants */
      { const yt = trunkGeo(r, { thin: true, radial: 7 }).bark; const ys = []; const yc = [];
        for (let i = 0; i < 44; i++) { const a = r() * TAU; const d = 20 + r() * 50; if (angOff(a) < 0.2) continue; const [x, z] = polar(a, d); if (f.giants.some((g) => Math.hypot(g.x - x, g.z - z) < 4)) continue; if (lineDist(f.path, x, z) < 2.5) continue; const hh = 6 + r() * 7; const lean = (r() - 0.5) * 0.25;
          ys.push({ x, y: ctx.H(x, z), z, ry: r() * TAU, tx: lean, tz: (r() - 0.5) * 0.2, s: hh, sy: 1 }); const nc = 2 + Math.floor(r() * 2); for (let c = 0; c < nc; c++) { const t = 0.55 + (c / nc) * 0.45 + r() * 0.08; yc.push({ x: x + lean * hh * t * 0.9 + (r() - 0.5) * 1.6, y: ctx.H(x, z) + hh * t, z: z + (r() - 0.5) * 1.6, ry: r() * TAU, s: (1.2 + r() * 1.8) * (1.1 - t * 0.4), sy: 0.7 + r() * 0.6 }); } }
        L.instanced(yt, triMaterial('bark_brown_02', { tint: 0x7a7460, tile: 1.6, cover: 0x2e4a22, coverAmt: 0.7, specMax: 0.05 }), ys, { shadow: true }); pick3(yc, [crownTall, crownTall, crown], leafNear); }
      /* surface roots snaking out from each giant across the floor */
      { const rg = [0, 1, 2].map(() => { const pts = []; let x = 0; let z = 0; let a = 0; for (let i = 0; i <= 8; i++) { pts.push(new THREE.Vector3(x, 0.12 * (1 - i / 8) + 0.03 * Math.sin(i * 1.7), z)); a += (r() - 0.5) * 0.7; x += Math.cos(a) * 1.0; z += Math.sin(a) * 1.0; } uvS = 1; return taperTube(pts, 0.2, 0.04, 6, 24); });
        const rl = [[], [], []]; for (const g of f.giants) for (let k = 0; k < 6; k++) { const a = r() * TAU; const x = g.x + Math.cos(a) * g.R * 0.9; const z = g.z + Math.sin(a) * g.R * 0.9; rl[k % 3].push({ x, y: ctx.H(x, z) - 0.06, z, ry: -a + (r() - 0.5) * 0.4, s: 0.9 + r() * 0.8, sy: 1 }); }
        const rm = triMaterial('bark_brown_02', { tint: 0x6a6450, tile: 1.2, cover: 0x2e4a22, coverAmt: 0.8, specMax: 0.05 }); rg.forEach((g, k) => L.instanced(g, rm, rl[k])); }
      /* leaf litter: drifts of fallen leaves in browns and dull gold, thicker near the trunks, none on the path */
      { const lt = leafTex(); lt.wrapT = THREE.ClampToEdgeWrapping; const lmat = new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.95, alphaMap: lt, alphaTest: 0.5, envMapIntensity: 0.05, polygonOffset: true, polygonOffsetFactor: -2 });
        const lg = new THREE.PlaneGeometry(1, 1); lg.rotateX(-Math.PI / 2); const list = [];
        for (let i = 0; i < 1000 && list.length < 520; i++) { const a = r() * TAU; const d = 3 + Math.pow(r(), 0.9) * 55; const [x, z] = polar(a, d); if (lineDist(f.path, x, z) < 1.0) continue; let k = 0.25; for (const g of f.giants) k = Math.max(k, smooth(14, 3, Math.hypot(x - g.x, z - g.z))); if (r() > k * smooth(0.3, 0.6, fbm(x * 0.1 + 3, z * 0.1, 2) + 0.15)) continue; list.push({ x, y: ctx.H(x, z) + 0.025, z, ry: r() * TAU, s: 0.5 + r() * 1.1, sy: 1, delay: 0 }); }
        const lm2 = L.instanced(lg, lmat, list, { shadow: false }); if (lm2) { const ic = new THREE.Color(); const cs = [0x6a4a2a, 0x8a6a3a, 0x4a3a24, 0x7a7040, 0x9a5a2a]; list.forEach((it, k) => { ic.set(cs[Math.floor(r() * cs.length)]).multiplyScalar(0.7 + r() * 0.6); lm2.setColorAt(k, ic); }); lm2.instanceColor.needsUpdate = true; } }
      /* hanging vines: ribbons from the crowns and branches, 4 to 10 m long, moving in the wind */
      buildVines(ctx, L, f.giants);
      if (f.temple) buildTemple(ctx, L, f.temple);
      /* god rays: warm dusk light through the canopy gaps */
      buildShafts(ctx, L, { trees: f.giants.map((g) => ({ x: g.x, z: g.z })) }, { color: 0xffc070, alpha: 0.07, n: 10, spot: 0xd9a050 });
    },
    props: [
      { m: 'gothic_statue', n: 2, h: [2.4, 3.2], d: [26, 50], tint: 0x6a7060, cover: 0x3e6a2a, coverAmt: 1, tilt: 0.3 },
      { m: 'rock_moss_set_02', n: 10, s: [5, 9], d: [24, 75], sink: 0.15, tint: 0x8a9a7a },
      /* leaf plants: clumped 3x near the giant trunks and along the path */
      { p: 'fern', n: 420, h: [0.5, 1.9], d: [17, 70], kinds: 6, tintVar: 0.3, tintTo: 0xa08a50, tones: [0x1d2f1f, 0x3c5a35, 0x7a9a5a], where: (ctx, x, z) => { const f = ctx.f; let k = 0.15; for (const g of f.giants) k = Math.max(k, smooth(16, 4, Math.hypot(x - g.x, z - g.z))); return lineDist(f.path, x, z) < 1.2 ? 0 : k; } },
      { p: 'fern', n: 380, h: [0.16, 0.42], d: [4, 16.5], kinds: 6, tintVar: 0.3, tintTo: 0xa08a50, tones: [0x1d2f1f, 0x3c5a35, 0x7a9a5a], cluster: [2, 11], spread: 3, where: (ctx, x, z) => (lineDist(ctx.f.path, x, z) < 1.2 ? 0 : 1) },
      { p: 'heather', n: 150, h: [0.25, 0.55], d: [5, 45], root: 0x1a2416, tip: 0x5a7a3a, clutter: true, cluster: [3, 10], spread: 3, tintVar: 0.3, tintTo: 0xa09050, where: (ctx, x, z) => (lineDist(ctx.f.path, x, z) < 1.4 ? 0 : 0.8) },
      { m: 'fern_02', n: 90, s: [1.4, 3.2], d: [17, 90], tint: 0x5a6a42, clutter: true, where: (ctx, x, z) => { const f = ctx.f; let k = 0.12; for (const g of f.giants) k = Math.max(k, smooth(16, 4, Math.hypot(x - g.x, z - g.z))); k = Math.max(k, smooth(5, 2.2, lineDist(f.path, x, z)) * 0.9); return lineDist(f.path, x, z) < 1.2 ? 0 : k; } },
      { m: 'shrub_03', n: 140, s: [2.5, 4.5], d: [10, 85], tint: 0x7a9068, clutter: true, where: (ctx, x, z) => { const f = ctx.f; let k = 0.1; for (const g of f.giants) k = Math.max(k, smooth(14, 5, Math.hypot(x - g.x, z - g.z))); return lineDist(f.path, x, z) < 1.5 ? 0 : k; } },
      { m: 'root_cluster_01', n: 10, s: [3, 5], d: [20, 70], sink: 0.15, tint: 0x5a6050, cover: 0x3e6a2a, coverAmt: 0.6 },
    ],
    particles: [
      { kind: 'rain', n: 900, vel: [0, -9, 0.6], color: 0xb0c0b8, opacity: 0.18, len: 0.5, box: 22 },
      { kind: 'firefly', n: 180, size: 0.11, vel: [0, 0.05, 0], var: [0.5, 0.3, 0.5], color: 0x9affd0, add: true, glow: 2.4, sway: 1.2, y0: 0.4, box: 8 },
    ],
  },

  /* ---------------- BARROW MOOR: burial mounds, standing stones, one lit cairn, thick ruins, heather ---------------- */
  barrowmoor: {
    variants: 3, desat: 0.35, groundTint: 0x2b2a30, fog: [12, 140], hemi: 0.95, sun: 0.75, sunOffset: [12, 24, 14], exposure: 1.0, fogCol: 0x262634, skyCols: [0x06060c, 0x3a3c50],
    /* fast, broken cloud racing over a cold moon */
    sky: { sunDir: [-0.55, 0.3, -1], sunCol: 0xd8e0f4, sunGlow: 0.6, clouds: 0.95, cloudCol: 0x0a0b12, cloudLit: 0x6a7090, cloudSpd: 7, cloudLo: 0.22, top: 0x05060c, hor: 0x343648, pow: 0.5, band: 0.15, bandCol: 0x6a6a90, stars: 0.4 },
    terrain: { A: ['brown_mud_02', 3.2, 0x3e3c44], B: ['aerial_grass_rock', 6, 0x8a8670], C: ['rock', 6, 0x5a5a5e], P: 0x262228, rock: [0.32, 0.6], macro: [24, 0.38], nstr: 1.2, rough: [0.92, 0.95], desat: 0.3, bnoise: 0.4, path: 0.85, strata: [0.3, 0.3, 2, 0] },
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      f.mounds = []; const nm = [8, 6, 10][v];
      for (let i = 0; i < nm * 4 && f.mounds.length < nm; i++) { const a = r() * TAU; const d = 26 + Math.pow(r(), 0.8) * 70; if (angOff(a) < 0.24) continue; const [x, z] = polar(a, d); const R = 4 + r() * 3.5; if (f.mounds.some((m) => Math.hypot(m.x - x, m.z - z) < m.R + R + 6)) continue; f.mounds.push({ x, z, R, H: 2 + r() * 2 }); }
      /* the cairn: on the nearest mound in front, the only warm light on the moor */
      const front = f.mounds.slice().sort((a, b) => angOff(Math.atan2(a.z, a.x), FRONT - 0.5) - angOff(Math.atan2(b.z, b.x), FRONT - 0.5));
      f.cairn = front[1] || front[0];
      /* the barrow: a big mound with a stone door that faces the arena, a dark trodden path leading to it */
      { const a = FRONT + [-0.5, 0.75, -0.85][v] + (r() - 0.5) * 0.1; const [bx, bz] = polar(a, 42 + r() * 6);
        f.mounds = f.mounds.filter((m) => Math.hypot(m.x - bx, m.z - bz) > m.R + 22);
        f.barrow = { x: bx, z: bz, R: 9, H: 5.2 }; f.mounds.push(f.barrow); if (!f.mounds.includes(f.cairn)) f.cairn = f.mounds[0];
        const da = Math.atan2(-bz, -bx); const doorD = f.barrow.R * 1.7; f.door = [bx + Math.cos(da) * doorD, bz + Math.sin(da) * doorD, da];
        f.path = windingPath(r, ...polar(a, 4), a, Math.hypot(f.door[0], f.door[1]) - 4, 3, 0.18); f.path.push([f.door[0], f.door[1]]); }
      f.ruin = { pos: polar([-2.1, -0.7, FRONT + Math.PI * 0.7][v] + (r() - 0.5) * 0.2, 46 + r() * 16), rot: r() * TAU };
      f.ring = v === 1 ? { pos: polar(FRONT - 0.35, 34), R: 9 } : null;
      f.keep = polar(NEMESIS_ANG - 0.75 + (v - 1) * 0.3, 300);
      /* behind the player: a row of long barrows with tall facade stones, and a crowned mound with a ring of stones */
      { const la = FRONT + Math.PI + (r() - 0.5) * 0.5; f.longs = [];
        for (let i = 0; i < 3; i++) { const a = la + (i - 1) * (0.34 + r() * 0.08); const d = 38 + Math.abs(i - 1) * 7 + r() * 8; const [x, z] = polar(a, d); f.longs.push({ x, z, ang: a + Math.PI / 2 + (r() - 0.5) * 0.7, L: 18 + r() * 8, W: 5 + r() * 1.6, H: 3.4 + r() * 1.6 }); }
        const side = r() < 0.5 ? 1 : -1; f.crown = { pos: polar(la + side * (0.95 + r() * 0.2), 31 + r() * 5), R: 7 };
        f.mounds = f.mounds.filter((m) => f.longs.every((lb) => Math.hypot(m.x - lb.x, m.z - lb.z) > m.R * 2 + lb.L * 0.6) && Math.hypot(m.x - f.crown.pos[0], m.z - f.crown.pos[1]) > m.R * 2 + 14);
        if (!f.mounds.includes(f.cairn)) f.cairn = f.mounds.find((m) => m !== f.barrow) || f.barrow; }
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = sd0(ctx);
      let h = (fbm(x * 0.025 + s, z * 0.025, 4) - 0.45) * 6 * smooth(16, 50, rr) + (fbm(x * 0.09, z * 0.09 + s, 2) - 0.5) * 0.8 * smooth(16, 24, rr);
      h += ranges(x, z, rr, ang, s, { near: [180, 300], far: [380, 620], ampN: 30, ampF: 70, sharp: 1.3, freq: 0.004 });
      for (const m of f.mounds) { const d = Math.hypot(x - m.x, z - m.z) / (m.R * 2.1); if (d < 1) h += m.H * Math.pow(Math.cos(d * Math.PI / 2), 1.6); }
      if (f.door) { const dp = lineDist(f.path, x, z); if (dp < 2.2 && rr > 16) h -= 0.12 * smooth(2.2, 0.6, dp); }
      for (const lb of f.longs) { const dx = x - lb.x; const dz = z - lb.z; const u = dx * Math.cos(lb.ang) + dz * Math.sin(lb.ang); const v2 = -dx * Math.sin(lb.ang) + dz * Math.cos(lb.ang); const e = Math.hypot(u / (lb.L / 2) * (u > 0 ? 1 : 1.25), v2 / lb.W); if (e < 1) h += lb.H * Math.pow(Math.cos(e * Math.PI / 2), 1.3) * (u > 0 ? 1 : 0.8 + 0.2 * (1 + u / (lb.L / 2))); }
      { const d = Math.hypot(x - f.crown.pos[0], z - f.crown.pos[1]) / (f.crown.R * 2); if (d < 1) h += 3.2 * Math.pow(Math.cos(d * Math.PI / 2), 1.5); }
      h += 22 * bump(x, z, f.keep[0], f.keep[1], 70);
      return h;
    },
    mask(ctx, x, z, h, rr) {
      /* dark peat everywhere; pale dry grass only on the mound tops; a dark trodden path to the barrow door */
      let top = 0; for (const m of ctx.f.mounds) top = Math.max(top, smooth(m.R * 1.5, m.R * 0.5, Math.hypot(x - m.x, z - m.z)));
      for (const lb of ctx.f.longs) top = Math.max(top, smooth(lb.L * 0.5, lb.W * 0.4, Math.hypot(x - lb.x, z - lb.z)) * 0.8);
      top = Math.max(top, smooth(ctx.f.crown.R * 1.4, ctx.f.crown.R * 0.4, Math.hypot(x - ctx.f.crown.pos[0], z - ctx.f.crown.pos[1])));
      const path = ctx.f.path ? smooth(1.8, 0.5, lineDist(ctx.f.path, x, z)) * (rr > 14 ? 1 : smooth(8, 14, rr)) : 0;
      return [path, top * 0.95, 0, 0];
    },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r; const land = L.current;
      /* standing stones around and on top of the mounds, plus a ring in one variant */
      const stoneMat = triMaterial('rock', { tint: 0x9a9a94, tile: 1.6, cover: 0x5a6448, coverAmt: 0.45, nstr: 1.7 });
      const sg = [0, 1, 2].map(() => slabGeo(r));
      const lists = [[], [], []]; const push = (x, z, H) => { const la = r() * TAU; const l = 0.09 + r() * 0.17; let gy = ctx.H(x, z); for (let k = 0; k < 4; k++) gy = Math.min(gy, ctx.H(x + Math.cos(k * 1.57) * H * 0.3, z + Math.sin(k * 1.57) * H * 0.3)); lists[Math.floor(r() * 3)].push({ x, y: gy - 0.35, z, ry: r() * TAU, tx: Math.cos(la) * l, tz: Math.sin(la) * l, s: H * 1.1, sy: 1 }); (ctx.blobs || (ctx.blobs = [])).push([x, z, H * 0.5]); };
      for (const m of f.mounds) { if (m === f.cairn) continue; const k = 2 + Math.floor(r() * 4); for (let i = 0; i < k; i++) { const a = r() * TAU; const d = m.R * (1.7 + r() * 0.6); push(m.x + Math.cos(a) * d, m.z + Math.sin(a) * d, 1.6 + r() * 2.2, 0.3); } if (r() < 0.5) push(m.x, m.z, 2.4 + r() * 1.2, 0.15); }
      if (f.ring) for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU; if (r() < 0.15) continue; push(f.ring.pos[0] + Math.cos(a) * f.ring.R, f.ring.pos[1] + Math.sin(a) * f.ring.R, 2.2 + r() * 1.6, 0.18); }
      /* the long barrows: a facade of tall stones at the broad end, a capstone, a few stones along the ridge */
      for (const lb of f.longs) { const ca = Math.cos(lb.ang); const sa = Math.sin(lb.ang); const ex = lb.x + ca * lb.L * 0.5; const ez = lb.z + sa * lb.L * 0.5;
        for (let k = -2; k <= 2; k++) { if (r() < 0.12) continue; const o = k * 1.5 + (r() - 0.5) * 0.4; push(ex - sa * o + ca * 0.6, ez + ca * o + sa * 0.6, (3.4 + r() * 1.6) * (1 - Math.abs(k) * 0.16)); }
        for (let k = 0; k < 2; k++) { const t = -0.1 - r() * 0.35; push(lb.x + ca * lb.L * t + (r() - 0.5) * 1.5, lb.z + sa * lb.L * t + (r() - 0.5) * 1.5, 1.2 + r() * 1.2); } }
      { const [cx, cz] = f.crown.pos; const n = 7 + Math.floor(r() * 3); for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.3; if (r() < 0.12) continue; push(cx + Math.cos(a) * 3.4, cz + Math.sin(a) * 3.4, 1.8 + r() * 1.6); } push(cx, cz, 3.4); }
      lists.forEach((l, i) => L.instanced(sg[i], stoneMat, l)); land.owned.push(stoneMat);
      { const [cx, cz] = f.crown.pos; const t = deadTreeGeo(r); const tm = new THREE.Mesh(t.bark, triMaterial('bark_brown_02', { tint: 0x5a5650, tile: 1, desat: 0.6, specMax: 0.05 })); tm.scale.setScalar(10 + r() * 2); tm.position.set(cx + 4.6, ctx.H(cx + 4.6, cz) - 0.15, cz + 1); tm.rotation.set((r() - 0.5) * 0.2, r() * TAU, (r() - 0.5) * 0.2); tm.castShadow = true; L.add(tm); }
      /* the barrow door: a mausoleum set into the mound, leaning graves and a dead tree beside it, kerb stones round the foot */
      { const [dx, dz, da] = f.door; const b = f.barrow; const mz = buildMausoleum(ctx, L, dx, dz, da);
        /* the moor read as one flat blue-grey field with no light in it. The barrow door now
           breathes a low warm candle glow, with grave candles along the last stretch of the path, so the eye has a place
           to go and the mound reads as a place where someone still keeps watch. */
        { const sx = Math.sin(mz.rot); const sz = Math.cos(mz.rot); const at = (lx, ly, lz) => [dx + Math.cos(mz.rot) * lx + sx * lz, mz.y + ly, dz - Math.sin(mz.rot) * lx + sz * lz];
          const core = []; const halo = [];
          for (const [lx, lz] of [[-0.5, 2.3], [0.45, 2.5], [0.1, 2.9], [-0.9, 3.3], [0.95, 3.1]]) { const p = at(lx, 1.12 + r() * 0.12, lz); core.push([...p, 0.16 + r() * 0.08]); }
          halo.push([...at(0, 1.7, 2.1), 5.5], [...at(0, 1.0, 3.0), 9]);
          const pts = f.path.slice(-7, -1);
          for (const [px, pz] of pts) { if (r() < 0.3) continue; const o = (r() < 0.5 ? -1 : 1) * (1.4 + r() * 0.6); const ang = Math.atan2(pz, px) + Math.PI / 2; const cx = px + Math.cos(ang) * o; const cz = pz + Math.sin(ang) * o; const cy = ctx.H(cx, cz) + 0.32; core.push([cx, cy, cz, 0.13]); halo.push([cx, cy + 0.2, cz, 2.6]); }
          addGlows(L, core, 0xffc070, { alpha: 3 }); addGlows(L, halo, 0xff9a48, { alpha: 0.3 }); }
        const gl = []; const gg = [0, 1, 2].map(() => graveGeo(r)); const gm = triMaterial('seaside_rock', { tint: 0xa8a8a2, tile: 1.2, cover: 0x3a4428, coverAmt: 0.5 });
        for (let i = 0; i < 9; i++) { const a = da + (r() < 0.5 ? 1 : -1) * (0.35 + r() * 0.5); const d = 3.5 + r() * 5; const gx = dx + Math.cos(a) * d; const gz = dz + Math.sin(a) * d; if (Math.hypot(gx, gz) < ARENA_R + 1) continue; const s2 = 0.9 + r() * 0.7; gl.push({ v: i % 3, x: gx, y: ctx.H(gx, gz) - 0.08, z: gz, ry: da + Math.PI / 2 + (r() - 0.5) * 0.5, tx: (r() - 0.5) * 0.5, tz: (r() - 0.5) * 0.35, s: s2, sy: 1 }); (ctx.blobs || (ctx.blobs = [])).push([gx, gz, s2 * 0.5]); }
        gg.forEach((g, k) => L.instanced(g, gm, gl.filter((it) => it.v === k)));
        { const t = deadTreeGeo(r); const tm = new THREE.Mesh(t.bark, triMaterial('bark_brown_02', { tint: 0x6a6660, tile: 1, desat: 0.6, specMax: 0.05 })); const a = da + 0.9 * (r() < 0.5 ? 1 : -1); const tx = dx + Math.cos(a) * 5.5; const tz = dz + Math.sin(a) * 5.5; tm.scale.setScalar(8.5 + r() * 2); tm.position.set(tx, ctx.H(tx, tz) - 0.1, tz); tm.rotation.y = r() * TAU; tm.castShadow = true; L.add(tm); }
        const kerb = []; for (let i = 0; i < 26; i++) { const a = da + 0.5 + (i / 26) * (TAU - 1.0); const kx = b.x + Math.cos(a) * b.R * 1.9; const kz = b.z + Math.sin(a) * b.R * 1.9; kerb.push({ x: kx, y: ctx.H(kx, kz) - 0.2, z: kz, ry: a, tx: (r() - 0.5) * 0.2, tz: (r() - 0.5) * 0.2, s: 0.7 + r() * 0.5, sy: 1 }); }
        L.instanced(chunkGeo(r, { w: 1, h: 0.7, d: 0.6, chip: 0.3 }), stoneMat, kerb); }
      /* the cairn: a pile of stones, a torch and its warm light */
      { const c = f.cairn; const top = ctx.H(c.x, c.z); const rocks = await scanParts('rock_09'); const list = [];
        for (let i = 0; i < 26; i++) { const a = r() * TAU; const d = Math.pow(r(), 0.6) * 1.6; const yy = (1 - d / 1.6) * 1.6 * r(); list.push({ x: c.x + Math.cos(a) * d, y: top + yy - 0.2, z: c.z + Math.sin(a) * d, ry: r() * TAU, tx: r(), tz: r(), s: 0.5 + r() * 0.5 }); }
        for (const p of rocks.parts) L.instanced(p.geo, scanMaterial(p.mat, { tint: 0x6a6660, cover: 0x4a5236, coverAmt: 0.5 }), list, { ownGeo: false });
        const poleG = new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6); poleG.translate(0, 1.2, 0); const pole = new THREE.Mesh(poleG, new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 })); pole.position.set(c.x + 0.4, top + 0.9, c.z); pole.rotation.z = 0.08; pole.castShadow = true; L.add(pole);
        const fy = top + 3.4;
        addGlows(L, [[c.x + 0.5, fy, c.z, 0.9], [c.x + 0.5, fy + 0.2, c.z, 0.5]], 0xffb060, { alpha: 3 });
        addGlows(L, [[c.x + 0.5, fy, c.z, 9], [c.x, top + 0.5, c.z, 16]], 0xff9a40, { alpha: 0.32 });
        addSmoke(L, [c.x + 0.5, fy + 0.3, c.z], { n: 10, size: 0.7, rise: 6, life: 4, wind: [0.4, 0, 0.1], low: 0x3a2a20, high: 0x2a2a2a, hot: 0xff9a40, alpha: 0.5 });
        ctx.f.torch = [c.x + 0.5, fy, c.z]; }
      /* watch fires on the far keep's towers: warm points on the horizon against the cold sky */
      { const [kx, kz] = f.keep; const ky = ctx.H(kx, kz); const fires = [[0, 0, 34], [16, 6, 26], [-12, 10, 22]].map(([ox, oz, H]) => [kx + ox, ky - 2 + H + 0.8, kz + oz]);
        addGlows(L, fires.map((p) => [...p, 2.2]), 0xffb060, { alpha: 2.2 }); addGlows(L, fires.map((p) => [...p, 16]), 0xff8a40, { alpha: 0.22 }); }
      /* the ruin: thick walls with rubble */
      buildRuin(ctx, L, f.ruin, { tint: 0x8a8880, cover: 0x4a5236 });
      /* the keep on the far hill */
      { const [kx, kz] = f.keep; const mat = triMaterial('castle_wall_slates', { tint: 0x6a6a6a, tile: 4 }); const ky = ctx.H(kx, kz);
        for (const [dx, dz, H, R] of [[0, 0, 34, 6], [16, 6, 26, 4.5], [-12, 10, 22, 4]]) { solid(ctx, kx + dx, kz + dz, R, 'keep'); const g = towerGeo(r); const m = new THREE.Mesh(g, mat); m.scale.set(R / 0.17, H, R / 0.17); m.position.set(kx + dx, ky - 2, kz + dz); L.add(m); }
        const wg = ruinWallGeo(r, 30, 14, 2); const wm = new THREE.Mesh(wg, mat); wm.position.set(kx + 4, ky - 1, kz + 4); wm.rotation.y = r() * TAU; L.add(wm); solidAlong(ctx, kx + 4, kz + 4, wm.rotation.y, [[-12], [-6], [0], [6], [12]], 3, 'keep'); }
    },
    grass: [
      /* even short stubble is gone: tufts by a noise mask, twice as tall in the hollows, none on bare peat */
      { n: 15000, h: [0.22, 0.6], root: 0x24222a, tip: 0x6a6450, wind: 0.22, r: [3, 110], dry: 0x9a8a68, lush: 0x8a9480, clump: [2, 14], clumpR: 1.3, density: (ctx, x, z) => (ctx.f.path && lineDist(ctx.f.path, x, z) < 1.4 ? 0 : fbm(x * 0.06 + 7, z * 0.06 - 3, 4) > 0.56 ? 1 : 0.22), height: (ctx, x, z) => { const h = ctx.H(x, z); const hm = (ctx.H(x + 6, z) + ctx.H(x - 6, z) + ctx.H(x, z + 6) + ctx.H(x, z - 6)) / 4; return 1 + smooth(0.0, 0.5, hm - h) * 1.2; } },
    ],
    props: [
      { p: 'heather', n: 600, h: [0.3, 0.6], d: [5, 90], root: 0x1e1a20, tip: 0x5a3446, clutter: true, cluster: [3, 16], spread: 5, tintVar: 0.3, tintTo: 0x9a8a6a, where: (ctx, x, z) => (ctx.f.path && lineDist(ctx.f.path, x, z) < 1.6 ? 0 : fbm(x * 0.06 + 7, z * 0.06 - 3, 4) > 0.55 ? 1 : 0.15) },
      { p: 'grave', n: 60, h: [0.7, 1.6], d: [24, 50], tint: 0x8a8a86, cluster: [5, 14], spread: 8, tintVar: 0.2, tintTo: 0x7a8a6a },
      { m: 'gothic_statue', n: 3, h: [2.2, 3.0], d: [30, 60], tint: 0x8a8a88 },
      { p: 'deadtree', n: 14, h: [5, 10], d: [30, 110], tint: 0x2c2a28, bark: 'grey', cluster: [1, 3], spread: 6, lean: [0.1, 0.35], leanP: 0.6 },
      { m: 'moon_rock_01', n: 60, s: [0.25, 1.2], d: [5, 55], sink: 0.45, tint: 0x6a6a66, clutter: true, cluster: [1, 6], spread: 4, tintVar: 0.25, tintTo: 0x6a7458 },
    ],
    particles: [{ kind: 'rain', n: 1400, vel: [-3, -11, 1.2], color: 0xaab0bc, opacity: 0.22, len: 0.8, box: 20 }],
  },

  /* ---------------- DUSK STEPPE: tall grass by noise, game trails, a beast's bleached bones, three layers of mesas ---------------- */
  dusksteppe: {
    variants: 3, desat: 0.1, groundTint: 0x3a2a1e, fog: [18, 200], hemi: 0.85, sun: 1.1, sunOffset: [-6, 9, -30], exposure: 1.0, fogCol: 0x8a3e1e, skyCols: [0x3a0f0a, 0xff8a3a],
    /* one vertical gradient, deep red at the zenith to hot orange at the horizon; thin lit cloud bars */
    sky: { sunDir: [0.36, 0.035, -1], sunCol: 0xffa050, sunGlow: 1.2, clouds: 0.35, cloudCol: 0x3a1410, cloudLit: 0xffa060, cloudSpd: 0.5, cloudLo: 0.06, top: 0x3a0f0a, hor: 0xff8a3a, pow: 0.42, band: 0.6, bandCol: 0xff7a30 },
    terrain: { A: ['grass_path_2', 5, 0x5a4a36], B: ['aerial_grass_rock', 7, 0x30321e], C: ['cliff_side', 16, 0x7a5040], P: 0x8a6c4e, rock: [0.25, 0.5], macro: [22, 0.42], nstr: 1.1, rough: [0.95, 0.95], desat: 0.05, bnoise: 0.6, strata: [0.42, 0.7, 3, 0.6], haze: [0xd0703a, 0.4, 140, 480] },
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      /* game trails crossing the plain */
      f.trails = []; for (let i = 0; i < 3; i++) { const a = r() * TAU; const start = polar(a, 140); f.trails.push(windingPath(r, ...start, a + Math.PI + (r() - 0.5) * 0.6, 290, 9, 0.25)); }
      /* mesas: near layer, mid layer, far layer */
      f.mesas = [];
      const add = (n, d0, d1, R0, R1, H0, H1) => { for (let i = 0; i < n * 4 && n > 0; i++) { const a = r() * TAU; if (angOff(a) < 0.3) continue; const d = d0 + r() * (d1 - d0); const [x, z] = polar(a, d); const R = R0 + r() * (R1 - R0); if (f.mesas.some((m) => Math.hypot(m.x - x, m.z - z) < m.R + R)) continue; f.mesas.push({ x, z, R, H: H0 + r() * (H1 - H0), steps: 1 + Math.floor(r() * 3) }); n--; } };
      /* the sun mesa: on the key's bearing, tall enough that the low sun sits half behind its rim */
      { const ka = Math.atan2(-0.74, -0.67) + [0, 0.04, -0.04][v]; const [x, z] = polar(ka, 255); f.mesas.push({ x, z, R: 52, H: 58, steps: 3 }); }
      add([4, 3, 5][v], 110, 170, 18, 34, 22, 40); add(6, 230, 330, 30, 60, 40, 70); add(8, 420, 600, 50, 110, 60, 110);
      f.bones = [polar([FRONT - 0.45, FRONT + 0.5, -2.4][v], 26 + r() * 6), r() * TAU];
      f.ring = v === 1;
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = sd0(ctx);
      let h = (fbm(x * 0.012 + s, z * 0.012, 4) - 0.45) * 7 * smooth(16, 80, rr) + (fbm(x * 0.05, z * 0.05 + s, 3) - 0.5) * 1.2 * smooth(16, 26, rr);
      for (const m of f.mesas) {
        const d = Math.hypot(x - m.x, z - m.z) + (fbm(x * 0.03 + m.x, z * 0.03, 3) - 0.5) * m.R * 0.7;
        if (d < m.R * 1.6) {
          /* the wall rises in ledges (one bed every ~4 m), with ~0.8 m of rough noise on the face; the top has eroded tiers */
          const cliff = smooth(m.R * 1.05, m.R * 0.9, d); const talus = smooth(m.R * 1.6, m.R * 1.0, d) * 0.22;
          const beds = Math.max(3, Math.round(m.H / 4)); const kb = cliff * beds; const ledged = (Math.floor(kb) + smooth(0.25, 1.0, kb - Math.floor(kb))) / beds;
          let top = m.H * 0.8;
          if (m.steps >= 2) top += m.H * 0.12 * smooth(m.R * 0.78, m.R * 0.7, d + (fbm(x * 0.08, z * 0.08 + 3) - 0.5) * m.R * 0.2);
          if (m.steps >= 3) top += m.H * 0.08 * smooth(m.R * 0.45, m.R * 0.38, d + (fbm(x * 0.1 + 5, z * 0.1) - 0.5) * m.R * 0.2);
          const face = cliff > 0.02 && cliff < 0.98 ? (fbm(x * 0.35, z * 0.35 + m.x) - 0.5) * 1.6 : 0;
          h = Math.max(h, Math.max(ledged * top, talus * top) + face + (cliff >= 0.98 ? (fbm(x * 0.1, z * 0.1) - 0.5) * 1.2 : 0)); }
      }
      return h;
    },
    mask(ctx, x, z, h, rr) { let t = 1e9; for (const tr of ctx.f.trails) t = Math.min(t, lineDist(tr, x, z)); return [smooth(1.6, 0.5, t), 0, 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r;
      buildBones(ctx, L, f.bones[0], f.bones[1]);
      /* set pieces: a giant's skeleton half sunk in the grass, broken war banners, a dead caravan */
      { const a = FRONT + [0.7, -0.75, 0.95][ctx.v]; const [gx, gz] = polar(a, 58 + r() * 12); buildBones(ctx, L, [gx, gz], r() * TAU, 3.2); }
      { const a = FRONT + [-0.75, 0.8, -0.6][ctx.v]; const [cx, cz] = polar(a, 46 + r() * 10); const along = a + Math.PI / 2;
        for (let i = 0; i < 3; i++) { const x = cx + Math.cos(along) * i * 7 + (r() - 0.5) * 2; const z = cz + Math.sin(along) * i * 7 + (r() - 0.5) * 2; buildCart(ctx, L, x, z, along + (r() - 0.5) * 0.8, { burnt: false }); }
        ctx.story = { along: () => { const t = r(); return [cx + Math.cos(along) * (t * 20 - 3) + (r() - 0.5) * 8, cz + Math.sin(along) * (t * 20 - 3) + (r() - 0.5) * 8, r() * TAU]; } };
        buildBanners(ctx, L, { n: 6, color: 0x4a1a12, near: [40, 80], embers: false }); ctx.story = null; }
      if (f.ring) {
        const sp = await scanParts('rock_face_01'); const list = []; const [cx, cz] = polar(FRONT + 0.4, 38);
        for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const x = cx + Math.cos(a) * 10; const z = cz + Math.sin(a) * 10; if (Math.hypot(x, z) < ARENA_R + 2) continue; const H = 4 + r() * 2.5; const sy = 2.1; list.push({ x, y: ctx.H(x, z) - 0.4, z, ry: r() * TAU, tx: (r() - 0.5) * 0.12, tz: (r() - 0.5) * 0.12, s: H / sp.unitH / sy, sy }); }
        for (const p of sp.parts) L.instanced(p.geo, scanMaterial(p.mat, { tint: 0x6a5e56 }), list, { ownGeo: false });
      }
    },
    grass: [
      /* height 0.3 to 1.2 m by a noise mask, bare on the trails, light through the tips toward the low sun */
      { n: 16000, h: [0.26, 0.5], root: 0x1e160e, tip: 0xa07c48, wind: 0.2, r: [3, 120], rim: 0xffa050, rimK: 1.1, pow: 1.3, dry: 0xffe2b0, lush: 0x8a9460, tintF: 0.035, clump: [3, 16], clumpR: 1.5,
        density: (ctx, x, z) => { let t = 1e9; for (const tr of ctx.f.trails) t = Math.min(t, lineDist(tr, x, z)); return t < 1.4 ? 0 : 0.28 + 0.72 * smooth(0.36, 0.56, fbm(x * 0.04 + 5, z * 0.04, 3)); },
        height: (ctx, x, z) => (1 + 1.7 * smooth(0.4, 0.7, fbm(x * 0.035 + 1, z * 0.035 + 2, 3))) * lerp(0.75, 1, smooth(9, 16, Math.hypot(x, z))) * (Math.hypot(x, z) < 12 ? 0.6 : 1) },
    ],
    props: [
      { m: 'namaqualand_boulder_04', n: 14, s: [2, 4], d: [30, 90], sink: 0.25, tint: 0x7a6a5e, cluster: [2, 4], spread: 6 },
      { p: 'deadtree', n: 6, h: [6, 10], d: [40, 120], tint: 0x2a221e, bark: 'grey', lean: [0.1, 0.3] },
      { m: 'rock_07', n: 34, s: [0.4, 1.3], d: [5, 70], sink: 0.4, tint: 0x7a6a5e, clutter: true, cluster: [1, 5], spread: 5, tintVar: 0.25, tintTo: 0x9a8a6a },
      { p: 'pebble', shadow: false, n: 60, s: [0.3, 1.1], d: [10, 80], tint: 0x8a7a66, clutter: true, cluster: [2, 6], spread: 4, tintVar: 0.2, tintTo: 0x6a5a48 },
      { p: 'heather', n: 160, h: [0.3, 0.7], d: [8, 70], root: 0x1e160e, tip: 0x6a6a3a, clutter: true, cluster: [2, 8], spread: 3, tintVar: 0.3, tintTo: 0xb08a50 },
    ],
    particles: [{ kind: 'dot', n: 700, size: 0.06, vel: [2.4, 0.15, -0.6], var: [1.0, 0.3, 0.6], color: 0xffd8a0, opacity: 0.5, sway: 0.5 }],
  },

  /* ---------------- FROST PASS: a pass between two mountain walls, snow on the gentle slopes, a frozen lake, the frozen dead ---------------- */
  frostpass: {
    variants: 3, desat: 0.5, groundTint: 0x5a6878, fog: [16, 170], hemi: 0.95, sun: 0.85, sunOffset: [12, 24, 14], exposure: 0.95, fogCol: 0x2a3a50, skyCols: [0x03060e, 0x2a4060],
    /* the aurora is this land's sky: green curtains over a deep navy night, many stars */
    sky: { sunDir: [-0.45, 0.32, -1], sunCol: 0xdfe8ff, sunGlow: 0.4, stars: 1.2, aurora: 1.5, auroraCol: 0x2affb0, top: 0x02040c, hor: 0x24385a, pow: 0.5, band: 0.25, bandCol: 0x4a6a9a },
    terrain: { A: ['snow_field_aerial', 7, 0x7c8898], B: ['snow_field_aerial', 3, 0x667284], C: ['cliff_side', 10, 0x3e4450], P: 0x5a6476, rock: [0.32, 0.55], macro: [40, 0.22], nstr: 0.8, rough: [0.75, 0.6], desat: 0.55, bnoise: 0.3, sastrugi: 0.9, tri: true, strata: [0.3, 0.45, 3, 0], haze: [0x2a3a50, 0.3, 150, 500] },
    heightMap: 160,
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      /* the pass runs along an axis; the walls rise on both sides */
      f.axis = [NEMESIS_ANG, NEMESIS_ANG + 0.5, NEMESIS_ANG - 0.4][v];
      f.lake = v === 0 ? { x: 0, z: 0, R: 22 } : { ...Object.fromEntries([['x', polar([FRONT - 0.5, FRONT + 0.9, FRONT - 0.8][v], 40)[0]], ['z', polar([FRONT - 0.5, FRONT + 0.9, FRONT - 0.8][v], 40)[1]]]), R: 18 + r() * 6 };
      f.boulders = []; for (let i = 0; i < 9; i++) { const a = r() * TAU; const d = 22 + r() * 50; if (angOff(a) < 0.22) continue; const [x, z] = polar(a, d); if (Math.hypot(x - f.lake.x, z - f.lake.z) < f.lake.R + 4) continue; f.boulders.push({ x, z, s: 2.5 + r() * 3 }); }
      const ta = f.axis + Math.PI; f.trail = windingPath(r, ...polar(ta, 110), f.axis, 240, 5, 0.12);
      f.outcrops = []; for (let gx = -120; gx <= 120; gx += 17) for (let gz = -120; gz <= 120; gz += 17) { const x = gx + (r() - 0.5) * 10; const z = gz + (r() - 0.5) * 10; const d = Math.hypot(x, z); if (d < 26 || d > 125) continue; f.outcrops.push([x, z, 2.5 + r() * 3.5]); }
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = sd0(ctx);
      const ax = Math.cos(f.axis); const az = Math.sin(f.axis); const across = Math.abs(-az * x + ax * z);
      let h = (fbm(x * 0.03 + s, z * 0.03, 4) - 0.45) * 3 * smooth(16, 40, rr);
      /* the two walls of the pass: real ridgelines, steep, higher farther out */
      const wall = smooth(45, 160, across) * (60 + 110 * Math.pow(ridged(x * 0.006 + s, z * 0.006, 5), 1.8)) + smooth(30, 70, across) * 8 * fbm(x * 0.02, z * 0.02, 3);
      h += wall;
      h += ranges(x, z, rr, ang, s, { near: [200, 300], far: [380, 600], ampN: 40, ampF: 150, sharp: 2.0, freq: 0.0045 }) * smooth(60, 120, across);
      /* snow skirts under the boulders */
      for (const b of f.boulders) h += b.s * 0.32 * bump(x, z, b.x, b.z, b.s * 1.4);
      /* the lake: flat ice */
      const dl = Math.hypot(x - f.lake.x, z - f.lake.z);
      if (dl < f.lake.R + 6) h = lerp(h, -0.15, smooth(f.lake.R + 6, f.lake.R, dl));
      return h;
    },
    mask(ctx, x, z, h, rr) { return [smooth(1.2, 0.4, lineDist(ctx.f.trail, x, z)), 0, 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r;
      buildIce(ctx, L, f.lake);
      buildFootprints(ctx, L, f.trail, f.lake);
      addFogSheets(ctx, L, [0.4, 1.0], { color: 0x8aa0bc, alpha: 0.12, R: 90 });
      await buildDeadArmy(ctx, L, { frozen: true, n: 7, near: [17, 38] });
      buildWeapons(ctx, L, { n: 18, near: [16, 40], frost: true });
    },
    props: [
      { m: 'namaqualand_boulder_02', n: 9, s: [2, 5], at: (ctx) => ctx.f.boulders.map((b) => [b.x, b.z, b.s]), sink: 0.3, tint: 0x50565e, cover: 0xb8c4d4, coverAmt: 1 },
      /* outcrops with snow caps, about one per 15 m, only where the slope rises */
      { m: 'namaqualand_boulder_02', n: 80, s: [3, 6.5], at: (ctx) => ctx.f.outcrops.filter(([x, z]) => { const g = Math.hypot(ctx.H(x + 1, z) - ctx.H(x - 1, z), ctx.H(x, z + 1) - ctx.H(x, z - 1)); return g > 0.25 && angOff(Math.atan2(z, x)) > 0.25; }), sink: 0.22, tint: 0x4a505a, cover: 0xb8c4d4, coverAmt: 1, tilt: 0.2, blobK: 0.8 },
      { m: 'moon_rock_01', n: 40, s: [0.4, 1.3], d: [5, 60], sink: 0.5, tint: 0x4a5058, cover: 0xb8c4d4, coverAmt: 1, clutter: true, cluster: [2, 4], spread: 4, where: (ctx, x, z) => (Math.hypot(x - ctx.f.lake.x, z - ctx.f.lake.z) < ctx.f.lake.R + 2 ? 0 : 1) },
      /* conifers of layered skirts at three sizes */
      { p: 'conifer', n: 26, h: [2.5, 7.5], d: [30, 90], kinds: 5, tint: 0x2a2624, bark: 'grey', needle: 0x1a2a2a, cover: 0xa8b4c4, coverAmt: 0.85, cluster: [1, 6], spread: 9, radK: 0.12, lean: [0.03, 0.14], leanP: 0.5, tintVar: 0.3, tintTo: 0xc8d4e4 },
      { p: 'conifer', n: 30, h: [8, 14], d: [40, 140], kinds: 5, tint: 0x2a2624, bark: 'grey', needle: 0x182624, cover: 0xa8b4c4, coverAmt: 0.75, cluster: [2, 8], spread: 14, radK: 0.12, lean: [0.02, 0.1], leanP: 0.4, tintVar: 0.28, tintTo: 0xd8e0ec },
      { p: 'conifer', n: 18, h: [15, 24], d: [70, 160], kinds: 4, tint: 0x2a2624, bark: 'grey', needle: 0x14201e, cover: 0xa8b4c4, coverAmt: 0.6, cluster: [1, 5], spread: 16, radK: 0.12, shadow: false, tintVar: 0.25, tintTo: 0xb8c4d4 },
    ],
    particles: [{ kind: 'flake', n: 1500, size: 0.1, vel: [1.2, -1.3, 0.3], var: [0.6, 0.6, 0.6], color: 0xffffff, opacity: 0.85, sway: 0.8 }],
  },

  /* ---------------- DEEPWOOD: a real forest. 300+ trunks, a closed canopy, moonlight shafts, a shrine ---------------- */
  deepwood: {
    variants: 3, desat: 0.35, groundTint: 0x2a2a24, fog: [8, 80], hemi: 0.9, sun: 0.7, sunOffset: [-8, 24, 16], exposure: 1.02, fogCol: 0x2c3a40, skyCols: [0x020304, 0x1a2428],
    /* no sky: a closed canopy overhead, cold blue-grey mist between the trunks so dark figures read against it */
    sky: { sunDir: [-0.35, 0.42, -1], sunCol: 0xb8d0e0, sunGlow: 0.2, stars: 0.3, top: 0x05080a, hor: 0x2c3a40, pow: 0.5, canopy: 1, canopyCol: 0x030504, band: 0.1, bandCol: 0x3a4c54 },
    terrain: { A: ['leaves_forest_ground', 2.6, 0x4a4238], B: ['brown_mud_02', 3, 0x2a2620], C: ['rocky_terrain_02', 6, 0x3a3a34], P: 0x3a3028, rock: [0.35, 0.65], macro: [25, 0.35], nstr: 1.3, rough: [0.92, 0.6], desat: 0.35, bnoise: 0.3, canopy: 1, haze: [0x2c3a40, 0.35, 40, 140] },
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      /* the old road toward the nemesis: the only gap in the wood */
      f.road = windingPath(r, 0, 0, NEMESIS_ANG, 240, 10, 0.08);
      /* a second track in two of the variants */
      f.track = v === 2 ? null : windingPath(r, ...polar(FRONT + [0.9, -0.9][v], 14), FRONT + [0.9, -0.9][v], 120, 7, 0.4);
      f.focal = { pos: polar([FRONT - 0.5, FRONT + 0.55, FRONT - 0.15][v], 26 + r() * 5), kind: ['shrine', 'cage', 'shrine'][v] };
      f.trees = [];
      const want = 360; let guard = 0;
      while (f.trees.length < want && guard++ < 9000) {
        const a = r() * TAU; const d = 17 + Math.pow(r(), 0.9) * 110; const [x, z] = polar(a, d);
        if (lineDist(f.road, x, z) < 5 + d * 0.02) continue;
        if (f.track && lineDist(f.track, x, z) < 3) continue;
        if (Math.hypot(x - f.focal.pos[0], z - f.focal.pos[1]) < 6) continue;
        const R = 0.5 + r() * 0.5 + (d > 60 ? 0.2 : 0);
        if (f.trees.some((t) => Math.hypot(t.x - x, t.z - z) < (t.R + R) * 2.2 + 1.2)) continue;
        f.trees.push({ x, z, R, H: 24 + r() * 14 });
      }
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = sd0(ctx);
      let h = (fbm(x * 0.035 + s, z * 0.035, 4) - 0.45) * 4 * smooth(16, 40, rr) + (fbm(x * 0.12, z * 0.12 + s, 2) - 0.5) * 0.6 * smooth(16, 22, rr);
      h += ranges(x, z, rr, ang, s, { near: [140, 220], far: [300, 600], ampN: 20, ampF: 50, sharp: 1.4, freq: 0.006 });
      const dr = lineDist(f.road, x, z); if (dr < 5) h = lerp(h, h * 0.5, smooth(5, 2, dr));
      return h;
    },
    mask(ctx, x, z, h, rr) { const f = ctx.f; const t = Math.min(lineDist(f.road, x, z) / 1.6, f.track ? lineDist(f.track, x, z) : 1e9); return [smooth(2.6, 0.8, t), 0, 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r; const land = L.current;
      /* trunks 1 to 2 m thick, four shapes, one batch each (near ones cast shadows) */
      const bark = triMaterial('bark_brown_02', { tint: 0x5a5650, tile: 1.8, cover: 0x2a3c2a, coverAmt: 0.5, desat: 0.4, nstr: 1.7, specMax: 0.03, base: { color: 0x2a3c22, amount: 0.95, h: 0.13, furrows: 6 } });
      const kinds = [0, 1, 2, 3].map((i) => trunkGeo(r, { buttress: i !== 3, roots: [7, 5, 8, 4][i], stubs: true, radius: 0.025, radial: 12 }).bark);
      const near = [[], [], [], []]; const far = [[], [], [], []];
      for (const t of f.trees) { const k = Math.floor(r() * 4); const it = { x: t.x, y: ctx.H(t.x, t.z), z: t.z, ry: r() * TAU, tx: (r() - 0.5) * 0.05, tz: (r() - 0.5) * 0.05, s: t.R / 0.025, sy: t.H / (t.R / 0.025) }; (Math.hypot(t.x, t.z) < 30 ? near : far)[k].push(it); }
      near.forEach((l, k) => L.instanced(kinds[k], bark, l, { shadow: true, ownGeo: false }));
      far.forEach((l, k) => L.instanced(kinds[k], bark, l, { shadow: false, ownGeo: false }));
      land.owned.push(...kinds, bark);
      /* the closed canopy: crowns at 18-34 m with gaps, plus a dark ceiling far above */
      const crown = crownClusterGeo(r, { ends: 9, per: 46, size: 0.2, flat: 0.5, tones: [0x0a100c, 0x16201c, 0x2a3830] }); const leaf = leafClusterMaterial(0x7a8682, { trans: 0x1a2c2c });
      const crowns = []; for (const t of f.trees) { if (r() < 0.25) continue; crowns.push({ x: t.x + (r() - 0.5) * 6, y: ctx.H(t.x, t.z) + t.H * (0.8 + r() * 0.25), z: t.z + (r() - 0.5) * 6, ry: r() * TAU, s: 7 + r() * 6, sy: 0.5 + r() * 0.25 }); }
      for (let i = 0; i < 70; i++) { const a = r() * TAU; const d = 8 + r() * 30; if (r() < 0.45) continue; const [x, z] = polar(a, d); crowns.push({ x, y: 24 + r() * 10, z, ry: r() * TAU, s: 6 + r() * 5, sy: 0.5 }); }
      L.instanced(crown, leaf, crowns, { shadow: false });
      /* shafts of moonlight through the gaps, slanted along the key light */
      buildShafts(ctx, L, f, { color: 0xb8d0f0, alpha: 0.09, n: 14 });
      /* the wood was one black wall of trunks. Old way-lanterns on posts along the road to the
         nemesis: warm points that step away into the mist give the depth and the way, and light the trunks beside them */
      { const posts = []; const core = []; const halo = []; let acc = 0; let next = 18; let side = 1;
        for (let i = 1; i < f.road.length && next < 140; i++) { const [ax, az] = f.road[i - 1]; const [bx, bz] = f.road[i]; const seg = Math.hypot(bx - ax, bz - az);
          while (acc + seg >= next && next < 140) { const t = (next - acc) / seg; const x0 = ax + (bx - ax) * t; const z0 = az + (bz - az) * t; const nx = -(bz - az) / seg; const nz = (bx - ax) / seg;
            const x = x0 + nx * side * 3.2; const z = z0 + nz * side * 3.2; const y = ctx.H(x, z);
            posts.push({ x, y: y - 0.1, z, ry: r() * TAU, tx: (r() - 0.5) * 0.12, tz: (r() - 0.5) * 0.12, s: 1 });
            core.push([x, y + 2.25, z, 0.32]); halo.push([x, y + 2.25, z, 3.8]); /* 3.8 m: a 7 m card was cut square by the ground and the trunks */ side = -side; next += 15 + r() * 6; }
          acc += seg; }
        const pg = new THREE.CylinderGeometry(0.06, 0.09, 2.4, 6); pg.translate(0, 1.2, 0); const arm = new THREE.BoxGeometry(0.5, 0.06, 0.06); arm.translate(0.2, 2.35, 0);
        const lamp = new THREE.CylinderGeometry(0.11, 0.13, 0.3, 6); lamp.translate(0.0, 2.2, 0);
        const g = mergeClean([pg, arm, lamp]); const pm = new THREE.MeshStandardMaterial({ color: 0x2a221a, roughness: 0.9 });
        L.instanced(g, pm, posts);
        addGlows(L, core, 0xffbe70, { alpha: 3 }); addGlows(L, halo, 0xff9a50, { alpha: 0.36 }); }
      addFogSheets(ctx, L, [0.5, 1.4], { color: 0x6a7c84, alpha: 0.1, R: 70 });
      /* the focal point */
      buildFocal(ctx, L, f.focal);
    },
    props: [
      { m: 'root_cluster_01', n: 30, s: [3, 5], at: (ctx) => ctx.f.trees.filter((t) => Math.hypot(t.x, t.z) < 60).slice(0, 30).map((t) => [t.x, t.z, 3 + t.R * 2]), sink: 0.1, tint: 0x6a6052, cover: 0x3e5a28, coverAmt: 0.6 },
      /* fallen logs, mossy rocks and fern clumps on the floor; inside the arena only plants under 0.4 m */
      { m: 'dead_tree_trunk_02', n: 22, s: [6, 11], d: [18, 60], sink: 0.15, tint: 0x4a4038, cover: 0x2e4428, coverAmt: 0.8, where: (ctx, x, z) => (lineDist(ctx.f.road, x, z) < 4 ? 0 : 1) },
      { m: 'rock_moss_set_02', n: 22, s: [3, 7], d: [18, 60], sink: 0.2, tint: 0x6a6a5e, where: (ctx, x, z) => (lineDist(ctx.f.road, x, z) < 4 ? 0 : 1) },
      { p: 'fern', n: 1150, h: [0.18, 0.46], d: [3, 16.5], kinds: 6, tintVar: 0.3, tintTo: 0x8a7a50, tones: [0x0e1612, 0x24342a, 0x4a5e48], cluster: [2, 14], spread: 3.0, where: (ctx, x, z) => (lineDist(ctx.f.road, x, z) < 1.5 ? 0 : fbm(x * 0.12 + 3, z * 0.12, 3) > 0.42 ? 1 : 0.15) },
      { p: 'fern', n: 560, h: [0.5, 1.8], d: [17, 70], kinds: 6, tintVar: 0.3, tintTo: 0x8a7a50, tones: [0x0e1612, 0x24342a, 0x4a5e48], cluster: [2, 12], spread: 5, where: (ctx, x, z) => (lineDist(ctx.f.road, x, z) < 2.5 ? 0 : 1) },
      { m: 'pine_roots', n: 24, s: [1.6, 2.4], d: [17, 40], tint: 0x5a5048, clutter: true },
    ],
    particles: [{ kind: 'firefly', n: 260, size: 0.12, vel: [0, 0.05, 0], var: [0.5, 0.3, 0.5], color: 0xc8ff8a, add: true, glow: 2.6, sway: 1.4, y0: 0.3, box: 9 }],
  },

  /* ---------------- STORM COAST: a beach, a real sea with breakers, cliffs, a wreck, a lighthouse, lightning ---------------- */
  stormcoast: {
    variants: 3, desat: 0.3, groundTint: 0x30363a, fog: [14, 150], hemi: 1.1, sun: 0.9, sunOffset: [12, 22, 14], exposure: 1.15, fogCol: 0x2a3438, skyCols: [0x04070a, 0x2a3438],
    /* overcast storm: no moon, cloud masses lit from inside by lightning, one cell at a time */
    sky: { sunDir: [-0.6, 0.3, -1], sunCol: 0x6a7a88, sunGlow: 0.1, clouds: 1, cloudCol: 0x0a0e12, cloudLit: 0x3a4a54, cloudSpd: 2.2, cloudLo: 0.1, top: 0x05080a, hor: 0x2e383c, pow: 0.5, cells: 1, band: 0.2, bandCol: 0x3a4a50, lightning: true },
    terrain: { A: ['damp_beach_sand', 4, 0x4a4540], B: ['damp_beach_sand', 3, 0x1c1a18], C: ['cliff_side', 12, 0x8a8e96], P: 0x2e2a26, rock: [0.28, 0.55], macro: [18, 0.5], nstr: 1.3, sastrugi: 0.22, rough: [0.85, 0.12], desat: 0.35, bnoise: 0, strata: [0.4, 0.8, 3, 0.45], haze: [0x2a3438, 0.3, 120, 420], specMax: 0.12 },
    heightMap: 200,
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      /* where the sea lies: left, ahead, right; the nemesis wades in it in variant 1 */
      f.seaAng = [FRONT - 0.55, NEMESIS_ANG + 0.1, FRONT + 0.75][v] + (r() - 0.5) * 0.1;
      f.shore = 24 + r() * 4; f.level = -0.7;
      /* the headland with the lighthouse, across the bay */
      f.head = { ang: f.seaAng + (v === 2 ? -0.75 : 0.75), d: 170 + r() * 50 };
      const ws = r() < 0.5 ? 1 : -1;
      f.wreck = { pos: polar(f.seaAng + ws * 0.42, f.shore + 6), rot: r() * TAU };
      f.wreck2 = { pos: polar(f.seaAng - ws * 0.3, 60), rot: r() * TAU };
      if (angOff(Math.atan2(f.wreck2.pos[1], f.wreck2.pos[0])) < 0.3) f.wreck2.pos = polar(f.seaAng - ws * 0.65, 58);
      /* sea stacks off the shore */
      f.stacks = []; for (let i = 0; i < 5; i++) { const a = f.seaAng + (r() - 0.5) * 1.3; const d = 70 + r() * 90; if (angOff(a) < 0.3) continue; const [x, z] = polar(a, d); f.stacks.push({ x, z, R: 6 + r() * 7, H: 18 + r() * 22 }); }
      /* the landward side (the view behind the player): a cove in the cliffs with a path up, a boathouse with one lit
         window at the cliff foot, a broken hull, nets, an upturned boat, tide pools in the wet sand */
      f.landA = f.seaAng + Math.PI + (r() - 0.5) * 0.3; const ls = r() < 0.5 ? 1 : -1;
      f.house = { pos: polar(f.landA + ls * (0.3 + r() * 0.12), 33 + r() * 3) }; f.house.rot = Math.atan2(-f.house.pos[0], -f.house.pos[1]) + (r() - 0.5) * 0.5;
      f.hull = { pos: polar(f.landA - ls * (0.5 + r() * 0.2), 31 + r() * 5), rot: r() * TAU };
      f.boat = { pos: polar(f.landA + ls * 0.12, 37 + r() * 3), rot: r() * TAU };
      f.nets = { pos: polar(f.landA - ls * (0.95 + r() * 0.2), 27 + r() * 4), rot: r() * TAU };
      f.climb = windingPath(r, ...polar(f.landA + ls * 0.3, 40), f.landA, 60, 5, 0.2);
      f.pools = []; for (let i = 0; i < 40 && f.pools.length < 11; i++) { const a = f.landA + (r() - 0.5) * 2.6; const d = 19 + r() * 24; const [x, z] = polar(a, d); const R = 1.2 + r() * 3.2; if (angOff(a) < 0.3) continue;
        if ([f.house.pos, f.hull.pos, f.boat.pos, f.nets.pos].some(([px, pz]) => Math.hypot(px - x, pz - z) < R + 5)) continue; if (f.pools.some((q) => Math.hypot(q.x - x, q.z - z) < q.R + R + 2)) continue; f.pools.push({ x, z, R }); }
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = sd0(ctx);
      const off = angOff(ang, f.seaAng);
      const seaK = smooth(1.25, 0.7, off);
      let h = (fbm(x * 0.04 + s, z * 0.04, 4) - 0.45) * 2.5 * smooth(16, 40, rr);
      /* the beach slopes into the sea; the sea floor drops away */
      const beach = -(rr - f.shore) * 0.12 - smooth(f.shore + 10, f.shore + 120, rr) * 18;
      h = lerp(h, Math.min(h, beach + 0.4), seaK * smooth(ARENA_R, ARENA_R + 4, rr));
      /* cliffs on the land side, steep and tall */
      const cove = lerp(0.28, 1, smooth(0.1, 0.42, angOff(ang, f.landA) + (fbm(x * 0.02, z * 0.02 + s, 2) - 0.5) * 0.25));
      const cliff = (1 - seaK) * smooth(58, 80, rr) * cove * (28 + 40 * Math.pow(ridged(x * 0.01 + s, z * 0.01, 4), 1.5) + 12 * ridged(x * 0.05, z * 0.05 + s, 3));
      let cl2 = cliff + (1 - seaK) * smooth(120, 300, rr) * 50 * fbm(x * 0.004, z * 0.004 + s, 3);
      /* beds: the cliff rises in ledges, with 1 to 2 m of rough relief on the face */
      if (cl2 > 1) { const bed = 3.2; const kb = cl2 / bed; cl2 = (Math.floor(kb) + smooth(0.2, 1.0, kb - Math.floor(kb))) * bed + (fbm(x * 0.2, z * 0.2 + 7) - 0.5) * 2.2 * smooth(1, 6, cl2); }
      if (cl2 > 0.01) h = Math.max(h, cl2);
      for (const st of f.stacks) { const d = Math.hypot(x - st.x, z - st.z) + (fbm(x * 0.15, z * 0.15) - 0.5) * 3; if (d < st.R * 1.4) { const k = smooth(st.R * 1.2, st.R * 0.85, d); const kb = k * st.H / 3; const hh = (Math.floor(kb) + smooth(0.3, 1, kb - Math.floor(kb))) * 3 + (fbm(x * 0.4, z * 0.4) - 0.5) * 2 * k; h = Math.max(h, hh + f.level - 1); } }
      /* the headland: a cliff wall out into the sea */
      const [hx, hz] = polar(f.head.ang, f.head.d);
      const hd = Math.hypot(x - hx, z - hz);
      const hv = smooth(70, 45, hd + (fbm(x * 0.03, z * 0.03) - 0.5) * 30) * (45 + 10 * fbm(x * 0.05, z * 0.05) + 8 * ridged(x * 0.06, z * 0.06, 3)); if (hv > 0.01) h = Math.max(h, hv);
      h += ranges(x, z, rr, ang, s, { near: [260, 360], far: [420, 640], ampN: 20, ampF: 60, sharp: 1.5 }) * (1 - seaK);
      /* the cove floor rises in a slope with a trodden path up it */
      if (rr > 50 && rr < 140) { const k = smooth(0.42, 0.12, angOff(ang, f.landA)); if (k > 0) h = Math.max(h, k * smooth(45, 120, rr) * 26 + (fbm(x * 0.08, z * 0.08) - 0.5) * 1.5 * k); }
      for (const p of f.pools) { const d = Math.hypot(x - p.x, z - p.z) + (fbm(x * 0.4 + p.x, z * 0.4, 2) - 0.5) * p.R * 0.7; if (d < p.R * 1.6) h = lerp(h, Math.min(h, -0.32), smooth(p.R * 1.6, p.R * 0.7, d)); }
      /* in variants 1 and 2 the sea lies ahead, and the wonder walk had no ground (the third
         find and the far light stood 40 to 140 m out in the water, the hero could not reach them). A bar of wet sand runs out
         along the nemesis line, dry 32 m to each side, a hand over the tide, as long as the walk; the sea closes in beyond it. */
      if (ctx.v > 0) { const c = Math.cos(NEMESIS_ANG); const sn = Math.sin(NEMESIS_ANG); const al = x * c + z * sn; const la = Math.abs(-x * sn + z * c);
        const bar = smooth(44, 30, la) * smooth(-14, 6, al) * smooth(190, 168, al); if (bar > 0.001) h = lerp(h, Math.max(h, 0.04 + (fbm(x * 0.06 + s, z * 0.06, 2) - 0.5) * 0.4), bar); }
      return h;
    },
    mask(ctx, x, z, h, rr) { const f = ctx.f;
      /* wet sand: low ground, a rim round each pool, and tide lines (thin dark bands parallel to the sea, warped) */
      let wet = smooth(1.1, 0.2, h - f.level) * (0.75 + 0.25 * fbm(x * 0.2, z * 0.2, 2));
      for (const p of f.pools) wet = Math.max(wet, smooth(p.R * 2.4, p.R * 1.0, Math.hypot(x - p.x, z - p.z)) * 0.9);
      const along = x * Math.cos(f.seaAng) + z * Math.sin(f.seaAng); const tl = along / 5.5 + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 2.2; const band = Math.abs(tl - Math.round(tl));
      if (rr > 17 && h < 2) wet = Math.max(wet, smooth(0.09, 0.02, band) * 0.75 * smooth(0.3, 0.5, fbm(x * 0.1 + 4, z * 0.1, 2)));
      wet = Math.max(wet, smooth(0.55, 0.7, fbm(x * 0.06 + 2, z * 0.06 - 5, 3)) * 0.6 * smooth(1.5, 0.3, h));
      const path = f.climb ? smooth(1.6, 0.5, lineDist(f.climb, x, z)) * smooth(30, 40, rr) : 0;
      return [path, wet, 0, 0]; },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r; const land = L.current;
      buildSea(ctx, L, f);
      buildWreck(ctx, L, f.wreck);
      buildWreck(ctx, L, f.wreck2);
      /* the drowned dead of the wreck lie on the strand round the arena, swords and spears in the sand among them:
         the near sand of both views gets subjects */
      await buildDeadArmy(ctx, L, { wet: true, n: 10, near: [16, 26], arcs: [[FRONT - 0.55, 0.28], [FRONT + 0.5, 0.25], [FRONT + Math.PI - 0.4, 0.3], [FRONT + Math.PI + 0.45, 0.3]] }); if (L.current !== land) return;
      buildWeapons(ctx, L, { n: 12, near: [16, 32] });
      buildBeach(ctx, L, f);
      buildLighthouse(ctx, L, f.head);
      buildLightning(ctx, L);
      /* the landward set: a boathouse, a broken hull, an upturned boat, nets, loose timbers, tide pools */
      { const [hx, hz] = f.house.pos; const o = buildHut(ctx, L, hx, hz, f.house.rot, { W: 5.2, D: 4.0, H: 2.5, roofH: 1.9, stone: 1.1, wood: 0x5a5044, roofTex: 'castle_wall_slates', roofTint: 0x6a6c70, lamp: 0xffb868 }); f.lamp = o.lamp; }
      buildWreck(ctx, L, { ...f.hull, scale: 1.3, sink: 0.7 });
      buildBoat(ctx, L, ...f.boat.pos, f.boat.rot);
      buildNets(ctx, L, ...f.nets.pos, f.nets.rot);
      buildPools(ctx, L, f.pools, -0.14);
      { const angs = []; for (let i = 0; i < 9; i++) { const a = f.landA + (i / 8 - 0.5) * 3.2 + (r() - 0.5) * 0.2; if (angOff(a, f.seaAng) > 1.3 && angOff(a, f.landA) > 0.3) angs.push(a); } buildFalls(ctx, L, angs); }
      buildTimbers(ctx, L, () => { for (let k = 0; k < 30; k++) { const a = f.landA + (r() - 0.5) * 3.4; const d = 18 + Math.pow(r(), 0.7) * 32; const [x, z] = polar(a, d); if (Math.hypot(x, z) > ARENA_R + 1 && ctx.H(x, z) > -0.2) return [x, z]; } return polar(f.landA, 30); }, { n: 34 });
      /* spray where the sea meets the headland and cliffs */
      const [hx, hz] = polar(f.head.ang, f.head.d);
      for (let i = 0; i < 4; i++) { const a = r() * TAU; addSmoke(L, [hx + Math.cos(a) * 50, f.level, hz + Math.sin(a) * 50], { n: 8, size: 14, rise: 22, life: 5, wind: [-0.3, 0, 0.2], low: 0x8a94a8, high: 0x5a6274, alpha: 0.45 }); }
    },
    props: [
      { m: 'namaqualand_cliff_01', n: 10, s: [14, 26], d: [50, 110], sink: 0.1, tint: 0x3c4048, tilt: 0.1, where: (ctx, x, z) => (angOff(Math.atan2(z, x), ctx.f.seaAng) > 1.2 ? 1 : 0) },
      { m: 'namaqualand_cliff_01', n: 7, s: [8, 16], d: [45, 140], sink: 0.35, tint: 0x30343c, where: (ctx, x, z) => (angOff(Math.atan2(z, x), ctx.f.seaAng) < 0.8 ? 1 : 0) },
      { m: 'rock_07', n: 30, s: [1.2, 4.5], d: [20, 70], sink: 0.3, tint: 0x5a5e66, tilt: 0.4, cluster: [1, 5], spread: 9, tintVar: 0.18, tintTo: 0x8a9088 },
      { m: 'boulder_01', n: 14, s: [0.8, 2.4], d: [18, 60], sink: 0.35, tint: 0x6a6e74, tilt: 0.5, cluster: [1, 3], spread: 6, tintVar: 0.2, tintTo: 0x7a8a70 },
      { m: 'rock_09', n: 50, s: [0.4, 1.3], d: [6, 60], sink: 0.35, tint: 0x5a5e66, tilt: 0.6, clutter: true, cluster: [1, 6], spread: 5, tintVar: 0.25, tintTo: 0x6a7a62 },
      { p: 'pebble', shadow: false, n: 90, s: [0.12, 0.5], d: [4, 50], tint: 0x5a5e66, tilt: 0.6, clutter: true, cluster: [1, 6], spread: 4, tintVar: 0.3, tintTo: 0x6a7a62 },
      { m: 'dead_tree_trunk_02', n: 10, s: [3, 6], d: [17, 45], sink: 0.2, tint: 0x8a8a84, clutter: true, where: (ctx, x, z) => (Math.hypot(x, z) > ARENA_R + 1 ? 1 : 0) },
      /* the near sand: pebbles, shell grit and bleached sticks, in drifts, never in rows */
      { p: 'pebble', shadow: false, n: 110, s: [0.06, 0.3], d: [3, 22], tint: 0x6a6a6a, tilt: 0.8, clutter: true, cluster: [3, 10], spread: 2.2, tintVar: 0.3, tintTo: 0xa8a08e },
      { m: 'dry_branches_medium_01', n: 22, s: [0.7, 1.6], d: [6, 40], tint: 0x8a8680, clutter: true, cluster: [1, 3], spread: 3, tintVar: 0.2 },
    ],
    particles: [{ kind: 'rain', n: 2600, vel: [-4.5, -16, 2.0], color: 0xc8d0e0, opacity: 0.3, len: 0.9, box: 18, wide: 50 }],
  },
};
/* A land without a look (an unknown id) borrows the closest one. */
export const lookOf = (id) => LOOKS[id] || LOOKS.ashlands;

/* ======================================================================================================
   Story props and set pieces
   ====================================================================================================== */
/* the fallen: knights baked in death poses, charred (ember cracks) or frozen (rime) */
async function buildDeadArmy(ctx, L, { char = false, frozen = false, wet = false, n = 8, near = [17, 34], arcs = null }) {
  const r = ctx.r; const land = L.current;
  const poses = [['Death01', 3], ['Fixing_Kneeling', 1.2], ['Sitting_Idle_Loop', 0.8], ['Death01', 2.2]];
  const geos = await Promise.all(poses.map(([c, t]) => corpseGeo(c, t)));
  if (L.current !== land) return;
  const steel = new THREE.MeshStandardMaterial({ color: char ? 0x2a2420 : 0x9aa8b8, roughness: char ? 0.75 : 0.35, metalness: char ? 0.4 : 0.2, envMapIntensity: char ? 0.3 : 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: char ? 0x140e0c : 0x7a8696, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.1 });
  if (char) { withEmbers(steel, 0xff4a10, 0.7, 0.18); withEmbers(cloth, 0xff4a10, 1.0, 0.12); }
  else if (wet) { steel.color.set(0x3a3e44); steel.roughness = 0.3; steel.envMapIntensity = 0.7; cloth.color.set(0x262a2c); } /* drowned dead on the strand: dark wet iron, sodden cloth, no rime */
  else { for (const m of [steel, cloth]) withCover(m, 0xb8c4d4, 0.85); }
  const lists = poses.map(() => []);
  for (let i = 0; i < n; i++) {
    let x; let z; let ry;
    if (char && ctx.story && r() < 0.6) [x, z, ry] = ctx.story.along(near[0], near[1]);
    else { let a = r() * TAU; const d = near[0] + r() * (near[1] - near[0]); if (arcs) { const [c, w] = arcs[i % arcs.length]; a = c + (a / TAU - 0.5) * 2 * w; } [x, z] = polar(a, d); ry = r() * TAU; }
    if (Math.hypot(x, z) < ARENA_R + 0.5) continue;
    const k = i % poses.length; const y = ctx.H(x, z) + (frozen ? -0.25 : -0.05);
    lists[k].push({ x, y, z, ry, s: 1.27, sy: 1 });
  }
  geos.forEach((g, k) => { if (g.steel) L.instanced(g.steel, steel, lists[k], { ownGeo: false }); if (g.cloth) L.instanced(g.cloth, cloth, lists[k], { ownGeo: false }); });
  land.owned.push(steel, cloth);
}
/* weapons stuck in the ground: spears and swords at angles */
function buildWeapons(ctx, L, { n = 20, near = [16, 36], frost = false }) {
  const r = ctx.r;
  /* designed battlefield weapons in vertex
     colour. A spear is now built at its true length (2.5 m, no y-stretch): a dark ash shaft as thick as a hand, a socketed
     leaf head with a lug bar, a leather binding and a torn red pennon, so at 30 m it reads as a dark staff with a flag,
     never as a white line. A sword has a steel blade with a fuller, a dark iron guard, a leather grip and a pommel. */
  const vc = (g, hex) => { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
  const SH = 2.2; const STEEL = frost ? 0x9aa4ae : 0x6a6c70; const ASH = 0x3a2a1e; const IRON = 0x24221f; const LEATH = 0x4a2e1c;
  const spParts = [];
  { const s = new THREE.CylinderGeometry(0.036, 0.042, SH, 6); s.translate(0, SH / 2, 0); spParts.push(vc(s, ASH)); }
  { const s = new THREE.CylinderGeometry(0.03, 0.046, 0.2, 6); s.translate(0, SH + 0.08, 0); spParts.push(vc(s, IRON)); }
  { const h = new THREE.OctahedronGeometry(0.5, 0); h.scale(0.15, 0.82, 0.04); h.translate(0, SH + 0.55, 0); spParts.push(vc(h, STEEL)); }
  { const b = new THREE.BoxGeometry(0.3, 0.035, 0.035); b.translate(0, SH + 0.13, 0); spParts.push(vc(b, IRON)); }
  { const w = new THREE.CylinderGeometry(0.05, 0.05, 0.26, 6); w.translate(0, SH * 0.62, 0); spParts.push(vc(w, LEATH)); }
  { /* the torn pennon: a tapering cloth with a notch, hanging from the socket */
    const pg = new THREE.BufferGeometry(); const P = [0, SH, 0.02, 0.62, SH - 0.08, 0.05, 0.4, SH - 0.2, 0.03, 0, SH, 0.02, 0.4, SH - 0.2, 0.03, 0.66, SH - 0.33, 0.06, 0, SH, 0.02, 0.66, SH - 0.33, 0.06, 0, SH - 0.36, 0.02];
    pg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); pg.computeVertexNormals(); spParts.push(vc(pg, frost ? 0x5a1a16 : 0x4a1612)); }
  const spear = mergeGeometries(spParts); for (const g of spParts) g.dispose();
  const swParts = [];
  { const b = new THREE.BoxGeometry(0.065, 0.95, 0.014); b.translate(0, 0.475, 0); swParts.push(vc(b, STEEL)); }
  { const f = new THREE.BoxGeometry(0.018, 0.7, 0.018); f.translate(0, 0.5, 0); swParts.push(vc(f, frost ? 0x6a747e : 0x45474a)); }
  { const g = new THREE.BoxGeometry(0.3, 0.045, 0.05); g.translate(0, 0.97, 0); swParts.push(vc(g, IRON)); }
  { const g = new THREE.CylinderGeometry(0.022, 0.024, 0.22, 6); g.translate(0, 1.1, 0); swParts.push(vc(g, LEATH)); }
  { const g = new THREE.SphereGeometry(0.04, 6, 4); g.translate(0, 1.23, 0); swParts.push(vc(g, IRON)); }
  const sword = mergeGeometries(swParts); for (const g of swParts) g.dispose();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: frost ? 0.55 : 0.8, metalness: 0.35, envMapIntensity: 0.4, side: THREE.DoubleSide });
  if (frost) withCover(mat, 0xb8c4d4, 0.35);
  const sp = []; const sw = [];
  for (let i = 0; i < n; i++) {
    let x; let z; if (ctx.story && r() < 0.6) [x, z] = ctx.story.along(near[0], near[1]); else [x, z] = polar(r() * TAU, near[0] + r() * (near[1] - near[0]));
    if (Math.hypot(x, z) < ARENA_R + 0.3) continue;
    const it = { x, y: ctx.H(x, z) - 0.25, z, ry: r() * TAU, tx: (r() - 0.5) * 0.9, tz: (r() - 0.5) * 0.9, s: 1, sy: 1 };
    if (r() < 0.55) { it.s = 0.9 + r() * 0.25; it.sy = it.s; sp.push(it); } else { it.s = 1; it.sy = 1; sw.push(it); }
  }
  L.instanced(spear, mat, sp); L.instanced(sword, mat, sw);
}
/* broken war banners on poles */
function buildBanners(ctx, L, { n = 6, color = 0x5a1612, near = [18, 40], embers = true }) {
  const r = ctx.r;
  const pole = new THREE.CylinderGeometry(0.045, 0.055, 1, 6); pole.translate(0, 0.5, 0);
  const cross = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5); cross.rotateZ(Math.PI / 2); cross.translate(0, 0.96, 0);
  const poleG = mergeGeometries([pole, cross]); pole.dispose(); cross.dispose();
  const cloth = new THREE.PlaneGeometry(1.2, 1.9, 8, 10); cloth.translate(0, -0.95, 0);
  const wood = new THREE.MeshStandardMaterial({ color: 0x1e1612, roughness: 1 }); if (embers) withEmbers(wood, 0xff4a10, 0.6, 0.3);
  const poles = []; const cloths = [];
  for (let i = 0; i < n; i++) {
    let [x, z, ry] = ctx.story ? ctx.story.along(near[0], near[1]) : [...polar(r() * TAU, near[0] + r() * 20), r() * TAU];
    if (Math.hypot(x, z) < ARENA_R + 0.8) continue;
    const H = 2.8 + r() * 2.6; const broken = r() < 0.35; const tx = (r() - 0.5) * (broken ? 0.9 : 0.45); const tz = (r() - 0.5) * 0.4;
    const y = ctx.H(x, z) - 0.3; ry += (r() - 0.5) * 1.2;
    poles.push({ x, y, z, ry, tx, tz, s: 1, sy: broken ? H * (0.3 + r() * 0.3) : H });
    const cs = 0.75 + r() * 0.5; if (!broken) cloths.push({ x, y: y + H * 0.96 - 0.02, z, ry, tx, tz, s: cs, sy: (0.8 + r() * 0.5) / cs * cs });
  }
  L.instanced(poleG, wood, poles);
  const cm = bannerMaterial(color); L.current.winds.push(cm.userData.wind); L.instanced(cloth, cm, cloths);
}
/* an overturned supply cart with a loose wheel */
function buildCart(ctx, L, x, z, rot, { burnt = true } = {}) {
  const r = ctx.r; const parts = []; solidAlong(ctx, x, z, rot, [[-0.6], [1.0]], 1.0, 'cart');
  for (let i = 0; i < 7; i++) { const p = new THREE.BoxGeometry(2.6, 0.06, 0.2); p.translate(0, 0, -0.66 + i * 0.22); parts.push(p); }
  for (const s of [-1, 1]) { const side = new THREE.BoxGeometry(2.6, 0.5, 0.06); side.translate(0, 0.28, s * 0.72); parts.push(side); }
  const shaft = new THREE.BoxGeometry(2.4, 0.08, 0.08); shaft.translate(2.2, -0.1, 0.4); parts.push(shaft);
  const wheel = (cx, cz, tilt) => { const t = new THREE.TorusGeometry(0.55, 0.06, 6, 18); const sp = []; for (let k = 0; k < 6; k++) { const s = new THREE.BoxGeometry(1.05, 0.05, 0.05); s.rotateZ((k / 6) * Math.PI); sp.push(s); } const w = mergeGeometries([t, ...sp]); t.dispose(); sp.forEach((g) => g.dispose()); w.rotateX(tilt); w.translate(cx, 0, cz); return w; };
  parts.push(wheel(-0.8, -0.8, 0)); parts.push(wheel(2.6, 1.8, Math.PI / 2 - 0.1));
  const g = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p)); for (const p of parts) p.dispose();
  const mat = triMaterial('bark_brown_02', { tint: burnt ? 0x3a3028 : 0x5a4a3a, tile: 1.2, desat: 0.4 }); if (burnt) withEmbersTri(mat);
  const m = new THREE.Mesh(g, mat); m.position.set(x, ctx.H(x, z) + 0.45, z); m.rotation.set(0.15, rot, 1.25); m.castShadow = true; m.receiveShadow = true; L.add(m);
}
function withEmbersTri(mat) { const prev = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec2 vo = sqVor(vec2(vW.x + vW.z, vW.y * 2.0) / 0.25); totalEmissiveRadiance += vec3(2.6, 0.6, 0.1) * (1.0 - smoothstep(0.0, 0.05, vo.y)) * smoothstep(0.55, 0.8, sqN2(vW.xz * 0.6 + vW.y)); }`); }; }

/* a ruin with real wall thickness: two walls at a corner, a fallen column, rubble along the base */
function buildRuin(ctx, L, ruin, { tint = 0x8a8880, cover = 0x4a5236 } = {}) {
  const r = ctx.r; const [x, z] = ruin.pos; const y = ctx.H(x, z);
  solidAlong(ctx, x, z, ruin.rot, [[-4.5], [-1.5], [1.5], [4.5], [5.5, 1.2], [5.5, 3.6], [5.5, 6], [-1, 4.5]], 1.4, 'ruin');
  const mat = triMaterial('castle_wall_slates', { tint, tile: 2.6, cover, coverAmt: 0.65, nstr: 1.4 });
  const a = ruinWallGeo(r, 11, 6.5, 0.8); const b = ruinWallGeo(r, 7, 4.5, 0.8); b.rotateY(Math.PI / 2); b.translate(5.5, 0, 3.4);
  const col = new THREE.CylinderGeometry(0.5, 0.55, 5, 12, 4); col.rotateZ(Math.PI / 2 - 0.05); col.translate(-1, 0.45, 4.5);
  const g = mergeGeometries([a.toNonIndexed(), b.toNonIndexed(), col.toNonIndexed()]); for (const q of [a, b, col]) q.dispose();
  g.deleteAttribute('uv');
  const m = new THREE.Mesh(g, mat); m.position.set(x, y - 0.2, z); m.rotation.y = ruin.rot; m.castShadow = true; m.receiveShadow = true; L.add(m);
  /* rubble: chips of the same stone heaped at the foot of the walls */
  const rubG = chunkGeo(r, { w: 1, h: 0.6, d: 0.8, chip: 0.35 }); const list = [];
  const c = Math.cos(ruin.rot); const s = Math.sin(ruin.rot);
  for (let i = 0; i < 46; i++) { const lx = (r() - 0.5) * 12; const lz = (r() < 0.5 ? -1 : 1) * (0.7 + r() * 2.2) * (r() < 0.3 ? 2 : 1); const wx = x + lx * c + lz * s; const wz = z - lx * s + lz * c; list.push({ x: wx, y: ctx.H(wx, wz) - 0.12, z: wz, ry: r() * TAU, tx: (r() - 0.5) * 0.6, tz: (r() - 0.5) * 0.6, s: 0.3 + Math.pow(r(), 2) * 0.9 }); }
  L.instanced(rubG, mat, list, { shadow: true });
}
/* a sunken temple: a stepped platform, broken columns, a doorway, all in world-space stone */
function buildTemple(ctx, L, t) {
  const r = ctx.r; const [x, z] = t.pos; const y = ctx.H(x, z); solid(ctx, x, z, 16, 'temple');
  const mat = triMaterial('castle_wall_slates', { tint: 0x8a8a78, tile: 3, cover: 0x2a4a1e, coverAmt: 0.8, nstr: 1.5 });
  const parts = [];
  for (let i = 0; i < 4; i++) { const w = 30 - i * 6; const st = chunkGeo(r, { w, h: 3, d: w, chip: 0.05, seg: 4 }); st.translate(0, i * 3, 0); parts.push(st); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const H = 4 + r() * 6; const c = new THREE.CylinderGeometry(0.7, 0.8, H, 12, 3); c.translate(Math.cos(a) * 5, 12 + H / 2, Math.sin(a) * 5); parts.push(c); }
  const door = ruinWallGeo(r, 6, 6, 1.2); door.translate(0, 12, -3); parts.push(door);
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; if (q.attributes.uv) q.deleteAttribute('uv'); return q; })); for (const p of parts) p.dispose();
  const m = new THREE.Mesh(g, mat); m.position.set(x, y - 1.5, z); m.rotation.y = t.rot; m.castShadow = true; m.receiveShadow = true; L.add(m);
  /* roots of the jungle pour over the steps: each follows the stair profile down to the ground */
  const roots = []; uvS = 1;
  for (let i = 0; i < 12; i++) {
    const side = Math.floor(r() * 4); const lat = (r() - 0.5) * 9; const pts = [];
    const put = (out, yy) => { const o = out + (r() - 0.5) * 0.3; const l = lat + (r() - 0.5) * 0.6; const v = [[o, l], [-o, l], [l, o], [l, -o]][side]; pts.push(new THREE.Vector3(v[0], yy, v[1])); };
    put(2 + r() * 2, 12.3); for (let k = 3; k >= 0; k--) { const half = 15 - k * 3; put(half - 0.6, 3 * (k + 1) + 0.25); put(half + 0.35, 3 * (k + 1) - 0.4); put(half + 0.45, 3 * k + 0.6); }
    put(18 + r() * 3, -0.4);
    roots.push(taperTube(pts, 0.28 + r() * 0.2, 0.06, 6, 40));
  }
  const rg = mergeGeometries(roots); for (const q of roots) q.dispose();
  const rm = new THREE.Mesh(rg, triMaterial('bark_brown_02', { tint: 0x5a5444, tile: 1.4, cover: 0x2a4a1e, coverAmt: 0.6 })); rm.position.copy(m.position); rm.rotation.y = t.rot; rm.castShadow = true; rm.receiveShadow = true; L.add(rm);
  /* a fire on the top step between the pillars (the fen tower's fire: a depth-writing core, a flame cone, glow cards),
     the one warm point of the jungle view */
  if (t.fire) {
    const FIRE = 0xffa05a; const top = new THREE.Vector3(x, y - 1.5 + 12.2, z);
    const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(FIRE).multiplyScalar(5), toneMapped: false, fog: false }); const fg = new THREE.IcosahedronGeometry(1, 1);
    const core = new THREE.Mesh(fg, fm); core.position.copy(top); core.scale.set(0.9, 0.6, 0.9); L.current.group.add(core);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.2, 7, 1, true), fm); flame.position.copy(top).y += 1.5; L.current.group.add(flame);
    L.current.owned.push(fm, fg, flame.geometry); L.current.tickers.push((tt) => { const k = 0.85 + 0.15 * Math.sin(tt * 9) * Math.sin(tt * 3.3); flame.scale.set(k, 0.8 + 0.4 * k * Math.sin(tt * 5.1 + 1) ** 2, k); flame.rotation.y = tt * 0.7; });
    addGlows(L, [[top.x, top.y + 1.0, top.z, 11], [top.x, top.y + 0.7, top.z, 4.5]], FIRE, { alpha: 0.9 });
    addGlows(L, [[top.x, top.y + 0.4, top.z, 2.6]], 0xffe2b0, { alpha: 1.6 });
  }
}
/* hanging vines: curved ribbons that drop from the crowns, sway with the wind */
const VINE_VERT_PATCH = `#include <begin_vertex>
  { float ph = 0.0;
    #ifdef USE_INSTANCING
    ph = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.17;
    #endif
    float k = 1.0 - position.y; k = k * k;
    transformed.x += sin(uTime * 0.9 + ph) * 0.35 * k + sin(uTime * 2.1 + ph * 2.0) * 0.08 * k;
    transformed.z += cos(uTime * 0.7 + ph * 1.3) * 0.25 * k; }`;
function buildVines(ctx, L, giants) {
  const r = ctx.r; const land = L.current;
  /* every vine is built in metres in world space: hanging ones meander and twist and end in a hook; loops hang between two
     trunks as a catenary. aSway = how far a vertex may swing (0 at an anchor), so both kinds move like rope. */
  const tubes = []; const leafQ = []; uvS = 1;
  const swayOf = (g, fn, keepUv = false) => { const p = g.attributes.position; const a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = fn(p.getX(i), p.getY(i), p.getZ(i)); g.setAttribute('aSway', new THREE.BufferAttribute(a, 1)); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aSway' && !(keepUv && k === 'uv')) g.deleteAttribute(k); return g; };
  const leavesAlong = (pts, swayFn, n) => { const cv = new THREE.CatmullRomCurve3(pts); for (let j = 0; j < n; j++) { const t = (j + r()) / n; const a = cv.getPointAt(t); const q = new THREE.PlaneGeometry(0.42 + r() * 0.3, 0.07 + r() * 0.05); q.rotateZ(Math.PI / 2 + (r() - 0.5) * 1.4); q.rotateY(r() * TAU); q.translate(a.x + (r() - 0.5) * 0.15, a.y, a.z + (r() - 0.5) * 0.15); leafQ.push(swayOf(q, () => swayFn(t), true)); } };
  /* hanging vines from the crowns of the giants */
  for (const gi of giants) for (let k = 0; k < 14; k++) {
    const an = r() * TAU; const d = 1.5 + r() * 9; const x = gi.x + Math.cos(an) * d; const z = gi.z + Math.sin(an) * d; if (Math.hypot(x, z) < ARENA_R + 0.5) continue;
    const top = ctx.H(gi.x, gi.z) + gi.H * (0.6 + r() * 0.26); const len = 4 + r() * 12; const ph = r() * TAU; const amp = 0.4 + r() * 1.1; const n = 14; const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector3(x + Math.sin(t * 3.1 + ph) * amp * t + Math.cos(an) * t * len * 0.12, top - t * len * (1 - 0.06 * Math.sin(t * 9 + ph)), z + Math.cos(t * 2.3 + ph * 1.7) * amp * 0.7 * t)); }
    /* the end curls up into a loose hook */
    if (r() < 0.6) { const e = pts[n]; pts.push(new THREE.Vector3(e.x + 0.3, e.y - 0.25, e.z + 0.15), new THREE.Vector3(e.x + 0.45, e.y + 0.1, e.z + 0.35)); }
    const g = taperTube(pts, 0.035 + r() * 0.03, 0.012, 5, pts.length * 2); swayOf(g, (px, py) => clamp((top - py) / 12, 0, 1.3)); tubes.push(g);
    leavesAlong(pts, (t) => clamp(t * len / 12, 0, 1.3), Math.floor(len * 2.2));
  }
  /* loops: rope between two neighbouring giants, sagging in the middle */
  for (let i = 0; i < giants.length; i++) { const a = giants[i]; const b = giants.slice().sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[1]; if (!b) continue;
    for (let k = 0; k < 2; k++) { const ya = ctx.H(a.x, a.z) + a.H * (0.4 + r() * 0.35); const yb = ctx.H(b.x, b.z) + b.H * (0.4 + r() * 0.35); const span = Math.hypot(b.x - a.x, b.z - a.z); const sag = span * (0.18 + r() * 0.2); const off = (r() - 0.5) * 2; const pts = [];
      const ox = -(b.z - a.z) / span * off; const oz = (b.x - a.x) / span * off;
      for (let j = 0; j <= 16; j++) { const t = j / 16; const c = Math.cosh((t - 0.5) * 2.4) - Math.cosh(1.2); pts.push(new THREE.Vector3(lerp(a.x, b.x, t) + ox, lerp(ya, yb, t) + c / (Math.cosh(1.2) - 1) * sag, lerp(a.z, b.z, t) + oz)); }
      const mid = (px, pz) => { const t = clamp(((px - a.x) * (b.x - a.x) + (pz - a.z) * (b.z - a.z)) / (span * span), 0, 1); return Math.sin(t * Math.PI) * 0.6; };
      const g = taperTube(pts, 0.05, 0.05, 5, 32); swayOf(g, (px, py, pz) => mid(px, pz)); tubes.push(g);
      leavesAlong(pts, (t) => Math.sin(t * Math.PI) * 0.6, Math.floor(span * 1.4)); } }
  if (!tubes.length) return;
  const g = mergeGeometries(tubes); for (const t of tubes) t.dispose();
  const U = { uTime: { value: 0 }, uGrow: { value: 1 } };
  const SWAY = `#include <begin_vertex>
    { float ph = position.x * 0.13 + position.z * 0.11; transformed.x += (sin(uTime * 0.8 + ph) * 0.45 + sin(uTime * 1.9 + ph * 2.0) * 0.1) * aSway; transformed.z += cos(uTime * 0.65 + ph * 1.3) * 0.32 * aSway; }`;
  const patch = (mat, key) => { const prev = mat.onBeforeCompile; mat.onBeforeCompile = (sh, rr) => { if (prev) prev.call(mat, sh, rr); Object.assign(sh.uniforms, U); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aSway;').replace('#include <begin_vertex>', SWAY); }; mat.customProgramCacheKey = () => key; return mat; };
  const mat = patch(new THREE.MeshStandardMaterial({ color: 0x34402a, roughness: 0.9, envMapIntensity: 0.1 }), 'sq-vine2');
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; L.add(m, { grow: false });
  const lg = mergeGeometries(leafQ); for (const q of leafQ) q.dispose(); const c = new Float32Array(lg.attributes.position.count * 3); const col = new THREE.Color(); for (let k = 0; k < c.length; k += 3) { col.set(0x3c5a35).lerp(new THREE.Color(0x7a8a4a), r() * 0.5); c.set([col.r, col.g, col.b], k); } lg.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const lm = leafClusterMaterial(0xe8d8b8); patch(lm, 'sq-leafcl-vine2');
  const lmesh = new THREE.Mesh(lg, lm); lmesh.frustumCulled = false; L.add(lmesh, { grow: false });
  land.winds.push(U);
}
/* bleached bones of a great beast: a spine, a ribcage, a skull, scattered long bones */
function buildBones(ctx, L, [x, z], rot, scale = 1) {
  const r = ctx.r; const parts = []; solidAlong(ctx, x, z, rot, [[-6.5 * scale], [-3 * scale], [0], [3 * scale], [5.5 * scale]], 1.7 * scale, 'ribcage');
  const L0 = 11; const spine = []; for (let i = 0; i <= 16; i++) { const t = i / 16; spine.push(new THREE.Vector3(-L0 / 2 + t * L0, 1.6 + Math.sin(t * Math.PI) * 0.9 - t * 0.6, Math.sin(t * 3) * 0.3)); }
  uvS = 1; parts.push(taperTube(spine, 0.18, 0.08, 6, 30));
  for (let i = 0; i < 16; i++) { const p = spine[i]; const t = i / 16; parts.push(taperTube([p.clone().add(new THREE.Vector3(0, 0.25, 0)), p.clone().add(new THREE.Vector3(0, 0.6, 0))], 0.07, 0.03, 4, 2)); if (t < 0.15 || t > 0.75) continue; const rib = 1.5 + Math.sin((t - 0.15) / 0.6 * Math.PI) * 1.4; for (const s of [-1, 1]) { if (r() < 0.12) continue; const pts = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 0.95; pts.push(new THREE.Vector3(p.x + (r() - 0.5) * 0.1, p.y - Math.sin(a) * rib * 0.9 + 0.1, p.z + s * (Math.sin(a * 0.5) * rib + 0.15))); } parts.push(taperTube(pts, 0.09, 0.04, 5, 10)); } }
  const skull = chunkGeo(r, { w: 1.6, h: 0.9, d: 1.0, chip: 0.25, seg: 3, taper: 0.4 }); skull.rotateZ(-0.3); skull.translate(-L0 / 2 - 1.0, 0.0, 0.1); parts.push(skull.toNonIndexed());
  const horn = []; for (let k = 0; k <= 8; k++) { const t = k / 8; horn.push(new THREE.Vector3(-L0 / 2 - 1.2 - t * 0.6, 0.6 + t * 1.6, 0.4 + Math.sin(t * 2) * 1.2)); } parts.push(taperTube(horn, 0.16, 0.02, 6, 12));
  for (let i = 0; i < 6; i++) { const a = r() * TAU; const d = 3 + r() * 6; const bx = Math.cos(a) * d; const bz = Math.sin(a) * d; parts.push(taperTube([new THREE.Vector3(bx, 0.1, bz), new THREE.Vector3(bx + Math.cos(a + 1) * 1.6, 0.12, bz + Math.sin(a + 1) * 1.6)], 0.09, 0.07, 5, 3)); }
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; if (q.attributes.uv) q.deleteAttribute('uv'); return q; })); for (const p of parts) p.dispose();
  const mat = new THREE.MeshStandardMaterial({ color: 0xa89c88, roughness: 0.75, envMapIntensity: 0.2 });
  const m = new THREE.Mesh(g, mat); m.scale.setScalar(scale); m.position.set(x, ctx.H(x, z) - 0.6 * scale, z); m.rotation.set(0.05, rot, 0.18); m.castShadow = true; m.receiveShadow = true; L.add(m);
}
/* ice: a glossy frozen lake that mirrors the sky and its aurora, with cracks and trapped bubbles */
const ICE_FRAG_PARS = `uniform float uTime; uniform vec3 uSkyLo; uniform vec3 uSkyHi; uniform vec3 uAur; uniform vec3 uSunDir; uniform vec3 uCenter; uniform float uR; ${WORLD_VARY_PARS} ${NOISE}`;
function buildIce(ctx, L, lake) {
  const land = L.current;
  const g = new THREE.CircleGeometry(lake.R + 3, 64); g.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8aa0b4, roughness: 0.1, metalness: 0, envMapIntensity: 0.12 });
  const U = { uTime: { value: 0 }, uSkyLo: { value: new THREE.Color() }, uSkyHi: { value: new THREE.Color() }, uAur: { value: new THREE.Color(0x2affb0) }, uSunDir: { value: new THREE.Vector3(-0.5, 0.3, -0.8) }, uCenter: { value: new THREE.Vector3(lake.x, 0, lake.z) }, uR: { value: lake.R } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WORLD_VARY_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${ICE_FRAG_PARS}`)
      .replace('#include <map_fragment>', `float dl = length(vW.xz - uCenter.xz); float edgeK = smoothstep(uR + 2.5, uR - 1.0, dl + (sqN2(vW.xz * 0.3) - 0.5) * 4.0); if (edgeK < 0.02) discard;
        vec3 sqV = normalize(cameraPosition - vW); vec2 par = -sqV.xz / max(sqV.y, 0.15);
        /* surface cracks, then two deeper layers seen through the ice: offset by the view, darker and softer with depth */
        /* main cracks: big cells, a smooth bend plus a fine jag, gaps along the edges so no closed cells read */
        vec2 wq = vW.xz * 0.075; wq += (vec2(sqN2(wq * 0.7), sqN2(wq * 0.7 + 5.0)) - 0.5) * 1.3 + (vec2(sqN2(wq * 7.0 + 2.0), sqN2(wq * 7.0 + 7.0)) - 0.5) * 0.09; vec2 cv = sqVor(wq);
        float crW = 0.006 + 0.022 * sqN2(wq * 3.0);
        float crack = (1.0 - smoothstep(0.0, crW, cv.y)) * smoothstep(0.42, 0.62, sqN2(wq * 1.6 + 2.0)) * (0.35 + 0.65 * sqN2(wq * 9.0));
        /* frost feathering beside the main cracks */
        crack += (1.0 - smoothstep(0.0, 0.09, cv.y)) * smoothstep(0.5, 0.7, sqN2(wq * 1.6 + 2.0)) * 0.18;
        /* a deeper fracture plane seen through the ice: shifted by the view, dim, few edges */
        vec2 q1 = (vW.xz + par * 0.5) * 0.13 + 11.0; q1 += (vec2(sqN2(q1 * 0.8), sqN2(q1 * 0.8 + 3.0)) - 0.5) * 1.2 + (vec2(sqN2(q1 * 6.0), sqN2(q1 * 6.0 + 4.0)) - 0.5) * 0.1; vec2 c1 = sqVor(q1);
        float deep1 = (1.0 - smoothstep(0.0, 0.02 + 0.03 * sqN2(q1 * 2.5), c1.y)) * smoothstep(0.55, 0.78, sqN2(q1 * 1.3)) * (0.3 + 0.7 * sqN2(q1 * 5.0));
        /* hairlines: short, rare, only near the surface */
        vec2 q2 = vW.xz * 0.6 + 23.0; q2 += (vec2(sqN2(q2 * 1.5), sqN2(q2 * 1.5 + 6.0)) - 0.5) * 0.6; vec2 c2 = sqVor(q2);
        float deep2 = (1.0 - smoothstep(0.0, 0.025, c2.y)) * smoothstep(0.68, 0.85, sqN2(q2 * 0.35 + 1.0));
        vec2 bq = (vW.xz + par * 0.55) * 3.0; float bub = smoothstep(0.16, 0.05, length(fract(bq) - 0.5 + (sqH2(floor(bq)) - 0.5) * 0.6)) * step(0.9, sqH2(floor(bq) + 3.0));
        vec2 bq2 = (vW.xz + par * 0.25) * 7.0; bub += smoothstep(0.14, 0.04, length(fract(bq2) - 0.5)) * step(0.95, sqH2(floor(bq2) + 9.0)) * 0.6;
        float deepC_frozen = 0.0;
        float frost = smoothstep(0.5, 0.85, sqF2(vW.xz * 0.12)) * 0.4 + (1.0 - edgeK) * 0.7;
        /* wind-blown snow lies across the ice in long drifts (one wind, so the lines agree), thick near the shore and
           thin in the middle: the lower third of the view gets a strong texture instead of a blank sheet */
        { vec2 wd = vec2(0.83, 0.56); float al = dot(vW.xz, wd); float ac = dot(vW.xz, vec2(-wd.y, wd.x));
          float dr = smoothstep(0.5, 0.82, sqN2(vec2(al * 0.09, ac * 0.3)) * 0.6 + sqN2(vec2(al * 0.4, ac * 1.1)) * 0.3 + sqN2(vW.xz * 1.7) * 0.15);
          dr *= smoothstep(0.35, 0.7, sqN2(vW.xz * 0.045 + 3.0));
          frost += dr * (0.4 + 0.3 * smoothstep(uR * 0.3, uR, dl)); }
        /* pale things frozen inside the ice (a lost blade, a bone, a spear shaft), seen through it, shifted by the view */
        { vec2 fq = (vW.xz + par * 0.7) * 0.42; vec2 fc = floor(fq); float pick = step(0.82, sqH2(fc + 13.0)); vec2 fl = fract(fq) - 0.5 + (sqH2(fc + 2.0) - 0.5) * 0.4;
          float ang = sqH2(fc + 5.0) * 6.283; vec2 ro = vec2(cos(ang) * fl.x - sin(ang) * fl.y, sin(ang) * fl.x + cos(ang) * fl.y);
          float shape = smoothstep(0.05, 0.0, abs(ro.y) - 0.012 - 0.02 * sqN2(ro * 9.0)) * smoothstep(0.34, 0.2, abs(ro.x));
          deepC_frozen = shape * pick; }
        vec3 deepC = mix(vec3(0.008, 0.022, 0.045), vec3(0.02, 0.06, 0.1), sqF2(vW.xz * 0.05));
        vec3 iceC = (deepC + vec3(0.1, 0.13, 0.16) * deep2 * 0.5 + vec3(0.07, 0.12, 0.15) * deep1 * 0.7 + vec3(0.16, 0.2, 0.24) * bub * 0.5) + vec3(0.11, 0.115, 0.12) * deepC_frozen;
        diffuseColor.rgb = mix(iceC, vec3(0.26, 0.3, 0.36), clamp(frost + crack * 0.6, 0.0, 1.0));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.3, 0.8, clamp(frost + crack * 0.5, 0.0, 1.0));')
      /* the room-environment reflection made a soft white hotspot on the ice: capped */
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directSpecular = min(reflectedLight.directSpecular * 0.12, vec3(0.03)); reflectedLight.directDiffuse = min(reflectedLight.directDiffuse, vec3(0.07)); reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular * 0.35, vec3(0.018));')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 v = normalize(cameraPosition - vW); vec3 rf = reflect(-v, vec3(0.0, 1.0, 0.0)); float fr = 0.04 + 0.6 * pow(1.0 - max(v.y, 0.0), 5.0);
          vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.5, rf.y));
          float az = atan(rf.z, rf.x); float au = smoothstep(0.12, 0.3, rf.y) * (1.0 - smoothstep(0.3, 0.6, rf.y)) * (0.45 + 0.55 * sqN2(vec2(az * 30.0, uTime * 0.25))) * smoothstep(0.3, 0.65, sqN2(vec2(az * 1.3 - uTime * 0.02, 1.0)));
          float clear = 1.0 - clamp(frost + crack * 0.6, 0.0, 1.0);
          totalEmissiveRadiance += min((sky * fr * 0.3 + uAur * au * 0.12) * clear * edgeK, vec3(0.06)); }`);
  };
  mat.customProgramCacheKey = () => 'sq-ice';
  const m = new THREE.Mesh(g, mat); m.position.set(lake.x, 0.004, lake.z); m.receiveShadow = true; m.renderOrder = 0;
  land.group.add(m); land.owned.push(g, mat);
  land.tickers.push((t) => { U.uTime.value = t; U.uSkyLo.value.copy(L.world.col.fog); U.uSkyHi.value.copy(L.world.col.bottom).lerp(L.world.col.top, 0.3); U.uSunDir.value.copy(L.skyU.uSunDir.value); });
}
/* boot prints in the snow along a trail */
function buildFootprints(ctx, L, trail, lake) {
  const r = ctx.r; const g = new THREE.PlaneGeometry(0.16, 0.32); g.rotateX(-Math.PI / 2);
  /* a boot print: soft oval sole with a separate heel, so it never reads as a card */
  const tex = canvasTex('sq-print', 32, 64, (c, w, h) => { c.clearRect(0, 0, w, h); const gr = c.createRadialGradient(w / 2, h * 0.32, 1, w / 2, h * 0.32, w * 0.5); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.beginPath(); c.ellipse(w / 2, h * 0.32, w * 0.42, h * 0.3, 0, 0, Math.PI * 2); c.fill(); const g2 = c.createRadialGradient(w / 2, h * 0.8, 1, w / 2, h * 0.8, w * 0.4); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g2; c.beginPath(); c.ellipse(w / 2, h * 0.8, w * 0.34, h * 0.16, 0, 0, Math.PI * 2); c.fill(); });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4658, roughness: 1, transparent: true, opacity: 0.55, alphaMap: tex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const list = []; let side = 1;
  for (let i = 0; i < trail.length - 1; i++) { const [ax, az] = trail[i]; const [bx, bz] = trail[i + 1]; const l = Math.hypot(bx - ax, bz - az); const n = Math.floor(l / 0.75); const ry = Math.atan2(bx - ax, bz - az); for (let k = 0; k < n; k++) { const t = k / n; side = -side; const x = lerp(ax, bx, t) + Math.cos(ry) * 0.16 * side; const z = lerp(az, bz, t) - Math.sin(ry) * 0.16 * side; if (Math.hypot(x, z) > 140) continue; if (lake && Math.hypot(x - lake.x, z - lake.z) < lake.R + 3.5) continue; list.push({ x, y: ctx.H(x, z) + 0.02, z, ry: ry + (r() - 0.5) * 0.15, s: 1, sy: 1 }); } }
  L.instanced(g, mat, list, { shadow: false });
}
/* light rays as camera-facing ribbons along an axis: soft gaussian sides, faded ends, faded when the eye is inside.
   list: { foot: [x,y,z], dir: [x,y,z] (toward the light), len, w0 (at the foot), w1 (at the far end), k (brightness) } */
const RAY_VERT = `attribute vec3 aFoot; attribute vec3 aDir; attribute vec4 aDim; uniform float uTime;
varying vec2 vUv; varying float vK; varying float vSeed;
void main(){ vUv = uv; vec3 dir = normalize(aDir); float along = uv.y * aDim.x; vec3 c = aFoot + dir * along;
  vec3 toCam = cameraPosition - c; vec3 side = normalize(cross(dir, toCam) + vec3(1e-4, 0.0, 0.0));
  float w = mix(aDim.y, aDim.z, uv.y); vec3 p = c + side * (uv.x - 0.5) * w;
  vec3 rel = cameraPosition - aFoot; float t = clamp(dot(rel, dir), 0.0, aDim.x); float dAxis = length(rel - dir * t);
  float face = length(cross(dir, normalize(toCam)));
  vK = aDim.w * smoothstep(w * 0.6, w * 2.5, dAxis) * smoothstep(0.15, 0.5, face); vSeed = aFoot.x * 0.37 + aFoot.z * 0.21;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const RAY_FRAG = `uniform vec3 uCol; uniform float uA; uniform float uTime; uniform vec2 uEnds; varying vec2 vUv; varying float vK; varying float vSeed; ${NOISE}
void main(){ float x = (vUv.x - 0.5) * 2.0; float side = exp(-x * x * 3.2) * (1.0 - smoothstep(0.75, 1.0, abs(x)));
  float ends = smoothstep(0.0, uEnds.x, vUv.y) * (1.0 - smoothstep(uEnds.y, 1.0, vUv.y));
  float n = 0.55 + 0.45 * sqN2(vec2(x * 3.0 + vSeed, vUv.y * 6.0 - uTime * 0.12));
  float a = side * ends * n * vK * uA; if (a < 0.002) discard; gl_FragColor = vec4(uCol * a, 1.0); }`;
function addRays(L, list, color, { alpha = 0.1, ends = [0.12, 0.6] } = {}) {
  if (!list.length) return null;
  const base = new THREE.PlaneGeometry(1, 1, 1, 8); base.translate(0.5, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
  geo.setAttribute('aFoot', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((r) => r.foot)), 3));
  geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((r) => r.dir)), 3));
  geo.setAttribute('aDim', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((r) => [r.len, r.w0, r.w1, r.k ?? 1])), 4));
  geo.instanceCount = list.length;
  const U = { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uA: { value: 0 }, uEnds: { value: new THREE.Vector2(...ends) } };
  const mat = new THREE.ShaderMaterial({ vertexShader: RAY_VERT, fragmentShader: RAY_FRAG, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 4;
  const land = L.current; land.group.add(m); land.owned.push(geo, mat, base);
  land.tickers.push((t) => { U.uTime.value = t; U.uA.value = alpha * Math.min(1, land.t / 3); });
  return m;
}
/* soft contact shadows under rocks and stones, so nothing seems to float */
const BLOB_FRAG = `uniform float uA; varying vec2 vUv; ${NOISE} void main(){ vec2 q = (vUv - 0.5) * 2.0; float d = length(q) + (sqN2(vUv * 6.0) - 0.5) * 0.25; float a = exp(-d * d * 2.6) * (1.0 - smoothstep(0.8, 1.0, d)) * uA; if (a < 0.01) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`;
function addBlobs(ctx, L, list, alpha = 0.5) {
  if (!list.length) return;
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
  const U = { uA: { value: alpha } };
  const mat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }', fragmentShader: BLOB_FRAG, uniforms: U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.InstancedMesh(g, mat, list.length); mesh.renderOrder = 1; mesh.frustumCulled = false;
  const up = new THREE.Vector3(0, 1, 0); const n = new THREE.Vector3(); const q = new THREE.Quaternion(); const m4 = new THREE.Matrix4(); const p = new THREE.Vector3(); const sc = new THREE.Vector3();
  list.forEach(([x, z, r, y], i) => { const e = 0.5; const H = ctx.H; if (y != null) n.set(0, 1, 0); else n.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize(); q.setFromUnitVectors(up, n); m4.compose(p.set(x, y ?? H(x, z) + 0.03, z), q, sc.set(r * 2, 1, r * 2)); mesh.setMatrixAt(i, m4); });
  const land = L.current; land.group.add(mesh); land.owned.push(g, mat);
}
/* moonlight shafts through gaps in the canopy: soft ribbons along the key direction */
function buildShafts(ctx, L, f, { color = 0xc8dcff, alpha = 0.075, n = 12, spot = 0x8aa0c8 } = {}) {
  const r = ctx.r;
  const key = new THREE.Vector3(...(ctx.W?.LAND_LOOK?.[ctx.look.id]?.key || [-0.67, 0.36, -0.74])).normalize();
  const list = []; const spots = [];
  for (let i = 0; i < 60 && list.length < n; i++) {
    const a = r() * TAU; const d = 6 + r() * 45; const [x, z] = polar(a, d);
    if (f.trees && f.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3)) continue;
    const y = ctx.H(x, z); const len = 30 / key.y; const w = 1.6 + r() * 2.2;
    list.push({ foot: [x, y - 0.5, z], dir: [key.x, key.y, key.z], len, w0: w * 1.35, w1: w * 0.8, k: 0.6 + r() * 0.6 });
    if (Math.hypot(x, z) > 18) spots.push([x, y + 0.2, z, w * 2.2]);
  }
  addRays(L, list, color, { alpha, ends: [0.04, 0.55] });
  addGlows(L, spots, spot, { alpha: 0.05 });
}
/* the focal point of the wood: a moss-grown shrine with candles, or an iron cage hanging from a bough with a pale light */
function buildFocal(ctx, L, focal) {
  const r = ctx.r; const [x, z] = focal.pos; const y = ctx.H(x, z); solid(ctx, x, z, focal.kind === 'shrine' ? 1.5 : 0.8, 'shrine');
  const stone = triMaterial('castle_wall_slates', { tint: 0x7a7a6e, tile: 1.6, cover: 0x3a5a28, coverAmt: 0.8 });
  if (focal.kind === 'shrine') {
    const parts = [chunkGeo(r, { w: 2.6, h: 0.5, d: 1.8, chip: 0.1 }), chunkGeo(r, { w: 1.6, h: 1.6, d: 1.1, chip: 0.12 })];
    parts[1].translate(0, 0.5, 0);
    const arch = new THREE.TorusGeometry(1.1, 0.2, 8, 16, Math.PI); arch.translate(0, 2.1, 0); parts.push(arch);
    for (const s of [-1, 1]) { const p = chunkGeo(r, { w: 0.4, h: 2.2, d: 0.4, chip: 0.1 }); p.translate(s * 1.1, 0, 0); parts.push(p); }
    const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; if (q.attributes.uv) q.deleteAttribute('uv'); return q; })); for (const p of parts) p.dispose();
    const m = new THREE.Mesh(g, stone); m.position.set(x, y - 0.1, z); m.rotation.y = Math.atan2(-x, -z); m.castShadow = true; m.receiveShadow = true; L.add(m);
    const cand = []; for (let i = 0; i < 9; i++) { const a = r() * TAU; const d = 0.6 + r() * 1.4; cand.push([x + Math.cos(a) * d, y + 0.12 + (i < 3 ? 2.0 : 0.5), z + Math.sin(a) * d, 0.25]); }
    addGlows(L, cand, 0xffd08a, { alpha: 2.5 });
    addGlows(L, [[x, y + 1.8, z, 9], [x, y + 0.4, z, 14]], 0x9adfa0, { alpha: 0.28 });
  } else {
    const parts = []; const bars = 10;
    for (let i = 0; i < bars; i++) { const a = (i / bars) * TAU; const b = new THREE.CylinderGeometry(0.025, 0.025, 2.2, 4); b.translate(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7); parts.push(b); }
    for (const yy of [-1.1, 1.1]) { const t = new THREE.TorusGeometry(0.7, 0.04, 4, 20); t.rotateX(Math.PI / 2); t.translate(0, yy, 0); parts.push(t); }
    const chain = new THREE.CylinderGeometry(0.03, 0.03, 8, 4); chain.translate(0, 5.1, 0); parts.push(chain);
    const g = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p)); for (const p of parts) p.dispose();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.7 })); m.position.set(x, y + 3.6, z); m.castShadow = true; L.add(m);
    L.current.tickers.push((t) => { m.rotation.z = Math.sin(t * 0.6) * 0.05; m.rotation.y = t * 0.1; });
    addGlows(L, [[x, y + 3.6, z, 1.2]], 0xd8f0ff, { alpha: 2.2 });
    addGlows(L, [[x, y + 3.6, z, 12], [x, y + 0.3, z, 10]], 0x9ac8ff, { alpha: 0.3 });
  }
  L.current.owned.push(stone);
}
/* the sea: a grid that is fine near the shore and coarse far out, Gerstner waves toward the beach */
function buildSea(ctx, L, f) {
  const land = L.current; const W = 1400; const D = 700; const NX = 200; const NZ = 170;
  const pos = []; const idx = [];
  for (let j = 0; j <= NZ; j++) { const t = j / NZ; const along = f.shore - 14 + Math.pow(t, 2.2) * D; for (let i = 0; i <= NX; i++) { const s = (i / NX - 0.5); const across = Math.sign(s) * Math.pow(Math.abs(s) * 2, 1.6) * W / 2; pos.push(across, 0, along); } }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i; const b = a + NX + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const toShore = new THREE.Vector2(-Math.cos(f.seaAng), -Math.sin(f.seaAng));
  const U = {
    uTime: { value: 0 }, uDir: { value: toShore }, uAmp: { value: 1.5 }, tHeight: { value: ctx.hmap.tex }, uHalf: { value: ctx.hmap.half }, uLevel: { value: f.level },
    uDeep: { value: new THREE.Color(0x060a12) }, uShallow: { value: new THREE.Color(0x2a4a52) }, uFoam: { value: new THREE.Color(0xe8eef4) },
    uSkyLo: { value: new THREE.Color() }, uSkyHi: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(-0.5, 0.3, -0.8) }, uSunCol: { value: new THREE.Color(0xb0b8d0) }, uFade: { value: 0 }, uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, uniforms: U, transparent: true, depthWrite: true });
  const m = new THREE.Mesh(geo, mat); m.position.y = f.level; m.rotation.y = -f.seaAng + Math.PI / 2; m.frustumCulled = false; m.renderOrder = 1;
  land.group.add(m); land.waters.push(m); land.owned.push(geo, mat);
}
/* a wrecked hull on the beach: keel, ribs, a few planks, a broken mast */
function buildWreck(ctx, L, w) {
  const r = ctx.r; const parts = []; uvS = 1; { const k = w.scale ?? 1; solidAlong(ctx, w.pos[0], w.pos[1], w.rot, [[-6 * k], [-3 * k], [0], [3 * k], [6 * k]], 2.6 * k, 'wreck'); }
  const Lh = 16; const keel = []; for (let i = 0; i <= 12; i++) { const t = i / 12; keel.push(new THREE.Vector3(-Lh / 2 + t * Lh, Math.pow(Math.abs(t - 0.5) * 2, 3) * 2.2, 0)); }
  parts.push(taperTube(keel, 0.28, 0.2, 6, 24));
  for (let i = 1; i < 12; i++) { const t = i / 12; const beam = 2.6 * Math.sin(t * Math.PI) + 0.6; const p = keel[i]; for (const s of [-1, 1]) { if (r() < 0.2 && i > 2) continue; const pts = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 0.55; pts.push(new THREE.Vector3(p.x, p.y + (1 - Math.cos(a)) * 4.2, s * Math.sin(a) * beam)); } if (r() < 0.35) pts.length = 3 + Math.floor(r() * 3); parts.push(taperTube(pts, 0.14, 0.09, 5, 8)); } }
  for (let k = 0; k < 5; k++) { const yy = 0.7 + k * 0.8; const pl = []; for (let i = 1; i <= 10; i++) { const t = i / 12; const beam = 2.6 * Math.sin(t * Math.PI) + 0.6; const a = Math.acos(1 - yy / 4.2); pl.push(new THREE.Vector3(-Lh / 2 + t * Lh, keel[i].y + yy, -Math.sin(a) * beam)); } if (r() < 0.2) continue; const len = 4 + Math.floor(r() * 6); parts.push(taperTube(pl.slice(0, len), 0.16, 0.16, 4, 12)); }
  parts.push(taperTube([new THREE.Vector3(1, 0.5, 0), new THREE.Vector3(1.4, 5.5, 0.3)], 0.25, 0.18, 7, 4));
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; if (q.attributes.uv) q.deleteAttribute('uv'); return q; })); for (const p of parts) p.dispose();
  const mat = triMaterial('bark_brown_02', { tint: 0x5a5048, tile: 1.4, cover: 0x2a3a2a, coverAmt: 0.3, desat: 0.4, rough: 0.7 });
  const [x, z] = w.pos; const m = new THREE.Mesh(g, mat); m.scale.setScalar(w.scale ?? 1); m.position.set(x, ctx.H(x, z) - (w.sink ?? 0.8), z); m.rotation.set(0.08, w.rot, 0.38); m.castShadow = true; m.receiveShadow = true; L.add(m);
}
/* beach dressing: kelp lines along the tide marks, coils of rope, broken barrels and loose staves */
function buildBeach(ctx, L, f) {
  const r = ctx.r; const land = L.current;
  const kelp = []; const pos = []; const idx = []; let base = 0;
  for (let line = 0; line < 4; line++) {
    const d0 = f.shore + 2 + line * 1.8 + r() * 1.2; const a0 = f.seaAng - 1.0 + r() * 0.3; const a1 = f.seaAng + 1.0 - r() * 0.3; const n = 90;
    for (let i = 0; i <= n; i++) { const t = i / n; const a = lerp(a0, a1, t); const d = d0 + Math.sin(t * 17 + line) * 0.8 + (fbm(t * 9, line) - 0.5) * 3; const [x, z] = polar(a, d);
      const w = (0.15 + 0.5 * Math.pow(fbm(t * 14 + line * 3, 1.3), 2) * 2) * (fbm(t * 30, line) > 0.38 ? 1 : 0.02); const nx = Math.cos(a) * w; const nz = Math.sin(a) * w;
      const y1 = ctx.H(x - nx, z - nz) + 0.02; const y2 = ctx.H(x + nx, z + nz) + 0.02; pos.push(x - nx, y1, z - nz, x + nx, y2, z + nz);
      if (i) { const k = base + (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    base += (n + 1) * 2;
  }
  const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); kg.setIndex(idx); kg.computeVertexNormals();
  const km = new THREE.Mesh(kg, new THREE.MeshStandardMaterial({ color: 0x1a1c10, roughness: 0.25, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 })); km.receiveShadow = true; land.group.add(km); land.owned.push(kg, km.material);
  /* barrels: open stave shells with a broken top, some on their side; loose staves around */
  const bar = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14, 4, true); { const p = bar.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const a = Math.atan2(p.getZ(i), p.getX(i)); const bulge = 1 + 0.12 * Math.cos((y / 0.45) * Math.PI / 2); p.setX(i, p.getX(i) * bulge); p.setZ(i, p.getZ(i) * bulge); if (y > 0.2) p.setY(i, Math.min(y, 0.15 + 0.35 * Math.abs(Math.sin(a * 3.3)) * vnoise(a * 4, 1))); } bar.computeVertexNormals(); }
  const hoop = new THREE.TorusGeometry(0.32, 0.015, 4, 18); hoop.rotateX(Math.PI / 2); hoop.translate(0, -0.3, 0);
  const barrel = mergeGeometries([bar.toNonIndexed(), hoop.toNonIndexed()]); bar.dispose(); hoop.dispose(); barrel.deleteAttribute('uv');
  const stave = new THREE.BoxGeometry(0.1, 0.03, 0.9); stave.deleteAttribute('uv');
  const coil = []; for (let i = 0; i <= 80; i++) { const t = i / 80; const a = t * TAU * 4; const rr = 0.18 + t * 0.32; coil.push(new THREE.Vector3(Math.cos(a) * rr, 0.04 + Math.sin(t * 40) * 0.01, Math.sin(a) * rr)); }
  uvS = 1; const rope = taperTube(coil, 0.03, 0.03, 5, 160); rope.deleteAttribute('uv');
  const wood = triMaterial('bark_brown_02', { tint: 0x4a4038, tile: 0.8, desat: 0.4, rough: 0.6, side: THREE.DoubleSide });
  const ropeM = new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.9 });
  const bl = []; const sl = []; const rl = [];
  const spot = () => { for (let k = 0; k < 20; k++) { const a = f.seaAng + (r() - 0.5) * 1.8; const d = f.shore - 4 + r() * 12; const [x, z] = polar(a, d); if (Math.hypot(x, z) > ARENA_R + 1.5 && angOff(a) > 0.25) return [x, z]; } return polar(f.seaAng + 1, f.shore); };
  for (let i = 0; i < 9; i++) { const [x, z] = i < 4 ? [f.wreck.pos[0] + (r() - 0.5) * 12, f.wreck.pos[1] + (r() - 0.5) * 12] : spot(); if (Math.hypot(x, z) < ARENA_R + 1.5) continue; const side = r() < 0.6; bl.push({ x, y: ctx.H(x, z) + (side ? 0.2 : 0.3), z, ry: r() * TAU, tx: side ? Math.PI / 2 : (r() - 0.5) * 0.3, tz: (r() - 0.5) * 0.4, s: 1, sy: 1 }); }
  for (let i = 0; i < 26; i++) { const [x, z] = spot(); sl.push({ x, y: ctx.H(x, z) + 0.02, z, ry: r() * TAU, tx: (r() - 0.5) * 0.2, tz: (r() - 0.5) * 0.2, s: 0.7 + r() * 0.6, sy: 1 }); }
  for (let i = 0; i < 4; i++) { const [x, z] = spot(); rl.push({ x, y: ctx.H(x, z), z, ry: r() * TAU, s: 0.8 + r() * 0.5, sy: 1 }); }
  L.instanced(barrel, wood, bl); L.instanced(stave, wood, sl, { shadow: false }); L.instanced(rope, ropeM, rl, { shadow: false });
}
/* a lighthouse on the headland: tapered tower, gallery, lamp, a slow sweeping beam */
function buildLighthouse(ctx, L, head) {
  const r = ctx.r; const land = L.current; const [hx, hz] = polar(head.ang, head.d - 10); const y = ctx.H(hx, hz); solid(ctx, hx, hz, 3.6, 'lighthouse');
  const tw = new THREE.CylinderGeometry(2.2, 3.4, 22, 16, 6); tw.translate(0, 11, 0);
  const gal = new THREE.CylinderGeometry(3.2, 3.2, 0.5, 16); gal.translate(0, 22.3, 0);
  const lamp = new THREE.CylinderGeometry(1.7, 1.7, 2.6, 10); lamp.translate(0, 23.8, 0);
  const cap = new THREE.ConeGeometry(2.1, 2, 10); cap.translate(0, 26.1, 0);
  const g = mergeGeometries([tw, gal, cap].map((p) => { const q = p.toNonIndexed(); q.deleteAttribute('uv'); return q; })); for (const p of [tw, gal, cap]) p.dispose();
  const m = new THREE.Mesh(g, triMaterial('castle_wall_slates', { tint: 0x8a8a90, tile: 2 })); m.position.set(hx, y - 1, hz); L.add(m);
  const lm = new THREE.Mesh(lamp, new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(0xffe0a0), emissiveIntensity: 3 })); lm.position.set(hx, y - 1, hz); L.add(lm);
  addGlows(L, [[hx, y + 22.8, hz, 14], [hx, y + 22.8, hz, 40]], 0xffd890, { alpha: 0.6 });
  /* the beam: two soft ribbons (a core and a wide haze) sweeping slowly round the lamp */
  const lamp0 = [hx, y + 22.8, hz];
  const beams = [addRays(L, [{ foot: lamp0, dir: [1, -0.04, 0], len: 160, w0: 1.4, w1: 22, k: 1 }], 0xffe6b0, { alpha: 0.16, ends: [0.0, 0.25] }),
    addRays(L, [{ foot: lamp0, dir: [1, -0.04, 0], len: 120, w0: 3, w1: 40, k: 1 }], 0xc8d0d8, { alpha: 0.06, ends: [0.0, 0.2] })];
  land.tickers.push((t) => { const a = t * 0.45; for (const bm of beams) { const at = bm.geometry.attributes.aDir; at.setXYZ(0, Math.cos(a), -0.04, Math.sin(a)); at.needsUpdate = true; bm.visible = land.t > 2; } });
}
/* lightning: a bolt in the sky and a flash of the whole scene every 6 to 10 seconds */
function buildLightning(ctx, L) {
  const land = L.current; const w = L.world; const r = rng(ctx.seed + 99);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8e0ff).multiplyScalar(6), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const bolts = [0, 1, 2].map(() => { const m = new THREE.Mesh(boltGeo(r), mat); m.visible = false; m.frustumCulled = false; land.group.add(m); land.owned.push(m.geometry); return m; });
  land.owned.push(mat);
  let next = 4 + r() * 3; let show = 0; let cur = null;
  land.tickers.push((t, dt, cx, cz) => {
    next -= dt;
    if (next <= 0) {
      next = 6 + r() * 4; show = 0.32; cur = bolts[Math.floor(r() * 3)];
      const a = ctx.f.seaAng + (r() - 0.5) * 2.2; cur.position.set(cx + Math.cos(a) * (260 + r() * 140), 0, cz + Math.sin(a) * (260 + r() * 140)); cur.rotation.y = r() * TAU;
      w.flash?.(0.7);
    }
    if (show > 0) { show -= dt; const k = show > 0.22 || (show > 0.08 && show < 0.14) ? 1 : 0.25; mat.opacity = k; for (const b of bolts) b.visible = b === cur && show > 0; } else for (const b of bolts) b.visible = false;
  });
}

/* ======================================================================================================
   set dressing: huts, boats, nets, tide pools, timbers, fissures, drifts, stumps, barrows,
   litter, vines that hang in real curves
   ====================================================================================================== */
const geoBox = (w, h, d, px, py, pz, rx = 0, ry = 0, rz = 0) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateX(rx); b.rotateZ(rz); b.rotateY(ry); b.translate(px, py, pz); return b; };
const mergeClean = (parts) => { const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; if (q.attributes.uv) q.deleteAttribute('uv'); for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; })); for (const p of parts) p.dispose(); return g; };
/* a plank hut: vertical boards with gaps, a door in the front gable, a lit window in the side, a pitched roof with an
   overhang and fascia boards, optional stilts with cross braces, a deck and a ladder, optional stone footing.
   Local front = +z. Returns the world position of the lamp. */
function buildHut(ctx, L, x, z, rot, { y = null, stilts = 0, W = 3.4, D = 2.8, H = 2.1, roofH = 1.4, wood = 0x4a4234, roofTex = 'forest_leaves_04', roofTint = 0x7a7258, stone = 0, lit = true, sag = 0.06, lamp = 0xffb060 } = {}) {
  const r = ctx.r; const y0 = y ?? ctx.H(x, z); const fy = stilts; const wp = []; const rp = []; const sp = []; solid(ctx, x, z, Math.max(W, D) * 0.6, 'hut');
  if (stilts > 0) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) { const Lp = fy + 1.4; const p = new THREE.CylinderGeometry(0.1, 0.13, Lp, 6); p.rotateZ((r() - 0.5) * 0.1); p.rotateX((r() - 0.5) * 0.08); p.translate(sx * (W / 2 - 0.05), Lp / 2 - 1.2, sz * (D / 2 - 0.05)); wp.push(p); }
    for (const sz of [-1, 1]) for (const d of [-1, 1]) { const Lb = Math.hypot(W, fy * 0.85); const b = new THREE.CylinderGeometry(0.045, 0.045, Lb, 5); b.rotateZ(Math.PI / 2 - d * Math.atan2(fy * 0.85, W)); b.translate(0, fy * 0.47, sz * (D / 2 + 0.06)); wp.push(b); }
    for (const sx of [-1, 1]) { const Lb = Math.hypot(D, fy * 0.85); const b = new THREE.CylinderGeometry(0.045, 0.045, Lb, 5); b.rotateX(Math.PI / 2 - sx * Math.atan2(fy * 0.85, D)); b.translate(sx * (W / 2 + 0.06), fy * 0.47, 0); wp.push(b); }
    /* deck: planks across, a porch in front with two boards missing; a ladder down */
    for (let zz = -D / 2 - 0.1; zz < D / 2 + 1.3; zz += 0.21) { if (zz > D / 2 + 0.3 && r() < 0.18) continue; wp.push(geoBox(W + 0.3 + (r() - 0.5) * 0.2, 0.06, 0.19, (r() - 0.5) * 0.1, fy + (r() - 0.5) * 0.03, zz, 0, (r() - 0.5) * 0.04)); }
    for (const s of [-1, 1]) wp.push(geoBox(0.12, 0.12, D + 1.6, s * (W / 2 + 0.1), fy - 0.1, 0.55));
    const lx = W / 2 - 0.5; const lz = D / 2 + 1.35; const ll = Math.hypot(fy + 0.6, 0.7); const la = Math.atan2(0.7, fy + 0.6);
    for (const s of [-1, 1]) wp.push(geoBox(0.07, ll, 0.07, lx + s * 0.22, fy / 2 - 0.3, lz + 0.35, la));
    for (let k = 1; k < 6; k++) { const t = k / 6; wp.push(geoBox(0.5, 0.05, 0.06, lx, fy - 0.6 + (1 - t) * 0.0 - (fy + 0.6) * t + 0.6, lz + 0.7 * t)); }
    /* a rail post with the lamp at the porch corner */
    wp.push(geoBox(0.1, 1.5, 0.1, -W / 2 + 0.05, fy + 0.75, D / 2 + 1.2));
  }
  /* walls: boards with gaps, the door in the front, a window on the +x side */
  const bw = 0.23; const doorX = (r() - 0.5) * 0.6;
  for (const fz of [-1, 1]) for (let xx = -W / 2 + bw / 2; xx < W / 2; xx += bw + 0.015) {
    const gable = H + roofH * Math.max(0, 1 - Math.abs(xx) / (W / 2)) - 0.08; const top = Math.min(gable, H + roofH) + (r() - 0.5) * 0.06;
    if (fz > 0 && Math.abs(xx - doorX) < 0.45) { const y1 = 1.75; wp.push(geoBox(bw, top - y1, 0.06, xx, fy + y1 + (top - y1) / 2, fz * D / 2)); continue; }
    if (r() < 0.06) { const t2 = top * (0.45 + r() * 0.3); wp.push(geoBox(bw, t2, 0.06, xx, fy + t2 / 2, fz * D / 2, 0, 0, (r() - 0.5) * 0.06)); continue; }
    wp.push(geoBox(bw, top, 0.06, xx, fy + top / 2, fz * D / 2, (r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.02));
  }
  for (const fx of [-1, 1]) for (let zz = -D / 2 + bw / 2; zz < D / 2; zz += bw + 0.015) {
    const top = H + (r() - 0.5) * 0.05;
    if (fx > 0 && Math.abs(zz) < 0.42) { wp.push(geoBox(0.06, 0.95, bw, fx * W / 2, fy + 0.475, zz)); wp.push(geoBox(0.06, top - 1.55, bw, fx * W / 2, fy + 1.55 + (top - 1.55) / 2, zz)); continue; }
    wp.push(geoBox(0.06, top, bw, fx * W / 2, fy + top / 2, zz, 0, 0, (r() - 0.5) * 0.02));
  }
  /* frame: corner posts, sill beams, a door frame and a window frame (they catch the light and draw the shape) */
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) wp.push(geoBox(0.14, H + 0.1, 0.14, sx * W / 2, fy + H / 2, sz * D / 2));
  for (const sz of [-1, 1]) wp.push(geoBox(W + 0.3, 0.14, 0.14, 0, fy + H, sz * D / 2));
  wp.push(geoBox(0.1, 1.8, 0.12, doorX - 0.47, fy + 0.9, D / 2 + 0.03), geoBox(0.1, 1.8, 0.12, doorX + 0.47, fy + 0.9, D / 2 + 0.03), geoBox(1.1, 0.12, 0.14, doorX, fy + 1.8, D / 2 + 0.04));
  wp.push(geoBox(0.1, 0.1, 1.0, W / 2 + 0.04, fy + 0.95, 0), geoBox(0.1, 0.1, 1.0, W / 2 + 0.04, fy + 1.56, 0), geoBox(0.08, 0.7, 0.08, W / 2 + 0.05, fy + 1.25, 0));
  /* roof: two slabs from a ridge along z, 0.5 m overhang, fascia boards on the eaves and barge boards on the gables */
  const ov = 0.55; const a = Math.atan2(roofH, W / 2); const half = W / 2 + ov; const sl = half / Math.cos(a);
  for (const s of [-1, 1]) {
    const k = s > 0 ? 1 : 0.94 + r() * 0.06;
    const slab = new THREE.BoxGeometry(sl, 0.16, D + ov * 2, 6, 1, 6); const p = slab.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = (p.getX(i) / sl + 0.5); const v = p.getZ(i) / (D / 2 + ov); p.setY(i, p.getY(i) - Math.sin(u * Math.PI) * sag * (1 - v * v) + (vnoise(p.getX(i) * 3, p.getZ(i) * 3) - 0.5) * 0.06); }
    slab.rotateZ(-s * a); slab.translate(s * (sl / 2) * Math.cos(a), fy + H + roofH - (sl / 2) * Math.sin(a) + 0.06, 0); slab.scale(1, k, 1); rp.push(slab);
    wp.push(geoBox(0.06, 0.26, D + ov * 2 + 0.1, s * (half + 0.02), fy + H + roofH - half * Math.tan(a) - 0.04, 0));
    for (const fz of [-1, 1]) { const bb = new THREE.BoxGeometry(sl + 0.1, 0.2, 0.06); bb.rotateZ(-s * a); bb.translate(s * (sl / 2) * Math.cos(a), fy + H + roofH - (sl / 2) * Math.sin(a) + 0.12, fz * (D / 2 + ov)); wp.push(bb); }
  }
  wp.push(geoBox(0.16, 0.16, D + ov * 2 + 0.2, 0, fy + H + roofH + 0.12, 0));
  /* stone footing (a boathouse on the beach): rough blocks up to the given height */
  if (stone > 0) { for (const fz of [-1, 1]) for (let xx = -W / 2; xx < W / 2; xx += 0.62) { if (fz > 0 && Math.abs(xx + 0.3 - doorX) < 0.6) continue; const b = chunkGeo(r, { w: 0.6, h: stone * (0.8 + r() * 0.3), d: 0.35, chip: 0.25 }); b.translate(xx + 0.3, fy - 0.05, fz * (D / 2 + 0.05)); sp.push(b); }
    for (const fx of [-1, 1]) for (let zz = -D / 2; zz < D / 2; zz += 0.62) { if (fx > 0 && Math.abs(zz + 0.3) < 0.5) continue; const b = chunkGeo(r, { w: 0.35, h: stone * (0.8 + r() * 0.3), d: 0.6, chip: 0.25 }); b.translate(fx * (W / 2 + 0.05), fy - 0.05, zz + 0.3); sp.push(b); } }
  const woodM = triMaterial('bark_brown_02', { tint: wood, tile: 0.9, desat: 0.45, nstr: 1.4, specMax: 0.05 });
  const roofM = triMaterial(roofTex, { tint: roofTint, tile: 1.6, desat: 0.4, nstr: 1.6, cover: 0x2e3a26, coverAmt: 0.35, specMax: 0.05 });
  const place = (g, mat) => { const m = new THREE.Mesh(g, mat); m.position.set(x, y0, z); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; L.add(m); return m; };
  place(mergeClean(wp), woodM); place(mergeClean(rp), roofM);
  if (sp.length) place(mergeClean(sp), triMaterial('seaside_rock', { tint: 0x8a8a88, tile: 1.4, cover: 0x3a4a30, coverAmt: 0.4 }));
  /* the dark inside, and the warm window and door crack */
  const inside = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, H - 0.05, D - 0.12), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1, side: THREE.BackSide }));
  inside.position.set(0, fy + H / 2, 0); const holder = new THREE.Group(); holder.position.set(x, y0, z); holder.rotation.y = rot; holder.add(inside);
  const c = new THREE.Vector3(); const out = {};
  if (lit) {
    const wm = new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp).multiplyScalar(1.6), toneMapped: true });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.56), wm); win.position.set(W / 2 - 0.02, fy + 1.25, 0); win.rotation.y = Math.PI / 2; holder.add(win);
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1.6), wm); crack.position.set(doorX + 0.3, fy + 0.85, D / 2 - 0.02); holder.add(crack);
    holder.updateMatrixWorld(true);
    c.set(W / 2 + 0.3, fy + 1.25, 0).applyMatrix4(holder.matrixWorld); addGlows(L, [[c.x, c.y, c.z, 1.1], [c.x, c.y, c.z, 3.2]], lamp, { alpha: 0.9 });
    const lp = new THREE.Vector3(-W / 2 + 0.05, fy + 1.55, D / 2 + 1.2).applyMatrix4(holder.matrixWorld); if (!stilts) lp.set(0, 0, 0).set(...new THREE.Vector3(doorX - 0.7, fy + 2.0, D / 2 + 0.2).applyMatrix4(holder.matrixWorld).toArray());
    addGlows(L, [[lp.x, lp.y, lp.z, 0.3], [lp.x, lp.y, lp.z, 0.8]], lamp, { alpha: 2.4 }); addGlows(L, [[lp.x, lp.y, lp.z, 6], [lp.x, y0 + 0.2, lp.z, 7]], lamp, { alpha: 0.3 });
    out.lamp = [lp.x, lp.y, lp.z]; L.current.owned.push(wm, win.geometry, crack.geometry);
  }
  L.current.group.add(holder); L.current.owned.push(inside.geometry, inside.material);
  return out;
}
/* an upturned boat on two trestles, keel up */
function buildBoat(ctx, L, x, z, rot, { Lb = 5.2, tint = 0x4a4034 } = {}) {
  solidAlong(ctx, x, z, rot, [[-Lb * 0.3], [Lb * 0.3]], 1.0, 'boat');
  const r = ctx.r; const parts = [];
  const hull = new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI / 2); const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) { const xx = p.getX(i); const zz = p.getZ(i); const yy = p.getY(i); const bow = xx > 0 ? 1 - Math.pow(xx, 3) * 0.55 : 1 - Math.pow(-xx, 2) * 0.25; p.setXYZ(i, xx * Lb / 2, yy * 0.75, zz * 0.95 * bow); }
  hull.computeVertexNormals(); parts.push(hull);
  uvS = 1; const keel = []; for (let i = 0; i <= 8; i++) { const t = i / 8 * 2 - 1; keel.push(new THREE.Vector3(t * Lb / 2 * 0.98, 0.76 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.02, 0)); } parts.push(taperTube(keel, 0.06, 0.06, 5, 16));
  for (const s of [-1, 1]) { parts.push(geoBox(0.12, 0.7, 1.9, s * Lb * 0.22, -0.35, 0)); }
  const g = mergeClean(parts); const m = new THREE.Mesh(g, triMaterial('bark_brown_02', { tint, tile: 0.8, desat: 0.5, nstr: 1.3, specMax: 0.05, side: THREE.DoubleSide }));
  m.position.set(x, ctx.H(x, z) + 0.68, z); m.rotation.set((r() - 0.5) * 0.06, rot, (r() - 0.5) * 0.08); m.castShadow = true; m.receiveShadow = true; L.add(m);
}
/* nets drying on poles: a sagging see-through mesh between leaning poles */
const netTex = () => canvasTex('net', 128, 128, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { const t = (i / 8) * w; g.beginPath(); g.moveTo(t, 0); g.lineTo(t, h); g.stroke(); g.beginPath(); g.moveTo(0, t); g.lineTo(w, t); g.stroke(); } });
function buildNets(ctx, L, x, z, rot, { n = 3, span = 3.2 } = {}) {
  const r = ctx.r; const poles = []; const nets = []; const c = Math.cos(rot); const s = Math.sin(rot);
  const tops = [];
  for (let i = 0; i < n; i++) { const lx = (i - (n - 1) / 2) * span + (r() - 0.5) * 0.5; const lz = (r() - 0.5) * 0.6; const H = 2.3 + r() * 0.6; const tx = (r() - 0.5) * 0.18; const p = new THREE.CylinderGeometry(0.05, 0.07, H + 0.6, 6); p.translate(0, (H + 0.6) / 2 - 0.6, 0); p.rotateZ(tx); p.translate(lx, 0, lz); poles.push(p); tops.push([lx - Math.sin(tx) * H, H * Math.cos(tx), lz]); }
  for (let i = 0; i < n - 1; i++) { const [ax, ay, az] = tops[i]; const [bx, by, bz] = tops[i + 1]; const g = new THREE.PlaneGeometry(1, 1, 10, 6); const p = g.attributes.position; const uv = g.attributes.uv;
    for (let k = 0; k < p.count; k++) { const u = p.getX(k) + 0.5; const v = 0.5 - p.getY(k); const top = [lerp(ax, bx, u), lerp(ay, by, u) - Math.sin(u * Math.PI) * 0.35, lerp(az, bz, u)]; const drop = v * (1.6 + Math.sin(u * Math.PI) * 0.5); p.setXYZ(k, top[0], top[1] - drop, top[2] + Math.sin(u * 7 + v * 3) * 0.12 * v); uv.setXY(k, u * 3, v * 2); }
    g.computeVertexNormals(); nets.push(g); }
  const pg = mergeClean(poles); const ng = mergeGeometries(nets); for (const q of nets) q.dispose();
  const y = ctx.H(x, z);
  const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x2e261e, roughness: 1, envMapIntensity: 0.1 })); pm.position.set(x, y, z); pm.rotation.y = rot; pm.castShadow = true; L.add(pm);
  const nt = netTex(); nt.wrapT = THREE.RepeatWrapping;
  const nm = new THREE.MeshStandardMaterial({ color: 0x4a4a3e, roughness: 0.9, alphaMap: nt, alphaTest: 0.4, side: THREE.DoubleSide, envMapIntensity: 0.1 });
  const mm = new THREE.Mesh(ng, nm); mm.position.set(x, y, z); mm.rotation.y = rot; mm.castShadow = true; L.add(mm);
}
/* tide pools: hollows in the sand hold still water that mirrors the storm sky (the water shader cuts each pool to its hollow) */
function buildPools(ctx, L, pools, level) {
  const parts = pools.map((p) => { const g = new THREE.CircleGeometry(p.R * 1.45, 24); g.rotateX(-Math.PI / 2); g.translate(p.x, 0, p.z); return g; });
  const geo = mergeGeometries(parts); for (const q of parts) q.dispose();
  const m = addStillWater(ctx, L, { level, tint: 0x2a3a40, deep: 0x0c1418, rip: 0.18, R: 1 }); m.userData.skyK = 1.5;
  m.geometry.dispose(); m.geometry = geo; L.current.owned.push(geo);
  m.material.uniforms.uSunDir.value.set(-0.6, 0.3, -1).normalize();
  return m;
}
/* loose timbers from the wreck: beams and planks half sunk in the sand at all angles */
function buildTimbers(ctx, L, spots, { n = 30, tint = 0x5a5048 } = {}) {
  const r = ctx.r; const beam = new THREE.BoxGeometry(1, 1, 1, 1, 1, 4); { const p = beam.attributes.position; for (let i = 0; i < p.count; i++) { const zz = p.getZ(i); p.setX(i, p.getX(i) * (1 + (vnoise(zz * 9, 3) - 0.5) * 0.4)); p.setY(i, p.getY(i) + Math.pow(Math.abs(zz) * 2, 3) * (zz > 0 ? -0.15 : 0.1)); } beam.computeVertexNormals(); beam.deleteAttribute('uv'); }
  const list = [];
  for (let i = 0; i < n; i++) { const [x, z] = spots(); const big = r() < 0.35; const len = big ? 2.5 + r() * 3.5 : 0.8 + r() * 1.8; const w = big ? 0.22 + r() * 0.12 : 0.1 + r() * 0.08;
    list.push({ x, y: ctx.H(x, z) - w * 0.25, z, ry: r() * TAU, tx: (r() - 0.5) * (big ? 0.25 : 0.12), tz: (r() < 0.25 ? 0.25 + r() * 0.35 : (r() - 0.5) * 0.1), s: 1, sy: 1, sx: w, sz: len }); }
  /* the batch keeps one uniform scale, so bake the size into four shape kinds */
  const kinds = [[0.3, 4.5], [0.24, 2.6], [0.14, 1.6], [0.1, 0.9]].map(([w, l]) => { const g = beam.clone(); g.scale(w * 1.3, w, l); return g; }); beam.dispose();
  const mat = triMaterial('bark_brown_02', { tint, tile: 0.9, desat: 0.45, cover: 0x2a3a2a, coverAmt: 0.35, specMax: 0.08 });
  const by = [[], [], [], []]; for (const it of list) { const k = it.sz > 3 ? 0 : it.sz > 2 ? 1 : it.sz > 1.2 ? 2 : 3; by[k].push({ ...it, s: 0.8 + r() * 0.45 }); }
  by.forEach((l, k) => L.instanced(kinds[k], mat, l, { shadow: true }));
}
/* rain runoff over the cliff edge: thin falls that pour down the face, with spray at the foot. Each is a ribbon laid on
   the cliff along a radial line (top found by walking out until the ground is high), scrolling streaks in the shader. */
const FALL_VERT = `attribute float aT; attribute float aU; varying float vT; varying float vU; varying vec3 vW; void main(){ vT = aT; vU = aU; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FALL_FRAG = `uniform float uTime; uniform vec3 uCol; uniform float uA; varying float vT; varying float vU; varying vec3 vW; ${NOISE}
void main(){ float edge = smoothstep(0.0, 0.35, vU) * smoothstep(1.0, 0.65, vU);
  float st = sqN2(vec2(vU * 9.0 + vW.x * 0.05, vT * 14.0 - uTime * 3.2)) * 0.6 + sqN2(vec2(vU * 23.0, vT * 40.0 - uTime * 6.0)) * 0.4;
  float a = smoothstep(0.4, 0.85, st) * edge * smoothstep(0.0, 0.15, vT) * (0.35 + 0.65 * vT);
  gl_FragColor = vec4(uCol * a * uA, 1.0); }`;
function buildFalls(ctx, L, angs, { color = 0xb8c4d0, alpha = 0.32 } = {}) {
  const r = ctx.r; const pos = []; const at = []; const au = []; const idx = []; const foot = []; let base = 0;
  for (const a of angs) {
    const ca = Math.cos(a); const sa = Math.sin(a); const pts = [];
    let d0 = 40; while (d0 < 120 && ctx.H(ca * d0, sa * d0) < 1.5) d0 += 0.5;
    let d1 = d0 + 2; while (d1 < 170 && !(ctx.H(ca * d1, sa * d1) > 14 && ctx.H(ca * (d1 + 3), sa * (d1 + 3)) - ctx.H(ca * d1, sa * d1) < 1.2)) d1 += 0.5;
    if (d1 >= 170 || d0 >= 120) continue;
    const n = 26; const w = 0.35 + r() * 0.6;
    for (let i = 0; i <= n; i++) { const t = i / n; const d = lerp(d1, d0 - 0.5, t); const y = ctx.H(ca * d, sa * d) + 0.35; pts.push([ca * (d - 0.4), y, sa * (d - 0.4), t]); }
    for (const [x, y, z, t] of pts) { const ww = w * (0.7 + t * 0.6 + Math.sin(t * 9 + w * 7) * 0.15); pos.push(x + sa * ww, y, z - ca * ww, x - sa * ww, y, z + ca * ww); at.push(t, t); au.push(0, 1); }
    for (let i = 0; i < n; i++) { const k = base + i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    base += (n + 1) * 2; const last = pts[pts.length - 1]; foot.push([last[0], last[1] + 0.6, last[2], 4 + w * 2]);
  }
  if (!base) return;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1)); g.setAttribute('aU', new THREE.Float32BufferAttribute(au, 1)); g.setIndex(idx);
  const U = { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uA: { value: alpha } };
  const mat = new THREE.ShaderMaterial({ vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; L.current.group.add(m); L.current.owned.push(g, mat);
  L.current.tickers.push((t) => { U.uTime.value = t; });
  addGlows(L, foot, 0x8a96a8, { alpha: 0.18 });
}
/* a mausoleum set into the barrow: three worn steps, a walled cell with pilasters and a heavy lintel, a gabled roof with
   a cornice and a broken finial, a half-open iron gate, the black doorway. Local front = +z. */
function buildMausoleum(ctx, L, x, z, face, { tint = 0x8a8a84, cover = 0x4a5236 } = {}) {
  const r = ctx.r; const st = []; const iron = []; solid(ctx, x, z, 3.6, 'mausoleum');
  const blk = (w, h, d, px, py, pz, chip = 0.08) => { const g = chunkGeo(r, { w, h, d, chip, seg: 3 }); g.translate(px, py, pz); st.push(g); };
  for (let i = 0; i < 3; i++) blk(6.6 - i * 0.8, 0.36, 6.2 - i * 0.8 + (i === 0 ? 0.6 : 0), 0, i * 0.34, 0.3 - i * 0.15, 0.12);
  const by = 1.0; const W = 4.2; const D = 4.0; const H = 3.4;
  blk(W, H, 0.5, 0, by, -D / 2 + 0.25); blk(0.5, H, D, -W / 2 + 0.25, by, 0); blk(0.5, H, D, W / 2 - 0.25, by, 0);
  blk(1.35, H, 0.6, -W / 2 + 0.68, by, D / 2 - 0.3); blk(1.35, H, 0.6, W / 2 - 0.68, by, D / 2 - 0.3);
  blk(1.9, 0.75, 0.75, 0, by + H - 0.75, D / 2 - 0.25, 0.05);
  for (const s of [-1, 1]) { const c = new THREE.CylinderGeometry(0.2, 0.23, H - 0.3, 10, 3); c.translate(s * 1.15, by + (H - 0.3) / 2, D / 2 + 0.12); st.push(c); blk(0.6, 0.25, 0.6, s * 1.15, by + H - 0.32, D / 2 + 0.12, 0.05); blk(0.6, 0.3, 0.6, s * 1.15, by - 0.02, D / 2 + 0.12, 0.05); }
  blk(W + 0.7, 0.32, D + 0.7, 0, by + H, 0, 0.05);
  const tri = new THREE.Shape(); tri.moveTo(-W / 2 - 0.3, 0); tri.lineTo(W / 2 + 0.3, 0); tri.lineTo(0, 1.5); tri.lineTo(-W / 2 - 0.3, 0);
  const gab = new THREE.ExtrudeGeometry(tri, { depth: D + 0.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 }); gab.translate(0, by + H + 0.32, -(D + 0.5) / 2); st.push(gab);
  { const a = Math.atan2(1.5, W / 2 + 0.3); const sl = Math.hypot(1.5, W / 2 + 0.3) + 0.3; for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(sl, 0.14, D + 0.9); g.rotateZ(-s * a); g.translate(s * (W / 2 + 0.3) / 2, by + H + 0.32 + 0.75 + 0.1, 0); st.push(g); } }
  blk(0.4, 0.9, 0.3, 0, by + H + 1.8, D / 2 + 0.05, 0.25);
  const sg = mergeClean(st);
  const sm = triMaterial('castle_wall_slates', { tint, tile: 1.4, cover, coverAmt: 0.55, nstr: 1.6, specMax: 0.1 });
  const y = ctx.H(x, z) - 0.25; const rot = Math.atan2(Math.cos(face), Math.sin(face));
  const m = new THREE.Mesh(sg, sm); m.position.set(x, y, z); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; L.add(m);
  /* the doorway: black, and a half-open gate of iron bars on its hinge */
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.6), new THREE.MeshBasicMaterial({ color: 0x010102 })); hole.position.set(0, by + 1.3, D / 2 - 0.62);
  for (let i = 0; i < 7; i++) { const b = new THREE.CylinderGeometry(0.025, 0.025, 2.5, 5); b.translate(0.08 + i * 0.2, 1.25, 0); iron.push(b); const sp = new THREE.ConeGeometry(0.05, 0.16, 4); sp.translate(0.08 + i * 0.2, 2.55, 0); iron.push(sp); }
  for (const yy of [0.25, 1.3, 2.3]) { const b = new THREE.BoxGeometry(1.4, 0.06, 0.05); b.translate(0.72, yy, 0); iron.push(b); }
  const ig = mergeClean(iron); const gate = new THREE.Mesh(ig, new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.55, metalness: 0.7, envMapIntensity: 0.4 }));
  gate.position.set(-0.75, by, D / 2 - 0.05); gate.rotation.y = 1.0 + r() * 0.3; gate.castShadow = true;
  const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = rot; holder.add(hole, gate); L.current.group.add(holder);
  L.current.owned.push(hole.geometry, hole.material, ig, gate.material);
  return { rot, y };
}
/* basalt pavement: tight clusters of hexagonal column tops that stand a hand's width above the ash, glowing seams */
function buildBasalt(ctx, L, { clusters = 9, d = [19, 70], per = [8, 22], tint = 0x3a3230, flat = false } = {}) {
  const r = ctx.r; const g = new THREE.CylinderGeometry(0.5, 0.56, 1, 6, 1); g.translate(0, 0.5, 0); { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.9) p.setY(i, p.getY(i) + (vnoise(p.getX(i) * 4, p.getZ(i) * 4) - 0.5) * 0.12); g.computeVertexNormals(); }
  const list = [];
  for (let c = 0; c < clusters; c++) {
    let cx = 0; let cz = 0; for (let k = 0; k < 20; k++) { const a = r() * TAU; const dd = d[0] + r() * (d[1] - d[0]); [cx, cz] = polar(a, dd); if (flat || angOff(a) > 0.25 || dd > 40) break; }
    const n = per[0] + Math.floor(r() * (per[1] - per[0])); const S = 0.9 + r() * 0.5; const rot = r() * TAU;
    for (let i = 0; i < n * 2 && i < 60; i++) { const q = Math.floor(r() * 7) - 3; const rr2 = Math.floor(r() * 7) - 3; const lx = (q + rr2 * 0.5) * S * 0.98; const lz = rr2 * S * 0.85; if (Math.hypot(lx, lz) > S * 3.2 * (0.7 + r() * 0.5)) continue;
      const x = cx + lx * Math.cos(rot) - lz * Math.sin(rot); const z = cz + lx * Math.sin(rot) + lz * Math.cos(rot); if (!flat && Math.hypot(x, z) < ARENA_R + 1) continue; if (list.some((it) => Math.hypot(it.x - x, it.z - z) < S * 0.6)) continue;
      const hh = flat ? 0.17 + r() * 0.04 : 0.12 + r() * 0.45 + (r() < 0.12 ? 0.6 : 0); list.push({ x, y: ctx.H(x, z) - 0.15, z, ry: rot + Math.floor(r() * 6) * (Math.PI / 3), tx: (r() - 0.5) * 0.12, tz: (r() - 0.5) * 0.12, s: S * (0.92 + r() * 0.1), sy: hh / S }); }
  }
  const mat = triMaterial('rock', { tint, tile: 1.2, nstr: 1.6, desat: 0.3, specMax: 0.15 }); withEmbersTri(mat);
  L.instanced(g, mat, list, { shadow: true });
}
/* glowing fissures: a groove in the ground (height + mask in the land) and a molten ribbon in its floor */
function buildFissures(ctx, L, lines, lavaMat) {
  const pos = []; const idx = []; let base = 0;
  for (const pts of lines) {
    const dense = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i]; const [bx, bz] = pts[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2)); for (let k = 0; k < n; k++) dense.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]); } dense.push(pts[pts.length - 1]);
    for (let i = 0; i < dense.length; i++) { const a = dense[Math.min(i + 1, dense.length - 1)]; const b = dense[Math.max(i - 1, 0)]; let dx = a[0] - b[0]; let dz = a[1] - b[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const t = i / (dense.length - 1); const w = (0.18 + 0.4 * Math.pow(vnoise(i * 0.15, base * 0.01), 2) * 2) * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.04; const [x, z] = dense[i]; const y = ctx.H(x, z) + 0.06;
      pos.push(x - dz * w, y, z + dx * w, x + dz * w, y, z - dx * w); if (i) { const k = base + (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    base += dense.length * 2;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, lavaMat); L.current.group.add(m); L.current.owned.push(g);
}
/* a charred stump: a short broken trunk with a splintered top and roots, unit height 1 */
function stumpGeo(r) {
  const parts = []; uvS = 1; const R = 0.22 + r() * 0.1;
  const pts = [new THREE.Vector3(0, -0.1, 0), new THREE.Vector3((r() - 0.5) * 0.06, 0.5, (r() - 0.5) * 0.06), new THREE.Vector3((r() - 0.5) * 0.1, 1, (r() - 0.5) * 0.1)];
  const t = taperTube(pts, R, R * 0.8, 9, 6, 0.9); const p = t.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.7) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, 0.7 + (y - 0.7) * (0.3 + 0.7 * Math.abs(Math.sin(a * 2.5 + R * 20)))); } }
  t.computeVertexNormals(); parts.push(t);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + r() * 0.8; const o = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); parts.push(taperTube([o.clone().multiplyScalar(R * 0.5).setY(0.18), o.clone().multiplyScalar(R * 1.8).setY(0.02), o.clone().multiplyScalar(R * 3).setY(-0.08)], R * 0.42, R * 0.08, 5, 5)); }
  const g = mergeGeometries(parts); for (const q of parts) q.dispose(); return g;
}

/* ======================================================================================================
   LANDKIT: the generator helpers a world module uses for its own lands (web/src/worlds/<id>.js `lands`).
   A world look has the same shape as an entry of LOOKS above (layout, height, sky, terrain, grass, props, build,
   particles ...). Its build(ctx, L) gets the same ctx (ctx.r = seeded rng, ctx.H = height, ctx.f = layout facts,
   ctx.solids = footprints) and L = the Lands instance (L.add, L.instanced, L.current). Push every solid thing with
   LANDKIT.solid(ctx, x, z, r, kind) so the walk chapter cannot pass through it.
   ====================================================================================================== */
export const LANDKIT = {
  /* constants: the arena (flat, free of solid props) and the open line toward the nemesis */
  ARENA_R, NEMESIS_ANG, NEM_DIST, TAU, FRONT,
  /* maths and noise */
  rng, hash2, vnoise, fbm, ridged, smooth, clamp, lerp, wrapA, angOff, sectorK, polar, segDist, lineDist, windingPath, bump, ranges,
  /* textures and materials (Poly Haven ids, see /assets/real/CREDITS.md) */
  tex, texSet, pbr, canvasTex, triMaterial, withCover, withEmbers, withEmbersTri, scanMaterial, windPatch, leafClusterMaterial, leafCardMaterial, leafMaterial, lavaMaterial, bannerMaterial,
  NOISE, WORLD_VARY_PARS, WORLD_VARY,
  /* geometry */
  taperTube, bend, hangCard, deadTreeGeo, trunkGeo, graveGeo, chunkGeo, ruinWallGeo, towerGeo, bladeGeo, tuftGeo, shrubGeo, crownGeo, clumpGeo, crownClusterGeo, fernGeo, coniferGeo, slabGeo, boltGeo, stumpGeo, geoBox, mergeClean,
  setUvScale: (k) => { uvS = k; },
  /* effects and set pieces */
  particles, addStillWater, addFogSheets, addGlows, addSmoke, addRays, addBlobs, buildShafts, buildLightning, buildFalls, buildFissures, buildBasalt,
  buildDeadArmy, buildWeapons, buildBanners, buildCart, buildRuin, buildTemple, buildVines, buildBones, buildIce, buildFootprints, buildFocal, buildSea, buildWreck, buildBeach, buildLighthouse,
  buildHut, buildBoat, buildNets, buildPools, buildTimbers, buildMausoleum,
  /* footprints for collision */
  solid, solidAlong,
  /* a dark land's look, to start a world land from (copy it, never change it) */
  lookOf,
};

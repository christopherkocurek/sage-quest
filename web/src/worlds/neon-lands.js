/* The Neon City lands (web/src/worlds/neon.js re-exports them). Two lands, each with one clear subject:
   rainline "The Rain District": a wet boulevard at night that runs straight at the Tower. Street canyons of instanced
     towers with lit windows, blade signs in abstract glyphs, steam from the manholes, tram wires, an elevated rail line
     marching toward the Tower, sodium lamps, rain, and the city's light smeared on the wet asphalt.
   dockyard "The Dry Docks": a container port under sodium masts, in the same rain. Stacks of containers in lanes, two gantry cranes on
     the quay, a ship on blocks in a dry dock, dust in the lamp light, black water, and the Tower across the bay.
   The Tower (a skyscraper with a red crown) stands on the nemesis line in both.
   Fight rules kept: flat at y = 0 inside 16 m, nothing solid inside 17 m, nothing big in the nemesis wedge inside 320 m.
   Ground textures: Poly Haven asphalt_02 and hangar_concrete_floor (CC0), in /assets/real/neon/.
   All geometry is code-built; every repeated thing is instanced; no per-frame geometry work. */
import * as THREE from 'three';
import { LANDKIT as K } from '../lands.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { TAU, NEMESIS_ANG, smooth, clamp, lerp, fbm, angOff, NOISE, WORLD_VARY_PARS, WORLD_VARY } = K;
const AX = Math.cos(NEMESIS_ANG); const AZ = Math.sin(NEMESIS_ANG); /* s axis: toward the Tower */
const BX = -AZ; const BZ = AX; /* t axis: across the boulevard */
const ROT = Math.atan2(-AZ, AX); /* rotation.y that turns local +x onto the s axis */
const toW = (s, t) => [AX * s + BX * t, AZ * s + BZ * t];
const toST = (x, z) => [x * AX + z * AZ, x * BX + z * BZ];
const TEX = (id) => `../real/neon/${id}`; /* lands.js loads /assets/ground/<id>_diff.jpg: this resolves to /assets/real/neon/ */

/* poles the Tower can knock down (street lamps, cold light poles, sodium masts). A boss passed through them.
   Each entry: { x, z, h, inst: [[InstancedMesh, i]], glow: [[glowMesh, i]], ray: [[rayMesh, i]] }. neon-boss.js calls
   knockPoles(x, z, r, dt, onFall) every frame: a pole within r of (x, z) tips over away from that point (0.7 s, eased), its
   head light and its light shaft go out, and onFall(x, y, z) gets the head position once (sparks). A new land clears it. */
const POLES = [];
const _pm = new THREE.Matrix4(); const _pr = new THREE.Matrix4(); const _pt = new THREE.Matrix4(); const _pa = new THREE.Vector3();
function pole(x, z, h) { const p = { x, z, h, inst: [], glow: [], ray: [], t: -1, ang: 0, ax: 0, az: 0, base: [] }; POLES.push(p); return p; }
export function knockPoles(x, z, r, dt, onFall) {
  for (const p of POLES) {
    if (p.t < 0) {
      const dx = p.x - x; const dz = p.z - z; const d = Math.hypot(dx, dz); if (d > r) continue;
      p.t = 0; p.ax = d > 1e-3 ? dx / d : 1; p.az = d > 1e-3 ? dz / d : 0;
      p.base = p.inst.map(([m, i]) => { const M = new THREE.Matrix4(); m.getMatrixAt(i, M); return M; });
      for (const [m, i] of p.glow) { const a = m.geometry.attributes.aG; a.setW(i, 0); a.needsUpdate = true; }
      for (const [m, i] of p.ray) { const a = m.geometry.attributes.aDim; a.setX(i, 0); a.needsUpdate = true; }
      onFall?.(p.x + p.ax * 0.6, p.h * 0.85, p.z + p.az * 0.6);
    }
    if (p.t >= 0 && p.t < 1) {
      p.t = Math.min(1, p.t + dt / 0.7); const k = p.t * p.t; /* it tips slowly, then falls fast */
      const ang = 1.32 * k - (p.t >= 1 ? 0.06 : 0); /* lies on the street (a small rebound at the end) */
      _pa.set(p.az, 0, -p.ax); _pr.makeRotationAxis(_pa, ang); /* rotating +Y about (az, 0, -ax) tips the top toward (ax, az) */
      _pt.makeTranslation(p.x, 0, p.z); _pm.multiplyMatrices(_pt, _pr); _pt.makeTranslation(-p.x, 0, -p.z); _pm.multiply(_pt);
      p.inst.forEach(([m, i], j) => { _pr.multiplyMatrices(_pm, p.base[j]); m.setMatrixAt(i, _pr); m.instanceMatrix.needsUpdate = true; });
    }
  }
}
export const TOWER_S = 480; /* the Tower, metres down the nemesis line */
export const PAL = { cyan: 0x3ef2ff, magenta: 0xff3aa0, amber: 0xffa53a, red: 0xff2a30, white: 0xd8ecff, sodium: 0xff9238 };
const SIGN_COLS = [PAL.cyan, PAL.cyan, PAL.amber, PAL.magenta, PAL.red, PAL.white, PAL.cyan, PAL.amber];
const wedge = (x, z, half = 0.22, far = 320) => { const d = Math.hypot(x, z); if (d > 1 && d < TOWER_S - 20 && angOff(Math.atan2(z, x)) < 0.07) return true; return d < far && d > 1 && angOff(Math.atan2(z, x)) < half; };
const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3(); const _e = new THREE.Euler(); const _c = new THREE.Color();

/* ---------------------------------------------------------------- materials (made per land, owned by it) */
/* Facades: near-black panels, a window grid by world position (floor and bay sizes per building), lit rooms in bands of
   floors (warm mostly, some cold, a few cyan or magenta), lit shop fronts on the street floor, neon strips on some
   corners and roof lines. Far away the grid fades to its average glow, so distant towers never shimmer. */
const TOWER_VERT_PARS = `${WORLD_VARY_PARS} varying vec3 vObj; varying vec3 vON; varying vec3 vScl; varying float vSeed; uniform float uSeed;`;
const TOWER_VERT = `vObj = position; vON = normal;
  #ifdef USE_INSTANCING
  vScl = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  #else
  vScl = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)); vSeed = uSeed;
  #endif
  ${WORLD_VARY}`;
const TOWER_FRAG_PARS = `${TOWER_VERT_PARS} uniform float uWin; uniform float uStrip; uniform vec3 uShopA; uniform vec3 uShopB; uniform float uTime; ${NOISE}`;
const TOWER_FRAG = `
  vec3 sqN = normalize(vWN); float sqSide = 1.0 - step(0.5, abs(sqN.y)); float sqHs = vSeed;
  float sqColW = mix(1.05, 1.5, fract(sqHs * 7.31)); float sqFlH = mix(3.2, 3.6, fract(sqHs * 3.17));
  vec3 sqON = normalize(vON); bool sqXF = abs(sqON.x) > 0.5;
  float sqU = (sqXF ? vObj.z * vScl.z : vObj.x * vScl.x) + sqHs * 37.0;
  vec2 sqG = vec2(sqU / sqColW, (vW.y - 0.8) / sqFlH); vec2 sqCi = floor(sqG); vec2 sqCf = fract(sqG);
  vec2 sqFw = fwidth(sqG); float sqAA = 1.0 - smoothstep(0.22, 0.6, max(sqFw.x, sqFw.y));
  float sqWin = smoothstep(0.1, 0.1 + sqFw.x * 1.5, sqCf.x) * smoothstep(0.9, 0.9 - sqFw.x * 1.5, sqCf.x) * smoothstep(0.3, 0.3 + sqFw.y * 1.5, sqCf.y) * smoothstep(0.84, 0.84 - sqFw.y * 1.5, sqCf.y);
  sqWin *= smoothstep(0.03, 0.03 + sqFw.x * 1.5, abs(sqCf.x - 0.5)); /* the mullion */
  sqWin *= sqSide * step(4.4, vW.y);
  float sqShare = mix(0.04, 0.3, fract(sqHs * 13.7)) * (0.25 + 1.2 * sqH2(vec2(floor(sqCi.y * 0.25), sqHs * 40.0)));
  vec2 sqRoom = vec2(floor((sqCi.x + floor(sqHs * 5.0)) / 3.0), sqCi.y); float sqLit = step(sqH2(sqRoom + sqHs * 91.0), sqShare);
  float sqH2b = sqH2(sqCi * 1.37 + sqHs * 17.0);
  float sqH2r = sqH2(sqRoom * 1.37 + sqHs * 17.0); vec3 sqWc = sqH2r < 0.66 ? vec3(1.0, 0.7, 0.42) : sqH2r < 0.95 ? vec3(0.68, 0.82, 1.0) : vec3(0.3, 0.9, 1.0);
  float sqBri = (0.32 + 0.3 * sqH2(sqRoom * 2.11 + 3.0)) * uWin * mix(0.8, 1.0, sqCf.y) * (0.85 + 0.15 * sqH2(sqCi * 3.3));
  vec3 sqE = mix(vec3(0.9, 0.7, 0.5) * sqShare * 0.3 * uWin * sqSide * step(4.4, vW.y), sqWc * sqBri * sqLit * sqWin + vec3(0.012, 0.018, 0.026) * uWin * sqWin * (1.0 - sqLit), sqAA);
  /* the street floor: a lit shop front band on some buildings, dark shutters on the rest */
  float sqShop = step(0.3, fract(sqHs * 5.3)) /* 70% of buildings (was 58%) */ * sqSide * smoothstep(0.7, 0.9, vW.y) * (1.0 - smoothstep(3.3, 3.5, vW.y));
  float sqMull = smoothstep(0.0, 0.06, abs(fract(sqU / 3.1) - 0.5) - 0.44);
  float sqBay = step(0.35, sqH2(vec2(floor(sqU / 3.1), sqHs * 19.0))); float sqDoor = mix(0.35, 1.0, smoothstep(1.2, 2.6, vW.y));
  sqE += mix(uShopA, uShopB, step(0.5, fract(sqHs * 11.1))) * 0.55 * sqShop * sqBay * sqDoor * (1.0 - sqMull);
  /* no black street floor: every building gets a lit awning edge at 3.5 m and dim street-lit shutter slats on the
     bays with no shop, so a view toward the kerb never shows a black void */
  float sqAwn = sqSide * smoothstep(3.42, 3.47, vW.y) * (1.0 - smoothstep(3.6, 3.65, vW.y));
  sqE += mix(uShopA, uShopB, step(0.5, fract(sqHs * 17.3))) * 0.5 * sqAwn * (0.6 + 0.4 * step(0.3, sqH2(vec2(floor(sqU / 3.1), sqHs * 7.0))));
  float sqSlat = 0.55 + 0.45 * step(0.5, fract(vW.y * 5.0));
  sqE += vec3(0.018, 0.022, 0.03) * sqSlat * sqSide * smoothstep(0.05, 0.25, vW.y) * (1.0 - smoothstep(3.25, 3.4, vW.y)) * (1.0 - sqShop * sqBay) * (1.0 - sqMull * 0.7);
  /* neon strips on a share of corners and roof lines */
  vec3 sqQ = abs(vObj) * 2.0;
  float sqEd = sqXF ? (1.0 - sqQ.z) * vScl.z * 0.5 : (1.0 - sqQ.x) * vScl.x * 0.5;
  float sqRoofD = (1.0 - vObj.y) * vScl.y;
  float sqStripOn = step(0.8, fract(sqHs * 23.3)) * uStrip;
  vec3 sqSc = fract(sqHs * 41.0) < 0.55 ? vec3(0.24, 0.95, 1.0) : fract(sqHs * 41.0) < 0.8 ? vec3(1.0, 0.16, 0.2) : vec3(1.0, 0.22, 0.62);
  sqE += sqSc * 2.4 * sqStripOn * sqSide * max(1.0 - smoothstep(0.1, 0.2, sqEd), (1.0 - smoothstep(0.15, 0.3, sqRoofD)) * step(0.5, fract(sqHs * 57.0)));
  /* panels: vertical bays of slightly different darkness, wet streaks running down */
  float sqPan = 0.75 + 0.4 * sqH2(vec2(sqCi.x, floor(vW.y / 11.0)) + sqHs * 30.0);
  diffuseColor.rgb *= mix(0.6, 1.0, sqSide) * sqPan * mix(1.0, 0.35, sqWin * sqAA);
  totalEmissiveRadiance += sqE;`;
export function towerMaterial({ color = 0x0c0d10, win = 1, strip = 1, shopA = 0x2ad8ff, shopB = 0xffa040, seed = 0.37, key = '' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, envMapIntensity: 0.18 });
  const U = { uWin: { value: win }, uStrip: { value: strip }, uShopA: { value: new THREE.Color(shopA).multiplyScalar(0.8) }, uShopB: { value: new THREE.Color(shopB).multiplyScalar(0.8) }, uSeed: { value: seed }, uTime: { value: 0 } };
  mat.userData.tower = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${TOWER_VERT_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${TOWER_VERT}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${TOWER_FRAG_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${TOWER_FRAG}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, (1.0 - step(0.5, abs(normalize(vWN).y))) * 0.5);');
  };
  mat.customProgramCacheKey = () => `neon-tower${key}`;
  return mat;
}

/* Containers and sheds: corrugated steel by world position (ribs across the long faces), paint from the instance
   colour, rust and grime running down, darker door ends. */
const BOX_FRAG = `
  vec3 sqN = normalize(vWN); float sqSide = 1.0 - step(0.5, abs(sqN.y));
  vec3 sqQ = abs(vObj) * 2.0; float sqLong = vScl.x > vScl.z ? 1.0 : 0.0;
  float sqOnLong = abs(normalize(vON).x) > 0.5 ? 1.0 - sqLong : sqLong;
  float sqU = abs(normalize(vON).x) > 0.5 ? vObj.z * vScl.z : vObj.x * vScl.x;
  float sqRib = smoothstep(-0.6, 0.6, sin(sqU * 22.0));
  float sqRust = smoothstep(0.55, 0.85, sqN2(vec2(sqU * 1.3, vW.y * 0.35 + vSeed * 30.0)) * 0.7 + sqN2(vW.xz * 0.9 + vW.y * 2.0) * 0.3);
  vec3 sqRustC = vec3(0.16, 0.07, 0.035);
  diffuseColor.rgb *= mix(1.0, 0.55 + 0.45 * sqRib, sqSide);
  diffuseColor.rgb = mix(diffuseColor.rgb, sqRustC, sqRust * 0.55 * sqSide);
  diffuseColor.rgb *= mix(1.0, 0.55, (1.0 - sqOnLong) * sqSide);
  diffuseColor.rgb *= mix(0.7, 1.0, smoothstep(0.0, 1.2, vObj.y * vScl.y));
  /* corner posts and the top rail darker; door ends get two vertical locking bars */
  float sqLen = abs(normalize(vON).x) > 0.5 ? vScl.z : vScl.x; float sqUe = abs(sqU) - sqLen * 0.5;
  diffuseColor.rgb *= mix(1.0, 0.45, sqSide * max(step(-0.12, sqUe), step(0.94, vObj.y)));
  float sqBar = (1.0 - sqOnLong) * sqSide * step(abs(abs(sqU) - 0.35), 0.03);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 0.48), sqBar * 0.8);
  /* markings: a block of abstract stroke glyphs (no letters) on most long sides, and a code row near one end */
  if (sqOnLong > 0.5 && sqSide > 0.5) {
    vec2 sqM = vec2((sqU + sqLen * 0.18) / (sqLen * 0.36), (vObj.y - 0.42) / 0.36);
    float sqInM = step(0.0, sqM.x) * step(sqM.x, 1.0) * step(0.0, sqM.y) * step(sqM.y, 1.0) * step(0.35, vSeed);
    vec2 sqGc = sqM * vec2(4.0, 2.0); vec2 sqGi = floor(sqGc); vec2 sqGf = fract(sqGc);
    float sqK = sqH2(sqGi + vSeed * 31.0);
    float sqStroke = max(step(abs(sqGf.x - 0.2), 0.08) * step(0.3, sqK), max(step(abs(sqGf.y - 0.75), 0.08) * step(sqK, 0.7), step(abs(sqGf.x - 0.75), 0.08) * step(0.5, fract(sqK * 7.0))));
    sqStroke = max(sqStroke, step(abs(sqGf.y - 0.25), 0.08) * step(fract(sqK * 13.0), 0.5)) * step(0.12, sqGf.y) * step(sqGf.y, 0.88);
    float sqCode = step(abs(sqU - sqLen * 0.36), sqLen * 0.08) * step(abs(vObj.y - 0.82), 0.035) * step(0.4, fract(sqU * 3.0)) * step(0.25, vSeed);
    vec3 sqInk = fract(vSeed * 9.0) < 0.75 ? vec3(0.78, 0.78, 0.74) : vec3(0.85, 0.62, 0.2);
    diffuseColor.rgb = mix(diffuseColor.rgb, sqInk, clamp(sqStroke * sqInM + sqCode, 0.0, 1.0) * 0.85);
  }`;
export function boxMaterial({ key = '' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.45, envMapIntensity: 0.2 });
  const U = { uSeed: { value: 0.5 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${TOWER_VERT_PARS}`).replace('#include <project_vertex>', `#include <project_vertex>\n${TOWER_VERT}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${TOWER_VERT_PARS} ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${BOX_FRAG}`);
  };
  mat.customProgramCacheKey = () => `neon-box${key}`;
  return mat;
}

/* Holo signs: additive panels of abstract glyphs (strokes on a 3x3 lattice, never letters), a frame, scan lines, a
   rare flicker; kind 1 is an emblem (rings and bars). Their own distance fade (the post fog does not see them). */
const SIGN_VERT = `attribute vec4 aSign; varying vec2 vUv; varying vec4 vS; varying float vFade; varying vec3 vCol;
void main(){ vUv = uv; vS = aSign; vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #endif
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); float d = length(wp.xyz - cameraPosition);
  vFade = exp(-d * 0.0042) * smoothstep(1.0, 4.0, d); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SIGN_FRAG = `uniform float uTime; uniform float uK; varying vec2 vUv; varying vec4 vS; varying float vFade; varying vec3 vCol;
float sh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  float seed = vS.x; float kind = vS.y; vec2 grid = vS.zw;
  vec2 g = vUv * grid; vec2 ci = floor(g); vec2 cf = fract(g);
  float edge = min(min(g.x, grid.x - g.x), min(g.y, grid.y - g.y));
  float frame = 1.0 - smoothstep(0.05, 0.12, edge);
  float a = 0.0;
  if (kind < 0.5) {
    vec2 b = (cf - 0.2) / 0.6; float inb = step(0.0, b.x) * step(b.x, 1.0) * step(0.0, b.y) * step(b.y, 1.0);
    float w = 0.09; float s = 0.0;
    vec2 k = ci + seed * 17.0;
    s = max(s, step(sh(k + 0.1), 0.5) * step(abs(b.x - 0.08), w));
    s = max(s, step(sh(k + 0.2), 0.42) * step(abs(b.x - 0.5), w));
    s = max(s, step(sh(k + 0.3), 0.5) * step(abs(b.x - 0.92), w));
    s = max(s, step(sh(k + 0.4), 0.5) * step(abs(b.y - 0.92), w));
    s = max(s, step(sh(k + 0.5), 0.45) * step(abs(b.y - 0.5), w) * step(b.x, 0.5 + step(sh(k + 0.7), 0.5) * 0.5));
    s = max(s, step(sh(k + 0.6), 0.5) * step(abs(b.y - 0.08), w));
    s *= inb * step(0.1, sh(k + 0.9));
    a = s * 0.95 + frame * 0.75 + 0.07;
  } else {
    vec2 p = (vUv - 0.5) * vec2(grid.x / grid.y, 1.0);
    float r = length(p); float t = uTime * 0.35 + seed * 6.0;
    float ring = 1.0 - smoothstep(0.012, 0.03, abs(r - 0.34));
    float ring2 = (1.0 - smoothstep(0.008, 0.02, abs(r - 0.24))) * step(0.0, sin(atan(p.y, p.x) * 3.0 + t * 2.0));
    float bars = step(abs(p.y), 0.42) * step(0.62, abs(p.x)) * step(0.45, fract(p.y * 9.0 + seed)) * step(abs(p.x), 0.62 + 0.25 * sh(vec2(floor(p.y * 9.0 + seed), seed)));
    a = ring + ring2 * 0.8 + bars * 0.8 + frame * 0.7 + 0.05;
  }
  float scan = 0.72 + 0.28 * sin(vUv.y * grid.y * 24.0 - uTime * 4.0 + seed * 9.0);
  float flick = 1.0 - step(0.975, sh(vec2(floor(uTime * 9.0), seed * 13.0))) * 0.85;
  gl_FragColor = vec4(vCol * a * scan * flick * vFade * uK, 1.0);
}`;
export function signMaterial(k = 2.2) {
  return new THREE.ShaderMaterial({ vertexShader: SIGN_VERT, fragmentShader: SIGN_FRAG, uniforms: { uTime: { value: 0 }, uK: { value: k } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
}
/* signs: [{ x, y, z, ry, w, h, col, kind, cols, rows }] -> one instanced mesh */
export function signMesh(list, mat) {
  const g = new THREE.PlaneGeometry(1, 1); const n = list.length;
  const aS = new Float32Array(n * 4);
  const mesh = new THREE.InstancedMesh(g, mat, n);
  list.forEach((s, i) => { _e.set(0, s.ry, 0); _q.setFromEuler(_e); _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(s.w, s.h, 1)); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.set(s.col)); aS.set([Math.random(), s.kind || 0, s.cols, s.rows], i * 4); });
  g.setAttribute('aSign', new THREE.InstancedBufferAttribute(aS, 4));
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  return mesh;
}

/* Light on wet ground: streaks that run from a light source toward the viewer, broken up by ripples (instanced quads
   on the ground; kind 0 = a streak, 1 = a round pool). Additive, faded by distance. */
const STREAK_VERT = `attribute vec2 aKind; varying vec2 vUv; varying vec3 vCol; varying float vFade; varying vec2 vK; varying vec3 vW;
void main(){ vUv = uv; vK = aKind; vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #endif
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = wp.xyz; float d = length(wp.xyz - cameraPosition);
  vFade = exp(-d * 0.006) * smoothstep(0.5, 3.0, d); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const STREAK_FRAG = `uniform float uTime; uniform float uK; varying vec2 vUv; varying vec3 vCol; varying float vFade; varying vec2 vK; varying vec3 vW; ${NOISE}
void main(){
  float a;
  if (vK.x < 0.5) { float x = (vUv.x - 0.5) * 2.0; float y = vUv.y;
    a = exp(-x * x * 5.0) * pow(1.0 - y, 1.6) * smoothstep(0.0, 0.06, y);
    a *= 0.45 + 0.75 * sqN2(vec2(vW.x * 2.3 + vW.z * 2.3, y * 40.0 - uTime * 0.6)) * smoothstep(0.2, 0.8, sqN2(vW.xz * 0.7 + uTime * 0.05) + 0.3);
  } else { vec2 q = (vUv - 0.5) * 2.0; float d = length(q); a = exp(-d * d * 3.0) * (1.0 - smoothstep(0.8, 1.0, d)) * (0.7 + 0.3 * sqN2(vW.xz * 1.5)); }
  gl_FragColor = vec4(vCol * a * vFade * uK * vK.y, 1.0);
}`;
/* streaks: [{ x, z, dir (angle the streak runs toward), len, w, col, k, kind }] */
function streakMesh(list, k = 1) {
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); /* uv.y 0 at the source, along -z */
  const n = list.length; const aK = new Float32Array(n * 2);
  const mat = new THREE.ShaderMaterial({ vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, uniforms: { uTime: { value: 0 }, uK: { value: k } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.InstancedMesh(g, mat, n);
  list.forEach((s, i) => {
    /* local -z runs toward dir */
    _e.set(0, Math.atan2(-Math.cos(s.dir), -Math.sin(s.dir)) + Math.PI, 0); _q.setFromEuler(_e);
    _m.compose(_p.set(s.x, s.y ?? 0.025, s.z), _q, _s.set(s.w, 1, s.kind ? s.w : s.len)); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.set(s.col)); aK.set([s.kind || 0, s.k ?? 1], i * 2);
  });
  g.setAttribute('aKind', new THREE.InstancedBufferAttribute(aK, 2));
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  return mesh;
}

/* ---------------------------------------------------------------- shared generators */
/* instanced unit boxes (base at y = 0) from [{ x, z, w (along s), d (along t), h, y, ry }] */
function boxesMesh(list, mat, { shadow = false, colors = null } = {}) {
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(g, mat, list.length);
  list.forEach((b, i) => { _e.set(0, b.ry ?? ROT, 0); _q.setFromEuler(_e); _m.compose(_p.set(b.x, b.y ?? 0, b.z), _q, _s.set(b.w, b.h, b.d)); mesh.setMatrixAt(i, _m); if (colors) mesh.setColorAt(i, _c.set(colors[i])); });
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  return mesh;
}
function ownAdd(L, mesh, delay = 0.2) { mesh.userData.delay = delay; return L.add(mesh, { grow: true }); }

/* ---- street detail shared by both lands: hazard stripes on the jersey barriers, ribbed and stencilled drums, slotted
   drain grates, crack decals on the ground (canvas textures, one instanced mesh each) */
function hazardTex() {
  const t = K.canvasTex('neon-hazard', 256, 32, (g, w, h) => {
    g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c99a1c'; for (let k = -40; k < w + 40; k += 32) { g.beginPath(); g.moveTo(k, h); g.lineTo(k + 16, h); g.lineTo(k + 32, 0); g.lineTo(k + 16, 0); g.closePath(); g.fill(); }
    g.globalAlpha = 0.35; g.fillStyle = '#000'; for (let i = 0; i < 90; i++) g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 1 + Math.random() * 3); g.globalAlpha = 1;
  });
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
/* stripes on both long faces of each barrier ([x, z, ry] at the barrier's base): barrierGeo's length runs along local x */
function barrierStripes(L, list) {
  if (!list.length) return;
  const g = new THREE.PlaneGeometry(2.8, 0.17); const m = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.6, metalness: 0.0, envMapIntensity: 0.2 });
  const mesh = new THREE.InstancedMesh(g, m, list.length * 2); let i = 0;
  for (const [x, z, ry] of list) for (const sd of [-1, 1]) {
    _e.set(-0.058, ry + (sd > 0 ? 0 : Math.PI), 0, 'YXZ'); _q.setFromEuler(_e);
    _p.set(Math.sin(ry) * sd * 0.109 + x, 0.56, Math.cos(ry) * sd * 0.109 + z); _m.compose(_p, _q, _s.set(1, 1, 1)); mesh.setMatrixAt(i++, _m);
  }
  mesh.receiveShadow = true; ownAdd(L, mesh, 0.12);
}
function drumMaterial() {
  const t = K.canvasTex('neon-drum', 128, 128, (g, w, h) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    for (const y of [0.06, 0.34, 0.66, 0.94]) { g.fillStyle = '#6a6a6a'; g.fillRect(0, h * y - 3, w, 6); g.fillStyle = '#f2f2f2'; g.fillRect(0, h * y + 3, w, 2); }
    g.fillStyle = '#ece6d0'; g.fillRect(0, h * 0.42, w * 0.5, h * 0.16); g.fillStyle = '#1a1a1a';
    for (let k = 0; k < 6; k++) g.fillRect(6 + k * 10, h * 0.45, 3 + (k % 3) * 3, h * 0.1);
    g.fillStyle = '#c99a1c'; g.fillRect(w * 0.55, h * 0.44, w * 0.18, h * 0.12);
    g.globalAlpha = 0.4; for (let i = 0; i < 160; i++) { g.fillStyle = Math.random() < 0.5 ? '#5a3a24' : '#2a2a2a'; g.fillRect(Math.random() * w, h * (0.75 + Math.random() * 0.25), 1 + Math.random() * 3, 2 + Math.random() * 8); } g.globalAlpha = 1;
  });
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.45, envMapIntensity: 0.25 });
}
/* drain grates [x, z, ry] and cracks [x, z, ry, size] on the ground */
function streetDetail(L, drains, cracks) {
  if (drains.length) {
    const t = K.canvasTex('neon-drain', 64, 64, (g, w, h) => { g.fillStyle = '#26282b'; g.fillRect(0, 0, w, h); g.fillStyle = '#020203'; for (let k = 6; k < w - 4; k += 7) g.fillRect(k, 6, 3, h - 12); g.strokeStyle = '#3a3c40'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); });
    const g = new THREE.BoxGeometry(0.8, 0.02, 0.5); g.translate(0, 0.006, 0); const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.3 });
    const mesh = new THREE.InstancedMesh(g, m, drains.length); drains.forEach(([x, z, ry], i) => { _e.set(0, ry, 0, 'XYZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, 0, z), _q, _s.set(1, 1, 1)); mesh.setMatrixAt(i, _m); }); mesh.receiveShadow = true; ownAdd(L, mesh, 0.05);
  }
  if (cracks.length) {
    const t = K.canvasTex('neon-crack', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,1)'; g.lineCap = 'round';
      const branch = (x, y, a, len, wd) => { for (let i = 0; i < len; i++) { const nx = x + Math.cos(a) * 9; const ny = y + Math.sin(a) * 9; g.lineWidth = wd * (1 - i / len) + 0.35; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); x = nx; y = ny; a += (Math.random() - 0.5) * 0.9; if (Math.random() < 0.12 && wd > 1.2) branch(x, y, a + (Math.random() < 0.5 ? 0.9 : -0.9), (len - i) * 0.5, wd * 0.6); } };
      for (let k = 0; k < 3; k++) branch(w * (0.3 + Math.random() * 0.4), h * (0.3 + Math.random() * 0.4), Math.random() * 6.28, 12 + Math.random() * 10, 1.7);
    });
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    /* unlit and dark: a lit rough decal caught the key light on the glossy wet ground and read as chalk */
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const mesh = new THREE.InstancedMesh(g, m, cracks.length); cracks.forEach(([x, z, ry, sz], i) => { _e.set(0, ry, 0, 'XYZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, 0.012, z), _q, _s.set(sz, 1, sz)); mesh.setMatrixAt(i, _m); }); mesh.renderOrder = 1; ownAdd(L, mesh, 0.05);
  }
}
function ticker(L, fn) { L.current.tickers.push(fn); }

/* The Tower: a black skyscraper in four setbacks on the nemesis line, a lit window field that thins toward the top,
   and the red crown: two rings of red light, a lit crown box and a spire with a slow beacon. Returns { group, crownY }. */
export function buildTower(L, s = TOWER_S, { scale = 0.7 } = {}) {
  const [x, z] = toW(s, 0);
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ROT; grp.scale.setScalar(scale);
  const mat = towerMaterial({ color: 0x0b0c10, win: 0.7, strip: 0, seed: 0.613, key: '-tower' });
  const tiers = [[56, 56, 0, 120], [46, 46, 120, 90], [36, 36, 210, 60], [26, 26, 270, 34]];
  const parts = tiers.map(([w, d, y0, h]) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(0, y0 + h / 2, 0); return b; });
  /* fins on the corners of the lower tiers: vertical ribs that make the silhouette read at 300 m */
  for (const [w, d, y0, h] of tiers.slice(0, 3)) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const b = new THREE.BoxGeometry(2.2, h + 6, 2.2); b.translate(sx * (w / 2 + 0.6), y0 + (h + 6) / 2, sz * (d / 2 + 0.6)); parts.push(b); }
  const body = new THREE.Mesh(mergeGeometries(parts), mat); for (const p of parts) p.dispose();
  grp.add(body);
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.red).multiplyScalar(9), toneMapped: false, fog: false });
  const ringG = []; for (const [y, w] of [[304, 27.2], [296, 27.2], [212, 37.2]]) { const b = new THREE.BoxGeometry(w, 1.1, w); b.translate(0, y, 0); ringG.push(b); }
  { const b = new THREE.BoxGeometry(18, 10, 18); b.translate(0, 309, 0); ringG.push(b); }
  const crown = new THREE.Mesh(mergeGeometries(ringG), red); grp.add(crown);
  const spireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5, metalness: 0.6 });
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.4, 60, 6), spireMat); spire.position.y = 344; grp.add(spire);
  const L0 = L.current; L0.group.add(grp); L0.owned.push(body.geometry, mat, crown.geometry, red, spire.geometry, spireMat);
  grp.userData.growY = 1; grp.scale.y = 0.0001; grp.userData.delay = 0.6; L0.parts.push(grp);
  /* a haze of red light round the crown and a slow beacon at the tip */
  const top = toW(s, 0);
  const glow = K.addGlows(L, [[top[0], 300 * scale, top[1], 70 * scale], [top[0], 306 * scale, top[1], 36 * scale]], 0xff1a20, { alpha: 0.35, depthTest: false });
  const beacon = K.addGlows(L, [[top[0], 376 * scale, top[1], 26 * scale]], 0xff2a2a, { alpha: 1 });
  if (beacon) ticker(L, (t) => { beacon.material.uniforms.uA.value = Math.pow(Math.max(0, Math.sin(t * 1.4)), 8) * 1.2; });
  if (glow) glow.renderOrder = 1;
  return { group: grp, crownY: 304 * scale, top: [top[0], top[1]] };
}

/* a far skyline ring: tall dark boxes with windows beyond the near city, at d0..d1 (and never in the wedge inside 320 m) */
function skylineList(r, { d0 = 300, d1 = 620, n = 160, hMin = 60, hMax = 240, skip = () => false } = {}) {
  const out = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const a = r() * TAU; const d = d0 + Math.pow(r(), 0.7) * (d1 - d0); const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    if (wedge(x, z, 0.26, 330) || skip(x, z, d)) continue;
    const w = 18 + r() * 36; const h = hMin + Math.pow(r(), 1.8) * (hMax - hMin);
    out.push({ x, z, w, d: w * (0.6 + r() * 0.8), h, ry: ROT + (r() < 0.3 ? r() * 0.6 : 0) });
  }
  return out;
}

/* poles along a line with sagging cables between them (one merged mesh for all cables) */
function cableGeo(spans, r) {
  const geos = [];
  for (const [a, b, sag, rad = 0.022] of spans) {
    const pa = new THREE.Vector3(...a); const pb = new THREE.Vector3(...b);
    const mid = pa.clone().lerp(pb, 0.5); mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(pa, mid.clone().setY(mid.y - sag), pb);
    geos.push(new THREE.TubeGeometry(curve, 14, rad, 3, false));
  }
  if (!geos.length) return null;
  const g = mergeGeometries(geos); for (const x of geos) x.dispose(); return g;
}

/* a jersey barrier: a tapered concrete profile, 3 m long */
function barrierGeo() {
  const shape = new THREE.Shape(); shape.moveTo(-0.3, 0); shape.lineTo(0.3, 0); shape.lineTo(0.3, 0.08); shape.lineTo(0.12, 0.3); shape.lineTo(0.09, 0.82); shape.lineTo(-0.09, 0.82); shape.lineTo(-0.12, 0.3); shape.lineTo(-0.3, 0.08); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false }); g.translate(0, 0, -1.5); g.rotateY(Math.PI / 2); return g;
}
/* a street lamp: pole, arm, head (head separate, emissive) */
function lampGeo(h = 7.5, arm = 2.2) {
  const pole = new THREE.CylinderGeometry(0.08, 0.13, h, 7); pole.translate(0, h / 2, 0);
  const a = new THREE.BoxGeometry(arm, 0.1, 0.12); a.translate(arm / 2, h - 0.1, 0);
  const g = mergeGeometries([pole.toNonIndexed(), a.toNonIndexed()]); pole.dispose(); a.dispose(); return g;
}
function lampHeadGeo(arm = 2.2, h = 7.5) { const g = new THREE.BoxGeometry(0.7, 0.14, 0.32); g.translate(arm - 0.2, h - 0.22, 0); return g; }

const dark = (c, rough = 0.85, metal = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, envMapIntensity: 0.2 });
const glowMat = (c, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });

/* ======================================================================================================== RAIN DISTRICT */
function rainLayout(ctx) {
  const { r, v } = ctx; const f = ctx.f;
  f.av = 13; /* half width of the boulevard */ f.cross = 14; /* half width of the cross street at the arena */
  f.bs = [38, 46, 42][v]; f.bt = [34, 40, 30][v]; f.st = [12, 14, 11][v];
  /* the elevated rail: parallel to the boulevard on one side */
  f.railT = (v === 1 ? -1 : 1) * (36 + r() * 6); f.railH = 11.5;
  /* puddles: soft patches on the street, more in the gutters */
  f.seedK = r() * 50;
}
/* block bands on one side of an axis: [[a, b], ...] from `start` outward */
function bands(start, block, street, max, r) { const out = []; let a = start; while (a < max) { const b = a + block * (0.75 + r() * 0.5); out.push([a, Math.min(b, max)]); a = b + street * (0.8 + r() * 0.4); } return out; }
function rainHeight(ctx, x, z, rr) { return 0; }
function rainMask(ctx, x, z, h, rr) {
  const f = ctx.f; const [s, t] = toST(x, z);
  /* sidewalks along the building lines (lighter, dry) and the wet street between */
  const at = Math.abs(t); const side = smooth(f.av - 1.2, f.av + 0.3, at) * (1 - smooth(f.av + 3.2, f.av + 4.2, at));
  const as = Math.abs(s); const side2 = smooth(f.cross - 1.2, f.cross + 0.3, as) * (1 - smooth(f.cross + 3.2, f.cross + 4.2, as)) * smooth(f.av + 2, f.av + 5, at);
  const walk = Math.max(side, side2) * 0.75;
  let wet = smooth(0.45, 0.62, fbm(x * 0.07 + f.seedK, z * 0.07, 3));
  /* the gutters hold water */
  wet = Math.max(wet, (1 - smooth(0.6, 2.0, Math.abs(at - (f.av - 0.8)))) * 0.9, (1 - smooth(0.6, 2.0, Math.abs(as - (f.cross - 0.8)))) * 0.9 * smooth(f.av, f.av + 3, at));
  /* a big puddle sheet across the arena's far side, where the boulevard dips */
  wet = Math.max(wet, smooth(0.44, 0.62, fbm(x * 0.05 - 4, z * 0.05 + f.seedK, 3)) * 0.7);
  return [walk, clamp(wet * (1 - walk * 0.85), 0, 1), 0, 0];
}

async function rainBuild(ctx, L) {
  const f = ctx.f; const r = ctx.r; const land = L.current; POLES.length = 0;
  /* ---- the city blocks */
  const near = []; const far = []; const signs = []; const streaks = []; const lots = [];
  const tb = bands(f.av, f.bt, f.st, 560, r); const sb = bands(f.cross, f.bs, f.st, 600, r);
  for (const sgnT of [-1, 1]) for (const [t0, t1] of tb) for (const sgnS of [-1, 1]) for (const [s0, s1] of sb) {
    const bs0 = sgnS > 0 ? s0 : -s1; const bs1 = sgnS > 0 ? s1 : -s0; const bt0 = sgnT > 0 ? t0 : -t1; const bt1 = sgnT > 0 ? t1 : -t0;
    const cs = (bs0 + bs1) / 2; const ct = (bt0 + bt1) / 2; const [cx, cz] = toW(cs, ct); const dc = Math.hypot(cx, cz);
    if (dc > 600) continue;
    const ns = 1 + Math.floor(r() * (dc < 120 ? 3 : 2)); const nt = (bt1 - bt0) > 26 && r() < 0.6 ? 2 : 1;
    for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
      const a0 = lerp(bs0, bs1, i / ns) + 0.4; const a1 = lerp(bs0, bs1, (i + 1) / ns) - 0.4; const c0 = lerp(bt0, bt1, j / nt) + 0.4; const c1 = lerp(bt0, bt1, (j + 1) / nt) - 0.4;
      if (a1 - a0 < 6 || c1 - c0 < 6) continue;
      const corners = [[a0, c0], [a1, c0], [a0, c1], [a1, c1], [(a0 + a1) / 2, (c0 + c1) / 2]].map(([s, t]) => toW(s, t));
      if (corners.some(([x, z]) => Math.hypot(x, z) < 19 || wedge(x, z))) continue;
      const ls = (a0 + a1) / 2; const lt = (c0 + c1) / 2; const [x, z] = toW(ls, lt); const d = Math.hypot(x, z);
      /* heights: a canyon near, mid-rise beyond, skyscrapers far; the walls that frame the Tower stand tall */
      const frame = smooth(0.5, 0.25, angOff(Math.atan2(z, x))) * smooth(40, 120, d);
      let h = d < 70 ? 14 + r() * 26 : 22 + Math.pow(r(), 1.5) * (70 + 110 * smooth(120, 400, d));
      h += frame * r() * 70; if (r() < 0.06 && d > 90) h += 80 + r() * 90;
      const lot = { x, z, w: a1 - a0, d: c1 - c0, h, s: ls, t: lt, dist: d };
      lots.push(lot);
      (d < 90 ? near : far).push({ x, z, w: lot.w, d: lot.d, h });
      /* setbacks on the tall ones */
      if (h > 70) { const k = 0.6 + r() * 0.2; (d < 90 ? near : far).push({ x, z, w: lot.w * k, d: lot.d * k, h: h * (0.18 + r() * 0.2), y: h }); }
      if (d < 140) K.solid(ctx, x, z, Math.min(lot.w, lot.d) * 0.5, 'building');
    }
  }
  const towerMat = towerMaterial({ key: '-rain' });
  ownAdd(L, boxesMesh(near, towerMat, { shadow: true }), 0.2);
  ownAdd(L, boxesMesh(far, towerMat), 0.35);
  /* the far skyline past the blocks */
  ownAdd(L, boxesMesh(skylineList(r, { d0: 560, d1: 700, n: 70, hMin: 80, hMax: 260 }), towerMat), 0.5);
  /* aviation lights on the tall roofs */
  const avi = []; for (const b of [...near, ...far]) if ((b.y ?? 0) + b.h > 120 && r() < 0.6) avi.push([b.x, (b.y ?? 0) + b.h + 1.5, b.z, 6]);
  K.addGlows(L, avi, 0xff2020, { alpha: 0.9 });

  /* ---- signs on the street faces of the near lots */
  for (const lot of lots) {
    if (lot.dist > 150 || r() < 0.25) continue;
    /* which face looks onto the boulevard (or the cross street) */
    const faceT = Math.sign(lot.t) * -1; /* toward t = 0 */
    const nSigns = lot.dist < 70 ? 1 + Math.floor(r() * 3) : 1;
    for (let k = 0; k < nSigns; k++) {
      const blade = r() < 0.6; const col = SIGN_COLS[Math.floor(r() * SIGN_COLS.length)];
      const along = lot.s + (r() - 0.5) * lot.w * 0.8; const tf = lot.t + faceT * (lot.d / 2);
      const hgt = blade ? 5 + r() * 6 : 1.6 + r() * 2.2; const wid = blade ? 1.1 + r() * 0.5 : 4 + r() * 6;
      const y = Math.min(lot.h - hgt / 2 - 0.5, 4.6 + hgt / 2 + r() * Math.min(18, lot.h * 0.4));
      if (y < hgt / 2 + 3.6) continue;
      let sx; let sz; let ry;
      if (blade) { [sx, sz] = toW(along, tf + faceT * (wid / 2 + 0.3)); ry = ROT + Math.PI / 2; }
      else { [sx, sz] = toW(along, tf + faceT * 0.15); ry = ROT; }
      if (wedge(sx, sz) || Math.hypot(sx, sz) < 18) continue;
      signs.push({ x: sx, y, z: sz, ry, w: wid, h: hgt, col, kind: 0, cols: blade ? 1 : Math.max(3, Math.round(wid / 1.1)), rows: blade ? Math.max(4, Math.round(hgt / 1.05)) : Math.max(1, Math.round(hgt / 1.1)) });
      const dist = Math.hypot(sx, sz);
      if (y - hgt / 2 < 14 && dist < 100) { const [gx, gz] = toW(along, tf + faceT * 1.5); streaks.push({ x: gx, z: gz, dir: Math.atan2(-gz, -gx), len: Math.min(22, 6 + hgt * 1.4 + y * 0.6), w: Math.max(1.2, wid * 0.9), col, k: 0.55 }); }
    }
  }
  /* the big emblem board: high on a facade that faces the arena, behind the player's right shoulder */
  { const lot = lots.filter((l) => l.dist > 45 && l.dist < 90 && l.h > 30 && angOff(Math.atan2(l.z, l.x)) > 0.9).sort((a, b) => a.dist - b.dist)[0];
    if (lot) { const faceT = Math.sign(lot.t) * -1; const [sx, sz] = toW(lot.s, lot.t + faceT * (lot.d / 2 + 0.2)); signs.push({ x: sx, y: Math.min(lot.h - 7, 22), z: sz, ry: ROT, w: 18, h: 10, col: PAL.cyan, kind: 1, cols: 18, rows: 10 }); f.board = [sx, sz]; } }
  const signMat = signMaterial(2.4); const sm = signMesh(signs, signMat); L.add(sm, { grow: false }); ticker(L, (t) => { signMat.uniforms.uTime.value = t; });
  f.signs = signs;

  /* ---- street lamps along both curbs, sodium mostly, a few cold LEDs */
  const lamps = []; const heads = [[], []]; const lampGlow = [[], []]; const rays = [];
  for (const side of [-1, 1]) for (let s = -230; s < 230; s += 21) {
    const t = side * (f.av + 0.6); const [x, z] = toW(s, t); if (Math.hypot(x, z) < 17.5) continue;
    if (wedge(x, z, 0.06)) continue;
    const cold = r() < 0.22 ? 1 : 0; lamps.push({ x, z, ry: ROT + (side > 0 ? Math.PI / 2 : -Math.PI / 2), cold });
    const [hx, hz] = toW(s, t - side * 2.0); lampGlow[cold].push([hx, 7.2, hz, 3.2]); heads[cold].push({ x, z, ry: ROT + (side > 0 ? Math.PI / 2 : -Math.PI / 2) });
    rays.push({ foot: [hx, 7.2, hz], dir: [0, -1, 0], len: 7.2, w0: 0.3, w1: 3.6, k: cold ? 0.6 : 1 });
    if (Math.hypot(x, z) < 40) lamps[lamps.length - 1].pole = Object.assign(pole(x, z, 7.5), { at: [lamps.length - 1, cold, heads[cold].length - 1, lampGlow[cold].length - 1, rays.length - 1] });
    if (Math.hypot(hx, hz) < 160) streaks.push({ x: hx, z: hz, dir: 0, w: 7, col: cold ? 0x9fd8ff : PAL.sodium, k: 0.22, kind: 1 });
    const [rx, rz] = toW(s, t - side * 2.6); if (Math.hypot(rx, rz) < 110) streaks.push({ x: rx, z: rz, dir: Math.atan2(-rz, -rx), len: 16, w: 1.6, col: cold ? 0x9fd8ff : PAL.sodium, k: 0.4 });
    if (Math.hypot(x, z) < 140) K.solid(ctx, x, z, 0.25, 'lamp');
  }
  { const pg = lampGeo(); const pm = dark(0x1a1c20, 0.6, 0.6); const hg = lampHeadGeo();
    const inst = (geo, mat, list) => { const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((l, i) => { _e.set(0, l.ry, 0); _q.setFromEuler(_e); _m.compose(_p.set(l.x, 0, l.z), _q, _s.set(1, 1, 1)); m.setMatrixAt(i, _m); }); m.castShadow = true; return m; };
    const poleM = inst(pg, pm, lamps); ownAdd(L, poleM, 0.3);
    const headM = [inst(hg, glowMat(PAL.sodium, 2.5), heads[0]), heads[1].length ? inst(hg.clone(), glowMat(0xbfe6ff, 2.5), heads[1]) : null];
    ownAdd(L, headM[0], 0.3); if (headM[1]) ownAdd(L, headM[1], 0.3);
    const gm = [K.addGlows(L, lampGlow[0], PAL.sodium, { alpha: 0.55 }), K.addGlows(L, lampGlow[1], 0x9fd8ff, { alpha: 0.5 })];
    const rm = K.addRays(L, rays, 0xffb070, { alpha: 0.03, ends: [0.05, 0.9] });
    for (const l of lamps) if (l.pole) { const [i, c, hi, gi, ri] = l.pole.at; l.pole.inst.push([poleM, i], [headM[c], hi]); if (gm[c]) l.pole.glow.push([gm[c], gi]); if (rm) l.pole.ray.push([rm, ri]); } }

  /* ---- the elevated rail: pillars marching toward the Tower, a deck with a cold light strip under it */
  { const pil = []; const deck = []; const under = [];
    for (let s = -300; s < 330; s += 24) { const [x, z] = toW(s, f.railT); if (Math.hypot(x, z) < 19) continue; pil.push({ x, z, w: 1.6, d: 1.6, h: f.railH }); }
    for (let s = -300; s < 330; s += 30) { const [x, z] = toW(s + 15, f.railT); deck.push({ x, z, w: 30.4, d: 8, h: 1.5, y: f.railH }); under.push({ x, z, w: 30, d: 0.25, h: 0.08, y: f.railH - 0.05 }); }
    const cm = dark(0x2a2c30, 0.9, 0.05);
    ownAdd(L, boxesMesh(pil, cm, { shadow: true }), 0.25); ownAdd(L, boxesMesh(deck, cm, { shadow: true }), 0.25);
    ownAdd(L, boxesMesh(under, glowMat(PAL.cyan, 1.4)), 0.25);
    for (const p of pil) if (Math.hypot(p.x, p.z) < 140) K.solid(ctx, p.x, p.z, 1.2, 'pillar');
    /* a train standing on the line, its windows lit */
    const [tx, tz] = toW(-70 - ctx.r() * 40, f.railT); const tm = towerMaterial({ color: 0x15181d, win: 1.3, strip: 0, seed: 0.21, key: '-train' });
    const train = new THREE.Mesh(new THREE.BoxGeometry(46, 3.4, 3.2), tm); train.geometry.translate(0, 1.7, 0); train.position.set(tx, f.railH + 1.5, tz); train.rotation.y = ROT; ownAdd(L, train, 0.4); }

  /* ---- tram wires over the boulevard and power lines on poles along the cross street */
  { const spans = [];
    for (let s = -220; s < 70; s += 15 + r() * 6) { const y = 7 + r() * 6; spans.push([[...pt(s, -f.av - 2, y)], [...pt(s + (r() - 0.5) * 6, f.av + 2, y + (r() - 0.5) * 2)], 0.4 + r() * 0.5]); }
    for (let s = -200; s < 60; s += 30) { spans.push([[...pt(s, -3, 6.2)], [...pt(s + 30, -3, 6.2)], 0.3, 0.015]); spans.push([[...pt(s, 3, 6.2)], [...pt(s + 30, 3, 6.2)], 0.3, 0.015]); }
    const poles = [];
    for (const side of [-1, 1]) for (let t = -200; t < 200; t += 26) { if (Math.abs(t) < f.av + 4) continue; const [x, z] = toW(side * (f.cross + 1), t); if (Math.hypot(x, z) < 18 || wedge(x, z)) continue; poles.push({ x, z, w: 0.3, d: 0.3, h: 9.5 }); }
    for (let i = 0; i < poles.length - 1; i++) { const a = poles[i]; const b = poles[i + 1]; if (Math.hypot(a.x - b.x, a.z - b.z) > 30) continue; for (const dy of [9.2, 8.6, 8.0]) spans.push([[a.x, dy, a.z], [b.x, dy, b.z], 0.8 + r() * 0.4, 0.018]); }
    /* a few loose lines from roof to roof across the side streets, high up */
    for (let i = 0; i < 18; i++) { const l1 = lots[Math.floor(r() * lots.length)]; if (!l1 || l1.dist > 120) continue; const l2 = lots.filter((l) => l !== l1 && Math.hypot(l.x - l1.x, l.z - l1.z) < 45).sort(() => r() - 0.5)[0]; if (!l2) continue;
      const ya = Math.min(l1.h, l2.h) - 1; spans.push([[l1.x, ya, l1.z], [l2.x, ya - r() * 3, l2.z], 2 + r() * 2, 0.03]); }
    const g = cableGeo(spans, r); if (g) { const m = new THREE.Mesh(g, dark(0x050506, 0.6, 0.3)); ownAdd(L, m, 0.3); }
    ownAdd(L, boxesMesh(poles, dark(0x1c1a18, 0.9, 0.1), { shadow: true }), 0.3); }

  /* ---- steam from the manholes and from vents low on the walls */
  { const vents = []; for (let i = 0; i < 40 && vents.length < 7; i++) { const s = (r() - 0.5) * 140; const t = (r() - 0.5) * 2 * (f.av - 2); const [x, z] = toW(s, t); const d = Math.hypot(x, z); if (d < 18 || d > 70) continue; vents.push([x, z]); }
    if (f.board) vents.push(toW(...toST(...f.board)));
    const lid = new THREE.CylinderGeometry(0.42, 0.42, 0.03, 14); const lm = dark(0x101012, 0.4, 0.8);
    const lids = new THREE.InstancedMesh(lid, lm, vents.length); vents.forEach(([x, z], i) => { _m.makeTranslation(x, 0.01, z); lids.setMatrixAt(i, _m); }); ownAdd(L, lids, 0.1);
    for (const [x, z] of vents.slice(0, 7)) K.addSmoke(L, [x, 0.1, z], { n: 14, size: 2.6, rise: 7, life: 7, wind: [0.25, 0, 0.12], low: 0x5a6670, high: 0x2a3036, hot: 0x081418, alpha: 0.42 }); }

  /* ---- the street: lane dashes down the boulevard, a crossing at the arena's edge, curbs */
  { const paint = []; for (let s = -260; s < 300; s += 9) { if (Math.abs(s) < 17) continue; const [x, z] = toW(s, 0); paint.push({ x, z, w: 3.2, d: 0.16, h: 0.012 }); for (const tt of [-6.5, 6.5]) { const [x2, z2] = toW(s + 3, tt); paint.push({ x: x2, z: z2, w: 2.4, d: 0.12, h: 0.012 }); } }
    for (const sgn of [-1, 1]) for (let t = -f.av + 1; t < f.av - 1; t += 1.1) { const [x, z] = toW(sgn * (f.cross + 1.5), t); paint.push({ x, z, w: 2.6, d: 0.5, h: 0.012 }); }
    ownAdd(L, boxesMesh(paint, dark(0x6a6c6c, 0.55, 0.0)), 0.05);
    const curbs = [];
    for (const side of [-1, 1]) for (let s = -300; s < 320; s += 2) { if (Math.abs(s + 1) < f.cross + 1.2) continue; const [x, z] = toW(s + 1, side * f.av); if (Math.hypot(x, z) < 17 || wedge(x, z, 0.05)) continue; curbs.push({ x, z, w: 2, d: 0.3, h: 0.16 }); }
    ownAdd(L, boxesMesh(curbs, dark(0x3a3c3e, 0.8)), 0.05); }

  /* ---- a checkpoint the city left: jersey barriers in a broken line, a few dumpsters and bags by the walls */
  { const bg = barrierGeo(); const bm = dark(0x55565a, 0.9, 0.0); const list = [];
    const ang0 = NEMESIS_ANG + Math.PI + (r() - 0.5) * 0.8;
    for (let i = 0; i < 9; i++) { const a = ang0 + (i - 4) * 0.13 + (r() - 0.5) * 0.04; const d = 19 + r() * 1.5; const [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; if (r() < 0.15) continue; list.push({ x, z, ry: -a + (r() - 0.5) * 0.25 }); K.solid(ctx, x, z, 0.9, 'barrier'); }
    for (let i = 0; i < 6; i++) { const a = r() * TAU; const d = 22 + r() * 30; const [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; if (wedge(x, z, 0.12)) continue; const ry = r() * TAU; list.push({ x, z, ry }); for (const o of [-0.8, 0.8]) K.solid(ctx, x + Math.cos(ry) * o, z - Math.sin(ry) * o, 0.9, 'barrier'); }
    barrierStripes(L, list.map((b) => [b.x, b.z, b.ry]));
    { const drains = []; const cracks = [];
      for (const side of [-1, 1]) for (let s = -150; s < 200; s += 23) { if (Math.abs(s) < f.cross + 2) continue; const [x, z] = toW(s, side * (f.av - 0.55)); drains.push([x, z, ROT]); }
      for (let i = 0; i < 46; i++) { const a = r() * TAU; const d = 4 + r() * 70; const [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; if (Math.abs(toST(x, z)[1]) > f.av - 0.5) continue; cracks.push([x, z, r() * TAU, 2 + r() * 4]); }
      streetDetail(L, drains, cracks); }
    const m = new THREE.InstancedMesh(bg, bm, list.length); list.forEach((b, i) => { _e.set(0, b.ry, 0); _q.setFromEuler(_e); _m.compose(_p.set(b.x, 0, b.z), _q, _s.set(1, 1, 1)); m.setMatrixAt(i, _m); }); m.castShadow = true; m.receiveShadow = true; ownAdd(L, m, 0.15);
    const dump = []; const dcol = []; const bags = [];
    for (const lot of lots) { if (lot.dist > 80 || r() < 0.55) continue; const faceT = Math.sign(lot.t) * -1; const [x, z] = toW(lot.s + (r() - 0.5) * lot.w * 0.7, lot.t + faceT * (lot.d / 2 + 2.2)); if (Math.hypot(x, z) < 18 || wedge(x, z, 0.12)) continue;
      dump.push({ x, z, w: 1.9, d: 1.2, h: 1.3 }); dcol.push([0x1c3a34, 0x23324a, 0x3a2420, 0x2a2c30][Math.floor(r() * 4)]); K.solid(ctx, x, z, 1.0, 'dumpster');
      for (let k = 0; k < 4; k++) bags.push([x + (r() - 0.5) * 3, z + (r() - 0.5) * 2.4, 0.35 + r() * 0.3]); }
    if (dump.length) { const dm = dark(0xffffff, 0.55, 0.4); ownAdd(L, boxesMesh(dump, dm, { shadow: true, colors: dcol }), 0.15); }
    if (bags.length) { const g = new THREE.IcosahedronGeometry(0.5, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-0.2, p.getY(i)) * 0.8); g.translate(0, 0.2, 0); g.computeVertexNormals();
      const m2 = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.25, metalness: 0.1, envMapIntensity: 0.6 }), bags.length); bags.forEach(([x, z, s], i) => { _e.set(0, r() * TAU, 0); _q.setFromEuler(_e); _m.compose(_p.set(x, 0, z), _q, _s.set(s, s, s)); m2.setMatrixAt(i, _m); }); ownAdd(L, m2, 0.15); } }

  /* ---- the light on the wet street */
  if (streaks.length) { const sm2 = streakMesh(streaks, 0.6); L.add(sm2, { grow: false }); ticker(L, (t) => { sm2.material.uniforms.uTime.value = t; }); }
  K.addFogSheets(ctx, L, [0.5, 1.8], { color: 0x24323c, alpha: 0.16, R: 70 });
  f.tower = buildTower(L);
}
const pt = (s, t, y) => { const [x, z] = toW(s, t); return [x, y, z]; };

/* ======================================================================================================== DRY DOCKS */
function dockLayout(ctx) {
  const { r, v } = ctx; const f = ctx.f;
  f.quay = [170, 180, 174][v] + r() * 6; /* the quay edge, metres toward the Tower: past the walk chapter's end (140 m) and its gate spot, so the walk never ends in the bay */
  f.level = -1.8;
  /* the dry dock: a pit off to one side, long axis along s */
  const side = v === 2 ? 1 : -1;
  f.dock = { s0: 0, s1: 0, t0: 0, t1: 0, depth: 0 }; /* no dry berth (its hull and deckhouse read as a box floating in the air) */
  f.craneT = [-(30 + r() * 6), 34 + r() * 8];
  f.seedK = r() * 40;
}
function dockHeight(ctx, x, z, rr) {
  const f = ctx.f; const [s, t] = toST(x, z); let h = 0;
  /* the sea floor past the quay */
  if (s > f.quay) h = -6 - smooth(f.quay, f.quay + 80, s) * 6;
  /* the far shore rises out of the bay */
  if (s > 250) h = Math.max(h, lerp(-12, 0.5, smooth(250, 275, s)));
  const D = f.dock; if (s > D.s0 && s < D.s1 && t > D.t0 && t < D.t1) { const e = Math.min(s - D.s0, D.s1 - s, t - D.t0, D.t1 - t); h = Math.min(h, -D.depth * smooth(0.4, 1.6, e)); }
  return h;
}
function dockMask(ctx, x, z, h, rr) {
  const f = ctx.f; const [s, t] = toST(x, z);
  /* oil and water stains (darker, glossy), crane rails in two dark bands along the quay */
  let st = smooth(0.44, 0.64, fbm(x * 0.07 + f.seedK, z * 0.07, 3)) * 0.75;
  st = Math.max(st, smooth(0.54, 0.7, fbm(x * 0.35 + 7.1, z * 0.35 - f.seedK, 2)) * 0.5); /* small puddles: soft edges, never black discs */
  st = Math.max(st, (1 - smooth(0.3, 0.9, Math.abs(s - (f.quay - 8)))) * 0.9, (1 - smooth(0.3, 0.9, Math.abs(s - (f.quay - 26)))) * 0.9);
  /* standing water round the arena (the near ground read as dry brown dirt): broad soft puddles that carry the lamps */
  const near = 1 - smooth(24, 46, Math.hypot(x, z));
  st = Math.max(st, smooth(0.4, 0.56, fbm(x * 0.11 - f.seedK, z * 0.11 + 3.3, 3)) * 0.9 * near);
  const lane = (1 - smooth(1.2, 1.6, Math.abs(((t % 26) + 26) % 26 - 13))) * 0.0;
  return [lane, clamp(st, 0, 1), 0, 0];
}
/* near-arena scale props at 20 to 28 m (outside the 17 m clear ring, off the Tower wedge): forklifts with a blinking
   amber beacon and a headlight pool on the wet ground, and stacks of pallets. Simple boxes, one instanced mesh per material. */
function forklifts(ctx, L, r, pools) {
  const body = []; const steel = []; const wood = []; const beacons = []; const heads = [];
  const put = (list, x, z, a, lx, lz, y, w, h, d) => { const c = Math.cos(a), sn = Math.sin(a); list.push({ x: x + c * lx + sn * lz, z: z - sn * lx + c * lz, y, w, h, d, ry: a }); };
  let n = 0;
  for (let i = 0; i < 40 && n < 2; i++) { const a = r() * TAU; const d = 21 + r() * 6; const x = Math.cos(a) * d; const z = Math.sin(a) * d; if (wedge(x, z, 0.32)) continue;
    /* the forks face the arena: local +x points at the centre */
    const yaw = Math.atan2(z, -x) + (r() - 0.5) * 0.8; n++;
    put(body, x, z, yaw, 0, 0, 0.25, 2.3, 1.0, 1.2); /* chassis */
    put(body, x, z, yaw, -0.95, 0, 0.25, 0.6, 1.25, 1.18); /* counterweight */
    put(steel, x, z, yaw, -0.2, 0, 2.2, 1.4, 0.06, 1.22); /* roof guard */
    for (const lx of [-0.85, 0.4]) for (const lz of [-0.55, 0.55]) put(steel, x, z, yaw, lx, lz, 1.25, 0.07, 0.97, 0.07); /* guard posts */
    put(steel, x, z, yaw, -0.3, 0, 1.25, 0.06, 0.65, 0.5); /* seat back */
    for (const lz of [-0.36, 0.36]) put(steel, x, z, yaw, 1.22, lz, 0.1, 0.12, 2.9, 0.12); /* mast rails */
    put(steel, x, z, yaw, 1.3, 0, 0.2, 0.08, 0.9, 0.9); /* carriage */
    for (const lz of [-0.3, 0.3]) put(steel, x, z, yaw, 1.95, lz, 0.2, 1.2, 0.05, 0.12); /* forks */
    for (const lz of [-0.55, 0.55]) for (const lx of [-0.75, 0.7]) put(steel, x, z, yaw, lx, lz, 0, 0.55, 0.55, 0.22); /* wheels */
    if (r() < 0.6) { put(wood, x, z, yaw, 1.95, 0, 0.25, 1.2, 0.14, 1.0); put(body, x, z, yaw, 1.95, 0, 0.39, 1.1, 0.9, 0.95); } /* a pallet with a crate on the forks */
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    beacons.push([x - c * 0.6, 2.42, z + sn * 0.6, 0.55]);
    for (const lz of [-0.45, 0.45]) heads.push([x + c * 0.5 + sn * lz, 1.2, z - sn * 0.5 + c * lz, 0.35]);
    pools.push({ x: x + c * 1.4, z: z - sn * 1.4, dir: Math.atan2(-z, -x), len: 12, w: 3.2, col: 0xe8f2ff, k: 0.22 });
    pools.push({ x, z, dir: 0, w: 6, col: PAL.amber, k: 0.1, kind: 1 });
    K.solid(ctx, x, z, 1.6, 'forklift'); }
  /* pallet stacks: 3 to 7 high, a few shrink-wrapped loads */
  for (let i = 0; i < 40 && wood.length < 60; i++) { const a = r() * TAU; const d = 19.5 + r() * 9; const x = Math.cos(a) * d; const z = Math.sin(a) * d; if (wedge(x, z, 0.3)) continue;
    const yaw = r() * TAU; const k = 3 + Math.floor(r() * 5);
    for (let j = 0; j < k; j++) put(wood, x, z, yaw + (r() - 0.5) * 0.08, 0, 0, j * 0.15, 1.2, 0.14, 1.0);
    if (r() < 0.5) put(body, x, z, yaw, 0, 0, k * 0.15, 1.15, 0.8 + r() * 0.5, 0.95);
    K.solid(ctx, x, z, 0.9, 'pallets'); }
  const yellow = new THREE.MeshStandardMaterial({ color: 0xc8901c, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.4 });
  if (body.length) ownAdd(L, boxesMesh(body, yellow, { shadow: true }), 0.15);
  if (steel.length) ownAdd(L, boxesMesh(steel, dark(0x1a1b1e, 0.5, 0.7), { shadow: true }), 0.15);
  if (wood.length) ownAdd(L, boxesMesh(wood, dark(0x6a5236, 0.9, 0.0), { shadow: true }), 0.15);
  const bg = K.addGlows(L, beacons, PAL.amber, { alpha: 1 }); if (bg) ticker(L, (t) => { bg.material.uniforms.uA.value = 0.3 + 0.9 * Math.pow(Math.max(0, Math.sin(t * 5.2)), 8); });
  K.addGlows(L, heads, 0xe8f2ff, { alpha: 0.9 });
}
async function dockBuild(ctx, L) {
  const f = ctx.f; const r = ctx.r; const land = L.current; POLES.length = 0;
  const box = boxMaterial({ key: '-dock' });
  /* ---- container stacks in blocks with lanes between: 40 ft and 20 ft boxes, 1 to 4 high, a share stacked crooked */
  const cont = []; const cols = [];
  const PAINT = [0x6a2418, 0x7a3a1c, 0x1e4a52, 0x24384e, 0x5a5a56, 0x8a6a2a, 0x2a3a2a, 0x4a1e2a, 0x3a3c40, 0x18303a];
  const blocks = [];
  for (let s = -170; s < f.quay - 34; s += 34) for (let t = -170; t < 170; t += 30) {
    if (r() < 0.18) continue;
    const bs0 = s + 2; const bt0 = t + 2.5; const nRow = 4 + Math.floor(r() * 4); const nCol = 2 + Math.floor(r() * 2);
    const corners = [[bs0, bt0], [bs0 + nCol * 12.6, bt0], [bs0, bt0 + nRow * 2.6], [bs0 + nCol * 12.6, bt0 + nRow * 2.6]].map(([a, b]) => toW(a, b));
    if (corners.some(([x, z]) => Math.hypot(x, z) < 19 || wedge(x, z, 0.24))) continue;
    const D = f.dock; if (bs0 < D.s1 + 6 && bs0 + nCol * 12.6 > D.s0 - 6 && bt0 < D.t1 + 6 && bt0 + nRow * 2.6 > D.t0 - 6) continue;
    blocks.push([bs0, bt0, nRow, nCol]);
    const tall = smooth(12, 70, Math.hypot(...toW(bs0, bt0)));
    for (let c = 0; c < nCol; c++) for (let rw = 0; rw < nRow; rw++) {
      const hgt = Math.max(1, Math.round(1 + r() * (1.5 + tall * 2.5))); const half = r() < 0.2;
      for (let k = 0; k < hgt; k++) {
        const ss = bs0 + c * 12.6 + 6.1 + (half && k === hgt - 1 ? -3.05 : 0) + (r() - 0.5) * (k ? 0.25 : 0.05); const tt = bt0 + rw * 2.6 + 1.22 + (r() - 0.5) * (k ? 0.2 : 0.02);
        const [x, z] = toW(ss, tt);
        cont.push({ x, z, y: k * 2.6, w: half && k === hgt - 1 ? 6.05 : 12.19, d: 2.44, h: 2.59, ry: ROT + (k ? (r() - 0.5) * 0.04 : 0) }); cols.push(PAINT[Math.floor(r() * PAINT.length)]);
      }
      /* the footprint covers the whole 12 m box (four circles along it), not a post at its middle */
      for (const ds of [-4.5, -1.5, 1.5, 4.5]) { const [cx, cz] = toW(bs0 + c * 12.6 + 6.1 + ds, bt0 + rw * 2.6 + 1.2); if (Math.hypot(cx, cz) < 190) K.solid(ctx, cx, cz, 1.5, 'container'); }
    }
  }
  /* a few lone boxes and a short stack near the arena edge for scale */
  /* centres 25 m out or more, so a 12 m box turned any way keeps its ends outside the arena + 2 m (17 m) */
  for (let i = 0; i < 10; i++) { const a = r() * TAU; const d = 25 + r() * 12; const [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; if (wedge(x, z, 0.28)) continue; const ry = r() * TAU; const n = r() < 0.4 ? 2 : 1; let w0 = 0;
    for (let k = 0; k < n; k++) { const w = r() < 0.5 ? 6.05 : 12.19; if (!k) w0 = w; cont.push({ x, z, y: k * 2.6, w, d: 2.44, h: 2.59, ry: ry + (r() - 0.5) * 0.1 }); cols.push(PAINT[Math.floor(r() * PAINT.length)]); }
    for (const o of w0 > 7 ? [-4.5, -1.5, 1.5, 4.5] : [-1.5, 1.5]) K.solid(ctx, x + Math.cos(ry) * o, z - Math.sin(ry) * o, 1.5, 'container'); }
  const near = cont.filter((c) => Math.hypot(c.x, c.z) < 90); const nearC = cols.filter((_, i) => Math.hypot(cont[i].x, cont[i].z) < 90);
  const farL = cont.filter((c) => Math.hypot(c.x, c.z) >= 90); const farC = cols.filter((_, i) => Math.hypot(cont[i].x, cont[i].z) >= 90);
  ownAdd(L, boxesMesh(near, box, { shadow: true, colors: nearC }), 0.15); if (farL.length) ownAdd(L, boxesMesh(farL, box, { colors: farC }), 0.3);

  /* ---- sheds behind (the land side): long low warehouses with lit doors */
  { const sheds = []; const scol = [];
    for (let i = 0; i < 9; i++) { const s = -150 - r() * 120; const t = (r() - 0.5) * 360; const [x, z] = toW(s, t); if (Math.hypot(x, z) < 60) continue; sheds.push({ x, z, w: 50 + r() * 40, d: 30 + r() * 20, h: 14 + r() * 12 }); scol.push(0x4a4c4e); }
    ownAdd(L, boxesMesh(sheds, box, { colors: scol }), 0.4);
    /* the city goes on behind the port: a lower skyline on the land side */
    ownAdd(L, boxesMesh(skylineList(r, { d0: 380, d1: 720, n: 90, hMin: 28, hMax: 150, skip: (x, z) => toST(x, z)[0] > -120 }), towerMaterial({ key: '-land', strip: 0.8 })), 0.5); }
  /* the port office warehouse at the land end of the
     main lane, with a lit rooftop sign facing the quay. Past the container field (s = -205), visual only, no solid. No rng draw. */
  { const [hx, hz] = toW(-205, 0); ownAdd(L, boxesMesh([{ x: hx, z: hz, w: 30, d: 80, h: 20 }], box, { colors: [0x3a3c40] }), 0.4);
    const sgT = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 320; const g = c.getContext('2d');
      g.fillStyle = '#05070a'; g.fillRect(0, 0, 1024, 320); g.strokeStyle = '#3ef2ff'; g.lineWidth = 10; g.strokeRect(14, 14, 996, 292);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff3aa0'; g.shadowBlur = 28; g.fillStyle = '#ff6ab8'; g.font = "900 150px 'Rajdhani', 'Arial Narrow', Arial, sans-serif"; g.fillText('DRY DOCK 9', 512, 140);
      g.shadowColor = '#3ef2ff'; g.shadowBlur = 16; g.fillStyle = '#7ef6ff'; g.font = "700 54px 'Rajdhani', 'Arial Narrow', Arial, sans-serif"; g.fillText('PORT OFFICE  ·  BERTHS 1-12', 512, 262); return c; })());
    sgT.colorSpace = THREE.SRGBColorSpace; sgT.anisotropy = 4;
    const sgM = new THREE.MeshBasicMaterial({ map: sgT, toneMapped: false, fog: false, color: 0xd0d0d0 });
    const [sx, sz] = toW(-189.6, 0); const sg = new THREE.Mesh(new THREE.PlaneGeometry(60, 18.75), sgM); sg.position.set(sx, 31, sz); sg.rotation.y = Math.atan2(AX, AZ);
    /* the frame the sign stands on: two posts down to the roof */
    const fr = new THREE.Mesh(mergeGeometries([-22, 0, 22].map((t) => { const [px, pz] = toW(-190.2, t); const q = new THREE.BoxGeometry(0.7, 12, 0.7); q.translate(px, 26, pz); return q; })), dark(0x1a1c20, 0.6, 0.6));
    land.owned.push(sgT, sgM, sg.geometry, fr.geometry, fr.material); ownAdd(L, sg, 0.5); ownAdd(L, fr, 0.5); }

  /* ---- the quay: a concrete edge, bollards, crane rails; the water; the far shore city and the Tower */
  { const edge = []; for (let t = -400; t < 400; t += 20) { const [x, z] = toW(f.quay + 0.6, t + 10); edge.push({ x, z, w: 1.4, d: 20.2, h: 6.5, y: -6.2 }); }
    ownAdd(L, boxesMesh(edge, dark(0x4a4a48, 0.9)), 0.1);
    const boll = []; for (let t = -200; t < 200; t += 14) { const [x, z] = toW(f.quay - 1, t); if (wedge(x, z, 0.03)) continue; boll.push([x, z]); }
    const bg = new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8); bg.translate(0, 0.35, 0); const bmesh = new THREE.InstancedMesh(bg, dark(0x1a1a1c, 0.5, 0.7), boll.length); boll.forEach(([x, z], i) => { _m.makeTranslation(x, 0, z); bmesh.setMatrixAt(i, _m); }); ownAdd(L, bmesh, 0.1);
    const rails = []; for (const ds of [-8, -26]) for (let t = -300; t < 300; t += 20) { const [x, z] = toW(f.quay + ds, t + 10); for (const o of [-0.35, 0.35]) { const [x2, z2] = [x + AX * o, z + AZ * o]; rails.push({ x: x2, z: z2, w: 0.12, d: 20, h: 0.06 }); } }
    ownAdd(L, boxesMesh(rails, dark(0x6a6a6e, 0.35, 0.9)), 0.05);
    K.addStillWater(ctx, L, { level: f.level, tint: 0x0a1418, deep: 0x020406, rip: 0.5, R: 700 });
    const shore = skylineList(r, { d0: 340, d1: 720, n: 120, hMin: 22, hMax: 150, skip: (x, z) => toST(x, z)[0] < 300 });
    ownAdd(L, boxesMesh(shore, towerMaterial({ key: '-shore', strip: 1.2 })), 0.5);
    const avi = shore.filter((b) => b.h > 130).map((b) => [b.x, b.h + 2, b.z, 7]); K.addGlows(L, avi, 0xff2020, { alpha: 0.9 });
    /* the far shore's light on the black water: long streaks across the bay */
    const streaks = []; for (const b of shore) { const [s] = toST(b.x, b.z); if (r() < 0.4 || s > 520) continue; const [gx, gz] = toW(lerp(f.quay + 20, s - 10, 0.92), toST(b.x, b.z)[1]); streaks.push({ x: gx, z: gz, dir: Math.atan2(-gz, -gx), len: 60 + r() * 60, w: 3 + r() * 5, col: [0xffb070, 0x9fd8ff, PAL.cyan, PAL.amber][Math.floor(r() * 4)], k: 0.22, y: f.level + 0.05 }); }
    const [tx, tz] = toW(TOWER_S - 30, 0); streaks.push({ x: tx, z: tz, dir: Math.atan2(-tz, -tx), len: 200, w: 10, col: PAL.red, k: 0.35, y: f.level + 0.05 });
    f.streaks = streaks; }

  /* ---- the quay edge: a line of amber marker lights and their smears on the water; painted lanes between the stacks */
  { const marks = []; for (let t = -260; t < 260; t += 11) { const [x, z] = toW(f.quay - 0.4, t); if (wedge(x, z, 0.02)) continue; marks.push([x, 0.35, z, 1.6]); }
    K.addGlows(L, marks, 0xffa040, { alpha: 0.9 });
    const paint = [];
    for (let t = -150; t <= 150; t += 30) for (let s = -170; s < f.quay - 6; s += 6) { const [x, z] = toW(s + 2, t + 1); if (Math.hypot(x, z) > 200) continue; paint.push({ x, z, w: 4, d: 0.18, h: 0.012 }); }
    /* a painted container bay through the arena (flat paint, no solids): two long edge lines and a hatched keep-clear box */
    for (const tt of [-7, 7]) for (let s = -40; s < 40; s += 2.2) { const [x, z] = toW(s, tt); if (r() < 0.12) continue; paint.push({ x, z, w: 1.9, d: 0.2, h: 0.012 }); }
    { const hs = 9 + r() * 4; const ht = (r() < 0.5 ? -1 : 1) * 3.5; for (let k = -4; k <= 4; k++) { const [x, z] = toW(hs + k * 0.9, ht); paint.push({ x, z, w: 0.22, d: 4.2, h: 0.012, ry: ROT + 0.7 }); }
      for (const o of [-2.1, 2.1]) { const [x, z] = toW(hs, ht + o); paint.push({ x, z, w: 8.2, d: 0.2, h: 0.012 }); } for (const o of [-4.1, 4.1]) { const [x, z] = toW(hs + o, ht); paint.push({ x, z, w: 0.2, d: 4.4, h: 0.012 }); } }
    for (let t = -240; t < 240; t += 1.2) { const [x, z] = toW(f.quay - 3, t); if (Math.hypot(x, z) > 260) continue; paint.push({ x, z, w: 0.18, d: 0.6, h: 0.012, ry: ROT + 0.6 }); }
    ownAdd(L, boxesMesh(paint, dark(0x5e5230, 0.8)), 0.05); /* worn paint (the clean yellow read as a highway) */ }
  /* ---- the two gantry cranes on the quay, booms out over the water */
  const craneMat = dark(0x2c2e32, 0.6, 0.55); const craneGeos = [];
  const reds = []; const floods = []; const rays = []; const boomL = []; const cabL = [];
  for (const ct of f.craneT) {
    const sB = f.quay - 17; const parts = [];
    const add = (s, t, y, w, d, h) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); g.rotateY(ROT); const [x, z] = toW(s, t); g.translate(x, y, z); parts.push(g.toNonIndexed()); g.dispose(); };
    /* four legs, the portal, the boom (out over the water) and the back reach, a machinery house, the A-frame and stays */
    for (const ds of [-9, 9]) for (const dt of [-8, 8]) add(sB + ds, ct + dt, 0, 1.6, 1.6, 42);
    for (const ds of [-9, 9]) add(sB + ds, ct, 40, 2.2, 18, 2.4);
    for (const dt of [-8, 8]) add(sB, ct + dt, 40, 20, 2.2, 2.4);
    for (const dt of [-8, 8]) add(sB, ct + dt, 12, 20, 1.2, 1.2);
    add(sB + 18, ct, 44, 74, 4, 3.2); add(sB - 22, ct, 44, 26, 5, 3.2);
    add(sB - 28, ct, 37, 8, 6, 7); /* counterweight */
    add(sB - 4, ct, 47, 10, 5, 5); /* machinery house */
    for (const dt of [-2, 2]) add(sB - 2, ct + dt, 47, 1.2, 1.2, 22);
    { /* stays from the A-frame to the boom tip: thin slanted boxes */
      const top = new THREE.Vector3(...pt(sB - 2, ct, 69)); for (const tip of [pt(sB + 54, ct, 47), pt(sB - 34, ct, 47), pt(sB + 26, ct, 47)]) { const a = new THREE.Vector3(...tip); const len = a.distanceTo(top); const g = new THREE.CylinderGeometry(0.25, 0.25, len, 4); g.translate(0, len / 2, 0); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(a).normalize()); g.applyQuaternion(q); g.translate(a.x, a.y, a.z); parts.push(g.toNonIndexed()); g.dispose(); } }
    /* the trolley and its spreader hanging over the quay */
    add(sB + 10, ct, 41.5, 6, 6, 2.4);
    { const g = new THREE.BoxGeometry(12.4, 1.0, 2.6); g.rotateY(ROT); const [x, z] = toW(sB + 10, ct); g.translate(x, 22, z); parts.push(g.toNonIndexed()); g.dispose(); }
    craneGeos.push(mergeGeometries(parts)); for (const p of parts) p.dispose();
    for (const ds of [-9, 9]) for (const dt of [-8, 8]) K.solid(ctx, ...toW(sB + ds, ct + dt), 1.3, 'crane');
    for (const p of [pt(sB + 54, ct, 48), pt(sB - 4, ct, 70), pt(sB - 34, ct, 48), pt(sB - 2, ct, 70)]) reds.push([p[0], p[1], p[2], 3.2]);
    for (const ds of [-9, 9]) { const p = pt(sB + ds, ct, 39); floods.push([p[0], p[1], p[2], 7]); rays.push({ foot: p, dir: [0, -1, 0], len: 39, w0: 1.2, w1: 14, k: 1 }); }
    for (let ds = -30; ds <= 54; ds += 7) { const p = pt(sB + ds, ct, 43.6); boomL.push([p[0], p[1], p[2], 1.4]); }
    for (const dt of [-8, 8]) for (const ds of [-9, 0, 9]) { const p = pt(sB + ds, ct + dt, 39.6); boomL.push([p[0], p[1], p[2], 1.2]); }
    { const p = pt(sB - 4, ct, 49.5); cabL.push([p[0], p[1], p[2], 3.0]); }
  }
  for (const g of craneGeos) { const m = new THREE.Mesh(g, craneMat); m.castShadow = true; ownAdd(L, m, 0.45); }
  /* a cable from each trolley down to the spreader */
  { const spans = []; for (const ct of f.craneT) for (const o of [-1.2, 1.2]) spans.push([pt(f.quay - 7, ct + o, 41.5), pt(f.quay - 7, ct + o, 23), 0.01, 0.04]); const g = cableGeo(spans); if (g) ownAdd(L, new THREE.Mesh(g, dark(0x0a0a0a, 0.5, 0.6)), 0.45); }
  K.addGlows(L, boomL, 0xe8f6ff, { alpha: 0.95 }); K.addGlows(L, cabL, 0x3ef2ff, { alpha: 0.8 });
  const redG = K.addGlows(L, reds, 0xff2020, { alpha: 1 }); if (redG) ticker(L, (t) => { redG.material.uniforms.uA.value = 0.25 + 0.9 * Math.pow(Math.max(0, Math.sin(t * 2.1)), 6); });

  /* ---- sodium masts: a ring of lamps on a 24 m pole, a cone of light and a lit pool on the concrete */
  const masts = []; const lampsG = []; const pools = [];
  for (let i = 0; i < 40 && masts.length < 9; i++) { const a = r() * TAU; const d = 28 + r() * 80; const [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; const [s] = toST(x, z); if (wedge(x, z, 0.24) || s > f.quay - 4 || masts.some(([mx, mz]) => Math.hypot(mx - x, mz - z) < 30)) continue;
    const D = f.dock; const [ss, tt] = toST(x, z); if (ss > D.s0 - 3 && ss < D.s1 + 3 && tt > D.t0 - 3 && tt < D.t1 + 3) continue;
    masts.push([x, z]); K.solid(ctx, x, z, 0.5, 'mast');
    for (let k = 0; k < 4; k++) { const aa = k * Math.PI / 2 + 0.4; lampsG.push([x + Math.cos(aa) * 1.1, 24.2, z + Math.sin(aa) * 1.1, 4.5]); }
    rays.push({ foot: [x, 24, z], dir: [0, -1, 0], len: 24, w0: 1.5, w1: 17, k: 1 });
    pools.push({ x, z, dir: 0, w: 26, col: PAL.sodium, k: 0.18, kind: 1 }); }
  { const g = new THREE.CylinderGeometry(0.22, 0.4, 24, 8); g.translate(0, 12, 0); const head = new THREE.CylinderGeometry(1.6, 1.6, 0.6, 10); head.translate(0, 24.2, 0);
    const pm = new THREE.InstancedMesh(mergeGeometries([g.toNonIndexed(), head.toNonIndexed()]), dark(0x222326, 0.6, 0.6), masts.length); masts.forEach(([x, z], i) => { _m.makeTranslation(x, 0, z); pm.setMatrixAt(i, _m); }); pm.castShadow = true; ownAdd(L, pm, 0.3); g.dispose(); head.dispose(); }
  K.addGlows(L, lampsG, PAL.sodium, { alpha: 0.95 }); K.addGlows(L, floods, 0xffc890, { alpha: 0.7 });
  K.addRays(L, rays, 0xffa860, { alpha: 0.045, ends: [0.04, 0.85] });

  /* ---- near the arena: jersey barriers in short broken runs, a reefer power tower with blinking lights, a light pole with
     a cold head; the lamps' light runs across the wet concrete toward the viewer */
  { const bg = barrierGeo(); const bm = dark(0x5a5b5e, 0.85, 0.0); const list = [];
    for (let i = 0; i < 14; i++) { const a = r() * TAU; const d = 21 + r() * 16; const x = Math.cos(a) * d; const z = Math.sin(a) * d; if (wedge(x, z, 0.3)) continue; const ry = a + Math.PI / 2 + (r() - 0.5) * 0.5; const n = 1 + Math.floor(r() * 3);
      /* a run with any piece closer than 19 m (arena 15 m + 2 m + half a barrier) is left out */
      const run = []; for (let k = 0; k < n; k++) { const off = (k - (n - 1) / 2) * 3.1; run.push([x, z, ry, off]); } if (run.some(([px, pz, pry, off]) => Math.hypot(px + Math.sin(pry) * off, pz + Math.cos(pry) * off) < 19)) continue; list.push(...run); }
    const bmesh = new THREE.InstancedMesh(bg, bm, list.length); list.forEach(([x, z, ry, off], i) => { const ox = x + Math.sin(ry) * off; const oz = z + Math.cos(ry) * off; _e.set(0, ry, 0); _q.setFromEuler(_e); _m.compose(_p.set(ox, 0, oz), _q, _s.set(1, 1, 1)); bmesh.setMatrixAt(i, _m); for (const o of [-0.8, 0.8]) K.solid(ctx, ox + Math.cos(ry) * o, oz - Math.sin(ry) * o, 0.9, 'barrier'); }); bmesh.castShadow = true; bmesh.receiveShadow = true; ownAdd(L, bmesh, 0.1);
    barrierStripes(L, list.map(([x, z, ry, off]) => [x + Math.sin(ry) * off, z + Math.cos(ry) * off, ry]));
    const towers = []; const blinks = []; const cold = []; const coldRays = [];
    for (let i = 0; i < 30 && towers.length < 3; i++) { const a = r() * TAU; const d = 24 + r() * 20; const x = Math.cos(a) * d; const z = Math.sin(a) * d; if (wedge(x, z, 0.3) || towers.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 18)) continue; towers.push([x, z, a]); K.solid(ctx, x, z, 1.2, 'reefer');
      for (let k = 0; k < 4; k++) blinks.push([x + Math.cos(a + Math.PI) * 0.62, 1.2 + k * 1.3, z + Math.sin(a + Math.PI) * 0.62, 0.35]); }
    const tg = new THREE.BoxGeometry(1.2, 6.2, 1.2); tg.translate(0, 3.1, 0); const tm = new THREE.InstancedMesh(tg, boxMaterial({ key: '-reefer' }), towers.length); towers.forEach(([x, z, a], i) => { _e.set(0, a, 0); _q.setFromEuler(_e); _m.compose(_p.set(x, 0, z), _q, _s.set(1, 1, 1)); tm.setMatrixAt(i, _m); tm.setColorAt(i, _c.set(0x3a4044)); }); tm.castShadow = true; ownAdd(L, tm, 0.15);
    const bl = K.addGlows(L, blinks, 0x3ef2ff, { alpha: 0.9 }); if (bl) ticker(L, (t) => { bl.material.uniforms.uA.value = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 3.3)), 4); });
    for (let i = 0; i < 30 && cold.length < 4; i++) { const a = r() * TAU; const d = 19 + r() * 14; const x = Math.cos(a) * d; const z = Math.sin(a) * d; if (wedge(x, z, 0.32) || cold.some(([cx, , cz]) => Math.hypot(cx - x, cz - z) < 14)) continue; cold.push([x, 7.3, z, 2.2]); coldRays.push({ foot: [x, 7.2, z], dir: [0, -1, 0], len: 7.2, w0: 0.5, w1: 6, k: 0.8 }); K.solid(ctx, x, z, 0.4, 'lamp');
      pools.push({ x, z, dir: 0, w: 7, col: 0x9fc8ee, k: 0.08, kind: 1 }); pools.push({ x, z, dir: Math.atan2(-z, -x), len: 14, w: 1.8, col: 0x9fc8ee, k: 0.12 }); }
    const lg = new THREE.CylinderGeometry(0.08, 0.12, 7.4, 7); lg.translate(0, 3.7, 0); const lm = new THREE.InstancedMesh(lg, dark(0x1c1d20, 0.6, 0.6), cold.length); cold.forEach(([x, , z], i) => { _m.makeTranslation(x, 0, z); lm.setMatrixAt(i, _m); }); ownAdd(L, lm, 0.15);
    const cg = K.addGlows(L, cold, 0xd8f0ff, { alpha: 0.9 }); const cr = K.addRays(L, coldRays, 0xbfe8ff, { alpha: 0.022, ends: [0.04, 0.85] }); /* faint: a strong ray read as a white sheet on the ground */
    cold.forEach(([x, , z], i) => { const p = pole(x, z, 7.4); p.inst.push([lm, i]); if (cg) p.glow.push([cg, i]); if (cr) p.ray.push([cr, i]); }); /* the Tower knocks them down */
    /* the sodium masts' light runs across the wet concrete toward the viewer, and the cranes' floods too */
    for (const [x, z] of masts) pools.push({ x, z, dir: Math.atan2(-z, -x), len: 36, w: 4, col: PAL.sodium, k: 0.2 }); }

  /* ---- a holo board on a stack near the quay and signs on the far shore */
  { const signs = [];
    const bl = blocks.filter(([s, t]) => Math.hypot(...toW(s, t)) > 40 && Math.hypot(...toW(s, t)) < 100)[0];
    if (bl) { const [s, t] = bl; const [x, z] = toW(s - 0.3, t + bl[2] * 1.3); signs.push({ x, y: 12, z, ry: ROT + Math.PI / 2, w: 16, h: 6, col: PAL.cyan, kind: 1, cols: 16, rows: 6 }); }
    for (let i = 0; i < 26; i++) { const a = NEMESIS_ANG + (r() - 0.5) * 1.6; const d = 290 + r() * 120; const [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; if (toST(x, z)[0] < 272) continue; const blade = r() < 0.5;
      signs.push({ x, y: 8 + r() * 40, z, ry: ROT + Math.PI / 2 + (blade ? Math.PI / 2 : 0), w: blade ? 4 : 18, h: blade ? 18 : 6, col: SIGN_COLS[Math.floor(r() * SIGN_COLS.length)], kind: 0, cols: blade ? 1 : 8, rows: blade ? 6 : 2 }); }
    const sm = signMaterial(2.6); L.add(signMesh(signs, sm), { grow: false }); ticker(L, (t) => { sm.uniforms.uTime.value = t; }); }

  /* ---- fences, drums and pallets at the stack ends; dust in the lamp light */
  { const drums = []; const dc = [];
    for (let i = 0; i < 40; i++) { const a = r() * TAU; const d = 20 + r() * 50; const [x, z] = [Math.cos(a) * d, Math.sin(a) * d]; if (wedge(x, z, 0.2)) continue; const n = 1 + Math.floor(r() * 4); K.solid(ctx, x, z, 1.3, 'drums'); for (let k = 0; k < n; k++) { drums.push([x + (r() - 0.5) * 1.6, z + (r() - 0.5) * 1.6]); dc.push([0x3a1e18, 0x1e3a4a, 0x4a4a1e, 0x202022][Math.floor(r() * 4)]); } }
    const g = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12); g.translate(0, 0.44, 0); const m = new THREE.InstancedMesh(g, drumMaterial(), drums.length); drums.forEach(([x, z], i) => { _m.makeTranslation(x, 0, z); m.setMatrixAt(i, _m); m.setColorAt(i, _c.set(dc[i])); }); m.castShadow = true; ownAdd(L, m, 0.15);
    const fence = []; for (let i = 0; i < 14; i++) { const t = (i - 7) * 5.2; const [x, z] = toW(-26, t); if (Math.hypot(x, z) < 18 || i === 7 || i === 8) continue; /* a gate gap at t -2.6..7.8 */ fence.push({ x, z, w: 0.06, d: 5, h: 2.6 }); for (const o of [-1.9, -0.6, 0.6, 1.9]) K.solid(ctx, ...toW(-26, t + o), 0.7, 'fence'); }
    const ft = K.canvasTex('neon-fence', 64, 64, (g2, w, h) => { g2.fillStyle = '#000'; g2.fillRect(0, 0, w, h); g2.strokeStyle = '#fff'; g2.lineWidth = 2; for (let k = -64; k < 128; k += 10) { g2.beginPath(); g2.moveTo(k, 0); g2.lineTo(k + 64, 64); g2.stroke(); g2.beginPath(); g2.moveTo(k + 64, 0); g2.lineTo(k, 64); g2.stroke(); } });
    ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(3, 1.5);
    const fm = new THREE.MeshStandardMaterial({ color: 0x34373c, metalness: 0.6, roughness: 0.62, /* darker: the pale mesh read as a flat white sheet */ alphaMap: ft, alphaTest: 0.5, side: THREE.DoubleSide });
    if (fence.length) ownAdd(L, boxesMesh(fence, fm), 0.15); }
  /* ---- the reverse view (the land side) was a flat fence under dark blocks. Now: posts, rails and leaning wire on the
     fence; a gate with a lit guard booth and a striped boom whose red tip lamp is the source of the red smear on the wet
     concrete; behind, a port control tower with a lit glass cab, a blinking red beacon and a tall magenta sign */
  { const steel = dark(0x2a2c30, 0.5, 0.8); const rail = []; const tint = [];
    for (let i = 0; i < 14; i++) { if (i === 7 || i === 8) continue; const t = (i - 7) * 5.2; const [cx, cz] = toW(-26, t); if (Math.hypot(cx, cz) < 18) continue;
      for (const o of [-2.55, 2.55]) { const [x, z] = toW(-26, t + o); rail.push({ x, z, w: 0.12, d: 0.12, h: 3.05 }); }
      rail.push({ x: cx, z: cz, y: 2.58, w: 0.07, d: 5.1, h: 0.07 }); rail.push({ x: cx, z: cz, y: 0.08, w: 0.05, d: 5.1, h: 0.05 });
      for (const [ds, y] of [[-0.14, 2.82], [-0.28, 3.0]]) { const [x, z] = toW(-26 + ds, t); rail.push({ x, z, y, w: 0.02, d: 5.1, h: 0.02 }); } }
    ownAdd(L, boxesMesh(rail, steel), 0.15);
    /* the guard booth at the gate's far post: a cabin with a lit window band all round, a roof slab and a lit sign */
    const BS = -26.6, BT = 6.3; const [bx, bz] = toW(BS, BT);
    ownAdd(L, boxesMesh([{ x: bx, z: bz, w: 2.4, d: 2.6, h: 2.75 }, { x: bx, z: bz, y: 2.75, w: 3.0, d: 3.2, h: 0.2 }], dark(0x3e4146, 0.6, 0.4)), 0.15);
    ownAdd(L, boxesMesh([{ x: bx, z: bz, y: 1.15, w: 2.44, d: 2.2, h: 0.8 }, { x: bx, z: bz, y: 1.15, w: 1.9, d: 2.64, h: 0.8 }], glowMat(0x7fe8ff, 1.7)), 0.15);
    K.solid(ctx, bx, bz, 1.8, 'booth');
    pools.push({ x: bx + AX * 1.6, z: bz + AZ * 1.6, dir: Math.atan2(-bz, -bx), len: 10, w: 2.4, col: PAL.cyan, k: 0.2 });
    /* the boom across the gap: red and white pieces, a post, a red lamp at the tip */
    const boom = []; const bcol = []; const B0 = BT - 1.5, B1 = -2.3; const nB = 8;
    for (let k = 0; k < nB; k++) { const t = B0 + (B1 - B0) * (k + 0.5) / nB; const [x, z] = toW(-25.4, t); boom.push({ x, z, y: 0.98, w: 0.09, d: Math.abs(B1 - B0) / nB, h: 0.12 }); bcol.push(k % 2 ? 0xd8dadc : 0xb01818); }
    ownAdd(L, boxesMesh(boom, dark(0xffffff, 0.5, 0.1), { colors: bcol }), 0.15);
    { const [x, z] = toW(-25.4, B0 + 0.15); ownAdd(L, boxesMesh([{ x, z, w: 0.36, d: 0.36, h: 1.15 }], dark(0x8a6a2a, 0.6, 0.3)), 0.15); K.solid(ctx, x, z, 0.4, 'boom'); }
    { const [x, z] = toW(-25.4, B1); const tip = K.addGlows(L, [[x, 1.0, z, 0.9]], 0xff2a30, { alpha: 1 }); if (tip) ticker(L, (t) => { tip.material.uniforms.uA.value = 0.45 + 0.55 * Math.pow(Math.max(0, Math.sin(t * 3.0)), 2); });
      pools.push({ x: x + AX * 0.8, z: z + AZ * 0.8, dir: Math.atan2(-z, -x), len: 9, w: 0.9, col: PAL.red, k: 0.22 }); }
    /* the port control tower: a clear spot on the land side, 110 to 170 m out (whole in the frame), off the gate line so it stands clear above the stacks */
    const hit = (ss, tt, pad) => blocks.some(([b0, c0, nRow, nCol]) => ss > b0 - pad && ss < b0 + nCol * 12.6 + pad && tt > c0 - pad && tt < c0 + nRow * 2.6 + pad);
    let spot = null; for (const tt of [-16, -22, -10, -28, 16, 22]) { for (let ss = -110; ss > -170; ss -= 6) if (!hit(ss, tt, 4)) { spot = [ss, tt]; break; } if (spot) break; }
    if (spot) { const [TS, TT] = spot; const [tx, tz] = toW(TS, TT); const conc = dark(0x4a4c50, 0.85, 0.1);
      ownAdd(L, boxesMesh([{ x: tx, z: tz, w: 4.2, d: 4.2, h: 38 }, { x: tx, z: tz, y: 36.4, w: 9, d: 9, h: 1.0 }, { x: tx, z: tz, y: 41.8, w: 10, d: 10, h: 0.7 },
        { x: tx, z: tz, y: 42.5, w: 0.35, d: 0.35, h: 9 }], conc, { shadow: false }), 0.4);
      ownAdd(L, boxesMesh([{ x: tx, z: tz, y: 37.4, w: 8.6, d: 8.6, h: 4.4 }], new THREE.MeshStandardMaterial({ color: 0x0c1a20, emissive: 0x2a9ab0, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.5 })), 0.4);
      ownAdd(L, boxesMesh([{ x: tx, z: tz, y: 37.2, w: 8.8, d: 8.8, h: 0.14 }], glowMat(0x7fe8ff, 2.2)), 0.4);
      K.solid(ctx, tx, tz, 3.4, 'tower');
      const bea = K.addGlows(L, [[tx, 51.8, tz, 4.5]], 0xff2020, { alpha: 1 }); if (bea) ticker(L, (t) => { bea.material.uniforms.uA.value = 0.2 + 0.95 * Math.pow(Math.max(0, Math.sin(t * 1.7 + 1.1)), 8); });
      const cabG = []; for (let k = 0; k < 4; k++) { const a = ROT + k * Math.PI / 2; cabG.push([tx + Math.cos(a) * 4.6, 39.6, tz - Math.sin(a) * 4.6, 2.2]); } K.addGlows(L, cabG, 0x7fe8ff, { alpha: 0.5 });
      const sm4 = signMaterial(2.8); const ry = Math.atan2(AX, AZ);
      L.add(signMesh([{ x: tx + AX * 2.2, y: 20, z: tz + AZ * 2.2, ry, w: 2.6, h: 20, col: PAL.magenta, kind: 0, cols: 1, rows: 7 },
        { x: tx + AX * 4.62, y: 34.2, z: tz + AZ * 4.62, ry, w: 8.4, h: 2.2, col: PAL.amber, kind: 0, cols: 6, rows: 1 }], sm4), { grow: false }); ticker(L, (t) => { sm4.uniforms.uTime.value = t; }); } }
  { const drains = []; const cracks = [];
    for (let i = 0; i < 30; i++) { const a = r() * TAU; const d = 8 + r() * 60; drains.push([Math.cos(a) * d, Math.sin(a) * d, ROT + (r() < 0.5 ? 0 : Math.PI / 2)]); }
    for (let i = 0; i < 50; i++) { const a = r() * TAU; const d = 3 + r() * 70; cracks.push([Math.cos(a) * d, Math.sin(a) * d, r() * TAU, 2 + r() * 5]); }
    streetDetail(L, drains, cracks); }
  /* ---- the yard near the arena lit like the rain district: holo boards and LED strips on the stack faces that look
     at the arena, reefer status lights on the box ends, their colour running across the wet concrete, steam from the
     reefer vents; every piece sits on a stack (no floating sign, nothing inside 19 m) */
  { const boards = []; const strips = []; const leds = []; const vents = []; const near2 = [];
    const COLS = [PAL.cyan, PAL.magenta, PAL.amber, PAL.cyan, PAL.red, PAL.white];
    for (const [bs0, bt0, nRow, nCol] of blocks) {
      const s0 = bs0, s1 = bs0 + nCol * 12.6, t0 = bt0, t1 = bt0 + nRow * 2.6;
      const cs = clamp(0, s0, s1); const ct = clamp(0, t0, t1); const [px, pz] = toW(cs, ct); const d = Math.hypot(px, pz);
      if (d < 21 || d > 95 || wedge(px, pz, 0.26)) continue;
      /* the face toward the arena: s face or t face, whichever the arena lies beyond */
      const onS = cs === s0 || cs === s1; const sn = cs === s0 ? -1 : 1; const tn = ct === t0 ? -1 : 1;
      const fx = onS ? AX * sn : BX * tn; const fz = onS ? AZ * sn : BZ * tn; const ry = Math.atan2(fx, fz);
      const len = onS ? t1 - t0 : s1 - s0; const ms = onS ? cs : (s0 + s1) / 2; const mt = onS ? (t0 + t1) / 2 : ct;
      const [mx, mz] = toW(ms, mt); const ox = mx + fx * 0.08; const oz = mz + fz * 0.08;
      near2.push([ox, oz, ry, len, fx, fz]);
      const col = COLS[Math.floor(r() * COLS.length)];
      { const w = Math.min(len - 1, 6 + r() * 5); boards.push({ x: ox, y: 1.3, z: oz, ry, w, h: 2.1, col, kind: r() < 0.25 ? 1 : 0, cols: Math.max(2, Math.round(w / 0.9)), rows: 2 }); }
      /* an LED strip under the top of the first tier, along the whole face, and its light on the ground */
      strips.push({ x: ox + fx * 0.02, z: oz + fz * 0.02, y: 2.46, w: len * 0.96, d: 0.06, h: 0.12, ry, col: r() < 0.5 ? PAL.cyan : PAL.amber });
      pools.push({ x: ox + fx * 1.2, z: oz + fz * 1.2, dir: Math.atan2(-oz, -ox), len: 14 + r() * 10, w: Math.min(len, 9), col: strips[strips.length - 1].col, k: 0.26 });
      pools.push({ x: ox + fx * 1.5, z: oz + fz * 1.5, dir: Math.atan2(-oz, -ox), len: 18, w: 4, col, k: 0.26 }); pools.push({ x: ox + fx * 2, z: oz + fz * 2, dir: 0, w: Math.min(len, 10), col, k: 0.1, kind: 1 });
      /* reefer status LEDs on the box ends (a column of small lights) and a vent */
      for (let k = 0; k < 3; k++) leds.push([ox + fx * 0.05 + (onS ? BX : AX) * (len * 0.4 - k * 0.3), 0.6 + r() * 1.5, oz + fz * 0.05 + (onS ? BZ : AZ) * (len * 0.4 - k * 0.3), 0.22]);
      if (vents.length < 5 && r() < 0.5) vents.push([ox + fx * 0.6, oz + fz * 0.6]);
    }
    if (boards.length) { const sm3 = signMaterial(3.2); L.add(signMesh(boards, sm3), { grow: false }); ticker(L, (t) => { sm3.uniforms.uTime.value = t; }); }
    if (strips.length) { const byCol = new Map(); for (const st of strips) { if (!byCol.has(st.col)) byCol.set(st.col, []); byCol.get(st.col).push(st); } for (const [c, list] of byCol) ownAdd(L, boxesMesh(list, glowMat(c, 2.4)), 0.2); }
    const lg = K.addGlows(L, leds, 0xff3a30, { alpha: 0.9 }); if (lg) ticker(L, (t) => { lg.material.uniforms.uA.value = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(t * 2.4)), 3); });
    for (const [x, z] of vents) K.addSmoke(L, [x, 0.1, z], { n: 12, size: 2.4, rise: 6, life: 6, wind: [0.25, 0, 0.12], low: 0x5a6670, high: 0x2a3036, hot: 0x081418, alpha: 0.36 });
    /* a wet sheen right round the arena: broad, faint light pools from the near masts so the concrete reads wet, not grey */
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + r() * 0.3; const d = 9 + r() * 8; const x = Math.cos(a) * d; const z = Math.sin(a) * d; pools.push({ x, z, dir: Math.atan2(-z, -x), len: 9 + r() * 6, w: 2.5 + r() * 2, col: [PAL.sodium, PAL.cyan, 0x9fc8ee][i % 3], k: 0.11 }); }
    /* neon smears in the near puddles, both ways round the arena, so the ground under the camera carries colour */
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + r() * 0.4; const d = 3 + r() * 9; const x = Math.cos(a) * d; const z = Math.sin(a) * d; pools.push({ x, z, dir: a + (r() - 0.5) * 0.6, len: 5 + r() * 6, w: 0.8 + r() * 1.2, col: [PAL.cyan, PAL.magenta, PAL.amber, 0x9fc8ee][i % 4], k: 0.16 }); } /* no red here: a red smear with no red light near read as a fault */
    forklifts(ctx, L, r, pools);
  }
  if (pools.length || f.streaks.length) { const sm2 = streakMesh([...pools, ...f.streaks], 0.7); L.add(sm2, { grow: false }); ticker(L, (t) => { sm2.material.uniforms.uTime.value = t; }); }
  K.addFogSheets(ctx, L, [0.8, 3.0], { color: 0x1c2832, alpha: 0.12, R: 90 });
  f.tower = buildTower(L);
}

/* ======================================================================================================== the looks */
export const lands = {
  rainline: {
    variants: 3, desat: 0.2, groundTint: 0x16181c, fog: [12, 150], hemi: 0.75, sun: 0.55, sunOffset: [10, 22, 14], exposure: 1.0, fogCol: 0x0e1820, skyCols: [0x04060a, 0x1a2230],
    /* low overcast lit from below by the city: sodium-pink at the horizon, near-black overhead, no moon */
    sky: { sunDir: [-0.6, 0.15, -1], sunCol: 0x000000, sunGlow: 0, disc: 0, top: 0x030409, hor: 0x2a2028, pow: 0.42, clouds: 0.95, cloudCol: 0x07080c, cloudLit: 0x3a2a30, cloudSpd: 0.9, cloudLo: 0.06, band: 0.55, bandCol: 0x4a2a2a },
    terrain: { A: [TEX('asphalt_02'), 5, 0x55575c], B: [TEX('asphalt_02'), 4, 0x1c1e22], C: ['cliff_side', 12, 0x3a3a3c], P: 0x8a8a88, rock: [0.6, 0.9], macro: [22, 0.3], nstr: 1.1, rough: [0.72, 0.24], desat: 0.4, bnoise: 0, env: 0.08, specMax: 0.5, haze: [0x0e1820, 0.4, 90, 380] },
    layout: rainLayout, height: rainHeight, mask: rainMask, build: rainBuild, props: [],
    particles: [
      { kind: 'rain', n: 2400, vel: [-1.6, -17, 0.9], color: 0xb0c8d8, opacity: 0.34, len: 0.85, box: 18, wide: 46 },
      { kind: 'dot', n: 500, size: 0.05, vel: [0.2, -0.3, 0.1], var: [0.4, 0.2, 0.4], color: 0x8aa8b8, opacity: 0.22, sway: 0.4 },
    ],
  },
  dockyard: {
    variants: 3, desat: 0.2, groundTint: 0x1c1e22, fog: [14, 170], hemi: 0.75, sun: 0.55, sunOffset: [10, 22, 14], exposure: 1.0, fogCol: 0x0e1820, skyCols: [0x04060a, 0x1a2230], heightMap: 200,
    /* the same low overcast as the rain district, lit from below by the port's sodium and the far shore */
    sky: { sunDir: [-0.6, 0.15, -1], sunCol: 0x000000, sunGlow: 0, disc: 0, top: 0x030409, hor: 0x2a2228, pow: 0.42, clouds: 0.95, cloudCol: 0x07080c, cloudLit: 0x3a2c2a, cloudSpd: 0.9, cloudLo: 0.06, band: 0.55, bandCol: 0x4a2e22 },
    terrain: { A: [TEX('hangar_concrete_floor'), 3, 0x2a2c30], B: [TEX('hangar_concrete_floor'), 3, 0x111316], C: ['cliff_side', 12, 0x3a3a3c], P: 0x8a8a88, rock: [0.55, 0.85], macro: [26, 0.35], nstr: 1.0, rough: [0.5, 0.18], desat: 0.6, bnoise: 0, env: 0.08, specMax: 0.5, haze: [0x0e1820, 0.4, 90, 400] },
    layout: dockLayout, height: dockHeight, mask: dockMask, build: dockBuild, props: [],
    particles: [
      { kind: 'rain', n: 2400, vel: [-1.6, -17, 0.9], color: 0xb0c8d8, opacity: 0.34, len: 0.85, box: 18, wide: 46 },
      { kind: 'dot', n: 400, size: 0.05, vel: [0.3, -0.3, 0.1], var: [0.4, 0.2, 0.4], color: 0x8aa8b8, opacity: 0.2, sway: 0.4 },
    ],
  },
};
/* world.js light looks (key = the city glow side, rim = cyan; fog dense and cold in the rain, warm dust at the docks) */
export const looks = {
  rainline: { key: [-0.35, 0.85, -0.4], keyCol: 0xffa868, keyI: 1.0, fill: 0.3, rim: 0x3ef2ff, rimI: 0.75, back: 0.8,
    disc: { r: 0 }, skyTop: 0x030409, skyBot: 0x1c1a22, torch: { color: 0xa8c8e8, power: 0.2, range: 9 },
    fog: { d: 0.0028, h: 0.005, fall: 0.05, max: 0.95, start: 6, sky: 1, scatter: 0.22 }, grade: { sat: 0.95, con: 0.42, lift: 0x03070c, gain: 0xfff0e2 }, exp: 1.02 },
  dockyard: { key: [-0.4, 0.8, -0.5], keyCol: 0xff9a50, keyI: 1.2, fill: 0.3, rim: 0x3ef2ff, rimI: 0.75, back: 0.8,
    disc: { r: 0 }, skyTop: 0x030409, skyBot: 0x1c1a22, torch: { color: 0xa8c8e8, power: 0.2, range: 9 },
    fog: { d: 0.0026, h: 0.005, fall: 0.05, max: 0.94, start: 7, sky: 1, scatter: 0.24 }, grade: { sat: 0.95, con: 0.42, lift: 0x03070c, gain: 0xfff0e2 }, exp: 1.06 },
};
export const grime = {
  rainline: { k: [0.02, 0.12, 0.3, 0], mud: 0x121418, dye: 0x161a22 },
  dockyard: { k: [0.06, 0.14, 0.32, 0], mud: 0x16181c, dye: 0x181c22 },
};

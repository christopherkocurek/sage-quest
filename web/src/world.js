/* The world: paper-white void that fills in as Sage2 decides. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { installGate } from './perf2.js';
import { sqUnmerge } from './perf3.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Lands } from './lands.js';
const WHITE = new THREE.Color(0xffffff);
const AGX = THREE.ACESFilmicToneMapping; /* ACES: more contrast than AgX for this dark palette */

/* ---------- the global look, per land ----------
   key: direction TOWARD the key light; the moon or sun disc sits there too (kept off the screen centre-top).
   keyI/fill: directional and hemisphere intensity. rim: fresnel edge colour on characters, rimI its strength.
   fog: d = distance density per metre, h = ground height-fog density, fall = height falloff per metre,
        max = fog cap, start = clear radius in metres, sky = horizon haze on the sky, scatter = glow toward the key.
   grade (display space): sat, con (S-curve), lift = shadow tint, gain = highlight tint. exp = AgX exposure.
   disc: the moon or sun, drawn by the world as a screen-aligned quad so it stays round at every view angle:
        r = angular radius (rad, 0 = no disc), col/i = core colour and strength, soft = edge softness (0 hard .. 1 smear),
        halo/haloI/haloR = halo colour, strength and reach in disc radii, veil = how much the land's clouds hide it,
        ring/ringI = a thin ice-mist ring at that many disc radii (halo colour).
   back = strength of the back (rim) light. skyTop/skyBot = optional sky gradient over the biome's colours.
   World and daylight fields (all optional; missing = the dark night values): bloom = { threshold 1.0, strength 0.32, radius 0.45 },
   env = scene environment intensity (dark leaves it alone, ~0.42), campExposure = the camp's multiplier on exp (dark 0.7),
   torch = the fight's camera torch for this land: { color, power, range, decay, tint } or false (no torch); wins over the world entry's torch. */
const LOOK = {
  drownedfen: { key: [-0.62, 0.34, -0.71], keyCol: 0xd6dcc4, keyI: 2.4, fill: 0.2, rim: 0xd4dcd4, rimI: 1.45, back: 1.7, /* foes read on the dark ground */
    disc: { r: 0.021, col: 0xecf0d8, i: 2.2, soft: 0.07, halo: 0x8ec048, haloI: 0.55, haloR: 6, veil: 0.55 },
    fog: { d: 0.0031, h: 0.0045, fall: 0.16, max: 0.92, start: 7, sky: 1, scatter: 0.17 }, grade: { sat: 0.82, con: 0.36, lift: 0x0b120c, gain: 0xf2f0dc }, exp: 0.88 },
  vinewild: { key: [-0.52, 0.2, -0.83], keyCol: 0xd9b070, keyI: 3.4, fill: 0.28, rim: 0xffd8a0, rimI: 0.9, back: 1.3,
    disc: { r: 0.034, col: 0xffc070, i: 1.3, soft: 0.3, halo: 0xd08a40, haloI: 0.5, haloR: 5, veil: 0.7 },
    fog: { d: 0.0034, h: 0.0054, fall: 0.12, max: 0.93, start: 7, sky: 1, scatter: 0.3 }, grade: { sat: 0.9, con: 0.34, lift: 0x0c0c06, gain: 0xfff2dc }, exp: 1.0 },
  barrowmoor: { key: [-0.78, 0.32, -0.54], keyCol: 0xccd8f4, keyI: 2.6, fill: 0.32, rim: 0xb0c8ff, rimI: 0.95, back: 1.3,
    disc: { r: 0.018, col: 0xdde6f6, i: 1.8, soft: 0.14, halo: 0x7888b0, haloI: 0.25, haloR: 4, veil: 0.75, ring: 12, ringI: 0.07 },
    fog: { d: 0.0022, h: 0.0036, fall: 0.14, max: 0.88, start: 8, sky: 1, scatter: 0.15 }, grade: { sat: 0.72, con: 0.38, lift: 0x070912, gain: 0xeef2ff }, exp: 0.98 },
  dusksteppe: { key: [0.44, 0.2, -0.88], keyCol: 0xffa060, keyI: 4.0, fill: 0.26, rim: 0xffc488, rimI: 1.0, back: 1.3,
    disc: { r: 0.085, col: 0xff2a0c, i: 0.95, soft: 0.04, halo: 0xff3a10, haloI: 0.4, haloR: 3.2, veil: 0.35 },
    skyTop: 0x3a0f0a, skyBot: 0xff8a3a,
    fog: { d: 0.0017, h: 0.0027, fall: 0.10, max: 0.82, start: 9, sky: 1, scatter: 0.35 }, grade: { sat: 1.0, con: 0.38, lift: 0x140a12, gain: 0xfff0d8 }, exp: 0.95 },
  ashlands: { key: [-0.6, 0.27, -0.75], keyCol: 0xff9a5a, keyI: 3.8, fill: 0.24, rim: 0xffc8a0, rimI: 1.6, back: 2.2,
    disc: { r: 0.03, col: 0x8a2a10, i: 0.4, soft: 0.6, halo: 0x6a1a08, haloI: 0.5, haloR: 3.5, veil: 0.5 },
    skyTop: 0x1a0c08, skyBot: 0x2c120a,
    fog: { d: 0.0024, h: 0.0036, fall: 0.12, max: 0.86, start: 8, sky: 1, scatter: 0.30 }, grade: { sat: 0.95, con: 0.38, lift: 0x120604, gain: 0xfff0e2 }, exp: 0.99 },
  frostpass: { key: [-0.42, 0.56, -0.71], keyCol: 0xe2eaff, keyI: 1.9, fill: 0.2, rim: 0xa8dcff, rimI: 1.35, back: 1.6, /* foes read on the dark snow */
    disc: { r: 0.013, col: 0xf6f9ff, i: 3.0, soft: 0.03, halo: 0x9ab8e8, haloI: 0.14, haloR: 3, veil: 0 },
    fog: { d: 0.0020, h: 0.0036, fall: 0.10, max: 0.86, start: 8, sky: 1, scatter: 0.17 }, grade: { sat: 0.8, con: 0.34, lift: 0x060a14, gain: 0xf4f8ff }, exp: 0.68 },
  deepwood: { key: [-0.67, 0.36, -0.74], keyCol: 0xcfe0e4, keyI: 3.4, fill: 0.24, rim: 0xa8c0d0, rimI: 1.7, back: 2.2,
    disc: { r: 0 },
    fog: { d: 0.0037, h: 0.0054, fall: 0.12, max: 0.94, start: 7, sky: 1, scatter: 0.23 }, grade: { sat: 0.78, con: 0.38, lift: 0x060a08, gain: 0xeef4ea }, exp: 1.05 },
  stormcoast: { key: [-0.72, 0.4, -0.66], keyCol: 0xc0cae6, keyI: 2.9, fill: 0.4, rim: 0xc0b0ff, rimI: 0.95, back: 1.3,
    disc: { r: 0 },
    fog: { d: 0.0026, h: 0.0045, fall: 0.14, max: 0.9, start: 8, sky: 1, scatter: 0.15 }, grade: { sat: 0.72, con: 0.38, lift: 0x06080e, gain: 0xeef0ff }, exp: 1.1 },
};
export const LAND_LOOK = LOOK;
/* the nemesis sector (lands.js keeps it open): the far shapes stand along this direction */
const NEM_DIR = new THREE.Vector3(30, 0, -84).normalize();

/* Fresnel rim for characters: an edge light toward the key side, so figures cut out of the dark.
   Shared uniforms: one colour and one view-space key direction for every patched material. */
const RIM = { col: { value: new THREE.Color(0) }, key: { value: new THREE.Vector3(0, 0, -1) } };
export const RIM_UNIFORMS = RIM; /* the title-stage picture sets the rim for one render */
const RIM_U = new WeakMap(); const TEAR_U = new WeakMap(); /* per-material uniforms, not in userData */
/* near fade: body parts of a foe closer than NEAR_FADE.value metres to the camera dissolve (a screen dither), so the
   first-person camera never shows the inside of a foe. The fight sets it while it runs; 0 = off (camp, card). */
export const NEAR_FADE = { value: 0 };
const NEAR_SET = new WeakSet(); const NEAR_K = new WeakMap();
/* k scales the radius for one material (a back banner that stands 1-1.5 m above and behind the head: k 2.4) */
export function addNearFade(mat, k = 1) {
  /* MeshBasicMaterial too (code-built drone shells, glow plates, boss trims); the view position comes from its own
     varying (sqVP, set after project_vertex), so a material with no vViewPosition can take the fade */
  if (!mat || !(mat.isMeshStandardMaterial || mat.isMeshPhongMaterial || mat.isMeshLambertMaterial || mat.isMeshToonMaterial || mat.isMeshBasicMaterial)) return mat;
  if (NEAR_SET.has(mat)) { if (k !== 1 && NEAR_K.get(mat)) NEAR_K.get(mat).value = k; return mat; }
  NEAR_SET.add(mat); const ku = { value: k }; NEAR_K.set(mat, ku); mat.needsUpdate = true; /* a material already drawn (a dress built on its first update) relinks once with the fade */
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.sqNear = NEAR_FADE; sh.uniforms.sqNearK = ku;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 sqVP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nsqVP = mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float sqNear; uniform float sqNearK; varying vec3 sqVP;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (sqNear > 0.0) { float sqA = smoothstep(sqNear * sqNearK * 0.6, sqNear * sqNearK, length(sqVP)); float sqB = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (sqA <= sqB) discard; }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-near`;
  return mat;
}
/* the hit pulse. A struck body never changes its own colour: a short fresnel rim of light runs round its
   silhouette (the edges only) and dies in about 0.15 s. Per material: sqHit = (start s, length s, strength, hold), sqHitC =
   its colour; HIT_NOW = the clock (seconds), set by the world every frame, so the pulse needs no per-frame JS per actor. */
export const HIT_NOW = { value: 0 };
const HIT_U = new WeakMap();
export const hitUniforms = (mat) => HIT_U.get(mat) || null;
export function addRim(mat, strength = 1) {
  if (RIM_U.has(mat)) return mat;
  const s = { value: strength }; RIM_U.set(mat, s); delete mat.userData.rim;
  const hu = { sqHit: { value: new THREE.Vector4(-9, 0.1, 0, 0) }, sqHitC: { value: new THREE.Color(1, 1, 1) } }; HIT_U.set(mat, hu);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.sqRimCol = RIM.col; sh.uniforms.sqRimKey = RIM.key; sh.uniforms.sqRimK = s; sh.uniforms.sqHit = hu.sqHit; sh.uniforms.sqHitC = hu.sqHitC; sh.uniforms.sqNow = HIT_NOW;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 sqRimCol; uniform vec3 sqRimKey; uniform float sqRimK; uniform vec4 sqHit; uniform vec3 sqHitC; uniform float sqNow;')
      .replace('#include <opaque_fragment>', `{ vec3 sqV = normalize(vViewPosition);
          float sqNV = 1.0 - saturate(dot(normal, sqV));
          float sqF = pow(sqNV, 4.0);
          float sqSide = 0.12 + 0.88 * smoothstep(-0.1, 0.8, dot(normal, sqRimKey));
          outgoingLight += sqRimCol * sqF * sqSide * sqRimK;
          float sqT = (sqNow - sqHit.x) / max(sqHit.y, 0.01);
          if (sqT >= 0.0 && sqT < 1.0) { float sqE = sqHit.w > 0.5 ? smoothstep(1.0, 0.75, sqT) : (1.0 - sqT) * (1.0 - sqT);
            outgoingLight += sqHitC * (pow(sqNV, 3.5) * 0.9 + pow(sqNV, 8.0) * 1.8) * sqE * sqHit.z; } }
        #include <opaque_fragment>`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-rim`;
  return mat;
}

/* Every actor made by makeActor, so the world can put a contact shadow under it. */
const ACTORS = new Set();
const BLOB_MAX = 32;
function makeBlobs() {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const k = new THREE.InstancedBufferAttribute(new Float32Array(BLOB_MAX), 1); k.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aK', k);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    vertexShader: 'attribute float aK; varying vec2 vUv; varying float vK; void main(){ vUv = uv; vK = aK; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; varying float vK; void main(){ float r = length(vUv - 0.5) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, r); a = a * a * (0.6 + 0.4 * a) * vK; if (a < 0.003) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }',
  });
  const mesh = new THREE.InstancedMesh(geo, mat, BLOB_MAX); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
  return mesh;
}

/* The fog as a GLSL function: the fog pass, the bloom's bright pass and the fused last pass all call it. */
const FOG_GLSL = `uniform sampler2D tDepth; uniform mat4 uProjInv; uniform mat4 uCamWorld; uniform vec3 uCamPos;
    uniform vec3 uFogCol; uniform vec3 uScatCol; uniform vec3 uKey; uniform vec4 uFog; uniform float uStart; uniform float uSky; uniform float uAmount;
    uniform vec2 uDark;
    /* the dark (world.setDark): beyond uDark.y metres the image falls to near black; bright lights and emissive
       pixels keep a faint part of their light, so beacons, eyes and sparks still read */
    vec3 sqDark(vec3 col, vec3 src, float dist, bool sky) {
      float k = uDark.x; float R = max(uDark.y, 0.5);
      float far = sky ? 1.0 : smoothstep(R * 0.55, R * 1.3, dist);
      float lum = max(max(src.r, src.g), src.b);
      float keep = mix(0.02, 0.5, smoothstep(0.8, 3.5, lum));
      return col * mix(1.0 - 0.3 * k, keep, far * k);
    }
    vec3 sqFogged(vec3 c, vec2 uv){
      if (uAmount <= 0.001 && uDark.x <= 0.001) return c;
      float d = texture2D(tDepth, uv).x;
      vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w;
      bool sky = d >= 0.99999;
      if (uAmount <= 0.001) return sqDark(c, c, length(vp.xyz), sky);
      vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
      vec3 ray = wp - uCamPos; float dist = length(ray); vec3 rd = ray / max(dist, 1e-4);
      float t = sky ? 900.0 : max(dist - uStart, 0.0);
      float b = uFog.z; float dy = rd.y * t;
      float hk = abs(b * dy) > 0.001 ? (1.0 - exp(-b * dy)) / (b * dy) : 1.0;
      float tauH = uFog.y * exp(-b * max(uCamPos.y, 0.0)) * t * hk;
      float tauD = sky ? 0.0 : uFog.x * t;
      float f = min(1.0 - exp(-(tauD + tauH)), uFog.w) * (sky ? uSky : 1.0) * uAmount;
      float mu = max(dot(rd, normalize(uKey)), 0.0);
      vec3 fc = uFogCol + uScatCol * (pow(mu, 16.0) * 0.35 + pow(mu, 90.0) * 0.8);
      vec3 o = mix(c, fc, f);
      if (uDark.x > 0.001) o = sqDark(o, c, dist, sky);
      return o;
    }`;
/* Post fog: distance fog + exponential height fog + in-scatter toward the key, from the depth buffer.
   It runs on the linear HDR image before bloom, so every land object is fogged, custom shaders too. */
const FOG_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() }, uFogCol: { value: new THREE.Color() }, uScatCol: { value: new THREE.Color() }, uKey: { value: new THREE.Vector3(0, 0.2, -1) },
    uFog: { value: new THREE.Vector4(0.003, 0.008, 0.12, 0.9) }, uStart: { value: 8 }, uSky: { value: 1 }, uAmount: { value: 0 },
    uDark: { value: new THREE.Vector2(0, 9) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; ${FOG_GLSL}
    void main(){ vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(sqFogged(c.rgb, vUv), c.a); }`,
};
class FogPass extends ShaderPass {
  constructor() { super(FOG_SHADER); }
  render(renderer, writeBuffer, readBuffer, dt, mask) { this.uniforms.tDepth.value = readBuffer.depthTexture; super.render(renderer, writeBuffer, readBuffer, dt, mask); }
}

/* The moon or sun: a quad that always faces the image plane, so it projects as a circle at every view direction
   and aspect (a disc computed in direction space on the sky dome stretches into an oval toward the screen edge).
   Additive, behind every surface (no depth write; terrain in front hides it). The land's clouds veil it. */
const DISC_SHADER = {
  vertexShader: `uniform float uHalf; varying vec2 vQ; varying vec3 vDir;
    void main(){
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 w = c + (right * position.x + up * position.y) * uHalf;
      vQ = position.xy; vDir = w - cameraPosition;
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    }`,
  fragmentShader: `uniform vec3 uCol; uniform vec3 uHalo; uniform float uI; uniform float uSoft; uniform float uHaloI; uniform float uHaloR;
    uniform float uExt; uniform float uRing; uniform float uRingI; uniform float uVeil; uniform float uClouds; uniform float uCloudLo; uniform float uCloudSpd; uniform float uTime; uniform float uOn;
    varying vec2 vQ; varying vec3 vDir;
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
    void main(){
      float rho = length(vQ) * uExt;
      float e = max(uSoft, 0.015);
      float core = 1.0 - smoothstep(1.0 - e, 1.0 + e * 2.0, rho);
      core *= 0.8 + 0.2 * sqrt(max(0.0, 1.0 - min(rho * rho, 1.0)));
      float hr = max(uHaloR, 1.01);
      float halo = (exp(-rho / (hr * 0.3)) * 0.75 + exp(-rho / (hr * 0.12)) * 0.25) * (1.0 - smoothstep(hr * 0.55, hr, rho));
      vec3 c = uCol * core * uI + uHalo * halo * uHaloI;
      if (uRingI > 0.0) { float rr = (rho - uRing) / (uRing * 0.07); c += uHalo * uRingI * (exp(-rr * rr) + 0.25 * (1.0 - smoothstep(uRing * 0.4, uRing, rho)) * smoothstep(1.5, uRing * 0.4, rho)) * (1.0 - smoothstep(uExt * 0.85, uExt, rho)); }
      vec3 d = normalize(vDir);
      if (uVeil > 0.0 && uClouds > 0.0) {
        float h = d.y; vec2 q = d.xz / (max(h, 0.0) + uCloudLo) * 0.85; float tt = uTime * uCloudSpd;
        float cl = fbm(vec3(q * 1.3 + vec2(tt * 0.015, tt * 0.006), tt * 0.012));
        float cov = smoothstep(0.62 - uClouds * 0.3, 0.86 - uClouds * 0.2, cl) * smoothstep(-0.05, 0.1, h);
        c *= 1.0 - cov * uVeil * 0.94;
      }
      gl_FragColor = vec4(c * uOn, 1.0);
    }`,
};

export const PAPER = 0xf4f0e5;
const loader = new GLTFLoader();
const cache = new Map();
export function loadGLB(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

let DOT = null;
export function dotTexture() {
  if (DOT) return DOT;
  /* a soft gaussian-like falloff with no plateau: an additive sprite glows instead of reading as a hard-edged disc */
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let i = 0; i <= 10; i++) { const x = i / 10; const a = Math.exp(-x * x * 5.5) * (1 - x * x); grad.addColorStop(x, `rgba(255,255,255,${a.toFixed(4)})`); }
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  DOT = new THREE.CanvasTexture(c); return DOT;
}

/* mulberry32: one seed gives the same world every time. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* the flash envelope: instant rise, gone after FLASH_S seconds */
const FLASH_S = 0.12;
const flashEnv = (t) => { const x = 1 - t / FLASH_S; return x > 0 ? x * x : 0; };
const easeOutBack = (x) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/* An actor: a cloned rigged model with a mixer and named clips. */
export const KNIGHT_URL = '/assets/real/knight.glb';
/* The knight uses the Universal Animation Library clips (Quaternius, CC0). A few old names map to them. */
const KNIGHT_CLIPS = {
  Idle: ['Idle_Loop'], Unarmed_Idle: ['Idle_Loop'], '2H_Melee_Idle': ['Sword_Idle'], Cheer: ['Sword_Regular_Combo', 1.1], Lie_Idle: ['Death01'],
  Spellcasting: ['Spell_Simple_Idle_Loop'], Interact: ['Interact'],
};
const KNIGHT_PARTS = ['Helm_great', 'Helm_sallet', 'Helm_kettle', 'Eyes', 'Horns', 'Crown', 'Hood', 'Chest', 'Fauld', 'PauldronL', 'PauldronR', 'HeavyL', 'HeavyR',
  'UpArmL', 'UpArmR', 'ForeArmL', 'ForeArmR', 'ThighL', 'ThighR', 'ShinL', 'ShinR', 'Cloak', 'Tabard', 'Robe', 'Mannequin',
  /* boss parts (modelled by script in Blender): hidden unless a look asks for them */
  'Sleeves', 'BoneHands', 'IronCrown', 'Shroud', 'GiantPauldronL', 'GiantPauldronR', 'GiantHelm', 'GiantCollar', 'GiantTasset', 'GiantLegL', 'GiantLegR', 'GiantGauntletL', 'GiantGauntletR', 'LichSkull'];
const CLOTH_PARTS = new Set(['Cloak', 'Tabard', 'Robe', 'Hood', 'Sleeves', 'Shroud']);
/* the plate a knight wears unless a look says otherwise; every other part (boss parts, wardrobe parts) is hidden by default */
const BASE_PARTS = new Set(['Chest', 'UpArmL', 'UpArmR', 'ForeArmL', 'ForeArmR', 'ThighL', 'ThighR', 'ShinL', 'ShinR']);
const MAIL_MAT = /SQ_Mail/; let VARY_SEQ = 0;
const STEEL_MAT = /metal_plate/; const BLADE_MAT = /SQG?_Blade/; const CLOTH_MAT = /SQ_Cloth/; const EYE_MAT = /SQ_Eyes/; const GOLD_MAT = /SQ_Gold/; const VOID_MAT = /SQ_Void/; const RUNE_MAT = /SQ_Rune/;
export function fitGear(actor, gear) { return gear; }

/* a baked (broken-off) piece carries its bind-pose position in sqBind (bakeSkinned); a live part reads position */
const BIND_ATTR = '#ifndef SQ_BIND_ATTR\n#define SQ_BIND_ATTR\nattribute vec4 sqBind;\nvec3 sqBindPos() { return sqBind.w > 1.5 ? sqBind.xyz : position; }\n#endif';
/* The layer under the plates. The bare smooth mannequin read as a plastic doll between the plates, so every knight wears
   a mail hauberk on the arms and a mail coif, quilted gambeson on the trunk and leather gloves. Procedural, from the
   bind-pose position (x across, y up, z forward; T-pose arms along x), so it sticks to the skin through every clip. */
const UNDER_GLSL = `
varying vec3 vSqBind;
float sqMail(vec2 q) {
  q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 f = fract(q) - 0.5; float d = length(f * vec2(1.0, 1.25));
  return smoothstep(0.16, 0.27, d) * (1.0 - smoothstep(0.36, 0.5, d));
}
/* how much of a pattern cell one pixel covers: fade the pattern (and its bump) to its mean long before it aliases */
float sqFade(vec2 q) { float w = max(length(dFdx(q)), length(dFdy(q))); return smoothstep(0.05, 0.2, w); } /* the rings fade out before they alias into white noise */
float sqAA(vec2 q, float h, float mean) { return mix(h, mean, sqFade(q)); }
vec3 sqBump(vec3 p, vec3 n, float h, float k, float fd) {
  vec3 sx = dFdx(p); vec3 sy = dFdy(p); vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * fd; vec2 dh = vec2(dFdx(h), dFdy(h)) * k;
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - g);
}`;
export const underUniforms = (mat) => UNDER_U.get(mat) || null;
const UNDER_U = new WeakMap(); /* live uniforms by material, not in userData (clone() JSON-copies userData) */
function underLayer(mat) {
  if (UNDER_U.has(mat)) return mat;
  const U = { k: { value: 1 }, mail: { value: 1 } }; UNDER_U.set(mat, U); delete mat.userData.under;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    sh.uniforms.sqUnder = U.k; sh.uniforms.sqMailK = U.mail;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float sqUnder; uniform float sqMailK;${UNDER_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 sqB = vSqBind; float ax = abs(sqB.x);
        float armM = smoothstep(0.17, 0.23, ax) * smoothstep(1.22, 1.3, sqB.y);
        float handM = smoothstep(0.715, 0.75, ax) * armM;
        float headM = smoothstep(1.48, 1.54, sqB.y) * (1.0 - armM);
        float legM = (1.0 - smoothstep(0.86, 0.96, sqB.y)) * (1.0 - armM);
        float trunkM = max(0.0, 1.0 - armM - headM - legM);
        vec2 qa = vec2(ax, atan(sqB.z - 0.0, sqB.y - 1.44) * 0.075) / 0.0095;
        vec2 qh = vec2(atan(sqB.z, sqB.x) * 0.11, sqB.y) / 0.0105;
        vec2 ql = vec2(atan(sqB.z, ax - 0.09) * 0.085, sqB.y) / 0.012;
        float mail = sqAA(qa, sqMail(qa), 0.45) * armM * (1.0 - handM) + sqAA(qh, sqMail(qh), 0.45) * headM + sqAA(ql, sqMail(ql), 0.45) * legM;
        float mailFar = sqFade(qa) * armM * (1.0 - handM) + sqFade(qh) * headM + sqFade(ql) * legM; /* 1 = too small to draw: a flat value, no bump */
        vec2 qt = vec2(atan(sqB.z, sqB.x) * 0.16 + sqB.y, atan(sqB.z, sqB.x) * 0.16 - sqB.y) / 0.055;
        vec2 ft = abs(fract(qt) - 0.5) * 2.0; float quilt = sqAA(qt, 1.0 - pow(max(ft.x, ft.y), 5.0), 0.8);
        float isMail = (armM * (1.0 - handM) + headM + legM) * sqMailK;
        float sqH = mix(0.0, mix(quilt * 0.9, mail * (1.0 - clamp(mailFar, 0.0, 1.0)), isMail), sqUnder);
        vec3 mailCol = vec3(0.085, 0.088, 0.095) * (0.3 + 0.7 * mail);
        vec3 clothCol = vec3(0.085, 0.066, 0.05) * (0.45 + 0.6 * quilt);
        vec3 leather = vec3(0.05, 0.034, 0.024);
        vec3 under = mix(mix(clothCol, mailCol, clamp(isMail, 0.0, 1.0)), leather, handM);
        diffuseColor.rgb = mix(diffuseColor.rgb, under, sqUnder);
        float sqMetal = clamp(isMail * (1.0 - handM), 0.0, 1.0) * sqUnder;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(mix(0.92, mix(0.46, 0.68, clamp(mailFar, 0.0, 1.0)), sqMetal), 0.62, handM), sqUnder);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, sqMetal * 0.9, sqUnder);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = sqBump(-vViewPosition, normal, sqH, 1.0 * sqUnder, faceDirection);');
    prev?.call(mat, sh, r);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-under`;
  mat.needsUpdate = true;
  return mat;
}
/* A mail coif (material SQ_Mail): the same riveted rings as the hauberk, faded to a flat value before they alias. */
function mailCoat(mat) {
  if (mat.userData.mail) return mat;
  mat.userData.mail = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vSqBind;\n${BIND_ATTR}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqBind = sqBindPos();');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${UNDER_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 qm = vec2(atan(vSqBind.z, vSqBind.x) * 0.12, vSqBind.y) / 0.0105;
        float mFar = sqFade(qm); float mail = mix(sqMail(qm), 0.45, mFar);
        diffuseColor.rgb = vec3(0.075, 0.078, 0.085) * (0.35 + 0.75 * mail);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.55, 0.75, mFar);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = 0.85;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = sqBump(-vViewPosition, normal, mail * (1.0 - mFar), 1.0, faceDirection);');
    prev?.call(mat, sh, r);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-mail`;
  mat.map = null; mat.normalMap = null; mat.needsUpdate = true;
  return mat;
}
/* Torn cloth: a jagged hem and a few holes cut by an alpha test in bind space. k 0 = whole cloth. */
function tearCloth(mat) {
  if (TEAR_U.has(mat)) return TEAR_U.get(mat);
  const U = { seed: { value: 0 }, k: { value: 0 } }; TEAR_U.set(mat, U); delete mat.userData.tear;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    sh.uniforms.sqTearSeed = U.seed; sh.uniforms.sqTearK = U.k;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqTear;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqTear = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqTear; uniform float sqTearSeed; uniform float sqTearK;\nfloat sqTH(float x){ return fract(sin(x * 91.7 + sqTearSeed * 13.1) * 43758.5); }')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (sqTearK > 0.0) {
          float col = floor(vSqTear.x * 46.0 + atan(vSqTear.z, 0.2) * 3.0); float fx = fract(vSqTear.x * 46.0);
          float len = sqTH(col) * sqTH(col + 7.0);                        /* a ragged strip length per column */
          float hem = 0.5 + sqTearK * (0.08 + 0.22 * len) + 0.05 * sqTH(col + 3.0) * abs(fx - 0.5);
          if (vSqTear.y < hem) discard;
          vec2 hc = vec2(floor(vSqTear.x * 9.0), floor(vSqTear.y * 7.0)); float hole = sqTH(hc.x * 17.0 + hc.y * 5.0);
          vec2 hf = fract(vec2(vSqTear.x * 9.0, vSqTear.y * 7.0)) - 0.5;
          if (hole > 1.0 - sqTearK * 0.12 && length(hf * vec2(1.0, 1.6)) < 0.32) discard;
        }`);
    prev?.call(mat, sh, r);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-tear`;
  mat.needsUpdate = true;
  return U;
}
/* Per-foe differences so a pack never reads as clones: build, posture (a hunched thrall, a tilted head, a dropped
   shoulder), a missing pauldron or spaulder, a torn tabard or cloak, steel and cloth tones. seed null = none. */
const _vq = new THREE.Quaternion(); const _vq2 = new THREE.Quaternion(); const _va = new THREE.Vector3();
const VX = new THREE.Vector3(1, 0, 0); const VY = new THREE.Vector3(0, 1, 0); const VZ = new THREE.Vector3(0, 0, 1);
function varyActor(actor, seed, { helm, pauldrons, heavy }) {
  const model = actor.model;
  if (seed == null) {
    actor.posture = null; if (actor.knight) model.scale.setScalar(1.27);
    for (const m of actor.meshes) { const T = TEAR_U.get(m.material); if (T) T.k.value = 0; }
    return;
  }
  const r = rng(seed); const thrall = helm === 'kettle';
  /* build: height and breadth apart, so the silhouettes differ */
  const tall = 0.94 + r() * 0.12; const broad = 0.95 + r() * 0.12;
  model.scale.set(1.27 * broad, 1.27 * tall, 1.27 * broad);
  /* part mix */
  if (pauldrons && r() < 0.35) for (const m of actor.parts.get(r() < 0.5 ? 'PauldronL' : 'PauldronR') || []) m.visible = false;
  if (heavy && r() < 0.3) for (const m of actor.parts.get(r() < 0.5 ? 'HeavyL' : 'HeavyR') || []) m.visible = false;
  if (!thrall && r() < 0.25) for (const m of actor.parts.get(r() < 0.5 ? 'ForeArmL' : 'UpArmR') || []) m.visible = false;
  for (const p of ['Tabard', 'Cloak']) for (const m of actor.parts.get(p) || []) { const U = tearCloth(m.material); U.seed.value = r() * 100; U.k.value = r() < (thrall ? 0.9 : 0.6) ? 0.35 + r() * 0.65 : 0; }
  /* tones: worn steel, faded cloth */
  const st = 0.82 + r() * 0.26; const cl = 0.7 + r() * 0.5;
  for (const m of actor.meshes) {
    const n = m.material.name || '';
    if (STEEL_MAT.test(n)) m.material.color.multiplyScalar(st);
    else if (CLOTH_MAT.test(n) && !VOID_MAT.test(n)) m.material.color.multiplyScalar(cl);
  }
  /* posture: extra bone turns after every animation update, about axes of the body (not of the bone) */
  actor.posture = {
    hunch: thrall ? 0.14 + r() * 0.16 : r() * 0.1, lift: 0, tilt: (r() - 0.5) * (thrall ? 0.55 : 0.32), turn: (r() - 0.5) * 0.3,
    drop: (r() - 0.5) * 0.25, lean: (r() - 0.5) * 0.12,
  };
  actor.posture.lift = -actor.posture.hunch * (thrall ? 0.75 : 0.5);
  if (!actor.postureWrap) {
    actor.postureWrap = true;
    const bone = (n) => model.getObjectByName(n);
    const B = { s2: bone('spine_02'), s3: bone('spine_03'), neck: bone('neck_01'), head: bone('Head'), cl: bone('clavicle_l'), cr: bone('clavicle_r') };
    const turn = (b, axis, ang) => {
      if (!b || Math.abs(ang) < 1e-4) return;
      actor.root.getWorldQuaternion(_vq); _va.copy(axis).applyQuaternion(_vq);
      b.getWorldQuaternion(_vq2); _va.applyQuaternion(_vq2.invert()).normalize();
      b.quaternion.multiply(_vq.setFromAxisAngle(_va, ang));
    };
    const upd = actor.mixer.update.bind(actor.mixer);
    actor.mixer.update = (dt) => {
      const out = upd(dt); const P = actor.posture;
      if (P) {
        turn(B.s2, VX, P.hunch * 0.55); turn(B.s3, VX, P.hunch * 0.45); turn(B.s2, VZ, P.lean);
        turn(B.neck, VX, P.lift * 0.5); turn(B.head, VX, P.lift * 0.5); turn(B.head, VZ, P.tilt); turn(B.head, VY, P.turn);
        turn(P.drop > 0 ? B.cl : B.cr, VZ, P.drop > 0 ? -P.drop : -P.drop);
      }
      return out;
    };
  }
}

const _v = new THREE.Vector3();
/* Freezes a skinned mesh in its current pose as a plain mesh in world space, centred on its own middle. */
export function bakeSkinned(mesh) {
  sqUnmerge(mesh); /* the part's own geometry and material, not a merged draw */
  mesh.updateWorldMatrix(true, false);
  const src = mesh.geometry; const pos = src.attributes.position; const n = pos.count;
  const out = new Float32Array(n * 3); const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, _v); _v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = _v.x; out[i * 3 + 1] = _v.y; out[i * 3 + 2] = _v.z; c.add(_v);
  }
  c.multiplyScalar(1 / Math.max(1, n));
  for (let i = 0; i < n; i++) { out[i * 3] -= c.x; out[i * 3 + 1] -= c.y; out[i * 3 + 2] -= c.z; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (src.attributes.uv) geo.setAttribute('uv', src.attributes.uv.clone());
  /* the bind-pose position, for the shaders that draw grime, mail and rings in bind space (w = 2 marks it as present;
     a mesh without the attribute reads w = 1), so a broken-off plate keeps exactly the look it had on the body */
  const bind = new Float32Array(n * 4); for (let i = 0; i < n; i++) { bind[i * 4] = pos.getX(i); bind[i * 4 + 1] = pos.getY(i); bind[i * 4 + 2] = pos.getZ(i); bind[i * 4 + 3] = 2; }
  geo.setAttribute('sqBind', new THREE.BufferAttribute(bind, 4));
  if (src.index) geo.setIndex(src.index.clone());
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mesh.material);
  m.position.copy(c); m.castShadow = true;
  return m;
}

/* ---------- plates built in code on the knight's bind pose (T-pose, metres, +z forward, arms along x) ----------
   Couters (elbows), poleyns (knees, with a side wing), a laminated gorget and layered spaulders that replace the round
   pauldron domes, so no ball joint or tube end shows. Each piece is merged into the part mesh it belongs to (couter ->
   ForeArm, poleyn -> Shin, gorget -> Chest, spaulder -> Pauldron): no extra draw calls, it breaks off with that part,
   and one geometry per part and variant is shared by every knight. Pieces are rigid to one bone (or blend two). */
const _p = new THREE.Vector3(); const _n = new THREE.Vector3();
function plateSet() {
  const P = []; const UV = []; const SI = []; const SW = []; const I = [];
  const vert = (p, b) => { P.push(p.x, p.y, p.z); UV.push((p.x + p.z * 0.7) * 2.6, p.y * 2.6); SI.push(b[0], b[1] ?? b[0], 0, 0); SW.push(1 - (b[2] || 0), b[2] || 0, 0, 0); return P.length / 3 - 1; };
  /* a plate with thickness: f(s, t) -> [point, outward normal], s and t in 0..1; bone(p) -> [bone, bone2, weight2] */
  const shell = (f, rows, cols, th, bone) => {
    const outer = []; const inner = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const [p, n] = f(i / rows, j / cols); const b = bone(p);
      outer.push(vert(p, b)); inner.push(vert(_p.copy(p).addScaledVector(n, -th), b));
    }
    const at = (i, j) => i * (cols + 1) + j;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = at(i, j); const b = at(i, j + 1); const c = at(i + 1, j + 1); const d = at(i + 1, j);
      I.push(outer[a], outer[b], outer[c], outer[a], outer[c], outer[d], inner[a], inner[c], inner[b], inner[a], inner[d], inner[c]);
    }
    const rim = (list) => { for (let k = 0; k < list.length - 1; k++) { const a = list[k]; const b = list[k + 1]; I.push(outer[a], inner[a], inner[b], outer[a], inner[b], outer[b]); } };
    const e1 = []; const e2 = []; const e3 = []; const e4 = [];
    for (let j = 0; j <= cols; j++) { e1.push(at(0, j)); e3.push(at(rows, cols - j)); }
    for (let i = 0; i <= rows; i++) { e2.push(at(i, cols)); e4.push(at(rows - i, 0)); }
    rim(e1); rim(e2); rim(e3); rim(e4);
  };
  /* an ellipsoid cap about a pole: centre c, axes (u, v, pole w) with radii r = [ru, rv, rw], open angle a */
  const cap = (c, u, v, w, r, a, th, bone, rows = 4, cols = 12) => shell((s, t) => {
    const th0 = Math.max(0.02, s) * a; const ph = t * Math.PI * 2;
    const x = Math.sin(th0) * Math.cos(ph); const y = Math.sin(th0) * Math.sin(ph); const z = Math.cos(th0);
    const p = c.clone().addScaledVector(u, x * r[0]).addScaledVector(v, y * r[1]).addScaledVector(w, z * r[2]);
    const n = new THREE.Vector3().addScaledVector(u, x / r[0]).addScaledVector(v, y / r[1]).addScaledVector(w, z / r[2]).normalize();
    return [p, n];
  }, rows, cols, th, bone);
  /* a lame: a band round an axis (centre c, axis ax, 'up' dir up), from angle a0 to a1 (0 = up), width along the axis,
     radius r0 at the near edge flaring to r1 at the far edge */
  const lame = (c, ax, up, a0, a1, width, r0, r1, th, bone, cols = 10) => {
    const side = new THREE.Vector3().crossVectors(ax, up).normalize();
    shell((s, t) => {
      const ang = a0 + (a1 - a0) * t; const r = r0 + (r1 - r0) * s;
      const d = new THREE.Vector3().addScaledVector(up, Math.cos(ang)).addScaledVector(side, Math.sin(ang));
      const p = c.clone().addScaledVector(ax, width * s).addScaledVector(d, r);
      return [p, d.clone().addScaledVector(ax, -(r1 - r0) / Math.max(width, 1e-3)).normalize()];
    }, 2, cols, th, bone);
  };
  const rivet = (p, n, bone) => { const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? VY : VX).normalize(); const v = new THREE.Vector3().crossVectors(n, u); cap(p, u, v, n, [0.0065, 0.0065, 0.004], 1.5, 0.002, bone, 1, 5); };
  const build = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.setIndex(I); g.computeVertexNormals(); return g;
  };
  return { cap, lame, rivet, shell, build };
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
/* bone name -> index in this mesh's skeleton */
const boneIx = (mesh, name) => Math.max(0, mesh.skeleton.bones.findIndex((b) => b.name === name));
const PLATES = {
  /* elbow cop on the back of the joint (T-pose: the point of the elbow faces -z), a fan wing on the outer (+y) side */
  couter(mesh, sx) {
    const S = plateSet(); const s = sx > 0 ? 'l' : 'r'; const lo = [boneIx(mesh, `lowerarm_${s}`)]; const E = V3(sx * 0.452, 1.442, -0.082);
    S.cap(E, VX, VY, V3(0, 0.25, -1).normalize(), [0.09, 0.094, 0.078], 1.22, 0.005, () => lo);
    S.cap(E.clone().add(V3(0, 0.072, -0.03)), VX, V3(0, 0.3, 1).normalize(), V3(0, 1, -0.5).normalize(), [0.095, 0.062, 0.026], 1.35, 0.004, () => lo, 3, 10);
    S.rivet(E.clone().add(V3(0, 0.02, -0.096)), V3(0, 0.2, -1).normalize(), () => lo);
    return S.build();
  },
  /* knee cop (the knee faces +z) with a heart-shaped side wing outward, and a lame above and below */
  poleyn(mesh, sx) {
    const S = plateSet(); const s = sx > 0 ? 'l' : 'r'; const calf = [boneIx(mesh, `calf_${s}`)]; const thigh = [boneIx(mesh, `thigh_${s}`)]; const K = V3(sx * 0.092, 0.548, 0.012);
    S.cap(K, VX, VY, VZ, [0.088, 0.096, 0.092], 1.2, 0.005, () => calf);
    S.cap(K.clone().add(V3(sx * 0.075, 0.0, 0.0)), VY, VZ, V3(sx, 0, 0.35).normalize(), [0.085, 0.066, 0.024], 1.3, 0.004, () => calf, 3, 10);
    S.lame(K.clone().add(V3(0, 0.07, -0.01)), VY, VZ, -1.3, 1.3, 0.05, 0.1, 0.094, 0.004, () => thigh);
    S.lame(K.clone().add(V3(0, -0.065, -0.01)), V3(0, -1, 0), VZ, -1.25, 1.25, 0.045, 0.096, 0.09, 0.004, () => calf);
    S.rivet(K.clone().add(V3(sx * 0.1, 0.0, 0.03)), V3(sx, 0, 0.5).normalize(), () => calf);
    return S.build();
  },
  /* three lames round the base of the neck, the lower ones on the chest, the top one on the neck */
  gorget(mesh) {
    const S = plateSet(); const s3 = boneIx(mesh, 'spine_03'); const nk = boneIx(mesh, 'neck_01');
    const C = V3(0, 1.405, -0.012); const ell = (r) => r;
    const ring = (y, h, r0, r1, b) => S.shell((s, t) => { const a = t * Math.PI * 2; const r = r0 + (r1 - r0) * s; const p = V3(Math.sin(a) * r * 1.12, y + h * s, C.z + Math.cos(a) * r * 0.95); return [p, V3(Math.sin(a) / 1.12, (r0 - r1) / h * 0.6, Math.cos(a) / 0.95).normalize()]; }, 1, 18, 0.004, () => b);
    ring(1.53, 0.05, ell(0.178), 0.142, [s3]);
    ring(1.565, 0.045, 0.145, 0.12, [s3, nk, 0.4]);
    ring(1.597, 0.04, 0.122, 0.108, [nk]);
    for (const a of [-0.5, 0.5]) S.rivet(V3(Math.sin(a) * 0.162 * 1.12, 1.553, C.z + Math.cos(a) * 0.162 * 0.95), V3(Math.sin(a), 0.6, Math.cos(a)).normalize(), () => [s3]);
    return S.build();
  },
  /* a spaulder: a domed cap on the shoulder and lames down the upper arm; kind = layered | great | scrap | leather */
  spaulder(mesh, sx, kind) {
    const S = plateSet(); const s = sx > 0 ? 'l' : 'r'; const cl = boneIx(mesh, `clavicle_${s}`); const ua = boneIx(mesh, `upperarm_${s}`);
    const k = { layered: 1, great: 1.3, scrap: 0.88, leather: 0.92 }[kind] || 1; const lames = { layered: 4, great: 5, scrap: 1, leather: 2 }[kind] ?? 3;
    const AX = V3(sx, 0, 0); const O = V3(sx * 0.2, 1.445, -0.066);
    const tilt = kind === 'scrap' ? 0.35 : 0.0;
    const pole = V3(sx * (0.32 + tilt), 1, kind === 'scrap' ? 0.15 : 0).normalize();
    const cu = new THREE.Vector3().crossVectors(VZ, pole).normalize(); const cv = new THREE.Vector3().crossVectors(pole, cu);
    S.cap(O.clone().add(V3(sx * 0.012 * k, 0.0, 0.0)), cu, cv, pole, [0.13 * k, 0.145 * k, 0.125 * k], 1.32, 0.006, () => [cl, ua, 0.55], 5, 14);
    for (let i = 0; i < lames; i++) {
      const x = 0.075 * k + i * 0.04 * k; const r0 = (0.113 - i * 0.005) * k; const a = (kind === 'scrap' ? 1.3 : 1.85) - i * 0.06;
      S.lame(O.clone().addScaledVector(AX, x), AX, VY, -a, a, 0.05 * k, r0, r0 + 0.016 * k, 0.005, () => [ua]);
      if (kind !== 'leather') for (const q of [-0.9, 0.9]) S.rivet(O.clone().addScaledVector(AX, x + 0.012 * k).add(V3(0, Math.cos(q) * (r0 + 0.004), Math.sin(q) * (r0 + 0.004))), V3(0, Math.cos(q), Math.sin(q)), () => [ua]);
    }
    if (kind === 'layered' || kind === 'great') {
      /* a haute-piece: a standing flange on the neck side of the cap, so the silhouette breaks at the shoulder */
      const hx = sx * 0.125; const hh = 0.065 * k;
      S.shell((s2, t) => { const z = -0.066 + (t - 0.5) * 0.22 * k; const top = Math.sin(Math.PI * t) ** 0.6; return [V3(hx + sx * 0.015 * s2 * top, 1.555 + 0.02 * (k - 1) + hh * s2 * top, z), V3(sx, 0.15, 0).normalize()]; }, 2, 10, 0.005, () => [cl]);
    }
    if (kind === 'great') {
      for (const [dz, ln] of [[-0.05, 0.11], [0.0, 0.14], [0.05, 0.1]]) {
        const b = O.clone().add(V3(sx * 0.04, 0.14 * k, dz)); const d = V3(sx * 0.45, 1, dz * 2).normalize(); const u = new THREE.Vector3().crossVectors(d, VZ).normalize(); const v = new THREE.Vector3().crossVectors(d, u);
        S.shell((s2, t) => { const a = t * Math.PI * 2; const r = 0.018 * (1 - s2) + 0.0008; return [b.clone().addScaledVector(d, ln * s2).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r), u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a))]; }, 3, 8, 0.0, () => [cl, ua, 0.5]);
      }
    }
    return S.build();
  },
};
/* src + extra -> one geometry with every attribute of src (missing ones zero) */
function mergePlates(src, add) {
  const out = new THREE.BufferGeometry(); const n0 = src.attributes.position.count; const n1 = add.attributes.position.count;
  const get = ['getX', 'getY', 'getZ', 'getW'];
  for (const [k, a] of Object.entries(src.attributes)) {
    const b = add.attributes[k]; const size = a.itemSize; const arr = new (k === 'skinIndex' ? Uint16Array : Float32Array)((n0 + n1) * size);
    for (let i = 0; i < n0; i++) for (let c = 0; c < size; c++) arr[i * size + c] = a[get[c]](i);
    if (b) for (let i = 0; i < n1; i++) for (let c = 0; c < Math.min(size, b.itemSize); c++) arr[(n0 + i) * size + c] = b[get[c]](i);
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  const i0 = src.index ? Array.from(src.index.array) : [...Array(n0).keys()];
  const idx = new Uint32Array(i0.length + add.index.count); idx.set(i0); for (let i = 0; i < add.index.count; i++) idx[i0.length + i] = add.index.getX(i) + n0;
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere();
  return out;
}
/* frame-time A/B switches (?perf=gear,grime,mist,plates): each one turns a cost off, for frame-time tests only */
export const PERF = new Set(typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('perf') || '').split(',').filter(Boolean) : []);
const PLATE_GEO = new Map();
/* the geometry for a part mesh with its plates; 'replace' drops the source shape (the old round pauldron) */
function plated(mesh, key, make, replace = false) {
  const k = `${mesh.geometry.uuid}|${key}`;
  if (!PLATE_GEO.has(k)) { const add = make(); PLATE_GEO.set(k, replace ? add : mergePlates(mesh.geometry, add)); }
  return PLATE_GEO.get(k);
}
/* at makeActor: joint plates on every knight (part meshes in the plate steel only) */
function plateKnight(actor) {
  const steelOf = (part) => (actor.parts.get(part) || []).find((m) => m.isSkinnedMesh && STEEL_MAT.test(m.material.name || ''));
  for (const [part, sx] of [['ForeArmL', 1], ['ForeArmR', -1]]) { const m = steelOf(part); if (m) m.geometry = plated(m, `couter${sx}`, () => PLATES.couter(m, sx)); }
  for (const [part, sx] of [['ShinL', 1], ['ShinR', -1]]) { const m = steelOf(part); if (m) m.geometry = plated(m, `poleyn${sx}`, () => PLATES.poleyn(m, sx)); }
  const ch = steelOf('Chest'); if (ch) ch.geometry = plated(ch, 'gorget', () => PLATES.gorget(ch));
  for (const [part, sx] of [['PauldronL', 1], ['PauldronR', -1]]) { const m = steelOf(part); if (m) m.userData.geo0 = m.geometry; }
}
/* at look(): the spaulder shape per side */
function spaulders(actor, kindL, kindR) {
  for (const [part, sx, kind] of [['PauldronL', 1, kindL], ['PauldronR', -1, kindR]]) {
    for (const m of actor.parts.get(part) || []) {
      if (!m.userData.geo0) continue;
      const src = m.userData.geo0; const probe = { geometry: src, skeleton: m.skeleton };
      m.geometry = kind ? plated(probe, `spaulder${sx}${kind}`, () => PLATES.spaulder(m, sx, kind), true) : src;
    }
  }
}

/* Worn plate steel: rust, soot, mud from the feet up and frost on the up-facing plates, from the bind-pose position,
   per actor (uniforms) and per land (the fight passes the land's accent as the eye colour: LAND_GRIME keys on it). */
const GRIME_GLSL = `
varying vec3 vSqGP; varying vec3 vSqGN;
uniform vec4 sqGrime; uniform vec3 sqMud;
float sqGh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sqGn(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sqGh(i), sqGh(i + vec3(1, 0, 0)), f.x), mix(sqGh(i + vec3(0, 1, 0)), sqGh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sqGh(i + vec3(0, 0, 1)), sqGh(i + vec3(1, 0, 1)), f.x), mix(sqGh(i + vec3(0, 1, 1)), sqGh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float sqGf(vec3 p) { return 0.55 * sqGn(p) + 0.3 * sqGn(p * 2.1 + 7.1) + 0.15 * sqGn(p * 4.3 + 3.3); }`;
/* a world's plate lift (gearLook.plate = { map: false | k }): drops the dark plate texture or scales its colour by k */
/* live shader state (textures, uniforms) is kept by material in WeakMaps, never in userData: three's Material.clone()
   JSON-copies userData, so a clone (the giant dress clones its plates) got plain objects back. A clone has no
   entry, so it starts clean: its own map is the first map, and grime()/gearShade() hook it again (clone() drops onBeforeCompile). */
const MAP0 = new WeakMap(); const GRIME_U = new WeakMap(); const GEAR_U = new WeakMap();
export const gearUniforms = (mat) => GEAR_U.get(mat) || null;
export function plateLift(mat) {
  const P = WORLD_MOD?.gearLook?.plate;
  if (!MAP0.has(mat)) MAP0.set(mat, mat.map || null);
  const map0 = MAP0.get(mat);
  const want = P?.map === false ? null : map0;
  if (mat.map !== want) { mat.map = want; mat.needsUpdate = true; }
  if (typeof P?.map === 'number') mat.color.multiplyScalar(P.map);
}
function grime(mat) {
  if (GRIME_U.has(mat)) return GRIME_U.get(mat);
  delete mat.userData.grime; /* an old JSON copy */
  const U = { k: { value: new THREE.Vector4(0.3, 0.4, 0.3, 0) }, mud: { value: new THREE.Color(0x2a2418) } };
  GRIME_U.set(mat, U);
  if (PERF.has('grime')) return U;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.sqGrime = U.k; sh.uniforms.sqMud = U.mud;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${GRIME_GLSL.replace('uniform vec4 sqGrime; uniform vec3 sqMud;', '')}\nvarying vec2 vSqGL;\n${BIND_ATTR}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqGP = sqBindPos(); vSqGN = normal; vSqGL = vec2(sqGf(vSqGP * 6.0), sqGf(vSqGP * 3.5 + 9.0));');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GRIME_GLSL}\nvarying vec2 vSqGL;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gb = vSqGP; float g1 = vSqGL.x; float g2 = 0.65 * sqGn(gb * 19.0 + 4.0) + 0.35 * g1;
        float gMud = smoothstep(0.62, 0.12, gb.y + (g1 - 0.5) * 0.45) * sqGrime.y;
        float g3 = 0.6 * sqGn(gb * 47.0 + 2.0) + 0.4 * sqGn(gb * 13.0 + 6.0); float gRust = smoothstep(0.74, 0.88, g3 * 0.72 + g1 * 0.3 + sqGrime.x * 0.1) * sqGrime.x;
        float gSoot = smoothstep(0.48, 0.78, vSqGL.y) * sqGrime.z;
        float gFrost = smoothstep(0.35, 0.95, normalize(vSqGN).y + (g2 - 0.5) * 0.6) * sqGrime.w;
        diffuseColor.rgb = mix(diffuseColor.rgb, sqMud * (0.55 + 0.6 * g2), gMud * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.065, 0.025) * (0.6 + 0.7 * g3), gRust * 0.75);
        diffuseColor.rgb *= 1.0 - gSoot * 0.55;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.4, 0.46), gFrost * 0.45); /* frosted steel stays steel */
        float gDull = clamp(gMud + gRust + gFrost * 0.4, 0.0, 1.0);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, gDull) + gSoot * 0.1;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - gDull * 0.85;');
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-grime`;
  mat.needsUpdate = true;
  return U;
}
/* per land (keyed by the land accent): rust, mud, soot, frost; mud colour; cloth dye mixed into the foes' cloth */
const LAND_GRIME = {
  0xc8ff6a: { k: [0.75, 0.9, 0.15, 0], mud: 0x262a18, dye: 0x262c1a }, /* drownedfen */
  0x6affc0: { k: [0.5, 0.7, 0.15, 0], mud: 0x22261a, dye: 0x1c2a1e }, /* vinewild */
  0xa8c4ff: { k: [0.3, 0.6, 0.3, 0.22], mud: 0x34302a, dye: 0x262a34 }, /* barrowmoor */
  0xffb050: { k: [0.35, 0.55, 0.2, 0], mud: 0x5a4028, dye: 0x4a2a18 }, /* dusksteppe */
  0xff5a1f: { k: [0.2, 0.35, 0.85, 0], mud: 0x3a3430, dye: 0x2a0e0a }, /* ashlands */
  0x7fd4ff: { k: [0.2, 0.2, 0.1, 0.75], mud: 0x4a525a, dye: 0x222a36 }, /* frostpass */
  0x9dff6a: { k: [0.5, 0.75, 0.15, 0], mud: 0x1e2414, dye: 0x1e2618 }, /* deepwood */
  0xb8a6ff: { k: [0.85, 0.3, 0.1, 0], mud: 0x5a5a56, dye: 0x24223a }, /* stormcoast */
};
/* the same grime by land id, for a look that names its land (`grime: 'deepwood'`); a world registers its own lands here */
const GRIME_BY_LAND = { drownedfen: LAND_GRIME[0xc8ff6a], vinewild: LAND_GRIME[0x6affc0], barrowmoor: LAND_GRIME[0xa8c4ff], dusksteppe: LAND_GRIME[0xffb050],
  ashlands: LAND_GRIME[0xff5a1f], frostpass: LAND_GRIME[0x7fd4ff], deepwood: LAND_GRIME[0x9dff6a], stormcoast: LAND_GRIME[0xb8a6ff] };
/* the eye light: a small soft glint deep in the visor, not a lit slab (the Eyes boxes glow only near their centres) */
function eyeGlint(mat) {
  if (mat.userData.glint) return mat;
  mat.userData.glint = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqEP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqEP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqEP;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 d = vec3(abs(vSqEP.x) - 0.046, (vSqEP.y - 1.705) * 1.6, vSqEP.z - 0.142);
          float g = exp(-dot(d, d) / 0.00011); totalEmissiveRadiance *= 0.015 + 0.75 * g + 0.35 * g * g * g; }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-glint`;
  mat.color.set(0x000000); mat.needsUpdate = true;
  return mat;
}
/* the foe class, read from the helm the fight gives it (vary seed set = a fight foe) */
const FOE_CLASS = { great: 'guard', kettle: 'thrall', hood: 'stalker', sallet: 'brute' };
const _dye = new THREE.Color();

/* An actor: a cloned rigged model with a mixer and named clips. */
export async function makeActor(url) {
  const gltf = await loadGLB(url);
  const isKnight = url === KNIGHT_URL || /\/knight[\w.-]*\.glb$/.test(url);
  const model = SkeletonUtils.clone(gltf.scene);
  let root = model;
  if (isKnight) { root = new THREE.Group(); model.scale.setScalar(1.27); root.add(model); }
  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  if (isKnight) for (const [alias, [name]] of Object.entries(KNIGHT_CLIPS)) if (clips.has(name) && !clips.has(alias)) clips.set(alias, clips.get(name));
  const meshes = []; const parts = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false; o.material = addRim(o.material.clone(), 1); meshes.push(o);
    /* mipmapped and anisotropic, so the plate maps never crawl at a grazing angle */
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) { const t = o.material[k]; if (t && t.anisotropy < 8) { t.anisotropy = 8; t.needsUpdate = true; } }
    if (isKnight) {
      let p = o; let part = null;
      while (p && !part) { part = KNIGHT_PARTS.find((n) => p.name === n || p.name.startsWith(n + '_') || p.name.replace(/[._]?\d+$/, '') === n) || null; p = p.parent; }
      /* the body mesh is named Mannequin; a mesh with an unknown name has no part (hidden by look) */
      o.userData.part = part;
      if (part) { if (!parts.has(part)) parts.set(part, []); parts.get(part).push(o); }
    }
  });
  let current = null;
  const actor = {
    root, model, mixer, clips, meshes, parts, current: null,
    has: (name) => clips.has(name),
    play(name, { loop = true, fade = 0.15, speed = 1, clamp = true, restart = false } = {}) {
      const clip = clips.get(name);
      if (!clip) return 0;
      actor.held = null;
      if (actor.current === name && loop && !restart) { if (current) current.timeScale = speed * (KNIGHT_CLIPS[name]?.[1] || 1); return clip.duration; }
      const next = mixer.clipAction(clip);
      if (isKnight && KNIGHT_CLIPS[name]?.[1]) speed *= KNIGHT_CLIPS[name][1];
      next.reset(); next.timeScale = speed;
      if (speed < 0) next.time = clip.duration;
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = clamp;
      if (current && current !== next) next.crossFadeFrom(current, fade, false);
      next.play(); current = next; actor.current = name;
      return clip.duration / Math.abs(speed);
    },
    duration: (name) => clips.get(name)?.duration ?? 0,
    setSpeed(s) { if (current) current.timeScale = s; },
    /* play a clip once and freeze it at `at` seconds (clip time): a kneel, a bow, a fall held as a pose.
       speed 0 snaps to the pose (with the fade); returns the seconds until the pose holds */
    hold(name, at, { fade = 0.25, speed = 1 } = {}) {
      if (!clips.has(name)) return 0;
      actor.play(name, { loop: false, fade, speed: speed || 1, restart: true });
      const a = current; const T = Math.min(at, clips.get(name).duration);
      if (!speed) { a.time = T; a.timeScale = 0; return fade; }
      actor.held = { a, at: T }; return T / Math.abs(a.timeScale || 1);
    },
    knight: isKnight,
    /* Knight only: which parts show, the steel tone, the cloth tone and the eye colour. */
    look({ helm = 'great', horns = false, crown = false, heavy = false, pauldrons = true, cloak = true, tabard = true, robe = false, armor = true,
      steel = 0x8f97a6, cloth = 0x2a2226, eye = 0xff5a1e, eyePower = 5, bare = false, skin = null, /* skin: the bare body colour (hex) for a world look */
      under = 'mail', /* the body under world wear (armor false): 'mail' (dark default: hauberk, coif), 'cloth' (quilted, no mail), or a hex (plain cloth or skin of that colour) */
      /* boss options: helm 'giant'; sleeves, boneHands, ironCrown, shroud, giant (pauldrons + collar); body false hides the mannequin */
      sleeves = false, boneHands = false, ironCrown = false, shroud = false, giant = false, body = true, skull = false,
      /* worlds: wear = wardrobe part names to show (actor.wear loads them; they show even with armor false);
         cls = foe class ('guard' | 'thrall' | 'stalker' | 'brute' | null), else read from the helm on a fight foe;
         grime = a land id or { k: [rust, mud, soot, frost], mud, dye }, else read from the eye colour (the land accent) */
      wear = null, cls: clsArg = undefined, grime: grimeArg = undefined,
      /* hide = part names forced off after every rule (plate tubes over a clothed body, the glow eyes over a real
         face); tint = { materialName: colour } for worn meshes (a wardrobe outfit dyed for a world) */
      hide = null, tint = null,
      /* vary: a seed for per-foe differences (posture, build, a missing plate, a torn tabard, tones). Default: on for a
         look with eyePower 7 (the fight's foes), off for everything else; a later look() without it undoes it. */
      vary = undefined } = {}) {
      actor.lastLook = arguments[0] || {};
      const worn = new Set(wear || []);
      const seed = vary === true || (vary === undefined && eyePower === 7 && !giant && !shroud && helm !== 'giant') ? ++VARY_SEQ * 7919 : (typeof vary === 'number' ? vary : null);
      const on = {
        Helm_great: helm === 'great', Helm_sallet: helm === 'sallet', Helm_kettle: helm === 'kettle', Hood: helm === 'hood', GiantHelm: helm === 'giant', Eyes: true,
        Horns: horns && helm !== 'hood', Crown: crown && helm === 'great', HeavyL: heavy, HeavyR: heavy, PauldronL: pauldrons && !giant, PauldronR: pauldrons && !giant,
        Cloak: cloak, Tabard: tabard, Robe: robe,
        Sleeves: sleeves, BoneHands: boneHands, IronCrown: ironCrown, Shroud: shroud, GiantPauldronL: giant, GiantPauldronR: giant, GiantCollar: giant,
        GiantTasset: giant, GiantLegL: giant, GiantLegR: giant, GiantGauntletL: giant, GiantGauntletR: giant, Fauld: !giant, LichSkull: skull,
      };
      actor.spec = { steel, cloth, eye, eyePower };
      const cls = clsArg !== undefined ? clsArg || null : seed != null ? FOE_CLASS[helm] || null : null;
      const land = grimeArg !== undefined ? (typeof grimeArg === 'string' ? GRIME_BY_LAND[grimeArg] : grimeArg) || null : LAND_GRIME[eye] || null; const rr = rng((seed || 1) + 17);
      for (const m of meshes) {
        const part = m.userData.part; const mat = m.material; const name = mat.name || '';
        if (part === 'Mannequin') { const plain = !bare && typeof under === 'number'; m.visible = body; mat.color.set(bare ? (skin ?? 0x8f887a) : plain ? under : 0x17171b); mat.roughness = bare || plain ? 0.9 : 0.7; mat.metalness = bare || plain ? 0 : 0.25; if (!bare) underLayer(mat); const UU = UNDER_U.get(mat); if (UU) { UU.k.value = bare || plain ? 0 : 1; UU.mail.value = under === 'cloth' ? 0 : 1; } continue; }
        m.visible = m.userData.wear ? worn.has(part) : armor && (part in on ? on[part] : BASE_PARTS.has(part));
        if (skull && part === 'Hood' && VOID_MAT.test(name)) m.visible = false; /* the skull shows under the hood */
        m.userData.broken = false;
        if (CLOTH_PARTS.has(part) || CLOTH_MAT.test(name)) { mat.side = THREE.DoubleSide; if (!VOID_MAT.test(name)) { mat.color.set(cloth); if (cls && land && actor.lastLook.dye !== false) mat.color.lerp(_dye.set(land.dye), 0.4 + rr() * 0.3); } } /* look.dye = false keeps the cloth its own colour */
        if (RUNE_MAT.test(name)) { m.userData.glow = true; mat.emissive = new THREE.Color(eye); mat.emissiveIntensity = eyePower * 0.6; mat.color.set(0x000000); }
        else if (EYE_MAT.test(name)) { eyeGlint(mat); mat.emissive = new THREE.Color(eye); mat.emissiveIntensity = eyePower; }
        else if (STEEL_MAT.test(name)) {
          const o = mat.userData.pbr0 ||= { metal: mat.metalness, rough: mat.roughness };
          mat.color.set(steel); mat.envMapIntensity = 1.5; mat.normalScale?.set(1.6, 1.6); mat.metalness = o.metal; mat.roughness = o.rough;
          plateLift(mat);
          /* the stalker wears boiled leather where the others wear plate */
          if (cls === 'stalker') { mat.color.set(0x5a4434); mat.metalness = o.metal * 0.12; mat.roughness = Math.min(1, o.rough * 1.15); }
          const G = grime(mat); const k = land ? land.k : [0.12, 0.2, 0.15, 0]; const f = cls ? 0.75 + rr() * 0.5 : 0.6;
          const extra = { thrall: [1.35, 1.2, 1, 1], brute: [1, 1, 1.4, 1], stalker: [0.3, 1.1, 0.6, 1] }[cls] || [1, 1, 1, 1];
          G.k.value.set(Math.min(1, k[0] * f * extra[0]), Math.min(1, k[1] * f * extra[1]), Math.min(1, k[2] * f * extra[2]), k[3] * extra[3]); G.mud.value.set(land ? land.mud : 0x2a2418);
        }
        else if (GOLD_MAT.test(name)) { mat.envMapIntensity = 1.6; }
        else if (MAIL_MAT.test(name)) mailCoat(mat);
        m.userData.base = null;
      }
      varyActor(actor, seed, { helm, pauldrons, heavy, steel, cloth });
      /* spaulders by class: layered plates (both sides), the brute one great spiked spaulder (asymmetric), the stalker
         small leather ones, the thrall a single scrap plate on one shoulder; heroes and bosses the layered pair */
      const kinds = { guard: ['layered', 'layered'], brute: rr() < 0.5 ? ['great', 'layered'] : ['layered', 'great'], stalker: ['leather', 'leather'], thrall: ['scrap', 'scrap'] }[cls] || ['layered', 'layered'];
      spaulders(actor, kinds[0], kinds[1]);
      if (cls === 'thrall' && armor) { const side = rr() < 0.5 ? 'PauldronL' : 'PauldronR'; for (const m of parts.get(side) || []) m.visible = true; }
      if (cls === 'brute') for (const h of ['HeavyL', 'HeavyR']) for (const m of parts.get(h) || []) m.visible = false; /* the great spaulder replaces the round heavy domes */
      if (cls === 'brute' && armor) for (const p of ['PauldronL', 'PauldronR']) for (const m of parts.get(p) || []) m.visible = true;
      if (hide) for (const h of hide) for (const m of parts.get(h) || []) m.visible = false;
      for (const m of meshes) { if (!m.userData.wear) continue; const c0 = m.material.userData.c0 ||= m.material.color.clone(); const t = tint?.[m.material.name]; if (t != null) m.material.color.set(t); else if (m.material.userData.tinted) m.material.color.copy(c0); m.material.userData.tinted = t != null; }
    },
    /* Names of armour parts that are on the body now. */
    wornParts() { return [...parts.keys()].filter((p) => p !== 'Mannequin' && p !== 'Eyes' && parts.get(p).some((m) => m.visible)); },
    /* Takes a part off the body and returns it as loose rigid pieces in world space. */
    breakPart(name) {
      const list = parts.get(name); if (!list) return [];
      const out = [];
      for (const m of list) { if (!m.visible) continue; if (m.isSkinnedMesh) out.push(bakeSkinned(m)); m.visible = false; m.userData.broken = true; }
      if (/^Helm_|^Hood$/.test(name)) for (const h of ['Horns', 'Crown']) for (const m of parts.get(h) || []) { if (m.visible) { out.push(bakeSkinned(m)); m.visible = false; } }
      return out;
    },
    /* Worlds: loads a wardrobe (armature + named parts, no clips) and binds its skinned
       meshes to this actor's skeleton by bone name. The parts stay hidden until a look names them in `wear`.
       Calls look() again with the last look, so the order of wear() and look() does not matter. */
    async wear(url, opt = null) {
      if (!url || actor.worn?.has(url)) return actor;
      (actor.worn ||= new Set()).add(url);
      const gltf = await loadGLB(url);
      const bones = new Map(); model.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
      const arm = model.getObjectByName('Armature') || model;
      const src = gltf.scene.clone(true);
      const found = [];
      src.traverse((o) => { if (o.isSkinnedMesh) found.push(o); });
      /* opt.only = a Set of part names: only those are bound (a foe wears nine parts of a forty-part file).
         Parts that share a skin in the file share ONE skeleton here (one bone-matrix update a frame, not one per part). */
      const shared = new Map();
      for (const o of found) {
        if (opt?.only && !opt.only.has((o.name || '').replace(/[._]?\d+$/, ''))) continue;
        const sk = o.skeleton; const list = sk.bones.map((b) => bones.get(b.name));
        if (list.some((b) => !b)) { console.warn('wear: a bone is missing on the actor', url, sk.bones.filter((b) => !bones.get(b.name)).map((b) => b.name)); continue; }
        let p = o; let name = null; while (p && !name) { if (p.name && p !== src && !p.isBone && p.name !== 'Armature' && p.name !== 'Scene') name = p.name.replace(/[._]?\d+$/, ''); p = p.parent; }
        const bindMatrix = o.bindMatrix.clone();
        arm.add(o); o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
        let nsk = shared.get(sk); if (!nsk) { nsk = new THREE.Skeleton(list, sk.boneInverses.map((m) => m.clone())); shared.set(sk, nsk); }
        o.bind(nsk, bindMatrix);
        o.castShadow = true; o.frustumCulled = false; o.material = addRim(o.material.clone(), 1);
        o.userData.part = name; o.userData.wear = true; o.visible = false;
        meshes.push(o); if (!parts.has(name)) parts.set(name, []); parts.get(name).push(o);
      }
      if (actor.lastLook) actor.look(actor.lastLook);
      return actor;
    },
    eyes(power, color) { for (const m of parts.get('Eyes') || []) { m.material.emissiveIntensity = power; if (color != null) m.material.emissive.set(color); } },
    slot(name) { return root.getObjectByName(name); },
    hideByName(test) { for (const m of meshes) if (test(m.name)) m.visible = false; },
    tint(color, amount) {
      for (const m of meshes) {
        if (!m.userData.base) m.userData.base = { color: m.material.color.clone(), map: m.material.map };
        m.material.map = amount >= 1 ? null : m.userData.base.map;
        m.material.color.copy(m.userData.base.color).lerp(new THREE.Color(color), amount);
        m.material.needsUpdate = true;
      }
    },
    /* a hit is a rim pulse on the silhouette (addRim's sqHit), never a full-body colour swap (the old emissive
       flash turned a foe into a flat white, pink or mint dummy). power keeps the old scale (0.02 .. 0.35); a flash longer
       than 0.5 s (a frozen foe) holds a soft rim and fades at the end. Every mesh under the root takes it, worn parts too. */
    flash(color = 0xffffff, ms = 90, power = 0.35) {
      const long = ms > 500; const k = Math.min(long ? 0.9 : 2.2, power * (long ? 14 : 18)); const now = performance.now() / 1000;
      const dur = long ? ms / 1000 : Math.max(0.17, ms / 1000 * 2);
      root.traverse((o) => { if (!o.isMesh || o.userData.part === 'Eyes' || o.userData.glow) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const u = HIT_U.get(m); if (!u || EYE_MAT.test(m.name || '')) continue;
          /* a stronger pulse still running is not cut short by a weaker one */
          const left = u.sqHit.value.x + u.sqHit.value.y - now; if (left > 0.04 && u.sqHit.value.z > k * 1.2 && !long) continue;
          u.sqHit.value.set(now, dur, k, long ? 1 : 0); u.sqHitC.value.set(color); } });
    },
    /* Fades the body and cloth out (used when a hollow foe dies). k: 1 solid .. 0 gone. */
    fade(k) {
      for (const m of meshes) {
        if (!m.visible || EYE_MAT.test(m.material.name || '')) continue;
        if (!m.material.transparent) { m.material.transparent = true; m.material.needsUpdate = true; }
        /* a fading body stops writing depth: the post fog reads the depth buffer, so a see-through body still in the depth
           cut a hard unfogged silhouette out of the land behind it (the storybook giant's death) */
        m.material.opacity = k; m.material.depthWrite = k >= 0.98; m.castShadow = k > 0.5;
      }
    },
    dispose() { clearTimeout(actor.flashTimer); root.removeFromParent(); mixer.stopAllAction(); ACTORS.delete(actor); },
  };
  /* a held pose freezes on the frame the clip reaches it (actor.hold) */
  /* actor.pose(bone, fn): fn(bone, actor) runs after every mixer update, so a world can bend a bone of a held or clipped pose
     (straighten a kneel, lift a head) without its own mixer hook. bone = a bone name or object; returns an off(). */
  actor.posers = [];
  actor.pose = (name, fn) => { const b = typeof name === 'string' ? root.getObjectByName(name) : name; if (!b || typeof fn !== 'function') return () => {}; const p = { b, fn }; actor.posers.push(p); return () => { const i = actor.posers.indexOf(p); if (i >= 0) actor.posers.splice(i, 1); }; };
  /* three's PropertyMixer writes a bone only when the clip value changes, so on a held or finished clip (a
     corpse, a kneel) every layer that bends bones after the mixer (posture, actor.pose, react.js) piled up frame on frame:
     corpses rolled over, arms swung through the ground (the "T-poses" and stiff limbs). Each
     update first puts back the clip's own pose on every bone the mixer left alone, so the layers are offsets again. */
  const BONES = []; model.traverse((o) => { if (o.isBone) BONES.push({ b: o, base: o.quaternion.clone(), fin: o.quaternion.clone() }); });
  /* cost: two compares and at most one copy per bone (about 2 to 5 microseconds per actor); an actor off the scene skips it */
  { const mu = mixer.update.bind(mixer); mixer.update = (dt) => { const on = !actor.noReset && root.visible && !!root.parent; if (on) for (let i = 0; i < BONES.length; i++) BONES[i].fin.copy(BONES[i].b.quaternion); const r = mu(dt);
    if (on) for (let i = 0; i < BONES.length; i++) { const x = BONES[i]; const q = x.b.quaternion; if (q.equals(x.fin)) { if (!q.equals(x.base)) q.copy(x.base); } else x.base.copy(q); }
    const H = actor.held; if (H && H.a.time >= H.at) { H.a.time = H.at; H.a.timeScale = 0; actor.held = null; } const P = actor.posers; for (let i = 0; i < P.length; i++) P[i].fn(P[i].b, actor); return r; }; }
  if (isKnight && !PERF.has('plates')) plateKnight(actor);
  ACTORS.add(actor);
  return actor;
}

/* Gear modelled by script in Blender for the knight. Metres, grip at the origin, blade or head along +Y.
   No textures: the surface detail is procedural (gearShade), driven by the UV each part carries (see the generator):
   blade = ground edge brighter and smoother than the flat, scratches along the blade, pitting, soot at the guard, rust;
   forge = hammered iron with dents, pits and soot; leather = a spiral wrap with grain; wood = grain along the haft;
   paint = shield planks under worn paint with a faded device. Every kind caps its own highlight (no clipped faces). */
const GEAR_GLSL = `
varying vec2 vSqUv; varying vec3 vSqP;
uniform float sqWear; uniform float sqCap; uniform vec3 sqPaint; uniform vec3 sqDevice;
float sqH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sqN3(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sqH3(i), sqH3(i + vec3(1, 0, 0)), f.x), mix(sqH3(i + vec3(0, 1, 0)), sqH3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sqH3(i + vec3(0, 0, 1)), sqH3(i + vec3(1, 0, 1)), f.x), mix(sqH3(i + vec3(0, 1, 1)), sqH3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float sqF3(vec3 p) { return 0.55 * sqN3(p) + 0.3 * sqN3(p * 2.13 + 7.1) + 0.15 * sqN3(p * 4.37 + 3.3); }
/* 1 while a pattern of this frequency is larger than a pixel, 0 once it would alias */
float sqAAk(vec3 p) { float w = length(fwidth(p)); return 1.0 - smoothstep(0.35, 0.9, w); }
vec3 sqGBump(vec3 p, vec3 n, float h, float k, float fd) {
  vec3 sx = dFdx(p); vec3 sy = dFdy(p); vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * fd; vec2 dh = vec2(dFdx(h), dFdy(h)) * k;
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}`;
const GEAR_FRAG = {
  blade: `
    /* |u| >= 2: a forged head (axe): black forge-scale cheeks, only the ground edge bright */
    float forged = step(1.5, abs(vSqUv.x)); float u = vSqUv.x - sign(vSqUv.x) * 2.0 * forged; float v = vSqUv.y; float e = abs(u);
    float edge = smoothstep(0.76, 0.86, e) * smoothstep(0.0, 0.03, v);
    float cloud = sqF3(vSqP * 9.0);
    vec3 pp = vSqP * 230.0; float pit = smoothstep(0.83, 0.96, sqN3(pp)) * sqAAk(pp) * (1.0 - edge * 0.8);
    vec3 sp = vec3(u * 70.0 + sqN3(vec3(v * 4.0, 0.0, 3.0)) * 3.0, v * 0.5, 2.0);
    float scr = smoothstep(0.84, 0.97, sqN3(sp)) * sqAAk(sp * vec3(1.0, 6.0, 1.0)) * (0.4 + 0.6 * sqN3(vec3(v * 7.0, u * 2.0, 5.0)));
    float soot = (1.0 - smoothstep(0.0, 0.1 + 0.12 * cloud, v)) * (1.0 - edge * 0.6);
    float rust = smoothstep(0.64 - 0.08 * sqWear, 0.84, sqF3(vSqP * 20.0 + 3.0)) * sqWear * (1.0 - edge * 0.9);
    float stain = smoothstep(0.35, 0.75, sqF3(vSqP * 4.0 + 11.0)) * (1.0 - edge);
    diffuseColor.rgb *= mix(0.62 + 0.3 * cloud - 0.18 * stain, 1.28, edge);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.15 + 0.01, scr * 0.5);
    diffuseColor.rgb *= 1.0 - 0.3 * pit;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.022, 0.02), soot * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.055, 0.025), rust * 0.85);
    float scale = forged * (1.0 - edge) * (0.75 + 0.25 * smoothstep(0.3, 0.7, sqF3(vSqP * 26.0)));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.16, 0.15, 0.145), scale);
    float sqRough = mix(roughness * (1.0 + 0.5 * cloud + 0.4 * stain) + 0.3 * pit + 0.25 * soot, roughness * 0.62, edge) - 0.06 * scr + scale * 0.25;
    sqRough = mix(sqRough, 0.85, rust);
    float sqMetal = metalness * (1.0 - rust * 0.75 - soot * 0.5);
    float sqH = scr * 0.3 - pit * 0.4 - rust * 0.3; float sqHK = 0.0015; float sqEdge = edge;`,
  forge: `
    float cloud = sqF3(vSqP * 11.0);
    vec3 hp = vSqP * 30.0; float ham = sqF3(hp) * sqAAk(hp) + 0.5 * (1.0 - sqAAk(hp));
    vec3 pp = vSqP * 120.0; float pit = smoothstep(0.82, 0.96, sqN3(pp)) * sqAAk(pp);
    float hi = smoothstep(0.52, 0.72, ham);
    float soot = smoothstep(0.55, 0.8, sqF3(vSqP * 6.0 + 5.0)) * 0.4;
    float rust = smoothstep(0.66, 0.86, sqF3(vSqP * 17.0 + 9.0) + 0.08 * sqWear) * sqWear;
    diffuseColor.rgb *= (0.75 + 0.2 * cloud + 0.1 * hi) * (1.0 - 0.35 * pit);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.045, 0.04), soot * (1.0 - hi * 0.6));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.05, 0.022), rust * 0.85);
    float sqRough = clamp(roughness * (1.1 - 0.2 * hi) + 0.2 * pit + 0.2 * soot, 0.4, 0.95); sqRough = mix(sqRough, 0.88, rust);
    float sqMetal = metalness * (1.0 - rust * 0.7 - soot * 0.35);
    float sqH = ham * 0.8 - pit * 0.3; float sqHK = 0.004; float sqEdge = 0.0;`,
  leather: `
    float wrapK = step(vSqUv.x, 1.5);
    float s = fract(vSqUv.y / 0.019 + vSqUv.x);
    float ridge = mix(1.0, smoothstep(0.0, 0.2, s) * smoothstep(1.0, 0.78, s), wrapK);
    vec3 gp = vSqP * 120.0; float grain = sqF3(gp) * sqAAk(gp) + 0.5 * (1.0 - sqAAk(gp));
    float worn = sqF3(vSqP * 14.0);
    diffuseColor.rgb *= (0.45 + 0.55 * ridge) * (0.88 + 0.24 * grain) * (0.8 + 0.4 * worn);
    float sqRough = clamp(roughness + 0.18 * grain - 0.22 * ridge * worn, 0.35, 0.95);
    float sqMetal = 0.0;
    float sqH = ridge * 0.8 + grain * 0.1; float sqHK = 0.0025; float sqEdge = 0.0;`,
  wood: `
    vec3 wq = vec3(vSqP.x * 40.0, vSqP.z * 40.0, vSqP.y * 1.6);
    if (vSqUv.x > 1.5) wq = vec3(vSqP.x * 30.0, vSqP.z * 6.0, vSqP.y * 1.4);
    float g = sqF3(wq); float lines = smoothstep(0.3, 0.5, fract(g * 6.0)) * smoothstep(0.8, 0.5, fract(g * 6.0));
    float k = sqAAk(wq * vec3(6.0, 6.0, 1.0)); lines = mix(0.5, lines, k);
    float dirt = sqF3(vSqP * 8.0);
    diffuseColor.rgb *= (0.55 + 0.4 * g) * (0.8 + 0.2 * lines) * (0.7 + 0.35 * dirt);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.016, 0.012), smoothstep(0.55, 0.8, dirt) * 0.6);
    float sqRough = clamp(roughness + 0.1 * (1.0 - lines), 0.4, 0.95); float sqMetal = 0.0;
    float sqH = lines * 0.5 + g * 0.3; float sqHK = 0.0015; float sqEdge = 0.0;`,
  paint: `
    vec2 p = vSqUv; float x = p.x; float z = p.y;
    float pl = fract((x + 0.3) / 0.087); float seam = smoothstep(0.0, 0.04, pl) * smoothstep(1.0, 0.96, pl);
    vec3 wq = vec3(x * 60.0 + floor((x + 0.3) / 0.087) * 3.1, 3.0, z * 2.2); float g = sqF3(wq);
    vec3 wood = vec3(0.075, 0.05, 0.03) * (0.55 + 0.6 * g) * (0.35 + 0.65 * seam);
    float t = (0.40 - z) / 0.82; float hw = 0.27 * (t < 0.32 ? 1.0 : max(0.0, 1.0 - pow((t - 0.32) / 0.68, 1.8)));
    float rim = min(hw - abs(x), 0.40 - z);
    float n = 0.55 * sqF3(vec3(p * 9.0, 1.0)) + 0.6 * sqF3(vec3(p * 41.0, 4.0)) + 0.2 * sqF3(vec3(p * 120.0, 7.0));
    float wear = 0.3 + (n - 0.675) * 1.3 + 0.55 * (1.0 - smoothstep(0.0, 0.035, rim)) + sqWear * 0.12;
    /* sword cuts through the paint */
    float cut = 0.0;
    cut = max(cut, (1.0 - smoothstep(0.0012, 0.003, abs(dot(p - vec2(-0.09, 0.2), normalize(vec2(0.55, -0.83)))))) * step(abs(dot(p - vec2(-0.09, 0.2), vec2(0.83, 0.55))), 0.09));
    cut = max(cut, (1.0 - smoothstep(0.0012, 0.003, abs(dot(p - vec2(0.12, -0.08), normalize(vec2(0.3, 0.95)))))) * step(abs(dot(p - vec2(0.12, -0.08), vec2(-0.95, 0.3))), 0.07));
    cut = max(cut, (1.0 - smoothstep(0.001, 0.0025, abs(dot(p - vec2(0.02, 0.27), normalize(vec2(0.98, 0.2)))))) * step(abs(dot(p - vec2(0.02, 0.27), vec2(-0.2, 0.98))), 0.06));
    float paint = (1.0 - smoothstep(0.66, 0.72, wear)) * (1.0 - cut);
    float dev = 1.0 - smoothstep(0.036, 0.042, abs(x * 0.86 - (z - 0.04) * 0.5));
    vec3 pc = mix(sqPaint, sqDevice, dev * (1.0 - smoothstep(0.55, 0.62, n * 0.9 + 0.1)));
    pc *= 0.8 + 0.35 * sqF3(vec3(p * 5.0, 9.0));
    diffuseColor.rgb = mix(wood * (1.0 - 0.6 * cut), pc, paint);
    float sqRough = mix(0.82, 0.62, paint); float sqMetal = 0.0;
    float sqH = (1.0 - seam) * -0.6 + paint * 0.3 - cut * 0.8; float sqHK = 0.003; float sqEdge = 0.0;`,
};
function gearShade(mat, kind) {
  if (!GEAR_FRAG[kind] || GEAR_U.has(mat)) return mat;
  const U = { wear: { value: 0.6 }, cap: { value: kind === 'blade' ? 1.25 : 1.05 }, paint: { value: new THREE.Color(0x3a120e) }, device: { value: new THREE.Color(0x8a8070) } };
  GEAR_U.set(mat, U); delete mat.userData.gearShade;
  if (PERF.has('gear')) return mat;
  mat.map = null; mat.normalMap = null; mat.roughnessMap = null; mat.metalnessMap = null;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.sqWear = U.wear; sh.uniforms.sqCap = U.cap; sh.uniforms.sqPaint = U.paint; sh.uniforms.sqDevice = U.device;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSqUv; varying vec3 vSqP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqUv = vec2(uv.x, 1.0 - uv.y); vSqP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GEAR_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GEAR_FRAG[kind]}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = sqRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = sqMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = sqGBump(-vViewPosition, normal, sqH, sqHK, faceDirection);')
      /* soft shoulder on the brightest channel: a highlight rolls off toward sqCap instead of clipping to white
         (the ground edge may go a little higher, so a thin glint still runs along it) */
      .replace('#include <opaque_fragment>', `{ float sqC = sqCap * (1.0 + 0.5 * sqEdge); float sqPk = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b)); float sqK = sqC * 0.5;
          if (sqPk > sqK) outgoingLight *= (sqK + (sqPk - sqK) / (1.0 + (sqPk - sqK) / (sqC - sqK))) / sqPk; }
        #include <opaque_fragment>`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-gear-${kind}`;
  mat.needsUpdate = true;
  return mat;
}
/* how gear sits in a slot of the knight: the shield straps to the left forearm */
export const GEAR_MOUNT = { shield: { r: [0, Math.PI, 0], p: [-0.09, -0.06, -0.06] } }; /* painted face out, the forearm behind the board in the straps */
/* ---------- worlds: a world module (web/src/worlds/<id>.js) adds its light looks, gear names, mounts and grime ----------
   registerWorld(mod) merges mod.looks into LOOK (keyed by the world's land ids), mod.gear into the gear registry,
   mod.mounts into GEAR_MOUNT and mod.grime into the grime by land id, and keeps mod as the current world (worldMod()).
   Nothing is removed: land ids are unique per world, so a switch back to dark needs no undo. */
let WORLD_MOD = null;
/* a shield-type offhand: 'shield', or a world gear whose mount says shield: true (mounts.neon_buckler = { r, p, shield: true }) */
export function isShield(id) { return id === 'shield' || !!(id && WORLD_MOD?.mounts?.[id]?.shield); }
export function registerWorld(mod) {
  WORLD_MOD = mod && mod.id && mod.id !== 'dark' ? mod : null;
  if (!WORLD_MOD) return null;
  for (const [k, v] of Object.entries(mod.looks || {})) if (!LOOK[k]) LOOK[k] = v;
  registerGear(mod.gear || []);
  for (const [k, v] of Object.entries(mod.mounts || {})) GEAR_MOUNT[k] = v;
  for (const [k, v] of Object.entries(mod.grime || {})) GRIME_BY_LAND[k] = v;
  return WORLD_MOD;
}
export const worldMod = () => WORLD_MOD;
/* the current world's wardrobe url, or null */
export const worldWear = () => WORLD_MOD?.wear || null;
/* the first-person place of a shield-type offhand in the left hand (fight.js): rotation (0, PI, 0) and z -0.07 by default; a world
   mount may add fp: { p, r, s } for a small or odd shield (mounts.neon_buckler.fp = { s: 1.6, p: [0.12, 0.1, -0.07] }) */
export function fpMount(g, name) { const f = GEAR_MOUNT[name]?.fp; g.rotation.fromArray(f?.r || [0, Math.PI, 0]); g.position.fromArray(f?.p || [0, 0, -0.07]); g.scale.setScalar(f?.s ?? 1); return g; }
export function mountGear(g, name) { const m = GEAR_MOUNT[name]; if (m) { g.rotation.fromArray(m.r); g.position.fromArray(m.p); } return g; }
/* ---------- how a hero holds a weapon in third person (the camp, the end card, the title reel) ----------
   Gear is authored for the knight's right-hand slot in the SWORD clips: blade or head along +y, the edge or the muzzle along +x. In any other
   clip the slot points elsewhere, so an axe trailed behind the hip, a staff pointed down and back and a pistol's muzzle pointed back over the
   shoulder. holdFor(weapon) names the clip a weapon class stands in and where its business end points (hero frame: +x = the hero's left,
   +y = up, +z = forward); holdGear turns the gear in its slot to match; holdHero does both for an actor. The slot's own orientation in each
   clip is measured, so nothing is sampled at run time. The sword class keeps its old grip (holdFor gives null). */
const HOLD_SLOT_Q = {
  Idle_Talking_Loop: { r: [-0.18001, 0.79505, -0.17004, 0.5537], l: [0.21217, 0.922, -0.01241, -0.32365] },
  Pistol_Idle_Loop: { r: [-0.08147, 0.713, -0.04997, 0.69462], l: [-0.26397, -0.75869, -0.28023, 0.52552] },
};
/* face: the gear axis that faces forward, as a hero-frame direction. The camp and the card look at the hero's front, so a blade, a spear leaf or a
   bow is turned to show its flat to the viewer (face [-1,0,0]: the edge points out to the hero's right). A side-on shot overrides it. */
const STAND = { clip: 'Idle_Talking_Loop', t: 0.4, face: [-1, 0, 0], slide: 0 };
export const HOLDS = {
  axe: { ...STAND, dir: [-0.25, 1, 0.45], slide: 0.1 },
  maul: { ...STAND, dir: [-0.2, 1, 0.4], slide: 0.1 },
  pole: { ...STAND, dir: [-0.1, 1, 0.2], slide: 0.45 }, /* spear, staff: the butt stands on the ground */
  pistol: { ...STAND, dir: [-0.2, 1, 0.3] }, /* held ready, muzzle up, never at the viewer */
  bow: { ...STAND, dir: [-0.15, 1, 0.1] },
  daggers: { ...STAND, dir: [-0.25, 0.9, 0.5], off: { dir: [0.25, 0.9, 0.5], face: [1, 0, 0] } },
};
const HOLD_OF = { axe: 'axe', greatsword: 'axe', maul: 'maul', spear: 'pole', staff: 'pole', pistol: 'pistol', rifle: 'pistol', bow: 'bow', daggers: 'daggers' };
/* the pose of a kit weapon (its id), or null for the sword class */
export const holdFor = (weapon) => HOLDS[HOLD_OF[weapon?.id]] || null;
/* a = the gear axis that points at the target (head, muzzle, bow top), b = the axis that faces forward (blade, top of a gun, bow belly) */
const HOLD_KINDS = { pole: [[0, 1, 0], [1, 0, 0]], gun: [[1, 0, 0], [0, 1, 0]], bow: [[0, 1, 0], [1, 0, 0]] };
const holdKind = (gear) => (/revolver|stunner|rifle/.test(gear || '') ? 'gun' : /bow|yumi/.test(gear || '') ? 'bow' : 'pole');
const holdBasis = (p, q) => { /* a rotation whose columns are p, q squared to p, and their cross product */
  const X = new THREE.Vector3(...p).normalize(); const Z = new THREE.Vector3().crossVectors(X, new THREE.Vector3(...q)).normalize(); const Y = new THREE.Vector3().crossVectors(Z, X);
  return new THREE.Matrix4().makeBasis(X, Y, Z);
};
/* the gear's rotation inside its slot (and the hand's place on the shaft) for a pose; ms > 0 eases there. spec = a HOLDS entry or its .off. */
export function holdGear(g, spec, hand = 'r', ms = 0, clip = spec.clip) {
  const sq = HOLD_SLOT_Q[clip]?.[hand]; if (!g || !sq || !spec.dir) return g;
  const [a, b] = HOLD_KINDS[holdKind(g.userData.gear)];
  const qw = new THREE.Quaternion().setFromRotationMatrix(holdBasis(spec.dir, spec.face || [0, 0, 1]).multiply(holdBasis(a, b).invert()));
  const q = new THREE.Quaternion().fromArray(sq).invert().multiply(qw);
  const pos = new THREE.Vector3(...a).applyQuaternion(q).multiplyScalar(-(spec.slide || 0));
  if (!(ms > 0) || typeof requestAnimationFrame !== 'function') { g.quaternion.copy(q); g.position.copy(pos); return g; }
  const q0 = g.quaternion.clone(); const p0 = g.position.clone(); const t0 = performance.now(); g.userData.holdTween = t0;
  const step = (now) => {
    if (g.userData.holdTween !== t0) return; /* a newer hold took over */
    const k = Math.min(1, (now - t0) / ms); const e = k * k * (3 - 2 * k);
    g.quaternion.slerpQuaternions(q0, q, e); g.position.lerpVectors(p0, pos, e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return g;
}
/* an armed hero stands in its weapon's pose: the clip, then the gear turned to fit it (a sword class keeps the old idle) */
/* the stand clip is a talking idle: its free hand points a finger and its weapon hand is open. With real
   hands that shows. The hold plays a copy of the clip where the free arm hangs as in Idle_Loop (unless it holds a second
   weapon) and the fingers of the weapon hand close as in Sword_Idle. The wrist that carries the gear is not touched. */
export function standClip(actor, hold) {
  const name = `${hold.clip}+${hold.off ? 'two' : 'one'}`; if (actor.clips.has(name)) return name;
  const base = actor.clips.get(hold.clip); const rest = actor.clips.get('Idle_Loop'); const grip = actor.clips.get('Sword_Idle'); if (!base) return hold.clip;
  /* the pose at the clip's start, read through the track's own interpolant (a cubic-spline track stores tangents beside its values) */
  const first = (clip, bone) => { const t = clip?.tracks.find((k) => k.name === `${bone}.quaternion`); if (!t) return null; const v = Array.from(t.createInterpolant().evaluate(t.times[0])); return v.length === 4 && v.every(Number.isFinite) ? v : null; };
  const FING = /^(index|middle|ring|pinky|thumb)_\d+_([lr])$/; const ARM_L = /^(clavicle|upperarm|lowerarm|hand)_l$/;
  const tracks = base.tracks.map((k) => {
    const [bone, prop] = k.name.split('.'); if (prop !== 'quaternion') return k;
    const f = FING.exec(bone); let v = null;
    if (f && f[2] === 'r') v = first(grip, bone); else if (!hold.off && (ARM_L.test(bone) || (f && f[2] === 'l'))) v = first(rest, bone); else if (hold.off && f) v = first(grip, bone);
    /* two keys a hair apart in value: the mixer writes a bone only when its value changes, so a constant track would be
       lost the first time anything else (a look's posture reset) touches the bone */
    return v ? new THREE.QuaternionKeyframeTrack(k.name, [0, base.duration], [...v, v[0] + 2e-4, v[1], v[2], v[3]]) : k;
  });
  actor.clips.set(name, new THREE.AnimationClip(name, base.duration, tracks)); return name;
}
export function holdHero(actor, weapon, { ms = 350, fade = 0.15 } = {}) {
  const hold = holdFor(weapon); if (!hold || !actor) return false;
  actor.play(actor.has(hold.clip) ? standClip(actor, hold) : 'Idle', { fade });
  const g = actor.slot('handslotr')?.children.find((c) => c.userData.gear); if (g) holdGear(g, hold, 'r', ms);
  if (hold.off) { const og = actor.slot('handslotl')?.children.find((c) => c.userData.gear); if (og) holdGear(og, hold.off, 'l', ms, hold.clip); }
  return true;
}
export const GEAR = ['sword', 'greatsword', 'dagger', 'axe', 'maul', 'spear', 'staff', 'shield'];
/* gear a world adds by name: makeGear('edo_katana') loads /assets/real/gear_edo_katana.glb (registerWorld fills it) */
const GEAR_URLS = new Map();
export function registerGear(names = []) { for (const n of names) if (typeof n === 'string' && /^[a-z0-9_]+$/.test(n)) GEAR_URLS.set(n, `/assets/real/gear_${n}.glb`); }
/* the ranged gear is known in every world, so a quick-start link, the hero and the card find it */
registerGear(['frontier_revolver', 'frontier_rifle', 'edo_yumi', 'storybook_bow', 'neon_stunner']);
const gearUrl = (name) => GEAR_URLS.get(name) || `/assets/real/gear_${GEAR.includes(name) ? name : 'sword'}.glb`;
/* shield paint for foes: oxblood, soot black, faded ochre, grave green; devices in bone or rust */
const SHIELD_PAINT = [[0x3c1612, 0x8a8270], [0x1a1a1a, 0x6a2a1c], [0x463824, 0x1c1612], [0x1c2820, 0x8a8270], [0x2a2c32, 0x6a2a1c]];
let GEAR_SEQ = 0;
export async function makeGear(name) {
  const gltf = await loadGLB(gearUrl(name));
  const root = new THREE.Group();
  const inner = gltf.scene.clone(true); const SP = WORLD_MOD?.gearLook?.shieldPaint?.length ? WORLD_MOD.gearLook.shieldPaint : SHIELD_PAINT; const pick = SP[GEAR_SEQ++ % SP.length];
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.material = o.material.clone();
    const n = o.material.name || '';
    o.userData.kind = BLADE_MAT.test(n) ? 'blade' : (STEEL_MAT.test(n) || /SQG_Forge/.test(n)) ? 'steel' : /SQ_Crystal/.test(n) ? 'crystal' : /SQG_Paint/.test(n) ? 'paint' : /SQG_Glow/.test(n) ? 'glow' : 'grip';
    /* SQG_Glow (worlds: neon seams, lantern paper): its own colour, emissive; styleGear tints it with the element */
    if (o.userData.kind === 'glow') { o.material.emissive = o.material.color.clone(); o.material.emissiveIntensity = 2.2; o.material.userData.glow = true; }
    const shade = { blade: 'blade', steel: 'forge', paint: 'paint' }[o.userData.kind] || (/SQG_Wood/.test(n) ? 'wood' : /SQG_Leather/.test(n) ? 'leather' : null);
    if (shade && /^SQG_/.test(n)) { gearShade(o.material, shade); if (shade === 'paint') { GEAR_U.get(o.material).paint.value.set(pick[0]); GEAR_U.get(o.material).device.value.set(pick[1]); } }
    if (o.userData.kind === 'steel') o.material.envMapIntensity = 0.35;
    /* a world blade keeps a floor of sky reflection, so it never goes near-black in shade on a day land: gearLook.bladeEnv */
    if (o.userData.kind === 'blade') o.material.envMapIntensity = WORLD_MOD ? (WORLD_MOD.gearLook?.bladeEnv ?? 0.9) : 0.38;
    /* the back of a shield (its wood) in a world colour: gearLook.shieldBack (the face keeps shieldPaint) */
    if (WORLD_MOD?.gearLook?.shieldBack != null && /SQG_Wood/.test(n) && isShield(name)) o.material.color.set(WORLD_MOD.gearLook.shieldBack);
    /* three r170 ignores envMapIntensity while envMap is null (scene.environment then uses the scene's intensity): bind it */
    if (shade) o.onBeforeRender = (r, scene) => { const m = o.material; if (scene.environment && m.envMap !== scene.environment) { m.envMap = scene.environment; m.needsUpdate = true; } };
  });
  /* a pistol at true size vanishes in a third-person hand (the hero, the card): it is drawn larger there; ranged.js undoes it in first person */
  if (TP_SCALE[name]) inner.scale.setScalar(TP_SCALE[name]);
  root.add(inner); root.userData.gear = name;
  return root;
}
const TP_SCALE = { frontier_revolver: 1.7, neon_stunner: 1.6, frontier_rifle: 1.15 };
/* Colours a piece of gear by forge material and element (the hero's gear): less worn than a foe's, same caps. */
export function styleGear(root, material, element) {
  /* world gear (a name the world registered: neon_monoblade, edo_katana) keeps its own colours, metal and roughness in every
     state: only the element glow is added. gearLook.restyle = true lets a world opt back in to the forge recolour. */
  const own = GEAR_URLS.has(root.userData.gear) && !WORLD_MOD?.gearLook?.restyle;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material; const kind = o.userData.kind; const G = GEAR_U.get(m) || null;
    const GL = WORLD_MOD?.gearLook || null; /* a world's gear look: { wear, blade, steel, dim, shieldPaint } (storybook: bright, no rust) */
    if (G) G.wear.value = GL?.wear ?? 0.22;
    if (own) {
      if (kind === 'crystal') { m.emissive = new THREE.Color(element ? element.color : 0xffa040); m.emissiveIntensity = 4; m.needsUpdate = true; }
      else if (kind === 'glow' && element) { m.emissive = new THREE.Color(element.color); m.emissiveIntensity = 2.2; m.needsUpdate = true; }
      return;
    }
    if (kind === 'blade') {
      const iron = !material || material.id === 'iron'; const bc = GL?.blade ?? 0x9aa0a8;
      m.color.set(iron ? bc : material.color); if (!iron) m.color.lerp(new THREE.Color(bc), 0.35);
      m.metalness = material ? Math.max(0.85, material.metal) : 1; m.roughness = material ? clamp01(material.rough) * 0.35 + 0.24 : 0.34; m.envMapIntensity = WORLD_MOD ? (GL?.bladeEnv ?? 0.9) : 0.42;
      if (G) G.cap.value = 1.1;
      if (element) { m.emissive = new THREE.Color(element.color); m.emissiveIntensity = 0.012; }
    } else if (kind === 'steel') {
      m.color.set(GL?.steel ?? 0x55585e); if (material && material.id !== 'iron') m.color.lerp(new THREE.Color(material.color), 0.5);
    } else if (kind === 'crystal') {
      const c = new THREE.Color(element ? element.color : 0xffa040); m.emissive = c; m.emissiveIntensity = 4;
    } else if (kind === 'glow' && element) {
      m.emissive = new THREE.Color(element.color); m.emissiveIntensity = 2.2;
    }
    m.needsUpdate = true;
  });
  return root;
}

/* three's compileAsync polls each material's program in its own setTimeout. A material disposed while it waits
   (a corpse removed, a find taken) has no program left: the poll throws "reading 'isReady'" where no caller can catch it,
   and the promise never settles (a warm-up that hid a foe left it hidden). This one compiles the same way, skips a
   material with no program, and always settles (within 4 s at most). */
function safeCompileAsync(R) {
  if (!R || R._safeCompile) return; R._safeCompile = true;
  /* perf: a compile called outside a render (no target set) linked the CANVAS variant of each program (tone
     mapped, sRGB out), but the scene is drawn into the composer's linear buffer: every warm-up linked programs that were never
     used and the real ones still linked on the frame a foe, a boss or a light came in (0.3 to 1.9 s frames). A compile with
     no target now runs against the composer's buffer (R._sqWarmTarget, set by World). */
  const compile0 = R.compile.bind(R);
  R.compile = function (scene, camera, targetScene = null) {
    const rt = R._sqWarmTarget; const prev = R.getRenderTarget();
    if (!rt || prev) return compile0(scene, camera, targetScene);
    R.setRenderTarget(rt); try { return compile0(scene, camera, targetScene); } finally { R.setRenderTarget(prev); }
  };
  R.compileAsync = function (scene, camera, targetScene = null) {
    let materials;
    try { materials = R.compile(scene, camera, targetScene); } catch (err) { return Promise.reject(err); }
    const t0 = performance.now(); const par = R.extensions?.get?.('KHR_parallel_shader_compile') != null;
    return new Promise((resolve) => {
      const check = () => {
        try {
          for (const m of materials) { const p = R.properties.get(m)?.currentProgram; if (!p || !p.isReady || p.isReady()) materials.delete(m); }
        } catch { materials.clear(); }
        if (!materials.size || performance.now() - t0 > 4000) { resolve(scene); return; }
        setTimeout(check, 10);
      };
      if (par) check(); else setTimeout(check, 10);
    });
  };
}

export class World {
  constructor(canvas) {
    /* no MSAA on the canvas. Every frame goes through the composer (half-float targets with no samples) and the last pass is a full-screen quad, so the 4x multisampled back buffer (265 MB at 4K) and its resolve bought nothing. ?aa=1 brings it back for a comparison. */
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: /[?&]aa=1/.test(location.search), powerPreference: 'high-performance' });
    safeCompileAsync(this.renderer);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.08, 900);
    this.scene.add(this.camera);
    /* Metal needs something to reflect, or it renders black. */
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;

    const paper = new THREE.Color(PAPER);
    this.col = { top: paper.clone(), bottom: paper.clone(), fog: paper.clone(), ground: paper.clone(), light: new THREE.Color(0xffffff) };
    this.target = { top: paper.clone(), bottom: paper.clone(), fog: paper.clone(), ground: paper.clone(), light: new THREE.Color(0xffffff), fogNear: 14, fogFar: 70, exposure: 1.05 };
    this.scene.fog = new THREE.Fog(paper.clone(), 14, 70);
    this.scene.background = paper.clone();

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: this.col.top }, bottom: { value: this.col.bottom } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 1.6 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0); }',
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(500, 72), new THREE.MeshStandardMaterial({ color: paper.clone(), roughness: 1, metalness: 0 }));
    /* Real rock under the feet (Poly Haven, CC0). It fades in when the land arrives. */
    const tl = new THREE.TextureLoader();
    const tex = (file, srgb) => { const t = tl.load(`/assets/ground/${file}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(140, 140); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    this.groundTex = { map: tex('rock_diff.jpg', true), normalMap: tex('rock_nor_gl.jpg', false), roughnessMap: tex('rock_rough.jpg', false) };
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8d2c2, 1.15);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.position.set(14, 26, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    /* a tight box that follows the player: 2048 texels over 44 m = 2 cm, so the low key throws crisp long shadows */
    const sc = this.sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 240;
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.035; this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    /* contact shadows under every actor */
    this.blobs = makeBlobs(); this.scene.add(this.blobs);
    /* A coloured back light: it cuts every figure out of the dark. */
    this.rim = new THREE.DirectionalLight(0xffffff, 0);
    this.rim.position.set(-10, 9, -22);
    this.scene.add(this.rim, this.rim.target);

    this.props = [];
    this.propGroup = new THREE.Group();
    this.scene.add(this.propGroup);
    this.particles = null;
    this.nemesis = null;
    this.biome = null;
    this.time = 0;
    this.flashAmount = 0;
    this.shake = 0;
    this.updaters = new Set();
    /* Each land's ground, sky, horizon, props and weather (lands.js). */
    this.lands = new Lands(this);
    /* the land height for scene-level effects (bosses.js debris rests on it) */
    this.scene.userData.groundAt = (x, z) => this.lands.groundAt(x, z);
    this.landLight = null;
    /* the moon or sun (LOOK[land].disc); cloud uniforms are shared with the land's sky so the veil matches its clouds */
    {
      const su = this.lands.skyU || {};
      const U = { uHalf: { value: 10 }, uCol: { value: new THREE.Color(0) }, uHalo: { value: new THREE.Color(0) }, uI: { value: 0 }, uSoft: { value: 0.05 },
        uHaloI: { value: 0 }, uHaloR: { value: 3 }, uExt: { value: 3 }, uRing: { value: 12 }, uRingI: { value: 0 }, uVeil: { value: 0 }, uOn: { value: 0 },
        uClouds: su.uClouds || { value: 0 }, uCloudLo: su.uCloudLo || { value: 0.14 }, uCloudSpd: su.uCloudSpd || { value: 1 }, uTime: su.uTime || { value: 0 } };
      this.disc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: U, vertexShader: DISC_SHADER.vertexShader, fragmentShader: DISC_SHADER.fragmentShader,
        transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false }));
      this.disc.frustumCulled = false; this.disc.renderOrder = -9; this.disc.visible = false;
      this.scene.add(this.disc);
    }
    /* event hooks: the dark (setDark) and the boss dim (dim) */
    this.darkK = 0; this.darkTarget = 0; this.darkR = 9; this.dimK = 0;
    this.flashPeak = 0; this.flashT = 1;

    this.composer = new EffectComposer(this.renderer);
    /* both ping-pong targets carry depth, so the fog pass can read it whichever one the scene lands in */
    this.composer.renderTarget1.depthTexture = new THREE.DepthTexture(1, 1);
    this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(1, 1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.renderer._sqWarmTarget = this.composer.renderTarget1; /* perf: warm-ups compile the variant the scene is really drawn with */
    this.fogPass = new FogPass();
    this.composer.addPass(this.fogPass);
    /* tight bloom: only the moon disc, embers, eyes and sparks cross the threshold */
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.45, 1.0);
    /* soft-knee bright pass with a hard clamp on the input: a tiny HDR sprite (beacon, ice glint, orb) can feed the bloom
       no more than a pixel of brightness 2.2, so it glows instead of spreading into a big hard-edged blob */
    this.bloom.highPassUniforms.smoothWidth.value = 0.7;
    this.bloom.materialHighPassFilter.fragmentShader = `uniform sampler2D tDiffuse; uniform float luminosityThreshold; uniform float smoothWidth; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = max(max(c.r, c.g), c.b);
        c *= min(1.0, 2.2 / max(l, 1e-4)); l = min(l, 2.2);
        float kn = max(smoothWidth, 1e-3);
        float s = clamp(l - luminosityThreshold + kn, 0.0, 2.0 * kn); s = s * s / (4.0 * kn);
        float w = max(s, l - luminosityThreshold) / max(l, 1e-4);
        gl_FragColor = vec4(c * w, 1.0);
      }`;
    this.bloom.materialHighPassFilter.needsUpdate = true;
    /* the bloom chain starts at a quarter of the picture, not a half (its five blurred mips were 4 ms of a 15 ms fight frame at 1728x1117).
       The mip weights move one step, so the glow keeps its width. */
    { const bs = this.bloom.setSize.bind(this.bloom); this.bloom.setSize = (w, h) => bs(Math.max(4, Math.round(w / 2)), Math.max(4, Math.round(h / 2))); /* mip k of the quarter-size chain is as wide as mip k+1 of the old one: the first mip stands for the old two tightest, the widest is dropped */
      const cm = this.bloom.compositeMaterial; const W = (i) => `lerpBloomFactor(bloomFactors[${i}]) * vec4(bloomTintColors[${i}]`; let fs = cm.fragmentShader;
      const NEW = [`(lerpBloomFactor(bloomFactors[0]) + lerpBloomFactor(bloomFactors[1])) * vec4(bloomTintColors[0]`, `lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[1]`, `lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[2]`, `lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[3]`, `0.0 * vec4(bloomTintColors[4]`];
      for (let i = 0; i < 5; i++) fs = fs.replace(W(i), `@@${i}@@`); for (let i = 0; i < 5; i++) fs = fs.replace(`@@${i}@@`, NEW[i]);
      cm.fragmentShader = fs; cm.needsUpdate = true; }
    /* the fused chain. Scene -> bloom chain (its bright pass fogs its own quarter-size input) -> ONE last full-size pass that fogs the scene,
       adds the bloom, tone-maps, converts to sRGB and grades. Before: fog, bloom blend, output and grade were four full-size half-float passes
       (7.8 ms of a 22 ms frame at 3456x2234). The ink print (style.js) needs the fogged, bloomed image as its input: while it is on, the old chain runs. */
    const FU = this.fogPass.uniforms; const fogShare = {}; for (const k of ['tDepth', 'uProjInv', 'uCamWorld', 'uCamPos', 'uFogCol', 'uScatCol', 'uKey', 'uFog', 'uStart', 'uSky', 'uAmount', 'uDark']) fogShare[k] = FU[k];
    this._fuse = { uFuse: { value: 0 }, uBloomOn: { value: 0 }, tBloom: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } };
    {
      Object.assign(this.bloom.highPassUniforms, fogShare, { uFuse: this._fuse.uFuse, uTexel: this._fuse.uTexel });
      this.bloom.materialHighPassFilter.fragmentShader = `uniform sampler2D tDiffuse; uniform float luminosityThreshold; uniform float smoothWidth; uniform float uFuse; uniform vec2 uTexel; varying vec2 vUv; ${FOG_GLSL}
        vec3 sqTap(vec2 uv){ vec3 c = texture2D(tDiffuse, uv).rgb; return uFuse > 0.5 ? sqFogged(c, uv) : c; }
        void main(){
          /* four bilinear taps = the 4x4 block of scene pixels under this quarter-size pixel */
          vec3 c = 0.25 * (sqTap(vUv + uTexel * vec2(-1.0, -1.0)) + sqTap(vUv + uTexel * vec2(1.0, -1.0)) + sqTap(vUv + uTexel * vec2(-1.0, 1.0)) + sqTap(vUv + uTexel * vec2(1.0, 1.0)));
          float l = max(max(c.r, c.g), c.b);
          c *= min(1.0, 2.2 / max(l, 1e-4)); l = min(l, 2.2);
          float kn = max(smoothWidth, 1e-3);
          float s = clamp(l - luminosityThreshold + kn, 0.0, 2.0 * kn); s = s * s / (4.0 * kn);
          float w = max(s, l - luminosityThreshold) / max(l, 1e-4);
          gl_FragColor = vec4(c * w, 1.0);
        }`;
      this.bloom.materialHighPassFilter.needsUpdate = true;
    }
    this.composer.addPass(this.bloom);
    const outPass = new OutputPass(); this.composer.addPass(outPass);
    /* grade + film, in display space: per-land lift/gain/saturation/contrast, vignette 0.35, light grain */
    const FILM_U = () => ({ time: { value: 0 }, grit: { value: 0 }, impact: { value: 0 }, hurt: { value: 0 }, flash: { value: 0 },
      land: { value: 0 }, sat: { value: 1 }, con: { value: 0 }, lift: { value: new THREE.Color(0) }, gain: { value: new THREE.Color(1, 1, 1) } });
    const FILM_PARS = `uniform float time; uniform float grit; uniform float impact; uniform float hurt; uniform float flash;
        uniform float land; uniform float sat; uniform float con; uniform vec3 lift; uniform vec3 gain;
        float sqFilmHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }`;
    /* no chromatic aberration (removed: it fringed grass and hid targets on hits) */
    const FILM_BODY = `
          vec2 d = vUv - 0.5; float r = length(d);
          vec3 g = clamp(c, 0.0, 1.0);
          float lum = dot(g, vec3(0.2126, 0.7152, 0.0722));
          g = mix(vec3(lum), g, sat);
          g = mix(g, g * g * (3.0 - 2.0 * g), con);
          g = g * gain + lift * (1.0 - g);
          c = mix(c, g, land);
          c *= 1.0 - grit * smoothstep(0.35, 0.95, r) * 0.35;
          c += (sqFilmHash(vUv * vec2(1920.0, 1080.0) + time * 60.0) - 0.5) * 0.022 * grit;
          c = mix(c, vec3(0.45, 0.0, 0.0), hurt * smoothstep(0.25, 0.8, r) * 0.7);
          /* the flash: a thin warm glow at the frame edge only; the centre (the target) is never washed */
          c += vec3(1.0, 0.92, 0.8) * flash * smoothstep(0.4, 0.68, r) * 0.2;`;
    {
      /* the grade runs inside the output pass (tone map, sRGB, then the grade): one full-screen pass less. world.film is that pass. */
      Object.assign(outPass.uniforms, FILM_U(), fogShare, this._fuse);
      outPass.material.fragmentShader = outPass.material.fragmentShader.replace('varying vec2 vUv;', `varying vec2 vUv;\nuniform float uFuse; uniform float uBloomOn; uniform sampler2D tBloom;\n${FOG_GLSL}`)
        .replace('gl_FragColor = texture2D( tDiffuse, vUv );', 'gl_FragColor = texture2D( tDiffuse, vUv );\n if (uFuse > 0.5) { gl_FragColor.rgb = sqFogged(gl_FragColor.rgb, vUv); if (uBloomOn > 0.5) gl_FragColor.rgb += texture2D(tBloom, vUv).rgb; }');
      { const comp = this.composer; const cr0 = comp.render.bind(comp); const fz = this._fuse;
        comp.render = (dt) => {
          const fused = !this.style?.on;
          this.fogPass.enabled = !fused; this.bloom.blendMaterial.visible = !fused; fz.uFuse.value = fused ? 1 : 0; fz.uBloomOn.value = this.bloom.enabled ? 1 : 0;
          const rb = comp.readBuffer; fz.uTexel.value.set(1 / Math.max(1, rb.width), 1 / Math.max(1, rb.height));
          if (fused) { FU.tDepth.value = rb.depthTexture; fz.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture; }
          cr0(dt);
        }; }
      outPass.material.fragmentShader = outPass.material.fragmentShader.replace('varying vec2 vUv;', `varying vec2 vUv;\n${FILM_PARS}`).replace(/\}\s*$/, `{ vec3 c = gl_FragColor.rgb; ${FILM_BODY}\n gl_FragColor = vec4(c, 1.0); }\n}`);
      outPass.material.needsUpdate = true; this.film = outPass;
    }
    this.impact = 0; this.hurt = 0; this.grit = 0; this.timeScale = 1;
    /* camp.js hook (additive): the film grit (grain, vignette, rim) to keep before any land is chosen. 0 = old behaviour. */
    this.gritFloor = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    installGate(this); /* a new object never stalls the frame on its shader link (perf2.js) */
  }

  resize() {
    const w = window.innerWidth; const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* tone: 1 (bleak) .. 5 (bright) */
  setTone(tone) {
    const t = clamp01((tone - 1) / 4);
    this.tone = t;
    this.target.exposure = (this.landLight?.exposure ?? 1) * (1.0 + t * 0.3);
    if (this.biome) { const [near, far] = this.landLight?.fog ?? [10, 70]; this.target.fogNear = near + t * 6; this.target.fogFar = far + t * 30; }
  }

  setBiome(biome, seed = 1) {
    if (this.biome && this.biome.id === biome.id) return;
    this.biome = biome;
    const LK = LOOK[biome.id];
    this.target.top.set(LK?.skyTop ?? biome.sky[0]); this.target.bottom.set(LK?.skyBot ?? biome.sky[1]);
    this.target.fog.set(biome.fog); this.target.ground.set(biome.ground); this.target.light.set(biome.light);
    /* ground, sky, horizon, props, water and weather: lands.js (it also sets the fog and light targets) */
    this.lands.set(biome, seed);
    if (this.tone != null) this.setTone(this.tone * 4 + 1);
    this.flash(0.5);
  }

  /* Scanned props and weather now live in lands.js; these stay as no-ops for old callers. */
  addRealProps() {}
  setParticles() {}

  /* The nemesis far out in the haze: a dark, rim-lit silhouette that the post fog sits in.
     dragon = the real boss model (dragon.js), posed by code in a slow banked glide; lich/giant/twin = the knight. */
  /* id = the mechanic (dragon | lich | giant | twin); nemId = the world nemesis id (edo 'lord', neon 'tower') for a world's own
     far shape: worldMod().skyNemesis(nemId, ctx) -> Object3D | { object, update(dt, t), dispose(), dist } | null (null = the dark shape).
     ctx = { THREE, accent, sil(opts) (a fading silhouette material: use it, or put your materials in ctx.mats), glow (accent glow),
     mats (array: every material in it fades in and out with the shape, opacity 0..1), dir (unit vector to the nemesis line), dist (215) }.
     Build it in metres at its real size, base at y = 0, facing +z (the world turns it toward the camp); it rises out of the haze. */
  async setNemesis(id, heroUrl, nemId = null) {
    const key = nemId && nemId !== id ? `${id}:${nemId}` : id;
    if (this.nemesisId === id && (this.nemesisKey || id) === key) return;
    this.nemesisId = id; this.nemesisKey = key;
    if (await this.worldSkyNemesis(id, nemId || id)) return;
    if (this.nemesisId !== id || this.nemesisKey !== key) return;
    const SPEC = {
      dragon: { dragon: true, dist: 205, y: 30, scale: 1.9, circle: 34 },
      lich: { url: KNIGHT_URL, look: { helm: 'hood', robe: true, cloak: false, tabard: false, crown: false }, clip: 'Spell_Simple_Idle_Loop', height: 34, dist: 215 },
      giant: { url: KNIGHT_URL, look: { helm: 'sallet', heavy: true, horns: true, cloak: false }, clip: 'Zombie_Idle_Loop', height: 40, dist: 225 },
      twin: { url: KNIGHT_URL, look: { helm: 'great', crown: true, cloak: true }, clip: 'Sword_Idle', height: 32, dist: 210 },
    }[id] || null;
    if (!SPEC) return;
    const accent = new THREE.Color(this.biome?.accent ?? 0xff5a1e);
    const mats = [];
    const sil = (opts = {}) => { const m = addRim(new THREE.MeshStandardMaterial({ color: 0x17161a, roughness: 0.82, metalness: 0.15, envMapIntensity: 0.3, transparent: true, opacity: 0, ...opts }), 2.6); mats.push(m); return m; };
    const glow = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(3), transparent: true, opacity: 0, fog: false }); mats.push(glow);
    const holder = new THREE.Group();
    let tick;
    if (SPEC.dragon) {
      let boss;
      try {
        const { DragonBoss } = await import('./dragon.js');
        boss = new DragonBoss({ scene: holder, camera: null, accent: accent.getHex(), sfx: () => {}, player: { pos: new THREE.Vector3(), forward: () => new THREE.Vector3(0, 0, -1), eye: 2 } });
        await boss.load();
      } catch (err) { console.warn('sky dragon not ready', err); return; }
      if (this.nemesisId !== id) { boss.dispose(); return; }
      /* no AI, no effects, and no lights (a light added later would recompile every material) */
      for (const l of [boss.fireLight, boss.throatLight]) l?.removeFromParent();
      for (const o of [boss.flames?.mesh, boss.smoke?.mesh, boss.ring, boss.line]) if (o) o.visible = false;
      const M = boss.mats; const body = sil(); const wing = sil({ alphaMap: M.membrane.alphaMap, alphaTest: 0.25, side: THREE.DoubleSide, color: 0x1d1a1c });
      boss.group.traverse((o) => { if (!o.isMesh || o === boss.flames?.mesh || o === boss.smoke?.mesh || o === boss.ring || o === boss.line) return; o.material = o.material === M.membrane ? wing : o.material === M.eye ? glow : body; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });
      boss.group.visible = true; boss.state = 'air'; boss.air = { phase: 'glide' }; boss.landing = null;
      boss.J.set(0, 0, 0); boss.resetPose();
      holder.scale.setScalar(SPEC.scale);
      const C = NEM_DIR.clone().multiplyScalar(SPEC.dist); let prevYaw = null;
      tick = (dt, t) => {
        const a = t * 0.11 + 1.2;
        holder.position.set(C.x + Math.cos(a) * SPEC.circle, SPEC.y + Math.sin(t * 0.37) * 2.5 - (1 - clamp01(t / 3)) * 14, C.z + Math.sin(a) * SPEC.circle);
        const yaw = Math.atan2(-Math.sin(a), Math.cos(a));
        const turn = prevYaw == null ? 0 : (yaw - prevYaw) / Math.max(dt, 1e-3); prevYaw = yaw;
        boss.yaw = yaw; boss.clock += dt;
        const g = boss.tgt; g.pitch = 0.04; g.roll = Math.max(-0.5, Math.min(0.5, -turn * 3.2));
        const beat = Math.max(0, Math.sin(t * 0.42)); boss.flightPose(g, 0.2 + 0.75 * beat * beat, 0.55);
        g.throat = 0; g.eyes = 1;
        boss.animate(Math.min(dt, 1 / 20));
      };
      tick(0.016, 0);
      this.scene.add(holder);
      const nm = { holder, boss, mats, spec: SPEC, t: 0, leaving: false, tick, dispose: () => boss.dispose() };
      this.swapNemesis(nm);
      return;
    }
    const actor = await makeActor(SPEC.url);
    actor.noBlob = true;
    if (this.nemesisId !== id) { actor.dispose(); return; }
    if (SPEC.look) actor.look(SPEC.look);
    actor.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(actor.root);
    const s = SPEC.height / Math.max(0.001, box.max.y - box.min.y);
    holder.add(actor.root);
    actor.root.scale.multiplyScalar(s);
    actor.root.position.y = -box.min.y * s;
    const body = sil(); const cloth = sil({ side: THREE.DoubleSide, color: 0x141215 });
    actor.root.traverse((o) => { if (o.isMesh) { o.material = o.userData.part === 'Eyes' ? glow : (o.material.side === THREE.DoubleSide ? cloth : body); o.castShadow = false; } });
    const P = NEM_DIR.clone().multiplyScalar(SPEC.dist);
    holder.position.set(P.x, 0, P.z);
    holder.rotation.y = Math.atan2(-NEM_DIR.x, -NEM_DIR.z);
    if (SPEC.clip && !actor.play(SPEC.clip, { speed: 0.6 }) && actor.clips.size) actor.play([...actor.clips.keys()][0], { speed: 0.6 });
    /* the far body stands on the land at its spot (the lowest ground under its feet, sunk 1.5 m), not at y 0:
       on a land whose far ground drops away it hovered over the horizon */
    let gy = 0; let gAt = -9;
    const ground = () => { const gfn = this.scene.userData.groundAt; if (!gfn) return 0; try { let m = Infinity; for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const rr = k ? 7 : 0; m = Math.min(m, gfn(P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr) || 0); } return Number.isFinite(m) ? m - 1.5 : 0; } catch { return 0; } };
    tick = (dt, t) => { actor.mixer.update(dt); if (t - gAt > 1) { gAt = t; gy = ground(); } holder.position.y = gy - (1 - clamp01(t / 3)) * 14; };
    this.scene.add(holder);
    this.swapNemesis({ holder, actor, mats, spec: SPEC, t: 0, leaving: false, tick, dispose: () => actor.dispose() });
  }

  /* LOOK.env = { top, hor, ground, sun, intensity } (a daylight sky to reflect): a PMREM gradient made once per land and set
     as scene.environment while that land is up; the RoomEnvironment comes back for a land without it */
  landEnv(L) {
    const want = L?.env && typeof L.env === 'object' && (L.env.top != null || L.env.texture) ? L.env : null;
    if (want === this._envWant) return; this._envWant = want;
    this._envDefault ??= this.scene.environment;
    if (!want) { this.scene.environment = this._envDefault; return; }
    if (want.texture) { this.scene.environment = want.texture; return; }
    if (!want._tex) {
      const sc = new THREE.Scene(); const g = new THREE.SphereGeometry(10, 32, 16); const c = g.attributes.position; const col = new Float32Array(c.count * 3);
      const top = new THREE.Color(want.top), hor = new THREE.Color(want.hor ?? want.top), gr = new THREE.Color(want.ground ?? 0x404040), t = new THREE.Color();
      for (let i = 0; i < c.count; i++) { const y = c.getY(i) / 10; if (y >= 0) t.copy(hor).lerp(top, Math.pow(y, 0.6)); else t.copy(hor).lerp(gr, Math.min(1, -y * 3)); col.set([t.r, t.g, t.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      if (want.sun != null) { const sun = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(want.sun).multiplyScalar(6) })); sun.position.copy(this._look?.key || new THREE.Vector3(-0.6, 0.4, -0.7)).normalize().multiplyScalar(8); sc.add(sun); }
      const pm = new THREE.PMREMGenerator(this.renderer); want._tex = pm.fromScene(sc, 0.02).texture; pm.dispose(); g.dispose();
    }
    this.scene.environment = want._tex;
  }

  /* a world module's own far shape for this nemesis; false = none (or it failed), so the dark shape is built */
  async worldSkyNemesis(id, nemId) {
    let fn = WORLD_MOD?.skyNemesis;
    /* the dark world's giant, lich and twin far figures live in bosses.js (the dragon keeps the model below) */
    if (typeof fn !== 'function' && !WORLD_MOD && (id === 'giant' || id === 'lich' || id === 'twin')) { try { fn = (await import('./bosses.js')).skyNemesis; } catch (err) { console.warn('dark sky nemesis', err); } }
    if (typeof fn !== 'function') return false;
    const key = this.nemesisKey;
    const accent = new THREE.Color(this.biome?.accent ?? 0xff5a1e); const mats = [];
    const sil = (opts = {}) => { const m = addRim(new THREE.MeshStandardMaterial({ color: 0x17161a, roughness: 0.82, metalness: 0.15, envMapIntensity: 0.3, transparent: true, opacity: 0, ...opts }), 2.6); mats.push(m); return m; };
    const glow = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(3), transparent: true, opacity: 0, fog: false }); mats.push(glow);
    let r;
    try { r = await fn(nemId, { THREE, accent, sil, glow, mats, dir: NEM_DIR.clone(), dist: 215 }); } catch (err) { console.warn('world skyNemesis', nemId, err); return false; }
    if (!r) return false;
    const obj = r.isObject3D ? r : r.object; if (!obj?.isObject3D) return false;
    if (this.nemesisKey !== key) { r.dispose?.(); return true; }
    for (const m of mats) { m.transparent = true; m.opacity = 0; }
    if (!mats.length) mats.push(glow);
    obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    const holder = new THREE.Group(); holder.add(obj);
    const dist = r.dist || obj.userData?.dist || 215; const P = NEM_DIR.clone().multiplyScalar(dist);
    holder.position.set(P.x, 0, P.z); holder.rotation.y = Math.atan2(-NEM_DIR.x, -NEM_DIR.z);
    const up = typeof r.update === 'function' ? r.update : null;
    const tick = (dt, t) => { holder.position.y = -(1 - clamp01(t / 3)) * 14; if (up) { try { up(dt, t); } catch (err) { console.warn('world skyNemesis', err); } } };
    this.scene.add(holder);
    this.swapNemesis({ holder, mats, actor: r.actor, spec: { world: true, dist }, t: 0, leaving: false, tick, dispose: () => { try { r.dispose?.(); } catch { /* gone */ } } });
    return true;
  }

  /* The global look for the current land (LOOK table): key, fill and back light, the moon/sun in the sky,
     post fog, contact shadows, grade and exposure. Runs after the updaters, so the camera is final. */
  applyLook(dt, focus) {
    const L = this.biome ? LOOK[this.biome.id] : null;
    const k = 1 - Math.exp(-dt * 1.6);
    this.landK = (this.landK ?? 0) + ((L ? 1 : 0) - (this.landK ?? 0)) * Math.min(1, dt * 1.2);
    const S = this._look || (this._look = { key: new THREE.Vector3(-0.6, 0.2, -0.78).normalize(), keyCol: new THREE.Color(1, 1, 1), rim: new THREE.Color(0), lift: new THREE.Color(0), gain: new THREE.Color(1, 1, 1), scat: new THREE.Color(0), fog: new THREE.Vector4(0.003, 0.008, 0.12, 0.9), v: new THREE.Vector3(), fwd: new THREE.Vector3(), m: new THREE.Matrix4(), sat: 1, con: 0, rimI: 0, start: 8, sky: 1 });
    const want = L ? AGX : THREE.NeutralToneMapping;
    if (this.renderer.toneMapping !== want && (L ? this.landK > 0.02 : this.landK < 0.02)) this.renderer.toneMapping = want;
    const fu = this.fogPass.uniforms;
    /* the dark (setDark): eased toward its target; at 0 the fog pass skips it */
    this.darkK += (this.darkTarget - this.darkK) * Math.min(1, dt * 2.5); if (this.darkTarget <= 0 && this.darkK < 0.002) this.darkK = 0;
    fu.uDark.value.set(this.darkK, this.darkR);
    if (!L) { fu.uAmount.value = this.landK; this.film.uniforms.land.value = this.landK; this.blobs.count = 0; RIM.col.value.setRGB(0, 0, 0); this.disc.visible = false; this.applyDim(); return; }
    /* lights */
    S.key.lerp(this._v1 = (this._v1 || new THREE.Vector3()).set(...L.key).normalize(), k).normalize();
    S.keyCol.lerp(this._c1 = (this._c1 || new THREE.Color()).set(L.keyCol), k);
    const fx = focus ? focus.x : 0; const fz = focus ? focus.z : 0;
    this.sun.position.set(fx + S.key.x * 110, S.key.y * 110, fz + S.key.z * 110);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.color.copy(S.keyCol); this.sun.intensity = L.keyI * (1 + this.flashAmount * 0.15);
    this.hemi.intensity = L.fill; this.hemi.color.copy(this.col.bottom).lerp(S.keyCol, 0.35).lerp(WHITE, 0.3); this.hemi.groundColor.copy(this.col.ground).multiplyScalar(0.25);
    /* back light from beyond what the camera looks at: lights the edges that face away from the key */
    this.camera.getWorldDirection(S.fwd); S.fwd.y = 0; if (S.fwd.lengthSq() < 1e-4) S.fwd.set(0, 0, -1); S.fwd.normalize();
    this.rim.position.set(fx + S.fwd.x * 30, 14, fz + S.fwd.z * 30); this.rim.target.position.set(fx, 1, fz);
    S.rim.lerp(this._c2 = (this._c2 || new THREE.Color()).set(L.rim), k); this.rim.color.copy(S.rim); this.rim.intensity = (L.back ?? 1.3) * this.landK;
    /* fresnel rim on characters */
    RIM.col.value.copy(S.rim).multiplyScalar(L.rimI * 0.35 * this.landK);
    RIM.key.value.copy(S.key).transformDirection(this.camera.matrixWorldInverse);
    /* the moon or sun: drawn here as a screen-aligned quad. The sky dome's own disc, glow,
       halo and big-sun terms are direction-space (they stretch toward the frame edge), so they are held at 0;
       the dome keeps the sun direction for its cloud lighting and rays. */
    const su = this.lands.skyU;
    if (su) {
      su.uSunDir?.value.copy(S.key);
      for (const n of ['uSunGlow', 'uHalo', 'uBigSun', 'uDisc']) if (su[n]) su[n].value = 0;
    }
    const D = L.disc || {}; const du = this.disc.material.uniforms; const DD = this._discS || (this._discS = { r: 0, i: 0, soft: 0.05, haloI: 0, haloR: 3, veil: 0, ring: 12, ringI: 0, col: new THREE.Color(0), halo: new THREE.Color(0) });
    DD.r += ((D.r ?? 0) - DD.r) * k; DD.i += ((D.i ?? 0) - DD.i) * k; DD.soft += ((D.soft ?? 0.05) - DD.soft) * k;
    DD.haloI += ((D.haloI ?? 0) - DD.haloI) * k; DD.haloR += ((D.haloR ?? 3) - DD.haloR) * k; DD.veil += ((D.veil ?? 0) - DD.veil) * k; DD.ringI += ((D.ringI ?? 0) - DD.ringI) * k; if (D.ring) DD.ring = D.ring;
    DD.col.lerp(this._c5 = (this._c5 || new THREE.Color()).set(D.col ?? 0), k); DD.halo.lerp(this._c6 = (this._c6 || new THREE.Color()).set(D.halo ?? 0), k);
    if (DD.r > 0.001) {
      const ext = Math.max(DD.haloR, 1 + DD.soft * 2 + 0.1, DD.ringI > 0.002 ? DD.ring * 1.3 : 0); const dist = 520;
      this.camera.getWorldPosition(S.v); this.disc.position.copy(S.v).addScaledVector(S.key, dist); this.disc.updateMatrixWorld();
      du.uHalf.value = dist * Math.tan(DD.r) * ext; du.uExt.value = ext;
      du.uCol.value.copy(DD.col); du.uHalo.value.copy(DD.halo); du.uI.value = DD.i; du.uSoft.value = DD.soft; du.uHaloI.value = DD.haloI; du.uHaloR.value = DD.haloR; du.uVeil.value = DD.veil; du.uRing.value = DD.ring; du.uRingI.value = DD.ringI;
      du.uOn.value = this.landK * (1 - 0.5 * this.dimK); this.disc.visible = true;
    } else this.disc.visible = false;
    /* water and other land shaders that cloned the sun direction */
    const land = this.lands.current;
    if (land && (land !== this._syncLand || this.time - this._syncT > 0.5) && (land.t ?? 0) < 6) {
      this._syncLand = land; this._syncT = this.time;
      land.group?.traverse((o) => { const u = o.material?.uniforms; if (u?.uSunDir && u !== su) u.uSunDir.value.copy(S.key); });
    }
    /* fog: the old linear scene fog steps aside, the post fog takes over */
    this.scene.fog.near = 1e4; this.scene.fog.far = 2e4;
    const F = L.fog;
    S.fog.x += (F.d - S.fog.x) * k; S.fog.y += (F.h - S.fog.y) * k; S.fog.z += (F.fall - S.fog.z) * k; S.fog.w += (F.max - S.fog.w) * k;
    S.start += (F.start - S.start) * k; S.sky += (F.sky - S.sky) * k;
    this.camera.updateMatrixWorld(); this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    fu.uProjInv.value.copy(this.camera.projectionMatrixInverse); fu.uCamWorld.value.copy(this.camera.matrixWorld);
    this.camera.getWorldPosition(fu.uCamPos.value);
    fu.uFogCol.value.copy(this.col.fog); fu.uScatCol.value.copy(S.keyCol).multiplyScalar(F.scatter);
    fu.uKey.value.copy(S.key); fu.uFog.value.copy(S.fog); fu.uStart.value = S.start; fu.uSky.value = S.sky; fu.uAmount.value = this.landK;
    /* contact shadows under every actor in the scene */
    let n = 0; const aK = this.blobs.geometry.attributes.aK;
    for (const a of ACTORS) {
      if (n >= BLOB_MAX || a.noBlob) continue;
      let p = a.root; while (p.parent) p = p.parent; if (p !== this.scene || !a.root.visible) continue;
      a.root.getWorldPosition(S.v);
      const sc = a.root.getWorldScale(this._v2 = this._v2 || new THREE.Vector3()).x;
      const body = a.meshes.find((m) => m.visible); let op = body ? (body.material.transparent ? body.material.opacity : 1) : 0;
      /* a hovering actor (fight.js def.fly: a.hover m) keeps a softer shadow on the ground under it, also with its body hidden */
      if (a.hover) op = a.blobOp ?? op;
      const lift = clamp01(1 - (S.v.y - (a.hover || 0)) / 1.5);
      if (op * lift < 0.02) continue;
      S.m.makeScale(1.5 * sc, 1, 1.5 * sc).setPosition(S.v.x, 0.025, S.v.z);
      this.blobs.setMatrixAt(n, S.m); aK.array[n] = 0.62 * op * lift * this.landK; n++;
    }
    this.blobs.count = n; this.blobs.instanceMatrix.needsUpdate = true; aK.needsUpdate = true;
    /* big actors (giants, bosses) thin the land's mist sheets round their legs (lands.js uAct) */
    const spots = this.lands.spots?.value;
    if (spots && !PERF.has('mist')) {
      let k = 0;
      for (const a of ACTORS) {
        if (k >= spots.length) break;
        if (!a.root.visible || !a.root.parent) continue;
        const sc = a.root.getWorldScale(this._v2 || (this._v2 = new THREE.Vector3())).x; if (sc < 1.4) continue;
        a.root.getWorldPosition(S.v); spots[k++].set(S.v.x, S.v.z, 1.1 * sc + 0.8, 0);
      }
      for (; k < spots.length; k++) spots[k].z = 0;
    }
    /* grade + exposure */
    const G = L.grade; const fl = this.film.uniforms;
    S.sat += (G.sat - S.sat) * k; S.con += (G.con - S.con) * k;
    S.lift.lerp(this._c3 = (this._c3 || new THREE.Color()).set(G.lift).convertLinearToSRGB(), k); S.gain.lerp(this._c4 = (this._c4 || new THREE.Color()).set(G.gain).convertLinearToSRGB(), k);
    fl.sat.value = S.sat; fl.con.value = S.con; fl.lift.value.copy(S.lift); fl.gain.value.copy(S.gain); fl.land.value = this.landK;
    this.target.exposure = L.exp * (1 + (this.tone ?? 0.5) * 0.15);
    /* per-land bloom (a daylight land raises the threshold: else every lit surface blooms) and environment light */
    const bl = this.bloom; const B = L.bloom;
    bl.threshold += ((B?.threshold ?? 1.0) - bl.threshold) * k; bl.strength += ((B?.strength ?? 0.32) - bl.strength) * k; bl.radius += ((B?.radius ?? 0.45) - bl.radius) * k;
    this.landEnv(L);
    const ei = typeof L.env === 'number' ? L.env : L.env?.intensity;
    if (ei != null) this.scene.environmentIntensity += (ei - this.scene.environmentIntensity) * k;
    this.applyDim();
  }

  /* dim(k): scales the sun, hemisphere, rim and environment after the look pass (a boss darkening the land). */
  applyDim() {
    const d = clamp01(this.dimK || 0);
    if (this._envBase != null) { this.scene.environmentIntensity = this._envBase; this._envBase = null; }
    if (d <= 0) return;
    this.sun.intensity *= 1 - d; this.hemi.intensity *= 1 - d * 0.95; this.rim.intensity *= 1 - d * 0.8;
    this._envBase = this.scene.environmentIntensity; this.scene.environmentIntensity = this._envBase * (1 - d * 0.9);
  }
  dim(k) { this.dimK = clamp01(k || 0); }

  /* setDark(k, radius): the dark, drawn in the post chain before the DOM HUD. Beyond about `radius` metres from the
     camera everything falls to near black (soft edge); lights and emissive pixels still show faintly.
     k (0..1) is eased; 0 turns it off at no cost. */
  setDark(k, radius) { this.darkTarget = clamp01(k || 0); if (radius != null) this.darkR = Math.max(0.5, radius); }

  swapNemesis(nm) {
    if (this.oldNemesis) { this.oldNemesis.holder.removeFromParent(); this.oldNemesis.dispose?.(); }
    this.oldNemesis = null;
    if (this.nemesis) { const old = this.nemesis; old.leaving = true; old.t = 0; this.oldNemesis = old; }
    this.nemesis = nm;
    this.flash(0.35);
  }

  addUpdater(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }
  kick(amount) { this.shake = Math.max(this.shake, amount); this.impact = Math.max(this.impact, Math.min(1, amount * 4)); }
  /* A short event (hit, parry, forge, lightning): amount 0..1 sets the peak. It lasts FLASH_S (120 ms), lifts the exposure
     by at most 15% and puts a thin warm glow on the frame edge; it never whites out the centre. flashAmount = live value. */
  flash(amount) {
    const a = clamp01(Number(amount) || 0); if (a <= 0) return;
    const live = this.flashT < FLASH_S ? this.flashPeak * flashEnv(this.flashT) : 0;
    if (a < live) return;
    this.flashPeak = a; this.flashT = 0;
  }

  update(dt, focus) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 1.6);
    for (const key of ['top', 'bottom', 'fog', 'ground', 'light']) this.col[key].lerp(this.target[key], k);
    this.scene.fog.color.copy(this.col.fog);
    this.scene.fog.near += (this.target.fogNear - this.scene.fog.near) * k;
    this.scene.fog.far += (this.target.fogFar - this.scene.fog.far) * k;
    this.scene.background.copy(this.col.fog);
    this.ground.material.color.copy(this.col.ground);
    this.sun.color.copy(this.col.light);
    this.hemi.color.copy(this.col.bottom).lerp(WHITE, 0.55);
    this.hemi.groundColor.copy(this.col.ground).multiplyScalar(this.landLight ? 0.4 : 1);
    const ll = this.landLight;
    this.hemi.intensity = (1.15 - this.grit * 0.5) * (ll ? ll.hemi : 1); this.sun.intensity = (1.9 + this.grit * 1.6) * (ll ? ll.sun : 1);
    /* the rim keeps figures cut out; a paler tint stops it dyeing the whole land the accent colour */
    this.rim.intensity = this.grit * 2.4 * (ll ? 0.7 : 1); if (this.biome) { this.rim.color.set(this.biome.accent); if (ll) this.rim.color.lerp(WHITE, 0.6); }
    /* flash: real time (not slowed by hit-stop), 120 ms, exposure lift at most 15% on top of the eased base exposure */
    HIT_NOW.value = performance.now() / 1000; /* the clock of the hit rim pulse (real time, like the flash) */
    this.flashT += Math.min(dt, 0.05); this.flashAmount = this.flashPeak * flashEnv(this.flashT);
    const lift = 1 + this.flashAmount * 0.15; const base = this.renderer.toneMappingExposure / (this._flashLift || 1);
    this.renderer.toneMappingExposure = (base + (this.target.exposure - base) * Math.min(1, dt * 8)) * lift; this._flashLift = lift;
    this.film.uniforms.flash.value = this.flashAmount;

    if (focus) {
      if (ll) this.sun.position.set(focus.x + ll.offset.x, ll.offset.y, focus.z + ll.offset.z); else this.sun.position.set(focus.x + 14, 26, focus.z + 10);
      this.sun.target.position.set(focus.x, 0, focus.z);
      this.rim.position.set(focus.x - 10, 9, focus.z - 22); this.rim.target.position.set(focus.x, 1, focus.z);
      this.sky.position.set(focus.x, 0, focus.z);
      /* in a land with no camp up, the sky is the last opaque draw: its cloud shader runs only on the pixels nothing covers */
      this.sky.renderOrder = this.lands?.current && !this._camp?.active ? 50 : -10;
    }

    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      p.t += dt;
      if (p.leaving) {
        p.mesh.scale.y = Math.max(0.0001, p.mesh.scale.y - dt * 2.5 * p.sy);
        if (p.mesh.scale.y <= 0.001) { p.mesh.removeFromParent(); this.props.splice(i, 1); }
      } else {
        const x = clamp01((p.t - p.delay) / 0.7);
        p.mesh.scale.y = Math.max(0.0001, easeOutBack(x) * p.sy);
      }
    }

    /* land props, terrain, sky, water and GPU weather */
    this.lands.update(dt, focus);

    for (const key of ['nemesis', 'oldNemesis']) {
      const nm = this[key];
      if (!nm) continue;
      nm.t += dt; nm.tick(dt, nm.t + (nm.leaving ? 99 : 0));
      const op = nm.mats[0].opacity;
      const next = nm.leaving ? Math.max(0, op - dt * 1.5) : Math.min(1, op + dt * 0.6);
      for (const m of nm.mats) m.opacity = next;
      if (nm.leaving && next <= 0) { nm.holder.removeFromParent(); nm.dispose?.(); this[key] = null; }
    }

    /* the storm's lightning is timed by the land itself (lands.js) */
    this.grit += ((this.biome ? 1 : this.gritFloor) - this.grit) * Math.min(1, dt * 1.2);
    this.impact = Math.max(0, this.impact - dt * 3.5); this.hurt = Math.max(0, this.hurt - dt * 1.6);
    const u = this.film.uniforms; u.time.value = this.time; u.grit.value = this.grit; u.impact.value = this.impact; u.hurt.value = this.hurt;
    for (const fn of this.updaters) fn(dt);

    if (this.shake > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 12);
    }
    this.applyLook(dt, focus);
    this.composer.render();
    /* a one-shot grab of the frame just drawn (main.js hud.freeze: the death shot held under the card build) */
    if (this._grab) { const g = this._grab; this._grab = null; try { g(this.renderer.domElement); } catch (err) { console.warn('grab', err); } }
  }
}


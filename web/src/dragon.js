/* The Hollow Dragon: a boss made of rigid steel plates over a black ember body.
   The model (web/assets/real/dragon.glb, modelled by script in Blender) is a set of rigid parts.
   This file poses every part by code each frame: a Bezier neck chain to a sprung head, a
   follow-the-leader tail, two-bone IK legs that step, hinged wings with a flap cycle and a
   membrane rebuilt every frame. It also owns the fight AI, the fire, the shockwaves and the wear.

   Look: lava cracks are an object-space Voronoi mask injected into the standard materials (addCracks);
   the wing skin is back-lit deep red (addMembraneLight); the breath is a 560-billboard pool with curl
   drift (Breath) that leaves scorch decals (Scorch). Both point lights exist from load() at intensity 0.
   The entrance is scripted: land 10.5 m in front of the player (dust + ember ring), roar with the throat
   glowing through the plates, then the first breath at about 9.3 s after start().

   the idle head hangs low and forward (about 3.3 m up, 2.7 m when the hero is close) so it sits in the view cone at 4-8 m; the neck is a tapering gooseneck
   (per-segment taper and overlap, narrow overlapping throat plates, a dorsal blade crest). The hit spheres double as the hero's keep-out ring (flank, rump, tail and
   low-neck spheres keep the camera 2 m from any surface), the wings stay shut on the ground, and the corpse is ONE body: the neck slumps, the legs sprawl, the wings fold,
   the glow dies in about 2.5 s, no plate comes off at death.

   Usage:
     const boss = new DragonBoss({ scene, camera, accent, arena: 15, player, fx, sfx });
     await boss.load(); boss.start();  ...  boss.update(dt) every frame. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V3 = THREE.Vector3;
const URL = '/assets/real/dragon.glb';

/* Tuning. Player light hit = 3, heavy = 6-7. Player health is 8-14, so the dragon's blows are 1-4. */
export const DRAGON_TUNE = {
  maxHp: 280,
  mult: { head: 1.0, neck: 0.85, body: 0.55, leg: 0.7, wing: 0.5, tail: 0.5 },
  openHead: 2.0,             // head hits while open count double
  poise: 45, poiseRegen: 3,  // damage (heavy x1.5) to stagger it
  airAt: [0.66, 0.33],       // fraction of health at which it takes to the air
  gap: [1.0, 1.9],           // seconds between attacks on the ground
  bite: { wind: 1.0, dmg: 4, guardBreak: 2, push: 3, rest: 1.25, stun: 3.0 },
  sweep: { wind: 1.1, spin: 0.95, dmg: 3, push: 8 },
  fire: { wind: 1.25, dur: 1.6, tick: 0.32, dmg: 1, arc: 0.62 },
  strafe: { tick: 0.4, dmg: 1, burn: 1.7, width: 1.9, speed: 17 },
  slam: { dmg: 2, push: 6, radius: 15.5 },
  stagger: 2.4,
};
const T = DRAGON_TUNE;

/* ---------- small math helpers (no allocation in the frame loop) ---------- */
const UP = new V3(0, 1, 0);
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _f = new V3(), _g = new V3(), _h = new V3();
const _x = new V3(), _y = new V3(), _s = new V3();
const _q = new THREE.Quaternion(); const _m = new THREE.Matrix4(); const _eu = new THREE.Euler();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const damp = (cur, tgt, k, dt) => cur + (tgt - cur) * (1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);

function setFrame(obj, pos, fwd, up) {
  _x.crossVectors(up, fwd); if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).cross(fwd); _x.normalize();
  _y.crossVectors(fwd, _x).normalize();
  _m.makeBasis(_x, _y, fwd); obj.quaternion.setFromRotationMatrix(_m); obj.position.copy(pos);
}
function local(obj, x, y, z, out) { return out.set(x, y, z).applyQuaternion(obj.quaternion).add(obj.position); }
function axis(obj, x, y, z, out) { return out.set(x, y, z).applyQuaternion(obj.quaternion); }

class Spring3 {
  constructor() { this.x = new V3(); this.v = new V3(); }
  set(p) { this.x.copy(p); this.v.set(0, 0, 0); return this; }
  step(target, k, dt) {
    const w = Math.sqrt(k); const n = Math.max(1, Math.ceil(dt * w / 0.35)); const h = dt / n;
    for (let i = 0; i < n; i++) { _s.subVectors(target, this.x).multiplyScalar(k).addScaledVector(this.v, -2 * w); this.v.addScaledVector(_s, h); this.x.addScaledVector(this.v, h); }
  }
}
class Spring1 {
  constructor(x = 0) { this.x = x; this.v = 0; }
  step(target, k, dt) {
    const w = Math.sqrt(k); const n = Math.max(1, Math.ceil(dt * w / 0.35)); const h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (k * (target - this.x) - 2 * w * this.v) * h; this.x += this.v * h; }
  }
}

/* ---------- textures made in code ---------- */
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/* wing membrane: dark leather with veins (rgb) and a tattered alpha (a) */
function membraneTextures() {
  const r = seeded(3);
  const veins = []; for (let i = 0; i < 9; i++) { const x0 = r(); const pts = []; let x = x0; for (let k = 0; k <= 12; k++) { x += (r() - 0.5) * 0.05; pts.push([x, k / 12]); } veins.push(pts); }
  const map = canvasTex(512, (g, n) => {
    g.fillStyle = '#1b1514'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '70,52,46'},${0.05 + r() * 0.08})`; g.fillRect(r() * n, r() * n, 2 + r() * 10, 1 + r() * 3); }
    g.lineCap = 'round';
    for (const v of veins) { for (const [w, c] of [[7, 'rgba(0,0,0,0.5)'], [2.5, 'rgba(90,60,48,0.8)']]) { g.lineWidth = w; g.strokeStyle = c; g.beginPath(); v.forEach(([x, y], k) => (k ? g.lineTo(x * n, y * n) : g.moveTo(x * n, y * n))); g.stroke(); } }
  });
  const glow = canvasTex(512, (g, n) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n); g.lineCap = 'round';
    for (const v of veins) { for (const [w, c] of [[12, 'rgba(255,80,30,0.10)'], [4, 'rgba(255,110,50,0.30)']]) { g.lineWidth = w; g.strokeStyle = c; g.beginPath(); v.forEach(([x, y], k) => (k ? g.lineTo(x * n, y * n) : g.moveTo(x * n, y * n))); g.stroke(); } }
  });
  /* alpha: solid near the bones, holes grow toward the free edge (v = 1); the alphaTest raises as it wears */
  const alpha = canvasTex(256, (g, n) => {
    const img = g.createImageData(n, n); const R = seeded(9);
    const blobs = []; for (let i = 0; i < 60; i++) blobs.push([R(), 0.35 + R() * 0.65, 0.01 + R() * 0.05]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n; const v = y / n;
      let a = 1 - Math.max(0, v - 0.80) * 3.2 - (Math.sin(u * 61) * Math.sin(u * 23 + 1) * 0.5 + 0.5) * Math.max(0, v - 0.86) * 4;
      for (const [bx, by, br] of blobs) { const d = Math.hypot(u - bx, (v - by) * 0.7); if (d < br * 1.8) a -= (1 - d / (br * 1.8)) * 0.55 * by; }
      a = clamp(a, 0, 1); const k = (y * n + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = a * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  return { map, glow, alpha };
}
function dotTex() {
  return canvasTex(64, (g, n) => { const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); }, false);
}

/* ---------- lava cracks: an object-space Voronoi emissive mask, injected into the standard material ----------
   Crack width is measured in screen pixels (fwidth), so a crack stays 3-6 px wide near and far; when the
   cells get smaller than a few pixels the mask fades to an even glow (no shimmer). Pulses at 0.5 Hz. */
const CRACK_GLSL = /* glsl */`
uniform float uTime; uniform float uCrack; uniform float uGate; uniform float uThroat; uniform float uScale;
uniform vec3 uCrackA; uniform vec3 uCrackB; uniform vec4 uBreak[4]; uniform float uFar0; uniform float uAir;
varying vec3 vObjP; varying vec3 vWldP;
vec3 dkHash(vec3 p) { p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
vec2 dkVoro(vec3 x) {
  vec3 p = floor(x); vec3 f = fract(x); float d1 = 8.0; float d2 = 8.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 b = vec3(float(i), float(j), float(k)); vec3 r = b + dkHash(p + b) * 0.85 - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d1), sqrt(d2));
}
vec3 dkCracks() {
  /* far away (in flight, across the arena) the Voronoi cells read as leopard spots: from ~16 m the
     pattern melts into a soft glow that sits on the underside (object -y) and is gone above it */
  float pulse = 0.78 + 0.22 * sin(uTime * 3.14159 + dot(vWldP, vec3(0.35, 0.2, 0.3)));
  float under = (1.0 - smoothstep(-0.35, 0.15, vObjP.y)) * uThroat;
  float camD = distance(vWldP, cameraPosition);
  float farD = max(smoothstep(uFar0, uFar0 + 11.0, camD), uAir); /* in the air: only the soft under-glow, never the cell pattern */
  vec3 soft = uCrackA * (1.0 - smoothstep(-0.75, 0.25, vObjP.y)) * (0.16 * uCrack + 0.55 * under) * pulse;
  if (farD > 0.995) return soft;
  vec3 q = vObjP * uScale;
  q += 0.28 * sin(q.yzx * 1.9 + vec3(1.3, 2.1, 0.7));
  /* where the cracks may appear: everywhere on the core, in growing patches on the plates */
  float patchN = 0.5 + 0.5 * sin(dot(vObjP, vec3(1.3, 2.1, 1.7)) + 1.1) * sin(dot(vObjP, vec3(-2.3, 0.7, 1.9)));
  float boost = 0.0;
  for (int i = 0; i < 4; i++) boost += uBreak[i].w * (1.0 - smoothstep(0.15, 1.1, distance(vWldP, uBreak[i].xyz)));
  float gate = clamp(smoothstep(1.0 - uGate, 1.12 - uGate, patchN) + boost, 0.0, 1.0);
  if (gate + under < 0.01) return soft * farD;
  vec2 v = dkVoro(q); float e = v.y - v.x;
  float w = max(fwidth(e), 1e-4);
  float px = e / w;                                   /* distance to the crack in pixels */
  float core = 1.0 - smoothstep(1.2, 2.6, px);        /* the hot line: ~3-5 px wide */
  core = max(core, (1.0 - smoothstep(0.012, 0.045, e)) * 0.9); /* up close a crack has real width */
  float halo = exp(-e * 24.0) * 0.3;                  /* soft falloff around the line (a tenth of a cell) */
  float far = smoothstep(0.18, 0.5, w);               /* sub-pixel cells: an even ember glow instead */
  float m = mix(core + halo, 0.07, far);
  vec3 col = mix(uCrackA, uCrackB, core * (1.0 - far));
  vec3 nearC = max(col * m * pulse * (uCrack * gate + under * 1.1 + boost * 1.2), vec3(0.0));
  return mix(nearC, soft, farD);
}`;
/* any part of the dragon that comes within uNear metres of the camera dissolves (screen-space dither),
   so the first-person view never sits inside a plate or the skull */
const NEAR_U = { uNear: { value: 1.0 } };
function addNearFade(mat, key) {
  const prev = mat.onBeforeCompile; const pk = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uNear = NEAR_U.uNear;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vNearW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvNearW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vNearW; uniform float uNear;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { float nd = distance(vNearW, cameraPosition);
          if (nd < uNear) { float nk = smoothstep(uNear * 0.4, uNear, nd); float dth = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (nk <= dth) discard; } }`);
  };
  mat.customProgramCacheKey = () => `${pk ? pk() : ''}|near-${key}`;
  mat.needsUpdate = true;
}
/* Scute relief (belly and neck plates): each shell is cut into five overlapping scales across (uv.x 0..1.6), each
   domed with a keel, bevelled at its sides, with rounded rear corners that sit in shadow, two rivets at the front and
   pitting; the hot seam glows only in the gaps and dark corners, and not on every scale. Bump from screen derivatives. */
function addScuteRelief(mat, key) {
  const prev = mat.onBeforeCompile; const pk = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vScUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvScUv = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vScUv;
      float scHash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
      float scNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = scHash(i.x + i.y * 57.0); float b = scHash(i.x + 1.0 + i.y * 57.0); float c = scHash(i.x + (i.y + 1.0) * 57.0); float d = scHash(i.x + 1.0 + (i.y + 1.0) * 57.0); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float scU = vScUv.x / 1.6 * 5.0; float scCell = floor(scU); float scX = fract(scU); float scV = clamp(vScUv.y / 0.8, 0.0, 1.0);
        float scQ = abs(2.0 * scX - 1.0);
        float scRear = 1.0 - smoothstep(0.72, 0.98, scV + 0.24 * scQ * scQ);            /* rounded free edge */
        float scSide = smoothstep(0.0, 0.07, scX) * (1.0 - smoothstep(0.93, 1.0, scX));
        float scBody = scSide * scRear;
        vec2 scR = vec2(scX, scV * 2.4);
        float scRiv = max(1.0 - smoothstep(0.02, 0.045, distance(scR, vec2(0.28, 0.2))), 1.0 - smoothstep(0.02, 0.045, distance(scR, vec2(0.72, 0.2))));
        float scPit = scNoise(vec2(scU * 9.0, scV * 14.0));
        float scH = scBody * (0.55 + 0.45 * (1.0 - scQ)) + scRiv * 0.5 - smoothstep(0.7, 0.92, scPit) * 0.12 * scBody;
        float scVar = 0.8 + 0.4 * scHash(scCell + 13.0);
        diffuseColor.rgb *= mix(0.3, scVar, scBody) * (0.9 + 0.2 * scPit) * (1.0 + 0.4 * scRiv);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 sx = dFdx(-vViewPosition); vec3 sy = dFdy(-vViewPosition); vec3 r1 = cross(sy, normal); vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection; vec2 dh = vec2(dFdx(scH), dFdy(scH)) * 0.6;
          vec3 g = sign(det) * (dh.x * r1 + dh.y * r2); normal = normalize(abs(det) * normal - g); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= (1.0 - scBody * 0.85) * (0.25 + 0.75 * step(0.45, scHash(scCell + 3.0)));`);
  };
  mat.customProgramCacheKey = () => `${pk ? pk() : ''}|scute-${key}`;
  mat.needsUpdate = true;
}
function addCracks(mat, key, shared, own) {
  mat.userData.crack = own;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, own);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vWldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position; vWldP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${CRACK_GLSL}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += dkCracks();');
  };
  mat.customProgramCacheKey = () => `dragon-crack-${key}`;
  mat.needsUpdate = true;
}
/* wing membrane: light from the sky comes through the skin (deep red), plus a rim */
function addMembraneLight(mat, shared) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uBackCol; uniform vec3 uSunDir; uniform float uBack; uniform vec3 uRimCol; uniform float uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 Vd = normalize(vViewPosition); vec3 L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          float back = clamp(-dot(normal, L), 0.0, 1.0);
          float fwd = pow(clamp(dot(-Vd, L), 0.0, 1.0), 2.0);
          float rim = pow(1.0 - abs(dot(normal, Vd)), 3.0);
          float thin = 0.55 + 0.45 * smoothstep(0.05, 0.25, diffuseColor.r);
          totalEmissiveRadiance += uBackCol * uBack * ((0.35 * back + 1.1 * back * fwd) * thin + 0.35 * rim);
          /* in flight the skin glows like a lantern against the sky: a hot rim plus light through the thin parts */
          totalEmissiveRadiance += uRimCol * uRim * (pow(1.0 - abs(dot(normal, Vd)), 2.0) * 1.0 + 0.12 * thin * back); }`);
  };
  mat.customProgramCacheKey = () => 'dragon-membrane';
  mat.needsUpdate = true;
}

/* ---------- breath: 560 camera-facing billboards, curl-noise drift, white -> orange -> red-black ---------- */
class Breath {
  constructor(max) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.size = new Float32Array(max); this.seed = new Float32Array(max); this.heat = new Float32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iMisc', this.aMisc); g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uGain: { value: 1.0 } },
      vertexShader: `attribute vec3 iPos; attribute vec4 iMisc; varying vec2 vQ; varying float vAge; varying float vSeed; varying float vHeat; varying float vWy;
        void main(){
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float age = iMisc.x; float size = iMisc.y * (0.45 + 3.2 * sqrt(age));
          float a = iMisc.z * 6.2831 + age * (iMisc.z - 0.5) * 4.0; float c = cos(a), s = sin(a);
          vec2 off = mat2(c, s, -s, c) * position.xy * size;
          mv.xy += off;
          /* world height of this corner: a billboard that dips into the ground fades out instead of cutting a hard line */
          vWy = (modelMatrix * vec4(iPos, 1.0)).y + (transpose(mat3(viewMatrix)) * vec3(off, 0.0)).y;
          gl_Position = projectionMatrix * mv;
          vQ = position.xy; vAge = age; vSeed = iMisc.z; vHeat = iMisc.w;
        }`,
      fragmentShader: `uniform float uGain; varying vec2 vQ; varying float vAge; varying float vSeed; varying float vHeat; varying float vWy;
        void main(){
          float r = length(vQ * 2.0); if (r > 1.0) discard;
          float n = 0.5 + 0.5 * sin(vQ.x * 7.0 + vSeed * 37.0 + vAge * 5.0) * sin(vQ.y * 6.0 + vSeed * 19.0 - vAge * 9.0);
          n = n * 0.55 + 0.45 * (0.5 + 0.5 * sin(vQ.x * 17.0 - vSeed * 11.0 + vAge * 3.0) * sin(vQ.y * 15.0 + vSeed * 5.0));
          float soft = pow(1.0 - r, 1.2) * smoothstep(0.12, 0.7, n + (1.0 - r) * 0.35);
          /* the ramp: white-hot at the mouth, orange, red, then a red-black that only darkens */
          vec3 c = mix(vec3(2.2, 1.9, 1.5), vec3(1.7, 0.62, 0.12), smoothstep(0.0, 0.1, vAge));
          c = mix(c, vec3(0.9, 0.16, 0.03), smoothstep(0.18, 0.45, vAge));
          c = mix(c, vec3(0.12, 0.02, 0.01), smoothstep(0.45, 0.8, vAge));
          float a = 0.5 * soft * (1.0 - smoothstep(0.55, 1.0, vAge)) * vHeat * smoothstep(0.0, 0.05, vAge + 0.02);
          a *= smoothstep(0.0, 0.7, vWy);
          gl_FragColor = vec4(c * uGain * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 12; this.geo = g;
    this.t = 0;
  }
  emit(px, py, pz, vx, vy, vz, life, size, heat = 1) {
    if (this.n >= this.max) return;
    const i = this.n++; const k = i * 3;
    this.p[k] = px; this.p[k + 1] = py; this.p[k + 2] = pz; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.seed[i] = Math.random(); this.heat[i] = heat;
  }
  update(dt) {
    this.t += dt; const P = this.p, Vv = this.v; const drag = Math.exp(-1.6 * dt); const tt = this.t;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        const j = --this.n; if (i !== j) { for (let c = 0; c < 3; c++) { P[i * 3 + c] = P[j * 3 + c]; Vv[i * 3 + c] = Vv[j * 3 + c]; } this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size[i] = this.size[j]; this.seed[i] = this.seed[j]; this.heat[i] = this.heat[j]; }
        i--; continue;
      }
      const k = i * 3; const x = P[k], y = P[k + 1], z = P[k + 2];
      /* curl of the potential (sin(a z + b y + t), sin(a x + b z + 1.3t), sin(a y + b x + 0.7t)): divergence-free swirl */
      const a = 0.9, b = 1.7;
      const cx = Math.cos(a * z + b * y + tt * 2.0), cy = Math.cos(a * x + b * z + tt * 2.6), cz = Math.cos(a * y + b * x + tt * 1.4);
      const u = this.age[i] / this.life[i]; const amp = (1.5 + 9 * u) * dt;
      Vv[k] = Vv[k] * drag + (a * cz - b * cy) * amp;
      Vv[k + 1] = Vv[k + 1] * drag + (a * cx - b * cz) * amp * 0.6 + 3.2 * u * dt;
      Vv[k + 2] = Vv[k + 2] * drag + (a * cy - b * cx) * amp;
      P[k] += Vv[k] * dt; P[k + 1] += Vv[k + 1] * dt; P[k + 2] += Vv[k + 2] * dt;
      if (P[k + 1] < 0.2 && Vv[k + 1] < 0) { // splash: the jet spreads along the ground
        P[k + 1] = 0.2; const sp = -Vv[k + 1]; Vv[k + 1] = 0.8 + sp * 0.08;
        Vv[k] = Vv[k] * 0.85 + (Math.random() - 0.5) * sp * 0.7; Vv[k + 2] = Vv[k + 2] * 0.85 + (Math.random() - 0.5) * sp * 0.7;
      }
    }
    const ap = this.aPos.array, am = this.aMisc.array;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3; ap[k] = P[k]; ap[k + 1] = P[k + 1]; ap[k + 2] = P[k + 2];
      const m = i * 4; am[m] = this.age[i] / this.life[i]; am[m + 1] = this.size[i]; am[m + 2] = this.seed[i]; am[m + 3] = this.heat[i];
    }
    this.geo.instanceCount = this.n;
    if (this.n) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, this.n * 3); this.aPos.needsUpdate = true;
      this.aMisc.clearUpdateRanges(); this.aMisc.addUpdateRange(0, this.n * 4); this.aMisc.needsUpdate = true;
    }
  }
}

/* ---------- scorch: a pool of ground decals that glow, char and fade over 4 s ---------- */
class Scorch {
  constructor(max) {
    this.max = max; this.i = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4).fill(0), 4).setUsage(THREE.DynamicDrawUsage); // x, z, size, rot
    this.aT = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(-99), 1).setUsage(THREE.DynamicDrawUsage); // birth time
    g.setAttribute('iP', this.aP); g.setAttribute('iT', this.aT); g.instanceCount = max;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uHot: { value: new THREE.Color(2.4, 0.7, 0.15) } }]),
      vertexShader: `attribute vec4 iP; attribute float iT; uniform float uTime; varying vec2 vQ; varying float vAge; varying float vSeed;
        #include <fog_pars_vertex>
        void main(){
          float c = cos(iP.w), s = sin(iP.w); vec3 p = vec3(c * position.x - s * position.z, 0.0, s * position.x + c * position.z) * iP.z;
          p.x += iP.x; p.z += iP.y; p.y = 0.035 + fract(iP.w * 7.13) * 0.012;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
          vQ = position.xz; vAge = uTime - iT; vSeed = fract(iP.w * 3.7);
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 uHot; varying vec2 vQ; varying float vAge; varying float vSeed;
        #include <fog_pars_fragment>
        void main(){
          if (vAge < 0.0 || vAge > 4.0) discard;
          float r = length(vQ * 2.0);
          float n = 0.5 + 0.5 * sin(vQ.x * 9.0 + vSeed * 20.0) * sin(vQ.y * 8.0 - vSeed * 13.0);
          float shape = 1.0 - smoothstep(0.35 + 0.35 * n, 1.0, r);
          if (shape <= 0.0) discard;
          float fade = 1.0 - smoothstep(1.2, 4.0, vAge);
          /* the heat is one soft radial glow (a noise threshold read as leopard spots) */
          float hot = (1.0 - smoothstep(0.0, 1.4, vAge)) * (1.0 - smoothstep(0.0, 0.85, r)) * (0.8 + 0.2 * n);
          vec3 col = mix(vec3(0.018, 0.013, 0.011), uHot * 0.8, hot);
          gl_FragColor = vec4(col, shape * fade * 0.8);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
  }
  add(x, z, size, now) {
    const i = this.i++ % this.max; const a = this.aP.array;
    a[i * 4] = x; a[i * 4 + 1] = z; a[i * 4 + 2] = size; a[i * 4 + 3] = Math.random() * 6.283;
    this.aT.array[i] = now; this.aP.needsUpdate = true; this.aT.needsUpdate = true;
  }
}

/* ---------- smoke and dust: velocity-stretched soft puffs, one draw call ---------- */
class Flames {
  constructor(max, ember, smoke = false, tint = null) {
    this.max = max; this.n = 0; this.smoke = smoke; this.turb = smoke ? 1.5 : 7;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.size = new Float32Array(max); this.seed = new Float32Array(max); this.heat = new Float32Array(max); this.buoy = new Float32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iVel', this.aVel); g.setAttribute('iMisc', this.aMisc);
    g.instanceCount = 0;
    const mid = new THREE.Color(0xff5a14).lerp(ember, 0.3); const cool = new THREE.Color(0x6a1404).lerp(ember, 0.2).multiplyScalar(0.8);
    this.mat = new THREE.ShaderMaterial({
      uniforms: tint ? { uHot: { value: tint[0] }, uMid: { value: tint[1] }, uCool: { value: tint[2] }, uGain: { value: 1.0 } } : smoke ? { uHot: { value: new THREE.Color(0.06, 0.05, 0.05) }, uMid: { value: new THREE.Color(0.035, 0.03, 0.03) }, uCool: { value: new THREE.Color(0.02, 0.018, 0.018) }, uGain: { value: 1.0 } }
        : { uHot: { value: new THREE.Color(2.2, 1.35, 0.55) }, uMid: { value: mid.multiplyScalar(1.5) }, uCool: { value: cool }, uGain: { value: 1.0 } },
      vertexShader: `attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iMisc;
        varying vec2 vQ; varying float vAge; varying float vSeed; varying float vHeat; varying float vWy;
        void main(){
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
          float sp = length(vv.xy); vec2 dir = sp > 1e-3 ? vv.xy / sp : vec2(0.0, 1.0); vec2 nrm = vec2(dir.y, -dir.x); // (nrm, dir) keeps the quad front-facing
          float age = iMisc.x; float size = iMisc.y * (0.35 + 2.9 * sqrt(age));
          float len = size + min(sp, 30.0) * 0.05 * (1.0 - age);
          vec2 off = dir * position.y * len + nrm * position.x * size;
          mv.xy += off;
          vWy = (modelMatrix * vec4(iPos, 1.0)).y + (transpose(mat3(viewMatrix)) * vec3(off, 0.0)).y;
          gl_Position = projectionMatrix * mv;
          vQ = position.xy; vAge = age; vSeed = iMisc.z; vHeat = iMisc.w;
        }`,
      fragmentShader: `uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCool; uniform float uGain;
        varying vec2 vQ; varying float vAge; varying float vSeed; varying float vHeat; varying float vWy;
        void main(){
          float r = length(vQ * 2.0); if (r > 1.0) discard;
          float soft = pow(1.0 - r, 1.3);
          /* two octaves of cheap noise break each streak into licks */
          float n = 0.5 + 0.5 * sin(vQ.x * 9.0 + vSeed * 37.0 + vAge * 7.0) * sin(vQ.y * 6.0 + vSeed * 19.0 - vAge * 13.0);
          n = n * 0.6 + 0.4 * (0.5 + 0.5 * sin(vQ.x * 23.0 - vSeed * 11.0) * sin(vQ.y * 19.0 + vAge * 21.0 + vSeed * 5.0));
          n = smoothstep(0.18, 0.75, n);
          vec3 c = mix(uHot, uMid, smoothstep(0.0, 0.13, vAge)); c = mix(c, uCool, smoothstep(0.25, 0.75, vAge));
          float a = soft * n * (1.0 - smoothstep(0.45, 1.0, vAge)) * vHeat * smoothstep(0.0, 0.04, vAge + 0.02);
          a *= smoothstep(0.0, 0.55, vWy);
          gl_FragColor = vec4(c * uGain, a);
        }`,
      transparent: true, depthWrite: false, blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = smoke ? 11 : 12;
    this.geo = g;
  }
  emit(px, py, pz, vx, vy, vz, life, size, heat = 1, buoy = 3) {
    if (this.n >= this.max) return;
    const i = this.n++; const k = i * 3;
    this.p[k] = px; this.p[k + 1] = py; this.p[k + 2] = pz; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.seed[i] = Math.random(); this.heat[i] = heat; this.buoy[i] = buoy;
  }
  update(dt) {
    const P = this.p, Vv = this.v; const drag = Math.exp(-1.5 * dt);
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { // swap with the last
        const j = --this.n; if (i !== j) { for (let c = 0; c < 3; c++) { P[i * 3 + c] = P[j * 3 + c]; Vv[i * 3 + c] = Vv[j * 3 + c]; } this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size[i] = this.size[j]; this.seed[i] = this.seed[j]; this.heat[i] = this.heat[j]; this.buoy[i] = this.buoy[j]; }
        i--; continue;
      }
      const k = i * 3;
      const tw = this.turb * this.age[i] * dt; const sd = this.seed[i] * 40 + this.age[i] * 6;
      Vv[k] = Vv[k] * drag + Math.sin(sd) * tw * 3; Vv[k + 2] = Vv[k + 2] * drag + Math.cos(sd * 1.3) * tw * 3; Vv[k + 1] = Vv[k + 1] * drag + this.buoy[i] * dt;
      P[k] += Vv[k] * dt; P[k + 1] += Vv[k + 1] * dt; P[k + 2] += Vv[k + 2] * dt;
      if (P[k + 1] < 0.15 && Vv[k + 1] < 0) { P[k + 1] = 0.15; const sp = Math.abs(Vv[k + 1]); Vv[k + 1] = 0.6 + sp * 0.08; Vv[k] *= 0.8; Vv[k + 2] *= 0.8; Vv[k] += (Math.random() - 0.5) * sp * 0.5; Vv[k + 2] += (Math.random() - 0.5) * sp * 0.5; }
    }
    const ap = this.aPos.array, av = this.aVel.array, am = this.aMisc.array;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3; ap[k] = P[k]; ap[k + 1] = P[k + 1]; ap[k + 2] = P[k + 2]; av[k] = Vv[k]; av[k + 1] = Vv[k + 1]; av[k + 2] = Vv[k + 2];
      const m = i * 4; am[m] = this.age[i] / this.life[i]; am[m + 1] = this.size[i]; am[m + 2] = this.seed[i]; am[m + 3] = this.heat[i];
    }
    this.geo.instanceCount = this.n;
    if (this.n) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, this.n * 3); this.aPos.needsUpdate = true;
      this.aVel.clearUpdateRanges(); this.aVel.addUpdateRange(0, this.n * 3); this.aVel.needsUpdate = true;
      this.aMisc.clearUpdateRanges(); this.aMisc.addUpdateRange(0, this.n * 4); this.aMisc.needsUpdate = true;
    }
  }
}

/* ---------- wing membrane: rebuilt each frame from the bone positions ---------- */
const NR = 12, NC = 8; // grid per panel: NR along the fingers, NC across
const _ma = new V3(), _mb = new V3(), _mc = new V3(), _md = new V3(), _me = new V3(), _mf = new V3(), _mh = new V3();
class Membrane {
  constructor(mat) {
    this.panels = 4; const per = (NR + 1) * (NC + 1);
    this.pos = new Float32Array(this.panels * per * 3); this.nrm = new Float32Array(this.panels * per * 3);
    const uv = new Float32Array(this.panels * per * 2); const idx = [];
    for (let p = 0; p < this.panels; p++) {
      for (let i = 0; i <= NR; i++) for (let j = 0; j <= NC; j++) {
        const k = p * per + i * (NC + 1) + j; const t = i / NR; const s = j / NC;
        // v = 1 is the free (tattered) edge
        if (p < 3) { uv[k * 2] = (p + s) / 3; uv[k * 2 + 1] = t; } else { uv[k * 2] = t; uv[k * 2 + 1] = s; }
      }
      for (let i = 0; i < NR; i++) for (let j = 0; j < NC; j++) {
        const a = p * per + i * (NC + 1) + j; const b = a + 1; const c = a + NC + 1; const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNrm = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('normal', this.aNrm); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.geo = g; this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.per = per; this.fold = 0; this.pleat = new V3(0, -1, 0);
  }
  put(p, i, j, v) { const k = (p * this.per + i * (NC + 1) + j) * 3; this.pos[k] = v.x; this.pos[k + 1] = v.y; this.pos[k + 2] = v.z; }
  /* triangle panel from the wrist W to finger tips A and B; the free edge scallops in */
  fan(p, W, A, B, sag, sc = 0.2) {
    const fold = this.fold || 0; const pleat = this.pleat;
    for (let i = 0; i <= NR; i++) {
      const t = i / NR;
      for (let j = 0; j <= NC; j++) {
        const s = j / NC; const pull = 1 - sc * Math.sin(Math.PI * s) * t * t * t;
        _ma.subVectors(A, W).multiplyScalar(1 - s).addScaledVector(_mb.subVectors(B, W), s).multiplyScalar(t * pull).add(W);
        /* the skin hangs between the finger bones: the deepest belly is past the middle of the panel */
        _ma.addScaledVector(sag, Math.sin(Math.PI * s) * Math.sin(Math.PI * Math.pow(t, 0.8) * 0.95) * (1 + 0.35 * t));
        if (fold > 0.01) _ma.addScaledVector(pleat, fold * Math.sin(Math.PI * s * 2 + p * 1.7) * Math.sin(Math.PI * s) * (0.25 + t) * 0.22);
        this.put(p, i, j, _ma);
      }
    }
  }
  /* body panel: Coons patch with S-E-W (arm), W-T (last finger), T-H (free edge), H-S (flank) */
  body(p, S, E, W, Tt, H, sag) {
    const la = S.distanceTo(E); const lb = E.distanceTo(W); const split = la / (la + lb);
    _mh.copy(S).add(W).add(Tt).add(H).multiplyScalar(0.25);
    for (let i = 0; i <= NR; i++) {
      const t = i / NR; // 0 = flank (S..H), 1 = finger (W..T)
      if (t < split) _mc.lerpVectors(S, E, t / split); else _mc.lerpVectors(E, W, (t - split) / (1 - split)); // left(t)
      _md.lerpVectors(H, Tt, t); _md.lerp(_mh, 0.24 * Math.sin(Math.PI * t)); // right(t), scalloped
      for (let j = 0; j <= NC; j++) {
        const s = j / NC;
        _me.lerpVectors(S, H, s).multiplyScalar(1 - t); // bottom(s)
        _mf.lerpVectors(W, Tt, s).multiplyScalar(t);    // top(s)
        _ma.copy(_me).add(_mf).addScaledVector(_mc, 1 - s).addScaledVector(_md, s);
        _ma.addScaledVector(S, -(1 - s) * (1 - t)).addScaledVector(H, -s * (1 - t)).addScaledVector(W, -(1 - s) * t).addScaledVector(Tt, -s * t);
        _ma.addScaledVector(sag, Math.sin(Math.PI * s) * Math.sin(Math.PI * t));
        if (this.fold > 0.01) _ma.addScaledVector(this.pleat, this.fold * Math.sin(Math.PI * t * 3 + s * 2) * Math.sin(Math.PI * s) * Math.sin(Math.PI * t) * 0.3);
        this.put(p, i, j, _ma);
      }
    }
  }
  finish() {
    const P = this.pos, N = this.nrm;
    for (let p = 0; p < this.panels; p++) for (let i = 0; i <= NR; i++) for (let j = 0; j <= NC; j++) {
      const at = (ii, jj) => (p * this.per + ii * (NC + 1) + jj) * 3;
      const i0 = at(Math.max(0, i - 1), j), i1 = at(Math.min(NR, i + 1), j), j0 = at(i, Math.max(0, j - 1)), j1 = at(i, Math.min(NC, j + 1));
      const ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2];
      const vx = P[j1] - P[j0], vy = P[j1 + 1] - P[j0 + 1], vz = P[j1 + 2] - P[j0 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
      const k = at(i, j);
      if (l > 1e-9) { N[k] = nx / l; N[k + 1] = ny / l; N[k + 2] = nz / l; } else { N[k] = NaN; }
    }
    /* a collapsed row (the wrist corner of a fan) borrows the normal of the next row; a NaN normal blacks out the bloom */
    for (let p = 0; p < this.panels; p++) for (let i = NR; i >= 0; i--) for (let j = 0; j <= NC; j++) {
      const k = (p * this.per + i * (NC + 1) + j) * 3;
      if (!Number.isNaN(N[k])) continue;
      const n2 = (p * this.per + Math.min(NR, i + 1) * (NC + 1) + j) * 3;
      if (i < NR && !Number.isNaN(N[n2])) { N[k] = N[n2]; N[k + 1] = N[n2 + 1]; N[k + 2] = N[n2 + 2]; } else { N[k] = 0; N[k + 1] = 1; N[k + 2] = 0; }
    }
    this.aPos.needsUpdate = true; this.aNrm.needsUpdate = true;
  }
}

/* ---------- geometry of the rig ---------- */
const NECK = 7, NECK_L = 0.62, NECK_TOTAL = NECK * NECK_L;
const TAIL = 10; const TAIL_L = Array.from({ length: TAIL }, (_, k) => lerp(0.72, 0.58, k / (TAIL - 1)));
const TAIL_R = Array.from({ length: TAIL + 1 }, (_, k) => lerp(0.52, 0.1, Math.min(1, k / (TAIL - 1)) ** 0.9));
const LEG = {
  F: { up: 'legF_up', lo: 'legF_lo', foot: 'legF_foot', L1: 1.35, L2: 1.25, ankle: 0.36, hip: [0.86, -0.42, 1.85], home: [1.42, 2.05], part: 'chest' },
  H: { up: 'legH_up', lo: 'legH_lo', foot: 'legH_foot', L1: 1.55, L2: 1.45, ankle: 0.40, hip: [0.9, -0.30, -1.30], home: [1.5, -1.2], part: 'pelvis' },
};
const WING_L = { hum: 2.4, fore: 2.8, f: [3.5, 3.1, 2.7, 2.2] };
/* wing bone directions in the chest frame for the left wing (+X); folded and spread */
const WF = { hum: [0.40, 0.62, -0.68], fore: [0.08, -0.12, -0.99], f: [[0.12, 0.06, -1], [0.13, -0.04, -1], [0.14, -0.13, -0.98], [0.15, -0.22, -0.96]] };
const WS = { hum: [0.97, 0.18, 0.06], fore: [0.95, 0.04, 0.28], f: [[0.97, 0.0, 0.08], [0.80, 0.0, -0.58], [0.52, 0.0, -0.86], [0.22, 0.0, -0.98]] };
const LABEL = 'The Hollow Dragon';

export class DragonBoss {
  constructor({ scene, camera, accent = 0xff5a1e, arena = 15, player, fx, sfx, center, url } = {}) {
    this.scene = scene; this.camera = camera; this.arena = arena; this.player = player;
    const nofx = () => {};
    this.fx = Object.assign({ sparks: nofx, embers: nofx, debris: (m) => m.removeFromParent(), shake: nofx, flash: nofx, slow: nofx }, fx || {});
    this.sfx = sfx || nofx;
    this.center = center ? center.clone() : new V3();
    this.url = url || URL;
    this.ember = new THREE.Color(0xff4a12).lerp(new THREE.Color(accent), 0.35);
    this.group = new THREE.Group(); this.group.name = 'HollowDragon';
    this._hp = T.maxHp; this._max = T.maxHp;
    this.state = 'hidden'; this.act = null; this.clock = 0;
    this.P = {}; this.breakables = []; this.ready = false;
    // pose state
    this.J = new V3(0, 2.6, 0); this.yaw = 0; this.pitch = 0; this.roll = 0; this.bodyQ = new THREE.Quaternion();
    this.height = new Spring1(2.6); this.pitchS = new Spring1(0); this.rollS = new Spring1(0);
    this.head = new Spring3(); this.look = new Spring3(); this.jaw = new Spring1(0); this.flinch = new Spring3();
    this.tgt = { head: new V3(), look: new V3(), headK: 30, lookK: 40, jaw: 0, jawK: 60, height: 2.6, pitch: 0, roll: 0,
      wOpen: 0, flapAmp: 0, flapFreq: 0.8, flapBias: 0, sweep: 0, tailSway: 0.18, tailCurl: 0, throat: 0, eyes: 1 };
    this.wing = { open: new Spring1(0), amp: new Spring1(0), bias: new Spring1(0), sweep: new Spring1(0), phase: 0, lastSin: 0 };
    this.tailJ = Array.from({ length: TAIL + 1 }, () => new V3());
    this.neckJ = Array.from({ length: NECK + 1 }, () => new V3());
    this.curve = Array.from({ length: 33 }, () => new V3()); this.curveL = new Float32Array(33);
    this.NB = new V3(); this.NBdir = new V3(); this.mouth = new V3(); this.fwd = new V3(0, 0, 1);
    this.legs = [];
    for (const kind of ['F', 'H']) for (const side of [1, -1]) this.legs.push({ kind, side, def: LEG[kind], foot: new V3(), from: new V3(), to: new V3(), t: 1, stepping: false, ankle: new V3(), knee: new V3(), hip: new V3() });
    this.vel = new V3(); this.flyVel = new V3();
    this.slump = 0; this.throat = 0; this.eyes = 1; this.wear = 0; this.glowFade = 1; this.hitPulse = 0; this.surge = 0; this.airK = 0; this._deathLook = new V3();
    this.poise = T.poise; this.airDone = [false, false]; this.pendingAir = false;
    this.cooldown = 1.5; this.lastActs = [];
    this._cue = { t: 0, total: 1, kind: 'block' }; this.cueOn = false;
    this._focus = new V3();
    this.hit = []; this.hitOut = []; this.empty = [];
    this.burn = Array.from({ length: 48 }, () => ({ p: new V3(), t: -99 })); this.burnI = 0;
    this.result = { killed: false, staggered: false, plateBroken: false };
    this.landing = null; this.air = null; this.dying = null;
  }

  onGround() { return this.state === 'ground' || this.state === 'dying' || this.state === 'dead' || (this.state === 'air' && this.air?.phase === 'crouch'); }

  get hp() { return Math.max(0, this._hp); }
  get maxHp() { return this._max; }
  get dead() { return this._hp <= 0; }
  get label() { return LABEL; }

  /* ================================================================ loading */
  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    const src = {}; for (const c of [...gltf.scene.children]) src[c.name] = c;
    const mt = membraneTextures();
    let steel = null;
    gltf.scene.traverse((o) => { if (o.isMesh && /metal_plate/.test(o.material.name)) steel = o.material; });
    steel.color.set(0xc4c8d0); steel.roughness = 0.82; steel.normalScale?.set(1.5, 1.5);
    /* horns, claws, spikes: plain dark horn (the plate maps on thin horn UVs gave teal fringes) */
    const dark = new THREE.MeshStandardMaterial({ name: 'DR_Dark', color: 0x221d1b, roughness: 0.42, metalness: 0.35, envMapIntensity: 0.6 });
    const teeth = new THREE.MeshStandardMaterial({ name: 'DR_Teeth', color: 0xd9ccb2, roughness: 0.45, metalness: 0.05 });
    const core = new THREE.MeshStandardMaterial({ name: 'DR_Core', color: 0x0b0909, roughness: 0.78, metalness: 0.15, envMapIntensity: 0.25, emissive: this.ember.clone(), emissiveIntensity: 0.04 });
    const neckCore = core.clone(); neckCore.name = 'DR_NeckCore';
    const wingCore = core.clone(); wingCore.name = 'DR_WingCore';
    const eye = new THREE.MeshStandardMaterial({ name: 'DR_Eye', color: 0x000000, emissive: new THREE.Color(0xffc070).lerp(this.ember, 0.25), emissiveIntensity: 2.6 });
    const mouth = new THREE.MeshStandardMaterial({ name: 'DR_Mouth', color: 0x040202, emissive: new THREE.Color(0xffb060).lerp(this.ember, 0.4), emissiveIntensity: 1.0, side: THREE.DoubleSide });
    const gum = new THREE.MeshStandardMaterial({ name: 'DR_Gum', color: 0x2a0a08, roughness: 0.45, metalness: 0.0, emissive: this.ember.clone(), emissiveIntensity: 0.0, side: THREE.DoubleSide });
    const membrane = new THREE.MeshStandardMaterial({ name: 'DR_Membrane', color: 0x8a6e66, map: mt.map, emissive: this.ember.clone(), emissiveMap: mt.glow, emissiveIntensity: 0.35, alphaMap: mt.alpha, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.78, metalness: 0.0 });
    /* lava cracks: shared time / break points, per-material strength */
    this.crackU = { uTime: { value: 0 }, uScale: { value: 1.9 }, uCrackA: { value: new THREE.Color(1.0, 0.16, 0.02).lerp(this.ember, 0.3) }, uCrackB: { value: new THREE.Color(2.1, 0.95, 0.28) },
      uBreak: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uFar0: { value: 16 }, uAir: { value: 0 } };
    const cu = (crack, gate, throat = 0) => ({ uCrack: { value: crack }, uGate: { value: gate }, uThroat: { value: throat } });
    addCracks(core, 'core', this.crackU, cu(1.4, 1.2));
    addCracks(neckCore, 'neck', this.crackU, cu(1.4, 1.2, 0));
    addCracks(steel, 'steel', this.crackU, cu(1.0, 0.1));
    addCracks(wingCore, 'wing', this.crackU, cu(0.4, 1.2));
    this.membraneU = { uBackCol: { value: new THREE.Color(0.55, 0.06, 0.02).lerp(this.ember, 0.15) }, uSunDir: { value: new V3(0.25, 1, 0.15).normalize() }, uBack: { value: 1 },
      uRimCol: { value: new THREE.Color(1.0, 0.32, 0.08).lerp(this.ember, 0.3) }, uRim: { value: 0 } };
    addMembraneLight(membrane, this.membraneU);
    /* the hot seam under the free edge of each belly scute: the rings read as rings, even in the belly's shadow */
    const seamTex = canvasTex(64, (g, n) => { const gr = g.createLinearGradient(0, n, 0, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(0.06, 'rgba(255,255,255,0.6)'); gr.addColorStop(0.15, '#000'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
    seamTex.wrapS = seamTex.wrapT = THREE.ClampToEdgeWrapping;
    const seam = steel.clone(); seam.name = 'DR_Scute'; seam.color.set(0xd2d4da); seam.emissive = new THREE.Color(0xff6a1c); seam.emissiveMap = seamTex; seam.emissiveIntensity = 1.0;
    this.mats = { steel, dark, teeth, core, neckCore, wingCore, eye, mouth, gum, membrane, seam };
    for (const [k, m] of Object.entries(this.mats)) addNearFade(m, k);
    this.textures = [mt.map, mt.glow, mt.alpha, seamTex];
    const swap = (root, neck, wing) => root.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.material.name;
      o.material = /Core/.test(n) ? (neck ? neckCore : wing ? wingCore : core) : /Dark/.test(n) ? dark : /Teeth/.test(n) ? teeth : /Eye/.test(n) ? eye : /Mouth/.test(n) ? mouth : /Gum/.test(n) ? gum : steel;
      o.castShadow = true; o.receiveShadow = true;
    });
    const single = ['head', 'jaw', 'chest', 'pelvis', ...Array.from({ length: NECK }, (_, k) => `neck${k}`), ...Array.from({ length: TAIL }, (_, k) => `tail${k}`)];
    for (const name of single) {
      const o = src[name]; if (!o) throw new Error(`dragon.glb has no part ${name}`);
      swap(o, /^(neck|head|jaw)/.test(name)); this.P[name] = o; this.group.add(o);
      for (const c of o.children) if (/_bk\d+$/.test(c.name)) this.breakables.push({ mesh: c, part: name, region: /^(head|jaw)/.test(name) ? 'head' : /^neck/.test(name) ? 'neck' : 'body', broken: false });
    }
    const pair = ['legF_up', 'legF_lo', 'legF_foot', 'legH_up', 'legH_lo', 'legH_foot', 'wing_hum', 'wing_fore', 'wing_f0', 'wing_f1', 'wing_f2', 'wing_f3'];
    for (const name of pair) {
      const o = src[name]; if (!o) throw new Error(`dragon.glb has no part ${name}`);
      swap(o, false, /^wing/.test(name));
      const r = o.clone(); this.P[`${name}_L`] = o; this.P[`${name}_R`] = r; o.name = `${name}_L`; r.name = `${name}_R`;
      this.group.add(o, r);
    }
    /* a loose plate must pivot about its own centre: the glb plates all sit at their part's origin, so a thrown plate used to rest with its
       surface up to 0.6 m off the ground (hanging) and flew from the wrong point. The geometry is moved to the centre, the mesh moved back. */
    const done = new Set();
    for (const b of this.breakables) {
      const m = b.mesh; const g = m.geometry; if (!g || done.has(g)) continue; done.add(g);
      g.computeBoundingBox(); const c = g.boundingBox.getCenter(new V3()); g.translate(-c.x, -c.y, -c.z); g.computeBoundingSphere();
      m.position.add(c.multiply(m.scale).applyQuaternion(m.quaternion));
    }
    this.buildScutes(steel, seam);
    this.membranes = [new Membrane(membrane), new Membrane(membrane)];
    for (const m of this.membranes) this.group.add(m.mesh);
    // effects
    this.flames = new Breath(560); this.group.add(this.flames.mesh);
    this.smoke = new Flames(320, this.ember, true); this.group.add(this.smoke.mesh);
    this.dust = new Flames(220, this.ember, true, [new THREE.Color(0.23, 0.17, 0.13), new THREE.Color(0.16, 0.12, 0.09), new THREE.Color(0.08, 0.06, 0.05)]); this.group.add(this.dust.mesh);
    this.scorch = new Scorch(64); this.group.add(this.scorch.mesh);
    this.falling = [];
    /* lights exist from the start at intensity 0: adding lights later would recompile every shader */
    this.fireLight = new THREE.PointLight(new THREE.Color(0xff6a20).lerp(this.ember, 0.3), 0, 26, 1.6); this.fireLight.castShadow = false;
    this.throatLight = new THREE.PointLight(this.ember.clone(), 0, 10, 1.8);
    this.group.add(this.fireLight, this.throatLight);
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffb070).lerp(this.ember, 0.4) }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv;
        void main(){ float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard;
          float band = smoothstep(0.84, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
          gl_FragColor = vec4(uColor * 1.3, band * uA * 0.7); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.ring.visible = false; this.ring.renderOrder = 11; this.group.add(this.ring); this.ringT = 99; this.ringAt = new V3(); this.ringHit = true; this.ringR = 15;
    this.line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xff6a2a).lerp(this.ember, 0.5) }, uA: { value: 0 }, uTime: { value: 0 }, uLen: { value: 30 }, uW: { value: 3 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uA; uniform float uTime; uniform float uLen; uniform float uW; varying vec2 vUv;
        void main(){ float x = abs(vUv.x - 0.5) * 2.0;
          /* a soft lane of heat, no hard border: a gaussian across, long fades at both ends, chevrons that melt into it */
          float across = exp(-x * x * 3.2) * (1.0 - smoothstep(0.7, 1.0, x));
          float ph = fract((vUv.y * uLen + x * uW * 0.45) / 2.2 + uTime * 1.6);
          float chev = smoothstep(0.35, 0.62, ph) * (1.0 - smoothstep(0.62, 0.9, ph));
          float fill = 0.16 + 0.08 * sin(uTime * 9.0);
          float endFade = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.78, 1.0, vUv.y));
          gl_FragColor = vec4(uColor * 1.4, (chev * 0.5 + fill) * across * uA * endFade); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.line.visible = false; this.line.renderOrder = 11; this.group.add(this.line);
    this.dot = dotTex(); this.textures.push(this.dot);
    this.buildHit();
    this.group.visible = false;
    this.scene.add(this.group);
    this.ready = true;
    return this;
  }

  /* Belly scutes: 8 overlapping curved plates under the chest and the pelvis (the bare belly read as a barrel).
     One shell geometry, scaled to the body section at each place; each is tilted ~8 deg so its free edge
     hangs below the next one, and every other one is rolled and shifted so the edges do not line up. */
  buildScutes(mat, seamMat) {
    const NV = 6, L = 0.8, TH = 0.06, E = 2 / 2.3;
    /* one shell: half = half arc in radians around the underside; the uv keeps the cell width of the 5-cell belly shell */
    const shell = (half, NU) => {
    const A0 = -Math.PI / 2 - half, A1 = -Math.PI / 2 + half; const uvx = 1.6 * half / 1.3;
    const pos = []; const uv = []; const idx = [];
    const se = (a) => [Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** E, Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** E];
    const top = []; const bot = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV; const rt = []; const rb = [];
      for (let i = 0; i <= NU; i++) {
        const u = i / NU; const q = 2 * u - 1; const a = lerp(A0, A1, u);
        const [cx, cy] = se(a); const nl = Math.hypot(cx, cy) || 1; const nx = cx / nl, ny = cy / nl;
        const edge = i === 0 || i === NU || j === 0 || j === NV;
        let off = 0.075 + 0.24 * v ** 1.4 + 0.05 * (1 - q * q) - 0.05 * Math.abs(q) ** 6 - (edge ? 0.018 : 0);
        const z = -v * L - 0.14 * (1 - Math.abs(q) ** 1.6) * v;
        rt.push(pos.length / 3); pos.push(cx + nx * off, cy + ny * off, z); uv.push(u * uvx, v * 0.8);
        off -= TH;
        rb.push(pos.length / 3); pos.push(cx + nx * off, cy + ny * off, z); uv.push(u * uvx, v * 0.8);
      }
      top.push(rt); bot.push(rb);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      idx.push(top[j][i], top[j + 1][i], top[j][i + 1], top[j][i + 1], top[j + 1][i], top[j + 1][i + 1]);
      idx.push(bot[j][i], bot[j][i + 1], bot[j + 1][i], bot[j][i + 1], bot[j + 1][i + 1], bot[j + 1][i]);
    }
    /* the rim: its own vertices so the edge stays crisp */
    const ring = []; for (let i = 0; i <= NU; i++) ring.push([0, i]); for (let j = 1; j <= NV; j++) ring.push([j, NU]); for (let i = NU - 1; i >= 0; i--) ring.push([NV, i]); for (let j = NV - 1; j > 0; j--) ring.push([j, 0]);
    const P = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
    for (let k = 0; k < ring.length; k++) {
      const [j0, i0] = ring[k]; const [j1, i1] = ring[(k + 1) % ring.length];
      const b = pos.length / 3;
      for (const p of [P(top[j0][i0]), P(bot[j0][i0]), P(bot[j1][i1]), P(top[j1][i1])]) pos.push(...p);
      uv.push(k * 0.05, 0.6, k * 0.05, 0.63, (k + 1) * 0.05, 0.63, (k + 1) * 0.05, 0.6);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
    };
    const g = shell(1.3, 16); const gNeck = shell(0.52, 8);
    /* body sections (the dragon model's surface keys): part, front edge z, half width, half height below, centre y */
    const at = [['chest', 2.4, 0.84, 0.88, 0.2], ['chest', 1.82, 1.05, 1.07, 0.04], ['chest', 1.22, 1.11, 1.13, 0.01], ['chest', 0.62, 1.1, 1.12, 0],
      ['pelvis', 0.05, 1.0, 1.02, 0], ['pelvis', -0.55, 0.99, 0.99, 0], ['pelvis', -1.15, 0.94, 0.92, 0.03], ['pelvis', -1.72, 0.8, 0.76, 0.07]];
    this.scutes = [];
    /* the scutes get their own plate material (the shared steel stays as it is) with the scale relief */
    const plain = seamMat.clone(); plain.name = 'DR_ScutePlain'; plain.emissive = new THREE.Color(0x000000); plain.emissiveMap = null; plain.emissiveIntensity = 0;
    addNearFade(plain, 'scutePlain'); addScuteRelief(plain, 'plain'); addScuteRelief(seamMat, 'seam'); mat = plain; this.mats.scutePlain = plain;
    at.forEach(([part, z0, w, hb, cy], k) => {
      const m = new THREE.Mesh(g, k === 0 || k === 4 ? mat : seamMat); m.name = `scute${k}`; /* the first of each row has nothing over its front edge: no seam glow */ m.castShadow = true; m.receiveShadow = true;
      const alt = k % 2 ? 1 : -1;
      m.position.set(alt * 0.035, cy, z0); m.scale.set(w, hb, 1);
      m.rotation.set(-0.14, alt * 0.03, alt * 0.06, 'XYZ');
      this.P[part].add(m); this.scutes.push(m);
    });
    /* the neck: one narrow tapered plate under each segment (two cells across, not the belly's five), longer than the segment so each
       overlaps the next and a dark gap with the hot seam shows between, every other one a little shorter and shifted: the stack of
       cylinders reads as lamellar armour. The segment's own scale (set in solveNeck) tapers and overlaps the whole segment. */
    for (let k = 0; k < NECK; k++) {
      const t = k / (NECK - 1); const r = lerp(0.6, 0.36, t); const m = new THREE.Mesh(gNeck, k % 3 === 0 ? mat : seamMat); m.name = `neckScute${k}`; m.castShadow = true; m.receiveShadow = true;
      const alt = k % 2 ? 1 : -1; const len = (NECK_L + 0.1) * (k % 2 ? 0.86 : 1);
      m.position.set(alt * 0.012, -0.03, NECK_L + 0.02 + (k % 2 ? 0 : 0.04)); m.scale.set(r * 0.96, r * 0.96, len / 0.8); m.rotation.set(-0.12 - 0.02 * alt, 0, alt * 0.03, 'XYZ');
      this.P[`neck${k}`].add(m); this.scutes.push(m);
    }
    /* a dorsal crest: one broad blade per segment, swept back, tall at the shoulders and shorter toward the head (the glb's thin horns sit between them) */
    const blade = (r, hgt, z0) => {
      const w = Math.max(0.06, r * 0.3); const dz = 0.2; const y0 = r * 1.05 + 0.06; const ax = 0, ay = y0 + hgt, az = z0 - hgt * 0.55;
      const c = [[-w, y0, z0 - dz], [w, y0, z0 - dz], [w * 0.8, y0, z0 + dz], [-w * 0.8, y0, z0 + dz]]; const p = [];
      for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; p.push(a[0], a[1], a[2], b[0], b[1], b[2], ax, ay, az); }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); gg.computeVertexNormals(); return gg;
    };
    for (let k = 0; k < NECK; k++) {
      const t = k / (NECK - 1); const r = lerp(0.6, 0.36, t);
      const sp = new THREE.Mesh(blade(r, lerp(0.46, 0.24, t), 0.5), this.mats.dark); sp.name = `neckSpine${k}`; sp.castShadow = true;
      this.P[`neck${k}`].add(sp);
    }
    this.scuteGeo = g;
  }

  buildHit() {
    const add = (id, part, src, x, y, z, radius) => this.hit.push({ id, part, src, off: new V3(x, y, z), radius, baseR: radius, pos: new V3(), open: false });
    /* The fight pushes the hero out of every sphere (centre below 3.6 m) to radius + 0.75 m, and swings reach radius + 0.5 m past
       the weapon, so a big sphere is also a generous target. The radii keep the camera 2 m or more from any surface:
       the folded wings and legs make the flank 1.5-1.7 m from the centre line, so the flank spheres sit out there. */
    add('head', 'head', 'head', 0, 0.1, 0.7, 1.3);
    add('snout', 'head', 'head', 0, -0.05, 1.55, 0.8);
    add('jaw', 'head', 'jaw', 0, -0.2, 0.9, 0.72);
    for (let k = 0; k < NECK; k++) add(`neck${k}`, 'neck', `neck${k}`, 0, 0, 0.31, lerp(1.45, 1.15, k / (NECK - 1)));
    add('chestF', 'body', 'chest', 0, 0.25, 2.75, 1.7);
    add('chest0', 'body', 'chest', 0, -0.3, 2.0, 1.65); add('chest1', 'body', 'chest', 0, -0.3, 0.7, 1.65); add('pelvis', 'body', 'pelvis', 0, -0.3, -1.0, 1.55);
    add('rump', 'body', 'pelvis', 0, -0.3, -2.0, 1.6);
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      add(`flank${s}0`, 'body', 'chest', sx * 1.9, -0.3, 1.8, 1.7); add(`flank${s}1`, 'body', 'chest', sx * 1.9, -0.3, 0.3, 1.7); add(`flank${s}2`, 'body', 'pelvis', sx * 1.9, -0.3, -1.0, 1.7);
      for (const k of ['F', 'H']) { add(`leg${k}${s}0`, 'leg', `leg${k}_up_${s}`, 0, 0, 0.7, k === 'F' ? 0.45 : 0.55); add(`leg${k}${s}1`, 'leg', `leg${k}_lo_${s}`, 0, 0, 0.6, 0.38); }
      add(`wing${s}0`, 'wing', `wing_hum_${s}`, 0, 0, 1.2, 0.45); add(`wing${s}1`, 'wing', `wing_fore_${s}`, 0, 0, 1.4, 0.4);
    }
    for (const k of [1, 3, 5, 7, 9]) add(`tail${k}`, 'tail', `tail${k}`, 0, 0, 0.3, TAIL_R[k] + 0.95);
  }

  /* ================================================================ public */
  start() {
    if (!this.ready) return;
    this.group.visible = true;
    // land at the arena edge in front of the camera, coming in from far beyond it
    const dir = _a.set(0, 0, -1);
    if (this.camera) { this.camera.getWorldDirection(dir); } else if (this.player) dir.copy(this.player.forward());
    dir.y = 0; if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
    /* land 10.5 m in front of the player (inside the arena): close enough that the first breath fills the view */
    const land = new V3().copy(this.player?.pos || this.center).setY(0).addScaledVector(dir, 10.5);
    _b.subVectors(land, this.center).setY(0); if (_b.length() > this.arena * 0.86) { _b.setLength(this.arena * 0.86); land.copy(this.center).add(_b); }
    this.yaw = Math.atan2(-dir.x, -dir.z);
    const from = new V3().copy(land).addScaledVector(dir, 75); from.y = 40;
    this.J.copy(from); this.flyVel.copy(dir).multiplyScalar(-18); this.flyVel.y = -4;
    this.resetPose();
    this.state = 'land'; this.beginLanding(land, 6.0, true);
  }

  update(dt) {
    if (!this.ready || this.state === 'hidden') return;
    dt = Math.min(dt, 1 / 20); if (dt <= 0) return;
    this.clock += dt;
    this.think(dt);
    this.animate(dt);
    this.effects(dt);
    this.updateHit();
    if (this.state === 'land') this.keepHeroOut(dt);
    else if (this.state === 'ground' && !this.dead) this.keepHeroOut(dt, 4.4, 6);
  }

  /* The fight pushes the hero out of the hit spheres only on the ground. A hero who runs at the landing spot would stand inside the body
     at the slam, so during the landing the hero is slid (at most 14 m/s) out of the footprint of the body plus 2 m. */
  /* on the ground too, a softer ring (4.4 m round the chest, at most 6 m/s): from closer the first-person view held only
     the belly or one flank; the hit spheres still reach 2 m past it, so the hero's blows land */
  keepHeroOut(dt, R = 4.6, rate = 14) {
    if (!this.player || this.J.y > 9) return;
    const pl = this.player.pos;
    const dx = pl.x - (this.J.x + this.fwd.x * 0.4), dz = pl.z - (this.J.z + this.fwd.z * 0.4); const d = Math.hypot(dx, dz);
    if (d < R && d > 1e-3) { const step = Math.min(R - d, rate * dt); pl.x += (dx / d) * step; pl.z += (dz / d) * step; }
  }

  hittable() {
    if (!this.ready || this.state !== 'ground' || this.dead) return this.empty;
    return this.hitOut;
  }

  cue() { return this.cueOn ? this._cue : null; }

  focus() {
    if (!this.ready || this.state === 'hidden' || this.dead) return null;
    return this._focus;
  }

  /* For the fight's death camera (the fight stops calling focus() once dead): null unless dying.
     { look: Vector3 to aim at, t: seconds since the killing blow, dur: how long to hold the shot (7 s), dist: metres to keep (>= 9) } */
  deathView() {
    if (!this.dying || (this.state !== 'dying' && this.state !== 'dead')) return null;
    const D = this.dying; const k = smooth((D.t - 0.9) / 1.4);
    this._deathLook.copy(this._focus).lerp(_a.copy(this.J).setY(1.2), k);
    const v = this._deathV || (this._deathV = { look: this._deathLook, t: 0, dur: 7, dist: 9 });
    v.t = D.t; return v;
  }

  damage(id, dmg, dir, opts = {}) {
    const r = this.result; r.killed = false; r.staggered = false; r.plateBroken = false;
    if (this.dead || this.state !== 'ground') return r;
    const h = this.hit.find((x) => x.id === id); if (!h) return r;
    const open = h.part === 'head' && h.open;
    const mult = (T.mult[h.part] ?? 0.6) * (open ? T.openHead : 1);
    const dealt = dmg * mult;
    this._hp -= dealt;
    this.hitPulse = Math.min(1, this.hitPulse + (opts.heavy ? 0.7 : 0.35));
    const killed = this._hp <= 0;
    const back = _a.copy(dir || UP).normalize().negate();
    this.fx.sparks(h.pos.clone(), back.clone(), opts.crit ? 0xffffff : 0xffd9a0, opts.heavy ? 22 : 12, opts.heavy ? 8 : 6);
    this.sfx(opts.heavy ? 'clangBig' : 'clang');
    if (h.part === 'head') { _b.copy(dir || UP).setY(0.2).normalize().multiplyScalar(opts.heavy ? 0.9 : 0.45); this.flinch.v.addScaledVector(_b, 6); }
    // wear: the region that was hit sheds a plate every so often; health also sheds plates overall
    const region = h.part === 'head' ? 'head' : h.part === 'neck' ? 'neck' : 'body';
    this.wearAcc = (this.wearAcc || 0) + dealt;
    const left = this.breakables.filter((b) => !b.broken);
    const want = Math.floor(this.breakables.length * Math.pow(1 - this.hp / this._max, 0.85));
    const broken = this.breakables.length - left.length;
    if (!killed && left.length && (this.wearAcc >= 9 || broken < want - 1 || opts.heavy && this.wearAcc >= 5)) {
      this.wearAcc = 0;
      const pool = left.filter((b) => b.region === region);
      const list = pool.length ? pool : left;
      let best = list[0]; let bd = 1e9;
      for (const b of list) { b.mesh.getWorldPosition(_c); const d = _c.distanceToSquared(h.pos); if (d < bd) { bd = d; best = b; } }
      this.breakPlate(best, dir); r.plateBroken = true;
    }
    this.poise -= dmg * (opts.heavy ? 1.5 : 1) * (h.part === 'head' ? 1.4 : 1);
    if (this._hp <= 0) { this._hp = 0; this.die(); r.killed = true; return r; }
    for (let i = 0; i < T.airAt.length; i++) if (!this.airDone[i] && this.hp <= this._max * T.airAt[i]) { this.airDone[i] = true; this.pendingAir = true; }
    if (this.poise <= 0 && (!this.act || !['stun', 'stagger', 'roar'].includes(this.act.kind))) {
      this.poise = T.poise; this.beginStun('stagger', T.stagger, _c.copy(this.head.x).addScaledVector(this.fwd, 0.6)); r.staggered = true;
      this.sfx('down'); this.fx.shake(0.45);
    }
    return r;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh && (o.geometry !== undefined)) o.geometry.dispose(); });
    for (const b of this.breakables) if (b.broken) { /* the fight owns broken plates */ }
    for (const m of Object.values(this.mats || {})) m.dispose();
    this.flames?.mat.dispose(); this.smoke?.mat.dispose(); this.dust?.mat.dispose(); this.scorch?.mat.dispose(); this.ring?.material.dispose(); this.line?.material.dispose();
    for (const t of this.textures || []) t.dispose();
    this.ready = false;
  }

  /* extra hooks for tests */
  force(kind) { this.forced = kind; }
  debug() { return { state: this.state, act: this.act?.kind, phase: this.act?.phase, hp: Math.round(this.hp), broken: this.breakables.filter((b) => b.broken).length, of: this.breakables.length, flames: this.flames?.n, air: this.air?.phase }; }

  /* ================================================================ AI */
  think(dt) {
    this.cueOn = false;
    const pl = this.player.pos;
    if (this.state === 'land') return this.thinkLanding(dt);
    if (this.state === 'air') return this.thinkAir(dt);
    if (this.state === 'dying' || this.state === 'dead') return this.thinkDying(dt);
    // ground
    this.poise = Math.min(T.poise, this.poise + T.poiseRegen * dt);
    const a = this.act;
    const fwd = this.fwd;
    // default pose targets, overwritten by the act
    const t = this.tgt;
    t.height = 2.6 + Math.sin(this.clock * 1.3) * 0.04; t.pitch = 0.02; t.roll = 0; t.wOpen = 0; t.flapAmp = 0; t.flapBias = 0; t.sweep = 0;
    t.tailSway = 0.16; t.tailCurl = 0; t.tailStiff = 1; t.tailDroop = 0.16; t.throat = 0; t.eyes = 1; t.jaw = 0.04 + Math.max(0, Math.sin(this.clock * 1.3)) * 0.05; t.jawK = 40; t.headK = 28; t.lookK = 30;
    _a.set(pl.x, pl.y + (this.player.eye ?? 2.08), pl.z); t.look.copy(_a);
    this.idleHead(t.head, 0);
    let turn = true; let walk = true;
    if (a) {
      a.t += dt;
      const fn = this[`act_${a.kind}`];
      const r = fn.call(this, a, dt, t);
      turn = r?.turn ?? false; walk = r?.walk ?? false;
      if (a.done) {
        this.act = null; this.cooldown = rand(T.gap[0], T.gap[1]);
        if (a.kind === 'roar' && this.afterRoar) { if (!this.passive) this.forced = this.forced || this.afterRoar; this.afterRoar = null; this.cooldown = 0.15; }
      }
    } else {
      this.cooldown -= dt;
      if (this.forced === 'die') { this.forced = null; this._hp = 0; this.die(); return; }
      if (this.pendingAir || this.forced === 'air') { this.forced = null; this.pendingAir = false; this.takeoff(); return; }
      if (this.forced) { this.startAct(this.forced); this.forced = null; }
      else if (this.cooldown <= 0 && !this.passive) this.choose();
    }
    if (turn) {
      _b.subVectors(pl, this.J); const want = Math.atan2(_b.x, _b.z); const err = wrap(want - this.yaw);
      /* it turns to the hero about twice as fast (was 0.85 rad/s): a hero who circled it stood at its flank and the
         view held a wall of plate with no head */
      this.turnRate = damp(this.turnRate || 0, Math.abs(err) > 0.3 ? Math.sign(err) * 1.6 : err * 2.2, 5, dt);
      this.yaw = wrap(this.yaw + this.turnRate * dt);
    } else this.turnRate = damp(this.turnRate || 0, 0, 6, dt);
    let speed = 0;
    if (walk) {
      _b.copy(this.J).addScaledVector(fwd, 2.7); const dFront = Math.hypot(pl.x - _b.x, pl.z - _b.z);
      if (dFront > 7.2) speed = 1.9; else if (dFront < 3.6) speed = -1.4; /* backs off sooner (was 2.6 m): the head and chest stay in the view */
    }
    this.speed = damp(this.speed || 0, speed, 3, dt);
    this.J.x += Math.sin(this.yaw) * this.speed * dt; this.J.z += Math.cos(this.yaw) * this.speed * dt;
    // stay in the arena: the body may stand on the rim, never far outside
    _b.subVectors(this.J, this.center).setY(0); const lim = this.arena * 0.92;
    if (_b.length() > lim) { _b.setLength(lim); this.J.x = this.center.x + _b.x; this.J.z = this.center.z + _b.z; }
  }

  idleHead(out, sway) {
    // head hangs forward and up from the neck root, turned toward the player (limited by the body)
    const pl = this.player.pos;
    _c.subVectors(pl, this.NB).setY(0); const dist = _c.length(); _c.normalize();
    _d.copy(this.fwd).setY(0).normalize();
    const ang = clamp(Math.atan2(_c.x * _d.z - _c.z * _d.x, _c.dot(_d)), -1.1, 1.1);
    _c.copy(_d).applyAxisAngle(UP, -ang * 0.8);
    /* the head hangs forward and low (about 3.3 m up, 2.6-3.4 m ahead of the neck root): from 4-8 m it sits in the hero's view cone, not above the frame */
    /* and never closer than about 2.5 m to the hero across the ground (inside a sword's reach): at 4-6 m the head hung right over the hero and above
       the top edge of the view, so the frame held the neck and the chest only */
    const reach = clamp(Math.min(dist * 0.45, dist - 2.5), 1.2, 3.4);
    /* a hero within 2.5-5 m of the neck root gets the head lower still (down to 0.45 m below the root, about 2.7 m up): it stays above the hero's
       2.3 m ring, level with the view, instead of hanging over the top edge of the frame */
    const near = clamp((dist - 2.5) / 2.5, 0, 1);
    out.copy(this.NB).addScaledVector(_c, reach).addScaledVector(UP, lerp(-0.95, 0.2, near) + Math.sin(this.clock * 1.3) * 0.08); /* -0.95 (was -0.45): a close hero sees the head level with the view */
    out.x += Math.sin(this.clock * 0.7) * 0.12 + sway; out.z += Math.cos(this.clock * 0.53) * 0.1;
    return out;
  }

  choose() {
    const pl = this.player.pos;
    _a.subVectors(pl, this.J).setY(0);
    const lz = _a.x * Math.sin(this.yaw) + _a.z * Math.cos(this.yaw);
    const lx = _a.x * Math.cos(this.yaw) - _a.z * Math.sin(this.yaw);
    const fromNB = Math.hypot(pl.x - this.NB.x, pl.z - this.NB.z);
    const behind = lz < 1.0;
    const opts = [];
    if (behind || Math.abs(lx) < 3.5 && lz < 3.2) opts.push(['sweep', 3]);
    if (!behind && fromNB < 7.0) opts.push(['bite', 4], ['fire', 1.4], ['sweep', 0.6]);
    if (!behind && fromNB >= 7.0 && fromNB < 14) opts.push(['fire', 3]);
    if (!opts.length) opts.push(['fire', 1]);
    // no attack three times in a row
    const last2 = this.lastActs.slice(-2);
    let list = opts.filter(([k]) => !(last2.length === 2 && last2[0] === k && last2[1] === k));
    if (!list.length) list = opts;
    let sum = list.reduce((s, o) => s + o[1], 0); let r = Math.random() * sum; let pick = list[0][0];
    for (const [k, w] of list) { r -= w; if (r <= 0) { pick = k; break; } }
    this.startAct(pick);
  }

  startAct(kind) {
    this.act = { kind, t: 0, phase: 'wind', done: false };
    this.lastActs.push(kind); if (this.lastActs.length > 4) this.lastActs.shift();
    if (kind === 'bite') { this.sfx('warn'); this.sfx('dragonGrowl'); }
    if (kind === 'sweep') { this.sfx('warn'); this.act.dir = 0; }
    if (kind === 'fire') { this.sfx('charge'); this.sfx('dragonGrowl'); }
    if (kind === 'roar') { this.act.phase = 'roar'; }
  }

  setCue(t, total, kind) { this.cueOn = t > 0; this._cue.t = Math.max(0, t); this._cue.total = total; this._cue.kind = kind; }

  /* ---------- bite: rear, flare, snap; parry stuns the head on the ground ---------- */
  act_bite(a, dt, t) {
    const B = T.bite; const pl = this.player.pos;
    if (a.phase === 'wind') {
      const k = smooth(a.t / B.wind);
      _c.subVectors(pl, this.NB).setY(0).normalize();
      t.head.copy(this.NB).addScaledVector(_c, lerp(1.6, 0.4, k)).addScaledVector(UP, lerp(1.5, 2.4, k)).addScaledVector(this.fwd, -1.1 * k);
      t.look.set(pl.x, 1.2, pl.z); t.jaw = 0.12 + 0.25 * k; t.eyes = 1 + 1.3 * k; t.headK = 22; t.height = 2.6 + 0.12 * k; t.pitch = 0.05 * k;
      this.setCue(B.wind - a.t + 0.12, B.wind + 0.12, 'block');
      if (a.t >= B.wind) {
        a.phase = 'strike'; a.t = 0; a.hitDone = false;
        // lock the aim now: the snout tip goes to the player's chest, clamped to the neck's reach
        a.aim = new V3(pl.x, 1.25, pl.z);
        _c.subVectors(a.aim, this.NB); _c.y = 0; const d = _c.length(); _c.normalize();
        a.dirH = _c.clone();
        // the neck reaches about 5.6 m to the snout; the body lunges up to 1.6 m for the rest
        a.lunge = clamp(d - 5.6, 0, 1.6); a.lunged = 0;
        const reach = Math.min(d - 1.2, 5.6 + a.lunge);
        a.tip = new V3().copy(this.NB).addScaledVector(_c, reach); a.tip.y = 1.25;
        a.pivot = new V3().copy(a.tip).addScaledVector(_c, -1.7); a.pivot.y = 1.6;
        this.sfx('swingHeavy');
      }
      return { turn: true };
    }
    if (a.phase === 'strike') {
      t.head.copy(a.pivot); t.look.copy(a.tip).addScaledVector(a.dirH, 2).setY(0.6); t.headK = 900; t.lookK = 400;
      const want = a.lunge * smooth(a.t / 0.14); this.J.addScaledVector(a.dirH, want - a.lunged); a.lunged = want;
      t.jaw = a.t < 0.09 ? 0.8 : 0.0; t.jawK = a.t < 0.09 ? 300 : 900; t.eyes = 2.3; t.height = 2.45; t.pitch = -0.08;
      this.setCue(0.12 - a.t, B.wind + 0.12, 'block');
      if (!a.hitDone && a.t >= 0.12) {
        a.hitDone = true;
        local(this.P.head, 0, -0.1, 1.85, _c);
        const tip = _c; const pp = _d.set(pl.x, 1.2, pl.z);
        let res = 'miss';
        if (tip.distanceTo(pp) < 1.9) {
          _e.subVectors(pp, this.NB).setY(0).normalize();
          res = this.player.hit({ dmg: B.dmg, dir: _e.clone(), kind: 'bite', unblockable: false, guardBreak: B.guardBreak, push: B.push });
        }
        a.res = res;
        this.fx.shake(res === 'hit' ? 0.5 : 0.3);
        if (res === 'parried') {
          this.fx.sparks(tip.clone(), UP.clone(), 0xffffff, 30, 9); this.sfx('clangBig');
          this.beginStun('stun', B.stun, a.tip); return {};
        }
        if (res === 'blocked') { this.fx.sparks(tip.clone(), UP.clone(), 0xffe2b0, 18, 7); this.sfx('clangBig'); }
        if (res !== 'hit') { a.phase = 'rest'; a.t = 0; this.sfx('down'); }
        else { a.phase = 'recover'; a.t = 0; }
      }
      return {};
    }
    if (a.phase === 'rest') { // jaw on the ground, open to punishment
      t.head.copy(a.tip).addScaledVector(a.dirH, -1.4).setY(0.66); t.look.copy(a.tip).addScaledVector(a.dirH, 2.5).setY(-0.3);
      t.headK = 90; t.jaw = 0.05; t.eyes = 0.7; t.height = 2.4; t.pitch = -0.06;
      this.headOpen = true;
      if (a.t > 0.12 && !a.dust) { a.dust = true; this.fx.embers(_c.copy(a.tip).setY(0.3), this.ember.getHex(), 10, 2); this.fx.shake(0.25); }
      if (a.t >= B.rest) { a.phase = 'recover'; a.t = 0; }
      return {};
    }
    if (a.phase === 'recover') {
      t.headK = 16; t.jaw = 0.1;
      if (a.t >= 0.8) a.done = true;
      return { turn: a.t > 0.3 };
    }
  }

  /* ---------- stun (parry) and stagger (poise break): head down, open ---------- */
  beginStun(kind, dur, at) {
    const d = _a.subVectors(at, this.NB).setY(0); if (d.lengthSq() < 0.01) d.copy(this.fwd); d.normalize();
    const reach = clamp(Math.hypot(at.x - this.NB.x, at.z - this.NB.z), 2.4, 3.6);
    this.act = { kind: 'stun', t: 0, phase: 'down', done: false, dur, why: kind, dirH: d.clone(), spot: new V3().copy(this.NB).addScaledVector(d, reach).setY(0.62) };
    this.flinch.v.set(0, -4, 0);
  }
  act_stun(a, dt, t) {
    t.head.copy(a.spot); t.look.copy(a.spot).addScaledVector(a.dirH, 3).setY(-0.6);
    t.headK = a.t < 0.5 ? 140 : 70; t.jaw = a.t < 1 ? 0.35 : 0.12; t.eyes = 0.45 + 0.2 * Math.sin(this.clock * 9); t.height = 2.25; t.pitch = -0.1; t.roll = a.why === 'stagger' ? 0.08 : 0.04;
    t.wOpen = 0.08; t.flapBias = -0.15; /* wings nearly shut on the ground: half-open they reach 4 m out, into the hero's keep-out ring */
    this.headOpen = true;
    if (a.t > 0.25 && !a.thud) { a.thud = true; this.fx.shake(0.4); this.fx.embers(_c.copy(a.spot).setY(0.2), this.ember.getHex(), 18, 3); this.sfx('down'); }
    if (a.t >= a.dur) a.done = true;
    return {};
  }

  /* ---------- tail sweep: crouch, wind the tail, spin a full turn ---------- */
  act_sweep(a, dt, t) {
    const S = T.sweep; const pl = this.player.pos;
    if (a.phase === 'wind') {
      if (!a.dir) { // spin the way that brings the tail to the player sooner
        _b.subVectors(pl, this.J); const bearing = Math.atan2(_b.x, _b.z); const tailYaw = this.yaw + Math.PI;
        a.dir = wrap(bearing - tailYaw) > 0 ? -1 : 1; a.yaw0 = this.yaw;
      }
      const k = smooth(a.t / S.wind);
      this.yaw = wrap(a.yaw0 - a.dir * 0.45 * k);
      t.height = 2.6 - 0.45 * k; t.pitch = -0.06 * k; t.tailCurl = a.dir * 0.22 * k; t.tailSway = 0.05;
      _c.copy(this.fwd).applyAxisAngle(UP, -a.dir * 0.9 * k);
      t.head.copy(this.NB).addScaledVector(_c, 2.2).addScaledVector(UP, lerp(2.3, 1.3, k)); t.look.copy(t.head).addScaledVector(_c, 3).setY(0.5);
      t.wOpen = 0.15 * k; t.flapBias = 0.25 * k; t.eyes = 1 + k;
      this.setCue(S.wind - a.t + 0.25, S.wind + 0.25, 'dodge');
      if (a.t >= S.wind) { a.phase = 'spin'; a.t = 0; a.hitDone = false; a.yawS = this.yaw; this.sfx('swingHeavy'); this.sfx('dragonGrowl'); }
      return {};
    }
    if (a.phase === 'spin') {
      const k = clamp(a.t / S.spin, 0, 1); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.yaw = wrap(a.yawS + a.dir * (Math.PI * 2 + 0.45) * e);
      t.height = 2.2; t.pitch = -0.05; t.roll = -a.dir * 0.12 * Math.sin(Math.PI * k); t.tailCurl = -a.dir * 0.05; t.tailSway = 0; t.tailStiff = 24; t.tailDroop = 0.06;
      t.wOpen = 0.2; t.flapBias = 0.15; t.headK = 120;
      t.head.copy(this.NB).addScaledVector(this.fwd, 2.0).addScaledVector(UP, 1.5); t.look.copy(t.head).addScaledVector(this.fwd, 3).setY(1);
      this.cueOn = false;
      if (!a.hitDone) { // the tail, the hips and the wing tips sweep the ground
        for (let i = 0; i <= TAIL + 2; i++) {
          const p = i <= TAIL ? this.tailJ[i] : this.legs[i - TAIL + 1].foot; const rr = i <= TAIL ? TAIL_R[i] : 0.6;
          const d = Math.hypot(p.x - pl.x, p.z - pl.z);
          if (d < rr + 0.9 && p.y < 3.2) {
            a.hitDone = true;
            _e.subVectors(pl, this.J).setY(0).normalize();
            _f.set(_e.z, 0, -_e.x).multiplyScalar(a.dir); _f.addScaledVector(_e, 0.6).normalize();
            const res = this.player.hit({ dmg: S.dmg, dir: _f.clone(), kind: 'tail', unblockable: true, guardBreak: 3, push: S.push });
            this.fx.shake(res === 'hit' ? 0.6 : 0.25); if (res === 'hit') this.sfx('kick');
            break;
          }
        }
      }
      if (Math.random() < dt * 25) { const p = this.tailJ[TAIL - 1]; if (p.y < 0.6) this.fx.sparks(p.clone(), UP.clone(), 0xffd0a0, 4, 4); }
      if (a.t >= S.spin) { a.phase = 'recover'; a.t = 0; this.fx.shake(0.2); }
      return {};
    }
    t.height = 2.4; t.headK = 20;
    if (a.t > 0.9) a.done = true;
    return { turn: a.t > 0.2 };
  }

  /* ---------- fire breath: throat heats, then a sweeping cone along the ground ---------- */
  /* the breath sweeps ONE way: it starts just past the player and swings away to one side. During the wind-up the
     head turns toward that side, so the safe side is readable: dodge AWAY from where the head turns.
     The last 0.6 s of the wind-up: jaw open, throat glowing through the plates, licks of flame at the jaw. */
  act_fire(a, dt, t) {
    const F = T.fire; const pl = this.player.pos;
    if (a.phase === 'wind') {
      if (a.side === undefined) a.side = this.firstFire ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const k = smooth(a.t / F.wind); const late = smooth((a.t - (F.wind - 0.6)) / 0.25);
      _c.subVectors(pl, this.NB).setY(0).normalize();
      _c.applyAxisAngle(UP, a.side * 0.38 * k); // the head turns toward the side the jet will sweep to
      t.head.copy(this.NB).addScaledVector(_c, lerp(1.6, 0.4, k)).addScaledVector(UP, lerp(1.5, 2.2, k)).addScaledVector(this.fwd, -0.6 * k);
      _d.copy(t.head).addScaledVector(_c, 4).addScaledVector(UP, 2.8 * k * (1 - late)); t.look.copy(_d);
      t.jaw = 0.08 + 0.12 * k + 0.45 * late; t.throat = 0.35 * k + 0.65 * late; t.eyes = 1 + 1.2 * k; t.height = 2.6 + 0.18 * k; t.pitch = 0.08 * k; t.headK = 18;
      t.wOpen = 0.15 * k; t.flapBias = 0.3 * k;
      if (Math.random() < dt * (8 + 30 * late)) { local(this.P.head, 0, -0.2, 1.7, _e); this.fx.embers(_e.clone(), this.ember.getHex(), 2, 0.5); }
      if (late > 0 && Math.random() < dt * 60 * late) { // licks of flame leak from the jaw
        local(this.P.head, rand(-0.15, 0.15), -0.2, 1.75, _e); axis(this.P.head, 0, -0.2, 1, _f);
        this.flames.emit(_e.x, _e.y, _e.z, _f.x * 2 + rand(-0.5, 0.5), _f.y * 2 + rand(0.5, 1.5), _f.z * 2 + rand(-0.5, 0.5), rand(0.25, 0.4), 0.1, 0.6);
      }
      this.setCue(F.wind - a.t, F.wind, 'dodge');
      if (a.t > F.wind - 0.22) { _d.subVectors(pl, this.NB).setY(0).normalize().applyAxisAngle(UP, a.side * 0.12); t.look.copy(this.NB).setY(0).addScaledVector(_d, 8.5); t.lookK = 160; t.head.addScaledVector(UP, -0.6); }
      if (a.t >= F.wind) {
        a.phase = 'breath'; a.t = 0; a.tick = 0;
        _b.subVectors(pl, this.NB); const bearing = Math.atan2(_b.x, _b.z);
        a.b0 = bearing + a.side * 0.12; a.b1 = bearing + a.side * (F.arc + 0.55);
        this.sfx('fireBreath'); this.fx.shake(0.3); this.firstFire = false;
      }
      return { turn: a.t < F.wind - 0.6 };
    }
    if (a.phase === 'breath') {
      const k = a.t / F.dur; const b = lerp(a.b0, a.b1, smooth(k * 0.9 + 0.05));
      _c.set(Math.sin(b), 0, Math.cos(b));
      t.head.copy(this.NB).addScaledVector(_c, 2.0).addScaledVector(UP, 1.25); t.headK = 60; t.lookK = 50;
      t.look.copy(this.NB).setY(0).addScaledVector(_c, 8.5);
      t.jaw = 0.62 + Math.sin(this.clock * 31) * 0.04; t.jawK = 120; t.throat = 1; t.eyes = 2.2; t.height = 2.5; t.pitch = -0.04;
      t.wOpen = 0.12; t.flapBias = 0.3;
      this.breathing = 1;
      a.tick -= dt;
      if (a.tick <= 0) {
        // the cone along the ground from the mouth
        const m = this.mouth; _d.subVectors(this.look.x, m); _d.y = 0; _d.normalize();
        _e.subVectors(pl, m); _e.y = 0; const along = _e.dot(_d); const lat = Math.abs(_e.x * _d.z - _e.z * _d.x);
        if (along > 0.5 && along < 12 && lat < 0.9 + along * 0.14) {
          a.tick = F.tick; this.player.hit({ dmg: F.dmg, dir: _d.clone(), kind: 'fire', unblockable: true, guardBreak: 0, push: 0.6 });
        }
      }
      if (a.t >= F.dur) { a.phase = 'recover'; a.t = 0; this.breathing = 0; }
      return {};
    }
    t.throat = Math.max(0, 1 - a.t * 1.2); t.jaw = 0.2; t.headK = 12;
    if (Math.random() < dt * 10) { local(this.P.head, 0, 0.0, 1.8, _e); this.fx.embers(_e.clone(), 0x553322, 2, 0.3); }
    if (a.t >= 1.1) a.done = true;
    return { turn: a.t > 0.5 };
  }

  /* ---------- roar after a landing ---------- */
  act_roar(a, dt, t) {
    const k = smooth(a.t / 0.5) * (1 - smooth((a.t - 1.4) / 0.5));
    t.head.copy(this.NB).addScaledVector(this.fwd, 1.7).addScaledVector(UP, 3.0);
    t.look.copy(t.head).addScaledVector(this.fwd, 3).addScaledVector(UP, 2.2);
    t.jaw = 0.1 + 0.75 * k; t.jawK = 60; t.eyes = 1 + 1.4 * k; t.throat = 0.9 * smooth(a.t / 0.9); t.wOpen = 0.65 * k; t.flapBias = 0.45 * k; t.sweep = -0.2 * k; t.headK = 25; t.height = 2.75;
    if (!a.loud && a.t > 0.35) { a.loud = true; this.sfx('dragonRoar'); this.fx.shake(0.35); }
    if (a.t > 0.5 && a.t < 1.5 && Math.random() < dt * 20) { local(this.P.head, 0, -0.1, 1.7, _e); this.fx.embers(_e.clone(), this.ember.getHex(), 3, 1.2); }
    if (a.t >= 2.0) a.done = true;
    return {};
  }

  /* ================================================================ flight */
  takeoff() {
    this.state = 'air'; this.act = null; this.headOpen = false;
    this.air = { phase: 'crouch', t: 0, runs: this.airDone[1] ? 2 : 1, made: 0 };
    this.sfx('warn');
  }

  flySeek(dt, target, speed, turn, climb = 1.6) {
    const want = Math.atan2(target.x - this.J.x, target.z - this.J.z);
    const err = wrap(want - this.yaw); const rate = clamp(err * 1.6, -turn, turn);
    this.turnRate = damp(this.turnRate || 0, rate, 3, dt); this.yaw = wrap(this.yaw + this.turnRate * dt);
    this.flySpeed = damp(this.flySpeed || 0, speed, 1.2, dt);
    const vy = clamp((target.y - this.J.y) * climb, -7, 7);
    this.flyVel.set(Math.sin(this.yaw) * this.flySpeed, damp(this.flyVel.y, vy, 2, dt), Math.cos(this.yaw) * this.flySpeed);
    this.J.addScaledVector(this.flyVel, dt);
    this.tgt.roll = clamp(-this.turnRate * 0.55, -0.7, 0.7); this.tgt.pitch = clamp(Math.atan2(this.flyVel.y, Math.max(4, this.flySpeed)) * 0.8, -0.5, 0.5);
  }

  flightPose(t, flapAmp, freq) {
    t.wOpen = 1; t.flapAmp = flapAmp; t.flapFreq = freq; t.flapBias = 0.08; t.sweep = 0; t.tailSway = 0.08; t.tailCurl = 0;
    t.headK = 20; t.jaw = 0.06;
    _c.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    t.head.copy(this.NB).addScaledVector(_c, 3.6).addScaledVector(UP, 0.9 - this.tgt.pitch * 2);
    t.look.copy(t.head).addScaledVector(_c, 6).addScaledVector(UP, -1.5);
  }

  thinkAir(dt) {
    const A = this.air; A.t += dt; const t = this.tgt; const pl = this.player.pos;
    t.throat = 0; t.eyes = 1.3;
    if (A.phase === 'crouch') {
      const k = smooth(A.t / 0.55);
      t.height = 2.6 - 0.7 * k; t.pitch = 0.1 * k; t.wOpen = k; t.flapBias = 0.7 * k; t.flapAmp = 0; t.sweep = -0.1;
      this.idleHead(t.head, 0); t.head.y -= 0.6 * k; t.look.set(pl.x, 6, pl.z); t.headK = 20;
      if (A.t >= 0.55) {
        A.phase = 'lift'; A.t = 0; this.flyVel.set(Math.sin(this.yaw) * 4, 11, Math.cos(this.yaw) * 4); this.flySpeed = 4;
        this.fx.shake(0.45); this.sfx('down'); this.sfx('wingBeat'); this.shock(this.J.clone().setY(0), 9, false);
        for (const l of this.legs) l.stepping = false;
      }
      return;
    }
    if (A.phase === 'lift') {
      this.flyVel.y = damp(this.flyVel.y, 2, 0.8, dt);
      this.flySpeed = damp(this.flySpeed, 13, 0.7, dt);
      this.flyVel.x = Math.sin(this.yaw) * this.flySpeed; this.flyVel.z = Math.cos(this.yaw) * this.flySpeed;
      this.J.addScaledVector(this.flyVel, dt);
      t.pitch = 0.35; t.roll = 0; this.flightPose(t, 1.0, 1.05);
      if (this.J.y > 8.5 || A.t > 3) { A.phase = 'circle'; A.t = 0; A.dur = rand(2.6, 3.6); }
      return;
    }
    if (A.phase === 'circle' || A.phase === 'out') {
      _a.subVectors(this.J, this.center).setY(0); const ang = Math.atan2(_a.x, _a.z) + 0.55;
      _b.set(this.center.x + Math.sin(ang) * 29, 9.8, this.center.z + Math.cos(ang) * 29); /* 30% lower than the first build: the silhouette reads against the sky band, not as a dot */
      this.flySeek(dt, _b, 16, 0.9); this.flightPose(t, 0.75, 0.8);
      if (A.t >= A.dur) {
        if (A.made < A.runs) this.beginStrafe();
        else { // land at the edge, coming in from outside
          _a.subVectors(this.J, this.center).setY(0).normalize();
          const land = new V3().copy(this.center).addScaledVector(_a, this.arena * 0.86);
          this.state = 'land'; this.beginLanding(land, 5.0, false);
        }
      }
      return;
    }
    if (A.phase === 'swoop' || A.phase === 'strafe') {
      const S = T.strafe; const L = A.line; let u;
      if (A.phase === 'swoop') { // a scripted Bezier dive that arrives aligned with the line
        const W = A.swoop; W.t += dt; const k = clamp(W.t / W.T, 0, 1); const m = 1 - k;
        _b.copy(W.p0).multiplyScalar(m * m * m).addScaledVector(W.p1, 3 * m * m * k).addScaledVector(W.p2, 3 * m * k * k).addScaledVector(W.p3, k * k * k);
        this.flyVel.subVectors(_b, this.J).divideScalar(dt); this.J.copy(_b);
        if (k >= 1) { A.phase = 'strafe'; A.u = W.u0; }
        _a.subVectors(this.J, L.a).setY(0); u = _a.dot(L.dir);
      } else {
        A.u += S.speed * dt; u = A.u;
        const y = this.J.y; this.J.copy(L.a).addScaledVector(L.dir, u); this.J.y = damp(y, 5.3, 3, dt);
        this.flyVel.copy(L.dir).multiplyScalar(S.speed);
      }
      const want = Math.atan2(this.flyVel.x, this.flyVel.z); const dy = wrap(want - this.yaw);
      this.turnRate = dy / dt; this.yaw = wrap(this.yaw + dy); this.flySpeed = S.speed;
      t.roll = clamp(-this.turnRate * 0.45, -0.75, 0.75); t.pitch = clamp(Math.atan2(this.flyVel.y, S.speed) * 0.8, -0.45, 0.3);
      this.flightPose(t, A.phase === 'strafe' ? 0.35 : 0.7, 0.9);
      // fire: the impact point runs ahead of the dragon along the line
      const lead = u + 11; const imp = _c.copy(L.a).addScaledVector(L.dir, lead); imp.y = 0;
      const firing = A.phase === 'strafe' && lead > 0 && lead < L.len;
      this.line.visible = true; this.lineA = Math.min(1, (this.lineA || 0) + dt * 3);
      if (firing) {
        t.head.copy(this.NB).addScaledVector(L.dir, 2.6).addScaledVector(UP, -0.6); t.look.copy(imp); t.lookK = 80; t.headK = 60;
        t.jaw = 0.6; t.throat = 1; t.eyes = 2.2; this.breathing = 1;
        if (!A.firing) { A.firing = true; this.sfx('fireBreath'); }
        if (this.clock - (A.lastBurn || 0) > 0.07) { A.lastBurn = this.clock; const bnode = this.burn[this.burnI++ % this.burn.length]; bnode.p.copy(imp); bnode.t = this.clock; }
      } else this.breathing = 0;
      // cue: time until the fire reaches the player along the line
      _e.subVectors(pl, L.a).setY(0); const pu = _e.dot(L.dir); const plat = Math.abs(_e.dot(_d.set(L.dir.z, 0, -L.dir.x)));
      if (plat < S.width + 1.5 && pu > lead && pu < L.len + 1) {
        const tt = (A.phase === 'swoop' ? A.swoop.T - A.swoop.t : 0) + (pu - Math.max(lead, A.phase === 'swoop' ? A.swoop.u0 + 11 : lead)) / S.speed;
        if (!A.cueTotal) A.cueTotal = Math.max(0.8, tt); this.setCue(tt, A.cueTotal, 'dodge');
      }
      if (A.phase === 'strafe' && u > L.len + 6) {
        A.made++; A.phase = 'out'; A.t = 0; A.dur = A.made < A.runs ? 3.2 : 2.2; this.breathing = 0; A.cueTotal = 0; A.firing = false;
        this.flyVel.y = 3;
      }
      return;
    }
  }

  beginStrafe() {
    const A = this.air; const pl = this.player.pos; const S = T.strafe;
    // the line passes through the player; pick its heading so the dive from here needs the least turning
    const h = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); const half = 15; const u0 = -18;
    let best = null; let bs = 1e9;
    for (let deg = -90; deg <= 90; deg += 10) {
      const dir = h.clone().applyAxisAngle(UP, deg * Math.PI / 180);
      const E = new V3().copy(pl).addScaledVector(dir, -half + u0); E.y = 0;
      const to = new V3().subVectors(E, this.J).setY(0); const D = to.length(); if (D < 18) continue; to.normalize();
      const score = Math.acos(clamp(h.dot(to), -1, 1)) + Math.acos(clamp(to.dot(dir), -1, 1)) + Math.abs(D - 32) * 0.02;
      if (score < bs) { bs = score; best = { dir, E, D }; }
    }
    if (!best) { const dir = h.clone(); best = { dir, E: new V3().copy(pl).addScaledVector(dir, -half + u0), D: 20 }; }
    const { dir, E, D } = best;
    const a = new V3().copy(pl).addScaledVector(dir, -half); a.y = 0;
    A.line = { a, dir, len: half * 2 };
    E.y = 5.3;
    A.swoop = { p0: this.J.clone(), p1: this.J.clone().addScaledVector(h, D * 0.45), p2: E.clone().addScaledVector(dir, -D * 0.45).setY(6.3), p3: E, T: D * 1.25 / S.speed, t: 0, u0 };
    A.phase = 'swoop'; A.t = 0; A.firing = false; A.cueTotal = 0;
    // telegraph on the ground
    this.line.position.copy(a).addScaledVector(dir, half).setY(0.04);
    this.line.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
    this.line.scale.set(S.width * 2, 1, half * 2);
    this.line.material.uniforms.uLen.value = half * 2; this.line.material.uniforms.uW.value = S.width * 2;
    this.lineA = 0; this.sfx('warn');
  }

  beginLanding(spot, dur, entrance) {
    // a cubic path from the current flight to the spot, slowing down, with a flare at the end
    const p0 = this.J.clone();
    const p1 = p0.clone().addScaledVector(this.flyVel, dur / 3);
    /* come in from beyond the spot as the player sees it: the approach never passes over the player */
    _a.subVectors(spot, this.player?.pos || this.center).setY(0);
    if (_a.lengthSq() < 1) _a.subVectors(spot, this.center).setY(0);
    if (_a.lengthSq() < 1e-4) _a.set(0, 0, 1);
    _a.normalize();
    const p2 = spot.clone().addScaledVector(_a, 7); p2.y = 2.6 + 6;
    const p3 = spot.clone(); p3.y = 2.6;
    this.landing = { p0, p1, p2, p3, T: dur, t: 0, entrance, prev: p0.clone(), slam: false };
    if (this.air) this.air.phase = 'land';
  }

  thinkLanding(dt) {
    const Lg = this.landing; Lg.t += dt; const t = this.tgt; const pl = this.player.pos;
    const k = clamp(Lg.t / Lg.T, 0, 1); const u = 1 - (1 - k) * (1 - k) * (1 - 0.35 * k);
    const m = 1 - u; const P = _a.copy(Lg.p0).multiplyScalar(m * m * m).addScaledVector(Lg.p1, 3 * m * m * u).addScaledVector(Lg.p2, 3 * m * u * u).addScaledVector(Lg.p3, u * u * u);
    this.flyVel.subVectors(P, Lg.prev).divideScalar(dt); Lg.prev.copy(P); this.J.copy(P);
    const flat = Math.hypot(this.flyVel.x, this.flyVel.z);
    // heading: along the path until the flare, then turn to face the arena centre
    const toC = Math.atan2(this.center.x - this.J.x, this.center.z - this.J.z);
    const along = flat > 2 ? Math.atan2(this.flyVel.x, this.flyVel.z) : this.yaw;
    const want = k > 0.75 ? toC : along;
    this.yaw = wrap(this.yaw + clamp(wrap(want - this.yaw), -1.5 * dt, 1.5 * dt));
    const flare = smooth((k - 0.6) / 0.35);
    t.pitch = lerp(clamp(Math.atan2(this.flyVel.y, Math.max(4, flat)), -0.35, 0.2), 0.5, flare); t.roll = 0;
    t.wOpen = 1; t.flapAmp = lerp(0.35, 1.05, flare); t.flapFreq = lerp(0.7, 1.2, flare); t.flapBias = lerp(0.05, 0.25, flare); t.sweep = 0.35 * flare;
    t.tailSway = 0.08; t.tailCurl = 0; t.throat = 0; t.eyes = 1.4; t.jaw = 0.08; t.headK = 18;
    _c.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    t.head.copy(this.NB).addScaledVector(_c, lerp(3.4, 2.0, flare)).addScaledVector(UP, lerp(0.8, 2.2, flare));
    t.look.set(pl.x, 1.5, pl.z);
    const remain = Lg.T - Lg.t;
    if (remain < 1.4) this.setCue(remain, 1.4, 'dodge');
    if (k >= 1 && !Lg.slam) {
      Lg.slam = true; this.state = 'ground'; this.air = null; this.line.visible = false;
      this.J.y = 2.6; this.height.x = 2.6; this.height.v = -7; this.pitchS.v = -1.6;
      for (const l of this.legs) this.plantFoot(l, true);
      this.fx.shake(0.85); this.fx.flash(0.12); this.sfx('down'); this.sfx('clangBig'); this.sfx('quake');
      this.shock(_b.copy(this.J).setY(0).addScaledVector(_c, 1.2), T.slam.radius, true);
      this.landBurst(_b);
      this.startAct('roar'); this.cooldown = 1.0;
      if (Lg.entrance) { this.firstFire = true; this.afterRoar = 'fire'; } // the signature beat: land, rear, breathe
    }
  }

  shock(at, radius, hurts, soft = 1) {
    this.ringAt.copy(at); this.ringT = 0; this.ringR = radius; this.ringHit = !hurts; this.ring.visible = true;
    this.ring.position.copy(at).setY(0.06);
    this.dustRing(at, radius > 10 ? 1 : 0.6, soft);
  }
  /* a ring of dust rolls out along the ground, embers ride it */
  dustRing(at, power, soft = 1) { /* soft < 1 thins the ring: fewer, smaller, fainter puffs (the death uses 0.15: a haze at the feet, not a wall) */
    const n = Math.round(110 * power * soft);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rand(-0.04, 0.04); const c = Math.cos(ang), s = Math.sin(ang); const sp = rand(9, 15) * power;
      this.dust.emit(at.x + c * rand(1.2, 2.6), rand(0.2, 0.7), at.z + s * rand(1.2, 2.6), c * sp, rand(0.6, 2.2), s * sp, rand(1.4, 2.4) * (0.6 + 0.4 * soft), rand(0.9, 1.6) * (0.5 + 0.5 * soft), 0.85 * (0.3 + 0.7 * soft), 0.5);
    }
    for (let i = 0; i < 90 * power * soft; i++) { // embers ride the ring out
      const ang = Math.random() * Math.PI * 2; const c = Math.cos(ang), s = Math.sin(ang); const sp = rand(6, 14) * power;
      this.flames.emit(at.x + c * 1.5, rand(0.2, 1.0), at.z + s * 1.5, c * sp, rand(1.5, 6), s * sp, rand(1.0, 1.8), rand(0.05, 0.1), 1.4);
    }
  }
  landBurst(at) {
    this.fx.embers(_e.copy(at).setY(0.4), this.ember.getHex(), 30, 5);
    for (const l of this.legs) this.dust.emit(l.foot.x, 0.3, l.foot.z, rand(-2, 2), rand(1, 2.5), rand(-2, 2), rand(1.6, 2.4), rand(1.2, 1.8), 0.9, 0.4);
  }

  /* ================================================================ death */
  die() {
    if (this.state === 'dying' || this.state === 'dead') return;
    this.state = 'dying'; this.act = null; this.cueOn = false; this.breathing = 0; this.headOpen = false; this.line.visible = false;
    this.dying = { t: 0, side: Math.random() < 0.5 ? 1 : -1, burst: false };
    this.sfx('dragonRoar'); this.fx.slow(1.2); this.fx.flash(0.2);
  }

  thinkDying(dt) {
    const D = this.dying; D.t += dt; const t = this.tgt;
    const s = D.side;
    /* the death: the cracks surge white-hot as it rears, it falls, the neck slumps onto the ground, the legs
       sprawl, the wings fold; at the impact the fire inside goes out fast (the glow dies from white to black in about 2.5 s) and the hull settles a
       little into the ground. No plate comes off: nothing separates, nothing lies about or hangs. */
    if (D.t < 1.1) this.surge = smooth(D.t / 1.0) * 1.2;
    else if (!D.burst) this.surge = damp(this.surge, 0.7, 3, dt);
    else { const a = D.t - D.burstAt; this.surge = a < 0.15 ? 1.6 : 1.6 * Math.exp(-(a - 0.15) * 1.6); }
    if (D.burst) {
      const a = D.t - D.burstAt;
      if (!D.waves && a > 0.5) { D.waves = 1; this.fx.shake(0.3); this.sfx('breakPart'); }
      /* embers off the hull while it still glows: rising off the chest, the pelvis and the neck, always from a point on the body */
      const rate = 60 * Math.max(0, this.glowFade) + (a < 3 ? 6 : 0);
      this.emberAcc = (this.emberAcc || 0) + dt * rate;
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        const src = Math.random(); const nk = Math.floor(Math.random() * NECK); const neck = src >= 0.75;
        const part = src < 0.4 ? this.P.chest : src < 0.75 ? this.P.pelvis : this.P[`neck${nk}`];
        if (neck) local(part, rand(-0.25, 0.25), rand(0.2, 0.45), rand(0.05, 0.55), _e); else local(part, rand(-0.8, 0.8), rand(0.3, 0.9), rand(-1.6, 1.6), _e);
        this.flames.emit(_e.x, _e.y, _e.z, rand(-0.4, 0.4), rand(1.2, 3.0), rand(-0.4, 0.4), rand(0.9, 1.6), rand(0.025, 0.05), 1.2);
        if (Math.random() < 0.12) this.smoke.emit(_e.x, _e.y + 0.2, _e.z, rand(-0.3, 0.3), rand(0.8, 1.4), rand(-0.3, 0.3), rand(1.8, 2.8), rand(0.5, 0.9), 0.4, 0.9);
      }
    }
    if (D.t < 1.1) { // last rear: head high, jaw wide, glow flares
      const k = smooth(D.t / 0.5);
      t.head.copy(this.NB).addScaledVector(this.fwd, 1.0).addScaledVector(UP, 3.4); t.look.copy(t.head).addScaledVector(UP, 3).addScaledVector(this.fwd, 2);
      t.jaw = 0.85 * k; t.eyes = 2.4; t.throat = 0.8; t.height = 2.8; t.pitch = 0.1; t.wOpen = 0.8 * k; t.flapBias = 0.5 * k; t.headK = 30;
      if (Math.random() < dt * 30) { local(this.P.head, 0, -0.1, 1.6, _e); this.fx.embers(_e.clone(), this.ember.getHex(), 3, 1.5); }
    } else { // the legs give, the body drops, the neck falls to the side and lies along the ground
      const k = smooth((D.t - 1.1) / 1.1);
      const sink = smooth(((D.burst ? D.t - D.burstAt : 0) - 0.3) / 2.2);
      t.height = lerp(2.8, 1.12, k) - 0.16 * sink; t.pitch = -0.05 * k; t.roll = s * 0.22 * k;
      t.wOpen = lerp(0.8, 0.0, smooth((D.t - 1.3) / 1.2)); t.flapBias = lerp(0.5, -0.25, k); t.sweep = lerp(0.1, 0, k);
      this.slump = smooth((D.t - 1.1) / 1.0);
      /* the dead wings: folded against the back, the skin slackened into folds (no flat board, no bones in the air) */
      this.deadFold = smooth((D.t - 1.6) / 1.6);
      _c.copy(this.fwd).applyAxisAngle(UP, s * 0.75);
      t.head.copy(this.NB).setY(0.5).addScaledVector(_c, 3.0); t.look.copy(t.head).addScaledVector(_c, 2.5).setY(-0.4);
      t.headK = D.t < 1.6 ? 10 : 50; t.jaw = 0.3; t.throat = 0; t.tailSway = 0;
      if (!D.burst && ((this.head.x.y < 1.0 && D.t > 1.5) || D.t > 2.8)) {
        D.burst = true; D.burstAt = D.t; D.waves = 0;
        this.fx.shake(1.0); this.fx.flash(0.25); this.sfx('execute'); this.sfx('down');
        this.shock(_b.copy(this.head.x).setY(0), 9, false, 0.15);
        this.dustRing(_b.copy(this.J).setY(0), 0.5, 0.15);
        this.fx.embers(this.J.clone().setY(1.0), this.ember.getHex(), 30, 4);
      }
      /* the fire goes out right after the fall: full for 0.3 s, then to nearly black over 2.2 s with a last flicker */
      if (D.burst) { const a = D.t - D.burstAt; this.glowFade = a < 0.3 ? 1 : Math.max(0.03, (1 - (a - 0.3) / 2.2) * (0.88 + 0.12 * Math.sin(a * 23) * Math.sin(a * 7))); }
      t.eyes = 2.4 * Math.min(1, this.glowFade * 1.6);
    }
    /* plates that came off earlier in the fight shrink to nothing as the dragon dies: no loose shard lies beside the corpse */
    if (D.t > 0.8) for (const b of this.breakables) if (b.broken && b.mesh.visible) { b.mesh.scale.multiplyScalar(Math.exp(-3.5 * dt)); if (b.mesh.scale.x < 0.03) b.mesh.visible = false; }
    if (D.t > 7 && this.state !== 'dead') this.state = 'dead';
  }

  /* ================================================================ plates */
  breakPlate(b, dir, power = 1) {
    if (b.broken) return; b.broken = true;
    const m = b.mesh;
    m.getWorldPosition(_g);
    this.scene.attach(m);
    const part = this.P[b.part];
    _a.subVectors(_g, part.position).normalize();
    const v = new V3().copy(_a).multiplyScalar(rand(2.5, 4.5) * power).addScaledVector(UP, rand(2, 4.5) * power);
    if (dir) v.addScaledVector(dir, 2.2);
    /* a plate never flies at the hero (it would cross the camera and dissolve into a ghost shape): its horizontal velocity points away from the hero by 1.5 m/s at least */
    if (this.player?.pos) { const pp = this.player.pos; _c.set(pp.x - _g.x, 0, pp.z - _g.z); if (_c.lengthSq() > 1e-4) { _c.normalize(); const along = v.x * _c.x + v.z * _c.z; if (along > -1.5) { v.x -= _c.x * (along + 1.5); v.z -= _c.z * (along + 1.5); } } }
    const spin = new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    this.fx.debris(m, v, spin);
    this.fx.sparks(_g.clone(), _a.clone(), 0xffd9a0, 26, 8);
    this.fx.embers(_g.clone(), this.ember.getHex(), 16, 1.8);
    for (let i = 0; i < 6; i++) this.smoke.emit(_g.x, _g.y, _g.z, rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), rand(1.2, 2.0), rand(0.5, 0.8), 0.6, 0.6);
    if (this.falling.length < 10) this.falling.push({ mesh: m, t: 0 });
    /* the cracks flare around the hole for a few seconds (the slot follows the part as it moves) */
    const bk = this.crackU.uBreak.value; let si = 0; for (let i = 1; i < 4; i++) if (bk[i].w < bk[si].w) si = i;
    const pp = this.P[b.part]; _q.copy(pp.quaternion).invert();
    this.breakSrc = this.breakSrc || [null, null, null, null];
    this.breakSrc[si] = { part: pp, off: new V3().subVectors(_g, pp.position).applyQuaternion(_q) };
    bk[si].set(_g.x, _g.y, _g.z, 1);
    this.sfx('breakPart');
    this.wear = this.breakables.filter((x) => x.broken).length / this.breakables.length;
  }

  /* ================================================================ animation */
  resetPose() {
    this.bodyFrame();
    this.posePartsBody();
    this.idleHead(this.head.x, 0); this.head.v.set(0, 0, 0);
    this.look.set(_a.copy(this.head.x).addScaledVector(this.fwd, 5));
    const base = local(this.P.pelvis, 0, 0.18, -2.45, _b);
    axis(this.P.pelvis, 0, -0.1, -1, _c).normalize();
    this.tailJ[0].copy(base);
    for (let i = 1; i <= TAIL; i++) this.tailJ[i].copy(this.tailJ[i - 1]).addScaledVector(_c, TAIL_L[i - 1]);
    for (const l of this.legs) this.plantFoot(l, true);
  }

  bodyFrame() {
    _eu.set(-this.pitchS.x, this.yaw, this.rollS.x, 'YXZ'); this.bodyQ.setFromEuler(_eu);
    this.fwd.set(0, 0, 1).applyQuaternion(this.bodyQ);
  }

  posePartsBody() {
    const breath = Math.sin(this.clock * 1.3);
    const chest = this.P.chest; const pelvis = this.P.pelvis;
    chest.position.copy(this.J); chest.quaternion.copy(this.bodyQ);
    _q.setFromAxisAngle(_a.set(1, 0, 0), -0.03 * breath - 0.02); chest.quaternion.multiply(_q);
    pelvis.position.copy(this.J); pelvis.quaternion.copy(this.bodyQ);
    _q.setFromAxisAngle(_a.set(1, 0, 0), 0.04 + 0.02 * breath); pelvis.quaternion.multiply(_q);
    local(chest, 0, 0.45, 2.7, this.NB);
    axis(chest, 0, 0.62, 0.78, this.NBdir).normalize();
  }

  animate(dt) {
    const t = this.tgt;
    // body
    if (this.onGround()) {
      this.height.step(t.height, 60, dt); this.J.y = this.height.x;
    } else this.height.x = this.J.y;
    this.pitchS.step(t.pitch, 30, dt); this.rollS.step(t.roll, 20, dt);
    this.bodyFrame(); this.posePartsBody();
    // glow levels
    this.throat = damp(this.throat, t.throat, 4, dt); this.eyes = damp(this.eyes, t.eyes, 8, dt);
    // head and neck
    this.flinch.step(_a.set(0, 0, 0), 60, dt);
    _b.copy(t.head).add(this.flinch.x);
    if (this.onGround()) _b.y = Math.max(_b.y, 0.6);
    /* never into the player's face: the head joint keeps 2.2 m and the snout 1.5 m from the player at eye height */
    if (this.player && this.onGround() && this.state !== 'dead') {
      const pl = this.player.pos; const eyeY = pl.y + (this.player.eye ?? 2.08);
      if (Math.abs(_b.y - eyeY) < 2.0) {
        _c.set(_b.x - pl.x, 0, _b.z - pl.z); let d = _c.length();
        if (d < 1e-3) { _c.copy(this.fwd).setY(0).negate(); d = Math.max(1e-3, _c.length()); }
        if (d < 2.2) { _b.x = pl.x + (_c.x / d) * 2.2; _b.z = pl.z + (_c.z / d) * 2.2; }
        _d.set(t.look.x - _b.x, 0, t.look.z - _b.z); const ld = _d.length();
        if (ld > 1e-3) {
          _d.divideScalar(ld); const sx = _b.x + _d.x * 1.6 - pl.x, sz = _b.z + _d.z * 1.6 - pl.z; const ds = Math.hypot(sx, sz);
          if (ds < 1.5) { _b.x -= _d.x * (1.5 - ds); _b.z -= _d.z * (1.5 - ds); }
        }
      }
    }
    this.head.step(_b, t.headK, dt); this.look.step(t.look, t.lookK, dt);
    /* hard clearance after the spring (it overshoots on a bite): the skull joint stays 2.3 m and the snout tip 1.6 m from the eye.
       When the head is within 2 m of the eye height the push is sideways only: a radial push lifted a low head straight above the hero's view cone */
    if (this.player && this.state !== 'dead') {
      const pl = this.player.pos; _e.set(pl.x, pl.y + (this.player.eye ?? 2.08), pl.z);
      _c.subVectors(this.head.x, _e); const lowH = Math.abs(_c.y) < 2.0; if (lowH) _c.y = 0; let d = _c.length();
      if (d < 2.3) { if (d < 1e-3) { _c.copy(this.fwd).negate(); if (lowH) _c.y = 0; d = Math.max(1e-3, _c.length()); } this.head.x.addScaledVector(_c, (2.3 - d) / d); this.head.v.multiplyScalar(0.5); }
      _d.subVectors(this.look.x, this.head.x); const ld = _d.length();
      if (ld > 1e-3) {
        _f.copy(this.head.x).addScaledVector(_d, 1.9 / ld); _c.subVectors(_f, _e); const lowS = Math.abs(_c.y) < 2.0; if (lowS) _c.y = 0; d = _c.length();
        if (d < 1.6) { _c.multiplyScalar(1 / Math.max(d, 1e-3)); this.head.x.addScaledVector(_c, 1.6 - d); this.head.v.multiplyScalar(0.5); }
      }
    }
    this.jaw.step(t.jaw, t.jawK, dt);
    this.solveNeck();
    this.solveTail(dt);
    this.solveLegs(dt);
    this.solveWings(dt);
    t.headK = 28; t.lookK = 30; t.jawK = 60; // reset per-frame stiffness overrides
  }

  solveNeck() {
    const NB = this.NB; const H = _a.copy(this.head.x);
    // keep the head within the neck's reach
    _b.subVectors(H, NB); let L = _b.length();
    const maxL = NECK_TOTAL * 0.97, minL = NECK_TOTAL * 0.5;
    if (L > maxL) { H.copy(NB).addScaledVector(_b, maxL / L); L = maxL; } else if (L < minL) { H.copy(NB).addScaledVector(_b, minL / Math.max(L, 1e-3)); L = minL; }
    this.head.x.lerp(H, 0.5);
    // head forward: toward the look target
    const hf = _c.subVectors(this.look.x, H); if (hf.lengthSq() < 1e-4) hf.copy(this.fwd); hf.normalize();
    // Bezier from the neck root to the head joint
    /* a steeper root than the chest axis: the neck rises out of the shoulders, arches and hooks down to the head (a gooseneck, not a ramp) */
    _d.copy(this.NBdir).lerp(UP, this.neckLift ?? 0.4);
    /* dead: the root turns toward the head and downward, so the neck lies along the ground instead of arching over it */
    if (this.slump > 0) { _h.set(H.x - NB.x, 0, H.z - NB.z).normalize(); _h.y = -0.45; _d.lerp(_h.normalize(), this.slump); }
    const p0 = NB, p1 = _d.normalize().multiplyScalar(L * 0.5).add(NB), p3 = H, p2 = _e.copy(H).addScaledVector(hf, -L * 0.38);
    const C = this.curve; const n = C.length - 1; let acc = 0;
    for (let i = 0; i <= n; i++) {
      const u = i / n, m = 1 - u;
      C[i].copy(p0).multiplyScalar(m * m * m).addScaledVector(p1, 3 * m * m * u).addScaledVector(p2, 3 * m * u * u).addScaledVector(p3, u * u * u);
      if (this.slump > 0) C[i].y = Math.max(C[i].y, lerp(0.6, 0.3, u) * this.slump); /* the neck rests on the ground */
      if (i) acc += C[i].distanceTo(C[i - 1]); this.curveL[i] = acc;
    }
    let seg = 0;
    for (let k = 0; k <= NECK; k++) {
      const s = acc * k / NECK;
      while (seg < n - 1 && this.curveL[seg + 1] < s) seg++;
      const f = clamp((s - this.curveL[seg]) / Math.max(1e-5, this.curveL[seg + 1] - this.curveL[seg]), 0, 1);
      this.neckJ[k].lerpVectors(C[seg], C[seg + 1], f);
    }
    // frames with the up vector carried from the chest
    const up = axis(this.P.chest, 0, 1, 0, _f);
    for (let k = 0; k < NECK; k++) {
      _g.subVectors(this.neckJ[k + 1], this.neckJ[k]); const chord = _g.length(); _g.normalize();
      up.addScaledVector(_g, -up.dot(_g)).normalize();
      const nk = this.P[`neck${k}`]; setFrame(nk, this.neckJ[k], _g, up);
      /* taper toward the head (0.6 -> 0.29 m), a little narrower than tall, and each segment 20% longer than its slot so it overlaps the next
         (a compressed neck no longer interpenetrates 2x, a stretched one keeps its overlap) */
      const m = lerp(1, 0.8, k / (NECK - 1)); nk.scale.set(m * 0.95, m * 1.03, clamp(chord / NECK_L * 1.2, 0.6, 1.5));
    }
    up.lerp(UP, 0.5).addScaledVector(hf, -up.dot(hf)).normalize();
    const head = this.P.head; setFrame(head, this.neckJ[NECK], hf, up);
    const jaw = this.P.jaw; local(head, 0, -0.14, 0.06, jaw.position); jaw.quaternion.copy(head.quaternion);
    _q.setFromAxisAngle(_h.set(1, 0, 0), clamp(this.jaw.x, -0.05, 0.95)); jaw.quaternion.multiply(_q);
    local(head, 0, -0.18, 1.9, this.mouth);
    local(head, 0, 0.05, 0.8, this._focus);
  }

  solveTail(dt) {
    const t = this.tgt; const pelvis = this.P.pelvis;
    const J = this.tailJ; local(pelvis, 0, 0.18, -2.45, J[0]);
    const prev = axis(pelvis, 0, -0.12, -1, _a).normalize();
    const side = axis(pelvis, 1, 0, 0, _b);
    const grounded = this.onGround();
    const flying = !grounded;
    for (let i = 1; i <= TAIL; i++) {
      // desired direction: the previous one, bent by sway and curl, drooping on the ground
      const sway = t.tailSway * Math.sin(this.clock * 1.4 - i * 0.55) * (0.3 + i / TAIL);
      _c.copy(prev).applyAxisAngle(UP, sway + t.tailCurl * (0.4 + i / TAIL));
      if (grounded) _c.y -= t.tailDroop ?? 0.16; else _c.y += (this.tgt.pitch) * 0.05;
      _c.normalize();
      _d.subVectors(J[i], J[i - 1]).normalize();
      const stiff = (flying ? 7 : 5.5) * (1.4 - i / TAIL) * (t.tailStiff ?? 1);
      _d.lerp(_c, 1 - Math.exp(-stiff * dt)).normalize();
      J[i].copy(J[i - 1]).addScaledVector(_d, TAIL_L[i - 1]);
      if (grounded && J[i].y < TAIL_R[i] * 0.85) J[i].y = TAIL_R[i] * 0.85;
      prev.copy(_d);
    }
    const up = axis(pelvis, 0, 1, 0, _e);
    for (let i = 0; i < TAIL; i++) {
      _f.subVectors(J[i + 1], J[i]).normalize();
      up.addScaledVector(_f, -up.dot(_f)).normalize();
      setFrame(this.P[`tail${i}`], J[i], _f, up);
    }
    void side;
  }

  footHome(l, out, lead = 0) {
    const d = l.def; const yaw = this.yaw + (this.turnRate || 0) * lead;
    const x = d.home[0] * l.side, z = d.home[1];
    out.set(this.J.x + Math.cos(yaw) * x + Math.sin(yaw) * z, 0, this.J.z - Math.sin(yaw) * x + Math.cos(yaw) * z);
    if (lead) { out.x += Math.sin(this.yaw) * (this.speed || 0) * lead; out.z += Math.cos(this.yaw) * (this.speed || 0) * lead; }
    return out;
  }
  plantFoot(l, snap) { this.footHome(l, l.foot); l.from.copy(l.foot); l.to.copy(l.foot); l.t = 1; l.stepping = false; void snap; }

  solveLegs(dt) {
    const grounded = this.onGround();
    const spinning = this.act?.kind === 'sweep' && this.act.phase === 'spin';
    const dur = spinning ? 0.2 : 0.42;
    const anyStepping = (pair) => this.legs.some((l, i) => l.stepping && (i === 0 || i === 3 ? 0 : 1) === pair);
    for (let i = 0; i < 4; i++) {
      const l = this.legs[i]; const pair = i === 0 || i === 3 ? 0 : 1;
      if (grounded && this.state !== 'dead') {
        if (l.stepping) {
          l.t = Math.min(1, l.t + dt / dur);
          const k = smooth(l.t);
          l.foot.lerpVectors(l.from, l.to, k); l.foot.y = Math.sin(Math.PI * k) * (spinning ? 0.3 : 0.5);
          if (l.t >= 1) { l.stepping = false; l.foot.y = 0; if (!spinning) { this.fx.shake(0.06); this.sfx('step'); } }
        } else if (!anyStepping(1 - pair) && !(this.state === 'dying' && this.dying.t > 1.3)) {
          this.footHome(l, _a);
          const err = Math.hypot(_a.x - l.foot.x, _a.z - l.foot.z);
          if (err > (spinning ? 0.45 : 0.75)) {
            for (let j = 0; j < 4; j++) {
              const o = this.legs[j]; if ((j === 0 || j === 3 ? 0 : 1) !== pair || o.stepping) continue;
              o.stepping = true; o.t = 0; o.from.copy(o.foot); this.footHome(o, o.to, 0.3);
            }
          }
        }
      }
      const body = this.P[l.def.part];
      /* dead: the feet slide outward and the legs lie out to the sides, nearly straight (folded legs poke out of the body as sticks) */
      if (this.slump > 0 && (this.state === 'dying' || this.state === 'dead')) {
        local(body, l.side * (l.def.hip[0] + 1.85), 0, l.def.hip[2] + (l.kind === 'F' ? 0.5 : -0.6), _b); _b.y = 0;
        l.foot.lerp(_b, 1 - Math.exp(-5 * this.slump * dt)); l.foot.y = 0;
      }
      // hip, ankle target, IK
      local(body, l.def.hip[0] * l.side, l.def.hip[1], l.def.hip[2], l.hip);
      if (grounded) l.ankle.set(l.foot.x, l.foot.y + l.def.ankle, l.foot.z);
      else { // tucked under the body in flight; reaching for the ground just before a landing
        const tuck = l.kind === 'F' ? [0.75, -1.2, 1.0] : [0.85, -0.9, -2.5];
        local(body, tuck[0] * l.side, tuck[1], tuck[2], _b);
        const Lg = this.landing; const reach = this.state === 'land' && Lg ? smooth((Lg.t / Lg.T - 0.72) / 0.22) : 0;
        if (reach > 0) { this.footHome(l, _h); _h.y = l.def.ankle + Math.max(0, this.J.y - 2.6) * 0.5; _b.lerp(_h, reach); }
        l.ankle.lerp(_b, 1 - Math.exp(-(6 + reach * 10) * dt));
        l.foot.copy(l.ankle);
      }
      const L1 = l.def.L1, L2 = l.def.L2;
      _c.subVectors(l.ankle, l.hip); let d = _c.length(); _c.divideScalar(d || 1);
      d = clamp(d, 0.3, L1 + L2 - 0.02);
      const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1); const sinA = Math.sqrt(1 - cosA * cosA);
      // pole: front elbows point back, hind knees point forward; both a little outward
      axis(body, 0.35 * l.side, 0, l.kind === 'F' ? -1 : 1, _d);
      _d.addScaledVector(_c, -_d.dot(_c)).normalize();
      l.knee.copy(l.hip).addScaledVector(_c, cosA * L1).addScaledVector(_d, sinA * L1);
      _e.copy(l.hip).addScaledVector(_c, d);
      const out = axis(body, l.side, 0, 0, _f);
      const s = l.side > 0 ? 'L' : 'R';
      _g.subVectors(l.knee, l.hip).normalize(); setFrame(this.P[`${l.def.up}_${s}`], l.hip, _g, out);
      _g.subVectors(_e, l.knee).normalize(); setFrame(this.P[`${l.def.lo}_${s}`], l.knee, _g, out);
      const foot = this.P[`${l.def.foot}_${s}`];
      if (grounded) { _g.set(Math.sin(this.yaw + l.side * 0.15), 0, Math.cos(this.yaw + l.side * 0.15)); setFrame(foot, _e, _g, UP); }
      else { axis(body, 0, -0.75, -0.65, _g).normalize(); axis(body, 0, 0.65, -0.75, _h).normalize(); setFrame(foot, _e, _g, _h); }
    }
  }

  solveWings(dt) {
    const t = this.tgt; const W = this.wing; const chest = this.P.chest;
    W.open.step(t.wOpen, 20, dt); W.amp.step(t.flapAmp, 6, dt); W.bias.step(t.flapBias, 10, dt); W.sweep.step(t.sweep, 12, dt);
    W.phase += dt * Math.PI * 2 * t.flapFreq;
    const sn = Math.sin(W.phase);
    /* a sine flap that travels from the root to the tip: each bone lags the one before it,
       with a faster downstroke (second harmonic); the tip swings further */
    const wave = (d) => { const ph = W.phase - d; return (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * 0.62; };
    const flapHum = W.bias.x + W.amp.x * wave(0);
    const flapFore = W.bias.x + W.amp.x * wave(0.55) * 1.12;
    const flapTip = W.bias.x + W.amp.x * wave(1.1) * 1.25;
    /* folded on the ground: a slow breath in the wing, never a frozen board */
    const rest = (1 - clamp(W.open.x * 2, 0, 1));
    const idle = rest * 0.05 * Math.sin(this.clock * 1.3 + 0.4);
    if (W.amp.x > 0.4 && W.lastSin > 0 && sn <= 0) this.sfx('wingBeat');
    W.lastSin = sn;
    const open = clamp(W.open.x - Math.max(0, Math.cos(W.phase)) * 0.18 * W.amp.x, 0, 1.1);
    const S = _a, E = _b, Wr = _c;
    const tips = this._tips || (this._tips = [new V3(), new V3(), new V3(), new V3()]);
    const hip = this._hip || (this._hip = new V3());
    const sag = this._sag || (this._sag = new V3());
    const dk = this.deadFold || 0;
    for (let w = 0; w < 2; w++) {
      const s = w === 0 ? 1 : -1; const tag = w === 0 ? 'L' : 'R';
      local(chest, 0.62 * s, 0.72, 1.55, S);
      const dir = (A, B, seg, out) => {
        out.set(lerp(A[0], B[0], open) * s, lerp(A[1], B[1], open), lerp(A[2], B[2], open)).normalize();
        /* dead: the upper arm lies back along the flank instead of standing up like a tent pole */
        if (dk > 0 && seg === 0) { const q = dk * 0.9; out.set(lerp(out.x, 0.55 * s, q), lerp(out.y, -0.05, q), lerp(out.z, -0.83, q)).normalize(); }
        out.applyAxisAngle(_y.set(0, 1, 0), -s * W.sweep.x * (seg ? 1.2 : 0.8));
        const fl = seg === 0 ? flapHum : seg === 1 ? flapFore : flapTip;
        out.applyAxisAngle(_y.set(0, 0, 1), s * (fl * open + idle * (seg + 1)));
        return out.applyQuaternion(chest.quaternion);
      };
      const hd = dir(WF.hum, WS.hum, 0, _d);
      E.copy(S).addScaledVector(hd, WING_L.hum);
      const fd = dir(WF.fore, WS.fore, 1, _e);
      Wr.copy(E).addScaledVector(fd, WING_L.fore);
      // wing plane normal for the bones' up
      const f2 = dir(WF.f[2], WS.f[2], 2, _f);
      _g.crossVectors(fd, f2).multiplyScalar(s); axis(chest, 0, 1, 0, _h); _g.addScaledVector(_h, 0.3).normalize();
      setFrame(this.P[`wing_hum_${tag}`], S, hd, _g);
      setFrame(this.P[`wing_fore_${tag}`], E, fd, _g);
      for (let k = 0; k < 4; k++) {
        const fk = dir(WF.f[k], WS.f[k], 2, _f);
        tips[k].copy(Wr).addScaledVector(fk, WING_L.f[k]);
        setFrame(this.P[`wing_f${k}_${tag}`], Wr, fk, _g);
      }
      // the membrane, with a little billow against the motion and a sag on the ground
      local(this.P.pelvis, 0.72 * s, 0.35, -1.7, hip);
      /* the skin billows against the stroke (lagging the bones) and hangs between them */
      sag.copy(_g).multiplyScalar(-0.42 * (0.35 + Math.cos(W.phase - 0.8) * 0.75 * W.amp.x));
      const M = this.membranes[w];
      M.fold = Math.max(rest, dk * 1.15); M.pleat.copy(_g).multiplyScalar(s);
      if (open < 0.5) sag.lerp(_h.set(0, -0.3, 0), rest);
      if (dk > 0) sag.lerp(_h.set(0, -1.1, 0), dk * 0.85);
      M.fan(0, Wr, tips[0], tips[1], sag, 0.22); M.fan(1, Wr, tips[1], tips[2], sag, 0.2); M.fan(2, Wr, tips[2], tips[3], sag, 0.18);
      M.body(3, S, E, Wr, tips[3], hip, sag);
      M.finish();
    }
  }

  /* ================================================================ effects */
  effects(dt) {
    const mats = this.mats; const t = this.tgt;
    this.hitPulse = Math.max(0, this.hitPulse - dt * 4);
    const weak = 1 - this.hp / this._max;
    const fade = this.glowFade;
    /* lava cracks: brighter as it loses health, flare on a hit, flare around a plate that just broke */
    const C = this.crackU; C.uTime.value = this.clock;
    const surge = 1 + 1.5 * this.surge; /* the death surge: white-hot before the dark */
    const crack = (0.45 + weak * 0.75 + this.hitPulse * 0.35) * fade * surge;
    mats.core.userData.crack.uCrack.value = crack;
    mats.neckCore.userData.crack.uCrack.value = crack + this.throat * 0.6 * fade;
    mats.neckCore.userData.crack.uThroat.value = this.throat * fade;
    mats.wingCore.userData.crack.uCrack.value = crack * 0.4;
    mats.steel.userData.crack.uCrack.value = (0.35 + weak * 0.55 + this.hitPulse * 0.2) * fade * surge;
    if (this.surge > 0.01) mats.steel.userData.crack.uGate.value = Math.max(mats.steel.userData.crack.uGate.value, 0.28 * Math.min(1, this.surge));
    mats.steel.userData.crack.uGate.value = 0.06 + weak * 0.3 + this.wear * 0.1;
    for (let i = 0; i < 4; i++) {
      const b = C.uBreak.value[i]; if (b.w <= 0) continue; b.w = Math.max(0, b.w - dt / 3.5);
      const src = this.breakSrc?.[i]; if (src) { local(src.part, src.off.x, src.off.y, src.off.z, _b); b.x = _b.x; b.y = _b.y; b.z = _b.z; }
    }
    mats.core.emissiveIntensity = 0.004 * fade; mats.neckCore.emissiveIntensity = this.throat * 0.05 * fade;
    mats.mouth.emissiveIntensity = (0.5 + this.throat * 5.0 + weak * 0.3) * fade;
    mats.gum.emissiveIntensity = (0.03 + this.throat * 0.35) * fade;
    mats.seam.emissiveIntensity = (0.3 + weak * 0.4 + this.hitPulse * 0.6) * fade * surge * (0.85 + 0.15 * Math.sin(this.clock * 3.14));
    mats.eye.emissiveIntensity = clamp(1.8 * this.eyes, 0, 3.6) * Math.max(fade, 0.0);
    mats.membrane.emissiveIntensity = (0.12 + weak * 0.5) * fade;
    mats.membrane.alphaTest = 0.22 + weak * 0.3;
    /* in the air the wings carry the silhouette: lit skin and a hot rim (0.4) */
    this.airK = damp(this.airK, this.onGround() ? 0 : 1, this.onGround() ? 6 : 2.5, dt);
    this.membraneU.uBack.value = (0.9 + weak * 0.6 + this.airK * 0.4) * Math.max(0.2, fade);
    C.uAir.value = smooth(this.airK * 1.4);
    this.membraneU.uRim.value = 0.4 * this.airK * fade;
    // throat light
    local(this.P.head, 0, -0.2, 1.5, this.throatLight.position);
    this.throatLight.intensity = Math.max(0, this.throat * 12 + Math.max(0, this.eyes - 1) * 2) * fade; // never negative: a negative light paints teal
    // fire
    const F = this.flames;
    const dirF = axis(this.P.head, 0, -0.18, 1, _a).normalize();
    if (this.breathing && dirF.y < -0.12) {
      const m = this.mouth; const dir = dirF;
      /* the cone: ~800 billboards a second (about 450-560 alive), widening with age */
      this.emitAcc = (this.emitAcc || 0) + dt * 820; const n = Math.min(24, Math.floor(this.emitAcc)); this.emitAcc -= n;
      for (let i = 0; i < n; i++) {
        const sp = rand(16, 25); const spread = 0.17;
        F.emit(m.x + rand(-0.1, 0.1), m.y + rand(-0.1, 0.1), m.z + rand(-0.1, 0.1),
          (dir.x + rand(-spread, spread)) * sp, (dir.y + rand(-spread, spread)) * sp, (dir.z + rand(-spread, spread)) * sp,
          rand(0.5, 0.8), rand(0.22, 0.4), rand(0.5, 0.8));
      }
      F.emit(m.x, m.y, m.z, dir.x * 28, dir.y * 28, dir.z * 28, 0.1, 0.16, 1.0); // white-hot core at the jaw
      /* where the jet meets the ground: smoke and a scorch mark (the line it leaves) */
      const reach = Math.min(10, m.y / Math.max(0.2, -dir.y)); _b.copy(m).addScaledVector(dir, reach);
      if (Math.random() < dt * 16) this.smoke.emit(_b.x + rand(-1, 1), 0.7, _b.z + rand(-1, 1), rand(-0.5, 0.5), rand(1.4, 2.6), rand(-0.5, 0.5), rand(1.6, 2.6), rand(1.0, 1.6), 0.6, 0.7);
      this.scorchT = (this.scorchT || 0) - dt;
      if (this.scorchT <= 0) {
        this.scorchT = 0.05;
        for (let k = 0; k < 2; k++) { const u = k ? 0.75 : 1.0; this.scorch.add(m.x + (_b.x - m.x) * u + rand(-0.4, 0.4), m.z + (_b.z - m.z) * u + rand(-0.4, 0.4), rand(1.6, 2.6), this.clock); }
      }
      /* one light rides the cone */
      _b.copy(m).addScaledVector(dir, 3.5); if (_b.y < 1.4) _b.y = 1.4;
      this.fireLight.position.lerp(_b, 0.5);
      this.fireLight.intensity = damp(this.fireLight.intensity, 26 + Math.random() * 9, 14, dt);
    } else {
      this.fireLight.intensity = damp(this.fireLight.intensity, 0, 6, dt);
    }
    // the burning line of a strafe run
    const S = T.strafe; let burning = 0; let near = false; const pl = this.player.pos;
    for (const b of this.burn) {
      const age = this.clock - b.t; if (age > S.burn) continue; burning++;
      if (Math.random() < dt * 22 * (1 - age / S.burn)) F.emit(b.p.x + rand(-1.2, 1.2), 0.2, b.p.z + rand(-1.2, 1.2), rand(-0.6, 0.6), rand(2, 4), rand(-0.6, 0.6), rand(0.4, 0.7), rand(0.3, 0.5), 0.8);
      if (!b.scorched) { b.scorched = true; this.scorch.add(b.p.x, b.p.z, rand(2.4, 3.4), b.t); }
      if (Math.hypot(pl.x - b.p.x, pl.z - b.p.z) < S.width) near = true;
    }
    if (burning && !this.breathing) { this.fireLight.intensity = Math.max(this.fireLight.intensity, 22); }
    if (near && this.state !== 'hidden') {
      this.burnTick = (this.burnTick || 0) - dt;
      if (this.burnTick <= 0) { this.burnTick = S.tick; _c.set(0, 0, 1); this.player.hit({ dmg: S.dmg, dir: _c.clone(), kind: 'fire', unblockable: true, guardBreak: 0, push: 0.5 }); }
    }
    /* plates that fell off: they smoke and spit sparks for a while */
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i]; f.t += dt;
      if (f.t > 2.6 || !f.mesh.parent) { this.falling.splice(i, 1); continue; }
      f.mesh.getWorldPosition(_b);
      if (Math.random() < dt * 18 * (1 - f.t / 2.6)) this.smoke.emit(_b.x, _b.y + 0.1, _b.z, rand(-0.3, 0.3), rand(0.8, 1.6), rand(-0.3, 0.3), rand(1.0, 1.8), rand(0.35, 0.6), 0.5, 0.8);
      if (f.t < 1.0 && Math.random() < dt * 40) this.flames.emit(_b.x, _b.y, _b.z, rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.3, 0.6), 0.035, 1.0);
    }
    F.update(dt); this.smoke.update(dt); this.dust.update(dt);
    this.scorch.mat.uniforms.uTime.value = this.clock;
    // shockwave ring
    if (this.ringT < 1.2) {
      this.ringT += dt; const k = clamp(this.ringT / 0.75, 0, 1); const r = this.ringR * (1 - Math.pow(1 - k, 2.2));
      this.ring.scale.setScalar(Math.max(0.01, r)); this.ring.material.uniforms.uA.value = (1 - k) * 0.9;
      if (!this.ringHit) {
        const d = Math.hypot(pl.x - this.ringAt.x, pl.z - this.ringAt.z);
        if (d <= r && d > r - 2.5) {
          this.ringHit = true; _c.set(pl.x - this.ringAt.x, 0, pl.z - this.ringAt.z).normalize();
          this.player.hit({ dmg: T.slam.dmg, dir: _c.clone(), kind: 'slam', unblockable: true, guardBreak: 3, push: T.slam.push });
        } else if (d < r - 2.5) this.ringHit = true;
      }
      if (k >= 1) this.ring.visible = false;
    }
    // strafe telegraph
    if (this.line.visible) {
      const u = this.line.material.uniforms; u.uTime.value = this.clock;
      const air = this.air; const done = !air || (air.phase !== 'strafe' && air.phase !== 'swoop');
      this.lineA = done ? Math.max(0, (this.lineA || 0) - dt * 2) : this.lineA;
      u.uA.value = this.lineA || 0; if (done && this.lineA <= 0) this.line.visible = false;
    }
    this.headOpenFlag = this.headOpen; this.headOpen = false;
  }

  updateHit() {
    const out = this.hitOut; out.length = 0;
    const open = !!this.headOpenFlag;
    for (const h of this.hit) {
      const p = this.P[h.src]; if (!p) continue;
      local(p, h.off.x, h.off.y, h.off.z, h.pos); h.open = h.part === 'head' && open;
      /* a neck that lies low (a stunned dragon: head on the ground, neck sloping down beside the hero) is at the camera's height: its spheres grow
         by up to 0.95 m so the hero stands 2.8-3.1 m from the axis and the neck never fills the frame from 1.5 m */
      if (h.part === 'neck') h.radius = h.baseR + 0.95 * clamp((3.3 - h.pos.y) / 1.8, 0, 1);
      out.push(h);
    }
  }
}

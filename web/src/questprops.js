/* Chapter II props: the Vigil fire, the Chains anchors, the Dark beacons, and the companion lights.
   One module, no imports from other game modules. Everything is built once per handle; particles are pooled;
   no per-frame allocation. Each handle owns its geometry, materials and canvas textures and frees them in dispose().
   The ground textures (Poly Haven, CC0, /assets/ground) are cached for the module and shared.

   Position: every handle has .group at y = 0. Move it with handle.group.position.set(x, 0, z) at any time.
   The anchor chain re-aims itself when its group moves.

   makeBonfire(scene, { accent })            -> { group, radius, update(dt, { hp, threatened, away }), die(), flare(), dispose() }
   makeAnchor(scene, { accent, to, index })  -> { group, height, hp, update(dt), hit(k, point, dir), break(dir), dispose() }
   makeBeacon(scene, { accent, index })      -> { group, update(dt, { charge, lit }), light(), dispose() }
   makeCompanions(scene, names, { kinds, accent }) -> { list: [{ name, kind, object3D, position, setState(s), state }], update(dt, clock, camera?), dispose() }
     companion object3D origin = the feet (y = 0 on the ground for 'with' and 'hearth'). The fight copies its target into .position. */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildDog, poseDog } from './props/dog.js'; /* the one dog (pure geometry, no game state) */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3(); const _d = new THREE.Vector3(); const _e = new THREE.Vector3();
const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion(); const _m = new THREE.Matrix4(); const _s = new THREE.Vector3(1, 1, 1);
const _col = new THREE.Color(); const _col2 = new THREE.Color(); const _eul = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';

function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------------------------------------------------------------- shared textures */
const TEX = {};
function canvasTex(key, w, h, draw, { srgb = true } = {}) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX[key] = t; return t;
}
/* a soft dot that reaches zero well inside the quad: no edge ever shows */
const softTex = () => canvasTex('soft', 64, 64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.42, 'rgba(255,255,255,0.32)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.96, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
/* a hot spark: tight core */
const sparkTex = () => canvasTex('spark', 32, 32, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.95, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const puffTex = () => canvasTex('puff', 128, 128, (g, s) => {
  const r = seeded(3); g.clearRect(0, 0, s, s);
  for (let i = 0; i < 18; i++) { const x = s * (0.32 + r() * 0.36); const y = s * (0.32 + r() * 0.36); const rad = s * (0.1 + r() * 0.18); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
});
const TL = new THREE.TextureLoader();
const GT = {};
function groundTex(file, srgb, rep = 1) {
  const key = `${file}|${rep}`; if (GT[key]) return GT[key];
  const t = TL.load(`/assets/ground/${file}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  GT[key] = t; return t;
}
const TEXFILES = [['seaside_rock_diff.jpg', true], ['seaside_rock_nor.jpg', false], ['bark_brown_02_diff.jpg', true], ['bark_brown_02_nor.jpg', false], ['rock_diff.jpg', true], ['rock_nor_gl.jpg', false]];

/* ---------------------------------------------------------------- GLSL */
const NOISE = `
float qH3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float qN3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(qH3(i), qH3(i + vec3(1,0,0)), f.x), mix(qH3(i + vec3(0,1,0)), qH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(qH3(i + vec3(0,0,1)), qH3(i + vec3(1,0,1)), f.x), mix(qH3(i + vec3(0,1,1)), qH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float qH2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float qN2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(qH2(i), qH2(i + vec2(1,0)), f.x), mix(qH2(i + vec2(0,1)), qH2(i + vec2(1,1)), f.x), f.y); }
float qF2(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * qN2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }`;
const BILL = `vec3 camR(){ return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 camU(){ return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }`;

/* flames: shaped billboards (upright, turn about Y only), noise-driven tongues; additive */
const FLAME_VERT = `${BILL}
attribute vec3 aOff; attribute vec3 aSize; uniform float uTime; uniform float uFlare; uniform vec2 uWind; uniform float uH; uniform float uW; uniform float uGut;
varying vec2 vUv; varying float vSeed;
void main(){
  vUv = uv; vSeed = aSize.z;
  vec3 r = camR(); r = normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5));
  float h = position.y + 0.5;
  float fl = 0.88 + 0.12 * sin(uTime * (7.0 + vSeed * 5.0) + vSeed * 30.0) + 0.08 * sin(uTime * 17.0 + vSeed * 9.0);
  fl *= 1.0 - uGut * (0.35 + 0.35 * sin(uTime * 11.0 + vSeed * 13.0));
  float H = aSize.y * uH * fl * (1.0 + uFlare * 0.7);
  float W = aSize.x * uW * (1.0 + uFlare * 0.25);
  vec3 p = vec3(aOff.x * uW, aOff.y, aOff.z * uW) + r * position.x * W + vec3(0.0, h * H, 0.0);
  p.xz += uWind * h * h * H;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;
const FLAME_FRAG = `${NOISE}
uniform float uTime; uniform float uFlare; uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uEdge; uniform float uPower; uniform float uAlpha;
varying vec2 vUv; varying float vSeed;
void main(){
  float t = uTime * (1.4 + vSeed * 0.6);
  vec2 q = vec2(vUv.x - 0.5, vUv.y);
  float n = qF2(vec2(q.x * 3.4 + vSeed * 7.0, q.y * 2.3 - t * 2.1));
  float n2 = qF2(vec2(q.x * 7.5 - vSeed * 3.0, q.y * 5.0 - t * 3.4));
  float y = vUv.y;
  float w = 0.42 * pow(1.0 - y, 0.75) * (0.5 + 0.5 * smoothstep(0.0, 0.2, y));
  float dx = abs(q.x + (n - 0.5) * 0.46 * y + (n2 - 0.5) * 0.09);
  float shape = smoothstep(w, w * 0.12, dx);
  float body = shape * smoothstep(1.0, 0.18, y + (n - 0.5) * 0.7) * smoothstep(0.0, 0.08, y);
  float heat = clamp(body * (0.5 + n2 * 0.95), 0.0, 1.0);
  vec3 c = mix(uEdge, uMid, smoothstep(0.06, 0.42, heat));
  c = mix(c, uCore, smoothstep(0.5, 0.95, heat) * (1.0 - y * 0.6));
  float a = heat * uAlpha; if (a < 0.004) discard;
  gl_FragColor = vec4(c * uPower * (1.0 + uFlare * 0.5), a);
}`;
/* smoke: rising, rotating soft billows; normal blending; warm underlight near the fire */
const SMOKE_VERT = `${BILL}
attribute vec4 aSeed; uniform float uTime; uniform float uRise; uniform float uSize; uniform vec2 uWind; uniform float uBase; uniform float uSpeed; uniform float uSpread;
varying vec2 vUv; varying float vA; varying float vSeed; varying float vAge;
void main(){
  float age = fract(uTime * uSpeed * (0.8 + aSeed.y * 0.4) + aSeed.w); vAge = age;
  vec3 c = vec3((aSeed.x - 0.5) * uSpread, uBase + age * uRise, (aSeed.z - 0.5) * uSpread);
  c.x += sin(uTime * 0.5 + aSeed.y * 9.0) * 0.6 * age; c.z += cos(uTime * 0.37 + aSeed.x * 7.0) * 0.5 * age;
  c.xz += uWind * age * age * uRise * 0.5;
  float s = uSize * (0.35 + age * 2.1);
  float rot = aSeed.w * 6.28 + uTime * 0.25 * (aSeed.y - 0.5);
  vec2 pq = vec2(position.x * cos(rot) - position.y * sin(rot), position.x * sin(rot) + position.y * cos(rot));
  vec3 wc = (modelMatrix * vec4(c, 1.0)).xyz;
  vec3 p = wc + camR() * pq.x * s + camU() * pq.y * s;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vA = smoothstep(0.0, 0.14, age) * (1.0 - smoothstep(0.45, 1.0, age)) * smoothstep(0.4, 2.2, -mv.z);
  vUv = uv; vSeed = aSeed.w; gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FRAG = `${NOISE}
uniform vec3 uColor; uniform vec3 uWarm; uniform float uOpacity; uniform float uTime; uniform float uWarmK;
varying vec2 vUv; varying float vA; varying float vSeed; varying float vAge;
void main(){
  vec2 q = vUv - 0.5; float r = length(q);
  float n = qF2(vUv * 3.0 + vSeed * 13.0 + vec2(uTime * 0.03, -uTime * 0.06));
  float a = smoothstep(0.5, 0.06, r) * (0.3 + 0.95 * n);
  a *= vA * uOpacity; if (a < 0.003) discard;
  vec3 c = mix(uColor, uWarm, (1.0 - smoothstep(0.0, 0.3, vAge)) * uWarmK);
  gl_FragColor = vec4(c, a);
}`;
const PLAIN_VERT = 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
/* a disc of coals: cracks of heat that crawl */
const COALS_FRAG = `${NOISE}
uniform float uTime; uniform float uHeat; uniform vec3 uHot; varying vec2 vUv;
void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0; if (r > 1.0) discard;
  float n = qF2(vUv * 9.0 + vec2(uTime * 0.12, -uTime * 0.07)); float cr = smoothstep(0.42, 0.75, n);
  float glow = (1.0 - smoothstep(0.15, 1.0, r)) * (0.25 + 1.5 * cr) * (0.8 + 0.2 * sin(uTime * 3.0 + n * 9.0)) * uHeat;
  vec3 c = mix(vec3(0.015, 0.012, 0.01), uHot, clamp(glow, 0.0, 1.6));
  gl_FragColor = vec4(c, smoothstep(1.0, 0.7, r)); }`;
/* a flat soft pool of light on the ground (fake light: no real light is added) */
const POOL_FRAG = `uniform vec3 uColor; uniform float uK; varying vec2 vUv;
void main(){ float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.2) * uK; if (a < 0.002) discard; gl_FragColor = vec4(uColor * a, 1.0); }`;
/* soot under a fire: dark, ragged, normal blending */
const SOOT_FRAG = `${NOISE}
uniform float uK; varying vec2 vUv;
void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0; float n = qF2(vUv * 6.0);
  float a = (1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.35)) * (0.55 + 0.45 * n) * uK; if (a < 0.003) discard;
  gl_FragColor = vec4(vec3(0.02, 0.018, 0.016), a); }`;

/* fog-free soft points; the size is in metres */
class Pool {
  constructor(parent, max, { additive = true, map = softTex(), order = 6 } = {}) {
    this.max = max; this.n = 0; this.next = 0; this.turb = 0; this.t = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max); this.size = new Float32Array(max);
    this.age = new Float32Array(max); this.life = new Float32Array(max).fill(-1); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.floor = new Uint8Array(max); this.tb = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage); this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage); this.aS = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aCol); geo.setAttribute('aAlpha', this.aA); geo.setAttribute('aSize', this.aS);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uScale: { value: 600 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uScale; varying vec3 vC; varying float vA; void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlpha * smoothstep(0.25, 1.0, -mv.z); gl_PointSize = aAlpha > 0.0 ? min(aSize * uScale / max(0.2, -mv.z), 96.0) : 0.0; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * t.rgb, a); }',
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = order;
    const sz = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, sc, cam) => { renderer.getDrawingBufferSize(sz); this.mat.uniforms.uScale.value = sz.y * 0.5 * cam.projectionMatrix.elements[5]; };
    parent.add(this.points);
  }
  emit(px, py, pz, vx, vy, vz, color, life, s0, s1, a0 = 1, grav = 0, drag = 0, floor = true, turb = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max; const j = i * 3;
    this.p[j] = px; this.p[j + 1] = py; this.p[j + 2] = pz; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.col[j] = color.r; this.col[j + 1] = color.g; this.col[j + 2] = color.b;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.grav[i] = grav; this.drag[i] = drag; this.floor[i] = floor ? 1 : 0; this.tb[i] = turb;
    this.size[i] = s0; this.alpha[i] = 0; this.n = Math.max(this.n, i + 1);
  }
  update(dt) {
    this.t += dt; let live = false; const T = this.t;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] < 0) continue;
      this.age[i] += dt; const k = this.age[i] / this.life[i];
      if (k >= 1) { this.life[i] = -1; this.alpha[i] = 0; continue; }
      live = true; const j = i * 3; const dr = Math.max(0, 1 - this.drag[i] * dt);
      if (this.tb[i] > 0) { const tb = this.tb[i] * dt; this.v[j] += Math.sin(T * 3.1 + i * 1.7) * tb; this.v[j + 2] += Math.cos(T * 2.7 + i * 2.3) * tb; }
      this.v[j] *= dr; this.v[j + 1] = this.v[j + 1] * dr - this.grav[i] * dt; this.v[j + 2] *= dr;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.floor[i] && this.p[j + 1] < 0.03) { this.p[j + 1] = 0.03; this.v[j + 1] *= -0.25; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(k);
      this.alpha[i] = this.a0[i] * (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9);
    }
    this.points.visible = live;
    if (live) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aA.needsUpdate = true; this.aS.needsUpdate = true; }
  }
  dispose() { this.points.removeFromParent(); this.points.geometry.dispose(); this.mat.dispose(); }
}

/* rigid chips on parabolas: one instanced mesh */
class Shards {
  constructor(parent, max, geometry, material) {
    this.max = max; this.next = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, max); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.q = Array.from({ length: max }, () => new THREE.Quaternion());
    this.w = new Float32Array(max * 3); this.sc = new Float32Array(max); this.age = new Float32Array(max); this.life = new Float32Array(max).fill(-1); this.rest = new Uint8Array(max);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    parent.add(this.mesh); this.rand = seeded(77);
  }
  emit(px, py, pz, vx, vy, vz, scale, life, spin = 8) {
    const i = this.next; this.next = (this.next + 1) % this.max; const r = this.rand;
    this.p[i * 3] = px; this.p[i * 3 + 1] = py; this.p[i * 3 + 2] = pz; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.w[i * 3] = (r() - 0.5) * spin; this.w[i * 3 + 1] = (r() - 0.5) * spin; this.w[i * 3 + 2] = (r() - 0.5) * spin;
    this.q[i].setFromEuler(_eul.set(r() * 6, r() * 6, r() * 6)); this.sc[i] = scale; this.age[i] = 0; this.life[i] = life; this.rest[i] = 0;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] < 0) continue;
      this.age[i] += dt; const j = i * 3; any = true;
      if (this.age[i] >= this.life[i]) { this.life[i] = -1; this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      if (!this.rest[i]) {
        this.v[j + 1] -= 13 * dt; this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
        const ang = Math.hypot(this.w[j], this.w[j + 1], this.w[j + 2]);
        if (ang > 0) { _a.set(this.w[j] / ang, this.w[j + 1] / ang, this.w[j + 2] / ang); _q.setFromAxisAngle(_a, ang * dt); this.q[i].premultiply(_q); }
        const r = this.sc[i] * 0.4;
        if (this.p[j + 1] < r) { this.p[j + 1] = r; if (Math.abs(this.v[j + 1]) < 2) this.rest[i] = 1; this.v[j + 1] *= -0.3; this.v[j] *= 0.5; this.v[j + 2] *= 0.5; this.w[j] *= 0.5; this.w[j + 1] *= 0.5; this.w[j + 2] *= 0.5; }
      }
      const k = this.age[i] / this.life[i]; const s = this.sc[i] * (k > 0.85 ? (1 - k) / 0.15 : 1);
      _s.setScalar(s); _a.set(this.p[j], this.p[j + 1], this.p[j + 2]); this.mesh.setMatrixAt(i, _m.compose(_a, this.q[i], _s));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.dispose(); }
}

/* ---------------------------------------------------------------- geometry helpers */
/* camera-facing quads in one draw call; attrs = { name: itemSize } */
function quads(n, attrs) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  for (const [name, size] of Object.entries(attrs)) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(n * size), size));
  g.instanceCount = n;
  return g;
}
/* a lumpy rock with a flat-ish bottom */
function rockGeo(seed, detail = 2, flat = -0.35) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const r = seeded(seed); const p = g.attributes.position; const o = [r() * 6, r() * 6, r() * 6, r() * 6];
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i); let y = p.getY(i); let z = p.getZ(i);
    const n = 1 + 0.16 * Math.sin(x * 2.3 + o[0]) * Math.sin(y * 2.9 + o[1]) + 0.1 * Math.sin(z * 5.1 + o[2] + x * 3) + 0.06 * Math.sin(y * 9 + z * 7 + o[3]);
    x *= n; y *= n; z *= n; if (y < flat) y = flat + (y - flat) * 0.15;
    p.setXYZ(i, x, y, z); uv[i * 2] = x * 0.45 + z * 0.3 + 0.5; uv[i * 2 + 1] = y * 0.45 + z * 0.15 + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
/* an ellipsoid placed in a parent frame (for merged figures) */
function ellip(rx, ry, rz, x, y, z, rotX = 0, seg = 18) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(rx, ry, rz); if (rotX) g.rotateX(rotX); g.translate(x, y, z); return g;
}
function along(g, a, b) { /* a Y-up geometry of unit length aligned from a to b */
  const d = _a.subVectors(b, a); const len = d.length(); g.scale(1, len, 1); g.translate(0, 0, 0);
  _q.setFromUnitVectors(UP, d.normalize()); g.applyQuaternion(_q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g;
}
function rodGeo(r0, r1, a, b, seg = 6) { const g = new THREE.CylinderGeometry(r1, r0, 1, seg, 1); return along(g, a, b); }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/* a translated geometry; a merge of mixed (indexed / non-indexed) geometries, the parts disposed */
const xfq = (g, x, y, z) => { g.translate(x, y, z); return g; };
function mergeQ(list) { const flat = list.map((g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; }); const m = mergeGeometries(flat); flat.forEach((g) => g.dispose()); return m; }

/* a ground decal: flat plane with a custom fragment shader */
function flat(size, frag, uniforms, { additive = false, order = 2, y = 0.02 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: PLAIN_VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -2 - order });
  const m = new THREE.Mesh(geo, mat); m.position.y = y; m.renderOrder = order; return m;
}
function flameMesh(offs, uniforms) {
  const g = quads(offs.length, { aOff: 3, aSize: 3 });
  offs.forEach((o, i) => { g.attributes.aOff.setXYZ(i, o[0], o[1], o[2]); g.attributes.aSize.setXYZ(i, o[3], o[4], o[5]); });
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; return mesh;
}
function flameU(h, w, power = 1.4) {
  return { uTime: { value: 0 }, uFlare: { value: 0 }, uWind: { value: new THREE.Vector2() }, uH: { value: h }, uW: { value: w }, uGut: { value: 0 }, uPower: { value: power }, uAlpha: { value: 1 },
    uCore: { value: new THREE.Color(0xfff2cc) }, uMid: { value: new THREE.Color(0xffa23a) }, uEdge: { value: new THREE.Color(0xff4a0c) } };
}
function smokeMesh(n, seed, uniforms) {
  const g = quads(n, { aSeed: 4 }); const r = seeded(seed); for (let i = 0; i < n; i++) g.attributes.aSeed.setXYZW(i, r(), r(), r(), r());
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; return mesh;
}
/* heat that lives in the cracks of wood (object-space noise, hotter low down) */
function heatBark(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uHeat: U.heat, uTime: U.time, uChar: U.char });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vQp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvQp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vQp; uniform float uHeat; uniform float uTime; uniform float uChar;${NOISE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float v = abs(qN3(vQp * vec3(9.0, 13.0, 9.0)) - 0.5) + abs(qN3(vQp * 23.0 + 4.0) - 0.5) * 0.5;
          float n2 = qN3(vQp * 4.0 + vec3(0.0, uTime * 0.35, 0.0));
          float low = 1.0 - smoothstep(0.05, 0.8, vQp.y);
          float crack = (1.0 - smoothstep(0.0, 0.085, v)) * (0.25 + low);
          float bed = smoothstep(0.35, 0.0, vQp.y) * 0.35; float inr = 1.0 - smoothstep(1.05, 1.4, length(vQp.xz)); crack *= inr; bed *= inr;
          diffuseColor.rgb *= mix(1.0, 0.12, uChar * (0.45 + 0.55 * low));
          totalEmissiveRadiance = emissive * (crack + bed * smoothstep(0.4, 0.7, n2)) * uHeat * (0.6 + 0.8 * n2); }`);
  };
  mat.customProgramCacheKey = () => 'qp-bark';
}
function stoneMat(tint = 0x8a8680) {
  return new THREE.MeshStandardMaterial({ map: groundTex('seaside_rock_diff.jpg', true), normalMap: groundTex('seaside_rock_nor.jpg', false), color: tint, roughness: 1, metalness: 0, envMapIntensity: 0.15 });
}
function ironMat(color = 0x2b2826) { return new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.48, envMapIntensity: 0.6 }); }

/* everything a handle makes, freed at once */
function bag() {
  const items = new Set();
  return { own(x) { if (x) items.add(x); return x; }, free() { for (const x of items) x.dispose?.(); items.clear(); } };
}
function ownTree(B, root) { root.traverse((o) => { if (o.geometry) B.own(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => B.own(m)); }); }

export function preload() {
  softTex(); sparkTex(); puffTex();
  return Promise.all(TEXFILES.map(([f, srgb]) => new Promise((res) => {
    const t = groundTex(f, srgb); if (t.image) return res();
    const check = () => (t.image ? res() : setTimeout(check, 30)); check();
    setTimeout(res, 8000);
  })));
}

/* ================================================================ THE VIGIL: the bonfire */
/* style (makeBonfire, makeAnchor, makeBeacon, makeCompanions): 'dark' = the look below. Worlds pass their own style
   (companions holo | hitodama | ember | fairy; fires barrel | brazier | campfire | bonfire; beacons pylon | stake | signal | watch).
   Unknown styles build the dark look. fireStyle / beaconStyle / ANCHOR_LOOK / COMP_STYLE above hold the branches. */
/* ---- world styles. Fires: the body changes and the flames sit in it (lift); the hold ring, the light and every handle stay. */
function fireStyle(B, style, { lift, ringStones, logMesh, group }) {
  if (!style || style === 'dark' || style === 'bonfire') return;
  const body = new THREE.Group(); group.add(body);
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(B.own(geo), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; body.add(m); return m; };
  if (style === 'brazier') { /* edo: a hammered iron bowl on three splayed legs, a ring of shrine gravel under it */
    ringStones.visible = false; logMesh.visible = false;
    const iron = B.own(ironMat(0x24201d));
    const prof = [[0.0, 0.0], [0.22, 0.02], [0.42, 0.1], [0.6, 0.26], [0.66, 0.34], [0.62, 0.35], [0.56, 0.28], [0.4, 0.14], [0.0, 0.08]].map(([x, y]) => new THREE.Vector2(x, y));
    const bowl = add(new THREE.LatheGeometry(prof, 28), iron, 0, 0.62, 0); bowl.material.side = THREE.DoubleSide;
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.3; const g = new THREE.CylinderGeometry(0.035, 0.045, 0.82, 6); g.translate(0, 0.41, 0); const m = add(g, iron, Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36); m.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28); }
    add(new THREE.TorusGeometry(0.5, 0.025, 6, 24).rotateX(Math.PI / 2), iron, 0, 0.42, 0);
    lift.position.y = 0.66; lift.scale.setScalar(0.5);
  } else if (style === 'barrel') { /* neon: a burn barrel, oil drum with ribs, rust and a scorched rim */
    ringStones.visible = false; logMesh.visible = false;
    const rust = B.own(new THREE.MeshStandardMaterial({ color: 0x3a2a20, metalness: 0.65, roughness: 0.72, envMapIntensity: 0.5, side: THREE.DoubleSide }));
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.92, 24, 1, true), rust, 0, 0.46, 0);
    for (const y of [0.3, 0.62]) add(new THREE.TorusGeometry(0.345, 0.018, 6, 28).rotateX(Math.PI / 2), rust, 0, y, 0);
    add(new THREE.CircleGeometry(0.33, 20).rotateX(-Math.PI / 2), B.own(new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 1 })), 0, 0.74, 0);
    lift.position.y = 0.78; lift.scale.setScalar(0.42);
  } else if (style === 'campfire') { /* frontier: a small ring of stones, a short pile of logs, the coffee pot by it */
    ringStones.scale.setScalar(0.62); logMesh.scale.setScalar(0.55);
    const enamel = B.own(new THREE.MeshStandardMaterial({ color: 0x2c3a44, metalness: 0.3, roughness: 0.45, envMapIntensity: 0.6 }));
    const pot = add(new THREE.CylinderGeometry(0.075, 0.1, 0.2, 14), enamel, 0.95, 0.1, 0.42); add(new THREE.ConeGeometry(0.075, 0.07, 14), enamel, 0.95, 0.235, 0.42);
    add(new THREE.CylinderGeometry(0.012, 0.02, 0.12, 6).rotateZ(-0.9).translate(0.06, 0.03, 0), enamel, 0.95, 0.13, 0.42); pot.rotation.y = 0.6;
    lift.scale.setScalar(0.62);
  }
}
/* beacons: the cairn becomes a stone lantern (edo), a steel signal pole (neon) or a timber signal pole (frontier); the bowl, its fire and the beam stay */
function beaconStyle(B, style, { group, pillar, cairn, TOWER }) {
  if (!style || style === 'dark' || style === 'watch') return;
  const body = new THREE.Group(); group.add(body);
  const add = (geo, mat, y = 0) => { const m = new THREE.Mesh(B.own(geo), mat); m.position.y = y; m.castShadow = true; m.receiveShadow = true; body.add(m); return m; };
  pillar.visible = false; cairn.visible = false;
  if (style === 'lantern') { /* a tall stone toro: base, shaft, firebox, wide hipped roof, all granite */
    const gran = B.own(stoneMat(0x9a958c));
    add(new THREE.CylinderGeometry(0.62, 0.7, 0.3, 6), gran, 0.15); add(new THREE.CylinderGeometry(0.22, 0.26, 1.15, 8), gran, 0.88);
    add(new THREE.CylinderGeometry(0.46, 0.4, 0.16, 6), gran, 1.52); add(new THREE.BoxGeometry(0.56, 0.42, 0.56), gran, 1.81);
    add(new THREE.ConeGeometry(0.86, 0.36, 6), gran, 2.2); add(new THREE.SphereGeometry(0.1, 10, 8), gran, TOWER + 0.02);
  } else { /* a signal pole with a cross arm and a footing */
    const steel = style === 'signal';
    const mat = B.own(steel ? new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.85, roughness: 0.4, envMapIntensity: 0.8 }) : new THREE.MeshStandardMaterial({ map: groundTex('bark_brown_02_diff.jpg', true), color: 0x6a5a48, roughness: 0.9, envMapIntensity: 0.1 }));
    add(new THREE.BoxGeometry(0.7, 0.2, 0.7), B.own(stoneMat(0x6a665e)), 0.1);
    add(new THREE.CylinderGeometry(steel ? 0.08 : 0.11, steel ? 0.1 : 0.14, TOWER, steel ? 10 : 8), mat, TOWER / 2);
    const arm = add(new THREE.BoxGeometry(1.2, 0.08, 0.08), mat, TOWER - 0.45);
    if (steel) for (const x of [-0.5, 0.5]) { const l = add(new THREE.SphereGeometry(0.05, 8, 6), B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ef2ff).multiplyScalar(2.2) })), TOWER - 0.36); l.position.x = x; l.castShadow = false; }
    arm.rotation.y = 0.4;
  }
}
/* anchors keep their shape (the split shaft, the chain, the runes); the shaft and plinth take the world's material */
const ANCHOR_LOOK = {
  stake: { map: 'bark_brown_02_diff.jpg', nor: 'bark_brown_02_nor.jpg', color: 0x7a6450, metal: 0, rough: 0.9, plinth: 0x5a554e },
  pylon: { map: null, color: 0x4a5058, metal: 0.8, rough: 0.38, plinth: 0x3a3c40 },
  spike: { map: null, color: 0x5a3a28, metal: 0.7, rough: 0.6, plinth: 0x6a5040 },
};
/* companions: a palette and a shader mode per world (1 hitodama flame wisp, 2 holo scanlines, 3 ember dust and smoke, 4 fairy motes) */
const COMP_STYLE = {
  hitodama: { mode: 1, rim: 0x9ad0ff, body: 0x061a3a, core: 0x7ab8ff, mote: 0x7ab8ff, hot: 0xd8ecff, pool: 0x4a8aff },
  holo: { mode: 2, rim: 0x3ef2ff, body: 0x021e26, core: 0x8af8ff, mote: 0x3ef2ff, hot: 0xd0ffff, pool: 0x20c8e0 },
  ember: { mode: 3, rim: 0xffa860, body: 0x2a1c12, core: 0xff8a30, mote: 0xb8a490, hot: 0xffc080, pool: 0xff8a40 },
  fairy: { mode: 4, rim: 0xfff2c8, body: 0x4a3a18, core: 0xfff4d0, mote: 0xffe08a, hot: 0xffc8e8, pool: 0xffe0a0 },
};
export const STYLES = { fire: ['dark', 'brazier', 'barrel', 'campfire', 'bonfire'], beacon: ['dark', 'lantern', 'signal', 'pole', 'watch'], anchor: ['dark', 'stake', 'pylon', 'spike'], companion: ['dark', ...Object.keys(COMP_STYLE)] };

export function makeBonfire(scene, { accent = 0xff6a2a, radius = 6.5, style = 'dark' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group);
  const r = seeded(41);
  /* lift: everything that burns (coals, flames, halo, light, smoke, embers); a brazier or a barrel raises it into its bowl */
  const lift = new THREE.Group(); group.add(lift);
  const U = { heat: { value: 1 }, time: { value: 0 }, char: { value: 0.5 } };
  /* ---- soot and ash under the fire */
  const sootU = { uK: { value: 0.95 } }; const soot = flat(5.2, SOOT_FRAG, sootU, { order: 1, y: 0.012 }); group.add(soot);
  /* ---- ring of fire stones: two courses, the upper set back */
  const sMat = B.own(stoneMat(0x5e5a55)); const sGeo = B.own(rockGeo(11, 2));
  const NS0 = 16; const NS1 = 11;
  const ringStones = new THREE.InstancedMesh(sGeo, sMat, NS0 + NS1); ringStones.castShadow = true; ringStones.receiveShadow = true;
  for (let i = 0; i < NS0 + NS1; i++) { const up = i >= NS0; const k = up ? i - NS0 : i; const n = up ? NS1 : NS0; const a = (k / n) * TAU + r() * 0.15 + (up ? 0.13 : 0); const rr = up ? 1.12 + r() * 0.05 : 1.2 + r() * 0.06; _a.set(Math.cos(a) * rr, up ? 0.2 : 0.08, Math.sin(a) * rr); _q.setFromEuler(_eul.set(r() * 0.4, a + r(), r() * 0.3)); _s.set(0.2 + r() * 0.09, (up ? 0.1 : 0.13) + r() * 0.05, 0.16 + r() * 0.06); ringStones.setMatrixAt(i, _m.compose(_a, _q, _s)); }
  group.add(ringStones);
  /* ---- stacked split logs: a crib of three layers and a tall lean-to of eight: the pyre reads as built, from far away */
  const logs = [];
  const splitLog = (len, rad, seed) => {
    const g = new THREE.CylinderGeometry(rad, rad * 1.08, len, 9, 4); const p = g.attributes.position; const rr = seeded(seed);
    const o = rr() * 9;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i); const y = p.getY(i); let z = p.getZ(i); const w = 1 + 0.07 * Math.sin(y * 9 + o) + 0.05 * Math.sin(Math.atan2(z, x) * 3 + o); x *= w; z *= w; if (x > rad * 0.28) x = rad * 0.28 + (x - rad * 0.28) * 0.05; p.setXYZ(i, x, y, z); }
    const n = g.toNonIndexed(); g.dispose(); n.computeVertexNormals(); return n;
  };
  const put = (g, x, y, z, rx, ry, rz) => { g.applyMatrix4(_m.compose(_a.set(x, y, z), _q.setFromEuler(_eul.set(rx, ry, rz)), _s.set(1, 1, 1))); logs.push(g); };
  for (let layer = 0; layer < 3; layer++) for (let k = 0; k < 2; k++) {
    const g = splitLog(1.45, 0.1, 100 + layer * 2 + k); const off = (k ? 1 : -1) * 0.42; const y = 0.1 + layer * 0.18;
    if (layer % 2 === 0) put(g, off, y, 0, Math.PI / 2, 0.08 * (k ? 1 : -1), (k ? 0.4 : -0.6)); else put(g, 0, y, off, 0, 0.06 * (k ? 1 : -1), Math.PI / 2);
  }
  for (let i = 0; i < 8; i++) { /* the lean-to: split faces inward, tips meeting high above the crib */
    const a = (i / 8) * TAU + 0.4; const len = 1.7 + (i % 3) * 0.14; const g = splitLog(len, 0.075, 200 + i); g.translate(0, len / 2, 0);
    const lean = 0.36 + (i % 2) * 0.08; g.applyMatrix4(_m.makeRotationZ(lean)); g.applyMatrix4(_m.makeRotationY(-a));
    g.translate(Math.cos(a) * 0.68, 0.05, Math.sin(a) * 0.68); logs.push(g);
  }
  for (let i = 0; i < 3; i++) { /* spare logs lie by the fire */
    const a = 2.2 + i * 0.35; const g = splitLog(1.2 + i * 0.1, 0.09, 300 + i); put(g, Math.cos(a) * 1.75, 0.09 + (i === 2 ? 0.16 : 0), Math.sin(a) * 1.75, Math.PI / 2, 0, a + 0.15 * i);
  }
  const logGeo = B.own(mergeGeometries(logs)); logs.forEach((g) => g.dispose());
  const bark = B.own(new THREE.MeshStandardMaterial({ map: groundTex('bark_brown_02_diff.jpg', true), normalMap: groundTex('bark_brown_02_nor.jpg', false), color: 0x4a3a2e, roughness: 0.95, envMapIntensity: 0.06, emissive: new THREE.Color(0xff4410), emissiveIntensity: 3.2 }));
  heatBark(bark, U);
  const logMesh = new THREE.Mesh(logGeo, bark); logMesh.castShadow = true; logMesh.receiveShadow = true; group.add(logMesh);
  /* ---- coals */
  const coalU = { uTime: { value: 0 }, uHeat: { value: 1 }, uHot: { value: new THREE.Color(0xff5a14).multiplyScalar(2.4) } };
  const coalGeo = B.own(new THREE.CircleGeometry(0.98, 48)); coalGeo.rotateX(-Math.PI / 2);
  const coals = new THREE.Mesh(coalGeo, B.own(new THREE.ShaderMaterial({ uniforms: coalU, vertexShader: PLAIN_VERT, fragmentShader: COALS_FRAG, transparent: true, depthWrite: false }))); coals.position.y = 0.035; coals.renderOrder = 2; lift.add(coals);
  /* ---- flames: a tall core, a ring of tongues, and a dim wide body behind them (layered, so the fire has mass from far away) */
  const FU = flameU(1, 1, 1.45);
  const flames = flameMesh([[0, 0.2, 0, 1.9, 3.5, 0.1], [0.08, 0.3, 0.04, 1.4, 3.0, 0.62], [0.32, 0.16, 0.14, 1.25, 2.6, 0.4], [-0.32, 0.16, -0.1, 1.3, 2.75, 0.7], [0.06, 0.16, -0.34, 1.2, 2.3, 0.95], [-0.12, 0.16, 0.32, 1.15, 2.2, 0.25], [0.44, 0.12, -0.26, 0.85, 1.6, 0.55], [-0.46, 0.12, 0.22, 0.85, 1.55, 0.82], [0.22, 0.12, 0.46, 0.75, 1.35, 0.33], [-0.24, 0.12, -0.46, 0.75, 1.3, 0.12]], FU);
  lift.add(flames); B.own(flames.geometry); B.own(flames.material);
  const FB = flameU(1, 1, 0.8); FB.uCore.value.set(0xffb060); FB.uMid.value.set(0xff6a1c); FB.uEdge.value.set(0xc02a06); FB.uAlpha.value = 0.75;
  const flameBody = flameMesh([[0, 0.1, 0, 3.0, 3.1, 0.5], [0.1, 0.1, 0.05, 2.5, 2.5, 0.85], [-0.1, 0.1, -0.05, 2.2, 2.0, 0.27]], FB); flameBody.renderOrder = 6; lift.add(flameBody); B.own(flameBody.geometry); B.own(flameBody.material);
  /* ---- warm air halo, kept dim (no blob) */
  const halo = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: softTex(), color: 0xff7a2a, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  halo.scale.set(5, 5, 1); halo.position.y = 1.4; halo.renderOrder = 4; lift.add(halo);
  /* ---- firelight on the ground: a wide soft pool (fake light) under the real one */
  const fpU = { uColor: { value: new THREE.Color(0xff7a30) }, uK: { value: 0.3 } };
  const firePool = flat(17, POOL_FRAG, fpU, { additive: true, order: 3, y: 0.025 }); group.add(firePool); ownTree(B, firePool);
  /* ---- the one light, made here and never again */
  const light = new THREE.PointLight(0xff8a3a, 40, 26, 1.5); light.position.set(0, 1.4, 0); lift.add(light);
  /* ---- smoke: a tall column that leans with the wind and is lit from below */
  const SU = { uTime: { value: 0 }, uRise: { value: 15 }, uSize: { value: 1.2 }, uWind: { value: new THREE.Vector2(0.18, -0.08) }, uBase: { value: 2.2 }, uSpeed: { value: 0.06 }, uSpread: { value: 0.7 },
    uColor: { value: new THREE.Color(0x2c2b2c) }, uWarm: { value: new THREE.Color(0xff8a40).multiplyScalar(0.55) }, uOpacity: { value: 0.3 }, uWarmK: { value: 0.8 } };
  const smoke = smokeMesh(40, 9, SU); lift.add(smoke); B.own(smoke.geometry); B.own(smoke.material);
  /* a heavy smother cloud for die(): low, wide, pale */
  const DU = { ...SU, uRise: { value: 3.2 }, uSize: { value: 1.3 }, uBase: { value: 0.4 }, uSpeed: { value: 0.16 }, uSpread: { value: 1.4 }, uColor: { value: new THREE.Color(0x5a5856) }, uOpacity: { value: 0 }, uWarmK: { value: 0.2 }, uTime: { value: 0 } };
  const smother = smokeMesh(26, 19, DU); lift.add(smother); B.own(smother.geometry); B.own(smother.material);
  /* ---- embers */
  const emb = new Pool(lift, 380, { additive: true, map: sparkTex(), order: 8 });
  const EC = [new THREE.Color(0xffd27a).multiplyScalar(3.2), new THREE.Color(0xff9a3a).multiplyScalar(3), new THREE.Color(0xff5a1a).multiplyScalar(2.8)];
  /* ---- the hold ring: small cairn stones on a painted circle of ash; a line of embers in it glows when the hero strays */
  const R = radius;
  const ringU = { uR: { value: R }, uAway: { value: 0 }, uTime: { value: 0 }, uGlow: { value: new THREE.Color(0xffa050) }, uWarn: { value: new THREE.Color(accent).lerp(new THREE.Color(0xffc070), 0.5) } };
  const ringGeo = B.own(new THREE.RingGeometry(R - 1.3, R + 1.3, 192, 1));
  const ash = new THREE.Mesh(ringGeo, B.own(new THREE.ShaderMaterial({ uniforms: ringU, vertexShader: PLAIN_VERT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    fragmentShader: `${NOISE} uniform float uR; varying vec3 vP;
      void main(){ float d = length(vP.xy) - uR; float a = atan(vP.y, vP.x); float n = qF2(vec2(a * uR * 1.2, d * 3.0)); float n2 = qN2(vec2(a * uR * 6.0, d * 9.0));
        float band = 1.0 - smoothstep(0.1, 0.42, abs(d + (n - 0.5) * 0.25));
        float al = band * (0.45 + 0.55 * n) * (0.55 + 0.45 * n2) * 0.78; if (al < 0.004) discard;
        gl_FragColor = vec4(mix(vec3(0.03, 0.028, 0.026), vec3(0.16, 0.15, 0.14), n2 * 0.6), al); }` })));
  ash.rotation.x = -Math.PI / 2; ash.position.y = 0.014; ash.renderOrder = 1; group.add(ash);
  const glowLine = new THREE.Mesh(ringGeo, B.own(new THREE.ShaderMaterial({ uniforms: ringU, vertexShader: PLAIN_VERT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    fragmentShader: `${NOISE} uniform float uR; uniform float uAway; uniform float uTime; uniform vec3 uGlow; uniform vec3 uWarn; varying vec3 vP;
      void main(){ float d = length(vP.xy) - uR; float a = atan(vP.y, vP.x); float n = qF2(vec2(a * uR * 1.2, d * 3.0));
        float dd = abs(d + (n - 0.5) * 0.12);
        float line = exp(-dd * dd * 90.0) * 0.7 + exp(-dd * dd * 9.0) * 0.3;
        float glim = smoothstep(0.55, 0.85, qN2(vec2(a * uR * 3.0, uTime * 0.6)));
        float run = 0.5 + 0.5 * sin(uTime * 2.4 - a * 6.0);
        float k = line * (0.06 + 0.22 * glim) + uAway * (line * (0.35 + 0.55 * run) + exp(-dd * dd * 4.0) * 0.18 * (0.6 + 0.4 * run));
        vec3 c = mix(uGlow, uWarn, uAway) * k; if (k < 0.003) discard; gl_FragColor = vec4(c, 1.0); }` })));
  glowLine.rotation.x = -Math.PI / 2; glowLine.position.y = 0.02; glowLine.renderOrder = 2; group.add(glowLine);
  const cairnGeo = B.own(rockGeo(23, 1)); const NC = Math.round(TAU * R / 0.9);
  const cairns = new THREE.InstancedMesh(cairnGeo, sMat, NC); cairns.castShadow = true; cairns.receiveShadow = true;
  for (let i = 0; i < NC; i++) { const a = (i / NC) * TAU + (r() - 0.5) * 0.04; const rr = R + (r() - 0.5) * 0.12; const big = i % 4 === 0 ? 1.6 : 1; _a.set(Math.cos(a) * rr, 0.02, Math.sin(a) * rr); _q.setFromEuler(_eul.set(r(), r() * 6, r())); _s.set((0.09 + r() * 0.06) * big, (0.06 + r() * 0.05) * big, (0.08 + r() * 0.05) * big); cairns.setMatrixAt(i, _m.compose(_a, _q, _s)); }
  group.add(cairns);
  /* a low haze of warm light rising off the ring, only while the hero is away.
     It fades by height, by view angle (zero where the cylinder turns edge-on, so no silhouette line) and near the eye; the noise is periodic in angle (no seam). */
  const wallGeo = B.own(new THREE.CylinderGeometry(R, R, 1.1, 160, 6, true)); wallGeo.translate(0, 0.55, 0);
  const wall = new THREE.Mesh(wallGeo, B.own(new THREE.ShaderMaterial({ uniforms: ringU, vertexShader: BEAM_VERT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    fragmentShader: `${NOISE} uniform float uAway; uniform float uTime; uniform vec3 uWarn; uniform float uR; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ float an = vUv.x * 6.2831853; vec2 cs = vec2(cos(an), sin(an)) * uR;
        float n = qN3(vec3(cs * 1.4, vUv.y * 2.2 - uTime * 0.9)); float n2 = qN3(vec3(cs * 4.0, vUv.y * 5.0 - uTime * 1.7));
        float face = abs(dot(normalize(vN), normalize(vV))); float side = smoothstep(0.08, 0.55, face);
        float near = smoothstep(1.2, 4.0, length(vV));
        float hgt = pow(1.0 - vUv.y, 2.4) * smoothstep(0.0, 0.06, vUv.y + 0.06);
        float run = 0.6 + 0.4 * sin(uTime * 2.4 - an * 6.0);
        float k = hgt * side * near * (0.25 + 0.75 * n * n2 * 1.6) * uAway * run * 0.32; if (k < 0.002) discard; gl_FragColor = vec4(uWarn * k, 1.0); }` })));
  wall.renderOrder = 3; wall.visible = false; group.add(wall);
  ownTree(B, soot); ownTree(B, halo);
  fireStyle(B, style, { group, lift, ringStones, logMesh, FU, FB });
  /* the frontier campfire's flame cards (3.5 m core, 3.1 m body) stacked into a beam of light: a camp fire is
     knee to waist high, so its flame height is cut to 0.42 and its glow kept low */
  const HM = style === 'campfire' ? 0.34 : 1; const PM = style === 'campfire' ? 0.62 : 1; const FM = style === 'campfire' ? 0.25 : 1; /* the campfire's smoke is pale and thin (a dark 15 m column at 0.9 opacity over the unlit fire read as a black smudge in the dusk sky); it stays a mark you can see from the road */ const SM = style === 'campfire' ? 0.55 : 1; if (style === 'campfire') SU.uColor.value.set(0x8a8079); /* FM: a won vigil's roar stays small too */

  /* ---- state */
  const S = { t: 0, hp: 1, life: 1, gut: 0, away: 0, flare: 0, dying: -1, emit: 0, gustT: 0, gust: 0, won: 0 };
  const h = {
    group, radius: R, light,
    update(dt, { hp = 1, threatened = false, away = false } = {}) {
      S.t += dt; const t = S.t;
      S.hp = damp(S.hp, clamp(hp, 0, 1), 3, dt);
      const dead = S.dying >= 0 ? sstep(0, 1.8, t - S.dying) : 0;
      S.life = S.hp * (1 - dead);
      S.gut = damp(S.gut, threatened && S.dying < 0 ? 1 : 0, threatened ? 6 : 2, dt);
      S.away = damp(S.away, away && S.dying < 0 ? 1 : 0, 4, dt);
      S.flare = Math.max(S.won * 0.3, S.flare - dt * 0.45);
      /* wind gusts while the foes are at the fire */
      S.gustT -= dt; if (S.gustT <= 0) { S.gustT = 0.25 + Math.random() * 0.5; S.gust = (Math.random() - 0.5) * 2; }
      const life = S.life; const k = 0.28 + 0.72 * life;
      FU.uTime.value = t; FU.uH.value = (0.28 + 1.05 * life) * (1 - dead * 0.9) * HM; FU.uW.value = 0.6 + 0.45 * life; FU.uGut.value = S.gut * 0.45; FU.uFlare.value = S.flare * FM;
      FU.uWind.value.set(0.12 + S.gut * S.gust * 0.55, -0.05 + S.gut * Math.sin(t * 3.7) * 0.3); FU.uAlpha.value = 1 - dead;
      FU.uPower.value = 1.45 * (0.7 + 0.3 * life) * PM;
      FB.uTime.value = t * 0.8; FB.uH.value = FU.uH.value; FB.uW.value = FU.uW.value; FB.uGut.value = FU.uGut.value * 0.6; FB.uFlare.value = S.flare * FM; FB.uWind.value.copy(FU.uWind.value); FB.uAlpha.value = 0.75 * (1 - dead);
      U.time.value = t; U.heat.value = lerp(0.06, 1, Math.pow(life, 0.8)) * (1 + S.flare * 0.5) + (S.dying >= 0 ? 0.08 * (1 - sstep(2, 6, t - S.dying)) : 0); U.char.value = 0.5 + 0.45 * (1 - life);
      coalU.uTime.value = t; coalU.uHeat.value = 0.2 + 0.8 * life + (S.dying >= 0 ? 0.15 * (1 - sstep(1, 7, t - S.dying)) : 0);
      SU.uTime.value = t; SU.uOpacity.value = (0.34 + 0.55 * (1 - S.hp) + S.gut * 0.2) * SM; SU.uSize.value = 0.8 + 0.7 * (1 - S.hp); SU.uWind.value.copy(FU.uWind.value).multiplyScalar(1.5);
      SU.uWarmK.value = 0.7 * life;
      if (S.dying >= 0) { const d = t - S.dying; DU.uTime.value = d; DU.uOpacity.value = 0.65 * sstep(0, 0.4, d) * (1 - sstep(3, 7, d)); SU.uOpacity.value *= 1 - sstep(4, 8, d); }
      const flick = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 27.3 + 1.2) + 0.05 * Math.sin(t * 5.3) - S.gut * (0.25 * Math.abs(Math.sin(t * 19)));
      light.intensity = 40 * k * flick * (1 + S.flare * 1.2) * (1 - dead * 0.97);
      light.color.setRGB(1, 0.5 + 0.08 * life + S.flare * 0.12, 0.2 + 0.05 * life);
      light.position.set(S.gut * S.gust * 0.15, 1.1 + 0.5 * life, 0);
      fpU.uK.value = (0.1 + 0.24 * life) * flick * (1 + S.flare * 0.5) * (1 - dead * 0.9);
      halo.material.opacity = (0.06 + 0.1 * life) * flick * (1 + S.flare * 0.6) * (1 - dead);
      halo.scale.set((4 + 4 * life) * (0.5 + HM * 0.5), (4 + 5 * life + S.flare * 2) * HM, 1); halo.position.y = (1.0 + 1.4 * life) * HM;
      /* embers: a steady rise, bursts when the fire gutters or roars */
      S.emit += dt * (S.dying >= 0 ? 6 * (1 - sstep(0, 4, t - S.dying)) : (28 + 50 * life + S.gut * 45 + S.flare * 150));
      while (S.emit >= 1) {
        S.emit -= 1; const a = Math.random() * TAU; const rr = Math.random() * 0.6;
        const hot = Math.random(); const c = EC[hot < 0.3 ? 0 : hot < 0.75 ? 1 : 2];
        emb.emit(Math.cos(a) * rr, 0.3 + Math.random() * 1.4 * life, Math.sin(a) * rr, (Math.random() - 0.5) * 0.7 + FU.uWind.value.x * 1.5, 1.6 + Math.random() * 3.2 * (0.5 + life) + S.flare * 3, (Math.random() - 0.5) * 0.7 + FU.uWind.value.y * 1.5,
          c, 1.6 + Math.random() * 2.6, 0.025 + Math.random() * 0.04, 0.008, 1, -0.15, 0.5, false, 2.2);
      }
      emb.update(dt);
      /* the ring warns: glow line + wall */
      ringU.uTime.value = t; ringU.uAway.value = S.away; wall.visible = S.away > 0.01;
    },
    /* the fire is smothered: flame falls, a pale cloud, the last embers, dark logs */
    die() {
      if (S.dying >= 0) return 0; S.dying = S.t;
      for (let i = 0; i < 70; i++) { const a = Math.random() * TAU; emb.emit(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3, Math.cos(a) * 1.5, 0.8 + Math.random() * 1.8, Math.sin(a) * 1.5, EC[2], 0.8 + Math.random(), 0.03, 0.006, 1, 2.5, 1.2, true, 1); }
      return 3.5;
    },
    /* the vigil is won: the fire roars up and stays proud */
    flare() { S.flare = 1.6; S.won = 1; for (let i = 0; i < 160; i++) { const a = Math.random() * TAU; const rr = Math.random() * 0.4; emb.emit(Math.cos(a) * rr, 0.6, Math.sin(a) * rr, Math.cos(a) * (0.5 + Math.random()), 3 + Math.random() * 5, Math.sin(a) * (0.5 + Math.random()), EC[Math.random() < 0.5 ? 0 : 1], 1.8 + Math.random() * 2, 0.03 + Math.random() * 0.03, 0.01, 1, -0.2, 0.7, false, 3); } return 2.5; },
    dispose() { emb.dispose(); group.removeFromParent(); light.dispose(); B.free(); },
    get state() { return { ...S }; },
  };
  return h;
}

/* ================================================================ THE CHAINS: an anchor pylon */
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
/* R = runes in the channels, G = crack order (bright = early), B = carved channel */
function pylonTex(seed) {
  const s = 1024; const mk = () => { const c = document.createElement('canvas'); c.width = c.height = s; return c; };
  const cr = mk(); const cg = mk(); const cb = mk(); const gr = cr.getContext('2d'); const gg = cg.getContext('2d'); const gb = cb.getContext('2d');
  const r = seeded(seed);
  for (const g of [gr, gg, gb]) { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); }
  /* the shaft spans v 0.0 .. 0.86 of the canvas (top 14% is left for the cap); four faces across u */
  for (let f = 0; f < 4; f++) {
    const cx = (f + 0.5) * s / 4; const fw = s / 4;
    /* the channel: a carved slot down the middle of each face, with a frame */
    gb.fillStyle = '#fff'; gb.fillRect(cx - fw * 0.17, s * 0.2, fw * 0.34, s * 0.7);
    gb.strokeStyle = '#999'; gb.lineWidth = 6; gb.strokeRect(cx - fw * 0.3, s * 0.17, fw * 0.6, s * 0.76);
    /* runes stacked inside the channel */
    gr.fillStyle = '#fff'; gr.textAlign = 'center'; gr.textBaseline = 'middle'; gr.font = `700 ${Math.round(fw * 0.27)}px "Segoe UI Symbol", "Noto Sans Runic", serif`;
    gr.shadowColor = '#fff'; gr.shadowBlur = 10;
    for (let k = 0; k < 7; k++) { const ch = RUNES[Math.floor(r() * RUNES.length)]; gr.fillText(ch, cx, s * 0.25 + k * s * 0.093); }
    gr.shadowBlur = 0;
    /* thin glowing lines on the frame */
    gr.strokeStyle = 'rgba(255,255,255,0.55)'; gr.lineWidth = 3; gr.strokeRect(cx - fw * 0.3, s * 0.17, fw * 0.6, s * 0.76);
  }
  /* cracks: random walks from points inside each face; brightness = order of appearance */
  gg.lineCap = 'round'; gg.lineJoin = 'round';
  const walk = (x, y, a, len, w, v0, depth) => {
    let px = x; let py = y; const steps = 12;
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.9; const st = len / steps; const nx = px + Math.cos(a) * st; const ny = py + Math.sin(a) * st;
      const v = v0 * (1 - (i / steps) * 0.55); gg.strokeStyle = `rgb(0,${Math.round(255 * v)},0)`; gg.lineWidth = w * (1 - i / steps * 0.6);
      gg.beginPath(); gg.moveTo(px, py); gg.lineTo(nx, ny); gg.stroke(); px = nx; py = ny;
      if (depth < 2 && r() < 0.18) walk(px, py, a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.5), len * 0.5, w * 0.6, v * 0.85, depth + 1);
    }
  };
  for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) {
    const x = (f + 0.2 + r() * 0.6) * s / 4; const y = s * (0.3 + r() * 0.5); const v0 = 1 - k * 0.2 - r() * 0.08;
    walk(x, y, -Math.PI / 2 + (r() - 0.5) * 1.4, s * (0.18 + r() * 0.14), 9, v0, 0); walk(x, y, Math.PI / 2 + (r() - 0.5) * 1.4, s * (0.14 + r() * 0.12), 8, v0 * 0.95, 0);
  }
  const out = mk(); const go = out.getContext('2d'); const id = go.createImageData(s, s);
  const R0 = gr.getImageData(0, 0, s, s).data; const G0 = gg.getImageData(0, 0, s, s).data; const B0 = gb.getImageData(0, 0, s, s).data;
  for (let i = 0; i < s * s; i++) { id.data[i * 4] = R0[i * 4]; id.data[i * 4 + 1] = G0[i * 4 + 1]; id.data[i * 4 + 2] = B0[i * 4]; id.data[i * 4 + 3] = 255; }
  go.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(out); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; return t;
}
function runeCircleTex() {
  return canvasTex('runeCircle', 512, 512, (g, s) => {
    const c = s / 2; const r = seeded(17); g.clearRect(0, 0, s, s); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
    const ring = (rad, w, a = 1) => { g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.arc(c, c, rad * c, 0, TAU); g.stroke(); g.globalAlpha = 1; };
    ring(0.95, 5, 0.8); ring(0.88, 2, 0.6); ring(0.62, 4, 0.9);
    g.font = `700 ${Math.round(s * 0.07)}px "Segoe UI Symbol", "Noto Sans Runic", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; g.save(); g.translate(c + Math.cos(a) * 0.75 * c, c + Math.sin(a) * 0.75 * c); g.rotate(a + Math.PI / 2); g.fillText(RUNES[Math.floor(r() * RUNES.length)], 0, 0); g.restore(); }
    for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; g.lineWidth = i % 3 ? 2 : 4; g.beginPath(); g.moveTo(c + Math.cos(a) * 0.62 * c, c + Math.sin(a) * 0.62 * c); g.lineTo(c + Math.cos(a) * (i % 3 ? 0.56 : 0.5) * c, c + Math.sin(a) * (i % 3 ? 0.56 : 0.5) * c); g.stroke(); }
    const gr = g.createRadialGradient(c, c, s * 0.1, c, c, s * 0.5); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.beginPath(); g.arc(c, c, s * 0.2, 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over';
  });
}
/* the pylon stone: runes + cracks from the data map; one half of a split shaft (uSide); back faces glow like a hot core */
function pylonMaterial(map, U, side, L = null) {
  const m = new THREE.MeshStandardMaterial({ map: L ? (L.map ? groundTex(L.map, true, 2) : null) : groundTex('rock_diff.jpg', true, 2), normalMap: L ? (L.nor ? groundTex(L.nor, false, 2) : null) : groundTex('rock_nor_gl.jpg', false, 2),
    color: L?.color ?? 0x857f77, roughness: L?.rough ?? 0.92, metalness: L?.metal ?? 0, envMapIntensity: L ? 0.5 : 0.2, emissive: 0xffffff, emissiveMap: map, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uAcc: U.acc, uRune: U.rune, uCrack: U.crack, uCrackGlow: U.crackGlow, uCore: U.core, uTime: U.time, uSplitN: U.splitN, uSide: side, uMapRep: U.mapRep });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vQp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvQp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vQp; uniform vec3 uAcc; uniform float uRune; uniform float uCrack; uniform float uCrackGlow; uniform float uCore; uniform float uTime; uniform vec2 uSplitN; uniform float uSide;${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { float sp = dot(vQp.xz, uSplitN) + (qN3(vec3(vQp.y * 5.0, 0.0, 1.3)) - 0.5) * 0.14 + (qN3(vec3(vQp.y * 17.0, 2.0, 0.0)) - 0.5) * 0.05;
          if (sp * uSide < 0.0) discard; }`)
      .replace('#include <emissivemap_fragment>', `
        { vec4 dm = texture2D(emissiveMap, vEmissiveMapUv);
          float rune = dm.r; float cr = dm.g; float chan = dm.b;
          float shown = step(0.02, cr) * smoothstep(1.0 - uCrack, 1.0 - uCrack + 0.04, cr);
          float n = qN3(vQp * 6.0 + vec3(0.0, uTime * 0.6, 0.0));
          diffuseColor.rgb *= 1.0 - 0.5 * chan - 0.35 * rune;
          diffuseColor.rgb *= 1.0 - 0.85 * shown;
          totalEmissiveRadiance = uAcc * (rune * uRune * (0.75 + 0.5 * n) + chan * 0.04 * uRune + shown * uCrackGlow * (0.6 + 0.8 * n));
          if (!gl_FrontFacing) { diffuseColor.rgb = vec3(0.02); totalEmissiveRadiance = uAcc * uCore * (0.4 + 1.2 * qN3(vQp * 14.0 + uTime)); } }`);
  };
  m.customProgramCacheKey = () => 'qp-pylon';
  return m;
}
/* chain links: dark iron, a fresnel rim and bands of light that run up the chain toward the enemy */
function linkMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.9, roughness: 0.42, envMapIntensity: 0.9, emissive: 0xffffff });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uAcc: U.acc, uTime: U.time, uGlow: U.glow, uLen: U.len });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aT; varying float vT;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = aT;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vT; uniform vec3 uAcc; uniform float uTime; uniform float uGlow; uniform float uLen;')
      .replace('#include <emissivemap_fragment>', `
        { float fr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
          float band = smoothstep(0.86, 1.0, fract(vT * 0.075 - uTime * 0.42));
          float far = 1.0 - smoothstep(uLen * 0.6, uLen, vT);
          totalEmissiveRadiance = uAcc * uGlow * (0.015 + 0.22 * fr + band * 0.42) * (0.35 + 0.65 * far); }`);
  };
  m.customProgramCacheKey = () => 'qp-link';
  return m;
}
/* a soft beam of light along +Y of a cylinder: edges fade by view angle, ends fade by height */
const BEAM_VERT = 'varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }';
const BEAM_FRAG = `${NOISE}
uniform vec3 uCol; uniform float uK; uniform float uTime; uniform float uGrow; uniform float uFadeLo; uniform float uFadeHi; uniform float uFar;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float edge = pow(f, 2.4);
  float h = vUv.y; float grow = 1.0 - smoothstep(uGrow - 0.06, uGrow, h);
  float an = vUv.x * 6.2831853; float n = 0.65 + 0.55 * qN3(vec3(cos(an) * 2.2, sin(an) * 2.2, h * uFar * 0.25 - uTime * 0.7));
  float a = edge * smoothstep(0.0, uFadeLo, h) * (1.0 - smoothstep(uFadeHi, 1.0, h)) * grow * n * uK * smoothstep(2.0, 9.0, length(vV));
  if (a < 0.002) discard; gl_FragColor = vec4(uCol * a, 1.0); }`;
function beamMat(uniforms) { return new THREE.ShaderMaterial({ uniforms, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); }

export function makeAnchor(scene, { accent = 0xff4a12, to = new THREE.Vector3(30, 15, -84), index = 0, style = 'dark' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group);
  const acc = new THREE.Color(accent);
  const U = { acc: { value: acc.clone().multiplyScalar(1) }, rune: { value: 0.7 }, crack: { value: 0 }, crackGlow: { value: 1.6 }, core: { value: 0 }, time: { value: 0 }, splitN: { value: new THREE.Vector2(1, 0) }, mapRep: { value: 1 } };
  const HT = 2.6; const PLINTH_TOP = 0.5; /* plinth top */
  /* the turn: the pylon faces the chain; everything that turns lives in `body` */
  const body = new THREE.Group(); group.add(body);
  /* ---- plinth: two stepped blocks with chamfered edges */
  const AL = ANCHOR_LOOK[style] || null;
  const plinthMat = B.own(stoneMat(AL?.plinth ?? 0x6c6863));
  const block = (w, hgt, y, seed) => { const g = new THREE.BoxGeometry(w, hgt, w, 3, 1, 3); const p = g.attributes.position; const rr = seeded(seed); for (let i = 0; i < p.count; i++) { const x = p.getX(i); const z = p.getZ(i); const yy = p.getY(i); const k = yy > 0 ? 0.94 : 1; p.setXYZ(i, x * k + (rr() - 0.5) * 0.02, yy + (rr() - 0.5) * 0.015, z * k + (rr() - 0.5) * 0.02); } const n = g.toNonIndexed(); g.dispose(); n.computeVertexNormals(); n.translate(0, y + hgt / 2, 0); return n; };
  const plGeo = B.own(mergeGeometries([block(1.5, 0.26, 0, 3), block(1.12, 0.24, 0.26, 5)]));
  const plinth = new THREE.Mesh(plGeo, plinthMat); plinth.castShadow = true; plinth.receiveShadow = true; body.add(plinth);
  /* ---- obelisk shaft + pyramidion (square, tapered, flat-shaded) */
  const shaftG = new THREE.CylinderGeometry(0.2 * Math.SQRT2, 0.31 * Math.SQRT2, HT - PLINTH_TOP - 0.36, 4, 10); shaftG.rotateY(Math.PI / 4); shaftG.translate(0, PLINTH_TOP + (HT - PLINTH_TOP - 0.36) / 2, 0);
  const capG = new THREE.ConeGeometry(0.2 * Math.SQRT2, 0.36, 4, 1); capG.rotateY(Math.PI / 4); capG.translate(0, HT - 0.18, 0);
  { const uv = capG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01, 0.995); }
  const sN = shaftG.toNonIndexed(); const cN = capG.toNonIndexed(); shaftG.dispose(); capG.dispose(); sN.computeVertexNormals(); cN.computeVertexNormals();
  /* the shaft UV v 0..1 maps to canvas 0.06..0.86 (bottom to top); keep the cap on black */
  { const uv = sN.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 0.08 + uv.getY(i) * 0.78); }
  const obGeo = B.own(mergeGeometries([sN, cN])); sN.dispose(); cN.dispose();
  const dataMap = B.own(pylonTex(31 + index * 7));
  const sideA = { value: 0 }; const sideB = { value: -1 };
  const matA = B.own(pylonMaterial(dataMap, U, sideA, AL)); const matB = B.own(pylonMaterial(dataMap, U, sideB, AL));
  const pivA = new THREE.Group(); const pivB = new THREE.Group(); body.add(pivA, pivB);
  const halfA = new THREE.Mesh(obGeo, matA); const halfB = new THREE.Mesh(obGeo, matB); halfA.castShadow = halfB.castShadow = true; halfA.receiveShadow = halfB.receiveShadow = true;
  pivA.add(halfA); pivB.add(halfB); halfB.visible = false;
  /* ---- iron: a collar band near the top and a great mooring ring on the chain side */
  const iron = B.own(ironMat(0x2e2a27));
  const hw = (y) => lerp(0.31, 0.2, (y - PLINTH_TOP) / (HT - PLINTH_TOP - 0.36));
  const yC = HT - 0.62; const cw = hw(yC) + 0.025;
  const collarG = B.own(mergeGeometries([new THREE.CylinderGeometry(cw * Math.SQRT2 * 0.99, cw * Math.SQRT2, 0.1, 4, 1).rotateY(Math.PI / 4).toNonIndexed(), new THREE.CylinderGeometry(cw * Math.SQRT2 + 0.012, cw * Math.SQRT2 + 0.012, 0.022, 4, 1).rotateY(Math.PI / 4).translate(0, 0.05, 0).toNonIndexed(), new THREE.CylinderGeometry(cw * Math.SQRT2 + 0.012, cw * Math.SQRT2 + 0.012, 0.022, 4, 1).rotateY(Math.PI / 4).translate(0, -0.05, 0).toNonIndexed(), ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => { const g = new THREE.SphereGeometry(0.03, 8, 6).toNonIndexed(); g.translate(x * cw, 0, z * cw); return g; })]));
  collarG.computeVertexNormals();
  const hardware = new THREE.Group(); body.add(hardware);
  const collar = new THREE.Mesh(collarG, iron); collar.position.y = yC; collar.castShadow = true; hardware.add(collar);
  /* the ring hangs from a staple on the +z face (the chain side) */
  const ringR = 0.2; const ringT = 0.045;
  const ringG = B.own(new THREE.TorusGeometry(ringR, ringT, 10, 28));
  const ring = new THREE.Mesh(ringG, iron); ring.castShadow = true;
  const stapleG = B.own(new THREE.TorusGeometry(0.07, 0.03, 8, 12, Math.PI)); const staple = new THREE.Mesh(stapleG, iron);
  staple.position.set(0, yC, cw + 0.005); staple.rotation.set(0, Math.PI / 2, Math.PI / 2); hardware.add(staple);
  ring.position.set(0, yC - ringR + 0.02, cw + 0.06); ring.rotation.set(0, 0, 0); hardware.add(ring);
  const ringPt = V(0, yC - 2 * ringR + 0.06, cw + 0.06); /* bottom of the ring, where the chain is made fast */
  /* ---- the chain */
  const LS = 1.25; /* link scale: a giant's chain */
  const linkG = B.own(new THREE.TorusGeometry(0.105 * LS, 0.034 * LS, 8, 18)); linkG.scale(1, 1.55, 1);
  const PITCH = 0.25 * LS; const LENGTH = 42; const NL = Math.ceil(LENGTH / PITCH);
  const tA = new Float32Array(NL); linkG.setAttribute('aT', new THREE.InstancedBufferAttribute(tA, 1));
  const LU = { acc: U.acc, time: U.time, glow: { value: 1 }, len: { value: LENGTH } };
  const linkMat = B.own(linkMaterial(LU));
  const links = new THREE.InstancedMesh(linkG, linkMat, NL); links.instanceMatrix.setUsage(THREE.DynamicDrawUsage); links.castShadow = true; links.frustumCulled = false; group.add(links);
  /* the shackle: the oversized first link through the ring */
  const shackleG = B.own(new THREE.TorusGeometry(0.16, 0.05, 10, 20)); shackleG.scale(1, 1.45, 1);
  const shackle = new THREE.Mesh(shackleG, iron); shackle.castShadow = true; group.add(shackle);
  /* beyond the links: the chain goes on as a thread of light into the sky, to the enemy */
  const threadU = { uCol: { value: acc.clone().lerp(new THREE.Color(0xffffff), 0.25) }, uK: { value: 0.9 }, uTime: { value: 0 }, uGrow: { value: 1.1 }, uFadeLo: { value: 0.12 }, uFadeHi: { value: 0.55 }, uFar: { value: 42 } };
  const threadG = B.own(new THREE.CylinderGeometry(0.1, 0.1, 1, 10, 1, true)); threadG.translate(0, 0.5, 0);
  const thread = new THREE.Mesh(threadG, B.own(beamMat(threadU))); thread.renderOrder = 6; thread.frustumCulled = false; group.add(thread);
  /* ---- ground: cracked soot and a rune circle that wakes as the stone weakens */
  const glowU = { uColor: { value: acc.clone() }, uK: { value: 0.3 } };
  const runeCircle = new THREE.Mesh(B.own(new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2)), B.own(new THREE.MeshBasicMaterial({ map: runeCircleTex(), color: acc.clone(), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
  runeCircle.position.y = 0.02; runeCircle.renderOrder = 2; group.add(runeCircle);
  const sootU = { uK: { value: 0.8 } }; const soot = flat(3.4, SOOT_FRAG, sootU, { order: 1, y: 0.012 }); group.add(soot); ownTree(B, soot);
  const pool = flat(4.5, POOL_FRAG, glowU, { additive: true, order: 3, y: 0.03 }); group.add(pool); ownTree(B, pool);
  /* ---- particles and debris */
  const sparks = new Pool(group, 220, { additive: true, map: sparkTex(), order: 8 });
  const dust = new Pool(group, 90, { additive: false, map: puffTex(), order: 5 });
  const chipGeo = B.own(rockGeo(5, 0, -0.2)); const chipMat = B.own(stoneMat(0xa49e96)); chipMat.flatShading = true; const chips = new Shards(group, 60, chipGeo, chipMat);
  const SPK = new THREE.Color(0xfff0c8).multiplyScalar(3); const SPK2 = acc.clone().lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(3.2); const DUST = new THREE.Color(0x6a6460);

  /* ---- chain path: a catenary-ish arc from the ring to `to`, laid out by arc length */
  const NS = 360; const path = new Float32Array(NS * 3); const cum = new Float32Array(NS);
  const lastAt = new THREE.Vector3(Infinity, 0, 0); const toLocal = new THREE.Vector3(); const start = new THREE.Vector3();
  let total = 1;
  const node = new Float32Array(NL * 3); const prev = new Float32Array(NL * 3); /* verlet after the break */
  const S = { t: 0, hp: 1, flash: 0, quiver: 0, jolt: 0, joltT: 0, broken: -1, dir: new THREE.Vector3(1, 0, 0), hw: 0, hv: 0, hr: 0, coreK: 0, recoil: 0 };
  function layout() {
    group.updateMatrixWorld(true);
    toLocal.copy(to); group.worldToLocal(toLocal);
    body.rotation.y = Math.atan2(toLocal.x, toLocal.z);
    body.updateMatrixWorld(true); start.copy(ringPt); body.localToWorld(start); group.worldToLocal(start);
    const dist = start.distanceTo(toLocal); const sag = dist * 0.04;
    let L = 0;
    for (let i = 0; i < NS; i++) {
      const u = i / (NS - 1); /* bias samples toward the near end */
      const t = u * u * 0.98 + u * 0.02;
      const x = lerp(start.x, toLocal.x, t); const z = lerp(start.z, toLocal.z, t);
      const y = Math.max(0.3, lerp(start.y, toLocal.y, t) - sag * 4 * t * (1 - t));
      path[i * 3] = x; path[i * 3 + 1] = y; path[i * 3 + 2] = z;
      if (i) L += Math.hypot(x - path[i * 3 - 3], y - path[i * 3 - 2], z - path[i * 3 - 1]); cum[i] = L;
    }
    total = L;
    /* the thread: from the end of the links to the enemy */
    const sEnd = Math.min(LENGTH - 2, total * 0.95); pointAt(sEnd, _a); thread.position.copy(_a);
    _b.subVectors(toLocal, _a); thread.scale.set(1, _b.length(), 1); thread.quaternion.setFromUnitVectors(UP, _b.normalize());
    for (let i = 0; i < NL; i++) { pointAt(i * PITCH + PITCH * 1.2, _a); node[i * 3] = prev[i * 3] = _a.x; node[i * 3 + 1] = prev[i * 3 + 1] = _a.y; node[i * 3 + 2] = prev[i * 3 + 2] = _a.z; }
  }
  function pointAt(s, out) {
    s = clamp(s, 0, total); let lo = 0; let hi = NS - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid; else hi = mid; }
    const k = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return out.set(lerp(path[lo * 3], path[hi * 3], k), lerp(path[lo * 3 + 1], path[hi * 3 + 1], k), lerp(path[lo * 3 + 2], path[hi * 3 + 2], k));
  }
  const X = new THREE.Vector3(); const Y = new THREE.Vector3(); const Z = new THREE.Vector3(); const P = new THREE.Vector3();
  function placeLink(i, p, tan, roll, scale) {
    Y.copy(tan).normalize(); X.crossVectors(Y, UP); if (X.lengthSq() < 1e-6) X.set(1, 0, 0); X.normalize(); Z.crossVectors(X, Y);
    if (roll) { const tx = X.x; const ty = X.y; const tz = X.z; X.copy(Z); Z.set(-tx, -ty, -tz); }
    _m.makeBasis(X, Y, Z); _m.scale(_s.setScalar(scale)); _m.setPosition(p); links.setMatrixAt(i, _m);
  }
  const SNAP = 0; /* every near link falls after the break */
  function chainFrame(dt) {
    const t = S.t; const broke = S.broken >= 0 ? t - S.broken : -1;
    /* a jolt runs up the chain when the stone is struck */
    S.joltT += dt; const jA = S.jolt * Math.exp(-S.joltT * 3);
    for (let i = 0; i < NL; i++) {
      const s = i * PITCH + PITCH * 1.2; tA[i] = s;
      if (broke >= 0 && i >= SNAP && i < SNAP + 46) {
        const j = i * 3; P.set(node[j], node[j + 1], node[j + 2]);
        const k2 = Math.min(NL - 1, i + 1) * 3; const k1 = Math.max(SNAP, i - 1) * 3;
        _b.set(node[k2] - node[k1], node[k2 + 1] - node[k1 + 1], node[k2 + 2] - node[k1 + 2]); if (_b.lengthSq() < 1e-8) _b.set(0, 1, 0);
        placeLink(i, P, _b, i % 2, 1);
      } else if (broke >= 0 && i >= SNAP) {
        /* the far chain recoils into the sky and is gone */
        const back = S.recoil; const ss = s + back; if (ss > total || ss > LENGTH + 2) { links.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
        pointAt(ss, P); pointAt(ss + 0.2, _b); _b.sub(P); placeLink(i, P, _b, i % 2, 1);
      } else {
        pointAt(s, P); pointAt(s + 0.2, _b); _b.sub(P);
        if (jA > 0.001) { const w = Math.sin(s * 1.4 - S.joltT * 18) * jA * Math.exp(-s * 0.08); P.x += S.dir.z * w; P.z -= S.dir.x * w; P.y += w * 0.6; }
        if (broke < 0) P.y += Math.sin(t * 0.9 + s * 0.15) * 0.04 * Math.min(1, s * 0.2);
        placeLink(i, P, _b, i % 2, 1);
      }
    }
    links.instanceMatrix.needsUpdate = true; links.geometry.attributes.aT.needsUpdate = true;
    /* the shackle through the ring */
    pointAt(0.0, P); pointAt(0.25, _b); _b.sub(P); _d.copy(P).addScaledVector(_b.normalize(), 0.06);
    Y.copy(_b); X.crossVectors(Y, UP).normalize(); Z.crossVectors(X, Y); _m.makeBasis(Z, Y, X.negate()); _m.setPosition(_d); shackle.matrixAutoUpdate = false; shackle.matrix.copy(_m);
  }
  function verlet(dt) {
    const g = -12 * dt * dt; const n0 = SNAP; const n1 = Math.min(NL, SNAP + 46);
    for (let i = n0; i < n1; i++) {
      const j = i * 3; const vx = (node[j] - prev[j]) * 0.985; const vy = (node[j + 1] - prev[j + 1]) * 0.985; const vz = (node[j + 2] - prev[j + 2]) * 0.985;
      prev[j] = node[j]; prev[j + 1] = node[j + 1]; prev[j + 2] = node[j + 2];
      node[j] += vx; node[j + 1] += vy + g; node[j + 2] += vz;
    }
    /* the end that was pulled toward the sky is now free: the last free link follows the recoil for a moment, then lets go */
    for (let it = 0; it < 8; it++) {
      for (let i = n0; i < n1 - 1; i++) {
        const a = i * 3; const b = a + 3; const dx = node[b] - node[a]; const dy = node[b + 1] - node[a + 1]; const dz = node[b + 2] - node[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6; const k = (d - PITCH) / d * 0.5;
        node[a] += dx * k; node[a + 1] += dy * k; node[a + 2] += dz * k; node[b] -= dx * k; node[b + 1] -= dy * k; node[b + 2] -= dz * k;
      }
      for (let i = n0; i < n1; i++) { const j = i * 3; const fl = 0.045 * LS; if (node[j + 1] < fl) { node[j + 1] = fl; const fx = node[j] - prev[j]; const fz = node[j + 2] - prev[j + 2]; prev[j] = node[j] - fx * 0.6; prev[j + 2] = node[j + 2] - fz * 0.6; prev[j + 1] = node[j + 1]; } }
    }
  }
  const h = {
    group, height: 1.5, hp: 1, index,
    update(dt) {
      S.t += dt; const t = S.t; U.time.value = t; threadU.uTime.value = t;
      if (!group.position.equals(lastAt)) { lastAt.copy(group.position); layout(); }
      S.flash = Math.max(0, S.flash - dt * 3); S.quiver = Math.max(0, S.quiver - dt);
      const broke = S.broken >= 0 ? t - S.broken : -1;
      const weak = 1 - S.hp;
      U.rune.value = broke >= 0 ? 3.5 * Math.exp(-broke * 1.2) : (0.55 + weak * 2.6) * (0.85 + 0.15 * Math.sin(t * (2 + weak * 6))) + S.flash * 3;
      U.crack.value = damp(U.crack.value, broke >= 0 ? 1 : weak * 0.92, 8, dt); U.crackGlow.value = 1.2 + weak * 1.6 + S.flash * 2;
      U.core.value = broke >= 0 ? 0.3 + 2.2 * Math.exp(-broke * 0.8) : 0;
      LU.glow.value = broke >= 0 ? Math.max(0, 1 - broke * 0.7) * 0.9 : 0.75 + weak * 0.6 + S.flash * 0.4;
      threadU.uK.value = broke >= 0 ? 0.9 * Math.max(0, 1 - broke * 2.5) : (0.55 + 0.25 * Math.sin(t * 2.3 + index)) * (1 + S.flash);
      runeCircle.material.opacity = broke >= 0 ? 0.6 * Math.exp(-broke * 0.9) : 0.2 + weak * 0.55 + S.flash * 0.4;
      runeCircle.rotation.y = t * 0.05;
      glowU.uK.value = broke >= 0 ? 0.6 * Math.exp(-broke * 0.9) : 0.18 + weak * 0.35 + S.flash * 0.5;
      /* strain: the stone hums, more when weak; struck stone quivers */
      const qv = S.quiver > 0 ? Math.sin(t * 90) * 0.012 * (S.quiver / 0.18) : 0;
      if (broke < 0) { body.position.set(qv * S.dir.z, 0, -qv * S.dir.x); pivA.rotation.set(0, 0, 0); }
      else {
        /* the two halves fall apart, and the iron drops */
        const k = Math.min(1, broke / 1.3); const e = k * k;
        const ang = Math.min(e * 1.25, 0.62);
        const n = U.splitN.value; const nx = n.x; const nz = n.y;
        _a.set(nz, 0, -nx); /* tip toward +n */
        pivA.setRotationFromAxisAngle(_a, ang); pivB.setRotationFromAxisAngle(_a, -ang * 0.78);
        S.hv -= 12 * dt; S.hw = Math.max(-yC + 0.25, S.hw + S.hv * dt); if (S.hw <= -yC + 0.25) S.hv = 0; S.hr = Math.min(1.3, S.hr + dt * 2.5);
        hardware.position.y = S.hw; hardware.rotation.z = S.hr * 0.12;
        verlet(Math.min(dt, 1 / 30));
        S.recoil += dt * (8 + broke * 30);
      }
      chainFrame(dt);
      sparks.update(dt); dust.update(dt); chips.update(dt);
      /* the weak stone weeps sparks from its cracks */
      if (broke < 0 && weak > 0.3 && Math.random() < dt * weak * 6) { const a = Math.random() * TAU; const y = 0.9 + Math.random() * 1.2; _a.set(Math.cos(a) * 0.3, y, Math.sin(a) * 0.3); body.localToWorld(_a); group.worldToLocal(_a); sparks.emit(_a.x, _a.y, _a.z, Math.cos(a) * 0.4, 0.2, Math.sin(a) * 0.4, SPK2, 0.6, 0.03, 0.01, 1, 3, 0.5); }
    },
    /* a blow: k = health left (0..1); point and dir in world space */
    hit(k, point, dir) {
      if (S.broken >= 0) return;
      S.hp = h.hp = clamp(k, 0, 1); S.flash = 1; S.quiver = 0.18; S.jolt = 0.12; S.joltT = 0;
      if (dir) { S.dir.copy(dir).setY(0); if (S.dir.lengthSq() < 1e-6) S.dir.set(1, 0, 0); S.dir.normalize(); }
      _c.copy(point || _a.set(0, 1.5, 0).add(group.position)); group.worldToLocal(_c);
      const out = _d.copy(S.dir).multiplyScalar(-1);
      for (let i = 0; i < 34; i++) { const sp = 2 + Math.random() * 5; sparks.emit(_c.x, _c.y, _c.z, out.x * sp + (Math.random() - 0.5) * 3, (Math.random() - 0.2) * 4, out.z * sp + (Math.random() - 0.5) * 3, i % 3 ? SPK : SPK2, 0.3 + Math.random() * 0.5, 0.035, 0.01, 1, 9, 1.2); }
      for (let i = 0; i < 6; i++) chips.emit(_c.x, _c.y, _c.z, out.x * 2 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, out.z * 2 + (Math.random() - 0.5) * 2, 0.03 + Math.random() * 0.04, 3);
      for (let i = 0; i < 6; i++) dust.emit(_c.x, _c.y, _c.z, out.x * 0.6 + (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.4, out.z * 0.6 + (Math.random() - 0.5) * 0.5, DUST, 1.2, 0.25, 0.9, 0.5, -0.1, 1.5, false);
    },
    /* the chain snaps, the links fall, the pylon splits: returns seconds */
    break(dir) {
      if (S.broken >= 0) return 0;
      if (dir) { S.dir.copy(dir).setY(0); if (S.dir.lengthSq() < 1e-6) S.dir.set(1, 0, 0); S.dir.normalize(); }
      S.broken = S.t; S.hp = h.hp = 0; S.flash = 1; S.hv = 0.5;
      /* split across the blow: the halves fall to either side of it (split normal in body space) */
      _a.copy(S.dir); _q.copy(body.quaternion).invert(); _a.applyQuaternion(_q); U.splitN.value.set(-_a.z, _a.x).normalize();
      sideA.value = 1; halfB.visible = true;
      { const n = U.splitN.value; pivA.position.set(n.x * 0.27, PLINTH_TOP, n.y * 0.27); halfA.position.copy(pivA.position).negate(); pivB.position.set(-n.x * 0.27, PLINTH_TOP, -n.y * 0.27); halfB.position.copy(pivB.position).negate(); }
      /* the free links get a kick: up and away from the ring */
      for (let i = SNAP; i < Math.min(NL, SNAP + 46); i++) { const j = i * 3; const k = 1 - (i - SNAP) / 46; prev[j] = node[j] - S.dir.x * 0.02 * k; prev[j + 1] = node[j + 1] - 0.06 * k; prev[j + 2] = node[j + 2] - S.dir.z * 0.02 * k; }
      pointAt(SNAP * PITCH, _c);
      for (let i = 0; i < 60; i++) sparks.emit(_c.x, _c.y, _c.z, (Math.random() - 0.5) * 7, Math.random() * 6, (Math.random() - 0.5) * 7, i % 2 ? SPK : SPK2, 0.4 + Math.random() * 0.6, 0.045, 0.012, 1, 9, 1);
      for (let i = 0; i < 40; i++) { const y = 0.7 + Math.random() * 1.7; const a = Math.random() * TAU; chips.emit(Math.cos(a) * 0.2, y, Math.sin(a) * 0.2, Math.cos(a) * (1.5 + Math.random() * 3), 1 + Math.random() * 3.5, Math.sin(a) * (1.5 + Math.random() * 3), 0.025 + Math.random() * 0.045, 5 + Math.random() * 3); }
      for (let i = 0; i < 26; i++) { const a = Math.random() * TAU; dust.emit(Math.cos(a) * 0.4, 0.3 + Math.random() * 1.5, Math.sin(a) * 0.4, Math.cos(a) * 1.4, 0.3 + Math.random() * 0.6, Math.sin(a) * 1.4, DUST, 2.2 + Math.random(), 0.5, 1.8, 0.55, -0.05, 1.2, false); }
      return 2.6;
    },
    dispose() { sparks.dispose(); dust.dispose(); chips.dispose(); group.removeFromParent(); B.free(); },
  };
  return h;
}

/* ================================================================ THE DARK: a beacon */
/* the light shaft of a lit beacon: a tapered column, soft at the sides (by view angle), bright at the root, gone at the top; streaks climb it */
const SHAFT_FRAG = `${NOISE}
uniform vec3 uCol; uniform float uK; uniform float uTime; uniform float uGrow; uniform float uFar; uniform float uPow;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float edge = pow(f, uPow);
  float h = vUv.y; float grow = 1.0 - smoothstep(uGrow - 0.08, uGrow, h);
  float an = vUv.x * 6.2831853; vec2 cs = vec2(cos(an), sin(an));
  float n = qN3(vec3(cs * 1.6, h * uFar * 0.12 - uTime * 0.55)); float n2 = qN3(vec3(cs * 3.5 + 7.0, h * uFar * 0.35 - uTime * 1.3));
  float streak = 0.55 + 0.7 * n * (0.6 + 0.8 * n2);
  float fall = smoothstep(0.0, 0.025, h) * pow(1.0 - h, 2.2) * (0.35 + 0.65 * exp(-h * 9.0));
  float near = smoothstep(1.0, 5.0, length(vV));
  float a = edge * fall * grow * streak * near * uK; if (a < 0.002) discard; gl_FragColor = vec4(uCol * a, 1.0); }`;
export function makeBeacon(scene, { accent = 0xffb050, index = 0, style = 'dark' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group);
  const r = seeded(91 + index * 13);
  const iron = B.own(ironMat(0x2a2522));
  const TOWER = 2.35; const RIM = 2.98; const BS = 1.35; /* bowl scale */
  /* ---- the cairn: a rough tapered pillar of dry stone, with stones standing proud of its face and a skirt of big ones at the foot */
  const sMat = B.own(stoneMat(0x77726b)); const sGeo = B.own(rockGeo(61 + index, 2, -0.6));
  const coreG = new THREE.CylinderGeometry(0.36, 0.7, TOWER, 11, 9, false); coreG.translate(0, TOWER / 2, 0);
  { const p = coreG.attributes.position; const o = r() * 9; for (let k = 0; k < p.count; k++) { const x = p.getX(k); const y = p.getY(k); const z = p.getZ(k); const an = Math.atan2(z, x); const w = 1 + 0.09 * Math.sin(an * 3 + o + y * 2.1) + 0.06 * Math.sin(an * 7 + y * 6 + o) + 0.05 * Math.sin(y * 13 + an * 2); if (y > 0.01 && y < TOWER - 0.01) p.setXYZ(k, x * w, y + 0.03 * Math.sin(an * 5 + o), z * w); } }
  const coreN = NI(coreG); coreN.computeVertexNormals();
  { const uv = coreN.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 3, uv.getY(k) * 2.2); }
  const pillar = new THREE.Mesh(B.own(coreN), sMat); pillar.castShadow = true; pillar.receiveShadow = true; group.add(pillar);
  const stones = [];
  for (let i = 0; i < 34; i++) { const y = 0.15 + r() * (TOWER - 0.3); const rr = lerp(0.7, 0.36, y / TOWER) - 0.04; const a = r() * TAU; const sz = lerp(0.22, 0.14, y / TOWER) * (0.8 + r() * 0.5); stones.push([Math.cos(a) * rr, y, Math.sin(a) * rr, sz * (1.0 + r() * 0.4), sz * (0.75 + r() * 0.25), sz * (0.8 + r() * 0.3), -a]); }
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + r() * 0.3; const rr = 0.78 + r() * 0.1; const sz = 0.26 + r() * 0.08; stones.push([Math.cos(a) * rr, 0.1, Math.sin(a) * rr, sz * 1.2, sz * 0.8, sz, -a]); }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + r(); stones.push([Math.cos(a) * 0.4, TOWER - 0.02, Math.sin(a) * 0.4, 0.2, 0.1, 0.17, r() * 6]); }
  for (let i = 0; i < 6; i++) { const a = r() * TAU; const rr = 1.1 + r() * 0.5; stones.push([Math.cos(a) * rr, 0.04, Math.sin(a) * rr, 0.13 + r() * 0.08, 0.08 + r() * 0.05, 0.12 + r() * 0.07, r() * 6]); }
  const cairn = new THREE.InstancedMesh(sGeo, sMat, stones.length); cairn.castShadow = true; cairn.receiveShadow = true;
  stones.forEach(([x, y, z, sx, sy, sz, a], i) => { _a.set(x, y, z); _q.setFromEuler(_eul.set((r() - 0.5) * 0.7, a, (r() - 0.5) * 0.7)); _s.set(sx, sy, sz); cairn.setMatrixAt(i, _m.compose(_a, _q, _s)); });
  group.add(cairn);
  beaconStyle(B, style, { group, pillar, cairn, TOWER });
  /* ---- iron: a cap plate on the cairn, a short post and three curled arms that cradle the bowl */
  const parts = [];
  const plate = new THREE.CylinderGeometry(0.34, 0.38, 0.06, 10, 1); plate.translate(0, TOWER + 0.03, 0); parts.push(plate);
  const post = new THREE.CylinderGeometry(0.06, 0.08, RIM - 0.3 - TOWER, 8, 1); post.translate(0, TOWER + (RIM - 0.3 - TOWER) / 2, 0); parts.push(post);
  const collar = new THREE.TorusGeometry(0.075, 0.022, 6, 14); collar.rotateX(Math.PI / 2); collar.translate(0, RIM - 0.42, 0); parts.push(collar);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5; const ca = Math.cos(a); const sa = Math.sin(a);
    const pts = [V(ca * 0.05, RIM - 0.62, sa * 0.05), V(ca * 0.3, RIM - 0.5, sa * 0.3), V(ca * 0.52, RIM - 0.25, sa * 0.52), V(ca * 0.6, RIM + 0.02, sa * 0.6), V(ca * 0.66, RIM + 0.16, sa * 0.66), V(ca * 0.6, RIM + 0.26, sa * 0.6)];
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.022, 6, false));
    const knob = new THREE.SphereGeometry(0.035, 8, 6); knob.translate(ca * 0.6, RIM + 0.27, sa * 0.6); parts.push(knob);
  }
  const ironGeo = B.own(merged(...parts)); ironGeo.computeVertexNormals();
  const ironParts = new THREE.Mesh(ironGeo, iron); ironParts.castShadow = true; group.add(ironParts);
  /* ---- the bowl: hammered iron with a rolled lip */
  const prof = [[0.0, 0.0], [0.1, 0.005], [0.22, 0.04], [0.32, 0.11], [0.38, 0.19], [0.405, 0.24], [0.42, 0.255], [0.405, 0.265], [0.385, 0.25], [0.36, 0.2], [0.3, 0.12], [0.2, 0.06], [0.0, 0.05]].map(([x, y]) => new THREE.Vector2(x * BS, y * BS));
  const bowlG = B.own(new THREE.LatheGeometry(prof, 32)); bowlG.translate(0, RIM - 0.255 * BS, 0);
  const bowlMat = B.own(new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.8, roughness: 0.55, envMapIntensity: 0.6, emissive: 0xff5a1a, emissiveIntensity: 0, side: THREE.DoubleSide }));
  const BU = { heat: { value: 0 } };
  bowlMat.onBeforeCompile = (sh) => { sh.uniforms.uBowl = BU.heat; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uBowl;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = emissive * uBowl * (gl_FrontFacing ? 0.0 : 1.0);'); };
  bowlMat.customProgramCacheKey = () => 'qp-bowl';
  const bowl = new THREE.Mesh(bowlG, bowlMat); bowl.castShadow = true; group.add(bowl);
  /* ---- kindling in the bowl: a cone of split sticks */
  const U = { heat: { value: 0.1 }, time: { value: 0 }, char: { value: 0.3 } };
  const sticks = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + r() * 0.3; const len = 0.46 + r() * 0.16; const g = new THREE.CylinderGeometry(0.026, 0.034, len, 6, 1); g.translate(0, len / 2, 0);
    g.applyMatrix4(_m.makeRotationZ(0.5 + r() * 0.2)); g.applyMatrix4(_m.makeRotationY(-a)); g.translate(Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27); sticks.push(g.toNonIndexed()); g.dispose();
  }
  const kGeo = B.own(mergeGeometries(sticks)); sticks.forEach((g) => g.dispose()); kGeo.computeVertexNormals();
  const bark = B.own(new THREE.MeshStandardMaterial({ map: groundTex('bark_brown_02_diff.jpg', true), normalMap: groundTex('bark_brown_02_nor.jpg', false), color: 0x5a4636, roughness: 0.95, envMapIntensity: 0.08, emissive: new THREE.Color(0xff4a12), emissiveIntensity: 2.4 }));
  heatBark(bark, U);
  const kindling = new THREE.Mesh(kGeo, bark); kindling.position.y = RIM - 0.22; kindling.castShadow = true; group.add(kindling);
  const coalU = { uTime: { value: 0 }, uHeat: { value: 0.3 }, uHot: { value: new THREE.Color(0xff5a14).multiplyScalar(2.6) } };
  const coalGeo = B.own(new THREE.CircleGeometry(0.45, 28)); coalGeo.rotateX(-Math.PI / 2);
  const coals = new THREE.Mesh(coalGeo, B.own(new THREE.ShaderMaterial({ uniforms: coalU, vertexShader: PLAIN_VERT, fragmentShader: COALS_FRAG, transparent: true, depthWrite: false })));
  coals.position.y = RIM - 0.22; coals.renderOrder = 2; group.add(coals);
  /* ---- flame */
  const FU = flameU(0.1, 0.5, 1.5);
  const Y0 = RIM - 0.2;
  const flames = flameMesh([[0, Y0, 0, 0.95, 2.3, 0.15], [0.16, Y0, 0.08, 0.7, 1.7, 0.45], [-0.16, Y0, -0.07, 0.72, 1.8, 0.7], [0.04, Y0, -0.18, 0.62, 1.45, 0.9], [-0.05, Y0, 0.18, 0.58, 1.3, 0.3], [0.22, Y0, -0.12, 0.45, 0.95, 0.58], [-0.22, Y0, 0.1, 0.45, 0.9, 0.12]], FU);
  group.add(flames); B.own(flames.geometry); B.own(flames.material);
  /* the last ember: a small breathing coal light you can find in the black */
  const ember = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: softTex(), color: new THREE.Color(0xff5a1a).multiplyScalar(2.2), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  ember.position.y = RIM + 0.12; ember.scale.setScalar(0.55); ember.renderOrder = 7; group.add(ember);
  const halo = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: softTex(), color: 0xff8a3a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  halo.position.y = RIM + 0.7; halo.scale.set(4, 4.5, 1); halo.renderOrder = 4; group.add(halo);
  /* ---- one warm light, dark until the beacon catches */
  const light = new THREE.PointLight(0xff8a3a, 0, 16, 1.6); light.position.set(0, RIM + 0.6, 0); group.add(light);
  /* ---- the shaft: a wide soft column and a narrow hot core; both taper upward and fade out long before their tops */
  const beamCol = new THREE.Color(0xffc890).lerp(new THREE.Color(accent), 0.25);
  const BW = { uCol: { value: beamCol.clone().multiplyScalar(0.5) }, uK: { value: 0 }, uTime: { value: 0 }, uGrow: { value: 0 }, uFar: { value: 42 }, uPow: { value: 3.2 } };
  const BC = { uCol: { value: beamCol.clone().lerp(new THREE.Color(0xfff0d8), 0.4).multiplyScalar(0.55) }, uK: { value: 0 }, uTime: BW.uTime, uGrow: BW.uGrow, uFar: { value: 42 }, uPow: { value: 4.0 } };
  const bwG = B.own(new THREE.CylinderGeometry(0.3, 2.3, 42, 40, 12, true)); bwG.translate(0, 21, 0);
  const bcG = B.own(new THREE.CylinderGeometry(0.06, 0.62, 42, 24, 12, true)); bcG.translate(0, 21, 0);
  const beamW = new THREE.Mesh(bwG, B.own(new THREE.ShaderMaterial({ uniforms: BW, vertexShader: BEAM_VERT, fragmentShader: SHAFT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
  const beamC = new THREE.Mesh(bcG, B.own(new THREE.ShaderMaterial({ uniforms: BC, vertexShader: BEAM_VERT, fragmentShader: SHAFT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  beamW.position.y = beamC.position.y = RIM + 0.2; beamW.renderOrder = beamC.renderOrder = 6; beamW.frustumCulled = beamC.frustumCulled = false; beamW.visible = beamC.visible = false; group.add(beamW, beamC);
  /* ---- ground: the stand circle that fills, and a pool of firelight */
  const ringU = { uFill: { value: 0 }, uTime: { value: 0 }, uLit: { value: 0 }, uCol: { value: new THREE.Color(0xffb060) }, uTrack: { value: 0.22 } };
  const RG = B.own(new THREE.RingGeometry(1.75, 2.75, 160, 1));
  const ring = new THREE.Mesh(RG, B.own(new THREE.ShaderMaterial({ uniforms: ringU, vertexShader: PLAIN_VERT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    fragmentShader: `${NOISE} uniform float uFill; uniform float uTime; uniform float uLit; uniform vec3 uCol; uniform float uTrack; varying vec3 vP;
      void main(){ float d = length(vP.xy) - 2.25; float a = fract(atan(vP.x, vP.y) / 6.2831853 + 0.5);
        float n = qN2(vec2(a * 90.0, d * 6.0 + uTime * 0.4));
        float line = exp(-d * d * 260.0);
        float soft = exp(-d * d * 22.0);
        float on = smoothstep(uFill + 0.004, uFill - 0.004, a) * step(0.001, uFill);
        float head = exp(-abs(a - uFill) * 60.0) * step(0.001, uFill) * (1.0 - uLit);
        float ticks = smoothstep(0.75, 0.95, fract(a * 24.0)) * line * 0.5;
        float k = (line * (uTrack + ticks * uTrack) + on * (line * 1.1 + soft * 0.3) * (0.75 + 0.5 * n) + head * (1.4 * soft + 1.8 * line)) * (1.0 - uLit * 0.8);
        if (k < 0.003) discard; gl_FragColor = vec4(uCol * k, 1.0); }` })));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.renderOrder = 2; group.add(ring);
  const poolU = { uColor: { value: new THREE.Color(0xff8a3a) }, uK: { value: 0.1 } };
  const pool = flat(9, POOL_FRAG, poolU, { additive: true, order: 3, y: 0.03 }); group.add(pool); ownTree(B, pool);
  /* ---- sparks from the bowl, and motes that climb the shaft */
  const sparks = new Pool(group, 200, { additive: true, map: sparkTex(), order: 8 });
  const motes = new Pool(group, 150, { additive: true, map: softTex(), order: 8 });
  const EC = [new THREE.Color(0xffd27a).multiplyScalar(3), new THREE.Color(0xff8a2a).multiplyScalar(2.8)];
  const MC = beamCol.clone().lerp(new THREE.Color(0xffe2b0), 0.4).multiplyScalar(1.8);
  ownTree(B, ember); ownTree(B, halo);
  const S = { t: 0, charge: 0, lit: 0, litAt: -1, emit: 0, memit: 0, flare: 0 };
  const h = {
    group, index,
    update(dt, { charge = 0, lit = false } = {}) {
      S.t += dt; const t = S.t;
      if (lit && S.litAt < 0) h.light();
      const L = S.litAt >= 0 ? sstep(0, 0.6, t - S.litAt) : 0; S.lit = L;
      S.charge = damp(S.charge, L > 0 ? 1 : clamp(charge, 0, 1), 10, dt);
      S.flare = Math.max(0, S.flare - dt * 0.9);
      const c = S.charge;
      U.time.value = t; U.heat.value = 0.12 + c * 0.9 + L * 0.4; U.char.value = 0.25 + L * 0.4;
      coalU.uTime.value = t; coalU.uHeat.value = 0.25 + 0.15 * Math.sin(t * 1.7) + c * 0.6 + L * 0.5;
      FU.uTime.value = t; FU.uH.value = 0.06 + 0.06 * Math.sin(t * 2.1) * (1 - c) + c * 0.4 + L * 0.6; FU.uW.value = 0.4 + c * 0.3 + L * 0.4; FU.uFlare.value = S.flare;
      FU.uAlpha.value = 0.55 + 0.45 * Math.max(c, L); FU.uWind.value.set(0.06 * Math.sin(t * 0.7), 0.04);
      BU.heat.value = 0.15 * c + 0.6 * L;
      const flick = 0.85 + 0.08 * Math.sin(t * 13.1 + index) + 0.07 * Math.sin(t * 27.3 + 1.2);
      light.intensity = (c * 6 + L * 22) * flick * (1 + S.flare * 0.8);
      ember.material.opacity = (0.75 + 0.25 * Math.sin(t * 2.2 + index)) * (1 - L * 0.7); ember.scale.setScalar(1.0 + 0.12 * Math.sin(t * 2.2 + index) + c * 0.3); /* a cold beacon must be found in the black (85 % of the dark frame was near black) */
      halo.material.opacity = (L * 0.16 + c * 0.05) * flick + S.flare * 0.15;
      /* the shaft rises after the catch */
      const since = S.litAt >= 0 ? t - S.litAt : -1;
      BW.uTime.value = t; BW.uGrow.value = since >= 0 ? sstep(0.1, 2.0, since) * 1.1 : 0;
      BW.uK.value = since >= 0 ? 0.95 * (1 + S.flare * 0.8) * (0.92 + 0.08 * flick) : 0; BC.uK.value = since >= 0 ? 0.75 * (1 + S.flare) : 0;
      beamW.visible = beamC.visible = since >= 0;
      ringU.uTime.value = t; ringU.uFill.value = L > 0 ? 1 : c; ringU.uLit.value = L; ringU.uTrack.value = 0.16 + 0.1 * Math.sin(t * 1.3 + index);
      poolU.uK.value = 0.05 + 0.03 * Math.sin(t * 2.2 + index) + c * 0.16 + L * 0.34;
      /* sparks: one now and then when cold, a stream while catching, embers when lit */
      S.emit += dt * (1.0 + c * 36 + L * 34 + S.flare * 90);
      while (S.emit >= 1) {
        S.emit -= 1; const a = Math.random() * TAU; const rr = Math.random() * 0.3;
        sparks.emit(Math.cos(a) * rr, RIM - 0.08, Math.sin(a) * rr, (Math.random() - 0.5) * (0.6 + S.flare * 4), 0.8 + Math.random() * (1.2 + c * 1.6 + L * 2 + S.flare * 4), (Math.random() - 0.5) * (0.6 + S.flare * 4), EC[Math.random() < 0.4 ? 0 : 1], 0.8 + Math.random() * (0.6 + L * 1.6), 0.025 + Math.random() * 0.03, 0.006, 1, -0.1, 0.6, false, 1.8);
      }
      /* motes climb the shaft slowly, drifting, and fade high up */
      if (since >= 0) {
        S.memit += dt * 16 * sstep(0.3, 1.5, since);
        while (S.memit >= 1) { S.memit -= 1; const a = Math.random() * TAU; const rr = 0.15 + Math.random() * 0.55; motes.emit(Math.cos(a) * rr, RIM + 0.6 + Math.random() * 1.5, Math.sin(a) * rr, Math.cos(a) * -0.04, 2.2 + Math.random() * 2.6, Math.sin(a) * -0.04, MC, 4 + Math.random() * 3, 0.05 + Math.random() * 0.05, 0.03, 0.8, 0, 0.05, false, 0.6); }
      }
      sparks.update(dt); motes.update(dt);
    },
    /* it catches: a burst, a flame, and a shaft that climbs */
    light() { if (S.litAt >= 0) return 0; S.litAt = S.t; S.flare = 1; return 1.4; },
    dispose() { sparks.dispose(); motes.dispose(); group.removeFromParent(); light.dispose(); B.free(); },
  };
  return h;
}

/* ================================================================ COMPANIONS: figures of ember-light
   A companion is a spirit of the one the hero fights for: a solid silhouette of dark ember with a bright rim, slow rising streaks of heat,
   a warm core at the heart and feet that dissolve into light. A depth pre-pass keeps the silhouette clean (no inner overlaps show).
   When taken, the figure folds into its heart: a captured ember in a small iron gibbet, a faint thread of light rising to the enemy. */
const CAUSES = new Set(['hearth', 'the debt', 'your name', 'the open road', 'the far light']);
const SPIRIT_VERT = `uniform float uBaseY; varying vec3 vN; varying vec3 vV; varying vec3 vWp; varying float vHy;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; vHy = wp.y - uBaseY; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SPIRIT_FRAG = `${NOISE}
uniform vec3 uRim; uniform vec3 uBody; uniform vec3 uCoreC; uniform vec3 uCoreW; uniform float uCoreK; uniform float uPower; uniform float uAlpha; uniform float uTime; uniform float uHem; uniform float uSeed; uniform float uCold; uniform float uTop; uniform float uMode;
varying vec3 vN; varying vec3 vV; varying vec3 vWp; varying float vHy;
void main(){
  vec3 N = normalize(vN); vec3 Vd = normalize(vV);
  float fr = 1.0 - abs(dot(N, Vd)); float rim = pow(fr, 4.0);
  float n = qN3(vWp * vec3(6.0, 2.6, 6.0) + vec3(uSeed, -uTime * 0.7, 0.0));
  float n2 = qN3(vWp * vec3(17.0, 7.0, 17.0) + vec3(0.0, -uTime * 1.7, uSeed));
  float streak = smoothstep(0.6, 0.92, n * 0.6 + n2 * 0.5);
  vec3 d = vWp - uCoreW; float core = exp(-dot(d, d) * uCoreK);
  float top = smoothstep(0.0, uTop, vHy) * (0.75 + 0.25 * N.y);
  vec3 c = uBody * (0.45 + 0.55 * top) * (0.65 + 0.7 * n) + uRim * rim * 1.15 + uCoreC * core * 0.9 + uRim * streak * 0.22 * (1.0 - rim);
  c = mix(c, vec3(0.42, 0.5, 0.68) * (0.18 + 0.25 * n + rim * 1.3), uCold);
  c *= uPower;
  float a = uAlpha * clamp(0.72 + 0.28 * rim + core * 0.2, 0.0, 1.0);
  float hem = smoothstep(uHem, uHem + 0.2, vHy + (n2 - 0.5) * 0.14);
  c += uRim * (1.0 - hem) * 0.8;
  if (uMode > 0.5) {
    if (uMode < 1.5) { float fl = qN3(vec3(vWp.x * 5.0, vHy * 3.0 - uTime * 2.6, vWp.z * 5.0 + uSeed)); a *= smoothstep(0.0, 0.55, vHy * 0.8 + fl * 0.55 - 0.1); c += uRim * fl * 0.35 * (1.0 - top * 0.5); }
    else if (uMode < 2.5) { float sl = 0.5 + 0.5 * step(0.45, fract(vWp.y * 26.0 - uTime * 1.4)); float gl = step(0.94, qN3(vec3(floor(uTime * 9.0), floor(vWp.y * 6.0), uSeed))); c *= 0.75 + 0.45 * sl; a *= (0.55 + 0.45 * sl) * (1.0 - 0.6 * gl); c += uRim * gl * 0.4; }
    else if (uMode < 3.5) { /* ember (frontier): a solid figure of warm dust; it thins to drifting dust only at the feet (it was see-through before) */
      float du = qN3(vWp * vec3(11.0, 6.0, 11.0) + vec3(0.0, -uTime * 0.45, uSeed)); float solid = smoothstep(0.05, 0.4, vHy / max(uTop, 0.3));
      a = mix(a * smoothstep(0.28, 0.62, du * 0.8 + rim * 0.35 + 0.18), max(a, 0.97), solid); c = mix(c, uBody * (1.6 + 0.6 * top) * (0.8 + 0.4 * du) + uRim * rim * 0.7, 0.7); }
    else { float sp = pow(qN3(vWp * 38.0 + vec3(0.0, uTime * 2.5, uSeed)), 7.0) * 7.0; c = c * 1.2 + vec3(1.0, 0.95, 0.85) * sp; }
  }
  a *= hem; if (a < 0.03) discard;
  gl_FragColor = vec4(c, a);
}`;
function labelTex(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112; const g = c.getContext('2d');
  const text = String(name).slice(0, 24); let fs = 50; g.font = `italic 400 ${fs}px ${SERIF}`; while (g.measureText(text).width > 440 && fs > 24) { fs -= 2; g.font = `italic 400 ${fs}px ${SERIF}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 14; g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(text, 256, 58);
  g.shadowColor = 'rgba(255,150,70,0.45)'; g.shadowBlur = 8; g.fillStyle = 'rgba(236,214,186,0.92)'; g.fillText(text, 256, 56);
  /* a thin rule under the name, fading at both ends */
  const w = Math.min(420, g.measureText(text).width + 40); const gr = g.createLinearGradient(256 - w / 2, 0, 256 + w / 2, 0);
  gr.addColorStop(0, 'rgba(230,180,120,0)'); gr.addColorStop(0.5, 'rgba(230,180,120,0.55)'); gr.addColorStop(1, 'rgba(230,180,120,0)');
  g.shadowBlur = 0; g.fillStyle = gr; g.fillRect(256 - w / 2, 92, w, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/* a lantern: iron cage, warm glass, a standing flame. y = 0 is the lantern's base */
function buildLantern(B, iron, s = 1) {
  const g = new THREE.Group();
  const parts = [];
  const cap = new THREE.ConeGeometry(0.075 * s, 0.07 * s, 6, 1); cap.translate(0, 0.19 * s, 0); parts.push(cap.toNonIndexed());
  const lip = new THREE.CylinderGeometry(0.078 * s, 0.078 * s, 0.014 * s, 6, 1); lip.translate(0, 0.152 * s, 0); parts.push(lip.toNonIndexed());
  const base = new THREE.CylinderGeometry(0.07 * s, 0.062 * s, 0.025 * s, 6, 1); base.translate(0, 0.0, 0); parts.push(base.toNonIndexed());
  const hoop = new THREE.TorusGeometry(0.028 * s, 0.007 * s, 6, 12); hoop.translate(0, 0.25 * s, 0); parts.push(hoop.toNonIndexed());
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const p = new THREE.CylinderGeometry(0.0055 * s, 0.0055 * s, 0.14 * s, 4, 1); p.translate(Math.cos(a) * 0.066 * s, 0.08 * s, Math.sin(a) * 0.066 * s); parts.push(p.toNonIndexed()); }
  const cageG = B.own(mergeGeometries(parts)); parts.forEach((p) => p.dispose()); cageG.computeVertexNormals();
  const cage = new THREE.Mesh(cageG, iron); g.add(cage);
  const FU = flameU(1, 1, 1.6); FU.uCore.value.set(0xfff6dc); FU.uMid.value.set(0xffb85a);
  const fl = flameMesh([[0, 0.015 * s, 0, 0.07 * s, 0.13 * s, 0.2], [0.005, 0.015 * s, 0.003, 0.045 * s, 0.09 * s, 0.7]], FU); fl.renderOrder = 13; g.add(fl); B.own(fl.geometry); B.own(fl.material);
  const glow = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: softTex(), color: new THREE.Color(0xffb060).multiplyScalar(1.3), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  glow.position.y = 0.08 * s; glow.scale.setScalar(0.42 * s); glow.renderOrder = 13; g.add(glow);
  return { g, FU, glow, cage };
}
const NI = (g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; };
const merged = (...gs) => { const m = mergeGeometries(gs.map(NI)); gs.forEach((g) => g.dispose()); return m; };
/* the captured light: a small iron gibbet around a hot ember, a hook and a thread of light that climbs to the enemy */
function gibbetGeo() {
  const bars = []; const NB = 7; const H = 0.27;
  for (let i = 0; i < NB; i++) {
    const a = (i / NB) * TAU; const pts = [];
    for (let k = 0; k <= 8; k++) { const y = -H + (2 * H * k) / 8; const rr = 0.045 + 0.13 * Math.sin(Math.PI * (k / 8)); pts.push(V(Math.cos(a) * rr, y, Math.sin(a) * rr)); }
    bars.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0085, 4, false));
  }
  const band = new THREE.TorusGeometry(0.175, 0.011, 5, 28); band.rotateX(Math.PI / 2); bars.push(band);
  const top = new THREE.TorusGeometry(0.05, 0.014, 6, 14); top.rotateX(Math.PI / 2); top.translate(0, H, 0); bars.push(top);
  const bot = new THREE.TorusGeometry(0.05, 0.014, 6, 14); bot.rotateX(Math.PI / 2); bot.translate(0, -H, 0); bars.push(bot);
  const hook = new THREE.TorusGeometry(0.04, 0.011, 6, 14); hook.translate(0, H + 0.05, 0); bars.push(hook);
  for (let k = 0; k < 3; k++) { const l = new THREE.TorusGeometry(0.03, 0.009, 5, 10); l.scale(1, 1.5, 1); if (k % 2) l.rotateY(Math.PI / 2); l.translate(0, H + 0.12 + k * 0.075, 0); bars.push(l); }
  const g = merged(...bars); g.computeVertexNormals(); return g;
}
export function makeCompanions(scene, names = [], { kinds, accent = 0xb04aff, style = 'dark' } = {}) {
  const CS = COMP_STYLE[style] || null;
  const B = bag(); const root = new THREE.Group(); scene.add(root);
  const motes = new Pool(root, 360, { additive: true, map: softTex(), order: 14 });
  const iron = B.own(ironMat(0x2a2420));
  const acc = new THREE.Color(accent);
  let camera = scene.getObjectByProperty('isPerspectiveCamera', true) || null;
  const gibG = B.own(gibbetGeo());
  const threadG = B.own(new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true).translate(0, 0.5, 0));
  const list = names.slice(0, 3).map((name, i) => {
    let kind = (kinds && kinds[i]) || 'person'; if (CAUSES.has(String(name).trim().toLowerCase())) kind = 'flame';
    const U = { uRim: { value: new THREE.Color(1.0, 0.62, 0.3) }, uBody: { value: new THREE.Color(0.17, 0.055, 0.02) }, uCoreC: { value: new THREE.Color(1.0, 0.5, 0.16) }, uCoreW: { value: new THREE.Vector3() }, uCoreK: { value: 9 },
      uPower: { value: 1 }, uAlpha: { value: 0.9 }, uTime: { value: 0 }, uHem: { value: 0.0 }, uSeed: { value: i * 3.1 }, uCold: { value: 0 }, uTop: { value: 1.6 }, uBaseY: { value: 0 },
      uCol: { value: new THREE.Color(1.0, 0.55, 0.2) }, uMode: { value: 0 } };
    if (CS) { U.uRim.value.set(CS.rim); U.uBody.value.set(CS.body); U.uCoreC.value.set(CS.core); U.uCol.value.set(CS.core); U.uMode.value = CS.mode; }
    const mat = B.own(new THREE.ShaderMaterial({ uniforms: U, vertexShader: SPIRIT_VERT, fragmentShader: SPIRIT_FRAG, transparent: true, depthWrite: false }));
    const pre = B.own(new THREE.ShaderMaterial({ uniforms: U, vertexShader: SPIRIT_VERT, fragmentShader: SPIRIT_FRAG, transparent: true, depthWrite: true, colorWrite: false }));
    /* a spirit part: drawn twice, depth first (renderOrder 10), colour second (11) */
    const spirit = (geo, parent) => { B.own(geo); const p = new THREE.Mesh(geo, pre); p.renderOrder = 10; const m = new THREE.Mesh(geo, mat); m.renderOrder = 11; parent.add(p, m); return m; };
    const object3D = new THREE.Group(); root.add(object3D);
    const inner = new THREE.Group(); object3D.add(inner);
    const fold = new THREE.Group(); inner.add(fold); /* the figure shrinks into its heart from here */
    const pose = new THREE.Group(); fold.add(pose);
    const c = { name, kind, object3D, position: object3D.position, state: 'with', i, U, inner, pose, fold, t: Math.random() * 10, yaw: 0, vel: new THREE.Vector3(), last: new THREE.Vector3(), first: true, speed: 0, gait: 0,
      P: { power: 1, alpha: 0.92, cold: 0, sit: 0, cage: 0, far: 0, label: 1, lean: 0, flare: 0, curl: 0 }, burst: 0 };
    /* soft contact shadow and a little pool of warm light under it */
    const shadow = new THREE.Mesh(B.own(new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2)), B.own(new THREE.MeshBasicMaterial({ map: softTex(), color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
    shadow.position.y = 0.015; shadow.renderOrder = 2; object3D.add(shadow);
    const warmPool = flat(2.4, POOL_FRAG, { uColor: { value: new THREE.Color(CS?.pool ?? 0xff9a50) }, uK: { value: 0.22 } }, { additive: true, order: 3, y: 0.02 }); object3D.add(warmPool); ownTree(B, warmPool);
    c.shadow = shadow; c.warmPool = warmPool;
    if (kind === 'person') {
      /* a cloaked man, life size: broad shoulders, a bare head with the hood thrown back, a lantern in the right hand */
      const prof = [[0.0, 0.3], [0.27, 0.3], [0.285, 0.36], [0.265, 0.6], [0.235, 0.86], [0.205, 1.06], [0.195, 1.2], [0.215, 1.31], [0.2, 1.39], [0.13, 1.445], [0.07, 1.475], [0.0, 1.48]].map(([x, y]) => new THREE.Vector2(x, y));
      const cloak = new THREE.LatheGeometry(prof, 30); cloak.scale(1, 1, 0.62);
      { const p = cloak.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k); const y = p.getY(k); const z = p.getZ(k); const an = Math.atan2(z, x); const fold = 1 + 0.06 * Math.sin(an * 7 + 0.5) * Math.max(0, 1 - (y - 0.3) / 0.7); p.setXYZ(k, x * fold, y, z * fold - (y < 0.7 ? (0.7 - y) * 0.12 : 0)); } }
      const torso = merged(cloak, ellip(0.085, 0.06, 0.08, 0.175, 1.36, 0, 0, 12), ellip(0.085, 0.06, 0.08, -0.175, 1.36, 0, 0, 12),
        new THREE.TorusGeometry(0.085, 0.04, 8, 18).rotateX(Math.PI / 2 - 0.25).translate(0, 1.47, -0.01), ellip(0.11, 0.1, 0.06, 0, 1.43, -0.11, 0.3, 12));
      torso.computeVertexNormals(); spirit(torso, pose);
      const head = new THREE.Group(); head.position.set(0, 1.5, 0.005); pose.add(head);
      spirit(merged(rodGeo(0.045, 0.04, V(0, -0.04, 0), V(0, 0.06, 0.005), 10), ellip(0.083, 0.108, 0.095, 0, 0.115, 0.01, 0, 18), ellip(0.088, 0.075, 0.098, 0, 0.15, -0.012, 0, 16), ellip(0.014, 0.024, 0.02, 0, 0.1, 0.1, 0.2, 8), ellip(0.05, 0.03, 0.04, 0, 0.04, 0.05, 0, 10)), head);
      /* legs below the hem: they carry the walk */
      const legG = merged(rodGeo(0.07, 0.05, V(0, 0, 0), V(0, -0.5, 0.01), 10), rodGeo(0.05, 0.04, V(0, -0.5, 0.01), V(0, -0.86, -0.01), 10), ellip(0.048, 0.04, 0.1, 0, -0.875, 0.04, 0, 10));
      const legs = [0.095, -0.095].map((x) => { const g = new THREE.Group(); g.position.set(x, 0.9, 0); pose.add(g); const m = spirit(legG, g); return g; }); B.own(legG);
      /* arms: upper arm from the shoulder, forearm from the elbow; the right forearm comes up to hold the lantern out */
      const upG = merged(rodGeo(0.055, 0.045, V(0, 0, 0), V(0, -0.29, 0), 10)); const foG = merged(rodGeo(0.045, 0.035, V(0, 0, 0), V(0, -0.25, 0), 10), ellip(0.035, 0.045, 0.03, 0, -0.28, 0, 0, 8));
      const arms = [1, -1].map((sx) => { const sh = new THREE.Group(); sh.position.set(sx * 0.22, 1.36, 0); pose.add(sh); spirit(upG, sh); const el = new THREE.Group(); el.position.y = -0.29; sh.add(el); spirit(foG, el); return { sh, el }; });
      const L = buildLantern(B, iron, 1.25); const swing = new THREE.Group(); swing.position.set(0, -0.3, 0); arms[0].el.add(swing); L.g.position.y = -0.36; swing.add(L.g);
      c.parts = { head, legs, arms, swing, lantern: L }; c.coreY = 1.12; c.height = 1.72; U.uTop.value = 1.6; U.uCoreK.value = 13;
    } else if (kind === 'animal') {
      /* the spirit dog is the same dog as in every other world (props/dog.js), drawn in the spirit light: a version made
         of ellipsoids and rods did not read as a dog */
      const D = buildDog((geo, parent) => spirit(geo, parent), { ears: 'up' }); pose.add(D.root);
      c.parts = { dog: D }; c.coreY = 0.58; c.height = 0.86; U.uTop.value = 0.86; U.uCoreK.value = 22;
    } else {
      /* a cause: a small standing flame in a hanging lantern, held by no one */
      const L = buildLantern(B, iron, 1.7); const swing = new THREE.Group(); swing.position.set(0, 1.0, 0); pose.add(swing); L.g.position.y = -0.43; swing.add(L.g);
      const linkG = B.own(new THREE.TorusGeometry(0.022, 0.006, 6, 12)); linkG.scale(1, 1.5, 1);
      const chain = new THREE.InstancedMesh(linkG, iron, 4); for (let k = 0; k < 4; k++) { _q.setFromEuler(_eul.set(0, k % 2 ? Math.PI / 2 : 0, 0)); _a.set(0, -0.0 + k * 0.05 - 0.02, 0); chain.setMatrixAt(k, _m.compose(_a, _q, _s.set(1, 1, 1))); } swing.add(chain);
      c.parts = { swing, lantern: L }; c.coreY = 0.7; c.height = 1.0;
      shadow.scale.setScalar(0.5); warmPool.scale.setScalar(0.8);
    }
    fold.position.y = c.coreY; pose.position.y = -c.coreY; c.poseY = -c.coreY;
    /* the captured light: hidden while the companion walks free */
    const capt = new THREE.Group(); capt.position.y = c.coreY; inner.add(capt); capt.visible = false;
    const gibMat = B.own(new THREE.MeshStandardMaterial({ color: 0x2c2622, metalness: 0.85, roughness: 0.5, envMapIntensity: 0.5, emissive: new THREE.Color(0xff6a24), emissiveIntensity: 0.25, transparent: true }));
    const gib = new THREE.Mesh(gibG, gibMat); gib.renderOrder = 12; capt.add(gib);
    const ember = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: sparkTex(), color: new THREE.Color(0xffd29a).multiplyScalar(2.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    ember.scale.setScalar(0.22); ember.renderOrder = 13; capt.add(ember);
    const emberHalo = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: softTex(), color: new THREE.Color(0xff8a3a).multiplyScalar(1.4), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    emberHalo.scale.setScalar(0.9); emberHalo.renderOrder = 13; capt.add(emberHalo);
    const thU = { uCol: { value: acc.clone().lerp(new THREE.Color(0xffc080), 0.55) }, uK: { value: 0 } };
    const thread = new THREE.Mesh(threadG, B.own(new THREE.ShaderMaterial({ uniforms: thU, vertexShader: PLAIN_VERT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      fragmentShader: 'uniform vec3 uCol; uniform float uK; varying vec2 vUv; void main(){ float a = smoothstep(0.0, 0.04, vUv.y) * pow(1.0 - vUv.y, 1.6) * uK; if (a < 0.003) discard; gl_FragColor = vec4(uCol * a, 1.0); }' })));
    thread.position.y = 0.38; thread.scale.set(1.6, 7, 1.6); thread.renderOrder = 12; thread.frustumCulled = false; capt.add(thread);
    c.capt = capt; c.gibMat = gibMat; c.ember = ember; c.emberHalo = emberHalo; c.thU = thU;
    /* the far light: when a companion is far away (held on the horizon) it still reads as a warm star */
    const far = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: softTex(), color: new THREE.Color(0xffb070).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    far.position.y = c.coreY; far.renderOrder = 13; object3D.add(far); c.far = far;
    /* the name: small serif, under the feet (free) or under the gibbet (taken, only near the middle of the view) */
    const lt = B.own(labelTex(name)); const label = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: lt, transparent: true, depthWrite: false, depthTest: false, fog: false })));
    label.scale.set(0.8, 0.175, 1); label.position.y = -0.03; label.center.set(0.5, 1); label.renderOrder = 30; object3D.add(label); c.label = label;
    c.setState = (s) => {
      if (s === c.state) return;
      if (s === 'return' || ((c.state === 'held' || c.state === 'boss' || c.state === 'taken') && (s === 'with' || s === 'hearth'))) { c.P.flare = 1; c.burst = 1; }
      c.state = s;
    };
    return c;
  });
  const MOTE = new THREE.Color(CS?.mote ?? 0xffb070).multiplyScalar(2.0); const MOTE_HOT = new THREE.Color(CS?.hot ?? 0xffd8a0).multiplyScalar(2.6); const MOTE_COLD = new THREE.Color(0x9ab0ff).multiplyScalar(1.4);
  const TARGET = {
    with: { power: 1, alpha: 0.92, cold: 0, sit: 0, cage: 0, label: 1, lean: 0, curl: 0 },
    hearth: { power: 1.1, alpha: 0.94, cold: 0, sit: 1, cage: 0, label: 1, lean: 0, curl: 0 },
    taken: { power: 0.9, alpha: 0.9, cold: 0.25, sit: 0, cage: 1, label: 1, lean: 1, curl: 0 },
    held: { power: 0.6, alpha: 0.8, cold: 0.5, sit: 0, cage: 1, label: 1, lean: 0, curl: 1 },
    boss: { power: 0.8, alpha: 0.85, cold: 0.35, sit: 0, cage: 1, label: 1, lean: 0, curl: 1 },
    return: { power: 1, alpha: 0.92, cold: 0, sit: 0, cage: 0, label: 1, lean: 0, curl: 0 },
  };
  let T = 0;
  return {
    list,
    update(dt, clock, cam) {
      if (cam) camera = cam; T += dt; if (camera) camera.updateMatrixWorld();
      for (const c of list) {
        c.t += dt; const t = c.t; const P = c.P; const tg = TARGET[c.state] || TARGET.with;
        /* motion from the position the fight gave us */
        if (c.first) { c.last.copy(c.position); c.first = false; }
        _a.subVectors(c.position, c.last); c.last.copy(c.position);
        if (dt > 0) c.vel.lerp(_b.copy(_a).divideScalar(Math.max(dt, 1e-3)), 1 - Math.exp(-dt * 8));
        const hs = Math.hypot(c.vel.x, c.vel.z); c.speed = damp(c.speed, Math.min(hs, 9), 6, dt);
        for (const k of Object.keys(tg)) P[k] = damp(P[k], tg[k], c.state === 'taken' ? 3.2 : 3, dt);
        c.still = c.speed < 0.25 ? (c.still || 0) + dt : 0;
        P.rest = damp(P.rest || 0, (c.state === 'with' || c.state === 'return' || c.state === 'hearth') && c.still > 0.8 ? 1 : 0, c.still > 0.8 ? 3 : 8, dt);
        let look = 0; if (c.toCam !== undefined && c.speed < 0.3) { let dd = c.toCam - c.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); look = clamp(dd, -1.1, 1.1); }
        P.flare = Math.max(0, P.flare - dt * 0.45);
        /* heading: along the motion; when still, toward the hero (the camera) */
        let want = c.yaw;
        if (c.speed > 0.3) want = Math.atan2(c.vel.x, c.vel.z) + (c.state === 'taken' ? Math.PI : 0);
        else if (camera) { camera.getWorldPosition(_c); c.toCam = Math.atan2(_c.x - c.position.x, _c.z - c.position.z); want = c.toCam + (c.kind === 'animal' ? (c.i % 2 ? 1.25 : -1.25) : c.kind === 'person' ? (c.i % 2 ? -0.5 : 0.5) : 0) + Math.sin(t * 0.3 + c.i) * 0.15; }
        let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * (1 - Math.exp(-dt * 4)); c.inner.rotation.y = c.yaw;
        /* look */
        const breath = 0.94 + 0.06 * Math.sin(t * 1.9 + c.i * 2);
        const cage = sstep(0.05, 0.95, P.cage); const free = 1 - cage;
        c.U.uTime.value = t; c.U.uPower.value = P.power * breath * (1 + P.flare * 1.2); c.U.uAlpha.value = P.alpha * sstep(0.0, 0.5, free); c.U.uCold.value = P.cold; c.U.uBaseY.value = c.position.y;
        c.fold.scale.setScalar(0.04 + 0.96 * sstep(0.0, 0.85, free)); c.fold.visible = free > 0.02;
        c.object3D.updateMatrixWorld(true); c.inner.localToWorld(c.U.uCoreW.value.set(0, c.coreY * (c.kind === 'person' ? 1 : 1) - P.sit * 0.35, c.kind === 'animal' ? 0.12 : 0.05));
        const camD = camera ? camera.getWorldPosition(_c).distanceTo(c.position) : 5;
        /* a companion under the lens is not drawn (the dog's legs showed as tan sausages over the HUD) */
        c.nearHide = !!camera && Math.hypot(_c.x - c.position.x, _c.z - c.position.z) < (c.kind === 'animal' ? 2.2 : 1.7); if (c.nearHide) c.fold.visible = false;
        c.far.material.opacity = sstep(14, 40, camD) * (0.5 + 0.5 * P.power) * 0.9 + P.flare * 0.3;
        c.far.scale.setScalar(Math.max(0.6, camD * 0.03) * (1 + P.flare * 1.5));
        /* the captured light */
        const ds = clamp(camD / 7, 1, 3);
        const shown = cage > 0.02 || c.burst > 0.01; c.capt.visible = shown;
        if (shown) {
          const pulse = 0.85 + 0.15 * Math.sin(t * 5.3 + c.i) + (c.state === 'taken' ? 0.12 * Math.sin(t * 23) : 0);
          let s = sstep(0.3, 1.0, cage) * ds; let k = 1;
          if (c.burst > 0) { c.burst = Math.max(0, c.burst - dt * 1.4); const e = 1 - c.burst; s = ds * (1 + e * 0.8); k = c.burst; }
          c.capt.scale.setScalar(Math.max(0.001, s));
          c.ember.material.opacity = k * pulse; c.emberHalo.material.opacity = 0.42 * k * pulse * (1 - P.cold * 0.4);
          c.gibMat.emissiveIntensity = 0.2 + 0.25 * pulse; c.gibMat.opacity = k;
          c.thU.uK.value = 0.55 * cage * k * (0.8 + 0.2 * Math.sin(t * 2.3 + c.i));
          c.capt.rotation.y = Math.sin(t * 0.6 + c.i) * 0.5; c.capt.rotation.z = Math.sin(t * 1.3 + c.i * 2) * 0.06;
        }
        /* the name: free = under the feet; taken = under the gibbet, only near the middle of the view */
        let lab = P.label * (1 - sstep(14, 22, camD)) * (c.nearHide ? 0 : 1);
        if (cage > 0.5) {
          let centre = 0; if (camera) { _d.set(0, c.coreY, 0); c.inner.localToWorld(_d); _d.project(camera); if (_d.z < 1) centre = 1 - sstep(0.18, 0.34, Math.hypot(_d.x, _d.y * 0.75)); }
          lab = centre * (1 - sstep(30, 45, camD)); c.label.position.y = c.coreY - 0.36 * ds;
        } else c.label.position.y = -0.03;
        c.label.material.opacity = damp(c.label.material.opacity, lab, 5, dt);
        { const k = clamp(camD / 5, 1, 2.6); c.label.scale.set(0.8 * k, 0.175 * k, 1); }
        c.shadow.material.opacity = 0.4 * (1 - sstep(0.3, 1.2, c.position.y)) * free;
        c.warmPool.material.uniforms.uK.value = (0.2 * P.power * free + cage * 0.08) * (1 - sstep(0.3, 1.5, c.position.y)) + P.flare * 0.3;
        /* motes: a slow drift always, a trail when moving, a stream when dragged */
        const rate = (4 + c.speed * 4 + (c.state === 'taken' ? 26 : 0) + P.flare * 60) * (c.state === 'held' ? 0.4 : 1);
        c.emit = (c.emit || 0) + dt * rate;
        while (c.emit >= 1) {
          c.emit -= 1; const a = Math.random() * TAU;
          if (cage > 0.5) {
            /* sparks shed from the gibbet: a short trail behind the dragged light */
            _e.set(0, c.coreY, 0); c.inner.localToWorld(_e); const rr = 0.12 * ds;
            motes.emit(_e.x + Math.cos(a) * rr, _e.y + (Math.random() - 0.5) * 0.3 * ds, _e.z + Math.sin(a) * rr, -c.vel.x * 0.25 + Math.cos(a) * 0.1, -0.2 - Math.random() * 0.4, -c.vel.z * 0.25 + Math.sin(a) * 0.1,
              P.cold > 0.45 ? MOTE_COLD : MOTE_HOT, 0.9 + Math.random() * 1.1, (0.03 + Math.random() * 0.03) * ds, 0.004, 0.9, 0.1, 0.4, false, 0.5);
          } else {
            const rr = (c.kind === 'animal' ? 0.12 : 0.18) + Math.random() * 0.14; const y = c.height * (0.05 + Math.random() * 0.85);
            motes.emit(c.position.x + Math.cos(a) * rr, c.position.y + y, c.position.z + Math.sin(a) * rr, -c.vel.x * 0.05 + Math.cos(a) * 0.06, 0.12 + Math.random() * 0.3, -c.vel.z * 0.05 + Math.sin(a) * 0.06,
              Math.random() < 0.3 ? MOTE_HOT : MOTE, 1.2 + Math.random() * 1.6, 0.022 + Math.random() * 0.022 + P.flare * 0.03, 0.004, 0.85, -0.04, 0.6, false, 0.4);
          }
        }
        if (!c.fold.visible) continue;
        /* pose and idle motion per kind */
        const sp = clamp(c.speed / 4.5, 0, 1); c.gait += dt * (2 + c.speed * 2.4);
        const lean = P.lean;
        if (c.kind === 'person') {
          const { head, legs, arms, swing, lantern } = c.parts;
          const ph = c.gait * 1.25; const stride = 0.55 * sp;
          const bob = Math.sin(t * 1.6 + c.i) * 0.008 + Math.abs(Math.sin(ph)) * 0.03 * sp;
          /* sitting by the fire: legs forward, the body lowered */
          c.pose.position.y = c.poseY + bob - P.sit * 0.44;
          c.pose.rotation.x = 0.03 + sp * 0.1 - lean * 0.3 - P.sit * 0.12; c.pose.rotation.z = Math.sin(ph) * 0.025 * sp + Math.sin(t * 0.7 + c.i) * 0.012 * (1 - sp);
          legs[0].rotation.x = -Math.sin(ph) * stride - P.sit * 1.45; legs[1].rotation.x = Math.sin(ph) * stride - P.sit * 1.35;
          legs[0].rotation.z = 0.02 + P.sit * 0.1; legs[1].rotation.z = -0.02 - P.sit * 0.1;
          /* left arm swings against the right leg; the right arm holds the lantern out and steady */
          arms[1].sh.rotation.x = -Math.sin(ph) * stride * -0.7 + Math.sin(t * 1.3 + c.i) * 0.03; arms[1].sh.rotation.z = -0.1; arms[1].el.rotation.x = -0.15 - sp * 0.25 - P.sit * 0.6;
          arms[0].sh.rotation.x = -0.25 - P.sit * 0.3; arms[0].sh.rotation.z = 0.12; arms[0].el.rotation.x = -0.95 + Math.sin(ph) * 0.05 * sp;
          head.rotation.x = 0.06 + Math.sin(t * 0.7 + c.i) * 0.04 - lean * 0.25 + P.sit * 0.1; head.rotation.y = look * 0.7 + Math.sin(t * 0.5 + c.i * 3) * 0.12 * (1 - sp);
          /* the lantern swings like a pendulum: pushed by acceleration, damped */
          c.sw = c.sw || { a: 0, v: 0, b: 0, w: 0 };
          const accl = -(c.speed - (c.prevSpeed || 0)) / Math.max(dt, 1e-3); c.prevSpeed = c.speed;
          c.sw.v += (-c.sw.a * 30 - c.sw.v * 2.5 + clamp(accl, -20, 20) * 0.04) * dt; c.sw.a += c.sw.v * dt;
          c.sw.w += (-c.sw.b * 30 - c.sw.w * 2.5) * dt + Math.sin(ph) * sp * 0.6 * dt; c.sw.b += c.sw.w * dt;
          swing.rotation.set(c.sw.a + 0.95 + 0.25 + Math.sin(t * 1.3 + c.i) * 0.03, 0, c.sw.b);
          lantern.FU.uTime.value = t; lantern.FU.uWind.value.set(-c.sw.b * 0.4, -c.sw.a * 0.4); lantern.FU.uPower.value = 1.6 * (P.power + P.flare);
          lantern.glow.material.opacity = 0.5 * P.power * breath + P.flare * 0.4;
        } else if (c.kind === 'animal') {
          /* one pose code for the dog (props/dog.js): it sits upright when it stops, lies like a sphinx by the fire */
          const rest = clamp(P.rest + P.sit, 0, 1); const lie = clamp(P.sit, 0, 1) * rest; const sit = rest - lie;
          poseDog(c.parts.dog, { t, speed: c.speed, sit, lie, wag: c.state === 'with' || c.state === 'hearth' || c.state === 'return' ? 1.2 : 0.2, alert: P.curl > 0.5 ? 'growl' : null, look }, dt);
        } else {
          const { swing, lantern } = c.parts;
          c.pose.position.y = c.poseY + Math.sin(t * 1.4 + c.i) * 0.03 - P.sit * 0.38;
          swing.rotation.set(Math.sin(t * 1.1 + c.i) * 0.08 + sp * 0.25, 0, Math.sin(t * 0.8 + c.i * 2) * 0.07);
          lantern.FU.uTime.value = t; lantern.FU.uPower.value = 1.7 * (P.power + P.flare * 1.5); lantern.FU.uH.value = 1 + P.flare * 0.8;
          lantern.glow.material.opacity = 0.6 * P.power * breath + P.flare * 0.5; lantern.glow.scale.setScalar(0.72 * (1 + P.flare));
        }
      }
      motes.update(dt);
    },
    dispose() { motes.dispose(); root.removeFromParent(); B.free(); },
  };
}

/* ================================================================ CHAPTER I ON THE OPEN LAND (web/src/journey.js)
   makeKindling(scene, { style })                           -> { group, update(dt), dispose() }
   makeCage(scene, { accent, style })                       -> { group, top, update(dt), open(), dispose() }   top = chain point, local
   makeMarker(scene, { name, accent, style, serif, cream }) -> { group, update(dt), carve(), dispose() }        the name is cut on carve()
   makeGate(scene, { accent, style })                       -> { group, width, update(dt), flare(), dispose() }
   style: the world's fire style (dark | brazier | barrel | campfire | bonfire); anything else builds the dark look. */
/* one material set per world look: wood, iron, cloth (the accent cloth is made per handle) */
function lookMats(B, style) {
  const bark = (tint) => B.own(new THREE.MeshStandardMaterial({ map: groundTex('bark_brown_02_diff.jpg', true), normalMap: groundTex('bark_brown_02_nor.jpg', false), color: tint, roughness: 0.92, envMapIntensity: 0.15 }));
  const plain = (color, metal = 0, rough = 0.8, extra = {}) => B.own(new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, envMapIntensity: metal ? 0.7 : 0.2, ...extra }));
  if (style === 'brazier') return { wood: plain(0x9a2a18, 0, 0.6), dark: plain(0x15110f, 0, 0.7), iron: B.own(ironMat(0x26201c)), stone: B.own(stoneMat(0x9a958c)), stick: plain(0x1c1714, 0, 0.95), rope: plain(0xb59a62, 0, 0.95), kind: 'edo' };
  if (style === 'barrel') return { wood: plain(0x3a3f46, 0.85, 0.4), dark: plain(0x1a1c20, 0.8, 0.45), iron: plain(0x2a2e34, 0.85, 0.4), stone: plain(0x2a2c30, 0.3, 0.7), stick: plain(0x6a5a44, 0, 0.85), rope: plain(0x8a8f96, 0.9, 0.35), kind: 'neon' };
  if (style === 'campfire') return { wood: bark(0x8a7058), dark: bark(0x5a4836), iron: B.own(ironMat(0x2a2622)), stone: B.own(stoneMat(0xa08a74)), stick: bark(0x7a6450), rope: plain(0x9a7a52, 0, 0.95), kind: 'frontier' };
  if (style === 'bonfire') return { wood: plain(0x8a5a34, 0, 0.7), dark: plain(0x4a2e1c, 0, 0.75), iron: plain(0x8a7a52, 0.8, 0.35), stone: B.own(stoneMat(0xb8b2a6)), stick: plain(0x9a7048, 0, 0.85), rope: plain(0xc8a060, 0, 0.9), kind: 'storybook' };
  return { wood: bark(0x6a5a48), dark: bark(0x3a3028), iron: B.own(ironMat(0x2b2826)), stone: B.own(stoneMat(0x7a7670)), stick: bark(0x6e5c48), rope: plain(0x5a2a1e, 0, 0.95), kind: 'dark' };
}
function addMesh(parent, B, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(B.own(geo), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }

/* kindling: a bundle of sticks tied in two places (neon: broken crate slats bound with wire; edo: charcoal sticks in straw rope) */
export function makeKindling(scene, { style = 'dark' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const M = lookMats(B, style); const r = seeded(77);
  const body = new THREE.Group(); body.rotation.set(0, r() * TAU, Math.PI / 2 - 0.12); body.position.y = 0.12; group.add(body);
  const slats = M.kind === 'neon';
  for (let i = 0; i < (slats ? 4 : 8); i++) {
    const a = (i / (slats ? 4 : 8)) * TAU; const rr = slats ? 0.05 : 0.055 + r() * 0.02; const len = 0.62 + r() * 0.2;
    const g = slats ? new THREE.BoxGeometry(0.07, len, 0.018) : new THREE.CylinderGeometry(0.018 + r() * 0.01, 0.022 + r() * 0.01, len, 6);
    const m = addMesh(body, B, g, M.stick, Math.cos(a) * rr, (r() - 0.5) * 0.08, Math.sin(a) * rr); m.rotation.set((r() - 0.5) * 0.08, slats ? a : r() * TAU, (r() - 0.5) * 0.08);
  }
  for (const y of [-0.17, 0.17]) addMesh(body, B, new THREE.TorusGeometry(slats ? 0.075 : 0.085, slats ? 0.006 : 0.012, 5, 16).rotateX(Math.PI / 2), M.rope, 0, y, 0);
  return { group, update() {}, dispose() { group.removeFromParent(); B.free(); } };
}

/* the cage: a ring of bars that close into a dome over a stone floor, a door of three bars and a lock that glows */
export function makeCage(scene, { accent = 0xff4a12, style = 'dark' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const M = lookMats(B, style);
  const R = 0.95; const H = 2.25; const NB = 14; const bar = M.kind === 'edo' || M.kind === 'frontier' || M.kind === 'storybook' ? M.wood : M.iron; const th = bar === M.iron ? 0.024 : 0.04;
  addMesh(group, B, new THREE.CylinderGeometry(R + 0.22, R + 0.32, 0.22, 18), M.stone, 0, 0.06, 0);
  const barPath = (a, k0 = 0) => { const pts = []; for (let k = 0; k <= 10; k++) { const u = k / 10; const y = 0.16 + u * H; const rr = u < 0.72 ? R : R * Math.cos(((u - 0.72) / 0.28) * Math.PI / 2 * 0.92); pts.push(V(Math.cos(a) * rr, y, Math.sin(a) * rr)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, th, 5, false); };
  const door = new THREE.Group(); const DA = -Math.PI / 2; /* the door faces -z of the group; the journey turns the group toward the hero */
  const hinge = new THREE.Group(); hinge.position.set(Math.cos(DA - 0.5) * R, 0, Math.sin(DA - 0.5) * R); group.add(hinge); hinge.add(door); door.position.copy(hinge.position).negate();
  const fixed = [];
  for (let i = 0; i < NB; i++) { const a = (i / NB) * TAU + DA; const inDoor = Math.abs(Math.atan2(Math.sin(a - DA), Math.cos(a - DA))) < 0.4; const g = barPath(a); if (inDoor) { const p = g.attributes.position; for (let k = 0; k < p.count; k++) if (p.getY(k) > 0.16 + 0.7 * H) p.setY(k, 0.16 + 0.7 * H); door.add(new THREE.Mesh(B.own(g), bar)); } else fixed.push(g); }
  for (const y of [0.2, 0.95, 1.75]) fixed.push(new THREE.TorusGeometry(R, th * 1.3, 5, 40).rotateX(Math.PI / 2).translate(0, y, 0));
  const ring = merged(...fixed); addMesh(group, B, ring, bar);
  addMesh(group, B, new THREE.TorusGeometry(0.09, 0.022, 6, 14), M.iron, 0, H + 0.2, 0);
  if (M.kind === 'edo') for (const y of [0.95, 1.75]) for (let i = 0; i < NB; i += 2) { const a = (i / NB) * TAU + DA; addMesh(group, B, new THREE.TorusGeometry(0.05, 0.012, 4, 8), M.rope, Math.cos(a) * R, y, Math.sin(a) * R); }
  door.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  /* the lock: a heavy padlock on the door, its keyhole glowing in the accent colour */
  const lock = new THREE.Group(); lock.position.set(Math.cos(DA) * (R + 0.05), 1.0, Math.sin(DA) * (R + 0.05)); door.add(lock);
  addMesh(lock, B, new THREE.BoxGeometry(0.2, 0.2, 0.08), M.iron); addMesh(lock, B, new THREE.TorusGeometry(0.065, 0.016, 6, 14, Math.PI), M.iron, 0, 0.1, 0);
  const glowMat = B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const key = new THREE.Mesh(B.own(new THREE.CircleGeometry(0.03, 10)), glowMat); key.position.z = -0.045; key.rotation.y = Math.PI; lock.add(key);
  const halo = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: softTex(), color: new THREE.Color(accent).multiplyScalar(1.4), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); halo.scale.setScalar(0.6); lock.add(halo);
  const S = { t: 0, open: -1, fall: 0, fv: 0 };
  return {
    group, top: V(0, H + 0.2, 0),
    update(dt) {
      S.t += dt; const o = S.open >= 0 ? S.t - S.open : -1;
      glowMat.opacity = o >= 0 ? Math.max(0, 1 - o * 2) : 0.75 + 0.25 * Math.sin(S.t * 3.1); halo.material.opacity = glowMat.opacity * 0.5;
      if (o >= 0) { hinge.rotation.y = -sstep(0.15, 1.3, o) * 1.75; S.fv -= 9.8 * dt; S.fall = Math.max(-0.9, S.fall + S.fv * dt); lock.position.y = 1.0 + S.fall; lock.rotation.z = Math.min(1.4, o * 3); }
    },
    open() { if (S.open < 0) { S.open = S.t; S.fv = 1.2; } return 1.4; },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

/* a marker by the road: a standing stone (dark), a post with a board (edo, frontier, storybook) or a steel slab (neon).
   carve() cuts the name into it from left to right, a bright line at the cut, then the letters keep a faint glow. */
const MARK_FRAG = `uniform sampler2D uMap; uniform float uCarve; uniform vec3 uGroove; uniform vec3 uGlow; uniform float uNeon; varying vec2 vUv;
void main(){ float a = texture2D(uMap, vUv).a; float cut = smoothstep(uCarve, uCarve - 0.03, vUv.x); float edge = smoothstep(0.06, 0.0, abs(vUv.x - uCarve)) * step(0.001, uCarve) * step(uCarve, 0.999);
  vec3 c = mix(uGroove, uGlow, uNeon) + uGlow * (edge * 2.5 + 0.18 * (1.0 - uNeon)); float al = a * cut + a * edge * 0.6; if (al < 0.01) discard; gl_FragColor = vec4(c, al); }`;
export function makeMarker(scene, { name = '', accent = 0xffc27a, style = 'dark', serif = SERIF, cream = '#f3e3c4' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const M = lookMats(B, style); const r = seeded(String(name).length * 131 + 7);
  const neon = M.kind === 'neon'; const post = M.kind === 'edo' || M.kind === 'frontier' || M.kind === 'storybook';
  let faceW = 0.9; let faceH = 0.42; let faceY = 1.05; let faceZ = 0.2;
  if (post) {
    addMesh(group, B, new THREE.BoxGeometry(0.16, 2.1, 0.16), M.dark, 0, 1.05, -0.06);
    addMesh(group, B, new THREE.BoxGeometry(1.15, 0.5, 0.06), M.kind === 'edo' ? B.own(new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.85 })) : M.wood, 0, 1.45, 0.06);
    if (M.kind === 'edo') addMesh(group, B, new THREE.BoxGeometry(1.35, 0.06, 0.14), M.dark, 0, 1.73, 0.03);
    faceW = 1.0; faceH = 0.4; faceY = 1.45; faceZ = 0.095;
  } else {
    const g = new THREE.BoxGeometry(0.95, 1.7, 0.34, 6, 10, 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i); let y = p.getY(i) + 0.85; const z = p.getZ(i); const t = y / 1.7; x *= 1 - 0.18 * t * t; if (t > 0.86) y -= (t - 0.86) * Math.abs(x) * 1.6; const front = z > 0.16 && Math.abs(x) < 0.4 && t > 0.15 && t < 0.85; const amp = front ? 0.004 : 0.045; p.setXYZ(i, x + Math.sin(y * 9 + z * 5) * amp, y - 0.08, z + Math.sin(x * 7 + y * 4) * amp * (front ? 0.3 : 1)); }
    g.computeVertexNormals(); const st = addMesh(group, B, g, neon ? M.iron : M.stone); st.rotation.z = (r() - 0.5) * 0.06;
    if (neon) addMesh(group, B, new THREE.BoxGeometry(0.97, 0.03, 0.36), B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.8) })), 0, 0.1, 0);
    faceW = 0.78; faceH = 0.36; faceY = 1.0; faceZ = 0.175;
  }
  /* the name canvas: the alpha holds the letters */
  const c = document.createElement('canvas'); c.width = 512; c.height = 192; const g2 = c.getContext('2d'); const text = String(name).slice(0, 18).toUpperCase();
  let fs = 108; g2.font = `600 ${fs}px ${serif}`; while (g2.measureText(text).width > 470 && fs > 40) { fs -= 4; g2.font = `600 ${fs}px ${serif}`; }
  g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillStyle = '#fff'; g2.fillText(text, 256, 100);
  const tex = B.own(new THREE.CanvasTexture(c)); tex.anisotropy = 4;
  const U = { uMap: { value: tex }, uCarve: { value: 0 }, uGroove: { value: new THREE.Color(post ? 0x1a0e08 : 0x0c0907) }, uGlow: { value: new THREE.Color(accent).lerp(new THREE.Color(cream), neon ? 0.15 : 0.55).multiplyScalar(neon ? 2.2 : 1) }, uNeon: { value: neon ? 1 : 0 } };
  const face = new THREE.Mesh(B.own(new THREE.PlaneGeometry(faceW, faceH)), B.own(new THREE.ShaderMaterial({ uniforms: U, vertexShader: PLAIN_VERT, fragmentShader: MARK_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, blending: neon ? THREE.AdditiveBlending : THREE.NormalBlending })));
  face.position.set(0, faceY, faceZ); face.renderOrder = 3; group.add(face);
  const spark = new THREE.Sprite(B.own(new THREE.SpriteMaterial({ map: sparkTex(), color: new THREE.Color(0xfff0c8).multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); spark.scale.setScalar(0.22); group.add(spark);
  const S = { t: 0, carve: -1 };
  return {
    group,
    update(dt) {
      S.t += dt; if (S.carve < 0) return; const k = clamp((S.t - S.carve) / 1.5, 0, 1); U.uCarve.value = 0.08 + k * 0.86 + (k >= 1 ? 0.2 : 0);
      spark.material.opacity = k > 0 && k < 1 ? 0.6 + 0.4 * Math.sin(S.t * 40) : 0; spark.position.set((U.uCarve.value - 0.5) * faceW, faceY + Math.sin(S.t * 33) * faceH * 0.25, faceZ + 0.03);
    },
    carve() { if (S.carve < 0) S.carve = S.t; return 1.6; },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

/* a war banner for the dark world: heavy oxblood wool with a woven weave, fold shading, a tarnished sigil (a ring
   and a downward blade) and a torn, frayed lower edge with holes, in the alpha. The flat accent rectangles it replaces
   read as untextured placeholders. */
const clothTex = () => canvasTex('warCloth', 128, 320, (g, w, h) => {
  const r = seeded(211); g.clearRect(0, 0, w, h);
  g.fillStyle = '#3e1410'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`; g.fillRect(0, y, w, 1); }
  for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,220,200,${0.015 + r() * 0.03})`; g.fillRect(x, 0, 1, h); }
  for (let i = 0; i < 5; i++) { const x = (i + 0.5) / 5 * w + (r() - 0.5) * 8; const gr = g.createLinearGradient(x - 14, 0, x + 14, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 14, 0, 28, h); }
  { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,6,4,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  /* the sigil: a ring over a downward blade, gold thread gone dark */
  g.strokeStyle = '#8a6a2e'; g.fillStyle = '#8a6a2e'; g.lineWidth = 6; const cx = w / 2; const cy = h * 0.34;
  g.beginPath(); g.arc(cx, cy, 30, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 22, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(cx - 5, cy - 46); g.lineTo(cx + 5, cy - 46); g.lineTo(cx + 4, cy + 40); g.lineTo(cx, cy + 56); g.lineTo(cx - 4, cy + 40); g.closePath(); g.fill();
  g.fillRect(cx - 18, cy - 40, 36, 6);
  /* the border: a dark band near the top and the sides */
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, w, 10); g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
  g.fillStyle = 'rgba(138,106,46,0.6)'; g.fillRect(0, 14, w, 3);
  /* tears: a ragged hem cut into tongues, frayed side edges, a few holes (alpha) */
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, h); let x = 0; while (x < w) { const tw = 10 + r() * 22; const y0 = h * (0.66 + r() * 0.26); g.lineTo(x + tw * 0.5, y0); g.lineTo(x + tw, h * (0.84 + r() * 0.16)); x += tw; } g.lineTo(w, h); g.closePath(); g.fill();
  for (let y = 0; y < h; y += 3) { if (r() < 0.35) g.fillRect(0, y, 1 + r() * 4, 2); if (r() < 0.35) g.fillRect(w - 1 - r() * 4, y, 5, 2); }
  for (let i = 0; i < 6; i++) { const hx = 12 + r() * (w - 24); const hy = h * (0.45 + r() * 0.3); g.beginPath(); g.ellipse(hx, hy, 3 + r() * 7, 4 + r() * 10, r() * 3, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
});
/* the sigil alone, for a faint glow in the world accent */
const clothGlowTex = () => canvasTex('warClothGlow', 128, 320, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; const cx = w / 2; const cy = h * 0.34;
  g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 30, 0, TAU); g.stroke(); g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 22, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(cx - 2, cy - 44); g.lineTo(cx + 2, cy - 44); g.lineTo(cx, cy + 52); g.closePath(); g.fill();
});
/* a war-banner material (dark world): the cloth texture, a faint accent glow on the sigil, cut-out tears, and wind
   (vertex sway that grows toward the free edge; needs a plane with some segments). uTime is in mat.userData.time. */
function warClothMaterial(accent) {
  const mat = new THREE.MeshStandardMaterial({ map: clothTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, envMapIntensity: 0.15,
    emissive: new THREE.Color(accent), emissiveMap: clothGlowTex(), emissiveIntensity: 0.35 });
  const U = { uTime: { value: 0 } }; mat.userData.time = U.uTime;
  mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = 0.0;
      #ifdef USE_INSTANCING
      ph = instanceMatrix[3][0] * 0.61 + instanceMatrix[3][2] * 0.37;
      #endif
      float kf = 1.0 - uv.y; transformed.z += (sin(uTime * 1.9 + kf * 3.2 + uv.x * 2.0 + ph) * 0.09 + sin(uTime * 3.7 + kf * 6.0 + ph) * 0.03) * kf;`); };
  mat.customProgramCacheKey = () => 'sq-warcloth';
  return mat;
}
/* road banners for the journey: { geometry, material, update(dt) }. The cloth hangs from y 3.1 to 1.8 on a
   3.2 m pole, offset 0.3 m to the side, as the old flat plane did. Dark world only; other worlds keep their own. */
export function roadCloth({ accent = 0xff4a12 } = {}) {
  const geometry = new THREE.PlaneGeometry(0.62, 1.45, 3, 8); geometry.translate(0.32, 2.4, 0);
  const material = warClothMaterial(accent); let t = Math.random() * 10;
  return { geometry, material, update(dt) { t += dt; material.userData.time.value = t; }, dispose() { geometry.dispose(); material.dispose(); } };
}
/* the portal veil between the gate's pillars (dark world): a cold curtain of light that streams upward, brighter at
   the foot, with soft sides, in place of a flat accent plane. uK: strength (flare lifts it). */
const VEIL_FRAG = `uniform float uTime; uniform float uK; uniform vec3 uCol; varying vec2 vUv;
float vh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(vh(i), vh(i + vec2(1, 0)), f.x), mix(vh(i + vec2(0, 1)), vh(i + vec2(1, 1)), f.x), f.y); }
void main(){ float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x); float top = smoothstep(1.0, 0.7, vUv.y);
  float streak = vn(vec2(vUv.x * 14.0, vUv.y * 2.0 - uTime * 0.6)) * 0.6 + vn(vec2(vUv.x * 33.0, vUv.y * 5.0 - uTime * 1.3)) * 0.4;
  float ripple = vn(vec2(vUv.x * 4.0 + uTime * 0.2, vUv.y * 3.0 - uTime * 0.35));
  float a = side * top * (0.25 + 0.75 * smoothstep(0.35, 0.9, streak)) * (0.45 + 0.55 * ripple) * mix(1.0, 0.45, vUv.y) * uK;
  float core = side * top * smoothstep(0.7, 0.95, streak) * 0.6;
  gl_FragColor = vec4(uCol * (a + core * uK), 1.0); }`;

/* the gate at the end of the road: two pillars and a lintel (dark stone; edo vermilion torii; neon steel frame with light;
   frontier timber ranch gate; storybook painted arch), a cloth in the accent colour that hangs from the beam */
export function makeGate(scene, { accent = 0xc8861a, style = 'dark' } = {}) {
  const B = bag(); const group = new THREE.Group(); scene.add(group); const M = lookMats(B, style); const W = 2.6; const H = 5.4;
  const cloth = B.own(new THREE.MeshStandardMaterial({ color: new THREE.Color(accent).multiplyScalar(0.55), roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color(accent), emissiveIntensity: 0.12 }));
  if (M.kind === 'edo') {
    const ver = B.own(new THREE.MeshStandardMaterial({ color: 0xb8301c, roughness: 0.55, envMapIntensity: 0.4 }));
    for (const x of [-W, W]) { const p = addMesh(group, B, new THREE.CylinderGeometry(0.2, 0.24, H, 14), ver, x, H / 2, 0); p.rotation.z = x > 0 ? 0.03 : -0.03; addMesh(group, B, new THREE.CylinderGeometry(0.28, 0.28, 0.4, 14), M.dark, x, 0.2, 0); }
    addMesh(group, B, new THREE.BoxGeometry(W * 2 + 0.7, 0.24, 0.3), ver, 0, H - 0.9, 0);
    const top = new THREE.BoxGeometry(W * 2 + 2.2, 0.3, 0.42, 12, 1, 1); { const p = top.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + (x / (W + 1.1)) ** 2 * 0.35); } top.computeVertexNormals(); }
    addMesh(group, B, top, M.dark, 0, H + 0.05, 0);
  } else if (M.kind === 'neon') {
    for (const x of [-W, W]) { addMesh(group, B, new THREE.BoxGeometry(0.34, H, 0.34), M.iron, x, H / 2, 0); addMesh(group, B, new THREE.BoxGeometry(0.05, H - 0.6, 0.36), B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2.2) })), x + (x > 0 ? -0.18 : 0.18), H / 2, 0); }
    addMesh(group, B, new THREE.BoxGeometry(W * 2 + 0.6, 0.5, 0.4), M.iron, 0, H, 0);
    addMesh(group, B, new THREE.BoxGeometry(W * 2 - 0.4, 0.06, 0.42), B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2.6) })), 0, H - 0.28, 0);
  } else if (M.kind === 'frontier' || M.kind === 'storybook') {
    for (const x of [-W, W]) addMesh(group, B, new THREE.CylinderGeometry(0.2, 0.24, H, 10), M.wood, x, H / 2, 0);
    addMesh(group, B, new THREE.CylinderGeometry(0.17, 0.17, W * 2 + 0.9, 10).rotateZ(Math.PI / 2), M.wood, 0, H - 0.25, 0);
    addMesh(group, B, new THREE.BoxGeometry(2.6, 0.62, 0.08), M.dark, 0, H - 0.85, 0.12);
    if (M.kind === 'storybook') for (const x of [-W, W]) addMesh(group, B, new THREE.ConeGeometry(0.34, 0.6, 10), B.own(new THREE.MeshStandardMaterial({ color: 0x3a5aa0, roughness: 0.6 })), x, H + 0.3, 0);
  } else {
    for (const x of [-W, W]) { const g = rockGeo(91 + Math.round(x)); g.scale(0.55, H / 2, 0.55); const p = addMesh(group, B, g, M.stone, x, H / 2 - 0.15, 0); p.rotation.y = x; }
    const lint = rockGeo(97); lint.scale(W + 1.1, 0.38, 0.6); addMesh(group, B, lint, M.stone, 0, H + 0.15, 0);
  }
  /* the cloth: hangs from the beam, moves a little in the wind */
  const dark = M.kind === 'dark';
  const cg = new THREE.PlaneGeometry(1.5, 2.6, 4, 10); cg.translate(0, -1.3, 0); const cl = addMesh(group, B, cg, cloth, 0, H - (M.kind === 'edo' ? 1.05 : 0.3), 0.05); cl.castShadow = false;
  /* dark: no flat accent sheet in the doorway. Two torn war banners hang inside the pillars and a veil of cold
     light fills the opening between them. */
  let veilU = null; let warMat = null;
  if (dark) {
    cl.visible = false;
    warMat = B.own(warClothMaterial(accent));
    for (const sx of [-1, 1]) { const g = new THREE.PlaneGeometry(1.0, 2.6, 3, 10); g.translate(0, -1.3, 0); const b = addMesh(group, B, g, warMat, sx * (W - 0.95), H - 0.15, 0.32); b.rotation.y = sx * 0.12; }
    veilU = { uTime: { value: 0 }, uK: { value: 0.55 }, uCol: { value: new THREE.Color(accent).lerp(new THREE.Color(0xdfe8ff), 0.35).multiplyScalar(1.3) } };
    const veil = new THREE.Mesh(B.own(new THREE.PlaneGeometry(W * 2 - 0.9, H - 0.3)), B.own(new THREE.ShaderMaterial({ uniforms: veilU, vertexShader: PLAIN_VERT, fragmentShader: VEIL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })));
    veil.position.set(0, (H - 0.3) / 2, 0); veil.renderOrder = 4; group.add(veil);
  }
  const base = cg.attributes.position.array.slice(); const S = { t: 0, flare: 0 };
  return {
    group, width: W,
    update(dt) {
      S.t += dt; S.flare = Math.max(0, S.flare - dt * 0.5); cloth.emissiveIntensity = 0.12 + S.flare * 0.8;
      if (veilU) { veilU.uTime.value = S.t; veilU.uK.value = 0.55 + S.flare * 1.2; warMat.userData.time.value = S.t; warMat.emissiveIntensity = 0.35 + S.flare; }
      const p = cg.attributes.position; for (let i = 0; i < p.count; i++) { const y = base[i * 3 + 1]; const x = base[i * 3]; p.array[i * 3 + 2] = Math.sin(S.t * 1.7 + y * 1.6 + x) * 0.06 * -y; } p.needsUpdate = true;
    },
    flare() { S.flare = 1; return 1.2; },
    dispose() { group.removeFromParent(); B.free(); },
  };
}

/* the gate stood alone in an empty field, with nothing behind it but fog. Walls run
   out from both posts and a keep stands past the gate, in the world's own look, so the gate holds something.
   makeGateWalls({ style, width, accent }) -> { group, solids: [{ x, z, r }] (local: x across the road, z along it), dispose() }
   The group is added to the gate's group (local +z = the far side of the gate). */
export function makeGateWalls({ style = 'dark', width = 2.6, accent = 0xc8861a } = {}) {
  const B = bag(); const group = new THREE.Group(); const M = lookMats(B, style); const W = width;
  const plain = (color, extra = {}) => B.own(new THREE.MeshStandardMaterial({ color, roughness: 0.85, envMapIntensity: 0.25, ...extra }));
  const solids = []; const r = seeded(77);
  const run = (fn) => { for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { const x0 = s * (W + 0.45 + k * 2.6 + 1.3); fn(x0, s, k); solids.push({ x: x0 - 0.65, z: 0, r: 0.8 }, { x: x0 + 0.65, z: 0, r: 0.8 }); } };
  const box = (w, h, d, mat, x, y, z, ry = 0) => { const m = addMesh(group, B, new THREE.BoxGeometry(w, h, d), mat, x, y, z); m.rotation.y = ry; return m; };
  if (M.kind === 'storybook') {
    const stone = plain(0xd8cdb4); const cap = plain(0xb8ab90); const roof = plain(0x3a5aa0, { roughness: 0.6 });
    run((x) => { box(2.62, 2.6, 0.7, stone, x, 1.3, 0); box(2.7, 0.18, 0.8, cap, x, 2.66, 0); for (const dx of [-0.85, 0, 0.85]) box(0.5, 0.42, 0.72, stone, x + dx, 2.96, 0); });
    for (const s of [-1, 1]) { addMesh(group, B, new THREE.CylinderGeometry(1.1, 1.2, 4.6, 16), stone, s * (W + 14.6), 2.3, 0); addMesh(group, B, new THREE.ConeGeometry(1.45, 2.0, 16), roof, s * (W + 14.6), 5.6, 0); }
    /* the keep past the gate: a round tower with a blue cone and a pennant */
    addMesh(group, B, new THREE.CylinderGeometry(2.4, 2.6, 9, 20), stone, 1.5, 4.5, 12); addMesh(group, B, new THREE.ConeGeometry(3.0, 4.2, 20), roof, 1.5, 11.1, 12);
    box(5.5, 5.5, 4.5, stone, -4.5, 2.75, 14); addMesh(group, B, new THREE.ConeGeometry(3.6, 2.6, 4), roof, -4.5, 6.8, 14).rotation.y = Math.PI / 4;
  } else if (M.kind === 'edo') {
    const plaster = plain(0xece6d8); const base = M.stone; const tile = plain(0x2a2c30, { roughness: 0.6 });
    run((x) => { box(2.62, 0.9, 0.9, base, x, 0.45, 0); box(2.62, 1.6, 0.55, plaster, x, 1.7, 0); box(2.8, 0.22, 1.1, tile, x, 2.6, 0); });
    box(7, 4, 5, plaster, 0, 3.0, 13); box(8.6, 0.4, 6.6, tile, 0, 5.2, 13); box(5, 2.4, 3.6, plaster, 0, 6.6, 13); box(6.4, 0.35, 5.0, tile, 0, 7.9, 13); box(7.6, 1.0, 5.6, base, 0, 0.5, 13);
  } else if (M.kind === 'neon') {
    const conc = plain(0x5a5e66, { roughness: 0.9 }); const band = B.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2.0) })); const mesh = plain(0x2a2e34, { metalness: 0.8, roughness: 0.4 });
    run((x, s, k) => { box(2.5, 1.1, 0.8, conc, x, 0.55, 0); box(2.5, 0.07, 0.82, band, x, 0.9, 0); box(0.08, 2.0, 0.08, mesh, x - 1.2, 2.1, 0); box(2.5, 1.8, 0.03, mesh, x, 2.0, 0); if (k === 2) box(0.4, 0.4, 0.84, band, x, 0.5, 0); });
    box(6, 16, 6, plain(0x24272d, { metalness: 0.4, roughness: 0.6 }), 0, 8, 15); for (let i = 0; i < 6; i++) box(6.05, 0.12, 6.05, band, 0, 2 + i * 2.4, 15);
  } else if (M.kind === 'frontier') {
    const wood = M.wood;
    run((x) => { for (let j = 0; j < 6; j++) { const h = 2.9 + r() * 0.5; const xx = x - 1.1 + j * 0.44; addMesh(group, B, new THREE.CylinderGeometry(0.21, 0.23, h, 7), wood, xx, h / 2, 0); addMesh(group, B, new THREE.ConeGeometry(0.21, 0.38, 7), wood, xx, h + 0.19, 0); } addMesh(group, B, new THREE.BoxGeometry(2.6, 0.16, 0.12), M.dark, x, 2.1, -0.24); });
    /*a real lookout. Splayed hewn legs with X braces at two levels, a plank deck, a slat breastwork, corner posts, a
       gabled shake roof with a ridge board, a ladder on the hero's side and a lit lantern under the eaves. */
    { const TX = 3; const TZ = 11; const RODS = []; const D2 = [];
      const leg = (x0, z0, x1, z1, y0, y1, r) => RODS.push(rodGeo(r, r * 0.85, V(TX + x0, y0, TZ + z0), V(TX + x1, y1, TZ + z1), 7));
      const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of C4) leg(sx * 1.55, sz * 1.55, sx * 1.15, sz * 1.15, 0, 6.5, 0.16);
      for (let f = 0; f < 4; f++) { const a = C4[f]; const b = C4[(f + 1) % 4];
        for (const [y0, y1] of [[0.5, 3.3], [3.3, 6.2]]) { const w0 = 1.55 - (y0 / 6.5) * 0.4; const w1 = 1.55 - (y1 / 6.5) * 0.4;
          leg(a[0] * w0, a[1] * w0, b[0] * w1, b[1] * w1, y0, y1, 0.055); leg(b[0] * w0, b[1] * w0, a[0] * w1, a[1] * w1, y0, y1, 0.055); }
        const w = 1.55 - (3.3 / 6.5) * 0.4; leg(a[0] * w, a[1] * w, b[0] * w, b[1] * w, 3.3, 3.3, 0.07); }
      /* the deck, its joists showing past the edge */
      D2.push(xfq(new THREE.BoxGeometry(3.0, 0.16, 3.0), TX, 6.55, TZ)); for (const o of [-1.1, 0, 1.1]) D2.push(xfq(new THREE.BoxGeometry(3.3, 0.12, 0.14), TX, 6.42, TZ + o));
      /* the breastwork: vertical slats with gaps, a top rail; the front (hero side) has a gap for the ladder */
      for (let f = 0; f < 4; f++) for (let k = 0; k < 9; k++) { const o = -1.36 + k * 0.34; if (f === 0 && Math.abs(o) < 0.3) continue; const h = 1.05 + ((k * 7 + f * 3) % 5) * 0.025;
        const x = [o, 1.42, -o, -1.42][f]; const z = [-1.42, o, 1.42, -o][f]; D2.push(xfq(new THREE.BoxGeometry(f % 2 ? 0.06 : 0.26, h, f % 2 ? 0.26 : 0.06), TX + x, 6.63 + h / 2, TZ + z)); }
      for (let f = 0; f < 4; f++) D2.push(xfq(new THREE.BoxGeometry(f % 2 ? 0.1 : 3.0, 0.09, f % 2 ? 3.0 : 0.1), TX + [0, 1.45, 0, -1.45][f], 7.72, TZ + [-1.45, 0, 1.45, 0][f]));
      for (const [sx, sz] of C4) leg(sx * 1.4, sz * 1.4, sx * 1.4, sz * 1.4, 6.6, 8.75, 0.07);
      /* the ladder up the hero's side */
      for (const o of [-0.26, 0.26]) leg(o, -2.45, o, -1.5, 0, 6.6, 0.04);
      for (let y = 0.35; y < 6.5; y += 0.38) { const z = -2.45 + (y / 6.6) * 0.95; RODS.push(rodGeo(0.025, 0.025, V(TX - 0.27, y, TZ + z), V(TX + 0.27, y, TZ + z), 5)); }
      addMesh(group, B, mergeQ(RODS), wood, 0, 0, 0); addMesh(group, B, mergeQ(D2), wood, 0, 0, 0);
      /* the gabled roof: two shake panels, a ridge board, eave boards */
      const roof = []; for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(3.7, 0.08, 1.95); g.rotateX(s * 0.52); g.translate(TX, 9.15, TZ + s * 0.84); roof.push(g);
        for (let k = 0; k < 6; k++) { const g2 = new THREE.BoxGeometry(3.72, 0.05, 0.08); g2.translate(0, 0.06, -0.85 + k * 0.33); g2.rotateX(s * 0.52); g2.translate(TX, 9.15, TZ + s * 0.84); roof.push(g2); } }
      roof.push(xfq(new THREE.BoxGeometry(3.85, 0.14, 0.14), TX, 9.62, TZ)); for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.06, 0.9, 0.06); g.translate(TX + sx * 1.86, 9.2, TZ); roof.push(g); }
      addMesh(group, B, mergeQ(roof), M.dark, 0, 0, 0);
      const lampM = B.own(new THREE.MeshStandardMaterial({ color: 0x3a2814, emissive: 0xff9a40, emissiveIntensity: 1.1, roughness: 0.4 }));
      addMesh(group, B, new THREE.CylinderGeometry(0.09, 0.11, 0.26, 8), lampM, TX - 0.9, 8.15, TZ - 1.5); addMesh(group, B, new THREE.ConeGeometry(0.13, 0.12, 8), M.iron, TX - 0.9, 8.34, TZ - 1.5); }
  } else {
    const st = M.stone;
    run((x, s, k) => { const h = 2.4 + (k === 4 ? -1.2 : 0) + r() * 0.6; const g = rockGeo(300 + k + (s > 0 ? 10 : 0)); g.scale(1.45, h / 2, 0.55); addMesh(group, B, g, st, x, h / 2 - 0.1, 0); });
    const g = rockGeo(333); g.scale(2.6, 6, 2.6); addMesh(group, B, g, st, 2, 5.4, 13);
  }
  /* the keep past the gate is solid too (the hero and the view used to walk into it) */
  solids.push(...({ storybook: [{ x: 1.5, z: 12, r: 2.8 }, { x: -4.5, z: 14, r: 3.4 }], edo: [{ x: 0, z: 13, r: 4.0 }], neon: [{ x: 0, z: 15, r: 3.8 }], frontier: [{ x: 3, z: 11, r: 2.0 }] }[M.kind] || [{ x: 2, z: 13, r: 3.0 }]));
  return { group, solids, dispose() { group.removeFromParent(); B.free(); } };
}

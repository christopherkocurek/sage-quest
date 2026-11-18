/* Storybook bosses and the far shape on the nemesis line.
   The Storm Giant (giant mechanic, 2.7): a towering weather figure, built here from the bare rig (the nemesis entry sets
   bare: true, so the dark mechanic dress adds nothing). the body is solid lit cumulus lumps bound to the bones
   (rain-slate legs, sunlit white shoulders and head; the rig's mannequin is hidden), big cloud fists, a few soft painted
   puffs at the edge. A storybook face: a heavy dark brow, two glowing eyes, a round nose, a mouth under a cloud
   moustache, a full beard. The club is a whole oak with its green crown as the striking end. On each slam a glowing
   bolt (white core, blue glow, branches) forks from the sky to the club and to the ground.
   Death: he breaks into rain (0-3.5 s): the club and the solid parts go first, the body becomes cloud, soft rain with
   splashes falls through it, one full rainbow arc and a warm sunbeam come out, the frame ends bright.
   The Black Knight (twin mechanic): a storybook toy soldier in black enamel (see blackKnight below).
   skyNemesis(stormgiant): a cloud bank on the horizon whose outline is a giant (head, shoulders, a raised arm).
   Dense one-line code uses block comments only. */
import * as THREE from 'three';
import { dressBoss as darkDress } from '../bosses.js';
import { worldById } from '/game/worlds.mjs';
import { skyFigure } from './sky-figure.js';
import { makeActor, KNIGHT_URL } from '../world.js';

/* the weather of the fight. The Storm Giant writes it, the storybook lands read it (storybook.js buildStorm):
   k 0..1 = how stormy the arena is (dark sky, rain, wind, lightning, dim cool light), clear 0..1 = the sky after his death
   (bright, saturated, the rainbow). dispose() puts both back to 0; the land eases back to its own day. */
export const STORM = { k: 0, clear: 0 };

const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _m = new THREE.Matrix4(); const _s = new THREE.Vector3();
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function skinOf(actor) { let sk = null; actor.root.traverse((n) => { if (!sk && n.isSkinnedMesh) sk = n; }); return sk; }
function boneOf(actor, name) { let b = null; actor.root.traverse((n) => { if (!b && n.isBone && n.name === name) b = n; }); return b; }
/* a child of a bone whose axes are the bind-pose axes (x across, y up, z forward), origin at bindPos (metres, unit rig) */
export function bindFrame(actor, boneName, bindPos) {
  const o = new THREE.Object3D(); const sk = skinOf(actor); const bone = boneOf(actor, boneName);
  if (!sk || !bone) { actor.root.add(o); o.position.copy(bindPos); return o; }
  const i = sk.skeleton.bones.indexOf(bone);
  if (i < 0) { bone.add(o); return o; }
  _m.copy(sk.skeleton.boneInverses[i]).multiply(sk.bindMatrix);
  o.position.copy(bindPos).applyMatrix4(_m); _m.decompose(_a, o.quaternion, _s);
  bone.add(o); return o;
}
/* the bind-pose position of a bone (mesh space, unit rig) */
export function bindPosOf(actor, name) {
  const sk = skinOf(actor); const bone = boneOf(actor, name); if (!sk || !bone) return null;
  const i = sk.skeleton.bones.indexOf(bone); if (i < 0) return null;
  _m.copy(sk.skeleton.boneInverses[i]).multiply(sk.bindMatrix).invert();
  return new THREE.Vector3().applyMatrix4(_m);
}

/* ---------------------------------------------------------------- painted cloud billboards
   One instanced quad per puff, turned to the camera, sized in the parent's units (the actor's scale applies).
   aP = centre, aS = (size, seed, shade 0 lit .. 1 under, drift). Soft noisy edge, lit top and cool underside, no lights. */
const CLOUD_VERT = `attribute vec3 aP; attribute vec4 aS; uniform float uTime; uniform float uGrow; uniform float uRise;
varying vec2 vUv; varying float vShade; varying float vSeed; varying float vNear;
void main(){ vUv = uv; vShade = aS.z; vSeed = aS.y;
  float sc = length(modelMatrix[0].xyz);
  vec3 c = aP + vec3(sin(uTime * 0.6 + aS.y * 40.0), cos(uTime * 0.5 + aS.y * 23.0), 0.0) * aS.x * 0.04 + vec3(0.0, uRise * (0.4 + aS.w), 0.0);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float sz = aS.x * sc * (1.0 + uGrow * (0.6 + aS.w)) * (1.0 + 0.04 * sin(uTime * 1.1 + aS.y * 9.0));
  float r = aS.y * 6.283; vec2 p = vec2(cos(r) * position.x - sin(r) * position.y, sin(r) * position.x + cos(r) * position.y);
  /* a puff whose centre comes near the lens fades out (it drew as a flat dark disc over the view) */
  vNear = smoothstep(0.7 + 0.5 * sz, 1.6 + 1.0 * sz, -mv.z);
  mv.xy += p * sz;
  gl_Position = projectionMatrix * mv; }`;
const CLOUD_FRAG = `uniform vec3 uLit; uniform vec3 uShade; uniform float uA; uniform float uTime; uniform float uK; varying vec2 vUv; varying float vShade; varying float vSeed; varying float vNear;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){ vec2 q = vUv - 0.5; float d = length(q) * 2.0;
  float n = 0.6 * n2(vUv * 4.0 + vSeed * 31.0 + uTime * 0.05) + 0.4 * n2(vUv * 9.0 - vSeed * 17.0);
  float a = smoothstep(1.0, 0.45, d + (n - 0.5) * 0.55) * uA * vNear; if (a < 0.01) discard;
  float lit = clamp(0.62 + q.y * uK - vShade * 0.55 + (n - 0.5) * 0.3 * uK, 0.0, 1.0);
  gl_FragColor = vec4(mix(uShade, uLit, lit), a); }`;
export function cloudMaterial({ lit = 0xffffff, shade = 0xa8b8d0, opacity = 1, depthWrite = false, grad = 1.1 } = {}) {
  return new THREE.ShaderMaterial({ vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite, fog: false,
    uniforms: { uK: { value: grad }, uTime: { value: 0 }, uGrow: { value: 0 }, uRise: { value: 0 }, uA: { value: opacity }, uLit: { value: new THREE.Color(lit) }, uShade: { value: new THREE.Color(shade) } } });
}
/* list: [x, y, z, size, shade, drift] */
export function cloudMesh(list, mat, seed = 1) {
  const r = rnd(seed); const base = new THREE.PlaneGeometry(2, 2); const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const P = new Float32Array(list.length * 3); const S = new Float32Array(list.length * 4);
  list.forEach(([x, y, z, s, sh = 0.3, dr = 0], i) => { P.set([x, y, z], i * 3); S.set([s, r(), sh, dr || r() * 0.6], i * 4); });
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 3)); g.setAttribute('aS', new THREE.InstancedBufferAttribute(S, 4)); g.instanceCount = list.length;
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; return m;
}

/* ---------------------------------------------------------------- soft rain with splashes (pooled, world space)
   Streaks: camera-facing vertical quads with a soft gradient. Splashes: small rings that open and fade on the ground. */
/* slant = [x, z] metres sideways per metre of fall (the wind); the streak leans with it */
export function rainPool(scene, n, { len = 0.7, width = 0.018, splashes = 96, slant = [0, 0] } = {}) {
  const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const P = new Float32Array(n * 4); const pa = new THREE.InstancedBufferAttribute(P, 4); pa.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aP', pa); g.instanceCount = n;
  const V = new Float32Array(n); for (let i = 0; i < n; i++) P[i * 4 + 1] = -99;
  const SL = new THREE.Vector2(slant[0], slant[1]);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uA: { value: 0 }, uLen: { value: len }, uW: { value: width }, uSl: { value: SL } },
    vertexShader: 'attribute vec4 aP; uniform float uLen; uniform float uW; uniform vec2 uSl; varying float vY; varying float vA; void main(){ vY = uv.y; vA = aP.w; vec4 a = viewMatrix * vec4(aP.xyz, 1.0); vec4 b = viewMatrix * vec4(aP.xyz + vec3(-uSl.x * uLen, uLen, -uSl.y * uLen), 1.0); vec4 p = mix(a, b, position.y); p.x += position.x * uW; gl_Position = projectionMatrix * p; }',
    fragmentShader: 'uniform float uA; varying float vY; varying float vA; void main(){ float a = vY * (1.0 - vY) * 4.0 * uA * vA * 0.55; if (a < 0.01) discard; gl_FragColor = vec4(0.92, 0.96, 1.0, a * 0.6); }' });
  const streaks = new THREE.Mesh(g, mat); streaks.frustumCulled = false; streaks.renderOrder = 4; scene.add(streaks);
  const SP = new Float32Array(splashes * 3); const ST = new Float32Array(splashes).fill(1); const sg = new THREE.BufferGeometry();
  const spa = new THREE.BufferAttribute(SP, 3); spa.setUsage(THREE.DynamicDrawUsage); const sta = new THREE.BufferAttribute(ST, 1); sta.setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('position', spa); sg.setAttribute('aT', sta);
  const smat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uA: { value: 0 } },
    vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (0.12 + aT * 0.35) * 900.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uA; varying float vT; void main(){ vec2 q = gl_PointCoord - 0.5; q.y *= 2.6; float d = length(q) * 2.0; float a = smoothstep(0.55, 0.8, d) * smoothstep(1.0, 0.85, d) * (1.0 - vT) * uA; if (a < 0.01 || vT >= 1.0) discard; gl_FragColor = vec4(0.94, 0.97, 1.0, a * 0.8); }' });
  const sp = new THREE.Points(sg, smat); sp.frustumCulled = false; sp.renderOrder = 4; scene.add(sp);
  let next = 0; let nextS = 0; let ground = 0;
  return {
    mats: [mat, smat],
    set ground(y) { ground = y; },
    emit(x, y, z, v = 10) { const i = next; next = (next + 1) % n; P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = z; P[i * 4 + 3] = 0.6 + Math.random() * 0.4; V[i] = v * (0.85 + Math.random() * 0.3); },
    slant: SL,
    update(dt) {
      for (let i = 0; i < n; i++) { if (V[i] <= 0) continue; const j = i * 4; P[j + 1] -= V[i] * dt; P[j] += V[i] * SL.x * dt; P[j + 2] += V[i] * SL.y * dt; if (P[j + 1] < ground) { if (Math.random() < 0.35) { const s = nextS; nextS = (nextS + 1) % splashes; SP[s * 3] = P[j]; SP[s * 3 + 1] = ground + 0.03; SP[s * 3 + 2] = P[j + 2]; ST[s] = 0; } V[i] = 0; P[j + 1] = -99; } }
      for (let s = 0; s < splashes; s++) if (ST[s] < 1) ST[s] = Math.min(1, ST[s] + dt * 3.2);
      pa.needsUpdate = true; spa.needsUpdate = true; sta.needsUpdate = true;
    },
    set alpha(a) { mat.uniforms.uA.value = a; smat.uniforms.uA.value = a; },
    dispose() { streaks.removeFromParent(); sp.removeFromParent(); g.dispose(); base.dispose(); sg.dispose(); mat.dispose(); smat.dispose(); },
  };
}

/* ---------------------------------------------------------------- puffy solid lumps
   Spheres merged into one geometry (position + normal), for the lit cloud body, the face and the oak's crown. */
export function lumpGeo(list, detail = 2) {
  const pos = []; const nor = []; const g0 = new THREE.IcosahedronGeometry(1, detail); const P = g0.attributes.position; const N = g0.attributes.normal;
  for (const [x, y, z, r, sx = 1, sy = 1, sz = 1] of list) for (let i = 0; i < P.count; i++) {
    pos.push(x + P.getX(i) * r * sx, y + P.getY(i) * r * sy, z + P.getZ(i) * r * sz);
    _a.set(N.getX(i) / sx, N.getY(i) / sy, N.getZ(i) / sz).normalize(); nor.push(_a.x, _a.y, _a.z); }
  g0.dispose(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}

/* ---------------------------------------------------------------- the club: a whole oak, pulled up by the roots
   Grip at the origin, along +Y; the striking end is the round green crown of a storybook oak (the meadow's own trees),
   a few short roots hang below the fist. Warm bark in vertex colours. No scar, no white core. */
/* join non-indexed geometries (position + normal) into one */
function joinGeo(gs) { const pos = []; const nor = []; for (const g of gs) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g; }
const clamp01 = (x) => Math.min(1, Math.max(0, x));
function colourGeo(g, fn) { const p = g.attributes.position; const c = new Float32Array(p.count * 3); const col = new THREE.Color(); for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i)); c.set([col.r, col.g, col.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }
function oakClub() {
  const g = new THREE.Group(); const r = rnd(77);
  const bark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.8 });
  const BL = new THREE.Color(0x9a7a56); const BD = new THREE.Color(0x5e4430);
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5; return s - Math.floor(s); };
  /* the trunk: thin at the grip, thicker toward the crown, soft ridged bark */
  const trunk = new THREE.CylinderGeometry(0.075, 0.05, 1.0, 10, 10); trunk.translate(0, 0.45, 0);
  { const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.06 * Math.sin(a * 7 + y * 3) + 0.25 * Math.max(0, y - 0.8); p.setX(i, p.getX(i) * k + Math.sin(y * 3) * 0.015); p.setZ(i, p.getZ(i) * k); } trunk.computeVertexNormals(); }
  colourGeo(trunk, (c, x, y, z) => { const a = Math.atan2(z, x); c.copy(BD).lerp(BL, (0.5 + 0.5 * Math.sin(a * 7 + y * 3)) * 0.7 + hash(x, y, z) * 0.3); });
  g.add(new THREE.Mesh(trunk, bark));
  /* two boughs that carry the crown */
  for (const [a, l] of [[0.5, 0.32], [-2.4, 0.28]]) { const b = new THREE.CylinderGeometry(0.02, 0.04, l, 6); b.translate(0, l / 2, 0); colourGeo(b, (c) => c.copy(BL)); const m = new THREE.Mesh(b, bark); m.position.set(0, 0.86, 0); m.rotation.set(0, a, 0.7); g.add(m); }
  /* short torn roots below the fist */
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + r() * 0.5; const L = 0.1 + r() * 0.1; const root = new THREE.CylinderGeometry(0.004, 0.018, L, 5, 3); root.translate(0, -L / 2, 0); colourGeo(root, (c) => c.copy(BD)); const m = new THREE.Mesh(root, bark); m.position.set(Math.cos(a) * 0.03, -0.04, Math.sin(a) * 0.03); m.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); g.add(m); }
  /* the crown: a round cloud of leaves, lit green on top, deep green below (vertex colours by height) */
  const L = []; L.push([0, 1.2, 0, 0.2]);
  for (let i = 0; i < 16; i++) { const u = r() * 2 - 1; const th = r() * 6.283; const q = Math.sqrt(1 - u * u); const d = 0.17 + r() * 0.05; L.push([Math.cos(th) * q * d, 1.2 + u * d * 0.8, Math.sin(th) * q * d, 0.09 + r() * 0.05]); }
  const crownG = lumpGeo(L, 1); const leafLit = new THREE.Color(0x9cd04e); const leafDk = new THREE.Color(0x3e7a2a);
  colourGeo(crownG, (c, x, y) => c.copy(leafDk).lerp(leafLit, Math.min(1, Math.max(0, (y - 1.02) / 0.36))));
  const leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.9 });
  g.add(new THREE.Mesh(crownG, leaf));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.mats = [bark, leaf]; g.userData.tip = new THREE.Vector3(0, 1.2, 0);
  g.userData.geos = []; g.traverse((o) => { if (o.isMesh) g.userData.geos.push(o.geometry); });
  return g;
}

/* ---------------------------------------------------------------- a glowing bolt
   Camera-facing ribbons along a jagged path with branches: a white-hot core inside a wide blue glow (additive, above 1.0
   so the bloom takes it). From (0, h, 0) down to the origin. uA = strength. */
const GBOLT_VERT = `attribute vec3 aDir; attribute vec2 aSW; uniform float uW; varying float vS; varying float vK;
void main(){ vS = aSW.x; vK = aSW.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 d = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz);
  vec3 sd = cross(d, normalize(-mv.xyz)); float l = length(sd); sd = l > 1e-4 ? sd / l : vec3(1.0, 0.0, 0.0);
  mv.xyz += sd * aSW.x * uW * aSW.y; gl_Position = projectionMatrix * mv; }`;
const GBOLT_FRAG = `uniform vec3 uCol; uniform float uA; varying float vS; varying float vK;
void main(){ float d = abs(vS); float core = smoothstep(0.16, 0.0, d); float glow = exp(-d * d * 7.0) * 0.55;
  vec3 c = uCol * glow + vec3(1.0) * core * 3.0; float a = (glow + core) * uA; if (a < 0.004) discard; gl_FragColor = vec4(c * uA, 1.0); }`;
export function glowBoltMaterial(col = 0x9cc8ff, w = 0.6) {
  return new THREE.ShaderMaterial({ vertexShader: GBOLT_VERT, fragmentShader: GBOLT_FRAG, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uW: { value: w }, uA: { value: 0 }, uCol: { value: new THREE.Color(col).multiplyScalar(1.6) } } });
}
export function glowBoltGeo(r, h, jag, branches = 3) {
  const pos = []; const dir = []; const sw = []; const idx = []; let base = 0;
  const strip = (pts, k) => { for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = pts[Math.min(pts.length - 1, i + 1)]; const o = pts[Math.max(0, i - 1)]; const dx = q[0] - o[0]; const dy = q[1] - o[1]; const dz = q[2] - o[2];
      const kk = k * (i === 0 || i === pts.length - 1 ? 0.6 : 1); for (const s of [-1, 1]) { pos.push(p[0], p[1], p[2]); dir.push(dx, dy, dz); sw.push(s, kk); }
      if (i) { const a = base + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } } base += pts.length * 2; };
  const main = [[0, h, 0]]; let x = 0; let z = 0;
  for (let y = h; y > 0; y -= h / 14 * (0.6 + r() * 0.8)) { x += (r() - 0.5) * jag; z += (r() - 0.5) * jag; x *= 0.82; z *= 0.82; main.push([x, Math.max(0, y), z]); }
  main.push([0, 0, 0]); strip(main, 1);
  for (let b = 0; b < branches; b++) { const s = main[2 + Math.floor(r() * (main.length * 0.6))]; const pts = [s.slice()]; let [bx, by, bz] = s; const ax = (r() - 0.5) * 2; const az = (r() - 0.5) * 2;
    for (let k = 0; k < 4; k++) { bx += ax * jag * 0.5 + (r() - 0.5) * jag * 0.4; bz += az * jag * 0.5; by -= h / 14 * (0.7 + r() * 0.6); pts.push([bx, by, bz]); } strip(pts, 0.5); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3)); g.setAttribute('aSW', new THREE.Float32BufferAttribute(sw, 2)); g.setIndex(idx); return g;
}

/* ================================================================ dressBoss */
export function dressBoss(actor, nemesisId, ctx = {}) {
  if (nemesisId === 'stormgiant') return stormGiant(actor, ctx);
  if (nemesisId === 'blackknight') return blackKnight(actor, ctx);
  return null;
}

/* ================================================================ the Black Knight: a toy soldier from the nursery shelf
   Black enamel plate with gold bands, a big round helm with a gold crown band and a tall red plume, a black surcoat with
   a gold cross, a heater shield. Toy proportions: the head and helm ride 1.22x, the stance is upright. No glass, no cracks.
   A hit: a short warm gleam. Death (card at about 3.6 s): he drops to one knee (0.3 s), bows his plumed head, the sword
   falls from his hand to the grass, and gold stars spin up round him like a spell that breaks. */
export const BK_LOOK = { helm: 'open', wear: ['Helm_toy', 'Surcoat'], cloak: true, tabard: false, crown: false, pauldrons: true, steel: 0x2c2e38, cloth: 0x1c1d26, eye: 0x000000, eyePower: 0, vary: false };
function blackKnight(actor, ctx) {
  const scene = ctx.scene || actor.root.parent;
  const H = { id: 'twin', float: 0, darkness: 0, lookAt: new THREE.Vector3(), shake: 0, time: 0, disposers: [], warmMats: [], warmShow: [] };
  H.takeShake = () => { const s = H.shake; H.shake = 0; return s; };
  H.onStep = () => 0; H.onSlam = () => ({ shake: 0, flash: 0, slow: 0 }); H.onSummon = () => 0; H.rise = () => {}; H.onPhase = () => {}; H.onParry = () => ({});
  const scale = ctx.size || 1.05; actor.root.scale.setScalar(scale);
  actor.look({ ...BK_LOOK, ...(ctx.heroLook || {}), helm: 'open', wear: BK_LOOK.wear, eyePower: 0 });
  for (const m of actor.parts.get('Eyes') || []) m.visible = false;
  /* toy proportions: a big round head */
  const offHead = actor.pose('Head', (b) => b.scale.setScalar(1.22));
  const base = actor.flash.bind(actor);
  actor.flash = () => base(0xffe0a0, 70, 0.12);
  H.onHit = () => { base(0xffe0a0, 70, 0.14); H.shake = Math.max(H.shake, 0.12); return {}; };
  actor.breakPart = () => [];
  /* his bolt: a spinning gold star, not an orb */
  H.boltLook = { color: 0xffc84a, scale: 0.9 };
  H.keepOut = 1.5;
  const B = {}; for (const n of ['spine_01', 'neck_01', 'Head']) B[n] = actor.root.getObjectByName(n);
  const _f = new THREE.Vector3(); const _q = new THREE.Quaternion(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3(); const _Y = new THREE.Vector3(0, 1, 0);
  const aim = (bone, tip, dir, w) => { if (!bone || !tip || w <= 0) return; bone.getWorldPosition(_a); tip.getWorldPosition(_b); _b.sub(_a).normalize();
    const qa = new THREE.Quaternion().setFromUnitVectors(_b, dir.clone().normalize()).slerp(new THREE.Quaternion(), 1 - w); const qb = new THREE.Quaternion(); bone.getWorldQuaternion(qb); const qc = new THREE.Quaternion(); bone.parent.getWorldQuaternion(qc);
    bone.quaternion.copy(qc.invert().multiply(qa.multiply(qb))); bone.updateMatrixWorld(true); };
  /* the stars: gold instanced stars that spin up round him at death */
  const N = 40; const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2; const r = i % 2 ? 0.04 : 0.1; if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starG = new THREE.ExtrudeGeometry(starShape, { depth: 0.02, bevelEnabled: false }); starG.translate(0, 0, -0.01);
  const starM = new THREE.MeshStandardMaterial({ color: 0xffd25a, emissive: 0xffb020, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.4 });
  const stars = new THREE.InstancedMesh(starG, starM, N); stars.frustumCulled = false; stars.visible = false; stars.count = N; scene.add(stars);
  for (let i = 0; i < N; i++) { _m.compose(_p.set(0, -50, 0), _q.identity(), _s.setScalar(1e-3)); stars.setMatrixAt(i, _m); }
  H.warmMats.push(starM); H.warmShow.push(stars);
  const S0 = Array.from({ length: N }, () => ({ a: Math.random() * 6.283, r: 0.3 + Math.random() * 0.7, y: Math.random() * 0.6, v: 0.6 + Math.random() * 1.2, w: (Math.random() - 0.5) * 8, d: Math.random() * 0.8 }));
  let death = null; const DUR = 8; const hand = actor.slot('handslotr');
  H.onDeath = (pos) => {
    if (death) return DUR; actor.root.updateMatrixWorld(true);
    death = { t: 0, pos: pos.clone(), stage: 0, kneel: 9, knelt: false, sword: null, sv: new THREE.Vector3(), sw: new THREE.Vector3(), head: new THREE.Vector3() };
    actor.play('Hit_Chest', { loop: false, fade: 0.08, restart: true, speed: 0.7 });
    return DUR;
  };
  H.update = (dt) => {
    H.time += dt; actor.root.updateMatrixWorld(true);
    const head = B.Head || actor.root;
    if (!death) { head.getWorldPosition(H.lookAt); return; }
    const d = death; d.t += dt; head.getWorldPosition(d.head);
    actor.root.getWorldDirection(_f); _f.y = 0; _f.normalize();
    if (d.stage === 0 && d.t > 0.3) { d.stage = 1; d.kneel = d.t + actor.hold('Fixing_Kneeling', 1.25, { speed: 0.55, fade: 0.45 }); }
    if (!d.knelt && d.t >= d.kneel) { d.knelt = true; H.shake = Math.max(H.shake, 0.12); }
    const w = sstep(0.5, Math.min(d.kneel, 3), d.t);
    if (w > 0) { aim(B.spine_01, B.neck_01, _p.copy(_f).multiplyScalar(0.12).add(_Y), w); aim(B.neck_01, B.Head, _p.copy(_f).multiplyScalar(0.45 + 0.25 * sstep(2, 4, d.t)).add(_Y), w); }
    /* the sword drops from his hand at 1.0 s and falls flat on the grass */
    if (!d.sword && d.t > 1.0 && hand) { const g = hand.children.find((c) => c.isObject3D && !c.isBone && c.visible);
      if (g) { g.updateWorldMatrix(true, false); g.matrixWorld.decompose(_p, _q, _s); g.removeFromParent(); g.position.copy(_p); g.quaternion.copy(_q); g.scale.copy(_s); scene.add(g); d.sword = g; d.sv.set(_f.x * 0.8, 0.5, _f.z * 0.8); d.sw.set(2.5, 0.4, 1.6); } }
    if (d.sword) { const g = d.sword; const ground = (d.pos.y || 0) + 0.04; if (g.position.y > ground) { d.sv.y -= 9.8 * dt; g.position.addScaledVector(d.sv, dt); g.rotation.x += d.sw.x * dt; g.rotation.z += d.sw.z * dt; if (g.position.y <= ground) { g.position.y = ground; g.rotation.x = Math.PI / 2; g.rotation.z = Math.atan2(_f.x, _f.z); } } }
    /* 1.2-4 s: gold stars spin up round him */
    const sk = sstep(1.2, 1.6, d.t) * (1 - sstep(4.5, 5.5, d.t)); stars.visible = sk > 0;
    if (stars.visible) for (let i = 0; i < N; i++) { const q = S0[i]; const tt = Math.max(0, d.t - 1.2 - q.d); const a = q.a + tt * 1.6; const r = q.r * scale * (1 + tt * 0.25);
      _p.set(d.pos.x + Math.cos(a) * r, (d.pos.y || 0) + (q.y + tt * q.v) * scale, d.pos.z + Math.sin(a) * r); _q.setFromAxisAngle(_Y, tt * q.w); _s.setScalar(tt > 0 ? sk * (0.6 + 0.4 * Math.sin(tt * 5 + i)) * scale : 1e-3); _m.compose(_p, _q, _s); stars.setMatrixAt(i, _m); }
    stars.instanceMatrix.needsUpdate = true;
    _p.copy(d.pos); _p.y = (d.pos.y || 0) + 0.95 * scale; H.lookAt.lerpVectors(d.head, _p, sstep(0.4, 2.4, d.t));
  };
  H.prewarm = () => {};
  H.dispose = () => { offHead(); stars.removeFromParent(); starG.dispose(); starM.dispose(); if (death?.sword) death.sword.removeFromParent(); };
  return H;
}

export const GIANT_LOOK = { armor: false, bare: true, skin: 0x8a9ab6, wear: [], cloth: 0x8a9ab6, eye: 0x8a9ab6, eyePower: 0, vary: false, cls: null, grime: null };
const WALKS = /Walk|Jog|Sprint|Run/;

/* a small 3D value noise for the billows (no allocations) */
function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function n3(x, y, z) { const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z); let fx = x - xi; let fy = y - yi; let fz = z - zi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t; const c = (i, j, k) => h3(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy), L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy), fz); }
/* billowed lumps: each sphere's surface pushed out by two octaves of noise (a cauliflower edge, not a balloon); the
   normals stay the smooth sphere normals, so the shading stays soft and painted while the outline breaks up */
function billowGeo(list0, { detail = 2, amp = 0.36, freq = 3.2, seed = 0, kids = 2 } = {}) {
  const pos = []; const nor = []; const g0 = new THREE.IcosahedronGeometry(1, detail); const P = g0.attributes.position;
  /* each lump grows a few smaller puffs on its surface (seeded, so the same body every time) */
  const list = list0.slice(); const rr = rnd(911 + Math.floor(seed * 100));
  if (kids) for (const [x, y, z, r, sx = 1, sy = 1, sz = 1] of list0) for (let k = 0; k < kids; k++) { const u = rr() * 2 - 1; const th = rr() * 6.283; const q = Math.sqrt(1 - u * u); const d = r * 0.78;
    list.push([x + Math.cos(th) * q * d * sx, y + Math.abs(u) * d * sy * (u > -0.3 ? 1 : -1), z + Math.sin(th) * q * d * sz, r * (0.38 + rr() * 0.18)]); }
  for (const [x, y, z, r, sx = 1, sy = 1, sz = 1] of list) for (let i = 0; i < P.count; i++) {
    const ux = P.getX(i); const uy = P.getY(i); const uz = P.getZ(i);
    const k = 1 + amp * (n3(ux * freq + x * 9 + seed, uy * freq + y * 9, uz * freq + z * 9) - 0.45) + amp * 0.45 * (n3(ux * freq * 2.3 - seed, uy * freq * 2.3 + x * 5, uz * freq * 2.3) - 0.5);
    pos.push(x + ux * r * sx * k, y + uy * r * sy * k, z + uz * r * sz * k);
    _a.set(ux / sx, uy / sy, uz / sz).normalize(); nor.push(_a.x, _a.y, _a.z); }
  g0.dispose(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
/* storm colours. A ramp by body height (bind metres): black-blue rain at the feet, slate through the belly, a
   grey-lilac chest, sunlit white only on the crown of the shoulders and the head; every underside is a shade darker */
const RAMP = [[0.0, 0x24283a], [0.6, 0x343a4e], [1.05, 0x585f76], [1.35, 0xa2aabd], [1.6, 0xe8ebf2]].map(([y, c]) => [y, new THREE.Color(c)]);
const _sc = new THREE.Color(); const _wh = new THREE.Color(0xf4f6fc); const _dk = new THREE.Color(0x141826);
function stormAt(c, y) { let i = 0; while (i < RAMP.length - 2 && y > RAMP[i + 1][0]) i++; const [y0, c0] = RAMP[i]; const [y1, c1] = RAMP[i + 1]; return c.copy(c0).lerp(c1, Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))); }
function stormPaint(g, y0, yk = 1, lift = 0) {
  const p = g.attributes.position; const n = g.attributes.normal; const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const ny = n.getY(i); stormAt(_sc, y0 + p.getY(i) * yk + lift);
    if (ny < 0) _sc.lerp(_dk, Math.min(0.75, -ny * 0.7)); else _sc.lerp(_wh, Math.max(0, ny - 0.55) * 0.5 * Math.min(1, Math.max(0, (y0 + p.getY(i) * yk - 0.9) * 1.5)));
    col.set([_sc.r, _sc.g, _sc.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
/* a soft round sprite texture (glow at the strike point) and a scorch mark (a burnt ring with a soft ragged edge) */
function radialTex(stops, size = 64, ragged = 0) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const h = size / 2;
  if (ragged) { const im = x.createImageData(size, size); for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const dx = (i - h) / h; const dy = (j - h) / h; const a = Math.atan2(dy, dx); const d = Math.hypot(dx, dy) * (1 + ragged * (n3(Math.cos(a) * 2 + 3, Math.sin(a) * 2, 1) - 0.5) + 0.12 * (h3(i, j, 3) - 0.5));
      const k = Math.max(0, Math.min(1, (1 - d) / 0.45)); const core = Math.max(0, 1 - d / 0.35); const o = (j * size + i) * 4; im.data[o] = 42 + core * 10; im.data[o + 1] = 30 + core * 6; im.data[o + 2] = 22; im.data[o + 3] = 255 * k * (0.75 + 0.25 * h3(i * 0.3 | 0, j * 0.3 | 0, 7)); }
    x.putImageData(im, 0, 0); }
  else { const gr = x.createRadialGradient(h, h, 0, h, h, h); for (const [t, s] of stops) gr.addColorStop(t, s); x.fillStyle = gr; x.fillRect(0, 0, size, size); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function stormGiant(actor, ctx) {
  const scene = ctx.scene || actor.root.parent; const S = ctx.size || 2.7;
  /* far = the same giant on the horizon (skyNemesis): no rain, no weather, no camera hooks */
  const far = !!ctx.far;
  actor.root.scale.setScalar(S);
  actor.look({ ...GIANT_LOOK });
  /* the rig's own body (a mannequin) is never shown: the cloud lumps below are the body */
  const hideEyes = () => { for (const m of actor.meshes) m.visible = false; }; hideEyes();
  /* strides scale with the body, so the walk clips run slower */
  const play0 = actor.play.bind(actor); actor.play = (name, opt = {}) => play0(name, WALKS.test(name || '') ? { ...opt, speed: (opt.speed ?? 1) / S } : opt);
  /* keepOut: the hero and the camera stay 4.4 m from his centre (arm 1.9 m + the oak 3.5 m at full stretch) */
  const H = { id: 'giant', float: 0, darkness: 0, lookAt: new THREE.Vector3(), shake: 0, time: 0, keepOut: 4.4 * S / 2.7 /* the reach grows with the size */, maulHead: new THREE.Vector3(), warmMats: [], warmShow: [] };
  H.takeShake = () => { const s = H.shake; H.shake = 0; return s; };
  H.onStep = () => 0; H.onSummon = () => 0; H.rise = () => {}; H.onPhase = () => {}; H.onHit = () => ({}); H.onParry = () => ({});
  H.boltLook = { color: 0xcfe6ff, scale: 1.2 };
  const r = rnd(2701); const disposers = []; const mats = [];
  /* the oak goes in the hand instead of the mechanic's maul */
  const hand = actor.slot('handslotr');
  for (const c of hand?.children || []) c.visible = false;
  const club = oakClub(); if (hand) hand.add(club); else actor.root.add(club); mats.push(...club.userData.mats);
  disposers.push(() => { club.removeFromParent(); for (const g of club.userData.geos) g.dispose(); });
  /* the body is a storm, not a marshmallow. Billowed cloud lumps bound to the bones, black-blue rain at the feet, slate
     belly, a pale crown on the shoulders and the head, every underside darker. Lightning lives inside: a flash lights a
     patch of the body from within (uFlash, a world-space glow in the lump shader) and a short crackle runs over it. */
  const lumpM = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0, emissive: 0x14171f, emissiveIntensity: 1, envMapIntensity: 0.7 }); mats.push(lumpM);
  const flashU = { uFlash: { value: 0 }, uFlashP: { value: new THREE.Vector3(0, -99, 0) }, uFlashR: { value: 1 } };
  lumpM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, flashU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSbW;').replace('#include <project_vertex>', '#include <project_vertex>\nvSbW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSbW; uniform float uFlash; uniform vec3 uFlashP; uniform float uFlashR;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float sbD = distance(vSbW, uFlashP) / uFlashR; float sbV = 0.8 + 0.2 * sin(vSbW.y * 1.1 + vSbW.x * 0.7) * sin(vSbW.z * 0.9 - vSbW.y * 0.6); /* soft, no stripes at giant size */
          totalEmissiveRadiance += vec3(0.62, 0.78, 1.0) * uFlash * exp(-sbD * sbD * 2.2) * sbV * 2.4; }`);
  };
  lumpM.customProgramCacheKey = () => 'sb-giant-lump-p9';
  const SEGS = [
    /* [from, to, radius, count, spread]; the neck segment stops at the collar so the head owns the top */
    ['pelvis', 'spine_02', 0.2, 10, 0.1], ['spine_02', 'neck_01', 0.215, 11, 0.1],
    ['clavicle_l', 'upperarm_l', 0.12, 3, 0.03], ['clavicle_r', 'upperarm_r', 0.12, 3, 0.03],
    ['upperarm_l', 'lowerarm_l', 0.1, 6, 0.025], ['upperarm_r', 'lowerarm_r', 0.1, 6, 0.025],
    ['lowerarm_l', 'hand_l', 0.095, 6, 0.02], ['lowerarm_r', 'hand_r', 0.095, 6, 0.02],
    ['thigh_l', 'calf_l', 0.125, 7, 0.03], ['thigh_r', 'calf_r', 0.125, 7, 0.03],
    ['calf_l', 'foot_l', 0.115, 7, 0.035], ['calf_r', 'foot_r', 0.115, 7, 0.035],
  ];
  const lumps = [];
  const addLumps = (bone, at, list) => { const fr = bindFrame(actor, bone, at); const g = stormPaint(billowGeo(list, { seed: lumps.length * 3.1 }), at.y); const m = new THREE.Mesh(g, lumpM); m.castShadow = true; fr.add(m); lumps.push({ fr, m, bone }); return fr; };
  for (const [A, B, rad, n, spread] of SEGS) {
    const pa = bindPosOf(actor, A); const pb = bindPosOf(actor, B); if (!pa || !pb) continue; const list = [];
    const span = A === 'spine_02' ? 0.78 : 1;
    /* fewer lumps, set at uneven steps along
       the bone, pushed off the line and sized 0.55-1.5x, so no row or grid reads; a few big masses carry each limb */
    const nn = Math.max(3, Math.round(n * 0.7));
    for (let i = 0; i < nn; i++) { const t = clamp01(((nn === 1 ? 0.5 : i / (nn - 1)) + (r() - 0.5) * 0.7 / nn)) * span; const k = 0.55 + Math.pow(r(), 1.6) * 0.95;
      list.push([(pb.x - pa.x) * t + (r() - 0.5) * spread * 3.2, (pb.y - pa.y) * t + (r() - 0.5) * spread * 1.6, (pb.z - pa.z) * t + (r() - 0.5) * spread * 3.2, rad * k]); }
    if (A === 'pelvis') list.push([0, (pb.y - pa.y) * 0.45, 0.1, rad * 1.15], [0, (pb.y - pa.y) * 0.2, 0.06, rad * 1.05]);
    if (A === 'spine_02') { list.push([0, (pb.y - pa.y) * 0.5, 0.09, rad * 1.05], [0, (pb.y - pa.y) * 0.62, -0.1, rad * 0.95]); for (const sx of [-1, 1]) list.push([sx * 0.18, (pb.y - pa.y) * 0.72, -0.01, rad * 0.72], [sx * 0.24, (pb.y - pa.y) * 0.62, 0.0, rad * 0.55]); }
    addLumps(A, pa, list);
  }
  /* big cloud fists, and cloud boots */
  for (const sd of ['l', 'r']) { const ph = bindPosOf(actor, 'hand_' + sd); if (ph) { const sx = sd === 'l' ? 1 : -1; addLumps('hand_' + sd, ph, [[sx * 0.05, -0.01, 0, 0.1], [sx * 0.1, -0.02, 0.03, 0.075], [sx * 0.09, 0.02, -0.03, 0.07], [sx * 0.03, -0.04, 0.05, 0.06]]); }
    const pf = bindPosOf(actor, 'foot_' + sd); if (pf) addLumps('foot_' + sd, pf, [[0, -0.02, 0.05, 0.1, 1, 0.7, 1.3], [0, 0.02, -0.02, 0.09]]); }
  disposers.push(() => { for (const { fr, m } of lumps) { fr.removeFromParent(); m.geometry.dispose(); } });
  /* torn storm wisps at the silhouette: dark slate puffs off the back, the hips, the elbows and the calves, lit only on top */
  const bodyM = cloudMaterial({ lit: 0xc8d0e2, shade: 0x2a3048, grad: 0.9, opacity: 0.9 }); mats.push(bodyM);
  const bodyClouds = [];
  for (const [A, list] of [['spine_03', [[0.27, 0.02, -0.08, 0.15, 0.4], [-0.27, 0.02, -0.08, 0.15, 0.4], [0, 0.06, -0.2, 0.2, 0.55], [0.15, 0.12, -0.15, 0.12, 0.3], [-0.15, 0.12, -0.15, 0.12, 0.3]]],
    ['pelvis', [[0.22, -0.06, -0.02, 0.17, 0.75], [-0.22, -0.06, -0.02, 0.17, 0.75], [0, -0.1, -0.16, 0.19, 0.8]]],
    ['lowerarm_l', [[0, 0, -0.07, 0.1, 0.8], [0.04, -0.12, -0.05, 0.08, 0.85]]], ['lowerarm_r', [[0, 0, -0.07, 0.1, 0.8], [-0.04, -0.12, -0.05, 0.08, 0.85]]],
    ['calf_l', [[0.06, 0.05, -0.06, 0.13, 0.95], [-0.05, -0.12, 0.02, 0.12, 1]]], ['calf_r', [[-0.06, 0.05, -0.06, 0.13, 0.95], [0.05, -0.12, 0.02, 0.12, 1]]]]) {
    const pa = bindPosOf(actor, A); if (!pa) continue; const fr = bindFrame(actor, A, pa); const m = cloudMesh(list, bodyM, 30 + bodyClouds.length); fr.add(m); bodyClouds.push({ fr, m }); }
  disposers.push(() => { for (const { fr, m } of bodyClouds) { fr.removeFromParent(); m.geometry.dispose(); } });
  /* the head. Every face part is a child of ONE frame on the Head bone at the bone's own bind position, and the head
     mass is bigger than the collar under it, so the face turns with the head and never sits on the side of the body.
     A round billowed cloud head with a pale crown, a heavy dark storm brow, two glowing eyes, a round nose, a dark mouth
     under a cloud moustache, a full beard to the chest. */
  const hb = bindPosOf(actor, 'Head') || new THREE.Vector3(0, 1.62, 0);
  const head = bindFrame(actor, 'Head', new THREE.Vector3(0, hb.y + 0.06, hb.z + 0.01)); head.scale.setScalar(1.45);
  const headL = [[0, 0.04, -0.01, 0.135], [0, 0.11, -0.02, 0.12], [0.08, 0.06, -0.03, 0.09], [-0.08, 0.06, -0.03, 0.09], [0, 0.0, 0.03, 0.115, 1, 1, 0.9]];
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; headL.push([Math.cos(a) * 0.1, 0.17 + r() * 0.03, Math.sin(a) * 0.09 - 0.02, 0.06 + r() * 0.02]); }
  headL.push([0, 0.24, -0.02, 0.07], [0.04, 0.27, 0.0, 0.05]);
  const headG = stormPaint(billowGeo(headL, { amp: 0.22, freq: 2.6, seed: 7, kids: 1, detail: 3 }), 1.42, 0.9, 0.06); const headMesh = new THREE.Mesh(headG, lumpM); headMesh.castShadow = true; head.add(headMesh);
  /* the beard and the moustache: paler storm-grey, billowed, on the same frame */
  const beardL = []; /* no cloud moustache (it read as a snowman's); the beard starts under the mouth */
  for (let row = 0; row < 7; row++) { const t = row / 6; const w = 0.11 * (1 - t * 0.6); const n = 4 - Math.floor(row * 0.4);
    for (let i = 0; i < n; i++) { const u = n === 1 ? 0 : i / (n - 1) - 0.5; beardL.push([u * 2 * w, -0.115 - t * 0.33, 0.07 + 0.04 * (1 - Math.abs(u)) - t * 0.02, 0.06 - t * 0.018]); } }
  const beardG = stormPaint(billowGeo(beardL, { amp: 0.25, freq: 3, seed: 11, kids: 0 }), 1.25, 0.8); const beard = new THREE.Mesh(beardG, lumpM); beard.castShadow = true; head.add(beard);
  const browM = new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 1, emissive: 0x0a0d16, emissiveIntensity: 0.6 }); mats.push(browM);
  /* a brooding storm face. One heavy overhanging thunderhead
     brow that sags to a scowl in the middle, a band of deep shadow under it, two narrow slanted slits of lightning for
     eyes, no nose, a wide down-turned dark gash for a mouth, no moustache */
  const browL = []; for (let k = 0; k <= 8; k++) { const u = k / 8 * 2 - 1; const a = Math.abs(u); browL.push([u * 0.125, 0.074 - 0.022 * (1 - a) + 0.012 * a * a, 0.122 - 0.03 * a * a, 0.034 + 0.01 * (1 - a), 1.25, 0.62, 1]); }
  browL.push([0, 0.098, 0.1, 0.06, 2.2, 0.6, 0.9]);
  /* the brow is storm cloud, not a painted bar: billowed slate lumps (the head's own material), dark beneath */
  const brow = new THREE.Mesh(stormPaint(billowGeo(browL, { amp: 0.2, freq: 3.4, seed: 5, kids: 0, detail: 2 }), 1.3, 1, -0.12), lumpM); brow.castShadow = true; head.add(brow);
  const sockL = [[0, 0.04, 0.112, 0.05, 2.5, 0.42, 0.55]];
  const sock = new THREE.Mesh(lumpGeo(sockL), new THREE.MeshBasicMaterial({ color: 0x0a0c14, fog: false })); mats.push(sock.material); head.add(sock);
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8ecff).multiplyScalar(3.2), toneMapped: false, fog: false }); mats.push(eyeM);
  const slit = (sx) => { const g = lumpGeo([[0, 0, 0, 0.03, 1.15, 0.2, 0.35]], 1); g.rotateZ(sx * 0.34); g.translate(sx * 0.046, 0.043, 0.136); return g; };
  const eyeG = joinGeo([slit(-1), slit(1)]); const eyes = new THREE.Mesh(eyeG, eyeM); head.add(eyes);
  const sparkM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const sparkTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,240,190,0.5)'], [1, 'rgba(0,0,0,0)']], 32);
  sparkM.map = sparkTex; mats.push(sparkM);
  const sparkG = new THREE.PlaneGeometry(0.085, 0.03); const sparks = [-1, 1].map((sx) => { const s = new THREE.Mesh(sparkG, sparkM); s.position.set(sx * 0.046, 0.043, 0.15); s.rotation.z = sx * 0.34; s.renderOrder = 5; head.add(s); return s; });
  const noseM = new THREE.MeshStandardMaterial({ color: 0x9aa4bc, roughness: 0.9, emissive: 0x262a3c, emissiveIntensity: 0.6 }); mats.push(noseM);
  const nose = new THREE.Mesh(lumpGeo([[0, 0.002, 0.15, 0.03, 1, 0.9, 1]]), noseM); nose.visible = false; /* no ball nose */
  const mouthM = new THREE.MeshStandardMaterial({ color: 0x10131e, roughness: 1, emissive: 0x05070c }); mats.push(mouthM);
  const mouthL = []; for (let k = 0; k <= 6; k++) { const u = k / 6 * 2 - 1; mouthL.push([u * 0.062, -0.07 - 0.024 * u * u, 0.124 - 0.012 * u * u, 0.017, 1.5, 0.5, 0.5]); }
  const mouth = new THREE.Mesh(lumpGeo(mouthL), mouthM); head.add(mouth);
  disposers.push(() => { head.removeFromParent(); for (const m of [headMesh, beard, brow, sock, eyes, nose, mouth]) m.geometry.dispose(); sparkG.dispose(); sparkTex.dispose(); });
  const faceParts = [brow, sock, eyes, mouth, ...sparks];
  const solidMats = [lumpM, browM, noseM, mouthM, eyeM];
  /* after each pose the oak turns
     about the grip, just enough that its trunk and crown stay clear of the head (eased, so it never snaps) */
  const clubQ0 = club.quaternion.clone(); const _hc = new THREE.Vector3(); const _g0 = new THREE.Vector3(); const _t1 = new THREE.Vector3(); const _sd = new THREE.Vector3(); const _cp = new THREE.Vector3();
  const _ax = new THREE.Vector3(1, 0, 0); const _qr = new THREE.Quaternion(); const _qw = new THREE.Quaternion(); const _qp = new THREE.Quaternion(); let clubFix = 0;
  const clubClear = (dt) => {
    if (club.parent !== hand) return;
    club.quaternion.copy(clubQ0); club.updateMatrixWorld(true);
    head.getWorldPosition(_hc); _hc.y += 0.09 * S;
    club.getWorldPosition(_g0); _t1.copy(club.userData.tip).applyMatrix4(club.matrixWorld); _sd.subVectors(_t1, _g0); const L = _sd.length(); if (L < 1e-4) return; _sd.multiplyScalar(1 / L);
    const k = Math.min(L, Math.max(0, _cp.subVectors(_hc, _g0).dot(_sd))); _cp.copy(_g0).addScaledVector(_sd, k); const d = _cp.distanceTo(_hc); const R = 0.85 * S; /* the head's radius and the crown's, with air between */
    let want = 0; if (d < R && k > 0.15 * S) { want = Math.min(1.25, Math.asin(Math.min(1, (R - d) / k)) + 0.08);
      _cp.sub(_hc); if (_cp.lengthSq() < 1e-6) { actor.root.getWorldDirection(_cp); _cp.cross(_up0); } _ax.crossVectors(_sd, _cp.normalize()).normalize(); }
    clubFix += (want - clubFix) * Math.min(1, dt * (want > clubFix ? 18 : 6)); if (clubFix < 1e-3 || _ax.lengthSq() < 0.5) return;
    club.getWorldQuaternion(_qw); _qr.setFromAxisAngle(_ax, clubFix); _qw.premultiply(_qr); club.parent.getWorldQuaternion(_qp); club.quaternion.copy(_qp.invert().multiply(_qw)); club.updateMatrixWorld(true);
  };
  const _up0 = new THREE.Vector3(0, 1, 0);
  /* a hit: the storm lights up inside where the blow landed */
  let flashT = 0; let flashK = 0;
  const flashAt = (p, k = 1, rad = 0.9) => { flashU.uFlashP.value.copy(p); flashU.uFlashR.value = rad * S; flashK = k; flashT = 0; };
  actor.flash = () => { const b = boneOf(actor, 'spine_02'); if (b) { b.getWorldPosition(_b); flashAt(_b, 0.7, 0.4); } };
  H.onHit = () => { actor.flash(); return {}; };
  /* a low dark cloud bank round his feet */
  const feet = []; for (let i = 0; i < 26; i++) { const a = i / 26 * 6.283 + r() * 0.2; const d = 0.3 + r() * 0.25; feet.push([Math.cos(a) * d, 0.05 + r() * 0.14, Math.sin(a) * d, 0.15 + r() * 0.07, 0.85]); }
  const footCloud = cloudMesh(feet, bodyM, 13); actor.root.add(footCloud);
  disposers.push(() => { footCloud.removeFromParent(); footCloud.geometry.dispose(); });
  /* rain: falls from the arms and the belly in life, from every drifting chunk at death */
  const rain = rainPool(scene, 1600, { len: 0.55, width: 0.012 }); mats.push(...rain.mats); disposers.push(() => rain.dispose()); rain.alpha = 0.6;
  const rainBones = ['lowerarm_l', 'lowerarm_r', 'hand_l', 'spine_02', 'pelvis'].map((n) => boneOf(actor, n)).filter(Boolean);
  let armRain = 0;
  /* the crackle: short bolts that run over the body where it flashes inside (depth-tested, so the cloud hides part of them) */
  const crackM = glowBoltMaterial(0xa8ccff, 0.05); crackM.depthTest = true; mats.push(crackM);
  const cracks = [0, 1, 2].map((k) => { const m = new THREE.Mesh(glowBoltGeo(rnd(300 + k), 1, 0.35, 2), crackM); m.visible = false; m.frustumCulled = false; m.renderOrder = 4; scene.add(m); return m; });
  disposers.push(() => { for (const c of cracks) { c.removeFromParent(); c.geometry.dispose(); } });
  let nextInner = 1.2; let innerT = -1; let player = null;
  const FLASH_BONES = ['spine_02', 'spine_03', 'pelvis', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r', 'Head'].map((n) => boneOf(actor, n)).filter(Boolean);
  const innerStrike = (k = 1) => {
    const b = FLASH_BONES[Math.floor(Math.random() * FLASH_BONES.length)]; b.getWorldPosition(_b);
    /* toward the hero by most of the body radius, so the glow and the crackle sit just under the skin on the seen side */
    if (player) { _a.set(player.x - _b.x, 0, player.z - _b.z); if (_a.lengthSq() > 1e-4) _b.addScaledVector(_a.normalize(), 0.16 * S); }
    flashAt(_b, k, 0.3 + Math.random() * 0.15); innerT = 0;
    for (let i = 0; i < cracks.length; i++) { const c = cracks[i]; const on = i < 1 + Math.floor(Math.random() * 2); c.visible = on; if (!on) continue;
      c.position.copy(_b).add(_a.set((Math.random() - 0.5) * 0.3 * S, (Math.random() - 0.2) * 0.35 * S, (Math.random() - 0.5) * 0.3 * S)); c.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28); c.scale.setScalar((0.35 + Math.random() * 0.3) * S); }
  };

  /* bolts out of the sky that STRIKE THE GROUND near the hero (never on the camera): a glowing bolt from 30 m up
     to the turf, a white-blue flash on the ground where it lands, a scorch that smoulders and fades, a ring of light
     running out, and the storm flashes inside the giant at the same moment */
  const boltMat = glowBoltMaterial(0x8cbcff, 0.5); mats.push(boltMat);
  const bolts = [0, 1].map((k) => { const m = new THREE.Mesh(glowBoltGeo(rnd(90 + k), 32, 2.0, 4), boltMat); m.visible = false; m.frustumCulled = false; m.renderOrder = 5; scene.add(m); return m; });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xdcecff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); mats.push(ringMat);
  const ringG = new THREE.RingGeometry(0.8, 1.0, 48); ringG.rotateX(-Math.PI / 2); const rings = [0, 1].map(() => { const m = new THREE.Mesh(ringG, ringMat); m.visible = false; scene.add(m); return m; });
  const glowTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(210,230,255,0.85)'], [0.5, 'rgba(120,170,255,0.25)'], [1, 'rgba(0,0,0,0)']], 64);
  const glowM = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }); mats.push(glowM);
  const glows = [0, 1].map(() => { const s = new THREE.Sprite(glowM); s.visible = false; s.renderOrder = 6; scene.add(s); return s; });
  const scorchTex = radialTex(null, 128, 0.5);
  const scorchG = new THREE.PlaneGeometry(1, 1); scorchG.rotateX(-Math.PI / 2);
  const scorches = [0, 1, 2, 3, 4, 5].map(() => { const m = new THREE.Mesh(scorchG, new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false })); m.visible = false; m.renderOrder = 1; m.userData.t = 99; scene.add(m); mats.push(m.material); return m; });
  /* embers that glow in the scorch for a moment */
  const emberM = new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); mats.push(emberM);
  let scorchI = 0; let boltT = -1; const strikes = [];
  /* smoke off the strike: a pooled set of dark puffs that rise and thin over 3 s */
  const smokeM = cloudMaterial({ lit: 0xd8dade, shade: 0x8a8c94, grad: 0.8, opacity: 0 }); mats.push(smokeM);
  const NS = 24; const smoke = cloudMesh(Array.from({ length: NS }, () => [0, -99, 0, 0.5, 0.6]), smokeM, 55); smoke.visible = false; scene.add(smoke);
  const SM = Array.from({ length: NS }, () => ({ t: 9, x: 0, y: -99, z: 0, vx: 0, vz: 0 })); let smokeI = 0; let smokeLive = 0;
  disposers.push(() => { smoke.removeFromParent(); smoke.geometry.dispose(); });
  const smokeAt = (x, y, z) => { for (let k = 0; k < 6; k++) { const q = SM[smokeI]; smokeI = (smokeI + 1) % NS; q.t = -k * 0.12; q.x = x + (Math.random() - 0.5) * 0.8; q.y = y + 0.2; q.z = z + (Math.random() - 0.5) * 0.8; q.vx = (Math.random() - 0.5) * 0.3; q.vz = (Math.random() - 0.5) * 0.3; } smokeLive = 3.6; smoke.visible = true; };
  const updateSmoke = (dt) => { if (smokeLive <= 0) return; smokeLive -= dt; const aP = smoke.geometry.attributes.aP; const aS = smoke.geometry.attributes.aS;
    for (let i = 0; i < NS; i++) { const q = SM[i]; q.t += dt; const on = q.t > 0 && q.t < 3; aP.setXYZ(i, q.x + q.vx * q.t, on ? q.y + q.t * 0.9 : -99, q.z + q.vz * q.t); aS.setX(i, 0.22 + Math.max(0, q.t) * 0.3); }
    aP.needsUpdate = true; aS.needsUpdate = true; smokeM.uniforms.uA.value = 0.32 * Math.min(1, smokeLive / 1.5); if (smokeLive <= 0) smoke.visible = false; };
  disposers.push(() => { for (const b of bolts) { b.removeFromParent(); b.geometry.dispose(); } for (const m of [...rings, ...glows, ...scorches]) m.removeFromParent(); ringG.dispose(); glowTex.dispose(); scorchG.dispose(); scorchTex.dispose(); });
  const strikeAt = (i, x, y, z) => {
    const b = bolts[i]; b.position.set(x, y, z); b.rotation.y = Math.random() * 6.283; b.scale.set(1, 0.9 + Math.random() * 0.25, 1); b.visible = true;
    const g = glows[i]; g.position.set(x, y + 0.6, z); g.scale.setScalar(6.5); g.visible = true;
    const rg = rings[i]; rg.position.set(x, y + 0.06, z); rg.scale.setScalar(0.6); rg.visible = true;
    const sc = scorches[scorchI]; scorchI = (scorchI + 1) % scorches.length; sc.position.set(x, y + 0.14, z); sc.rotation.y = Math.random() * 6.28; sc.scale.setScalar(2.2 + Math.random() * 0.8); sc.userData.t = 0; sc.visible = true;
    strikes[i] = { x, y, z };
    smokeAt(x, y, z);
  };
  H.onSlam = (pos) => {
    club.updateMatrixWorld(true); H.maulHead.copy(club.userData.tip).applyMatrix4(club.matrixWorld);
    const gy = pos.y ?? 0;
    /* where the club lands, and a fork a few metres off to the side; both pushed out to 3 m from the hero at least */
    /* in front of the hero's view, on either side of the giant, 5-8 m out: the whole bolt and its landing show in frame */
    const pl0 = player || pos; const g = actor.root.position; _a.set(g.x - pl0.x, 0, g.z - pl0.z); const dist = Math.max(1, _a.length()); _a.normalize();
    const side = Math.random() < 0.5 ? -1 : 1; const fwd = Math.max(5, dist * 0.85);
    [[fwd, side * (2.5 + Math.random() * 1.5)], [fwd + 1.5 + Math.random() * 2, -side * (3.5 + Math.random() * 2.5)]].forEach(([f, s], i) => strikeAt(i, pl0.x + _a.x * f + _a.z * s, gy, pl0.z + _a.z * f - _a.x * s));
    boltT = 0;
    const sp = boneOf(actor, 'spine_03'); if (sp) { sp.getWorldPosition(_b); flashAt(_b, 1.1, 0.6); innerT = 0; }
    const s = 0.7; H.shake = Math.max(H.shake, s);
    return { shake: s, flash: 0.7, slow: 0.1 };
  };

  /* ---------------- he breaks up, the storm drifts apart, rain, a rainbow
     0-0.4 s  a last flash runs through the whole body, the eyes flare and go out, he rears back
     0.35-2.2 s  every cloud lump tears free of the rig and drifts outward and up, turning slowly, paling from storm to white,
                 thinning; soft cloud puffs grow round each chunk; the oak drops and falls flat
     0.6-3.4 s  rain falls from the drifting chunks
     1.6-3.0 s  a rainbow comes out behind, far off and soft, red on the outside, violet inside; a warm sunbeam */
  const deathM = cloudMaterial({ lit: 0xffffff, shade: 0x9aa6c0, opacity: 0 }); mats.push(deathM);
  const NB = 64; const deathCloud = cloudMesh(Array.from({ length: NB }, () => [0, -99, 0, 0.6, r() * 0.6]), deathM, 14); deathCloud.visible = false; scene.add(deathCloud);
  const bowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    /* t: 0 = outer edge .. 1 = inner edge. Red outside, then orange, yellow, green, blue, violet inside. Soft edges, the ends
       melt into the haze, a faint brighter sky just inside the bow */
    fragmentShader: `uniform float uA; varying vec2 vUv;
      vec3 bowCol(float t){ vec3 c = mix(vec3(0.92,0.18,0.14), vec3(0.98,0.55,0.12), smoothstep(0.0,0.2,t)); c = mix(c, vec3(0.98,0.9,0.25), smoothstep(0.15,0.38,t)); c = mix(c, vec3(0.3,0.8,0.32), smoothstep(0.35,0.58,t)); c = mix(c, vec3(0.25,0.45,0.95), smoothstep(0.55,0.8,t)); c = mix(c, vec3(0.5,0.3,0.8), smoothstep(0.78,1.0,t)); return c; }
      void main(){ float t = 1.0 - vUv.y; float band = smoothstep(-0.05, 0.12, t) * smoothstep(1.05, 0.85, t);
        float ends = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
        float inner = smoothstep(1.0, 1.25, t) * smoothstep(2.4, 1.2, t) * 0.18;
        vec3 c = mix(vec3(1.0, 0.98, 0.94), bowCol(clamp(t, 0.0, 1.0)), band);
        float a = (band * 0.42 + inner) * ends * uA; if (a < 0.004) discard; gl_FragColor = vec4(c, a); }` }); mats.push(bowMat);
  /* the bow: 15 m radius, 2.1 m wide, with an extra skirt inside for the brighter sky (uv.y below 0 there) */
  const BR = 15; const BW = 2.1; const bowG = new THREE.RingGeometry(BR - BW * 1.4, BR, 96, 2, 0, Math.PI);
  { const uv = bowG.attributes.uv; const p = bowG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); uv.setXY(i, Math.atan2(y, x) / Math.PI, 1 - (BR - Math.hypot(x, y)) / BW); } }
  const bow = new THREE.Mesh(bowG, bowMat); bow.visible = false; bow.frustumCulled = false; bow.renderOrder = 2; scene.add(bow);
  const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float e = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x) * smoothstep(0.0, 0.3, vUv.y); gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * 0.9, e * uA * 0.3); }' }); mats.push(beamMat);
  const beamG = new THREE.PlaneGeometry(5, 30); beamG.translate(0, 15, 0); const beam = new THREE.Mesh(beamG, beamMat); beam.visible = false; beam.frustumCulled = false; scene.add(beam);
  disposers.push(() => { deathCloud.removeFromParent(); deathCloud.geometry.dispose(); bow.removeFromParent(); bowG.dispose(); beam.removeFromParent(); beamG.dispose(); });
  let death = null;
  const baseMats = actor.meshes.map((m) => m.material);
  const _q = new THREE.Quaternion(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3(); const _c = new THREE.Vector3();
  H.onDeath = (pos) => {
    if (death) return 5.2;
    death = { t: 0, at: new THREE.Vector3().copy(pos || actor.root.position), chunks: [], torn: false, club: null, cv: new THREE.Vector3(), cw: new THREE.Vector3() };
    actor.breakPart = () => [];
    actor.play('Hit_Chest', { loop: false, fade: 0.1, restart: true, speed: 0.45 });
    const sp = boneOf(actor, 'spine_03'); if (sp) { sp.getWorldPosition(_b); flashAt(_b, 1.6, 0.9); innerT = 0; }
    /* the rainbow far behind him, a little to one side, turned to the hero; its feet sink below the land */
    const toHero = _a.set(1, 0, 0); if (player) toHero.set(player.x - death.at.x, 0, player.z - death.at.z); if (toHero.lengthSq() < 1e-4) toHero.set(0, 0, 1); toHero.normalize();
    bow.position.copy(death.at).addScaledVector(toHero, -26); bow.position.x += toHero.z * 5; bow.position.z -= toHero.x * 5; bow.position.y = death.at.y - 4.5; bow.lookAt(_b.copy(bow.position).add(toHero)); bow.visible = true;
    beam.position.copy(death.at).addScaledVector(toHero, -0.5); beam.lookAt(_b.copy(beam.position).add(toHero)); beam.rotateZ(-0.35); beam.visible = true;
    rain.ground = death.at.y; rain.alpha = 1;
    return 5.2;
  };
  const setOpacity = (m, a) => { if (!m.transparent) { m.transparent = true; m.needsUpdate = true; } m.opacity = a; };
  /* tear every lump mesh (and the head) free of its bone: it keeps its world place and drifts on its own */
  const tear = (D) => {
    actor.root.updateMatrixWorld(true); const cen = D.at.clone(); cen.y += 1.0 * S;
    const list = [...lumps.map((l) => l.m), headMesh, beard];
    for (const m of list) { m.updateWorldMatrix(true, false); m.matrixWorld.decompose(_p, _q, _s); m.removeFromParent(); m.position.copy(_p); m.quaternion.copy(_q); m.scale.copy(_s); scene.add(m);
      m.geometry.computeBoundingSphere(); _c.copy(m.geometry.boundingSphere.center).applyMatrix4(m.matrixWorld);
      const out = _c.clone().sub(cen); out.y *= 0.4; if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5); out.normalize();
      /* the top goes first and fastest (the wind takes the head and the shoulders), the legs last */
      const hk = Math.min(1, Math.max(0, (_c.y - D.at.y) / (1.7 * S)));
      /* the storm comes DOWN: every lump slumps outward and sinks to the turf, where it lies as a low bank of cloud
         that rains itself out */
      D.chunks.push({ m, c: _c.clone(), v: out.multiplyScalar((0.5 + Math.random() * 0.8) * (0.6 + hk * 0.6) * S / 2.7).add(new THREE.Vector3(0, -0.2 - Math.random() * 0.4, 0)), w: new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.5), s0: m.scale.x, d: (1 - hk) * 0.35 + Math.random() * 0.15 }); }
    for (const fp of faceParts) fp.visible = false;
    disposers.push(() => { for (const ch of D.chunks) ch.m.removeFromParent(); });
    /* the oak falls from his hand */
    if (club.parent) { club.updateWorldMatrix(true, false); club.matrixWorld.decompose(_p, _q, _s); club.removeFromParent(); club.position.copy(_p); club.quaternion.copy(_q); club.scale.copy(_s); scene.add(club); D.club = club;
      /* it topples away from the hero, never into the camera */ _a.set(D.at.x - (player?.x ?? D.at.x - 1), 0, D.at.z - (player?.z ?? D.at.z)); if (_a.lengthSq() < 1e-4) _a.set(1, 0, 0); _a.normalize(); D.cv.set(_a.x * 1.6, 0.4, _a.z * 1.6); D.cw.set((Math.random() - 0.5) * 1.6, 0, 1.4 + Math.random()); }
    /* the puffs ride on the chunks */
    const aS = deathCloud.geometry.attributes.aS; for (let i = 0; i < NB; i++) aS.setX(i, (0.09 + Math.random() * 0.09) * S); aS.needsUpdate = true; deathCloud.visible = true;
  };
  const _white = new THREE.Color(0xeef2fa); const _tint = new THREE.Color();
  const updateDeath = (dt) => {
    const D = death; D.t += dt; const t = D.t;
    hideEyes();
    /* 0-0.35 s: the last flash, the eyes flare and go out */
    eyeM.color.setRGB(2.6, 2.5, 2.1).multiplyScalar(1 + 1.5 * (1 - sstep(0.0, 0.35, t))); sparkM.opacity = 1 - sstep(0.15, 0.35, t);
    if (!D.torn && t > 0.35) { D.torn = true; tear(D); }
    if (D.torn) {
      const k = sstep(0.35, 2.2, t); const fade = 1 - sstep(3.6, 5.2, t);
      /* the storm drains out of the chunks: they pale toward white cloud as they drift */
      lumpM.emissive.setHex(0x14171f).lerp(_tint.setHex(0x8a90a8), k);
      setOpacity(lumpM, fade); lumpM.depthWrite = fade > 0.97;
      const floorY = D.at.y + 0.13 * S;
      for (const ch of D.chunks) { const tt = Math.max(0, t - 0.35 - ch.d); ch.m.position.addScaledVector(ch.v, dt * (tt > 0 ? 1 : 0)); ch.v.multiplyScalar(1 - dt * 0.6); if (tt > 0) ch.v.y -= dt * 2.6 * S / 2.7;
        if (ch.m.geometry.boundingSphere) { _c.copy(ch.m.geometry.boundingSphere.center).applyMatrix4(ch.m.matrixWorld); if (_c.y < floorY) { ch.m.position.y += floorY - _c.y; ch.v.y = Math.max(0, ch.v.y); ch.v.x *= 1 - Math.min(1, dt * 2.5); ch.v.z *= 1 - Math.min(1, dt * 2.5); } }
        ch.m.rotation.x += ch.w.x * dt; ch.m.rotation.y += ch.w.y * dt; ch.m.rotation.z += ch.w.z * dt; ch.m.scale.setScalar(ch.s0 * (1 - 0.35 * sstep(0.6, 2.2, t))); ch.m.visible = fade > 0.02; }
      /* the soft puffs follow the chunks and take over as the lumps thin */
      const aP = deathCloud.geometry.attributes.aP;
      for (let i = 0; i < NB; i++) { const ch = D.chunks[i % D.chunks.length]; ch.m.geometry.boundingSphere && _c.copy(ch.m.geometry.boundingSphere.center).applyMatrix4(ch.m.matrixWorld); aP.setXYZ(i, _c.x + Math.sin(i * 7.1) * 0.12 * S, _c.y + Math.cos(i * 3.3) * 0.08 * S, _c.z + Math.sin(i * 2.7) * 0.12 * S); }
      aP.needsUpdate = true;
      deathM.uniforms.uA.value = 0.85 * sstep(0.4, 1.2, t) * (1 - sstep(4.2, 5.4, t));
      deathM.uniforms.uGrow.value = sstep(0.5, 3.2, t) * 0.5; deathM.uniforms.uRise.value = 0;
      /* 0.6-3.4 s: rain from the chunks */
      if (t > 0.6 && t < 4.6) { const n = Math.round(560 * dt); for (let q = 0; q < n; q++) { const ch = D.chunks[Math.floor(Math.random() * D.chunks.length)]; _c.copy(ch.m.geometry.boundingSphere.center).applyMatrix4(ch.m.matrixWorld); rain.emit(_c.x + (Math.random() - 0.5) * 0.5 * S, _c.y - 0.1 * S, _c.z + (Math.random() - 0.5) * 0.5 * S, 10 + Math.random() * 4); } }
      /* the oak falls flat and lies there, then fades */
      if (D.club) { const g = D.club; const ground = D.at.y + 0.15; if (!D.clubDown) { D.cv.y -= 9.8 * dt; g.position.addScaledVector(D.cv, dt); g.rotation.x += D.cw.x * dt; g.rotation.z += D.cw.z * dt; if (g.position.y <= ground) { g.position.y = ground; D.clubDown = true; H.shake = Math.max(H.shake, 0.35); } }
        const cf = 1 - sstep(4.8, 5.6, t); if (cf < 1) for (const m of club.userData.mats) setOpacity(m, cf); g.visible = cf > 0.02; } /* the oak lies in the grass to the end */
    }
    bodyM.uniforms.uA.value = 0.9 * (1 - sstep(0.3, 1.4, t));
    rain.alpha = sstep(0.5, 0.9, t) * (1 - sstep(4.4, 5.2, t));
    bowMat.uniforms.uA.value = sstep(1.6, 3.0, t); beamMat.uniforms.uA.value = sstep(1.2, 2.4, t) * (1 - sstep(3.8, 4.6, t) * 0.5);
    /* the death camera frames the head and the chest (was the belly: the head left the letterbox) */
    H.lookAt.set(D.at.x, D.at.y + (1.45 - 1.1 * sstep(0.4, 2.8, t)) * S, D.at.z); /* the look follows the storm down */
    /* the storm goes with him: the sky clears (0.8-2.6 s) and the light comes back brighter for the rainbow */
    if (!far) { STORM.k = Math.min(STORM.k, 1 - sstep(0.8, 2.6, t)); STORM.clear = sstep(1.2, 3.0, t); }
  };
  const updateFx = (dt) => {
    /* the inner flash: a quick bright stutter, then it dies */
    if (innerT >= 0) { innerT += dt; const st = innerT < 0.07 ? 1 : innerT < 0.12 ? 0.25 : innerT < 0.2 ? 0.8 : Math.max(0, 1 - (innerT - 0.2) / 0.25);
      flashU.uFlash.value = flashK * st; crackM.uniforms.uA.value = innerT < 0.24 ? (Math.random() < 0.8 ? 1.2 : 0.3) * st : 0; if (innerT > 0.45) { innerT = -1; flashU.uFlash.value = 0; for (const c of cracks) c.visible = false; } }
    if (boltT >= 0) { boltT += dt; const on = boltT < 0.42;
      boltMat.uniforms.uA.value = on ? (boltT < 0.06 ? 1.8 : boltT < 0.1 ? 0.3 : (Math.random() < 0.75 ? 1.1 : 0.4) * (1 - boltT / 0.42 * 0.7)) : 0;
      glowM.opacity = Math.max(0, 1 - boltT / 0.35); ringMat.opacity = Math.max(0, 0.8 - boltT * 1.5); for (const rg of rings) rg.scale.setScalar(0.6 + boltT * 10);
      if (!on) for (const b of bolts) b.visible = false; if (boltT > 0.6) { for (const m of [...rings, ...glows]) m.visible = false; boltT = -1; } }
    /* scorches: dark at once, an ember glow for a second, then fade out between 4 and 6 s */
    for (const sc of scorches) { if (!sc.visible) continue; sc.userData.t += dt; const t = sc.userData.t; sc.material.opacity = 0.62 * sstep(0, 0.08, t) * (1 - sstep(4, 6, t)); if (t > 6) sc.visible = false; }
  };
  H.update = (dt, st = {}) => {
    H.time += dt; if (st.player) player = st.player;
    for (const m of [bodyM, deathM, smokeM]) m.uniforms.uTime.value = H.time;
    updateFx(dt); updateSmoke(dt);
    if (death) { updateDeath(dt); rain.update(dt); return; }
    /* the storm grumbles inside him now and then */
    nextInner -= dt; if (nextInner <= 0 && innerT < 0) { nextInner = (0.9 + Math.random() * 2.2) / (1 + 1.4 * phaseK); innerStrike((0.7 + Math.random() * 0.6) * (1 + 0.35 * phaseK)); } /* it flashes more often and brighter in its later phases */
    const fl = Math.random() < 0.08 ? 0.3 : 1; const pulse = 0.65 + 0.35 * Math.sin(H.time * 13) * Math.sin(H.time * 5.3);
    sparkM.opacity = 0.55 + 0.45 * pulse * fl; hideEyes();
    if (!far) {
      rain.ground = actor.root.position.y; armRain += dt * 80;
      while (armRain >= 1) { armRain -= 1; const b = rainBones[Math.floor(Math.random() * rainBones.length)]; if (!b) break; b.getWorldPosition(_b); rain.emit(_b.x + (Math.random() - 0.5) * 0.7, _b.y - Math.random() * 0.3, _b.z + (Math.random() - 0.5) * 0.7, 9); }
      rain.update(dt);
      /* the storm builds over the arena while he lives (about 3 s from his first step) */
      STORM.k = Math.min(1, STORM.k + dt / 3); STORM.clear = 0;
    }
    /* the camera's mark is the top of his cloud crown (0.54 S over the head bone), so the view keeps the whole head
       under the boss bar (fight.js holds the mark about 0.34 rad over the view centre) */
    head.getWorldPosition(H.lookAt); H.lookAt.y += 0.54 * S;
    clubClear(dt);
    club.updateMatrixWorld(true); H.maulHead.copy(club.userData.tip).applyMatrix4(club.matrixWorld);
  };
  /* its phases: the storm inside him wakes (more and brighter flashes) and a bolt strikes beside the hero */
  let phaseK = 0;
  H.onPhase = (p) => { phaseK = p >= 2 ? 1 : 0.5; try { const pl0 = player || actor.root.position; const g = actor.root.position; _a.set(g.x - pl0.x, 0, g.z - pl0.z); const d = Math.max(1, _a.length()); _a.normalize(); strikeAt(0, pl0.x + _a.x * d * 0.6 + _a.z * 3, actor.root.position.y, pl0.z + _a.z * d * 0.6 - _a.x * 3); boltT = 0; innerStrike(1.3); } catch { /* fx only */ } H.shake = Math.max(H.shake, 0.6); };
  H.prewarm = () => {};
  H.warmMats.push(...mats);
  H.deathSize = 1.75 * S; /* the death director frames him by his full height */
  H.dispose = () => { if (!far) { STORM.k = 0; STORM.clear = 0; } for (const fn of disposers) fn(); disposers.length = 0; for (const m of mats) m.dispose(); actor.meshes.forEach((m, i) => { if (baseMats[i]) m.material = baseMats[i]; }); };
  H.mats = mats;
  return H;
}

/* ================================================================ skyNemesis */
/* stormgiant: a sunlit cloud bank on the horizon whose outline is a giant: a head with a crown of cloud, broad shoulders,
   the right arm raised (lightning at the fist now and then), the body melting into the bank below.
   blackknight (figures): was null (the dark world's crowned twin knight, hovering over a hill in a crouch, glowing
   eyes, no sword). Now the Black Knight himself: the real rig in his black enamel toy armour and black plume, the cloak
   in the wind, a heater shield on his left arm, his sword planted point-down before him, a still wide stance on the
   hill line (web/src/worlds/sky-figure.js); his visor turns to follow the walker.
   the cloud material is a ShaderMaterial without fog uniforms; in ctx.mats the camp's freeEnemy set fog = true on
   it and three threw in refreshFogUniforms every frame (the game froze after a storybook camp). It now stays out of
   ctx.mats and reads the line's fade from ctx.mats[0]. */
export function skyNemesis(nemesisId, ctx) {
  if (nemesisId === 'blackknight') return blackKnightFar(ctx);
  if (nemesisId !== 'stormgiant') return null;
  return stormGiantFar(ctx);
}
/* the far giant IS the giant you fight: the same rig dressed by stormGiant (billowed storm lumps, the pale crown, the
   brow, the glowing eyes, the beard, the oak), only 92 m tall, with no rain and no weather of its own. He idles slowly in a
   skirt of cloud; a bolt forks down beside him now and then and the storm flickers inside him. On the Cloud Peaks the
   ground on the line falls into the cloud sea, so he wades in it (never sunk to the eyes). The fx of the fight dress go to
   a group that is never drawn. Every material fades with the line (ctx.mats[0], as before). */
async function stormGiantFar(ctx) {
  const T = ctx.THREE || THREE; const g = new T.Group(); const r = rnd(808);
  const fadeOf = () => (ctx.mats[0] ? ctx.mats[0].opacity : 1);
  const actor = await makeActor(KNIGHT_URL); actor.noBlob = true;
  const HT = 92; const S = HT / 1.95; const sink = new T.Group();
  const D = stormGiant(actor, { scene: sink, size: S, far: true });
  for (const m of actor.meshes) if (!m.visible) m.removeFromParent();
  actor.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  const clip = actor.has?.('Idle_Loop') ? 'Idle_Loop' : 'Idle'; actor.play(clip, { speed: 0.3, fade: 0 }); actor.mixer.update(0.4 + Math.random());
  const fig = new T.Group(); fig.add(actor.root); g.add(fig);
  /* the skirt: a wide bank of cloud round his legs, lit white on top, slate below; a thin mist behind the body */
  const mat = cloudMaterial({ lit: 0xf2f5fb, shade: 0x5e6c8a, opacity: 0, depthWrite: false });
  const P = [];
  const fill = (cx, cy, rx, ry, n2, size, shade, z0) => { for (let i = 0; i < n2; i++) { const a = r() * 6.283; const d = Math.sqrt(r()); P.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, z0 + (r() - 0.5) * 12, size * (0.7 + r() * 0.6), shade + (r() - 0.5) * 0.2]); } };
  fill(0, 7, 74, 9, 46, 16, 0.6, 6);
  fill(0, 16, 30, 6, 12, 10, 0.5, -10);
  const bank = cloudMesh(P, mat, 9); g.add(bank);
  const boltMat = glowBoltMaterial(0x9cc4ff, 2.2);
  const bolt = new T.Mesh(glowBoltGeo(r, 60, 9, 3), boltMat); bolt.frustumCulled = false; bolt.position.set(38, 0, 6); bolt.visible = false; g.add(bolt);
  /* the dress's own materials: solid ones fade by opacity, the painted puffs by their uA */
  const solid = D.mats.filter((m) => !m.uniforms); const puffs = D.mats.filter((m) => m.uniforms?.uA && m.uniforms?.uLit).map((m) => [m, m.uniforms.uA.value]);
  let lastF = -1; let nextBolt = 3; let show = 0; let gy = 0; let gAt = -9;
  const ground = () => { const holder = g.parent; const sc = holder?.parent; const gfn = sc?.userData?.groundAt; if (!gfn) return 0; holder.getWorldPosition(_a); let m = Infinity;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const rr = i ? HT * 0.12 : 0; m = Math.min(m, gfn(_a.x + Math.cos(a) * rr, _a.z + Math.sin(a) * rr) || 0); }
    /* the ground fell into the cloud sea (Cloud Peaks): he wades in the sea, not in the pit under it */
    wade = Number.isFinite(m) && m < -20;
    return Number.isFinite(m) ? (wade ? -5 : m) : 0; };
  let wade = false;
  return {
    object: g, dist: 300,
    update(dt, t) {
      const posed = g.parent && Math.abs(g.parent.scale.y - 1) > 1e-3;
      if (posed) g.position.y = 0; else { if (t - gAt > 1) { gAt = t; gy = ground(); } g.position.y = gy - HT * 0.05; }
      /* in the cloud sea the skirt rides on the sea's billows: a puff cut by the opaque sea showed as hard white streaks */
      bank.position.y = !posed && wade ? 34 : 0;
      D.update(dt, {}); actor.mixer.update(dt);
      const f = fadeOf();
      if (Math.abs(f - lastF) > 1e-3) { lastF = f; for (const m of solid) { if (m.blending !== T.NormalBlending) continue; const tr = f < 0.99; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = f; } for (const [m, a0] of puffs) m.uniforms.uA.value = a0 * f; }
      mat.uniforms.uA.value = f * 0.95; mat.uniforms.uTime.value = t;
      nextBolt -= dt; if (nextBolt <= 0) { nextBolt = 3 + Math.random() * 5; show = 0.35; bolt.rotation.y = Math.random() * 6.28; bolt.position.x = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 14); }
      if (show > 0 && f > 0.3) { show -= dt; bolt.visible = true; boltMat.uniforms.uA.value = (Math.random() < 0.7 ? 1 : 0.3) * f; } else { show = Math.max(0, show - dt); bolt.visible = false; boltMat.uniforms.uA.value = 0; }
    },
    dispose() { D.dispose(); actor.dispose(); bank.geometry.dispose(); bolt.geometry.dispose(); boltMat.dispose(); mat.dispose(); },
  };
}

/* the Black Knight on the hill line (see skyNemesis above) */
async function blackKnightFar(ctx) {
  const n = worldById('storybook').nemeses.find((x) => x.id === 'blackknight'); if (!n) return null;
  const wear = [...(n.look.wear || []), 'Plume'];
  return skyFigure(ctx, {
    look: { ...n.look, wear }, wearUrl: '/assets/real/wear_storybook.glb', height: 30, dist: 205, clip: 'Idle_Loop', speed: 0.35,
    color: 0x0c0c12, wind: ['Cloak', 'Surcoat', 'Cape'], windAmp: 0.13, windTop: 1.35, windBottom: 0.3,
    stance: 0.16, lean: 0.03, arms: [0.24, 0.08], crown: 0.4, dust: 0xeef0e2, dustOp: 0.22, dustN: 8,
    weapon: (T, mat, geos) => {
      const g = new T.Group();
      const bl = new T.BoxGeometry(0.06, 0.95, 0.014); bl.translate(0, -0.6, 0); geos.push(bl); g.add(new T.Mesh(bl, mat));
      const tip = new T.ConeGeometry(0.03, 0.1, 4); tip.rotateZ(Math.PI); tip.translate(0, -1.12, 0); geos.push(tip); g.add(new T.Mesh(tip, mat));
      const cg = new T.BoxGeometry(0.3, 0.035, 0.04); cg.translate(0, -0.1, 0); geos.push(cg); g.add(new T.Mesh(cg, mat));
      const gr = new T.CylinderGeometry(0.018, 0.018, 0.16, 6); gr.translate(0, -0.0, 0); geos.push(gr); g.add(new T.Mesh(gr, mat));
      const pm = new T.SphereGeometry(0.035, 8, 6); pm.translate(0, 0.09, 0); geos.push(pm); g.add(new T.Mesh(pm, mat));
      return g;
    },
    weaponRot: [0.12, 0, 0],
    offhand: (T, mat, geos) => {
      /* a heater shield: flat top, the sides curving to a point; carried on the left forearm, its face out */
      const sh = new T.Shape(); sh.moveTo(-0.27, 0.3); sh.lineTo(0.27, 0.3); sh.quadraticCurveTo(0.29, -0.22, 0, -0.46); sh.quadraticCurveTo(-0.29, -0.22, -0.27, 0.3);
      const geo = new T.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: false }); geo.translate(0, -0.12, 0); geos.push(geo);
      const g = new T.Group(); const m = new T.Mesh(geo, mat); m.position.x = 0.12; m.rotation.y = Math.PI / 2; g.add(m); return g;
    },
    offhandRot: [0, 0.25, 0],
  });
}

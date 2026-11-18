/* The E-key powers.
   Thirteen mechanics, each with its own input, risk and screen read. A world element names one in the kit
   (`elements.<id>.power` in game/kit.mjs and game/worlds/*.mjs); the look (colours, style) is keyed here by world:element.
   One GPU-friendly particle system (instanced billboards: one additive draw, one smoke draw), one ground decal draw and one
   point light serve every power. All three are built and drawn once at fight start, so a first cast never compiles a shader.
   Test hooks: ?power=<mechanic id> forces a mechanic (the world's own power of that mechanic gives the name and look). */
import * as THREE from 'three';
import { sfx } from './sfx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;
const EYE = 2.08;

/* ---------- the mechanics ---------- */
/* cd = cooldown in seconds; label = the generic name (a forced mechanic outside its world); note = the forge line */
export const MECHANICS = {
  breath: { cd: 9, label: 'Breath', note: 'a cone you hold on them; it burns or chills for as long as it pours' },
  chill: { cd: 10, label: 'Frost burst', note: 'freezes the small ones solid and slows the big ones; a heavy blow shatters them' },
  bolt: { cd: 7, label: 'Chain bolt', note: 'a bolt you aim; it jumps from foe to foe' },
  mark: { cd: 8, label: 'Mark', note: 'marks one foe; your next heavy blow on it explodes' },
  summon: { cd: 11, label: 'Spirits', note: 'spirits that hunt your foes while you fight' },
  ward: { cd: 12, label: 'Ward', note: 'a ward that throws the next blow back at the one who struck' },
  rain: { cd: 10, label: 'Sky strike', note: 'calls strikes down on a spot after a short warning' },
  dash: { cd: 7, label: 'Dash cut', note: 'you pass through them and every one in the way is cut' },
  slam: { cd: 10, label: 'Ground slam', note: 'a ring from the ground that throws everything near you back' },
  pulse: { cd: 9, label: 'Pulse', note: 'stops every blow being readied near you and drops fliers' },
  bomb: { cd: 9, label: 'Bomb', note: 'a lobbed charge on a short fuse; stand clear' },
  vortex: { cd: 11, label: 'Whirlwind', note: 'a whirlwind that drags foes in, spins them and throws them' },
  wall: { cd: 12, label: 'Wall', note: 'a wall that holds foes back and snares those who touch it' },
};
export const DEFAULT_BY_ELEMENT = { fire: 'breath', frost: 'chill', storm: 'bolt', shadow: 'mark' };

/* ---------- the looks: colour ramps per world power ---------- */
/* core = the hot centre, mid = the body, end = what it cools to, smoke = a normal-blend tint, style = a variant inside a mechanic */
const LOOKS = {
  'dark:fire': { core: 0xfff2c0, mid: 0xff7a1a, end: 0xa0200a, smoke: 0x2a1e18, decal: 0xff6a20, style: 'fire' },
  'dark:frost': { core: 0xffffff, mid: 0x9fe6ff, end: 0x3a7fd0, smoke: 0xcfe8ff, decal: 0xbfeaff, style: 'ice' },
  'dark:storm': { core: 0xffffff, mid: 0xc8b8ff, end: 0x6a4cff, smoke: 0x2a2440, decal: 0xb8a6ff },
  'dark:shadow': { core: 0xffd8d8, mid: 0xff2030, end: 0x500008, smoke: 0x1a0508, decal: 0xff2030, style: 'blood' },
  'edo:fire': { core: 0xeafff6, mid: 0x38f0c0, end: 0x1a5aff, smoke: 0x0c1c24, decal: 0x40e0c0, style: 'wisps' }, /* kitsunebi blue-green */
  'edo:frost': { core: 0xffffff, mid: 0xe6eeff, end: 0x9fb4e0, smoke: 0xe8eef8, decal: 0xdfe9ff, style: 'snow' },
  'edo:storm': { core: 0xffffff, mid: 0xffe27a, end: 0xb08cff, smoke: 0x30283a, decal: 0xffd860, style: 'lightning' },
  'edo:shadow': { core: 0xece4ff, mid: 0x7a5ad0, end: 0x1a1030, smoke: 0x0c0810, decal: 0x8a6ae0, style: 'shadow' },
  'neon:fire': { core: 0xfff2d8, mid: 0xff8a2a, end: 0xff2a7a, smoke: 0x2a1418, decal: 0xff7a3a, style: 'heat' }, /* white-hot to orange to magenta (was pink-red: read as blood) */
  'neon:frost': { core: 0xe8ffff, mid: 0x40f0ff, end: 0x0070ff, smoke: 0xa8f8ff, decal: 0x40f0ff, style: 'cryo' },
  'neon:storm': { core: 0xffffff, mid: 0x3cf2ff, end: 0xff2ad4, smoke: 0x101828, decal: 0x3cf2ff },
  'neon:shadow': { core: 0xffffff, mid: 0xff3cc8, end: 0x5a20ff, smoke: 0x140820, decal: 0xff3cc8, style: 'drone' },
  'frontier:fire': { core: 0xfff0b0, mid: 0xff8a2a, end: 0x8a2a10, smoke: 0x3a2c22, decal: 0xff7a2a, style: 'fire' },
  'frontier:frost': { core: 0xe8f4ff, mid: 0x7ab8ff, end: 0x3a5a9a, smoke: 0x9ab4cc, decal: 0xa8d0f0, style: 'wind' }, /* a blue norther, not snow */
  'frontier:storm': { core: 0xfff0d0, mid: 0xe0b070, end: 0x7a5a38, smoke: 0xa88456, decal: 0xc89a60, style: 'dust' },
  'frontier:shadow': { core: 0xffe6b0, mid: 0xff9a3a, end: 0x40180a, smoke: 0x1c120c, decal: 0xffa040, style: 'dusk' },
  'storybook:fire': { core: 0xfffbe0, mid: 0xffc060, end: 0xff7a2a, smoke: 0x3a2814, decal: 0xffc060, style: 'hearth' },
  'storybook:frost': { core: 0xffffff, mid: 0xd4ecff, end: 0x7fb0ff, smoke: 0xeef6ff, decal: 0xcfeaff, style: 'snow' },
  'storybook:storm': { core: 0xffffff, mid: 0xfff0a0, end: 0xffa8f0, smoke: 0x302a40, decal: 0xfff0a0, style: 'stars' },
  'storybook:shadow': { core: 0xffe0f0, mid: 0xff6ab8, end: 0x5a2048, smoke: 0x3a2a1a, decal: 0x7a4a5a, style: 'bramble' }, /* bramble brown thorns, pink buds */
};

/* ---------- particles: instanced billboards, velocity-stretched, colour and size ramps ---------- */
/* every sprite has a shape (iMisc.x), a seed (iMisc.y) and its life fraction (iMisc.z).
   0 glow   a soft round light (the plain look)
   1 flame  a ragged noisy tongue with a hot core; it boils as it ages (fire, fox fire, heat)
   2 spark  a hard bright streak, stretched along its screen speed (steel, embers, droplets in the smoke pool)
   3 star   a five-point star with a halo (storybook)
   4 leaf   a pointed leaf or petal with a mid vein
   5 shard  a faceted diamond (ice, glass, grit)
   In the smoke pool shape 1 is a billow: a lumpy puff lit from above, so smoke has volume. */
/* three rules for every sprite, in every world.
   - A flame stands up: its long axis follows the world's up on screen (it was turned by its seed, so tongues lay sideways
     and fire read as round puffs).
   - Near the eye a sprite fades (uNear, per pool: the smoke pool fades from 0.9 m to 1.9 m, so blood and smoke never sit on
     the lens) and its size is capped.
   - The HUD band: a sprite within 9 m that lands in the bottom fifth of the view (the health and power bars, the lane) or,
     in the smoke pool, the top tenth (the boss bar) fades out, so no effect draws over HUD bars or text. */
const PVS = `
uniform vec2 uNear; uniform float uAdd;
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec2 iSize; attribute vec3 iMisc;
varying vec4 vCol; varying vec2 vUv; varying vec3 vMisc; varying vec2 vScr;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float dz = -mv.z;
  vec3 vv = mat3(modelViewMatrix) * iVel;
  float L = length(vv.xy);
  vec2 ax = L > 1e-3 ? vv.xy / L : vec2(1.0, 0.0);
  /* shapes that are not stretched turn by their seed (and a leaf tumbles as it ages) */
  /* a negative stretch points the sprite's long (y) axis along its velocity with no stretch (ice spikes, thorns) */
  bool orient = iSize.y < -1e-5 && L > 1e-6;
  bool flame = uAdd > 0.5 && iMisc.x > 0.5 && iMisc.x < 1.5;
  if (orient) ax = vec2(vv.y, -vv.x) / L;
  else if (flame) {
    vec2 up = (mat3(modelViewMatrix) * vec3(0.0, 1.0, 0.0)).xy; float ul = length(up); up = ul > 1e-3 ? up / ul : vec2(0.0, 1.0);
    float w = (iMisc.y - 0.5) * 0.45 + sin(iMisc.z * 9.0 + iMisc.y * 20.0) * 0.08; up = vec2(up.x * cos(w) - up.y * sin(w), up.x * sin(w) + up.y * cos(w));
    ax = vec2(up.y, -up.x);
  }
  else if (iSize.y < 1e-4 || L < 1e-3) { float an = iMisc.y * 6.2832 + iMisc.z * 2.0 * (fract(iMisc.y * 7.0) - 0.5); ax = vec2(cos(an), sin(an)); }
  vec2 ay = vec2(-ax.y, ax.x);
  float sz = min(iSize.x, 0.2 * max(dz, 0.05) + 0.01);
  float sx = sz * (1.0 + max(iSize.y, 0.0) * L);
  if (flame) sx *= 0.62;
  /* a leaf or petal tumbles: it turns edge-on and back as it falls */
  if (iMisc.x > 3.5 && iMisc.x < 4.5) sx *= 0.2 + 0.8 * abs(cos(iMisc.z * (6.0 + 8.0 * iMisc.y) + iMisc.y * 6.2832));
  mv.xy += ax * position.x * sx + ay * position.y * sz;
  gl_Position = projectionMatrix * mv;
  vCol = iCol; vCol.a *= smoothstep(uNear.x, uNear.y, dz); vUv = position.xy * 2.0; vMisc = iMisc;
  vScr = vec2(gl_Position.y / gl_Position.w, dz);
}`;
const PBAND = `
float hudBand(vec2 s, bool smoke) {
  float far = smoothstep(6.0, 9.0, s.y);
  float b = smoothstep(-0.9, -0.52, s.x);
  if (smoke) b *= smoothstep(0.96, 0.8, s.x);
  return mix(b, 1.0, far);
}`;
const PSHAPE = `
varying vec4 vCol; varying vec2 vUv; varying vec3 vMisc; varying vec2 vScr;
${PBAND}
float ph(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float pn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ph(i), ph(i + vec2(1.0, 0.0)), f.x), mix(ph(i + vec2(0.0, 1.0)), ph(i + vec2(1.0, 1.0)), f.x), f.y); }
/* returns alpha in .a and a colour gain in .rgb (1 = the particle colour) */
vec4 shape(vec2 uv, float kind, float seed, float k, bool smoke) {
  float r = length(uv);
  if (kind < 0.5) {
    if (smoke) return vec4(vec3(1.0), smoothstep(1.0, 0.15, r));
    float a = 1.0 - r; a = a * a * a; float core = pow(max(0.0, 1.0 - r * 2.2), 3.0);
    return vec4(vec3(1.0), a + core * 1.2);
  }
  if (kind < 1.5) {
    vec2 q = uv * vec2(1.0, 0.85) + vec2(0.0, 0.15);
    float n = pn(q * 2.3 + vec2(seed * 17.0, -k * 3.2 - seed * 5.0)) * 0.62 + pn(q * 5.1 + vec2(-seed * 9.0, -k * 6.0)) * 0.38;
    float d = length(q) + (n - 0.5) * (smoke ? 0.55 : 0.95);
    if (smoke) { float lit = 0.72 + 0.42 * clamp(uv.y * 0.6 + 0.4, 0.0, 1.0) + (n - 0.5) * 0.3; return vec4(vec3(lit), smoothstep(1.0, 0.2, d) * (0.6 + 0.45 * n)); }
    /* a flame tongue (the sprite stands up, see PVS): a round hot foot, a body that narrows to a licking tip, noise that
       climbs it as it ages; the core is hot near the foot only */
    float y = uv.y * 0.5 + 0.5;
    float fn = pn(vec2(uv.x * 2.2 + seed * 13.0, uv.y * 1.6 - k * 4.0 - seed * 7.0)) * 0.65 + pn(vec2(uv.x * 5.0 - seed * 3.0, uv.y * 3.5 - k * 7.0)) * 0.35;
    float yc = clamp(y, 0.0, 1.0); float wdt = (0.92 - 0.62 * yc * yc) * (0.6 + 0.8 * fn);
    float fd = abs(uv.x - (fn - 0.5) * 0.6 * y) / max(wdt, 0.05) + (pn(uv * 4.0 + vec2(seed * 5.0, -k * 6.0)) - 0.5) * 0.5;
    float fa = smoothstep(1.0, 0.1, fd) * smoothstep(1.0, 0.35, y + (fn - 0.5) * 0.7) * smoothstep(0.0, 0.25, y + 0.04);
    float core = smoothstep(0.6, 0.0, fd) * smoothstep(0.7, 0.05, y) * (1.0 - k * 0.7);
    return vec4(vec3(1.0) + core * 0.5, fa * (0.7 + 0.45 * fn));
  }
  if (kind < 2.5) {
    if (smoke) {
      /* a droplet (blood, ink): +x is its flight, so a round head leads and a thin soft tail follows; a dark rim and a wet
         highlight on the head, so it reads as liquid and not as a flat disc */
      float t = clamp(uv.x * 0.5 + 0.5, 0.0, 1.0);
      float w = mix(0.16, 0.6, smoothstep(0.0, 0.75, t)) * smoothstep(1.02, 0.8, t);
      float dd = length(vec2(uv.x * 0.9, uv.y / max(w, 0.05)));
      float da = smoothstep(1.0, 0.45, dd) * smoothstep(0.0, 0.25, t);
      float hl = smoothstep(0.32, 0.0, length(uv - vec2(0.42, w * 0.3))) * 0.9;
      return vec4(vec3(0.62 + 0.45 * smoothstep(0.9, 0.2, dd) + hl), da);
    }
    float a = smoothstep(1.0, 0.0, r); a *= a;
    float core = smoothstep(0.45, 0.0, r);
    return vec4(vec3(1.0) + core * 2.0, a + core);
  }
  if (kind < 3.5) {
    float an = atan(uv.y, uv.x); float s = 0.42 + 0.58 * pow(abs(cos(an * 2.5)), 5.0);
    float a = smoothstep(s, s * 0.75, r);
    float halo = smoke ? 0.0 : pow(max(0.0, 1.0 - r), 3.0) * 0.5;
    return vec4(vec3(1.0) + smoothstep(0.3, 0.0, r) * 1.2, max(a, halo));
  }
  if (kind < 4.5) {
    vec2 q = uv * vec2(2.3, 1.0); float d = length(q) + abs(uv.y) * 0.35;
    float a = smoothstep(1.0, 0.86, d);
    float vein = smoothstep(0.08, 0.0, abs(uv.x)) * 0.35;
    return vec4(vec3(1.0 - vein + uv.x * 0.25), a);
  }
  if (kind > 5.5) {
    vec2 q = abs(uv); float ray = max(smoothstep(0.07, 0.0, q.y) * (1.0 - q.x), smoothstep(0.07, 0.0, q.x) * (1.0 - q.y));
    float d2 = max(smoothstep(0.05, 0.0, abs(q.x - q.y)) * (1.0 - length(uv)) * 0.5, 0.0);
    float core = smoothstep(0.3, 0.0, r);
    return vec4(vec3(1.0) + core * 1.5, max(max(ray, d2), core));
  }
  vec2 q = abs(uv) * vec2(2.0, 1.0); float d = q.x + q.y;
  float a = smoothstep(1.0, 0.9, d);
  float face = uv.x > 0.0 ? 1.25 : 0.7; float edge = smoothstep(0.75, 0.95, d) * 0.6;
  return vec4(vec3(face + edge), a);
}`;
const PFS_ADD = `${PSHAPE}
void main() {
  if (length(vUv) > 1.0) discard;
  vec4 s = shape(vUv, vMisc.x, vMisc.y, vMisc.z, false);
  s.a *= hudBand(vScr, false);
  if (s.a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * s.rgb * s.a * vCol.a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PFS_SMOKE = `${PSHAPE}
void main() {
  if (length(vUv) > 1.0) discard;
  vec4 s = shape(vUv, vMisc.x, vMisc.y, vMisc.z, true);
  s.a *= hudBand(vScr, true);
  if (s.a * vCol.a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb * s.rgb, clamp(s.a, 0.0, 1.0) * vCol.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const SHAPE = { glow: 0, flame: 1, spark: 2, star: 3, leaf: 4, shard: 5, cross: 6, billow: 1, drop: 2 };

class Pool {
  constructor(scene, max, additive, near = null) {
    this.max = max; this.n = 0; this.additive = additive;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max); this.g = new Float32Array(max); this.dr = new Float32Array(max); this.st = new Float32Array(max);
    this.kd = new Float32Array(max); this.sd = new Float32Array(max); this.kind = 0;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const ia = (k) => new THREE.InstancedBufferAttribute(new Float32Array(max * k), k).setUsage(THREE.DynamicDrawUsage);
    this.aPos = ia(3); this.aVel = ia(3); this.aCol = ia(4); this.aSize = ia(2); this.aMisc = ia(3);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iVel', this.aVel); geo.setAttribute('iCol', this.aCol); geo.setAttribute('iSize', this.aSize); geo.setAttribute('iMisc', this.aMisc);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({ vertexShader: PVS, fragmentShader: additive ? PFS_ADD : PFS_SMOKE, transparent: true, depthWrite: false,
      uniforms: { uNear: { value: new THREE.Vector2(...(near || (additive ? [0.5, 1.8] : [0.9, 1.9]))) }, uAdd: { value: additive ? 1 : 0 } },
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 4 : 3;
    scene.add(this.mesh);
  }
  /* c0 -> c1 over the life (THREE.Color), alpha a, gravity g (+ down, - up), drag dr, stretch st (length per m/s of screen speed) */
  /* kind = the shape (SHAPE); when left out, the pool's current shape (pool.kind, set by the helpers) is used */
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a = 1, g = 0, dr = 0, st = 0, kind = this.kind) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
    const i3 = i * 3; this.kd[i] = kind; this.sd[i] = Math.random();
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.g[i] = g; this.dr[i] = dr; this.st[i] = st;
    this.c0[i3] = c0.r; this.c0[i3 + 1] = c0.g; this.c0[i3 + 2] = c0.b; this.c1[i3] = c1.r; this.c1[i3 + 1] = c1.g; this.c1[i3 + 2] = c1.b;
  }
  update(dt, floor) {
    const { p, v, age, life } = this;
    let i = 0;
    while (i < this.n) {
      age[i] += dt;
      if (age[i] >= life[i]) { this.kill(i); continue; }
      const i3 = i * 3; const dk = Math.max(0, 1 - this.dr[i] * dt);
      v[i3 + 1] -= this.g[i] * dt; v[i3] *= dk; v[i3 + 1] *= dk; v[i3 + 2] *= dk;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      if (p[i3 + 1] < floor + 0.02 && this.g[i] > 0) { p[i3 + 1] = floor + 0.02; v[i3 + 1] = Math.abs(v[i3 + 1]) * 0.3; v[i3] *= 0.6; v[i3 + 2] *= 0.6;
        if (!this.additive && this.kd[i] === 2) { v[i3] = v[i3 + 1] = v[i3 + 2] = 0; age[i] = Math.max(age[i], life[i] * 0.8); } } /* a droplet that lands is gone (the ground stain holds it), it never bounces */
      i++;
    }
    const P = this.aPos.array; const VV = this.aVel.array; const C = this.aCol.array; const S = this.aSize.array; const M = this.aMisc.array;
    for (let j = 0; j < this.n; j++) {
      const j3 = j * 3; const k = age[j] / life[j];
      M[j3] = this.kd[j]; M[j3 + 1] = this.sd[j]; M[j3 + 2] = k;
      P[j3] = p[j3]; P[j3 + 1] = p[j3 + 1]; P[j3 + 2] = p[j3 + 2];
      VV[j3] = v[j3]; VV[j3 + 1] = v[j3 + 1]; VV[j3 + 2] = v[j3 + 2];
      const j4 = j * 4;
      C[j4] = this.c0[j3] + (this.c1[j3] - this.c0[j3]) * k; C[j4 + 1] = this.c0[j3 + 1] + (this.c1[j3 + 1] - this.c0[j3 + 1]) * k; C[j4 + 2] = this.c0[j3 + 2] + (this.c1[j3 + 2] - this.c0[j3 + 2]) * k;
      C[j4 + 3] = this.a0[j] * Math.min(1, age[j] / 0.012) * (1 - k * k);
      S[j * 2] = this.s0[j] + (this.s1[j] - this.s0[j]) * k; S[j * 2 + 1] = this.st[j];
    }
    const n = this.n;
    for (const a of [this.aPos, this.aVel, this.aCol, this.aSize, this.aMisc]) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, n) * a.itemSize); a.needsUpdate = true; }
    this.geo.instanceCount = n;
  }
  kill(i) {
    const l = --this.n; if (i === l) return;
    const i3 = i * 3; const l3 = l * 3;
    for (const arr of [this.p, this.v, this.c0, this.c1]) { arr[i3] = arr[l3]; arr[i3 + 1] = arr[l3 + 1]; arr[i3 + 2] = arr[l3 + 2]; }
    for (const arr of [this.age, this.life, this.s0, this.s1, this.a0, this.g, this.dr, this.st, this.kd, this.sd]) arr[i] = arr[l];
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

/* ---------- ground decals: scorch, ring, rune, crack, frost, strip (one instanced draw) ---------- */
const DVS = `
attribute vec4 iCol; attribute vec4 iData;
varying vec2 vUv; varying vec4 vCol; varying vec4 vData; varying vec2 vScr;
void main() {
  vUv = uv; vCol = iCol; vData = iData;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vScr = vec2(0.0, gl_Position.w); /* only the depth; the screen row is read per fragment (a big quad with a corner behind the eye breaks a per-vertex y/w) */
}`;
const DFS = `
uniform float uTime; uniform float uH;
varying vec2 vUv; varying vec4 vCol; varying vec4 vData; varying vec2 vScr;
${PBAND}
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0; float r = length(p); float ang = atan(p.y, p.x);
  float kind = vData.x; float prog = vData.y; float seed = vData.z; float glow = vData.w;
  float n = vn(p * 3.0 + seed * 7.0) * 0.6 + vn(p * 7.0 + seed * 3.0) * 0.4;
  vec3 col = vCol.rgb; float a = 0.0; vec3 outc = col * glow;
  if (kind < 0.5) {            /* scorch: soot with ash streaks and a thin cooling ember edge (no flat orange disc) */
    float rr = r + (n - 0.5) * 0.55;
    float m = smoothstep(1.0, 0.45, rr);
    float streak = pow(abs(sin(ang * 7.0 + n * 5.0 + seed)), 8.0) * smoothstep(1.05, 0.5, rr) * 0.6;
    float rim = smoothstep(0.6, 0.8, rr) * smoothstep(0.95, 0.82, rr);
    float ember = rim * smoothstep(0.66, 0.78, vn(p * 11.0 + seed)) * prog * 0.35;
    outc = mix(vec3(0.03, 0.025, 0.02) * (0.7 + 0.6 * n), col * glow, ember);
    a = max(m * 0.85, streak) ;
  } else if (kind < 1.5) {     /* ring: a band at radius prog */
    float w = 0.05 + 0.12 * (1.0 - prog);
    a = smoothstep(w, 0.0, abs(r - prog)) * (0.55 + 0.45 * n) + smoothstep(prog, 0.0, r) * 0.1 * (1.0 - prog);
  } else if (kind < 2.5) {     /* rune: two rings, turning ticks, a fill that grows to prog */
    float ring = smoothstep(0.04, 0.0, abs(r - 0.94)) + smoothstep(0.03, 0.0, abs(r - 0.78)) * 0.8;
    float ticks = step(0.79, r) * step(r, 0.93) * smoothstep(0.7, 1.0, abs(sin(ang * 9.0 + uTime * 1.8 + seed)));
    float spokes = smoothstep(0.06, 0.0, abs(sin(ang * 3.0 - uTime * 0.9 + seed)) * r) * step(r, 0.78) * 0.5;
    float fill = smoothstep(prog, prog - 0.1, r) * 0.14;
    a = ring + ticks * 0.75 + spokes + fill;
  } else if (kind < 3.5) {     /* crack: radial cracks with a burnt core */
    float c1 = pow(abs(sin(ang * 5.0 + n * 4.0 + seed)), 34.0) * smoothstep(1.0, 0.15, r);
    float c2 = pow(abs(sin(ang * 9.0 - n * 3.0 + seed * 2.0)), 60.0) * smoothstep(0.8, 0.1, r);
    float cr = max(c1, c2);
    float burn = smoothstep(0.55, 0.0, r + (n - 0.5) * 0.3) * 0.75;
    outc = mix(vec3(0.02, 0.018, 0.016), col * glow, clamp(cr * 1.4, 0.0, 1.0) * prog);
    a = max(burn, cr);
  } else if (kind < 4.5) {     /* frost: a crystalline patch */
    float rr = r + (n - 0.5) * 0.6;
    float m = smoothstep(1.0, 0.55, rr) * step(rr, prog * 1.05 + 0.02);
    float cry = pow(abs(sin(ang * 6.0 + n * 3.0)), 6.0) * 0.5 + pow(n, 3.0) * 1.2;
    a = m * (0.42 + 0.45 * cry);
    outc = col * (0.8 + glow * cry * 0.6);
  } else if (kind < 5.5) {     /* strip: a long band revealed along its length to prog */
    float side = smoothstep(1.0, 0.25, abs(p.y) + (n - 0.5) * 0.4);
    float ends = smoothstep(1.0, 0.8, abs(p.x));
    float shown = smoothstep(prog * 2.0 - 1.0 + 0.05, prog * 2.0 - 1.0 - 0.05, p.x);
    a = side * ends * shown * (0.55 + 0.45 * n);
  } else {                     /* a soft, broken stain thrown along +x (blood, ink): a mottled blot with a ragged
                                  edge, a few satellite drops stretched along the throw that thin out, a dark wet core; no disc, no square */
    float m2 = vn(p * 4.0 + seed * 2.3) * 0.5 + vn(p * 9.0 - seed) * 0.3 + vn(p * 21.0 + seed * 5.0) * 0.2;
    vec2 c0 = (p + vec2(0.4, 0.0)) * vec2(1.0, 1.45);
    float blot = smoothstep(0.42, 0.12, length(c0) + (m2 - 0.5) * 0.5);
    float drops = 0.0;
    for (int i = 0; i < 9; i++) {
      float fi = float(i); float hx = h21(vec2(fi * 1.7, seed)); float hy = h21(vec2(seed * 1.3, fi + 3.0));
      vec2 c = vec2(-0.25 + hx * 1.05, (hy - 0.5) * (0.2 + hx * 0.7)); float rr = 0.075 * (1.0 - hx * 0.7) * (0.7 + 0.6 * h21(vec2(fi, seed * 3.1)));
      drops = max(drops, smoothstep(rr, rr * 0.3, length((p - c) * vec2(0.55, 1.0))));
    }
    float body = max(blot, drops * 0.85);
    a = body * (0.5 + 0.5 * m2) * smoothstep(1.0, 0.75, max(abs(p.x), abs(p.y)));
    outc = col * (0.42 + 0.4 * m2) * mix(0.6, 1.0, smoothstep(0.0, 0.35, length(c0)));
  }
  a *= hudBand(vec2(gl_FragCoord.y / uH * 2.0 - 1.0, vScr.y), false);
  gl_FragColor = vec4(outc, clamp(a, 0.0, 1.0) * vCol.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const KIND = { scorch: 0, ring: 1, rune: 2, crack: 3, frost: 4, strip: 5, splat: 6 };
class Decals {
  constructor(scene, max = 48) {
    this.max = max; this.list = [];
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iCol', this.aCol); geo.setAttribute('iData', this.aData);
    this.uTime = { value: 0 }; this.uH = { value: 720 };
    this.mat = new THREE.ShaderMaterial({ vertexShader: DVS, fragmentShader: DFS, uniforms: { uTime: this.uTime, uH: this.uH }, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 2;
    scene.add(this.mesh); this.geo = geo;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = V(); this._p = V(); this._up = V(0, 1, 0);
  }
  /* kind, x, y, z, size (m across), len (strip length; else = size), rot, color, glow, alpha, life, prog [from, to, secs] */
  add(o) {
    const d = { kind: KIND[o.kind] ?? 0, x: o.x, y: o.y ?? 0, z: o.z, size: o.size || 2, len: o.len || o.size || 2, rot: o.rot ?? Math.random() * TAU,
      color: new THREE.Color(o.color ?? 0xffffff), glow: o.glow ?? 1.5, alpha: o.alpha ?? 1, life: o.life ?? 3, age: 0,
      p0: o.prog?.[0] ?? 1, p1: o.prog?.[1] ?? 1, pt: o.prog?.[2] ?? 0.0001, prog: o.prog?.[0] ?? 1, seed: Math.random() * 10, fade: o.fade ?? 0.35, hold: !!o.hold, grow: o.grow ?? 0 };
    if (this.list.length >= this.max) { const i = this.list.findIndex((x) => !x.hold); this.list.splice(i < 0 ? 0 : i, 1); } /* a held ward ring or mark rune is never the one dropped */
    this.list.push(d); return d;
  }
  update(dt, clock, h) {
    this.uTime.value = clock; if (h) this.uH.value = h;
    this.list = this.list.filter((d) => { d.age += dt; return d.hold || d.age < d.life; });
    const C = this.aCol.array; const D = this.aData.array; let i = 0;
    for (const d of this.list) {
      if (!d.manual) d.prog = d.p0 + (d.p1 - d.p0) * clamp(d.age / d.pt, 0, 1);
      const out = d.hold ? 1 : d.killAt != null ? clamp(1 - (d.age - d.killAt) / 0.25, 0, 1) : clamp((d.life - d.age) / (d.life * d.fade), 0, 1);
      const inn = clamp(d.age / 0.06, 0, 1);
      const sc = d.grow ? 1 + d.grow * clamp(d.age / 0.3, 0, 1) : 1;
      this._q.setFromAxisAngle(this._up, d.rot); this._s.set(d.len * sc, 1, d.size * sc); this._p.set(d.x, d.y + 0.035, d.z);
      this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
      C[i * 4] = d.color.r; C[i * 4 + 1] = d.color.g; C[i * 4 + 2] = d.color.b; C[i * 4 + 3] = d.alpha * out * inn;
      D[i * 4] = d.kind; D[i * 4 + 1] = d.prog; D[i * 4 + 2] = d.seed; D[i * 4 + 3] = d.glow;
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true; this.aCol.needsUpdate = true; this.aData.needsUpdate = true;
  }
  remove(d) { if (!d || d.killAt != null) return; d.hold = false; d.killAt = d.age; d.life = d.age + 0.25; }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mat.dispose(); this.mesh.dispose?.(); }
}

/* ---------- HUD style for the power slot (index.html owns #ability; this only adds states) ---------- */
/* the HUD style for the power slot lives in web/index.html now (#ability states, #pw-veil) */

/* ---------- the powers ---------- */
export class Powers {
  constructor(fight) {
    const F = fight; this.f = F;
    const kit = F.kit || {}; const wid = kit.id || 'dark';
    const forced = new URLSearchParams(location.search).get('power');
    let el = F.element;
    let id = el.power || DEFAULT_BY_ELEMENT[el.id] || 'breath';
    if (forced && MECHANICS[forced] && forced !== id) {
      /* a forced mechanic: the world's own power of that mechanic gives the name and look when it has one */
      const own = (kit.ELEMENTS || []).find((e) => (e.power || DEFAULT_BY_ELEMENT[e.id]) === forced);
      if (own) el = own;
      id = forced;
      this.forcedName = own ? own.ability : MECHANICS[forced].label;
    }
    this.id = id; this.el = el; this.name = this.forcedName || F.element.ability;
    const L = LOOKS[`${wid}:${el.id}`] || LOOKS[`dark:${el.id}`] || {};
    const c = (x, d) => new THREE.Color(x ?? d);
    this.look = { core: c(L.core, 0xffffff), mid: c(L.mid, el.color), end: c(L.end, el.color), smoke: c(L.smoke, 0x202020), decal: L.decal ?? el.color, style: L.style || '' , hex: L.mid ?? el.color };
    this.look.mid2 = this.look.mid.clone().multiplyScalar(2.2); this.look.core2 = this.look.core.clone().multiplyScalar(2.6); this.look.end2 = this.look.end.clone().multiplyScalar(1.4);
    this.look.smokeEnd = this.look.smoke.clone().multiplyScalar(0.6);
    this.look.fire = this.look.mid.clone().multiplyScalar(0.92); /* the opaque flame body (normal blend): saturated, it cools to deep red */
    this.look.fireEnd = this.look.end.clone().multiplyScalar(0.45);
    F.abilityMax = MECHANICS[id].cd; F.abilityCd = 0;
    const scene = F.world.scene;
    this.add = new Pool(scene, 3600, true); this.smoke = new Pool(scene, 1100, false); this.decals = new Decals(scene, 96);
    this.smoke.kind = SHAPE.billow; /* smoke has volume unless a caller asks for another shape */
    /* one light for every power; it is added with the fight's own lights, so no material compiles twice */
    this.light = new THREE.PointLight(this.look.mid, 0, 14, 1.6); this.light.position.set(0, -50, 0); scene.add(this.light);
    this.lightT = 0; this.lightDur = 0; this.lightI = 0;
    this.tasks = []; this.active = null; this.ward = null; this.objs = []; this.state = ''; this.clock = 0;
    this.white = new THREE.Color(1, 1, 1); this.black = new THREE.Color(0, 0, 0); this._c = new THREE.Color();
    this.veil = document.createElement('div'); this.veil.id = 'pw-veil'; document.body.appendChild(this.veil);
    this.prewarm();
  }

  /* one invisible particle in each pool and one invisible decal, in front of the camera, for a few frames: the programs compile now */
  prewarm() {
    const cam = this.f.world.camera; const p = V(0, 0, -3).applyMatrix4(cam.matrixWorld);
    for (let i = 0; i < 2; i++) { this.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.3, 0.01, 0.01, this.white, this.white, 0); this.smoke.emit(p.x, p.y, p.z, 0, 0, 0, 0.3, 0.01, 0.01, this.white, this.white, 0); }
    this.decals.add({ kind: 'scorch', x: p.x, z: p.z, size: 0.01, alpha: 0, life: 0.3 });
    this.add.update(0, -9); this.smoke.update(0, -9); this.decals.update(0, 0);
  }

  /* ---------- shared helpers ---------- */
  gy(x, z) { const F = this.f; return F.journey ? F.journey.gy(x, z) : 0; }
  live() { return this.f.foes.filter((f) => f.state !== 'dead' && f.state !== 'spawn' && !f.gone); }
  body(f, out = V()) { return out.set(f.pos.x, this.gy(f.pos.x, f.pos.z) + (f.fly ? f.flyY + 0.95 * f.scale : 1.25 * f.scale), f.pos.z); }
  aim() { const F = this.f; const cp = Math.cos(F.pitch); return V(-Math.sin(F.yaw) * cp, Math.sin(F.pitch), -Math.cos(F.yaw) * cp).normalize(); }
  flat() { return this.f.forward(); }
  hand(out = V()) { const cam = this.f.world.camera; return out.set(0.28, -0.3, -0.75).applyMatrix4(cam.matrixWorld); }
  later(t, fn) { this.tasks.push({ t, fn }); }
  /* a power lights the place it lands, not the whole screen:
     the light is under half as strong and reaches three quarters as far as in */
  flashLight(at, color, I, dur, dist = 14) { this.light.position.copy(at); this.light.color.set(color); this.light.distance = dist * 0.75; this.lightI = I * 0.42; this.lightDur = dur; this.lightT = 0; }
  veilFlash(css, ms = 160, op = 1) { const v = this.veil; v.style.boxShadow = css; v.style.opacity = String(op); clearTimeout(this.veilT); if (ms > 0) this.veilT = setTimeout(() => { v.style.opacity = '0'; }, ms); }
  power() { return this.f.power; }
  status(f) { return (f.pw ||= { burn: 0, chill: 0, chillK: 1, root: 0, caught: 0, mark: 0, tick: 0, flinch: -9 }); }
  /* a power blow on a foe: a boss takes less, its own bar note says what happened */
  hit(f, dmg, dir, o = {}) {
    if (f.state === 'dead') return;
    const F = this.f;
    if (f.boss) { dmg *= o.bossK ?? 0.6; o = { ...o, knock: Math.min(o.knock ?? 1, 0.2), knockdown: false }; }
    F.damageFoe(f, dmg, dir, { knock: o.knock ?? 1, heavy: !!o.heavy, poise: o.poise ?? 2, color: o.color ?? this.look.hex, at: o.at || null, quiet: !!o.quiet, knockdown: !!o.knockdown });
  }
  /* damage over time: no flinch, no armour break; it can still kill */
  tick(f, dmg, color) {
    if (f.state === 'dead') return;
    const F = this.f; if (f.boss) dmg *= 0.6 * F.bossMul;
    f.hp -= dmg; f.actor?.flash?.(color ?? this.look.hex, 60, 0.02);
    if (f.hp <= 0) { F.killFoe(f, { dir: V().subVectors(f.pos, F.pos).setY(0).normalize() }); return; }
    if (f.boss) F.bossPhase(f);
  }
  /* the nearest dragon part within r of a point (the dragon is this.f.boss) */
  dragonHit(at, r, dmg, heavy = false) {
    const B = this.f.boss; if (!B || B.dead || !B.hittable) return false;
    let best = null; let bd = r;
    for (const h of B.hittable()) { const d = Math.hypot(h.pos.x - at.x, h.pos.z - at.z) - (h.radius ?? 0.6); if (d < bd) { bd = d; best = h; } }
    if (!best) return false;
    const dir = V().subVectors(best.pos, this.f.pos).setY(0).normalize();
    this._own = true; try { B.damage(best.id, dmg * this.power() * this.f.bossMul, dir, { heavy, crit: false }); } finally { this._own = false; }
    return best;
  }
  bossNote(f, text) { if (f.boss || f === true) this.f.bossNote?.(text, 1600); }
  burst(at, n, speed, life, size, c0, c1, o = {}) {
    for (let i = 0; i < n; i++) {
      const u = rand(-1, 1); const a = rand(0, TAU); const s = Math.sqrt(1 - u * u); const sp = speed * rand(o.min ?? 0.35, 1);
      const vy = (o.flat ? Math.abs(u) * 0.3 : u) * sp + (o.up || 0);
      this.add.emit(at.x, at.y, at.z, Math.cos(a) * s * sp, vy, Math.sin(a) * s * sp, life * rand(0.6, 1), size, o.end ?? size * 0.3, c0, c1, o.a ?? 1, o.g ?? 0, o.drag ?? 1.5, o.st ?? 0.03, o.kind ?? SHAPE.spark); /* streaks, not dots */
    }
  }
  puff(at, n, speed, life, size, color, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU); const sp = speed * rand(0.3, 1);
      this.smoke.emit(at.x + rand(-0.3, 0.3), at.y + rand(-0.2, 0.2), at.z + rand(-0.3, 0.3), Math.cos(a) * sp, rand(0.2, 1) * (o.rise ?? 1.2), Math.sin(a) * sp,
        life * rand(0.7, 1.2), size * 0.6, size * (o.grow ?? 2.2), color, o.endColor ?? this.look.smokeEnd, o.a ?? 0.55, o.g ?? -0.3, o.drag ?? 1.6, 0);
    }
  }
  /* a jagged line of light from a to b (lightning, chains): dense short-lived points */
  arc(a, b, c0, c1, o = {}) {
    const n = o.seg ?? 8; const jit = o.jit ?? 0.55; let prev = a.clone(); const tmp = V();
    for (let s = 1; s <= n; s++) {
      tmp.lerpVectors(a, b, s / n); if (s < n) { tmp.x += rand(-jit, jit); tmp.y += rand(-jit, jit) * 0.8; tmp.z += rand(-jit, jit); }
      const len = prev.distanceTo(tmp); const k = Math.max(2, Math.ceil(len / (o.step ?? 0.045)));
      for (let i = 0; i < k; i++) { const t = i / k; this.add.emit(prev.x + (tmp.x - prev.x) * t, prev.y + (tmp.y - prev.y) * t, prev.z + (tmp.z - prev.z) * t, 0, 0, 0, o.life ?? 0.22, o.size ?? 0.16, (o.size ?? 0.16) * 0.6, c0, c1, 1, 0, 0, 0, SHAPE.glow); }
      /* a wide soft glow round each segment, so a bolt reads as light and not as a dotted line */
      if (o.halo !== false) this.add.emit((prev.x + tmp.x) / 2, (prev.y + tmp.y) / 2, (prev.z + tmp.z) / 2, 0, 0, 0, (o.life ?? 0.22) * 0.8, Math.min(1.2, len * 0.9 + (o.size ?? 0.16) * 3), 0.2, c1, c1, 0.28, 0, 0, 0, SHAPE.glow);
      if (o.branch && Math.random() < 0.3) { const e = tmp.clone().add(V(rand(-1, 1), rand(-1, 0.3), rand(-1, 1)).multiplyScalar(o.branch)); this.arc(tmp.clone(), e, c0, c1, { ...o, seg: 3, branch: 0, size: (o.size ?? 0.16) * 0.6 }); }
      prev = tmp.clone();
    }
  }

  /* ---------- layered effects (hot core -> coloured body -> smoke, sparks with gravity, a light, a ground mark) ---------- */
  /* flame tongues rising from a point; o: spread, vx/vy/vz (a carrier speed), speed, size, life, a, g, drag, c0, c1 */
  flames(at, n, o = {}) {
    const L = this.look; const sp = o.speed ?? 1.2; const s = o.size ?? 0.6; const r = o.spread ?? 0.2;
    for (let i = 0; i < n; i++) {
      const body = !o.glowOnly && i % 3 === 2; /* every third tongue is opaque fire, so a crowd of flames does not burn white (the rest stand up as tongues) */
      (body ? this.smoke : this.add).emit(at.x + rand(-r, r), at.y + rand(-r, r) * 0.6, at.z + rand(-r, r), (o.vx ?? 0) + rand(-sp, sp) * 0.5, (o.vy ?? 0) + rand(0.3, 1) * sp, (o.vz ?? 0) + rand(-sp, sp) * 0.5,
        (o.life ?? 0.6) * rand(0.7, 1.15), s * rand(0.45, 0.75), s * rand(1, 1.45), body ? (o.body ?? L.fire) : o.c0 ?? (i % 3 ? L.mid : L.core), body ? L.fireEnd : o.c1 ?? L.end, body ? 0.85 : o.a ?? 0.6, o.g ?? -1.6, o.drag ?? 1.2, 0, body ? SHAPE.billow : SHAPE.flame);
    }
  }
  /* lumpy smoke that rises and spreads (normal blend, lit from above) */
  billows(at, n, o = {}) {
    const sp = o.speed ?? 1; const s = o.size ?? 1; const r = o.spread ?? 0.3;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU); const v = sp * rand(0.3, 1);
      this.smoke.emit(at.x + rand(-r, r), at.y + rand(-r, r) * 0.5, at.z + rand(-r, r), Math.cos(a) * v + (o.vx ?? 0), rand(0.4, 1) * (o.rise ?? 1.2), Math.sin(a) * v + (o.vz ?? 0),
        (o.life ?? 1.6) * rand(0.75, 1.2), s * 0.5, s * (o.grow ?? 1.8), o.color ?? this.look.smoke, o.endColor ?? this.look.smokeEnd, o.a ?? 0.6, o.g ?? -0.2, o.drag ?? 1.4, 0, SHAPE.billow);
    }
  }
  /* hard streaks that fall (steel sparks, embers, grit); dir may be null (all round) */
  streaks(at, dir, n, speed, c0, c1, o = {}) {
    for (let i = 0; i < n; i++) {
      const u = rand(-1, 1); const a = rand(0, TAU); const s = Math.sqrt(1 - u * u); const sp = speed * rand(0.35, 1);
      let vx = Math.cos(a) * s; let vy = u; let vz = Math.sin(a) * s;
      if (dir) { const c = o.cone ?? 0.55; vx = dir.x + vx * c; vy = dir.y + vy * c + (o.lift ?? 0.25); vz = dir.z + vz * c; }
      (o.smoke ? this.smoke : this.add).emit(at.x, at.y, at.z, vx * sp, vy * sp, vz * sp, (o.life ?? 0.45) * rand(0.6, 1.1), o.size ?? 0.06, (o.size ?? 0.06) * 0.5, c0, c1, o.a ?? 1, o.g ?? 11, o.drag ?? 0.8, o.st ?? 0.035, o.kind ?? SHAPE.spark);
    }
  }
  /* tumbling bits: ice shards, grit, leaves, stars, petals; normal blend unless o.glow */
  bits(at, n, speed, c0, c1, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU); const sp = speed * rand(0.3, 1); const s = (o.size ?? 0.12) * rand(0.6, 1.3);
      (o.glow ? this.add : this.smoke).emit(at.x + rand(-0.15, 0.15), at.y + rand(-0.15, 0.15), at.z + rand(-0.15, 0.15), Math.cos(a) * sp + (o.vx ?? 0), rand(0.2, 1) * speed * (o.up ?? 0.9), Math.sin(a) * sp + (o.vz ?? 0),
        (o.life ?? 1.0) * rand(0.7, 1.2), s, s * (o.end ?? 0.8), c0, c1, o.a ?? 1, o.g ?? 9, o.drag ?? 0.8, 0, o.kind ?? SHAPE.shard);
    }
  }
  /* a fireball: a blinding core, flame tongues thrown out and up, a smoke column that follows, sparks, earth, a light */
  fireball(at, R, o = {}) {
    const L = this.look; const g = this.gy(at.x, at.z);
    for (let i = 0; i < 2; i++) this.add.emit(at.x, at.y, at.z, 0, 0, 0, 0.14, R * 0.5, R * 1.1, L.core, L.mid, 0.8, 0, 0, 0, SHAPE.glow);
    for (let i = 0; i < 70; i++) {
      const u = rand(-0.2, 1); const a = rand(0, TAU); const s = Math.sqrt(1 - u * u); const sp = R * rand(0.8, 2.6);
      (i % 2 ? this.smoke : this.add).emit(at.x, at.y, at.z, Math.cos(a) * s * sp, Math.abs(u) * sp + 1.2, Math.sin(a) * s * sp, rand(0.45, 0.85), R * 0.22, R * rand(0.4, 0.62), i % 2 ? L.fire : i % 4 ? L.mid : L.core, i % 2 ? L.fireEnd : L.end, i % 2 ? 0.9 : 0.5, -2.6, 3.4, 0, i % 2 ? SHAPE.billow : SHAPE.flame);
    }
    this.later(0.1, () => this.billows(V(at.x, g + 0.6, at.z), o.smokeN ?? 26, { speed: R * 0.9, size: R * 0.5, rise: 2.6, life: 2.4, a: o.smokeA ?? 0.75, spread: R * 0.3 }));
    this.streaks(V(at.x, at.y, at.z), null, 80, 15, L.core2, L.mid, { g: 12, life: 0.9, size: 0.07, lift: 0.4 });
    if (o.dirt !== false) this.bits(V(at.x, g + 0.2, at.z), 22, 7, this._c.setHex(o.dirt ?? 0x3a2e24).clone(), this._c.clone().multiplyScalar(0.6), { size: 0.16, g: 16, life: 1.3, up: 1.4 });
    this.flashLight(V(at.x, g + 1.4, at.z), L.mid, 90, 0.5, 20);
  }
  /* how much bigger an effect must be to read at this distance: 1 within 7 m, up to 2.6 on a far giant */
  dk(at) { const cam = this.f.world.camera.getWorldPosition(this._cp ||= V()); return clamp(at.distanceTo(cam) / 7, 1, 2.6); }
  /* small, fast, of many sizes, stretched along their flight, pulled down hard (gravity 22) and
     gone in 0.3-0.6 s; they never climb more than ~0.35 m above where they start and never start inside 1.6 m of the eye */
  droplets(at, dir, n, speed, c0, c1, o = {}) {
    const cam = this.f.world.camera.getWorldPosition(this._cp ||= V()); if (at.distanceTo(cam) < 1.6) return;
    const g = o.g ?? 22; const k = o.k ?? 1; const vmax = Math.sqrt(2 * g * (o.climb ?? 0.35));
    for (let i = 0; i < n; i++) {
      const u = rand(-1, 1); const a = rand(0, TAU); const s = Math.sqrt(1 - u * u); const c = o.cone ?? 0.55; const sp = speed * rand(0.3, 1);
      let vx = Math.cos(a) * s * c; let vy = u * c; let vz = Math.sin(a) * s * c;
      if (dir) { vx += dir.x; vy += dir.y + (o.lift ?? 0.1); vz += dir.z; }
      const L = Math.hypot(vx, vy, vz) || 1; vx *= sp / L; vy = Math.min(vy * sp / L, vmax); vz *= sp / L;
      const sz = (o.size ?? 0.05) * k * Math.pow(Math.random(), 1.3) * 1.8 + 0.03 * k; /* many fine drops, a few big ones */
      this.smoke.emit(at.x + rand(-0.06, 0.06), at.y + rand(-0.06, 0.06), at.z + rand(-0.06, 0.06), vx, vy, vz, rand(o.life0 ?? 0.3, o.life1 ?? 0.6), sz, sz * 0.7, c0, c1, o.a ?? 0.95, g, o.drag ?? 1.2, o.st ?? 0.14, SHAPE.drop);
    }
  }
  /* the hit look of a world (one recipe for all five, each in its own matter). In order:
     a white flash on the foe (fight.damageFoe), a small flare at the contact point for 2-3 frames, a few hard sparks thrown
     along the blow, then what the world bleeds: dark droplets and a thin mist (dark, edo, frontier), sap-free petals and
     leaves that tumble (storybook), hot sparks and a short arc (neon); and a soft, broken stain on the ground. Everything is
     sized by distance (dk), so a hit on a far giant still reads, and nothing is drawn within 1.6 m of the eye. */
  impact(at, dir, color, n, speed, o = {}) {
    const W = this.f.kit?.id || 'dark'; const c = this._c.set(color); const big = n >= 20; const k = this.dk(at);
    const hot = c.clone().lerp(this.white, 0.5).multiplyScalar(2.2); const cool = c.clone().lerp(new THREE.Color(0xff8a40), 0.5).multiplyScalar(0.7);
    const d = dir ? dir.clone().normalize() : null;
    /* the flare: a short white-hot star at the contact point, a fist across (a head on a far foe), 2-3 frames */
    /* sized to read in a 350 px wide frame (a phone): the flare a hand across and 0.1 s long, 10-14 streaks */
    this.add.emit(at.x, at.y, at.z, 0, 0, 0, 0.1, (big ? 0.7 : 0.5) * k, (big ? 0.95 : 0.7) * k, hot, c, 0.8, 0, 0, 0, SHAPE.glow);
    this.add.emit(at.x, at.y, at.z, 0, 0, 0, 0.09, (big ? 1.3 : 0.95) * k, 0.2, hot, c, 0.9, 0, 0, 0, W === 'storybook' ? SHAPE.star : SHAPE.cross);
    /* hard sparks thrown one way along the blow, streaked, falling */
    this.streaks(at, d, big ? 14 : 10, speed * 1.5, hot, cool, { size: (big ? 0.085 : 0.07) * k, life: 0.36, g: 14, st: 0.1, cone: 0.5 });
    if (o.steel) return;
    if (W === 'storybook') {
      /* petals and leaves, shaped and tumbling (PVS turns a leaf edge-on and back), a few at a time, and two small stars; no
         confetti colours and no ground mark */
      /* gold sparks you can see on a phone, a few petals and leaves, and three stars a palm across (the old tiny
         white stars did not read at 350 px) */
      this.streaks(at, d, big ? 10 : 7, speed * 1.2, new THREE.Color(0xfff0b0).multiplyScalar(2.2), new THREE.Color(0xffa040), { size: 0.075 * k, life: 0.4, g: 6, st: 0.08, cone: 0.6 });
      this.bits(at, big ? 6 : 4, 3, new THREE.Color(0xf6c8d8), new THREE.Color(0xe08aa8), { kind: SHAPE.leaf, size: 0.13 * k, g: 3.2, drag: 2.4, life: 0.9, up: 0.9 });
      this.bits(at, big ? 3 : 2, 3.4, new THREE.Color(0x9cc050), new THREE.Color(0xc8a040), { kind: SHAPE.leaf, size: 0.13 * k, g: 3.6, drag: 2.2, life: 0.9, up: 0.8 });
      this.bits(at, 3, 3, new THREE.Color(0xfff0a0).multiplyScalar(2.2), new THREE.Color(0xffd0f0), { kind: SHAPE.star, glow: true, size: 0.16 * k, g: 2, drag: 2.5, life: 0.5, up: 1 });
    } else if (W === 'neon') {
      this.streaks(at, d, big ? 10 : 7, speed * 1.7, new THREE.Color(0x9ffcff).multiplyScalar(2.2), new THREE.Color(0x0070ff), { size: 0.06 * k, life: 0.3, g: 16, st: 0.1, cone: 0.5 });
      if (big) { const e = at.clone().add(V(rand(-0.5, 0.5), rand(-0.5, 0.2), rand(-0.5, 0.5)).multiplyScalar(k)); this.arc(at, e, new THREE.Color(0xbffcff).multiplyScalar(2), new THREE.Color(0x3cf2ff), { seg: 4, jit: 0.12, size: 0.045 * k, life: 0.1, halo: false }); }
    } else if (!o.bloodless && d) {
      /* blood (edo: blood and a little ink): dark, not saturated, thrown across the view along the blow */
      const blood = this._blood ||= new THREE.Color(); blood.setHex(W === 'edo' ? 0x8a1418 : W === 'frontier' ? 0x84200f : 0x7c1410);
      const dark = (this._blood2 ||= new THREE.Color()).copy(blood).multiplyScalar(0.5);
      const side = V(-d.z, 0, d.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1); const sd = d.clone().multiplyScalar(0.2).add(side).add(V(0, 0.2, 0)).normalize(); /* across the view: a spray thrown straight away from the eye hides behind the body */
      /* round drops with a short tail (st 0.035): the long stretched ones read as floating red rectangles */
      this.droplets(at, sd, big ? 14 : 10, speed * 0.85, blood, dark, { size: (big ? 0.075 : 0.06), k, life0: 0.3, life1: 0.6, st: 0.035 });
      if (W === 'edo') this.droplets(at, d, big ? 6 : 3, speed * 0.7, this._ink ||= new THREE.Color(0x101014), this._ink, { size: 0.05, k, cone: 0.35 });
      /* a thin mist where the blow lands, gone in a third of a second */
      this.smoke.emit(at.x, at.y, at.z, sd.x * 1.2, 0.2, sd.z * 1.2, 0.32, 0.2 * k, 0.55 * k, blood, dark, 0.32, 0, 2, 0, SHAPE.glow);
      const gx = at.x + d.x * 0.8; const gz = at.z + d.z * 0.8; const wst = o.stain;
      if (wst !== null) this.decals.add({ kind: 'splat', x: gx, z: gz, y: this.gy(gx, gz), size: (big ? 0.75 : 0.55) * Math.sqrt(k), len: (big ? 1.5 : 1.1) * Math.sqrt(k), rot: -Math.atan2(d.z, d.x), color: wst ?? dark.getHex(), glow: 1, alpha: 0.85, life: 7, fade: 0.45 });
    }
    if (W === 'frontier') this.billows(at, big ? 3 : 2, { speed: 1.0, size: 0.4 * k, rise: 0.5, life: 0.7, a: 0.35, color: this._dust ||= new THREE.Color(0xb59470), endColor: this._dust2 ||= new THREE.Color(0x8a6e52) });
  }
  /* a parry or a blade on a guard: a hard white-gold star with streaks thrown one way */
  clash(at, dir, color) {
    /* a parry lands at arm's length, where the near fade would hide it: show it 1.7 m out along the same line of sight */
    const cam = this.f.world.camera.getWorldPosition(V()); const off = V().subVectors(at, cam); if (off.length() < 1.7) at = cam.clone().addScaledVector(off.normalize(), 1.7);
    const c = new THREE.Color(color).multiplyScalar(3); const w = new THREE.Color(0xffffff).multiplyScalar(3);
    this.add.emit(at.x, at.y, at.z, 0, 0, 0, 0.16, 0.9, 0.3, w, c, 1, 0, 0, 0, this.f.kit?.id === 'storybook' ? SHAPE.star : SHAPE.cross);
    this.add.emit(at.x, at.y, at.z, 0, 0, 0, 0.18, 0.35, 0.6, c, c, 0.6, 0, 0, 0, SHAPE.glow);
    this.streaks(at, dir ? dir.clone().normalize() : null, 20, 13, w, c, { size: 0.05, life: 0.35, g: 12, st: 0.09, cone: 0.5 });
  }

  /* ---------- the HUD slot ---------- */
  hudName() {
    const F = this.f; const nm = this.name; let st; let txt;
    if (this.ward) { st = 'active'; txt = `${nm} · on`; }
    else if (this.active) { st = 'active'; txt = `${nm} · ${this.active.word || 'casting'}`; }
    else if (this.markOn()) { st = 'active'; txt = `${nm} · hold click`; }
    else if (F.abilityCd > 0) { st = 'cool'; txt = `${nm} · ${Math.ceil(F.abilityCd)}s`; }
    else { st = 'ready'; txt = nm; }
    if (st !== this.state) { this.state = st; const el = document.getElementById('ability'); if (el) el.dataset.state = st; }
    return txt;
  }
  markOn() { if (this.dragonMark > 0) return true; for (const f of this.f.foes) if (f.pw?.mark > 0 && f.state !== 'dead') return true; return false; }

  /* ---------- cast ---------- */
  cast() {
    const F = this.f;
    if (F.over || F.paused || F.abilityCd > 0 || F.stagger > 0 || this.active) return false;
    const ok = this[`c_${this.id}`]();
    if (ok === false) return false;
    F.abilityCd = F.abilityMax; F.stats.abilities++;
    /* no floating name over the foe at the centre of the view: the power bar (#ability, hudName) shows the name and its state */
    F.director.event(`The hero uses ${this.name}: ${MECHANICS[this.id].note}.`);
    return true;
  }

  /* 1. BREATH: hold it on them. A 1.3 s cone; the hero cannot swing while it pours. Fire burns (damage over time); cold chills and pushes. */
  c_breath() {
    const F = this.f; F.swing = null; F.charge = null; F.swingCd = 1.35;
    this.active = { kind: 'breath', t: 0, dur: 1.3, tick: 0, dt: 0, scorch: 0, word: 'pouring' };
    sfx(this.look.style === 'wind' || this.look.style === 'ice' ? 'pwGust' : 'pwBreath'); /* sound */
  }
  u_breath(a, dt) {
    const F = this.f; const L = this.look; const cold = L.style === 'wind' || L.style === 'ice';
    a.t += dt; F.swingCd = Math.max(F.swingCd, 0.1);
    const dir = this.aim(); dir.y = clamp(dir.y, -0.25, 0.2); dir.normalize();
    const cam = F.world.camera; const o = V(0, -0.55, -1.3).applyMatrix4(cam.matrixWorld);
    const ramp = clamp(a.t / 0.15, 0, 1) * clamp((a.dur - a.t) / 0.2, 0, 1);
    const n = Math.round(dt * (cold ? 260 : 150) * ramp + Math.random());
    const g0 = this.gy(F.pos.x, F.pos.z);
    /* the cone is built where the eye sees it: tongues that swell from the mouth to a roaring body 3-7 m out */
    for (let i = 0; i < n; i++) {
      const sp = rand(9, 14); const sx = rand(-1, 1) * 2.2; const sy = rand(-0.5, 0.8) * 1.4; const sz = rand(-1, 1) * 2.2;
      if (cold) this.add.emit(o.x, o.y, o.z, dir.x * sp + sx, dir.y * sp + sy, dir.z * sp + sz, rand(0.45, 0.7), 0.08, 0.3, L.mid, L.end, 0.3, 0.5, 1.6, 0.05, SHAPE.spark);
      /* the body of the flame is opaque fire (orange billows that cool to soot), the glow is a few additive tongues on top:
         stacked additive sprites alone go white, which read as a glow ball */
      /* two in three are standing flame tongues (additive, white-hot at the mouth, orange in the body, red at the tips);
         one in three is the opaque body that cools to soot, so the stream has mass without burning white */
      else if (i % 3 === 0) this.smoke.emit(o.x, o.y, o.z, dir.x * sp + sx, dir.y * sp + sy, dir.z * sp + sz, rand(0.5, 0.75), 0.2, rand(0.9, 1.3), L.fire, L.smokeEnd, 0.6, -2.6, 1.6, 0, SHAPE.billow);
      else this.add.emit(o.x, o.y, o.z, dir.x * sp + sx, dir.y * sp + sy, dir.z * sp + sz, rand(0.35, 0.6), 0.22, rand(0.8, 1.2), i % 4 === 1 ? L.core : L.mid, L.end, 0.32, -2.2, 1.6, 0, SHAPE.flame);
    }
    const fw = (d) => V(F.pos.x + dir.x * d, 0, F.pos.z + dir.z * d);
    if (!cold) {
      /* the body of the fire out where the foes stand, smoke rolling off its top, embers thrown out of it */
      for (let i = 0; i < Math.round(dt * 50 * ramp + Math.random()); i++) { const d = rand(3, 7); const p = fw(d); const sd = rand(-1, 1) * d * 0.22; p.x += -dir.z * sd; p.z += dir.x * sd; p.y = this.gy(p.x, p.z) + rand(0.4, 1.4);
        if (i % 2) this.smoke.emit(p.x, p.y, p.z, dir.x * 4, rand(0.8, 2.2), dir.z * 4, rand(0.35, 0.55), 0.4, rand(1.0, 1.4), L.fire, L.fireEnd, 0.8, -2.6, 2.2, 0, SHAPE.billow);
        else this.add.emit(p.x, p.y, p.z, dir.x * 4, rand(0.8, 2.2), dir.z * 4, rand(0.3, 0.5), 0.35, rand(0.8, 1.1), i % 4 ? L.mid : L.core, L.end, 0.25, -2.6, 2.2, 0.03, SHAPE.flame); }
      if (Math.random() < dt * 22) { const d = rand(3.5, 7.5); const p = fw(d); p.y = EYE + 0.3 + dir.y * d; this.billows(p, 1, { speed: 0.6, size: 1.3, rise: 1.8, life: 1.8, a: 0.55, vx: dir.x * 3, vz: dir.z * 3 }); }
      this.streaks(fw(rand(2, 5)).setY(EYE - 0.6), dir, Math.round(dt * 60 * ramp + Math.random()), 9, L.core2, L.mid, { size: 0.05, life: 0.7, g: 7, lift: 0.5, cone: 0.6 });
    } else {
      /* a cold gust: long wind streaks, a frost breath that rolls along the ground, a few flakes (no snow-white dots) */
      for (let i = 0; i < Math.round(dt * 90 * ramp); i++) { const d = rand(1.5, 4); const p = fw(d); p.x += rand(-1, 1) * 0.8; p.z += rand(-1, 1) * 0.8; p.y = EYE - rand(0.2, 1.4);
        this.add.emit(p.x, p.y, p.z, dir.x * rand(16, 24), rand(-0.5, 0.5), dir.z * rand(16, 24), rand(0.25, 0.4), 0.06, 0.03, L.core2, L.mid, 0.7, 0, 0.5, 0.09, SHAPE.spark); }
      if (Math.random() < dt * 16) { const d = rand(3, 7); const p = fw(d); p.y = g0 + rand(0.2, 0.8); this.billows(p, 1, { speed: 0.5, size: 1.1, rise: 0.1, life: 1.2, a: 0.16, vx: dir.x * 6, vz: dir.z * 6, color: L.smoke }); }
      for (let i = 0; i < n * 0.25; i++) { const sp = rand(12, 18); this.add.emit(o.x, o.y, o.z, dir.x * sp + rand(-2, 2), dir.y * sp + rand(-1, 1), dir.z * sp + rand(-2, 2), rand(0.6, 0.9), 0.07, 0.05, L.core2, L.mid, 0.9, 3, 1.2, 0, SHAPE.shard); }
    }
    this.flashLight(V(F.pos.x + dir.x * 3.5, 1.6, F.pos.z + dir.z * 3.5), L.mid, (cold ? 14 : 34) * ramp * rand(0.8, 1.15), 0.05, 9);
    F.shake = Math.max(F.shake, 0.18);
    a.scorch -= dt; if (a.scorch <= 0) { a.scorch = 0.22; const d = rand(2.2, 6.8); const x = F.pos.x + dir.x * d + rand(-0.8, 0.8); const z = F.pos.z + dir.z * d + rand(-0.8, 0.8);
      this.decals.add({ kind: cold ? 'frost' : 'scorch', x, z, y: this.gy(x, z), size: rand(1.4, 2.4), color: L.decal, glow: cold ? 1.3 : 1.4, life: cold ? 5 : 6, prog: cold ? [0, 1, 0.3] : [1, 0, 2] });
      /* burning ground: small fires stay on the scorch for a moment */
      if (!cold) { const p = V(x, this.gy(x, z) + 0.1, z); for (let k = 0; k < 4; k++) this.later(k * 0.2, () => this.flames(p, 2, { size: 0.4, speed: 1.4, life: 0.5, spread: 0.4, a: 0.45, c0: L.mid, c1: L.end })); } }
    a.tick -= dt;
    if (a.tick <= 0) {
      a.tick = 0.15; const fl = this.flat(); fl.set(dir.x, 0, dir.z).normalize();
      for (const f of this.live()) {
        const to = V().subVectors(f.pos, F.pos).setY(0); const d = to.length(); if (d > 7.6 + (f.scale - 1)) continue;
        to.normalize(); if (to.dot(fl) < 0.72) continue;
        const s = this.status(f);
        if (!f.boss && this.clock - s.flinch > 0.45) { s.flinch = this.clock; this.hit(f, 0.6 * this.power(), to, { knock: cold ? 0.7 : 0.25, poise: 0.9, quiet: true }); sfx(cold ? 'pwRime' : 'pwSizzle'); }
        else this.tick(f, 0.5 * this.power());
        if (cold) { s.chill = Math.max(s.chill, 2.5); s.chillK = f.boss ? 0.75 : 0.45; f.vel.addScaledVector(to, f.boss ? 0 : 1.1); }
        else s.burn = Math.max(s.burn, 3);
        if (f.boss && !a.noted) { a.noted = true; this.bossNote(f, cold ? 'Chilled' : 'Burning'); }
      }
      if (F.boss && (a.dragonT = (a.dragonT || 0) - 0.15) <= 0) { a.dragonT = 0.45; this.dragonHit(V(F.pos.x + dir.x * 5, 0, F.pos.z + dir.z * 5), 4, 1.4); }
    }
    return a.t < a.dur;
  }

  /* 2. CHILL: a frost burst round the hero. Small foes freeze solid (open, crits), armour and bosses slow down; a heavy blow shatters. */
  c_chill() {
    const F = this.f; const L = this.look; const cryo = L.style === 'cryo';
    const at = V(F.pos.x, this.gy(F.pos.x, F.pos.z), F.pos.z);
    this.decals.add({ kind: 'frost', x: at.x, z: at.z, y: at.y, size: 15, color: L.decal, glow: 0.7, alpha: 0.55, life: 5, prog: [0, 1, 0.35], fade: 0.5 });
    this.decals.add({ kind: 'ring', x: at.x, z: at.z, y: at.y, size: 15, color: L.mid, glow: 3, life: 0.5, prog: [0.05, 1, 0.35] });
    /* a wave of ice that runs out over the ground: rings of jagged shards stand up one after another, a freezing mist rolls
       out low, rime glints spin in it; the cold light washes the foes */
    for (let ring = 0; ring < 6; ring++) this.later(ring * 0.05, () => {
      const r = 1.6 + ring * 1.1; const m = Math.round(18 + ring * 7);
      for (let i = 0; i < m; i++) { const a = (i / m) * TAU + rand(-0.1, 0.1); const x = at.x + Math.cos(a) * r; const z = at.z + Math.sin(a) * r; const h = rand(0.35, 0.95) * (cryo ? 0.8 : 1.1);
        this.smoke.emit(x, this.gy(x, z) + h * 0.45, z, Math.cos(a) * 0.02, 0.05, Math.sin(a) * 0.02, rand(1.1, 1.6), h, h * 0.9, L.mid, L.end, 0.95, 0, 0, -1, SHAPE.shard);
        if (i % 3 === 0) this.add.emit(x, this.gy(x, z) + h * 0.6, z, 0, 0.6, 0, 0.35, 0.3, 0.1, L.core2, L.mid, 0.8, 0, 0, 0, SHAPE.star); }
    });
    for (let i = 0; i < 70; i++) { const a = rand(0, TAU); const sp = rand(5, 12); this.add.emit(at.x, at.y + rand(0.2, 1.4), at.z, Math.cos(a) * sp, rand(0.5, 3), Math.sin(a) * sp, rand(0.5, 0.9), 0.12, 0.06, L.core2, L.mid, 1, 6, 1.6, 0, SHAPE.shard); }
    for (let i = 0; i < (cryo ? 46 : 30); i++) { const a = rand(0, TAU); const sp = rand(4, 9); this.smoke.emit(at.x + Math.cos(a), at.y + rand(0.2, 0.7), at.z + Math.sin(a), Math.cos(a) * sp, rand(0, 0.4), Math.sin(a) * sp, rand(1.4, 2.4), 0.9, cryo ? 3.2 : 2.6, L.smoke, L.smokeEnd, cryo ? 0.5 : 0.42, 0, 1.4, 0, SHAPE.billow); }
    this.flashLight(V(at.x, 1.6, at.z), L.mid, 70, 0.6, 16); this.veilFlash(`inset 0 0 160px 30px ${css(L.mid, 0.55)}`, 220);
    F.world.flash(0.4); F.shake = Math.max(F.shake, 0.6); F.world.kick(0.2); sfx(cryo ? 'pwCryo' : 'pwFreeze');
    let n = 0;
    for (const f of this.live()) {
      const to = V().subVectors(f.pos, F.pos).setY(0); const d = to.length(); if (d > 7.5 + (f.scale - 1)) continue; to.normalize(); n++;
      const s = this.status(f);
      if (f.boss) { s.chill = 3.5; s.chillK = 0.62; this.tick(f, 2 * this.power()); this.bossNote(f, 'Chilled'); }
      else if (f.def.armor) { s.chill = 4; s.chillK = 0.35; this.hit(f, 1, to, { knock: 0.2, poise: 3 }); }
      else { this.hit(f, 1, to, { knock: 0.2, poise: 0 }); if (f.state !== 'dead') { F.releaseToken(f); f.state = 'frozen'; f.t = 0; f.atk = null; f.actor.flash(L.hex, 2600, 0.04); s.frozen = 2.6; } }
      const b = this.body(f); this.bits(b, 14, 3, L.mid, L.end, { size: 0.14, g: 6, life: 0.8 });
      /* the foe is cased in ice to the waist: a crown of shards round its legs for as long as it is frozen */
      const g = this.gy(f.pos.x, f.pos.z);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const rr = 0.35 * f.scale; const h = rand(0.5, 1.0) * f.scale; this.smoke.emit(f.pos.x + Math.cos(a) * rr, g + h * 0.45, f.pos.z + Math.sin(a) * rr, Math.cos(a) * 0.03, 0.05, Math.sin(a) * 0.03, f.boss || f.def.armor ? 1.4 : 2.6, h, h, L.mid, L.end, 0.85, 0, 0, -1, SHAPE.shard); }
    }
    if (F.boss && !F.boss.dead) { this.dragonChill = 3; this.dragonHit(at, 7.5, 3); this.bossNote(true, 'Chilled'); }
    return true;
  }

  /* 3. BOLT: aim and throw. It strikes the first foe in its path, then jumps to three more. */
  c_bolt() {
    const F = this.f; const L = this.look;
    const from = this.hand(); let dir = this.aim();
    const tgt = F.lock || F.pickTarget(22, 0.88);
    if (tgt) dir = this.body(tgt).sub(from).normalize();
    else if (F.boss && !F.boss.dead && F.boss.hittable) { const h = F.boss.hittable().sort((a, b) => a.pos.distanceTo(F.pos) - b.pos.distanceTo(F.pos))[0]; if (h && h.pos.distanceTo(F.pos) < 20) dir = h.pos.clone().sub(from).normalize(); }
    this.objs.push({ kind: 'bolt', p: from.clone(), v: dir.multiplyScalar(34), t: 0, hit: new Set(), dmg: 4 * this.power() });
    this.burst(from, 24, 4, 0.2, 0.03, L.core2, L.mid, { st: 0.05 }); this.flashLight(from, L.mid, 6, 0.15);
    F.vmPunch?.set(0, 0.02, 0.1); sfx('pwBolt');
  }
  o_bolt(o, dt) {
    const L = this.look; const F = this.f; o.t += dt;
    const steps = 3; const st = dt / steps;
    for (let k = 0; k < steps; k++) {
      o.p.addScaledVector(o.v, st);
      this.add.emit(o.p.x, o.p.y, o.p.z, o.v.x * 0.15, o.v.y * 0.15, o.v.z * 0.15, 0.16, 0.26, 0.06, L.core2, L.mid2, 1, 0, 0, 0.06, SHAPE.spark);
      if (k === 0) this.add.emit(o.p.x, o.p.y, o.p.z, 0, 0, 0, 0.06, 0.9, 0.9, L.mid, L.mid, 0.35, 0, 0, 0, SHAPE.glow);
      if (Math.random() < 0.5) this.add.emit(o.p.x, o.p.y, o.p.z, rand(-3, 3), rand(-3, 3), rand(-3, 3), 0.2, 0.06, 0.02, this.white, L.mid, 1, 0, 0, 0.04);
      for (const f of this.live()) {
        if (o.hit.has(f)) continue; const b = this.body(f); if (b.distanceTo(o.p) < 0.85 * Math.max(1, f.scale * 0.8)) { this.boltStrike(f, o.dmg, o.p.clone(), o.hit, 3); return false; }
      }
      if (F.boss && !F.boss.dead) { const h = F.boss.hittable().find((x) => x.pos.distanceTo(o.p) < (x.radius ?? 0.6) + 0.4); if (h) { this.dragonHit(h.pos, 1, 5); this.burst(o.p, 60, 8, 0.4, 0.14, L.core2, L.mid, { st: 0.04 }); sfx('pwChain'); return false; } }
      if (o.p.y < this.gy(o.p.x, o.p.z) + 0.05 || o.t > 0.75) { this.burst(o.p, 30, 5, 0.3, 0.1, L.core2, L.mid, { st: 0.03, g: 8 }); this.decals.add({ kind: 'scorch', x: o.p.x, z: o.p.z, y: this.gy(o.p.x, o.p.z), size: 1.2, color: L.decal, glow: 2, life: 3, prog: [1, 0, 1] }); return false; }
    }
    return true;
  }
  boltStrike(f, dmg, from, hitSet, left) {
    const L = this.look; const F = this.f; hitSet.add(f);
    const b = this.body(f);
    this.arc(from, b, L.core2, L.mid2, { seg: 4, jit: 0.3, size: 0.14 });
    this.hit(f, dmg, V().subVectors(f.pos, F.pos).setY(0).normalize(), { knock: 0.6, poise: 6, bossK: 0.7 });
    this.add.emit(b.x, b.y, b.z, 0, 0, 0, 0.14, 0.8 * f.scale, 1.4 * f.scale, L.core2, L.mid2, 0.9, 0, 0, 0, SHAPE.glow);
    this.streaks(b, null, 40, 9, L.core2, L.mid, { size: 0.06, life: 0.4, g: 8, st: 0.05 });
    for (let i = 0; i < 5; i++) this.arc(b, b.clone().add(V(rand(-1, 1), rand(-1.4, 0.6), rand(-1, 1)).multiplyScalar(0.9 * f.scale)), L.core2, L.mid, { seg: 3, jit: 0.25, size: 0.08, life: 0.3, halo: false });
    const g = this.gy(f.pos.x, f.pos.z); this.decals.add({ kind: 'crack', x: f.pos.x, z: f.pos.z, y: g, size: 1.8 * f.scale, color: L.decal, glow: 2.4, life: 4, prog: [1, 0, 1.5] });
    this.billows(V(f.pos.x, g + 0.6 * f.scale, f.pos.z), 4, { speed: 0.8, size: 0.7, rise: 1.4, life: 1.2, a: 0.4 });
    this.flashLight(b, L.mid, 60, 0.22); sfx('pwChain'); F.hitstop = Math.max(F.hitstop, 0.04);
    if (f.boss) this.bossNote(f, 'Struck');
    if (left <= 0) return;
    this.later(0.09, () => {
      let next = null; let bd = 7.5;
      for (const o of this.live()) { if (hitSet.has(o)) continue; const d = o.pos.distanceTo(f.pos); if (d < bd) { bd = d; next = o; } }
      if (!next) return;
      const a = b.clone(); const c = this.body(next);
      this.arc(a, c, L.core2, L.mid2, { seg: 9, jit: 0.6, size: 0.17, branch: 0.8 });
      this.later(0.05, () => this.arc(a, c, L.core2, L.mid, { seg: 9, jit: 0.7, size: 0.12, life: 0.16 }));
      this.boltStrike(next, dmg * 0.78, a, hitSet, left - 1);
    });
  }

  /* 4. MARK: brand one foe. The next heavy blow on it (charged, heavy or a dash cut) explodes round it. */
  c_mark() {
    const F = this.f; const L = this.look;
    let tgt = F.lock || F.pickTarget(18, 0.55);
    if (!tgt) { let bd = 18; for (const f of this.live()) { const d = f.pos.distanceTo(F.pos); if (d < bd && (f.boss || f.def.armor)) { bd = d; tgt = f; } } }
    const dragon = !tgt && F.boss && !F.boss.dead;
    if (!tgt && !dragon) { F.hud.toast('No foe in reach'); return false; }
    const from = this.hand();
    if (dragon) {
      this.dragonMark = 10; const fp = F.boss.focus?.() || F.boss.hittable()[0]?.pos; if (fp) this.objs.push({ kind: 'sigil', p: from.clone(), to: fp.clone(), t: 0, dur: 0.22 });
      this.bossNote(true, 'Marked'); sfx(L.style === 'dusk' ? 'pwMarkDusk' : 'pwMark'); return true;
    }
    this.objs.push({ kind: 'sigil', p: from.clone(), foe: tgt, t: 0, dur: 0.2 });
    this.later(0.2, () => this.setMark(tgt, 10));
    if (L.style === 'dusk') { /* the long shadow: a band from the hero's feet to the foe */
      const dx = tgt.pos.x - F.pos.x; const dz = tgt.pos.z - F.pos.z; const len = Math.hypot(dx, dz);
      this.decals.add({ kind: 'strip', x: F.pos.x + dx / 2, z: F.pos.z + dz / 2, y: this.gy(F.pos.x, F.pos.z), len, size: 1.1, rot: -Math.atan2(dz, dx), color: 0x1a0c06, glow: 0.4, alpha: 0.85, life: 2.4, prog: [0, 1, 0.2] });
    }
    sfx(L.style === 'dusk' ? 'pwMarkDusk' : 'pwMark'); F.vmPunch?.set(0, 0.03, 0.08);
  }
  setMark(f, t) {
    if (!f || f.state === 'dead') return;
    const s = this.status(f); s.mark = t; const L = this.look;
    if (s.markDecal) this.decals.remove(s.markDecal);
    s.markDecal = this.decals.add({ kind: 'rune', x: f.pos.x, z: f.pos.z, y: this.gy(f.pos.x, f.pos.z), size: 2.4 * Math.max(1, f.scale * 0.8), color: L.decal, glow: 2.6, hold: true, prog: [0, 1, 0.3] });
    const b = this.body(f);
    /* the brand lands as a column of light through the foe, a star flare at its chest and sparks */
    /* a short column (to the chest, not a beam into the sky) */
    for (let i = 0; i < 14; i++) { const y = this.gy(f.pos.x, f.pos.z) + rand(0, 1.6) * f.scale; this.add.emit(f.pos.x + rand(-0.25, 0.25), y, f.pos.z + rand(-0.25, 0.25), 0, rand(0.8, 1.8), 0, rand(0.25, 0.45), 0.12, 0.04, L.mid2, L.end, 0.6, 0, 0, 0.05, SHAPE.spark); }
    this.add.emit(b.x, b.y, b.z, 0, 0, 0, 0.25, 1.2, 0.4, L.core2, L.mid2, 0.9, 0, 0, 0, SHAPE.cross);
    this.streaks(b, null, 24, 6, L.core2, L.mid, { size: 0.06, g: 6 });
    this.flashLight(b, L.mid, 45, 0.3);
    f.actor?.flash?.(L.hex, 300, 0.05);
    if (f.boss) this.bossNote(f, 'Marked'); else this.f.hud.toast((document.body.classList.contains('touch') ? 'Marked: hold Attack to burst it' : 'Marked: hold click to burst it'));
  }
  detonate(f, at) {
    const F = this.f; const L = this.look; const P = this.power();
    at = at || this.body(f); const g = this.gy(at.x, at.z);
    this.hit(f, 10 * P, V().subVectors(f.pos, F.pos).setY(0).normalize(), { heavy: true, poise: 14, knock: 1.6, bossK: 1.1 });
    for (const o of this.live()) {
      if (o === f) continue; const to = V().subVectors(o.pos, f.pos).setY(0); const d = to.length(); if (d > 4.2) continue; to.normalize();
      this.hit(o, 4 * P, to, { poise: 8, knock: 2, knockdown: true });
      if (!o.boss && !o.def.armor && o.state !== 'dead') F.knockDown(o, to, 8);
    }
    this.boom(V(at.x, g + 1.1, at.z), 4.2, 'crack');
    if (f.boss) this.bossNote(f, 'The mark bursts');
    else F.hud.toast('The mark bursts');
  }
  /* a big blast look shared by the mark and the bomb */
  boom(at, R, decal = 'crack', vis = 1) {
    const F = this.f; const L = this.look; const g = this.gy(at.x, at.z);
    /* the look is sized to what it hits and to the distance (a giant boss 15 m off gets a blast twice the size), the
       damage radius R is not */
    R *= Math.max(vis, this.dk(at) * 0.8);
    /* a real fireball (flame tongues, smoke column, sparks, thrown earth, a strong light); the blood mark sprays blood too */
    const blood = L.style === 'blood';
    this.fireball(at, R * 0.75, { dirt: blood ? 0x2a0808 : L.style === 'dusk' || this.f.kit?.id === 'frontier' ? 0x6a4a30 : 0x3a2e24, smokeA: blood ? 0.6 : 0.75 });
    if (blood) {
      this.streaks(at, null, 70, 9, new THREE.Color(0x6a0808), new THREE.Color(0x2a0404), { smoke: true, kind: SHAPE.drop, size: 0.1, life: 0.9, g: 14, st: 0.05, a: 0.95 });
      for (let i = 0; i < 5; i++) { const a = rand(0, TAU); const x = at.x + Math.cos(a) * rand(0.8, 2); const z = at.z + Math.sin(a) * rand(0.8, 2); this.decals.add({ kind: 'splat', x, z, y: this.gy(x, z), size: 1.2, len: 2.4, rot: -a, color: 0x3a0404, glow: 1, life: 9, fade: 0.2 }); }
    }
    this.decals.add({ kind: decal, x: at.x, z: at.z, y: g, size: R * 1.5, color: L.decal, glow: 2.6, life: 8, prog: [1, 0, 4] });
    /* the shock ring: a thin pale band that is gone in a third of a second (not a flat orange disc) */
    this.decals.add({ kind: 'ring', x: at.x, z: at.z, y: g, size: R * 2.6, color: L.core, glow: 1.6, alpha: 0.55, life: 0.32, prog: [0.15, 1, 0.3], fade: 0.6 });
    /* the dust ring: a skirt of dust thrown out low along the ground from the blast, the world's own dirt colour */
    const W = this.f.kit?.id || 'dark'; const dust = this._c.setHex({ frontier: 0x7e6248, edo: 0x5e564e, neon: 0x34343c, storybook: 0xa89a80 }[W] ?? 0x3e3834).clone();
    const cam = this.f.world.camera.getWorldPosition(V());
    for (let i = 0; i < 20; i++) { const a = rand(0, TAU); const sp = R * rand(1.2, 2.4);
      /* a puff that would roll past the eye is left out (a near ring of puffs read as a bright band across the lens) */
      if (Math.hypot(at.x + Math.cos(a) * R * 1.6 - cam.x, at.z + Math.sin(a) * R * 1.6 - cam.z) < 3) continue;
      this.smoke.emit(at.x + Math.cos(a) * R * 0.3, g + rand(0.1, 0.4), at.z + Math.sin(a) * R * 0.3, Math.cos(a) * sp, rand(0.3, 1.2), Math.sin(a) * sp, rand(1.2, 1.8), R * 0.16, R * rand(0.35, 0.6), dust, dust.clone().multiplyScalar(0.8), 0.5, -0.2, 2.6, 0, SHAPE.billow); }
    F.shake = Math.max(F.shake, 1.0); F.world.kick(0.32); F.world.flash(0.35); F.hitstop = Math.max(F.hitstop, 0.09);
    sfx(this.id === 'bomb' ? 'pwBlast' : 'pwBurst');
  }

  /* 5. SUMMON: spirits fight beside the hero for a few seconds. Fox fire wisps hunt one foe each; a drone shoots from the shoulder. */
  c_summon() {
    const F = this.f; const L = this.look;
    if (L.style === 'drone') {
      this.objs.push({ kind: 'drone', t: 0, dur: 3.6, shot: 0.5, p: V(F.pos.x, EYE + 0.9, F.pos.z), shots: 6 });
    } else {
      for (let i = 0; i < 3; i++) this.objs.push({ kind: 'wisp', i, t: 0, wait: 0.45 + i * 0.4, p: this.hand().clone(), v: V(), foe: null, ph: (i / 3) * TAU, life: 4.5 });
    }
    this.flashLight(V(F.pos.x, 1.6, F.pos.z), L.mid, 6, 0.3);
    sfx(L.style === 'drone' ? 'pwDrone' : 'pwSummon');
  }
  o_wisp(o, dt) {
    const F = this.f; const L = this.look; o.t += dt;
    if (o.t > o.life) { this.burst(o.p, 20, 2, 0.5, 0.1, L.core2, L.mid); return false; }
    if (!o.foe || o.foe.state === 'dead') {
      if (o.foe) o.foe = null;
      /* orbit in front of the hero until its turn, then pick the nearest foe nobody hunts */
      /* they wait low at the hero's sides (never across the foe's face), bobbing like lantern flames */
      const fw = this.flat(); const side = (o.i - 1) * 1.15; const rt = V(-fw.z, 0, fw.x);
      const want = V(F.pos.x + fw.x * 2.4 + rt.x * side * 1.3, EYE - 0.75 + Math.sin(o.t * 3.1 + o.ph) * 0.12, F.pos.z + fw.z * 2.4 + rt.z * side * 1.3);
      o.p.lerp(want, Math.min(1, dt * 6));
      if (o.t > o.wait) {
        let best = null; let bd = 15;
        for (const f of this.live()) { if (this.objs.some((x) => x !== o && x.foe === f)) continue; const d = f.pos.distanceTo(F.pos); if (d < bd) { bd = d; best = f; } }
        if (!best) for (const f of this.live()) { const d = f.pos.distanceTo(F.pos); if (d < bd) { bd = d; best = f; } }
        if (best) { o.foe = best; o.v.set(rand(-3, 3), 4, rand(-3, 3)); sfx('pwWisp'); }
      }
    } else {
      const b = this.body(o.foe); const to = b.clone().sub(o.p); const d = to.length();
      o.v.addScaledVector(to.normalize(), dt * 60); o.v.multiplyScalar(Math.max(0, 1 - dt * 3)); o.p.addScaledVector(o.v, dt);
      if (d < 0.6) {
        this.hit(o.foe, 2.6 * this.power(), V().subVectors(o.foe.pos, F.pos).setY(0).normalize(), { knock: 0.8, poise: 5, bossK: 0.7 });
        this.status(o.foe).burn = Math.max(this.status(o.foe).burn, 2);
        /* the bite: a gout of blue-green flame on the body (it burns on, below the face), sparks, a cold light */
        this.flames(V(b.x, b.y - 0.5 * o.foe.scale, b.z), 9, { size: 0.38 * Math.min(o.foe.scale, 1.3), speed: 1.6, life: 0.4, spread: 0.3, a: 0.4, glowOnly: true });
        this.streaks(b, null, 22, 6, L.core2, L.mid, { size: 0.05, g: 5, life: 0.5 });
        this.flashLight(b, L.mid, 50, 0.3);
        sfx('pwWispHit'); if (o.foe.boss) this.bossNote(o.foe, 'Fox fire bites');
        return false;
      }
    }
    if (F.boss && !F.boss.dead && !o.foe && o.t > o.wait) { const h = F.boss.hittable()[0]; if (h) { const to = h.pos.clone().sub(o.p); if (to.length() < 0.8) { this.dragonHit(h.pos, 1, 2.5); return false; } o.p.addScaledVector(to.normalize(), dt * 14); } }
    /* the wisp itself: a ball of blue-green flame with a white-hot heart, tongues that lick up and a tail it leaves behind */
    /* standing blue-green tongues and a small tinted heart; no big white ball */
    for (let i = 0; i < 2; i++) this.add.emit(o.p.x + rand(-0.05, 0.05), o.p.y + rand(-0.04, 0.04), o.p.z + rand(-0.05, 0.05), rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.2, 0.2), rand(0.3, 0.45), 0.24, 0.1, i ? L.mid : L.core, L.end, 0.55, -1, 1, 0, SHAPE.flame);
    this.add.emit(o.p.x, o.p.y, o.p.z, 0, 0, 0, 0.05, 0.3, 0.3, L.end, L.end, 0.18, 0, 0, 0, SHAPE.glow);
    this.add.emit(o.p.x, o.p.y - 0.03, o.p.z, 0, 0, 0, 0.05, 0.07, 0.07, L.mid2, L.mid2, 0.8, 0, 0, 0, SHAPE.glow);
    if (Math.random() < 0.35) this.add.emit(o.p.x, o.p.y, o.p.z, rand(-0.4, 0.4), rand(0.2, 0.8), rand(-0.4, 0.4), 0.5, 0.05, 0.02, L.core2, L.mid, 1, -0.6, 0.6, 0, SHAPE.spark);
    return true;
  }
  o_drone(o, dt) {
    const F = this.f; const L = this.look; o.t += dt;
    const fw = this.flat(); const rt = V(-fw.z, 0, fw.x);
    const want = V(F.pos.x - rt.x * 0.9 + fw.x * 2.4, EYE + 0.55 + Math.sin(o.t * 3) * 0.08, F.pos.z - rt.z * 0.9 + fw.z * 2.4);
    o.p.lerp(want, Math.min(1, dt * (o.t < 0.3 ? 20 : 5)));
    /* body glow, two rotor glints and a scan line under it */
    this.add.emit(o.p.x, o.p.y, o.p.z, 0, 0, 0, 0.05, 0.22, 0.22, L.core2, L.core2, 0.9); this.smoke.emit(o.p.x, o.p.y - 0.02, o.p.z, 0, 0, 0, 0.05, 0.5, 0.5, L.smoke, L.smoke, 0.85);
    for (let r = 0; r < 2; r++) { const a = o.t * 40 + r * Math.PI; const q = V(o.p.x + rt.x * (r ? 0.28 : -0.28) + Math.cos(a) * 0.14, o.p.y + 0.06, o.p.z + rt.z * (r ? 0.28 : -0.28) + Math.sin(a) * 0.14); this.add.emit(q.x, q.y, q.z, 0, 0, 0, 0.06, 0.12, 0.12, L.mid2, L.mid2, 0.8); }
    if (Math.random() < 0.6) this.add.emit(o.p.x, o.p.y - 0.1, o.p.z, 0, -3, 0, 0.18, 0.05, 0.02, L.mid, L.end, 0.7, 0, 0, 0.05);
    o.shot -= dt;
    if (o.shot <= 0 && o.shots > 0) {
      o.shot = 0.5;
      let best = null; let bd = 18; for (const f of this.live()) { const d = f.pos.distanceTo(F.pos); if (d < bd) { bd = d; best = f; } }
      const tgt = best ? this.body(best) : (F.boss && !F.boss.dead ? F.boss.hittable()[0]?.pos.clone() : null);
      if (tgt) {
        o.shots--; const dir = tgt.clone().sub(o.p); const len = dir.length(); dir.normalize();
        for (let s = 0; s < len; s += 0.25) this.add.emit(o.p.x + dir.x * s, o.p.y + dir.y * s, o.p.z + dir.z * s, dir.x * 2, dir.y * 2, dir.z * 2, 0.12 + s * 0.006, 0.14, 0.05, L.core2, L.mid2, 1, 0, 0, 0.05, SHAPE.spark);
        /* the hit: a magenta flare, hot sparks and a short arc on the foe */
        this.add.emit(tgt.x, tgt.y, tgt.z, 0, 0, 0, 0.12, 0.5, 0.9, L.core2, L.mid2, 0.9, 0, 0, 0, SHAPE.star);
        this.streaks(tgt, dir.clone().negate(), 20, 7, L.core2, L.mid, { size: 0.05, life: 0.4 });
        this.arc(tgt, tgt.clone().add(V(rand(-0.6, 0.6), rand(-0.7, 0.3), rand(-0.6, 0.6))), L.core2, L.mid, { seg: 3, jit: 0.2, size: 0.06, life: 0.15, halo: false });
        this.flashLight(tgt, L.mid, 35, 0.15);
        if (best) { this.hit(best, 1.9 * this.power(), V().subVectors(best.pos, F.pos).setY(0).normalize(), { knock: 0.5, poise: 3, bossK: 0.7 }); if (best.boss) this.bossNote(best, 'Drone fire'); } else this.dragonHit(tgt, 2, 1.6);
        sfx('pwDroneShot');
      }
    }
    if (o.t > o.dur) { this.burst(o.p, 30, 4, 0.4, 0.1, L.core2, L.mid, { g: 6 }); return false; }
    return true;
  }

  /* 6. WARD: for four seconds the next blow of any kind (also an unblockable one) is turned back on the one who struck. */
  c_ward() {
    const F = this.f; const L = this.look;
    this.ward = { t: 0, dur: 4 };
    /* a soft warm band 4 m out (in view, clear of the HUD band) and no rune under the feet: the spoked rune read as a
       cartwheel under the player */
    this.ward.ring = this.decals.add({ kind: 'ring', x: F.pos.x, z: F.pos.z, y: this.gy(F.pos.x, F.pos.z), size: 8.6, color: L.decal, glow: 1.6, alpha: 0.4, hold: true, prog: [0.2, 0.93, 0.25] });
    /* only a faint edge glow (a strong one read as a damage overlay); the ward shows in the world instead */
    this.veilFlash(`inset 0 0 70px 10px ${css(L.mid, 0.28)}`, 0, 1);
    if (L.style === 'snow') this.ward.frost = this.decals.add({ kind: 'frost', x: F.pos.x, z: F.pos.z, y: this.gy(F.pos.x, F.pos.z), size: 7, color: L.decal, glow: 1.2, alpha: 0.6, hold: true, prog: [0, 1, 0.5] });
    if (L.style !== 'snow') { const g0 = this.gy(F.pos.x, F.pos.z); for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; this.flames(V(F.pos.x + Math.cos(a) * 4, g0 + 0.15, F.pos.z + Math.sin(a) * 4), 1, { size: 0.75, speed: 1.6, life: 0.6, spread: 0.2 }); } }
    this.flashLight(V(F.pos.x, 1.8, F.pos.z), L.mid, 6, 0.4); F.world.flash(0.2);
    sfx(L.style === 'hearth' ? 'pwWardHearth' : 'pwWard');
  }
  u_ward(w, dt) {
    const F = this.f; const L = this.look; w.t += dt;
    const g = this.gy(F.pos.x, F.pos.z);
    for (const d of [w.ring, w.rune]) if (d) { d.x = F.pos.x; d.z = F.pos.z; d.y = g; }
    /* the ward stands in the world. Hearth: a ring of low hearth flames round the hero, embers, a warm light on the foes.
       Still snow: big flakes spiral down round the hero in a slow column, frost spreads underfoot, a cold light. */
    const fw = this.flat(); if (w.frost) { w.frost.x = F.pos.x; w.frost.z = F.pos.z; w.frost.y = g; }
    if (L.style === 'snow') {
      for (let i = 0; i < 2; i++) { const a = rand(0, TAU); const r = rand(1.6, 3.4); this.add.emit(F.pos.x + Math.cos(a) * r + fw.x * 2, g + rand(1.4, 2.8), F.pos.z + Math.sin(a) * r + fw.z * 2, -Math.sin(a) * 0.9, -0.7, Math.cos(a) * 0.9, 2.6, 0.06, 0.05, L.core, L.mid, 0.8, 0, 0, 0, SHAPE.star); }
      for (let i = 0; i < 3; i++) { const a = rand(0, TAU); const r = 1.5; this.add.emit(F.pos.x + Math.cos(a) * r, g + rand(0.3, 2.4), F.pos.z + Math.sin(a) * r, -Math.sin(a) * 2, -0.2, Math.cos(a) * 2, 0.6, 0.06, 0.03, L.core2, L.mid, 0.9, 0, 0, 0.05, SHAPE.spark); }
    } else {
      /* the hearth ring lies 3 m out, where the view sees the ground; a faint warm haze hangs inside it */
      /* low standing hearth flames on the ring (upright tongues now, not round puffs), a few embers that rise and fall back */
      for (let i = 0; i < 5; i++) { const a = rand(0, TAU); const r = 4; this.add.emit(F.pos.x + Math.cos(a) * r, g + 0.12, F.pos.z + Math.sin(a) * r, 0, rand(0.5, 1.1), 0, rand(0.35, 0.55), 0.32, 0.55, i % 2 ? L.mid : L.core, L.end, 0.55, -1, 1, 0, SHAPE.flame); }
      if (Math.random() < 0.5) { const a = rand(0, TAU); this.add.emit(F.pos.x + Math.cos(a) * 4, g + 0.4, F.pos.z + Math.sin(a) * 4, rand(-0.3, 0.3), rand(1.2, 2.2), rand(-0.3, 0.3), 1.0, 0.04, 0.02, L.core2, L.end, 1, 1.5, 0.5, 0.05, SHAPE.spark); }
    }
    if (this.lightT > this.lightDur) this.flashLight(V(F.pos.x + fw.x * 1.2, g + 1.4, F.pos.z + fw.z * 1.2), L.mid, L.style === 'snow' ? 14 : 24, 0.1, 9);
    if (w.t > w.dur - 0.6) this.veil.style.opacity = String(clamp((w.dur - w.t) / 0.6, 0, 1));
    if (w.t >= w.dur) { this.endWard(); return; }
  }
  endWard() { const w = this.ward; if (!w) return; this.decals.remove(w.ring); if (w.rune) this.decals.remove(w.rune); if (w.frost) this.decals.remove(w.frost); this.ward = null; this.veil.style.opacity = '0'; }
  /* fight.takeHit asks this first: a ward turns the blow; returns the takeHit result word or null */
  guard(foe, atk) {
    const w = this.ward; if (!w) return null;
    const F = this.f; const L = this.look; const P = this.power();
    const from = V(foe.pos?.x ?? F.pos.x, 0, foe.pos?.z ?? F.pos.z); const to = V().subVectors(from, F.pos).setY(0); if (to.lengthSq() < 1e-4) to.copy(this.flat()); to.normalize();
    const at = V(F.pos.x + to.x * 1.2, EYE - 0.4, F.pos.z + to.z * 1.2);
    this.clash(at, to, L.mid.getHex());
    const far = V(at.x + to.x * 1.2, at.y - 0.2, at.z + to.z * 1.2); /* the blow is thrown back at the striker: show it there */
    if (L.style === 'snow') this.bits(far, 24, 7, L.core, L.mid, { kind: SHAPE.star, glow: true, size: 0.07, g: 2, drag: 2, life: 0.9, vx: to.x * 6, vz: to.z * 6 });
    else this.flames(far, 18, { size: 0.45, speed: 2, life: 0.45, vx: to.x * 7, vz: to.z * 7, spread: 0.3 });
    this.flashLight(at, L.mid, 70, 0.35); F.world.flash(0.35); F.shake = Math.max(F.shake, 0.6); F.slow = Math.max(F.slow, 0.3); F.crit = Math.max(F.crit, 1.5);
    this.veilFlash(`inset 0 0 200px 60px ${css(L.core, 0.7)}`, 180);
    sfx('pwReflect');
    const isBolt = atk && foe.def?.label === 'bolt';
    if (foe.actor && foe.state !== 'dead') {
      this.hit(foe, 4 * P, to, { poise: 14, knock: 1.6, heavy: true, bossK: 2 });
      if (!foe.def?.armor || foe.boss) F.staggerFoe(foe, to);
      if (foe.boss) this.bossNote(foe, 'Turned back');
    } else if (!isBolt && F.boss && !F.boss.dead) { this.dragonHit(F.pos, 7, 6, true); this.bossNote(true, 'Turned back'); }
    F.hud.toast('Turned back');
    F.director.event(`The ward of ${this.name} turns a ${foe.def?.label || 'blow'} back.`);
    this.endWard();
    return isBolt ? 'parried' : 'dodged';
  }

  /* 7. RAIN: mark a spot; after a 0.75 s warning seven strikes fall in it. Foes can walk out of it; a boss rarely does. */
  c_rain() {
    const F = this.f; const L = this.look;
    const tgt = F.lock || F.pickTarget(18, 0.6);
    let c;
    if (tgt) c = tgt.pos.clone();
    else if (F.boss && !F.boss.dead && F.boss.focus) { const fp = F.boss.focus(); c = V(fp.x, 0, fp.z); }
    else { const fw = this.flat(); c = V(F.pos.x + fw.x * 8, 0, F.pos.z + fw.z * 8); }
    if (c.length() > F.arena) c.setLength(F.arena);
    c.y = this.gy(c.x, c.z);
    const R = 3.6;
    const tele = this.decals.add({ kind: 'rune', x: c.x, z: c.z, y: c.y, size: R * 2, color: L.decal, glow: 1.1, alpha: 0.5, life: 2.2, prog: [0, 1, 0.75], fade: 0.25 });
    this.objs.push({ kind: 'rain', c, R, t: 0, n: 0, next: 0.75, tele });
    sfx(L.style === 'stars' ? 'pwRainStars' : 'pwRainWarn');
  }
  o_rain(o, dt) {
    const L = this.look; o.t += dt;
    /* the warning: motes rise from the circle */
    if (o.t < 0.75) for (let i = 0; i < 3; i++) { const a = rand(0, TAU); const r = o.R * Math.sqrt(Math.random()); this.add.emit(o.c.x + Math.cos(a) * r, o.c.y + 0.1, o.c.z + Math.sin(a) * r, 0, rand(1, 3), 0, 0.5, 0.07, 0.03, L.core2, L.mid, 0.8); }
    if (o.t >= o.next && o.n < 7) {
      o.next += 0.15; o.n++;
      /* the first strikes go to the foes inside the circle */
      const inside = this.live().filter((f) => Math.hypot(f.pos.x - o.c.x, f.pos.z - o.c.z) < o.R + 0.5);
      let p;
      if (inside.length && o.n <= 4) { const f = inside[(o.n - 1) % inside.length]; p = V(f.pos.x + rand(-0.4, 0.4), 0, f.pos.z + rand(-0.4, 0.4)); }
      else { const a = rand(0, TAU); const r = o.R * Math.sqrt(Math.random()); p = V(o.c.x + Math.cos(a) * r, 0, o.c.z + Math.sin(a) * r); }
      p.y = this.gy(p.x, p.z);
      if (L.style === 'stars') { this.objs.push({ kind: 'star', p: V(p.x - 4, p.y + 15, p.z - 3), to: p, t: 0, dur: 0.32 }); sfx('pwStarFall'); }
      else this.skyStrike(p);
    }
    return o.t < 2.2;
  }
  skyStrike(p) {
    const F = this.f; const L = this.look; const top = V(p.x + rand(-2, 2), p.y + 22, p.z + rand(-2, 2));
    this.arc(top, V(p.x, p.y + 0.1, p.z), L.core2, L.mid2, { seg: 14, jit: 1.1, size: 0.22, life: 0.26, step: 0.07, branch: 1.6 });
    this.later(0.05, () => this.arc(top, V(p.x, p.y + 0.1, p.z), L.core2, L.mid, { seg: 14, jit: 1.2, size: 0.14, life: 0.16, step: 0.08 }));
    this.strikeAt(p, 1.8, 3.2);
    F.world.flash(0.25);
    sfx('pwSkyStrike');
  }
  o_star(o, dt) {
    const L = this.look; o.t += dt; const k = Math.min(1, o.t / o.dur);
    const p = V().lerpVectors(o.p, o.to, k * k);
    const v = o.to.clone().sub(o.p).multiplyScalar(2 / o.dur);
    /* a five-point star with a long glowing tail and sparkles shed behind it */
    this.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.04, 0.9, 0.9, L.core2, L.core2, 1, 0, 0, 0, SHAPE.star);
    this.add.emit(p.x, p.y, p.z, v.x * 0.05, v.y * 0.05, v.z * 0.05, 0.35, 0.5, 0.1, L.mid2, L.end, 0.8, 0, 0, 0.12, SHAPE.spark);
    for (let i = 0; i < 3; i++) this.add.emit(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(0.4, 0.8), 0.14, 0.03, L.core2, L.end, 1, 1, 1, 0, SHAPE.star);
    if (k >= 1) { this.strikeAt(o.to, 1.8, 3.2); sfx('pwStar'); return false; }
    return true;
  }
  strikeAt(p, r, dmg) {
    const F = this.f; const L = this.look; const P = this.power();
    /* a flare at the strike, a burst of shape (stars or sparks), dust or smoke kicked up, a cracked glowing mark, a hard light */
    const stars = L.style === 'stars'; const at = V(p.x, p.y + 0.4, p.z);
    this.add.emit(at.x, at.y + 0.4, at.z, 0, 0, 0, 0.18, 1.8, 2.6, L.core2, L.mid2, 0.8, 0, 0, 0, SHAPE.glow);
    if (stars) { this.bits(at, 18, 6, L.core2, L.mid2, { kind: SHAPE.star, glow: true, size: 0.2, g: 5, drag: 1.5, life: 0.9, up: 1.4 }); this.bits(at, 10, 4, L.end, L.mid, { kind: SHAPE.star, glow: true, size: 0.14, g: 3, life: 1.2 }); }
    else { this.streaks(at, null, 50, 12, L.core2, L.mid, { size: 0.07, g: 12, life: 0.6, lift: 0.6 }); this.billows(V(p.x, p.y + 0.3, p.z), 6, { speed: 1.6, size: 0.9, rise: 1.4, life: 1.4, a: 0.5 }); this.bits(at, 8, 5, new THREE.Color(0x2a2620), new THREE.Color(0x14120e), { size: 0.12, g: 14, life: 1 }); }
    this.decals.add({ kind: stars ? 'ring' : 'crack', x: p.x, z: p.z, y: p.y, size: stars ? 3.2 : 2.6, color: L.decal, glow: 2.6, life: stars ? 0.6 : 5, prog: stars ? [0.1, 1, 0.4] : [1, 0, 2] });
    if (!stars) this.decals.add({ kind: 'scorch', x: p.x, z: p.z, y: p.y, size: 1.6, color: L.decal, glow: 1.5, life: 6, prog: [1, 0, 2] });
    this.flashLight(V(p.x, p.y + 2, p.z), L.mid, 110, 0.22, 18);
    F.shake = Math.max(F.shake, 0.35);
    for (const f of this.live()) {
      const to = V(f.pos.x - p.x, 0, f.pos.z - p.z); const d = to.length(); if (d > r + 0.4 * f.scale) continue;
      to.normalize(); if (to.lengthSq() < 0.5) to.copy(this.flat());
      this.hit(f, dmg * P, to, { poise: 8, knock: 0.8, bossK: 0.6 });
      if (f.boss) this.bossNote(f, 'Struck from the sky');
    }
    this.dragonHit(p, 2.5, dmg * 0.8);
  }

  /* 8. DASH: the hero runs 7.5 m through them in 0.2 s (no harm can land), and a beat later every foe on the line is cut. */
  c_dash() {
    const F = this.f; const L = this.look;
    const dir = this.flat(); const from = F.pos.clone(); const to = from.clone().addScaledVector(dir, 7.5);
    if (to.length() > F.arena) to.setLength(F.arena);
    F.swing = null; F.charge = null; F.invuln = Math.max(F.invuln, 0.5); F.lock = null;
    const hits = [];
    const seg = V().subVectors(to, from); const len = Math.max(0.01, seg.length()); seg.multiplyScalar(1 / len);
    for (const f of this.live()) { const rel = V().subVectors(f.pos, from); const u = clamp(rel.dot(seg), 0, len); const d = rel.addScaledVector(seg, -u).setY(0).length(); if (d < 1.5 + (f.scale - 1) * 0.6) hits.push({ f, u }); }
    this.active = { kind: 'dash', t: 0, dur: 0.2, from, to, dir: seg.clone(), hits, word: 'cutting' };
    this.decals.add({ kind: 'strip', x: (from.x + to.x) / 2, z: (from.z + to.z) / 2, y: this.gy(from.x, from.z), len, size: 1.0, rot: -Math.atan2(seg.z, seg.x), color: L.decal, glow: 1.2, alpha: 0.6, life: 1.6, prog: [0, 1, 0.2] });
    sfx(L.style === 'snow' ? 'pwDashWind' : 'pwDash');
  }
  u_dash(a, dt) {
    const F = this.f; const L = this.look; a.t += dt; const k = clamp(a.t / a.dur, 0, 1);
    /* after the run the hero turns to look back at the line, so the cuts land in view */
    if (a.back != null) { let d = a.back - F.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); F.yaw += d * Math.min(1, dt * 14); return a.t < a.dur + 0.32; }
    const prev = F.pos.clone();
    F.pos.lerpVectors(a.from, a.to, 1 - (1 - k) * (1 - k)); F.vel.set(0, 0, 0);
    const cam = F.world.camera;
    /* speed lines round the view, and a shadow left on the path */
    for (let i = 0; i < 14; i++) { const q = V(rand(-1.4, 1.4), rand(-0.9, 0.9), rand(-2.5, -0.6)).applyMatrix4(cam.matrixWorld); this.add.emit(q.x, q.y, q.z, -a.dir.x * 40, 0, -a.dir.z * 40, 0.1, 0.035, 0.02, L.core2, L.mid, 0.8, 0, 0, 0.04); }
    const g = this.gy(F.pos.x, F.pos.z);
    const snow = L.style === 'snow';
    for (let i = 0; i < (snow ? 6 : 10); i++) { const t = Math.random(); this.smoke.emit(prev.x + (F.pos.x - prev.x) * t, g + rand(0.3, snow ? 1.4 : 2.0), prev.z + (F.pos.z - prev.z) * t, a.dir.x * 2, 0.2, a.dir.z * 2, 0.9, 0.5, snow ? 1.0 : 1.4, snow ? L.end : L.smoke, L.smokeEnd, snow ? 0.32 : 0.55, 0, 2, 0); }
    /* snow on a bright day: blue-white flakes in the smoke pool (normal blend keeps them blue, additive would wash out on grass) */
    if (snow) for (let i = 0; i < 12; i++) { const t = Math.random(); const s = rand(-1, 1); this.smoke.emit(prev.x + (F.pos.x - prev.x) * t - a.dir.z * s, g + rand(0.3, 2.0), prev.z + (F.pos.z - prev.z) * t + a.dir.x * s, a.dir.x * 5 + rand(-1, 1), rand(-0.3, 0.6), a.dir.z * 5 + rand(-1, 1), rand(0.9, 1.4), 0.1, 0.06, L.core2, L.end, 0.95, 0.3, 1.2, 0, SHAPE.shard); }
    for (let i = 0; i < 10; i++) { const t = Math.random(); this.add.emit(prev.x + (F.pos.x - prev.x) * t + rand(-0.4, 0.4), g + rand(0.4, 2.2), prev.z + (F.pos.z - prev.z) * t + rand(-0.4, 0.4), a.dir.x * 6, 0, a.dir.z * 6, 0.7, 0.06, 0.03, L.core2, L.mid, 0.9, L.style === 'snow' ? 0.5 : 0, 1.5, 0.05); }
    if (a.t >= a.dur) {
      F.crit = Math.max(F.crit, 1.2);
      /* the cuts land a beat after the hero is through: the iai feel */
      a.hits.sort((x, y) => y.u - x.u).forEach(({ f }, i) => this.later(0.2 + i * 0.07, () => this.cut(f, a.dir)));
      if (F.boss && !F.boss.dead) { const mid = a.from.clone().lerp(a.to, 0.5); this.later(0.2, () => { const h = this.dragonHit(mid, 3.2, 8, true); if (h) this.slashLine(h.pos, a.dir); }); }
      if (a.hits.length) { const c = V(); for (const { f } of a.hits) c.add(f.pos); c.multiplyScalar(1 / a.hits.length); a.back = F.yawTo(c); }
      else return false;
      sfx('swing');
      return true;
    }
    return true;
  }
  cut(f, dir) {
    if (f.state === 'dead') return;
    const F = this.f; const side = V(-dir.z, 0, dir.x);
    this.slashLine(this.body(f), dir);
    this.hit(f, F.weapon.damage * 1.6 * this.power(), side, { heavy: true, poise: 10, knock: 1.2, bossK: 0.5 });
    if (f.boss) this.bossNote(f, 'Cut'); F.hitstop = Math.max(F.hitstop, 0.07); F.shake = Math.max(F.shake, 0.5);
  }
  slashLine(b, dir) {
    const L = this.look; const up = V(0, 1, 0); const ax = V().crossVectors(dir, up).normalize().multiplyScalar(1.5).addScaledVector(up, 1.4);
    /* a crisp crescent cut (a bright edge with a coloured glow), ink or snow torn off it, the world's hit look, a light */
    for (let i = -24; i <= 24; i++) { const t = i / 24; const bow = (1 - t * t) * 0.35; const q = V(b.x + ax.x * t + dir.x * bow, b.y + ax.y * t, b.z + ax.z * t + dir.z * bow);
      this.add.emit(q.x, q.y, q.z, ax.x * 0.6, ax.y * 0.6, ax.z * 0.6, 0.55, 0.2 * (1 - Math.abs(t) * 0.6), 0.04, this.white.clone().multiplyScalar(2.2), L.mid2, 1, 0, 3, 0.25, SHAPE.spark);
      if (i % 2 === 0) this.add.emit(q.x, q.y, q.z, 0, 0, 0, 0.45, 0.7 * (1 - Math.abs(t) * 0.5), 0.25, L.mid2, L.end, 0.5, 0, 0, 0, SHAPE.glow);
      if (i % 3 === 0 && L.style === 'shadow') this.smoke.emit(q.x - dir.x * 0.1, q.y - 0.06, q.z - dir.z * 0.1, ax.x * 0.3, -0.3, ax.z * 0.3, 0.7, 0.18, 0.1, this._ink ||= new THREE.Color(0x0a0810), this._ink, 0.9, 2, 1, 0.3, SHAPE.drop); }
    if (L.style === 'snow') this.bits(b, 26, 5, L.core2, L.mid, { kind: SHAPE.star, glow: true, size: 0.1, g: 1.2, drag: 2, life: 1.1, vx: dir.x * 5, vz: dir.z * 5 });
    else this.billows(b, 8, { speed: 1.5, size: 0.7, rise: 0.4, life: 1.0, a: 0.75, vx: dir.x * 2, vz: dir.z * 2 });
    this.impact(b, dir, L.mid.getHex(), 22, 7);
    this.flashLight(b, L.mid, 45, 0.25); sfx('pwCut');
  }

  /* 9. SLAM: a short hop (0.3 s), then a ring from the ground: small foes are thrown down, armour staggers, a boss only loses poise. */
  c_slam() {
    const F = this.f; const L = this.look;
    F.swing = null; F.charge = null; F.swingCd = 0.45;
    this.active = { kind: 'slam', t: 0, dur: 0.3, word: 'rising' };
    /* the gather shows at once: a hot ring 4 m out that closes in to the feet, so the first frame after E is not empty */
    this.decals.add({ kind: 'ring', x: F.pos.x, z: F.pos.z, y: this.gy(F.pos.x, F.pos.z), size: 8, color: L.mid, glow: 2.6, alpha: 0.8, life: 0.32, prog: [1, 0.35, 0.3], fade: 0.3 });
    F.kickPitch -= 0.05; sfx('pwSlamUp');
  }
  u_slam(a, dt) {
    const F = this.f; const L = this.look; a.t += dt;
    const g = this.gy(F.pos.x, F.pos.z);
    /* the gather: heat pulls in to the feet */
    for (let i = 0; i < 10; i++) { const ang = rand(0, TAU); const r = rand(2.8, 4.5); this.add.emit(F.pos.x + Math.cos(ang) * r, g + rand(0.1, 1.0), F.pos.z + Math.sin(ang) * r, -Math.cos(ang) * r * 3, 0.4, -Math.sin(ang) * r * 3, 0.28, 0.06, 0.03, L.core2, L.mid, 1, 0, 0, 0.07, SHAPE.spark); }
    F.kickPitch += dt * 0.25;
    if (a.t < a.dur) return true;
    const at = V(F.pos.x, g, F.pos.z); const P = this.power(); const R = 6.5;
    /* a hot white flash in front of the hero, an orange ring that races out over the
       ground, a low wall of standing flame that rides it from 2.4 m out (never under the camera or over the HUD band), ember
       streaks thrown up and out that fall back, and thin dark smoke that rolls off the ring. No scorch under the feet: from
       first person it was a flat orange smudge on the lens */
    const fw = this.flat();
    this.add.emit(at.x + fw.x * 4.5, g + 1.1, at.z + fw.z * 4.5, 0, 0, 0, 0.1, 3.5, 5.5, this.white.clone().multiplyScalar(1.6), L.mid, 0.45, 0, 0, 0, SHAPE.glow);
    this.decals.add({ kind: 'ring', x: at.x, z: at.z, y: g, size: R * 2.1, color: L.mid, glow: 1.5, alpha: 0.75, life: 0.5, prog: [0.35, 1, 0.38], fade: 0.5 });
    for (let i = 0; i < 120; i++) { const ang = rand(0, TAU); const sp = rand(9, 13); const h = rand(0.05, 0.4);
      this.add.emit(at.x + Math.cos(ang) * 3.2, g + h, at.z + Math.sin(ang) * 3.2, Math.cos(ang) * sp, rand(0.3, 1.2), Math.sin(ang) * sp, rand(0.25, 0.4), rand(0.3, 0.5), rand(0.6, 1.1), L.mid, L.fireEnd, 0.4, -1.5, 2.2, 0, SHAPE.flame); }
    this.streaks(V(at.x + fw.x * 2.6, g + 0.3, at.z + fw.z * 2.6), null, 40, 9, L.core2, L.mid, { size: 0.05, g: 7, life: 0.9, lift: 1.1, st: 0.08, cone: 0.9 });
    this.later(0.12, () => { for (let i = 0; i < 50; i++) { const ang = rand(0, TAU); const r = rand(3.5, 5.5); const p = V(at.x + Math.cos(ang) * r, g + 0.2, at.z + Math.sin(ang) * r); this.add.emit(p.x, p.y, p.z, Math.cos(ang) * 3, rand(3, 6), Math.sin(ang) * 3, rand(0.6, 1.0), 0.05, 0.02, L.core2, L.mid, 1, 8, 0.6, 0.08, SHAPE.spark); } });
    for (let i = 0; i < 22; i++) { const ang = (i / 22) * TAU + rand(-0.1, 0.1); this.smoke.emit(at.x + Math.cos(ang) * 3.4, g + 0.45, at.z + Math.sin(ang) * 3.4, Math.cos(ang) * 6, 0.8, Math.sin(ang) * 6, rand(0.9, 1.3), 0.5, 1.3, L.smoke, L.smokeEnd, 0.3, -0.3, 2.4, 0, SHAPE.billow); }
    this.flashLight(V(at.x + fw.x * 4.5, g + 1.6, at.z + fw.z * 4.5), L.mid, 50, 0.4, 12); this.veilFlash(`inset 0 0 140px 30px ${css(L.mid, 0.4)}`, 160);
    F.shake = Math.max(F.shake, 1.0); F.world.kick(0.32); F.world.flash(0.3); F.hitstop = Math.max(F.hitstop, 0.08); F.kickPitch += 0.06;
    sfx('pwSlam');
    for (const f of this.live()) {
      const to = V().subVectors(f.pos, F.pos).setY(0); const d = to.length(); if (d > R + (f.scale - 1)) continue; if (to.lengthSq() < 1e-4) to.copy(this.flat()); to.normalize();
      if (f.boss) { this.hit(f, 6 * P, to, { poise: 10, knock: 0, bossK: 1 }); this.bossNote(f, 'Shaken'); continue; }
      this.hit(f, 3 * P, to, { poise: 12, knock: 2.4 });
      if (f.state === 'dead') continue;
      if (f.def.armor) { f.vel.addScaledVector(to, 4); if (f.state !== 'stagger') F.staggerFoe(f, to); }
      else F.knockDown(f, to, 10);
    }
    this.dragonHit(at, R, 6, true);
    return false;
  }

  /* 10. PULSE: an instant wave (9 m) that stops every blow being readied, drops fliers and wipes bolts in the air. A boss is stopped only mid wind-up. */
  c_pulse() {
    const F = this.f; const L = this.look; const P = this.power();
    const at = V(F.pos.x, EYE - 0.6, F.pos.z); const g = this.gy(F.pos.x, F.pos.z);
    /* a shell of light that is visible as a wall racing out (bigger sprites), plus arcs that crawl the ground */
    for (let i = 0; i < 220; i++) { const u = rand(-0.5, 0.5); const a = rand(0, TAU); const s = Math.sqrt(1 - u * u); const sp = rand(19, 23); this.add.emit(at.x + Math.cos(a) * s * 1.2, at.y + u, at.z + Math.sin(a) * s * 1.2, Math.cos(a) * s * sp, u * sp * 0.4, Math.sin(a) * s * sp, 0.42, 0.22, 0.12, i % 2 ? L.core2 : L.mid2, L.end2, 0.75, 0, 0.6, 0.03, SHAPE.spark); }
    for (let i = 0; i < 6; i++) { const a = rand(0, TAU); const p0 = V(at.x + Math.cos(a) * 1.5, g + 0.1, at.z + Math.sin(a) * 1.5); this.later(i * 0.04, () => this.arc(p0, V(p0.x + Math.cos(a) * 5, g + 0.1, p0.z + Math.sin(a) * 5), L.core2, L.mid, { seg: 7, jit: 0.4, size: 0.1, life: 0.2 })); }
    this.decals.add({ kind: 'ring', x: at.x, z: at.z, y: g, size: 18, color: L.mid, glow: 3.6, life: 0.45, prog: [0.05, 1, 0.4] });
    this.decals.add({ kind: 'ring', x: at.x, z: at.z, y: g, size: 12, color: L.end, glow: 3, life: 0.6, prog: [0.05, 1, 0.55] });
    this.flashLight(at, L.mid, 90, 0.3, 18); this.veilFlash(`inset 0 0 120px 40px ${css(L.mid, 0.55)}, inset 0 0 40px 10px ${css(L.end, 0.5)}`, 140);
    F.world.flash(0.45); F.shake = Math.max(F.shake, 0.5); sfx('pwPulse');
    let stopped = 0;
    for (const f of this.live()) {
      const to = V().subVectors(f.pos, F.pos).setY(0); const d = to.length(); if (d > 9 + (f.scale - 1)) continue; to.normalize();
      const winding = f.state === 'attack' && f.atk && f.atk.clipT < f.atk.def.hits[0];
      const b = this.body(f);
      for (let i = 0; i < 6; i++) this.later(i * 0.1, () => { if (f.state !== 'dead') { const c = this.body(f); this.arc(c, c.clone().add(V(rand(-1, 1), rand(-1.3, 0.4), rand(-1, 1)).multiplyScalar(f.scale)), L.core2, L.mid, { seg: 4, jit: 0.3, size: 0.09, life: 0.15 }); if (i % 2 === 0) this.streaks(c, null, 8, 5, L.core2, L.mid, { size: 0.05, life: 0.3 }); } });
      this.burst(b, 16, 4, 0.3, 0.08, L.core2, L.mid, { st: 0.04 });
      if (f.boss) {
        if (winding && !f.atk.def.hyper) { F.staggerFoe(f, to); stopped++; this.bossNote(f, 'Interrupted'); } else { f.poise -= 6; this.bossNote(f, 'It shrugs off the pulse'); }
        this.tick(f, 1.5 * P); continue;
      }
      this.hit(f, 1.5 * P, to, { poise: 4, knock: 0.6, quiet: true });
      if (f.state === 'dead') continue;
      if (f.fly) { F.knockDown(f, to, 4); stopped++; }
      else if (winding || f.state === 'block') { F.staggerFoe(f, to); stopped++; }
    }
    for (const s of F.shots || []) { if (s.back) continue; if (s.sp.position.distanceTo(at) < 10) { this.burst(s.sp.position, 20, 3, 0.3, 0.08, L.core2, L.mid); s.t = 99; s.sp.position.y = -5; } }
    if (F.boss && !F.boss.dead) this.dragonHit(at, 9, 3);
    if (stopped) F.hud.toast(`${stopped} stopped`);
  }

  /* 11. BOMB: a lobbed charge with a 1.2 s fuse. It bounces once, then blows: big damage, throws foes down. It hurts the hero too inside 2.6 m. */
  c_bomb() {
    const F = this.f; const L = this.look;
    const from = this.hand(); const G = 16;
    const tgt = F.lock || F.pickTarget(16, 0.7);
    let land;
    if (tgt) land = tgt.pos.clone(); else { const fw = this.flat(); const dist = clamp(7 + F.pitch * 8, 4, 12); land = V(F.pos.x + fw.x * dist, 0, F.pos.z + fw.z * dist); }
    land.y = this.gy(land.x, land.z);
    const T = clamp(from.distanceTo(land) / 11, 0.45, 1.0);
    const v = V((land.x - from.x) / T, (land.y - from.y + 0.5 * G * T * T) / T, (land.z - from.z) / T);
    this.objs.push({ kind: 'bomb', p: from.clone(), v, G, t: 0, fuse: 1.2, bounced: false, spin: 0 });
    F.vmPunch?.set(0, 0.04, 0.12); sfx('pwThrow'); sfx('pwFuse');
  }
  o_bomb(o, dt) {
    const F = this.f; const L = this.look; o.t += dt;
    o.v.y -= o.G * dt; o.p.addScaledVector(o.v, dt);
    const g = this.gy(o.p.x, o.p.z);
    if (o.p.y < g + 0.12) { o.p.y = g + 0.12; if (!o.bounced) { o.bounced = true; o.v.y = Math.abs(o.v.y) * 0.3; o.v.x *= 0.45; o.v.z *= 0.45; sfx('pwBounce'); } else { o.v.y = 0; o.v.x *= Math.max(0, 1 - dt * 6); o.v.z *= Math.max(0, 1 - dt * 6); } }
    /* the stick: a dark red core; the fuse: a white spitting point */
    this.smoke.emit(o.p.x, o.p.y, o.p.z, 0, 0, 0, 0.04, 0.2, 0.2, L.end, L.end, 1); this.add.emit(o.p.x, o.p.y, o.p.z, 0, 0, 0, 0.04, 0.3, 0.3, L.mid, L.mid, 0.5);
    const fz = V(o.p.x + Math.sin(o.t * 9) * 0.1, o.p.y + 0.16, o.p.z + Math.cos(o.t * 9) * 0.1);
    /* the fuse spits orange sparks with a small hot glow (the white star read as a tiny white starburst on the boss) */
    this.add.emit(fz.x, fz.y, fz.z, 0, 0, 0, 0.05, 0.16 + 0.06 * Math.sin(o.t * 40), 0.1, L.mid2, L.mid, 0.8, 0, 0, 0, SHAPE.glow);
    for (let i = 0; i < 5; i++) this.add.emit(fz.x, fz.y, fz.z, rand(-2.5, 2.5), rand(1, 4), rand(-2.5, 2.5), rand(0.15, 0.35), 0.035, 0.015, L.core2, L.mid, 1, 10, 0.5, 0.1, SHAPE.spark);
    if (this.lightT > this.lightDur) this.flashLight(fz, L.mid, 10, 0.06, 6);
    if (Math.random() < 0.3) this.smoke.emit(fz.x, fz.y, fz.z, 0, 0.8, 0, 0.8, 0.12, 0.5, L.smoke, L.smokeEnd, 0.4, -0.2, 1, 0);
    if (o.t < o.fuse) return true;
    /* the blast */
    const P = this.power(); const R = 4.4; const at = V(o.p.x, g + 0.6, o.p.z);
    let vis = 1; for (const f of this.live()) if (f.boss && Math.hypot(f.pos.x - at.x, f.pos.z - at.z) < R + f.scale) vis = Math.max(vis, Math.min(2.2, f.scale * 0.7));
    if (F.boss && !F.boss.dead) vis = Math.max(vis, 1.8);
    this.boom(at, R, 'scorch', vis);
    for (const f of this.live()) {
      const to = V(f.pos.x - at.x, 0, f.pos.z - at.z); const d = to.length(); if (d > R + 0.5 * f.scale) continue; to.normalize();
      const k = 1 - 0.5 * clamp(d / R, 0, 1);
      if (f.boss) { this.hit(f, 12 * P * k, to, { heavy: true, poise: 12, bossK: 1 }); this.bossNote(f, 'Blasted'); continue; }
      this.hit(f, 7 * P * k, to, { heavy: true, poise: 14, knock: 2.6 });
      if (f.state === 'dead') continue;
      if (f.def.armor) F.staggerFoe(f, to); else F.knockDown(f, to, 11);
    }
    this.dragonHit(at, R, 10, true);
    const dh = Math.hypot(F.pos.x - at.x, F.pos.z - at.z);
    if (dh < 2.6) F.takeHit({ pos: at.clone(), damage: 1, def: { label: 'blast' } }, { dmg: 1, unblockable: true, push: 2.6, blunt: true });
    return false;
  }

  /* 12. VORTEX: a whirlwind walks forward for 3.4 s, drags foes into it and spins them (they cannot fight), then throws them all down. */
  c_vortex() {
    const F = this.f; const fw = this.flat();
    const c = V(F.pos.x + fw.x * 2.6, 0, F.pos.z + fw.z * 2.6);
    const ring = this.decals.add({ kind: 'ring', x: c.x, z: c.z, y: this.gy(c.x, c.z), size: 6.4, color: this.look.decal, glow: 1.4, hold: true, prog: [0.3, 0.85, 0.3] });
    this.objs.push({ kind: 'vortex', c, v: fw.multiplyScalar(3.2), t: 0, dur: 3.4, R: 3.2, caught: new Set(), tick: 0, ring, gust: 0 });
    sfx('pwWind');
  }
  o_vortex(o, dt) {
    const F = this.f; const L = this.look; o.t += dt;
    o.c.addScaledVector(o.v, dt); if (o.c.length() > F.arena - 1) o.c.setLength(F.arena - 1);
    /* drift toward the nearest foe it has not caught yet */
    let near = null; let bd = 6; for (const f of this.live()) { if (o.caught.has(f)) continue; const d = Math.hypot(f.pos.x - o.c.x, f.pos.z - o.c.z); if (d < bd) { bd = d; near = f; } }
    if (near) { const s = V(near.pos.x - o.c.x, 0, near.pos.z - o.c.z).normalize(); o.v.lerp(s.multiplyScalar(3.2), Math.min(1, dt * 1.5)); }
    const g = this.gy(o.c.x, o.c.z); o.ring.x = o.c.x; o.ring.z = o.c.z; o.ring.y = g;
    const rise = clamp(o.t / 0.3, 0, 1) * clamp((o.dur - o.t) / 0.3, 0, 1);
    /* the funnel: dust on a widening cone, turning fast, and bright grit */
    for (let i = 0; i < Math.round(26 * rise); i++) {
      const h = rand(0, 5.5); const r = 0.5 + h * 0.42; const a = rand(0, TAU);
      const x = o.c.x + Math.cos(a) * r; const z = o.c.z + Math.sin(a) * r; const tw = 9;
      this.smoke.emit(x, g + h, z, -Math.sin(a) * tw + o.v.x, rand(1.5, 3), Math.cos(a) * tw + o.v.z, rand(0.3, 0.5), 0.5 + h * 0.12, 1.1 + h * 0.2, L.smoke, L.smokeEnd, 0.32, 0, 0, 0);
    }
    for (let i = 0; i < Math.round(22 * rise); i++) { const h = rand(0, 5); const r = 0.4 + h * 0.42; const a = rand(0, TAU); this.add.emit(o.c.x + Math.cos(a) * r, g + h, o.c.z + Math.sin(a) * r, -Math.sin(a) * 12, rand(2, 5), Math.cos(a) * 12, 0.3, 0.05, 0.02, L.core2, L.mid, 0.9, 0, 0, 0.09); }
    for (let i = 0; i < Math.round(8 * rise); i++) { const h = rand(0, 4.5); const r = 0.55 + h * 0.42; const a = rand(0, TAU); this.smoke.emit(o.c.x + Math.cos(a) * r, g + h, o.c.z + Math.sin(a) * r, -Math.sin(a) * 9, 1, Math.cos(a) * 9, 0.35, 0.12, 0.1, L.end, L.smoke, 0.6, 0, 0, 0.12); }
    if (Math.random() < dt * 8) this.smoke.emit(o.c.x + rand(-1.5, 1.5), g + 0.1, o.c.z + rand(-1.5, 1.5), rand(-2, 2), 0.2, rand(-2, 2), 1.1, 0.6, 1.8, L.smoke, L.smokeEnd, 0.4, 0, 1.4, 0);
    /* grit, stones and brush whirled round the funnel */
    for (let i = 0; i < Math.round(4 * rise); i++) { const h = rand(0.2, 4); const r = 0.6 + h * 0.42; const a = rand(0, TAU); this.smoke.emit(o.c.x + Math.cos(a) * r, g + h, o.c.z + Math.sin(a) * r, -Math.sin(a) * 10, rand(1, 3), Math.cos(a) * 10, 0.35, 0.12, 0.1, this._grit ||= new THREE.Color(0x4a3826), this._grit, 1, 0, 0, 0, i % 2 ? SHAPE.shard : SHAPE.leaf); }
    o.gust -= dt; if (o.gust <= 0) { o.gust = 0.45; sfx('pwWhirl'); }
    o.tick -= dt; const tk = o.tick <= 0; if (tk) o.tick = 0.25;
    for (const f of this.live()) {
      const dx = o.c.x - f.pos.x; const dz = o.c.z - f.pos.z; const d = Math.hypot(dx, dz); if (d > o.R + (f.scale - 1) * 0.5) continue;
      const s = this.status(f);
      if (f.boss) { s.chill = Math.max(s.chill, 0.3); s.chillK = 0.8; if (tk) this.tick(f, 0.3 * this.power()); if (!o.noted) { o.noted = true; this.bossNote(f, 'Caught in the wind'); } continue; }
      if (!o.caught.has(f)) { o.caught.add(f); F.releaseToken(f); f.atk = null; if (f.state === 'attack') f.state = 'idle'; }
      s.caught = 0.3; s.chill = Math.max(s.chill, 0.3); s.chillK = 0.15;
      const pull = f.def.armor ? 3 : 7; f.vel.x += (dx / Math.max(0.3, d)) * pull * dt * 6; f.vel.z += (dz / Math.max(0.3, d)) * pull * dt * 6;
      f.vel.x += (-dz / Math.max(0.3, d)) * 5 * dt * 6 * 0.3; f.vel.z += (dx / Math.max(0.3, d)) * 5 * dt * 6 * 0.3;
      f.yaw += dt * (f.def.armor ? 4 : 10);
      if (tk) this.tick(f, 0.45 * this.power());
    }
    if (o.t < o.dur) return true;
    /* the throw */
    for (const f of o.caught) {
      if (f.state === 'dead') continue; const to = V(f.pos.x - o.c.x, 0, f.pos.z - o.c.z); if (to.lengthSq() < 1e-3) to.set(rand(-1, 1), 0, rand(-1, 1)); to.normalize();
      this.hit(f, 2 * this.power(), to, { poise: 8, knock: 2 });
      if (f.state !== 'dead') { if (f.def.armor) F.staggerFoe(f, to); else F.knockDown(f, to, 9); }
    }
    this.burst(V(o.c.x, g + 1.5, o.c.z), 60, 9, 0.6, 0.08, L.core2, L.mid, { g: 6, st: 0.04, flat: true });
    this.puff(V(o.c.x, g + 0.5, o.c.z), 20, 6, 1.2, 1.4, L.smoke, { rise: 0.6, a: 0.45 });
    this.decals.remove(o.ring); sfx('pwWindEnd');
    return false;
  }

  /* 13. WALL: a 9 m wall of thorns 3.8 m ahead for 5.5 s. Foes cannot cross it; a foe that touches it is snared and torn. A boss walks through, slowed. */
  c_wall() {
    const F = this.f; const L = this.look; const fw = this.flat();
    const c = V(F.pos.x + fw.x * 3.8, 0, F.pos.z + fw.z * 3.8); c.y = this.gy(c.x, c.z);
    const t = V(-fw.z, 0, fw.x);
    const strip = this.decals.add({ kind: 'strip', x: c.x, z: c.z, y: c.y, len: 9, size: 1.8, rot: -Math.atan2(t.z, t.x), color: L.decal, glow: 1.2, life: 5.8, prog: [0.5, 1, 0.35], fade: 0.15 });
    this.objs.push({ kind: 'wall', c, n: fw.clone(), tv: t, half: 4.5, t: 0, dur: 5.5, tick: 0, side: new Map(), strip });
    sfx('pwThorns');
    F.shake = Math.max(F.shake, 0.35);
  }
  o_wall(o, dt) {
    const F = this.f; const L = this.look; o.t += dt;
    const grow = clamp(o.t / 0.35, 0, 1); const end = clamp((o.dur - o.t) / 0.4, 0, 1);
    /* thorns: streaks that shoot up and fall back along the line, leaves, and petals */
    const n = Math.round(38 * end);
    for (let i = 0; i < n; i++) {
      const u = rand(-1, 1) * o.half * grow; const x = o.c.x + o.tv.x * u + rand(-0.25, 0.25); const z = o.c.z + o.tv.z * u + rand(-0.25, 0.25);
      const h = rand(1.2, 2.6) * grow; const lean = rand(-0.25, 0.25);
      /* thorns are tall dark spikes standing on the line (shards pointed along their lean), with lit tips, leaves and moss at the foot */
      if (i % 2 === 0) this.smoke.emit(x, o.c.y + h * 0.5, z, lean * 0.1, 0.05, lean * 0.05, rand(0.35, 0.6), h * 0.55, h * 0.5, L.smoke, L.smokeEnd, 0.95, 0, 0, -1, SHAPE.shard);
      else if (i % 5 === 1) this.add.emit(x, o.c.y + h, z, 0, 0.1, 0, 0.3, 0.09, 0.03, L.core2, L.mid, 0.9, 0, 0, 0, SHAPE.star);
      else if (i % 5 === 3) this.smoke.emit(x, o.c.y + rand(0.3, 1.6), z, rand(-0.3, 0.3), rand(0, 0.3), rand(-0.3, 0.3), rand(0.5, 0.9), 0.14, 0.12, new THREE.Color(0x3a6a2a), new THREE.Color(0x24401a), 1, 0, 1, 0, SHAPE.leaf);
      else this.smoke.emit(x, o.c.y + rand(0, 0.6), z, rand(-0.3, 0.3), rand(0, 0.3), rand(-0.3, 0.3), rand(0.4, 0.8), 0.45, 0.8, L.smoke, L.smokeEnd, 0.5, 0, 1, 0);
    }
    if (L.style === 'bramble' && Math.random() < dt * 14) { const u = rand(-o.half, o.half); this.smoke.emit(o.c.x + o.tv.x * u, o.c.y + rand(1, 2), o.c.z + o.tv.z * u, rand(-0.5, 0.5), 0.2, rand(-0.5, 0.5), 1.6, 0.1, 0.08, this._petal ||= new THREE.Color(0xff9ad0), this._petal2 ||= new THREE.Color(0xe0609a), 1, 0.8, 1.2, 0, SHAPE.leaf); }
    o.tick -= dt; const tk = o.tick <= 0; if (tk) o.tick = 0.5;
    for (const f of this.live()) {
      if (f.fly) continue;
      const rx = f.pos.x - o.c.x; const rz = f.pos.z - o.c.z; const u = rx * o.tv.x + rz * o.tv.z; const s = rx * o.n.x + rz * o.n.z;
      if (Math.abs(u) > o.half * grow + 0.3) { o.side.delete(f); continue; }
      const thick = 0.7 + 0.35 * f.scale;
      if (!o.side.has(f) || Math.abs(s) > thick + 1) o.side.set(f, Math.sign(s) || 1);
      if (Math.abs(s) > thick) continue;
      const st = this.status(f);
      if (f.boss) { st.chill = Math.max(st.chill, 0.4); st.chillK = 0.65; if (tk) { this.tick(f, 0.6 * this.power()); this.bossNote(f, 'Torn by thorns'); } continue; }
      /* held on its own side of the wall, snared */
      const sd = o.side.get(f); const want = sd * (thick + 0.02); f.pos.x += o.n.x * (want - s); f.pos.z += o.n.z * (want - s);
      f.vel.multiplyScalar(0.2);
      if (st.root <= 0) { this.burst(this.body(f), 16, 3, 0.4, 0.08, L.core2, L.mid, { g: 4 }); sfx('pwSnare'); }
      st.root = Math.max(st.root, 1.4);
      if (tk) this.tick(f, 0.7 * this.power());
    }
    if (o.t < o.dur) return true;
    this.puff(V(o.c.x, o.c.y + 0.5, o.c.z), 14, 2, 1, 1.2, L.smoke, { a: 0.4 });
    return false;
  }

  /* ---------- the sigil thrown by the mark ---------- */
  o_sigil(o, dt) {
    const L = this.look; o.t += dt; const k = Math.min(1, o.t / o.dur);
    const to = o.foe ? this.body(o.foe) : o.to;
    const p = V().lerpVectors(o.p, to, k); p.y += Math.sin(k * Math.PI) * 0.6;
    this.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.2, 0.3, 0.05, L.core2, L.mid2, 1, 0, 0, 0);
    for (let i = 0; i < 2; i++) this.add.emit(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.3, 0.08, 0.02, L.core2, L.end, 1, 0, 0, 0);
    return k < 1;
  }

  /* ---------- fight.damageFoe asks this first: a mark bursts, a frozen or chilled foe shatters ---------- */
  onHit(f, dmg, heavy) {
    const s = f.pw; if (!s || this._det) return dmg;
    if (heavy && s.mark > 0) {
      s.mark = 0; if (s.markDecal) { this.decals.remove(s.markDecal); s.markDecal = null; }
      const at = this.body(f);
      this.later(0.0, () => { this._det = true; try { this.detonate(f, at); } finally { this._det = false; } });
    }
    if (heavy && (f.state === 'frozen' || s.chill > 0)) {
      const L = this.look; const b = this.body(f);
      this.burst(b, 70, 8, 0.7, 0.14, L.core2, L.mid, { g: 12, st: 0.04 });
      for (let i = 0; i < 24; i++) this.add.emit(b.x, b.y, b.z, rand(-6, 6), rand(1, 7), rand(-6, 6), rand(0.6, 1), 0.16, 0.1, this.white, L.mid, 1, 14, 0.4, 0.02);
      this.flashLight(b, L.mid, 9, 0.2); sfx('pwShatter');
      const frozen = f.state === 'frozen';
      s.chill = 0; s.frozen = 0;
      if (frozen) this.later(0, () => { if (f.state === 'frozen') { f.state = 'hit'; f.t = 0; } });
      if (f.boss) this.bossNote(f, 'Shattered'); else this.f.hud.toast('Shattered');
      return dmg * (frozen ? 1.25 : 1.5);
    }
    return dmg;
  }
  /* the dragon is not a foe: its damage call is wrapped once, so marks and chills reach it too */
  wrapDragon() {
    const B = this.f.boss; if (!B || B._pw) return; B._pw = true;
    const dmg0 = B.damage.bind(B); const upd0 = B.update.bind(B);
    B.damage = (id, dmg, dir, opts = {}) => {
      if (!this._own && opts.heavy && this.dragonMark > 0) {
        this.dragonMark = 0; const h = B.hittable().find((x) => x.id === id);
        if (h) this.later(0, () => { this.boom(h.pos.clone(), 4.2, 'crack'); this._own = true; try { dmg0(id, 14 * this.power() * this.f.bossMul, dir, { heavy: true }); } finally { this._own = false; } this.bossNote(true, 'The mark bursts'); });
      }
      if (!this._own && opts.heavy && this.dragonChill > 0) { this.dragonChill = 0; dmg *= 1.4; this.bossNote(true, 'Shattered'); }
      return dmg0(id, dmg, dir, opts);
    };
    B.update = (dt) => upd0(dt * (this.dragonChill > 0 ? 0.7 : 1));
  }

  /* ---------- per frame (fight.update) ---------- */
  update(dt) {
    const F = this.f; this.clock += dt;
    if (F.boss && !F.boss._pw) this.wrapDragon();
    if (this.dragonMark > 0) {
      this.dragonMark -= dt; const fp = F.boss && !F.boss.dead ? F.boss.focus?.() : null;
      if (fp && Math.random() < 0.6) { const L = this.look; const a = this.clock * 4; this.add.emit(fp.x + Math.cos(a) * 1.2, fp.y + 0.8, fp.z + Math.sin(a) * 1.2, 0, 0.5, 0, 0.5, 0.18, 0.05, L.core2, L.mid, 1); }
    }
    if (this.dragonChill > 0) this.dragonChill -= dt;
    for (let i = this.tasks.length - 1; i >= 0; i--) { const t = this.tasks[i]; t.t -= dt; if (t.t <= 0) { this.tasks.splice(i, 1); try { t.fn(); } catch (err) { console.warn('power task', err); } } }
    if (this.active) { let go = false; try { go = this[`u_${this.active.kind}`](this.active, dt); } catch (err) { console.warn('power', err); } if (!go) this.active = null; }
    if (this.ward) { try { this.u_ward(this.ward, dt); } catch (err) { console.warn('ward', err); this.endWard(); } }
    if (this.objs.length) { const cur = this.objs; this.objs = []; const keep = cur.filter((o) => { try { return this[`o_${o.kind}`](o, dt) !== false; } catch (err) { console.warn('power obj', err); return false; } }); this.objs = keep.concat(this.objs); }
    this.updateFoes(dt);
    this.lightT += dt; const lk = this.lightDur > 0 ? clamp(1 - this.lightT / this.lightDur, 0, 1) : 0; this.light.intensity = this.lightI * lk * lk;
    const floor = F.journey ? F.footY : 0;
    this.add.update(dt, floor); this.smoke.update(dt, floor); this.decals.update(dt, this.clock, this.f.world.renderer?.getDrawingBufferSize?.(this._db ||= new THREE.Vector2()).y);
  }
  /* statuses: burn ticks, chill and snare slow the foe's own clock (fight.update reads f.timeK), the mark follows its foe */
  updateFoes(dt) {
    const L = this.look; const F = this.f;
    for (const f of F.foes) {
      const s = f.pw; if (!s) continue;
      if (f.state === 'dead') {
        if (s.mark > 0) { /* the mark moves on to the nearest foe */ s.mark = 0; if (s.markDecal) { this.decals.remove(s.markDecal); s.markDecal = null; } let next = null; let bd = 7; for (const o of this.live()) { const d = o.pos.distanceTo(f.pos); if (d < bd) { bd = d; next = o; } } if (next) { this.objs.push({ kind: 'sigil', p: this.body(f), foe: next, t: 0, dur: 0.3 }); this.later(0.3, () => this.setMark(next, 8)); } }
        f.timeK = 1; s.burn = s.chill = s.root = 0; continue;
      }
      s.burn = Math.max(0, s.burn - dt); s.chill = Math.max(0, s.chill - dt); s.root = Math.max(0, s.root - dt); s.caught = Math.max(0, (s.caught || 0) - dt); s.frozen = Math.max(0, (s.frozen || 0) - dt);
      let k = 1; if (s.chill > 0) k = Math.min(k, s.chillK); if (s.root > 0) k = Math.min(k, f.boss ? 0.65 : 0.12);
      f.timeK = f.state === 'frozen' ? 1 : k;
      const b = (s.burn > 0 || s.chill > 0 || s.root > 0 || s.mark > 0 || s.frozen > 0) ? this.body(f) : null;
      if (s.burn > 0) {
        s.tick -= dt; if (s.tick <= 0) { s.tick = 0.5; this.tick(f, 0.45 * this.power()); }
        /* real flames lick up the body (below the face) and a thin smoke rolls off; no white dots */
        const cold = L.style === 'wind' || L.style === 'ice';
        if (cold) { if (Math.random() < 0.5) this.add.emit(b.x + rand(-0.4, 0.4) * f.scale, b.y + rand(-0.9, 0.3) * f.scale, b.z + rand(-0.4, 0.4) * f.scale, 0, rand(-0.2, 0.2), 0, 0.5, 0.1, 0.06, L.core2, L.mid, 0.8, 0, 0, 0, SHAPE.shard); }
        else {
          for (let i = 0; i < (Math.random() < 0.6 ? 1 : 0); i++) this.add.emit(b.x + rand(-0.3, 0.3) * f.scale, b.y + rand(-0.9, 0.2) * f.scale, b.z + rand(-0.3, 0.3) * f.scale, rand(-0.3, 0.3), rand(1.2, 2.4), rand(-0.3, 0.3), rand(0.3, 0.5), 0.22 * f.scale, 0.5 * f.scale, L.mid, L.end, 0.5, -1.5, 1, 0, SHAPE.flame); /* no white-hot core on a burning body (it read as white spikes) */
          if (Math.random() < dt * 6) this.billows(V(b.x, b.y + 0.3 * f.scale, b.z), 1, { speed: 0.3, size: 0.6 * f.scale, rise: 1.6, life: 1.2, a: 0.4 });
        }
      }
      if (s.chill > 0 || s.frozen > 0) {
        /* frost on the body: glints of rime (shards), and a cold mist at the feet */
        if (Math.random() < 0.5) this.add.emit(b.x + rand(-0.4, 0.4) * f.scale, b.y + rand(-1, 0.3) * f.scale, b.z + rand(-0.4, 0.4) * f.scale, 0, rand(-0.2, 0.2), 0, 0.5, 0.11, 0.07, L.core2, L.mid, 0.85, 0, 0, 0, SHAPE.shard);
        if (Math.random() < dt * 5) this.billows(V(b.x, b.y - 1.0 * f.scale, b.z), 1, { speed: 0.4, size: 0.7, rise: 0.15, life: 1.2, a: 0.3, color: L.smoke });
      }
      if (s.root > 0 && Math.random() < 0.6) this.smoke.emit(b.x + rand(-0.4, 0.4), b.y - 1.0 * f.scale, b.z + rand(-0.4, 0.4), 0, 0.6, 0, 0.5, 0.3, 0.6, L.smoke, L.smokeEnd, 0.6, 0, 1, 0);
      if (s.mark > 0) {
        s.mark -= dt;
        if (s.markDecal) { s.markDecal.x = f.pos.x; s.markDecal.z = f.pos.z; s.markDecal.y = this.gy(f.pos.x, f.pos.z); }
        /* a burning sigil ring turns round the foe's waist (below the face), and the blood mark drips */
        const a = this.clock * 4; const mid = b.y - 0.15 * f.scale; const rr = 0.55 * Math.max(1, f.scale * 0.8);
        for (let i = 0; i < 3; i++) { const aa = a + i * TAU / 3; this.add.emit(b.x + Math.cos(aa) * rr, mid, b.z + Math.sin(aa) * rr, -Math.sin(aa) * 1.5, 0.2, Math.cos(aa) * 1.5, 0.4, 0.14, 0.05, L.core2, L.mid2, 1, 0, 0, 0.06, L.style === 'dusk' ? SHAPE.flame : SHAPE.glow); }
        if (L.style === 'blood' && Math.random() < dt * 14) this.smoke.emit(b.x + rand(-0.25, 0.25), b.y + rand(-0.2, 0.3), b.z + rand(-0.25, 0.25), 0, -0.5, 0, 0.7, 0.07, 0.05, new THREE.Color(0x7a0a0a), new THREE.Color(0x3a0404), 1, 9, 0, 0.04, SHAPE.drop);
        if (s.mark <= 0 && s.markDecal) { this.decals.remove(s.markDecal); s.markDecal = null; }
      }
    }
  }

  dispose() {
    this.endWard(); this.veil.remove();
    for (const f of this.f.foes) f.timeK = 1;
    this.add.dispose(); this.smoke.dispose(); this.decals.dispose(); this.light.removeFromParent();
  }
}

function css(color, a) { const c = color.isColor ? color : new THREE.Color(color); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; }

/* ---------- scene fire and smoke helpers (for props, quest fires and lands) ----------
   The same soft standing flame tongues and round, lit, soft-edged puffs the powers use, for a fire or a smoke source in
   the scene (a campfire, a brazier, a chimney, a train stack). One small pool (one draw) per helper; no new shader per call.
     const fire = softFire(scene, { at, size: 0.8, rate: 40, smoke: true });  // at: a Vector3 or an Object3D to follow
     const plume = softSmoke(scene, { at, size: 1.2, rise: 1.6, rate: 6, color: 0x3a3634, endColor: 0x8a8480, alpha: 0.5, wind: [0.4, 0, 0.1] });
     each frame: fire.update(dt); plume.update(dt)   when done: fire.dispose(); plume.dispose()
   fire.set({ size, rate }) changes it live (rate 0 lets it die down). Keep a fire's size near its real flame (0.5-1.5 m):
   the tongues stand up and taper, so a campfire never reads as a beam of light. */
const _src = (at, out) => (at?.isObject3D ? at.getWorldPosition(out) : out.copy(at || V()));
export function softFire(scene, o = {}) {
  const pool = new Pool(scene, o.max ?? 260, true, [0.3, 1.0]);
  const smoke = o.smoke ? new Pool(scene, 120, false, [0.6, 1.6]) : null; if (smoke) smoke.kind = SHAPE.billow;
  const C = (h, d) => new THREE.Color(h ?? d);
  const S = { size: o.size ?? 0.8, rate: o.rate ?? 40, core: C(o.core, 0xfff0c0).multiplyScalar(1.6), mid: C(o.mid, 0xff8a2a), end: C(o.end, 0x8a200a),
    smokeC: C(o.smokeColor, 0x2a2420), smokeE: C(o.smokeEnd, 0x6a6460), acc: 0, accS: 0, p: V() };
  return {
    set(x) { Object.assign(S, x); },
    update(dt) {
      _src(o.at, S.p); const s = S.size; S.acc += dt * S.rate;
      while (S.acc >= 1) { S.acc -= 1; const r = s * 0.28; const a = rand(0, TAU); const rr = r * Math.sqrt(Math.random());
        const k = rr / Math.max(r, 1e-3); /* the middle burns tall and hot, the edge low and red */
        pool.emit(S.p.x + Math.cos(a) * rr, S.p.y + rand(0, 0.08) * s, S.p.z + Math.sin(a) * rr, rand(-0.1, 0.1) * s, s * rand(0.9, 1.6) * (1.2 - k * 0.6), rand(-0.1, 0.1) * s,
          rand(0.45, 0.8), s * rand(0.35, 0.5) * (1 - k * 0.4), s * rand(0.7, 1.0) * (1 - k * 0.5), k < 0.5 ? S.core : S.mid, S.end, 0.5, -0.6 * s, 1.6, 0, SHAPE.flame);
        if (Math.random() < 0.12) pool.emit(S.p.x + rand(-r, r), S.p.y + s * 0.4, S.p.z + rand(-r, r), rand(-0.4, 0.4), rand(1.2, 2.4) * s, rand(-0.4, 0.4), rand(0.8, 1.4), 0.025 * Math.max(1, s), 0.01, S.core, S.mid, 1, 0.8, 0.6, 0.06, SHAPE.spark); }
      if (smoke) { S.accS += dt * S.rate * 0.12; while (S.accS >= 1) { S.accS -= 1; smoke.emit(S.p.x + rand(-0.1, 0.1) * s, S.p.y + s * 1.3, S.p.z + rand(-0.1, 0.1) * s, (o.wind?.[0] ?? 0.2), rand(0.6, 1.0) * s, (o.wind?.[2] ?? 0.1), rand(1.6, 2.4), s * 0.35, s * 1.3, S.smokeC, S.smokeE, 0.32, -0.1, 0.4, 0, SHAPE.billow); } smoke.update(dt, -1e9); }
      pool.update(dt, -1e9);
    },
    dispose() { pool.dispose(); smoke?.dispose(); },
  };
}
export function softSmoke(scene, o = {}) {
  const pool = new Pool(scene, o.max ?? 160, false, [0.6, 1.8]); pool.kind = SHAPE.billow;
  const S = { size: o.size ?? 1, rise: o.rise ?? 1.4, rate: o.rate ?? 6, life: o.life ?? 3, alpha: o.alpha ?? 0.5, wind: o.wind ?? [0.3, 0, 0.1],
    color: new THREE.Color(o.color ?? 0x3a3634), endColor: new THREE.Color(o.endColor ?? 0x8a8480), acc: 0, p: V() };
  return {
    set(x) { Object.assign(S, x); if (x.color != null) S.color = new THREE.Color(x.color); if (x.endColor != null) S.endColor = new THREE.Color(x.endColor); },
    update(dt) {
      _src(o.at, S.p); S.acc += dt * S.rate; const s = S.size;
      while (S.acc >= 1) { S.acc -= 1;
        pool.emit(S.p.x + rand(-0.15, 0.15) * s, S.p.y + rand(0, 0.2) * s, S.p.z + rand(-0.15, 0.15) * s, S.wind[0] + rand(-0.15, 0.15) * s, S.rise * rand(0.7, 1.1), S.wind[2] + rand(-0.15, 0.15) * s,
          S.life * rand(0.8, 1.2), s * rand(0.4, 0.6), s * rand(1.6, 2.4), S.color, S.endColor, S.alpha, -0.05, 0.25, 0, SHAPE.billow); }
      pool.update(dt, -1e9);
    },
    dispose() { pool.dispose(); },
  };
}

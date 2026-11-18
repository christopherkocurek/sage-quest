/* Boss dressing and boss effects for the knight-based bosses (giant, lich, twin).
   The fight spawns a knight actor as usual and then calls dressBoss(actor, id, ctx). The handle owns every extra
   mesh, light, decal and particle of that boss; all are pooled and made once. No per-frame allocation.

   handle.update(dt, state)   state: { pos, yaw, phase, attacking, moving, hpFrac, player? (Vector3, the hero's feet) }
   handle.onStep(pos)         giant footfall (also detected by itself from the feet): dust ring; returns a shake amount
   handle.onSlam(pos)         giant slam: crack decal, shards, a crater that stays; returns { shake, flash, slow }
   handle.onSummon(positions) lich: rune circles; returns seconds until the thralls should rise
   handle.rise(actor)         lich: a summoned thrall climbs out of the ground over 1.2 s, shedding dirt
   handle.onPhase(phase)      lich: phase 2 cracks the lantern and darkens the arena (read handle.darkness 0..1)
   handle.onHit(point, heavy) twin: 60 ms flash + a crack on the glass at the hit; a heavy hit shatters the helm
   handle.onParry(point, dir) twin: a mirror-image spark
   handle.takeShake()         shake that the boss asks for since the last call (giant footfalls)
   handle.lookAt              Vector3: the boss head in world space (camera tilt, labels)
   handle.float               metres above the ground (lich 0.4, else 0); already applied inside the model
   handle.keepOut             metres: hold the hero at least this far from the boss centre (giant 1.8 x scale = 4.86, else unset)
   handle.onDeath(pos)        the boss death, played by the handle itself; returns how many seconds it lasts. Call it
                              once when the boss dies and skip the usual foe death for it (no part throw, no gear throw,
                              no Death01): giant 4.9 s (to its knees, maul falls, ground shock + frost), lich 6.5 s
                              (lantern bursts, the shroud falls empty, the crown rolls), twin 4.5 s (the glass shatters,
                              the hero's own helm drops). Keep calling update(dt, { ...state, dead: true }) after it.
   handle.dispose() */
import * as THREE from 'three';
import { dotTexture, bakeSkinned, isShield, worldMod, underUniforms } from './world.js';
import { finishFoe, foeRng, rankKit, build, boneOf as fBone, HEAVY } from './worlds/foe-look.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const BOSS_SCALE = { giant: 3.3, lich: 1.25, twin: 1.0 }; /* giant 2.7 -> 3.3 (game/kit.mjs size) */
/* The full look of each boss (actor.look). The twin takes the hero's look instead. */
export const BOSS_LOOK = {
  giant: { helm: 'giant', giant: true, heavy: false, horns: true, cloak: false, tabard: true, steel: 0xb2aca2, cloth: 0x1b1512 },
  lich: { helm: 'hood', shroud: true, sleeves: true, boneHands: true, ironCrown: true, skull: true, body: false, robe: false, cloak: false, tabard: false, pauldrons: false, cloth: 0x0b0910 },
};
/* plates the lich does not wear (the shroud covers the body; the bones are the hands) */
const LICH_HIDE = ['Chest', 'Fauld', 'UpArmL', 'UpArmR', 'ForeArmL', 'ForeArmR', 'ThighL', 'ThighR', 'ShinL', 'ShinR', 'HeavyL', 'HeavyR', 'PauldronL', 'PauldronR', 'Horns', 'Crown'];
const LICH_KEEP = new Set(['Hood', 'Shroud', 'Sleeves', 'IronCrown', 'BoneHands', 'Eyes', 'LichSkull']);
const WALKS = new Set(['Walk_Loop', 'Jog_Fwd_Loop', 'Zombie_Walk_Fwd_Loop', 'Sprint_Loop', 'Walk_Formal_Loop', 'Walk_Carry_Loop']);

/* the land height under a point (world.js sets scene.userData.groundAt from the land): debris rests on the real ground, never in the air */
const ZERO_GROUND = () => 0; let GROUND = ZERO_GROUND;
const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3(); const _d = new THREE.Vector3(); const _e = new THREE.Vector3();
const _eul = new THREE.Euler(); const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion(); const _m = new THREE.Matrix4(); const _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0); const ZAX = new THREE.Vector3(0, 0, 1);
const _AQ = new THREE.Quaternion(); const _AQI = new THREE.Quaternion();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------------------------------------------------------------- textures (made once) */
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const TEX = {};
function canvasTex(key, size, draw) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX[key] = t; return t;
}
/* radial ground cracks: the same paths as dark cracks (key 'crack') and as a glow mask (key 'crackGlow') */
function crackPaths() {
  if (TEX.paths) return TEX.paths;
  const r = seeded(31); const paths = [];
  const grow = (x, y, a, len, w, depth) => {
    const pts = [[x, y]]; let px = x; let py = y;
    for (let i = 0; i < 14; i++) { a += (r() - 0.5) * 0.7; const st = len / 14; px += Math.cos(a) * st; py += Math.sin(a) * st; pts.push([px, py]); if (depth < 2 && r() < 0.16) grow(px, py, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * (0.35 + r() * 0.3), w * 0.6, depth + 1); }
    paths.push({ pts, w });
  };
  for (let i = 0; i < 15; i++) grow(0.5, 0.5, (i / 15) * Math.PI * 2 + r() * 0.3, 0.3 + r() * 0.18, 0.018 + r() * 0.01, 0);
  TEX.paths = paths; return paths;
}
function drawCracks(g, s, glow) {
  g.clearRect(0, 0, s, s); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const { pts, w } of crackPaths()) {
    for (let k = 0; k < pts.length - 1; k++) {
      const t = k / (pts.length - 1); const lw = w * s * (1 - t * 0.8);
      g.strokeStyle = glow ? `rgba(255,255,255,${0.95 - t * 0.5})` : `rgba(0,0,0,${0.95 - t * 0.35})`;
      g.lineWidth = glow ? lw * 0.6 : lw * 1.5; g.beginPath(); g.moveTo(pts[k][0] * s, pts[k][1] * s); g.lineTo(pts[k + 1][0] * s, pts[k + 1][1] * s); g.stroke();
    }
  }
  if (!glow) { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.2); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
}
const crackTex = () => canvasTex('crack', 1024, (g, s) => drawCracks(g, s, false));
const crackGlowTex = () => canvasTex('crackGlow', 512, (g, s) => drawCracks(g, s, true));
const craterTex = () => canvasTex('crater', 256, (g, s) => {
  const r = seeded(5); const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(6,5,5,0.97)'); gr.addColorStop(0.55, 'rgba(14,12,11,0.9)'); gr.addColorStop(0.8, 'rgba(30,27,25,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2; const d = Math.sqrt(r()) * s * 0.45; g.fillStyle = `rgba(${r() < 0.5 ? 0 : 90},${r() < 0.5 ? 0 : 84},${r() < 0.5 ? 0 : 78},${0.25 + r() * 0.4})`; g.fillRect(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1 + r() * 4, 1 + r() * 4); }
});
const runeTex = () => canvasTex('rune', 1024, (g, s) => {
  const r = seeded(17); const c = s / 2; g.clearRect(0, 0, s, s); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  const ring = (rad, w) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, rad * c, 0, Math.PI * 2); g.stroke(); };
  ring(0.96, 10); ring(0.9, 4); ring(0.66, 7); ring(0.6, 3); ring(0.3, 5);
  for (let i = 0; i < 28; i++) { /* glyphs between the two outer rings */
    const a0 = (i / 28) * Math.PI * 2; g.save(); g.translate(c + Math.cos(a0) * 0.78 * c, c + Math.sin(a0) * 0.78 * c); g.rotate(a0 + Math.PI / 2); g.lineWidth = 5;
    g.beginPath(); for (let k = 0; k < 3 + Math.floor(r() * 3); k++) { const x0 = (r() - 0.5) * 34; const y0 = (r() - 0.5) * 50; g.moveTo(x0, y0); g.lineTo(x0 + (r() - 0.5) * 40, y0 + (r() - 0.5) * 50); } g.stroke(); g.restore();
  }
  g.lineWidth = 6; g.beginPath(); for (let i = 0; i < 7; i++) { const a = (i * 3 / 7) * Math.PI * 2 - Math.PI / 2; const x = c + Math.cos(a) * 0.6 * c; const y = c + Math.sin(a) * 0.6 * c; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); g.stroke();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.arc(c + Math.cos(a) * 0.6 * c, c + Math.sin(a) * 0.6 * c, 16, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; g.lineWidth = i % 4 ? 3 : 7; g.beginPath(); g.moveTo(c + Math.cos(a) * 0.9 * c, c + Math.sin(a) * 0.9 * c); g.lineTo(c + Math.cos(a) * (i % 4 ? 0.86 : 0.82) * c, c + Math.sin(a) * (i % 4 ? 0.86 : 0.82) * c); g.stroke(); }
});
const glassCrackTex = () => canvasTex('glass', 256, (g, s) => {
  const r = seeded(9); const c = s / 2; g.clearRect(0, 0, s, s); g.strokeStyle = '#fff'; g.lineCap = 'round';
  const spokes = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + r() * 0.4; const pts = [[c, c]]; let x = c; let y = c; let aa = a; for (let k = 0; k < 6; k++) { aa += (r() - 0.5) * 0.5; const st = (0.07 + r() * 0.05) * s; x += Math.cos(aa) * st; y += Math.sin(aa) * st; pts.push([x, y]); } spokes.push(pts); }
  for (const pts of spokes) for (let k = 0; k < pts.length - 1; k++) { g.lineWidth = 3.2 - k * 0.45; g.globalAlpha = 1 - k * 0.12; g.beginPath(); g.moveTo(...pts[k]); g.lineTo(...pts[k + 1]); g.stroke(); }
  g.globalAlpha = 0.85; g.lineWidth = 1.6;
  for (const ringK of [1, 2, 4]) { g.beginPath(); spokes.forEach((p, i) => { const q = p[Math.min(p.length - 1, ringK)]; if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.stroke(); }
  const gr = g.createRadialGradient(c, c, 0, c, c, s * 0.08); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const puffTex = () => canvasTex('puff', 128, (g, s) => {
  const r = seeded(3); g.clearRect(0, 0, s, s);
  for (let i = 0; i < 16; i++) { const x = s * (0.3 + r() * 0.4); const y = s * (0.3 + r() * 0.4); const rad = s * (0.12 + r() * 0.2); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
});

/* a tongue of flame for point sprites: a soft round foot that tapers into a ragged tip (white, tinted per particle) */
const flameTex = () => canvasTex('flame', 128, (g, s) => {
  g.clearRect(0, 0, s, s); const r = seeded(13);
  for (let i = 0; i < 9; i++) { const y = s * (0.72 - i * 0.07); const w = s * (0.2 - i * 0.019) * (0.85 + r() * 0.3); const x = s * 0.5 + (r() - 0.5) * s * 0.05 * i * 0.4;
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(2, w)); gr.addColorStop(0, `rgba(255,255,255,${0.42 - i * 0.03})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
});
/* thin wisps (smoke, mist): a faint irregular cloud, never a solid disc */
const wispTex = () => canvasTex('wisp', 128, (g, s) => {
  const r = seeded(29); g.clearRect(0, 0, s, s);
  for (let i = 0; i < 22; i++) { const a = r() * 6.28; const d = r() * s * 0.22; const x = s / 2 + Math.cos(a) * d; const y = s / 2 + Math.sin(a) * d * 0.7; const rad = s * (0.07 + r() * 0.14);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
});

/* ---------------------------------------------------------------- GLSL bits */
const NOISE_GLSL = `
float sqH3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sqNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sqH3(i), sqH3(i + vec3(1,0,0)), f.x), mix(sqH3(i + vec3(0,1,0)), sqH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sqH3(i + vec3(0,0,1)), sqH3(i + vec3(1,0,1)), f.x), mix(sqH3(i + vec3(0,1,1)), sqH3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
/* the noise functions once per shader, however many effects chain on it */
const noiseFor = (src) => (src.includes('float sqNoise(') ? '' : NOISE_GLSL);
function chain(mat, key, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { fn(sh); prev?.call(mat, sh, r); };
  const k = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${k ? k() : ''}|${key}`;
  mat.needsUpdate = true;
}
/* like chain(), but fn edits the shader after the earlier hooks (world.js under-layer and mail) have run */
function postChain(mat, key, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { prev?.call(mat, sh, r); fn(sh); };
  const k = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${k ? k() : ''}|${key}`;
  mat.needsUpdate = true;
}
/* the mail rings are drawn in bind units, so on a 2.7x body they are 2.7x bigger: closer than about 1.5 m they fade to
   their flat mean (and lose the bump) instead of drawing as huge concentric rings */
/* the sqFade body in world.js, whatever its thresholds are now (a fixed string went stale when world.js changed them) */
const MAIL_FADE = /float sqFade\(vec2 q\) \{[^}]*\}/;
/* this never ran: world.js keeps the under-layer flag in a WeakMap (underUniforms), not in userData.under, so the
   giant's sleeves drew bind-size rings 2.7x too big with white bump highlights, like knitted wool. Now the rings are drawn at the giant's own scale (ring cells / S: real mail on a real giant, about 1 cm),
   so at fight range they are below a pixel and go to their dark flat mean with no bump, and they fade a little
   sooner (0.04-0.16 rings per pixel). */
const RING_CELLS = ['0.0095', '0.0105', '0.012'];
function nearMailFade(mat, S = 1) {
  if (mat.userData.sqNearMail) return; mat.userData.sqNearMail = true;
  postChain(mat, `sq-nearmail${S}`, (sh) => {
    let f = sh.fragmentShader.replace(MAIL_FADE, 'float sqFade(vec2 q) { float w = max(length(dFdx(q)), length(dFdy(q))); return smoothstep(0.04, 0.16, w); }');
    for (const c of RING_CELLS) f = f.split(`) / ${c};`).join(`) / (${c} / ${S.toFixed(3)});`);
    sh.fragmentShader = f;
  });
}
/* frost or ash that settles on every surface that faces up (world normal), broken up by noise */
function addFrost(mat, U) {
  chain(mat, 'sq-frost', (sh) => {
    Object.assign(sh.uniforms, { sqFrostCol: U.col, sqFrostK: U.k });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSqW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vSqW; uniform vec3 sqFrostCol; uniform float sqFrostK;${noiseFor(sh.fragmentShader)}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn = inverseTransformDirection(normal, viewMatrix);
          float n1 = sqNoise(vSqW * 2.6); float n2 = sqNoise(vSqW * 11.0);
          float snow = smoothstep(0.5, 0.82, wn.y + (n1 - 0.5) * 0.7 + (n2 - 0.5) * 0.35) * (0.55 + 0.45 * smoothstep(0.3, 0.7, n1));
          snow = max(snow, smoothstep(0.82, 0.97, n2) * 0.3 * smoothstep(-0.3, 0.3, wn.y));
          snow *= sqFrostK;
          diffuseColor.rgb = mix(diffuseColor.rgb, sqFrostCol * (0.55 + 0.35 * n2), snow);
          roughnessFactor = mix(roughnessFactor, 0.82, snow); metalnessFactor = mix(metalnessFactor, 0.0, snow);
          normal = normalize(mix(normal, normalize(normal + (vec3(n2, n1, n2 * n1) - 0.5) * 0.6), snow * 0.6)); }`);
  });
}
/* the lich hem: the bottom 30% of the shroud burns away into moving wisps with a cold edge */
function addHem(mat, U) {
  chain(mat, 'sq-hem', (sh) => {
    Object.assign(sh.uniforms, { sqTime: U.time, sqEdgeCol: U.col, sqHemK: U.k });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqHem;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqHem = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vSqHem; uniform float sqTime; uniform vec3 sqEdgeCol; uniform float sqHemK;${noiseFor(sh.fragmentShader)}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float sqT = clamp((0.16 - vSqHem.y) / 0.66, 0.0, 1.0) * sqHemK;
        float sqNz = sqNoise(vec3(vSqHem.x * 7.0, vSqHem.y * 2.2 + sqTime * 0.45, vSqHem.z * 7.0)) * 0.7 + sqNoise(vec3(vSqHem.x * 19.0, vSqHem.y * 6.0 + sqTime * 0.9, vSqHem.z * 19.0)) * 0.3;
        float sqCut = sqT * 1.1 - 0.06;
        if (sqT > 0.0 && sqNz < sqCut) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += sqEdgeCol * smoothstep(0.07, 0.0, sqNz - sqCut) * step(0.001, sqT) * 1.6;`);
  });
}
/* the lich robe: the cloth below the waist sways and trails when it glides (vertex, bind space), a fine weave that
   fades before it can shimmer, grime toward the hem, a few moth holes (alpha test). U: time, drag (vec3, model space), k */
function addRobe(mat, U) {
  chain(mat, 'sq-robe', (sh) => {
    Object.assign(sh.uniforms, { sqRTime: U.time, sqDrag: U.drag, sqRobeK: U.k });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float sqRTime; uniform vec3 sqDrag; uniform float sqRobeK; varying vec3 vSqRobe;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSqRobe = position;
        { float sw = clamp((1.02 - position.y) / 1.45, 0.0, 1.0); sw *= sw * sqRobeK; float a = atan(position.z, position.x);
          transformed.x += sw * (0.03 * sin(sqRTime * 1.7 + position.y * 4.0 + a * 2.0) + sqDrag.x);
          transformed.z += sw * (0.03 * sin(sqRTime * 1.25 + position.y * 3.0 - a * 3.0 + 1.7) + sqDrag.z);
          transformed.y += sw * (0.015 * sin(sqRTime * 2.1 + a * 5.0) + sqDrag.y); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vSqRobe;${noiseFor(sh.fragmentShader)}
        /* deep vertical folds that open toward the hem (bind space): they break the cone into cloth at 4 m */
        float sqFoldH(vec3 p) { float ang = atan(p.z, p.x); float below = smoothstep(1.35, 0.1, p.y);
          float f = 0.5 + 0.5 * sin(ang * 9.0 + sqNoise(vec3(ang * 1.6, p.y * 1.3, 0.5)) * 4.5); return f * f * (0.3 + 0.7 * below); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vSqRobe.y < 0.75 && vSqRobe.y > -0.1) { float hn = sqNoise(vSqRobe * vec3(13.0, 9.0, 13.0)); if (hn > 0.86 - 0.06 * smoothstep(0.6, 0.0, vSqRobe.y)) discard; }
        /* a torn, uneven hem: long rags and short bites */
        { float ang = atan(vSqRobe.z, vSqRobe.x); float tn = sqNoise(vec3(ang * 2.6, 1.3, 0.2)) * 0.65 + sqNoise(vec3(ang * 11.0, 4.1, 0.7)) * 0.35;
          if (vSqRobe.y < -0.62 + 0.36 * tn * tn) discard; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float fh = sqFoldH(vSqRobe) * 0.03; vec3 dpx = dFdx(-vViewPosition); vec3 dpy = dFdy(-vViewPosition); float dhx = dFdx(fh); float dhy = dFdy(fh);
          vec3 r1 = cross(dpy, normal); vec3 r2 = cross(normal, dpx); float det = dot(dpx, r1); vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad * 1.6); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.55 + 0.6 * sqFoldH(vSqRobe);   /* the fold valleys stay dark, the ridges catch the light */
        if (!gl_FrontFacing) diffuseColor.rgb *= 0.12;       /* the inside of the robe is a dark lining, never a lit inner face */
        { vec2 q = vec2(atan(vSqRobe.z, vSqRobe.x) * 0.2, vSqRobe.y) / 0.004; float w = max(length(dFdx(q)), length(dFdy(q)));
          float weave = mix(0.5 + 0.5 * sin(q.x * 6.2832) * sin(q.y * 6.2832 + 1.57 * step(0.5, fract(q.x * 0.5))), 0.5, smoothstep(0.15, 0.45, w));
          float grime = smoothstep(0.4, -0.4, vSqRobe.y);
          diffuseColor.rgb *= (0.78 + 0.4 * weave) * (1.0 - 0.35 * grime);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.02), grime * 0.4); }`);
  });
}
/* A black cracked mirror: near-black glass that reflects the sky, cut into facets by a network of hairline cracks
   (object-space Voronoi in bind pose, so the cracks ride the body). The light sits only on a thin cold rim
   (an inverted Fresnel look: a dark core, a bright edge) and on the crack lines. U: rim, rimK, flash, flashCol, crackK */
function glassMaterial(U, { normalMap = null, cloth = false, env = null } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: cloth ? 0x020203 : 0x010102, metalness: cloth ? 0.0 : 0.5, roughness: cloth ? 0.38 : 0.14, clearcoat: cloth ? 0.15 : 0.45, clearcoatRoughness: cloth ? 0.3 : 0.12,
    envMap: env, envMapIntensity: cloth ? 0.04 : 0.2, normalMap, side: cloth ? THREE.DoubleSide : THREE.FrontSide, sheen: cloth ? 1 : 0, sheenColor: new THREE.Color(0x0c0e12), sheenRoughness: 0.4 });
  if (normalMap) m.normalScale = new THREE.Vector2(0.2, 0.2);
  chain(m, cloth ? 'sq-glass-c' : 'sq-glass', (sh) => {
    Object.assign(sh.uniforms, { sqRimCol: U.rim, sqRimK: U.rimK, sqFlash: U.flash, sqFlashCol: U.flashCol, sqCrackK: U.crackK, sqSweep: U.sweep, sqVoidK: U.voidK, sqTime: U.time, sqCut: U.cut || { value: 99 } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqG; varying float vSqWY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqG = position;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSqWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform vec3 sqRimCol; uniform float sqRimK; uniform float sqFlash; uniform vec3 sqFlashCol; uniform float sqCrackK; uniform float sqSweep; uniform float sqVoidK; uniform float sqTime; uniform float sqCut; varying vec3 vSqG; varying float vSqWY;
        vec3 sqGH(vec3 p) { p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float sqLine = 0.0; float sqFar = 1.0; vec3 sqId = vec3(0.0); float sqC = 0.0; float sqVoid = 0.0;
        { vec3 x = vSqG * ${cloth ? '5.0' : '6.0'}; vec3 ip = floor(x); vec3 fp = fract(x); float d1 = 8.0; float d2 = 8.0; vec3 id = vec3(0.0);
          for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec3 b = vec3(float(i), float(j), float(k)); vec3 r = b + sqGH(ip + b) * 0.9 - fp; float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; id = ip + b; } else if (d < d2) d2 = d; }
          float e = sqrt(d2) - sqrt(d1); float w = max(fwidth(e), 1e-4); sqId = id; sqC = sqrt(d1);
          sqFar = smoothstep(0.06, 0.2, fwidth(x.x) + fwidth(x.y));   /* far away the lines go before they crowd into a white mesh */
          /* the break: above the cut (world height, jagged per shard) the glass is gone */
          if (vSqWY > sqCut + (sqGH(id + 5.1).y - 0.5) * 0.16) discard;
          /* a few shards are gone: a hole into a dark void with a cold light deep inside (more fall out as it dies) */
          sqVoid = ${cloth ? '0.0' : 'step(sqGH(id + 7.7).x, sqVoidK) * (1.0 - sqFar)'};                 /* cells too small to draw: no lines */
          sqLine = (1.0 - smoothstep(0.3, 1.0, e / w)) * (1.0 - sqFar) * (0.35 + 0.65 * step(0.55, sqGH(id + 3.1).x));  /* thin, and not every crack catches light */
          /* every shard sits at its own small angle, so the reflection breaks at the cracks */
          normal = normalize(normal + (sqGH(id) - 0.5) * ${cloth ? '0.12' : '0.32'} * (1.0 - sqFar)); }`)
      .replace('#include <opaque_fragment>', `{ float f = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), ${cloth ? '9.0' : '6.0'}) * ${cloth ? '0.55' : '1.0'};
          float sqL = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
          outgoingLight *= 0.3 / (0.3 + sqL);   /* a black mirror: no plate may mirror the sky or a land light white */
          /* a glint that sweeps across the body as it moves: a soft band in bind space, broken by the facets */
          float sw = dot(vSqG, normalize(vec3(0.55, 0.8, 0.25)));
          float glint = exp(-pow((sw - sqSweep) / 0.07, 2.0)) * (0.3 + 0.7 * sqGH(sqId + 1.3).y) * (1.0 - sqFar * 0.5);
          outgoingLight = outgoingLight * (1.0 - 0.6 * sqLine) + sqRimCol * (f * sqRimK * 0.6 + sqLine * sqCrackK * 0.3 + glint * ${cloth ? '0.15' : '0.35'}) + sqFlashCol * f * sqFlash * 0.9;
          /* the broken edge: a thin cold line along the cut, light inside the glass */
          { float cutD = (sqCut + (sqGH(sqId + 5.1).y - 0.5) * 0.16) - vSqWY; outgoingLight += sqRimCol * (1.0 - smoothstep(0.0, 0.04, cutD)) * step(sqCut, 50.0) * 0.6; }
          if (sqVoid > 0.5) { float deep = 1.0 - smoothstep(0.0, 0.55, sqC); float pulse = 0.75 + 0.25 * sin(sqTime * 1.7 + sqId.x * 5.3);
            outgoingLight = sqRimCol * (0.015 + 0.22 * deep * deep * pulse) + sqRimCol * sqLine * 0.9; } }
        #include <opaque_fragment>`);
  });
  return m;
}

/* glass shards with bright cold edges (barycentric edge mask) and a slow per-shard glint, for an instanced mesh.
   U: edge (edge brightness), time, cold (colour) */
function edgeShardMaterial(U, env) {
  const m = new THREE.MeshStandardMaterial({ color: 0x030305, metalness: 0.6, roughness: 0.14, envMap: env, envMapIntensity: 0.35, side: THREE.DoubleSide, flatShading: true });
  chain(m, 'sq-shard', (sh) => {
    Object.assign(sh.uniforms, { sqEdge: U.edge, sqTime: U.time, sqCold: U.cold });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aBary; varying vec3 vSqBary; varying float vSqId;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqBary = aBary;\n#ifdef USE_INSTANCING\nvSqId = float(gl_InstanceID);\n#else\nvSqId = 0.0;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float sqEdge; uniform float sqTime; uniform vec3 sqCold; varying vec3 vSqBary; varying float vSqId;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float e = min(min(vSqBary.x, vSqBary.y), vSqBary.z); float ew = fwidth(e) * 1.5 + 0.03; float edge = 1.0 - smoothstep(0.0, ew, e);
          float gl = pow(max(0.0, sin(sqTime * 1.9 + vSqId * 7.13)), 30.0);
          totalEmissiveRadiance += sqCold * (edge * sqEdge * 0.5 + gl * (0.1 + edge) * 0.8); }`);
  });
  return m;
}

/* ---------------------------------------------------------------- pools */
class Particles {
  constructor(scene, max, { additive = false, map = dotTexture(), near = [0.4, 1.6] } = {}) {
    this.max = max; this.n = 0; this.next = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max); this.size = new Float32Array(max);
    this.age = new Float32Array(max); this.life = new Float32Array(max).fill(-1); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.floor = new Uint8Array(max);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage); this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage); this.aS = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aCol); geo.setAttribute('aAlpha', this.aA); geo.setAttribute('aSize', this.aS);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uScale: { value: 600 }, uNear: { value: new THREE.Vector2(near[0], near[1]) } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uScale; uniform vec2 uNear; varying vec3 vC; varying float vA; void main(){ vC = min(aColor, vec3(1.6)); vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlpha * smoothstep(uNear.x, uNear.y, -mv.z); /* fades out before it reaches the lens */ gl_PointSize = aAlpha > 0.0 ? aSize * uScale / max(0.2, -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * t.rgb, a); }',
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    const sz = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, sc, cam) => { renderer.getDrawingBufferSize(sz); this.mat.uniforms.uScale.value = sz.y * 0.5 * cam.projectionMatrix.elements[5]; };
    scene.add(this.points);
  }
  /* one particle: position, velocity, colour (THREE.Color), life, size from..to, alpha, gravity, drag */
  emit(px, py, pz, vx, vy, vz, color, life, s0, s1, a0 = 1, grav = 0, drag = 0, floor = true) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.p[i * 3] = px; this.p[i * 3 + 1] = py; this.p[i * 3 + 2] = pz; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.grav[i] = grav; this.drag[i] = drag; this.floor[i] = floor ? 1 : 0;
    this.size[i] = s0; this.alpha[i] = a0; this.n = Math.max(this.n, i + 1);
  }
  update(dt) {
    let live = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] < 0) continue;
      this.age[i] += dt; const k = this.age[i] / this.life[i];
      if (k >= 1) { this.life[i] = -1; this.alpha[i] = 0; continue; }
      live = true; const j = i * 3; const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[j] *= dr; this.v[j + 1] = this.v[j + 1] * dr - this.grav[i] * dt; this.v[j + 2] *= dr;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.floor[i] && this.p[j + 1] < 0.03) { this.p[j + 1] = 0.03; this.v[j + 1] *= -0.25; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(k);
      this.alpha[i] = this.a0[i] * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88);
    }
    this.points.visible = live;
    if (live) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aA.needsUpdate = true; this.aS.needsUpdate = true; }
  }
  dispose() { this.points.removeFromParent(); this.points.geometry.dispose(); this.mat.dispose(); }
}

/* rigid shards on parabolas (rock, glass): an instanced mesh */
class Shards {
  constructor(scene, max, geometry, material, restK = 0.4) {
    this.max = max; this.next = 0; this.restK = restK;
    this.mesh = new THREE.InstancedMesh(geometry, material, max); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.q = Array.from({ length: max }, () => new THREE.Quaternion());
    this.w = new Float32Array(max * 3); this.sc = new Float32Array(max); this.age = new Float32Array(max); this.life = new Float32Array(max).fill(-1); this.rest = new Uint8Array(max);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    scene.add(this.mesh);
  }
  emit(px, py, pz, vx, vy, vz, scale, life, spin = 8) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.p.set([px, py, pz], i * 3); this.v.set([vx, vy, vz], i * 3); this.w.set([(Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin], i * 3);
    this.q[i].setFromEuler(_eul.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)); this.sc[i] = scale; this.age[i] = 0; this.life[i] = life; this.rest[i] = 0;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] < 0) continue;
      this.age[i] += dt; const j = i * 3;
      if (this.age[i] >= this.life[i]) { this.life[i] = -1; this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); any = true; continue; }
      any = true;
      if (!this.rest[i]) {
        this.v[j + 1] -= 13 * dt; this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
        const ang = Math.hypot(this.w[j], this.w[j + 1], this.w[j + 2]);
        if (ang > 0) { _a.set(this.w[j] / ang, this.w[j + 1] / ang, this.w[j + 2] / ang); _q.setFromAxisAngle(_a, ang * dt); this.q[i].premultiply(_q); }
        const r = this.sc[i] * this.restK + GROUND(this.p[j], this.p[j + 2]);
        if (this.p[j + 1] < r) { this.p[j + 1] = r; if (Math.abs(this.v[j + 1]) < 2) { this.rest[i] = 1; } this.v[j + 1] *= -0.3; this.v[j] *= 0.5; this.v[j + 2] *= 0.5; this.w[j] *= 0.5; this.w[j + 1] *= 0.5; this.w[j + 2] *= 0.5; }
      }
      const k = this.age[i] / this.life[i]; const s = this.sc[i] * (k > 0.8 ? (1 - k) / 0.2 : 1);
      _s.setScalar(s); _a.set(this.p[j], this.p[j + 1], this.p[j + 2]); this.mesh.setMatrixAt(i, _m.compose(_a, this.q[i], _s));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.dispose(); }
}

/* A ribbon that trails a moving edge (the maul head) for `life` seconds. Each frame adds the edge (two points);
   samples older than `life` drop out. Soft on both long edges and toward the tail, so no quad edge ever shows. */
class Ribbon {
  constructor(scene, { max = 48, life = 0.4, color = 0xdfe9f2, opacity = 0.55 } = {}) {
    this.max = max; this.life = life; this.n = 0; this.head = 0;
    this.a = new Float32Array(max * 3); this.b = new Float32Array(max * 3); this.t = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3); this.age = new Float32Array(max * 2); const side = new Float32Array(max * 2);
    for (let i = 0; i < max; i++) { side[i * 2] = 0; side[i * 2 + 1] = 1; }
    const idx = []; for (let i = 0; i < max - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage); this.aAge = new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aAge', this.aAge); geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color(color) }, op: { value: opacity } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float aAge; attribute float aSide; varying float vAge; varying float vSide; varying float vZ; void main(){ vAge = aAge; vSide = aSide; vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 col; uniform float op; varying float vAge; varying float vSide; varying float vZ;
        void main(){ /* close to the lens the smear fades out: it never lies over a part of the body as a pale veil */ float k = clamp(1.0 - vAge, 0.0, 1.0); float edge = smoothstep(0.0, 0.35, vSide) * (1.0 - smoothstep(0.82, 1.0, vSide));
          float streak = 0.4 + 0.6 * abs(sin(vSide * 41.0) * sin(vSide * 17.0 + 1.7));   /* speed streaks along the swing, not a flat sheet */
          float a = op * k * k * edge * streak * (0.35 + 0.65 * vSide) * smoothstep(0.0, 0.08, vAge + 0.0001) * smoothstep(2.2, 4.5, vZ);
          if (a < 0.004) discard; gl_FragColor = vec4(col * (0.8 + 0.4 * vSide), a); }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.visible = false;
    this.clock = 0; scene.add(this.mesh);
  }
  /* add the edge a..b now (call every frame while it should trail); `on` false only ages the trail */
  push(a, b, on = true) {
    if (!on) return;
    const i = this.head; this.head = (this.head + 1) % this.max; this.n = Math.min(this.max, this.n + 1);
    this.a[i * 3] = a.x; this.a[i * 3 + 1] = a.y; this.a[i * 3 + 2] = a.z; this.b[i * 3] = b.x; this.b[i * 3 + 1] = b.y; this.b[i * 3 + 2] = b.z; this.t[i] = this.clock;
  }
  update(dt) {
    this.clock += dt; let live = 0;
    for (let k = 0; k < this.max; k++) {
      const i = (this.head - 1 - k + this.max * 2) % this.max; const age = k < this.n ? (this.clock - this.t[i]) / this.life : 9;
      if (age < 1) live++;
      const j = k * 2; const src = k < this.n ? i : (this.head - this.n + this.max) % this.max; /* unused slots collapse on the oldest sample */
      this.pos[j * 3] = this.a[src * 3]; this.pos[j * 3 + 1] = this.a[src * 3 + 1]; this.pos[j * 3 + 2] = this.a[src * 3 + 2];
      this.pos[j * 3 + 3] = this.b[src * 3]; this.pos[j * 3 + 4] = this.b[src * 3 + 1]; this.pos[j * 3 + 5] = this.b[src * 3 + 2];
      this.age[j] = this.age[j + 1] = Math.min(age, 9);
    }
    this.mesh.visible = live > 1;
    if (this.mesh.visible) { this.aPos.needsUpdate = true; this.aAge.needsUpdate = true; }
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/* a flat thing on the ground */
function groundDecal(map, { size = 1, color = 0xffffff, additive = false, opacity = 1, order = 2 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -2 - order,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive, fog: false });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.visible = false; m.position.y = 0.02 + order * 0.004; m.frustumCulled = false;
  return m;
}

function rockGeometry(seed, detail = 0) {
  const g = new THREE.DodecahedronGeometry(0.5, detail); const p = g.attributes.position; const r = seeded(seed);
  for (let i = 0; i < p.count; i++) { const k = 0.65 + r() * 0.55; p.setXYZ(i, p.getX(i) * k * 1.2, p.getY(i) * k * 0.75, p.getZ(i) * k); }
  g.computeVertexNormals(); return g;
}
/* a chunky lump (a clod, a block of ice, a rock): a subdivided ball pushed in and out by noise, flattened a little, with
   smooth shading so it reads as a solid piece with weight, never a thin crumpled shell */
function rockChunk(seed) {
  const r = seeded(seed); const ico = new THREE.IcosahedronGeometry(0.5, 1); ico.deleteAttribute('normal'); ico.deleteAttribute('uv'); const base = mergeVertices(ico); ico.dispose(); const p = base.attributes.position;
  const lobes = Array.from({ length: 4 }, () => [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, 0.25 + r() * 0.3]);
  for (let i = 0; i < p.count; i++) {
    _a.set(p.getX(i), p.getY(i), p.getZ(i)); const n = _a.clone().normalize(); let k = 1;
    for (const [x, y, z, w] of lobes) k += w * Math.max(0, n.x * x + n.y * y + n.z * z) - w * 0.35;
    k *= 0.78 + r() * 0.36; const y = Math.max(_a.y * k * 0.72, -0.2); /* one flat broken face underneath */ p.setXYZ(i, _a.x * k * 1.15, y, _a.z * k * 0.9);
  }
  base.computeVertexNormals(); return base;
}
/* a
   broken stone: a jittered twelve-point solid, long and flat, with a flat base and one sawn fracture face, flat shaded so
   each chip face catches its own light. Every pooled piece turns and scales, so no two read alike. */
function stoneChunk(seed) {
  const r = seeded(seed); const g = new THREE.IcosahedronGeometry(0.5, 0); const p = g.attributes.position; const jit = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!jit.has(key)) jit.set(key, 0.62 + r() * 0.6);
    const k = jit.get(key); p.setXYZ(i, Math.min(p.getX(i) * k * 1.45, 0.34), Math.max(p.getY(i) * k * 0.62, -0.13), p.getZ(i) * k * 0.95);
  }
  const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals(); return ng;
}
/* a broken block of ice: a jittered twelve-point solid with two sawn faces, flat shaded so every chip face takes its own
   light (smooth shading on a round lump read as soap) */
function iceChunk(seed) {
  const r = seeded(seed); const g = new THREE.IcosahedronGeometry(0.5, 0); const p = g.attributes.position;
  const jit = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!jit.has(key)) jit.set(key, 0.7 + r() * 0.55);
    const k = jit.get(key); p.setXYZ(i, p.getX(i) * k * 1.3, Math.max(p.getY(i) * k * 0.85, -0.18), Math.min(p.getZ(i) * k, 0.3));
  }
  const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals(); return ng;
}
/* the dark lands' ground, as thrown debris */
const DEBRIS = {
  mud: { color: 0x2b241a, rough: 0.42, env: 0.7, lift: 0.7, spray: [0x3b382c, 0x23211a] },   /* wet: a little sheen */
  /* rough, matte, grey-blue chipped ice in smaller pieces:
     a faceted broken block (iceChunk), dark in the cracks, a faint cold glow inside, 0.6x the size */
  ice: { color: 0x5f7486, rough: 0.7, env: 0.5, lift: 1, size: 0.6, ice: true, spray: [0xa9b4bf, 0x7d8995] },
  rock: { color: 0x2c2826, rough: 0.9, env: 0.6, lift: 1, frost: true, spray: [0x5a514a, 0x3a342f] },
  earth: { color: 0x3a2f24, rough: 0.92, env: 0.5, lift: 0.8, spray: [0x5a4c3c, 0x3a3128] },
};
const debrisKind = (land) => ({ drownedfen: 'mud', barrowmoor: 'mud', frostpass: 'ice', ashlands: 'rock', stormcoast: 'rock', dusksteppe: 'earth', vinewild: 'earth', deepwood: 'earth' }[land] || null);
/* a thick glass slab: an uneven five-sided plate with real thickness and bevel-less flat faces. aBary marks only the
   rim edges of the two faces (not the triangle diagonals), so a shard reads as a solid broken piece, never a wire triangle */
function slabShardGeometry(seed = 3, thick = 0.22) {
  const r = seeded(seed); const n = 5; const ring = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.7; const d = 0.32 + r() * 0.2; ring.push([Math.cos(a) * d * 0.8, Math.sin(a) * d * 1.15]); }
  const P = []; const Bc = []; const E = [0, 1, 1]; const I = [1, 1, 1];
  const tri = (a, b, c, ba, bb, bc) => { P.push(...a, ...b, ...c); Bc.push(...ba, ...bb, ...bc); };
  for (const z of [thick / 2, -thick / 2]) for (let i = 0; i < n; i++) { const p = ring[i]; const q = ring[(i + 1) % n]; const c = [0, 0, z * 1.25];
    if (z > 0) tri(c, [p[0], p[1], z], [q[0], q[1], z], I, E, E); else tri(c, [q[0], q[1], z], [p[0], p[1], z], I, E, E); }
  for (let i = 0; i < n; i++) { const p = ring[i]; const q = ring[(i + 1) % n]; const h = thick / 2;
    const pt = [p[0], p[1], h]; const pb = [p[0], p[1], -h]; const qt = [q[0], q[1], h]; const qb = [q[0], q[1], -h];
    tri(pt, pb, qt, E, I, E); tri(qt, pb, qb, I, E, E); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aBary', new THREE.Float32BufferAttribute(Bc, 3)); g.computeVertexNormals(); return g;
}
function shardGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [0, 0.5, 0, -0.18, -0.4, 0.08, 0.2, -0.38, 0.06, 0.02, -0.3, -0.12];
  const idx = [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); const ng = g.toNonIndexed(); ng.computeVertexNormals();
  const bary = []; for (let i = 0; i < ng.attributes.position.count; i++) bary.push(i % 3 === 0 ? 1 : 0, i % 3 === 1 ? 1 : 0, i % 3 === 2 ? 1 : 0);
  ng.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3)); return ng;
}

/* The giant's maul head: a forged eight-sided war hammer, not a box. A chamfered striking face with four pyramid studs
   on one side, a curved beak on the other, blackened bands with rivets, a socket collar and langets down the haft, a
   spike on top. Two merged meshes (worn iron, blackened iron); faceted normals so every flat catches its own light. */
function maulHead(iron, frostU) {
  const A = []; const Bk = [];
  const add = (arr, g, f) => { f(g); arr.push(g.index ? g.toNonIndexed() : g); };
  const OCT = Math.PI / 8;
  /* the body along x, a flat face up */
  add(A, new THREE.CylinderGeometry(0.135, 0.135, 0.36, 8), (g) => { g.rotateY(OCT); g.rotateZ(Math.PI / 2); });
  /* striking end (-x): a chamfer, the face, four studs */
  add(A, new THREE.CylinderGeometry(0.118, 0.142, 0.06, 8), (g) => { g.rotateY(OCT); g.rotateZ(Math.PI / 2); g.translate(-0.21, 0, 0); });
  add(A, new THREE.CylinderGeometry(0.104, 0.118, 0.03, 8), (g) => { g.rotateY(OCT); g.rotateZ(Math.PI / 2); g.translate(-0.255, 0, 0); });
  for (let k = 0; k < 4; k++) add(A, new THREE.ConeGeometry(0.034, 0.06, 4), (g) => { g.rotateY(Math.PI / 4); g.rotateZ(Math.PI / 2); g.translate(-0.295, ((k % 2) - 0.5) * 0.1, (Math.floor(k / 2) - 0.5) * 0.1); });
  /* beak end (+x): the body tapers into a curved spike that hooks down */
  add(A, new THREE.CylinderGeometry(0.07, 0.135, 0.12, 8), (g) => { g.rotateY(OCT); g.rotateZ(-Math.PI / 2); g.translate(0.24, 0, 0); });
  add(A, new THREE.ConeGeometry(0.068, 0.3, 6), (g) => { g.rotateZ(-Math.PI / 2); g.translate(0.15, 0, 0); g.rotateZ(-0.32); g.translate(0.29, 0.0, 0); });
  /* top spike */
  add(A, new THREE.ConeGeometry(0.045, 0.2, 6), (g) => { g.translate(0, 0.23, 0); });
  /* bands, socket collar, langets (blackened) */
  for (const x of [-0.15, 0.0, 0.15]) add(Bk, new THREE.CylinderGeometry(0.148, 0.148, 0.04, 8), (g) => { g.rotateY(OCT); g.rotateZ(Math.PI / 2); g.translate(x, 0, 0); });
  add(Bk, new THREE.CylinderGeometry(0.052, 0.068, 0.12, 8), (g) => { g.translate(0, -0.18, 0); });
  for (const sz of [-1, 1]) add(Bk, new THREE.BoxGeometry(0.05, 0.36, 0.014), (g) => { g.translate(0, -0.36, sz * 0.04); });
  /* rivets on every band flat and on the langets */
  const riv = (x, y, z) => add(Bk, new THREE.SphereGeometry(0.014, 6, 4), (g) => g.translate(x, y, z));
  for (const x of [-0.15, 0.15]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + OCT; riv(x, Math.cos(a) * 0.142, Math.sin(a) * 0.142); }
  for (const sz of [-1, 1]) for (const y of [-0.24, -0.4, -0.52]) riv(0, y, sz * 0.048);
  const gA = mergeGeometries(A); gA.computeVertexNormals(); const gB = mergeGeometries(Bk); gB.computeVertexNormals();
  /* wear: pitted, darker in the hollows, brighter where the faces strike; noise in head space */
  chain(iron, 'sq-wear', (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqWr;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqWr = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vSqWr;${noiseFor(sh.fragmentShader)}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        { float n1 = sqNoise(vSqWr * 38.0); float n2 = sqNoise(vSqWr * 140.0); float face = smoothstep(0.2, 0.3, abs(vSqWr.x));
          diffuseColor.rgb *= 0.62 + 0.55 * n1 + 0.25 * face - 0.3 * smoothstep(0.72, 0.9, n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.075, 0.045), 0.35 * smoothstep(0.55, 0.85, n1) * (1.0 - face));
          roughnessFactor = clamp(roughnessFactor + 0.25 * (n1 - 0.5) - 0.18 * face + 0.25 * smoothstep(0.72, 0.9, n2), 0.2, 0.95); }`);
  });
  const black = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, metalness: 0.85, roughness: 0.48, envMap: iron.envMap || null, envMapIntensity: 0.9 }); if (frostU) addFrost(black, frostU);
  const mA = new THREE.Mesh(gA, iron); const mB = new THREE.Mesh(gB, black);
  return [mA, mB];
}

/* ---------------------------------------------------------------- the rig */
function skinnedOf(actor) { let s = null; actor.model.traverse((o) => { if (!s && o.isSkinnedMesh) s = o; }); return s; }
function boneOf(actor, name) { return actor.model.getObjectByName(name); }
/* A child of a bone at a point given in the bind pose (three coords: x across, y up, z forward), facing `dir` (bind pose). */
function attachAtBind(actor, boneName, bindPos, bindDir = ZAX) {
  const sk = skinnedOf(actor); const bone = boneOf(actor, boneName); const o = new THREE.Object3D();
  if (!sk || !bone) return o;
  const i = sk.skeleton.bones.indexOf(bone);
  _m.copy(sk.skeleton.boneInverses[i]).multiply(sk.bindMatrix);
  o.position.copy(bindPos).applyMatrix4(_m);
  _a.copy(bindDir).transformDirection(_m); o.quaternion.setFromUnitVectors(ZAX, _a);
  bone.add(o); return o;
}
/* a child of a bone whose local axes are the bind-pose axes (x across, y up, z forward) with its origin at bindPos */
function attachBindFrame(actor, boneName, bindPos) {
  const sk = skinnedOf(actor); const bone = boneOf(actor, boneName); const o = new THREE.Object3D();
  if (!sk || !bone) return o;
  const i = sk.skeleton.bones.indexOf(bone);
  _m.copy(sk.skeleton.boneInverses[i]).multiply(sk.bindMatrix);
  o.position.copy(bindPos).applyMatrix4(_m); const sc = new THREE.Vector3(); _m.decompose(_a, o.quaternion, sc);
  bone.add(o); return o;
}
function headPos(actor, out) { const h = boneOf(actor, 'Head'); return h ? h.getWorldPosition(out) : out.copy(actor.root.position).setY(2); }

/* ================================================================ dressBoss */
/* ctx.dress(actor, id, ctx): a world module's own dress (web/src/worlds/<id>.js dressBoss, called with the world
   nemesis id). It returns a handle with the same contract as below, or null to fall back to the dark dress.
   ctx.size: a world nemesis may set its own scale on the same mechanic (default BOSS_SCALE). */
export function dressBoss(actor, id, ctx = {}) {
  if (typeof ctx.dress === 'function') {
    try { const h = ctx.dress(actor, id, { ...ctx, dress: null }); if (h) return h; } catch (err) { console.warn('world boss dress', err); }
  }
  const scene = ctx.scene || actor.root.parent;
  GROUND = scene?.userData?.groundAt || ZERO_GROUND;
  const accent = new THREE.Color(ctx.accent ?? 0xff4a12);
  const H = { id, float: 0, darkness: 0, lookAt: new THREE.Vector3(), shake: 0, time: 0, disposers: [] };
  H.takeShake = () => { const s = H.shake; H.shake = 0; return s; };
  H.onStep = () => 0; H.onSlam = () => ({ shake: 0, flash: 0, slow: 0 }); H.onSummon = () => 0; H.rise = () => {}; H.onPhase = () => {}; H.onHit = () => ({}); H.onParry = () => ({}); H.onDeath = () => 0;
  const scale = ctx.size || BOSS_SCALE[id] || 1;
  actor.root.scale.setScalar(scale);
  const before = new Set(scene.children);
  /* bare (ctx.bare or the boss def's bare: true): the mechanic runs with no dark parts and no dark effects; the world dress
     owns the body, the bolts' look, the summons' rise and the death (the handle keeps its no-op defaults) */
  /* bare: an inner update the pre-warm wrapper can call, and an aim point for the death camera at the body's chest
     (a world dress that writes H.lookAt after this keeps its own) */
  if (ctx.bare) { H.bare = true; H.update = () => { actor.root.getWorldPosition(H.lookAt); H.lookAt.y += 1.5 * scale; }; }
  else if (id === 'giant') dressGiant(actor, H, ctx, scene, accent, scale);
  else if (id === 'lich') dressLich(actor, H, ctx, scene, accent, scale);
  else if (id === 'twin') dressTwin(actor, H, ctx, scene, accent, scale);
  /* Pre-warm: every death and slam material is made at dress time; compile them all (and the non-skinned variants of
     the parts that are baked off the body at death) before they are first drawn, so the first slam and the death do
     not stall on shader compiles. The scene hands us the renderer on its next render; the caller may also call
     handle.prewarm(renderer, camera) directly. */
  H.warmMats = H.warmMats || []; H.warmShow = H.warmShow || [];
  /* everything the dress added to the scene (particle pools, decals, craters, shard pools) is drawn once for real:
     ANGLE builds its GPU pipelines on the first draw, so a compile alone does not remove the first-use stall */
  for (const o of scene.children) if (!before.has(o) && !H.warmShow.includes(o)) H.warmShow.push(o);
  let warmG = null; let warmFrames = 0; const warmSaved = [];
  H.prewarm = (renderer, camera, target) => {
    if (H.warmed || !renderer || !camera) return; H.warmed = true;
    /* compile against the target the scene is really drawn into (the composer's buffer: linear, no tone mapping),
       or the programs come out as a different variant and compile again on first use */
    const g = new THREE.Group(); const geo = new THREE.BoxGeometry(0.001, 0.001, 0.001);
    /* a material, or a skinned part that is baked off the body at death: bake it now too, so the dummy has the very
       same vertex layout as the piece that will fall (ANGLE keys its pipelines on that) */
    const geos = [geo];
    for (const m of H.warmMats) { let d; if (m.isMesh) { try { d = bakeSkinned(m); geos.push(d.geometry); } catch { continue; } } else d = new THREE.Mesh(geo, m); d.castShadow = true; d.frustumCulled = false; d.scale.setScalar(1e-4); g.add(d); }
    g.position.set(0, -60, 0); scene.add(g); warmG = { g, geo: { dispose: () => geos.forEach((x) => x.dispose()) } };
    const prev = renderer.getRenderTarget();
    try { renderer.setRenderTarget(target === undefined ? warmRT : target); renderer.compile(scene, camera); } catch (err) { console.warn('boss prewarm', err); } finally { renderer.setRenderTarget(prev); }
    /* the shadow pass has its own depth programs: draw the hidden effect meshes (shrunk to nothing) for a few frames */
    for (const o of H.warmShow) { warmSaved.push([o, o.visible, o.scale.clone(), o.frustumCulled]); if (!o.isPoints && !o.isInstancedMesh) o.scale.setScalar(1e-4); o.traverse((c) => { c.userData.sqFC = c.frustumCulled; c.frustumCulled = false; c.userData.sqVis = c.visible; }); }
    warmFrames = 4;
  };
  const sceneBR = scene.onBeforeRender; let warmR = null; let warmCam = null; let warmRT = null;
  /* wait until the fight's lights are all in (the light count is part of every program key, shadow depth too):
     prewarm once the number of lights has held for 30 frames */
  let warmLights = -1; let warmHold = 0;
  const hook = function (r, sc, cam, rt) { sceneBR.call(this, r, sc, cam, rt); if (!H.warmed && cam?.isPerspectiveCamera && cam.fov < 89) {
    let n = 0; sc.traverseVisible((o) => { if (o.isLight) n++; }); if (n !== warmLights) { warmLights = n; warmHold = 0; } else warmHold++;
    if (warmHold >= 30) { warmR = r; warmCam = cam; warmRT = rt ?? null; } } };
  scene.onBeforeRender = hook;
  const upd = H.update || (() => {});
  H.update = (dt, st) => {
    if (!H.warmed && warmR) H.prewarm(warmR, warmCam);
    else if (warmFrames > 0 && --warmFrames === 0) {
      warmG?.g.removeFromParent(); warmG?.geo.dispose(); warmG = null;
      for (const [o, vis, sc] of warmSaved) { o.scale.copy(sc); o.traverse((c) => { if ('sqFC' in c.userData) { c.frustumCulled = c.userData.sqFC; c.visible = c.userData.sqVis; delete c.userData.sqFC; delete c.userData.sqVis; } }); o.visible = vis; }
      warmSaved.length = 0;
    }
    upd(dt, st);
    /* after the pools' own update (it hides empty pools): keep the warm set drawn */
    if (warmFrames > 0) for (const [o] of warmSaved) o.traverse((c) => { c.visible = true; });
  };
  H.dispose = () => { for (const fn of H.disposers) fn(); H.disposers.length = 0; H.darkness = 0; H.shake = 0; if (scene.onBeforeRender === hook) scene.onBeforeRender = sceneBR; };
  return H;
}

/* ---------------------------------------------------------------- the Giant */
function dressGiant(actor, H, ctx, scene, accent, S) {
  actor.look({ ...BOSS_LOOK.giant, eye: accent.getHex(), eyePower: 9 });
  const biome = ctx.biome?.id || ctx.biome || '';
  const ash = /ash|dusk/.test(biome);
  const frostU = { col: { value: new THREE.Color(ctx.frost ?? (ash ? 0x5e5853 : 0x8e98a3)) }, k: { value: 0.7 } };
  const breathCol = new THREE.Color(ash ? 0x6a625c : 0xe8eef5); const breathDim = breathCol.clone().multiplyScalar(0.6);
  /* the plate below the belt and on the hands carries a light rime only: full frost on every lip read as white stripes */
  const lowU = { col: frostU.col, k: { value: 0.3 } };
  const LOW = /^(Giant(Tasset|Leg|Gauntlet)|Shin|Thigh)/; const lowMats = new Map();
  for (const m of actor.meshes) {
    if (m.userData.part === 'Eyes' || /SQ_Void|SQ_Eyes|SQ_Blade/.test(m.material.name || '')) continue;
    if (LOW.test(m.userData.part || '')) {
      let c = lowMats.get(m.material);
      if (!c) { c = m.material.clone(); if (c.envMapIntensity > 1) c.envMapIntensity = 1.0; addFrost(c, lowU); lowMats.set(m.material, c); H.disposers.push(() => c.dispose()); }
      m.material = c;
    } else addFrost(m.material, frostU);
  }
  H.frost = frostU; H.frostLow = lowU;
  /* world.js grime paints pale matte frost (0.5, 0.54, 0.6) on every plate that faces up IN THE BIND POSE. On the giant
     those are the tops of the pauldrons, helm and collar: unseen while it stands, but they face the camera as soon as it
     leans, kneels or falls, and the whole upper body turned flat light grey. The giant
     has its own world-normal frost above, so cap the grime frost low and take it to zero in the death. */
  const grimeUs = new Set(); let grimeCap = 0.05;
  for (const m of actor.meshes) if (m.material && !m.material.userData?.sqGrimeCap) { m.material.userData.sqGrimeCap = true; postChain(m.material, 'sq-grimecap', (sh) => { if (sh.uniforms.sqGrime) grimeUs.add(sh.uniforms.sqGrime); }); }
  const capGrime = () => { for (const u of grimeUs) if (u.value.w > grimeCap) u.value.w = grimeCap; };
  for (const m of actor.meshes) if (underUniforms(m.material) || m.material.userData?.mail) nearMailFade(m.material, S);
  for (const m of actor.meshes) if (/metal_plate/.test(m.material.name || '') && !LOW.test(m.userData.part || '')) m.material.envMapIntensity = 1.4;
  /* the blade plates on the pauldrons are flat: dark blued steel, no frost and a low reflection, or they read as white slabs */
  for (const m of actor.meshes) if (/SQ_Blade/.test(m.material.name || '')) { m.material.color.set(0x3c4046); m.material.roughness = Math.max(0.45, m.material.roughness); m.material.envMapIntensity = 0.8; }
  /* the iron lames over the pauldrons are weighted to other bones than the plate: on the giant's frame they split into
     loose floating hoops when the arm goes up. The plate alone reads cleaner. */
  for (const m of actor.meshes) if (/^GiantPauldron[LR]_2$/.test(m.name)) { m.visible = false; m.userData.sqHidden = true; }
  /* the fight holds the hero this far from the giant's centre (metres), so the camera never sits inside its hips */
  /* 4.86 m (was 4.05): from 4 m the view held armour plates and a belly with no head and no maul.
     It must stay under the giant's own attack start (reach 1.85 x 2.7 + 0.3 = 5.3 m) or it could never swing. */
  H.keepOut = 1.8 * S;
  const LOOK_UP = worldMod() ? 0.35 : 1.15;
  /* a furnace behind the visor slit */
  /* the slit sat 5 cm behind the visor plate (helm front at z 0.21), so the face never lit; now it sits on the
     plate, wider and hotter, with a soft halo, so the face reads from the hero's place */
  const DK = !worldMod();
  const slit = attachAtBind(actor, 'Head', new THREE.Vector3(0, 1.705, DK ? 0.222 : 0.168), ZAX);
  const slitMat = new THREE.MeshBasicMaterial({ map: dotTexture(), color: accent.clone().multiplyScalar(DK ? 2.6 : 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  slit.add(new THREE.Mesh(new THREE.PlaneGeometry(DK ? 0.3 : 0.24, DK ? 0.06 : 0.045), slitMat));
  let haloMat = null;
  if (DK) { haloMat = slitMat.clone(); haloMat.color.copy(accent).multiplyScalar(0.35); const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14), haloMat); halo.position.z = 0.004; slit.add(halo); H.disposers.push(() => haloMat.dispose()); }
  /* ctx.visor = false: no furnace glow behind the visor (a hat, an open face) */
  if (ctx.visor === false) slit.visible = false;
  H.disposers.push(() => slit.removeFromParent());
  /* its phases show at the visor: the furnace burns hotter under 60 %, white-hot and wider under 30 % */
  { const c0 = slitMat.color.clone(); const h0 = haloMat ? haloMat.color.clone() : null; const hot = new THREE.Color(2.4, 1.9, 1.4);
    H.onPhase = (p) => { const k = p >= 2 ? 2.0 : 1.45; slitMat.color.copy(c0).multiplyScalar(k).lerp(hot, p >= 2 ? 0.3 : 0); if (haloMat) haloMat.color.copy(h0).multiplyScalar(k * 1.5); slit.scale.set(p >= 2 ? 1.3 : 1.12, p >= 2 ? 1.6 : 1.25, 1); H.shake = Math.max(H.shake, 0.35); }; }

  /* proportions: a broad hunched frame on short thick legs, small head sunk into the collar, huge hands */
  const B = Object.fromEntries(['spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'foot_l', 'foot_r', 'spine_02'].map((n) => [n, boneOf(actor, n)]));
  const rest = {}; for (const [n, b] of Object.entries(B)) if (b) rest[n] = b.position.clone();
  /* in the dark world the helm stands up out of the collar
     (headDrop 0.15 sank it under the pauldrons, so from the hero's place the hump read as his back) and the head and chest
     turn to the hero (aimBody below). A world giant (the frontier Baron) keeps the old frame. */
  const darkOnly = !worldMod();
  const P = { chest: 1.16, neck: 0.8, headDrop: darkOnly ? 0.5 : 0.15, shoulder: 1.55, arm: 1.12, hand: 1.6, thigh: 1.12 };
  const handChain = P.chest * P.arm * P.hand; H.handChain = handChain;
  let aimBody = null;
  const shape = () => {
    if (B.spine_03) B.spine_03.scale.setScalar(P.chest);
    if (B.spine_02) B.spine_02.scale.setScalar(1.06);
    if (B.neck_01) B.neck_01.scale.setScalar(P.neck);
    if (B.Head && rest.Head) B.Head.position.copy(rest.Head).multiplyScalar(P.headDrop + (H.sqDeathT >= 0 ? 0.75 * sstep(0, 0.45, H.sqDeathT) : 0));
    for (const s of ['l', 'r']) {
      const ua = B['upperarm_' + s]; if (ua && rest['upperarm_' + s]) { ua.position.copy(rest['upperarm_' + s]).multiplyScalar(P.shoulder); ua.scale.setScalar(P.arm); }
      const h = B['hand_' + s]; if (h) h.scale.setScalar(P.hand);
      const t = B['thigh_' + s]; if (t) t.scale.set(P.thigh, 0.94, P.thigh);
    }
    if (aimBody) aimBody();
  };
  const mixUpdate = actor.mixer.update.bind(actor.mixer);
  actor.mixer.update = (dt) => { const r = mixUpdate(dt); shape(); return r; };
  shape();
  /* walking: strides scale with the body, so the clip runs slower */
  const play = actor.play.bind(actor);
  actor.play = (name, opt = {}) => play(name, WALKS.has(name) ? { ...opt, speed: (opt.speed ?? 1) / S } : opt);

  /* the maul: a tree of a haft with an iron block for a head, dragged behind when it walks */
  const steelSrc = actor.meshes.find((m) => /metal_plate/.test(m.material.name || ''))?.material;
  const iron = steelSrc ? steelSrc.clone() : new THREE.MeshStandardMaterial({ color: 0x5c5853, metalness: 0.9, roughness: 0.5 });
  iron.color.set(0x4a4744); iron.roughness = 0.55; iron.envMapIntensity = 0.9; iron.onBeforeCompile = () => {}; iron.customProgramCacheKey = () => 'giant-iron';
  /* the maul keeps its dark steel and wood: no frost, so it never turns into a pale plank on the ground */
  const wood = new THREE.MeshStandardMaterial({ color: 0x24190f, roughness: 0.85, metalness: 0 });
  const maul = new THREE.Group(); const L = 0.98; /* haft length in model units (1 = one metre of a normal knight) */
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, L + 0.3, 10), wood); haft.position.y = L / 2 - 0.12; maul.add(haft);
  for (const y of [-0.2, 0.16, 0.5, 0.82]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 10), iron); band.position.y = y; maul.add(band); }
  const headG = new THREE.Group(); headG.position.y = L; maul.add(headG);
  headG.add(...maulHead(iron, null));
  maul.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  const holder = new THREE.Group(); holder.add(maul); holder.scale.setScalar(1 / handChain);
  let mounted = null; let atkW = 0; let atkClock = 0; let lift = 0; const headAt = new THREE.Vector3();
  const mount = () => {
    const slot = actor.slot('handslotr'); if (!slot) return;
    for (const g of slot.children) if (g !== holder) { g.traverse((o) => { if (o.isMesh && !o.userData.giantMaul) o.visible = false; }); }
    const host = slot.children.find((g) => g !== holder) || slot;
    if (holder.parent !== host) { host.add(holder); }
    mounted = slot;
  };
  maul.traverse((o) => { o.userData.giantMaul = true; });
  H.maulHead = new THREE.Vector3();
  mount();

  /* in the dark world each forearm wears a heavy vambrace, rigid on
     the forearm bone: a plate tube that swells toward the wrist, one raised lame, a flared cuff that meets the 1.6x
     gauntlet, a dark lip at the elbow and two studs on top. Bind units (the knight's T-pose: elbow at x 0.466, wrist at x
     0.739, the arm line at y 1.441, z -0.07). Flat shaded so every face takes its own light. */
  if (darkOnly && steelSrc) {
    const vm = steelSrc.clone(); vm.onBeforeCompile = () => {}; vm.customProgramCacheKey = () => 'giant-vamb';
    vm.color.set(0x8c8882); vm.roughness = 0.5; vm.envMapIntensity = 1.25; addFrost(vm, lowU); H.disposers.push(() => vm.dispose());
    const blk = new THREE.MeshStandardMaterial({ color: 0x1f1d1b, metalness: 0.85, roughness: 0.5 }); H.disposers.push(() => blk.dispose());
    const parts = []; const darks = []; const Lv = 0.24; const R0 = 0.097; const R1 = 0.114; const rAt = (t) => R0 + (R1 - R0) * (t + 0.5);
    const ring = (arr, r0, r1, len, z, n = 12) => { const g = new THREE.CylinderGeometry(r1, r0, len, n, 1); g.rotateX(Math.PI / 2); g.translate(0, 0, z); arr.push(g); };
    ring(parts, R0, R1, Lv, 0); /* the shell: elbow end (-z) to wrist end (+z) */
    ring(darks, rAt(-0.05) + 0.008, rAt(0.05) + 0.008, 0.022, 0); /* one raised lame across the middle */
    ring(parts, R1 + 0.004, 0.14, 0.045, Lv / 2 + 0.018); /* the flared cuff over the gauntlet */
    ring(darks, R0 + 0.01, R0 + 0.004, 0.024, -Lv / 2 - 0.008); /* a dark lip at the elbow */
    for (const t of [-0.3, 0.3]) { const g = new THREE.ConeGeometry(0.016, 0.05, 4); g.translate(0, 0.025, 0); g.translate(0, rAt(t) + 0.002, t * Lv); darks.push(g); }
    const gS = mergeGeometries(parts); gS.computeVertexNormals(); const gD = mergeGeometries(darks); gD.computeVertexNormals();
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      const o = attachAtBind(actor, 'lowerarm_' + s, new THREE.Vector3(sx * 0.612, 1.441, -0.07), new THREE.Vector3(sx, 0, 0));
      const a = new THREE.Mesh(gS, vm); const b = new THREE.Mesh(gD, blk); a.castShadow = b.castShadow = true; o.add(a, b);
      H.disposers.push(() => o.removeFromParent());
    }
    H.disposers.push(() => { gS.dispose(); gD.dispose(); });
  }

  /* fx pools */
  const soft = new Particles(scene, 420, { map: puffTex(), near: [1.4, 4.2] }); const glow = new Particles(scene, 200, { additive: true });
  const mist = new Particles(scene, 160, { map: wispTex(), near: [1.0, 3.6] }); H.disposers.push(() => mist.dispose());
  /* ctx.debris = { color, lift } (frontier dirt clods, storybook turf); ctx.cracks = false (no ground cracks or craters) or { color, glow, opacity } (glow false = none) */
  /* a world giant that sets neither gets dirt: brown clods that stay low and brown cracks with no glow (the black roots are the dark world's) */
  const inWorld = !!worldMod();
  const DB = ctx.debris || (inWorld ? { color: 0x6a5038, lift: 0.45 } : {});
  /* the dark lands throw their own ground: wet mud clods in the fen and the barrows, ice in the frost pass, black rock
     in the ash, dry earth on the steppe and in the woods. Chunky rounded lumps (rockChunk), not thin crumpled shells that
     read as paper bags, and no frost on mud or ice. */
  const KIND = inWorld || DB.color != null ? null : debrisKind(biome);
  const KM = KIND ? DEBRIS[KIND] : null;
  const rockMat = new THREE.MeshStandardMaterial({ color: KM?.color ?? DB.color ?? ctx.ground ?? 0x3a3531, roughness: KM?.rough ?? 0.95, metalness: 0, envMapIntensity: KM?.env ?? 1 });
  if (!KM || KM.frost) addFrost(rockMat, frostU);
  if (KM?.ice) { rockMat.emissive.set(0x0b1822); /* a faint cold light inside the block */
    chain(rockMat, 'sq-icechip', (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqIc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqIc = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vSqIc;${noiseFor(sh.fragmentShader)}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          { float n1 = sqNoise(vSqIc * 9.0); float n2 = sqNoise(vSqIc * 31.0);
            diffuseColor.rgb *= 0.7 + 0.5 * n1 - 0.35 * smoothstep(0.7, 0.9, n2);
            roughnessFactor = clamp(roughnessFactor + 0.2 * (n2 - 0.5), 0.45, 0.95); }`);
    }); }
  H.disposers.push(() => rockMat.dispose());
  const LIFT = DB.lift ?? KM?.lift ?? 1;
  const CK = ctx.cracks === false ? null : (ctx.cracks || (inWorld ? { color: 0x5e4430, glow: false, opacity: 0.5 } : {}));
  const shards = new Shards(scene, 90, KM?.ice ? iceChunk(9) : stoneChunk(9) /* was rockChunk (potatoes) */, rockMat, 0.5);
  if (KM?.size) { const emit0 = shards.emit.bind(shards); shards.emit = (px, py, pz, vx, vy, vz, sc, life, spin) => emit0(px, py, pz, vx, vy, vz, sc * KM.size, life, spin); }
  /* iron chips knocked off the plate (a "break") */
  const chipMat = new THREE.MeshStandardMaterial({ color: 0x3a3836, metalness: 0.85, roughness: 0.45 }); H.disposers.push(() => chipMat.dispose());
  const chips = new Shards(scene, 24, rockGeometry(4), chipMat, 0.3);
  const crack = []; for (let i = 0; i < 3; i++) { const d = groundDecal(crackTex(), { size: 1, color: CK?.color ?? 0x000000, opacity: 0.95, order: 3 }); const gl = groundDecal(crackGlowTex(), { size: 1, color: CK?.glow === false ? new THREE.Color(0) : new THREE.Color(CK?.glow ?? accent).multiplyScalar(2.2), additive: true, order: 4 }); d.userData.y0 = d.position.y; gl.userData.y0 = gl.position.y; gl.userData.col0 = gl.material.color.clone(); scene.add(d, gl); crack.push({ d, gl, t: -1, r: 0 }); }
  let crackNext = 0;
  const craters = []; let craterNext = 0;
  const craterGeo = (() => { /* a raised broken rim around a dark bowl */
    const g = new THREE.RingGeometry(0.62, 1.12, 40, 3); g.rotateX(-Math.PI / 2); const p = g.attributes.position; const r = seeded(8);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); const z = p.getZ(i); const d = Math.hypot(x, z); const a = Math.atan2(z, x); const k = 1 - Math.abs(d - 0.8) / 0.32; p.setY(i, Math.max(0, k) * (0.2 + 0.1 * Math.sin(a * 7) + r() * 0.08)); p.setX(i, x * (1 + (r() - 0.5) * 0.1)); p.setZ(i, z * (1 + (r() - 0.5) * 0.1)); }
    g.computeVertexNormals(); return g; })();
  const rubbleGeo = KM?.ice ? iceChunk(12) : stoneChunk(12);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); g.visible = false;
    const rim = new THREE.Mesh(craterGeo, rockMat); rim.receiveShadow = true; rim.castShadow = true; g.add(rim);
    const bowl = groundDecal(craterTex(), { size: 2.5, color: 0xffffff, order: 2 }); bowl.visible = true; bowl.position.y = 0.03; g.add(bowl);
    const rr = seeded(40 + i); for (let k = 0; k < 9; k++) { const rb = new THREE.Mesh(rubbleGeo, rockMat); const a = rr() * Math.PI * 2; const d = 0.95 + rr() * 0.6; rb.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d); rb.scale.setScalar(0.12 + rr() * 0.22); rb.rotation.set(rr() * 3, rr() * 3, rr() * 3); rb.castShadow = true; g.add(rb); }
    scene.add(g); craters.push(g); (H.warmShow = H.warmShow || []).push(g);
  }
  const shadow = groundDecal(dotTexture(), { size: 1, color: 0x000000, opacity: 0, order: 1 }); shadow.material.blending = THREE.NormalBlending; scene.add(shadow);
  /* the fight owns one slam light from its first frame (scene.userData.sqSlamLight). A brute that brought its own light in wave 2 changed the light count, and every lit program of the scene linked again in the middle of the fight (0.3 to 0.9 s). */
  const sharedSlam = scene.userData.sqSlamLight || null; const slamLight = sharedSlam || new THREE.PointLight(0xffffff, 0, 30, 2); if (!sharedSlam) scene.add(slamLight);
  /* the blow leaves a pale smear behind the maul head for 0.4 s (no static rings) */
  const trail = new Ribbon(scene, { life: 0.4, color: ash ? 0xb9b0a6 : 0xe4eef6, opacity: 0.36 });
  const prevHead = new THREE.Vector3(); let headInit = false;
  H.disposers.push(() => { trail.dispose(); soft.dispose(); glow.dispose(); shards.dispose(); chips.dispose(); for (const c of crack) { c.d.removeFromParent(); c.gl.removeFromParent(); } for (const c of craters) c.removeFromParent(); shadow.removeFromParent(); if (!sharedSlam) slamLight.removeFromParent(); else slamLight.intensity = 0; holder.removeFromParent(); });

  /* footfall and slam dust takes the land's tone: pale snow dust only on ice; in the fen a white disc of "dust" lay round
     the hero's feet for seconds */
  const dustCol = new THREE.Color(KIND === 'mud' ? 0x46504a : KIND === 'earth' ? 0x5a5044 : KIND === 'rock' || ash ? 0x5a514a : 0x5c6878); /* snow dust in the shade of the ice, not white: the slam ring rolled out under the hero as a pale disc */ const emberCol = accent.clone().multiplyScalar(1.5); const white = new THREE.Color(1.4, 1.45, 1.5);
  /* the giant's plates never come off in the fight. A broken plate left the bare rig limbs, which read as box limbs
     on a broken action figure, and the loose plates lay on the ground as boxes. A "break" is a burst of
     sparks and iron chips at the plate instead; the fight still counts it. */
  actor.breakPart = (name) => {
    const b = /^Helm|Hood|Giant ?Helm/.test(name) ? B.Head : /L$/.test(name) ? (/Thigh|Shin/.test(name) ? B.thigh_l : B.upperarm_l) : /R$/.test(name) ? (/Thigh|Shin/.test(name) ? B.thigh_r : B.upperarm_r) : B.spine_03;
    if (!b) return [];
    actor.root.updateMatrixWorld(true); b.getWorldPosition(_c);
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28; const sp = 3 + Math.random() * 6; glow.emit(_c.x, _c.y, _c.z, Math.cos(a) * sp, 1 + Math.random() * 4, Math.sin(a) * sp, Math.random() < 0.5 ? white : emberCol, 0.35 + Math.random() * 0.4, 0.07, 0.02, 1, 11, 0.5); }
    for (let i = 0; i < 6; i++) chips.emit(_c.x, _c.y, _c.z, (Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5, 0.05 + Math.random() * 0.06, 3 + Math.random() * 2);
    return [];
  };
  const feet = [{ b: B.foot_l, prev: 9, dir: 0, down: true }, { b: B.foot_r, prev: 9, dir: 0, down: true }];
  let player = null; let breathT = 0.6; let dragT = 0;
  const shakeAt = (p, amount) => { if (!player) return amount; const d = Math.hypot(p.x - player.x, p.z - player.z); return amount * clamp(1.2 - d / 28, 0, 1); };

  /* the chest and the helm turn to the hero (dark world only). The root already faces the hero (fight.js face()),
     but the attack clips twist the torso away and the hunch tips the helm to the ground, so from the hero's place the
     view held a hump, a belt plate and no face. After each pose: a world-yaw turn on spine_02
     takes back most of the twist (less inside the blow itself, which throws the maul across the body), then the head
     bone aims the visor at the hero's eye (at most 0.9 rad). None in the death. */
  let aimW = 0; let blowK = 9; const aimRef = darkOnly ? attachAtBind(actor, 'Head', new THREE.Vector3(0, 1.705, 1.168), ZAX) : null;
  if (aimRef) H.disposers.push(() => aimRef.removeFromParent());
  if (darkOnly && B.spine_02 && B.Head && B.clavicle_l && B.clavicle_r) aimBody = () => {
    if (!player || death) { aimW = 0; return; }
    const want = blowK > 0.72 && blowK < 1.3 ? 0.35 : 1; aimW += (want - aimW) * 0.15;
    actor.root.updateMatrixWorld(true);
    B.clavicle_l.getWorldPosition(_a); B.clavicle_r.getWorldPosition(_b);
    const rx = _b.x - _a.x; const rz = _b.z - _a.z; const cx = (_a.x + _b.x) / 2; const cz = (_a.z + _b.z) / 2;
    let err = Math.atan2(player.x - cx, player.z - cz) - Math.atan2(rz, -rx);
    while (err > Math.PI) err -= Math.PI * 2; while (err < -Math.PI) err += Math.PI * 2;
    const turn = clamp(err, -1.0, 1.0) * 0.9 * aimW;
    const sp = B.spine_02;
    if (Math.abs(turn) > 1e-3) { _q.setFromAxisAngle(UP, turn); sp.parent.getWorldQuaternion(_q2); _AQ.copy(_q2).invert().multiply(_q).multiply(_q2); sp.quaternion.premultiply(_AQ); sp.updateMatrixWorld(true); }
    /* the helm: from its own forward (visor slit to a point a metre ahead in the bind pose) to the hero's eye */
    slit.getWorldPosition(_c); aimRef.getWorldPosition(_d); _d.sub(_c).normalize();
    B.Head.getWorldPosition(_a); _b.set(player.x, (player.y || 0) + 1.6, player.z).sub(_a).normalize();
    _AQ.setFromUnitVectors(_d, _b); const ang = 2 * Math.acos(clamp(_AQ.w, -1, 1));
    const lim = Math.min(1, 0.9 / Math.max(1e-4, ang)) * 0.85 * aimW; _AQ.slerp(_AQI, 1 - lim);
    B.Head.parent.getWorldQuaternion(_q2); _q.copy(_q2).invert().multiply(_AQ).multiply(_q2); B.Head.quaternion.premultiply(_q); B.Head.updateMatrixWorld(true);
  };

  H.onStep = (pos) => {
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2 + Math.random() * 0.2; const sp = 2.6 + Math.random() * 2.2;
      soft.emit(pos.x + Math.cos(a) * 0.6, 0.2, pos.z + Math.sin(a) * 0.6, Math.cos(a) * sp, 0.4 + Math.random() * 1.0, Math.sin(a) * sp, dustCol, 1.2 + Math.random() * 0.8, 0.4 + Math.random() * 0.4, 1.6 + Math.random() * 1.2, 0.15 + Math.random() * 0.08, -0.25, 2.4); }
    for (let i = 0; i < 5; i++) shards.emit(pos.x + (Math.random() - 0.5), 0.2, pos.z + (Math.random() - 0.5), (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.08 + Math.random() * 0.1, 2.5);
    const s = shakeAt(pos, 0.42); H.shake = Math.max(H.shake, s); return s;
  };
  H.onSlam = (pos) => {
    const gy = GROUND(pos.x, pos.z);
    if (CK) { const c = crack[crackNext]; crackNext = (crackNext + 1) % crack.length;
    c.t = 0; c.k = 1; c.op = undefined; if (CK.glow !== false) c.gl.material.color.copy(c.gl.userData.col0 || (c.gl.userData.col0 = c.gl.material.color.clone())); c.d.position.set(pos.x, gy + c.d.userData.y0, pos.z); c.gl.position.set(pos.x, gy + c.gl.userData.y0, pos.z); c.d.rotation.y = c.gl.rotation.y = Math.random() * 6.28; c.d.visible = c.gl.visible = true; }
    const cr = craters[craterNext]; craterNext = (craterNext + 1) % craters.length; cr.position.set(pos.x, gy, pos.z); cr.rotation.y = Math.random() * 6.28; cr.scale.setScalar(1.5); cr.visible = !!CK; cr.userData.t = 0;
    /* shards: a fountain, and a handful aimed at the hero's eyes */
    for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2; const sp = 4 + Math.random() * 9; shards.emit(pos.x + Math.cos(a) * 0.8, 0.4 + GROUND(pos.x, pos.z), pos.z + Math.sin(a) * 0.8, Math.cos(a) * sp, (6 + Math.random() * 9) * LIFT, Math.sin(a) * sp, 0.12 + Math.random() * 0.34, 4 + Math.random() * 3); }
    if (player) for (let i = 0; i < 9; i++) { _a.set(player.x - pos.x, 0, player.z - pos.z); const d = Math.max(1, _a.length()); _a.normalize(); const t = d / 16; const sp = 16;
      shards.emit(pos.x + _a.x, 0.6, pos.z + _a.z, _a.x * sp + (Math.random() - 0.5) * 2.5, (2.0 - 0.6) / t + 6.5 * t + (Math.random() - 0.3) * 1.5, _a.z * sp + (Math.random() - 0.5) * 2.5, 0.1 + Math.random() * 0.16, 2.2, 14); }
    for (let i = 0; i < 90; i++) { const a = (i / 90) * Math.PI * 2; const sp = 9 + Math.random() * 3;
      soft.emit(pos.x + Math.cos(a) * 1.2, 0.3, pos.z + Math.sin(a) * 1.2, Math.cos(a) * sp, 0.5 + Math.random() * 1.5, Math.sin(a) * sp, dustCol, 1.3 + Math.random() * 0.4, 0.8, 3.0, 0.2, -0.1, 1.3); }
    for (let i = 0; i < 40; i++) soft.emit(pos.x + (Math.random() - 0.5) * 2, 0.5, pos.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 3 + Math.random() * 5, (Math.random() - 0.5) * 3, dustCol, 2.5, 1.2, 3.8, 0.15, 0.6, 0.8);
    for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28; const sp = 3 + Math.random() * 10; glow.emit(pos.x, 0.4, pos.z, Math.cos(a) * sp, 3 + Math.random() * 8, Math.sin(a) * sp, Math.random() < 0.4 ? white : emberCol, 0.6 + Math.random() * 0.8, 0.08, 0.03, 1, 12, 0.5); }
    slamLight.position.set(pos.x, 1.5, pos.z); slamLight.intensity = 260; slamLight.color.set(0xffffff).lerp(accent, 0.25);
    const s = shakeAt(pos, 1.25); H.shake = Math.max(H.shake, s);
    return { shake: s, flash: 0.75, slow: 0.12 };
  };

  H.update = (dt, st = {}) => {
    H.time += dt; if (st.player) player = st.player; capGrime();
    if (st.dead || death) { /* gear is thrown as debris on death: leave it alone */ }
    else if (!mounted || holder.parent == null || holder.parent.parent == null) mount();
    else if (mounted.children.some((g) => g !== holder && !g.children.includes(holder) && g.visible && g.children.some((o) => o.isMesh || o.children.length))) mount();
    actor.root.updateMatrixWorld(true);
    /* the aim point is the top of the horned helm (head bone + 0.35 S), not the neck: the fight keeps the aim point a quarter
       down from the top of the view, and with the head bone there the helm and horns went up under the boss bar */
    /* the aim point stands LOOK_UP x S over the head bone, above the horns. The fight's tall-boss camera backs
       off until the aim point fits under its pitch cap, so a higher point holds the camera about 7.3 m out (the hero still
       stands at keepOut): the feet, the helm and the raised maul all fit in one frame */
    if (!death) { headPos(actor, headAt); H.lookAt.copy(headAt); H.lookAt.y += LOOK_UP * S; }
    /* the maul: dragged with the head on the ground, raised into the hand for a blow */
    /* attack progress: st.atkK = clip time / time of the blow (0 wind-up start, 1 the blow); without it a 1.0 s guess */
    if (st.attacking) atkClock += dt; else atkClock = 0;
    const k = st.attacking ? (st.atkK ?? atkClock / 1.0) : 9;
    blowK = k;
    atkW += ((st.attacking ? 1 : 0) - atkW) * Math.min(1, dt * (st.attacking ? 9 : 2.5));
    if (!st.dead && holder.parent && (holder.parent === mounted || holder.parent.parent === mounted)) {
      const hand = _b; holder.parent.getWorldPosition(hand);
      const yaw = st.yaw ?? actor.root.rotation.y; const fx = Math.sin(yaw); const fz = Math.cos(yaw);
      const Lw = L * 1.27 * S; const headR = 0.13 * 1.27 * S;
      const dy = clamp((headR - hand.y) / Lw, -0.98, 0.2); const hor = Math.sqrt(1 - dy * dy);
      _c.set(-fx * 0.8 - fz * 0.6, 0, -fz * 0.8 + fx * 0.6).normalize().multiplyScalar(hor); _c.y = dy; /* dragged: back and to the right */
      /* the fight names the blow (st.atkKind). A sweep cocks the maul out wide to its side at hip height
         and swings it flat across the front; a charge holds it up and forward like a ram; a stomp leaves it dragging (the
         legs do the work); a slam (and any other blow) is the overhead below. */
      const kind = st.attacking ? st.atkKind : null; const Rx = -fz; const Rz = fx;
      if (k < 2.6 && kind === 'sweep') {
        _d.set(Rx * 0.85 - fx * 0.4, 0.32, Rz * 0.85 - fz * 0.4).normalize(); /* out wide and back */
        _e.set(fx, 0.12, fz).normalize(); /* straight ahead, flat */
        _a.set(-Rx * 0.85 + fx * 0.45, 0.05, -Rz * 0.85 + fz * 0.45).normalize(); /* through to the other side */
        if (k < 0.72) _c.lerp(_d, sstep(0, 0.72, k)).normalize();
        else if (k < 0.86) _c.copy(_d).lerp(_e, sstep(0.72, 0.86, k)).normalize();
        else if (k < 1.0) _c.copy(_e).lerp(_a, sstep(0.86, 1.0, k)).normalize();
        else if (k < 1.9) _c.copy(_a);
        else _c.lerp(_a, 1 - sstep(1.9, 2.6, k)).normalize();
      } else if (k < 2.6 && kind === 'charge') {
        _d.set(fx * 0.75 - Rx * 0.35, 0.5, fz * 0.75 - Rz * 0.35).normalize();
        if (k < 1.9) _c.lerp(_d, sstep(0, 0.5, k)).normalize(); else _c.lerp(_d, 1 - sstep(1.9, 2.6, k)).normalize();
      } else if (kind === 'stomp') { /* dragged: the maul stays down */ }
      else if (k < 2.6) {
        /* the wind-up is cocked back over its right shoulder (up, back and out to the side), not straight up: from the
           hero's place the head stands in the sky beside the helm, inside the view, and the blow comes down across it */
        /* cocked high over its right shoulder and only a little back, so the head stands in the sky beside the
           raised helm, facing the hero, through the whole wind-up (was half behind the body: one dark mass) */
        if (darkOnly) _d.set(-fx * 0.14 + fz * 0.5, 0.86, -fz * 0.14 - fx * 0.5).normalize();
        else _d.set(-fx * 0.5 + fz * 0.45, 0.74, -fz * 0.5 - fx * 0.45).normalize();
        _a.set(fx * 0.97 - fz * 0.12, 0, fz * 0.97 + fx * 0.12).normalize().multiplyScalar(hor); _a.y = dy; /* on the ground in front */
        if (k < 0.72) _c.lerp(_d, sstep(0, 0.72, k)).normalize();
        else if (k < 1) _c.copy(_d).lerp(_a, Math.pow((k - 0.72) / 0.28, 2)).normalize();
        else if (k < 1.9) _c.copy(_a);
        else _c.lerp(_a, 1 - sstep(1.9, 2.6, k)).normalize();
      }
      _q.setFromUnitVectors(UP, _c); holder.parent.getWorldQuaternion(_q2); _q.premultiply(_q2.invert());
      holder.quaternion.copy(_q);
      holder.updateMatrixWorld(true); headG.getWorldPosition(H.maulHead);
      /* the aim point (the view lifts to it) moves from the helm toward the raised maul head through the wind-up, so the
         helm and the maul are both in the frame when the blow is read; it comes back down as the blow lands */
      { const up = st.attacking && k < 1.2 ? sstep(0.05, 0.6, k) * (1 - sstep(0.95, 1.2, k)) : 0; lift += (up - lift) * Math.min(1, dt * 5);
        if (lift > 0.001) { const y0 = H.lookAt.y; H.lookAt.lerp(H.maulHead, 0.45 * lift).setY(Math.max(darkOnly ? y0 : headAt.y, H.lookAt.y)); } }
      { const sp = headInit ? prevHead.distanceTo(H.maulHead) / Math.max(1e-4, dt) : 0; prevHead.copy(H.maulHead); headInit = true;
        _d.copy(hand).addScaledVector(_c, Lw * 0.62); _a.copy(H.maulHead).addScaledVector(_c, 0.2 * S);
        trail.push(_d, _a, st.attacking && atkW > 0.3 && sp > 2.5 * S); }
      dragT -= dt;
      if (st.moving && atkW < 0.2 && dragT <= 0) { dragT = 0.07; _d.copy(hand).addScaledVector(_c, Lw); soft.emit(_d.x, 0.2, _d.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), dustCol, 1.0, 0.4, 1.4, 0.4, -0.1, 1); if (Math.random() < 0.3) glow.emit(_d.x, 0.15, _d.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, emberCol, 0.4, 0.05, 0.02, 1, 10); }
    }
    /* footfalls: a foot that comes down and stops */
    for (const f of feet) {
      if (!f.b) continue; f.b.getWorldPosition(_a); const y = _a.y;
      const v = (y - f.prev) / Math.max(1e-4, dt); f.prev = y;
      if (f.down && v > 0.4 * S) f.down = false;
      if (!f.down && y < 0.2 * S && v > -0.2 * S && st.moving) { f.down = true; H.onStep(_a); }
    }
    /* breath from the helm every 2 s */
    breathT -= dt;
    if (breathT <= 0) {
      breathT = 2;
      const yaw = st.yaw ?? actor.root.rotation.y; const fx = Math.sin(yaw); const fz = Math.cos(yaw);
      for (let i = 0; i < 16; i++) { const sp = 0.8 + Math.random() * 1.6;
        mist.emit(headAt.x + fx * 0.22 * S + (Math.random() - 0.5) * 0.2, headAt.y + 0.03 * S, headAt.z + fz * 0.22 * S + (Math.random() - 0.5) * 0.2, fx * sp + (Math.random() - 0.5) * 0.6, -0.3 + Math.random() * 0.5, fz * sp + (Math.random() - 0.5) * 0.6, breathDim, 1.4 + Math.random() * 0.9, 0.15, 0.9, 0.12, -0.2, 0.9, false); }
    }
    /* the shadow that falls over the hero when the maul goes up */
    if (player) {
      const want = (st.attacking ? 0.62 : 0.32) * clamp(1.4 - Math.hypot(player.x - actor.root.position.x, player.z - actor.root.position.z) / 14, 0, 1);
      shadow.material.opacity += (want - shadow.material.opacity) * Math.min(1, dt * 4);
      const yaw = st.yaw ?? actor.root.rotation.y;
      shadow.position.set(actor.root.position.x + Math.sin(yaw) * 1.2 * S, shadow.position.y, actor.root.position.z + Math.cos(yaw) * 1.2 * S); shadow.rotation.y = yaw; shadow.scale.set(1.9 * S, 1, 2.6 * S); shadow.visible = shadow.material.opacity > 0.01;
    }
    for (const c of crack) {
      if (c.t < 0) continue; c.t += dt;
      const g = sstep(0, 0.22, c.t); const sz = 0.5 + 11.5 * g; c.d.scale.set(sz, 1, sz); c.gl.scale.set(sz, 1, sz);
      c.gl.material.opacity = (c.k ?? 1) * Math.max(0, 1 - c.t / 1.6) ** 1.5; c.d.material.opacity = (c.op ?? CK?.opacity ?? 0.95) * clamp(1 - (c.t - 18) / 4, 0, 1);
      if (c.t > 22) { c.t = -1; c.d.visible = c.gl.visible = false; }
    }
    slamLight.intensity *= Math.exp(-dt * 9);
    if (death) updateDeath(dt);
    trail.update(dt); soft.update(dt); mist.update(dt); glow.update(dt); shards.update(dt); chips.update(dt);
  };

  /* ---- death: it drops to its knees, the maul falls from the hand, then the whole body topples forward onto its face
     sideways, across the hero's view (about 2.8 s), the furnace behind the visor goes out on the impact, frost creeps over the plate. All mist is thin,
     layered wisps (low alpha each, darker than snow) that fade near the lens; sparkle is capped so bloom never blows out. */
  let death = null; const maulQ0 = new THREE.Quaternion(); const maulQ1 = new THREE.Quaternion(); const maulP0 = new THREE.Vector3(); const maulP1 = new THREE.Vector3();
  const frostCol = new THREE.Color(ash ? 0x6e655e : 0x8d98a4); const frostLow = new THREE.Color(ash ? 0x3a342f : 0x46505a); const frostHot = new THREE.Color(ash ? 1.3 : 0.9, ash ? 0.7 : 1.15, ash ? 0.4 : 1.4);
  const mQ0 = new THREE.Quaternion(); const mP0 = new THREE.Vector3(); const PIV = new THREE.Vector3(0, 0.06, 0.12); const _rq = new THREE.Quaternion(); const _rz = new THREE.Quaternion();
  const burst = (p, power, crackIt = true) => {
    if (crackIt && CK) { const c = crack[crackNext]; crackNext = (crackNext + 1) % crack.length; const gy = GROUND(p.x, p.z);
      /* death cracks read as fractured ice, not as black roots: a lighter dark line under a cold blue glow */
      c.t = 0; c.k = CK.glow === false || wetLand ? 0.05 : 0.55; c.op = 0.5; if (CK.glow !== false) c.gl.material.color.set(ash ? 0x6a4a30 : 0x4f7fa8); c.d.position.set(p.x, gy + c.d.userData.y0, p.z); c.gl.position.set(p.x, gy + c.gl.userData.y0, p.z); c.d.rotation.y = c.gl.rotation.y = Math.random() * 6.28; c.d.visible = c.gl.visible = true; }
    /* a low ring of thin mist that rolls out and settles, and a darker layer of dust under it */
    /* (kept low and thin: it rolls along the ground, it never stands up as a veil in front of the body) */
    for (let i = 0; i < 22 * power; i++) { const a = Math.random() * Math.PI * 2; const sp = 2.2 + Math.random() * 3.2;
      mist.emit(p.x + Math.cos(a) * 1.4, 0.12 + Math.random() * 0.2, p.z + Math.sin(a) * 1.4, Math.cos(a) * sp, 0.05 + Math.random() * 0.15, Math.sin(a) * sp, frostCol, 2.2 + Math.random() * 1.2, 0.8, 2.2 + Math.random(), 0.075 + Math.random() * 0.035, -0.05, 1.6); }
    for (let i = 0; i < 14 * power; i++) { const a = Math.random() * Math.PI * 2; const sp = 1.2 + Math.random() * 2.4;
      mist.emit(p.x + Math.cos(a) * 1.0, 0.08, p.z + Math.sin(a) * 1.0, Math.cos(a) * sp, 0.02, Math.sin(a) * sp, frostLow, 2.6 + Math.random() * 1.2, 0.7, 2.0, 0.12, 0, 1.8); }
    for (let i = 0; i < 36 * power; i++) { const a = Math.random() * 6.28; const sp = 0.6 + Math.random() * 2.5; /* frost glitter that climbs a little */
      glow.emit(p.x + Math.cos(a) * Math.random() * 2.4, 0.2 + Math.random() * 1.2, p.z + Math.sin(a) * Math.random() * 2.4, Math.cos(a) * sp * 0.4, 0.6 + Math.random() * 2, Math.sin(a) * sp * 0.4, frostHot, 1.0 + Math.random() * 1.2, 0.05, 0.015, 0.8, -0.3, 0.8, false); }
    for (let i = 0; i < 10 * power; i++) { const a = Math.random() * Math.PI * 2; const sp = 1.5 + Math.random() * 3; shards.emit(p.x + Math.cos(a) * 1.2, 0.25, p.z + Math.sin(a) * 1.2, Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp, 0.07 + Math.random() * 0.12, 4 + Math.random() * 3); }
    slamLight.position.set(p.x, 1.6, p.z); slamLight.intensity = 90 * power; slamLight.color.copy(frostCol);
    H.shake = Math.max(H.shake, shakeAt(p, 1.0 * power));
  };
  /* the body hits the ice: a burst of snow that stands up and rolls out, ice chunks thrown high, a cold flash */
  /* the spray is the land's own (mud and water in the fen, snow in the pass), never white snow on a swamp */
  const snowCol = new THREE.Color(KM ? KM.spray[0] : ash ? 0x6d655e : 0xb8c3cf); const snowDim = KM ? new THREE.Color(KM.spray[1]) : snowCol.clone().multiplyScalar(0.7);
  const wetLand = KIND === 'mud' || KIND === 'earth';
  if (wetLand) { frostHot.setRGB(0.32, 0.36, 0.3); frostCol.set(KIND === 'mud' ? 0x4a5650 : 0x5a5248); frostLow.set(KIND === 'mud' ? 0x262c28 : 0x2e2822); } /* no frost glitter or white rime mist on mud */
  const impact = (p, power) => {
    const gy = GROUND(p.x, p.z);
    for (let i = 0; i < 70 * power; i++) { const a = (i / (70 * power)) * Math.PI * 2 + Math.random() * 0.15; const sp = 5 + Math.random() * 6;
      soft.emit(p.x + Math.cos(a) * 1.4, gy + 0.3, p.z + Math.sin(a) * 1.4, Math.cos(a) * sp, 0.6 + Math.random() * 1.8, Math.sin(a) * sp, Math.random() < 0.5 ? snowCol : snowDim, 1.4 + Math.random() * 0.6, 0.6, 2.2, 0.2, -0.1, 1.6); }
    for (let i = 0; i < 30 * power; i++) soft.emit(p.x + (Math.random() - 0.5) * 3, gy + 0.6, p.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2.5, 2.5 + Math.random() * 4.5, (Math.random() - 0.5) * 2.5, snowCol, 1.6, 0.6, 2.0, 0.15, 0.7, 0.9);
    for (let i = 0; i < 34 * power; i++) { const a = Math.random() * Math.PI * 2; const sp = 2.5 + Math.random() * 6; shards.emit(p.x + Math.cos(a) * 1.0, gy + 0.3, p.z + Math.sin(a) * 1.0, Math.cos(a) * sp, (4 + Math.random() * 7) * LIFT, Math.sin(a) * sp, 0.1 + Math.random() * 0.26, 5 + Math.random() * 3); }
    for (let i = 0; i < 40 * power; i++) { const a = Math.random() * 6.28; const sp = 2 + Math.random() * 7; glow.emit(p.x, gy + 0.4, p.z, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, frostHot, 0.7 + Math.random() * 0.6, 0.07, 0.025, 0.9, 9, 0.6); }
    slamLight.position.set(p.x, 2.2, p.z); slamLight.intensity = 240 * power; slamLight.color.set(0xdfeaff);
  };
  /* the plate's sky reflection: up-facing metal mirrors the bright snow sky, so a kneeling or fallen giant turned one flat
     light grey. The death dims the reflection and darkens the plate a little to keep the fight's dark iron. */
  const envMats = []; { const seen = new Set(); for (const m of actor.meshes) { const mt = m.material; if (!mt || seen.has(mt) || !('envMapIntensity' in mt)) continue; seen.add(mt); envMats.push([mt, mt.envMapIntensity, mt.color ? mt.color.clone() : null]); } }
  const darkIron = (k) => { for (const [mt, e0, c0] of envMats) { if (!c0 || mt.metalness <= 0.5) continue; mt.envMapIntensity = e0 * (1 - 0.2 * k); mt.color.copy(c0).multiplyScalar(1 - 0.2 * k); } };
  H.disposers.push(() => darkIron(0));
  H.onDeath = (pos) => {
    if (death) return death.dur;
    death = { t: 0, dur: DUR, kneel: false, knees: false, maul: 0, landed: false, fall: 0, down: false, roll: Math.random() < 0.5 ? -1 : 1, at: new THREE.Vector3().copy(pos || actor.root.position).setY(0) };
    actor.breakPart = () => []; /* it goes down whole: no plates fly */
    H.keepOut = 2.5 * S; /* the death camera stands back (keepOut + 2.6 m) so the whole fall fits in the frame */
    holder.updateMatrixWorld(true); scene.attach(holder); mounted = null;
    maulQ0.copy(holder.quaternion); maulP0.copy(holder.position);
    mQ0.copy(actor.model.quaternion); mP0.copy(actor.model.position);
    /* the maul falls flat in front of it, slanting across the hero's view (head toward the hero's side, near the knees) */
    const yaw = actor.root.rotation.y; const fx = Math.sin(yaw); const fz = Math.cos(yaw); _a.set(fz, 0, -fx); /* its right */
    _b.set(fx * 0.75 + _a.x * 0.66, 0, fz * 0.75 + _a.z * 0.66).normalize(); /* haft direction: forward and to its right */
    maulQ1.setFromUnitVectors(UP, _b).premultiply(_q.setFromAxisAngle(_b, 0.3 + Math.random() * 0.3));
    holder.parent.updateMatrixWorld(true); maulP1.copy(actor.root.position).setY(floorY() + 0.13 * S).addScaledVector(_a, 0.55 * S).addScaledVector(_b, -0.05 * S);
    /* where the body goes (it rolls about the knees toward one side, a little forward): the death director's
       shots stand off that side, so the fall never lands on the lens */
    H.fallDir = new THREE.Vector3(-death.roll * fz * 1.3 + fx * 0.3, 0, death.roll * fx * 1.3 + fz * 0.3).normalize();
    actor.play('Hit_Chest', { loop: false, fade: 0.08, restart: true, speed: 0.75 });
    /* the killing blow lands: sparks burst off the breastplate toward the hero, a hot flash, a hard shake */
    if (B.spine_03) { actor.root.updateMatrixWorld(true); B.spine_03.getWorldPosition(_c); } else _c.copy(actor.root.position).setY(2.2 * S / 2.7);
    { const hx = player ? player.x - _c.x : fx; const hz = player ? player.z - _c.z : fz; const hl = Math.hypot(hx, hz) || 1;
      for (let i = 0; i < 70; i++) { const a = Math.atan2(hz, hx) + (Math.random() - 0.5) * 2.2; const sp = 4 + Math.random() * 9;
        glow.emit(_c.x, _c.y, _c.z, Math.cos(a) * sp, -1 + Math.random() * 6, Math.sin(a) * sp, Math.random() < 0.45 ? white : emberCol, 0.5 + Math.random() * 0.6, 0.09, 0.03, 1, 12, 0.4); }
      for (let i = 0; i < 18; i++) mist.emit(_c.x + hx / hl * 0.4, _c.y, _c.z + hz / hl * 0.4, (Math.random() - 0.5) * 1.5, 0.3 + Math.random(), (Math.random() - 0.5) * 1.5, breathDim, 1.2, 0.4, 1.6, 0.18, -0.2, 1.2, false); }
    slamLight.position.copy(_c); slamLight.intensity = 110; slamLight.color.set(0xffffff).lerp(accent, 0.6); /* was 200: the flash lit the plate flat white */
    H.shake = Math.max(H.shake, 0.9);
    return death.dur;
  };
  /* the fall comes sooner: the impact lands about 0.8 s before the end card, so it is seen */
  const FALL0 = 1.35; const FALL1 = 2.15; const FALL_A = 1.3;
  /* the fallen body rests ON its ground. The topple turns about the knees, so the helm, the low arm and a knee went
     through the ground and the fen water. Each frame after the pose:
     (1) the whole body lifts until its trunk and head rest on the floor (the ground under its feet, or the land's still
     water, scene.userData.waterLevel from lands.js, when that is higher); (2) the low arm and leg bend up at the shoulder,
     elbow, hip and knee so no hand or shin goes under. Radii are the plate's size round each bone. */
  const REST = [['Head', 0.36], ['neck_01', 0.3], ['spine_03', 0.44], ['spine_02', 0.4], ['pelvis', 0.34], ['clavicle_l', 0.3], ['clavicle_r', 0.3], ['upperarm_l', 0.26], ['upperarm_r', 0.26], ['thigh_l', 0.24], ['thigh_r', 0.24]]
    .map(([n, r]) => [boneOf(actor, n), r * S]).filter(([b]) => b);
  const LIMBS = [['upperarm_l', 'lowerarm_l', 0.2], ['lowerarm_l', 'hand_l', 0.17], ['upperarm_r', 'lowerarm_r', 0.2], ['lowerarm_r', 'hand_r', 0.17], ['thigh_l', 'calf_l', 0.17], ['calf_l', 'foot_l', 0.1], ['thigh_r', 'calf_r', 0.17], ['calf_r', 'foot_r', 0.1]]
    .map(([a, b, r]) => [boneOf(actor, a), boneOf(actor, b), r * S]).filter(([a, b]) => a && b);
  let restLift = 0; const _rp = new THREE.Quaternion(); const _rl = new THREE.Quaternion(); const _re = new THREE.Vector3();
  const floorY = () => { const w = scene.userData?.waterLevel; return Math.max(actor.root.position.y, Number.isFinite(w) ? w + 0.02 : -Infinity); };
  /* turn `bone` about its own joint (pivot, world) so that `end` (world) comes up to height y, the same length */
  const liftTo = (bone, pivot, end, y) => {
    _c.subVectors(end, pivot); const L = _c.length(); if (L < 1e-4) return;
    const ty = clamp(y - pivot.y, -L * 0.98, L * 0.98); const h0 = Math.hypot(_c.x, _c.z) || 1e-4; const hor = Math.sqrt(L * L - ty * ty);
    _d.set(_c.x / h0 * hor, ty, _c.z / h0 * hor); _q.setFromUnitVectors(_c.normalize(), _d.normalize());
    bone.parent.getWorldQuaternion(_rp); _rl.copy(_rp).invert().multiply(_q).multiply(_rp); bone.quaternion.premultiply(_rl); bone.updateMatrixWorld(true);
  };
  const restOnGround = (dt) => {
    const f = floorY(); const y0 = actor.model.position.y;
    actor.model.position.y = y0 + restLift; actor.root.updateMatrixWorld(true);
    /* world metres to model units (the model sits under the scaled root) */
    const k = 1 / Math.max(1e-3, actor.root.scale.y);
    let need = -Infinity; for (const [b, r] of REST) { b.getWorldPosition(_re); need = Math.max(need, f + r - _re.y); }
    /* more lift when something goes under, settle back slowly when it is clear (never below the pose's own height) */
    const want = Math.max(0, restLift + need * k);
    restLift += (want - restLift) * Math.min(1, dt * (want > restLift ? 14 : 2));
    actor.model.position.y = y0 + restLift; actor.root.updateMatrixWorld(true);
    for (const [a, b, r] of LIMBS) { a.getWorldPosition(_a); b.getWorldPosition(_b); if (_b.y < f + r) liftTo(a, _a, _b, f + r); }
  };
  const DUR = 4.9;
  const updateDeath = (dt) => {
    const D = death; D.t += dt; const t = D.t; H.sqDeathT = t;
    if (t > 0.35 && !D.kneel) { D.kneel = true; actor.play('Fixing_Kneeling', { loop: false, fade: 0.45, restart: true, speed: 1.1 }); }
    if (D.kneel && !D.frozen && t > 0.35 + KNEEL_AT / 1.1) { D.frozen = true; actor.setSpeed(0); }
    if (t > 1.05 && !D.knees) { D.knees = true; try { H.onKneel?.(t); } catch (err) { console.warn('onKneel', err); } _a.copy(actor.root.position).setY(0); _b.set(Math.sin(actor.root.rotation.y), 0, Math.cos(actor.root.rotation.y)); _a.addScaledVector(_b, 0.35 * S); burst(_a, 0.7); }
    /* the maul: the grip drops, the haft swings down flat under gravity, it lands with a ring of frost */
    if (!D.landed) {
      D.maul = Math.min(1, D.maul + dt / 0.8); const k = D.maul * D.maul;
      holder.position.lerpVectors(maulP0, maulP1, k); holder.quaternion.slerpQuaternions(maulQ0, maulQ1, k);
      if (D.maul >= 1) { D.landed = true; holder.updateMatrixWorld(true); headG.getWorldPosition(_a); _a.y = 0; burst(_a, 0.35, false); impact(_a, 0.3); H.shake = Math.max(H.shake, shakeAt(_a, 0.6)); }
    }
    /* the topple: it sways, then falls forward like a tree about its knees (ease-in = gravity), lands, rocks once */
    let ang = 0; let roll = 0;
    if (t > FALL0 - 0.5 && t < FALL0) ang = -0.05 * Math.sin((t - FALL0 + 0.5) / 0.5 * Math.PI);
    else if (t >= FALL0) {
      const u = clamp((t - FALL0) / (FALL1 - FALL0), 0, 1);
      roll = D.roll * FALL_A * u * u * u; ang = 0.3 * u * u;
      if (u >= 1) { const b = t - FALL1; roll = D.roll * (FALL_A - 0.07 * Math.sin(Math.min(b * 9, Math.PI)) * Math.exp(-b * 2.5)); ang = 0.3; }
    }
    _rq.setFromAxisAngle(_a.set(1, 0, 0), ang); _rz.setFromAxisAngle(_b.set(0, 0, 1), roll); _rq.multiply(_rz);
    actor.model.quaternion.copy(_rq).multiply(mQ0);
    PIV.x = D.roll * -0.22; actor.model.position.copy(mP0).sub(PIV).applyQuaternion(_rq).add(PIV);
    /* after the impact the dead weight settles: it sinks a hand's width into the snow over the next seconds */
    actor.model.position.y -= 0.035 * sstep(FALL1 + 0.3, DUR, t);
    restOnGround(dt);
    if (t >= FALL1 && !D.down) {
      D.down = true; try { H.onImpact?.(t); } catch (err) { console.warn('onImpact', err); } actor.root.updateMatrixWorld(true);
      const sp = B.spine_03 || B.Head; if (sp) sp.getWorldPosition(_a); else _a.copy(actor.root.position); _a.y = 0;
      burst(_a, 1.0); impact(_a, 1.0); H.shake = Math.max(H.shake, shakeAt(_a, 1.6));
      /* the last breath is forced out of the helm by the impact: thin, low, along the ground */
      if (B.Head) B.Head.getWorldPosition(_c);
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28; const v = 0.4 + Math.random() * 1.2; mist.emit(_c.x, Math.max(0.3, _c.y), _c.z, Math.cos(a) * v, 0.1 + Math.random() * 0.4, Math.sin(a) * v, breathDim, 2.2 + Math.random(), 0.4, 2.2, 0.16, -0.05, 1.0, false); }
      breathT = 99;
    }
    /* the furnace behind the visor: it flares at the blow, gutters while it falls, dies on the impact */
    const out = t < FALL1 ? 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7) : Math.pow(Math.max(0, 1 - (t - FALL1) / 3.4), 1.6) * (0.55 + 0.45 * Math.sin(t * 13) * Math.sin(t * 5.3)) * 0.8;
    slitMat.opacity = out; if (haloMat) haloMat.opacity = out; if (ctx.visor !== false) actor.eyes(9 * out, accent.getHex());
    /* frost reads by world normal: once the body leans forward its back and pauldrons face the sky and the old ramp
       (to 1.2) turned the whole giant into matte light grey. Keep the dark iron: the rime thins as it
       kneels and only creeps back a little after the impact. */
    darkIron(sstep(0.1, 0.9, t)); grimeCap = 0.05 * (1 - sstep(0, 0.6, t));
    frostU.k.value = 0.7 - 0.5 * sstep(0.2, 1.0, t) + 0.15 * sstep(FALL1 + 0.5, DUR, t); lowU.k.value = 0.3 - 0.18 * sstep(0.2, 1.0, t) + 0.1 * sstep(FALL1 + 0.5, DUR, t);
    /* the settle: thin ground mist drifts off the body and a few rime glints catch the light, so the frame never freezes */
    if (D.down) { D.drift = (D.drift || 0) + dt * 7; actor.root.updateMatrixWorld(true);
      while (D.drift >= 1) { D.drift -= 1; const b = (Math.random() < 0.5 ? B.spine_03 : B.thigh_l) || B.Head; if (!b) break; b.getWorldPosition(_a); const a = Math.random() * 6.28; const r = (0.4 + Math.random() * 0.6) * S;
        mist.emit(_a.x + Math.cos(a) * r, 0.1 + Math.random() * 0.25, _a.z + Math.sin(a) * r, Math.cos(a) * 0.35, 0.05 + Math.random() * 0.1, Math.sin(a) * 0.35, frostLow, 2.4 + Math.random(), 0.5, 1.6, 0.07, 0, 1.2);
        if (Math.random() < 0.45) glow.emit(_a.x + (Math.random() - 0.5) * 1.6 * S * 0.5, 0.3 + Math.random() * 1.2, _a.z + (Math.random() - 0.5) * 1.6 * S * 0.5, 0, 0.05 + Math.random() * 0.1, 0, frostHot, 0.9 + Math.random() * 0.8, 0.035, 0.012, 0.6, 0, 0.6, false); } }
    if (t > 0.2) breathT = 99;
    /* the camera follows the fall: between the helm and the chest, never into the dirt */
    if (B.Head && B.spine_03) { B.Head.getWorldPosition(_a); B.spine_03.getWorldPosition(_b); H.lookAt.copy(_a).lerp(_b, 0.5 * sstep(FALL0, FALL1, t)); H.lookAt.y = Math.max(1.4, H.lookAt.y); }
  };
}
/* the kneel frame of the clip Fixing_Kneeling (seconds) */
const KNEEL_AT = 0.9;

/* ---------------------------------------------------------------- the Lich King */
function dressLich(actor, H, ctx, scene, accent, S) {
  const eyeCol = accent.clone().lerp(new THREE.Color(0xffffff), 0.35);
  actor.look({ ...BOSS_LOOK.lich, eye: eyeCol.getHex(), eyePower: 9 });
  for (const p of LICH_HIDE) for (const m of actor.parts.get(p) || []) m.visible = false;
  /* the robe, the hood and the crown never come off as debris: the lich is not a suit of armour */
  const breakPart = actor.breakPart.bind(actor); actor.breakPart = (name) => (LICH_KEEP.has(name) ? [] : breakPart(name));
  H.float = 0.4;
  const hemU = { time: { value: 0 }, col: { value: accent.clone().multiplyScalar(0.9) }, k: { value: 1 } };
  for (const m of actor.parts.get('Shroud') || []) if (/SQ_Cloth/.test(m.material.name || '')) addHem(m.material, hemU);
  for (const m of actor.parts.get('IronCrown') || []) if (m.userData.glow) { m.material.emissive.copy(accent).lerp(new THREE.Color(0xffffff), 0.2); m.material.emissiveIntensity = 3.5; }
  /* no walk cycle: it glides */
  const play = actor.play.bind(actor);
  actor.play = (name, opt = {}) => play(WALKS.has(name) || name === 'Sword_Idle' || name === 'Idle_Loop' ? 'Spell_Simple_Idle_Loop' : name, WALKS.has(name) ? { ...opt, speed: 0.7 } : opt);
  /* the eyes: two slits that can open and shut in the dark */
  let eyeLock = false; const eyes = actor.eyes.bind(actor);
  actor.eyes = (p, c) => { if (!eyeLock) eyes(p, c); };
  /* the eyes: two coals deep in the skull's sockets (the knight's eye slits would float in front of the skull) */
  for (const m of actor.parts.get('Eyes') || []) m.visible = false;
  /* the skull sits in the hood's shadow: old dark bone, not a white Halloween mask; only the eye coals light it */
  const skullMats = new Map(); const faceU = { col: { value: accent.clone().lerp(new THREE.Color(0xffffff), 0.35) }, k: { value: 1 } }; H.faceU = faceU;
  for (const m of actor.parts.get('LichSkull') || []) {
    if (!/SQ_Bone/.test(m.material.name || '')) continue;
    let c = skullMats.get(m.material);
    if (!c) { c = m.material.clone(); c.color.set(0x3b352d); c.roughness = 0.88; c.metalness = 0; c.envMapIntensity = 0.25; skullMats.set(m.material, c); H.disposers.push(() => c.dispose());
      /* the hood's shadow: the lantern sits a metre away, so cut the light that reaches the face and keep the top of the brow a little lit */
      /* and the coals in the sockets light the bone around them (the rims of the sockets, the cheek bones, the teeth
         below), plus a faint cold catch-light on the brow and the teeth, so a face reads at 4-8 m */
      chain(c, 'sq-hoodshade', (sh) => { Object.assign(sh.uniforms, { sqFaceCol: faceU.col, sqFaceK: faceU.k });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqHp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSqHp = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSqHp; uniform vec3 sqFaceCol; uniform float sqFaceK;').replace('#include <opaque_fragment>', `outgoingLight *= mix(0.3, 0.6, smoothstep(1.6, 1.76, vSqHp.y));
          { float ed = min(distance(vSqHp, vec3(0.033, 1.699, 0.105)), distance(vSqHp, vec3(-0.033, 1.699, 0.105)));
            float front = smoothstep(0.04, 0.1, vSqHp.z);
            float brow = smoothstep(1.712, 1.728, vSqHp.y) * (1.0 - smoothstep(1.745, 1.775, vSqHp.y));
            float teeth = smoothstep(1.615, 1.63, vSqHp.y) * (1.0 - smoothstep(1.655, 1.668, vSqHp.y));
            outgoingLight += sqFaceCol * sqFaceK * (exp(-ed / 0.016) * 0.9 + 0.12 * front * exp(-ed / 0.06) + 0.07 * front * (brow + teeth * 1.4)); }
          #include <opaque_fragment>`); }); }
    m.material = c;
  }
  const slits = [];
  for (const sx of [-1, 1]) {
    const o = attachAtBind(actor, 'Head', new THREE.Vector3(sx * 0.033, 1.699, 0.113), ZAX);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.032), new THREE.MeshBasicMaterial({ map: dotTexture(), color: accent.clone().lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    o.add(m); slits.push(m);
  }
  const robeU = { time: hemU.time, drag: { value: new THREE.Vector3() }, k: { value: 1 } };
  for (const m of actor.parts.get('Shroud') || []) if (/SQ_Cloth/.test(m.material.name || '')) addRobe(m.material, robeU);
  for (const m of actor.parts.get('Sleeves') || []) if (/SQ_Cloth/.test(m.material.name || '')) addRobe(m.material, { time: hemU.time, drag: { value: new THREE.Vector3() }, k: { value: 0 } });
  /* the outline: a ragged shoulder mantle over the robe, a heavy belt with two hanging chains (bind space, on the
     chest and pelvis bones), so it reads as a robed king at 4-8 m, not a smooth cone */
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x0c0a10, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  chain(clothMat, 'sq-lining', (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= 0.15;'); });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x26231f, roughness: 0.55, metalness: 0.85 });
  H.disposers.push(() => { clothMat.dispose(); ironMat.dispose(); });
  { const g = new THREE.CylinderGeometry(0.16, 0.4, 0.4, 36, 4, true); const p = g.attributes.position; const r = seeded(77);
    const tear = Array.from({ length: 37 }, () => r());
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const a = Math.atan2(z, x); const k = (0.2 - y) / 0.4; /* 0 at the collar, 1 at the hem */
      const fold = 1 + 0.12 * k * Math.sin(a * 7 + 0.6) + 0.05 * k * Math.sin(a * 13);
      const seg = Math.round(((a + Math.PI) / (Math.PI * 2)) * 36) % 36; const drop = k >= 0.99 ? (tear[seg] * 0.16 + (seg % 3 === 0 ? 0.08 : 0)) : 0;
      p.setXYZ(i, x * fold, y - drop + 0.03 * k * Math.sin(a * 5), z * fold * 0.92 + (z < 0 ? -0.03 * k : 0)); }
    g.computeVertexNormals(); g.translate(0, -0.2, 0);
    const mantle = new THREE.Mesh(g, clothMat); mantle.castShadow = true;
    const o = attachBindFrame(actor, 'spine_03', new THREE.Vector3(0, 1.56, -0.01)); o.add(mantle); H.disposers.push(() => o.removeFromParent()); H.mantle = mantle; }
  { const belt = new THREE.Mesh(new THREE.TorusGeometry(0.212, 0.026, 6, 32), ironMat); belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.92, 1);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.025), ironMat); buckle.position.set(0, 0, 0.205);
    const o = attachBindFrame(actor, 'spine_01', new THREE.Vector3(0, 1.075, 0)); o.add(belt, buckle);
    const link = new THREE.TorusGeometry(0.022, 0.006, 4, 10);
    for (const [x, z, n] of [[-0.14, 0.15, 7], [0.1, 0.18, 5]]) for (let i = 0; i < n; i++) { const l = new THREE.Mesh(link, ironMat); l.position.set(x + Math.sin(i * 0.7) * 0.01, -0.03 - i * 0.036, z + i * 0.004); l.rotation.y = (i % 2) * Math.PI / 2; o.add(l); }
    H.disposers.push(() => o.removeFromParent()); }
  /* the lantern: the crystal of the staff is its heart */
  const lanternLight = new THREE.PointLight(accent, 0, 11 * S, 1.6); lanternLight.castShadow = false;
  /* the glow around the lantern is capped (it crowded the boss title as a big white disc); a small hot core inside */
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: accent.clone().multiplyScalar(0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.scale.setScalar(0.5);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: accent.clone().lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x1b1916, metalness: 0.85, roughness: 0.5, side: THREE.DoubleSide }); /* double-sided: its shadow uses a program the fight already has */
  const cage = new THREE.Group();
  { const bars = []; /* six bent iron straps over the orb, two bands, a cap and a ring to hang it by (unit radius, merged) */
    for (let k = 0; k < 6; k++) { const g = new THREE.TorusGeometry(1, 0.045, 4, 18, Math.PI); g.rotateZ(Math.PI / 2); g.rotateY(k * Math.PI / 6); bars.push(g.toNonIndexed()); }
    for (const y of [-0.45, 0.45]) { const g = new THREE.TorusGeometry(Math.sqrt(1 - y * y) * 1.02, 0.05, 4, 24); g.rotateX(Math.PI / 2); g.translate(0, y, 0); bars.push(g.toNonIndexed()); }
    { const g = new THREE.CylinderGeometry(0.16, 0.34, 0.24, 8); g.translate(0, 1.06, 0); bars.push(g.toNonIndexed()); }
    { const g = new THREE.TorusGeometry(0.16, 0.04, 4, 12); g.translate(0, 1.32, 0); bars.push(g.toNonIndexed()); }
    { const g = new THREE.CylinderGeometry(0.3, 0.12, 0.16, 8); g.translate(0, -1.02, 0); bars.push(g.toNonIndexed()); }
    const g = mergeGeometries(bars); g.computeVertexNormals(); const m = new THREE.Mesh(g, cageMat); m.castShadow = true; cage.add(m); }
  /* the cage falls loose at death: warm its plain-mesh shadow variant too */
  (H.warmMats = H.warmMats || []).push(cageMat);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c1012, emissive: accent, emissiveIntensity: 0.06, roughness: 0.2, metalness: 0.4, flatShading: true }); /* dark smoked glass pieces, no lit confetti */
  const lanternShards = new Shards(scene, 24, slabShardGeometry(5, 0.3), glassMat, 0.15);
  let crystal = null; let crystalMat = null;
  const findLantern = () => {
    const slot = actor.slot('handslotr'); if (!slot) return;
    slot.traverse((o) => { if (!crystal && o.isMesh && (o.userData.kind === 'crystal' || /SQ_Crystal/.test(o.material?.name || ''))) crystal = o; });
    if (crystal) { crystal.geometry.computeBoundingSphere(); const bs = crystal.geometry.boundingSphere; const c = bs.center; lanternLight.position.copy(c); halo.position.copy(c); core.position.copy(c); cage.position.copy(c); cage.scale.setScalar(bs.radius * 1.06);
      halo.scale.setScalar(bs.radius * 3.2); core.scale.setScalar(bs.radius * 1.1); H.lanternR = bs.radius;
      crystal.add(lanternLight, halo, core, cage); crystalMat = crystal.material; crystalMat.emissive = accent.clone();
      /* dark smoked glass, the light deep inside it: not a white ball */
      if (crystalMat.color) crystalMat.color.set(0x0b100e); if ('roughness' in crystalMat) crystalMat.roughness = 0.12; if ('metalness' in crystalMat) crystalMat.metalness = 0.1; }
  };
  findLantern();
  const soft = new Particles(scene, 360, { map: puffTex() }); const glow = new Particles(scene, 260, { additive: true });
  const runes = []; for (let i = 0; i < 4; i++) { const r = groundDecal(runeTex(), { size: 1, color: accent.clone().multiplyScalar(4), additive: true, order: 3 }); const r2 = groundDecal(dotTexture(), { size: 1, color: accent.clone().multiplyScalar(0.8), additive: true, order: 2 }); scene.add(r, r2); runes.push({ r, r2, t: -1, at: new THREE.Vector3() }); }
  const risers = []; const dirt = new THREE.Color(0x3a2e24); const dirt2 = new THREE.Color(0x231b15);
  const dirtShards = new Shards(scene, 60, rockChunk(21), new THREE.MeshStandardMaterial({ color: 0x2c241d, roughness: 1 }));
  H.disposers.push(() => { soft.dispose(); glow.dispose(); lanternShards.dispose(); dirtShards.dispose(); for (const r of runes) { r.r.removeFromParent(); r.r2.removeFromParent(); } lanternLight.removeFromParent(); halo.removeFromParent(); for (const s of slits) s.parent?.removeFromParent(); });

  let phase = 0; let seq = -1; let lit = 1; let heart = 0; let open = 1;
  H.onPhase = (p) => {
    if (p <= phase) return; phase = p;
    if (p === 1) { lit = 2.2; for (let i = 0; i < 40; i++) emitLantern(glow, 1); }
    if (p >= 2) { seq = 0; eyeLock = true; }
  };
  const lanternPos = new THREE.Vector3();
  const lanternCol = accent.clone().multiplyScalar(2.5); const heartCol = accent.clone().lerp(new THREE.Color(0xff2a10), 0.5); const wispCol = new THREE.Color(0x0e0c12);
  const emitLantern = (pool, k) => { const sp = 1.5 + Math.random() * 3 * k; const a = Math.random() * 6.28; const b = Math.random() * 3.14 - 1.57; pool.emit(lanternPos.x, lanternPos.y, lanternPos.z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 1, Math.sin(a) * Math.cos(b) * sp, lanternCol, 0.8 + Math.random() * 0.6, 0.06, 0.02, 1, 2, 1.5, false); };
  H.onSummon = (positions = []) => {
    positions.forEach((p, i) => { const r = runes[i % runes.length]; r.t = 0; r.at.copy(p); r.r.position.set(p.x, r.r.position.y, p.z); r.r2.position.set(p.x, r.r2.position.y, p.z); r.r.visible = r.r2.visible = true; });
    return 0.9;
  };
  H.rise = (thrall, dur = 1.2) => {
    const slot = risers.find((r) => !r.a) || (risers.length < 6 ? (risers.push({}), risers[risers.length - 1]) : risers[0]);
    slot.a = thrall; slot.t = 0; slot.dur = dur; slot.depth = 2.1 / (thrall.root.scale.y || 1);
    thrall.model.position.y = -slot.depth;
    /* a soft tinted glow in the eyes, not a white blob on the chest */
    thrall.eyes?.(2.2, eyeCol.getHex());
  };
  H.update = (dt, st = {}) => {
    H.time += dt; hemU.time.value = H.time;
    if (!crystal) findLantern();
    /* float and glide */
    if (st.dead) H.float += (0 - H.float) * Math.min(1, dt * 3);
    const bob = st.dead ? 0 : Math.sin(H.time * 1.3) * 0.05;
    actor.model.position.y = (H.float + bob) / S;
    actor.model.rotation.x += ((st.moving && !death ? 0.14 : 0) - actor.model.rotation.x) * Math.min(1, dt * 3);
    /* the robe trails behind the glide and swings back when it stops (model space, bind units) */
    { const want = st.moving && !death ? -0.13 : 0; const D = robeU.drag.value; dragV += ((want - D.z) * 40 - dragV * 7) * dt; D.z += dragV * dt; D.y = 0.25 * Math.abs(D.z); }
    actor.root.updateMatrixWorld(true);
    if (!death) headPos(actor, H.lookAt);
    if (crystal) crystal.getWorldPosition(lanternPos);
    /* phase 2: the lantern flares, cracks and goes out; dark; the eyes open; the lantern comes back as a cracked heart */
    let eyeK = 1; let lantern = lit;
    if (seq >= 0) {
      const t0 = seq; seq += dt; const t = seq;
      if (t < 0.4) lantern = 1 + 5 * (t / 0.4);
      else if (t < 1.7) { lantern = 0; if (t0 < 0.4) { for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28; const sp = 2 + Math.random() * 4; lanternShards.emit(lanternPos.x, lanternPos.y, lanternPos.z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, 0.05 + Math.random() * 0.05, 2.5, 18); } for (let i = 0; i < 60; i++) emitLantern(glow, 2); } }
      else lantern = 0;
      H.darkness = sstep(0.4, 1.4, t) * 0.88;
      eyeK = t < 0.4 ? 1 : t < 2.0 ? 0 : sstep(2.0, 2.35, t);
      if (t > 2.6) heart = sstep(2.6, 3.4, t);
      if (t > 3.5) { eyeLock = false; }
    }
    if (heart > 0) lantern = heart * (0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(H.time * 5.2)), 6) + 0.25 * Math.pow(Math.max(0, Math.sin(H.time * 5.2 - 0.9)), 6));
    lit += (1 - lit) * Math.min(1, dt * 1.5);
    const flick = 0.9 + 0.1 * Math.sin(H.time * 17) * Math.sin(H.time * 7.3);
    lanternLight.intensity = lantern * flick * 8 * (heart > 0 ? 1.5 : 1);
    if (!death) { const lr = H.lanternR || 0.05; halo.material.opacity = Math.min(0.42, lantern * flick * 0.3); halo.scale.setScalar(lr * (2.6 + 0.5 * Math.min(2, lantern))); core.material.opacity = Math.min(0.9, lantern * flick * 0.7); core.scale.setScalar(lr * (0.9 + 0.2 * Math.min(2, lantern)));
      if (crystalMat) { crystalMat.emissiveIntensity = Math.min(1.6, lantern * flick * (heart > 0 ? 1.8 : 0.9)); if (heart > 0) crystalMat.emissive.copy(heartCol); } }
    /* the eyes */
    open += (eyeK - open) * Math.min(1, dt * 14);
    if (!death) { for (const s of slits) { s.scale.y = Math.max(0.001, open) * (1 + 0.3 * H.darkness); s.material.opacity = open; s.scale.x = 1 + 0.15 * H.darkness; } faceU.k.value = open * (1 + 0.6 * H.darkness); }
    if (eyeLock) eyes(open * 12, eyeCol); else if (seq > 3.5) { eyes(18, eyeCol); seq = -2; }
    /* hem wisps */
    if (Math.random() < dt * 22) { const a = Math.random() * 6.28; const r = 0.32 * 1.27 * S; soft.emit(actor.root.position.x + Math.cos(a) * r, (H.float + 0.05) + Math.random() * 0.3, actor.root.position.z + Math.sin(a) * r, Math.cos(a) * 0.2, -0.05, Math.sin(a) * 0.2, wispCol, 2.0, 0.4, 1.3, 0.55, -0.05, 0.4, false); }
    if (Math.random() < dt * 8) { const a = Math.random() * 6.28; const r = 0.3 * 1.27 * S; glow.emit(actor.root.position.x + Math.cos(a) * r, H.float + Math.random() * 0.4, actor.root.position.z + Math.sin(a) * r, 0, 0.25, 0, accent, 1.8, 0.05, 0.02, 0.8, -0.1, 0.2, false); }
    /* rune circles */
    for (const r of runes) {
      if (r.t < 0) continue; r.t += dt; const t = r.t;
      const k = t < 0.5 ? sstep(0, 0.5, t) : t < 3.2 ? 1 : 1 - sstep(3.2, 4.2, t);
      const size = 3.2 * (0.6 + 0.4 * sstep(0, 0.5, t));
      r.r.scale.set(size, 1, size); r.r.rotation.y += dt * 0.9; r.r.material.opacity = k * (0.85 + 0.15 * Math.sin(t * 9));
      r.r2.scale.set(size * 1.3, 1, size * 1.3); r.r2.material.opacity = k * 0.8;
      if (t < 2 && Math.random() < dt * 30) { const a = Math.random() * 6.28; const d = Math.random() * size * 0.45; glow.emit(r.at.x + Math.cos(a) * d, 0.05, r.at.z + Math.sin(a) * d, 0, 1.5 + Math.random() * 2, 0, accent, 1.0, 0.07, 0.02, 1, -0.5, 0.5, false); }
      if (t > 4.2) { r.t = -1; r.r.visible = r.r2.visible = false; }
    }
    /* thralls climbing out */
    for (const r of risers) {
      if (!r.a) continue; r.t += dt; const k = clamp(r.t / r.dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 2.2); r.a.model.position.y = -r.depth * (1 - e);
      const p = r.a.root.position;
      if (k < 1 && Math.random() < dt * 40) { const a = Math.random() * 6.28; soft.emit(p.x + Math.cos(a) * 0.4, 0.1, p.z + Math.sin(a) * 0.4, Math.cos(a) * 1.2, 1 + Math.random() * 2, Math.sin(a) * 1.2, Math.random() < 0.5 ? dirt : dirt2, 1.2, 0.3, 1.1, 0.75, 2, 1); }
      if (k < 0.9 && Math.random() < dt * 14) dirtShards.emit(p.x + (Math.random() - 0.5) * 0.6, 0.3 + e * 1.5, p.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2.5, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5, 0.05 + Math.random() * 0.08, 2.2);
      if (k >= 1) { r.a.model.position.y = 0; r.a = null; }
    }
    if (death) updateDeath(dt);
    soft.update(dt); glow.update(dt); lanternShards.update(dt); dirtShards.update(dt);
  };
  let dragV = 0;

  /* ---- death (main beats inside 3.5 s): 0.0 the lantern flares; 0.25 it bursts (shards, sparks) and green fire takes
     the robe (layered flame tongues, never one sprite); the skull stays lit by its coals, cracks and at 1.0 crumbles
     into bone chips; 0.95-1.8 the empty robe falls as cloth (the hem burns up, it slumps and spreads); the crown drops
     at 1.0 and rolls toward the hero into the middle of the view; after that: dying flames and embers on the robe,
     and the lantern's last light (moved down to the heap) keeps the crown catching light. */
  let death = null; const crown = { g: null, p: new THREE.Vector3(), v: new THREE.Vector3(), dir: new THREE.Vector3(), q0: new THREE.Quaternion(), mode: 'none', rad: 0.2, lean: 0, spin: 0, sp: 0, t: 0, mats: [] };
  const boneDust = new THREE.Color(0x3a352d); const robeDust = new THREE.Color(0x15131a);
  const fireA = accent.clone().multiplyScalar(0.8); const fireB = accent.clone().lerp(new THREE.Color(0xffffff), 0.4).multiplyScalar(0.95); const fireDeep = accent.clone().lerp(new THREE.Color(0x0a3010), 0.4).multiplyScalar(0.6);
  const smokeG = new THREE.Color(0x101410);
  const flames = new Particles(scene, 420, { additive: true, map: dotTexture(), near: [0.6, 2.2] }); /* soft round glow: no pointed sprite */
  const fsmoke = new Particles(scene, 120, { map: wispTex(), near: [0.8, 2.6] });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0x4a443a, roughness: 0.9, metalness: 0 });
  const boneChips = new Shards(scene, 48, rockGeometry(33), boneMat);
  H.disposers.push(() => { flames.dispose(); fsmoke.dispose(); boneChips.dispose(); boneMat.dispose(); });
  /* the crown is baked off the body at death: compile its non-skinned materials up front */
  H.warmMats = H.warmMats || []; for (const m of actor.parts.get('IronCrown') || []) H.warmMats.push(m);
  const fireAt = (x, y, z, k = 1, spread = 0.12) => {
    const big = Math.random() < 0.3;
    flames.emit(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 0.25, 0.35 + Math.random() * 0.6, (Math.random() - 0.5) * 0.25, big ? fireA : (Math.random() < 0.5 ? fireB : fireDeep), 0.35 + Math.random() * 0.4, (big ? 0.42 : 0.24) * k, (big ? 0.16 : 0.08) * k, big ? 0.3 : 0.5, -0.8, 0.8, false);
  };
  const bodyPts = ['spine_01', 'spine_02', 'spine_03', 'pelvis', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'neck_01'].map((n) => boneOf(actor, n)).filter(Boolean);
  const heap = new THREE.Vector3();
  /* the fallen robe: a crumpled mound of the same black cloth (deep folds, a ragged rim) that the slumping robe sinks
     into, so the heap never shows an open tube or flat planes */
  const mound = (() => { const g = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2); const p = g.attributes.position; const r = seeded(91);
    const ph = [r() * 6, r() * 6, r() * 6];
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const a = Math.atan2(z, x); const rim = 1 - y;
      const fold = 1 + 0.16 * Math.sin(a * 6 + ph[0] + y * 3) * rim + 0.08 * Math.sin(a * 13 + ph[1]) * rim;
      const lump = 1 + 0.22 * Math.sin(a * 3 + ph[2]) * y + 0.12 * Math.sin(a * 5 + y * 4);
      p.setXYZ(i, x * fold * (1 + 0.12 * Math.sin(a * 2)), y * lump * (0.75 + 0.25 * Math.sin(a * 4 + 1)), z * fold); }
    g.computeVertexNormals(); const m = new THREE.Mesh(g, clothMat); m.castShadow = true; m.receiveShadow = true; m.visible = false; scene.add(m); H.disposers.push(() => { m.removeFromParent(); g.dispose(); }); return m; })();
  (H.warmShow = H.warmShow || []).push(mound);
  const dropCrown = () => {
    actor.root.updateMatrixWorld(true);
    const g = new THREE.Group(); const pieces = [];
    for (const m of actor.parts.get('IronCrown') || []) { if (!m.visible) continue; pieces.push(bakeSkinned(m)); m.visible = false; }
    if (!pieces.length) return;
    const c = new THREE.Vector3(); for (const m of pieces) c.add(m.position); c.multiplyScalar(1 / pieces.length);
    let rad = 0.05;
    for (const m of pieces) { m.position.sub(c); g.add(m); m.castShadow = true; if (m.material?.emissive && !crown.mats.includes(m.material)) crown.mats.push(m.material); const pa = m.geometry.attributes.position; for (let i = 0; i < pa.count; i += 3) rad = Math.max(rad, Math.hypot(pa.getX(i) + m.position.x, pa.getZ(i) + m.position.z)); }
    g.position.copy(c); scene.add(g); crown.g = g; crown.rad = rad * 0.92; crown.p.copy(c); crown.q0.identity();
    /* it rolls out sideways from the heap */
    const p = actor.root.position; let yaw = actor.root.rotation.y;
    if (player) yaw = Math.atan2(player.x - p.x, player.z - p.z);
    yaw += (Math.random() < 0.5 ? 1 : -1) * (1.25 + Math.random() * 0.2); /* across the view, not at the lens: it comes to rest beside the heap, at the heap's distance */
    crown.dir.set(Math.sin(yaw), 0, Math.cos(yaw)); crown.v.copy(crown.dir).multiplyScalar(1.1).setY(-0.6); crown.mode = 'fall'; crown.t = 0;
  };
  let player = null;
  const rollQ = new THREE.Quaternion(); const AX = new THREE.Vector3();
  const updateCrown = (dt) => {
    const C = crown; if (!C.g || C.mode === 'rest') return; C.t += dt;
    if (C.mode === 'fall') {
      C.v.y -= 9.8 * dt; C.p.addScaledVector(C.v, dt); C.spin += dt * 9;
      AX.set(C.dir.z, 0, -C.dir.x); rollQ.setFromUnitVectors(UP, AX); _q.setFromAxisAngle(C.dir, 0.25);
      C.g.quaternion.slerpQuaternions(C.q0, _q2.copy(rollQ).premultiply(_q), clamp(C.t / 0.5, 0, 1));
      if (C.p.y <= C.rad && C.v.y < 0) { C.mode = 'roll'; C.sp = 1.5; C.lean = 0.25; C.p.y = C.rad; for (let i = 0; i < 8; i++) glow.emit(C.p.x, 0.05, C.p.z, (Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2, fireB, 0.6, 0.05, 0.02, 1, 4, 1, false); H.shake = Math.max(H.shake, 0.08); }
    } else if (C.mode === 'roll') {
      C.sp = Math.max(0, C.sp - dt * 1.0); C.p.addScaledVector(C.dir, C.sp * dt); C.spin += (C.sp / C.rad) * dt;
      C.lean += dt * (0.3 + 1.8 * (1 - C.sp / 1.5) ** 2); C.dir.applyAxisAngle(UP, dt * 0.6 * C.lean);
      if (C.lean >= Math.PI / 2) { C.lean = Math.PI / 2; C.mode = 'rest'; H.shake = Math.max(H.shake, 0.05); }
      C.p.y = Math.max(0.02, C.rad * Math.cos(C.lean) + 0.02 * Math.sin(C.lean));
      AX.set(C.dir.z, 0, -C.dir.x); rollQ.setFromUnitVectors(UP, AX);
      _q.setFromAxisAngle(AX, C.spin); rollQ.premultiply(_q); _q.setFromAxisAngle(C.dir, C.lean); rollQ.premultiply(_q); C.g.quaternion.copy(rollQ);
    }
    C.g.position.copy(C.p);
  };
  const look0 = new THREE.Vector3();
  H.onDeath = (pos) => {
    if (death) return death.dur;
    death = { t: 0, dur: 6.5, burst: false, bones: false, crown: false, down: false, y0: actor.model.position.y, sx: actor.model.scale.x, sy: actor.model.scale.y, fireAcc: 0, emberAcc: 0 };
    /* the death camera stands keepOut + 2.6 m back (4.6 m): the whole tall figure fits in the frame */
    H.keepOut = 2.0;
    actor.breakPart = () => []; eyeLock = true; seq = -2; heart = 0;
    look0.copy(H.lookAt); heap.copy(actor.root.position).setY(0);
    void pos; return death.dur;
  };
  const updateDeath = (dt) => {
    const D = death; D.t += dt; const t = D.t;
    /* the lantern: one last flare (capped), then it bursts */
    if (!D.burst) { const f = t / 0.25; lanternLight.intensity = 8 + 10 * f; const lr = H.lanternR || 0.05; halo.material.opacity = 0.42; halo.scale.setScalar(lr * (3 + 1.5 * f)); core.material.opacity = 0.9; core.scale.setScalar(lr * (1.1 + 0.6 * f)); if (crystalMat) crystalMat.emissiveIntensity = 1.6 + 1.4 * f; }
    if (t >= 0.25 && !D.burst) {
      D.burst = true;
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28; const sp = 2 + Math.random() * 4; lanternShards.emit(lanternPos.x, lanternPos.y, lanternPos.z, Math.cos(a) * sp, 1.5 + Math.random() * 3.5, Math.sin(a) * sp, 0.06 + Math.random() * 0.1, 4, 16); }
      for (let i = 0; i < 50; i++) emitLantern(glow, 2.2);
      for (let i = 0; i < 26; i++) fireAt(lanternPos.x, lanternPos.y - 0.1, lanternPos.z, 1.4, 0.3);
      if (crystal) crystal.visible = false; halo.visible = false; core.visible = false;
      cage.updateMatrixWorld(true); scene.attach(cage); D.cageV = new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5); D.cageW = (Math.random() - 0.5) * 9;
      /* the lantern's light leaves the staff and burns in the robe (one light the whole fight: no recompiles) */
      scene.attach(lanternLight);
      H.shake = Math.max(H.shake, 0.35);
    }
    /* the empty cage drops and comes to rest */
    if (D.cageV) { D.cageV.y -= 9.8 * dt; cage.position.addScaledVector(D.cageV, dt); cage.rotation.z += D.cageW * dt; const r = (H.lanternR || 0.05) * cage.scale.x * 0.9;
      if (cage.position.y < r) { cage.position.y = r; if (Math.abs(D.cageV.y) > 1) { D.cageV.y *= -0.3; D.cageV.x *= 0.5; D.cageV.z *= 0.5; D.cageW *= 0.4; } else { D.cageV.set(0, 0, 0); D.cageW = 0; D.cageV = null; } } }
    /* fire over the body while the robe still stands, then on the heap, dying out */
    actor.root.updateMatrixWorld(true);
    const fireRate = t < 0.25 ? 0 : t < 1.8 ? 170 : 150 * Math.max(0.08, 1 - (t - 1.8) / 2.6);
    D.fireAcc += dt * fireRate;
    while (D.fireAcc >= 1) { D.fireAcc -= 1;
      if (t < 1.6 && bodyPts.length) { bodyPts[Math.floor(Math.random() * bodyPts.length)].getWorldPosition(_a);
        /* on the outside of the cloth, mostly on the side the hero sees */
        const p = actor.root.position; let a = player ? Math.atan2(player.x - p.x, player.z - p.z) : actor.root.rotation.y; a += (Math.random() - 0.5) * 2.4; const r = 0.3 * S;
        fireAt(_a.x + Math.sin(a) * r, _a.y, _a.z + Math.cos(a) * r, 1.1, 0.2); }
      else { const a = Math.random() * 6.28; const d = Math.sqrt(Math.random()) * 0.55 * S; fireAt(heap.x + Math.cos(a) * d, 0.08, heap.z + Math.sin(a) * d, 0.85, 0.1); }
      if (Math.random() < 0.12) { _a.copy(heap); fsmoke.emit(_a.x + (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 1.2, _a.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, smokeG, 2.2, 0.3, 1.2, 0.16, -0.1, 0.5, false); }
    }
    /* embers that outlast the fire */
    if (t > 1.6) { D.emberAcc += dt * 14; while (D.emberAcc >= 1) { D.emberAcc -= 1; const a = Math.random() * 6.28; const d = Math.sqrt(Math.random()) * 0.6 * S;
      glow.emit(heap.x + Math.cos(a) * d, 0.06, heap.z + Math.sin(a) * d, (Math.random() - 0.5) * 0.2, 0.15 + Math.random() * 0.45, (Math.random() - 0.5) * 0.2, Math.random() < 0.5 ? fireB : fireA, 1.4 + Math.random() * 1.4, 0.035, 0.012, 1, -0.05, 0.4, false); } }
    if (D.burst) { const fl = 0.75 + 0.25 * Math.sin(t * 19) * Math.sin(t * 7.1); const k = t < 1.8 ? 1 : Math.max(0.12, 1 - (t - 1.8) / 3);
      _a.copy(heap).setY(t < 1.6 ? 1.2 : 0.9); _a.addScaledVector(crown.dir, 0.9); lanternLight.position.lerp(_a, Math.min(1, dt * 6)); lanternLight.intensity = (t < 1.6 ? 6 : 3.2) * k * fl; }
    /* the eyes flare with the lantern and gutter out; the skull holds its face for a second, then crumbles */
    const ek = t < 0.3 ? 1 + t * 2 : Math.max(0, 1.6 - (t - 0.3) * 2.2);
    for (const s of slits) { s.material.opacity = Math.min(1, ek); s.scale.setScalar(Math.max(0.001, Math.min(1.4, ek))); }
    faceU.k.value = Math.min(1.6, ek * 1.2) + (D.burst && t < 1.0 ? 0.5 : 0);
    if (t > 1.0 && !D.bones) {
      D.bones = true; actor.root.updateMatrixWorld(true);
      for (const p of ['LichSkull', 'BoneHands']) for (const m of actor.parts.get(p) || []) m.visible = false;
      headPos(actor, _a);
      for (let i = 0; i < 22; i++) boneChips.emit(_a.x + (Math.random() - 0.5) * 0.18, _a.y + (Math.random() - 0.5) * 0.18, _a.z + (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 1.6, -0.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6, 0.03 + Math.random() * 0.06, 7, 10);
      for (let i = 0; i < 14; i++) soft.emit(_a.x + (Math.random() - 0.5) * 0.2, _a.y + (Math.random() - 0.5) * 0.2, _a.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.5, -0.5 - Math.random() * 0.6, (Math.random() - 0.5) * 0.5, boneDust, 1.3, 0.06, 0.3, 0.22, 1.5, 1.2, true);
      for (const n of ['hand_l', 'hand_r']) { const b = boneOf(actor, n); if (!b) continue; b.getWorldPosition(_b); for (let i = 0; i < 8; i++) boneChips.emit(_b.x, _b.y, _b.z, (Math.random() - 0.5) * 1.2, Math.random(), (Math.random() - 0.5) * 1.2, 0.02 + Math.random() * 0.04, 7, 10); }
    }
    if (t > 1.0 && !D.crown) { D.crown = true; dropCrown(); }
    /* the empty robe falls as cloth: the shoulders sag first, then it slumps under its own weight and spreads; the
       sway grows as it goes and the hem burns upward with a green edge */
    hemU.k.value = 1 + 1.3 * sstep(0.3, 2.6, t);
    if (t > 0.95) {
      const k = clamp((t - 0.95) / 0.85, 0, 1); const e = k * k * (1.6 - 0.6 * k);
      actor.model.scale.y = D.sy * (1 - 0.9 * e); actor.model.scale.x = D.sx * (1 + 0.2 * e); actor.model.scale.z = D.sx * (1 + 0.15 * e);
      /* the mound rises around the sinking robe and takes over: the robe's top and inside are never seen */
      { const mk = sstep(0.15, 0.85, k); mound.visible = mk > 0.01; mound.position.copy(heap); mound.rotation.y = actor.root.rotation.y; mound.scale.set(0.56 * S * (0.6 + 0.4 * mk), 0.4 * S * mk, 0.52 * S * (0.6 + 0.4 * mk)); }
      actor.model.position.y = D.y0 * (1 - k); actor.model.rotation.x = 0.08 * e; robeU.k.value = 1 + 3 * Math.sin(Math.min(1, k) * Math.PI) + e;
      if (!D.mats) { D.mats = []; actor.model.traverse((o) => { if (o.isMesh && o.visible && o.material?.color) { const m = o.material; D.mats.push({ m, c: m.color.clone(), s: m.sheen || 0, sp: m.specularIntensity ?? 1, env: m.envMapIntensity ?? 1 }); } }); }
      /* flat on the ground the cloth faces the sky: keep it dark (sheen stays above 0: no shader recompile) */
      for (const x of D.mats) { x.m.color.copy(x.c).multiplyScalar(1 - 0.88 * e); if (x.s) x.m.sheen = Math.max(0.02, x.s * (1 - e)); if ('specularIntensity' in x.m) x.m.specularIntensity = x.sp * (1 - 0.85 * e); if ('envMapIntensity' in x.m) x.m.envMapIntensity = x.env * (1 - 0.7 * e); }
      if (k >= 1 && !D.down) {
        D.down = true; const p = actor.root.position; H.shake = Math.max(H.shake, 0.22);
        for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; const sp = 1.4 + Math.random() * 1.6; fsmoke.emit(p.x + Math.cos(a) * 0.5, 0.12, p.z + Math.sin(a) * 0.5, Math.cos(a) * sp, 0.1 + Math.random() * 0.3, Math.sin(a) * sp, robeDust, 1.8, 0.4, 1.6, 0.22, -0.05, 1.6); }
      }
    }
    updateCrown(dt);
    if (crown.g && Math.random() < dt * 5) { const r = crown.rad; const a = Math.random() * 6.28; glow.emit(crown.p.x + Math.cos(a) * r, crown.p.y + 0.03, crown.p.z + Math.sin(a) * r, 0, 0.12 + Math.random() * 0.2, 0, fireB, 0.9, 0.06, 0.02, 1, -0.05, 0.5, false); }
    /* the crown: its glow settles to a low steady burn so it keeps catching the eye */
    for (const m of crown.mats) m.emissiveIntensity = 2.2 + 1.5 * Math.max(0, 1 - (t - 1.0) / 2.5) + 0.5 * Math.sin(t * 2.2);
    /* the view: from the skull, down to the robe and the rolling crown */
    const w = sstep(0.9, 2.0, t);
    _a.copy(heap).setY(0.9); if (crown.g) _a.lerp(_b.copy(crown.p).setY(0.7), 0.6);
    H.lookAt.copy(look0).lerp(_a, w); H.lookAt.y = Math.max(1.0, H.lookAt.y);
    H.darkness = Math.max(0, H.darkness - dt * 0.4);
    flames.update(dt); fsmoke.update(dt); boneChips.update(dt);
  };
  const upd0 = H.update; H.update = (dt, st = {}) => { if (st.player) player = st.player; upd0(dt, st); };
  H.disposers.push(() => { crown.g?.removeFromParent(); cage.removeFromParent(); });
}

/* ---------------------------------------------------------------- the Dark Twin */
function dressTwin(actor, H, ctx, scene, accent, S) {
  /* the hero stands at least 2.15 m off the twin (the default 1.75 m put its shield and arm across the lower half of
     the view, its feet and its sword out of frame). Under its own attack start (reach 2.4 + 0.3) and the hero's. */
  if (!worldMod()) H.keepOut = 2.15;
  const heroLook = ctx.heroLook || { helm: 'great', cloak: true, tabard: true };
  const COLD = new THREE.Color(0xdde8ff);
  actor.look({ ...heroLook, eye: COLD.getHex(), eyePower: 1.2, vary: false });
  /* a black cracked mirror of the hero: no land colour on it, only a thin cold edge and the crack lines */
  const U = { rim: { value: COLD.clone() }, rimK: { value: 0.9 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(0xffffff) }, crackK: { value: 0.45 }, sweep: { value: -1 }, voidK: { value: 0.08 }, time: { value: 0 }, cut: { value: 99 } };
  const normalMap = actor.meshes.find((m) => /metal_plate/.test(m.material.name || ''))?.material.normalMap || null;
  const env = scene.environment || null; /* set it on the material, or three uses scene.environmentIntensity and ignores ours */
  const glass = glassMaterial(U, { normalMap, env }); const silk = glassMaterial(U, { cloth: true, env });
  /* the shield is one big flat plate: as a full mirror it shows the whole sky white, so it gets a dull clearcoat */
  const glassFlat = glassMaterial(U, { normalMap, env }); glassFlat.envMapIntensity = 0.06; glassFlat.clearcoat = 0.2; glassFlat.clearcoatRoughness = 0.25; glassFlat.roughness = 0.3;
  H.glassU = U; H.glass = glass;
  const orig = new Map();
  const toGlass = (m) => {
    const n = m.material.name || '';
    if (/SQ_Eyes|SQ_Void|SQ_Rune/.test(n) || m.userData.part === 'Eyes') return;
    orig.set(m, m.material);
    const cloth = /SQ_Cloth|SQ_Leather/.test(n) || ['Cloak', 'Tabard', 'Robe', 'Hood', 'Gloves'].includes(m.userData.part); /* a glass glove caught the sky as a pale, see-through hand: gloves take the dull cloth glass */
    m.material = cloth ? silk : glass;
  };
  for (const m of actor.meshes) toGlass(m);
  /* no full-body tint on a hit: the fight's flash becomes a 60 ms rim flash */
  actor.flash = () => { U.flash.value = 1; flashT = 0.06; };
  let flashT = 0;
  /* the eyes: two cold points behind the glass until the face breaks */
  let shattered = false; const eyes = actor.eyes.bind(actor);
  actor.eyes = (p) => eyes(shattered ? Math.max(Math.min(p, 9), 6) : Math.min(p, 2.2), COLD);
  actor.eyes(2);
  /* the hero's gear, in glass */
  const glassGear = new Set();
  const styleSlots = () => {
    for (const n of ['handslotr', 'handslotl', 'armslotl']) { const s = actor.slot(n); if (!s) continue; s.traverse((o) => { if (o.isMesh && !glassGear.has(o)) { glassGear.add(o); o.material = /SQ_Leather|SQ_Wood/.test(o.material.name || '') ? silk : (n === 'armslotl' ? glassFlat : glass); } }); }
  };
  if (ctx.heroGear && ctx.makeGear) {
    const slots = { 0: 'handslotr', 1: isShield(ctx.heroGear[1]) ? 'armslotl' : 'handslotl' };
    ctx.heroGear.forEach((name, i) => { if (!name) return; const s = actor.slot(slots[i]); if (!s || s.children.length) return;
      ctx.makeGear(name).then((g) => { if (ctx.mountGear) ctx.mountGear(g, name); s.add(g); styleSlots(); }); });
  }
  styleSlots();

  /* the inner face: under the glass helm, the hero's own helm in real steel */
  const helmPart = ['Helm_great', 'Helm_sallet', 'Helm_kettle', 'Hood'].find((p) => (actor.parts.get(p) || []).some((m) => m.visible));
  const inner = [];
  for (const m of actor.parts.get(helmPart) || []) {
    if (!m.visible) continue;
    const c = m.clone(); c.material = (orig.get(m) || m.material).clone(); c.visible = false; c.userData.part = 'TwinFace';
    if (c.material.color && /metal_plate/.test(c.material.name || '')) { c.material.color.set(0xd4d9e2); }
    m.parent.add(c); inner.push(c);
  }
  const breakPart = actor.breakPart.bind(actor);
  actor.breakPart = (name) => { if (death) return []; if (name === helmPart && !shattered) { shatter(); return []; } return breakPart(name); };

  /* pools: glass chips, cold sparks, hairline cracks that stay (the glass wears down), smoke */
  const SU = { edge: { value: 0.6 }, time: U.time, cold: { value: COLD.clone().multiplyScalar(0.9) } };
  const shardMat = edgeShardMaterial(SU, env); const shards = new Shards(scene, 90, slabShardGeometry(3, 0.2), shardMat, 0.12);
  const chips = new Shards(scene, 160, slabShardGeometry(7, 0.24), shardMat, 0.13); /* the death: small pieces */
  const slabs = new Shards(scene, 48, slabShardGeometry(11, 0.3), shardMat, 0.16); /* the death: big pieces of the body */
  const glow = new Particles(scene, 260, { additive: true });
  const smoke = new Particles(scene, 300, { map: wispTex(), near: [0.8, 2.6] });
  const cracks = []; let crackNext = 0;
  const crackMat = new THREE.MeshBasicMaterial({ map: glassCrackTex(), color: COLD.clone().multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false });
  const crackGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(crackGeo, crackMat.clone()); m.visible = false; m.frustumCulled = false; cracks.push(m); }
  let srcBones = null; const trailBones = [];
  const findBones = () => {
    srcBones = []; actor.model.traverse((o) => { if (o.isBone) srcBones.push(o); });
    for (const n of ['pelvis', 'spine_03', 'Head', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r']) { const b = boneOf(actor, n); if (b) trailBones.push(b); }
  };
  const helmDrop = { g: null, p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), rest: false, r: 0.15 };
  H.disposers.push(() => { shards.dispose(); chips.dispose(); slabs.dispose(); glow.dispose(); smoke.dispose(); for (const c of cracks) c.removeFromParent(); for (const c of inner) c.removeFromParent(); helmDrop.g?.removeFromParent(); });

  const white = new THREE.Color(1.35, 1.4, 1.55); const cold = COLD.clone().multiplyScalar(1.1); const smokeCol = new THREE.Color(0x07080b); const smokeCol2 = new THREE.Color(0x14161c); const smokeThin = new THREE.Color(0x1d2129);
  const shatter = () => {
    if (shattered) return; shattered = true;
    for (const m of actor.parts.get(helmPart) || []) m.visible = false;
    for (const p of ['Horns', 'Crown']) for (const m of actor.parts.get(p) || []) m.visible = false;
    for (const c of inner) c.visible = true;
    headPos(actor, _a);
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; const b = Math.random() * 1.2 - 0.2; const sp = 2 + Math.random() * 5; shards.emit(_a.x + Math.cos(a) * 0.12, _a.y + 0.05, _a.z + Math.sin(a) * 0.12, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp, 0.04 + Math.random() * 0.08, 3 + Math.random() * 2, 20); }
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; const sp = 1 + Math.random() * 4; glow.emit(_a.x, _a.y, _a.z, Math.cos(a) * sp, (Math.random() - 0.3) * 4, Math.sin(a) * sp, Math.random() < 0.5 ? white : cold, 0.4 + Math.random() * 0.4, 0.045, 0.015, 1, 3, 2, false); }
    eyes(8, COLD); U.flash.value = 1.2; flashT = 0.1;
  };
  const addCrack = (point, size) => {
    /* the nearest bone carries the crack; it faces out from the body's axis */
    actor.root.updateMatrixWorld(true);
    let best = null; let bd = 1e9; for (const b of srcBones || []) { b.getWorldPosition(_a); const d = _a.distanceToSquared(point); if (d < bd) { bd = d; best = b; } }
    if (!best) return;
    const m = cracks[crackNext]; crackNext = (crackNext + 1) % cracks.length;
    _b.set(actor.root.position.x, point.y, actor.root.position.z); _c.subVectors(point, _b); if (_c.lengthSq() < 1e-6) _c.set(0, 0, 1); _c.normalize();
    _d.copy(point).addScaledVector(_c, 0.02);
    best.add(m); best.worldToLocal(m.position.copy(_d));
    _q.setFromUnitVectors(ZAX, _c); _q.multiply(_q2.setFromAxisAngle(ZAX, Math.random() * 6.28)); best.getWorldQuaternion(_q2); m.quaternion.copy(_q2.invert().multiply(_q));
    best.getWorldScale(_a); m.scale.setScalar(size / Math.max(1e-3, _a.x)); m.visible = true; m.material.opacity = 0.6; m.userData.t = 0;
  };
  /* a hit: a short spray of sparks and glass chips from the point (nothing big over the boss), a hairline crack stays */
  H.onHit = (point, heavy = false) => {
    if (!srcBones) findBones();
    U.flash.value = heavy ? 1.2 : 0.8; flashT = 0.06;
    if (point) {
      addCrack(point, heavy ? 0.22 : 0.14);
      actor.root.updateMatrixWorld(true); _c.set(point.x - actor.root.position.x, 0, point.z - actor.root.position.z).normalize();
      for (let i = 0; i < (heavy ? 22 : 12); i++) { const a = Math.atan2(_c.z, _c.x) + (Math.random() - 0.5) * 2.2; const sp = 1.5 + Math.random() * 3.5; shards.emit(point.x, point.y, point.z, Math.cos(a) * sp, 0.5 + Math.random() * 3, Math.sin(a) * sp, 0.025 + Math.random() * 0.045, 2.2, 18); }
      for (let i = 0; i < (heavy ? 26 : 14); i++) { const a = Math.atan2(_c.z, _c.x) + (Math.random() - 0.5) * 2.6; const sp = 2 + Math.random() * 5; glow.emit(point.x, point.y, point.z, Math.cos(a) * sp, (Math.random() - 0.1) * 3.5, Math.sin(a) * sp, Math.random() < 0.6 ? white : cold, 0.18 + Math.random() * 0.16, 0.03, 0.01, 1, 9, 2, false); }
    }
    if (heavy && !shattered) { shatter(); return { slow: 0.55, flash: 0.2, shattered: true }; }
    return { slow: 0, flash: 0 };
  };
  H.onParry = (point, dir) => {
    if (!point) return {};
    /* two bursts of sparks, one the mirror of the other across the line between the blades */
    const side = _a.set(dir ? -dir.z : 1, 0, dir ? dir.x : 0).normalize();
    for (let i = 0; i < 22; i++) {
      const sp = 3 + Math.random() * 5; const up = (Math.random() - 0.3) * 4; const fw = (Math.random() - 0.5) * 3;
      const vx = side.x * sp + (dir ? dir.x * fw : 0); const vz = side.z * sp + (dir ? dir.z * fw : 0);
      glow.emit(point.x, point.y, point.z, vx, up, vz, white, 0.32, 0.04, 0.01, 1, 7, 2, false);
      glow.emit(point.x, point.y, point.z, -vx + (dir ? 2 * dir.x * fw : 0), up, -vz + (dir ? 2 * dir.z * fw : 0), cold, 0.32, 0.04, 0.01, 1, 7, 2, false);
    }
    U.flash.value = 0.6; flashT = 0.05;
    return { slow: 0.3, flash: 0.12 };
  };

  /* ---- death, built for the death camera (fov 44, hero 3.4-6 m away, card at about 3.5-4 s):
     0-0.6 s cracks race over the body with cold light inside, it sinks to its knees; 0.6-1.6 s it breaks from the top
     down: a cut sweeps from the crown to the chest, big thick pieces of black glass fall off it and the hero's own helm
     (real steel) drops in front of it; 1.6 s on the kneeling lower body stays as a broken shell with a glowing torn
     edge, the shards on the ground glint, the helm rests upright in the middle of the view. */
  let death = null; let player = null; const look0 = new THREE.Vector3(); const body0 = new THREE.Vector3(); const fwd = new THREE.Vector3();
  H.warmMats = H.warmMats || []; for (const c of inner) H.warmMats.push(c);
  const CUT0 = 1.95 * S; const CUT1 = 0.78 * S;
  /* the helm's visor slit material is made now and warmed with the rest, so the drop never stalls on a first draw */
  const slitMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.9, metalness: 0 }); H.warmMats.push(slitMat); H.disposers.push(() => slitMat.dispose());
  H.onDeath = (pos) => {
    if (death) return death.dur;
    if (!srcBones) findBones();
    death = { t: 0, dur: 4.6, kneel: false, frozen: false, helm: false, cutPrev: CUT0 }; look0.copy(H.lookAt);
    body0.copy(actor.root.position).setY(0);
    const p = actor.root.position; const yaw = player ? Math.atan2(player.x - p.x, player.z - p.z) : actor.root.rotation.y; fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    for (const m of actor.meshes) m.castShadow = false;
    for (const c of cracks) c.visible = false;
    /* the death camera stands keepOut + 2.6 m back (about 4.8 m): the view may tilt down only a little, so from there the
       kneeling remains and the helm sit inside the frame instead of under its bottom edge */
    H.keepOut = 2.2;
    void pos; return death.dur;
  };
  /* the hero's helm: baked in real steel, given a clear visor slit and a crest so it reads as a great helm at 4 m */
  const helmArc = { p0: new THREE.Vector3(), p1: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), t: -1 };
  const dropHelm = () => {
    actor.root.updateMatrixWorld(true);
    if (!shattered) for (const c of inner) c.visible = true;
    const pieces = []; for (const c of inner) { if (!c.visible) continue; pieces.push(bakeSkinned(c)); c.visible = false; }
    for (const m of actor.parts.get(helmPart) || []) m.visible = false;
    /* the parts that are not glass (eyes, the dark visor hollow) go with the head */
    for (const m of actor.meshes) if (m.visible && m.material !== glass && m.material !== silk) m.visible = false;
    /* the glass sword and shield break apart in the hand */
    for (const o of glassGear) { if (!o.visible) continue; o.getWorldPosition(_a); for (let i = 0; i < 3; i++) slabs.emit(_a.x + (Math.random() - 0.5) * 0.3, _a.y, _a.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 1.2, 0.5 + Math.random(), (Math.random() - 0.5) * 1.2, 0.1 + Math.random() * 0.1, 30, 5); }
    if (!pieces.length) return;
    const g = new THREE.Group(); const cc = new THREE.Vector3(); for (const m of pieces) cc.add(m.position); cc.multiplyScalar(1 / pieces.length);
    for (const m of pieces) { m.position.sub(cc); m.castShadow = true; g.add(m); }
    const box = new THREE.Box3().setFromObject(g); const sz = box.getSize(new THREE.Vector3());
    if (helmPart === 'Helm_great') {
      const dark = slitMat; const steel = pieces[0].material;
      const yawH = Math.atan2(fwd.x, fwd.z); const depth = Math.max(sz.x, sz.z);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.62, sz.y * 0.07, 0.04), dark); slit.rotation.y = yawH; slit.position.copy(fwd).multiplyScalar(depth * 0.5 - 0.012); slit.position.y = sz.y * 0.1; g.add(slit);
      const slit2 = new THREE.Mesh(new THREE.BoxGeometry(sz.y * 0.05, sz.y * 0.3, 0.04), dark); slit2.rotation.y = yawH; slit2.position.copy(fwd).multiplyScalar(depth * 0.5 - 0.01); slit2.position.y = -sz.y * 0.08; g.add(slit2);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.03, sz.y * 0.1, depth * 0.8), steel); crest.rotation.y = yawH; crest.position.y = sz.y * 0.47; g.add(crest);
      H.disposers.push(() => { slit.geometry.dispose(); slit2.geometry.dispose(); crest.geometry.dispose(); });
    }
    g.scale.setScalar(1.45); g.position.copy(cc); scene.add(g); helmDrop.g = g; helmDrop.p.copy(cc);
    /* it drops forward off the shoulders and lands upright 1.3 m in front, its face to the hero, tipped back a little */
    const r = sz.y * 1.45 * 0.5; helmArc.p0.copy(cc); _b.set(fwd.z, 0, -fwd.x); helmArc.p1.copy(body0).addScaledVector(fwd, 0.1 * S).addScaledVector(_b, (Math.random() < 0.5 ? -1 : 1) * 0.85 * S).setY(r * 0.92); /* beside the remains, not in front of them */
    helmArc.q0.identity(); _a.set(fwd.z, 0, -fwd.x); helmArc.q1.setFromAxisAngle(_a, -0.32).multiply(_q.setFromAxisAngle(UP, (Math.random() - 0.5) * 0.5)); helmArc.t = 0;
  };
  const rockQ = new THREE.Quaternion(); const rockAx = new THREE.Vector3();
  const updateHelm = (dt) => {
    const D = helmDrop; if (!D.g || helmArc.t < 0) return; helmArc.t += dt; const T = 0.75; const u = Math.min(1, helmArc.t / T);
    /* a short fall: an arc with gravity's ease-in, turning as it falls */
    D.p.lerpVectors(helmArc.p0, helmArc.p1, u); D.p.y = helmArc.p0.y + (helmArc.p1.y - helmArc.p0.y) * u * u + 0.25 * Math.sin(u * Math.PI) * (1 - u);
    D.g.quaternion.slerpQuaternions(helmArc.q0, helmArc.q1, sstep(0, 1, u));
    if (u >= 1) { const b = helmArc.t - T; if (!D.landed) { D.landed = true; H.shake = Math.max(H.shake, 0.12); rockAx.set(fwd.z, 0, -fwd.x);
        for (let i = 0; i < 12; i++) glow.emit(D.p.x, 0.05, D.p.z, (Math.random() - 0.5) * 2.4, Math.random() * 1.6, (Math.random() - 0.5) * 2.4, cold, 0.25, 0.03, 0.01, 1, 8, 1, false);
        for (let i = 0; i < 10; i++) smoke.emit(D.p.x + (Math.random() - 0.5) * 0.4, 0.06, D.p.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, 0.1, (Math.random() - 0.5) * 0.8, smokeThin, 1.4, 0.2, 0.8, 0.22, 0, 1.5); }
      rockQ.setFromAxisAngle(rockAx, 0.2 * Math.exp(-b * 2.2) * Math.sin(b * 9)); D.g.quaternion.copy(rockQ).multiply(helmArc.q1); }
    D.g.position.copy(D.p);
  };
  /* pieces fall off where the cut passes: big slabs from the bones it crosses, small chips between */
  const breakAt = (y0, y1) => {
    for (const b of srcBones) { b.getWorldPosition(_a); if (_a.y > y0 || _a.y <= y1) continue;
      _b.set(_a.x - body0.x, 0, _a.z - body0.z); if (_b.lengthSq() < 1e-4) _b.set(Math.random() - 0.5, 0, Math.random() - 0.5); _b.normalize();
      const n = 1 + (Math.random() < 0.6 ? 1 : 0);
      for (let i = 0; i < n; i++) { const sp = 0.4 + Math.random() * 1.1; slabs.emit(_a.x + _b.x * 0.08, _a.y + 0.04, _a.z + _b.z * 0.08, _b.x * sp + fwd.x * 0.35, 0.4 + Math.random() * 1.2, _b.z * sp + fwd.z * 0.35, 0.16 + Math.random() * 0.14, 30, 4); }
      for (let i = 0; i < 3; i++) { const sp = 0.8 + Math.random() * 1.8; chips.emit(_a.x, _a.y, _a.z, _b.x * sp + (Math.random() - 0.5), 0.6 + Math.random() * 1.6, _b.z * sp + (Math.random() - 0.5), 0.05 + Math.random() * 0.07, 30, 8); }
      glow.emit(_a.x, _a.y, _a.z, _b.x * 0.6, 0.4, _b.z * 0.6, cold, 0.5, 0.05, 0.015, 0.8, 2, 1.5, false); }
  };
  const updateDeath = (dt) => {
    const D = death; D.t += dt; const t = D.t;
    /* 0-0.6: cracks race over the body, light rises inside them, it goes down on its knees */
    const k = sstep(0, 0.6, t); U.crackK.value = 0.45 + 1.15 * k; U.voidK.value = 0.08 + 0.3 * k; U.rimK.value = 0.9 + 0.2 * k; actor.eyes(9);
    U.sweep.value = 2.2 - 3.0 * sstep(0, 0.6, t); /* the glint runs down the body with the cracks */
    if (!D.kneel && t > 0.05) { D.kneel = true; actor.play('Fixing_Kneeling', { loop: false, fade: 0.25, restart: true, speed: 1.35 }); }
    if (D.kneel && !D.frozen && t > 0.05 + KNEEL_AT / 1.35) { D.frozen = true; actor.setSpeed(0); }
    /* 0.6-1.6: it breaks from the top down */
    const c = t < 0.6 ? 99 : CUT0 + (CUT1 - CUT0) * sstep(0.6, 1.6, t); U.cut.value = c;
    if (t >= 0.6) { actor.root.updateMatrixWorld(true); if (c < D.cutPrev) { breakAt(D.cutPrev, c); D.cutPrev = c; } }
    if (t >= 0.6 && !D.helm) { D.helm = true; dropHelm(); for (const o of glassGear) o.visible = false; U.flash.value = 0.6; flashT = 0.08; H.shake = Math.max(H.shake, 0.25); }
    /* thin dark smoke off the torn edge while it breaks, then a faint thread */
    if (t > 0.6 && t < 3.4) { D.smokeAcc = (D.smokeAcc || 0) + dt * (t < 1.6 ? 40 : 8);
      while (D.smokeAcc >= 1) { D.smokeAcc -= 1; const a = Math.random() * 6.28;
        smoke.emit(body0.x + Math.cos(a) * 0.22 * S, Math.min(c, CUT0) + 0.02, body0.z + Math.sin(a) * 0.22 * S, (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, Math.random() < 0.5 ? smokeThin : smokeCol2, 1.4 + Math.random(), 0.15, 0.7, 0.18, -0.1, 0.8, false); } }
    /* 1.6 on: the shell stays dark, the edge and the cracks keep a low cold light, the ground shards glint */
    if (t > 1.6) { const e = sstep(1.6, 2.6, t); U.crackK.value = 1.6 - 1.35 * e; U.voidK.value = 0.38; U.rimK.value = 1.1 - 0.75 * e; }
    SU.edge.value += (0.3 - SU.edge.value) * Math.min(1, dt * 1.1);
    updateHelm(dt);
    /* the view: chest height of the remains, drawn toward the helm once it is down */
    { const w = sstep(0.5, 1.6, t); _a.copy(body0).lerp(helmArc.t >= 0 ? helmArc.p1 : body0, 0.45).setY(1.0 * S); H.lookAt.copy(look0).lerp(_a, w); H.lookAt.y = Math.max(H.lookAt.y, 0.95 * S); }
  };

  let smokeAcc = 0; let sweepAcc = 0;
  H.update = (dt, st = {}) => {
    H.time += dt;
    if (!srcBones) findBones();
    if (glassGear.size === 0 || Math.random() < dt * 2) styleSlots();
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) U.flash.value = 0; }
    actor.root.updateMatrixWorld(true);
    if (!death) headPos(actor, H.lookAt);
    /* a smoke trail off the body while it moves or strikes, a little even at rest */
    if (!death && !st.dead) {
      const k = (st.moving || st.attacking || st.dodging) ? 1 : 0.18; smokeAcc += dt * 70 * k;
      while (smokeAcc >= 1) { smokeAcc -= 1; const b = trailBones[Math.floor(Math.random() * trailBones.length)]; if (!b) break; b.getWorldPosition(_a);
        smoke.emit(_a.x + (Math.random() - 0.5) * 0.12, _a.y + (Math.random() - 0.5) * 0.12, _a.z + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.4, 0.35 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4, Math.random() < 0.6 ? smokeCol : smokeCol2, 1.0 + Math.random() * 0.8, 0.14, 0.7, 0.62, -0.15, 1.4, false);
        if (Math.random() < 0.08) glow.emit(_a.x, _a.y, _a.z, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, cold, 0.9, 0.025, 0.01, 0.7, -0.2, 0.5, false); }
    }
    if (st.player) player = st.player; U.time.value = H.time;
    /* the glint sweeps across the body, faster while it moves or strikes; a pause off the body between sweeps */
    sweepAcc += dt * ((st.moving || st.attacking) ? 1.5 : 0.35); U.sweep.value = (sweepAcc % 3.2) - 0.6;
    if (death) updateDeath(dt);
    for (const m of cracks) { if (!m.visible) continue; m.userData.t += dt; m.material.opacity = 0.14 + 0.46 * Math.exp(-m.userData.t * 3); }
    if (!death) U.rimK.value = 0.9 + (shattered ? 0.1 : 0);
    shards.update(dt); chips.update(dt); slabs.update(dt); glow.update(dt); smoke.update(dt);
  };
}

/* ================================================================ skyNemesis */
/* The dark nemeses on the horizon, built like the four worlds' far figures (worlds/sky-figure.js): the real rig in the boss's
   own look at a real giant's size, standing on the land, one dark rim-lit silhouette that fades with the line.
   the far giant was the plain knight rig in a sallet, about foe size on screen and above the horizon.
   giant: 64 m, hunched on short legs with the giant's own proportions (the same bone scales as the fight), the horned helm,
          the maul dragged in the right hand with its head on the ground, a dim furnace line behind the visor, ground mist.
   lich:  38 m, the shroud and sleeves moving in a wind, the staff planted, two cold points in the hood.
   twin:  32 m, the great helm and the cloak in the wind, the sword held point down.
   The dragon keeps its own far shape (world.js). world.js calls this for the dark world .
   skyNemesis(id, ctx) -> Promise<{ object, update, dispose, dist }> | null */
/* ================================================================ dark foes
   dressFoe(actor, foeId, ctx): the dark world's own foe dress, the same hook as a world module's dressFoe (fight.js calls
   it once after look() and the gear; it returns null, as nothing needs a per-frame update). The dark world has no world
   module, so fight.js must call it when worldMod() has no dressFoe.
   Black armour on a night scene with no rim light loses its edges against the dark hills; the Brute was the
   same black knight body with a maul, and the Thrall's wide-brim hat read as a pilgrim toy.
   - every foe: a cold moonlit rim on every plate and cloth (fresnel, wider and brighter than world.js's key rim), so the
     outline reads against snow, mud or black hills at phone size
   - Hollow Thrall: no kettle hat. A bare skull on the mail coif, no cloak, no pauldrons: a dead man in rags, a horror, not a toy
   - Hollow Guard: unchanged shape (it reads well: great helm, shield, tabard)
   - Hollow Brute: its own heavy frame. Broad chest and shoulders, thick arms on big fists, head sunk low, a deep hunch,
     horns on the great helm: a hunched ogre in plate, not a big knight */
const FOE_RIM = { col: { value: new THREE.Color(0.34, 0.44, 0.58) } };
const DRIM = new WeakMap(); /* the rim strength by material, so a corpse can lose its rim (a body lying face up caught it on every plate) */
function darkRim(mat, k) {
  if (!mat || mat.blending === THREE.AdditiveBlending) return; if (DRIM.has(mat)) { DRIM.get(mat).value = k; return; } mat.userData.sqDarkRim = true;
  const u = { value: k }; DRIM.set(mat, u);
  postChain(mat, 'sq-darkrim', (sh) => {
    if (!sh.fragmentShader.includes('#include <opaque_fragment>')) return;
    sh.uniforms.sqDRimCol = FOE_RIM.col; sh.uniforms.sqDRimK = u;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 sqDRimCol; uniform float sqDRimK;')
      .replace('#include <opaque_fragment>', `{ float sqDF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.4);
          outgoingLight += sqDRimCol * sqDF * sqDRimK * (0.55 + 0.45 * smoothstep(-0.2, 0.6, normal.y)); }
        #include <opaque_fragment>`);
  });
}
/* the finish is
   worldly now (worlds/foe-look.js matte: iron is rough and dark, the body mail and quilt are matte, nothing mirrors the
   room light). Every kind has three seeded variants (head, cloth, rags, build, stance) and a captain has rank marks:
   an oxblood cape and crest, and the brute captain a war banner. The cold rim stays, narrower, so the outline still reads
   against the night without the plastic sheen. */
const DARK_CLOTH = [0x4a1e16, 0x4e4434, 0x3c3e30, 0x5a4a34];
const DARK_RANK = 0x5a1210;
/* worn iron, not polished steel: a light steel colour mirrored the night sky off every plate that faced up (a corpse) */
const DARK_IRON = [0x4e4a44, 0x46403a, 0x55524e, 0x4a3e34];
/* rust, mud, soot, frost per dark land (world.js LAND_GRIME, with more rust and soot on a foe) */
const DARK_GRIME = { drownedfen: [0.95, 0.9, 0.3, 0, 0x262a18], vinewild: [0.8, 0.7, 0.3, 0, 0x22261a], barrowmoor: [0.6, 0.6, 0.45, 0.22, 0x34302a], dusksteppe: [0.65, 0.55, 0.35, 0, 0x5a4028],
  ashlands: [0.5, 0.35, 0.95, 0, 0x3a3430], frostpass: [0.45, 0.2, 0.25, 0.7, 0x4a525a], deepwood: [0.8, 0.75, 0.3, 0, 0x1e2414], stormcoast: [1, 0.3, 0.25, 0, 0x5a5a56] };
const DARK_VAR = {
  minion: [
    { look: { helm: 'none', skull: true, cloak: false, pauldrons: false, tabard: true }, rags: ['mantle', 'hips'], hunch: 0.26 },
    { look: { helm: 'hood', skull: true, cloak: false, pauldrons: false, tabard: false }, rags: ['hips'], hunch: 0.34 },
    { look: { helm: 'sallet', cloak: false, pauldrons: true, tabard: true }, rags: ['hips'], hunch: 0.16 },
  ],
  warrior: [
    { look: { helm: 'great', cloak: true, tabard: true } },
    { look: { helm: 'sallet', cloak: false, tabard: true }, rags: ['mantle'] },
    { look: { helm: 'great', cloak: false, tabard: true, heavy: true }, rags: ['hips'] },
  ],
  rogue: [
    { look: { helm: 'hood', cloak: true, tabard: false } },
    { look: { helm: 'hood', cloak: false, tabard: false }, rags: ['mantle', 'hips'] },
    { look: { helm: 'hood', cloak: true, tabard: true, pauldrons: false }, rags: ['hips'] },
  ],
  brute: [
    { look: { helm: 'great', horns: true, heavy: true, cloak: false } },
    { look: { helm: 'sallet', horns: true, heavy: true, cloak: false }, rags: ['hips'] },
    { look: { helm: 'great', horns: false, crown: false, heavy: true, cloak: false }, rags: ['mantle', 'hips'] },
  ],
};
const DARK_STYLE = {
  matte: { metal: { rough: 0.62, metal: 0.7, env: 0.22 }, body: { rough: 0.86, metal: 0.15, env: 0.14 } }, value: { metal: 0.9, body: 0.85 },
  rank(actor, foeId, kit, R) {
    const out = [kit.cape(actor, DARK_RANK, { len: foeId === 'minion' ? 0.85 : 1.1, torn: 0.18, seed: 9 })];
    const h = actor.lastLook?.helm;
    if (h === 'great' || h === 'sallet') out.push(kit.crest(actor, DARK_RANK, { tall: 0.2, y: h === 'great' ? 1.9 : 1.86 }));
    if (foeId === 'brute' || foeId === 'warrior') out.push(kit.banner(actor, DARK_RANK, { mark: 0xb8a070, seed: 4 }));
    if (foeId !== 'brute') out.push(kit.pauldrons(actor, 0x4a3a30, { r: 0.15, trim: 0x8a7040 }));
    return out;
  },
};
export function dressFoe(actor, foeId, ctx = {}) {
  if (!actor?.meshes || worldMod()) return null;
  const V = DARK_VAR[foeId]; if (!V) return null;
  const R = foeRng(ctx, foeId); const v = V[R.variant(V.length)];
  const g = DARK_GRIME[ctx.biome] || DARK_GRIME.deepwood;
  const cloth = R.pick(DARK_CLOTH);
  if (actor.lastLook) actor.look({ ...actor.lastLook, ...v.look, cls: { minion: 'thrall', warrior: 'guard', rogue: 'stalker', brute: 'brute' }[foeId], cloth: ctx.captain ? 0x2a0b0e : cloth, steel: ctx.captain ? 0x4a2e28 : R.pick(DARK_IRON),
    grime: { k: g.slice(0, 4), mud: g[4], dye: cloth } });
  const extras = [];
  for (const at of v.rags || []) extras.push(rankKit.rags(actor, R.pick(DARK_CLOTH), { at, seed: 3 + Math.floor(R.r() * 5), n: at === 'hips' ? 7 : 6 }));
  let unbuild = null;
  if (foeId === 'brute') {
    const B = { ...HEAVY, spine_03: 1.16, neck_01: 0.82, hand_l: 1.3, hand_r: 1.3 };
    unbuild = build(actor, B);
    const head = fBone(actor, 'Head'); const hp = head?.position.clone();
    if (head) { const mu = actor.mixer.update; actor.mixer.update = (dt) => { const r = mu(dt); head.position.copy(hp).multiplyScalar(0.6); return r; }; }
    if (actor.posture) { actor.posture.hunch = 0.4 + R.r() * 0.14; actor.posture.lift = -actor.posture.hunch * 0.85; }
  } else if (actor.posture && v.hunch != null) { actor.posture.hunch = v.hunch + R.jit(0.06); actor.posture.lift = -actor.posture.hunch * 0.75; actor.posture.tilt *= 1.4; }
  if (actor.model && foeId !== 'brute') { const s = actor.model.scale; const k = R.range(0.95, 1.06); s.set(s.x * R.range(0.95, 1.07), s.y * k, s.z * R.range(0.95, 1.07)); }
  const fin = finishFoe(actor, foeId, ctx, DARK_STYLE, R);
  for (const m of actor.meshes) {
    if (m.userData.part === 'Eyes' || m.userData.glow || /SQ_Eyes|SQ_Void/.test(m.material?.name || '')) continue;
    darkRim(m.material, foeId === 'brute' ? 0.24 : 0.2);
  }
  actor.root.traverse((o) => { if (o.isMesh && /^Rank|^Rags/.test(o.userData.part || '')) darkRim(o.material, 0.2); });
  return { update: (dt, s) => fin.update(dt, s), onDeath() { actor.root.traverse((o) => { if (o.isMesh && DRIM.has(o.material)) DRIM.get(o.material).value = 0; }); }, dispose() { fin.dispose(); unbuild?.(); for (const e of extras) e.obj.removeFromParent(); } };
}

const SKY = {
  giant: { height: 64, dist: 250, clip: 'Zombie_Idle_Loop', speed: 0.3, stance: 0.2, arms: [0.22, 0.16], lean: 0.16, crown: 0.42, wind: ['Tabard'], windAmp: 0.05, dust: 0x3a4a4e, dustOp: 0.55, dustN: 16, sink: 0.03 },
  lich: { height: 38, dist: 220, clip: 'Spell_Simple_Idle_Loop', speed: 0.35, stance: 0.06, arms: [0.12, 0.1], lean: 0.04, crown: 0.36, wind: ['Shroud', 'Sleeves'], windAmp: 0.1, windTop: 1.25, windBottom: 0.1, dust: 0x3c4a50 },
  twin: { height: 32, dist: 210, clip: 'Sword_Idle', speed: 0.35, stance: 0.15, arms: [0.1, 0.18], lean: 0.05, crown: 0.3, wind: ['Cloak', 'Tabard'], windAmp: 0.12, dust: 0x4a5258 },
};
export async function skyNemesis(id, ctx) {
  const o = SKY[id]; if (!o) return null;
  const { skyFigure } = await import('./worlds/sky-figure.js');
  const look = id === 'giant' ? BOSS_LOOK.giant : id === 'lich' ? BOSS_LOOK.lich : { helm: 'great', cloak: true, tabard: true, crown: true };
  const glowCol = new THREE.Color(ctx.accent ?? 0xff4a12);
  /* the giant's proportions (dressGiant shape()): rest positions are read on the first pose */
  let rest = null;
  const giantPose = (actor, B) => {
    const b = { s3: B('spine_03'), s2: B('spine_02'), neck: B('neck_01'), head: B('Head'), ul: B('upperarm_l'), ur: B('upperarm_r'), hl: B('hand_l'), hr: B('hand_r'), tl: B('thigh_l'), tr: B('thigh_r') };
    if (!rest) rest = { head: b.head?.position.clone(), ul: b.ul?.position.clone(), ur: b.ur?.position.clone() };
    b.s3?.scale.setScalar(1.16); b.s2?.scale.setScalar(1.06); b.neck?.scale.setScalar(0.8);
    if (b.head && rest.head) b.head.position.copy(rest.head).multiplyScalar(0.15);
    for (const [u, r0] of [[b.ul, rest.ul], [b.ur, rest.ur]]) if (u && r0) { u.position.copy(r0).multiplyScalar(1.55); u.scale.setScalar(1.12); }
    b.hl?.scale.setScalar(1.6); b.hr?.scale.setScalar(1.6); b.tl?.scale.set(1.12, 0.94, 1.12); b.tr?.scale.set(1.12, 0.94, 1.12);
  };
  /* far weapons (metres at human size, grip at the origin, along -y) */
  const maul = (T, mat, geos) => { const g = new T.Group();
    const h = new T.CylinderGeometry(0.05, 0.06, 1.35, 6); h.translate(0, -0.62, 0); geos.push(h); g.add(new T.Mesh(h, mat));
    const hd = new T.BoxGeometry(0.7, 0.42, 0.42); hd.translate(0, -1.3, 0); geos.push(hd); g.add(new T.Mesh(hd, mat));
    const sp = new T.ConeGeometry(0.07, 0.24, 5); sp.rotateZ(Math.PI / 2); sp.translate(-0.46, -1.3, 0); geos.push(sp); g.add(new T.Mesh(sp, mat));
    return g; };
  const staff = (T, mat, geos) => { const g = new T.Group();
    const h = new T.CylinderGeometry(0.025, 0.03, 2.1, 6); h.translate(0, -0.25, 0); geos.push(h); g.add(new T.Mesh(h, mat));
    const k = new T.TorusGeometry(0.11, 0.025, 4, 8, Math.PI * 1.3); k.translate(0, 0.86, 0); geos.push(k); g.add(new T.Mesh(k, mat));
    return g; };
  const sword = (T, mat, geos) => { const g = new T.Group();
    const bl = new T.BoxGeometry(0.06, 1.0, 0.012); bl.translate(0, -0.6, 0); geos.push(bl); g.add(new T.Mesh(bl, mat));
    const gd = new T.BoxGeometry(0.26, 0.035, 0.04); gd.translate(0, -0.08, 0); geos.push(gd); g.add(new T.Mesh(gd, mat));
    return g; };
  /* the eyes: a furnace line behind the giant's visor, two cold points in the lich's hood */
  const eyes = ({ add, sprite, H, headPos }) => {
    const M = H / 1.9; const P = new THREE.Vector3();
    const pts = id === 'giant' ? [[0, 0.07, 0.22, 0.09]] : id === 'lich' ? [[-0.032, 0.06, 0.13, 0.035], [0.032, 0.06, 0.13, 0.035]] : [];
    const sps = pts.map(([, , , s]) => { const sp = sprite(id === 'lich' ? 0x9fd8ff : glowCol.getHex(), M * s, { add: true, fog: false }); add(sp); return sp; });
    return { update(dt, t, f) { headPos(P); sps.forEach((sp, i) => { const [x, y, z] = pts[i]; sp.position.set(P.x + x * M, P.y + y * M, P.z + z * M); sp.material.opacity = f * (0.5 + 0.25 * Math.sin(t * 0.8 + i)); }); } };
  };
  const hide = id === 'lich' ? LICH_HIDE : ['GiantPauldronL_2', 'GiantPauldronR_2'];
  return skyFigure(ctx, {
    dustOp: 0.38, dustN: 12, ...o, look, color: 0x0c0b0d,
    weapon: id === 'giant' ? maul : id === 'lich' ? staff : sword,
    weaponRot: id === 'giant' ? [-0.25, 0, -0.5] : id === 'lich' ? [0.05, 0, -0.12] : [0.1, 0, -0.25],
    pose: id === 'giant' ? giantPose : null,
    extras: (x) => {
      /* parts the boss never shows in the fight leave the far figure too */
      for (const m of x.actor.meshes) if (hide.includes(m.userData.part) || hide.includes(m.name)) m.visible = false;
      return eyes(x);
    },
  });
}

/* one finish for every plain foe in every world. Each world's dressFoe picks its variant and then calls
   finishFoe(actor, foeId, ctx, style) last. What made the foes look plain:
   - Gloss. look() gives plate steel envMapIntensity 1.5 and its scan roughness, the knight body is a smooth 0.7 / 0.25
     metal mannequin, and every material reflects scene.environment (a bright RoomEnvironment). At night the foes read as
     glossy crash-test dummies, and a corpse lying face up mirrors that white room: white limbs.
     matte(): a roughness floor, a metal cap and an env cap per material class (cloth, skin, leather, metal), kept through
     every later look() call, so plate reads as worn iron and cloth as cloth.
   - Clones. Every foe of a kind was the same figure. A seeded variant (foeRng) picks head, hat, colour, build and stance.
   - Ranks. A captain was the same model at 1.18 x scale. rankKit builds rank marks in code (cape, back banner, crest,
     big pauldrons, sash, badge) in the world's rank colour; each world picks its recipe.
   - The bind pose. A foe that joined the scene during a cinema (no mixer update yet) stood in a T-pose for a frame or
     more. settle() poses it in its idle at once.
   Everything here is built on the actor's bones (bind space, +z forward, y up, unit rig), so it follows every clip and
   stays on the corpse. */
import * as THREE from 'three';

/* ---------------------------------------------------------------- seeds */
let SEQ = 0;
const hashS = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* one seeded stream per foe: ctx.seed (a test) or the spawn order; variant() turns the seed into 0..n-1 so a
   pack takes the variants in turn (never two of one in a pack of three) */
const TURN = new Map();
export function foeRng(ctx, foeId) {
  const seed = ctx?.seed != null ? Number(ctx.seed) : hashS(foeId) + (++SEQ) * 7919;
  const r = mulberry(seed ^ hashS(foeId));
  const out = { seed, r, pick: (a) => a[Math.floor(r() * a.length) % a.length], range: (a, b) => a + r() * (b - a), jit: (k) => (r() - 0.5) * 2 * k };
  out.variant = (n) => {
    if (ctx?.seed != null) return Math.abs(Math.floor(Number(ctx.seed) / 11)) % n; /* a seeded test: seeds 11, 22, 33 -> 1, 2, 0 */
    const k = `${foeId}|${n}`; const t = TURN.has(k) ? TURN.get(k) : Math.floor(Math.random() * n); TURN.set(k, t + 1); return t % n;
  };
  return out;
}

/* ---------------------------------------------------------------- bones */
const _m = new THREE.Matrix4(); const _s = new THREE.Vector3(); const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion(); const _q3 = new THREE.Quaternion(); const _X = new THREE.Vector3(1, 0, 0);
export function boneOf(actor, name) { let b = null; actor.root.traverse((n) => { if (!b && n.isBone && n.name === name) b = n; }); return b; }
function skinFor(actor, bone) { let s = null; actor.root.traverse((o) => { if (!s && o.isSkinnedMesh && o.skeleton.bones.includes(bone)) s = o; }); return s; }
/* an Object3D on a bone whose local frame is the bind (T-pose) frame: children placed at bind positions follow the bone */
export function bindFrame(actor, boneName, at = new THREE.Vector3()) {
  const o = new THREE.Object3D(); const bone = boneOf(actor, boneName); const sk = bone && skinFor(actor, bone);
  if (!bone || !sk) { actor.model.add(o); o.position.copy(at); return o; }
  const i = sk.skeleton.bones.indexOf(bone);
  _m.copy(sk.skeleton.boneInverses[i]).multiply(sk.bindMatrix);
  o.position.copy(at).applyMatrix4(_m); _m.decompose(_s, o.quaternion, _s);
  bone.add(o); return o;
}

/* ---------------------------------------------------------------- matte */
const MATTE_U = new WeakMap();
const CLASS = {
  cloth: { rough: 0.9, metal: 0, env: 0.18 },
  skin: { rough: 0.72, metal: 0, env: 0.22 },
  leather: { rough: 0.74, metal: 0, env: 0.25 },
  body: { rough: 0.78, metal: 0.45, env: 0.22 },  /* the knight body: mail, quilt and gloves (world.js underLayer) */
  metal: { rough: 0.56, metal: 0.8, env: 0.42 },
  glossy: { rough: 0.3, metal: 1, env: 0.6 },     /* a style may keep a few hard shells (neon visors, lacquer) */
};
const METAL_RE = /metal_plate|SQ_Mail|SQ_Gold|Steel|Iron|Metal|Plate|Brass|Gold|Chrome|Rivet|Buckle|Exo|Kabuto|Helm/i;
const SKIN_RE = /Skin|Face|Flesh|Lip|Troll/i;
const LEATHER_RE = /Leather|Boot|Belt|Glove|Strap|Apron|Wraps/i;
function classOf(m, style) {
  const n = m.material.name || ''; const part = m.userData.part || '';
  if (style.classOf) { const c = style.classOf(n, part, m); if (c) return c; }
  if (part === 'Mannequin') return m.material.metalness > 0.1 ? 'body' : 'skin';
  if (METAL_RE.test(n)) return 'metal';
  if (SKIN_RE.test(n)) return 'skin';
  if (LEATHER_RE.test(n)) return 'leather';
  return m.material.metalness > 0.4 ? 'metal' : 'cloth';
}
function matteHook(mat) {
  if (MATTE_U.has(mat)) return MATTE_U.get(mat);
  const U = { r: { value: 0 }, m: { value: 1 }, v: { value: 1 } }; MATTE_U.set(mat, U);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, rr) => {
    prev?.call(mat, sh, rr);
    if (!sh.fragmentShader.includes('#include <lights_physical_fragment>')) return;
    sh.uniforms.sqMR = U.r; sh.uniforms.sqMM = U.m; sh.uniforms.sqMV = U.v;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float sqMR; uniform float sqMM; uniform float sqMV;')
      .replace('#include <lights_physical_fragment>', 'roughnessFactor = max(roughnessFactor, sqMR); metalnessFactor *= sqMM; diffuseColor.rgb *= sqMV;\n#include <lights_physical_fragment>');
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-matte`;
  mat.needsUpdate = true;
  return U;
}
const skip = (m) => !m.material || Array.isArray(m.material) || !m.material.isMeshStandardMaterial || m.userData.glow || m.material.userData?.glow
  || m.userData.part === 'Eyes' || /SQ_Eyes|SQ_Rune|SQG_Glow|Glow|Visor|Lens|Neon|Light/i.test(m.material.name || '') || m.material.blending === THREE.AdditiveBlending || m.material.transparent && m.material.opacity < 0.95;
/* style.matte = { cloth: {...}, metal: {...}, value: { cloth: k, metal: k, ... } } overrides CLASS per world */
export function matte(actor, style = {}) {
  const apply = () => {
    actor.root.traverse((m) => {
      if (!m.isMesh || skip(m)) return;
      const c = classOf(m, style); const P = { ...CLASS[c], ...(style.matte?.[c] || {}) }; const mat = m.material;
      const U = matteHook(mat); U.r.value = P.rough; U.m.value = c === 'cloth' || c === 'skin' || c === 'leather' ? 0 : P.metal;
      U.v.value = style.value?.[c] ?? 1;
      mat.envMapIntensity = Math.min(mat.envMapIntensity ?? 1, P.env);
      if (mat.clearcoat) mat.clearcoat = 0; if (mat.sheen) mat.sheen = 0;
    });
  };
  apply();
  /* look() resets steel env (1.5) and roughness on every call: keep the finish through any later look */
  if (!actor.matteWrap) { actor.matteWrap = true; const look = actor.look; actor.look = (...a) => { const r = look.apply(actor, a); try { actor.matteApply?.(); } catch { /* none */ } return r; }; }
  actor.matteApply = apply;
  return apply;
}

/* ---------------------------------------------------------------- the idle at once (no bind pose ever shows) */
export function settle(actor, clip) {
  const name = clip && actor.has(clip) ? clip : actor.has('Sword_Idle') ? 'Sword_Idle' : null;
  if (!name) return;
  if (!actor.current) actor.play(name, { fade: 0 });
  actor.mixer.update(0);
}

/* ---------------------------------------------------------------- rank marks */
const MATS = new Map();
export function clothMat(hex, opt = {}) {
  const k = `c${hex}|${opt.rough ?? 0.92}|${opt.metal ?? 0}|${opt.emissive ?? 0}`;
  if (!MATS.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: opt.rough ?? 0.92, metalness: opt.metal ?? 0, envMapIntensity: opt.env ?? 0.25, side: THREE.DoubleSide, name: opt.name || 'SQF_Rank' });
    if (opt.emissive) { m.emissive = new THREE.Color(hex); m.emissiveIntensity = opt.emissive; m.userData.glow = true; }
    MATS.set(k, m);
  }
  /* a copy per foe: a corpse fades its own materials (actor.fade) and a hit flashes them; a shared one did it to every foe */
  const c = MATS.get(k).clone(); if (MATS.get(k).userData.glow) c.userData.glow = true; return c;
}
function jag(geo, seed, depth) {
  /* a torn hem: the lowest row of a plane drops by a ragged amount */
  const p = geo.attributes.position; let minY = Infinity; for (let i = 0; i < p.count; i++) minY = Math.min(minY, p.getY(i));
  const r = mulberry(seed);
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - minY) < 1e-4) p.setY(i, p.getY(i) + (r() - 0.3) * depth);
  geo.computeVertexNormals(); return geo;
}
const GEO = new Map(); const geoOnce = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
export const rankKit = {
  /* a cape from the shoulders to the calves, flaring back from the body (no clip through the legs) */
  cape(actor, hex, { len = 1.05, width = 0.6, torn = 0.12, seed = 3 } = {}) {
    const g = geoOnce(`cape${len}|${width}|${torn}|${seed}`, () => {
      const geo = new THREE.PlaneGeometry(width, len, 6, 10); geo.translate(0, -len / 2, 0);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = -p.getY(i) / len; const x = p.getX(i); p.setX(i, x * (0.75 + 0.45 * y)); p.setZ(i, -0.05 - 0.22 * y * y - 0.03 * Math.cos(x * 9)); }
      return jag(geo, seed, torn);
    });
    const fr = bindFrame(actor, 'spine_03', new THREE.Vector3(0, 1.5, -0.13));
    const m = new THREE.Mesh(g, clothMat(hex)); m.castShadow = true; m.userData.part = 'RankCape'; fr.add(m);
    return { obj: fr, sway: m, hang: true };
  },
  /* a narrow war banner on a pole from the back, far above the head: the clearest rank mark at fight range */
  banner(actor, hex, { pole = 0x2a2018, h = 1.35, flag = [0.3, 0.62], mark = null, seed = 5 } = {}) {
    const fr = bindFrame(actor, 'spine_03', new THREE.Vector3(0, 1.32, -0.17));
    const pg = geoOnce(`pole${h}`, () => new THREE.CylinderGeometry(0.014, 0.018, h, 6).translate(0, h / 2 - 0.25, 0));
    const pm = new THREE.Mesh(pg, clothMat(pole, { rough: 0.8 })); pm.castShadow = true; fr.add(pm);
    const fg = geoOnce(`flag${flag}|${seed}`, () => jag(new THREE.PlaneGeometry(flag[0], flag[1], 3, 6).translate(flag[0] / 2 + 0.015, -flag[1] / 2, 0), seed, 0.08));
    const fl = new THREE.Mesh(fg, clothMat(hex)); fl.position.set(0, h - 0.27, 0); fl.rotation.y = Math.PI / 2; fl.castShadow = true; fr.add(fl);
    const bar = new THREE.Mesh(geoOnce('flagbar', () => new THREE.CylinderGeometry(0.01, 0.01, 0.34, 5).rotateZ(Math.PI / 2).translate(0.17, 0, 0)), clothMat(pole, { rough: 0.8 })); bar.position.copy(fl.position); bar.rotation.y = Math.PI / 2; fr.add(bar);
    if (mark != null) { const mk = new THREE.Mesh(geoOnce('flagmark', () => new THREE.PlaneGeometry(0.14, 0.14).translate(0.165, -0.2, 0.004)), clothMat(mark)); mk.position.copy(fl.position); mk.rotation.y = Math.PI / 2; fr.add(mk); const mk2 = mk.clone(); mk2.position.copy(fl.position); mk2.rotation.y = -Math.PI / 2; mk2.scale.x = -1; fr.add(mk2); }
    pm.userData.part = fl.userData.part = 'RankBanner';
    return { obj: fr, sway: fl };
  },
  /* a horsehair or feather crest over the crown of the head, front to back */
  crest(actor, hex, { y = 1.86, z = -0.01, tall = 0.2, long = 0.32, kind = 'hair' } = {}) {
    const fr = bindFrame(actor, 'Head', new THREE.Vector3(0, y, z));
    const g = geoOnce(`crest${kind}|${tall}|${long}`, () => {
      const parts = [];
      if (kind === 'feather') { for (let i = 0; i < 3; i++) { const f = new THREE.PlaneGeometry(0.07, tall * 1.6, 1, 4); const p = f.attributes.position; for (let k = 0; k < p.count; k++) { const t = p.getY(k) / (tall * 1.6) + 0.5; p.setX(k, p.getX(k) * Math.sin(t * Math.PI)); p.setZ(k, -t * t * 0.18); } f.translate(0, tall * 0.8, 0); f.rotateZ((i - 1) * 0.28); f.rotateX(-0.35); parts.push(f); } }
      else for (let i = 0; i < 9; i++) { const t = i / 8; const f = new THREE.BoxGeometry(0.03, tall * (0.75 + 0.5 * Math.sin(t * Math.PI)), 0.05); f.translate(0, tall * 0.45, 0); f.rotateX(-0.9 + t * 1.55); f.translate(0, 0, (0.5 - t) * long * 0.4); parts.push(f); }
      const out = mergeAll(parts); return out;
    });
    const m = new THREE.Mesh(g, clothMat(hex)); m.castShadow = true; m.userData.part = 'RankCrest'; fr.add(m);
    return { obj: fr };
  },
  /* broad shoulder plates (two rings of lames), larger than any foe's own */
  pauldrons(actor, hex, { r = 0.17, metal = 0.6, rough = 0.6, trim = null } = {}) {
    const objs = [];
    for (const [sd, sx] of [['l', 1], ['r', -1]]) {
      const fr = bindFrame(actor, `upperarm_${sd}`, new THREE.Vector3(sx * 0.2, 1.5, 0));
      const g = geoOnce(`paul${r}`, () => { const a = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42); a.scale(1.1, 0.8, 1); const b = new THREE.SphereGeometry(r * 0.92, 14, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.16); b.scale(1.1, 0.8, 1); b.translate(0, -r * 0.25, 0); return mergeAll([a, b]); });
      const m = new THREE.Mesh(g, clothMat(hex, { rough, metal, env: 0.4 })); m.rotation.z = -sx * 0.35; m.castShadow = true; m.userData.part = 'RankPauldron'; fr.add(m);
      if (trim != null) { const t = new THREE.Mesh(geoOnce(`paultrim${r}`, () => new THREE.TorusGeometry(r * 1.02, 0.012, 4, 20).rotateX(Math.PI / 2).scale(1.1, 1, 1).translate(0, r * 0.2, 0)), clothMat(trim, { rough: 0.5, metal: 0.8 })); t.rotation.z = m.rotation.z; fr.add(t); }
      objs.push(fr);
    }
    return { obj: objs };
  },
  /* a band over one shoulder and across the chest (a sash, a bandolier, a baldric) */
  sash(actor, hex, { w = 0.07, studs = null } = {}) {
    const fr = bindFrame(actor, 'spine_03', new THREE.Vector3(0, 1.33, 0.01));
    const g = geoOnce(`sash${w}`, () => new THREE.TorusGeometry(0.2, w / 2, 3, 28).scale(0.95, 1.55, 0.72).rotateZ(0.62));
    const m = new THREE.Mesh(g, clothMat(hex, { rough: 0.85 })); m.castShadow = true; m.userData.part = 'RankSash'; fr.add(m);
    if (studs != null) { const sg = geoOnce('studs', () => { const ps = []; for (let i = 0; i < 9; i++) { const a = -1.15 + i * 0.13; const b = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6).rotateX(Math.PI / 2); b.translate(Math.cos(a + Math.PI / 2) * 0.2 * 0.95, Math.sin(a + Math.PI / 2) * 0.2 * 1.55, 0.155); b.rotateZ(0.62); ps.push(b); } return mergeAll(ps); }); fr.add(new THREE.Mesh(sg, clothMat(studs, { rough: 0.4, metal: 0.9 }))); }
    return { obj: fr };
  },
  /* a small badge on the left breast (a star, a disc, a mon) */
  badge(actor, hex, { r = 0.04, points = 5, at = [0.09, 1.38, 0.13] } = {}) {
    const fr = bindFrame(actor, 'spine_03', new THREE.Vector3(...at));
    const g = geoOnce(`badge${r}|${points}`, () => { const s = new THREE.Shape(); for (let i = 0; i <= points * 2; i++) { const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2; const rr = points > 0 && i % 2 ? r * 0.45 : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } return new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false }); });
    const m = new THREE.Mesh(g, clothMat(hex, { rough: 0.35, metal: 0.9, env: 0.6 })); fr.add(m);
    return { obj: fr };
  },
  /* torn cloth strips: a ring of ragged strips round the hips ('hips') or a short mantle over the shoulders ('mantle') */
  rags(actor, hex, { at = 'hips', n = 7, seed = 7, len = null } = {}) {
    const hips = at === 'hips';
    const fr = bindFrame(actor, hips ? 'pelvis' : 'spine_03', new THREE.Vector3(0, hips ? 1.0 : 1.47, hips ? 0 : -0.01));
    const L = len ?? (hips ? 0.5 : 0.3); const R = hips ? 0.21 : 0.22;
    const g = geoOnce(`rags${at}|${n}|${seed}|${L}`, () => {
      const r = mulberry(seed); const ps = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.4; const l = L * (0.6 + r() * 0.6); const w = (hips ? 0.13 : 0.15) + r() * 0.06;
        const s = jag(new THREE.PlaneGeometry(w, l, 2, 4).translate(0, -l / 2, 0), seed * 31 + i, 0.1);
        const p = s.attributes.position; for (let k = 0; k < p.count; k++) { const y = -p.getY(k) / l; p.setZ(k, y * y * (hips ? 0.1 : 0.16)); }
        s.rotateY(a); s.translate(Math.sin(a) * R, 0, Math.cos(a) * R * (hips ? 0.8 : 0.75)); ps.push(s);
      }
      return mergeAll(ps);
    });
    const m = new THREE.Mesh(g, clothMat(hex)); m.castShadow = true; m.userData.part = hips ? 'RagsHips' : 'RagsMantle'; fr.add(m);
    return { obj: fr };
  },
  /* a hair shell round the back and sides of the head (under a hat), so a bare head never reads as a black balaclava */
  hair(actor, hex, { full = false, y = 1.715, r = 0.106, k = [1.0, 1.32, 1.2], down = 0.62 } = {}) {
    const fr = bindFrame(actor, 'Head', new THREE.Vector3(0, y, -0.004));
    /* SphereGeometry: phi = PI / 2 faces +z (the face); a gap of about 125 degrees stays open there */
    const g = geoOnce(`hair${full}|${r}|${k}|${down}`, () => new THREE.SphereGeometry(r, 18, 10, full ? 0 : Math.PI * 0.85, full ? Math.PI * 2 : Math.PI * 1.3, 0, Math.PI * down).scale(...k));
    const m = new THREE.Mesh(g, clothMat(hex, { rough: 0.95, name: 'SQF_Hair' })); m.castShadow = true; m.userData.part = 'Hair_code'; fr.add(m);
    return { obj: fr };
  },
};
function mergeAll(list) {
  /* a tiny merge for non-indexed or indexed geometries with the same attributes (position, normal, uv) */
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = geos.reduce((s, g) => s + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const uv = new Float32Array(n * 2); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeVertexNormals(); out.computeBoundingSphere(); return out;
}

/* ---------------------------------------------------------------- builds and stances */
/* bigger or smaller frames from uniform bone scales (non-uniform spine scales shear the children, storybook) */
export function build(actor, shape) {
  const bones = Object.entries(shape).map(([n, k]) => [boneOf(actor, n), k]).filter(([b]) => b);
  if (!bones.length) return () => {};
  const apply = () => { for (const [b, k] of bones) { if (Array.isArray(k)) b.scale.set(k[0], k[1], k[2]); else b.scale.setScalar(k); } };
  const mix = actor.mixer; const up = mix.update.bind(mix); mix.update = (dt) => { const r = up(dt); apply(); return r; }; apply();
  return () => { mix.update = up; };
}
/* the brute frame: a heavy chest and shoulders on thick arms and big fists, a sunk head (every world's brute) */
export const HEAVY = { spine_03: 1.14, spine_02: 1.08, neck_01: 0.85, upperarm_l: 1.12, upperarm_r: 1.12, lowerarm_l: 1.08, lowerarm_r: 1.08, hand_l: 1.28, hand_r: 1.28, thigh_l: 1.1, thigh_r: 1.1 };

/* ---------------------------------------------------------------- the finish
   style = { matte, value, classOf, rank(actor, foeId, kit, R, ctx) -> [{ obj, sway }], idle } (per world)
   returns { extras, update(dt), dispose() } for the world's handle to call */
export function finishFoe(actor, foeId, ctx = {}, style = {}, R = null) {
  const marks = [];
  if (ctx.captain && style.rank) { try { for (const x of style.rank(actor, foeId, rankKit, R || foeRng(ctx, foeId), ctx) || []) if (x) marks.push(x); } catch (err) { console.warn('rank marks', err); } }
  matte(actor, style);
  settle(actor, foeId === 'minion' ? 'Zombie_Idle_Loop' : 'Sword_Idle');
  let t = Math.random() * 6;
  const objs = marks.flatMap((x) => (Array.isArray(x.obj) ? x.obj : [x.obj]));
  return {
    marks,
    update(dt, s = {}) {
      t += dt;
      const run = s.dead ? 0 : 1;
      for (const x of marks) {
        if (!x.sway) continue;
        if (x.hang) {
          /* a cape hangs from the shoulders under gravity: upright in the body's yaw whatever the spine does (a hunch, a fall) */
          x.obj.updateWorldMatrix(true, false); x.obj.getWorldQuaternion(_q).invert();
          actor.root.getWorldQuaternion(_q2);
          x.sway.quaternion.copy(_q).multiply(_q2).multiply(_q3.setFromAxisAngle(_X, s.dead ? 1.3 : -0.08 - 0.05 * Math.sin(t * 2.3) * run));
        } else x.sway.rotation.x = run * 0.06 * Math.sin(t * 2.3);
      }
    },
    dispose() { for (const o of objs) o.removeFromParent(); },
  };
}

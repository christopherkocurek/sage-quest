/* geometry for weak machines and phones.
   The lite pass works on the live scene, so every world and every asset gets it with no second set of files:
   - any indexed mesh above a triangle floor gets a simplified index buffer (meshoptimizer, MIT; the vertex data and the
     skin weights are shared with the full geometry, only the triangle list is new). Level 1 (tier low) keeps about half,
     level 2 (tier min and phones) about a fifth. Results are cached per geometry; the full geometry comes back on a tier
     that does not want lite (tiers only step down in play, so that is for tools).
   - the terrain (a polar grid) switches to a coarser index made by its generator (lands.js: geo.userData.sqLod).
   - phones: point lights that are off (pooled effect lights at intensity 0) stay out of the light count from the start.
   The work is sliced: at most ~5 ms a frame, so a fight start on a phone does not stall on it.
   window.__sq.quality.lite = { level, done, saved, queue } for tools. */
import * as THREE from 'three';

const qs = (() => { try { return new URLSearchParams(location.search); } catch { return null; } })();
export function isPhone() {
  const f = qs?.get('phone'); if (f === '1') return true; if (f === '0') return false;
  if (typeof window !== 'undefined' && typeof window.__sqPhone === 'boolean') return window.__sqPhone; /* the probe in index.html (MOBILE generator): ?touch=1 forces, ?desktoponly=1 clears */
  try { const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches; const small = Math.min(screen.width, screen.height) <= 600; return (navigator.maxTouchPoints || 0) > 0 && coarse && (small || /iPhone|Android.*Mobile/i.test(navigator.userAgent)); } catch { return false; }
}
export function isTablet() { try { return !isPhone() && (navigator.maxTouchPoints || 0) > 1 && matchMedia('(pointer: coarse)').matches; } catch { return false; } }

/* a phone shrinks every normal and roughness map to 512 px after it loads (texScan below); it now loads the 512 px files at once
   (web/assets/ground/s512, made with PIL Lanczos at q90): 6.6 MB of those maps become 2.9 MB, no shrink work at the walk start. */
if (isPhone()) { const RX = /\/assets\/ground\/([a-z0-9_]+_(nor_gl|nor|rough)\.jpg)$/; THREE.DefaultLoadingManager.setURLModifier((u) => { const m = RX.exec(u); return m ? u.replace(m[0], `/assets/ground/s512/${m[1]}`) : u; }); }

const FLOOR = [Infinity, 1400, 420]; /* triangles: smaller meshes stay as they are */
const KEEP = [1, 0.5, 0.2]; const MIN_TRI = [0, 700, 260]; const ERR = [0, 0.012, 0.03]; /* relative to the mesh size */
const triCount = (g) => (g.index ? g.index.count : 0) / 3;


/* ---------- skinned merge (phone and tiers low/min) ----------
   A foe is 17 to 19 skinned parts, each with its own material clone and its own draw call. Parts of one rig whose materials are the same
   in every way that reaches the shader (name, patch key, colour, maps, roughness, opacity ...) are drawn as ONE part: the first part (the
   "rep", a real mesh of the rig) gets a geometry with the triangles of the others, and the others' materials are set not visible (a mesh
   stays `visible`, so game code that reads or sets `visible` sees no change, and no new object enters the scene).
   Material effects (hit rim, fade, tint, quest matte) reach every part's material alike, so the rep's material shows them.
   A part that hides (a broken helm), a new material or a new geometry undoes the group at once; the next scan builds it again.
   Code that reads a part's own geometry calls sqUnmerge(mesh) first (world.js bakeSkinned, bodies.js trim). */
const mRepOf = new WeakMap(); const mGroups = new Set(); const mStat = { groups: 0, saved: 0, builds: 0 };
const mUndo = (g) => { if (g.rep.geometry === g.merged) g.rep.geometry = g.own; if (g.vc) { g.mat.vertexColors = g.vc0; g.mat.needsUpdate = true; if (g.lf) { g.rep.userData.sqNoLoose = true; for (const x of g.srcs) x.o.userData.sqNoLoose = true; } } for (const m of g.hid) m.visible = true; for (const x of g.srcs) if (x.stub) { if (x.o.material === x.stub) x.o.material = x.orig; x.stub.dispose(); } try { g.merged.dispose(); } catch { /* gone */ } mRepOf.delete(g.rep); for (const x of g.srcs) mRepOf.delete(x.o); mGroups.delete(g); };
export function sqUnmerge(mesh) { const g = mesh && mRepOf.get(mesh); if (g) mUndo(g); }
/* parts whose materials differ ONLY in colour (and name) also join. Each part's colour
   goes into a vertex colour (its colour / the rep's colour; three multiplies material colour by it), and the rep's material
   turns vertexColors on for the time of the merge. Only when the rep's material is the rep's alone, has no vertex colours of
   its own, and has no zero channel. Every frame the parts' colours must keep the same ratio to the rep's, and their emissive,
   opacity and transparency must match the rep's, or the group is undone (a part tinted on its own, an eye glow). */
/* the values of a material's own patch uniforms (sq*: matte floors, rim strength, grime ...): they live in onBeforeCompile
   closures, not in the material, so a loose group must match on them too. null = not linked yet (no loose merge then). */
let mR = null;
const sqU = (m) => { const u = mR?.properties.get(m)?.uniforms; if (!u) return null; let s = ''; for (const n in u) { if (!n.startsWith('sq')) continue; const v = u[n]?.value; s += n + '=' + (v == null ? '-' : typeof v === 'number' ? v.toFixed(4) : v.isColor ? v.getHexString() : v.toArray ? v.toArray().map((x) => x.toFixed(3)).join(',') : v.isTexture ? v.uuid : typeof v) + ';'; } return s; };
const mKey = (o, loose = false) => { const m = o.material; let k = ''; try { k = typeof m.customProgramCacheKey === 'function' ? String(m.customProgramCacheKey()) : ''; } catch { return null; } if (k.includes('sq-tear')) return null; /* torn cloth: its own seed per part */
  const su = loose ? sqU(m) : ''; if (su == null) return mKey(o, false);
  return [su, m.type, loose ? '' : m.name, k, loose ? !!m.color : m.color?.getHex(), m.map?.uuid, m.normalMap?.uuid, m.roughnessMap?.uuid, m.metalnessMap?.uuid, m.emissiveMap?.uuid, m.aoMap?.uuid, m.alphaMap?.uuid, m.roughness, m.metalness, m.emissive?.getHex(), m.emissiveIntensity, m.envMapIntensity, m.transparent, m.opacity, m.depthWrite, m.depthTest, m.side, m.alphaTest, m.blending, m.flatShading, m.vertexColors, m.fog, m.wireframe, o.renderOrder, o.castShadow, o.receiveShadow, o.frustumCulled, ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].map((n) => { const a = o.geometry.attributes[n]; return a ? `${a.array.constructor.name}${a.itemSize}${a.normalized ? 'n' : ''}` : '-'; }).join(',')].join('|'); };
const sameSkel = (a, b) => { if (a.skeleton === b.skeleton) return true; const A = a.skeleton, B = b.skeleton; if (!A || !B || A.bones.length !== B.bones.length) return false; for (let i = 0; i < A.bones.length; i++) if (A.bones[i] !== B.bones[i]) return false;
  for (let i = 0; i < A.boneInverses.length; i++) { const x = A.boneInverses[i].elements, y = B.boneInverses[i].elements; for (let j = 0; j < 16; j++) if (Math.abs(x[j] - y[j]) > 1e-6) return false; }
  const x = a.bindMatrix.elements, y = b.bindMatrix.elements; for (let j = 0; j < 16; j++) if (Math.abs(x[j] - y[j]) > 1e-6) return false; return a.bindMode === b.bindMode; };
const sameMat4 = (a, b) => { const x = a.matrixWorld.elements, y = b.matrixWorld.elements; for (let j = 0; j < 16; j++) if (Math.abs(x[j] - y[j]) > 1e-6) return false; return true; };
const mBuild = (list, vc = false) => {
  const rep = list[0]; const g0 = rep.geometry; const names = Object.keys(g0.attributes).filter((k) => list.every((o) => { const a = o.geometry.attributes[k], r = g0.attributes[k]; return a && a.array.constructor === r.array.constructor && a.itemSize === r.itemSize && a.normalized === r.normalized; }));
  if (!['position', 'skinIndex', 'skinWeight'].every((k) => names.includes(k))) return null; if (g0.attributes.normal && !names.includes('normal')) return null; if (rep.material.map && !names.includes('uv')) return null;
  let nv = 0, ni = 0; for (const o of list) { nv += o.geometry.attributes.position.count; ni += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; }
  const geo = new THREE.BufferGeometry();
  for (const k of names) { const r = g0.attributes[k]; const arr = new r.array.constructor(nv * r.itemSize); let off = 0; for (const o of list) { const a = o.geometry.attributes[k]; const sz = a.itemSize; if (a.isInterleavedBufferAttribute) { const st = a.data.stride, of = a.offset, src = a.data.array; for (let i = 0; i < a.count; i++) for (let c = 0; c < sz; c++) arr[off + i * sz + c] = src[i * st + of + c]; } else arr.set(a.array.subarray(0, a.count * sz), off); off += a.count * sz; } geo.setAttribute(k, new THREE.BufferAttribute(arr, r.itemSize, r.normalized)); }
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let io = 0, vo = 0; for (const o of list) { const ix = o.geometry.index; const n = o.geometry.attributes.position.count; if (ix) { const a = ix.array; for (let i = 0; i < ix.count; i++) idx[io++] = a[i] + vo; } else for (let i = 0; i < n; i++) idx[io++] = i + vo; vo += n; }
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
  let ratio = null; if (vc) { const rc = rep.material.color; const col = new Float32Array(nv * 3); let o3 = 0; ratio = [];
    for (const o of list) { const c = o.material.color; const r = [c.r / rc.r, c.g / rc.g, c.b / rc.b]; ratio.push(r); const n = o.geometry.attributes.position.count; for (let i = 0; i < n; i++) { col[o3++] = r[0]; col[o3++] = r[1]; col[o3++] = r[2]; } }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const g = { rep, own: g0, merged: geo, mat: rep.material, parent: rep.parent, srcs: list.slice(1).map((o) => ({ o, mat: o.material, geo: o.geometry, parent: o.parent })), hid: [], vc: !!vc, vc0: rep.material.vertexColors, ratio: ratio && ratio.slice(1) };
  if (vc) { rep.material.vertexColors = true; rep.material.needsUpdate = true; mStat.loose = (mStat.loose || 0) + list.length - 1; }
  /* a part with its own material: that material is set not visible. A part that shares the rep's material instance (a far silhouette) gets an
     invisible copy of it for the time of the merge, so code that reads its colour or name still finds them. */
  rep.geometry = geo; for (const x of g.srcs) { if (x.mat === rep.material) { x.orig = x.mat; x.stub = x.mat.clone(); x.stub.visible = false; x.o.material = x.stub; x.mat = x.stub; } else { x.mat.visible = false; g.hid.push(x.mat); } mRepOf.set(x.o, g); } mRepOf.set(rep, g); mGroups.add(g); mStat.builds++; return g; };
const mWhy = (k) => { const w = mStat.why || (mStat.why = {}); w[k] = (w[k] || 0) + 1; return false; };
const mOk = (g) => { const r = g.rep; if (!r.parent || r.parent !== g.parent) return mWhy('rep parent'); if (!r.visible) return mWhy('rep hidden'); if (r.geometry !== g.merged) return mWhy('rep geometry'); if (r.material !== g.mat) return mWhy('rep material'); if (!(r.layers.mask & 1)) return mWhy('rep layer');
  for (const x of g.srcs) { const o = x.o; if (!o.visible) return mWhy('part hidden'); if (o.parent !== x.parent) return mWhy('part parent'); if (o.material !== x.mat) return mWhy('part material'); if (o.geometry !== x.geo) return mWhy('part geometry'); }
  if (g.vc) { const M = g.mat; const rc = M.color; if (!M.vertexColors) return mWhy('vc off');
    if (M.transparent) { g.lf = true; return mWhy('loose fade'); } /* a fading loose batch splits back at once: transparent + vertex colours is a program no warm made (a link on the death frame) */
    for (let i = 0; i < g.srcs.length; i++) { const m = g.srcs[i].mat, q = g.ratio[i], c = m.color; if (Math.abs(c.r - rc.r * q[0]) > 2e-3 || Math.abs(c.g - rc.g * q[1]) > 2e-3 || Math.abs(c.b - rc.b * q[2]) > 2e-3) { g.lf = true; return mWhy('loose colour'); }
      if (m.opacity !== M.opacity || m.transparent !== M.transparent || m.emissiveIntensity !== M.emissiveIntensity || (m.emissive && !m.emissive.equals(M.emissive))) { g.lf = true; return mWhy('loose look'); } if (sqU(m) !== sqU(M)) { g.lf = true; return mWhy('loose uniforms'); } } }
  return true; };
function installMerge(world, st) {
  st.merge = mStat; let f = 0; mR = world.renderer;
  const wanted = () => !mStat.off && (st.phone || st.tier === 'low' || st.tier === 'min') && document.body.classList.contains('st-fight');
  const attached = (o) => { for (let x = o; x; x = x.parent) if (x === world.scene) return true; return false; };
  const scan = () => {
    const use = new Map(); const by = new Map();
    world.scene.traverse((o) => { if (!o.isMesh || !o.visible) return; const mm = o.material; if (Array.isArray(mm)) { for (const m of mm) use.set(m, (use.get(m) || 0) + 1); return; } if (!mm) return; use.set(mm, (use.get(mm) || 0) + 1);
      if (!o.isSkinnedMesh || mRepOf.has(o) || !o.skeleton || !(o.layers.mask & 1) || !mm.visible || o.geometry.morphAttributes?.position || !o.geometry.attributes.skinIndex || (o.geometry.groups && o.geometry.groups.length > 1) || o.userData.sqNoMerge) return;
      let vis = true; for (let x = o.parent; x; x = x.parent) if (!x.visible) { vis = false; break; } if (!vis) return;
      const root = o.skeleton.bones[0]; if (!root) return; /* parts of one rig sit in different groups (one per glTF mesh): the rig is the skeleton */
      let a = by.get(root); if (!a) by.set(root, (a = [])); a.push(o); });
    mStat.scans = (mStat.scans || 0) + 1; mStat.nulls = 0; mStat.rigs = by.size; mStat.cand = 0; mStat.keyed = 0;
    /* strict groups first , then the parts left alone try the loose key */
    const pass = (list, loose) => { const keys = new Map(); for (const o of list) { const lz = loose && !o.userData.sqNoLoose && use.get(o.material) === 1 && !o.material.vertexColors && !o.geometry.attributes.color && o.material.color; if (loose && !lz) continue; const k = mKey(o, !!lz); if (!k) continue; let a = keys.get(k); if (!a) keys.set(k, (a = [])); a.push(o); }
      for (const a of keys.values()) { if (a.length < 2) continue; mStat.keyed += a.length; const rep = a[0]; const seen = new Map(); for (const o of a) seen.set(o.material, (seen.get(o.material) || 0) + 1);
        const ok = [rep]; for (let i = 1; i < a.length; i++) { const o = a[i]; if ((o.material === rep.material || use.get(o.material) === seen.get(o.material)) && sameSkel(rep, o) && (rep.bindMode === 'attached' || sameMat4(rep, o))) ok.push(o); /* attached: the bones place every vertex, the part's own matrix cancels out */ }
        let vc = false; if (loose && ok.length > 1 && ok.some((o) => !o.material.color?.equals(ok[0].material.color))) { const i = ok.findIndex((o) => { const c = o.material.color; return c && c.r > 2e-3 && c.g > 2e-3 && c.b > 2e-3; }); /* loose group: a rep with no zero channel */
          if (i < 0) continue; if (i > 0) { const t = ok[0]; ok[0] = ok[i]; ok[i] = t; } vc = true; }
        if (ok.length < 2) continue; try { if (!mBuild(ok, vc)) { mStat.nulls++; for (const o of ok) o.userData.sqNoMerge = true; } } catch (e) { console.warn('[sq] merge', e); for (const o of ok) o.userData.sqNoMerge = true; } } };
    const looseOn = (st.phone || st.tier === 'low' || st.tier === 'min');
    for (const list of by.values()) { mStat.cand += list.length; if (list.length < 2) continue; pass(list, false); if (looseOn) { const rest = list.filter((o) => !mRepOf.has(o)); if (rest.length > 1) pass(rest, true); } }
  };
  return () => { const on = wanted(); let saved = 0;
    for (const g of mGroups) { if (!on) { mWhy('not wanted'); mUndo(g); } else if (!mOk(g)) mUndo(g); else saved += g.srcs.length; }
    if (++f % 45 === 7) { for (const g of mGroups) if (!attached(g.rep)) mUndo(g); if (on) scan(); }
    mStat.groups = mGroups.size; mStat.saved = saved; };
}

export function installPerf3(world, st) {
  if (!world || st._p3) return; st._p3 = true;
  const lite = st.lite = { level: 0, done: 0, saved: 0, queue: 0, ms: 0, ready: false, off: false };
  /* draws that put nothing on screen still cost a call each: an instanced batch with no instances
     (an empty effect pool), and a built-in material faded to opacity 0 (a pooled spark or glow waiting for its turn) that
     writes no depth and blends normally or additively. Both are skipped; the picture cannot change (alpha 0 adds nothing).
     Custom shaders (ShaderMaterial) are never skipped: their alpha is their own. */
  if (world.renderer && !world.renderer._sqZero) { const R = world.renderer; R._sqZero = true; const rbd = R.renderBufferDirect; let skipped = 0; st.zeroSkip = () => skipped;
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      if (object && ((object.isInstancedMesh && object.count === 0) || (material && material.transparent && material.opacity === 0 && !material.depthWrite && !material.isShaderMaterial && (material.blending === THREE.NormalBlending || material.blending === THREE.AdditiveBlending)))) { skipped++; return; }
      return rbd.call(this, camera, scene, geometry, material, object, group); }; }
  /* keep linked programs when their last material is disposed. The camp is torn down at the fight
     and built again for the end card: every camp program was deleted and linked again in the card's first frames (phone: 56
     links, desktop: 70). A disposed material now leaves its programs pinned (one extra use each, at most PIN_MAX programs), so
     the same material built again finds its program ready. Nothing is drawn differently; a program costs a few kB. */
  if (world.renderer && !THREE.Material.prototype._sqPin) { const R = world.renderer; const PIN_MAX = 400; const pinned = new WeakSet(); let n = 0; st.pinned = () => n;
    const d0 = THREE.Material.prototype.dispose; THREE.Material.prototype._sqPin = true;
    THREE.Material.prototype.dispose = function () { try { const progs = n < PIN_MAX ? R.properties.get(this)?.programs : null; if (progs) for (const pg of progs.values()) if (pg && !pinned.has(pg) && n < PIN_MAX) { pinned.add(pg); pg.usedTimes++; n++; } } catch { /* the pin is optional */ } return d0.call(this); }; }
  const slots = installLightSlots(world, st); let builtSeen = 0; let pl1 = false; let plF = 0;
  const levelOf = (t) => (st.phone || t === 'min' ? 2 : t === 'low' ? 1 : 0);
  let simp = null; let loading = null;
  const need = () => { if (simp || loading) return; loading = import('./meshopt-simplifier.js').then(async (m) => { await m.MeshoptSimplifier.ready; simp = m.MeshoptSimplifier; lite.ready = true; }).catch((e) => { console.warn('[sq] lite geometry off', e); lite.off = true; }); };
  const cache = new WeakMap(); /* full geometry -> [null, lite1, lite2] */
  const fullOfGeo = new WeakMap(); /* lite geometry -> its full geometry (never in userData: Object3D.clone copies userData through JSON) */
  const fullGeo = (o) => fullOfGeo.get(o.geometry) || o.geometry;
  const queue = []; const queued = new WeakSet();
  /* flat-shaded geometry with no index (storybook: 172 painted bushes of 2,880 triangles): weld by position, simplify, write the triangles out
     flat again. Only for a batch that adds up, and only plain Float32 attributes. */
  const makeSoup = (g, level, batchTri) => {
    const pos = g.attributes.position; const heavy = (level === 2 && batchTri > 60000) || (level === 1 && batchTri > 150000);
    if (!heavy || !pos || pos.isInterleavedBufferAttribute || !(pos.array instanceof Float32Array) || pos.itemSize !== 3 || (g.groups && g.groups.length > 1) || Object.keys(g.morphAttributes || {}).length) return null;
    for (const k of Object.keys(g.attributes)) { const a = g.attributes[k]; if (a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute || !ArrayBuffer.isView(a.array)) return null; }
    const n = pos.count; const A = pos.array; const map = new Map(); const I = new Uint32Array(n); const rep = []; const U = [];
    for (let i = 0; i < n; i++) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2]; const key = `${Math.round(x * 2e3)},${Math.round(y * 2e3)},${Math.round(z * 2e3)}`; let id = map.get(key); if (id === undefined) { id = rep.length; map.set(key, id); rep.push(i); U.push(x, y, z); } I[i] = id; }
    if (rep.length > n * 0.7) { /* loose cards (leaf blobs): nothing to weld, so every third pair of triangles stays (level 1: three of five) */
      const pairs = Math.floor(n / 6); if (pairs < 60) return null; const idx = []; const keepN = level === 2 ? 1 : 3; const of = level === 2 ? 3 : 5;
      for (let q = 0; q < pairs; q++) if (q % of < keepN) { const b = q * 6; idx.push(b, b + 1, b + 2, b + 3, b + 4, b + 5); }
      const t = new THREE.BufferGeometry(); for (const k of Object.keys(g.attributes)) t.setAttribute(k, g.attributes[k]); t.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
      t.boundingBox = g.boundingBox; t.boundingSphere = g.boundingSphere; fullOfGeo.set(t, g); lite.saved += (n - idx.length) / 3; return t; }
    const keep = level === 2 ? 0.2 : 0.4; const target = Math.max(120, Math.floor(n / 3 * keep)) * 3;
    const [out] = simp.simplify(I, new Float32Array(U), 3, target, level === 2 ? 0.06 : 0.035, []);
    if (!out || out.length >= n * 0.9 || out.length < 9) return null;
    const m = new THREE.BufferGeometry();
    for (const k of Object.keys(g.attributes)) { if (k === 'normal') continue; const a = g.attributes[k]; const sz = a.itemSize; const arr = new a.array.constructor(out.length * sz); for (let j = 0; j < out.length; j++) { const src = rep[out[j]] * sz; for (let c = 0; c < sz; c++) arr[j * sz + c] = a.array[src + c]; } m.setAttribute(k, new THREE.BufferAttribute(arr, sz, a.normalized)); }
    if (g.attributes.normal) m.computeVertexNormals();
    m.boundingBox = g.boundingBox; m.boundingSphere = g.boundingSphere; fullOfGeo.set(m, g); lite.saved += (n - out.length) / 3;
    return m;
  };
  const makeLite = (g, level, batchTri = 0) => {
    if (!g.index) return makeSoup(g, level, batchTri);
    const tri = triCount(g); const pos = g.attributes.position; if (!pos || tri < FLOOR[level]) return null;
    if (g.groups && g.groups.length > 1) return null; /* draw ranges per material: left alone */
    let P; if (pos.isInterleavedBufferAttribute || !(pos.array instanceof Float32Array) || pos.itemSize !== 3 || pos.normalized) { P = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); } } else P = pos.array;
    const I = g.index.array instanceof Uint32Array ? g.index.array : new Uint32Array(g.index.array);
    /* a scanned rock or statue, or a batch of many copies that adds up (storybook: 172 painted bushes of 2,880 = 495,000): harder */
    const big = (level === 2 && (tri > 3000 || batchTri > 60000)) || (level === 1 && batchTri > 150000);
    const keep = big ? (level === 2 ? 0.1 : 0.25) : KEEP[level];
    const target = Math.max(MIN_TRI[level], Math.floor(tri * keep)) * 3; if (target >= I.length * 0.9) return null;
    const [out] = simp.simplify(I, P, 3, target, big ? (level === 2 ? 0.06 : 0.035) : ERR[level], big ? [] : ['LockBorder']);
    if (!out || out.length >= I.length * 0.9 || out.length < 9) return null;
    const n = new THREE.BufferGeometry(); for (const k of Object.keys(g.attributes)) n.setAttribute(k, g.attributes[k]);
    n.morphAttributes = g.morphAttributes; n.morphTargetsRelative = g.morphTargetsRelative;
    n.setIndex(new THREE.BufferAttribute(pos.count > 65535 ? out : new Uint16Array(out), 1));
    n.boundingBox = g.boundingBox; n.boundingSphere = g.boundingSphere; fullOfGeo.set(n, g);
    lite.saved += (I.length - out.length) / 3;
    return n;
  };
  const apply = (o, level) => {
    const full = fullGeo(o); if (!full) return;
    /* the terrain: its own coarse grids */
    const lod = full.userData?.sqLod;
    if (lod) { const want = lod[Math.min(level, lod.length - 1)]; if (full.index !== want) full.setIndex(want); return; }
    if (level === 0) { if (o.geometry !== full) o.geometry = full; return; }
    let c = cache.get(full); if (!c) cache.set(full, (c = [null, undefined, undefined]));
    if (c[level] === undefined) { c[level] = makeLite(full, level, o.isInstancedMesh ? (full.index ? triCount(full) : (full.attributes.position?.count || 0) / 3) * (fullCount.get(o) ?? o.count) : 0); lite.done++; }
    const g = c[level]; if (g && o.geometry !== g) o.geometry = g; else if (!g && o.geometry !== full) o.geometry = full;
  };
  /* plants that sway (ferns, reeds, tall grass: no collision, placed in random order): fewer of them on the lite levels */
  const THIN = [1, 0.7, 0.4]; const fullCount = new WeakMap(); const windy = new WeakMap();
  const isWindy = (m) => { if (!m || typeof m.customProgramCacheKey !== 'function') return false; let v = windy.get(m); if (v === undefined) { let k = ''; try { k = String(m.customProgramCacheKey()); } catch { k = ''; } v = k.includes('sq-wind'); windy.set(m, v); } return v; };
  /* small plants only (a tree also sways, and a tree has a collider): at most 400 triangles each. The whole set of batches shares one triangle
     budget per level (edo had 12 batches of 30,000 to 40,000 each), and one batch never draws more than its own cap. */
  const WBUDGET = [Infinity, 260000, 70000]; const WCAP = [Infinity, 250000, 40000]; let windK = 1;
  const perTri = (o) => Math.max(1, triCount(fullGeo(o)) || (o.geometry.attributes.position?.count || 3) / 3);
  const small = (o) => isWindy(o.material) && perTri(o) <= 400 && (fullCount.get(o) ?? o.count) >= 12;
  const thin = (o, level) => { if (!small(o) || (o.layers.mask === 1 << 29 && imIn.has(o))) return; let full = fullCount.get(o); if (full == null) { full = o.count; fullCount.set(o, full); } const per = perTri(o);
    const want = Math.max(8, Math.floor(Math.min(full * THIN[level] * windK, WCAP[level] / per))); if (o.count !== want && (o.count === full || o.userData.sqThin === o.count)) { o.count = want; o.userData.sqThin = want; } };
  const windPlan = (level) => { let total = 0; world.scene.traverse((o) => { if (o.isInstancedMesh && o.visible && o.layers.mask !== 1 << 29 && small(o)) total += Math.min((fullCount.get(o) ?? o.count) * THIN[level] * perTri(o), WCAP[level]); }); windK = total > WBUDGET[level] ? WBUDGET[level] / total : 1; };
  /* instanced batches that share the parent, the material, the geometry and the
     transform (the lands place one kind in 2 or 3 batches; the shadow flags do not count: the phone tier draws no shadows) are
     drawn as ONE new batch next to them. The original batches stay as they are, only moved to a layer the camera does not draw,
     so every edit still lands: a changed instance (nearcam.js pushes plants out of the lens) is copied over in the same
     frame. The merged batch is interleaved, so the plant thinning keeps an even spread. Undone at once when the code that made a part hides a
     part, swaps its material or takes it out. Same pixels; only the per-batch frustum cull is lost. */
  const IM_ON = !!st.phone; const IM_PARK = 29; const imGroups = []; const imIn = new WeakSet(); const imNever = new WeakSet(); lite.im = 0;
  const imKey = (o) => { const m = o.material; if (!o.parent || Array.isArray(m) || !m || o.userData.sqNoMerge || o.morphTexture || o.isSkinnedMesh || o.isBatchedMesh || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || o.children.length) return null;
    return `${o.parent.id}|${m.id}|${fullGeo(o).id}|${o.frustumCulled ? 1 : 0}${o.instanceColor ? 1 : 0}|${o.renderOrder}|${o.layers.mask}|${o.matrix.elements.map((v) => v.toFixed(4)).join(',')}`; };
  const imCopy = (g, k) => { const o = g.list[k]; const map = g.map[k]; const A = o.instanceMatrix.array; const M = g.mesh.instanceMatrix.array; const C = g.mesh.instanceColor?.array; const S = o.instanceColor?.array;
    for (let i = 0; i < map.length; i++) { const d = map[i]; for (let j = 0; j < 16; j++) M[d * 16 + j] = A[i * 16 + j]; if (C && S) { C[d * 3] = S[i * 3]; C[d * 3 + 1] = S[i * 3 + 1]; C[d * 3 + 2] = S[i * 3 + 2]; } }
    g.vers[k] = o.instanceMatrix.version; g.cvers[k] = o.instanceColor?.version; g.mesh.instanceMatrix.needsUpdate = true; if (C) g.mesh.instanceColor.needsUpdate = true; g.mesh.boundingSphere = null; g.mesh.boundingBox = null; };
  const imMerge = (list) => {
    const fulls = list.map((o) => fullCount.get(o) ?? o.count); const total = fulls.reduce((a, b) => a + b, 0); const r0 = list[0];
    const mesh = new THREE.InstancedMesh(fullGeo(r0), r0.material, total); mesh.name = 'sq-im'; mesh.userData.sqIm = true;
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(r0.matrix); mesh.matrixWorld.copy(r0.matrixWorld); mesh.frustumCulled = r0.frustumCulled; mesh.renderOrder = r0.renderOrder; mesh.layers.mask = r0.layers.mask;
    mesh.castShadow = list.some((o) => o.castShadow); mesh.receiveShadow = r0.receiveShadow; if (r0.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    const map = list.map(() => []); const idx = list.map(() => 0); let w = 0;
    while (w < total) { let best = -1; let bv = Infinity; for (let k = 0; k < list.length; k++) if (idx[k] < fulls[k]) { const v = (idx[k] + 0.5) / fulls[k]; if (v < bv) { bv = v; best = k; } } map[best].push(w); idx[best]++; w++; }
    const g = { mesh, list, map, masks: list.map((o) => o.layers.mask), mats: list.map((o) => o.material), vers: [], cvers: [] };
    for (let k = 0; k < list.length; k++) imCopy(g, k);
    r0.parent.add(mesh); for (const o of list) { o.layers.set(IM_PARK); imIn.add(o); } imIn.add(mesh); imGroups.push(g); lite.im += list.length - 1;
  };
  const imUndo = (g) => { g.mesh.removeFromParent(); g.mesh.dispose(); imIn.delete(g.mesh); for (let k = 0; k < g.list.length; k++) { const o = g.list[k]; imNever.add(o); imIn.delete(o); if (o.layers.mask === 1 << IM_PARK) o.layers.mask = g.masks[k]; } lite.im -= g.list.length - 1; };
  /* every frame: copy what changed, undo what was hidden, swapped or taken out */
  const imTick = () => { for (let i = imGroups.length - 1; i >= 0; i--) { const g = imGroups[i]; const p0 = g.list[0].parent;
    let why = null; for (let k = 0; k < g.list.length && !why; k++) { const o = g.list[k]; if (o.parent !== p0 || !o.parent) why = 'gone'; else if (!o.visible) why = 'hidden'; else if (o.material !== g.mats[k] || fullGeo(o) !== fullGeo(g.list[0])) why = 'material'; else if (o.layers.mask !== 1 << IM_PARK) why = 'layers'; }
    if (!why && g.mesh.parent !== p0) why = 'merged batch moved';
    if (why) { lite.imUndo = ((lite.imUndo || '') + why[0]).slice(-40); imUndo(g); imGroups.splice(i, 1); continue; }
    for (let k = 0; k < g.list.length; k++) { const o = g.list[k]; if (o.instanceMatrix.version !== g.vers[k] || o.instanceColor?.version !== g.cvers[k]) imCopy(g, k); } } };
  const imScan = (cands) => { const by = new Map(); for (const o of cands) { if (imIn.has(o) || imNever.has(o) || o.count === 0) continue; const k = imKey(o); if (!k) continue; let a = by.get(k); if (!a) by.set(k, (a = [])); a.push(o); } for (const a of by.values()) if (a.length > 1) imMerge(a); };
  let scanF = 0; let lastLevel = -1;
  /* phone: smaller pictures on the GPU. Colour maps stay at 1024 or less; normal, roughness, metal and shade maps go to 512.
     One texture a frame, in the scan; a texture that was sent already is freed and sent again small. */
  const texSeen = new WeakSet(); const texQ = []; let texBusy = false; lite.tex = 0;
  const SLOTS = [['map', 1024], ['emissiveMap', 1024], ['normalMap', 512], ['roughnessMap', 512], ['metalnessMap', 512], ['aoMap', 512], ['bumpMap', 512], ['alphaMap', 512]];
  const texScan = (m) => { for (const [k, cap] of SLOTS) { const t = m[k]; if (!t || texSeen.has(t)) continue; texSeen.add(t); const im = t.image; if (!im || t.isCanvasTexture /* a live canvas (the camp stone) is redrawn later: a frozen copy kept "WHO ARE YOU" on phones */ || t.isCompressedTexture || t.isDataTexture || t.isRenderTargetTexture || t.isVideoTexture || !(im.width > cap || im.height > cap)) continue; if (!((typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) || (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement) || (typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement))) continue; texQ.push([t, cap]); } };
  const texStep = () => { const job = texQ.shift(); if (!job) return; const [t, cap] = job; const im = t.image; if (!im || !(im.width > cap || im.height > cap)) return;
    /* the shrink is decoded and scaled off the main thread; the old canvas draw decoded the jpg on the frame (30-70 ms frames at the walk start, phone x4) */
    if (typeof createImageBitmap === 'function') { const k = cap / Math.max(im.width, im.height); texBusy = true;
      /* an <img> goes by its file (a Blob decodes off the main thread; the element decodes on the frame) */
      (im.src && im instanceof HTMLImageElement ? fetch(im.src).then((r) => r.blob()) : Promise.resolve(im)).then((src) => createImageBitmap(src, { resizeWidth: Math.max(1, Math.round(im.width * k)), resizeHeight: Math.max(1, Math.round(im.height * k)), resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: t.flipY ? 'flipY' : 'from-image' }))
        .then((bm) => { if (t.image !== im) { bm.close(); return; } t.dispose(); if (t.source) { t.source.data = bm; t.source.needsUpdate = true; } else t.image = bm; t.flipY = false; t.needsUpdate = true; lite.tex++; })
        .catch((e) => console.warn('[sq] tex', e)).finally(() => { texBusy = false; }); return; }
    try { const k = cap / Math.max(im.width, im.height); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k)); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
      /* a texture in use elsewhere at full size (a clone shares the source) follows: the source is what is swapped */
      t.dispose(); if (t.source) { t.source.data = c; t.source.needsUpdate = true; } else t.image = c; t.needsUpdate = true; lite.tex++; } catch (e) { console.warn('[sq] tex', e); } };
  const scan = () => {
    const level = lite.level;
    const imC = [];
    windPlan(level);
    world.scene.traverse((o) => {
      if (IM_ON && o.isInstancedMesh && o.visible) imC.push(o);
      if (level === 2 && st.phone && o.material && (o.isMesh || o.isPoints)) { if (Array.isArray(o.material)) o.material.forEach(texScan); else texScan(o.material); }
      if (!o.isMesh || !o.geometry || o.userData.sqNoLite) return;
      if (mRepOf.get(o)?.rep === o) return; /* a merged rep: its geometry is the merge */
      if (o.isInstancedMesh) thin(o, level);
      const g = fullGeo(o);
      if (g.userData?.sqLod) { apply(o, level); return; }
      if (level === 0) { if (o.geometry !== g) apply(o, 0); return; }
      const tri = g.index ? triCount(g) : (g.attributes.position?.count || 0) / 3;
      if (!g.index && !(o.isInstancedMesh && tri * o.count > 60000)) return;
      const c = cache.get(g);
      if (c && c[level] !== undefined) { if (c[level] && o.geometry !== c[level]) apply(o, level); return; }
      if (tri < FLOOR[level] || queued.has(o)) return;
      queued.add(o); queue.push(o);
    });
    lite.queue = queue.length;
    if (imC.length > 1) imScan(imC);
  };
  const f0 = st.frame; const mergeTick = installMerge(world, st);
  st.frame = (now) => {
    f0(now);
    mergeTick?.();
    if (imGroups.length) imTick();
    /* the fight's programs, ahead: once when the fifth question is up (land, hero, companions exist), again for what the last steps added */
    if (slots && ++plF % 30 === 0) { const S = window.__sq?.S; if (S?.stage === 'build') { if (!pl1 && S.step >= 4) { pl1 = true; slots.prelink(); } else if (pl1 && !builtSeen && document.body.classList.contains('built')) { builtSeen = 1; slots.prelink(); } } }
    slots?.tick();
    const level = levelOf(st.tier); lite.level = level;
    if (level !== lastLevel) { lastLevel = level; scanF = 0; if (level > 0) need(); }
    if (level > 0 && !simp) { if (!lite.off && ++scanF % 30 === 1) world.scene.traverse((o) => { const g = o.geometry; if (o.isMesh && g?.userData?.sqLod) apply(o, level); }); return; }
    if (++scanF % 45 === 1) scan();
    if (texQ.length && scanF % 3 === 0 && !texBusy) texStep();
    if (!queue.length) return;
    const a = performance.now(); const budget = document.body?.classList.contains('st-fight') ? 4 : 9;
    while (queue.length && performance.now() - a < budget) { const o = queue.shift(); queued.delete(o); try { if (o.parent) { sqUnmerge(o); apply(o, lite.level); } } catch (e) { o.userData.sqNoLite = true; console.warn('[sq] lite', e); } }
    lite.queue = queue.length; lite.ms += performance.now() - a;
  };
}

/* ---------- light slots ----------
   The number of visible lights of each type is part of every lit program's key. Measured in the real flow: the camp has
   3 point lights, the hand-off 0, the fight 5, and every quest prop with a flame adds one more: each change linked every lit
   material again (113 -> 302 programs when the first prop light came into view: the worst stall of a run, and far worse on
   Direct3D). Now the count never changes: at every render exactly K plain point lights and 2 plain directional lights are
   live. Real lights beyond K are parked on a layer the camera does not draw (the K with the most light on the camera's
   position stay; a pooled effect light at intensity 0 is the first to park), and black pad lights fill the count when
   fewer are on. Lights that cast shadows are not touched. K = 4 (2 on a phone). */
export function installLightSlots(world, st) {
  if (!world?.renderer || world._sqSlots) return null; world._sqSlots = true;
  const R = world.renderer; const scene = world.scene; const PARK = 30;
  const K = Math.max(1, Number(qs?.get('plights')) || (st?.phone ? 2 : 4)); const KD = 2;
  const reg = new Set(); const parked = new Map(); /* light -> its own layer mask */
  const take = (o) => { if (!o) return; if (o.isLight) { if (!o.userData.sqPad) reg.add(o); } if (o.children && o.children.length) for (const c of o.children) take(c); };
  if (!THREE.Object3D.prototype._sqSlotAdd) {
    const add0 = THREE.Object3D.prototype.add; THREE.Object3D.prototype._sqSlotAdd = true;
    THREE.Object3D.prototype.add = function (...objs) { for (const o of objs) if (o && o.isObject3D && (o.isLight || o.children.length)) take(o); return add0.apply(this, objs); };
  }
  take(scene);
  const pads = []; for (let i = 0; i < K; i++) { const l = new THREE.PointLight(0x000000, 0, 0.01, 2); l.userData.sqPad = true; l.castShadow = false; l.visible = false; l.position.set(0, -500, 0); scene.add(l); pads.push(l); }
  const dpads = []; for (let i = 0; i < KD; i++) { const l = new THREE.DirectionalLight(0x000000, 0); l.userData.sqPad = true; l.castShadow = false; l.visible = false; scene.add(l); dpads.push(l); }
  const live = (o) => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === scene) return true; } return false; };
  const wp = new THREE.Vector3(); const cp = new THREE.Vector3(); const pts = []; const dirs = []; let n = 0; const info = st ? (st.slots = { K, point: 0, parked: 0, pads: 0, reg: 0 }) : {};
  const unpark = (l) => { const m = parked.get(l); if (m != null) { if (l.layers.mask === 1 << PARK) l.layers.mask = m; parked.delete(l); } };
  const park = (l) => { if (!parked.has(l)) { parked.set(l, l.layers.mask); } l.layers.mask = 1 << PARK; };
  const norm = (camera) => {
    pts.length = 0; dirs.length = 0; if (camera) camera.getWorldPosition(cp);
    if (++n % 600 === 0) { for (const l of reg) if (!l.parent) { unpark(l); reg.delete(l); } take(scene); }
    const cmask = camera ? camera.layers.mask : 1;
    /* no shadow tier (phone, min): a light that comes back with its shadow on (the camp fire at the card) would change the shadow count in every
       program key, a full relink in one frame (measured: 2.5 s, 11 s on a slow phone). It is turned off before the frame is drawn. */
    const noShadow = !!st && (st.phone || st.tier === 'min');
    for (const l of reg) {
      if (noShadow && l.castShadow && (l.isPointLight || l.isDirectionalLight || l.isSpotLight)) l.castShadow = false;
      if (l.castShadow || !(l.isPointLight || l.isDirectionalLight) || !live(l)) { if (parked.has(l) && (l.castShadow || !l.parent)) unpark(l); continue; }
      const own = parked.has(l) ? parked.get(l) : l.layers.mask; if (!(own & cmask)) continue; /* hidden by its own layer */
      if (l.isPointLight) { let sc = 0; if (l.intensity > 0) { l.getWorldPosition(wp); const d = wp.distanceTo(cp); sc = l.distance > 0 && d > l.distance + 14 ? l.intensity * 1e-4 / (1 + d * d) : l.intensity / (1 + d * d * 0.05); } l._sqScore = sc; pts.push(l); } else dirs.push(l);
    }
    if (pts.length > K) pts.sort((a, b) => (b._sqScore - a._sqScore) || ((parked.has(a) ? 1 : 0) - (parked.has(b) ? 1 : 0)));
    for (let i = 0; i < pts.length; i++) { if (i < K) unpark(pts[i]); else park(pts[i]); }
    for (let i = 0; i < K; i++) pads[i].visible = i < K - Math.min(K, pts.length);
    for (let i = 0; i < dirs.length; i++) { if (i < KD) unpark(dirs[i]); else park(dirs[i]); }
    for (let i = 0; i < KD; i++) dpads[i].visible = i < KD - Math.min(KD, dirs.length);
    info.point = pts.length; info.parked = parked.size; info.pads = Math.max(0, K - pts.length); info.reg = reg.size;
  };
  const r0 = R.render.bind(R); R.render = (sc, cam) => { if (sc === scene) norm(cam); return r0(sc, cam); };
  const c0 = R.compile.bind(R); R.compile = (sc, cam, target) => { if (sc === scene || target === scene) norm(cam); return c0(sc, cam, target); };
  const a0 = R.compileAsync?.bind(R); if (a0) R.compileAsync = (sc, cam, target) => { if (sc === scene || target === scene) norm(cam); return a0(sc, cam, target); };
  /* the fight's programs for what the camp already holds (land, hero, weapon, companions): the camp's fire casts a point shadow and
     the fight has none, so those materials need a second program each. Linked in the background while the player reads the last
     screen, not in the first fight frame. Called once (quality.js sees body.built). */
  let work = null; const seen = new Set();
  const prelink = () => {
    if (work) return;
    const flip = []; for (const l of reg) if (l.isPointLight && l.castShadow && live(l)) flip.push(l);
    if (!flip.length) { info.prelink = 'no shadow point light'; return; }
    /* one mesh per (material, kind): each compile call makes that program (shader text + compile + link start: 5 to 20 ms of
       main thread), so the list is worked off a few ms a frame (tick), never in one long task */
    const list = [];
    scene.traverseVisible((o) => { if (!(o.isMesh || o.isPoints || o.isLine) || !o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const k = `${m.uuid}:${o.isSkinnedMesh ? 1 : 0}${o.isInstancedMesh ? 1 : 0}${o.receiveShadow ? 1 : 0}`; if (seen.has(k)) continue; seen.add(k); list.push(o); break; } });
    if (!list.length) return;
    work = { list, flip, t: performance.now(), n: list.length }; info.prelink = `0/${list.length}`;
  };
  const tick = () => {
    if (!work) return; const a = performance.now(); const { list, flip } = work;
    for (const l of flip) l.castShadow = false;
    norm(world.camera); /* the fight's light state: no point shadow, K plain point lights */
    try { while (list.length && performance.now() - a < 5) { const o = list.pop(); if (o.parent) c0(o, world.camera, scene); } } catch (e) { console.warn('[sq] prelink', e); list.length = 0; } finally { for (const l of flip) l.castShadow = true; }
    info.prelink = `${work.n - list.length}/${work.n}`;
    const dt = performance.now() - a; if (dt > 40 && qs?.get('stats') === '1') console.log(`[sq] fight programs: slow slice ${Math.round(dt)} ms, ${list.length} left`); work.max = Math.max(work.max || 0, dt); work.sum = (work.sum || 0) + dt;
    if (!list.length) { st?.log?.(`fight programs for ${work.n} camp materials started ahead (${Math.round(performance.now() - work.t)} ms wall, ${Math.round(work.sum)} ms work, longest slice ${Math.round(work.max)} ms)`); work = null; }
  };
  return { norm, prelink, tick, info, K };
}

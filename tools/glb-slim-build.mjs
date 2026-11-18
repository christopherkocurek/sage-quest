/* slim a glb for the deploy build only (source assets never change). Pure Node, no decoder needed in three.js:
   - skin weights float32 -> normalized uint8, normals float32 -> normalized int8 padded to 4 (KHR_mesh_quantization),
     the same two steps as the slimming script for the source assets (not part of this repository)
   - LINEAR/STEP rotation keys float32 -> normalized int16 (core glTF; GLTFLoader scales normalized outputs)
   - identical animation accessors (same bytes) shared, and all animation data packed into one bufferView
   No track, key, vertex or texture is removed. Usage: node tools/glb-slim-build.mjs in.glb out.glb */
import fs from 'node:fs';

const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

export function slimGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const BIN = buf.subarray(28 + jl, 28 + jl + buf.readUInt32LE(20 + jl));
  const acc = j.accessors || []; const bvs = j.bufferViews || [];
  if ((j.buffers || []).length !== 1 || acc.some((a) => a.sparse)) return null;
  const viewUsers = new Map();
  acc.forEach((a, i) => { if (a.bufferView != null) viewUsers.set(a.bufferView, [...(viewUsers.get(a.bufferView) || []), i]); });
  const bytesOf = (i) => { const a = acc[i]; const bv = bvs[a.bufferView]; const n = a.count * NC[a.type] * CS[a.componentType]; const off = (bv.byteOffset || 0) + (a.byteOffset || 0); return Buffer.from(BIN.subarray(off, off + n)); };
  const solo = (i) => { const a = acc[i]; const bv = bvs[a.bufferView]; return a.bufferView != null && viewUsers.get(a.bufferView).length === 1 && !bv.byteStride && !a.byteOffset && a.componentType === 5126; };

  /* which accessors are animation-only */
  const animAcc = new Set();
  for (const an of j.animations || []) for (const s of an.samplers) { animAcc.add(s.input); animAcc.add(s.output); }
  const meshAcc = new Set();
  for (const m of j.meshes || []) for (const p of m.primitives) { for (const v of Object.values(p.attributes)) meshAcc.add(v); if (p.indices != null) meshAcc.add(p.indices); for (const t of p.targets || []) for (const v of Object.values(t)) meshAcc.add(v); }
  for (const s of j.skins || []) if (s.inverseBindMatrices != null) meshAcc.add(s.inverseBindMatrices);
  for (const i of animAcc) if (meshAcc.has(i) || acc[i].bufferView == null) return null;

  /* new data per accessor (vertex quantization) or per animation accessor */
  const newData = new Map(); let quantMesh = false;
  const kinds = new Map();
  for (const m of j.meshes || []) for (const p of m.primitives) {
    const a = p.attributes;
    if (a.WEIGHTS_0 != null && solo(a.WEIGHTS_0) && acc[a.WEIGHTS_0].type === 'VEC4' && !(p.targets || []).length) kinds.set(a.WEIGHTS_0, 'w');
    if (a.NORMAL != null && solo(a.NORMAL) && !(p.targets || []).length) kinds.set(a.NORMAL, 'n');
  }
  for (const [i, k] of kinds) {
    const a = acc[i]; const f = new Float32Array(new Uint8Array(bytesOf(i)).buffer); const n = a.count;
    if (k === 'w') {
      const out = new Uint8Array(n * 4);
      for (let v = 0; v < n; v++) {
        let s = 0; for (let c = 0; c < 4; c++) s += f[v * 4 + c]; if (s === 0) s = 1;
        let tot = 0; let big = 0;
        for (let c = 0; c < 4; c++) { const q = Math.floor((f[v * 4 + c] / s) * 255 + 0.5); out[v * 4 + c] = q; tot += q; if (f[v * 4 + c] > f[v * 4 + big]) big = c; }
        out[v * 4 + big] = Math.max(0, Math.min(255, out[v * 4 + big] + 255 - tot));
      }
      newData.set(i, Buffer.from(out.buffer)); a.componentType = 5121; a.normalized = true;
    } else {
      const out = new Int8Array(n * 4);
      for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) out[v * 4 + c] = Math.max(-127, Math.min(127, Math.round(f[v * 3 + c] * 127)));
      newData.set(i, Buffer.from(out.buffer)); a.componentType = 5120; a.normalized = true; a.stride4 = true; delete a.min; delete a.max; quantMesh = true;
    }
  }
  for (const an of j.animations || []) for (const ch of an.channels) {
    const s = an.samplers[ch.sampler]; const a = acc[s.output];
    if (ch.target.path !== 'rotation' || s.interpolation === 'CUBICSPLINE' || a.componentType !== 5126 || a.type !== 'VEC4' || newData.has(s.output)) continue;
    const f = new Float32Array(new Uint8Array(bytesOf(s.output)).buffer); const out = new Int16Array(f.length);
    for (let k = 0; k < f.length; k++) out[k] = Math.max(-32767, Math.min(32767, Math.round(f[k] * 32767)));
    newData.set(s.output, Buffer.from(out.buffer)); a.componentType = 5122; a.normalized = true; delete a.min; delete a.max;
  }

  /* share identical animation accessors */
  const remap = new Map(); const seen = new Map();
  for (const i of [...animAcc].sort((x, y) => x - y)) {
    const a = acc[i]; const data = newData.get(i) || bytesOf(i);
    const key = `${a.type}|${a.componentType}|${a.count}|${a.normalized ? 1 : 0}|${data.toString('base64')}`;
    if (seen.has(key)) remap.set(i, seen.get(key)); else { seen.set(key, i); remap.set(i, i); if (!newData.has(i)) newData.set(i, data); }
  }
  for (const an of j.animations || []) for (const s of an.samplers) { s.input = remap.get(s.input); s.output = remap.get(s.output); }

  /* keep used accessors only, renumber */
  const used = new Set([...meshAcc, ...[...remap.values()]]);
  const order = acc.map((_, i) => i).filter((i) => used.has(i));
  const idx = new Map(order.map((o, n) => [o, n]));
  const R = (i) => idx.get(i);
  for (const m of j.meshes || []) for (const p of m.primitives) { for (const k of Object.keys(p.attributes)) p.attributes[k] = R(p.attributes[k]); if (p.indices != null) p.indices = R(p.indices); for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = R(t[k]); }
  for (const s of j.skins || []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = R(s.inverseBindMatrices);
  for (const an of j.animations || []) for (const s of an.samplers) { s.input = R(s.input); s.output = R(s.output); }

  /* rebuild BIN: non-animation views first (kept as views), then one packed animation view */
  const out = []; let len = 0;
  const pad = () => { const p = (4 - (len % 4)) % 4; if (p) { out.push(Buffer.alloc(p)); len += p; } };
  const push = (b) => { pad(); const off = len; out.push(b); len += b.length; return off; };
  const newViews = []; const viewMap = new Map();
  const animView = [...used].some((i) => animAcc.has(i));
  bvs.forEach((bv, vi) => {
    const users = (viewUsers.get(vi) || []).filter((i) => used.has(i) && !animAcc.has(i));
    const imageUse = (j.images || []).some((im) => im.bufferView === vi);
    if (!users.length && !imageUse) return;
    const q = users.length === 1 && newData.has(users[0]) && !animAcc.has(users[0]) ? users[0] : null;
    const data = q != null ? newData.get(q) : Buffer.from(BIN.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    const nv = { ...bv, buffer: 0, byteOffset: push(data), byteLength: data.length };
    if (q != null && acc[q].stride4) { nv.byteStride = 4; nv.target = 34962; }
    viewMap.set(vi, newViews.length); newViews.push(nv);
  });
  let animIdx = null;
  if (animView) {
    pad(); const start = len; animIdx = newViews.length;
    for (const i of order) if (animAcc.has(i)) { pad(); acc[i].byteOffset = len - start; const d = newData.get(i); out.push(d); len += d.length; }
    newViews.push({ buffer: 0, byteOffset: start, byteLength: len - start });
  }
  pad();
  const newAcc = order.map((i) => {
    const a = { ...acc[i] }; delete a.stride4;
    if (animAcc.has(i)) a.bufferView = animIdx; else if (a.bufferView != null) a.bufferView = viewMap.get(a.bufferView);
    if (!animAcc.has(i) && newData.has(i)) delete a.byteOffset;
    return a;
  });
  for (const im of j.images || []) if (im.bufferView != null) im.bufferView = viewMap.get(im.bufferView);
  j.accessors = newAcc; j.bufferViews = newViews; j.buffers = [{ byteLength: len }];
  if (quantMesh) for (const k of ['extensionsUsed', 'extensionsRequired']) { j[k] ||= []; if (!j[k].includes('KHR_mesh_quantization')) j[k].push('KHR_mesh_quantization'); }
  let js = Buffer.from(JSON.stringify(j)); if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const bin = Buffer.concat(out);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const c0 = Buffer.alloc(8); c0.writeUInt32LE(js.length, 0); c0.writeUInt32LE(0x4e4f534a, 4);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(bin.length, 0); c1.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, c0, js, c1, bin]);
}

if (process.argv[1] && process.argv[1].endsWith('glb-slim-build.mjs') && process.argv[2]) {
  const src = fs.readFileSync(process.argv[2]); const res = slimGlb(src);
  if (!res) { console.log('skipped (shape not handled)'); process.exit(0); }
  fs.writeFileSync(process.argv[3] || process.argv[2].replace(/\.glb$/, '.slim.glb'), res);
  console.log(`${process.argv[2]}: ${(src.length / 1e6).toFixed(2)} -> ${(res.length / 1e6).toFixed(2)} MB`);
}

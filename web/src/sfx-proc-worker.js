/* the procedural one-shots (web/src/sfx-proc.js: plain math, about 1.3 s of CPU for the whole set) are made here,
   off the main thread. sfx.js posts { id, seed }; the answer is { id, raw: [[Float32Array per channel] per variation] }.
   The numbers are the same as on the main thread: same generator, same seeds. */
import { PROC } from './sfx-proc.js';
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
self.onmessage = (e) => {
  const { id, seed } = e.data || {};
  try {
    const P = PROC[id]; const raw = []; const tr = new Set();
    for (let v = 0; v < (P.n || 3); v++) { const d = P.gen(rng32(seed + v * 7919), v); const chs = Array.isArray(d) ? d : [d]; raw.push(chs); for (const c of chs) tr.add(c.buffer); }
    self.postMessage({ id, raw }, [...tr]);
  } catch (err) { self.postMessage({ id, raw: null }); }
};

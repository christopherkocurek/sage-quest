/* the Baron's rail sledge as a
   designed object. Same contract and frame as sledge(L) in web/src/worlds/frontier-boss.js, so the boss module can swap
   one call: railSledge(L) -> { g, mats }. The haft runs along +Y with the grip at the origin; the head lies across X at y = L.
   - the head: an eight-sided forged block (not a box), tapered chamfers to two struck faces whose rims are mushroomed bright
     from the rail; hammer-scale texture with pitting, rust runs and a stamped maker's mark; an iron collar and a steel wedge
   - the haft: pale hickory with grain, darkened by hands toward the grip, a spiral leather wrap and a swelled knob
   All meshes carry userData.giantMaul (the boss code hides and finds the maul's parts by it). About 1.1 k triangles. */
import * as THREE from 'three';

const TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function tex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
/* forged iron: blue-black scale, hammer dimples with a pale rim, pitting, orange-brown rust runs, a stamped mark */
function ironTex() {
  return tex(512, 256, (g, w, h) => {
    const r = rng(41); g.fillStyle = '#2b2622'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = r() < 0.5 ? `rgba(70,62,56,${0.08 + r() * 0.12})` : `rgba(12,10,9,${0.1 + r() * 0.15})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 70; i++) { const x = r() * w; const y = r() * h; const rx = 6 + r() * 12; const ry = rx * (0.6 + r() * 0.4);
      g.fillStyle = 'rgba(8,7,6,0.35)'; g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(120,108,96,0.28)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x + 1, y + 1, rx, ry, 0, 0.2, 2.2); g.stroke(); }
    for (let i = 0; i < 26; i++) { const x = r() * w; const y0 = r() * h * 0.6; const L = 20 + r() * 70; const gr = g.createLinearGradient(x, y0, x, y0 + L);
      gr.addColorStop(0, 'rgba(120,58,24,0.55)'); gr.addColorStop(1, 'rgba(120,58,24,0)'); g.fillStyle = gr; g.fillRect(x, y0, 2 + r() * 5, L); }
    /* the maker's stamp on the cheek */
    g.save(); g.translate(w * 0.5, h * 0.5); g.font = "900 34px 'Zilla Slab', Georgia, serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(150,138,124,0.5)'; g.fillText('R.M.R. CO.', 1, 2); g.fillStyle = 'rgba(6,5,4,0.85)'; g.fillText('R.M.R. CO.', 0, 0);
    g.font = "700 18px 'Zilla Slab', Georgia, serif"; g.fillText('16 LB', 0, 30); g.restore();
  });
}
function hickoryTex() {
  return tex(64, 512, (g, w, h) => {
    const r = rng(77); g.fillStyle = '#a07a4e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { let x = r() * w; g.strokeStyle = r() < 0.6 ? `rgba(60,36,18,${0.12 + r() * 0.2})` : `rgba(230,200,150,${0.08 + r() * 0.1})`; g.lineWidth = 0.6 + r() * 1.8; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 16) { x += (r() - 0.5) * 1.4; g.lineTo(x, y); } g.stroke(); }
    /* hand grime: darker toward the grip end (v = 0 at the bottom of the haft) and a sweat band below the head */
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(30,18,10,0.65)'); gr.addColorStop(0.35, 'rgba(30,18,10,0.15)'); gr.addColorStop(0.8, 'rgba(30,18,10,0)'); gr.addColorStop(0.95, 'rgba(30,18,10,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, true);
}

export function railSledge(L) {
  const mats = [];
  const own = (m) => { mats.push(m); return m; };
  const iron = own(new THREE.MeshStandardMaterial({ map: ironTex(), color: 0xffffff, roughness: 0.62, metalness: 0.5, envMapIntensity: 0.5, flatShading: true }));
  const bright = own(new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.34, metalness: 1, envMapIntensity: 0.85, flatShading: true }));
  const wood = own(new THREE.MeshStandardMaterial({ map: hickoryTex(), color: 0xffffff, roughness: 0.72, metalness: 0 }));
  const wrapM = own(new THREE.MeshStandardMaterial({ color: 0x2c1c12, roughness: 0.88, metalness: 0 }));
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  /* the haft: slight swell at the throat and at the knob */
  const prof = [[0.062, -0.24], [0.07, -0.21], [0.062, -0.17], [0.056, 0.0], [0.05, L * 0.5], [0.047, L * 0.85], [0.054, L - 0.1]].map(([x, y]) => new THREE.Vector2(x, y));
  const haftGeo = new THREE.LatheGeometry(prof, 12); { const uv = haftGeo.attributes.uv; const p = haftGeo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), (p.getY(i) + 0.24) / (L + 0.14)); }
  add(haftGeo, wood);
  /* the leather wrap: a spiral of tilted bands over the lower third */
  for (let k = 0; k < 9; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.059, 0.01, 5, 14), wrapM); t.rotation.set(Math.PI / 2 + 0.22, 0, 0); t.position.y = -0.14 + k * 0.042; g.add(t); }
  add(new THREE.CylinderGeometry(0.072, 0.068, 0.035, 12), wrapM, 0, -0.235, 0);
  /* two iron langets down the haft under the head, riveted (they keep a split haft in the eye) */
  for (const sz of [-1, 1]) { add(new THREE.BoxGeometry(0.03, 0.3, 0.008), iron, 0, L - 0.33, sz * 0.05); for (const yy of [L - 0.26, L - 0.42]) add(new THREE.SphereGeometry(0.009, 6, 4), bright, 0, yy, sz * 0.055); }
  /* the head: an octagonal forged block across X, tapered to two struck faces */
  const HW = 0.74; const R = 0.172; const body = HW - 0.2;
  const hb = new THREE.CylinderGeometry(R, R, body, 8, 1); hb.rotateZ(Math.PI / 2); hb.rotateX(Math.PI / 8);
  { const uv = hb.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i)); }
  add(hb, iron, 0, L, 0);
  for (const sx of [-1, 1]) {
    const ch = new THREE.CylinderGeometry(R, R * 0.84, 0.07, 8, 1); ch.rotateZ(-sx * Math.PI / 2); ch.rotateX(Math.PI / 8); add(ch, iron, sx * (body / 2 + 0.035), L, 0);
    const fc = new THREE.CylinderGeometry(R * 0.84, R * 0.9, 0.03, 8, 1); fc.rotateZ(-sx * Math.PI / 2); fc.rotateX(Math.PI / 8); add(fc, bright, sx * (body / 2 + 0.085), L, 0);
    /* the mushroomed lip where the face spreads from blows */
    const lip = new THREE.TorusGeometry(R * 0.88, 0.012, 4, 8); lip.rotateY(Math.PI / 2); lip.rotateX(Math.PI / 8); add(lip, bright, sx * (body / 2 + 0.096), L, 0);
    add(new THREE.CircleGeometry(R * 0.86, 8).rotateY(sx * Math.PI / 2).rotateX(Math.PI / 8), bright, sx * (body / 2 + 0.101), L, 0);
  }
  /* the eye: a raised collar below and the wedges in the top of the eye */
  add(new THREE.CylinderGeometry(0.075, 0.09, 0.07, 8), iron, 0, L - R - 0.02, 0);
  const wedge = add(new THREE.BoxGeometry(0.1, 0.02, 0.018), bright, 0, L + R * 0.93 + 0.006, 0);
  const w2 = add(new THREE.BoxGeometry(0.018, 0.02, 0.09), bright, 0, L + R * 0.93 + 0.006, 0); void wedge; void w2;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.giantMaul = true; } });
  return { g, mats };
}

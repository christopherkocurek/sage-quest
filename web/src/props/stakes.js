/* the trail stakes
   that journey.js buildStakes() plants every 8 m beside the revealed tracks, as designed objects, one per world.
   stakeParts(world, env) -> [{ geo, mat }]   each part is drawn as one InstancedMesh with the stake's matrices (origin =
   the stake's foot on the ground, Y up, the stake faces +Z / along the route). Small: 100-400 triangles a stake.
   - edo: a split-bamboo stake with nodes, a cross-arm, a narrow paper fuda with 道標 in vermilion and a black border, and a
     zigzag shide below it (the same language as the big 道標 waymark, at hand size)
   - frontier: a surveyor's lath stake, its top painted red, a torn red rag knotted on it and a chalk number
   - storybook: a white-painted stake with a red-and-cream swallow-tail pennant and a ribbon bow
   - neon: a slim black bollard with a cyan chem-light tube in a cage and a hazard stripe
   - dark: (unchanged in journey.js: a small cairn) */
import * as THREE from 'three';

function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const merge = (list) => { const flat = list.map((g) => (g.index ? g.toNonIndexed() : g)); const out = new THREE.BufferGeometry(); const keys = ['position', 'normal', 'uv'];
  for (const k of keys) { const n = flat.reduce((s, g) => s + g.attributes[k].array.length, 0); const arr = new Float32Array(n); let o = 0; for (const g of flat) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(arr, k === 'uv' ? 2 : 3)); }
  return out; };
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };

function edo(env) {
  const bamboo = new THREE.MeshStandardMaterial({ map: canvas(64, 256, (g, w, h) => { g.fillStyle = '#7d8a48'; g.fillRect(0, 0, w, h); const r = rng(3); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,52,20' : '170,180,110'},${0.1 + r() * 0.15})`; g.fillRect(r() * w, 0, 1 + r() * 2, h); } for (const y of [0.18, 0.5, 0.82]) { g.fillStyle = 'rgba(40,46,20,0.8)'; g.fillRect(0, y * h, w, 5); g.fillStyle = 'rgba(200,205,150,0.5)'; g.fillRect(0, y * h + 5, w, 2); } }), roughness: 0.6, envMap: env, envMapIntensity: 0.4 });
  const H = 1.55;
  const pole = merge([T(new THREE.CylinderGeometry(0.026, 0.032, H, 7), 0, H / 2), T(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 7), 0, H * 0.32), T(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 7), 0, H * 0.66),
    T(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 5), 0.13, H - 0.08, 0, 0, 0, Math.PI / 2)]);
  /* the fuda: a narrow paper strip hung from the arm, 道標 brushed in vermilion inside a black frame, aged at the edges */
  const paper = new THREE.MeshStandardMaterial({ map: canvas(96, 320, (g, w, h) => {
    g.fillStyle = '#ece2c8'; g.fillRect(0, 0, w, h); const r = rng(9); for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(140,110,60,${0.03 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 2 + r() * 6); }
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(120,90,40,0.35)'); gr.addColorStop(0.15, 'rgba(120,90,40,0)'); gr.addColorStop(0.85, 'rgba(120,90,40,0)'); gr.addColorStop(1, 'rgba(120,90,40,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1410'; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#b2281a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(w * 0.66)}px 'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
    g.fillText('道', w / 2, h * 0.3); g.fillText('標', w / 2, h * 0.62); g.fillStyle = '#1a1410'; g.beginPath(); g.arc(w / 2, h * 0.87, 7, 0, Math.PI * 2); g.fill();
  }), roughness: 0.92, side: THREE.DoubleSide, emissive: 0xfff0d0, emissiveIntensity: 0.05, envMap: env, envMapIntensity: 0.2 });
  const fudaG = T(new THREE.PlaneGeometry(0.15, 0.5, 1, 4), 0.2, H - 0.35, 0.0, 0, 0, 0.02);
  /* the shide: four zigzag paper tongues below the arm on the other side */
  const sh = []; for (let k = 0; k < 4; k++) { const g = new THREE.PlaneGeometry(0.05, 0.07); T(g, 0.06 + (k % 2) * 0.035, H - 0.13 - k * 0.07, 0.002, 0, 0, (k % 2 ? 1 : -1) * 0.25); sh.push(g); }
  const shideM = new THREE.MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.9, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.2 });
  return [{ geo: pole, mat: bamboo }, { geo: fudaG, mat: paper }, { geo: merge(sh), mat: shideM }];
}
function frontier(env) {
  const wood = new THREE.MeshStandardMaterial({ map: canvas(64, 256, (g, w, h) => { g.fillStyle = '#9a7a54'; g.fillRect(0, 0, w, h); const r = rng(5); for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${r() < 0.6 ? '50,32,16' : '220,190,140'},${0.12 + r() * 0.15})`; g.lineWidth = 1 + r() * 2; g.beginPath(); let x = r() * w; g.moveTo(x, 0); for (let y = 0; y < h; y += 16) { x += (r() - 0.5) * 2; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = '#9a2416'; g.fillRect(0, 0, w, h * 0.16); g.fillStyle = 'rgba(240,230,210,0.85)'; g.font = "bold 34px 'Zilla Slab', Georgia, serif"; g.textAlign = 'center'; g.save(); g.translate(w / 2, h * 0.5); g.rotate(-Math.PI / 2); g.fillText('STA 14', 0, 12); g.restore(); }), roughness: 0.9, envMap: env, envMapIntensity: 0.3 });
  const H = 1.2;
  const lath = T(new THREE.BoxGeometry(0.06, H, 0.025), 0, H / 2); { const uv = lath.attributes.uv; const p = lath.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), p.getY(i) / H); }
  const tip = T(new THREE.ConeGeometry(0.035, 0.08, 4), 0, H + 0.04, 0, 0, Math.PI / 4);
  const rag = new THREE.MeshStandardMaterial({ map: canvas(64, 64, (g, w, h) => { g.fillStyle = '#a8261a'; g.fillRect(0, 0, w, h); const r = rng(11); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(30,8,4,${0.1 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 1); } g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(w, i * 7); g.lineTo(w * (0.55 + r() * 0.3), i * 7 + 4); g.lineTo(w, i * 7 + 8); g.fill(); } }), roughness: 0.95, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5, envMap: env, envMapIntensity: 0.2 });
  const r1 = T(new THREE.PlaneGeometry(0.26, 0.09, 4, 1), 0.15, H - 0.2, 0.02, 0, -0.3, -0.35); const r2 = T(new THREE.PlaneGeometry(0.2, 0.07, 3, 1), 0.12, H - 0.25, -0.02, 0, 0.4, -0.6);
  const knot = T(new THREE.TorusGeometry(0.04, 0.016, 5, 8), 0, H - 0.18, 0, Math.PI / 2);
  return [{ geo: merge([lath, tip]), mat: wood }, { geo: merge([r1, r2, knot]), mat: rag }];
}
function storybook(env) {
  const paint = new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.55, envMap: env, envMapIntensity: 0.5 });
  const H = 1.3;
  const pole = merge([T(new THREE.CylinderGeometry(0.028, 0.034, H, 8), 0, H / 2), T(new THREE.SphereGeometry(0.05, 8, 6), 0, H + 0.03)]);
  const cloth = new THREE.MeshStandardMaterial({ map: canvas(128, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w * 0.78, h / 2); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillStyle = '#c8302a'; g.fill(); g.fillStyle = '#f2e6c4'; g.fillRect(0, h * 0.38, w * 0.85, h * 0.24); g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,240,200,0.8)'; g.lineWidth = 2; g.strokeRect(4, 4, w * 0.7, h - 8); }), roughness: 0.85, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5, envMap: env, envMapIntensity: 0.3 });
  const pen = T(new THREE.PlaneGeometry(0.42, 0.21, 4, 1), 0.22, H - 0.13, 0);
  const bow = merge([T(new THREE.TorusGeometry(0.04, 0.012, 5, 10), -0.03, H - 0.32, 0.03, 0, 0, 0.6), T(new THREE.TorusGeometry(0.04, 0.012, 5, 10), 0.03, H - 0.32, 0.03, 0, 0, -0.6), T(new THREE.BoxGeometry(0.015, 0.18, 0.004), -0.02, H - 0.42, 0.035, 0, 0, 0.2), T(new THREE.BoxGeometry(0.015, 0.16, 0.004), 0.025, H - 0.42, 0.035, 0, 0, -0.25)]);
  const bowM = new THREE.MeshStandardMaterial({ color: 0x3a62b8, roughness: 0.7, envMap: env, envMapIntensity: 0.3 });
  return [{ geo: pole, mat: paint }, { geo: pen, mat: cloth }, { geo: bow, mat: bowM }];
}
function neon(env) {
  const body = new THREE.MeshStandardMaterial({ map: canvas(64, 128, (g, w, h) => { g.fillStyle = '#23262c'; g.fillRect(0, 0, w, h); for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#d8b020' : '#16181c'; g.save(); g.translate(0, h * 0.8); g.rotate(-0.6); g.fillRect(k * 18 - 30, -8, 9, 40); g.restore(); } g.fillStyle = 'rgba(255,255,255,0.07)'; for (let i = 0; i < 80; i++) g.fillRect(Math.random() * w, Math.random() * h, 1, 2); }), roughness: 0.5, metalness: 0.5, envMap: env, envMapIntensity: 0.7 });
  const H = 1.0;
  const post = merge([T(new THREE.CylinderGeometry(0.05, 0.06, H, 8), 0, H / 2), T(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 8), 0, 0.02), T(new THREE.CylinderGeometry(0.055, 0.05, 0.04, 8), 0, H + 0.02)]);
  const cage = merge([0, 1, 2, 3].map((k) => T(new THREE.BoxGeometry(0.008, 0.26, 0.008), Math.cos(k * Math.PI / 2) * 0.045, H + 0.17, Math.sin(k * Math.PI / 2) * 0.045)).concat([T(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), 0, H + 0.31)]));
  const glow = T(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), 0, H + 0.17);
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30f0ff).multiplyScalar(1.6), toneMapped: false });
  return [{ geo: post, mat: body }, { geo: cage, mat: body }, { geo: glow, mat: glowM }];
}
const BUILD = { edo, frontier, storybook, neon };
/* null for a world with no designed stake (dark keeps its cairn in journey.js) */
export function stakeParts(world, env = null) {
  if (!BUILD[world]) return null;
  return BUILD[world](env);
}

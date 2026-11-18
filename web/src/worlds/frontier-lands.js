/* The Frontier's two lands, built from LANDKIT (web/src/lands.js) and registered by web/src/worlds/frontier.js.
   mesa      Red Mesa at dusk: red sandstone buttes and spires, the Poly Haven namaqualand cliffs and boulders, saguaro,
             a dry wash with cracked mud, a wagon, an adobe ruin with a water tower and a windmill, graves on a rise, dust.
   railhead  The Railhead at dawn: prairie grass, a rail line (instanced ties, rails along a curve), telegraph poles and
             wires, a section house and shacks, a water tower by the track, a corral, ground mist.
   Both: on the nemesis line a timber trestle spans a gorge between two bluffs, a locomotive stands on it, its smoke
   drifts across the sky (the far shape the hero walks toward). Fight rules of lands.js kept: flat inside 16 m, nothing
   solid inside 16 m, the line to the nemesis low and open up to the gorge (it starts beyond 250 m). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANDKIT as K } from '../lands.js';

const { ARENA_R, NEMESIS_ANG, TAU, FRONT, rng, hash2, fbm, ridged, smooth, clamp, lerp, angOff, polar, lineDist, bump,
  triMaterial, withCover, addGlows, addSmoke, addFogSheets, taperTube, chunkGeo, geoBox, mergeClean, buildHut, buildCart,
  buildRuin, buildBones, solid, solidAlong } = K;

/* ------------------------------------------------------------------ frame along the nemesis line
   t = metres along the line (toward the nemesis), s = metres across it (positive = to the left of the line) */
const UX = Math.cos(NEMESIS_ANG); const UZ = Math.sin(NEMESIS_ANG);
const VX = -UZ; const VZ = UX;
const at = (t, s) => [UX * t + VX * s, UZ * t + VZ * s];
const toTS = (x, z) => [x * UX + z * UZ, x * VX + z * VZ];

/* the gorge and the trestle: the same for both lands */
const GORGE_T = 282; const GORGE_W = 62; const PLATEAU = 22; const GORGE_D = -10; const SPAN = 84;
function gorgeHeight(x, z, h) {
  const [t, s] = toTS(x, z);
  if (t < 200) return h;
  /* the bluffs: a plateau beyond 250 m on the line, with a cut along the line for the gorge */
  /* the bluffs end left and right in ragged points, so the plateau is two headlands, not a shelf across the horizon */
  const edge = Math.abs(s) + (fbm(t * 0.012 + 3, s * 0.01, 3) - 0.5) * 120;
  const rise = smooth(232, 262, t + (fbm(s * 0.03, t * 0.02, 2) - 0.5) * 18) * smooth(560, 440, t + (fbm(s * 0.01, 7) - 0.5) * 120) * smooth(230, 150, edge);
  const wall = smooth(GORGE_W * 0.5 - 6, GORGE_W * 0.5 + 10, Math.abs(s) + (fbm(t * 0.05, s * 0.02 + 4, 3) - 0.5) * 14);
  const beds = (Math.floor(wall * 4) + smooth(0.3, 1, wall * 4 - Math.floor(wall * 4))) / 4;
  const top = PLATEAU + (fbm(x * 0.02, z * 0.02, 3) - 0.5) * 3;
  const plateau = lerp(GORGE_D, top, beds) + (wall > 0.02 && wall < 0.98 ? (fbm(x * 0.3, z * 0.3) - 0.5) * 1.4 : 0);
  return lerp(h, Math.max(h * 0.4, plateau), rise);
}

/* ------------------------------------------------------------------ a line index: nearest distance to a polyline, fast */
function lineIndex(pts, cell = 24, margin = 10) {
  const grid = new Map(); const key = (i, j) => i * 73856093 ^ j * 19349663;
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k]; const [bx, bz] = pts[k + 1];
    const i0 = Math.floor((Math.min(ax, bx) - margin) / cell); const i1 = Math.floor((Math.max(ax, bx) + margin) / cell);
    const j0 = Math.floor((Math.min(az, bz) - margin) / cell); const j1 = Math.floor((Math.max(az, bz) + margin) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(k); }
  }
  /* returns [distance, segment index, t along the segment] (distance 99 when nothing is within the margin) */
  return (x, z) => {
    const list = grid.get(key(Math.floor(x / cell), Math.floor(z / cell))); if (!list) return [99, -1, 0];
    let best = 99; let bi = -1; let bt = 0;
    for (const k of list) {
      const [ax, az] = pts[k]; const [bx, bz] = pts[k + 1]; const dx = bx - ax; const dz = bz - az;
      const tt = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); const d = Math.hypot(x - ax - dx * tt, z - az - dz * tt);
      if (d < best) { best = d; bi = k; bt = tt; }
    }
    return [best, bi, bt];
  };
}
/* a smooth path through (t, s) control points, sampled every `step` metres -> [[x, z, t, s], ...] */
function pathTS(ctrl, step = 2) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([t, s]) => { const [x, z] = at(t, s); return new THREE.Vector3(x, 0, z); }), false, 'centripetal');
  const n = Math.max(2, Math.round(curve.getLength() / step)); const out = [];
  for (let i = 0; i <= n; i++) { const p = curve.getPointAt(i / n); const [t, s] = toTS(p.x, p.z); out.push([p.x, p.z, t, s]); }
  return out;
}
const wander = (r, x0, z0, ang, len, step = 8, wob = 0.25) => { const pts = [[x0, z0]]; let a = ang; let x = x0; let z = z0; for (let d = 0; d < len; d += step) { a += (r() - 0.5) * wob; x += Math.cos(a) * step; z += Math.sin(a) * step; pts.push([x, z]); } return pts; };

/* ------------------------------------------------------------------ materials (made per land, owned by it) */
const wood = (tint = 0x5a4a3a, opt = {}) => triMaterial('bark_brown_02', { tint, tile: 0.9, desat: 0.5, nstr: 1.3, specMax: 0.05, ...opt });
const ironMat = (col = 0x2c2a28) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, metalness: 0.75, envMapIntensity: 0.35 });
const place = (L, g, mat, x, y, z, ry = 0, { shadow = true, grow = true } = {}) => { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow; m.receiveShadow = true; L.add(m, { grow }); return m; };
/* a box between two points with a square section (a beam, a brace, a leg) */
const beam = (a, b, w, d = w) => { const v = new THREE.Vector3().subVectors(b, a); const len = v.length(); const g = new THREE.BoxGeometry(w, len, d); g.translate(0, len / 2, 0); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.applyQuaternion(q); g.translate(a.x, a.y, a.z); return g; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cyl = (r0, r1, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y + h / 2, z); return g; };

/* ------------------------------------------------------------------ set pieces */
/* the trestle over the gorge with a locomotive, its tender and four cars on it, and the smoke. Built along the line at t = GORGE_T. */
function buildTrestle(ctx, L, { dusk = true } = {}) {
  const r = ctx.r; const H = ctx.H;
  const parts = []; const deck = []; const span = SPAN + 14;
  const yaw = Math.atan2(-VZ, VX); /* local +x runs along +s */
  const P = (s, y, off = 0) => { const [x, z] = at(GORGE_T + off, s); return V(x, y, z); };
  /* bents every 6 m: two plumb posts and two battered posts, caps and X braces per 6 m storey */
  for (let s = -span; s <= span; s += 6) {
    const g = Math.min(H(...at(GORGE_T - 2, s)), H(...at(GORGE_T + 2, s)), H(...at(GORGE_T, s))) - 0.6;
    const top = PLATEAU + 1.2; if (top - g < 1.2) continue;
    const half = 2.0 + (top - g) * 0.11;
    for (const [o0, o1] of [[-1.1, -1.1], [1.1, 1.1], [-half, -1.6], [half, 1.6]]) parts.push(beam(P(s, g, o0), P(s, top, o1), 0.32));
    for (let y = top - 6; y > g + 1; y -= 6) {
      const k = (top - y) / (top - g); const w = 1.6 + (half - 1.6) * k; const k2 = (top - y + 6) / (top - g); const w2 = 1.6 + (half - 1.6) * k2;
      parts.push(beam(P(s, y, -w - 0.3), P(s, y, w + 0.3), 0.22, 0.3));
      parts.push(beam(P(s, y, -w), P(s, Math.max(g, y - 6), w2), 0.14, 0.22), beam(P(s, y, w), P(s, Math.max(g, y - 6), -w2), 0.14, 0.22));
    }
  }
  /* longitudinal girts and the deck: stringers, ties and two rails */
  for (let y = PLATEAU - 5; y > GORGE_D; y -= 6) { const a = []; for (let s = -span; s <= span; s += 6) { const g = H(...at(GORGE_T, s)); if (g < y - 1) a.push(s); } if (a.length > 1) for (const o of [-1.1, 1.1]) parts.push(beam(P(a[0], y, o), P(a[a.length - 1], y, o), 0.18, 0.24)); }
  for (const o of [-1.0, 1.0]) parts.push(beam(P(-span - 8, PLATEAU + 1.35, o), P(span + 8, PLATEAU + 1.35, o), 0.4, 0.5));
  for (let s = -span - 8; s <= span + 8; s += 0.9) deck.push(beam(P(s, PLATEAU + 1.6, -1.5), P(s, PLATEAU + 1.6, 1.5), 0.2, 0.16));
  for (const o of [-0.72, 0.72]) deck.push(beam(P(-span - 8, PLATEAU + 1.7, o), P(span + 8, PLATEAU + 1.7, o), 0.08, 0.14));
  /* the guard rail along the deck: posts and one rail each side */
  for (let s = -span - 6; s <= span + 6; s += 4) for (const o of [-1.7, 1.7]) deck.push(beam(P(s, PLATEAU + 1.6, o), P(s, PLATEAU + 2.6, o), 0.12));
  for (const o of [-1.7, 1.7]) deck.push(beam(P(-span - 6, PLATEAU + 2.55, o), P(span + 6, PLATEAU + 2.55, o), 0.1, 0.14));
  const wm = wood(dusk ? 0x3a2c22 : 0x4a3e34, { specMax: 0.02 });
  place(L, mergeClean(parts), wm, 0, 0, 0, 0, { shadow: false });
  place(L, mergeClean(deck), wm, 0, 0, 0, 0, { shadow: false });
  /* the train: a 4-4-0 with its tender and four cars, stopped on the span, 1.35 x real size so it reads at 280 m */
  const S = 1.35; const tr = new THREE.Group(); const iron = []; const body = []; const brass = [];
  iron.push(cyl(0.85, 0.85, 6.2, 16, 0, 0, 0).rotateZ(Math.PI / 2).translate(-0.4, 2.35, 0));
  iron.push(cyl(0.9, 0.9, 1.0, 16, 0, 0, 0).rotateZ(Math.PI / 2).translate(-3.6, 2.35, 0));
  { const st = new THREE.CylinderGeometry(0.75, 0.28, 1.5, 12); st.translate(-3.6, 4.0, 0); iron.push(st); iron.push(cyl(0.22, 0.22, 0.6, 10, -3.6, 3.0, 0)); }
  brass.push(cyl(0.38, 0.42, 0.7, 12, -1.2, 3.1, 0), cyl(0.28, 0.32, 0.5, 12, 0.6, 3.1, 0));
  body.push(geoBox(2.6, 2.8, 3.0, 3.4, 3.0, 0), geoBox(3.0, 0.2, 3.3, 3.4, 4.5, 0));
  iron.push(geoBox(9.4, 0.5, 2.4, 0.4, 1.3, 0));
  for (const x of [-2.6, -1.4]) for (const z of [-1.0, 1.0]) iron.push(cyl(0.5, 0.5, 0.2, 14, 0, 0, 0).rotateX(Math.PI / 2).translate(x, 0.55, z));
  for (const x of [0.6, 2.4]) for (const z of [-1.0, 1.0]) iron.push(cyl(0.85, 0.85, 0.22, 18, 0, 0, 0).rotateX(Math.PI / 2).translate(x, 0.9, z));
  { const cc = new THREE.ConeGeometry(1.3, 1.4, 4); cc.rotateZ(Math.PI / 2); cc.rotateX(Math.PI / 4); cc.scale(0.6, 0.8, 1); cc.translate(-4.6, 0.9, 0); iron.push(cc); }
  body.push(geoBox(4.6, 2.0, 2.8, 7.6, 2.0, 0));
  for (let c = 0; c < 4; c++) { const x0 = 11.5 + c * 9.2; body.push(geoBox(8.4, 2.9, 2.9, x0 + 3.8, 2.75, 0), geoBox(8.6, 0.25, 3.1, x0 + 3.8, 4.3, 0)); iron.push(geoBox(8.6, 0.4, 2.2, x0 + 3.8, 1.1, 0)); for (const x of [x0 + 1.2, x0 + 6.4]) for (const z of [-1.0, 1.0]) iron.push(cyl(0.45, 0.45, 0.2, 12, 0, 0, 0).rotateX(Math.PI / 2).translate(x, 0.5, z)); }
  const im = ironMat(0x1c1a19); const bm = wood(0x3a1e16, { specMax: 0.02 }); const brm = new THREE.MeshStandardMaterial({ color: 0x6a5020, metalness: 0.9, roughness: 0.4, envMapIntensity: 0.6 });
  for (const [list, m] of [[iron, im], [body, bm], [brass, brm]]) { const g = mergeClean(list); tr.add(new THREE.Mesh(g, m)); L.current.owned.push(g, m); }
  const along = -SPAN * 0.18; const [tx, tz] = at(GORGE_T, along);
  tr.position.set(tx, PLATEAU + 1.75, tz); tr.rotation.y = yaw + Math.PI; tr.scale.setScalar(S);
  /* a holder at the origin so the train scales in with the trestle (the land grows parts from y = 0), never floating over a short deck */
  const holder = new THREE.Group(); holder.add(tr);
  /* the headlamp, the firebox glow under the cab, and the stack */
  holder.updateMatrixWorld(true);
  const lamp = V(-4.75, 3.2, 0).applyMatrix4(tr.matrixWorld); const fire = V(2.2, 1.6, 0).applyMatrix4(tr.matrixWorld); const stack = V(-3.6, 4.9, 0).applyMatrix4(tr.matrixWorld);
  addGlows(L, [[lamp.x, lamp.y, lamp.z, 2.2], [lamp.x, lamp.y, lamp.z, 7]], 0xffd8a0, { alpha: dusk ? 1.6 : 1.0 });
  addGlows(L, [[fire.x, fire.y, fire.z, 3.5]], 0xff6a20, { alpha: 0.8 });
  /* smoke: a dense dark column from the stack, a wide drifting sheet behind it, a puff of white steam low at the cylinders */
  const wind = [VX * -0.55 + UX * 0.1, 0, VZ * -0.55 + UZ * 0.1];
  addSmoke(L, [stack.x, stack.y, stack.z], { n: 46, size: 9, rise: 46, life: 16, wind: wind.map((w) => w * 0.6), low: 0x141110, high: dusk ? 0x6a4a3a : 0x8a8682, hot: 0x000000, alpha: 0.9 });
  addSmoke(L, [stack.x + wind[0] * 30, stack.y + 26, stack.z + wind[2] * 30], { n: 34, size: 30, rise: 60, life: 40, wind: wind.map((w) => w * 1.6), low: dusk ? 0x3a2a24 : 0x5a5654, high: dusk ? 0xb0704a : 0xc8bcb0, hot: 0x000000, alpha: 0.55 });
  const steam = V(-2.2, 0.8, 0).applyMatrix4(tr.matrixWorld);
  addSmoke(L, [steam.x, steam.y, steam.z], { n: 14, size: 3.5, rise: 6, life: 5, wind: [wind[0] * 0.4, 0, wind[2] * 0.4], low: 0x9a948c, high: 0xd8d0c8, hot: 0x000000, alpha: 0.45 });
  L.add(holder, { grow: true, owned: false });
  return { stack };
}

/* a wooden water tank on a braced trestle, iron hoops, a cone roof and a spout */
function buildWaterTower(ctx, L, x, z, rot, { tint = 0x5a4a3a, legs = 6.5 } = {}) {
  const r = ctx.r; const y0 = ctx.H(x, z) - 0.2; solid(ctx, x, z, 2.7, 'tower');
  const w = []; const ir = []; const R = 2.3; const T = 3.0; const top = legs + 0.4;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.push(beam(V(sx * 2.3, 0, sz * 2.3), V(sx * 1.55, top, sz * 1.55), 0.28));
  for (const y of [legs * 0.33, legs * 0.66]) { const k = y / top; const d = 2.3 - 0.75 * k; for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) w.push(beam(V(a[0] * d, y, a[1] * d), V(b[0] * d, y, b[1] * d), 0.16, 0.2)); }
  for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) { const d0 = 2.3; const d1 = 1.55 + 0.75 * 0.34; w.push(beam(V(a[0] * d0, 0.2, a[1] * d0), V(b[0] * d1, legs * 0.66, b[1] * d1), 0.1, 0.16)); }
  w.push(geoBox(4.4, 0.3, 4.4, 0, top, 0));
  /* the tank: staves (a ring of boards with gaps of shadow), a slightly bellied barrel */
  for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU; const b = new THREE.BoxGeometry(0.46, T, 0.1); b.translate(0, T / 2, R); b.rotateY(a); b.translate(0, top + 0.15, 0); w.push(b); }
  for (const y of [0.35, 1.3, 2.3]) { const h = new THREE.TorusGeometry(R + 0.07, 0.05, 4, 32); h.rotateX(Math.PI / 2); h.translate(0, top + 0.15 + y, 0); ir.push(h); }
  const roof = new THREE.ConeGeometry(R + 0.35, 1.3, 30, 1, true); roof.translate(0, top + T + 0.8, 0); w.push(roof);
  w.push(geoBox(0.3, 1.2, 0.3, 0, top + T + 1.6, 0));
  /* spout: a pipe out of the tank that hangs down on a chain */
  ir.push(beam(V(0, top + 0.8, R), V(0, top + 0.6, R + 1.6), 0.22), beam(V(0, top + 0.6, R + 1.6), V(0, top - 1.2, R + 2.2), 0.2));
  ir.push(beam(V(0, top + T + 0.4, R + 0.1), V(0, top - 0.4, R + 2.1), 0.03));
  /* a ladder up one leg */
  for (const s of [-0.25, 0.25]) w.push(beam(V(2.3 + s, 0, -2.6), V(1.75 + s, top + 0.1, -1.9), 0.06));
  for (let k = 1; k < 16; k++) { const t = k / 16; w.push(geoBox(0.55, 0.05, 0.05, 2.3 - 0.55 * t, top * t, -2.6 + 0.7 * t)); }
  place(L, mergeClean(w), wood(tint), x, y0, z, rot);
  place(L, mergeClean(ir), ironMat(), x, y0, z, rot);
  ctx.blobs?.push?.([x, z, 3.2]);
  return { top: y0 + top + T };
}

/* a pump windmill: a lattice tower, a wheel of 18 sails that turns, a tail vane */
function buildWindmill(ctx, L, x, z, rot, { h = 10 } = {}) {
  const y0 = ctx.H(x, z) - 0.15; solid(ctx, x, z, 1.4, 'tower');
  const t = []; const d0 = 1.3; const d1 = 0.25;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) t.push(beam(V(sx * d0, 0, sz * d0), V(sx * d1, h, sz * d1), 0.08));
  for (let k = 1; k < 6; k++) { const y = (k / 6) * h; const d = d0 + (d1 - d0) * (k / 6); const yb = ((k - 1) / 6) * h; const db = d0 + (d1 - d0) * ((k - 1) / 6);
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) { t.push(beam(V(a[0] * d, y, a[1] * d), V(b[0] * d, y, b[1] * d), 0.04)); t.push(beam(V(a[0] * db, yb, a[1] * db), V(b[0] * d, y, b[1] * d), 0.025)); } }
  t.push(geoBox(0.5, 0.4, 1.0, 0, h + 0.2, 0), beam(V(0, h + 0.3, 0.4), V(0, h + 0.35, 2.6), 0.07));
  { const vane = new THREE.BoxGeometry(0.04, 1.0, 1.6); vane.translate(0, h + 0.5, 2.6); t.push(vane); }
  t.push(beam(V(0, 0, 0), V(0, h, 0), 0.05));
  const mat = ironMat(0x3a3836);
  place(L, mergeClean(t), mat, x, y0, z, rot);
  /* the wheel: its own mesh so it can turn */
  const w = [];
  for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; const b = new THREE.BoxGeometry(0.03, 1.3, 0.26); b.rotateX(0.35); b.translate(0, 1.15, 0); b.rotateZ(a); w.push(b); }
  for (const rr of [0.5, 1.8]) { const ring = new THREE.TorusGeometry(rr, 0.03, 4, 28); w.push(ring); }
  const wg = mergeClean(w); const wheel = new THREE.Mesh(wg, mat); wheel.castShadow = true;
  const hub = new THREE.Group(); hub.position.set(x, y0 + h + 0.3, z); hub.rotation.y = rot; const off = new THREE.Group(); off.position.set(0, 0, -0.65); off.add(wheel); hub.add(off);
  L.current.group.add(hub); L.current.owned.push(wg);
  const spin = 0.6 + ctx.r() * 0.6; L.current.tickers.push((tt) => { wheel.rotation.z = tt * spin; });
}

/* a prairie schooner: wheels, the bed, hoops and a torn canvas bonnet. tipped = lost a wheel and leans */
function buildWagon(ctx, L, x, z, rot, { tipped = false, canvas = 0xb0a084 } = {}) {
  const r = ctx.r; solidAlong(ctx, x, z, rot, [[-1.3], [0], [1.3]], 1.15, 'cart');
  const w = []; const ir = []; const cv = [];
  const bed = 3.8; const bw = 1.25; const by = 1.05;
  w.push(geoBox(bed, 0.08, bw, 0, by, 0));
  for (const s of [-1, 1]) w.push(geoBox(bed, 0.55, 0.06, 0, by + 0.3, s * bw / 2), geoBox(bed + 0.1, 0.08, 0.08, 0, by + 0.58, s * bw / 2));
  for (const s of [-1, 1]) w.push(geoBox(0.06, 0.55, bw, s * bed / 2, by + 0.3, 0));
  w.push(geoBox(bed * 0.9, 0.14, 0.14, 0, by - 0.2, 0));
  /* the tongue on the ground */
  w.push(beam(V(-bed / 2 - 0.1, by - 0.25, 0), V(-bed / 2 - 2.6, 0.1, 0.2), 0.1));
  const wheel = (cx, cz, R, lost = false) => {
    const parts = []; const t = new THREE.TorusGeometry(R, 0.05, 5, 22); parts.push(t);
    for (let k = 0; k < 12; k++) { const s = new THREE.BoxGeometry(0.04, R * 2, 0.04); s.rotateZ((k / 12) * Math.PI); parts.push(s); }
    parts.push(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 10).rotateX(Math.PI / 2));
    const g = mergeClean(parts);
    if (lost) { g.rotateX(Math.PI / 2 - 0.12); g.translate(cx + 0.6, 0.1, cz * 1.9); } else g.translate(cx, R, cz);
    return g;
  };
  for (const [cx, R] of [[-1.3, 0.5], [1.25, 0.68]]) for (const s of [-1, 1]) { const lost = tipped && cx > 0 && s > 0; ir.push(wheel(cx, s * (bw / 2 + 0.12), R, lost)); }
  /* hoops and canvas: five bows, a cloth over them that hangs loose and is torn at the back */
  const hy = by + 0.6; const hr = 0.8;
  for (let i = 0; i < 5; i++) { const xx = -bed / 2 + 0.3 + i * (bed - 0.6) / 4; const hoop = new THREE.TorusGeometry(hr, 0.025, 4, 14, Math.PI); hoop.scale(1, 1.25, 1); hoop.rotateY(Math.PI / 2); hoop.translate(xx, hy, 0); w.push(hoop); }
  { const cols = 14; const rows = 10; const pos = []; const idx = []; const len = bed - 0.3;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = i / cols; const v = j / rows; const a = Math.PI * u; const xx = -len / 2 + v * len;
      const sag = 0.06 * Math.sin(v * Math.PI * 4) * Math.sin(a); const kk = hr * (1 + 0.04 * Math.sin(v * 9 + u * 7)) - sag;
      pos.push(xx + (v > 0.92 ? (r() - 0.5) * 0.3 : 0), hy + Math.sin(a) * kk * 1.25, Math.cos(a) * kk);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { if (j >= rows - 2 && r() < 0.4) continue; if (j > 3 && j < 7 && i > 8 && i < 12 && r() < 0.7) continue; const a = j * (cols + 1) + i; idx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); cv.push(g); }
  const grp = new THREE.Group(); const y0 = ctx.H(x, z);
  grp.position.set(x, y0, z); grp.rotation.set(tipped ? 0.0 : 0, rot, tipped ? -0.13 : 0);
  for (const [list, mat, sh] of [[w, wood(0x6a5440), true], [ir, ironMat(0x2a2624), true], [cv, new THREE.MeshStandardMaterial({ color: new THREE.Color(canvas).multiplyScalar(0.62), roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.06 }), true]]) {
    const g = list.length === 1 && list[0].index ? list[0] : mergeClean(list); const m = new THREE.Mesh(g, mat); m.castShadow = sh; m.receiveShadow = true; grp.add(m); L.current.owned.push(g, mat); }
  if (tipped) grp.position.y -= 0.1;
  grp.userData.growY = 1; grp.scale.y = 0.0001; L.current.parts.push(grp); L.current.group.add(grp);
}

/* saguaro: a ribbed column with arms that turn up; unit height 1, instanced */
function saguaroGeo(r, armsSet = -1) {
  const parts = [];
  const ribbed = (pts, R0, R1) => {
    const g = taperTube(pts, R0, R1, 14, Math.max(4, pts.length * 2), 0.0); const p = g.attributes.position; const n = g.attributes.normal;
    const c = new THREE.Vector3(); const curve = new THREE.CatmullRomCurve3(pts);
    const ring = 15; const segs = p.count / ring - 1;
    for (let i = 0; i <= segs; i++) { curve.getPointAt(i / segs, c); for (let j = 0; j < ring; j++) { const k = i * ring + j; const a = (j / 14) * TAU; const rib = 1 + 0.09 * Math.cos(a * 7); const vx = p.getX(k) - c.x; const vy = p.getY(k) - c.y; const vz = p.getZ(k) - c.z; p.setXYZ(k, c.x + vx * rib, c.y + vy * rib, c.z + vz * rib); } }
    g.computeVertexNormals(); return g;
  };
  const top = (pts, R) => { const s = new THREE.SphereGeometry(R, 14, 6, 0, TAU, 0, Math.PI / 2); const e = pts[pts.length - 1]; s.translate(e.x, e.y, e.z); return s; };
  const lean = (r() - 0.5) * 0.04;
  const trunk = [V(0, -0.02, 0), V(lean * 0.3, 0.35, 0), V(lean, 0.7, lean * 0.5), V(lean * 1.4, 1.0, lean)];
  const R = 0.07 + r() * 0.015; parts.push(ribbed(trunk, R, R * 0.92), top(trunk, R * 0.92));
  const arms = armsSet >= 0 ? armsSet : Math.floor(r() * 4);
  for (let i = 0; i < arms; i++) {
    const a = r() * TAU; const h0 = 0.38 + r() * 0.28; const out = 0.1 + r() * 0.08; const up = 0.18 + r() * 0.3; const ar = R * (0.62 + r() * 0.12);
    const dx = Math.cos(a); const dz = Math.sin(a);
    const pts = [V(dx * R * 0.5, h0, dz * R * 0.5), V(dx * out * 0.8, h0 + 0.01, dz * out * 0.8), V(dx * out, h0 + 0.07, dz * out), V(dx * out * 1.02, h0 + 0.07 + up * 0.6, dz * out * 1.02), V(dx * out, h0 + 0.07 + up, dz * out)];
    parts.push(ribbed(pts, ar, ar * 0.9), top(pts, ar * 0.9));
  }
  const g = mergeClean(parts);
  /* colour: darker in the rib grooves and toward the foot, a dry tan at the very foot */
  const p = g.attributes.position; const cols = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const ang = Math.atan2(p.getZ(i), p.getX(i)); const groove = 0.75 + 0.25 * Math.cos(ang * 14); c.setRGB(0.05, 0.075, 0.04).multiplyScalar(groove * (0.7 + 0.4 * smooth(0, 0.3, y))); if (y < 0.08) c.lerp(new THREE.Color(0.1, 0.08, 0.05), 1 - y / 0.08); cols.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
/* prickly pear: a low clump of flat oval pads, a few stacked on others; unit height about 1 */
function pearGeo(r) {
  const parts = []; const pad = (x, y, z, ry, rz, s) => { const g = new THREE.SphereGeometry(0.5, 10, 6); g.scale(0.36 * s, 0.46 * s, 0.07 * s); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z); parts.push(g); };
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.6; const d = 0.12 + r() * 0.14; const s = 0.8 + r() * 0.4; pad(Math.cos(a) * d, 0.18 * s, Math.sin(a) * d, -a + Math.PI / 2, (r() - 0.5) * 0.7, s);
    if (r() < 0.6) pad(Math.cos(a) * d * 1.4, 0.52 * s, Math.sin(a) * d * 1.4, -a + Math.PI / 2 + (r() - 0.5) * 0.8, (r() - 0.5) * 1.0, s * 0.8); }
  const g = mergeClean(parts);
  const p = g.attributes.position; const cols = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); c.setRGB(0.07, 0.085, 0.04).multiplyScalar(0.75 + 0.5 * smooth(0, 0.6, y)); if (y > 0.5 && (i % 7 === 0)) c.setRGB(0.16, 0.06, 0.08); cols.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
function buildSaguaros(ctx, L, list) {
  const r = ctx.r; const kinds = [0, 1, 2, 3, 2].map((a) => saguaroGeo(r, a));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, envMapIntensity: 0.12 });
  const per = kinds.map(() => []);
  /* young ones are bare columns, old tall ones carry arms; thickness varies so no two read as copies */
  for (const [x, z, h] of list) { solid(ctx, x, z, 0.5, 'cactus'); const k = h < 3.6 ? (r() < 0.6 ? 0 : 1) : 1 + Math.floor(r() * 4); const fat = 0.8 + r() * 0.45; per[k].push({ x, y: ctx.H(x, z) - 0.1, z, ry: r() * TAU, tx: (r() - 0.5) * 0.08, tz: (r() - 0.5) * 0.08, s: h * fat, sy: 1 / fat }); }
  kinds.forEach((g, k) => { if (per[k].length) L.instanced(g, mat, per[k]); else g.dispose(); });
  /* prickly pear clumps at the feet of some saguaros and alone in the open */
  const pears = [0, 1].map(() => pearGeo(r)); const pp = [[], []];
  for (const [x, z, h] of list) { if (r() < 0.45) continue; const a = r() * TAU; const d = 1.2 + r() * 2.5; const px = x + Math.cos(a) * d; const pz = z + Math.sin(a) * d; if (Math.hypot(px, pz) < 18) continue; const s = 0.6 + r() * 0.7; pp[r() < 0.5 ? 0 : 1].push({ x: px, y: ctx.H(px, pz) - 0.05, z: pz, ry: r() * TAU, tx: 0, tz: 0, s, sy: 1 }); }
  pears.forEach((g, k) => { if (pp[k].length) L.instanced(g, mat, pp[k]); else g.dispose(); });
}

/* wooden grave markers on a rise: crosses and boards, some leaning, a cairn of stones */
function buildGraves(ctx, L, cx, cz, rot, n = 7) {
  const r = ctx.r; const w = []; const st = [];
  for (let i = 0; i < n; i++) {
    const lx = (i % 4) * 1.6 - 2.4 + (r() - 0.5) * 0.3; const lz = Math.floor(i / 4) * 2.4 + (r() - 0.5) * 0.4; const h = 1.0 + r() * 0.5; const lean = (r() - 0.5) * 0.35;
    const g = [geoBox(0.1, h, 0.07, 0, h / 2 - 0.2, 0)]; if (r() < 0.7) g.push(geoBox(0.56, 0.08, 0.06, 0, h * 0.72 - 0.2, 0)); else g.push(geoBox(0.32, 0.4, 0.04, 0, h * 0.62 - 0.2, 0.04));
    const m = mergeClean(g); m.rotateZ(lean); m.rotateY((r() - 0.5) * 0.4); m.translate(lx, 0, lz); w.push(m);
    for (let k = 0; k < 6; k++) { const s = chunkGeo(r, { w: 0.3 + r() * 0.2, h: 0.2 + r() * 0.12, d: 0.25, chip: 0.3 }); s.translate(lx + (r() - 0.5) * 0.7, -0.08, lz + 0.3 + r() * 1.2); st.push(s); }
  }
  const y = ctx.H(cx, cz);
  place(L, mergeClean(w), wood(0x7a6a58, { desat: 0.7 }), cx, y, cz, rot);
  place(L, mergeClean(st), triMaterial('cliff_side', { tint: 0x9a7a62, tile: 0.8, nstr: 1.4 }), cx, y, cz, rot);
}

/* a fence: leaning posts and slack wire, or posts and rails */
function buildFence(ctx, L, pts, { rails = false, tint = 0x5a4a3a } = {}) {
  const r = ctx.r; const w = []; const wire = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]; if (Math.hypot(x, z) < ARENA_R + 1.5) continue;
    const y = ctx.H(x, z); const h = 1.2 + r() * 0.25; const lx = (r() - 0.5) * 0.18; const lz = (r() - 0.5) * 0.18;
    w.push(beam(V(x, y - 0.3, z), V(x + lx, y + h, z + lz), 0.1 + r() * 0.04));
    if (i < pts.length - 1) { const [x2, z2] = pts[i + 1]; if (Math.hypot(x2, z2) < ARENA_R + 1.5) continue; const y2 = ctx.H(x2, z2);
      if (rails) { for (const k of [0.45, 0.95]) if (r() > 0.12) w.push(beam(V(x, y + k, z), V(x2, y2 + k + (r() - 0.5) * 0.1, z2), 0.07, 0.12)); }
      else for (const k of [0.5, 0.9]) sagLine(wire, V(x, y + k, z), V(x2, y2 + k, z2), 0.12, 6);
    }
  }
  if (w.length) place(L, mergeClean(w), wood(tint, { desat: 0.6 }), 0, 0, 0, 0, { shadow: true });
  wireLines(L, wire, 0x2a2622);
}

/* ------------------------------------------------------------------ the rail line (railhead) */
function buildTrack(ctx, L, path, grade) {
  const r = ctx.r;
  /* rails: one extruded strip per rail along the path (head, web and foot in one section) */
  const pos = []; const idx = [];
  const sec = [[-0.036, 0.0], [0.036, 0.0], [0.036, 0.04], [0.012, 0.05], [0.012, 0.12], [0.032, 0.13], [0.032, 0.17], [-0.032, 0.17], [-0.032, 0.13], [-0.012, 0.12], [-0.012, 0.05], [-0.036, 0.04]];
  for (const off of [-0.72, 0.72]) {
    const base = pos.length / 3;
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)]; const b = path[Math.min(path.length - 1, i + 1)]; let dx = b[0] - a[0]; let dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nx = -dz; const nz = dx; const y = grade[i] + 0.2;
      for (const [sx, sy] of sec) pos.push(path[i][0] + nx * (off + sx), y + sy, path[i][1] + nz * (off + sx));
    }
    const m = sec.length;
    for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < m; j++) { const a = base + i * m + j; const b = base + i * m + (j + 1) % m; idx.push(a, a + m, b, b, a + m, b + m); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const rm = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.38, metalness: 0.85, envMapIntensity: 0.6 });
  /* the rail heads are polished by the wheels: bright on top, rust on the web */
  rm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vRy;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRy = normal.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRy;').replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(vec3(0.16, 0.08, 0.04), vec3(0.62, 0.6, 0.58), smoothstep(0.6, 0.95, vRy));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.85, 0.3, smoothstep(0.6, 0.95, vRy));'); };
  rm.customProgramCacheKey = () => 'fr-rail';
  const rails = new THREE.Mesh(g, rm); rails.receiveShadow = true; rails.castShadow = false; L.add(rails);
  /* ties: one every 0.62 m, a little crooked, some split */
  const tie = new THREE.BoxGeometry(2.5, 0.15, 0.24); tie.translate(0, 0.075, 0);
  const list = []; let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]; const [bx, bz] = path[i + 1]; const seg = Math.hypot(bx - ax, bz - az); const ry = Math.atan2(-(bz - az), bx - ax) + Math.PI / 2;
    for (; acc < seg; acc += 0.62) { const t = acc / seg; const x = lerp(ax, bx, t); const z = lerp(az, bz, t); if (Math.hypot(x, z) < ARENA_R + 1.2) continue; list.push({ x, y: lerp(grade[i], grade[i + 1], t) + 0.03, z, ry: ry + (r() - 0.5) * 0.07, tx: 0, tz: (r() - 0.5) * 0.03, s: 0.95 + r() * 0.1, sy: 1, delay: Math.hypot(x, z) * 0.012 }); }
    acc -= seg;
  }
  L.instanced(tie, wood(0x3a2e26, { specMax: 0.02 }), list, { shadow: false });
}
/* telegraph poles beside the track, wires that sag between them */
/* wires as 1 px line segments: a box 2 cm thick breaks into dashes at 100 m (sub-pixel), a line never does */
function wireLines(L, segs, color = 0x221c18) {
  if (!segs.length) return;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color })); m.frustumCulled = false; L.add(m);
}
const sagLine = (out, p, q, sag, n = 10) => { for (let s = 0; s < n; s++) { const u0 = s / n; const u1 = (s + 1) / n; const d = (u) => -sag * Math.sin(u * Math.PI);
  out.push(lerp(p.x, q.x, u0), lerp(p.y, q.y, u0) + d(u0), lerp(p.z, q.z, u0), lerp(p.x, q.x, u1), lerp(p.y, q.y, u1) + d(u1), lerp(p.z, q.z, u1)); } };
function buildTelegraph(ctx, L, path, grade, side = 1, every = 34, skip = null) {
  const r = ctx.r; const poles = []; const wires = []; const tops = [];
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]; const [bx, bz] = path[i + 1]; const seg = Math.hypot(bx - ax, bz - az); let dx = (bx - ax) / seg; let dz = (bz - az) / seg;
    for (; acc < seg; acc += every) { const t = acc / seg; const x = lerp(ax, bx, t) - dz * 4.2 * side; const z = lerp(az, bz, t) + dx * 4.2 * side; if (Math.hypot(x, z) < ARENA_R + 2 || skip?.(x, z)) { tops.push(null); continue; }
      const y = Math.max(ctx.H(x, z), lerp(grade[i], grade[i + 1], t) - 0.5) - 0.4; const h = 7.2 + r() * 0.6; const lean = [(r() - 0.5) * 0.12, (r() - 0.5) * 0.12];
      const topP = V(x + lean[0], y + h, z + lean[1]);
      poles.push(beam(V(x, y, z), topP, 0.2));
      /* two crossarms with three pins each */
      const pins = [];
      for (const [k, w] of [[0.35, 1.0], [1.0, 0.7]]) { const c = V(topP.x, topP.y - k, topP.z); const dir = V(-dz, 0, dx); poles.push(beam(c.clone().addScaledVector(dir, -w), c.clone().addScaledVector(dir, w), 0.1, 0.12)); for (const o of [-w * 0.85, 0, w * 0.85]) { if (k > 0.5 && o === 0) continue; const p = c.clone().addScaledVector(dir, o); p.y += 0.12; pins.push(p); poles.push(beam(V(p.x, p.y - 0.12, p.z), p, 0.05)); } }
      tops.push(pins); solid(ctx, x, z, 0.25, 'pole');
    }
    acc -= seg;
  }
  for (let i = 0; i < tops.length - 1; i++) { const a = tops[i]; const b = tops[i + 1]; if (!a || !b) continue; for (let k = 0; k < Math.min(a.length, b.length); k++) sagLine(wires, a[k], b[k], 0.9, 10); }
  place(L, mergeClean(poles), wood(0x4a3a2e, { desat: 0.6 }), 0, 0, 0, 0);
  wireLines(L, wires);
}
/* a stack of ties, a stack of rails, a handcar on the track */
function buildRailYard(ctx, L, path, grade, iCar, stacks) {
  const r = ctx.r; const w = []; const ir = [];
  for (const [x, z, ry] of stacks) { const y = ctx.H(x, z); solid(ctx, x, z, 1.8, 'prop');
    const g = []; for (let layer = 0; layer < 5; layer++) for (let k = 0; k < 6; k++) { const b = new THREE.BoxGeometry(2.5, 0.16, 0.24); if (layer % 2) b.rotateY(Math.PI / 2); b.translate(layer % 2 ? (k - 2.5) * 0.4 : (r() - 0.5) * 0.12, 0.08 + layer * 0.16, layer % 2 ? (r() - 0.5) * 0.12 : (k - 2.5) * 0.4); if (layer === 4 && r() < 0.4) continue; g.push(b); }
    const m = mergeClean(g); m.rotateY(ry); m.translate(x, y, z); w.push(m); }
  if (iCar > 0 && iCar < path.length - 2) {
    const [ax, az] = path[iCar]; const [bx, bz] = path[iCar + 1]; const ry = Math.atan2(-(bz - az), bx - ax); const y = grade[iCar] + 0.37;
    const car = [geoBox(2.4, 0.12, 1.7, 0, 0.5, 0), geoBox(0.12, 1.0, 0.12, 0, 1.0, 0), geoBox(0.08, 0.08, 1.4, 0, 1.5, 0)];
    const hw = []; for (const cx of [-0.8, 0.8]) for (const s of [-0.72, 0.72]) hw.push(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12).rotateX(Math.PI / 2).translate(cx, 0.3, s));
    const g1 = mergeClean(car); g1.rotateY(ry); g1.translate(ax, y - 0.37, az); w.push(g1); const g2 = mergeClean(hw); g2.rotateY(ry); g2.translate(ax, y - 0.37, az); ir.push(g2);
  }
  if (w.length) place(L, mergeClean(w), yardWood(0x9a7c5a), 0, 0, 0, 0).name = 'fr-railyard'; /* weathered grey-brown, finer grain: it read as black boxes */
  if (ir.length) place(L, mergeClean(ir), ironMat(), 0, 0, 0, 0);
}
/* small stacked wood at dawn faces away from the low sun and read pure black: a little bounce light (emissive) */
const yardWood = (tint, opt) => { const m = wood(tint, { tile: 2.2, desat: 0.35, ...opt }); m.emissive.set(0x2a1c12); m.envMapIntensity = 0.5; return m; };
/* track-side clutter near the arena: barrel groups, coal heaps, loose and stacked ties, a crate, a handcar off the rails */
function buildTrackside(ctx, L, f) {
  const r = ctx.r; const staves = []; const hoops = []; const coal = []; const ties = []; const crates = [];
  const spots = []; for (let i = 0; i < f.path.length - 1; i += 1) { const [x, z, t] = f.pathTS[i]; if (t < -90 || t > 120) continue; spots.push(i); }
  const side = (i, off) => { const [ax, az] = f.path[i]; const [bx, bz] = f.path[i + 1]; const l = Math.hypot(bx - ax, bz - az) || 1; const nx = -(bz - az) / l; const nz = (bx - ax) / l; return [ax + nx * off, az + nz * off, Math.atan2(-(bz - az), bx - ax)]; };
  const ok = (x, z, R) => Math.hypot(x, z) > 18 + R && !ctx.solids.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + R + 0.5);
  const barrel = (x, y, z, tip) => { const g = new THREE.CylinderGeometry(0.29, 0.29, 0.86, 12); const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const yy = p.getY(k); const b = 1 + 0.12 * (1 - (yy / 0.43) ** 2); p.setX(k, p.getX(k) * b); p.setZ(k, p.getZ(k) * b); } g.computeVertexNormals();
    const hs = [-0.3, 0.3].map((hy) => new THREE.TorusGeometry(0.31 + 0.02, 0.018, 4, 14).rotateX(Math.PI / 2).translate(0, hy, 0));
    const lift = tip ? 0.32 : 0.43; for (const q of [g, ...hs]) { if (tip) q.rotateZ(Math.PI / 2); q.rotateY(r() * TAU); q.translate(x, y + lift, z); } staves.push(g); hoops.push(...hs); };
  let nB = 0; let nC = 0; let nT = 0; let nK = 0;
  for (let tries = 0; tries < 120; tries++) {
    const i = spots[Math.floor(r() * spots.length)]; const sgn = r() < 0.5 ? 1 : -1; const off = sgn * (3.6 + r() * 4); const [x, z, ry] = side(i, off); const y = ctx.H(x, z);
    const kind = nB < 5 ? 0 : nC < 3 ? 1 : nT < 6 ? 2 : nK < 2 ? 3 : -1; if (kind < 0) break;
    if (kind === 0 && ok(x, z, 1.2)) { const n = 2 + Math.floor(r() * 3); for (let b = 0; b < n; b++) { const bx = x + (r() - 0.5) * 1.6; const bz = z + (r() - 0.5) * 1.6; barrel(bx, ctx.H(bx, bz), bz, b === n - 1 && r() < 0.5); } solid(ctx, x, z, 1.1, 'prop'); nB++; }
    else if (kind === 1 && ok(x, z, 2.2)) { const g = new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2); const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const px = p.getX(k); const pz = p.getZ(k); const n = 0.75 + 0.5 * fbm(px * 3 + x, pz * 3 + z, 2); p.setXYZ(k, px * 1.9 * n, p.getY(k) * 0.9 * n, pz * 1.5 * n); } g.computeVertexNormals(); g.rotateY(r() * TAU); g.translate(x, y - 0.1, z); coal.push(g); solid(ctx, x, z, 1.8, 'prop'); nC++; }
    else if (kind === 2 && ok(x, z, 1.4)) { const n = 1 + Math.floor(r() * 4); for (let k = 0; k < n; k++) { const b = new THREE.BoxGeometry(2.5, 0.16, 0.24); b.rotateY(ry + (r() - 0.5) * 1.2); b.rotateX((r() - 0.5) * 0.15); const tx = x + (r() - 0.5) * 1.8; const tz = z + (r() - 0.5) * 1.8; b.translate(tx, ctx.H(tx, tz) + 0.06 + (k > 1 ? 0.16 : 0), tz); ties.push(b); } nT++; }
    else if (kind === 3 && ok(x, z, 1.0)) { for (let k = 0; k < 1 + Math.floor(r() * 2); k++) { const s = 0.7 + r() * 0.3; const b = new THREE.BoxGeometry(s, s * 0.8, s); b.rotateY(ry + r()); b.translate(x + k * 0.9, y + s * 0.4 + (k ? 0 : 0), z + k * 0.3); crates.push(b); } solid(ctx, x, z, 0.9, 'prop'); nK++; }
  }
  if (staves.length) place(L, mergeClean(staves), wood(0x4a3424, { specMax: 0.03 }), 0, 0, 0, 0);
  if (hoops.length) place(L, mergeClean(hoops), ironMat(0x2a2624), 0, 0, 0, 0);
  if (coal.length) place(L, mergeClean(coal), triMaterial('rock', { tint: 0x1a1816, tile: 2, desat: 0.8, nstr: 1.5, specMax: 0.15 }), 0, 0, 0, 0);
  if (ties.length) place(L, mergeClean(ties), yardWood(0x8a6e50), 0, 0, 0, 0).name = 'fr-ties';
  if (crates.length) place(L, mergeClean(crates), yardWood(0xc0a078, { tile: 2.6, desat: 0.3 }), 0, 0, 0, 0).name = 'fr-crates';
}
/* a semaphore signal: a mast, an arm, a lamp */
function buildSignal(ctx, L, x, z, rot) {
  const y = ctx.H(x, z); solid(ctx, x, z, 0.4, 'pole');
  const g = [cyl(0.09, 0.12, 6.5, 8, 0, 0, 0), geoBox(1.6, 0.26, 0.05, 0.85, 5.8, 0.12), geoBox(0.3, 0.3, 0.3, 0, 6.6, 0), geoBox(0.5, 0.06, 0.5, 0, 6.8, 0)];
  for (let k = 1; k < 11; k++) g.push(geoBox(0.35, 0.03, 0.03, 0, k * 0.55, -0.12));
  const m = place(L, mergeClean(g), ironMat(0x3a2a24), x, y, z, rot);
  const p = new THREE.Vector3(0, 6.6, 0.18).applyEuler(new THREE.Euler(0, rot, 0)); addGlows(L, [[x + p.x, y + p.y, z + p.z, 0.4], [x + p.x, y + p.y, z + p.z, 1.6]], 0xff3a20, { alpha: 1.2 });
  return m;
}

/* ------------------------------------------------------------------ the railhead town
   A main street of false-front buildings at right angles to the track, a depot with a platform beside the rails, and a
   stock yard with pens, tents and a freight shed on the other side of the arena. Everything is boxes with real UVs and
   a vertex colour (paint), merged into one mesh per material: board siding, shingles, dark glass, lit glass, painted
   signs, canvas. Local frame per building: x across the front, +z toward the street, y up, origin = centre on the ground. */
const SIGNS = [
  ['SALOON', '#5a1e14', '#f0dcb0'], ['GENERAL STORE', '#e4d4b2', '#2a1a10'], ['HOTEL', '#2a2a26', '#e8d8b8'], ['BANK', '#1e2a22', '#e0c070'],
  ['BARBER', '#e8dcc4', '#6a1a12'], ['ASSAY OFFICE', '#3a2a1c', '#e8d8b0'], ['FEED & SEED', '#d8c8a0', '#3a2414'], ['LIVERY STABLE', '#4a2414', '#ecdcb8'],
  ['RAILHEAD', '#2a1c12', '#f2e0b8'], ['FREIGHT', '#d8c8a8', '#2a1c12'],
];
const SIGN_ROW = Object.fromEntries(SIGNS.map(([t], i) => [t, i]));
function signTexture() {
  const N = SIGNS.length; const c = document.createElement('canvas'); c.width = 1024; c.height = 128 * N; const g = c.getContext('2d');
  SIGNS.forEach(([text, bg, ink], i) => {
    const y = i * 128; const r = rng(31 + i * 7);
    g.fillStyle = bg; g.fillRect(0, y, 1024, 128);
    for (let k = 0; k < 70; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,12,6' : '240,226,200'},${0.03 + r() * 0.08})`; g.fillRect(r() * 1024, y + r() * 128, 30 + r() * 220, 2 + r() * 4); }
    g.globalAlpha = 0.8; g.strokeStyle = ink; g.lineWidth = 5; g.strokeRect(14, y + 14, 996, 100); g.globalAlpha = 1;
    let size = 86; const sp = text.length > 9 ? 8 : 22;
    for (;;) { g.font = `bold ${size}px Georgia, 'Times New Roman', serif`; g.letterSpacing = `${sp}px`; if (g.measureText(text).width < 900 || size < 40) break; size -= 4; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, 515, y + 69);
    g.fillStyle = ink; g.fillText(text, 512, y + 66);
    for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(${r() < 0.6 ? '10,6,2' : '250,240,220'},${0.05 + r() * 0.15})`; g.fillRect(r() * 1024, y + r() * 128, 1 + r() * 3, 1 + r() * 2); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
/* board-and-batten siding, light grey so the vertex paint tints it; one tile = 2 m */
function sidingTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = rng(1873);
  g.fillStyle = '#c8bcaa'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const x0 = i * 32; const l = 180 + Math.floor(r() * 50);
    g.fillStyle = `rgb(${l},${l - 10},${l - 24})`; g.fillRect(x0, 0, 32, 256);
    for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(${r() < 0.6 ? '40,26,14' : '255,245,225'},${0.06 + r() * 0.12})`; g.lineWidth = 0.6 + r() * 1.4; g.beginPath(); let x = x0 + r() * 32; g.moveTo(x, 0); for (let y = 0; y <= 256; y += 16) { x += (r() - 0.5) * 1.2; g.lineTo(x, y); } g.stroke(); }
    if (r() < 0.4) { const y = r() * 256; g.fillStyle = 'rgba(30,20,10,0.5)'; g.fillRect(x0, y, 32, 2); }
    g.fillStyle = 'rgba(24,16,8,0.85)'; g.fillRect(x0, 0, 2, 256);
    g.fillStyle = 'rgba(255,245,225,0.18)'; g.fillRect(x0 + 2, 0, 3, 256);
    g.fillStyle = 'rgba(30,20,10,0.5)'; for (let y = 24; y < 256; y += 64) g.fillRect(x0 + 15, y, 2, 2);
  }
  /* weathering: faint dark streaks running down */
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(30,20,12,${0.04 + r() * 0.06})`; g.fillRect(r() * 256, r() * 128, 2 + r() * 6, 60 + r() * 120); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
/* duck canvas with a weave, seams, a
   darker hem of dust and water stains, light so the vertex paint tints it; one tile = 2 m */
function canvasTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = rng(1867);
  g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) { g.fillStyle = `rgba(60,44,28,${0.03 + r() * 0.04})`; g.fillRect(0, y, 128, 1); }
  for (let x = 0; x < 128; x += 2) { g.fillStyle = `rgba(255,248,232,${0.02 + r() * 0.04})`; g.fillRect(x, 0, 1, 128); }
  for (const x of [0, 42, 86]) { g.fillStyle = 'rgba(70,52,34,0.35)'; g.fillRect(x, 0, 2, 128); }
  const hem = g.createLinearGradient(0, 0, 0, 40); hem.addColorStop(0, 'rgba(70,50,30,0.55)'); hem.addColorStop(1, 'rgba(70,50,30,0)'); g.fillStyle = hem; g.fillRect(0, 0, 128, 40);
  for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(80,58,36,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * 128, r() * 128, 4 + r() * 14, 3 + r() * 9, r() * 3, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
/* wood shingles in rows; one tile = 2 m */
function shingleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = rng(1881);
  g.fillStyle = '#a89c8c'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    let x = -r() * 20;
    while (x < 256) { const w = 12 + r() * 20; const l = 140 + Math.floor(r() * 80); g.fillStyle = `rgb(${l},${l - 8},${l - 18})`; g.fillRect(x, y, w, 16); g.fillStyle = 'rgba(20,14,8,0.7)'; g.fillRect(x, y, 1.5, 16); x += w; }
    g.fillStyle = 'rgba(16,10,6,0.75)'; g.fillRect(0, y + 13, 256, 3);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

function townKit() {
  const out = { wood: [], roof: [], glass: [], lit: [], sign: [], canvas: [] };
  let local = [];
  const C = new THREE.Color();
  const paint = (g, hex) => { C.set(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = C.r; a[i * 3 + 1] = C.g; a[i * 3 + 2] = C.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const T = {
    /* a box with UVs in metres (tile = metres per texture repeat) */
    box(bucket, w, h, d, x, y, z, hex, { rx = 0, ry = 0, rz = 0, tile = 2 } = {}) {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); const uv = g.attributes.uv;
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let i = 0; i < uv.count; i++) { const [a, b] = dims[Math.floor(i / 6)]; uv.setXY(i, uv.getX(i) * a / tile, uv.getY(i) * b / tile); }
      if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z);
      local.push([bucket, paint(g, hex)]); return g;
    },
    /* a plank between two points in the y-z plane (a roof slab, a ramp) */
    slabYZ(bucket, w, th, y0, z0, y1, z1, x, hex, tile = 2) { const len = Math.hypot(y1 - y0, z1 - z0); return T.box(bucket, w, th, len, x, (y0 + y1) / 2, (z0 + z1) / 2, hex, { rx: -Math.atan2(y1 - y0, z1 - z0), tile }); },
    /* a gable triangle in the x-y plane at depth z, both faces */
    gable(bucket, w, y0, h, z, hex, x = 0, tile = 2) {
      const p = [x - w / 2, y0, z, x + w / 2, y0, z, x, y0 + h, z]; const pos = [...p, p[0], p[1], p[2], p[6], p[7], p[8], p[3], p[4], p[5]];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const uv = []; for (let i = 0; i < 6; i++) uv.push((pos[i * 3] - x + w / 2) / tile, (pos[i * 3 + 1] - y0) / tile);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); local.push([bucket, paint(g, hex)]); return g;
    },
    cyl(bucket, rad, h, x, y, z, hex, seg = 10, tile = 2) {
      const g = new THREE.CylinderGeometry(rad, rad, h, seg).toNonIndexed(); const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * rad / tile, uv.getY(i) * h / tile);
      g.translate(x, y + h / 2, z); local.push([bucket, paint(g, hex)]); return g;
    },
    /* a painted sign (atlas row), facing +z, rotated ry about y */
    sign(row, w, h, x, y, z, ry = 0) {
      const g = new THREE.PlaneGeometry(w, h).toNonIndexed(); const uv = g.attributes.uv; const N = SIGNS.length;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / N);
      if (ry) g.rotateY(ry); g.translate(x, y, z); local.push(['sign', paint(g, 0xffffff)]); return g;
    },
    /* moves the parts built since the last put into the world */
    put(x, y, z, ry) { for (const [b, g] of local) { g.rotateY(ry); g.translate(x, y, z); out[b].push(g); } local = []; },
    finish(L) {
      const mats = {
        wood: new THREE.MeshStandardMaterial({ map: sidingTexture(), vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.2 }),
        roof: new THREE.MeshStandardMaterial({ map: shingleTexture(), vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.2 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x100c09, roughness: 0.55, metalness: 0, envMapIntensity: 0.2 }),
        lit: new THREE.MeshStandardMaterial({ color: 0x2a1a10, emissive: 0xffa456, emissiveIntensity: 0.85, roughness: 0.4 }),
        sign: new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.85, envMapIntensity: 0.2 }),
        canvas: new THREE.MeshStandardMaterial({ map: canvasTexture(), vertexColors: true, roughness: 1, envMapIntensity: 0.15, side: THREE.DoubleSide }),
      };
      for (const k of ['wood', 'roof', 'sign', 'canvas']) L.current.owned.push(mats[k].map);
      for (const [k, list] of Object.entries(out)) {
        if (!list.length) { mats[k].map?.dispose(); mats[k].dispose(); continue; }
        const g = mergeGeometries(list); for (const p of list) p.dispose();
        place(L, g, mats[k], 0, 0, 0, 0, { shadow: k !== 'sign' && k !== 'lit' });
      }
    },
  };
  return T;
}

/* a false-front store: the body, a tall square front with a cornice (stepped = a raised centre panel), a porch on posts
   (two storeys: a balcony with a rail), a door, windows (some lit), a painted sign, side windows, a hitching rail */
function falseFront(T, r, o) {
  const { W, D, H, F, paint, trim = 0x3a2c20, roof = 0x6a5a4c, deck = 0x5a4836, sign = null, two = false, step = false, lit = 0.45, store = false, chimney = false } = o;
  const fz = D / 2; const ft = 0.2; const FW = W + 0.3; const zf = fz + ft / 2; const zw = fz + ft;
  T.box('wood', W, H + 0.4, D, 0, (H - 0.4) / 2, 0, paint);
  /* the gable roof behind the front, ridge along the depth */
  const rh = Math.min(1.5, W * 0.18); const a = Math.atan2(rh, W / 2); const sl = (W / 2 + 0.35) / Math.cos(a);
  for (const s of [-1, 1]) T.box('roof', sl, 0.12, D + 0.25, s * (sl / 2) * Math.cos(a), H + rh - (sl / 2) * Math.sin(a) + 0.04, -0.12, roof, { rz: -s * a });
  T.gable('wood', W, H, rh, -D / 2, paint);
  if (chimney) T.box('wood', 0.5, 1.6, 0.5, W * 0.22, H + rh * 0.6 + 0.6, -D * 0.2, 0x4a3a30);
  /* the front */
  const top = step ? F - 1.0 : F;
  T.box('wood', FW, top + 0.4, ft, 0, (top - 0.4) / 2, zf, paint);
  T.box('wood', FW + 0.35, 0.24, 0.42, 0, top + 0.06, zf + 0.06, trim); T.box('wood', FW + 0.12, 0.1, 0.3, 0, top - 0.17, zf + 0.04, trim);
  if (step) { const w2 = FW * 0.52; T.box('wood', w2, 1.0, ft, 0, F - 0.5, zf, paint); T.box('wood', w2 + 0.3, 0.22, 0.4, 0, F + 0.05, zf + 0.06, trim); }
  for (const s of [-1, 1]) T.box('wood', 0.24, top + 0.2, 0.28, s * (FW / 2 - 0.1), (top - 0.2) / 2, zf + 0.03, trim);
  /* door and windows on the ground floor (the porch floor is at 0.45) */
  const win = (x, y, w, h, z, litK, panes = 1) => {
    T.box(r() < litK ? 'lit' : 'glass', w, h, 0.05, x, y, z, 0);
    T.box('wood', w + 0.24, 0.1, 0.12, x, y + h / 2 + 0.05, z + 0.02, trim); T.box('wood', w + 0.3, 0.08, 0.18, x, y - h / 2 - 0.04, z + 0.04, trim);
    for (const s of [-1, 1]) T.box('wood', 0.1, h, 0.1, x + s * (w / 2 + 0.05), y, z + 0.02, trim);
    T.box('wood', 0.05, h, 0.06, x, y, z + 0.03, trim); if (panes > 1) T.box('wood', w, 0.05, 0.06, x, y, z + 0.03, trim);
  };
  const dx = store ? 0 : (r() - 0.5) * W * 0.3;
  T.box('glass', 1.25, 2.3, 0.05, dx, 0.45 + 1.15, zw + 0.01, 0);
  for (const s of [-1, 1]) T.box('wood', 0.12, 2.4, 0.12, dx + s * 0.68, 0.45 + 1.2, zw + 0.03, trim);
  T.box('wood', 1.6, 0.14, 0.14, dx, 0.45 + 2.42, zw + 0.03, trim);
  if (o.batwing) for (const s of [-1, 1]) T.box('wood', 0.56, 1.0, 0.05, dx + s * 0.3, 1.75, zw + 0.06, 0x6a4a2e);
  const ww = store ? Math.min(2.2, (W - 2.4) / 2 - 0.4) : 1.25; const wh = store ? 1.9 : 1.55;
  for (const s of [-1, 1]) { const x = store ? s * (0.95 + ww / 2 + 0.2) : s * W * 0.3 + (s * W * 0.3 - dx > 0 ? 0 : 0); if (Math.abs(x - dx) < 1.4) continue; win(x, 0.45 + (store ? 1.55 : 1.55), ww, wh, zw + 0.01, lit, 2); }
  if (two) {
    const n = W > 8.5 ? 3 : 2; for (let i = 0; i < n; i++) win(-W / 2 + (i + 0.5) * W / n, H * 0.5 + 1.75, 1.0, 1.45, zw + 0.01, lit * 0.8, 2);
  }
  /* side windows */
  for (const s of [-1, 1]) if (r() < 0.8) T.box(r() < lit * 0.6 ? 'lit' : 'glass', 0.05, 1.3, 1.1, s * (W / 2 + 0.03), 1.9, -D * 0.1 + (r() - 0.5) * D * 0.3, 0);
  /* the sign */
  if (sign != null) {
    const lo = two ? H * 0.5 + 2.65 : 3.75; const hi = top - 0.35; const sh = Math.min(1.15, hi - lo); const sw = Math.min(FW - 0.9, sh * 7.5); const sy = (lo + hi) / 2;
    if (sh > 0.4) { T.box('wood', sw + 0.26, sh + 0.26, 0.08, 0, sy, zw + 0.04, trim); T.sign(SIGN_ROW[sign], sw, sh, 0, sy, zw + 0.09); }
  }
  /* the porch: a deck, a step, posts, a shed roof (two storeys: a balcony deck with a rail and a roof over it) */
  const pd = 2.6; const pz = zw + pd / 2;
  T.box('wood', FW + 0.2, 0.55, pd, 0, 0.18, pz, deck, { tile: 1 });
  for (let k = 0; k < Math.round(pd / 0.3); k++) T.box('wood', FW + 0.2, 0.02, 0.025, 0, 0.455, zw + 0.15 + k * 0.3, 0x2a2018);
  T.box('wood', 1.8, 0.22, 0.42, 0, 0.11, zw + pd + 0.2, deck);
  const n = Math.max(2, Math.round(FW / 2.8)) + 1; const pzz = zw + pd - 0.15;
  const ph = two ? 3.2 : 2.95;
  for (let i = 0; i < n; i++) { const x = -FW / 2 + 0.15 + i * (FW - 0.3) / (n - 1); T.box('wood', 0.17, ph, 0.17, x, 0.45 + ph / 2, pzz, trim); }
  T.box('wood', FW + 0.2, 0.2, 0.22, 0, 0.45 + ph, pzz, trim);
  if (two) {
    const by = 0.45 + ph + 0.15; T.box('wood', FW + 0.2, 0.18, pd + 0.1, 0, by, pz, deck);
    T.box('wood', FW + 0.2, 0.1, 0.12, 0, by + 0.95, pzz, trim); T.box('wood', FW + 0.2, 0.08, 0.1, 0, by + 0.2, pzz, trim);
    for (let x = -FW / 2 + 0.15; x < FW / 2; x += 0.32) T.box('wood', 0.05, 0.75, 0.05, x, by + 0.55, pzz, trim);
    for (let i = 0; i < n; i++) { const x = -FW / 2 + 0.15 + i * (FW - 0.3) / (n - 1); T.box('wood', 0.14, 2.4, 0.14, x, by + 1.2, pzz, trim); }
    T.slabYZ('roof', FW + 0.4, 0.1, by + 2.55, zw - 0.05, by + 2.25, zw + pd + 0.25, 0, roof);
  } else T.slabYZ('roof', FW + 0.4, 0.1, 0.45 + ph + 0.5, zw - 0.05, 0.45 + ph + 0.12, zw + pd + 0.25, 0, roof);
  /* a hitching rail and a trough in the street */
  if (o.rail !== false) {
    const hz = zw + pd + 1.5; const hw = Math.min(2.4, FW * 0.3); const hx = (r() - 0.5) * FW * 0.3;
    for (const s of [-1, 1]) T.box('wood', 0.16, 1.15, 0.16, hx + s * hw, 0.5, hz, 0x4a3a2c);
    T.box('wood', hw * 2 + 0.4, 0.12, 0.12, hx, 1.05, hz, 0x4a3a2c);
    if (r() < 0.5) { T.box('wood', 1.8, 0.55, 0.6, hx + (r() < 0.5 ? -1 : 1) * (hw + 1.4), 0.27, hz, 0x4e3e2e); T.box('glass', 1.6, 0.04, 0.42, hx, 0.5, hz, 0); }
  }
}

/* a gable-fronted barn or shed (livery, freight): the gable faces +z, big doors, a hay door, a sign under the apex */
function barn(T, r, o) {
  const { W, D, H, rh, paint, trim = 0x3a2a1e, roof = 0x5a4a40, sign = null, lean = true } = o;
  T.box('wood', W, H + 0.4, D, 0, (H - 0.4) / 2, 0, paint);
  const a = Math.atan2(rh, W / 2); const sl = (W / 2 + 0.5) / Math.cos(a);
  for (const s of [-1, 1]) T.box('roof', sl, 0.14, D + 0.8, s * (sl / 2) * Math.cos(a), H + rh - (sl / 2) * Math.sin(a) + 0.05, 0, roof, { rz: -s * a });
  for (const z of [-D / 2, D / 2]) T.gable('wood', W, H, rh, z, paint);
  const zw = D / 2 + 0.03;
  T.box('glass', 3.6, 3.6, 0.05, 0, 1.8, zw, 0); T.box('wood', 4.2, 0.2, 0.2, 0, 3.7, zw + 0.06, trim);
  for (const s of [-1, 1]) { T.box('wood', 0.2, 3.7, 0.2, s * 1.9, 1.85, zw + 0.06, trim); }
  /* the left door stands open
     on its rail, the right one is slid half across the opening; inside the dark: a lantern lit on a post, hay bales stacked
     in the doorway and a pitch of loose hay, so the opening reads as a lived-in barn, not a missing texture */
  T.box('wood', 1.9, 3.5, 0.08, -3.0, 1.75, zw + 0.1, paint); T.box('wood', 0.12, 4.0, 0.1, -3.05, 1.75, zw + 0.16, trim, { rz: -0.85 });
  T.box('wood', 1.9, 3.5, 0.08, 0.95, 1.75, zw + 0.14, paint); T.box('wood', 0.12, 4.0, 0.1, 0.95, 1.75, zw + 0.2, trim, { rz: 0.85 });
  for (let k = 0; k < 4; k++) T.box('wood', 1.9, 0.08, 0.1, 0.95, 0.35 + k * 1.0, zw + 0.2, trim);
  T.box('lit', 0.22, 0.3, 0.05, -1.35, 2.5, zw + 0.06, 0); T.box('wood', 0.3, 0.06, 0.12, -1.35, 2.7, zw + 0.08, 0x2a2420);
  for (const [x, y, z, ry] of [[-1.1, 0.25, 0.45, 0.1], [-0.3, 0.25, 0.6, -0.15], [-0.75, 0.75, 0.5, 0.05], [-1.5, 0.25, 0.9, 0.4]]) T.box('wood', 0.85, 0.5, 0.48, x, y, zw + z, 0xb89a5a, { ry });
  T.box('wood', 1.6, 0.18, 1.2, -0.9, 0.09, zw + 1.3, 0x9a8048, { ry: 0.3 });
  T.box('wood', 6.4, 0.16, 0.16, 0, 3.85, zw + 0.2, 0x2a2420);
  T.box('glass', 1.3, 1.3, 0.05, 0, H + rh * 0.32, zw, 0); T.box('wood', 1.6, 0.12, 0.12, 0, H + rh * 0.32 + 0.72, zw + 0.04, trim);
  T.box('wood', 0.16, 0.16, 1.4, 0, H + rh * 0.62, zw + 0.6, trim);
  if (sign != null) { const sw = Math.min(W - 2, 5.4); const sy = H + 0.15; T.box('wood', sw + 0.24, 0.94, 0.08, 0, sy, zw + 0.06, trim); T.sign(SIGN_ROW[sign], sw, 0.7, 0, sy, zw + 0.11); }
  for (const s of [-1, 1]) T.box('wood', 0.22, H + 0.3, 0.22, s * (W / 2 + 0.02), (H - 0.3) / 2, zw, trim);
  /* board-and-batten on the sides and the back, a back door and
     a small window, so no wall is a plain plane */
  for (let x = -W / 2 + 0.6; x < W / 2 - 0.3; x += 1.1) T.box('wood', 0.1, H - 0.1, 0.08, x, (H - 0.1) / 2 - 0.05, -D / 2 - 0.04, trim);
  for (const s of [-1, 1]) if (!(lean && s > 0)) for (let z = -D / 2 + 0.6; z < D / 2 - 0.3; z += 1.1) T.box('wood', 0.08, H - 0.1, 0.1, s * (W / 2 + 0.04), (H - 0.1) / 2 - 0.05, z, trim);
  T.box('wood', W + 0.1, 0.16, 0.12, 0, H - 0.05, -D / 2 - 0.06, trim); T.box('wood', W + 0.1, 0.2, 0.12, 0, 0.1, -D / 2 - 0.06, trim);
  T.box('glass', 1.1, 2.3, 0.05, -W * 0.22, 1.15, -D / 2 - 0.03, 0); T.box('wood', 1.4, 0.14, 0.14, -W * 0.22, 2.35, -D / 2 - 0.08, trim);
  T.box('glass', 0.9, 0.8, 0.05, W * 0.25, 2.3, -D / 2 - 0.03, 0); T.box('wood', 1.1, 0.1, 0.12, W * 0.25, 1.85, -D / 2 - 0.08, trim);
  if (lean) { const lw = 3.6; T.box('wood', lw, H * 0.62, D * 0.7, W / 2 + lw / 2, H * 0.31 - 0.2, -D * 0.1, paint);
    /* battens on the lean-to's open faces too (its end wall read as a flat beige plane) */
    for (let zz = -D * 0.45 + 0.5; zz < D * 0.25 - 0.2; zz += 1.0) T.box('wood', 0.1, H * 0.6, 0.08, W / 2 + lw + 0.04, H * 0.3 - 0.2, zz, trim, { ry: Math.PI / 2 });
    for (const zs of [-1, 1]) for (let xx = W / 2 + 0.5; xx < W / 2 + lw - 0.2; xx += 1.0) T.box('wood', 0.1, H * 0.6, 0.08, xx, H * 0.3 - 0.2, -D * 0.1 + zs * (D * 0.35 + 0.04), trim);
    T.box('glass', 0.05, 0.7, 0.9, W / 2 + lw + 0.03, H * 0.38, -D * 0.1, 0); T.box('roof', lw + 0.6, 0.12, D * 0.7 + 0.6, W / 2 + lw / 2, H * 0.62 + 0.2, -D * 0.1, roof, { rz: -0.22 }); }
}

/* the depot: a long ochre station with a deep roof over the platform on posts, a telegrapher's bay, a freight room at one
   end, the town name on both gable ends and the front wall; the platform runs past both ends. Front (+z) = the track. */
function depot(T, r, o) {
  const W = 14; const D = 6; const H = 3.9; const P = 0.85; const paint = 0xa8874e; const trim = 0x4a2e1a; const roof = 0x5a4434;
  const PL = 30; const PD = 3.9; const pz = D / 2 + PD / 2 - 0.2;
  T.box('wood', PL, P + 0.5, PD, 2, (P - 0.5) / 2, pz, 0x4e4032, { tile: 1 });
  for (let x = -PL / 2 + 2.3; x < PL / 2 + 2; x += 0.32) T.box('wood', 0.025, 0.02, PD, x, P + 0.01, pz, 0x2a2018);
  T.box('wood', PL, 0.24, 0.24, 2, P - 0.1, D / 2 + PD - 0.2, 0x3a2e24);
  T.box('wood', PL * 0.6, P + 0.4, D + 1.5, 2, (P - 0.4) / 2, -0.2, 0x4e4032, { tile: 1 });
  /* the station body on the platform */
  T.box('wood', W, H + 0.3, D, 0, P + (H - 0.3) / 2, 0, paint);
  T.box('wood', W + 0.1, 0.9, D + 0.1, 0, P + 0.45, 0, 0x7a5a32);
  T.box('wood', W + 0.14, 0.1, D + 0.14, 0, P + 0.92, 0, trim);
  /* the roof: ridge along x; the front slab runs on out over the platform */
  const ry0 = P + H + 1.7;
  T.slabYZ('roof', W + 1.2, 0.14, ry0, 0.05, P + H - 0.3, -D / 2 - 0.9, 0, roof);
  T.slabYZ('roof', W + 1.2, 0.14, ry0, -0.05, P + H - 0.75, D / 2 + PD - 0.1, 0, roof);
  for (const s of [-1, 1]) { const g = T.gable('wood', D, P + H, 1.7, 0, paint, 0); g.rotateY(Math.PI / 2); g.translate(s * W / 2, 0, 0); }
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) T.box('wood', 0.1, 0.1, 0.9, s * (W / 2 + 0.3), P + H - 0.2, -2.2 + i * 1.1, trim, { rx: 0.5 });
  /* posts and braces under the deep roof, a fascia board along its edge */
  for (let x = -W / 2 - 0.2; x <= W / 2 + 0.3; x += 3.6) { T.box('wood', 0.2, H - 0.2, 0.2, x, P + (H - 0.2) / 2, D / 2 + PD - 0.6, trim); T.slabYZ('wood', 0.12, 0.12, P + H - 1.2, D / 2 + PD - 0.6, P + H - 0.25, D / 2 + PD - 1.6, x, trim); }
  T.box('wood', W + 1.2, 0.32, 0.08, 0, P + H - 0.8, D / 2 + PD - 0.05, trim);
  /* the bay window, doors, windows */
  T.box('wood', 2.6, H - 0.4, 1.0, -1.5, P + (H - 0.4) / 2, D / 2 + 0.45, paint);
  T.box('lit', 1.9, 1.3, 0.05, -1.5, P + 1.9, D / 2 + 0.97, 0); T.box('wood', 2.2, 0.1, 0.14, -1.5, P + 2.6, D / 2 + 1.0, trim); T.box('wood', 2.2, 0.1, 0.18, -1.5, P + 1.2, D / 2 + 1.0, trim);
  for (const s of [-1, 1]) T.box('lit', 0.05, 1.3, 0.6, -1.5 + s * 1.31, P + 1.9, D / 2 + 0.5, 0);
  const wz = D / 2 + 0.03;
  for (const x of [-5.4, 3.0]) { T.box('glass', 1.2, 2.3, 0.05, x, P + 1.15, wz, 0); T.box('wood', 1.5, 0.14, 0.14, x, P + 2.35, wz + 0.04, trim); }
  for (const x of [-3.5, 1.2, 5.0]) { T.box(r() < 0.5 ? 'lit' : 'glass', 1.0, 1.5, 0.05, x, P + 1.9, wz, 0); T.box('wood', 1.25, 0.1, 0.14, x, P + 2.7, wz + 0.04, trim); T.box('wood', 1.3, 0.08, 0.18, x, P + 1.12, wz + 0.05, trim); }
  T.box('wood', 4.6, 0.8, 0.08, 1.8, P + 3.25, wz + 0.04, trim); T.sign(SIGN_ROW.RAILHEAD, 4.3, 0.56, 1.8, P + 3.25, wz + 0.09);
  for (const s of [-1, 1]) { T.box('wood', 0.08, 0.84, 3.6, s * (W / 2 + 0.05), P + H + 0.75, 0, trim); T.sign(SIGN_ROW.RAILHEAD, 3.3, 0.56, s * (W / 2 + 0.1), P + H + 0.75, 0, s * Math.PI / 2); }
  /* the freight room at the +x end: lower, a wide sliding door to the platform */
  const fx = W / 2 + 4.0;
  T.box('wood', 8, H - 0.4 + 0.3, D - 0.4, fx, P + (H - 0.7) / 2, -0.2, 0x8a6a42);
  T.slabYZ('roof', 8.6, 0.12, P + H + 0.6, -0.2 - (D - 0.4) / 2 - 0.5, P + H - 0.9, D / 2 + 0.6, fx, roof);
  T.box('glass', 3.0, 2.6, 0.05, fx, P + 1.3, D / 2 - 0.37, 0); T.box('wood', 3.2, 2.7, 0.08, fx + 1.7, P + 1.35, D / 2 - 0.3, 0x7a5a38);
  /* on the platform: crates, a baggage cart, milk cans, a bench */
  for (let i = 0; i < 5; i++) { const s = 0.6 + r() * 0.35; T.box('wood', s, s * 0.8, s, fx - 2 + r() * 4, P + s * 0.4 + (i > 2 ? s * 0.8 : 0), D / 2 + 1.0 + r() * 1.4, 0x8a7050, { ry: r() }); }
  T.box('wood', 2.2, 0.1, 1.0, -W / 2 - 2.5, P + 0.6, D / 2 + 1.6, 0x5a4430); for (const s of [-1, 1]) T.cyl('glass', 0.28, 0.06, -W / 2 - 2.5 + s * 0.8, P + 0.0, D / 2 + 1.1, 0, 10);
  for (let i = 0; i < 4; i++) T.cyl('wood', 0.17, 0.62, -W / 2 - 0.6 + i * 0.38, P, D / 2 + 0.5, 0x9a9488, 10);
  T.box('wood', 2.0, 0.08, 0.45, 3.2, P + 0.48, D / 2 + 0.4, 0x5a4430); for (const s of [-1, 1]) T.box('wood', 0.08, 0.45, 0.4, 3.2 + s * 0.9, P + 0.23, D / 2 + 0.4, trim);
  /* a stovepipe */
  T.box('wood', 0.35, 1.8, 0.35, -4, P + H + 1.4, -1.2, 0x2a2420);
}

/* an A-frame canvas tent of the rail gang */
function tent(T, r, o) {
  const { W = 3.0, D = 4.2, H = 2.3, col = 0xc8b898 } = o; const a = Math.atan2(H, W / 2); const sl = Math.hypot(W / 2, H) + 0.1;
  for (const s of [-1, 1]) T.box('canvas', sl, 0.03, D, s * (sl / 2) * Math.cos(a), H - (sl / 2) * Math.sin(a), 0, col, { rz: -s * a });
  T.gable('canvas', W, 0, H, -D / 2, col);
  T.box('wood', 0.07, H + 0.3, 0.07, 0, (H + 0.3) / 2, D / 2 + 0.05, 0x4a3a2c); T.box('wood', 0.07, 0.07, D + 0.3, 0, H + 0.02, 0, 0x4a3a2c);
  T.box('glass', 0.9, H * 0.7, 0.02, 0, H * 0.35, D / 2 - 0.02, 0);
}

/* the rail gang's supply dump behind the arena (railhead reverse view): ties in two crossed stacks, a stack of rails, barrels,
   a long water trough, a ring of fire stones with a pot */
function buildDump(ctx, L, f) {
  const r = ctx.r; const w = []; const ir = []; const st = [];
  /* the section gang's tool shed straight behind the arena: a dark gable against the dawn, a lit window */
  { const T = townKit(); const [x, z] = at(-36, -f.side * 3); const ry = Math.atan2(UX, UZ) + 0.25;
    barn(T, r, { W: 7, D: 5.5, H: 3.2, rh: 1.8, paint: 0x7a5e44, trim: 0x2e2218, roof: 0x4a3c34, lean: true });
    T.box('lit', 0.8, 0.7, 0.05, 2.2, 1.9, 2.79, 0);
    T.put(x, ctx.H(x, z) - 0.05, z, ry); solidAlong(ctx, x, z, ry, [[-2], [2]], 3, 'hut'); T.finish(L); }
  const put = (g, x, z, ry, y = 0) => { g.rotateY(ry); g.translate(x, ctx.H(x, z) + y, z); return g; };
  const ry0 = Math.atan2(UX, UZ) + 0.3;
  for (const [t, sOff, n] of [[-30, -3, 6], [-33, 2.5, 4]]) {
    const [x, z] = at(t, f.side * sOff); solid(ctx, x, z, 1.8, 'prop');
    for (let layer = 0; layer < n; layer++) for (let k = 0; k < 5; k++) { if (layer === n - 1 && r() < 0.4) continue; const b = new THREE.BoxGeometry(2.5, 0.16, 0.24); if (layer % 2) b.rotateY(Math.PI / 2); b.translate(layer % 2 ? (k - 2) * 0.42 : (r() - 0.5) * 0.1, 0.08 + layer * 0.16, layer % 2 ? (r() - 0.5) * 0.1 : (k - 2) * 0.42); w.push(put(b, x, z, ry0 + (r() - 0.5) * 0.2)); }
  }
  { const [x, z] = at(-28, f.side * 11); solid(ctx, x, z, 2.4, 'prop');
    for (let layer = 0; layer < 3; layer++) for (let k = 0; k < 5 - layer; k++) { const g = new THREE.BoxGeometry(0.12, 0.14, 7.2); g.translate((k - (4 - layer) / 2) * 0.2, 0.25 + layer * 0.14, 0); ir.push(put(g, x, z, ry0 + Math.PI / 2)); }
    for (const zz of [-2.6, 0, 2.6]) { const b = new THREE.BoxGeometry(1.3, 0.18, 0.24); b.translate(0, 0.09, zz); b.rotateY(Math.PI / 2); w.push(put(b, x, z, ry0)); } }
  { const [x, z] = at(-24, -f.side * 4); solid(ctx, x, z, 1.4, 'prop');
    for (let i = 0; i < 4; i++) { const g = new THREE.CylinderGeometry(0.3, 0.3, 0.86, 12); g.translate((i % 2) * 0.66 - 0.3, 0.43, Math.floor(i / 2) * 0.66 - 0.3); w.push(put(g, x, z, r())); } }
  { const [x, z] = at(-20, f.side * 2); solid(ctx, x, z, 1.4, 'prop');
    const g = [geoBox(2.6, 0.08, 0.8, 0, 0.1, 0), geoBox(2.6, 0.55, 0.08, 0, 0.36, 0.38), geoBox(2.6, 0.55, 0.08, 0, 0.36, -0.38), geoBox(0.08, 0.55, 0.8, 1.27, 0.36, 0), geoBox(0.08, 0.55, 0.8, -1.27, 0.36, 0)];
    w.push(put(mergeClean(g), x, z, ry0 + 0.6)); }
  { const [x, z] = at(-22, -f.side * 11);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; const g = new THREE.DodecahedronGeometry(0.2 + r() * 0.08, 0); g.scale(1, 0.6, 1); st.push(put(g, x + Math.cos(a) * 0.75, z + Math.sin(a) * 0.75, r(), 0.08)); }
    const pot = new THREE.CylinderGeometry(0.11, 0.15, 0.3, 10); ir.push(put(pot, x + 0.2, z, 0, 0.3)); }
  if (w.length) place(L, mergeClean(w), yardWood(0x9a7c5a), 0, 0, 0, 0).name = 'fr-dump';
  if (ir.length) place(L, mergeClean(ir), ironMat(0x3a3430), 0, 0, 0, 0);
  if (st.length) place(L, mergeClean(st), triMaterial('rock', { tint: 0x6a5e52, tile: 1, desat: 0.5 }), 0, 0, 0, 0);
}

/* the town: depot by the track, the main street across from the arena, the stock yard behind the arena */
function buildTown(ctx, L, f) {
  const r = ctx.r; const T = townKit(); const side = f.side;
  const atS = (t, s) => at(t, s * side);
  const face = (dt, ds) => Math.atan2(UX * dt + VX * ds * side, UZ * dt + VZ * ds * side); /* ry so local +z points along (t, s) */
  const ground = (x, z) => ctx.H(x, z);
  const foot = (x, z, ry, W, D, kind = 'hut') => { const pts = []; for (let lx = -W / 2 + 1.5; lx <= W / 2 - 1.4; lx += 2.6) for (let lz = -D / 2 + 1.5; lz <= D / 2 - 1.4; lz += 2.6) pts.push([lx, lz]); if (!pts.length) pts.push([0, 0]); solidAlong(ctx, x, z, ry, pts, 1.9, kind); };
  /* the depot */
  { const [x, z] = atS(f.depot.t, f.depot.s); const ry = face(0, -1); depot(T, r, {}); T.put(x, ground(x, z) - 0.05, z, ry); foot(x, z, ry, 26, 9, 'hut'); }
  /* Front Street: one row of false fronts across the track, facing the depot and the arena (a railroad town faces its
     rails); a cross street opens in the row and runs back to the livery barn, with a store on each side of it */
  const st = f.street.t; const FS = 38; const HW = 7;
  const right = [{ sign: 'SALOON', W: 9.5, D: 12, H: 7.4, F: 9.4, two: true, paint: 0x9a5a3e, trim: 0x2e1e14, batwing: true, chimney: true, lit: 0.7 },
    { sign: 'BARBER', W: 5.6, D: 8, H: 4.2, F: 6.0, paint: 0xc8bc9c, trim: 0x6a2a1a, step: true },
    { sign: 'ASSAY OFFICE', W: 6.5, D: 8, H: 4.2, F: 6.2, paint: 0x76806a, trim: 0x2a2a20 }];
  const left = [{ sign: 'GENERAL STORE', W: 11, D: 12, H: 4.6, F: 7.4, paint: 0xb08a54, trim: 0x3a2414, store: true, step: true },
    { sign: 'BANK', W: 7.2, D: 10, H: 5.0, F: 7.0, paint: 0x8a6a56, trim: 0x2a2018, step: true },
    { sign: 'HOTEL', W: 10.5, D: 12, H: 7.2, F: 8.8, two: true, paint: 0xa09c8a, trim: 0x2a2620, lit: 0.6 },
    { sign: null, W: 6, D: 8, H: 3.8, F: 5.4, paint: 0x7a6a58, trim: 0x2e2218, lit: 0.2 }];
  const front = (b, t, sF, dirS, dirT) => { /* sF = the facade line in s; the building faces (dirT, dirS) */
    const depth = b.D / 2 + 0.2; const [x, z] = dirS ? atS(t, sF - dirS * depth) : atS(sF - dirT * depth, t); const ry = dirS ? face(0, dirS) : face(dirT, 0);
    falseFront(T, r, b); T.put(x, ground(x, z) - 0.05, z, ry); foot(x, z, ry, b.W, b.D); };
  { let t = st + HW; for (const b of right) { front(b, t + b.W / 2, FS, -1, 0); t += b.W + 1.0 + r() * 1.2; } }
  { let t = st - HW; for (const b of left) { front(b, t - b.W / 2, FS, -1, 0); t -= b.W + 1.0 + r() * 1.2; } }
  /* along the cross street: a store on each side, facing the street; the livery closes the end */
  front({ sign: 'FEED & SEED', W: 8.6, D: 10, H: 4.4, F: 6.4, paint: 0xa49884, trim: 0x3a2c20 }, 64, st - HW, 0, 1);
  front({ sign: null, W: 7, D: 9, H: 4.0, F: 5.8, paint: 0x8a7c66, trim: 0x2e2218, lit: 0.3 }, 66, st + HW, 0, -1);
  { const [x, z] = atS(st, 92); const ry = face(0, -1); barn(T, r, { W: 12, D: 15, H: 4.8, rh: 3.6, paint: 0x8a4e36, trim: 0xc8bca4, sign: 'LIVERY STABLE' }); T.put(x, ground(x, z) - 0.05, z, ry); foot(x, z, ry, 15, 15); }
  /* barrels and crates along the boardwalk */
  for (let k = 0; k < 16; k++) { const tt = st + (r() < 0.5 ? 1 : -1) * (HW + 1 + r() * 26); const [x, z] = atS(tt, FS - 2.9 - r() * 0.6); if (r() < 0.6) { T.cyl('wood', 0.3, 0.86, 0, 0, 0, 0x6a5038, 12); T.box('glass', 0.62, 0.04, 0.62, 0, 0.7, 0, 0); } else { const sz = 0.6 + r() * 0.3; T.box('wood', sz, sz * 0.8, sz, 0, sz * 0.4, 0, 0x9a8060); } T.put(x, ground(x, z), z, r() * TAU); }
  /* telegraph poles down the street to the depot, one wire on each */
  { const tops = []; const poles = [];
    for (const s of [32, 54, 76]) { const [x, z] = atS(st + HW - 1.2, s); const y = ground(x, z); T.box('wood', 0.2, 7.0, 0.2, 0, 3.4, 0, 0x4a3a2e); T.box('wood', 1.8, 0.12, 0.14, 0, 6.7, 0, 0x4a3a2e); T.put(x, y, z, face(0, 1)); tops.push(V(x, y + 6.85, z)); solid(ctx, x, z, 0.3, 'pole'); }
    const segs = []; for (let i = 0; i < tops.length - 1; i++) sagLine(segs, tops[i], tops[i + 1], 0.6, 8); wireLines(L, segs); }
  /* the stock yard behind the arena: two pens of rails, a loading chute, rail-gang tents, a freight shed, a wagon */
  { const [x, z] = atS(f.yard.t + 24, -42); const ry = face(0, 1) + 0.15; barn(T, r, { W: 13, D: 10, H: 4.4, rh: 2.4, paint: 0x8a8274, trim: 0x3a2c22, sign: 'FREIGHT', lean: false }); T.put(x, ground(x, z) - 0.05, z, ry); foot(x, z, ry, 13, 10); }
  { const [x, z] = atS(f.yard.t - 24, -40); const ry = face(0, 1) - 0.2; barn(T, r, { W: 9, D: 6.5, H: 3.2, rh: 1.6, paint: 0x6e5a48, trim: 0x2e2218, lean: true }); T.put(x, ground(x, z) - 0.05, z, ry); foot(x, z, ry, 12, 7); }
  for (let k = 0; k < 10; k++) { const [x, z] = atS(f.yard.t - 8 + r() * 26, -27 - r() * 4); if (r() < 0.5) { T.cyl('wood', 0.3, 0.86, 0, 0, 0, 0x6a5038, 12); } else { const sz = 0.6 + r() * 0.4; T.box('wood', sz, sz * 0.8, sz, 0, sz * 0.4, 0, 0x9a8060); } T.put(x, ground(x, z), z, r() * TAU); }
  for (let i = 0; i < 4; i++) { const [x, z] = atS(f.yard.t - 14 + i * 5.5 + r() * 1.5, -31 - r() * 4); tent(T, r, { col: [0xb0a080, 0xa08e70, 0xb8aa8c][i % 3] }); T.put(x, ground(x, z), z, face(0, 1) + (r() - 0.5) * 0.4); solid(ctx, x, z, 2.2, 'hut'); }
  for (const [t0, s0, w, d] of [[f.yard.t + 26, -24, 16, 9], [f.yard.t - 34, -22, 12, 10]]) {
    const pts = []; const c = [[t0 - w / 2, s0], [t0 + w / 2, s0], [t0 + w / 2, s0 - d], [t0 - w / 2, s0 - d], [t0 - w / 2, s0]];
    for (let k = 0; k < c.length - 1; k++) { const n = Math.round(Math.hypot(c[k + 1][0] - c[k][0], c[k + 1][1] - c[k][1]) / 2.6); for (let j = 0; j < n; j++) pts.push(atS(lerp(c[k][0], c[k + 1][0], j / n), lerp(c[k][1], c[k + 1][1], j / n))); }
    pts.push(pts[0]); buildFence(ctx, L, pts, { rails: true, tint: 0x6a5a48 }); const [cx, cz] = atS(t0, s0 - d / 2); solid(ctx, cx, cz, Math.min(w, d) / 2, 'prop');
  }
  /* the chute: a ramp with board walls up to a stock car height */
  { const [x, z] = atS(f.yard.t + 36, -26); T.slabYZ('wood', 1.6, 0.12, 0.1, -3, 1.3, 2.2, 0, 0x5a4a3a); for (const s of [-1, 1]) T.box('wood', 0.08, 1.4, 5.4, s * 0.85, 1.0, -0.4, 0x5a4a3a); for (let k = 0; k < 4; k++) for (const s of [-1, 1]) T.box('wood', 0.16, 2.4, 0.16, s * 0.95, 1.0, -2.8 + k * 1.7, 0x3a2e24); T.put(x, ground(x, z), z, face(0, 1)); solid(ctx, x, z, 2.4, 'prop'); }
  T.finish(L);
  { const [x, z] = atS(st + 1.5, 48); buildWagon(ctx, L, x, z, face(0, 1) + Math.PI / 2 + 0.1, { canvas: 0xc8bca0 }); }
  { const [x, z] = atS(f.yard.t + 8, -38); buildWagon(ctx, L, x, z, face(1, 0) + 0.4, { canvas: 0xb8ac90 }); }
  /* smoke from the saloon stovepipe and the depot */
  { const [x, z] = atS(st + HW + 6, FS + 7); addSmoke(L, [x, ground(x, z) + 10, z], { n: 14, size: 2.2, rise: 14, life: 9, wind: [0.5, 0, 0.15], low: 0x6a6460, high: 0xb8aca0, hot: 0x000000, alpha: 0.35 }); }
}
/* 0..1: how much of (x, z) belongs to the town pads (flat ground, no grass, no boulders) */
function townK(f, x, z) {
  const [t, s0] = toTS(x, z); const s = s0 * f.side;
  const st = f.street.t; const street = Math.max(smooth(st - 70, st - 64, t) * smooth(st + 40, st + 34, t) * smooth(27, 31, s) * smooth(60, 55, s), smooth(24, 18, Math.abs(t - st)) * smooth(27, 31, s) * smooth(108, 102, s));
  const dep = smooth(12, 15, t) * smooth(52, 49, t) * smooth(21.5, 23, s) * smooth(37, 34, s);
  const yard = smooth(f.yard.t - 44, f.yard.t - 40, t) * smooth(f.yard.t + 40, f.yard.t + 36, t) * smooth(-19, -22, s) * smooth(-56, -52, s);
  return Math.max(street, dep, yard);
}

/* ------------------------------------------------------------------ butte heights (both lands) */
function butteH(m, x, z) {
  const dx = x - m.x; const dz = z - m.z; const a = Math.atan2(dz, dx); const ph = m.x * 0.13 + m.z * 0.07;
  /* lobes and bays so no butte is a drum: two low angular harmonics plus noise */
  const lobe = 1 + 0.2 * Math.sin(2 * a + ph) + 0.13 * Math.sin(3 * a + ph * 1.7) + 0.08 * Math.sin(5 * a + ph * 2.3)
    /* buttresses and gullies down every cliff, so a face breaks into columns */
    + (m.spire ? 0 : 0.045 * Math.sin(11 * a + ph * 3.1) + 0.03 * Math.sin(19 * a + ph * 1.3) + 0.02 * Math.sin(29 * a + ph * 0.7));
  const d = Math.hypot(dx, dz) / lobe + (fbm(x * 0.025 + m.x, z * 0.025, 3) - 0.5) * m.R * 0.5;
  if (d > m.R * 1.9) return 0;
  if (m.spire) {
    /* a chimney rock: a near-vertical column on a talus cone, two ledges, a flat cap rock a little wider than the neck */
    const col = smooth(m.R * 0.66, m.R * 0.5, d); const capR = smooth(m.R * 0.74, m.R * 0.62, d);
    const foot = Math.pow(smooth(m.R * 1.9, m.R * 0.7, d), 1.5) * 0.32;
    const ledge = 0.04 * smooth(m.R * 0.7, m.R * 0.6, d);
    const body = m.H * (0.9 * col + ledge) + m.H * 0.1 * capR * col;
    return Math.max(body, m.H * foot) + (fbm(x * 0.3, z * 0.3) - 0.5) * 1.4 * col;
  }
  const cliff = smooth(m.R * 1.08, m.R * 0.86, d); const talus = smooth(m.R * 1.9, m.R * 1.0, d);
  const beds = Math.max(3, Math.round(m.H / 5)); const kb = cliff * beds + (fbm(x * 0.05 + m.z, z * 0.05 - m.x, 2) - 0.5) * 0.9 * cliff * (1 - cliff) * 4; /* beds that wander, not machined rings */ const ledged = (Math.floor(kb) + smooth(0.2, 1.0, kb - Math.floor(kb))) / beds;
  let top = m.H * 0.86 * (0.93 + 0.07 * smooth(m.R * 0.98, m.R * 0.72, d)); /* a rounded lip */
  if (m.cap) top += m.H * 0.14 * smooth(m.R * 0.55, m.R * 0.45, d + (fbm(x * 0.06, z * 0.06 + 3) - 0.5) * m.R * 0.25);
  const face = cliff > 0.02 && cliff < 0.98 ? (fbm(x * 0.28, z * 0.28 + m.z) - 0.5) * 1.8 + (ridged(x * 0.12 + m.x, z * 0.12, 3) - 0.5) * 2.2 : 0;
  return Math.max(ledged * top, Math.pow(talus, 1.6) * top * 0.3) + face;
}

/* ================================================================== the lands */
export const lands = {
  /* ---------------- RED MESA (dusk): buttes against a sunset, a dry wash, saguaro, a wagon on the trail, the trestle ---------------- */
  mesa: {
    variants: 2, desat: 0.1, groundTint: 0x5a3424, fog: [24, 240], hemi: 0.62, sun: 1.2, sunOffset: [-12, 6, -24], exposure: 0.95,
    fogCol: 0x5a3426, skyCols: [0x1a1428, 0xe08a48],
    sky: { sunDir: [-0.62, 0.05, -0.78], sunCol: 0xffa060, sunGlow: 1.0, disc: 0, top: 0x1a1430, hor: 0xf0904a, pow: 0.62, clouds: 0.32, cloudCol: 0x2a1418, cloudLit: 0xffa070, cloudSpd: 0.35, cloudLo: 0.05, band: 0.75, bandCol: 0xff8a40,
      bigSun: 0.042, bigSunDir: [-0.62, 0.012, -0.78], bigSunCol: 0xff6a24 },
    terrain: { A: ['grass_path_2', 5.5, 0xa06c4c], B: ['damp_beach_sand', 7, 0xb88458], C: ['cliff_side', 14, 0xa8624a], P: 0xc8906a, rock: [0.22, 0.46], macro: [30, 0.42], nstr: 1.2, rough: [0.97, 0.95], desat: 0.0, bnoise: 0.5,
      strata: [0.55, 0.85, 3, 0.7], crack: [0.0, 1.7, 0.045, 0.0], emis: 0x000000, haze: [0xc0704a, 0.38, 160, 560] },
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      const sunA = Math.atan2(-0.78, -0.62);
      f.buttes = [];
      const free = (x, z, R) => !f.buttes.some((m) => Math.hypot(m.x - x, m.z - z) < (m.R + R) * 1.1);
      const add = (n, d0, d1, R0, R1, H0, H1, opt = {}) => { for (let i = 0; i < n * 6 && n > 0; i++) { const a = opt.ang != null ? opt.ang + (r() - 0.5) * (opt.spread ?? 0.3) : r() * TAU; if (angOff(a) < (opt.gap ?? 0.34)) continue; const d = d0 + r() * (d1 - d0); const [x, z] = polar(a, d); const R = R0 + r() * (R1 - R0); if (!free(x, z, R)) continue; f.buttes.push({ x, z, R, H: H0 + r() * (H1 - H0), cap: r() < 0.6, spire: !!opt.spire }); n--; } };
      /* the sun butte: the low sun sits on its shoulder */
      { const [x, z] = polar(sunA + [0.05, -0.06][v], 330); f.buttes.push({ x, z, R: 60, H: 70, cap: true }); }
      /* the two bluffs that hold the trestle */
      for (const s of [-1, 1]) { const [x, z] = at(GORGE_T + 30, s * (SPAN + 50)); f.buttes.push({ x, z, R: 44, H: 40, cap: true }); }
      add([3, 4][v], 95, 150, 14, 26, 26, 44);
      add(3, 130, 260, 18, 26, 30, 44, { spire: true, gap: 0.4 }); /* chimney rocks wide enough for the terrain grid to keep their flat tops */
      add(5, 190, 330, 30, 55, 42, 78);
      add(8, 380, 620, 50, 110, 55, 120, { gap: 0.15 });
      /* the dry wash: across the plain from behind-left to the right, never through the arena */
      const wa = FRONT + Math.PI * [0.7, -0.7][v];
      f.wash = wander(r, ...polar(wa, 160), wa + Math.PI + [0.55, -0.55][v], 330, 7, 0.22).filter(([x, z]) => Math.hypot(x, z) > 24);
      f.washI = lineIndex(f.wash, 24, 14);
      /* two narrow gullies behind the hero and to the sides, so the near ground has channels, not flat dirt */
      f.wash2 = []; for (const [a0, d0] of [[FRONT + Math.PI + 0.35, 30], [FRONT + Math.PI - 0.6, 46], [FRONT + Math.PI * 0.55, 34]]) { const g = wander(r, ...polar(a0, d0), a0 + Math.PI * 0.5 * (r() < 0.5 ? 1 : -1), 120, 5, 0.45).filter(([x, z]) => Math.hypot(x, z) > 22); if (g.length > 1) { f.wash2.push(...g, null); } }
      { const segs = []; let cur = []; for (const p of f.wash2) { if (p) cur.push(p); else { if (cur.length > 1) segs.push(cur); cur = []; } } const idx = segs.map((sg) => lineIndex(sg, 24, 8)); f.wash2I = (x, z) => { let b = [99]; for (const fn of idx) { const q = fn(x, z); if (q[0] < b[0]) b = q; } return b; }; }
      /* the wagon trail: from behind the player past the arena on one side, toward the homestead */
      const side = [1, -1][v];
      f.trail = pathTS([[-200, side * 70], [-80, side * 34], [0, side * 22], [60, side * 30], [130, side * 62], [200, side * 120]], 3).map(([x, z]) => [x, z]);
      f.trailI = lineIndex(f.trail, 24, 8);
      f.side = side;
      f.home = at(52, side * 46); f.graves = at([-30, 20][v], -side * 32);
      /* the way station behind the hero stands on a low rise, so the reverse view sees it over the ground swells */
      f.station = at(-46, side * 6);
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = (ctx.seed % 97) * 0.37;
      let h = (fbm(x * 0.012 + s, z * 0.012, 4) - 0.45) * 5 * smooth(16, 70, rr) + (fbm(x * 0.05, z * 0.05 + s, 3) - 0.5) * 0.9 * smooth(16, 26, rr);
      /* low sand ripples in the open */
      h += 0.25 * Math.sin(x * 0.35 + fbm(x * 0.05, z * 0.05) * 6) * smooth(0.5, 0.7, fbm(x * 0.02 + 9, z * 0.02, 2)) * smooth(18, 30, rr);
      /* rock shelves: flat benches of caprock a metre or two high with steep edges, out in the open past the arena */
      { const sh = fbm(x * 0.022 + 11, z * 0.022 - 5, 3); const k = smooth(24, 40, rr); h += k * (1.3 * smooth(0.6, 0.625, sh) + 0.9 * smooth(0.69, 0.71, sh)); }
      for (const m of f.buttes) h = Math.max(h, butteH(m, x, z));
      /* the far rim: a low broken range so the sky meets land everywhere */
      h += K.ranges(x, z, rr, ang, s, { near: [420, 520], far: [560, 700], ampN: 18, ampF: 50, sharp: 2.2, freq: 0.006, gapK: 0.6 });
      /* the dry wash: a flat sandy bed 1 m down with soft banks */
      const [dw] = f.washI(x, z); if (dw < 9) h = lerp(h, Math.min(h, -0.9), smooth(9, 3.5, dw));
      /* small wash channels: narrow dry gullies that braid across the near plain */
      { const [d2] = f.wash2I(x, z); if (d2 < 4) h = lerp(h, Math.min(h, -0.55), smooth(4, 1.2, d2)); }
      const [dt] = f.trailI(x, z); if (dt < 4 && rr > 16) h = lerp(h, h * 0.5, smooth(4, 1.5, dt));
      { const ds = Math.hypot(x - f.station[0], z - f.station[1]); if (ds < 26) h = lerp(h, 1.6 + 0.4 * smooth(26, 8, ds), smooth(26, 11, ds)); }
      return gorgeHeight(x, z, h);
    },
    mask(ctx, x, z, h, rr) {
      const f = ctx.f; const [dw] = f.washI(x, z); const [dt] = f.trailI(x, z); const [d2] = f.wash2I(x, z);
      const sand = Math.max(smooth(8, 3, dw), smooth(3.5, 1.2, d2), smooth(0.55, 0.72, fbm(x * 0.03 + 4, z * 0.03, 3)) * 0.6 * smooth(18, 26, rr));
      const crack = Math.max(smooth(5, 1.5, dw) * 0.9, smooth(2.6, 0.8, d2) * 0.8) + smooth(0.62, 0.78, fbm(x * 0.04 - 7, z * 0.04 + 2, 3)) * 0.5;
      /* two wheel ruts in the trail */
      const rut = dt < 2.6 ? Math.max(smooth(0.5, 0.12, Math.abs(dt - 0.8)), smooth(1.4, 0.2, dt) * 0.4) : 0;
      return [rut, sand, crack * smooth(18, 26, rr), 0];
    },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r; const v = ctx.v;
      buildTrestle(ctx, L, { dusk: true });
      /* the homestead: an adobe ruin, a water tower and a windmill beside it, a fence */
      const [hx, hz] = f.home; const hr = Math.atan2(-hx, -hz);
      buildRuin(ctx, L, { pos: [hx, hz], rot: hr + 0.4 }, { tint: 0xb07a58, cover: null });
      { const [wx, wz] = [hx + Math.cos(hr) * 11, hz - Math.sin(hr) * 11]; buildWaterTower(ctx, L, wx, wz, hr, { tint: 0x6a5240 }); }
      /* the windmill: the first spot beside the ruin on low open ground, clear of every butte, so the wheel never lands on a cliff face */
      { let best = null; for (let i = 0; i < 16 && !best; i++) { const a = hr + Math.PI + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.4; const d = 10 + (i % 3) * 3; const mx = hx + Math.sin(a) * d; const mz = hz + Math.cos(a) * d;
          if (ctx.H(mx, mz) > 1.5) continue; if (f.buttes.some((m) => Math.hypot(m.x - mx, m.z - mz) < m.R * 2.0 + 8)) continue; if (Math.hypot(mx, mz) < 26) continue; best = [mx, mz]; }
        if (best) buildWindmill(ctx, L, best[0], best[1], hr - 0.6, { h: 11 }); }
      { const pts = []; for (let i = 0; i < 9; i++) pts.push([hx + Math.sin(hr) * (8 + i * 3.6) - Math.cos(hr) * 14, hz + Math.cos(hr) * (8 + i * 3.6) + Math.sin(hr) * 14]); buildFence(ctx, L, pts, { rails: true, tint: 0x6a5a48 }); }
      /* the wagon on the trail and a dead ox's bones beside it */
      { const k = Math.floor(f.trail.length * [0.62, 0.6][v]); let i = k; while (i < f.trail.length - 2 && Math.hypot(...f.trail[i]) < 27) i++; const [x, z] = f.trail[i]; const [x2, z2] = f.trail[i + 1]; const ry = Math.atan2(-(z2 - z), x2 - x);
        buildWagon(ctx, L, x + Math.sin(ry) * 1.6, z + Math.cos(ry) * 1.6, ry + 0.2, { tipped: v === 0 });
        buildBones(ctx, L, [x - Math.sin(ry) * 3.5 + Math.cos(ry) * 4, z - Math.cos(ry) * 3.5 - Math.sin(ry) * 4], r() * TAU, 0.8); }
      /* an overturned cart in the wash */
      { const i = Math.floor(f.wash.length * 0.45); const [x, z] = f.wash[i]; if (Math.hypot(x, z) > 30 && angOff(Math.atan2(z, x)) > 0.3) buildCart(ctx, L, x, z, r() * TAU, { burnt: false }); }
      buildGraves(ctx, L, f.graves[0], f.graves[1], r() * TAU, 6 + Math.floor(r() * 3));
      /* a barbed wire line across the open */
      { const a0 = FRONT + Math.PI * 0.5 * f.side; const pts = []; for (let i = 0; i < 18; i++) pts.push(polar(a0 + (i - 9) * 0.06 + (r() - 0.5) * 0.01, 38 + Math.sin(i * 0.4) * 3)); buildFence(ctx, L, pts.filter(([x, z]) => angOff(Math.atan2(z, x)) > 0.18)); }
      /* saguaro: scattered, thicker on the slopes under the buttes, tall ones far */
      { const list = []; for (let i = 0; i < 220 && list.length < 46; i++) { const a = r() * TAU; const d = 19 + Math.pow(r(), 0.7) * 150; const [x, z] = polar(a, d); if (d > 25 && angOff(a) < 0.24) continue; if (f.washI(x, z)[0] < 6 || f.trailI(x, z)[0] < 3) continue; if (ctx.solids.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 2.5)) continue; const hh = (d < 40 ? 2.4 : 3) + r() * (d < 40 ? 3.0 : 6.5); list.push([x, z, hh]);
          /* a stand: one or two more close by, so the spacing clumps instead of an even scatter */
          const extra = r() < 0.4 ? 1 + Math.floor(r() * 2) : 0; for (let e = 0; e < extra; e++) { const ea = r() * TAU; const ed = 2.5 + r() * 5; const ex = x + Math.cos(ea) * ed; const ez = z + Math.sin(ea) * ed; if (Math.hypot(ex, ez) > 22 && f.washI(ex, ez)[0] > 6) list.push([ex, ez, hh * (0.4 + r() * 0.7)]); } }
        buildSaguaros(ctx, L, list); }
      /* dust devils far out, and a low haze of dust drifting near the ground */
      for (let i = 0; i < 2; i++) { const a = FRONT + (i ? 1.1 : -1.35) + (r() - 0.5) * 0.3; const [x, z] = polar(a, 140 + r() * 80); addSmoke(L, [x, ctx.H(x, z), z], { n: 26, size: 6, rise: 34, life: 7, wind: [0.6, 0, 0.2], low: 0x7a4a30, high: 0xc08a60, hot: 0x000000, alpha: 0.32 }); }
      /* the view behind the hero has its own story. A
         stage line way station straight back down the line, about 60 m out: an adobe ruin, a water tower, a stage wagon,
         and a telegraph line that runs from beside the arena back past the station to the horizon (dark poles against the
         sky, a line that leads the eye). Built last, from its own random stream, so the front view keeps its scatter. */
      { const r2 = rng((ctx.seed | 0) * 31 + 977); const save = ctx.r; ctx.r = r2;
        try {
          const [sx, sz] = f.station; const rot = Math.atan2(VX, VZ) + 0.2;
          buildRuin(ctx, L, { pos: [sx, sz], rot }, { tint: 0xc08a64, cover: null });
          { const [wx, wz] = at(-42, f.side * 15); buildWaterTower(ctx, L, wx, wz, rot, { tint: 0x7a5e46, legs: 7.5 }); }
          { const [cx, cz] = at(-36, -f.side * 3); buildWagon(ctx, L, cx, cz, Math.atan2(UX, UZ) + 0.6, { canvas: 0xd8c8a8 }); }
          const line = []; for (let t = -22; t > -520; t -= 6) line.push(at(t, -f.side * (12 + (t + 22) * -0.03)));
          buildTelegraph(ctx, L, line, line.map(() => 0), 1, 30);
        } finally { ctx.r = save; } }
      addFogSheets(ctx, L, [0.35], { color: 0xb06a44, alpha: 0.1, R: 110 }); /* low only: a sheet at eye height cut a band through every figure */
    },
    props: [
      { m: 'namaqualand_cliff_01', n: 6, s: [8, 13], d: [60, 150], sink: 0.4, tint: 0xb0705a, tilt: 0.05 }, /* low broken outcrops: big ones read as cones */
      { m: 'namaqualand_cliff_02', n: 7, s: [7, 12], d: [38, 110], sink: 0.3, tint: 0xa86a52, tilt: 0.12, cluster: [1, 3], spread: 14 },
      { m: 'namaqualand_boulder_02', n: 16, s: [1.6, 3.6], d: [20, 80], sink: 0.25, tint: 0xa86a52, tilt: 0.3, cluster: [2, 5], spread: 7 },
      { m: 'namaqualand_boulder_04', n: 18, s: [1.2, 3.0], d: [18, 75], sink: 0.25, tint: 0xa06650, tilt: 0.3, cluster: [2, 4], spread: 6 },
      /* the grey scan read blue-silver against the red dirt: a red tint, red dust over the tops */
      { m: 'rock_07', n: 40, s: [0.4, 1.2], d: [6, 70], sink: 0.45, tint: 0x8a4a34, cover: 0x9a5a40, coverAmt: 0.75, tilt: 0.2, clutter: true, cluster: [1, 6], spread: 5, tintVar: 0.25, tintTo: 0xa86048 },
      { p: 'pebble', tex: 'cliff_side', shadow: false, n: 140, s: [0.08, 0.35], d: [3, 40], tint: 0xa87050, tilt: 0.9, clutter: true, cluster: [3, 12], spread: 2.6, tintVar: 0.35, tintTo: 0x6a3a28 },
      { p: 'heather', n: 150, h: [0.35, 0.8], d: [7, 80], root: 0x2a2014, tip: 0x5a5a38, clutter: true, cluster: [2, 6], spread: 4, tintVar: 0.3, tintTo: 0x8a7a50 },
      /* sage clumps: a few big grey-green bushes and many small ones, so the open reads with scale */
      { p: 'heather', n: 60, h: [0.9, 1.5], d: [18, 90], root: 0x2a2416, tip: 0x7a7c5a, clutter: true, cluster: [1, 3], spread: 6, tintVar: 0.35, tintTo: 0x9a9470 },
      { p: 'heather', n: 240, h: [0.16, 0.38], d: [6, 70], root: 0x2a2014, tip: 0x6a6444, clutter: true, cluster: [3, 9], spread: 3, tintVar: 0.4, tintTo: 0x8a7a54 },
      { p: 'deadtree', n: 5, h: [3.5, 6.5], d: [30, 110], tint: 0x3a3028, bark: 'pale', lean: [0.05, 0.3], leanP: 0.6, kinds: 3 },
      { m: 'dry_branches_medium_01', n: 26, s: [1.0, 2.0], d: [8, 60], tint: 0x5a4434, clutter: true },
      /* bleached wood: sun-whitened branches and old timbers on the dirt */
      { m: 'dry_branches_medium_01', n: 18, s: [1.2, 2.4], d: [18, 70], tint: 0xb8ac94, clutter: true, cluster: [1, 2], spread: 3 },
      { p: 'deadtree', n: 4, h: [1.6, 3.0], d: [22, 70], tint: 0xa89c88, bark: 'pale', lean: [0.4, 1.2], leanP: 1, kinds: 2 },
    ],
    grass: [
      /* bigger clumps in patches, almost none on the bare ground between */
      { n: 7000, h: [0.18, 0.46], root: 0x3a2412, tip: 0xc8a060, wind: 0.22, r: [3, 110], rim: 0xffa060, rimK: 1.3, pow: 1.2, dry: 0xf0c890, lush: 0xb09060, tintF: 0.04, clump: [6, 16], clumpR: 1.1,
        density: (ctx, x, z) => { if (ctx.f.washI(x, z)[0] < 5 || ctx.f.wash2I(x, z)[0] < 2.2 || ctx.f.trailI(x, z)[0] < 1.6) return 0; return 0.02 + 0.85 * smooth(0.48, 0.6, fbm(x * 0.07 + 5, z * 0.07, 3)); },
        height: (ctx, x, z) => 0.8 + 0.6 * smooth(0.45, 0.7, fbm(x * 0.04 + 2, z * 0.04 - 3, 3)) },
    ],
    particles: [
      { kind: 'dot', n: 450, size: 0.045, vel: [2.2, 0.12, -0.5], var: [1.0, 0.3, 0.6], color: 0xb07850, opacity: 0.28, sway: 0.6 }, /* darker, fewer, fainter: the pale motes read as snow on the orange grade */
      { kind: 'flake', n: 300, size: 0.07, vel: [3.0, -0.05, -0.8], var: [1.2, 0.3, 0.5], color: 0x8a5a3a, opacity: 0.35, sway: 0.9 },
    ],
  },

  /* ---------------- THE RAILHEAD (dawn): prairie grass, the track curving away to the trestle, poles, a section house, mist ---------------- */
  railhead: {
    variants: 2, desat: 0.12, groundTint: 0x4a4430, fog: [30, 280], hemi: 0.8, sun: 1.15, sunOffset: [-26, 6, -8], exposure: 0.95,
    fogCol: 0x9a8a80, skyCols: [0x22385e, 0xf0b07a],
    sky: { sunDir: [-0.94, 0.05, -0.34], sunCol: 0xffd0a0, sunGlow: 1.2, top: 0x1e3254, hor: 0xf2b07a, pow: 0.5, clouds: 0.6, cloudCol: 0x4a4258, cloudLit: 0xffb088, cloudSpd: 0.3, cloudLo: 0.04, band: 0.6, bandCol: 0xff9a5a,
      bigSun: 0.03, bigSunDir: [-0.94, 0.016, -0.34], bigSunCol: 0xffd090 },
    terrain: { A: ['grass_path_2', 6, 0x9a8466], B: ['rocky_terrain_02', 7, 0x8a7a5e], C: ['cliff_side', 14, 0xa07a62], P: 0x6a625a, rock: [0.25, 0.5], macro: [26, 0.4], nstr: 1.1, rough: [0.95, 0.95], desat: 0.15, bnoise: 0.55,
      strata: [0.5, 0.7, 3, 0.5], haze: [0xb8a090, 0.18, 200, 600] },
    layout(ctx) {
      const { r, v } = ctx; const f = ctx.f;
      const side = [1, -1][v]; f.side = side;
      /* the track: alongside the arena at 21 m, then a long curve onto the trestle across the gorge */
      const ctrl = [[-320, side * 40], [-180, side * 26], [-60, side * 21], [0, side * 21], [70, side * 23], [150, side * 40], [215, side * 78], [262, side * 112], [GORGE_T, side * (SPAN + 12)], [GORGE_T, -side * (SPAN + 12)], [GORGE_T + 12, -side * (SPAN + 60)], [GORGE_T + 60, -side * (SPAN + 120)]];
      const path = pathTS(ctrl, 2);
      f.path = path.map(([x, z]) => [x, z]); f.pathTS = path;
      f.trackI = lineIndex(f.path, 24, 14);
      /* the grade: on the ground near the arena, up an embankment onto the plateau and the trestle */
      f.grade = path.map(([, , t, s]) => { const onSpan = t > GORGE_T - 6 && Math.abs(s) < SPAN + 20; return onSpan ? PLATEAU + 1.6 : lerp(0, PLATEAU, smooth(150, 262, t)); });
      f.buttes = [];
      const add = (n, d0, d1, R0, R1, H0, H1, gap = 0.36) => { for (let i = 0; i < n * 6 && n > 0; i++) { const a = r() * TAU; if (angOff(a) < gap) continue; const d = d0 + r() * (d1 - d0); const [x, z] = polar(a, d); const R = R0 + r() * (R1 - R0); if (f.buttes.some((m) => Math.hypot(m.x - x, m.z - z) < m.R + R)) continue; if (f.trackI(x, z)[0] < R * 1.6 + 10) continue; f.buttes.push({ x, z, R, H: H0 + r() * (H1 - H0), cap: true }); n--; } };
      add(4, 150, 250, 22, 40, 10, 18); add(4, 240, 360, 40, 70, 18, 30); add(7, 400, 620, 60, 120, 30, 60, 0.15);
      f.depot = { t: [30, 34][v], s: 30 };
      f.street = { t: [-20, -16][v] }; f.yard = { t: [4, 10][v] };
      f.creek = wander(r, ...at(-140, -side * 70), Math.atan2(UZ, UX) + (r() - 0.5) * 0.4, 260, 8, 0.3);
      f.creekI = lineIndex(f.creek, 24, 10);
    },
    height(ctx, x, z, rr, ang) {
      const f = ctx.f; const s = (ctx.seed % 97) * 0.37;
      /* long low rolls of prairie */
      let h = (fbm(x * 0.008 + s, z * 0.008, 4) - 0.45) * 9 * smooth(16, 90, rr) + (fbm(x * 0.04, z * 0.04 + s, 3) - 0.5) * 1.1 * smooth(16, 28, rr);
      for (const m of f.buttes) h = Math.max(h, butteH(m, x, z) * 0.9);
      /* the ranges, then ridged crests and gullies cut into them so they read as worn ridges, not smooth cones */
      { const rg = K.ranges(x, z, rr, ang, s, { near: [380, 480], far: [520, 700], ampN: 22, ampF: 70, sharp: 1.6, freq: 0.0075, gapK: 0.5 });
        h += rg * (0.75 + 0.5 * ridged(x * 0.016 + s, z * 0.016 - s, 4)) - rg * 0.25 * smooth(0.55, 0.8, fbm(x * 0.03 + 3, z * 0.03, 3)); }
      const [dc] = f.creekI(x, z); if (dc < 7) h = lerp(h, Math.min(h, -0.7), smooth(7, 2, dc));
      h = gorgeHeight(x, z, h);
      { const k = townK(f, x, z); if (k > 0) h = lerp(h, 0.05, k); }
      /* the embankment: the ground meets the grade along the track (not on the span: the gorge stays open under it) */
      const [dt, k, tt] = f.trackI(x, z);
      if (k >= 0 && dt < 14) { const g = lerp(f.grade[k], f.grade[k + 1], tt); const [t, sAcross] = toTS(x, z); const onSpan = t > GORGE_T - 18 && t < GORGE_T + 18 && Math.abs(sAcross) < SPAN; if (!onSpan) h = lerp(h, g, smooth(4 + Math.min(10, g * 0.5), 2.2, dt)); }
      return h;
    },
    mask(ctx, x, z, h, rr) {
      const f = ctx.f; const [dt] = f.trackI(x, z); const [dc] = f.creekI(x, z);
      const ballast = Math.max(smooth(3.4, 2.2, dt), smooth(0.66, 0.8, fbm(x * 0.05 + 3, z * 0.05, 3)) * 0.35 * smooth(16, 26, Math.hypot(x, z)));
      const wet = Math.max(smooth(6, 2, dc), smooth(0.55, 0.72, fbm(x * 0.02 + 7, z * 0.02, 3)) * 0.7);
      const tk = townK(f, x, z);
      return [Math.max(ballast, tk * 0.55), wet * (1 - tk), 0, 0];
    },
    async build(ctx, L) {
      const f = ctx.f; const r = ctx.r; const v = ctx.v;
      buildTrestle(ctx, L, { dusk: false });
      buildTrack(ctx, L, f.path, f.grade);
      buildTelegraph(ctx, L, f.path, f.grade, f.side, 34, (x, z) => townK(f, x, z) > 0.2);
      /* the town: the depot by the track, the main street, the stock yard behind the arena */
      buildTown(ctx, L, f);
      buildTrackside(ctx, L, f);
      /* the water tower beside the track past the depot, its spout over the rails */
      { const i = f.path.findIndex(([x, z]) => toTS(x, z)[0] > f.depot.t + 38); if (i > 0) { const [ax, az] = f.path[i]; const [bx, bz] = f.path[i + 1]; const l = Math.hypot(bx - ax, bz - az); const nx = -(bz - az) / l; const nz = (bx - ax) / l; const sgn = f.side; buildWaterTower(ctx, L, ax + nx * 5.6 * sgn, az + nz * 5.6 * sgn, Math.atan2(nx * sgn, nz * sgn) + Math.PI, { tint: 0x5e4c3c, legs: 7 }); } }
      /* a signal at the curve, a handcar, stacks of new ties past the depot */
      { const i = f.path.findIndex(([x, z]) => toTS(x, z)[0] > 110); if (i > 0) { const [ax, az] = f.path[i]; buildSignal(ctx, L, ax - f.side * 3.4 * VX, az - f.side * 3.4 * VZ, Math.atan2(UX, UZ)); } }
      { const iCar = f.path.findIndex(([x, z]) => toTS(x, z)[0] > [-36, 62][v]); const st = []; for (const k of [0, 1, 2]) { const [x, z] = at(f.depot.t + 24 + k * 5, f.side * 29); st.push([x, z, Math.atan2(UX, UZ) + Math.PI / 2 + (r() - 0.5) * 0.2]); } buildRailYard(ctx, L, f.path, f.grade, iCar, st); }
      /* a windmill out on the grass behind the yard */
      { const [x, z] = at([120, 90][v], -f.side * 48); buildWindmill(ctx, L, x, z, r() * TAU, { h: 10 }); }
      /* barbed wire between the arena and the track, open where the street comes down to the rails */
      { const pts = []; for (let i = 0; i < f.path.length; i += 3) { const [x, z, t] = f.pathTS[i]; if (t < -150 || t > 160) continue; const [a, b] = [f.path[Math.min(f.path.length - 1, i + 1)], f.path[i]]; const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; const nx = -(a[1] - b[1]) / l; const nz = (a[0] - b[0]) / l; if (i % 9 === 0) pts.push([x - nx * 11 * f.side, z - nz * 11 * f.side, t]); }
        const runs = [[]]; for (const p of pts) { if (Math.abs(p[2] - f.street.t) < 12) { if (runs[runs.length - 1].length) runs.push([]); continue; } runs[runs.length - 1].push([p[0], p[1]]); } for (const run of runs) if (run.length > 1) buildFence(ctx, L, run); }
      /*a homestead claim behind the arena, the way the hero came in: a tall windmill, a covered wagon with its
         tongue down, a few graves under a dead tree, so the reverse view has a silhouette to land on */
      { const [x, z] = at(-50, -f.side * 9); buildWindmill(ctx, L, x, z, r() * TAU, { h: 13 }); }
      /* the wagon comes in
         to 25 m in pale canvas, and a rail-gang supply dump sits beside it: stacked ties, a rail stack, barrels, a water
         trough, a cook fire's stones and a coffee pot, so the near ground behind the hero has things to read */
      { const [x, z] = at(-25, f.side * 7); buildWagon(ctx, L, x, z, Math.atan2(VX, VZ) + 0.5, { canvas: 0xdccfb2 }); }
      { const save = ctx.r; ctx.r = rng((ctx.seed | 0) * 37 + 411); try { buildDump(ctx, L, f); } finally { ctx.r = save; } }
      { const [x, z] = at(-34, -f.side * 17); buildGraves(ctx, L, x, z, r() * TAU, 5); }
      /* bones in the grass, mist only in the low ground (a sheet at eye height cut a band through every figure) */
      buildBones(ctx, L, at(-52, -f.side * 18), r() * TAU, 0.7);
      addFogSheets(ctx, L, [0.3], { color: 0xd8c4a8, alpha: 0.12, R: 120 });
    },
    props: [
      { m: 'namaqualand_boulder_04', n: 10, s: [1.4, 3.2], d: [30, 100], sink: 0.3, tint: 0x7a6a58, cover: 0x8a7456, coverAmt: 0.7, tilt: 0.3, cluster: [1, 3], spread: 6, where: (ctx, x, z) => (ctx.f.trackI(x, z)[0] < 8 || townK(ctx.f, x, z) > 0.01 ? 0 : 1) },
      { m: 'namaqualand_cliff_02', n: 5, s: [8, 14], d: [70, 140], sink: 0.2, tint: 0x8a7462, cover: 0x8a7456, coverAmt: 0.5, tilt: 0.1, where: (ctx, x, z) => (ctx.f.trackI(x, z)[0] < 16 || townK(ctx.f, x, z) > 0.01 ? 0 : 1) },
      { m: 'rock_07', n: 46, s: [0.4, 1.2], d: [6, 90], sink: 0.45, tint: 0x6e5e4e, cover: 0x7a6650, coverAmt: 0.85, clutter: true, cluster: [1, 4], spread: 4, where: (ctx, x, z) => (ctx.f.trackI(x, z)[0] < 3 || townK(ctx.f, x, z) > 0.3 ? 0 : 1) },
      { p: 'pebble', tex: 'grass_path_2', shadow: false, n: 260, s: [0.06, 0.18], d: [16, 120], tint: 0x6a645c, clutter: true, cluster: [6, 14], spread: 1.6, where: (ctx, x, z) => smooth(3.2, 1.8, ctx.f.trackI(x, z)[0]) },
      { p: 'deadtree', n: 6, h: [5, 9], d: [36, 130], tint: 0x3a3028, bark: 'grey', lean: [0.05, 0.25], leanP: 0.5, kinds: 3, where: (ctx, x, z) => (ctx.f.trackI(x, z)[0] < 10 || townK(ctx.f, x, z) > 0.01 ? 0 : 1) },
      /* sagebrush: grey-green bushes scattered over the dirt, a few big ones */
      /* fewer bushes in tight stands with open dirt between, a wider size range */
      { p: 'heather', n: 400, h: [0.35, 1.5], d: [5, 120], root: 0x2a2a1c, tip: 0x7e8a70, clutter: true, cluster: [3, 9], spread: 3.2, tintVar: 0.5, tintTo: 0xa8a28a, where: (ctx, x, z) => (ctx.f.trackI(x, z)[0] < 4 ? 0 : 1 - townK(ctx.f, x, z) * 0.9) },
      { p: 'reeds', n: 40, h: [0.8, 1.6], d: [16, 110], color: 0x5a5a32, clutter: true, where: (ctx, x, z) => smooth(6, 2.5, ctx.f.creekI(x, z)[0]) },
    ],
    grass: [
      /* bunchgrass: short dry tufts in clumps with bare dirt between, never a field */
      { n: 10000, h: [0.16, 0.36], root: 0x3a3018, tip: 0xb8a070, wind: 0.2, r: [3, 125], rim: 0xffd090, rimK: 1.2, pow: 1.3, dry: 0xd8c090, lush: 0x9a9060, tintF: 0.04, clump: [4, 10], clumpR: 0.6,
        density: (ctx, x, z) => { const d = ctx.f.trackI(x, z)[0]; if (d < 3.4) return 0; return (1 - 0.85 * townK(ctx.f, x, z)) * (0.14 + 0.6 * smooth(0.46, 0.64, fbm(x * 0.06 + 5, z * 0.06, 3))) * smooth(3.4, 5, d); },
        height: (ctx, x, z) => (1 + 0.5 * smooth(0.5, 0.7, fbm(x * 0.03 + 1, z * 0.03 + 2, 3))) * (Math.hypot(x, z) < 12 ? 0.7 : 1) },
    ],
    particles: [
      { kind: 'dot', n: 420, size: 0.04, vel: [1.2, 0.18, -0.3], var: [0.8, 0.3, 0.5], color: 0xa87a54, opacity: 0.26, sway: 0.7 },
    ],
  },
};

/* ================================================================== light looks (world.js LOOK) */
export const looks = {
  /* dusk: the sun on the horizon in front-left, everything backlit, long shadows toward the hero */
  mesa: { key: [-0.62, 0.12, -0.78], keyCol: 0xffa060, keyI: 4.8, fill: 0.24, rim: 0xffb070, rimI: 1.5, back: 1.5, /* fill 0.15 -> 0.24, rim 1.3 -> 1.5 (shaded butte faces went muddy) */
    disc: { r: 0.05, col: 0xff7a30, i: 1.2, soft: 0.05, halo: 0xff5a18, haloI: 0.5, haloR: 4, veil: 0.15 },
    skyTop: 0x1e1834, skyBot: 0xf0904a,
    fog: { d: 0.0015, h: 0.0026, fall: 0.1, max: 0.78, start: 12, sky: 1, scatter: 0.3 }, grade: { sat: 0.9, con: 0.46, lift: 0x0e0a12, gain: 0xfff2e0 }, exp: 0.92 },
  /* dawn: a pale sun low on the left, raking light across the grass, cool shadows */
  railhead: { key: [-0.92, 0.14, -0.34], keyCol: 0xffcf98, keyI: 4.4, fill: 0.22, rim: 0xffe0b8, rimI: 1.1, back: 1.3,
    disc: { r: 0.03, col: 0xfff0d0, i: 1.6, soft: 0.06, halo: 0xffc080, haloI: 0.45, haloR: 5, veil: 0.3 },
    skyTop: 0x22385e, skyBot: 0xf0b07a,
    fog: { d: 0.0011, h: 0.0026, fall: 0.12, max: 0.6, start: 16, sky: 0.22, scatter: 0.28 }, grade: { sat: 0.95, con: 0.44, lift: 0x0a0e18, gain: 0xfff2e0 }, exp: 0.95 },
};
/* per-land grime for the foes' gear and cloth (world.js GRIME_BY_LAND): rust, mud, soot, frost; mud colour; cloth dye.
   Mud stays low: world.js grimes every non-SQ_Cloth part, and on a pale shirt mud patches read as cow print. */
export const grime = {
  mesa: { k: [0.3, 0.06, 0.08, 0], mud: 0x3a2a1e, dye: 0x3a2c22 },
  railhead: { k: [0.28, 0.06, 0.1, 0], mud: 0x332e22, dye: 0x3a3424 },
};

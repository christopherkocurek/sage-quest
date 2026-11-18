import * as THREE from 'three';
/* ---------- ONE dog for every world ----------
   The first dog read as a wooden toy when it walked, lay flat like a dead dog, and
   clipped into the camera. The old hounds were capsules and spheres on peg legs, with no waist and no joints. This dog is
   built from lofted sections (a ring of points per station along a spine), so it has the silhouette a dog reads by from the
   side, the front and the back: a deep chest, a tucked waist, a haunch, a long neck, a skull with a stop and a tapered muzzle,
   ears, four jointed legs (elbow and hock) and a three-part tail. buildDog(mk, look) builds it with any material maker
   (folk.js: fur in the world's coat; questprops.js: the dark world's spirit shader, same shape); poseDog(D, s, dt) walks,
   trots, sits (head up, front legs straight) and lies like a sphinx (head up, ears moving, tail sweeping). */
const _dv = new THREE.Vector3(); const _dy = new THREE.Vector3(0, 1, 0); const _ds = new THREE.Vector3(); const _du = new THREE.Vector3();
/* stations: [[x, y, z, halfWidth, halfHeight], ...] along a path; seg ring points; closed ends */
export function dogLoft(st, seg = 14) {
  const P = st.map(([x, y, z]) => new THREE.Vector3(x, y, z)); const n = P.length; const pos = []; const idx = [];
  for (let i = 0; i < n; i++) {
    const T = _dv.subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    _ds.crossVectors(_dy, T); if (_ds.lengthSq() < 1e-6) _ds.set(1, 0, 0); _ds.normalize(); _du.crossVectors(T, _ds).normalize();
    const [, , , w, h] = st[i];
    for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; pos.push(P[i].x + _ds.x * w * Math.cos(a) + _du.x * h * Math.sin(a), P[i].y + _ds.y * w * Math.cos(a) + _du.y * h * Math.sin(a), P[i].z + _ds.z * w * Math.cos(a) + _du.z * h * Math.sin(a)); }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k; const b = i * seg + ((k + 1) % seg); const c = a + seg; const d = b + seg; idx.push(a, c, b, b, c, d); }
  /* caps: a point a little past each end */
  const capAt = (i, dir) => { const T = _dv.subVectors(P[i], P[i - dir]).normalize(); const r = Math.min(st[i][3], st[i][4]) * 0.6; const c = pos.length / 3; pos.push(P[i].x + T.x * r, P[i].y + T.y * r, P[i].z + T.z * r); for (let k = 0; k < seg; k++) { const a = i * seg + k; const b = i * seg + ((k + 1) % seg); if (dir > 0) idx.push(a, b, c); else idx.push(a, c, b); } };
  capAt(n - 1, 1); capAt(0, -1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
export function buildDog(mk, { ears = 'up' } = {}) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  /* the trunk: chest deep and forward, the waist tucked up, the haunch round */
  const torso = mk(dogLoft([[0, 0.57, 0.37, 0.07, 0.08], [0, 0.55, 0.31, 0.13, 0.155], [0, 0.535, 0.2, 0.155, 0.19], [0, 0.55, 0.07, 0.145, 0.165], [0, 0.58, -0.07, 0.118, 0.125], [0, 0.6, -0.19, 0.13, 0.135], [0, 0.6, -0.29, 0.125, 0.125], [0, 0.6, -0.37, 0.075, 0.075]], 16), body, 'fur');
  const neck = new THREE.Group(); neck.position.set(0, 0.62, 0.28); body.add(neck);
  mk(dogLoft([[0, -0.03, -0.05, 0.115, 0.13], [0, 0.06, 0.05, 0.095, 0.1], [0, 0.14, 0.12, 0.08, 0.082], [0, 0.18, 0.15, 0.072, 0.074]], 12), neck, 'fur');
  const collar = mk(new THREE.TorusGeometry(0.078, 0.014, 6, 18), neck, 'collar'); collar.position.set(0, 0.07, 0.065); collar.scale.setScalar(1.18); collar.rotation.x = Math.PI / 2 - 0.7;
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.17); neck.add(head);
  /* skull with a stop, the muzzle tapers to a black nose; the jaw under it */
  mk(dogLoft([[0, 0.01, -0.09, 0.055, 0.055], [0, 0.02, -0.05, 0.09, 0.082], [0, 0.02, 0.01, 0.092, 0.085], [0, 0.0, 0.055, 0.07, 0.066]], 14), head, 'fur');
  mk(dogLoft([[0, -0.015, 0.05, 0.058, 0.052], [0, -0.025, 0.12, 0.05, 0.042], [0, -0.03, 0.18, 0.04, 0.032], [0, -0.031, 0.2, 0.028, 0.022]], 12), head, 'fur');
  mk(dogLoft([[0, -0.06, 0.04, 0.042, 0.022], [0, -0.065, 0.15, 0.03, 0.016], [0, -0.062, 0.18, 0.02, 0.012]], 10), head, 'fur');
  const nose = mk(new THREE.SphereGeometry(0.024, 10, 8), head, 'nose'); nose.position.set(0, -0.022, 0.212); nose.scale.set(1.2, 0.85, 0.9);
  for (const s of [-1, 1]) { const e = mk(new THREE.SphereGeometry(0.014, 8, 6), head, 'eye'); e.position.set(s * 0.045, 0.03, 0.06); }
  const earG = []; for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.05, 0.075, -0.02); head.add(eg); earG.push(eg);
    if (ears === 'up') { const g = new THREE.ConeGeometry(0.045, 0.115, 6); g.translate(0, 0.05, 0); g.scale(1, 1, 0.42); const m = mk(g, eg, 'fur'); m.rotation.z = -s * 0.22; }
    else { const g = new THREE.SphereGeometry(0.06, 10, 8); g.scale(0.32, 1.2, 0.85); g.translate(0, -0.04, 0); const m = mk(g, eg, 'fur'); m.position.x = s * 0.025; m.rotation.z = s * 0.25; }
    eg.userData.s = s; eg.userData.drop = ears !== 'up';
  }
  /* legs: the front from the shoulder (upper arm, elbow, forearm, paw); the hind from the hip (thigh, hock, cannon, paw) */
  const legs = [];
  for (const [x, z, front] of [[0.075, 0.2, true], [-0.075, 0.2, true], [0.08, -0.26, false], [-0.08, -0.26, false]]) {
    const hip = new THREE.Group(); hip.position.set(x, front ? 0.57 : 0.6, z); body.add(hip);
    const knee = new THREE.Group(); hip.add(knee);
    if (front) {
      mk(dogLoft([[0, 0.05, -0.01, 0.065, 0.075], [0, -0.12, 0.0, 0.052, 0.058], [0, -0.28, 0.01, 0.038, 0.04]], 10), hip, 'fur');
      knee.position.set(0, -0.27, 0.01);
      mk(new THREE.SphereGeometry(0.041, 10, 8), knee, 'fur'); /* the elbow: a round joint, no seam between the two segments */
      mk(dogLoft([[0, 0.03, 0, 0.038, 0.04], [0, -0.14, 0, 0.031, 0.031], [0, -0.26, 0.005, 0.028, 0.028]], 10), knee, 'fur');
      const paw = mk(new THREE.SphereGeometry(0.034, 10, 6), knee, 'fur'); paw.position.set(0, -0.285, 0.022); paw.scale.set(1, 0.6, 1.4);
    } else {
      mk(dogLoft([[0, 0.06, -0.03, 0.085, 0.105], [0, -0.1, 0.03, 0.07, 0.08], [0, -0.24, 0.07, 0.042, 0.046]], 10), hip, 'fur');
      knee.position.set(0, -0.23, 0.07);
      mk(new THREE.SphereGeometry(0.046, 10, 8), knee, 'fur'); /* the hock */
      { const hm = mk(new THREE.SphereGeometry(0.1, 12, 10), hip, 'fur'); hm.position.set(0, 0.0, -0.01); hm.scale.set(0.85, 1.05, 1.15); } /* the haunch: a round thigh, so a sitting dog reads as one body */
      mk(dogLoft([[0, 0.03, 0.01, 0.04, 0.042], [0, -0.07, -0.05, 0.032, 0.034], [0, -0.15, -0.09, 0.029, 0.029], [0, -0.33, -0.07, 0.027, 0.027]], 10), knee, 'fur');
      const paw = mk(new THREE.SphereGeometry(0.034, 10, 6), knee, 'fur'); paw.position.set(0, -0.355, -0.05); paw.scale.set(1, 0.6, 1.4);
    }
    legs.push({ hip, knee, front, x });
  }
  /* the tail: three segments, carried up in a soft curve */
  const tail = []; let par = body; let at = [0, 0.625, -0.35];
  for (let k = 0; k < 3; k++) { const g = new THREE.Group(); g.position.set(...at); par.add(g); const r0 = 0.038 - k * 0.009; mk(dogLoft([[0, 0, 0, r0, r0], [0, 0, -0.11, r0 * 0.8, r0 * 0.8]], 8), g, 'fur'); tail.push(g); par = g; at = [0, 0, -0.105]; }
  return { root, body, torso, neck, head, ears: earG, legs, tail, ph: Math.random() * 6, tw: 0, ear: 0, earT: 1 + Math.random() * 3 };
}
/* s: { t, speed (m/s), sit 0..1, lie 0..1, wag 0..2, alert ('growl' | 'wag' | null), look (rad, head turn) } */
export function poseDog(D, s, dt) {
  const run = Math.min(1, Math.max(0, s.speed / 4.5)); const mv = Math.min(1, s.speed / 0.6);
  const lie = s.lie || 0; const sit = (s.sit || 0) * (1 - lie); const up = Math.max(0, 1 - lie - sit);
  D.ph += dt * (3.2 + s.speed * 2.3); const ph = D.ph;
  const amp = mv * up * (0.35 + run * 0.3);
  for (const L of D.legs) {
    const diag = (L.front === (L.x > 0)) ? 0 : Math.PI; const p = ph + diag + (L.front ? 0 : 0.25);
    const sw = Math.sin(p); const lift = Math.max(0, Math.cos(p));
    if (L.front) {
      L.hip.rotation.x = -sw * amp * 0.9 + sit * 0.72 + lie * -1.35;
      L.knee.rotation.x = lift * amp * 1.6 + lie * 0.2 - sit * 0.02;
    } else {
      L.hip.rotation.x = -sw * amp * 0.85 - sit * 1.25 - lie * 1.4;
      L.knee.rotation.x = -lift * amp * 1.1 + sit * 2.05 + lie * 2.35;
    }
    L.hip.position.x = L.x * (1 + lie * (L.front ? 0.3 : 0.7) + sit * (L.front ? 0 : 0.4));
  }
  const bob = Math.abs(Math.sin(ph)) * 0.02 * mv * up;
  D.body.rotation.x = -0.75 * sit + Math.sin(ph * 2) * 0.012 * mv * up;
  D.body.position.set(0, bob - lie * 0.36 + sit * 0.0, sit * 0.22 + lie * 0.02);
  /* breathing */
  const br = 1 + Math.sin(s.t * (lie > 0.5 ? 1.6 : 2.4)) * 0.018; D.torso.scale.set(br, br, 1);
  /* the head stays up and level in every pose and looks about */
  D.neck.rotation.x = 0.75 * sit * 0.8 + lie * 0.12 + run * 0.35 - 0.05 + (s.alert === 'growl' ? 0.45 : 0);
  D.head.rotation.x = 0.75 * sit * 0.2 + lie * 0.05 - run * 0.15 + Math.sin(s.t * 0.8) * 0.04;
  D.head.rotation.y = (s.look || 0) * 0.8 + Math.sin(s.t * 0.45 + 1.3) * 0.25 * (1 - run);
  D.head.rotation.z = Math.sin(s.t * 0.33) * 0.08 * (1 - run);
  /* ears: they flick now and then and lie back when it runs */
  D.earT -= dt; if (D.earT <= 0) { D.earT = 1.2 + Math.random() * 3.5; D.ear = 1; } D.ear = Math.max(0, D.ear - dt * 4);
  for (const e of D.ears) { const s2 = e.userData.s; e.rotation.x = -run * 0.5 + (s.alert === 'growl' ? -0.4 : 0); e.rotation.z = s2 * (D.ear * 0.35 * (s2 > 0 ? 1 : 0.4)) + (e.userData.drop ? 0 : -s2 * 0.05); }
  /* the tail: carried up and wagging; low and sweeping when it lies; still and low on a growl */
  const wag = s.alert === 'growl' ? 0.05 : s.alert === 'wag' ? 2 : (s.wag ?? 1);
  const wf = lie > 0.5 ? 2.2 : 7 + wag * 3; const wa = Math.min(0.55, 0.22 * wag);
  D.tail.forEach((g, k) => { g.rotation.y = Math.sin(s.t * wf - k * 0.6) * wa * (k ? 0.7 : 1); g.rotation.x = k === 0 ? (0.75 - lie * 0.9 - sit * 0.2 + run * -0.2 - (s.alert === 'growl' ? 0.5 : 0)) : -0.12 - lie * 0.15; });
}

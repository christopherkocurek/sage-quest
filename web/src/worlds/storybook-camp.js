/* Storybook camp: a golden-dusk bonfire in a ring of field stones, a painted waystone for the name, a trodden
   earth patch, a striped tent with a pennant and a log bench. Shape: `camp = { build(cc), sky, exposure }` (see EXAMPLE_CAMP in worlds/index.js).
   Dense one-line code uses block comments only. */
export const camp = {
  /* golden hour, never night: the camp keeps the land's sun (looks.*.campExposure 1.2), no stars, no moon */
  exposure: 1.2,
  sky: { stars: 0, moon: false },
  /* the card light: a soft warm key and a cool sky fill, so the hero reads in daylight colours, never copper */
  cardLight: { color: 0xfff0d8, power: 0.45, fill: 0xd0e0ff },
  build(cc) {
    const T = cc.THREE; const own = cc.own;
    let s = cc.seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const std = (color, rough = 0.85, extra = {}) => own(new T.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
    const stoneM = std(0xa8a294, 0.95); const woodM = std(0x6a4a2e, 0.9); const charM = std(0x2a2420, 1);
    /* ---- the fire: a ring of field stones round a log teepee */
    const fire = new T.Group();
    const rock = own(new T.DodecahedronGeometry(0.16, 0));
    for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + r() * 0.2; const m = new T.Mesh(rock, stoneM); m.position.set(Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62); m.scale.set(1 + r() * 0.5, 0.6 + r() * 0.3, 0.9 + r() * 0.4); m.rotation.set(r() * 3, r() * 3, r() * 3); m.castShadow = true; m.receiveShadow = true; fire.add(m); }
    const log = own(new T.CylinderGeometry(0.06, 0.075, 0.9, 7));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const m = new T.Mesh(log, i % 2 ? woodM : charM); m.position.set(Math.cos(a) * 0.2, 0.32, Math.sin(a) * 0.2); m.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55); m.castShadow = true; fire.add(m); }
    const bed = new T.Mesh(own(new T.CircleGeometry(0.55, 20)), charM); bed.rotation.x = -Math.PI / 2; bed.position.y = 0.012; fire.add(bed);
    /* ---- the sign: a painted waystone (a rounded standing slab, cream paint, a blue band and red chevrons at the foot) */
    const board = new T.Group();
    const slabG = own(new T.BoxGeometry(1.36, 1.9, 0.34, 4, 6, 1)); slabG.translate(0, 0.95, 0);
    { const p = slabG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const x = p.getX(i); p.setX(i, x * (1 - 0.06 * (y / 1.9))); p.setZ(i, p.getZ(i) * (1 - 0.1 * (y / 1.9))); } slabG.computeVertexNormals(); }
    const paintM = std(0xe8dcc0, 0.9);
    const slab = new T.Mesh(slabG, paintM); slab.castShadow = true; slab.receiveShadow = true; board.add(slab);
    const arch = new T.Shape(); arch.absarc(0, 0, 0.64, 0, Math.PI, false); arch.lineTo(0.64, 0);
    const topG = own(new T.ExtrudeGeometry(arch, { depth: 0.3, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 20 })); topG.translate(0, 0, -0.15);
    const top = new T.Mesh(topG, paintM); top.position.set(0, 1.88, 0); top.castShadow = true; board.add(top);
    const blueM = std(0x2a4f9a, 0.8); const redM = std(0xb83a2c, 0.8); const goldM = std(0xe2b04a, 0.6);
    const band = new T.Mesh(own(new T.BoxGeometry(1.38, 0.14, 0.36)), blueM); band.position.set(0, 0.32, 0); board.add(band);
    const chev = own(new T.BoxGeometry(0.34, 0.07, 0.02));
    for (let i = 0; i < 4; i++) for (const s2 of [-1, 1]) { const m = new T.Mesh(chev, redM); m.position.set(-0.48 + i * 0.32 + s2 * 0.075, 0.14, 0.175); m.rotation.z = s2 * 0.6; board.add(m); }
    const rim = new T.Mesh(own(new T.TorusGeometry(0.56, 0.022, 6, 28, Math.PI)), goldM); rim.position.set(0, 1.9, 0.172); board.add(rim);
    const face = new T.Mesh(own(new T.PlaneGeometry(1.08, 1.44))); face.position.set(0, 1.17, 0.175); board.add(face);
    /* ---- the ground: trodden warm earth with a few flat stones */
    const ground = new T.Group();
    const earth = new T.Mesh(own(new T.CircleGeometry(2.6, 40)), std(0x8a7350, 1)); earth.rotation.x = -Math.PI / 2; earth.position.y = 0.008; earth.receiveShadow = true; ground.add(earth);
    const flat = own(new T.CylinderGeometry(0.22, 0.26, 0.06, 7));
    for (let i = 0; i < 7; i++) { const a = r() * Math.PI * 2; const d = 1.6 + r() * 1.0; const m = new T.Mesh(flat, stoneM); m.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d); m.rotation.y = r() * 3; m.scale.setScalar(0.7 + r() * 0.6); m.receiveShadow = true; ground.add(m); }
    /* ---- props: a striped tent with a pennant, a log bench */
    const tent = new T.Group();
    const tentG = own(new T.ConeGeometry(1.5, 2.3, 10, 1, true).toNonIndexed()); tentG.translate(0, 1.15, 0);
    { const p = tentG.attributes.position; const col = new Float32Array(p.count * 3); const cA = new T.Color(0xb83a2c); const cB = new T.Color(0xf2ead8);
      for (let f = 0; f < p.count; f += 3) { const x = p.getX(f) + p.getX(f + 1) + p.getX(f + 2); const z = p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2); const c = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * 10) % 2 ? cA : cB; for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3); }
      tentG.setAttribute('color', new T.BufferAttribute(col, 3)); }
    const tentM = own(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: T.DoubleSide, flatShading: true }));
    const cone = new T.Mesh(tentG, tentM); cone.castShadow = true; cone.receiveShadow = true; tent.add(cone);
    const door = new T.Mesh(own(new T.PlaneGeometry(0.7, 1.1)), std(0x2a1e18, 1)); door.position.set(0, 0.55, 1.12); door.rotation.x = -0.52; tent.add(door);
    const pole = new T.Mesh(own(new T.CylinderGeometry(0.025, 0.03, 1.2, 6)), woodM); pole.position.y = 2.75; tent.add(pole);
    const penG = own(new T.BufferGeometry()); penG.setAttribute('position', new T.Float32BufferAttribute([0, 0.18, 0, 0, -0.18, 0, 0.9, 0, 0, 0, 0.18, 0, 0.9, 0, 0, 0, -0.18, 0], 3)); penG.computeVertexNormals();
    const pennant = new T.Mesh(penG, std(0xd8a838, 0.7, { side: T.DoubleSide, emissive: 0x2a1e08 })); pennant.position.set(0.02, 3.18, 0); tent.add(pennant);
    tent.position.set(-4.4, 0, -3.6); tent.rotation.y = 0.7;
    const bench = new T.Mesh(own(new T.CylinderGeometry(0.2, 0.22, 1.7, 9)), woodM); bench.rotation.z = Math.PI / 2; bench.position.set(4.2, 0.2, -2.4); bench.rotation.y = -0.5; bench.castShadow = true;
    cc.onUpdate((dt, t) => { pennant.rotation.y = Math.sin(t * 2.1) * 0.35 + Math.sin(t * 5.3) * 0.08; pennant.scale.x = 1 + Math.sin(t * 3.1) * 0.05; });
    return {
      fire, flame: { y: 0.12, scale: 1.05, colors: [0xfff6d8, 0xffc04a, 0xe0661a, 0xffb050] },
      sign: { mesh: board, face, w: 1.08, h: 1.44, style: { bg: '#e8dcc0', groove: 'rgba(42,32,22,0.88)', lip: 'rgba(255,255,255,0.28)', glow: 0.12, tint: 0xd8ccb0, font: cc.ui.serif || undefined } },
      ground, props: [tent, bench],
    };
  },
};

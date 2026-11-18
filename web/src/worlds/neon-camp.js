import { worldById } from '/game/worlds.mjs';
import { skyFigure } from './sky-figure.js';
/* The Neon City camp: a barrel fire on a tar rooftop, an LED billboard as the sign, puddles of rain on the tar, a low
   parapet, roof units, a water tank and an antenna with a red light (camp.build(cc); see EXAMPLE_CAMP in worlds/index.js). */
export const camp = {
  exposure: 0.75,
  sky: { stars: 0.12, moon: false },
  /* the card light: a cool key and a cyan-grey fill, so the black suit reads as black under the barrel fire */
  cardLight: { color: 0xbcd4ec, power: 0.16, fill: 0x2a4a66 },
  build(cc) {
    const T = cc.THREE;
    const std = (color, rough, metal = 0) => cc.own(new T.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
    const rust = std(0x3a2418, 0.75, 0.5); const steel = std(0x2a2d32, 0.45, 0.8); const tar = std(0x0e0f11, 0.55, 0.05);
    const conc = std(0x3a3b3d, 0.9); const unit = std(0x55585c, 0.6, 0.6);
    /* the fire: an oil drum with a dark rim and two ribs, holes near the base */
    const fire = new T.Group();
    const drum = new T.Mesh(cc.own(new T.CylinderGeometry(0.3, 0.3, 0.88, 18, 1, true)), rust); drum.material.side = T.DoubleSide; drum.position.y = 0.44; drum.castShadow = true; fire.add(drum);
    for (const y of [0.3, 0.6, 0.87]) { const r = new T.Mesh(cc.own(new T.TorusGeometry(0.305, 0.014, 6, 24)), steel); r.rotation.x = Math.PI / 2; r.position.y = y; fire.add(r); }
    const glowM = cc.own(new T.MeshBasicMaterial({ color: new T.Color(0xff7a2a).multiplyScalar(3), toneMapped: false }));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const h = new T.Mesh(cc.own(new T.CircleGeometry(0.035, 10)), glowM); h.position.set(Math.cos(a) * 0.302, 0.12, Math.sin(a) * 0.302); h.lookAt(Math.cos(a) * 2, 0.12, Math.sin(a) * 2); fire.add(h); }
    /* the sign: an LED billboard on a steel frame; the camp paints the name on the face (light only, no carving) */
    const board = new T.Group();
    for (const x of [-0.7, 0.7]) { const p = new T.Mesh(cc.own(new T.BoxGeometry(0.08, 2.5, 0.08)), steel); p.position.set(x, 1.25, -0.06); p.castShadow = true; board.add(p); }
    const back = new T.Mesh(cc.own(new T.BoxGeometry(1.36, 2.0, 0.1)), std(0x08090b, 0.4, 0.6)); back.position.set(0, 1.4, 0); board.add(back);
    const frameM = cc.own(new T.MeshBasicMaterial({ color: new T.Color(0x3ef2ff).multiplyScalar(1.6), toneMapped: false }));
    for (const [w, h, x, y] of [[1.36, 0.02, 0, 2.4], [1.36, 0.02, 0, 0.4], [0.02, 2.0, -0.68, 1.4], [0.02, 2.0, 0.68, 1.4]]) { const f = new T.Mesh(cc.own(new T.BoxGeometry(w, h, 0.02)), frameM); f.position.set(x, y, 0.055); board.add(f); }
    const face = new T.Mesh(cc.own(new T.PlaneGeometry(1.24, 1.9))); face.position.set(0, 1.4, 0.056); board.add(face);
    /* the ground: tar roof with puddles that hold the light, a low parapet round the edge (open toward the camera) */
    const ground = new T.Group();
    const roof = new T.Mesh(cc.own(new T.CircleGeometry(9, 48)), tar); roof.rotation.x = -Math.PI / 2; roof.position.y = 0.005; roof.receiveShadow = true; ground.add(roof);
    const wet = cc.own(new T.MeshStandardMaterial({ color: 0x050607, roughness: 0.04, metalness: 0.4, envMapIntensity: 1.2 }));
    const r = cc.kit.rng(cc.seed || 7);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2; const d = 1.6 + r() * 5.5; const x = Math.cos(a) * d; const z = Math.sin(a) * d;
      if (cc.keepOut?.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue;
      const g = new T.CircleGeometry(0.5 + r() * 0.9, 20); const p = g.attributes.position; for (let k = 1; k < p.count; k++) { const s = 0.75 + 0.5 * r(); p.setX(k, p.getX(k) * s); p.setY(k, p.getY(k) * (0.6 + 0.4 * s)); }
      const m = new T.Mesh(cc.own(g), wet); m.rotation.x = -Math.PI / 2; m.rotation.z = r() * 6; m.position.set(x, 0.012, z); m.receiveShadow = true; ground.add(m);
    }
    const seg = cc.own(new T.BoxGeometry(2.6, 0.9, 0.35));
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2; const x = Math.cos(a) * 8.4; const z = Math.sin(a) * 8.4;
      if (z > 2.5 && Math.abs(x) < 5) continue;
      const m = new T.Mesh(seg, conc); m.position.set(x, 0.45, z); m.rotation.y = -a + Math.PI / 2; m.castShadow = true; m.receiveShadow = true; ground.add(m);
    }
    /* props: two roof units, a vent stack, a water tank on legs and an antenna with a red light (both beyond 8 m) */
    const props = [];
    for (const [x, z, w] of [[-4.6, -3.2, 1.6], [4.8, -2.4, 1.2]]) {
      const u = new T.Group(); const b = new T.Mesh(cc.own(new T.BoxGeometry(w, 1.0, 1.0)), unit); b.position.y = 0.5; b.castShadow = true; u.add(b);
      const fan = new T.Mesh(cc.own(new T.CylinderGeometry(0.34, 0.34, 0.06, 18)), steel); fan.position.set(0, 1.03, 0); u.add(fan);
      u.position.set(x, 0, z); u.rotation.y = r() * 0.5; props.push(u);
    }
    { const v = new T.Mesh(cc.own(new T.CylinderGeometry(0.16, 0.16, 1.6, 10)), steel); v.position.set(-3.4, 0.8, -5.2); v.castShadow = true; props.push(v); }
    { const tank = new T.Group(); const body = new T.Mesh(cc.own(new T.CylinderGeometry(1.4, 1.4, 2.4, 18)), std(0x2a2420, 0.85)); body.position.y = 4.4; body.castShadow = true; tank.add(body);
      const top = new T.Mesh(cc.own(new T.ConeGeometry(1.5, 0.8, 18)), std(0x1e1a18, 0.8)); top.position.y = 6.0; tank.add(top);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; const l = new T.Mesh(cc.own(new T.CylinderGeometry(0.06, 0.06, 3.2, 6)), steel); l.position.set(Math.cos(a) * 1.1, 1.6, Math.sin(a) * 1.1); tank.add(l); }
      tank.position.set(-6.2, 0, -7.4); props.push(tank); }
    { const mast = new T.Group(); const pole = new T.Mesh(cc.own(new T.CylinderGeometry(0.05, 0.09, 9, 6)), steel); pole.position.y = 4.5; mast.add(pole);
      for (const y of [3, 5.5, 7.5]) { const bar = new T.Mesh(cc.own(new T.BoxGeometry(1.2 - y * 0.08, 0.04, 0.04)), steel); bar.position.y = y; mast.add(bar); }
      const redM = cc.own(new T.MeshBasicMaterial({ color: new T.Color(0xff2020).multiplyScalar(4), toneMapped: false }));
      const lamp = new T.Mesh(cc.own(new T.SphereGeometry(0.09, 10, 8)), redM); lamp.position.y = 9.05; mast.add(lamp);
      cc.onUpdate((dt, t) => { const k = Math.pow(Math.max(0, Math.sin(t * 1.6)), 8); redM.color.setRGB(4 * (0.15 + k), 0.5 * (0.15 + k), 0.5 * (0.15 + k)); });
      mast.position.set(6.4, 0, -7.8); props.push(mast); }
    /* the seats: the shared camp puts two logs and two stones on the seat spots (no world hook yet); here a
       plastic crate and a cable drum stand on each pair of spots (the same top heights, 0.36 and 0.5), and the shared seat
       props are hidden each frame */
    const crateM = std(0x1a3a44, 0.6, 0.1); const drumM = std(0x3a2a1c, 0.8, 0.1); const drumE = std(0x2a2c30, 0.5, 0.7);
    (cc.SEATS || []).forEach((p, i) => {
      const g = new T.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(cc.FIRE.x - p.x, cc.FIRE.z - p.z);
      if (i % 2 === 0) { const c = new T.Mesh(cc.own(new T.BoxGeometry(0.62, 0.36, 0.42)), crateM); c.position.y = 0.18; c.castShadow = true; g.add(c);
        for (const x of [-0.24, 0, 0.24]) { const rib = new T.Mesh(cc.own(new T.BoxGeometry(0.03, 0.3, 0.43)), std(0x123038, 0.6)); rib.position.set(x, 0.18, 0); g.add(rib); } }
      else { const d = new T.Mesh(cc.own(new T.CylinderGeometry(0.34, 0.34, 0.5, 18)), drumM); d.rotation.x = 0; d.position.y = 0.25; d.castShadow = true; g.add(d);
        for (const y of [0.02, 0.48]) { const e = new T.Mesh(cc.own(new T.CylinderGeometry(0.4, 0.4, 0.04, 18)), drumE); e.position.y = y; g.add(e); } }
      props.push(g);
    });
    let seatHide = null;
    cc.onUpdate(() => {
      if (!seatHide) { const campG = ground.parent?.parent?.parent; if (!campG) return; seatHide = [];
        for (const o of campG.children) { const p = o.geometry?.parameters; if (o.isMesh && ((o.geometry.type === 'CylinderGeometry' && Math.abs((p?.radiusTop ?? 0) - 0.19) < 1e-3) || (o.geometry.type === 'DodecahedronGeometry' && Math.abs((p?.radius ?? 0) - 0.34) < 1e-3))) seatHide.push(o); } }
      for (const o of seatHide) o.visible = false;
    });
    return {
      fire, flame: { y: 0.84, scale: 0.75 },
      sign: { mesh: board, face, w: 1.24, h: 1.9, style: { bg: '#04070a', groove: 'rgba(0,0,0,0)', lip: 'rgba(62,242,255,0.22)', glow: 2.2, font: "'Chakra Petch', sans-serif", tint: 0xffffff } },
      ground, props,
    };
  },
};

/* the far shape on the nemesis line: for the Tower, a black skyscraper 150 m tall to its spire at 240 m, so the walk's line
   "The Tower, far off on the horizon." shows it: four setbacks, a lit window field (thinner toward the top), cyan light lines
   up its corners, a red crown ring and a slow red beacon on the spire. Its lights are unfogged glow (fog: false) so the
   haze keeps the shape soft but the lights read. Every material sits in ctx.mats (it fades in and out with the line).
   the Other Courier was an empty shape (a dark giant would break the city). Now he is a hologram over the
   street, 64 m: the real rig in his courier kit (hood, mask, jacket, pack) as cyan light with scan lines, standing still
   with the cable whip hanging to the ground from his right hand, his head turning to the walker; now and then the
   picture tears (a jump sideways, a red flash) and settles. A soft ring of light at his feet where the projection lands. */
export function skyNemesis(id, ctx) {
  if (id === 'other') return courierHolo(ctx);
  const T = ctx.THREE; const grp = new T.Group();
  if (id !== 'tower') return { object: grp };
  const geos = []; const texs = [];
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 256);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) { const up = y / 64; if (rnd() < 0.42 - up * 0.25) { g.fillStyle = rnd() < 0.8 ? '#9fe8ff' : '#ffd29a'; g.fillRect(x * 4 + 1, 256 - (y + 1) * 4 + 1, 2, 2); } }
  const win = new T.CanvasTexture(cv); win.colorSpace = T.SRGBColorSpace; win.magFilter = T.NearestFilter; win.wrapS = win.wrapT = T.RepeatWrapping; texs.push(win);
  const body = ctx.sil({ color: 0x0a0b0e, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.6 });
  const cyan = new T.MeshBasicMaterial({ color: new T.Color(0x3ef2ff).multiplyScalar(2.2), transparent: true, opacity: 0, fog: false, toneMapped: false }); ctx.mats.push(cyan);
  const red = new T.MeshBasicMaterial({ color: new T.Color(0xff2a30).multiplyScalar(4), transparent: true, opacity: 0, fog: false, toneMapped: false }); ctx.mats.push(red);
  const tiers = [[34, 0, 62], [27, 62, 40], [20, 102, 20], [13, 122, 10]];
  for (const [w, y0, h] of tiers) {
    const b = new T.BoxGeometry(w, h, w); b.translate(0, y0 + h / 2, 0);
    const uv = b.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 34, (uv.getY(k) * h + y0) / 132); /* one window field over the whole height */
    geos.push(b); const m = new T.Mesh(b, body); grp.add(m);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const e = new T.BoxGeometry(0.7, h, 0.7); e.translate(sx * w / 2, y0 + h / 2, sz * w / 2); geos.push(e); grp.add(new T.Mesh(e, cyan)); }
  }
  for (const [y, w] of [[118, 21], [128, 14.5], [131, 14.5]]) { const r = new T.BoxGeometry(w, 0.9, w); r.translate(0, y, 0); geos.push(r); grp.add(new T.Mesh(r, red)); }
  const sp = new T.CylinderGeometry(0.3, 1.4, 20, 6); sp.translate(0, 142, 0); geos.push(sp); grp.add(new T.Mesh(sp, body));
  const bg = new T.SphereGeometry(1.4, 10, 8); bg.translate(0, 152.5, 0); geos.push(bg); const beacon = new T.Mesh(bg, red); grp.add(beacon);
  return {
    object: grp, dist: 240,
    update(dt, t) { beacon.visible = Math.sin(t * 1.4) > 0.6; },
    dispose() { for (const x of geos) x.dispose(); for (const x of texs) x.dispose(); },
  };
}

/* the Other Courier as a hologram (see skyNemesis above) */
async function courierHolo(ctx) {
  const n = worldById('neon').nemeses.find((x) => x.id === 'other'); if (!n) return { object: new ctx.THREE.Group() };
  const holo = { mat: null, glitch: 0 };
  const F = await skyFigure(ctx, {
    look: n.look, wearUrl: '/assets/real/wear_neon.glb', height: 64, dist: 230, clip: 'Idle_Loop', speed: 0.3, sink: -0.02,
    stance: 0.14, lean: 0.06, arms: [0.1, 0.16], crown: 0.18, dust: null,
    material: (T, U) => {
      const m = new T.MeshBasicMaterial({ color: new T.Color(0x4ff0ff).multiplyScalar(0.24), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false, toneMapped: false });
      const G = { value: 0 }; const K = { value: 1 };
      m.onBeforeCompile = (sh) => {
        sh.uniforms.sqT = U.t; sh.uniforms.sqG = G; sh.uniforms.sqK = K;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSqY;').replace('#include <project_vertex>', '#include <project_vertex>\nvSqY = (modelMatrix * vec4(transformed, 1.0)).y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float sqT; uniform float sqG; uniform float sqK; varying float vSqY;')
          .replace('#include <opaque_fragment>', `float sqScan = 0.3 + 0.7 * step(0.45, fract(vSqY * 0.9 - sqT * 0.6));
            float sqBand = smoothstep(0.0, 0.02, abs(fract(vSqY * 0.035 - sqT * 0.12) - 0.5) - 0.47);
            outgoingLight *= sqK * sqScan * (1.0 + 2.5 * (1.0 - sqBand));
            outgoingLight = mix(outgoingLight, vec3(1.6, 0.2, 0.35) * length(outgoingLight), sqG);
            #include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => 'sq-holo';
      ctx.mats.push(m); holo.mat = m; holo.G = G; holo.K = K; return m;
    },
    weapon: whipFar,
    extras: ({ add, sprite, H, fig }) => {
      const ring = sprite(0x4ff0ff, H * 0.5, { add: true, fog: false }); ring.position.y = H * 0.01; ring.scale.set(H * 0.55, H * 0.12, 1); add(ring);
      let next = 3; let on = 0;
      return {
        update(dt, t, f) {
          ring.material.opacity = f * (0.35 + 0.1 * Math.sin(t * 3.1));
          /* a fast low flicker */
          if (holo.K) holo.K.value = 0.9 + 0.1 * Math.sin(t * 37.0) * Math.sin(t * 5.3);
          next -= dt; if (next < 0 && on <= 0) { on = 0.18; next = 4 + Math.random() * 5; }
          if (on > 0) { on -= dt; fig.position.x = (Math.random() - 0.5) * H * 0.08; holo.G.value = 0.7; } else { fig.position.x = 0; holo.G.value = 0; }
        },
      };
    },
  });
  return F;
}
/* the cable whip: a heavy black cable from the hand down to the street, its end curled on the ground */
function whipFar(T, mat, geos) {
  const pts = [[0, 0, 0], [0.03, -0.25, 0.05], [0.02, -0.55, 0.12], [-0.04, -0.82, 0.2], [-0.12, -0.95, 0.32], [-0.3, -0.98, 0.36], [-0.42, -0.96, 0.22], [-0.36, -0.97, 0.1]].map(([x, y, z]) => new T.Vector3(x, y, z));
  const geo = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 40, 0.016, 5, false); geos.push(geo);
  const g = new T.Group(); g.add(new T.Mesh(geo, mat)); return g;
}

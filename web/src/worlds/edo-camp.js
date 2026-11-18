/* Old Edo camp: an iron brazier on three legs, a disc of raked shrine gravel with an edge of field stones, a wooden
   notice board (kosatsu) under a small tiled roof for the name, a stone lantern lit low, a paper lantern on the board
   and a small torii in the dark behind. Shape: `camp = { build(cc), sky, exposure }` (see EXAMPLE_CAMP in worlds/index.js).
   Dense one-line code uses block comments only. */
import { lanternGeo, toriiGeo } from './edo-lands.js';

export const camp = {
  exposure: 0.95,
  /* the card: a softer, cooler key and a moon-blue fill (the warm brazier key at full power blew pale robes to flat white) */
  cardLight: { color: 0xffc8a0, power: 0.42, fill: 0x5a6a90 },
  sky: { stars: 0.9, moon: true },
  build(cc) {
    const T = cc.THREE; const own = cc.own; const TAU = Math.PI * 2;
    let s = cc.seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const std = (color, rough = 0.85, extra = {}) => own(new T.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
    const ironM = std(0x1c1a1a, 0.55, { metalness: 0.85 }); const stoneM = std(0x6a6862, 0.95); const woodM = std(0x3a2c22, 0.9); const darkWoodM = std(0x221a16, 0.9);
    /* ---- the fire: an iron brazier (kagaribi) on three splayed legs, split pine in the basket */
    const fire = new T.Group();
    const leg = own(new T.CylinderGeometry(0.025, 0.03, 1.0, 6));
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const m = new T.Mesh(leg, ironM); m.position.set(Math.cos(a) * 0.24, 0.48, Math.sin(a) * 0.24); m.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32); m.castShadow = true; fire.add(m); }
    const ringG = own(new T.TorusGeometry(0.2, 0.018, 6, 20)); const ring = new T.Mesh(ringG, ironM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.42; fire.add(ring);
    /* the basket: iron straps in a widening cage, a solid bowl at the bottom */
    const bowl = new T.Mesh(own(new T.LatheGeometry([new T.Vector2(0.0, 0.0), new T.Vector2(0.2, 0.0), new T.Vector2(0.3, 0.1), new T.Vector2(0.31, 0.12)], 16)), ironM); bowl.position.y = 0.74; bowl.castShadow = true; fire.add(bowl);
    const strap = own(new T.BoxGeometry(0.03, 0.34, 0.012));
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const m = new T.Mesh(strap, ironM); m.position.set(Math.cos(a) * 0.36, 0.98, Math.sin(a) * 0.36); m.lookAt(Math.cos(a) * 2, 0.98, Math.sin(a) * 2); m.rotateX(-0.25); fire.add(m); }
    for (const y of [0.86, 1.12]) { const m = new T.Mesh(own(new T.TorusGeometry(y < 1 ? 0.33 : 0.4, 0.012, 5, 24)), ironM); m.rotation.x = Math.PI / 2; m.position.y = y; fire.add(m); }
    const pine = own(new T.BoxGeometry(0.06, 0.42, 0.05)); const charM = std(0x1a1410, 1);
    for (let i = 0; i < 9; i++) { const a = r() * TAU; const m = new T.Mesh(pine, i % 3 ? charM : woodM); m.position.set(Math.cos(a) * 0.12, 1.0, Math.sin(a) * 0.12); m.rotation.set(Math.sin(a) * 0.4, r() * 3, -Math.cos(a) * 0.4); fire.add(m); }
    const embers = new T.Mesh(own(new T.CircleGeometry(0.28, 16)), own(new T.MeshBasicMaterial({ color: new T.Color(0xff6a20).multiplyScalar(2.2) }))); embers.rotation.x = -Math.PI / 2; embers.position.y = 0.86; fire.add(embers);
    /* ---- the sign: a notice board (kosatsu) on two posts under a small gabled roof of dark tile */
    const board = new T.Group();
    for (const sx of [-1, 1]) { const p = new T.Mesh(own(new T.BoxGeometry(0.12, 2.5, 0.12)), darkWoodM); p.position.set(sx * 0.78, 1.25, 0); p.castShadow = true; board.add(p); }
    const panel = new T.Mesh(own(new T.BoxGeometry(1.5, 1.06, 0.05)), std(0x6a5a46, 0.95)); panel.position.set(0, 1.5, 0); panel.castShadow = true; panel.receiveShadow = true; board.add(panel);
    for (const y of [0.92, 2.08]) { const b = new T.Mesh(own(new T.BoxGeometry(1.72, 0.08, 0.1)), darkWoodM); b.position.set(0, y, 0.01); board.add(b); }
    const roofG = own(new T.CylinderGeometry(0.42, 0.42, 2.1, 3, 1)); const roofM = std(0x2a2a30, 0.6, { metalness: 0.1 });
    const roof = new T.Mesh(roofG, roofM); roof.rotation.set(0, 0, Math.PI / 2); roof.scale.set(0.5, 1, 1); roof.position.set(0, 2.34, 0); roof.castShadow = true; board.add(roof);
    const ridge = new T.Mesh(own(new T.BoxGeometry(2.14, 0.07, 0.08)), darkWoodM); ridge.position.set(0, 2.55, 0); board.add(ridge);
    const face = new T.Mesh(own(new T.PlaneGeometry(1.36, 0.94))); face.position.set(0, 1.5, 0.028); board.add(face);
    /* a paper lantern (chochin) hanging from the roof at the right */
    const chochinM = own(new T.MeshStandardMaterial({ color: 0xf0e2c8, roughness: 0.8, emissive: 0xff9a50, emissiveIntensity: 1.6 }));
    const chochin = new T.Mesh(own(new T.SphereGeometry(0.15, 14, 10)), chochinM); chochin.scale.set(1, 1.35, 1); chochin.position.set(0.92, 1.9, 0.22); board.add(chochin);
    const capG = own(new T.CylinderGeometry(0.08, 0.08, 0.04, 10));
    for (const y of [2.1, 1.7]) { const c = new T.Mesh(capG, darkWoodM); c.position.set(0.92, y, 0.22); board.add(c); }
    const cord = new T.Mesh(own(new T.CylinderGeometry(0.006, 0.006, 0.18, 4)), darkWoodM); cord.position.set(0.92, 2.2, 0.22); board.add(cord);
    /* ---- the ground: raked shrine gravel (concentric lines round the brazier), an edge of field stones */
    const ground = new T.Group();
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
    g.fillStyle = '#8a877e'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { const v = 100 + Math.floor(r() * 90); g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
    for (let rr = 26; rr < 256; rr += 13) { g.strokeStyle = 'rgba(40,38,34,0.55)'; g.lineWidth = 3; g.beginPath(); g.arc(256, 256, rr, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(200,196,186,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(256, 256, rr + 3, 0, TAU); g.stroke(); }
    const gt = own(new T.CanvasTexture(cv)); gt.colorSpace = T.SRGBColorSpace; gt.anisotropy = 8;
    const gravel = new T.Mesh(own(new T.CircleGeometry(3.0, 48)), own(new T.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0 }))); gravel.rotation.x = -Math.PI / 2; gravel.position.y = 0.01; gravel.receiveShadow = true; ground.add(gravel);
    const rock = own(new T.DodecahedronGeometry(0.2, 0));
    for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + r() * 0.1; const m = new T.Mesh(rock, stoneM); m.position.set(Math.cos(a) * 3.05, 0.04, Math.sin(a) * 3.05); m.scale.set(1 + r() * 0.5, 0.45 + r() * 0.2, 0.8 + r() * 0.4); m.rotation.set(r(), r() * 3, r()); m.receiveShadow = true; ground.add(m); }
    /* ---- props: a stone lantern lit low, a small torii in the dark behind */
    const L = lanternGeo(r, 0.8); own(L.stone, L.lit);
    const lantern = new T.Group();
    const ls = new T.Mesh(L.stone, std(0x7a766c, 0.95)); ls.castShadow = true; ls.receiveShadow = true; lantern.add(ls);
    lantern.add(new T.Mesh(L.lit, own(new T.MeshBasicMaterial({ color: new T.Color(0xffa050).multiplyScalar(2.2) }))));
    lantern.position.set(3.6, 0, -1.8); lantern.rotation.y = 0.4;
    const t = toriiGeo(0.7); own(t.red, t.black);
    const torii = new T.Group(); torii.add(new T.Mesh(t.red, std(0x8a2a1c, 0.7)), new T.Mesh(t.black, std(0x141214, 0.6)));
    torii.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    torii.position.set(-5.6, 0, -6.6); torii.rotation.y = 0.5;
    cc.onUpdate((dt, tt) => { chochin.rotation.z = Math.sin(tt * 0.9) * 0.05; chochinM.emissiveIntensity = 1.5 + Math.sin(tt * 7.3) * 0.08 + Math.sin(tt * 13.1) * 0.05; });
    return {
      fire, flame: { y: 0.92, scale: 0.85, colors: [0xfff0d0, 0xffb040, 0xd8501a, 0xffa050] },
      sign: { mesh: board, face, w: 1.36, h: 0.94, style: { bg: '#d8ccb0', groove: 'rgba(20,16,12,0.92)', lip: 'rgba(255,255,255,0.2)', glow: 0.25, font: cc.ui.serif || undefined } },
      ground, props: [lantern, torii],
    };
  },
};

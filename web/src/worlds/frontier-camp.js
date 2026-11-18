/* The Frontier's camp dressing (web/src/camp.js keeps the flames, the light, the companions and the carving of the name).
   fire   a ring of fire-blackened stones, an iron grate across it, a dented coffee pot on the grate
   sign   a fence post with a broken rail and a paper poster nailed to it: WANTED across the top, the player's name
          painted below by the camp (no face on it)
   ground packed dust with a scuffed ring around the fire, a few stones
   props  a bedroll on a saddle blanket, a crate with a lantern, a wagon wheel against a stump */

function wantedHeader(T, own) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#d6c6a0'; g.fillRect(0, 0, 512, 160);
  /* foxing: the paper browns at the edges */
  const grd = g.createRadialGradient(256, 80, 40, 256, 80, 300); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(90,60,30,0.45)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#2a1a10'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = "italic 600 92px 'Zilla Slab', Georgia, serif"; g.fillText('WANTED', 256, 84, 440);
  g.fillRect(48, 146, 416, 4);
  const t = own(new T.CanvasTexture(c)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* the poster's printed foot: DEAD OR ALIVE and a reward line, big enough to read from the title camera */
function wantedFoot(T, own) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = '#d6c6a0'; g.fillRect(0, 0, 512, 200);
  const grd = g.createRadialGradient(256, 100, 60, 256, 100, 320); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(90,60,30,0.45)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 200);
  g.fillStyle = '#2a1a10'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillRect(48, 10, 416, 4);
  g.font = "italic 600 62px 'Zilla Slab', Georgia, serif"; g.fillText('DEAD OR ALIVE', 256, 70, 440);
  g.font = "600 40px 'Zilla Slab', Georgia, serif"; g.fillText('$ 500  REWARD', 256, 142, 400);
  const t = own(new T.CanvasTexture(c)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export const camp = {
  exposure: 0.95,
  sky: { stars: 1, moon: true },
  /* the card key: a paler, softer fire so the duster reads as brown cloth, not hot copper */
  cardLight: { color: 0xf2d4b4, power: 0.38, fill: 0x8a9ab8 },
  build(cc) {
    const T = cc.THREE; const own = (x) => cc.own(x);
    const rng = cc.kit.rng(cc.seed || 7); const r = () => rng();
    const stoneMat = own(new T.MeshStandardMaterial({ color: 0x6a5446, roughness: 0.95 }));
    const sootMat = own(new T.MeshStandardMaterial({ color: 0x1e1814, roughness: 1 }));
    const iron = own(new T.MeshStandardMaterial({ color: 0x24201e, roughness: 0.55, metalness: 0.8 }));
    const enamel = own(new T.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.45, metalness: 0.3 }));
    const wood = own(new T.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
    const woodDark = own(new T.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.95 }));

    /* ---- the fire: a ring of stones, soot inside, a grate and the coffee pot ---- */
    const fire = new T.Group();
    const rock = own(new T.DodecahedronGeometry(0.16, 0));
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + r() * 0.2; const m = new T.Mesh(rock, i % 3 ? stoneMat : sootMat);
      m.position.set(Math.cos(a) * 0.58, 0.07, Math.sin(a) * 0.58); m.scale.set(1 + r() * 0.5, 0.65 + r() * 0.3, 0.9 + r() * 0.4); m.rotation.set(r() * 3, r() * 3, r() * 3);
      m.castShadow = true; fire.add(m);
    }
    const soot = new T.Mesh(own(new T.CircleGeometry(0.55, 20)), sootMat); soot.rotation.x = -Math.PI / 2; soot.position.y = 0.015; fire.add(soot);
    /* a few split logs in the fire */
    const log = own(new T.CylinderGeometry(0.055, 0.065, 0.7, 7));
    for (let i = 0; i < 4; i++) { const m = new T.Mesh(log, woodDark); const a = i * 1.6 + r(); m.position.set(Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08); m.rotation.set(Math.PI / 2 - 0.35, a, 0, 'YXZ'); fire.add(m); }
    /* the grate: two bars on the stones, five rods across */
    const grate = new T.Group(); grate.position.set(0.12, 0.2, 0);
    for (const z of [-0.26, 0.26]) { const b = new T.Mesh(own(new T.BoxGeometry(0.9, 0.025, 0.025)), iron); b.position.z = z; grate.add(b); }
    for (let i = 0; i < 5; i++) { const b = new T.Mesh(own(new T.CylinderGeometry(0.008, 0.008, 0.56, 5)), iron); b.rotation.x = Math.PI / 2; b.position.set(0.08 + i * 0.07, 0.015, 0); grate.add(b); }
    fire.add(grate);
    /* the coffee pot: a tapered body, a lid with a knob, a spout and a wire handle, on the grate at the side of the fire */
    const pot = new T.Group(); pot.position.set(0.28, 0.225, 0.02);
    const body = new T.Mesh(own(new T.LatheGeometry([[0, 0], [0.085, 0], [0.09, 0.02], [0.08, 0.16], [0.06, 0.2], [0.062, 0.21], [0, 0.215]].map(([x, y]) => new T.Vector2(x, y)), 14)), enamel);
    body.castShadow = true; pot.add(body);
    const knob = new T.Mesh(own(new T.SphereGeometry(0.016, 8, 6)), iron); knob.position.y = 0.225; pot.add(knob);
    const spout = new T.Mesh(own(new T.CylinderGeometry(0.012, 0.022, 0.12, 6)), enamel); spout.position.set(-0.1, 0.12, 0); spout.rotation.z = 0.9; pot.add(spout);
    const handle = new T.Mesh(own(new T.TorusGeometry(0.075, 0.005, 4, 14, Math.PI)), iron); handle.position.y = 0.2; pot.add(handle);
    fire.add(pot);
    /* a second, wider fire glow without a shadow: the camp's own fire light reaches the fire ring; this one reaches the post,
       the wheel and the bedroll so they read at the title */
    const glowL = new T.PointLight(0xff9448, 16, 11, 1.6); glowL.position.set(0, 1.1, 0.3); fire.add(glowL);
    cc.onUpdate?.((dt, t) => { glowL.intensity = 16 * (0.9 + 0.1 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1)); });

    /* ---- the sign: a fence post, a broken rail, a poster ---- */
    const board = new T.Group();
    const post = new T.Mesh(own(new T.BoxGeometry(0.16, 2.1, 0.15)), wood); post.position.set(0, 1.05, 0); post.rotation.z = 0.025; post.castShadow = true; board.add(post);
    const cap = new T.Mesh(own(new T.BoxGeometry(0.19, 0.04, 0.18)), woodDark); cap.position.set(0.025, 2.11, 0); board.add(cap);
    for (const [y, len, rz] of [[1.55, 1.3, -0.04], [0.85, 0.9, 0.22]]) { const rail = new T.Mesh(own(new T.BoxGeometry(len, 0.1, 0.06)), wood); rail.position.set(-len / 2 - 0.06, y - (rz > 0.1 ? 0.1 : 0), -0.05); rail.rotation.z = rz; rail.castShadow = true; board.add(rail); }
    const stub = new T.Mesh(own(new T.BoxGeometry(0.15, 0.7, 0.14)), wood); stub.position.set(-1.45, 0.35, -0.05); stub.rotation.z = -0.08; board.add(stub);
    /* the poster: a paper backing a little wider than the painted face, WANTED across the top, four nails */
    const paperMat = own(new T.MeshStandardMaterial({ color: 0xcfbd96, roughness: 0.95, side: T.DoubleSide }));
    const paper = new T.Mesh(own(new T.PlaneGeometry(1.0, 1.62, 1, 3)), paperMat); paper.position.set(0, 1.3, 0.08); board.add(paper);
    { const p = paper.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.006 * Math.sin(p.getY(i) * 7) + (p.getY(i) < -0.5 ? 0.02 : 0)); p.needsUpdate = true; paper.geometry.computeVertexNormals(); }
    const head = new T.Mesh(own(new T.PlaneGeometry(0.92, 0.2875)), own(new T.MeshStandardMaterial({ map: wantedHeader(T, own), roughness: 0.95 }))); head.position.set(0, 1.94, 0.092); board.add(head);
    const face = new T.Mesh(own(new T.PlaneGeometry(0.9, 0.86))); face.position.set(0, 1.37, 0.094); board.add(face);
    const foot = new T.Mesh(own(new T.PlaneGeometry(0.92, 0.36)), own(new T.MeshStandardMaterial({ map: wantedFoot(T, own), roughness: 0.95 }))); foot.position.set(0, 0.73, 0.092); board.add(foot);
    const nail = own(new T.CylinderGeometry(0.008, 0.008, 0.02, 6));
    for (const [x, y] of [[-0.45, 2.06], [0.45, 2.06], [-0.45, 0.55], [0.45, 0.55]]) { const n = new T.Mesh(nail, iron); n.rotation.x = Math.PI / 2; n.position.set(x, y, 0.095); board.add(n); }
    /* a lantern hung on a nail at the end of the top rail: it lights the poster and the wheel behind it */
    { const lan = new T.Group(); lan.position.set(-0.78, 1.18, 0.16);
      const hook = new T.Mesh(own(new T.TorusGeometry(0.04, 0.005, 4, 10, Math.PI)), iron); hook.position.y = 0.3; lan.add(hook);
      const wire = new T.Mesh(own(new T.CylinderGeometry(0.004, 0.004, 0.08, 4)), iron); wire.position.y = 0.26; lan.add(wire);
      const glass = new T.Mesh(own(new T.CylinderGeometry(0.06, 0.07, 0.16, 10)), own(new T.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffb050, emissiveIntensity: 2.4, roughness: 0.3 }))); glass.position.y = 0.11; lan.add(glass);
      const top = new T.Mesh(own(new T.ConeGeometry(0.075, 0.07, 10)), iron); top.position.y = 0.225; lan.add(top);
      const base = new T.Mesh(own(new T.CylinderGeometry(0.075, 0.08, 0.03, 10)), iron); base.position.y = 0.015; lan.add(base);
      const lamp = new T.PointLight(0xffb060, 3.2, 5.5, 2); lamp.position.set(0.1, 0.12, 0.25); lan.add(lamp);
      board.add(lan);
      cc.onUpdate?.((dt, t) => { lamp.intensity = 3.2 * (0.94 + 0.06 * Math.sin(t * 7.3) * Math.sin(t * 2.1)); }); }

    /* ---- the ground: packed dust, a scuffed ring, stones ---- */
    const ground = new T.Group();
    const dt = cc.tex('ground/grass_path_2_diff.jpg', true, 3);
    const dust = new T.Mesh(own(new T.CircleGeometry(6.5, 48)), own(new T.MeshStandardMaterial({ map: dt, color: 0x9a7458, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false })));
    dust.rotation.x = -Math.PI / 2; dust.position.y = 0.012; dust.receiveShadow = true; ground.add(dust);
    const ring = new T.Mesh(own(new T.RingGeometry(0.7, 1.7, 40)), own(new T.MeshStandardMaterial({ color: 0x2a1e16, roughness: 1, transparent: true, opacity: 0.4, depthWrite: false })));
    ring.rotation.x = -Math.PI / 2; ring.position.set(cc.FIRE.x, 0.016, cc.FIRE.z); ground.add(ring);
    for (let i = 0; i < 7; i++) { const a = r() * Math.PI * 2; const d = 3.2 + r() * 3; const x = Math.cos(a) * d; const z = Math.sin(a) * d; if (z > 2.2 && Math.abs(x) < 4.2) continue; const m = new T.Mesh(rock, stoneMat); m.position.set(x, 0.05, z); m.scale.setScalar(0.8 + r() * 1.4); m.rotation.set(r() * 3, r() * 3, r() * 3); m.castShadow = true; ground.add(m); }

    /* ---- props, outside the keep-out circles and the camera wedge ---- */
    const free = (x, z, rad) => !(cc.keepOut || []).some((k) => Math.hypot(k.x - x, k.z - z) < k.r + rad) && !(z > 2.3 && Math.abs(x) < 4.2);
    const props = [];
    /* a bedroll on a blanket */
    { const g = new T.Group();
      const blanket = new T.Mesh(own(new T.BoxGeometry(0.9, 0.02, 1.9)), own(new T.MeshStandardMaterial({ color: 0x5a2a20, roughness: 1 }))); blanket.position.y = 0.01; g.add(blanket);
      const roll = new T.Mesh(own(new T.CylinderGeometry(0.16, 0.16, 0.8, 12)), own(new T.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 }))); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.17, -0.75); roll.castShadow = true; g.add(roll);
      for (const x of [-0.25, 0.25]) { const s = new T.Mesh(own(new T.TorusGeometry(0.165, 0.012, 4, 16)), woodDark); s.rotation.y = Math.PI / 2; s.position.set(x, 0.17, -0.75); g.add(s); }
      if (free(3.2, -0.6, 1.1)) { g.position.set(3.2, 0, -0.6); g.rotation.y = 0.3; props.push(g); } }
    /* a crate with a lantern on it (its glass glows a little; the fire stays the only light) */
    { const g = new T.Group();
      const crate = new T.Mesh(own(new T.BoxGeometry(0.6, 0.45, 0.45)), wood); crate.position.y = 0.225; crate.castShadow = true; g.add(crate);
      for (const y of [0.08, 0.37]) { const s = new T.Mesh(own(new T.BoxGeometry(0.62, 0.05, 0.47)), woodDark); s.position.y = y; g.add(s); }
      const lan = new T.Group(); lan.position.set(0.1, 0.45, 0);
      const glass = new T.Mesh(own(new T.CylinderGeometry(0.06, 0.07, 0.16, 10)), own(new T.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffa040, emissiveIntensity: 1.2, roughness: 0.3 }))); glass.position.y = 0.11; lan.add(glass);
      const top = new T.Mesh(own(new T.ConeGeometry(0.075, 0.07, 10)), iron); top.position.y = 0.225; lan.add(top);
      const base = new T.Mesh(own(new T.CylinderGeometry(0.075, 0.08, 0.03, 10)), iron); base.position.y = 0.015; lan.add(base);
      g.add(lan);
      if (free(-3.4, 0.9, 0.6)) { g.position.set(-3.4, 0, 0.9); g.rotation.y = -0.5; props.push(g); } }
    /* a wagon wheel leaning on a stump, behind the sign */
    { const g = new T.Group();
      const stumpM = new T.Mesh(own(new T.CylinderGeometry(0.28, 0.34, 0.5, 9)), woodDark); stumpM.position.y = 0.25; stumpM.castShadow = true; g.add(stumpM);
      const wheel = new T.Group(); wheel.position.set(0.05, 0.62, 0.32); wheel.rotation.set(-0.25, 0, 0.05);
      wheel.add(new T.Mesh(own(new T.TorusGeometry(0.6, 0.04, 5, 24)), woodDark));
      const spoke = own(new T.BoxGeometry(0.035, 1.18, 0.035));
      for (let i = 0; i < 6; i++) { const s = new T.Mesh(spoke, wood); s.rotation.z = (i / 6) * Math.PI; wheel.add(s); }
      const hub = new T.Mesh(own(new T.CylinderGeometry(0.09, 0.09, 0.14, 10)), woodDark); hub.rotation.x = Math.PI / 2; wheel.add(hub);
      wheel.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.add(wheel);
      const at = [[-3.3, -1.9], [-4.6, -3.4]].find(([x, z]) => free(x, z, 0.8)); if (at) { g.position.set(at[0], 0, at[1]); g.rotation.y = 0.6; props.push(g); } }

    return {
      fire, flame: { y: 0.12, scale: 0.85, colors: [0xfff0c8, 0xffa040, 0xc84a1a, 0xff8a3a] },
      sign: { mesh: board, face, w: 0.9, h: 0.86, style: { bg: '#cfbd96', groove: 'rgba(42,26,16,0.92)', lip: 'rgba(255,244,220,0.1)', glow: 0, font: cc.ui?.serif || "'Zilla Slab', serif", tint: 0xffffff } },
      ground, props,
    };
  },
};

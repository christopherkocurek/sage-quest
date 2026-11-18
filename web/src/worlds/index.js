/* The 3D side of a world: web/src/worlds/<id>.js, loaded only when that world is chosen.
   A world module exports (each may be missing; anything missing falls back to the dark world):
     lands       { landId: look }            same shape as LOOKS in lands.js (registerLands)
     looks       { landId: light look }      same shape as LOOK in world.js (registerWorld)
     wear        url of wear_<id>.glb        armature + named parts, no clips (actor.wear)
     parts       [part names]                the parts in that file
     gear        [gear names]                each loads /assets/real/gear_<name>.glb (makeGear)
     dressBoss   (actor, nemesisId, ctx) -> handle | null   same handle contract as bosses.js
     skyNemesis  (id) -> Object3D | null     the far shape on the nemesis line (not used yet)
     camp        { build(cc), sky, exposure } the camp dressing (camp.setWorld)
     sfxPools    { pool: count }             files web/assets/sfx/<id>/<pool>_<n>.ogg (setSfxWorld)
   'dark' has no module: loadWorld('dark') returns an empty one. */
const MODS = { neon: () => import('./neon.js'), edo: () => import('./edo.js'), frontier: () => import('./frontier.js'), storybook: () => import('./storybook.js') };
const loaded = new Map();
const EMPTY = Object.freeze({ id: 'dark' });
/* ?campdemo=1: a world without its own camp / skyNemesis uses EXAMPLE_CAMP / EXAMPLE_SKY_NEMESIS below (for tests) */
const CAMP_DEMO = typeof location !== 'undefined' && /[?&]campdemo=1\b/.test(location.search);
export async function loadWorld(id) {
  if (!MODS[id]) return EMPTY;
  if (!loaded.has(id)) loaded.set(id, MODS[id]().then((m) => ({ id, ...m, ...(CAMP_DEMO && !m.camp ? { camp: EXAMPLE_CAMP } : {}), ...(CAMP_DEMO && !m.skyNemesis ? { skyNemesis: EXAMPLE_SKY_NEMESIS } : {}) })).catch((err) => { console.warn('world module', id, err); loaded.delete(id); return EMPTY; }));
  return loaded.get(id);
}

/* A minimal reference camp (copy the shape into web/src/worlds/<id>.js as `export const camp = { ... }`).
   cc is the build context the camp passes in. Everything is built at its own origin;
   the camp places the fire at cc.FIRE and the sign at cc.SIGN. Own every geometry and material (cc.own) so leave() frees them. */
export const EXAMPLE_CAMP = {
  exposure: 0.7,
  sky: { stars: 1, moon: true },
  build(cc) {
    const T = cc.THREE;
    const iron = cc.own(new T.MeshStandardMaterial({ color: 0x1c1a19, roughness: 0.55, metalness: 0.85 }));
    const wood = cc.own(new T.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }));
    /* the fire: an iron brazier on three legs; the flames sit in its bowl (flame.y) */
    const fire = new T.Group();
    const bowl = new T.Mesh(cc.own(new T.CylinderGeometry(0.42, 0.24, 0.26, 14, 1, true)), iron); bowl.position.y = 0.72; bowl.material.side = T.DoubleSide; fire.add(bowl);
    const leg = cc.own(new T.CylinderGeometry(0.025, 0.03, 0.78, 6));
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const m = new T.Mesh(leg, iron); m.position.set(Math.cos(a) * 0.26, 0.37, Math.sin(a) * 0.26); m.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); fire.add(m); }
    /* the sign: a wooden notice board; face = a plane the camp paints the name onto */
    const board = new T.Group();
    for (const x of [-0.62, 0.62]) { const p = new T.Mesh(cc.own(new T.BoxGeometry(0.1, 2.3, 0.1)), wood); p.position.set(x, 1.15, 0); board.add(p); }
    const back = new T.Mesh(cc.own(new T.BoxGeometry(1.2, 1.6, 0.05)), wood); back.position.set(0, 1.35, 0); board.add(back);
    const face = new T.Mesh(cc.own(new T.PlaneGeometry(1.08, 1.48))); face.position.set(0, 1.35, 0.03); board.add(face);
    /* the ground: a raked gravel disc (any Group; each child grows on its own spot) */
    const ground = new T.Group();
    const grav = new T.Mesh(cc.own(new T.CircleGeometry(2.2, 40)), cc.own(new T.MeshStandardMaterial({ color: 0x2e2c29, roughness: 1 }))); grav.rotation.x = -Math.PI / 2; grav.position.y = 0.01; grav.receiveShadow = true; ground.add(grav);
    /* one prop outside cc.keepOut and the camera wedge: a stone lantern */
    const lantern = new T.Group(); const stone = cc.own(new T.MeshStandardMaterial({ color: 0x6a665e, roughness: 1 }));
    const parts = [[0.12, 0.9, 0.45], [0.3, 0.12, 0.95], [0.22, 0.3, 1.16], [0.36, 0.1, 1.36]];
    for (const [r, h, y] of parts) { const m = new T.Mesh(cc.own(new T.CylinderGeometry(r, r * 1.1, h, 6)), stone); m.position.y = y; m.castShadow = true; lantern.add(m); }
    lantern.position.set(3.6, 0, -2.6);
    return {
      fire, flame: { y: 0.66, scale: 0.8 },
      sign: { mesh: board, face, w: 1.08, h: 1.48, style: { bg: '#3b2c1f', groove: 'rgba(10,6,3,0.9)', lip: 'rgba(255,230,190,0.12)', glow: 0.9, font: cc.ui.serif || undefined } },
      ground, props: [lantern],
    };
  },
};


/* A minimal far shape for the nemesis line (copy into web/src/worlds/<id>.js as `export function skyNemesis(id, ctx)`).
   Real size in metres, base at y = 0; use ctx.sil() for the body (it fades in with the shape) and ctx.glow for lit bits.
   Return null for an id you do not dress: the dark shape comes instead. */
export function EXAMPLE_SKY_NEMESIS(id, ctx) {
  const T = ctx.THREE; const g = new T.Group(); const body = ctx.sil();
  const tower = new T.Mesh(new T.BoxGeometry(14, 70, 14), body); tower.position.y = 35; g.add(tower);
  const crown = new T.Mesh(new T.BoxGeometry(15, 3, 15), ctx.glow); crown.position.y = 66; g.add(crown);
  return { object: g, update(dt, t) { crown.scale.y = 1 + 0.15 * Math.sin(t * 2); }, dispose() { tower.geometry.dispose(); crown.geometry.dispose(); } };
}

/* The Frontier's plain foes (the fight.js dressFoe hook, exported by web/src/worlds/frontier.js).
   Beige foes were lost against the beige land, and all stood in one pose. Every foe wears strong, dark
   colour blocks that read against the dust at phone size: a black or dark felt hat, a red or blue work shirt, a black
   waistcoat, a dark leather apron, a red or black kerchief, dark trousers. Each foe of a kind draws its own set from its
   kind's palette, and its own build, stance and idle clock, so a pack never stands or moves in step.
   The wardrobe's FR_* materials are the actor's own clones (world.js wear), so a recolour here touches one foe only. */
import * as THREE from 'three';
import { finishFoe, foeRng, rankKit, build, HEAVY } from './foe-look.js';

/* sRGB hex. Shirts are saturated but dark (the dusk light lifts them); hats and vests near black. */
const RED = [0x7c1d14, 0x8e2618, 0x5e1510];
const BLUE = [0x22385c, 0x1c2c4c, 0x2c4668];
const HAT = [0x141110, 0x1c1714, 0x2a1d14];
/*one colour family per kind, so the sheet and the fight agree and a
   kind reads at fight distance by its shirt alone. Outlaw = dusty ochre, Hired Hand = company blue under a dark duster,
   Knife Man = pale linen under a black waistcoat, Spike Man = red rail flannel under a leather apron. Shades vary inside
   a family only. */
const PAL = {
  /* the Outlaw: a hungry gang in sun-faded ochre and mustard shirts, dark vests, the kerchief up */
  minion: { shirt: [0x8a6a24, 0x7a5c1e, 0x94742a, 0x6e5420], hat: HAT, vest: [0x141210, 0x1e1712], kerchief: [0x8a2016, 0x161412, 0x6a1a12], trousers: [0x2a2420, 0x3a2a1e, 0x23201c] },
  /* the Hired Hand: a company man, blue shirt, a dark duster (the look's cloth), black hat */
  warrior: { shirt: BLUE, hat: [0x121010, 0x1a1512], kerchief: [0x161412, 0x1c2c4c], trousers: [0x23201c, 0x2a2420] },
  /* the Knife Man: black bowler, a pale linen shirt (it shows the knives' work), black waistcoat, red sash (wardrobe) */
  rogue: { shirt: [0xb4a68c, 0xa89a80, 0xbcae94], hat: [0x0e0c0b, 0x141110], vest: [0x0e0c0b], kerchief: [0x0e0c0b], trousers: [0x1c1a18, 0x24201c] },
  /* the Spike Man: a red flannel rail shirt, a black cap, a dark leather apron */
  brute: { shirt: RED, hat: [0x161412, 0x1e1a16], apron: [0x2a1c12, 0x231710], kerchief: [0x161412, 0x2a1c12], trousers: [0x23201c, 0x2e2620] },
};
const _c = new THREE.Color();
/* matte cloth and felt, value kept dark against the dust; the captain adds a bandolier of brass rounds */
const STYLE = {
  matte: { cloth: { rough: 0.92, env: 0.15 }, skin: { rough: 0.7, env: 0.2 } },
  rank(actor, foeId, kit) { return [kit.sash(actor, 0x3a2414, { w: 0.06, studs: 0xc8a050 })]; },
};
/*three men per kind, each with his own hat (or none), neck cloth, coat and build; the head shell
   (Head_shade) takes the face's skin, with hair round the back and sides, so a head is a head from every side; a captain
   is the boss of the crew: a pale hat, a duster, a gold star and a bandolier (and the brute a foreman's frame). */
const HATS = ['Hat_brim', 'Hat_slouch', 'Hat_flat', 'Hat_top', 'Hat_bowler', 'Cap_rail'];
const NECK = ['Bandana', 'Bandana_dark', 'Bandana_neck'];
const COATS = ['Vest', 'Duster', 'Poncho', 'Apron', 'Suspenders', 'Sash', 'Chaps', 'Cuffs'];
const VARS = {
  minion: [{ hat: 'Hat_slouch', neck: 'Bandana', coat: ['Vest', 'Chaps'] }, { hat: 'Hat_flat', neck: 'Bandana_neck', coat: ['Poncho'] }, { hat: null, neck: 'Bandana', coat: ['Vest'], hair: 'full' }],
  warrior: [{ hat: 'Hat_brim', neck: 'Bandana_neck', coat: ['Duster'] }, { hat: 'Hat_flat', neck: 'Bandana_neck', coat: ['Vest', 'Cuffs'] }, { hat: 'Hat_slouch', neck: null, coat: ['Duster'] }],
  rogue: [{ hat: 'Hat_bowler', neck: 'Bandana_dark', coat: ['Vest', 'Sash'] }, { hat: 'Hat_top', neck: null, coat: ['Vest', 'Sash'] }, { hat: null, neck: 'Bandana_dark', coat: ['Sash'], hair: 'slick' }],
  brute: [{ hat: 'Cap_rail', neck: 'Bandana_neck', coat: ['Suspenders', 'Apron'] }, { hat: null, neck: 'Bandana_neck', coat: ['Apron'], hair: 'bald' }, { hat: 'Hat_slouch', neck: null, coat: ['Suspenders'] }],
};
const HAIR = [0x2a2018, 0x3a2a1c, 0x1a1614, 0x5a4630, 0x4a4440];
const SKIN = [0xa06a4a, 0x8a5a3e, 0xb07a58, 0x6e4632];

export function dressFoe(actor, foeId, ctx = {}) {
  const P = PAL[foeId]; if (!P || !actor.meshes) return null;
  const R = foeRng(ctx, foeId); const pick = R.pick; const V = VARS[foeId][R.variant(3)]; const cap = !!ctx.captain;
  const show = (p, on) => { for (const m of actor.parts.get(p) || []) m.visible = on; };
  const listed = new Set(actor.lastLook?.wear || []);
  const hat = cap ? 'Hat_brim' : V.hat;
  for (const h of HATS) if (listed.has(h) || h === hat) show(h, h === hat);
  /* on a real body only the Outlaw keeps the kerchief up over the face; the others wear it at the neck (a face shows) */
  const neck = actor.foeBodied && V.neck && foeId !== 'minion' ? 'Bandana_neck' : V.neck;
  for (const n of NECK) if (listed.has(n) || n === neck) show(n, n === neck);
  /* on the real body (bodies.js applyFoeBody) the flat chaps and cuffs, the plate moustache and the code-built
     hair shell stay off (they were cut for the mannequin's head and limbs); the kind's shirt colour dyes the real clothes */
  const real = !!actor.foeBodied;
  const coats = new Set([...V.coat, ...(cap && foeId !== 'brute' ? ['Duster', 'Badge', 'Chain_gold'] : cap ? ['Apron', 'Badge'] : [])]);
  if (real) { coats.delete('Chaps'); coats.delete('Cuffs'); }
  for (const c of [...COATS, 'Badge', 'Chain_gold']) if (listed.has(c) || coats.has(c)) show(c, coats.has(c));
  if (real) { R.r(); } else if (foeId === 'minion' || foeId === 'brute') show('Moustache', R.r() < 0.6); else if (foeId === 'warrior') show('Moustache', R.r() < 0.8);
  /* the head: the shell takes the skin of the face, hair goes round the back (a hat covers its top) */
  const skin = pick(SKIN); const hairHex = pick(HAIR); const extras = [];
  for (const m of actor.meshes) { const n = m.material?.name || ''; if (/^FR_Shade/.test(n) || /^FR_Skin$/.test(n)) m.material.color.set(skin); }
  if (V.hair !== 'bald' && !real) extras.push(rankKit.hair(actor, hairHex, V.hair === 'full' ? { down: 0.66, k: [1.06, 1.36, 1.24] } : V.hair === 'slick' ? { down: 0.58, k: [1.02, 1.3, 1.2] } : {}));
  const want = { shirt: pick(P.shirt), hat: cap ? 0xd8ccb0 : pick(P.hat), vest: P.vest ? pick(P.vest) : null, apron: P.apron ? pick(P.apron) : null, kerchief: pick(P.kerchief), trousers: pick(P.trousers) };
  /* a little per-foe drift in value, so two red shirts are not one red */
  const lift = R.range(0.9, 1.12);
  const paint = (mt, hex, k = 1) => { if (!mt?.color || hex == null) return; mt.color.set(_c.set(hex).multiplyScalar(lift * k)); };
  if (real) { /* the shirt colour at full strength (the outfit's own map carries the shade) */
    _c.set(want.shirt); _c.multiplyScalar(0.92 / Math.max(0.05, _c.r, _c.g, _c.b)).multiplyScalar(lift);
    const hex = _c.getHex(); if (actor.lastLook?.tint) { actor.lastLook.tint.Peasant = hex; actor.lastLook.tint.Ranger = hex; }
    for (const m of actor.meshes) if (m.userData.wear && /^(Peasant|Ranger)$/.test(m.material?.name || '')) m.material.color.set(hex); }
  const done = new Set();
  for (const m of actor.meshes) {
    const mt = m.material; const n = mt?.name || ''; const part = m.userData.part || '';
    if (!mt || done.has(mt) || !m.userData.wear) continue; done.add(mt);
    if (/^FR_Shirt/.test(n)) paint(mt, want.shirt);
    else if (/^FR_Placket/.test(n)) paint(mt, want.shirt, 0.75);
    else if (/^(Hat_|Cap_)/.test(part) && /^FR_(Felt|FeltBrown|FeltDark|Ticking)/.test(n)) { paint(mt, want.hat); mt.roughness = 0.9; }
    else if (/^FR_Vest/.test(n) && want.vest != null) paint(mt, want.vest);
    else if (/^FR_Apron/.test(n) && want.apron != null) paint(mt, want.apron);
    else if (/^FR_Bandana$/.test(n)) paint(mt, want.kerchief);
    else if (/^FR_BandanaFold$/.test(n)) paint(mt, want.kerchief, 0.6);
    else if (/^FR_Wool/.test(n)) paint(mt, want.trousers);
  }
  /* posture: varyActor (world.js) gives each fight foe a seeded hunch, tilt and turn; the Outlaws' crouch clip made every
     one of them the same ape. Spread them: some stand tall and lean back, some crouch low, heads turned their own way. */
  const po = actor.posture;
  if (po) {
    const r = () => R.r() - 0.5;
    if (foeId === 'minion') { po.hunch = -0.16 + R.r() * 0.34; po.lift = -po.hunch * 0.8; }
    else po.hunch += r() * 0.12;
    po.tilt += r() * 0.25; po.turn += r() * 0.4; po.lean += r() * 0.14; po.drop += r() * 0.2;
  }
  /* a build of its own: a little taller or broader than the next man */
  if (actor.model) { const s = actor.model.scale; const wide = foeId === 'brute' ? 1.06 : 1; s.set(s.x * wide * R.range(0.95, 1.08), s.y * R.range(0.96, 1.06), s.z * wide * R.range(0.95, 1.08)); }
  const unbuild = foeId === 'brute' ? build(actor, HEAVY) : cap ? build(actor, { spine_03: 1.06, upperarm_l: 1.05, upperarm_r: 1.05 }) : null;
  const fin = finishFoe(actor, foeId, ctx, STYLE, R);
  /* the idle clock: each looped clip runs at its own pace (0.86-1.14) and the first one starts at its own time */
  const pace = R.range(0.86, 1.14);
  const play = actor.play.bind(actor);
  actor.play = (name, opt = {}) => play(name, opt.loop === false ? opt : { ...opt, speed: (opt.speed ?? 1) * pace });
  let t0 = R.range(0.2, 2);
  return {
    update(dt, st) { if (t0 > 0 && actor.mixer) { const k = Math.min(t0, 0.4); t0 -= k; actor.mixer.update(k); } fin.update(dt, st); },
    onDeath() {},
    dispose() { actor.play = play; fin.dispose(); unbuild?.(); for (const e of extras) e.obj.removeFromParent(); },
  };
}

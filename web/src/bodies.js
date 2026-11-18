/* real bodies for the heroes. Default on.
   The knight rig is the Universal Animation Library skeleton, so Quaternius's Universal Base Characters (head, face,
   hair) and Modular Character Outfits (clothed bodies with hands) bind to it by bone name through actor.wear(), the
   same way a world wardrobe does. All CC0 (web/assets/ASSET_SOURCES.md); cut into two files,
   /assets/bodies/body_m.glb and body_f.glb, with the same part and material names.
   A look is turned into its new form here: the mannequin and the plate tubes go; a face, hair, hands and a clothed body
   come; the world's own silhouette pieces (plate, cloak, hat, coat, kimono) stay on top. Which body, which skin tone and
   which hair colour come from the player's seed, a hash of the name they typed: the same name always gives the same look,
   and the meaning of the name is never read. */
import { sqUnmerge } from './perf3.js';
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
/* a browser that draws in software (index.html probe: window.__sqGpu.soft) or a pinned ?q=min gets the light mannequin bodies and foes; ?bodies=new / ?foes=new force the real ones */
const lite = typeof window !== 'undefined' && !!(window.__sqGpu?.soft || (q && q.get('q') === 'min'));
const on = !q || (q.get('bodies') === 'new' ? true : !lite);
export const bodiesOn = () => on;
const HEAD = ['Head_Skin', 'Head_Eyes', 'Head_Brows'];
const TUBES = ['UpArmL', 'UpArmR', 'ForeArmL', 'ForeArmR', 'ThighL', 'ThighR', 'ShinL', 'ShinR'];
const PLATE = ['Chest', 'Fauld', 'PauldronL', 'PauldronR', 'HeavyL', 'HeavyR'];
/* the skin tone multiplies the skin map; the hair colours replace the hair factor */
const SKIN = [0xffffff, 0xf2d6c0, 0xcaa68c, 0x9c7c68]; /* the two deep tones were so warm that firelight turned the face red-orange in a close shot */
const HAIRC = [0x2a2420, 0x4a3524, 0x15151a, 0x7a5632, 0x8a3c22, 0x9a917f];
/* the outfit parts of a spec. o: 'ranger' | 'peasant' | null; B body, L legs, F feet, A arms (all on by default);
   ranger extras: bracer and belt on by default, hood and pauld off */
function outfit(s) {
  if (!s.o) return [];
  const K = s.o === 'ranger' ? 'Ranger' : 'Peasant'; const out = [];
  if (s.A !== false) out.push(`${K}_Arms`); if (s.B !== false) out.push(`${K}_Body`); if (s.L !== false) out.push(`${K}_Legs`); if (s.F !== false) out.push(`${K}_Feet`);
  if (K === 'Ranger') { if (s.bracer !== false && s.A !== false) out.push('Ranger_Bracer'); if (s.belt !== false && s.B !== false) out.push('Ranger_Belt'); }
  if (s.hood) out.push('Ranger_Hood'); if (s.pauld) out.push('Ranger_Pauldron');
  /* a part of the other outfit may be named outright: feet: 'ranger' puts the tall boots under a peasant body */
  if (s.feet) { const i = out.indexOf(`${K}_Feet`); if (i >= 0) out.splice(i, 1); out.push(s.feet === 'ranger' ? 'Ranger_Feet' : 'Peasant_Feet'); }
  if (s.legs) { const i = out.indexOf(`${K}_Legs`); if (i >= 0) out.splice(i, 1); out.push(s.legs === 'ranger' ? 'Ranger_Legs' : 'Peasant_Legs'); }
  if (s.arms) { const i = out.indexOf(`${K}_Arms`); if (i >= 0) out.splice(i, 1); out.push(s.arms === 'ranger' ? 'Ranger_Arms' : 'Peasant_Arms'); if (s.arms === 'ranger' && s.bracer !== false) out.push('Ranger_Bracer'); }
  return out;
}
/* what every look of a world loses (pieces made for the blank mannequin head and body) */
const WORLD_DROP = {
  dark: [],
  frontier: ['Head_shade', 'Face', 'Moustache', 'Shirt', 'Cuffs', 'Trousers', 'Boots', 'Gloves', 'Chaps'],
  storybook: ['Face', 'Boots', 'Belt'],
  edo: ['Menpo', 'Veil', 'Face', 'Wraps', 'ForeArmL', 'ForeArmR', 'ShinL', 'ShinR'],
  neon: ['Mask_resp', 'Goggles', 'Gloves'],
};
/* hair: 'short' | 'mid' | 'long' (m: buzzed, parted, parted; f: buzzed, buns, long: the long style is cut for the f head).
   hood or hat: true = the head piece decides (short under a hood; under a hat m short, f long). hc: an index into HAIRC. */
const HAIR = { m: { short: 'Hair_B', mid: 'Hair_A', long: 'Hair_A' }, f: { short: 'Hair_C', mid: 'Hair_B', long: 'Hair_A' } };
const SPECS = {
  dark: {
    traveller: { o: 'ranger', hood: true, set: { helm: 'none', robe: false, tabard: false, sleeves: false }, hide: [...TUBES, ...PLATE], tint: { Ranger: 0x4c4f5c } },
    Knight: { o: 'ranger', hair: 'mid', beard: true, hc: 0, set: { helm: 'none' }, hide: TUBES, tint: { Ranger: 0x6f7686 }, trim: { Chest: 1.5 } },
    Barbarian: { o: 'peasant', feet: 'ranger', hair: 'long', beard: true, hc: 4, set: { helm: 'none', horns: false }, hide: [...TUBES, 'Chest'], tint: { Peasant: 0x8a6a56, Ranger: 0x6a5a4e } },
    Mage: { o: 'peasant', L: false /* the thigh came through the robe as a dark hole */, hood: true, beard: true, hc: 5, set: { helm: 'none' }, hide: [...TUBES, 'Chest', 'Fauld'], tint: { Peasant: 0x4a4658, Ranger: 0x3a3646 } },
    Rogue_Hooded: { o: 'ranger', hood: true, pauld: true, hc: 2, set: { helm: 'none' }, hide: [...TUBES, 'Chest', 'Fauld'], tint: { Ranger: 0x565c58 } },
  },
  storybook: {
    traveller: { o: 'peasant', hair: 'mid', drop: ['Tunic', 'Hood_cloth'], tint: { Peasant: 0xaab8e0 } },
    Knight: { o: 'ranger', hair: 'short', hc: 3, hide: TUBES, tint: { Ranger: 0xc4cce0 }, trim: { Chest: 1.5 } },
    Barbarian: { o: 'peasant', feet: 'ranger', hair: 'mid', beard: true, hc: 1, drop: ['Tunic', 'Hood_cloth'], tint: { Peasant: 0xd8b48a, Ranger: 0xb09070 } },
    Mage: { o: 'peasant', B: false, L: false, hair: 'long', beard: true, hc: 5, drop: ['Hood_cloth'], tint: { Peasant: 0x8a96d8 } },
    Rogue_Hooded: { o: 'ranger', hood: true, hc: 4, drop: ['Tunic', 'Hood_cloth'], tint: { Ranger: 0xffffff } },
  },
  frontier: {
    traveller: { o: 'peasant', hat: true, beard: true, swap: { Bandana_dark: 'Bandana_neck' }, tint: { Peasant: 0x9a8468 } },
    Knight: { o: 'peasant', hat: true, beard: true, hc: 1, tint: { Peasant: 0xc8b090 } },
    Barbarian: { o: 'peasant', hat: true, beard: true, hc: 0, tint: { Peasant: 0xb0a48c } },
    Mage: { o: 'peasant', hat: true, hc: 5, tint: { Peasant: 0x5a544e } },
    Rogue_Hooded: { o: 'peasant', hat: true, beard: true, hc: 3, swap: { Bandana: 'Bandana_neck' }, tint: { Peasant: 0xd8c4a8 } },
  },
  edo: {
    traveller: { o: 'peasant', B: false, L: false, hat: true, drop: ['Mask_cloth'], tint: { Peasant: 0x4a4650 } },
    Knight: { o: 'ranger', B: false, L: false, hat: true, hc: 2, tint: { Ranger: 0x4a4452 } },
    Barbarian: { o: 'peasant', B: false, L: false, hair: 'short', beard: true, hc: 2, drop: ['Zukin'], tint: { Peasant: 0x8a8070 } },
    Mage: { o: 'peasant', B: false, L: false, hat: true, hc: 2, tint: { Peasant: 0xc4bcaa } },
    Rogue_Hooded: { o: 'ranger', B: false, L: false, hat: true, hc: 2, drop: ['Mask_cloth'], tint: { Ranger: 0x3a3642 } },
  },
  /* neon: every head piece of the old wardrobe has a black face built in, so they go; the head shows, with the band visor or a hood.
     the flat trousers, boots, tank and sleeves go too: dark leather legs and boots from the Ranger outfit under the
     world's own jackets and coats (their lit trims stay), and the Brawler's real arms in a tee */
  neon: {
    traveller: { o: 'ranger', B: false, bracer: false, hood: true, drop: ['Mask_cloth', 'Trousers', 'Boots'], tint: { Ranger: 0x3a3e4c } },
    Knight: { o: 'ranger', B: false, bracer: false, hair: 'mid', hc: 2, drop: ['Visor', 'Trousers', 'Boots'], add: ['Visor_band'], tint: { Ranger: 0x3e4a68 } },
    Barbarian: { o: 'peasant', legs: 'ranger', feet: 'ranger', hair: 'short', beard: true, hc: 4, drop: ['Cap_knit', 'Tank', 'Sleeves', 'Wraps', 'Trousers', 'Boots'], tint: { Peasant: 0xb04038, Ranger: 0x3a3c46 } },
    /* the Ranger legs came through the long coat at the hip (a brown patch in front, a dark blotch behind): under
       the coat the world's own slim trousers stay, with the Ranger boots */
    Mage: { o: 'ranger', B: false, L: false, bracer: false, hair: 'long', hc: 5, drop: ['Hood_tech', 'Boots'], tint: { Ranger: 0x40365e } },
    Rogue_Hooded: { o: 'ranger', B: false, bracer: false, hood: true, hc: 3, drop: ['Mask_cloth', 'Hood_tech', 'Trousers', 'Boots'], tint: { Ranger: 0x5a4a34 } },
  },
};
/* the player's seed: an actor may carry its own (title stills); else the game's (main.js S.seed, from the name or the birth date).
   The seed's low bit picks the body type (odd: 'f', even: 'm'), so every place that reads the seed (hero, twin boss, share stage) agrees.
   An actor may carry bodyType (the share landing). */
const bodyTypeBit = (seed, kind) => (kind === 'm' ? seed - (seed % 2) : kind === 'f' ? seed - (seed % 2) + 1 : seed);
const seedOf = (actor) => {
  const own = actor?.bodySeed != null; const w = typeof window !== 'undefined' ? window.__sq?.S : null;
  const s = own ? actor.bodySeed : w?.seed; const n = Number.isFinite(Number(s)) && s != null ? Math.abs(Math.floor(Number(s))) : 0;
  return bodyTypeBit(n, actor?.bodyType ?? (own ? null : w?.bodyTypeShown));
};
/* the hero's seed for code outside this file (fight.js: the Twin boss wears the hero's own body) */
export const heroSeed = () => seedOf(null);
export const bodyUrl = (seed) => `/assets/bodies/body_${seed % 2 ? 'f' : 'm'}.glb`;
/* the new look for a look. worldId: 'dark' | 'frontier' | ...; model: the class model name, or null for the traveller */
export function bodyLook(worldId, model, look, seed = 0) {
  const W = SPECS[worldId || 'dark'] || SPECS.dark; const s = W[model || 'traveller']; if (!s) return null;
  const drop = new Set([...(WORLD_DROP[worldId || 'dark'] || []), ...(s.drop || [])]);
  let wear = (look.wear || []).map((p) => s.swap?.[p] || p).filter((p) => !drop.has(p));
  const hairC = HAIRC[((s.hc ?? 0) + (s.hc === 5 ? 0 : (seed >> 3) % 2)) % HAIRC.length]; const tone = SKIN[(seed >> 1) % SKIN.length];
  const bodyType = seed % 2 ? 'f' : 'm'; const hair = s.hood ? 'short' : s.hat ? (bodyType === 'f' ? 'long' : 'short') : s.hair;
  wear = [...wear, ...(s.add || []), ...HEAD, ...outfit(s), ...(hair ? [HAIR[bodyType][hair]] : []), ...(s.beard ? ['Beard'] : [])];
  return { ...look, ...(s.set || {}), body: false, wear, hide: ['Eyes', ...(s.hide || [])], tint: { Skin: tone, SkinHands: tone, Hair: hairC, Hair2: hairC, ...(s.tint || {}) }, trim: s.trim || null };
}
/* a plate made for the mannequin's long neck loses what stands above y (rest pose, metres): the knight's gorget covered the chin */
function trimPart(actor, part, y) {
  for (const m of actor.parts.get(part) || []) {
    sqUnmerge(m); /* trim the part's own geometry, not a merged draw */
    if (m.userData.trimmed === y || !m.geometry?.index) continue;
    const g = m.geometry.clone(); const pos = g.attributes.position; const ix = g.index.array; const keep = [];
    for (let i = 0; i < ix.length; i += 3) if (pos.getY(ix[i]) <= y && pos.getY(ix[i + 1]) <= y && pos.getY(ix[i + 2]) <= y) keep.push(ix[i], ix[i + 1], ix[i + 2]);
    g.setIndex(keep); m.geometry = g; m.userData.trimmed = y;
  }
}
/* puts the new body on an actor that already wears `look`; the look changes once, when the file is on (no half-dressed frames).
   Returns a promise (true when the body went on). */
export function applyBody(actor, worldId, model, look) {
  const tok = (actor.bodyTok = (actor.bodyTok || 0) + 1); if (!on) return Promise.resolve(false);
  const seed = seedOf(actor); const next = bodyLook(worldId, model, look, seed); if (!next) return Promise.resolve(false);
  /* the hooded traveller on screen fixes the frame the hero keeps (S.bodyTypeShown): the class body never flips it. */
  try { const Sq = typeof window !== 'undefined' ? window.__sq?.S : null; if (Sq && actor.traveller && actor.bodySeed == null && !actor.bodyType && Sq.bodyTypeShown == null) Sq.bodyTypeShown = seed % 2 ? 'f' : 'm'; } catch { /* no window */ }
  /* the first-person bare hand takes the hero's skin (fight.js hand2Tone): the map's own tan times this body's tone */
  try { const t = next.tint.Skin ?? 0xffffff; const k = (sh) => Math.round(((0xc98a62 >> sh) & 255) * (((t >> sh) & 255) / 255)); if (typeof window !== 'undefined' && window.__sq) window.__sq.heroSkin = (k(16) << 16) | (k(8) << 8) | k(0); } catch { /* no window */ }
  return actor.wear(bodyUrl(seed)).then(() => {
    if (actor.bodyTok !== tok) return false;
    actor.look(next); for (const [part, y] of Object.entries(next.trim || {})) trimPart(actor, part, y);
    actor.bodied = true; return true;
  }).catch((err) => { console.warn('body', err); return false; });
}

/* ------------------------------------------------------------------------------------------------------------------
   the same bodies for the fight's human foes and the bosses that are a person, from ONE low-poly file
   (/assets/bodies/body_foe.glb: about 6-8k triangles a foe, 512 px maps, two body types; female
   parts carry an F_ prefix). Goblins, trolls, drones, giants, the lich, the
   dragon and fully plated or masked figures keep their old bodies (no spec here = untouched).
   A spec: o/B/L/F/A/hood/pauld/bracer/belt/feet/arms as the hero specs; hair 'short'|'mid'|'long'|null; beard; hat (the
   world's hat sits on the head: short hair); bodyType 'm'|'f' (else by seed); skin = a fixed tone (the Hollow dead), else by
   seed; glow: true keeps the fight's glowing eyes on the face (the dark world's threat mark); drop / swap / add / hide /
   set / tint as the hero specs. */
const fq = q ? q.get('foes') : null;
const foesNew = fq === 'new' ? true : !lite; /* default on (off in software rendering, perf)  */
/* on the low and min quality tiers (weak or software GPU, web/src/quality.js) the foes keep the light one-mesh
   body: a real body is about nine skinned meshes and two more maps a foe. ?foes=new forces the real bodies on any tier. */
const lowTier = () => { try { const Q = typeof window !== 'undefined' ? window.__sq?.quality : null; return !!Q && (Q.tier === 'low' || Q.tier === 'min'); } catch { return false; } };
export const foesOn = () => foesNew && (fq === 'new' || !lowTier());
export const FOE_URL = '/assets/bodies/body_foe.glb';
const DEAD = 0x9aa3a6; /* Hollow skin: a grey, bloodless multiply on the skin map */
const FOE_DROP = {
  dark: [],
  frontier: ['Head_shade', 'Face', 'Moustache', 'Shirt', 'Cuffs', 'Trousers', 'Boots', 'Gloves', 'Chaps'],
  storybook: ['Face', 'Face_brigand', 'Boots', 'Belt'],
  edo: ['Menpo', 'Veil', 'Face', 'Wraps', 'Hair_wild', 'Hair_knot', 'Mask_cloth', 'ForeArmL', 'ForeArmR', 'ShinL', 'ShinR'],
  neon: ['Gloves', 'Trousers', 'Boots'],
};
const FOE_SPECS = {
  dark: {
    minion: { o: 'peasant', feet: 'ranger', hair: 'short', skin: DEAD, glow: true, set: { helm: 'none' }, hide: [...TUBES, 'Chest'], tint: { Peasant: 0x6a6258, Ranger: 0x4a4640 } },
    rogue: { o: 'ranger', hood: true, skin: DEAD, glow: true, set: { helm: 'none' }, hide: [...TUBES, 'Chest', 'Fauld'], tint: { Ranger: 0x4a4e58 } },
    'boss:twin': 'hero',
  },
  frontier: {
    minion: { o: 'peasant', hat: true, swap: { Bandana: 'Bandana_neck' }, tint: { Peasant: 0x8a7458 } },
    warrior: { o: 'peasant', hat: true, beard: true, tint: { Peasant: 0x6a5a48 } },
    rogue: { o: 'peasant', hat: true, swap: { Bandana_dark: 'Bandana_neck' }, tint: { Peasant: 0x4a443e } },
    brute: { o: 'peasant', hat: true, beard: true, bodyType: 'm', tint: { Peasant: 0x9a8a70 } },
    'boss:other': { o: 'peasant', hat: true, beard: true, bodyType: 'm', tint: { Peasant: 0xd8c4a8 } },
  },
  storybook: {
    warrior: { o: 'peasant', feet: 'ranger', hood: true, drop: ['Tunic', 'Hood_cloth'], tint: { Peasant: 0x8a2a2e, Ranger: 0x7a2428 } },
    rogue: { o: 'peasant', feet: 'ranger', hair: 'short', drop: ['Tunic'], tint: { Peasant: 0x8a7a66, Ranger: 0x6a5a48 } },
  },
  edo: {
    minion: { o: 'peasant', L: false, hair: 'mid', tint: { Peasant: 0x7a6248 } },
    warrior: { o: 'ranger', B: false, L: false, hat: true, tint: { Ranger: 0x4a3a3c } },
    rogue: { o: 'ranger', B: false, L: false, hat: true, tint: { Ranger: 0x2a2c3a } },
    'boss:other': { o: 'ranger', B: false, L: false, hat: true, bodyType: 'm', drop: ['Mask_cloth'], tint: { Ranger: 0x3a3642 } },
  },
  neon: {
    /* the company heads stay (a hood with lit goggles, a pale mask with red slits: the threat marks); the real body gives
       them hands, legs and boots (head: false = no face, no hair) */
    minion: { o: 'ranger', B: false, head: false, bracer: false, tint: { Ranger: 0x2a2d36, SkinHands: 0x3a3a40 } },
    warrior: { o: 'ranger', B: false, head: false, bracer: false, tint: { Ranger: 0x34363e, SkinHands: 0x3a3a40 } },
  },
};
/* a hero-like boss (the Other Drifter, the Other Ronin, the Twin) takes the hero spec of the class its look copies */
const HERO_OF = { great: 'Knight', sallet: 'Barbarian', hood: 'Rogue_Hooded' };
export const hasFoeSpecs = (worldId) => !!FOE_SPECS[worldId || 'dark'];
export function foeSpec(worldId, key) { return (FOE_SPECS[worldId || 'dark'] || {})[key] || null; }
export function foeLook(worldId, key, look, seed = 0, heroModel = null) {
  let s = foeSpec(worldId, key); if (!s) return null;
  if (s === 'hero') { const m = heroModel || 'Knight'; const b = bodyLook(worldId, m, look, seed); if (!b) return null;
    /* the hero file's part names -> the foe file's (the same names for a male body; F_ for a female one) */
    const fx = seed % 2 ? 'F_' : ''; const body = new Set([...HEAD, 'Hair_A', 'Hair_B', 'Hair_C', 'Beard', 'Ranger_Arms', 'Ranger_Bracer', 'Ranger_Body', 'Ranger_Belt', 'Ranger_Feet', 'Ranger_Legs', 'Ranger_Hood', 'Ranger_Pauldron', 'Peasant_Arms', 'Peasant_Body', 'Peasant_Feet', 'Peasant_Legs']);
    return { ...b, wear: b.wear.filter((p) => !(fx && p === 'Beard')).map((p) => (body.has(p) ? fx + p : p)) }; }
  const bodyType = s.bodyType || (seed % 2 ? 'f' : 'm'); const fx = bodyType === 'f' ? 'F_' : '';
  const drop = new Set([...(FOE_DROP[worldId || 'dark'] || []), ...(s.drop || [])]);
  let wear = (look.wear || []).map((p) => s.swap?.[p] || p).filter((p) => !drop.has(p));
  const tone = s.skin ?? SKIN[(seed >> 1) % SKIN.length]; const hairC = HAIRC[(seed >> 3) % HAIRC.length];
  const hair = s.hood ? 'short' : s.hat ? (bodyType === 'f' ? 'long' : 'short') : s.hair;
  const parts = [...(s.head === false ? [] : HEAD), ...outfit(s), ...(hair && s.head !== false ? [HAIR[bodyType][hair]] : []), ...(s.beard && bodyType === 'm' && s.head !== false ? ['Beard'] : [])].map((p) => fx + p);
  wear = [...wear, ...(s.add || []), ...parts];
  return { ...look, ...(s.set || {}), body: false, wear, hide: [...(s.glow || s.head === false ? [] : ['Eyes']), ...(s.hide || [])], tint: { Skin: tone, SkinHands: tone, Hair: hairC, Hair2: hairC, ...(s.tint || {}) }, trim: s.trim || null, foeBody: true };
}
/* puts the low-poly body on a foe that already wears `look`. Resolves true when it is on. Only the parts the look names
   are bound (wear's `only`), with one shared skeleton, so a foe adds about nine meshes, not forty. */
export function applyFoeBody(actor, worldId, key, look, seed = 0, heroModel = null) {
  if (!foesOn()) return Promise.resolve(false);
  const next = foeLook(worldId, key, look, seed, heroModel); if (!next) return Promise.resolve(false);
  return actor.wear(FOE_URL, { only: new Set(next.wear) }).then(() => {
    actor.look(next); for (const [part, y] of Object.entries(next.trim || {})) trimPart(actor, part, y);
    actor.bodied = true; actor.foeBodied = true; actor.foeDrop = [...(FOE_DROP[worldId || 'dark'] || []), ...((typeof foeSpec(worldId, key) === 'object' && foeSpec(worldId, key)?.drop) || [])]; return true;
  }).catch((err) => { console.warn('foe body', err); return false; });
}

/* after a world's dressFoe (it shows and hides wardrobe heads and coats by its own variant tables, made for the
   mannequin): what the real body replaced goes off again. fight.js calls it last. */
export function sealFoeBody(actor) {
  if (!actor?.foeBodied) return;
  for (const p of actor.foeDrop || []) for (const m of actor.parts.get(p) || []) m.visible = false;
  for (const m of actor.parts.get('Mannequin') || []) m.visible = false;
}

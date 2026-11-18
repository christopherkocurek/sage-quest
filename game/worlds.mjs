/* The five worlds. Each world entry (game/worlds/<id>.mjs) is text only and is read by the server and the client.
   kitFor(id) returns the kit tables of game/kit.mjs with that world's names, looks and lines laid over them.
   Mechanics ids never change: a world renames and re-dresses, it never adds a new mechanic.
   'dark' has no overrides, so kitFor('dark') returns the kit arrays themselves (same objects). */
import { ARCHETYPES, BIOMES, WEAPONS, MATERIALS, ELEMENTS, NEMESES, BOSSES, FOES, MINIONS, byId } from './kit.mjs';
import dark from './worlds/dark.mjs';
import edo from './worlds/edo.mjs';
import neon from './worlds/neon.mjs';
import frontier from './worlds/frontier.mjs';
import storybook from './worlds/storybook.mjs';

/* tie order of the world question = `order` (edo, neon, frontier, storybook, dark) */
export const WORLDS = [dark, edo, neon, frontier, storybook].sort((a, b) => a.order - b.order);
export const WORLD_IDS = WORLDS.map((w) => w.id);
export const DEFAULT_WORLD = 'dark';
export const worldById = (id) => WORLDS.find((w) => w.id === id) || dark;

/* the weapon's name when nobody dear is named, by element (main.js used NAME_BY_ELEMENT) */
export const WEAPON_NAMES = { fire: 'Emberfang', frost: 'Winterbite', storm: 'Stormcall', shadow: 'Nightwhisper' };
/* the minion rename pattern by foe id ({m} = the minion's one-word name from the enemy step) */
export const FOE_NAMES = { minion: '{m}', warrior: 'Sworn {m}', rogue: 'Pale {m}', brute: 'Great {m}' };
/* story words a world may swap (game/story.mjs reads them as S.worldWords) */
export const WORDS = { road: 'the road', fire: 'the fire', stars: 'the stars', beacon: 'beacon', anchor: 'anchor', traveller: 'Traveller' };

const empty = (t) => !t || Object.keys(t).length === 0;
/* lay a table { id: fields } over a list of { id, ... }; an empty table returns the list itself */
function over(list, table, norm = (x) => x) {
  if (empty(table)) return list;
  return list.map((x) => (table[x.id] ? { ...x, ...norm(table[x.id]) } : x));
}
const pick = (o, keys) => { const out = {}; for (const k of keys) if (o[k] !== undefined) out[k] = o[k]; return out; };

const cache = new Map();
export function kitFor(id) {
  const w = worldById(id);
  if (cache.has(w.id)) return cache.get(w.id);
  /* world nemeses come first; a dark nemesis whose mechanic no world nemesis takes stays in the list */
  const own = (w.nemeses || []).map((n) => ({ ...n, mech: n.mech || n.id }));
  const taken = new Set(own.map((n) => n.mech));
  /* a world with two or more nemeses of its own offers only those: no dark fill-ins, and any other id
     (a quick-start 'dragon', a dark pick carried over) falls to its first own nemesis. One own nemesis keeps the fill-ins. */
  const ownOnly = own.length >= 2;
  const nemeses = ownOnly ? own : own.length ? [...own, ...NEMESES.filter((n) => !taken.has(n.id))] : NEMESES;
  const foes = over(FOES, w.foes);
  const K = {
    id: w.id, label: w.label, world: w,
    ARCHETYPES: over(ARCHETYPES, w.heroes),
    WEAPONS: over(WEAPONS, w.weapons),
    MATERIALS: over(MATERIALS, w.materials, (m) => (typeof m === 'string' ? { label: m } : m)),
    ELEMENTS: over(ELEMENTS, w.elements),
    NEMESES: nemeses,
    BOSSES, FOES: foes, BIOMES, MINIONS,
    words: { ...WORDS, ...(w.words || {}) },
    ui: w.ui || null, fp: w.fp || null, fpParts: w.fpParts || undefined, sfx: w.sfx || null, camp: w.camp || null, companion: w.companion || null, torch: w.torch ?? null, props: w.props || {},
    weaponNames: { ...WEAPON_NAMES, ...(w.weaponNames || {}) },
    foeNames: { ...FOE_NAMES, ...(w.foeNames || {}) },
    /* the nemesis entry by id (a world id like 'lord' or a mechanics id like 'twin') */
    nemesis: (nid) => nemeses.find((n) => n.id === nid) || nemeses.find((n) => (n.mech || n.id) === nid) || (ownOnly ? nemeses[0] : null),
    /* the boss def for a nemesis: the mechanics def from BOSSES (id = mechanic, so every `def.id === 'twin'` test holds),
       with the world's label, size, gear, look, persona and lines laid over it; `nemesis` keeps the world id */
    bossFor(n) {
      const mech = n?.mech || n?.id || 'giant';
      const base = byId(BOSSES, mech) || BOSSES[0];
      if (!n || !n.mech) return base;
      return { ...base, ...pick(n, ['label', 'size', 'gear', 'offhand', 'look', 'persona', 'intro', 'death', 'mirror', 'hp', 'bare', 'summon', 'reach', 'pronoun', 'fellVerb' , 'damage' /* a world boss may hit softer */]), id: base.id, nemesis: n.id };
    },
    /* the land for a climate biome: the world's own land id and label, or the dark biome when the world has none */
    landFor(biomeId) {
      const b = byId(BIOMES, biomeId); if (!b) return null;
      const lid = w.lands?.[biomeId]; if (!lid) return b;
      return { ...b, ...(w.landInfo?.[lid] || {}), id: lid, climate: biomeId };
    },
    /* a foe's name on the road: the minion pattern when the enemy step chose minions */
    foeName(def, minions) {
      if (!minions || def.boss || def.own) return def.label;
      const p = K.foeNames[def.id];
      return p ? p.replace('{m}', minions.one) : def.label;
    },
  };
  cache.set(w.id, K);
  return K;
}

/* every land id a quick-start link may name: climate biomes plus each world's own land ids -> [worldId, biomeId] */
export function landHome(landId) {
  if (byId(BIOMES, landId)) return { world: null, biome: landId };
  for (const w of WORLDS) for (const [b, l] of Object.entries(w.lands || {})) if (l === landId) return { world: w.id, biome: b };
  return null;
}

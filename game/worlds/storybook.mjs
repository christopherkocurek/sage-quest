/* The Storybook Day: a bright picture-book country of hills, castles and storms. Warm and brave, never cute.
   Text only (server and client). The 3D side is web/src/worlds/storybook.js. */
export default {
  id: 'storybook', label: 'The Storybook Day', order: 3,
  fits: 'Green hills, mountain meadows, alpine villages, windmills and castles in the sun. Fits a player from green countryside, hills or alpine mountains whose days are farming, herding, gardening or village life, or whose home or days feel bright and gentle: a garden, a bakery, a village, music, play.',
  /* climate biome id -> world land id: the warm and green climates get the meadow, the cold, wet and high ones the peaks */
  lands: { deepwood: 'meadow', dusksteppe: 'meadow', vinewild: 'meadow', drownedfen: 'meadow', ashlands: 'meadow',
           frostpass: 'cloudpeaks', barrowmoor: 'cloudpeaks', stormcoast: 'cloudpeaks' },
  landInfo: {
    meadow: { label: 'The Bright Meadow', accent: 0xf2b84a, fits: 'A sunny meadow of poppies and long grass, with a castle on the hill and a windmill turning.' },
    cloudpeaks: { label: 'The Cloud Peaks', accent: 0x9ec8ff, fits: 'High green pastures and painted standing stones in the sun, with a storm wall far off on the peaks.' },
  },
  /* the title camp hero: a young squire in a tunic and hood (the world hero is a knight, never a wizard) */
  traveller: { armor: false, wear: ['Tunic', 'Hood_cloth', 'Face', 'Boots', 'Belt'], cloth: 0x2c4a8a, under: 0x6a4a30, },
  /* archetype id -> label + look (wardrobe parts from web/assets/real/wear_storybook.glb). Every cloth look covers the head. */
  heroes: {
    knight: { label: 'The Young Knight', look: { helm: 'open', wear: ['Helm_open', 'Plume', 'Surcoat', 'Face'], cloak: true, tabard: false, steel: 0xdfe4ea, cloth: 0x2c4a8a } },
    /* the cloth heroes carry the cloth arm set in first person (a tan glove, a laced leather bracer, a linen sleeve) */
    barbarian: { label: 'The Woodsman', fp: 'storybook_cloth', look: { armor: false, wear: ['Tunic', 'Hood_cloth', 'Face', 'Boots', 'Belt'], cloth: 0x6a4a2c, under: 0x6a4a30, } },
    mage: { label: 'The Apprentice', fp: 'storybook_cloth', look: { armor: false, wear: ['Gown', 'Hood_cloth', 'Face', 'Boots', 'Belt'], cloth: 0x34408a, under: 0x2c367a, } },
    rogue: { label: 'The Outlaw', look: { armor: false, wear: ['Tunic', 'Hood_cloth', 'Face', 'Cape', 'Boots', 'Belt'], cloth: 0x3a6a34, under: 0x30582c, } },
  },
  /* foe id -> label, gear, size, look (replaces the dark look, so cls and grime are set), persona */
  foes: {
    minion: { label: 'Goblin', gear: 'dagger', size: 0.72,
      look: { cls: 'thrall', grime: 'meadow', armor: false, bare: true, skin: 0x5e8a38, wear: ['Ears', 'Cap_goblin', 'Face_goblin', 'Loincloth', 'Belt'], cloth: 0x9a7a4a },
      persona: 'Goblins are small, hungry and quick. Alone they run, so they rush in together and snap at the heels.' },
    warrior: { label: 'Brigand', gear: 'sword', offhand: 'shield',
      /* a villain palette (oxblood hood and tunic, black under it, black leather, a domino mask in storybook.js
         dressFoe), never the companions' brown */
      look: { cls: 'guard', grime: 'meadow', armor: false, wear: ['Tunic', 'Hood_cloth', 'Face_brigand', 'Boots', 'Belt'], cloth: 0x6e1a1e, under: 0x1e1a1e, vary: false, dye: false }, /* no land dye in the oxblood */
      persona: 'Brigands are hired swords who guard the road for a fee. They hold their ground behind a shield and strike when the traveller tires.' },
    rogue: { label: 'Wolfcloak', gear: 'dagger', offhand: 'dagger',
      look: { cls: 'stalker', grime: 'meadow', armor: false, wear: ['Hood_wolf', 'Face', 'Tunic', 'Cape', 'Boots', 'Belt'], cloth: 0x6a5a48, under: 0x6a4a30, },
      persona: 'Wolfcloaks hunt in the long grass. They strike from the side or the back and slip away from any fair fight.' },
    brute: { label: 'Troll', gear: 'maul', size: 1.3, wide: 0.3,
      look: { cls: 'brute', grime: 'meadow', armor: false, bare: true, skin: 0x7c8672, wear: ['Troll_head', 'Troll_body', 'Loincloth', 'Belt'], cloth: 0x6a5238 },
      persona: 'Trolls are huge and slow. Nothing frightens them. They walk straight at the traveller and swing until the ground shakes.' },
  },
  foeNames: { minion: '{m}', warrior: 'Sworn {m}', rogue: 'Grey {m}', brute: 'Great {m}' },
  weapons: {
    sword: { label: 'Sword and kite shield' },
    greatsword: { label: 'Greatsword' },
    maul: { label: 'War hammer' },
    axe: { label: 'Woodsman’s axe' },
    daggers: { label: 'Twin knives' },
    spear: { label: 'Boar spear' },
    staff: { label: 'Oak staff' },
    bow: { label: 'Longbow', gear: 'storybook_bow',
      fits: 'A yew longbow and a quiver of red-fletched arrows, an outlaw of the greenwood. Fits a player who asks for a bow, a longbow, arrows, archery, a crossbow, Robin Hood, or who wants to shoot from far away.' },
  },
  materials: { iron: 'Bright steel', bone: 'Ivory', obsidian: 'Jet' },
  /* each element has its own E-key mechanic (web/src/powers.js) */
  elements: {
    fire: { label: 'Fire', ability: 'Hearth ward', power: 'ward', abilityNote: 'a ring of hearth light that throws the next blow back',
      fits: 'Hearth fire along the edge. Fits a request that names fire, flame, a hearth, home, warmth, a candle, burning, ember, heat, the sun, protection, or a dragon.' },
    frost: { label: 'Frost', ability: 'Winter wind', power: 'dash', abilityNote: 'the wind carries you through them and every one in the way is cut',
      fits: 'Frost along the edge. Fits a request that names frost, ice, cold, snow, wind, a gust, flying, freezing, or winter.' },
    storm: { label: 'Thunder', ability: 'Star shower', power: 'rain', abilityNote: 'calls falling stars down on a spot after a short warning',
      fits: 'Starlight along the edge. Fits a request that names lightning, thunder, storm, stars, a wish, the night sky, falling stars, sparks, or speed.' },
    shadow: { label: 'Dusk', ability: 'Bramble wall', power: 'wall', abilityNote: 'a wall of thorns that holds foes back and snares those who touch it',
      fits: 'Dusk thorns along the edge. Fits a request that names shadow, darkness, dusk, thorns, brambles, roses, a curse, a witch, poison, death, souls, or blood.' },
  },
  weaponNames: { fire: 'Hearthbrand', frost: 'Winterlight', storm: 'Thunderbell', shadow: 'Duskthorn' },
  nemeses: [
    { id: 'stormgiant', mech: 'giant', label: 'The Storm Giant', size: 3.5, reach: 1.45, /* 2.7 -> 3.5 (about 7 m, 3.4 x the hero); reach 1.45 x 3.5 = 5.1 m as before */ bare: true,
      /* a towering weather figure: a body of storm cloud, a bearded face-mass, a torn oak for a club (web/src/worlds/storybook-boss.js) */
      look: { armor: false, bare: true, skin: 0x8a9ab6, cloth: 0x8a9ab6, eye: 0x8a9ab6, eyePower: 0, vary: false },
      fits: 'A giant made of storm cloud. Fits a player who mentions a giant, a storm, thunder, a bully, something bigger than them, a mountain to climb, or an unfair fight.',
      persona: 'The Storm Giant walks in front of the thunder. It never retreats and never guards. Each step brings lightning down.',
      intro: 'The storm stands up and walks.', death: 'The giant breaks into rain.' },
    { id: 'blackknight', mech: 'twin', label: 'The Black Knight', pronoun: 'he',  mirror: false, gear: 'sword', offhand: 'shield', size: 1.05,
      fits: 'A knight in black armour who guards the road. Fits a player who mentions fighting themselves, doubt, fear, a rival, an ex, a brother or sister, or their own shadow.',
      /* a toy soldier in black enamel: round helm with a red plume, black surcoat with a gold cross (web/src/worlds/storybook-boss.js) */
      look: { helm: 'open', wear: ['Helm_toy', 'Surcoat'], cloak: true, tabard: false, pauldrons: true, steel: 0x2c2e38, cloth: 0x1c1d26, eyePower: 0 },
      persona: 'The Black Knight knows every move the traveller knows. He guards against careless attacks and answers every mistake at once.',
      intro: 'He lowers his visor and does not speak.', death: 'He kneels, and the spell on him breaks.' },
  ],
  words: { road: 'the path', fire: 'the bonfire', stars: 'the stars', beacon: 'watch beacon', anchor: 'stake', traveller: 'Wanderer', cause: 'the songbird', lure: 'the songbird'  },
  ui: { night: '#1a2238', cream: '#fffaf0', ember: '#c8861a', serif: "'Fraunces', serif", font: 'Fraunces:ital,wght@1,500;1,600' },
  /* daylight: the camera torch is almost off (the sun does the work) */
  torch: { color: 0xfff2dc, power: 0.08, range: 8 },
  fp: 'storybook', sfx: null, companion: 'fairy', camp: 'storybook',
  props: { fire: 'bonfire', anchor: 'stake', beacon: 'pole' },
};

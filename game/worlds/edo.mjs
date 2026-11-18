/* Old Edo: night and dawn on the rice terraces and the castle road. Text only (server and client).
   The 3D side is web/src/worlds/edo.js (lands, looks, wardrobe wear_edo.glb, gear gear_edo_*.glb, boss dress, camp).
   Hard armour pieces of the wardrobe carry the knight's part names (Helm_great = kabuto, Chest = do, Fauld = kusazuri,
   PauldronL/R = sode, ForeArmL/R = kote, ShinL/R = suneate, Helm_kettle = jingasa, Helm_sallet = kasa) so the fight's
   armour break works on them; cloth and masks have their own names. Every look covers the head. */
const EDO_HERO = { armor: false, steel: 0x2a2224 }; /* under (per look): a hex = plain cloth or skin under the wear, so no mail shows anywhere in Edo */ /* steel = the lacquer tone of the plates */
export default {
  id: 'edo', label: 'Old Edo', order: 0,
  /* the art style of this world's lands (web/src/style.js): the ukiyo-e ink print is Edo's default look; ?style=off shows the plain render */
  style: 'ink',
  fits: 'Old Japan: rice paddies, castle roads, moonlit nights. Fits a player from Japan, or whose days hold martial arts, a dojo, kendo, calligraphy, tea ceremony or Japanese history.',
  /* climate biome id -> world land id (web/src/worlds/edo.js registers both lands) */
  lands: { drownedfen: 'paddies', vinewild: 'paddies', deepwood: 'paddies', stormcoast: 'paddies',
           ashlands: 'castleroad', dusksteppe: 'castleroad', barrowmoor: 'castleroad', frostpass: 'castleroad' },
  landInfo: {
    paddies: { label: 'The Flooded Paddies', accent: 0xff9a4a, fits: 'Terraced rice under the moon, still water, a torii by the path.' },
    castleroad: { label: 'The Castle Road', accent: 0xd8402a, fits: 'Stone walls and lanterns on the road up to the lord\'s keep.' },
  },
  /* the figure at the title camp before a body is chosen: a traveller under a straw kasa, face wrapped, no plate */
  traveller: { under: 0x25222a, armor: false, steel: 0x2a2224, wear: ['Helm_sallet', 'Mask_cloth', 'Kimono', 'Hakama', 'Wraps'], cloth: 0x2a2630 },
  /* archetype id -> label, look, fits (the fits clauses keep the dark ones: they describe the player, not the world) */
  heroes: {
    knight: { label: 'The Samurai',
      look: { under: 0x1a1820, ...EDO_HERO, wear: ['Helm_great', 'Maedate', 'Menpo', 'Chest', 'Fauld', 'PauldronL', 'PauldronR', 'ForeArmL', 'ForeArmR', 'ShinL', 'ShinR', 'Hakama', 'Kimono'], cloth: 0x1c2233 },
      fits: 'A samurai in lacquered armour, bound by honour and duty. Fits a player who speaks of protecting family or others, loyalty, honour, duty, justice, being a parent or a leader.' },
    barbarian: { label: 'The Monk',
      look: { under: 0x6e5a48, ...EDO_HERO, wear: ['Zukin', 'Kimono_open', 'Kesa', 'Hakama', 'Wraps'], cloth: 0x8a8070 },
      fits: 'A mountain warrior who trains hard. Fits a player who speaks of anger, rage, strength, smashing, lifting, fighting, revenge, or being done with rules.' },
    mage: { label: 'The Priest',
      look: { under: 0xa8a090, ...EDO_HERO, wear: ['Eboshi', 'Veil', 'Kimono', 'Kesa', 'Hakama'], cloth: 0xc4bcaa },
      fits: 'A shrine priest who speaks with the old powers. Fits a player who speaks of knowledge, books, code, building things, science, curiosity, magic, spells, or outsmarting others.' },
    rogue: { label: 'The Ronin',
      look: { under: 0x25222a, ...EDO_HERO, wear: ['Helm_sallet', 'Mask_cloth', 'Kimono', 'Hakama', 'Wraps'], cloth: 0x2a2630 },
      fits: 'A masterless swordsman on the road. Fits a player who speaks of freedom, money, gambling, trading, stealth, tricks, travel, or trusting nobody.' },
  },
  /* foe id -> label, gear, look (replaces the dark look: cls and grime given), persona */
  foes: {
    minion: { label: 'Bandit', standOff: 1.8, /* keep-out from the lens only (fight.js holdOff), not the hit size */ gear: 'edo_kama', offhand: null,
      look: { under: 0x6a4c38, armor: false, cls: 'thrall', grime: 'paddies', wear: ['Headband', 'Face', 'Hair_wild', 'Kimono_open', 'Hakama', 'Wraps', 'ShinL'], cloth: 0x4a3a2a }, /* a face, not a cloth mask */
      persona: 'Bandits are hungry and reckless. Alone they die at once, so they rush in together and surround the intruder.' },
    warrior: { label: 'Retainer', standOff: 1.75, /* keep-out from the lens only (fight.js holdOff), not the hit size */ gear: 'edo_katana', offhand: null,
      look: { under: 0x1e1a1e, armor: false, cls: 'guard', grime: 'castleroad', wear: ['Helm_kettle', 'Menpo', 'Chest', 'Fauld', 'PauldronL', 'PauldronR', 'ForeArmL', 'ForeArmR', 'Hakama', 'Kimono', 'Wraps'], cloth: 0x2a2024, steel: 0x3a2a26 },
      persona: 'Retainers are sworn to their lord. They are shamed for good if the intruder gets past them, so they press the attack and guard just when they are badly hurt.' },
    rogue: { label: 'Shinobi', standOff: 1.75, /* keep-out from the lens only (fight.js holdOff), not the hit size */ gear: 'edo_tanto', offhand: 'edo_tanto',
      look: { under: 0x101013, armor: false, cls: 'stalker', grime: 'castleroad', wear: ['Zukin_black', 'Kimono', 'Hakama', 'Wraps', 'ForeArmL', 'ForeArmR'], cloth: 0x1a2136, steel: 0x18181c }, /* indigo cloth (the hood is the EDO_ClothShinobi material) */
      persona: 'Shinobi are patient and cunning. They win by striking the intruder from the side or the back, and they lose any fair fight from the front.' },
    brute: { label: 'Kanabo Brute', gear: 'edo_kanabo', offhand: null, size: 1.3,
      look: { under: 0x5a3428, armor: false, cls: 'brute', grime: 'castleroad', wear: ['Mask_oni', 'Kimono_open', 'Hakama', 'Wraps', 'Fauld', 'ShinL', 'ShinR'], cloth: 0x3a2622, steel: 0x2a1c18 },
      persona: 'Kanabo Brutes are huge and slow. Nothing frightens them. They walk straight at the intruder and never fall back.' },
  },
  foeNames: { minion: '{m}', warrior: 'Sworn {m}', rogue: 'Masked {m}', brute: 'Great {m}' },
  /* the same 7 weapon ids; the katana is held in two hands (cls two), so no shield */
  weapons: {
    sword: { label: 'Katana', gear: 'edo_katana', offhand: null, cls: 'two',
      fits: 'A curved katana held in two hands. Fits a player who asks for a sword, a katana, a blade, a samurai sword, a classic or balanced weapon, or who wants to defend.' },
    greatsword: { label: 'Nodachi', gear: 'edo_nodachi',
      fits: 'A field sword as tall as a man. Fits a player who asks for a greatsword, a nodachi, a giant sword, a long sword, something huge, or the biggest sword.' },
    maul: { label: 'Kanabo', gear: 'edo_kanabo',
      fits: 'An iron-studded war club. Fits a player who asks for a hammer, a club, a kanabo, a mace, a maul, or who wants to crush, smash or break armour.' },
    axe: { label: 'Ono', gear: 'edo_ono',
      fits: 'A long-handled battle axe. Fits a player who asks for an axe, a hatchet, a cleaver, an ono, something brutal, or wants to cleave and chop.' },
    daggers: { label: 'Tanto pair', gear: 'edo_tanto', offhand: 'edo_tanto',
      fits: 'Two short tanto blades. Fits a player who asks for daggers, knives, a tanto, two weapons, something fast, light or silent, or wants to strike quickly.' },
    spear: { label: 'Naginata', gear: 'edo_naginata',
      fits: 'A curved blade on a long pole. Fits a player who asks for a spear, a naginata, a glaive, a lance, a pike, a polearm, or wants to keep enemies at a distance.' },
    staff: { label: 'Shakujo', gear: 'edo_shakujo',
      fits: 'A monk staff hung with iron rings. Fits a player who asks for a staff, a rod, a wand, a monk staff, magic, prayers, spells, or a weapon that casts.' },
    bow: { label: 'Yumi', gear: 'edo_yumi',
      fits: 'A tall yumi longbow of lacquered bamboo, and arrows. Fits a player who asks for a bow, a yumi, a longbow, arrows, archery, kyudo, or who wants to shoot from far away.' },
  },
  materials: { iron: 'Tamahagane', silver: 'Silver', gold: 'Gold leaf', bone: 'Bone', obsidian: 'Black lacquer' },
  /* each element has its own E-key mechanic (web/src/powers.js) */
  elements: {
    fire: { label: 'Fire', ability: 'Fox fire', power: 'summon', abilityNote: 'three fox-fire wisps hunt your foes while you fight',
      fits: 'Fox fire along the edge. Fits a request that names fire, flame, burning, ember, heat, the sun, a fox, kitsune, spirit fire, wisps, or a dragon.' },
    frost: { label: 'Snow', ability: 'Still snow', power: 'ward', abilityNote: 'a ward of falling snow that throws the next blow back',
      fits: 'Snow along the edge. Fits a request that names frost, ice, cold, snow, winter, stillness, calm, a guard, or defence.' },
    storm: { label: 'Thunder', ability: 'Raijin strike', power: 'rain', abilityNote: 'calls lightning down on a spot after a short warning',
      fits: 'Thunder along the edge. Fits a request that names lightning, thunder, storm, Raijin, the sky, electricity, sparks, or speed.' },
    shadow: { label: 'Shadow', ability: 'Kage step', power: 'dash', abilityNote: 'you pass through them like wind and every one in the way is cut',
      fits: 'Shadow along the edge. Fits a request that names shadow, darkness, a ninja, wind, a quick cut, stealth, poison, death, a curse, souls, or blood.' },
  },
  weaponNames: { fire: 'Kagaribi', frost: 'Shimo', storm: 'Raiden', shadow: 'Kage' },
  nemeses: [
    { id: 'lord', mech: 'twin', mirror: false, label: 'The Lord', size: 1.35, gear: 'edo_nodachi', offhand: null,
      look: { under: 0x120c0e, armor: false, wear: ['Helm_great', 'Kuwagata', 'Mask_oni_lord', 'Sashimono', 'Chest', 'Fauld', 'PauldronL', 'PauldronR', 'ForeArmL', 'ForeArmR', 'ShinL', 'ShinR', 'Hakama', 'Kimono'], cloth: 0x1a0e10, steel: 0x2a2a2e },
      fits: 'A lord in lacquered armour. Fits a player who mentions a boss, a master, a ruler, a teacher, a duel, a father, a company, or someone above them.',
      persona: 'The Lord is a master swordsman in his own castle. He guards against careless attacks and answers every mistake at once.',
      intro: 'He draws in silence.', death: 'He kneels and lays the blade down.', /* the death ends on the kneel (edo-boss.js), so this line is true */
      pronoun: 'he', fellVerb: 'knelt' /* the card says "The Lord knelt to ..."; story.mjs may read this for 'It will hear...' / 'It stands up again' */ },
    { id: 'other', mech: 'twin', mirror: false, label: 'The Other Ronin', size: 1.05, gear: 'edo_katana', offhand: null,
      look: { under: 0x16141a, armor: false, wear: ['Helm_sallet', 'Mask_cloth', 'Kimono', 'Hakama', 'Wraps', 'ForeArmL', 'ForeArmR'], cloth: 0x1c1a24, steel: 0x2a2224 },
      fits: 'A ronin who walks the same road as the player. Fits a player who mentions fighting themselves, doubt, fear, bad habits, a rival, an ex, a brother or sister, or their own shadow.',
      persona: 'The Other Ronin knows every move the intruder knows. He guards against careless attacks and answers every mistake at once.',
      intro: 'A hat on the road. He looks up.', death: 'His hat rolls into the water.', pronoun: 'he' },
  ],
  words: { road: 'the road', fire: 'the brazier', stars: 'the lanterns', beacon: 'lantern', anchor: 'stake', traveller: 'Ronin', bruteWeapon: 'club', cause: 'the paper lantern', lure: 'the paper lantern' ,
    /* each chapter of the chains shape names its own prop (story.mjs reads words.goals) */
    goals: { task: 'Cut down the edict boards', taskLine: 'Edict boards hold the road for the Lord. Cut them down.', twist: 'Cut down his war banners', twistLine: 'His war banners shield him. Cut them down first.' } },
  ui: { night: '#0b0a0c', cream: '#efe6d4', ember: '#c8402a', serif: "'Shippori Mincho', serif", font: 'Shippori+Mincho:wght@500;600' },
  /* the torch is a paper lantern: warmer and a little softer than the dark world's */
  torch: { color: 0xffb070, power: 1.3, range: 13 },
  fp: 'edo', fpParts: ['hand', 'forearm', 'upper', 'leg'], sfx: 'edo', companion: 'hitodama', camp: 'edo',
};

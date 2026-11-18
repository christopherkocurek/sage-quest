/* The Frontier: a hard, spare western at dusk and dawn. Foes carry blades, tools and fists; the hero may ask for a revolver
   or a lever rifle, which shoot, run dry and leave the hero open while they reload.
   Every man shows his eyes under the brim; some wear the kerchief up, some round the neck. Text; the 3D side is web/src/worlds/frontier.js.
   */

/* wardrobe parts (modelled by script in Blender: web/assets/real/wear_frontier.glb). The body under the clothes is plain dark
   cloth (`under`), not skin: where the rig pokes through a coat it reads as a fold, and the bare hands read as leather gloves. */
const HEAD = ['Head_shade', 'Face'];
const LEGS = ['Trousers', 'Boots'];

export default {
  id: 'frontier', label: 'The Frontier', order: 2,
  fits: 'A hot, dry land of desert, mesa and open plains. Fits a player whose home is hot, dry open country: West Texas, Arizona, northern Mexico, the Australian outback, a dry plateau or desert city, or another hot dry place, or whose days are ranching, cattle, trucking, horses, oil fields, hunting or rodeo. A player whose days are cattle, horses or rodeo fits from any homeland. A farmer from a green, wet or alpine homeland does not fit.',
  /* climate biome -> world land: dry, high and rough country is the mesa; open, green or wet country is the rail line */
  lands: { ashlands: 'mesa', frostpass: 'mesa', vinewild: 'mesa', stormcoast: 'mesa',
           dusksteppe: 'railhead', deepwood: 'railhead', barrowmoor: 'railhead', drownedfen: 'railhead' },
  landInfo: {
    mesa: { label: 'Red Mesa', accent: 0xd98a3a, fits: 'Red rock buttes, saguaro and dry washes under a long dusk.' },
    railhead: { label: 'The Railhead', accent: 0xe0b060, fits: 'Open scrub where the new line crosses the trestle at dawn.' },
  },
  /* the figure at the title camp before a body is chosen: a drifter in a hat, a long coat and a kerchief */
  traveller: { wear: [...HEAD, 'Hat_brim', 'Bandana_dark', 'Shirt', 'Duster', 'Cuffs', ...LEGS], armor: false, under: 0x2a2018, cloth: 0x3a2c20 },
  heroes: {
    knight: { label: 'The Marshal',
      look: { wear: [...HEAD, 'Hat_brim', 'Bandana_neck', 'Moustache', 'Shirt', 'Vest', 'Badge', 'Duster', 'Cuffs', ...LEGS], armor: false, under: 0x2a2018, cloth: 0x4e3c2a },
      fits: 'A lawman who stands between the town and harm. Fits a player who speaks of protecting family or others, loyalty, honour, duty, justice, being a parent or a leader.' },
    barbarian: { label: 'The Railman',
      look: { wear: [...HEAD, 'Cap_rail', 'Bandana_neck', 'Moustache', 'Shirt', 'Suspenders', 'Gloves', ...LEGS], armor: false, under: 0x6a5a46, cloth: 0x3a2a20 },
      fits: 'A rail-gang hammer man who trusts strength and nerve. Fits a player who speaks of anger, rage, strength, smashing, lifting, fighting, revenge, or being done with rules.' },
    mage: { label: 'The Preacher',
      look: { wear: [...HEAD, 'Hat_flat', 'Collar', 'Shirt', 'Duster', 'Cuffs', ...LEGS], armor: false, under: 0x2a2018, cloth: 0x15120f },
      fits: 'A travelling preacher who reads men like scripture. Fits a player who speaks of knowledge, books, code, building things, science, curiosity, faith, words, or outsmarting others.' },
    rogue: { label: 'The Drifter',
      look: { wear: [...HEAD, 'Hat_brim', 'Bandana', 'Poncho', 'Shirt', 'Cuffs', 'Chaps', ...LEGS], armor: false, under: 0x2a2018, cloth: 0x7a5a34 },
      fits: 'A drifter with no name and no home. Fits a player who speaks of freedom, money, gambling, trading, stealth, tricks, travel, or trusting nobody.' },
  },
  foes: {
    minion: { label: 'Outlaw', standOff: 1.9, /* keep-out from the lens only (fight.js holdOff), not the hit size */ gear: 'frontier_hatchet', offhand: null,
      look: { cls: 'thrall', grime: 'mesa', armor: false, under: 0x3a2a1e, cloth: 0x4a3a2a, wear: [...HEAD, 'Hat_slouch', 'Bandana', 'Shirt', 'Vest', 'Chaps', ...LEGS] },
      persona: 'Outlaws are hungry and reckless. Alone they run, so they rush in together and surround the intruder.' },
    warrior: { label: 'Hired Hand', standOff: 1.9, /* keep-out from the lens only (fight.js holdOff), not the hit size */ gear: 'frontier_pickhandle', offhand: null,
      look: { cls: 'guard', grime: 'mesa', armor: false, under: 0x2a2018, cloth: 0x2a221c, wear: [...HEAD, 'Hat_brim', 'Bandana_neck', 'Moustache', 'Shirt', 'Duster', ...LEGS] },
      persona: 'Hired Hands are paid to hold the line. They lose their pay if the intruder gets past them, so they press the attack and guard when they are badly hurt.' },
    rogue: { label: 'Knife Man', standOff: 1.9, /* keep-out from the lens only (fight.js holdOff), not the hit size */ gear: 'frontier_bowie', offhand: 'frontier_bowie',
      look: { cls: 'stalker', grime: 'mesa', armor: false, under: 0x2e2218, cloth: 0x2a2420, wear: [...HEAD, 'Hat_bowler', 'Bandana_dark', 'Shirt', 'Vest', 'Sash', ...LEGS] },
      persona: 'Knife Men are patient and cruel. They win by cutting the intruder from the side or the back, and they lose any fair fight from the front.' },
    brute: { label: 'Spike Man', standOff: 1.9, /* keep-out from the lens only (fight.js holdOff), not the hit size */ gear: 'frontier_sledge', offhand: null,
      look: { cls: 'brute', grime: 'mesa', armor: false, under: 0x3a2a1e, cloth: 0x2e241c, wear: [...HEAD, 'Cap_rail', 'Bandana_neck', 'Moustache', 'Shirt', 'Suspenders', 'Apron', 'Gloves', ...LEGS] },
      persona: 'Spike Men drive rail all day and are afraid of nothing. They walk straight at the intruder and never fall back.' },
  },
  foeNames: { minion: '{m}', warrior: 'Hired {m}', rogue: 'Masked {m}', brute: 'Big {m}' },
  weapons: {
    sword: { label: 'Sabre', gear: 'frontier_sabre', offhand: null,
      fits: 'An old cavalry sabre, a blade and not a gun. Fits a player who asks for a sword, a sabre, a cutlass, a blade, a classic or balanced weapon, or who wants to defend.' },
    greatsword: { label: 'Rail pick', gear: 'frontier_pick',
      fits: "A rail gang's long pick, a heavy iron head on a hickory haft, swung with two hands. Fits a player who asks for a greatsword, a giant sword, a claymore, a pick, a pickaxe, something huge, or the biggest weapon." },
    maul: { label: 'Rail sledge', gear: 'frontier_sledge',
      fits: 'A spike maul from the rail gang. Fits a player who asks for a hammer, a sledge, a maul, a mace, a club, or who wants to crush, smash or break things.' },
    axe: { label: 'Felling axe', gear: 'frontier_axe',
      fits: 'A long felling axe. Fits a player who asks for an axe, a hatchet, something brutal, or wants to chop and split.' },
    daggers: { label: 'Bowie knives', gear: 'frontier_bowie', offhand: 'frontier_bowie',
      fits: 'Two heavy bowie knives. Fits a player who asks for daggers, knives, two weapons, something fast, light or silent, or wants to strike quickly.' },
    /* a player who says "spear" gets a spear (a cavalry lance: the leaf-headed spear model); the three-tine
       pitchfork is handed over only when the player's own words ask for a fork or a trident (alt, read in main.js apply.weapon) */
    spear: { label: 'Lance', gear: 'spear', alt: { words: 'pitch ?fork|hay ?fork|fork|trident', label: 'Pitchfork', gear: 'frontier_pitchfork' },
      fits: 'A long cavalry lance with a leaf-shaped iron head. Fits a player who asks for a spear, a lance, a pike, a pitchfork, a trident, or wants to keep enemies at a distance.' },
    staff: { label: 'Pick handle', gear: 'frontier_pickhandle',
      fits: 'A hickory pick handle shod with iron. Fits a player who asks for a staff, a stick, a rod, a cane, a bat, magic, or a weapon that casts.' },
    pistol: { label: 'Revolver', gear: 'frontier_revolver',
      fits: 'A single-action six-shot revolver, a Colt Peacemaker. Fits a player who asks for a revolver, a six-shooter, a six-gun, a pistol, a handgun, a gun, a Colt, a sidearm, a peacemaker, or who wants to shoot or be a gunslinger.' },
    rifle: { label: 'Lever rifle', gear: 'frontier_rifle',
      fits: 'A lever-action repeating rifle, a Winchester. Fits a player who asks for a rifle, a Winchester, a carbine, a repeater, a long gun, a shotgun, a hunting rifle, a buffalo gun, or who wants to shoot from far away.' },
  },
  materials: { iron: 'Rail iron', bone: 'Antler', obsidian: 'Blued steel' },
  /* each element has its own E-key mechanic (web/src/powers.js) */
  elements: {
    fire: { ability: 'Dynamite', power: 'bomb', abilityNote: 'a lit stick you lob; it blows on a short fuse, so stand clear',
      fits: 'Fire along the edge. Fits a request that names fire, flame, burning, dynamite, explosives, a bomb, gunpowder, blasting, a mine, heat, the sun, or a dragon.' },
    frost: { ability: 'Blue norther', power: 'breath', abilityNote: 'a cold gust you hold on them; it pushes and slows them',
      fits: 'Cold along the edge. Fits a request that names frost, ice, cold, snow, a norther, a blizzard, a cold wind, freezing, or winter.' },
    storm: { ability: 'Dust devil', power: 'vortex', abilityNote: 'a whirlwind that drags foes in, spins them and throws them down',
      fits: 'Storm along the edge. Fits a request that names lightning, thunder, storm, wind, a twister, a tornado, a dust devil, dust, sparks, or speed.' },
    shadow: { label: 'Dusk', ability: 'Long shadow', power: 'mark', abilityNote: 'marks one foe for a duel; your next heavy blow on it bursts',
      fits: 'Dusk along the edge. Fits a request that names shadow, darkness, dusk, sundown, a duel, a wanted man, a mark, poison, death, a curse, souls, or blood.' },
  },
  weaponNames: { fire: 'Brushfire', frost: 'Norther', storm: 'Dry Thunder', shadow: 'Sundown' },
  nemeses: [
    /* 2.6 x the knight, about 2.4 x the hero to the hat crown; reach per unit of size (bossFor passes it) */
    { id: 'baron', mech: 'giant', label: 'The Baron', pronoun: 'he',  size: 3.3, reach: 1.55, /* 2.6 -> 3.3, the Baron fights as the colossus of the walk frames; reach 1.95 -> 1.55 keeps about 5.1 m */ gear: 'frontier_sledge',
      fits: 'A rail baron in a top hat who owns the land. Fits a player who mentions a giant, a bully, a boss, a company, money, something bigger than them, or an unfair fight.',
      look: { wear: ['Head_shade', 'Face_baron', 'Hat_top', 'Collar_wing', 'Chops', 'Monocle', 'Shirt', 'Vest', 'Chain_gold', 'Duster', 'Gloves', ...LEGS], armor: false, under: 0x1c1816, cloth: 0x231c1e },
      persona: 'The Baron owns the line and every man on it. He never retreats and never guards. He walks at the intruder and drives the ground like a rail spike.',
      intro: 'He steps down off the trestle.', death: 'His hat rolls in the dust.' },
    { id: 'other', mech: 'twin', label: 'The Other Drifter', pronoun: 'he',  bare: true, mirror: false, gear: 'frontier_sabre',
      fits: 'A rival drifter who walks the same trail as the player. Fits a player who mentions fighting themselves, doubt, fear, bad habits, a rival, an ex, a brother or sister, or their own shadow.',
      look: { wear: [...HEAD, 'Hat_slouch', 'Bandana_neck', 'Moustache', 'Shirt', 'Vest', 'Duster', 'Cuffs', 'Chaps', ...LEGS], armor: false, under: 0x3a2c22, cloth: 0xb8a684 },
      persona: 'The Other Drifter knows every move the intruder knows. He guards against careless attacks and answers every mistake at once.',
      intro: 'He waits on the trail in a pale coat.', death: 'He sits down in the dust and the wind takes his hat.' },
  ],
  words: { road: 'the trail', fire: 'the campfire', stars: 'the stars', beacon: 'signal pole', anchor: 'spike', traveller: 'Drifter', bruteWeapon: 'sledge', cause: 'the lamp' /* the cause prop, by what it is */, sealWon: 'Ran {enemy} out', sealLost: 'Fell on the trail' },
  ui: { night: '#0d0906', cream: '#f0e2c8', ember: '#b8641e', serif: "'Zilla Slab', serif", font: 'Zilla+Slab:ital,wght@1,500;1,600' },
  fp: 'frontier', fpParts: ['hand', 'forearm', 'upper', 'leg'], sfx: null, companion: 'ember', camp: 'frontier',
  torch: { color: 0xffb070, power: 1.2, range: 12 },
};

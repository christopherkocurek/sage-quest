/* The Neon City: a wet city at night under one tower. Text only (server and client). The 3D side (lands, wardrobe, gear, boss dress, camp) is web/src/worlds/neon.js. Mechanics ids never change. */
/* the street foes' wear: dark soot, no rust, a cold dye on the cloth */
const GRIME = { k: [0.02, 0.12, 0.34, 0], mud: 0x121418, dye: 0x161a22 };
/* full cover under every look: tactical trousers, boots and gloves (no bare mannequin legs, arms or hands anywhere) */
const LEGS = ['Trousers', 'Boots'];
const KIT = [...LEGS, 'Gloves'];
const COURIER = ['Jacket', 'Hood_tech', 'Mask_cloth', 'Backpack', ...KIT];
/* a plain black bodysuit under the clothes (the dark world's mail under-layer reads medieval here) */
const SUIT = { bare: true, skin: 0x141518 };
/* the Tower company's people wear its livery: pale grey uniforms, red lit marks (a ring with a bar, the
   Tower's own head mark), red visors; the heroes stay dark with their own light. The cloth dye stays pale (no street soot). */
const CORP_GRIME = { k: [0.02, 0.06, 0.16, 0], mud: 0x121418, dye: 0xa8adb4 };

export default {
  id: 'neon', label: 'The Neon City', order: 1,
  fits: 'A megacity skyline of glass towers and neon at night, where skyscrapers fill the view, such as Hong Kong, Shanghai, Singapore, Dubai, Manhattan or Tokyo\'s towers. Fits a player whose days are screens or the night city (code, software, gaming, hacking, crypto, trading, clubs, a desk in a tower) only if their place allows it. Only the few cities whose skyline is a wall of skyscrapers fit. A big city whose centre is mostly mid-rise, a city of old stone streets, a low-rise city or a mid-size city does not fit.',
  /* wet climates take the rain district, dry and open ones the docks */
  lands: { drownedfen: 'rainline', vinewild: 'rainline', stormcoast: 'rainline', barrowmoor: 'rainline', deepwood: 'rainline',
           ashlands: 'dockyard', dusksteppe: 'dockyard', frostpass: 'dockyard' },
  landInfo: {
    rainline: { label: 'The Rain District', accent: 0x3ef2ff, fits: 'a street of black towers where the rain never stops' },
    dockyard: { label: 'The Dry Docks', accent: 0xffa040, fits: 'a container port under sodium lamps and cranes' },
  },
  /* the figure at the title camp before a body is chosen, and the companions (props/folk.js wears this look): a navy city parka
     with a fur-rimmed hood and lit reflective bands; its parts keep their own colours (folk.js tints only SQ_Cloth) */
  traveller: { wear: ['Parka', 'Mask_cloth', ...KIT], armor: false, cloth: 0x101218, ...SUIT },
  heroes: {
    knight: { label: 'The Bodyguard', look: { wear: ['Visor', 'Jacket_suit', 'Vest', ...KIT], armor: false, cloth: 0x34466a, /* a navy suit, not black on black */ ...SUIT },
      fits: 'A guard in a plated vest who stands between a client and harm. Fits a player who speaks of protecting family or others, loyalty, honour, duty, justice, being a parent or a leader.' },
    barbarian: { label: 'The Brawler', look: { wear: ['Tank', 'Sleeves', 'Wraps', 'Cap_knit', 'Mask_resp', 'Goggles', ...LEGS], armor: false, cloth: 0x6a2a26, /* an oxblood tank */ ...SUIT },
      fits: 'A street fighter with taped fists who trusts strength and nerve. Fits a player who speaks of anger, rage, strength, smashing, lifting, fighting, revenge, or being done with rules.' },
    mage: { label: 'The Netrunner', look: { wear: ['Coat_long', 'Hood_tech', 'Visor_band', ...KIT], armor: false, cloth: 0x382a5e, /* a violet coat */ ...SUIT },
      fits: 'A hacker in a long coat who bends the city\'s machines. Fits a player who speaks of knowledge, books, code, building things, science, curiosity, magic, spells, or outsmarting others.' },
    rogue: { label: 'The Courier', look: { wear: COURIER, armor: false, cloth: 0x644520, ...SUIT }, /* an ochre rider jacket */
      fits: 'A hooded rider who carries what nobody else will. Fits a player who speaks of freedom, money, gambling, trading, stealth, tricks, travel, or trusting nobody.' },
  },
  foes: {
    minion: { label: 'Runner', gear: 'neon_pipe', offhand: null, /* a company temp: hood, red visor band, the company windbreaker */
      look: { cls: 'thrall', grime: GRIME, armor: false, wear: ['Hood_tech', 'Band_corp', 'Jacket_corp', ...KIT], cloth: 0x24272d, ...SUIT }, /* a dark hood over the pale jacket: not the Suit's helmet */
      persona: 'Runners are street couriers paid by the hour. Alone they are cut down at once, so they rush in together and surround the intruder.' },
    warrior: { label: 'Suit', gear: 'neon_baton', offhand: 'neon_riot',
      look: { cls: 'guard', grime: CORP_GRIME, armor: false, wear: ['Mask_corp', 'Jacket_suit', 'Badge_corp', ...KIT], cloth: 0xaeb3ba, ...SUIT }, /* a pale company suit, a black tie; its own head (a pale mask, slick hair, black glasses with red slits), not the Enforcer's dome */
      persona: 'Suits are the Tower\'s security. They lose their contract if the intruder gets past them, so they press the attack and only guard when they are badly hurt.' },
    rogue: { label: 'Drone', gear: null, offhand: null, size: 1.0, fly: 0.5,
      look: { cls: 'stalker', grime: GRIME, armor: false, body: false, wear: ['Drone'] },
      persona: 'Drones are cunning machines. They win by striking the intruder from the side or the back, and they lose any fair fight from the front.' },
    brute: { label: 'Enforcer', gear: 'neon_hammer', offhand: null,
      look: { cls: 'brute', grime: GRIME, armor: false, wear: ['Helm_corp', 'Exo', 'Armor_corp', 'Tank', 'Sleeves', 'Wraps', ...LEGS], cloth: 0x14161a, ...SUIT }, /* the exo frame under the company's pale plate */
      persona: 'Enforcers are huge and slow, built into steel frames. Nothing frightens them. They walk straight at the intruder and never fall back.' },
  },
  foeNames: { minion: '{m}', warrior: 'Suited {m}', rogue: '{m} Drone', brute: 'Heavy {m}' },
  weapons: {
    sword: { label: 'Mono-blade', gear: 'neon_monoblade', offhand: null,
      fits: 'A one-handed mono-edge tech blade with a lit edge. Fits a player who asks for a sword, a blade, a katana, a classic or balanced weapon, or who wants to defend.' },
    greatsword: { label: 'Heat cleaver', gear: 'neon_cleaver',
      fits: 'A huge two-handed cleaver with a glowing heated edge. Fits a player who asks for a greatsword, a giant sword, a claymore, a dragon slayer, something huge, or the biggest sword.' },
    maul: { label: 'Hydraulic hammer', gear: 'neon_hammer',
      fits: 'A piston hammer on a steel pole. Fits a player who asks for a hammer, a maul, a mace, a club, a morning star, or who wants to crush, smash or break armour.' },
    axe: { label: 'Fire axe', gear: 'neon_fireaxe',
      fits: 'A red fire axe with a pick on the back. Fits a player who asks for an axe, a hatchet, a cleaver, a halberd, something brutal, or wants to cleave and chop.' },
    daggers: { label: 'Box-knife pair', gear: 'neon_boxknife', offhand: 'neon_boxknife',
      fits: 'Two long box knives. Fits a player who asks for daggers, knives, two weapons, something fast, light or silent, or wants to strike quickly.' },
    spear: { label: 'Shock pike', gear: 'neon_pike',
      fits: 'A long pike with a charged head. Fits a player who asks for a spear, a lance, a pike, a javelin, a trident, or wants to keep enemies at a distance.' },
    staff: { label: 'Stun staff', gear: 'neon_stunstaff',
      fits: 'A long staff with charged cells at both ends. Fits a player who asks for a staff, a wand, a rod, magic, spells, or a weapon that casts.' },
    pistol: { label: 'Stun pistol', gear: 'neon_stunner', ranged: 'stunner',
      fits: 'A stun pistol that fires charged bolts. Fits a player who asks for a gun, a pistol, a handgun, a blaster, a taser, a stun gun, a shock gun, a laser, a revolver, a sidearm, or who wants to shoot.' },
  },
  materials: { iron: 'Carbon steel', silver: 'Chrome', gold: 'Gold plate', bone: 'Ceramic', obsidian: 'Black glass' },
  /* each element has its own E-key mechanic (web/src/powers.js) */
  elements: {
    fire: { label: 'Heat', ability: 'Thermal burst', power: 'slam', abilityNote: 'a heat ring from the ground that throws everything near you back',
      fits: 'Heat along the edge. Fits a request that names fire, flame, heat, plasma, a reactor, an overload, an explosion, burning, lava, the sun, or a dragon.' },
    frost: { label: 'Coolant', ability: 'Cryo flood', power: 'chill', abilityNote: 'coolant floods the floor and freezes them; a heavy blow shatters them',
      fits: 'Coolant along the edge. Fits a request that names frost, ice, cold, coolant, cryo, liquid nitrogen, snow, freezing, or winter.' },
    storm: { label: 'Current', ability: 'EMP pulse', power: 'pulse', abilityNote: 'stops every blow being readied near you and drops drones',
      fits: 'Current along the edge. Fits a request that names lightning, electricity, current, voltage, an EMP, a pulse, hacking, shutting things down, sparks, or speed.' },
    shadow: { label: 'Static', ability: 'Ghost drone', power: 'summon', abilityNote: 'a stealth drone at your shoulder shoots your foes',
      fits: 'Static along the edge. Fits a request that names shadow, darkness, static, a ghost, a drone, a hacker, stealth, poison, death, a curse, or souls.' },
  },
  weaponNames: { fire: 'Redline', frost: 'Coldboot', storm: 'Overvolt', shadow: 'Blackout' },
  nemeses: [
    { id: 'tower', mech: 'lich', label: 'The Tower', bare: true, summon: 'rogue', size: 2.1, /* 2.1 x the knight: the core stands 13 m to its spire */
      fits: 'The tower that owns the city. Fits a player who mentions a company, a boss at work, an office, the system, a ruler, illness, the past, or a curse.',
      persona: 'The Tower is the city\'s oldest machine. It keeps its distance, lets its drones die first, and strikes when the intruder is busy.',
      intro: 'Every light in the Tower turns toward you.', death: 'Its lights go out, floor by floor. Then it falls.' },
    { id: 'other', mech: 'twin', label: 'The Other Courier', mirror: false, gear: 'neon_whip', offhand: null, /* its own cable whip, not a copy of the hero's weapon */
      fits: 'A copy of the player on the same route. Fits a player who mentions fighting themselves, doubt, fear, bad habits, a rival, an ex, a brother or sister, or their own shadow.',
      look: { wear: COURIER, armor: false, cloth: 0x0a0a0c, ...SUIT },
      persona: 'The Other Courier knows every move the intruder knows. It guards against careless attacks and answers every mistake at once.',
      intro: 'It wears your jacket. It knows your route.', death: 'The glass breaks. There is nobody inside it.' },
  ],
  words: { road: 'the street', fire: 'the barrel fire', stars: 'the city lights', beacon: 'pylon', anchor: 'pylon', traveller: 'Courier', cause: 'the orb', lure: 'the orb' /* the hover orb (not 'drone': the neon scout is a Drone) */, summon: 'The Tower sends its drones' },
  ui: { night: '#06070c', cream: '#e8f0f4', ember: '#3ef2ff', serif: "'Chakra Petch', sans-serif", font: 'Chakra+Petch:wght@500;600' },
  fp: 'neon', fpParts: ['hand', 'forearm', 'upper', 'leg'], sfx: null, companion: 'holo', camp: 'neon',
  props: { fire: 'barrel', anchor: 'pylon', beacon: 'signal' },
  torch: { color: 0xcfe6ff, power: 0.55, range: 12 },
};

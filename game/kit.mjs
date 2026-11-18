/* The kit: every part the quest can be assembled from.
   Authored before play. Sage2 picks from it at run time and never writes text.
   Every `fits` text ends with a "Fits ..." clause in the words a player would say. */

export const ARCHETYPES = [
  { id: 'knight', label: 'The Knight', model: 'Knight', hp: 12, speed: 5.2,
    fits: 'An armoured protector with honour and duty. Fits a player who speaks of protecting family or others, loyalty, honour, duty, justice, being a parent or a leader.' },
  { id: 'barbarian', label: 'The Barbarian', model: 'Barbarian', hp: 14, speed: 5.0,
    fits: 'A fierce fighter who trusts strength and nerve. Fits a player who speaks of anger, rage, strength, smashing, lifting, fighting, revenge, or being done with rules.' },
  { id: 'mage', label: 'The Mage', model: 'Mage', hp: 8, speed: 5.4,
    fits: 'A scholar who wields magic. Fits a player who speaks of knowledge, books, code, building things, science, curiosity, magic, spells, or outsmarting others.' },
  { id: 'rogue', label: 'The Rogue', model: 'Rogue_Hooded', hp: 9, speed: 6.2,
    fits: 'A hooded loner who works from the shadows. Fits a player who speaks of freedom, money, gambling, trading, stealth, tricks, travel, or trusting nobody.' },
];

export const BIOMES = [
  /* Narrow climates first: the land question takes the first match in this order. */
  { id: 'drownedfen', label: 'The Drowned Fen',
    sky: [0x060706, 0x3a3d38], fog: 0x2a2c29, ground: 0x2a2a22, accent: 0xc8ff6a, light: 0xc8ccc0,
    fits: 'A drowned fen of black water and dead trees. Fits a homeland that is low, wet and muggy: a swamp, a bayou, a marsh, wetlands, a river delta, mangroves, mosquitoes, sticky air.' },
  { id: 'vinewild', label: 'The Vinewild',
    sky: [0x040706, 0x34423c], fog: 0x242c28, ground: 0x2a3424, accent: 0x6affc0, light: 0xc8d4c8,
    fits: 'A jungle of giant trees, vines and sunken temples. Fits a homeland that is tropical and green all year: a rainforest, a jungle, monsoon season, palms, steamy air, the tropics near the equator.' },
  { id: 'barrowmoor', label: 'The Barrow Moor',
    sky: [0x07080c, 0x5a5e66], fog: 0x3a3e46, ground: 0x34342c, accent: 0xa8c4ff, light: 0xc8d0e0,
    fits: 'A cold moor of graves and a ruined keep. Fits a homeland that is cool, damp and overcast: moors, heath, peat bogs, mist, drizzle, standing stones, long chilly autumns.' },
  { id: 'dusksteppe', label: 'The Dusk Steppe',
    sky: [0x0e0a1a, 0xc0602a], fog: 0x6a3a2a, ground: 0x4a3a2a, accent: 0xffb050, light: 0xffc890,
    fits: 'Open grassland under a burning dusk. Fits a homeland of wide open plains: prairie, steppe, grassland, ranches, wheat and corn to the horizon, endless wind, big skies, tornadoes.' },
  { id: 'ashlands', label: 'The Ashlands',
    sky: [0x070304, 0x9a3a14], fog: 0x4a1c10, ground: 0x4a3a34, accent: 0xff5a1f, light: 0xffa468,
    fits: 'A burnt volcanic waste with embers in the air. Fits a homeland that is hot or dry: a desert, the south, scorching summers, drought, wildfire, a volcano, dust and sun.' },
  { id: 'frostpass', label: 'The Frost Pass',
    sky: [0x050912, 0x7fa3c8], fog: 0x4c6680, ground: 0x9fb0c0, accent: 0x7fd4ff, light: 0xbcd8f2,
    fits: 'A frozen mountain pass under snow. Fits a homeland that is cold or high: long winters, snow, ice, mountains, the far north, tundra.' },
  { id: 'deepwood', label: 'The Deepwood',
    sky: [0x040606, 0x2a3632], fog: 0x1a2220, ground: 0x3a4a34, accent: 0x9dff6a, light: 0xb4c4bc,
    fits: 'An ancient dark forest. Fits a homeland of trees and green country: forests, woods, farmland, hills, rivers, small towns, the countryside.' },
  { id: 'stormcoast', label: 'The Storm Coast',
    sky: [0x05060c, 0x3c4660], fog: 0x262c3c, ground: 0x444a60, accent: 0xb8a6ff, light: 0xb0b8d0,
    fits: 'Black sea cliffs under a thunderstorm. Fits a homeland by the sea or in the rain: a coast, a port, a harbour, an island, a beach city, rain and storms off the ocean.' },
];

export const WEAPONS = [
  { id: 'sword', label: 'Sword and shield', gear: 'sword', offhand: 'shield', cls: 'one', damage: 3, reach: 2.5, swing: 0.5, poise: 2,
    fits: 'A one-handed sword with a shield. Fits a player who asks for a sword, a blade, a shield, a classic or balanced weapon, or who wants to defend.' },
  { id: 'greatsword', label: 'Greatsword', gear: 'greatsword', cls: 'two', damage: 5, reach: 3.1, swing: 0.72, poise: 3.5,
    fits: 'A huge two-handed sword. Fits a player who asks for a greatsword, a giant sword, a claymore, a dragon slayer, something huge, or the biggest sword.' },
  { id: 'maul', label: 'Maul', gear: 'maul', cls: 'two', damage: 6, reach: 2.7, swing: 0.86, poise: 5,
    fits: 'A great iron hammer on a pole. Fits a player who asks for a hammer, a maul, a mace, a club, a morning star, or who wants to crush, smash or break armour.' },
  { id: 'axe', label: 'War axe', gear: 'axe', cls: 'two', damage: 5, reach: 2.7, swing: 0.74, poise: 3.5,
    fits: 'A bearded two-handed axe. Fits a player who asks for an axe, a hatchet, a cleaver, a halberd, something brutal, or wants to cleave and chop.' },
  { id: 'daggers', label: 'Twin daggers', gear: 'dagger', offhand: 'dagger', cls: 'dual', damage: 2, reach: 2.0, swing: 0.3, poise: 1,
    fits: 'Two fast daggers. Fits a player who asks for daggers, knives, two weapons, something fast, light or silent, or wants to strike quickly.' },
  { id: 'spear', label: 'Spear', gear: 'spear', cls: 'pole', damage: 4, reach: 3.7, swing: 0.52, poise: 2.5,
    fits: 'A long spear with a sharp head. Fits a player who asks for a spear, a lance, a pike, a javelin, a trident, or wants to keep enemies at a distance.' },
  { id: 'staff', label: 'War staff', gear: 'staff', cls: 'pole', damage: 4, reach: 3.3, swing: 0.6, poise: 2.5,
    fits: 'A long staff that carries magic. Fits a player who asks for a staff, a wand, a rod, magic, spells, or a weapon that casts.' },
  /* ranged weapons. `extra: true` = offered to Sage2 only in a world whose entry names the id in its `weapons`
     (game/questions.mjs forgeQuestions); the dark world offers none. `ranged` = the profile in web/src/ranged.js (shots,
     tell, reload, falloff); damage, reach, swing and poise are the melee blow it also makes (a pistol-whip, a rifle butt). */
  { id: 'pistol', label: 'Pistol', gear: 'frontier_revolver', cls: 'one', damage: 1.6, reach: 2.2, swing: 0.4, poise: 1.6, ranged: 'revolver', extra: true,
    fits: 'A six-shot pistol. Fits a player who asks for a pistol, a revolver, a six-shooter, a handgun, a gun, a sidearm, or wants to shoot.' },
  { id: 'rifle', label: 'Rifle', gear: 'frontier_rifle', cls: 'one', damage: 2.4, reach: 2.6, swing: 0.56, poise: 2.6, ranged: 'rifle', extra: true,
    fits: 'A repeating rifle. Fits a player who asks for a rifle, a carbine, a long gun, a shotgun, a hunting rifle, or wants to shoot from far away.' },
  { id: 'bow', label: 'Bow', gear: 'storybook_bow', cls: 'one', damage: 1.4, reach: 2.3, swing: 0.46, poise: 1.2, ranged: 'bow', extra: true,
    fits: 'A longbow and arrows. Fits a player who asks for a bow, a longbow, arrows, archery, a crossbow, or wants to shoot from far away.' },
];

export const MATERIALS = [
  { id: 'iron', label: 'Iron', color: 0x5d6168, metal: 0.95, rough: 0.42,
    fits: 'Plain dark iron or steel. Fits a request that names iron, steel, or names no material at all.' },
  { id: 'silver', label: 'Silver', color: 0xe6edf5, metal: 1.0, rough: 0.12,
    fits: 'Bright polished silver. Fits a request that names silver, mithril, moonlight, white metal, chrome, mirror, or platinum.' },
  { id: 'gold', label: 'Gold', color: 0xf2c14e, metal: 1.0, rough: 0.25,
    fits: 'Bright gold. Fits a request that names gold, golden, sunlight, treasure, a crown, royal, or holy.' },
  { id: 'bone', label: 'Dragonbone', color: 0xe9e2cf, metal: 0.1, rough: 0.8,
    fits: 'Pale carved bone. Fits a request that names bone, dragon, dragonbone, fang, tooth, claw, skull, or a beast.' },
  { id: 'obsidian', label: 'Obsidian', color: 0x1a1420, metal: 0.6, rough: 0.15,
    fits: 'Black volcanic glass. Fits a request that names obsidian, black, dark, glass, night, void, or shadow steel.' },
];

export const ELEMENTS = [
  /* power = the E-key mechanic in web/src/powers.js (breath chill bolt mark summon ward rain dash slam pulse bomb vortex wall);
     a world gives each of its four elements a different one */
  { id: 'fire', label: 'Fire', color: 0xff5a1f, ability: 'Firebreath', power: 'breath', abilityNote: 'a cone of flame you hold on them; it sets them burning',
    fits: 'Flame along the edge. Fits a request that names fire, flame, burning, ember, lava, heat, the sun, breathing fire, or a dragon.' },
  { id: 'frost', label: 'Frost', color: 0x7fd4ff, ability: 'Whiteout', power: 'chill', abilityNote: 'freezes the foes round you; a heavy blow shatters them',
    fits: 'Ice along the edge. Fits a request that names frost, ice, cold, snow, freezing, shattering, or winter.' },
  { id: 'storm', label: 'Storm', color: 0xb8a6ff, ability: 'Chain lightning', power: 'bolt', abilityNote: 'a bolt you aim; it jumps from foe to foe',
    fits: 'Lightning along the edge. Fits a request that names lightning, thunder, storm, electricity, sparks, or speed.' },
  { id: 'shadow', label: 'Shadow', color: 0x7a3cff, ability: 'Blood mark', power: 'mark', abilityNote: 'marks one foe; your next heavy blow on it bursts',
    fits: 'Dark smoke along the edge. Fits a request that names shadow, darkness, poison, death, a curse, a mark, souls, or blood.' },
];

export const NEMESES = [
  { id: 'dragon', label: 'The Hollow Dragon',
    fits: 'A great dragon. Fits a player who mentions a dragon, a monster, a beast, fire, flying, a boss, greed, or something huge to slay.' },
  { id: 'lich', label: 'The Lich King',
    fits: 'An undead sorcerer king. Fits a player who mentions death, illness, the dead, ghosts, the past, a ruler, a boss at work, a king, or a curse.' },
  { id: 'giant', label: 'The Giant',
    fits: 'A towering giant. Fits a player who mentions a giant, a bully, something bigger than them, a mountain to climb, a company, or an unfair fight.' },
  { id: 'twin', label: 'The Dark Twin',
    fits: 'A dark copy of the player. Fits a player who mentions fighting themselves, doubt, fear, bad habits, a rival, an ex, a brother or sister, or their own shadow.' },
];

export const MOTIVES = [
  { id: 'protect', label: 'To protect', fits: 'Fights to keep someone safe from harm or to provide for them. Fits words of guarding, caring for, feeding or sheltering a person, a pet or a home, or someone who is sick, weak, young, old or in need. A name with no reason also fits.' },
  { id: 'revenge', label: 'For revenge', fits: 'Fights to pay back a wrong. Fits words of loss, death, harm done, a betrayal, something taken, anger, or making someone pay, even when the player names the one who was wronged.' },
  { id: 'glory', label: 'For glory', fits: 'Fights to prove themselves. Fits words of fame, winning, rising, being the best, making someone proud, being seen, money, success or a title, even when the player names who will watch.' },
  { id: 'freedom', label: 'For freedom', fits: 'Fights to get out and be free. Fits words of escape, leaving, being trapped, quitting, no master or boss, the open road, choosing their own way, or being left alone, even when the player names who comes along.' },
  { id: 'wonder', label: 'For wonder', fits: 'Fights to see and learn what is out there. Fits words of curiosity, exploring, new paths, far places, learning, building, making or discovery, even when the player names who shares it.' },
];

/* What the enemy sends down the road. Chosen from the player's own words about what stands in their way. */
export const MINIONS = [
  { id: 'clerks', one: 'Clerk', many: 'Clerks', fits: 'Fits an enemy that is an office, bureaucracy, paperwork, a system.' },
  { id: 'debts', one: 'Debt', many: 'Debts', fits: 'Fits an enemy that is money: rent, loans, bills, being broke, the price of things.' },
  { id: 'doubts', one: 'Doubt', many: 'Doubts', fits: 'Fits an enemy inside the player: self-doubt, fear, anxiety, feeling like a fraud, putting things off, their own head, themselves.' },
  { id: 'ghosts', one: 'Ghost', many: 'Ghosts', fits: 'Fits an enemy from the past: an ex, grief, a loss, a memory, regret, someone who died.' },
  { id: 'hounds', one: 'Hound', many: 'Hounds', fits: 'Fits an enemy that chases or pressures: a bully, a rival, a competitor, a predator.' },
  { id: 'watchers', one: 'Watcher', many: 'Watchers', fits: 'Fits an enemy that judges: parents, expectations, society, critics, social media, being watched or compared.' },
  { id: 'chains', one: 'Chain', many: 'Chains', fits: 'Fits an enemy that binds: a habit, a trap, a dead-end job, being stuck.' },
  { id: 'plagues', one: 'Ache', many: 'Aches', fits: 'Fits an enemy in the body: an illness, pain, an injury, tiredness, burnout.' },
  { id: 'hours', one: 'Hour', many: 'Hours', fits: 'Fits an enemy that is time: deadlines, getting older, too little time, the clock.' },
  { id: 'liars', one: 'Liar', many: 'Liars', fits: 'Fits an enemy that deceives: betrayal, lies, a cheat, fake people, a broken promise.' },
  { id: 'thralls', one: 'Thrall', many: 'Thralls', fits: 'Fits anything else: a monster, a villain, an unnamed evil, or no clear enemy.' },
];

/* Chapter II ends with one question: why do you go on? The answer picks the gift the hero carries to the enemy. */
export const RESOLVES = [
  { id: 'love', label: 'For them', boon: 'Their light', plainBoon: 'Not alone' /* outside the dark world */, note: 'you rise once from a killing blow',
    fits: 'Goes on for a person, a pet or a home. Fits an answer that names someone, a promise to someone, people who wait, family, or love.' },
  { id: 'wrath', label: 'Out of anger', boon: 'Fury', note: 'your blows land harder and your power returns faster',
    fits: 'Goes on out of anger. Fits an answer about rage, hate, payback, making it pay, or refusing to forgive.' },
  { id: 'defiance', label: 'Out of pride', boon: 'Quick feet', note: 'you dodge more often and strike true after each dodge',
    fits: 'Goes on because quitting is not an option. Fits an answer about pride, stubbornness, proving someone wrong, never giving up, or refusing to lose.' },
  { id: 'duty', label: 'Out of duty', boon: 'Iron guard', note: 'your guard returns fast and your parry is wider',
    fits: 'Goes on because it must be done. Fits an answer about responsibility, a job to finish, no other choice, discipline, or because nobody else will.' },
  { id: 'hope', label: 'Out of hope', boon: 'Second wind', note: 'you are healed and your wounds close with time',
    fits: 'Goes on because it can be better. Fits an answer about the future, a dream, faith, curiosity, a better life, or wanting to see what comes next.' },
];
export const RESOLVE_BY_MOTIVE = { protect: 'love', revenge: 'wrath', glory: 'defiance', freedom: 'defiance', wonder: 'hope' };

export const BUILD_LEVELS = [
  { level: 1, description: 'Slim. Seated or mental work most of the day: desk work, study, screens, reading.' },
  { level: 2, description: 'Lean. Light movement: walking, running, travel, craft, light sport.' },
  { level: 3, description: 'Strong. Physical training or work: the gym, sport, building, farming, martial arts.' },
  { level: 4, description: 'Mighty. Very heavy physical work: heavy lifting, strongman work, hard labour every day.' },
];
export const BUILD_LABELS = ['', 'Slim', 'Lean', 'Strong', 'Mighty'];
export function ageBand(year, now = new Date().getFullYear()) {
  if (!year) return null;
  const age = now - year;
  if (age < 0 || age > 120) return null;
  return { age, label: age < 25 ? 'Younger' : age < 40 ? 'Mid-life' : age < 60 ? 'Older' : 'Eldest' };
}

export const TONE_LEVELS = [
  { level: 1, description: 'Bleak and brutal. The player sounds bitter, hurt, angry or hopeless.' },
  { level: 2, description: 'Grim. The player sounds serious, tired or tense.' },
  { level: 3, description: 'Even. The player sounds calm and matter-of-fact.' },
  { level: 4, description: 'Warm. The player sounds hopeful, kind or excited.' },
  { level: 5, description: 'Bright and playful. The player jokes, laughs or sounds delighted.' },
];

/* Foes. The persona gives real stakes: Sage2 follows a persona literally. */
export const FOES = [
  { id: 'warrior', label: 'Hollow Guard', gear: 'sword', offhand: 'shield', look: { helm: 'great', cloak: true, tabard: true }, hp: 14, poise: 6, damage: 2, speed: 3.3, reach: 2.3, blocks: true,
    attacks: ['slashA', 'slashB', 'bash', 'combo'],
    persona: 'Hollow Guards are disciplined soldiers. They are destroyed for good if the intruder gets past them, so they press the attack and only guard when they are badly hurt.' },
  { id: 'minion', label: 'Hollow Thrall', gear: 'axe', size: 0.92, look: { helm: 'kettle', pauldrons: false, cloak: false, tabard: true, steel: 0xa39684 }, hp: 7, poise: 3, damage: 1, speed: 4.3, reach: 2.1,
    attacks: ['slashA', 'chop', 'scratch'],
    persona: 'Hollow Thralls are weak and reckless. Alone they die at once, so they rush in together and surround the intruder.' },
  { id: 'rogue', label: 'Hollow Stalker', gear: 'dagger', offhand: 'dagger', size: 0.96, look: { helm: 'hood', cloak: true, tabard: false, steel: 0x6f7480 }, hp: 10, poise: 4, damage: 2, speed: 5.2, reach: 2.0, dodges: true,
    attacks: ['hook', 'dash', 'slashB'],
    persona: 'Hollow Stalkers are cunning. They win by striking the intruder from the side or the back, and they lose any fair fight from the front.' },
  { id: 'brute', label: 'Hollow Brute', gear: 'maul', size: 1.5, look: { helm: 'sallet', heavy: true, cloak: false, tabard: true, steel: 0x7d7468 }, hp: 34, poise: 12, damage: 3, speed: 2.6, reach: 3.3, armor: true,
    attacks: ['smash', 'chop', 'sweep'],
    persona: 'Hollow Brutes are huge and slow. Nothing frightens them. They walk straight at the intruder and never fall back.' },
];

/* The nemesis in person. Same knight kit, other scale, parts and moves. */
export const BOSSES = [
  /* size = BOSS_SCALE in web/src/bosses.js; reach is per unit of size (reach x size = metres); dressBoss(actor, id) sets the full look */
  { id: 'giant', label: 'The Giant', boss: true, gear: 'maul', size: 3.3, /* 2.7 -> 3.3, a giant in the fight as on the horizon (BOSS_SCALE in bosses.js) */ look: { helm: 'giant', giant: true, horns: true, cloak: false, tabard: true, steel: 0xb2aca2, cloth: 0x1b1512 },
    hp: 170, poise: 26, damage: 1.7, speed: 3.0, reach: 1.55 /* 1.85 -> 1.55 so the reach stays about 5.1 m at size 3.3 */, armor: true, attacks: ['quake', 'sweep', 'smash'], /* damage 2 -> 1.7 (the quake hits for 2, not 3) */
    persona: 'The Giant is enormous and certain of its victory. It never retreats and never guards. It walks at the intruder and breaks the ground.' },
  { id: 'lich', label: 'The Lich King', boss: true, gear: 'staff', size: 1.25, look: { helm: 'hood', shroud: true, sleeves: true, boneHands: true, ironCrown: true, body: false, robe: false, crown: false, cloak: false, tabard: false, pauldrons: false, steel: 0x55607a, cloth: 0x0b0910 },
    hp: 170, poise: 14, damage: 2, speed: 3.0, reach: 2.6, attacks: ['slashB', 'chop'], ranged: 'bolt', blinks: true, summons: true,
    persona: 'The Lich King is ancient and patient. It keeps its distance, lets its servants die first, and strikes when the intruder is busy.' },
  { id: 'twin', label: 'The Dark Twin', boss: true, gear: 'sword', size: 1.0, look: { helm: 'great', cloak: true, tabard: true, steel: 0x2b2d33, cloth: 0x0a0a0c },
    hp: 190, poise: 12, damage: 2, speed: 5.0, reach: 2.4, blocks: true, dodges: true, attacks: ['slashA', 'slashB', 'combo', 'dash', 'hook'],
    persona: 'The Dark Twin knows every move the intruder knows. It guards against careless attacks and answers every mistake at once.' },
];

/* Tactics a foe group may take. Code executes them. `when` holds the legal test. */
export const TACTICS = [
  { id: 'call', label: 'Call for help',
    fits: 'Shriek for reinforcements. Fits only when reinforcements are available and the group has lost half of its members or more.' },
  { id: 'retreat', label: 'Fall back',
    fits: 'Back away out of reach to survive. Fits only when the group has one member left and the group is badly hurt.' },
  { id: 'feint', label: 'Feint',
    fits: 'Step in, step back, then strike to break the guard. Fits when the intruder is blocking and the distance is close.' },
  { id: 'flank', label: 'Flank',
    fits: 'Split up and circle to strike from the side and the back. Fits when the group has two or more members left and the intruder is blocking or standing still.' },
  { id: 'guard', label: 'Guard',
    fits: 'Raise weapons, hold the line and strike back after the intruder attacks. Fits when the intruder is swinging a weapon and the distance is close, or when the group is hurt and the intruder is at full health.' },
  { id: 'charge', label: 'Charge',
    fits: 'Run straight at the intruder and strike. Fits when the intruder is far away, moving, dodging or hurt, and whenever no other tactic fits.' },
];

/* Verbs the player may speak in play. Each selects an extraction schema. */
export const VERBS = [
  { id: 'forge', label: 'Forge',
    fits: 'Make, forge, craft, build or ask for a weapon or armour. Fits speech that names a weapon, a material, an element, or says make me, forge, craft, give me, I want a.',
    schema: {
      item: 'The weapon or object the player asks for, in their own words.',
      material: 'The material or substance it is made of, in their own words.',
      element: 'The power, element or magic it carries, in their own words.',
    } },
  { id: 'fight', label: 'Fight',
    fits: 'Start or continue a fight. Fits speech that says attack, fight, kill, charge, bring them on, send enemies, I am ready, or let us go.',
    schema: { target: 'Who or what the player wants to fight, in their own words.' } },
  { id: 'talk', label: 'Talk',
    fits: 'Speak to a character in the world. Fits speech that greets, asks a character a question, bargains, threatens, or addresses someone by name.',
    schema: { target: 'Who the player speaks to.', topic: 'What the player asks or says to them.' } },
  { id: 'travel', label: 'Travel',
    fits: 'Go somewhere else. Fits speech that says go to, walk to, travel, leave, take me to, onward, or names a place to reach.',
    schema: { place: 'The place the player wants to go to, in their own words.' } },
  { id: 'ask', label: 'Ask the world',
    fits: 'Ask about the quest itself. Fits speech that asks what now, where am I, what is this, what can I do, help, or how do I play.',
    schema: { topic: 'What the player wants to know.' } },
];

/* Director beats. */
export const BEATS = [
  { id: 'reinforce_thralls', label: 'A pack of Hollow Thralls pours in',
    fits: 'Send four weak, fast enemies. Fits when the player won the last wave quickly and lost little health.' },
  { id: 'reinforce_stalkers', label: 'Hollow Stalkers slip out of the fog',
    fits: 'Send two cunning flankers. Fits when the player blocked a lot or fought carefully and has medium health.' },
  { id: 'reinforce_guard', label: 'A Hollow Guard captain steps forward',
    fits: 'Send one strong armoured enemy. Fits when the player has high health and has killed many enemies.' },
  { id: 'rest', label: 'The field falls quiet',
    fits: 'Send nobody and let the player breathe. Fits when the player is badly hurt, at low health, or has already fought two waves.' },
  { id: 'reinforce_brute', label: 'A Hollow Brute drags a maul onto the road',
    fits: 'Send one huge, slow, heavily armoured enemy. Fits when the player has high health and won the last wave without taking any damage.' },
];

export const byId = (list, id) => list.find((x) => x.id === id) || null;

/* Western zodiac from a YYYY-MM-DD date. Code only: no model call. */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/* A spoken birthday with no year: "November 10th". Code only. */
export function monthDay(text) {
  const t = String(text || '').toLowerCase();
  const mi = MONTHS.findIndex((m) => t.includes(m) || new RegExp(`\\b${m.slice(0, 3)}\\b`).test(t));
  const d = /\b([0-3]?\d)(?:st|nd|rd|th)?\b/.exec(t.replace(/\b(19|20)\d\d\b/g, ''));
  if (mi < 0 || !d) return null;
  const day = Number(d[1]);
  return day >= 1 && day <= 31 ? { month: mi + 1, day } : null;
}
const SIGNS = [
  ['Capricorn', 1, 19], ['Aquarius', 2, 18], ['Pisces', 3, 20], ['Aries', 4, 19], ['Taurus', 5, 20], ['Gemini', 6, 20],
  ['Cancer', 7, 22], ['Leo', 8, 22], ['Virgo', 9, 22], ['Libra', 10, 22], ['Scorpio', 11, 21], ['Sagittarius', 12, 21], ['Capricorn', 12, 31],
];
export function signOf(iso, md = null) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso || '');
  if ((!m || !m[3]) && !md) return null;
  const mo = m && m[3] ? Number(m[2]) : md.month;
  const d = m && m[3] ? Number(m[3]) : md.day;
  for (const [name, sm, sd] of SIGNS) if (mo < sm || (mo === sm && d <= sd)) return name;
  return null;
}
export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

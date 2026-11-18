/* Builds every Sage2 question from the kit. Only the server imports this. */
import { ARCHETYPES, BIOMES, MOTIVES, TONE_LEVELS, BUILD_LEVELS, TACTICS, BEATS, RESOLVES, MINIONS, byId } from './kit.mjs';
import { WORLDS, kitFor } from './worlds.mjs';

const opts = (list) => list.map((x) => ({ option: x.id, description: x.fits }));
const order = (list) => list.map((x) => x.id).join(', ');

/* The character build, one question per step (like a character screen).
   live  = standing questions on the answer while the player speaks.
   final = asked once on the finished answer, beside the extract call.
   Each step sees only its own answer, so a birthday can never choose the land.
   the order people expect: name, where from, when born. */
export const STEPS = [
  { id: 'name', ask: 'What is your name?', hint: 'Say it, or say what they call you.',
    extract: { name: "The player's own name or nickname, as they say it." } },
  { id: 'origin', ask: 'Where are you from?', hint: 'Name the place. Say what the land and the weather are like.',
    live: () => [{ id: 'biome', kind: 'choice',
      instructions: `A player says where they are from. Which land is closest to that homeland? Judge by the real climate and landscape of the place they name and by what they say about it. If more than one fits, the first of this list wins: ${order(BIOMES)}.`,
      options: opts(BIOMES) }],
    /* the world is decided HERE, on the place alone, in the same batch as the land: the land that is shown
       is then the land of the final world, and no world card cuts in at a later step */
    world: () => [worldQuestion()],
    extract: { place: 'The name of the city, region or country the player is from, as written.' } },
  { id: 'born', ask: 'When were you born?', hint: 'Day, month and year.',
    extract: { birth_date: { type: 'date', definition: "The player's date of birth." }, birthday: 'The day and month of the birthday, as written.' } },
  { id: 'body', ask: 'How do you spend your days?', hint: 'Your work, your training, what your hands know.',
    live: () => [{ id: 'archetype', kind: 'choice',
      instructions: `A player describes how they spend their days. Which hero are they? If more than one fits, the first of this list wins: ${order(ARCHETYPES)}.`,
      options: opts(ARCHETYPES) }],
    final: () => [{ id: 'build', kind: 'scale', instructions: 'A player describes how they spend their days. How physical is their daily life?', levels: BUILD_LEVELS }],
    extract: { trade: "The player's work or main activity, in their own words." } },
  { id: 'heart', ask: 'Who do you fight for?', hint: 'Name them. Or say what you want most.',
    live: () => [{ id: 'motive', kind: 'choice',
      instructions: 'A player says who or what they fight for. Why do they fight? Judge by the reason in their words, not by whether they name a person or a pet: a name alone does not mean protect. If no reason is given, choose protect. If more than one fits, the first of this list wins: revenge, freedom, glory, wonder, protect.',
      options: opts(MOTIVES) }],
    extract: { companions: ['Each named pet, child, partner, friend or family member the player mentions, as written.'], desire: 'The thing the player says they want most, in their own words.' } },
  { id: 'enemy', ask: 'What stands in your way?', hint: 'A person, a fear, a thing. Name it.',
    live: (K = kitFor('dark')) => [{ id: 'nemesis', kind: 'choice',
      instructions: `A player names what stands in their way. What is their great enemy? If more than one fits, the first of this list wins: ${order(K.NEMESES)}.`,
      options: opts(K.NEMESES) }],
    final: () => [{ id: 'tone', kind: 'scale', instructions: 'How does the player sound as they speak about what stands in their way?', levels: TONE_LEVELS },
      { id: 'minions', kind: 'choice',
        instructions: `A player names what stands in their way. Their great enemy sends servants down the road. What are the servants? If more than one fits, the first of this list wins: ${order(MINIONS)}.`,
        options: opts(MINIONS) }],
    extract: { enemy: 'The person or thing that stands in the way of the player, in their own words.' } },
];
export const stepById = (id) => STEPS.find((s) => s.id === id) || null;
export const stepContent = (step, answer) => `Question: ${step.ask}\nAnswer: ${answer}`;

/* The world: asked once on the origin step, on the place the player names (and whatever they say about their life there). */
export function worldQuestion() {
  return { id: 'world', kind: 'choice',
    instructions: `A player says where they are from, and may say how they spend their days. Which world suits this player? Judge first by the place, its climate and its landscape: a world whose land clashes with the homeland the player describes does not fit, whatever their work. Their days decide only between worlds that the place allows. If more than one fits, the first of this list wins: ${order(WORLDS)}. If none fits, choose dark.`,
    options: opts(WORLDS) };
}

/* Map the player's own words onto kit parts. */
export function forgeQuestions(world = 'dark') {
  const K = kitFor(world); const { MATERIALS, ELEMENTS } = K;
  /* a ranged weapon (kit `extra`) is an option only where the world entry names it: frontier revolver and rifle,
     neon stun pistol, edo yumi, storybook longbow. Melee stays first, so a tie goes to the blade. */
  const own = K.world?.weapons || {};
  const WEAPONS = K.WEAPONS.filter((w) => !w.extra || own[w.id]);
  return [
    { id: 'weapon', kind: 'choice',
      instructions: `A player asks a smith for a weapon. Which weapon do they get? If more than one fits, the first of this list wins: ${order(WEAPONS)}.`,
      options: opts(WEAPONS) },
    { id: 'material', kind: 'choice',
      instructions: 'A player asks a smith for a weapon. Which material is it made of? If more than one fits, the first of this list wins: silver, gold, bone, obsidian, iron.',
      options: opts(['silver', 'gold', 'bone', 'obsidian', 'iron'].map((id) => byId(MATERIALS, id))) },
    { id: 'element', kind: 'choice',
      instructions: `A player asks a smith for a weapon. Which power does it carry? If more than one fits, the first of this list wins: ${order(ELEMENTS)}.`,
      options: opts(ELEMENTS) },
  ];
}

/* the weapon step's own read of the answer, beside the forge questions in the same batch. So an answer that is not a weapon ("mozzarella", "my bare hands", "I don't know") still gets one.
   The client: weapon -> the forge picks; thing -> the closest weapon, made of or named for the player's word;
   ready -> start the quest (when a weapon exists); none -> the world's default weapon. */
export const WEAPON_ASK = 'The smith asks: what do you carry into the fight?';
export function answerQuestion() {
  return { id: 'answer', kind: 'choice',
    instructions: 'A smith asks the player what weapon they carry into the fight. What kind of answer did the player give? If more than one fits, the first of this list wins: weapon, thing, ready, none.',
    options: [
      { option: 'weapon', description: 'Names a weapon or asks for one, in any language, or describes one: what it is made of, its power, its size or its style.' },
      { option: 'thing', description: 'Names an object, a food, an animal, a plant, a material or another real thing that is not a weapon.' },
      { option: 'ready', description: 'Says they are ready, done, or want to go, start, leave or fight now, without naming a weapon.' },
      { option: 'none', description: 'Names no weapon and no thing: bare hands, fists, nothing, I do not know, a question, a feeling or an idea, a person\'s name, a joke, an insult, gibberish or an empty answer.' },
    ] };
}

/* The options are the player's own words, extracted earlier. */
export function namingQuestion(mentions, revision) {
  const options = mentions.slice(0, 24).map((m, i) => ({ option: `m${i}`, description: `The player mentioned: ${m.text} (${m.kind}).` }));
  options.push({ option: 'none', description: 'Nothing the player mentioned is dear enough to name a weapon after.' });
  return { id: `name_r${revision}`, kind: 'choice',
    instructions: 'A hero names their weapon after the one thing they hold most dear. Which of these does this player hold most dear? A loved person or pet wins over a place. A place wins over nothing.',
    options };
}

/* Enemy tactics: one request per group. */
export function tacticQuestion(legal) {
  const list = TACTICS.filter((t) => legal.includes(t.id));
  return { id: 'tactic', kind: 'choice',
    instructions: `These creatures guard the road against an intruder. Which tactic do they take now? Judge by the facts given. If more than one fits, the first of this list wins: ${list.map((t) => t.id).join(', ')}.`,
    options: opts(list) };
}

/* Director: standing questions on the run's event log. */
export function directorQuestions() {
  return [
    { id: 'beat', kind: 'choice',
      instructions: `This is the event log of one player's fight. A wave has just ended. What happens next? Judge by the player's health and how the last wave went. If more than one fits, the first of this list wins: rest, reinforce_brute, reinforce_guard, reinforce_stalkers, reinforce_thralls.`,
      options: opts([BEATS[3], BEATS[4], BEATS[2], BEATS[1], BEATS[0]]) },
    { id: 'pressure', kind: 'scale',
      instructions: 'How hard is this fight for the player right now?',
      levels: [
        { level: 1, description: 'Easy. The player is at high health and kills quickly.' },
        { level: 2, description: 'Fair. The player trades blows and holds steady.' },
        { level: 3, description: 'Hard. The player is losing health fast or is at low health.' },
      ] },
  ];
}

/* Chapter II: the vow. Choice and Extract on one spoken answer. */
export const VOW_ASK = 'The enemy has taken what you fight for. Why do you go on?';
export function vowQuestions() {
  return [{ id: 'resolve', kind: 'choice',
    instructions: `A player in a dark quest stands before their last fight. They answer one question about why they fight. What drives them? If more than one fits, the first of this list wins: ${order(RESOLVES)}.`,
    options: opts(RESOLVES) }];
}
export const VOW_EXTRACT = { vow: 'The reason the player gives for going on, in their own words, as written.' };

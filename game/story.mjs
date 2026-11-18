/* The quest in three chapters, told with the player's own words. Pure text: no model writes any of it.
   The Road -> The Taking (the enemy takes what the hero fights for; the hero says why they go on) -> The Enemy. */

const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const short = (t, n = 90) => { const s = String(t || '').trim().replace(/\s+/g, ' '); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const quote = (t, n) => (t ? `“${short(t, n)}”` : '');
/* the hero's vow as speech: “The road home,” you roar. The verb follows the resolve Sage2 heard (game/kit.mjs RESOLVES) */
const SAYS = { love: ['promise', 'promised'], wrath: ['roar', 'roared'], defiance: ['shout', 'shouted'], duty: ['swear', 'swore'], hope: ['whisper', 'whispered'], say: ['say', 'said'] };
const RESOLVE_ID = { 'for them': 'love', 'out of anger': 'wrath', 'out of pride': 'defiance', 'out of duty': 'duty', 'out of hope': 'hope' };
const speech = (words, tail) => { const v = short(words, 70).replace(/[.,;:…]+$/, ''); return `“${v}${/[!?]$/.test(v) ? '' : ','}” ${tail}.`; };

/* What the enemy takes, by the reason the hero fights. A hero who named loved ones always loses those. */
const STAKES = {
  /* plain nouns ("your people", "your home"), not abstractions ("the ones you guard", "your peace"). `flame` is matched in
     web/src/questprops.js CAUSES: do not change it */
  protect: { what: 'your people', flame: 'Hearth', leave: 'People at home need help.', verb: 'takes', free: 'are free', many: true },
  revenge: { what: 'your home', flame: 'The debt', leave: 'There is a debt to collect.', verb: 'takes', free: 'is safe again' },
  glory: { what: 'your name', flame: 'Your name', /* a cause, not the hero's own name */ leave: 'Time to make a name.', verb: 'takes', free: 'is known' },
  freedom: { what: 'the open road', flame: 'The open road', leave: 'Nobody owns this road.', verb: 'chains', free: 'is free again' }, /* not "the open road is open" */
  wonder: { what: 'the stars', flame: 'The far light', leave: 'Something waits past the last hill.', verb: 'puts out', free: 'are back' },
};
/* what still waits when the hero falls, by stake (a loved one's name takes its place) */
const WAITS = { protect: 'Your people are still waiting.', revenge: 'The debt is not paid.', glory: 'Nobody knows the name yet.', freedom: 'The road is still chained.', wonder: 'The stars are still out.' };
/* the chapter II task as a deed in the past tense, for the card (the scene's own "Half the debt is paid." is a
   progress line and read wrong on the card after "The debt is paid.") */
const PAST = { Hold: 'held', Kill: 'killed', Beat: 'beat', Break: 'broke', Light: 'lit', Cut: 'cut', Burn: 'burned', Bring: 'brought', Find: 'found', Walk: 'walked', Follow: 'followed', Run: 'ran', Hunt: 'hunted', Free: 'freed', Tear: 'tore', Smash: 'smashed', Topple: 'toppled', Douse: 'doused', Raise: 'raised', Guard: 'guarded', Defend: 'defended', Stop: 'stopped', Keep: 'kept', Stand: 'stood by' };
const past = (goal) => { const m = /^(\w+)\s+(.*)$/.exec(String(goal || '')); if (!m) return null; const v = PAST[m[1]]; return v ? `${v} ${m[2]}` : null; };

/* The quest takes one of five shapes, by what the hero fights for. Each has its own second chapter, with its own task. */
export const SHAPES = {
  /* each chapter line gives the task and its reason in one go; titles name the thing in the chapter */
  protect: { id: 'vigil', title: 'The Fire',
    /* chapter I is a walk (web/src/journey.js): the hero takes the companions to a safe fire and gathers its wood on the way */
    first: { id: 'hearth', title: 'The Road Home', line: (t) => (t.loved ? `Walk ${t.taken} to the fire. Pick up ${t.kn} on the way.` : `Pick up ${t.kn} on the way, then light the fire.`), goal: (t) => (t.loved ? `Walk ${t.many ? 'them' : t.taken} to the fire` : `Gather ${t.kn} for the fire`), /* no "them" with nobody named */ deed: (t) => (t.loved ? `walked ${t.many ? 'them' : t.taken} to the fire` : 'lit the fire'), journey: true }, /* the deed names who, after "for {loved}" */
    twist: { id: 'fire', kept: 'Stay close to the fire.', freed: (t) => `${cap(t.taken)} ${t.many ? 'are' : 'is'} free.` }, task: (t) => `${t.minion}s are coming for ${t.taken}. Defend the fire.`, goal: 'Defend the fire', won: () => 'The fire held.', deed2: 'defended the fire', ask: (t) => (t.loved && !t.many ? `What do you promise ${t.taken}?` : 'What do you promise them?'), askLost: 'Why do you go on?', end: null },
  revenge: { id: 'hunt', title: 'The Hunt',
    /* chapter I is a walk: three signs the scout left, read one by one; each shows the way to the next; then a chase */
    first: { id: 'trail', title: 'The Chase', line: (t) => `${an(t.scout)} scout has seen you. Catch it before it warns ${t.enemy.replace(/^The /, 'the ')}.`, goal: 'Catch the scout', /* the chase starts at once (no signs to read first) */ deed: 'ran down the scout', journey: true },
    twist: { id: 'mark', line: (t) => `Kill the Marked ${t.minion} first.`, sub: '' } /* "It calls" read as the Lord */, task: (t) => `One ${t.minion} wears ${t.his} mark. Find it and kill it.`, goal: (t) => `Kill the Marked ${t.minion}`, /* the goal names the foe its plate names */ won: (t) => `${t.enemy} is next.`, deed2: (t) => `killed the ${t.minion} that wore ${t.his} mark`, ask: 'What did it take from you?', end: 'The debt is paid.' },
  glory: { id: 'trial', title: 'The Trial',
    /* chapter I is a walk: a marked road to the gate, watchers along it, three challengers; each one beaten cuts the name into a marker */
    first: { id: 'road-gate', title: 'Three Duels', line: (t) => `Three challengers hold the road to ${t.enemy.replace(/^The /, 'the ')}'s gate. Fight them one at a time.`, goal: 'Win three duels', /* named duels in a ring of watchers; the first one stands 20 m from the start */ deed: 'won three duels on the road to the gate', journey: true },
    twist: { id: 'test', line: (t) => `${cap(t.enemy)} gets back up.`, sub: '' }, /* say who */ task: () => 'Five fighters come at you, one at a time. Beat all five.', goal: 'Beat all five', won: () => 'Five down.', deed2: 'beat five fighters in a row', ask: 'Why do you want them to know your name?', end: (t) => `Everyone knows the name ${t.who}.` },
  freedom: { id: 'chains', title: 'The Anchors', /* chapter II is named for its own task (chapters.js names the seal chapter) */
    /* chapter I is a walk: someone the enemy keeps, in a cage at the far end; three chains hold it shut. There is no ring fight in chapter I */
    /* chapter I is "The Chains" (its task breaks three chains, then the lock); the goal names who is freed, so
       the header never says "Break the chains" while the line under it says "Break the lock" */
    first: { id: 'cage', title: 'The Chains', line: (t) => `${cap(t.kept)} is locked in a cage ${t.beyond}. Break its three chains.`, goal: (t) => (t.loved ? `Free ${t.kept}` : 'Free the stranger'), deed: (t) => (t.loved ? `broke ${t.kept} out of the cage` : 'broke a stranger out of a cage'), journey: true },
    twist: { id: 'chained', line: (t) => `Two anchors shield ${t.enemy.replace(/^The /, 'the ')}.`, goal: 'Break both chains', sub: '', done: 'Attack now.' }, task: (t) => `${t.enemy} has chained the road shut at three anchors. Break them.`, goal: 'Break the chains', won: () => 'All three are down.', /* web/src/chapters.js sets its own end line ("The seal breaks.") when a freed one guards the seal */ deed2: (t) => past(t.goal2) || 'broke the chains on the road', ask: 'What will you do when you are free?', end: 'The road is open.' },
  wonder: { id: 'dark', title: 'The Dark',
    /* chapter I is a walk, not a fight: three things to find on the way to a far light (web/src/journey.js). */
    first: { id: 'farlight', title: 'The Far Light', line: (t) => `${cap(t.cause)} knows the way to the far light. Follow it.`, goal: (t) => `Follow ${t.cause}`, /* no pickups on the wonder walk: a moving light leads and the hero follows */ /* a goal is a sentence in sentence case; the title keeps its capitals */ deed: (t) => `followed ${t.cause} to the far light`, journey: true },
    twist: { id: 'beacons', line: (t) => `${t.enemy} hides in the dark.`, goal: 'Light the two beacons', sub: '', done: () => 'Attack now.' }, /* the nemesis pronoun */ task: (t) => `${t.enemy} put out the stars. Light the three beacons.`, goal: 'Light the beacons', won: () => 'The stars come back.', deed2: 'lit the beacons', ask: 'What do you hope to find out there?', end: 'The far light is lit again.' },
};

/* the world's own words (game/worlds.mjs WORDS: road, fire, stars, beacon, anchor, traveller); dark = these */
const WORDS = { road: 'the road', fire: 'the fire', stars: 'the stars', beacon: 'beacon', anchor: 'anchor', traveller: 'Traveller', blade: 'blade' };
/* a world's nouns in every line the story returns: the fire, the road, the stars, beacons, anchors, the blade.
   Text inside “quotes” (the player's own words, the vow) is never changed. Dark (no worldWords) skips all of this. */
const keepCase = (src, to) => (/^[A-Z]/.test(src) ? cap(to) : to);
const plural = (w) => (/s$/.test(w) ? w : `${w}s`);
const bare = (w) => w.replace(/^the /i, '');
/* a lookbehind for the first words of a many-word swap ("watch beacon" -> (?<!watch )) */
const pre = (w) => { const p = String(w || '').split(' ').slice(0, -1).join(' '); return p ? `(?<!${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} )` : ''; };
function swapper(W) {
  const R = [
    [/\b(the|The) (open |dark )?road\b/g, (m, t, adj) => keepCase(t, adj ? `the ${adj}${bare(W.road)}` : W.road)],
    [/\b(this|This) road\b/g, (m, t) => `${t} ${bare(W.road)}`],
    [/\bThe Road\b/g, () => bare(W.road).replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^/, 'The ')],
    [/\b(the|The) fire\b/g, (m, t) => keepCase(t, W.fire)],
    [/\b(the|The) stars\b/g, (m, t) => keepCase(t, W.stars)],
    /* a word already swapped is not swapped again ("lit the watch watch beacons" on the storybook card) */
    [new RegExp(`${pre(W.beacon)}\\b(B|b)eacons\\b`, 'g'), (m, b) => keepCase(b === 'B' ? 'B' : 'b', plural(W.beacon))], [new RegExp(`${pre(W.beacon)}\\b(B|b)eacon\\b`, 'g'), (m, b) => keepCase(b === 'B' ? 'B' : 'b', W.beacon)],
    [new RegExp(`${pre(W.anchor)}\\b(A|a)nchors\\b`, 'g'), (m, a) => keepCase(a === 'A' ? 'A' : 'a', plural(W.anchor))], [new RegExp(`${pre(W.anchor)}\\b(A|a)nchor\\b`, 'g'), (m, a) => keepCase(a === 'A' ? 'A' : 'a', W.anchor)],
    [/\b(the|The) blade\b/g, (m, t) => `${t} ${W.blade}`],
    [/\bits maul\b/g, () => `its ${W.bruteWeapon || 'maul'}`], [/\ba maul\b/g, () => `a ${W.bruteWeapon || 'maul'}`],
  ];
  const one = (t) => String(t).split(/(“[^”]*”)/).map((part, i) => (i % 2 ? part : R.reduce((x, [re, f]) => x.replace(re, f), part))).join('');
  const deep = (v) => (typeof v === 'string' ? one(v) : Array.isArray(v) ? v.map(deep) : typeof v === 'function' ? (...a) => deep(v(...a)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'kinds' || k === 'flames' || k === 'who' || k === 'loved' ? x : deep(x)])) : v);
  return deep;
}
/* S: { name, place, land, motive, mentions:[{text}], desire, enemyLabel, words, worldWords }  ->  every line the quest shows.
   S.words is the player's words about the enemy (taken before the worlds came), so the world's words are S.worldWords. */
/* the same swap for single lines elsewhere (fight.js toasts and goals): identity without world words */
export function wordSwap(worldWords) { if (!worldWords) return (t) => t; const sw = swapper({ ...WORDS, ...worldWords }); return (t) => (typeof t === 'string' ? sw(t) : t); }
/* the world's own word for the wood, the marker and the stranger's name (until a world entry says it) */
const KINDLING = { 'the brazier': 'charcoal', 'the barrel fire': 'fuel cells', 'the campfire': 'firewood', 'the bonfire': 'firewood' };
/* the neon marker is a lit screen (web/src/props/neon.js), not a plate */
const MARKER = { 'the brazier': 'post', 'the barrel fire': 'screen', 'the campfire': 'post', 'the bonfire': 'signpost' };
/* "past the hills" is wrong in a city; a world may say words.beyond / words.beyondLast */
const BEYOND = { 'the barrel fire': ['at the end of the street', 'past the last block'] };
const NUMS = ['no', 'one', 'two', 'three', 'four', 'five'];
function walkLines({ S, W, who, names, loved, taken, enemy, many, kept, He, scout, beyond, named }) {
  const kn = W.kindling || KINDLING[W.fire] || 'kindling'; const mk = W.marker || MARKER[W.fire] || 'stone';
  const knMany = /s$/.test(kn); /* fuel cells are many; charcoal and firewood are one heap */
  /* with nobody named, the one the hero walks to the fire is the world's own small thing (web/src/props/<world>.js
     cause: a lamp, a drone, a songbird, a lantern), named for what the player sees: words.cause; dark = "the light" */
  const cause = W.cause || 'the light';
  const lead = names[0] || null; const them = loved ? (many ? 'them' : names[0]) : cause;
  const foe = enemy.replace(/^The /, 'the ');
  const fire = bare(W.fire);
  /* the vantage on each walk: the enemy seen ahead (no distance word, the figure can fill the frame), then one line
     from a companion (or the hero) */
  const home = ''; /* "New Orleans is behind you." only set a mood: cut */
  const said = S.desire ? quote(S.desire, 70) : '';
  /* one line and, under it, the player's own words for the enemy (so "the storm" is never left behind) */
  const view = (b, bSub) => ({ a: `That is ${foe}.`, aSub: named ? quote(S.words, 60) : '', b, bSub });
  return {
    farlight: { view: view(lead ? `${lead}: “Not far now.”` : 'Not far now.', home) },
    hearth: {
      kindling: kn, lead: lead || cause,
      /* the wood lies in order along the road, so each line can say how many are left */
      finds: [
        { title: cap(kn), line: `${knMany ? 'Charged' : 'Dry'} ${kn}. Find two more.` },
        { title: cap(kn), line: names[1] ? `More ${kn}. ${names[1]} stays close. Find one more.` : `More ${kn}. Find one more.` },
        { title: cap(kn), line: `That is enough ${kn}. Go to the ${fire}.` },
      ],
      goal: loved ? `Walk ${them} to the fire` : `Gather ${kn} for the fire`, near: 'Stay here to pick it up',
      waits: `${cap(lead || cause)} is waiting for you.`,
      threat: (one) => `${an(one)} is going for ${lead || cause}.`, threatSub: `Stop it before it reaches ${lead || cause}`,
      struck: lead ? `${lead} is down.` : `${cap(cause)} is knocked over.`, struckSub: lead ? `Stay close until ${lead} gets up` : `Stay close to ${cause}`,
      at: `The ${fire} is lit.`, sub: loved ? `${loved} ${many ? 'sit' : 'sits'} down by it.` : '',
      view: view(lead ? `${lead}: “We rest at the ${fire} tonight.”` : 'Camp first. The fight can wait.', home),
      /* singular for one; the count in words */
      missing: (n) => { const w = knMany ? 'cell' : kn === 'charcoal' || /wood$/.test(kn) ? 'load' : 'bundle'; return n === 1 ? `One more ${w} to find.` : `${cap(NUMS[n] || String(n))} more ${w}s to find.`; },
    },
    trail: {
      signs: [
        /* titles a reader can take as signs, not labels; the boots are the scout's; the nemesis has its pronoun */
        { title: 'Tracks', line: 'The scout came this way. Follow the tracks.' },
        { title: `${cap(foe)}'s mark`, line: `${cap(foe)}'s mark, left on purpose. ${He} wants you to come.` },
        { title: 'Still warm', line: 'The ashes are still warm. The scout is close.' },
      ],
      goal: 'Follow the trail', read: 'Read the sign', next: 'Follow the tracks',
      view: view(`The scout is heading for ${foe}. Catch it first.`, said || home),
      seen: 'The scout runs.', hit: '', camp: 'The scout reached its camp.', campSub: '', warned: `${cap(foe)} knows you are coming.`, chase: 'Catch the scout', chaseSub: (m) => `It is ${m} m from its camp`, /* "It" read as the Lord */ seenSub: `Catch it before it reaches ${foe}`, tired: 'It stops running. Finish it.',
      at: 'The scout is dead.', sub: `${cap(foe)} won't hear you coming.`, scout: `${scout} Scout`, /* the scout's own foe kind (it is a rogue in journey.js), not the minion's name */
    },
    cage: {
      kept, stranger: !lead, label: lead || 'Stranger',
      /* the guard comes at the hero when this is said (journey.js releases it first); "a Guard guards" is gone */
      guard: (one) => `${an(one)} guards this anchor.`, broke: ['One chain down.', 'Two chains down.', 'Break the lock.'],
      goal: (S.motive === 'freedom' && W.goals?.first) || (lead ? `Free ${lead}` : 'Free the stranger'), open: 'Break the lock', /* chain, chain, chain, then the lock: never open and locked at once */
      view: view(lead ? `${lead} is down there, in the cage.` : 'Someone is down there, in the cage.', 'Break the chains, then the lock.'),
      at: 'The lock breaks.', sub: lead ? `${lead} is free.` : 'The stranger is free.',
    },
    gate: {
      marker: mk,
      says: [`“${who}? Never heard the name.”`, `“${S.place ? `${who} of ${S.place}` : who}. Go home.”`, `“${cap(foe)} is past this gate. You won't get there.”`],
      challenger: (one) => `${one} of the ${cap(bare(W.road))}`, /* the world's road ("of the Street") */
      cut: W.fire === 'the barrel fire' ? `Your name lights up on the ${mk}.` : `Your name is cut into the ${mk}.`,
      /* one line per challenger beaten, so the same line is never said three times (journey.js reads cuts[i]).
         each line counts, so the player knows how many are left */
      cuts: W.fire === 'the barrel fire'
        ? [`Your name lights up on the ${mk}.`, 'Two down.', 'Walk on to the gate.']
        : [`Your name is cut into the ${mk}.`, 'Two down.', 'Walk on to the gate.'],
      step: 'A challenger steps onto the road',
      view: view('The gate is ahead.', said || home),
      duel: (i) => `Duel ${i + 1} of 3`, goal: 'Walk to the gate', at: `${who} reaches the gate.`, sub: 'Everyone here knows your name now.',
      lane: `The crowd is saying your name.`, laneSub: 'Walk on to the gate', /* the beat between the last challenger and the gate */
    },
  };
}
/* a chapter named for its task's prop: "Cut down the edict boards" -> "The Edict Boards" */
const propTitle = (task) => { const m = /\bthe (?:(?:two|three|four) )?(.+)$/i.exec(String(task || '')); return m ? `The ${m[1].replace(/\b\w/g, (c) => c.toUpperCase())}` : 'The Anchors'; };
/* a or an, capitalised, for a name that starts the sentence */
const an = (w) => `${/^[aeiou]/i.test(String(w)) ? 'An' : 'A'} ${w}`;
export function tellStory(S) {
  const W = { ...WORDS, ...(S.worldWords || {}) };
  /* a world may name each chapter's goal for the chains shape (words.goals = { first, task, taskLine, twist, twistLine }),
     so one verb and one prop are not said three times; only the freedom stake reads it. dark has its own default */
  const G = S.motive === 'freedom' ? (W.goals || (S.worldWords ? {} : DARK_GOALS)) : {};
  const who = S.name || W.traveller;
  const names = (S.mentions || []).map((m) => m.text).filter(Boolean).slice(0, 3);
  const base = STAKES[S.motive] || STAKES.protect;
  /* a world swaps the nouns of the stakes; dark keeps every string as it was */
  const stake = S.worldWords ? { ...base, what: base.what.replace('the stars', W.stars).replace('the open road', W.road.replace(/^the /, 'the open ')), flame: base.flame === 'The open road' ? cap(W.road.replace(/^the /, 'the open ')) : base.flame } : base;
  const loved = names.length ? list(names) : null;
  const taken = loved || stake.what;
  /* "the stars" and "the lanterns" are many ("The stars are gone", not "is") */
  const many = loved ? names.length > 1 : !!stake.many || /s$/.test(stake.what);
  const enemy = S.enemyLabel || 'The enemy';
  /* the player's own words for the enemy, when they are not just the body's name ("a dragon" -> the Dragon) */
  const ownWords = short(String(S.words || '').replace(/[.!?…,;:]+$/, ''), 60);
  const named = !!S.words && String(S.words).length <= 60 && !enemy.replace(/^The /i, '').toLowerCase().split(/\s+/).some((w) => w.length > 3 && String(S.words).toLowerCase().includes(w));
  const home = S.place || S.land || 'home';
  const verb = loved ? 'takes' : stake.verb;
  const freed = loved ? `${loved} ${many ? 'are' : 'is'} free` : `${cap(taken)} ${stake.free}`;
  const shape = SHAPES[S.motive] || SHAPES.protect;
  
  const open = shape.first;
  const kept = names[0] || 'someone';
  /* a person nemesis is 'he'/'she' (world nemesis `pronoun`), the default stays 'it' */
  const pro = String(S.pronoun || 'it').toLowerCase(); const He = pro === 'he' ? 'He' : pro === 'she' ? 'She' : 'It'; const him = pro === 'he' ? 'him' : pro === 'she' ? 'her' : 'it'; const his = pro === 'he' ? 'his' : pro === 'she' ? 'her' : 'its';
  /* the world's foot soldier when the caller names none ("Thrall" in a western read wrong), and the scout's own kind */
  const minion = S.minion || 'Thrall';
  const scout = S.scout || minion;
  const [beyond, beyondLast] = [W.beyond, W.beyondLast].map((x, i) => x || BEYOND[W.fire]?.[i] || ['past the hills', 'past the last hill'][i]);
  const goal2 = G.task || (typeof shape.goal === 'function' ? shape.goal({ minion }) : shape.goal);
  const kn = W.kindling || KINDLING[W.fire] || 'kindling'; /* the world's wood, for the hearth lines */
  const lure = W.lure || 'the light'; /* what leads the wonder walk (a songbird, a paper lantern, an orb; else a light) */
  const ctx = { who, taken, loved, enemy, many, minion, scout, kept, He, him, his, beyond, beyondLast, goal2, kn, cause: lure };
  const fn = (v) => (typeof v === 'function' ? v(ctx) : v);
  const leave = S.motive === 'wonder' ? `Something waits ${beyondLast}.` : stake.leave;
  const out = {
    who, taken, loved, enemy, many,
    /* the shape of this quest and its second chapter */
    shape: shape.id,
    second: { numeral: 'II', title: shape.id === 'dark' && W.dark ? W.dark : shape.id === 'chains' && G.task ? propTitle(G.task) : shape.title, /* a world may name the wonder chapter (words.dark) */ line: G.taskLine ? fn(G.taskLine) : shape.task(ctx) , card: named ? `“${cap(ownWords)}” sends ${/s$/.test(minion) ? minion : `${minion}s`}.` : '' }, goal: goal2, secondWon: shape.won(ctx),
    ending: fn(shape.end),
    /* the lights that walk with the hero: one for each loved one, or one flame for the cause */
    flames: names.length ? names : [stake.flame || who],
    /* 'person' | 'animal' for each named one, when the caller knows it (from the words around the name) */
    kinds: names.length && Array.isArray(S.kinds) ? S.kinds.slice(0, 3) : null,
    road: { numeral: 'I', title: 'The Road', line: `${who} leaves ${home}. ${loved ? `For ${loved}.` : leave}` },
    /* chapter I by shape: the road, the trail, the gate, the cage, the last light */
    first: { numeral: 'I', id: open.id, title: open.title, line: open.line ? fn(open.line) : `${who} leaves ${home}. ${loved ? `For ${loved}.` : leave}`, goal: G.first || fn(open.goal) || null, say: open.say ? fn(open.say) : null, after: open.after || null, journey: !!open.journey },
    /* the walk to the far light: three finds on the way, each told with the player's own words.
       gear = { weaponName, weapon (label), material (label) } from the forge; the fight passes it in. */
    finds(gear = {}) {
      const mat = String(gear.material || 'iron').toLowerCase();
      const blade = gear.weaponName || `the ${String(gear.weapon || 'blade').toLowerCase()}`;
      const n0 = names[0]; const animal = S.kinds?.[0] === 'animal';
      /* the three lie in order along the road, so each line says how many are left */
      return [
        { id: 'home', item: 'stone', title: S.place ? `From ${S.place}` : 'From home', line: `${cap(lure)} stops over a stone from ${S.place || 'home'}.` }, /* no world swap of the real road out of a real city */
        loved
          ? { id: 'them', item: animal ? 'bell' : 'cord', title: `For ${n0}`, line: animal ? `It circles a bell like the one ${n0} wears.` : `It circles a cord, knotted the way ${n0} knots it.` }
          : { id: 'them', item: 'star', title: 'A fallen star', line: 'It circles a fallen star, still warm.' },
        { id: 'blade', item: 'shard', title: 'A shard', line: `It shows you a shard of ${mat} that fits ${blade}.` },
      ];
    },
    /* chapter I on the open land, by shape (web/src/journey.js reads walk.<id>); every line from the player's words */
    walk: walkLines({ S, W, who, names, loved, taken, enemy, many, kept, He, scout, beyond, named }),
    /* the three finds in one sentence, not three fragments */
    farlight: { at: 'You reach the far light.',
      sub: () => (lure === 'the light' ? 'The light goes in, and the far light burns brighter.' : `${cap(lure)} lands on it.`),
      lure, follow: `Follow ${lure}`, stay: 'Stay close to it', climb: 'It climbs to the high ground', home: 'It is going to the far light',
      watcher: (one = minion) => `${an(one)} saw you. It is running to tell ${enemy.replace(/^The /, 'the ')}.`, watcherName: `${minion} Watcher`, ambush: 'Ambush.' },
    /* chapter III: the twist in the last fight */
    twist: { id: shape.twist.id, line: (G.twistLine ? fn(G.twistLine) : fn(shape.twist.line)) || null, sub: fn(shape.twist.sub) || '', goal: G.twist || shape.twist.goal || null, kept: shape.twist.kept || null, freed: fn(shape.twist.freed) || null, done: (G.twist ? 'They fall. Strike.' : fn(shape.twist.done)) || null }, /* a world's own twist prop (Edo war banners) is not "the chains" */
    taking: { numeral: 'II', title: 'The Taking', line: `${enemy} ${verb} ${taken}.`, sub: quote(S.words, 80) },
    after: `${cap(taken)} ${many ? 'are' : 'is'} gone.`,
    camp: { ask: fn(shape.ask), hint: '' },
    campLost: { ask: shape.askLost || 'Why do you go on?', hint: '' },
    /* the chapter III card says, once and plainly, that this body is the player's enemy: III · The Lich King ·
       This is “the storm”. (card = the only line a chapter card shows; main.js hud.chapter) */
    last: { numeral: 'III', title: enemy.replace(/^The /, 'The '), line: quote(S.words, 80) || 'The last fight.', card: named ? `This is “${ownWords}”.` : '' },
    taunt: quote(S.words, 70),
    /* the vow comes back once, as
       speech, with a verb from what Sage2 heard in it (the resolve) */
    recall: (vow, resolve) => (vow ? speech(vow, `you ${(SAYS[resolve] || SAYS.say)[0]}`) : `For ${taken}.`),
    rise: loved ? `${names[0]} pulls you back up.` : 'Not yet.',
    freed: `${freed}.`,
    /* the end card: the run as four sentences.
       weapon = the weapon's label ("Katana"): "The Lord knelt to Rowan's katana, Wren's Oath."; the chapter II
       deed is the shape's own past-tense deed; "for them" is never said with nobody named */
    card({ won, vow, resolve, land, weaponName, weapon = null, stage, lost = true, deed = null }) {
      /* short and in play order, so the card body can be set large enough for a phone, and the enemy is named
         once. The land is in the sub-line and the enemy's words in the receipts, so the story does not repeat them. The
         death path names the enemy once, in story order: "They were taken from the bonfire, and Rowan went after them." */
      /* three beats, no more. The name is already the headline,
         so the story never says it; the seal says who fell, so the story does not. Where from, the vow in the player's own
         words, how it ended. */
      const there = String(home).replace(/^The /, 'the ');
      const lines = [`Left ${there}${loved ? ` for ${loved}` : ''}.`];
      /* a vow over 9 words ("Because Wren and Ash are waiting for me and I promised them") swells the card: it stays in the feed only */
      const vw = String(vow || '').trim().replace(/^because\s+/i, '');
      if (vw && vw.split(/\s+/).length <= 9) { const v = cap(vw.replace(/[.,;:…]+$/, '')); lines.push(`“${/[!?]$/.test(v) ? v : `${v}.`}”`); }
      const waits = loved ? (many ? 'They wait.' : `${cap(names[0])} waits.`) : (WAITS[S.motive] || WAITS.protect);
      lines.push(won ? (loved ? `${many ? 'They are' : `${cap(names[0])} is`} safe.` : `${cap(freed)}.`)
        : stage >= 3 ? `${enemy} still stands.` : waits);
      /* the card is told about the hero, never to them: "your name" -> "Rowan's name" (quotes stay as said) */
      const third = (t) => t.replace(/\b(the|The) ones you guard\b/g, (m, a) => `${a} ones ${who} guards`).replace(/\b[Yy]our\b/g, `${who}'s`).replace(/\bat your side\b/g, `at ${who}'s side`);
      return lines.map((l) => l.split(/(“[^”]*”)/).map((part, i) => (i % 2 ? part : third(part))).join(''));
    },
  };
  /* the card reads the story as it is at the end of the run (chapters.js sets goal on this object) */
  const told = S.worldWords ? swapper(W)(out) : out;
  return told;
}
/* the dark world's chains quest names a different prop in each chapter (the walk's chains, then rune anchors),
   so one verb and one prop are not said three times */
const DARK_GOALS = { task: 'Break the three anchors', taskLine: (t) => `${t.enemy} has locked the road with three rune anchors. Break them.`, twist: 'Break the two anchors', twistLine: (t) => `Two rune anchors shield ${t.enemy.replace(/^The /, 'the ')}.` };

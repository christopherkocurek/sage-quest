/* The fixed input sets of the benchmark: tactic fact sets and labelled origin answers. */
import { importGame } from './lib.mjs';

/* Tactic fact sets. The grid covers every regular foe, 1 or 2 left of 2,
   two health states, two distances, four intruder actions, reinforcements yes or no. The lines match factsFor()
   in web/src/fight.js. `legal` follows legalFor() in the same file (see the comment below). The grid has no boss groups, no medium distance
   and no 'hurt' health state. */
export async function tacticCases() {
  const { FOES } = await importGame('game/kit.mjs');
  const cases = [];
  for (const foe of FOES) {
    for (const left of [1, 2]) {
      for (const health of ['healthy', 'badly hurt']) {
        for (const dist of [['close', 2], ['far away', 11]]) {
          for (const doing of ['blocking', 'swinging a weapon', 'standing still', 'moving']) {
            for (const reinf of ['yes', 'no']) {
              const size = 2;
              /* legal tactics: the conditions of legalFor() in web/src/fight.js for a non-boss group, in its order.
                 A fresh group is assumed: softStreak 0 (so the `softStreak < 2` tests pass), last tactic not 'retreat', not yet called.
                 alive = `left`; hpFrac < 0.4 is the "badly hurt" fact; near (< 6 paces) is true for 'close' (2 paces) and false for 'far away' (11);
                 reinforcements > 0 is the "Reinforcements available: yes" fact. A brute never gets guard, retreat or call. */
              const brute = foe.id === 'brute';
              const badlyHurt = health === 'badly hurt'; const near = dist[0] === 'close'; const reinfLeft = reinf === 'yes';
              const legal = ['charge'];
              if (left >= 2) legal.push('flank');
              if (near) legal.push('feint');
              if (!brute) legal.push('guard');
              if (left === 1 && badlyHurt && !brute) legal.push('retreat');
              if (left <= size / 2 && reinfLeft && !brute) legal.push('call');
              const facts = [
                `Group: ${left} ${foe.label}${left === 1 ? '' : 's'} left of ${size}.`,
                `The group has lost half of its members or more: ${left <= size / 2 ? 'yes' : 'no'}.`,
                `Group health: ${health}.`,
                `Distance to the intruder: ${dist[0]} (${dist[1]} paces).`,
                `The intruder is ${doing}.`,
                'Intruder health: 9 of 12.',
                'Other allies in the fight: 1.',
                'The group outnumbers the intruder.',
                `Reinforcements available: ${reinf}.`,
              ];
              /* a group with one legal tactic is not sent to Sage2: the fight takes that tactic itself (web/src/fight.js runTick, server/server.mjs apiTactics).
                 `asked` marks the sets that are sent; `offered` is the option list Sage2 sees (the legal tactics) */
              const asked = legal.length >= 2;
              const offered = legal;
              cases.push({ key: `${foe.id} left=${left} ${health} ${dist[0]} ${doing} reinf=${reinf}`, foe: foe.id, doing, legal, asked, offered, persona: foe.persona, content: `${foe.persona}\n\nFacts right now:\n${facts.join('\n')}` });
            }
          }
        }
      }
    }
  }
  return cases;
}

/* Labelled origin answers for the world pick. Each answer is an invented person from a place. The label is the world whose
   `fits` text (game/worlds/<id>.mjs) names that place or climate in so many words.
   - clear: the answer names a place or climate that one `fits` text names, and no other text pulls the other way.
   - hard: the answer fits two worlds. The label follows the clause that names the place or country ("a player from Japan",
     a named megacity, a desert city). A reader could argue the other way.
   - nofit: the answer matches no world's `fits` text by its words (an old stone-street city, a cold wet place, a low-rise or
     mid-size place, no sign). The dark text ends "anything that fits no other world", so the label is dark. */
export const WORLD_SET = [
  ['edo', 'I am from Kyoto, an old city of temples and quiet lanes.'],
  ['edo', 'Nara, Japan. The deer walk in the streets.'],
  ['edo', 'A small town on Shikoku island in Japan. Mild and green.'],
  ['edo', 'Kanazawa, Japan, a castle town by the sea.'],
  ['edo', 'Kagoshima, in the south of Japan. Warm, with a volcano across the bay.'],
  ['edo', 'A fishing port on the coast of Hokkaido, Japan.'],
  ['edo', 'Hiroshima, Japan, on a bay with seven rivers.'],
  ['edo', 'Fukuoka, Japan, a port city on the west coast.'],
  ['neon', 'Hong Kong. Towers, rain and lights all night.'],
  ['neon', 'Shanghai, a huge city of glass towers.'],
  ['neon', 'Singapore. Hot, wet and full of skyscrapers.'],
  ['neon', 'Manhattan, New York. Towers, steam and traffic.'],
  ['neon', 'Tokyo. I live among the towers of Shinjuku, neon on every wall.'],
  ['neon', 'Shenzhen, a wall of glass skyscrapers on the bay.'],
  ['neon', 'A city whose skyline is a wall of glass towers, lit up all night.'],
  ['neon', 'Kowloon, in Hong Kong. Dense towers on every side.'],
  ['frontier', 'West Texas. Flat, dry and hot.'],
  ['frontier', 'A ranch outside Tucson, Arizona. Cactus all around.'],
  ['frontier', 'The outback of Western Australia. Red dirt and heat.'],
  ['frontier', 'Sonora, Mexico. Desert heat and dust.'],
  ['frontier', 'New Mexico. Mesas and open sky.'],
  ['frontier', 'Chihuahua, in the north of Mexico. Dry plains and mountains.'],
  ['frontier', 'A small town in the Nevada desert.'],
  ['frontier', 'Alice Springs, in the Australian outback.'],
  ['storybook', 'A village in the Swiss Alps. Green meadows and cows with bells.'],
  ['storybook', 'Tyrol, Austria. Mountain meadows and wooden farmhouses.'],
  ['storybook', 'Rolling green hills in Devon, England. Sheep and hedgerows.'],
  ['storybook', 'A farm in Vermont. Green hills in summer.'],
  ['storybook', 'Bavaria, Germany. Villages under the Alps.'],
  ['storybook', 'The Dutch countryside, with green fields and windmills.'],
  ['storybook', 'A valley in Slovenia. Alpine meadows and a lake.'],
  ['storybook', 'The Cotswolds in England. Gentle green hills and stone villages.'],
  ['dark', 'Northern Norway, deep in a fjord. The winter is long and dark.'],
  ['dark', 'The north of Scotland. Moor and fog by the sea.'],
  ['dark', 'Siberia. Endless pine forest and cold.'],
  ['dark', 'Iceland. Black sand and storms off the sea.'],
  ['dark', 'The fens of eastern England. Flat, grey and wet.'],
  ['dark', 'Kamchatka. Volcanoes and ash.'],
  ['dark', 'Lapland in Finland. Snow forest and the polar night.'],
  ['dark', 'A storm-battered coast in western Ireland. Grey sea and black cliffs.'],
  ['nofit', 'Madrid, Spain. Old stone streets and squares.'],
  ['nofit', 'Lisbon, Portugal. Steep old streets of stone.'],
  ['nofit', 'Prague. An old city of stone streets and bridges.'],
  ['nofit', 'Edinburgh, an old stone city under a castle.'],
  ['nofit', 'Manchester, England. Cold, wet and grey.'],
  ['nofit', 'Nowhere special.'],
  ['nofit', 'A mid-size town in the middle of the country. Nothing special.'],
  ['nofit', 'A low-rise city with a river and a few bridges.'],
  ['nofit', 'A quiet suburb. A few shops and a bus stop.'],
  ['nofit', 'A mid-rise city on a wide river, mostly brick and stone.'],
  ['hard:frontier', 'Las Vegas, Nevada. Desert all around, the strip lit up all night.'],
  ['hard:frontier', 'Phoenix, Arizona. A big desert city.'],
  ['hard:neon', 'Dubai. Hot desert, with towers that touch the clouds.'],
  ['hard:neon', 'Hong Kong. Hot and humid, with green hills behind the harbour.'],
  ['hard:storybook', 'The Texas Hill Country. Green hills and live oaks.'],
  ['hard:edo', 'A village in the Japanese Alps. Green meadows and snow peaks.'],
  ['hard:edo', 'Osaka, Japan. A huge city, hot in summer.'],
  ['hard:edo', 'Sapporo, Japan. Long snowy winters.'],
  ['hard:edo', 'A rice-farming village in Niigata, Japan. Deep snow every winter.'],
].map(([label, answer]) => ({ label: label.startsWith('hard:') ? 'hard' : label, expected: label === 'nofit' ? 'dark' : label.replace('hard:', ''), answer }));

/* Heart-step answers: [intended motive, answer]. 15 name a motive (3 each), 2 name none. Invented persona. */
export const HEART_SET = [
  ['protect', 'My brother Wren. He is all I have left, and I keep him safe.'],
  ['protect', 'My little girl Ada. Nobody touches her while I am around.'],
  ['protect', 'My mom. She is sick and somebody has to look after her.'],
  ['revenge', 'My brother Wren. They took everything from him and I want them to pay.'],
  ['revenge', 'My dad. The man who hurt him is still out there walking free.'],
  ['revenge', 'For Mara. She was betrayed by people she trusted and I will settle it.'],
  ['glory', 'For my dad. I want him to see me win, just once.'],
  ['glory', 'My coach Vic. I want to be the best there is and make him proud.'],
  ['glory', 'My sister Lou. Everyone back home will know my name.'],
  ['freedom', 'For Wren. We are getting out of this town and nobody will own us again.'],
  ['freedom', 'My wife Noor. We quit, sell everything and take the open road.'],
  ['freedom', 'For my friend Eli. He is stuck in a job that is killing him and I want us both free.'],
  ['wonder', 'For Wren. I want to show him what is past the edge of the map.'],
  ['wonder', 'My daughter Bea. We want to see every strange place out there and learn how it works.'],
  ['wonder', 'For my grandpa. He taught me to wonder what is beyond the stars and I want to find out.'],
  ['none', 'Nobody. Just the open road and no one telling me what to do.'],
  ['none', 'Myself, I guess. I want to see how far I can go.'],
];

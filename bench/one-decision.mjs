/* One real tactic decision with every option's probability, for the README. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const GAME = path.resolve(process.env.GAME_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
const imp = (rel) => import(pathToFileURL(path.join(GAME, rel)).href);
const { tacticQuestion } = await imp('game/questions.mjs');
const { FOES, byId } = await imp('game/kit.mjs');
const foe = byId(FOES, process.env.FOE || 'warrior');
const facts = [
  `Group: 1 ${foe.label} left of 2.`,
  'The group has lost half of its members or more: yes.',
  'Group health: healthy.',
  'Distance to the intruder: close (2 paces).',
  'The intruder is blocking.',
  'Intruder health: 9 of 12.',
  'Other allies in the fight: 1.',
  'The group outnumbers the intruder.',
  'Reinforcements available: no.',
];
const legal = ['charge', 'guard', 'feint'];
const request = { content: `${foe.persona}\n\nFacts right now:\n${facts.join('\n')}`, questions: [tacticQuestion(legal)] };
const env = Object.fromEntries(fs.readFileSync(path.join(GAME, '.env'), 'utf8').split('\n').map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const base = process.env.SAGE_ENDPOINT || 'https://sage.levanto.ai';
const t0 = performance.now();
const r = await fetch(base + '/decide/batch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SAGE_API_KEY}` }, body: JSON.stringify({ reasoning: 'off', requests: [request] }) });
const json = await r.json();
const ms = performance.now() - t0;
const out = { date: new Date().toISOString(), endpoint: base, clientMs: Math.round(ms), request, response: json };
fs.writeFileSync(process.env.OUT || 'examples/one-decision.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(json.results?.[0]?.answers?.[0]?.result, null, 1).slice(0, 1500), '\nclient ms', Math.round(ms), 'meta', JSON.stringify(json.meta));

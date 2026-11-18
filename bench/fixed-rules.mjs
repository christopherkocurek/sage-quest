/* Fixed-rules baseline: the game's own offline tactic table (`localTactic` in web/src/fight.js) on the same fact sets.
   The function is read from the game source and compiled as it stands, so the bench cannot drift from the game.
   Usage: GAME_DIR=<game folder> node bench/fixed-rules.mjs [--sage <tactics raw file>]
   Raw output: <OUT_DIR>/fixed-rules-<date>.json */
import fs from 'node:fs';
import path from 'node:path';
import { needGameDir, importGame, provenance, writeResult, arg, round } from './lib.mjs';
import { tacticCases } from './cases.mjs';

const src = fs.readFileSync(path.join(needGameDir(), 'web/src/fight.js'), 'utf8').split('\n');
const start = src.findIndex((l) => /^\s*localTactic\(g, legal\) \{/.test(l));
if (start < 0) throw new Error('localTactic not found in web/src/fight.js');
let end = start; while (!/^  \}\s*$/.test(src[end])) end++;
const body = src.slice(start + 1, end).join('\n');
const fn = new Function('g', 'legal', body); /* `this.blocking` is the only state it reads */
const sourceLines = `web/src/fight.js:${start + 1}-${end + 1}`;

const cases = await tacticCases();
const rows = cases.map((c) => ({ key: c.key, foe: c.foe, legal: c.legal, pick: fn.call({ blocking: c.doing === 'blocking' }, null, c.legal) }));
const spread = {}; const byFoe = {};
for (const r of rows) { spread[r.pick] = (spread[r.pick] || 0) + 1; (byFoe[r.foe] ||= {})[r.pick] = ((byFoe[r.foe] || {})[r.pick]) + 1 || 1; }
const illegal = rows.filter((r) => !r.legal.includes(r.pick)).length;

/* agreement with Sage2 on the same cases, from a tactics raw file (run 1) */
const sageFile = arg('sage', null); let agreement = null;
if (sageFile) {
  const sage = JSON.parse(fs.readFileSync(sageFile, 'utf8')).rows[0]; const map = new Map(sage.filter((s) => s.ok).map((s) => [s.key, s.pick]));
  const both = rows.filter((r) => map.has(r.key)); const same = both.filter((r) => map.get(r.key) === r.pick).length;
  agreement = { compared: both.length, same, samePct: round((same / both.length) * 100) };
}
const out = { name: 'fixed-rules', provenance: provenance({ source: sourceLines, note: 'localTactic reads only this.blocking; blocking = the intruder is blocking in the fact set' }), cases: rows.length, illegal, spread, distinctTactics: Object.keys(spread).length, byFoe, agreementWithSage2: agreement, rows };
writeResult('fixed-rules', out);
console.log(`source ${sourceLines}  cases ${rows.length} illegal ${illegal} distinct tactics ${Object.keys(spread).length}`); console.log('spread', JSON.stringify(spread));
if (agreement) console.log(`same pick as Sage2 on ${agreement.same}/${agreement.compared} (${agreement.samePct}%)`);

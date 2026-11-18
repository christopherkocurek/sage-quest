/* Tactics benchmark: the combat Choice question on a grid of fight facts, sent to Sage2 one request per call
   (one foe group, as the game sends it most of the time).
   Reports null rate, illegal picks, tactic spread, latency, and repeat agreement between runs.
   Usage: GAME_DIR=<game folder> node bench/probe-tactics.mjs [--runs 2] [--concurrency 4] [--limit N] [--rows]
   Raw output: <OUT_DIR>/tactics-<date>.json */
import { loadEnv, importGame, prices, rawDecide, top, pool, lat, round, provenance, writeResult, arg, flag } from './lib.mjs';
import { tacticCases } from './cases.mjs';

loadEnv();
const { tacticQuestion } = await importGame('game/questions.mjs');
const { TACTICS } = await importGame('game/kit.mjs');
const { costOf } = await prices();
const RUNS = Number(arg('runs', 2)); const CONC = Number(arg('concurrency', 4)); const LIMIT = Number(arg('limit', 0));
const allCases = await tacticCases();
/* a group with one legal tactic is answered by the game itself and never sent to Sage2: those sets are left out here */
let cases = allCases.filter((c) => c.asked); if (LIMIT) cases = cases.slice(0, LIMIT);
const notSent = allCases.length - allCases.filter((c) => c.asked).length;

const runs = [];
for (let run = 0; run < RUNS; run++) {
  const rows = await pool(cases, CONC, async (c) => {
    const r = await rawDecide([{ content: c.content, questions: [tacticQuestion(c.offered)] }]);
    const a = top(r.answers[0]?.tactic);
    /* the game takes chosen, else the leading option (web/src/fight.js runTick: pick.chosen ?? pick.lead) */
    const pick = a ? (a.chosen ?? a.lead) : null;
    return { key: c.key, foe: c.foe, legal: c.legal, offered: c.offered, ok: r.ok && !!a, status: r.attempts.at(-1).status, attempts: r.attempts.length, chosen: a?.chosen ?? null, lead: a?.lead ?? null, leadP: a ? round(a.leadP, 4) : null, secondP: a ? round(a.secondP, 4) : null, pick, ms: round(r.ms), serverMs: r.serverMs, inTok: r.usage?.billed_input_tokens ?? null, outTok: r.usage?.output_tokens ?? null, cost: r.usage ? costOf(r.usage) : null };
  });
  runs.push(rows);
}

function summarize(rows) {
  const ok = rows.filter((r) => r.ok);
  const spreadChosen = {}; const spreadPick = {}; const byFoe = {};
  for (const r of ok) {
    if (r.chosen) spreadChosen[r.chosen] = (spreadChosen[r.chosen] || 0) + 1;
    if (r.pick) { spreadPick[r.pick] = (spreadPick[r.pick] || 0) + 1; (byFoe[r.foe] ||= {})[r.pick] = ((byFoe[r.foe] || {})[r.pick] || 0) + 1; }
  }
  const nulls = ok.filter((r) => r.chosen == null).length;
  const illegalPick = ok.filter((r) => !r.legal.includes(r.pick)).length;
  const illegalChosen = ok.filter((r) => r.chosen && !r.legal.includes(r.chosen)).length;
  const ms = ok.map((r) => r.ms); const sv = ok.filter((r) => r.serverMs != null).map((r) => r.serverMs);
  return {
    cases: rows.length, answered: ok.length, failed: rows.length - ok.length, retriedCalls: rows.filter((r) => r.attempts > 1).length,
    nulls, nullRatePct: round((nulls / Math.max(1, ok.length)) * 100), illegalPick, illegalChosen,
    spreadChosen, spreadPick, distinctTacticsPicked: Object.keys(spreadPick).length, byFoe,
    clientMs: lat(ms), serverMs: sv.length ? lat(sv) : null,
    over600ms: ok.filter((r) => r.ms > 600).length, over1500ms: ok.filter((r) => r.ms > 1500).length,
    inTokMean: round(ok.reduce((s, r) => s + (r.inTok || 0), 0) / Math.max(1, ok.length)), costTotal: ok.reduce((s, r) => s + (r.cost || 0), 0), costPerCall: ok.reduce((s, r) => s + (r.cost || 0), 0) / Math.max(1, ok.length),
  };
}
const perRun = runs.map(summarize);

/* repeat agreement: the same input in run 0 and run k gives the same answer */
let repeat = null;
if (runs.length > 1) {
  const pairs = [];
  for (let k = 1; k < runs.length; k++) pairs.push(runs[0].map((r, i) => ({ r, s: runs[k][i] })).filter((p) => p.r.ok && p.s.ok));
  const all = pairs.flat();
  const same = (f) => all.filter((p) => p.r[f] === p.s[f]).length;
  repeat = { comparedPairs: all.length, samePick: same('pick'), samePickPct: round((same('pick') / all.length) * 100, 2), sameChosen: same('chosen'), sameChosenPct: round((same('chosen') / all.length) * 100, 2), maxLeadPDiff: round(Math.max(...all.map((p) => Math.abs(p.r.leadP - p.s.leadP))), 4), differing: all.filter((p) => p.r.pick !== p.s.pick).map((p) => ({ key: p.r.key, a: p.r.pick, b: p.s.pick, aP: p.r.leadP, bP: p.s.leadP })) };
}

const out = { name: 'tactics', provenance: provenance({ runs: RUNS, concurrency: CONC, requestShape: 'one /decide/batch call = one request = one tactic question, no hedge, up to 3 attempts', legalOptionsOffered: 'per case (see cases.mjs): the legal tactics', fightFactSets: allCases.length, singleLegalNotSentToSage2: notSent, tacticIds: TACTICS.map((t) => t.id) }), perRun, repeat, rows: runs };
writeResult('tactics', out);
for (const [i, s] of perRun.entries()) console.log(`run ${i + 1}: cases ${s.cases} answered ${s.answered} failed ${s.failed} nulls ${s.nulls} (${s.nullRatePct}%) illegal ${s.illegalPick} | spread ${JSON.stringify(s.spreadPick)} | client ms median ${s.clientMs.median} p95 ${s.clientMs.p95} | server ms median ${s.serverMs?.median} p95 ${s.serverMs?.p95}`);
if (repeat) console.log(`repeat: same pick ${repeat.samePick}/${repeat.comparedPairs} (${repeat.samePickPct}%), same chosen ${repeat.sameChosenPct}%, max lead-p diff ${repeat.maxLeadPDiff}`);
if (flag('rows')) for (const r of runs[0]) console.log(`${r.key} -> ${r.chosen ?? `null(${r.lead})`} ${r.leadP}`);

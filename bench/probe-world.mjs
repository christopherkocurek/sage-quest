/* World pick benchmark: the origin step as the game sends it now (server/server.mjs apiStep, step 'origin'):
   one /decide/batch with two requests (Choice `biome`, Choice `world`, both on "Question: ...\nAnswer: <origin>"),
   in parallel with one /v1/extract call for `place`. Labelled invented answers: see WORLD_SET in cases.mjs.
   The pick follows the game: the API `chosen`, else the settle() rule (lead >= 0.55 and 0.15 ahead), else a lead >= 0.45
   (see `settle()` and the world pick of the home step in web/src/main.js).
   Usage: GAME_DIR=<game folder> node bench/probe-world.mjs [--runs 2] [--concurrency 3] [--rows]
   Raw output: <OUT_DIR>/world-<date>.json */
import { loadEnv, importGame, prices, rawDecide, top, pool, lat, round, provenance, writeResult, arg, flag, endpoint, sleep } from './lib.mjs';
import { WORLD_SET } from './cases.mjs';

loadEnv();
const { STEPS, stepContent } = await importGame('game/questions.mjs');
const { kitFor, WORLD_IDS } = await importGame('game/worlds.mjs');
const { costOf } = await prices();
const RUNS = Number(arg('runs', 2)); const CONC = Number(arg('concurrency', 3));
const step = STEPS.find((s) => s.id === 'origin');

async function extractPlace(text) {
  const key = process.env.SAGE_API_KEY || ''; const t0 = performance.now();
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(endpoint() + '/v1/extract', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'Mozilla/5.0 (compatible; quest-demo/0.1)' }, body: JSON.stringify({ content: text, extract: step.extract }) });
      if (r.ok) { const j = await r.json(); return { ok: true, ms: performance.now() - t0, serverMs: j.meta?.latency_ms ?? null, usage: j.meta?.usage ?? null, place: j.values?.place ?? null }; }
    } catch { /* retry */ }
    await sleep(300 * (t + 1));
  }
  return { ok: false, ms: performance.now() - t0 };
}

const runs = [];
for (let run = 0; run < RUNS; run++) {
  const rows = await pool(WORLD_SET, CONC, async (c) => {
    const content = stepContent(step, c.answer);
    const K = kitFor('dark'); /* the origin step is asked before any world is chosen: the default kit */
    const requests = [{ content, questions: step.live(K) }, { content, questions: step.world() }];
    const t0 = performance.now();
    const [d, x] = await Promise.all([rawDecide(requests), extractPlace(c.answer)]);
    const stepMs = performance.now() - t0; /* what /api/step waits for: the slower of the two */
    const w = top(d.answers[1]?.world);
    let settled = null;
    if (w) { settled = w.chosen; if (settled == null && w.leadP >= 0.55 && w.leadP - w.secondP >= 0.15) settled = w.lead; if (settled == null && w.leadP >= 0.45) settled = w.lead; }
    return { label: c.label, expected: c.expected, answer: c.answer, ok: d.ok && !!w, status: d.attempts.at(-1).status, attempts: d.attempts.length, apiChosen: w?.chosen ?? null, lead: w?.lead ?? null, leadP: w ? round(w.leadP, 4) : null, secondP: w ? round(w.secondP, 4) : null, pick: settled, biome: top(d.answers[0]?.biome)?.chosen ?? top(d.answers[0]?.biome)?.lead ?? null, place: x.place, batchMs: round(d.ms), batchServerMs: d.serverMs, extractMs: round(x.ms), extractServerMs: x.serverMs, stepMs: round(stepMs), inTok: d.usage?.billed_input_tokens ?? null, outTok: d.usage?.output_tokens ?? null, cost: (d.usage ? costOf(d.usage) : 0) + (x.usage ? costOf(x.usage) : 0) };
  });
  runs.push(rows);
}

const summarize = (rows) => {
  const ok = rows.filter((r) => r.ok); const grp = (f) => ok.filter(f);
  const acc = (list) => ({ n: list.length, right: list.filter((r) => r.pick === r.expected).length, pct: round((list.filter((r) => r.pick === r.expected).length / Math.max(1, list.length)) * 100) });
  const per = {}; for (const w of [...WORLD_IDS, 'hard', 'nofit']) per[w] = acc(grp((r) => r.label === w));
  const confusion = {}; for (const r of ok) { const k = r.label; (confusion[k] ||= {})[r.pick ?? 'null'] = ((confusion[k] || {})[r.pick ?? 'null'] || 0) + 1; }
  const clear = grp((r) => r.label !== 'nofit' && r.label !== 'hard');
  return {
    answers: rows.length, answered: ok.length, failed: rows.length - ok.length,
    accuracyClear: acc(clear), accuracyHard: acc(grp((r) => r.label === 'hard')), accuracyNofit: acc(grp((r) => r.label === 'nofit')), accuracyAll: acc(ok), perWorld: per, confusion,
    apiNulls: ok.filter((r) => r.apiChosen == null).length, apiNullPct: round((ok.filter((r) => r.apiChosen == null).length / Math.max(1, ok.length)) * 100), unsettled: ok.filter((r) => r.pick == null).length,
    rawLeadAccuracyClear: round((clear.filter((r) => r.lead === r.expected).length / Math.max(1, clear.length)) * 100),
    stepMs: lat(ok.map((r) => r.stepMs)), batchClientMs: lat(ok.map((r) => r.batchMs)), batchServerMs: lat(ok.filter((r) => r.batchServerMs != null).map((r) => r.batchServerMs)), extractClientMs: lat(ok.map((r) => r.extractMs)),
    misses: ok.filter((r) => r.pick !== r.expected).map((r) => ({ label: r.label, answer: r.answer, got: r.pick ?? `null(${r.lead})`, leadP: r.leadP })),
    costPerStep: ok.reduce((s, r) => s + r.cost, 0) / Math.max(1, ok.length),
  };
};
const perRun = runs.map(summarize);
let repeat = null;
if (runs.length > 1) { const pairs = runs[0].map((r, i) => [r, runs[1][i]]).filter(([a, b]) => a.ok && b.ok); const same = pairs.filter(([a, b]) => a.pick === b.pick).length; repeat = { pairs: pairs.length, samePick: same, samePct: round((same / pairs.length) * 100) }; }
writeResult('world', { name: 'world', provenance: provenance({ runs: RUNS, concurrency: CONC, requestShape: 'origin step: batch of 2 requests (biome, world) + extract place, in parallel, no hedge, up to 3 attempts', setSize: WORLD_SET.length, setDescription: '40 clear answers (8 per world) + 7 hard answers (fit two worlds) + 10 with no world named (expected dark, per the question text)' }), perRun, repeat, rows: runs });
perRun.forEach((s, i) => console.log(`run ${i + 1}: clear ${s.accuracyClear.right}/${s.accuracyClear.n} (${s.accuracyClear.pct}%) hard ${s.accuracyHard.right}/${s.accuracyHard.n} nofit->dark ${s.accuracyNofit.right}/${s.accuracyNofit.n} api nulls ${s.apiNulls} (${s.apiNullPct}%) unsettled ${s.unsettled} failed ${s.failed} | step ms median ${s.stepMs.median} p95 ${s.stepMs.p95}`));
if (repeat) console.log(`repeat: same pick ${repeat.samePick}/${repeat.pairs}`);
if (flag('rows')) for (const r of runs[0]) console.log(`${r.label.padEnd(9)} -> ${String(r.pick ?? `null(${r.lead})`).padEnd(10)} ${Math.round((r.leadP || 0) * 100)}%  ${r.answer}`);

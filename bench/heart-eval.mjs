/* Motive benchmark: the "Who do you fight for?" step through the real server path (POST /api/step, step heart).
   17 answers (15 name a motive, 2 name none), invented persona, with timing and repeat runs.
   A hit = the motive Sage2 `chosen`, else the settle() rule (lead >= 0.55 and 0.15 ahead) matches the intended motive.
   Usage: node bench/heart-eval.mjs --base http://localhost:8790 [--runs 2]
   Raw output: <OUT_DIR>/heart-<date>.json   (the server needs its Sage2 key; this script does not) */
import { lat, round, provenance, writeResult, arg, sleep } from './lib.mjs';
import { HEART_SET as ITEMS } from './cases.mjs';

const BASE = arg('base', 'http://localhost:8790'); const RUNS = Number(arg('runs', 2));
async function one(text) {
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASE}/api/step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 'heart', text, world: 'dark' }) });
      if (res.ok) return { json: await res.json(), ms: performance.now() - t0, tries: k + 1 };
      if (res.status === 429) await sleep(20000);
    } catch { /* retry */ }
    await sleep(1500);
  }
  return { json: null, ms: 0, tries: 3 };
}
const runs = [];
for (let run = 0; run < RUNS; run++) {
  const rows = [];
  for (const [expect, text] of ITEMS) {
    const { json: r, ms, tries } = await one(text);
    const m = r?.motive || {};
    const got = m.chosen ?? (m.leadP >= 0.55 && m.leadP - (m.secondP || 0) >= 0.15 ? m.lead : null);
    rows.push({ expect, text, ok: !!r, got, lead: m.lead ?? null, leadP: round(m.leadP ?? 0, 4), apiChosen: m.chosen ?? null, names: (r?.mentions || []).map((x) => x.text), desire: r?.desire ?? null, ms: round(ms), tries, logMs: (r?.log || []).map((l) => ({ label: l.label, ms: l.ms, serverMs: l.serverMs, inTok: l.inTok, outTok: l.outTok, cost: l.cost })) });
    await sleep(400);
  }
  runs.push(rows);
}
const summarize = (rows) => {
  const named = rows.filter((r) => r.expect !== 'none' && r.ok); const hit = named.filter((r) => r.got === r.expect);
  const perMotive = {}; for (const r of named) { const p = (perMotive[r.expect] ||= { n: 0, right: 0 }); p.n++; if (r.got === r.expect) p.right++; }
  const none = rows.filter((r) => r.expect === 'none' && r.ok);
  return { named: named.length, hit: hit.length, accuracyPct: round((hit.length / Math.max(1, named.length)) * 100), perMotive, motivesReached: [...new Set(hit.map((r) => r.expect))], apiNulls: named.filter((r) => r.apiChosen == null).length, failed: rows.filter((r) => !r.ok).length,
    noneItems: none.map((r) => ({ text: r.text, got: r.got ?? `null(${r.lead})`, leadP: r.leadP })), misses: named.filter((r) => r.got !== r.expect).map((r) => ({ expect: r.expect, text: r.text, got: r.got ?? `null(${r.lead})`, leadP: r.leadP })), stepMs: lat(rows.filter((r) => r.ok).map((r) => r.ms)) };
};
const perRun = runs.map(summarize);
let repeat = null; if (runs.length > 1) { const same = runs[0].filter((r, i) => r.ok && runs[1][i].ok && r.got === runs[1][i].got).length; repeat = { pairs: runs[0].length, samePick: same }; }
writeResult('heart', { name: 'heart', provenance: provenance({ base: BASE, runs: RUNS, setSize: ITEMS.length }), perRun, repeat, rows: runs });
perRun.forEach((s, i) => console.log(`run ${i + 1}: ${s.hit}/${s.named} = ${s.accuracyPct}% (gate 80%) motives reached ${s.motivesReached.length}/5, api nulls ${s.apiNulls}, failed ${s.failed}, step ms median ${s.stepMs.median} p95 ${s.stepMs.p95}`));
if (repeat) console.log(`repeat: same pick ${repeat.samePick}/${repeat.pairs}`);

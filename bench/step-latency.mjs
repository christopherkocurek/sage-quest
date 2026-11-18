/* Onboarding latency: time each /api/step call (one finished answer of one build step) against a running game server.
   Each step runs 4 invented answers twice (8 calls), one at a time, as the player would. The server answers after its
   Sage2 batch and its extract call finish (they run in parallel), so a step waits for the slower of the two.
   Usage: node bench/step-latency.mjs --base http://localhost:8790
   Raw output: <OUT_DIR>/step-latency-<date>.json */
import { lat, round, provenance, writeResult, arg, sleep } from './lib.mjs';

const BASE = arg('base', 'http://localhost:8790');
const ANSWERS = {
  name: ['They call me Rowan', 'My name is Ines', 'Call me Kofi', 'I am Idris'],
  origin: ['Kyoto, an old city of temples and quiet lanes.', 'West Texas. Flat, dry and hot.', 'A village in the Swiss Alps. Green meadows and cows with bells.', 'Northern Norway, deep in a fjord. The winter is long and dark.'],
  born: ['May 5th 1993', 'I was born on 12 November 1987', 'March 3, 2001', 'The first of July, 1977'],
  body: ['I write code all day and I lift weights at night.', 'I bake bread before dawn and teach a dance class in the evening.', 'I drive a truck across three states and fix my own engine.', 'I train kendo four nights a week and study at the university.'],
  heart: ['My brother Wren and my dog Ash.', 'My little girl Ada. Nobody touches her while I am around.', 'Nobody. Just the open road and no one telling me what to do.', 'For my coach Vic. I want to be the best there is.'],
  enemy: ['A storm that keeps growing.', 'The fear of failing in front of everyone I know.', 'A cruel king who burned my village and his hollow soldiers.', 'My own laziness, and the clock.'],
};
const rows = [];
for (const [step, list] of Object.entries(ANSWERS)) {
  for (let rep = 0; rep < 2; rep++) for (const text of list) {
    let rec = null;
    for (let k = 0; k < 3 && !rec; k++) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${BASE}/api/step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step, text, world: 'dark' }) });
        const ms = performance.now() - t0;
        if (res.ok) { const j = await res.json(); rec = { step, text, rep, ms: round(ms), tries: k + 1, entries: j.log.map((l) => ({ label: l.label, ms: l.ms, serverMs: l.serverMs, inTok: l.inTok, outTok: l.outTok, cost: l.cost, ok: l.ok })) }; }
        else if (res.status === 429) await sleep(20000);
      } catch { /* retry */ }
      if (!rec) await sleep(1500);
    }
    rows.push(rec || { step, text, rep, failed: true });
    await sleep(600);
  }
}
const perStep = {};
for (const step of Object.keys(ANSWERS)) {
  const r = rows.filter((x) => x.step === step && !x.failed);
  const dec = r.flatMap((x) => x.entries.filter((e) => /^decide/.test(e.label))); const ext = r.flatMap((x) => x.entries.filter((e) => /^extract/.test(e.label)));
  perStep[step] = { calls: r.length, failed: rows.filter((x) => x.step === step && x.failed).length, stepMs: lat(r.map((x) => x.ms)), decideBatchMs: dec.length ? lat(dec.map((e) => e.ms)) : null, extractMs: lat(ext.map((e) => e.ms)), sage2Calls: r[0]?.entries.length ?? 0, inTokMean: round(r.reduce((s, x) => s + x.entries.reduce((a, e) => a + e.inTok, 0), 0) / Math.max(1, r.length)), outTokMean: round(r.reduce((s, x) => s + x.entries.reduce((a, e) => a + e.outTok, 0), 0) / Math.max(1, r.length), 2), costPerStep: r.reduce((s, x) => s + x.entries.reduce((a, e) => a + e.cost, 0), 0) / Math.max(1, r.length) };
}
const ok = rows.filter((x) => !x.failed);
writeResult('step-latency', { name: 'step-latency', provenance: provenance({ base: BASE, note: 'client wall clock of POST /api/step on a local server; the server calls Sage2 at its default endpoint; entries[].ms is the server-side wall clock of each Sage2 call (with its hedge and retries)' }), perStep, allSteps: lat(ok.map((x) => x.ms)), onboardingTotalIfEachStepMedian: round(Object.values(perStep).reduce((s, p) => s + p.stepMs.median, 0)), rows });
for (const [k, v] of Object.entries(perStep)) console.log(`${k.padEnd(7)} n=${v.calls} failed=${v.failed} step ms median ${v.stepMs.median} p95 ${v.stepMs.p95} max ${v.stepMs.max} | sage2 calls ${v.sage2Calls} in ${v.inTokMean} out ${v.outTokMean} cost ${v.costPerStep.toFixed(6)}`);
console.log(`all: median ${lat(ok.map((x) => x.ms)).median} p95 ${lat(ok.map((x) => x.ms)).p95}; sum of step medians ${round(Object.values(perStep).reduce((s, p) => s + p.stepMs.median, 0))}`);

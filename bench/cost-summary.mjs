/* Sage2 cost per call, from the token fields the API returned in the other raw files, and the price constants of the game.
   Cost of a call = (billed_input_tokens x input price + output_tokens x output price) / 1,000,000, as server/sage.mjs costOf() does.
   Usage: GAME_DIR=<game folder> node bench/cost-summary.mjs [--pricing <file with the levanto.ai/pricing text read on the day>]
   Reads: tactics, world, step-latency raw files in OUT_DIR. Raw output: <OUT_DIR>/cost-<date>.json */
import fs from 'node:fs';
import path from 'node:path';
import { prices, OUT_DIR, DATE, provenance, writeResult, round, median, quantile, mean, arg } from './lib.mjs';

const { PRICE } = await prices();
const read = (n) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${n}-${DATE}.json`), 'utf8'));
const cost = (i, o) => (i * PRICE.input + o * PRICE.output) / 1e6;
const stat = (a) => ({ n: a.length, mean: mean(a), median: median(a), p95: quantile(a, 0.95), max: Math.max(...a) });

const t = read('tactics'); const tRows = t.rows[0].filter((r) => r.ok);
const w = read('world'); const wRows = w.rows[0].filter((r) => r.ok);
const s = read('step-latency');
const out = {
  name: 'cost', provenance: provenance({ priceConstantsInGame: PRICE, unit: 'USD per 1M tokens' }),
  tacticsCall: { what: 'one tactic request (one foe group)', inputTokens: stat(tRows.map((r) => r.inTok)), outputTokens: stat(tRows.map((r) => r.outTok)), costUsd: stat(tRows.map((r) => cost(r.inTok, r.outTok))) },
  originStep: { what: 'batch of 2 requests (biome, world), input and output tokens of the batch', inputTokens: stat(wRows.map((r) => r.inTok)), outputTokens: stat(wRows.map((r) => r.outTok)), batchCostUsd: stat(wRows.map((r) => cost(r.inTok, r.outTok))) },
  steps: Object.fromEntries(Object.entries(s.perStep).map(([k, v]) => [k, { sage2Calls: v.sage2Calls, inTokMean: v.inTokMean, outTokMean: v.outTokMean, costPerStepUsd: v.costPerStep }])),
  onboardingSixStepsUsd: Object.values(s.perStep).reduce((a, v) => a + v.costPerStep, 0),
  note: 'Extract calls bill output tokens (the extracted words); Choice and Scale calls in the batch bill input only. Prices: see pricing-2026-11-18.json.',
};
const pf = arg('pricing', null); if (pf) out.pricingPageText = fs.readFileSync(pf, 'utf8');
writeResult('cost', out);
console.log(`tactics call: ${out.tacticsCall.inputTokens.mean.toFixed(0)} in, ${out.tacticsCall.outputTokens.mean} out, $${out.tacticsCall.costUsd.mean.toFixed(7)} mean`);
for (const [k, v] of Object.entries(out.steps)) console.log(`${k}: ${v.sage2Calls} calls, in ${v.inTokMean}, out ${v.outTokMean}, $${v.costPerStepUsd.toFixed(6)}`);
console.log(`six onboarding steps: $${out.onboardingSixStepsUsd.toFixed(6)}`);

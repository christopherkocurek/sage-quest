/* LLM-alone baseline: the same decisions as the Sage2 benchmarks, answered by a general model through the Claude Code CLI
   (`claude -p`), so no API key is needed; it runs on the user's own plan.
   The prompt holds exactly what Sage2 gets: the content, the question's instructions and the option ids with their text.
   The model must answer with one option id as JSON. The CLI runs with no tools, one turn, no saved session, no user
   settings and no slash commands, from an empty working folder.
   What the numbers mean:
   - duration_api_ms is the model call time the CLI reports; wall_ms is the whole process (start-up included). Neither is
     comparable one-to-one with a direct HTTP call to Sage2, because the CLI adds start-up and a system prompt of about 650 tokens.
   - total_cost_usd is the CLI's LIST-PRICE equivalent for that call. On a subscription plan it is not billed.
   - A general model returns one answer with no probability per option. Sage2 returns a probability for every option.
   Usage: GAME_DIR=<game folder> node bench/llm-baseline.mjs --models claude-haiku-5-5,claude-fable-5-2
          [--tasks tactics,world] [--runs 2] [--sample 48] [--concurrency 2] [--sage-tactics <raw file>] [--sage-world <raw file>] [--effort low]
   Raw output: <OUT_DIR>/llm-baseline-<date>.json and a per-call log <OUT_DIR>/llm-baseline-calls-<date>.jsonl (a rerun resumes from it) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { importGame, pool, lat, round, sample, provenance, writeResult, arg, OUT_DIR, DATE, median, quantile, mean } from './lib.mjs';
import { tacticCases, WORLD_SET } from './cases.mjs';

const MODELS = arg('models', 'claude-haiku-5-5,claude-fable-5-2').split(',');
const TASKS = arg('tasks', 'tactics,world').split(',');
const RUNS = Number(arg('runs', 2)); const SAMPLE = Number(arg('sample', 48)); const CONC = Number(arg('concurrency', 2));
const EFFORT = arg('effort', null);
const sageTacticsFile = arg('sage-tactics', path.join(OUT_DIR, `tactics-${DATE}.json`));
const sageWorldFile = arg('sage-world', path.join(OUT_DIR, `world-${DATE}.json`));
const { tacticQuestion, worldQuestion, STEPS, stepContent } = await importGame('game/questions.mjs');

const SYSTEM = 'You are a decision function inside a game. You get a situation and a question with a list of options. Choose exactly one option. Reply with JSON only and nothing else, in this form: {"option": "<option id>"}.';
const promptOf = (content, q) => `${content}\n\nQuestion: ${q.instructions}\n\nOptions:\n${q.options.map((o) => `- ${o.option}: ${o.description}`).join('\n')}\n\nReply with JSON only: {"option": "<one option id from the list>"}`;

/* ---- the tasks ---- */
const tasks = [];
if (TASKS.includes('tactics')) {
  const all = await tacticCases(); const picked = sample(all, SAMPLE, 1).filter((c) => c.asked); /* sets with one legal tactic are not sent to Sage2 by the game, so they are not asked here either */
  for (const c of picked) { const q = tacticQuestion(c.offered); tasks.push({ task: 'tactics', key: c.key, options: q.options.map((o) => o.option), prompt: promptOf(c.content, q) }); }
}
if (TASKS.includes('world')) {
  const step = STEPS.find((s) => s.id === 'origin'); const q = worldQuestion();
  for (const c of WORLD_SET) tasks.push({ task: 'world', key: `${c.label}|${c.answer}`, label: c.label, expected: c.expected, options: q.options.map((o) => o.option), prompt: promptOf(stepContent(step, c.answer), q) });
}

/* ---- one CLI call ---- */
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-baseline-')); /* empty folder: no project instructions are picked up */
function callCli(model, prompt) {
  return new Promise((resolve) => {
    const args = ['-p', '--output-format', 'json', '--model', model, '--max-turns', '1', '--tools', '', '--disable-slash-commands', '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--system-prompt', SYSTEM, ...(EFFORT ? ['--effort', EFFORT] : [])];
    const t0 = performance.now(); const p = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    const killer = setTimeout(() => p.kill('SIGTERM'), 180000);
    p.on('close', (code) => { clearTimeout(killer); resolve({ code, out, err: err.slice(0, 200), wallMs: performance.now() - t0 }); });
    p.stdin.end(prompt);
  });
}
function parseAnswer(text, options) {
  const clean = String(text || '').replace(/```(?:json)?/g, '').trim();
  const m = clean.match(/\{[\s\S]*?\}/);
  if (!m) return { kind: 'unparseable', option: null };
  try { const j = JSON.parse(m[0]); const o = typeof j.option === 'string' ? j.option.trim() : null; if (!o) return { kind: 'unparseable', option: null }; return options.includes(o) ? { kind: 'valid', option: o } : { kind: 'invalid-option', option: o }; } catch { return { kind: 'unparseable', option: null }; }
}

/* ---- checkpoint log ---- */
fs.mkdirSync(OUT_DIR, { recursive: true });
const logFile = path.join(OUT_DIR, `llm-baseline-calls-${DATE}.jsonl`);
const done = new Map();
if (fs.existsSync(logFile)) for (const l of fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); if (r.promptHash) done.set(`${r.model}|${r.task}|${r.key}|${r.run}|${r.promptHash}`, r); }

const jobs = [];
/* a logged call is reused only when its prompt hash matches, so a changed question is asked again */
for (const t of tasks) t.promptHash = crypto.createHash('md5').update(t.prompt).digest('hex').slice(0, 12);
for (const model of MODELS) for (let run = 0; run < RUNS; run++) for (const t of tasks) jobs.push({ model, run, ...t });
console.log(`${jobs.length} calls (${done.size} already logged)`);
let n = 0;
const results = await pool(jobs, CONC, async (j) => {
  const id = `${j.model}|${j.task}|${j.key}|${j.run}|${j.promptHash}`;
  if (done.has(id)) return done.get(id);
  let rec = null;
  for (let k = 0; k < 3 && !rec; k++) {
    const r = await callCli(j.model, j.prompt);
    let js = null; try { js = JSON.parse(r.out); } catch { /* not JSON */ }
    if (js && !js.is_error && r.code === 0) {
      const a = parseAnswer(js.result, j.options); const u = js.usage || {};
      rec = { model: j.model, task: j.task, key: j.key, run: j.run, promptHash: j.promptHash, label: j.label ?? null, expected: j.expected ?? null, answerKind: a.kind, option: a.option, raw: String(js.result).slice(0, 200), tries: k + 1,
        apiMs: js.duration_api_ms, durationMs: js.duration_ms, ttftMs: js.ttft_ms ?? null, wallMs: round(r.wallMs), costUsd: js.total_cost_usd,
        inTok: u.input_tokens, outTok: u.output_tokens, thinkTok: u.output_tokens_details?.thinking_tokens ?? 0, cacheWriteTok: u.cache_creation_input_tokens, cacheReadTok: u.cache_read_input_tokens, stop: js.stop_reason };
    } else if (k === 2) rec = { model: j.model, task: j.task, key: j.key, run: j.run, promptHash: j.promptHash, label: j.label ?? null, expected: j.expected ?? null, answerKind: 'cli-error', option: null, tries: 3, wallMs: round(r.wallMs), error: (js?.result || r.err || r.out).toString().slice(0, 200) };
    else await new Promise((res) => setTimeout(res, 3000 * (k + 1)));
  }
  fs.appendFileSync(logFile, JSON.stringify(rec) + '\n');
  if (++n % 20 === 0) console.log(`${n}/${jobs.length}`);
  return rec;
});

/* ---- Sage2 reference answers from the tactics- and world- raw files in bench/measurements/ ---- */
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const sT = readJson(sageTacticsFile); const sW = readJson(sageWorldFile);
const sageTactic = new Map((sT?.rows?.[0] || []).filter((r) => r.ok).map((r) => [r.key, r.pick]));
const sageWorld = new Map((sW?.rows?.[0] || []).filter((r) => r.ok).map((r) => [`${r.label}|${r.answer}`, r.pick]));

const summary = {};
for (const model of MODELS) for (const task of TASKS) {
  const rs = results.filter((r) => r.model === model && r.task === task);
  const sageMap = task === 'tactics' ? sageTactic : sageWorld;
  const okRs = rs.filter((r) => r.answerKind !== 'cli-error');
  const valid = rs.filter((r) => r.answerKind === 'valid');
  const withSage = valid.filter((r) => sageMap.get(r.key) != null);
  const agree = withSage.filter((r) => sageMap.get(r.key) === r.option).length;
  /* repeat agreement: run 0 against run 1 on the same prompt */
  const byKey = new Map(); for (const r of rs) { (byKey.get(r.key) || byKey.set(r.key, []).get(r.key))[r.run] = r; }
  const pairs = [...byKey.values()].filter((p) => p[0]?.answerKind === 'valid' && p[1]?.answerKind === 'valid');
  const same = pairs.filter((p) => p[0].option === p[1].option).length;
  const s = {
    calls: rs.length, cliErrors: rs.filter((r) => r.answerKind === 'cli-error').length, retriedCalls: rs.filter((r) => r.tries > 1).length,
    unparseable: rs.filter((r) => r.answerKind === 'unparseable').length, invalidOption: rs.filter((r) => r.answerKind === 'invalid-option').length, valid: valid.length,
    apiMs: lat(okRs.map((r) => r.apiMs)), wallMs: lat(okRs.map((r) => r.wallMs)), ttftMs: lat(okRs.filter((r) => r.ttftMs != null).map((r) => r.ttftMs)),
    costUsdPerDecision: { mean: mean(okRs.map((r) => r.costUsd)), median: median(okRs.map((r) => r.costUsd)), total: okRs.reduce((s2, r) => s2 + r.costUsd, 0) },
    tokensPerDecisionMean: { input: round(mean(okRs.map((r) => r.inTok)), 1), cacheWrite: round(mean(okRs.map((r) => r.cacheWriteTok)), 1), cacheRead: round(mean(okRs.map((r) => r.cacheReadTok)), 1), output: round(mean(okRs.map((r) => r.outTok)), 1), thinking: round(mean(okRs.map((r) => r.thinkTok)), 1) },
    agreementWithSage2: { compared: withSage.length, same: agree, pct: round((agree / Math.max(1, withSage.length)) * 100) },
    repeatAgreement: { pairs: pairs.length, same, pct: round((same / Math.max(1, pairs.length)) * 100) },
    spread: valid.reduce((o, r) => ((o[r.option] = (o[r.option] || 0) + 1), o), {}),
  };
  if (task === 'world') {
    const clear = valid.filter((r) => r.label !== 'nofit' && r.label !== 'hard'); const grp = (f) => valid.filter(f);
    const acc = (l) => ({ n: l.length, right: l.filter((r) => r.option === r.expected).length, pct: round((l.filter((r) => r.option === r.expected).length / Math.max(1, l.length)) * 100) });
    s.accuracyClear = acc(clear); s.accuracyHard = acc(grp((r) => r.label === 'hard')); s.accuracyNofit = acc(grp((r) => r.label === 'nofit'));
  }
  summary[`${model}|${task}`] = s;
}
writeResult('llm-baseline', { name: 'llm-baseline', provenance: provenance({ models: MODELS, tasks: TASKS, runs: RUNS, concurrency: CONC, tacticsSample: `${SAMPLE} of ${(await tacticCases()).length} fact sets, seeded shuffle (seed 1), same sample for every model and run; sets with one legal tactic are left out because the game does not send them to Sage2`, effort: EFFORT || 'CLI default', cliArgs: 'claude -p --output-format json --model <id> --max-turns 1 --tools "" --disable-slash-commands --no-session-persistence --setting-sources "" --strict-mcp-config --system-prompt <decision-function text>', cliVersion: 'see `claude --version`', sageReference: { tactics: path.basename(sageTacticsFile), world: path.basename(sageWorldFile) }, costNote: 'costUsd is the CLI list-price equivalent; not billed on a subscription plan' }), summary, calls: results });
for (const [k, s] of Object.entries(summary)) console.log(`${k}: calls ${s.calls} valid ${s.valid} unparseable ${s.unparseable} invalid ${s.invalidOption} errors ${s.cliErrors} | api ms median ${s.apiMs.median} p95 ${s.apiMs.p95} | wall median ${s.wallMs.median} | $${s.costUsdPerDecision.mean?.toFixed(5)}/decision | agree w/ Sage2 ${s.agreementWithSage2.pct}% | repeat ${s.repeatAgreement.pct}%${s.accuracyClear ? ` | world clear ${s.accuracyClear.pct}% hard ${s.accuracyHard.pct}% nofit ${s.accuracyNofit.pct}%` : ''}`);
fs.rmSync(cwd, { recursive: true, force: true });

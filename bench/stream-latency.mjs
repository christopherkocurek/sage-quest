/* Streaming latency of the live onboarding Choice (the `live` question of each step in STEPS, game/questions.mjs).
   A spoken answer is simulated as one word per chunk at a fixed pace (default 400 ms per word, about 150 words a minute),
   appended to a Sage2 stream. Three paths:
     direct-changes  openStream from server/sage.mjs straight to Sage2, emit 'changes' (what the game's relay asks for)
     direct-all      the same, emit 'all': a frame for every append, so the update latency of each word can be seen
     relay           the game's own /ws/onboard on a local server (--base), which sends the whole text so far on each word,
                     as the browser does (web/src/net.js openOnboard)
   Per answer it reports:
     (a) last-append-to-final: time from the last word to the frame that holds the final pick (negative = the pick had
         already reached its final value before the speech ended); in direct-all also the time to the first frame that
         covers the whole text
     (b) words before the pick first matched its final value and stayed, as a share of the answer
     (c) whether the final streamed pick equals the pick of one batch call on the full text
   pick = `chosen`, else the leading option.
   Usage: GAME_DIR=<game folder> node bench/stream-latency.mjs --path direct-changes|direct-all|relay [--base http://localhost:8790]
          [--paceMs 400] [--concurrency 3] [--limit N]
   Raw output: <OUT_DIR>/stream-<path>-<date>.json */
import { loadEnv, importGame, rawDecide, top, pool, lat, round, median, provenance, writeResult, arg, sleep } from './lib.mjs';
import { WORLD_SET, HEART_SET } from './cases.mjs';

loadEnv();
const PATH_ = arg('path', 'direct-changes'); const PACE = Number(arg('paceMs', 400)); const CONC = Number(arg('concurrency', 3)); const LIMIT = Number(arg('limit', 0));
const BASE = arg('base', 'http://localhost:8790');
const { STEPS, stepContent } = await importGame('game/questions.mjs');
const { kitFor } = await importGame('game/worlds.mjs');
const { openStream, unwrap, costOf } = await importGame('server/sage.mjs');
const K = kitFor('dark');
const stepOf = (id) => STEPS.find((s) => s.id === id);

let items = [
  ...WORLD_SET.filter((c) => c.label !== 'hard' && c.label !== 'nofit').map((c) => ({ step: 'origin', question: 'biome', answer: c.answer })),
  ...HEART_SET.map(([, a]) => ({ step: 'heart', question: 'motive', answer: a })),
];
if (LIMIT) items = items.filter((_, i) => i % Math.ceil(items.length / LIMIT) === 0);

const pickOf = (a) => (a ? (a.chosen ?? a.lead ?? null) : null);
const shape = (res) => { const r = unwrap(res); return r ? top(r) : null; };

/* One simulated answer on one path. Returns the time-stamped frames and the append times (ms from the first append). */
async function simulate(it) {
  const step = stepOf(it.step); const words = it.answer.split(/\s+/); const chunks = words.map((w, i) => (i ? ' ' : '') + w);
  const cum = []; let c = stepContent(step, '').length; for (const ch of chunks) { c += Array.from(ch).length; cum.push(c); }
  const frames = []; const appends = []; let readyMs = null; let T0 = null; let errors = [];
  const now = () => performance.now();
  const openAt = now();
  const note = (f) => frames.push({ t: now() - (T0 ?? openAt), ...f });

  if (PATH_ === 'relay') {
    const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws/onboard');
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws open')); });
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === 'ready') readyMs = now() - openAt; else if (m.t === 'decision') note({ chars: m.chars, changed: m.changed, answer: m.answers?.[it.question] ? { chosen: m.answers[it.question].chosen, lead: m.answers[it.question].lead, leadP: m.answers[it.question].leadP } : null, serverMs: m.log?.serverMs ?? null, usage: null }); else if (m.t === 'error') errors.push(m.detail); };
    T0 = now(); let full = '';
    for (let i = 0; i < chunks.length; i++) {
      const due = T0 + i * PACE; await sleep(Math.max(0, due - now()));
      full += chunks[i]; appends.push({ t: now() - T0, chars: cum[i] }); ws.send(JSON.stringify({ t: 'text', step: it.step, text: full }));
    }
    await sleep(3000); ws.close();
  } else {
    const emit = PATH_ === 'direct-all' ? 'all' : 'changes';
    let ready; const readyP = new Promise((r) => (ready = r));
    const s = openStream({ questions: step.live(K), content: stepContent(step, ''), emit,
      onState: (st, d) => { if (st === 'ready') { readyMs = now() - openAt; ready(); } else if (st === 'error') errors.push(d?.detail || d?.code || 'error'); },
      onDecision: (f) => { const a = f.answers?.[it.question]; note({ chars: f.chars, seq: f.seq, changed: f.changed, answer: a ? shape(a) : null, serverMs: f.latency_ms, usage: f.usage ?? null }); } });
    await Promise.race([readyP, sleep(8000)]);
    T0 = now();
    for (let i = 0; i < chunks.length; i++) {
      const due = T0 + i * PACE; await sleep(Math.max(0, due - now()));
      appends.push({ t: now() - T0, chars: cum[i] }); s.append(chunks[i]);
    }
    /* 'all' mode: wait for the frame that covers the whole text; 'changes' mode: a fixed tail to catch late change frames */
    const lastT = now();
    if (emit === 'all') { while (now() - lastT < 6000 && !frames.some((f) => f.chars >= cum.at(-1))) await sleep(20); } else await sleep(3000);
    s.close();
  }
  return { words: words.length, cum, frames, appends, readyMs, errors };
}

function analyse(it, sim) {
  const { cum, frames, appends } = sim; const n = sim.words; const tLast = appends.at(-1)?.t ?? 0;
  const fr = frames.filter((f) => f.answer); /* frames that carry the question */
  /* pick after word k = pick of the first frame that covers word k (frames are in time order) */
  const afterWord = cum.map((c) => fr.find((f) => f.chars >= c) ?? null);
  const finalFrame = fr.at(-1) ?? null; const finalPick = pickOf(finalFrame?.answer);
  let out = { step: it.step, answer: it.answer, words: n, ok: !!finalFrame, finalPick, finalLeadP: finalFrame ? round(finalFrame.answer.leadP, 4) : null, frames: frames.length, readyMs: round(sim.readyMs), errors: sim.errors };
  /* the frame where the pick last changed to its final value (frames in time order) */
  let k = fr.length - 1; while (k > 0 && pickOf(fr[k - 1].answer) === finalPick) k--;
  const settleFrame = fr[k] ?? null;
  out.settleMsFromLastAppend = settleFrame ? round(settleFrame.t - tLast) : null; /* negative: already final before the end */
  out.settledBeforeEnd = settleFrame ? settleFrame.t <= tLast : null;
  /* words heard when the settle frame arrived (frame chars -> words) */
  const heard = settleFrame ? Math.max(0, cum.findIndex((c) => c >= settleFrame.chars) + 1 || n) : null;
  out.wordsAtSettle = heard; out.settleFractionPct = heard != null ? round((heard / n) * 100) : null;
  if (PATH_ === 'direct-all') {
    /* every append has a frame: per-word update latency, and the pick after each word */
    const lat1 = appends.map((a, i) => (afterWord[i] ? afterWord[i].t - a.t : null)).filter((x) => x != null);
    out.perWordUpdateMs = lat1.map((x) => round(x));
    out.lastWordToFrameMs = afterWord.at(-1) ? round(afterWord.at(-1).t - tLast) : null;
    out.pickAfterWord = afterWord.map((f) => pickOf(f?.answer));
    let j = n - 1; while (j > 0 && out.pickAfterWord[j - 1] === finalPick) j--;
    out.firstWordWithFinalPick = j + 1; out.finalPickFractionPct = round(((j + 1) / n) * 100);
    out.frameUsage = frames.filter((f) => f.usage).map((f) => ({ in: f.usage.input_tokens, out: f.usage.output_tokens, cost: costOf(f.usage) }));
    out.serverMsPerFrame = frames.map((f) => f.serverMs).filter((x) => x != null);
  }
  out.framesAfterLastAppend = frames.filter((f) => f.t > tLast).length;
  out.frameTimes = frames.map((f) => ({ t: round(f.t), chars: f.chars, pick: pickOf(f.answer), changed: f.changed }));
  out.appendTimes = appends.map((a) => ({ t: round(a.t), chars: a.chars }));
  return out;
}

const rows = await pool(items, CONC, async (it) => {
  let sim = null;
  for (let k = 0; k < 3; k++) { try { sim = await simulate(it); if (sim.frames.length) break; } catch (e) { sim = { words: it.answer.split(/\s+/).length, cum: [], frames: [], appends: [], errors: [String(e.message || e)], readyMs: null }; } await sleep(1000); }
  const r = analyse(it, sim);
  /* (c) one batch call on the full text, same question */
  const step = stepOf(it.step);
  const b = await rawDecide([{ content: stepContent(step, it.answer), questions: step.live(K) }]);
  const bp = pickOf(top(b.answers[0]?.[it.question]));
  r.batchPick = bp; r.batchClientMs = round(b.ms); r.batchServerMs = b.serverMs; r.finalEqualsBatch = r.ok ? r.finalPick === bp : null;
  return r;
});

const ok = rows.filter((r) => r.ok);
const byStep = (s) => ok.filter((r) => r.step === s);
const sum = (list) => ({
  answers: list.length, words: lat(list.map((r) => r.words)),
  settleMsFromLastAppend: lat(list.map((r) => r.settleMsFromLastAppend)), settledBeforeEnd: list.filter((r) => r.settledBeforeEnd).length,
  settledAfterEnd: list.filter((r) => r.settledBeforeEnd === false).length,
  settleAfterEndMs: list.filter((r) => r.settledBeforeEnd === false).length ? lat(list.filter((r) => r.settledBeforeEnd === false).map((r) => r.settleMsFromLastAppend)) : null,
  wordsAtSettlePctOfAnswer: lat(list.map((r) => r.settleFractionPct)),
  finalEqualsBatch: list.filter((r) => r.finalEqualsBatch).length, finalDiffersFromBatch: list.filter((r) => r.finalEqualsBatch === false).length,
  batchClientMs: lat(list.map((r) => r.batchClientMs)), batchServerMs: lat(list.filter((r) => r.batchServerMs != null).map((r) => r.batchServerMs)),
  readyMs: lat(list.filter((r) => r.readyMs != null).map((r) => r.readyMs)),
  ...(PATH_ === 'direct-all' ? { lastWordToCoveringFrameMs: lat(list.map((r) => r.lastWordToFrameMs).filter((x) => x != null)), perWordUpdateMs: lat(list.flatMap((r) => r.perWordUpdateMs)), finalPickFractionPct: lat(list.map((r) => r.finalPickFractionPct)), serverMsPerFrame: lat(list.flatMap((r) => r.serverMsPerFrame)), frameTokens: { inMean: round(median(list.flatMap((r) => r.frameUsage.map((u) => u.in)))), outMedian: median(list.flatMap((r) => r.frameUsage.map((u) => u.out))), costMean: list.flatMap((r) => r.frameUsage.map((u) => u.cost)).reduce((a, b) => a + b, 0) / Math.max(1, list.flatMap((r) => r.frameUsage).length) } } : {}),
  framesPerAnswer: lat(list.map((r) => r.frames)),
});
const summary = { all: sum(ok), origin: sum(byStep('origin')), heart: sum(byStep('heart')), failed: rows.length - ok.length, withErrors: rows.filter((r) => r.errors.length).length };
const diffs = ok.filter((r) => r.finalEqualsBatch === false).map((r) => ({ step: r.step, answer: r.answer, stream: r.finalPick, batch: r.batchPick, leadP: r.finalLeadP }));
writeResult(`stream-${PATH_}`, { name: `stream-${PATH_}`, provenance: provenance({ path: PATH_, base: PATH_ === 'relay' ? BASE : null, paceMsPerWord: PACE, wordsPerMinute: round(60000 / PACE), concurrency: CONC, setSize: items.length, setDescription: '40 clear origin answers (live question: biome) + 17 heart answers (live question: motive)', note: 'the origin step streams only the biome question; the world question is asked in the final batch only' }), summary, differs: diffs, rows });
for (const [k, s] of Object.entries(summary)) if (s.answers) console.log(`${k}: n ${s.answers} | settle vs last word: median ${s.settleMsFromLastAppend.median} ms p95 ${s.settleMsFromLastAppend.p95} (before end ${s.settledBeforeEnd}, after end ${s.settledAfterEnd}${s.settleAfterEndMs ? `, after-end median ${s.settleAfterEndMs.median} p95 ${s.settleAfterEndMs.p95}` : ''}) | settled at ${s.wordsAtSettlePctOfAnswer.median}% of words (median) | final = batch ${s.finalEqualsBatch}/${s.answers} | batch client ms median ${s.batchClientMs.median} p95 ${s.batchClientMs.p95} server ${s.batchServerMs.median}${s.lastWordToCoveringFrameMs ? ` | last word -> covering frame median ${s.lastWordToCoveringFrameMs.median} p95 ${s.lastWordToCoveringFrameMs.p95}; per-word update median ${s.perWordUpdateMs.median} p95 ${s.perWordUpdateMs.p95}` : ''}`);
console.log(`failed ${summary.failed}, with errors ${summary.withErrors}`); for (const d of diffs) console.log(`DIFF ${d.step} stream ${d.stream} batch ${d.batch} (${d.leadP}) | ${d.answer}`);
process.exit(0);

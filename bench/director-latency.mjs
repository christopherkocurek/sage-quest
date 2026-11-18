/* Director stream latency: time from the end-of-wave ask to the answer.
   A synthetic fight log is built from the line templates of web/src/fight.js (`director.event(...)`): wave starts, tactics,
   kills, hits, wave ends. Lines are sent quickly (the wave itself takes many seconds in the game, so the stream has
   caught up by the ask). The last line, "Wave N ends ...", and the ask follow at once, as endWave does.
   Paths:
     direct  openStream from server/sage.mjs, questions directorQuestions(), emit 'all'; time from the last append and
             evaluate to the first frame that covers the whole log
     relay   the game's /ws/director on a local server (--base): {t:'event'} lines, then {t:'ask'}; time to the {t:'beat'} reply
   Scenarios: log after 1, 3 and 6 waves, hero healthy or badly hurt. 3 repeats each.
   Usage: GAME_DIR=<game folder> node bench/director-latency.mjs [--base http://localhost:8790] [--reps 3]
   Raw output: <OUT_DIR>/director-<date>.json */
import { loadEnv, importGame, top, lat, round, provenance, writeResult, arg, sleep } from './lib.mjs';

loadEnv(); const BASE = arg('base', 'http://localhost:8790'); const REPS = Number(arg('reps', 3));
const { directorQuestions } = await importGame('game/questions.mjs');
const { openStream, unwrap } = await importGame('server/sage.mjs');
const HEAD = 'Event log of one fight on the road.\n';

function fightLog(waves, hurt) {
  const lines = []; const maxHp = 12; let hp = maxHp; let kills = 0;
  lines.push('The hero is Knight with 12 health, armed with a sword.');
  for (let w = 1; w <= waves; w++) {
    lines.push(`Wave ${w} starts: ${w + 1} Hollow Guards and ${w} Hollow Stalkers.`);
    for (let i = 0; i < 4 + w; i++) {
      lines.push(`Hollow Guards take the tactic ${['charge', 'flank', 'guard', 'feint'][i % 4]}.`);
      lines.push(i % 3 === 0 ? 'The hero blocks a slash.' : i % 3 === 1 ? 'The hero dodges a hook.' : 'The hero parries a slash and leaves it open.');
      kills++; lines.push(`The hero kills a Hollow ${i % 2 ? 'Stalker' : 'Guard'}. Hero health ${hp} of ${maxHp}.`);
      if (hurt && hp > 3 && i % 2 === 0) { hp -= 2; lines.push(`A Hollow Guard hits the hero for 2. Hero health ${hp} of ${maxHp}.`); }
    }
    if (hurt) hp = Math.max(2, hp);
    const tail = `Wave ${w} ends after ${30 + w * 4} seconds. Hero health ${hp} of ${maxHp}${hp <= maxHp * 0.4 ? ', badly hurt' : hp >= maxHp * 0.75 ? ', high health' : ', medium health'}. This wave: ${hurt ? 8 : 1} damage taken, ${3 + w} blocks, ${2 + w} dodges. Enemies killed so far: ${kills}. Waves fought: ${w}.`;
    if (w < waves) lines.push(tail); else lines.push(tail);
  }
  return lines;
}
const chars = (s) => Array.from(s).length;
const beatOf = (answers) => { const b = top(unwrap(answers?.beat)); return { beat: b?.chosen ?? b?.lead ?? null, beatP: b ? round(b.leadP, 3) : null, pressure: round(unwrap(answers?.pressure)?.expectation, 2) }; };

async function direct(lines) {
  const frames = []; const now = () => performance.now(); let ready; const rp = new Promise((r) => (ready = r)); const errors = [];
  const open0 = now(); let readyMs = null;
  const s = openStream({ questions: directorQuestions(), content: HEAD, emit: 'all', onState: (st, d) => { if (st === 'ready') { readyMs = now() - open0; ready(); } else if (st === 'error') errors.push(d?.detail || d?.code); }, onDecision: (f) => frames.push({ t: now(), chars: f.chars, answers: f.answers, serverMs: f.latency_ms, usage: f.usage }) });
  await Promise.race([rp, sleep(8000)]);
  let total = chars(HEAD); const body = lines.slice(0, -1);
  for (const l of body) { const line = l.slice(0, 160) + '\n'; total += chars(line); s.append(line); await sleep(40); }
  const wait0 = now(); while (now() - wait0 < 8000 && !frames.some((f) => f.chars >= total)) await sleep(20); /* stream has caught up before the wave ends */
  const last = lines.at(-1).slice(0, 160) + '\n'; total += chars(last);
  const tAsk = now(); s.append(last); s.evaluate();
  while (now() - tAsk < 8000 && !frames.some((f) => f.chars >= total && f.t >= tAsk)) await sleep(10);
  const f = frames.find((x) => x.chars >= total && x.t >= tAsk); s.close();
  return { ok: !!f, askToAnswerMs: f ? round(f.t - tAsk) : null, serverMs: f?.serverMs ?? null, readyMs: round(readyMs), logChars: total, inTok: f?.usage?.input_tokens ?? null, outTok: f?.usage?.output_tokens ?? null, ...(f ? beatOf(f.answers) : {}), errors };
}
async function relay(lines) {
  const now = () => performance.now(); const errors = []; let beat = null; let resolveBeat; const bp = new Promise((r) => (resolveBeat = r)); let ready; const rp = new Promise((r) => (ready = r));
  const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws/director');
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws open')); });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === 'ready') ready(); else if (m.t === 'error') errors.push(m.detail); else if (m.t === 'beat') { beat = { t: now(), m }; resolveBeat(); } };
  await Promise.race([rp, sleep(8000)]);
  for (const l of lines.slice(0, -1)) { ws.send(JSON.stringify({ t: 'event', line: l })); await sleep(40); }
  await sleep(2500); /* the stream catches up */
  const tAsk = now(); ws.send(JSON.stringify({ t: 'event', line: lines.at(-1) })); ws.send(JSON.stringify({ t: 'ask', rev: 1 }));
  await Promise.race([bp, sleep(8000)]); ws.close();
  const a = beat?.m?.answers;
  return { ok: !!a, askToAnswerMs: beat ? round(beat.t - tAsk) : null, serverMs: beat?.m?.log?.serverMs ?? null, timedOutOrEmpty: !!beat && !a, errors, ...(a ? { beat: a.beat?.chosen ?? a.beat?.lead ?? null, beatP: round(a.beat?.leadP ?? 0, 3), pressure: round(a.pressure?.expectation, 2) } : {}) };
}

const SCEN = [[1, false], [1, true], [3, false], [3, true], [6, false], [6, true]];
const rows = [];
for (const [waves, hurt] of SCEN) for (const pathName of ['direct', 'relay']) for (let rep = 0; rep < REPS; rep++) {
  const lines = fightLog(waves, hurt);
  let r; try { r = await (pathName === 'direct' ? direct(lines) : relay(lines)); } catch (e) { r = { ok: false, errors: [String(e.message || e)] }; }
  rows.push({ path: pathName, waves, hero: hurt ? 'badly hurt' : 'healthy', lines: lines.length, rep, ...r }); await sleep(500);
}
const grp = (f) => rows.filter((r) => r.ok && f(r));
const summary = {};
for (const p of ['direct', 'relay']) { summary[p] = { all: lat(grp((r) => r.path === p).map((r) => r.askToAnswerMs)), failed: rows.filter((r) => r.path === p && !r.ok).length, byScenario: Object.fromEntries(SCEN.map(([w, h]) => { const g = grp((r) => r.path === p && r.waves === w && (r.hero === 'badly hurt') === h); return [`${w} waves, ${h ? 'hurt' : 'healthy'}`, { askToAnswerMs: lat(g.map((r) => r.askToAnswerMs)), logChars: g[0]?.logChars ?? null, beats: g.map((r) => r.beat), pressure: g.map((r) => r.pressure) }]; })) }; }
writeResult('director', { name: 'director', provenance: provenance({ base: BASE, reps: REPS, scenarios: SCEN.map(([w, h]) => `${w} waves ${h ? 'hurt' : 'healthy'}`), askTimeoutMsInGame: 6000, note: 'synthetic log built from the line templates of web/src/fight.js' }), summary, rows });
for (const [p, s] of Object.entries(summary)) { console.log(`${p}: ask->answer median ${s.all.median} p95 ${s.all.p95} max ${s.all.max} ms (n ${s.all.n}, failed ${s.failed})`); for (const [k, v] of Object.entries(s.byScenario)) console.log(`  ${k}: median ${v.askToAnswerMs.median} p95 ${v.askToAnswerMs.p95} | log ${v.logChars} chars | beats ${v.beats.join(',')} | pressure ${v.pressure.join(',')}`); }
process.exit(0);

/* Dev server + Sage2 relay. The browser never sees the key and never sends a question:
   it sends text and game facts, and this file builds every Sage2 request. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { decideBatch, extract, openStream, unwrap, costOf, hasKey } from './sage.mjs';
import {
  stepById, stepContent, forgeQuestions, answerQuestion, WEAPON_ASK, namingQuestion, tacticQuestion, directorQuestions, vowQuestions, VOW_ASK, VOW_EXTRACT,
} from '../game/questions.mjs';
import { VERBS, TACTICS, FOES, BOSSES, byId, signOf, seedOf, monthDay, ageBand } from '../game/kit.mjs';
import { kitFor, WORLD_IDS } from '../game/worlds.mjs';
/* a world id from the browser: one of the five, else dark */
const worldOf = (w) => (WORLD_IDS.includes(w) ? w : 'dark');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8790);
const MAX_TEXT = 1200;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

/* ---------- rate limit: per IP, sliding minute ---------- */
const hits = new Map();
function allow(ip, limit) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (list.length >= limit) { hits.set(ip, list); return false; }
  list.push(now); hits.set(ip, list); return true;
}
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').toString().split(',')[0].trim();

/* ---------- log entries for the on-screen feed ---------- */
function entry(pattern, label, r, detail) {
  return {
    pattern, label, detail,
    ms: Math.round(r.ms ?? 0),
    serverMs: r.serverMs != null ? Math.round(r.serverMs) : null,
    inTok: r.usage?.billed_input_tokens ?? r.usage?.input_tokens ?? 0,
    outTok: r.usage?.output_tokens ?? 0,
    cost: costOf(r.usage),
    ok: r.ok !== false,
    at: Date.now(),
  };
}
const top = (res) => {
  if (!res) return null;
  const sorted = [...(res.probabilities || [])].sort((a, b) => b.probability - a.probability);
  return { chosen: res.chosen ?? null, p: res.probability ?? sorted[0]?.probability ?? 0, lead: sorted[0]?.option ?? null, leadP: sorted[0]?.probability ?? 0, second: sorted[1]?.option ?? null, secondP: sorted[1]?.probability ?? 0 };
};
const pct = (x) => `${Math.round((x || 0) * 100)}%`;

/* ---------- HTTP API ---------- */
const clip = (s) => String(s || '').slice(0, MAX_TEXT);

/* One finished answer of one build step -> decide + extract, in parallel. */
/* `world` = the world chosen so far (later steps take their options from it); `context` = the origin answer, sent
   with the body step, so the world question sees the place and the days. */
/* a spoken name as a name: drop leading words the recogniser leaves in ("names Princess", "called Rowan"), keep three words, capitalise a lower-case result */
const MONTH_WORDS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function tidyName(raw) {
  let w = String(raw || '').replace(/[.,!?"]/g, ' ').trim().split(/\s+/).filter(Boolean);
  while (w.length > 1 && /^(i|i'm|im|am|is|my|name|names|named|name's|called|call|me|they|it's|its|the)$/i.test(w[0])) w.shift();
  w = w.slice(0, 3);
  if (!w.length) return null;
  return w.map((x) => (x === x.toLowerCase() ? x[0].toUpperCase() + x.slice(1) : x)).join(' ');
}

async function apiStep({ step: stepId, text, world }) {
  const step = stepById(stepId);
  if (!step) throw new Error('unknown step');
  const answer = clip(text);
  const content = stepContent(step, answer);
  const K = kitFor(worldOf(world));
  const qs = [...(step.live ? step.live(K) : []), ...(step.final ? step.final(K) : [])];
  const wq = step.world ? step.world() : [];
  const requests = [];
  if (qs.length) requests.push({ content, questions: qs });
  if (wq.length) requests.push({ content, questions: wq });
  const [d, x] = await Promise.all([
    requests.length ? decideBatch(requests) : Promise.resolve(null),
    extract(answer, step.extract),
  ]);
  const out = { step: stepId, log: [] };
  if (d) {
    const a = { ...(qs.length ? d.answers[0] : {}), ...(wq.length ? d.answers[requests.length - 1] : {}) };
    const parts = [];
    for (const q of [...qs, ...wq]) {
      const r = a[q.id];
      if (q.kind === 'scale') { out[q.id] = r?.expectation ?? null; parts.push(`${q.id} ${r?.expectation?.toFixed(1) ?? '?'}`); }
      else { out[q.id] = top(r); parts.push(`${out[q.id]?.chosen ?? `${out[q.id]?.lead}?`} ${pct(out[q.id]?.leadP)}`); }
    }
    out.log.push(entry('B', `decide: ${[...qs, ...wq].map((q) => q.id).join(', ')}`, d, parts.join(' · ')));
  }
  const v = x.values || {};
  const shown = [];
  if (stepId === 'name') { out.name = tidyName(v.name); shown.push(out.name ?? 'no name'); }
  if (stepId === 'born') {
    const md = monthDay(v.birthday || answer);
    /* no ISO date from the extract (an old year such as 1825): build it from the spoken month, day and any four-digit year */
    const yr = (/\b(1[0-9]|20)\d\d\b/.exec(answer) || [])[0];
    const iso = typeof v.birth_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.birth_date) ? v.birth_date.slice(0, 10)
      : md && yr ? `${yr}-${String(md.month).padStart(2, '0')}-${String(md.day).padStart(2, '0')}` : null;
    out.birth = iso; out.sign = signOf(iso, md);
    out.age = ageBand(iso ? Number(iso.slice(0, 4)) : Number((/\b(19|20)\d\d\b/.exec(answer) || [])[0]) || null);
    out.seed = seedOf(iso || answer);
    shown.push(iso ?? v.birthday ?? (md ? `${md.day} ${MONTH_WORDS[md.month - 1]}` : 'no date'), out.sign ?? 'no sign');
  }
  if (stepId === 'origin') { out.place = v.place || null; shown.push(out.place ?? 'no place'); }
  if (stepId === 'body') { out.trade = v.trade || null; shown.push(out.trade ?? 'no trade'); }
  if (stepId === 'heart') {
    const rows = x.results?.companions?.values || [];
    out.mentions = (v.companions || []).map((t, i) => ({ kind: 'loved one', text: String(t).trim(), p: rows[i]?.probability ?? 1 })).filter((m) => m.text && m.p >= 0.5 && !/^(nobody|no one|no-one|none|myself|me|nothing)$/i.test(m.text)).map(({ kind, text: t }) => ({ kind, text: t.replace(/^(my|our) (dog|cat|son|daughter|wife|husband|brother|sister|friend|mom|dad|mother|father|partner|girlfriend|boyfriend) (?=[A-Z])/i, '').replace(/^(dog|cat) (?=[A-Z])/i, '') }));
    out.desire = v.desire || null;
    shown.push(out.mentions.map((m) => m.text).join(', ') || 'nobody named', out.desire ?? '');
  }
  if (stepId === 'enemy') { out.enemy = v.enemy || null; shown.push(out.enemy ?? 'not named'); }
  out.log.push(entry('B', `extract: ${Object.keys(step.extract).join(', ')}`, x, shown.filter(Boolean).join(' · ')));
  return out;
}

/* The weapon step. The same words are mapped onto kit parts, and the weapon's name comes from a menu built out of the player's own words. */
/* at the weapon step every answer is a weapon request. One round trip: the answer kind, the forge map, the
   extract and the naming run in parallel. */
async function apiForge({ text, mentions = [], revision = 0, world }) {
  const content = clip(text).trim() || '(no answer)';
  const log = [];
  const spec = byId(VERBS, 'forge').schema;
  const safe = (Array.isArray(mentions) ? mentions : []).slice(0, 24).map((m) => ({ kind: clip(m.kind).slice(0, 20), text: clip(m.text).slice(0, 60) }));
  const [x, map, naming] = await Promise.all([
    extract(content, spec),
    decideBatch([{ content, questions: forgeQuestions(worldOf(world)) }, { content: `Question: ${WEAPON_ASK}\nAnswer: ${content}`, questions: [answerQuestion()] }]),
    safe.length > 0 ? decideBatch([{ content: `The player said earlier that these matter to them: ${safe.map((m) => `${m.text} (${m.kind})`).join('; ')}.`, questions: [namingQuestion(safe, revision)] }]) : Promise.resolve(null),
  ]);
  const m = map.answers[0] || {};
  const answer = top(map.answers[1]?.answer);
  const forge = map.ok ? { weapon: top(m.weapon), material: top(m.material), element: top(m.element) } : null;
  /* the verb that web/src/main.js reads, from the answer kind */
  const verbId = { weapon: 'forge', thing: 'forge', ready: 'fight' }[answer?.chosen ?? ''] || null;
  const verb = { chosen: verbId, p: answer?.p ?? 0, lead: verbId, leadP: answer?.leadP ?? 0, second: null, secondP: 0 };
  log.push(entry('C', 'classify: answer', map, `${answer?.chosen ?? `${answer?.lead}?`} ${pct(answer?.leadP)}`));
  const slots = x.values || {};
  log.push(entry('C', `extract: ${Object.keys(spec).join(', ')}`, x, Object.entries(slots).filter(([, val]) => val).map(([k, val]) => `${k}: ${val}`).join(' · ') || 'no details'));
  if (forge) log.push(entry('C', 'map words to kit parts', { ms: map.ms, serverMs: map.serverMs, usage: null }, ['weapon', 'material', 'element'].map((k) => `${forge[k]?.chosen ?? `${forge[k]?.lead}?`} ${pct(forge[k]?.leadP)}`).join(' · ')));
  let named = null;
  if (naming) {
    const res = top(naming.answers[0]?.[`name_r${revision}`]);
    const pick = res?.chosen ?? res?.lead;
    const idx = pick && pick !== 'none' ? Number(pick.slice(1)) : -1;
    named = { revision, mention: idx >= 0 ? safe[idx] : null, p: res?.leadP ?? 0 };
    log.push(entry('D', `dynamic choice: ${safe.length + 1} options from the player's words`, naming, named.mention ? `${named.mention.text} ${pct(named.p)}` : 'none'));
  }
  return { answer, verb, slots, forge, named, log };
}

/* Enemy tactics: one request per group, one batch per tick. */
async function apiTactics({ groups = [], tick = 0, world }) {
  const K = kitFor(worldOf(world));
  const list = (Array.isArray(groups) ? groups : []).slice(0, 6);
  if (list.length === 0) return { tick, picks: [], log: [] };
  const legalIds = TACTICS.map((t) => t.id);
  /* a group with one legal tactic is answered here and not sent to Sage2; legalIds is only for a malformed list */
  const items = list.map((g) => {
    const legal = (Array.isArray(g.legal) ? g.legal : legalIds).filter((id) => legalIds.includes(id));
    return { g, legal: legal.length ? legal : legalIds };
  });
  const asked = items.filter((x) => x.legal.length >= 2);
  const requests = asked.map(({ g, legal }) => {
    const foe = byId(K.FOES, g.type) || (g.nemesis && K.nemesis(g.nemesis)?.persona ? K.bossFor(K.nemesis(g.nemesis)) : byId(BOSSES, g.type)) || FOES[0];
    const facts = (Array.isArray(g.facts) ? g.facts : []).slice(0, 12).map((f) => clip(f).slice(0, 120)).join('\n');
    return { content: `${foe.persona}\n\nFacts right now:\n${facts}`, questions: [tacticQuestion(legal)] };
  });
  const r = requests.length ? await decideBatch(requests, { timeoutMs: 2500, hedgeMs: 450 }) : { ok: true, answers: [] };
  const picks = items.map((x) => {
    const i = asked.indexOf(x);
    if (i < 0) return { id: x.g.id, chosen: x.legal[0], p: 1, lead: x.legal[0], leadP: 1, second: null, secondP: 0 };
    return { id: x.g.id, ...top(r.answers[i]?.tactic) };
  });
  return { tick, picks, log: requests.length ? [entry('T', `tactics: ${requests.length} group${requests.length > 1 ? 's' : ''}`, r, r.ok ? asked.map((x) => picks[items.indexOf(x)]).map((p) => `${p.chosen ?? `${p.lead}?`} ${pct(p.leadP)}`).join(' · ') : 'no answer in time')] : [] };
}

/* Chapter II: why do you go on? One choice and one extraction on the answer. */
async function apiVow({ text, ask }) {
  const answer = clip(text); const asked = ask ? clip(ask).slice(0, 120) : VOW_ASK;
  const qs = vowQuestions();
  const [d, x] = await Promise.all([decideBatch([{ content: `Question: ${asked}\nAnswer: ${answer}`, questions: qs }]), extract(answer, VOW_EXTRACT)]);
  const resolve = top(d.answers[0]?.resolve);
  const vow = x.values?.vow ? String(x.values.vow).trim().slice(0, 140) : null;
  return { resolve, vow, log: [entry('B', 'decide: resolve', d, `${resolve?.chosen ?? `${resolve?.lead}?`} ${pct(resolve?.leadP)}`), entry('B', 'extract: vow', x, vow ?? 'no words kept')] };
}
const API = { '/api/step': [apiStep, 60], '/api/act': [apiForge, 30], '/api/tactics': [apiTactics, 150], '/api/vow': [apiVow, 20] };
/* the Vercel functions (server/http-api.mjs) reuse this table and these helpers; nothing here changes */
export { API, top, entry, clip, worldOf };

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 16000) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}
function safeJoin(base, rel) {
  const full = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  return full.startsWith(base) ? full : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && API[url.pathname]) {
    const [fn, limit] = API[url.pathname];
    if (!allow(ipOf(req) + url.pathname, limit)) { res.writeHead(429, { 'content-type': 'application/json' }); res.end('{"error":"slow down"}'); return; }
    if (!hasKey()) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"no key"}'); return; }
    try {
      const out = await fn(await readJson(req));
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  if (url.pathname === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, sage: hasKey() })); return; }
  let file = null;
  if (url.pathname.startsWith('/vendor/three/')) file = safeJoin(path.join(ROOT, 'node_modules/three'), url.pathname.slice('/vendor/three/'.length));
  else if (['/game/kit.mjs', '/game/story.mjs', '/game/worlds.mjs'].includes(url.pathname) || /^\/game\/worlds\/[a-z]+\.mjs$/.test(url.pathname)) file = path.join(ROOT, url.pathname.slice(1));
  else file = safeJoin(path.join(ROOT, 'web'), url.pathname === '/' || /^\/f\/[A-Za-z0-9_-]{1,400}\/?$/.test(url.pathname) ? 'index.html' : url.pathname); /* a share link /f/<code> is the game page */
  if (!file) { res.writeHead(403); res.end(); return; }
  serveFile(res, file);
});

/* ---------- WebSocket relays ---------- */
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (!['/ws/onboard', '/ws/director'].includes(url.pathname) || !hasKey() || !allow(ipOf(req) + url.pathname, 20)) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => (url.pathname === '/ws/onboard' ? onboardRelay(ws) : directorRelay(ws)));
});

function shapeAnswers(frame) {
  const out = {};
  for (const [id, a] of Object.entries(frame.answers || {})) {
    const r = unwrap(a);
    out[id] = r && r.expectation !== undefined ? { expectation: r.expectation, confidence: r.confidence } : top(r);
  }
  return out;
}

/* The live question. The browser sends {t:'text', step, text} with the FULL answer so far.
   A longer text with the same start is appended; anything else opens a new session,
   because the stream is append-only. A new step brings its own question set. */
function onboardRelay(client) {
  let up = null; let mirror = ''; let stepId = null; let reopenTimer = null; let sessions = 0; let world = 'dark';
  const send = (o) => { if (client.readyState === 1) client.send(JSON.stringify(o)); };
  const open = (step, text) => {
    if (up) up.close();
    up = null;
    if (!step.live) return;
    if (++sessions > 60) { send({ t: 'error', detail: 'too many sessions' }); return; }
    stepId = step.id; mirror = text;
    const mine = openStream({
      questions: step.live(kitFor(world)), content: stepContent(step, text),
      onState: (st, d) => { if (up !== mine) return; if (st === 'ready') send({ t: 'ready', step: step.id }); else if (st === 'error') send({ t: 'error', detail: d?.detail || d?.code || 'stream error' }); },
      onDecision: (f) => {
        if (up !== mine) return;
        const answers = shapeAnswers(f);
        const changed = f.changed || [];
        send({ t: 'decision', step: step.id, answers, changed, chars: f.chars,
          log: entry('A', `stream frame: ${changed.join(', ') || 'no change'}`, { ms: f.latency_ms, serverMs: f.latency_ms, usage: f.usage || {} }, changed.map((id) => `${answers[id]?.chosen ?? `${answers[id]?.lead}?`} ${pct(answers[id]?.leadP)}`).join(' · ')) });
      },
    });
    up = mine;
  };
  client.on('message', (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.t !== 'text') return;
    const step = stepById(m.step); if (!step) return;
    const text = clip(m.text);
    /* a new world changes the live options: the next text opens a new session */
    if (m.world !== undefined && worldOf(m.world) !== world) { world = worldOf(m.world); stepId = null; }
    if (step.id === stepId && text === mirror) return;
    if (step.id === stepId && up && !up.closed && text.length > mirror.length && text.startsWith(mirror)) { up.append(text.slice(mirror.length)); mirror = text; return; }
    clearTimeout(reopenTimer);
    const fresh = step.id !== stepId;
    reopenTimer = setTimeout(() => open(step, text), fresh ? 0 : 250);
    if (fresh) { stepId = step.id; mirror = text; }
  });
  client.on('close', () => { clearTimeout(reopenTimer); if (up) up.close(); });
}

/* Director. The browser sends {t:'event', line} (appended to the run log) and
   {t:'ask', rev} at the end of a wave. A reply carries the rev it answers. */
function directorRelay(client) {
  let chars = 0; let lines = 0; let last = null; let waiting = null;
  const send = (o) => { if (client.readyState === 1) client.send(JSON.stringify(o)); };
  const reply = () => {
    if (!waiting || !last || last.chars < waiting.chars) return;
    clearTimeout(waiting.timer);
    send({ t: 'beat', rev: waiting.rev, answers: last.answers, log: last.log });
    waiting = null;
  };
  const up = openStream({
    questions: directorQuestions(), content: 'Event log of one fight on the road.\n', emit: 'all',
    onState: (st, d) => { if (st === 'ready') send({ t: 'ready' }); else if (st === 'error') send({ t: 'error', detail: d?.detail || d?.code || 'stream error' }); },
    onDecision: (f) => {
      if (process.env.DEBUG_DIRECTOR) console.log('director frame chars', f.chars, 'mine', chars, 'seq', f.seq);
      const answers = shapeAnswers(f);
      const b = answers.beat;
      last = { chars: f.chars, answers,
        log: entry('R', 'director: event log stream', { ms: f.latency_ms, serverMs: f.latency_ms, usage: f.usage }, `next: ${b?.chosen ?? `${b?.lead}?`} ${pct(b?.leadP)} · pressure ${answers.pressure?.expectation?.toFixed(1) ?? '?'}`) };
      reply();
    },
  });
  const base = 'Event log of one fight on the road.\n'.length;
  chars = base;
  client.on('message', (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.t === 'event' && lines < 400) {
      const line = clip(m.line).slice(0, 160).replace(/\s+/g, ' ') + '\n';
      lines++; chars += Array.from(line).length; up.append(line);
    } else if (m.t === 'ask') {
      waiting = { rev: m.rev, chars, timer: setTimeout(() => { if (waiting) { send({ t: 'beat', rev: waiting.rev, answers: null, log: null }); waiting = null; } }, 6000) };
      up.evaluate(); reply();
    }
  });
  client.on('close', () => up.close());
}

/* listen only when run as `node server/server.mjs`, not when a Vercel function imports the API table */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) server.listen(PORT, () => console.log(`sage-quest dev server http://localhost:${PORT}  sage key: ${hasKey() ? 'yes' : 'NO'}`));

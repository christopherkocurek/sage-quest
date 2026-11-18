/* Sage2 client. Server side only: the key never leaves this process. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

export const BASE = process.env.SAGE_ENDPOINT || 'https://sage.levanto.ai';
const KEY = process.env.SAGE_API_KEY || '';
export const hasKey = () => KEY.length > 0;

/* Prices per 1M tokens (levanto.ai/pricing, read 2026-11-10). */
export const PRICE = { input: 0.05, output: 1.0 };
export const costOf = (usage) => {
  if (!usage) return 0;
  const inTok = usage.billed_input_tokens ?? usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  return (inTok * PRICE.input + outTok * PRICE.output) / 1e6;
};

const HEADERS = () => ({
  'content-type': 'application/json',
  authorization: `Bearer ${KEY}`,
  'user-agent': 'Mozilla/5.0 (compatible; quest-demo/0.1)',
});

async function postOnce(pathname, body, timeoutMs, signal) {
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  signal?.addEventListener('abort', () => ctl.abort());
  try {
    const r = await fetch(BASE + pathname, { method: 'POST', headers: HEADERS(), body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    const ms = performance.now() - t0;
    if (!r.ok) return { ok: false, status: r.status, error: text.slice(0, 300), ms };
    return { ok: true, json: JSON.parse(text), ms };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e), ms: performance.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/* Some calls take much longer than usual.
   A call that is still open after hedgeMs gets one twin; the first good answer wins.
   Same text gives the same answer, so the twin cannot change the result. */
export const hedge = { fired: 0, won: 0 };
async function post(pathname, body, timeoutMs, hedgeMs = 1200) {
  const t0 = performance.now();
  const stop = new AbortController();
  const first = postOnce(pathname, body, timeoutMs, stop.signal);
  let timer = null;
  const second = new Promise((resolve) => {
    timer = setTimeout(() => { hedge.fired++; postOnce(pathname, body, timeoutMs - hedgeMs, stop.signal).then((r) => { if (r.ok) { hedge.won++; resolve({ ...r, hedged: true }); } }); }, hedgeMs);
  });
  /* an HTTP error answer (402 quota used up, 429, 5xx, 4xx) is final for that try: it must not sit until the timeout.
     402/429/5xx come and go between calls, so two quick retries; then the failure goes back at once and the game's own rules pick. */
  const firstGood = first.then(async (r) => {
    if (r.ok) return r;
    if (!r.status) return new Promise((resolve) => setTimeout(() => resolve(r), Math.max(0, timeoutMs - (performance.now() - t0))));
    if (r.status !== 402 && r.status !== 429 && r.status < 500) return r;
    let last = r;
    for (let i = 0; i < 2; i++) {
      await new Promise((res) => setTimeout(res, 200));
      const left = timeoutMs - (performance.now() - t0); if (left < 300) break;
      last = await postOnce(pathname, body, left, stop.signal); if (last.ok) return { ...last, retried: i + 1 };
    }
    return last;
  });
  const r = await Promise.race([firstGood, second]);
  clearTimeout(timer); stop.abort();
  return { ...r, ms: performance.now() - t0 };
}

/* requests: [{content, questions}] -> per request an object {questionId: result|null}. */
export async function decideBatch(requests, { timeoutMs = 9000, hedgeMs = 1200 } = {}) {
  const r = await post('/decide/batch', { reasoning: 'off', requests }, timeoutMs, hedgeMs);
  if (!r.ok) return { ok: false, error: r.error, status: r.status, ms: r.ms, answers: requests.map(() => ({})), usage: null };
  const answers = r.json.results.map((res) => {
    const out = {};
    for (const a of res.answers || []) {
      if (a.ok && a.result) out[a.result.id] = a.result.result;
    }
    return out;
  });
  const meta = r.json.meta || {};
  return { ok: true, answers, ms: r.ms, serverMs: meta.latency_ms, usage: meta.usage, model: meta.model };
}

export async function extract(content, spec, { timeoutMs = 9000 } = {}) {
  const r = await post('/v1/extract', { content, extract: spec }, timeoutMs);
  if (!r.ok) return { ok: false, error: r.error, status: r.status, ms: r.ms, values: {}, results: {}, usage: null };
  const meta = r.json.meta || {};
  return { ok: true, values: r.json.values || {}, results: r.json.results || {}, ms: r.ms, serverMs: meta.latency_ms, usage: meta.usage, model: meta.model };
}

/* One upstream stream session. The caller owns the questions.
   onDecision(frame) gets every decision frame. onState('ready'|'closed'|'error', detail). */
export function openStream({ questions, content = '', emit = 'changes', onDecision, onState }) {
  const url = BASE.replace(/^http/, 'ws') + '/v1/stream';
  const ws = new WebSocket(url, { headers: { authorization: `Bearer ${KEY}`, 'user-agent': 'Mozilla/5.0 (compatible; quest-demo/0.1)' } });
  let ready = false;
  let closed = false;
  const queue = [];
  let seq = 0;
  const raw = (o) => ws.send(JSON.stringify(o));
  const send = (o) => (ready ? raw(o) : queue.push(o));

  ws.on('open', () => raw({ type: 'start', questions, content, emit, reasoning: 'off' }));
  ws.on('message', (data) => {
    let f;
    try { f = JSON.parse(data.toString()); } catch { return; }
    if (f.type === 'ready') {
      ready = true;
      onState?.('ready', f.limits);
      if (content && queue.length === 0) raw({ type: 'evaluate' });
      for (const o of queue.splice(0)) raw(o);
    } else if (f.type === 'decision') {
      onDecision?.(f);
    } else if (f.type === 'error') {
      onState?.('error', f);
    }
  });
  ws.on('close', (code) => { closed = true; onState?.('closed', { code }); });
  ws.on('error', (e) => onState?.('error', { detail: String(e.message || e) }));

  const pinger = setInterval(() => { if (ready && !closed) raw({ type: 'ping' }); }, 60000);

  return {
    append(text) { if (!closed && text) send({ type: 'append', text, seq: ++seq }); return seq; },
    setQuestions(qs) { if (!closed) send({ type: 'questions', questions: qs }); },
    evaluate() { if (!closed) send({ type: 'evaluate' }); },
    close() { clearInterval(pinger); if (!closed) { try { raw({ type: 'close' }); } catch { /* socket not open */ } ws.close(); } },
    get closed() { return closed; },
  };
}

/* A stream answer may sit one level down ({id, kind, result, meta}). */
export const unwrap = (a) => (a && a.result !== undefined && a.kind ? a.result : a);

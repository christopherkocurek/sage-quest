/* the game API as serverless handlers (Vercel calls handler(req, res) once per request).
   The Sage2 logic is the dev server's own (server/server.mjs API table); this file adds what a public link needs:
   a signed session token, an optional access code, an origin check, input caps and per-IP limits.
   Nothing is stored on disk. Limits live in memory per instance, and in Upstash Redis when its env is set.

   Env: SAGE_API_KEY (required) · SQ_SESSION_SECRET (recommended) · SQ_ACCESS_CODE (optional gate)
        SQ_ALLOWED_ORIGINS (optional, comma list; default = the request's own host)
        UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN (optional, shared limits)
        SQ_SESSION_CALLS (default 900) · SQ_DAILY_CALLS (default 20000): enforced only with Redis */
import crypto from 'node:crypto';
import { API, top, entry, clip, worldOf } from './server.mjs';
import { decideBatch, hasKey } from './sage.mjs';
import { stepById, stepContent, directorQuestions } from '../game/questions.mjs';
import { kitFor } from '../game/worlds.mjs';

const MAX_BODY = 16000;
const SESSION_MS = 2 * 60 * 60 * 1000;
const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

/* ---------- two calls the WebSocket relays made, as one request each ---------- */
/* The live question over HTTP: the step's live question on the text so far (the client sends it on a pause in speech). */
async function apiLive({ step: stepId, text, world }) {
  const step = stepById(stepId);
  if (!step || !step.live) return { t: 'decision', step: stepId, answers: {}, changed: [], log: [] };
  const said = clip(text);
  const qs = step.live(kitFor(worldOf(world)));
  const d = await decideBatch([{ content: stepContent(step, said), questions: qs }], { timeoutMs: 5000, hedgeMs: 900 });
  const a = d.answers[0] || {};
  const answers = {};
  for (const q of qs) { const r = a[q.id]; answers[q.id] = r && r.expectation !== undefined ? { expectation: r.expectation, confidence: r.confidence } : top(r); }
  const ids = qs.map((q) => q.id);
  return { t: 'decision', step: stepId, answers, changed: ids, chars: said.length,
    log: [entry('A', `live check: ${ids.join(', ')}`, d, ids.map((id) => `${answers[id]?.chosen ?? `${answers[id]?.lead}?`} ${Math.round((answers[id]?.leadP || 0) * 100)}%`).join(' · '))] };
}

/* Director over HTTP: the client keeps the event log and sends it at the end of a wave. Same questions, same content
   head as the stream relay; the log is cut to its first line plus the newest lines that fit 12000 characters. */
const DIRECTOR_HEAD = 'Event log of one fight on the road.\n';
async function apiDirector({ lines = [] }) {
  const list = (Array.isArray(lines) ? lines : []).slice(-400).map((l) => clip(l).slice(0, 160).replace(/\s+/g, ' '));
  const kept = []; let size = 0;
  for (let i = list.length - 1; i >= 1; i--) { if (size + list[i].length + 1 > 12000) break; kept.unshift(list[i]); size += list[i].length + 1; }
  if (list.length) kept.unshift(list[0]);
  const d = await decideBatch([{ content: DIRECTOR_HEAD + kept.map((l) => `${l}\n`).join(''), questions: directorQuestions() }], { timeoutMs: 6000, hedgeMs: 900 });
  const a = d.answers[0] || {};
  const answers = d.ok ? { beat: top(a.beat), pressure: a.pressure ? { expectation: a.pressure.expectation, confidence: a.pressure.confidence } : null } : null;
  const b = answers?.beat;
  return { answers, log: [entry('R', 'director: event log', d, d.ok ? `next: ${b?.chosen ?? `${b?.lead}?`} ${Math.round((b?.leadP || 0) * 100)}% · pressure ${answers.pressure?.expectation?.toFixed(1) ?? '?'}` : 'no answer in time')] };
}

/* route -> [fn, per-IP calls per minute] */
export const ROUTES = {
  step: API['/api/step'], act: API['/api/act'], tactics: API['/api/tactics'], vow: API['/api/vow'],
  live: [apiLive, 90], director: [apiDirector, 12],
};

/* ---------- session token: HMAC over {exp, ip hash, nonce}; no store needed ---------- */
const secret = () => env('SQ_SESSION_SECRET') || crypto.createHash('sha256').update(`sq-session|${env('SAGE_API_KEY')}`).digest('hex');
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');
const ipHash = (ip) => crypto.createHash('sha256').update(`${secret()}|${ip}`).digest('base64url').slice(0, 12);
function issue(ip) {
  const body = b64(JSON.stringify({ exp: Date.now() + SESSION_MS, ip: ipHash(ip), n: crypto.randomBytes(9).toString('base64url') }));
  return `${body}.${sign(body)}`;
}
function check(token, ip) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = sign(body);
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() && p.ip === ipHash(ip) ? p : null; } catch { return null; }
}
const codeOk = (req) => {
  const want = env('SQ_ACCESS_CODE');
  if (!want) return true;
  const got = String(req.headers['x-sq-code'] || '');
  const a = crypto.createHash('sha256').update(got).digest(); const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
};

/* ---------- limits ---------- */
const hits = new Map();
function allowLocal(key, limit) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 60000);
  if (list.length >= limit) { hits.set(key, list); return false; }
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); if (hits.size < 2500) break; }
  return true;
}
const redisUrl = () => env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
const redisToken = () => env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');
/* fixed windows in Redis: [key, ttl seconds, limit]; true = allowed. A Redis fault lets the call through (the memory limit still holds). */
async function allowShared(rules) {
  if (!redisUrl() || !redisToken()) return true;
  const cmds = rules.flatMap(([k, ttl]) => [['INCR', k], ['EXPIRE', k, String(ttl), 'NX']]);
  try {
    const ctl = AbortSignal.timeout(800);
    const r = await fetch(`${redisUrl().replace(/\/$/, '')}/pipeline`, { method: 'POST', headers: { authorization: `Bearer ${redisToken()}`, 'content-type': 'application/json' }, body: JSON.stringify(cmds), signal: ctl });
    if (!r.ok) return true;
    const out = await r.json();
    return rules.every(([, , limit], i) => Number(out[i * 2]?.result ?? 0) <= limit);
  } catch { return true; }
}
const minute = () => Math.floor(Date.now() / 60000);
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- request plumbing ---------- */
const ipOf = (req) => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
function originOk(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return false;
  const allowed = env('SQ_ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  try { return new URL(origin).host === host; } catch { return false; }
}
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    const s = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    if (s.length > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
    return typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(s || '{}');
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
    req.on('end', () => {
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/* ---------- handlers ---------- */
export async function healthHandler(req, res) {
  send(res, 200, { ok: true, sage: hasKey(), transport: 'http', code: !!env('SQ_ACCESS_CODE') });
}

export async function sessionHandler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!originOk(req)) return send(res, 403, { error: 'origin' });
  const ip = ipOf(req);
  if (!allowLocal(`${ip}|session`, 20) || !(await allowShared([[`sq:ip:${ip}:session:${minute()}`, 70, 20]]))) return send(res, 429, { error: 'slow down' });
  if (!codeOk(req)) return send(res, 401, { error: 'code' });
  send(res, 200, { token: issue(ip), ttl: SESSION_MS / 1000 });
}

export function routeHandler(name) {
  const [fn, limit] = ROUTES[name];
  return async function handler(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (!originOk(req)) return send(res, 403, { error: 'origin' });
    const ip = ipOf(req);
    if (!codeOk(req)) return send(res, 401, { error: 'code' });
    const sess = check(req.headers['x-sq-session'], ip);
    if (!sess) return send(res, 401, { error: 'session' });
    if (!allowLocal(`${ip}|${name}`, limit)) return send(res, 429, { error: 'slow down' });
    const shared = await allowShared([
      [`sq:ip:${ip}:${name}:${minute()}`, 70, limit],
      [`sq:s:${sess.n}`, SESSION_MS / 1000 + 60, Number(env('SQ_SESSION_CALLS', '900'))],
      [`sq:day:${today()}`, 26 * 3600, Number(env('SQ_DAILY_CALLS', '20000'))],
    ]);
    if (!shared) return send(res, 429, { error: 'slow down' });
    if (!hasKey()) return send(res, 503, { error: 'no key' });
    let body;
    try { body = await readBody(req); } catch (e) { return send(res, e.status || 400, { error: e.status === 413 ? 'too large' : 'bad json' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'bad json' });
    try {
      /* tactics: answer before the client's 3 s abort; fight.js drops answers older than 1.5 s anyway (LATE_MS) */
      const out = name === 'tactics'
        ? await Promise.race([fn(body), new Promise((r) => setTimeout(() => r({ tick: body.tick, picks: [], log: [] }), 1800))])
        : await fn(body);
      if (process.env.SQ_COST_LOG) console.log(JSON.stringify({ sqcost: name, entries: (out.log || []).map((e) => ({ in: e.inTok, out: e.outTok, cost: e.cost })) }));
      send(res, 200, out);
    } catch (e) {
      send(res, 400, { error: String(e.message || e).slice(0, 120) });
    }
  };
}

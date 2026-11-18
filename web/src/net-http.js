/* the HTTP transport for hosts without a WebSocket server (Vercel).
   Switch: window.SQ_TRANSPORT = 'http' | 'ws'. The Vercel build sets 'http' in index.html; with no setting, the
   client asks /api/health once and takes 'http' when the host says so. The dev server on 8790 stays on 'ws'.
   Also adds the session token and the access code to every /api/ call (a 401 gets one fresh token and one retry). */

const W = typeof window !== 'undefined' ? window : null;
let probed = null;
if (W && W.SQ_TRANSPORT == null) {
  fetch('/api/health').then((r) => (r.ok ? r.json() : null)).then((j) => { probed = j?.transport === 'http' ? 'http' : 'ws'; }).catch(() => { probed = 'ws'; });
}
export const httpMode = () => (W?.SQ_TRANSPORT ?? probed) === 'http';

/* ---------- session token + access code ---------- */
const CODE_KEY = 'sq.code';
const mem = { token: null, code: null, asking: null };
try { mem.code = W?.localStorage.getItem(CODE_KEY) || null; } catch { /* storage off */ }
const baseFetch = W ? W.fetch.bind(W) : null;
async function askCode() {
  if (!mem.asking) {
    mem.asking = Promise.resolve().then(() => {
      const c = W.prompt('This preview needs an access code.');
      mem.code = c ? c.trim() : null;
      try { if (mem.code) W.localStorage.setItem(CODE_KEY, mem.code); else W.localStorage.removeItem(CODE_KEY); } catch { /* storage off */ }
      return mem.code;
    }).finally(() => { setTimeout(() => { mem.asking = null; }, 0); });
  }
  return mem.asking;
}
async function newSession(tries = 2) {
  if (Date.now() < (mem.coolUntil || 0)) return null; /* refused a moment ago: do not ask on every call */
  const r = await baseFetch('/api/session', { method: 'POST', headers: mem.code ? { 'x-sq-code': mem.code } : {} });
  if (r.status === 401 && tries > 0) { if (await askCode()) return newSession(tries - 1); return null; }
  if (!r.ok) { mem.coolUntil = Date.now() + 15000; return null; }
  mem.token = (await r.json()).token || null;
  return mem.token;
}
let pending = null;
const session = () => (mem.token ? Promise.resolve(mem.token) : (pending ||= newSession().finally(() => { pending = null; })));

if (W) {
  W.fetch = async (url, init = {}) => {
    const path = typeof url === 'string' ? url : null;
    if (!path || !path.startsWith('/api/') || path === '/api/session' || path === '/api/health' || (init.method || 'GET') !== 'POST') return baseFetch(url, init);
    const go = async () => {
      if (httpMode()) await session();
      const headers = { ...(init.headers || {}) };
      if (mem.token) headers['x-sq-session'] = mem.token;
      if (mem.code) headers['x-sq-code'] = mem.code;
      return baseFetch(url, { ...init, headers });
    };
    let res = await go();
    if (res.status === 401) {
      const why = await res.clone().json().catch(() => ({}));
      mem.token = null;
      if (why.error === 'code' && !(await askCode())) return res;
      if (await session()) res = await go();
    }
    return res;
  };
  if (W.SQ_TRANSPORT === 'http') session().catch(() => {});
}

/* ---------- the live question without a socket: one /api/live call per pause in the player's words ---------- */
export function httpOnboard(onDecision, api) {
  let timer = null; let busy = false; let queued = null; let last = ''; let lastStep = null; let count = 0; let alive = true;
  const fire = async (p) => {
    if (!alive) return;
    if (busy) { queued = p; return; }
    if (p.step !== lastStep) { lastStep = p.step; count = 0; last = ''; }
    if (p.text === last || count >= 14) return;
    busy = true; last = p.text; count++;
    const r = await api('/api/live', p, 6000);
    busy = false;
    if (alive && r?.t === 'decision') onDecision({ ...r, log: r.log?.[0] });
    if (queued) { const q = queued; queued = null; fire(q); }
  };
  return {
    text(step, full, world) { clearTimeout(timer); const p = { step, text: full, ...(world ? { world } : {}) }; timer = setTimeout(() => fire(p), 550); },
    close() { alive = false; clearTimeout(timer); },
  };
}

/* ---------- director without a socket: keep the event log here, send it at the end of a wave ---------- */
export function httpDirector(api, feed) {
  const lines = []; let rev = 0;
  return {
    event(line) { if (lines.length < 400) lines.push(String(line ?? '').slice(0, 160).replace(/\s+/g, ' ')); },
    async ask(timeoutMs = 7000) {
      const mine = ++rev;
      const r = await api('/api/director', { lines }, timeoutMs);
      if (mine !== rev) { feed.dropped++; return null; }
      return r?.answers ?? null;
    },
    close() { rev++; },
  };
}

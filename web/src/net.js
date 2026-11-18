/* Talks to our own server only. Every Sage2 call comes back with a log entry for the feed. */
import { httpMode, httpOnboard, httpDirector } from './net-http.js'; /* HTTP transport when the host has no WebSocket */

export const feed = {
  entries: [], listeners: new Set(), calls: 0, cost: 0, latencies: [], dropped: 0,
  push(e) {
    if (!e) return;
    this.entries.unshift(e);
    if (this.entries.length > 200) this.entries.pop();
    this.calls++; this.cost += e.cost || 0;
    if (e.ms) this.latencies.push(e.ms);
    for (const fn of this.listeners) fn(e);
  },
  median() {
    if (this.latencies.length === 0) return 0;
    const s = [...this.latencies].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  },
};

export async function api(path, body, timeoutMs = 7000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    for (const e of j.log || []) feed.push(e);
    return j;
  } catch { return null; } finally { clearTimeout(timer); }
}

function wsUrl(path) { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`; }

/* The live question: send the full transcript; the server appends or reopens. */
export function openOnboard(onDecision) {
  if (httpMode()) return httpOnboard(onDecision, api);
  let ws = null; let pending = null; let alive = true;
  const connect = () => {
    ws = new WebSocket(wsUrl('/ws/onboard'));
    ws.onopen = () => { if (pending != null) ws.send(JSON.stringify(pending)); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'decision') { feed.push(m.log); onDecision(m); }
    };
    ws.onclose = () => { if (alive) setTimeout(connect, 1000); };
  };
  connect();
  return {
    text(step, full, world) { pending = { t: 'text', step, text: full, ...(world ? { world } : {}) }; if (ws.readyState === 1) ws.send(JSON.stringify(pending)); },
    close() { alive = false; ws.close(); },
  };
}

/* Director: append event lines; ask at the end of a wave. Old revisions are dropped. */
export function openDirector() {
  if (httpMode()) return httpDirector(api, feed);
  let ws = null; let alive = true; let rev = 0; const waiters = new Map(); const backlog = [];
  const connect = () => {
    ws = new WebSocket(wsUrl('/ws/director'));
    ws.onopen = () => { for (const m of backlog.splice(0)) ws.send(m); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t !== 'beat') return;
      const w = waiters.get(m.rev);
      if (!w) { feed.dropped++; return; }
      waiters.delete(m.rev);
      if (m.log) feed.push(m.log);
      w(m.answers);
    };
    ws.onclose = () => { if (alive) setTimeout(connect, 1000); };
  };
  connect();
  const send = (o) => { const s = JSON.stringify(o); if (ws.readyState === 1) ws.send(s); else backlog.push(s); };
  return {
    event(line) { send({ t: 'event', line }); },
    ask(timeoutMs = 7000) {
      const mine = ++rev;
      for (const k of waiters.keys()) if (k < mine) { waiters.get(k)(null); waiters.delete(k); }
      return new Promise((resolve) => {
        waiters.set(mine, resolve);
        send({ t: 'ask', rev: mine });
        setTimeout(() => { if (waiters.has(mine)) { waiters.delete(mine); resolve(null); } }, timeoutMs);
      });
    },
    close() { alive = false; ws.close(); },
  };
}

/* Holds an answer steady while the speaker is mid-sentence.
   A new answer shows when it is strong, or repeats, or holds for settleMs. */
export function makeStable(onShow, { enter = 0.7, strong = 0.9, settleMs = 450 } = {}) {
  let shown = null; let pending = null; let timer = null; let last = null;
  const show = (c, p) => { clearTimeout(timer); pending = null; if (c !== shown) { shown = c; onShow(c, p); } };
  const fn = (a) => {
    if (!a) return;
    last = a;
    const { chosen, p } = a;
    if (chosen == null) { clearTimeout(timer); pending = null; return; }
    if (chosen === shown) { clearTimeout(timer); pending = null; return; }
    if (chosen === pending && p >= enter) return show(chosen, p);
    clearTimeout(timer); pending = null;
    if (p >= strong || (shown == null && p >= enter)) return show(chosen, p);
    if (p >= enter) { pending = chosen; timer = setTimeout(() => show(chosen, p), settleMs); }
  };
  fn.shown = () => shown;
  /* When the player moves on: take the leading option, even on a null. */
  fn.settle = (fallback) => { if (shown == null) { const c = last?.chosen ?? last?.lead ?? fallback; if (c) show(c, last?.leadP ?? 0); } return shown; };
  return fn;
}

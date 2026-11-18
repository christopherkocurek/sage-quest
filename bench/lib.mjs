/* Shared helpers for the benchmark scripts.
   The scripts read the game from GAME_DIR (default: this repo) and write raw results to OUT_DIR
   (default: bench/measurements). Nothing here prints the API key. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GAME_DIR = path.resolve(process.env.GAME_DIR || path.join(HERE, '..'));
export const OUT_DIR = path.resolve(process.env.OUT_DIR || path.join(HERE, 'measurements'));
export const DATE = process.env.BENCH_DATE || new Date().toISOString().slice(0, 10);

export function needGameDir() {
  if (!GAME_DIR) { console.error('Set GAME_DIR to the game folder (the one that holds game/ and server/).'); process.exit(2); }
  return GAME_DIR;
}

/* Same .env reader the game uses: lines KEY=value, existing environment wins. */
export function loadEnv() {
  const file = path.join(needGameDir(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/* The game reads SAGE_ENDPOINT (not SAGE2_ENDPOINT). Same default as server/sage.mjs. */
export const endpoint = () => process.env.SAGE_ENDPOINT || 'https://sage.levanto.ai';
export const importGame = (rel) => import(pathToFileURL(path.join(needGameDir(), rel)).href);

/* Price constants of the game (server/sage.mjs PRICE), read from the game itself. */
export async function prices() {
  const { PRICE, costOf } = await importGame('server/sage.mjs');
  return { PRICE, costOf };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1)); return s[i]; };
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export const round = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
export const lat = (a) => ({ n: a.length, median: round(median(a)), p95: round(quantile(a, 0.95)), mean: round(mean(a)), min: round(Math.min(...a)), max: round(Math.max(...a)) });

/* Run fn over items with a fixed number in flight. Results keep the item order. */
export async function pool(items, concurrency, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/* Seeded shuffle, so a "sample of N" is the same every run. */
export function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function sample(list, n, seed = 1) {
  const rnd = seeded(seed); const idx = list.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, n).sort((a, b) => a - b).map((i) => list[i]);
}

/* One POST to the Sage2 batch route, with no hedge. Up to `tries` attempts on 402, 429, 5xx or a network error;
   every attempt status is kept, so the raw file shows how often the API refused. The key is read from the environment. */
export async function rawDecide(requests, { timeoutMs = 20000, tries = 3 } = {}) {
  const key = process.env.SAGE_API_KEY || '';
  const attempts = [];
  for (let t = 0; t < tries; t++) {
    const t0 = performance.now();
    let status = 0; let json = null; let error = null;
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetch(endpoint() + '/decide/batch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'Mozilla/5.0 (compatible; quest-demo/0.1)' }, body: JSON.stringify({ reasoning: 'off', requests }), signal: ctl.signal });
      status = r.status; const text = await r.text(); clearTimeout(timer);
      if (r.ok) json = JSON.parse(text); else error = text.slice(0, 160);
    } catch (e) { error = e.name === 'AbortError' ? 'timeout' : String(e.message || e); }
    const ms = performance.now() - t0;
    attempts.push({ status, ms: round(ms) });
    if (json) {
      const meta = json.meta || {};
      const answers = json.results.map((res) => { const o = {}; for (const a of res.answers || []) if (a.ok && a.result) o[a.result.id] = a.result.result; return o; });
      return { ok: true, ms, serverMs: meta.latency_ms ?? null, usage: meta.usage ?? null, model: meta.model ?? null, answers, attempts };
    }
    if (!(status === 0 || status === 402 || status === 429 || status >= 500)) return { ok: false, status, error, ms, answers: requests.map(() => ({})), attempts };
    await sleep(300 * (t + 1));
    if (t === tries - 1) return { ok: false, status, error, ms, answers: requests.map(() => ({})), attempts };
  }
}

/* The leading option of a Choice result, as the game's server reads it (server/server.mjs top()). */
export function top(res) {
  if (!res) return null;
  const s = [...(res.probabilities || [])].sort((a, b) => b.probability - a.probability);
  return { chosen: res.chosen ?? null, lead: s[0]?.option ?? null, leadP: s[0]?.probability ?? 0, second: s[1]?.option ?? null, secondP: s[1]?.probability ?? 0 };
}

/* Provenance block stored in every raw file: date, endpoint, versions, and a hash of each game file read. */
/* md5 of every file under the given folders (game rules, server, the fight code), as one hash. It changes when any of them changes. */
function treeHash(dirs, files) {
  const h = crypto.createHash('md5'); const list = [...files];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else list.push(p); } };
  for (const d of dirs) if (fs.existsSync(d)) walk(d);
  for (const f of list.filter((x) => fs.existsSync(x)).sort()) h.update(path.relative(GAME_DIR, f)).update(fs.readFileSync(f));
  return h.digest('hex');
}

/* Provenance block stored in every raw file: date, endpoint, versions, a hash of each game file read, and one hash of
   the whole game/, server/ and web/src/fight.js tree. GAME_COMMIT (env) names the commit the folder was taken from. */
export function provenance(extra = {}) {
  const files = {}; let tree = null;
  if (GAME_DIR) {
    for (const rel of ['game/kit.mjs', 'game/questions.mjs', 'game/worlds.mjs', 'server/sage.mjs', 'server/server.mjs', 'web/src/fight.js']) {
      const f = path.join(GAME_DIR, rel);
      if (fs.existsSync(f)) files[rel] = crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
    }
    tree = treeHash([path.join(GAME_DIR, 'game'), path.join(GAME_DIR, 'server')], [path.join(GAME_DIR, 'web/src/fight.js')]);
  }
  return { date: new Date().toISOString(), endpoint: endpoint(), node: process.version, command: ['node', path.basename(process.argv[1]), ...process.argv.slice(2)].join(' '), gameCommit: process.env.GAME_COMMIT || null, gameTreeMd5: tree, gameFileMd5: files, ...extra };
}

export function writeResult(name, obj) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}-${DATE}.json`);
  fs.writeFileSync(file, JSON.stringify(obj, null, 1));
  console.log(`wrote ${path.relative(process.cwd(), file) || file}`);
  return file;
}

export const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
export const flag = (name) => process.argv.includes(`--${name}`);

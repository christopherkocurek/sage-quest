/* run the Vercel build locally without Vercel. Serves dist/ with the vercel.json headers (gzip on text,
   like Vercel's edge) and mounts api/*.js the way Vercel calls them: handler(req, res), one call per request.
   No WebSocket upgrade here, so the client must play over HTTP. Port 8799 by default, so it does not clash with `npm start` (8790).
   GET /__stats prints calls, tokens and Sage2 cost per route, and every 404 (harness only, not deployed).
   Usage: node tools/build-vercel.mjs && PORT=8799 node tools/vercel-local.mjs */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, process.env.OUT_DIR || 'dist');
const PORT = Number(process.env.PORT || 8799);
if (PORT === 8790) throw new Error('8790 belongs to the dev server');
process.env.SQ_COST_LOG = '1';

const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const rules = conf.headers.map((h) => ({ re: new RegExp(`^${h.source.replace(/\(\.\*\)/g, '.*')}$`), headers: h.headers }));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.md': 'text/markdown' };
const TEXT = /^(text\/|application\/json|model\/gltf\+json)/;

const handlers = {};
for (const f of fs.readdirSync(path.join(ROOT, 'api')).filter((n) => n.endsWith('.js'))) handlers[f.replace(/\.js$/, '')] = (await import(pathToFileURL(path.join(ROOT, 'api', f)))).default;

const stats = { routes: {}, timing: {}, notFound: [], bytes: 0 };
const origLog = console.log;
console.log = (...a) => {
  const s = a.join(' ');
  if (s.startsWith('{"sqcost"')) {
    try { const j = JSON.parse(s); const r = (stats.routes[j.sqcost] ||= { calls: 0, inTok: 0, outTok: 0, cost: 0 }); r.calls++; for (const e of j.entries) { r.inTok += e.in; r.outTok += e.out; r.cost += e.cost; } } catch { /* not ours */ }
    return;
  }
  origLog(...a);
};
const total = () => Object.values(stats.routes).reduce((t, r) => ({ calls: t.calls + r.calls, cost: t.cost + r.cost, inTok: t.inTok + r.inTok, outTok: t.outTok + r.outTok }), { calls: 0, cost: 0, inTok: 0, outTok: 0 });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__stats') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ...stats, total: total() }, null, 1)); return; }
  if (url.pathname === '/__reset') { stats.routes = {}; stats.timing = {}; stats.notFound = []; stats.bytes = 0; res.end('ok'); return; }
  /* the vercel.json rewrites (source "/f/:code", has user-agent / query), applied before the routes below */
  for (const rw of conf.rewrites || []) {
    const keys = []; const re = new RegExp(`^${rw.source.replace(/:([a-z]+)/gi, (m, k) => { keys.push(k); return '([^/]+)'; })}$`); const m = re.exec(url.pathname); if (!m) continue;
    const ok = (rw.has || []).every((h) => (h.type === 'header' ? new RegExp(`^${h.value}$`).test(String(req.headers[h.key.toLowerCase()] || '')) : h.type === 'query' ? url.searchParams.has(h.key) : false));
    if (!ok) continue;
    let dest = rw.destination; keys.forEach((k, i) => { dest = dest.replace(`:${k}`, m[i + 1]); });
    const du = new URL(dest, 'http://x'); for (const [k, v] of url.searchParams) if (!du.searchParams.has(k)) du.searchParams.set(k, v);
    url.pathname = du.pathname; url.search = du.search; req.url = du.pathname + du.search; break;
  }
  if (url.pathname.startsWith('/api/')) {
    const h = handlers[url.pathname.slice(5)];
    if (!h) { res.statusCode = 404; res.end(); return; }
    const t0 = Date.now(); const route = url.pathname.slice(5); let aborted = false;
    res.on('close', () => { if (!res.writableFinished) aborted = true; const r = (stats.timing[route] ||= { n: 0, aborted: 0, over2500: 0, max: 0, codes: {} }); r.n++; const ms = Date.now() - t0; if (aborted) { r.aborted++; (stats.aborts ||= []).push({ route, ms, at: new Date().toISOString().slice(11, 23) }); } if (ms > 2500) r.over2500++; r.max = Math.max(r.max, ms); r.codes[res.statusCode] = (r.codes[res.statusCode] || 0) + 1; });
    try { await h(req, res); } catch (e) { origLog('handler error', e); if (!res.headersSent) { res.statusCode = 500; res.end(); } }
    return;
  }
  let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
  const file = path.join(DIST, path.posix.normalize(p));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { stats.notFound.push(url.pathname); res.statusCode = 404; res.end('not found'); return; }
  for (const r of rules) if (r.re.test(url.pathname)) for (const h of r.headers) res.setHeader(h.key, h.value);
  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  res.setHeader('content-type', type);
  let body = fs.readFileSync(file);
  if (TEXT.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); res.setHeader('content-encoding', 'gzip'); }
  stats.bytes += body.length;
  res.end(body);
});
server.listen(PORT, () => origLog(`vercel-local http://localhost:${PORT} (dist + ${Object.keys(handlers).length} functions)`));

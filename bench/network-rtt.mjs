/* Network versus model time for the Sage2 front door.
   1. curl: connect, TLS and time-to-first-byte of an unauthenticated GET to the endpoint (new connection each time).
   2. node fetch: the same GET repeated on a kept-alive connection (one request-response round trip with no handshake).
   3. batch calls: client time minus the server's own `latency_ms`, on the same connection reuse as the game's client.
   A GET to the base URL does not reach the model; it measures the path to the front door only.
   Usage: GAME_DIR=<game folder> node bench/network-rtt.mjs [--n 30]
   Raw output: <OUT_DIR>/network-<date>.json */
import { spawnSync } from 'node:child_process';
import { loadEnv, endpoint, rawDecide, importGame, lat, round, median, provenance, writeResult, arg, sleep } from './lib.mjs';
import { tacticCases } from './cases.mjs';

loadEnv(); const N = Number(arg('n', 30)); const url = endpoint() + '/';
const curl = [];
for (let i = 0; i < N; i++) {
  const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total} %{http_code}', url], { encoding: 'utf8' });
  const [dns, conn, tls, ttfb, total, code] = r.stdout.trim().split(' ');
  curl.push({ dnsMs: +dns * 1000, connectMs: +conn * 1000, tlsMs: +tls * 1000, firstByteMs: +ttfb * 1000, totalMs: +total * 1000, code });
  await sleep(150);
}
const keep = [];
for (let i = 0; i < N + 1; i++) { const t0 = performance.now(); const r = await fetch(url); await r.arrayBuffer(); keep.push({ ms: performance.now() - t0, code: r.status }); await sleep(100); }
keep.shift(); /* the first request opens the connection */
const { tacticQuestion } = await importGame('game/questions.mjs');
const cases = (await tacticCases()).filter((c) => c.asked).slice(0, N * 2).filter((_, i) => i % 2 === 0);
const batch = [];
for (const c of cases) { const r = await rawDecide([{ content: c.content, questions: [tacticQuestion(c.offered)] }]); if (r.ok) batch.push({ clientMs: r.ms, serverMs: r.serverMs, overheadMs: r.ms - r.serverMs }); }
const out = {
  name: 'network', provenance: provenance({ n: N, getUrl: url }),
  curlNewConnection: { httpCodes: [...new Set(curl.map((c) => c.code))], dns: lat(curl.map((c) => c.dnsMs)), connect: lat(curl.map((c) => c.connectMs)), tlsDone: lat(curl.map((c) => c.tlsMs)), firstByte: lat(curl.map((c) => c.firstByteMs)),
    firstByteMinusTlsMs: round(median(curl.map((c) => c.firstByteMs - c.tlsMs))) },
  fetchKeepAliveGet: { httpCodes: [...new Set(keep.map((k) => k.code))], ms: lat(keep.map((k) => k.ms)) },
  batchCalls: { n: batch.length, clientMs: lat(batch.map((b) => b.clientMs)), serverMs: lat(batch.map((b) => b.serverMs)), clientMinusServerMs: lat(batch.map((b) => b.overheadMs)) },
  reading: 'connect = one network round trip to the front door (TCP). A kept-alive GET is one round trip plus the front door. The batch client-minus-server gap is that round trip plus the front door, TLS reuse and JSON handling; the model time sits inside serverMs.',
  rows: { curl, keep, batch },
};
writeResult('network', out);
console.log(`curl new connection (n ${curl.length}, codes ${out.curlNewConnection.httpCodes}): connect median ${out.curlNewConnection.connect.median} p95 ${out.curlNewConnection.connect.p95} ms | TLS done median ${out.curlNewConnection.tlsDone.median} | first byte median ${out.curlNewConnection.firstByte.median} p95 ${out.curlNewConnection.firstByte.p95}`);
console.log(`kept-alive GET: median ${out.fetchKeepAliveGet.ms.median} p95 ${out.fetchKeepAliveGet.ms.p95} ms`);
console.log(`batch: client median ${out.batchCalls.clientMs.median} p95 ${out.batchCalls.clientMs.p95} | server median ${out.batchCalls.serverMs.median} p95 ${out.batchCalls.serverMs.p95} | client minus server median ${out.batchCalls.clientMinusServerMs.median} p95 ${out.batchCalls.clientMinusServerMs.p95}`);

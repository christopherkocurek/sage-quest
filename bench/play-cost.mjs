/* Cost of one play: calls, tokens and Sage2 cost per route for one run of the game.
   It starts nothing. Point it at a running local Vercel-style harness (tools/vercel-local.mjs), which counts
   every Sage2 call per route and serves GET /__stats and GET /__reset.
   Modes:
     node bench/play-cost.mjs --url http://localhost:8799 --reset      zero the counters (run this before the play)
     node bench/play-cost.mjs --url http://localhost:8799              read the counters and print the table
     GAME_DIR=<game folder> node bench/play-cost.mjs --url http://localhost:8799 --drive
         reset, run the game's tools/play.mjs against the URL (typed answers, stops at the card), then read the counters
   Raw output: <OUT_DIR>/play-cost-<date>.json */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { GAME_DIR, provenance, writeResult, arg, flag, round } from './lib.mjs';

const URL_ = (arg('url', 'http://localhost:8799')).replace(/\/$/, '');
const getJson = async (p) => (await fetch(URL_ + p)).json();
if (flag('reset') || flag('drive')) { await fetch(URL_ + '/__reset'); console.log('counters reset'); if (flag('reset')) process.exit(0); }
let driver = null;
if (flag('drive')) {
  if (!GAME_DIR) { console.error('--drive needs GAME_DIR'); process.exit(2); }
  const r = spawnSync('node', [path.join(GAME_DIR, 'tools/play.mjs')], { cwd: GAME_DIR, env: { ...process.env, URL: URL_ + '/', OUT: process.env.PLAY_OUT || path.join(process.env.TMPDIR || '/tmp', 'play-cost-shots') }, encoding: 'utf8', timeout: 600000 });
  driver = { exit: r.status, tail: (r.stdout || '').split('\n').filter(Boolean).slice(-6) };
  console.log(driver.tail.join('\n'));
}
const stats = await getJson('/__stats');
const rows = Object.entries(stats.routes || {}).map(([route, r]) => ({ route, calls: r.calls, inTok: r.inTok, outTok: r.outTok, cost: r.cost, costPerCall: r.cost / Math.max(1, r.calls) }));
const total = stats.total || {};
console.log('route'.padEnd(10), 'calls'.padStart(6), 'inTok'.padStart(8), 'outTok'.padStart(7), 'cost $'.padStart(10));
for (const r of rows) console.log(r.route.padEnd(10), String(r.calls).padStart(6), String(r.inTok).padStart(8), String(r.outTok).padStart(7), r.cost.toFixed(6).padStart(10));
console.log('total'.padEnd(10), String(total.calls).padStart(6), String(total.inTok).padStart(8), String(total.outTok).padStart(7), (total.cost || 0).toFixed(6).padStart(10));
const timing = stats.timing || {};
for (const [route, t] of Object.entries(timing)) console.log(`timing ${route}: n ${t.n} aborted ${t.aborted} over2500ms ${t.over2500} max ${t.max}ms codes ${JSON.stringify(t.codes)}`);
console.log(`not found: ${(stats.notFound || []).length}  aborts: ${(stats.aborts || []).length}`);
writeResult('play-cost', { name: 'play-cost', provenance: provenance({ url: URL_, drove: !!driver }), driver, rows, total: { ...total, costRounded: round((total.cost || 0) * 1e4, 2) / 1e4 }, timing, notFound: stats.notFound, aborts: stats.aborts });

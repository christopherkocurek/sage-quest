/* build the static output for Vercel into dist/ (or OUT_DIR).
   - web/index.html (with the HTTP transport switch and a versioned three.js path), web/src/**
   - /game/ modules the browser imports (never game/questions.mjs: the questions stay on the server)
   - /vendor/three@<version>/: only the three.js files the import graph reaches
   - /assets/: only the files the code names (sfx and first-person parts are named by pattern, so they all go)
   Fails if the Sage key, its prefix or the env variable name shows up in the output.
   - BUNDLE (default on): web/src/** + the /game/ modules are bundled and minified with esbuild into dist/src/ (one entry chunk plus lazy
     chunks for every dynamic import()), and three.js ships as its own minified file. BUNDLE=0 ships one file per module.
   Usage: node tools/build-vercel.mjs [--list-excluded]   (BUNDLE=0 for one file per module, THREE_BUNDLE=1 to bundle three.js into the chunks) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slimGlb } from './glb-slim-build.mjs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const BUNDLE = process.env.BUNDLE !== '0'; /* BUNDLE=0 = one file per module */
const THREE_BUNDLE = BUNDLE && process.env.THREE_BUNDLE === '1'; /* bundle (tree-shake) three.js into the chunks instead of shipping three.module.min.js */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.OUT_DIR || 'dist');
const WEB = path.join(ROOT, 'web');
const THREE = path.join(ROOT, 'node_modules/three');
const THREE_VER = JSON.parse(fs.readFileSync(path.join(THREE, 'package.json'), 'utf8')).version;
const VENDOR = `/vendor/three@${THREE_VER}/`;
const LINK = process.env.VERCEL ? false : process.env.SQ_LINK !== '0'; /* local builds hard-link to save disk */

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const rel = (base, f) => path.relative(base, f).split(path.sep).join('/');
let bytes = 0; const sizes = [];
function put(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (LINK) { try { fs.linkSync(src, dest); } catch { fs.copyFileSync(src, dest); } } else fs.copyFileSync(src, dest);
  const s = fs.statSync(dest).size; bytes += s; sizes.push([rel(OUT, dest), s]);
}
function write(dest, text) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text); const s = Buffer.byteLength(text); bytes += s; sizes.push([rel(OUT, dest), s]); }

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* ---------- page + client code ---------- */
let html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
if (!html.includes('"/vendor/three/')) throw new Error('index.html import map changed: update tools/build-vercel.mjs');
html = html.replaceAll('"/vendor/three/', `"${VENDOR}`);
if (BUNDLE && !THREE_BUNDLE) html = html.replace(`"three": "${VENDOR}build/three.module.js"`, `"three": "${VENDOR}build/three.module.min.js"`); /* the same API, minified by the three.js team */
html = html.replace('<script type="importmap">', '<script>window.SQ_TRANSPORT = \'http\';</script>\n<script type="importmap">');
write(path.join(OUT, 'index.html'), html);
const srcFiles = walk(path.join(WEB, 'src')).filter((f) => f.endsWith('.js'));
if (!BUNDLE) for (const f of srcFiles) put(f, path.join(OUT, 'src', rel(path.join(WEB, 'src'), f)));

/* ---------- /game/ modules: the same list the dev server serves ---------- */
const gameFiles = ['kit.mjs', 'story.mjs', 'worlds.mjs', ...fs.readdirSync(path.join(ROOT, 'game/worlds')).filter((n) => /^[a-z]+\.mjs$/.test(n)).map((n) => `worlds/${n}`)];
if (!BUNDLE) for (const n of gameFiles) put(path.join(ROOT, 'game', n), path.join(OUT, 'game', n)); /* bundled mode: the game modules are inside the chunks */

/* ---------- three.js: follow the import graph from what the code imports ---------- */
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const specs = (text) => [...text.matchAll(IMPORT_RE)].map((m) => m[1] || m[2] || m[3]);
const codeText = [...srcFiles, ...gameFiles.map((n) => path.join(ROOT, 'game', n))].map((f) => fs.readFileSync(f, 'utf8')).join('\n') + html;
const toThree = (s) => (s === 'three' ? path.join(THREE, 'build/three.module.js') : s.startsWith('three/addons/') ? path.join(THREE, 'examples/jsm', s.slice('three/addons/'.length)) : null);
const queue = [...new Set(specs(codeText).map(toThree).filter(Boolean)), path.join(THREE, 'build/three.module.js')];
const seen = new Set();
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f)) continue;
  if (!fs.existsSync(f)) throw new Error(`three file missing: ${f}`);
  seen.add(f);
  for (const s of specs(fs.readFileSync(f, 'utf8'))) {
    const t = toThree(s) || (s.startsWith('.') ? path.resolve(path.dirname(f), s) : null);
    if (t) queue.push(t);
  }
}
if (!BUNDLE) for (const f of seen) put(f, path.join(OUT, VENDOR.slice(1), rel(THREE, f).replace(/^examples\/jsm\//, 'examples/jsm/')));
else if (!THREE_BUNDLE) put(path.join(THREE, 'build/three.module.min.js'), path.join(OUT, VENDOR.slice(1), 'build/three.module.min.js')); /* the add-ons are bundled into the chunks; only the core stays a shared file (the import map points the bare 'three' at it) */

/* ---------- assets: keep what the code names ---------- */
const corpus = codeText;
const quoted = (s) => [`'${s}'`, `"${s}"`, `\`${s}\``, `${s}.glb`, `${s}.gltf`, `/${s}`].some((q) => corpus.includes(q));
function wanted(r) {
  const [dir, ...restParts] = r.split('/'); const rest = restParts.join('/');
  const stem = path.basename(r).replace(/\.[^.]+$/, '');
  if (dir === 'sfx') return true; /* pools are named at run time: sfx/<world>/<pool>_<n>.ogg */
  if (dir === 'music') return /\.(ogg|mp3)$/.test(rest); /* web/src/music.js builds the path (assets/music/<cue>.ogg, .mp3 for a browser with no Opus) */
  if (r === 'real/CREDITS.md') return true;
  if (/^real\/fp2_[a-z]+_(glove|skin)\.glb$/.test(r)) return true; /* the first-person hand poses, whose paths are built in code (fight.js hand2Url) */
  if (r === 'og.jpg') return true; /* the link preview picture, named only in index.html meta tags */
  if (/^og\/[a-z]+-[wf]\.jpg$/.test(r)) return true; /* the per-world link previews, named by api/og.js */
  if (dir === 'bodies') return /^body_(m|f|foe)\.glb$/.test(rest); /* body_foe.glb = the foes' low-poly body (bodies.js FOE_URL) */ /* the hero bodies; web/src/bodies.js builds the path (body_${bodyType}.glb) */
  if (r === 'ASSET_SOURCES.md') return true;
  if (dir === 'title') return true; /* the pixel logo layers (web/src/title2.js builds the path from order.json) */
  if (dir === 'real' && /^fp_/.test(rest)) return true; /* fp_${part}_${world}.glb, fp_pose_${n}.glb */
  const tex = /^(.*?)_(diff|nor_gl|nor|rough)$/.exec(stem);
  if ((dir === 'ground' || rest.startsWith('neon/')) && tex) return corpus.includes(tex[1]);
  if (dir === 'real' && /^gear_/.test(stem)) return quoted(stem) || quoted(stem.slice(5));
  if (dir === 'real') return quoted(stem);
  return (corpus.includes(`assets/${dir}/`) || corpus.includes(`'${dir}/`)) && quoted(stem);
}
const excluded = [];
for (const f of walk(path.join(WEB, 'assets'))) {
  const r = rel(path.join(WEB, 'assets'), f);
  if (path.basename(r).startsWith('.')) continue;
  if (wanted(r)) put(f, path.join(OUT, 'assets', r)); else excluded.push([r, fs.statSync(f).size]);
}

/* ---------- slim big models in dist only (tools/glb-slim-build.mjs); SLIM_SKIP ships a file as it is ---------- */
const SLIM_SKIP = new Set(['body_m.glb', 'body_f.glb', 'body_foe.glb']); /* they are already quantized when they are built */ /* add a file name here if its slim copy ever looks different */
let slimSaved = 0;
if (process.env.SQ_SLIM !== '0') for (const f of walk(path.join(OUT, 'assets'))) {
  if (!f.endsWith('.glb') || SLIM_SKIP.has(path.basename(f))) continue;
  const src = fs.readFileSync(f); if (src.length < 800e3) continue;
  let out = null; try { out = slimGlb(src); } catch (e) { console.warn(`slim failed, original kept: ${rel(OUT, f)} (${e.message})`); }
  if (!out || out.length >= src.length) continue;
  fs.unlinkSync(f); /* never write through a hard link into web/assets */
  fs.writeFileSync(f, out); slimSaved += src.length - out.length;
  const e = sizes.find(([r]) => r === rel(OUT, f)); if (e) e[1] = out.length; bytes -= src.length - out.length;
}

/* ---------- pre-gzipped .glb twins (Vercel does not compress model/gltf-binary). SQ_GZ=0 turns this off.
   Each glb gets <name>.glb.gz; an inline fetch shim in index.html fetches the twin (?v=<content hash>, so it can be
   cached for a year) and unzips it with DecompressionStream. Plain .glb files stay as the fallback. ---------- */
const gzMap = {}; let gzBytes = 0; let gzSaved = 0;
if (process.env.SQ_GZ !== '0') {
  for (const f of walk(path.join(OUT, 'assets'))) {
    if (!f.endsWith('.glb')) continue;
    const src = fs.readFileSync(f); const gz = zlib.gzipSync(src, { level: 9 });
    if (gz.length > src.length * 0.92) continue; /* not worth a twin */
    fs.writeFileSync(`${f}.gz`, gz); sizes.push([`${rel(OUT, f)}.gz`, gz.length]); gzBytes += gz.length; gzSaved += src.length - gz.length; bytes += gz.length;
    gzMap[`/${rel(OUT, f)}`] = crypto.createHash('sha1').update(gz).digest('hex').slice(0, 10);
  }
  const shim = `<script>/* .glb files arrive pre-gzipped (tools/build-vercel.mjs) */(()=>{const M=${JSON.stringify(gzMap)};if(!('DecompressionStream' in window))return;const f=window.fetch.bind(window);window.fetch=async(input,init)=>{const isReq=typeof input!=='string'&&!(input instanceof URL);try{const u=new URL(isReq?input.url:String(input),location.href);const v=u.origin===location.origin&&M[u.pathname];const m=((init&&init.method)||(isReq&&input.method)||'GET').toUpperCase();if(v&&m==='GET'){const r=await f(u.pathname+'.gz?v='+v,{signal:(init&&init.signal)||(isReq?input.signal:undefined)});if(r.ok&&r.body)return new Response(r.body.pipeThrough(new DecompressionStream('gzip')),{status:200,headers:{'Content-Type':'model/gltf-binary'}});}}catch(e){if(e&&e.name==='AbortError')throw e;}return f(input,init);};})();</script>`;
  const page = path.join(OUT, 'index.html');
  const h = fs.readFileSync(page, 'utf8');
  if (!h.includes('<script type="importmap">')) throw new Error('no import map to put the gz shim before');
  fs.writeFileSync(page, h.replace('<script type="importmap">', `${shim}\n<script type="importmap">`));
}

/* ---------- bundle + minify the client code (BUNDLE=0 skips this and ships one file per module) ----------
   One esbuild run, ES modules, code splitting: the static import graph from main.js becomes one entry file, and every dynamic
   import() (bosses, journey, dragon, quest props, folk, the per-world props, the mesh simplifier) becomes its own lazy chunk.
   Everything lands in dist/src/ (the code builds URLs from import.meta.url: new URL('../assets/sfx/', ...), './sfx-proc-worker.js').
   File names carry a content hash (cached for a year, see vercel.json); the worker keeps its name because the code names it. */
let title2Href = null; let bundleInfo = null;
if (BUNDLE) {
  let esbuild = null;
  try { if (process.env.SQ_NO_ESBUILD === '1') throw new Error('forced by SQ_NO_ESBUILD=1 (test of the fallback)'); esbuild = await import('esbuild'); } catch (e) { console.warn(`WARNING: esbuild is not installed (${e.message.split('\n')[0]}). Shipping the UNBUNDLED build. Install it (npm i -D esbuild) or set BUNDLE=0 to silence this.`); }
  if (!esbuild) {
    for (const f of srcFiles) put(f, path.join(OUT, 'src', rel(path.join(WEB, 'src'), f)));
    for (const n of gameFiles) put(path.join(ROOT, 'game', n), path.join(OUT, 'game', n));
    const minF = path.join(OUT, VENDOR.slice(1), 'build/three.module.min.js'); if (fs.existsSync(minF)) { bytes -= fs.statSync(minF).size; fs.rmSync(minF); const i = sizes.findIndex(([r]) => r === rel(OUT, minF)); if (i >= 0) sizes.splice(i, 1); }
    for (const f of seen) put(f, path.join(OUT, VENDOR.slice(1), rel(THREE, f)));
    const page = path.join(OUT, 'index.html'); fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace(`${VENDOR}build/three.module.min.js`, `${VENDOR}build/three.module.js`));
  } else {
    const plugin = {
      name: 'sq-paths',
      setup(b) {
        b.onResolve({ filter: /^\/game\// }, (a) => ({ path: path.join(ROOT, a.path.slice(1)) })); /* absolute /game/*.mjs imports -> the repo's game/ folder */
        if (!THREE_BUNDLE) b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true })); /* shared file, loaded through the import map */
        b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(THREE, 'examples/jsm', a.path.slice('three/addons/'.length)) }));
        if (THREE_BUNDLE) b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(THREE, 'build/three.module.js') }));
      },
    };
    const common = { bundle: true, format: 'esm', minify: true, target: ['chrome100', 'firefox100', 'safari15'], legalComments: 'none', logLevel: 'warning', charset: 'utf8', plugins: [plugin] };
    const t0 = Date.now();
    const r = await esbuild.build({ ...common, entryPoints: { main: path.join(WEB, 'src/main.js') }, outdir: path.join(OUT, 'src'), entryNames: '[name]-[hash]', chunkNames: '[name]-[hash]', splitting: true, metafile: true });
    const w = await esbuild.build({ ...common, entryPoints: { 'sfx-proc-worker': path.join(WEB, 'src/sfx-proc-worker.js') }, outdir: path.join(OUT, 'src'), entryNames: '[name]', metafile: true });
    const outs = { ...r.metafile.outputs, ...w.metafile.outputs };
    for (const [o, m] of Object.entries(outs)) { const f = path.resolve(ROOT, o); bytes += m.bytes; sizes.push([rel(OUT, f), m.bytes]); }
    const entry = Object.keys(r.metafile.outputs).find((o) => r.metafile.outputs[o].entryPoint === 'web/src/main.js'); /* (dynamic import targets carry an entryPoint too) */
    if (!entry) throw new Error('bundle: main.js entry not found in the esbuild metafile');
    /* the files the entry needs before it can run (static import edges only): these get modulepreload links */
    const pre = []; const seenOut = new Set(); const stack = [entry];
    while (stack.length) { const o = stack.pop(); if (seenOut.has(o)) continue; seenOut.add(o); pre.push('/' + rel(OUT, path.resolve(ROOT, o))); for (const i of r.metafile.outputs[o].imports) if (i.kind === 'import-statement' && !i.external) stack.push(i.path); }
    const page = path.join(OUT, 'index.html'); let h = fs.readFileSync(page, 'utf8');
    if (!h.includes('<script type="module" src="/src/main.js"></script>')) throw new Error('index.html main.js script tag changed: update tools/build-vercel.mjs');
    h = h.replace('<script type="module" src="/src/main.js"></script>', `<script type="module" src="/${rel(OUT, path.resolve(ROOT, entry))}"></script>`);
    fs.writeFileSync(page, h);
    /* the VHS cover (title2.js) is the default title, so its lazy chunk is preloaded with the entry */
    { const t2 = Object.keys(r.metafile.outputs).find((o) => r.metafile.outputs[o].entryPoint === 'web/src/title2.js'); if (t2 && !seenOut.has(t2)) title2Href = '/' + rel(OUT, path.resolve(ROOT, t2)); }
    const lazy = Object.keys(r.metafile.outputs).filter((o) => !seenOut.has(o));
    bundleInfo = { entry: rel(OUT, path.resolve(ROOT, entry)), pre, lazy: lazy.length, preBytes: pre.reduce((t, u) => t + (outs[rel(ROOT, path.join(OUT, u))]?.bytes || 0), 0), ms: Date.now() - t0 };
  }
}

/* ---------- modulepreload for the whole static import graph. Without it the browser finds the modules wave by wave
   (main.js -> world.js -> lands.js ...: 3 to 4 round trips, each one a full network latency before the title can start).
   With the links all 54 are requested at once. The links go after the import map (they must resolve through it). ---------- */
if (!BUNDLE || !bundleInfo) {
  const IMP = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\n;])\s*import\s+['"]([^'"]+)['"]/g;
  const toDist = (f) => (f.startsWith(path.join(ROOT, 'game')) ? `/game/${rel(path.join(ROOT, 'game'), f)}` : f.startsWith(path.join(WEB, 'src')) ? `/src/${rel(path.join(WEB, 'src'), f)}` : null);
  const hrefs = new Set(); const todo = [path.join(WEB, 'src/main.js')]; const done = new Set();
  while (todo.length) {
    const f = todo.pop(); if (done.has(f) || !fs.existsSync(f)) continue; done.add(f); const d = toDist(f); if (d) hrefs.add(d);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(IMP)) {
      const sp = m[1] || m[2]; if (!sp) continue;
      if (sp === 'three' || sp.startsWith('three/addons/')) continue; /* the vendor files are added below */
      const t = sp.startsWith('.') ? path.resolve(path.dirname(f), sp) : sp.startsWith('/game/') ? path.join(ROOT, sp.slice(1)) : sp.startsWith('/src/') ? path.join(WEB, sp.slice(1)) : null;
      if (t) todo.push(t);
    }
  }
  const links = [`${VENDOR}build/three.module.js`, ...[...hrefs].sort()].map((h) => `<link rel="modulepreload" href="${h}">`);
  /* the three.js add-ons the code imports (OrbitControls and the like are not reached; seen = the graph of real imports) */
  for (const f of seen) { const r = rel(THREE, f); if (r.startsWith('examples/jsm/')) links.push(`<link rel="modulepreload" href="${VENDOR}${r}">`); }
  const page = path.join(OUT, 'index.html'); const h = fs.readFileSync(page, 'utf8');
  const m = /<script type="importmap">[\s\S]*?<\/script>/.exec(h);
  if (m && hrefs.size > 5) { fs.writeFileSync(page, h.slice(0, m.index + m[0].length) + '\n' + links.join('\n') + h.slice(m.index + m[0].length)); console.log(`modulepreload: ${links.length} links`); }
}

if (bundleInfo) { /* modulepreload for the entry's static graph: three.js first, then the entry and its shared chunks, all in one round trip */
  const links = [...(THREE_BUNDLE ? [] : [`${VENDOR}build/three.module.min.js`]), ...bundleInfo.pre].map((h) => `<link rel="modulepreload" href="${h}">`);
  /* the VHS cover's chunk, only when the cover is the title (index.html head script sets html[data-title]) */
  if (title2Href) links.push(`<script>if (document.documentElement.dataset.title) { var l = document.createElement('link'); l.rel = 'modulepreload'; l.href = '${title2Href}'; document.head.appendChild(l); }</script>`);
  const page = path.join(OUT, 'index.html'); const h = fs.readFileSync(page, 'utf8'); const m = /<script type="importmap">[\s\S]*?<\/script>/.exec(h);
  if (!m) throw new Error('no import map: cannot place the modulepreload links');
  fs.writeFileSync(page, h.slice(0, m.index + m[0].length) + '\n' + links.join('\n') + h.slice(m.index + m[0].length)); console.log(`modulepreload: ${links.length} links (bundle)`);
}

/* ---------- secret check ---------- */
let key = process.env.SAGE_API_KEY || '';
if (!key) { try { key = (/^\s*SAGE_API_KEY\s*=\s*["']?([^"'\s]+)/m.exec(fs.readFileSync(path.join(ROOT, '.env'), 'utf8')) || [])[1] || ''; } catch { /* no .env (Vercel build) */ } }
const needles = ['SAGE_API_KEY', 'lv_live_', 'lv_test_', ...(key.length >= 12 ? [key, key.slice(0, 12)] : [])];
const hits = [];
for (const f of walk(OUT)) {
  if (!/\.(html|js|mjs|json|md|gltf|css|txt)$/.test(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  needles.forEach((n, i) => { if (t.includes(n)) hits.push(`${rel(OUT, f)} contains needle #${i}`); });
}
if (hits.length) { console.error('SECRET CHECK FAILED (needles are not printed):\n' + hits.join('\n')); process.exit(1); }

/* ---------- report ---------- */
const mb = (b) => `${(b / 1e6).toFixed(2)} MB`;
sizes.sort((a, b) => b[1] - a[1]);
const exBytes = excluded.reduce((s, [, b]) => s + b, 0);
console.log(`dist: ${sizes.length} files, ${mb(bytes)} (three.js ${THREE_VER}: ${seen.size} files)`);
if (bundleInfo) console.log(`bundle: entry ${bundleInfo.entry}, ${bundleInfo.pre.length} files before the title (${(bundleInfo.preBytes / 1e3).toFixed(0)} kB raw), ${bundleInfo.lazy} lazy chunks, ${bundleInfo.ms} ms`);
else console.log(`bundle: off (${BUNDLE ? 'esbuild missing' : 'BUNDLE=0'})`);
console.log(`slimmed glb files: ${(slimSaved / 1e6).toFixed(2)} MB saved`);
console.log(`gzip twins: ${Object.keys(gzMap).length} glb, ${(gzBytes / 1e6).toFixed(2)} MB (saves ${(gzSaved / 1e6).toFixed(2)} MB per full download)`);
console.log(`excluded assets: ${excluded.length} files, ${mb(exBytes)}`);
if (process.argv.includes('--list-excluded')) for (const [r, b] of excluded.sort((a, b) => b[1] - a[1])) console.log(`  - ${r} ${mb(b)}`);
console.log('largest:'); for (const [r, b] of sizes.slice(0, 12)) console.log(`  ${mb(b).padStart(9)}  ${r}`);
console.log(`secret check: clean (${needles.length} needles${key ? ', key known' : ', key not available here'})`);

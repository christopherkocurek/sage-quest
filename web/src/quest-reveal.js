/* QUESTCARD: "HERE'S YOUR QUEST!" The one moment between "Start quest" and the first objective. It shows the whole run's
   goal in one line built from the player's own answers (the enemy, the ones they fight for, the motive), over the enemy
   itself: the run's real far figure (world.nemesis, the shape on the horizon) is drawn once as a pixel silhouette into the
   tape-cover stage (cover.js paintStage: violet sky, banded sun, neon grid). Then a hard cut to the world, where the
   guide's small objective is already up. About 3.2 s; any key, click or tap after 1 s ends it.
   Look and sound come from the existing moments: the pixel banner of "YOU GAIN POWER!!!" (powerup.js), the cover stage
   (cover.js), a synth sting on the sfx bus (sfx.js sfxVoice, so the audio bar's mute holds).
   No Sage2 call: the goal line is a local template over the story (game/story.mjs).
   Hooks: main.js hud.chapter (chapter I) and handOff.
   Dense one-line code uses block comments only. */
import * as THREE from 'three';
import { sfxVoice, sfx } from './sfx.js';
import { coverFonts, FONT, HOT, paintStage } from './cover.js';

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const INK = '#1a0208'; const CREAM = HOT.cream;
const PAL = [HOT.y, HOT.o, HOT.r, '#fffbe0', HOT.teal, '#ff9a1f'];

/* ---------------------------------------------------------------- the goal line */
/* the quest's shape (story.shape) -> the motive the player gave */
const SHAPE_MOTIVE = { vigil: 'protect', hunt: 'revenge', trial: 'glory', chains: 'freedom', dark: 'wonder' };
/* "my brother" said with no name -> "your brother" */
const yours = (t) => String(t || '').replace(/\bmy\b/gi, 'your').replace(/\bMy\b/g, 'Your');
/* "brother Wren" -> "Wren"; "my little brother" -> "your little brother" */
const REL = new Set('brother brothers sister sisters mom mum mother dad father parents son sons daughter daughters kid kids child children baby wife husband partner girlfriend boyfriend fiance fiancee friend friends family grandma grandmother grandpa grandfather nan nana aunt uncle cousin cousins niece nephew dog cat puppy pup horse team crew people folks my our the a an little big old best dear sweet younger older'.split(' '));
function nameOf(t) { const w = String(t || '').split(/\s+/).filter(Boolean); const own = w.filter((x) => /^\p{Lu}/u.test(x) && !REL.has(x.toLowerCase())); return own.length ? own.join(' ') : yours(t); }
/* the player's own words for the enemy, when they are short and not the body's own name ("the storm", "my doubts");
   else the body's label ("the Giant"). Never "yourself", "nothing" */
function enemyPhrase(label, words) {
  const lab = String(label || 'The enemy').replace(/^The /, 'the ');
  const w = String(words || '').trim().replace(/[.!?…,;:"“”]+/g, '').replace(/\s+/g, ' ');
  if (!w || w.length > 26 || w.split(' ').length > 3 || !/^[\p{L}' -]+$/u.test(w)) return lab;
  if (/^(me|myself|i|nothing|no one|nobody|none|everything|everyone|it|them|him|her|you|yourself)$/i.test(w)) return lab;
  /* the words name the body itself ("a dragon" for the Dragon): the label is the cleaner name */
  if (lab.replace(/^the /i, '').toLowerCase().split(/\s+/).some((x) => x.length > 3 && w.toLowerCase().includes(x))) return lab;
  const own = yours(w).replace(/^(a|an) /i, 'the ');
  return /^(the|your|his|her|their)\b/i.test(own) ? own.charAt(0).toLowerCase() + own.slice(1) : own;
}
/* -> { text, parts: [{ t, k: ''|'foe'|'who' }] }: two short sentences, about 9 words, the enemy first, then who it is for */
export function goalLine(story, { enemyWords = '', ww = (t) => t } = {}) {
  const st = story || {}; const motive = SHAPE_MOTIVE[st.shape] || 'protect';
  const foe = enemyPhrase(st.enemy, enemyWords);
  const names = Array.isArray(st.flames) && st.loved ? st.flames.slice(0, 2).map(nameOf) : [];
  const who = names.length ? names : null; const P = [];
  const t = (s) => P.push({ t: ww(s), k: '' }); const f = () => P.push({ t: foe, k: 'foe' });
  const n = () => { who.forEach((x, i) => { if (i) t(' and '); P.push({ t: x, k: 'who' }); }); };
  if (motive === 'revenge') { t('Bring down '); f(); t('.'); P.push({ t: ' ', k: 'gap' }); if (who) { t('Do it for '); n(); t('.'); } else t('Settle the debt.'); }
  else if (motive === 'freedom') { t('Bring down '); f(); t('.'); P.push({ t: ' ', k: 'gap' }); if (who) { t('Set '); n(); t(' free.'); } else t('Open the road again.'); }
  else if (motive === 'wonder') { t('Bring down '); f(); t('.'); P.push({ t: ' ', k: 'gap' }); if (who) { t('Show '); n(); t(' the stars.'); } else t('Bring the stars back.'); }
  else if (motive === 'glory') { t('Bring down '); f(); t('.'); P.push({ t: ' ', k: 'gap' }); t('Make your name a legend.'); }
  else { t('Bring down '); f(); t('.'); P.push({ t: ' ', k: 'gap' }); if (who) { t('Bring '); n(); t(' home.'); } else t('Bring your people home.'); }
  return { text: P.map((p) => p.t).join(''), parts: P };
}

/* ---------------------------------------------------------------- the enemy as a pixel silhouette */
/* One render of the far figure alone (its meshes on a spare layer, plain white materials, eyes red), read back, then
   painted in the cover's ink with a hot rim and lit eyes. th = rows of pixels. null when there is no figure. */
const LAYER = 23;
export function snapFigure(world, th = 120, eye = HOT.teal) {
  const nm = world?.nemesis; const holder = nm?.holder; const R = world?.renderer; const scene = world?.scene;
  if (!holder || !R || !scene || nm.leaving || !holder.parent) return null;
  const swaps = []; const cache = new Map(); let rt = null; const prev = {};
  try {
    /* the sky dragon is caught mid-bank by its own glide: level it, wings out, head on toward the hero, for the one shot (its
       next frame takes the glide back) */
    if (nm.boss?.flightPose) { try { const b = nm.boss; const hx = -holder.position.x; const hz = -holder.position.z; b.yaw = Math.atan2(hx, hz); b.tgt.roll = 0; b.tgt.pitch = 0.05; b.flightPose(b.tgt, 0.15, 0.55); for (let i = 0; i < 10; i++) b.animate(1 / 20); } catch { /* the pose as it is */ } }
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true); if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(-c.x, 0, -c.z); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize();
    const wide = Math.max(size.x, size.z); const a = Math.max(0.45, Math.min(2.4, (wide / Math.max(0.01, size.y)) * 1.05));
    /* a flyer (the dragon glides in a circle, wings edge-on from the side) is seen from below, wings spread */
    const flyer = !!(nm.spec?.dragon || nm.boss); const el = flyer ? 0.3 : 0;
    const mat = (m, isEye) => { const key = `${isEye}|${m?.alphaMap?.uuid || ''}|${m?.map && m.alphaTest ? m.map.uuid : ''}|${m?.side}`; let b = cache.get(key); if (!b) { b = new THREE.MeshBasicMaterial({ color: isEye ? 0xff0000 : 0xffffff, fog: false, side: m?.side ?? THREE.FrontSide, alphaMap: m?.alphaMap || null, map: m?.alphaTest && m?.map ? m.map : null, alphaTest: m?.alphaMap || m?.alphaTest ? Math.max(0.2, m.alphaTest || 0.25) : 0, toneMapped: false }); cache.set(key, b); } return b; };
    holder.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const isEye = (m) => m && (m.isMeshBasicMaterial || o.userData?.part === 'Eyes');
      const old = o.material; const now = Array.isArray(old) ? old.map((m) => mat(m, isEye(m))) : mat(old, isEye(old));
      swaps.push([o, old, o.layers.mask]); o.material = now; o.layers.enable(LAYER);
    });
    if (!swaps.length) return null;
    prev.rt = R.getRenderTarget(); prev.cc = R.getClearColor(new THREE.Color()); prev.ca = R.getClearAlpha(); prev.bg = scene.background; prev.ov = scene.overrideMaterial;
    scene.background = null; scene.overrideMaterial = null; R.setClearColor(0x000000, 0);
    /* the box of a posed, skinned figure can be short of its real reach: a mask that touches the frame is shot again, looser */
    let H = 0; let Wd = 0; let cam = null; let A = null; let n = 0; let minX = 0; let maxX = 0; let minY = 0; let maxY = 0;
    for (let loose = flyer ? 1.5 : 1, k = 0; k < 3; k++, loose *= 1.6) {
      H = Math.round(th * loose); Wd = Math.max(16, Math.round(H * a));
      const fov = 18; const half = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const dist = Math.max((size.y * 0.56) / half, (wide * 0.56) / (half * a)) * loose; const deep = (wide + size.y) * 2;
      cam = new THREE.PerspectiveCamera(fov, Wd / H, Math.max(0.1, dist - deep), dist + deep);
      cam.position.copy(c).addScaledVector(dir, dist * Math.cos(el)); cam.position.y -= dist * Math.sin(el); cam.lookAt(c); cam.layers.set(LAYER); cam.updateMatrixWorld(true);
      rt?.dispose(); rt = new THREE.WebGLRenderTarget(Wd, H, { depthBuffer: true });
      R.setRenderTarget(rt); R.clear(true, true, true); R.render(scene, cam);
      const buf = new Uint8Array(Wd * H * 4); R.readRenderTargetPixels(rt, 0, 0, Wd, H, buf);
      /* the mask, top row first (GL rows run bottom-up) */
      A = new Uint8Array(Wd * H); n = 0; minX = Wd; maxX = -1; minY = H; maxY = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < Wd; x++) { const i = ((H - 1 - y) * Wd + x) * 4; if (buf[i + 3] < 100) continue; const e = buf[i] > 150 && buf[i + 1] < 90; A[y * Wd + x] = e ? 2 : 1; n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      if (n < 40 || (minX > 0 && maxX < Wd - 1 && minY > 0 && (maxY < H - 1 || !flyer))) break;
    }
    if (n < 40) return null;
    /* the figure stands on its ground: its feet sit on the horizon, and a hammer hanging lower overhangs the floor in front.
       A flyer (its holder is its middle, high in the mask) has no ground */
    let foot = null;
    { const gp = new THREE.Vector3(); holder.getWorldPosition(gp); gp.project(cam); const row = Math.round((1 - (gp.y + 1) / 2) * H); if (!flyer && row > minY + (maxY - minY) * 0.55 && row < maxY) foot = row - minY; }
    const cw = maxX - minX + 3; const ch = maxY - minY + 2; const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d');
    const img = g.createImageData(cw, ch); const D = img.data;
    const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const C = { ink: hex('#12020c'), deep: hex('#3a0620'), rim: hex(HOT.o), top: hex(HOT.y), eye: hex(eye), eyeW: hex('#fffbe0') };
    const at = (x, y) => (x < 0 || y < 0 || x >= Wd || y >= H ? 0 : A[y * Wd + x]);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const sx = x + minX - 1; const sy = y + minY; const v = at(sx, sy); if (!v) continue;
      const o = (y * cw + x) * 4; let col = C.ink;
      const up = !at(sx, sy - 1); const side = !at(sx - 1, sy) || !at(sx + 1, sy);
      if (up) col = C.top; else if (side) col = C.rim; else if (!at(sx, sy - 2) || !at(sx - 2, sy) || !at(sx + 2, sy)) col = C.deep; /* a two-pixel backlit edge: the sun is behind it */
      D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = 255;
    }
    /* the eyes: lit, one pixel bigger, a white core */
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const sx = x + minX - 1; const sy = y + minY; if (at(sx, sy) !== 2) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; const yy = y + dy; if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue; const o = (yy * cw + xx) * 4; const core = !dx && !dy; const col = core ? C.eyeW : C.eye; D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = 255; } }
    g.putImageData(img, 0, 0);
    return { canvas: cv, w: cw, h: ch, flyer, foot: foot ?? ch };
  } catch (err) { console.warn('questcard figure', err); return null; } finally {
    for (const [o, old, mask] of swaps) { o.material = old; o.layers.mask = mask; }
    for (const m of cache.values()) m.dispose();
    if (prev.cc) { R.setRenderTarget(prev.rt); R.setClearColor(prev.cc, prev.ca); scene.background = prev.bg; scene.overrideMaterial = prev.ov; }
    rt?.dispose();
  }
}

/* ---------------------------------------------------------------- the sound: a crack and a low boom, the enemy's two
   dark notes as it rises, then a bright stab and bells when the goal lands (powerup.js jingle family) */
function sting(kind) {
  const V = sfxVoice(); if (!V) return;
  try {
    const c = V.ctx; const t0 = c.currentTime + 0.02;
    const bus = c.createGain(); bus.gain.value = 0.2; bus.connect(V.out);
    const tone = (type, f, t, d, gn, slide) => { const ny = c.sampleRate * 0.45; f = Math.min(f, ny); if (slide) slide = Math.min(slide, ny); const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d); const a = c.createGain(); a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(gn, t + 0.008); a.gain.exponentialRampToValueAtTime(0.0008, t + d); o.connect(a); a.connect(bus); o.start(t); o.stop(t + d + 0.03); };
    const noise = (t, d, gn, f0 = 3000) => { const n = Math.floor(c.sampleRate * d); const b = c.createBuffer(1, n, c.sampleRate); const ch = b.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2); const s = c.createBufferSource(); s.buffer = b; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f0, t); lp.frequency.exponentialRampToValueAtTime(200, t + d); const a = c.createGain(); a.gain.value = gn; s.connect(lp); lp.connect(a); a.connect(bus); s.start(t); };
    const hz = (semi) => 523.25 * Math.pow(2, semi / 12);
    if (kind === 'open') {
      noise(t0, 0.4, 0.9, 5200); tone('triangle', 98, t0, 0.9, 0.7, 41); tone('square', 262, t0, 0.3, 0.4, 65);
      /* the banner run: up an octave and a half in fast squares */
      [0, 3, 7, 10, 12, 15, 19].forEach((s, i) => tone('square', hz(s - 12), t0 + 0.1 + i * 0.045, 0.1, 0.26));
      /* the enemy rises: two low, dark notes a tritone apart */
      tone('sawtooth', hz(-30), t0 + 0.42, 0.75, 0.32, hz(-31)); tone('square', hz(-24), t0 + 0.42, 0.7, 0.16); tone('square', hz(-18), t0 + 0.62, 0.55, 0.14);
      return;
    }
    /* the goal lands: a crack, a bright major stab a fourth up, sparkle */
    noise(t0, 0.18, 0.5, 8000); tone('triangle', hz(-19), t0, 0.8, 0.6);
    [17, 21, 24, 29].forEach((s) => tone('square', hz(s), t0, 0.6, 0.17, hz(s) * 1.01));
    [36, 41, 45, 48, 53, 48].forEach((s, i) => tone('triangle', hz(s), t0 + 0.12 + i * 0.06, 0.15, 0.13));
  } catch { /* audio is optional */ }
}

/* ---------------------------------------------------------------- the overlay */
const CSS = `
#qc{position:fixed;inset:0;z-index:59;pointer-events:none;display:none;overflow:hidden;background:#0a0326}
#qc.on{display:block}
#qc canvas{position:absolute;display:block}
#qc .stage{left:0;top:0;width:100%;height:100%;transform-origin:50% 62%}
#qc .figw{position:absolute;overflow:hidden}
#qc .fig{position:absolute;left:0;bottom:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;transform-origin:50% 100%}
#qc .fx{left:0;top:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}
#qc .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(10,0,6,.26) 0 2px,transparent 2px 4px)}
#qc .flash{position:absolute;inset:0;mix-blend-mode:screen;background:radial-gradient(circle at 50% 50%,#fff 0 22%,#ffe27a 48%,#ff7a1f 100%);opacity:0}
#qc .band{position:absolute;left:0;right:0;background:rgba(18,2,10,.68);box-shadow:inset 0 1px 0 ${HOT.y};transform-origin:50% 50%}
#qc .band::after{content:'';position:absolute;left:0;right:0;top:100%;height:8px;background:linear-gradient(180deg,${HOT.y} 0 25%,${HOT.o} 25% 50%,${HOT.r} 50% 75%,${HOT.p} 75%)}
#qc .ban{position:absolute;left:16px;right:16px;display:flex;flex-direction:column;align-items:center;will-change:transform}
#qc .ban .r{display:flex;justify-content:center}
#qc .ban span{display:block;font-family:${FONT.pixel};line-height:1.12;white-space:nowrap;padding:.06em .02em .14em;
  background:linear-gradient(180deg,#fffbe0 0%,#fff1a0 11%,${HOT.y} 20%,${HOT.o} 31%,${HOT.r} 41%,#9a0a28 50%,#fffbe0 50%,#fff1a0 61%,${HOT.y} 70%,${HOT.o} 81%,${HOT.r} 91%,#9a0a28 100%);background-size:100% 200%;
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 .06em 0 #8a0c2a) drop-shadow(0 .06em 0 #5a0418) drop-shadow(.06em .06em 0 ${INK}) drop-shadow(0 0 .3em rgba(255,110,30,.55))}
#qc .goal{position:absolute;left:16px;right:16px;margin:0 auto;text-align:center;text-wrap:balance;font-family:${FONT.vt};color:${CREAM};line-height:1.0;text-shadow:.07em .07em 0 ${INK},0 0 .4em rgba(0,0,0,.9);will-change:transform}
#qc .goal .s{display:block;white-space:nowrap}
#qc .goal.wrap .s{white-space:normal}
#qc .goal b{font-weight:400;color:${HOT.y};white-space:nowrap}
#qc .goal em{font-style:normal;color:#ff8a4a;white-space:nowrap;text-shadow:.07em .07em 0 ${INK},0 0 .3em rgba(255,70,40,.9),0 0 .8em rgba(255,60,40,.5)}
#qc-recall{position:fixed;left:50%;transform:translateX(-50%);bottom:120px;z-index:6;pointer-events:none;font-family:${FONT.vt};font-size:clamp(20px,1.5vw,28px);line-height:1;color:${CREAM};text-shadow:.07em .07em 0 ${INK},0 0 .4em rgba(0,0,0,.9);background:rgba(18,2,10,.72);border-bottom:3px solid ${HOT.o};padding:.3em .8em .35em;white-space:normal;text-align:center;width:max-content;max-width:min(92vw,960px);opacity:0;transition:opacity .3s}
#qc-recall.on{opacity:1}
#qc-recall b{font-weight:400;color:${HOT.y}} #qc-recall em{font-style:normal;color:#ff6a3a}
#qc-recall.trail{bottom:auto;font-size:clamp(19px,1.75vw,30px);transition:opacity .8s}
#qc-recall.trail.on{transition:opacity .18s}
body.touch #qc-recall.trail{max-width:min(62vw,560px);font-size:16px}
body.touch #qc-recall:not(.trail),body.st-card #qc-recall,body.cine #qc-recall,body.chap #qc-recall,body.qcard #qc-recall{display:none}
body.qcard #bars{display:none !important}
`;
let el = null;
function build() {
  if (el) return el;
  const st = document.createElement('style'); st.id = 'qc-css'; st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'qc'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
  root.innerHTML = '<canvas class="stage"></canvas><div class="figw"><canvas class="fig"></canvas></div><canvas class="fx"></canvas><div class="band"></div><div class="ban"></div><div class="goal"></div><div class="scan"></div><div class="flash"></div>';
  document.body.appendChild(root);
  el = { root, stage: root.querySelector('.stage'), figw: root.querySelector('.figw'), fig: root.querySelector('.fig'), fx: root.querySelector('.fx'), band: root.querySelector('.band'), ban: root.querySelector('.ban'), goal: root.querySelector('.goal'), flash: root.querySelector('.flash') };
  return el;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* each sentence is one unit: a line breaks between the two sentences before it breaks inside one */
export const goalHtml = (parts) => `<span class="s">${parts.map((p) => (p.k === 'gap' ? '</span> <span class="s">' : p.k === 'foe' ? `<em>${esc(p.t)}</em>` : p.k === 'who' ? `<b>${esc(p.t)}</b>` : esc(p.t))).join('')}</span>`;

let live = null;
/* opts = { world, story, enemyWords, ww, tint (0xRRGGBB, the world's cover tint) } -> Promise (resolves when the card is gone) */
export async function questReveal({ world, story, enemyWords = '', ww, tint = 0x2ee8ff, onLanded = null } = {}) {
  if (!story) return false;
  const goal = goalLine(story, { enemyWords, ww });
  try { (window.__sq ||= {}).questGoal = goal.text; } catch { /* tests only */ }
  recall(goal);
  try { await Promise.race([coverFonts(), new Promise((r) => setTimeout(r, 700))]); } catch { /* fallback font */ }
  /* a quick-start link's short power banner (powerup.js) plays first: one card at a time */
  for (let i = 0; i < 40 && document.querySelector('#pw.on'); i++) await new Promise((r) => setTimeout(r, 100));
  live?.end(true);
  return new Promise((done) => run(goal, { world, tint, onLanded }, done));
}

function run(goal, { world, tint, onLanded }, done) {
  const E = build(); const RM = reduced();
  const W = innerWidth; const H = innerHeight; const base = Math.min(W, H); const portrait = W < H * 0.95; const flat = H < 520 && !portrait;
  const T = 3.3; const OUT = 0.16; const tGoal = RM ? 0.45 : 0.62; const tSkip = 1.0; /* the goal lands early: 2.7 s to read it */
  /* the enemy first: an upright phone sizes its stack round it */
  let fig = null; try { fig = snapFigure(world, portrait ? 110 : flat ? 90 : 128, `#${new THREE.Color(tint).getHexString()}`); } catch (err) { console.warn('questcard figure', err); }
  /* ---- layout: banner on top, the enemy in the sun on the horizon, the goal on the dark band below ---- */
  const rows = portrait ? [["HERE'S", 'YOUR'], ['QUEST!']] : [["HERE'S", 'YOUR', 'QUEST!']];
  let bSize = portrait ? Math.min((W - 32) / (W < 420 ? 7.6 : 6.8), H * 0.068) : Math.min((W - 32) / 20.5, H * (flat ? 0.085 : 0.088), 84);
  E.ban.innerHTML = ''; const words = [];
  for (const r of rows) { const d = document.createElement('div'); d.className = 'r'; d.style.gap = `${Math.round(bSize * 0.55)}px`; for (const w of r) { const s = document.createElement('span'); s.textContent = w; s.style.fontSize = `${Math.round(bSize)}px`; d.appendChild(s); words.push(s); } E.ban.appendChild(d); }
  const banTop = Math.round(portrait ? Math.max(H * 0.08, 84) : flat ? H * 0.05 : H * 0.065); E.ban.style.top = `${banTop}px`;
  const gSize = Math.round(portrait ? Math.max(26, Math.min(W * 0.092, 40)) : Math.min(84, Math.max(26, base * (flat ? 0.09 : 0.088)))); /* two lines, one per sentence, large */
  E.goal.innerHTML = goalHtml(goal.parts); E.goal.style.fontSize = `${gSize}px`; E.goal.style.maxWidth = portrait ? `${W - 32}px` : `${Math.min(W - 32, gSize * 24)}px`;
  E.root.classList.add('on'); E.root.style.visibility = 'hidden'; E.goal.classList.remove('wrap');
  /* one sentence a line: the type shrinks (to 20 px) before a sentence breaks */
  { let gs = gSize; const room = W - 32; for (let n = 0; n < 12 && [...E.goal.children].some((c) => c.scrollWidth > room) && gs > 20; n++) { gs = Math.max(20, Math.round(gs * 0.93)); E.goal.style.fontSize = `${gs}px`; } if ([...E.goal.children].some((c) => c.scrollWidth > room)) E.goal.classList.add('wrap'); }
  for (let n = 0; n < 6 && E.ban.scrollWidth > W - 24; n++) { bSize *= 0.92; for (const w of words) w.style.fontSize = `${Math.round(bSize)}px`; }
  let banBot = E.ban.getBoundingClientRect().bottom;
  /* the goal sits low; the band runs round it */
  const gh = E.goal.getBoundingClientRect().height; const pad = Math.round(gSize * 0.42);
  /* an upright phone: banner, enemy and goal as one stack in the middle (the enemy as wide as the screen allows), the grid below */
  let gTop;
  if (portrait) {
    const above = fig ? Math.min((W * 0.88 * fig.foot) / fig.w, H * 0.4) * (fig.flyer ? 1.24 : 1) : W * 0.7; const gapB = H * 0.03; const gapH = Math.max(18, H * 0.03); const banH = banBot - banTop;
    const stack = banH + gapB + above + gapH + pad * 2 + gh; const top0 = Math.round(Math.max(84, (H - stack) / 2 - H * 0.04));
    E.ban.style.top = `${top0}px`; banBot = top0 + banH; gTop = Math.round(Math.min(H - H * 0.06 - gh, banBot + gapB + above + gapH + pad));
  } else gTop = Math.round(H - (flat ? H * 0.06 : H * 0.085) - gh);
  E.goal.style.top = `${gTop}px`;
  const bandTop = gTop - pad; const bandH = gh + pad * 2; E.band.style.top = `${bandTop}px`; E.band.style.height = `${bandH}px`;
  const horY = Math.round(bandTop - Math.max(18, (bandTop - banBot) * (portrait ? 0.12 : 0.1)));
  const figTop = banBot + (portrait ? H * 0.025 : H * 0.03); const figH = Math.max(60, horY - figTop + 4);
  const sunR = Math.round(Math.min(figH * 0.62, W * (portrait ? 0.42 : 0.2))); const sunX = W / 2; const sunY = horY - sunR * 0.42;
  /* ---- the stage, painted once ---- */
  const dpr = Math.min(2, devicePixelRatio || 1); const sc = E.stage; sc.width = Math.round(W * dpr); sc.height = Math.round(H * dpr);
  { const g = sc.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); paintStage(g, W, H, { horY, sunX, sunY, sunR, tint, feet: [{ x: sunX, y: horY + 2, w: sunR * 1.1 }] }); }
  /* ---- the enemy ---- */
  if (fig) {
    const k = Math.min((fig.flyer ? figH / 1.24 : figH) / fig.foot, (W * (portrait ? 0.88 : 0.5)) / fig.w); const fw = Math.round(fig.w * k); const fh = Math.round(fig.h * k);
    const lift = fig.flyer ? Math.round(fh * 0.22) : 0; /* a flyer hangs in the sky over the horizon */
    const fTop = Math.round(horY + 3 - fig.foot * k - lift); /* what hangs below the feet may cross the floor, never into the band */
    Object.assign(E.figw.style, { display: '', left: `${Math.round(sunX - fw / 2)}px`, top: `${fTop}px`, width: `${fw}px`, height: `${Math.max(8, Math.min(fh, bandTop - fTop))}px` });
    E.fig.style.height = `${fh}px`; E.fig.style.bottom = 'auto'; E.fig.style.top = '0';
    E.fig.width = fig.w; E.fig.height = fig.h; E.fig.getContext('2d').drawImage(fig.canvas, 0, 0);
  } else E.figw.style.display = 'none';
  E.root.style.visibility = '';
  /* ---- animation (WAAPI) ---- */
  const anims = []; const A = (node, kf, o) => { const a = node.animate(kf, { fill: 'both', ...o }); anims.push(a); return a; };
  if (!RM) words.forEach((s) => A(s, [{ backgroundPosition: '0 0%' }, { backgroundPosition: '0 100%' }], { duration: 900, iterations: Infinity, easing: 'steps(9)', fill: 'none' })); /* the 80s colour cycling (none with reduced motion) */
  if (RM) {
    A(E.ban, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    A(E.figw, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 150 });
    A(E.band, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 300 });
    A(E.goal, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: tGoal * 1000 });
  } else {
    A(E.stage, [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: T * 1000, easing: 'cubic-bezier(.2,.7,.3,1)' }); /* a slow pull back through the whole card */
    words.forEach((s, i) => A(s, [{ transform: 'translateY(-.8em) scale(1.7) rotate(-6deg)', opacity: 0 }, { transform: 'translateY(0) scale(.82) rotate(2deg)', opacity: 1, offset: 0.5 }, { transform: 'scale(1.12) rotate(-1deg)', offset: 0.75 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 380, delay: 60 + i * 90, easing: 'cubic-bezier(.25,.9,.35,1)' }));
    A(E.ban, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.4) saturate(1.4)' }, { filter: 'brightness(1)' }], { duration: 110, delay: 560, iterations: 2, fill: 'none' });
    /* the enemy rises out of the horizon behind the band, then its eyes flare */
    A(E.fig, [{ transform: 'translateY(100%)' }, { transform: 'translateY(-3%)', offset: 0.8 }, { transform: 'translateY(0)' }], { duration: 620, delay: 300, easing: 'cubic-bezier(.2,.8,.3,1)' });
    A(E.fig, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.9)', offset: 0.3 }, { filter: 'brightness(1)' }], { duration: 420, delay: 880, fill: 'none' });
    A(E.band, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 160, delay: tGoal * 1000 - 120, easing: 'ease-out' });
    A(E.goal, [{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(.92)', opacity: 1, offset: 0.55 }, { transform: 'scale(1.04)', offset: 0.8 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, delay: tGoal * 1000, easing: 'cubic-bezier(.25,.9,.35,1)' });
    A(E.goal, [{ scale: '1' }, { scale: '1.04' }], { duration: (T - tGoal - 0.3) * 1000, delay: tGoal * 1000 + 300, easing: 'linear', fill: 'none' }); /* a slow push-in through the hold */
    A(E.flash, [{ opacity: 0.75 }, { opacity: 0.75, offset: 0.3 }, { opacity: 0 }], { duration: 120, easing: 'linear', fill: 'forwards' });
    A(E.flash, [{ opacity: 0.55 }, { opacity: 0 }], { duration: 70, delay: tGoal * 1000, easing: 'linear', fill: 'forwards' }); /* screen blend: a hot flash, never a veil */
  }
  /* ---- the pixel layer: a burst under the banner, embers rising off the horizon, rings when the goal lands ---- */
  const px = Math.max(3, Math.round(base / 170)); const cw = Math.ceil(W / px); const ch = Math.ceil(H / px);
  const cv = E.fx; cv.width = cw; cv.height = ch; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const lowTier = (window.__sq?.quality?.tier || window.__sq?.tier) === 'low';
  const parts = []; const rings = [];
  const burst = (x, y, n, sp) => { if (RM) n = Math.round(n * 0.25); if (lowTier) n = Math.round(n * 0.6); for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2); const v = rnd(0.2, 1) * sp; parts.push({ x, y, vx: Math.cos(a) * v * 1.4, vy: Math.sin(a) * v - rnd(0, sp * 0.3), life: rnd(0.6, 1.4), t: 0, c: PAL[(Math.random() * PAL.length) | 0], s: Math.random() < 0.3 ? 2 : 1 }); } };
  const bannerY = (banBot - (E.ban.getBoundingClientRect().height / 2)) / px; const goalY = (gTop + gh / 2) / px; const hy = horY / px;
  burst(cw / 2, bannerY, 160, base / px * 1.1);
  let t = 0; let last = performance.now(); let raf = 0; let endAt = T; let ended = false; let firedGoal = false; let firedOut = false; let emit = 0;
  sting('open'); try { sfx('qEnemy', { gain: 0.9 }); } catch { /* optional */ }
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    /* the goal is read: the walk is built under the card, so its objective is up the frame the card cuts away */
    if (onLanded && t >= tGoal + 0.3) { const cb = onLanded; onLanded = null; try { cb(); } catch { /* caller */ } }
    if (!firedGoal && t >= tGoal) { firedGoal = true; sting('goal'); burst(cw / 2, goalY, 90, base / px * 0.8); rings.push({ t0: t, y: goalY, c: HOT.y }); rings.push({ t0: t + 0.07, y: goalY, c: HOT.teal }); }
    if (!firedOut && t >= endAt - OUT) {
      firedOut = true;
    }
    g.clearRect(0, 0, cw, ch);
    /* embers off the horizon, the whole card */
    if (!RM) { emit += dt * (lowTier ? 25 : 50); while (emit >= 1) { emit -= 1; parts.push({ x: rnd(0, cw), y: hy + rnd(-2, 4), vx: rnd(-4, 4), vy: rnd(-26, -10), life: rnd(0.6, 1.3), t: 0, c: Math.random() < 0.6 ? HOT.o : HOT.y, s: 1, up: true }); } }
    for (const r of RM ? [] : rings) { const u = (t - r.t0) / 0.5; if (u < 0 || u > 1) continue; g.globalAlpha = 1 - u; g.strokeStyle = r.c; g.lineWidth = 1; g.beginPath(); g.ellipse(cw / 2, r.y, 4 + u * cw * 0.55, 2 + u * cw * 0.12, 0, 0, Math.PI * 2); g.stroke(); }
    for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.t += dt; if (q.t > q.life) { parts.splice(i, 1); continue; } q.vy += (q.up ? -8 : 30) * dt; q.vx *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt; g.globalAlpha = 1 - q.t / q.life; g.fillStyle = q.c; g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); }
    g.globalAlpha = 1;
    /* shake: the open, the enemy landing, the goal */
    if (!RM) { const sh = Math.max(clamp01(1 - t / 0.28), t > 0.85 ? clamp01(1 - (t - 0.85) / 0.2) * 0.5 : 0, t >= tGoal ? clamp01(1 - (t - tGoal) / 0.22) * 0.7 : 0); const dx = sh ? Math.round(rnd(-1, 1) * 9 * sh) : 0; const dy = sh ? Math.round(rnd(-1, 1) * 7 * sh) : 0; E.root.style.translate = sh ? `${dx}px ${dy}px` : ''; }
    if (t >= endAt) return finish();
    raf = requestAnimationFrame(frame);
  };
  const finish = () => {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    removeEventListener('keydown', skip, true); removeEventListener('pointerdown', skip, true);
    for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    E.root.classList.remove('on'); E.root.style.translate = ''; g.clearRect(0, 0, cw, ch);
    if (live === handle) live = null; trail(); if (onLanded) { const cb = onLanded; onLanded = null; try { cb(); } catch { /* caller */ } } done(true);
  };
  /* any key, click or tap after 1 s: out in 0.16 s (the sound button stays its own) */
  const skip = (e) => { if (e?.target?.closest?.('#sq-audio')) return; if (t < tSkip) return; if (endAt > t + 0.06) endAt = t + 0.06; };
  addEventListener('keydown', skip, true); addEventListener('pointerdown', skip, true);
  const handle = { end: () => finish() }; live = handle;
  raf = requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- the goal, findable later: "?" shows it over the controls */
let recallEl = null; let recallObs = null;
function recall(goal) {
  try {
    if (!recallEl) { build(); recallEl = document.createElement('div'); recallEl.id = 'qc-recall'; document.body.appendChild(recallEl); }
    recallEl.innerHTML = goalHtml(goal.parts);
    const lg = document.getElementById('legend'); if (!lg || recallObs) return;
    const sync = () => { if (recallEl.classList.contains('trail')) return; const on = lg.classList.contains('ask'); recallEl.classList.toggle('on', on); if (on) { const r = lg.getBoundingClientRect(); if (r.height) recallEl.style.bottom = `${Math.round(innerHeight - r.top + 10)}px`; } };
    recallObs = new MutationObserver(sync); recallObs.observe(lg, { attributes: true, attributeFilter: ['class'] }); sync();
  } catch (err) { console.warn('questcard recall', err); }
}
/* after the cut the goal stays 6 s as a small line under the first objective, so the step reads as part of the quest */
let trailT = 0;
function trail() {
  if (!recallEl) return; clearInterval(trailT); const el = recallEl; let n = 0; let shown = -1;
  const obj = () => { const o = document.querySelector('#labels > .goal-ui, #labels > .task-ui'); const r = o?.getBoundingClientRect(); return r && r.height && +getComputedStyle(o).opacity > 0.9 ? r : null; }; /* only a settled objective */
  /* a boss already up (its name and bar fill the top): the goal stays with "?" and the card */
  const fightUp = () => [...document.querySelectorAll('#labels > .boss-ui:not(.task-ui)')].some((b) => b.getBoundingClientRect().height > 0);
  const blocked = () => { const rot = document.getElementById('tc-rot'); return !!rot && !rot.classList.contains('hidden') && rot.offsetParent !== null; };
  el.classList.add('trail');
  /* it comes with the first objective (up to 2 s), never under the phone's turn notice; then 6 s, then it fades */
  trailT = setInterval(() => {
    n++; const r = obj(); if (fightUp()) { clearInterval(trailT); el.classList.remove('on', 'trail'); el.style.top = ''; return; }
    if (shown < 0) { if (blocked() || (!r && n < 8)) { if (n > 240) { clearInterval(trailT); el.classList.remove('trail'); } return; } shown = n; el.classList.add('on'); }
    el.style.top = `${Math.round(r ? r.bottom + 8 : 74)}px`;
    if (n - shown === 24) el.classList.remove('on');
    if (n - shown >= 28) { clearInterval(trailT); el.classList.remove('trail'); el.style.top = ''; }
  }, 250);
}
export function dropRecall() { recallObs?.disconnect(); recallObs = null; recallEl?.remove(); recallEl = null; }

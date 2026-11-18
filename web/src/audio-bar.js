/* audio bar.
   One pixel speaker icon, on screen from the title to the end card and on the friend landing (top-left: the Sage2 panel, the
   tape badges, the HUD, the touch controls and the card all sit elsewhere). Click / tap / M = mute ALL sound.
   Open (hover or keyboard focus on desktop, double tap or long press on a phone): master volume + Music + Sound effects.
   How it reaches every sound: sfx.js ends in ONE master GainNode before ctx.destination (music, samples, voices, jingles, the
   procedural death / create / power sounds all pass it). sfxGate = sound effects only; the music has its own gain (music.mute).
   State: localStorage 'sq-audio' {m: master mute, v: volume 0..1, s: sound effects on}; the music toggle is music.js' own key.
   Honest icon: it shows the setting. A browser keeps the context suspended until the first click or key; the icon never
   resumes it by itself (a hover does nothing to the audio), and while suspended it shows the normal (unmuted) icon.
   Test hook: window.__sqAudio. */
import { music } from './music.js';
import { sfxBus } from './sfx.js';

const Q = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); } })();
const KEY = 'sq-audio';
const COARSE = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
/* top-left on a desktop (free on every screen); top-right on a phone (the question and the progress sit top-left there). ?abpos= is a layout test hook */
const POS = ['tl', 'tr', 'ml', 'mr', 'bl', 'br'].includes(Q.get('abpos')) ? Q.get('abpos') : COARSE ? 'tr' : 'tl';
const RAMP = 0.06; /* seconds: a mute or a volume step glides, so there is no click */

/* ---------------------------------------------------------------- state */
const S = { m: false, v: 1, s: true };
try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') { S.m = !!j.m; S.v = Math.max(0, Math.min(1, +j.v)); if (!Number.isFinite(S.v)) S.v = 1; S.s = j.s !== false; } } catch { /* storage is optional */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* optional */ } };
const musicOn = () => { try { return !music.status().muted; } catch { return true; } };
const level = () => (S.m ? 0 : S.v * S.v); /* perceptual: the slider's middle is -12 dB; full = the mix as it was */

function glide(g, to, ctx, ramp = RAMP) {
  try { const t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); if (ramp > 0) g.linearRampToValueAtTime(to, t + ramp); else g.setValueAtTime(to, t); } catch { /* audio is optional */ }
}
/* the audio graph may not exist yet (before the first click): the saved state is applied the moment it does */
function apply(ramp = RAMP) {
  const B = sfxBus(); if (!B) return;
  glide(B.master.gain, level(), B.ctx, ramp);
  glide(B.sfxGate.gain, S.s ? 1 : 0, B.ctx, ramp);
}
if (typeof window !== 'undefined') window.addEventListener('sq-audio-ready', () => apply(0));

/* ---------------------------------------------------------------- icons: 12 x 10 pixel grids (# = pixel) */
const GRID = {
  spk: ['.............', '......#......', '.....##......', '.###.##......', '.###.##......', '.###.##......', '.###.##......', '.....##......', '......#......', '.............'],
  waves: ['.............', '..........#..', '...........#.', '........#...#', '.........#..#', '.........#..#', '........#...#', '...........#.', '..........#..', '.............'],
  x: ['.............', '.............', '........#...#', '.........#.#.', '..........#..', '.........#.#.', '........#...#', '.............', '.............', '.............'],
};
const rects = (rows, cls) => `<g class="${cls}">` + rows.map((r, y) => [...r].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')).join('')).join('') + '</g>';
const ICON = `<svg viewBox="0 0 13 10" width="26" height="20" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects(GRID.spk, 'spk')}${rects(GRID.waves, 'wv')}${rects(GRID.x, 'xx')}</svg>`;
const bits = (rows) => `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" width="${rows[0].length * 2}" height="${rows.length * 2}" shape-rendering="crispEdges" aria-hidden="true" focusable="false" fill="currentColor">${rects(rows, 'b')}</svg>`;
const NOTE = bits(['...#####', '...#####', '...#...#', '...#...#', '...#...#', '..##..##', '.###.###', '..#...#.']);
const BOLT = bits(['....#....', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '....#....']);

const CSS = `
#sq-audio { position: fixed; left: max(12px, env(safe-area-inset-left)); top: max(12px, env(safe-area-inset-top)); z-index: 60; display: flex; align-items: center; gap: 8px; pointer-events: none; font-family: 'Press Start 2P', ui-monospace, monospace; -webkit-tap-highlight-color: transparent; }
#sq-audio > * { pointer-events: auto; }
#sq-audio[data-pos="tr"], #sq-audio[data-pos="mr"], #sq-audio[data-pos="br"] { left: auto; right: max(12px, env(safe-area-inset-right)); flex-direction: row-reverse; }
#sq-audio[data-pos="ml"], #sq-audio[data-pos="mr"] { top: 50%; transform: translateY(-50%); }
#sq-audio[data-pos="bl"], #sq-audio[data-pos="br"] { top: auto; bottom: max(12px, env(safe-area-inset-bottom)); }
#sq-audio .sqa-btn, #sq-audio .sqa-tg { box-sizing: border-box; margin: 0; padding: 0; cursor: pointer; color: #ffe27a; background: rgba(12,4,8,.78); border: 2px solid #ffcf3a; border-radius: 0; box-shadow: 3px 4px 0 #1a0408; touch-action: manipulation; transition: transform .08s, border-color .12s, color .12s, background .12s; }
#sq-audio .sqa-btn { width: 40px; height: 40px; display: grid; place-items: center; }
#sq-audio .sqa-btn svg { display: block; filter: drop-shadow(1px 1px 0 #1a0408); }
#sq-audio .sqa-btn:hover, #sq-audio .sqa-tg:hover { border-color: #fff3c9; background: rgba(40,12,16,.86); }
#sq-audio .sqa-btn:active, #sq-audio .sqa-tg:active { transform: translate(2px, 3px); box-shadow: 1px 1px 0 #1a0408; }
#sq-audio :focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
#sq-audio .sqa-btn .wv, #sq-audio .sqa-btn .spk { fill: currentColor; } #sq-audio .sqa-btn .xx { fill: #ff5a2a; display: none; }
#sq-audio[data-muted="1"] .sqa-btn { color: #c98a5a; border-color: #b8651f; } #sq-audio[data-muted="1"] .sqa-btn .wv { display: none; } #sq-audio[data-muted="1"] .sqa-btn .xx { display: inline; }
#sq-audio.pop .sqa-btn { animation: sqa-pop .32s steps(4); }
@keyframes sqa-pop { 0% { transform: scale(1); } 40% { transform: scale(1.22); } 100% { transform: scale(1); } }
#sq-audio .sqa-panel { display: none; align-items: center; gap: 8px; height: 40px; padding: 0 8px; background: rgba(12,4,8,.78); border: 2px solid rgba(255,207,58,.7); box-shadow: 3px 4px 0 #1a0408; }
#sq-audio[data-open="1"] .sqa-panel { display: flex; }
#sq-audio .sqa-vol { -webkit-appearance: none; appearance: none; width: 84px; height: 22px; margin: 0; padding: 0; background: transparent; cursor: pointer; touch-action: pan-y; }
#sq-audio .sqa-vol::-webkit-slider-runnable-track { height: 8px; background: linear-gradient(90deg, #ffb030 var(--p, 100%), #3a1218 var(--p, 100%)); border: 2px solid #1a0408; box-shadow: 0 0 0 1px rgba(255,207,58,.55); }
#sq-audio .sqa-vol::-moz-range-track { height: 8px; background: linear-gradient(90deg, #ffb030 var(--p, 100%), #3a1218 var(--p, 100%)); border: 2px solid #1a0408; box-shadow: 0 0 0 1px rgba(255,207,58,.55); }
#sq-audio .sqa-vol::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 20px; margin-top: -8px; background: #ffe27a; border: 2px solid #1a0408; border-radius: 0; box-shadow: 0 0 0 1px #ffcf3a; }
#sq-audio .sqa-vol::-moz-range-thumb { width: 8px; height: 16px; background: #ffe27a; border: 2px solid #1a0408; border-radius: 0; box-shadow: 0 0 0 1px #ffcf3a; }
#sq-audio .sqa-tg { width: 32px; height: 30px; display: grid; place-items: center; box-shadow: 2px 3px 0 #1a0408; position: relative; }
#sq-audio .sqa-tg[aria-pressed="false"] { color: #8a5a4a; border-color: #6a3a2a; background: rgba(12,4,8,.6); }
#sq-audio .sqa-tg[aria-pressed="false"]::after { content: ''; position: absolute; left: 3px; right: 3px; top: 50%; height: 2px; background: #ff5a2a; transform: rotate(-35deg); }
#sq-audio .sqa-tg i { position: absolute; right: 1px; bottom: -1px; font-style: normal; font-size: 6px; line-height: 1; color: #ffe3c0; text-shadow: 1px 1px 0 #1a0408; }
@media (pointer: coarse) {
  #sq-audio .sqa-btn { width: 44px; height: 44px; } #sq-audio .sqa-panel { height: 44px; gap: 6px; padding: 0 6px; }
  #sq-audio .sqa-tg { width: 44px; height: 44px; } #sq-audio .sqa-vol { width: 96px; height: 44px; }
}
/* on a phone the Sage2 strip (touch.js) runs under the top-right corner: it steps aside for the bar */
html.sq-ab body.touch #feed, html.sq-ab body.touch.st-fight #feed.ticker { right: calc(env(safe-area-inset-right, 0px) + 68px); }
@media (max-width: 360px) { #sq-audio .sqa-vol { width: 64px; } }
@media (prefers-reduced-motion: reduce) { #sq-audio * { transition: none !important; animation: none !important; } }
`;

/* ---------------------------------------------------------------- the control */
let root; let btn; let vol; let tgM; let tgS; let openT = 0; let closeT = 0; let lastTap = 0;
const HOVER = (() => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; } })();

function paint() {
  if (!root) return;
  const silent = S.m || S.v === 0;
  root.dataset.muted = silent ? '1' : '0';
  btn.setAttribute('aria-pressed', silent ? 'true' : 'false');
  const label = silent ? 'Unmute sound' : 'Mute sound'; btn.setAttribute('aria-label', label); btn.title = label;
  vol.value = String(Math.round(S.v * 100)); vol.style.setProperty('--p', Math.round(S.v * 100) + '%'); vol.setAttribute('aria-valuetext', Math.round(S.v * 100) + ' percent');
  const mo = musicOn(); tgM.setAttribute('aria-pressed', mo ? 'true' : 'false'); tgM.title = mo ? 'Music on' : 'Music off';
  tgS.setAttribute('aria-pressed', S.s ? 'true' : 'false'); tgS.title = S.s ? 'Sound effects on' : 'Sound effects off';
}
function pop() { if (!root) return; root.classList.remove('pop'); void root.offsetWidth; root.classList.add('pop'); }

/* the three settings */
export function setMuted(on, { quiet = false } = {}) {
  S.m = !!on; if (!S.m && S.v === 0) S.v = 0.6; /* unmuting a slider at zero would stay silent */
  save(); apply(); paint(); if (!quiet) pop();
}
export const toggleMute = () => setMuted(!(S.m || S.v === 0));
function setVolume(v) { S.v = Math.max(0, Math.min(1, v)); if (S.v > 0) S.m = false; save(); apply(); paint(); }
function setMusic(on) { try { music.mute(!on); } catch { /* optional */ } paint(); }
function setSfx(on) { S.s = !!on; save(); apply(); paint(); }

/* open / close */
let why = ''; /* what opened it: 'hover' | 'focus' | 'tap'; only the same cause closes it (a blur after a tap must not shut a bar the player just opened) */
function open(on, by) {
  clearTimeout(closeT); clearTimeout(openT);
  if (!root) return; root.dataset.open = on ? '1' : '0'; if (on && by) why = by; if (!on) why = '';
  if (on) { clearTimeout(idleT); idleT = setTimeout(() => { if (!root.matches(':hover') && !root.contains(document.activeElement?.matches?.(':focus-visible') ? document.activeElement : null)) open(false); }, 6000); }
}
let idleT = 0;
const keepOpen = () => { if (root?.dataset.open === '1') open(true); }; /* an action inside an open bar restarts its idle timer */

let prevFocus = null;
function restoreFocus() { /* a click must not steal the answer field's focus or leave Space / Enter on a button */
  const p = prevFocus; prevFocus = null;
  try { if (p && p !== document.body && document.contains(p) && !root.contains(p)) p.focus({ preventScroll: true }); else if (root.contains(document.activeElement) && !document.activeElement.matches(':focus-visible')) document.activeElement.blur(); } catch { /* gone */ }
}

function build() {
  if (document.getElementById('sq-audio')) return;
  const st = document.createElement('style'); st.id = 'sq-audio-css'; st.textContent = CSS; document.head.appendChild(st);
  root = document.createElement('div'); root.id = 'sq-audio'; root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Sound'); root.dataset.open = '0'; root.dataset.muted = '0'; root.dataset.pos = POS;
  root.innerHTML = `<button type="button" class="sqa-btn" aria-label="Mute sound" aria-pressed="false">${ICON}</button>
<div class="sqa-panel"><input type="range" class="sqa-vol" min="0" max="100" step="5" value="100" aria-label="Master volume"><button type="button" class="sqa-tg sqa-m" aria-label="Music" aria-pressed="true">${NOTE}</button><button type="button" class="sqa-tg sqa-s" aria-label="Sound effects" aria-pressed="true">${BOLT}</button></div>`;
  document.body.appendChild(root);
  document.documentElement.classList.add('sq-ab');
  btn = root.querySelector('.sqa-btn'); vol = root.querySelector('.sqa-vol'); tgM = root.querySelector('.sqa-m'); tgS = root.querySelector('.sqa-s');

  /* the bar eats its own pointer events: a tap on it is not an attack, a skip or a start */
  for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'dblclick']) root.addEventListener(ev, (e) => e.stopPropagation());
  /* Space / Enter / arrows on the bar belong to the bar (Space is talk, Enter is send elsewhere) */
  root.addEventListener('keydown', (e) => { if (e.code === 'Escape') { open(false); restoreFocus(); } if (['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.code)) e.stopPropagation(); });
  root.addEventListener('keyup', (e) => { if (['Space', 'Enter'].includes(e.code)) e.stopPropagation(); });
  root.addEventListener('pointerdown', () => { const a = document.activeElement; prevFocus = a && a !== document.body && !root.contains(a) ? a : prevFocus; }, true);
  root.addEventListener('pointerup', () => setTimeout(restoreFocus, 0), true);

  /* the icon: a click toggles mute; on a phone a second tap within 0.6 s, or a long press, opens the bar instead */
  let pressT = 0; let longDone = false;
  btn.addEventListener('pointerdown', (e) => { longDone = false; if (e.pointerType !== 'mouse') pressT = setTimeout(() => { longDone = true; open(true, 'tap'); }, 520); });
  const endPress = () => clearTimeout(pressT);
  btn.addEventListener('pointerup', endPress); btn.addEventListener('pointercancel', endPress); btn.addEventListener('pointerleave', endPress);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    if (longDone) { longDone = false; return; }
    const touch = e.pointerType === 'touch' || (!HOVER && e.detail > 0);
    const now = e.timeStamp || performance.now();
    if (touch && now - lastTap < 600) { lastTap = 0; toggleMute(); open(true, 'tap'); return; } /* second tap: undo the first, open the bar */
    lastTap = touch ? now : 0;
    toggleMute(); keepOpen();
  });
  vol.addEventListener('input', () => { setVolume(vol.value / 100); keepOpen(); });
  tgM.addEventListener('click', () => { setMusic(!musicOn()); keepOpen(); });
  tgS.addEventListener('click', () => { setSfx(!S.s); keepOpen(); });

  /* hover (a mouse) and keyboard focus open it; a touch never does by hover */
  if (HOVER) {
    root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; clearTimeout(closeT); clearTimeout(openT); openT = setTimeout(() => { if (root.dataset.open !== '1') open(true, 'hover'); }, 120); });
    root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'touch') return; clearTimeout(openT); clearTimeout(closeT); closeT = setTimeout(() => { if (why === 'hover' && (!root.contains(document.activeElement) || !document.activeElement.matches(':focus-visible'))) open(false); }, 500); });
  }
  root.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) open(true, why || 'focus'); });
  root.addEventListener('focusout', (e) => { if (why === 'focus' && !root.contains(e.relatedTarget) && !(HOVER && root.matches(':hover'))) closeT = setTimeout(() => open(false), 200); });
  /* a tap outside closes the phone's bar */
  document.addEventListener('pointerdown', (e) => { if (root.dataset.open === '1' && !root.contains(e.target)) open(false); }, true);

  /* M = the master mute, unless the player is typing */
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const t = e.target; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || '') || t?.isContentEditable) return;
    toggleMute();
  });
  paint(); apply(0);
}

if (typeof document !== 'undefined') {
  window.__sqAudioBar = true;
  window.__sqAudio = { state: () => ({ ...S, music: musicOn(), level: level() }), setMuted, toggleMute, setVolume, setMusic, setSfx, gain: () => { const B = sfxBus(); return B ? { master: +B.master.gain.value.toFixed(4), sfx: +B.sfxGate.gain.value.toFixed(4), ctx: B.ctx.state } : null; } };
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build, { once: true });
}

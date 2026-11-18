/* the "1986 VHS fantasy tape cover" look of the title, for the end card, the share images, the share
   panel and the friend landing. The frame, the logo and the type stay constant; the scene's colour comes from the world,
   graded hot. The title files are not touched: the palette, the stripes, the sticker, the pixel button and the banded
   sun are restated here from web/src/title2.js. */
import * as THREE from 'three';

export const HOT = { band: '#0c0408', y: '#ffcf3a', o: '#ff7a1e', r: '#e8203a', p: '#7a0c5a', cream: '#fff3d6', ink: '#1a0610', teal: '#2ee8ff', peach: '#ffe3c0', amber: '#ffb36a', deep: '#8a0c2a', plum: '#2a0414' };
export const FONT = { pixel: '"Press Start 2P", ui-monospace, monospace', vt: 'VT323, ui-monospace, monospace', serif: '"Playfair Display", Georgia, serif', sans: 'Geist, system-ui, sans-serif' };

/* the title's pixel fonts (and the heavy italic of the cover blurb); the same Google Fonts link the title adds */
let fontP = null;
export function coverFonts() {
  if (fontP) return fontP;
  if (!document.getElementById('cover-fonts')) {
    const l = document.createElement('link'); l.id = 'cover-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Playfair+Display:ital,wght@0,900;1,800;1,900&display=swap';
    document.head.appendChild(l);
  }
  const want = [`24px ${FONT.pixel}`, `32px ${FONT.vt}`, `italic 900 64px ${FONT.serif}`, `900 64px ${FONT.serif}`];
  fontP = Promise.race([Promise.all(want.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 3000))]).then(() => true);
  return fontP;
}

/* ---------- 2D pieces ---------- */
/* four stripes (yellow, orange, red, plum), nearest first; dir 1 = down from y, -1 = up from y */
export function stripes(g, x, y, w, t, dir = 1, order = [HOT.y, HOT.o, HOT.r, HOT.p]) {
  order.forEach((c, i) => { g.fillStyle = c; g.fillRect(x, dir > 0 ? y + i * t : y - (i + 1) * t, w, t); });
}
export function band(g, W, h, t) { g.fillStyle = HOT.band; g.fillRect(0, 0, W, h); stripes(g, 0, h, W, t, 1); }
export function bill(g, W, H, h, t) { g.fillStyle = HOT.band; g.fillRect(0, H - h, W, h); stripes(g, 0, H - h, W, t, -1, [HOT.p, HOT.r, HOT.o, HOT.y]); }
export function spines(g, W, top, bottom, w) {
  const cols = [[0, 0.18, HOT.band], [0.18, 0.36, HOT.y], [0.36, 0.54, HOT.o], [0.54, 0.72, HOT.r], [0.72, 0.9, HOT.p], [0.9, 1, HOT.band]];
  for (const [a, b, c] of cols) { g.fillStyle = c; g.fillRect(Math.round(w * a), top, Math.ceil(w * (b - a)), bottom - top); g.fillRect(W - Math.round(w * b), top, Math.ceil(w * (b - a)), bottom - top); }
}
/* "VHS" in a slanted cream box and "HI-FI STEREO" outlined, right-aligned in the top band */
export function tapeTags(g, right, cy, s) {
  g.save(); g.textBaseline = 'middle';
  g.font = `800 ${Math.round(14 * s)}px ${FONT.sans}`; const hf = 'HI-FI STEREO'; const sp = 0.14 * 14 * s;
  const tw = (t) => g.measureText(t).width + sp * (t.length - 1);
  const w2 = tw(hf) + 14 * s; const h = 22 * s; let x = right - w2;
  g.strokeStyle = HOT.peach; g.lineWidth = 2 * s; g.strokeRect(x, cy - h / 2, w2, h);
  g.fillStyle = HOT.peach; spaced(g, hf, x + 7 * s, cy + s, sp);
  g.font = `italic 800 ${Math.round(19 * s)}px ${FONT.sans}`; const w1 = g.measureText('VHS').width + 18 * s; x -= w1 + 8 * s;
  g.save(); g.translate(x + w1 / 2, cy); g.transform(1, 0, -0.21, 1, 0, 0); g.fillStyle = HOT.cream; g.fillRect(-w1 / 2, -h / 2, w1, h); g.fillStyle = HOT.ink; g.textAlign = 'center'; g.fillText('VHS', 0, s); g.restore();
  g.restore();
}
function spaced(g, text, x, y, sp) { let cx = x; for (const ch of text) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; } return cx; }
export function spacedWidth(g, text, sp) { return g.measureText(text).width + sp * Math.max(0, text.length - 1); }
export function spacedText(g, text, x, y, sp, align = 'left') { const w = spacedWidth(g, text, sp); const a = g.textAlign; g.textAlign = 'left'; spaced(g, text, align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y, sp); g.textAlign = a; return w; }
/* the tape's scan lines over everything (a CSS-free overlay baked into the picture) */
export function scan(g, W, H, a = 0.13, step = 3) { g.save(); g.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < H; y += step) g.fillRect(0, y, W, 1); g.restore(); }
/* the hot grade on rendered pixels: magenta in the sky, orange at the ground, a sun glow; soft-light keeps the world's own hue */
export function hotGrade(g, x, y, w, h, { sunX = 0.7, sunY = 0.45, k = 1 } = {}) {
  g.save();
  g.globalCompositeOperation = 'soft-light';
  const v = g.createLinearGradient(0, y, 0, y + h);
  v.addColorStop(0, `rgba(170,30,150,${0.4 * k})`); v.addColorStop(0.45, `rgba(255,70,90,${0.15 * k})`); v.addColorStop(1, `rgba(255,130,40,${0.4 * k})`);
  g.fillStyle = v; g.fillRect(x, y, w, h);
  /* the title's sky: violet over magenta in the top half */
  g.globalCompositeOperation = 'overlay';
  const sky = g.createLinearGradient(0, y, 0, y + h * 0.6); sky.addColorStop(0, `rgba(90,20,170,${0.2 * k})`); sky.addColorStop(0.6, `rgba(200,30,120,${0.1 * k})`); sky.addColorStop(1, 'rgba(200,30,120,0)');
  g.fillStyle = sky; g.fillRect(x, y, w, h * 0.6);
  g.globalCompositeOperation = 'screen';
  const r = g.createRadialGradient(x + w * sunX, y + h * sunY, 0, x + w * sunX, y + h * sunY, Math.max(w, h) * 0.55);
  r.addColorStop(0, `rgba(255,120,50,${0.32 * k})`); r.addColorStop(1, 'rgba(255,120,50,0)'); g.fillStyle = r; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'multiply';
  const e = g.createRadialGradient(x + w / 2, y + h * 0.5, Math.min(w, h) * 0.35, x + w / 2, y + h * 0.5, Math.max(w, h) * 0.8);
  e.addColorStop(0, 'rgba(255,255,255,1)'); e.addColorStop(1, 'rgba(140,70,150,1)'); g.fillStyle = e; g.fillRect(x, y, w, h);
  g.restore();
}
/* the cover blurb: heavy italic serif, cream, names in yellow, a hard two-step shadow and a thin red/cyan split, tilted -3 deg */
export function wrapWords(g, text, maxW) {
  if (String(text).includes('\n')) return String(text).split('\n').flatMap((t) => wrapWords(g, t, maxW));
  const words = String(text).split(' '); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
export function fitBlurb(g, text, maxW, maxLines, big, small, maxH = Infinity) {
  let size = big; let lines = [];
  for (; size >= small; size -= 2) { g.font = `italic 900 ${size}px ${FONT.serif}`; lines = wrapWords(g, text, maxW); if (lines.length <= maxLines && lines.every((l) => g.measureText(l).width <= maxW) && lines.length * size * 1.04 <= maxH) break; }
  /* balance: the narrowest measure that keeps the line count (no lone word on the last line) */
  if (lines.length > 1) { for (let w = maxW - 10; w > maxW * 0.55; w -= 10) { const t = wrapWords(g, text, w); if (t.length !== lines.length) break; lines = t; } }
  return { size, lines, lh: Math.round(size * 1.04) };
}
export function drawBlurb(g, b, x, top, names = [], { rot = -0.052, color = HOT.cream, name = HOT.y } = {}) {
  const list = [...new Set(names.filter(Boolean))].sort((p, q) => q.length - p.length);
  const re = list.length ? new RegExp(`(${list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`) : null;
  const k = b.size / 64;
  /* a name is set roman: the italic swash capital T read as an I ("Iam") */
  const fIt = `italic 900 ${b.size}px ${FONT.serif}`; const fRo = `900 ${Math.round(b.size * 0.94)}px ${FONT.serif}`;
  g.save(); g.translate(x, top); g.rotate(rot); g.font = fIt; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  b.lines.forEach((line, i) => {
    const y = b.size * 0.86 + i * b.lh; const parts = re ? line.split(re).filter(Boolean) : [line];
    const run = (fn) => { let cx = 0; for (const p of parts) { const nm = list.includes(p); g.font = nm ? fRo : fIt; fn(p, cx, nm); cx += g.measureText(p).width + (nm ? b.size * 0.04 : 0); } g.font = fIt; };
    run((p, cx) => { g.fillStyle = HOT.plum; g.fillText(p, cx + 6 * k, y + 6 * k); });
    run((p, cx) => { g.fillStyle = HOT.deep; g.fillText(p, cx + 3 * k, y + 3 * k); });
    run((p, cx) => { g.fillStyle = 'rgba(0,220,255,.45)'; g.fillText(p, cx - 1.5 * k, y); g.fillStyle = 'rgba(255,0,80,.45)'; g.fillText(p, cx + 1.5 * k, y); });
    run((p, cx, isName) => { g.fillStyle = isName ? name : color; g.fillText(p, cx, y); });
  });
  g.restore();
  return top + b.lines.length * b.lh + b.size * 0.25;
}
/* the cover line in the title's pixel type (Press Start 2P): cream words, names in the logo's hot gradient,
   a hard two-step shadow; the size that fits maxW in maxLines, balanced */
export function pixelFit(g, text, maxW, maxLines, big, small, maxH = Infinity) {
  let size = big; let lines = [];
  const T = String(text || '').toUpperCase();
  for (; size >= small; size -= 2) { g.font = `${size}px ${FONT.pixel}`; lines = wrapWords(g, T, maxW); if (lines.length <= maxLines && lines.every((l) => g.measureText(l).width <= maxW) && lines.length * size * 1.3 <= maxH) break; }
  if (lines.length > 1) { for (let w = maxW - 8; w > maxW * 0.5; w -= 8) { const t = wrapWords(g, T, w); if (t.length !== lines.length) break; lines = t; } }
  return { size, lines, lh: Math.round(size * 1.3), w: Math.max(0, ...lines.map((l) => g.measureText(l).width)) };
}
export function drawPixel(g, b, x, top, names = [], { color = HOT.cream, hot = false } = {}) {
  const list = [...new Set(names.filter(Boolean).map((n) => String(n).toUpperCase()))].sort((p, q) => q.length - p.length);
  const re = list.length ? new RegExp(`(${list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`) : null;
  const k = Math.max(2, Math.round(b.size * 0.08));
  g.save(); g.font = `${b.size}px ${FONT.pixel}`; g.textBaseline = 'top'; g.textAlign = 'left';
  b.lines.forEach((line, i) => {
    const y = top + i * b.lh; const parts = re ? line.split(re).filter(Boolean) : [line];
    const grad = () => { const gr = g.createLinearGradient(0, y, 0, y + b.size); gr.addColorStop(0, '#fff1a0'); gr.addColorStop(0.48, '#ffcf3a'); gr.addColorStop(0.52, '#ff9a1e'); gr.addColorStop(1, '#ff5a1e'); return gr; };
    const run = (fn) => { let cx = x; for (const p of parts) { fn(p, cx, list.includes(p)); cx += g.measureText(p).width; } };
    run((p, cx) => { g.fillStyle = HOT.plum; g.fillText(p, cx + k * 2, y + k * 2); });
    run((p, cx) => { g.fillStyle = HOT.deep; g.fillText(p, cx + k, y + k); });
    run((p, cx, nm) => { g.fillStyle = nm || hot ? grad() : color; g.fillText(p, cx, y); });
  });
  g.restore();
  return top + b.lines.length * b.lh - (b.lh - b.size);
}
/* the title's pixel button: a hot gradient slab, a dark rim, a hard offset shadow, a blinking-red triangle (drawn still) */
export function pixelButton(g, x, y, text, size, { tri = true, measure = false } = {}) {
  g.save(); g.font = `${size}px ${FONT.pixel}`; const sp = size * 0.06; const tw = spacedWidth(g, text.toUpperCase(), sp);
  const padL = size * 0.95; const padR = size * 1.2; const triW = tri ? size * 1.5 : 0; const w = Math.round(padL + triW + tw + padR); const h = Math.round(size * 2.6);
  if (measure) { g.restore(); return { w, h }; }
  const b = Math.max(2, size * 0.13);
  g.fillStyle = HOT.ink; g.fillRect(x + size * 0.25 + b, y + size * 0.3 + b, w + b, h + b); /* the hard shadow */
  g.fillRect(x - b, y - b, w + 2 * b, h + 2 * b); /* the dark rim */
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#ffe27a'); gr.addColorStop(0.48, '#ffb030'); gr.addColorStop(0.52, '#ff7a1e'); gr.addColorStop(1, '#e8401a');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,250,210,.55)'; g.fillRect(x, y, w, Math.max(2, size * 0.1));
  let cx = x + padL;
  if (tri) { g.fillStyle = '#b0102a'; g.beginPath(); g.moveTo(cx, y + h / 2 - size * 0.5); g.lineTo(cx + size * 0.85, y + h / 2); g.lineTo(cx, y + h / 2 + size * 0.5); g.closePath(); g.fill(); cx += triW; }
  g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,240,180,.6)'; spacedText(g, text.toUpperCase(), cx + 1, y + h / 2 + size * 0.06 + 1, sp);
  g.fillStyle = '#2a0608'; spacedText(g, text.toUpperCase(), cx, y + h / 2 + size * 0.06, sp);
  g.restore(); return { w, h };
}
/* the call on a picture is a strip of label tape, not a button (the real buttons sit beside the card):
   cream tape, a red edge stripe top and bottom, dark pixel words, a small tilt, cut ends */
export function tapeLabel(g, x, y, text, size, { measure = false, tri = false } = {}) {
  g.save(); g.font = `${size}px ${FONT.pixel}`; const sp = size * 0.06; const tw = spacedWidth(g, text.toUpperCase(), sp);
  const pad = size * 0.9; const triW = tri ? size * 1.4 : 0; const w = Math.round(pad * 2 + triW + tw); const h = Math.round(size * 2.3);
  if (measure) { g.restore(); return { w, h }; }
  g.translate(x, y + h / 2); g.rotate(-0.025); g.translate(0, -h / 2);
  const cut = size * 0.35;
  const path = () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w - cut, h * 0.5); g.lineTo(w, h); g.lineTo(0, h); g.lineTo(cut, h * 0.5); g.closePath(); };
  g.fillStyle = 'rgba(10,2,6,.5)'; g.save(); g.translate(size * 0.2, size * 0.25); path(); g.fill(); g.restore();
  g.fillStyle = HOT.cream; path(); g.fill();
  g.save(); path(); g.clip(); g.fillStyle = HOT.r; g.fillRect(0, 0, w, Math.max(2, size * 0.16)); g.fillRect(0, h - Math.max(2, size * 0.16), w, Math.max(2, size * 0.16));
  g.fillStyle = 'rgba(122,12,90,.08)'; for (let i = 0; i < w; i += size * 0.5) g.fillRect(i, 0, 1, h); g.restore();
  let cx = pad;
  if (tri) { g.fillStyle = HOT.r; g.beginPath(); g.moveTo(cx, h / 2 - size * 0.45); g.lineTo(cx + size * 0.75, h / 2); g.lineTo(cx, h / 2 + size * 0.45); g.closePath(); g.fill(); cx += triW; }
  g.textBaseline = 'middle'; g.fillStyle = HOT.ink; spacedText(g, text.toUpperCase(), cx, h / 2 + size * 0.08, sp);
  g.restore(); return { w, h };
}
/* the rental sticker: a yellow (won) or hot-red (fell) disc, a dark and a pale ring, tilted, a big word and a small line */
export function sticker(g, cx, cy, r, big, small, { hot = 'y', rot = -0.24 } = {}) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  g.fillStyle = 'rgba(10,2,6,.55)'; g.beginPath(); g.arc(r * 0.06, r * 0.09, r + r * 0.09, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff1a0'; g.beginPath(); g.arc(0, 0, r + r * 0.06, 0, Math.PI * 2); g.fill();
  g.fillStyle = HOT.ink; g.beginPath(); g.arc(0, 0, r + r * 0.03, 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.4, 0, 0, 0, r);
  if (hot === 'y') { gr.addColorStop(0, '#fff36a'); gr.addColorStop(0.45, '#ffd000'); gr.addColorStop(1, '#ff9a00'); } else { gr.addColorStop(0, '#ff7a9a'); gr.addColorStop(0.45, '#e8203a'); gr.addColorStop(1, '#8a0c2a'); }
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const bl = !small && big.includes(' ') ? big.split(' ') : [big];
  let bs = r * (bl.length > 1 ? 0.42 : 0.5); g.font = `900 ${bs}px ${FONT.sans}`; while (bl.some((t) => g.measureText(t).width > r * 1.55) && bs > 10) { bs -= 1; g.font = `900 ${bs}px ${FONT.sans}`; }
  g.fillStyle = hot === 'y' ? HOT.ink : HOT.cream; bl.forEach((t, i) => g.fillText(t, 0, (small ? -r * 0.1 : 0) + (i - (bl.length - 1) / 2) * bs * 1.02));
  if (small) {
    const words = small.toUpperCase().split(' '); const ls = []; let cur = ''; let ss = Math.max(8, r * 0.3); g.font = `800 ${ss}px ${FONT.sans}`;
    const split = () => { ls.length = 0; cur = ''; for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > r * 1.45 && cur) { ls.push(cur); cur = w; } else cur = t; } if (cur) ls.push(cur); };
    split(); while (ls.length > 2 && ss > 8) { ss -= 1; g.font = `800 ${ss}px ${FONT.sans}`; split(); }
    g.fillStyle = hot === 'y' ? HOT.deep : '#ffe3c0';
    ls.slice(0, 2).forEach((l, i) => g.fillText(l, 0, r * 0.32 + i * ss * 1.1));
  }
  g.restore();
}

/* ---------- the 1600 x 900 share image (and the 4:5 one: same pieces, its own layout) ---------- */
export function drawCoverShare(g, { W = 1600, H = 900, shot, head, cover, stick, call, won, names = [], hook, site, logo, seal, scrim = false }) {
  g.clearRect(0, 0, W, H); g.fillStyle = '#12051a'; g.fillRect(0, 0, W, H);
  const tall = H > W;
  if (shot) { const s = shot.src; const ar = (s.width || W) / (s.height || H); const dw = Math.max(W, H * ar); const dh = dw / ar; g.drawImage(s, (W - dw) / 2, (H - dh) / 2, dw, dh); }
  if (!shot?.src?.stage) hotGrade(g, 0, 0, W, H, { sunX: tall ? 0.5 : 0.68, sunY: 0.42, k: won ? 0.55 : 1 });
  /* a violet wash under the words (left on the wide image, bottom on the tall one) */
  if (tall) { const v = g.createLinearGradient(0, H * 0.42, 0, H); v.addColorStop(0, 'rgba(14,3,20,0)'); v.addColorStop(0.5, 'rgba(14,3,20,.72)'); v.addColorStop(1, 'rgba(14,3,20,.9)'); g.fillStyle = v; g.fillRect(0, H * 0.42, W, H * 0.58); }
  else { const v = g.createLinearGradient(0, 0, W * 0.62, 0); v.addColorStop(0, 'rgba(14,3,20,.82)'); v.addColorStop(0.6, 'rgba(14,3,20,.5)'); v.addColorStop(1, 'rgba(14,3,20,0)'); g.fillStyle = v; g.fillRect(0, 0, W * 0.62, H); }
  /* light worlds (Storybook, Edo): a deeper scrim under the headline column so pale bands never cross the words */
  if (scrim) { const v = g.createLinearGradient(0, 0, tall ? 0 : W * 0.6, tall ? H : 0); if (tall) { v.addColorStop(0.4, 'rgba(14,3,20,0)'); v.addColorStop(0.62, 'rgba(14,3,20,.6)'); v.addColorStop(1, 'rgba(14,3,20,.7)'); } else { v.addColorStop(0, 'rgba(14,3,20,.6)'); v.addColorStop(0.75, 'rgba(14,3,20,.45)'); v.addColorStop(1, 'rgba(14,3,20,0)'); } g.fillStyle = v; g.fillRect(0, 0, W, H); }
  scan(g, W, H, 0.12);
  const s = W / 1600; const BAND = Math.round(46 * s); const T = Math.round(6 * s); const BILL = Math.round(72 * s);
  band(g, W, BAND, T); bill(g, W, H, BILL, T); spines(g, W, BAND + 4 * T, H - BILL - 4 * T, Math.round(18 * s));
  tapeTags(g, W - 40 * s, BAND / 2, 1.25 * s);
  const X = Math.round((tall ? 56 : 70) * s);
  /* the logo, sharp, top left (centred on the tall image) */
  let y = BAND + 4 * T + 22 * s;
  if (logo) { const k = Math.max(1, Math.floor((tall ? 3.6 : 2.2) * s * 2) / 2); const lw = logo.width * k; g.imageSmoothingEnabled = false; g.drawImage(logo, tall ? (W - lw) / 2 : X - 12 * s, y, lw, logo.height * k); g.imageSmoothingEnabled = true; y += logo.height * k; }
  /* the sticker */
  /* a win's sticker sits smaller, tight in the corner: the raised weapon passes under it */
  const sr = (tall ? 110 : won ? 86 : 104) * s; sticker(g, tall ? W - sr - 50 * s : W - sr - (won ? 40 : 70) * s, tall ? y + sr + 30 * s : BAND + 4 * T + sr + (won ? 22 : 44) * s, sr, stick?.[0] || (won ? 'QUEST CLEAR' : '2P'), stick?.[1] ?? '', { hot: won ? 'y' : 'r' });
  /* the cover line in pixel type (a fall: the small line, then GAME OVER), the player's words, the call; bottom up */
  const callSize = Math.round((tall ? 34 : 34) * s);
  g.save(); const btn = tapeLabel(g, 0, 0, call || '', callSize, { measure: true }); g.restore();
  g.font = `${Math.round(callSize * 1.25)}px ${FONT.pixel}`; const contW = won ? 0 : spacedWidth(g, 'CONTINUE?', callSize * 0.08);
  const sideBySide = !won && contW + 30 * s + btn.w < (tall ? W - 2 * X : 900 * s);
  const callH = call ? btn.h + (won || sideBySide ? 0 : callSize * 2.2) : 0;
  let tagS = Math.round((tall ? 52 : 54) * s);
  const bottom = H - BILL - 4 * T - 34 * s; const callTop = bottom - callH;
  const maxW = tall ? W - 2 * X : 840 * s;
  /* the player's words on one line when they fit at 36 px or more; else two balanced lines */
  const tagW = tall ? maxW : maxW + 120 * s; let tl = [];
  if (hook) { for (let z = tagS; z >= Math.round(42 * s); z -= 2) { g.font = `italic 700 ${z}px ${FONT.serif}`; if (g.measureText(hook).width <= tagW) { tagS = z; break; } }
    g.font = `italic 700 ${tagS}px ${FONT.serif}`; tl = wrapWords(g, hook, tagW);
    if (tl.length > 1) { for (let w2 = tagW - 10; w2 > tagW * 0.5; w2 -= 10) { const t = wrapWords(g, hook, w2); if (t.length !== tl.length) break; tl = t; } } }
  const tagH = tl.length ? tl.length * tagS * 1.15 + 18 * s : 0;
  const top0 = y + (tall ? 300 * s : 30 * s);
  const room = callTop - 36 * s - tagH - top0;
  let headBottom;
  if (won) {
    const b = pixelFit(g, cover || head, maxW, tall ? 5 : 3, Math.round(76 * s), Math.round(36 * s), room);
    const bTop = Math.max(top0, callTop - 36 * s - tagH - b.lines.length * b.lh);
    headBottom = drawPixel(g, b, X, bTop, names);
  } else {
    const go = pixelFit(g, 'GAME OVER', maxW, 1, Math.round((tall ? 104 : 96) * s), Math.round(48 * s));
    const sm = pixelFit(g, cover || head, maxW, 2, Math.round(46 * s), Math.round(28 * s));
    const gap = 26 * s; const blockH = sm.lines.length * sm.lh + gap + go.size;
    const bTop = Math.max(top0, callTop - 40 * s - tagH - blockH);
    drawPixel(g, sm, X, bTop, names);
    headBottom = drawPixel(g, go, X, bTop + sm.lines.length * sm.lh + gap, [], { hot: true });
  }
  /* the player's own words and what they became (the hook), larger, under the cover line */
  if (tl.length) { g.font = `italic 700 ${tagS}px ${FONT.serif}`; g.textBaseline = 'alphabetic'; const ty0 = Math.max(headBottom + 22 * s + tagS * 0.8, callTop - 30 * s - (tl.length - 1) * tagS * 1.15);
    g.fillStyle = HOT.plum; tl.forEach((l, i) => g.fillText(l, X + 3 * s, ty0 + i * tagS * 1.15 + 3 * s)); g.fillStyle = HOT.cream; tl.forEach((l, i) => g.fillText(l, X, ty0 + i * tagS * 1.15)); }
  if (call) {
    let cy = callTop; let cx = X;
    if (!won) { g.font = `${Math.round(callSize * 1.25)}px ${FONT.pixel}`; g.textBaseline = 'middle'; const ty = sideBySide ? cy + btn.h / 2 : cy + callSize * 0.9;
      g.fillStyle = HOT.ink; spacedText(g, 'CONTINUE?', cx + 4 * s, ty + 4 * s, callSize * 0.08); g.fillStyle = HOT.y; spacedText(g, 'CONTINUE?', cx, ty, callSize * 0.08);
      if (sideBySide) cx += contW + 30 * s; else cy += callSize * 2.2; }
    tapeLabel(g, cx, cy, call, callSize);
  }
  /* the bill: what the game is; the address left the picture (at 1080 wide it could not reach 30 px; the post carries the link) */
  g.textBaseline = 'middle'; const by = H - BILL / 2 + 2 * s;
  g.font = `${Math.round(26 * s)}px ${FONT.pixel}`; g.fillStyle = HOT.peach; spacedText(g, 'FREE · IN YOUR BROWSER', X, by, 0.06 * 26 * s);
  g.fillStyle = HOT.amber; spacedText(g, 'ASSEMBLED BY SAGE2', W - 40 * s, by, 0.06 * 26 * s, 'right'); void site; void seal;
  g.textBaseline = 'alphabetic';
}

/* ---------- the 1080 x 1350 end card ---------- */
/* where the words go (the scene shows through the top, down to `win`); textTop = the top of the words over the scene */
export function coverLayout(g, d, { CW = 1080, CH = 1350, call = null } = {}) {
  const X = 60; const MAXW = CW - 2 * X; const L = { X, MAXW, cover: true };
  L.creditY = CH - 40; L.rowY = []; let y = L.creditY - 70; for (let i = d.rows.length - 1; i >= 0; i--, y -= 58) L.rowY[i] = y;
  L.subY = (d.rows.length ? L.rowY[0] : L.creditY) - 72; L.nameSize = 54; L.nameY = L.subY - 58;
  L.win = L.nameY - L.nameSize - 46;
  g.save(); const btn = call ? tapeLabel(g, 0, 0, call, 26, { measure: true }) : null; g.restore();
  L.call = call; L.btn = btn; L.callTop = btn ? L.win - 40 - btn.h - 78 : L.win - 40;
  fitHead(g, d, L);
  L.textTop = L.blurbTop - 10;
  return L;
}
/* the cover line in pixel type; a fall: the small line over a big GAME OVER (fitted again once the pixel font is in) */
const pxReady = () => { try { return document.fonts.check(`24px ${FONT.pixel}`); } catch { return true; } };
function fitHead(g, d, L) {
  const head = d.cover || d.lines[0] || ''; const MW = L.MAXW - 30; L.pxOk = pxReady();
  if (d.won) { L.blurb = pixelFit(g, head, MW, 3, 66, 34); L.blurbTop = L.callTop - 20 - L.blurb.lines.length * L.blurb.lh; }
  else { L.small = pixelFit(g, head, MW, 2, 36, 24); L.go = pixelFit(g, 'GAME OVER', MW, 1, 104, 60);
    L.blurbTop = L.callTop - 30 - L.go.size - 22 - L.small.lines.length * L.small.lh; }
}
export function drawCoverCard(g, d, shot, ta, { CW = 1080, CH = 1350, L, logo, site, names = [] }) {
  fitHead(g, d, L);
  const { X } = L;
  g.clearRect(0, 0, CW, CH); g.globalAlpha = 1; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  if (shot) { g.fillStyle = '#12051a'; g.fillRect(0, 0, CW, L.win); g.drawImage(shot.src, shot.sx, shot.sy, shot.sw, shot.sh, 0, 0, CW, L.win); if (!shot.src.stage) hotGrade(g, 0, 0, CW, L.win, { sunX: 0.5, sunY: 0.4 }); }
  else {
    /* the live scene shows through: a light hot tint (no blend over transparent pixels) */
    const v = g.createLinearGradient(0, 0, 0, L.win); v.addColorStop(0, 'rgba(120,20,110,.26)'); v.addColorStop(0.5, 'rgba(255,60,90,.06)'); v.addColorStop(1, 'rgba(255,110,40,.16)'); g.fillStyle = v; g.fillRect(0, 0, CW, L.win);
  }
  /* the fall into the words: violet, then the tape's black */
  const fall = g.createLinearGradient(0, L.textTop - 160, 0, L.win); fall.addColorStop(0, 'rgba(14,3,20,0)'); fall.addColorStop(0.7, 'rgba(14,3,20,.78)'); fall.addColorStop(1, 'rgba(12,4,8,.96)');
  g.fillStyle = fall; g.fillRect(0, L.textTop - 160, CW, L.win - L.textTop + 160);
  if (d.scrim) { const v = g.createLinearGradient(0, L.textTop - 220, 0, L.win); v.addColorStop(0, 'rgba(14,3,20,0)'); v.addColorStop(0.4, 'rgba(14,3,20,.5)'); v.addColorStop(1, 'rgba(14,3,20,.6)'); g.fillStyle = v; g.fillRect(0, L.textTop - 220, CW, L.win - L.textTop + 220); }
  g.fillStyle = HOT.band; g.fillRect(0, L.win, CW, CH - L.win);
  const T = 7; const BAND = 54;
  band(g, CW, BAND, T); stripes(g, 0, L.win, CW, T, -1, [HOT.p, HOT.r, HOT.o, HOT.y]);
  spines(g, CW, BAND + 4 * T, L.win - 4 * T, 20);
  tapeTags(g, CW - 34, BAND / 2, 1.15);
  g.globalAlpha = ta;
  /* the logo, centred under the band */
  if (logo) { const k = 2.5; const lw = logo.width * k; g.imageSmoothingEnabled = false; g.drawImage(logo, (CW - lw) / 2, BAND + 4 * T + 12, lw, logo.height * k); g.imageSmoothingEnabled = true; }
  /* the sticker over the scene, top left under the logo */
  sticker(g, CW - (d.won ? 104 : 130), BAND + 4 * T + 12 + 57 * 2.5 + 100, d.won ? 78 : 90, d.stick?.[0] || (d.won ? 'QUEST CLEAR' : '2P'), d.stick?.[1] ?? '', { hot: d.won ? 'y' : 'r', rot: 0.2 });
  /* the blurb, the call */
  if (L.go) { drawPixel(g, L.small, X + 8, L.blurbTop, names); drawPixel(g, L.go, X + 8, L.blurbTop + L.small.lines.length * L.small.lh + 22, [], { hot: true }); }
  else drawPixel(g, L.blurb, X + 8, L.blurbTop, names);
  if (L.call) {
    g.font = `34px ${FONT.pixel}`; g.textBaseline = 'middle'; const ty = L.callTop + 22;
    g.fillStyle = HOT.ink; spacedText(g, 'CONTINUE?', X + 12, ty + 4, 2.6); g.fillStyle = HOT.y; spacedText(g, 'CONTINUE?', X + 8, ty, 2.6);
    tapeLabel(g, X + 8, L.callTop + 62, L.call, 26); g.textBaseline = 'alphabetic';
  }
  /* PLAYER 1: the name in pixel type with the button's hot fill, the class and land under it */
  g.font = `${L.nameSize}px ${FONT.pixel}`; let ns = L.nameSize; const nm = String(d.name || '').toUpperCase();
  while (g.measureText(nm).width > CW - 2 * X - 20 && ns > 24) { ns -= 2; g.font = `${ns}px ${FONT.pixel}`; }
  g.fillStyle = HOT.deep; g.fillText(nm, X + 5, L.nameY + 5);
  const ng = g.createLinearGradient(0, L.nameY - ns, 0, L.nameY); ng.addColorStop(0, '#ffe27a'); ng.addColorStop(0.5, '#ffb030'); ng.addColorStop(0.52, '#ff7a1e'); ng.addColorStop(1, '#ff5a1e');
  g.fillStyle = ng; g.fillText(nm, X, L.nameY);
  if (d.sub?.length) { g.font = `46px ${FONT.vt}`; g.fillStyle = HOT.peach; g.fillText(d.sub.join(' · ').replace(/ /g, ' '), X, L.subY); }
  /* the two answers and what they became */
  /* the arrows line up in one column; the results in the title's VT323 */
  { g.font = `40px ${FONT.vt}`; const mws = d.rows.map((r) => g.measureText(`→ ${String(r.made).toUpperCase()}`).width); const mw = Math.max(0, ...mws);
    const qs = d.rows.map((r) => { let q = `“${r.words}”`; while (measureQ(g, q) > CW - 2 * X - mw - 40 && q.length > 6) q = `${q.slice(0, -3).trimEnd()}…”`; return q; });
    const col = X + Math.max(...qs.map((q) => measureQ(g, q))) + 28;
    d.rows.forEach((r, i) => { const y = L.rowY[i]; g.font = `italic 600 36px ${FONT.serif}`; g.fillStyle = HOT.cream; g.fillText(qs[i], X, y); g.font = `40px ${FONT.vt}`; g.fillStyle = HOT.amber; g.fillText(`→ ${String(r.made).toUpperCase()}`, col, y + 2); }); }
  /* the credit line, like the title's */
  g.fillStyle = 'rgba(255,227,192,.14)'; g.fillRect(X, L.creditY - 40, CW - 2 * X, 2);
  g.font = `700 22px ${FONT.sans}`; g.fillStyle = HOT.peach; spacedText(g, 'ASSEMBLED BY SAGE2', X, L.creditY, 4.2);
  g.fillStyle = HOT.amber; spacedText(g, String(site || '').toUpperCase(), CW - X, L.creditY, 3.4, 'right');
  g.globalAlpha = 1;
  scan(g, CW, CH, 0.1);
}
function measureQ(g, q) { const f = g.font; g.font = `italic 600 36px ${FONT.serif}`; const w = g.measureText(q).width; g.font = f; return w; }

/* ---------- the title's stage, painted (sky, banded sun, neon floor), for the staged pictures ---------- */
/* opts: { horY (px), sunX, sunY, sunR (px), tint (hex: the world's one colour cue), feet: [{x, y, w}] (glow pools on the floor) } */
const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mixRgb = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export function paintStage(g, W, H, { horY, sunX, sunY, sunR, tint = 0xff5a2a, feet = [], seed = 7 }) {
  const T = rgbOf(tint); const lit = mixRgb(T, [255, 255, 255], 0.35);
  const hy = Math.max(0, Math.min(H, horY));
  /* the title's sky: night violet at the top, magenta, hot orange at the horizon */
  const s = g.createLinearGradient(0, 0, 0, hy);
  s.addColorStop(0, '#0a0326'); s.addColorStop(0.3, '#2a0a4e'); s.addColorStop(0.58, '#6a1062'); s.addColorStop(0.82, '#c2244a'); s.addColorStop(1, '#ff5a2a');
  g.fillStyle = s; g.fillRect(0, 0, W, hy + 1);
  /* the world's colour: thin cloud bands across the sun */
  g.save(); g.globalCompositeOperation = 'screen';
  /* the sun's glow */
  const gl = g.createRadialGradient(sunX, sunY, sunR * 0.6, sunX, sunY, sunR * 2.4); gl.addColorStop(0, 'rgba(255,110,60,.55)'); gl.addColorStop(0.5, 'rgba(230,40,110,.22)'); gl.addColorStop(1, 'rgba(230,40,110,0)');
  g.fillStyle = gl; g.fillRect(0, 0, W, hy);
  g.restore();
  /* the banded sun: yellow to orange to magenta, cut by the gaps in its lower half; it sits on the horizon */
  g.save(); g.beginPath(); g.rect(0, 0, W, hy); g.clip();
  const dc = g.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  dc.addColorStop(0, '#fff1a0'); dc.addColorStop(0.3, '#ffd24a'); dc.addColorStop(0.55, '#ff7a1e'); dc.addColorStop(0.62, css(mixRgb([255, 90, 40], T, 0.35))); dc.addColorStop(0.82, css(mixRgb([232, 38, 74], T, 0.6))); dc.addColorStop(1, css(mixRgb([176, 16, 90], T, 0.8)));
  g.beginPath(); g.arc(sunX, sunY, sunR, 0, Math.PI * 2); g.clip();
  g.fillStyle = dc; g.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  /* the gaps: thin near the middle, thicker toward the bottom; the sky shows through */
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 8; i++) { const f = i / 7; const y = sunY + sunR * (0.06 + f * 0.9); const h = sunR * (0.018 + f * 0.07); g.fillRect(sunX - sunR, y, sunR * 2, h); }
  g.restore();
  /* the sky again behind the cut gaps (destination-out made holes): repaint under the sun */
  g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = s; g.fillRect(0, 0, W, hy + 1); g.restore();
  /* the world's colour: thin cloud bands across the sun and the sky (its one tint cue) */
  g.save(); g.beginPath(); g.rect(0, 0, W, hy); g.clip();
  for (let i = 0; i < 5; i++) { const y = hy - sunR * (0.3 + i * 0.27); const h = Math.max(3, sunR * (0.07 - i * 0.01)); const x0 = sunX - sunR * (1.45 - (i % 2) * 0.3); const w = sunR * (3.0 - i * 0.22);
    const gr = g.createLinearGradient(x0, 0, x0 + w, 0); gr.addColorStop(0, css(T, 0)); gr.addColorStop(0.2, css(T, 0.92)); gr.addColorStop(0.8, css(T, 0.85)); gr.addColorStop(1, css(T, 0));
    g.fillStyle = gr; g.beginPath(); g.ellipse(x0 + w / 2, y, w / 2, h, 0, 0, Math.PI * 2); g.fill(); }
  g.restore();
  /* the floor: a dark plum plain with a neon grid in the world's colour that fades into the horizon haze */
  const f = g.createLinearGradient(0, hy, 0, H); f.addColorStop(0, '#3a0a2a'); f.addColorStop(0.08, '#1c0518'); f.addColorStop(1, '#0c0210');
  g.fillStyle = f; g.fillRect(0, hy, W, H - hy);
  if (H - hy > 4) {
    g.save(); g.beginPath(); g.rect(0, hy, W, H - hy); g.clip(); g.globalCompositeOperation = 'screen';
    const D = H - hy; const vx = sunX;
    g.lineWidth = Math.max(1, W / 900);
    for (let i = 1; i < 14; i++) { const k = (i / 14) ** 2.2; const y = hy + D * k; g.strokeStyle = css(lit, Math.min(0.75, 0.12 + k * 0.9)); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = -18; i <= 18; i++) { const xb = vx + i * W * 0.11; g.strokeStyle = css(lit, 0.42); const gr = g.createLinearGradient(0, hy, 0, H); gr.addColorStop(0, css(lit, 0)); gr.addColorStop(0.35, css(lit, 0.3)); gr.addColorStop(1, css(lit, 0.7)); g.strokeStyle = gr; g.beginPath(); g.moveTo(vx + i * W * 0.004, hy); g.lineTo(xb, H); g.stroke(); }
    g.restore();
  }
  /* the horizon's hot line and its haze */
  g.save(); g.globalCompositeOperation = 'screen';
  const hz = g.createLinearGradient(0, hy - H * 0.05, 0, hy + H * 0.06); hz.addColorStop(0, 'rgba(255,90,60,0)'); hz.addColorStop(0.45, 'rgba(255,110,70,.55)'); hz.addColorStop(0.55, css(lit, 0.5)); hz.addColorStop(1, 'rgba(255,90,60,0)');
  g.fillStyle = hz; g.fillRect(0, hy - H * 0.05, W, H * 0.11);
  /* a warm pool of light under each figure */
  for (const p of feet) { const r = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.w); r.addColorStop(0, 'rgba(255,130,70,.5)'); r.addColorStop(1, 'rgba(255,90,60,0)'); g.save(); g.translate(p.x, p.y); g.scale(1, 0.28); g.translate(-p.x, -p.y); g.fillStyle = r; g.beginPath(); g.arc(p.x, p.y, p.w, 0, Math.PI * 2); g.fill(); g.restore(); }
  g.restore();
  /* a dark contact under each figure */
  for (const p of feet) { g.save(); g.translate(p.x, p.y); g.scale(1, 0.18); const r = g.createRadialGradient(0, 0, 0, 0, 0, p.w * 0.55); r.addColorStop(0, 'rgba(8,0,10,.75)'); r.addColorStop(1, 'rgba(8,0,10,0)'); g.fillStyle = r; g.beginPath(); g.arc(0, 0, p.w * 0.55, 0, Math.PI * 2); g.fill(); g.restore(); }
  void seed;
}
/* embers over the finished picture (seeded: the same picture every time) */
export function embers(g, W, H, { n = 70, seed = 11, hy = H } = {}) {
  let a = seed >>> 0; const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  g.save(); g.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) { const x = rnd() * W; const y = rnd() * Math.min(H, hy + H * 0.2); const r = 1 + rnd() * 2.6 * (W / 1600); const c = rnd() < 0.7 ? '255,170,70' : '255,230,150';
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3); gr.addColorStop(0, `rgba(${c},.95)`); gr.addColorStop(0.35, `rgba(${c},.5)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6); }
  g.restore();
}

/* ---------- 3D: the banded sun (the title's shader, restated) ---------- */
const SUN_FRAG = `uniform vec3 uC0, uC1, uC2; uniform float uT, uMotion; varying vec2 vUv;
  void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    float disc = 1.0 - smoothstep(0.495, 0.505, r);
    vec3 c = mix(uC2, uC1, smoothstep(-0.5, 0.15, p.y)); c = mix(c, uC0, smoothstep(0.05, 0.5, p.y));
    float band = p.y < 0.08 ? step(0.5 + 0.42 * smoothstep(0.08, -0.5, p.y), fract((p.y - uT * 0.035 * uMotion) * 9.0)) : 1.0;
    float a = disc * band;
    float glow = exp(-max(0.0, r - 0.5) * 5.0) * 0.55 * (1.0 - disc * band);
    vec3 col = c * a + mix(uC1, uC2, 0.4) * glow;
    gl_FragColor = vec4(col, max(a, glow)); }`;
const PLAIN_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
/* the title's sky as a dome around the camera (the title's colours, a little of the world's night), for a staged picture */
const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FRAG = `uniform vec3 uTop, uMid, uHor, uLow; varying vec3 vDir;
  void main(){ float y = vDir.y; vec3 c;
    if (y > 0.0) { float a = pow(clamp(y / 0.42, 0.0, 1.0), 0.55); c = mix(uHor, uMid, smoothstep(0.0, 0.45, a)); c = mix(c, uTop, smoothstep(0.4, 1.0, a)); }
    else c = mix(uHor * 0.55, uLow, smoothstep(0.0, 0.08, -y));
    gl_FragColor = vec4(c, 1.0); }`;
export function makeSky(night = 0x000000, R = 540) {
  const n = new THREE.Color(night); const mix = (h, k) => new THREE.Color(h).lerp(n, k);
  const u = { uTop: { value: mix(0x080320, 0.15) }, uMid: { value: mix(0x5a0f5a, 0.2) }, uHor: { value: mix(0xff4a28, 0.15) }, uLow: { value: mix(0x14040e, 0.3) } };
  const geo = new THREE.SphereGeometry(R, 32, 16); const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'cover-sky'; mesh.frustumCulled = false; mesh.renderOrder = -95;
  return { mesh, hor: u.uHor.value, dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); } };
}
/* a sun plane facing the camera; place(cam, dir, angularSize) puts it far along dir */
export function makeSun({ motion = true, gain = 2.2 } = {}) {
  const u = { uC0: { value: new THREE.Color(0xffe27a).multiplyScalar(gain) }, uC1: { value: new THREE.Color(0xff5a1e).multiplyScalar(gain) }, uC2: { value: new THREE.Color(0xb0105a).multiplyScalar(gain) }, uT: { value: 0 }, uMotion: { value: motion ? 1 : 0 } };
  const geo = new THREE.PlaneGeometry(1, 1); const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: PLAIN_VERT, fragmentShader: SUN_FRAG, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'cover-sun'; mesh.renderOrder = -90; mesh.frustumCulled = false;
  return {
    mesh, u,
    place(cam, dir, ang, D = 300) { const d = dir.clone().normalize(); mesh.position.copy(cam.position).addScaledVector(d, D); const s = 2 * D * Math.tan(ang / 2) * 1.6; mesh.scale.set(s, s, 1); mesh.quaternion.copy(cam.quaternion); mesh.updateMatrixWorld(true); },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}

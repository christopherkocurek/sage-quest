/* "YOU GAIN POWER!" The heart answer ("Who do you fight for?") gives the hero a named power with a real
   effect in the fight, and the act-2 camp answer ("Why do you go on?") gives the vow's boon. Both land as a loud,
   campy 80s-arcade moment: flash, banded sun, rays, pixel burst, the slammed banner, the power's name and one plain line.
   In the fight the power shows again each time it works (a short pixel pop + blip), so the answer links to the effect.
   Everything is drawn in code (DOM + one low-res canvas); the jingle is synthesised on the game's sound bus.
   Quick-start links with &story=<motive> show a short banner at fight start.
   Hooks: main.js (apply.motive -> setPower, heart step -> powerMoment), fight.js (start -> installPower, camp -> resolveMoment). */
import { sfxVoice } from './sfx.js';
import { coverFonts, FONT, HOT } from './cover.js';

const QS = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(); } })();
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const rnd = (a, b) => a + Math.random() * (b - a);
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const INK = '#1a0208'; const TEAL = HOT.teal; const CREAM = HOT.cream;
const PAL = [HOT.y, HOT.o, HOT.r, '#fffbe0', TEAL, '#ff9a1f'];
const MAG = '#ff2fa8'; const VIO = '#8a5cff';
const VPAL = [MAG, VIO, TEAL, '#fffbe0', '#a8f6ff', '#ff7ad0']; /* the act-2 vow: same family, cool accent */

/* ---------------------------------------------------------------- the powers */
/* motive -> the power the heart answer gives. word = the name in the possessive ("WREN'S SHIELD"), solo = no one named */
const POWERS = {
  protect: { word: 'SHIELD', solo: 'GUARDIAN SHIELD', line: 'Takes a hit for you, then comes back.', chip: 'BLOCKS A HIT EVERY 22 SEC', icon: 'shield' },
  revenge: { word: 'VENGEANCE', solo: 'VENGEANCE', line: 'The more you bleed, the harder you hit.', chip: 'UP TO +50% DAMAGE', icon: 'flame' },
  freedom: { word: 'WIND', solo: 'FREE WIND', line: 'You run faster and dodge sooner.', chip: '+15% SPEED · FASTER DODGE', icon: 'wing' },
  wonder: { word: 'SPARK', solo: 'WONDER SPARK', line: 'Every fifth hit bursts with light.', chip: 'EVERY 5TH HIT: x2.2 DAMAGE', icon: 'star' },
  glory: { word: 'CROWN', solo: 'GLORY CROWN', line: 'Kill again within 4 seconds and every blow hits harder.', chip: 'KILL FAST: +12% EACH, MAX +48%', icon: 'crown' },
};
const FOR_MOTIVE = { protect: 'For the ones you guard.', revenge: 'For what was taken.', freedom: 'For freedom.', wonder: 'For wonder.', glory: 'For glory.' };
/* the act-2 boons (game/kit.mjs RESOLVES) keep their own names; this adds the icon */
const RESOLVE_ICON = { love: 'heart', wrath: 'flame', defiance: 'wing', duty: 'shield', hope: 'star' };
const RESOLVE_CHIP = { love: '1 FREE REVIVE', wrath: '+30% DAMAGE · POWER x2 FASTER', defiance: 'FAST DODGE · CRIT AFTER', duty: 'FAST GUARD · WIDE PARRY', hope: 'FULL HEAL · WOUNDS CLOSE' };

const REL = new Set('brother brothers sister sisters mom mum mother dad father parents son sons daughter daughters kid kids child children baby wife husband partner girlfriend boyfriend fiance fiancee friend friends family grandma grandmother grandpa grandfather nan nana aunt uncle cousin cousins niece nephew dog cat puppy pup horse team crew people folks'.split(' '));
const STOPW = new Set('my our the a an and i me his her their little big old best dear sweet younger older baby'.split(' '));
/* the one the power is for: a name ("Wren"), a relation with no name ("your brother"), or nobody */
export function whoOf(mentions = []) {
  const m = (mentions || []).find((x) => x && x.text && x.kind !== 'place'); if (!m) return null;
  const words = String(m.text).replace(/[^\p{L}\p{N}' -]/gu, ' ').split(/\s+/).filter(Boolean);
  const low = (w) => w.toLowerCase();
  const rel = words.find((w) => REL.has(low(w)));
  const named = words.find((w) => !REL.has(low(w)) && !STOPW.has(low(w)) && /^\p{Lu}/u.test(w)) || (!rel && words.length <= 2 ? words.find((w) => !STOPW.has(low(w))) : null);
  if (named) { const n = cap(named); const more = (mentions || []).filter((x) => x && x !== m && x.text && x.kind !== 'place').map((x) => String(x.text).split(/\s+/).find((w) => /^\p{Lu}/u.test(w) && !REL.has(low(w)) && !STOPW.has(low(w)))).filter(Boolean)[0]; return { bearer: n, line: more ? `For ${n} and ${cap(more)}.` : `For ${n}.` }; }
  if (rel) return { bearer: low(rel), line: `For your ${low(rel)}.` };
  return null;
}
const possessive = (s) => (/s$/i.test(s) ? `${s}'` : `${s}'s`).toUpperCase();
export function powerFor(motive, mentions = []) {
  const id = POWERS[motive] ? motive : 'protect'; const P = POWERS[id]; const who = whoOf(mentions);
  return { kind: 'motive', motive: id, icon: P.icon, name: who && id !== 'glory' ? `${possessive(who.bearer)} ${P.word}` : P.solo, /* glory is the hero's own */ line: P.line, chip: P.chip, forLine: who ? who.line : FOR_MOTIVE[id], bearer: who?.bearer || null };
}
let current = null;
/* the names in the raw answer, when Sage2's extract is missing (it timed out): "My brother Wren and my dog Ash" -> Wren, Ash */
const FILLER = new Set('i im i\'m my we our the a an and to for of in on at it its is be me us you he she they them his her him who what why when where how because so but or not no yes all just keep safe free fight want need will can do make made out there here this that these those'.split(' '));
export function namesIn(text = '') {
  const out = []; const toks = String(text || '').split(/(\s+|[.,!?;:"“”()]+)/).filter((x) => x && x.trim());
  let start = true;
  for (const w of toks) { if (/^[.!?]+$/.test(w)) { start = true; continue; } if (/^[,;:"“”()]+$/.test(w)) continue; const c = w.replace(/[^\p{L}'-]/gu, ''); if (c && /^\p{Lu}\p{Ll}+$/u.test(c) && !start && !FILLER.has(c.toLowerCase()) && !REL.has(c.toLowerCase())) out.push({ text: c }); start = false; }
  if (!out.length) { const rel = String(text || '').toLowerCase().match(/[a-z]+/g)?.find((w) => REL.has(w)); if (rel) out.push({ text: `my ${rel}` }); }
  return out.slice(0, 2);
}
/* when Sage2 misses the heart answer, the game guesses the motive from its words (it used to pick by seed) */
const MOTIVE_WORDS = [
  ['revenge', /\b(reveng\w*|aveng\w*|pay(back)?|hurt|killed|murder\w*|took|taken|betray\w*|wrong(ed)?|make them|get even|blood)\b/gi],
  ['protect', /\b(safe|protect\w*|keep|guard\w*|defend\w*|shield|save|watch over|look after|care for)\b/gi],
  ['freedom', /\b(free\w*|escape\w*|chains?|cage\w*|break out|my own|no one|nobody tells|leave)\b/gi],
  ['glory', /\b(best|glory|fame|famous|proud|win|winn\w*|legend\w*|remember\w*|champion|greatest|honou?r|name)\b/gi],
  ['wonder', /\b(wonder\w*|curio\w*|discover\w*|explor\w*|learn\w*|find out|magic|stars?|see the|mystery|secrets?)\b/gi],
];
export function guessMotive(text) {
  if (!text) return null; let best = null; let top = 0;
  for (const [id, re] of MOTIVE_WORDS) { const n = (String(text).match(re) || []).length; if (n > top) { top = n; best = id; } }
  return best;
}
export function setPower(motive, mentions = [], text = '') { current = powerFor(motive, mentions?.length ? mentions : namesIn(text)); try { (window.__sq ||= {}).power = current; } catch { /* tests only */ } return current; }
export function getPower() { return current; }

/* ---------------------------------------------------------------- pixel icons (12 x 12) */
const ICONS = {
  /* a heraldic shield: gold rim, teal field, a cream chevron */
  shield: ['XXXXXXXXXXXX', 'XYYYYYYYYYYX', 'XYTTTTTTTDYX', 'XYTTTWWTTDYX', 'XYTTWWWWTDYX', 'XYTWWTTWWDYX', '.XYWTTTTWYX.', '.XYTTTTTDYX.', '..XYTTTDYX..', '...XYTDYX...', '....XYYX....', '.....XX.....'],
  flame: ['.....X......', '....XRX.....', '....XRX..X..', '...XRORX.XX.', '..XROORXXRX.', '..XROYORRRX.', '.XROOYOORRX.', '.XROYYYOORX.', 'XROOYWWYORX.', 'XROYWWWWYORX', '.XROYWWYORX.', '..XXXXXXXX..'],
  /* a feathered wing with speed lines */
  wing: ['......XXX...', '.....XWWWX..', 'XXXXXXX..WX.', 'XWWWWWWX.WX.', 'XXXXXXXXWX..', '............', 'XXXXXXXXXXX.', 'XTTTTTTTTTTX', 'XXXXXXXXX.TX', '...XTTX..XTX', '....XXTTTTX.', '......XXXX..'],
  /* the spark: a lightning bolt */
  star: ['......XXXXX.', '.....XYYYYX.', '....XYWYYX..', '...XYWYYX...', '..XYWYYXXXX.', '.XYWWWWWYYX.', '.XXXXXWYYX..', '.....XWYX...', '....XWYX....', '...XWYX.....', '..XYX.......', '..XX........'],
  crown: ['............', 'X....XX....X', 'XX..XYYX..XX', 'XYX.XYYX.XYX', 'XYYXYYYYXYYX', 'XYYYYYYYYYYX', 'XYTYYRYYTYYX', 'XYYYYYYYYYYX', 'XOOOOOOOOOOX', 'XXXXXXXXXXXX', '............', '............'],
  heart: ['............', '.XXX....XXX.', 'XRRRX..XRRRX', 'XRWRRXXRRRRX', 'XRWRRRRRRRRX', 'XRRRRRRRRRRX', '.XRRRRRRRRX.', '..XRRRRRRX..', '...XRRRRX...', '....XRRX....', '.....XX.....', '............'],
};
const ICOL = { X: INK, T: TEAL, D: '#0e7f93', W: '#fffbe0', Y: HOT.y, O: HOT.o, R: HOT.r };
function iconCanvas(name) {
  const rows = ICONS[name] || ICONS.star; const c = document.createElement('canvas'); c.width = 12; c.height = 12;
  const g = c.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < 12; x++) { const k = row[x]; if (k && k !== '.') { g.fillStyle = ICOL[k] || INK; g.fillRect(x, y, 1, 1); } } });
  c.className = 'pw-icon'; return c;
}

/* ---------------------------------------------------------------- the sound: rising arpeggio, hit, sparkle */
function jingle(kind = 'full') {
  const V = sfxVoice(); if (!V) return;
  try {
    const c = V.ctx; const t0 = c.currentTime + 0.02;
    const bus = c.createGain(); bus.gain.value = kind === 'pop' ? 0.12 : 0.2; bus.connect(V.out);
    const tone = (type, f, t, d, g, slide) => {
      const ny = c.sampleRate * 0.45; f = Math.min(f, ny); if (slide) slide = Math.min(slide, ny); /* a 16 kHz context (headless) clamps above 8 kHz */
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      const a = c.createGain(); a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + 0.006); a.gain.exponentialRampToValueAtTime(0.0008, t + d);
      o.connect(a); a.connect(bus); o.start(t); o.stop(t + d + 0.03);
    };
    const noise = (t, d, g, f0 = 3000) => {
      const n = Math.floor(c.sampleRate * d); const b = c.createBuffer(1, n, c.sampleRate); const ch = b.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = c.createBufferSource(); s.buffer = b; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f0, t); lp.frequency.exponentialRampToValueAtTime(300, t + d);
      const a = c.createGain(); a.gain.value = g; s.connect(lp); lp.connect(a); a.connect(bus); s.start(t);
    };
    const hz = (semi) => 523.25 * Math.pow(2, semi / 12);
    if (kind === 'pop') {
      [0, 7, 12, 19].forEach((s, i) => tone('square', hz(s + 12), t0 + i * 0.04, 0.09, 0.32));
      [31, 28, 36].forEach((s, i) => tone('triangle', hz(s), t0 + 0.18 + i * 0.05, 0.12, 0.22));
      return;
    }
    if (kind === 'vow') {
      /* the vow: a crack, a fast scale run up two octaves (a power-up sweep), a big chord a fourth higher, bells */
      noise(t0, 0.36, 0.9, 6000); tone('square', 220, t0, 0.3, 0.45, 880); tone('triangle', 82, t0, 0.5, 0.6, 330);
      const run = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
      run.forEach((s2, i) => { const t = t0 + 0.06 + i * 0.03; tone('square', hz(s2 + 5), t, 0.08, 0.3); tone('triangle', hz(s2 - 7), t, 0.08, 0.2); });
      const tv = t0 + 0.62; [29, 33, 36, 41].forEach((s2) => tone('square', hz(s2), tv, 0.75, 0.2, hz(s2) * 1.02)); tone('triangle', hz(-7), tv, 0.9, 0.6); noise(tv, 0.14, 0.4, 9000);
      [41, 45, 48, 53, 48, 52, 57, 60].forEach((s2, i) => tone('triangle', hz(s2), tv + 0.14 + i * 0.06, 0.16, 0.15));
      return;
    }
    /* hit: a noise crack and a falling square, with the flash */
    noise(t0, 0.32, 0.9, 5000); tone('square', 330, t0, 0.32, 0.5, 52); tone('triangle', 110, t0, 0.4, 0.6, 40);
    /* the rising arpeggio while the banner slams (two octaves of a major chord, an echo an octave down) */
    const arp = [0, 4, 7, 12, 16, 19, 24, 28];
    arp.forEach((s, i) => { const t = t0 + 0.08 + i * 0.05; tone('square', hz(s), t, 0.11, 0.34); tone('square', hz(s - 12) * 1.003, t, 0.11, 0.16); });
    /* the stab on the power's name */
    const ts = t0 + (kind === 'short' ? 0.42 : 0.58);
    [24, 28, 31].forEach((s) => tone('square', hz(s), ts, 0.55, 0.22)); tone('triangle', hz(-12), ts, 0.7, 0.55); noise(ts, 0.12, 0.35, 8000);
    /* sparkle: high bell blips falling into place */
    const sp = [36, 40, 43, 48, 43, 47, 52, 55];
    sp.forEach((s, i) => tone('triangle', hz(s), ts + 0.12 + i * 0.065 + Math.random() * 0.02, 0.16, 0.16));
  } catch { /* audio is optional */ }
}

/* ---------------------------------------------------------------- the overlay */
const CSS = `
#pw{position:fixed;inset:0;z-index:2147483000;pointer-events:none;display:none;overflow:hidden}
#pw.on{display:block}
#pw .fx{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}
#pw .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(10,0,6,.3) 0 2px,transparent 2px 4px)}
#pw .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,#fff 0 22%,#ffe27a 48%,#ff7a1f 100%);opacity:0}
#pw.vow .flash{background:radial-gradient(circle at 50% 50%,#fff 0 22%,#a8f6ff 48%,${MAG} 100%)}
#pw .stack{position:absolute;left:16px;right:16px;top:50%;display:flex;flex-direction:column;align-items:center;text-align:center;will-change:transform}
#pw .ban{display:flex;flex-direction:column;align-items:center}
#pw .ban .r{display:flex;gap:.6em;justify-content:center}
#pw .ban span{display:block;font-family:${FONT.pixel};line-height:1.12;white-space:nowrap;padding:.06em .02em .14em;
  background:linear-gradient(180deg,#fffbe0 0%,#fff1a0 11%,${HOT.y} 20%,${HOT.o} 31%,${HOT.r} 41%,#9a0a28 50%,#fffbe0 50%,#fff1a0 61%,${HOT.y} 70%,${HOT.o} 81%,${HOT.r} 91%,#9a0a28 100%);background-size:100% 200%;
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 .06em 0 #8a0c2a) drop-shadow(0 .06em 0 #5a0418) drop-shadow(.06em .06em 0 ${INK}) drop-shadow(0 0 .3em rgba(255,110,30,.55))}
#pw .hero{image-rendering:pixelated;image-rendering:crisp-edges;margin:.18em 0 .1em;filter:drop-shadow(.08em .08em 0 ${INK}) drop-shadow(0 0 .35em rgba(46,232,255,.75)) drop-shadow(0 0 .9em rgba(255,180,60,.45))}
#pw .nm{font-family:${FONT.pixel};color:${CREAM};white-space:nowrap;line-height:1.25;
  text-shadow:-.06em 0 0 ${INK},.06em 0 0 ${INK},0 -.06em 0 ${INK},0 .06em 0 ${INK},.12em .12em 0 ${TEAL},.18em .18em 0 ${INK}}
#pw .nm i{display:inline-block;font-style:normal}
#pw .chip{position:relative;overflow:hidden;font-family:${FONT.pixel};color:${INK};background:${TEAL};padding:.45em .7em .4em;margin-top:.75em;line-height:1.2;box-shadow:.25em .25em 0 ${INK};white-space:nowrap}
#pw .chip::after{content:'';position:absolute;top:0;bottom:0;left:-45%;width:30%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.85),transparent);animation:pwshine .5s linear .75s 1 both}
@keyframes pwshine{to{left:125%}}
@media (prefers-reduced-motion: reduce){#pw .chip::after{animation:none;display:none}}
#pw.vow .ban span{background:linear-gradient(180deg,#ffffff 0%,#a8f6ff 11%,${TEAL} 20%,${VIO} 31%,${MAG} 41%,#5a0a6a 50%,#ffffff 50%,#a8f6ff 61%,${TEAL} 70%,${VIO} 81%,${MAG} 91%,#5a0a6a 100%);background-size:100% 200%;-webkit-background-clip:text;background-clip:text;
  filter:drop-shadow(0 .06em 0 #5a0a6a) drop-shadow(0 .06em 0 #2a0430) drop-shadow(.06em .06em 0 ${INK}) drop-shadow(0 0 .3em rgba(255,47,168,.6))}
#pw.vow .chip{background:${MAG};color:#fff;text-shadow:.08em .08em 0 ${INK}}
#pw.vow .nm{text-shadow:-.06em 0 0 ${INK},.06em 0 0 ${INK},0 -.06em 0 ${INK},0 .06em 0 ${INK},.12em .12em 0 ${MAG},.18em .18em 0 ${INK}}
#pw.vow .ln b{color:#a8f6ff}
#pw.vow .hero{filter:drop-shadow(.08em .08em 0 ${INK}) drop-shadow(0 0 .35em rgba(255,47,168,.8)) drop-shadow(0 0 .9em rgba(46,232,255,.45))}
#pwhud{position:fixed;left:calc(env(safe-area-inset-left,0px) + 14px);top:calc(env(safe-area-inset-top,0px) + 14px);z-index:45;pointer-events:none;display:none;flex-direction:column;align-items:flex-start;gap:.5em;font-size:clamp(11px,.6vw + 6px,17px)}
#pwhud.on{display:flex}
#pwhud .s{display:flex;align-items:center;gap:.6em;background:rgba(16,2,10,.84);border:.18em solid ${TEAL};box-shadow:.25em .25em 0 ${INK};padding:.35em .8em .35em .35em;transform-origin:0 50%}
#pwhud .s.boon{border-color:${MAG}}
#pwhud .s canvas{width:2.9em;height:2.9em;image-rendering:pixelated;image-rendering:crisp-edges;display:block}
#pwhud .tx{display:flex;flex-direction:column;gap:.35em;min-width:8em}
#pwhud b{font:400 1em/1.1 ${FONT.pixel};color:${CREAM};white-space:nowrap;text-shadow:.12em .12em 0 ${INK}}
#pwhud em{font:400 .78em/1.1 ${FONT.pixel};font-style:normal;color:${TEAL};white-space:nowrap}
#pwhud .s.boon em{color:#ff7ad0}
#pwhud u{display:block;height:.4em;background:#2a0608;text-decoration:none;position:relative}
#pwhud u i{position:absolute;left:0;top:0;bottom:0;background:${TEAL}}
#pwhud .s.off canvas{filter:grayscale(1) brightness(.55)}
#pw .ln{font-family:${FONT.vt};color:${CREAM};line-height:1.02;margin-top:.4em;max-width:24em;text-shadow:.07em .07em 0 ${INK},0 0 .4em rgba(0,0,0,.9)}
#pw .ln b{color:${HOT.y};font-weight:400;white-space:nowrap}
#pwpop{position:fixed;left:50%;top:19%;z-index:2147482999;pointer-events:none;display:none;transform:translateX(-50%)}
#pwpop.side{left:calc(env(safe-area-inset-left,0px) + 14px);transform:none}
#pwpop.side .in{align-items:flex-start;transform-origin:0 50%}
#pwpop.on{display:block}
#pwpop .in{display:flex;flex-direction:column;align-items:center;gap:.35em;white-space:nowrap}
#pwpop .h{display:flex;align-items:center;gap:.45em}
#pwpop .t{font-family:${FONT.pixel};line-height:1.2;padding:.08em .06em .16em;background:linear-gradient(180deg,#fffbe0 0%,${HOT.y} 40%,${HOT.o} 70%,${HOT.r} 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(.08em .08em 0 ${INK}) drop-shadow(0 0 .3em rgba(255,110,30,.6))}
#pwpop .s{font-family:${FONT.pixel};font-size:.55em;color:${INK};background:${TEAL};padding:.4em .6em .35em;box-shadow:.2em .2em 0 ${INK}}
#pwpop .q{position:absolute;left:50%;top:40%;width:.3em;height:.3em}
#pwedge{position:fixed;inset:0;z-index:2147482998;pointer-events:none;opacity:0;box-shadow:inset 0 0 0 6px ${TEAL},inset 0 0 60px 10px rgba(46,232,255,.55)}
`;
let el = null;
function build() {
  if (el) return el;
  const st = document.createElement('style'); st.id = 'pw-css'; st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'pw'; root.setAttribute('aria-live', 'polite');
  root.innerHTML = '<canvas class="fx"></canvas><div class="stack"><div class="ban"></div><span class="nm"></span><div class="chip"></div><div class="ln"></div></div><div class="scan"></div><div class="flash"></div>';
  document.body.appendChild(root);
  const pop = document.createElement('div'); pop.id = 'pwpop'; pop.innerHTML = '<div class="in"><div class="h"><span class="t"></span></div><span class="s"></span></div>'; document.body.appendChild(pop);
  const edge = document.createElement('div'); edge.id = 'pwedge'; document.body.appendChild(edge);
  el = { root, pop, edge, fx: root.querySelector('.fx'), stack: root.querySelector('.stack'), ban: root.querySelector('.ban'), nm: root.querySelector('.nm'), chip: root.querySelector('.chip'), ln: root.querySelector('.ln'), flash: root.querySelector('.flash') };
  return el;
}
/* ---------------------------------------------------------------- the HUD slot: the power(s) the hero carries in the fight */
let hud = null; let hudFight = null; /* the fight that drives the slot (an old fight's updater must not hide a new one's) */
function hudEl() { build(); if (hud) return hud; const r = document.createElement('div'); r.id = 'pwhud'; document.body.appendChild(r); hud = { root: r, slots: {} }; return hud; }
function hudReset() { const H = hudEl(); H.root.replaceChildren(); H.slots = {}; }
function hudSlot(key, p, boon = false) {
  const H = hudEl(); let s = H.slots[key];
  if (!s) { const d = document.createElement('div'); d.className = `s${boon ? ' boon' : ''}`; d.innerHTML = '<span class="ic"></span><span class="tx"><b></b><em></em><u><i></i></u></span>'; H.root.appendChild(d); s = H.slots[key] = { d, b: d.querySelector('b'), em: d.querySelector('em'), u: d.querySelector('u'), bar: d.querySelector('u i'), last: null, frac: null }; }
  s.d.querySelector('.ic').replaceChildren(iconCanvas(p.icon)); s.b.textContent = p.name; return s;
}
function hudSet(s, text, frac = null, off = false) {
  if (!s) return; if (s.last !== text) { s.em.textContent = text; s.last = text; }
  const f = frac == null ? null : Math.round(clamp01(frac) * 50) / 50; if (f !== s.frac) { s.frac = f; s.u.style.display = f == null ? 'none' : ''; if (f != null) s.bar.style.width = `${f * 100}%`; }
  s.d.classList.toggle('off', !!off);
}
function hudPing(s) {
  if (!s || reduced()) return;
  try { s.d.animate([{ transform: 'scale(1)', borderColor: '#ffffff' }, { transform: 'scale(1.25)', borderColor: '#ffffff', offset: 0.25 }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' }); s.d.querySelector('canvas')?.animate([{ filter: 'brightness(2.4) drop-shadow(0 0 6px #fff)' }, { filter: 'none' }], { duration: 520 }); } catch { /* fx optional */ }
}
let hudTopT = 0; let hudForce = false; /* the vow's icon is landing in its slot */
function hudShow(on) {
  if (!hud) return; hud.root.classList.toggle('on', !!on);
  /* below the sound button (audio-bar.js #sq-audio, top-left), measured twice a second */
  const now = performance.now(); if (!on || now - hudTopT < 500) return; hudTopT = now;
  try { const r = document.getElementById('sq-audio')?.getBoundingClientRect(); const top = r && r.height ? Math.round(r.bottom + 8) : 14; if (hud.top !== top) { hud.top = top; hud.root.style.top = `${top}px`; } } catch { /* default top */ }
}
/* the game's own canvas, shaken with the overlay (the CSS `translate` property leaves its transform alone) */
function gameCanvas() { let best = null; let a = 0; for (const c of document.querySelectorAll('canvas')) { if (c.closest('#pw')) continue; const r = c.getBoundingClientRect(); if (r.width * r.height > a) { a = r.width * r.height; best = c; } } return best; }

let live = null; /* the running moment */
/* the camp hero's chest on screen (onboarding only): the power's icon flies into the hero as the moment ends */
function heroOnScreen() {
  try {
    const S = window.__sq?.S; const cam = window.__sq?.world?.camera; const root = S?.hero?.root; if (!cam || !root || S.stage !== 'build') return null;
    const v = root.getWorldPosition(root.position.clone()); v.y += 1.15; v.project(cam);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  } catch { return null; }
}
function flyToHero(icon, name, tg = heroOnScreen(), vow = false) {
  if (!tg) return;
  const r = icon.getBoundingClientRect(); if (!r.width) return;
  const fly = iconCanvas(name); Object.assign(fly.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, zIndex: 2147483001, pointerEvents: 'none', filter: 'drop-shadow(0 0 12px rgba(46,232,255,.9))' });
  document.body.appendChild(fly); icon.style.visibility = 'hidden';
  const dx = tg.x - (r.left + r.width / 2); const dy = tg.y - (r.top + r.height / 2);
  const a = fly.animate([{ transform: 'translate(0,0) scale(1) rotate(0)' }, { transform: `translate(${dx}px,${dy}px) scale(.22) rotate(360deg)`, opacity: 1, offset: 0.85 }, { transform: `translate(${dx}px,${dy}px) scale(.1) rotate(400deg)`, opacity: 0 }], { duration: 460, easing: 'cubic-bezier(.55,0,.75,.45)', fill: 'forwards' });
  a.onfinish = () => { fly.remove(); landBurst(tg.x, tg.y, vow); tg.done?.(); };
  setTimeout(() => fly.remove(), 900);
}
/* where the icon lands: a teal ring, pixel squares and a blip */
function landBurst(x, y, vow = false) {
  try {
    const box = document.createElement('div'); Object.assign(box.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, zIndex: 2147483001, pointerEvents: 'none' }); document.body.appendChild(box);
    const u = Math.max(6, Math.round(Math.min(innerWidth, innerHeight) / 110));
    const ring = document.createElement('i'); Object.assign(ring.style, { position: 'absolute', left: '0', top: '0', width: `${u * 30}px`, height: `${u * 30}px`, borderRadius: '50%', background: vow ? `radial-gradient(circle, #fffbe0 0 12%, ${MAG} 30%, rgba(255,47,168,.35) 50%, rgba(255,47,168,0) 70%)` : `radial-gradient(circle, #fffbe0 0 12%, ${TEAL} 30%, rgba(46,232,255,.35) 50%, rgba(46,232,255,0) 70%)`, transform: 'translate(-50%,-50%)', mixBlendMode: 'screen' }); box.appendChild(ring);
    ring.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9, offset: 0.35 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }], { duration: 900, easing: 'ease-out', fill: 'forwards' });
    for (let i = 0; i < 18; i++) { const q = document.createElement('i'); Object.assign(q.style, { position: 'absolute', left: '0', top: '0', width: `${u}px`, height: `${u}px`, background: (vow ? VPAL : PAL)[i % PAL.length] }); box.appendChild(q); const a = (i / 18) * Math.PI * 2; const d = rnd(6, 13) * u; q.animate([{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - u * 4}px))`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' }); }
    jingle('pop'); setTimeout(() => box.remove(), 1000);
  } catch { /* fx optional */ }
}
/* p = { name, line, forLine, chip, icon }. mode 'full' (heart, 2.5 s), 'short' (quick start, 2.0 s), 'boon' (act-2 camp, the big one, 3.0 s, its own look).
   still(): checked when the delay ends (the step may have been skipped). Resolves when the moment is gone. */
export function powerMoment(p, { mode = 'full', delay = 0, still = null, toHud = null } = {}) {
  if (!p) return Promise.resolve(false);
  try { coverFonts(); } catch { /* fonts are optional */ }
  return new Promise((done) => {
    setTimeout(async () => {
      if (still && !still()) return done(false);
      try { if (!document.fonts.check(`20px ${FONT.pixel}`) || !document.fonts.check(`20px ${FONT.vt}`)) await Promise.race([coverFonts(), new Promise((r) => setTimeout(r, 450))]); } catch { /* fallback font */ }
      if (still && !still()) return done(false);
      if (live) live.end(true);
      run(p, mode, done, { toHud });
    }, delay);
  });
}

function run(p, mode, done, opts = {}) {
  const E = build(); const RM = reduced(); const vow = mode === 'boon'; E.root.classList.toggle('vow', vow);
  const C = vow ? { a: MAG, b: TEAL, top: HOT.y, band: [HOT.y, HOT.o, MAG, VIO], halo: MAG, pal: VPAL } : { a: HOT.r, b: HOT.y, top: HOT.y, band: [HOT.y, HOT.o, HOT.r, HOT.p], halo: TEAL, pal: PAL };
  const T = mode === 'short' ? 2.0 : vow ? 3.0 : 2.8; const k = mode === 'short' ? 0.75 : 1; /* the time scale of the beats */
  const tIcon = 0.32 * k; const tName = 0.42 * k; const tLine = 0.55 * k;
  const W = innerWidth; const H = innerHeight; const base = Math.min(W, H); const portrait = W < H * 0.95; const flat = H < 520 && !portrait;
  /* ---- text ---- */
  E.ban.innerHTML = '';
  /* the heart: the player's words; the act-2 vow: the second tier of the same family */
  const rows = vow ? (portrait ? [['POWER'], ['UP!!!']] : [['POWER', 'UP!!!']]) : portrait ? [['YOU', 'GAIN'], ['POWER!!!']] : [['YOU', 'GAIN', 'POWER!!!']];
  const bSize = vow ? (portrait ? Math.min((W - 32) / 6.2, H * 0.085) : Math.min((W - 32) / 12.8, H * (flat ? 0.12 : 0.13), 124)) : portrait ? Math.min((W - 32) / 9.6, H * 0.075) : Math.min((W - 32) / 18.6, H * (flat ? 0.1 : 0.105), 100);
  const words = []; for (const r of rows) { const d = document.createElement('div'); d.className = 'r'; d.style.gap = `${Math.round(bSize * 0.55)}px`; for (const w of r) { const s = document.createElement('span'); s.textContent = w; s.style.fontSize = `${Math.round(bSize)}px`; d.appendChild(s); words.push(s); } E.ban.appendChild(d); }
  E.stack.querySelectorAll('.hero').forEach((c) => c.remove());
  const icon = iconCanvas(p.icon); icon.classList.add('hero'); E.stack.insertBefore(icon, E.nm);
  const iSize = Math.round(portrait ? Math.min(W * 0.34, H * 0.17) : Math.min(flat ? base * 0.2 : base * 0.29, 280)); icon.style.width = icon.style.height = `${iSize}px`; icon.style.fontSize = `${Math.round(iSize / 4)}px`;
  const name = String(p.name || '').toUpperCase();
  const sp2 = name.indexOf(' '); const two = portrait && sp2 > 0 && name.length > 11; /* an upright phone: WREN'S / VENGEANCE */
  let nSize = Math.min(base * (flat ? 0.07 : 0.08), 76);
  nSize = Math.max(12, Math.min(nSize, (W - 40) / ((two ? Math.max(sp2, name.length - sp2 - 1) : name.length) + 0.6)));
  E.nm.innerHTML = ''; E.nm.style.fontSize = `${Math.round(nSize)}px`;
  const chars = [...name].map((ch, i) => { if (two && i === sp2) { E.nm.appendChild(document.createElement('br')); return null; } const c = document.createElement('i'); c.textContent = ch === ' ' ? ' ' : ch; E.nm.appendChild(c); return c; }).filter(Boolean);
  const cSize = Math.round(Math.max(11, Math.min(base * 0.038, 36, (W - 60) / ((p.chip || '').length + 2))));
  E.chip.textContent = p.chip || ''; E.chip.style.display = p.chip ? '' : 'none'; E.chip.style.fontSize = `${cSize}px`;
  const lSize = Math.round(Math.min(60, Math.max(28, base * (flat ? 0.07 : 0.064))));
  E.ln.style.fontSize = `${lSize}px`; E.ln.textContent = `${p.line || ''} `;
  if (p.forLine) { const b = document.createElement('b'); b.textContent = p.forLine; E.ln.appendChild(b); }
  for (const n of [E.nm, E.chip, E.ln]) n.style.visibility = '';
  E.stack.style.transform = 'translateY(-50%)'; E.stack.style.opacity = '1'; E.stack.style.top = flat ? '50%' : '54%'; /* a little low: the sun shows above the band */
  E.root.classList.add('on');
  /* shrink until it fits (a long name, a late font, a short landscape screen) */
  for (let n = 0; n < 6 && E.nm.scrollWidth > W - 24; n++) { nSize *= 0.88; E.nm.style.fontSize = `${Math.round(nSize)}px`; }
  for (const s of words) for (let n = 0; n < 6 && s.parentNode.scrollWidth > W - 24; n++) for (const w of words) w.style.fontSize = `${Math.round(parseFloat(w.style.fontSize) * 0.92)}px`;
  for (let n = 0; n < 5 && E.stack.getBoundingClientRect().height > H - 24; n++) { const sc = 0.9; icon.style.width = icon.style.height = `${Math.round(parseFloat(icon.style.width) * sc)}px`; E.ln.style.fontSize = `${Math.max(22, Math.round(parseFloat(E.ln.style.fontSize) * 0.94))}px`; for (const w of words) w.style.fontSize = `${Math.round(parseFloat(w.style.fontSize) * 0.94)}px`; }
  /* layout of the dark band (measured before any transform runs) */
  const rb = E.ban.getBoundingClientRect(); const rl = E.ln.getBoundingClientRect(); const ri = icon.getBoundingClientRect();
  /* ---- animation (WAAPI) ---- */
  const anims = [];
  const A = (node, kf, o) => { const a = node.animate(kf, { fill: 'both', ...o }); anims.push(a); return a; };
  /* 80s colour cycling on the banner: the gradient runs down its letters */
  words.forEach((s) => A(s, [{ backgroundPosition: '0 0%' }, { backgroundPosition: '0 100%' }], { duration: 900, iterations: Infinity, easing: 'steps(9)', fill: 'none' }));
  if (RM) {
    A(E.ban, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    for (const [n, d] of [[icon, tIcon], [E.nm, tName], [E.chip, tLine], [E.ln, tLine]]) A(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: d * 1000 });
  } else {
    words.forEach((s, i) => A(s, [
      { transform: 'translateY(-.8em) scale(1.7) rotate(-6deg)', opacity: 0 }, /* from 2.6x the words overlapped ("YOUGAIN") */
      { transform: 'translateY(0) scale(.82) rotate(2deg)', opacity: 1, offset: 0.5 },
      { transform: 'scale(1.12) rotate(-1deg)', offset: 0.75 },
      { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 380 * k, delay: (30 + i * 85) * k, easing: 'cubic-bezier(.25,.9,.35,1)' }));
    A(E.ban, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.4) saturate(1.4)' }, { filter: 'brightness(1)' }], { duration: 110, delay: 640 * k, iterations: 3, fill: 'none' }); /* the arcade blink */
    A(icon, [{ transform: 'scale(0) rotate(-200deg)', opacity: 0 }, { transform: 'scale(1.5) rotate(10deg)', opacity: 1, offset: 0.55 }, { transform: 'scale(.92) rotate(-3deg)', offset: 0.8 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 420 * k, delay: tIcon * 1000, easing: 'cubic-bezier(.3,1.3,.5,1)' });
    A(icon, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 250, delay: tIcon * 1000 + 420 * k, iterations: Infinity, composite: 'add', fill: 'none' });
    A(icon, [{ transform: 'translateY(0)' }, { transform: `translateY(${-Math.round(iSize * 0.07)}px)` }, { transform: 'translateY(0)' }], { duration: 760, delay: tIcon * 1000 + 420 * k, iterations: Infinity, composite: 'add', fill: 'none', easing: 'ease-in-out' }); /* the idle bob */
    A(icon, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.14,.86)', offset: 0.14 }, { transform: 'scale(.92,1.1)', offset: 0.32 }, { transform: 'scale(1,1)', offset: 0.5 }, { transform: 'scale(1,1)' }], { duration: 640, delay: tIcon * 1000 + 560 * k, iterations: Infinity, composite: 'add', fill: 'none' }); /* squash and stretch */
    A(E.stack, [{ scale: '1' }, { scale: '1.06' }], { duration: Math.max(400, (T - 0.9) * 1000), delay: 900, easing: 'linear', fill: 'none' }); /* a slow push-in through the hold */
    /* each letter of the name slams down hard (no fade: a fade left ghost letters) */
    chars.forEach((c, i) => A(c, [{ transform: 'translateY(-.2em) scale(1.3)', opacity: 0 }, { transform: 'translateY(-.2em) scale(1.3)', opacity: 1, offset: 0.02 }, { transform: 'none', opacity: 1 }], { duration: 80, delay: tName * 1000 + i * 22 * k, easing: 'linear', fill: 'backwards' })); /* no forward fill: a finished, forward-filled letter kept a stale 1.3x layer in some frames ("cROWN") */
    A(E.chip, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1.1)', opacity: 1, offset: 0.7 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 200, delay: (tName * 1000 + chars.length * 22 * k), easing: 'ease-out' });
    A(E.ln, [{ opacity: 0, transform: 'translateY(.4em)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, delay: tLine * 1000 + chars.length * 22 * k, easing: 'ease-out' });
    /* fill 'forwards' only: a backward fill held the second flash at 0.55 until it played (the milky entry of rounds 1-2) */
    A(E.flash, [{ opacity: 0.7 }, { opacity: 0.7, offset: 0.3 }, { opacity: 0 }], { duration: 110, easing: 'linear', fill: 'forwards' });
    A(E.flash, [{ opacity: 0.4 }, { opacity: 0 }], { duration: 80, delay: tIcon * 1000 + 200 * k, easing: 'linear', fill: 'forwards' });
  }
  /* ---- canvas: dim, banded sun, rays, rings, pixel particles ---- */
  const px = Math.max(3, Math.round(base / 170)); const cw = Math.ceil(W / px); const ch = Math.ceil(H / px);
  const cv = E.fx; cv.width = cw; cv.height = ch; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const cx = cw / 2; const iy = (ri.top + ri.height / 2) / px;
  const bTop = Math.floor((rb.top - bSize * 0.4) / px); const bBot = Math.ceil((rl.bottom + 18) / px); const cy = iy;
  const parts = []; const lowTier = (window.__sq?.quality?.tier || window.__sq?.tier) === 'low';
  const burst = (x, y, n, sp) => { if (RM) n = Math.round(n * 0.25); if (lowTier) n = Math.round(n * 0.6); for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2); const v = rnd(0.2, 1) * sp; parts.push({ x, y, vx: Math.cos(a) * v * 1.4, vy: Math.sin(a) * v - rnd(0, sp * 0.3), life: rnd(0.7, 1.6), t: 0, c: C.pal[(Math.random() * C.pal.length) | 0], s: Math.random() < 0.3 ? 2 : 1 }); } };
  const rings = [];
  burst(cx, (rb.top + rb.height / 2) / px, 220, base / px * 1.3); rings.push({ t0: 0, y: (rb.top + rb.height / 2) / px, c: '#fffbe0' });
  const chipStr = p.chip || ''; const tChip = (tName * 1000 + chars.length * 22 * k) / 1000; let chipDone = true; /* the count-up showed wrong rules while it ran ("EVERY 2TH HIT"); the chip is final from its first frame */
  let firedIcon = false; let firedOut = false; let firedMid = mode === 'short'; const tMid = vow ? 1.5 : 1.2; let emit = 0;
  const can = gameCanvas(); let t = 0; let last = performance.now(); let raf = 0; let endAt = T; let ended = false; const OUT = 0.16;
  const sunR = Math.max(Math.min(cw, ch) * 0.16, Math.min(Math.min(cw, ch) * (portrait ? 0.3 : 0.4), bTop * 0.92)); /* its bright top stays on screen */
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (!firedIcon && t >= tIcon + 0.2 * k) { firedIcon = true; burst(cx, iy, 160, base / px * 1.1); rings.push({ t0: t, y: iy, c: C.halo }); rings.push({ t0: t + 0.08, y: iy, c: C.top }); }
    /* the second hit in the middle of the hold: the icon throbs, a ring, a burst, a short shake and a blip */
    if (!firedMid && t >= tMid && endAt > t + 0.5) { firedMid = true; burst(cx, iy, 90, base / px * 0.9); rings.push({ t0: t, y: iy, c: C.top }); rings.push({ t0: t + 0.06, y: iy, c: C.halo }); if (!RM) { A(icon, [{ transform: 'scale(1)' }, { transform: 'scale(1.3) rotate(-6deg)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 300, composite: 'add', fill: 'none', easing: 'ease-out' }); A(E.flash, [{ opacity: 0.22 }, { opacity: 0 }], { duration: 90, fill: 'forwards' }); } jingle('pop'); }
    /* the chip's numbers count up */
    if (!chipDone && t >= tChip) { const u = ease((t - tChip) / 0.45); E.chip.textContent = u >= 1 ? chipStr : chipStr.replace(/\d+(\.\d+)?/g, (m) => { const v = parseFloat(m) * u; return m.includes('.') ? v.toFixed(1) : String(Math.round(v)); }); if (u >= 1) chipDone = true; }
    /* sparks rise from the icon the whole hold */
    if (t > tIcon + 0.3 && !RM) { emit += dt * (lowTier ? 30 : 60); while (emit >= 1) { emit -= 1; const a = rnd(-Math.PI, 0); const rr = (ri.width / px) * 0.45; parts.push({ x: cx + Math.cos(a) * rr, y: iy + Math.sin(a) * rr * 0.6, vx: rnd(-6, 6), vy: rnd(-34, -16), life: rnd(0.5, 1.0), t: 0, c: Math.random() < 0.5 ? C.b : C.pal[(Math.random() * C.pal.length) | 0], s: Math.random() < 0.25 ? 2 : 1, up: true }); } }
    /* the exit is a hard cut: the words slide up at full
       opacity in 0.16 s, then everything is gone in one frame */
    if (!firedOut && t >= endAt - OUT) {
      firedOut = true; if (!RM) for (const n of [E.nm, E.chip, E.ln]) n.style.visibility = 'hidden';
      if (vow && opts.toHud) hudForce = true;
      if (!RM && t > tIcon + 0.5) { if (mode === 'full') flyToHero(icon, p.icon); else if (vow && opts.toHud) { if (hud) hud.root.classList.add('on'); const r = opts.toHud.getBoundingClientRect(); if (r.width) flyToHero(icon, p.icon, { x: r.left + r.height / 2, y: r.top + r.height / 2, done: () => hudPing({ d: opts.toHud }) }, true); } }
      if (!RM) A(E.stack, [{ transform: 'translateY(-50%)' }, { transform: `translateY(calc(-50% - ${Math.round(H * 0.7)}px))` }], { duration: OUT * 1000, easing: 'cubic-bezier(.6,0,.9,.4)' });
    }
    const env = clamp01(t / 0.04);
    g.clearRect(0, 0, cw, ch);
    /* dim: the camp behind goes nearly black */
    g.globalAlpha = 0.97 * env; g.fillStyle = '#10020a'; g.fillRect(0, 0, cw, ch);
    /* rays: hot spokes with dark gaps, turning, from the icon */
    const R = Math.hypot(cw, ch) * ease(t / 0.25); const n = vow ? 24 : 16; const rot = RM ? 0 : vow ? -t * 0.9 : t * 0.8;
    for (let i = 0; i < n; i++) { const a0 = rot + (i / n) * Math.PI * 2; const w = (Math.PI / n) * (i % 2 ? 0.3 : 0.45); g.globalAlpha = (i % 2 ? 0.6 : 0.5) * env; g.fillStyle = i % 2 ? C.a : C.b; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0 - w) * R, cy + Math.sin(a0 - w) * R); g.lineTo(cx + Math.cos(a0 + w) * R, cy + Math.sin(a0 + w) * R); g.closePath(); g.fill(); }
    /* the banded sun of the title, rising out of the band (only its top shows) */
    /* the vow: a tunnel of square rings rushing out of the icon (the heart has the banded sun) */
    if (vow) { const m = Math.max(cw, ch); for (let j = 0; j < 7; j++) { const u = RM ? (j + 0.5) / 7 : ((t * 0.7 + j / 7) % 1); const h = 3 + u * u * m * 0.75; g.globalAlpha = (0.25 + 0.6 * u) * env; g.strokeStyle = j % 2 ? MAG : TEAL; g.lineWidth = Math.max(1, Math.round(1 + u * 3)); g.strokeRect(Math.round(cx - h), Math.round(iy - h * 0.62), Math.round(h * 2), Math.round(h * 1.24)); } }
    const sR = vow ? 0 : sunR * (RM ? 1 : 0.5 + 0.5 * ease(t / 0.45)); const sy = bTop + 1;
    for (let y = -Math.floor(sR); y <= 0 && sR > 0; y++) {
      const v = (y + sR) / sR; if (v > 0.45) { const band = (v - 0.45) / 0.55; const period = 6; const gap = Math.max(1, Math.round(band * 3.5)); if ((((y % period) + period) % period) < gap) continue; }
      const half = Math.sqrt(Math.max(0, sR * sR - y * y)); g.globalAlpha = env;
      g.fillStyle = v < 0.25 ? '#fff1a0' : v < 0.45 ? HOT.y : v < 0.65 ? HOT.o : v < 0.85 ? HOT.r : '#a8104a';
      g.fillRect(Math.round(cx - half), Math.round(sy + y), Math.round(half * 2), 1);
    }
    /* the dark band the words sit on, the title's four stripes under it; it opens from its middle line */
    { const o = RM ? 1 : ease(t / 0.15); const mid = (bTop + bBot) / 2; const hh = ((bBot - bTop) / 2) * o; const top = Math.round(mid - hh); const bot = Math.round(mid + hh);
      g.globalAlpha = 0.72 * env; g.fillStyle = '#12020a'; g.fillRect(0, top, cw, bot - top);
      g.globalAlpha = env; g.fillStyle = C.top; g.fillRect(0, top - 1, cw, 1);
      C.band.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, bot + i * 2, cw, 2); }); }
    /* a pixel halo that pulses behind the icon */
    if (t > tIcon) { const hr = (ri.width / px) * (0.62 + 0.06 * Math.sin(t * 14)); g.globalAlpha = 0.35 * env; g.fillStyle = C.halo; g.beginPath(); g.arc(cx, iy, hr, 0, Math.PI * 2); g.fill(); g.globalAlpha = 0.5 * env; g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(cx, iy, hr * 0.6, 0, Math.PI * 2); g.fill(); }
    /* rings */
    for (const r of RM ? [] : rings) { const u = (t - r.t0) / 0.5; if (u < 0 || u > 1) continue; g.globalAlpha = (1 - u) * env; g.strokeStyle = r.c; g.lineWidth = 2; g.beginPath(); g.arc(cx, r.y, 4 + ease(u) * Math.max(cw, ch) * 0.6, 0, Math.PI * 2); g.stroke(); }
    /* pixel particles + twinkles */
    for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.t += dt; if (q.t > q.life) { parts.splice(i, 1); continue; } q.vy += (q.up ? -10 : 30) * dt; q.vx *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt; g.globalAlpha = (1 - q.t / q.life) * env; g.fillStyle = q.c; g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); }
    if (!RM && t > 0.25) for (let i = 0; i < 14; i++) { const x = Math.round(rnd(0.05, 0.95) * cw); const y = Math.round(rnd(0.05, 0.95) * ch); g.globalAlpha = 0.9 * env; g.fillStyle = Math.random() < 0.5 ? '#fffbe0' : C.halo; g.fillRect(x, y - 1, 1, 3); g.fillRect(x - 1, y, 3, 1); }
    g.globalAlpha = 1;
    /* shake: the hit, then the icon */
    if (!RM) { const sh = Math.max(clamp01(1 - t / 0.3), t >= tIcon + 0.2 * k ? clamp01(1 - (t - tIcon - 0.2 * k) / 0.25) * 0.8 : 0, firedMid && mode !== 'short' && t >= tMid ? clamp01(1 - (t - tMid) / 0.2) * 0.6 : 0); const dx = sh ? Math.round(rnd(-1, 1) * 10 * sh) : 0; const dy = sh ? Math.round(rnd(-1, 1) * 8 * sh) : 0; E.stack.style.translate = `${dx}px ${dy}px`; if (can) can.style.translate = sh ? `${dx}px ${dy}px` : ''; }
    if (t >= endAt) return finish();
    raf = requestAnimationFrame(frame);
  };
  const finish = (now = false) => {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    removeEventListener('keydown', skip, true); removeEventListener('pointerdown', skip, true);
    for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    E.root.classList.remove('on'); E.stack.style.translate = ''; if (can) can.style.translate = ''; g.clearRect(0, 0, cw, ch);
    if (live === handle) live = null; done(!now);
  };
  /* any key, click or tap: out in 0.16 s (the key still reaches the game) */
  const skip = () => { if (t < 0.25) return; if (endAt > t + OUT) { endAt = t + OUT; firedOut = false; } };
  addEventListener('keydown', skip, true); addEventListener('pointerdown', skip, true);
  const handle = { end: (now) => finish(now) }; live = handle;
  jingle(mode === 'short' ? 'short' : vow ? 'vow' : 'full');
  raf = requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- the pop: the power at work in the fight */
let popAnim = []; let popT = 0;
/* text = the power's name line; sub = what it did ("HIT BLOCKED", "+30% DAMAGE") */
export function pop(p, text, { sound = true, icon = null, sub = '' } = {}) {
  if (!p) return;
  try {
    const E = build(); const P = E.pop; const inner = P.querySelector('.in'); const h = P.querySelector('.h'); const T = P.querySelector('.t'); const S = P.querySelector('.s');
    popAnim.forEach((a) => { try { a.cancel(); } catch { /* gone */ } }); popAnim = []; clearTimeout(popT);
    P.querySelectorAll('.pw-icon,.q').forEach((n) => n.remove());
    const base = Math.min(innerWidth, innerHeight); const size = Math.round(Math.max(14, Math.min(46, base * 0.055, (innerWidth - 40) / ((text || p.name).length + 3))));
    const side = !!(hud && hud.root.classList.contains('on') && hud.root.children.length); P.classList.toggle('side', side); /* in the fight the pop sits under the HUD slot, clear of the aim point */
    if (side) { const hb = hud.root.getBoundingClientRect(); P.style.top = `${Math.round(hb.bottom + 10)}px`; } else P.style.top = '';
    P.style.fontSize = `${side ? Math.min(size, 30) : size}px`; T.textContent = text || p.name; S.textContent = sub; S.style.display = sub ? '' : 'none';
    const ic = iconCanvas(icon || p.icon); ic.style.width = ic.style.height = `${Math.round(size * 1.8)}px`; h.prepend(ic);
    P.classList.add('on'); const RM = reduced();
    popAnim.push(inner.animate(RM ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }] : [
      { transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.35)', opacity: 1, offset: 0.1 }, { transform: 'scale(.95)', opacity: 1, offset: 0.18 }, { transform: 'scale(1)', opacity: 1, offset: 0.24 },
      { transform: 'scale(1)', opacity: 1, offset: 0.85 }, { transform: 'scale(1.1) translateY(-.4em)', opacity: 0 }], { duration: 1500, fill: 'both', easing: 'ease-out' }));
    if (!RM) {
      popAnim.push(E.edge.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' }));
      for (let i = 0; i < 14; i++) {
        const q = document.createElement('i'); q.className = 'q'; q.style.background = PAL[i % PAL.length]; P.appendChild(q);
        const a = (i / 14) * Math.PI * 2 + rnd(-0.2, 0.2); const d = rnd(2.4, 4);
        popAnim.push(q.animate([{ transform: 'translate(-50%,-50%) translate(0,0)', opacity: 1 }, { transform: `translate(-50%,-50%) translate(${Math.cos(a) * d * 2.4}em,${Math.sin(a) * d}em)`, opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both' }));
      }
    }
    popT = setTimeout(() => P.classList.remove('on'), 1550);
    if (sound) jingle('pop');
  } catch (err) { console.warn('power pop', err); }
}

/* ---------------------------------------------------------------- the effects in the fight */
const SHAPE_MOTIVE = { vigil: 'protect', hunt: 'revenge', trial: 'glory', chains: 'freedom', dark: 'wonder' };
const SHIELD_BACK = 22; const WONDER_N = 5; const STREAK_S = 4;
/* fight.js start(): the power works from the first wave. Instance methods are wrapped, so fight.js keeps its own code */
export function installPower(fight) {
  if (!fight || fight.pw) return null;
  const sp = QS.get('story'); const quick = !!sp && sp in POWERS;
  let p = current;
  if (!p && quick) p = powerFor(sp, QS.get('nobody') === '1' ? [] : [{ text: 'Wren' }, { text: 'Ash' }]);
  if (!p && fight.story?.shape && SHAPE_MOTIVE[fight.story.shape]) p = powerFor(SHAPE_MOTIVE[fight.story.shape], []);
  if (!p) return null;
  current = p; try { (window.__sq ||= {}).power = p; } catch { /* tests */ }
  const S = { p, fired: {}, hits: 0, streak: 0, lastKill: -9, shieldUp: true, shieldT: 0, low: 0, lastDodgePop: -99 };
  fight.pw = S;
  hudReset(); hudFight = fight; S.slot = hudSlot('m', p);
  const fire = (key, text, o) => { S.fired[key] = (S.fired[key] || 0) + 1; pop(p, text, o); hudPing(S.slot); };
  const mult = () => {
    if (p.motive === 'revenge') return 1 + 0.5 * clamp01(1 - fight.hp / fight.maxHp);
    if (p.motive === 'glory' && fight.clock - S.lastKill < STREAK_S) return 1 + 0.12 * Math.min(4, Math.max(0, S.streak - 1));
    return 1;
  };
  const wonderHit = (pos) => {
    if (p.motive !== 'wonder') return 1;
    S.hits++; if (S.hits % WONDER_N) return 1;
    try { if (pos) fight.embers({ x: pos.x, y: 1.4, z: pos.z }, 0xffe27a, 40, 3.5); fight.world?.flash?.(reduced() ? 0 : 0.18); } catch { /* fx optional */ }
    fire('spark', `${p.name}!`, { sub: 'x2.2 DAMAGE' }); return 2.2;
  };
  /* damage out (foes) */
  const dmgFoe = fight.damageFoe;
  fight.damageFoe = function (f, dmg, ...rest) {
    if (!f || f.state === 'dead') return dmgFoe.call(this, f, dmg, ...rest);
    const alive = f.hp > 0; const m = mult() * wonderHit(f.pos);
    const r = dmgFoe.call(this, f, dmg * m, ...rest);
    if (p.motive === 'glory' && alive && (f.state === 'dead' || f.hp <= 0) && !f.boss) {
      S.streak = fight.clock - S.lastKill < STREAK_S ? S.streak + 1 : 1; S.lastKill = fight.clock;
      if (S.streak >= 2) { if (S.streak > (S.best || 1)) { S.best = S.streak; fire('crown', `${p.name} x${S.streak}`, { sub: `+${12 * Math.min(4, S.streak - 1)}% DAMAGE` }); } else { S.fired.crown = (S.fired.crown || 0) + 1; hudPing(S.slot); } } /* the big pop only on a new best */
    }
    return r;
  };
  /* a hit taken: the shield */
  const take = fight.takeHit;
  fight.takeHit = function (foe, atk = {}) {
    if (p.motive === 'protect' && S.shieldUp && !this.over && !(this.invuln > 0) && !this.powers?.ward && foe?.pos) {
      const to = { x: foe.pos.x - this.pos.x, z: foe.pos.z - this.pos.z }; const l = Math.hypot(to.x, to.z) || 1; to.x /= l; to.z /= l;
      const fw = this.forward(); const front = to.x * fw.x + to.z * fw.z > 0.2;
      if (!(this.blocking && front && !atk.unblockable)) {
        S.shieldUp = false; S.shieldT = 0; this.invuln = Math.max(this.invuln || 0, 0.45);
        try { const at = this.pos.clone(); at.y = 1.3; at.x += to.x * 0.9; at.z += to.z * 0.9; const d = at.clone().set(to.x, 0, to.z); this.clash(at, d, 0x2ee8ff, 26, 8); this.world.kick(0.12); this.vel.x -= to.x * 2.4; this.vel.z -= to.z * 2.4; } catch { /* fx optional */ }
        this.director?.event?.(`${p.name} takes a blow for the hero.`);
        fire('shield', `${p.name}!`, { sub: 'HIT BLOCKED' }); return 'blocked';
      }
    }
    const hp0 = this.hp; const r = take.call(this, foe, atk);
    if (p.motive === 'revenge' && this.hp < hp0 && this.hp > 0) {
      const ratio = this.hp / this.maxHp; const lvl = ratio < 0.3 ? 2 : ratio < 0.6 ? 1 : 0;
      if (lvl > S.low) { S.low = lvl; fire('vengeance', `${p.name}!`, { sub: `+${Math.round(50 * (1 - ratio))}% DAMAGE` }); }
    }
    return r;
  };
  /* freedom: faster feet, sooner dodges */
  if (p.motive === 'freedom') {
    fight.archetype = { ...fight.archetype, speed: fight.archetype.speed * 1.15 }; fight.mod.dodgeCd = Math.min(fight.mod.dodgeCd, 0.55);
    const dodge = fight.tryDodge;
    fight.tryDodge = function (...a) { const was = this.dodge; const r = dodge.apply(this, a); if (!was && this.dodge && this.clock - S.lastDodgePop > 9) { S.lastDodgePop = this.clock; fire('wind', `${p.name}!`, { sub: 'QUICK DODGE' }); } return r; };
  }
  /* per frame: the shield comes back, vengeance re-arms, the boss's damage is wrapped once it exists */
  /* the HUD slot: what the power is doing now */
  const status = () => {
    if (p.motive === 'protect') return S.shieldUp ? ['READY', 1, false] : [`BACK IN ${Math.max(1, Math.ceil(SHIELD_BACK - S.shieldT))} S`, S.shieldT / SHIELD_BACK, true];
    if (p.motive === 'revenge') { const v = Math.round(50 * clamp01(1 - fight.hp / fight.maxHp)); return [`+${v}% DAMAGE`, v / 50, v === 0]; }
    if (p.motive === 'glory') { const on = fight.clock - S.lastKill < STREAK_S && S.streak >= 2; return [on ? `x${S.streak} +${12 * Math.min(4, S.streak - 1)}% DAMAGE` : 'KILL FAST: +12% EACH', on ? clamp01((STREAK_S - (fight.clock - S.lastKill)) / STREAK_S) : null, !on]; }
    if (p.motive === 'wonder') { const n = S.hits % WONDER_N; return [n === WONDER_N - 1 ? 'NEXT HIT x2.2' : `HIT ${n + 1} OF ${WONDER_N}`, (n + 1) / WONDER_N, false]; }
    return ['+15% SPEED', null, false];
  };
  const off = fight.world.addUpdater?.((dt) => {
    if (hudFight === fight) hudShow(fight.active && !fight.over && (!fight.paused || S.moment) && (hudForce || !document.querySelector('#pw.on'))); /* hidden under every card */
    if (!fight.active || fight.over) return;
    { const [txt, frac, dim] = status(); hudSet(S.slot, txt, frac, dim); }
    if (S.boon === 'love' && hud?.slots.v) hudSet(hud.slots.v, fight.revive ? '1 FREE REVIVE · READY' : 'REVIVE USED', null, !fight.revive);
    if (p.motive === 'protect' && !S.shieldUp && !fight.paused) { S.shieldT += dt; if (S.shieldT >= SHIELD_BACK) { S.shieldUp = true; S.fired.shieldBack = (S.fired.shieldBack || 0) + 1; hudPing(S.slot); } } /* READY ticks the slot, the pop is for the hit it blocks */
    if (p.motive === 'revenge' && fight.hp / fight.maxHp > 0.7) S.low = 0;
    const B = fight.boss;
    if (B && !B.__pw && typeof B.damage === 'function') {
      B.__pw = true; const bd = B.damage;
      B.damage = function (id, dmg, ...rest) { return bd.call(this, id, dmg * mult() * wonderHit(fight.pos ? { x: fight.pos.x, z: fight.pos.z } : null), ...rest); };
    }
  });
  S.off = off;
  if (quick) powerMoment(p, { mode: 'short', delay: 350 });
  return S;
}

/* fight.js camp(): the vow's boon gets the big moment, before act 3, in its own look (POWER UP!!!, magenta + teal, the tunnel).
   The fight waits for it (fight.js awaits this), so the chapter III card never comes up under it. */
export async function resolveMoment(fight) {
  const r = fight?.resolve; if (!r) return false;
  let word = (r.plainBoon && fight.kit?.id && fight.kit.id !== 'dark' ? r.plainBoon : r.boon) || r.label;
  /* the boon keeps its own word (THEIR LIGHT); the line says who it is for, so the HUD is not three "WREN'S" */
  const who = current?.forLine && !Object.values(FOR_MOTIVE).includes(current.forLine) ? current.forLine : '';
  const P = { name: String(word).toUpperCase(), line: `Your vow holds: ${r.note}.`, forLine: who, chip: RESOLVE_CHIP[r.id] || '', icon: RESOLVE_ICON[r.id] || 'star' };
  const S = fight.pw; let slot = null; if (S) S.boon = r.id;
  try { slot = hudSlot('v', P, true); hudSet(slot, (P.chip || '').replace(/\s{2,}/g, ' · ')); slot.d.style.visibility = 'hidden'; } catch { /* no HUD */ }
  const was = fight.paused; fight.paused = true; if (S) S.moment = true;
  let shown = false;
  try { shown = await powerMoment(P, { mode: 'boon', delay: 250, toHud: slot?.d || null }); } finally {
    if (slot) setTimeout(() => { slot.d.style.visibility = ''; }, shown ? 420 : 0); /* the icon lands in it first */
    fight.paused = was; if (S) S.moment = false; hudForce = false;
  }
  if (shown) await new Promise((r) => setTimeout(r, 450)); /* the icon lands in its slot before chapter III */
  return shown;
}

/* test hook: play any power's moment on the current screen */
try { window.__pw = { powerMoment, powerFor, pop, ICONS: () => Object.keys(ICONS), iconCanvas }; } catch { /* no window */ }

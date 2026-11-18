/* Camp: the night camp behind the seven build steps (name .. weapon).
   One fire, one standing stone, the bare figure, and a sky that becomes the player's.
   Every keystroke answers back with no network; every final answer changes the scene for good.
   main.js owns the actor, the land (world.setBiome), the nemesis and the camera loop. This module only adds
   to the scene, and leave() takes it all away and puts back every world field it changed.
   Budget: one point light (made once in enter), pooled particles, no material or light made per frame. */
import * as THREE from 'three';
import * as W from './world.js';
const { loadGLB, makeActor, KNIGHT_URL, rng } = W;
import { sfx, sfxFoot } from './sfx.js';
import { fx, forgeKind } from './create-fx.js';
import { applyBody } from './bodies.js';
const BODY_PART = /^(Head_|Hair_|Beard$|Ranger_|Peasant_)/;
const HERO_KEY = 21;
import { LANDKIT } from './lands.js';
import { monthDay, signOf } from '/game/kit.mjs';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V3(); const _v2 = V3(); const _v3 = V3(); const _v4 = V3(); const _c = new THREE.Color(); const _c2W = new THREE.Color(0xffffff);
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/* ---------- layout (metres; the hero stands at the origin, the camera orbits it from +z) ---------- */
const FIRE = V3(1.2, 0, 1.0);
const STONE = { pos: V3(-1.75, 0, -1.5), ry: 0.42, w: 1.55, h: 2.5, d: 0.5 };
const SEATS = [ /* angle around the fire (atan2 z, x), distance. All on the far side of the fire from the hero and the stone,
  and spread across the screen from every step's camera (they orbit from +z, a little to -x), so a ghost never stands in the flames */
  [0.0, 1.65], [0.22, 2.7], [0.85, 2.05], [-0.5, 2.35],
];
/* the moon sits where the lands put their key light (world.js LAND_LOOK), so the two never disagree */
const MOON_DIR = V3(-0.56, 0.24, -0.79).normalize();
const CONST_DIR = V3(0.36, 0.5, -0.79).normalize();
const SKY_R = 400;
const HERO_TURN = 0.42;
/* pets sit at the hero's side, not in a seat */
const PET_SPOTS = [[-0.95, 0.55], [0.15, 1.35], [-0.65, 1.55], [0.85, 2.25], [2.45, 1.95], [-2.7, 0.5], [2.6, -0.4], [3.7, 2.5], [4.2, 1.1], [1.9, 2.9], [-3.4, 1.3], [-1.35, 1.75]];
const LIVE_Y = 2.85;
/* the lands are lit for a fight; the camp is night, so the exposure is held lower while it is here */
const NIGHT_EXPOSURE = 1.12; /* was 0.7: nine tenths of the picture sat under a quarter luma and turned to mud on screen */

/* ---------- type ---------- */
const SERIF = '"Cinzel", "Trajan Pro", Cochin, "Baskerville", Georgia, serif';
let fontJob = null;
function loadFont() {
  if (fontJob) return fontJob;
  fontJob = new Promise((resolve) => {
    const done = () => resolve();
    setTimeout(done, 3000);
    try {
      let link = document.querySelector('link[data-camp-font]');
      if (!link) {
        link = document.createElement('link'); link.rel = 'stylesheet'; link.dataset.campFont = '1';
        link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&display=block';
        document.head.appendChild(link);
      }
      const go = () => Promise.all([document.fonts.load('700 64px "Cinzel"'), document.fonts.load('500 64px "Cinzel"')]).then(done, done);
      if (link.sheet) go(); else { link.addEventListener('load', go); link.addEventListener('error', done); }
    } catch { done(); }
  });
  return fontJob;
}
const fitFont = (g, text, weight, size, maxW, fam = SERIF) => { g.font = `${weight} ${size}px ${fam}`; const w = g.measureText(text).width; if (w > maxW) { size = Math.floor(size * maxW / w); g.font = `${weight} ${size}px ${fam}`; } return size; };
const roman = (n) => { const R = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of R) while (n >= v) { s += r; n -= v; } return s; };

/* ---------- the sky: star tables (RA hours, Dec degrees, magnitude) and the lines between them ---------- */
const ZODIAC = {
  Aries: { s: [[2.12, 23.46, 2.0], [1.91, 20.81, 2.6], [1.89, 19.29, 3.9], [2.83, 27.26, 3.6]], l: [[3, 0, 1, 2]] },
  Taurus: { s: [[4.6, 16.51, 0.9], [4.48, 19.18, 3.5], [4.38, 17.54, 3.8], [4.33, 15.63, 3.6], [4.48, 15.87, 3.4], [5.44, 28.61, 1.7], [5.63, 21.14, 3.0], [4.01, 12.49, 3.4], [3.41, 9.03, 3.6], [3.79, 24.11, 2.9], [3.82, 24.05, 3.6], [3.75, 24.11, 3.7], [3.76, 24.37, 3.9], [3.77, 23.95, 4.1], [3.75, 24.47, 4.3]], l: [[6, 0, 4, 3, 2, 1, 5], [3, 7, 8]] },
  Gemini: { s: [[7.58, 31.89, 1.6], [7.76, 28.03, 1.1], [6.63, 16.4, 1.9], [6.73, 25.13, 3.0], [6.38, 22.51, 2.9], [6.25, 22.51, 3.3], [7.34, 21.98, 3.5], [7.07, 20.57, 3.9], [7.19, 30.25, 4.4], [7.74, 24.4, 3.6], [6.75, 12.9, 3.4], [7.3, 16.54, 3.6]], l: [[0, 8, 3, 4, 5], [1, 9], [1, 6, 7, 2], [6, 11, 10], [0, 1]] },
  Cancer: { s: [[8.97, 11.86, 4.2], [8.74, 18.15, 3.9], [8.72, 21.47, 4.7], [8.28, 9.19, 3.5], [8.78, 28.76, 4.0]], l: [[3, 1, 0], [1, 2, 4]] },
  Leo: { s: [[10.14, 11.97, 1.4], [10.12, 16.76, 3.5], [10.33, 19.84, 2.0], [10.28, 23.42, 3.4], [9.88, 26.01, 3.9], [9.76, 23.77, 3.0], [11.24, 20.52, 2.6], [11.24, 15.43, 3.3], [11.82, 14.57, 2.1]], l: [[0, 1, 2, 3, 4, 5], [2, 6, 8, 7, 0], [6, 7]] },
  Virgo: { s: [[13.42, -11.16, 1.0], [12.69, -1.45, 2.7], [13.04, 10.96, 2.8], [12.93, 3.4, 3.4], [13.58, -0.6, 3.4], [11.84, 1.76, 3.6], [12.33, -0.67, 3.9], [14.27, -6.0, 4.1], [14.72, -5.66, 3.9], [14.77, 1.89, 3.7], [14.03, 1.54, 4.3]], l: [[5, 6, 1, 3, 2], [1, 0], [3, 4, 10, 9], [4, 7, 8]] },
  Libra: { s: [[14.85, -16.04, 2.8], [15.28, -9.38, 2.6], [15.07, -25.28, 3.3], [15.59, -14.79, 3.9], [15.62, -28.14, 3.6], [15.64, -29.78, 3.7]], l: [[2, 0, 1, 3, 0], [3, 4, 5]] },
  Scorpio: { s: [[16.49, -26.43, 1.0], [16.01, -22.62, 2.3], [16.09, -19.81, 2.6], [15.98, -26.11, 2.9], [16.35, -25.59, 2.9], [16.6, -28.22, 2.8], [16.84, -34.29, 2.3], [16.86, -38.05, 3.0], [16.9, -42.36, 3.6], [17.2, -43.24, 3.3], [17.62, -43.0, 1.9], [17.79, -40.13, 3.0], [17.71, -39.03, 2.4], [17.56, -37.1, 1.6], [15.95, -29.21, 3.9]], l: [[2, 1, 3, 14], [1, 4, 0, 5, 6, 7, 8, 9, 10, 11, 12, 13]] },
  Sagittarius: { s: [[18.4, -34.38, 1.8], [18.35, -29.83, 2.7], [18.47, -25.42, 2.8], [18.92, -26.3, 2.0], [19.04, -29.88, 2.6], [19.12, -27.67, 3.3], [18.76, -26.99, 3.2], [18.1, -30.42, 3.0], [18.29, -36.76, 3.1]], l: [[7, 1, 2, 6, 3, 5, 4, 6], [4, 0, 1], [0, 7], [0, 8]] },
  Capricorn: { s: [[20.3, -12.54, 3.6], [20.35, -14.78, 3.1], [20.77, -25.27, 4.1], [20.86, -26.92, 4.1], [21.44, -22.41, 3.7], [21.78, -16.13, 2.9], [21.67, -16.66, 3.7], [21.37, -16.83, 4.3], [21.1, -17.23, 4.1]], l: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 1]] },
  Aquarius: { s: [[22.1, -0.32, 3.0], [21.53, -5.57, 2.9], [22.36, -1.39, 3.8], [22.48, -0.02, 3.6], [22.59, -0.12, 4.0], [22.42, 1.38, 4.7], [22.28, -7.78, 4.2], [22.88, -7.58, 3.7], [22.91, -15.82, 3.3], [20.79, -9.5, 3.8], [23.16, -21.17, 3.7], [22.83, -13.59, 4.0], [23.24, -6.05, 4.2]], l: [[9, 1, 0, 2, 3, 4], [3, 5], [0, 6, 7, 11, 8], [7, 12], [8, 10]] },
  Pisces: { s: [[2.03, 2.76, 3.8], [1.52, 15.35, 3.6], [1.76, 9.16, 4.3], [1.05, 7.89, 4.3], [0.81, 7.59, 4.4], [23.99, 6.86, 4.0], [23.67, 5.63, 4.1], [23.47, 6.38, 4.3], [23.29, 3.28, 3.7], [23.45, 1.26, 4.9], [23.7, 1.78, 4.5], [1.69, 5.49, 4.4], [1.5, 6.14, 4.8], [1.19, 30.09, 4.5], [1.23, 24.58, 4.6], [1.32, 27.26, 4.8]], l: [[8, 7, 6, 10, 9, 8], [6, 5, 4, 3, 12, 11, 0, 2, 1, 14, 15, 13]] },
};
/* the hidden sign (no birth date) is no real constellation: a broken ring of nine stars round one bright star */
ZODIAC.Hidden = { s: [[11.926, 25.91, 2.6], [11.694, 24.17, 3.4], [11.578, 20.84, 3.4], [11.624, 17.18, 2.6], [11.813, 14.61, 3.4], [12.074, 14.09, 3.4], [12.306, 15.83, 2.6], [12.422, 19.16, 3.4], [12.376, 22.82, 3.4], [12.0, 20.0, 1.2]], l: [[0, 1, 2, 3, 4, 5, 6, 7, 8]] };
const SIGN_MONTH = { Capricorn: 1, Aquarius: 2, Pisces: 3, Aries: 4, Taurus: 5, Gemini: 6, Cancer: 7, Leo: 8, Virgo: 9, Libra: 10, Scorpio: 11, Sagittarius: 12 };
/* 0 = new moon, 0.5 = full. Mean synodic month from the new moon of 2000-01-06 18:14 UTC. */
export function moonPhase(date) { const syn = 29.530588853; const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000; return (((days % syn) + syn) % syn) / syn; }
/* winter, spring, summer, autumn by month: snow, pollen, fireflies and heat, falling leaves */
const SEASON = (m) => (m === 12 || m <= 2 ? 0 : m <= 5 ? 2 : m <= 8 ? 3 : 1);
const SEASON_LOOK = [
  { vel: [0.25, -0.75, 0.1], vary: [0.3, 0.25, 0.3], sway: 0.5, size: 0.075, color: 0xf2f6ff, opacity: 0.85, add: false },
  { vel: [0.45, -0.5, 0.15], vary: [0.3, 0.15, 0.3], sway: 0.8, size: 0.06, color: 0x7a3a1c, opacity: 0.6, add: false },
  { vel: [0.15, 0.06, 0.05], vary: [0.15, 0.12, 0.15], sway: 0.6, size: 0.05, color: 0xffe2a0, opacity: 0.85, add: true },
  { vel: [0.0, 0.05, 0.0], vary: [0.2, 0.15, 0.2], sway: 1.1, size: 0.07, color: 0xd8ff7a, opacity: 1.0, add: true },
];

/* who a mention is, from the words around the name */
const PET_WORDS = { dog: 'hound', puppy: 'hound', pup: 'hound', hound: 'hound', wolf: 'hound', cat: 'cat', kitten: 'cat', kitty: 'cat', bird: 'bird', parrot: 'bird', raven: 'bird', crow: 'bird', owl: 'bird', hawk: 'bird', falcon: 'bird', budgie: 'bird', canary: 'bird', horse: 'hound', pony: 'hound', rabbit: 'cat', bunny: 'cat' };
const PEOPLE_WORDS = { son: 'child', daughter: 'child', kid: 'child', child: 'child', baby: 'child', boy: 'child', girl: 'child', wife: 'partner', husband: 'partner', partner: 'partner', girlfriend: 'partner', boyfriend: 'partner', fiance: 'partner', 'fiancée': 'partner', friend: 'friend', mate: 'friend', buddy: 'friend', brother: 'family', sister: 'family', mom: 'family', mum: 'family', mother: 'family', dad: 'family', father: 'family', grandma: 'family', grandmother: 'family', grandpa: 'family', grandfather: 'family', uncle: 'family', aunt: 'family', cousin: 'family', nan: 'family', nana: 'family' };
const REL = Object.keys({ ...PET_WORDS, ...PEOPLE_WORDS }).join('|');
const NAME_AFTER = new RegExp(`\\b(${REL})\\b,?\\s+(?:(?:named|called)\\s+)?([A-Z][\\p{L}'-]+)`, 'gu');
const NAME_BEFORE = new RegExp(`\\b([A-Z][\\p{L}'-]+),?\\s+(?:my|our|the)\\s+(${REL})\\b`, 'gu');
function guessMentions(text) {
  const out = new Map();
  const add = (rel, name) => { const r = rel.toLowerCase(); if (/^(My|Our|The|And|But|I)$/.test(name)) return; out.set(name.toLowerCase(), { text: name, kind: PET_WORDS[r] ? 'pet' : PEOPLE_WORDS[r], species: PET_WORDS[r] || null }); };
  for (const m of text.matchAll(NAME_AFTER)) add(m[1], m[2]);
  for (const m of text.matchAll(NAME_BEFORE)) add(m[2], m[1]);
  return out;
}
/* person or animal for each mention, from the words around its name in the answer ("my dog Ash" -> animal);
   the same word lists the camp uses for its ghosts and pets. Unknown names are people. */
export function mentionKinds(mentions = [], text = '') {
  const g = guessMentions(String(text || ''));
  return (mentions || []).map((m) => {
    const t = String(m?.text || '').toLowerCase(); const words = t.split(/\s+/);
    if (words.some((w) => PET_WORDS[w]) || /^(pet|animal)$/.test(m?.kind || '')) return 'animal';
    if (words.some((w) => PEOPLE_WORDS[w])) return 'person';
    const name = t.replace(new RegExp(`^(my|our)?\\s*(${REL})\\s+`, 'i'), '').trim();
    return g.get(name)?.kind === 'pet' ? 'animal' : 'person';
  });
}
/* a date typed or spoken: { month, day, year } with whatever is known so far */
function parseDate(text) {
  const t = String(text || '').trim();
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(t);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(t);
  if (m) { let y = +m[3]; if (y < 100) y += y > 30 ? 1900 : 2000; return +m[1] <= 12 ? { year: y, month: +m[1], day: +m[2] } : { year: y, month: +m[2], day: +m[1] }; }
  const md = monthDay(t);
  const y = /\b(1[89]\d\d|20\d\d)\b/.exec(t);
  const mo = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(t);
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if (!md && !mo && !y) return null;
  return { year: y ? +y[1] : null, month: md ? md.month : mo ? MON.indexOf(mo[1].toLowerCase().slice(0, 3)) + 1 : null, day: md ? md.day : null };
}

/* ---------- canvas textures ---------- */
const canvasTex = (w, h, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return { c, g: c.getContext('2d'), t }; };
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,\'-!?&ÆØÅÉÈÜÖÄÑ';
function drawAtlas(atlas) {
  const { g, c } = atlas; const cell = c.width / 8;
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < GLYPHS.length; i++) {
    const x = (i % 8) * cell + cell / 2; const y = Math.floor(i / 8) * cell + cell / 2 + cell * 0.04;
    g.font = `700 ${Math.round(cell * 0.66)}px ${SERIF}`;
    g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = cell * 0.12; g.fillStyle = '#fff';
    g.fillText(GLYPHS[i], x, y); g.shadowBlur = 0; g.fillText(GLYPHS[i], x, y);
  }
  atlas.t.needsUpdate = true;
}

/* ---------- shader pieces ---------- */
const NOISE = `float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * n21(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }`;
const BILL = `vec3 camR(){ return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 camU(){ return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }`;
/* The no-fly boxes: screen rects (NDC min.xy, max.zw) where the UI text lives. World text, embers and the
   constellation fade to nothing inside them, so nothing in the scene ever crosses a line of UI text. */
const NOFLY_N = 6;
const NOFLY = `uniform vec4 uNoFly[${NOFLY_N}]; uniform vec2 uRes;
float noFly(vec2 ndc){ float k = 1.0; for (int i = 0; i < ${NOFLY_N}; i++) { vec4 r = uNoFly[i]; vec2 d = max(r.xy - ndc, ndc - r.zw); k = min(k, smoothstep(0.0, 0.05, max(d.x, d.y))); } return k; }`;
const NOFLY_FRAG = `${NOFLY}
float noFlyFrag(){ return noFly(gl_FragCoord.xy / uRes * 2.0 - 1.0); }`;

/* n camera-facing quads in one draw call; attrs = { name: itemSize } */
function quads(n, attrs) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  for (const [name, size] of Object.entries(attrs)) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(n * size), size));
  g.instanceCount = n;
  return g;
}

const FLAME_VERT = `${BILL}
attribute vec3 aOff; attribute vec3 aSize; uniform float uTime; uniform float uFlare; uniform vec2 uWind; uniform float uLow;
varying vec2 vUv; varying float vSeed;
void main(){
  vUv = uv; vSeed = aSize.z;
  vec3 r = camR(); r = normalize(vec3(r.x, 0.0, r.z));
  float h = position.y + 0.5;
  float H = aSize.y * (1.0 + uFlare * 0.55) * (1.0 - uLow * 0.45);
  vec3 p = aOff + r * position.x * aSize.x * (1.0 + uFlare * 0.2) + vec3(0.0, h * H, 0.0);
  p.xz += uWind * h * h * H * 1.3;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;
const FLAME_FRAG = `${NOISE}
uniform float uTime; uniform float uFlare; uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uEdge; uniform float uPower;
varying vec2 vUv; varying float vSeed;
void main(){
  float t = uTime * (1.5 + vSeed * 0.5);
  vec2 q = vec2(vUv.x - 0.5, vUv.y);
  float n = fbm2(vec2(q.x * 3.2 + vSeed * 7.0, q.y * 2.4 - t * 1.9));
  float n2 = fbm2(vec2(q.x * 7.0 - vSeed * 3.0, q.y * 5.0 - t * 3.1));
  float y = vUv.y;
  float w = 0.4 * pow(1.0 - y, 0.8) * (0.55 + 0.45 * smoothstep(0.0, 0.22, y));
  float dx = abs(q.x + (n - 0.5) * 0.42 * y + (n2 - 0.5) * 0.08);
  float shape = smoothstep(w, w * 0.15, dx);
  float body = shape * smoothstep(1.0, 0.2, y + (n - 0.5) * 0.65) * smoothstep(0.0, 0.07, y);
  float heat = clamp(body * (0.55 + n2 * 0.9), 0.0, 1.0);
  vec3 c = mix(uEdge, uMid, smoothstep(0.08, 0.45, heat));
  c = mix(c, uCore, smoothstep(0.5, 0.95, heat));
  gl_FragColor = vec4(c * uPower * (1.0 + uFlare * 0.6), heat);
}`;

const BILLOW_VERT = `${BILL}
attribute vec4 aSeed; uniform float uTime; uniform float uMode; uniform vec3 uOrigin; uniform vec2 uWind; uniform float uPart; uniform float uBurst; uniform float uSize; uniform vec3 uFire;
varying vec2 vUv; varying float vA; varying float vSeed; varying float vAge; varying float vWarm;
void main(){
  vSeed = aSeed.w; vec3 c; float s; float a = 1.0; float rot = aSeed.w * 6.28;
  if (uMode < 0.5) { /* smoke column */
    float age = fract(uTime * 0.075 + aSeed.w); vAge = age;
    c = uOrigin + vec3((aSeed.x - 0.5) * 0.35, 0.6 + age * 6.5, (aSeed.z - 0.5) * 0.35);
    c.x += sin(uTime * 0.4 + aSeed.y * 9.0) * 0.5 * age; c.z += cos(uTime * 0.3 + aSeed.x * 7.0) * 0.4 * age;
    c.xz += uWind * age * age * 7.0;
    s = uSize * (0.45 + age * 2.6); a = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
    rot += uTime * 0.15 * (aSeed.y - 0.5);
  } else if (uMode < 1.5) { /* ground fog banks */
    float ang = aSeed.x * 6.2831853 + uTime * 0.012 * (aSeed.y - 0.5);
    float rad = 3.0 + aSeed.y * 15.0 + uPart * 14.0 * (0.4 + aSeed.z);
    s = uSize * (0.75 + aSeed.z * 0.7);
    c = vec3(cos(ang) * rad, s * 0.22, sin(ang) * rad);
    c.x += sin(uTime * 0.05 + aSeed.w * 20.0) * 1.2; c.xz += uWind * 2.0;
    a = 1.0 - uPart * 0.6; vAge = 0.0; rot = 0.0;
  } else { /* steam burst from the fire */
    float age = uBurst * (0.75 + aSeed.y * 0.5); vAge = age / 3.0;
    vec3 dir = normalize(vec3(aSeed.x - 0.5, 0.6 + aSeed.z, aSeed.w - 0.5));
    c = uOrigin + vec3(0.0, 0.5, 0.0) + dir * (1.0 - exp(-age * 2.2)) * 2.4 + vec3(0.0, age * 1.4, 0.0);
    s = uSize * (0.5 + age * 1.2); a = (age < 0.0 ? 0.0 : 1.0) * (1.0 - smoothstep(0.6, 3.0, age));
  }
  vec2 pq = vec2(position.x * cos(rot) - position.y * sin(rot), position.x * sin(rot) + position.y * cos(rot));
  vec3 p = c + camR() * pq.x * s * (uMode > 0.5 && uMode < 1.5 ? 2.2 : 1.0) + (uMode > 0.5 && uMode < 1.5 ? vec3(0.0, 1.0, 0.0) * pq.y * s * 0.55 : camU() * pq.y * s);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vA = a * smoothstep(0.6, 3.5, -mv.z);
  vWarm = 1.0 - smoothstep(0.5, 4.5, length(p.xz - uFire.xz));
  vUv = uv; gl_Position = projectionMatrix * mv;
}`;
const BILLOW_FRAG = `${NOISE}${NOFLY_FRAG}
uniform vec3 uColor; uniform vec3 uWarmCol; uniform float uOpacity; uniform float uTime; uniform float uMode;
varying vec2 vUv; varying float vA; varying float vSeed; varying float vAge; varying float vWarm;
void main(){
  vec2 q = vUv - 0.5; float r = length(q);
  float n = fbm2(vUv * 3.0 + vSeed * 13.0 + vec2(uTime * 0.03, -uTime * 0.05));
  float a = smoothstep(0.5, 0.08, r) * (0.35 + 0.9 * n);
  if (uMode > 0.5 && uMode < 1.5) a *= smoothstep(0.02, 0.4, vUv.y);
  a *= vA * uOpacity; if (a < 0.003) discard;
  vec3 c = mix(uColor, uWarmCol, vWarm * (uMode < 0.5 ? (1.0 - smoothstep(0.0, 0.25, vAge)) * 0.6 : 0.12));
  gl_FragColor = vec4(c, a * noFlyFrag());
}`;

const GLYPH_VERT = `${BILL}${NOFLY}
attribute vec3 aStart; attribute vec4 aInfo; attribute vec3 aColor; uniform float uTime; uniform vec2 uWind; uniform float uLife; uniform float uCut;
varying vec2 vUv; varying float vA; varying vec3 vC; varying float vHeat;
void main(){
  float age = uTime - aInfo.x; vUv = uv; vC = aColor; vA = 0.0; vHeat = 0.0;
  if (age < 0.0 || age > uLife) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float k = age / uLife;
  vec3 p = aStart + vec3(sin(age * 1.6 + aInfo.z * 20.0) * 0.18 * k, (1.0 - exp(-age * 1.4)) * 1.1 + age * 0.18, cos(age * 1.2 + aInfo.z * 10.0) * 0.12 * k);
  p.xz += uWind * age * age * 0.8;
  float s = aInfo.w * (0.45 + 0.55 * smoothstep(0.0, 0.14, age)) * (1.0 - k * 0.3);
  /* the whole letter fades when its centre is in a no-fly box: never half a letter */
  vec4 cc = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float nf = noFly(cc.xy / cc.w);
  p += (camR() * position.x + camU() * position.y) * s;
  float g = aInfo.y; vec2 cell = vec2(mod(g, 8.0), 7.0 - floor(g / 8.0));
  vUv = (cell + uv) / 8.0;
  vA = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.5, 1.0, k)) * nf;
  /* letters from an earlier answer go out when the step changes */
  if (aInfo.x < uCut) vA *= 1.0 - smoothstep(uCut, uCut + 0.35, uTime);
  vHeat = 1.0 - smoothstep(0.0, 0.7, age);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const GLYPH_FRAG = `uniform sampler2D uAtlas; uniform float uTime; varying vec2 vUv; varying float vA; varying vec3 vC; varying float vHeat;
void main(){ float a = texture2D(uAtlas, vUv).a * vA; if (a < 0.01) discard;
  vec3 c = mix(vC, vec3(1.0, 0.96, 0.85), vHeat * 0.75) * (1.7 + 0.25 * sin(uTime * 23.0 + vUv.x * 40.0));
  gl_FragColor = vec4(c, a); }`;

const POINTS_VERT = `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 48.0); vC = aColor; vA = aAlpha * smoothstep(0.3, 1.2, -mv.z); }`;
const POINTS_FRAG = `${NOFLY_FRAG} varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a * vA * noFlyFrag(); if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`;

const STAR_VERT = `attribute float aMag; attribute float aSeed; attribute vec3 aCol; attribute float aOrder; uniform float uTime; uniform float uOpacity; uniform float uPx; uniform float uDraw; uniform float uBig;
varying float vA; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  float on = uBig > 0.5 ? smoothstep(aOrder - 0.6, aOrder, uDraw) : 1.0;
  float flash = uBig > 0.5 ? 1.0 + 2.5 * exp(-max(0.0, uDraw - aOrder) * 3.0) * on : 1.0;
  gl_PointSize = (1.4 + aMag * (uBig > 0.5 ? 6.0 : 2.4)) * uPx * (uBig > 0.5 ? 1.0 + 0.5 * (flash - 1.0) : 1.0);
  float tw = 0.72 + 0.28 * sin(uTime * (0.7 + aSeed * 3.0) + aSeed * 80.0);
  vA = uOpacity * (0.2 + 0.8 * aMag) * tw * on * smoothstep(0.0, 0.07, normalize(position).y); vC = aCol * flash; }`;
const STAR_FRAG = `${NOFLY_FRAG} uniform float uMask; varying float vA; varying vec3 vC; void main(){ float nf = mix(1.0, noFlyFrag(), uMask); float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a = a * a + smoothstep(0.16, 0.0, d); a *= nf; if (a * vA < 0.01) discard; gl_FragColor = vec4(vC, min(1.0, a * vA)); }`;
const LINE_VERT = `attribute vec3 aA; attribute vec3 aB; attribute float aSide; attribute float aT; attribute float aIdx; uniform float uDraw; uniform float uWidth;
varying float vSide; varying float vOn; varying float vTip;
void main(){
  vec4 a = viewMatrix * modelMatrix * vec4(aA, 1.0); vec4 b = viewMatrix * modelMatrix * vec4(aB, 1.0);
  float prog = clamp(uDraw - aIdx, 0.0, 1.0);
  vec4 p = mix(a, b, aT * prog);
  vec3 d = normalize(b.xyz - a.xyz); vec3 side = normalize(cross(d, normalize(p.xyz)));
  p.xyz += side * aSide * uWidth;
  vSide = aSide; vOn = step(0.001, prog); vTip = aT * (1.0 - smoothstep(0.9, 1.0, prog));
  gl_Position = projectionMatrix * p; }`;
const LINE_FRAG = `${NOFLY_FRAG} uniform vec3 uColor; uniform float uOpacity; varying float vSide; varying float vOn; varying float vTip;
void main(){ float a = (1.0 - abs(vSide)) ; a = a * a * vOn * uOpacity * noFlyFrag(); if (a < 0.01) discard; gl_FragColor = vec4(uColor * (1.0 + vTip * 2.0), a); }`;

const MOON_FRAG = `${NOISE}
uniform float uPhase; uniform float uOpacity; uniform vec3 uTint; varying vec2 vUv;
void main(){
  vec2 m = (vUv * 2.0 - 1.0) * 3.0; float rm = length(m);
  float disc = smoothstep(1.0, 0.975, rm);
  vec3 nrm = vec3(m, sqrt(max(0.0, 1.0 - rm * rm)));
  float ang = uPhase * 6.2831853; vec3 L = normalize(vec3(sin(ang), 0.0, -cos(ang)));
  float lit = smoothstep(-0.035, 0.05, dot(nrm, L));
  float maria = fbm2(m * 1.6 + 3.0) * 0.65 + fbm2(m * 6.0 + 9.0) * 0.35;
  vec3 surf = mix(vec3(0.5, 0.52, 0.55), vec3(1.0, 0.98, 0.93), smoothstep(0.38, 0.62, maria));
  float illum = 0.5 - 0.5 * cos(ang);
  vec3 c = surf * uTint * lit * 1.55 + vec3(0.008, 0.01, 0.014);
  float out1 = max(rm - 1.0, 0.0);
  float halo = (exp(-out1 * 2.6) * 0.32 + exp(-out1 * 0.7) * 0.07) * (0.25 + 0.75 * illum) * (1.0 - disc);
  vec3 col = c * disc + mix(vec3(0.72, 0.8, 1.0), uTint, 0.6) * halo;
  gl_FragColor = vec4(col, max(disc, halo) * uOpacity);
}`;
const TEXT_FRAG = `${NOISE}${NOFLY_FRAG}
uniform sampler2D uMap; uniform vec3 uColor; uniform vec3 uHot; uniform float uOpacity; uniform float uTime; uniform float uReveal; uniform float uBurn; uniform float uOutline; uniform vec3 uLine; varying vec2 vUv;
void main(){
  vec4 tx = texture2D(uMap, vUv); float a = tx.a;
  float n = fbm2(vec2(vUv.x * 18.0, vUv.y * 5.0 - uTime * 1.6));
  float edge = smoothstep(uReveal - 0.06, uReveal, vUv.x);
  a *= 1.0 - edge;
  float burn = smoothstep(uBurn - 0.15, uBurn + 0.15, n + vUv.y * 0.3);
  a *= mix(1.0, burn, step(0.001, uBurn));
  a *= uOpacity * noFlyFrag(); if (a < 0.01) discard;
  vec3 c = mix(uColor, uHot, smoothstep(0.35, 0.95, n) * 0.55 + (1.0 - smoothstep(0.0, 0.08, abs(vUv.x - uReveal + 0.03))) * 0.8);
  c *= 1.25 + 0.35 * n;
  /* a world sky: the letters carry a dark outline and halo (drawn black in the canvas, so tx.r = 0 there) */
  c = mix(c, uLine, uOutline * (1.0 - tx.r));
  gl_FragColor = vec4(c, a);
}`;
const PLAIN_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RING_FRAG = `uniform vec3 uColor; uniform float uOpacity; uniform float uWall; varying vec2 vUv;
void main(){ float a = uWall > 0.5 ? pow(1.0 - vUv.y, 2.2) : 1.0 - abs(vUv.y * 2.0 - 1.0); a = uWall > 0.5 ? a : a * a; a *= uOpacity; if (a < 0.005) discard; gl_FragColor = vec4(uColor, a); }`;
const COALS_FRAG = `${NOISE}
uniform float uTime; uniform float uFlare; uniform vec3 uHot; varying vec2 vUv;
void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0; if (r > 1.0) discard;
  float n = fbm2(vUv * 9.0 + vec2(uTime * 0.12, -uTime * 0.07)); float cr = smoothstep(0.42, 0.75, n);
  float glow = (1.0 - smoothstep(0.1, 0.85, r)) * (0.06 + 1.1 * cr * cr) * (0.8 + 0.2 * sin(uTime * 3.0 + n * 9.0)) * (1.0 + uFlare * 0.5);
  gl_FragColor = vec4(uHot * glow, smoothstep(1.0, 0.75, r)); }`;
const SEASON_VERT = `attribute vec4 aSeed; uniform float uTime; uniform vec3 uVel; uniform vec3 uVary; uniform float uSway; uniform float uSize; uniform float uPx; uniform float uKind;
varying float vA; varying float vSeed;
void main(){
  vec3 box = vec3(22.0, 9.0, 22.0);
  vec3 v = uVel + (aSeed.wzx - 0.5) * uVary * 2.0;
  vec3 p = aSeed.xyz * box + v * uTime;
  p.x += sin(uTime * 0.9 + aSeed.w * 40.0) * uSway; p.z += cos(uTime * 0.7 + aSeed.y * 30.0) * uSway; p.y += sin(uTime * 1.3 + aSeed.x * 20.0) * uSway * 0.3;
  p.xz = mod(p.xz + box.xz * 0.5, box.xz) - box.xz * 0.5; p.y = mod(p.y, box.y);
  vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uSize * uPx / max(0.1, -mv.z), 40.0);
  float edge = max(abs(p.x), abs(p.z)) / (box.x * 0.5);
  vA = (1.0 - smoothstep(0.6, 1.0, edge)) * smoothstep(0.0, 0.1, p.y / box.y) * (1.0 - smoothstep(0.8, 1.0, p.y / box.y)) * smoothstep(0.8, 2.5, -mv.z);
  if (uKind > 2.5) vA *= pow(0.5 + 0.5 * sin(uTime * (1.1 + aSeed.w * 2.0) + aSeed.x * 60.0), 3.0);
  vSeed = aSeed.w;
}`;
const SEASON_FRAG = `uniform vec3 uColor; uniform float uOpacity; uniform float uKind; uniform float uTime; varying float vA; varying float vSeed;
void main(){ vec2 q = gl_PointCoord - 0.5; float a; vec3 c = uColor;
  if (uKind > 0.5 && uKind < 1.5) { float an = uTime * (1.0 + vSeed * 3.0) + vSeed * 30.0; q = mat2(cos(an), -sin(an), sin(an), cos(an)) * q; q.y *= 0.45 + 0.55 * abs(sin(an * 0.7)); a = smoothstep(0.5, 0.36, length(q * vec2(1.0, 2.0)));
    c = mix(uColor, vec3(0.62, 0.22, 0.08), fract(vSeed * 7.0)); c = mix(c, vec3(0.55, 0.42, 0.12), step(0.7, fract(vSeed * 13.0))); }
  else if (uKind < 0.5) { a = smoothstep(0.5, 0.15, length(q)); }
  else { a = smoothstep(0.5, 0.0, length(q)); a *= a; }
  a *= vA * uOpacity; if (a < 0.01) discard; gl_FragColor = vec4(c, a); }`;
const MOTE_VERT = `attribute vec4 aSeed; attribute vec2 aWing; uniform float uTime; uniform float uForm; uniform vec3 uSrc; uniform float uPx; uniform float uSize; uniform float uFlap;
varying float vA; varying float vCore;
void main(){
  float d = clamp((uForm - aSeed.w * 0.55) / 0.45, 0.0, 1.0); d = d * d * (3.0 - 2.0 * d);
  vec3 tgt = position;
  if (aWing.x > 0.0) tgt.y += sin(uTime * uFlap) * aWing.x * aWing.y * 0.55;
  vec3 p = mix(uSrc + (aSeed.xyz - 0.5) * 0.3, tgt, d);
  p.y += sin(d * 3.14159) * 0.9 * (0.6 + aSeed.y);
  p += (aSeed.xyz - 0.5) * 0.008 * sin(uTime * 2.0 + aSeed.w * 40.0);
  p.y += sin(uTime * 1.3 + aSeed.x * 6.0) * 0.006;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * (0.6 + 0.8 * aSeed.x) * uPx / max(0.1, -mv.z), 0.0, 32.0);
  vA = (0.75 + 0.25 * sin(uTime * 2.5 + aSeed.y * 50.0)) * smoothstep(0.0, 0.15, d + 0.15 * step(0.01, uForm));
  vCore = aSeed.z;
}`;
const MOTE_FRAG = `uniform vec3 uColor; uniform float uOpacity; varying float vA; varying float vCore;
void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r); a = a * a * vA * uOpacity; if (a < 0.01) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.95, 0.85), smoothstep(0.75, 1.0, vCore)), a); }`;

/* ---------- pet shapes: point clouds sampled from ellipsoids, local +z = facing ---------- */
function sampleShape(parts, n, r) {
  const total = parts.reduce((s, p) => s + (p.w ?? p.r[0] * p.r[1] * p.r[2] * 100 + 0.05), 0);
  const pos = []; const wing = [];
  for (const p of parts) {
    const k = Math.max(6, Math.round(n * (p.w ?? p.r[0] * p.r[1] * p.r[2] * 100 + 0.05) / total));
    for (let i = 0; i < k; i++) {
      let x; let y; let z;
      if (p.path) { const t = r(); const a = p.path; const j = Math.min(a.length - 2, Math.floor(t * (a.length - 1))); const f = t * (a.length - 1) - j; x = a[j][0] + (a[j + 1][0] - a[j][0]) * f; y = a[j][1] + (a[j + 1][1] - a[j][1]) * f; z = a[j][2] + (a[j + 1][2] - a[j][2]) * f; const th = (p.th ?? 0.03) * (1 - t * 0.6); x += (r() - 0.5) * th; y += (r() - 0.5) * th; z += (r() - 0.5) * th; }
      else if (p.tri) { let a = r(); let b = r(); if (a + b > 1) { a = 1 - a; b = 1 - b; } const [A, B, C] = p.tri; x = A[0] + (B[0] - A[0]) * a + (C[0] - A[0]) * b; y = A[1] + (B[1] - A[1]) * a + (C[1] - A[1]) * b; z = A[2] + (B[2] - A[2]) * a + (C[2] - A[2]) * b; y += (r() - 0.5) * 0.01; }
      else {
        const u = r() * 2 - 1; const th = r() * TAU; const s = Math.sqrt(1 - u * u); const rad = Math.pow(r(), 0.25);
        let lx = s * Math.cos(th) * p.r[0] * rad; let ly = u * p.r[1] * rad; let lz = s * Math.sin(th) * p.r[2] * rad;
        if (p.rx) { const c = Math.cos(p.rx); const sn = Math.sin(p.rx); const yy = ly * c - lz * sn; lz = ly * sn + lz * c; ly = yy; }
        x = p.c[0] + lx; y = p.c[1] + ly; z = p.c[2] + lz;
      }
      pos.push(x, y, z); wing.push(p.wing ? Math.abs(x) : 0, p.wing ? 1 : 0);
    }
  }
  return { pos: new Float32Array(pos), wing: new Float32Array(wing) };
}
const SHAPES = {
  hound: () => [
    { c: [0, 0.24, -0.14], r: [0.17, 0.19, 0.21] }, { c: [0, 0.44, 0.03], r: [0.13, 0.25, 0.14], rx: -0.38 },
    { c: [0, 0.66, 0.1], r: [0.08, 0.12, 0.08] }, { c: [0, 0.77, 0.15], r: [0.09, 0.085, 0.1] }, { c: [0, 0.74, 0.28], r: [0.045, 0.045, 0.085] },
    { c: [0.065, 0.87, 0.12], r: [0.028, 0.07, 0.02], rx: 0.2 }, { c: [-0.065, 0.87, 0.12], r: [0.028, 0.07, 0.02], rx: 0.2 },
    { c: [0.065, 0.18, 0.14], r: [0.035, 0.18, 0.035] }, { c: [-0.065, 0.18, 0.14], r: [0.035, 0.18, 0.035] },
    { c: [0.065, 0.02, 0.19], r: [0.04, 0.022, 0.06] }, { c: [-0.065, 0.02, 0.19], r: [0.04, 0.022, 0.06] },
    { c: [0.13, 0.05, -0.02], r: [0.05, 0.03, 0.1] }, { c: [-0.13, 0.05, -0.02], r: [0.05, 0.03, 0.1] },
    { path: [[0, 0.1, -0.32], [0.12, 0.05, -0.38], [0.24, 0.03, -0.26], [0.27, 0.03, -0.1]], th: 0.05, w: 1.2 },
  ],
  cat: () => [
    { c: [0, 0.14, -0.06], r: [0.12, 0.13, 0.15] }, { c: [0, 0.26, 0.03], r: [0.09, 0.15, 0.09], rx: -0.25 },
    { c: [0, 0.42, 0.07], r: [0.075, 0.068, 0.07] }, { c: [0, 0.405, 0.135], r: [0.03, 0.025, 0.03] },
    { tri: [[0.025, 0.46, 0.08], [0.07, 0.46, 0.06], [0.055, 0.53, 0.07]], w: 0.5 }, { tri: [[-0.025, 0.46, 0.08], [-0.07, 0.46, 0.06], [-0.055, 0.53, 0.07]], w: 0.5 },
    { c: [0.04, 0.1, 0.09], r: [0.024, 0.1, 0.024] }, { c: [-0.04, 0.1, 0.09], r: [0.024, 0.1, 0.024] },
    { path: [[0, 0.04, -0.2], [0.12, 0.03, -0.18], [0.16, 0.1, -0.05], [0.12, 0.2, 0.02]], th: 0.035, w: 1 },
  ],
  bird: () => [
    { c: [0, 0, 0], r: [0.07, 0.07, 0.17] }, { c: [0, 0.03, 0.17], r: [0.05, 0.05, 0.055] }, { c: [0, 0.02, 0.24], r: [0.012, 0.012, 0.035] },
    { tri: [[0, 0, -0.14], [0.07, 0, -0.34], [-0.07, 0, -0.34]], w: 1 },
    { tri: [[0.04, 0.01, 0.08], [0.04, 0.01, -0.08], [0.52, 0.02, -0.06]], w: 2.4, wing: true }, { tri: [[0.04, 0.01, 0.08], [0.52, 0.02, -0.06], [0.42, 0.02, 0.05]], w: 1.2, wing: true },
    { tri: [[-0.04, 0.01, 0.08], [-0.04, 0.01, -0.08], [-0.52, 0.02, -0.06]], w: 2.4, wing: true }, { tri: [[-0.04, 0.01, 0.08], [-0.52, 0.02, -0.06], [-0.42, 0.02, 0.05]], w: 1.2, wing: true },
  ],
};

/* the order the armour arrives in, and how it arrives per archetype */
const PIECES = [['ShinL', 'ShinR'], ['ThighL', 'ThighR'], ['Fauld', 'Robe'], ['Chest'], ['Tabard'], ['UpArmL', 'UpArmR'], ['ForeArmL', 'ForeArmR'], ['PauldronL', 'PauldronR', 'HeavyL', 'HeavyR'], ['Cloak'], ['Helm_great', 'Helm_sallet', 'Helm_kettle', 'Hood'], ['Horns', 'Crown']];
const ARRIVE = {
  knight: { gap: 0.3, sparks: 46, spark: 0xffd08a, glow: 0xffb050, kick: 0.035, sound: 'deflect', gain: 0.35, motes: false },
  barbarian: { gap: 0.2, sparks: 70, spark: 0xff6a2a, glow: 0xff3a10, kick: 0.07, sound: 'clang', gain: 0.4, motes: false, pairs: true },
  mage: { gap: 0.36, sparks: 34, spark: 0xb8a8ff, glow: 0xffb070, kick: 0.012, sound: 'soul', gain: 0.3, motes: true, order: [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10] },
  rogue: { gap: 0.18, sparks: 24, spark: 0xcfe0e8, glow: 0x9fd8c0, kick: 0.02, sound: 'dodge', gain: 0.4, motes: false, smoke: true },
};
const CLOTH = new Set(['Hood', 'Robe', 'Cloak', 'Tabard', 'Sleeves', 'Shroud']);
/* the enemy in the final frame: across the frame (added to 0.55), body height and head line as shares of the half frame, glow */
const NEM_SHOW_X = -0.12; const NEM_SHOW_H = 0.6; const NEM_SHOW_TOP = 0.3; const NEM_SHOW_GLOW = 0.9;
/* one colour system: every answer burns in the fire's golds (the enemy a little hotter) */
const STEP_INK = { name: 0xffc46a, born: 0xffc46a, origin: 0xffb04a, body: 0xffa040, heart: 0xffb860, enemy: 0xff8a3a, weapon: 0xffd890 };
const ELEMENT_FIRE = {
  fire: [0xfff4d0, 0xffa030, 0xff3a08, 0xff8a3a], frost: [0xf4fbff, 0x8ad8ff, 0x1a58ff, 0x8ac8ff],
  storm: [0xfaf6ff, 0xb8a6ff, 0x4a2aff, 0xb0a0ff], shadow: [0xf0d8ff, 0x9a4aff, 0x3a0a8a, 0xa070ff],
};
const NEMESIS_SOUND = { dragon: 'dragonRoar', giant: 'quake', lich: 'spawn', twin: 'spawn' };
/* ?create=off keeps the plain name carve and forge (without the letter-by-letter cut and the quench) */
const FK = (() => { try { return new URLSearchParams(location.search).get('create') === 'off' ? 1 : 0.75; } catch { return 0.75; } })(); /* the forge's beats come sooner (the first strike at 0.7 s, not 0.9 s) */
const FO = FK < 1 ? 0.475 : 0; /* and the first blow lands 0.2 s after the answer */
const CX_OLD = (() => { try { return new URLSearchParams(location.search).get('create') === 'off'; } catch { return false; } })();

/* ---------- the reveals, beat by beat (Camp.reveal) ---------- */
const HERO_RIM = 9;
const RING_COL = 0xe6b574; /* the ground ring is the UI's ember (it was the land's accent: lime in the fen) */
const ANVIL = { x: 0.55, z: 1.8 }; const ANVIL_TOP = 0.68;
const PILLAR_FRAG = `uniform vec3 uColor; uniform float uK; uniform float uTime; varying vec2 vUv;
float ph(float x){ return fract(sin(x * 127.1) * 43758.5453); }
void main(){ float y = vUv.y; float c = floor(vUv.x * 40.0); float s = 0.6 + 0.4 * sin(uTime * (2.0 + 3.0 * ph(c)) + ph(c + 7.0) * 6.283);
  float streak = mix(0.35, 1.0, ph(c + 3.0)) * s; float a = pow(1.0 - y, 1.5) * streak * uK * 0.85 + pow(1.0 - y, 7.0) * uK * 0.5;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0)); }`;
const WEATHER = [[/\b(snow\w*|ice|icy|frozen|freez\w*|cold|frost\w*|winter\w*)\b/i, 'snow'], [/\b(rain\w*|wet|humid|damp|storm\w*|drizzl\w*|monsoon|fog\w*|mist\w*|swamp\w*)\b/i, 'wet'], [/\b(hot|heat|dry|desert|sun\w*|scorch\w*|warm)\b/i, 'hot'], [/\b(wind\w*|gust\w*|breez\w*)\b/i, 'wind']];
const STAGE = {
  name: (C, R) => ({ dur: 2.6, beats: [
    [0, 'start', () => { C.shot('r-name', { rate: 2.6 }); C.expK = 1.3; }],
    [1.2, null, () => { C.expK = Math.max(C.expK, 1.2); }],
    [0.15, 'carve', () => { const s = C.anchor('name').world; C.faceTo(s.x, s.z); if (C.etch) { C.chisel = 1; return; } C.nameT = 0; C.chisel = 1; if (!R.quiet) C.burst(s.clone(), 40, 0xffc070, { speed: 1.6, up: 1.2, life: 1.0, size: 0.04, spread: 0.7 }); }],
    [2.1, null, () => C.faceHome()],
  ] }),
  sign: (C, R) => ({ dur: 3.7, beats: [
    [0, 'start', () => { C.shot('r-sign', { rate: 3.2 }); C.expK = 1.4; const p = C.actor?.root.position || V3(); const d = C.world.camera.getWorldDirection(V3()); C.faceTo(p.x + d.x * 10 - 2, p.z + d.z * 10); }],
    /* the sign is drawn again, large, in the open sky above the hero (the step's own view is the low one now) */
    [0.85, 'draw', () => { const s = C.state.sign; if (s) { C.signAt = [0.6, 0.16]; C.signK = 1.7; C.state.sign = null; const v = C.view; C.view = C.world.camera; /* placed in the camera as it IS (the aimed view put it over the tower, far left) */ try { C.setConstellation(s); } finally { C.view = v; } } C.consDraw = 0; C.consAge = 0; C.consRate = Math.max(2.6, ((C.cons?.n || 6) + 1) / 1.5); C.expK = 1.4; }],
    [1.6, null, () => { C.expK = 1.35; }],
    /* the last star is down: the sign goes to the stone (the DOM draws the thin line on this beat) and the date flares */
    [2.45, 'fall', () => { C.nameT = 0; C.chisel = 1; C.expK = 1.3; }],
    [3.2, null, () => C.faceHome()],
  ], end: () => { C.consRate = 0; C.consAge = 12.4; /* it dims before the next question's reveal */ } }),
  land: (C, R) => ({ dur: 3.7, beats: [
    [0, 'start', () => { C.shot('r-land-a', { rate: 5 }); C.expK = 0.9; if (C.biome && (C.ringT < 0 || C.ringT > 1.2)) { C.ringU.uColor.value.set(RING_COL); C.ringT = 0; C.ring.visible = true; } }],
    [0.4, 'rise', () => { C.expK = 1.3; C.shot('r-land', { rate: 1.1 }); const p = C.actor?.root.position || V3(); C.faceTo(p.x - 5, p.z - 8); C.weather(); }],
    [1.9, 'vista', () => { C.expK = 1.45; const p = C.actor?.root.position || V3(); C.faceTo(p.x + 7, p.z - 5); if (!R.quiet) C.world.flash(0.08); }],
    [2.6, null, () => { C.faceHome(); C.shot('r-land-back', { rate: 1.7 }); }],
  ] }),
  class: (C, R) => ({ dur: 3.2, beats: [
    [0, 'start', () => { C.shot('r-class', { rate: 3.4 }); C.faceCam(0.1); C.pillarU.uColor.value.set(0xffe2b0); C.pillarT = 0; C.pillar.visible = true; C.keyK = 1.7; if (!R.quiet) sfx('soul', { gain: 0.4 }); }],
    [0.6, 'peak', () => {
      const after = () => {
        if (!C.active) return; const col = (ARRIVE[C.archetype?.model] || ARRIVE[C.archetype?.id] || ARRIVE.knight).spark; C.classCol = col;
        C.pillarU.uColor.value.set(col); C.rimCol = col; C.keyK = 2.1; C.rimK = 3.4; C.orb.material.color.set(col); C.orbT = 0;
        if (R.quiet) return; const p = C.actor?.root.position || V3(); const r = C.rand;
        for (let k = 0; k < 80; k++) { const a = r() * TAU; const rr = 0.45 + r() * 0.25; C.spawn(p.x + Math.cos(a) * rr, 0.1 + r() * 0.5, p.z + Math.sin(a) * rr, -Math.sin(a) * 1.7, 1.5 + r() * 1.4, Math.cos(a) * 1.7, 1.1 + r() * 0.7, 0.04, col, { drag: 1.1, lift: 0.5 }); }
        C.world.kick(0.05);
        /* the class beat: the new body shows what it is for a moment (a caster raises the hand, the others raise a fist) */
        const act = C.actor; const m = C.archetype?.model || C.archetype?.id; void m; const clip = null; /* the caster's raised hand read as a thumbs-up: it stands calm, the glow is in its hand */
        if (act && clip) { R.state.clip = act; try { act.play(clip, { fade: 0.2 }); } catch { /* the clip is missing */ } }
      };
      let p = null; try { p = R.opts.swap?.(); } catch (err) { console.warn('class swap', err); }
      if (!R.quiet) C.world.flash(0.5);
      if (p?.then) p.then(after, after); else after();
    }],
    [1.3, 'shown', () => { C.shot('r-class-out', { rate: 1.3 }); }],
    [2.5, null, () => { C.keyCol = null; C.rimCol = null; C.faceHome(); const a = R.state.clip; if (a && a === C.actor) { try { a.play(a.has?.('Idle') ? 'Idle' : 'Unarmed_Idle', { fade: 0.35 }); } catch { /* keep the clip */ } } }],
  ], end: () => { C.keyCol = null; C.rimCol = null; } }),
  companions: (C, R) => {
    const cs = (C.companions || []).filter((c) => c.pos && !c.leaving).sort((a, b) => a.slot - b.slot);
    const beats = [[0, 'start', () => { C.shot('r-heart', { rate: 2.2 }); if (cs.length) { let x = 0; let z = 0; for (const c of cs) { x += c.pos.x; z += c.pos.z; } C.faceTo(x / cs.length, z / cs.length); } else { const s = C.seats?.[1]; if (s) C.faceTo(s.x, s.z); } }]];
    cs.forEach((c, i) => beats.push([0.4 + i * 0.55, 'arrive', () => C.arrive(c, R.quiet)]));
    beats.push([3.4, null, () => C.faceHome()]);
    return { dur: 4.0, beats };
  },
  enemy: (C, R) => ({ dur: 4.2, beats: [
    [0, 'start', () => { C.poseEnemy('arrive'); C.nemRise = Math.min(C.nemRise, 0.35); C.nemRiseTo = 0.1; C.gazeTo = 0; C.gazeK = 0; C.shot('r-enemy', { rate: 2.8 }); C.heroYaw = C.focus('r-enemy').angle + Math.PI - 0.2; C.yawHome = false; C.expK = 0.85; }],
    [0.4, 'flash', () => { C.expK = 1.3; if (!R.quiet) { C.world.flash(0.55); C.world.kick(0.05); } }],
    [0.5, 'rise', () => { C.nemRiseTo = 1; }],
    [0.8, null, () => { if (!R.quiet) C.streamWords(); }],
    [1.7, 'eyes', () => { C.gazeTo = 1; C.gazeK = 1.7; if (!R.quiet) { C.world.kick(0.07); sfx('spawn', { gain: 0.5 }); } }],
    [1.8, null, () => C.shot('r-enemy-in', { rate: 0.8 })],
  ], end: () => { C.poseEnemy('step'); C.gazeTo = 0.6; C.nemRiseTo = 1; C.faceHome(); } }),
  weapon: (C, R) => ({ dur: 6.2 * FK - FO, beats: [
    [0, 'start', () => C.forgeStart(R)],
    [0.9 * FK - FO, 'strike', () => C.forgeStrike(R, 0)], [1.6 * FK - FO, 'strike', () => C.forgeStrike(R, 1)], [2.3 * FK - FO, 'strike', () => C.forgeStrike(R, 2)],
    [2.6 * FK - FO, 'power', () => { R.state.power = true; if (!R.quiet) { sfx('fireBreath', { gain: 0.3 }); if (!CX_OLD) C.forgeQuench(R); } }],
    [4.0 * FK - FO, 'take', () => C.forgeTake(R)],
    [5.2 * FK - FO, null, () => { C.shot('r-held', { rate: 1.3 }); C.faceHome(); const a = R.state.lifted; if (a && a === C.actor) { try { if (!W.holdHero?.(a, C.weaponDef)) { if (!CX_OLD && a.has?.('Sword_Block')) a.hold('Sword_Block', 0.5, { fade: 0.25 }); else a.play(a.has?.('2H_Melee_Idle') ? '2H_Melee_Idle' : 'Idle'); } } catch { /* keep the pose */ } } }],
  ], tick: (dt, t) => C.forgeTick(R, dt, (t + FO) / FK), end: () => C.forgeEnd(R) }),
};

export class Camp {
  constructor(world) {
    this.world = world; this.time = 0; this.active = false;
    world._camp = this; /* world.js draws the sky last while no camp is up (the camp paints its own backdrop over the sky) */
    this.rand = rng(0x5eed);
    this.worldId = 'dark'; this.campMod = null; this.worldEntry = null; this.dress = null; this.swap = null; this.skyStars = 1; this.skyMoon = true; this.ccTime = { value: 0 };
  }

  /* World hook. w = the world entry (game/worlds/<id>.mjs), campMod = the world module's `camp`
     ({ build(cc) -> { fire, flame, sign: { mesh, face, w, h, style }, ground, props }, sky, exposure }) or null for dark.
     cc is the build context made by ccFor(): THREE, kit, tex, own, load, wait, FIRE, SIGN, SEATS, keepOut, onUpdate and fireLight. While the camp is up, the dressing turns over
     in 2.5 s (fog, old shrinks, new grows); before enter() it is only stored and enter() builds it at once (cards, quick start). */
  setWorld(w, campMod = null) {
    const id = w?.id || 'dark'; const mod = campMod && typeof campMod.build === 'function' ? campMod : null;
    const same = id === this.worldId && mod === this.campMod;
    this.worldId = id; this.worldEntry = w || null; this.campMod = mod;
    this.skyStars = Math.max(0, Math.min(1, mod?.sky?.stars ?? 1)); this.skyMoon = mod?.sky?.moon !== false;
    if (this.active && !same) this.turnover(true);
  }
  /* the cc context a world camp builds with (documented in the blueprint; keep the two in step) */
  ccFor(ups) {
    const keepOut = [{ x: 0, z: 0, r: 1.2 }, { x: FIRE.x, z: FIRE.z, r: 1.1 }, { x: STONE.pos.x, z: STONE.pos.z, r: 1.2 },
      ...SEATS.map(([a, d]) => ({ x: FIRE.x + Math.cos(a) * d, z: FIRE.z + Math.sin(a) * d, r: 0.6 })), ...PET_SPOTS.map(([x, z]) => ({ x, z, r: 0.5 }))];
    return {
      THREE, kit: LANDKIT, ui: this.worldEntry?.ui || {}, world: this.worldEntry, seed: hashStr(this.worldId) % 100000,
      tex: (path, srgb = false, rep = 1) => { let done; const ready = new Promise((r) => { done = r; }); const url = /^(\/|https?:)/.test(path) ? path : `/assets/${path}`;
        const t = new THREE.TextureLoader().load(url, () => done(true), undefined, () => done(false)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.userData.ready = ready; this.jobs.push(ready); return this.own(t); },
      own: (...xs) => { this.own(...xs); return xs[0]; },
      load: (url) => { const p = loadGLB(url); this.jobs.push(p.catch(() => {})); return p; },
      wait: (p) => { this.jobs.push(Promise.resolve(p).catch(() => {})); return p; },
      uTime: this.ccTime, onUpdate: (fn) => { if (typeof fn === 'function') ups.push(fn); }, fireLight: this.light,
      FIRE: FIRE.clone(), SIGN: { pos: STONE.pos.clone(), ry: STONE.ry }, SEATS: SEATS.map(([a, d]) => V3(FIRE.x + Math.cos(a) * d, 0, FIRE.z + Math.sin(a) * d)), keepOut,
    };
  }
  /* builds the world's dressing into holders; null (and one warning) when there is none or it throws */
  buildDress(mod) {
    if (!mod) return null;
    const ups = []; let r;
    try { r = mod.build(this.ccFor(ups)) || {}; } catch (err) { if (!Camp.warned) console.warn('world camp: build failed, the dark camp stays', err); Camp.warned = true; return null; }
    const isObj = (o) => o && o.isObject3D;
    const root = new THREE.Group(); root.name = 'camp-world'; this.group.add(root);
    const D = { root, ups, flame: r.flame || null, sign: null };
    if (isObj(r.fire)) { const h = new THREE.Group(); h.add(r.fire); this.fire.add(h); D.fire = h; }
    const sg = r.sign;
    if (sg && isObj(sg.mesh)) {
      const h = new THREE.Group(); h.position.copy(STONE.pos); h.rotation.y = STONE.ry; sg.mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(sg.mesh); if (box.isEmpty()) box.set(V3(-0.75, 0, -0.25), V3(0.75, 2.4, 0.25));
      h.add(sg.mesh); root.add(h); D.signH = h;
      D.sign = { mesh: sg.mesh, face: sg.face?.isMesh ? sg.face : null, w: sg.w || 1.2, h: sg.h || 1.9, style: sg.style || {}, box };
      sg.mesh.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      if (D.sign.face) this.signFaceMat(D.sign);
    }
    if (isObj(r.ground)) { const h = new THREE.Group(); h.userData.split = 'ground'; h.add(r.ground); root.add(h); D.ground = h; }
    const props = Array.isArray(r.props) ? r.props.filter(isObj) : isObj(r.props) ? [r.props] : [];
    if (props.length) { const h = new THREE.Group(); h.userData.split = 'props'; for (const o of props) h.add(o); root.add(h); D.props = h; }
    return D;
  }
  /* the name canvas on the world's sign face, fitted to the face's height (its own textures share the carving canvases) */
  signFaceMat(sign) {
    const mk = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return this.own(t); };
    const map = mk(this.face.c); const glow = mk(this.glow.c);
    const a = this.face.c.width / this.face.c.height; const f = sign.w / sign.h;
    for (const t of [map, glow]) { if (f > a) { const k = f / a; t.repeat.set(k, 1); t.offset.set((1 - k) / 2, 0); } else { const k = a / f; t.repeat.set(1, k); t.offset.set(0, (1 - k) / 2); } }
    const st = sign.style;
    const m = this.own(new THREE.MeshStandardMaterial({ map, color: st.tint ?? 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.12, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: st.glow ?? 1 }));
    sign.face.material = m; sign.mat = m; sign.tex = { map, glow };
  }
  /* the pieces that shrink or grow: a fire or a sign as one piece, ground and props piece by piece (each about its own spot) */
  piecesOf(h) {
    let list;
    if (h === this.darkGround) list = [h.children[0], ...this.rocks.children];
    else if (h.userData.split === 'ground') { const g = h.children[0]; list = g && (g.isGroup || g.type === 'Object3D') && g.children.length ? g.children.slice() : [g]; }
    else if (h.userData.split === 'props') list = h.children.slice();
    else list = [h];
    return list.filter(Boolean).map((o) => ({ o, s: o.scale.clone() }));
  }
  /* switch the dressing to this.campMod: animate = the 2.5 s turnover, else at once */
  turnover(animate = true) {
    if (this.swap) this.endSwap();
    const old = this.dress; const fresh = this.buildDress(this.campMod);
    const dark = { fire: this.pit, signH: this.stone, ground: this.darkGround, props: null };
    const outs = []; const ins = [];
    for (const k of ['fire', 'signH', 'ground', 'props']) { const a = old?.[k] || dark[k]; const b = fresh?.[k] || dark[k]; if (a === b) continue; if (a) outs.push(a); if (b) ins.push(b); }
    this.dress = fresh;
    const y1 = fresh?.flame?.y ?? 0; const s1 = fresh?.flame?.scale ?? 1;
    if (fresh?.flame?.colors?.length >= 4) { const [c0, c1, c2, c3] = fresh.flame.colors; this.fireBase = [c0, c1, c2, c3]; if (!this.state.element) { this.fireTarget = { core: new THREE.Color(c0), mid: new THREE.Color(c1), edge: new THREE.Color(c2), light: new THREE.Color(c3) }; } }
    else { this.fireBase = null; if (!this.state.element) { const [c0, c1, c2, c3] = ELEMENT_FIRE.fire; this.fireTarget = { core: new THREE.Color(c0), mid: new THREE.Color(c1), edge: new THREE.Color(c2), light: new THREE.Color(c3) }; } }
    if (!animate) {
      for (const h of outs) h.visible = false; for (const h of ins) h.visible = true;
      if (old?.root) this.dropDress(old);
      this.fireY = y1; this.flameRoot.position.y = y1; this.flameRoot.scale.setScalar(s1); this.liftSmoke(); this.useSign(); return;
    }
    const pin = ins.flatMap((h) => { h.visible = true; return this.piecesOf(h); }); for (const p of pin) p.o.scale.setScalar(0.001);
    this.swap = { t: 0, outs, ins, pout: outs.flatMap((h) => this.piecesOf(h)), pin, old, y0: this.fireY, y1, s0: this.flameRoot.scale.x, s1, fog0: this.fogU.uOpacity.value, mid: false };
    this.flare = Math.max(this.flare, 1.2); this.gust = Math.max(this.gust, 0.6); this.dimTarget = this.dimTarget || 0;
    sfx('soul', { gain: 0.5 });
  }
  stepSwap(dt) {
    const S = this.swap; S.t += dt; const t = S.t;
    /* the old dressing is gone before the new land reads (the land swaps in about half a second): out in 0.35 s under a fog swell */
    const kOut = Math.max(0.001, 1 - smooth(0.0, 0.35, t));
    for (const p of S.pout) p.o.scale.copy(p.s).multiplyScalar(kOut);
    const g = clamp01((t - 1.1) / 1.4); const kIn = g <= 0 ? 0.001 : 1 + 2.2 * Math.pow(g - 1, 3) + 1.2 * Math.pow(g - 1, 2);
    for (const p of S.pin) p.o.scale.copy(p.s).multiplyScalar(Math.max(0.001, kIn));
    this.fogU.uOpacity.value = S.fog0 + 0.5 * smooth(0.0, 0.25, t) * (1 - smooth(1.2, 2.5, t));
    const ky = smooth(0.9, 1.9, t); this.fireY = S.y0 + (S.y1 - S.y0) * ky; this.flameRoot.position.y = this.fireY; this.flameRoot.scale.setScalar(S.s0 + (S.s1 - S.s0) * ky); this.liftSmoke();
    if (!S.mid && t >= 0.36) {
      S.mid = true; for (const h of S.outs) h.visible = false; this.useSign();
      this.burst(V3(FIRE.x, 0.7 + this.fireY, FIRE.z), 120, this.fireCols.light.getHex(), { speed: 3.2, up: 3.5, life: 1.3, size: 0.045, spread: 0.35, drag: 1.4, lift: -2.5 });
      this.world.kick?.(0.05);
    }
    if (t >= 2.5) this.endSwap();
  }
  endSwap() {
    const S = this.swap; if (!S) return; this.swap = null;
    for (const p of S.pout) p.o.scale.copy(p.s); for (const p of S.pin) p.o.scale.copy(p.s);
    for (const h of S.outs) h.visible = false;
    if (!S.mid) this.useSign();
    this.fogU.uOpacity.value = S.fog0; this.fireY = S.y1; this.flameRoot.position.y = S.y1; this.flameRoot.scale.setScalar(S.s1); this.liftSmoke();
    if (S.old?.root) this.dropDress(S.old);
  }
  /* the smoke and steam start where the flames are */
  liftSmoke() { for (const u of [this.smokeU, this.steamU]) { u.uOrigin.value.y = this.fireY; u.uFire.value.y = this.fireY; } }
  dropDress(D) { for (const h of [D.fire, D.signH, D.ground, D.props]) h?.removeFromParent(); D.root.removeFromParent(); }
  /* the carving follows the sign in use: its style, its font (redrawn when the font is in) */
  useSign() {
    const sg = this.dress?.sign || null; this.signStyle = sg ? sg.style : null; this.signTex = sg?.tex || null; this.signMat = sg?.mat || null;
    const fam = sg?.style?.font;
    if (fam && document?.fonts?.load) { const job = Promise.race([Promise.all([document.fonts.load(`700 64px ${fam}`), document.fonts.load(`500 64px ${fam}`)]), new Promise((r) => setTimeout(r, 2500))]).then(() => { if (this.active && this.signStyle === sg.style) this.drawStone(); }).catch(() => {}); this.jobs.push(job); }
    this.drawStone();
  }
  /* the sign in use (the world's board or the dark stone) */
  signObj() { return this.dress?.sign ? this.dress.signH : this.stone; }

  /* ================================================================ enter / leave */
  enter(hero) {
    if (this.active) { if (hero) this.setHero(hero); return; }
    this.active = true;
    const w = this.world; const s = w.scene;
    this.group = new THREE.Group(); this.group.name = 'camp'; s.add(this.group);
    this.owned = []; this.redraws = [];
    this.flare = 0; this.gust = 0; this.windDir = new THREE.Vector2(1, 0); this.dim = 0; this.low = 0;
    this.typed = {}; this.guesses = new Map(); this.companions = []; this.assembly = null; this.seasonLock = false; this.weatherSet = null; this.mistT = -1; this.nemShow = 0; this.nemShowK = 0; this.rimCol = null; this.consRate = 0;
    this.state = { name: '', nameFinal: false, date: null, place: '', weapon: null, element: null, sign: null, age: null }; this.etch = null;
    this.burstAt = -99; this.ringT = -1; this.wordsT = -1; this.enemyT = -1; this.weaponT = -1; this.nameT = -1; this.landT = -1;
    this.jobs = [loadFont()];
    /* the designed spirit figures (questprops.js), the same ones the fight uses; plain ghosts are the fallback */
    this.QP = null; this.jobs.push(this.qpReady = import('./questprops.js').then(async (m) => { await m.preload?.(); this.QP = m; }).catch((err) => console.warn('camp companions', err)));
    /* outside the dark world the named ones are real people and a real dog (props/folk.js, the same figures the walk uses) */
    this.Folk = null; this.jobs.push(this.folkReady = import('./props/folk.js').then((m) => { this.Folk = m; }).catch((err) => console.warn('camp folk', err)));
    this.nfU = { uNoFly: { value: Array.from({ length: NOFLY_N }, () => new THREE.Vector4(9, 9, 9, 9)) }, uRes: { value: new THREE.Vector2(1, 1) } };
    this.layout = null; this.view = null; this.demo = null; this.chisel = 0;
    this.saveWorld();
    this.nightWorld();
    this.buildGround(); this.buildFire(); this.buildStone(); this.buildSky(); this.buildFog(); this.buildGlyphs(); this.buildSeason(); this.buildReveal(); this.buildSeats(); this.buildLabels(); this.buildStage();
    this.setMoon(moonPhase(new Date()), false);
    this.dress = null; this.swap = null; if (this.campMod) this.turnover(false);
    loadFont().then(() => { if (!this.active) return; drawAtlas(this.atlas); for (const f of this.redraws) f(); });
    if (hero) this.setHero(hero);
  }

  /* resolves when the fonts and the camp models are in (tests wait for it) */
  ready() { return Promise.all(this.jobs || []).then(() => new Promise((r) => { if (this.rockImg?.complete) r(); else { this.rockImg.addEventListener('load', r); setTimeout(r, 2000); } })).catch(() => {}); }

  leave() {
    if (!this.active) return;
    this.endReveal(true); this.beautyT = -1; this.beautyDone?.(); this.beautyDone = null; this.heroYaw = null;
    this.active = false; this.freeEnemy(this.world.nemesis); this.nemMode = null;
    if (this.assembly) this.finishAssembly();
    if (this.actor) this.actor.root.rotation.y = 0;
    for (const c of this.companions) this.dropCompanion(c, true);
    this.companions = [];
    this.swap = null; if (this.dress) { for (const r of [this.dress.root, this.dress.fire]) r?.traverse((o) => { if (o.isMesh || o.isPoints) { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) m?.dispose?.(); } }); this.dress = null; }
    this.group.traverse((o) => { if (o.isLight && o.shadow?.map) o.shadow.map.dispose(); });
    this.group.removeFromParent();
    for (const o of this.owned) o.dispose?.();
    this.owned = [];
    this.restoreWorld();
  }

  /* ================================================================ screen layout (main.js measures the DOM) */
  /* band: the clear rect the scene owns; noFly: the rects of UI text. CSS px of a W x H view. */
  setLayout({ W, H, band, noFly = [] }) {
    this.layout = { W, H, band, noFly };
    const u = this.nfU.uNoFly.value;
    for (let i = 0; i < NOFLY_N; i++) {
      const r = noFly[i];
      if (r) u[i].set(r.x0 / W * 2 - 1, 1 - r.y1 / H * 2, r.x1 / W * 2 - 1, 1 - r.y0 / H * 2); else u[i].set(9, 9, 9, 9);
    }
  }
  /* the camera the current step settles on: choices made once per step (seats, the sky) use it */
  setView(cam) { this.view = cam; }
  toPx(p, cam = this.world.camera, out = {}) { _v2.copy(p).project(cam); const L = this.layout; out.x = (_v2.x + 1) / 2 * L.W; out.y = (1 - _v2.y) / 2 * L.H; out.z = _v2.z; return out; }
  rectOf(points, cam = this.world.camera) {
    const r = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; const q = {};
    for (const p of points) { this.toPx(p, cam, q); if (q.z > 1) continue; r.x0 = Math.min(r.x0, q.x); r.x1 = Math.max(r.x1, q.x); r.y0 = Math.min(r.y0, q.y); r.y1 = Math.max(r.y1, q.y); }
    return r;
  }
  /* the world point on the ray through screen px (x, y), `depth` metres in front of the camera */
  fromPx(x, y, depth, cam = this.world.camera, out = V3()) {
    const L = this.layout; cam.updateMatrixWorld();
    _v2.set(x / L.W * 2 - 1, 1 - y / L.H * 2, 0.5).unproject(cam).sub(cam.position).normalize();
    const fwd = cam.getWorldDirection(_v3);
    return out.copy(cam.position).addScaledVector(_v2, depth / Math.max(0.05, _v2.dot(fwd)));
  }
  depthOf(p, cam = this.world.camera) { return _v3.copy(p).sub(cam.position).dot(cam.getWorldDirection(_v4)); }
  /* metres per CSS px at a depth */
  pxSize(depth, cam = this.world.camera) { return 2 * depth * Math.tan(cam.fov * Math.PI / 360) / this.layout.H; }
  /* what the camera must always show: the standing stone, the hero and the fire */
  framePoints(which = 'all') {
    const out = [];
    /* the card: the hero is the subject, close and low, with sky above for the enemy; the stone is not in the picture */
    if (which === 'card') {
      const sc = this.actor?.root.scale || V3(1, 1, 1); const p = this.actor?.root.position || V3();
      for (const [x, z] of [[-0.75, -0.3], [0.75, -0.3], [-0.75, 0.4], [0.75, 0.4]]) out.push(V3(p.x + x * sc.x, -0.1, p.z + z), V3(p.x + x * sc.x, 2.75 * sc.y, p.z + z));
      out.push(V3(FIRE.x + 0.45, 0, FIRE.z), V3(FIRE.x + 0.45, 0.9, FIRE.z));
      return out;
    }
    if (which === 'all' || which === 'stone') {
      const sg = this.dress?.sign;
      if (sg) { const b = sg.box; sg.mesh.updateWorldMatrix(true, false); for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(sg.mesh.localToWorld(V3(x, y, z))); }
      else { const { w, h, d } = STONE; this.stone.updateWorldMatrix(true, false);
      for (const x of [-w / 2, w / 2]) for (const y of [-0.14, h - 0.24]) for (const z of [-d / 2, d / 2]) out.push(this.stone.localToWorld(V3(x, y, z))); }
    }
    if (which === 'all' || which === 'hero' || which === 'card') {
      /* on the card the raised weapon counts too, so its tip is never cut */
      const sc = this.actor?.root.scale || V3(1, 1, 1); const p = this.actor?.root.position || V3(); const top = which === 'card' ? 3.05 : 1.95;
      for (const [x, z] of [[-0.42, -0.3], [0.42, -0.3], [-0.42, 0.35], [0.42, 0.35]]) out.push(V3(p.x + x * sc.x, 0, p.z + z), V3(p.x + x * sc.x, top * sc.y, p.z + z));
    }
    /* the card frames the hero, the fire and the named ones: the stone stays at the edge, so it no longer takes a third of the image */
    if (which === 'all' || which === 'fire' || which === 'card') {
      for (const [x, z] of [[-0.62, 0], [0.62, 0], [0, -0.62], [0, 0.62]]) out.push(V3(FIRE.x + x, 0, FIRE.z + z));
      out.push(V3(FIRE.x - 0.3, 1.3, FIRE.z), V3(FIRE.x + 0.3, 1.3, FIRE.z));
    }
    /* the ones the hero fights for, once they sit by the fire: the camera keeps them in the clear band too */
    if (which === 'all' || which === 'card') {
      for (const c of this.companions || []) {
        if (!c.pos || c.orbit || c.leaving) continue; const p = c.pos; const h = (c.labelY ?? 1.3) + 0.2;
        out.push(V3(p.x - 0.4, 0, p.z), V3(p.x + 0.4, 0, p.z), V3(p.x - 0.4, h, p.z), V3(p.x + 0.4, h, p.z));
      }
    }
    return out;
  }
  /* the named ones' screen boxes (ground to the top of the head) */
  bodyRects(cam) { return (this.companions || []).filter((c) => c.pos && !c.leaving && !c.orbit).map((c) => this.rectOf([V3(c.pos.x - 0.35, 0, c.pos.z), V3(c.pos.x + 0.35, (c.labelY ?? 1.3) - 0.1, c.pos.z)], cam)); }
  /* the enemy in the sky (world.nemesis): its screen box, measured a few times a second */
  nemRect(cam) {
    const nm = this.world.nemesis; if (!nm || nm.leaving || (nm.mats?.[0]?.opacity ?? 0) < 0.1) return null;
    if (this._nemAt != null && this.time - this._nemAt < 0.25 && this._nemCam === cam) return this._nemR;
    this._nemAt = this.time; this._nemCam = cam;
    const b = new THREE.Box3().setFromObject(nm.holder); if (b.isEmpty()) { this._nemR = null; return null; }
    const pts = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(V3(x, y, z));
    const r = this.rectOf(pts, cam); this._nemR = r.x1 > r.x0 ? { x0: r.x0 - 16, x1: r.x1 + 16, y0: r.y0 - 16, y1: r.y1 + 16 } : null; return this._nemR;
  }
  /* the screen rects of the hero, the stone and the flames: world text keeps off them */
  obstacles(cam = this.world.camera) { return ['hero', 'stone', 'fire'].map((k) => this.rectOf(this.framePoints(k), cam)); }
  /* the best of a few ground spots for a figure of height h: off the hero, the stone and the fire, inside the band */
  pickSpot(cands, h = 1.3, others = [], hw = 0.6, edge = 120) {
    const cam = this.view || this.world.camera; if (!this.layout) return cands[0];
    cam.updateMatrixWorld(); const B = this.layout.band;
    /* the spot must stay clear in the views still to come, not just this one: test it from each later step's angle */
    const centre = new THREE.Box3().setFromPoints(this.framePoints('all')).getCenter(V3()); const dist = Math.max(3, cam.position.distanceTo(centre));
    const views = [cam].concat(['enemy', 'weapon', 'forged', 'card'].map((id, k) => {
      const f = this.focus(id); const c = this._spotCams?.[k] || new THREE.PerspectiveCamera();
      (this._spotCams ||= [])[k] = c; c.fov = cam.fov; c.aspect = cam.aspect; c.near = cam.near; c.far = cam.far; c.clearViewOffset(); c.updateProjectionMatrix();
      placeCam(c, centre, f.angle, f.elev, dist); c.updateMatrixWorld(true); return c;
    }));
    /* a figure's screen box: wide enough for a seated ghost or a long dog seen from the side */
    const box = (x, z, hh, c, hw = 0.6) => this.rectOf([V3(x - hw, 0, z - hw * 0.6), V3(x + hw, 0, z + hw * 0.6), V3(x - hw, hh, z), V3(x + hw, hh, z), V3(x, 0, z - hw), V3(x, 0, z + hw)], c);
    const obsBy = views.map((c) => this.obstacles(c)); const othBy = views.map((c) => others.map((q) => box(q.x, q.z, 1.7, c)));
    let best = cands[0]; let bs = Infinity; this._spotLog = [];
    cands.forEach((cd, i) => {
      let s = i * 0.02;
      views.forEach((c, v) => {
        const r = box(cd.x, cd.z, h, c, hw); const area = Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0));
        s += (obsBy[v].reduce((a, o) => a + overlap(r, o), 0) / area) * (v === 0 ? 6 : 1.2);
        /* two of the named ones never stand in one place on screen: one would hide the other */
        s += (othBy[v].reduce((a, o) => a + overlap(r, o), 0) / area) * (v === 0 ? 24 : 4);
        /* outside the band costs little: the camera fits itself to the companions once they sit (onReframe) */
        if (v === 0) s += (Math.max(0, B.x0 - r.x0) + Math.max(0, r.x1 - B.x1) + Math.max(0, B.y0 - r.y0) + Math.max(0, r.y1 - B.y1)) / edge;
      });
      if (s < bs) { bs = s; best = cd; }
      this._spotLog.push([cd.x, cd.z, +s.toFixed(2)]);
    });
    return best;
  }
  /* the burning words of the answer: above the fire, inside the band, a fixed size on screen */
  placeLive(rise) {
    const L = this.layout; const cam = this.world.camera; const m = this.liveMesh;
    if (!L) { m.position.copy(FIRE).setY(LIVE_Y + rise * 0.35); m.lookAt(cam.position.x, m.position.y, cam.position.z); return; }
    const B = L.band; const top = this.toPx(_v.set(FIRE.x, 1.5, FIRE.z), cam);
    const depth = Math.max(1, this.depthOf(FIRE, cam));
    const wpx = Math.min(440, (B.x1 - B.x0) * 0.4); const hpx = wpx / 4;
    /* the first free spot: above the fire, then above and to the side, off the hero and the stone */
    /* off the hero, the stone, the named ones and the enemy in the sky */
    const obs = this.obstacles(cam).slice(0, 2).concat(this.bodyRects(cam), this.nemRect(cam) ? [this.nemRect(cam)] : [], this.skyRect && this.skyWords.visible && this.skyTextU.uOpacity.value > 0.05 ? [this.skyRect] : []); const clampX = (v) => Math.min(B.x1 - wpx / 2, Math.max(B.x0 + wpx / 2, v));
    const y0 = Math.max(B.y0 + hpx / 2, top.y - hpx * 0.45);
    const cands = [[0, 0], [wpx * 0.35, 0], [0, -hpx], [wpx * 0.35, -hpx], [-wpx * 0.35, -hpx], [0, -hpx * 2], [wpx * 0.5, -hpx * 2], [-wpx * 0.5, -hpx * 2], [wpx * 0.7, -hpx], [-wpx * 0.7, -hpx], [0, -hpx * 3]];
    let pick = cands[0];
    for (const [dx, dy] of cands) {
      const cx = clampX(top.x + dx); const cy = Math.max(B.y0 + hpx / 2, y0 + dy);
      const r = { x0: cx - wpx / 2, x1: cx + wpx / 2, y0: cy - hpx / 2, y1: cy + hpx / 2 };
      if (!obs.some((o) => overlap(r, o) > 0)) { pick = [dx, dy]; break; }
    }
    if (!this.livePick || this.livePick[0] !== pick[0] || this.livePick[1] !== pick[1]) this.livePick = pick;
    const x = clampX(top.x + pick[0]);
    const y = Math.max(B.y0 + hpx / 2, y0 + pick[1]) - rise * 36;
    this.fromPx(x, y, depth, cam, m.position); m.quaternion.copy(cam.quaternion);
    m.scale.setScalar(wpx * this.pxSize(depth, cam) / 1.9);
    this.liveRect = { x0: x - wpx / 2, x1: x + wpx / 2, y0: y - hpx / 2, y1: y + hpx / 2 };
  }
  /* the enemy's words across the sky: the top of the band, never wider than it */
  placeSky(drift) {
    const L = this.layout; const cam = this.world.camera; const m = this.skyWords;
    if (!L) return;
    const B = L.band; const D = 60;
    let wpx = Math.min(1000, (B.x1 - B.x0) * 0.86, (B.y1 - B.y0) * 0.4 * 4); let cx = (B.x0 + B.x1) / 2;
    /* the enemy's own figure is in the sky too: the words take the half of the band it does not fill */
    const nr = this.nemRect(cam); const full = { x0: cx - wpx / 2, x1: cx + wpx / 2, y0: B.y0, y1: B.y0 + wpx / 4 + 12 };
    if (nr && overlap(full, nr) > 0) { const half = (B.x1 - B.x0) * 0.5; wpx = Math.min(wpx, half * 0.94); cx = (nr.x0 + nr.x1) / 2 > (B.x0 + B.x1) / 2 ? B.x0 + half / 2 : B.x1 - half / 2; }
    const sk = (this._sky ||= { w: wpx, x: cx }); if (!this._skyLive) { sk.w = wpx; sk.x = cx; this._skyLive = true; } else { sk.w += (wpx - sk.w) * 0.08; sk.x += (cx - sk.x) * 0.08; }
    wpx = sk.w; cx = sk.x;
    const cy = B.y0 + wpx / 8 + 6 + Math.abs(drift); this.skyRect = { x0: cx - wpx / 2, x1: cx + wpx / 2, y0: cy - wpx / 8, y1: cy + wpx / 8 };
    this.fromPx(cx, cy, D, cam, m.position); m.quaternion.copy(cam.quaternion);
    m.scale.setScalar(wpx * this.pxSize(D, cam));
  }
  /* name labels: each sits by the figure it names, in the first free place off the hero, the stone, the fire, the UI and each other */
  layoutLabels(dt) {
    const L = this.layout; const cam = this.world.camera;
    const live = this.labels.filter((l) => l.s.visible && l.anchor);
    if (!live.length) return;
    if (!L) { for (const l of live) { l.s.position.copy(l.anchor); l.m.opacity = l.alpha ?? 0; } return; }
    const obs = this.obstacles(cam).concat(L.noFly); const placed = []; const B = L.band;
    if (this.liveRect && this.liveText && this.liveU.uOpacity.value > 0.05) obs.push(this.liveRect);
    if (this.skyRect && this.skyWords.visible && this.skyTextU.uOpacity.value > 0.05) obs.push(this.skyRect);
    const th = Math.round(Math.max(L.H < 480 ? 16 : 22, Math.min(34, L.H * 0.032)) /* a phone on its side is 390 px high: 22 px names were huge there */ * (this.labelScale || 1));
    /* a name sits on the head of the figure it names and nowhere else (the free-place search made names wander and swap) */
    if (!this.cardLabels) {
      for (const l of live) {
        const a = this.toPx(l.anchor, cam); const k = th / ((l.fs || 64) * 0.72); const depth = Math.max(0.5, this.depthOf(l.anchor, cam)); const s = this.pxSize(depth, cam) * k;
        const tw = (l.tw || 200) * k + 14; const ax = CX_OLD || B.x1 - B.x0 < tw ? a.x : Math.min(B.x1 - tw / 2, Math.max(B.x0 + tw / 2, a.x)); /* a name near the edge slides in (WREN, ASH were cut at a phone's edge) */
        this.fromPx(ax, a.y - th * 0.9, depth, cam, l.s.position); l.s.scale.set(512 * s, 128 * s, 1); l.m.opacity = l.alpha ?? 0; l.px = null;
      }
      return;
    }
    /* a name never sits on another one's body: each figure is an obstacle for every label but its own */
    const bodies = (this.companions || []).filter((c) => c.pos && !c.leaving).map((c) => ({ label: c.label, r: this.rectOf([V3(c.pos.x - 0.35, c.orbit ? c.pos.y - 0.2 : 0, c.pos.z), V3(c.pos.x + 0.35, (c.orbit ? c.pos.y : 0) + (c.labelY ?? 1.3) - 0.1, c.pos.z)], cam) }));
    for (const l of live) {
      /* every body counts, its own too: a name sits above its figure, never through it */
      const obsL = obs.concat(bodies.map((b) => b.r));
      const a = this.toPx(l.anchor, cam); const k = th / ((l.fs || 64) * 0.72);
      const tw = (l.tw || 200) * k + 16; const hh = th * 1.5;
      const at = (dx, dy) => ({ x0: a.x + dx - tw / 2, x1: a.x + dx + tw / 2, y0: a.y + dy - hh / 2, y1: a.y + dy + hh / 2 });
      const free = (r) => r.x0 >= B.x0 && r.x1 <= B.x1 && r.y0 >= B.y0 && r.y1 <= B.y1 && !obsL.some((o) => overlap(r, o) > 0) && !placed.some((o) => overlap(r, o) > 0);
      const side = tw / 2 + 24;
      /* a name near the band's edge slides inward first, so it stays over the figure it names rather than jumping above someone else */
      const ox = Math.min(0, B.x1 - (a.x + tw / 2)) + Math.max(0, B.x0 - (a.x - tw / 2));
      /* on the card every name sits just above its own figure: no far jumps */
      const cands = this.cardLabels ? [[ox, -hh * 0.3], [ox, -hh], [ox, hh * 0.3], [ox, -hh * 1.7]] : [[ox, -hh * 0.35], [ox, -hh], [ox, -hh * 2], [-side, 0], [side, 0], [ox, -hh * 3], [-side, -hh], [side, -hh], [ox, hh], [-side, hh], [side, hh]];
      let pick = l.pick >= 0 && cands[l.pick] && free(at(...cands[l.pick])) ? l.pick : cands.findIndex(([dx, dy]) => free(at(dx, dy)));
      /* nowhere off every body: then only off the hero, the stone, the fire and the UI, so the name still shows */
      if (pick < 0) { const loose = (r) => r.x0 >= B.x0 && r.x1 <= B.x1 && r.y0 >= B.y0 && r.y1 <= B.y1 && !obs.some((o) => overlap(r, o) > 0) && !placed.some((o) => overlap(r, o) > 0); pick = cands.findIndex(([dx, dy]) => loose(at(dx, dy))); }
      if (pick < 0 && this.cardLabels) pick = 0;
      l.pick = pick;
      const want = pick >= 0 ? 1 : 0; l.fit = (l.fit ?? want) + (want - (l.fit ?? want)) * Math.min(1, dt * 6);
      if (pick < 0) { l.m.opacity = (l.alpha ?? 0) * l.fit; continue; }
      const r = at(...cands[pick]); placed.push(r);
      const tx = (r.x0 + r.x1) / 2; const ty = (r.y0 + r.y1) / 2;
      if (!l.px || l.snap) { l.px = { x: tx, y: ty }; l.snap = false; } else { const q = Math.min(1, dt * 8); l.px.x += (tx - l.px.x) * q; l.px.y += (ty - l.px.y) * q; }
      const depth = Math.max(0.5, this.depthOf(l.anchor, cam)); const s = this.pxSize(depth, cam) * k;
      this.fromPx(l.px.x, l.px.y, depth, cam, l.s.position); l.s.scale.set(512 * s, 128 * s, 1);
      l.m.opacity = (l.alpha ?? 0) * l.fit;
    }
  }

  /* what this module changes on the world, so leave() can put it back */
  saveWorld() {
    const w = this.world;
    this.saved = {
      env: w.scene.environmentIntensity, sun: w.sun.position.clone(), rim: w.rim.color.clone(), gritFloor: w.gritFloor ?? 0, exposure: w.target.exposure,
      landLight: w.landLight, map: w.ground.material.map, normalMap: w.ground.material.normalMap,
    };
  }
  restoreWorld() {
    const w = this.world; const s = this.saved;
    w.scene.environmentIntensity = s.env; w.sun.position.copy(s.sun); w.rim.color.copy(s.rim); w.gritFloor = s.gritFloor;
    if (w.landLight === this.fakeLight) w.landLight = s.landLight;
    if (this.bleed && w.lands.skyTarget === this.bleed.sky) { this.bleed.sky.band = this.bleed.band; this.bleed.sky.bandCol.copy(this.bleed.bandCol); }
    if (this.bleed && w.biome === this.bleed.biome) { w.target.bottom.set(w.biome.sky[1]); w.target.fog.set(w.biome.fog); }
    if (!w.biome) { w.ground.material.map = s.map; w.ground.material.normalMap = s.normalMap; w.ground.material.needsUpdate = true; }
  }
  /* night from the first frame: no white void, before any land is chosen */
  nightWorld() {
    const w = this.world;
    w.scene.environmentIntensity = 0.16;
    w.sun.position.copy(MOON_DIR).multiplyScalar(34).setY(26);
    w.rim.color.set(0x7d93c8);
    w.gritFloor = 1;
    if (w.biome) return;
    /* the first night is a readable blue hour, not a black void (the name step was 97 % under a quarter luma) */
    const night = { top: 0x070c1c, bottom: 0x2c3c60, fog: 0x1e2a42, ground: 0x5a5852, light: 0x9ab0e0 };
    for (const [k, v] of Object.entries(night)) { w.target[k].set(v); w.col[k].set(v); }
    w.target.fogNear = 7; w.target.fogFar = 62; w.scene.fog.near = 7; w.scene.fog.far = 62;
    w.scene.fog.color.copy(w.col.fog); w.scene.background.copy(w.col.fog);
    w.target.exposure = 1.75; w.renderer.toneMappingExposure = 1.75;
    this.fakeLight = { hemi: 0.8, sun: 0.85, offset: V3(14, 26, 10), exposure: 1.75, fog: [9, 70] };
    w.landLight = this.fakeLight;
    const gm = w.ground.material; gm.map = w.groundTex.map; gm.normalMap = w.groundTex.normalMap; gm.normalScale = new THREE.Vector2(1.2, 1.2); gm.needsUpdate = true;
    w.ground.material.color.copy(w.col.ground);
  }

  /* ================================================================ building */
  own(...xs) { this.owned.push(...xs); return xs[0]; }
  tex(file, srgb, rep = 1) {
    let done; const ready = new Promise((r) => { done = r; });
    const t = new THREE.TextureLoader().load(`/assets/ground/${file}`, () => done(true), undefined, () => done(false));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.userData.ready = ready; return this.own(t);
  }
  /* never a flat, untextured mesh: a mesh shows only when every map it uses has loaded */
  showWhen(mesh, ...waits) { mesh.visible = false; const p = Promise.all(waits.map((w) => w?.userData?.ready ?? w)).then((ok) => { if (this.active && ok.every((x) => x !== false)) mesh.visible = true; }); this.jobs.push(p); return mesh; }

  buildGround() {
    /* scorched earth and ash under the fire */
    const g = this.own(new THREE.CircleGeometry(2.4, 48)); g.rotateX(-Math.PI / 2);
    const m = this.own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } }, vertexShader: PLAIN_VERT,
      fragmentShader: `${NOISE} varying vec2 vUv; void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0; float n = fbm2(vUv * 7.0); float a = (1.0 - smoothstep(0.25, 1.0, r + (n - 0.5) * 0.5)) * 0.85; gl_FragColor = vec4(vec3(0.02, 0.018, 0.016) + vec3(0.05, 0.04, 0.035) * n, a); }`,
    }));
    this.darkGround = new THREE.Group(); this.group.add(this.darkGround);
    const ash = new THREE.Mesh(g, m); ash.position.copy(FIRE).setY(0.012); ash.renderOrder = 1; this.darkGround.add(ash);
    /* a few scanned boulders hold the camp in place */
    this.rocks = new THREE.Group(); this.darkGround.add(this.rocks);
    this.jobs.push(loadGLB('/assets/real/namaqualand_boulder_04.glb').then((gltf) => {
      if (!this.active) return;
      const spots = [[-5.2, -3.6, 1.3, 0.6], [4.6, -4.4, 1.7, 2.1], [-6.4, 2.6, 0.9, 4.0], [6.8, 1.4, 1.1, 1.0], [-1.0, -6.8, 2.2, 5.1]];
      for (const [x, z, sc, ry] of spots) { const o = gltf.scene.clone(true); o.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.material = n.material.clone(); n.material.color.multiplyScalar(0.62); n.material.envMapIntensity = 0.15; this.own(n.material); } }); o.scale.setScalar(sc * 0.55); o.position.set(x, -0.12 * sc, z); o.rotation.y = ry; this.rocks.add(o); }
    }));
    /* a low dark hill line on the horizon until a land arrives */
    const N = 360; const pos = []; const idx = []; const R = 190; const r = rng(77);
    const ph = [r() * 9, r() * 9, r() * 9];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU; const h = 4 + 5 * (0.5 + 0.5 * Math.sin(a * 3 + ph[0])) * (0.6 + 0.4 * Math.sin(a * 7 + ph[1])) + 2.2 * Math.sin(a * 19 + ph[2]) + 0.8 * Math.sin(a * 53);
      pos.push(Math.cos(a) * R, -20, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
      if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const hg = this.own(new THREE.BufferGeometry()); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setIndex(idx);
    this.hillMat = this.own(new THREE.MeshBasicMaterial({ color: 0x080b12, fog: false, side: THREE.DoubleSide, transparent: true, opacity: 1 }));
    this.hills = new THREE.Mesh(hg, this.hillMat); this.hills.renderOrder = -6; this.group.add(this.hills);
  }

  buildFire() {
    const f = new THREE.Group(); f.position.copy(FIRE); this.group.add(f); this.fire = f;
    /* pit = the dark fire's body (stone ring + logs), flameRoot = coals, flames and halo (a world camp lifts them onto its brazier) */
    const pit = new THREE.Group(); f.add(pit); this.pit = pit; const fr = new THREE.Group(); f.add(fr); this.flameRoot = fr; this.fireY = 0;
    this.jobs.push(loadGLB('/assets/real/stone_fire_pit.glb').then((gltf) => {
      if (!this.active) return;
      const o = gltf.scene.clone(true); o.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(o); const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const s = 1.3 / size; o.scale.setScalar(s); o.position.set(-(box.max.x + box.min.x) / 2 * s, -box.min.y * s - 0.03, -(box.max.z + box.min.z) / 2 * s);
      o.traverse((n) => { if (n.isMesh) { n.castShadow = false; n.receiveShadow = true; n.material = n.material.clone(); n.material.color.multiplyScalar(0.32); n.material.roughness = 1; n.material.envMapIntensity = 0.05; n.material.side = THREE.FrontSide; this.own(n.material); } });
      pit.add(o);
    }));
    /* logs in a teepee, charred */
    const logs = new THREE.Group(); pit.add(logs);
    const bark = this.own(new THREE.MeshStandardMaterial({ map: this.tex('bark_brown_02_diff.jpg', true), normalMap: this.tex('bark_brown_02_nor.jpg', false), color: 0x0e0b09, roughness: 1, envMapIntensity: 0.02, emissive: 0xff3a08, emissiveIntensity: 0 }));
    bark.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= smoothstep(0.02, 0.004, dot(diffuseColor.rgb, vec3(0.33)));'); };
    this.barkMat = bark;
    const lg = this.own(new THREE.CylinderGeometry(0.06, 0.085, 0.9, 8, 1)); lg.rotateZ(Math.PI / 2);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; const m = new THREE.Mesh(lg, bark); m.position.set(Math.cos(a) * 0.2, 0.09 + (i % 2) * 0.06, Math.sin(a) * 0.2); m.rotation.set(0, -a, (i % 2 ? 0.22 : 0.12)); m.castShadow = true; logs.add(m); }
    this.showWhen(logs, bark.map, bark.normalMap);
    /* glowing coals */
    this.coalMat = this.own(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uFlare: { value: 0 }, uHot: { value: new THREE.Color(0xff5a14).multiplyScalar(2.2) } }, vertexShader: PLAIN_VERT, fragmentShader: COALS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const cg = this.own(new THREE.CircleGeometry(0.34, 32)); cg.rotateX(-Math.PI / 2);
    const coals = new THREE.Mesh(cg, this.coalMat); coals.position.y = 0.05; coals.renderOrder = 2; fr.add(coals);
    /* flames: four billboards in one draw call */
    const fl = this.own(quads(5, { aOff: 3, aSize: 3 }));
    const offs = [[0, 0.02, 0, 0.62, 1.55, 0.1], [0.14, 0.02, 0.08, 0.45, 1.05, 0.4], [-0.15, 0.02, -0.05, 0.48, 1.15, 0.7], [0.03, 0.02, -0.16, 0.4, 0.9, 0.95], [-0.05, 0.02, 0.14, 0.36, 0.8, 0.25]];
    offs.forEach((o, i) => { fl.attributes.aOff.setXYZ(i, o[0], o[1], o[2]); fl.attributes.aSize.setXYZ(i, o[3], o[4], o[5]); });
    const [core, mid, edge, light] = ELEMENT_FIRE.fire;
    this.flameU = { uTime: { value: 0 }, uFlare: { value: 0 }, uWind: { value: new THREE.Vector2() }, uLow: { value: 0 }, uPower: { value: 1.25 }, uCore: { value: new THREE.Color(core) }, uMid: { value: new THREE.Color(mid) }, uEdge: { value: new THREE.Color(edge) } };
    this.fireCols = { core: new THREE.Color(core), mid: new THREE.Color(mid), edge: new THREE.Color(edge), light: new THREE.Color(light) };
    const fm = this.own(new THREE.ShaderMaterial({ uniforms: this.flameU, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const flames = new THREE.Mesh(fl, fm); flames.frustumCulled = false; flames.renderOrder = 5; fr.add(flames);
    /* a halo of warm air around the fire */
    const hm = this.own(new THREE.SpriteMaterial({ map: this.own(haloTexture()), color: 0xff7a2a, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.halo = new THREE.Sprite(hm); this.halo.scale.set(3.6, 3.6, 1); this.halo.position.y = 0.75; this.halo.renderOrder = 4; fr.add(this.halo);
    /* the light: one point light with a shadow, made once here */
    this.light = new THREE.PointLight(0xff8a3a, 30, 22, 2);
    this.light.position.set(FIRE.x, 0.95, FIRE.z); this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024); this.light.shadow.bias = -0.004; this.light.shadow.normalBias = 0.03; this.light.shadow.camera.near = 0.2; this.light.shadow.camera.far = 16; this.light.shadow.radius = 4;
    this.group.add(this.light);
    /* embers and sparks: a CPU pool drawn as one Points */
    const N = 900; this.emb = { n: N, i: 0, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), drag: new Float32Array(N), lift: new Float32Array(N), col: new Float32Array(N * 3), size: new Float32Array(N), alpha: new Float32Array(N), base: new Float32Array(N) };
    const eg = this.own(new THREE.BufferGeometry());
    eg.setAttribute('position', new THREE.BufferAttribute(this.emb.pos, 3).setUsage(THREE.DynamicDrawUsage));
    eg.setAttribute('aColor', new THREE.BufferAttribute(this.emb.col, 3).setUsage(THREE.DynamicDrawUsage));
    eg.setAttribute('aSize', new THREE.BufferAttribute(this.emb.size, 1).setUsage(THREE.DynamicDrawUsage));
    eg.setAttribute('aAlpha', new THREE.BufferAttribute(this.emb.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.pointU = { uScale: { value: 400 }, ...this.nfU };
    const em = this.own(new THREE.ShaderMaterial({ uniforms: this.pointU, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.embPts = new THREE.Points(eg, em); this.embPts.frustumCulled = false; this.embPts.renderOrder = 6; this.group.add(this.embPts);
    this.emitAcc = 0;
    /* smoke column and steam burst share one material shape */
    this.smokeU = this.billowU(0, 1.0, 0x3a3c42, 0.26); this.smokeU.uOrigin.value.copy(FIRE);
    const sm = this.own(new THREE.ShaderMaterial({ uniforms: this.smokeU, vertexShader: BILLOW_VERT, fragmentShader: BILLOW_FRAG, transparent: true, depthWrite: false }));
    const sg = this.own(quads(26, { aSeed: 4 })); this.fillSeeds(sg, 26, 11);
    const smoke = new THREE.Mesh(sg, sm); smoke.frustumCulled = false; smoke.renderOrder = 3; this.group.add(smoke);
    this.steamU = this.billowU(2, 1.1, 0xd8dce4, 0.0); this.steamU.uOrigin.value.copy(FIRE); this.steamU.uBurst.value = 99;
    const stm = this.own(new THREE.ShaderMaterial({ uniforms: this.steamU, vertexShader: BILLOW_VERT, fragmentShader: BILLOW_FRAG, transparent: true, depthWrite: false }));
    const stg = this.own(quads(30, { aSeed: 4 })); this.fillSeeds(stg, 30, 23);
    const steam = new THREE.Mesh(stg, stm); steam.frustumCulled = false; steam.renderOrder = 7; this.group.add(steam);
  }
  billowU(mode, size, color, opacity) {
    return { uTime: { value: 0 }, uMode: { value: mode }, uOrigin: { value: V3() }, uWind: { value: new THREE.Vector2() }, uPart: { value: 0 }, uBurst: { value: 0 }, uSize: { value: size }, uFire: { value: FIRE.clone() },
      uColor: { value: new THREE.Color(color) }, uWarmCol: { value: new THREE.Color(0xff8a40).multiplyScalar(0.55) }, uOpacity: { value: opacity }, ...this.nfU }; /* smoke and steam stay off the UI text */
  }
  fillSeeds(g, n, seed) { const r = rng(seed); const a = g.attributes.aSeed; for (let i = 0; i < n; i++) a.setXYZW(i, r(), r(), r(), r()); }

  buildStone() {
    const { w, h, d } = STONE;
    const geo = this.own(new THREE.BoxGeometry(w, h, d, 10, 16, 3));
    const p = geo.attributes.position; const r = rng(901);
    const nz = (x, y, z) => Math.sin(x * 3.1 + y * 1.7) * 0.5 + Math.sin(y * 4.3 - z * 5.1 + 1.3) * 0.3 + Math.sin(x * 9.1 + z * 7.7 + y * 2.9) * 0.2;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i); let y = p.getY(i) + h / 2; let z = p.getZ(i);
      const front = z > d / 2 - 0.001 && Math.abs(x) < w / 2 - 0.12 && y > 0.1 && y < h - 0.2 ? 1 : 0;
      const amp = front ? 0.006 : 0.07;
      const t = y / h; const taper = 1 - 0.22 * t * t;
      x *= taper; z *= 1 - 0.25 * t;
      if (t > 0.8) { const k = (t - 0.8) / 0.2; y -= k * k * (Math.abs(x) / (w / 2)) * 0.32 + k * Math.max(0, -x) * 0.12; }
      x += nz(x, y, z) * amp; z += nz(z + 3, y, x) * amp * (front ? 0.5 : 1); y += nz(y, x, z + 5) * amp * 0.4;
      p.setXYZ(i, x, y - 0.14, z);
    }
    geo.computeVertexNormals();
    const rock = { map: this.tex('seaside_rock_diff.jpg', true), normalMap: this.tex('seaside_rock_nor.jpg', false) };
    const side = this.own(new THREE.MeshStandardMaterial({ ...rock, color: 0x9a968e, roughness: 1, envMapIntensity: 0.12 }));
    side.normalScale = new THREE.Vector2(1.5, 1.5);
    /* the front face: rock + carving in its own colour map, the glow in its emissive map */
    this.face = canvasTex(1024, 1650); this.glow = canvasTex(1024, 1650);
    const front = this.own(new THREE.MeshStandardMaterial({ map: this.face.t, normalMap: rock.normalMap, color: 0xb0aba2, roughness: 0.95, envMapIntensity: 0.12, emissive: 0xffffff, emissiveMap: this.glow.t, emissiveIntensity: 1 }));
    this.own(this.face.t, this.glow.t);
    this.stoneMat = front;
    const stone = new THREE.Mesh(geo, [side, side, side, side, front, side]);
    stone.position.copy(STONE.pos); stone.rotation.set(-0.03, STONE.ry, 0.035); stone.castShadow = true; stone.receiveShadow = true;
    this.group.add(stone); this.stone = stone;
    this.rockImg = new Image(); const img = new Promise((r) => { this.rockImg.onload = () => { this.drawStone(); r(true); }; this.rockImg.onerror = () => r(false); }); this.rockImg.src = '/assets/ground/seaside_rock_diff.jpg';
    this.showWhen(stone, rock.map, rock.normalMap, img);
    this.redraws.push(() => this.drawStone());
    this.drawStone();
  }
  /* the carving: sigil, name, date in Roman numerals, place, weapon */
  drawStone() {
    const { c, g } = this.face; const gl = this.glow.g; const W = c.width; const H = c.height; const st = this.state;
    const ss = this.signStyle; const fam = ss?.font || SERIF; const groove = ss?.groove || 'rgba(8,6,5,0.88)'; const lip = ss?.lip || 'rgba(255,236,210,0.16)';
    if (ss) { const bg = ss.bg ?? '#3a2e24'; if (typeof bg === 'function') { try { bg(g, W, H); } catch (err) { g.fillStyle = '#3a2e24'; g.fillRect(0, 0, W, H); } } else if (typeof bg === 'string') { g.fillStyle = bg; g.fillRect(0, 0, W, H); } else { g.drawImage(bg, 0, 0, W, H); } }
    else g.fillStyle = '#6a6862', g.fillRect(0, 0, W, H);
    if (!ss && this.rockImg?.complete && this.rockImg.naturalWidth) { g.save(); g.scale(W / 1024, W / 1024); g.drawImage(this.rockImg, 0, 0, 1024, 1024); g.drawImage(this.rockImg, 0, 1024, 1024, 1024); g.restore(); }
    gl.fillStyle = '#000'; gl.fillRect(0, 0, W, H);
    const lines = [];
    const name = (st.name || '').trim();
    const na = st.nameAlpha ?? 1;
    if (name && na > 0) lines.push({ text: name.toUpperCase(), y: 0.43, size: CX_OLD ? 210 : 300, weight: 700, glow: st.nameFinal ? '#ffc070' : '#c2702a', alpha: (st.nameFinal ? 1 : 0.85) * na, carve: na, cut: st.nameCut ?? null });
    if (st.date) lines.push({ text: st.date, y: 0.53, size: 74, weight: 500, glow: '#b8c8ff', alpha: 0.9, spacing: 6 });
    if (st.place) lines.push({ text: st.place.toUpperCase(), y: 0.615, size: 84, weight: 500, glow: '#ffb070', alpha: 0.85, spacing: 4 });
    if (st.weapon) lines.push({ text: st.weapon.toUpperCase(), y: 0.73, size: 92, weight: 700, glow: st.weaponCol || '#ffffff', alpha: 1, spacing: 3 });
    /* the sigil, drawn from the letters of the name; one ring per decade of age */
    const cx = W / 2; const cy = H * 0.2; const R = 150;
    const sig = (ctx, color, wgt) => {
      ctx.strokeStyle = color; ctx.lineWidth = wgt; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      const rings = st.age ? Math.min(9, Math.floor(st.age / 10)) : 0;
      for (let i = 0; i < rings; i++) { ctx.beginPath(); ctx.arc(cx, cy, R + 16 + i * 9, 0, TAU); ctx.globalAlpha *= 0.85; ctx.stroke(); }
      ctx.globalAlpha = 1;
      const key = name ? name.toUpperCase().replace(/[^A-Z]/g, '') : 'SAGE';
      const pts = []; for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i / 9) * TAU; pts.push([cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86]); }
      ctx.beginPath();
      for (let i = 0; i < key.length; i++) { const q = pts[(key.charCodeAt(i) - 65) % 9]; if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
      if (key.length) { const q = pts[(key.charCodeAt(0) - 65) % 9]; ctx.beginPath(); ctx.arc(q[0], q[1], wgt * 2.2, 0, TAU); ctx.fillStyle = color; ctx.fill(); }
    };
    /* carved: dark groove with a lit lower lip. A blank stone (no name yet) has no sigil: a mark before any answer read as a stale save */
    if (name && st.nameCut == null) { g.save(); g.globalAlpha = 0.85; sig(g, ss ? groove : 'rgba(12,10,8,0.85)', 9); g.translate(2, 3); g.globalAlpha = 0.25; sig(g, ss ? lip : 'rgba(255,240,220,0.5)', 4); g.restore(); }
    /* the title: a short carved prompt, cut but unlit, where the name will go */
    if (!name && st.prompt) {
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, st.prompt, 600, 96, W * 0.7, fam); if ('letterSpacing' in g) g.letterSpacing = '14px';
      g.globalAlpha = 0.8; g.fillStyle = 'rgba(8,6,5,0.85)'; g.fillText(st.prompt, W / 2, H * 0.43); g.fillStyle = 'rgba(255,236,210,0.14)'; g.fillText(st.prompt, W / 2 + 2, H * 0.43 + 4);
      g.globalAlpha = 0.5; g.fillStyle = 'rgba(8,6,5,0.8)'; g.fillRect(W * 0.3, H * 0.475, W * 0.4, 5); g.restore();
      /* a faint ember in the cut, so it reads at night, far below the glow a real name gets */
      gl.save(); gl.textAlign = 'center'; gl.textBaseline = 'middle'; fitFont(gl, st.prompt, 600, 96, W * 0.7, fam); if ('letterSpacing' in gl) gl.letterSpacing = '14px';
      /* the carved question glows like the name will: readable from the title frame */
      gl.globalAlpha = 0.95; gl.shadowColor = '#ff9a40'; gl.shadowBlur = 26; gl.fillStyle = '#ffc070'; gl.fillText(st.prompt, W / 2, H * 0.43); gl.restore();
    }
    if (name && st.nameCut == null) { gl.save(); gl.shadowColor = st.nameFinal ? '#ff9a40' : '#a85020'; gl.shadowBlur = 24; gl.globalAlpha = st.nameFinal ? 0.9 : 0.55; sig(gl, st.nameFinal ? '#ffb060' : '#b05a20', 7); gl.restore(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; gl.textAlign = 'center'; gl.textBaseline = 'middle';
    for (const L of lines) {
      const y = H * L.y;
      for (const ctx of [g, gl]) { fitFont(ctx, L.text, L.weight, L.size, W * 0.84, fam); if ('letterSpacing' in ctx) ctx.letterSpacing = `${L.spacing || 2}px`; }
      /* a line being cut shows only its first L.cut letters; the newest letter burns white-hot */
      let cutX = null;
      if (L.cut != null) { const tw = g.measureText(L.text).width; const x0 = W / 2 - tw / 2; const xs = []; for (let k = 0; k <= L.text.length; k++) xs.push(x0 + g.measureText(L.text.slice(0, k)).width); this.etchXs = xs.map((x) => x / W); cutX = xs[Math.min(L.cut, L.text.length)]; for (const ctx of [g, gl]) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cutX, H); ctx.clip(); } }
      g.globalAlpha = L.carve ?? 1; g.fillStyle = groove; g.fillText(L.text, W / 2, y);
      g.fillStyle = lip; g.fillText(L.text, W / 2 + 2, y + 4); g.globalAlpha = 1;
      gl.save(); gl.globalAlpha = L.alpha; gl.shadowColor = L.glow; gl.shadowBlur = 30; gl.fillStyle = L.glow; gl.fillText(L.text, W / 2, y); gl.shadowBlur = 0; gl.globalAlpha = L.alpha * 0.9; gl.fillStyle = mixHex(L.glow, '#ffffff', 0.45); gl.fillText(L.text, W / 2, y); gl.restore();
      if (cutX != null) { g.restore(); gl.restore(); if (L.cut > 0) { const a = this.etchXs[L.cut - 1] * W; gl.save(); gl.beginPath(); gl.rect(a, 0, cutX - a + 6, H); gl.clip(); gl.shadowColor = '#fff2d0'; gl.shadowBlur = 56; gl.fillStyle = '#ffffff'; gl.fillText(L.text, W / 2, y); gl.fillText(L.text, W / 2, y); gl.restore(); } }
    }
    this.face.t.needsUpdate = true; this.glow.t.needsUpdate = true;
    if (this.signTex) { this.signTex.map.needsUpdate = true; this.signTex.glow.needsUpdate = true; }
  }

  buildSky() {
    const sky = new THREE.Group(); this.group.add(sky); this.sky = sky;
    /* a fixed field of stars over the upper sky */
    const N = 2200; const r = rng(4242); const pos = new Float32Array(N * 3); const mag = new Float32Array(N); const seed = new Float32Array(N); const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const y = Math.pow(r(), 0.8) * 0.97 + 0.02; const a = r() * TAU; const s = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * s * SKY_R, y * SKY_R, Math.sin(a) * s * SKY_R], i * 3);
      mag[i] = Math.pow(r(), 5); seed[i] = r(); _c.setHSL(0.58 + (r() - 0.5) * 0.18, 0.35 * r(), 0.82); col.set([_c.r, _c.g, _c.b], i * 3);
    }
    const g = this.own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aOrder', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.starU = { uTime: { value: 0 }, uOpacity: { value: 1 }, uPx: { value: 1 }, uDraw: { value: 0 }, uBig: { value: 0 }, uMask: { value: 0 }, ...this.nfU };
    const sm = this.own(new THREE.ShaderMaterial({ uniforms: this.starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    const stars = new THREE.Points(g, sm); stars.frustumCulled = false; stars.renderOrder = -4; sky.add(stars);
    /* the moon */
    this.moonU = { uPhase: { value: 0.5 }, uOpacity: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } };
    this.moonDir = MOON_DIR.clone(); this.moonDirTarget = MOON_DIR.clone(); this.moonTint = new THREE.Color(1, 1, 1);
    const mm = this.own(new THREE.ShaderMaterial({ uniforms: this.moonU, vertexShader: PLAIN_VERT, fragmentShader: MOON_FRAG, transparent: true, depthWrite: false, fog: false }));
    this.moon = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1, 1)), mm); this.moon.scale.setScalar(SKY_R * 0.15); this.moon.position.copy(MOON_DIR).multiplyScalar(SKY_R * 0.97); this.moon.renderOrder = -3; sky.add(this.moon);
    this.moonAnim = null;
    /* the constellation (built when the sign is known) */
    this.consU = { uTime: this.starU.uTime, uOpacity: { value: 1 }, uPx: this.starU.uPx, uDraw: { value: 0 }, uBig: { value: 1 }, uMask: { value: 1 }, ...this.nfU };
    this.lineU = { uDraw: { value: 0 }, uWidth: { value: 0.9 }, uColor: { value: new THREE.Color(0xd8e2ff).multiplyScalar(1.4) }, uOpacity: { value: 0.85 }, ...this.nfU };
    this.consStarMat = this.own(new THREE.ShaderMaterial({ uniforms: this.consU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.consLineMat = this.own(new THREE.ShaderMaterial({ uniforms: this.lineU, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.cons = null; this.consDraw = 0;
  }
  /* place the sign again for the current view (the card puts it in the open sky at its upper right) */
  replaceSign(fx = 0.27, fy = 0.3) {
    const sign = this.state.sign; if (!sign) return;
    this.signAt = [fx, fy]; this.state.sign = null; const age = this.consAge; const draw = this.consDraw;
    this.setConstellation(sign); this.consAge = age; this.consDraw = draw;
  }
  setConstellation(sign) {
    if (!ZODIAC[sign] || this.state.sign === sign) return;
    this.state.sign = sign;
    this.consAge = 0;
    if (this.cons) { this.cons.group.removeFromParent(); this.cons.geos.forEach((x) => x.dispose()); }
    const Z = ZODIAC[sign];
    let ra0 = Z.s[0][0]; const ras = Z.s.map(([ra]) => { let d = ra - ra0; if (d > 12) d -= 24; if (d < -12) d += 24; return ra0 + d; });
    ra0 = ras.reduce((a, b) => a + b, 0) / ras.length; const dec0 = Z.s.reduce((a, s) => a + s[1], 0) / Z.s.length;
    const xy = Z.s.map((s, i) => [-(ras[i] - ra0) * 15 * Math.cos(dec0 * Math.PI / 180), s[1] - dec0]);
    const ext = Math.max(...xy.map((p) => Math.abs(p[0])), ...xy.map((p) => Math.abs(p[1]) * 1.25), 1);
    /* the sign takes the open sky of the step's own view: upper left of the band, sized to fit it */
    let SPAN = 15; const C = CONST_DIR.clone();
    if (this.view && this.layout) {
      const cam = this.view; const B = this.layout.band; const bw = B.x1 - B.x0; const bh = B.y1 - B.y0; cam.updateMatrixWorld();
      const [fx, fy] = this.signAt || [0.27, 0.3];
      C.set((B.x0 + bw * fx) / this.layout.W * 2 - 1, 1 - (B.y0 + bh * fy) / this.layout.H * 2, 0.5).unproject(cam).sub(cam.position).normalize();
      if (C.y < 0.12) C.y = 0.12; C.normalize();
      SPAN = Math.max(6, Math.min(bw * 0.15, bh * 0.25 * 1.25) * cam.fov / this.layout.H) * (this.signK || 1);
    }
    const k = SPAN / ext; this.consC = C.clone().multiplyScalar(SKY_R * 0.95);
    const right = _v.copy(C).cross(V3(0, 1, 0)).normalize().clone(); const up = V3().copy(right).cross(C).normalize();
    const dirOf = ([x, y]) => V3().copy(C).addScaledVector(right, Math.tan(x * k * Math.PI / 180)).addScaledVector(up, Math.tan(y * k * Math.PI / 180)).normalize().multiplyScalar(SKY_R * 0.95);
    const P = xy.map(dirOf);
    const segs = []; for (const ch of Z.l) for (let i = 0; i < ch.length - 1; i++) segs.push([ch[i], ch[i + 1]]);
    const order = new Float32Array(Z.s.length).fill(segs.length + 1);
    segs.forEach(([a, b], i) => { order[a] = Math.min(order[a], i); order[b] = Math.min(order[b], i + 1); });
    const sg = new THREE.BufferGeometry(); const pos = new Float32Array(Z.s.length * 3);
    P.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aMag', new THREE.BufferAttribute(new Float32Array(Z.s.map((s) => clamp01((5 - s[2]) / 4.2))), 1));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(Z.s.map((_, i) => (i * 0.37) % 1)), 1));
    sg.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(Z.s.flatMap(() => [1, 0.94, 0.82])), 3));
    sg.setAttribute('aOrder', new THREE.BufferAttribute(order, 1));
    const lg = new THREE.BufferGeometry(); const n = segs.length;
    const A = new Float32Array(n * 12); const B = new Float32Array(n * 12); const side = new Float32Array(n * 4); const tt = new Float32Array(n * 4); const id = new Float32Array(n * 4); const ix = [];
    segs.forEach(([a, b], i) => { for (let j = 0; j < 4; j++) { A.set([P[a].x, P[a].y, P[a].z], (i * 4 + j) * 3); B.set([P[b].x, P[b].y, P[b].z], (i * 4 + j) * 3); side[i * 4 + j] = j % 2 ? 1 : -1; tt[i * 4 + j] = j < 2 ? 0 : 1; id[i * 4 + j] = i; } const o = i * 4; ix.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); });
    lg.setAttribute('position', new THREE.BufferAttribute(A.slice(), 3)); lg.setAttribute('aA', new THREE.BufferAttribute(A, 3)); lg.setAttribute('aB', new THREE.BufferAttribute(B, 3));
    lg.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); lg.setAttribute('aT', new THREE.BufferAttribute(tt, 1)); lg.setAttribute('aIdx', new THREE.BufferAttribute(id, 1)); lg.setIndex(ix);
    const grp = new THREE.Group(); const pts = new THREE.Points(sg, this.consStarMat); pts.frustumCulled = false; pts.renderOrder = -2;
    const lines = new THREE.Mesh(lg, this.consLineMat); lines.frustumCulled = false; lines.renderOrder = -2;
    grp.add(lines, pts); this.sky.add(grp);
    this.cons = { group: grp, geos: [sg, lg], n: segs.length };
    this.consDraw = 0;
  }
  setMoon(phase, animate = true) {
    const from = this.moonU.uPhase.value;
    if (!animate) { this.moonU.uPhase.value = phase; this.moonAnim = null; return; }
    let to = phase; while (to < from + 0.6) to += 1;
    this.moonAnim = { from, to, t: 0, dur: 2.6 };
  }

  buildFog() {
    this.fogU = this.billowU(1, 4.2, 0x2a3242, 0.2);
    const m = this.own(new THREE.ShaderMaterial({ uniforms: this.fogU, vertexShader: BILLOW_VERT, fragmentShader: BILLOW_FRAG, transparent: true, depthWrite: false }));
    const g = this.own(quads(44, { aSeed: 4 })); this.fillSeeds(g, 44, 5);
    const fog = new THREE.Mesh(g, m); fog.frustumCulled = false; fog.renderOrder = 8; this.group.add(fog);
    this.partT = -1;
  }

  buildGlyphs() {
    this.atlas = canvasTex(1024, 1024, false); this.own(this.atlas.t); drawAtlas(this.atlas);
    const N = 96; const g = this.own(quads(N, { aStart: 3, aInfo: 4, aColor: 3 }));
    for (let i = 0; i < N; i++) g.attributes.aInfo.setXYZW(i, -99, 0, 0, 0);
    this.glyphU = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uLife: { value: 2.6 }, uCut: { value: -1 }, uAtlas: { value: this.atlas.t }, ...this.nfU };
    /* world text draws in front of every piece of scenery (no depth test, late in the frame): a hut or a tree never cuts a word; normal blending, so a lit window behind never shows through the letters */
    const m = this.own(new THREE.ShaderMaterial({ uniforms: this.glyphU, vertexShader: GLYPH_VERT, fragmentShader: GLYPH_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 29; this.group.add(mesh);
    this.glyphs = { g, n: N, i: 0 };
    /* the words being said, burning above the fire */
    this.live = canvasTex(1024, 256, false); this.own(this.live.t);
    this.liveU = { uMap: { value: this.live.t }, uColor: { value: new THREE.Color(0xffa040) }, uHot: { value: new THREE.Color(0xfff2d0) }, uOpacity: { value: 0 }, uTime: { value: 0 }, uReveal: { value: 2 }, uBurn: { value: 0 }, ...this.nfU };
    const lm = this.own(new THREE.ShaderMaterial({ uniforms: this.liveU, vertexShader: PLAIN_VERT, fragmentShader: TEXT_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending }));
    this.liveMesh = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1.9, 0.475)), lm); this.liveMesh.position.copy(FIRE).setY(LIVE_Y); this.liveMesh.renderOrder = 30; this.group.add(this.liveMesh);
    this.liveText = ''; this.liveT = -9;
    this.redraws.push(() => this.drawLive(this.liveText));
    /* the player's words across the sky (enemy) */
    this.skyText = canvasTex(2048, 512, false); this.own(this.skyText.t);
    this.skyTextU = { uMap: { value: this.skyText.t }, uColor: { value: new THREE.Color(0xff5030) }, uHot: { value: new THREE.Color(0xffe0c0) }, uOpacity: { value: 0 }, uTime: { value: 0 }, uReveal: { value: 0 }, uBurn: { value: 0 }, uOutline: { value: 0 }, uLine: { value: new THREE.Color(0x0a0806) }, ...this.nfU };
    const sm = this.own(new THREE.ShaderMaterial({ uniforms: this.skyTextU, vertexShader: PLAIN_VERT, fragmentShader: TEXT_FRAG, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.NormalBlending }));
    this.skyWords = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1, 0.25)), sm); this.skyWords.visible = false; this.skyWords.renderOrder = 960; /* in front of every world's signs and glows */ this.group.add(this.skyWords);
    this.enemyWords = '';
    this.redraws.push(() => { if (this.enemyWords) this.drawSkyWords(this.enemyWords); });
  }
  drawLive(text) {
    const { g, c } = this.live; g.clearRect(0, 0, c.width, c.height);
    if (!text) { this.live.t.needsUpdate = true; return; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fitFont(g, text, 700, 120, c.width * 0.92); if ('letterSpacing' in g) g.letterSpacing = '4px';
    g.shadowColor = '#fff'; g.shadowBlur = 22; g.fillStyle = '#fff'; g.fillText(text, c.width / 2, c.height / 2 + 6);
    g.shadowBlur = 0; g.fillText(text, c.width / 2, c.height / 2 + 6);
    this.live.t.needsUpdate = true;
  }
  /* world text (sky words, labels) in the world's type and colours; dark = the carved gold serif */
  get wui() { return this.worldId !== 'dark' ? this.worldEntry?.ui || null : null; }
  get serifW() { return this.wui?.serif || SERIF; }
  drawSkyWords(text) {
    const { g, c } = this.skyText; g.clearRect(0, 0, c.width, c.height);
    const t = text.toUpperCase();
    const words = t.split(/\s+/); let l1 = t; let l2 = '';
    if (t.length > 22 && words.length > 1) { let best = 1; let bd = 1e9; for (let i = 1; i < words.length; i++) { const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } } l1 = words.slice(0, best).join(' '); l2 = words.slice(best).join(' '); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    const lines = l2 ? [l1, l2] : [l1];
    /* the spacing is set before the measure, and the glow needs a margin: the line always fits inside the canvas, never clipped */
    if ('letterSpacing' in g) g.letterSpacing = '8px';
    let size = l2 ? 150 : 210; for (const L of lines) size = Math.min(size, fitFont(g, L, 700, size, c.width * 0.86, this.serifW));
    g.font = `700 ${size}px ${this.serifW}`;
    /* a world sky (a red dawn, a bright day): a dark outline and halo under the letters so they read on any sky; dark = the white glow */
    const ol = !!this.wui; this.skyTextU.uOutline.value = ol ? 1 : 0; if (ol) this.skyTextU.uLine.value.set(this.wui.night || '#0a0806');
    lines.forEach((L, i) => { const y = c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.38 + size * 0.04;
      if (ol) { g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = size * 0.14; g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 34; g.strokeText(L, c.width / 2, y); g.shadowBlur = 0; g.fillStyle = '#fff'; g.fillText(L, c.width / 2, y); return; }
      g.shadowColor = '#fff'; g.shadowBlur = 30; g.fillText(L, c.width / 2, y); g.shadowBlur = 0; g.fillText(L, c.width / 2, y); });
    this.skyText.t.needsUpdate = true;
  }

  buildSeason() {
    const N = 900; const g = this.own(new THREE.BufferGeometry()); const seeds = new Float32Array(N * 4); const r = rng(808);
    for (let i = 0; i < N * 4; i++) seeds[i] = r();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.seasonU = { uTime: { value: 0 }, uVel: { value: V3() }, uVary: { value: V3() }, uSway: { value: 0 }, uSize: { value: 0.1 }, uPx: { value: 400 }, uKind: { value: 2 }, uColor: { value: new THREE.Color(0xc8d0e0) }, uOpacity: { value: 0 } };
    this.seasonMat = { normal: this.own(new THREE.ShaderMaterial({ uniforms: this.seasonU, vertexShader: SEASON_VERT, fragmentShader: SEASON_FRAG, transparent: true, depthWrite: false })), add: this.own(new THREE.ShaderMaterial({ uniforms: this.seasonU, vertexShader: SEASON_VERT, fragmentShader: SEASON_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })) };
    this.seasonPts = new THREE.Points(g, this.seasonMat.add); this.seasonPts.frustumCulled = false; this.seasonPts.renderOrder = 6; this.group.add(this.seasonPts);
    /* until a date is given: slow dust in the firelight */
    this.seasonTarget = 0.35; this.seasonKind = -1;
    Object.assign(this.seasonU.uVel.value, { x: 0.05, y: 0.02, z: 0 }); this.seasonU.uVary.value.set(0.1, 0.06, 0.1); this.seasonU.uSway.value = 0.4; this.seasonU.uSize.value = 0.035; this.seasonU.uColor.value.set(0xffd8a0);
  }
  setSeason(month) {
    if (this.seasonLock) return; /* the weather the player named stays (the birth month must not swap the rain for fireflies) */
    const kind = SEASON(month); if (kind === this.seasonKind) return;
    this.seasonKind = kind; const L = SEASON_LOOK[kind]; const u = this.seasonU;
    u.uKind.value = kind; u.uVel.value.set(...L.vel); u.uVary.value.set(...L.vary); u.uSway.value = L.sway; u.uSize.value = L.size; u.uColor.value.set(L.color);
    if (L.add) u.uColor.value.multiplyScalar(2.2);
    this.seasonPts.material = L.add ? this.seasonMat.add : this.seasonMat.normal;
    u.uOpacity.value = 0; this.seasonTarget = L.opacity;
  }

  buildReveal() {
    this.ringU = { uColor: { value: new THREE.Color(0xffffff) }, uOpacity: { value: 0 }, uWall: { value: 0 } };
    this.wallU = { uColor: this.ringU.uColor, uOpacity: { value: 0 }, uWall: { value: 1 } };
    const rg = this.own(new THREE.RingGeometry(0.93, 1, 128, 1)); rg.rotateX(-Math.PI / 2);
    const rm = this.own(new THREE.ShaderMaterial({ uniforms: this.ringU, vertexShader: 'varying vec2 vUv; void main(){ vUv = vec2(uv.x, length(position.xz) > 0.965 ? 1.0 : 0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.ring = new THREE.Mesh(rg, rm); this.ring.position.y = 0.06; this.ring.visible = false; this.ring.renderOrder = 6; this.group.add(this.ring);
    const wg = this.own(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true)); wg.translate(0, 0.5, 0);
    const wm = this.own(new THREE.ShaderMaterial({ uniforms: this.wallU, vertexShader: PLAIN_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.wall = new THREE.Mesh(wg, wm); this.wall.visible = false; this.wall.renderOrder = 6; this.group.add(this.wall);
  }

  buildSeats() {
    /* two logs and two stones around the fire: empty places until someone is named */
    const bark = this.own(new THREE.MeshStandardMaterial({ map: this.tex('bark_brown_02_diff.jpg', true, 1), normalMap: this.tex('bark_brown_02_nor.jpg', false, 1), color: 0x6a5a4c, roughness: 1, envMapIntensity: 0.08 }));
    const endM = this.own(new THREE.MeshStandardMaterial({ map: bark.map, color: 0x3a3028, roughness: 1, envMapIntensity: 0.05 }));
    const lg = this.own(new THREE.CylinderGeometry(0.19, 0.21, 1.3, 14, 1)); lg.rotateZ(Math.PI / 2);
    const stoneM = this.own(new THREE.MeshStandardMaterial({ map: this.tex('seaside_rock_diff.jpg', true, 1), normalMap: this.tex('seaside_rock_nor.jpg', false, 1), color: 0x8a8680, roughness: 1, envMapIntensity: 0.1 }));
    const sg = this.own(new THREE.DodecahedronGeometry(0.34, 1));
    { const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y > 0 ? y * 0.55 + 0.02 : y * 0.9); p.setX(i, p.getX(i) * 1.15); } sg.computeVertexNormals(); }
    this.seats = SEATS.map(([a, d], i) => {
      const x = FIRE.x + Math.cos(a) * d; const z = FIRE.z + Math.sin(a) * d;
      const face = Math.atan2(FIRE.x - x, FIRE.z - z);
      let prop;
      if (i % 2 === 0) { prop = new THREE.Mesh(lg, [bark, endM, endM]); prop.position.set(x, 0.17, z); prop.rotation.y = face + Math.PI / 2; }
      else { prop = new THREE.Mesh(sg, stoneM); prop.position.set(x, 0.3, z); prop.rotation.y = face; }
      prop.castShadow = true; prop.receiveShadow = true; this.group.add(prop);
      if (i % 2 === 0) this.showWhen(prop, bark.map, bark.normalMap); else this.showWhen(prop, stoneM.map, stoneM.normalMap);
      return { x, z, face, top: i % 2 === 0 ? 0.36 : 0.5, prop };
    });
  }

  buildLabels() {
    this.labels = [];
    for (let i = 0; i < 5; i++) {
      const ct = canvasTex(512, 128); this.own(ct.t);
      const m = this.own(new THREE.SpriteMaterial({ map: ct.t, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
      const s = new THREE.Sprite(m); s.scale.set(1.6, 0.4, 1); s.visible = false; s.renderOrder = 40; this.group.add(s);
      this.labels.push({ ct, m, s, text: '' });
    }
    /* the spirit look: warm light that is brighter at the edges */
    this.spiritMats = [0, 1, 2, 3].map(() => {
      const m = this.own(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff8a3a, emissiveIntensity: 0.8, roughness: 1, metalness: 0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { float fr = 1.0 - abs(dot(normalize(vViewPosition), normal)); totalEmissiveRadiance *= 0.08 + 1.9 * pow(fr, 2.4); }'); };
      m.customProgramCacheKey = () => 'camp-spirit';
      return m;
    });
    this.moteU = [0, 1, 2, 3].map(() => ({ uTime: { value: 0 }, uForm: { value: 0 }, uSrc: { value: V3() }, uPx: { value: 400 }, uSize: { value: 0.05 }, uFlap: { value: 7 }, uColor: { value: new THREE.Color(0xffc890).multiplyScalar(1.8) }, uOpacity: { value: 1 } }));
    this.moteMats = this.moteU.map((u) => this.own(new THREE.ShaderMaterial({ uniforms: u, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    /* the unnamed flame for a desire */
    const dg = this.own(quads(2, { aOff: 3, aSize: 3 })); dg.attributes.aOff.setXYZ(0, 0, 0, 0); dg.attributes.aSize.setXYZ(0, 0.42, 1.05, 0.3); dg.attributes.aOff.setXYZ(1, 0.02, 0, 0.03); dg.attributes.aSize.setXYZ(1, 0.24, 0.55, 0.8);
    this.wishU = { ...this.flameU, uFlare: { value: 0 }, uWind: { value: new THREE.Vector2() }, uLow: { value: 0 }, uPower: { value: 0 }, uCore: { value: new THREE.Color(0xffffff) }, uMid: { value: new THREE.Color(0xffe0a0) }, uEdge: { value: new THREE.Color(0xff9a50) } };
    const wm = this.own(new THREE.ShaderMaterial({ uniforms: this.wishU, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.wish = new THREE.Mesh(dg, wm); this.wish.frustumCulled = false; this.wish.visible = false; this.wish.renderOrder = 5; this.group.add(this.wish);
  }
  drawLabel(L, text, italic = false) {
    const { g, c } = L.ct; g.clearRect(0, 0, c.width, c.height); L.text = text; L.italic = italic;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = italic ? text : text.toUpperCase();
    let fs = 64;
    const fam = this.serifW; if (italic) { fs = 52; g.font = `italic 500 52px ${fam}`; const w = g.measureText(t).width; if (w > c.width * 0.94) { fs = Math.floor(52 * c.width * 0.94 / w); g.font = `italic 500 ${fs}px ${fam}`; } } else { if ('letterSpacing' in g) g.letterSpacing = '6px'; fs = fitFont(g, t, 700, 64, c.width * 0.9, fam); }
    L.tw = g.measureText(t).width; L.fs = fs; L.snap = true;
    const ui = this.wui; g.shadowColor = ui?.ember || '#ff9a40'; g.shadowBlur = 18; g.fillStyle = ui?.ember || '#ffb870'; g.fillText(t, c.width / 2, c.height / 2 + 4);
    g.shadowBlur = 0; g.fillStyle = ui?.cream || '#fff1dc'; g.globalAlpha = 0.9; g.fillText(t, c.width / 2, c.height / 2 + 4); g.globalAlpha = 1;
    L.ct.t.needsUpdate = true;
  }

  /* ================================================================ particles */
  spawn(x, y, z, vx, vy, vz, life, size, color, { drag = 1.4, lift = 0.6, alpha = 1 } = {}) {
    const e = this.emb; const i = e.i; e.i = (e.i + 1) % e.n;
    e.pos.set([x, y, z], i * 3); e.vel.set([vx, vy, vz], i * 3); e.life[i] = life; e.max[i] = life; e.drag[i] = drag; e.lift[i] = lift; e.size[i] = size; e.base[i] = alpha;
    _c.set(color); e.col.set([_c.r * 2.4, _c.g * 2.4, _c.b * 2.4], i * 3);
  }
  burst(at, n, color, { speed = 3, up = 2, life = 1.2, size = 0.05, spread = 0.15, drag = 2.2, lift = -2.0 } = {}) {
    const r = this.rand;
    for (let k = 0; k < n; k++) {
      const a = r() * TAU; const s = speed * (0.3 + r() * 0.9);
      this.spawn(at.x + (r() - 0.5) * spread, at.y + (r() - 0.5) * spread, at.z + (r() - 0.5) * spread, Math.cos(a) * s, up * (0.4 + r()), Math.sin(a) * s, life * (0.5 + r() * 0.8), size * (0.6 + r() * 0.8), color, { drag, lift });
    }
  }
  emberFromFire(n, color = 0xff8a30, hot = 1) {
    const r = this.rand;
    for (let k = 0; k < n; k++) this.spawn(FIRE.x + (r() - 0.5) * 0.5, 0.35 + this.fireY + r() * 0.4, FIRE.z + (r() - 0.5) * 0.5, (r() - 0.5) * 0.8, (1.4 + r() * 2.2) * hot, (r() - 0.5) * 0.8, 1.6 + r() * 2.2, 0.035 + r() * 0.05, color, { drag: 0.6, lift: 0.5 });
  }
  glyph(ch, color) {
    const idx = GLYPHS.indexOf(ch.toUpperCase()); if (idx < 0) return;
    const G = this.glyphs; const i = G.i; G.i = (G.i + 1) % G.n; const r = this.rand;
    G.g.attributes.aStart.setXYZ(i, FIRE.x + (r() - 0.5) * 0.45, 0.75 + this.fireY + r() * 0.3, FIRE.z + (r() - 0.5) * 0.45);
    G.g.attributes.aInfo.setXYZW(i, this.time, idx, r(), 0.2 + r() * 0.08);
    _c.set(color); G.g.attributes.aColor.setXYZ(i, _c.r, _c.g, _c.b);
    for (const k of ['aStart', 'aInfo', 'aColor']) G.g.attributes[k].needsUpdate = true;
  }

  /* ================================================================ the hero */
  setHero(actor, dressed = false) {
    if (dressed) this.dressed = actor;
    if (!this.active) { this.actor = actor; return; }
    if (this.assembly && this.assembly.actor !== actor) this.finishAssembly();
    this.actor = actor;
    if (!actor) return;
    actor.root.rotation.y = this.turn ?? HERO_TURN;
    actor.root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    /* a soft key on the hero's face and chest through the questions (the fire sits beside and behind the
       hero, so a real face stood in its own shadow). The card has its own key (restore()). */
    if (!this.heroKey) { this.heroKey = new THREE.PointLight(0xffe4c8, 0, 5.5, 2); this.heroKey.castShadow = false; this.group.add(this.heroKey);
      /* a cool rim from behind the hero, on the far side from the camera (stepStage moves it): the hero's edge
         separates from a dark land. Made with the key, so no reveal ever adds a light. */
      this.heroRim = new THREE.PointLight(0x9db8ff, 0, 6, 2); this.heroRim.castShadow = false; this.group.add(this.heroRim);
      /* the light of the cut name, on the hero's face and the ground (bright on each letter, then a steady glow that keeps the stone a landmark) */
      if (!CX_OLD) { this.etchL = new THREE.PointLight(0xffb060, 0, 5, 2); this.etchL.castShadow = false; this.group.add(this.etchL); } }
    { const t = (this.turn ?? HERO_TURN) + 0.45; const p = actor.root.position; this.heroKey.position.set(p.x + Math.sin(t) * 1.5, 2.0, p.z + Math.cos(t) * 1.5); this.heroKey.intensity = this.key ? 0 : HERO_KEY; }
    /* an armoured actor arrives bare and is dressed piece by piece (hero() picks the style) */
    if (!actor.traveller && actor.wornParts().length > 1 && this.dressed !== actor) this.startAssembly(actor, this.archetype?.id || 'knight');
  }
  hero(archetype, build) {
    this.archetype = archetype; this.build = build;
    if (this.assembly) this.assembly.style = ARRIVE[archetype?.id] || ARRIVE.knight;
    else if (this.actor && !this.actor.traveller && this.actor.wornParts().length > 1 && this.dressed !== this.actor) this.startAssembly(this.actor, archetype?.id);
  }
  startAssembly(actor, id) {
    const want = new Map(); for (const m of actor.meshes) want.set(m, m.visible);
    /* the cloth (hood, cloak, robe) stays on from the start, so the hero never stands as a bare mannequin; the plates arrive */
    /* the real body (head, hair, clothes) is there from the start too; only plates, hats and coats arrive */
    const keep = (m) => m.userData.part === 'Mannequin' || BODY_PART.test(m.userData.part || '') || (CLOTH.has(m.userData.part) && want.get(m));
    for (const m of actor.meshes) if (!keep(m)) m.visible = false;
    const style = ARRIVE[id] || ARRIVE.knight;
    const groups = (style.order || PIECES.map((_, i) => i)).map((i) => PIECES[i]);
    const queue = [];
    for (const names of groups) { const meshes = names.flatMap((n) => actor.parts.get(n) || []).filter((m) => want.get(m) && !keep(m)); if (meshes.length) queue.push(meshes); }
    const rest = actor.meshes.filter((m) => want.get(m) && !keep(m) && m.userData.part !== 'Eyes' && !queue.some((q) => q.includes(m)));
    if (rest.length) queue.push(rest);
    if (style.pairs) for (let i = queue.length - 1; i > 0; i -= 2) { queue[i - 1] = queue[i - 1].concat(queue[i]); queue.splice(i, 1); }
    const eyes = (actor.parts.get('Eyes') || []).filter((m) => want.get(m));
    this.assembly = { actor, want, queue, eyes, style, t: -0.35, next: 0, hot: [] };
    this.dressed = actor;
  }
  pieceCentre(meshes) {
    const c = V3(); let n = 0;
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      const count = m.geometry.attributes.position.count; const step = Math.max(1, Math.floor(count / 24));
      for (let i = 0; i < count; i += step) { m.getVertexPosition(i, _v2); _v2.applyMatrix4(m.matrixWorld); c.add(_v2); n++; }
    }
    return n ? c.multiplyScalar(1 / n) : c;
  }
  stepAssembly(dt) {
    const A = this.assembly; if (!A) return;
    A.t += dt;
    for (let i = A.hot.length - 1; i >= 0; i--) {
      const h = A.hot[i]; h.t += dt; const k = Math.max(0, 1 - h.t / 0.55);
      /* only plate glows as it lands, briefly: cloth never lights up (a lit hood read as a coloured mask) */
      for (const m of h.meshes) { const e = m.userData.campE; if (!e || CLOTH.has(m.userData.part)) continue; m.material.emissive.copy(e.c).lerp(_c.set(A.style.glow), k); m.material.emissiveIntensity = e.i + (0.26 - e.i) * k * k; }
      if (k <= 0) { for (const m of h.meshes) { const e = m.userData.campE; if (e) { m.material.emissive.copy(e.c); m.material.emissiveIntensity = e.i; } } A.hot.splice(i, 1); }
    }
    while (A.next < A.queue.length && A.t >= A.next * A.style.gap) {
      const meshes = A.queue[A.next++]; const S = A.style;
      for (const m of meshes) { m.visible = true; if (m.material.emissive && !m.userData.campE) m.userData.campE = { c: m.material.emissive.clone(), i: m.material.emissiveIntensity }; }
      A.hot.push({ meshes, t: 0 });
      const at = this.pieceCentre(meshes);
      if (S.motes) { for (let k = 0; k < S.sparks; k++) { const a = this.rand() * TAU; const rr = 0.25 + this.rand() * 0.3; this.spawn(at.x + Math.cos(a) * rr, at.y - 0.2, at.z + Math.sin(a) * rr, -Math.sin(a) * 1.2, 0.9 + this.rand(), Math.cos(a) * 1.2, 1.0 + this.rand() * 0.6, 0.04, S.spark, { drag: 1.5, lift: 0.4 }); } }
      else this.burst(at, S.sparks, S.spark, { speed: 2.6, up: 1.6, life: 0.7, size: 0.04, spread: 0.2 });
      if (S.smoke) this.burst(at, 10, 0x40464c, { speed: 0.6, up: 0.5, life: 1.0, size: 0.16, spread: 0.3, drag: 3, lift: 0.3 });
      this.world.kick(S.kick); if (A.next === 1 || A.next % 2 === 0 || S.pairs) sfx(S.sound, { gain: S.gain });
    }
    if (A.next >= A.queue.length && A.t >= A.queue.length * A.style.gap + 0.25 && !A.eyesOn) {
      A.eyesOn = true; for (const m of A.eyes) m.visible = true;
      this.world.flash(0.18); this.world.kick(A.style.kick * 1.5);
      const head = this.pieceCentre(A.eyes.length ? A.eyes : A.actor.meshes.slice(0, 1));
      this.burst(head, 30, A.style.spark, { speed: 1.6, up: 1.2, life: 0.9, size: 0.035, spread: 0.1 });
    }
    if (A.eyesOn && !A.hot.length) this.assembly = null;
  }
  finishAssembly() {
    const A = this.assembly; if (!A) return;
    for (const [m, on] of A.want) m.visible = on;
    for (const m of A.actor.meshes) { const e = m.userData.campE; if (e) { m.material.emissive.copy(e.c); m.material.emissiveIntensity = e.i; } }
    this.assembly = null;
  }

  /* ================================================================ companions */
  async addCompanion(m, slot) {
    const seat = this.seats[slot]; const c = { slot, text: m.text, kind: m.kind, species: m.species, t: 0, alpha: 0, leaving: false, label: this.labels[slot], quiet: !!m.quiet };
    if (m.kind !== 'pet') c.at = { x: seat.x, z: seat.z };
    this.companions.push(c);
    this.drawLabel(c.label, m.text); c.label.s.visible = true; c.label.m.opacity = 0;
    if (this.worldId !== 'dark' && this.Folk) {
      /* a world: a clothed person sits on the seat by the fire, a hound lies near it; the camp draws the name (world font) */
      const animal = m.kind === 'pet';
      const qp = this.Folk.makeFolk(this.group, [m.text], { kinds: [animal ? 'animal' : 'person'], kit: { id: this.worldId, ui: this.worldEntry?.ui } });
      const fig = qp.list[0]; fig.label.visible = false; fig.setState('hearth'); fig.folk = true;
      if (animal) { const taken = this.companions.filter((o) => o !== c && o.at && !o.orbit && !o.leaving).map((o) => o.at); const spot = this.petSpot(taken); c.at = { x: spot.x, z: spot.z }; }
      fig.position.set(c.at.x, animal ? 0 : Math.max(0, seat.top - 0.52), c.at.z);
      c.qp = qp; c.fig = fig; c.labelY = animal ? 0.85 : 1.55;
    } else if (this.QP) {
      /* a cloaked person with a lantern, or a hound: sitting by the fire, as in the fight */
      const qp = this.QP.makeCompanions(this.group, [m.text], { kinds: [m.kind === 'pet' ? 'animal' : 'person'], accent: this.biome?.accent ?? 0xff8a3a, style: this.worldEntry?.companion || 'dark' });
      const fig = qp.list[0]; fig.label.visible = false; fig.setState('hearth');
      if (m.kind === 'pet') { const taken = this.companions.filter((o) => o !== c && o.at && !o.orbit && !o.leaving).map((o) => o.at); const spot = this.petSpot(taken); c.at = { x: spot.x, z: spot.z }; }
      fig.position.set(c.at.x, 0, c.at.z);
      c.qp = qp; c.fig = fig; c.labelY = m.kind === 'pet' ? 0.62 : this.worldId !== 'dark' ? 2.05 : 1.4; /* the name sat on the face in neon and frontier */ /* a world's companion figure is taller (a lantern-bearer): the name floats clear of its head */
    } else if (m.kind === 'pet') {
      const shape = m.species && SHAPES[m.species] ? m.species : 'hound';
      const r = rng(hashStr(m.text) + 3); const s = sampleShape(SHAPES[shape](), shape === 'bird' ? 1100 : shape === 'cat' ? 1300 : 2200, r);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(s.pos, 3));
      const seeds = new Float32Array((s.pos.length / 3) * 4); for (let i = 0; i < seeds.length; i++) seeds[i] = r(); g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4)); g.setAttribute('aWing', new THREE.BufferAttribute(s.wing, 2));
      const pts = new THREE.Points(g, this.moteMats[slot]); pts.frustumCulled = false; pts.renderOrder = 7;
      const holder = new THREE.Group(); holder.add(pts); this.group.add(holder);
      const sc = shape === 'hound' ? 1.55 : shape === 'cat' ? 1.6 : 1.7;
      pts.scale.setScalar(sc);
      if (shape === 'bird') { holder.position.copy(FIRE); c.orbit = { r: 1.7 + (slot % 2) * 0.3, h: 2.5 + slot * 0.15, a: slot * 1.7 }; }
      else {
        /* off the others: the people by the fire and the other animals */
        const taken = this.companions.filter((o) => o !== c && o.at && !o.orbit && !o.leaving).map((o) => o.at);
        const spot = this.petSpot(taken);
        holder.position.set(spot.x, 0, spot.z); holder.rotation.y = Math.atan2(FIRE.x - spot.x, FIRE.z - spot.z) - 0.5; c.at = { x: spot.x, z: spot.z };
      }
      const u = this.moteU[slot]; u.uForm.value = 0; u.uSize.value = shape === 'bird' ? 0.07 : 0.06; u.uOpacity.value = 1;
      c.pts = pts; c.holder = holder; c.geo = g; c.shape = shape; c.u = u; c.labelY = shape === 'bird' ? 0.5 : shape === 'cat' ? 1.1 : 1.65;
    } else {
      const actor = await makeActor(KNIGHT_URL);
      if (!this.active || c.leaving) { actor.dispose(); return; }
      const keep = new Set(['Mannequin', 'Hood', 'Cloak', 'Robe']);
      const mat = this.spiritMats[slot]; mat.opacity = 0;
      for (const mesh of actor.meshes) { mesh.material.dispose(); mesh.material = mat; mesh.visible = keep.has(mesh.userData.part); mesh.castShadow = false; mesh.receiveShadow = false; }
      const small = m.kind === 'child';
      actor.root.scale.setScalar(small ? 0.74 : 0.96);
      actor.root.position.set(seat.x, small ? seat.top - 0.5 * 0.74 * 1 : seat.top - 0.52, seat.z); actor.root.rotation.y = seat.face;
      actor.noBlob = true;
      actor.play('Sitting_Idle_Loop'); actor.mixer.update(slot * 1.3 + 0.2);
      this.group.add(actor.root);
      c.actor = actor; c.mat = mat; c.labelY = small ? 1.25 : 2.0;
      c.motes = 0;
    }
    c.pos = c.fig ? c.fig.position : c.holder ? c.holder.position : c.actor.root.position;
    if (!c.quiet) sfx('soul', { gain: 0.5 });
    /* the camera keeps the ones the hero fights for in frame */
    this.onReframe?.();
    return c;
  }
  dropCompanion(c, now = false) {
    c.leaving = true;
    if (!now) return;
    c.label.s.visible = false; c.label.m.opacity = 0;
    if (c.actor) { c.actor.dispose(); c.mat.opacity = 0; }
    if (c.holder) { c.holder.removeFromParent(); c.geo.dispose(); }
    if (c.qp) { c.qp.dispose(); c.qp = null; }
  }
  syncCompanions(list) {
    const want = list.slice(0, 4);
    for (const c of this.companions) if (!c.leaving && !want.some((m) => m.text.toLowerCase() === c.text.toLowerCase() && (m.kind === 'pet') === (c.kind === 'pet'))) this.dropCompanion(c);
    for (const m of want) {
      if (this.companions.some((c) => !c.leaving && c.text.toLowerCase() === m.text.toLowerCase())) continue;
      const used = new Set(this.companions.map((c) => c.slot));
      const free = (m.kind === 'pet' ? [3, 0, 1, 2] : [2, 1, 3, 0]).filter((s) => !used.has(s));
      if (!free.length) break;
      /* a person takes the seat the camera sees best: never behind the fire, the hero or the stone */
      const others = this.companions.filter((o) => o.at && !o.orbit && !o.leaving).map((o) => o.at);
      const seats = free.map((s) => ({ x: this.seats[s].x, z: this.seats[s].z, slot: s })); const clear = seats.filter((p) => !others.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.05));
      const slot = m.kind === 'pet' ? free[0] : this.pickSpot(clear.length ? clear : seats, 1.35, others).slot;
      this.addCompanion(m, slot);
    }
    /* the people may have sat down after an animal found its spot: move each animal off them and off each other */
    for (const c of this.companions) {
      if (c.kind !== 'pet' || !(c.holder || c.fig) || c.orbit || c.leaving || !c.at) continue;
      const others = this.companions.filter((o) => o !== c && o.at && !o.orbit && !o.leaving).map((o) => o.at);
      const spot = this.petSpot(others); if (spot.x === c.at.x && spot.z === c.at.z) continue;
      if (c.fig) c.fig.position.set(spot.x, 0, spot.z); else { c.holder.position.set(spot.x, 0, spot.z); c.holder.rotation.y = Math.atan2(FIRE.x - spot.x, FIRE.z - spot.z) - 0.5; }
      c.at = { x: spot.x, z: spot.z };
    }
  }
  petSpot(taken) {
    /* the card: one fixed spot at the front left, below the stone, so the name above the animal clears the stone and the hero */
    if (this.cardLabels && !taken.some((q) => Math.hypot(q.x + 2.7, q.z - 3.1) < 1.3)) return { x: -2.7, z: 3.1 };
    const cands = PET_SPOTS.map(([x, z]) => ({ x, z })).filter((p) => !taken.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.3));
    /* on the card the spot also needs room for the name just above the animal */
    return this.pickSpot(cands.length ? cands : [{ x: PET_SPOTS[0][0], z: PET_SPOTS[0][1] }], this.cardLabels ? 1.6 : 1.0, taken, this.cardLabels ? 1.2 : 0.6, this.cardLabels ? 15 : 120);
  }
  stepCompanions(dt) {
    const cam = this.world.camera;
    for (let i = this.companions.length - 1; i >= 0; i--) {
      const c = this.companions[i]; if (!c.pos) continue;
      c.t += dt;
      /* the enemy dims the camp, but the named ones stay readable */
      const shrink = 1 - this.dim * 0.3;
      const target = c.leaving ? 0 : shrink;
      c.alpha += (target - c.alpha) * Math.min(1, dt * (c.leaving ? 3 : 1.6));
      if (c.fig) {
        c.qp.update(dt, this.time, cam);
        /* on the card a person faces the camera (a little aside), at once: the card froze Wren turned away */
        if (this.cardLabels && c.fig.folk && c.fig.inner && c.kind !== 'pet') { const y = Math.atan2(cam.position.x - c.fig.position.x, cam.position.z - c.fig.position.z) + 0.25; c.fig.yaw = y; c.fig.inner.rotation.y = y; c.fig.focus = { x: cam.position.x, z: cam.position.z, until: 1e9 }; }
        if (c.fig.folk) { if (c.leaving) c.fig.setState('taken'); } else { const form = smooth(0.1, 1.3, c.t); c.fig.U.uAlpha.value *= c.alpha * form; }
      }
      if (c.actor) {
        c.actor.mixer.update(dt);
        const form = clamp01((c.t - 0.3) / 1.4);
        c.mat.opacity = c.alpha * form; c.mat.emissiveIntensity = 0.8 * (0.9 + 0.1 * Math.sin(this.time * 2 + c.slot));
        if (form < 1 && this.rand() < dt * 40) { const s = this.seats[c.slot]; this.spawn(s.x + (this.rand() - 0.5) * 0.5, 0.3 + this.rand() * 1.2, s.z + (this.rand() - 0.5) * 0.5, 0, 0.5, 0, 1.0, 0.035, 0xffb070, { drag: 1, lift: 0.3 }); }
      }
      if (c.holder) {
        c.u.uForm.value = Math.min(1.2, c.t / 1.8); c.u.uOpacity.value = c.alpha; c.u.uTime.value = this.time;
        _v.copy(FIRE).setY(0.6); c.holder.worldToLocal(_v); c.pts.worldToLocal(c.holder.localToWorld(_v.clone())); c.u.uSrc.value.copy(c.pts.worldToLocal(_v2.copy(FIRE).setY(0.6)));
        if (c.orbit) { c.orbit.a += dt * 0.42; const a = c.orbit.a; c.holder.position.set(FIRE.x + Math.cos(a) * c.orbit.r, c.orbit.h + Math.sin(this.time * 0.8) * 0.12, FIRE.z + Math.sin(a) * c.orbit.r); c.holder.rotation.y = -a; }
      }
      const L = c.label;
      (L.anchor ||= V3()).set(c.pos.x, (c.orbit ? c.pos.y : 0) + c.labelY + Math.sin(this.time * 1.4 + c.slot) * 0.03, c.pos.z);
      /* a folk figure steps in from the dark on its arrival beat */
      if (c.walk && c.fig && c.at) { c.walk.t += dt; const k = easeOut(c.walk.t / 1.1); c.fig.position.set(c.walk.fx + (c.at.x - c.walk.fx) * k, 0, c.walk.fz + (c.at.z - c.walk.fz) * k); if (k >= 1) c.walk = null; }
      L.alpha = c.noLabel ? 0 : this.cardLabels ? 0.95 : c.alpha * 0.95 * this.tagAlpha(c); if (c.noLabel) L.s.visible = false;
      if (c.leaving && c.alpha < 0.02) { this.dropCompanion(c, true); this.companions.splice(i, 1); }
    }
    /* the unnamed flame */
    if (this.wish.visible) {
      this.wishT += dt; const k = smooth(0, 1.2, this.wishT) * (1 - this.dim * 0.6);
      this.wishU.uPower.value = 1.6 * k; this.wishU.uTime.value = this.time;
      const L = this.labels[4]; L.alpha = k * smooth(0.8, 1.8, this.wishT) * 0.9; (L.anchor ||= V3()).set(this.wish.position.x, 1.45, this.wish.position.z);
    }
  }

  /* ================================================================ the answers */
  typing(stepId, text) {
    if (!this.active) return;
    text = String(text || '');
    const prev = this.typed[stepId] || ''; let i = 0;
    while (i < prev.length && i < text.length && prev[i] === text[i]) i++;
    const added = text.slice(i); this.typed[stepId] = text;
    const ink = STEP_INK[stepId] || 0xffa040;
    if (added.length) {
      /* no loose letters: a pile of single glyphs over the fire read as noise. The whole words burn above it instead. */
      const n = Math.min(4, added.length);
      this.flare = Math.min(2.4, this.flare + 0.32 * n + (stepId === 'weapon' ? 0.2 : 0));
      this.emberFromFire(5 + n * 3, stepId === 'enemy' ? 0xff5a30 : 0xff9a40, 1 + this.flare * 0.2);
      if (stepId === 'enemy') { this.gust = Math.min(1, this.gust + 0.12); this.windDir.set(-0.8, 0.6).normalize(); }
    }
    /* the words of this answer burn above the fire (the name goes on the stone instead) */
    /* the stone only ever shows the name Sage2 found: while it is typed, a chisel works the blank face */
    if (stepId === 'name') { if (added.length) this.chiselAt(Math.min(3, added.length)); }
    else { const tail = tailWords(text, 20); if (tail !== this.liveText) { this.liveText = tail; this.drawLive(tail); } this.liveU.uColor.value.set(ink); this.liveT = this.time; this.liveU.uBurn.value = 0; }
    if (stepId === 'born') {
      const d = parseDate(text);
      if (d?.month) this.setSeason(d.month);
      if (d?.month && d.day) { const sign = signOf(null, { month: d.month, day: d.day }); if (sign) this.setConstellation(sign); }
      if (d?.year && d.month && d.day) { const key = `${d.year}-${d.month}-${d.day}`; if (key !== this.dateKey) { this.dateKey = key; this.setMoon(moonPhase(new Date(Date.UTC(d.year, d.month - 1, d.day, 12))), true); } }
    }
    if (stepId === 'heart') {
      /* only whole words: a name still being typed (no space after it yet) waits */
      const g = guessMentions(/[\s,.;!?]$/.test(text) ? text : text.replace(/\S+$/, ''));
      for (const [k, v] of g) this.guesses.set(k, v);
      if (g.size) this.syncCompanions([...g.values()]);
    }
  }
  /* an answer is final: its burning words rise and go out */
  settle() { if (this.liveText) { this.liveT = this.time; this.liveBurnAt = this.time; } }
  /* a new step: every letter, burning word and sky word from the last answer goes out at once */
  clearText() {
    if (!this.active) return;
    this.glyphU.uCut.value = this.time;
    if (this.liveText && this.liveBurnAt == null) { this.liveT = this.time; this.liveBurnAt = this.time; }
    /* a new step: what still burns goes at double speed */
    if (this.liveBurnAt != null) this.liveBurnAt -= 0.8;
    if (this.wordsT >= 0 && this.wordsFade == null) this.wordsFade = this.time;
  }
  /* a point on the stone face, u across (0..1) and v down (0..1) as on the carving canvas */
  stoneFace(u, v, out = V3()) {
    const sg = this.dress?.sign; if (sg?.face) { sg.face.updateWorldMatrix(true, false); return sg.face.localToWorld(out.set((u - 0.5) * sg.w, (0.5 - v) * sg.h, 0.02)); }
    const { w, h, d } = STONE; const y = (1 - v) * h; const taper = 1 - 0.22 * (y / h) * (y / h);
    return this.stone.localToWorld(out.set((u - 0.5) * w * taper, y - 0.14, d / 2 + 0.03));
  }
  /* sparks fly from the name line as if a chisel struck it */
  chiselAt(n = 1, quiet = false) {
    const r = this.rand; this.chisel = quiet ? 0.5 : 1;
    for (let k = 0; k < n; k++) {
      const at = this.stoneFace(0.22 + r() * 0.56, 0.43 + (r() - 0.5) * 0.05);
      for (let j = 0; j < 7; j++) this.spawn(at.x, at.y, at.z, (r() - 0.5) * 1.4, 0.4 + r() * 1.2, 0.5 + r() * 0.9, 0.35 + r() * 0.35, 0.025 + r() * 0.02, j % 3 ? 0xffc070 : 0xfff2d0, { drag: 2.5, lift: -3 });
    }
    if (n && !quiet) sfx('deflect', { gain: 0.1 });
  }
  /* the title: a blank stone with a short carved prompt; now and then a chisel strikes it, waiting for a name */
  /* the enemy's figure (world.nemesis), posed for the frame instead of far out in the haze:
     'title' a dark threat behind the camp, 'step' the side of the sky, 'won' fallen and far, 'lost' looming over the hero */
  poseEnemy(mode) { this.nemMode = mode || null; }
  holdEnemy() {
    const nm = this.world.nemesis; if (!nm || nm.posed || !this.nemMode) return;
    const tick0 = nm.tick; const h = nm.holder;
    nm.posed = { tick0, pos: h.position.clone(), scale: h.scale.clone(), rot: h.rotation.clone() };
    h.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(h); const sz = b.getSize(V3());
    nm.posed.unit = Math.max(1e-3, (nm.boss ? Math.max(sz.x, sz.z) : sz.y) / h.scale.y);
    /* the body alone, to its head bone (the holder's box also holds hidden plates, a banner or a raised maul, so
       the body the eye sees is far shorter than the box) */
    try { const hb = !nm.boss ? h.getObjectByName('Head') || h.getObjectByName('head') : null; if (hb) { const hy = (hb.getWorldPosition(V3()).y - h.position.y) / h.scale.y; if (hy > 0.05 * nm.posed.unit) nm.posed.bodyH = nm.posed.bodyTop = hy * 1.12; } } catch { /* the box of the whole figure stands */ }
    /* fog only on materials that can take it: a ShaderMaterial without fog uniforms throws in three every frame */
    nm.posed.fog = nm.mats.map((m) => m.fog);
    for (const m of nm.mats) { if (m.isShaderMaterial && !m.uniforms?.fogColor) continue; m.fog = false; m.needsUpdate = true; }
    /* the Neon City camp is a street canyon: a figure 110 m out stood behind the buildings and was never seen
       (no Tower in the enemy reveal or the final frame). There the posed figure draws over the city, like a projection on the sky */
    if (this.worldId === 'neon' || this.worldId === 'edo') { /* edo: the Castle Road camp stands among town houses, the Lord was behind them */ nm.posed.depth = nm.mats.map((m) => m.depthTest); for (const m of nm.mats) m.depthTest = false; h.traverse((o) => { if (o.isMesh || o.isSprite) { o.userData.ro0 = o.renderOrder; o.renderOrder = 6; } }); }
    const camp = this;
    /* a figure on its way out keeps its last pose while it fades */
    nm.tick = (dt, t) => { tick0(dt, t); if (camp.active && (camp.nemMode || nm.leaving)) camp.placeEnemy(nm); else camp.freeEnemy(nm); };
  }
  freeEnemy(nm) {
    if (this.nemGlow) this.nemGlow.visible = false;
    if (!nm?.posed) return; const P = nm.posed; nm.tick = P.tick0; nm.posed = null;
    nm.holder.position.copy(P.pos); nm.holder.scale.copy(P.scale); nm.holder.rotation.copy(P.rot);
    if (P.depth) { nm.mats.forEach((m, i) => { m.depthTest = P.depth[i] ?? true; }); nm.holder.traverse((o) => { if (o.userData.ro0 != null) { o.renderOrder = o.userData.ro0; delete o.userData.ro0; } }); }
    nm.mats.forEach((m, i) => { if (m.isShaderMaterial && !m.uniforms?.fogColor) return; const was = P.fog ? P.fog[i] : true; if (m.fog !== was) { m.fog = was; m.needsUpdate = true; } });
  }
  placeEnemy(nm) {
    const cam = this.world.camera; const h = nm.holder; const dragon = !!nm.boss; const mode = (nm.leaving && nm.posed.mode) || this.nemMode || nm.posed.mode; nm.posed.mode = mode;
    /* x: across the frame (-1 left .. 1 right); size: share of the frame height; D: metres out; foot: ground offset; up: a flyer's height in the frame */
    let SPEC = {
      arrive: { x: 0.46, size: 0.86, D: 110, head: 0.78, up: 0.42 },
      title: { x: 0.3, size: 0.95, D: 95, head: 0.78, up: 0.35 },
      step: { x: 0.55, size: 0.5, D: 110, head: 0.5, up: 0.45 },
      lost: { x: 0.2, size: 1.05, D: 80, head: 0.82, up: 0.5 },
      won: { x: 0.1, size: 0.42, D: 60, foot: -7, up: 0.05, fallen: true }, /* the kneel frame sits high in its clip: the feet go down to the horizon */
    }[mode] || null;
    if (!SPEC) return;
    /* the step pose and the arrival pose blend (nemBlend), so the figure never jumps between them */
    if (mode === 'step' || mode === 'arrive') { const A = { x: 0.46, size: 0.86, head: 0.78, up: 0.42 }; const T = { x: 0.55 + NEM_SHOW_X * (this.nemShowK || 0), size: 0.5, head: 0.5, up: 0.45 }; const b = this.nemBlend || 0; SPEC = { D: 110 }; for (const k of ['x', 'size', 'head', 'up']) SPEC[k] = T[k] + (A[k] - T[k]) * b; }
    const sink = mode === 'step' || mode === 'arrive' ? 1 - (this.nemRise ?? 1) : 0;
    const tanV = Math.tan((cam.fov * Math.PI) / 360); const tanH = tanV * cam.aspect;
    const f = cam.getWorldDirection(_v4).setY(0).normalize(); const rx = -f.z; const rz = f.x;
    if (dragon) SPEC.size *= 0.55;
    const D = SPEC.D; const k = (SPEC.size * 2 * D * tanV) / nm.posed.unit;
    const x = cam.position.x + f.x * D + rx * SPEC.x * D * tanH; const z = cam.position.z + f.z * D + rz * SPEC.x * D * tanH;
    h.scale.setScalar(k);
    /* a dim glow of the land's accent behind the figure, so a dark shape reads against a dark sky */
    if (!this.nemGlow) { this.nemGlow = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: this.own(haloTexture()), color: 0xff6a2a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); this.nemGlow.renderOrder = -1; this.group.add(this.nemGlow); }
    const G = this.nemGlow; const gH = SPEC.size * 2 * D * tanV; /* only where the sky is dark (the title, a lost card): a lit land sky needs no glow */
    const op = (nm.mats[0]?.opacity ?? 0) * (mode === 'title' || mode === 'lost' ? 0.4 : Math.max(0.5 * (this.nemBlend || 0), NEM_SHOW_GLOW * (this.nemShowK || 0)) * (this.nemRise ?? 1));
    G.material.color.set(this.biome?.accent ?? 0xff6a2a); G.material.opacity = op; G.visible = op > 0.01;
    if (dragon) {
      const hy = cam.position.y + (SPEC.fallen ? -D * tanV * 0.3 : D * tanV * (SPEC.up - sink * 0.9)); this.nemHead.set(x, hy, z); this.nemH = gH;
      h.position.set(x, hy, z); if (SPEC.fallen) h.rotation.set(0, 0, 1.2); else h.rotation.set(0, 0, 0);
      G.position.set(x + f.x * 8, hy, z + f.z * 8); G.scale.setScalar(gH * 1.6); return;
    }
    /* a standing figure is placed by its head (a share of the half frame above the eye line); its feet sink below the land */
    let foot = SPEC.head != null ? cam.position.y + SPEC.head * D * tanV - SPEC.size * 2 * D * tanV : SPEC.foot;
    /* a land that rises toward the figure (the frontier mesa) hid the whole body behind the ridge. The ridge
       line is sampled along the view; the figure rises until about 60 % of it clears that line, and shrinks (feet kept) if its
       head would leave the frame. */
    const gfn = this.world.scene?.userData?.groundAt;
    if (gfn && SPEC.head != null) {
      let ridge = -1e9; for (let i = 1; i <= 12; i++) { const s = (i / 12) * D; let g = 0; try { g = gfn(cam.position.x + (x - cam.position.x) * (s / D), cam.position.z + (z - cam.position.z) * (s / D)) || 0; } catch { g = 0; } ridge = Math.max(ridge, (g + 0.5 - cam.position.y) / s); }
      const Hm = SPEC.size * 2 * D * tanV; const line = cam.position.y + ridge * D;
      if (foot + 0.4 * Hm < line) {
        foot = line - 0.4 * Hm; const maxTop = cam.position.y + 0.96 * D * tanV;
        if (foot + Hm > maxTop) { const H2 = Math.max(Hm * 0.45, maxTop - foot); h.scale.setScalar(k * (H2 / Hm)); }
      }
    }
    { /* the arrival: the body itself stands half a frame tall with its head high over the horizon, whatever else the figure carries */
      const P = nm.posed; const b = this.nemBlend || 0; const bh = P.bodyH || P.unit; const bt = P.bodyTop ?? P.unit;
      if (b > 0.001 && (mode === 'step' || mode === 'arrive')) { const kA = ((this.worldId === 'neon' && nm.spec?.world && !P.bodyH ? 1.0 : 0.52) * 2 * D * tanV) / bh; /* the Tower is a building: it fills the frame's height, its base below the frame */ const footA = cam.position.y + 0.8 * D * tanV - bt * kA; const k0 = h.scale.y; const kS = k0 + (kA - k0) * b; h.scale.setScalar(kS); foot += (footA - foot) * b; }
      /* the final shot (beauty): the body stands about a quarter of the frame tall, its head clear of the headline and the panel */
      const sh = this.nemShowK || 0; if (sh > 0.001 && mode === 'step') { const kB = (NEM_SHOW_H * 2 * D * tanV) / bh; const footB = cam.position.y + NEM_SHOW_TOP * D * tanV - bt * kB; const k0 = h.scale.y; h.scale.setScalar(k0 + (kB - k0) * sh); foot += (footB - foot) * sh; }
      const Hb = h.scale.y * bh; foot -= sink * Hb * 0.9; this.nemHead.set(x, foot + h.scale.y * bt * 0.93, z); this.nemH = Hb; }
    h.position.set(x, foot, z);
    h.rotation.set(0, Math.atan2(cam.position.x - x, cam.position.z - z), 0);
    /* beaten: the enemy kneels far off, its head down (one frame of the kneel, held) */
    if (SPEC.fallen && nm.actor && !nm.posed.knelt) {
      nm.posed.knelt = true; const clip = nm.actor.clips?.get('Fixing_Kneeling');
      if (clip) { nm.actor.play('Fixing_Kneeling', { loop: true, fade: 0, speed: 0, restart: true }); const a = nm.actor.mixer.clipAction(clip); a.timeScale = 0; a.time = 1.2; nm.actor.mixer.update(0); }
    }
    G.position.set(x + f.x * 8, foot + gH * 0.85, z + f.z * 8); G.scale.setScalar(gH * 0.75);
  }
  /* steel by the fire on the title: a sword planted in the ground that catches the light */
  plantSword(on) {
    if (!on) { if (this.sword) this.sword.visible = false; return; }
    if (this.sword) { this.sword.visible = true; return; }
    this.jobs.push(loadGLB('/assets/real/gear_sword.glb').then((gltf) => {
      if (!this.active) return;
      const src = gltf.scene || gltf; const m = src.clone(true);
      const b = new THREE.Box3().setFromObject(m); const sz = b.getSize(V3()); const long = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z';
      const pivot = new THREE.Group(); pivot.add(m); m.position.sub(b.getCenter(V3()));
      if (long === 'x') m.rotation.z = Math.PI / 2; else if (long === 'z') m.rotation.x = Math.PI / 2;
      const len = Math.max(sz.x, sz.y, sz.z); const sc = 1.3 / len; pivot.scale.setScalar(sc);
      /* tip down, the blade a third in the earth, leaning a little toward the fire */
      const holder = new THREE.Group(); holder.add(pivot); pivot.rotation.z = Math.PI; pivot.position.y = 0.52 * 1.3 - 0.25;
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); if ('metalness' in o.material) { o.material.metalness = 1; o.material.roughness = 0.28; o.material.envMapIntensity = 1.6; } this.own(o.material); } });
      holder.position.set(FIRE.x - 1.05, 0, FIRE.z + 0.75); holder.rotation.set(0.1, 0.9, -0.14);
      this.sword = holder; holder.visible = !!this.demo; this.group.add(holder);
    }).catch((err) => console.warn('camp sword', err)));
  }
  titleDemo(on) {
    if (!this.active) return;
    this.plantSword(on); this.poseEnemy(on ? 'title' : this.nemMode === 'title' ? null : this.nemMode);
    if (!on) { if (this.demo) { this.demo = null; this.state.prompt = ''; this.drawStone(); } return; }
    this.demo = { t: 0, next: 1.4 }; this.state.name = ''; this.state.prompt = 'WHO ARE YOU'; this.drawStone();
  }
  stepDemo(dt) {
    const D = this.demo; if (!D) return;
    D.t += dt;
    if (D.t >= D.next) { D.next = D.t + 2.6 + this.rand() * 1.6; this.chiselAt(1, true); }
  }

  name(name) {
    if (!this.active || !name) return;
    this.settle();
    if (!CX_OLD && this.state.nameFinal && this.state.name === String(name).trim()) return; /* already cut (from the typed name) */
    this.state.name = String(name).trim(); this.state.nameFinal = true;
    if (!CX_OLD) { const n = this.state.name.length; this.state.nameCut = 0; this.etch = { t: 0, i: 0, n, per: Math.max(0.055, Math.min(0.2, 1.05 / Math.max(1, n))) }; this.etchK = 1; this.drawStone(); this.chisel = 1; this.flare = Math.max(this.flare, 1.1); return; }
    this.drawStone(); this.nameT = 0;
    const at = this.dress?.sign?.face ? this.stoneFace(0.5, 0.43) : this.stone.localToWorld(V3(0, STONE.h * 0.43 - 0.14 - STONE.h / 2 + 0.07, STONE.d / 2 + 0.05).add(V3(0, STONE.h / 2, 0)));
    this.burst(at, 70, 0xffb860, { speed: 1.8, up: 1.0, life: 1.1, size: 0.04, spread: 0.9 });
    this.world.flash(0.12);
    sfx('deflect', { gain: 0.35 });
  }
  /* the name is cut one letter at a time (a chisel strike, sparks and a tick each), then the whole name flares,
     the sigil burns in and the camp shakes once: about 0.6 s for a five-letter name */
  etchTick(dt) {
    const E = this.etch; const st = this.state; E.t += dt;
    const k = Math.min(E.n, Math.floor(E.t / E.per) + 1);
    if (k > E.i) {
      E.i = k; st.nameCut = k; this.drawStone(); this.chisel = 1;
      const xs = this.etchXs; const r = this.rand;
      if (xs && xs[k] != null) { const at = this.stoneFace((xs[k - 1] + xs[k]) / 2, 0.43); for (let j = 0; j < 16; j++) this.spawn(at.x, at.y, at.z, (r() - 0.5) * 2.4, 0.6 + r() * 1.9, 0.6 + r() * 1.3, 0.3 + r() * 0.35, 0.03 + r() * 0.02, j % 3 ? 0xffc070 : 0xfff2d0, { drag: 2.2, lift: -3 }); }
      if (xs && xs[k] != null) { const at = this.stoneFace((xs[k - 1] + xs[k]) / 2, 0.47); for (let j = 0; j < 10; j++) this.spawn(at.x + (r() - 0.5) * 0.08, at.y, at.z + 0.02, (r() - 0.5) * 0.3, -0.2 - r() * 0.4, 0.15 + r() * 0.25, 0.7 + r() * 0.5, 0.022 + r() * 0.014, j % 2 ? 0x8f8478 : 0xb8ab98, { drag: 1.8, lift: -2.2, alpha: 0.8 }); }
      if (/\S/.test(st.name[k - 1] || '')) { sfx('deflect', { gain: 0.12 + 0.04 * (k % 2) }); fx('chisel', k); this.world.kick(0.018); this.etchK = Math.max(this.etchK || 0, 0.85); }
    }
    /* the name is whole: a pulse of light runs along it, letter to letter */
    if (E.i >= E.n && E.sw == null && E.t >= E.n * E.per + 0.04) E.sw = E.t;
    if (E.sw != null && E.t - E.sw < 0.3 && this.etchXs) { const xs = this.etchXs; const u = xs[0] + (xs[xs.length - 1] - xs[0]) * Math.min(1, (E.t - E.sw) / 0.28); const at = this.stoneFace(u, 0.43); const r = this.rand; for (let j = 0; j < 5; j++) this.spawn(at.x, at.y + (r() - 0.5) * 0.08, at.z + 0.03, (r() - 0.5) * 0.4, 0.3 + r() * 0.6, 0.2 + r() * 0.3, 0.35 + r() * 0.2, 0.034, j % 2 ? 0xffffff : 0xffd070, { drag: 2, lift: 0.3 }); this.etchK = Math.max(this.etchK, 0.7); }
    if (E.i >= E.n && E.t >= E.n * E.per + 0.34) {
      this.etch = null; st.nameCut = null; this.drawStone(); this.nameT = 0; this.flare = Math.max(this.flare, 1.6);
      this.burst(this.stoneFace(0.5, 0.43), 100, 0xffb860, { speed: 2.3, up: 1.5, life: 1.2, size: 0.045, spread: 0.9 });
      this.burst(this.stoneFace(0.5, 0.2), 40, 0xffd890, { speed: 1.2, up: 1.8, life: 1.3, size: 0.04, spread: 0.3 });
      this.world.flash(0.45); this.world.kick(0.09); sfx('clang', { gain: 0.3 }); sfx('soul', { gain: 0.32 }); fx('boom'); this.etchK = 1.4;
      this.burst(this.stoneFace(0.5, 0.43), 60, 0xff9a40, { speed: 0.6, up: 1.4, life: 2.2, size: 0.04, spread: 0.8, drag: 0.8, lift: 0.9 }); /* embers rise off the hot letters */
      { const r = this.rand; for (let j = 0; j < 40; j++) { const at = this.stoneFace(0.15 + r() * 0.7, 0.36 + r() * 0.16); this.spawn(at.x, at.y, at.z + 0.02, (r() - 0.5) * 0.4, -0.1 - r() * 0.3, 0.2 + r() * 0.3, 0.9 + r() * 0.6, 0.024, 0x9a8e80, { drag: 1.6, lift: -2, alpha: 0.75 }); } }
    }
  }
  born({ birth, sign, age, season } = {}) {
    if (!this.active) return;
    this.settle();
    let month = null; let day = null; let year = null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth || '');
    if (m) { year = +m[1]; month = +m[2]; day = +m[3]; }
    if (!month) { const d = parseDate(this.typed.born || ''); if (d) { month = d.month; day = d.day; year = year || d.year; } }
    if (!month && sign) month = SIGN_MONTH[sign] || season || null; /* a hidden sign: the season comes from the seed (main.js) */
    if (month && !this.weatherSet) this.setSeason(month);
    if (sign) this.setConstellation(sign); else if (month && day) this.setConstellation(signOf(null, { month, day }));
    if (year && month && day) { const key = `${year}-${month}-${day}`; if (key !== this.dateKey) { this.dateKey = key; this.setMoon(moonPhase(new Date(Date.UTC(year, month - 1, day, 12))), true); } }
    this.state.age = age?.age ?? null;
    this.state.date = year && month && day ? `${roman(day)} · ${roman(month)} · ${roman(year)}` : month && day ? `${roman(day)} · ${roman(month)}` : year ? roman(year) : null;
    this.drawStone();
    sfx('soul', { gain: 0.6 });
  }
  /* the end card: the camp as it stood after the questions, set at once, with no sound and no flash */
  restore({ name, birth, sign, biome, place, weaponName, element, won = true } = {}) {
    if (!this.active) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth || '');
    const [year, month, day] = m ? [+m[1], +m[2], +m[3]] : [null, sign ? SIGN_MONTH[sign] : null, null];
    if (month) this.setSeason(month);
    if (sign) this.setConstellation(sign);
    this.consDraw = 99; this.consAge = -Infinity;
    if (year && month && day) this.setMoon(moonPhase(new Date(Date.UTC(year, month - 1, day, 12))), false);
    this.state.name = String(name || '').trim(); this.state.nameFinal = true;
    this.state.date = year && month && day ? `${roman(day)} · ${roman(month)} · ${roman(year)}` : null;
    if (biome) {
      this.biome = biome; this.hills.visible = false;
      const look = W.LAND_LOOK?.[biome.id];
      if (look?.key) { this.moonDirTarget.set(...look.key).normalize(); this.moonDir.copy(this.moonDirTarget); }
      this.fogU.uColor.value.copy(new THREE.Color(biome.fog)).multiplyScalar(1.25);
    }
    this.state.place = String(place || biome?.label?.replace(/^The /, '') || '').trim();
    if (element) {
      const col = ELEMENT_FIRE[element.id] || ELEMENT_FIRE.fire;
      this.fireTarget = { core: new THREE.Color(col[0]), mid: new THREE.Color(col[1]), edge: new THREE.Color(col[2]), light: new THREE.Color(col[3]) };
      for (const k of Object.keys(this.fireTarget)) this.fireCols[k].copy(this.fireTarget[k]);
      this.state.weaponCol = '#' + new THREE.Color(element.color ?? 0xffa040).lerp(new THREE.Color(0xffffff), 0.35).getHexString();
    }
    this.state.weapon = weaponName || null;
    this.drawStone();
    /* the card: warm firelight on the hero's front, so the face and the chest read (the fire itself may burn frost-blue) */
    /* and the hero turns toward the viewer, a little toward the fire, so the front reads instead of the back of the cloak */
    this.heroYaw = null; this.turn = -0.12; if (this.actor) this.actor.root.rotation.y = this.turn; this.labelScale = 0.74;
    /* the card frames the hero close: the stone is out of the picture (all of it, never a cut name) */
    this.hideStone = true; this.stone.visible = false; if (this.dress?.signH) this.dress.signH.visible = false; this.poseEnemy(won ? 'won' : 'lost');
    /* a lost run: the fire is dying, low red embers and a thin line of smoke, not a gas flame */
    this.dying = !won;
    if (this.dying) {
      this.fireTarget = { core: new THREE.Color(0xffb060), mid: new THREE.Color(0xe0440e), edge: new THREE.Color(0x5a0e04), light: new THREE.Color(0xff6a2a) };
      for (const k of Object.keys(this.fireTarget)) this.fireCols[k].copy(this.fireTarget[k]);
      this.flameU.uPower.value = 0.55; this.smokeU.uOpacity.value = 0.55; this.smokeU.uSize.value = 0.32; this.smokeU.uColor.value.set(0x8c8882); this.halo.scale.set(2.2, 2.2, 1);
    }
    if (this.heroKey) this.heroKey.intensity = 0;
    if (!this.key) {
      const f = Math.sin(this.turn + 0.35); const z = Math.cos(this.turn + 0.35);
      this.key = new THREE.PointLight(0xffa060, 90, 7, 2); this.key.position.set(f * 1.25, 1.6, z * 1.25); this.group.add(this.key);
      /* a kneeling hero bows into the key: from above it would wash the hood flat (a bare-looking head), so the key drops low and soft */
      if (!won) { this.key.intensity = 14; this.key.position.set(f * 2.3, 1.2, z * 2.3); }
      this.fill = new THREE.PointLight(0xff8a4a, 2.5, 5, 2); this.fill.position.set(0.7, 0.6, 1.2); this.group.add(this.fill);
      /* a world camp may set its card light (camp.cardLight = { color, power, fill }): a dark suit under a warm fire key reads copper */
      /* a world camp with no card light gets a neutral, softer key: the dark fire key turns a world's dark suit to bare copper */
      const CL = this.campMod?.cardLight || (this.worldId !== 'dark' ? { color: 0xe6e0d6, power: 0.5, fill: 0x8a96ac } : null); if (CL) { if (CL.color != null) this.key.color.set(CL.color); this.key.intensity *= CL.power ?? 1; if (CL.fill != null) this.fill.color.set(CL.fill); this.fill.intensity *= CL.power ?? 1; }
    }
  }
  land(biome, place) {
    if (!this.active || !biome) return;
    this.settle();
    /* the same land again (the place name arrived): no second reveal */
    const again = this.biome?.id === biome.id; this.biome = biome;
    const look = W.LAND_LOOK?.[biome.id];
    if (look?.key) { this.moonDirTarget.set(...look.key).normalize(); this.moonDir.copy(this.moonDirTarget); this.moonTint.set(0xffffff).lerp(new THREE.Color(look.keyCol ?? 0xffffff), 0.55); }
    /* a soft ring runs out over the ground; no lit wall (its hard rim on the horizon made the world read as a small disc) */
    if (!again) { this.ringU.uColor.value.set(RING_COL); this.ringT = 0; this.ring.visible = true; this.wall.visible = false; this.partT = 0; }
    this.landT = 0;
    this.state.place = String(place || biome.label.replace(/^The /, '')).trim();
    this.drawStone();
    this.fogU.uColor.value.copy(new THREE.Color(biome.fog)).multiplyScalar(1.25);
    this.world.kick(0.04);
    sfx('soul', { gain: 0.45 });
  }
  heart(mentions = [], motive = null, desire = null) {
    if (!this.active) return;
    this.settle();
    const list = this.companionList(mentions);
    this.motive = motive; this.desire = desire;
    this.syncCompanions(list);
    if (!list.length) {
      const s = this.seats[1]; this.wish.position.set(s.x, s.top + 0.02, s.z); this.wish.visible = true; this.wishT = 0;
      const L = this.labels[4]; this.drawLabel(L, desire ? `“${shorten(desire, 34)}”` : '', true); L.s.visible = !!desire; L.s.scale.set(2.8, 0.7, 1);
      this.burst(V3(s.x, s.top + 0.3, s.z), 40, 0xffd8a0, { speed: 0.8, up: 1.2, life: 1.2, size: 0.035 });
      sfx('soul', { gain: 0.5 });
    } else if (this.wish.visible) { this.wish.visible = false; this.labels[4].s.visible = false; }
  }
  /* the end card: the ones the hero fought for sit by the fire again, already formed, with no sound */
  /* kinds = main's person/animal list for the same mentions (S.kinds): a quick start has no heart text, so without it
     a dog named Ash became a second cloaked figure */
  restoreCompanions(mentions = [], heartText = '', kinds = null) {
    if (!this.active) return;
    /* the card waits for the designed spirit figures, so it never shows plain placeholders */
    if (!this.QP && this.qpReady) return this.qpReady.then(() => this.restoreCompanions(mentions, heartText, kinds));
    if (this.worldId !== 'dark' && !this.Folk && this.folkReady) return this.folkReady.then(() => this.restoreCompanions(mentions, heartText, kinds));
    this.cardLabels = true;
    this.typed.heart = heartText || '';
    const list = this.companionList(mentions).map((m, i) => (kinds?.[i] === 'animal' && m.kind !== 'pet' ? { ...m, kind: 'pet', species: m.species || 'hound', quiet: true } : { ...m, quiet: true }));
    this.syncCompanions(list);
    /* the card: the hero is the subject. The animal lies at the hero's feet, a person stands behind the fire;
       no name labels (the story on the card already names them). The figures settle before the picture is taken. */
    const cam = this.world.camera; let na = 0;
    /* a person never stands in or behind the flames. Each spot is scored from the card camera:
       its screen box must clear the fire (ring 0.75 m, flames to 1.8 m), the hero and the people already placed. */
    const view = this.view || cam; view.updateMatrixWorld(true);
    const fireR = this.rectOf([V3(FIRE.x - 0.42, 0.25, FIRE.z), V3(FIRE.x + 0.42, 0.25, FIRE.z), V3(FIRE.x, 0.25, FIRE.z - 0.42), V3(FIRE.x, 0.25, FIRE.z + 0.42), V3(FIRE.x - 0.42, 1.8, FIRE.z), V3(FIRE.x + 0.42, 1.8, FIRE.z)], view);
    const heroR = this.rectOf(this.framePoints('hero'), view);
    const PEOPLE = [[2.05, -0.35], [2.75, 0.55], [2.95, -0.6], [2.5, -1.0], [2.6, 1.85], [-1.35, -0.75], [0.55, -1.2], [-0.2, -1.6]];
    const placed = []; const B = this.layout?.band;
    for (const c of this.companions) {
      c.t = 4; c.alpha = 1; if (c.label) { c.label.alpha = 0; c.label.s.visible = false; } c.noLabel = true;
      if (!c.fig) continue;
      const animal = c.fig.kind === 'animal';
      let spot;
      if (animal) spot = [[-0.85, 0.75], [0.7, 1.15]][na++ % 2];
      else {
        let bs = Infinity;
        PEOPLE.forEach(([x, z], i) => {
          if (Math.hypot(x - FIRE.x, z - FIRE.z) < 1.3 || placed.some((p) => Math.hypot(p.x - x, p.z - z) < 1.0)) return;
          const r = this.rectOf([V3(x - 0.4, 0, z), V3(x + 0.4, 0, z), V3(x - 0.4, 1.85, z), V3(x + 0.4, 1.85, z)], view); const area = Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0));
          const out = B ? (Math.max(0, B.x0 + 20 - r.x0) + Math.max(0, r.x1 - B.x1 + 20)) / Math.max(1, r.x1 - r.x0) : 0;
          const s = overlap(r, fireR) / area * 10 + overlap(r, heroR) / area * 6 + placed.reduce((a, p) => a + overlap(r, p.r) / area * 8, 0) + out * 8 + i * 0.03;
          if (s < bs) { bs = s; spot = [x, z, r]; }
        });
        spot ||= PEOPLE[placed.length % PEOPLE.length];
        placed.push({ x: spot[0], z: spot[1], r: spot[2] || { x0: 0, x1: 0, y0: 0, y1: 0 } });
      }
      /* the animal sits up by the hero (lying, its stiff legs read as a toy) */
      c.at = { x: spot[0], z: spot[1] }; c.fig.position.set(spot[0], 0, spot[1]); c.fig.setState('with');
    }
    for (let i = 0; i < 50; i++) for (const c of this.companions) if (c.qp) c.qp.update(0.1, this.time, view);
  }
  companionList(mentions = []) {
    for (const [k, v] of guessMentions(this.typed.heart || '')) this.guesses.set(k, v);
    return (mentions || []).filter((m) => m && m.text).map((m) => {
      const key = m.text.toLowerCase().replace(/^(my|our)\s+\w+\s+/, '');
      const words = m.text.toLowerCase().split(/\s+/);
      const rel = words.find((w) => PET_WORDS[w] || PEOPLE_WORDS[w]);
      const name = m.text.replace(new RegExp(`^(my|our)?\\s*(${REL})\\s+`, 'i'), '').trim() || m.text;
      const g = this.guesses.get(name.toLowerCase()) || this.guesses.get(key);
      let kind = ['pet', 'child', 'partner', 'friend', 'family', 'person'].includes(m.kind) ? m.kind : null;
      let species = null;
      if (g) { kind = kind && kind !== 'person' ? kind : g.kind; species = g.species; }
      if (rel) { kind = PET_WORDS[rel] ? 'pet' : PEOPLE_WORDS[rel]; species = PET_WORDS[rel] || species; }
      return { text: name, kind: kind || 'person', species: kind === 'pet' ? species || 'hound' : null };
    });
  }
  enemy(nemesis, words) {
    if (!this.active) return;
    this.settle();
    const w = this.world; this.nemesis = nemesis; this.enemyT = 0; this.poseEnemy('step');
    this.gust = 1; this.windDir.set(-0.85, 0.5).normalize(); this.dimTarget = 1;
    const accent = new THREE.Color(this.biome?.accent ?? 0xff3a1a);
    /* the sky bleeds toward the land's accent */
    if (w.biome && !this.bleed) {
      const sky = w.lands.skyTarget;
      this.bleed = { biome: w.biome, sky, band: sky?.band ?? 0, bandCol: sky?.bandCol?.clone() ?? new THREE.Color() };
    }
    if (w.biome) { w.target.bottom.set(w.biome.sky[1]).lerp(accent, 0.38); w.target.fog.set(w.biome.fog).lerp(accent, 0.12); }
    else { w.target.bottom.lerp(accent, 0.38); }
    if (w.lands.skyTarget) { w.lands.skyTarget.band = Math.max(w.lands.skyTarget.band, 1.1); w.lands.skyTarget.bandCol.copy(accent).multiplyScalar(0.8); }
    this.enemyWords = String(words || nemesis?.label || '').trim(); this.wordsFade = null;
    if (this.enemyWords) {
      this.drawSkyWords(this.enemyWords);
      /* a world font may still be loading: draw again when it is in */
      if (this.wui?.serif && document?.fonts?.load) { const ew = this.enemyWords; document.fonts.load(`700 64px ${this.serifW}`).then(() => { if (this.active && this.enemyWords === ew) this.drawSkyWords(ew); }).catch(() => {}); }
      /* a daylight world may give a dark ink for words on its bright sky (ui.ink); else the ember */
      if (this.wui?.ink || this.wui?.ember) this.skyTextU.uColor.value.set(this.wui.ink || this.wui.ember); else this.skyTextU.uColor.value.copy(accent).lerp(new THREE.Color(0xff3a20), 0.35);
      this.wordsT = 0; this.skyWords.visible = true;
      this.placeSkyWords();
    }
    w.flash(0.3); w.kick(0.09);
    this.burst(V3(FIRE.x, 0.8, FIRE.z), 60, 0xff6a30, { speed: 1.2, up: 1.5, life: 1.4, size: 0.045, spread: 0.4, drag: 0.8, lift: 0.3 });
    const snd = NEMESIS_SOUND[nemesis?.id]; if (snd) sfx(snd, { gain: 0.55 });
  }
  placeSkyWords() {
    if (this.layout) { this.placeSky(0); return; }
    /* no layout: toward where the camera looks, above the horizon */
    const cam = this.world.camera; const dir = cam.getWorldDirection(V3()).setY(0).normalize();
    const D = 70; const p = cam.position.clone().addScaledVector(dir, D); p.y = cam.position.y + D * Math.tan(0.21);
    this.skyWords.position.copy(p); this.skyWords.lookAt(cam.position); this.skyWords.scale.setScalar(D * 0.95);
  }
  weapon(weapon, material, element, name) {
    if (!this.active) return;
    this.settle();
    const col = ELEMENT_FIRE[element?.id] || ELEMENT_FIRE.fire;
    this.fireTarget = { core: new THREE.Color(col[0]), mid: new THREE.Color(col[1]), edge: new THREE.Color(col[2]), light: new THREE.Color(col[3]) };
    this.weaponT = 0; this.flare = 1.6; this.weaponDef = weapon || null;
    this.steamU.uBurst.value = 0; this.steamU.uOpacity.value = 0.5;
    const hot = element?.color ?? 0xffa040; this.forgeCol = hot; this.forgeEl = element?.id || null;
    this.burst(V3(FIRE.x, 0.7, FIRE.z), 180, hot, { speed: 4.2, up: 4, life: 1.5, size: 0.05, spread: 0.3, drag: 1.4, lift: -3 });
    this.burst(V3(FIRE.x, 0.7, FIRE.z), 80, 0xfff2d0, { speed: 2, up: 5, life: 1.0, size: 0.04, spread: 0.2 });
    this.world.flash(0.7); this.world.kick(0.12);
    this.state.weapon = name || weapon?.label || null; this.state.weaponCol = '#' + new THREE.Color(hot).lerp(new THREE.Color(0xffffff), 0.35).getHexString();
    this.drawStone();
    sfx('fireBreath', { gain: 0.45 });
  }

  /* ================================================================ the reveals
     A reveal starts the moment an answer's result lands (main.js stage()). It moves the camera to the hero and the thing
     that changed, turns the hero toward it, plays one staged effect, holds, and ends; the next question then takes its
     own calm framing. No new lights are made while a reveal runs (a new
     light recompiles every lit material): the hero's key and rim exist from setHero, everything else is sprites, an
     additive pillar and the pooled embers. */
  buildStage() {
    this.rv = null; this.heroYaw = null; this.keyK = 1; this.keyCol = null; this.rimK = 1; this.expK = 1; this.nemBlend = 0; this.nemRise = 1; this.nemRiseTo = 1; this.gazeK = 0; this.gazeTo = 0;
    this.nemHead = V3(0, 30, -100); this.pillarT = -1; this.orbT = -1; this.wglowT = -1; this.beautyT = -1; this.pulses = {};
    this.pillarU = { uColor: { value: new THREE.Color(0xffd9a0) }, uK: { value: 0 }, uTime: { value: 0 } };
    const pg = this.own(new THREE.CylinderGeometry(0.72, 0.95, 4.8, 32, 1, true)); pg.translate(0, 2.4, 0);
    const pm = this.own(new THREE.ShaderMaterial({ uniforms: this.pillarU, vertexShader: PLAIN_VERT, fragmentShader: PILLAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.pillar = new THREE.Mesh(pg, pm); this.pillar.visible = false; this.pillar.renderOrder = 8; this.pillar.frustumCulled = false; this.group.add(this.pillar);
    const halo = this.own(haloTexture());
    const spr = (col, test = true) => { const s = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: halo, color: col, transparent: true, opacity: 0, depthWrite: false, depthTest: test, blending: THREE.AdditiveBlending, fog: false }))); s.visible = false; s.renderOrder = 9; this.group.add(s); return s; };
    this.orb = spr(0xb8a8ff); this.wglow = spr(0xffc070); this.gaze = spr(0xff5030);
    /* the forge: an anvil on a stump and a hammer, by the fire on the camera's side; shown only while the weapon is made */
    const iron = this.own(new THREE.MeshStandardMaterial({ color: 0x30333a, metalness: 0.75, roughness: 0.42 })); const wood = this.own(new THREE.MeshStandardMaterial({ color: 0x3a2a1c, metalness: 0, roughness: 0.92 }));
    const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(this.own(g), m); o.position.set(x, y, z); o.castShadow = false; o.receiveShadow = true; return o; };
    const F = this.forge = new THREE.Group(); F.position.set(ANVIL.x, 0, ANVIL.z); F.rotation.y = 0.5; F.visible = false; this.group.add(F);
    F.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.42, 12), wood, 0, 0.21, 0));
    F.add(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.16), iron, 0, 0.47, 0));
    F.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.12), iron, 0, 0.55, 0));
    F.add(mesh(new THREE.BoxGeometry(0.52, 0.1, 0.2), iron, 0, 0.63, 0));
    { const horn = mesh(new THREE.ConeGeometry(0.085, 0.3, 12), iron, 0.4, 0.635, 0); horn.rotation.z = -Math.PI / 2; F.add(horn); }
    if (!CX_OLD) {
      /* the anvil reads as one forged piece: a heel, a waist, a bright worked face and banded stump */
      iron.color.set(0x4a4e57); iron.roughness = 0.34;
      const face = this.own(new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.9, roughness: 0.22 }));
      F.add(mesh(new THREE.BoxGeometry(0.5, 0.012, 0.18), face, 0, 0.686, 0));
      F.add(mesh(new THREE.BoxGeometry(0.1, 0.07, 0.15), iron, -0.3, 0.635, 0));
      F.add(mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.1, 12), iron, 0, 0.55, 0));
      const band = this.own(new THREE.MeshStandardMaterial({ color: 0x26282c, metalness: 0.8, roughness: 0.5 }));
      for (const y of [0.08, 0.34]) F.add(mesh(new THREE.CylinderGeometry(y > 0.2 ? 0.207 : 0.247, y > 0.2 ? 0.212 : 0.252, 0.03, 16), band, 0, y, 0));
    }
    const H = this.hammer = new THREE.Group(); H.position.set(-0.5, ANVIL_TOP + 0.05, 0.02); F.add(H);
    { const hg = new THREE.CylinderGeometry(0.017, 0.02, 0.5, 8); hg.rotateZ(Math.PI / 2); H.add(mesh(hg, wood, 0.25, 0, 0)); H.add(mesh(new THREE.BoxGeometry(0.08, 0.15, 0.08), iron, 0.5, -0.01, 0)); }
    H.rotation.z = 1.2;
    /* the pillar, the sprites and the forge compile now, unseen, so no reveal waits for a shader */
    setTimeout(() => { if (!this.active) return; const R = this.world.renderer; const shown = [this.pillar, this.orb, this.wglow, this.gaze, F]; for (const o of shown) o.visible = true;
      const done = () => { for (const o of shown) o.visible = false; }; try { const p = R.compileAsync?.(this.group, this.world.camera, this.world.scene); if (p?.then) p.then(done, done); else { R.compile(this.group, this.world.camera, this.world.scene); done(); } } catch { done(); } }, 900);
  }
  /* what a shot must hold: 'hero', 'stone', 'fire', 'companions', 'forge', 'arm' (the raised weapon), 'all', 'card', joined by '+' */
  shotPoints(spec) {
    const out = [];
    for (const k of String(spec || 'all').split('+')) {
      if (k === 'companions') { for (const c of this.companions || []) { if (!c.pos || c.orbit || c.leaving) continue; const p = c.pos; const h = (c.labelY ?? 1.3) + 0.1; out.push(V3(p.x - 0.4, 0, p.z), V3(p.x + 0.4, 0, p.z), V3(p.x - 0.4, h, p.z), V3(p.x + 0.4, h, p.z)); } }
      else if (k === 'forge') { const a = this.forge.position; for (const [x, z] of [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]]) out.push(V3(a.x + x, 0.28, a.z + z), V3(a.x + x, 1.3, a.z + z)); }
      else if (k === 'anvil') { this.forge.updateWorldMatrix(true, false); for (const x of [-0.38, 0.38]) for (const y of [0.28, this.forgeTop ?? ANVIL_TOP + 0.16]) for (const z of [-0.16, 0.16]) out.push(this.forge.localToWorld(V3(x, y, z))); } /* the anvil itself, at its real size */
      else if (k === 'gear') { const b = this.gearBox(); if (!b.isEmpty()) for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(V3(x, y, z)); }
      else if (k === 'arm') { const p = this.actor?.root.position || V3(); out.push(V3(p.x - 0.5, 2.7, p.z), V3(p.x + 0.5, 2.7, p.z)); }
      else out.push(...this.framePoints(k));
    }
    return out.length ? out : this.framePoints('all');
  }
  shot(id, o = {}) { this.shotId = id; try { this.onShot?.(id, o); } catch (err) { console.warn('camp shot', err); } }
  emit(beat) { const R = this.rv; if (!R) return; try { R.opts.onBeat?.(beat, R.kind); } catch (err) { console.warn('reveal beat', err); } try { window.dispatchEvent(new CustomEvent('sq-reveal', { detail: { kind: R.kind, beat, t: R.t } })); } catch { /* no window */ } }
  get revealing() { return this.rv?.kind || null; }
  revealLeft() { return this.rv ? Math.max(0, this.rv.dur - this.rv.t) : 0; }
  reveal(kind, opts = {}) {
    const make = STAGE[kind];
    if (!this.active || !make || !this.pillar) { try { opts.swap?.(); } catch { /* the caller's own */ } return Promise.resolve(); }
    this.endReveal(true);
    let done; const p = new Promise((r) => { done = r; });
    const R = this.rv = { kind, t: 0, i: 0, opts, done, quiet: false, state: {} };
    const plan = make(this, R); R.dur = plan.dur; R.beats = plan.beats.slice().sort((a, b) => a[0] - b[0]); R.tick = plan.tick || null; R.end = plan.end || null;
    this.stepReveal(0);
    return p;
  }
  stepReveal(dt) {
    const R = this.rv; if (!R) return; R.t += dt;
    while (R.i < R.beats.length && R.beats[R.i][0] <= R.t) { const [, name, fn] = R.beats[R.i++]; try { fn?.(); } catch (err) { console.warn('reveal', R.kind, name, err); } if (this.rv !== R) return; if (name) this.emit(name); }
    try { R.tick?.(dt, R.t); } catch (err) { console.warn('reveal tick', err); R.tick = null; }
    if (R.t >= R.dur) this.endReveal(false);
  }
  /* ends the reveal on its end state: every beat still to come runs once, without its particles and sound */
  endReveal(early) {
    const R = this.rv; if (!R) return;
    if (early) { R.quiet = true; while (R.i < R.beats.length) { const [, name, fn] = R.beats[R.i++]; try { fn?.(); } catch (err) { console.warn('reveal', err); } if (name) this.emit(name); } }
    try { R.end?.(early); } catch (err) { console.warn('reveal end', err); }
    this.emit('end'); this.rv = null; R.done();
  }
  skipReveal() { if (this.rv) this.endReveal(true); }
  /* the hero turns toward a point on the ground (null: back to the stance of the step) */
  faceTo(x, z) { const p = this.actor?.root.position; if (!p) return; this.heroYaw = Math.atan2(x - p.x, z - p.z); }
  faceCam(off = 0) { const c = this.view || this.world.camera; const p = this.actor?.root.position; if (!p) return; this.heroYaw = Math.atan2(c.position.x - p.x, c.position.z - p.z) + off; }
  faceHome() { this.heroYaw = this.turn ?? HERO_TURN; this.yawHome = true; }
  stepStage(dt) {
    this.stepReveal(dt); this.stepMist(dt);
    const a = this.actor; const t = this.time;
    /* the hero's turn: a damped swing, the short way round */
    if (a && this.heroYaw != null) { let d = this.heroYaw - a.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); a.root.rotation.y += d * Math.min(1, dt * 4.2); if (this.yawHome && Math.abs(d) < 0.01) { this.heroYaw = null; this.yawHome = false; } }
    /* the key and the rim follow the hero; a reveal may tint and lift the key */
    if (a && this.heroKey) {
      const p = a.root.position; const y = a.root.rotation.y + 0.45; this.heroKey.position.set(p.x + Math.sin(y) * 1.5, 2.0, p.z + Math.cos(y) * 1.5);
      const want = this.key ? 0 : HERO_KEY * this.keyK; this.heroKey.intensity += (want - this.heroKey.intensity) * Math.min(1, dt * 6);
      this.heroKey.color.lerp(_c.set(this.keyCol ?? 0xf4ece6), Math.min(1, dt * 5));
      if (this.heroRim) { const c = this.world.camera.position; const bx = p.x - c.x; const bz = p.z - c.z; const bl = Math.hypot(bx, bz) || 1; this.heroRim.position.set(p.x + (bx / bl) * 1.3 - (bz / bl) * 0.9, 2.3, p.z + (bz / bl) * 1.3 + (bx / bl) * 0.9); const rw = this.key ? 0 : HERO_RIM * this.rimK; this.heroRim.intensity += (rw - this.heroRim.intensity) * Math.min(1, dt * 6); this.heroRim.color.lerp(_c.set(this.rimCol ?? 0x9db8ff), Math.min(1, dt * 5)); }
    }
    this.keyK += (1 - this.keyK) * Math.min(1, dt * 1.6); this.rimK += (1 - this.rimK) * Math.min(1, dt * 1.2); this.expK += (1 - this.expK) * Math.min(1, dt * 1.4);
    /* the class pillar */
    if (this.pillarT >= 0) { this.pillarT += dt; const k = smooth(0, 0.32, this.pillarT) * (1 - smooth(0.75, 1.7, this.pillarT)); this.pillarU.uK.value = k; this.pillarU.uTime.value = t; this.pillar.visible = k > 0.004; if (a) this.pillar.position.copy(a.root.position); this.pillar.scale.set(1 + 0.25 * (1 - k), 0.2 + 0.8 * smooth(0, 0.4, this.pillarT), 1 + 0.25 * (1 - k)); if (this.pillarT > 1.8) { this.pillarT = -1; this.pillar.visible = false; } }
    /* the glow in the hero's hand (the class mark) */
    if (this.orbT >= 0) { this.orbT += dt; const k = smooth(0, 0.25, this.orbT) * (1 - smooth(1.5, 2.4, this.orbT)); const h = a?.slot?.('handslotr'); if (h && k > 0.004) { h.getWorldPosition(this.orb.position); this.orb.visible = true; this.orb.material.opacity = 0.9 * k; this.orb.scale.setScalar(0.55 + 0.1 * Math.sin(t * 11)); } else this.orb.visible = false; if (this.orbT > 2.5) { this.orbT = -1; this.orb.visible = false; } }
    /* the weapon's glow (the forge sets its place; after the take it rides the weapon hand) */
    if (this.wglowT >= 0) { this.wglowT += dt; const k = (this.wglowK ?? 1) * (1 - smooth(this.wglowLife - 0.6, this.wglowLife, this.wglowT)); this.wglow.visible = k > 0.004; this.wglow.material.opacity = Math.min(1, k); if (this.wglowHand) { const h = a?.slot?.('handslotr'); if (h) { h.getWorldPosition(this.wglow.position); this.wglow.position.y += 0.35; } } if (this.wglowT > this.wglowLife) { this.wglowT = -1; this.wglow.visible = false; } }
    /* the enemy: the blend to its arrival pose, its rise out of the haze and its gaze */
    const arr = this.nemMode === 'arrive' ? 1 : 0; this.nemBlend += (arr - this.nemBlend) * Math.min(1, dt * 1.8);
    this.nemShowK = (this.nemShowK || 0) + ((this.beautyT >= 0 ? this.nemShow || 0 : 0) - (this.nemShowK || 0)) * Math.min(1, dt * 1.6);
    this.nemRise += (this.nemRiseTo - this.nemRise) * Math.min(1, dt * (this.nemRiseTo > this.nemRise ? 1.5 : 7));
    this.gazeK += (this.gazeTo - this.gazeK) * Math.min(1, dt * 5);
    const nm = this.world.nemesis; const gv = this.gazeK > 0.01 && nm && !nm.leaving && (this.nemMode === 'arrive' || this.nemMode === 'step');
    this.gaze.visible = !!gv; if (gv) { const c = this.world.camera.position; _v.copy(c).sub(this.nemHead).normalize(); this.gaze.position.copy(this.nemHead).addScaledVector(_v, 3); const fl = 0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 5.3); this.gaze.material.opacity = Math.min(1, this.gazeK * fl * (nm.mats?.[0]?.opacity ?? 1)); this.gaze.scale.setScalar((this.nemH || 30) * (nm.boss ? 0.2 : 0.13) * (0.9 + 0.25 * this.gazeK)); this.gaze.material.color.set(this.biome?.accent ?? 0xff5030).lerp(_c.set(0xffffff), 0.35); }
    /* the final shot keeps a slow drift once its orbit is done */
    if (this.beautyT >= 0) { this.beautyT += dt; if (this.beautyT >= this.beautyDur && this.beautyDone) { const d = this.beautyDone; this.beautyDone = null; d(); } }
    /* a pulse on one part (pulse()): companions' tags count their own time */
    for (const c of this.companions || []) if (c.tagT != null) c.tagT += dt;
  }
  /* the tag of a companion: on at its arrival beat, off 2.6 s later (never carried into the next step); the card shows all */
  tagAlpha(c) { if (this.cardLabels) return 1; if (c.tagT == null) return 0; return smooth(0, 0.35, c.tagT) * (1 - smooth(2.6, 3.0, c.tagT)); }
  /* where the thing an answer changed is (the DOM side ends its streak of light here) */
  anchor(kind) {
    if (!this.active) return null;
    const camp = this; const w = V3();
    const at = () => {
      const a = camp.actor?.root.position || V3(); const cs = (camp.companions || []).filter((c) => c.pos && !c.leaving);
      if (kind === 'name') { if (camp.dress?.sign?.face) camp.stoneFace(0.5, 0.43, w); else camp.stone.localToWorld(w.set(0, STONE.h * 0.5, STONE.d / 2 + 0.05)); }
      else if (kind === 'land') w.set(FIRE.x - 2.5, 0.05, FIRE.z - 5.5);
      else if (kind === 'sign') w.copy(camp.consC || _v3.copy(CONST_DIR).multiplyScalar(SKY_R * 0.9));
      else if (kind === 'class') w.set(a.x, 1.25 * (camp.actor?.root.scale.y || 1), a.z);
      else if (kind === 'companions') { if (cs.length) w.set(cs[0].pos.x, (cs[0].orbit ? cs[0].pos.y : 0) + (cs[0].labelY ?? 1.3) - 0.35, cs[0].pos.z); else { const s = camp.seats?.[1]; w.set(s?.x ?? FIRE.x, 0.9, s?.z ?? FIRE.z); } }
      else if (kind === 'enemy') w.copy(camp.nemHead);
      else if (kind === 'weapon') { if (camp.rv?.kind === 'weapon' && camp.forge.visible) w.set(camp.forge.position.x, ANVIL_TOP + 0.1, camp.forge.position.z); else { const h = camp.actor?.slot?.('handslotr'); if (h) { h.getWorldPosition(w); w.y += 0.45; } else w.set(a.x, 1.4, a.z); } }
      else w.set(a.x, 1.2, a.z);
      return w;
    };
    return { get world() { return at(); }, screen() { const p = at(); const cam = camp.world.camera; _v2.copy(p).project(cam); const W = camp.layout?.W ?? innerWidth; const H = camp.layout?.H ?? innerHeight; return { x: (_v2.x + 1) / 2 * W, y: (1 - _v2.y) / 2 * H, visible: _v2.z < 1 && Math.abs(_v2.x) <= 1.05 && Math.abs(_v2.y) <= 1.05 }; } };
  }
  /* one part of the build lights for a moment (the final screen lights each in turn) */
  pulse(part) {
    if (!this.active) return;
    const a = this.actor?.root.position || V3();
    if (part === 'name') { this.nameT = 0; this.chisel = 1; }
    else if (part === 'land') { if (this.biome) { this.ringU.uColor.value.set(RING_COL); this.ringT = 0; this.ring.visible = true; } }
    else if (part === 'sign') { this.consAge = 0; this.consDraw = 0; }
    else if (part === 'class') { this.keyK = 2.2; this.rimK = 2.6; this.burst(V3(a.x, 1.2, a.z), 26, this.classCol ?? 0xffd08a, { speed: 1.2, up: 1.4, life: 0.9, size: 0.035, spread: 0.45 }); }
    else if (part === 'companions') { for (const c of this.companions || []) { if (!c.pos || c.leaving) continue; c.tagT = 0; this.burst(V3(c.pos.x, (c.orbit ? c.pos.y : 0) + 0.7, c.pos.z), 18, 0xffc880, { speed: 0.9, up: 1.1, life: 0.9, size: 0.035, spread: 0.3 }); } }
    else if (part === 'enemy') { this.gazeK = 1.8; this.gazeTo = 0.8; }
    else if (part === 'weapon') { this.wglow.material.color.set(this.forgeCol ?? 0xffc070); this.wglowT = 0; this.wglowLife = 1.3; this.wglowK = 0.9; this.wglowHand = true; this.wglow.scale.setScalar(0.9); this.flare = Math.max(this.flare, 1.2); }
  }
  /* the final shot: the camera settles behind the fire side, then goes slowly round the hero (about 70 degrees) */
  beauty({ orbit = 1.2, dur = 6.5 } = {}) {
    if (!this.active) return Promise.resolve();
    this.endReveal(true); this.faceHome(); if (!CX_OLD && this.actor && this.weaponDef && !W.holdFor?.(this.weaponDef) && this.actor.has?.('Sword_Block')) { try { this.actor.hold('Sword_Block', 0.5, { fade: 0.3 }); } catch { /* keep the pose */ } } /* the sword is shown, not crouched behind the shield */ this.poseEnemy('step'); this.gazeTo = 1; this.gazeK = Math.max(this.gazeK, 0.6); this.nemShow = 1; /* the enemy was a 50 px smudge in the final frame */
    this.beautyOrbit = orbit; this.shot('beauty0', { rate: 2.4 });
    this.beautyT = 0; this.beautyDur = dur; setTimeout(() => { if (this.active && this.beautyT >= 0) this.shot('beauty', { rate: 2.2 / dur }); }, 450);
    return new Promise((r) => { this.beautyDone = r; });
  }
  /* a companion's arrival beat: it forms (or steps in) now, its lantern flares, and its name sits on it for a moment */
  arrive(c, quiet) {
    if (!c || c.leaving) return; c.tagT = 0;
    if (quiet) return;
    if (c.actor || c.holder) c.t = Math.min(c.t ?? 0, 0.25);
    else if (c.fig && c.at && !c.orbit) { const dx = c.at.x - FIRE.x; const dz = c.at.z - FIRE.z; const l = Math.hypot(dx, dz) || 1; c.walk = { t: 0, fx: c.at.x + (dx / l) * 2.2, fz: c.at.z + (dz / l) * 2.2 }; }
    const y = (c.orbit ? c.pos.y : 0) + 0.8; this.burst(V3(c.pos.x, y, c.pos.z), 34, 0xffc880, { speed: 1.1, up: 1.3, life: 1.0, size: 0.04, spread: 0.35 });
    this.flare = Math.max(this.flare, 1.1); sfx('soul', { gain: 0.4 });
  }
  /* the land's weather, read from the player's own words about the place (cheap: the season flakes, the fog and the wind) */
  weather() {
    /* every weather word counts ("hot, wet" is two), and each one is seen:
       wet / rain / humid / storm / fog / swamp -> a drizzle that stays, low mist over the ground, thicker fog
       hot / heat / dry / desert / sun -> a warm haze (the fog and the light go amber) and slow bright dust
       snow / ice / cold / frost / winter -> snow; wind / gust / breeze -> a gust that leans the fire and the flakes */
    const text = this.typed?.origin || ''; const kinds = new Set(); for (const [re, k] of WEATHER) if (re.test(text)) kinds.add(k);
    if (!kinds.size) return; this.weatherSet = [...kinds].join('+');
    const w = this.world; const look = (L, kind) => { const u = this.seasonU; this.seasonKind = 90 + kind; u.uKind.value = kind; u.uVel.value.set(...L.vel); u.uVary.value.set(...L.vary); u.uSway.value = L.sway; u.uSize.value = L.size; u.uColor.value.set(L.color); if (L.add) u.uColor.value.multiplyScalar(2.2); this.seasonPts.material = L.add ? this.seasonMat.add : this.seasonMat.normal; u.uOpacity.value = 0; this.seasonTarget = L.opacity; this.seasonLock = true; };
    if (kinds.has('snow')) { this.seasonLock = false; this.setSeason(1); this.seasonLock = true; }
    else if (kinds.has('wet')) { look({ vel: [0.5, -6.5, 0.2], vary: [0.25, 1.6, 0.25], sway: 0.05, size: 0.034, color: 0xc4d6e6, opacity: 0.6, add: false }, 0); this.mistT = 0; this.partT = -1; this.fogU.uPart.value = 0; if (this.fogU.uOpacity) this.fogU.uOpacity.value = Math.min(0.62, this.fogU.uOpacity.value * 1.6 + 0.1); try { w.target.fogNear = Math.max(4, (w.target.fogNear || 9) * 0.7); w.target.fogFar = Math.max(40, (w.target.fogFar || 70) * 0.82); } catch { /* the land keeps its fog */ } }
    else if (kinds.has('hot')) look({ vel: [0.1, 0.12, 0.04], vary: [0.2, 0.15, 0.2], sway: 0.9, size: 0.045, color: 0xffd9a0, opacity: 0.8, add: true }, 2);
    if (kinds.has('hot')) { try { for (const k of ['fog', 'light']) w.target[k]?.lerp?.(_c.set(0xe0a060), 0.22); } catch { /* the land keeps its colours */ } this.heat = 1; }
    if (kinds.has('wind')) { this.gust = 1; this.windDir.set(0.9, 0.3).normalize(); }
  }
  /* low mist drifts over the ground for a while after a wet land arrives (pooled sparks, large and faint) */
  stepMist(dt) {
    if (this.mistT == null || this.mistT < 0) return; this.mistT += dt; if (this.mistT > 14) { this.mistT = -1; return; }
    const low = this.world._quality?.tier === 'low'; const n = (low ? 10 : 30) * dt * (1 - smooth(9, 14, this.mistT)); const r = this.rand; let c = Math.floor(n) + (r() < n % 1 ? 1 : 0);
    while (c-- > 0) { const a = r() * TAU; const d = 2 + r() * 9; this.spawn(FIRE.x + Math.cos(a) * d, 0.1 + r() * 0.35, FIRE.z + Math.sin(a) * d - 2, 0.35 + r() * 0.3, 0.04, 0.1, 2.6 + r() * 1.6, 0.16 + r() * 0.16, 0xb8c8c8, { drag: 0.2, lift: 0.02, alpha: 0.09 }); }
  }
  /* the words in the sky break into sparks that fly into the enemy's head */
  streamWords() {
    const m = this.skyWords; if (!m?.visible || !this.enemyWords) return;
    const col = this.skyTextU.uColor.value.getHex(); const to = this.nemHead; const r = this.rand; m.updateWorldMatrix(true, false);
    const n = this.world._quality?.tier === 'low' ? 60 : 150;
    for (let k = 0; k < n; k++) {
      _v.set((r() - 0.5) * 0.86, (r() - 0.5) * 0.16, 0); m.localToWorld(_v); const life = 0.75 + r() * 0.45;
      const mx = (_v.x + to.x) / 2 + (r() - 0.5) * 14; const my = (_v.y + to.y) / 2 + 6 + r() * 10; const mz = (_v.z + to.z) / 2;
      /* two legs through a raised mid point would need a path; one straight flight with a little lift reads the same at this size */
      this.spawn(_v.x, _v.y, _v.z, (to.x - _v.x) / life + (mx - _v.x) * 0.02, (to.y - _v.y) / life + (my - _v.y) * 0.02, (to.z - _v.z) / life + (mz - _v.z) * 0.02, life, 0.7 + r() * 0.5, col, { drag: 0, lift: 0, alpha: 0.95 });
    }
    this.wordsFade = this.time;
  }
  /* ---- the forge ---- */
  heldGear() { const h = this.actor?.slot?.('handslotr'); return h ? h.children.filter((o) => o.visible) : []; }
  forgeStart(R) {
    const S = R.state; this.forgeTop = null; S.gear = this.heldGear(); S.len = 0.45; S.lenTo = 0.45; S.heat = 2.4; S.mats = []; S.hit = 9; S.kind = CX_OLD ? 'blade' : forgeKind(this.weaponDef); if (!CX_OLD) this.forge.scale.setScalar(1.45); clearTimeout(this.fwHide); if (this.ingot) this.ingot.visible = false; if (this.orbM) this.orbM.visible = false;
    if (R.quiet) return;
    for (const g of S.gear) g.visible = false;
    this.forge.visible = true; this.hammer.visible = true; this.hammer.rotation.z = 1.2;
    if (!CX_OLD && this._fs0 == null) { this._fs0 = this.flameRoot.scale.x; this.flameRoot.scale.setScalar(this._fs0 * 0.4); } /* the bonfire sinks low behind the anvil, so the forge's own light leads */
    const src = S.gear[0];
    if (src) {
      const b = src.clone(true); b.visible = true; b.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); S.mats.push(o.material); if (o.material.emissive) { o.material.emissive.set(CX_OLD ? 0xff7a22 : this.forgeCol ?? 0xff7a22); o.material.emissiveIntensity = S.heat; } o.castShadow = false; } });
      src.getWorldScale(_v); const pivot = new THREE.Group(); b.position.set(0, 0, 0); b.rotation.set(0, 0, -Math.PI / 2); b.scale.copy(_v); pivot.add(b);
      /* laid along the anvil, its middle on the face */
      pivot.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(pivot); const c = bb.getCenter(V3()); b.position.sub(c); S.half = Math.max(0.2, (bb.max.x - bb.min.x) / 2);
      pivot.position.set(0.02, ANVIL_TOP + Math.max(0.02, (bb.max.y - bb.min.y) / 2), 0); this.forge.add(pivot); S.blade = pivot;
      if (!CX_OLD) { S.fit = Math.min(1, 0.62 / Math.max(0.2, S.half)); /* a long spear fits the frame */
        if (S.kind !== 'blade') { S.fit = Math.min(1, 0.24 / Math.max(0.2, S.half)); pivot.rotation.z = Math.PI / 2; pivot.position.y = ANVIL_TOP + 0.04 + S.half * S.fit; S.y0 = pivot.position.y; this.hammer.visible = false; this.forgeTop = ANVIL_TOP + 0.36; } /* the frame stays close: the anvil leads, the staff's head may rise into the sky above it */ /* it stands upright over the anvil and charges */
        else if (this.ingot) { pivot.visible = false; S.raw = true; this.ingot.visible = true; this.ingot.scale.set(1.2, 1.3, 1.2); const im = this.ingot.material; if (this.fLook?.metal != null) im.color.set(this.fLook.metal).multiplyScalar(0.3); im.emissive.set(this.forgeCol ?? 0xffa040); im.emissiveIntensity = 3; } }
    }
    this.shot('r-forge', { rate: 3.2 }); this.faceTo(this.forge.position.x, this.forge.position.z); this.flare = Math.max(this.flare, 1.3); this.keyK = 0.6;
  }
  forgeStrike(R, i) {
    const S = R.state; S.lenTo = CX_OLD ? [0.7, 0.88, 1][i] : [0.55, 0.8, 1][i]; S.hit = 0; S.heat = CX_OLD ? 3.4 : 4.6;
    if (S.raw && S.blade) { S.raw = false; S.blade.visible = true; S.len = 0.32; if (this.ingot) this.ingot.visible = false; } /* the first blow beats the raw bar into the weapon's shape */
    if (R.quiet) return;
    if (!CX_OLD) {
      S.hit = 0; this.forge.updateWorldMatrix(true, false); const a = this.forge.localToWorld(V3(0, ANVIL_TOP + (S.kind === 'blade' ? 0.04 : 0.38), 0)); const hot = this.forgeCol ?? 0xffa040;
      if (S.kind === 'blade') { this.burst(a, 40 + i * 25, 0xffffff, { speed: 4.6, up: 1.4, life: 0.45, size: 0.03, spread: 0.05, drag: 1.2, lift: -5 }); this.burst(a, 30 + i * 20, hot, { speed: 3.8, up: 2.2, life: 0.6, size: 0.036, spread: 0.08, drag: 1.4, lift: -4 }); fx('anvil', i); if (i === 2) sfx('clangBig', { gain: 0.3 }); }
      else { const r = this.rand; for (let j = 0; j < 46 + i * 16; j++) { const th = r() * TAU; const ph = (r() - 0.5) * 2.4; const d = 0.6 + r() * 0.5; const life = 0.32 + r() * 0.12; this.spawn(a.x + Math.cos(th) * Math.cos(ph) * d, a.y + Math.sin(ph) * d * 0.7, a.z + Math.sin(th) * Math.cos(ph) * d, -Math.cos(th) * Math.cos(ph) * d / life, -Math.sin(ph) * d * 0.7 / life, -Math.sin(th) * Math.cos(ph) * d / life, life, 0.034, j % 3 ? hot : 0xffffff, { drag: 0, lift: 0 }); } fx('charge', i); }
      this.world.flash(0.2 + i * 0.08); this.world.kick(0.03 + i * 0.02); if (S.kind !== 'blade') { this.flare = Math.max(this.flare, 1.6); return; }
    }
    this.forge.updateWorldMatrix(true, false); const at = this.forge.localToWorld(V3(0, ANVIL_TOP + 0.04, 0));
    this.burst(at, 70, CX_OLD ? 0xffc060 : this.forgeCol ?? 0xffc060, { speed: 3.4, up: 2.4, life: 0.55, size: 0.035, spread: 0.12, drag: 1.6, lift: -4 });
    this.burst(at, 24, 0xfff2d0, { speed: 1.6, up: 3.2, life: 0.4, size: 0.03, spread: 0.08 });
    this.world.kick(0.045 + i * 0.015); this.world.flash(0.1 + i * 0.05); this.flare = Math.max(this.flare, 1.2); sfx('deflect', { gain: 0.42 + i * 0.08 });
  }
  forgeTick(R, dt, t) {
    const S = R.state; if (R.quiet || !this.forge.visible) return;
    /* the hammer: up before each strike, down on it, a small rebound after */
    let th = 1.2; for (const ts of [0.9, 1.6, 2.3]) { const u = ts - t; if (u > 0 && u < 0.5) th = u > 0.12 ? 0.35 + 0.95 * smooth(0.5, 0.12, u) : 1.3 * Math.pow(u / 0.12, 2); else if (u <= 0 && u > -0.22) th = 0.32 * Math.sin((-u / 0.22) * Math.PI); }
    if (t > 2.55) th = 0.2 + 1.0 * smooth(2.55, 2.9, t);
    this.hammer.rotation.z = th; this.hammer.visible = t < 3.1 && S.kind !== 'staff' && S.kind !== 'bow' && S.kind !== 'gun';
    if (!CX_OLD) { S.hit = (S.hit ?? 9) + dt; if (S.raw && this.ingot) { const k = Math.exp(-S.hit * 6); this.ingot.material.emissive.set(this.forgeCol ?? 0xffa040).lerp(_c2W, 0.6 + 0.4 * k); } if (S.blade && S.kind !== 'blade') { S.blade.rotation.y += dt * (1.2 + 5 * Math.exp(-S.hit * 3)); S.blade.position.y = (S.y0 ?? S.blade.position.y) + 0.03 * Math.sin(t * 3) + 0.05 * Math.exp(-S.hit * 6); } }
    S.len += (S.lenTo - S.len) * Math.min(1, dt * 14); S.heat += ((S.power ? 0.5 : 2.2) - S.heat) * Math.min(1, dt * (S.power ? 1.6 : 3));
    const col = _c.set(0xff7a22); if (!CX_OLD) { col.set(this.forgeCol ?? 0xffa040).lerp(_c2W, 0.85 * Math.exp(-(S.hit ?? 9) * 6)); } else if (S.power) col.lerp(new THREE.Color(this.forgeCol ?? 0xffa040), smooth(2.6, 3.5, t));
    for (const m of S.mats) if (m.emissive) { m.emissive.copy(col); m.emissiveIntensity = S.heat * (0.9 + 0.1 * Math.sin(this.time * 31)) * (!CX_OLD && S.kind !== 'blade' ? 0.06 : 1); } /* a charged staff keeps its shape in the glow */
    if (S.blade) { const f = S.fit ?? 1; if (!CX_OLD && S.kind === 'blade') { const raw = Math.max(0, 1 - S.len) * 2.2; S.blade.scale.set(S.len * f, (1 + raw) * f, (1 + raw * 0.6) * f); } else { const th = CX_OLD ? 1 : 1.8; S.blade.scale.set(S.len * f, f * th, f * th); } } /* a charged staff reads thicker in the air */ /* a thick raw bar is beaten out into the blade */
    /* the power runs up the blade, grip to tip */
    if (S.power && S.blade && t < 3.7) {
      const k = smooth(2.6, 3.6, t); const x = (-1 + 2 * k) * (S.half || 0.4) * S.len; S.blade.updateWorldMatrix(true, false); const p = S.blade.localToWorld(V3(x / Math.max(0.01, S.len), 0.02, 0)); const r = this.rand;
      for (let n = 0; n < 3; n++) this.spawn(p.x + (r() - 0.5) * 0.06, p.y + r() * 0.05, p.z + (r() - 0.5) * 0.06, (r() - 0.5) * 0.5, 0.5 + r() * 0.9, (r() - 0.5) * 0.5, 0.6 + r() * 0.5, 0.035, this.forgeCol ?? 0xffa040, { drag: 1.4, lift: 0.4 });
      this.wglow.position.copy(p); this.wglow.material.color.set(this.forgeCol ?? 0xffc070); this.wglow.scale.setScalar(0.5); if (this.wglowT < 0) { this.wglowT = 0; this.wglowLife = 1.5; this.wglowK = 0.85; this.wglowHand = false; }
      this.keyCol = this.forgeCol ?? null;
    }
    if (t > 4.6) this.forge.visible = false;
  }
  forgeTake(R) {
    const S = R.state; this.forgeClear(S);
    this.shot('r-take', { rate: 3.2 }); this.faceCam(0.05); this.keyCol = this.forgeCol ?? null; this.keyK = 2.3; this.rimK = 2.4;
    if (R.quiet) return;
    if (CX_OLD) { this.world.flash(0.45); this.world.kick(0.08); } else { this.world.flash(0.7); this.world.kick(0.11); const p = this.actor?.root.position; if (p) this.burst(V3(p.x, 0.15, p.z), 120, this.forgeCol ?? 0xffc070, { speed: 3.2, up: 1.2, life: 1.0, size: 0.04, spread: 0.6, drag: 1.6, lift: -1 }); }
    this.wglow.material.color.set(this.forgeCol ?? 0xffc070); this.wglow.scale.setScalar(CX_OLD ? 1.0 : 1.5); this.wglowT = 0; this.wglowLife = 2.0; this.wglowK = 0.9; this.wglowHand = true;
    const h = this.actor?.slot?.('handslotr'); if (h) { h.getWorldPosition(_v2); this.burst(_v2.clone(), 50, this.forgeCol ?? 0xffc070, { speed: 1.6, up: 2.2, life: 1.0, size: 0.04, spread: 0.2 }); }
    /* the hero lifts it (the cheer), then settles into the weapon's own hold */
    const act = this.actor; if (!CX_OLD && act) { try { if (!W.holdHero?.(act, this.weaponDef) && act.has?.('Sword_Block')) act.hold('Sword_Block', 0.5, { fade: 0.25 }); } catch { /* keep the pose */ } S.lifted = act; } /* the weapon is presented upright (the cheer clip is a spinning jump) */
    else if (act?.has?.('Cheer')) { try { act.play('Cheer', { loop: false }); } catch { /* no clip */ } S.lifted = act; }
    if (!CX_OLD) { fx('chord'); this.sweep = { t: -0.35 }; }
  }
  forgeClear(S) {
    for (const g of S.gear || []) g.visible = true;
    if (S.blade) { S.blade.removeFromParent(); for (const m of S.mats) m.dispose(); S.blade = null; S.mats = []; }
  }
  /* while Sage2 reads the weapon answer, the smith already works: the anvil is out, a hot bar lies on it and the
     hammer falls on every wait beat (main.js runForge calls forgeWaitBeat with the forge sound). The real blade takes its
     place when the answer lands (forgeStart). */
  forgeWait(on, look = null) {
    if (CX_OLD || !this.active || !this.forge) return;
    if (on) this.fLook = look || null;
    clearTimeout(this.fwHide);
    if (!on) { if (this.fw) { this.fw = null; /* the bar stays hot on the anvil until the real blade replaces it (forgeStart); no forge reveal within 2.5 s: put away */ this.fwHide = setTimeout(() => { if (this.rv?.kind === 'weapon') return; if (this.ingot) this.ingot.visible = false; if (this.orbM) this.orbM.visible = false; this.forge.visible = false; this.hammer.rotation.z = 1.2; }, 2500); } return; }
    if (!this.ingot) { const m = this.own(new THREE.MeshStandardMaterial({ color: 0x40302a, metalness: 0.6, roughness: 0.5, emissive: 0xffa040, emissiveIntensity: 3 })); this.ingot = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.44, 0.06, 0.1)), m); this.ingot.position.set(0.02, ANVIL_TOP + 0.02, 0); this.forge.add(this.ingot); }
    /* the player's own words set the look at once: the metal's colour and the element's heat ("silver ... frost" = silver, frost blue);
       a staff, a bow or a gun is charged in the air over the anvil, not hammered */
    const L = this.fLook; const kind = L?.kind || 'blade'; const im = this.ingot.material; im.color.set(L?.metal ?? 0x40302a).multiplyScalar(0.3); im.metalness = L?.metalness ?? 0.6; im.roughness = Math.min(0.5, L?.rough ?? 0.5); im.emissive.set(L?.hot ?? 0xffa040);
    this.fw = { t: 0, hit: 9, n: 0, kind, hot: new THREE.Color(L?.hot ?? 0xffa040) }; this.ingot.visible = kind === 'blade'; this.ingot.scale.set(0.7, 1, 1); this.forge.scale.setScalar(1.45); this.forge.visible = true; this.hammer.visible = kind === 'blade'; this.hammer.rotation.z = 1.2;
    if (kind !== 'blade') { if (!this.orbM) { this.orbM = new THREE.Mesh(this.own(new THREE.OctahedronGeometry(0.075, 0)), this.own(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 3 }))); this.forge.add(this.orbM); } this.orbM.material.color.set(L?.metal ?? 0xd0d8e0); this.orbM.material.emissive.set(L?.hot ?? 0xffa040); this.orbM.position.set(0.02, ANVIL_TOP + 0.34, 0); this.orbM.scale.setScalar(0.6); this.orbM.visible = true; }
    this.shot('r-forge', { rate: 3.2 }); this.faceTo(this.forge.position.x, this.forge.position.z); this.flare = Math.max(this.flare, 1.2);
    /* the prompt's own reframe lands a moment later and would take the camera back: ask again */
    setTimeout(() => { if (this.fw) this.shot('r-forge', { rate: 3.2 }); }, 220);
  }
  forgeWaitBeat() {
    const F = this.fw; if (!F) return; F.hit = 0; F.n++;
    this.forge.updateWorldMatrix(true, false); const a = this.forge.localToWorld(V3(0, ANVIL_TOP + 0.04, 0));
    const hot = F.hot.getHex();
    if (F.kind !== 'blade') { a.y += 0.34 * this.forge.scale.y; const r = this.rand; for (let j = 0; j < 40; j++) { const th = r() * TAU; const ph = (r() - 0.5) * 2.4; const d = 0.5 + r() * 0.45; const life = 0.4 + r() * 0.15; this.spawn(a.x + Math.cos(th) * Math.cos(ph) * d, a.y + Math.sin(ph) * d * 0.7, a.z + Math.sin(th) * Math.cos(ph) * d, -Math.cos(th) * Math.cos(ph) * d / life, -Math.sin(ph) * d * 0.7 / life, -Math.sin(th) * Math.cos(ph) * d / life, life, 0.032, j % 3 ? hot : 0xffffff, { drag: 0, lift: 0 }); } fx('charge', F.n % 3); this.world.kick(0.025); this.world.flash(0.08); this.flare = Math.max(this.flare, 1.5); if (this.orbM) this.orbM.scale.setScalar(Math.min(1.5, 0.6 + F.n * 0.1)); return; }
    this.burst(a, 70, hot, { speed: 4.2, up: 2.8, life: 0.55, size: 0.036, spread: 0.1, drag: 1.6, lift: -4 }); this.burst(a, 30, 0xffffff, { speed: 2.4, up: 3.4, life: 0.35, size: 0.03, spread: 0.06 });
    this.world.kick(0.045); this.world.flash(0.12); this.flare = Math.max(this.flare, 1.7); this.ingot.scale.x = Math.min(1.35, 0.7 + F.n * 0.09);
  }
  forgeWaitTick(dt) {
    const F = this.fw; F.t += dt; F.hit += dt; const p = F.hit / 0.85;
    /* down on the beat, a small rebound, then raised high for the next blow */
    this.hammer.rotation.z = p < 0.16 ? 0.3 * Math.sin((p / 0.16) * Math.PI) : 0.3 + 0.95 * smooth(0.16, 0.8, Math.min(1, p));
    const k = Math.exp(-F.hit * 5);
    if (this.ingot && F.kind === 'blade') { this.ingot.material.emissive.copy(F.hot).lerp(_c2W, 0.8 * k); this.ingot.material.emissiveIntensity = 2.6 + 3.4 * k + 0.3 * Math.sin(this.time * 23); } /* the bar glows in the element's colour, not as bright bare metal */
    if (this.orbM && F.kind !== 'blade') { this.orbM.rotation.y += dt * (1.5 + 6 * k); this.orbM.rotation.x += dt * 0.7; this.orbM.material.emissive.copy(F.hot).lerp(_c2W, 0.7 * k); this.orbM.material.emissiveIntensity = 2 + 4 * k; this.orbM.position.y = ANVIL_TOP + 0.34 + 0.025 * Math.sin(this.time * 3); }
  }
  /* a band of light runs up the lifted weapon, grip to tip (the held gear's long axis, read each frame: the arm moves) */
  gearBox(out = new THREE.Box3()) { out.makeEmpty(); for (const g of this.heldGear()) { if (g.userData?.gear === 'shield' || /shield/.test(g.userData?.gear || '')) continue; out.expandByObject(g); } return out; }
  sweepTick(dt) {
    const S = this.sweep; S.t += dt; if (S.t < 0) return; if (S.t > 0.95 || !this.actor) { this.sweep = null; return; }
    const b = this.gearBox(this._sb || (this._sb = new THREE.Box3())); if (b.isEmpty()) { this.sweep = null; return; }
    const sz = b.getSize(_v3); const c = b.getCenter(_v4); const ax = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z';
    const hand = this.actor.slot?.('handslotr'); const hp = hand ? hand.getWorldPosition(V3()) : c.clone();
    const lo = c.clone(); lo[ax] = b.min[ax]; const hi = c.clone(); hi[ax] = b.max[ax]; const [g0, g1] = lo.distanceTo(hp) < hi.distanceTo(hp) ? [lo, hi] : [hi, lo];
    const k = smooth(0, 0.7, S.t); const p = g0.lerp(g1, k); const r = this.rand; const col = this.forgeCol ?? 0xffc070;
    this.wglow.position.copy(p); this.wglow.material.color.set(0xffffff); this.wglow.scale.setScalar(0.55 + 0.4 * Math.sin(Math.PI * Math.min(1, S.t / 0.8))); this.wglowT = 0; this.wglowLife = 0.5; this.wglowK = 1; this.wglowHand = false;
    for (let n = 0; n < 4; n++) this.spawn(p.x + (r() - 0.5) * 0.04, p.y + (r() - 0.5) * 0.04, p.z + (r() - 0.5) * 0.04, (r() - 0.5) * 0.8, 0.2 + r() * 0.8, (r() - 0.5) * 0.8, 0.4 + r() * 0.3, 0.03, n % 2 ? 0xffffff : col, { drag: 2, lift: 0.4 });
  }
  /* the quench: steam bursts off the anvil with a hiss and the blade turns the colour of its power at once */
  forgeQuench(R) {
    this.forge.updateWorldMatrix(true, false); const a = this.forge.localToWorld(V3(0, ANVIL_TOP, 0));
    this.steamU.uOrigin.value.copy(a); this.steamU.uBurst.value = 0; this.steamU.uOpacity.value = 0.65; R.state.steamMoved = true;
    this.burst(a, 70, 0xf4f8ff, { speed: 1.4, up: 2.6, life: 1.0, size: 0.05, spread: 0.3, drag: 1.8, lift: 1.0 });
    this.burst(a, 60, this.forgeCol ?? 0xffa040, { speed: 2.8, up: 2.2, life: 0.8, size: 0.035, spread: 0.2 });
    this.world.flash(0.25); this.world.kick(0.05); sfx('pwSizzle', { gain: 0.55 }); fx('quench');
    /* the element's own burst: frost mist, a fire bloom, a crackle of lightning, a slow dark smoke */
    const el = this.forgeEl; const hot = this.forgeCol ?? 0xffa040;
    if (el === 'frost') { this.burst(a, 90, 0xdff4ff, { speed: 1.0, up: 0.8, life: 1.8, size: 0.06, spread: 0.5, drag: 1.2, lift: 0.2 }); this.burst(a, 50, hot, { speed: 3.6, up: 1.2, life: 0.7, size: 0.03, spread: 0.1, drag: 2, lift: -3 }); }
    else if (el === 'fire') this.burst(a, 120, 0xffb040, { speed: 1.8, up: 3.6, life: 0.9, size: 0.05, spread: 0.3, drag: 1.2, lift: 1.6 });
    else if (el === 'storm') { this.burst(a, 110, 0xf0eaff, { speed: 6.5, up: 1.2, life: 0.28, size: 0.03, spread: 0.05, drag: 0.6, lift: 0 }); this.world.flash(0.4); }
    else if (el === 'shadow') this.burst(a, 90, 0x3a1a5a, { speed: 0.8, up: 1.1, life: 1.9, size: 0.07, spread: 0.4, drag: 1, lift: 0.5 });
  }
  forgeEnd(R) { if (this._fs0 != null) { this.flameRoot.scale.setScalar(this._fs0); this._fs0 = null; } if (R.state.steamMoved) { R.state.steamMoved = false; this.steamU.uOrigin.value.copy(FIRE); this.liftSmoke(); } this.forgeClear(R.state); this.forge.visible = false; this.keyCol = null; this.faceHome(); }

  /* The camera per step. angle: orbit around the hero (0 = from the front, + = from the fire side); elev: how far above;
     swing: the slow sway; box: where the shot's points sit, as fractions of the clear band (x0, x1, y0, y1).
     main.js fits the camera to the box (fitView), so the scene never touches the headline, the feed or the sentence.
     pts = what the shot must hold (the hero and the thing that changed, never the whole camp; shotPoints());
     fov = the lens (38 = a 35 mm hero shot, 55 = the wide title); minHero / maxHero = the hero's height as a share of the
     frame. The plain ids are the calm framing a question is asked in; the r-* ids are the shots of the reveals (STAGE). */
  focus(stepId) {
    const F = {
      title: { angle: -0.22, elev: 0.15, swing: 0.06, box: [0.06, 0.94, 0.04, 0.96], pts: 'all', fov: 55 },
      name: { angle: -0.14, elev: 0.1, swing: 0.04, box: [0.08, 0.92, 0.04, 1], pts: 'hero+stone', fov: 40, minHero: 0.36 },
      born: { angle: -0.28, elev: 0.05, swing: 0.04, box: [0.18, 0.92, 0.46, 1], pts: 'hero+fire', fov: 48, minHero: 0.28 },
      origin: { angle: -0.2, elev: 0.16, swing: 0.06, box: [0.1, 0.9, 0.2, 1], pts: 'hero+stone+fire', fov: 44, minHero: 0.32 },
      body: { angle: 0.04, elev: 0.1, swing: 0.04, box: [0.2, 0.8, 0.02, 1.3], pts: 'hero', fov: 38, minHero: 0.5, maxHero: 0.58 },
      heart: { angle: -0.46, elev: 0.13, swing: 0.04, box: [0.08, 0.92, 0.12, 1], pts: 'hero+companions+fire', fov: 42, minHero: 0.32 },
      enemy: { angle: -0.36, elev: 0.07, swing: 0.04, box: [0.04, 0.62, 0.2, 1.1], pts: 'hero+fire', fov: 42, minHero: 0.36 },
      weapon: { angle: -0.14, elev: 0.1, swing: 0.04, box: [0.1, 0.9, 0.02, 1.1], pts: 'hero+fire', fov: 40, minHero: 0.4 },
      forged: { angle: -0.1, elev: 0.08, swing: 0.03, box: [0.12, 0.88, 0.02, 1.15], pts: 'hero+fire', fov: 38, minHero: 0.44 },
      card: { angle: -0.24, elev: 0.0, swing: 0, box: [0.06, 0.94, 0.04, 1], pts: 'card' },
      'r-name': { angle: -0.36, elev: 0.08, swing: 0.02, box: [0.08, 0.92, 0.04, 1.05], pts: 'stone+hero', fov: 36, minHero: 0.4 },
      'r-sign': { angle: -0.3, elev: -0.03, swing: 0.03, box: [0.2, 0.9, 0.6, 1.12], pts: 'hero+fire', fov: 52, minHero: 0.28 },
      'r-land-a': { angle: -0.2, elev: 0.14, swing: 0, box: [0.14, 0.86, 0.26, 0.98], pts: 'hero+stone+fire', fov: 46, minHero: 0.28 },
      'r-land': { angle: -0.36, elev: 0.2, swing: 0.1, box: [0.3, 0.7, 0.42, 1], pts: 'hero+stone+fire', fov: 46, minHero: 0.24 }, /* 0.14 still read as a speck */ /* the hero was a 40 px speck in the wide shot */
      'r-land-back': { angle: -0.08, elev: 0.14, swing: 0.05, box: [0.1, 0.9, 0.16, 1.05], pts: 'hero+fire', fov: 42, minHero: 0.34 },
      'r-class': { angle: 0.0, elev: 0.05, swing: 0, box: [0.22, 0.78, 0.0, 1.5], pts: 'hero', fov: 34, minHero: 0.7, maxHero: 0.76 },
      'r-class-out': { angle: 0.3, elev: 0.09, swing: 0.03, box: [0.2, 0.8, 0.02, 1.35], pts: 'hero', fov: 36, minHero: 0.52, maxHero: 0.58 },
      'r-heart': { angle: -0.34, elev: 0.2, swing: 0.03, box: [0.1, 0.9, 0.12, 1.04], pts: 'hero+companions', fov: 38, minHero: 0.36 },
      'r-enemy': { angle: -0.5, elev: 0.03, swing: 0, box: [0.0, 0.36, 0.3, 1.6], pts: 'hero', fov: 40, minHero: 0.6, maxHero: 0.66 },
      'r-enemy-in': { angle: -0.56, elev: 0.03, swing: 0.02, box: [0.0, 0.34, 0.3, 1.7], pts: 'hero', fov: 31, minHero: 0.66, maxHero: 0.72 },
      'r-forge': { angle: -0.66, elev: 0.2, swing: 0, box: [0.16, 0.84, 0.18, 0.96], pts: 'forge', fov: 30 },
      'r-take': { angle: -0.2, elev: -0.04, swing: 0, box: [0.16, 0.84, 0.0, 1.5], pts: 'hero+arm', fov: 36, minHero: 0.6, maxHero: 0.68 },
      'r-held': { angle: -0.1, elev: 0.08, swing: 0.03, box: [0.12, 0.88, 0.02, 1.15], pts: 'hero+fire', fov: 38, minHero: 0.44 },
      /* the final shot: the hero alone sets the frame, at the centre (the list of the build owns the left 28 %); the orbit
         starts on the fire side, where the stone is behind the hero, and ends with the stone between the list and the hero */
      beauty0: { angle: 0.3 + (this.beautyOrbit ?? 1.2), elev: 0.09, swing: 0, box: [0.4, 0.64, 0.06, 1.02], pts: 'hero', fov: 34, minHero: 0.36, maxHero: 0.4 },
      beauty: { angle: 0.3, elev: 0.07, swing: 0.05, box: [0.4, 0.64, 0.06, 1.02], pts: 'hero', fov: 34, minHero: 0.36, maxHero: 0.4 },
    };
    return { ...(F[stepId] || F.title) };
  }

  /* ================================================================ per frame */
  update(dt) {
    if (!this.active) return;
    dt = Math.min(0.1, dt);
    /* the world's ambience bed plays at the camp too (no steps: speed 0) */
    if (this.world.biome) sfxFoot(dt, 0, this.world.biome.id);
    this.holdEnemy(); if (this.hideStone) { this.stone.visible = false; if (this.dress?.signH) this.dress.signH.visible = false; }
    /* a world sign replaces the stone: the stone's late texture load must not bring it back */
    else if (this.dress?.sign && !this.swap) this.stone.visible = false;
    const w = this.world; this.time += dt; const t = this.time;
    /* camp exposure: the land's LOOK.campExposure, else the world camp's, else the dark night value */
    if (w.biome) w.target.exposure *= (W.LAND_LOOK?.[w.biome.id]?.campExposure ?? this.campMod?.exposure ?? NIGHT_EXPOSURE) * (1 + ((this.expK ?? 1) - 1) * (this.campMod?.sky?.stars === 0 || (this.campMod?.exposure ?? 0) >= 1.1 ? 0.25 : 1)); /* a daylight camp takes only a trace of a reveal's exposure lift */
    else w.target.exposure = 1.75 * (this.expK ?? 1);
    if (this.swap) this.stepSwap(dt);
    this.ccTime.value = t;
    const ups = this.dress?.ups; if (ups?.length) for (let i = ups.length - 1; i >= 0; i--) { try { ups[i](dt, t); } catch (err) { console.warn('world camp update', err); ups.splice(i, 1); } }
    const px = w.renderer.getPixelRatio(); const scale = w.renderer.domElement.height * 0.5 / Math.tan((w.camera.fov * Math.PI) / 360);
    this.flare *= Math.exp(-dt * 2.0); this.gust *= Math.exp(-dt * (this.enemyT >= 0 && this.enemyT < 3 ? 0.35 : 0.9));
    if (this.dimTarget) this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 1.5);
    if (this.enemyT >= 0) { this.enemyT += dt; if (this.enemyT > 6) { this.dimTarget = 0.45; } }
    /* wind */
    const gw = this.gust * 0.55 + Math.sin(t * 0.7) * 0.03;
    const wind = _v.set(this.windDir.x * gw, 0, this.windDir.y * gw);
    /* fire colour (the forged element) */
    if (this.fireTarget) { const k = Math.min(1, dt * 1.6); for (const key of ['core', 'mid', 'edge', 'light']) this.fireCols[key].lerp(this.fireTarget[key], k); }
    this.flameU.uCore.value.copy(this.fireCols.core); this.flameU.uMid.value.copy(this.fireCols.mid); this.flameU.uEdge.value.copy(this.fireCols.edge);
    this.flameU.uTime.value = t; this.flameU.uFlare.value = this.flare; this.flameU.uWind.value.set(wind.x, wind.z); this.flameU.uLow.value = this.gust * 0.6;
    this.coalMat.uniforms.uTime.value = t; this.coalMat.uniforms.uFlare.value = this.flare; this.coalMat.uniforms.uHot.value.copy(this.fireCols.edge).lerp(this.fireCols.mid, 0.5).multiplyScalar(1.6);
    this.barkMat.emissive.copy(this.fireCols.edge).lerp(this.fireCols.mid, 0.35); this.barkMat.emissiveIntensity = 0.16 + this.flare * 0.12;
    const flick = 0.82 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 4.3);
    this.light.intensity = 26 * flick * (1 + this.flare * 0.45) * (1 - this.gust * 0.35) * (this.dying ? 0.4 : 1);
    if (this.dying) this.flameU.uLow.value = 0.9;
    this.light.color.copy(this.fireCols.light);
    this.light.position.set(FIRE.x + wind.x * 0.4 + Math.sin(t * 7.3) * 0.04, 0.95 + this.fireY + this.flare * 0.12, FIRE.z + wind.z * 0.4 + Math.cos(t * 6.1) * 0.04);
    this.halo.material.color.copy(this.fireCols.light); this.halo.material.opacity = 0.26 * flick * (1 + this.flare * 0.4);
    /* embers: steady from the fire, more while the player speaks */
    this.emitAcc += dt * (this.dying ? 2 : 7 + this.flare * 30);
    while (this.emitAcc >= 1) { this.emitAcc -= 1; this.emberFromFire(1, this.fireCols.light.getHex(), 0.8); }
    this.stepEmbers(dt, wind);
    this.pointU.uScale.value = scale;
    /* smoke, steam, fog */
    for (const u of [this.smokeU, this.steamU, this.fogU]) { u.uTime.value = t; u.uWind.value.set(wind.x, wind.z); }
    this.steamU.uBurst.value += dt;
    if (this.partT >= 0) { this.partT += dt; this.fogU.uPart.value = Math.sin(Math.min(1, this.partT / 4.5) * Math.PI) * 0.85; if (this.partT > 4.5) { this.partT = -1; this.fogU.uPart.value = 0; } }
    if (!w.biome) this.fogU.uColor.value.copy(w.col.fog).multiplyScalar(1.9);
    /* glyphs and the burning words */
    this.glyphU.uTime.value = t; this.glyphU.uWind.value.set(wind.x * 2, wind.z * 2);
    const since = t - this.liveT;
    this.liveU.uTime.value = t;
    let rise = 0;
    /* a resolved answer: the words stay whole and readable, rise and fade out, and are gone (cleared) 1.2 s later */
    if (this.liveBurnAt != null) { const b = t - this.liveBurnAt; this.liveU.uBurn.value = 0; rise = b; this.liveU.uOpacity.value = 1 - smooth(0.1, 1.05, b); if (b > 1.2) { this.liveBurnAt = null; this.liveText = ''; this.drawLive(''); this.liveU.uOpacity.value = 0; } }
    else { this.liveMesh.position.y = LIVE_Y; this.liveU.uOpacity.value = this.liveText ? smooth(0, 0.15, since + 0.15) * (since > 2.5 ? Math.max(0, 1 - (since - 2.5) / 1.2) : 1) : 0; }
    this.placeLive(rise);
    /* the stone breathes with the fire */
    if (this.nameT >= 0) this.nameT += dt;
    if (this.etch) this.etchTick(dt);
    if (this.etchL) { this.etchK = (this.etchK || 0) * Math.exp(-dt * 2.2); const on = !!this.state.name && !this.hideStone && (this.stone.visible !== false || !!this.dress?.sign); const p = this.stoneFace(0.5, 0.44, this._eP || (this._eP = V3())); const sg = this.dress?.sign; const fo = sg?.face || this.stone; fo.updateWorldMatrix(true, false); const sp = fo.localToWorld((this._eS || (this._eS = V3())).set(0, 0, 0)); const sq = fo.localToWorld((this._eQ || (this._eQ = V3())).set(0, 0, 1)); let dx = sq.x - sp.x; let dz = sq.z - sp.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl; this.etchL.position.set(p.x + dx * 0.7, p.y - 0.15, p.z + dz * 0.7); /* the light sits in front of the face that shows (the stone or the sign that replaces it), on its own normal */ this.etchL.intensity = on ? 30 + 26 * Math.min(1, this.etchK) : 0; }
    if (this.fw) this.forgeWaitTick(dt);
    if (this.sweep) this.sweepTick(dt);
    this.stoneMat.emissiveIntensity = (0.85 + 0.12 * flick + this.flare * 0.08) * (1 + 1.6 * Math.exp(-Math.max(0, this.nameT) * 2.2) * (this.nameT >= 0 ? 1 : 0) + 0.35 * this.chisel);
    /* sky */
    this.starU.uTime.value = t; this.starU.uPx.value = px;
    w.renderer.getDrawingBufferSize(this.nfU.uRes.value);
    this.consAge = (this.consAge ?? 0) + dt; this.consU.uOpacity.value += ((this.wordsT >= 0 ? 0.2 : this.consAge < 14 ? 1 : 0.22) - this.consU.uOpacity.value) * Math.min(1, dt * 2); this.lineU.uOpacity.value = this.worldId === 'dark' ? 0.85 * this.consU.uOpacity.value : 0; /* the sign's lines read as a scratch on a world sky: dark only */
    this.stepDemo(dt); this.chisel *= Math.exp(-dt * 4);
    this.starU.uOpacity.value = (w.biome ? 0.75 : 1) * this.skyStars; this.moon.visible = this.skyMoon;
    if (this.signMat) this.signMat.emissiveIntensity = this.stoneMat.emissiveIntensity * (this.signStyle?.glow ?? 1);
    if (this.moonAnim) { const a = this.moonAnim; a.t += dt; const k = easeOut(a.t / a.dur); this.moonU.uPhase.value = (a.from + (a.to - a.from) * k) % 1; if (a.t >= a.dur) this.moonAnim = null; }
    this.moonDir.lerp(this.moonDirTarget, Math.min(1, dt * 0.8)).normalize(); this.moon.position.copy(this.moonDir).multiplyScalar(SKY_R * 0.97);
    this.moonU.uTint.value.lerp(this.moonTint, Math.min(1, dt * 0.8));
    this.moon.quaternion.copy(w.camera.quaternion);
    if (this.cons) { this.consDraw = Math.min(this.cons.n + 1, this.consDraw + dt * (this.consRate || 2.6)); this.consU.uDraw.value = this.consDraw; this.lineU.uDraw.value = this.consDraw; }
    /* season */
    this.seasonU.uTime.value = t; this.seasonU.uPx.value = scale;
    this.seasonU.uOpacity.value += (this.seasonTarget - this.seasonU.uOpacity.value) * Math.min(1, dt * 0.8);
    /* the land reveal: a ring of light runs out over the ground */
    if (this.ringT >= 0) {
      this.ringT += dt; const k = this.ringT / 3.6; const R = 1.5 + 44 * (1 - Math.pow(1 - clamp01(k), 2));
      this.ring.scale.setScalar(R); this.wall.scale.set(R, 3.5 + 6 * (1 - k), R);
      this.ringU.uOpacity.value = (1 - smooth(0.12, 0.55, k)) * smooth(0, 0.05, k) * 0.7; this.wallU.uOpacity.value = 0;
      if (k >= 1) { this.ringT = -1; this.ring.visible = false; this.wall.visible = false; }
    }
    if (this.landT >= 0) { this.landT += dt; this.hillMat.opacity = Math.max(0, 1 - this.landT / 1.5); this.hills.visible = this.hillMat.opacity > 0; }
    /* the words across the sky */
    if (this.wordsT >= 0) {
      this.wordsT += dt; const k = this.wordsT;
      this.skyTextU.uTime.value = t; this.skyTextU.uReveal.value = Math.min(1.1, k / 0.8) * 1.1;
      this.skyTextU.uOpacity.value = smooth(0, 0.3, k) * (1 - smooth(5.2, 7.0, k));
      if (this.layout) this.placeSky(k * 5); else this.skyWords.position.y += dt * 0.25;
      if (this.wordsFade != null) { const f = clamp01((t - this.wordsFade) / 0.4); this.skyTextU.uOpacity.value *= 1 - f; if (f >= 1) { this.wordsT = -1; this.wordsFade = null; this.skyWords.visible = false; } }
      if (k > 7) { this.wordsT = -1; this.wordsFade = null; this.skyWords.visible = false; }
    }
    /* the weapon is drawn from the fire */
    if (this.weaponT >= 0) { this.weaponT += dt; if (this.weaponT < 0.7) this.flare = Math.max(this.flare, 1.4); if (this.weaponT > 4) this.weaponT = -1; }
    this.stepStage(dt);
    this.stepAssembly(dt);
    this.stepCompanions(dt);
    this.layoutLabels(dt);
    for (const u of this.moteU) { u.uPx.value = scale; u.uTime.value = t; }
  }
  stepEmbers(dt, wind) {
    const e = this.emb; const n = e.n; const r = this.rand;
    for (let i = 0; i < n; i++) {
      if (e.life[i] <= 0) { if (e.alpha[i] !== 0) e.alpha[i] = 0; continue; }
      e.life[i] -= dt;
      const j = i * 3; const d = Math.exp(-e.drag[i] * dt);
      e.vel[j] = e.vel[j] * d + (wind.x * 3 + (r() - 0.5) * 1.6) * dt;
      e.vel[j + 1] = e.vel[j + 1] * d + e.lift[i] * dt;
      e.vel[j + 2] = e.vel[j + 2] * d + (wind.z * 3 + (r() - 0.5) * 1.6) * dt;
      e.pos[j] += e.vel[j] * dt; e.pos[j + 1] += e.vel[j + 1] * dt; e.pos[j + 2] += e.vel[j + 2] * dt;
      if (e.pos[j + 1] < 0.02) { e.pos[j + 1] = 0.02; e.vel[j + 1] *= -0.3; }
      const k = e.life[i] / e.max[i];
      e.alpha[i] = e.base[i] * smooth(0, 0.35, k) * (0.65 + 0.35 * Math.sin(this.time * 17 + i));
    }
    const g = this.embPts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
}

/* ---------- the hero's look per archetype (main.js shares it) ----------
   Dark worn steel and dark cloth that read under firelight, never pastel. A robe hides the leg plates under it. */
export const HERO_LOOKS = {
  Knight: { helm: 'great', cloak: true, tabard: true, steel: 0x8b9099, cloth: 0x1b2337 },
  Barbarian: { helm: 'sallet', heavy: true, horns: true, cloak: false, tabard: true, steel: 0x87796b, cloth: 0x3b1912 },
  Mage: { helm: 'hood', robe: true, cloak: false, tabard: false, pauldrons: false, steel: 0x7d8189, cloth: 0x1d1922 },
  Rogue_Hooded: { helm: 'hood', cloak: true, tabard: false, pauldrons: false, steel: 0x6f747c, cloth: 0x151b17 },
};
const TRAVELLER_HIDE = ['Chest', 'Fauld', 'UpArmL', 'UpArmR', 'ForeArmL', 'ForeArmR', 'ThighL', 'ThighR', 'ShinL', 'ShinR', 'PauldronL', 'PauldronR', 'HeavyL', 'HeavyR', 'Horns', 'Crown'];
const TRAVELLER_SLEEVES = true;
/* worldLook: a world's hero look (game/worlds/<id>.mjs heroes[archetype].look); null = HERO_LOOKS */
export function dressHero(actor, model, bare, worldLook = null) {
  /* before a body is chosen: a hooded traveller in dark cloth (hood, cloak, robe), never a bare mannequin; no plate shows */
  /* a world's traveller (world entry `traveller`: a look like a hero look, wear allowed) stands at the title camp before a body is chosen */
  if (bare && worldLook) { const tl = { eye: 0xffd9a0, eyePower: 1.2, vary: false, ...worldLook }; actor.look(tl); actor.traveller = true; return applyBody(actor, W.worldMod()?.id || 'dark', null, tl); }
  if (bare) {
    actor.look({ armor: true, helm: 'hood', cloak: true, robe: true, tabard: true, pauldrons: false, heavy: false, sleeves: TRAVELLER_SLEEVES, cloth: 0x1b1a20, steel: 0x3a3c40, eye: 0xffd9a0, eyePower: 1.2, vary: false });
    for (const part of TRAVELLER_HIDE) for (const m of actor.parts.get(part) || []) m.visible = false;
    /* the body under the cloth: plain dark wool, no bright mail pattern at the neck */
    for (const m of actor.parts.get('Mannequin') || []) { const u = W.underUniforms(m.material); if (u) u.k.value = 0; m.material.color.set(0x141317); m.material.roughness = 1; m.material.metalness = 0; }
    actor.traveller = true; return applyBody(actor, 'dark', null, actor.lastLook);
  }
  actor.traveller = false;
  const look = worldLook || HERO_LOOKS[model] || HERO_LOOKS.Knight;
  actor.look({ ...look, eye: 0xffd9a0, eyePower: 1.6 });
  if (look.robe) for (const part of ['ThighL', 'ThighR', 'ShinL', 'ShinR']) for (const m of actor.parts.get(part) || []) m.visible = false;
  /* a real body (face, hands, clothes) under the world's pieces (web/src/bodies.js); the light mannequin stays on low quality tiers */
  return applyBody(actor, W.worldMod()?.id || 'dark', model, { ...look, eye: 0xffd9a0, eyePower: 1.6 });
}

/* ---------- the camera for the third-person stages: a slow orbit fitted to a box on screen ---------- */
const _fc = new THREE.PerspectiveCamera(); const _tv = new THREE.PerspectiveCamera(); const _tgt = V3();
function placeCam(c, t, angle, elev, radius) {
  c.position.set(t.x + Math.sin(angle) * Math.cos(elev) * radius, t.y + Math.sin(elev) * radius, t.z + Math.cos(angle) * Math.cos(elev) * radius);
  c.lookAt(t); c.updateMatrixWorld(true);
}
function pxBox(c, pts, W, H) {
  const r = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  for (const p of pts) { _v.copy(p).project(c); const x = (_v.x + 1) / 2 * W; const y = (1 - _v.y) / 2 * H; r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x); r.y0 = Math.min(r.y0, y); r.y1 = Math.max(r.y1, y); }
  return r;
}
/* The orbit (angle, elev) is chosen by the step; the distance and a screen shift are solved so that the points fill
   the box (CSS px of a W x H view) at every point of the sway. Returns the pose for CamRig.aim. */
export function fitView(camera, pts, box, W, H, { angle = 0, elev = 0.12, swing = 0, fov = null, heroPts = null, minHero = 0, maxHero = 0, bias = 0.55 } = {}) {
  const c = _fc; c.fov = fov ?? camera.fov; c.aspect = W / H; c.near = camera.near; c.far = camera.far; c.clearViewOffset(); c.updateProjectionMatrix();
  const t = new THREE.Box3().setFromPoints(pts).getCenter(V3());
  const bw = Math.max(40, box.x1 - box.x0); const bh = Math.max(40, box.y1 - box.y0);
  let r = 8;
  for (let it = 0; it < 10; it++) {
    let u = null;
    for (const a of swing ? [angle - swing, angle, angle + swing] : [angle]) {
      placeCam(c, t, a, elev, r); const b = pxBox(c, pts, W, H);
      u = u ? { x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) } : b;
    }
    const k = Math.max((u.x1 - u.x0) / bw, (u.y1 - u.y0) / bh);
    r = Math.min(60, Math.max(2.2, r * Math.pow(k, 0.85)));
  }
  /* the hero is never a dot. When the fit leaves the hero under minHero px tall, the camera comes in until
     the hero is that tall and the aim moves toward the hero (bias), so what was added to the scene no longer shrinks them.
     maxHero caps a close shot the other way (a lone hero in a wide band would fill the frame). */
  if (heroPts?.length && (minHero > 0 || maxHero > 0)) {
    const hc = new THREE.Box3().setFromPoints(heroPts).getCenter(V3());
    for (let it = 0; it < 4; it++) {
      placeCam(c, t, angle, elev, r); const hb = pxBox(c, heroPts, W, H); const hh = Math.max(1, hb.y1 - hb.y0);
      if (minHero > 0 && hh < minHero * 0.98) { r = Math.max(1.6, r * hh / minHero); if (it === 0) t.lerp(hc, bias); }
      else if (maxHero > 0 && hh > maxHero * 1.02) r = Math.min(60, r * hh / maxHero);
      else break;
    }
  }
  placeCam(c, t, angle, elev, r); const b = pxBox(c, pts, W, H);
  /* the picture is centred on the box when it fits; when the hero floor pushed parts out of the box, the hero's own
     rect is kept inside it */
  let offX = (b.x0 + b.x1) / 2 - (box.x0 + box.x1) / 2; let offY = (b.y0 + b.y1) / 2 - (box.y0 + box.y1) / 2;
  if (heroPts?.length && minHero > 0) {
    const hb = pxBox(c, heroPts, W, H);
    if (hb.x0 - offX < box.x0) offX = hb.x0 - box.x0; if (hb.x1 - offX > box.x1) offX = hb.x1 - box.x1;
    if (hb.y1 - offY > box.y1) offY = hb.y1 - box.y1; if (hb.y0 - offY < box.y0) offY = hb.y0 - box.y0;
  }
  const pose = { angle, elev, swing, radius: r, tx: t.x, ty: t.y, tz: t.z, offX, offY }; if (fov != null) pose.fov = fov;
  return pose;
}
export class CamRig {
  constructor(camera) { this.camera = camera; this.cur = null; this.tgt = null; this.clock = 0; this.rate = 1.6; }
  /* snap: jump there; from: start from a changed copy of the target (the title push-in starts farther out) */
  aim(pose, { snap = false, rate = 1.6, from = null } = {}) {
    /* a pose may carry its lens (fov, degrees); one without keeps the lens the camera has. roll: a small dutch tilt */
    this.tgt = { roll: 0, ...pose }; this.rate = rate; if (this.tgt.fov == null) this.tgt.fov = this.baseFov ?? this.camera.fov;
    if (snap || !this.cur) this.cur = { ...this.tgt, ...(from || {}) };
    if (this.cur.fov == null) this.cur.fov = this.camera.fov; if (this.cur.roll == null) this.cur.roll = 0;
  }
  update(dt, W, H) {
    if (!this.tgt) return;
    this.clock += dt; const k = Math.min(1, dt * this.rate); const c = this.cur;
    for (const key of Object.keys(this.tgt)) c[key] += (this.tgt[key] - c[key]) * k;
    if (Math.abs(this.camera.fov - c.fov) > 0.01) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
    placeCam(this.camera, _tgt.set(c.tx, c.ty, c.tz), c.angle + Math.sin(this.clock * 0.16) * c.swing, c.elev, c.radius);
    if (c.roll) this.camera.rotateZ(c.roll);
    this.camera.setViewOffset(W, H, c.offX, c.offY, W, H);
  }
  /* a camera at the pose the rig is moving to */
  targetView(W, H) {
    const c = _tv; const t = this.tgt; c.fov = t.fov ?? this.camera.fov; c.aspect = W / H; c.near = this.camera.near; c.far = this.camera.far;
    placeCam(c, _tgt.set(t.tx, t.ty, t.tz), t.angle, t.elev, t.radius); c.setViewOffset(W, H, t.offX, t.offY, W, H); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    return c;
  }
}

/* ---------- small helpers ---------- */
function tailWords(text, max) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t.toUpperCase();
  const words = t.split(' '); let out = '';
  for (let i = words.length - 1; i >= 0; i--) { const next = words[i] + (out ? ' ' + out : ''); if (next.length > max && out) break; out = next; }
  return (out.length > max ? out.slice(-max) : out).toUpperCase();
}
function shorten(s, n) { s = String(s).trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; }
function mixHex(a, b, k) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString(); }
function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.35)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.08)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* The print look: the ukiyo-e woodblock ink print. It is Old Edo's own look (game/worlds/edo.mjs `style: 'ink'`); the other
   worlds keep the plain render. ?style=ink forces it on in any world, ?style=off forces it off (for a side by side).
   One full-screen pass, last in the chain, replaces the OutputPass and the film pass while a print land is on screen:
   1. tone map (ACES, the world's exposure) as before;
   2. value bands: a softened lightness is cut into a few flat tones from the world's palette; each surface keeps a flat,
      muted share of its own hue (indigo stays indigo, skin stays warm), and only vivid reds (the Lord, blood, hits) keep
      their full colour, pulled to the print's one vermilion;
   3. lights: lanterns, lit windows, fires, the moon and bright effects (HDR above a threshold, bloom included) become a
      flat warm wash (the halo, one step) and a flat core shape; coloured cores (fox fire, lightning) keep their hue;
   4. ink lines from the depth buffer: the Laplacian of 1/z is 0 on any plane, so it marks silhouettes AND creases with no
      normal pass. The line sits on the NEAR side of a silhouette (no outline on the fog or the sky behind), thins with
      distance, needs a larger step far away (no shimmer on far grass) and is thin on the first-person weapon;
   5. the sky becomes a flat bokashi gradient in three steps with a hard-edged moon disc and one flat halo ring;
   6. paper: blotch and wood grain fixed to the sheet (no time term, so nothing crawls); hurt and flash are ink washes at the edge.
   Per-world parameters live in STYLES (world id) with per-land overrides in LANDS. Cost: one pass; the OutputPass and the
   film pass are switched off while it runs. */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { landHome, worldById } from '/game/worlds.mjs';

/* The style mode from the URL: 'ink' (?style=ink, also print/on/1) forces the print on in every world; 'off' (?style=off,
   none, plain, 0) forces it off; anything else = 'auto': each world's own style (game/worlds/<id>.mjs `style`; Old Edo = ink). */
export function styleFromUrl() {
  if (typeof location === 'undefined') return 'auto';
  const v = (new URLSearchParams(location.search).get('style') || '').toLowerCase();
  return /^(ink|print|on|1)$/.test(v) ? 'ink' : /^(off|none|plain|0)$/.test(v) ? 'off' : 'auto';
}
/* the style a land is drawn in by default: its world's `style` field (null = the plain render) */
export function styleOfLand(landId) { const wid = landHome(landId)?.world; return wid ? worldById(wid)?.style || null : null; }

/* pal: 5 tones dark to light (sRGB hex). lo/hi/gam: the lightness window mapped onto the tones. bands: number of flat tones.
   soft: step softness (0 hard .. 0.5 smooth). hue: how much of the source hue every pixel keeps (0 pure palette .. 1 own colour).
   acc: accent strength for saturated pixels, accS: [sat start, sat full]. accV: accent lightness lift.
   ink: line colour, line: [near px, far px], lineK: line darkness, fade: [m, m] where lines fade out, edge: crease threshold.
   sky: [top, mid, horizon] bokashi colours, skyH: elevation of the bokashi steps, skySrc: how much of the source sky shows.
   top: strength of the dark band along the top of the sheet. moon: disc colour, moonT: display lightness above which a sky pixel is the disc. paper: paper colour, paperK: texture depth.
   wash: hurt wash colour. */
const STYLES = {
  dark: { pal: [0x0b0f0b, 0x1c261c, 0x3c4a38, 0x7c8a6a, 0xd8dcc0], lo: 0.02, hi: 0.55, gam: 0.85, bands: 5, soft: 0.08, hue: 0.12, acc: 0.9, accS: [0.45, 0.8], accV: 0.25,
    ink: 0x070906, line: [2.4, 1.0], lineK: 0.92, fade: [30, 110], edge: 0.06,
    sky: [0x070a08, 0x141c14, 0x334230], skyH: [0.03, 0.14], skySrc: 0.25, top: 0.6, moon: 0xe8ecd0, moonT: 0.72, paper: 0xe6e2cc, paperK: 0.5, wash: 0x5a0e08 },
  /* Old Edo at night, after Hiroshige's night prints: sumi, slate and moon-grey under a Prussian-blue sky, paper for the
     brightest; one vermilion (the Lord, his banner, blood, hits) and one lamp gold (every light) */
  edo: { pal: [0x111725, 0x222d42, 0x3a4a62, 0x7c8796, 0xe6dcc2], lo: 0.012, hi: 0.66, gam: 0.8, bands: 5, soft: 0.06, hue: 0.55, acc: 1.0, accS: [0.42, 0.78], accV: 0.12,
    red: 0xc0341f, redOnly: 1,
    glow: [0.55, 2.2, 0.5], halo: 0x8f5f2a, core: 0xf8dc92,
    ink: 0x0a0b12, line: [2.2, 0.9], lineK: 0.94, fade: [22, 105], edge: 0.05, vm: [1.1, 1.3], grow: 0.035, fib: 0.35,
    sky: [0x0f1a38, 0x213460, 0x47618a], skyH: [0.025, 0.12], skySrc: 0.0, top: 0.7, moon: 0xf4ecd4, moonT: 0.7, paper: 0xefe5cc, paperK: 0.5, wash: 0xb0301c },
  neon: { pal: [0x06060e, 0x15173a, 0x2e2c62, 0x7a6aa8, 0xf2eaff], lo: 0.02, hi: 0.6, gam: 0.85, bands: 5, soft: 0.06, hue: 0.25, acc: 1.0, accS: [0.3, 0.6], accV: 0.5,
    ink: 0x040408, line: [2.2, 0.9], lineK: 0.9, fade: [25, 100], edge: 0.06,
    sky: [0x05050c, 0x120f2a, 0x2a1e48], skyH: [0.03, 0.18], skySrc: 0.35, top: 0.6, moon: 0xffe8f4, moonT: 0.85, paper: 0xe8e4f0, paperK: 0.35, wash: 0xd0105a },
  frontier: { pal: [0x22100c, 0x5a2616, 0xa44e24, 0xdc9a58, 0xf6e4bc], lo: 0.03, hi: 0.75, gam: 0.9, bands: 5, soft: 0.07, hue: 0.15, acc: 0.8, accS: [0.55, 0.85], accV: 0.2,
    ink: 0x1c0c06, line: [2.4, 1.0], lineK: 0.9, fade: [35, 150], edge: 0.06,
    sky: [0x4a2232, 0xb85a30, 0xf2b46a], skyH: [0.03, 0.2], skySrc: 0.0, top: 0.45, moon: 0xfff0c8, moonT: 0.9, paper: 0xf4e4c4, paperK: 0.55, wash: 0x8a1408 },
  storybook: { pal: [0x2a3424, 0x4e6a34, 0x8eb050, 0xe6dc9a, 0xfffaea], lo: 0.05, hi: 0.95, gam: 1.0, bands: 5, soft: 0.1, hue: 0.55, acc: 0.6, accS: [0.4, 0.8], accV: 0.1,
    ink: 0x3a2818, line: [2.2, 1.0], lineK: 0.8, fade: [40, 160], edge: 0.06,
    sky: [0x6aa2d8, 0x9ccaea, 0xf0f4e4], skyH: [0.04, 0.22], skySrc: 0.0, top: 0.25, moon: 0xfff6d8, moonT: 0.97, paper: 0xfff6e2, paperK: 0.45, wash: 0xa02a1a },
};
/* per-land overrides (merged over the world entry) */
const LANDS = {
  /* the raked gravel and the stone road catch the moon: a wider window keeps them moon-grey, not paper */
  castleroad: { hi: 0.7 },
};

const N = 5;
/* palette numbers are display (sRGB) values and the pass works in display space: no colour management */
function srgbVec(h) { return new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255); }

const INK_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1600, 900) }, uNF: { value: new THREE.Vector2(0.08, 900) },
    uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uExp: { value: 1 }, uOn: { value: 1 },
    uPal: { value: Array.from({ length: N }, () => new THREE.Vector3()) }, uWin: { value: new THREE.Vector4(0.02, 0.5, 0.8, 5) },
    uSoft: { value: 0.07 }, uHue: { value: 0 }, uAcc: { value: new THREE.Vector4(1, 0.42, 0.72, 0.3) },
    uInk: { value: new THREE.Vector3() }, uLine: { value: new THREE.Vector4(2.6, 1, 0.95, 0.06) }, uFade: { value: new THREE.Vector2(28, 120) },
    uSky0: { value: new THREE.Vector3() }, uSky1: { value: new THREE.Vector3() }, uSky2: { value: new THREE.Vector3() }, uSkyH: { value: new THREE.Vector3(0.02, 0.16, 0) },
    uMoon: { value: new THREE.Vector3() }, uMoonT: { value: 0.7 }, uPaper: { value: new THREE.Vector3() }, uPaperK: { value: 0.5 },
    uWash: { value: new THREE.Vector3() }, uHurt: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 },
    uGlow: { value: new THREE.Vector4(1, 2, 0, 0) }, uHalo: { value: new THREE.Vector3() }, uCore: { value: new THREE.Vector3() },
    uRed: { value: new THREE.Vector4(0.75, 0.2, 0.12, 0) }, uLine2: { value: new THREE.Vector4(2.4, 0, 0, 1) }, uSkySrc: { value: 0 }, uDarkK: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `precision highp float;
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uRes; uniform vec2 uNF; uniform mat4 uProjInv; uniform mat4 uCamWorld;
    uniform float uExp; uniform float uOn; uniform vec3 uPal[${N}]; uniform vec4 uWin; uniform float uSoft; uniform float uHue; uniform vec4 uAcc;
    uniform vec3 uInk; uniform vec4 uLine; uniform vec2 uFade; uniform vec3 uSky0; uniform vec3 uSky1; uniform vec3 uSky2; uniform vec3 uSkyH;
    uniform vec3 uMoon; uniform float uMoonT; uniform vec3 uPaper; uniform float uPaperK; uniform vec3 uWash; uniform float uHurt; uniform float uFlash; uniform float uTime;
    uniform vec4 uGlow; uniform vec3 uHalo; uniform vec3 uCore; uniform vec4 uRed; uniform vec4 uLine2; uniform float uSkySrc; uniform float uDarkK;
    varying vec2 vUv;
    /* ACES fitted, as three.js ACESFilmicToneMapping (same exposure scale) */
    vec3 rrtOdt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 color){
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= uExp / 0.6; color = IN * color; color = rrtOdt(color); color = OUT * color; return clamp(color, 0.0, 1.0); }
    vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    vec3 tap(vec2 uv){ return toSrgb(aces(texture2D(tDiffuse, uv).rgb)); }
    float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
    float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float mx3(vec3 c){ return max(max(c.r, c.g), c.b); }
    float mn3(vec3 c){ return min(min(c.r, c.g), c.b); }
    /* view distance (m) from the depth buffer; its inverse for the line test */
    float zAt(vec2 uv){ float d = texture2D(tDepth, uv).x; float n = uNF.x; float f = uNF.y; return 2.0 * n * f / (f + n - (d * 2.0 - 1.0) * (f - n)); }
    float iz(vec2 uv){ return 1.0 / zAt(uv); }
    vec3 pal(float q){ float x = clamp(q, 0.0, 1.0) * ${N - 1}.0; int i = int(min(floor(x), ${N - 2}.0)); float f = x - float(i);
      vec3 a = uPal[0]; vec3 b = uPal[1];
      for (int k = 0; k < ${N - 1}; k++) { if (k == i) { a = uPal[k]; b = uPal[k + 1]; } }
      return mix(a, b, f); }
    /* one direction of the line test: positive on the near side of a step or on a ridge, the far side counts a third */
    float lapDir(vec2 uv, vec2 o, float ic){ float l = 2.0 * ic - iz(uv + o) - iz(uv - o); return max(l, 0.0) + max(-l, 0.0) * 0.33; }
    void main(){
      vec2 px = 1.0 / uRes; vec2 frag = vUv * uRes; float sc = uRes.y / 900.0;
      /* paper: blotches and a faint wood grain (a print block), fixed to the sheet; the fine fibre is weak (on a phone it read as noise) */
      vec2 pp = frag / sc;
      float fib = n2(pp * vec2(0.9, 0.25)) * 0.5 + n2(pp * vec2(0.23, 1.1)) * 0.5;
      float blot = n2(pp / 140.0) * 0.6 + n2(pp / 47.0) * 0.4;
      float grain = 0.5 + 0.5 * sin(pp.y * 0.11 + n2(pp * vec2(0.004, 0.02)) * 9.0 + n2(pp / 23.0) * 1.5);
      float paper = (fib - 0.5) * 0.10 * uLine2.w + (blot - 0.5) * 0.12 + (grain - 0.5) * 0.04;
      /* the image, tone mapped as before */
      vec3 hdr = texture2D(tDiffuse, vUv).rgb;
      vec3 s = toSrgb(aces(hdr));
      /* a softened colour (an X of four taps round the pixel): grass specks and texture noise merge into flat areas */
      vec2 bo = px * 1.6 * sc;
      vec3 sb = s * 0.36 + 0.16 * (tap(vUv + bo) + tap(vUv - bo) + tap(vUv + vec2(bo.x, -bo.y)) + tap(vUv - vec2(bo.x, -bo.y)));
      float Ls = lum(sb);
      float hb = mx3(hdr) * uExp; /* scene light before the tone map (the bloom included): lamps, windows, fires, effects */
      float d0 = texture2D(tDepth, vUv).x; bool sky = d0 >= 0.99999;
      float z = zAt(vUv);
      vec3 col;
      if (sky) {
        /* bokashi sky: three flat steps from the horizon up, dithered edges; the world's own disc (bright pixels) stays, hard-edged */
        vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vp /= vp.w; vec3 rd = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
        float e = rd.y + (blot - 0.5) * 0.03;
        float k1 = smoothstep(uSkyH.x - 0.006, uSkyH.x + 0.006, e); float k2 = smoothstep(uSkyH.y - 0.01, uSkyH.y + 0.01, e);
        col = mix(uSky2, uSky1, k1); col = mix(col, uSky0, k2);
        /* ichimonji bokashi: the top of the sheet takes a deeper band of the darkest sky colour, as in a Hiroshige print */
        col = mix(col, uSky0 * 0.55, smoothstep(0.78, 0.86, vUv.y + (blot - 0.5) * 0.04) * uSkyH.z);
        /* skySrc: some of the land's own sky (clouds, glow) shows through, cut into three tones */
        float qs = floor(clamp((Ls - uWin.x) / max(uWin.y - uWin.x, 1e-3), 0.0, 1.0) * 3.0 + 0.5) / 3.0;
        col = mix(col, mix(pal(qs), s / max(Ls, 1e-3) * lum(pal(qs)), uHue), uSkySrc);
        /* the moon: a hard disc, and (print worlds with lights) one flat pale ring where its glow was */
        float m = smoothstep(uMoonT - 0.03, uMoonT + 0.03, Ls);
        float ring = smoothstep(uMoonT * 0.42 - 0.02, uMoonT * 0.42 + 0.02, Ls) * uGlow.w;
        col = mix(col, mix(col, uMoon, 0.22), ring);
        col = mix(col, uMoon, m * (1.0 - 0.7 * uDarkK));
        /* the dark (world.setDark) takes the sky too, as the fog pass does to the plain sky: without this the land fell to
           black under a bright print sky (a frame that read as a broken, half-black post pass) */
        col *= mix(1.0 - 0.3 * uDarkK, 0.05 + 0.3 * m, uDarkK);
      } else {
        /* value bands (dithered by the low-frequency blotch only, so band edges do not fizz) */
        float t = pow(clamp((Ls - uWin.x) / max(uWin.y - uWin.x, 1e-3), 0.0, 1.0), uWin.z);
        float x = t * (uWin.w - 1.0) + (blot - 0.5) * 0.16 + (fib - 0.5) * 0.1 * (1.0 - uGlow.w);
        float i = floor(x); float f = x - i;
        float q = clamp((i + smoothstep(0.5 - uSoft, 0.5 + uSoft, f)) / (uWin.w - 1.0), 0.0, 1.0);
        vec3 p = pal(q); float lp = lum(p);
        /* hue: each surface keeps a flat share of its own colour (saturation cut into three steps), at the band's value */
        float mx = mx3(sb); float sat = (mx - mn3(sb)) / max(mx, 1e-3);
        float satQ = floor(sat * 3.0 + 0.35) / 3.0;
        vec3 cr = mix(vec3(1.0), sb / max(Ls, 1e-3), satQ / max(sat, 1e-3));
        vec3 base = p * mix(vec3(1.0), cr, uHue); base = clamp(base * lp / max(lum(base), 1e-3), 0.0, 1.0);
        /* accents: vivid pixels keep their hue at the band's value lifted a little; with redOnly only reds do, pulled to the print's vermilion */
        float redness = smoothstep(0.62, 0.86, (sb.r - max(sb.g, sb.b)) / max(sb.r, 1e-3)); /* vermilion and crimson; fire-lit orange ground is not red */
        float a = clamp(uAcc.x * smoothstep(uAcc.y, uAcc.z, sat) * smoothstep(0.08, 0.3, mx) * mix(1.0, redness, uRed.w), 0.0, 1.0);
        vec3 own = sb / max(Ls, 1e-3) * mix(lp, Ls, 0.6);
        vec3 hueC = clamp(own * (1.0 + uAcc.w), 0.0, 1.0);
        hueC = mix(hueC, uRed.rgb * clamp(mx3(hueC) / max(mx3(uRed.rgb), 1e-3), 0.55, 1.15), uRed.w * redness * 0.7);
        col = mix(base, hueC, a);
        /* lights: a flat warm wash for the glow round a lamp (one step), a flat core; a coloured core keeps its own hue */
        float warm = clamp((s.r - s.b) / max(s.r, 1e-3) * 1.8, 0.0, 1.0);
        float halo = smoothstep(uGlow.x, uGlow.x * 1.1, hb) * warm * uGlow.w;
        float core = smoothstep(uGlow.y, uGlow.y * 1.08, hb) * uGlow.w;
        float sats = (mx3(s) - mn3(s)) / max(mx3(s), 1e-3);
        vec3 coreC = mix(uCore, clamp(s / max(mx3(s), 1e-3) * 1.05, 0.0, 1.0), smoothstep(0.3, 0.65, sats) * (1.0 - warm * 0.8));
        col = mix(col, max(col, uHalo), halo * uGlow.z);
        col = mix(col, coreC, core);
        /* ink lines: Laplacian of 1/z in a cross and an X, near side of a step; width thins with distance, thin on the held weapon */
        vec2 wob = (vec2(n2(pp / 9.0), n2(pp / 9.0 + 17.3)) - 0.5) * 1.6 * px * sc;
        bool vm = z < uLine2.y;
        float w = (vm ? uLine2.x : mix(uLine.x, uLine.y, smoothstep(2.0, 30.0, z))) * sc;
        vec2 o = px * w; vec2 uv = vUv + wob;
        float ic = iz(uv);
        float lap = max(max(lapDir(uv, vec2(o.x, 0.0), ic), lapDir(uv, vec2(0.0, o.y), ic)), max(lapDir(uv, o, ic), lapDir(uv, vec2(o.x, -o.y), ic))) / max(ic, 1e-6);
        float thr = uLine.w * (1.0 + z * uLine2.z) * (vm ? 2.0 : 1.0);
        float edge = smoothstep(thr, thr * 3.0, lap);
        edge *= 1.0 - smoothstep(uFade.x, uFade.y, z);
        edge *= (0.8 + 0.2 * fib) * (1.0 - core);
        col = mix(col, uInk, edge * uLine.z);
      }
      /* paper over everything; light areas take the paper colour */
      col *= 1.0 + paper * uPaperK * 1.6;
      col = mix(col, uPaper * (1.0 + paper * 0.4), smoothstep(0.82, 1.0, lum(col)) * 0.6);
      /* edge darkening of the sheet, hurt (an ink wash at the edge) and flash (bare paper at the edge) */
      vec2 dd = vUv - 0.5; float r = length(dd * vec2(uRes.x / uRes.y, 1.0)) / length(vec2(uRes.x / uRes.y, 1.0)) * 2.0;
      col *= 1.0 - 0.22 * smoothstep(0.55, 1.05, r);
      col = mix(col, uWash, uHurt * smoothstep(0.35, 0.95, r + (blot - 0.5) * 0.25) * 0.75);
      col = mix(col, uPaper, uFlash * smoothstep(0.5, 0.95, r + (blot - 0.5) * 0.2) * 0.35);
      gl_FragColor = vec4(mix(s, col, uOn), 1.0);
    }`,
};

class InkPass extends Pass {
  constructor(world) {
    super();
    this.world = world; this.depth = null;
    const fs = INK_SHADER.fragmentShader;
    this.uniforms = THREE.UniformsUtils.clone(INK_SHADER.uniforms);
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: INK_SHADER.vertexShader, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
    this.quad = new FullScreenQuad(this.material);
    this.cur = null;
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  params() {
    const id = this.world.biome?.id; if (!id) return null;
    const wid = landHome(id)?.world || 'dark';
    const key = `${wid}/${id}`; if (this.cur?.key === key) return this.cur;
    const P = { ...(STYLES[wid] || STYLES.dark), ...(LANDS[id] || {}) }; P.key = key;
    const u = this.uniforms;
    P.pal.forEach((h, i) => u.uPal.value[i].copy(srgbVec(h)));
    u.uWin.value.set(P.lo, P.hi, P.gam, P.bands); u.uSoft.value = P.soft; u.uHue.value = P.hue; u.uAcc.value.set(P.acc, P.accS[0], P.accS[1], P.accV);
    u.uInk.value.copy(srgbVec(P.ink)); u.uLine.value.set(P.line[0], P.line[1], P.lineK, P.edge); u.uFade.value.set(P.fade[0], P.fade[1]);
    u.uSky0.value.copy(srgbVec(P.sky[0])); u.uSky1.value.copy(srgbVec(P.sky[1])); u.uSky2.value.copy(srgbVec(P.sky[2])); u.uSkyH.value.set(P.skyH[0], P.skyH[1], P.top ?? 0.85);
    u.uSkySrc.value = P.skySrc;
    u.uGlow.value.set(P.glow?.[0] ?? 1, P.glow?.[1] ?? 2, P.glow?.[2] ?? 0, P.glow ? 1 : 0); u.uHalo.value.copy(srgbVec(P.halo ?? 0)); u.uCore.value.copy(srgbVec(P.core ?? 0xffffff));
    { const rv = srgbVec(P.red ?? 0xc0341f); u.uRed.value.set(rv.x, rv.y, rv.z, P.redOnly ? 1 : 0); }
    u.uLine2.value.set(P.vm?.[0] ?? P.line[0], P.vm?.[1] ?? 0, P.grow ?? 0, P.fib ?? 1); u.uMoon.value.copy(srgbVec(P.moon)); u.uMoonT.value = P.moonT; u.uPaper.value.copy(srgbVec(P.paper)); u.uPaperK.value = P.paperK; u.uWash.value.copy(srgbVec(P.wash));
    this.cur = P; return P;
  }
  render(renderer, writeBuffer, readBuffer) {
    const w = this.world; const u = this.uniforms; const cam = w.camera;
    u.tDiffuse.value = readBuffer.texture; u.tDepth.value = this.depth;
    u.uNF.value.set(cam.near, cam.far); u.uProjInv.value.copy(cam.projectionMatrixInverse); u.uCamWorld.value.copy(cam.matrixWorld);
    u.uExp.value = renderer.toneMappingExposure; u.uTime.value = w.time;
    const fl = w.film.uniforms; u.uHurt.value = fl.hurt.value; u.uFlash.value = fl.flash.value;
    u.uDarkK.value = w.fogPass?.uniforms?.uDark?.value?.x || 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}

/* installStyle(world, mode): mode 'auto' (default: each world's own style), 'ink' (forced on) or 'off' (nothing is added).
   The pass is added once, after the bloom, and only switched (enabled) from then on: a world change in either direction
   allocates and frees nothing, and the shader is compiled here (prewarm), so the first Edo frame does not stall.
   While the print is on it stands in for the OutputPass and the film pass (they stay in the chain and come back in the void,
   the title and every other world). The fog pass already reads the scene depth: a wrapper keeps that texture for the lines. */
export function installStyle(world, mode = 'auto') {
  if (mode === true || mode === 'on') mode = 'ink';
  if (!mode || mode === 'off' || !world?.composer) { if (world) world.style = { id: null, mode: 'off', on: false }; return null; }
  const comp = world.composer; const fog = world.fogPass;
  const ink = new InkPass(world);
  const output = comp.passes.find((p) => p.constructor?.name === 'OutputPass');
  const film = world.film;
  const fr = fog.render.bind(fog);
  fog.render = (r, wb, rb, dt, m) => { ink.depth = rb.depthTexture; fr(r, wb, rb, dt, m); };
  const at = comp.passes.indexOf(output);
  comp.insertPass(ink, at < 0 ? comp.passes.length : at);
  const st = { id: 'ink', mode, on: false, pass: ink, STYLES, LANDS };
  const wants = () => { const id = world.biome?.id; if (!id) return false; return st.mode === 'ink' || (st.mode === 'auto' && styleOfLand(id) === 'ink'); };
  const sync = () => {
    const on = !!(wants() && world.renderer.toneMapping === THREE.ACESFilmicToneMapping && ink.params());
    if (on !== st.on || ink.enabled !== on) { st.on = on; ink.enabled = on; if (output) output.enabled = !on; film.enabled = !on; }
  };
  /* the toggle runs inside composer.render, before any pass (a pre-render wrapper keeps world.js untouched) */
  const cr = comp.render.bind(comp);
  comp.render = (dt) => { sync(); cr(dt); };
  const { width, height } = comp.renderer.getDrawingBufferSize(new THREE.Vector2()); ink.setSize(width, height);
  /* prewarm: link the program now (one draw into a 1x1 target that is freed at once) */
  try {
    const r = world.renderer; const rt = new THREE.WebGLRenderTarget(1, 1); const prev = r.getRenderTarget();
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1); tex.needsUpdate = true;
    ink.uniforms.tDiffuse.value = tex; ink.uniforms.tDepth.value = tex;
    r.setRenderTarget(rt); ink.quad.render(r); r.setRenderTarget(prev);
    ink.uniforms.tDiffuse.value = null; ink.uniforms.tDepth.value = null; rt.dispose(); tex.dispose();
  } catch (err) { console.warn('style prewarm', err); }
  ink.enabled = false; if (output) output.enabled = true; film.enabled = true;
  /* tools and tests: world.style.set('auto' | 'ink' | 'off') switches the mode at run time */
  st.set = (m) => { st.mode = m === 'off' || m === 'ink' ? m : 'auto'; sync(); };
  world.style = st;
  return ink;
}

/* The title over the LIVE camp scene (the reel is off). Two variants, picked by the data-title value that index.html sets
   from ?title=:
   cover  (default) "VHS box art": the stage drawn as a 1986 tape cover: painted (posterized) render, scan lines,
          tracking wobble, chroma bleed, a tagline strip, tape-label details and a period PRESS START.
   clean  (?title=clean) pixel SAGEQUEST logo with a shine sweep, a hot sunset sky, a big striped sun, the giant on the
          horizon, rim light, banners, embers, drifting fog and a slow camera drift.
   main.js calls startTitle2(variant, ctx) from startTitle and handle.stop() from enterBuild. Desktop gets one extra
   post pass; a phone or tablet gets the cheap path (CSS overlays, no extra pass). prefers-reduced-motion: no wobble,
   no flicker, no drift. */
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeGear } from './world.js';

const RM = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const CHEAP = (() => { try { return !!window.__sqPhone || /[?&]t2cheap=1/.test(location.search); } catch { return false; } })();
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ---------------- per-variant stage ---------------- */
const STAGE = {
  clean: {
    boss: 'lich',
    logo: { dir: '/assets/title/b/', order: ['swordGlow', 'glow', 'sword', 'back', 'shield', 'face'], w: 230, h: 57, glowA: 0.55 },
    phoneArmed: { stance: 'Sword_Block', hold: [0.76, 0.94, 3.6], beat: ['Sword_Attack', 0.24], yaw: 0, swing: null }, armed: { stance: 'Sword_Block', hold: [0.76, 0.94, 3.6], beat: ['Sword_Attack', 0.2], yaw: 0.25, swing: null, every: 2.4, cut: 0.45 }, sunOnHero: false, banners: false, grid: { col: 0x2ee8d6, k: 1.2, cell: 2.4 },
    sky: { top: 0x12052a, mid: 0x7a1446, hor: 0xff6a1c, low: 0x1a0610 },
    sun: { col0: 0xfff2a0, col1: 0xff8a1e, col2: 0xe0164f, size: 0.8, x: 0.17, y: 0.24 },
    rim: { col: 0xff7a2e, i: 9.0 }, fill: { col: 0x6d4cff, i: 1.1 }, key: { col: 0xffc890, i: 6.0 }, teal: { col: 0x2ee8ff, i: 17.0 }, cloak: 0x9a1020, hemi: { sky: 0xff7a40, ground: 0x2a0c22, i: 0.42 },
    nem: { x: 0.3, size: 1.8, head: 0.7, hx: 0.52, hy: -0.37, sdy: -0.02, eyeW: 0.016, eyeS: 0.07, eyeUp: 0.05 }, phoneNem: { x: 0, size: 0.9, head: 0.7, hx: 0.35, hy: 0.22, eyeW: 0.016, eyeS: 0.05, eyeUp: 0.035 },
    cam: { pos: [-0.5, 0.4, 4.2], look: [0.98, 2.0, 0], fov: 38 },
    landCam: { pos: [-0.5, 0.4, 5.6], look: [1.7, 2.25, 0], fov: 40 },
    phoneCam: { pos: [-0.2, 0.3, 3.6], look: [0.1, 1.7, 0], fov: 58 },
  },
  cover: {
    boss: 'lich', lichPose: ['Spell_Simple_Enter', 0.1], /* arms down: the raised claw read as a loose prop */
    /* phone upright: the boss stays smaller than the hero (210 px thumbnail) */
    over: { phoneNem: { x: 0, size: 0.62, head: 0.7, hx: 0.42, hy: 0.3, sdy: -0.15, eyeW: 0.02, eyeS: 0.06, eyeUp: 0.035 } },
    logo: { dir: '/assets/title/b/', order: ['swordGlow', 'glow', 'sword', 'back', 'shield', 'face'], w: 230, h: 57, glowA: 0.75 },
    sky: { top: 0x080320, mid: 0x5a0f5a, hor: 0xff4a28, low: 0x14040e },
    sun: { col0: 0xffe27a, col1: 0xff5a1e, col2: 0xb0105a, size: 0.8, x: 0.17, y: 0.26 },
    rim: { col: 0xff5a2a, i: 10.0 }, fill: { col: 0x4a7cff, i: 2.4 }, hemi: { sky: 0xff6a50, ground: 0x200830, i: 0.8 },
    phoneArmed: { stance: 'Sword_Block', hold: [0.76, 0.94, 3.6], beat: ['Sword_Attack', 0.24], yaw: 0, swing: null }, armed: { stance: 'Sword_Block', hold: [0.76, 0.94, 3.6], beat: ['Sword_Attack', 0.2], yaw: 0.25, swing: null, every: 2.4, cut: 0.45 }, sunOnHero: false, banners: false, grid: { col: 0x2ee8d6, k: 1.3, cell: 2.0 }, nem: { x: 0.3, size: 1.8, head: 0.7, hx: 0.52, hy: -0.37, sdy: -0.02, eyeW: 0.016, eyeS: 0.07, eyeUp: 0.05 }, phoneNem: { x: 0, size: 0.9, head: 0.7, hx: 0.35, hy: 0.22, eyeW: 0.016, eyeS: 0.05, eyeUp: 0.035 }, phoneSun: { col0: 0xffe27a, col1: 0xff5a1e, col2: 0xb0105a, size: 0.5, x: 0.1, y: 0.05 },
    key: { col: 0xffc890, i: 6.2 }, teal: { col: 0x2ee8ff, i: 18.0 }, cloak: 0xa8142a,
    cam: { pos: [-0.5, 0.4, 4.2], look: [0.98, 2.0, 0], fov: 38 },
    landCam: { pos: [-0.5, 0.4, 5.6], look: [1.7, 2.25, 0], fov: 40 },
    phoneCam: { pos: [-0.2, 0.3, 3.6], look: [0.1, 1.7, 0], fov: 58 },
  },
};

/* the far boss frames per boss (NDC anchor hx, hy; size = screen-height share; eyeS etc.) */
const BNEM = {
  lich: { sunK: 1.45, nem: { x: 0.3, size: 0.97, head: 0.7, hx: 0.5, hy: -0.1, sdy: -0.12, eyeW: 0.026, eyeS: 0.075, eyeUp: 0.05 }, phoneNem: { x: 0, size: 0.9, head: 0.7, hx: 0.35, hy: 0.22, eyeW: 0.016, eyeS: 0.05, eyeUp: 0.035 } },
  giant: { nem: { x: 0.3, size: 0.4, head: 0.7, hx: 0.48, hy: -0.02, sdy: -0.3, eyeW: 0.02, eyeS: 0.07, eyeUp: 0.0 }, phoneNem: { x: 0, size: 0.5, head: 0.7, hx: 0.3, hy: 0.25, eyeW: 0.02, eyeS: 0.05, eyeUp: 0.0 } },
  dragon: { drYaw: -0.9, drPitch: 0.5, drBias: 0.45, drHead: [-3, -2, 1],
    nem: { x: 0.3, size: 0.6, head: 0.7, hx: 0.42, hy: -0.2, sdy: 0.12, eyeW: 0.012, eyeS: 0.05, eyeUp: 0.0 }, phoneNem: { x: 0, size: 0.55, head: 0.7, hx: 0.3, hy: 0.25, sdy: 0.0, eyeW: 0.012, eyeS: 0.04, eyeUp: 0.0 } },
};

/* ---------------- the pixel logo: layers drawn at 1x in a canvas, scaled up by whole device pixels ---------------- */
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('logo layer ' + src)); i.src = src; }); }
class PixelLogo {
  constructor(spec) {
    this.spec = spec; this.cv = document.createElement('canvas'); this.cv.width = spec.w; this.cv.height = spec.h;
    this.cv.className = 't2-logo'; this.ctx = this.cv.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.tmp = document.createElement('canvas'); this.tmp.width = spec.w; this.tmp.height = spec.h; this.tctx = this.tmp.getContext('2d');
    this.L = {}; this.t = 0; this.ready = false;
  }
  async load() {
    const names = [...this.spec.order, 'mask'];
    const imgs = await Promise.all(names.map((n) => loadImg(this.spec.dir + n + '-1x.png')));
    names.forEach((n, i) => { this.L[n] = imgs[i]; });
    /* the grid slab: its dark fill is keyed out, so only the neon lines stand on the scene */
    if (this.L.grid) { const c = document.createElement('canvas'); c.width = this.spec.w; c.height = this.spec.h; const g = c.getContext('2d'); g.drawImage(this.L.grid, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); const a = d.data;
      for (let i = 0; i < a.length; i += 4) { const l = Math.max(a[i], a[i + 1], a[i + 2]); if (l < 90) a[i + 3] = 0; } g.putImageData(d, 0, 0); this.L.grid = c; }
    /* flames: the bounding rows of the flame layer, so each 4 px column can stretch on its own */
    if (this.L.flames) { const c = document.createElement('canvas'); c.width = this.spec.w; c.height = this.spec.h; const g = c.getContext('2d'); g.drawImage(this.L.flames, 0, 0); const a = g.getImageData(0, 0, c.width, c.height).data; let y1 = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3] > 20) y1 = y; this.flameBase = y1 + 1; }
    /* logo B: the boxes of the Q's eye and of the sword, for the blink and the blade shine */
    const bbox = (img) => { const c = document.createElement('canvas'); c.width = this.spec.w; c.height = this.spec.h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const a = g.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return x1 < 0 ? null : { x0, y0, x1, y1 }; };
    if (this.L.shield) this.eye = bbox(this.L.shield);
    if (this.L.sword) this.blade = bbox(this.L.sword);
    this.ready = true; this.draw(0);
  }
  /* fit: whole device pixels per logo pixel, the largest that fits maxW x maxH (CSS px) */
  fit(maxW, maxH) {
    const dpr = window.devicePixelRatio || 1; const { w, h } = this.spec;
    const raw = Math.min((maxW * dpr) / w, (maxH * dpr) / h); const k = Math.max(1, raw >= 3 ? Math.floor(raw * 2) / 2 : Math.floor(raw)); /* half steps only at 3x and up, where an uneven pixel does not show */
    this.cv.style.width = `${(w * k) / dpr}px`; this.cv.style.height = `${(h * k) / dpr}px`;
  }
  draw(t) {
    if (!this.ready) return; const c = this.ctx; const { w, h } = this.spec; c.clearRect(0, 0, w, h);
    for (const n of this.spec.order) {
      const img = this.L[n]; if (!img) continue;
      let a = 1; let dy = 0;
      if (!RM) {
        if (n === 'glow') a = 0.82 + 0.18 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + (Math.sin(t * 31) > 0.97 ? -0.25 : 0);
        if (n === 'glint') a = 0.5 + 0.5 * Math.max(0, Math.sin(t * 2.4));
        if (n === 'fx') a = 0.55 + 0.45 * Math.max(0, Math.sin(t * 3.1 + 1));
        if (n === 'sun') a = 0.92 + 0.08 * Math.sin(t * 1.3);
        if (n === 'swordGlow') a = 0.65 + 0.35 * Math.max(0, Math.sin(t * 2.6 + 0.8));
      }
      if (n === 'glow' && this.spec.glowA) a *= this.spec.glowA;
      if (n === 'grid' && this.spec.gridA) a *= this.spec.gridA;
      c.globalAlpha = Math.max(0, Math.min(1, a));
      if (n === 'flames' && this.flameBase) { /* each 4 px column licks on its own: taller in the middle of the word, never the same twice */
        const fb = this.flameBase; const fr = RM ? 0 : Math.floor(t * 10);
        const FW = this.spec.flameW || 4; for (let x = 0; x < w; x += FW) { const hsh = Math.sin(x * 12.9898 + fr * 78.233) * 43758.5; const r = hsh - Math.floor(hsh); const mid = 1 - Math.abs(x / w - 0.5) * 1.4;
          const k = 1 + (0.25 + 0.9 * mid) * (RM ? 0.5 : r); const sh = fb; c.drawImage(img, x, 0, FW, sh, x, fb - sh * k, FW, sh * k); }
      } else c.drawImage(img, 0, dy);
      c.globalAlpha = 1;
      /* the eye in the Q blinks: shut for 0.14 s every 3.7 s (a dark lid with one lit line) */
      if (n === 'shield' && this.eye && !RM && (t + 1.1) % 3.7 < 0.14) {
        const e = this.eye; const iw = e.x1 - e.x0 + 1; const ih = e.y1 - e.y0 + 1; const ix = e.x0 + Math.round(iw * 0.2); const iy = e.y0 + Math.round(ih * 0.25); const w2 = Math.round(iw * 0.6); const h2 = Math.max(1, Math.round(ih * 0.5));
        c.fillStyle = '#4a0c16'; c.fillRect(ix, iy, w2, h2); c.fillStyle = '#ff8a3a'; c.fillRect(ix, iy + (h2 >> 1), w2, 1);
      }
    }
    /* the shine: a two-stripe diagonal band in logo pixels, clipped to the letter faces, every 3.6 s */
    const period = 2.4; const p = RM ? 0.3 : (t % period) / period; const span = w + h + 30; const x0 = -h - 10 + p * span * 3.2;
    if (x0 < w + 10) {
      const tc = this.tctx; tc.clearRect(0, 0, w, h); tc.globalCompositeOperation = 'source-over'; tc.drawImage(this.L.mask, 0, 0);
      tc.globalCompositeOperation = 'source-in'; tc.fillStyle = 'rgba(255,255,240,1)';
      for (let y = 0; y < h; y++) { const xs = Math.round(x0 + (h - y) * 0.55); tc.fillRect(xs, y, 9, 1); tc.fillRect(xs + 12, y, 4, 1); }
      tc.globalCompositeOperation = 'source-over'; c.drawImage(this.tmp, 0, 0);
    }
    /* the blade shine: a bright notch runs hilt to tip, half a beat after the letters */
    if (this.blade && this.L.sword) {
      const b = this.blade; const q = RM ? 0.6 : ((t + 1.2) % period) / period * 2.6; const bx = Math.round(b.x0 + q * (b.x1 - b.x0 + 16)) - 8;
      if (bx < b.x1 + 8) { const tc = this.tctx; tc.clearRect(0, 0, w, h); tc.globalCompositeOperation = 'source-over'; tc.drawImage(this.L.sword, 0, 0);
        tc.globalCompositeOperation = 'source-in'; tc.fillStyle = 'rgba(255,255,235,1)'; tc.fillRect(bx, 0, 5, h); tc.fillStyle = 'rgba(255,240,200,.55)'; tc.fillRect(bx - 4, 0, 4, h);
        tc.globalCompositeOperation = 'source-over'; c.drawImage(this.tmp, 0, 0); }
    }
  }
}

/* ---------------- 2D overlay: square pixel embers drifting up across the whole frame ---------------- */
class Embers {
  constructor(n, cols) {
    this.cv = document.createElement('canvas'); this.cv.className = 't2-embers'; this.ctx = this.cv.getContext('2d');
    this.n = n; this.cols = cols; this.p = []; this.resize();
    for (let i = 0; i < n; i++) this.p.push(this.spawn(true));
  }
  resize() { const s = 0.5; this.W = Math.max(1, Math.round(innerWidth * s)); this.H = Math.max(1, Math.round(innerHeight * s)); this.cv.width = this.W; this.cv.height = this.H; this.ctx.imageSmoothingEnabled = false; }
  spawn(any) {
    const z = Math.random(); /* depth: near embers are big, fast, few */
    return { x: Math.random() * this.W, y: any ? this.H * (0.35 + Math.random() * 0.65) : this.H + 4, z, s: z > 0.9 ? 5 : z > 0.6 ? 3 : 2, vy: 8 + z * 26, ph: Math.random() * 6.28, life: 0, max: 4 + Math.random() * 5, c: this.cols[(Math.random() * this.cols.length) | 0] };
  }
  update(dt) {
    const c = this.ctx; c.clearRect(0, 0, this.W, this.H);
    for (let i = 0; i < this.p.length; i++) {
      const e = this.p[i]; e.life += dt; e.y -= e.vy * dt; e.x += Math.sin(e.ph + e.life * 1.7) * (6 + e.z * 10) * dt + 4 * dt;
      if (e.y < -6 || e.life > e.max) { this.p[i] = this.spawn(false); continue; }
      const a = Math.min(1, e.life * 2) * Math.min(1, (e.max - e.life) * 0.8) * (0.55 + 0.45 * Math.sin(e.life * 9 + e.ph));
      c.globalAlpha = Math.max(0, a); c.fillStyle = e.c; c.fillRect(Math.round(e.x), Math.round(e.y), e.s, e.s);
      if (e.s > 1) { c.globalAlpha = Math.max(0, a * 0.25); c.fillRect(Math.round(e.x) - 1, Math.round(e.y) - 1, e.s + 2, e.s + 2); }
    }
    c.globalAlpha = 1;
  }
}

/* ---------------- 3D: sky dome, sun, banners, embers, lights ---------------- */
const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FRAG = `uniform vec3 uTop, uMid, uHor, uLow; uniform float uT; varying vec3 vDir;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  void main(){ float y = vDir.y; vec3 c;
    if (y > 0.0) { float a = pow(clamp(y / 0.42, 0.0, 1.0), 0.55); c = mix(uHor, uMid, smoothstep(0.0, 0.45, a)); c = mix(c, uTop, smoothstep(0.4, 1.0, a)); }
    else c = mix(uHor * 0.55, uLow, smoothstep(0.0, 0.08, -y));
    /* long thin cloud bands lit from below */
    vec2 q = vec2(atan(vDir.z, vDir.x) * 3.0 + uT * 0.004, y * 22.0);
    float cl = smoothstep(0.55, 0.85, n2(q * vec2(1.6, 1.0)) * 0.7 + n2(q * 3.1) * 0.3) * smoothstep(0.02, 0.1, y) * (1.0 - smoothstep(0.22, 0.4, y));
    c = mix(c, mix(uHor * 1.25, uMid * 0.6, smoothstep(0.05, 0.3, y)), cl * 0.55);
    gl_FragColor = vec4(c, 1.0); }`;
const SUN_FRAG = `uniform vec3 uC0, uC1, uC2; uniform float uT, uMotion; varying vec2 vUv;
  void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    float disc = 1.0 - smoothstep(0.495, 0.505, r);
    float yy = (p.y + 0.5);
    vec3 c = mix(uC2, uC1, smoothstep(-0.5, 0.15, p.y)); c = mix(c, uC0, smoothstep(0.05, 0.5, p.y));
    /* synthwave cuts in the lower half, thicker toward the bottom, sliding down slowly */
    float band = p.y < 0.08 ? step(0.5 + 0.42 * smoothstep(0.08, -0.5, p.y), fract((p.y - uT * 0.035 * uMotion) * 9.0)) : 1.0;
    float a = disc * band;
    float glow = exp(-max(0.0, r - 0.5) * 5.0) * 0.55 * (1.0 - disc * band);
    vec3 col = c * a + mix(uC1, uC2, 0.4) * glow;
    gl_FragColor = vec4(col, max(a, glow)); }`;
const PLAIN_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

function bannerTex(primary, trim) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = primary; g.fillRect(0, 0, 32, 64); g.fillStyle = trim; g.fillRect(0, 0, 32, 3); g.fillRect(0, 0, 2, 64); g.fillRect(30, 0, 2, 64);
  /* a pixel emblem: a sun over a spear point */
  g.fillStyle = trim; g.fillRect(12, 14, 8, 8); g.fillRect(10, 16, 12, 4); g.fillRect(15, 24, 2, 18); g.fillRect(13, 24, 6, 3);
  g.fillRect(0, 56, 32, 2);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
class Banner {
  constructor(parent, pos, h, tex, phase) {
    this.g = new THREE.Group(); this.g.position.copy(pos); parent.add(this.g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, h + 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.8 }));
    pole.position.y = (h + 0.6) / 2; this.g.add(pole);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), pole.material); bar.rotation.z = Math.PI / 2; bar.position.set(0.5, h + 0.45, 0); this.g.add(bar);
    this.geo = new THREE.PlaneGeometry(0.9, 1.8, 6, 14); this.base = this.geo.attributes.position.array.slice();
    this.cloth = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }));
    this.cloth.position.set(0.5, h + 0.45 - 0.9, 0); this.g.add(this.cloth); this.ph = phase; this.t = 0;
    for (const m of [pole, bar, this.cloth]) m.castShadow = true;
  }
  update(dt) {
    this.t += dt; const a = this.geo.attributes.position.array; const b = this.base;
    for (let i = 0; i < a.length; i += 3) { const x = b[i]; const y = b[i + 1]; const k = (0.9 - y) / 1.8; /* 0 top .. 1 bottom */
      a[i + 2] = Math.sin(this.t * 2.6 + this.ph + x * 3.2 + k * 2.2) * 0.12 * (0.25 + k) + Math.sin(this.t * 5.1 + k * 6) * 0.025 * k;
      a[i] = x + Math.sin(this.t * 1.3 + this.ph) * 0.06 * k * k; }
    this.geo.attributes.position.needsUpdate = true; this.geo.computeVertexNormals();
  }
}

/* ---------------- post: hot grade (variant clean); paint + VHS (variant cover) ---------------- */
const POST_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const T1_POST = `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uT; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(vec3(0.0), mix(vec3(l), c, 1.32));
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.55);
    c += vec3(0.055, 0.0, 0.075) * (1.0 - smoothstep(0.0, 0.35, l)) * 0.6; /* purple in the shadows */
    c *= mix(vec3(1.0), vec3(1.08, 1.0, 0.9), smoothstep(0.35, 0.9, l)); /* warm highlights */
    vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y; c *= 1.0 - 0.42 * smoothstep(0.35, 1.05, length(d));
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`;
const T5_POST = `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uT, uMotion; uniform vec3 uHero; varying vec2 vUv;
  float h11(float x){ return fract(sin(x * 91.7) * 43758.5); }
  float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5); }
  vec3 tex(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
  /* a cheap painterly filter: of 4 quadrants, the one with the least variance wins (Kuwahara with 4 taps each) */
  vec3 paint(vec2 uv){ vec2 px = 1.0 / uRes; float r = 1.4;
    vec3 best = vec3(0.0); float bv = 1e9;
    for (int q = 0; q < 4; q++) {
      vec2 s = vec2(q == 1 || q == 3 ? 1.0 : -1.0, q >= 2 ? 1.0 : -1.0);
      vec3 a = tex(uv + s * px * vec2(0.5, 0.5) * r), b = tex(uv + s * px * vec2(1.5, 0.5) * r), c = tex(uv + s * px * vec2(0.5, 1.5) * r), d = tex(uv + s * px * vec2(1.5, 1.5) * r);
      vec3 m = (a + b + c + d) * 0.25; vec3 v3 = (a*a + b*b + c*c + d*d) * 0.25 - m * m; float v = v3.r + v3.g + v3.b;
      if (v < bv) { bv = v; best = m; } }
    return best; }
  vec3 rgb2yiq(vec3 c){ return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
  vec3 yiq2rgb(vec3 c){ return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }
  void main(){
    vec2 uv = vUv; float t = uT * uMotion; float rows = uRes.y;
    float line = floor(uv.y * rows / 2.0);
    /* tracking: a soft band rolls up the frame; inside it rows tear sideways */
    /* the hero is the cover painting: the tape noise stays light over him */
    vec2 hd = (vUv - uHero.xy) * vec2(uRes.x / uRes.y * 1.6, 1.0); float hero = 1.0 - smoothstep(uHero.z * 0.75, uHero.z * 1.15, length(hd));
    float bandY = fract(-t * 0.07 + 0.35); float inBand = exp(-pow((uv.y - bandY) * 18.0, 2.0)) * uMotion * (1.0 - 0.7 * hero);
    /* a tracking glitch every 2.6 s: for 0.35 s a wide band tears and the frame slips */
    float gp = fract((t + 3.2) / 4.5); float gl = step(gp, 0.067) * uMotion; float gY = fract(0.7 - floor((t + 3.2) / 4.5) * 0.37) - gp * 2.4;
    float gB = exp(-pow((uv.y - gY) * 11.0, 2.0)) * gl * (1.0 - 0.85 * hero);
    inBand = max(inBand, gB);
    float jit = (h11(line + floor(t * 30.0)) - 0.5) * (0.004 * inBand + 0.03 * gB) + sin(uv.y * 40.0 + t * 3.0) * 0.0006 * uMotion + gl * 0.002 * sin(t * 90.0);
    /* head switching: the bottom rows shear and fizz */
    float head = smoothstep(0.035, 0.0, uv.y) * uMotion; jit += head * (0.02 + 0.01 * h11(line + floor(t * 24.0)));
    uv.x += jit;
    vec3 p = paint(uv);
    /* airbrush: a soft saturated lift and a warm gradient map (shadow violet, mid magenta, light amber) */
    vec2 px = 1.0 / uRes;
    float l = dot(p, vec3(0.2126, 0.7152, 0.0722));
    p = max(vec3(0.0), mix(vec3(l), p, 1.3));
    vec3 gm = mix(vec3(0.16, 0.04, 0.26), vec3(0.85, 0.2, 0.42), smoothstep(0.05, 0.45, l)); gm = mix(gm, vec3(1.0, 0.82, 0.5), smoothstep(0.45, 0.95, l));
    p = mix(p, gm * (0.6 + 0.6 * l), 0.28 * smoothstep(0.01, 0.07, l)); /* black stays black: the boss is a cut-out */
    p = mix(p, p * p * (3.0 - 2.0 * p), 0.35); p *= smoothstep(0.02, 0.09, l) * 0.9 + 0.1;
    /* chroma bleed: the colour runs 3-6 px to the right of the brightness, softly */
    vec3 y = rgb2yiq(p);
    vec3 cs = vec3(0.0); for (int i = 0; i < 5; i++) { cs += rgb2yiq(tex(uv - vec2(px.x * (2.0 + float(i) * 1.6), 0.0))); }
    y.yz = mix(y.yz, cs.yz / 5.0 * 1.15, 0.4 * (1.0 - 0.75 * hero) * smoothstep(0.015, 0.1, y.x));
    vec3 c = yiq2rgb(y);
    c += inBand * (h21(vec2(line, floor(t * 40.0))) * 0.12);
    c += head * h21(uv * uRes + t) * 0.25;
    /* scan lines every 2 px and a soft tube shape */
    c *= 1.0 - (0.12 - 0.08 * hero) * (1.0 - step(0.5, fract(gl_FragCoord.y * 0.5)));
    c = mix(c, c * 1.12 + 0.02, hero * 0.6); /* a touch of lift on the painted hero */
    vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y; c *= 1.0 - 0.5 * smoothstep(0.4, 1.1, length(d));
    c += (h21(vUv * uRes + fract(t) * 7.0) - 0.5) * 0.05 * (1.0 - 0.6 * hero);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`;

/* ---------------- CSS for both variants ---------------- */
const CSS = `
html[data-title] #title { background: transparent; }
html[data-title] #title::after { display: none; }
#title .t2-layer { position: absolute; inset: 0; pointer-events: none; }
#title .t2-embers { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; z-index: 1; pointer-events: none; }
#title .t2-fog { position: absolute; left: -20%; right: -20%; bottom: 0; height: 46%; z-index: 1; pointer-events: none; opacity: .3; mix-blend-mode: screen;
  background: radial-gradient(60% 50% at 30% 80%, rgba(255,120,60,.35), transparent 70%), radial-gradient(50% 45% at 75% 90%, rgba(200,60,160,.3), transparent 70%); animation: t2fog 18s ease-in-out infinite alternate; }
@keyframes t2fog { from { transform: translateX(-6%); } to { transform: translateX(6%); } }
#title .t2-logo { image-rendering: pixelated; image-rendering: crisp-edges; display: block; margin: 0 auto; filter: drop-shadow(0 6px 0 rgba(30,4,10,.7)); }
#title h1.t2-h1 { margin: 0; font-size: 0; line-height: 0; letter-spacing: 0; text-shadow: none; white-space: normal; }
#title .t2-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
#title .box { z-index: 2; }
/* ---- variant clean ---- */
html[data-title=clean] #title .box { justify-content: space-between; padding: clamp(28px, 6vh, 72px) 24px clamp(26px, 5vh, 56px); }
html[data-title=clean] #title::before { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 42%; z-index: 1; pointer-events: none; background: linear-gradient(0deg, rgba(14,2,10,.82), rgba(14,2,10,.5) 45%, rgba(14,2,10,0)); }
html[data-title=clean] #title .t2-top { display: flex; flex-direction: column; align-items: center; gap: clamp(8px, 1.6vh, 18px); }
html[data-title=clean] #title .t2-bot { display: flex; flex-direction: column; align-items: center; }
html[data-title=clean] #title .lead { margin: 0; padding: .2em .6em; background: none; box-shadow: none; -webkit-text-stroke: 0; font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 800; letter-spacing: 0; font-size: clamp(22px, min(2.2vw, 3.8vh), 36px); line-height: 1.05; color: #fff1c8; text-shadow: 2px 2px 0 #3a0610, 0 0 8px rgba(20,2,8,.8); }
html[data-title=clean] #title .btn.big { margin-top: 0; height: 78px; padding: 0 44px 0 48px; border-radius: 0; font-family: 'Press Start 2P', var(--mono); font-weight: 400; text-transform: uppercase; letter-spacing: .04em; font-size: clamp(18px, min(1.6vw, 2.8vh), 24px);
  color: #2a0608; background: linear-gradient(#ffe27a, #ffb030 48%, #ff7a1e 52%, #e8401a); border: 0;
  box-shadow: 0 0 0 3px #2a0608, 0 0 0 5px #ffcf6a, 0 8px 0 3px #2a0608, 0 14px 40px rgba(255,80,30,.45); }
html[data-title=clean] #title .btn.big:hover { filter: brightness(1.08); }
html[data-title=clean] #title .btn.big:active { transform: translateY(3px); }
html[data-title=clean] #title .credit { margin-top: clamp(14px, 2.2vh, 22px); font-family: 'VT323', var(--mono); font-size: clamp(18px, 1.6vw, 34px); line-height: 1.15; color: #ffe6c8; text-shadow: 2px 2px 0 #3a0610; }
html[data-title=clean] #title .credit br { display: none; } html[data-title=clean] #title .credit span { margin-left: .4em; }
html[data-title=clean] #title .credit span { color: #fff1d8; }
html[data-title=clean] #title small { position: static; margin-top: 6px; font-family: 'VT323', var(--mono); font-size: clamp(17px, 1.45vw, 30px); color: rgba(255,230,200,.8); text-shadow: 2px 2px 0 #3a0610; }
/* ---- variant cover ---- */
html[data-title=cover] #title .box { justify-content: space-between; padding: clamp(26px, 5.2vh, 60px) 24px clamp(18px, 3.6vh, 40px); }
html[data-title=cover] #title .t2-top { display: flex; flex-direction: column; align-items: center; gap: 0; }
html[data-title=cover] #title .t2-bot { display: flex; flex-direction: column; align-items: center; width: 100%; }
html[data-title=cover] #title .lead { margin: 0; padding: .1em .6em .2em; transform: rotate(-3deg); font-family: var(--serif); font-style: italic; font-weight: 900; letter-spacing: -.01em;
  font-size: clamp(20px, min(2.3vw, 4vh), 38px); color: #fff3d6; background: none !important; box-shadow: none !important; border: 0 !important; text-shadow: 3px 3px 0 #8a0c2a, 5px 5px 0 #2a0414, 0 0 22px rgba(255,90,30,.55);
  text-shadow: 2px 2px 0 #3a0410, -1px 0 0 rgba(0,220,255,.45), 1px 0 0 rgba(255,0,80,.45); box-shadow: 0 2px 0 #ffcf6a inset, 0 -2px 0 #ffcf6a inset; }
html[data-title=cover] #title .btn.big { margin-top: clamp(18px, 3vh, 34px); height: auto; padding: 16px 28px 15px 22px; border-radius: 0; background: linear-gradient(#ffe27a, #ffb030 48%, #ff7a1e 52%, #e8401a); border: 0; box-shadow: 0 0 0 3px #1a0408, 6px 7px 0 3px #1a0408;
  font-family: 'Press Start 2P', var(--mono); font-size: clamp(16px, min(1.6vw, 2.8vh), 24px); letter-spacing: .06em; color: #2a0608; text-transform: uppercase;
  text-shadow: 1px 1px 0 rgba(255,240,180,.6); }
html[data-title=cover] #title .btn.big i { display: none; }
html[data-title=cover] #title .btn.big .t2-blink { animation: t2blink 1.1s steps(1) infinite; }
html[data-title=cover] #title .btn.big:hover, html[data-title=cover] #title .btn.big:focus-visible { filter: brightness(1.08); outline: 3px solid #fff3a0; outline-offset: 5px; }
html[data-title=cover] #title .t2-logo.t2-tear { filter: drop-shadow(-4px 0 0 rgba(0,230,255,.7)) drop-shadow(4px 0 0 rgba(255,0,90,.7)); transform: translateX(3px); }
html[data-title] #title .btn.big .t2-tri { display: inline-block; margin-right: .7em; color: #b0102a; animation: t2blink 1s steps(1) infinite; }
@keyframes t2blink { 0% { opacity: 1; } 50% { opacity: 0; } }
html[data-title=cover] #title .t2-bill { position: absolute; z-index: 1; left: 0; right: 0; bottom: 0; height: var(--bill); background: #0c0408; box-shadow: 0 -3px 0 #7a0c5a, 0 -6px 0 #e8203a, 0 -9px 0 #ff7a1e, 0 -12px 0 #ffcf3a; pointer-events: none; }
html[data-title=cover] #title { --bill: clamp(50px, 5.8vh, 58px); }
@media (min-aspect-ratio: 1/1) and (min-height: 501px) { html[data-title] #title .btn.big { position: relative; left: clamp(60px, 12vw, 240px); } }
@media (max-aspect-ratio: 1/1) { html[data-title=cover] #title .t2-bill { display: none; } }
html[data-title=cover] #title .credit br { display: none; } html[data-title=cover] #title .credit span { display: inline; margin-left: .7em; }
html[data-title=cover] #title .credit { margin-top: calc(clamp(14px, 2.4vh, 26px) + 12px); font-family: var(--sans); font-weight: 600; font-size: clamp(12px, min(1vw, 1.8vh), 15px); letter-spacing: .32em; text-transform: uppercase; color: #ffe3c0; line-height: 1.9; text-shadow: 0 1px 0 #000; }
html[data-title=cover] #title .credit span { color: #ffb36a; }
html[data-title=cover] #title small { position: static; margin-top: 2px; font-family: var(--sans); font-weight: 600; font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,230,200,.7); }
html[data-title=cover] #title .t2-osd { position: absolute; z-index: 3; top: clamp(14px, 3vh, 30px); left: clamp(16px, 2.6vw, 40px); font-family: 'VT323', var(--mono); font-size: clamp(22px, min(2.2vw, 4vh), 36px); line-height: 1; color: #f4fff4; text-shadow: 2px 2px 0 rgba(0,0,0,.6); letter-spacing: .04em; pointer-events: none; }
html[data-title=cover] #title .t2-osd b { font-weight: 400; margin-right: .5em; }
html[data-title=cover] #title .t2-tape { position: absolute; z-index: 4; top: calc(var(--band) / 2); transform: translateY(-50%); right: clamp(16px, 2.6vw, 40px); display: flex; gap: 8px; align-items: center; pointer-events: none; }
html[data-title=cover] #title .t2-tape span { font-family: var(--sans); font-weight: 800; font-size: clamp(13px, min(1.15vw, 2vh), 17px); letter-spacing: .14em; padding: 4px 7px 3px; color: #1a0610; background: #ffe3c0; }
html[data-title=cover] #title .t2-tape span + span { color: #ffe3c0; background: transparent; box-shadow: inset 0 0 0 2px #ffe3c0; }
html[data-title=cover] #title .t2-frame { position: absolute; inset: 0; z-index: 2; pointer-events: none; box-shadow: inset 0 0 0 clamp(6px, .9vw, 12px) #0c0408; }
html[data-title=cover] #title .t2-scan { position: absolute; inset: 0; z-index: 2; pointer-events: none; -webkit-mask-image: radial-gradient(ellipse 42% 30% at 45% 58%, transparent 45%, #000 100%); mask-image: radial-gradient(ellipse 42% 30% at 45% 58%, transparent 45%, #000 100%); background: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px); mix-blend-mode: multiply; }
html[data-title=cover] #title .t2-track { position: absolute; left: 0; right: 0; height: 9%; z-index: 2; pointer-events: none; top: 0; background: linear-gradient(transparent, rgba(255,255,255,.07) 45%, rgba(255,255,255,.12) 50%, rgba(255,255,255,.07) 55%, transparent); animation: t2track 7s linear infinite; }
@keyframes t2track { from { transform: translateY(1100%); } to { transform: translateY(-120%); } }
html[data-title=cover] #title .box { animation: t2wob 4.2s steps(1) infinite; }
@keyframes t2wob { 0%, 100% { transform: none; } 41% { transform: translateX(1px); } 42% { transform: translateX(-2px); } 43% { transform: none; } 77% { transform: translateY(1px); } 78% { transform: none; } }
/* variant cover on a wide screen: the cover's words keep to the left, the hero stands on the right */
@media (min-aspect-ratio: 1/1) {
  html[data-title=cover] #title .box { padding: calc(var(--band) + clamp(10px, 2vh, 24px)) clamp(28px, 3.4vw, 64px) clamp(22px, 3.6vh, 40px); }
  html[data-title=cover] #title .box { padding-bottom: calc(var(--bill) + 16px); }
  html[data-title=cover] #title .t2-bot { position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; padding: 0 16px; display: flex; flex-direction: column; align-items: center; }
  html[data-title=cover] #title .t2-bot .credit, html[data-title=cover] #title .t2-bot small { line-height: 1.3; }
  html[data-title=cover] #title .t2-bot { padding-bottom: calc((var(--bill) - 36px) / 2); }
  html[data-title=cover] #title .t2-bot .btn.big { margin: 0 0 calc((var(--bill) - 36px) / 2 + clamp(30px, 5vh, 54px)); font-size: clamp(20px, 1.75vw, 30px); padding: .8em 1.5em .75em 1.1em; }
  html[data-title=cover] #title .t2-bot .credit { margin: 0; text-align: center; white-space: nowrap; font-size: clamp(15px, 1.35vw, 30px); letter-spacing: .06em; }
  html[data-title=cover] #title .t2-bot small { margin: 2px 0 0; text-align: center; white-space: nowrap; font-size: clamp(15px, 1.35vw, 30px); letter-spacing: .04em; color: rgba(255,230,200,.85); }
  html[data-title=cover] #title { --bill: calc(3.6vw + 14px); }
}
html[data-title=cover] #title { --band: clamp(26px, 4vh, 42px); }
html[data-title=cover] #title .t2-band { position: absolute; z-index: 3; left: 0; right: 0; top: 0; height: var(--band); pointer-events: none; background: #0c0408;
  box-shadow: 0 3px 0 #ffcf3a, 0 6px 0 #ff7a1e, 0 9px 0 #e8203a, 0 12px 0 #7a0c5a; }
#title .t2-logo { animation: t2in .45s 0s steps(6) backwards, t2shake .36s .45s steps(1); }
@keyframes t2shake { 0% { transform: translate(4px, -3px); } 25% { transform: translate(-4px, 3px); } 50% { transform: translate(3px, 2px); } 75% { transform: translate(-2px, -2px); } 100% { transform: none; } }
/* the cold open: black, a slash of light, then the picture */
#title .t2-flash { position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at 70% 45%, rgba(255,236,190,.95), rgba(255,140,60,.45) 40%, rgba(255,80,40,0) 75%); mix-blend-mode: screen; }
#title .t2-intro { position: absolute; inset: 0; z-index: 30; pointer-events: none; background: transparent; animation: t2open .25s .05s ease-out forwards; overflow: hidden; }
#title .t2-intro i { position: absolute; left: -30%; top: 50%; width: 160%; height: 5px; margin-top: -2px; transform: rotate(-14deg) translateX(-110%); background: linear-gradient(90deg, transparent, #ff7a1e 30%, #fff6d0 50%, #2ee8ff 70%, transparent); box-shadow: 0 0 24px 6px rgba(255,140,40,.8); animation: t2slash .3s .02s ease-in forwards; }
@keyframes t2open { to { opacity: 0; visibility: hidden; } }
@keyframes t2slash { to { transform: rotate(-14deg) translateX(110%); } }
html[data-title] #title .btn.big { animation: t2blink 1.6s 1.25s ease-in-out infinite; }
@keyframes t2blink { 50% { filter: brightness(1.35) drop-shadow(0 0 14px rgba(255,190,60,.95)); } }
/* tape cover dressing */
html[data-title=cover] #title .t2-spine-r { left: auto !important; right: 0; transform: scaleX(-1); }
html[data-title=cover] #title .t2-spine { position: absolute; z-index: 3; left: 0; top: var(--band); bottom: var(--bill); width: clamp(14px, 1.6vw, 26px); pointer-events: none;
  background: linear-gradient(90deg, #0c0408 0 18%, #ffcf3a 18% 36%, #ff7a1e 36% 54%, #e8203a 54% 72%, #7a0c5a 72% 90%, #0c0408 90%); }
html[data-title=cover] #title .t2-sticker { position: absolute; z-index: 4; left: calc(clamp(14px, 1.6vw, 26px) + clamp(16px, 2.4vw, 44px)); top: calc(var(--band) + clamp(14px, 3vh, 36px)); width: clamp(96px, 9.6vw, 160px); aspect-ratio: 1; border-radius: 50%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; transform: rotate(-14deg); pointer-events: none; color: #1a0610; text-align: center; line-height: 1;
  background: radial-gradient(circle at 35% 30%, #fff36a, #ffd000 45%, #ff9a00); box-shadow: 0 0 0 3px #1a0610, 0 0 0 6px #fff1a0, 4px 6px 0 6px rgba(10,2,6,.55); font-family: var(--sans); font-weight: 900; }
html[data-title=cover] #title .t2-sticker b { font-size: clamp(17px, 1.85vw, 31px); letter-spacing: -.02em; }
html[data-title=cover] #title .t2-sticker small { position: static; display: block; margin-top: .3em; font-size: clamp(8px, .72vw, 12px); letter-spacing: .12em; text-transform: uppercase; color: #8a0c2a; font-weight: 800; }
html[data-title=cover] #title .t2-rate { position: absolute; z-index: 4; right: clamp(16px, 2.4vw, 40px); bottom: calc(var(--bill) + clamp(12px, 2.4vh, 28px)); display: flex; align-items: stretch; pointer-events: none; font-family: var(--sans); font-weight: 900; color: #fff3d6; box-shadow: 0 0 0 2px #fff3d6; background: #0c0408; transform: skewX(-8deg); }
html[data-title=cover] #title .t2-rate b { display: flex; align-items: center; padding: 0 .35em; font-size: clamp(20px, 2vw, 34px); background: #fff3d6; color: #0c0408; }
html[data-title=cover] #title .t2-rate span { display: flex; flex-direction: column; justify-content: center; padding: .25em .6em; font-size: clamp(8px, .72vw, 12px); letter-spacing: .14em; line-height: 1.35; text-transform: uppercase; }
html[data-title=cover] #title .t2-tape span:first-child { font-style: italic; font-size: clamp(15px, 1.4vw, 22px); letter-spacing: .02em; transform: skewX(-12deg); padding: 2px 9px 1px; background: #fff3d6; }
@media (max-aspect-ratio: 1/1) { html[data-title] #title .lead { text-shadow: 2px 2px 0 #2a0410, 0 0 6px #12020a, 0 0 14px #12020a, 0 0 24px rgba(18,2,10,.9); } html[data-title=cover] #title .t2-spine, html[data-title=cover] #title .t2-rate { display: none; } html[data-title=cover] #title .t2-sticker { width: 52px; left: 14px; right: auto; top: 25%; bottom: auto; } html[data-title] #title .t2-bot { background: linear-gradient(rgba(8,2,6,0), rgba(8,2,6,.72) 38%); } html[data-title=cover] #title .t2-sticker b { font-size: 12px; white-space: nowrap; } html[data-title=cover] #title .t2-sticker small { font-size: 6px; letter-spacing: .04em; white-space: nowrap; } }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { html[data-title=cover] #title .t2-sticker { width: 64px; left: calc(clamp(14px, 1.6vw, 26px) + 12px); top: calc(var(--band) + 14px); } html[data-title=cover] #title .t2-sticker b { font-size: 11px; white-space: nowrap; } html[data-title=cover] #title .t2-sticker small { font-size: 5.5px; letter-spacing: .03em; white-space: nowrap; } html[data-title=cover] #title { --bill: 40px; } }
@media (prefers-reduced-motion: reduce) { #title .t2-intro { display: none; } html[data-title] #title .btn.big { animation: none; } }
/* the tagline arrives whole with its box (no word-by-word fade, so no empty bar on the first frame of a clip) */
html[data-title] #title .lead span { animation: none; opacity: 1; transform: none; filter: none; }
html[data-title] #title .lead { animation: t2lead .3s .15s steps(3) backwards; }
@media (min-aspect-ratio: 1/1) and (min-height: 501px) { html[data-title][data-title] #title .lead { max-width: min(40vw, 700px); } }
@media (min-aspect-ratio: 1/1) { #title .t2-fog { -webkit-mask-image: linear-gradient(90deg, #000 30%, transparent 52%); mask-image: linear-gradient(90deg, #000 30%, transparent 52%); } }
html[data-title][data-title] #title .lead { text-shadow: 2px 2px 0 #2a0410, 0 0 6px #12020a, 0 0 14px #12020a, 0 0 24px rgba(18,2,10,.9); }
@keyframes t2lead { from { opacity: 0; } }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { html[data-title=cover] #title .box { padding-top: calc(var(--band) + 38px); } html[data-title=cover] #title .t2-bot .btn.big { font-size: 13px; padding: .7em 1.3em .65em 1em; margin-bottom: 30px; } html[data-title=cover] #title .t2-bot .credit { font-size: 9px; } html[data-title=cover] #title .t2-bot small { font-size: 8px; } }
@media (prefers-reduced-motion: reduce) { html[data-title] #title .lead, #title .t2-logo { animation: none; } }
@media (max-aspect-ratio: 1/1) { html[data-title=cover] #title .credit { font-size: 10px; letter-spacing: .08em; } html[data-title=cover] #title .credit br { display: none; } html[data-title=cover] #title .credit span { display: block; margin: 1px 0 0 !important; } html[data-title=cover] #title .t2-bot .credit, html[data-title=cover] #title .t2-bot small { text-shadow: 0 1px 0 #000, 0 0 5px #000, 0 0 10px #000, 0 0 18px rgba(0,0,0,.95); } html[data-title=cover] #title small { letter-spacing: -.02em; font-size: 9.4px; } html[data-title=cover] #title .t2-bot small { white-space: normal; text-wrap: balance; padding: 0 14px; } }
@keyframes t2in { 0% { transform: scale(1.18); } 55% { transform: scale(.96); } 75% { transform: scale(1.02); } 100% { transform: none; } }
/* ---- phones: the logo on top, the words at the bottom; a phone on its side keeps the words to the left ---- */
@media (max-width: 700px) { html[data-title] #title .lead { font-size: 17px; } html[data-title=clean] #title .lead { font-size: 21px; } html[data-title=cover] #title .credit { letter-spacing: .1em !important; } html[data-title=clean] #title .btn.big { height: 62px; padding: 0 26px 0 30px; font-size: 16px; } }
@media (max-height: 500px) and (orientation: landscape) {
  html[data-title] #title .box { padding: 14px 20px 12px; }
  html[data-title=cover] #title .box { padding-top: calc(var(--band) + 18px); }
  html[data-title] #title .credit { margin-top: 8px !important; font-size: 12px; line-height: 1.4; }
  html[data-title] #title small { margin-top: 4px; font-size: 11px; }
  html[data-title=cover] #title .credit { font-size: 10px; letter-spacing: .08em; line-height: 1.5; } html[data-title=cover] #title small { font-size: 9px; letter-spacing: .1em; line-height: 1.3; } html[data-title=cover] #title .credit { line-height: 1.3; } html[data-title=cover] #title { --bill: 50px; } html[data-title=cover] #title .t2-bot { padding-bottom: 8px; }
  html[data-title] #title .lead { font-size: 15px; }
  html[data-title=clean] #title .btn.big { height: 46px; font-size: 16px; }
  html[data-title=cover] #title .btn.big { margin-top: 10px; font-size: 14px; }
 }
@media (prefers-reduced-motion: reduce) { #title .t2-fog, html[data-title=cover] #title .t2-track, html[data-title=cover] #title .box, html[data-title=cover] #title .btn.big .t2-blink { animation: none !important; } }
`;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function fontLink() {
  if (document.getElementById('t2-fonts')) return;
  const l = document.createElement('link'); l.id = 't2-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap'; document.head.appendChild(l);
}

/* ---------------- the handle ---------------- */
export function startTitle2(variant, { world, S, camp, root }) {
  if (!STAGE[variant]) return null;
  /* ?t2boss=dragon|giant|lich swaps the far boss on the title; each has its own frame */
  const BOSS = (() => { try { return (location.search.match(/[?&]t2boss=(dragon|giant|lich)/) || [])[1] || STAGE[variant].boss || null; } catch { return null; } })();
  const V = { ...STAGE[variant], ...(BOSS && BNEM[BOSS] ? BNEM[BOSS] : {}), ...(STAGE[variant].over || {}) };
  if (BOSS && world.nemesisId !== BOSS) { world.nemesisId = null; world.setNemesis(BOSS, S.heroUrl); }
  const style = el('style'); style.id = 't2-css'; style.textContent = CSS; document.head.appendChild(style);
  fontLink();
  const box = root.querySelector('.box'); const h1 = box.querySelector('h1'); const lead = box.querySelector('.lead');
  const start = box.querySelector('#start'); const credit = box.querySelector('.credit'); const small = box.querySelector('small');
  /* the DOM: logo on top; words and the start at the bottom */
  const top = el('div', 't2-top'); const bot = el('div', 't2-bot');
  const h = el('h1', 't2-h1'); const logo = new PixelLogo(V.logo); h.appendChild(logo.cv); logo.cv.setAttribute('aria-hidden', 'true');
  h.appendChild(el('span', 't2-sr', 'Sage Quest')); top.appendChild(h);
  const moved = [];
  const move = (node, to) => { if (!node) return; moved.push([node, node.parentNode, node.nextSibling]); to.appendChild(node); };
  if (variant === 'clean') { move(lead, top); move(start, bot); move(credit, bot); move(small, bot); } else { move(lead, top); move(start, bot); move(credit, bot); move(small, bot); }
  box.prepend(top); box.appendChild(bot);
  const startHTML = start.innerHTML;
  { start.innerHTML = '<span class="t2-tri" aria-hidden="true">&#9654;</span><span>Press start</span>'; start.setAttribute('aria-label', 'Start now'); }
  const extra = [];
  const add = (node) => { root.appendChild(node); extra.push(node); return node; };
  const embers = new Embers(CHEAP ? 30 : 80, variant === 'cover' ? ['#ffd36a', '#ff7a2e', '#ff3a5a', '#ffe9b0'] : ['#ffd36a', '#ff8a2e', '#ff4a1e', '#fff1c0']);
  root.insertBefore(embers.cv, box); extra.push(embers.cv);
  const fog = el('div', 't2-fog'); root.insertBefore(fog, box); extra.push(fog);
  let osd = null;
  if (variant === 'cover') {
    add(el('div', 't2-frame')); add(el('div', 't2-band')); add(el('div', 't2-spine'));
    add(el('div', 't2-sticker', '<b>2-NIGHT<br>RENTAL</b>')).setAttribute('aria-hidden', 'true');
    add(el('div', 't2-spine t2-spine-r'));
    { const bill = el('div', 't2-bill'); box.insertBefore(bill, bot); extra.push(bill); } /* inside the box: the box has its own stacking order */
    if (CHEAP) { add(el('div', 't2-scan')); if (!RM) add(el('div', 't2-track')); }
    const tape = add(el('div', 't2-tape', '<span>VHS</span><span>HI-FI STEREO</span>')); tape.setAttribute('aria-hidden', 'true');
  }
  if (!RM) add(el('div', 't2-intro', '<i></i>')).setAttribute('aria-hidden', 'true');
  const flash = RM ? null : add(el('div', 't2-flash')); if (flash) flash.setAttribute('aria-hidden', 'true');
  const layout = () => {
    const W = innerWidth; const H = innerHeight; const land = H < 500 && W > H;
    if (variant === 'clean') logo.fit(Math.min(W * (land ? 0.56 : W < H ? 0.96 : 0.72), 1240), H * (land ? 0.3 : W < H ? 0.2 : 0.27));
    else logo.fit(Math.min(W * (W > H ? 0.64 : 0.96), 1300), H * (land ? 0.22 : W > H ? 0.6 : 0.34));
    embers.resize();
  };
  layout(); addEventListener('resize', layout);
  const logoReady = logo.load().catch((e) => console.warn('title2 logo', e));

  /* ---- 3D ---- */
  const scene = world.scene; const grp = new THREE.Group(); grp.name = 'title2'; scene.add(grp);
  const own = []; const keep = (x) => { own.push(x); return x; };
  const sk = V.sky; const skyU = { uTop: { value: new THREE.Color(sk.top) }, uMid: { value: new THREE.Color(sk.mid) }, uHor: { value: new THREE.Color(sk.hor) }, uLow: { value: new THREE.Color(sk.low) }, uT: { value: 0 } };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(800, 32, 16)), keep(new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false })));
  sky.renderOrder = -100; sky.frustumCulled = false; grp.add(sky);
  const su = V.sun; const sunU = { uC0: { value: new THREE.Color(su.col0) }, uC1: { value: new THREE.Color(su.col1) }, uC2: { value: new THREE.Color(su.col2) }, uT: { value: 0 }, uMotion: { value: RM ? 0 : 1 } };
  const sun = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.ShaderMaterial({ uniforms: sunU, vertexShader: PLAIN_VERT, fragmentShader: SUN_FRAG, transparent: true, depthWrite: false, fog: false })));
  sun.renderOrder = -90; sun.frustumCulled = false; grp.add(sun);
  const rim = new THREE.DirectionalLight(V.rim.col, V.rim.i); grp.add(rim, rim.target);
  const fill = new THREE.DirectionalLight(V.fill.col, V.fill.i); grp.add(fill, fill.target);
  const hemi = new THREE.HemisphereLight(V.hemi.sky, V.hemi.ground, V.hemi.i); grp.add(hemi);
  const key = V.key ? new THREE.DirectionalLight(V.key.col, V.key.i) : null; if (key) grp.add(key, key.target);
  /* a third colour: a teal rim on the hero from behind and to the left, against the orange sun rim on the right */
  const faceL = new THREE.PointLight(0xffc49a, CHEAP ? 0 : 12, 4.5, 2); grp.add(faceL);
  const teal = V.teal ? new THREE.DirectionalLight(V.teal.col, V.teal.i) : null; if (teal) grp.add(teal, teal.target);
  /* banners either side of the camp */
  const tex = keep(bannerTex(variant === 'cover' ? '#7a0c3a' : '#a3121e', '#ffb02e'));
  const banners = V.banners ? [new Banner(grp, V3(-3.0, 0, -2.6), 2.6, tex, 0), new Banner(grp, V3(3.6, 0, -3.4), 2.9, tex, 1.7)] : [];
  /* 3D embers from the fire */
  const EN = CHEAP ? 70 : 220; const eg = keep(new THREE.BufferGeometry()); const ep = new Float32Array(EN * 3); const ev = []; const fireAt = camp?.fire?.getWorldPosition?.(V3()) || V3(1.2, 0, 1);
  const eSpawn = (i, any) => { ep[i * 3] = fireAt.x + (Math.random() - 0.5) * 0.6; ep[i * 3 + 1] = any ? Math.random() * 6 : 0.4; ep[i * 3 + 2] = fireAt.z + (Math.random() - 0.5) * 0.6; ev[i] = [(Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 0.4, Math.random() * 6.28]; };
  for (let i = 0; i < EN; i++) eSpawn(i, true);
  eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const em = keep(new THREE.PointsMaterial({ color: 0xffa040, size: 0.05, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const ePts = new THREE.Points(eg, em); ePts.frustumCulled = false; grp.add(ePts);
  /* a neon grid on the ground that fades out at the camp and toward the horizon */
  let gridU = null;
  if (V.grid) {
    gridU = { uCol: { value: new THREE.Color(V.grid.col) }, uK: { value: V.grid.k }, uCell: { value: V.grid.cell }, uT: { value: 0 }, uCam: { value: V3() } };
    const gm = keep(new THREE.ShaderMaterial({ uniforms: gridU, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uCol, uCam; uniform float uK, uCell, uT; varying vec3 vW;
        void main(){ vec2 g = vW.xz / uCell + vec2(0.0, uT * 0.25); vec2 fw = max(fwidth(g), vec2(1e-4)); vec2 f = abs(fract(g - 0.5) - 0.5) / fw;
          float line = 1.0 - min(min(f.x, f.y), 1.0); float d = length(vW.xz - uCam.xz); float r = length(vW.xz);
          float fade = smoothstep(3.5, 9.0, r) * (1.0 - smoothstep(40.0, 140.0, d)) * smoothstep(0.0, 0.6, 1.0 / max(fw.x + fw.y, 1e-3) * 0.08);
          float a = fade * uK; gl_FragColor = vec4(mix(vec3(0.05, 0.0, 0.06), uCol * 1.6, line), a * (0.35 + 0.65 * line)); }` }));
    const gp = new THREE.Mesh(keep(new THREE.PlaneGeometry(400, 400)), gm); gp.rotation.x = -Math.PI / 2; gp.position.y = 0.08; gp.renderOrder = 2; grp.add(gp);
  }
  /* the fire burns hotter: a soft glow behind the flames (a sprite: no new light, so nothing recompiles) */
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,220,140,1)'); r.addColorStop(0.3, 'rgba(255,120,40,.55)'); r.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(c)); })();
  const fireGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
  fireGlow.position.copy(fireAt).setY(0.7); fireGlow.scale.setScalar(variant === 'cover' ? 1.25 : 2.0); /* a smaller glow, it washed the boss's robe warm */ grp.add(fireGlow);
  /* a white-hot core low in the flames */
  const coreTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 40, 0, 32, 40, 30); r.addColorStop(0, 'rgba(255,255,235,1)'); r.addColorStop(0.35, 'rgba(255,236,120,.85)'); r.addColorStop(0.7, 'rgba(255,150,40,.3)'); r.addColorStop(1, 'rgba(255,90,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(c)); })();
  const fireCore = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: coreTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
  fireCore.position.copy(fireAt).setY(0.42); fireCore.scale.set(0.75, 1.05, 1); fireCore.renderOrder = 5; grp.add(fireCore);
  /* the blade flash: a four-point star that runs hilt to tip */
  const starTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 12); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,250,230,.9)'; g.fillRect(2, 31, 60, 2); g.fillRect(31, 2, 2, 60); g.fillStyle = 'rgba(255,250,230,.4)'; g.fillRect(10, 30, 44, 4); g.fillRect(30, 10, 4, 44); return keep(new THREE.CanvasTexture(c)); })();
  const star = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false })));
  star.renderOrder = 70; star.visible = false; grp.add(star);
  let blade = null; const bA = V3(); const bB = V3();
  /* the hero's cloak takes the title colour (restored on Start) */
  const heroMats = new Map();
  const dressHero = (hero) => { if (!V.cloak || hero.root.userData.t2dressed) return; hero.root.userData.t2dressed = true;
    hero.root.traverse((o) => { if (!o.isMesh || Array.isArray(o.material) || !o.material?.emissive) return; heroMats.set(o, o.material); const m = keep(o.material.clone());
      if (/^Cloak$/.test(o.name)) { m.color.set(V.cloak); m.emissive.set(V.cloak).multiplyScalar(0.12); }
      /* key-art edge light: hot orange on the sun side of each edge, cold teal on the other (view-space fresnel) */
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { vec3 nv = normalize(normal); float fr = pow(clamp(1.0 - abs(nv.z), 0.0, 1.0), 2.6); totalEmissiveRadiance += fr * mix(vec3(1.0, 0.42, 0.12) * 0.6, vec3(0.1, 0.85, 1.0) * 1.15, smoothstep(0.25, -0.25, nv.x)); }'); };
      m.customProgramCacheKey = () => 't2heroRim'; o.material = m; }); };
  /* the camp fire burns hotter while the title is up */
  const fu = camp?.flameU; const fuOld = fu ? { core: fu.uCore.value.clone(), mid: fu.uMid.value.clone(), edge: fu.uEdge.value.clone(), power: fu.uPower.value } : null;
  if (fu) { fu.uCore.value.set(0xfff6c8); fu.uMid.value.set(0xffb21e); fu.uEdge.value.set(0xff3a0c); fu.uPower.value = 1.6; }
  const oldSkyVis = world.sky?.visible;
  if (world.sky) world.sky.visible = false;

  /* ---- post ---- */
  let pass = null;
  if (!CHEAP && world.composer) {
    const R = world.renderer; const sz = R.getDrawingBufferSize(new THREE.Vector2());
    pass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uRes: { value: sz.clone() }, uT: { value: 0 }, uMotion: { value: RM ? 0 : 1 }, uHero: { value: new THREE.Vector3(0.5, 0.4, 0.0) } }, vertexShader: POST_VERT, fragmentShader: variant === 'cover' ? T5_POST : T1_POST });
    const setSize0 = pass.setSize.bind(pass); pass.setSize = (w, hh) => { setSize0(w, hh); pass.uniforms.uRes.value.set(w, hh); };
    world.composer.addPass(pass);
  }

  /* ---- camera, look and motion: runs after the camp rig (updaters run in order) ---- */
  /* window.__t2cam = { pos, look, fov } overrides the shot (a console override for tuning the look) */
  const upright = () => innerWidth < innerHeight;
  const landPhone = () => innerHeight < 500 && innerWidth > innerHeight;
  const camSpec = () => window.__t2cam || (upright() ? V.phoneCam : (landPhone() && V.landCam) || V.cam);
  let t = 0; let osdT = 0; let lastLogo = -1; let posed = null; let stopped = false; let stoneV = null; let forgeV = null;
  /* the hero holds a sword in a guard stance and cuts a combo every few seconds (so the title is never a still picture) */
  const AR = (upright() && V.phoneArmed) || V.armed; let heldA = null; let beatUp = false; let yaw0 = null; let beatK = 0; let armedHero = null; let arming = false; let swordG = null; let nextSwing = 0; let backAt = 0;
  const arm = () => {
    if (!AR || !S.hero || arming || armedHero === S.hero) return;
    arming = true; const hero = S.hero;
    makeGear('sword').then((g) => { arming = false; if (stopped || S.hero !== hero) return; g.userData.t2 = true; hero.slot('handslotr')?.add(g); swordG = g; armedHero = hero; if (AR.hold) { hero.hold(AR.stance, AR.hold[0], { speed: 0, fade: 0.2 }); heldA = hero.mixer.clipAction(hero.clips.get(AR.stance)); } else hero.play(AR.stance, { fade: 0.2 }); nextSwing = t + 0.9; })
      .catch((err) => { arming = false; armedHero = hero; console.warn('title2 sword', err); });
  };
  const swing = () => {
    if (!AR || armedHero !== S.hero || !swordG) return;
    if (AR.swing && t > nextSwing) { const d = S.hero.play(AR.swing, { loop: false, restart: true, fade: 0.18 }); const cut = AR.cut ? Math.min(d, AR.cut) : d - 0.2; backAt = t + Math.max(0.3, cut); nextSwing = t + cut + AR.every; }
    if (backAt && t > backAt) { S.hero.play(AR.stance, { fade: 0.35 }); backAt = 0; }
  };
  /* the giant's eyes: two hot points in the black figure */
  const eyeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, 'rgba(255,70,20,.32)'); r.addColorStop(1, 'rgba(255,30,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    /* a slanted slit: hot white core, yellow edge */ g.save(); g.translate(32, 32); g.rotate(-0.18); g.beginPath(); g.ellipse(0, 0, 16, 3.6, 0, 0, Math.PI * 2); g.fillStyle = '#ffc030'; g.fill(); g.beginPath(); g.ellipse(0, 0, 11, 1.7, 0, 0, Math.PI * 2); g.fillStyle = '#fffbe8'; g.fill(); g.restore(); return keep(new THREE.CanvasTexture(c)); })();
  const eyeMat = keep(new THREE.SpriteMaterial({ map: eyeTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true }));
  const eyes = [new THREE.Sprite(eyeMat), new THREE.Sprite(keep(eyeMat.clone()))]; for (const e of eyes) { e.renderOrder = 60; grp.add(e); }
  window.__t2dbg = { eyes, grp };
  const camPos = V3(); const look = V3(); const fwd = V3(); const right = V3(); const up = V3(0, 1, 0);
  const tick = (dt) => {
    t += dt; const cam = world.camera; const C = camSpec(); const m = RM ? 0 : 1;
    /* a slow drift: a few centimetres of orbit and a push-in over 14 s */
    const ph = t * (Math.PI * 2 / 10);
    camPos.set(C.pos[0] + Math.sin(ph) * 0.5 * m, C.pos[1] + Math.sin(ph * 0.5) * 0.05 * m, C.pos[2] - (0.5 - 0.5 * Math.cos(ph)) * 0.3 * m);
    look.set(C.look[0] + Math.sin(ph * 0.7) * 0.1 * m, C.look[1], C.look[2]);
    /* the intro: the camera starts pulled back and pushes in hard over 1.6 s */
    if (!RM && t < 1.6) { const u = t / 1.6; const e = 1 - (1 - u) * (1 - u) * (1 - u); camPos.lerp(look, -(1 - e) * 0.45); }
    /* a slow eased push-in and back (about 5 % over 6 s), so any 3 s cut moves */
    if (!RM) camPos.lerp(look, 0.05 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 12)));
    cam.clearViewOffset(); cam.position.copy(camPos); cam.lookAt(look);
    if (cam.fov !== C.fov) { cam.fov = C.fov; } cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    /* the hero is on show (the default title hides it until Start) */
    if (AR && camp?.sword) camp.sword.visible = false;
    if (camp?.forge) { if (forgeV === null) forgeV = camp.forge.visible; camp.forge.visible = false; }
    arm(); swing();
    /* key-art stance: the sword-up guard, breathing slowly between two frames of the clip (never the crouch) */
    if (heldA && AR.hold && armedHero === S.hero) { const [h0, h1, hp] = AR.hold;
      /* the beat: every 3.2 s the hero lifts the sword overhead for about 0.9 s (a crossfade to a held frame of the attack wind-up), then settles back into the guard */
      const ph = RM ? 0 : (t - 2.0) % 3.2; const up = !RM && t > 2.0 && ph < 0.9;
      if (up !== beatUp) { beatUp = up; if (up) S.hero.hold(AR.beat[0], AR.beat[1], { speed: 0, fade: 0.28 }); else { S.hero.hold(AR.stance, h0, { speed: 0, fade: 0.4 }); heldA = S.hero.mixer.clipAction(S.hero.clips.get(AR.stance)); } }
      if (!up) heldA.time = h0 + (h1 - h0) * (RM ? 0.5 : 0.5 - 0.5 * Math.cos(t * Math.PI * 2 / hp));
      beatK = up ? Math.min(1, ph / 0.3) : Math.max(0, beatK - dt * 2.5);
      if (AR.yaw) { if (yaw0 === null) yaw0 = S.hero.root.rotation.y; S.hero.root.rotation.y = yaw0 + AR.yaw; } }
    if (S.hero) { dressHero(S.hero); S.hero.root.visible = true; const pose = window.__t2pose || V.pose; if (pose && S.hero.current !== pose && S.hero.clips?.has(pose)) { S.hero.play(pose); posed = S.hero; } }
    /* the sun sits low in the view, a little right of centre, so the hero and the giant stand against it */
    cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, up).normalize();
    const D = 600; const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const su = window.__t2sun || (upright() && V.phoneSun) || V.sun;
    const sunDir = V3().copy(fwd).addScaledVector(right, su.x * tanV * cam.aspect * 2).normalize();
    sun.position.copy(cam.position).addScaledVector(sunDir, D); sun.position.y = cam.position.y + D * (su.y * tanV * 2 + 0.02);
    if (V.sunOnHero && !window.__t2sun && S.hero) { /* the sun stands right behind the hero's shoulders: a backlit silhouette */
      const hp = S.hero.root.getWorldPosition(V3()); hp.y += 1.15; const dh = hp.sub(cam.position).normalize();
      sunDir.copy(dh).setY(0).normalize(); sun.position.copy(cam.position).addScaledVector(dh, D); sun.position.y += D * su.y * tanV * 2; }
    const sizeW = su.size * (V.sunK || 1) * D * tanV * 2; sun.scale.set(sizeW * 1.6, sizeW * 1.6, 1); sun.quaternion.copy(cam.quaternion);
    sky.position.copy(cam.position);
    /* lights: the rim comes from the sun, the cool fill from behind the camera */
    rim.position.copy(sunDir).multiplyScalar(-40).negate().setY(10); rim.target.position.set(0, 1, 0);
    fill.position.copy(cam.position).addScaledVector(right, -6).setY(6); fill.target.position.set(0, 1, 0);
    if (key) { key.position.copy(cam.position).addScaledVector(right, -5).addScaledVector(fwd, 2).setY(2.5); key.target.position.set(0, 1.2, 0); }
    if (camp?.moonU) camp.moonU.uOpacity.value = 0;
    if (world.bloom) world.bloom.threshold = 1.4; /* the sun no longer floods the boss: it stays a black cut-out */
    poseGiant(cam, fwd, right, tanV);
    /* the sun stands behind the colossus' head and shoulders */
    { const NMc = window.__t2nem || (upright() && V.phoneNem) || V.nem; if (NMc.hy !== undefined && !window.__t2sun) { const v = V3(NMc.hx + (NMc.sdx ?? 0), NMc.hy + (NMc.sdy ?? -0.12), 0.5).unproject(cam).sub(cam.position).normalize(); sunDir.copy(v).setY(0).normalize(); sun.position.copy(cam.position).addScaledVector(v, D); } }
    /* edge lights from the sides, a little behind the hero: cold teal on the left edge, hot orange on the right edge */
    if (teal) { teal.position.set(0, 0, 0).addScaledVector(right, -30).addScaledVector(fwd, 9).setY(5); teal.target.position.set(0, 1.2, 0); }
    rim.position.set(0, 0, 0).addScaledVector(right, 26).addScaledVector(fwd, 14).setY(8);
    if (S.hero && faceL.intensity) { S.hero.root.getWorldPosition(faceL.position); faceL.position.addScaledVector(fwd, -1.6).addScaledVector(right, -0.6); faceL.position.y += 2.1; }
    /* the beat flash: the sky kicks when the hero lifts the sword */
    if (flash) { const fp = RM || !beatUp ? 0 : Math.max(0, 1 - ((t - 2.0) % 3.2) / 0.35); flash.style.opacity = (fp * 0.22).toFixed(3); }
    /* the blade star every 2.2 s: 0.45 s from hilt to tip */
    if (swordG && !blade) { swordG.traverse((o) => { if (!blade && o.isMesh && /Blade/.test(o.material?.name || '')) blade = o; });
      if (blade) { blade.geometry.computeBoundingBox(); const bb = blade.geometry.boundingBox; const sz = V3(); bb.getSize(sz); const ax = sz.x > sz.y ? (sz.x > sz.z ? 'x' : 'z') : (sz.y > sz.z ? 'y' : 'z'); const c = V3(); bb.getCenter(c);
        bA.copy(c); bA[ax] = bb.min[ax]; bB.copy(c); bB[ax] = bb.max[ax]; if (bA.length() > bB.length()) { const tt = bA.clone(); bA.copy(bB); bB.copy(tt); } } }
    { const q = RM ? -1 : ((t - 1.0) % 2.2) / 0.45; star.visible = !!blade && t > 1.0 && q >= 0 && q <= 1;
      if (star.visible) { const pa = blade.localToWorld(bA.clone()); const pb = blade.localToWorld(bB.clone()); star.position.lerpVectors(pa, pb, q); const s = 0.5 * Math.sin(q * Math.PI); star.scale.setScalar(s); star.material.rotation = q * 1.2; } }
    if (pass?.uniforms.uHero && S.hero) { const hp = S.hero.root.getWorldPosition(V3()); const a = hp.clone().project(cam); const b2 = hp.clone().setY(hp.y + 1.9).project(cam);
      pass.uniforms.uHero.value.set(a.x * 0.5 + 0.5, (a.y + b2.y) * 0.25 + 0.5, Math.abs(b2.y - a.y) * 0.5 * 0.8); }
    fireCore.material.opacity = RM ? 0.9 : 0.75 + 0.25 * Math.sin(t * 13.7) * Math.sin(t * 4.1);
    fireCore.scale.set(0.75, 1.05 + (RM ? 0 : 0.15 * Math.sin(t * 7.3)), 1);    skyU.uT.value = t; sunU.uT.value = t;
    for (const b of banners) b.update(RM ? 0 : dt);
    for (let i = 0; i < EN; i++) { const v = ev[i]; ep[i * 3] += (v[0] + Math.sin(t * 2 + v[3]) * 0.3) * dt; ep[i * 3 + 1] += v[1] * dt; ep[i * 3 + 2] += v[2] * dt; if (ep[i * 3 + 1] > 7) eSpawn(i, false); }
    eg.attributes.position.needsUpdate = true;
    if (pass) pass.uniforms.uT.value = t;
    if (variant === 'cover' && !RM) logo.cv.classList.toggle('t2-tear', ((t + 3.2) / 4.5) % 1 < 0.067);
    /* the carved stone stays out of the title (its words are the tagline's) */
    if (camp?.stone) { if (stoneV === null) stoneV = camp.stone.visible; camp.stone.visible = false; }
    if (gridU) { gridU.uT.value = RM ? 0 : t; gridU.uCam.value.copy(cam.position); }
    fireGlow.material.opacity = RM ? 0.45 : 0.4 + 0.15 * Math.sin(t * 9.1) * Math.sin(t * 3.3);
    /* 2D layers at ~30 Hz */
    if (t - lastLogo > 1 / 30) { logo.draw(t); embers.update(Math.min(0.1, t - Math.max(0, lastLogo))); lastLogo = t; }
    if (osd) { osdT += dt; const s = Math.floor(osdT); const sp = osd.querySelector('span'); const txt = `SP 0:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; if (sp.textContent !== txt) sp.textContent = txt; }
  };
  /* the giant: a pure black figure standing against the sun (the camp poses it for the reel title; this runs after the camp) */
  const giantMats = new Map(); const SIL = keep(new THREE.MeshLambertMaterial({ color: 0x000000, fog: false }));
  /* the colossus is a black figure with a hot rim where its edges turn away from the camera (view-space fresnel) */
  const rimU = { uRimCol: { value: new THREE.Color(V.giantRim ?? 0xff5a3a) }, uRimK: { value: 2.6 } };
  SIL.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, rimU); sh.fragmentShader = 'uniform vec3 uRimCol; uniform float uRimK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float fr = 1.0 - abs(normalize(normal).z); totalEmissiveRadiance += uRimCol * uRimK * smoothstep(0.93, 1.0, fr) + vec3(0.012, 0.0, 0.02); }'); }; const _b = new THREE.Box3(); const _s = V3();
  /* a hot screen-space outline (inverted hull, back faces pushed out along the view normal) so the crown, horns and arms read against the sun */
  const outU = { uOW: { value: CHEAP ? 0.008 : 0.0065 } }; const hulls = [];
  const OUT = keep(new THREE.MeshLambertMaterial({ color: 0x000000, emissive: new THREE.Color(V.giantLine ?? 0xffa040).multiplyScalar(1.6), side: THREE.BackSide, fog: false }));
  OUT.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, outU); sh.vertexShader = 'uniform float uOW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  { vec3 vn = normalize(normalMatrix * objectNormal); vec4 cn = projectionMatrix * vec4(vn, 0.0); vec2 d = normalize(cn.xy + 1e-5); gl_Position.xy += d * uOW * gl_Position.w; gl_Position.z += 0.004 * gl_Position.w; }'); };
  /* the dragon's wings keep their cut-out shape; its eyes and mouth are the only light */
  const SILD = keep(new THREE.MeshLambertMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide })); /* no rim on the cloth: its back faces drew hot scribbles inside the sleeve */
  const SILW = keep(new THREE.MeshLambertMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide, alphaTest: 0.25 }));
  const DGLOW = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb040).multiplyScalar(2.2), fog: false }));
  const isUnder = (o, g) => { for (let p = o; p; p = p.parent) if (p === g) return true; return false; };
  /* the giant's maul: the group on the actor's root that holds only plain meshes */
  const giantWeapon = (nm) => { const a = nm.actor; if (!a) return null; const w = a.root.children.find((c) => c !== a.model && !c.isBone && c.children.length && c.children.every((m) => m.isMesh && !m.isSkinnedMesh)); if (w && a.has?.('Sword_Attack')) { a.hold('Sword_Attack', 0.24, { speed: 0, fade: 0 }); } if (w) { w.rotation.set(...(V.giantWep || [Math.PI * 0.95, 0, 0.35])); } return w || null; };
  /* the dragon: wings spread across the sun, the neck curved down to the hero, a slow beat and a head sway */
  const dragonRig = (nm) => { const b = nm.boss; nm.tick = (dt, tt) => {
    const X = window.__t2dr || {}; b.yaw = X.yaw ?? V.drYaw ?? 0; b.J.x = 0; b.J.z = 0; b.clock += dt; const g = b.tgt; g.roll = 0;
    const beat = RM ? 0.15 : 0.5 + 0.5 * Math.sin(tt * (V.drBeat ?? 1.1)); b.flightPose(g, (X.amp ?? 0.12) + (X.ampB ?? 0.35) * beat, X.freq ?? V.drFreq ?? 0.35); g.pitch = X.pitch ?? V.drPitch ?? -0.05; g.height = X.h ?? g.height; if (X.wOpen != null) g.wOpen = X.wOpen; if ((X.bias ?? V.drBias) != null) g.flapBias = X.bias ?? V.drBias; if (X.sweep != null) g.sweep = X.sweep;
    const hd = X.head || V.drHead || [-1.4, -1.2, 2.6]; const sw = RM ? 0 : Math.sin(tt * 0.6) * 0.35;
    g.head.copy(b.NB).add(V3(hd[0] + sw, hd[1] + (RM ? 0 : Math.sin(tt * 0.9) * 0.15), hd[2]));
    { const lk = X.look || V.drLook || [-4, -4.5, 5]; g.look.copy(g.head).add(V3(lk[0], lk[1], lk[2])); } g.jaw = 0.22 + (RM ? 0 : 0.08 * Math.sin(tt * 1.3)) + 0.25 * beatK; g.eyes = 2; g.throat = 0.4;
    b.animate(Math.min(dt, 1 / 20)); }; };
  const poseGiant = (cam, f, r, tanV) => {
    const NM = window.__t2nem || (upright() && V.phoneNem) || V.nem; /* __t2nem: console override for tuning the look */
    const nm = world.nemesis; const H = nm?.holder; if (!H || nm.leaving) return;
    if (!nm._t2) { const P = nm.posed; if (P?.unit) nm._t2 = { unit: P.bodyH || P.unit, top: P.bodyTop ?? P.unit }; else { const sc = H.scale.y || 1; _b.setFromObject(H); _b.getSize(_s); nm._t2 = { unit: Math.max(0.5, _s.y / sc), top: _s.y / sc }; } }
    if (!nm._t2.dark) { nm._t2.dark = true; const DR = nm.boss || null; const WG = BOSS === 'giant' ? giantWeapon(nm) : null; if (DR) dragonRig(nm); H.traverse((o) => {
      if (DR && o.isMesh) { if (!o.visible) return; if (/Eye|Mouth/.test(o.name) || o.material === DR.mats?.eye || o.material?.isMeshBasicMaterial && !o.material.alphaMap) { giantMats.set(o, o.material); o.material = DGLOW; return; } }
      const rigidKeep = DR || (WG && isUnder(o, WG));
      if (o.isMesh && !o.isSkinnedMesh && !o.material?.isShaderMaterial && !rigidKeep) { giantMats.set(o, null); o.visible = false; return; }
      if (o.isMesh && o.material?.alphaMap) { giantMats.set(o, o.material); SILW.alphaMap = o.material.alphaMap; o.material = SILW; return; } /* loose props (staff, hook, ring) muddy the silhouette and read as stray lines */ if (o.isMesh || o.isSkinnedMesh) { if (o.material?.isShaderMaterial) return; giantMats.set(o, o.material); o.material = o.material?.side === THREE.DoubleSide ? SILD : SIL; /* thin cloth keeps both faces: else the sun shows through the robe */ if (o.parent && !DR && BOSS !== 'giant' && giantMats.get(o)?.side !== THREE.DoubleSide && (o.isSkinnedMesh || rigidKeep) && (o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).getSize(V3()).toArray().every((n) => n > 0.08)) { const h = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, OUT) : new THREE.Mesh(o.geometry, OUT); if (o.isSkinnedMesh) h.bind(o.skeleton, o.bindMatrix); h.position.copy(o.position); h.quaternion.copy(o.quaternion); h.scale.copy(o.scale); h.frustumCulled = false; h.renderOrder = -1; hulls.push([o, h]); } } else if (o.isSprite || o.isPoints) { giantMats.set(o, null); o.visible = false; } }); for (const [o, h] of hulls) o.parent.add(h); }
    for (const [o, h] of hulls) h.visible = o.visible;
    { const LP = window.__t2lp || (BOSS === 'lich' && V.lichPose); if (LP && nm.actor && nm._t2.lp !== LP) { nm._t2.lp = LP; if (nm.actor.has?.(LP[0])) nm.actor.hold(LP[0], LP[1], { speed: LP[2] ?? 0, fade: 0 }); } }
    const D = 95; const k = (NM.size * 2 * D * tanV) / nm._t2.unit;
    const x = cam.position.x + f.x * D + r.x * NM.x * D * tanV * cam.aspect; const z = cam.position.z + f.z * D + r.z * NM.x * D * tanV * cam.aspect;
    H.scale.setScalar(k); H.position.set(x, cam.position.y + NM.head * D * tanV - nm._t2.top * k, z);
    /* key-art mode: the head bone lands on a screen point (NM.hx, NM.hy in NDC), at distance D */
    if (NM.hy !== undefined) {
      if (nm._t2.hf === undefined) { let hb = nm.boss?.P?.[V.drAnchor || 'chest'] || null; H.traverse((o) => { if (!hb && o.isBone && /^head$/i.test(o.name)) hb = o; }); H.updateMatrixWorld(true); nm._t2.hf = hb ? (hb.getWorldPosition(_s).y - H.position.y) / (nm._t2.top * k) : 0.87; }
      const v = _s.set(NM.hx, NM.hy, 0.5).unproject(cam).sub(cam.position); const hl = Math.hypot(v.x, v.z); const tt = D / hl;
      H.position.set(cam.position.x + v.x * tt, cam.position.y + v.y * tt - nm._t2.hf * nm._t2.top * k, cam.position.z + v.z * tt);
    }
    H.rotation.set(0, Math.atan2(cam.position.x - H.position.x, cam.position.z - H.position.z) + (RM ? 0 : Math.sin(t * 0.33) * 0.16 + Math.sin(t * 1.3) * 0.05), 0); if (!RM) H.rotateX(0.06 * beatK); /* it leans in when the hero raises the sword */
    if (!RM) { H.position.y += Math.sin(t * 0.8) * 0.006 * nm._t2.top * k; H.scale.setScalar(k * (1 + 0.02 * Math.sin(t * Math.PI * 2 / 3))); }
    if (camp?.nemGlow) camp.nemGlow.visible = false;
    { const hh = nm._t2.top * k; const ew = hh * (NM.eyeW ?? 0.018); const flick = RM ? 1 : 0.85 + 0.12 * Math.sin(t * 5.3) * Math.sin(t * 1.7) + 0.35 * Math.pow(Math.max(0, Math.sin(t * Math.PI)), 12) + 0.9 * Math.pow(Math.max(0, Math.sin(t * Math.PI / 3)), 40) + 1.1 * beatK;
      if (nm._t2.head === undefined) { nm._t2.head = nm.boss?.P?.head || null; H.traverse((o) => { if (!nm._t2.head && o.isBone && /^head$/i.test(o.name)) nm._t2.head = o; }); }
      const hb = nm._t2.head; let ex = x; let ey = H.position.y + hh * (NM.eyeY ?? 0.86); let ez = z;
      if (hb) { H.updateMatrixWorld(true); const hp = hb.getWorldPosition(_s); ex = hp.x - f.x * hh * 0.05; ey = hp.y + hh * (NM.eyeUp ?? 0.0); ez = hp.z - f.z * hh * 0.05; }
      eyes.forEach((e, i) => { e.position.set(ex + r.x * ew * (i ? 1 : -1), ey, ez + r.z * ew * (i ? 1 : -1)); e.scale.setScalar(hh * (NM.eyeS ?? 0.05) * flick); e.material.rotation = i ? 0.36 : 0; }); }
  };
  const off = world.addUpdater(tick);
  /* the words show with the logo already drawn: the first painted frame of the title has the logo (the slam plays on top) */
  Promise.race([logoReady, new Promise((r) => setTimeout(r, 2500))]).then(() => { if (stopped) return; try { logo.draw(0); } catch { /* not loaded */ } document.documentElement.classList.add('t2ready'); });

  return {
    variant,
    stop() {
      off(); removeEventListener('resize', layout);
      stopped = true; if (swordG) swordG.removeFromParent(); if (stoneV !== null && camp?.stone) camp.stone.visible = stoneV; if (forgeV !== null && camp?.forge) camp.forge.visible = false; /* the forge's default; it shows only while a weapon is made */
      if ((posed && posed === S.hero) || (armedHero && armedHero === S.hero)) S.hero.play(S.heroBare ? 'Unarmed_Idle' : 'Idle');
      if (pass) { const i = world.composer.passes.indexOf(pass); if (i >= 0) world.composer.passes.splice(i, 1); pass.dispose?.(); }
      grp.removeFromParent(); for (const b of banners) { b.geo.dispose(); b.cloth.material.dispose(); }
      for (const x of own) x.dispose?.();
      for (const [o, m] of heroMats) o.material = m; if (yaw0 !== null && S.hero) S.hero.root.rotation.y = yaw0; if (S.hero) delete S.hero.root.userData.t2dressed;
      if (fu && fuOld) { fu.uCore.value.copy(fuOld.core); fu.uMid.value.copy(fuOld.mid); fu.uEdge.value.copy(fuOld.edge); fu.uPower.value = fuOld.power; }
      for (const [, h] of hulls) h.removeFromParent(); for (const [o, m] of giantMats) { if (m) o.material = m; else o.visible = true; } if (world.nemesis) delete world.nemesis._t2;
      if (world.sky) world.sky.visible = oldSkyVis ?? true;
      if (camp?.moonU) camp.moonU.uOpacity.value = 1;
      for (const n of extra) n.remove();
      top.remove(); bot.remove(); for (const [node, parent, next] of moved.reverse()) parent.insertBefore(node, next && next.parentNode === parent ? next : null);
      start.innerHTML = startHTML; start.removeAttribute('aria-label');
      style.remove(); delete document.documentElement.dataset.title; document.documentElement.classList.remove('t2ready');
      world.camera.fov = 50; world.camera.updateProjectionMatrix();
    },
  };
}

/* Sage Quest procedural one-shots. No files: every sound is made here from seeded noise and sines.
   web/src/sfx.js turns each entry into a pool "p:<name>" (PROC[name].n variations, peak-normalised as a set) that its recipes
   layer like a sample pool, through the same master chain. Only plain math here: no WebAudio, so offline tests can call it.
   House rules:
   - every transient has a shaped (raised-cosine) attack of at least 0.3 ms; nothing starts on a hard step;
   - no high-passed white noise: noise is band-passed at low Q (centres at or below about 3.2 kHz) and low-passed,
     and every sound ends in a gentle low-pass (about 7-9 kHz) and a short fade;
   - loudness is set by the trims in sfx.js (VOL), measured offline. The raw level here does not matter.
   PROC[name] = { n: variations, gen(r, v) -> Float32Array (mono) or [L, R] }   r = seeded random 0..1, v = variation index */

export const PROC_SR = 48000;
const SR = PROC_SR;
const TAU = Math.PI * 2;
const Z = (s) => new Float32Array(Math.ceil(s * SR));

/* ---------------------------------------------------------------- the kit */
/* RBJ biquad (lp | hp | bp), one stage; h.set(f) moves the corner and keeps the state */
function bq(kind, f, q) {
  let c = null; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (ff) => {
    const w = TAU * Math.min(Math.max(ff, 10), SR * 0.45) / SR; const cs = Math.cos(w); const al = Math.sin(w) / (2 * q); let b0, b1, b2;
    if (kind === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (kind === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al; c = [b0 / a0, b1 / a0, b2 / a0, (-2 * cs) / a0, (1 - al) / a0];
  };
  set(f);
  const h = (x) => { const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  h.set = set; return h;
}
function filt(d, kind, f, q = 0.707, passes = 1) { for (let p = 0; p < passes; p++) { const h = bq(kind, f, q); for (let i = 0; i < d.length; i++) d[i] = h(d[i]); } return d; }
/* a band that moves: fAt(t) in Hz, updated every 32 samples */
function sweep(d, kind, fAt, q = 0.707) { const h = bq(kind, fAt(0), q); for (let i = 0; i < d.length; i++) { if ((i & 31) === 0) h.set(fAt(i / SR)); d[i] = h(d[i]); } return d; }
function rms(d, n = d.length) { let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i]; return Math.sqrt(e / Math.max(1, n)) || 1; }
function peakOf(d) { let p = 0; for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); return p || 1; }
/* raised-cosine attack, optional hold, exponential decay */
function env(t, atk, hold, tau) { if (t < 0) return 0; if (t < atk) return 0.5 - 0.5 * Math.cos(Math.PI * t / atk); if (t < atk + hold) return 1; return Math.exp(-(t - atk - hold) / tau); }
function noise(n, r) { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1; return d; }
const span = (out, t0, len) => { const s0 = Math.max(0, Math.floor(t0 * SR)); return [s0, Math.max(0, Math.min(out.length - s0, Math.ceil(len * SR)))]; };

/* a shaped noise burst. g ~ the level; bp = band centre (low Q), lp = low-pass corner (2 stages) */
function burst(out, r, { t0 = 0, g = 1, atk = 0.001, hold = 0, tau = 0.02, lp = 0, bp = 0, q = 0.7, am = null }) {
  const [s0, L] = span(out, t0, atk + hold + tau * 7 + 0.003); if (!L) return;
  const d = noise(L + 256, r); if (bp) filt(d, 'bp', bp, q); if (lp) filt(d, 'lp', lp, 0.707, 2);
  const k = g * 0.3 / rms(d);
  for (let i = 0; i < L; i++) { const t = i / SR; out[s0 + i] += d[i + 256] * k * env(t, atk, hold, tau) * (am ? am(t) : 1); }
}
/* a swept noise band: the core of every whoosh. fAt(t) = centre (Hz), envelope atk / hold / tau */
function whoosh(out, r, { t0 = 0, g = 1, atk = 0.03, hold = 0, tau = 0.1, fAt, q = 1.2, lp = 4000, am = null }) {
  const [s0, L] = span(out, t0, atk + hold + tau * 7 + 0.003); if (!L) return;
  const d = noise(L, r); sweep(d, 'bp', fAt, q); filt(d, 'lp', lp, 0.707, 2);
  const k = g * 0.3 / rms(d, Math.min(L, Math.ceil((atk + hold + tau) * SR)));
  for (let i = 0; i < L; i++) { const t = i / SR; out[s0 + i] += d[i] * k * env(t, atk, hold, tau) * (am ? am(t) : 1); }
}
/* brown-ish rumble: integrated noise, low-passed */
function rumble(out, r, { t0 = 0, g = 1, atk = 0.01, hold = 0, tau = 0.4, lp = 250, am = null }) {
  const [s0, L] = span(out, t0, atk + hold + tau * 7 + 0.003); if (!L) return;
  const d = new Float32Array(L); let b = 0; for (let i = 0; i < L; i++) { b = b * 0.996 + (r() * 2 - 1) * 0.06; d[i] = b; }
  filt(d, 'lp', lp, 0.707, 2); filt(d, 'hp', 28, 0.707);
  const k = g * 0.3 / rms(d);
  for (let i = 0; i < L; i++) { const t = i / SR; out[s0 + i] += d[i] * k * env(t, atk, hold, tau) * (am ? am(t) : 1); }
}
/* a gliding tone: f(t) = f1 + (f0 - f1) e^(-t / glide); h = harmonic gains [1st, 2nd, ...]; vib = depth (ratio) */
function tone(out, { t0 = 0, f0, f1 = f0, glide = 0.05, atk = 0.002, hold = 0, tau = 0.1, g = 1, h = null, vib = 0, vibHz = 5, ph = 0, fAt = null, am = null }) {
  const [s0, L] = span(out, t0, atk + hold + tau * 7 + 0.003); if (!L) return; let p = ph;
  for (let i = 0; i < L; i++) {
    const t = i / SR; let f = fAt ? fAt(t) : f1 + (f0 - f1) * Math.exp(-t / glide); if (vib) f *= 1 + vib * Math.sin(TAU * vibHz * t);
    p += TAU * f / SR; let s;
    if (h) { s = 0; for (let k = 0; k < h.length; k++) if ((k + 1) * f < SR * 0.45) s += h[k] * Math.sin((k + 1) * p); } else s = Math.sin(p);
    out[s0 + i] += s * g * env(t, atk, hold, tau) * (am ? am(t) : 1);
  }
}
/* damped resonances [[Hz, decay s, gain], ...] struck at t0: knocks, clicks, bells, glass */
function modes(out, r, t0, list, atk = 0.0006, g = 1) {
  for (const [f, tau, gm] of list) {
    if (f >= SR * 0.45) continue; const [s0, L] = span(out, t0, atk + tau * 7); const ph = r() * TAU; const w = TAU * f / SR;
    for (let i = 0; i < L; i++) out[s0 + i] += Math.sin(ph + w * i) * gm * g * env(i / SR, atk, 0, tau);
  }
}
/* a bell or a struck bar: base Hz and partial ratios with their decays and gains */
function bell(out, r, t0, base, parts, g = 1, atk = 0.0015) { modes(out, r, t0, parts.map(([m, tau, gm]) => [base * m, tau, gm]), atk, g); }
/* sparse pings (glass, crackle, sparks): count pings in [t0, t0 + win], spread by pow (>1 = most early), Hz log-uniform in [fLo, fHi] */
function pings(out, r, { t0 = 0, win = 0.3, count = 20, pow = 1, fLo = 2000, fHi = 5000, tLo = 0.004, tHi = 0.02, g = 0.1, fall = 0.6, dens = null }) {
  for (let j = 0; j < count; j++) {
    let u = Math.pow(r(), pow); if (dens) { let tries = 0; while (r() > dens(u) && tries++ < 20) u = Math.pow(r(), pow); }
    const f = fLo * Math.pow(fHi / fLo, r()); const tau = tLo + (tHi - tLo) * r(); const a = g * (0.3 + 0.7 * r()) * Math.exp(-u / Math.max(0.05, fall));
    modes(out, r, t0 + u * win, [[f, tau, a]], 0.0004);
  }
}
/* sparse soft noise grains (sand, sizzle, spits, dirt), band-limited as a whole */
function grains(out, r, { t0 = 0, win = 0.3, count = 20, pow = 1, fc = 1800, q = 0.9, lp = 4000, g = 0.3, lenLo = 0.001, lenHi = 0.004, fall = 0.6, dens = null }) {
  const [s0, L] = span(out, t0, win + lenHi + 0.01); if (!L) return; const d = new Float32Array(L);
  for (let j = 0; j < count; j++) {
    let u = Math.pow(r(), pow); if (dens) { let tries = 0; while (r() > dens(u) && tries++ < 20) u = Math.pow(r(), pow); }
    const n = Math.ceil((lenLo + (lenHi - lenLo) * r()) * SR); const a = (0.3 + 0.7 * r()) * Math.exp(-u / Math.max(0.05, fall)); const st = Math.floor(u * win * SR);
    for (let i = 0; i < n && st + i < L; i++) d[st + i] += (r() * 2 - 1) * a * Math.sin(Math.PI * i / n);
  }
  filt(d, 'bp', fc, q); filt(d, 'lp', lp, 0.707, 2); const k = g / peakOf(d);
  for (let i = 0; i < L; i++) out[s0 + i] += d[i] * k;
}
/* stick-slip creak (wood under load, a bow drawn, a root bending): a pulse train whose rate moves r0 -> r1 Hz, each pulse rings the modes */
function creak(out, r, { t0 = 0, dur = 0.4, r0 = 20, r1 = 40, g = 0.3, list, jit = 0.35, swell = null }) {
  let t = 0; while (t < dur) { const k = t / dur; const a = g * (0.45 + 0.55 * r()) * (swell ? swell(k) : 1); modes(out, r, t0 + t, list.map(([f, tau, gm]) => [f * (1 + (r() - 0.5) * 0.04), tau, gm * a]), 0.0005); t += (1 / (r0 + (r1 - r0) * k)) * (1 + (r() * 2 - 1) * jit); }
}
/* soft saturation: normalise, then tanh; k = drive (1 = gentle) */
function sat(d, k = 1.5) { const p = peakOf(d); const n = Math.tanh(k); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(k * d[i] / p) / n * p; return d; }
/* discrete echoes, each one darker: [[delay s, gain, low-pass Hz], ...] taken from the first `src` seconds */
function echoes(d, list, src = 0.25) {
  const n = Math.min(d.length, Math.ceil(src * SR)); let e = d.slice(0, n);
  for (const [dl, g, lp] of list) { e = filt(Float32Array.from(e), 'lp', lp, 0.707, 2); const s0 = Math.floor(dl * SR); for (let i = 0; i < n && s0 + i < d.length; i++) d[s0 + i] += e[i] * g; }
  return d;
}
/* the end of every sound: a gentle low-pass, no DC, a fade at the tail */
function finish(d, lp = 8500, fade = 0.03) {
  filt(d, 'lp', lp, 0.707, 2); filt(d, 'hp', 30, 0.707);
  const f = Math.min(d.length, Math.ceil(fade * SR)); for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
  return d;
}
/* smoothed random modulation 0..1 at about `hz` changes per second (flicker, sputter, gusts) */
function wobble(r, dur, hz, depth) {
  const n = Math.ceil(dur * hz) + 3; const pts = Array.from({ length: n }, () => r());
  return (t) => { const x = t * hz; const i = Math.floor(x); const k = x - i; const a = pts[Math.min(n - 1, i)], b = pts[Math.min(n - 1, i + 1)]; const s = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * k)); return 1 - depth + depth * s; };
}
const J = (r) => (k) => 1 + (r() * 2 - 1) * k;

/* ---------------------------------------------------------------- shared parts */
/* a small metal click: a softened tick and a few damped modes (hammer, gate, cylinder) */
function click(out, r, t0, f, g = 1, tau = 0.004, bright = 1) {
  burst(out, r, { t0, g: 0.35 * g, atk: 0.0004, tau: 0.0012, lp: 4500 * bright, bp: 2600 * bright, q: 0.8 });
  modes(out, r, t0, [[f, tau, 0.5 * g], [f * 1.71, tau * 0.7, 0.32 * g], [f * 2.63, tau * 0.45, 0.16 * g]], 0.0004);
}
/* a muzzle blast: the crack, the mid blast and a low body that falls in pitch */
/* The low body is saturated on its own (weight that reads on small speakers); the crack and the mid blast go on top unsaturated,
   so the transient stays shaped and is not squared off. */
function blast(out, r, j, { crack = 2400, crackG = 2.4, mid = 4500, midG = 1.4, midTau = 0.012, body = 100, bodyEnd = 46, bodyTau = 0.09, bodyG = 1.1, lowTau = 0.07, drive = 1.4 }) {
  const b = new Float32Array(out.length);
  tone(b, { f0: body * j(0.08), f1: bodyEnd, glide: 0.035, atk: 0.0012, tau: bodyTau * j(0.15), g: bodyG, h: [1, 0.25, 0.08] });
  burst(b, r, { t0: 0.001, g: 0.7, atk: 0.002, tau: lowTau * j(0.2), lp: 320 });
  sat(b, drive); for (let i = 0; i < out.length; i++) out[i] += b[i];
  burst(out, r, { g: crackG, atk: 0.0004, tau: 0.0032 * j(0.2), bp: crack * j(0.1), q: 0.7, lp: 7000 });
  burst(out, r, { t0: 0.0003, g: midG, atk: 0.0007, tau: midTau * j(0.2), lp: mid, bp: 1400, q: 0.5 });
}
/* open desert: slap-back off far rock, each echo darker, and a soft low roll */
function desert(d, r, j, base = 0.12, n = 4, g0 = 0.3, roll = 0.45, rollG = 0.11) {
  const list = []; let t = base * j(0.15); let g = g0;
  for (let i = 0; i < n; i++) { list.push([t, g * j(0.2), 1700 - i * 250]); t += base * (1.1 + 0.5 * r()) * (1 + i * 0.3); g *= 0.6; }
  echoes(d, list, 0.2);
  rumble(d, r, { t0: 0.01, g: rollG, atk: 0.04, tau: roll * j(0.15), lp: 420 });
}

/* ---------------------------------------------------------------- the sounds */
export const PROC = {
  /* ===== guns ===== */
  /* revolver: a sharp crack over a low body, a short canyon slap-back */
  gunshot: { n: 4, gen(r) { const j = J(r); const d = Z(1.6); blast(d, r, j, {}); desert(d, r, j, 0.12, 4, 0.3, 0.45, 0.1); return finish(d, 8000, 0.15); } },
  /* lever rifle: deeper, heavier, a longer roll */
  rifleShot: { n: 4, gen(r) { const j = J(r); const d = Z(2.2); blast(d, r, j, { crack: 2100, crackG: 2.6, mid: 3800, midG: 1.6, midTau: 0.02, body: 88, bodyEnd: 38, bodyTau: 0.14, bodyG: 1.35, lowTau: 0.1, drive: 1.5 }); desert(d, r, j, 0.16, 5, 0.34, 0.75, 0.14); return finish(d, 7500, 0.2); } },
  /* the hammer drawn back: a light tick, then the ratchet catches */
  gunCock: { n: 3, gen(r) { const j = J(r); const d = Z(0.16); click(d, r, 0.002, 2300 * j(0.05), 0.6, 0.004); click(d, r, 0.042 * j(0.1), 1500 * j(0.05), 1, 0.006); tone(d, { t0: 0.042, f0: 420, tau: 0.006, g: 0.15 }); return finish(d, 8000, 0.03); } },
  /* the rifle lever: down (slide, clack), up (slide, a heavier clack) */
  leverCycle: { n: 3, gen(r) {
    const j = J(r); const d = Z(0.4);
    whoosh(d, r, { t0: 0, g: 0.18, atk: 0.012, hold: 0.03, tau: 0.012, fAt: (t) => 1400 + 9000 * t, q: 2, lp: 4000 });
    click(d, r, 0.065 * j(0.05), 900 * j(0.05), 0.9, 0.01, 0.8); tone(d, { t0: 0.065, f0: 190, tau: 0.018, g: 0.25 });
    whoosh(d, r, { t0: 0.12, g: 0.16, atk: 0.012, hold: 0.04, tau: 0.012, fAt: (t) => 2200 - 9000 * t, q: 2, lp: 4000 });
    click(d, r, 0.205 * j(0.05), 760 * j(0.05), 1.1, 0.012, 0.75); tone(d, { t0: 0.205, f0: 150, tau: 0.022, g: 0.4 });
    return finish(d, 7500, 0.03);
  } },
  /* an empty chamber: one small dry click */
  gunDry: { n: 3, gen(r) { const j = J(r); const d = Z(0.1); click(d, r, 0.002, 1900 * j(0.06), 0.8, 0.003); tone(d, { t0: 0.002, f0: 620, tau: 0.004, g: 0.12 }); return finish(d, 7500, 0.02); } },
  /* the loading gate swung open, the cylinder clicks round */
  gunOpen: { n: 2, gen(r) { const j = J(r); const d = Z(0.26); click(d, r, 0.002, 1700 * j(0.05), 0.9, 0.006); for (let i = 0; i < 5; i++) click(d, r, 0.045 + i * 0.024 * j(0.1), 2900 * j(0.04), 0.35 * Math.pow(0.8, i), 0.002, 1.1); return finish(d, 8000, 0.03); } },
  /* one round into the gate: a short brass slide and a seated tick */
  gunLoad: { n: 3, gen(r) { const j = J(r); const d = Z(0.14); whoosh(d, r, { t0: 0, g: 0.14, atk: 0.004, tau: 0.01, fAt: () => 2600 * j(0.1), q: 1.5, lp: 5000 }); click(d, r, 0.026 * j(0.1), 2200 * j(0.06), 0.8, 0.004, 0.85); tone(d, { t0: 0.027, f0: 3100 * j(0.05), tau: 0.02, g: 0.015 }); tone(d, { t0: 0.026, f0: 480, tau: 0.007, g: 0.25 }); return finish(d, 8000, 0.02); } },
  /* the gate shut: a firm clack with a little weight */
  gunClose: { n: 2, gen(r) { const j = J(r); const d = Z(0.2); click(d, r, 0.002, 1150 * j(0.05), 1.1, 0.009, 0.8); tone(d, { t0: 0.002, f0: 210, tau: 0.018, g: 0.4 }); click(d, r, 0.03, 3300, 0.2, 0.003, 1.1); return finish(d, 7500, 0.03); } },
  /* neon stun pistol: a charge whine in the tell, an electric snap, a vent of heat */
  stunCharge: { n: 2, gen(r) { const j = J(r); const d = Z(0.17); tone(d, { fAt: (t) => 520 * Math.pow(4.2, Math.min(1, t / 0.14)) * j(0.0), atk: 0.12, hold: 0.0, tau: 0.02, g: 0.4, h: [1, 0.2], am: (t) => 0.8 + 0.2 * Math.sin(TAU * 70 * t) }); return finish(d, 6000, 0.02); } },
  stunShot: { n: 4, gen(r) {
    const j = J(r); const d = Z(0.45);
    burst(d, r, { g: 0.8, atk: 0.0004, tau: 0.004, bp: 3000 * j(0.1), q: 0.8, lp: 7000 });
    let jump = 0; tone(d, { f0: 900 * j(0.1), f1: 210, glide: 0.05, atk: 0.001, tau: 0.07, g: 0.5, h: [1, 0.5, 0.33, 0.2], am: (t) => { if (r() < 0.004) jump = r(); return 0.6 + 0.4 * jump; } });
    grains(d, r, { t0: 0.002, win: 0.16, count: 22, pow: 1.8, fc: 3000, q: 0.8, lp: 6000, g: 0.35, fall: 0.3 });
    tone(d, { f0: 130, f1: 60, glide: 0.03, atk: 0.001, tau: 0.04, g: 0.55 });
    return finish(d, 7000, 0.05);
  } },
  stunVent: { n: 2, gen(r) { const j = J(r); const d = Z(1.85); whoosh(d, r, { t0: 0, g: 0.5, atk: 0.03, hold: 0.25, tau: 0.5, fAt: (t) => 1700 - 500 * Math.min(1, t), q: 0.7, lp: 4200, am: wobble(r, 2, 12, 0.3) }); tone(d, { fAt: (t) => 1800 * Math.pow(0.28, Math.min(1, t / 1.2)), atk: 0.02, tau: 0.6, g: 0.05 }); pings(d, r, { t0: 0.4, win: 1.2, count: 7, fLo: 2400, fHi: 3800, tLo: 0.003, tHi: 0.006, g: 0.08, fall: 2 }); return finish(d, 6000, 0.2); } },
  /* bows: the draw creaks, the string thrums, the arrow hisses past and lands */
  bowDraw: { n: 3, gen(r) { const j = J(r); const d = Z(0.72); creak(d, r, { t0: 0.02, dur: 0.6, r0: 16, r1: 46, g: 0.35, list: [[310 * j(0.08), 0.022, 1], [780 * j(0.08), 0.012, 0.6], [1500 * j(0.08), 0.007, 0.3]], swell: (k) => 0.4 + 0.6 * k }); whoosh(d, r, { t0: 0, g: 0.07, atk: 0.3, hold: 0.25, tau: 0.05, fAt: () => 600, q: 0.8, lp: 1400 }); return finish(d, 6500, 0.05); } },
  bowLoose: { n: 3, gen(r) {
    const j = J(r); const d = Z(0.6); const f = 140 * j(0.06);
    tone(d, { f0: f * 1.03, f1: f, glide: 0.02, atk: 0.0015, tau: 0.13, g: 0.5, h: [1, 0.6, 0.4, 0.25, 0.12, 0.06] });
    tone(d, { f0: 80, f1: 64, glide: 0.04, atk: 0.002, tau: 0.04, g: 0.3 });
    burst(d, r, { g: 0.7, atk: 0.0006, tau: 0.01, bp: 1300, q: 0.6, lp: 4000 }); burst(d, r, { t0: 0.002, g: 0.45, atk: 0.0005, tau: 0.006, bp: 2200, q: 0.8, lp: 5000 });
    whoosh(d, r, { t0: 0.005, g: 0.25, atk: 0.01, tau: 0.06, fAt: (t) => 1800 - 3000 * Math.min(t, 0.2), q: 1.2, lp: 4500 });
    return finish(d, 6500, 0.08);
  } },
  arrowFlight: { n: 3, gen(r) { const j = J(r); const d = Z(0.5); const f0 = 1500 * j(0.1); whoosh(d, r, { t0: 0, g: 0.5, atk: 0.03, tau: 0.16, fAt: (t) => f0 * Math.pow(0.5, Math.min(1, t / 0.4)), q: 1.2, lp: 4000, am: (t) => 1 + 0.25 * Math.sin(TAU * 32 * t) }); return finish(d, 5000, 0.06); } },
  /* into a body: a dull thunk and the shaft's quiver */
  arrowHit: { n: 4, gen(r) { const j = J(r); const d = Z(0.32); tone(d, { f0: 180 * j(0.1), f1: 90, glide: 0.02, atk: 0.001, tau: 0.03, g: 0.9 }); burst(d, r, { g: 0.7, atk: 0.001, tau: 0.025, lp: 900 }); burst(d, r, { g: 0.6, atk: 0.0006, tau: 0.007, bp: 1300, q: 0.7, lp: 3500 }); burst(d, r, { t0: 0.002, g: 0.2, atk: 0.002, tau: 0.02, bp: 700, q: 1.5, lp: 2000 }); tone(d, { t0: 0.004, f0: 260 * j(0.1), tau: 0.08, g: 0.1, am: (t) => 0.6 + 0.4 * Math.sin(TAU * 28 * t) }); return finish(d, 6000, 0.04); } },
  /* into wood or hard ground: a hollow thock and a long shaft wobble */
  arrowWood: { n: 3, gen(r) { const j = J(r); const d = Z(0.55); modes(d, r, 0.001, [[520 * j(0.08), 0.03, 0.6], [1250 * j(0.08), 0.018, 0.35], [2300 * j(0.08), 0.008, 0.15]]); burst(d, r, { g: 0.45, atk: 0.0005, tau: 0.004, lp: 2500 }); tone(d, { f0: 160, tau: 0.02, g: 0.4 }); tone(d, { t0: 0.005, f0: 210 * j(0.1), tau: 0.22, g: 0.18, am: (t) => 0.5 + 0.5 * Math.sin(TAU * 24 * t) }); return finish(d, 7000, 0.05); } },
  /* off armour: a glancing ring and a small skitter */
  arrowArmor: { n: 3, gen(r) { const j = J(r); const d = Z(0.6); const f = 1800 * j(0.08); modes(d, r, 0.001, [[f, 0.12, 0.4], [f * 1.64, 0.09, 0.28], [f * 2.45, 0.06, 0.18], [f * 3.4, 0.03, 0.07]], 0.0005); burst(d, r, { g: 0.5, atk: 0.0004, tau: 0.002, bp: 3000, lp: 7000 }); tone(d, { f0: 240, tau: 0.015, g: 0.3 }); for (let i = 0; i < 3; i++) click(d, r, 0.06 + i * 0.05 * j(0.3), 2600 * j(0.1), 0.18 / (i + 1), 0.003); return finish(d, 8000, 0.05); } },
  /* the pistol-whip: a gun frame on bone, blunt with a dull metal knock */
  pistolWhip: { n: 3, gen(r) { const j = J(r); const d = Z(0.36); tone(d, { f0: 135 * j(0.08), f1: 80, glide: 0.03, atk: 0.0012, tau: 0.045, g: 1 }); burst(d, r, { g: 0.7, atk: 0.0008, tau: 0.02, lp: 1200 }); sat(d, 1.5); modes(d, r, 0.001, [[850 * j(0.06), 0.022, 0.6], [1600 * j(0.06), 0.015, 0.4], [2600 * j(0.06), 0.009, 0.2]]); burst(d, r, { g: 0.4, atk: 0.0006, tau: 0.005, bp: 1500, lp: 4000 }); return finish(d, 6500, 0.04); } },

  /* ===== powers: cast, travel or loop, impact ===== */
  /* 1 breath (fire): an ignition whump, a pouring roar with flicker and soft crackle, a release */
  pwBreath: { n: 2, gen(r) {
    const j = J(r); const d = Z(1.75);
    burst(d, r, { g: 0.8, atk: 0.02, tau: 0.08, lp: 320 }); tone(d, { f0: 72, f1: 50, glide: 0.08, atk: 0.01, tau: 0.1, g: 0.35 });
    const fl = wobble(r, 2, 11, 0.35);
    rumble(d, r, { t0: 0.02, g: 0.55, atk: 0.12, hold: 1.1, tau: 0.12, lp: 650, am: fl });
    whoosh(d, r, { t0: 0.03, g: 0.5, atk: 0.12, hold: 1.1, tau: 0.12, fAt: (t) => 520 + 160 * Math.sin(TAU * 0.9 * t), q: 0.7, lp: 2400, am: fl });
    grains(d, r, { t0: 0.1, win: 1.3, count: 70, fc: 2200, q: 0.8, lp: 4000, g: 0.18, fall: 3 });
    return finish(d, 6000, 0.15);
  } },
  /* 1 breath (cold wind): a held gust with a faint whistle */
  pwGust: { n: 2, gen(r) {
    const j = J(r); const d = Z(1.75); const gs = wobble(r, 2, 4, 0.4);
    whoosh(d, r, { g: 0.7, atk: 0.12, hold: 1.05, tau: 0.15, fAt: (t) => 380 + 520 * Math.sin(Math.PI * Math.min(1, t / 1.4)), q: 1.3, lp: 3000, am: gs });
    whoosh(d, r, { g: 0.25, atk: 0.15, hold: 1.0, tau: 0.15, fAt: (t) => 1300 + 400 * Math.sin(TAU * 0.7 * t), q: 1.8, lp: 3500, am: gs });
    tone(d, { t0: 0.1, f0: 940 * j(0.05), atk: 0.2, hold: 0.8, tau: 0.15, g: 0.025, vib: 0.02, vibHz: 4.5 });
    rumble(d, r, { g: 0.3, atk: 0.1, hold: 1.1, tau: 0.15, lp: 220 });
    return finish(d, 4000, 0.15);
  } },
  /* breath on a foe: a short soft sizzle (fire) or a rime crackle (cold) */
  pwSizzle: { n: 3, gen(r) { const d = Z(0.36); whoosh(d, r, { g: 0.35, atk: 0.01, tau: 0.1, fAt: () => 1700, q: 0.8, lp: 3400, am: wobble(r, 0.4, 40, 0.6) }); grains(d, r, { win: 0.28, count: 14, fc: 2600, lp: 4200, g: 0.25 }); return finish(d, 4500, 0.04); } },
  pwRime: { n: 3, gen(r) { const d = Z(0.36); pings(d, r, { win: 0.26, count: 18, fLo: 2400, fHi: 4600, tLo: 0.003, tHi: 0.008, g: 0.14, fall: 0.5 }); burst(d, r, { g: 0.25, atk: 0.01, tau: 0.08, lp: 1400 }); return finish(d, 6500, 0.04); } },
  /* 2 chill: a whump, frost spreading in a glassy crackle, a cold ring */
  pwFreeze: { n: 2, gen(r) {
    const j = J(r); const d = Z(1.5);
    burst(d, r, { g: 0.7, atk: 0.01, tau: 0.11, lp: 350 }); tone(d, { f0: 92, f1: 55, glide: 0.06, atk: 0.004, tau: 0.14, g: 0.4 });
    pings(d, r, { t0: 0.01, win: 0.5, count: 110, fLo: 2000, fHi: 5200, tLo: 0.004, tHi: 0.012, g: 0.1, fall: 0.5, dens: (u) => Math.min(1, u * 5) });
    const f = 1760 * j(0.04); bell(d, r, 0.05, f, [[1, 0.6, 0.16], [1.6, 0.45, 0.1], [2.36, 0.3, 0.06]], 1, 0.003);
    return finish(d, 7500, 0.2);
  } },
  /* 2 chill (neon cryo flood): a pressurised gush onto the floor, then the freeze crackle */
  pwCryo: { n: 2, gen(r) {
    const j = J(r); const d = Z(1.5);
    whoosh(d, r, { g: 0.6, atk: 0.03, hold: 0.25, tau: 0.35, fAt: (t) => 1100 - 400 * Math.min(1, t / 0.6), q: 0.6, lp: 3800 });
    burst(d, r, { g: 0.5, atk: 0.008, tau: 0.1, lp: 300 });
    pings(d, r, { t0: 0.15, win: 0.6, count: 70, fLo: 2200, fHi: 4800, tLo: 0.004, tHi: 0.01, g: 0.08, fall: 0.6, dens: (u) => Math.min(1, u * 4) });
    bell(d, r, 0.25, 1480 * j(0.04), [[1, 0.5, 0.08], [2.1, 0.3, 0.04]], 1, 0.004);
    return finish(d, 7000, 0.2);
  } },
  /* 2 chill impact: a frozen foe shattered by a heavy blow */
  pwShatter: { n: 3, gen(r) {
    const d = Z(0.95);
    burst(d, r, { g: 0.7, atk: 0.0008, tau: 0.04, lp: 2500 }); tone(d, { f0: 110, f1: 70, glide: 0.03, atk: 0.001, tau: 0.05, g: 0.6 });
    pings(d, r, { t0: 0.001, win: 0.6, count: 70, pow: 2.2, fLo: 1800, fHi: 6200, tLo: 0.01, tHi: 0.06, g: 0.16, fall: 0.25 });
    pings(d, r, { t0: 0.15, win: 0.6, count: 10, fLo: 2600, fHi: 5200, tLo: 0.02, tHi: 0.08, g: 0.05, fall: 1 });
    return finish(d, 8000, 0.1);
  } },
  /* 3 bolt: a crackle, the crack, a buzzing arc, a low roll */
  pwBolt: { n: 3, gen(r) {
    const j = J(r); const d = Z(1.1);
    grains(d, r, { win: 0.04, count: 6, fc: 2800, lp: 6000, g: 0.25 });
    burst(d, r, { t0: 0.04, g: 1, atk: 0.0004, tau: 0.005, bp: 2800 * j(0.1), q: 0.7, lp: 7000 });
    let jump = 1; tone(d, { t0: 0.04, f0: 110 * j(0.1), atk: 0.002, tau: 0.17, g: 0.35, h: [1, 0.5, 0.33, 0.25, 0.2, 0.16], am: () => { if (r() < 0.003) jump = 0.4 + 0.6 * r(); return jump; } });
    rumble(d, r, { t0: 0.045, g: 0.5, atk: 0.01, tau: 0.32, lp: 260 });
    return finish(d, 6500, 0.12);
  } },
  /* 3 bolt jump: a zap per foe */
  pwChain: { n: 4, gen(r) { const j = J(r); const d = Z(0.36); burst(d, r, { g: 0.8, atk: 0.0004, tau: 0.004, bp: 2600 * j(0.12), lp: 6500 }); let jump = 1; tone(d, { f0: 150 * j(0.15), f1: 110, glide: 0.04, atk: 0.001, tau: 0.06, g: 0.4, h: [1, 0.5, 0.33, 0.25], am: () => { if (r() < 0.004) jump = 0.4 + 0.6 * r(); return jump; } }); tone(d, { f0: 120, f1: 70, atk: 0.001, tau: 0.03, g: 0.4 }); return finish(d, 6500, 0.04); } },
  /* 4 mark (blood): a low brand hiss, a swelling sub, a dark shimmer as it lands */
  pwMark: { n: 2, gen(r) {
    const j = J(r); const d = Z(1.1);
    whoosh(d, r, { g: 0.45, atk: 0.05, tau: 0.32, fAt: (t) => 800 + 400 * Math.exp(-t / 0.2), q: 1.2, lp: 2500 });
    grains(d, r, { t0: 0.18, win: 0.5, count: 26, fc: 2300, lp: 3800, g: 0.16, fall: 0.3 });
    tone(d, { f0: 58, f1: 48, glide: 0.4, atk: 0.07, tau: 0.45, g: 0.5 });
    bell(d, r, 0.2, 740 * j(0.03), [[1, 0.5, 0.08], [1.5, 0.4, 0.06], [2, 0.3, 0.04]], 1, 0.01);
    return finish(d, 6000, 0.15);
  } },
  /* 4 mark (frontier dusk, a duel): a far bell toll over a low wind */
  pwMarkDusk: { n: 2, gen(r) {
    const j = J(r); const d = Z(2.1);
    whoosh(d, r, { g: 0.25, atk: 0.2, hold: 0.3, tau: 0.6, fAt: () => 420, q: 1, lp: 1500 });
    bell(d, r, 0.2, 196 * j(0.02), [[1, 1.6, 0.3], [2.0, 1.2, 0.16], [2.4, 0.9, 0.12], [3.0, 0.7, 0.08], [4.2, 0.4, 0.04]], 1, 0.003);
    burst(d, r, { t0: 0.2, g: 0.15, atk: 0.001, tau: 0.008, lp: 900 });
    return finish(d, 3200, 0.3);
  } },
  /* 4 mark burst: a wet heavy blast */
  pwBurst: { n: 3, gen(r) {
    const j = J(r); const d = Z(1.3);
    tone(d, { f0: 72 * j(0.08), f1: 38, glide: 0.05, atk: 0.0015, tau: 0.13, g: 1.2, h: [1, 0.2] });
    burst(d, r, { g: 0.9, atk: 0.0015, tau: 0.14, lp: 900 });
    whoosh(d, r, { t0: 0.004, g: 0.4, atk: 0.003, tau: 0.07, fAt: (t) => 250 + 13000 * Math.min(t, 0.05), q: 1.5, lp: 2200 });
    rumble(d, r, { t0: 0.01, g: 0.28, atk: 0.02, tau: 0.38, lp: 480 });
    sat(d, 1.8); return finish(d, 6000, 0.15);
  } },
  /* 5 summon (edo fox fire): a soft flame whoosh and three ghostly tones */
  pwSummon: { n: 2, gen(r) {
    const j = J(r); const d = Z(1.7);
    whoosh(d, r, { g: 0.4, atk: 0.2, tau: 0.45, fAt: (t) => 500 + 800 * Math.min(1, t / 0.5), q: 1.2, lp: 3000 });
    [880, 1174.7, 1318.5].forEach((f, i) => tone(d, { t0: i * 0.12, f0: f * j(0.005), atk: 0.03, tau: 0.6, g: 0.09, vib: 0.006, vibHz: 6 }));
    tone(d, { f0: 220, atk: 0.1, tau: 0.7, g: 0.05 });
    return finish(d, 6000, 0.2);
  } },
  /* 5 summon (neon ghost drone): power-on blips, rotor spin-up, a hover hum for its 3.6 s */
  pwDrone: { n: 2, gen(r) {
    const j = J(r); const d = Z(3.9); const T = 3.5;
    tone(d, { f0: 1200, atk: 0.003, tau: 0.03, g: 0.08 }); tone(d, { t0: 0.07, f0: 1600, atk: 0.003, tau: 0.03, g: 0.08 });
    const rate = (t) => 40 + 70 * Math.min(1, t / 0.5) + 3 * Math.sin(TAU * 0.8 * t);
    const fade = (t) => Math.min(1, t / 0.15) * Math.min(1, Math.max(0, (T + 0.3 - t) / 0.3));
    const buzz = new Float32Array(d.length); let ph = 0;
    for (let i = 0; i < d.length; i++) { const t = i / SR; ph += rate(t) / SR; const x = ph - Math.floor(ph); buzz[i] = (x < 0.12 ? Math.sin(Math.PI * x / 0.12) : 0) * fade(t); }
    filt(buzz, 'bp', 900, 0.8); filt(buzz, 'lp', 2500, 0.707, 2); const k = 0.3 / peakOf(buzz); for (let i = 0; i < d.length; i++) d[i] += buzz[i] * k;
    tone(d, { fAt: (t) => 300 + 420 * Math.min(1, t / 0.5) + 6 * Math.sin(TAU * 0.8 * t), atk: 0.15, hold: T - 0.15, tau: 0.12, g: 0.07, h: [1, 0.4] });
    return finish(d, 5000, 0.2);
  } },
  /* 5 a wisp darts at its foe; it bites in a soft flame pop with a small chime */
  pwWisp: { n: 3, gen(r) { const j = J(r); const d = Z(0.42); whoosh(d, r, { g: 0.4, atk: 0.03, tau: 0.11, fAt: (t) => 900 + 3000 * Math.min(t, 0.25), q: 1.5, lp: 3800 }); tone(d, { f0: 1320 * j(0.02), fAt: (t) => 1320 + 1700 * Math.min(t, 0.25), atk: 0.02, tau: 0.13, g: 0.05 }); return finish(d, 5500, 0.05); } },
  pwWispHit: { n: 3, gen(r) { const j = J(r); const d = Z(0.65); burst(d, r, { g: 0.7, atk: 0.004, tau: 0.06, lp: 900 }); tone(d, { f0: 160, f1: 90, glide: 0.03, atk: 0.002, tau: 0.05, g: 0.5 }); tone(d, { t0: 0.01, f0: 1760 * j(0.01), atk: 0.004, tau: 0.3, g: 0.06 }); grains(d, r, { t0: 0.02, win: 0.3, count: 10, fc: 2000, lp: 3500, g: 0.15 }); return finish(d, 6000, 0.08); } },
  /* 5 a drone shot: a suppressed electric snap */
  pwDroneShot: { n: 3, gen(r) { const j = J(r); const d = Z(0.3); burst(d, r, { g: 1.6, atk: 0.0004, tau: 0.003, bp: 3000 * j(0.1), lp: 6500 }); tone(d, { f0: 220, f1: 90, glide: 0.02, atk: 0.001, tau: 0.04, g: 0.3, h: [1, 0.5, 0.3] }); tone(d, { f0: 150, tau: 0.02, g: 0.3 }); return finish(d, 6500, 0.04); } },
  /* 6 ward (edo snow): a struck bell over a soft rising air */
  pwWard: { n: 2, gen(r) {
    const j = J(r); const d = Z(2.3);
    whoosh(d, r, { g: 0.28, atk: 0.15, tau: 0.3, fAt: (t) => 700 + 700 * Math.min(1, t / 0.4), q: 1.2, lp: 3000 });
    burst(d, r, { t0: 0.03, g: 0.3, atk: 0.001, tau: 0.006, lp: 800 });
    bell(d, r, 0.03, 587 * j(0.01), [[1, 2.0, 0.35], [2.0, 1.4, 0.15], [2.76, 1.0, 0.12], [3.9, 0.6, 0.06], [5.4, 0.35, 0.03]], 1, 0.002);
    return finish(d, 7000, 0.3);
  } },
  /* 6 ward (storybook hearth): a warm whoomp, a soft major chord, a little crackle and a chime */
  pwWardHearth: { n: 2, gen(r) {
    const d = Z(2.0);
    burst(d, r, { g: 0.6, atk: 0.03, tau: 0.2, lp: 400 });
    for (const f of [262, 330, 392]) for (const dt of [-1.4, 1.4]) tone(d, { f0: f + dt, atk: 0.25, tau: 0.9, g: 0.05, ph: r() * TAU });
    grains(d, r, { t0: 0.05, win: 1.2, count: 22, fc: 2000, lp: 3500, g: 0.12, fall: 2 });
    tone(d, { t0: 0.05, f0: 1046.5, atk: 0.003, tau: 0.8, g: 0.06 });
    return finish(d, 6500, 0.3);
  } },
  /* 6 the ward throws a blow back: a bright bell strike, a crack and an outward rush */
  pwReflect: { n: 3, gen(r) {
    const j = J(r); const d = Z(1.3);
    burst(d, r, { g: 0.7, atk: 0.0004, tau: 0.003, bp: 3000, lp: 7000 }); tone(d, { f0: 120, f1: 80, atk: 0.001, tau: 0.05, g: 0.7 });
    bell(d, r, 0.0, 784 * j(0.02), [[1, 1.0, 0.4], [2.0, 0.7, 0.18], [2.76, 0.45, 0.14], [3.9, 0.25, 0.06]], 1, 0.0008);
    whoosh(d, r, { t0: 0.005, g: 0.3, atk: 0.005, tau: 0.15, fAt: (t) => 1500 * Math.pow(0.4, Math.min(1, t / 0.3)), q: 1, lp: 3500 });
    return finish(d, 8000, 0.2);
  } },
  /* 7 rain (lightning): the warning, static rising over a low swell; the strike, a thunder crack and roll */
  pwRainWarn: { n: 2, gen(r) {
    const d = Z(0.95);
    grains(d, r, { win: 0.75, count: 50, fc: 3000, q: 0.8, lp: 5500, g: 0.2, fall: 5, dens: (u) => u * u });
    rumble(d, r, { g: 0.5, atk: 0.7, tau: 0.06, lp: 180 });
    tone(d, { fAt: (t) => 60 + 60 * Math.min(1, t / 0.75), atk: 0.6, hold: 0.1, tau: 0.05, g: 0.12, h: [1, 0.5, 0.3] });
    return finish(d, 6000, 0.05);
  } },
  pwSkyStrike: { n: 4, gen(r) {
    const j = J(r); const d = Z(2.0);
    [[0, 1], [0.012 * j(0.3), 0.6], [0.03 * j(0.3), 0.4]].forEach(([t0, g]) => burst(d, r, { t0, g, atk: 0.0004, tau: 0.006, bp: 2200 * j(0.1), q: 0.7, lp: 6500 }));
    rumble(d, r, { g: 1, atk: 0.01, tau: 0.28, lp: 260 });
    rumble(d, r, { t0: 0.05, g: 0.25, atk: 0.1, tau: 0.55, lp: 180, am: wobble(r, 2, 6, 0.6) });
    sat(d, 1.5); return finish(d, 6000, 0.25);
  } },
  /* 7 rain (storybook stars): a rising twinkle, a falling whistle, a chime as each star lands */
  pwRainStars: { n: 2, gen(r) { const d = Z(1.3); [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349].forEach((f, i) => { tone(d, { t0: i * 0.1, f0: f, atk: 0.004, tau: 0.35, g: 0.1 }); tone(d, { t0: i * 0.1, f0: f * 2, atk: 0.004, tau: 0.15, g: 0.03 }); }); whoosh(d, r, { g: 0.08, atk: 0.4, tau: 0.3, fAt: (t) => 1500 + 1500 * Math.min(1, t), q: 1, lp: 4500 }); return finish(d, 7000, 0.2); } },
  pwStarFall: { n: 3, gen(r) { const j = J(r); const d = Z(0.42); tone(d, { fAt: (t) => 2600 * j(0.03) * Math.pow(0.55, Math.min(1, t / 0.32)), atk: 0.05, hold: 0.2, tau: 0.04, g: 0.07 }); whoosh(d, r, { g: 0.1, atk: 0.1, hold: 0.15, tau: 0.04, fAt: (t) => 3000 - 4000 * Math.min(t, 0.35), q: 1, lp: 4500 }); return finish(d, 6000, 0.04); } },
  pwStar: { n: 5, gen(r, v) {
    const d = Z(1.0); const f = [1568, 1760, 2093, 2349, 2637][v % 5];
    tone(d, { f0: f, atk: 0.002, tau: 0.5, g: 0.22 }); tone(d, { f0: f * 2, atk: 0.002, tau: 0.25, g: 0.07 }); tone(d, { f0: f * 3, atk: 0.002, tau: 0.12, g: 0.025 });
    burst(d, r, { g: 0.5, atk: 0.004, tau: 0.05, lp: 700 }); tone(d, { f0: 140, f1: 90, atk: 0.002, tau: 0.04, g: 0.4 });
    pings(d, r, { t0: 0.05, win: 0.25, count: 6, fLo: 3000, fHi: 5000, tLo: 0.015, tHi: 0.03, g: 0.04 });
    return finish(d, 7500, 0.15);
  } },
  /* 8 dash: a hard whoosh (edo shadow), or a whoosh with a winter-wind tail and a glint of snow (storybook) */
  pwDash: { n: 3, gen(r) {
    const j = J(r); const d = Z(0.55); const pk = 0.1 * j(0.15);
    whoosh(d, r, { g: 0.8, atk: 0.03, hold: 0.08, tau: 0.09, fAt: (t) => t < pk ? 400 + 1400 * t / pk : 1800 - 1100 * Math.min(1, (t - pk) / 0.2), q: 1.6, lp: 4000 });
    rumble(d, r, { g: 0.5, atk: 0.03, hold: 0.08, tau: 0.09, lp: 300 });
    burst(d, r, { t0: 0.02, g: 0.2, atk: 0.002, tau: 0.01, bp: 1200, lp: 3000 });
    return finish(d, 5000, 0.06);
  } },
  pwDashWind: { n: 3, gen(r) {
    const j = J(r); const d = Z(0.9); const pk = 0.1 * j(0.15);
    whoosh(d, r, { g: 0.7, atk: 0.03, hold: 0.08, tau: 0.09, fAt: (t) => t < pk ? 450 + 1300 * t / pk : 1750 - 1000 * Math.min(1, (t - pk) / 0.2), q: 1.5, lp: 4000 });
    whoosh(d, r, { t0: 0.08, g: 0.3, atk: 0.05, tau: 0.3, fAt: () => 900, q: 1.2, lp: 3000 });
    pings(d, r, { t0: 0.1, win: 0.4, count: 5, fLo: 3200, fHi: 4800, tLo: 0.03, tHi: 0.06, g: 0.04 });
    return finish(d, 6000, 0.1);
  } },
  /* 8 the cut that lands a beat later: a clean shing, a thin swish and a thunk */
  pwCut: { n: 3, gen(r) {
    const j = J(r); const d = Z(0.75);
    whoosh(d, r, { g: 0.5, atk: 0.005, tau: 0.04, fAt: (t) => 2500 - 8000 * Math.min(t, 0.15), q: 2, lp: 5000 });
    modes(d, r, 0.01, [[3150 * j(0.03), 0.25, 0.12], [4650 * j(0.03), 0.18, 0.07], [2100 * j(0.03), 0.3, 0.05]], 0.002);
    tone(d, { t0: 0.01, f0: 140, f1: 90, atk: 0.001, tau: 0.03, g: 0.5 }); burst(d, r, { t0: 0.01, g: 0.4, atk: 0.001, tau: 0.02, lp: 800 });
    return finish(d, 8000, 0.1);
  } },
  /* 9 slam: the hop gathers heat; the ring hits the ground */
  pwSlamUp: { n: 2, gen(r) { const d = Z(0.4); whoosh(d, r, { g: 0.4, atk: 0.22, tau: 0.04, fAt: (t) => 300 + 2400 * Math.min(t, 0.3), q: 1, lp: 2500 }); rumble(d, r, { g: 0.3, atk: 0.22, tau: 0.04, lp: 400 }); tone(d, { fAt: (t) => 80 + 200 * Math.min(t, 0.3), atk: 0.2, tau: 0.05, g: 0.15 }); return finish(d, 4500, 0.03); } },
  pwSlam: { n: 3, gen(r) {
    const j = J(r); const d = Z(1.6);
    tone(d, { f0: 58 * j(0.08), f1: 32, glide: 0.06, atk: 0.0015, tau: 0.18, g: 1.3, h: [1, 0.2] });
    burst(d, r, { g: 0.9, atk: 0.0015, tau: 0.12, lp: 600 });
    whoosh(d, r, { t0: 0.005, g: 0.5, atk: 0.01, tau: 0.3, fAt: (t) => 600 * Math.pow(0.4, Math.min(1, t / 0.4)), q: 0.8, lp: 2000 });
    pings(d, r, { win: 0.06, count: 6, fLo: 300, fHi: 700, tLo: 0.015, tHi: 0.03, g: 0.25 });
    rumble(d, r, { t0: 0.02, g: 0.3, atk: 0.03, tau: 0.5, lp: 300 });
    sat(d, 1.7); return finish(d, 6000, 0.2);
  } },
  /* 10 pulse (neon EMP): a sub thump, an electric snap, a power-down whine, a little crackle */
  pwPulse: { n: 2, gen(r) {
    const d = Z(1.35);
    tone(d, { f0: 50, f1: 30, glide: 0.08, atk: 0.002, tau: 0.25, g: 1.1 });
    burst(d, r, { g: 0.8, atk: 0.0004, tau: 0.004, bp: 3000, q: 0.8, lp: 7000 });
    tone(d, { fAt: (t) => 1600 * Math.pow(90 / 1600, Math.min(1, t / 0.7)), atk: 0.002, tau: 0.5, g: 0.13, h: [1, 0.3, 0.15], am: (t) => 0.75 + 0.25 * Math.sin(TAU * 120 * t) });
    grains(d, r, { win: 0.3, count: 30, pow: 1.6, fc: 2800, lp: 6000, g: 0.25, fall: 0.3 });
    return finish(d, 7000, 0.2);
  } },
  /* 11 bomb (frontier dynamite): the toss with a match strike, the fuse fizz, the bounce, the blast */
  pwThrow: { n: 2, gen(r) { const d = Z(0.36); whoosh(d, r, { g: 0.4, atk: 0.03, tau: 0.08, fAt: (t) => 600 + 2000 * Math.min(t, 0.25), q: 1, lp: 3000 }); burst(d, r, { t0: 0.02, g: 0.22, atk: 0.005, tau: 0.05, bp: 2400, q: 0.8, lp: 4800 }); return finish(d, 5500, 0.04); } },
  pwFuse: { n: 2, gen(r) { const d = Z(1.3); whoosh(d, r, { g: 0.3, atk: 0.03, hold: 1.1, tau: 0.04, fAt: () => 1900, q: 0.7, lp: 4200, am: wobble(r, 1.4, 45, 0.6) }); grains(d, r, { win: 1.2, count: 40, fc: 2000, lp: 4200, g: 0.3, fall: 5 }); return finish(d, 4800, 0.08); } },
  pwBounce: { n: 2, gen(r) { const d = Z(0.26); tone(d, { f0: 170, f1: 120, atk: 0.001, tau: 0.02, g: 0.7 }); burst(d, r, { g: 0.5, atk: 0.001, tau: 0.012, lp: 1500 }); modes(d, r, 0.001, [[640, 0.02, 0.2], [1450, 0.01, 0.1]]); return finish(d, 6000, 0.03); } },
  pwBlast: { n: 3, gen(r) {
    const j = J(r); const d = Z(2.4);
    burst(d, r, { g: 0.9, atk: 0.0004, tau: 0.006, bp: 2000 * j(0.1), q: 0.7, lp: 6500 });
    tone(d, { f0: 62 * j(0.08), f1: 34, glide: 0.06, atk: 0.0015, tau: 0.2, g: 1.3, h: [1, 0.2] });
    burst(d, r, { t0: 0.001, g: 1, atk: 0.002, tau: 0.22, lp: 700 });
    grains(d, r, { t0: 0.15, win: 1.1, count: 80, fc: 1500, q: 0.7, lp: 3000, g: 0.12, fall: 0.6 });
    sat(d, 2); desert(d, r, j, 0.18, 3, 0.3, 0.9, 0.18);
    return finish(d, 6500, 0.3);
  } },
  /* 12 vortex (frontier dust devil): a turning wind for 3.4 s that circles the head (stereo), a dust whip per gust, the throw */
  pwWind: { n: 2, gen(r) {
    const T = 3.4; const L = Z(3.85); const R = Z(3.85); const rot = 2.2;
    const body = Z(3.85);
    whoosh(body, r, { g: 0.7, atk: 0.35, hold: T - 0.5, tau: 0.15, fAt: (t) => 550 + 350 * Math.sin(TAU * rot * t), q: 1.0, lp: 2800 });
    whoosh(body, r, { g: 0.25, atk: 0.35, hold: T - 0.5, tau: 0.15, fAt: (t) => 1400 + 500 * Math.sin(TAU * rot * t + 1), q: 1.5, lp: 3500 });
    grains(body, r, { win: T, count: 160, fc: 1800, q: 0.7, lp: 3000, g: 0.12, fall: 9 });
    const lo = Z(3.85); rumble(lo, r, { g: 0.5, atk: 0.35, hold: T - 0.5, tau: 0.15, lp: 250, am: (t) => 1 + 0.3 * Math.sin(TAU * rot * t) });
    for (let i = 0; i < L.length; i++) { const p = Math.cos(TAU * rot * i / SR); L[i] = body[i] * (0.6 + 0.35 * p) + lo[i]; R[i] = body[i] * (0.6 - 0.35 * p) + lo[i]; }
    return [finish(L, 4000, 0.2), finish(R, 4000, 0.2)];
  } },
  pwWhirl: { n: 3, gen(r) { const d = Z(0.4); whoosh(d, r, { g: 0.4, atk: 0.05, tau: 0.1, fAt: (t) => 500 + 1600 * Math.min(t, 0.25), q: 1.2, lp: 2000 }); return finish(d, 3000, 0.04); } },
  pwWindEnd: { n: 2, gen(r) { const d = Z(0.95); whoosh(d, r, { g: 0.5, atk: 0.02, tau: 0.2, fAt: (t) => 1200 * Math.pow(0.25, Math.min(1, t / 0.4)), q: 1, lp: 3000 }); tone(d, { t0: 0.05, f0: 72, f1: 45, atk: 0.002, tau: 0.1, g: 0.8 }); burst(d, r, { t0: 0.05, g: 0.3, atk: 0.003, tau: 0.2, lp: 1500 }); return finish(d, 5000, 0.1); } },
  /* 13 wall (storybook bramble): the ground breaks, roots creak up, leaves rustle, a few root snaps; a foe snared tears */
  pwThorns: { n: 2, gen(r) {
    const j = J(r); const d = Z(1.6);
    tone(d, { f0: 90, f1: 55, glide: 0.05, atk: 0.002, tau: 0.08, g: 0.7 }); burst(d, r, { g: 0.5, atk: 0.002, tau: 0.06, lp: 700 });
    for (const [t0, dur] of [[0.02, 0.35], [0.14, 0.4], [0.32, 0.3]]) creak(d, r, { t0, dur, r0: 12, r1: 30, g: 0.22, list: [[190 * j(0.1), 0.03, 1], [460 * j(0.1), 0.02, 0.6], [980 * j(0.1), 0.012, 0.3]], swell: (k) => Math.sin(Math.PI * k) });
    whoosh(d, r, { t0: 0.03, g: 0.15, atk: 0.05, tau: 0.4, fAt: () => 1800, q: 0.7, lp: 3500, am: wobble(r, 1.4, 14, 0.6) });
    pings(d, r, { t0: 0.05, win: 0.35, count: 5, fLo: 500, fHi: 1200, tLo: 0.008, tHi: 0.014, g: 0.3 });
    return finish(d, 6000, 0.15);
  } },
  pwSnare: { n: 3, gen(r) { const j = J(r); const d = Z(0.5); burst(d, r, { g: 0.5, atk: 0.003, tau: 0.05, bp: 1500, q: 0.8, lp: 3500 }); creak(d, r, { t0: 0.02, dur: 0.2, r0: 20, r1: 30, g: 0.2, list: [[260 * j(0.1), 0.02, 1], [640 * j(0.1), 0.012, 0.5]] }); whoosh(d, r, { g: 0.12, atk: 0.02, tau: 0.15, fAt: () => 1900, q: 0.7, lp: 3500 }); return finish(d, 5500, 0.05); } },
};

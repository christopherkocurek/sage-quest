/* where to go and what to do, for a player who has read nothing.
   One target at a time, in every chapter:
     - a mark over the target (a chevron, the distance in metres, a pulse ring while it is in view); off screen it rides the
       edge of the view as an arrow that points the way (the route's next corner when a wall or water is in the way, from
       journey-nav.js), with the distance;
     - near the target the mark says how ("Stand here", "Hit the post") and fills while the player holds the spot;
     - when the objective changes, the objective block slides in again and a short tick plays;
     - no progress toward the target for 10 s (idle, lost, or walking the wrong way for 5 s): the arrow pulses harder, and the
       caller (journey.js, fight.js) repeats the instruction or lets a companion call.
   Cost: one projection a frame; style writes only when the value changes (whole pixels, whole metres). No canvas, no GPU.
   new Guide(f) -> g.set(target | null); g.update(dt) each frame; g.cue(el) when an objective line changes; g.dispose().
   target = { x, z, y?, h? (height of the mark over the ground, m), via? {x, z} (route corner), len? (route length),
              act? 'Stand here' (prompt at the object), near? (m within which the prompt shows, default 9), fill? 0..1,
              foe? true (a red mark), quiet? true (the mark only when off screen) } */
import * as THREE from 'three';
import { sfx } from './sfx.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _v = new THREE.Vector3();
let styled = false;
function addStyle() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.id = 'guide-style';
  s.textContent = `
  .gd-mark { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 5; opacity: 0; transition: opacity .3s; will-change: transform; }
  .gd-mark.on { opacity: 1; }
  .gd-mark .gd-pin { position: absolute; left: -15px; top: -30px; width: 30px; height: 30px; }
  .gd-mark .gd-pin::before { content: ''; position: absolute; left: 7px; top: 3px; width: 13px; height: 13px; border-right: 4px solid var(--gd-c, #ffd68c); border-bottom: 4px solid var(--gd-c, #ffd68c); transform: rotate(45deg); filter: drop-shadow(0 0 2px rgba(0,0,0,.9)) drop-shadow(0 0 8px rgba(0,0,0,.5)); }
  .gd-mark .gd-ring { position: absolute; left: -22px; top: -6px; width: 44px; height: 44px; border-radius: 50%; border: 3px solid var(--gd-c, #ffd68c); opacity: 0; }
  .gd-mark.inview .gd-ring { animation: gd-ping 2.2s ease-out infinite; }
  .gd-mark.edge .gd-pin { top: -15px; transform: rotate(var(--gd-a, 0deg)); }
  .gd-mark.edge .gd-pin::before { left: 4px; top: 7px; transform: rotate(-45deg); border-width: 5px; width: 15px; height: 15px; }
  .gd-mark .gd-txt { position: absolute; left: 0; top: -66px; transform: translateX(-50%); white-space: nowrap; font-family: var(--sans); font-size: var(--fs-min); font-weight: 700; letter-spacing: .01em; color: var(--cream, #ede6d6); text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 8px rgba(0,0,0,.8); padding: 1px 10px; background: radial-gradient(closest-side, rgba(8,9,11,.55), rgba(8,9,11,.3) 70%, rgba(8,9,11,0)); }
  .gd-mark.act .gd-txt { color: var(--gd-c, #ffd68c); font-size: var(--fs-body); }
  .gd-mark.edge .gd-txt { top: 22px; }
  .gd-mark.edge.right .gd-txt { left: -14px; transform: translateX(-100%); top: -14px; }
  .gd-mark.edge.left .gd-txt { left: 14px; transform: none; top: -14px; }
  .gd-mark .gd-bar { position: absolute; left: -40px; top: -30px; width: 80px; height: 5px; background: rgba(0,0,0,.55); border: 1px solid rgba(237,230,214,.35); display: none; }
  .gd-mark .gd-bar b { display: block; height: 100%; width: 0; background: var(--gd-c, #ffd68c); }
  .gd-mark.fill .gd-bar { display: block; } .gd-mark.fill .gd-pin { display: none; }
  .gd-mark.nudge .gd-pin { animation: gd-nudge .5s ease-in-out infinite alternate; }
  .gd-mark.nudge.edge .gd-pin::before { border-width: 6px; }
  .gd-mark.foe { --gd-c: #ff8a72; }
  @keyframes gd-ping { 0% { transform: scale(.35); opacity: .9; } 70% { opacity: 0; } 100% { transform: scale(1.6); opacity: 0; } }
  @keyframes gd-nudge { from { scale: 1; } to { scale: 1.45; } }
  .gd-cue { animation: gd-in .55s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes gd-in { 0% { opacity: 0; translate: 0 -18px; } 100% { opacity: 1; translate: 0 0; } }
  .gd-flash { animation: gd-flash 1.1s ease-out both; }
  @keyframes gd-flash { 0% { box-shadow: inset 0 0 0 2px rgba(255,214,140,.9); } 100% { box-shadow: inset 0 0 0 2px rgba(255,214,140,0); } }
  body.cine .gd-mark, body.chap .gd-mark, body.st-card .gd-mark, body.titling .gd-mark.edge { opacity: 0 !important; }
  `;
  document.head.appendChild(s);
}

export class Guide {
  constructor(f, { onNudge = null } = {}) {
    addStyle(); this.f = f; this.onNudge = onNudge;
    const el = document.createElement('div'); el.className = 'gd-mark'; el.innerHTML = '<div class="gd-ring"></div><div class="gd-pin"></div><div class="gd-bar"><b></b></div><div class="gd-txt"></div>';
    (document.getElementById('labels') || document.body).appendChild(el);
    this.el = el; this.txt = el.querySelector('.gd-txt'); this.bar = el.querySelector('.gd-bar b');
    this.t = null; this.last = { x: -1, y: -1, txt: '', cls: '', a: 999, fill: -1 };
    this.prog = { best: 1e9, t: 0, away: 0, key: '', level: 0 };
  }
  /* the one target now, or null (no mark) */
  set(t) { this.t = t || null; }
  /* the objective block (or any element) slides in again and a tick plays: call when the line changes */
  cue(el, sound = true) {
    if (el) { el.classList.remove('gd-cue'); void el.offsetWidth; el.classList.add('gd-cue'); }
    if (sound) sfx('tactic', { gain: 0.5 });
    this.prog.best = 1e9; this.prog.t = 0; this.prog.level = 0; this.prog.away = 0;
  }
  cls(c) { if (this.last.cls !== c) { this.last.cls = c; this.el.className = c; } }
  update(dt) {
    const f = this.f; const t = this.t; const cam = f.world?.camera;
    if (!t || !cam || f.over || (t.foe && f.cueEl && f.cueEl.style.opacity === '1')) { this.cls('gd-mark'); this.y = -1; return; } /* a foe winding up: the block / dodge cue says where it is */
    const W = innerWidth; const H = innerHeight;
    /* the mark aims at the route's next corner when the straight walk is shut */
    const ax = t.via ? t.via.x : t.x; const az = t.via ? t.via.z : t.z;
    const gy = t.y != null ? t.y : (f.journey ? f.journey.gy(ax, az) : 0);
    const dTrue = Math.hypot(t.x - f.pos.x, t.z - f.pos.z); const dist = t.via && t.len ? Math.max(t.len, dTrue) : dTrue;
    _v.set(ax, gy + (t.via ? 1.6 : (t.h ?? 2.2)), az).applyMatrix4(cam.matrixWorldInverse);
    const front = _v.z < -0.2; let sx = 0; let sy = 0;
    if (front) { _v.applyMatrix4(cam.projectionMatrix); sx = _v.x; sy = _v.y; }
    const inView = front && Math.abs(sx) < 0.9 && sy < 0.62 && sy > -0.75; /* not under the objective text, not in the HUD */
    const near = dTrue < (t.near ?? 9);
    let x; let y; let c = 'gd-mark on'; let a = 0;
    if (inView) {
      if (t.quiet || t.foe) { this.cls('gd-mark'); this.y = -1; this.progress(dt, dist, true, t); return; } /* quiet (and a foe: its own plate names it): a mark only while the target is off screen */
      x = (sx * 0.5 + 0.5) * W; y = (-sy * 0.5 + 0.5) * H; c += ' inview';
    } else {
      /* the edge: the direction to the target in the view plane (behind = to the side it is nearer to) */
      _v.set(ax, gy + 1.2, az).applyMatrix4(cam.matrixWorldInverse);
      let dx = _v.x; let dy = _v.y; if (_v.z > -0.2) { dy = Math.min(dy, 0) * 0.2; if (Math.abs(dx) < 0.3) dx = dx < 0 ? -1 : 1; } else { dx /= -_v.z; dy /= -_v.z; }
      const ang = Math.atan2(-dy, dx); /* screen angle, y down */
      const mx = W / 2 - 46; const top = H * 0.24; const bot = H * (W > H && document.body.classList.contains('tc-on') ? 0.44 : 0.72); /* a phone on its side has the stick and the buttons at both edges below the middle */ const cy = (top + bot) / 2; const my = (bot - top) / 2;
      const k = Math.min(mx / Math.max(1e-3, Math.abs(Math.cos(ang))), my / Math.max(1e-3, Math.abs(Math.sin(ang))));
      x = W / 2 + Math.cos(ang) * k; y = cy + Math.sin(ang) * k; a = Math.round((ang * 180) / Math.PI);
      c += ` edge ${x > W / 2 ? 'right' : 'left'}`;
    }
    if (t.foe) c += ' foe';
    const act = near && inView && t.act; if (act) c += ' act'; /* on the edge the arrow gives the distance; the prompt shows at the object */
    const fill = act && t.fill != null && t.fill > 0.01 ? t.fill : -1; if (fill >= 0) c += ' fill';
    if (this.prog.level > 0) c += ' nudge';
    this.cls(c);
    x = Math.round(x); y = Math.round(y);
    this.y = inView ? y : -1; this.x = x; /* teach.js keeps its prompt clear of an on-screen mark */
    if (x !== this.last.x || y !== this.last.y) { this.last.x = x; this.last.y = y; this.el.style.transform = `translate(${x}px, ${y}px)`; }
    if (a !== this.last.a) { this.last.a = a; this.el.style.setProperty('--gd-a', `${a}deg`); }
    const txt = act ? t.act : `${t.name ? `${t.name} · ` : ''}${Math.max(1, Math.round(dist))} m`;
    if (txt !== this.last.txt) { this.last.txt = txt; this.txt.textContent = txt; }
    if (fill >= 0) { const fw = Math.round(fill * 100); if (fw !== this.last.fill) { this.last.fill = fw; this.bar.style.width = `${fw}%`; } }
    this.progress(dt, dist, inView, t);
  }
  /* no gain of 1.5 m toward the target in 10 s (or 5 s walking away from it): the guidance gets stronger */
  progress(dt, dist, inView, t) {
    const P = this.prog; const f = this.f; const key = `${Math.round(t.x)},${Math.round(t.z)}`;
    if (key !== P.key) { P.key = key; P.best = dist; P.t = 0; P.away = 0; P.level = 0; return; }
    if (f.paused || f.journey?.arriving || document.body.classList.contains('cine') || document.body.classList.contains('chap') || t.foe) { P.t = 0; return; }
    /* at the target (or fighting near it) is never "lost" */
    let foeNear = false; for (const x of f.foes || []) { if (x.state !== 'dead' && !x.gone && !x.hold && Math.hypot(x.pos.x - f.pos.x, x.pos.z - f.pos.z) < 6) { foeNear = true; break; } }
    const near = dist < (t.near ?? 9) || foeNear || (f.journey && f.journey.foeD < 14);
    if (dist < P.best - 1.5 || near) { P.best = Math.min(P.best, dist); P.t = 0; P.away = 0; if (P.level && near) P.level = 0; return; }
    P.t += dt; if (dist > P.best + 4 && !inView) P.away += dt; else P.away = Math.max(0, P.away - dt);
    if (P.t > 10 || P.away > 5) { P.t = 0; P.away = 0; P.best = dist; P.level++; try { this.onNudge?.(P.level, t); } catch (err) { console.warn('guide nudge', err); } sfx('tactic', { gain: 0.7 }); }
  }
  dispose() { this.el.remove(); }
}

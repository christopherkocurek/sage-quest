/* the link between the player's words and the thing that changes.
   Without it an answer goes in, a result appears, and nothing on screen connects the two.
   One gesture, 1.2 to 1.8 s: the words fly from the field to the Sage2 panel (flyWords), the panel row resolves (main.js),
   a streak of light runs from that row to the object in the scene (streak), and a ring opens where it lands (ring).
   Plain DOM and SVG on one fixed layer: nothing here touches the 3D frame. On the low quality tier and with reduced
   motion the streak is skipped: the row and the change still happen. */
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const low = () => window.__sq?.quality?.tier === 'low';
const NS = 'http://www.w3.org/2000/svg';
let layer = null;
function host() {
  if (layer?.isConnected) return layer;
  layer = document.createElement('div'); layer.id = 'sq-link'; layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer); return layer;
}
export const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const done = (anim) => new Promise((res) => { anim.onfinish = res; anim.oncancel = res; });

/* the words leave the field and land where the panel will quote them. from / to = DOMRects */
export function flyWords(text, from, to, { ms = 520 } = {}) {
  if (!from || !to || calm()) return Promise.resolve();
  const el = document.createElement('div'); el.className = 'sq-fly'; el.textContent = text; host().appendChild(el);
  const w = el.getBoundingClientRect();
  const x0 = from.left + 28; const y0 = from.top + (from.height - w.height) / 2;
  const k = Math.min(1, Math.max(0.5, to.width / Math.max(1, w.width)));
  const x1 = to.left; const y1 = to.top + Math.max(0, (to.height - w.height * k) / 2);
  /* a small arc: up first, then across */
  const xm = x0 + (x1 - x0) * 0.45; const ym = Math.min(y0, y1) - 46;
  const a = el.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 0.2 },
    { transform: `translate(${xm}px, ${ym}px) scale(${(1 + k) / 2})`, opacity: 1, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) scale(${k})`, opacity: 1, offset: 0.9 },
    { transform: `translate(${x1}px, ${y1}px) scale(${k})`, opacity: 0 },
  ], { duration: ms, easing: 'cubic-bezier(.4,.1,.2,1)' });
  return done(a).then(() => el.remove());
}

/* a streak of light from a (the panel row) to b (the thing that changes): a drawn line with a bright head */
export function streak(a, b, { ms = 440 } = {}) {
  if (!a || !b || calm() || low()) return Promise.resolve();
  const W = innerWidth; const H = innerHeight;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'sq-streak'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  /* a shallow curve: the control point sits above the straight line, so the light arcs into the scene */
  const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2 - Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
  const d = `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  const glow = document.createElementNS(NS, 'path'); glow.setAttribute('d', d); glow.setAttribute('class', 'g');
  const line = document.createElementNS(NS, 'path'); line.setAttribute('d', d); line.setAttribute('class', 'l');
  svg.append(glow, line); host().appendChild(svg);
  const len = line.getTotalLength();
  const head = document.createElement('i'); head.className = 'sq-head'; host().appendChild(head);
  for (const p of [glow, line]) { p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}`; }
  const ease = 'cubic-bezier(.5,0,.15,1)';
  const draw = [glow, line].map((p) => p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, easing: ease, fill: 'forwards' }));
  /* the head rides the same curve: sampled points, so it works without offset-path */
  const N = 14; const frames = [];
  for (let i = 0; i <= N; i++) { const p = line.getPointAtLength((len * i) / N); frames.push({ transform: `translate(${p.x - 7}px, ${p.y - 7}px)`, opacity: i === 0 ? 0 : 1 }); }
  const ha = head.animate(frames, { duration: ms, easing: ease, fill: 'forwards' });
  return done(ha).then(() => {
    head.remove();
    const out = svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
    done(out).then(() => { for (const x of draw) x.cancel(); svg.remove(); });
  });
}

/* where the light lands: a ring opens and fades */
export function ring(at, { size = 120, ms = 620 } = {}) {
  if (!at || calm()) return;
  const el = document.createElement('i'); el.className = 'sq-ring'; el.style.width = el.style.height = `${size}px`;
  el.style.left = `${at.x - size / 2}px`; el.style.top = `${at.y - size / 2}px`; host().appendChild(el);
  const a = el.animate([{ transform: 'scale(.15)', opacity: 0.95 }, { transform: 'scale(1)', opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)' });
  a.onfinish = a.oncancel = () => el.remove();
}

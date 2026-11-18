/* The title reel: behind the title, a new world every 2 s, as if Sage2 picked it from a player's answer.
   Each shot is a still rendered once by the real world code (1600x900 jpg in
   /assets/reel/): that world's land, a hero of that world with the weapon Sage2 picked, and Sage2's nemesis on the horizon.
   Stills, not live 3D: a cut costs no shader compile, no land build and no GPU time, so the title never stutters, and the
   camp behind the questions stays warm under the reel.

   The picks are TRUE. Each entry is one real run of the dev server's Sage2 endpoints: `said` was sent to
   /api/step as the origin answer and as the body answer (with the origin as context), `enemy` to the enemy step in the
   picked world and `weapon` to /api/act. p = Sage2's probability of the pick. hero: null = Sage2 was not sure (the game
   would ask the player to choose), so the line names the land instead. Nothing here calls Sage2 at run time.
   dark: a Dark Road night scene (two never follow each other; the order below keeps that). */
export const REEL = [
  { key: 'trucks', said: 'I fix trucks in West Texas', world: 'frontier', worldLabel: 'The Frontier', land: 'mesa', landLabel: 'Red Mesa', hero: null, enemy: 'The oil company that buys up every ranch', nemesis: 'baron', weapon: 'pistol', p: { world: 1, land: 0.94 }, dark: false },
  { key: 'crab', said: 'I fish for crab off the coast of Alaska', world: 'dark', worldLabel: 'The Dark Road', land: 'frostpass', landLabel: 'The Frost Pass', hero: 'Rogue', enemy: 'The cold sea that took my father', nemesis: null, weapon: 'spear', p: { world: 1, land: 0.97, hero: 0.75 }, dark: true },
  { key: 'goats', said: 'I keep goats on a farm in the Swiss Alps', world: 'storybook', worldLabel: 'The Storybook Day', land: 'cloudpeaks', landLabel: 'The Cloud Peaks', hero: null, enemy: 'The storms that wreck the harvest', nemesis: 'stormgiant', weapon: 'axe', p: { world: 1, land: 0.99 }, dark: false },
  { key: 'cab', said: 'I drive a night cab in Hong Kong', world: 'neon', worldLabel: 'The Neon City', land: 'rainline', landLabel: 'The Rain District', hero: 'Courier', enemy: 'The tower that owns the whole city', nemesis: 'tower', weapon: 'pistol', p: { world: 1, land: 0.62, hero: 0.97 }, dark: false },
  { key: 'rail', said: 'I drive freight trains across Wyoming', world: 'frontier', worldLabel: 'The Frontier', land: 'railhead', landLabel: 'The Railhead', hero: 'Drifter', enemy: 'The boss who owns the line', nemesis: 'baron', weapon: 'maul', p: { world: 0.99, land: 0.98, hero: 0.84 }, dark: false },
  { key: 'herring', said: 'I fish herring off the Faroe Islands', world: 'dark', worldLabel: 'The Dark Road', land: 'stormcoast', landLabel: 'The Storm Coast', hero: 'Rogue', enemy: 'The storms that sink the boats', nemesis: 'giant', weapon: 'axe', p: { world: 1, land: 0.79, hero: 0.72 }, dark: true },
  { key: 'bakery', said: 'I bake bread in a village in Bavaria', world: 'storybook', worldLabel: 'The Storybook Day', land: 'meadow', landLabel: 'The Bright Meadow', hero: null, enemy: 'A knight who took our land', nemesis: 'blackknight', weapon: 'bow', p: { world: 1, land: 0.93 }, dark: false },
  { key: 'rice', said: 'I grow rice in the hills of Niigata, Japan', world: 'edo', worldLabel: 'Old Edo', land: 'paddies', landLabel: 'The Flooded Paddies', hero: 'Samurai', enemy: 'The lord who takes the harvest', nemesis: 'lord', weapon: 'sword', p: { world: 1, land: 0.65, hero: 0.5 }, dark: false },
  /* Sage2 was not sure of the world here (Storybook at 0.40): the game keeps the Dark Road, and so does this shot */
  { key: 'sheep', said: 'I drive sheep across the grasslands of Kazakhstan', world: 'dark', worldLabel: 'The Dark Road', land: 'dusksteppe', landLabel: 'The Dusk Steppe', hero: 'Rogue', enemy: 'The wolves of the winter', nemesis: 'dragon', weapon: 'spear', p: { land: 1, hero: 0.59 }, dark: false },
  { key: 'peat', said: 'I cut peat on the moors of Yorkshire', world: 'dark', worldLabel: 'The Dark Road', land: 'barrowmoor', landLabel: 'The Barrow Moor', hero: 'Barbarian', enemy: 'The ghosts of the old barrows', nemesis: 'lich', weapon: 'maul', p: { world: 0.88, land: 1, hero: 0.57 }, dark: true },
  { key: 'teacher', said: 'I teach little kids in a town in Austria', world: 'storybook', worldLabel: 'The Storybook Day', land: 'cloudpeaks', landLabel: 'The Cloud Peaks', hero: 'Apprentice', enemy: 'A black knight', nemesis: 'blackknight', weapon: 'staff', p: { world: 1, land: 0.63, hero: 0.9 }, dark: false },
  { key: 'vegas', said: 'I deal cards all night in a casino in Las Vegas', world: 'neon', worldLabel: 'The Neon City', land: 'dockyard', landLabel: 'The Dry Docks', hero: 'Courier', enemy: 'The tower that owns the city', nemesis: 'tower', weapon: 'spear', p: { world: 0.53, land: 0.99, hero: 1 }, dark: false },
  { key: 'steppe', said: 'I herd horses on the steppe in Mongolia', world: 'frontier', worldLabel: 'The Frontier', land: 'railhead', landLabel: 'The Railhead', hero: null, enemy: 'The winter that kills the herd', nemesis: 'other', weapon: 'spear', p: { world: 0.84, land: 1 }, dark: false },
  { key: 'ranger', said: 'I am a forest ranger in Oregon', world: 'dark', worldLabel: 'The Dark Road', land: 'deepwood', landLabel: 'The Deepwood', hero: 'Knight', enemy: 'The fires that come every summer', nemesis: 'dragon', weapon: 'axe', p: { world: 0.97, land: 0.98, hero: 0.96 }, dark: true },
  { key: 'wine', said: 'I make wine in the hills of Portugal', world: 'storybook', worldLabel: 'The Storybook Day', land: 'meadow', landLabel: 'The Bright Meadow', hero: 'Outlaw', enemy: 'A dragon that burns the vines', nemesis: 'stormgiant', weapon: 'daggers', p: { world: 0.96, land: 0.94, hero: 0.6 }, dark: false },
  { key: 'jungle', said: 'I guide boats up rivers in the jungle of Borneo', world: 'dark', worldLabel: 'The Dark Road', land: 'vinewild', landLabel: 'The Vinewild', hero: 'Rogue', enemy: 'A dragon in the vines', nemesis: 'dragon', weapon: 'daggers', p: { world: 0.98, land: 1, hero: 0.96 }, dark: true },
  { key: 'castle', said: 'I guard the old castle in Matsumoto, high in the snowy mountains of Japan', world: 'edo', worldLabel: 'Old Edo', land: 'castleroad', landLabel: 'The Castle Road', hero: 'Samurai', enemy: 'The lord who betrayed my family', nemesis: 'lord', weapon: 'spear', p: { world: 0.99, land: 0.99, hero: 1 }, dark: false },
  { key: 'volcano', said: 'I study volcanoes in Iceland', world: 'dark', worldLabel: 'The Dark Road', land: 'ashlands', landLabel: 'The Ashlands', hero: 'Mage', enemy: 'The mountain that wakes up', nemesis: 'giant', weapon: 'staff', p: { world: 1, land: 0.98, hero: 0.99 }, dark: true },
  { key: 'kendo', said: 'I teach kendo in Kyoto', world: 'edo', worldLabel: 'Old Edo', land: 'paddies', landLabel: 'The Flooded Paddies', hero: 'Samurai', enemy: 'My old rival from the dojo', nemesis: 'other', weapon: 'bow', p: { world: 1, land: 0.59, hero: 0.97 }, dark: false },
  { key: 'swamp', said: 'I trap crawfish in the Louisiana bayou', world: 'dark', worldLabel: 'The Dark Road', land: 'drownedfen', landLabel: 'The Drowned Fen', hero: 'Rogue', enemy: 'The flood', nemesis: 'giant', weapon: 'axe', p: { world: 0.87, land: 1, hero: 0.65 }, dark: true },
];
export const reelUrl = (key) => `/assets/reel/${key}.jpg`;
/* the pick as one short line: the world, then the hero (or the land when Sage2 left the hero to the player) */
export const pickText = (s) => `${s.worldLabel} · ${s.hero ? `the ${s.hero}` : s.landLabel}`;

/* 2.6 s a shot. The cut is 1.3 s of moving characters: the old world breaks into glyphs from the centre
   out, the glyphs scramble and change colour into the next world, settle, and then let the new picture through. The
   spoken example types in under the wordmark as the wave starts. */
const SHOT_MS = 2600; const CUT_MS = 1300;
const RAMP = ' .,:;+*oxX#%@';
/* a picture as cells: glyph index and lifted colour per cell, on the grid of the canvas */
function sample(cv, img) {
  const w = cv.clientWidth; const h = cv.clientHeight; if (!w || !h || !img?.naturalWidth) return null;
  const phone = w < 700; const cw = phone ? 9 : Math.max(11, Math.round(w / 120)); const ch = Math.round(cw * 1.7);
  const cols = Math.ceil(w / cw); const rows = Math.ceil(h / ch);
  const sm = sample.sm || (sample.sm = document.createElement('canvas')); sm.width = cols; sm.height = rows;
  const sx = sm.getContext('2d', { willReadFrequently: true });
  /* the same crop as the picture under it (object-fit: cover, object-position 100% / 84% 50%) */
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight); const sw = w / k; const sh = h / k;
  sx.drawImage(img, (img.naturalWidth - sw) * (phone ? 0.84 : 1), (img.naturalHeight - sh) * 0.5, sw, sh, 0, 0, cols, rows);
  let d; try { d = sx.getImageData(0, 0, cols, rows).data; } catch { return null; }
  const N = cols * rows; const L = new Float32Array(N); const hist = new Uint32Array(256);
  for (let q = 0; q < N; q++) { const o = q * 4; const v = 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]; L[q] = v; hist[v | 0]++; }
  /* each picture uses the whole ramp: its own dark and bright ends set the range (a night scene is not all dots) */
  let lo = 0; let hi = 255; for (let acc = 0; lo < 255 && (acc += hist[lo]) < N * 0.08; lo++); for (let acc = 0; hi > 0 && (acc += hist[hi]) < N * 0.01; hi--);
  const span = Math.max(24, hi - lo); const n = RAMP.length; const g = new Uint8Array(N); const col = new Uint8Array(N * 3);
  for (let q = 0; q < N; q++) {
    const o = q * 4; const l = Math.pow(Math.min(1, Math.max(0, (L[q] - lo) / span)), 0.8); g[q] = Math.max(1, Math.min(n - 1, Math.floor(l * n)));
    const m = (0.45 + 0.75 * l) * 255 / Math.max(40, d[o], d[o + 1], d[o + 2]);
    col[q * 3] = Math.min(255, d[o] * m + 18); col[q * 3 + 1] = Math.min(255, d[o + 1] * m + 18); col[q * 3 + 2] = Math.min(255, d[o + 2] * m + 18);
  }
  return { w, h, cw, ch, cols, rows, g, col };
}
/* the wave order of the cells: from the centre out, with a little noise so the front is ragged */
function order(S) {
  const key = `${S.cols}x${S.rows}`; if (order.key === key) return order.d;
  const d = new Float32Array(S.cols * S.rows); const cx = (S.cols - 1) / 2; const cy = (S.rows - 1) / 2; const mx = Math.hypot(cx, cy * 1.7);
  for (let j = 0; j < S.rows; j++) for (let i = 0; i < S.cols; i++) d[j * S.cols + i] = Math.min(1, Math.hypot(i - cx, (j - cy) * 1.7) / mx * 0.8 + Math.random() * 0.2);
  order.key = key; order.d = d; return d;
}
/* one frame of the cut at time u (0..1). Per cell, by its place in the wave: uncovered -> old glyph -> scramble -> new glyph -> gone.
   (1) the canvas keeps at most 1920 px of width and is scaled up by CSS (a 4K screen at 150 % was an 18 MP canvas
   cleared and filled every frame); (2) all the dark cell backgrounds are ONE path fill, then the glyphs run in colour order with a
   cached fill style (before: 4 canvas calls and a new colour string per cell, about 5 ms a frame on a fast CPU); (3) step() below
   draws at most every 12 ms (30 ms when a frame cost over 5 ms), so a 144 Hz screen does not draw the cut 144 times a second. */
const STY = [];
const sty = (c) => STY[c] || (STY[c] = `rgb(${(c >> 10) * 8 + 4},${((c >> 5) & 31) * 8 + 4},${(c & 31) * 8 + 4})`);
function drawCut(cv, A, B, u, swapAt) {
  const { w, h, cw, ch, cols, rows } = B;
  const k = Math.min(Math.min(window.devicePixelRatio || 1, 1.5), 1920 / w); const bw = Math.max(1, Math.round(w * k)); const bh = Math.max(1, Math.round(h * k));
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, w, h);
  c.font = `500 ${Math.round(ch * 0.86)}px "Geist Mono", ui-monospace, monospace`; c.textBaseline = 'top'; c.textAlign = 'center';
  const D = order(B); const n = RAMP.length; const same = A && A.cols === cols && A.rows === rows;
  const N = cols * rows; const F = drawCut.F?.n === N ? drawCut.F : (drawCut.F = { n: N, on: new Uint8Array(N), gi: new Uint8Array(N), col: new Uint16Array(N) });
  /* a cell is on from `on` to `off`; the cover wave runs 0-0.34, the reveal wave 0.56-1; the picture swaps under full cover */
  c.beginPath();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const q = j * cols + i; const dd = D[q]; const on = dd * 0.34; const off = 0.56 + dd * 0.40;
    if (u < on || u >= off) { F.on[q] = 0; continue; }
    const v = (u - on) / (off - on); /* 0..1 of this cell's life */
    c.rect(i * cw, j * ch, cw + 0.5, ch + 0.5); F.on[q] = 1;
    const mix = Math.min(1, Math.max(0, (v - 0.25) / 0.4)); /* colour and glyph go old -> new in the middle */
    let gi; if (v > 0.2 && v < 0.72) gi = 1 + ((Math.random() * (n - 1)) | 0); else gi = v <= 0.2 && same ? A.g[q] : B.g[q];
    let r = B.col[q * 3]; let g = B.col[q * 3 + 1]; let b = B.col[q * 3 + 2];
    if (same && mix < 1) { r = A.col[q * 3] + (r - A.col[q * 3]) * mix; g = A.col[q * 3 + 1] + (g - A.col[q * 3 + 1]) * mix; b = A.col[q * 3 + 2] + (b - A.col[q * 3 + 2]) * mix; }
    /* the two fronts glow: a cell just lit, or about to go, is drawn in the cream */
    const edge = Math.max(1 - v / 0.1, 1 - (1 - v) / 0.1, 0);
    if (edge > 0) { r += (237 - r) * edge; g += (230 - g) * edge; b += (214 - b) * edge; }
    F.gi[q] = gi; F.col[q] = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  }
  c.fillStyle = '#07080a'; c.fill();
  let prev = -1;
  for (let q = 0; q < N; q++) {
    if (!F.on[q]) continue; const col = F.col[q]; if (col !== prev) { c.fillStyle = sty(col); prev = col; }
    c.fillText(RAMP[F.gi[q]], (q % cols) * cw + cw / 2, ((q / cols) | 0) * ch);
  }
  return u >= swapAt;
}
/* startReel(host, { live }): host = the element that holds the reel (the title); live() = false stops it for good.
   Returns { stop() }. Every image is loaded and decoded before its cut; the next two are fetched ahead, never all 20. */
export function startReel(host, { live = () => true } = {}) {
  const box = host.querySelector('.reel'); if (!box) return { stop() {} };
  const first0 = box.querySelector('img'); box.querySelectorAll('img').forEach((el) => { if (el !== first0) el.remove(); });
  const cv = host.querySelector('.reel-ascii'); const saidEl = host.querySelector('.say span');
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ready = new Map(); /* key -> Promise<HTMLImageElement> */
  const fetchShot = (i) => {
    const s = REEL[i % REEL.length]; if (ready.has(s.key)) return ready.get(s.key);
    const img = new Image(); img.decoding = 'async'; img.src = reelUrl(s.key);
    const p = img.decode().then(() => img, () => null); ready.set(s.key, p); return p;
  };
  let drawCost = 0; let i = 0; let cur = first0; let timer = 0; let stopped = false; let flip = 1; let typer = 0; let raf = 0; let prev = null; const later = new Set();
  const after = (ms, fn) => { const t = setTimeout(() => { later.delete(t); if (!stopped) fn(); }, ms); later.add(t); };
  /* the spoken example types in under the wordmark */
  const say = (s, quick) => {
    if (!saidEl) return; clearInterval(typer); const text = `“${s.said}”`;
    if (quick || calm) { saidEl.textContent = text; return; }
    let k = 0; const step = Math.max(1, Math.ceil(text.length / 22)); saidEl.textContent = '';
    typer = setInterval(() => { k += step; saidEl.textContent = text.slice(0, k); if (k >= text.length) clearInterval(typer); }, 28);
  };
  const place = (img, old, hard) => { box.appendChild(img); img.classList.add('drift'); if (hard) img.classList.add('cut', 'on'); else requestAnimationFrame(() => { if (!stopped) img.classList.add('on'); }); cur = img; if (hard) { if (old !== cur) old.remove(); } else after(400, () => { if (old !== cur) old.remove(); }); };
  const show = (s, img) => {
    const old = cur; img.alt = ''; img.className = '';
    /* a fresh drift each shot: the zoom restarts and its direction alternates, so no two shots move the same way */
    flip = -flip; img.style.setProperty('--dx', `${flip * 1.4}%`);
    say(s, false);
    const B = !calm && cv ? sample(cv, img) : null;
    if (!B) { place(img, old, false); return; }
    const A = prev || sample(cv, old); prev = B;
    cancelAnimationFrame(raf); cv.classList.add('on'); const t0 = performance.now(); let swapped = false; let lastDraw = -1e9;
    const step = (now) => {
      if (stopped) return; const u = Math.min(1, (now - t0) / CUT_MS);
      if (now - lastDraw >= (drawCost > 5 ? 30 : 12) || u >= 1) { lastDraw = now; const t1 = performance.now(); drawCut(cv, A, B, u, 0.45); drawCost += (performance.now() - t1 - drawCost) * 0.2; }
      if (u >= 0.45 && !swapped) { swapped = true; place(img, old, true); }
      if (u < 1) raf = requestAnimationFrame(step); else { if (!swapped) place(img, old, true); cv.classList.remove('on'); }
    };
    raf = requestAnimationFrame(step);
  };
  const tick = async () => {
    if (stopped) return;
    if (!live()) { stop(); return; }
    if (document.hidden) { timer = setTimeout(tick, 500); return; }
    const next = (i + 1) % REEL.length;
    const img = await fetchShot(next);
    if (stopped) return;
    if (!img) { REEL[next].broken = true; i = next; timer = setTimeout(tick, 0); return; } /* a missing still is skipped */
    i = next; show(REEL[i], img); fetchShot(i + 1); fetchShot(i + 2);
    timer = setTimeout(tick, SHOT_MS);
  };
  /* the first shot is in the page already (index.html): its example now, then the next one is fetched while it plays */
  const first = REEL[0]; say(first, false);
  first0.classList.add('drift', 'on'); ready.set(first.key, (first0.complete ? Promise.resolve() : first0.decode().catch(() => {})).then(() => first0));
  fetchShot(1); fetchShot(2);
  timer = setTimeout(tick, SHOT_MS);
  function stop() {
    if (stopped) return; stopped = true; clearTimeout(timer); clearInterval(typer); cancelAnimationFrame(raf); for (const t of later) clearTimeout(t); later.clear();
    /* nothing of the reel stays: the images are dropped and the box leaves the page */
    for (const l of box.querySelectorAll('img')) l.removeAttribute('src'); ready.clear();
    box.remove(); cv?.remove();
  }
  return { stop };
}

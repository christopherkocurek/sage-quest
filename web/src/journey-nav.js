/* the walk's own route finder (journey.js builds one per walk, lazily).
   The old detour (journey.around) guessed a side of the cluster of footprints in the way. On the Edo castle road the
   guess led into the corner between the front wall, the honmaru wall and the yagura, and the walk never finished
   (the gate in the front wall was 15 m the other way). This module searches the real ground instead: a 1 m grid over
   the walk's box (the same box constrain() keeps the hero in), a cell is shut when it lies inside a solid of the walk
   (this.solids + this.solidsL, with a margin), in deep water, or when a step into it climbs more than 1:1 or goes
   below the floor (the same rules as constrain()). A* over 8 directions, then the corners are pulled tight.
   makeNav(J) -> { route(ax, az, gx, gz, rg, strict), clear(ax, az, bx, bz), free(x, z) }
     route  -> { pts: [{x, z}, ...] from the start to a place within rg of the goal (corners only), len } or null
     clear  -> true when the straight walk a -> b crosses no shut cell
   Used by journey.js: guide() (the mark and the bot's next point when the straight walk is shut), watchStuck, and the
   placement of the finds and the far light (a stop that no route reaches is never chosen). */
const CELL = 1;
const MARGINS = [0.45, 0.12]; /* the first search keeps clear of every footprint; a second one squeezes through a narrow gap */
const STEEP = 0.9; /* a cell where the ground climbs more than 0.9 m per metre in some direction: constrain() stops a hero that steps up 1:1, so the first two searches keep off it */

export function makeNav(J) {
  const tMin = -24; const tMax = J.D + 26; const sMin = -58; const sMax = 58;
  const nt = Math.ceil((tMax - tMin) / CELL) + 1; const ns = Math.ceil((sMax - sMin) / CELL) + 1; const N = nt * ns;
  const X = new Float32Array(N); const Z = new Float32Array(N); const Hh = new Float32Array(N); const wet = new Uint8Array(N); const steep = new Uint8Array(N);
  const shut = MARGINS.map(() => new Uint8Array(N)); const modes = [];
  const list = [...J.solids, ...(J.solidsL || [])];
  const circles = list.filter((c) => !(c.w && c.d)); const boxes = list.filter((c) => c.w && c.d).map((c) => ({ c, cs: Math.cos(c.ry || 0), sn: Math.sin(c.ry || 0) }));
  const inside = (x, z, m) => {
    for (const c of circles) { const dx = x - c.x; const dz = z - c.z; const rr = c.r + m; if (dx * dx + dz * dz < rr * rr) return true; }
    for (const { c, cs, sn } of boxes) { const dx = x - c.x; const dz = z - c.z; if (Math.abs(dx * cs - dz * sn) < c.w / 2 + 0.35 + m && Math.abs(dx * sn + dz * cs) < c.d / 2 + 0.35 + m) return true; }
    return false;
  };
  for (let i = 0; i < nt; i++) for (let j = 0; j < ns; j++) {
    const n = i * ns + j; const t = tMin + i * CELL; const s = sMin + j * CELL; const x = J.ux * t + J.nx * s; const z = J.uz * t + J.nz * s;
    X[n] = x; Z[n] = z; Hh[n] = J.gy(x, z); wet[n] = J.wet(Hh[n]) ? 1 : 0;
    for (let k = 0; k < MARGINS.length; k++) shut[k][n] = wet[n] || inside(x, z, MARGINS[k]) ? 1 : 0;
  }
  for (let i = 0; i < nt; i++) for (let j = 0; j < ns; j++) { const n = i * ns + j; const a = Hh[Math.max(0, i - 1) * ns + j]; const b = Hh[Math.min(nt - 1, i + 1) * ns + j]; const c = Hh[i * ns + Math.max(0, j - 1)]; const d = Hh[i * ns + Math.min(ns - 1, j + 1)]; steep[n] = Math.hypot((b - a) / 2, (d - c) / 2) > STEEP ? 1 : 0; }
  /* the searches, strictest first: clear of footprints and steep ground; squeezing past footprints; at last only the step rule of constrain() */
  /* a cell next to water is kept off too (a hero on the shore line steps into the water between two cell centres) */
  const shore = new Uint8Array(N); for (let i = 0; i < nt; i++) for (let j = 0; j < ns; j++) { if (!wet[i * ns + j]) continue; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ii = i + di; const jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nt && jj < ns) shore[ii * ns + jj] = 1; } }
  { const m0 = new Uint8Array(N); const m1 = new Uint8Array(N); for (let n = 0; n < N; n++) { m0[n] = shut[0][n] | steep[n] | shore[n]; m1[n] = shut[1][n] | steep[n] | shore[n]; } modes.push({ bad: m0, limit: STEEP }, { bad: m1, limit: STEEP }, { bad: shut[1], limit: 1.0 }); }
  const cellAt = (x, z) => { const i = Math.round(((x * J.ux + z * J.uz) - tMin) / CELL); const j = Math.round(((x * J.nx + z * J.nz) - sMin) / CELL); return i < 0 || j < 0 || i >= nt || j >= ns ? -1 : i * ns + j; };
  /* the step rule of constrain() between two neighbouring cells */
  const stepOK = (n, m, len, limit = 1.0) => { const dh = Hh[m] - Hh[n]; return !(dh / len > limit || (J.floor != null && Hh[m] < J.floor && Hh[m] < Hh[n] - 0.02)); };
  /* the nearest open cell to a point (a hero standing a little inside a footprint's margin) */
  const nearest = (x, z, bad, rmax = 5) => { let best = -1; let bd = 1e9; const c0 = cellAt(x, z); if (c0 >= 0 && !bad[c0]) return c0; for (let n = 0; n < N; n++) { const dx = X[n] - x; const dz = Z[n] - z; const d = dx * dx + dz * dz; if (d < bd && d < rmax * rmax && !bad[n]) { bd = d; best = n; } } return best; };
  const G = new Float64Array(N); const from = new Int32Array(N); const gen = new Int32Array(N); let tick = 0;
  /* string pulling: a straight walk between two cell centres, read off the grid itself (cheap; used on the found path) */
  const clearCells = (bad, limit, ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(L / 0.5)); let pc = -1;
    for (let k = 0; k <= n; k++) {
      const c = cellAt(ax + (bx - ax) * k / n, az + (bz - az) * k / n); if (c < 0 || bad[c]) return false;
      if (pc >= 0 && c !== pc && !stepOK(pc, c, Math.max(0.5, Math.hypot(X[c] - X[pc], Z[c] - Z[pc])), limit)) return false; pc = c;
    }
    return true;
  };
  /* the exact test on the real footprints: the straight walk a -> b crosses no solid and no water, climbs no cliff */
  const clearExact = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(L / 0.6)); let px = ax; let pz = az; let ph = J.gy(ax, az);
    for (let k = 1; k <= n; k++) {
      const x = ax + (bx - ax) * k / n; const z = az + (bz - az) * k / n; if (inside(x, z, -0.06)) return false;
      const h = J.gy(x, z); const len = Math.max(Math.hypot(x - px, z - pz), 0.05); if (J.wet(h) || (h - ph) / len > 1.0 || (J.floor != null && h < J.floor && h < ph - 0.02)) return false; px = x; pz = z; ph = h;
    }
    return true;
  };
  function search({ bad, limit }, ax, az, gx, gz, rg) {
    const s0 = nearest(ax, az, bad); if (s0 < 0) return null; tick++;
    const hfn = (n) => Math.max(0, Math.hypot(X[n] - gx, Z[n] - gz) - rg);
    const heap = []; const up = (k) => { while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } };
    const down = () => { let k = 0; for (;;) { const l = 2 * k + 1; const r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } };
    const setG = (n, g, p) => { gen[n] = tick; G[n] = g; from[n] = p; };
    setG(s0, 0, -1); heap.push([hfn(s0), s0]);
    let goal = -1; let steps = 0;
    while (heap.length) {
      const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; down(); }
      const n = top[1]; if (top[0] - hfn(n) > G[n] + 1e-6) continue; steps++;
      if (Math.hypot(X[n] - gx, Z[n] - gz) <= rg) { goal = n; break; }
      const i = (n / ns) | 0; const j = n - i * ns;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const ii = i + di; const jj = j + dj; if (ii < 0 || jj < 0 || ii >= nt || jj >= ns) continue; const m = ii * ns + jj; if (bad[m]) continue;
        if (di && dj && (bad[i * ns + jj] || bad[ii * ns + j])) continue; /* no squeezing through a corner of two footprints */
        const len = di && dj ? 1.4142 : 1; if (!stepOK(n, m, len * CELL, limit)) continue;
        const g = G[n] + len; if (gen[m] === tick && G[m] <= g) continue; setG(m, g, n); heap.push([g + hfn(m), m]); up(heap.length - 1);
      }
    }
    if (goal < 0) return null;
    const cells = []; for (let n = goal; n >= 0; n = from[n]) cells.push(n); cells.reverse();
    /* pull the corners tight: from each point, the farthest later point that the walk reaches in a straight line */
    let cur = { x: ax, z: az }; const pts = [cur]; let k = 0; const h0 = cellAt(ax, az);
    if (h0 < 0 || bad[h0]) { cur = { x: X[cells[0]], z: Z[cells[0]] }; pts.push(cur); } /* the hero stands against a footprint (inside its margin): the first point is the nearest open cell */
    while (k < cells.length - 1) {
      let far = k + 1; for (let q = cells.length - 1; q > k + 1; q--) { if (clearCells(bad, limit, cur.x, cur.z, X[cells[q]], Z[cells[q]])) { far = q; break; } }
      cur = { x: X[cells[far]], z: Z[cells[far]] }; pts.push(cur); k = far;
    }
    let len = 0; for (let q = 1; q < pts.length; q++) len += Math.hypot(pts[q].x - pts[q - 1].x, pts[q].z - pts[q - 1].z);
    return { pts, len };
  }
  return {
    /* strict = only the two searches that keep off steep ground (a place a hero walks to straight, not by zigzag) */
    route(ax, az, gx, gz, rg = 2.3, strict = false) { for (const md of strict ? modes.slice(0, 2) : modes) { const r = search(md, ax, az, gx, gz, rg); if (r) return r; } return null; },
    clear(ax, az, bx, bz) { return clearExact(ax, az, bx, bz); },
    free(x, z) { const c = cellAt(x, z); return c >= 0 && !shut[1][c]; },
  };
}

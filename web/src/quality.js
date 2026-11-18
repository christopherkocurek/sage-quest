/* Performance: render-size ladder, tiers and frame gating.
   Measured causes: (1) the first frames ran at full device resolution (4K: 8.3 MP, 11 fps at the boss
   and 31 fps on the title) and the controller needed seconds to back off; (2) the 3D camp was drawn at full rate under the opaque
   title reel; (3) about 280 shader programs link on the main thread during play, one after the other (getProgramInfoLog blocks
   until the link is done; Direct3D on Windows links several times slower than Metal); (4) shadow cube map + sun map + 5 full-size
   post passes at any size; (5) rAF work did not scale down on 120 to 240 Hz screens.
   installQuality(world) wraps world.update once and owns:
   - the render size: a ladder of pixel ratios, capped by the device ratio and the tier. The first frames start at a pixel budget
     (about 2.1 MP, less on a weak or software GPU) and climb only when the frames have headroom (GPU timer when the browser has it).
     A slow window steps down in about 1 s, by as many rungs as the overshoot asks for. A rung that failed is barred for 20 s, 40 s ...
   - the tier: high (today's look), mid, low, min (no shadows, no post chain: for software rendering). Tiers only step down.
   - gate(now, titleUp): true = skip this frame. The title (opaque reel on top) draws one warm frame every 2.5 s after its programs
     are compiled in parallel, and a screen faster than ~100 Hz that cannot hold its rate runs every 2nd (3rd) frame.
   - kick (OFF by default, ?kick=1): shader programs of new objects start linking in parallel the frame they are added. It made things
     worse on Metal in the measurement, so it stays an opt-in test for Windows.
   - ?stats=1: the diagnostics box; one console line at each stage and tier change; a one-line notice on software rendering.
   - ?q=low|mid|high|min pins the tier (high also pins the ratio at min(devicePixelRatio, 2): today's look); ?q=auto (default).
   world.__sq.quality (window.__sq.quality) = { tier, ratio, scale, set(tier), stats(), log(reason) } for tools. */
import * as THREE from 'three';
import { installPerf3, isPhone, isTablet } from './perf3.js';

const LADDER = [2, 1.75, 1.5, 1.25, 1, 0.85, 0.75, 0.65, 0.55, 0.5, 0.42, 0.35]; /* the last two rungs are for software rendering only (floorR) */
const TIER_CAP = { high: 2, mid: 1.5, low: 1.25, min: 1 };
const TIERS = ['high', 'mid', 'low', 'min'];
const START_PX = { normal: 2.1e6, weak: 1.3e6, soft: 0.55e6 }; /* pixels of the first frame; the controller climbs from here */
const WIN = 500; /* ms per controller window */

/* what draws this? window.__sqGpu is set by the probe script in index.html (before any module); this is the fallback */
export function gpuClass(gl) {
  const pre = typeof window !== 'undefined' ? window.__sqGpu : null; if (pre) return pre;
  let raw = ''; try { const e = gl.getExtension('WEBGL_debug_renderer_info'); raw = String((e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''); } catch { /* masked */ }
  const soft = /swiftshader|software|llvmpipe|softpipe|basic render|microsoft basic|\bwarp\b|mesa offscreen/i.test(raw);
  const weak = !soft && (/intel.*\b(hd|uhd|iris)\b|intel\(r\) graphics|mali-|adreno|powervr|videocore|vivante/i.test(raw) && !/arc|iris xe max/i.test(raw) || /radeon\(tm\) (vega|graphics)|radeon.*\d{3}m\b/i.test(raw));
  return { raw, soft, weak };
}

export function installQuality(world, { q = null } = {}) {
  if (!world || world._quality) return world?._quality;
  const qs = (() => { try { return new URLSearchParams(location.search); } catch { return null; } })();
  const want = (q || qs?.get('q') || 'auto').toLowerCase();
  const pinned = TIERS.includes(want) ? want : null;
  const dpr = Math.max(0.5, window.devicePixelRatio || 1);
  const R = world.renderer; const gl = R.getContext();
  const gpu = gpuClass(gl);
  const cores = navigator.hardwareConcurrency || 0;
  /* a phone is its own case (an iPhone reports the same GPU name as a Mac): the low tier, drawn straight to the canvas
     with no shadows, at about 1 megapixel. ?phone=1 forces it for tests. A tablet starts on low. */
  const phone = isPhone(); const tablet = isTablet();
  const first = pinned || (gpu.soft ? 'min' : (gpu.weak || phone || tablet) ? 'low' : 'high');
  const st = { tier: first, ratio: 0, scale: 1, pinned: !!pinned, steps: [], gpu: gpu.raw, soft: !!gpu.soft, weak: !!gpu.weak, phone, cores, skip: 1, skipN: 0, hush: false, direct: false, hz: 60 };
  const bloomBase = world.bloom ? world.bloom.enabled : true;
  const px = () => Math.max(1, window.innerWidth * window.innerHeight);
  const PHONE_PX = 1.0e6;
  const budget = gpu.soft ? START_PX.soft : phone ? PHONE_PX : gpu.weak ? START_PX.weak : START_PX.normal;
  const floorR = gpu.soft ? 0.35 : phone ? Math.max(0.5, Math.min(1.3, Math.round(Math.sqrt(0.42e6 / px()) * 20) / 20)) : 0.5; /* a phone never goes under about 0.4 megapixels: below that the picture is mush */

  /* the rungs this machine may use: at most the device ratio (a 1x screen never renders above 1) and the tier cap */
  const rungs = () => { let cap = Math.min(dpr, phone ? 2 : TIER_CAP[st.tier], 2); if (phone) cap = Math.min(cap, Math.max(floorR, Math.round(Math.sqrt(PHONE_PX * 1.05 / px()) * 20) / 20)); const r = LADDER.filter((x) => x <= cap + 1e-3 && x >= floorR - 1e-3); if (!r.length || r[0] < cap - 1e-3) r.unshift(Math.max(floorR, cap)); return r; };
  const setRatio = (r) => {
    r = Math.round(r * 100) / 100; if (Math.abs(r - R.getPixelRatio()) < 1e-3) { st.ratio = r; return; }
    R.setPixelRatio(r); world.composer?.setPixelRatio?.(r); world.resize?.(); st.ratio = r; st.scale = +(r / Math.min(dpr, 2)).toFixed(2);
  };
  /* the highest rung whose pixel count fits `maxPx` (at least the lowest rung) */
  const rungFor = (maxPx) => { const r = rungs(); for (const x of r) if (x * x * px() <= maxPx * 1.02) return x; return r[r.length - 1]; };

  /* ---- the tier ---- */
  const lights = () => { const a = []; world.scene.traverse((o) => { if (o.isLight && (o.castShadow || o.userData.sqShadow)) a.push(o); }); return a; };
  const thinPoints = (k) => { world.scene.traverse((o) => { if (!o.isPoints || !o.geometry) return; if (k >= 1 && o.userData.sqPts == null) return; if (o.userData.sqPts == null) o.userData.sqPts = o.geometry.drawRange.count; const full = o.userData.sqPts; const n = Number.isFinite(full) ? full : (o.geometry.attributes.position?.count || 0); if (n > 64) o.geometry.setDrawRange(0, k >= 1 ? full : Math.max(32, Math.floor(n * k))); }); };
  const applyLights = (t) => {
    const size = t === 'high' ? 2048 : 1024;
    for (const l of lights()) {
      l.userData.sqShadow = true; const point = !!l.isPointLight;
      const on = t !== 'min' && !phone; if (l.castShadow !== on) l.castShadow = on;
      const want = point ? (t === 'high' ? 1024 : 512) : size;
      if (l.shadow && l.shadow.mapSize.x !== want) { l.shadow.mapSize.set(want, want); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } }
    }
  };
  /* for effects: st.fx = how much of an optional effect (a streak, a reveal, particles, glow, extra lights) to run: 1 / 0.7 / 0.45 / 0.25 by tier.
     st.onTier(fn) calls fn(tier, fx) at every tier change (and once at once, with the current tier). st.is('high','mid') tests the tier. */
  const FX = { high: 1, mid: 0.7, low: 0.45, min: 0.25 }; const tierFns = new Set();
  st.fx = FX[st.tier]; st.is = (...t) => t.includes(st.tier);
  st.onTier = (fn) => { tierFns.add(fn); try { fn(st.tier, st.fx); } catch (err) { console.warn('onTier', err); } return () => tierFns.delete(fn); };
  const applyTier = (t) => {
    st.tier = t; st.fx = FX[t]; applyLights(t); for (const fn of tierFns) { try { fn(t, st.fx); } catch (err) { console.warn('onTier', err); } }
    if (world.bloom) world.bloom.enabled = t === 'low' || t === 'min' ? false : bloomBase;
    st.shadowEvery = t === 'low' ? 2 : 1;
    if (st.shadowEvery === 1) R.shadowMap.autoUpdate = true;
    st.direct = t === 'min' && !phone; /* phone: low and min share one shader set, so the step down links nothing */ R._sqWarmTarget = st.direct ? null : (world.composer?.renderTarget1 || R._sqWarmTarget);
    thinPoints(t === 'low' ? 0.5 : t === 'min' ? 0.35 : 1);
    st.grassK = t === 'low' ? 0.55 : t === 'min' ? 0.4 : 1;
  };
  applyTier(st.tier);
  /* the first frames: the pixel budget, never more than the tier allows. A pinned high keeps today's ratio for good. */
  setRatio(pinned === 'high' ? Math.min(dpr, 2) : rungFor(budget));
  if (pinned === 'high') st.locked = true;

  /* ---- the controller ---- */
  let last = performance.now(); const t0 = last;
  let winT = 0; let winN = 0; let winSlow = 0; let winSum = 0; let winCpu = 0; let winGpu = 0; let winGpuN = 0;
  let base = 16.7; /* the display interval, learned from the fastest steady frames */
  let grassF = 0; let fspF = 0; let ptsF = 0;
  const singlePass = () => { world.scene.traverse((o) => { const mm = o.material; if (!mm || !o.isSkinnedMesh) return; /* bodies and wear only: leaves and cards keep their two passes */ for (const m of Array.isArray(mm) ? mm : [mm]) if (m.transparent && m.side === 2 && !m.forceSinglePass && m.opacity >= 0.999 && !m.userData.sqTwoPass) m.forceSinglePass = true; }); };
  const thinGrass = () => { world.scene.traverse((o) => { if (!o.isInstancedMesh || o.userData.sqThin === st.grassK) return; const m = o.material; if (typeof m?.customProgramCacheKey !== 'function' || m.customProgramCacheKey() !== 'sq-grass-rim') return; if (o.userData.sqFull == null) o.userData.sqFull = o.count; o.userData.sqThin = st.grassK; o.count = Math.floor(o.userData.sqFull * st.grassK); }); };
  const bar = new Map(); /* rung -> { until, wait } */
  let lastStepAvg = 0; let tierWins = 0; let hzWins = 0; let overWins = 0; let goodWins = 0; let floorSlow = 0; let shadowF = 0; let tried = null; let skipSince = 0;
  const busy = () => { const b = document.body?.classList; return st.hush || !!(b && (b.contains('chap') || b.contains('cine'))); };
  const note = (s, now) => { st.steps.push(`${Math.round((now - t0) / 1000)}s ${s}`); if (st.steps.length > 24) st.steps.shift(); };
  const tierDown = (now) => {
    if (st.pinned || st.tier === 'min') return false;
    applyTier(TIERS[TIERS.indexOf(st.tier) + 1]); const r = rungs(); if (st.ratio > r[0] + 1e-3) setRatio(r[0]);
    note(`tier ${st.tier}`, now); st.log(`tier ${st.tier}`); return true;
  };
  /* dir > 0: n rungs down (smaller picture), dir < 0: n rungs up */
  const step = (dir, now, n = 1) => {
    const r = rungs(); const cur = r.findIndex((x) => Math.abs(x - st.ratio) < 1e-3); const i = cur < 0 ? Math.max(0, r.findIndex((x) => x < st.ratio)) : cur;
    const j = Math.max(0, Math.min(r.length - 1, i + dir * n)); if (j === i) return false;
    if (dir < 0) { for (let k = i - 1; k >= j; k--) { const b = bar.get(k); if (b && now < b.until) { if (k === i - 1) return false; return step(dir, now, i - k - 1); } } tried = { j, at: now }; }
    else if (tried && tried.j === i && now - tried.at < 6000) { const b = bar.get(i); const wait = b ? Math.min(b.wait * 2, 320000) : 20000; bar.set(i, { until: now + wait, wait }); tried = null; }
    setRatio(r[j]); note(`${r[j]}`, now); st.log(`render ${st.ratio}`);
    return true;
  };
  /* a smaller picture that should bring `avg` ms down to about `want` ms: pixels scale with the square of the ratio */
  const dropFor = (avg, want) => { const f = Math.sqrt(Math.max(0.2, Math.min(0.95, want / Math.max(avg, 1)))); const target = st.ratio * f; const r = rungs(); let j = r.findIndex((x) => x <= target + 1e-3); if (j < 0) j = r.length - 1; const cur = r.findIndex((x) => Math.abs(x - st.ratio) < 1e-3); return Math.max(1, j - (cur < 0 ? 0 : cur)); };
  /* the display's refresh interval: the smallest interval that at least 15 % of the last 5 s of rAF callbacks share (a burst of catch-up frames after a stall is never that common) */
  const refreshMs = () => { const n = ring.length >> 1; if (n < 40 || ring[ring.length - 2] - ring[0] < 3000) return null; const h = new Map(); for (let i = 1; i < ring.length; i += 2) { const k = Math.round(ring[i]); h.set(k, (h.get(k) || 0) + 1); } for (const k of [...h.keys()].sort((a, b) => a - b)) if ((h.get(k) || 0) + (h.get(k - 1) || 0) + (h.get(k + 1) || 0) >= n * 0.15) return k; return null; };
  const endWindow = (now) => {
    const eb = base * Math.max(1, st.skip); const rb = refreshMs(); if (rb) st.hz = Math.round(1000 / Math.max(3.4, rb));
    const avg = winSum / Math.max(1, winN); const slowFrac = winSlow / Math.max(1, winN); const cpu = (st.cpuFrame || winCpu / Math.max(1, winN)); const gms = winGpuN ? winGpu / winGpuN : 0;
    st.avg = +avg.toFixed(1); st.cpu = +cpu.toFixed(1); st.gpuMs = +gms.toFixed(1);
    winT = 0; winN = 0; winSlow = 0; winSum = 0; winCpu = 0; winGpu = 0; winGpuN = 0;
    if (st.locked || now - t0 < 1500 || busy() || document.hidden) { overWins = 0; goodWins = 0; return; }
    const over = avg > Math.max(eb * 1.3, 20.5) || slowFrac > 0.25; const severe = avg > Math.max(eb * 2.2, 36);
    const good = avg < Math.max(eb * 1.12, 14) && slowFrac < 0.03;
    /* a screen at 100 Hz or more whose frames cost more than the frame: the rate flips between the full and the half rate. Fix it at the half. */
    if (st.skip === 1 && rb && rb < 10.5 && cpu > rb * 0.9 && avg > rb * 1.15) { if (++hzWins >= 4) { hzWins = 0; st.skip = 2; st.skipN = 0; skipSince = now; note('every 2nd frame', now); st.log('frame skip 2'); return; } } else hzWins = 0;
    if (over || severe) {
      goodWins = 0; overWins++;
      if (severe || overWins >= 2) { /* about 1 s of slow frames (one window if they are very slow) */
        overWins = 0;
        const cpuBound = cpu > avg * 0.55 && !(gms > avg * 0.6);
        const noGain = lastStepAvg > 0 && avg > lastStepAvg * 0.9;
        if (cpuBound && ((rb && rb < 10.5 && st.skip < 3) || (phone && st.skip < 2 && st.tier === 'min'))) { st.skip++; st.skipN = 0; skipSince = now; note(`every ${st.skip}nd frame`, now); st.log(`frame skip ${st.skip}`); }
        else if (cpuBound || noGain) {
          /* the cost is not in the pixels: the tier goes, but only after about 3 s of it (a loaded machine or a compile burst is not a slow one) */
          if (++tierWins >= 3) { tierWins = 0; lastStepAvg = 0; if (!tierDown(now)) { if (step(+1, now)) lastStepAvg = avg; } }
          else if (!cpuBound && step(+1, now, dropFor(avg, Math.max(eb * 1.05, 15.5)))) lastStepAvg = avg;
        }
        else if (step(+1, now, dropFor(avg, Math.max(eb * 1.05, 15.5)))) { floorSlow = 0; lastStepAvg = avg; }
        else if (++floorSlow >= 2) { floorSlow = 0; if (!tierDown(now) && phone && st.skip < 2) { st.skip = 2; st.skipN = 0; skipSince = now; note('30 fps', now); st.log('phone: 30 fps'); } }
      }
    } else if (good) {
      overWins = 0; tierWins = 0; lastStepAvg = 0; goodWins++;
      const have = gms > 0; const need = have ? 3 : 6;
      if (goodWins >= need) {
        goodWins = 0;
        /* with a GPU timer: the highest rung whose projected GPU time stays under 55 % of the frame (a fifth of it does not scale with the pixels) */
        let n = 1;
        if (have && cpu < base * 0.6) { const r = rungs(); const cur = Math.max(0, r.findIndex((x) => Math.abs(x - st.ratio) < 1e-3)); for (let k = cur - 1; k >= 0; k--) { const proj = gms * 0.2 + gms * 0.8 * (r[k] / st.ratio) ** 2; if (proj <= base * 0.55) n = cur - k; else break; } }
        step(-1, now, n);
        /* the frame skip goes back after a minute of easy frames */
        if (st.skip > 1 && now - skipSince > 60000 && cpu < base * st.skip * 0.3) { st.skip--; st.skipN = 0; skipSince = now; note(`every ${st.skip}nd frame`, now); }
      }
    } else { overWins = 0; goodWins = 0; tierWins = Math.max(0, tierWins - 1); }
  };

  /* ---- GPU time (EXT_disjoint_timer_query_webgl2): one query around the frame's draw calls, read two or three frames later ---- */
  const gt = (() => {
    let ext = null; try { ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch { /* none */ }
    if (!ext || !gl.createQuery) return null;
    const pend = []; let open = null;
    return {
      begin() { if (pend.length > 6 || open) return; try { open = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, open); } catch { open = null; } },
      end() { if (!open) return; try { gl.endQuery(ext.TIME_ELAPSED_EXT); pend.push(open); } catch { /* drop */ } open = null; },
      poll() { while (pend.length) { const qq = pend[0]; let ok = false; try { ok = gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE); } catch { pend.length = 0; return; } if (!ok) break; pend.shift(); try { const dis = gl.getParameter(ext.GPU_DISJOINT_EXT); const v = gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(qq); if (!dis && v >= 0 && v < 1000) { winGpu += v; winGpuN++; st.gpuLast = v; if (st.gpuRaw) st.gpuRaw.push(v); /* tools set st.gpuRaw = [] to collect every sample */ } } catch { /* ignore */ } } },
    };
  })();
  st.hasGpuTimer = !!gt;

  /* ---- kick: start the link of every new program at once, in parallel ---- */
  /* OFF by default: measured on Metal with the machine calm, linking new programs ahead in one call made the fight's first seconds worse (4.5 s of link waits and a 2.4 s frame against 0.2 s and 0.3 s without it). ?kick=1 turns it on for a test on Windows/D3D, where one link costs several times more. */
  const kickOn = qs?.get('kick') === '1';
  const seenMat = new WeakMap(); const queue = []; const probe = new THREE.Object3D(); let lightDirty = false; let kicked = 0;
  if (kickOn && !THREE.Object3D.prototype._sqKick) {
    const add0 = THREE.Object3D.prototype.add; THREE.Object3D.prototype._sqKick = true;
    THREE.Object3D.prototype.add = function (...objs) {
      let live = null; for (const o of objs) { if (!o || !o.isObject3D) continue; if (o.isLight) lightDirty = true; if (queue.length < 4000) { if (live === null) { let p = this; while (p.parent) p = p.parent; live = p === world.scene; } if (live) queue.push(o); } }
      return add0.apply(this, objs);
    };
  }
  const key = (o) => (o.isSkinnedMesh ? 1 : 0) | (o.isInstancedMesh ? 2 : 0) | (o.isPoints ? 4 : 0) | (o.isLine ? 8 : 0);
  const kick = () => {
    if (!kickOn || R.getRenderTarget() || (!queue.length && !lightDirty)) return;
    const a = performance.now();
    try {
      if (lightDirty) { lightDirty = false; queue.length = 0; R.compile(world.scene, world.camera); kicked++; return; } /* the light count is in every lit program's key: all of them */
      const reps = []; let budget = 60;
      while (queue.length && budget-- > 0) { const o = queue.pop(); if (!o.parent) continue; o.traverse((m) => { const mat = m.material; if (!mat) return; const k = key(m); for (const x of Array.isArray(mat) ? mat : [mat]) { const have = seenMat.get(x) || 0; if (have & (1 << k)) continue; seenMat.set(x, have | (1 << k)); reps.push(m); } }); }
      if (queue.length > 3000) queue.length = 0;
      if (reps.length) { probe.children = reps; R.compile(probe, world.camera, world.scene); kicked += reps.length; }
    } catch (err) { console.warn('kick', err); } finally { probe.children = []; st.kickMs = (st.kickMs || 0) + (performance.now() - a); }
  };
  st.kicked = () => kicked;
  /* a program compile that was started but never drawn is cheap; the render then finds it ready or waits only for the slowest */
  /* ---- the minimum tier draws the scene straight to the canvas: no half-float post chain (the ink style keeps its chain) ---- */
  if (world.composer) {
    const cr = world.composer.render.bind(world.composer);
    world.composer.render = (dt) => {
      if (world.p5Hold && document.body.classList.contains('qcard')) return; /* the walk builds and links under the opaque quest card (journey.js startJourney); nothing of the 3D shows there */
      kick();
      if (st.direct && !world.style?.on) { R.setRenderTarget(null); R.render(world.scene, world.camera); return; }
      cr(dt);
    };
  }

  /* ---- the frame ---- */
  st.frame = (now) => {
    const d = now - last; last = now;
    if (d > 0 && d < 1000) {
      /* the display interval: a slow average of the frames near the low end */
      if (d < base * 1.08) base += (Math.max(3.4, d) - base) * 0.02; else if (d < base * 1.3) base += (d - base) * 0.002;
      winT += d; winN++; winSum += Math.min(d, base * 2.5); if (d > Math.max(base * Math.max(1, st.skip) * 1.6, 25)) winSlow++; /* a lone hitch (a compile) is not a slow machine: it counts at most 2.5 frames */
      drawn.push(now); while (drawn.length && drawn[0] < now - 5000) drawn.shift();
      if ((winT >= WIN && winN >= 10) || winT >= 1000) endWindow(now); /* at least 10 frames: a lone compile hitch must not close a window by itself */
    }
    /* low tier: the shadow maps are drawn every second frame */
    if (st.shadowEvery > 1) { R.shadowMap.autoUpdate = false; if (++shadowF % st.shadowEvery === 0) R.shadowMap.needsUpdate = true; }
    /* every tier: a transparent double-sided material is drawn by three in two passes, and each pass flips material.side and
       sets needsUpdate (a program lookup per draw: 4,600 a second on the Edo wear, 5 % of the CPU). At full opacity one
       pass looks the same: forceSinglePass on (checked every second) */
    if (++fspF % 60 === 1) singlePass();
    if (st.grassK < 1 && ++grassF % 120 === 1) thinGrass();
    if (st.tier !== 'high' && ++ptsF % 180 === 1) { thinPoints(st.tier === 'low' ? 0.5 : st.tier === 'min' ? 0.35 : 1); applyLights(st.tier); }
  };
  const ring = []; /* [time, interval, ...] of the last 5 s: every rAF, drawn or not (what the screen delivers) */
  const drawn = []; /* the times of the frames that were drawn, last 5 s */
  let gLast = performance.now();

  /* ---- gate: the title and the high-refresh frame skip ---- */
  const warm = { next: 0, pending: false, ready: false };
  st.gate = (now, titleUp) => {
    { const dd = now - gLast; gLast = now; if (dd > 0 && dd < 1000) { ring.push(now, dd); while (ring.length > 2 && ring[0] < now - 5000) { ring.shift(); ring.shift(); } } st.paint?.(now); }
    if (titleUp && qs?.get('hush') !== '0') {
      if (!st.hush) { st.hush = true; warm.next = 0; warm.ready = false; warm.pending = false; st.log('title: 3D paused under the reel'); }
      if (document.hidden) return true;
      if (warm.ready) { warm.ready = false; warm.next = now + 2500; return false; } /* one warm frame: textures and buffers stay resident */
      if (!warm.pending && now >= warm.next) {
        warm.pending = true;
        const done = () => { warm.pending = false; warm.ready = true; };
        try { R.compileAsync(world.scene, world.camera).then(done, done); } catch { done(); }
      }
      return true;
    }
    if (st.hush) { st.hush = false; last = now; winT = 0; winN = 0; winSlow = 0; winSum = 0; overWins = 0; goodWins = 0; st.log('title done'); }
    if (st.skip > 1 && ++st.skipN % st.skip !== 0) return true;
    return false;
  };
  st.cpu0 = 0;
  st.cpuNote = (ms) => { st.cpuFrame = st.cpuFrame == null ? ms : st.cpuFrame + (ms - st.cpuFrame) * 0.1; };
  st.set = (t) => { if (!TIERS.includes(t)) return; st.pinned = true; st.locked = t === 'high'; applyTier(t); setRatio(t === 'high' ? Math.min(dpr, 2) : rungFor(budget)); };
  st.base = () => base;

  /* ---- numbers for the overlay, the console and tools ---- */
  const calls = { c: 0, t: 0 };
  const medianOf = () => { const a = []; for (let i = 1; i < ring.length; i += 2) a.push(ring[i]); a.sort((x, y) => x - y); return a.length ? { med: a[a.length >> 1], worst: a[a.length - 1], n: a.length, over33: a.filter((x) => x > 33.4).length, over100: a.filter((x) => x > 100).length } : { med: 0, worst: 0, n: 0, over33: 0, over100: 0 }; };
  st.stats = () => {
    const m = medianOf(); const sz = R.getDrawingBufferSize(new THREE.Vector2());
    return { drawn: +(drawn.length / 5).toFixed(1), fps: m.n > 1 ? +(((m.n - 1) * 1000) / Math.max(1, ring[ring.length - 2] - ring[0])).toFixed(1) : 0, med: +m.med.toFixed(1), worst: +m.worst.toFixed(1), over33: m.over33, over100: m.over100,
      w: sz.x, h: sz.y, ratio: st.ratio, scale: st.scale, tier: st.tier, calls: calls.c, tris: calls.t, programs: R.info.programs?.length || 0, gpu: st.gpu, soft: st.soft, weak: st.weak, cores: st.cores, hz: st.hz, dpr, skip: st.skip, js: st.cpuFrame != null && !st.hush ? +st.cpuFrame.toFixed(1) : null, gpuMs: st.gpuMs || null, hush: st.hush, kicked };
  };
  st.line = (why) => { const s = st.stats(); return `[sq] ${why} | fps ${s.fps} med ${s.med} ms worst ${s.worst} ms | render ${s.w}x${s.h} scale ${s.scale} | tier ${s.tier} | calls ${s.calls} tris ${Math.round(s.tris / 1000)}k progs ${s.programs} | gpu "${s.gpu}"${s.soft ? ' SOFTWARE' : ''} | cores ${s.cores} hz ~${s.hz}${s.skip > 1 ? ` (every ${s.skip}nd frame)` : ''}`; };
  st.log = (why) => { try { console.log(st.line(why)); } catch { /* console */ } };

  /* ?stats=1 */
  if (qs?.get('stats') === '1') {
    R.info.autoReset = false;
    const el = document.createElement('pre'); el.id = 'sq-stats'; el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483647;margin:0;padding:8px 10px;background:rgba(0,0,0,.78);color:#d8ffe0;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:none;border-radius:4px;max-width:calc(100vw - 16px);overflow:hidden';
    (document.body || document.documentElement).appendChild(el);
    let lastDraw = 0;
    st.paint = (now) => {
      if (now - lastDraw < 250) return; lastDraw = now; const s = st.stats();
      const t = [
        `SAGE QUEST  stats=1   stage ${window.__sq?.S?.stage ?? '?'}${s.hush ? ' (3D paused: title)' : ''}`,
        `fps ${s.fps}${s.drawn !== s.fps ? ` (3D drawn ${s.drawn}/s)` : ''}   median ${s.med} ms   worst ${s.worst} ms   (last 5 s; ${s.over33} frames over 33 ms, ${s.over100} over 100 ms)`,
        `render ${s.w}x${s.h}   scale ${s.scale}   ratio ${s.ratio}   dpr ${s.dpr}   tier ${s.tier}`,
        `draw calls ${s.calls}   triangles ${Math.round(s.tris / 1000)}k   programs ${s.programs}   kicked ${s.kicked}`,
        `JS ${s.js ?? '?'} ms/frame   GPU ${s.gpuMs ?? (st.hasGpuTimer ? '...' : 'no timer')} ms/frame`,
        `gpu: ${s.gpu || 'unknown'}`,
        `cores ${s.cores}   display ~${s.hz} Hz${s.skip > 1 ? `   drawing every ${s.skip}nd frame` : ''}`,
        `steps: ${st.steps.slice(-5).join(' | ') || '-'}`,
      ];
      el.textContent = t.join('\n');
      if (s.soft) { const d = document.createElement('div'); d.textContent = 'SOFTWARE RENDERING: the browser is not using the graphics card'; d.style.cssText = 'color:#ff4d4d;font-weight:700'; el.appendChild(d); }
    };
  }

  /* software rendering: one plain line, once */
  if (st.soft) {
    let shown = false; try { shown = localStorage.getItem('sq.swnote') === '1'; } catch { /* storage off */ }
    if (!shown) setTimeout(() => {
      try { localStorage.setItem('sq.swnote', '1'); } catch { /* storage off */ }
      const n = document.createElement('div'); n.id = 'sq-swnote'; n.setAttribute('role', 'status');
      n.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483646;max-width:min(92vw,820px);padding:9px 40px 9px 14px;background:#1b1b1f;color:#f3efe6;border:1px solid #5a5a62;border-radius:8px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)';
      n.textContent = 'Your browser is drawing this without your graphics card. Turn on hardware acceleration in the browser settings for smooth play.';
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Dismiss'); x.style.cssText = 'position:absolute;right:6px;top:3px;width:30px;height:30px;border:0;background:none;color:#f3efe6;font:22px/1 system-ui;cursor:pointer';
      x.addEventListener('click', () => n.remove()); n.appendChild(x); document.body.appendChild(n);
    }, 1500);
  }

  const orig = world.update.bind(world);
  world.update = (dt, focus) => {
    const a = performance.now(); st.frame(a);
    if (st.paint) { R.info.reset(); }
    gt?.begin();
    orig(dt, focus);
    gt?.end(); gt?.poll();
    if (st.paint) { calls.c = R.info.render.calls; calls.t = R.info.render.triangles; }
    winCpu += performance.now() - a;
  };
  world._quality = st;
  installPerf3(world, st);
  st.log(`start tier ${st.tier} render ${st.ratio}${gpu.soft ? ' (software)' : gpu.weak ? ' (weak gpu)' : ''}`);
  return st;
}

/* The game clock's delta: one rAF, clamped. A lone long frame (a hitch three times the running frame time) advances the
   game by at most 50 ms, so a hitch is a pause, not a jump; a machine that is slow all the time still gets up to 100 ms. */
export function makeClock() {
  let last = performance.now(); let avg = 16.7;
  return (now) => {
    const raw = Math.max(0, now - last); last = now;
    const spike = raw > Math.max(50, avg * 3);
    if (!spike) avg += (raw - avg) * 0.1; else avg += (Math.min(raw, 100) - avg) * 0.02;
    return Math.min(spike ? 0.05 : 0.1, raw / 1000);
  };
}

/* Lights that a boss brings (a slam light, a lantern, the dragon's fire) change the light count, and the light count is part
   of every lit program's key: the first frame drawn with them linked every material in the scene again (40 to 50 programs,
   0.3 to 1.9 s frames when the boss came). warmNewLights() links the new variants in the background first: the new lights
   are on for the compile only, then off (old programs, already linked) until the new ones are ready, then on again. */
export function lightSet(scene) { const s = new Set(); scene.traverse((o) => { if (o.isLight) s.add(o); }); return s; }
export async function warmNewLights(renderer, scene, camera, before, ms = 3000, show = []) {
  /* show: hidden groups (the dragon before start()) that are on for the compile call only, so their lights count */
  if (!renderer?.compileAsync || !scene || !camera || !before) return;
  const fresh = []; scene.traverse((o) => { if (o.isLight && !before.has(o) && (o.visible || o.userData.sqHold)) fresh.push(o); });
  if (!fresh.length) return;
  let job; const sv = show.map((o) => o.visible);
  for (const l of fresh) l.visible = true; for (const o of show) o.visible = true;
  try { job = renderer.compileAsync(scene, camera); } catch (err) { console.warn('light warm', err); for (const l of fresh) delete l.userData.sqHold; return; } finally { show.forEach((o, i) => { o.visible = sv[i]; }); }
  for (const l of fresh) l.visible = false;
  try { await Promise.race([job, new Promise((r) => setTimeout(r, ms))]); } catch (err) { console.warn('light warm', err); } finally { for (const l of fresh) { l.visible = true; delete l.userData.sqHold; } }
}
/* new lights stay off (and are not counted) until warmNewLights() has linked their programs */
export function holdNewLights(scene, before) { scene.traverse((o) => { if (o.isLight && !before.has(o) && o.visible) { o.userData.sqHold = true; o.visible = false; } }); }

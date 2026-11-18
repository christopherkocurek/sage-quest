/* geometry, light and post-chain speed-ups. */

/* The light loops of every lit material: a light whose colour at this pixel is zero (a spark light between hits, an unlit lamp, a lamp
   out of range, a rim light at 0) skips its whole BRDF. three.js r170 runs RE_Direct for every light of the scene on every lit pixel, lit or not;
   the fights keep 4 to 8 point lights at intensity 0 so that no light is ever added in play (a new light recompiles every lit program).
   The picture is the same to the bit: a zero colour adds zero. Called once, before any material compiles. */
import * as THREE from 'three';
export function patchLightLoops() {
  /* OFF by default (measured): the branch around each light's BRDF made the Metal shader compiler 4 to 7 times slower (link waits in the first
     15 s of a Dark fight: 0.8 s without, 6.3 s with, worst frame 3.4 s), which costs far more than the 0.5 ms a frame it saves. ?lp=1 turns it on for a test. */
  if (THREE.ShaderChunk._sqLights || !/[?&]lp=1\b/.test(location.search)) return; THREE.ShaderChunk._sqLights = true;
  const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const src = THREE.ShaderChunk.lights_fragment_begin;
  if (!src.includes(call)) { console.warn('[sq] perf2: light loop not patched (three.js changed)'); return; }
  THREE.ShaderChunk.lights_fragment_begin = src.split(call).join(`if ( directLight.visible ) { ${call} }`);
  const pars = THREE.ShaderChunk.lights_pars_begin; const dir = 'light.visible = true;';
  if (pars.includes(dir)) THREE.ShaderChunk.lights_pars_begin = pars.replace(dir, 'light.visible = ( light.color != vec3( 0.0 ) );');
}
patchLightLoops();

/* The link gate. A shader program links in the background (KHR_parallel_shader_compile), but three.js blocks the frame until the link is done the first
   time a mesh with that program is drawn: a wave of new foes, a boss, a quest prop or a spell froze the picture for 0.3 to 0.7 s on Metal and for
   seconds on Direct3D. Here every object that joins the live scene has its programs started at once (R.compile, no wait), and the meshes whose
   programs are not ready yet are moved to a layer the camera does not draw. They come back on the first frame after the link is done (at most 5 s).
   The game logic never waits and `visible` is never touched, so nothing else changes: a new thing shows a few frames late, the frame never stalls.
   See the note in the function: off by default. */
export function installGate(world) {
  /* OFF by default (measured on Metal): the worst frames of a Dark fight did not get shorter (a program that slips past the gate waits behind
     every link the gate started), and the light gate and the fade variants made the queue longer. ?gate=1 turns the mesh gate on, ?gate=2 adds the light gate
     and the fade variants: for a test on Windows / Direct3D, where one link costs several times more. */
  let mode = 0; try { mode = Number(new URLSearchParams(location.search).get('gate')) || 0; } catch { /* no location */ } const off = mode < 1; const FULL = mode >= 2;
  if (off || !world || world._gate) return null;
  const R = world.renderer;
  if (!R.extensions?.get?.('KHR_parallel_shader_compile')) return null;
  const LOG = /[?&]gatelog=1/.test(location.search);
  const HMASK = 1 << 30; const queue = []; const waiting = []; const probe = new THREE.Object3D();
  const st = { held: 0, released: 0, timeouts: 0, batches: 0, lights: 0, waiting };
  const add0 = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...objs) {
    const r = add0.apply(this, objs);
    if (queue.length < 6000) { let p = this; while (p.parent) p = p.parent; if (p === world.scene) for (const o of objs) if (o && o.isObject3D && o.parent === this) queue.push(o); }
    return r;
  };
  const matReady = (m) => { const p = R.properties.get(m); const ps = p?.programs; if (!ps) return true; for (const prog of ps.values()) if (prog.isReady && !prog.isReady()) return false; return true; };
  /* The light gate. The number of lights (and of shadow-casting lights) is part of every lit program: one more light on, and every lit material of the
     scene needs a new program on that frame (a wave with a lantern, a spell light, a boss fire: 0.3 to 0.9 s). A light that comes on is kept on the
     hidden layer while the whole scene's programs for the new light count are built (a few meshes a frame) and linked, then it comes on. */
  const lightSet = new Set(); world.scene.traverse((o) => { if (o.isLight) lightSet.add(o); });
  let lastSet = null; let lastSig = ''; let lw = null; /* lw = { lights: [[light, mask]], list: [meshes], i, mats: Set, t0 } */
  const live = (o) => { let k = o; while (k) { if (k.visible === false) return false; if (k === world.scene) return true; k = k.parent; } return false; };
  const lightsNow = () => { const vis = []; let d = 0, pt = 0, sp = 0, h = 0, ds = 0, ps = 0, ss = 0; for (const l of lightSet) { if (!l.parent) { lightSet.delete(l); continue; } if (l.layers.mask !== 1 || !live(l)) continue; vis.push(l); if (l.isDirectionalLight) { d++; if (l.castShadow) ds++; } else if (l.isPointLight) { pt++; if (l.castShadow) ps++; } else if (l.isSpotLight) { sp++; if (l.castShadow) ss++; } else if (l.isHemisphereLight) h++; } return { vis, sig: `${d},${pt},${sp},${h},${ds},${ps},${ss}` }; };
  const showHeld = (on) => { for (const [l, mask] of lw.lights) if (on) { if (l.layers.mask === HMASK) l.layers.mask = mask; } else if (l.layers.mask === mask) l.layers.mask = HMASK; };
  const lightStep = (now) => {
    if (lw) {
      const t0 = performance.now();
      if (lw.i < lw.list.length) { showHeld(true);
        try { while (lw.i < lw.list.length && performance.now() - t0 < 14) { probe.children = lw.list.slice(lw.i, lw.i + 24); lw.i += 24; for (const m of R.compile(probe, world.camera, world.scene)) lw.mats.add(m); } } catch (err) { console.warn('[sq] gate', err); lw.i = lw.list.length; } finally { probe.children = []; showHeld(false); }
        return; }
      let ready = true; try { for (const m of lw.mats) { if (matReady(m)) lw.mats.delete(m); else { ready = false; break; } } } catch { ready = true; }
      if (!ready && now - lw.t0 < 8000) return;
      if (!ready) st.timeouts++;
      showHeld(true); st.lights += lw.lights.length; if (LOG) console.log(`[gate] t=${(now / 1000).toFixed(1)} ${lw.lights.length} light(s) on after ${(now - lw.t0).toFixed(0)} ms (${lw.list.length} meshes)`); lw = null;
      const c = lightsNow(); lastSet = new Set(c.vis); lastSig = c.sig; return;
    }
    const c = lightsNow();
    if (lastSet === null || c.sig === lastSig) { lastSet = new Set(c.vis); lastSig = c.sig; return; }
    const fresh = c.vis.filter((l) => !lastSet.has(l));
    if (!fresh.length) { lastSet = new Set(c.vis); lastSig = c.sig; return; } /* a light went out or a shadow flag changed: nothing to hold */
    const list = []; world.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material) list.push(o); });
    lw = { lights: fresh.map((l) => [l, l.layers.mask]), list, i: 0, mats: new Set(), t0: now }; showHeld(false);
  };
  const step = () => {
    const now = performance.now();
    try { if (FULL) lightStep(now); } catch (err) { console.warn('[sq] gate', err); if (lw) { showHeld(true); lw = null; } }
    for (let i = waiting.length - 1; i >= 0; i--) {
      const w = waiting[i]; let ready = true; let late = false;
      try { for (const m of w.mats) if (!matReady(m)) { ready = false; break; } } catch { ready = true; }
      if (!ready && now - w.t0 > 5000) { late = true; st.timeouts++; }
      if (ready || late) { for (const [o, mask] of w.meshes) if (o.layers.mask === HMASK) o.layers.mask = mask; st.released += w.meshes.length; waiting.splice(i, 1); }
    }
    if (!queue.length) return;
    const meshes = []; const fading = []; const batch = queue.splice(0, queue.length);
    for (const root of batch) { if (!root.parent) continue; let skin = false; const own = [];
      root.traverse((o) => { if (o.isLight) lightSet.add(o); if (o.isSkinnedMesh) skin = true; if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material && o.layers.mask === 1 && !o.userData.sqNoGate) own.push(o); });
      for (const o of own) meshes.push(o); if (skin) for (const o of own) if (o.isMesh) fading.push(o); }
    if (!meshes.length) return;
    let mats = null; probe.children = meshes;
    try { mats = R.compile(probe, world.camera, world.scene); } catch (err) { console.warn('[sq] gate', err); } finally { probe.children = []; }
    if (!mats) return;
    /* a body and what it wears fade in and out (material.transparent flips): that is another program in three.js (the OPAQUE define).
       Start that one now too, so the first fade of a foe or a boss does not wait for a link. */
    if (FULL && fading.length) {
      const flip = []; for (const o of fading) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.isMeshStandardMaterial && m.transparent === false && !flip.includes(m)) flip.push(m);
      if (flip.length) { for (const m of flip) { m.transparent = true; m.needsUpdate = true; }
        probe.children = fading; try { for (const m of R.compile(probe, world.camera, world.scene)) mats.add(m); } catch (err) { console.warn('[sq] gate', err); } finally { probe.children = []; for (const m of flip) { m.transparent = false; m.needsUpdate = true; } } }
    }
    const pend = new Set(); try { for (const m of mats) if (!matReady(m)) pend.add(m); } catch { return; }
    if (!pend.size) return;
    const held = [];
    for (const o of meshes) { if (o.layers.mask !== 1) continue; const mm = Array.isArray(o.material) ? o.material : [o.material]; if (mm.some((m) => pend.has(m))) { held.push([o, o.layers.mask]); o.layers.mask = HMASK; } }
    if (held.length) { waiting.push({ meshes: held, mats: pend, t0: now }); st.held += held.length; st.batches++; }
    if (LOG) console.log(`[gate] t=${(now / 1000).toFixed(1)} batch ${batch.length} roots, ${meshes.length} meshes, ${pend.size} programs pending, ${held.length} held, lights in batch ${batch.reduce((n, r) => { r.traverse((o) => { if (o.isLight) n++; }); return n; }, 0)}, programs ${R.info.programs.length}: ${batch.slice(0, 4).map((r) => r.name || r.type).join(',')}`);
  };
  let lastL = '';
  const render0 = R.render.bind(R); let busy = false;
  R.render = function (scene, camera) {
    if (scene === world.scene && !busy) { busy = true; try { step(); } catch (err) { console.warn('[sq] gate', err); } finally { busy = false; } }
    if (LOG && scene === world.scene) { let k = ''; scene.traverseVisible((o) => { if (o.isLight) k += o.type[0] + (o.castShadow ? '*' : ''); }); if (k !== lastL) { const all = []; scene.traverseVisible((o) => { if (o.isLight) { let path = ''; let q = o; for (let d = 0; d < 4 && q; d++) { path += `/${q.name || q.type}`; q = q.parent; } all.push(`${o.type[0]}#${o.id}${path} dist=${o.distance ?? ''} i=${(+o.intensity).toFixed(1)}`); } }); const prev = window.__gl || []; console.log(`[gate] t=${(performance.now() / 1000).toFixed(1)} lights ${lastL} -> ${k}, programs ${R.info.programs.length}; NEW: ${all.filter((x) => !prev.some((y) => y.split(' ')[0] === x.split(' ')[0])).join(' ; ')}`); window.__gl = all; lastL = k; } if (R.info.programs.some((p) => p.isReady && !p.isReady())) { const bad = []; scene.traverseVisible((o) => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material || !o.layers.test(camera.layers)) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const pp = R.properties.get(m); const cp = pp?.currentProgram; if (cp && cp.isReady && !cp.isReady()) { let path = ''; let k = o; for (let d = 0; d < 4 && k; d++) { path += `/${k.name || k.type}`; k = k.parent; } bad.push(`${m.name || m.type}(v${m.version},${pp.programs?.size}p) on ${path}${o.isInstancedMesh ? ' [inst]' : ''}${o.isSkinnedMesh ? ' [skin]' : ''}`); } } }); if (bad.length) console.log(`[gate] t=${(performance.now() / 1000).toFixed(1)} DRAWN WITH A PENDING PROGRAM (${bad.length}): ${[...new Set(bad)].slice(0, 8).join(' ; ')}`); }
      const n0 = R.info.programs.length; const t0 = performance.now(); const out = render0(scene, camera); const dt = performance.now() - t0; if (dt > 40) console.log(`[gate] t=${(t0 / 1000).toFixed(1)} render ${dt.toFixed(0)} ms, programs ${n0} -> ${R.info.programs.length}: ${R.info.programs.slice(n0).map((p) => `${p.name}#${p.id}${/USE_SKINNING/.test(p.cacheKey) ? '' : ''}`).join(' ')} | notReady ${R.info.programs.filter((p) => p.isReady && !p.isReady()).length}`); return out; }
    return render0(scene, camera);
  };
  world._gate = st; return st;
}

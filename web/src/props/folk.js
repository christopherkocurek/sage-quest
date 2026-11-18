/* The companions outside the dark world: real people and a real dog, not spirits.
   makeFolk(scene, names, { kinds, kit, WP, accent }) -> the same handle as questprops makeCompanions:
     { list: [{ name, kind, object3D, position, state, setState(s), i }], update(dt, clock, camera), dispose() }
   person = a knight-rig actor in the world's traveller wear (kit.traveller), in muted colours, face covered as every
            character is; it walks, jogs, idles and sits by a fire with the rig's clips.
   animal = a solid, simply shaded hound in a natural colour (code-built), trotting, sitting, lying by a fire.
   flame  = a cause, not a person (the player named no one): the world's own small thing (WP.cause), carried along.
   States from the fight: with | return | hearth (by the fire) | taking/taken (drawn away: fades out) | held | boss (gone) */
import * as THREE from 'three';
import { makeActor, KNIGHT_URL, worldWear } from '../world.js';
import { worldById } from '/game/worlds.mjs';
import { buildDog, poseDog } from './dog.js'; /* one dog for every world */

const CAUSES = new Set(['hearth', 'the debt', 'your name', 'the open road', 'the far light']);
/* a world swaps 'the open road' for its own road ('The open trail', 'The open street'): still a cause, not a person */
const isCause = (name) => { const n = String(name).trim().toLowerCase(); return CAUSES.has(n) || /^the open /.test(n); };
const TAU = Math.PI * 2;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const _c = new THREE.Vector3(); const _d = new THREE.Vector3(); const _h = new THREE.Vector3();
/* every live folk handle (companions, the road's crowds, the kept stranger), so the near-frame system
   (web/src/nearcam.js) can keep each body out of the lens */
export const FOLK_LIVE = new Set();
const NEAR_ON = () => !!window.__sq?.fight?.near;

/* muted cloth per companion, so two people never wear the same */
const MUTE = [0x5a5048, 0x4a5258, 0x584a3e];
/* the companions wear a friendly palette per world that no foe of that world wears
   (storybook brigands are oxblood and black, edo bandits and frontier outlaws are dark browns, neon foes are black).
   A world entry may set its own: `folk: { cloth: [a, b, c], wear: [...] }` (wear replaces the traveller wear list). */
const FOLK_CLOTH = {
  storybook: [0x2c5aa8, 0x3a7a3e, 0x2a6a7a], /* cornflower blue, meadow green, teal */
  edo: [0x2c3f78, 0x4a6a3a, 0x6a3a5a], /* indigo, moss, plum (never the lord's red and black) */
  frontier: [0x3a5478, 0x5a6a3a, 0x7a4a5a], /* denim blue, sage, faded rose */
  neon: [0x1f6a72, 0x3a6a3a, 0x5a4a7a], /* teal, olive, lilac */
  dark: MUTE,
};
/* a traveller look with a hat and no head piece gets the world's head */
const HAT = /^(Helm_|Hat|Eboshi|Kasa)/; const HEADS = /^(Face|Head_)/;
/* edo: the straw kasa hid the whole head from behind; Wren wears a topknot and a headband instead, so his head
   reads from every side and he is never taken for the ronin hero or a kasa bandit */
const FOLK_WEAR = { edo: ['Face', 'Hair_knot', 'Headband', 'Kimono', 'Hakama', 'Wraps'] }; /* no Mask_cloth: in the companion's colour it read as a shinobi hood */

/* the road's people (journey.js crowd) wear their own palette (warm earths and
   creams, never a companion's blue, green or teal and never a foe's colours) and one of three body and headwear looks per
   world; each also gets a slightly different height and build */
const CROWD_CLOTH = {
  storybook: [0xc8a040, 0x9a6a9a, 0xe2d8c0, 0xc06a2a, 0x7a5a3a],
  edo: [0xb88a3a, 0x6a8aa8, 0xd8ccb0, 0x8a6a4a, 0x9a8a5a],
  frontier: [0xb89040, 0xa0522d, 0xd8c8a8, 0x5a6070, 0x8a7a5a],
  neon: [0xc89a3a, 0x9a3a7a, 0x8a8e96, 0xd8d0c0, 0x6a5a8a],
  dark: [0x6a5a48, 0x5a5a62, 0x7a6a50],
};
const CROWD_WEAR = {
  storybook: [['Face', 'Gown', 'Belt'], ['Face', 'Surcoat', 'Belt', 'Boots'], ['Face', 'Tunic', 'Cape', 'Boots']],
  edo: [['Face', 'Hair_knot', 'Kimono', 'Wraps'], ['Face', 'Eboshi', 'Kimono', 'Hakama'], ['Face', 'Hair_wild', 'Kimono_open', 'Hakama']],
  frontier: [['Face', 'Hat_bowler', 'Shirt', 'Vest', 'Trousers', 'Boots'], ['Face', 'Hat_flat', 'Shirt', 'Apron', 'Trousers', 'Boots'], ['Face', 'Hat_slouch', 'Poncho', 'Trousers', 'Boots']],
  neon: [['Jacket', 'Cap_knit', 'Trousers', 'Boots'], ['Coat_long', 'Goggles', 'Trousers', 'Boots'], ['Vest', 'Backpack', 'Trousers', 'Boots', 'Gloves']],
};
function labelSprite(name, font, ink) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const g = cv.getContext('2d');
  g.font = `500 26px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.65)'; g.strokeText(String(name).slice(0, 18), 128, 24);
  g.fillStyle = ink; g.fillText(String(name).slice(0, 18), 128, 24);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, fog: false })); sp.scale.set(0.9, 0.17, 1); sp.renderOrder = 9; /* drawn over the land, never cut to 'Ta' by grass or a hat brim */
  return sp;
}

/* ---------- the hound: smooth parts in one furred material (two-tone by vertex colour: dark back, pale belly);
   legs swing at the hips. Per world coat: world entry `folk.hound = { coat: [back, side], belly, collar, glow, ears }`,
   else HOUNDS below. ---------- */
const HOUNDS = {
  dark: { coat: [0x2c2622, 0x4a3e34], belly: 0x8a7a68, collar: 0x4a2e1a, ears: 'drop' },
  neon: { coat: [0x1e1b19, 0x3a3430], belly: 0x5a5248, collar: 0x3ef2ff, glow: true, ears: 'up' },
  frontier: { coat: [0x4a3020, 0x7a5434], belly: 0xc8b090, collar: 0x8a2a1e, ears: 'up' },
  storybook: { coat: [0x9a6a32, 0xc8964e], belly: 0xf0dcb4, collar: 0x2a4a9a, ears: 'drop' },
  edo: { coat: [0x8a4a1e, 0xb8743a], belly: 0xf2e6d2, collar: 0xa02a20, ears: 'up' },
};
let FUR_TEX = null;
function furTex() {
  if (FUR_TEX) return FUR_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 256, 256);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { const x = r() * 256; const y = r() * 256; const l = 4 + r() * 9; const v = r() < 0.5 ? 150 + r() * 60 : 235 + r() * 20; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y + l); g.stroke(); }
  FUR_TEX = new THREE.CanvasTexture(cv); FUR_TEX.wrapS = FUR_TEX.wrapT = THREE.RepeatWrapping; FUR_TEX.repeat.set(3, 3); FUR_TEX.colorSpace = THREE.SRGBColorSpace;
  return FUR_TEX;
}
function makeHound(look) {
  const L = { ...HOUNDS.dark, ...look };
  const geos = []; const mats = [];
  const fur = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, map: furTex(), roughness: 0.88, metalness: 0, sheen: 0.6, sheenRoughness: 0.55, sheenColor: new THREE.Color(L.coat[1]).lerp(new THREE.Color(0xffffff), 0.35) });
  const nose = new THREE.MeshStandardMaterial({ color: 0x120e0c, roughness: 0.35 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.12, metalness: 0.1 });
  const band = new THREE.MeshStandardMaterial({ color: L.collar, roughness: 0.6, emissive: L.glow ? L.collar : 0x000000, emissiveIntensity: L.glow ? 1.6 : 0 });
  mats.push(fur, nose, eye, band);
  const furs = []; const M = { fur, nose, eye, collar: band };
  const D = buildDog((geo, parent, part) => { geos.push(geo); const m = new THREE.Mesh(geo, M[part] || fur); m.castShadow = true; parent.add(m); if (part === 'fur') furs.push(m); return m; }, { ears: L.ears });
  const g = D.root;
  /* two-tone coat: the back dark, the flanks the main coat, the belly, chest, legs low down and the muzzle pale */
  g.updateMatrixWorld(true);
  const back = new THREE.Color(L.coat[0]); const side = new THREE.Color(L.coat[1] ?? L.coat[0]); const pale = new THREE.Color(L.belly);
  const nm = new THREE.Matrix3(); const n = new THREE.Vector3(); const p = new THREE.Vector3(); const c = new THREE.Color();
  for (const m of furs) {
    const geo = m.geometry; if (geo.attributes.color) continue; nm.getNormalMatrix(m.matrixWorld);
    const P = geo.attributes.position; const N = geo.attributes.normal; const out = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); p.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
      const up = n.y; const low = THREE.MathUtils.smoothstep(p.y, 0.05, 0.16);
      c.copy(side).lerp(back, THREE.MathUtils.smoothstep(up, 0.35, 0.85) * THREE.MathUtils.smoothstep(p.y, 0.45, 0.6));
      const pl = Math.max(THREE.MathUtils.smoothstep(-up, 0.3, 0.75) * 0.85, (1 - low) * 0.9, p.z > 0.6 && p.y < 0.86 && p.y > 0.7 ? 0.7 : 0, p.z > 0.25 && p.z < 0.42 && p.y < 0.55 && up < 0.2 ? 0.65 : 0);
      c.lerp(pale, pl);
      out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  }
  return { g, D, geos, mats };
}

export function makeFolk(scene, names = [], { kinds, kit, WP, accent = 0xffa060, nearFade = !!WP /* the fight and the walk pass WP; the camp does not and frames its figure on purpose */, crowd = false } = {}) {
  const root = new THREE.Group(); scene.add(root);
  const entry = worldById(kit?.id || 'dark'); const ui = entry.ui || kit?.ui || {}; const font = ui.sans || ui.serif || 'Georgia, serif'; const ink = ui.cream || '#efe6d4';
  const trav = entry.traveller || null; let camera = null; let dead = false;
  const list = names.slice(0, 3).map((name, i) => {
    let kind = (kinds && kinds[i]) || 'person'; if (isCause(name)) kind = 'flame';
    const object3D = new THREE.Group(); root.add(object3D);
    const inner = new THREE.Group(); object3D.add(inner);
    const label = labelSprite(name, font, ink); label.position.y = kind === 'animal' ? 1.05 : kind === 'flame' ? 1.75 : 2.15; object3D.add(label);
    if (kind === 'flame') { label.visible = false; }
    const c = { name, kind, object3D, position: object3D.position, state: 'with', i, inner, label, mood: null, focus: null, yaw: 0, vel: new THREE.Vector3(), last: new THREE.Vector3(), first: true, speed: 0, still: 0, vis: 1, rest: 0, t: Math.random() * 10, clip: '' };
    c.setState = (s) => { c.state = s; };
    if (kind === 'person') {
      makeActor(KNIGHT_URL).then(async (a) => {
        if (dead) { a.dispose(); return; }
        const look = trav ? { ...trav } : { armor: false, under: 'cloth', cloth: 0x3a3430 };
        const fw = entry.folk?.wear || (trav?.wear && FOLK_WEAR[kit?.id]);
        if (Array.isArray(fw)) look.wear = [...fw];
        else if (Array.isArray(look.wear) && look.wear.some((w) => HAT.test(w)) && !look.wear.some((w) => HEADS.test(w))) look.wear = ['Face', ...look.wear];
        if (look.wear && worldWear()) { try { await a.wear(worldWear()); } catch (err) { console.warn('folk wear', err); } }
        if (dead) { a.dispose(); return; }
        let pal = [].concat(entry.folk?.cloth ?? FOLK_CLOTH[kit?.id] ?? MUTE);
        if (crowd) { const cw = CROWD_WEAR[kit?.id]; const v = (i * 7 + Math.floor(Math.random() * 3)) % 3; if (cw && worldWear()) look.wear = [...cw[v]]; pal = CROWD_CLOTH[kit?.id] || CROWD_CLOTH.dark; const sc = 0.93 + Math.random() * 0.12; object3D.scale.set(sc * (0.95 + Math.random() * 0.1), sc, sc * (0.95 + Math.random() * 0.1)); look.under = [0x4a3a2a, 0x3a3a40, 0x5a4a38][v]; }
        a.look({ eye: 0x000000, eyePower: 0, vary: false, ...look, cloth: pal[(crowd ? i * 3 + Math.floor(Math.random() * 5) : i) % pal.length] });
        a.eyes?.(0);
        inner.add(a.root); c.actor = a; a.play('Idle', { fade: 0 }); c.clip = 'Idle';
        /* the name sits over the head of this world's figure (a tall hat or hood put the 2.15 m label on the face) */
        /* measured from the head bone (a skinned mesh's box is its bind pose and read 3.9 m in storybook) */
        try { const hb = a.root.getObjectByName('head') || a.root.getObjectByName('Head'); if (hb) { object3D.updateWorldMatrix(true, true); const hp = hb.getWorldPosition(new THREE.Vector3()); const y = object3D.worldToLocal(hp).y; if (Number.isFinite(y) && y > 1 && y < 2.6) label.position.y = clamp(y + 0.45, 2.15, 2.6); } } catch { /* keep 2.15 */ }
      }).catch((err) => console.warn('folk', err));
    } else if (kind === 'animal') {
      const H = makeHound({ ...(HOUNDS[kit?.id] || HOUNDS.dark), ...(entry.folk?.hound || {}) }); inner.add(H.g); c.hound = H;
    } else if (WP?.cause) {
      try {
        const h = WP.cause(scene, { name }); h.group.removeFromParent();
        /* a cause that stands on the ground by itself (frontier: a lamp on a crook post) is not lifted again;
           a small thing (a lantern, a drone, a bird) floats at the shoulder */
        const bb = new THREE.Box3().setFromObject(h.group); h.stands = !bb.isEmpty() && bb.min.y > -0.1 && bb.min.y < 0.3 && bb.max.y - bb.min.y > 1.5;
        h.group.position.y = h.stands ? 0 : 1.3; if (h.stands) label.position.y = bb.max.y + 0.35; inner.add(h.group); c.cause = h;
      } catch (err) { console.warn('folk cause', err); }
    }
    return c;
  });
  const clipFor = (c) => {
    /* journey.js sets c.mood = { clip, until, move } (a nod at a find, a crouch when a foe comes, a cheer);
       a mood with move: false holds only while the companion stands */
    if (c.mood && c.t < c.mood.until && (c.mood.move || c.speed < 0.6)) return c.mood.clip;
    if (c.state === 'hearth' && c.rest > 0.5) return 'Sitting_Idle_Loop';
    if (c.speed > 3.2) return 'Jog_Fwd_Loop'; if (c.speed > 0.35) return 'Walk_Loop'; return 'Idle';
  };
  const handle = {
    list,
    update(dt, clock, cam) {
      if (cam) camera = cam;
      for (const c of list) {
        c.t += dt;
        if (c.first) { c.last.copy(c.position); c.first = false; }
        _c.subVectors(c.position, c.last); c.last.copy(c.position);
        if (dt > 0) c.vel.lerp(_d.copy(_c).divideScalar(Math.max(dt, 1e-3)), 1 - Math.exp(-dt * 8));
        const hs = Math.hypot(c.vel.x, c.vel.z); c.speed = damp(c.speed, Math.min(hs, 9), 6, dt);
        c.still = c.speed < 0.25 ? c.still + dt : 0;
        c.rest = damp(c.rest, (c.state === 'hearth' || c.state === 'with' || c.state === 'return') && c.still > 1.2 ? 1 : 0, c.still > 1.2 ? 2 : 8, dt);
        /* drawn away (taking, taken, held over the fight): the figure fades out where it stood; back on return */
        const gone = c.state === 'taking' || c.state === 'taken' || c.state === 'held' || c.state === 'boss';
        /* no distance fade any more (it left a see-through body in the lens): in a fight or a walk the near-frame
           system (web/src/nearcam.js) moves a body out of the view cone or hides it whole, by layer, while it is inside */
        const camD0 = camera && !NEAR_ON() ? (camera.getWorldPosition(_c), Math.hypot(_c.x - c.position.x, _c.z - c.position.z)) : 6; const nearK = nearFade && c.kind === 'person' ? clamp((camD0 - 1.7) / 0.5, 0, 1) : nearFade && c.kind === 'animal' ? clamp((camD0 - 2.0) / 0.4, 0, 1) : 1; /* the old ramp, only with the system off (?near=0, for comparison) */
        c.vis = damp(c.vis, gone ? 0 : nearK, gone ? 2.5 : nearK < c.vis ? 8 : 3, dt); object3D_vis(c);
        /* heading: along the motion; when still, toward the hero, a little aside */
        let want = c.yaw;
        if (c.speed > 0.3) want = Math.atan2(c.vel.x, c.vel.z);
        else if (c.focus && c.t < (c.focus.until ?? 1e9)) want = Math.atan2(c.focus.x - c.position.x, c.focus.z - c.position.z);
        else if (camera) { camera.getWorldPosition(_c); want = Math.atan2(_c.x - c.position.x, _c.z - c.position.z) + (c.kind === 'animal' ? (c.i % 2 ? 1.1 : -1.1) : (c.i % 2 ? -0.4 : 0.4)); }
        let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * (1 - Math.exp(-dt * 5)); c.inner.rotation.y = c.yaw;
        const camD = camera ? camera.getWorldPosition(_c).distanceTo(c.position) : 6;
        c.label.material.opacity = c.label.visible ? c.vis * clamp((camD - 1.8) / 1.5, 0, 1) * clamp((24 - camD) / 6, 0, 1) * 0.9 * (c.labelK ?? 1) : 0;
        if (c.actor) {
          c.actor.mixer.update(dt);
          const want2 = clipFor(c); if (want2 !== c.clip) { c.actor.play(want2, { fade: 0.3 }); c.clip = want2; }
          /* the name rides the head bone every frame (sitting by the fire, crouching, leaning), not a height set once */
          if (c.hb === undefined) c.hb = c.actor.root.getObjectByName('head') || c.actor.root.getObjectByName('Head') || null;
          if (c.hb && c.label.visible) { c.actor.root.updateWorldMatrix(true, true); c.hb.getWorldPosition(_h); c.object3D.worldToLocal(_h); if (Number.isFinite(_h.y) && _h.y > 0.3 && _h.y < 3) c.label.position.set(_h.x, _h.y + 0.42, _h.z); }
          c.actor.setSpeed(c.clip === 'Walk_Loop' || c.clip === 'Jog_Fwd_Loop' ? clamp(c.speed / (c.clip === 'Walk_Loop' ? 1.6 : 4.2), 0.6, 1.6) : 1);
        } else if (c.hound) {
          /* one dog (buildDog / poseDog): it walks with its legs, sits upright when it stops, lies like a sphinx by the
             fire (head up, ears moving, tail sweeping); a growl lowers the head, a wag shakes the tail */
          const alert = c.mood && c.t < c.mood.until ? c.mood.clip : null; const lie = c.state === 'hearth' ? c.rest : 0; const sit = c.state === 'hearth' || alert ? 0 : c.rest;
          let look = 0; if (camera && c.speed < 0.3) { camera.getWorldPosition(_c); let dd = Math.atan2(_c.x - c.position.x, _c.z - c.position.z) - c.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); look = clamp(dd, -0.9, 0.9); }
          poseDog(c.hound.D, { t: c.t, speed: c.speed, sit, lie, wag: c.state === 'with' || c.state === 'hearth' || c.state === 'return' ? 1.2 : 0.3, alert, look }, dt);
          /* the dog's name rides its head */
          if (c.label.visible) { c.hound.D.head.updateWorldMatrix(true, false); c.hound.D.head.getWorldPosition(_h); c.object3D.worldToLocal(_h); if (Number.isFinite(_h.y)) c.label.position.set(_h.x, _h.y + 0.36, _h.z); }
        } else if (c.cause) {
          c.cause.group.position.y = c.cause.stands ? 0 : 1.3 + Math.sin(c.t * 1.6 + c.i) * 0.06; c.cause.update?.(dt, { t: c.t });
        }
      }
    },
    dispose() {
      dead = true;
      for (const c of list) {
        try { c.actor?.dispose(); } catch { /* gone */ }
        if (c.hound) { for (const g of c.hound.geos) g.dispose(); for (const m of c.hound.mats) m.dispose(); }
        try { c.cause?.dispose(); } catch { /* gone */ }
        c.label.material.map.dispose(); c.label.material.dispose();
      }
      root.removeFromParent(); FOLK_LIVE.delete(handle);
    },
  };
  FOLK_LIVE.add(handle);
  return handle;
}
/* fade a companion (actor, hound or cause) by c.vis; the label follows in update */
function object3D_vis(c) {
  const k = c.vis; c.object3D.visible = k > 0.02;
  if (c.actor) { if (k < 0.99 || c.faded) { c.actor.fade(k); c.faded = k < 0.99; } }
  else if (c.hound) { if (k < 0.99 || c.faded) { for (const m of c.hound.mats) { const tr = k < 0.99; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = k; } c.faded = k < 0.99; } }
  else if (c.cause) c.cause.group.visible = k > 0.5;
}

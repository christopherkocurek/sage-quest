/* A far figure for a world's skyNemesis: the real knight rig in the nemesis's own wardrobe, as one
   dark rim-lit silhouette on the horizon, so the outline is a man's (neck, shoulders, coat, hat brim, hands), not a stack
   of capsules. skyFigure(ctx, opts) -> { object, update(dt, t), dispose(), dist } for world.js worldSkyNemesis.
   What every figure gets (cheap: one skinned actor, a few sprites, no lights, no extra passes):
   - the nemesis look (wear parts) in ctx.sil() materials (they fade with the line); the cloth parts named in opts.wind
     move in a wind (a vertex sway that grows toward the hem, gusting);
   - a clip slowed right down, a wide still stance (opts.stance), and a head that turns to the walker and holds there,
     now and then looks away over the land and comes back;
   - a weapon held low (opts.weapon builds it in metres at human size, grip at the origin, in the figure's frame; it
     follows the hand);
   - feet on the land: the figure stands on scene.userData.groundAt under it, sunk a little into the dust; dust that
     drifts across the feet; opts.extras() adds world props (an ember, a smoke wisp, a glint).
   The camp may pose the figure (camp.js placeEnemy scales the holder): then the land offset is skipped.
   Dense one-line code uses block comments only. */
import * as THREE from 'three';
import { makeActor, KNIGHT_URL } from '../world.js';

const _p = new THREE.Quaternion(); const _q = new THREE.Quaternion(); const _l = new THREE.Quaternion();
const _v = new THREE.Vector3(); const _w = new THREE.Vector3(); const _f = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);

/* turn a bone about a WORLD axis (after the mixer): the bone's own local frame does not matter */
export function turnWorld(bone, axis, angle) {
  if (!bone?.parent || !angle) return;
  bone.parent.getWorldQuaternion(_p);
  _q.setFromAxisAngle(axis, angle);
  _l.copy(_p).invert().multiply(_q).multiply(_p);
  bone.quaternion.premultiply(_l);
}

let SOFT = null;
/* a soft round puff (shared by every figure) */
export function softTex() {
  if (SOFT) return SOFT;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  SOFT = new THREE.CanvasTexture(c); SOFT.colorSpace = THREE.SRGBColorSpace; return SOFT;
}

/* the wind on a cloth silhouette, chained onto its own shader (the rim). Bind space: y up in metres of the rig, the
   hem low and the shoulders high; the sway grows toward the hem and blows to the figure's side (+x) and back (-z). */
function addWind(mat, U, { top, bottom, amp }) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.sqWindT = U.t;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float sqWindT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float wk = smoothstep(${top.toFixed(3)}, ${bottom.toFixed(3)}, position.y); wk *= wk;
          float gust = 0.6 + 0.4 * sin(sqWindT * 0.53 + 1.3) * sin(sqWindT * 0.21);
          float flap = sin(sqWindT * 2.1 + position.y * 7.0 + position.x * 4.0) * 0.3 + sin(sqWindT * 3.7 + position.y * 12.0 - position.z * 6.0) * 0.12;
          transformed.x += wk * ${amp.toFixed(3)} * (gust + flap);
          transformed.z -= wk * ${(amp * 0.55).toFixed(3)} * (gust + flap * 0.8) * (0.6 + 0.4 * sign(-position.z));
          transformed.y += wk * ${(amp * 0.2).toFixed(3)} * gust; }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sq-wind${top}|${bottom}|${amp}`;
}

/* opts: { look, wearUrl, height (m, boots to hat top), dist, clip, speed, color, wind: [parts], windAmp, windTop, windBottom,
   stance (rad: each thigh out), arms [l, r] (rad: each upper arm out from the coat), lean (rad: the chest forward), weapon(T, mat, geos) -> Object3D, hand ('hand_r'),
   weaponRot [x, y, z] (in the figure's frame), dust (hex | null), dustN, dustOp, sink (share of height), track (false: no
   head turn), wide (x scale), extras({ add, fig, sprite, H, B, geos, body, fade, headPos }) -> { update(dt, t, f), dispose() } } */
export async function skyFigure(ctx, o) {
  const T = ctx.THREE || THREE;
  const actor = await makeActor(KNIGHT_URL);
  actor.noBlob = true;
  if (o.wearUrl) await actor.wear(o.wearUrl);
  actor.look({ ...o.look, eye: 0x000000, eyePower: 0, vary: false });
  for (const m of actor.parts.get('Eyes') || []) m.visible = false;
  const g = new T.Group(); const fig = new T.Group(); g.add(fig); fig.add(actor.root);
  const B = (n) => actor.model.getObjectByName(n);
  const clip = o.clip && actor.has(o.clip) ? o.clip : 'Idle_Loop';
  actor.play(clip, { speed: o.speed ?? 0.45, fade: 0 });
  /* the clip starts at its own phase, so two figures never breathe in step */
  actor.mixer.update(0.3 + Math.random() * 1.5);
  actor.root.updateMatrixWorld(true);
  /* the man's height from his bones (a skinned box is the bind pose): boots to the head, plus the hat */
  const foot = B('foot_l'); const head = B('Head'); actor.root.updateMatrixWorld(true);
  const yFoot = Math.min(foot ? foot.getWorldPosition(_v).y : 0, B('foot_r')?.getWorldPosition(_w).y ?? 0) - 0.09;
  const yHead = (head ? head.getWorldPosition(_v).y : 1.7) + (o.crown ?? 0.32);
  const s = o.height / Math.max(0.1, yHead - yFoot);
  actor.root.scale.multiplyScalar(s); actor.root.position.y = -yFoot * s;
  if (o.wide) fig.scale.x = o.wide;
  const H = o.height;
  /* side: metres across the line (a figure beside a landmark that stands on the line) */

  /* materials: one body silhouette, one cloth (double side), one wind cloth for the coat */
  const U = { t: { value: 0 } };
  const tone = o.color ?? 0x15120f;
  const dull = { metalness: 0, roughness: 1, envMapIntensity: 0.08 };
  const body = ctx.sil({ color: tone, ...dull });
  const cloth = ctx.sil({ color: tone, side: T.DoubleSide, ...dull });
  const windy = ctx.sil({ color: tone, side: T.DoubleSide, ...dull });
  addWind(windy, U, { amp: o.windAmp ?? 0.14, top: o.windTop ?? 1.1, bottom: o.windBottom ?? 0.3 });
  const wind = new Set(o.wind || []);
  /* opts.material(T, U) -> one material for the whole figure (a hologram); it must sit in ctx.mats to fade */
  const own = o.material ? o.material(T, U) : null;
  for (const m of actor.meshes) {
    m.castShadow = false; m.receiveShadow = false;
    m.material = own || (wind.has(m.userData.part) ? windy : (m.material.side === T.DoubleSide ? cloth : body));
  }
  /* the hidden parts (the knight plate, the boss parts, unworn wardrobe) leave the graph: the camp sizes a posed figure by
     its Box3, which counts hidden meshes too (the bind-pose boss helms made the Baron's box 60 m for a 40 m man, so the
     title camp sank him behind the ridge with only his hat showing) */
  for (const m of actor.meshes) if (!m.visible) m.removeFromParent();
  const geos = [];
  /* the weapon, in the root's frame (metres at human size): it follows the hand, its angle stays set */
  const hand = B(o.hand || 'hand_r'); let weapon = null;
  if (o.weapon) { weapon = o.weapon(T, own || body, geos); if (weapon) { actor.root.add(weapon); weapon.rotation.set(...(o.weaponRot || [0, 0, 0])); } }
  /* an offhand (a shield) the same way, on the left hand */
  const handL = B('hand_l'); let offhand = null;
  if (o.offhand) { offhand = o.offhand(T, own || body, geos); if (offhand) { actor.root.add(offhand); offhand.rotation.set(...(o.offhandRot || [0, 0, 0])); } }

  /* the camera, read at draw time (ctx has none): the figure looks at the one who walks */
  const cam = new T.Vector3(); let seen = false;
  const any = actor.meshes.find((m) => m.visible);
  if (any) any.onBeforeRender = (r, sc, camera) => { camera.getWorldPosition(cam); seen = true; };
  const neck = B('neck_01'); const spine = B('spine_03'); const thighs = [B('thigh_l'), B('thigh_r')]; const uarms = [B('upperarm_l'), B('upperarm_r')];
  let look = 0; let want = 0; let awayT = 6 + Math.random() * 6; let away = 0;
  const pose = () => {
    fig.getWorldQuaternion(_q); _f.set(0, 0, 1).applyQuaternion(_q);
    if (o.stance) { turnWorld(thighs[0], _f, -o.stance); turnWorld(thighs[1], _f, o.stance); }
    if (o.arms) { turnWorld(uarms[0], _f, o.arms[0]); turnWorld(uarms[1], _f, -o.arms[1]); }
    if (o.lean && spine) { _w.set(1, 0, 0).applyQuaternion(_q); turnWorld(spine, _w, o.lean); }
    if (o.track !== false && head) { turnWorld(neck || head, UPV, look * 0.4); turnWorld(head, UPV, look * 0.6); }
    o.pose?.(actor, B);
    if ((weapon && hand) || (offhand && handL)) actor.root.updateMatrixWorld(true);
    if (weapon && hand) { hand.getWorldPosition(_v); actor.root.worldToLocal(_v); weapon.position.copy(_v); }
    if (offhand && handL) { handL.getWorldPosition(_v); actor.root.worldToLocal(_v); offhand.position.copy(_v); }
  };
  const mu = actor.mixer.update.bind(actor.mixer);
  actor.mixer.update = (dt) => { const r = mu(dt); pose(); return r; };

  /* sprites (dust, smoke, embers): their opacity follows the line's fade (ctx.mats[0], the glow) */
  const sprites = []; const fade = () => (ctx.mats[0] ? ctx.mats[0].opacity : 1);
  const sprite = (color, size, { add = false, fog = true, map = softTex() } = {}) => {
    const m = new T.SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, fog, blending: add ? T.AdditiveBlending : T.NormalBlending });
    const sp = new T.Sprite(m); sp.scale.setScalar(size); sprites.push(sp); return sp;
  };
  const dust = [];
  if (o.dust != null) for (let i = 0; i < (o.dustN ?? 10); i++) {
    const sp = sprite(o.dust, H * (0.16 + Math.random() * 0.14)); g.add(sp);
    dust.push({ sp, ph: Math.random(), y: Math.random() * 0.05, z: (Math.random() - 0.35) * H * 0.3, v: 0.025 + Math.random() * 0.025 });
  }
  const headPos = (out) => { if (!head) return out.set(0, H * 0.9, 0); head.getWorldPosition(out); return g.worldToLocal(out); };
  const ex = o.extras ? o.extras({ add: (x) => g.add(x), fig, sprite, H, B, geos, body, fade, headPos, actor, weapon }) : null;

  let gy = 0; let gAt = -9;
  const ground = () => {
    const holder = g.parent; const sc = holder?.parent; const gfn = sc?.userData?.groundAt; if (!gfn) return 0;
    holder.getWorldPosition(_w); let m = Infinity;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const rr = i ? H * 0.1 : 0; m = Math.min(m, gfn(_w.x + Math.cos(a) * rr, _w.z + Math.sin(a) * rr) || 0); }
    return Number.isFinite(m) ? m : 0;
  };
  return {
    object: g, dist: o.dist || 215, actor,
    update(dt, t) {
      /* on the land, unless the camp has the figure posed (scaled) for its frame */
      const posed = g.parent && Math.abs(g.parent.scale.y - 1) > 1e-3;
      g.position.x = posed ? 0 : (o.side || 0);
      if (posed) g.position.y = 0; else { if (t - gAt > 1) { gAt = t; gy = ground(); } g.position.y = gy - H * (o.sink ?? 0.015); }
      U.t.value = t;
      /* the look: on the walker; every 8-14 s a slow turn away over the land for 3 s, then back */
      if (seen) { _v.copy(cam); fig.worldToLocal(_v); want = Math.max(-0.75, Math.min(0.75, Math.atan2(_v.x, Math.max(1, _v.z)))); }
      awayT -= dt; if (awayT < 0) { if (away) { away = 0; awayT = 8 + Math.random() * 6; } else { away = (Math.random() < 0.5 ? -1 : 1) * 0.7; awayT = 3; } }
      look += ((want + away) - look) * Math.min(1, dt * 0.9);
      actor.mixer.update(dt);
      const f = fade();
      for (const d of dust) {
        d.ph = (d.ph + dt * d.v) % 1; const p = d.ph; const a = Math.sin(p * Math.PI);
        d.sp.position.set((p - 0.5) * H * 0.95, H * (0.035 + d.y + p * 0.05), d.z);
        d.sp.material.opacity = f * (o.dustOp ?? 0.5) * a * a;
      }
      ex?.update?.(dt, t, f);
    },
    U,
    dispose() { actor.dispose(); for (const x of geos) x.dispose(); for (const sp of sprites) sp.material.dispose(); ex?.dispose?.(); },
  };
}

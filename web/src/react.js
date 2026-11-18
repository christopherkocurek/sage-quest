/* how a foe takes a blow and how it dies, in all five worlds.
  Before, foes moved and died like stiff dolls: a hit was a flat white flash and three specks, a death burst
   the body into floating hands and boots, every corpse lay in one stiff pose (arms up, batons upright beside it), two
   corpses lay through each other, and the pile stayed. The aim is Mordhau / Berserk weight: the blow lands, the body answers.

   fight.react = new FoeReact(fight)
   - hit(f, dir, o): an additive lean of the spine, neck and head away from the blow (a damped spring, so the body snaps and
     swings back once), a twist toward the side of the cut; light and heavy hits differ in size and speed. The clip
     (Hit_Chest / Hit_Head / the stagger) plays under it, so the reaction is always in the direction of the blow.
   - die(f, dir, o): the fall direction and a yaw offset that keeps the new body off every body already down; the death
     clip at a varied speed; then a "gravity settle" pass bends any limb that points up (an arm raised by the clip, a knee)
     down onto the ground, so no corpse holds a stiff raised arm or a T-pose. A small head turn and spine twist per body,
     so no two corpses lie alike.
   - dissolve(f, k, dt): the world's own way out (dark ash, edo petals and smoke, neon glitch, frontier dust, storybook a
     soft sparkle), called by the fight while the body fades.
   - killFx(f, dir, at, heavy): the kill burst: a big flare, streaked sparks, the world's matter and a ground mark.
   Bones are bent after the mixer (actor.pose), in world terms (an axis in the world turned into the parent's frame), so the
   rig's own bone axes never matter. Knight-rig foes only; a boss or a code-built body is left alone. */
import * as THREE from 'three';
import { SHAPE } from './powers.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const UP = V(0, 1, 0);
const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion(); const _a = V(); const _b = V(); const _c = V(); const _d = V(); const _e = V();
const SPINE = [['spine_01', 0.22], ['spine_02', 0.26], ['spine_03', 0.26], ['neck_01', 0.2], ['Head', 0.3]];
const LIMBS = [['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'], ['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r']];

/* turn a bone by a world-space rotation (axis in the world, angle), applied in its parent's frame */
function turnWorld(bone, axis, ang) {
  if (!bone.parent || Math.abs(ang) < 1e-4) return;
  bone.parent.getWorldQuaternion(_q2); _a.copy(axis).applyQuaternion(_q2.invert()).normalize();
  _q.setFromAxisAngle(_a, ang); bone.quaternion.premultiply(_q);
}
/* turn a bone so that its world direction `from` moves toward `to` by k (0..1) */
function bendToward(bone, from, to, k) {
  if (!bone.parent || k <= 0) return;
  _q.setFromUnitVectors(from, to); if (k < 1) _q.slerp(_q2.identity(), 1 - k);
  bone.parent.getWorldQuaternion(_q2); const inv = _q2.clone().invert();
  /* world rotation R -> parent frame: P^-1 R P */
  const r = inv.multiply(_q).multiply(_q2); bone.quaternion.premultiply(r);
}

export class FoeReact {
  constructor(fight) { this.F = fight; this.W = fight.kit?.id || 'dark'; }

  rig(f) {
    if (f.rxR !== undefined) return f.rxR;
    const A = f.actor; f.rxR = null;
    if (!A?.knight || f.boss || !A.pose) return null;
    const B = {}; for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r']) { const b = A.model.getObjectByName(n); if (!b) return null; B[n] = b; }
    const R = { B, lean: V(), leanV: V(), tw: 0, twV: 0, settle: 0, headTw: rand(-0.7, 0.7), spineTw: rand(-0.25, 0.25), armDrop: [rand(-0.25, 0.05), rand(-0.25, 0.05)], dead: false };
    A.pose(B.pelvis, () => { try { this.apply(f, R); } catch { /* a part gone */ } });
    f.rxR = R; return R;
  }

  /* a blow lands: dir = the blow's flat direction (hero to foe), o = { heavy, critical, finisher, side } */
  hit(f, dir, o = {}) {
    const R = this.rig(f); if (!R || !dir) return;
    const big = o.heavy || o.finisher; const crit = o.critical;
    _a.crossVectors(UP, _b.set(dir.x, 0, dir.z).normalize()); /* turning about up x dir tilts the top toward dir */
    const s = big ? 7.5 : crit ? 5.5 : 4.2;
    R.leanV.addScaledVector(_a, s);
    const side = o.side === 'L' ? 1 : o.side === 'R' ? -1 : (Math.random() < 0.5 ? 1 : -1);
    R.twV += side * (big ? 4.5 : 2.6);
    R.lastHit = this.F.clock;
  }

  /* the body goes down: returns nothing; sets f.yaw (fall direction) and plays the clip */
  die(f, dir, o = {}) {
    const R = this.rig(f); const F = this.F;
    /* a body already on the ground keeps where it lies; it only settles its limbs */
    if (o.lying) { f.rxBack = V(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)); if (R) { R.dead = true; R.settle = 0; R.deadT = 0; R.clipEnd = 0.05; } return f.yaw; }
    const d = dir ? _b.set(dir.x, 0, dir.z).normalize().clone() : V(Math.sin(f.yaw + Math.PI), 0, Math.cos(f.yaw + Math.PI));
    /* candidate yaw offsets: the side of the cut leans the fall that way; pick the one whose body lies clear of the others */
    const side = o.side === 'L' ? 1 : o.side === 'R' ? -1 : 0;
    const base = Math.atan2(-d.x, -d.z); const len = 1.75 * f.scale;
    const others = F.foes.filter((x) => x !== f && x.state === 'dead' && !x.gone && !x.staged);
    let best = 0; let bestScore = -1e9;
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.5, -1.5]) {
      const yaw = base + off + side * 0.3; const back = V(-Math.sin(yaw), 0, -Math.cos(yaw)); /* a foe facing yaw falls on its back toward -forward */
      let score = -Math.abs(off) * 0.6;
      for (const x of others) {
        for (let k = 0.25; k <= 1; k += 0.25) {
          const px = f.pos.x + back.x * len * k; const pz = f.pos.z + back.z * len * k;
          const xb = x.rxBack || V(); for (let j = 0; j <= 1; j += 0.5) { const qx = x.pos.x + xb.x * 1.75 * x.scale * j; const qz = x.pos.z + xb.z * 1.75 * x.scale * j; const dd = Math.hypot(px - qx, pz - qz); if (dd < 1.1) score -= (1.1 - dd) * 4; }
        }
      }
      if (score > bestScore) { bestScore = score; best = off; }
    }
    f.yaw = base + best + side * 0.3 + rand(-0.12, 0.12);
    f.rxBack = V(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
    /* the push carries the body along the blow (and a little to the cut's side) */
    if (dir) { f.vel.addScaledVector(d, o.execute ? 3.5 : 1.4); if (side) f.vel.addScaledVector(V(-d.z, 0, d.x), side * 0.8); }
    if (R) {
      R.dead = true; R.settle = 0; R.deadT = 0;
      /* the impact: a hard snap back along the blow before the clip takes the fall */
      _a.crossVectors(UP, d); R.leanV.addScaledVector(_a, o.execute ? 6 : 4); R.twV += (side || (Math.random() < 0.5 ? 1 : -1)) * 3;
      R.clipEnd = 0;
    }
    return f.yaw;
  }
  /* the fight tells how long the death clip runs (seconds of foe time), so the settle pass starts as it lands */
  clipLen(f, s) { if (f.rxR) f.rxR.clipEnd = s; }

  /* after the mixer: the lean spring, the twist, and on a body the settle */
  /* (world.js puts every bone back to the clip's pose before each mixer update, so these are offsets, never a pile-up) */
  apply(f, R) { this.pose(f, R); }
  pose(f, R) {
    const dt = Math.min(0.05, this.F._rxDt || 0.016);
    /* the spring: stiff, a little under-damped, so a hit snaps and swings back once */
    const K = R.dead ? 90 : 170; const C = R.dead ? 9 : 12.5;
    R.leanV.addScaledVector(R.lean, -K * dt).multiplyScalar(Math.max(0, 1 - C * dt)); R.lean.addScaledVector(R.leanV, dt);
    R.twV += (-K * R.tw) * dt; R.twV *= Math.max(0, 1 - C * dt); R.tw += R.twV * dt;
    if (R.lean.length() > 0.7) R.lean.setLength(0.7);
    const ang = R.lean.length(); const B = R.B;
    if (ang > 0.002 || Math.abs(R.tw) > 0.002) {
      _c.copy(R.lean).normalize();
      for (const [n, w] of SPINE) { turnWorld(B[n], _c, ang * w * (n === 'Head' ? 1.4 : 1)); }
      /* the twist about the body's own up (the pelvis frame), so it turns the chest toward the cut */
      B.pelvis.getWorldQuaternion(_q2); _d.set(0, 1, 0).applyQuaternion(_q2);
      turnWorld(B.spine_02, _d, R.tw * 0.25); turnWorld(B.spine_03, _d, R.tw * 0.2);
    }
    if (!R.dead) return;
    R.deadT += dt;
    /* the settle: once the clip has the body on the ground, every limb that points up comes down onto the ground */
    const start = (R.clipEnd || 1.2) * 0.72;
    R.settle = clamp((R.deadT - start) / 0.45, 0, 1);
    const k = R.settle * R.settle * (3 - 2 * R.settle);
    if (k <= 0 || this.F.rxNoSettle) return;
    /* a twist about the bone's own length (bone -> child), whatever the rig's bone axes: the head turned aside, the chest a little rolled */
    B.neck_01.getWorldPosition(_a); B.Head.getWorldPosition(_b); turnWorld(B.Head, _d.subVectors(_b, _a).normalize(), R.headTw * k);
    B.spine_02.getWorldPosition(_a); B.spine_03.getWorldPosition(_b); turnWorld(B.spine_02, _d.subVectors(_b, _a).normalize(), R.spineTw * k);
    /* the body's own axis on the ground: chest -> hips (toward the feet), flat */
    B.pelvis.getWorldPosition(_e); B.spine_03.getWorldPosition(_a); const feet = V(_e.x - _a.x, 0, _e.z - _a.z); if (feet.lengthSq() < 1e-4) feet.set(0, 0, 1); feet.normalize();
    for (let i = 0; i < LIMBS.length; i++) {
      const [bn, cn] = LIMBS[i]; const b = B[bn]; const c = B[cn];
      b.getWorldPosition(_a); c.getWorldPosition(_b); const dir = _b.sub(_a); const L = dir.length(); if (L < 1e-3) continue; dir.divideScalar(L);
      if (dir.y < 0.08) continue;
      /* a raised limb comes down along the body: an arm lies by the side, a little out from it, the forearm bent in;
         a raised leg lies down toward the feet. Never straight out to the side (a T) and never up. */
      const out = V(_a.x - _e.x, 0, _a.z - _e.z); out.addScaledVector(feet, -out.dot(feet)); if (out.lengthSq() < 1e-4) out.set(-feet.z, 0, feet.x); out.normalize();
      const arm = i < 4; const fore = i === 1 || i === 3;
      _c.copy(feet).multiplyScalar(arm ? (fore ? 0.55 : 0.8) : 1).addScaledVector(out, arm ? (fore ? -0.1 : 0.45) : 0.12);
      _c.y = arm ? R.armDrop[i < 2 ? 0 : 1] : -0.05; _c.normalize();
      bendToward(b, dir.clone(), _c, k);
    }
  }

  /* fight loop: the dt for the posers this frame */
  tick(dt) { this.F._rxDt = dt; }

  /* ---------------------------------------------------------------- fx */
  P() { return this.F.powers || null; }
  /* the kill burst: the blow's flare made bigger, sparks, the world's matter, a ground mark under the body */
  killFx(f, dir, at, heavy = false) {
    const P = this.P(); if (!P) return; const W = this.W;
    const c = (h) => new THREE.Color(h);
    const p = at ? at.clone() : V(f.pos.x, 1.3 * f.scale, f.pos.z); const k = P.dk(p) * (heavy ? 1.2 : 1);
    const d = dir ? V(dir.x, 0, dir.z).normalize() : null;
    const g = P.gy(f.pos.x, f.pos.z);
    const hot = { dark: 0xffd6a0, edo: 0xffe6d0, neon: 0xbffcff, frontier: 0xffd9a0, storybook: 0xfff2c0 }[W] || 0xffffff;
    P.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.12, 0.7 * k, 1.1 * k, c(hot).multiplyScalar(2.2), c(hot), 0.8, 0, 0, 0, SHAPE.glow);
    P.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.1, 1.4 * k, 0.3, c(hot).multiplyScalar(2.5), c(hot), 0.9, 0, 0, 0, W === 'storybook' ? SHAPE.star : SHAPE.cross);
    P.streaks(p, d, 14, 9, c(hot).multiplyScalar(2.2), c(0xff8a40).multiplyScalar(0.7), { size: 0.075 * k, life: 0.42, g: 12, st: 0.11, cone: 0.7, lift: 0.35 });
    const gx = f.pos.x + (d ? d.x * 0.7 : 0); const gz = f.pos.z + (d ? d.z * 0.7 : 0);
    if (W === 'storybook') {
      /* a ring of soft gold light on the grass and a slow lift of sparkles: a fairy-tale end, not a party popper */
      P.decals.add({ kind: 'ring', x: f.pos.x, z: f.pos.z, y: g, size: 1.6, color: 0xffe08a, glow: 1.2, alpha: 0.75, life: 1.6, prog: [0.3, 1, 0], fade: 0.6 });
      for (let i = 0; i < 12; i++) { const a = rand(0, Math.PI * 2); const r = rand(0.2, 0.7); P.add.emit(f.pos.x + Math.cos(a) * r, g + rand(0.3, 1.6) * f.scale, f.pos.z + Math.sin(a) * r, Math.cos(a) * 0.4, rand(0.4, 1.1), Math.sin(a) * 0.4, rand(0.9, 1.4), 0.14 * k, 0.04, c(0xfff4c0).multiplyScalar(2.2), c(0xffc0e0), 0.9, -0.3, 1.2, 0, SHAPE.star); }
    } else if (W === 'neon') {
      P.decals.add({ kind: 'ring', x: f.pos.x, z: f.pos.z, y: g, size: 1.7, color: 0x3cf2ff, glow: 1.6, alpha: 0.8, life: 0.9, prog: [0.2, 1, 0], fade: 0.5 });
      for (let i = 0; i < 3; i++) { const e = p.clone().add(V(rand(-0.8, 0.8), rand(-0.8, 0.3), rand(-0.8, 0.8)).multiplyScalar(k)); P.arc(p, e, c(0xbffcff).multiplyScalar(2), c(0x3cf2ff), { seg: 5, jit: 0.15, size: 0.05 * k, life: 0.14, halo: false }); }
    } else if (W === 'frontier') {
      P.billows(V(f.pos.x, g + 0.3, f.pos.z), 7, { speed: 1.6, size: 0.9, rise: 0.5, life: 1.3, a: 0.45, color: c(0xb59470), endColor: c(0x8a6e52), spread: 0.5 });
      P.decals.add({ kind: 'splat', x: gx, z: gz, y: P.gy(gx, gz), size: 1.0, len: 1.7, rot: d ? -Math.atan2(d.z, d.x) : 0, color: 0x3a1408, glow: 1, alpha: 0.8, life: 7, fade: 0.45 });
    } else {
      /* dark and edo: a heavier spray of dark droplets across the view and a long splash on the ground */
      const blood = c(W === 'edo' ? 0x7a0e12 : 0x6a0e0c);
      if (d) { const side = V(-d.z, 0, d.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1); const sd = d.clone().multiplyScalar(0.3).add(side).add(V(0, 0.25, 0)).normalize(); P.droplets(p, sd, 14, 7, blood, blood.clone().multiplyScalar(0.45), { size: 0.07, k, life0: 0.35, life1: 0.7, st: 0.035 }); }
      P.decals.add({ kind: 'splat', x: gx, z: gz, y: P.gy(gx, gz), size: 1.0, len: 1.9, rot: d ? -Math.atan2(d.z, d.x) : 0, color: W === 'edo' ? 0x3a0608 : 0x2a0604, glow: 1, alpha: 0.85, life: 8, fade: 0.45 });
      if (W === 'edo') P.bits(p, 6, 2.2, c(0xf4c0cc), c(0xd88aa0), { kind: SHAPE.leaf, size: 0.07, g: 2.2, drag: 2.6, life: 1.4, up: 1.0 });
    }
  }

  /* the body goes out of the world (k: 0 -> 1 over the fade), every frame of the fade */
  dissolve(f, k, dt) {
    const P = this.P(); const R = f.rxR; const W = this.W; if (!P) return;
    const pts = R ? [R.B.pelvis, R.B.spine_03, R.B.Head, R.B.hand_l, R.B.hand_r, R.B.calf_l, R.B.calf_r, R.B.spine_01] : null;
    const at = (out) => { if (pts) pts[Math.floor(Math.random() * pts.length)].getWorldPosition(out); else out.set(f.pos.x + rand(-0.5, 0.5), 0.3, f.pos.z + rand(-0.5, 0.5)); return out; };
    const rate = { dark: 70, edo: 40, neon: 50, frontier: 26, storybook: 30 }[W] || 40;
    const n = Math.floor(rate * dt * (1 - k * 0.6) + Math.random());
    const c = this._col ||= { ash: new THREE.Color(0x2c2a28), ash2: new THREE.Color(0x0c0b0a), ember: new THREE.Color(0xff7a30).multiplyScalar(2), ember2: new THREE.Color(0x601808), petal: new THREE.Color(0xf4c4d0), petal2: new THREE.Color(0xd890a8), smoke: new THREE.Color(0x3a3a40), smoke2: new THREE.Color(0x18181c), cy: new THREE.Color(0x7ff6ff).multiplyScalar(2.2), mg: new THREE.Color(0xff3cc8).multiplyScalar(1.8), blue: new THREE.Color(0x0a3cff), dust: new THREE.Color(0xc0a07a), dust2: new THREE.Color(0x8a6e52), gold: new THREE.Color(0xfff0b8).multiplyScalar(2), pink: new THREE.Color(0xffd0ec) };
    for (let i = 0; i < n; i++) {
      const p = at(_e);
      if (W === 'dark') {
        if (i % 6 === 5) P.add.emit(p.x, p.y + 0.1, p.z, rand(-0.3, 0.3), rand(0.5, 1.4), rand(-0.3, 0.3), rand(0.6, 1.1), 0.05, 0.02, c.ember, c.ember2, 1, -0.6, 1.2, 0.02, SHAPE.spark);
        else P.smoke.emit(p.x + rand(-0.12, 0.12), p.y + 0.05, p.z + rand(-0.12, 0.12), rand(-0.25, 0.25), rand(0.35, 1.1), rand(-0.25, 0.25), rand(1.0, 1.8), rand(0.04, 0.08), 0.03, c.ash, c.ash2, 0.95, -0.25, 0.8, 0, SHAPE.shard);
      } else if (W === 'edo') {
        if (i % 3) P.smoke.emit(p.x + rand(-0.1, 0.1), p.y, p.z + rand(-0.1, 0.1), rand(-0.6, 0.6), rand(0.4, 1.2), rand(-0.6, 0.6), rand(1.2, 1.9), 0.08, 0.06, c.petal, c.petal2, 1, -0.15, 1.4, 0, SHAPE.leaf);
        else P.smoke.emit(p.x, p.y, p.z, rand(-0.2, 0.2), rand(0.3, 0.7), rand(-0.2, 0.2), rand(1.0, 1.6), 0.25, 0.8, c.smoke, c.smoke2, 0.35, -0.2, 1.4, 0, SHAPE.billow);
      } else if (W === 'neon') {
        const h = rand(-0.4, 0.4); P.add.emit(p.x, p.y + rand(-0.15, 0.15), p.z, h * 6, 0, rand(-0.4, 0.4) * 6, rand(0.06, 0.16), rand(0.05, 0.12), 0.02, Math.random() < 0.7 ? c.cy : c.mg, c.blue, 1, 0, 6, 0.06, SHAPE.shard);
      } else if (W === 'frontier') {
        P.smoke.emit(p.x + rand(-0.2, 0.2), Math.max(p.y, P.gy(p.x, p.z) + 0.1), p.z + rand(-0.2, 0.2), rand(-0.5, 0.5), rand(0.1, 0.5), rand(-0.5, 0.5), rand(1.0, 1.8), 0.3, 1.0, c.dust, c.dust2, 0.4, -0.05, 1.2, 0, SHAPE.billow);
      } else {
        P.add.emit(p.x + rand(-0.15, 0.15), p.y, p.z + rand(-0.15, 0.15), rand(-0.15, 0.15), rand(0.3, 0.8), rand(-0.15, 0.15), rand(0.8, 1.4), rand(0.06, 0.11), 0.02, c.gold, c.pink, 0.8, -0.1, 1.2, 0, SHAPE.star);
      }
    }
    /* neon: the body glitches out (frames drop out and jump sideways) instead of sinking */
    if (W === 'neon' && f.actor?.root) { const on = Math.random() > k * 0.85; f.actor.root.visible = on; if (on && Math.random() < 0.3) f.actor.root.position.x += rand(-0.06, 0.06); }
  }
  /* how far a body sinks into the ground as it goes, per world */
  sinkK() { return { dark: 0.3, edo: 0.15, neon: 0, frontier: 0.45, storybook: 0.12 }[this.W] ?? 0.3; }
}

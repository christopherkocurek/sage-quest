/* Ranged weapons and the feel of each weapon class.
   A weapon with `ranged: '<profile>'` in the kit (game/kit.mjs, laid over by a world entry) gets a Ranged handle on the
   Fight (fight.rg). The fight stays melee-first: a gun or a bow is a short tell, a shot and a long open moment, and the same
   weapon swings as a club (a pistol-whip, a rifle butt, a bow stave) on the heavy key or when it is empty.
   Controls: tap (J or the left button) = a hip shot after a short tell; hold = aim (the view narrows, the shot steadies),
   release = fire. K = melee blow. R = reload (gun) or vent (stun pistol). Block, parry, dodge and kick do not change.
   Hooks in fight.js (small): constructor (weaponFeel), buildViewModel (attach), tryAttack (trigger), updatePlayer (update,
   moveK, canBlock), poseViewModel (pose, recoil, afterPose), the FOV line (zoomNow), factsFor (doing). */
import * as THREE from 'three';
import { sfx, sfxNames } from './sfx.js';
import { RangedHand } from './ranged-hands.js'; /* hands with fingers (grip, trigger, cup, pinch, hook) */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const D = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

/* ---------- melee feel per weapon id: hit stop, shake, camera kick, sound, moveset ----------
   Once the greatsword, axe and maul shared one moveset and one feel, and so did the spear and the staff:
   only the swing time told them apart. Now each has its own blows and its own weight. */
const FEEL = {
  sword: { stop: 1, shake: 1, kick: 1 },
  greatsword: { stop: 1.2, shake: 1.1, kick: 1.15 },                                   /* wide sweeps (two-hand default) */
  axe: { stop: 1.35, shake: 1.2, kick: 1.3, moves: { lights: ['over', 'rl', 'over'], heavy: 'slam' }, bite: true }, /* chops from above */
  maul: { stop: 1.75, shake: 1.55, kick: 1.7, moves: { lights: ['over', 'lr'], heavy: 'slam' }, crush: true, heavySound: true }, /* every blow lands like a heavy */
  daggers: { stop: 0.55, shake: 0.6, kick: 0.6 },
  spear: { stop: 0.9, shake: 0.85, kick: 0.9 },                                         /* thrusts (pole default) */
  staff: { stop: 1.1, shake: 1.05, kick: 1.1, moves: { lights: ['rl', 'lr', 'thrust'], heavy: 'slam' } }, /* a quarterstaff sweeps and cracks */
  pistol: { stop: 0.8, shake: 0.8, kick: 0.8, hitSound: 'pistolWhip' },
  rifle: { stop: 1.1, shake: 1.0, kick: 1.1, hitSound: 'pistolWhip', moves: { lights: ['thrust', 'over'], heavy: 'slam' } },              /* the butt jab and the clubbing blow */
  bow: { stop: 0.7, shake: 0.7, kick: 0.7, moves: { lights: ['rl', 'lr'], heavy: 'over' } },
};
export function weaponFeel(weapon) {
  const f = { stop: 1, shake: 1, kick: 1, ...(FEEL[weapon?.id] || {}), ...(weapon?.feel || {}) };
  return f;
}

/* ---------- ranged profiles. Points are gear-local (glTF metres) ---------- */
const PROFILES = {
  /* a six-shooter: quick, accurate up close, weak far off, six shots and a slow reload one round at a time */
  revolver: { kind: 'gun', hold: 'pistol', rounds: 6, dmg: 3.5, aimDmg: 5.6, poise: 1.4, aimPoise: 3.6, tell: 0.1, interval: 0.34, steady: 0.45,
    spread: 0.028, aimSpread: 0.003, near: 8, far: 22, max: 32, farK: 0.4, boss: 0.7, bossPoise: 0.35, head: 1.5,
    reload: { open: 0.38, each: 0.3, close: 0.22 }, flash: 0xffc070, tracer: 0xffe6b0, kick: 0.16, kickRot: 0.2, zoom: 9, guardBreak: false, fpScale: 1.35,
    muzzle: [0.236, 0.096, 0], cyl: [0, 0.093, 0], hammer: [-0.01, 0.104, 0], gate: [0.035, 0.096, 0.012], conv: [1.2, 30], hand: [0, -0.012, 0] },
  /* a lever rifle: hard-hitting and long, a slow lever between shots; an aimed shot knocks a raised guard aside */
  rifle: { kind: 'gun', hold: 'rifle', rounds: 8, dmg: 3.4, aimDmg: 6.2, poise: 2.6, aimPoise: 7, tell: 0.14, interval: 0.62, steady: 0.38,
    spread: 0.03, aimSpread: 0.0015, near: 16, far: 38, max: 48, farK: 0.6, boss: 0.7, bossPoise: 0.35, head: 1.6,
    reload: { open: 0.3, each: 0.38, close: 0.3 }, flash: 0xffc070, tracer: 0xffe6b0, kick: 0.24, kickRot: 0.2, zoom: 18, guardBreak: true,
    muzzle: [0.747, 0.078, 0], forend: [0.3, 0.05, 0], lever: [0.05, 0.04, 0], gate: [0.09, 0.066, 0.016], conv: [5, 40] },
  /* a stun pistol: little damage, a big jolt (poise); five cells that refill on their own; empty = it overheats and vents */
  stunner: { kind: 'gun', hold: 'pistol', rounds: 5, recharge: 1.1, heat: 1.8, dmg: 2.1, aimDmg: 3.3, poise: 4.2, aimPoise: 7.5, tell: 0.08, interval: 0.28, steady: 0.32,
    spread: 0.03, aimSpread: 0.006, near: 7, far: 16, max: 22, farK: 0.5, boss: 0.6, bossPoise: 0.3, head: 1.2,
    flash: 0x7ff0ff, tracer: 0x9ff4ff, kick: 0.1, kickRot: 0.12, zoom: 7, bolt: true, guardBreak: false, fpScale: 1.3, muzzle: [0.216, 0.094, 0], coil: [0.156, 0.094, 0], conv: [1.2, 30], hand: [0, -0.01, 0] },
  /* a bow: draw to load the shot; a quick tap is a weak flick, a full draw hits like a heavy blow; the arrow flies */
  bow: { kind: 'bow', hold: 'bow', draw: 0.6, dmg: 1.6, aimDmg: 5.2, poise: 0.8, aimPoise: 5.5, interval: 0.36, minDraw: 0.12, speed: 58,
    spread: 0.05, aimSpread: 0.002, near: 14, far: 32, max: 46, farK: 0.6, boss: 0.8, bossPoise: 0.35, head: 1.6, zoom: 10, guardBreak: false,
    tracer: 0xffffff, kick: 0.05, conv: [1.3, 30] },
};
/* per bow gear (gear-local): the string tips, the nock height, the side the arrow rides on (z), the draw (how far the nock
   comes back, so it reaches the cheek), the arrow length, the first-person scale, the limb flex at full draw (x back, y in)
   a draw of 0.24 m left the nock at arm's length, so the string did not seem to pull back; now the nock comes to the cheek */
const BOWS = {
  edo_yumi: { top: [-0.195, 1.37, 0], bot: [-0.195, -0.79, 0], nock: 0.095, side: -0.016, draw: 0.57, arrow: 0.95, fp: 0.74, grip: 0.08, flex: [0.13, 0.05], fletch: 0xf2efe6, head: 0x2a2a2a },
  storybook_bow: { top: [-0.13, 0.77, 0], bot: [-0.13, -0.77, 0], nock: 0.075, side: -0.02, draw: 0.46, arrow: 0.8, fp: 0.92, grip: 0.065, flex: [0.16, 0.05], fletch: 0xc83a2a, head: 0x8a8a8a },
};
const GUN_SOUND = {
  revolver: { fire: ['gunshot', 'kick'], cock: ['gunCock', null], dry: ['gunDry', 'deflect'], open: ['gunOpen', null], load: ['gunLoad', 'piece'], close: ['gunClose', 'piece'] },
  rifle: { fire: ['rifleShot', 'gunshot', 'clangBig'], cock: ['leverCycle', 'piece'], dry: ['gunDry', 'deflect'], load: ['gunLoad', 'piece'], close: ['gunClose', 'piece'] },
  stunner: { fire: ['stunShot', 'bolt'], cock: ['stunCharge', null], dry: ['gunDry', 'deflect'], vent: ['stunVent', 'charge'] },
  bow: { draw: ['bowDraw', 'charge'], fire: ['bowLoose', 'thrust'], fly: ['arrowFlight', null], hit: ['arrowHit', 'flesh'], hitArmor: ['arrowArmor', 'deflect'], miss: ['arrowWood', null] },
};
let NAMES = null;
/* play the first sound the sound generator has made; fall back to a stand-in from the existing set */
function play(prof, key, o) {
  const list = GUN_SOUND[prof]?.[key]; if (!list) return;
  NAMES ||= new Set(sfxNames());
  for (const n of list) { if (!n) return; if (NAMES.has(n)) { sfx(n, o); return; } }
}

/* ---------- small shared textures and geometries ---------- */
let STAR = null;
function starTexture() {
  if (STAR) return STAR;
  /* a hard star (four long rays, four short) round a white-hot core, so one frame of it reads as a muzzle flash */
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  /* the gradient is made after the translate, round the new origin (made before it, it sat 64 px off and
     the whole star came out transparent) */
  g.translate(64, 64);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.55, 'rgba(235,235,235,0.55)'); grd.addColorStop(1, 'rgba(220,220,220,0)'); /* white: the material colour tints it (gold for powder, cyan for the stun bolt) */
  g.fillStyle = grd;
  for (let i = 0; i < 8; i++) { const L = i % 2 ? 40 : 63; const w = i % 2 ? 4 : 6; g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-w, 0); g.lineTo(0, -L); g.lineTo(w, 0); g.fill(); }
  g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
  STAR = new THREE.CanvasTexture(c); STAR.colorSpace = THREE.SRGBColorSpace; return STAR;
}
/* a soft round glow (the stun coil, the charge) */
let GLOW = null;
function glowTexture() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  GLOW = new THREE.CanvasTexture(c); GLOW.colorSpace = THREE.SRGBColorSpace; return GLOW;
}
let PUFF = null;
function puffTexture() {
  if (PUFF) return PUFF;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 7; i++) { const x = 32 + (Math.sin(i * 2.3) * 9); const y = 32 + Math.cos(i * 1.7) * 9; const r = 14 + (i % 3) * 4; const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); }
  PUFF = new THREE.CanvasTexture(c); return PUFF;
}
const UNIT_Y = V(0, 1, 0);
/* billboards are plain meshes that face the camera each frame (face(); roll = its spin), so the flash can ride the
   view model in camera space. (The first flash never showed because its star texture came out fully transparent.) */
const BILL = new THREE.PlaneGeometry(1, 1);
function bill(opts) { const m = new THREE.Mesh(BILL, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, ...opts })); m.frustumCulled = false; m.userData.roll = 0; return m; }
const _bq = new THREE.Quaternion(); const _bq2 = new THREE.Quaternion(); const _bz = new THREE.Vector3(0, 0, 1);
function face(m, cam) {
  cam.getWorldQuaternion(_bq); _bq.multiply(_bq2.setFromAxisAngle(_bz, m.userData.roll || 0));
  if (m.parent && m.parent.type !== 'Scene') { m.parent.getWorldQuaternion(_bq2); _bq.premultiply(_bq2.invert()); }
  m.quaternion.copy(_bq);
}
const _a = V(); const _b = V(); const _c = V(); const _q = new THREE.Quaternion(); const _m = new THREE.Matrix4();

/* closest approach of a ray (o, unit d) to a segment..returns { t (along the ray), s (0..1 along the segment), dist } */
function raySeg(o, d, p0, p1) {
  const u = _a.subVectors(p1, p0); const w = _b.subVectors(o, p0);
  const a = 1; const b = d.dot(u); const c = u.dot(u); const dd = d.dot(w); const e = u.dot(w);
  const den = a * c - b * b; let t; let s;
  if (den < 1e-8) { t = 0; s = clamp(e / c, 0, 1); } else { t = (b * e - c * dd) / den; s = clamp((a * e - b * dd) / den, 0, 1); }
  t = Math.max(0, d.dot(_c.copy(p0).addScaledVector(u, s).sub(o)));
  const px = p0.x + u.x * s; const py = p0.y + u.y * s; const pz = p0.z + u.z * s;
  const qx = o.x + d.x * t; const qy = o.y + d.y * t; const qz = o.z + d.z * t;
  return { t, s, dist: Math.hypot(px - qx, py - qy, pz - qz), point: V(px, py, pz) };
}

export class Ranged {
  /* fight.rg = await Ranged.attach(fight): null for a melee weapon */
  static async attach(fight) {
    const id = fight.weapon?.ranged; if (!id || !PROFILES[id]) return null;
    const r = new Ranged(fight, id); r.build(); return r;
  }
  constructor(fight, id) {
    this.f = fight; this.id = id; this.P = PROFILES[id];
    this.rounds = this.P.rounds ?? 1; this.st = 'ready'; this.t = 0; this.k = 0; this.cyc = 0; this.queued = false;
    this.recoilK = 0; this.zoomNow = 0; this.aimK = 0; this.drawK = 0; this.reloadK = 0; this.leverK = 0; this.hammerK = 0; this.cylA = 0; this.charge = 0;
    this.fx = []; this.arrows = []; this.reactT = 0; this.shots = 0; this.hits = 0;
    this.bowDef = this.P.kind === 'bow' ? (BOWS[fight.weapon.gear] || BOWS.storybook_bow) : null;
  }
  build() {
    const f = this.f; const g = f.gear; const prf = this.P;
    /* moving parts of the glb: own meshes by material name */
    const byMat = (re) => { let hit = null; g.traverse((o) => { if (!hit && o.isMesh && re.test(o.material?.name || '')) hit = o; }); return hit; };
    const pivotOn = (mesh, at) => { if (!mesh || !at) return null; const p = new THREE.Group(); p.position.fromArray(at); mesh.parent.add(p); p.add(mesh); mesh.position.sub(p.position); return p; };
    this.cylP = pivotOn(byMat(/SQ_Cyl/), this.P.cyl); this.hamP = pivotOn(byMat(/SQ_Hammer/), this.P.hammer); this.levP = pivotOn(byMat(/SQ_Lever/), this.P.lever);
    const str = byMat(/SQ_String/); if (str) str.visible = false;
    g.traverse((o) => { if (o.isMesh && /SQ_Nock/.test(o.material?.name || '')) o.visible = false; }); /* the glb's own nocked arrow shows on the hero's bow in third person; here the game draws its own */
    for (const c of g.children) c.scale.setScalar(1); /* world.js draws a pistol larger in a third-person hand; not here */
    if (this.P.fpScale) g.scale.setScalar(this.P.fpScale); /* the first-person fist is big: a pistol at true size reads as a toy */
    this.own = [];
    if (this.bowDef) {
      g.scale.setScalar(this.bowDef.fp);
      /* the string: two thin rods from each tip to the nock, re-aimed every frame; the nocked arrow rides the nock */
      const sm = new THREE.MeshBasicMaterial({ color: 0xe8dfc8 }); const sg = new THREE.CylinderGeometry(0.0028, 0.0028, 1, 5); sg.translate(0, 0.5, 0);
      this.strA = new THREE.Mesh(sg, sm); this.strB = new THREE.Mesh(sg, sm); g.add(this.strA, this.strB);
      this.arrowKit = this.makeArrowKit(); this.nocked = this.makeArrow(); g.add(this.nocked);
      this.own.push(sm, sg);
      /* the limbs flex as the string comes back: each limb vertex is pushed back and in by the square of its distance
         from the grip (the geometry is this bow's own copy, the hero's third-person bow keeps the glb's) */
      this.flexMeshes = [];
      g.traverse((o) => { if (o.isMesh && o.geometry && !/SQ_String|SQ_Nock/.test(o.material?.name || '') && o !== this.strA && o !== this.strB && !this.nocked.children.includes(o)) { o.geometry = o.geometry.clone(); this.own.push(o.geometry); this.flexMeshes.push({ m: o, base: Float32Array.from(o.geometry.attributes.position.array) }); } });
      this.flexNow = 0;
    }
    for (const o of [this.strA, this.strB, this.nocked]) o?.traverse((m) => { if (m.isMesh) { m.renderOrder = 5; m.frustumCulled = false; } });
    /* hands with fingers in the world's glove (ranged-hands.js) in place of the sword fists */
    this.hr = new RangedHand(f.hands.r.fist, false); this.hl = new RangedHand(f.hands.l.fist, true);
    /* both gun hands are drawn the other way about (see ranged-hands.js); the right hand keeps a roll that puts the wrist
       behind the grip and the fingers forward along the frame, and turns toward the shoulder only a little */
    f.hands.r.flipX = true; f.hands.l.flipX = true; f.hands.r.turnBase = prf.kind === 'bow' ? null : -1.2; f.hands.r.turnLim = 0.45;
    this.hr.use(true); this.hl.use(true);
    if (prf.hand) this.hr.offset(...prf.hand);
    /* effects: the flash (a star at the muzzle and a smaller one ahead of it), a light on the hands, tracers, smoke */
    const fo = { map: starTexture(), color: new THREE.Color(this.P.flash || 0xffc070).multiplyScalar(2.4), depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 };
    /* the flash rides the view model (camera space): it stays on the muzzle for its three frames however fast the view turns */
    this.flashSp = bill(fo); this.flashSp.renderOrder = 7; f.vm.add(this.flashSp);
    this.flashSp2 = bill(fo); this.flashSp2.renderOrder = 7; f.vm.add(this.flashSp2);
    /* the flash light: its own, so a hit spark can never steal it; it lights the hands and the gun for the flash frames */
    this.flashL = new THREE.PointLight(this.P.flash || 0xffc070, 0, 3.5, 1.6); f.world.scene.add(this.flashL);
    const tw = prf.bolt ? 0.009 : 0.011;
    const tg = new THREE.CylinderGeometry(tw, tw, 1, 5, 1, true); tg.translate(0, 0.5, 0);
    this.tracers = Array.from({ length: 96 }, () => { const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: new THREE.Color(this.P.tracer).multiplyScalar(2.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); m.frustumCulled = false; m.visible = false; m.userData.t = 9; m.userData.life = 0.1; f.world.scene.add(m); return m; });
    this.tracerI = 0; this.tg = tg;
    /* the tracer head: a short thick streak that runs from the muzzle to the end of the shot (a still frame catches it) */
    const hg = new THREE.CylinderGeometry(0.02, 0.012, 1, 6, 1, true); hg.translate(0, -0.5, 0); this.own.push(hg);
    this.head = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: new THREE.Color(this.P.tracer).multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.head.frustumCulled = false; this.head.visible = false; f.world.scene.add(this.head);
    /* stun pistol: live arcs (the bolt and the spark web on the target) re-drawn every frame of their life */
    this.bolts = [];
    if (prf.coil) {
      /* the charge glow in the coil: grows in the tell and the aim, flares on the shot, burns orange while it vents */
      this.coilSp = bill({ map: glowTexture(), color: new THREE.Color(prf.flash).multiplyScalar(1.6), depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 });
      this.coilSp.position.fromArray(prf.coil); this.coilSp.renderOrder = 8; g.add(this.coilSp);
      this.coilMats = []; g.traverse((o) => { if (o.isMesh && o.material?.userData?.glow) this.coilMats.push({ m: o.material, base: o.material.emissiveIntensity, col: o.material.emissive.clone() }); });
      this.coilK = 0;
    }
    /* reload: a cartridge the off hand carries to the gate, and the spent cases that drop out */
    if (prf.gate) {
      const cg = new THREE.CylinderGeometry(0.0062, 0.0062, 0.032, 10); cg.rotateZ(-Math.PI / 2); const bg = new THREE.ConeGeometry(0.0058, 0.012, 10); bg.rotateZ(-Math.PI / 2); bg.translate(0.022, 0, 0);
      const rim = new THREE.CylinderGeometry(0.0072, 0.0072, 0.0025, 10); rim.rotateZ(-Math.PI / 2); rim.translate(-0.016, 0, 0);
      const brass = new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 0.85, roughness: 0.32, emissive: 0x3a2508 }); const lead = new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 0.4, roughness: 0.5 });
      this.own.push(cg, bg, rim, brass, lead);
      const mk = () => { const c = new THREE.Group(); c.add(new THREE.Mesh(cg, brass), new THREE.Mesh(bg, lead), new THREE.Mesh(rim, brass)); c.traverse((m) => { if (m.isMesh) { m.renderOrder = 5; m.frustumCulled = false; } }); return c; };
      this.cart = mk(); this.cart.visible = false; this.cart.scale.setScalar(1.25); g.add(this.cart);
      this.cases = Array.from({ length: 8 }, () => { const c = new THREE.Group(); c.add(new THREE.Mesh(cg, brass), new THREE.Mesh(rim, brass)); c.visible = false; c.userData = { t: 9, v: V(), w: V() }; f.world.scene.add(c); return c; });
      this.caseI = 0;
    }
    this.smoke = Array.from({ length: 28 }, () => { const s = bill({ map: puffTexture(), color: 0xcfc6b8, opacity: 0 }); s.visible = false; s.renderOrder = 6; s.userData = { t: 9, life: 1, v: V(), g0: 0.1, g1: 0.6, op: 0.4, roll: 0 }; f.world.scene.add(s); return s; });
    this.smokeI = 0;
    this.buildHud(); this.legend();
    this.off = f.world.addUpdater((dt) => this.tickFx(dt));
    f.listeners.push(() => this.dispose());
  }
  dispose() {
    this.off?.(); this.hud?.remove(); this.cross?.remove();
    this.flashSp.removeFromParent(); this.flashSp.material.dispose(); this.flashSp2.removeFromParent(); this.flashSp2.material.dispose(); this.flashL.removeFromParent();
    for (const t of this.tracers) { t.removeFromParent(); t.material.dispose(); } this.tg.dispose();
    this.head.removeFromParent(); this.head.material.dispose(); this.coilSp?.material.dispose();
    for (const c of this.cases || []) c.removeFromParent();
    this.hr?.dispose(); this.hl?.dispose();
    for (const s of this.smoke) { s.removeFromParent(); s.material.dispose(); }
    for (const a of this.arrows) a.m.removeFromParent();
    for (const x of this.own || []) x.dispose?.();
    if (this.arrowKit) for (const x of Object.values(this.arrowKit)) x.dispose?.();
  }

  /* the controls line under the fight (index.html #legend): strike -> shoot, heavy -> aim, plus the melee key and R; put back on dispose */
  legend() {
    const el = document.getElementById('legend'); if (!el) return;
    const before = el.innerHTML; this.f.listeners.push(() => { el.innerHTML = before; });
    const bow = this.P.kind === 'bow'; const whip = { revolver: 'whip', rifle: 'butt', stunner: 'jab', bow: 'bash' }[this.id] || 'melee';
    el.innerHTML = before.replace('</kbd>strike', `</kbd>${bow ? 'loose' : 'shoot'}`).replace('</kbd>heavy', `</kbd>${bow ? 'draw' : 'aim'}`)
      .replace('<span><kbd>Shift</kbd>', `<span><kbd>K</kbd>${whip}</span>${bow ? '' : `<span><kbd>R</kbd>${this.P.recharge ? 'vent' : 'reload'}</span>`}<span><kbd>Shift</kbd>`);
  }
  /* ---------- the HUD: the rounds left and a small aim mark ---------- */
  buildHud() {
    const host = document.getElementById('labels') || document.body;
    const el = document.createElement('div');
    /* the rounds and the reload word sit in one small dark pill just below and right of the reticle, never in the
       controls band at the foot of the screen (the old "Empty" toast printed over it) */
    el.style.cssText = 'position:fixed;left:calc(50% + 26px);top:calc(50% + 22px);display:flex;gap:3px;padding:4px 7px;border-radius:10px;background:rgba(10,8,6,.42);pointer-events:none;z-index:5;transition:opacity .3s;font:600 12px/1 var(--sans, sans-serif);color:rgba(var(--cream-rgb, 240,226,200),.92);text-shadow:0 1px 3px rgba(0,0,0,.8);align-items:center';
    host.appendChild(el); this.hud = el;
    const cr = document.createElement('div');
    cr.style.cssText = 'position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:1.5px solid rgba(255,236,200,.55);box-shadow:0 0 4px rgba(0,0,0,.6);pointer-events:none;z-index:5;transition:opacity .2s';
    const dot = document.createElement('i'); dot.style.cssText = 'position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:rgba(255,240,210,.95)';
    cr.appendChild(dot); host.appendChild(cr); this.cross = cr;
    this.hudKey = '';
  }
  updateHud() {
    const P = this.P; let key;
    const cine = this.f.over || this.f.deathCam || this.f.paused;
    if (P.kind === 'bow') key = `bow|${this.st}`;
    else key = `${this.rounds}|${this.st}`;
    if (key !== this.hudKey) {
      this.hudKey = key;
      if (P.kind === 'bow') { this.hud.textContent = ''; this.hud.style.display = 'none'; }
      else {
        /* no floating VENTING word: while the stun pistol vents its pips burn a dim orange (the coil on the gun glows too) */
        const vent = this.st === 'heat';
        const pip = (on, i) => `<b style="display:inline-block;width:${P.bolt ? 9 : 5}px;height:${P.bolt ? 4 : 9}px;border-radius:${P.bolt ? 1 : 4}px;background:${vent ? 'rgba(255,140,70,.45)' : on ? (P.bolt ? 'rgba(140,240,255,.95)' : 'rgba(232,190,110,.95)') : 'rgba(255,255,255,.12)'};box-shadow:0 0 3px rgba(0,0,0,.7)"></b>`;
        const word = this.st === 'reload' ? 'RELOADING' : this.st === 'heat' ? '' : this.rounds === 0 ? (P.recharge || document.body.classList.contains('touch') ? 'EMPTY' : 'EMPTY · R') /* no key name on a phone; the reload button pulses (touch.js) */ : '';
        const hot = this.st === 'heat' || this.rounds === 0;
        this.hud.innerHTML = Array.from({ length: P.rounds }, (_, i) => pip(i < this.rounds, i)).join('') + (word ? `<span style="margin-left:6px;letter-spacing:.1em;font-size:10px;color:${hot ? 'rgba(255,170,120,.98)' : 'inherit'}">${word}</span>` : '');
      }
    }
    const op = cine ? '0' : '1'; if (this.hud.style.opacity !== op) this.hud.style.opacity = op;
    /* the ring shrinks as the aim steadies */
    const spread = this.spreadNow(); const px = clamp(8 + spread * 700, 8, 34);
    const cop = cine ? '0' : this.f.swing ? '0.25' : '1';
    if (this.cross.style.opacity !== cop) this.cross.style.opacity = cop;
    const w = `${px.toFixed(0)}px`; if (this.cross.style.width !== w) { this.cross.style.width = w; this.cross.style.height = w; this.cross.style.margin = `-${(px / 2).toFixed(0)}px 0 0 -${(px / 2).toFixed(0)}px`; }
  }

  /* ---------- state ---------- */
  held() { return !!(this.f.held || this.f.keys.has('KeyJ')); }
  ready() { return this.st === 'ready' || this.st === 'cycle'; }
  /* fight.tryAttack(light) calls this first; true = the shot took the press, false = a melee blow instead */
  trigger() {
    const f = this.f; const P = this.P;
    /* during a melee blow an empty gun chains the next blow; otherwise the press waits for the hands */
    if (f.swing) return !(P.kind === 'gun' && !P.recharge && this.rounds <= 0) ? (this.queued = true) : false;
    if (f.busy() || f.dodge) return true;
    if (this.st === 'tell' || this.st === 'aim' || this.st === 'draw') return true;
    if (this.st === 'heat') { play(this.id, 'dry'); return true; }
    if (this.st === 'reload') {
      /* a round in the cylinder: the press stops the reload and fires */
      if (this.rounds > 0) { this.st = 'ready'; this.reloadK = 0; } else return true;
    }
    if (P.kind === 'gun' && this.rounds <= 0) {
      /* empty: a foe at arm's length gets the pistol-whip; otherwise the click, and the reload starts by itself */
      if (this.nearFoe(f.weapon.reach + 0.8)) return false;
      play(this.id, 'dry'); if (!P.recharge) this.startReload(); return true;
    }
    if (this.st === 'cycle') { this.queued = true; return true; }
    this.st = P.kind === 'bow' ? 'draw' : 'tell'; this.t = 0; this.k = 0; this.reactT = 0;
    if (P.kind === 'bow') play(this.id, 'draw'); else play(this.id, 'cock');
    this.react(1);
    return true;
  }
  /* R: reload a gun, vent a stun pistol */
  reloadKey() {
    const P = this.P; if (P.kind !== 'gun' || this.f.busy() || this.f.swing) return;
    if (P.recharge) { if (this.st !== 'heat' && this.rounds < P.rounds) { this.st = 'heat'; this.t = 0; play(this.id, 'vent'); this.puffs(this.muzzleWorld(), 3, 0.6, 0x9fb4c0, 0.08); } return; }
    if (this.rounds < P.rounds && this.st !== 'reload') this.startReload();
  }
  startReload() { if (this.P.recharge) return; this.st = 'reload'; this.t = 0; this.loadT = 0; this.phase = 'open'; this.spent = this.P.rounds - this.rounds; this.ejI = 0; play(this.id, 'open'); }
  nearFoe(r) { for (const x of this.f.foes) if (x.state !== 'dead' && x.state !== 'spawn' && x.pos.distanceTo(this.f.pos) < r + (x.scale - 1) * 0.6) return x; return null; }
  /* the hands are busy: no block while a reload or a draw is under way (a reload leaves you open) */
  canBlock() { return this.st !== 'reload'; }
  moveK() { return this.st === 'reload' ? 0.7 : this.st === 'aim' || this.st === 'draw' ? 0.55 : 1; }
  doing() { return this.st === 'aim' || this.st === 'draw' || this.st === 'tell' ? `aiming a ${String(this.f.weapon.label || 'gun').toLowerCase()}` : this.st === 'reload' ? 'reloading' : null; }
  spreadNow() {
    const P = this.P; const steady = this.st === 'aim' || this.st === 'draw' ? this.k : 0;
    let s = lerp(P.spread, P.aimSpread, ease(steady));
    if (this.f.moving) s *= 1.7; if (this.f.dodge) s *= 2.5;
    /* a bow held at full draw too long starts to shake */
    if (this.st === 'draw' && this.t > P.draw + 2.2) s += Math.min(0.03, (this.t - P.draw - 2.2) * 0.02);
    return s;
  }

  /* every frame from fight.updatePlayer (dt = fight time: hit stop and slow motion apply) */
  update(dt) {
    const f = this.f; const P = this.P;
    if (f.dodge || f.kick || f.stagger > 0 || f.swing) {
      /* a dodge, a kick, a stagger or a melee blow lets go of the aim and stops a reload (loaded rounds stay) */
      if (this.st === 'tell' || this.st === 'aim' || this.st === 'draw') { this.st = 'ready'; this.k = 0; }
      if (this.st === 'reload') { this.st = 'ready'; }
    }
    this.cyc = Math.max(0, this.cyc - dt);
    this.t += dt;
    if (this.st === 'tell') {
      if (this.t >= P.tell) { if (this.held()) { this.st = 'aim'; this.t = 0; this.k = 0; } else this.fire(0); }
    } else if (this.st === 'aim') {
      this.k = clamp(this.t / P.steady, 0, 1);
      this.react(dt);
      this.settle(dt);
      if (!this.held()) this.fire(this.k);
    } else if (this.st === 'draw') {
      this.k = clamp(this.t / P.draw, 0, 1);
      this.react(dt);
      this.settle(dt);
      if (!this.held() && this.t >= P.minDraw) this.fire(this.k);
    } else if (this.st === 'cycle') {
      if (this.cyc <= 0) { this.st = 'ready'; if (this.queued) { this.queued = false; this.trigger(); } }
    } else if (this.st === 'ready' && this.queued && !f.swing && !f.busy()) {
      this.queued = false; this.trigger();
    } else if (this.st === 'reload') {
      const R = P.reload; this.loadT += dt;
      /* the spent cases drop out of the gate while it opens */
      if (this.phase === 'open' && this.spent > 0 && this.loadT > 0.06 + this.ejI * 0.045) { this.spent--; this.ejI++; this.ejectCase(); }
      if (this.phase === 'open' && this.loadT >= R.open) { this.phase = 'load'; this.loadT = 0; }
      else if (this.phase === 'load' && this.loadT >= R.each) { this.loadT = 0; this.rounds++; play(this.id, 'load'); if (this.cylP) this.cylA += Math.PI / 3; if (this.rounds >= P.rounds) this.phase = 'close'; }
      else if (this.phase === 'close' && this.loadT >= R.close) { this.st = 'ready'; play(this.id, 'close'); }
    } else if (this.st === 'heat') {
      if (Math.random() < dt * 9) this.puffs(this.muzzleWorld(), 1, 0.35, 0x9fb4c0, 0.06);
      if (this.t >= P.heat) { this.st = 'ready'; this.rounds = P.rounds; }
    }
    /* stun cells refill when the pistol rests */
    if (P.recharge && this.st !== 'heat' && this.rounds < P.rounds && this.st !== 'tell' && this.st !== 'aim') { this.charge += dt; if (this.charge >= P.recharge) { this.charge = 0; this.rounds++; } } else this.charge = 0;
    /* the gun empties: with nobody close, the reload starts by itself after a beat */
    if (P.kind === 'gun' && !P.recharge && this.rounds <= 0 && this.st === 'ready' && !f.swing && !this.nearFoe(f.weapon.reach + 1.2)) { this.emptyT = (this.emptyT || 0) + dt; if (this.emptyT > 0.5) { this.emptyT = 0; this.startReload(); } } else this.emptyT = 0;
    this.updateHud();
  }

  /* the aim settles: while a gun is raised or a bow drawn, the view sinks or lifts toward the chest of the foe it points at
     (a goblin is short; a camera at eye height looks over its head) */
  settle(dt) {
    const f = this.f; const x = this.pickAimed(0.14); if (!x) return;
    const o = f.world.camera.getWorldPosition(V()); const d = Math.max(1, Math.hypot(x.pos.x - o.x, x.pos.z - o.z));
    const want = clamp(Math.atan2(x.actor.root.position.y + 1.15 * x.scale - o.y, d), -0.6, 0.5);
    f.pitch += (want - f.pitch) * Math.min(1, dt * 5);
  }
  /* foes answer the aim: a shield raises its guard, a quick one rolls out of the line */
  react(dt) {
    this.reactT -= dt; if (this.reactT > 0) return; this.reactT = 0.35;
    const f = this.f; const tgt = this.pickAimed(0.12); if (!tgt || tgt.state !== 'idle') return;
    if (tgt.def.blocks && Math.random() < (tgt.group.tactic === 'guard' ? 0.85 : tgt.boss ? 0.5 : 0.4)) { tgt.state = 'block'; tgt.t = 0; tgt.blockFor = 1.2; tgt.actor.play('Sword_Block', { loop: false, fade: 0.08, speed: 1.4 }); }
    else if (tgt.def.dodges && tgt.dodgeCd <= 0 && Math.random() < 0.45) {
      const side = Math.random() < 0.5 ? 1 : -1; const to = V().subVectors(f.pos, tgt.pos).setY(0).normalize();
      tgt.state = 'dodge'; tgt.t = 0; tgt.dodgeDir = V(to.z * side, 0, -to.x * side); tgt.dodgeCd = 2.6;
      tgt.actor.play('Roll', { loop: false, fade: 0.06, speed: 2.4 });
    }
  }
  /* the foe the view points at (within an angle) */
  pickAimed(cone) {
    const f = this.f; const cam = f.world.camera; const o = cam.getWorldPosition(V()); const d = cam.getWorldDirection(V());
    let best = null; let bs = 1e9;
    for (const x of f.foes) {
      if (x.state === 'dead' || x.state === 'spawn') continue;
      const c = V(x.pos.x, x.actor.root.position.y + 1.2 * x.scale, x.pos.z).sub(o); const dist = c.length(); if (dist > this.P.max) continue;
      const ang = c.normalize().angleTo(d); if (ang < cone + 0.5 * x.scale / dist && ang < bs) { bs = ang; best = x; }
    }
    return best;
  }

  /* ---------- the shot ---------- */
  muzzleWorld() {
    const g = this.f.gear; g.updateWorldMatrix(true, false);
    if (this.bowDef) { const b = this.bowDef; return g.localToWorld(V(this.nockX() + b.arrow, b.nock, b.side)); }
    return g.localToWorld(V().fromArray(this.P.muzzle));
  }
  /* the nock (gear-local x): the string at brace, drawn back by the draw, plus the quiver of the string after the loose */
  nockX() {
    const b = this.bowDef; const s = this.snapT ?? 9;
    const quiver = s < 0.5 ? 0.035 * Math.sin(s * 70) * Math.exp(-s * 9) : 0;
    return b.top[0] - this.flexNow * b.flex[0] * 0.25 - b.draw * ease(this.drawK) + quiver;
  }
  fire(k) {
    const f = this.f; const P = this.P;
    this.st = 'cycle'; this.cyc = P.interval; this.t = 0; this.k = 0; this.upT = k > 0.3 ? 0.42 : 0.18;
    if (P.kind === 'gun') this.rounds = Math.max(0, this.rounds - 1);
    this.shots++;
    const cam = f.world.camera; cam.updateMatrixWorld();
    const o = cam.getWorldPosition(V()); const dir = cam.getWorldDirection(V());
    /* spread: a random tilt inside the cone */
    const sp = this.spreadNowFor(k);
    const ax1 = V().crossVectors(dir, UNIT_Y).normalize(); const ax2 = V().crossVectors(ax1, dir).normalize();
    const r = sp * Math.sqrt(Math.random()); const a = Math.random() * Math.PI * 2;
    dir.addScaledVector(ax1, Math.cos(a) * r).addScaledVector(ax2, Math.sin(a) * r).normalize();
    const hit = this.cast(o, dir, k);
    const muzzle = this.muzzleWorld();
    const end = hit ? hit.point : o.clone().addScaledVector(dir, P.max);
    /* where a miss meets the ground: dust */
    let ground = null; if (!hit && dir.y < -0.01) { const t = -(o.y - (f.footY || 0)) / dir.y; if (t > 0 && t < P.max) { ground = o.clone().addScaledVector(dir, t); end.copy(ground); } }
    if (P.kind === 'bow') this.loose(muzzle, end, dir, hit, k);
    else {
      this.recoilK = 1; this.hammerK = 0; if (this.cylP) this.cylA += Math.PI / 3; if (this.levP) this.leverK = 1;
      play(this.id, 'fire');
      if (this.levP) setTimeout(() => play(this.id, 'cock'), 260);
      f.kickPitch += P.kick * 0.25 * (1 - 0.5 * k); f.shake = Math.max(f.shake, 0.22 + P.kick * 0.6); f.world.kick(0.05 + P.kick * 0.2);
      /* the flash (a star at the muzzle, a smaller one ahead along the bore), held for three frames, with its own light on
         the hands; then the tracer or the arc, then the smoke */
      const bore = V().subVectors(end, muzzle).normalize();
      const big = (P.bolt ? 0.28 : 0.4 + Math.random() * 0.08) * (P.hold === 'rifle' ? 1.3 : 1);
      f.vm.updateWorldMatrix(true, false);
      this.flashSp.position.copy(f.vm.worldToLocal(muzzle.clone().addScaledVector(bore, 0.02))); this.flashSp.userData.roll = Math.random() * 6.28; this.flashSp.scale.setScalar(big);
      this.flashSp2.position.copy(f.vm.worldToLocal(muzzle.clone().addScaledVector(bore, big * 0.55))); this.flashSp2.userData.roll = Math.random() * 6.28; this.flashSp2.scale.setScalar(big * 0.6);
      this.flashF = 0; this.setFlash(1); face(this.flashSp, cam); face(this.flashSp2, cam);
      this.flashL.color.set(P.flash); this.flashL.position.copy(muzzle).addScaledVector(bore, -0.08);
      if (P.bolt) { this.arc(muzzle, end, 0.16, 2); if (hit) this.web(hit.point, bore); } else this.tracer(muzzle, end, 0.12, true);
      if (!P.bolt) { this.puffs(muzzle.clone().addScaledVector(dir, 0.12), 4, 1.0, 0xd8d0c2, 0.11); this.puffs(muzzle.clone().addScaledVector(dir, 0.5), 3, 1.4, 0xcfc6b8, 0.17); }
      else this.puffs(muzzle, 2, 0.5, 0x9fe8ff, 0.06);
      if (ground) { this.puffs(ground, 3, 0.8, 0xb59a74, 0.25); f.sparks(ground, V(0, 1, 0), P.bolt ? P.tracer : 0xffd9a0, 6, 3); }
      if (P.bolt) this.coilK = 2.2;
      if (hit) this.apply(hit, dir, k);
    }
    /* no "Empty" toast (it printed over the controls bar): the pill by the reticle says EMPTY · R */
    if (P.recharge && this.rounds === 0) { this.st = 'heat'; this.t = 0; play(this.id, 'vent'); }
  }
  spreadNowFor(k) { const P = this.P; let s = lerp(P.spread, P.aimSpread, ease(k)); if (this.f.moving) s *= 1.7; if (this.P.kind === 'bow' && k < 0.4) s *= 1.3; return s; }
  /* what the ray meets first: a foe (body capsule, head), a dragon part (sphere) */
  cast(o, dir, k) {
    const f = this.f; const P = this.P; let best = null;
    const assist = 0.022;
    for (const x of f.foes) {
      if (x.state === 'dead' || x.state === 'spawn') continue;
      const base = x.actor.root.position.y; const s = x.scale; const wide = x.wide ? x.wide * 0.4 : 0;
      const p0 = V(x.pos.x, base + 0.3 * s, x.pos.z); const p1 = V(x.pos.x, base + 1.85 * s, x.pos.z);
      const r = raySeg(o, dir, p0, p1); if (r.t <= 0.2 || r.t > P.max) continue;
      const rad = 0.4 * s + wide; const allow = rad + assist * r.t + (r.t < 3 ? 0.25 * (1 - r.t / 3) : 0); /* point-blank: the foe in your face fills the view */
      if (r.dist > allow) continue;
      if (!best || r.t < best.t) best = { foe: x, t: r.t, point: o.clone().addScaledVector(dir, r.t), head: r.s > 0.84, dist: r.t };
    }
    if (f.boss && !f.boss.dead) {
      for (const h of f.boss.hittable()) {
        const rad = h.radius ?? h.r ?? 0.6; const c = _c.copy(h.pos).sub(o); const t = c.dot(dir); if (t <= 0.2 || t > P.max) continue;
        const d2 = c.lengthSq() - t * t; if (d2 > (rad + assist * t) ** 2) continue;
        if (!best || t < best.t) best = { part: h, t, point: o.clone().addScaledVector(dir, Math.max(0.2, t - rad * 0.6)), head: h.part === 'head', dist: t };
      }
    }
    /* SQ: a shot also breaks a quest anchor (a chain post): the nearest thing on the line wins */
    if (f.props) for (const p of f.props) {
      if (p.kind !== 'anchor' || p.hp <= 0) continue;
      const gy = f.journey ? f.journey.gy(p.pos.x, p.pos.z) : 0;
      for (const h of [0.6, 1.2, 1.8]) {
        const c = _c.set(p.pos.x, gy + h, p.pos.z).sub(o); const t = c.dot(dir); if (t <= 0.2 || t > P.max) continue;
        const d2 = c.lengthSq() - t * t; if (d2 > (0.6 + assist * t) ** 2) continue;
        if (!best || t < best.t) best = { prop: p, t, point: o.clone().addScaledVector(dir, t), head: false, dist: t };
      }
    }
    return best;
  }
  /* the hit: falloff by range, the aim bonus, the head, the guard, the boss's thick hide */
  apply(hit, dir, k) {
    const f = this.f; const P = this.P;
    const d = hit.dist; const fall = d <= P.near ? 1 : d >= P.far ? P.farK : 1 - (1 - P.farK) * (d - P.near) / (P.far - P.near);
    let dmg = lerp(P.dmg, P.aimDmg, k) * fall * f.power; let poise = lerp(P.poise, P.aimPoise, k) * fall;
    if (hit.head && k > 0.55) { dmg *= P.head; poise *= 1.3; }
    const flat = V(dir.x, 0, dir.z).normalize();
    const color = P.bolt ? P.tracer : (hit.head && k > 0.55 ? 0xffffff : 0xffd9a0);
    this.hits++;
    if (hit.prop) { f.shotProp(hit.prop, hit.point, flat); return; } /* SQ: a quest anchor takes the shot */
    if (hit.part) {
      const crit = f.crit > 0;
      f.boss.damage(hit.part.id, dmg * P.boss * (crit ? 2 : 1) * f.bossMul * (f.c2dragon ? f.c2dragon(hit.part, k) : 1), flat, { heavy: false, crit }); /* combat2 */
      f.sparks(hit.point, flat.clone().negate(), color, 10, 5); f.hitstop = Math.max(f.hitstop, 0.03);
      return;
    }
    const x = hit.foe;
    const facing = V(Math.sin(x.yaw), 0, Math.cos(x.yaw)).dot(flat) < -0.3;
    if (x.state === 'dodge') return;
    if (x.state === 'block' && facing && !(f.crit > 0)) {
      /* the shot rings off the raised guard: a rifle's aimed shot knocks it aside, anything else only wears it */
      f.sparks(hit.point, flat.clone().negate(), 0xffe2b0, 14, 6); sfx('deflect');
      x.blockHits++; x.poise -= poise * 0.4;
      if ((P.guardBreak && k > 0.7) || x.blockHits >= 4 || x.poise <= 0) f.staggerFoe(x, flat, 'Guard broken');
      else x.blockFor = Math.max(x.blockFor || 0, 0.8);
      return;
    }
    if (x.boss) { dmg *= P.boss; poise *= P.bossPoise; }
    f.damageFoe(x, dmg, flat, { knock: 0.5 + k * 0.7, poise, side: hit.head ? 'H' : 'C', at: hit.point, color, shot: true, aim: k }); /* combat2: a shot (aim k): an aimed head shot pierces the boss's armour */
    if (P.bolt && x.state !== 'dead') x.actor.flash?.(P.tracer, 260, 0.04);
    f.hitstop = Math.max(f.hitstop, 0.025 + k * 0.05); f.shake = Math.max(f.shake, 0.3 + k * 0.25);
    if (hit.head && k > 0.55) f.embers(hit.point, x.eye, 8);
  }

  /* ---------- bow: the arrow flies and sticks ---------- */
  /* the bow's glb carries a detailed arrow (SQ_NockShaft, SQ_NockFletch, SQ_NockHead: a nocked shaft, three curved vanes, a head).
     The glb meshes stay hidden; their geometry, moved so the nock is the origin and the shaft runs along +x, becomes the arrow the game nocks and shoots. */
  glbArrow() {
    const find = (re) => { let hit = null; this.f.gear.traverse((o) => { if (!hit && o.isMesh && re.test(o.material?.name || '')) hit = o; }); return hit; };
    const sh = find(/SQ_NockShaft/); const fl = find(/SQ_NockFletch/); const hd = find(/SQ_NockHead/); if (!sh || !fl || !hd) return null;
    sh.geometry.computeBoundingBox(); const bb = sh.geometry.boundingBox; const o = V(bb.min.x, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    const geo = (m) => { const g = m.geometry.clone(); g.translate(-o.x, -o.y, -o.z); this.own.push(g); return g; };
    const mat = (m) => { const c = m.material.clone(); c.side = THREE.DoubleSide; this.own.push(c); return c; };
    return { shaft: geo(sh), fl: geo(fl), head: geo(hd), ms: mat(sh), mf: mat(fl), mh: mat(hd) };
  }
  makeArrowKit() {
    const b = this.bowDef;
    const glb = this.glbArrow(); if (glb) return { glb };
    const shaft = new THREE.CylinderGeometry(0.0045, 0.0045, b.arrow, 5); shaft.rotateZ(-Math.PI / 2); shaft.translate(b.arrow / 2, 0, 0);
    const head = new THREE.ConeGeometry(0.011, 0.05, 5); head.rotateZ(-Math.PI / 2); head.translate(b.arrow + 0.02, 0, 0);
    const fl = new THREE.PlaneGeometry(0.075, 0.018); fl.translate(0.045, 0.009, 0);
    return { shaft, head, fl, ms: new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.7 }), mh: new THREE.MeshStandardMaterial({ color: b.head, metalness: 0.8, roughness: 0.4 }), mf: new THREE.MeshStandardMaterial({ color: b.fletch, roughness: 0.9, side: THREE.DoubleSide }) };
  }
  makeArrow() {
    const K = this.arrowKit; const g = new THREE.Group();
    if (K.glb) { g.add(new THREE.Mesh(K.glb.shaft, K.glb.ms), new THREE.Mesh(K.glb.head, K.glb.mh), new THREE.Mesh(K.glb.fl, K.glb.mf)); return g; }
    g.add(new THREE.Mesh(K.shaft, K.ms), new THREE.Mesh(K.head, K.mh));
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(K.fl, K.mf); m.rotation.x = i * Math.PI * 2 / 3; g.add(m); }
    return g;
  }
  loose(muzzle, end, dir, hit, k) {
    const f = this.f; const P = this.P;
    play(this.id, 'fire'); play(this.id, 'fly'); f.kickPitch += 0.01; f.shake = Math.max(f.shake, 0.12);
    this.nocked.visible = false; this.drawK = 0; this.snapT = 0;
    const m = this.makeArrow(); m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); m.scale.set(1, 1.3, 1.3); /* a thicker shaft and fletching in flight, so a still frame catches it */
    f.world.scene.add(m);
    const from = muzzle.clone(); const to = end.clone(); const len = from.distanceTo(to);
    const speed = P.speed * (0.45 + 0.55 * k);
    const fly = V().subVectors(to, from).normalize();
    _q.setFromUnitVectors(V(1, 0, 0), fly); m.quaternion.copy(_q); m.position.copy(from).addScaledVector(fly, -this.bowDef.arrow);
    this.arrows.push({ m, from, to, t: 0, dur: Math.max(0.04, len / speed), hit, dir: fly, aim: dir.clone(), k, drop: (1 - k) * 0.06 * len, stuck: false, life: 0 });
  }
  arrowArrive(a) {
    const f = this.f; const h = a.hit;
    if (h && h.foe && (h.foe.state === 'dead' || h.foe.state === 'dodge')) a.hit = null;
    if (a.hit) {
      const armored = !!a.hit.part || (a.hit.foe && a.hit.foe.order?.length - (a.hit.foe.broken || 0) > 0); /* steel rings, a body thuds */
      this.apply(a.hit, a.aim, a.k); play('bow', armored ? 'hitArmor' : 'hit');
      /* the arrow stays in the body */
      const root = a.hit.foe?.actor?.root || null;
      a.m.position.addScaledVector(a.dir, 0.22); /* the head sinks in */
      if (root && a.hit.foe.state !== 'dead') { root.updateWorldMatrix(true, false); root.attach(a.m); a.stuck = true; a.on = a.hit.foe; }
      else a.stuck = true;
    } else { a.stuck = true; play('bow', 'miss'); this.puffs(a.m.position, 2, 0.6, 0xb59a74, 0.2); }
  }

  /* ---------- effects ---------- */
  /* a straight tracer from a to b that fades over its life; head = also run the bright streak down it */
  tracer(a, b, life = 0.1, head = false, w = 1) {
    const t = this.tracers[this.tracerI++ % this.tracers.length]; const len = a.distanceTo(b);
    t.position.copy(a); t.quaternion.setFromUnitVectors(UNIT_Y, V().subVectors(b, a).normalize()); t.scale.set(w, len, w); t.visible = true; t.userData.t = 0; t.userData.life = life; t.userData.bolt = false; t.material.opacity = 1;
    if (head) { const h = this.head; h.userData = { a: a.clone(), b: b.clone(), t: 0, len }; h.quaternion.copy(t.quaternion); h.visible = true; h.material.opacity = 1; this.placeHead(0); }
  }
  /* the streak: 2.5 m long (shorter on a short shot), its front runs from the muzzle to the end in 0.06 s, then it fades */
  placeHead(k) {
    const h = this.head; const u = h.userData; const L = Math.min(2.5, u.len * 0.6); const front = Math.min(u.len, 0.4 + (u.len + L) * k);
    h.position.copy(u.a).addScaledVector(_c.subVectors(u.b, u.a).normalize(), front); h.scale.set(1, Math.max(0.05, Math.min(L, front)), 1);
  }
  /* a stun bolt: strands of jagged segments from a to b; each frame of its life the jags are drawn again (it crackles) */
  arc(a, b, life = 0.16, strands = 2) {
    for (let s = 0; s < strands; s++) this.bolts.push({ a: a.clone(), b: b.clone(), t: 0, life: life * (s ? 0.8 : 1), n: 9, jag: s ? 1.4 : 1, w: s ? 0.6 : 1.25, segs: [] });
    this.drawBolts();
  }
  /* the spark web on a stunned target: short forked arcs out from the hit point, in a ring across the shot line */
  web(at, dir) {
    const ax1 = V().crossVectors(dir, UNIT_Y).normalize(); const ax2 = V().crossVectors(ax1, dir).normalize();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5; const r = 0.35 + Math.random() * 0.3;
      const tip = at.clone().addScaledVector(ax1, Math.cos(a) * r).addScaledVector(ax2, Math.sin(a) * r).addScaledVector(dir, -0.1 - Math.random() * 0.15);
      this.bolts.push({ a: at.clone(), b: tip, t: -i * 0.012, life: 0.24, n: 4, jag: 2.2, w: 0.7, segs: [] });
    }
  }
  drawBolts() {
    for (const B of this.bolts) {
      if (B.t < 0) continue;
      for (const s of B.segs) s.visible = false; B.segs.length = 0;
      const len = B.a.distanceTo(B.b); const j = Math.min(0.28, len * 0.04) * B.jag; let prev = B.a;
      for (let i = 1; i <= B.n; i++) {
        const p = B.a.clone().lerp(B.b, i / B.n); if (i < B.n) p.add(V((Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j));
        const t = this.tracers[this.tracerI++ % this.tracers.length]; const l = prev.distanceTo(p);
        t.position.copy(prev); t.quaternion.setFromUnitVectors(UNIT_Y, _c.subVectors(p, prev).normalize()); t.scale.set(B.w, l, B.w); t.visible = true; t.userData.t = 0; t.userData.life = 9; t.userData.bolt = true;
        t.material.opacity = Math.max(0, 1 - B.t / B.life) * (0.75 + Math.random() * 0.25); B.segs.push(t); prev = p;
      }
    }
  }
  setFlash(o) {
    this.flashSp.material.opacity = o; this.flashSp2.material.opacity = o * 0.85;
    this.flashL.intensity = o * (this.P.bolt ? 5 : 9);
  }
  /* a spent case drops from the gate (world space), spins and falls */
  ejectCase() {
    const c = this.cases?.[this.caseI++ % this.cases.length]; if (!c) return;
    const g = this.f.gear; g.updateWorldMatrix(true, false);
    c.position.copy(g.localToWorld(V().fromArray(this.P.gate))); c.quaternion.copy(g.getWorldQuaternion(new THREE.Quaternion())); c.scale.setScalar(g.getWorldScale(V()).x);
    const side = V(0, 0, 1).applyQuaternion(c.quaternion);
    c.userData.t = 0; c.userData.v.copy(side).multiplyScalar(0.6 + Math.random() * 0.4).add(V(0, 0.5 + Math.random() * 0.5, 0)); c.userData.w.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7); c.visible = true;
    play(this.id, 'load', { volume: 0.4 });
  }
  puffs(at, n, life = 1, color = 0xcfc6b8, size = 0.18) {
    for (let i = 0; i < n; i++) {
      const s = this.smoke[this.smokeI++ % this.smoke.length]; const u = s.userData;
      s.position.copy(at).add(V((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06));
      u.t = 0; u.life = life * (0.8 + Math.random() * 0.5); u.v.set((Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5); u.g0 = size * 0.5; u.g1 = size * 2.6; u.op = 0.46;
      s.material.color.set(color); u.roll = Math.random() * 6.28; s.visible = true;
    }
  }
  tickFx(rdt) {
    const f = this.f; const dt = rdt * (f.hitstop > 0 ? 0.05 : f.slow > 0 ? 0.3 : 1);
    const cam = f.world.camera;
    for (const b of [this.flashSp, this.flashSp2, this.coilSp]) if (b && b.material.opacity > 0) face(b, cam);
    for (const s of this.smoke) if (s.visible) face(s, cam);
    if (this.dbgHold) return; /* test hook: hold the flash, the tracer and the smoke still for a frame */
    /* the flash counts frames, not time: full, then 0.7, then 0.35, then gone (three frames at any frame rate) */
    if (this.flashF != null) { this.flashF++; const o = [1, 0.7, 0.35][this.flashF] ?? 0; this.setFlash(o); if (o <= 0) this.flashF = null; }
    for (const t of this.tracers) { if (!t.visible || t.userData.bolt) continue; t.userData.t += rdt; t.material.opacity = Math.max(0, 1 - t.userData.t / t.userData.life); if (t.userData.t > t.userData.life) t.visible = false; }
    if (this.head.visible) { const u = this.head.userData; u.t += rdt; const k = u.t / 0.06; this.placeHead(Math.min(1, k)); this.head.material.opacity = k < 1 ? 1 : Math.max(0, 1 - (u.t - 0.06) / 0.08); if (u.t > 0.14) this.head.visible = false; }
    if (this.bolts.length) {
      for (const B of this.bolts) B.t += rdt;
      for (const B of this.bolts) if (B.t > B.life) { for (const s of B.segs) { s.visible = false; s.userData.bolt = false; } B.gone = true; }
      this.bolts = this.bolts.filter((B) => !B.gone); this.drawBolts();
    }
    if (this.cases) for (const c of this.cases) {
      if (!c.visible) continue; const u = c.userData; u.t += dt;
      u.v.y -= 9.8 * dt; c.position.addScaledVector(u.v, dt); c.rotation.x += u.w.x * dt; c.rotation.y += u.w.y * dt; c.rotation.z += u.w.z * dt;
      const floor = (f.footY || 0) + 0.02; if (c.position.y < floor) { c.position.y = floor; u.v.multiplyScalar(0.3); u.v.y = Math.abs(u.v.y) * 0.3; u.w.multiplyScalar(0.5); }
      if (u.t > 3) c.visible = false;
    }
    if (this.coilSp) this.tickCoil(rdt);
    for (const s of this.smoke) {
      if (!s.visible) continue; const u = s.userData; u.t += dt; const k = u.t / u.life;
      if (k >= 1) { s.visible = false; s.material.opacity = 0; continue; }
      s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.max(0, 1 - dt * 1.5)); s.scale.setScalar(lerp(u.g0, u.g1, Math.sqrt(k))); s.material.opacity = u.op * (1 - k) * Math.min(1, k * 8);
    }
    for (const a of this.arrows) {
      if (!a.stuck) {
        a.t += dt; const k = Math.min(1, a.t / a.dur);
        a.m.position.lerpVectors(a.from, a.to, k).addScaledVector(a.dir, -this.bowDef.arrow); a.m.position.y -= a.drop * 4 * k * (1 - k);
        if (k >= 1) this.arrowArrive(a);
      } else { a.life += dt; if (a.life > 7 || (a.on && a.on.gone)) { a.m.removeFromParent(); a.gone = true; } }
    }
    if (this.arrows.some((a) => a.gone)) this.arrows = this.arrows.filter((a) => !a.gone);
  }

  /* the stun coil: a cyan glow that builds while the shot is held, flares on the shot, burns orange and pulses while it vents */
  tickCoil(rdt) {
    const P = this.P; const st = this.st; const hot = st === 'heat';
    let want = st === 'tell' || st === 'aim' ? 0.65 + 0.45 * this.k : 0.18 + 0.3 * (this.rounds / P.rounds);
    if (hot) want = 0.55 + 0.35 * Math.sin(this.f.clock * 16);
    this.coilK = this.coilK > want ? Math.max(want, this.coilK - rdt * 7) : this.coilK + (want - this.coilK) * Math.min(1, rdt * 10);
    const flick = st === 'aim' ? 0.9 + Math.random() * 0.2 : 1;
    const m = this.coilSp.material; m.color.set(hot ? 0xff7a30 : P.flash).multiplyScalar(1.7); m.opacity = Math.min(1, this.coilK * 0.85 * flick);
    this.coilSp.scale.setScalar(0.04 + 0.035 * Math.min(1.6, this.coilK));
    for (const c of this.coilMats) { if (hot) c.m.emissive.set(0xff6a20); else c.m.emissive.copy(c.col); c.m.emissiveIntensity = c.base * (0.45 + 0.8 * Math.min(1.5, this.coilK)) * flick; }
  }

  /* ---------- the first-person hold (poseViewModel) ----------
   pose(tp, tq): the target hand pose while no melee blow runs; recoil(R): the kick added after the hand follows;
   afterPose(): the left hand, the string and the arrow, after the arms are solved */
  pose(tp, tq, rawDt) {
    /* a stagger keeps the ranged hold (fight.js adds its drop and roll after this); it fell back to the sword rest before,
       which threw the bow and the forearm into odd places.
       so do a kick and a block. Before, a kick and a guard fell back to the SWORD rest and guard, which hold the
       grip axis of a gun up-and-forward and its barrel across: the rifle stood upright, tilted left, seen from behind the
       stock". A blow is placed by fight.js from blow() (the gun's own arcs). */
    const f = this.f; if (f.charge) return;
    const P = this.P; this.upT = Math.max(0, (this.upT || 0) - rawDt);
    /* after a shot the gun (or the bow) stays up a moment, so the recoil and the follow-through read before it lowers */
    const aiming = this.st === 'aim' || this.st === 'draw' || this.st === 'tell' || (this.upT > 0 && this.st === 'cycle');
    this.aimK += ((aiming ? 1 : 0) - this.aimK) * Math.min(1, rawDt * (aiming ? 14 : 8));
    this.reloadK += ((this.st === 'reload' || this.st === 'heat' ? 1 : 0) - this.reloadK) * Math.min(1, rawDt * 9);
    this.zoomNow = P.zoom * this.aimK * (this.st === 'aim' || this.st === 'draw' ? 0.4 + 0.6 * this.k : 0.3);
    if (f.swing) return;
    if (f.blocking) { this.guardPose(tp, tq); return; }
    this.holdPose(tp, tq);
    /* the hammer comes back in the tell; a bow's draw shakes a little at full draw */
    if (this.st === 'tell' || this.st === 'aim') this.hammerK = Math.min(1, this.hammerK + rawDt * 12); else if (this.st !== 'cycle') this.hammerK = Math.max(0, this.hammerK - rawDt * 4);
    if (this.st === 'draw') { this.drawK = this.k; if (this.t > P.draw + 2.2) { tp.x += Math.sin(f.clock * 47) * 0.004; tp.y += Math.cos(f.clock * 39) * 0.004; } }
    /* at rest the arrow stays nocked with the string a little back, so the bow hand and the draw hand are apart */
    else { const fl = this.bowDef && this.st !== 'cycle' ? 0.22 : 0; this.drawK = this.drawK > fl ? Math.max(fl, this.drawK - rawDt * 12) : Math.min(fl, this.drawK + rawDt * 1.5); }
    /* the reload: a small bob for each round going in */
    if (this.st === 'reload' && this.phase === 'load' && P.reload) { const b = Math.sin((this.loadT / P.reload.each) * Math.PI); tp.y += b * 0.012; }
  }
  /* the hold with no blow under way: rest, aim or reload as the timers stand, the bore turned to the view axis */
  holdPose(tp, tq) {
    const P = this.P; const H = HOLDS[P.hold]; const A = this.aimK; const L = this.reloadK;
    _a.lerpVectors(H.rest.p, H.aim.p, A); _b.lerpVectors(H.rest.d, H.aim.d, A).normalize(); _c.lerpVectors(H.rest.e, H.aim.e, A).normalize();
    if (L > 0.001) { _a.lerp(H.load.p, L); _b.lerp(H.load.d, L).normalize(); _c.lerp(H.load.e, L).normalize(); }
    tp.copy(_a); quatOf(_b, _c, tq);
    /* turn the hold so the bore (or the nocked arrow) runs through a point on the view axis, close at rest
       (the barrel still points at the reticle on screen, and its side shows) and far when aimed; none while it reloads */
    const conv = P.conv || [3, 30]; this.aimFix(tp, tq, lerp(conv[0], conv[1], A), 1 - L);
  }
  /* the guard. The weapon comes up in front of the body, barrel forward and a little out, canted; never the sword's guard */
  guardPose(tp, tq) {
    const G = HOLDS[this.P.hold].guard; tp.copy(G.p); quatOf(G.d, G.e, tq);
  }
  /* the same hold as a target for fight.js's blows (recover to it, flow from it), as a position and a turn */
  restPose() {
    const o = (this._restO ||= { p: V(), q: new THREE.Quaternion(), d: V(), e: V() });
    if (this.f.blocking) this.guardPose(o.p, o.q); else this.holdPose(o.p, o.q);
    return o;
  }
  /* the gun's own blow for a move of fight.js (rl, lr, over, slam, thrust): a pistol-whip, a rifle jab or a bash with a
     bow, with the barrel always out in front (the sword arcs swing the grip axis through the view: a rifle came out upright or
     with the muzzle at the lens). Same shape as ARCS: p (hand path), d (grip axis), eb (the barrel or the belly of the bow). */
  blow(name) { return GUN_ARCS[this.P.hold]?.[name] || GUN_ARCS[this.P.hold]?.over || null; }
  /* rotate tq (the least turn) so the gear's bore line, offset from the fist, passes through (0, 0, -dist) in camera space */
  aimFix(tp, tq, dist, w) {
    if (w <= 0.001) return;
    const g = this.f.gear; g.updateMatrix();
    const b = this.bowDef; const loc = b ? _f1.set(b.top[0], b.nock, b.side) : _f1.set(0, this.P.muzzle[1], this.P.muzzle[2]);
    const oh = loc.applyMatrix4(g.matrix); const xh = _f2.set(1, 0, 0).applyQuaternion(g.quaternion);
    for (let i = 0; i < 2; i++) {
      const o = _f3.copy(oh).applyQuaternion(tq).add(tp);
      const want = _f4.set(0, 0, -dist).sub(o).normalize(); const cur = _f5.copy(xh).applyQuaternion(tq);
      _fq.setFromUnitVectors(cur, want); if (w < 1) _fq.slerp(_qI, 1 - w);
      tq.premultiply(_fq);
    }
  }
  recoil(R, rawDt) {
    const P = this.P; const k = this.recoilK;
    if (k > 0.001) {
      /* a hard snap up and back, then an eased return (k falls from 1 to 0 in about 0.2 s) */
      const e = k * k;
      R.holder.position.z += P.kick * 0.55 * e; R.holder.position.y += P.kick * 0.18 * e;
      R.holder.quaternion.multiply(_q.setFromAxisAngle(_z.set(0, 0, 1), (P.kickRot ?? P.kick * 2.6) * e));
      if (!this.dbgHold) this.recoilK = Math.max(0, k - rawDt * 5.5);
    }
    if (this.cylP) { this.cylShow = (this.cylShow || 0) + (this.cylA - (this.cylShow || 0)) * Math.min(1, rawDt * 22); this.cylP.rotation.x = this.cylShow; }
    if (this.hamP) this.hamP.rotation.z = this.hammerK * 0.55;
    if (this.levP) { this.leverK = Math.max(0, this.leverK - rawDt * 2.2); this.levP.rotation.z = this.leverK > 0 ? Math.sin((1 - this.leverK) * Math.PI) * 0.8 : 0; }
  }
  afterPose() {
    const f = this.f; const P = this.P; const Lh = f.hands.l;
    let show = false; let lPose = 'cup';
    const free = !f.swing && !f.blocking && !f.kick;
    if (this.cart) this.cart.visible = false;
    /* the off hand is a CLOSED hand or none. A rifle keeps it round the fore-end in every state (a blow, a guard, a
       kick too: the gun is held in two hands); a pistol shows it only to load (the pinch), the open "cup" under the grip is gone;
       a bow's draw hand hooks the string at rest and in the draw, and is out of the frame for a bash. */
    {
      const loading = this.reloadK > 0.3 && P.gate && this.st === 'reload';
      if (loading) {
        /* a round goes in: the off hand pinches a cartridge, carries it to the gate and pushes it into the chamber */
        show = true; lPose = 'pinch';
        const u = this.phase === 'load' ? clamp(this.loadT / P.reload.each, 0, 1) : this.phase === 'open' ? 0 : 1;
        const e = ease(clamp(u / 0.75, 0, 1)); const c = this.cart;
        c.visible = this.phase !== 'close' && u < 0.92;
        c.position.set(P.gate[0] - 0.06 * (1 - e) - 0.004, P.gate[1] - 0.004 - 0.03 * (1 - e), P.gate[2] + 0.004 + 0.045 * (1 - e));
        this.gripAt(_f6.copy(c.position).add(_f7.set(-0.03, -0.012, 0.024)), 0.5);
      } else if (P.hold === 'rifle') { show = true; lPose = 'grip'; this.gripAt(V().fromArray(P.forend), Math.PI / 2); }
      else if (P.hold === 'bow' && free) {
        /* the drawing hand hooks the string at the nock, from rest to the full draw at the cheek */
        const b = this.bowDef; show = true; lPose = 'hook';
        this.gripAt(_f6.set(this.nockX(), b.nock, 0), 0);
      }
    }
    for (const k of ['fist', 'fore', 'upper']) Lh[k].visible = show;
    if (show) this.hl.set(lPose, 1);
    if (lPose === 'pinch') this.hl.offset(0.03, -0.022, 0.034); else this.hl.offset(0, 0, 0);
    /* always a closed fist round the grip. The trigger pose (index finger out) read as a pointing finger across the grip
       from behind, like an open hand across the barrel, and the gun's trigger guard is out of sight there anyway. */
    this.hr.set('grip', 1);
    if (this.bowDef) {
      const b = this.bowDef; const e = ease(this.drawK);
      /* a bash with a 1.6 m yumi swept the limb across the eye (half the frame went black): the bow is drawn smaller
         while a melee blow runs */
      const sc = b.fp * (f.swing ? 0.55 : 1); const g = f.gear; g.scale.setScalar(g.scale.x + (sc - g.scale.x) * 0.35);
      this.flex(e);
      const nock = _f6.set(this.nockX(), b.nock, 0);
      const T = b.top[1]; const B = -b.bot[1];
      const top = _f1.set(b.top[0] - b.flex[0] * T * e, b.top[1] - b.flex[1] * T * e, 0); const bot = _f2.set(b.bot[0] - b.flex[0] * B * e, b.bot[1] + b.flex[1] * B * e, 0);
      aimRod(this.strA, top, nock); aimRod(this.strB, bot, nock);
      if (this.st === 'cycle' && !this.nocked.visible && this.cyc < this.P.interval * 0.5) this.nocked.visible = true;
      if (this.st !== 'cycle') this.nocked.visible = true;
      this.nocked.position.set(nock.x, nock.y, b.side);
      if (this.snapT != null) this.snapT += 1 / 60;
    }
    /* the hero is down: the hands and the weapon sink out of the view (no arm left standing on the ground) */
    if (f.over && f.hp <= 0) {
      this.deadK = Math.min(1, (this.deadK || 0) + 1 / 40);
      f.vm.position.y -= this.deadK * 0.8; f.vm.rotation.x -= this.deadK * 0.6;
      if (this.deadK >= 1) f.vm.visible = false;
    }
  }
  /* the limbs bend back and in as the string is drawn (e = 0..1), from a copy of the rest shape */
  flex(e) {
    if (Math.abs(e - this.flexNow) < 0.003 && !(e === 0 && this.flexNow !== 0)) return;
    this.flexNow = e; const b = this.bowDef; const T = b.top[1]; const B = -b.bot[1]; const gh = b.grip;
    for (const F of this.flexMeshes) {
      const pa = F.m.geometry.attributes.position; const A = pa.array; const S = F.base;
      for (let i = 0; i < A.length; i += 3) {
        const y = S[i + 1]; let dx = 0; let dy = 0;
        if (y > gh) { const s = (y - gh) / (T - gh); dx = -b.flex[0] * T * e * s * s; dy = -b.flex[1] * T * e * s * s; }
        else if (y < -gh) { const s = (-y - gh) / (B - gh); dx = -b.flex[0] * B * e * s * s; dy = b.flex[1] * B * e * s * s; }
        A[i] = S[i] + dx; A[i + 1] = y + dy; A[i + 2] = S[i + 2];
      }
      pa.needsUpdate = true;
    }
  }
  /* the left fist grips a point of the gear (gear-local); turn = a roll about the gear's barrel (a forend is held across) */
  gripAt(local, turn) {
    const f = this.f; const g = f.gear; const vm = f.vm; const R = f.hands.r;
    g.updateWorldMatrix(true, false); vm.updateWorldMatrix(true, false);
    const w = g.localToWorld(local.clone()); const p = vm.worldToLocal(w);
    const q = R.holder.quaternion.clone(); if (turn) q.multiply(_q.setFromAxisAngle(V(0, 0, 1), turn));
    f.solveArm(f.hands.l, p, q);
  }
}

/* rod from a to b (gear-local), unit cylinder along +Y */
function aimRod(m, a, b) { const d = V().subVectors(b, a); const len = d.length(); m.position.copy(a); m.quaternion.setFromUnitVectors(UNIT_Y, d.normalize()); m.scale.set(1, len, 1); }

/* blade (grip) along +Y, edge (barrel) along +X: the same frame as fight.js quatOf */
const _x = V(); const _y = V(); const _z = V();
const _f1 = V(); const _f2 = V(); const _f3 = V(); const _f4 = V(); const _f5 = V(); const _f6 = V(); const _f7 = V();
const _fq = new THREE.Quaternion(); const _qI = new THREE.Quaternion();
function quatOf(d, e, out) {
  _y.copy(d).normalize(); _x.copy(e).addScaledVector(_y, -e.dot(_y));
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _x.normalize(); _z.crossVectors(_x, _y);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}
/* camera-space holds: p = the fist, d = the grip axis, e = the barrel (or a bow's belly) */
const hp3 = (p, d, e) => ({ p: V(...p), d: D(...d), e: D(...e) });
/* a hold from the fist (p), where the barrel points (b) and which way "up" leans (the grip axis is up with its part
   along the barrel taken out: the barrel is square to the grip, as the gun is built). Every barrel below points into the scene. */
const GH = (p, b, up = [0, 1, 0]) => { const B = D(...b); const u = V(...up).normalize(); u.addScaledVector(B, -u.dot(B)).normalize(); return { p: V(...p), d: u, e: B }; };
/* a blow of the gun as an arc of fight.js (p: the fist path, d: the grip axis, eb: the barrel, three points of a Bezier path) */
const GA = (ps, bs, ups) => {
  const eb = bs.map((b) => D(...b)); const d = eb.map((B, i) => { const u = V(...(ups?.[i] || [0, 1, 0])).normalize(); return u.addScaledVector(B, -u.dot(B)).normalize(); });
  return { p: ps.map((a) => V(...a)), d, eb, single: true };
};
const mirrorArc = (a) => ({ p: a.p.map((v) => V(-v.x, v.y, v.z)), d: a.d.map((v) => V(-v.x, v.y, v.z)), eb: a.eb.map((v) => V(-v.x, v.y, v.z)), single: true });
const GUN_ARCS = (() => {
  const thrust = GA([[0.3, -0.36, -0.4], [0.2, -0.32, -0.68], [0.1, -0.28, -0.95]], [[-0.25, 0.12, -0.96], [-0.12, 0.08, -0.99], [-0.02, 0.05, -1]], [[0.2, 1, 0.15], [0.12, 1, 0.1], [0.05, 1, 0.1]]);
  /* a one-hand pistol: the whip comes across with the barrel leading, never turned further than about 35 degrees from forward */
  const rl = GA([[0.42, -0.06, -0.52], [0.2, -0.2, -0.84], [-0.24, -0.3, -0.62]], [[0.45, 0.05, -0.89], [-0.1, 0, -1], [-0.55, -0.05, -0.83]], [[0.15, 1, 0], [0, 1, 0], [-0.25, 1, 0]]);
  const over = GA([[0.3, -0.02, -0.56], [0.24, -0.16, -0.86], [0.18, -0.4, -0.64]], [[-0.1, 0.6, -0.79], [-0.1, 0, -1], [-0.1, -0.55, -0.83]]);
  const slam = GA([[0.3, 0.02, -0.56], [0.24, -0.16, -0.86], [0.18, -0.44, -0.64]], [[-0.1, 0.72, -0.69], [-0.1, 0, -1], [-0.1, -0.65, -0.76]]);
  return { pistol: { rl, lr: mirrorArc(rl), over, slam, thrust }, rifle: { thrust, over, slam, rl, lr: mirrorArc(rl) } };
})();
const HOLDS = {
  /* rest low right and canted in a little, so the barrel and the cylinder show from the side (it read as a grey
     slab from behind); aim under and right of the reticle, so the sights sit below the target, not on it; load: the gun
     lies on its side, muzzle up and forward (standing straight up looked wrong)
     load and guard keep the barrel forward (a reload must not stand the rifle on its muzzle) */
  pistol: { rest: hp3([0.24, -0.3, -0.58], [-0.3, 1, 0.1], [-0.2, 0.06, -1]), aim: hp3([0.075, -0.235, -0.56], [-0.08, 1, 0.06], [-0.01, 0.025, -1]), load: GH([0.16, -0.25, -0.52], [-0.4, 0.2, -0.9], [0.1, 1, 0.1]), guard: GH([0.2, -0.22, -0.5], [-0.2, 0.3, -0.93], [0.4, 1, 0.1]) },
  rifle: { rest: hp3([0.22, -0.36, -0.34], [0.2, 1, 0.4], [-0.3, 0.16, -1]), aim: hp3([0.08, -0.26, -0.3], [0.0, 1, 0.22], [-0.01, 0.07, -1]) /* lower, the bore up onto the centre line */, load: GH([0.1, -0.22, -0.5], [-0.5, 0.15, -0.85], [0.1, 1, 0.15]), guard: GH([0.16, -0.26, -0.42], [-0.3, 0.3, -0.9], [0.45, 1, 0.1]) },
  /* the bow: at rest low on the right and canted hard, so the curve of the limbs shows; drawn, the bow hand is out at arm's
     length just left of centre, the upper limb canted away from the reticle, and the nock comes back to the cheek */
  bow: { rest: hp3([0.24, -0.3, -0.62], [0.9, 1, 0.15], [-0.25, 0, -1]), aim: hp3([-0.13, -0.15, -0.95], [-0.35, 1, 0.05], [0, 0, -1]) /* further out, so the draw hand at the nock stays off the lens */, load: hp3([0.24, -0.3, -0.62], [0.9, 1, 0.15], [-0.25, 0, -1]), guard: hp3([0.2, -0.22, -0.62], [0.35, 1, 0.1], [-0.15, 0, -1]) /* the bow stands up in front of the body, belly forward */ },
};

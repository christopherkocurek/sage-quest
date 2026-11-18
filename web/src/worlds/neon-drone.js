import { finishFoe, foeRng, build, HEAVY } from './foe-look.js';
/* The Neon City Drone foe dress (the fight.js dressFoe hook). The knight body is hidden (foe look body: false); this handle
   builds the quadcopter in code on the pelvis bone, so it follows the hover, the wobble and the fall: an angular carbon
   fuselage with a canopy, a chin turret with a red lens, cyan side strips, four arms out to motor pods, guarded rotors
   that spin (a blurred blade disc), two skids and a blinking tail light. The wardrobe 'Drone' part (wear_neon.glb) stays
   as the still fallback for sheets without the fight, and is hidden here. On death (fight.js drops it with sparks and
   tilts it) the lens dies, the rotors spin down, one arm snaps and droops with its motor, the frame twists, and the
   broken motor keeps spitting sparks: a wreck on the street, never a drone parked on the road. */
import * as THREE from 'three';

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  /* a rotor blur: two faint blade streaks over a very faint disc, drawn once on a canvas */
  const S = 128; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  const disc = g.createRadialGradient(0, 0, 4, 0, 0, S / 2); disc.addColorStop(0, 'rgba(200,220,230,0.10)'); disc.addColorStop(0.9, 'rgba(200,220,230,0.06)'); disc.addColorStop(1, 'rgba(200,220,230,0)');
  g.fillStyle = disc; g.beginPath(); g.arc(0, 0, S / 2, 0, Math.PI * 2); g.fill();
  for (const a of [0, Math.PI]) { g.save(); g.rotate(a); for (let k = 0; k < 14; k++) { g.rotate(-0.045); g.fillStyle = `rgba(20,22,26,${0.5 * (1 - k / 14)})`; g.fillRect(0, -3, S / 2 - 3, 6); } g.restore(); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const blurM = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.38, metalness: 0.55 });
  const shell = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.3, metalness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.08, metalness: 0.9 });
  /* the company's livery: a pale grey shell, red running lights (the heroes' light is cyan or warm), a searchlight cone */
  const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a30).multiplyScalar(2.6), toneMapped: false });
  const corp = new THREE.MeshStandardMaterial({ color: 0xb8bdc4, roughness: 0.4, metalness: 0.2 });
  const coneM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, uniforms: { uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uK; varying vec2 vUv; void main(){ float a = pow(vUv.y, 1.6) * 0.16 * uK; gl_FragColor = vec4(vec3(1.0, 0.9, 0.85) * a, 1.0); }' });
  /* a spark: a small star on a canvas (additive) */
  const c2 = document.createElement('canvas'); c2.width = c2.height = 32; const g2 = c2.getContext('2d'); const sg = g2.createRadialGradient(16, 16, 0, 16, 16, 16); sg.addColorStop(0, 'rgba(255,255,255,1)'); sg.addColorStop(0.25, 'rgba(255,210,140,0.8)'); sg.addColorStop(1, 'rgba(255,120,40,0)'); g2.fillStyle = sg; g2.fillRect(0, 0, 32, 32);
  const sparkM = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c2), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const B = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateX(rx); b.rotateY(ry); b.translate(x, y, z); return b; };
  const geo = {
    blur: new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2),
    body: B(0.26, 0.1, 0.4), canopy: B(0.17, 0.06, 0.24, 0, 0.075, -0.03), nose: B(0.22, 0.07, 0.12, 0, 0.02, 0.22, -0.45),
    tail: B(0.12, 0.05, 0.12, 0, 0.03, -0.25, 0.3), arm: B(0.05, 0.035, 1, 0, 0, 0.5), strip: B(0.006, 0.012, 0.3),
    motor: new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12), guard: new THREE.TorusGeometry(0.225, 0.012, 6, 28).rotateX(Math.PI / 2),
    turret: new THREE.SphereGeometry(0.065, 14, 10), lens: new THREE.CircleGeometry(0.038, 18), skid: B(0.016, 0.016, 0.36), leg: B(0.012, 0.09, 0.012),
    led: new THREE.SphereGeometry(0.014, 8, 6), cone: new THREE.CylinderGeometry(0.03, 0.42, 1.5, 16, 1, true).translate(0, -0.75, 0),
    mark: new THREE.RingGeometry(0.035, 0.05, 16), markBar: new THREE.PlaneGeometry(0.014, 0.11),
  };
  SHARED = { blurM, carbon, shell, glass, cyan, corp, coneM, geo, sparkM }; /* kept for the session: every drone shares them */
  return SHARED;
}

const _m = new THREE.Matrix4();
const DC = new THREE.Vector3(0, 1.12, 0); /* the drone centre in the rig's bind space, front toward +z */
const MOTORS = [[-0.34, 0.3], [0.34, 0.3], [-0.34, -0.3], [0.34, -0.3]];

/* the company livery's red marks and visors (SQN_CorpRed, SQN_CorpVisor) are lit in their own colour: mark them as glow,
   so a hit flash (world.js actor.flash) never leaves them dark afterwards */
const CORP_LIT = /SQN_Corp(Red|Visor)/;
function keepCorpLit(actor) {
  actor.root.traverse((o) => { if (o.isMesh && CORP_LIT.test(o.material?.name || '')) { o.userData.glow = true; o.material.userData.glow = true; } });
}

/*three of each kind from the wardrobe (hood, knit cap, respirator, goggles, pack; mask or visor;
   a long coat; a pale, graphite or red-striped helmet), a matte finish (worlds/foe-look.js; the pale polymer stays the
   company colour but stops shining like an egg) and a captain with the company's red: big pale pauldrons with red trim,
   a red sash and a red pennant on a mast. */
const NV = {
  minion: [{ on: ['Hood_tech', 'Band_corp'], off: [] }, { on: ['Cap_knit', 'Mask_resp'], off: ['Hood_tech', 'Band_corp'] }, { on: ['Hood_tech', 'Goggles', 'Mask_cloth', 'Backpack'], off: ['Band_corp'] }],
  warrior: [{ on: [], off: [] }, { on: ['Coat_long'], off: [] }, { on: ['Visor'], off: ['Mask_corp'] }],
  rogue: [{ k: 1 }, { k: 0.86 }, { k: 1.16 }],
  brute: [{ helm: null }, { helm: 0x2a2c31 }, { helm: 0x8a1a1e, on: ['Backpack'] }],
};
const N_STYLE = {
  matte: { metal: { rough: 0.45, env: 0.35 }, cloth: { rough: 0.8, env: 0.22 } },
  classOf: (n) => (/SQN_CorpWhite|SQN_CorpDark/.test(n) ? 'leather' : null),
  rank(actor, foeId, kit) {
    if (foeId === 'rogue') return [];
    return [kit.pauldrons(actor, 0xc4c8ce, { r: foeId === 'brute' ? 0.18 : 0.16, metal: 0.1, rough: 0.55, trim: 0xc0202a }), kit.sash(actor, 0xa01820, { w: 0.06 }),
      kit.banner(actor, 0xc0202a, { pole: 0x1a1c20, h: 1.25, flag: [0.18, 0.42], mark: 0x14161a })];
  },
};
export function dressFoe(actor, foeId, ctx = {}) {
  keepCorpLit(actor);
  const R = foeRng(ctx, foeId); const V = NV[foeId]?.[R.variant(3)] || {};
  const show = (p, on) => { for (const m of actor.parts?.get(p) || []) m.visible = on; };
  for (const p of V.off || []) show(p, false); for (const p of V.on || []) show(p, true);
  if (V.helm != null) for (const m of actor.parts?.get('Helm_corp') || []) if (/SQN_CorpWhite/.test(m.material?.name || '')) m.material.color.setHex(V.helm);
  if (V.k && actor.model) actor.model.scale.multiplyScalar(V.k);
  if (actor.model && foeId !== 'rogue') { const sc = actor.model.scale; sc.set(sc.x * R.range(0.95, 1.07), sc.y * R.range(0.96, 1.05), sc.z * R.range(0.95, 1.07)); }
  const unbuild = foeId === 'brute' ? build(actor, HEAVY) : null;
  const fin = finishFoe(actor, foeId, ctx, N_STYLE, R);
  if (foeId !== 'rogue') return { update: (dt, s) => fin.update(dt, s), onDeath() {}, dispose() { fin.dispose(); unbuild?.(); } };
  let rig = null; let spinners = []; let speed = 38; let dead = false; let t = Math.random() * 3; let lensM = null; let ledM = null;
  let frame = null; let broken = null; let cone = null; let sparks = []; let dt0 = 0; const side = Math.random() < 0.5 ? -1 : 1; const lit = [];
  const setup = () => {
    let sm = null; actor.root.traverse((o) => { if (!sm && o.isSkinnedMesh && o.skeleton?.bones.some((b) => /pelvis/i.test(b.name))) sm = o; });
    if (!sm) return;
    const sk = sm.skeleton; const bi = sk.bones.findIndex((b) => /pelvis/i.test(b.name)); const bone = sk.bones[bi];
    /* bind space -> pelvis bone space: boneInverse x bindMatrix; the drone is built in bind space under this holder */
    _m.multiplyMatrices(sk.boneInverses[bi], sm.bindMatrix);
    const S = shared(); const g = S.geo;
    rig = new THREE.Group(); _m.decompose(rig.position, rig.quaternion, rig.scale); bone.add(rig);
    const d = new THREE.Group(); d.position.copy(DC); rig.add(d); frame = d;
    let to = d; /* the parent the next parts go to (the broken arm's group while its motor is built) */
    const add = (geo, mat, x = 0, y = 0, z = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; to.add(m); if (mat === S.cyan) lit.push(m); return m; };
    d.scale.setScalar(1.3); /* bigger, so it reads at fight range */
    add(g.body, S.corp); add(g.canopy, S.carbon); add(g.nose, S.corp); add(g.tail, S.corp);
    /* the company mark on both flanks: a red ring with a bar through it */
    for (const sx of [-1, 1]) { const mk = add(g.mark, S.cyan, sx * 0.132, 0.0, 0.06, false); mk.rotation.y = sx * Math.PI / 2; const bar = add(g.markBar, S.cyan, sx * 0.133, 0.0, 0.06, false); bar.rotation.y = sx * Math.PI / 2; }
    /* its searchlight: a pale cone from the turret down to the street (it goes out at death) */
    cone = add(g.cone, S.coneM, 0, -0.08, 0.2, false); cone.renderOrder = 4;
    for (const sx of [-1, 1]) add(g.strip, S.cyan, sx * 0.131, 0.01, -0.02, false);
    add(g.turret, S.glass, 0, -0.06, 0.2);
    lensM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a30).multiplyScalar(5), toneMapped: false });
    const lens = add(g.lens, lensM, 0, -0.065, 0.262, false); lens.rotation.x = 0.25;
    const ring = add(g.guard, S.cyan, 0, -0.065, 0.257, false); ring.scale.setScalar(0.24); ring.rotation.x = 0.25 - Math.PI / 2;
    MOTORS.forEach(([mx, mz], i) => {
      /* the front motor on one side is built in its own group, hinged at the body: it is the arm that snaps at death */
      to = d; if (i === (side > 0 ? 1 : 0)) { broken = new THREE.Group(); broken.position.set(mx * 0.3, 0.035, mz * 0.3); d.add(broken); to = new THREE.Group(); to.position.set(-mx * 0.3, -0.035, -mz * 0.3); broken.add(to); broken.userData.m = [mx, mz]; }
      const arm = new THREE.Mesh(g.arm, S.carbon); arm.castShadow = true; arm.scale.z = Math.hypot(mx, mz); arm.rotation.y = Math.atan2(mx, mz); arm.position.y = 0.035; to.add(arm);
      add(g.motor, S.shell, mx, 0.06, mz);
      add(g.guard, S.shell, mx, 0.1, mz, false); add(g.guard, S.cyan, mx, 0.088, mz, false).scale.set(1.01, 0.4, 1.01);
      const holder = new THREE.Object3D(); holder.position.set(mx, 0.104, mz); to.add(holder);
      const blade = new THREE.Mesh(g.blur, S.blurM); blade.rotation.y = Math.random() * 6; blade.renderOrder = 3; holder.add(blade);
      spinners.push({ blade, dir: spinners.length % 2 ? 1 : -1, broken: to !== d });
      if (to !== d) for (let k = 0; k < 3; k++) { const sp = new THREE.Sprite(S.sparkM.clone()); sp.position.set(mx, 0.08, mz); sp.scale.setScalar(0.001); sp.renderOrder = 8; to.add(sp); sparks.push({ sp, life: 0, v: new THREE.Vector3() }); }
    });
    to = d;
    for (const sx of [-1, 1]) { add(g.skid, S.shell, sx * 0.1, -0.15, 0.0); add(g.leg, S.shell, sx * 0.1, -0.1, 0.1); add(g.leg, S.shell, sx * 0.1, -0.1, -0.1); }
    ledM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(4), toneMapped: false });
    add(g.led, ledM, 0, 0.06, -0.31, false);
  };
  const hideWear = () => { for (const m of actor.parts?.get('Drone') || []) m.visible = false; };
  return {
    update(dt) {
      if (!rig) setup();
      if (!rig) return;
      hideWear(); t += dt;
      if (dead) { speed = Math.max(0, speed - dt * 30); dt0 += dt;
        /* the wreck: the arm snaps down, the frame twists, the broken motor spits sparks (bursts, then now and then) */
        const k = Math.min(1, dt0 * 4);
        if (broken) { const [mx, mz] = broken.userData.m; broken.rotation.z = -Math.sign(mx) * 0.75 * k; broken.rotation.x = Math.sign(mz) * 0.35 * k; }
        frame.rotation.x = 0.3 * k; frame.rotation.z = side * 0.45 * k; frame.rotation.y = side * 0.35 * k;
        for (const p of sparks) {
          if (p.life <= 0) { if (Math.random() < dt * (dt0 < 1.5 ? 9 : 2.2)) { p.life = 0.12 + Math.random() * 0.18; p.sp.position.set(broken.userData.m[0], 0.08, broken.userData.m[1]); p.v.set((Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6); p.sp.material.color.setRGB(1, 0.75 + Math.random() * 0.25, 0.5); } else { p.sp.scale.setScalar(0.001); continue; } }
          p.life -= dt; p.v.y -= 6 * dt; p.sp.position.addScaledVector(p.v, dt); p.sp.scale.setScalar(0.05 + 0.1 * Math.max(0, p.life) / 0.3);
        }
      }
      for (const s of spinners) if (!(dead && s.broken)) s.blade.rotation.y += s.dir * speed * dt; else s.blade.visible = false;
      if (ledM) ledM.color.setRGB(dead ? 0 : 4 * (0.1 + Math.pow(Math.max(0, Math.sin(t * 4)), 8)), 0.1, 0.1);
    },
    onDeath() { dead = true; if (cone) cone.visible = false; if (lensM) lensM.color.setRGB(0.05, 0.01, 0.01); const S = shared(); for (const m of lit) m.material = S.shell; /* every light on it goes out: a wreck, not a parked drone */ },
    dispose() { fin.dispose(); rig?.removeFromParent(); rig = null; spinners = []; for (const p of sparks) p.sp.material.dispose(); sparks = []; lensM?.dispose(); ledM?.dispose(); },
  };
}

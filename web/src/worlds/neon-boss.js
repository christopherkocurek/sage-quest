/* The Neon City bosses (web/src/worlds/neon.js re-exports dressBoss).
   tower (lich mechanic, bare: true and size 2.1 on the nemesis entry, so the dark lich adds no parts): The Tower's core, "a company
     made flesh": a machine about 13 m tall to its spire (the visor head at about 8.8 m) that floats with its keel 2 m over the
     street. A dark octagonal body (1.3 times wider, a building, not a pole) with a downward keel; four vertical fins; a cage
     of rails and collars; eight clad plates with lit window cells; a head with a red eye slit, a hinged jaw over a red maw, a
     crown ring, setbacks and a spire; armoured shoulders and two jointed arms with three-pronged claws.
the flesh under the glass: the core and the neck are red meat with veins that pulse with a heartbeat; the windows
     pulse with the same beat, a wave that runs up the floors; the floors breathe (the body swells, each tier of plates opens
     like a gill a moment after the one below it, so red light shows in the seams); the head looks round, the jaw works.
     The heart races in a wind-up and as it weakens.
 attacks, three readable poses that take turns (the mechanic's attack clock drives each one: wind-up to the hit, then
     the recovery): SWEEP (it twists away with one claw raised high behind it, then whips that claw low across the street),
     STOMP (it rises with both claws up, then drops onto its keel: the keel spears the street, a shock ring, dust, sparks and
     a glowing crack in the asphalt) and LUNGE (it rears back with the jaw opening, then leans down over the hero with both
     claws thrust forward). On a wind-up the plates flare open (red light in every seam) and the heart races.
     Searchlights (no longer flat wedges): two soft additive cones, brightest through their middle and fading at their
     edges, with drifting dust and dust motes in them: the eye's beam hunts the hero (it turns red and a lock ring closes on an
     attack), a shoulder lamp sweeps the street in wide arcs. Hits: the windows at the hit's height flash white, sparks spray
     from the hit, the body rocks back. Street lamps and light poles in its way are knocked flat (neon-lands.js knockPoles).
     Fight: a red lock ring round the hero's feet and a red line on the street on an attack; the lobby doors at the foot of the
     front plate open with red light and a red chevron fan runs down the street to the hero ( human-scale tell).
     keepOut 5.2 m (the claws reach about 4.3 m at eye height); lookAt sits on the visor (the tall-boss camera frames the face).
     Bolts read as data lances (boltLook). It summons Drones (summon: 'rogue' on the nemesis entry).
     Death (6.2 s): the camera stands well back (keepOut 11.4: about 11-14 m). The eye flares and dies for good; the jaw drops slack; twelve
     floors go dark from the top, each with a white pop, sparks and lit glass; the heart slows and stops, the veins go grey;
     the lift fails, it sags and drops: the keel spears the street, it topples sideways across the view and its low claw
     slams down and holds it (impact: a shock ring, dust, glass, a crack in the street and heaved asphalt slabs); the arm
     buckles a little and it settles at about 36 degrees, head bowed, the other arm hanging. It stays a building: about 9 m
     to the spire as it lies, taller than the container stacks. Smoke and sparks rise from the wreck; the eyes stay dark.
   other (twin mechanic): null, so the dark glass mirror of the hero's own look is used (gear: the entry's cable whip). */
import * as THREE from 'three';
import { dressBoss as darkDress } from '../bosses.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { knockPoles } from './neon-lands.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(); const _w = new THREE.Vector3(); const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _d = new THREE.Vector3(); const _g = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0); const _c = new THREE.Color(); const _q = new THREE.Quaternion(); const _m = new THREE.Matrix4(); const _s = new THREE.Vector3(); const _e = new THREE.Euler(); const _mi = new THREE.Matrix4();
/* the heartbeat: a double thump once per unit of phase (lub-dub) */
const beatAt = (x) => { const p = x - Math.floor(x); return Math.exp(-(((p - 0.08) * 16) ** 2)) + 0.55 * Math.exp(-(((p - 0.26) * 16) ** 2)); };
const BEAT_GLSL = 'float sqBeat(float x){ float p = fract(x); return exp(-pow((p - 0.08) * 16.0, 2.0)) + 0.55 * exp(-pow((p - 0.26) * 16.0, 2.0)); }';
const NOISE3 = `float sqH3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sqN3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sqH3(i), sqH3(i + vec3(1,0,0)), f.x), mix(sqH3(i + vec3(0,1,0)), sqH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sqH3(i + vec3(0,0,1)), sqH3(i + vec3(1,0,1)), f.x), mix(sqH3(i + vec3(0,1,1)), sqH3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

export function dressBoss(actor, nemesisId, ctx = {}) {
  if (nemesisId === 'tower') return towerCore(actor, ctx);
  return null;
}

/* the window cells on a clad plate: a grid of small lit panes by plate position; floors above uCut (core units) are dark,
   so the death turns them off floor by floor from the top; uK scales it all; uSeed varies the plates; uY0 = the plate's base.
   uPh = the heartbeat phase (a pulse that climbs the floors), uHit/uHitY = a white flash on the floors round a hit */
const CELL_PARS = `varying vec3 vCo; uniform float uCut; uniform float uK; uniform float uTime; uniform vec3 uCol; uniform float uSeed; uniform float uY0; uniform float uFl; uniform float uPh; uniform float uHit; uniform float uHitY; ${BEAT_GLSL}`;
const CELL_FRAG = `{
  vec2 g = vCo.xy / vec2(0.045, 0.07) + vec2(uSeed * 13.0, 0.0); vec2 ci = floor(g); vec2 cf = fract(g);
  float h = fract(sin(dot(ci + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
  float band = step(0.5, fract(sin(ci.y * 3.1 + uSeed * 7.0) * 917.3));
  float pane = step(0.2, cf.x) * step(cf.x, 0.8) * step(0.25, cf.y) * step(cf.y, 0.78);
  float on = step(0.8 - band * 0.2, h) * pane;
  float blink = 0.7 + 0.3 * step(0.5, fract(h * 7.0 + uTime * (0.15 + h * 0.3)));
  float y = uY0 + vCo.y; float alive = 1.0 - step(uCut, y);
  vec3 c = mix(uCol, vec3(1.0, 0.82, 0.6), step(0.9, h));
  /* the pulse: every lit pane swells with the beat, the beat climbs the body (the lower floors first) */
  float pulse = 0.5 + 0.85 * sqBeat(uPh - y * 0.45);
  totalEmissiveRadiance += c * on * blink * alive * uK * 0.9 * pulse;
  /* the pulse also wakes a faint red in the dark panes: blood in the glass */
  totalEmissiveRadiance += vec3(0.9, 0.08, 0.06) * pane * (1.0 - on) * alive * uK * 0.06 * sqBeat(uPh - y * 0.45);
  /* a hit: the floors round it flash white */
  totalEmissiveRadiance += vec3(1.0, 0.95, 0.9) * pane * alive * uHit * 2.4 * exp(-pow((y - uHitY) * 5.0, 2.0));
  /* the floor that has just gone out pops white-hot for a moment (every pane of it, lit or not), then stays dark */
  float just = step(uCut, y) * (1.0 - step(uCut + 0.12, y)) * step(0.15, cf.x) * step(cf.x, 0.85) * step(0.2, cf.y) * step(cf.y, 0.82);
  totalEmissiveRadiance += vec3(1.0, 0.92, 0.82) * just * uFl;
}`;
function cellMaterial(shared, seed, y0) {
  /* rough and with little sky in it: a plate seen from a low angle never turns into a flat grey mirror */
  const m = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.62, metalness: 0.5, envMapIntensity: 0.22 });
  const U = { ...shared, uSeed: { value: seed }, uY0: { value: y0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCo;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCo = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${CELL_PARS}`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${CELL_FRAG}`);
  };
  m.customProgramCacheKey = () => 'neon-cells4';
  return m;
}
/* the flesh under the glass: wet dark red meat with branching veins that light with the heartbeat (uBeat 0..2) and die
   with it (uLife 1 -> 0: the veins go grey) */
function fleshMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0x2a0709, roughness: 0.3, metalness: 0.05, envMapIntensity: 0.35 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFp; uniform float uBeat; uniform float uLife; uniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float a = atan(vFp.z, vFp.x);
        float v1 = abs(sin(a * 6.0 + vFp.y * 26.0 + sin(vFp.y * 61.0 + a * 3.0) * 0.9));
        float v2 = abs(sin(a * 4.0 - vFp.y * 19.0 + 1.7 + sin(vFp.y * 43.0) * 0.6));
        float vein = smoothstep(0.16, 0.0, min(v1, v2));
        float wet = 0.5 + 0.5 * sin(vFp.y * 140.0 + a * 9.0 + uTime * 0.7);
        vec3 hot = mix(vec3(0.35, 0.36, 0.38) * 0.12, vec3(1.0, 0.1, 0.07), uLife);
        totalEmissiveRadiance += hot * (0.12 + 0.05 * wet + vein * (0.35 + 1.9 * uBeat)) * (0.25 + 0.75 * uLife); }`);
  };
  m.customProgramCacheKey = () => 'neon-flesh1';
  return m;
}

/* a mesh between two points: a unit cylinder along +Y, placed and stretched each frame (no geometry rebuild) */
function span(mesh, a, b) {
  _v.subVectors(b, a); const L = _v.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(_v, 0.5); mesh.quaternion.setFromUnitVectors(UP, _v.multiplyScalar(1 / L)); mesh.scale.set(1, L, 1);
}

const FLAT_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const additive = (uniforms, frag, side = THREE.FrontSide) => new THREE.ShaderMaterial({ uniforms, vertexShader: FLAT_VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side });

/* a searchlight with volume: a cone (narrow end at the lamp) drawn additive, brightest where the view looks through its
   middle and fading to nothing at its silhouette (so it never reads as a flat wedge), with drifting dust in it and a cloud of
   dust motes that drift and glint inside it; a soft pool of light on the street at its end */
function makeBeam(scene, mats, geos, motes = 150) {
  const U = { uCol: { value: new THREE.Color(0xcfeeff) }, uK: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uCol; uniform float uK; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW; ${NOISE3}
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float body = pow(facing, 2.2);                                   /* thick through the middle, nothing at the edge */
        float along = mix(0.32, 1.0, pow(1.0 - vUv.y, 1.6)) * (1.0 - smoothstep(0.82, 1.0, vUv.y)) * smoothstep(0.0, 0.06, vUv.y);
        float dust = 0.45 + 0.9 * sqN3(vW * 0.7 + vec3(0.0, -uTime * 0.35, uTime * 0.12)) * (0.6 + 0.6 * sqN3(vW * 2.1 + vec3(uTime * 0.2, 0.0, 0.0)));
        gl_FragColor = vec4(uCol * body * along * dust * uK * 0.2, 1.0); }` });
  const geo = new THREE.CylinderGeometry(1, 0.06, 1, 32, 1, true).translate(0, 0.5, 0); geos.push(geo);
  const beam = new THREE.Mesh(geo, mat); beam.frustumCulled = false; beam.renderOrder = 5; scene.add(beam); mats.push(mat);
  /* motes in the cone's own unit space (the beam's scale stretches them with it) */
  const a = new Float32Array(motes * 4); for (let i = 0; i < motes; i++) { a[i * 4] = Math.random(); a[i * 4 + 1] = Math.random() * 6.283; a[i * 4 + 2] = Math.sqrt(Math.random()); a[i * 4 + 3] = Math.random(); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(motes * 3), 3)); mg.setAttribute('aP', new THREE.BufferAttribute(a, 4)); geos.push(mg);
  mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mm = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `attribute vec4 aP; uniform float uTime; varying float vA; void main(){
      float y = fract(aP.x + uTime * (0.012 + 0.03 * aP.w)); float r = aP.z * (0.06 + 0.94 * y) * 0.8; float an = aP.y + uTime * (0.25 * aP.w - 0.12);
      vec4 mv = modelViewMatrix * vec4(cos(an) * r, y, sin(an) * r, 1.0);
      vA = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.8, 1.0, y)) * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (2.0 + aP.w * 5.0) + aP.w * 40.0), 4.0));
      gl_PointSize = (1.0 + aP.w * 2.0) * 18.0 / max(1.0, -mv.z) + 1.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform vec3 uCol; uniform float uK; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(mix(uCol, vec3(0.85, 0.92, 1.0), 0.75) * (1.0 - d) * vA * uK * 0.7, 1.0); }' }); /* the dust stays pale when the beam turns red */
  const pts = new THREE.Points(mg, mm); pts.frustumCulled = false; pts.renderOrder = 6; beam.add(pts); mats.push(mm);
  const spotM = additive({ uCol: U.uCol, uK: { value: 0 } }, 'uniform vec3 uCol; uniform float uK; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = uK * (pow(max(0.0, 1.0 - r), 1.6) * 0.5 + (1.0 - smoothstep(0.85, 1.0, r)) * smoothstep(0.6, 0.85, r) * 0.08); gl_FragColor = vec4(uCol * a, 1.0); }');
  const sg = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); geos.push(sg);
  const spot = new THREE.Mesh(sg, spotM); spot.renderOrder = 4; spot.frustumCulled = false; scene.add(spot); mats.push(spotM);
  const aim = new THREE.Vector3(); let init = false;
  return {
    U, beam, spot, spotM, aim,
    /* from (world point), to the street point `to` (lerped at `rate`), cone radius R at the far end, strength k */
    point(from, to, R, k, rate, t) {
      if (!init) { aim.copy(to); init = true; } else aim.lerp(to, rate);
      _v.subVectors(aim, from); const L = _v.length() || 1; beam.position.copy(from); beam.quaternion.setFromUnitVectors(UP, _v.multiplyScalar(1 / L)); beam.scale.set(R, L, R);
      U.uK.value = k; U.uTime.value = t; spot.position.set(aim.x, aim.y + 0.04, aim.z); spot.scale.setScalar(R * 1.2); spotM.uniforms.uK.value = k * 1.1;
    },
    off(dt) { U.uK.value *= Math.max(0, 1 - dt * 10); spotM.uniforms.uK.value = U.uK.value; },
  };
}

/* The death and impact effects, in world space: one pool of point particles (sparks that fall and bounce, dust and steam
   that rise and spread) and a pool of glass shards (instanced triangles that tumble, land flat and glint). a pool of
   street cracks (they glow red-hot, then cool to dark lines) and heaved asphalt slabs. */
function makeFx(scene, groundAt) {
  const N = 900;
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 3); const siz = new Float32Array(N); const alp = new Float32Array(N);
  const vel = new Float32Array(N * 3); const life = new Float32Array(N); const age = new Float32Array(N); const kind = new Uint8Array(N); const s0 = new Float32Array(N); const c0 = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('aA', new THREE.BufferAttribute(alp, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uScale: { value: 620 } },
    vertexShader: 'attribute vec3 aCol; attribute float aSize; attribute float aA; uniform float uScale; varying vec3 vCol; varying float vA; void main(){ vCol = aCol; vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vCol; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; if (d > 1.0) discard; float a = (1.0 - d); a *= a; gl_FragColor = vec4(vCol * a * vA, 1.0); }' });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 8; scene.add(points);
  let head = 0;
  const emit = (x, y, z, vx, vy, vz, color, size, lf, k) => {
    const i = head; head = (head + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    _c.set(color); c0[i * 3] = _c.r; c0[i * 3 + 1] = _c.g; c0[i * 3 + 2] = _c.b; s0[i] = size; life[i] = lf; age[i] = 0; kind[i] = k;
  };
  /* glass: 170 lit window shards. Long thin slivers drawn additive in their own light: cyan-white facade glass and a few warm
     window panes; they flash as they tumble, trail sparks, land flat on the wet street and cool to a faint glint over about 3 s */
  const G = 170; const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.16, 0, -0.55, 0.2, 0, -0.38, 0.03, 0, 0.75, 0.03, 0, 0.75, 0.2, 0, -0.38, 0.26, 0, 0.2], 3)); tri.computeVertexNormals();
  const gmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const glass = new THREE.InstancedMesh(tri, gmat, G); glass.frustumCulled = false; glass.renderOrder = 7; scene.add(glass);
  const gp = new Float32Array(G * 3); const gv = new Float32Array(G * 3); const gr = new Float32Array(G * 3); const gw = new Float32Array(G * 3); const gs = new Float32Array(G); const gst = new Uint8Array(G); /* 0 unused, 1 flying, 2 rest */
  const gc = new Float32Array(G * 3); const ga = new Float32Array(G); const gph = new Float32Array(G);
  let gHead = 0;
  for (let i = 0; i < G; i++) { _m.makeScale(0, 0, 0); glass.setMatrixAt(i, _m); glass.setColorAt(i, _c.setRGB(0, 0, 0)); }
  const shard = (x, y, z, vx, vy, vz, size, warm = Math.random() < 0.22) => {
    const i = gHead; gHead = (gHead + 1) % G;
    gp[i * 3] = x; gp[i * 3 + 1] = y; gp[i * 3 + 2] = z; gv[i * 3] = vx; gv[i * 3 + 1] = vy; gv[i * 3 + 2] = vz;
    gr[i * 3] = Math.random() * 6; gr[i * 3 + 1] = Math.random() * 6; gr[i * 3 + 2] = Math.random() * 6; gw[i * 3] = (Math.random() - 0.5) * 14; gw[i * 3 + 1] = (Math.random() - 0.5) * 10; gw[i * 3 + 2] = (Math.random() - 0.5) * 14;
    gs[i] = size; gst[i] = 1; ga[i] = 0; gph[i] = Math.random() * 6.28;
    if (warm) { gc[i * 3] = 1; gc[i * 3 + 1] = 0.52; gc[i * 3 + 2] = 0.2; } else { gc[i * 3] = 0.2; gc[i * 3 + 1] = 0.8; gc[i * 3 + 2] = 1; }
  };
  /* a shock ring on the street */
  const ringM = additive({ uA: { value: 0 }, uCol: { value: new THREE.Color(0x7aa8bc) } }, 'uniform float uA; uniform vec3 uCol; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(0.78, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) + smoothstep(0.9, 0.0, r) * 0.18; gl_FragColor = vec4(uCol * a * uA, 1.0); }');
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), ringM); ring.visible = false; ring.renderOrder = 6; ring.frustumCulled = false; scene.add(ring);
  let ringT = -1; let ringR = 8;
  /* street cracks: a radial crack map drawn once; each crack glows red-hot at first and cools to dark broken lines */
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g2 = cv.getContext('2d'); g2.clearRect(0, 0, 256, 256); g2.lineCap = 'round';
  const walk = (x, y, a, len, w, depth) => { g2.lineWidth = w; g2.strokeStyle = '#fff'; g2.beginPath(); g2.moveTo(x, y); let px = x; let py = y;
    for (let s = 0; s < len; s += 6) { a += (Math.random() - 0.5) * 0.7; px += Math.cos(a) * 6; py += Math.sin(a) * 6; g2.lineTo(px, py); if (depth < 2 && Math.random() < 0.09) { g2.stroke(); walk(px, py, a + (Math.random() < 0.5 ? 0.8 : -0.8), len * 0.45, w * 0.6, depth + 1); g2.lineWidth = w; g2.beginPath(); g2.moveTo(px, py); } w = Math.max(0.6, w * 0.985); g2.lineWidth = w; }
    g2.stroke(); };
  for (let k = 0; k < 11; k++) walk(128, 128, (k / 11) * 6.283 + Math.random() * 0.4, 70 + Math.random() * 50, 4.5, 0);
  g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(128, 128, 9, 0, 6.283); g2.fill();
  const crackTex = new THREE.CanvasTexture(cv);
  const crackG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const cracks = []; for (let i = 0; i < 4; i++) {
    const m = new THREE.ShaderMaterial({ uniforms: { uMap: { value: crackTex }, uHeat: { value: 0 }, uA: { value: 0 } }, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
      vertexShader: FLAT_VERT, fragmentShader: 'uniform sampler2D uMap; uniform float uHeat; uniform float uA; varying vec2 vUv; void main(){ float c = texture2D(uMap, vUv).r; float r = length(vUv - 0.5) * 2.0; float a = c * uA * (1.0 - smoothstep(0.7, 1.0, r)); vec3 hot = vec3(1.0, 0.25, 0.08) * 3.0 * uHeat * (1.0 - r * 0.6); gl_FragColor = vec4(mix(vec3(0.01, 0.01, 0.012), hot, min(1.0, uHeat * 1.4)), a); }' });
    const mesh = new THREE.Mesh(crackG, m); mesh.visible = false; mesh.renderOrder = 3; mesh.frustumCulled = false; scene.add(mesh); cracks.push({ mesh, m, t: -1 }); }
  let crackHead = 0;
  /* heaved asphalt: dark broken slabs tipped up out of the street round a blow */
  const SL = 24; const slabG = new THREE.BoxGeometry(1, 0.22, 1); const slabM = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.75, metalness: 0.05, envMapIntensity: 0.3 });
  const slabs = new THREE.InstancedMesh(slabG, slabM, SL); slabs.castShadow = true; slabs.receiveShadow = true; slabs.frustumCulled = false; scene.add(slabs);
  const sp = []; for (let i = 0; i < SL; i++) { _m.makeScale(0, 0, 0); slabs.setMatrixAt(i, _m); sp.push({ t: -1, x: 0, y: 0, z: 0, q: new THREE.Quaternion(), s: new THREE.Vector3() }); }
  let slabHead = 0;
  const writeSlab = (i) => { const p = sp[i]; const k = Math.min(1, p.t / 0.18); const e = 1 - (1 - k) ** 3; _s.copy(p.s).multiplyScalar(0.3 + 0.7 * e); _m.compose(_a.set(p.x, p.y - (1 - e) * 0.3, p.z), p.q, _s); slabs.setMatrixAt(i, _m); };
  return {
    emit, shard, objects: [points, glass, ring, slabs, ...cracks.map((c) => c.mesh)], mats: [mat, gmat, ringM, slabM, ...cracks.map((c) => c.m)],
    shock(x, z, r) { ring.position.set(x, groundAt(x, z) + 0.05, z); ringT = 0; ringR = r; ring.visible = true; },
    crack(x, z, size, rot = Math.random() * 6.283) { const c = cracks[crackHead]; crackHead = (crackHead + 1) % cracks.length; c.mesh.position.set(x, groundAt(x, z) + 0.03, z); c.mesh.rotation.y = rot; c.mesh.scale.set(size, 1, size); c.t = 0; c.mesh.visible = true; },
    heave(x, z, n, R) { for (let k = 0; k < n; k++) { const i = slabHead; slabHead = (slabHead + 1) % SL; const p = sp[i]; const a = Math.random() * 6.283; const d = R * (0.35 + Math.random() * 0.75);
      p.x = x + Math.cos(a) * d; p.z = z + Math.sin(a) * d; p.y = groundAt(p.x, p.z) + 0.02; _e.set((Math.random() - 0.5) * 0.3, a, 0.25 + Math.random() * 0.45, 'YXZ'); p.q.setFromEuler(_e);
      p.s.set(0.7 + Math.random() * 1.1, 1, 0.5 + Math.random() * 0.8); p.t = 0; writeSlab(i); } slabs.instanceMatrix.needsUpdate = true; },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { alp[i] = 0; siz[i] = 0; continue; }
        age[i] += dt; const k = age[i] / life[i]; if (k >= 1) { life[i] = 0; alp[i] = 0; siz[i] = 0; continue; }
        const j = i * 3;
        if (kind[i] === 0) { /* spark: gravity, a bounce, white-hot to the base colour */
          vel[j + 1] -= 9.8 * dt; pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
          const gy = groundAt(pos[j], pos[j + 2]) + 0.03; if (pos[j + 1] < gy) { pos[j + 1] = gy; vel[j + 1] *= -0.3; vel[j] *= 0.6; vel[j + 2] *= 0.6; }
          const hot = Math.max(0, 1 - k * 2.5); col[j] = c0[j] + (1 - c0[j]) * hot; col[j + 1] = c0[j + 1] + (1 - c0[j + 1]) * hot; col[j + 2] = c0[j + 2] + (1 - c0[j + 2]) * hot;
          siz[i] = s0[i] * (1 - k * 0.6); alp[i] = 2.2 * (1 - k);
        } else { /* dust and steam: drag, a slow rise, it spreads and fades */
          const dr = Math.exp(-dt * 1.6); vel[j] *= dr; vel[j + 2] *= dr; vel[j + 1] = vel[j + 1] * dr + 0.35 * dt;
          pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
          col[j] = c0[j]; col[j + 1] = c0[j + 1]; col[j + 2] = c0[j + 2];
          siz[i] = s0[i] * (1 + k * 2.2); alp[i] = 0.32 * Math.sin(Math.PI * Math.min(1, k * 1.4 + 0.08)) * (1 - k);
        }
      }
      for (const n of ['position', 'aCol', 'aSize', 'aA']) geo.attributes[n].needsUpdate = true;
      for (let i = 0; i < G; i++) {
        if (!gst[i]) continue; const j = i * 3; ga[i] += dt;
        let b;
        if (gst[i] === 1) {
          gv[j + 1] -= 9.8 * dt; gp[j] += gv[j] * dt; gp[j + 1] += gv[j + 1] * dt; gp[j + 2] += gv[j + 2] * dt;
          gr[j] += gw[j] * dt; gr[j + 1] += gw[j + 1] * dt; gr[j + 2] += gw[j + 2] * dt;
          b = 0.9 + 1.8 * Math.pow(Math.max(0, Math.sin(ga[i] * 11 + gph[i])), 6);
          if (Math.random() < dt * 9) emit(gp[j], gp[j + 1], gp[j + 2], gv[j] * 0.2, gv[j + 1] * 0.2, gv[j + 2] * 0.2, gc[j] < 0.5 ? 0x9fe8ff : 0xffc070, 0.05, 0.35, 0);
          const gy = groundAt(gp[j], gp[j + 2]) + 0.02; if (gp[j + 1] <= gy) { gp[j + 1] = gy; gst[i] = 2; gr[j] = 0; gr[j + 2] = 0; ga[i] = 0;
            if (Math.random() < 0.5) for (let k = 0; k < 3; k++) emit(gp[j], gy + 0.05, gp[j + 2], (Math.random() - 0.5) * 2.4, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4, 0xcff4ff, 0.05, 0.4, 0); }
        } else {
          b = 0.1 + 0.9 * Math.exp(-ga[i] * 1.3) + (Math.sin(ga[i] * 2.3 + gph[i] * 5) > 0.985 ? 1.2 : 0);
        }
        glass.setColorAt(i, _c.setRGB(gc[j] * b, gc[j + 1] * b, gc[j + 2] * b));
        _e.set(gr[j], gr[j + 1], gr[j + 2], 'XYZ'); _q.setFromEuler(_e); _m.compose(_a.set(gp[j], gp[j + 1], gp[j + 2]), _q, _s.setScalar(gs[i])); glass.setMatrixAt(i, _m);
      }
      glass.instanceMatrix.needsUpdate = true; if (glass.instanceColor) glass.instanceColor.needsUpdate = true;
      if (ringT >= 0) { ringT += dt; const k = ringT / 0.9; if (k >= 1) { ringT = -1; ring.visible = false; } else { ring.scale.setScalar(0.5 + ringR * (1 - Math.pow(1 - k, 3))); ringM.uniforms.uA.value = 0.7 * (1 - k); } }
      for (const c of cracks) if (c.t >= 0) { c.t += dt; c.m.uniforms.uHeat.value = Math.max(0, 1 - c.t / 1.6) ** 1.5; c.m.uniforms.uA.value = Math.min(1, c.t / 0.08) * (c.t > 14 ? Math.max(0, 1 - (c.t - 14) / 2) : 1) * 0.9; if (c.t > 16) { c.t = -1; c.mesh.visible = false; } }
      let any = false; for (let i = 0; i < SL; i++) if (sp[i].t >= 0 && sp[i].t < 0.2) { sp[i].t += dt; writeSlab(i); any = true; } if (any) slabs.instanceMatrix.needsUpdate = true;
    },
    dispose() { for (const o of [points, glass, ring, slabs, ...cracks.map((c) => c.mesh)]) o.removeFromParent(); geo.dispose(); tri.dispose(); ring.geometry.dispose(); mat.dispose(); gmat.dispose(); ringM.dispose(); crackTex.dispose(); crackG.dispose(); for (const c of cracks) c.m.dispose(); slabG.dispose(); slabM.dispose(); },
  };
}

function towerCore(actor, ctx) {
  const H = darkDress(actor, 'lich', { ...ctx, bare: true, dress: null });
  const scene = ctx.scene || actor.root.parent;
  const groundAt = typeof scene?.userData?.groundAt === 'function' ? scene.userData.groundAt : () => 0;
  const accent = new THREE.Color(0x3ef2ff); const RED = 0xff2a30;
  /* the knight body off (bare: the lich adds nothing); any gear the fight mounts in the hands stays hidden */
  actor.look?.({ armor: false, body: false, wear: [] });
  const slots = ['handslotr', 'handslotl', 'armslotl'].map((n) => actor.slot?.(n)).filter(Boolean);
  const hideGear = () => { for (const sl of slots) for (const c of sl.children) c.visible = false; };
  hideGear();
  const handR = actor.slot?.('handslotr'); const handL = actor.slot?.('handslotl');
  const geos = []; const mats = []; const G = (g) => { geos.push(g); return g; }; const Mt = (m) => { mats.push(m); return m; };
  const grp = new THREE.Group(); grp.name = 'neonCore'; actor.root.add(grp);
  const S = 1.45; grp.scale.setScalar(S); /* the knight root is 2.1 (the nemesis size): 3.05 m per core unit */
  const U = () => S * actor.root.scale.x; /* metres per core unit */
  const LIFT = 0.1; /* the keel tip floats 0.68 (local) = 2.1 m over the street */
  const WX = 1.3; /* the trunk is 1.3 times wider than in a building, not a pole */
  const body = new THREE.Group(); body.position.y = LIFT; grp.add(body); /* everything that floats, bobs, poses and falls */
  const trunk = new THREE.Group(); trunk.scale.set(WX, 1, WX); body.add(trunk); /* the building: it breathes */
  const shared = { uCut: { value: 99 }, uK: { value: 1 }, uTime: { value: 0 }, uFl: { value: 0 }, uPh: { value: 0 }, uHit: { value: 0 }, uHitY: { value: 2 }, uCol: { value: accent.clone().multiplyScalar(1.1) } };
  const fleshU = { uBeat: { value: 0 }, uLife: { value: 1 }, uTime: shared.uTime };
  const dark = Mt(new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.42, metalness: 0.7, envMapIntensity: 0.5 }));
  const rail = Mt(new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.32, metalness: 0.9, envMapIntensity: 0.8 }));
  const flesh = Mt(fleshMaterial(fleshU));
  const cyan = Mt(new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(2.6), toneMapped: false }));
  const red = Mt(new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(4), toneMapped: false }));
  const eyeM = Mt(new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(6), toneMapped: false }));
  const mawM = Mt(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(2), toneMapped: false }));
  const add = (geo, mat, x, y, z, parent = trunk, cast = true) => { const m = new THREE.Mesh(G(geo), mat); m.position.set(x, y, z); m.castShadow = cast; parent.add(m); return m; };
  /* the core: an octagonal column of flesh (seen in the seams between the plates), a keel spike under it */
  add(new THREE.CylinderGeometry(0.3, 0.22, 1.5, 16, 6), flesh, 0, 1.75, 0);
  add(new THREE.ConeGeometry(0.22, 0.42, 8).rotateX(Math.PI), dark, 0, 0.79, 0);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), cyan, 0, 0.6, 0, trunk, false);
  /* the cage: three collars (a dark ring with a lit edge) and four rails */
  for (const [y, r] of [[1.1, 0.33], [1.85, 0.4], [2.48, 0.43]]) { add(new THREE.CylinderGeometry(r, r, 0.07, 8), rail, 0, y, 0); add(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.012, 8, 1, true), cyan, 0, y - 0.03, 0, trunk, false); }
  const railGeo = G(new THREE.BoxGeometry(0.05, 1.42, 0.05));
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; const m = new THREE.Mesh(railGeo, rail); m.position.set(Math.cos(a) * 0.4, 1.8, Math.sin(a) * 0.4); m.castShadow = true; trunk.add(m); }
  /* four fins between the plate columns, each with a lit edge */
  const finGeo = G(new THREE.BoxGeometry(0.05, 1.5, 0.2)); const finEdge = G(new THREE.BoxGeometry(0.012, 1.4, 0.012));
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; const f = new THREE.Mesh(finGeo, dark); f.position.set(Math.sin(a) * 0.5, 1.72, Math.cos(a) * 0.5); f.rotation.y = a; f.castShadow = true; trunk.add(f);
    const e = new THREE.Mesh(finEdge, cyan); e.position.set(Math.sin(a) * 0.6, 1.72, Math.cos(a) * 0.6); trunk.add(e); }
  /* the neck: a column of flesh with two tendons from the top collar to the head (it shows as the head turns and lunges) */
  const HEAD_Y = 2.8;
  add(new THREE.CylinderGeometry(0.17, 0.24, 0.36, 14, 4), flesh, 0, 2.62, 0.0);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 8), flesh, s * 0.17, 2.62, 0.08).rotation.z = s * 0.25;
  /* the head: a wide faceted block with a chamfered visor, the red eye slit facing the hero, a red crown ring, an antenna;
     a hinged jaw under it over a red maw with dark teeth */
  const head = new THREE.Group(); head.position.y = HEAD_Y; trunk.add(head);
  add(new THREE.CylinderGeometry(0.34, 0.4, 0.34, 6), dark, 0, 0, 0, head);
  add(new THREE.BoxGeometry(0.5, 0.12, 0.08), rail, 0, 0.02, 0.3, head);
  const eye = add(new THREE.BoxGeometry(0.4, 0.04, 0.02), eyeM, 0, 0.02, 0.345, head, false);
  add(new THREE.TorusGeometry(0.3, 0.014, 4, 6).rotateX(Math.PI / 2), red, 0, 0.21, 0, head, false);
  add(new THREE.BoxGeometry(0.26, 0.018, 0.012), cyan, 0, -0.1, 0.355, head, false);
  add(new THREE.CylinderGeometry(0.24, 0.3, 0.22, 8), rail, 0, 0.28, 0, head);
  add(new THREE.CylinderGeometry(0.15, 0.2, 0.2, 8), dark, 0, 0.49, 0, head);
  add(new THREE.CylinderGeometry(0.205, 0.205, 0.012, 8, 1, true), cyan, 0, 0.4, 0, head, false);
  add(new THREE.CylinderGeometry(0.012, 0.05, 0.75, 6), rail, 0, 0.96, 0, head);
  const tip = add(new THREE.SphereGeometry(0.03, 8, 6), red, 0, 1.34, 0, head, false);
  /* the maw: a red glow box under the front of the head, teeth hanging over it; the jaw (hinged at its back edge) covers it */
  add(new THREE.BoxGeometry(0.36, 0.1, 0.2), mawM, 0, -0.2, 0.17, head, false);
  for (let k = 0; k < 7; k++) add(new THREE.BoxGeometry(0.022, 0.07, 0.03).translate(0, -0.035, 0), rail, -0.15 + k * 0.05, -0.17, 0.27 + Math.abs(k - 3) * -0.008, head, false);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.17, 0.05); head.add(jaw);
  add(new THREE.BoxGeometry(0.44, 0.09, 0.32), dark, 0, -0.045, 0.16, jaw);
  add(new THREE.BoxGeometry(0.4, 0.012, 0.01), cyan, 0, -0.06, 0.325, jaw, false);
  for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.022, 0.06, 0.03).translate(0, 0.03, 0), rail, -0.125 + k * 0.05, 0.0, 0.29, jaw, false);
  /* the shoulders, the arms (upper, fore) and the claws (three prongs and a lit emitter); flesh elbows */
  const SHX = 0.5 * WX;
  const shoulders = [-1, 1].map((s) => { const m = add(new THREE.BoxGeometry(0.3, 0.24, 0.34), rail, s * SHX, 2.28, 0, body); add(new THREE.BoxGeometry(0.32, 0.02, 0.36), cyan, s * SHX, 2.41, 0, body, false); return m; });
  /* a second searchlight lamp on the right shoulder */
  const lampPod = add(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10).rotateX(Math.PI / 2), rail, SHX + 0.02, 2.44, 0.12, body);
  add(new THREE.CircleGeometry(0.055, 12), Mt(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdff4ff).multiplyScalar(3), toneMapped: false })), 0, 0, 0.051, lampPod, false);
  const limbGeo = G(new THREE.CylinderGeometry(0.07, 0.085, 1, 6)); const jointGeo = G(new THREE.SphereGeometry(0.095, 12, 8)); const stripeGeo = G(new THREE.BoxGeometry(0.012, 1, 0.012).translate(0, 0, 0.058));
  const guardGeo = G(new THREE.BoxGeometry(0.2, 0.55, 0.13).translate(0, 0.08, 0.02));
  const prongGeo = G(new THREE.BoxGeometry(0.04, 0.36, 0.06).translate(0, 0.18, 0)); const emitGeo = G(new THREE.SphereGeometry(0.075, 12, 8));
  const claws = Mt(new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(3), toneMapped: false }));
  const arms = [-1, 1].map((s) => {
    const up = new THREE.Mesh(limbGeo, rail); const fo = new THREE.Mesh(limbGeo, rail); const el = new THREE.Mesh(jointGeo, flesh);
    up.add(new THREE.Mesh(stripeGeo, cyan)); fo.add(new THREE.Mesh(stripeGeo, cyan));
    const guard = new THREE.Mesh(guardGeo, dark); guard.castShadow = true; fo.add(guard);
    const hand = new THREE.Group(); const emit = new THREE.Mesh(emitGeo, claws); hand.add(emit);
    const prongs = []; for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(prongGeo, rail); p.rotation.set(0.45, (k * Math.PI * 2) / 3, 0, 'YXZ'); hand.add(p); prongs.push(p); }
    for (const m of [up, fo, el]) { m.castShadow = true; body.add(m); } body.add(hand);
    return { s, up, fo, el, hand, emit, prongs, at: new THREE.Vector3(s * 0.85, 1.4, 0.35), want: new THREE.Vector3() };
  });
  /* the clad plates: two tiers on four faces, lit window cells; each hangs from a hinge at its top and breathes open a little */
  const PT = 0.06; const plateGeo = G(new THREE.BoxGeometry(0.34, 0.62, PT)); const trimGeo = G(new THREE.BoxGeometry(0.38, 0.66, PT * 0.6).translate(0, 0, -PT * 0.45));
  const trimEdge = G(new THREE.BoxGeometry(0.36, 0.012, 0.01).translate(0, 0.316, PT * 0.5));
  const plates = [];
  for (let tier = 0; tier < 2; tier++) for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2; const y = tier ? 2.4 : 1.76; const r = 0.33 + tier * 0.035;
    const m = new THREE.Mesh(plateGeo, Mt(cellMaterial(shared, k * 1.7 + tier * 5.3, y - 0.31))); m.position.y = -0.31;
    const trim = new THREE.Mesh(trimGeo, dark); trim.castShadow = true; m.add(trim); m.add(new THREE.Mesh(trimEdge, cyan));
    const piv = new THREE.Group(); piv.position.set(Math.sin(a) * (r - tier * 0.015), y, Math.cos(a) * (r - tier * 0.015)); piv.rotation.set(0, a, 0, 'YXZ'); piv.add(m); m.castShadow = true; trunk.add(piv);
    plates.push({ piv, a, tier, base: piv.position.clone() });
  }
  const FLOORS = [2.3, 2.19, 2.08, 1.97, 1.86, 1.75, 1.64, 1.53, 1.42, 1.31, 1.2, 1.08];
  /* the lobby: a lit doorway low on the front of the core; its doors slide open with red light on a wind-up */
  const lobby = new THREE.Group(); lobby.position.set(0, 1.3, 0.395); trunk.add(lobby);
  add(new THREE.BoxGeometry(0.4, 0.34, 0.07), rail, 0, 0, 0, lobby);
  const lobbyIn = Mt(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ef2ff).multiplyScalar(0.22), toneMapped: false }));
  add(new THREE.PlaneGeometry(0.32, 0.27), lobbyIn, 0, 0, 0.037, lobby, false);
  const doorM = Mt(new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.15, metalness: 0.85, envMapIntensity: 0.6 }));
  const doors = [-1, 1].map((s) => add(new THREE.BoxGeometry(0.16, 0.27, 0.012), doorM, s * 0.08, 0, 0.045, lobby, false));
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.006, 0.27, 0.014), cyan, -s * 0.077, 0, 0.004, doors[s > 0 ? 1 : 0], false);
  add(new THREE.BoxGeometry(0.34, 0.016, 0.012), cyan, 0, 0.19, 0.04, lobby, false);
  let doorK = 0;
  /* under it: a cyan up-light cone from the keel, a glow ring and a dark contact disc on the street */
  const coneM = Mt(additive({ uCol: { value: accent.clone() }, uK: { value: 1 } }, 'uniform vec3 uCol; uniform float uK; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * 0.16 * uK; gl_FragColor = vec4(uCol * a, 1.0); }', THREE.DoubleSide));
  add(new THREE.CylinderGeometry(0.04, 0.4, LIFT + 0.58, 20, 1, true), coneM, 0, (LIFT + 0.58) / 2, 0, grp, false);
  const ringM = Mt(new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const ring = add(new THREE.RingGeometry(0.36, 0.41, 40).rotateX(-Math.PI / 2), ringM, 0, 0.025, 0, grp, false);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g2 = cv.getContext('2d'); const gr = g2.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(cv);
  const shadowM = Mt(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  const shadow = add(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), shadowM, 0, 0.02, 0, grp, false);
  const light = new THREE.PointLight(accent, 5, 16, 1.6); light.position.y = 0.9; grp.add(light);
  /* the camera never enters it: the claws reach about 4.3 m from the core at eye height */
  H.keepOut = 5.2;

  /* ---- the searchlights (soft volumes with dust) and, on attack, a red lock ring round the hero's feet and a red line on
     the street from the Tower to the hero */
  const beamA = makeBeam(scene, mats, geos, 110); const beamB = makeBeam(scene, mats, geos, 120);
  beamB.U.uCol.value.set(0xe8f4ff);
  const lockM = Mt(additive({ uCol: { value: new THREE.Color(RED).multiplyScalar(2.2) }, uK: { value: 0 }, uT: { value: 0 } }, `uniform vec3 uCol; uniform float uK; uniform float uT; varying vec2 vUv; void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0; float ang = atan(p.y, p.x);
    float ringA = smoothstep(0.84, 0.9, r) * (1.0 - smoothstep(0.96, 1.0, r));
    float inner = smoothstep(0.5, 0.54, r) * (1.0 - smoothstep(0.58, 0.62, r)) * step(0.5, fract(ang * 1.2732 + uT * 0.6));
    gl_FragColor = vec4(uCol * (ringA + inner) * uK, 1.0); }`));
  const lock = new THREE.Mesh(G(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), lockM); lock.renderOrder = 6; lock.frustumCulled = false; scene.add(lock);
  const lineM = Mt(additive({ uCol: { value: new THREE.Color(RED).multiplyScalar(2.4) }, uK: { value: 0 }, uT: { value: 0 } }, 'uniform vec3 uCol; uniform float uK; uniform float uT; varying vec2 vUv; void main(){ float x = abs(vUv.x - 0.5) * 2.0; float core = 1.0 - smoothstep(0.15, 0.5, x); float glow = (1.0 - x) * 0.35; float dash = 0.55 + 0.45 * step(0.4, fract(vUv.y * 14.0 - uT * 3.0)); gl_FragColor = vec4(uCol * (core + glow) * dash * uK, 1.0); }'));
  const line = new THREE.Mesh(G(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), lineM); line.renderOrder = 6; line.frustumCulled = false; scene.add(line);
  const fanM = Mt(additive({ uCol: { value: new THREE.Color(RED).multiplyScalar(1.6) }, uK: { value: 0 }, uT: { value: 0 }, uL: { value: 10 } }, `uniform vec3 uCol; uniform float uK; uniform float uT; uniform float uL; varying vec2 vUv; void main(){
    float w = mix(1.0, 0.12, vUv.y); float x = abs(vUv.x - 0.5) * 2.0 / w; if (x > 1.0) discard;
    float edge = smoothstep(0.82, 0.97, x) * (1.0 - smoothstep(0.97, 1.0, x));
    float d = vUv.y * uL; float chev = step(0.62, fract(d / 1.6 + x * 0.35 + uT * 1.4));
    float fall = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y) * 0.6);
    gl_FragColor = vec4(uCol * (0.1 + edge * 0.8 + chev * 0.32 * (1.0 - x * 0.6)) * fall * uK, 1.0); }`));
  const fan = new THREE.Mesh(G(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), fanM); fan.renderOrder = 5; fan.frustumCulled = false; fan.visible = false; scene.add(fan);
  let lockK = 0; let beamK = 0; let redK = 0; let phaseRed = 0;

  /* data lances (boltLook): each bolt sprite carries a streak behind it, turned along its flight each frame */
  const lanceGeo = G(mergeGeometries([new THREE.PlaneGeometry(0.07, 1.8), new THREE.PlaneGeometry(0.07, 1.8).rotateY(Math.PI / 2)])); lanceGeo.translate(0, -0.9, 0);
  const lanceMat = Mt(additive({ uCol: { value: accent.clone().multiplyScalar(3) }, uTime: { value: 0 } }, 'uniform vec3 uCol; uniform float uTime; varying vec2 vUv; void main(){ float x = abs(vUv.x - 0.5) * 2.0; float seg = step(0.35, fract(vUv.y * 9.0 + uTime * 6.0)); float a = (1.0 - x * x) * pow(vUv.y, 1.5) * (0.45 + 0.55 * seg); gl_FragColor = vec4(uCol * a, 1.0); }', THREE.DoubleSide));
  const lances = [];
  H.boltLook = { color: 0x3ef2ff, scale: 0.6, mesh(sp) {
    const m = new THREE.Mesh(lanceGeo, lanceMat); m.frustumCulled = false; m.renderOrder = 7; m.scale.setScalar(1 / sp.scale.x);
    lances.push({ mesh: m, sp, last: sp.position.clone() }); return m;
  } };
  const fx = makeFx(scene, groundAt);
  H.warmMats?.push(...mats, ...fx.mats); H.warmShow?.push(...fx.objects, beamA.beam, beamA.spot, beamB.beam, beamB.spot, lock, line, fan);

  let death = null; let t = 0; let charge = 0; let ph = 0; let rate = 0.9; let hitK = 0; let rock = 0;
  /* the attack pose: kind (0 sweep, 1 stomp, 2 lunge) chosen in turn at each new attack; pw = its weight; wind/hit from the clock */
  let wasAtk = false; let atkN = 0; let kind = 0; let side = 1; let pw = 0; let wind = 0; let hitP = 0; let stomped = false; let jawK = 0;
  const TIP = 0.58; /* the keel point, body units over the body origin */
  const FALL = new THREE.Vector3(0.78, 0, -0.62).normalize(); const AXIS = new THREE.Vector3(FALL.z, 0, -FALL.x);
  const lastPlayer = new THREE.Vector3(); let havePlayer = false;
  /* at the death: it falls away and to the side (50 degrees off "away from the hero"): the leaning body reads three-quarter
     on, its head stays low enough in the frame and its planted claw shows */
  const aimFall = () => { if (!havePlayer) return; _a.copy(lastPlayer); grp.worldToLocal(_a); _a.y = 0; if (_a.lengthSq() < 1e-6) return; _a.normalize();
    FALL.set(-_a.x * 0.97 + -_a.z * 0.26, 0, -_a.z * 0.97 + _a.x * 0.26).normalize(); AXIS.set(FALL.z, 0, -FALL.x); }; /* 15 degrees off "away from the hero": it falls down the street, not into a building */
  const tipLocal = new THREE.Vector3(0, TIP, 0);
  /* a point on the body (core units, trunk space) in world space */
  const wp = (x, y, z, out) => { out.set(x * WX, y, z * WX); body.localToWorld(out); return out; };
  const floorBurst = (y, n) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2; wp(Math.sin(a) * 0.4, y, Math.cos(a) * 0.4, _a); wp(Math.sin(a) * 1.4, y, Math.cos(a) * 1.4, _b); _b.sub(_a).normalize();
      const sp = 3 + Math.random() * 4; fx.emit(_a.x, _a.y, _a.z, _b.x * sp, 1 + Math.random() * 3, _b.z * sp, Math.random() < 0.7 ? 0xffb050 : 0x9fe8ff, 0.07 + Math.random() * 0.06, 0.7 + Math.random() * 0.8, 0);
      if (k % 2 === 0) fx.shard(_a.x, _a.y, _a.z, _b.x * (1 + Math.random() * 2), Math.random() * 1.5, _b.z * (1 + Math.random() * 2), 0.25 + Math.random() * 0.35);
    }
  };
  /* dust, sparks and glass on the street at a world point, with a shock ring, a crack and heaved slabs */
  const blow = (x, z, power, crackSize) => {
    const gy = groundAt(x, z);
    for (let k = 0; k < 22 * power; k++) fx.emit(x + (Math.random() - 0.5) * 3, gy + 0.4, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8, 0.8 + Math.random() * 2.2, (Math.random() - 0.5) * 8, 0x3a4652, 1.4 + Math.random() * 1.4, 2.2 + Math.random() * 1.6, 1);
    for (let k = 0; k < 30 * power; k++) fx.emit(x, gy + 0.3, z, (Math.random() - 0.5) * 10, 2 + Math.random() * 5, (Math.random() - 0.5) * 10, Math.random() < 0.6 ? 0xffa040 : 0x9fe8ff, 0.08 + Math.random() * 0.06, 0.6 + Math.random() * 0.9, 0);
    fx.shock(x, z, 7 * power); fx.crack(x, z, crackSize); fx.heave(x, z, Math.round(5 * power), crackSize * 0.32);
  };
  /* the ground hit of the fall: along the body from the keel to the head */
  const impact = (power) => {
    for (let i = 0; i <= 8; i++) {
      const y = 0.6 + (i / 8) * 2.6; wp(0, y, 0, _a); const gy = groundAt(_a.x, _a.z);
      for (let k = 0; k < 5; k++) fx.emit(_a.x + (Math.random() - 0.5) * 3, gy + 0.4, _a.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 7, 0.8 + Math.random() * 2, (Math.random() - 0.5) * 7, 0x3a4652, 1.6 + Math.random() * 1.4, 2.4 + Math.random() * 1.6, 1);
      for (let k = 0; k < 5 * power; k++) fx.emit(_a.x, gy + 0.4, _a.z, (Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9, Math.random() < 0.6 ? 0xffa040 : 0x9fe8ff, 0.08 + Math.random() * 0.06, 0.6 + Math.random() * 0.9, 0);
      if (i % 2 === 0) for (let k = 0; k < 3; k++) fx.shard(_a.x, gy + 0.6, _a.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, 0.2 + Math.random() * 0.3);
    }
    H.shake = Math.max(H.shake || 0, 0.7 * power);
  };
  const onPoleFall = (x, y, z) => { for (let k = 0; k < 18; k++) fx.emit(x, y, z, (Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5, Math.random() < 0.5 ? 0xffc070 : 0xdff4ff, 0.07, 0.7 + Math.random() * 0.5, 0); };
  H.onDeath = () => {
    if (!death) aimFall();
    if (!death) death = { t: 0, vy: 0, phase: 'hang', th: 0, w: 0, hit: 0, bounce: 0, floor: 0, landed: false, spark: 0, smoke: 0, flT: 9, low: 1, slump: 0 };
    /* the death camera stands well back (fight.js holds keepOut + 2.6 = 14 m and pushes in to 78 %, about 11 m): the
       standing Tower fits from the keel to the spire, and the leaning wreck fits whole with the street and the stacks round it */
    H.keepOut = 11.4;
    /* the death director stands off the side it falls to */
    grp.updateMatrixWorld(true); _q.setFromRotationMatrix(_m.extractRotation(grp.matrixWorld)); H.fallDir = FALL.clone().applyQuaternion(_q).setY(0).normalize();
    return 5.4;
  };
  /* a hit: the floors round the hit flash white, sparks fly from it, the body rocks back */
  const onHit0 = H.onHit;
  H.onHit = (point, heavy = false) => {
    const r = onHit0?.(point, heavy) || {};
    if (death || !point) return r;
    _a.copy(point); body.worldToLocal(_a); shared.uHitY.value = Math.min(2.4, Math.max(1.1, _a.y)); hitK = heavy ? 1.4 : 1; rock = Math.max(rock, heavy ? 1 : 0.6);
    for (let k = 0; k < (heavy ? 26 : 14); k++) fx.emit(point.x, point.y, point.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6, Math.random() < 0.6 ? 0xdff8ff : 0xffb050, 0.06 + Math.random() * 0.05, 0.4 + Math.random() * 0.4, 0);
    return r;
  };
  const upd0 = H.update;
  H.update = (dt, st = {}) => {
    if (!(dt > 0 && dt < 1)) dt = 0;
    upd0?.(dt, st);
    hideGear(); t += dt; shared.uTime.value = t; lanceMat.uniforms.uTime.value = t; lockM.uniforms.uT.value = t; lineM.uniforms.uT.value = t; fanM.uniforms.uT.value = t;
    const M = U(); const GL = 9.8 / M;
    /* the poles in its way go down (the wreck too: at the root and along the body) */
    grp.getWorldPosition(_g); knockPoles(_g.x, _g.z, death ? 3.6 : 4.8, dt, onPoleFall);
    if (death?.landed) { wp(0, 2.5, 0, _a); knockPoles(_a.x, _a.z, 3.4, dt, onPoleFall); }
    hitK = Math.max(0, hitK - dt * 5); shared.uHit.value = hitK; rock = Math.max(0, rock - dt * 3.2);
    if (!death) {
      /* its phases show on the floors: a third red under 60 %, every floor red under 30 % */
      { const pr = (st.phase || 0) >= 2 ? 0.9 : (st.phase || 0) >= 1 ? 0.4 : 0; phaseRed += (pr - phaseRed) * Math.min(1, dt * 1.5); shared.uCol.value.copy(accent).multiplyScalar(1.1).lerp(_c.set(RED).multiplyScalar(1.3), phaseRed); }
      charge += ((st.attacking ? 1 : 0) - charge) * Math.min(1, dt * 6);
      /* the heart: it beats faster in a wind-up and as it weakens */
      const hp = st.hpFrac ?? 1; rate += ((0.85 + charge * 1.5 + (1 - hp) * 0.7) - rate) * Math.min(1, dt * 2); ph += dt * rate; shared.uPh.value = ph;
      const bt = beatAt(ph - 0.9); fleshU.uBeat.value = bt; /* the core beats a moment before the windows read it */
      /* breathing: a slow swell of the whole building, the plate tiers open like gills one after another; on a wind-up the
         plates flare open (red light in the seams) */
      const br = Math.sin(t * 1.45); const swell = 1 + 0.022 * br + 0.012 * bt;
      trunk.scale.set(WX * swell, 1 + 0.008 * br, WX * swell);
      for (const P of plates) { const b2 = Math.sin(t * 1.45 - P.tier * 0.9); const gill = 0.03 + 0.04 * Math.max(0, b2) + 0.2 * charge * (0.6 + 0.4 * Math.sin(t * 14 + P.a * 3)); P.piv.position.set(P.base.x * (1 + 0.03 * b2), P.base.y, P.base.z * (1 + 0.03 * b2)); P.piv.rotation.x = -gill; }
      /* the attack poses */
      /* the fight names the blow (sweep, stomp, lunge); a bolt keeps the turn order */
      if (st.attacking && !wasAtk) { const nk = { sweep: 0, stomp: 1, lunge: 2 }[st.atkKind]; kind = nk ?? atkN++ % 3; side = -side; stomped = false; }
      wasAtk = !!st.attacking;
      if (st.attacking) { const A = Math.min(1.6, st.atkK || 0); wind = sstep(0.0, 0.92, A); hitP = sstep(0.9, 1.08, A); pw += (1 - pw) * Math.min(1, dt * 8); }
      else pw += (0 - pw) * Math.min(1, dt * 2.2);
      let lean = 0; let twist = 0; let dy = 0; let jawA = 0;
      if (kind === 0) { twist = side * (0.32 * wind - 0.78 * hitP); lean = -0.05 * wind + 0.14 * hitP; jawA = 0.25 * wind; }
      else if (kind === 1) { dy = 0.3 * wind * (1 - hitP) - 0.8 * hitP; lean = -0.09 * wind * (1 - hitP) + 0.1 * hitP; jawA = 0.15 * wind + 0.55 * hitP; }
      else { lean = -0.12 * wind * (1 - hitP) + 0.26 * hitP; jawA = 0.4 * wind + 0.35 * hitP; }
      const jawW = 0.04 + 0.05 * Math.max(0, br) + 0.04 * bt + jawA * pw; /* it breathes through the jaw; it opens to roar */
      jawK += (jawW - jawK) * Math.min(1, dt * 10);
      /* the stomp lands: the keel spears the street */
      if (kind === 1 && st.attacking && hitP > 0.6 && !stomped) { stomped = true; wp(0, TIP - 0.05, 0, _a); blow(_a.x, _a.z, 1, 7); H.shake = Math.max(H.shake || 0, 0.75); }
      body.position.y = LIFT + Math.sin(t * 1.1) * 0.05 + dy * pw;
      body.rotation.set((lean * pw) - 0.06 * rock, twist * pw, Math.sin(t * 0.7) * 0.02, 'YXZ');
      /* the head looks round, nods with the beat, bows into a lunge */
      head.rotation.set(0.04 * Math.sin(t * 0.6) + 0.03 * bt + (kind === 2 ? 0.25 * hitP * pw : 0) - 0.05 * rock, 0.2 * Math.sin(t * 0.37) * (1 - pw), 0);
      jaw.rotation.x = Math.min(0.75, jawK);
      eyeM.color.set(RED).lerp(_c.setRGB(1, 0.85, 0.8), charge * 0.5).multiplyScalar(6 + charge * 4 + 3 * hitP * pw);
      mawM.color.set(0xff3020).multiplyScalar(1.2 + 2.5 * bt + 3 * charge);
      claws.color.copy(accent).lerp(_c.setRGB(1, 0.3, 0.3), charge).multiplyScalar(3 + charge * 3);
      tip.visible = (t % 1.4) < 0.18;
      light.intensity = 5 + charge * 3; ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.04);
      /* the claws: they follow the hidden knight's hands (every swing of the mechanic is a claw strike) and, in an attack, the
         pose's own targets (body units, the body faces +z) */
      for (const A of arms) {
        const h = A.s > 0 ? handR : handL; A.want.copy(A.at);
        if (h) { h.getWorldPosition(_a); body.worldToLocal(_a); _a.y = Math.max(_a.y + 0.6, 1.25); _a.x = A.s * Math.max(A.s * _a.x * 1.2, 0.7); _a.z *= 1.2; const r = Math.hypot(_a.x, _a.z); if (r > 1.15) { _a.x *= 1.15 / r; _a.z *= 1.15 / r; } A.want.copy(_a); }
        A.want.y += 0.05 * Math.sin(t * 1.45 + A.s); /* the arms breathe too */
        if (pw > 0.01) {
          const s = A.s; const lead = s === side;
          if (kind === 0) { if (lead) _b.set(s * 1.3, 2.8, -0.35).lerp(_d.set(-s * 0.45, 1.15, 1.1), hitP); else _b.set(s * 0.8, 1.7, 0.35); }
          else if (kind === 1) _b.set(s * 0.95, 3.0, 0.25).lerp(_d.set(s * 1.0, 0.85, 0.8), hitP);
          else _b.set(s * 0.8, 2.45, -0.45).lerp(_d.set(s * 0.42, 1.35, 1.05), hitP);
          A.want.lerp(_b, pw);
        }
        A.at.lerp(A.want, Math.min(1, dt * (pw > 0.5 ? 16 : 8)));
        for (const p of A.prongs) p.rotation.x = 0.45 + 0.35 * charge - 0.3 * hitP * pw; /* the claws open in the wind-up, snap shut on the blow */
      }
      /* the searchlights: the eye's beam hunts the street beside the hero and snaps onto the hero (red) in an attack; the
         shoulder lamp sweeps the street in wide slow arcs */
      const P = st.player;
      if (P) { lastPlayer.copy(P); havePlayer = true;
        eye.getWorldPosition(_a);
        _d.subVectors(P, _a).setY(0); const dist = _d.length() || 1; _d.multiplyScalar(1 / dist);
        const sideO = Math.sin(t * 0.55) * 3.6 * (1 - charge); const fwd = -2.6 - (1 + Math.sin(t * 0.37)) * 1.2 * (1 - charge);
        _b.set(P.x + -_d.z * sideO + _d.x * fwd, 0, P.z + _d.x * sideO + _d.z * fwd); _b.y = groundAt(_b.x, _b.z);
        redK += ((st.attacking ? 1 : 0) - redK) * Math.min(1, dt * 8); beamK += (1 - beamK) * Math.min(1, dt * 2);
        beamA.U.uCol.value.setRGB(0.81, 0.93, 1).lerp(_c.setRGB(1, 0.16, 0.18), redK);
        beamA.point(_a, _b, 1.7 - charge * 0.6, beamK * (0.9 + redK * 0.5), Math.min(1, dt * (st.attacking ? 9 : 2.2)), t);
        /* the shoulder lamp sweeps the street to the Tower's sides (0.5-1.7 rad off the hero, 6-10 m out): in view, never on the camera */
        lampPod.getWorldPosition(_a); const sw = Math.sin(t * 0.3); const off = Math.sign(sw || 1) * (0.5 + 1.2 * Math.abs(sw)); const rr = 8 + 2 * Math.sin(t * 0.23);
        grp.getWorldPosition(_w); _v.set(P.x - _w.x, 0, P.z - _w.z).normalize(); const co = Math.cos(off); const so = Math.sin(off);
        _b.set(_w.x + (_v.x * co - _v.z * so) * rr, 0, _w.z + (_v.z * co + _v.x * so) * rr); _b.y = groundAt(_b.x, _b.z);
        beamB.point(_a, _b, 2.1, beamK * 0.75, Math.min(1, dt * 2.5), t);
        lockK += ((st.attacking ? 1 : 0) - lockK) * Math.min(1, dt * 10);
        const close = 1 - Math.min(1, st.atkK || 0); lock.position.set(P.x, groundAt(P.x, P.z) + 0.05, P.z); lock.scale.setScalar(0.75 + close * 1.6); lockM.uniforms.uK.value = lockK;
        wp(0, -TIP, 0, _w); _w.y = groundAt(_w.x, _w.z) + 0.04; _v.set(P.x - _w.x, 0, P.z - _w.z); const LL = _v.length();
        line.position.set((_w.x + P.x) / 2, _w.y, (_w.z + P.z) / 2); line.rotation.y = Math.atan2(_v.x, _v.z); line.scale.set(0.16, 1, Math.max(0.1, LL - 0.8)); lineM.uniforms.uK.value = lockK;
        doorK += ((st.attacking ? 1 : 0) - doorK) * Math.min(1, dt * (st.attacking ? 7 : 3));
        const FL = LL + 1.2; fan.position.set(_w.x + _v.x / (LL || 1) * FL / 2, _w.y + 0.01, _w.z + _v.z / (LL || 1) * FL / 2); fan.rotation.y = line.rotation.y; fan.scale.set(5, 1, FL);
        fanM.uniforms.uL.value = FL; fanM.uniforms.uK.value = doorK * (0.75 + 0.25 * Math.sin(t * 18)); fan.visible = doorK > 0.01;
      }
      for (const [i, d] of doors.entries()) d.position.x = (i ? 1 : -1) * (0.08 + doorK * 0.12);
      lobbyIn.color.setRGB(0.24, 0.95, 1).lerp(_c.setRGB(1, 0.12, 0.14), doorK).multiplyScalar(0.22 + doorK * 2.2);
      shadow.scale.setScalar(1 + 0.25 * Math.max(0, -dy * pw));
    } else {
      death.t += dt; const d = death.t;
      beamA.off(dt); beamB.off(dt); lockM.uniforms.uK.value = 0; lineM.uniforms.uK.value = 0; fanM.uniforms.uK.value = 0; fan.visible = false;
      /* 0-0.3 s the eye flares white and dies (for good, no flicker after); the claws and the crown go out; the jaw drops */
      eyeM.color.set(d < 0.3 ? 0xffffff : RED).multiplyScalar(d < 0.3 ? 8 * (1 - sstep(0.05, 0.25, d)) : 0);
      claws.color.copy(accent).multiplyScalar(3 * (1 - sstep(0.0, 0.3, d)));
      red.color.set(RED).multiplyScalar(4 * (1 - sstep(0.1, 0.5, d)) * (d < 0.35 && (d * 20 | 0) % 2 ? 0.2 : 1)); tip.visible = false;
      jaw.rotation.x += (0.62 - jaw.rotation.x) * Math.min(1, dt * 3);
      /* the heart slows and stops with the floors; the veins go grey */
      rate = Math.max(0, rate - dt * 0.45); ph += dt * rate; shared.uPh.value = ph; const life = 1 - sstep(0.4, 2.6, d);
      fleshU.uBeat.value = beatAt(ph - 0.9) * life; fleshU.uLife.value = life; mawM.color.set(0xff3020).multiplyScalar(2.5 * life * life);
      const FA = 0.25; const FB = 1.5; /* the floors go out in 1.25 s, so the whole fall is on screen before the card */ const fp = Math.min(1, Math.max(0, (d - FA) / (FB - FA)));
      const fi = d < FA ? 0 : Math.min(FLOORS.length, 1 + Math.floor(fp * FLOORS.length));
      while (death.floor < fi) { death.floor++; shared.uCut.value = FLOORS[death.floor - 1]; death.flT = 0; floorBurst(FLOORS[death.floor - 1] + 0.04, 14); }
      death.flT += dt; shared.uFl.value = 1.3 * Math.max(0, 1 - death.flT / 0.14);
      shared.uK.value = 1;
      lobbyIn.color.setRGB(0.24, 0.95, 1).multiplyScalar(0.22 * (1 - sstep(FB - 0.25, FB, d)) * ((d * 19 | 0) % 4 === 0 && d > FB - 0.6 ? 0.2 : 1));
      doorK = Math.max(0, doorK - dt * 3); for (const [i, dr] of doors.entries()) dr.position.x = (i ? 1 : -1) * (0.08 + doorK * 0.12);
      for (const P of plates) P.piv.rotation.x += (-0.02 - P.piv.rotation.x) * Math.min(1, dt * 3);
      trunk.scale.set(WX, 1, WX);
      const L0 = death.land ?? 99;
      const stut = !death.landed ? (((d * 17) | 0) % 5 === 0 ? 0.25 : 1) : (Math.sin(d * 9.0 + Math.sin(d * 2.3) * 3) > 0.7 ? 0.15 : 1);
      /* the trim lights die for real: they stutter as it drops and are out a second after it lands */
      cyan.color.copy(accent).multiplyScalar(2.6 * (1 - 0.6 * fp) * (death.landed ? Math.max(0, 0.5 - (d - L0) * 0.45) / 0.5 : 1) * stut);
      const lift = 1 - sstep(1.2, 1.7, d);
      coneM.uniforms.uK.value = lift * (d > 1.2 && (d * 24 | 0) % 3 === 0 ? 0.3 : 1); ringM.opacity = 0.55 * lift; light.intensity = 5 * lift;
      body.rotation.set(0, 0, 0); head.rotation.y *= Math.max(0, 1 - dt * 3);
      /* the body: 2.1-2.6 s it sags and shudders; 2.6 s it drops onto its keel (which spears 0.15 units into the street); it
         topples across the street about that point (a falling pole: th'' = k sin th) until its low claw slams down and holds it
         at 0.52 rad; a small bounce; then the arm gives a little and it settles at 0.63 rad (36 degrees), head bowed */
      const SINK = 0.15;
      if (death.phase === 'hang') { body.position.y = LIFT - 0.1 * sstep(1.2, 1.7, d) + Math.sin(d * 40) * 0.015 * sstep(1.2, 1.4, d) * (1 - sstep(1.55, 1.7, d)); body.quaternion.setFromAxisAngle(AXIS, 0.04 * sstep(1.3, 1.7, d)); if (d > 1.7) death.phase = 'drop'; }
      else if (death.phase === 'drop') { death.vy -= GL * dt; body.position.y += death.vy * dt; if (body.position.y <= -TIP - SINK) { body.position.y = -TIP - SINK; death.phase = 'topple'; death.th = 0.06; death.w = 1.1; death.hit = d;
        wp(0, 0.6, 0, _a); blow(_a.x, _a.z, 0.8, 6); H.shake = Math.max(H.shake || 0, 0.45); } }
      else {
        /* it falls all the way: nothing holds it at 36 degrees.
           It lies on its side down the street (1.45 rad), lifted by its half-width so no side goes under the street */
        const TH = 1.45;
        if (death.phase === 'topple') { death.w += 5.0 * Math.sin(death.th) * dt; death.th += death.w * dt;
          if (death.th >= TH) { death.th = TH; if (!death.landed) { death.landed = true; death.land = d; impact(1.2); } else if (death.bounce === 1) impact(0.35); death.w = -death.w * 0.18; death.bounce++; if (death.bounce > 1 || Math.abs(death.w) < 0.12) death.phase = 'rest'; } }
        const slump = death.landed ? 0.04 * sstep(0.2, 0.9, d - L0) : 0;
        body.quaternion.setFromAxisAngle(AXIS, death.th + slump); _v.copy(tipLocal).applyQuaternion(body.quaternion); body.position.set(-_v.x, -_v.y - SINK + 0.6 * Math.sin(death.th + slump), -_v.z);
        const j = d - death.hit; if (j < 0.25) body.position.y += Math.sin(j * 40) * 0.03 * (1 - j / 0.25);
        /* the head bows as it settles */
        head.rotation.x += ((death.landed ? 0.42 : 0.15) - head.rotation.x) * Math.min(1, dt * 2.5);
        if (death.landed) { death.spark -= dt; if (death.spark <= 0) { death.spark = 0.12 + Math.random() * 0.35; wp(0.5, 2.3, 0, _a); for (let k = 0; k < 6; k++) fx.emit(_a.x, _a.y, _a.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3, Math.random() < 0.5 ? 0x9fe8ff : 0xffb050, 0.06, 0.6, 0); }
          death.smoke -= dt; if (death.smoke <= 0) { death.smoke = 0.07; const y = [1.0, 1.75, 2.4][(Math.random() * 3) | 0]; wp((Math.random() - 0.5) * 0.3, y, (Math.random() - 0.5) * 0.3, _a);
            fx.emit(_a.x, _a.y + 0.4, _a.z, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6, Math.random() < 0.25 ? 0x4a3a30 : 0x283038, 1.0 + Math.random() * 0.8, 2.6 + Math.random(), 1);
            if (Math.random() < 0.25) fx.emit(_a.x, _a.y + 0.3, _a.z, (Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4, 0xff7a30, 0.12, 0.5, 0); } }
      }
      /* the arms (never through the body). Hanging and dropping: limp, out to the sides. Toppling: the low arm (on the fall
         side) reaches for the street beside it and plants its claw there (the blow when it lands), the high arm hangs down
         from its shoulder, away from the body */
      body.updateMatrix(); _mi.copy(body.matrix).invert();
      const lowS = (FALL.x >= 0 ? 1 : -1);
      for (const A of arms) {
        if (death.phase === 'hang' || death.phase === 'drop') _a.set(A.s * 0.95, 1.2, 0.2);
        else if (A.s === lowS) {
          /* the plant: a street point (grp units) out from the low shoulder along the fall, converted into body units */
          _b.set(A.s * SHX, 2.28, 0).applyMatrix4(body.matrix); _a.set(_b.x + FALL.x * 0.55, 0.05, _b.z + FALL.z * 0.55 + 0.25).applyMatrix4(_mi);
          if (death.landed && !death.planted) { death.planted = true; _w.copy(_a); body.localToWorld(_w); blow(_w.x, _w.z, 1.1, 8); }
        } else { _b.set(A.s * SHX, 2.28, 0).applyMatrix4(body.matrix); _a.set(_b.x - FALL.x * 0.35, Math.max(0.15, _b.y - 1.15), _b.z + 0.2).applyMatrix4(_mi); }
        A.at.lerp(_a, Math.min(1, dt * (A.s === lowS && death.phase !== 'hang' ? 9 : 4)));
      }
    }
    fx.update(dt);
    /* the arms: upper from the shoulder to an elbow pushed out and down, fore from the elbow to the claw */
    for (const A of arms) {
      const sh = shoulders[A.s > 0 ? 1 : 0].position; _a.copy(sh).add(_w.set(A.s * 0.08, -0.05, 0));
      _b.copy(_a).lerp(A.at, 0.5).add(_w.set(A.s * 0.26, -0.1, -0.08));
      span(A.up, _a, _b); span(A.fo, _b, A.at); A.el.position.copy(_b);
      A.hand.position.copy(A.at); _v.subVectors(A.at, _b).normalize(); A.hand.quaternion.setFromUnitVectors(UP, _v);
    }
    /* the look point: in the fight the visor (fight.js's tall-boss view frames the face); in the death the upper body while the
       floors go out, then the middle of the leaning wreck, toward its head */
    if (!death) { wp(0, HEAD_Y, 0, _a); H.lookAt.copy(_a); }
    else { wp(0, 2.15, 0, _a); wp(0, 2.25, 0, _b); H.lookAt.copy(_a).lerp(_b, sstep(2.7, 3.7, death.t)); }
    for (let i = lances.length - 1; i >= 0; i--) {
      const L = lances[i];
      if (!L.sp.parent) { L.mesh.removeFromParent(); lances.splice(i, 1); continue; }
      _v.subVectors(L.sp.position, L.last); if (_v.lengthSq() > 1e-6) { _w.copy(_v).normalize(); L.mesh.quaternion.setFromUnitVectors(UP, _w); }
      L.mesh.scale.setScalar(1 / L.sp.scale.x); L.last.copy(L.sp.position);
    }
  };
  const dispose0 = H.dispose;
  H.dispose = () => {
    dispose0?.(); grp.removeFromParent(); for (const o of [beamA.beam, beamA.spot, beamB.beam, beamB.spot, lock, line, fan]) o.removeFromParent(); fx.dispose();
    for (const L of lances) L.mesh.removeFromParent(); lances.length = 0;
    for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); shadowTex.dispose();
  };
  return H;
}

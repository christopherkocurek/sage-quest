/* the nine-row plan. Every shape used to follow one pattern:
   move to a spot, stand in a radius and kill, then duel. This file holds the new beats; a story
   without a shape keeps the plain code in fight.js.

     shape     chapter I (the land)                        chapter II (the field)                    chapter III
     vigil     the road is ambushed, no pickups            walk the companion to the fire (hearts)   the fire heals; runners come for them
     hunt      the enemy comes at once, takes them, vow    hunt the Marked one before it gets away   it returns with the health it left with; it runs once
     chains    break out of a ring, a timed rescue         break the seal while the freed one holds  bound to two anchors
     trial     three duels in one ring of watchers         hold the gate (three through = lost)      a duel in a ring, no help
     dark      follow the light (the only high ground)     two lights: keep one                      the dark; the light given up comes back

   Stakes: every chapter II can be lost; a loss goes on to a harder last fight (never a restart).
   Answers change rules: the enemy's kind (the minion list) adds one rule; the build and the companions' kind change a number.
   fight.js, chapters.js and journey.js call in here; every call is guarded by questNew(shape). */
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { dotTexture } from './world.js';

const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export const questNew = (shape) => !!shape;
export const QN = (f) => questNew(f?.story?.shape);
/* tests: ?failii=1 loses chapter II on purpose (tools/lib/quest-driver.mjs passes it through the query) */
const FORCE_FAIL = QS.get('failii') === '1';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const FIELD = 13.5;
const alive = (f) => f.foes.filter((x) => x.state !== 'dead' && !x.boss && !x.gone);
const state = (f) => (f.q2 ||= { said: {}, t: 0 });

/* ---------- what the answers change ---------- */
const sq = () => (typeof window !== 'undefined' ? window.__sq?.S || {} : {});
const buildOf = () => Number(sq().build) || 2.5;
export const heavyBuild = () => buildOf() >= 3.2; /* breaks a seal or an anchor in half the blows */
const slightK = () => (buildOf() <= 1.9 ? 0.7 : 1); /* quick hands: a light or a lock takes 30 % less time */
const kinds = (f) => (f.wisps || []).filter((w) => w.c).map((w) => w.c.kind);
const hasAnimal = (f) => kinds(f).includes('animal');
const hasPerson = (f) => kinds(f).includes('person');
/* the enemy's kind: one rule each (game/kit.mjs MINIONS; Sage2 picks the kind from the player's words) */
const RULES = {
  clerks: 'Clerks block the first blow.', debts: 'Debts get up once.', doubts: 'Doubts hide past eight metres.', ghosts: 'Ghosts slip away when struck.',
  hounds: 'Hounds are fast and frail.', watchers: 'Watchers are slow and hard.', chains: 'Chains fall in pairs.', plagues: 'Aches flare. Step back.',
  hours: 'The Hours shorten every clock.', liars: 'Some Liars are hollow.',
};
const kindOf = (f) => (f.minions?.id && RULES[f.minions.id] ? f.minions.id : null);
/* a clock the player races: the Hours take a fifth of it */
const clockK = (f) => (kindOf(f) === 'hours' ? 0.8 : 1);
function sayRule(f) {
  const k = kindOf(f); const S = state(f); if (!k || S.said.rule || f.journey) return;
  S.said.rule = true; setTimeout(() => { if (!f.over) f.hud.toast?.(RULES[k]); }, 2600);
}

/* fight.js spawnFoe: a foe of the enemy's kind takes its rule */
export function onSpawn(f, foe) {
  if (!QN(f) || !foe || foe.boss) return;
  const k = kindOf(f); if (!k) return;
  sayRule(f);
  if (k === 'hounds') { foe.speed *= 1.25; foe.hp = foe.maxHp = Math.max(1, Math.round(foe.maxHp * 0.8)); }
  else if (k === 'watchers') { foe.speed *= 0.88; foe.hp = foe.maxHp = Math.round(foe.maxHp * 1.3); }
  else if (k === 'clerks') foe.q2shield = 1;
  else if (k === 'ghosts') foe.q2slip = 1;
  else if (k === 'debts') foe.q2up = 1;
  else if (k === 'liars') { if (Math.random() < 0.34 && !foe.def?.marked && !foe.def?.own) { foe.hp = foe.maxHp = 1; foe.q2hollow = true; } }
  else if (k === 'hours') foe.speed *= 1.1;
  else if (k === 'doubts') {
    const off = f.world.addUpdater(() => {
      /* fade, never root.visible (the near-frame system owns that: forcing it on drew a foe at the lens as a black panel);
         a foe that runs at the companion, the gate or the fire is always seen, at any range */
      if (foe.gone || foe.state === 'dead' || f.over || !f.active) { try { if (!foe.gone && foe.state !== 'dead') foe.actor.fade(1); } catch { /* gone */ } off(); return; }
      const d = Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z); const show = d < 8.5 || foe.state === 'attack' || foe.going || foe.def?.marked ? 1 : 0;
      foe.q2a = (foe.q2a ?? 1) + (show - (foe.q2a ?? 1)) * 0.12; try { foe.actor.fade(foe.q2a); } catch { /* gone */ }
    });
  }
}
/* fight.js damageFoe: returns the damage that lands */
export function onDamage(f, foe, dmg, { heavy = false, dir = null } = {}) {
  if (!QN(f) || !foe || foe.boss || dmg <= 0) return dmg;
  if (foe.q2shield > 0) {
    foe.q2shield--; if (heavy) return dmg;
    try { f.sparks?.(V(foe.pos.x, 1.3, foe.pos.z), dir ? dir.clone().multiplyScalar(-1) : V(0, 1, 0), 0xcfe6ff, 18, 6); } catch { /* fx */ } sfx('clang');
    return 0;
  }
  if (foe.q2slip > 0 && foe.hp - dmg > 0) {
    foe.q2slip--; const a = Math.atan2(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z) + (Math.random() < 0.5 ? 1 : -1) * 1.1; const d = Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z) + 2.5;
    try { f.embers?.(V(foe.pos.x, 1.4, foe.pos.z), foe.eye ?? 0xb0c8ff, 26, 3); } catch { /* fx */ }
    foe.pos.x = f.pos.x + Math.sin(a) * d; foe.pos.z = f.pos.z + Math.cos(a) * d; if (!f.journey && foe.pos.length() > FIELD) foe.pos.setLength(FIELD); sfx('dodge', { gain: 0.5 });
  }
  /* a Debt that would fall to a plain blow gets up once; a heavy blow or a finisher ends it */
  if (foe.q2up > 0 && !heavy && foe.hp - dmg <= 0 && !(foe.state === 'stagger' || foe.state === 'down' || foe.state === 'getup')) {
    foe.q2up = 0; const keep = Math.max(1, Math.round(foe.maxHp * 0.35)); const land = Math.max(0, foe.hp - keep);
    setTimeout(() => { try { if (foe.state !== 'dead' && !foe.gone) f.knockDown(foe, dir ? dir.clone() : null, 5); } catch { /* gone */ } }, 0);
    return land;
  }
  return dmg;
}
/* fight.js killFoe (after the kill): the pair of a Chain staggers; an Ache flares */
export function onKill(f, foe, { dir = null } = {}) {
  if (!QN(f) || !foe || foe.boss) return;
  const k = kindOf(f);
  if (k === 'chains') {
    let best = null; let bd = 7; for (const x of alive(f)) { if (x === foe) continue; const d = Math.hypot(x.pos.x - foe.pos.x, x.pos.z - foe.pos.z); if (d < bd) { bd = d; best = x; } }
    if (best) { try { f.staggerFoe(best, dir || null); } catch { /* gone */ } }
  } else if (k === 'plagues') {
    const at = foe.pos.clone(); try { f.embers?.(V(at.x, 0.9, at.z), 0x9ad13a, 40, 2); } catch { /* fx */ }
    setTimeout(() => {
      if (f.over || !f.active) return; try { f.embers?.(V(at.x, 1.0, at.z), 0xb8e04a, 70, 5); } catch { /* fx */ } sfx('spawn', { gain: 0.5 });
      if (Math.hypot(f.pos.x - at.x, f.pos.z - at.z) < 2.3 && !(f.invuln > 0)) { try { f.takeHit({ pos: at.clone(), damage: 1, def: { label: f.minions?.one || 'Ache' } }, { dmg: 1, unblockable: true, push: 0.6 }); } catch { /* fine */ } }
    }, 1100);
  }
}
/* an animal with the hero harries a foe every few seconds (chapter II and the last fight) */
function harry(f) {
  if (!hasAnimal(f)) return () => {};
  let t = 5; const S = state(f);
  return (dt) => {
    t -= dt; if (t > 0) return; t = 7.5;
    const w = (f.wisps || []).find((x) => x.c?.kind === 'animal' && (x.state === 'with' || x.state === 'return')); if (!w) return;
    let best = null; let bd = 11; for (const x of alive(f)) { if (x.state === 'spawn' || x.state === 'down') continue; const d = Math.hypot(x.pos.x - f.pos.x, x.pos.z - f.pos.z); if (d < bd) { bd = d; best = x; } }
    if (!best) { t = 1.5; return; }
    const dir = V(best.pos.x - w.sp.position.x, 0, best.pos.z - w.sp.position.z).normalize();
    try { f.staggerFoe(best, dir); f.sparks?.(V(best.pos.x, 0.7, best.pos.z), dir, 0xffe0b0, 12, 4); } catch { /* gone */ }
    w.flare = 1; if (!S.said.bite) { S.said.bite = true; f.hud.toast?.(`${w.name} goes for its legs.`); }
  };
}

/* ---------- small shared pieces ---------- */
/* the companion with a body who acts in a chapter (the freed one first, in the chains shape) */
function body(f) {
  const ws = (f.wisps || []).filter((w) => w.c && (w.state === 'with' || w.state === 'return' || w.state === 'work' || w.state === 'hearth'));
  const kept = f.story?.shape === 'chains' ? f.story?.walk?.cage?.label : null; const k = kept && ws.find((w) => w.name === kept); if (k) return k;
  return ws.find((w) => w.c.kind === 'person') || ws[0] || null;
}
function glowAt(f, color = 0xffc27a, size = 1.2) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sp.scale.setScalar(size); sp.renderOrder = 8; f.world.scene.add(sp); (f.tethers ||= []).push(sp); return sp;
}
function ringAt(f, r, color = 0xffe0b0) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r + 0.22, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.5, depthWrite: false, fog: false, toneMapped: false }));
  m.renderOrder = 3; f.world.scene.add(m); (f.tethers ||= []).push(m); return m;
}
/* the view turns to a place for a moment (a foe the hero locked onto wins after the first look) */
function lookAt(f, at, { dur = 2.2, y = 1.0 } = {}) {
  const aim = V(at.x, y, at.z); let t = 0;
  const off = f.world.addUpdater((dt) => {
    t += dt; if (t > dur || f.over || !f.active) { off(); return; }
    if (f.lock && t > 0.9) return;
    const k = Math.sin(Math.PI * clamp(t / dur, 0, 1)) * 0.6 + 0.4; f.turnToward(aim, Math.min(1, dt * 3.4 * k));
  });
}
/* a place for a foe beyond `at` as the hero sees it */
function beyond(f, at, dist, spread, i = 0) {
  const a0 = Math.atan2(at.x - f.pos.x, at.z - f.pos.z); const a = a0 + ((i % 3) - 1) * spread * 0.8 + (Math.random() - 0.5) * spread * 0.5;
  const p = V(at.x + Math.sin(a) * dist, 0, at.z + Math.cos(a) * dist); if (p.length() > FIELD) p.setLength(FIELD); return p;
}
/* a place on the rim of the field at an angle from the hero's view */
function rim(f, ang, r = FIELD - 0.5) { const fw = f.forward(); const a = Math.atan2(fw.x, fw.z) + ang; return V(Math.sin(a) * r, 0, Math.cos(a) * r); }
/* a foe that runs for a place and turns on the hero when the hero comes near or strikes it */
function runFor(f, foe, at, { reach = 1.5, near = 4.0, speed = 3.5, onReach }) {
  const R = { going: true, cd: 0 }; foe.going = true;
  foe.drive = (dt, moveTo, idle) => {
    if (!R.going) return false;
    const dh = Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z);
    if (dh < near || foe.hp < foe.maxHp) { R.going = false; foe.going = false; return false; }
    const p = typeof at === 'function' ? at() : at; if (!p) { R.going = false; foe.going = false; return false; }
    const dx = p.x - foe.pos.x; const dz = p.z - foe.pos.z; const d = Math.hypot(dx, dz) || 1; foe.yaw = Math.atan2(dx, dz);
    if (R.cd > 0) { R.cd -= dt; if (R.cd < 1.8) foe.actor.play(idle, { fade: 0.25 }); return true; }
    if (d > reach) { moveTo(V(p.x, 0, p.z), speed, 'Jog_Fwd_Loop'); return true; }
    R.cd = onReach(foe, R) ?? 2.8; return true;
  };
  return R;
}
/* foes keep coming for the whole chapter: a new group every `every` s, and at once when none is left */
function pressure(f, { every = 5, cap: most = 3, first = 2.2, types, place }) {
  let t = first; let n = 0;
  return (dt, on = true) => {
    t -= dt; const a = alive(f).length;
    if (!on || f.spawning || a >= most) return;
    if (t > 0 && !(a === 0 && t < every - 1.0)) return;
    t = every; const ty = types[n % types.length]; n++;
    f.spawnWave(null, { quiet: true, spec: (Array.isArray(ty) ? ty : [ty]).map((x, i) => [x, 1, { place: () => place(i + n) }]) });
  };
}
const hearts = (n, of) => `${'●'.repeat(Math.max(0, n))}${'○'.repeat(Math.max(0, of - n))}`;

/* ---------- the lines of the new beats (fight.js start() calls retell before the chapter I card) ---------- */
export function retell(f) {
  const st = f.story; if (!st || !QN(f)) return;
  const ww = f.ww || ((t) => t); const foe = String(st.enemy || 'The enemy').replace(/^The /, 'the ');
  const lead = (st.loved && (f.story.flames || [])[0]) || null; const them = st.loved ? (st.many ? 'them' : lead) : null;
  const set = (o, patch) => { for (const [k, v] of Object.entries(patch)) if (v != null) o[k] = typeof v === 'string' ? ww(v) : v; };
  if (st.shape === 'vigil') {
    /* I: the road is ambushed (no wood to gather); II: the walk to the fire */
    set(st.first, { title: 'The Road Home', line: them ? `${cap(foe)}'s people are on the road. Walk ${st.taken} home.` : `${cap(foe)}'s people are on the road. Walk home.`, goal: them ? `Walk ${them} home` : 'Walk home' });
    set(st.second, { title: 'The Last Mile', line: them ? `They come for ${lead}. Walk ${lead} to the fire.` : 'They come for the flame. Walk it to the fire.' });
    st.goal = ww(them ? `Keep ${lead} safe` : 'Keep the flame safe'); st.secondWon = ww('The fire is lit.');
    if (st.walk?.hearth) st.walk.hearth.goal = st.first.goal;
  } else if (st.shape === 'hunt') {
    /* I: the enemy comes in person, takes them and goes; then its scout runs */
    set(st.first, { title: 'The Taking', line: `${cap(st.enemy)} comes down the road.`, goal: 'Drive it off' });
    set(st.second, { line: `One ${f.minions?.one || 'of them'} wears the mark. Kill it before it gets away.` });
  } else if (st.shape === 'chains') {
    const kept = st.walk?.cage?.label || 'them';
    set(st.first, { title: 'The Ring', line: `They close a ring around you. Break out, then free ${kept === 'Stranger' ? 'the stranger' : kept}.`, goal: 'Break out' });
  } else if (st.shape === 'trial') {
    set(st.first, { title: 'Three Duels', line: `Three challengers wait in the ring. Beat them one at a time.`, goal: 'Win three duels' });
  } else if (st.shape === 'dark') {
    set(st.second, { line: `${cap(st.enemy)} lets one light burn. Choose.` });
    st.goal = `${lead || 'The stars'} or ${String(sq().weaponName || f.weapon?.label || 'the blade')}?`; st.secondWon = ww('One light burns.');
  }
}
/* chapters.js prepare(): the chapter II card and the twist lines that chapters.js would overwrite */
export function prepare(f) {
  const st = f.story; if (!st || !QN(f)) return;
  const ww = f.ww || ((t) => t);
  if (st.shape === 'chains') {
    const who = body(f)?.name || st.walk?.cage?.label || 'They';
    st.second = { ...st.second, title: ww('The Way Out'), line: ww(`The way out closes. Run. ${who === 'Stranger' ? 'The stranger' : who} follows you.`) };
    st.goal = ww('Get out'); st.secondWon = ww('You are out.');
    /* III is the bound enemy (two anchors), not "stand by them" */
    if (st.twist) st.twist = { ...st.twist, line: ww(`Two anchors shield ${String(st.enemy).replace(/^The /, 'the ')}.`), goal: '', sub: '', done: ww('Attack now.') };
  }
  if (st.shape === 'trial' && st.twist) st.twist = { ...st.twist, ring: ww('Stay in the ring') };
}

/* ---------- chapter II ---------- */
export async function second(f, ctx) {
  const st = f.story; if (!st || !QN(f)) return false;
  state(f).harry = harry(f);
  if (st.shape === 'vigil' && ctx.preFire) return escort(f, ctx);
  if (st.shape === 'chains') return runOut(f, ctx);
  if (st.shape === 'dark') return chooseLight(f, ctx);
  if (st.shape === 'hunt') return huntMarked(f, ctx);
  return false; /* trial: chapters.js holdGate (it reads lostGate below) */
}
/* trial II: three through the gate and it is lost (chapters.js holdGate asks) */
export const gateLost = (f, past, t) => QN(f) && (past >= 3 || (FORCE_FAIL && t > 5));

/* protect II: the companion walks from one side of the field to the fire on the other. Foes go for them, not for the hero.
   Three blows and the enemy has them. The hero's task is to move with them and cut off what comes. */
async function escort(f, { set, finish, preFire: fire }) {
  const st = f.story; const w = body(f); const fwd = f.forward();
  const A = V().copy(f.pos).addScaledVector(fwd, -30); A.setLength(FIELD - 2.6);
  const B = V().copy(f.pos).addScaledVector(fwd, 30); B.setLength(FIELD - 2.4);
  /* the fire waits, small, at the far side */
  fire.pos.set(B.x, 0, B.z); try { fire.group?.position.set(B.x, 0, B.z); } catch { /* no group */ } fire.hp = 100; if (fire.args) { fire.args.hp = 0.22; fire.args.away = false; fire.args.threatened = false; }
  const flame = w ? null : glowAt(f, 0xffb45a, 0.9); /* nobody named: a small flame is walked to the fire */
  const P = w ? w.sp.position : flame.position; P.set(A.x, w ? 0 : 1.3, A.z);
  for (const x of f.wisps) if (x !== w) x.state = 'with';
  if (w) { w.state = 'work'; w.workAt = B; }
  const name = w ? w.name : cap(f.kit?.words?.cause || 'the flame');
  const MAX = 3 + (hasPerson(f) && w?.c?.kind === 'person' ? 1 : 0); let hp = MAX; let flinch = 0; let t = 0; const LEN = Math.hypot(B.x - A.x, B.z - A.z); const speed = LEN / 32;
  const seen = new Set(); const S = state(f);
  lookAt(f, B, { dur: 1.6, y: 0.9 }); setTimeout(() => { if (!f.over && f.task) lookAt(f, P, { dur: 1.8, y: 1.1 }); }, 1900);
  f.director?.event?.('The companion walks across the field to the fire. Foes go for the companion; the hero keeps them off.');
  const strike = (foe) => {
    foe.actor.play('Sword_Regular_A', { loop: false, fade: 0.08, restart: true });
    setTimeout(() => {
      if (foe.gone || foe.state === 'dead' || !f.task || f.over) return;
      hp--; flinch = 2.4; if (w) w.flare = 1; sfx('hit', { gain: 0.5 }); sfx('hurt', { gain: 0.3 }); f.shake = Math.max(f.shake || 0, 0.25);
      f.sparks?.(V(P.x, 0.9, P.z), V(0, 0.5, 0), 0xffc890, 14, 4);
      f.hud.line?.(hp > 0 ? `${name} is hit.` : `They have ${name}.`, '', 2000);
    }, 260);
    return 3.0;
  };
  const press = pressure(f, { every: 5.2, cap: 3, first: 2.8, types: [['rogue'], ['minion', 'minion'], ['warrior'], ['rogue', 'minion']], place: (i) => beyond(f, P, 9.5 + (i % 2) * 1.5, 1.1, i) });
  f.task = { update: (dt) => {
    t += dt; S.harry?.(dt);
    for (const foe of f.foes) { if (seen.has(foe) || foe.state === 'dead' || foe.boss) continue; seen.add(foe); if (seen.size % 3 !== 0) runFor(f, foe, () => P, { near: 6.5, onReach: strike }); } /* they turn on the hero from 6.5 m; two of three go for the companion; the third is the hero's */
    flinch = Math.max(0, flinch - dt);
    const close = f.foes.some((x) => x.state !== 'dead' && x.state !== 'spawn' && Math.hypot(x.pos.x - P.x, x.pos.z - P.z) < 2.4);
    const left = Math.hypot(B.x - P.x, B.z - P.z);
    if (flinch <= 0 && !close && t > 1.6 && left > 0.05) { const st2 = Math.min(left, speed * dt); P.x += (B.x - P.x) / left * st2; P.z += (B.z - P.z) / left * st2; }
    if (w?.c) { w.c.mood = flinch > 0 ? { clip: 'Hit_Knockback', until: (w.c.t || 0) + 0.4, move: false } : null; w.c.focus = { x: B.x, z: B.z, until: (w.c.t || 0) + 0.5 }; P.y = 0; }
    else if (flame) { P.y = 1.3 + Math.sin(f.clock * 3) * 0.08; flame.material.opacity = flinch > 0 ? 0.45 + 0.4 * Math.sin(f.clock * 30) : 0.95; }
    press(dt, left > 2.5);
    const k = 1 - left / LEN;
    /* the mark (and the screen-edge arrow) is on the foe at the companion, else on the companion */
    { let th = null; let td = 7; for (const x of f.foes) { if (x.state === 'dead' || x.boss || x.gone || x.state === 'spawn') continue; const d = Math.hypot(x.pos.x - P.x, x.pos.z - P.z); if (d < td && (x.going || d < 3)) { td = d; th = x; } }
      f.chapterGoal = th ? { x: th.pos.x, z: th.pos.z, r: 0.6, act: 'Stop it' } : { x: P.x, z: P.z, r: 1.4, act: name }; }
    set(`${name}  ${hearts(hp, MAX)}`, k);
    if (hp <= 0 || (FORCE_FAIL && t > 5)) { f.chapterGoal = null; if (w) { w.state = 'with'; w.workAt = null; } if (flame) flame.visible = false; if (fire.args) fire.args.hp = 0; try { fire.h?.die(); } catch { /* fallback fire */ } f.hearth = null; finish(false); return; }
    if (left < 2.2) {
      f.chapterGoal = null; if (w) { w.state = 'with'; w.workAt = null; w.flare = 1; if (w.c) w.c.mood = { clip: 'Yes', until: (w.c.t || 0) + 2, react: true }; } if (flame) flame.visible = false;
      if (fire.args) { fire.args.hp = 1; fire.args.away = false; fire.args.threatened = false; } try { fire.h?.flare(); } catch { /* fallback fire */ } f.world.flash(0.3); sfx('forge'); sfx('soul');
      for (const x of f.wisps) x.flare = 1; f.purge(); finish(true);
    }
  } };
  void st;
  return true;
}

/* freedom II: a run. The way out is a lit gap at the far rim and it closes on a clock. Two lines of foes stand
   across the way. The freed one follows the hero; a foe that reaches them holds them until the hero cuts it off. Out = the
   hero and the freed one at the gap. Clock at 0 = caught. */
async function runOut(f, { set, finish }) {
  const w = body(f); const S = state(f);
  /* three legs across the field: two gaps in their lines, then the way out */
  const PTS = [rim(f, 1.25, FIELD - 2), rim(f, -2.5, FIELD - 2), rim(f, 0.35, FIELD - 1.2)]; let leg = -1; let X = PTS[0]; let from = f.pos.clone();
  const LIMIT = 50 * clockK(f); let t = 0; let held = null; let catcher = null; let told = 0; const seen = new Set();
  const gap = ringAt(f, 2.4, 0xffe0b0); const beam = glowAt(f, 0xffd08a, 1.9); beam.material.opacity = 0.75;
  const name = w ? w.name : null; const P = w ? w.sp.position : null; if (w) { w.state = 'work'; w.workAt = PTS[2]; }
  const row = (types) => { const a = from.clone(); const side = V(-(X.z - a.z), 0, X.x - a.x).normalize(); const to = X.clone(); return f.spawnWave(null, { quiet: true, spec: types.map((ty, i) => [ty, 1, { place: () => { const p = V().lerpVectors(a, to, 0.6).addScaledVector(side, (i - (types.length - 1) / 2) * 2.8); if (p.length() > FIELD) p.setLength(FIELD); return p; } }]) }); };
  const next = () => { leg++; from = f.pos.clone(); X = PTS[leg]; gap.position.set(X.x, 0.09, X.z); beam.position.set(X.x, 2.2, X.z); lookAt(f, X, { dur: 1.3, y: 1.6 }); sfx('forge', { gain: 0.4 }); return row(leg === 0 ? ['minion', 'warrior', 'minion'] : leg === 1 ? ['rogue', 'minion'] : ['warrior', 'rogue']); };
  sfx('roar', { gain: 0.5 });
  f.director?.event?.('The way out closes. The hero runs for it across the field, through the foes; the freed one follows.');
  await next();
  f.task = { update: (dt) => {
    t += dt; S.harry?.(dt);
    const dX = Math.hypot(f.pos.x - X.x, f.pos.z - X.z); const last = leg === PTS.length - 1;
    if (!last && dX < 2.6 && !f.spawning) { f.world.flash(0.12); next(); return; }
    if (w) {
      /* one foe at a time goes for the freed one and holds them until the hero cuts it off */
      if (catcher && (catcher.state === 'dead' || catcher.gone || !catcher.going)) { catcher = null; held = null; }
      if (!catcher && t > 2) for (const foe of f.foes) { if (seen.has(foe) || foe.state === 'dead' || foe.boss || foe.state === 'spawn') continue; seen.add(foe); if (seen.size % 2) continue; catcher = foe; runFor(f, foe, () => P, { near: 5, speed: 4.2, onReach: () => { if (!held) { held = foe; sfx('hurt', { gain: 0.3 }); f.hud.line?.(`They have ${name}.`, '', 2200); } return 1.2; } }); break; }
      if (held && Math.hypot(held.pos.x - P.x, held.pos.z - P.z) > 3) held = null;
      if (!held) { const dx = f.pos.x - P.x; const dz = f.pos.z - P.z; const d = Math.hypot(dx, dz); if (d > 2.4) { const st2 = Math.min(d - 2.4, 4.4 * dt); P.x += dx / d * st2; P.z += dz / d * st2; } }
      P.y = w.c ? 0 : 1.4;
      if (w.c) { w.c.mood = held ? { clip: 'Hit_Knockback', until: (w.c.t || 0) + 0.4, move: false } : null; w.c.focus = { x: X.x, z: X.z, until: (w.c.t || 0) + 0.5 }; }
    }
    const wd = w ? Math.hypot(P.x - X.x, P.z - X.z) : 0; const n = Math.max(0, Math.ceil(LIMIT - t));
    gap.material.opacity = 0.45 + 0.3 * Math.sin(f.clock * (n < 10 ? 12 : 4));
    f.chapterGoal = held ? { x: held.pos.x, z: held.pos.z, r: 0.6, act: `Free ${name}` } : last && dX < 2.6 && w && wd > 5 ? { x: P.x, z: P.z, r: 1.4, act: name } : { x: X.x, z: X.z, r: 1.6, act: last ? 'The way out' : 'Run' };
    set(`${n} s`, 1 - t / LIMIT);
    if (last && dX < 2.8 && w && wd >= 5 && f.clock - told > 5) { told = f.clock; f.hud.line?.(`Not without ${name}.`, '', 2200); }
    if (last && dX < 2.8 && (!w || wd < 5) && !FORCE_FAIL) { f.chapterGoal = null; f.world.flash(0.3); sfx('soul'); if (w) { w.state = 'with'; w.workAt = null; w.flare = 1; } gap.visible = beam.visible = false; f.purge(); finish(true); return; }
    if (t > LIMIT || (FORCE_FAIL && t > 5)) { f.chapterGoal = null; if (w) { w.state = 'with'; w.workAt = null; } gap.visible = beam.visible = false; f.hud.line?.('The way out is shut.', '', 2400); finish(false); }
  } };
  return true;
}

/* freedom II: a sealed bar shuts the way out. The hero breaks it, blow by blow; the freed one stands off to the side and
   holds a foe at a time. Three blows on the freed one and the enemy has them again. */
async function breakSeal(f, { set, finish }) {
  const w = body(f); const fwd = f.forward(); const right = V(-fwd.z, 0, fwd.x);
  const at = V().copy(f.pos).addScaledVector(fwd, 7.5); if (at.length() > FIELD - 4) at.setLength(FIELD - 4);
  const HP = 18; const seal = f.addProp('anchor', at.x, at.z, HP); seal.q2seal = true;
  const spot = V().copy(at).addScaledVector(right, 5.2).addScaledVector(fwd, -2.5); if (spot.length() > FIELD - 2) spot.setLength(FIELD - 2);
  const name = w ? w.name : null; const MAX = 3 + (w?.c?.kind === 'person' ? 1 : 0); let hp = MAX; let flinch = 0; let t = 0; let last = HP; const LIMIT = 55 * clockK(f);
  if (w) { w.state = 'work'; w.workAt = spot; }
  const S = state(f); const seen = new Set(); let onW = null;
  lookAt(f, at, { dur: 2.2, y: 1.4 }); sfx('clangBig', { gain: 0.35 });
  f.director?.event?.('The hero breaks the seal on the way out while the freed one holds the foes off.');
  const strike = (foe) => {
    foe.actor.play('Sword_Regular_A', { loop: false, fade: 0.08, restart: true });
    setTimeout(() => {
      if (foe.gone || foe.state === 'dead' || !f.task || f.over || !w) return;
      hp--; flinch = 1.6; w.flare = 1; sfx('hit', { gain: 0.5 }); sfx('hurt', { gain: 0.3 }); f.sparks?.(V(spot.x, 0.9, spot.z), V(0, 0.5, 0), 0xffc890, 12, 4);
      f.hud.line?.(hp > 0 ? `${name} is hit.` : `They have ${name}.`, '', 2000);
    }, 260);
    return 3.6;
  };
  const press = pressure(f, { every: 4.6, cap: 4, first: 2.4, types: [['minion', 'rogue'], ['warrior'], ['minion', 'minion'], ['rogue', 'warrior']], place: (i) => beyond(f, at, 8.5 + (i % 2) * 1.5, 1.0, i) });
  f.task = { update: (dt) => {
    t += dt; S.harry?.(dt);
    /* one foe at a time goes for the freed one; the rest are the hero's */
    if (w && (!onW || onW.state === 'dead' || onW.gone || !onW.going)) { onW = null; for (const foe of f.foes) { if (seen.has(foe) || foe.state === 'dead' || foe.boss) continue; seen.add(foe); onW = foe; runFor(f, foe, () => spot, { onReach: strike }); break; } }
    for (const foe of f.foes) seen.add(foe);
    flinch = Math.max(0, flinch - dt);
    if (w) { const p = w.sp.position; p.x += (spot.x - p.x) * Math.min(1, dt * 2.5); p.z += (spot.z - p.z) * Math.min(1, dt * 2.5); p.y = 0;
      const near = f.foes.find((x) => x.state !== 'dead' && Math.hypot(x.pos.x - spot.x, x.pos.z - spot.z) < 3);
      if (w.c) { w.c.mood = flinch > 0 ? { clip: 'Hit_Knockback', until: (w.c.t || 0) + 0.4, move: false } : near ? { clip: 'Sword_Regular_A', until: (w.c.t || 0) + 0.6, move: false } : null; const fx = near ? near.pos : at; w.c.focus = { x: fx.x, z: fx.z, until: (w.c.t || 0) + 0.5 }; } }
    /* a heavy build breaks it in half the blows */
    if (seal.hp < last) { if (heavyBuild()) seal.hp -= last - seal.hp; last = seal.hp; }
    const k = 1 - clamp(seal.hp / HP, 0, 1);
    press(dt, seal.hp > 2);
    const n = Math.max(0, Math.ceil(LIMIT - t));
    set(w ? `${name}  ${hearts(hp, MAX)}` : `${n} s`, k);
    if (seal.hp <= 0) { f.world.flash(0.3); sfx('soul'); f.embers?.(V(at.x, 1.4, at.z), 0xffd08a, 60, 4); if (w) { w.state = 'with'; w.workAt = null; w.flare = 1; if (w.c) w.c.mood = { clip: 'Yes', until: (w.c.t || 0) + 2, react: true }; } f.purge(); finish(true); return; }
    if ((w && hp <= 0) || (!w && t > LIMIT) || (FORCE_FAIL && t > 5)) { seal.hp = 0; seal.done = true; if (w) { w.state = 'with'; w.workAt = null; } finish(false); }
  } };
  return true;
}

/* wonder II: two lights stand at the two sides of the field, each named for what it keeps. Lighting one puts the other out.
   The one given up is gone until the enemy is half beaten. A clock runs: with no choice, both go out. */
async function chooseLight(f, { set, finish }) {
  const st = f.story; const S = state(f); const w = body(f);
  const fw = f.forward(); const right = V(-fw.z, 0, fw.x);
  const at = (k) => { const p = V().copy(f.pos).addScaledVector(fw, 9).addScaledVector(right, k * 6.5); /* both lights stand in view */ if (p.length() > FIELD - 2.5) p.setLength(FIELD - 2.5); return p; };
  const blade = String(sq().weaponName || f.weapon?.label || 'The blade');
  const who = w ? w.name : cap(String(st.taken || 'the stars'));
  const opts = [{ id: 'them', label: who, p: at(-1) }, { id: 'blade', label: blade, p: at(1) }];
  for (const o of opts) {
    o.prop = f.addProp('beacon', o.p.x, o.p.z, 1); o.tag = f.nameSprite(o.label); o.prop.q2act = `Keep ${o.label}`; o.tag.position.set(o.p.x, 5.2, o.p.z); o.tag.scale.multiplyScalar(5.6); o.tag.material.depthTest = false; o.tag.renderOrder = 9; f.world.scene.add(o.tag); (f.tethers ||= []).push(o.tag); o.hold = 0;
  }
  f.darkness(0.8, 8); const LIMIT = 40 * clockK(f); const HOLD = 2.4 * slightK(); let t = 0; let chosen = null; let after = 0;
  /* the view goes to one light, then to the other, before the clock matters */
  lookAt(f, opts[0].p, { dur: 1.7, y: 3.4 }); setTimeout(() => { if (!f.over && f.task && !chosen) lookAt(f, opts[1].p, { dur: 1.9, y: 3.4 }); }, 1800);
  setTimeout(() => { if (!f.over && f.task) f.hud.line?.('Keep one. Lose the other.', '', 3600); }, 900);
  f.director?.event?.('Two lights stand in the dark, one for the companion and one for the blade. The hero may keep only one.');
  const press = pressure(f, { every: 6, cap: 2, first: 5, types: [['rogue'], ['rogue', 'minion']], place: (i) => rim(f, Math.PI + (i % 2 ? 0.7 : -0.7)) });
  const paint = (o, lit, charge) => { const p = o.prop; if (p.h) { p.args.lit = lit; p.args.charge = charge; } else p.flame.scale.setScalar(lit ? 1.5 + Math.sin(f.clock * 9) * 0.12 : 0.16 + charge * 0.6); };
  f.task = { update: (dt) => {
    t += dt; S.harry?.(dt);
    if (!chosen) {
      let near = null; for (const o of opts) if (Math.hypot(f.pos.x - o.p.x, f.pos.z - o.p.z) < Math.max(2.3, f.propRad(o.prop) + 0.7)) near = o;
      for (const o of opts) { o.hold = o === near ? o.hold + dt : Math.max(0, o.hold - dt * 2); paint(o, false, o.hold / HOLD); o.tag.material.opacity = 0.75 + 0.25 * Math.sin(f.clock * 3 + o.p.x); }
      press(dt);
      const n = Math.max(0, Math.ceil(LIMIT - t)); set(near ? `${near.label}  ·  ${Math.round(near.hold / HOLD * 100)}%` : `${n} s`, near ? near.hold / HOLD : 1 - t / LIMIT);
      if (near && near.hold >= HOLD && !(FORCE_FAIL)) {
        chosen = near; const other = opts.find((o) => o !== near); near.prop.lit = true; try { near.prop.h?.light(); } catch { /* fallback beacon */ } paint(near, true, 0);
        other.prop.lit = true; other.prop.done = true; paint(other, false, 0); other.gone = 0; other.tag.material.color.setRGB(0.32, 0.32, 0.34); near.keep = glowAt(f, 0xffd08a, 4.2); near.keep.position.set(near.p.x, 4.2, near.p.z); /* in a sunny world the dark does not show: the kept light gets a tall glow, the lost one's name greys and sinks */ f.embers?.(V(other.p.x, 1.6, other.p.z), 0x6a7890, 50, 3); /* lit = true: the guide and the bot leave it */
        sfx('forge'); f.world.flash(0.25); f.darkness(0.45, 12);
        S.choice = near.id; S.lightAt = near.p.clone();
        f.hud.line?.(near.id === 'them' ? `${who} stays. ${cap(blade)} goes dark.` : `${cap(blade)} burns. ${who} is lost in the dark.`, '', 3600);
        f.director?.event?.(near.id === 'them' ? 'The hero keeps the companion\'s light and gives up the blade\'s.' : 'The hero keeps the blade\'s light and gives up the companion\'s.');
        /* what was given up: the blade dims, or the companion is taken into the dark */
        if (near.id === 'them') { S.powerWas = f.power; f.power *= 0.85; } else for (const x of f.wisps) { x.state = 'taking'; x.t = -x.i * 0.25; x.from.copy(x.sp.position); }
        /* the dark side sends what it hid */
        f.spawnWave(null, { quiet: true, spec: [['rogue', 2, { place: (i) => beyond(f, other.p, 2 + i, 0.6, i) }], ['minion', 1, { place: () => beyond(f, other.p, 3, 0.4, 2) }]] });
      } else if (t > LIMIT || (FORCE_FAIL && t > 5)) {
        for (const o of opts) { o.prop.lit = true; o.prop.done = true; paint(o, false, 0); o.tag.visible = false; } S.choice = 'none'; f.darkness(0.9, 6); finish(false); return;
      }
    } else {
      after += dt; paint(chosen, true, 0); chosen.tag.material.opacity = Math.max(0, 1 - after / 3); { const o2 = opts.find((o) => o !== chosen); o2.tag.position.y = 5.2 - Math.min(3.6, after * 1.2); o2.tag.material.opacity = Math.max(0, 0.8 - after / 3.5); if (chosen.keep) chosen.keep.material.opacity = 0.75 + 0.2 * Math.sin(f.clock * 5); }
      if (after > 1.5 && !f.spawning && alive(f).length === 0) { for (const o of opts) o.tag.visible = false; if (chosen.keep) chosen.keep.visible = false; finish(true); } else set('Finish the rest', 1);
    }
  } };
  return true;
}

/* revenge II: one foe wears the mark. It runs twice, and its people cover it. After it first runs a clock starts: when it
   ends, the Marked one is gone to its master, and stands beside it in the last fight. */
async function huntMarked(f, { set, finish, pack }) {
  const S = state(f); const base = f.kit.FOES.find((x) => x.id === 'warrior');
  const def = { ...base, hp: Math.round(base.hp * 3.8), label: `The Marked ${f.minions?.one || String(f.kit.FOES.find((x) => x.id === 'minion')?.label || 'One').replace(/^Hollow /, '')}`, size: 1.2, marked: true, own: true };
  await f.spawnWave(null, { quiet: true, spec: [['warrior', 1, { def, captain: true }]] });
  const mark = f.foes.find((x) => x.def === def); let fled = 0; let clock = null; const LIMIT = 40 * clockK(f); let t = 0;
  f.director?.event?.('One foe wears the enemy\'s mark. The hero hunts it before it gets away.');
  f.task = { update: (dt) => {
    t += dt; S.harry?.(dt);
    if (FORCE_FAIL && mark && mark.state !== 'dead' && clock == null) clock = 1.2; /* tests: it gets away at once */
    if (!mark || mark.state === 'dead') { if (f.cleared()) finish(true); else set('Finish the rest', 0); return; }
    const frac = mark.hp / mark.maxHp;
    if (clock != null) clock -= dt;
    set(clock != null ? `${Math.max(0, Math.ceil(clock))} s` : '', frac);
    if (fled < 2 && frac < (fled === 0 ? 0.66 : 0.33) && !f.spawning) {
      fled++; f.embers?.(V(mark.pos.x, 1.6, mark.pos.z), mark.eye, 50, 4); sfx('dodge');
      const away = V().subVectors(mark.pos, f.pos).setY(0).normalize(); mark.pos.copy(f.pos).addScaledVector(away, 12); if (mark.pos.length() > FIELD + 0.5) mark.pos.setLength(FIELD + 0.5);
      f.releaseToken(mark); mark.state = 'idle'; mark.atk = null; mark.cd = 5; if (clock == null) { clock = LIMIT; f.hud.line?.(`${mark.def.label} runs. Catch it.`, '', 2600); } else f.hud.toast?.(`${mark.def.label} runs`);
      f.spawnWave(fled === 1 ? pack : 'reinforce_stalkers', { quiet: true });
    }
    if (clock != null && clock <= 0) {
      /* it gets away: gone from the field, and back beside its master */
      S.markEscaped = { hp: Math.max(0.35, frac), def }; f.embers?.(V(mark.pos.x, 1.6, mark.pos.z), mark.eye, 70, 5); sfx('roar', { gain: 0.5 });
      try { f.releaseToken?.(mark); mark.state = 'dead'; mark.group.members = mark.group.members.filter((x) => x !== mark); mark.actor.dispose(); mark.gone = true; if (f.lock === mark) f.lock = null; f.foes = f.foes.filter((x) => x !== mark); } catch { /* gone */ }
      f.hud.line?.(`${def.label} got away.`, '', 2600); f.purge(); finish(false);
    }
  } };
  return true;
}

/* ---------- the last fight ---------- */
/* fight.js bossPhase reads f.phaseAt: the enemy changes at its own points in each shape (they were 60 % and 30 % for all) */
const PHASES = { vigil: [0.66, 0.33], hunt: [0.5, 0.22], trial: [0.62, 0.28], chains: [0.58, 0.3], dark: [0.5, 0.25] };
/* fight.js startBoss, at its start: true = the hero gets no rest before it (chapter II was lost) */
export function bossOpen(f) {
  if (!QN(f)) return false;
  f.phaseAt = PHASES[f.story.shape] || null;
  return !!f.failedII;
}
/* fight.js startBoss, when the enemy stands on the field (after setupTwist): its health from the first meeting, the Marked
   one that got away, and the events that are this shape's own */
export function bossReady(f) {
  if (!QN(f)) return;
  const st = f.story; const S = state(f); const b = f.bossFoe;
  if (b && S.earlyFrac != null) b.hp = Math.max(1, Math.round(b.maxHp * S.earlyFrac));
  else if (f.boss && S.earlyFrac != null && typeof f.boss.hp === 'number') f.boss.hp = Math.max(1, f.boss.maxHp * S.earlyFrac);
  if (S.markEscaped) { const d = { ...S.markEscaped.def, hp: Math.max(4, Math.round(S.markEscaped.def.hp * S.markEscaped.hp)) }; f.spawnWave(null, { quiet: true, spec: [['warrior', 1, { def: d, captain: true, place: () => rim(f, 0.5) }]] }); }
  const inner = f.twistFn; let t = 0; let back = false; let ran = false; let runners = false; const anim = harry(f); let camp = null; const setEm = (tx) => { const em = f.bossEl?.querySelector('em'); if (em && em.textContent !== tx && (tx || /^Guards /.test(em.textContent))) em.textContent = tx; };
  const line = (tx, sub = '', ms = 3000) => { if (tx) { f.hud.line?.(tx, sub, ms); f.twistSaid = f.clock; } };
  const RR = 6; const ring = st.shape === 'trial' ? ringAt(f, RR) : null; let outT = 0; const C = V(); if (ring) { const bp = b ? b.pos : f.pos; C.set((f.pos.x + bp.x) / 2, 0, (f.pos.z + bp.z) / 2); if (C.length() > FIELD - RR - 2.2) C.setLength(FIELD - RR - 2.2); /* the ring lies between the two of them */ ring.position.set(C.x, 0.09, C.z); watchers(f, C, RR + 1.3); f.noAdds = true; setTimeout(() => { if (!f.over) line('A duel. Stay in the ring.', '', 3600); }, 5200); }
  f.twistFn = (dt, hp) => {
    t += dt; try { inner?.(dt, hp); } catch (err) { console.warn('twist', err); } anim(dt);
    /* what a lost chapter II took comes back when the enemy is half beaten (vigil has its own return in fight.js) */
    if (!back && hp < 0.5 && f.taken && st.shape !== 'vigil' && (f.wisps || []).some((w) => w.state === 'boss')) {
      back = true; for (const w of f.wisps) { w.state = 'return'; w.t = 0; w.flare = 1; }
      f.hp = Math.min(f.maxHp, f.hp + Math.ceil(f.maxHp * 0.3)); f.world.flash(0.35); sfx('soul'); line(st.freed || 'They are free.');
    }
    /* trial: a duel in a ring. Out of the ring the enemy rests */
    if (ring) {
      const out = Math.hypot(f.pos.x - C.x, f.pos.z - C.z) > RR + 0.4; outT = out ? outT + dt : 0; ring.material.opacity = out ? 0.6 + 0.3 * Math.sin(f.clock * 10) : 0.35;
      f.chapterGoal = out ? { x: C.x, z: C.z, r: RR - 1.5, act: st.twist?.ring || 'Stay in the ring' } : null;
      if (out && outT > 0.6) { f.bossMend(0.012 * dt); if (!S.said.ring || f.clock - S.said.ring > 9) { S.said.ring = f.clock; line(st.twist?.ring || 'Stay in the ring', '', 2200); } }
    }
    /* hunt: at 55 % it runs to its camp at the far rim. Three guards stand there, and while one lives blows on
       the enemy glance off. The fight moves across the field. */
    if (st.shape === 'hunt' && !ran && hp < 0.55 && b && b.state !== 'dead' && !f.spawning) {
      ran = true; const away = V().subVectors(b.pos, f.pos).setY(0); if (away.lengthSq() < 0.01) away.set(0, 0, 1); away.normalize();
      const K = V().copy(f.pos).addScaledVector(away, 30); K.setLength(FIELD - 1.5); camp = { K, guards: null, mark: ringAt(f, 3.2, f.world.biome?.accent ?? 0xff4a12), glow: glowAt(f, f.world.biome?.accent ?? 0xff4a12, 2.6) };
      camp.mark.position.set(K.x, 0.09, K.z); camp.glow.position.set(K.x, 3.4, K.z);
      f.embers?.(V(b.pos.x, 2, b.pos.z), b.eye, 60, 5); sfx('dodge'); sfx('roar', { gain: 0.6 }); b.pos.copy(K);
      try { f.releaseToken(b); b.state = 'idle'; b.atk = null; b.cd = 4.5; } catch { /* fine */ }
      line(`${cap(st.enemy)} runs to ${f.nemesis?.pronoun === 'he' ? 'his' : f.nemesis?.pronoun === 'she' ? 'her' : 'its'} camp.`, '', 3000); lookAt(f, K, { dur: 1.8, y: 1.6 });
      const base = f.kit.FOES.find((x) => x.id === 'warrior'); const gd = { ...base, hp: Math.round(base.hp * 3), label: `Camp ${f.minions?.one || 'Guard'}`, own: true };
      f.spawnWave(null, { quiet: true, spec: [['warrior', 4, { def: gd, place: (i) => { const a = Math.atan2(f.pos.x - K.x, f.pos.z - K.z) + (i - 1.5) * 0.6; const p = V(K.x + Math.sin(a) * 3.4, 0, K.z + Math.cos(a) * 3.4); if (p.length() > FIELD) p.setLength(FIELD); return p; } }]] }).then(() => { camp.guards = f.foes.filter((x) => x.def === gd); });
    }
    if (camp && !camp.done) {
      const live = camp.guards ? camp.guards.filter((x) => x.state !== 'dead' && !x.gone) : null;
      if (live && live.length === 0) { camp.done = true; f.bossMul = hp < 0.45 ? 1.5 : 1; f.chapterGoal = null; camp.mark.visible = camp.glow.visible = false; setEm(''); line('The camp falls.', '', 2600); sfx('breakPart'); f.world.flash(0.25); }
      else { f.bossMul = 0.3; camp.mark.material.opacity = 0.4 + 0.25 * Math.sin(f.clock * 5); const g = live && live[0]; if (g) f.chapterGoal = { x: g.pos.x, z: g.pos.z, r: 0.6, act: 'Kill the guards' }; setEm(live ? `Guards ${4 - live.length}/4` : ''); }
    }
    /* vigil: 40 s in, two runners come for the ones at the fire; a blow on them stops the fire's healing for a while */
    if (st.shape === 'vigil' && !runners && t > 40 && !f.taken && f.hearth && !f.spawning && hp > 0.12) {
      runners = true; const H = f.hearth.pos; line(`They go for ${(f.wisps[0] && !f.wisps[0].hidden && f.wisps[0].name) || 'the fire'}.`, '', 2800);
      f.spawnWave(null, { quiet: true, spec: [['rogue', 2, { place: (i) => beyond(f, H, 8 + i, 0.8, i) }]] }).then(() => {
        for (const foe of alive(f)) if (!foe.going) runFor(f, foe, () => H, { reach: 2.2, onReach: () => { sfx('hit', { gain: 0.5 }); f.sparks?.(V(H.x, 0.9, H.z), V(0, 0.5, 0), 0xffc890, 12, 4); for (const w of f.wisps) w.flare = 1; return 3.2; } });
      });
    }
  };
  /* wonder: what the choice gave up comes back at half (dark() below reads S.choice) */
}
/* glory III: the road's people stand round the duel ring, facing in, and cheer a blow that lands */
function watchers(f, C, r) {
  import('./props/folk.js').then(({ makeFolk }) => {
    if (f.over || !f.active) return; const all = []; const hs = [];
    for (let g = 0; g < 4; g++) { const names = ['', '', '']; const h = makeFolk(f.world.scene, names, { kinds: names.map(() => 'person'), kit: f.kit, WP: f.WP, crowd: true }); hs.push(h); for (const c of h.list) all.push(c); }
    all.forEach((c, i) => { const a = (i / all.length) * Math.PI * 2 + 0.26; c.position.set(C.x + Math.sin(a) * (r + (i % 2) * 0.5), 0, C.z + Math.cos(a) * (r + (i % 2) * 0.5)); if (c.label) c.label.visible = false; c.focus = { x: C.x, z: C.z, until: 1e9 }; c.mood = { clip: i % 3 === 0 ? 'Idle_Talking_Loop' : 'Idle_FoldArms_Loop', until: 1e9 }; });
    let seenHp = f.bossFrac(); let cheer = 0;
    const off = f.world.addUpdater((dt) => {
      if (!f.active || f.stage !== 3 || (f.over && !f.deathCam && !f.dd)) { off(); for (const h of hs) { try { h.dispose(); } catch { /* gone */ } } return; }
      const hp = f.bossFrac(); cheer -= dt; if (hp < seenHp - 0.04 && cheer <= 0) { cheer = 2.4; all.forEach((c, i) => { if (i % 2 === 0) c.mood = { clip: 'Dance_Loop', until: (c.t || 0) + 1.1, after: true }; }); setTimeout(() => { for (const c of all) if (c.mood?.clip === 'Dance_Loop') c.mood = { clip: 'Idle_FoldArms_Loop', until: 1e9 }; }, 1200); } seenHp = Math.min(seenHp, hp);
      for (const h of hs) h.update(dt, f.clock, f.world.camera);
    });
  }).catch((err) => console.warn('quest watchers', err));
}
/* chapters.js twist(): true = this file set the twist */
export function twist(f, ctx) {
  const st = f.story; if (!st || !QN(f)) return false;
  if (st.shape === 'dark') return darkStalk(f, ctx);
  return false;
}
/* fight.js: the anchors of the bound enemy; a late rescue (chapter I clock) makes them harder */
export const anchorHp = (f) => (QN(f) && state(f).rescueLate ? 6 : 4);
/* chapters.js: the chains shape keeps its bound enemy (two anchors, fight.js) in the new quest */
export const boundBoss = (f) => QN(f) && f.story?.shape === 'chains';

/* wonder III: the dark. With the companion's light kept, the companion walks round the hero with it (blows land in it,
   glance out of it). With the blade's light kept, the lit beacon is the only light: the fight is fought by it. At half,
   what was given up comes back: the blade burns again, or the companion returns with a second light. With no choice made
   there is no light until then. */
function darkStalk(f, { tw, line, sub }) {
  const S = state(f); const choice = S.choice || 'them';
  const w = choice === 'them' ? body(f) || (f.wisps || []).find((x) => x.state === 'with') || null : null;
  const mk = () => {
    const glow = glowAt(f, 0xffc27a, 1.3);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(5.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb060).multiplyScalar(0.35), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const edge = new THREE.Mesh(new THREE.RingGeometry(4.95, 5.2, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.45), transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false, fog: false }));
    edge.renderOrder = 3; f.world.scene.add(pool, edge); (f.tethers ||= []).push(pool, edge);
    return { glow, pool, edge, P: V(), on: false, set(p) { this.P.copy(p); glow.position.set(p.x, 2.3, p.z); pool.position.set(p.x, 0.05, p.z); edge.position.set(p.x, 0.07, p.z); }, show(k) { glow.material.opacity = 0.9 * k; pool.material.opacity = 0.55 * k; edge.material.opacity = (0.55 + 0.15 * Math.sin(f.clock * 3)) * k; glow.visible = pool.visible = edge.visible = k > 0.01; } };
  };
  const A = mk(); const B2 = mk(); B2.show(0); const none0 = choice === 'none';
  const R = 3.0; let a = Math.atan2(f.pos.x, f.pos.z); let inK = 0; let started = false; let t0 = 0; const Q = V(); let back = false; let carrier = w;
  const fixed = choice === 'blade' && S.lightAt ? S.lightAt.clone() : null; if (fixed && fixed.length() > FIELD - 3) fixed.setLength(FIELD - 3);
  const carry = (L, c, dt, phase = 0) => {
    Q.set(f.pos.x + Math.sin(a + phase) * R, 0, f.pos.z + Math.cos(a + phase) * R); if (Q.length() > FIELD - 1) Q.setLength(FIELD - 1);
    if (c) { const p = c.sp.position; const dx = Q.x - p.x; const dz = Q.z - p.z; const d = Math.hypot(dx, dz); const st = Math.min(d, 1.8 * dt * clamp(d / 1.5, 0.3, 1.6)); if (d > 1e-4) { p.x += dx / d * st; p.z += dz / d * st; } p.y = c.c ? 0 : 1.4; if (c.c) c.c.mood = null; L.set(V(p.x, 0, p.z)); } else L.set(Q);
  };
  f.twistFn = (dt, hp) => {
    if (!started) { started = true; t0 = f.clock; f.darkness(0.85, 6); setTimeout(() => line(none0 ? 'No light. Fight blind.' : tw.line, none0 ? '' : tw.sub, 3200), 1400); if (carrier) carrier.state = 'work'; if (choice === 'blade') for (const x of f.wisps) x.state = 'boss'; }
    a += dt * 0.22;
    const none = choice === 'none' && !back;
    if (none) A.show(0); else if (fixed && !back) { A.set(fixed); A.show(1); } else if (fixed) { A.set(fixed); A.show(1); } else { carry(A, carrier, dt); A.show(1); }
    /* at half, what was given up comes back */
    if (!back && hp < 0.5) {
      back = true; f.world.flash(0.3); sfx('soul');
      if (choice === 'them') { if (S.powerWas) f.power = S.powerWas * 1.2; line(`${cap(String(sq().weaponName || 'The blade'))} burns again.`, '', 3000); try { f.embers?.(V(f.pos.x, 1.4, f.pos.z), 0xffc27a, 60, 4); } catch { /* fx */ } }
      else { for (const x of f.wisps) { x.state = 'work'; x.t = 0; x.flare = 1; x.sp.position.set(f.pos.x + 3, x.c ? 0 : 1.4, f.pos.z + 3); } carrier = body(f) || (f.wisps || [])[0] || null; f.hp = Math.min(f.maxHp, f.hp + Math.ceil(f.maxHp * 0.25)); line(carrier && !carrier.hidden ? `${carrier.name} comes back with a light.` : 'A light comes back.', '', 3000); }
    }
    if (back && choice !== 'them') { carry(B2, carrier && !carrier.hidden ? carrier : null, dt, Math.PI); B2.show(1); }
    const inA = !none && Math.hypot(f.pos.x - A.P.x, f.pos.z - A.P.z) < 5.2; const inB = B2.glow.visible && Math.hypot(f.pos.x - B2.P.x, f.pos.z - B2.P.z) < 5.2; const inside = inA || inB;
    const G = inB || !A.glow.visible ? B2.P : A.P;
    f.chapterGoal = none ? null : { x: G.x, z: G.z, r: 3.6, act: 'Stay in the light', quiet: inside };
    inK += ((inside ? 1 : 0) - inK) * Math.min(1, dt * 3);
    if (f.clock - t0 > 1.2) f.darkness(0.85 - inK * 0.65, 6 + inK * 6);
    f.bossMul = none ? 0.8 : 0.75 + inK * 0.75;
    sub(none ? 'No light' : inside ? tw.in || 'In the light' : (tw.goal || 'Stay in the light'));
  };
  return true;
}

/* ---------- chapter I on the land (journey.js calls these) ---------- */
/* the length of each walk: the empty road is cut (27 % of a run was walking) */
export const WALK = { hearth: 104, cage: 112, gate: 86, trail: 140, farlight: 124 };
/* journey.js objective(): a line of this file's own for the moment, or null */
export function objective(J, o) {
  const q = J.q2; if (!q) return null;
  if (q.ring && q.ring.left > 0) { o.line = 'Break out'; o.sub = ''; const x = q.ring.foes.find((y) => y.state !== 'dead' && !y.gone); if (x) { o.x = x.pos.x; o.z = x.pos.z; o.act = ''; o.h = 2.6; o.foe = true; } return o; }
  if (q.visit) { o.line = q.visit.line || 'Drive it off'; o.sub = ''; const b = J.f.bossFoe; if (b && !b.gone) { o.x = b.pos.x; o.z = b.pos.z; o.act = ''; o.h = 3; o.foe = true; } return o; }
  if (q.amb && q.amb.left > 0) { o.line = 'Ambush'; o.sub = ''; const x = q.amb.foes.find((y) => y.state !== 'dead' && !y.gone); if (x) { o.x = x.pos.x; o.z = x.pos.z; o.act = ''; o.h = 2.6; o.foe = true; } return o; }
  return null;
}
/* the rescue clock in the cage walk's header */
export function clockText(J) { const q = J.q2; if (!q?.clock || q.clock.done) return ''; return `  ·  ${Math.max(0, Math.ceil(q.clock.t))} s`; }
const liveOf = (list) => list.filter((y) => y.state !== 'dead' && !y.gone).length;
async function spawnRing(J, n, r, types) {
  const f = J.f; const foes = []; const fw = f.forward(); const a0 = Math.atan2(fw.x, fw.z);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i + 0.5) * (Math.PI * 2 / n); const type = types[i % types.length];
    const foe = await J.spawnOne(type, J.foeDef(type), { x: f.pos.x + Math.sin(a) * r, z: f.pos.z + Math.cos(a) * r }, false); if (foe) foes.push(foe);
    if (J.done || J.arriving) break;
  }
  return foes;
}
/* journey.js build(): what this shape's walk adds */
export function startWalk(J) {
  const f = J.f; if (!QN(f)) return false;
  const q = (J.q2 = { t: 0 }); const S = state(f);
  if (J.mode === 'cage') {
    /* freedom: a ring round the hero at second 0; then the rescue runs against a clock */
    q.ring = { foes: [], left: 6 }; q.clock = { t: 85 * clockK(f), done: false, lost: false, on: false };
    spawnRing(J, 5, 4.8, ['minion', 'minion', 'rogue', 'minion', 'warrior']).then((foes) => { q.ring.foes = foes; q.ring.left = foes.length; q.ring.ready = true; sfx('roar', { gain: 0.5 }); });
    f.director?.event?.('A ring of foes closes round the hero at the first step. Then a cage must be broken open before time runs out.');
  } else if (J.mode === 'hearth') {
    /* protect: the road is ambushed, early and again past the middle */
    q.ambAt = [7, 58 * J.k]; q.amb = null;
  } else if (J.mode === 'trail') {
    earlyBoss(J).catch((err) => { console.warn('early boss', err); if (!J.scout && !J.done) J.spawnScout(); });
    return true; /* the scout comes after the enemy has gone */
  }
  void S;
  return false;
}
/* journey.js update(): each frame of the walk */
export function tickWalk(J, dt) {
  const q = J.q2; if (!q) return; const f = J.f; q.t += dt;
  if (q.ring?.ready) { const left = liveOf(q.ring.foes); if (left !== q.ring.left) { q.ring.left = left; if (left === 0) { J.lineUntil = 0; J.say('The ring breaks.', '', 2400); q.clock.on = true; } } }
  if (q.clock && q.clock.on && !q.clock.done && !J.arriving && !f.paused) {
    q.clock.t -= dt;
    if (J.freed || J.found >= 3 && Math.hypot(J.lx - f.pos.x, J.lz - f.pos.z) < 7) q.clock.done = true;
    else if (q.clock.t <= 0) {
      /* too slow: the cage is warned. Two more guards come, and the last fight's anchors are harder to break */
      q.clock.done = true; q.clock.lost = true; state(f).rescueLate = true; J.lineUntil = 0; J.say('Too slow. More guards come.', '', 2800); sfx('roar', { gain: 0.6 });
      for (const k of [-1, 1]) { const p = J.P(J.along(J.lx, J.lz) - 5, k * 3); J.spawnOne('warrior', J.foeDef('warrior'), p, false).catch(() => {}); }
    }
  }
  if (q.ambAt && q.ambAt.length && !J.arriving && !f.spawning && !(q.amb && q.amb.left > 0) && J.along(f.pos.x, f.pos.z) >= q.ambAt[0]) {
    q.ambAt.shift(); q.amb = { foes: [], left: 3 }; const A = q.amb; sfx('roar', { gain: 0.55 }); J.lineUntil = 0; J.say('Ambush.', '', 2000);
    spawnRing(J, 3, 6.5, ['rogue', 'minion', 'minion']).then((foes) => { A.foes = foes; A.left = foes.length; A.ready = true; });
    f.director?.event?.('Foes rise from the roadside round the hero.');
  }
  if (q.amb?.ready) q.amb.left = liveOf(q.amb.foes);
}
/* revenge I: the enemy comes in person in the first seconds. It fights until it has lost three tenths of its health or
   30 s have gone, takes the companion and goes. The hero says why they go on there, on the road. Then its scout runs.
   The dragon does not land: it passes over and takes them. */
async function earlyBoss(J) {
  const f = J.f; const st = f.story; const S = state(f); const q = J.q2; const n = f.nemesis || { id: 'giant', label: 'The Giant' }; const id = n.mech || n.id;
  q.visit = { line: 'Walk on' };
  await wait(2600); if (J.done || f.over) return;
  if (f.world.nemesis) { f.world.nemesis.leaving = true; f.world.nemesis.t = 0; }
  sfx('roar'); f.shake = Math.max(f.shake || 0, 0.7); f.world.flash(0.3);
  let foe = null;
  if (id !== 'dragon') {
    const def = { ...f.kit.bossFor(n) }; const at = J.P(J.along(f.pos.x, f.pos.z) + 12, 0);
    try { await f.spawnWave(null, { quiet: true, spec: [[def.id, 1, { def, place: () => V(at.x, 0, at.z) }]] }); foe = f.foes.find((x) => x.def === def) || null; } catch (err) { console.warn('early boss spawn', err); }
    if (foe) { foe.actor.noBlob = true; foe.minHp = Math.round(foe.maxHp * 0.7); foe.early = true; J.foes.push(foe); try { f.buildBossUi(n.label); } catch { /* no ui */ } }
  }
  if (J.done || f.over) return;
  q.visit.line = 'Drive it off'; J.lineUntil = 0; J.say(`${cap(st.enemy)} is here.`, f.enemyWords ? `“${f.enemyWords}”` : '', 3200);
  f.director?.event?.(`${st.enemy} comes down the road in person in the first seconds.`);
  f.q2guard = {}; /* the hero is beaten down, never killed, in this first meeting (fight.js takeHit) */
  if (foe) {
    let t = 0;
    await new Promise((res) => { const off = f.world.addUpdater((dt) => { if (f.paused) return; t += dt; if (f.over || J.done || foe.gone || foe.state === 'dead' || (foe.hp <= foe.minHp + 0.01 && t > 10) || t > 30 || f.q2guard?.hit) { off(); res(); } }); });
  } else await wait(2600);
  if (J.done || f.over) { f.q2guard = null; return; }
  /* the taking: the view goes to it, the companions are dragged off, and it goes */
  f.paused = true; f.keys.clear(); f.swing = null; f.charge = null; f.hud.cinema?.(true);
  f.taken = true; sfx('roar'); f.shake = Math.max(f.shake || 0, 0.7); f.world.flash(0.4);
  if (foe && !foe.gone) { try { f.releaseToken(foe); foe.state = 'taunt'; foe.t = 3.2; foe.atk = null; foe.actor.play('Spell_Simple_Shoot', { loop: false, fade: 0.1, speed: 0.6 }); } catch { /* fine */ } }
  const aim = foe && !foe.gone ? V(foe.pos.x, 2.2, foe.pos.z) : null; let lt = 0;
  const turn = f.world.addUpdater((dt) => { lt += dt; if (lt > 3.2 || !aim) return; f.turnToward(aim, Math.min(1, dt * 2.4)); });
  for (const w of f.wisps) { w.state = 'taking'; w.t = -w.i * 0.25; w.from.copy(w.sp.position); }
  f.hud.line?.(st.taking?.line || `${st.enemy} takes ${st.taken}.`, st.taking?.sub || '', 3400);
  f.director?.event?.(`${st.enemy} takes ${st.taken} and goes.`);
  await wait(3500); turn();
  if (foe && !foe.gone) { S.earlyFrac = clamp(foe.hp / foe.maxHp, 0.5, 1); try { f.embers?.(V(foe.pos.x, 2, foe.pos.z), foe.eye, 80, 6); } catch { /* fx */ } try { foe.dress?.dispose?.(); } catch { /* gone */ } J.despawn(foe); }
  if (f.bossFoe === foe) f.bossFoe = null; try { f.bossEl?.remove(); } catch { /* gone */ } f.bossEl = null; f.q2guard = null;
  f.hp = Math.max(f.hp, Math.ceil(f.maxHp * 0.6));
  f.hud.cinema?.(false); f.paused = false; q.visit = null;
  if (J.done || f.over) return;
  /* the vow, here on the road (fight.js camp: early) */
  try { await f.camp({ early: true }); } catch (err) { console.warn('early camp', err); }
  if (J.done || f.over) return;
  J.lineUntil = 0; J.say('Its scout runs. Catch it.', '', 2800);
  await J.spawnScout();
}

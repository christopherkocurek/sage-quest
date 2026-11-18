/* how every boss fights. fight.js keeps the attack state machine (startAttack, the 'attack' case,
   takeHit); this module owns the numbers and the choices.

   ONE SET OF NUMBERS PER BOSS (bossGeom). The giants are 3.3-3.5 x the hero with a reach of 1.45-1.55 x size
   (about 5.1 m) and a dress keepOut of 5.7-6.6 m. separate() holds the boss at keepOut, the old idle code attacked only
   inside reach + 0.2, so the stand-off (5.7-6.6 m) was always outside the attack start (5.3 m): the giants walked in
   place for the whole fight and never swung. Now every distance comes from the keep-out the fight really enforces:
     keep   = fight.holdOff(f)            the nearest the hero's centre may be to the boss's centre (dress keepOut, size)
     arm    = ARM[family]                 how far the blow reaches past the keep (the weapon, the step into it)
     hit    = keep + arm                  a blow lands on a hero inside this (fight.js tests dist <= f.reach + 0.75)
     engage = keep + arm * 0.5            the boss starts a melee blow inside this; always > keep, so it can always swing
   The camera (fight.js clearView, TALL_* rules) stands back from the hero, never in front of it, so it never changes these.
   checkGeom() warns once at spawn when a boss could never reach the player. */

export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- the moves. Same shape as fight.js ATK: hits = clip times, tell = seconds before the first hit (the wind-up),
   post = clip speed after it, end = clip time when the move ends, recover = seconds the boss stands open after it.
   kind tells the dress which pose to take (slam, sweep, stomp, charge, lunge, combo, break, bolt). wide: the blow hits
   a hero to the side too (a sweep). ring: a ground shock ring runs out from the blow (dodge through it), its damage. */
export const BOSS_ATK = {
  /* giants */
  gSlam: { clip: 'Sword_Attack', hits: [0.4], tell: 0.85, post: 0.85, end: 1.1, recover: 1.5, lunge: 0.6, dmg: 1.5, unblockable: true, hyper: true, quake: true, ring: 1, blunt: true, push: 3.0, kind: 'slam' },
  gSweep: { clip: 'Sword_Heavy_Combo', hits: [0.45], tell: 0.8, post: 1.0, end: 0.98, recover: 1.35, lunge: 0.4, dmg: 1.2, guardBreak: 2, hyper: true, wide: true, push: 3.4, blunt: true, kind: 'sweep' },
  gStomp: { clip: 'NinjaJump_Land', hits: [0.16], tell: 0.7, post: 0.8, end: 0.9, recover: 1.2, lunge: 0, dmg: 1.1, unblockable: true, hyper: true, quake: true, ring: 1, near: true, blunt: true, push: 3.8, kind: 'stomp' },
  gCharge: { clip: 'Shield_Dash', hits: [0.42], tell: 0.75, post: 1.0, end: 0.95, recover: 1.6, lunge: 9, dmg: 1.4, guardBreak: 3, hyper: true, blunt: true, push: 4.5, far: true, kind: 'charge' },
  gFury: { clip: 'Sword_Heavy_Combo', hits: [0.45, 1.17], tell: 0.75, post: 1.05, end: 1.75, recover: 1.7, lunge: 0.4, dmg: 1.1, guardBreak: 2, hyper: true, wide: true, push: 3.0, blunt: true, kind: 'sweep' },
  /* duelists (twin, lord, ronin, courier, drifter, knight) */
  dSlash: { clip: 'Sword_Regular_A', hits: [0.25], tell: 0.55, post: 1.0, end: 0.42, rec: 'Sword_Regular_A_Rec', recover: 0.9, lunge: 1.0, dmg: 1, kind: 'slash' },
  dLunge: { clip: 'Sword_Dash', hits: [0.33], tell: 0.6, post: 1.0, end: 1.0, recover: 1.1, lunge: 4.5, dmg: 1.2, far: true, kind: 'lunge' },
  dCombo: { clip: 'Sword_Regular_Combo', hits: [0.25, 0.73, 1.56], tell: 0.6, post: 1.1, end: 2.1, recover: 1.2, lunge: 0.8, dmg: 0.8, kind: 'combo' },
  dBreak: { clip: 'Sword_Attack', hits: [0.4], tell: 0.85, post: 1.2, end: 1.0, recover: 1.3, lunge: 0.9, dmg: 1.2, guardBreak: 3, hyper: true, kind: 'break' },
  dBash: { clip: 'Shield_OneShot', hits: [0.1], tell: 0.6, post: 1.0, end: 0.7, recover: 1.0, lunge: 1.6, dmg: 0.6, guardBreak: 3, push: 3.2, blunt: true, kind: 'break' },
  /* casters (lich, tower): bolts from range, blows when the hero comes in */
  cBolt: { clip: 'Spell_Simple_Shoot', hits: [0.1], tell: 0.8, post: 1.0, end: 0.46, recover: 0.7, lunge: 0, range: 15, dmg: 1, projectile: true, kind: 'bolt' },
  cVolley: { clip: 'Spell_Simple_Shoot', hits: [0.1, 0.26, 0.42], tell: 0.8, post: 0.55, end: 0.5, recover: 1.0, lunge: 0, range: 15, dmg: 1, projectile: true, kind: 'bolt' },
  cSweep: { clip: 'Sword_Regular_B', hits: [0.27], tell: 0.75, post: 1.0, end: 0.5, recover: 1.1, lunge: 0.6, dmg: 1.1, wide: true, guardBreak: 2, hyper: true, kind: 'sweep' },
  cStomp: { clip: 'Sword_Attack', hits: [0.4], tell: 0.85, post: 0.9, end: 1.1, recover: 1.4, lunge: 0.3, dmg: 1.2, unblockable: true, hyper: true, quake: true, ring: 1, blunt: true, push: 3.2, kind: 'stomp' },
  cLunge: { clip: 'Sword_Dash', hits: [0.33], tell: 0.7, post: 1.0, end: 1.0, recover: 1.3, lunge: 4, dmg: 1.2, far: true, hyper: true, kind: 'lunge' },
  /* combat2 (combat, web/src/combat2.js): the answers to a hero who only presses attack. counter: no punish window after it */
  xStomp: { clip: 'NinjaJump_Land', hits: [0.16], tell: 0.65, post: 0.8, end: 0.9, recover: 0.6, lunge: 0, dmg: 1, unblockable: true, hyper: true, quake: true, ring: 1, near: true, blunt: true, push: 4.6, kind: 'stomp', counter: true },
  xNova: { clip: 'Spell_Simple_Shoot', hits: [0.1], tell: 0.65, post: 1.0, end: 0.46, recover: 0.5, lunge: 0, dmg: 1, unblockable: true, hyper: true, ring: 1, blunt: true, push: 4.2, kind: 'stomp', counter: true },
  xRiposte: { clip: 'Sword_Regular_A', hits: [0.25], tell: 0.62, post: 1.1, end: 0.42, rec: 'Sword_Regular_A_Rec', recover: 0.9, lunge: 1.2, dmg: 1.3, guardBreak: 2, hyper: true, kind: 'slash' },
};

/* the family of a boss def (fight.js def.id is the mechanic: giant, lich, twin; def.nemesis the world id) */
export function family(def) {
  if (def.id === 'giant') return 'giant';
  if (def.id === 'lich') return def.nemesis === 'tower' ? 'tower' : 'lich';
  return 'duel';
}
/* how far a blow reaches past the keep-out (metres): the giants' maul, sledge and oak land about 1.5 m past their keep */
const ARM = { giant: 1.6, tower: 1.3, lich: 1.2, duel: 1.15 };

/* the moves of each family by stage (0 fresh, 1 under 60 %, 2 under 30 %): the later stages add a move */
const SETS = {
  giant: [['gSlam', 'gSweep', 'gStomp'], ['gSlam', 'gSweep', 'gStomp', 'gFury'], ['gSlam', 'gFury', 'gStomp', 'gSweep']],
  tower: [['cSweep', 'cStomp', 'cLunge'], ['cSweep', 'cStomp', 'cLunge'], ['cSweep', 'cStomp', 'cLunge']],
  lich: [['cSweep', 'dBreak'], ['cSweep', 'dBreak'], ['cSweep', 'dBreak', 'dCombo']],
  duel: [['dSlash', 'dBreak', 'dSlash'], ['dSlash', 'dBreak', 'dCombo'], ['dCombo', 'dBreak', 'dSlash', 'dCombo']],
};
/* the pause between blows (seconds after the recovery) and the wind-up scale, by stage: faster as it weakens */
const TEMPO = {
  giant: [{ gap: [2.4, 3.2], tell: 1 }, { gap: [1.7, 2.3], tell: 0.92 }, { gap: [0.8, 1.3], tell: 0.85 }],
  tower: [{ gap: [1.8, 2.6], tell: 1 }, { gap: [1.3, 2.0], tell: 0.92 }, { gap: [0.9, 1.4], tell: 0.85 }],
  lich: [{ gap: [1.6, 2.3], tell: 1 }, { gap: [1.2, 1.8], tell: 0.92 }, { gap: [0.8, 1.3], tell: 0.85 }],
  duel: [{ gap: [0.9, 1.5], tell: 1 }, { gap: [0.7, 1.2], tell: 0.92 }, { gap: [0.5, 0.9], tell: 0.85 }],
};

/* ---------- one set of numbers per boss ---------- */
export function bossGeom(F, f) {
  const fam = f.fam || (f.fam = family(f.def));
  const keep = F.holdOff(f);
  const arm = ARM[fam] * (fam === 'duel' ? Math.max(1, Math.sqrt(f.scale)) : 1);
  return { fam, keep, arm, hit: keep + arm, engage: keep + arm * 0.5 };
}
/* at spawn: a boss whose blow can never reach a hero who stands at its keep-out is a bug. Warn, and fix the numbers. */
export function checkGeom(F, f) {
  const g = bossGeom(F, f);
  const bad = !(g.engage > g.keep + 0.1) || !(g.hit > g.engage + 0.3);
  if (bad) console.warn(`[boss] ${f.def.label}: can never reach the player (keep ${g.keep.toFixed(2)}, engage ${g.engage.toFixed(2)}, hit ${g.hit.toFixed(2)})`);
  f.geoChecked = true;
  /* balance: a giant's blow does at most 1.3 damage. Set here (web side, no server restart). */
  if (g.fam === 'giant') f.damage = Math.min(f.damage, 1.3);
  if (g.fam === 'lich') { f.damage = Math.min(f.damage, 1.3); const k = 0.65; f.hp = Math.round(f.hp * k); f.maxHp = Math.round(f.maxHp * k); }
  return !bad;
}

/* ---------- phases: 60 % and 30 % ---------- */
export const PHASE_AT = [0.6, 0.3];
/* each line says what changed in the fight, plainly. one short sentence: the change itself */
const LINES = {
  giant: ['It swings faster now.', 'It swings wild.'],
  baron: ['He swings twice now.', 'He swings harder.'],
  stormgiant: ['The giant swings faster.', 'It swings wild.'],
  lich: ['It raises the dead.', 'Bolts in every direction.'],
  tower: ['It sends its drones.', 'It hits harder now.'],
  twin: ['It strikes three times.', 'Every blow comes fast.'],
  lord: ['He strikes three times.', 'Every blow comes fast.'],
  duel: ['He strikes three times.', 'Every blow comes fast.'],
};
export function phaseLine(f, stage) {
  const id = f.def.nemesis || f.def.id; const fam = f.fam || family(f.def);
  const L = LINES[id] || (fam === 'duel' ? null : LINES[fam]);
  if (L) return L[stage - 1];
  const who = f.def.label || 'The enemy'; const p = f.def.pronoun === 'he' ? 'He' : 'It';
  void who; return stage === 1 ? `${p} strikes three times.` : 'Every blow comes fast.';
}

/* ---------- the brain: called from fight.js updateFoe for a boss in its free states (not attacking, not staggered).
   h = { to, dist, face, moveTo, idleClip }. Returns true when it has decided this frame. */
export function bossBrain(F, f, dt, h) {
  const g = bossGeom(F, f); const { fam } = g; const { to, dist, face, moveTo } = h;
  if (!f.geoChecked) checkGeom(F, f);
  /* the hit test in fight.js is dist <= f.reach + 0.75: the reach is the geometry's, every frame (keep-out may change) */
  f.reach = g.hit - 0.75;
  const stage = f.stage || 0; const T = TEMPO[fam][stage];
  /* a pause after each blow: it stands its ground and menaces, the hero may come in and punish */
  if (f.lastWas !== 'idle') { if (f.lastWas === 'attack') f.waitUntil = F.clock + rand(...T.gap) * (f.gapK || 1); /* combat2: gapK < 1 = it comes again sooner */ f.lastWas = 'idle'; }
  const ready = f.cd <= 0 && F.clock >= (f.waitUntil || 0) && !F.over;
  const go = (key) => { key = f.forceKey || key; /* test hook: ask for one move */ F.startAttack(f, key, { tellK: T.tell }); f.lastKey = key; f.lastWas = 'attack'; return true; };
  const pickFrom = (list) => { const opts = list.filter((k) => k !== f.lastKey || list.length < 2); return opts[Math.floor(Math.random() * opts.length)]; };
  const set = SETS[fam][stage];
  face();

  if (fam === 'giant') {
    /* far (the hero backs off or runs): it charges; it never stands off */
    if (ready && dist > g.engage + 3.5 && dist < 16 && F.clock >= (f.chargeAt || 0)) { f.chargeAt = F.clock + 7; return go('gCharge'); }
    if (dist > g.engage) { moveTo(F.pos, f.speed); return true; }
    if (ready) {
      /* a hero pressed against its legs gets the stomp; otherwise the set in turn, never the same blow twice */
      if (dist < g.keep + 0.45 && f.lastKey !== 'gStomp' && Math.random() < 0.6) return go('gStomp');
      return go(pickFrom(set));
    }
    hold(F, f, dt, h, g); return true;
  }
  if (fam === 'tower' || fam === 'lich') {
    /* the existing blink (a lich steps away through embers when the hero is on it) stays in fight.js; bolts from range */
    const volley = stage >= 2 && Math.random() < 0.5;
    /* the Tower is a body that comes for the hero: it lunges from mid range and bolts only now and then; the lich keeps
       its distance and casts */
    if (ready && fam === 'tower' && dist > g.engage + 0.8 && dist < g.engage + 6) return go(Math.random() < 0.7 ? 'cLunge' : volley ? 'cVolley' : 'cBolt');
    if (ready && dist > g.engage + 1.5 && dist < 15 && (fam === 'lich' || dist >= g.engage + 6)) return go(volley ? 'cVolley' : 'cBolt');
    if (dist > g.engage) { if (fam === 'tower' || dist > 9) moveTo(F.pos, f.speed * (fam === 'tower' ? 1 : 0.8)); else hold(F, f, dt, h, g); return true; }
    if (ready) return go(pickFrom(set));
    hold(F, f, dt, h, g); return true;
  }
  /* duelists: two stances in turn. 'press' walks in and strikes; 'guard' holds the blade up a step outside the reach,
     turns aside, and answers a swing (fight.js reactToSwing blocks, the block ends in a riposte). The Sage2 tactic
     'guard' makes the guard stance longer, 'charge' shorter: the director still shapes the fight. */
  f.stanceT = (f.stanceT ?? 0) - dt;
  if (f.stanceT <= 0) {
    const long = f.group?.tactic === 'guard' ? 1.4 : f.group?.tactic === 'charge' ? 0.7 : 1;
    f.stance = f.stance === 'guard' || stage >= 2 ? 'press' : 'guard'; f.stanceT = f.stance === 'guard' ? rand(1.6, 2.6) * long : rand(3.0, 4.5);
    f.actor.eyes(f.stance === 'guard' ? 5 : 12, f.eye);
  }
  if (f.stance === 'guard') {
    const want = g.engage + 0.9;
    if (dist > want + 1.2) moveTo(F.pos, f.speed * 0.6);
    else if (dist < want - 0.6) { moveTo(f.pos.clone().addScaledVector(to, -1.5), f.speed * 0.5, 'Walk_Loop'); f.actor.setSpeed(-1); }
    else { f.circle = f.circle || (Math.random() < 0.5 ? 1 : -1); const side = f.pos.clone().addScaledVector(to, 0.2); side.x += to.z * f.circle * 1.5; side.z -= to.x * f.circle * 1.5; moveTo(side, f.speed * 0.32, f.def.blocks ? 'Idle_Shield_Loop' : 'Walk_Loop'); if (!f.def.blocks) f.actor.play('Sword_Block', { fade: 0.25 }); }
    /* out of the guard with a lunge when the hero stands off */
    if (ready && dist > g.engage + 0.6 && dist < g.engage + 5) { f.stanceT = 0; return go('dLunge'); }
    return true;
  }
  if (ready && dist > g.engage + 0.8 && dist < g.engage + 5.5) return go('dLunge');
  if (dist > g.engage) { moveTo(F.pos, f.speed); return true; }
  if (ready) {
    if (stage >= 2 && Math.random() < 0.3) { F.startAttack(f, 'slashA', { fake: true }); f.lastWas = 'feint'; f.waitUntil = 0; return true; } /* a feint: fight.js turns it into the 'feint' phase 2 back-step */
    const k = pickFrom(set); return go(k === 'dBreak' && f.def.blocks ? 'dBash' : k);
  }
  hold(F, f, dt, h, g); return true;
}

/* between blows: it holds just outside the keep, weight shifting, a slow step to the side (never a frozen statue) */
function hold(F, f, dt, h, g) {
  const { to, dist, moveTo, idleClip } = h;
  f.holdT = (f.holdT || 0) + dt;
  if (dist < g.keep + 0.15 || g.fam === 'giant') { f.actor.play(g.fam === 'giant' ? 'Sword_Idle' : idleClip, { fade: 0.25 }); return; }
  f.circle = f.circle || (Math.random() < 0.5 ? 1 : -1); if (Math.random() < dt * 0.25) f.circle = -f.circle;
  const side = f.pos.clone(); side.x += to.z * f.circle * 1.2; side.z -= to.x * f.circle * 1.2;
  if (dist < g.engage) moveTo(side, f.speed * 0.25, 'Walk_Loop'); else f.actor.play(idleClip, { fade: 0.25 });
}

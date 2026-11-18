/* Combat: the boss is not a spam target. Pressing attack alone must not win the fight.

   The loop now: the boss is ARMOURED by default (hits do little, never interrupt it) and OPEN after a blow the hero
   avoided (dodge, block, parry, or a step out of reach): the punish window. Read the tell, avoid, then strike.
     armoured  damage x0.25 (giant, lich, Tower) or x0.35 (duelists) (a shot x0.45, an aimed head shot x0.9), poise x0.35, a "tink" (sfx deflect), the bar says ARMOURED
     open      damage x1.8 (a bow shot x1.8 more, a gun shot x2.8 more), poise x1.6, a gold rim, the bar glows gold, OPEN!, a chime
     staggered (poise broken while not mid-blow): the old x2 crit for 1.1-1.6 s, then 4.5 s of steady (poise x0.3): no lock
   A blow that lands on the hero gives no window (it recovers in 0.45 s, armoured). A parried boss still staggers.
   Every boss blow has hyper-armour: hits do damage but never cancel it. A poise break during a blow waits for its end.
   Spam counter: 6 armoured hits in a row (5 late in the fight, 7 shots; at most one per 8 s) and the boss answers with a
   clear tell: giant STOMP ring, lich NOVA ring then a blink, a duelist READS YOU (it guards: the next light blow is
   parried and answered by a riposte; a heavy or a kick breaks that guard and opens it for 1 s). Against a gun or a bow:
   a charge, a lunge or a volley. An avoided ring counter (stomp, nova) gives no window; another avoided counter 0.9 s.
   The first counter says "TOO GREEDY" with its real answer (block or dodge). An aimed head shot counts half a streak.
   Any duelist that blocks parries the third light blow on its guard (lesson "IT PARRIES"); a heavy or a kick on a plain
   guard drops it, no window. A read guards against the blow the hero repeated (light or heavy): that blow is parried
   after 0.4 s, the other blow (or a kick) breaks the guard and opens it for 1 s. Duelist poise 34. A boss guard lasts 0.3 s
   longer than before and ends in a beat, not a swing. Any counter the hero avoids (not a ring) gives 0.9 s.
   A gun: a window hands one round back; health x0.85 more.
   A kick wears poise like an armoured hit (no flat 3).
   Health x1.3 (giant, Tower), x1.05 (duelists), x2.1 (lich); with a gun or a bow x0.6 (giant), x0.75 (duelist), x0.7 (Tower),
   x1 (lich). A boss blow hurts at most x0.8 of the old. Tempo (TUNE.gapK): giant as before, lich x0.8, Tower x0.9,
   duelists x1.1.
   Phases at 66 % and 33 % (a quest shape may set its own; under 33 % hp counts as late anyway): giant and duelists call
   2 adds at the first (never in a no-adds fight), the giant's slams send a second ring at the last ("It strikes twice
   now."; that ring hurts but never takes the window away), the duelist and the counters need one hit less.
   Rings: a dodge for that ring (started at most 0.3 s before the ring shows, at most 0.75 s ago) or live i-frames clear it.
   Roll fatigue: 3 rolls in 2.5 s (a roll that cleared a ring does not count), or 2 panic rolls (no blow coming) in 5 s:
   the next avoided blow earns no window.
   Crit (Defiance, the vow) doubles open hits only. Hope's regen is x0.4 in a boss fight. Window 1.55 s.
   Timers (adds, aftershock) run on the fight clock, so a pause holds them.
   Phone (body.touch): every boss wind-up is 15 % longer; the riposte wind-up is x1.2 and the parry reel 0.25 s for all.
   Teach (not with &hints=0): the first tell of the visit slows the fight for a beat with "DODGE!" or "BLOCK!"; the word
   comes back (no slow) after two hits in a row, at most once in 20 s. The first window says "NOW STRIKE!", the first
   armoured streak "ARMOURED / Wait for an opening". While a lesson shows, the banner and the hint chips step back; the
   intro banner also steps back for every tell. The bar tag: ARMOURED, BLOCK or DODGE (red), OPEN! (gold), STAGGERED,
   GUARDING (blue).
   The dragon (web/src/dragon.js) keeps its own open head (a missed or blocked bite), stun and air passes; here a melee
   hit on closed plates does x0.75 and wears poise at 40 %, an open hit x1.5 (also for 1.6 s after it lands), a shot is not cut; a streak of 6 (one per 8 s)
   brings the tail sweep, the bite in front, or the breath at range; its blows hurt x0.75; its fire burns once in 1.2 s.
   Numbers live in TUNE.
   Hooks in fight.js are marked "combat2". */
import { sfx } from './sfx.js';
import { family } from './boss-moves.js';

export const on = (F) => !F?.c2off;
export const PHASE_AT = [0.66, 0.33];

export const TUNE = {
  hpK: { giant: 1.3, lich: 2.1, tower: 1.3, duel: 1.05 },
  poise: { giant: 34, lich: 24, tower: 26, duel: 34 }, hurt: { giant: 0.8, lich: 0.8, tower: 0.8, duel: 0.8 }, /* poise floor; the most a blow hurts (x the move's dmg) */
  armour: 0.35, armourFam: { giant: 0.25, lich: 0.25, tower: 0.25, duel: 0.35 }, armourShot: 0.45, armourHead: 0.9, open: 1.8, openShot: 1.8, openGun: 3.4, /* a shot in the window: x1.8 x1.8, a gun x1.8 x2.8 (a bow or a gun has fewer blows in a window) */ openPoise: 1.6, guardPoise: 0.35,
  window: 1.55, hitRecover: 0.45, steady: 4.5, rangedHp: { giant: 0.6, lich: 1.0, tower: 0.48, duel: 0.75 }, counterOpen: 0.9, kick: 3,
  streak: 6, streakLate: 5, streakShot: 7, streakGap: 1.5, counterCd: 8,
  gapK: { giant: 1.0, lich: 0.8, tower: 0.9, duel: 1.1 }, phoneTell: 1.15,
  dragonGun: 3.6, dragonArmour: 0.75, dragonOpen: 1.5, dragonStreak: 6, dragonHurt: 0.75,
};
const GOLD = 0xffd36a;
const phone = () => typeof document !== 'undefined' && document.body.classList.contains('touch');
const quiet = () => typeof document !== 'undefined' && document.body.classList.contains('nohints');

/* ---------- the boss joins the fight ---------- */
export function bossReady(F) {
  const f = F.bossFoe; F.c2stats = { punish: 0, armoured: 0, open: 0, counters: 0 }; T.again = -99; T.reteach = false;
  if (F.boss) { F.boss.c2 = { streak: 0, last: -9, armoured: false };
    /* an armoured hit wears its poise at 40 %: a hero who only hacks at plates rarely staggers it */
    if (!F.boss.c2wrap) { const B = F.boss; const dmgFn = B.damage.bind(B); B.c2wrap = true; B.damage = (id, d, dir, o) => { const p0 = B.poise; const r = dmgFn(id, d, dir, o); if (r && !r.staggered && B.c2?.armoured && B.poise < p0) B.poise = p0 - (p0 - B.poise) * 0.4; return r; }; }
    const pl = F.boss.player; if (pl?.hit && !pl.c2) { const hit = pl.hit; pl.c2 = true; pl.hit = (o) => { if ((o.kind === 'fire' || o.kind === 'strafe' || o.kind === 'burn') && (F.clock - (pl.c2fire ?? -9) < 1.2 || F.clock - (F.c2dodgeAt ?? -9) < 0.8)) return 'dodged'; if (o.kind === 'fire' || o.kind === 'burn') { chip('GET OUT!', 'red', 1000); document.body.classList.add('c2-fire'); clearTimeout(F.c2fireT); F.c2fireT = setTimeout(() => document.body.classList.remove('c2-fire'), 1000); } /* a dodge carries the hero through the flames */ if (o.kind === 'fire' || o.kind === 'strafe' || o.kind === 'burn') pl.c2fire = F.clock; return hit({ ...o, dmg: Math.max(1, Math.round((o.dmg || 2) * TUNE.dragonHurt)) }); }; } /* fire burns once in 1.2 s, not on every tick */ /* its blows hurt a little less: the closed plates now cost the hero time */ F.c2dragon = (part, k) => dragonHit(F, F.boss, part, 1, { shot: true, aim: k }); ui(F); return; }
  if (!f || f.c2) return;
  const fam = f.fam || (f.fam = family(f.def));
  const k = (TUNE.hpK[fam] || 1.2) * (F.rg ? (TUNE.rangedHp[fam] || 0.7) * (F.rg.P?.kind === 'gun' ? 0.85 : 1) : 1); /* a gun or a bow lands fewer blows in a window */ const frac = f.hp / f.maxHp; f.maxHp = Math.round(f.maxHp * k); f.hp = Math.round(f.maxHp * frac);
  f.c2 = { fam, streak: 0, last: -9, openUntil: 0, hitHero: false, pending: false, counterAt: -99, reading: false, late: false, aftershock: false, ringsSeen: new WeakSet() };
  f.gapK = TUNE.gapK[fam] || 0.85;
  f.maxPoise = Math.max(f.maxPoise, TUNE.poise[fam] || 24); f.poise = f.maxPoise;
  f.damage = Math.min(f.damage, TUNE.hurt[fam] || 1.1); f.c2.hurt = f.damage; /* boss-moves checkGeom caps again on its first think: never above this */
  ui(F);
}

/* ---------- a boss blow starts: phone tells are longer; the first tell of the visit is taught ---------- */
export function attackStart(F, f, key, def, opt) {
  if (!f.c2) return opt;
  f.c2.hitHero = false; f.c2.pending = false; f.c2.openUntil = 0; f.c2.key = key;
  return phone() ? { ...opt, tellK: (opt.tellK || 1) * TUNE.phoneTell } : opt;
}
/* what became of a boss blow (a direct hit, its ring, its bolt) */
export function noteResult(F, f, res) {
  if (!f?.c2) return;
  if (res === 'hit') { f.c2.missed = (f.c2.missed || 0) + 1; if (f.c2.missed >= 2 && F.clock - T.again > 20) { T.again = F.clock; T.reteach = true; f.c2.missed = 0; } } else f.c2.missed = 0;
  if (res === 'hit') { f.c2.hitHero = true; if (f.state === 'recover' && F.clock < f.c2.openUntil) { f.c2.openUntil = 0; f.recoverFor = Math.min(f.recoverFor, f.t + 0.25); } }
}
/* the blow is over: an avoided blow opens the boss; a poise break held during the blow lands now */
export function attackEnd(F, f, def) {
  const c = f.c2; if (!c) return;
  if (c.pending) { c.pending = false; F.staggerFoe(f, null, null); f.steadyUntil = F.clock + TUNE.steady; return; }
  const ctr = def.counter || (c.counterArmed && c.counterKey === c.key); c.counterArmed = false;
  if (ctr) { if (c.hitHero || def.ring) { f.recoverFor = 0.5; return; } /* a ring counter (stomp, nova) just clears the space */ f.recoverFor = TUNE.counterOpen; c.openUntil = F.clock + f.recoverFor; c.streak = 0; sfx('cueNow'); return; } /* an answered counter opens a short window */
  if (c.hitHero) { f.recoverFor = TUNE.hitRecover; return; }
  if ((F.c2rolls || []).filter((t) => F.clock - t < 2.5).length >= 3 || (F.c2waste || []).filter((t) => F.clock - t < 5).length >= 2) { f.recoverFor = TUNE.hitRecover; F.bossNote?.('Rolling on and on: it sees it coming.', 1800); return; } /* panic rolls dodge a blow but earn no window */
  f.recoverFor = Math.max(def.recover || 0, TUNE.window); c.openUntil = F.clock + f.recoverFor;
  f.actor.eyes?.(1.5); sfx('cueNow'); c.streak = 0; if (F.rg?.P?.kind === 'gun' && F.rg.rounds < (F.rg.P.rounds ?? 1) && !F.rg.P.recharge) F.rg.rounds++; /* a window hands a gun one round back */
  F.c2stats && F.c2stats.open++;
  teach(F, 'strike');
}
export const isOpen = (F, f) => ['stagger', 'down', 'getup', 'frozen'].includes(f.state) || (f.state === 'recover' && F.clock < (f.c2?.openUntil || 0));

/* ---------- a hit on the boss (damageFoe, after the old crit and bossMul): armour, the window, the streak ---------- */
export function bossHit(F, f, dmg, poise, { heavy = false, shot = false, aim = 0, head = false, pierce = false } = {}) {
  const c = f.c2; if (!c) return { dmg, poise, sound: null };
  const open = pierce || isOpen(F, f); /* pierce: its own bolt sent back */ const rec = f.state === 'recover' && !(F.crit > 0) ? 1.5 : 1; /* damageFoe already gave a recovering foe x1.5 */
  if (open) {
    const k = (['stagger', 'down', 'getup', 'frozen'].includes(f.state) ? 1 : TUNE.open / rec) * (shot ? (F.rg?.P?.kind === 'gun' ? TUNE.openGun : TUNE.openShot) : 1);
    c.streak = 0; if (F.c2stats) F.c2stats.punish++;
    return { dmg: dmg * k, poise: poise * TUNE.openPoise / rec, sound: heavy ? 'clangBig' : null, open: true };
  }
  /* armoured: a little damage, little poise, and the streak that brings the counter */
  const aimed = shot && head && aim > 0.55;
  const k = (shot ? (aimed ? TUNE.armourHead : TUNE.armourShot) : TUNE.armourFam[c.fam] ?? TUNE.armour) * (heavy ? 1 : 1) /* a heavy gets no armour bonus */ / rec / (F.crit > 0 ? 2 : 1); /* a crit (Defiance, the vow) doubles open hits, not armoured ones */
  if (f.state !== 'taunt') { if (!(F.clock - c.last < TUNE.streakGap)) c.kinds = { light: 0, heavy: 0 }; (c.kinds ||= { light: 0, heavy: 0 })[heavy ? 'heavy' : 'light']++; c.streak = F.clock - c.last < TUNE.streakGap ? c.streak + (aimed ? 0.5 : 1) : 1; c.last = F.clock; c.shot = shot; } /* an aimed head shot counts half; nothing counts during the phase roar */
  if (F.c2stats) F.c2stats.armoured++;
  if (c.streak >= 3 && T.said.has('strike')) teach(F, 'armour');
  return { dmg: dmg * k, poise: poise * TUNE.guardPoise / rec, sound: 'deflect', armoured: true };
}
/* after the damage: stagger only through the poise bar and never mid-blow; no flinch from armoured hits */
export function afterBossHit(F, f, dir) {
  const c = f.c2; if (!c || f.state === 'dead') return;
  if (f.state === 'attack') { if (f.poise <= 0) { c.pending = true; f.poise = 0; } return; }
  if (f.poise <= 0 && !['stagger', 'down', 'getup', 'frozen'].includes(f.state)) { F.staggerFoe(f, dir, null); f.steadyUntil = F.clock + TUNE.steady; c.openUntil = 0; }
}

/* ---------- the brain, before boss-moves.js: the counter to a streak ---------- */
export function brain(F, f, dt, { dist }) {
  const c = f.c2; if (!c || F.over) return false;
  if (F.clock - c.last > TUNE.streakGap) c.streak = 0;
  if (c.reading && f.state !== 'block') c.reading = false; /* the read ends with its guard */
  if (!c.late && f.hp < f.maxHp * (F.phaseAt?.[1] ?? PHASE_AT[1])) { c.late = true; if (c.fam === 'giant') { c.aftershock = true; F.bossNote?.('It strikes twice now.', 2400); } }
  const need = c.shot ? TUNE.streakShot : c.late ? TUNE.streakLate : TUNE.streak;
  if (c.streak < need || f.cd > 0.6 || F.clock - c.counterAt < TUNE.counterCd) return false;
  c.streak = 0; c.counterAt = F.clock; if (F.c2stats) F.c2stats.counters++; const read = c.fam === 'duel' && !c.shot && dist <= 4.5; /* a duelist's read teaches its own line */
  const fam = c.fam; const ranged = c.shot;
  const go = (key) => { F.startAttack(f, key, { tellK: 1 }); f.lastKey = key; f.lastWas = 'attack'; c.counterArmed = true; c.counterKey = key; const d = f.atk?.def; if (!read) teach(F, 'counter', d && !d.unblockable && (d.guardBreak || 0) < 3 ? 'block' : 'dodge'); return true; }; /* the lesson names the real answer */
  if (fam === 'giant') { F.bossNote?.('It stamps you away.', 2200); return go(ranged && dist > 9 ? 'gCharge' : 'xStomp'); }
  if (fam === 'lich' || fam === 'tower') { F.bossNote?.(ranged && dist > 6 ? 'It answers with bolts.' : 'It throws you back.', 2200); f.blinkCd = 0; return go(ranged && dist > 6 ? 'cVolley' : 'xNova'); }
  /* a duelist reads a hero who repeats one blow: it guards, the next light blow is parried and answered */
  if (ranged || dist > 4.5) { F.bossNote?.('He closes in.', 2000); return go('dLunge'); }
  c.reading = true; c.readKind = (c.kinds?.heavy || 0) > (c.kinds?.light || 0) ? 'heavy' : 'light'; teach(F, 'read'); f.state = 'block'; f.t = 0; f.blockFor = 1.8; f.blockHits = 0; f.actor.play('Sword_Block', { loop: false, fade: 0.08, speed: 1.2 });
  f.actor.eyes?.(16); sfx('deflect'); F.bossNote?.(c.readKind === 'heavy' ? (f.def.pronoun === 'he' ? 'He reads your heavy. Strike light.' : 'It reads your heavy. Strike light.') : (f.def.pronoun === 'he' ? 'He reads you. Hold attack to break his guard.' : 'It reads you. Hold attack to break its guard.'), 2600);
  return true;
}
/* a light blow on a duelist who reads the hero: parried, the hero reels, the riposte comes */
export function parryHero(F, f, s, at, to) {
  const c = f.c2; if (!c.reading) teach(F, 'parry'); c.reading = false;
  F.clash?.(at, to.clone().negate(), 0xfff0c0, 26, 9); sfx('parry'); F.shake = Math.max(F.shake, 0.6); F.world.flash?.(0.15);
  s.bounced = true; s.bounceT = s.t; s.bounceK = s.t / s.dur; F.hitstop = 0.08; F.vmPunch?.set(0.08, 0.05, 0.12);
  F.swing = null; F.chain = 0; F.stagger = Math.max(F.stagger, 0.25);
  f.state = 'idle'; f.cd = 0; F.startAttack(f, 'xRiposte', { tellK: 1.2 }); c.counterArmed = true; c.counterKey = 'xRiposte'; /* time to recover from the reel and block */ f.lastKey = 'xRiposte'; f.lastWas = 'attack';
}

/* a blade on a combat2 boss's guard: 'parry' (the read blow, or a third light blow on a plain guard), 'break' (the other blow on a read), or null (the old bounce) */
export function guardHit(F, f, s) {
  const c = f.c2; const kind = s.heavy ? 'heavy' : 'light';
  if (c.reading) { if (f.t <= 0.4) return null; return kind === c.readKind ? 'parry' : 'break'; }
  if (s.breaksGuard) return 'break';
  return f.blockHits >= 2 ? 'parry' : null;
}
/* a heavy or a kick on a combat2 boss's guard: a short opening, then steady (no free stagger on a timer) */
export function guardBroken(F, f) {
  const c = f.c2; const read = c.reading; c.reading = false; f.blockHits = 0; f.steadyUntil = F.clock + TUNE.steady;
  if (read) { c.streak = 0; f.state = 'recover'; f.t = 0; f.recoverFor = 1.0; c.openUntil = F.clock + 1.0; sfx('clangBig'); F.bossNote?.('Guard broken. Strike!', 1400); return; } /* the answer to "reads you": a short opening */
  f.state = 'idle'; f.t = 0; f.cd = Math.min(f.cd || 0, 0.25); sfx('deflect'); /* a plain guard just drops: no window for a heavy on a timer (the blow itself counts in the streak) */
}
/* a kick on a combat2 boss: poise like any armoured blow */
export const kickPoise = (F, f) => TUNE.kick * (isOpen(F, f) ? TUNE.openPoise : TUNE.guardPoise) * (F.clock < (f.steadyUntil || 0) ? 0.3 : 1);
/* ---------- phases ---------- */
export function onPhase(F, f, stage) {
  const c = f.c2; if (!c) return;
  if (stage >= 1 && !c.addsCalled && (c.fam === 'giant' || c.fam === 'duel') && !F.noAdds && !f.def.summons) { c.addsCalled = true; c.addsAt = F.clock + 0.9; } /* on the fight clock: a pause holds it */
  if (stage >= 2 && !c.late) { c.late = true; if (c.fam === 'giant') { c.aftershock = true; F.bossNote?.('It strikes twice now.', 2400); } }
}

/* ---------- the dragon: its closed parts are armoured; a streak on them brings the tail ---------- */
export function dragonHit(F, B, part, dmg, { shot = false, aim = 0 } = {}) {
  if (!B?.c2) return dmg;
  const open = (part?.part === 'head' && part.open) || ['stun', 'stagger'].includes(B.act?.kind) || F.clock < (B.c2.openUntil || 0);
  B.c2.armoured = !open;
  const gunK = shot && F.rg?.P?.kind === 'gun' ? TUNE.dragonGun : 1; /* pistol buff: a gun lands few shots on a dragon */
  if (open) { B.c2.streak = 0; if (F.c2stats) F.c2stats.punish++; return dmg * TUNE.dragonOpen * gunK; }
  const c = B.c2; c.streak = F.clock - c.last < TUNE.streakGap ? c.streak + 1 : 1; c.last = F.clock;
  if (F.c2stats) F.c2stats.armoured++;
  if (c.streak >= TUNE.dragonStreak && F.clock - (c.counterAt ?? -99) >= TUNE.counterCd && B.state === 'ground' && !B.forced && B.act?.kind !== 'sweep') { c.streak = 0; c.counterAt = F.clock; const far = Math.hypot(F.pos.x - B.J.x, F.pos.z - B.J.z) > 8; const lz = (F.pos.x - B.J.x) * Math.sin(B.yaw) + (F.pos.z - B.J.z) * Math.cos(B.yaw); B.force?.(shot && far ? 'fire' : lz > 1.0 ? 'bite' : 'sweep'); teach(F, 'counter', shot && far ? 'dodge' : lz > 1.0 ? 'block' : 'dodge'); if (F.c2stats) F.c2stats.counters++; F.bossNote?.(shot && far ? 'It breathes at you.' : lz > 1.0 ? 'It snaps at you.' : 'Its tail comes round.', 2200); } /* from range: the breath; in front: the bite */
  if (c.streak >= 3 && T.said.has('strike')) teach(F, 'armour');
  sfx('deflect');
  return dmg * (shot ? gunK * (aim > 0.55 && part?.part === 'head' ? 1.15 : 1) : TUNE.dragonArmour / (F.crit > 0 ? 2 : 1)); /* a crit doubles open hits only */ /* a shot on the plates is not cut (it flies: a bow or a gun has few chances); a melee blow is */
}

export const ringDodged = (F, r) => { const ok = F.invuln > 0 || (F.clock - (F.c2dodgeAt ?? -9) < 0.75 && (F.c2dodgeAt ?? -9) > (r?.c2t ?? F.clock) - 0.3); if (ok && F.c2rolls) F.c2rolls = F.c2rolls.filter((t) => t !== F.c2dodgeAt); return ok; }; /* a dodge for THIS ring (from 0.3 s before it shows), not a dodge on a timer; an answered roll is not a panic roll */
/* ---------- every frame (updateBoss) ---------- */
export function update(F, dt) {
  if (F.dodge && !F.c2dodging) { F.c2dodgeAt = F.clock; (F.c2rolls ||= []).push(F.clock); if (F.c2rolls.length > 6) F.c2rolls.shift(); const cue = F.incoming?.(); if (!cue || cue.t > 1.0) { (F.c2waste ||= []).push(F.clock); if (F.c2waste.length > 4) F.c2waste.shift(); } } /* a roll with no blow coming is a panic roll */ F.c2dodging = !!F.dodge;
  const f = F.bossFoe; const c = f?.c2;
  for (const r of F.rings) if (r.c2t == null) r.c2t = F.clock - 0.02;
  const B = F.boss; if (B?.c2) { if (B.c2.wasAir && B.state === 'ground') { B.c2.openUntil = F.clock + 1.6; sfx('cueNow'); } B.c2.wasAir = B.state !== 'ground'; } /* the dragon lands heavily: a short opening */
  if (c && c.aftershock) for (const r of F.rings) { if (r.srcFoe === f && !r.c2after && !c.ringsSeen.has(r)) { c.ringsSeen.add(r); (c.queue ||= []).push({ at: F.clock + 0.48, o: r.origin.clone() }); } }
  if (c && c.addsAt && F.clock >= c.addsAt) { c.addsAt = 0; if (!F.over && f.state !== 'dead') { F.summon(f); F.bossNote?.(f.def.pronoun === 'he' ? 'He calls for help.' : 'It calls for help.', 2400); } }
  if (c && c.queue?.length) c.queue = c.queue.filter((q) => { if (F.clock < q.at) return true; if (F.over || f.state === 'dead') return false; const n = F.rings.length; F.shockwave(q.o, 1, 'shockwave'); const r2 = F.rings.length > n ? F.rings[F.rings.length - 1] : null; if (r2) { r2.srcFoe = f; r2.c2after = true; } return false; });
  /* the first tell of the visit: a beat of slow motion and the word */
  if ((!T.slowed || (T.reteach && !document.body.classList.contains('c2-saying'))) && !quiet() && !F.over && (f || F.boss)) { const cue = F.incoming?.(); if (cue && cue.t < 0.55 && cue.t > 0.2 && (cue.foe === f || (!cue.foe && F.boss))) { if (!T.slowed) { F.slow = Math.max(F.slow, 0.55); F.slowK = 0.4; } T.slowed = true; T.reteach = false; say(cue.kind === 'dodge' ? 'DODGE!' : 'BLOCK!', 1300); } } /* again after two hits in a row (at most once in 20 s) */
  if (typeof document !== 'undefined') { const busy = !!F.bossEl && /c2-(tell|open)/.test(F.bossEl.className); if (busy !== !!F.c2busy) { F.c2busy = busy; document.body.classList.toggle('c2-busy', busy); } const tell = !!F.bossEl?.classList.contains('c2-tell'); if (tell && !F.c2telling && sayIsLesson && document.body.classList.contains('c2-saying')) { clearTimeout(sayT); sayT = setTimeout(sayOff, 600); } /* a new tell cuts a long lesson short */ if (tell !== !!F.c2telling) { F.c2telling = tell; document.body.classList.toggle('c2-telling', tell); } } /* the intro card steps back for a tell */
  paint(F);
}

/* ---------- the bar: poise under the health, the state in words ---------- */
let style = false;
function addStyle() {
  if (style || typeof document === 'undefined') return; style = true;
  if (![...document.querySelectorAll('link')].some((l) => /Press\+Start\+2P/.test(l.href))) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap'; document.head.appendChild(l); }
  const s = document.createElement('style'); s.id = 'c2-style';
  s.textContent = `
  .boss-ui .c2-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .boss-ui .c2-row i.c2-poise { flex: 1; height: 4px; background: rgba(0,0,0,.6); border: 1px solid rgba(var(--cream-rgb,237,230,214),.22); overflow: hidden; display: block; }
  .boss-ui .c2-row i.c2-poise b { display: block; height: 100%; width: 100%; background: linear-gradient(#e9e4da, #a9a39a); transition: width .15s; }
  .boss-ui .c2-tag { font-family: 'Press Start 2P', var(--mono); font-size: 11px; line-height: 1; letter-spacing: .04em; padding: 5px 7px 4px; color: #d8d2c6; background: rgba(10,10,14,.82); box-shadow: 0 0 0 2px #1a1a20; min-width: 100px; text-align: center; text-shadow: none; opacity: 1; }
  .boss-ui.c2-open .c2-tag { color: #1a0204; background: #ffd23a; box-shadow: 0 0 0 2px #1a0408, 0 0 14px rgba(255,211,106,.85); }
  .boss-ui.c2-open > i { box-shadow: 0 0 0 1px #ffd36a, 0 0 16px rgba(255,211,106,.8); }
  .boss-ui.c2-open .c2-poise b { background: linear-gradient(#ffe27a, #ffb030); }
  .boss-ui.c2-stag .c2-tag { color: #1a0408; background: #fff4dc; }
  .boss-ui.c2-tell .c2-tag { color: #fff; background: #b8261c; box-shadow: 0 0 0 2px #1a0408, 0 0 12px rgba(255,60,40,.7); }
  #c2-say { position: fixed; left: 50%; top: 40%; transform: translate(-50%, -50%); font-family: 'Press Start 2P', var(--mono); font-size: clamp(18px, 2.6vw, 34px); line-height: 1.3; color: #ffe3c0; text-shadow: 3px 3px 0 #1a0408, 0 0 18px rgba(0,0,0,.7); letter-spacing: .04em; text-align: center; pointer-events: none; z-index: 7; opacity: 0; transition: opacity .18s; white-space: nowrap; }
  #c2-say.on { opacity: 1; animation: c2-pop .32s cubic-bezier(.2,1.6,.4,1) both; }
  #c2-say small { display: block; font-size: max(12px, .42em); margin-top: 10px; color: #f0e6d0; }
  #c2-chip { position: fixed; left: 50%; top: 57%; transform: translateX(-50%); font-family: 'Press Start 2P', var(--mono); font-size: 13px; padding: 6px 9px 5px; pointer-events: none; z-index: 7; opacity: 0; transition: opacity .12s; letter-spacing: .04em; }
  #c2-chip.on { opacity: 1; } #c2-chip.gold { color: #1a0204; background: #ffd23a; box-shadow: 0 0 0 2px #1a0408, 0 0 14px rgba(255,211,106,.8); } #c2-chip.red { color: #fff; background: #b8261c; box-shadow: 0 0 0 2px #1a0408; }
  body.touch #c2-chip { font-size: 11px; top: 60%; } body.cine #c2-chip, body.st-card #c2-chip, body.nohints #c2-chip.gold { opacity: 0 !important; }
  .boss-ui.c2-guard .c2-tag { color: #fff; background: #3a4a8a; }
  body.touch #c2-say { font-size: 17px; top: 27%; white-space: normal; width: 86vw; }
  body.touch .boss-ui .c2-tag { font-size: 11px; min-width: 92px; padding: 5px 6px 4px; }
  body.cine #c2-say, body.st-card #c2-say { opacity: 0 !important; }
  body.c2-saying #banner, body.c2-saying #hint, body.c2-saying #teach, body.c2-saying .boss-ui small, body.c2-telling #banner, body.c2-telling #hint, body.c2-telling #teach, body.c2-busy #banner, body.c2-fire #hint, body.c2-fire #teach { opacity: 0 !important; transition: opacity .1s; }
  @keyframes c2-pop { from { transform: translate(-50%, -50%) scale(.6); } to { transform: translate(-50%, -50%) scale(1); } }`;
  document.head.appendChild(s);
}
function ui(F) {
  addStyle(); const el = F.bossEl; if (!el || el.querySelector('.c2-row')) return;
  const row = document.createElement('div'); row.className = 'c2-row'; row.innerHTML = '<i class="c2-poise"><b></b></i><span class="c2-tag">ARMOURED</span>';
  const bar = el.querySelector(':scope > i'); if (bar) bar.after(row); else el.appendChild(row);
}
function paint(F) {
  const el = F.bossEl; if (!el) return; if (!el.querySelector('.c2-row')) ui(F);
  const f = F.bossFoe; const B = F.boss; let state = 'ARMOURED'; let cls = ''; let p = 1; let cue = null;
  if (f && f.c2) {
    p = Math.max(0, Math.min(1, f.poise / f.maxPoise));
    if (f.state === 'stagger' || f.state === 'down' || f.state === 'getup') { state = 'STAGGERED'; cls = 'c2-open c2-stag'; }
    else if (isOpen(F, f)) { state = 'OPEN!'; cls = 'c2-open'; }
    else if (((cue = F.incoming?.()) && cue.t < 1.2 && (cue.foe === f || !cue.foe)) || (f.state === 'attack' && f.atk && !f.atk.fake && (f.atk.hitIdx || 0) < f.atk.def.hits.length)) { const k = cue && cue.t < 1.2 && (cue.foe === f || !cue.foe) ? cue.kind : (f.atk.def.unblockable || (f.atk.def.guardBreak || 0) >= 3 ? 'dodge' : 'block'); state = k === 'dodge' ? 'DODGE' : 'BLOCK'; cls = 'c2-tell'; } /* every blow of a combo and every bolt, as the reticle shows */
    else if (f.state === 'block') { state = phone() ? 'GUARD: HOLD' : 'GUARDING'; cls = 'c2-guard'; }
    /* the gold rim holds through the window (a hit's white pulse overwrites it for a moment), and goes when it shuts */
    const lit = cls === 'c2-open' && f.state === 'recover';
    try { if (lit && F.clock - (f.c2.rimAt ?? -9) > 0.3) { f.c2.rimAt = F.clock; f.actor.flash?.(GOLD, Math.max(520, (f.c2.openUntil - F.clock) * 1000), 0.45); } else if (!lit && f.c2.rimAt != null) { f.c2.rimAt = null; f.actor.flash?.(0x000000, 520, 0); } } catch { /* a dress without flash */ }
  } else if (B && B.c2) {
    const open = ['stun', 'stagger'].includes(B.act?.kind) || B.headOpen || F.clock < (B.c2.openUntil || 0); p = Math.max(0, Math.min(1, (B.poise ?? 45) / 45));
    if (open) { state = 'OPEN!'; cls = 'c2-open'; } else { const cue = B.cue?.(); if (cue) { state = cue.kind === 'dodge' ? 'DODGE' : 'BLOCK'; cls = 'c2-tell'; } }
  } else return;
  if (el.c2cls !== cls) { el.classList.remove('c2-open', 'c2-stag', 'c2-tell', 'c2-guard'); for (const k of cls.split(' ')) if (k) el.classList.add(k); el.c2cls = cls; }
  const tag = el.querySelector('.c2-tag'); if (tag && tag.textContent !== state) tag.textContent = state;
  const openNow = cls.startsWith('c2-open') && !F.over; if (openNow !== !!F.c2chipOpen) { F.c2chipOpen = openNow; if (openNow) chip('STRIKE!', 'gold', 0); else chip('', 'gold', -1); } /* a gold STRIKE! under the reticle for every window */
  const b = el.querySelector('.c2-poise b'); if (b) { const w = `${Math.round(p * 100)}%`; if (b.style.width !== w) b.style.width = w; }
}

/* ---------- the lessons: three short lines, once each per visit ---------- */
const T = { slowed: false, said: new Set(), again: -99, reteach: false };
function teach(F, what, kind = 'dodge') {
  if (T.said.has(what) || quiet()) return; T.said.add(what);
  if (what === 'strike') say('NOW STRIKE!', 1500);
  else if (what === 'armour') say('ARMOURED', 2200, 'Wait for an opening');
  else if (what === 'counter') say('TOO GREEDY', 2200, kind === 'block' ? 'Block it, then strike' : 'Dodge it, then strike');
  else if (what === 'parry') say('IT PARRIES', 2400, phone() ? 'Hold attack on a guard' : 'Heavy (hold) or kick breaks a guard');
  else if (what === 'read') say('IT READS YOU', 2400, F.bossFoe?.c2?.readKind === 'heavy' ? (phone() ? 'Tap, do not hold' : 'Light blow or kick breaks it') : (phone() ? 'Hold attack to break its guard' : 'Heavy (hold) or kick breaks its guard'));
}
let chipT = null;
function chip(text, kind, ms) {
  if (typeof document === 'undefined') return; addStyle();
  let el = document.getElementById('c2-chip'); if (!el) { el = document.createElement('div'); el.id = 'c2-chip'; document.body.appendChild(el); }
  clearTimeout(chipT); if (ms < 0) { if (el.classList.contains(kind)) el.classList.remove('on'); return; }
  el.textContent = text; el.className = `${kind} on`; if (ms > 0) chipT = setTimeout(() => el.classList.remove('on'), ms);
}
let sayT = null; let sayIsLesson = false;
const sayOff = () => { document.getElementById('c2-say')?.classList.remove('on'); document.body.classList.remove('c2-saying'); };
export function say(text, ms = 1400, sub = '') {
  if (typeof document === 'undefined') return; addStyle();
  let el = document.getElementById('c2-say'); if (!el) { el = document.createElement('div'); el.id = 'c2-say'; document.body.appendChild(el); }
  sayIsLesson = !/^(DODGE|BLOCK)!$/.test(text); el.innerHTML = ''; el.appendChild(document.createTextNode(text)); if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); document.body.classList.add('c2-saying'); clearTimeout(sayT); sayT = setTimeout(sayOff, ms); /* the lesson owns the middle: banner and hint chip step back */
}

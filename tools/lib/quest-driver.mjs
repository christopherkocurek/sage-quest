/* The quest bot, used by tools/play.mjs.
   It walks chapter I (journey.js botTarget), strikes anchors, stands by beacons, keeps by the fire,
   chases a runner, and fights the nearest foe.
   installHeal(page, { power, full })  keeps the hero alive on every frame (full = maxHp, else a floor at half) and logs long walk frames.
   driveQuest(page, { ms, hook, onFrame })  runs the loop until the fight is over or ms pass.
     hook(i)        -> true when the caller handled this turn itself (the camp question, a cine shot)
     onFrame(d, i)  -> called about every 0.9 s (quest-bot saves a frame there)
   It returns { trail }. */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function installHeal(page, { power = null, full = true } = {}) {
  await page.evaluate((p, whole) => {
    const f = window.__sq.fight; if (p != null) f.power = p;
    if (window.__healOn) return; window.__healOn = true;
    /* long frames (> 50 ms) while the hero walks chapter I: when, and what the walk was doing */
    window.__long = []; let last = performance.now();
    const tick = (now) => {
      const d = now - last; last = now; const g = window.__sq.fight; const J = g?.journey;
      /* every frame, not only on each poll: a crowd could kill between two polls */
      if (g && !g.over) { if (whole) g.hp = g.maxHp; else if (g.hp < g.maxHp * 0.5) g.hp = g.maxHp * 0.5; }
      if (d > 50 && J) window.__long.push({ ms: Math.round(d), t: Math.round(J.t * 10) / 10, found: J.found, foes: g.foes.length });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, power, full);
}

/* runs in the page: one decision of the bot */
function decide() {
  const f = window.__sq.fight; if (!f) return { over: true };
  /* the bot moves the hero toward a spot at most 0.6 m per decision (about walking pace): a snap of metres read as a jump cut */
  const pull = (x, z, cap = 0.6) => { const dx = x - f.pos.x; const dz = z - f.pos.z; const d = Math.hypot(dx, dz); const k = d > cap ? cap / d : 1; f.pos.x += dx * k; f.pos.z += dz * k; };
  if (f.over) return { over: true };
  const state = `stage ${f.stage} wave ${f.wave}${f.task ? ' task' : ''}${f.twistId ? ` twist:${f.twistId}` : ''}${f.bossMul !== 1 ? ` x${f.bossMul.toFixed(2)}` : ''}${f.taken ? ' taken' : ''}${f.resolve ? ` gift:${f.resolve.id}` : ''}${f.boss || f.bossFoe ? ' boss' : ''}`;
  /* chapter I on the open land (journey.js botTarget): walk to the next stop and stand there, strike an anchor,
     fight what comes, keep at the heels of a runner */
  const J = f.journey;
  if (J && !f.paused) {
    const t = J.botTarget();
    if (t && t.runner) { const run = f.foes.find((x) => x === J.scout?.foe); if (run) { const dx = run.pos.x - f.pos.x; const dz = run.pos.z - f.pos.z; const dd = Math.hypot(dx, dz); if (dd > 2.4) pull(run.pos.x - (dx / dd) * 2.2, run.pos.z - (dz / dd) * 2.2, 1.1); } }
    if (t && !t.fight) {
      const dx = t.x - f.pos.x; const dz = t.z - f.pos.z; const dd = Math.hypot(dx, dz); f.yaw = Math.atan2(-dx, -dz); f.pitch = -0.04;
      const info = { journey: `${J.mode} ${J.found}/3 ${Math.round(dd)}m`, state: `${state} ${J.mode}`, pos: [Math.round(f.pos.x), Math.round(f.pos.z)], foot: f.footY.toFixed(2), pace: f.pace.toFixed(2) };
      if (t.hit && dd < t.r + 0.5) return { over: false, hitProp: true, ...info };
      return { over: false, walk: dd > t.r, ...info };
    }
  }
  if (J && f.paused) return { over: false, walk: false, idle: true, state: `${state} arrive` };
  /* the tasks that are not foes: go to an anchor or a beacon */
  const prop = (f.props || []).find((p) => !p.done && !p.journey && ((p.kind === 'anchor' && p.hp > 0) || (p.kind === 'beacon' && !p.lit)));
  /* a scout that runs: the bot keeps at its heels (the hero is fast enough; the bot taps keys too slowly) */
  const runner = !J && f.foes.find((x) => x.flee && x.state !== 'dead');
  if (runner && !prop && !f.paused) { const dx = runner.pos.x - f.pos.x; const dz = runner.pos.z - f.pos.z; const dd = Math.hypot(dx, dz); if (dd > 2.4) pull(runner.pos.x - (dx / dd) * 2.2, runner.pos.z - (dz / dd) * 2.2, 1.1); }
  /* the vigil: the bot keeps by the fire, so the fire holds */
  if (f.hearth && f.stage === 2 && !f.paused) { const hx = f.pos.x - f.hearth.pos.x; const hz = f.pos.z - f.hearth.pos.z; const hd = Math.hypot(hx, hz); if (hd > 4.5) pull(f.hearth.pos.x + (hx / hd) * 4, f.hearth.pos.z + (hz / hd) * 4); }
  /* a chapter goal that is a place (web/src/chapters.js: stand by the one the enemy chained again; stay in the
     carried light): the bot keeps to it and fights from there */
  if (f.chapterGoal && !f.paused && !f.deathCam) { const G = f.chapterGoal; const dx = f.pos.x - G.x; const dz = f.pos.z - G.z; const dd = Math.hypot(dx, dz); if (dd > G.r) pull(G.x + (dx / dd) * G.r * 0.6, G.z + (dz / dd) * G.r * 0.6, 0.7); }
  let propKind = null;
  if (prop && !f.paused) {
    propKind = prop.kind; const dx = prop.pos.x - f.pos.x; const dz = prop.pos.z - f.pos.z; const dist = Math.hypot(dx, dz);
    const keep = Math.max(prop.kind === 'beacon' ? 2 : 1.5, (f.propRad ? f.propRad(prop) : 0) + 0.2); /* a beacon may be a wide tower: stand by it, not in it */
    if (dist > keep + 0.2) pull(prop.pos.x - (dx / dist) * keep, prop.pos.z - (dz / dist) * keep);
    f.yaw = Math.atan2(-(prop.pos.x - f.pos.x), -(prop.pos.z - f.pos.z)); f.pitch = 0;
  }
  const dist = propKind ? null : f.aimNearest();
  /* a chapter goal that is held (the gate): the bot waits at it for the foes instead of running out to them */
  const dbg = f.debug(); const CG = f.chapterGoal;
  if (CG && CG.hold && !f.paused) { let nd = 1e9; let nf = null; for (const x of f.foes) { if (x.state === 'dead') continue; const d = Math.hypot(x.pos.x - f.pos.x, x.pos.z - f.pos.z); if (d < nd) { nd = d; nf = x; } } if (nf && Math.hypot(nf.pos.x - CG.x, nf.pos.z - CG.z) > CG.r + 5.0) dbg.nearHold = 99; }
  /* combat2 (combat): against a boss with armour (web/src/combat2.js) the bot answers the tell (dodge or block) and
     strikes in the window it opens; with no window for 8 s it strikes anyway */
  let tell = null; let c2 = null; const B = f.bossFoe;
  if (B && B.c2 && B.state !== 'dead' && !f.paused) {
    const c = f.incoming?.(); if (c && c.t < (c.kind === 'dodge' ? 0.3 : 0.24) && (c.foe === B || !c.foe)) tell = c.kind;
    const open = ['stagger', 'down', 'getup', 'frozen'].includes(B.state) || (B.state === 'recover' && f.clock < (B.c2.openUntil || 0));
    if (open) window.__c2open = f.clock; c2 = { open, stale: f.clock - (window.__c2open ?? f.clock - 99) > 8 && f.clock - (window.__c2open0 ??= f.clock) > 8 };
  }
  return { over: false, dist, propKind, state, tell, c2, lines: [...document.querySelectorAll('#banner b, #banner span, .task-ui span, .task-ui em')].map((e) => e.textContent).join(' | '), ...dbg };
}

export async function driveQuest(page, { ms = 150000, hook = null, onFrame = null } = {}) {
  const t0 = Date.now(); let i = 0; let lastFrame = 0; let last = ''; const trail = []; let wDown = false;
  const walk = async (on) => { if (on && !wDown) { await page.keyboard.down('KeyW'); wDown = true; } else if (!on && wDown) { await page.keyboard.up('KeyW'); wDown = false; } };
  const frame = async (d) => { if (onFrame && Date.now() - lastFrame > 900) { lastFrame = Date.now(); await onFrame(d, i); } };
  while (Date.now() - t0 < ms) {
    if (hook && (await hook(i))) { await walk(false); i++; continue; }
    const d = await page.evaluate(decide);
    if (d.over) break;
    if (d.state !== last) { last = d.state; trail.push(`${Math.round((Date.now() - t0) / 1000)}s ${d.state}`); }
    if (d.journey && i % 8 === 0) trail.push(`  ${Math.round((Date.now() - t0) / 1000)}s ${d.journey} at ${d.pos} foot ${d.foot} pace ${d.pace}`);
    if (d.hitProp) { await walk(false); await page.keyboard.press('KeyJ'); await sleep(280); await frame(d); i++; continue; }
    if (d.walk != null || d.idle) { await walk(!!d.walk); await sleep(d.walk ? 160 : 250); await frame(d); i++; continue; }
    await walk(false);
    if (d.propKind === 'anchor') { await page.keyboard.press('KeyJ'); await sleep(260); }
    else if (d.propKind === 'beacon') await sleep(300);
    else if (d.tell === 'dodge') { const k = i % 2 ? 'KeyA' : 'KeyD'; await page.keyboard.down(k); await page.keyboard.press('Space'); await sleep(90); await page.keyboard.up(k); }
    else if (d.tell === 'block') { await page.keyboard.down('ShiftLeft'); await sleep(420); await page.keyboard.up('ShiftLeft'); }
    else if (d.c2 && !d.c2.open && !d.c2.stale && d.dist != null && d.dist <= Math.max(d.bossDist || 3.0, 0) + 0.4) await sleep(90); /* combat2: armoured: wait for the window */
    else if (d.dist != null) {
      if (d.nearHold === 99 && d.dist > 3.0) await sleep(150); /* holding a place: no swings at a far foe (each swing steps forward) */
      else if (d.dist > Math.max(d.bossDist || 3.0, (d.nearHold || 0) + 0.4)) { await page.keyboard.down('KeyW'); await sleep(110); await page.keyboard.up('KeyW'); }
      else if (i % 11 === 6) { await page.keyboard.press('KeyK'); await sleep(300); }
      else { await page.keyboard.press('KeyJ'); await sleep(120); }
    } else await sleep(150);
    await frame(d);
    i++;
  }
  await walk(false);
  return { trail };
}

/* the camp question, answered like a player after 2 s (the bot used to sit out the 25 s quiet timer).
   campHook(page, { answer, onWait }) -> a hook for driveQuest; onWait() is called about every 0.9 s while it waits. */
export function campHook(page, { answer = 'For Wren and Ash, and the road home', onWait = null } = {}) {
  let seen = 0; let done = false; let lastWait = 0;
  return async () => {
    if (done || answer === '-') return false;
    const up = await page.evaluate(() => !!window.__sq.S?.camping && !document.getElementById('typed')?.classList.contains('hidden')).catch(() => false);
    if (!up) return false;
    if (!seen) seen = Date.now();
    if (Date.now() - seen < 2000) { await sleep(200); if (onWait && Date.now() - lastWait > 900) { lastWait = Date.now(); await onWait(); } return true; }
    await page.focus('#typed').catch(() => {}); await page.keyboard.type(answer, { delay: 12 }); await page.keyboard.press('Enter'); done = true; return true;
  };
}

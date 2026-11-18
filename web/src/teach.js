/* the combat lessons. The old control strip showed eight keys
   at once for 7 s at the first fight. Now one prompt at a time, each a key cap and two or three words, low in the centre,
   shown when it matters and gone once the player has done it:
     move (at the start) -> strike, heavy strike (a foe near) -> block (the moment a foe winds up: the cue ring glows) ->
     dodge (the next wind-up, or a blow that cannot be blocked) -> the power on E (the first time it is ready).
     A gun or a bow: shoot, aim, reload (a gun that is empty), melee blow on K.
   A prompt not done in 6 s steps back (smaller, dimmer) and goes at 14 s; it may come back later. What a player has done is
   kept in localStorage (sq.teach); a returning player who has done them all sees only the "? Controls" chip.
   "?" (or /) shows every control on demand (the old strip, index.html #legend). H and &hints=0 hide all of it (main.js
   body.nohints). Cost: a few field reads a frame; DOM writes only when the prompt changes. */
import { sfx } from './sfx.js';

const KEY = 'sq.teach';
const MELEE = ['move', 'strike', 'heavy', 'block', 'dodge', 'power'];
const RANGED = ['move', 'shoot', 'aim', 'reload', 'melee', 'block', 'dodge', 'power'];
const LESSON = {
  move: { keys: ['W', 'A', 'S', 'D'], text: 'Move' },
  strike: { keys: ['Click'], text: 'Strike' },
  heavy: { keys: ['Hold click'], text: 'Heavy strike' },
  block: { keys: ['Shift'], text: 'Block' },
  dodge: { keys: ['Space'], text: 'Dodge' },
  power: { keys: ['E'], text: 'Use your power' },
  shoot: { keys: ['Click'], text: 'Shoot' },
  aim: { keys: ['Hold click'], text: 'Aim, let go to shoot' },
  reload: { keys: ['R'], text: 'Reload' },
  melee: { keys: ['K'], text: 'Hit up close' },
};
const TOUCH_TEXT = { heavy: 'Hold to strike hard', aim: 'Hold to aim, let go to shoot', power: 'Use your power' };
let styled = false;
function addStyle() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.id = 'teach-style';
  s.textContent = `
  #teach { position: fixed; left: 50%; bottom: 200px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; padding: 8px 56px 10px; background: var(--plate); color: var(--cream, #ede6d6); pointer-events: none; z-index: 6; opacity: 0; transition: opacity .25s, bottom .3s, scale .4s; white-space: nowrap; }
  #teach.on { opacity: 1; animation: tc-in .35s cubic-bezier(.2,.8,.2,1) both; }
  #teach.parked { opacity: .62; scale: .78; }
  #teach.done { opacity: 1; animation: tc-out 1.1s ease both; } /* the class 'on' is gone here: its entry animation held opacity at 1 */
  @keyframes tc-out { 0%, 45% { opacity: 1; } 100% { opacity: 0; } }
  #teach kbd { font-family: var(--mono); font-size: var(--fs-body); font-weight: 600; padding: 2px 10px; border: 2px solid rgba(var(--cream-rgb, 237,230,214), .85); border-bottom-width: 4px; border-radius: 6px; background: rgba(8,9,11,.7); color: var(--cream, #ede6d6); text-shadow: none; }
  #teach .tc-plus { font-size: var(--fs-min); opacity: .7; margin: 0 -6px; }
  #teach b { font-size: var(--fs-lead); font-weight: 600; text-shadow: var(--heavy-shadow); }
  #teach.done b::after { content: ' ✓'; color: #ffd36a; }
  #teach.ok kbd { border-color: #ffd36a; color: #ffd36a; }
  body.speaking #teach { bottom: 300px; }
  @keyframes tc-in { from { opacity: 0; translate: 0 14px; } to { opacity: 1; translate: 0 0; } }
  #teach-help { position: fixed; left: 32px; bottom: 74px; display: flex; align-items: center; gap: 8px; font-size: var(--fs-min); color: var(--cream, #ede6d6); text-shadow: var(--heavy-shadow); opacity: .78; pointer-events: none; z-index: 5; transition: opacity .3s; }
  #teach-help kbd { font-size: calc(var(--fs-min) * .82); }
  body.teach #legend.on:not(.ask) { opacity: 0 !important; }
  #legend.ask { opacity: .95 !important; transition: opacity .2s; }
  body.teaching #hint[data-tut="1"] { opacity: 0 !important; }
  body.teach-block .cue i { box-shadow: 0 0 0 3px rgba(255,211,106,.35), 0 0 26px rgba(255,211,106,.75); border-color: #ffd36a; }
  body.nohints #teach, body.nohints #teach-help { display: none !important; }
  body.cine #teach, body.chap #teach, body.st-card #teach, body.cine #teach-help, body.chap #teach-help, body.st-card #teach-help { opacity: 0 !important; }
  `;
  document.head.appendChild(s);
}
const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };
const save = (set) => { try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* private mode */ } };

export class Teach {
  constructor(f) {
    addStyle(); this.f = f; this.done = load();
    this.list = f.rg ? (f.rg.P?.kind === 'gun' && !f.rg.P?.recharge ? RANGED : RANGED.filter((k) => k !== 'reload')) : MELEE;
    if (document.body.classList.contains('touch')) this.list = this.list.filter((k) => k !== 'melee'); /* no close blow button for a gun on a phone */
    const host = document.getElementById('labels') || document.body;
    const el = document.createElement('div'); el.id = 'teach'; el.setAttribute('role', 'status'); host.appendChild(el); this.el = el;
    const help = document.createElement('div'); help.id = 'teach-help'; help.innerHTML = '<kbd>?</kbd><span>Controls</span>'; host.appendChild(help); this.help = help;
    document.body.classList.add('teach');
    this.cur = null; this.t = 0; this.gap = 0.6; this.moved = 0; this.last = { x: f.pos.x, z: f.pos.z }; this.abil = f.stats?.abilities || 0; this.away = new Map();
    this.onKey = (e) => {
      if (e.repeat || /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
      if (e.key === '?' || e.code === 'Slash' || e.code === 'F1') { e.preventDefault?.(); this.showAll(); }
    };
    window.addEventListener('keydown', this.onKey);
  }
  /* every control, on demand, for 8 s (or until ? again) */
  showAll() {
    const lg = document.getElementById('legend'); if (!lg) return;
    if (lg.classList.contains('ask')) { lg.classList.remove('ask', 'on'); clearTimeout(this.allT); return; }
    lg.classList.add('on', 'ask'); clearTimeout(this.allT); this.allT = setTimeout(() => lg.classList.remove('ask', 'on'), 8000);
  }
  quiet() { const b = document.body.classList; return b.contains('nohints') || b.contains('cine') || b.contains('chap') || b.contains('st-card') || document.getElementById('hud')?.classList.contains('hidden'); }
  show(id) {
    const L = LESSON[id]; this.cur = id; this.t = 0; this.parked = false;
    /* on a phone the lesson names no key; the matching touch button glows (touch.js reads body[data-teach]) */
    document.body.dataset.teach = id;
    if (document.body.classList.contains('touch')) { this.el.innerHTML = `<b>${TOUCH_TEXT[id] || L.text}</b>`; this.el.className = 'on'; document.body.classList.add('teaching'); document.body.classList.toggle('teach-block', id === 'block'); return; }
    this.el.innerHTML = `${L.keys.map((k) => `<kbd>${k}</kbd>`).join(L.keys.length > 1 && L.keys[0].length === 1 ? '' : '<span class="tc-plus">+</span>')}<b>${L.text}</b>`;
    this.el.className = 'on'; document.body.classList.add('teaching'); document.body.classList.toggle('teach-block', id === 'block');
  }
  hide(learned) {
    const id = this.cur; if (!id) return; this.cur = null; this.gap = learned ? 0.9 : 0.4;
    delete document.body.dataset.teach;
    if (learned) { this.done.add(id); save(this.done); this.el.className = 'ok done'; sfx('tactic', { gain: 0.4 }); } else { this.el.className = ''; this.away.set(id, this.f.clock); }
    document.body.classList.remove('teaching', 'teach-block');
  }
  /* is there a foe near enough to fight, and is one winding up a blow now (and what kind) */
  scene() {
    const f = this.f; let nd = 1e9; for (const x of f.foes) { if (x.state === 'dead' || x.gone || x.hold) continue; const d = Math.hypot(x.pos.x - f.pos.x, x.pos.z - f.pos.z); if (d < nd) nd = d; }
    let inc = null; try { inc = f.incoming(); } catch { inc = null; }
    return { near: nd < 12 || (f.boss && !f.boss.dead), close: nd < 4.5, inc: inc && inc.t < 1.25 ? inc.kind : null };
  }
  /* which lesson fits this moment */
  pick(S) {
    const f = this.f; const want = (id) => this.list.includes(id) && !this.done.has(id) && f.clock - (this.away.get(id) ?? -99) > 9;
    if (S.inc === 'block' && want('block')) return 'block';
    if (S.inc && want('dodge') && (S.inc === 'dodge' || this.done.has('block'))) return 'dodge';
    if (want('move') && !S.near) return 'move';
    if (!S.near) return null;
    if (f.abilityCd <= 0 && want('power') && (this.done.has('strike') || this.done.has('shoot'))) return 'power';
    for (const id of this.list) { if (id === 'move' || id === 'block' || id === 'dodge' || id === 'power') continue; if (id === 'reload' && !(f.rg && f.rg.rounds === 0)) continue; if (want(id)) return id; }
    return null;
  }
  /* has the player done the lesson on show (or done it before it showed) */
  check(dt) {
    const f = this.f; const rg = f.rg; const sw = f.swing;
    const dx = f.pos.x - this.last.x; const dz = f.pos.z - this.last.z; this.last.x = f.pos.x; this.last.z = f.pos.z; if (f.moving) this.moved += Math.min(0.5, Math.hypot(dx, dz));
    const did = (id) => { if (this.done.has(id)) return; if (this.cur === id) this.hide(true); else { this.done.add(id); save(this.done); } };
    if (this.moved > 3) did('move');
    if (!rg) { if (sw && !sw.heavy) did('strike'); if (sw && sw.heavy) did('heavy'); }
    else { if (rg.st === 'cycle') did('shoot'); if (rg.st === 'aim' || rg.st === 'draw') did('aim'); if (rg.st === 'reload' || rg.st === 'heat') did('reload'); if (sw) did('melee'); }
    if (f.blocking && this.cur === 'block') did('block');
    if (f.dodge) did('dodge');
    const ab = f.stats?.abilities || 0; if (ab > this.abil) { this.abil = ab; did('power'); }
    void dt;
  }
  update(dt) {
    const f = this.f; if (f.over) { if (this.cur) this.hide(false); return; }
    if (this.quiet() || f.paused) { if (this.cur && !this.parked) { this.el.className = ''; } return; }
    if (this.cur && this.el.className === '') this.el.className = this.parked ? 'on parked' : 'on';
    /* the guide's mark low in the centre (a pickup at the hero's feet): the prompt steps up over it */
    if (this.cur) {
      const G = f.guideM; const H = innerHeight; const b0 = document.body.classList.contains('speaking') ? 300 : 200; let b = b0;
      if (G && G.y > 0 && Math.abs(G.x - innerWidth / 2) < 320 && G.y - 84 < H - b0 && G.y > H - b0 - 66) b = Math.min(H * 0.5, H - (G.y - 84) + 10);
      b = Math.round(b / 8) * 8; if (b !== this.bottom) { this.bottom = b; this.el.style.bottom = b === b0 ? '' : `${b}px`; }
    }
    this.check(dt);
    /* a returning player: the chip says where the controls are, nothing else */
    if (this.list.every((id) => this.done.has(id))) { if (this.cur) this.hide(false); return; }
    const S = this.scene();
    if (this.cur) {
      this.t += dt;
      /* the block and dodge lessons belong to the wind-up: they go when it is over */
      if ((this.cur === 'block' || this.cur === 'dodge') && !S.inc && this.t > 1.2) { this.hide(false); return; }
      if (this.cur === 'move' && S.near) { this.hide(false); return; }
      /* a fight lesson with no foe near for 2 s goes (it came back on the walk to the fire) */
      if (this.cur !== 'move' && !S.near) { this.far = (this.far || 0) + dt; if (this.far > 2) { this.far = 0; this.hide(false); return; } } else this.far = 0;
      const now = this.pick(S); if (now && now !== this.cur && (now === 'block' || now === 'dodge')) { this.hide(false); this.show(now); return; }
      if (this.t > 6 && !this.parked) { this.parked = true; this.el.className = 'on parked'; }
      if (this.t > 14) this.hide(false);
      return;
    }
    this.gap -= dt; if (this.gap > 0) return;
    const id = this.pick(S); if (id) this.show(id);
  }
  dispose() { window.removeEventListener('keydown', this.onKey); delete document.body.dataset.teach; this.el.remove(); this.help.remove(); document.body.classList.remove('teach', 'teaching', 'teach-block'); const lg = document.getElementById('legend'); lg?.classList.remove('ask'); clearTimeout(this.allT); }
}

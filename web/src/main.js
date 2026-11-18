/* Sage Quest: seven questions -> a fight in three chapters -> an end card. */
import * as THREE from 'three';
import { World, makeActor, makeGear, mountGear, loadGLB, KNIGHT_URL, registerWorld, worldWear, isShield, holdFor as weaponHold, standClip, holdHero } from './world.js';
import { registerLands, landKnown } from './lands.js';
import { loadWorld } from './worlds/index.js';
/* fight.js (and all it alone imports, ~120 kB brotli) loads after the title paints */
let fightP = null; const fightMod = () => (fightP ??= import('./fight.js'));
import { Camp, CamRig, fitView, dressHero, mentionKinds } from './camp.js';
/* the night camp behind the questions; null on quick-start links and after the road starts */
let camp = null;
import { api, feed, openOnboard, openDirector, makeStable } from './net.js';
import { flyWords, streak, ring } from './link.js'; /* the link from the player's words to the thing that changes */
import { sfx, unlockAudio, setSfxWorld, sfxVoice } from './sfx.js';
import { installTouch } from './touch.js'; /* touch play */
import { CX } from './create-ux.js';
import { readArms, lookOf } from './create-fx.js'; /* the forge's look from the player's own words */ /* the build's echo, progress/button/wipe, phone strip; ?create=off = off (CX null) */
CX?.install();
import { styleFromUrl, installStyle } from './style.js';
import './music.js'; /* the score; it reads the game state by itself (window.__sq), ?music=0 turns it off */
import './audio-bar.js'; /* one speaker icon (M key) = master mute + volume + music / sound effects */
import { startReel } from './title-reel.js'; /* the title reel */
import * as SHARE from './share.js'; /* the share loop (who you fought for, the link, the friend run); ?share=off = off */
import * as COVER from './cover.js'; /* the tape-cover look for the card, the share images, the panel and the landing */
import { installQuality, makeClock } from './quality.js'; /* perf: adaptive resolution, quality tiers (?q=low|mid|high), the game clock */
import * as PW from './powerup.js'; /* YOU GAIN POWER! after the heart answer */
import { ARCHETYPES, BIOMES, WEAPONS, MATERIALS, ELEMENTS, NEMESES, MOTIVES, MINIONS, RESOLVES, RESOLVE_BY_MOTIVE, FOES, BOSSES, BUILD_LABELS, byId } from '/game/kit.mjs';
import { tellStory, wordSwap } from '/game/story.mjs';
import { kitFor, WORLDS, worldById, landHome } from '/game/worlds.mjs';
/* any first click or key turns the sound on, also on a quick-start link */
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => unlockAudio(), { capture: true });

const $ = (id) => document.getElementById(id);
const SITE = 'levanto.ai';
const world = new World($('c'));
/* art style (web/src/style.js): each world's own (Old Edo = the ink print); ?style=ink forces it on, ?style=off forces it off */
installStyle(world, styleFromUrl());
installQuality(world);
/* night from the first frame: the land colours arrive later with the first answer */
const NIGHT = { top: 0x05060a, bottom: 0x1d2029, fog: 0x12141a, ground: 0x1a1b1f, light: 0x9aa2b8 };
for (const k of Object.keys(NIGHT)) { world.col[k].set(NIGHT[k]); world.target[k].set(NIGHT[k]); }
world.target.exposure = 0.9;

/* The build steps. The server holds the questions; this list holds only what is shown. */
const STEPS = [
  { id: 'name', ask: 'What is your name?', hint: '', eg: 'They call me Rowan' },
  /* order: name, origin, birth date. The birth date
     is optional: Skip, or an answer with no date in it, gives a hidden sign (hiddenSign) */
  { id: 'origin', ask: 'Where are you from?', hint: 'The place and its weather.', eg: 'New Orleans. Hot, wet, right on the gulf.', live: 'biome' },
  { id: 'born', ask: 'When were you born?', hint: 'Or skip it for a hidden sign.', eg: 'May 5th, 1990' },
  { id: 'body', ask: 'How do you spend your days?', hint: '', eg: 'I write code all day and I lift at night', live: 'archetype' },
  { id: 'heart', ask: 'Who do you fight for?', hint: '', eg: 'My brother Wren and my dog Ash. I keep them safe.', live: 'motive' },
  { id: 'enemy', ask: 'What stands in your way?', hint: 'A person, a fear or a problem.', eg: 'A storm that keeps growing', live: 'nemesis' },
  { id: 'weapon', ask: 'What weapon do you want?', hint: 'What it is made of, and its power.', eg: 'A silver spear that carries frost' },
];
/* the heart step asks for who AND why (Sage2 picks the motive from the why; the card speaks to the who) */
if (SHARE.SHARE_ON) Object.assign(STEPS.find((s) => s.id === 'heart'), { hint: 'Say who, and why.', eg: 'My brother Wren. I keep him safe.' });
/* the kit of the chosen world (game/worlds.mjs): names, looks and lines over the same mechanics ids; dark = kit.mjs */
const K = () => kitFor(S.world);
const CX_STUB = (() => { try { return new URLSearchParams(location.search).get('cxstub') === '1'; } catch { return false; } })();
/* the enemy's people as the road names them: Sage2's pick, except the dark default ("Thralls") inside a world,
   where the world's own foe names stay (Outlaw, Goblin, Bandit, Runner; "Thrall" in a western read wrong) */
/* a nemesis with no pronoun in its world entry is 'he' or 'she' when its own intro or death line says so
   ("He sets his hat"), else 'it' (story.mjs) */
const pronounOf = (n) => n?.pronoun || ([n?.intro, n?.death].some((t) => /^(He|His)\b/.test(t || '')) ? 'he' : [n?.intro, n?.death].some((t) => /^(She|Her)\b/.test(t || '')) ? 'she' : undefined);
const roadMinions = () => (S.minions && !(S.minions.id === 'thralls' && S.world !== 'dark') ? S.minions : null);
/* the story's foot soldier and its scout (journey.js spawns the scout as the rogue foe: the words name that model) */
const storyFoes = () => { const k = K(); const m = roadMinions(); const strip = (t) => String(t || '').replace(/^Hollow /, ''); return { minion: m?.one || strip(k.FOES.find((d) => d.id === 'minion')?.label) || 'Thrall', scout: strip(k.foeName(k.FOES.find((d) => d.id === 'rogue'), m)) || undefined }; };
/* the boon's name: a world uses the plain word (kit RESOLVES plainBoon, "Not alone"); "Their light" is the dark world's */
const boonOf = (r) => (S.world !== 'dark' && r?.plainBoon) || r?.boon || '';
/* the letterbox bars slide away for 0.55 s after a cinema beat; the HUD waits under 'uncine' until they are gone, so a bar never cuts the health bar or the boss bar */
let unCineT = 0;
function unCine() { const b = document.body.classList; if (!b.contains('cine')) return; b.remove('cine'); b.add('uncine'); clearTimeout(unCineT); unCineT = setTimeout(() => b.remove('uncine'), 820); } /* the plates wait until the bars (0.55 s) are fully out: the top bar cut the boss title */
const LISTS = { biome: BIOMES, get archetype() { return K().ARCHETYPES; }, motive: MOTIVES, get nemesis() { return K().NEMESES; }, minions: MINIONS };

const S = {
  stage: 'title', mode: 'voice', step: -1, committed: '', interim: '', world: 'dark', worldMod: null, worldPicked: false,
  name: null, birth: null, sign: null, age: null, seed: 1, place: null, trade: null, build: 2.5,
  archetype: null, biome: null, nemesis: null, minions: null, motive: null, tone: 3, desire: null, enemy: null, mentions: [],
  weapon: null, material: null, element: null, weaponName: null,
  answers: {}, pairs: [], vow: null, resolve: null, story: null, quick: false, camping: false,
  hero: null, heroUrl: null, revision: 0, busy: false, seq: 0, advanceTimer: null,
};
window.__sq = { S, world, feed, quality: world._quality };

/* ---------- words ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const lowFirst = (t) => (t && !/^[A-Z]{2}/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const lower = (t) => (t ? t.replace(/^The /, 'the ') : t);
const bare = (t) => (t ? t.replace(/^The /, '') : t);
const art = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const trim = (t) => String(t || '').trim().replace(/\s+/g, ' ').replace(/[.!,;:]+$/, '');
const clip = (t, n = 64) => { const s = trim(t); return s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s; };
const firstSentence = (t) => (/^[^.]*\./.exec(t || '') || [''])[0];
const buildLabel = () => BUILD_LABELS[Math.round(Math.max(1, Math.min(4, S.build)))];
const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const numWords = (n) => (n < 20 ? NUMS[n] : n < 100 ? `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${NUMS[n % 10]}` : ''}` : String(n));
const youFight = (m) => firstSentence(m?.fits).replace(/^Fights/, 'You fight');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- the tale: one growing sentence about the player, above the field ---------- */
let taleTimer = null;
/* a name never breaks across lines: "the Drowned Fen" stays together */
const nb = (t) => String(t ?? '').replace(/ /g, '\u00a0');
/* the rail. The growing sentence is gone: each answer leaves ONE short line at the left (name, land, sign, class,
   people, enemy, weapon), so the result of an answer stays readable while the next question is up, and the seven lines are
   the build list on the last screen. tell(part) keeps its old callers. */
const RAIL = ['name', 'land', 'born', 'hero', 'heart', 'enemy', 'weapon'];
const RAIL_OF = { name: ['name'], born: ['born'], land: ['land'], who: ['hero', 'heart'], enemy: ['enemy'], weapon: ['weapon'], world: ['land', 'hero'] };
function railText(k) {
  const names = (S.mentions || []).map((m) => m.text).filter(Boolean);
  if (k === 'name') return S.railName ? S.name || '' : '';
  if (k === 'land') return S.biome ? S.biome.label : '';
  if (k === 'born') return S.sign || (S.signHidden ? 'A hidden sign' : '');
  if (k === 'hero') return S.archetype && !S.heroBare ? S.archetype.label : '';
  if (k === 'heart') return names.length ? `For ${list(names)}` : S.motive ? S.motive.label : '';
  if (k === 'enemy') return S.nemesis ? S.nemesis.label : '';
  if (k === 'weapon') return S.weapon ? (S.weaponLabel || S.weaponName || '') : '';
  return '';
}
function rail(fresh) {
  let box = $('rail');
  if (!box) { box = document.createElement('ol'); box.id = 'rail'; box.setAttribute('aria-label', 'Your build so far'); for (const k of RAIL) { const li = document.createElement('li'); li.dataset.k = k; box.appendChild(li); } document.body.appendChild(box); }
  const hot = new Set(Array.isArray(fresh) ? fresh : RAIL_OF[fresh] || (fresh ? [fresh] : []));
  for (const li of box.children) {
    const t = railText(li.dataset.k); const was = li.textContent;
    if (t !== was) li.textContent = t;
    li.classList.toggle('on', !!t);
    if (t && t !== was && hot.has(li.dataset.k)) { li.classList.remove('new'); void li.offsetWidth; li.classList.add('new'); }
  }
  CX?.strip([...box.children].filter((li) => li.textContent).map((li) => ({ k: li.dataset.k, t: li.textContent })), [...hot][0]);
}
function tell(fresh) { $('tale').innerHTML = ''; rail(fresh); }

/* ---------- the Sage2 feed: plain rows ---------- */
const fmtCost = (c) => (c >= 0.01 ? `$${c.toFixed(3)}` : `$${c.toFixed(4)}`);
/* Log entries carry no request. Keep each call's request beside its log entries, so a row can quote the player. */
const feedCtx = new Map();
const realFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const res = await realFetch(url, init);
  if (typeof url === 'string' && url.startsWith('/api/') && res.ok && typeof init?.body === 'string') {
    try { const body = JSON.parse(init.body); const j = await res.clone().json(); for (const e of j.log || []) feedCtx.set(`${e.at}|${e.label}`, { body, res: j }); } catch { /* not json */ }
    if (feedCtx.size > 60) feedCtx.delete(feedCtx.keys().next().value);
  }
  return res;
};
const OPTS = { minions: MINIONS, get biome() { return BIOMES.map((b) => ({ ...(K().landFor(b.id) || b), id: b.id })); }, get archetype() { return K().ARCHETYPES; }, motive: MOTIVES, get nemesis() { return K().NEMESES; }, resolve: RESOLVES, get weapon() { return K().WEAPONS; }, get material() { return K().MATERIALS; }, get element() { return K().ELEMENTS; }, world: WORLDS };
/* Every row in plain words: what the player said, then what Sage2 made of it. No keys, no question marks, no odds. */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PLAIN = {
  biome: (o) => `your land: ${lower(o.label)}`,
  world: (o) => `your world: ${lower(o.label)}`,
  archetype: (o) => { const n = bare(o.label); return `your hero: ${art(n)} ${n}`; },
  motive: (o) => `you fight ${o.label.toLowerCase()}`,
  nemesis: (o) => `your enemy: ${lower(o.label)}`,
  minions: (o) => `it sends its ${o.many}`,
  resolve: (o) => `gift: ${boonOf(o)}`,
};
/* every row line made from a Sage2 pick, so a world picked later can re-label the rows already in the feed */
const SAID = [];
const rowText = (l) => `→ ${String(l).replace(/ \(closest fit\)/, '\u00a0(closest\u00a0fit)').replace(/\s+(\S+)$/, '\u00a0$1')}`;
function relabelFeed() {
  const spans = [...($('feed-list')?.querySelectorAll('.r span') || [])];
  for (const r of SAID) { const nu = says(r.kind, r.token); if (!nu || nu === r.line) continue; const old = rowText(r.line); for (const sp of spans) if (sp.textContent === old) sp.textContent = rowText(nu); r.line = nu; }
}
function says(kind, token, live = false) {
  const t = String(token || '').trim().split(/\s+/);
  if (!t[0]) return null;
  if (kind === 'tone') return null;
  /* the world was picked (a chip or ?world=): Sage2's world guess did not change it, so the feed does not claim it */
  if (kind === 'world' && S.worldPicked && byId(WORLDS, t[0].replace(/\?$/, ''))?.id !== S.world) return null;
  if (kind === 'build' || kind === 'minions') return null; /* no row for a pick the scene does not show */
  /* "your world: the Dark Road" beside "your land: the Drowned Fen" read as two places: the world row shows only when the world changes */
  if (kind === 'world' && byId(WORLDS, t[0].replace(/\?$/, ''))?.id === S.world) return null;
  const unsure = t[0].endsWith('?'); const opt = byId(OPTS[kind] || [], t[0].replace(/\?$/, ''));
  if (!opt || !PLAIN[kind]) return null;
  const line = PLAIN[kind](opt);
  return unsure && live ? `${line}, so far` : line; /* no "(closest fit)": it read as an apology */
}
const TACTIC_SAY = { call: ['call for help', 'calls for help'], retreat: ['fall back', 'falls back'], feint: ['feint at you', 'feints at you'], flank: ['flank you', 'flanks you'], guard: ['hold the line', 'holds the line'], charge: ['charge you', 'charges you'] };
const BEAT_SAY = { reinforce_thralls: 'sends Thralls', reinforce_stalkers: 'sends Stalkers', reinforce_guard: 'sends a Guard captain', reinforce_brute: 'sends a Brute', rest: 'lets you breathe' };
/* the heart of a long answer: its last clause ("... and I promised them" -> "I promised them") */
function keyPhrase(text) {
  const parts = trim(text).split(/\s*(?:[,;:.!?]|\band\b|\bbut\b|\bbecause\b|\bso\b)\s*/i).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2);
  const last = parts[parts.length - 1];
  return last && last.length < trim(text).length ? cap(last) : trim(text);
}
const isoSay = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MONTH_NAMES[+m[2] - 1]} ${m[1]}` : iso; };
function describe(e) {
  const key = `${e.at}|${e.label}`; const c = feedCtx.get(key); feedCtx.delete(key);
  const lab = e.label || ''; const det = e.detail || ''; const words = c?.body?.text || null;
  if (lab.startsWith('tactics')) {
    if (!c?.res?.picks || !e.ok) return { lines: ['Sage2 did not answer in time: the game picked the move'] };
    return { lines: c.res.picks.map((p) => {
      const g = (c.body.groups || []).find((x) => x.id === p.id); const foe = byId(K().FOES, g?.type) || (g?.nemesis && K().nemesis(g.nemesis) ? K().bossFor(K().nemesis(g.nemesis)) : byId(BOSSES, g?.type));
      const boss = !!foe?.boss; const m = S.minions; const who = foe ? (boss ? foe.label : m ? `${{ minion: '', warrior: 'Sworn ', rogue: 'Pale ', brute: 'Great ' }[foe.id] ?? ''}${m.many}` : `${foe.label.replace(/^Hollow /, '')}s`) : 'They';
      const t = p.chosen ?? p.lead; return `Sage2 reads the fight: ${who} ${TACTIC_SAY[t]?.[boss ? 1 : 0] ?? t}${p.chosen ? '' : ' (best guess)'}`;
    }) };
  }
  if (lab.startsWith('director')) {
    const m = /next: (\w+)\??/.exec(det);
    const mm = S.minions; const say = mm ? { reinforce_thralls: `sends ${mm.many}`, reinforce_stalkers: `sends Pale ${mm.many}`, reinforce_guard: `sends a Sworn ${mm.one} captain`, reinforce_brute: `sends a Great ${mm.one}`, rest: BEAT_SAY.rest } : BEAT_SAY;
    return { lines: [m ? `Sage2 reads the fight: ${say[m[1]] || 'waits'}` : 'Sage2 reads the fight'] };
  }
  if (lab.startsWith('decide:')) {
    const ids = lab.slice(7).split(',').map((x) => x.trim()); const parts = det.split(' · ');
    const said = ids.map((id, i) => { const l = says(id, parts[i]); if (l) SAID.push({ kind: id, token: parts[i], line: l }); return l; }).filter(Boolean);
    const vow = ids[0] === 'resolve';
    return { quote: vow && words ? keyPhrase(words) : words, step: vow ? 'vow' : null, lines: said };
  }
  if (lab.startsWith('extract:')) {
    const keys = lab.slice(8).trim(); const d = trim(det);
    const same = words && d && trim(words).toLowerCase().includes(d.toLowerCase());
    let line;
    if (/birth/.test(keys)) { const [iso, sign] = det.split(' · '); line = sign && sign !== 'no sign' ? `born under ${sign}, ${isoSay(iso)}` : 'no date found'; }
    else if (/companions/.test(keys)) { const [who, want] = det.split(' · '); line = who && who !== 'nobody named' ? `you fight for: ${who}` : want ? `you want: ${want}` : null; }
    else if (/^name/.test(keys)) line = (words && trim(words).toLowerCase() === d.toLowerCase()) || (CX && /^no name/i.test(d)) ? 'your name' : `your name: ${d}`; /* never "no name" over a stone that shows the name */ /* not the same word three times */
    else if (/^place/.test(keys) || /^trade/.test(keys)) line = null; /* the land row and the hero row say it */
    else if (/^enemy/.test(keys)) line = null; /* not a decision the player needs to read */
    else if (/^vow/.test(keys)) line = null; /* the vow is said once, in the last fight */
    else if (/item|weapon|material|element/.test(keys)) line = null; /* "the smith makes" says it */
    else line = d;
    return { quote: /^vow/.test(keys) && words ? keyPhrase(words) : words, lines: line ? [line] : [] };
  }
  /* the weapon step's read of the answer, in plain words */
  if (lab.startsWith('classify: answer')) { const a = det.split(' ')[0].replace(/\?$/, ''); return { quote: words, lines: a === 'weapon' ? [] : [{ thing: 'you named a thing, not a weapon', ready: 'you are ready to go', none: 'you named no weapon: the standard one' }[a] || 'not sure what you asked for'] }; }
  if (lab.startsWith('classify')) return { quote: words, lines: [`you want to: ${det.replace(/\s+\d+%$/, '').replace('not sure', 'unclear')}`] };
  /* the forge read, honest: "not sure: closest fit sabre 32%", then what the smith makes from the player's word */
  if (lab.startsWith('map words') && c?.res && c.body?.step === 'weapon') {
    const fr = readForge(c.res, words || '');
    if (fr.kind === 'none' || fr.kind === 'ready') return { quote: null, lines: [] };
    const wl = shortLabel(fr.weapon.label).toLowerCase();
    const oa = ownArms(words || '', fr); const made = fr.word ? wordWeapon(fr.word, fr.weapon.label).toLowerCase() : `${oa.mat} ${oa.noun}`;
    return { quote: words, lines: [...(fr.unsure || fr.kind === 'thing' ? [`nearest: ${wl} (${pctOf(fr.leadP)})`] : []), `the smith makes: ${art(made)} ${made} of ${fr.element.label.toLowerCase()}`] };
  }
  if (lab.startsWith('map words')) {
    const [w, m, el] = det.split(' · ').map((x, i) => byId([K().WEAPONS, K().MATERIALS, K().ELEMENTS][i] || [], x.split(' ')[0].replace(/\?$/, ''))?.label || '');
    /* an honest line: "closest fit" when Sage2 only led on the weapon (no confident choice, or a `?` token),
       or when the player asked for a gun the world does not have (a gun in Edo gives the yumi) */
    const wt = (det.split(' · ')[0] || '').split(' ')[0]; const fw = c?.res?.forge?.weapon;
    const unsure = fw ? fw.chosen == null : /\?$/.test(wt);
    const gunAsk = /\b(gun|pistol|revolver|rifle|shotgun|firearm|blaster)s?\b/i.test(words || '') && !/gun|pistol|revolver|rifle|stun/i.test(w);
    return { quote: words, lines: [`the smith makes: ${art(m || w)} ${`${m} ${w}`.trim().toLowerCase()}${el ? ` of ${el.toLowerCase()}` : ''}`] };
  }
  if (lab.startsWith('dynamic choice')) return { quote: S.answers?.weapon || S.answers?.heart || null, /* under the weapon answer, beside "the smith makes" */ lines: [det === 'none' ? 'the weapon takes a name of its own' : `the weapon is named for ${det.replace(/\s+\d+%$/, '')}`] };
  return { quote: words, lines: [det || lab] };
}
/* the newest row flashes gold; superseded as-you-type rows fold into the final row as a count */
let lastRow = null; let liveRow = null; let sentSeq = -1;
/* a feed quote: the words that carried the answer (a long answer shows its last clause), whole words only, and the last
   two words kept together so no word sits alone on a line */
function feedQuote(t, draft = false) {
  let q = trim(t || '');
  if (draft) { const cut = /\s$/.test(t || '') ? q : q.replace(/\s*\S+$/, ''); q = cut ? `${cut}…` : ''; }
  if (q.length > 84) q = `${q.slice(0, 84).replace(/\s+\S*$/, '').replace(/[,;:.]+$/, '')}…`;
  return q.replace(/\s+(\S+)$/, '\u00a0$1');
}
const quoteHtml = (t, draft = false) => { const q = feedQuote(t, draft); return q ? `<q>“${esc(q)}”</q>` : ''; };
function fresh(li) { li.classList.remove('fresh'); void li.offsetWidth; li.classList.add('fresh'); }
function addRow({ quote, lines }, ms) {
  if (!lines.length) return;
  const list = $('feed-list');
  const lineHtml = lines.map((l, i) => `<div class="r"><span>${esc(rowText(l))}</span>${i === 0 ? `<time>${ms} ms</time>` : ''}</div>`).join('');
  /* the decide and the extract on one answer share one row */
  if (quote && lastRow && lastRow.quote === quote && lastRow.li.isConnected && Date.now() - lastRow.t < 6000) { const m = lastRow.li.querySelector('.m'); if (m) m.insertAdjacentHTML('beforebegin', lineHtml); else lastRow.li.insertAdjacentHTML('beforeend', lineHtml); fresh(lastRow.li); return; }
  const li = document.createElement('li');
  let drafts = 0;
  if (quote && liveRow && liveRow.li.isConnected && liveRow.step === STEPS[S.step]?.id) { drafts = liveRow.n; liveRow.li.remove(); liveRow = null; }
  li.innerHTML = `${quote ? quoteHtml(quote) : ''}${lineHtml}${drafts > 1 ? `<div class="m">${drafts} drafts as you ${S.mode === 'voice' ? 'spoke' : 'typed'}</div>` : ''}`;
  list.prepend(li); fresh(li); lastRow = { li, quote, t: Date.now() };
  while (list.children.length > 40) list.lastChild.remove();
}
/* Stream frames fold into one row per answer that updates while the player speaks. */
function streamRow(e) {
  const list = $('feed-list'); const step = STEPS[S.step]?.id;
  if (S.stage !== 'build' || !step) return;
  if (sentSeq === S.seq) return; /* the answer is sent: a late draft frame must not put a dots row over the resolved pick */
  const kind = (e.label.split(':')[1] || '').trim().split(',')[0];
  const line = kind && kind !== 'no change' ? says(kind, (e.detail || '').split(' · ')[0], true) : null;
  if (!liveRow || liveRow.step !== step || !liveRow.li.isConnected) {
    const li = document.createElement('li'); li.className = 'live';
    list.prepend(li); liveRow = { li, step, n: 0, line: null }; lastRow = null;
    while (list.children.length > 40) list.lastChild.remove();
  }
  liveRow.n++; if (line) liveRow.line = line;
  const words = streamText() || S.answers[step] || '';
  /* a draft is not a pick ("Frost Pass" under a half-typed "New Orleans" read as a wrong answer): the words, three
     moving dots and the time of the last read */
  if (liveRow.sent) return;
  liveRow.li.innerHTML = `${words ? quoteHtml(words.split(' ').slice(-14).join(' '), true) : ''}<div class="r wait"><span class="dots3"><i></i><i></i><i></i></span><time>${e.ms} ms</time></div>`;
}
function tiles() {
  $('t-calls').textContent = String(feed.calls);
  $('t-ms').textContent = `${feed.median()} ms`;
  $('t-cost').textContent = fmtCost(feed.cost);
}
feed.listeners.add((e) => {
  if ((e.label || '').startsWith('stream frame')) streamRow(e); else addRow(describe(e), e.ms);
  tiles();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); if (S.stage !== 'title') $('feed').classList.toggle('hidden'); }
  if (e.key === 'Escape') skipNow();
});

/* while a reveal plays the answer field, Back, Skip and the hint are away (they covered the hero's feet, the dog
   and the forge, and the caret said "type now"); they come back with the next question, or at once on a key */
function watching(on) { document.body.classList.toggle('watching', !!on); }
/* ---------- the link ---------- */
/* the answer is sent: its row in the panel waits (the words, three dots), and the words fly from the field into it */
function sendWords(text) {
  const list = $('feed-list'); const step = STEPS[S.step]?.id; const shown = !$('feed').classList.contains('hidden');
  if (!liveRow || liveRow.step !== step || !liveRow.li.isConnected) { const li = document.createElement('li'); li.className = 'live'; list.prepend(li); liveRow = { li, step, n: 0, line: null }; lastRow = null; }
  liveRow.sent = true; sentSeq = S.seq; watching(true); CX?.sent(text);
  liveRow.li.innerHTML = `${quoteHtml(text)}<div class="r wait"><span class="dots3"><i></i><i></i><i></i></span></div>`;
  const q = liveRow.li.querySelector('q'); const from = ($('typed').classList.contains('hidden') ? $('listen') : $('typed')).getBoundingClientRect();
  if (!q || !shown) return;
  q.style.opacity = '0';
  flyWords(`“${clip(text, 54)}”`, from, q.getBoundingClientRect()).then(() => { q.style.transition = 'opacity .18s'; q.style.opacity = ''; });
}
/* where a part of the build is on the screen, in px. The camp says (camp.anchor); if it cannot,
   the place is worked out here from what the scene holds, and at worst it is the hero */
/* the rail's and the steps' names for a part -> the camp's */
const CAMP_KIND = { name: 'name', land: 'land', born: 'sign', hero: 'class', heart: 'companions', enemy: 'enemy', weapon: 'weapon' };
const _av = new THREE.Vector3();
function toPx(w) { if (!w) return null; _av.copy(w).project(world.camera); if (!(_av.z < 1) || Math.abs(_av.x) > 1.05 || Math.abs(_av.y) > 1.05) return null; return { x: (_av.x * 0.5 + 0.5) * innerWidth, y: (-_av.y * 0.5 + 0.5) * innerHeight }; }
function anchorPx(kind) {
  const W = innerWidth; const H = innerHeight;
  try {
    const a = camp?.anchor?.(CAMP_KIND[kind] || kind);
    if (a) {
      const sc = (typeof a.screen === 'function' ? a.screen() : a.screen) || a.px || (!a.isVector3 && Number.isFinite(a.x) && Number.isFinite(a.y) && a.z === undefined ? a : null);
      if (sc && sc.visible !== false && Number.isFinite(sc.x) && Number.isFinite(sc.y)) return { x: Math.min(W - 24, Math.max(24, sc.x)), y: Math.min(H - 24, Math.max(24, sc.y)) };
      const p = toPx(a.world || a.position || a.pos || (a.isVector3 ? a : null)); if (p) return p;
    }
  } catch (err) { console.warn('anchor', err); }
  try {
    const hp = S.hero?.root ? S.hero.root.getWorldPosition(new THREE.Vector3()) : null;
    const up = (y, x = 0) => (hp ? toPx(hp.clone().add(new THREE.Vector3(x, y, 0))) : null);
    if (kind === 'name' && camp?.stone) { const p = toPx(camp.stone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.9, 0))); if (p) return p; }
    if (kind === 'land') return { x: W * 0.5, y: H * 0.44 };
    if (kind === 'born') return { x: W * 0.42, y: H * 0.16 };
    if (kind === 'enemy') { const n = world.nemesis?.root || world.nemesis?.group || world.nemesis?.actor?.root; const p = n ? toPx(n.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 2, 0))) : null; return p || { x: W * 0.6, y: H * 0.34 }; }
    if (kind === 'heart') return up(0.8, 1.4) || up(1.1) || { x: W * 0.56, y: H * 0.6 };
    if (kind === 'weapon') return up(1.05, 0.35) || { x: W * 0.5, y: H * 0.55 };
    return up(1.25) || { x: W * 0.5, y: H * 0.55 };
  } catch (err) { console.warn('anchor', err); return { x: W * 0.5, y: H * 0.55 }; }
}
/* the decisive words of the answer light up in the panel's quote */
function markQuote(li, words) {
  const q = li?.querySelector('q'); const w = trim(words || ''); if (!q || !w || w.length < 2) return;
  const t = q.textContent; const i = t.toLowerCase().indexOf(w.toLowerCase().replace(/\s+/g, ' ')); const j = i < 0 ? t.replace(/ /g, ' ').toLowerCase().indexOf(w.toLowerCase()) : i;
  if (j < 0 || w.length >= t.length - 2) { q.classList.add('key'); return; }
  q.innerHTML = `${esc(t.slice(0, j))}<em>${esc(t.slice(j, j + w.length))}</em>${esc(t.slice(j + w.length))}`;
}
/* the row has resolved: its decisive words light, and a streak runs from the row to the thing that is about to change.
   Resolves when the light arrives; the caller then makes the change */
async function linkTo(kind, words) {
  CX?.key(words);
  const li = lastRow?.li?.isConnected ? lastRow.li : liveRow?.li?.isConnected ? liveRow.li : null;
  if (!li || $('feed').classList.contains('hidden') || S.quick) return;
  markQuote(li, words);
  const r = (li.querySelector('.r') || li).getBoundingClientRect(); if (!r.width) return;
  const to = anchorPx(kind);
  await wait(140); /* the row is read first */
  await streak({ x: r.left - 6, y: r.top + r.height / 2 }, to);
  ring(to, { size: kind === 'land' ? 260 : kind === 'enemy' ? 180 : 130 });
}
/* stage hook: the ONE place a reveal starts. FLOW calls stage(kind) from each step
   handler right after the streak lands; do not add a second camp.reveal call beside it.
   Resolves when the CHANGE is on screen: at once for most parts, after opts.swap has run for the class (the body changes
   inside the light), at the end of the forge for the weapon (opts.whole). With no camp.reveal it runs opts.swap itself. */
function stage(part, opts = {}) {
  const kind = CAMP_KIND[part] || part;
  if (typeof camp?.reveal !== 'function') return opts.swap ? Promise.resolve(opts.swap()) : Promise.resolve();
  let ran = false; let swapDone = null;
  const swap = opts.swap ? async () => { if (ran) return swapDone; ran = true; swapDone = Promise.resolve(opts.swap()).catch((err) => console.warn('swap', err)); return swapDone; } : null;
  let end;
  try { end = Promise.resolve(camp.reveal(kind, { ...(swap ? { swap } : {}), onBeat: (beat) => { try { opts.onBeat?.(beat); } catch (err) { console.warn('beat', err); } } })).catch((err) => console.warn('reveal', err)); }
  catch (err) { console.warn('reveal', err); end = Promise.resolve(); }
  if (swap) return Promise.race([end, wait(2600)]).then(() => swap()); /* a camp that never reached the peak: the body still changes */
  if (opts.whole) return Promise.race([end, wait(opts.cap || 9000)]);
  return Promise.resolve();
}
/* the sign is drawn: a thin line of light runs from the constellation down to the stone, where the date is cut */
function signFall(beat) { if (beat !== 'fall' || S.stage !== 'build') return; const a = anchorPx('born'); const b = anchorPx('name'); if (!a || !b) return; streak(a, { x: b.x, y: b.y + 34 }, { ms: 520 }).then(() => ring({ x: b.x, y: b.y + 34 }, { size: 90 })); }
/* the response holds for its reading time and at least until the staging ends */
const holdStaged = (...a) => Math.max(holdFor(...a), Math.round((camp?.revealLeft?.() || 0) * 1000) + 500);
const STEP_SOUND = { name: 'qName', origin: 'qLand', born: 'qBorn', body: 'qClass', heart: 'qHeart', enemy: 'qEnemy' };

/* ---------- prompt and the reward beat ---------- */
/* Headlines are one line: the font steps down until the line fits; the long words go in the sub-line. */
function fitLine(h) {
  h.style.fontSize = '';
  let size = parseFloat(getComputedStyle(h).fontSize);
  while (h.scrollWidth > h.clientWidth + 1 && size > 22) { size -= 1; h.style.fontSize = `${size}px`; }
}
function prompt(title, sub) {
  const h = $('prompt').querySelector('h2');
  $('prompt').classList.remove('hidden'); h.classList.remove('wait', 'stamp');
  h.textContent = title; $('prompt').querySelector('p').textContent = sub || ''; fitLine(h);
  $('asked').textContent = '';
}
/* a Sage2 call in flight. After 0.3 s a quiet line with a moving bar shows; after 4 s it says the call is slow.
   It never blocks input, and a failed call falls back (runStep, runForge). */
let thinkT = 0; let thinkSlowT = 0;
function thinking(on, forge = false) {
  const el = $('think'); if (!el) return;
  clearTimeout(thinkT); clearTimeout(thinkSlowT);
  if (!on) { el.classList.remove('on', 'slow'); return; }
  el.querySelector('span').textContent = forge ? 'Sage2 is reading the weapon' : 'Sage2 is reading your answer';
  thinkT = setTimeout(() => el.classList.add('on'), 300);
  thinkSlowT = setTimeout(() => { el.classList.add('slow'); el.querySelector('span').textContent = forge ? 'The iron is still in the fire' : 'Sage2 is still reading'; }, 4000); /* no apology line */
}
/* the answer lands: the headline stamps in with a sound */
function stamp(title, sub, el = $('prompt'), sound = 'piece') {
  const h = el.querySelector('h2');
  h.classList.remove('wait', 'stamp'); void h.offsetWidth;
  h.textContent = title; el.querySelector('p').textContent = sub || ''; fitLine(h); h.classList.add('stamp'); CX?.result();
  /* the question stays in small type above the result, so a clip reads: question, your words, what it became */
  /* the question is not repeated above its answer (the player's words in quotes sit right under it) */
  if (sound) sfx(sound);
}
/* the player's words lift out of the field and stay in quotes */
function lift(text, target = $('said')) {
  const from = ($('typed').classList.contains('hidden') ? $('listen') : $('typed')).getBoundingClientRect();
  const q = `“${clip(text, 150)}”`;
  target.textContent = q; target.style.opacity = '0';
  const to = target.getBoundingClientRect();
  const fly = document.createElement('div'); fly.className = 'flyer'; fly.textContent = `“${clip(text, 70)}”`;
  fly.style.left = '0'; fly.style.top = '0'; document.body.appendChild(fly);
  const fw = fly.getBoundingClientRect();
  const x0 = from.left + 20; const y0 = from.top + (from.height - fw.height) / 2;
  const x1 = to.left + to.width / 2 - fw.width / 2; const y1 = to.top;
  const anim = fly.animate([
    { transform: `translate(${x0}px, ${y0}px)`, opacity: 0.9 },
    { transform: `translate(${x1}px, ${y1}px)`, opacity: 1, offset: 0.82 },
    { transform: `translate(${x1}px, ${y1}px)`, opacity: 0 },
  ], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 620, easing: 'cubic-bezier(.3,.7,.2,1)' });
  setTimeout(() => target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' }), 480);
  anim.onfinish = () => { fly.remove(); target.style.opacity = ''; };
}
function dots() {
  $('dots').innerHTML = STEPS.map((s, i) => `<i class="${i < S.step ? 'done' : i === S.step ? 'now' : ''}"></i>`).join('') + `<span>${Math.min(S.step + 1, STEPS.length)} of ${STEPS.length}</span>`;
  $('dots').setAttribute('aria-label', `Question ${Math.min(S.step + 1, STEPS.length)} of ${STEPS.length}`);
}
function setStage(name) {
  for (const c of [...document.body.classList]) if (c.startsWith('st-')) document.body.classList.remove(c);
  document.body.classList.add(`st-${name}`);
  world._quality?.log?.(`stage ${name}`); /* one console line per stage (fps, render size, tier, gpu) */
}

/* ---------- HUD (the fight calls these) ---------- */
/* hide an element at once, with no fade (a fading line under a new one read as a ghost) */
function cutNow(el, fn) { el.style.transition = 'none'; fn(); void el.offsetWidth; el.style.transition = ''; }
let hintTimer = null; let boonT = 0; let legendStarted = false; let wasReady = false;
/* hint-free mode. H (or &hints=0 in the URL) hides the control strip and the tutorial prompts ("E · ...",
   "Click to walk on"); combat cues, toasts and titles stay. The default shows them. */
let cleanHud = new URLSearchParams(location.search).get('hints') === '0';
function setClean(on) { cleanHud = on; document.body.classList.toggle('nohints', on); if (on) { $('legend').classList.remove('on'); if ($('hint').dataset.tut) quietHint(); } }
if (cleanHud) document.body.classList.add('nohints');
window.addEventListener('keydown', (e) => { if (e.code !== 'KeyH' || e.repeat || /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return; setClean(!cleanHud); });
function hint(text, ms = 1600, tut = false) {
  if (S.stage === 'card' || document.body.classList.contains('cine')) return;
  if (tut && cleanHud) return;
  say(tut ? 'tut' : 'toast', text, '', ms);
}
function showHint(text, tut) {
  $('hint').dataset.tut = tut ? '1' : '';
  const h = $('hint'); h.textContent = text; h.classList.add('on'); $('legend').style.opacity = '0';
}
function hideHint() { clearTimeout(hintTimer); $('hint').classList.remove('on'); $('legend').style.opacity = ''; }
function quietHint() { hideHint(); if (SAY.cur && (SAY.cur.kind === 'toast' || SAY.cur.kind === 'tut')) endSay(); SAY.q = SAY.q.filter((m) => m.kind !== 'tut'); }

/* ---------- ONE centre message at a time ----------
   A title (#banner), a narration line (#line) and a toast or tutorial prompt (#hint) never show together (they could stack in
   a boss phase). Each message has a priority and a min and max hold;
   a message that arrives while another is up either takes over (higher priority, or the same after the min hold) or
   waits in a short queue and goes stale. A message never repeats one still on screen or said a moment ago, and a sub-line
   that the objective already shows is dropped ("Run it down before it reaches the Lord" showed twice). The slot (high,
   under the boss bar, or low, over the vitals) is the one that keeps clear of the boss's head and the target plate. */
const SAY = { cur: null, q: [], timer: 0, recent: new Map() };
const PRIO = { title: 3, line: 2, toast: 1, tut: 0 };
/* a message the player must read stays 0.35 s a word and never under 2.5 s; a toast is a word or two and keeps its short time */
const HOLD = { title: [2.5, 5], line: [2.5, 7], toast: [1.2, 2.4], tut: [1.0, 4.0] }; /* seconds */
const READ = { title: 1, line: 1 };
const STALE = { title: 2.5, line: 8, toast: 1.8, tut: 3 };
const norm = (t) => String(t || '').toLowerCase().replace(/\s*·.*$/, '').replace(/[“”"'.,!?…:]/g, '').replace(/\s+/g, ' ').trim();
/* the same words: equal, or one starts with most of the other ("Run it down ... · 9 m"); never a short boss name ("The Baron" is not "The Baron stands up again") */
const twin = (g, n) => g === n || (g.startsWith(n) && n.length >= 12) || (n.startsWith(g) && g.length >= n.length * 0.7);
function goalTexts() {
  const out = [];
  for (const el of document.querySelectorAll('#labels .boss-ui em, #labels .boss-ui span, #labels > .goal-ui > div')) { const t = norm(el.textContent); if (t) out.push(t); }
  return out;
}
/* class hooks for HUD parts other modules build with inline styles only (journey.js goal block and its
   direction mark, ranged.js rounds pill), read from the style object when they are added, so index.html styles classes */
new MutationObserver((list) => { for (const m of list) for (const el of m.addedNodes) { if (el.nodeType !== 1 || el.className) continue; const st = el.style;
  if (st.position !== 'fixed') continue;
  if (st.top === '20px' && st.left === '50%') el.classList.add('goal-ui');
  else if (st.top === '76px') el.classList.add('goal-mark');
  else if (/26px/.test(st.left) && /22px/.test(st.top)) el.classList.add('ranged-pill'); } }).observe($('labels'), { childList: true });
/* screen boxes the message must keep off: the boss's head (or its top), the boss foe's head, the target plate */
const _zv = new THREE.Vector3();
function threatBoxes() {
  const f = window.__sq?.fight; const out = []; const cam = f?.world?.camera; if (!f || !cam) return out;
  const W = innerWidth; const H = innerHeight; const k = H / (2 * Math.tan((cam.fov * Math.PI) / 360));
  const add = (p, r) => { _zv.copy(p).project(cam); if (_zv.z >= 1 || Math.abs(_zv.x) > 1.15 || Math.abs(_zv.y) > 1.15) return; const d = Math.max(0.8, p.distanceTo(cam.position)); const px = Math.max(60, Math.min(320, (r * k) / d)); const x = (_zv.x * 0.5 + 0.5) * W; const y = (-_zv.y * 0.5 + 0.5) * H; out.push({ l: x - px, r: x + px, t: y - px, b: y + px * 1.2 }); };
  try {
    if (f.boss && !f.boss.dead) { const hs = f.boss.hittable?.() || []; let top = null; for (const h of hs) if (h?.pos && (!top || h.pos.y > top.pos.y)) top = h; const head = hs.find((h) => h?.part === 'head') || top; if (head) add(head.pos, (head.radius ?? head.r ?? 0.8) * 1.6); }
    const bf = f.bossFoe; if (bf && bf.state !== 'dead' && bf.pos) { const gy = f.journey?.gy ? f.journey.gy(bf.pos.x, bf.pos.z) : 0; add(_zv.set(bf.pos.x, gy + 2.3 * (bf.scale || 1), bf.pos.z).clone(), 0.75 * (bf.scale || 1)); }
  } catch { /* a boss between states */ }
  for (const el of document.querySelectorAll('#labels .target-ui')) { if (el.style.display !== 'block') continue; const r = el.getBoundingClientRect(); if (r.width) out.push({ l: r.left, r: r.right, t: r.top, b: r.bottom }); }
  return out;
}
function pickZone(pref) {
  const H = innerHeight; const W = innerWidth;
  const slots = { high: { l: W / 2 - 460, r: W / 2 + 460, t: H * 0.17, b: H * 0.17 + 130 }, low: { l: W / 2 - 460, r: W / 2 + 460, t: H - 120 - 120, b: H - 120 } };
  const boxes = threatBoxes(); const hit = (s) => boxes.some((b) => b.l < s.r && b.r > s.l && b.t < s.b && b.b > s.t);
  const other = pref === 'high' ? 'low' : 'high';
  return hit(slots[pref]) && !hit(slots[other]) ? other : pref;
}
function showSay(m) {
  if (m.kind === 'title') {
    const b = $('banner'); b.querySelector('b').textContent = m.text; b.querySelector('span').textContent = m.sub || '';
    b.classList.toggle('z-low', pickZone('high') === 'low'); b.style.opacity = '1'; document.body.classList.add('titling');
  } else if (m.kind === 'line') {
    const l = $('line'); l.querySelector('b').textContent = m.text || ''; l.querySelector('span').textContent = m.sub || '';
    l.classList.toggle('z-high', pickZone('low') === 'high'); l.classList.add('on'); document.body.classList.add('speaking');
  } else showHint(m.text, m.kind === 'tut');
}
function hideSay(m, now = false) {
  if (!m) return;
  if (m.kind === 'title') { const b = $('banner'); const f = () => { b.style.opacity = '0'; }; if (now) cutNow(b, f); else f(); document.body.classList.remove('titling'); }
  else if (m.kind === 'line') { const l = $('line'); const f = () => { l.classList.remove('on'); }; if (now) cutNow(l, f); else f(); document.body.classList.remove('speaking'); }
  else if (now) cutNow($('hint'), hideHint); else hideHint();
}
function endSay(now = false) {
  clearTimeout(SAY.timer); const m = SAY.cur; SAY.cur = null; hideSay(m, now);
  /* the next waiting message, best first, after a short breath */
  const t = performance.now(); SAY.q = SAY.q.filter((x) => t - x.at < STALE[x.kind] * 1000);
  if (SAY.q.length) { SAY.q.sort((a, b) => PRIO[b.kind] - PRIO[a.kind] || a.at - b.at); const n = SAY.q.shift(); SAY.timer = setTimeout(() => startSay(n), now ? 0 : 340); }
}
function startSay(m) {
  clearTimeout(SAY.timer); if (SAY.cur && SAY.cur !== m) hideSay(SAY.cur, true);
  SAY.cur = m; m.shown = performance.now(); SAY.recent.set(`${m.kind}|${m.text}`, m.shown);
  showSay(m); SAY.timer = setTimeout(() => endSay(), m.hold * 1000);
  /* the objective may change a moment after the line (the walk sets its goal on the next frame): look again, drop the twin */
  if (m.kind === 'line' && m.sub) setTimeout(() => { if (SAY.cur !== m) return; const n = norm(m.sub); if (goalTexts().some((g) => twin(g, n))) { m.sub = ''; $('line').querySelector('span').textContent = ''; } }, 250);
}
function say(kind, text, sub = '', ms = 2600) {
  text = String(text || ''); sub = String(sub || '');
  if (!text && !sub) return;
  /* the sub-line the objective already shows is not said twice */
  if (sub) { const n = norm(sub); if (n && (goalTexts().some((g) => twin(g, n)) || norm(text).includes(n))) sub = ''; } /* nor a sub-line the line itself says ("Ash on the road" under "Ash from New Orleans...") */
  if (!text && !sub) return;
  const t = performance.now();
  const c = SAY.cur;
  if (c && c.text === text && (c.sub === sub || !sub)) { clearTimeout(SAY.timer); SAY.timer = setTimeout(() => endSay(), Math.max(c.hold * 1000 - (t - c.shown), 900)); return; }
  if (kind !== 'line' && t - (SAY.recent.get(`${kind}|${text}`) || -1e9) < 2500) return;
  if (SAY.q.some((x) => x.text === text)) return;
  const [lo, hi] = HOLD[kind]; const need = READ[kind] ? 0.35 * `${text} ${sub}`.trim().split(/\s+/).length : 0; const m = { kind, text, sub, at: t, hold: Math.min(hi, Math.max(lo, need, (ms || 2600) / 1000)) };
  if (!c) { startSay(m); return; }
  const shown = (t - c.shown) / 1000; const pc = PRIO[c.kind]; const pm = PRIO[kind];
  if (pm > pc || (pm === pc && shown >= (READ[c.kind] ? c.hold - 0.05 : HOLD[c.kind][0]))) { hideSay(c, true); startSay(m); return; } /* a line is read to its end before the next line of its kind */
  /* it waits: one of each kind at most (the newest), never more than three */
  SAY.q = SAY.q.filter((x) => x.kind !== kind); SAY.q.push(m); if (SAY.q.length > 3) SAY.q.shift();
}
function startLegend() {
  if (S.stage === 'card' || legendStarted || document.body.classList.contains('cine') || $('hud').classList.contains('hidden')) return;
  /* the controls show once, early in the first fight, for 7 s at most, and go at the first kill. A fight that opens
     on the boss (a retry, a boss link) and a browser that has seen the strip once skip it. New mechanics speak in the hint lane. */
  legendStarted = true;
  /* the eight-key strip is cut: teach.js gives one lesson at a time and "?" shows the full list */
  const STRIP = false; if (cleanHud || !STRIP) return;
  let seen = false; try { seen = localStorage.getItem('sq.legend') === '1'; } catch { /* private mode */ }
  if (seen || window.__sq.firstWave === 'boss') return;
  $('legend').classList.add('on');
  const done = () => { $('legend').classList.remove('on'); try { localStorage.setItem('sq.legend', '1'); } catch { /* private mode */ } };
  setTimeout(done, 7000); legendOff = done;
}
let legendOff = null;
let lineQ = null; let lineQT = 0;
const hudLast = {};
const hud = {
  show(on) { $('hp-name').textContent = S.name || 'Traveller'; if (on) $('loading').classList.add('hidden'); $('hud').classList.toggle('hidden', !on); $('cross').classList.toggle('hidden', !on); if (on) startLegend(); else $('legend').classList.remove('on'); },
  set({ hp, maxHp, guard, stagger, ability, abilityReady }) {
    /* perf: the HUD is written only when a value changes (it was rewritten every frame: style recalc and layout each frame) */
    const L = hudLast; const hw = `${(Math.max(0, hp / maxHp) * 100).toFixed(1)}%`; if (L.hw !== hw) { L.hw = hw; $('hp').style.width = hw; }
    if (L.st !== !!stagger || L.g !== guard) { L.st = !!stagger; L.g = guard; const pips = $('guard'); pips.classList.toggle('broken', !!stagger); [...pips.children].forEach((el, i) => el.classList.toggle('on', i < guard)); }
    if (L.ab !== ability) { L.ab = ability; $('ability-name').textContent = ability; }
    const aw = `${(Math.max(0, Math.min(1, abilityReady)) * 100).toFixed(1)}%`; if (L.aw !== aw) { L.aw = aw; $('ability-fill').style.width = aw; }
    const ready = abilityReady >= 1; if (L.rd !== ready) { L.rd = ready; $('ability').classList.toggle('ready', ready); }
    if (ready && !wasReady && legendStarted && !$('legend').classList.contains('on')) hint(document.body.classList.contains('touch') ? 'Power ready' : 'E · power ready', 1800, true); /* the power's name shows only in the power bar */
    wasReady = ready;
  },
  /* the control strip goes at the first kill when hints are off (the fight calls this) */
  kill() { if (legendOff) { const f = legendOff; legendOff = null; f(); } },
  /* the view fades to the night colour between the fight and the card (on 1, off 0) */
  /* hold the frame on screen now as a still (it drifts in slowly), so the card can build under it; resolves false when no frame came */
  freeze() { return new Promise((res) => { const cv = $('freeze'); if (!cv) { res(false); return; } const to = setTimeout(() => { world._grab = null; res(false); }, 600);
    world._grab = (src) => { clearTimeout(to); try { cv.width = src.width; cv.height = src.height; cv.getContext('2d').drawImage(src, 0, 0); cv.style.transition = 'none'; cv.style.opacity = '1'; cv.classList.add('on'); res(true); } catch (err) { console.warn('freeze', err); res(false); } }; }); },
  unfreeze(ms = 700) { const cv = $('freeze'); if (!cv || !cv.classList.contains('on')) return; cv.style.transition = `opacity ${ms}ms ease`; cv.style.opacity = '0'; setTimeout(() => { if (cv.style.opacity === '0') cv.classList.remove('on'); }, ms + 60); },
  fade(on, ms = 450) { const el = $('fade'); if (!el) return; el.style.transition = `opacity ${ms}ms ease`; el.style.opacity = on ? '1' : '0'; },
  banner(title, sub) {
    if (S.stage === 'card') return;
    /* one spelling for the enemy's people: "Clerks" in the banner, as in the feed */
    if (S.minions && sub) sub = sub.replace(new RegExp(`\\b${S.minions.many}\\b`, 'gi'), S.minions.many);
    /* while a title shows, the companions' name tags wait (fight.js labelFloor reads body.titling).
       the title goes through the one-message queue (say): it takes over a line or a toast at once */
    say('title', title, sub, 2200); },
  /* "Executed" floated over the kill and read as debug text: the kill shows it */
  /* a toast the boss note already shows is not said twice ("Turned back" stacked) */
  toast(text) { if (/^Executed$/.test(text)) return; if ([...document.querySelectorAll('.boss-ui small.on')].some((n) => n.textContent === text)) return; hint(text, 1500); },
  hurt() {},
  /* one large centred line, an optional sub-line under it */
  line(text, sub = '', ms = 2600) {
    if (S.stage === 'card') return;
    /* an empty line clears the line now (a death cut, a cinema shot), and the lines still waiting */
    if (!text && !sub) { SAY.q = SAY.q.filter((m) => m.kind !== 'line'); lineQ = null; if (SAY.cur?.kind === 'line') endSay(true); return; }
    /* one story text at a time: a line that comes while a chapter card or the camp answer is up waits for it
       to go (a line, the Sage2 note, the gift line and the chapter III card stacked) */
    if ((document.body.classList.contains('chap') || S.camping) && (text || sub)) { lineQ = { text, sub, ms }; clearTimeout(lineQT); lineQT = setTimeout(function again() { if (document.body.classList.contains('chap') || S.camping) { lineQT = setTimeout(again, 250); return; } const q = lineQ; lineQ = null; if (q) hud.line(q.text, q.sub, q.ms); }, 250); return; }
    /* through the one-message queue (say) */
    say('line', text, sub, ms);
  },
  /* a chapter card: numeral, title, line, letterbox bars in and out; resolves when it has played */
  /* a card is its numeral and title; the task is the objective that follows. One line shows only where the
     story sets `card` (chapter II: who sends them; chapter III: what the body is) */
  chapter({ numeral, title, card } = {}) { const line = card || '';
    if (S.stage === 'card') return Promise.resolve();
    if (numeral === 'I' && S.stage === 'fight' && S.fight?.story && qcFor !== S.fight) { qcFor = S.fight; return questCard(S.fight); } /* chapter I is the "HERE'S YOUR QUEST!" card (web/src/quest-reveal.js) */
    return new Promise((resolve) => {
      $('loading').classList.add('hidden');
      const el = $('chapter'); const cine = document.body.classList.contains('cine');
      el.querySelector('.num').textContent = numeral || ''; el.querySelector('h2').textContent = title || ''; el.querySelector('p').textContent = line || '';
      document.body.classList.add('cine'); quietHint();
      /* the card is the only text on screen while it shows */
      /* the queue empties too: nothing waits to speak over the card */
      SAY.q = []; if (SAY.cur) endSay(true);
      requestAnimationFrame(() => el.classList.add('on'));
      /* while a chapter card shows, the boss bar waits (its title would read twice, ghosted under the card) */
      document.body.classList.add('chap');
      /* the card stays its reading time: 2.7 s for a title, 0.35 s a word more when it carries a line */
      const cardMs = Math.max(2700, 800 + 350 * wordsOf(`${title || ''} ${line}`));
      setTimeout(() => el.classList.remove('on'), cardMs);
      setTimeout(() => { document.body.classList.remove('chap'); if (!cine || S.stage === 'card') unCine(); startLegend(); resolve(); }, cardMs + 550);
    });
  },
  cinema(on) { if (S.stage === 'card') return; if (on) { clearTimeout(unCineT); document.body.classList.remove('uncine'); document.body.classList.add('cine'); quietHint(); } else { unCine(); startLegend(); } },
  /* the gift shows whole for 6 s (its name and what it does), then its box goes and only the name stays, by the
     hero's name ("Rowan · Wren's Oath · First light"); the box stayed up through the whole boss fight and crowded the corner */
  boon(label, note) {
    const b = $('boon'); clearTimeout(boonT); b.classList.remove('gone'); b.classList.toggle('hidden', !label);
    $('who-boon').textContent = '';
    if (label) { b.querySelector('b').textContent = label; b.querySelector('span').textContent = note || ''; boonT = setTimeout(() => { b.classList.add('gone'); boonT = setTimeout(() => { b.classList.add('hidden'); $('who-boon').textContent = `· ${label}`; }, 520); }, 6000); }
  },
};
window.__sq.hud = hud;
/* "HERE'S YOUR QUEST!" (web/src/quest-reveal.js, lazy): the run's goal in one line over the enemy, then the world */
let qcFor = null; let qcP = null; const qcMod = () => (qcP ??= import('./quest-reveal.js'));
/* the chapter promise resolves once the goal is read (about 1.2 s in): the walk builds under the card, and the card's end
   uncovers its objective. The body stays 'chap' (lines wait, marks hide) until the card is gone. */
function questCard(f) {
  $('loading').classList.add('hidden'); document.body.classList.add('cine', 'chap', 'qcard'); quietHint(); SAY.q = []; if (SAY.cur) endSay(true);
  return new Promise((handOn) => {
    const end = () => { document.body.classList.remove('chap', 'cine', 'qcard'); startLegend(); handOn(); }; /* a hard cut: the card covered the bars, so the HUD and the objective are there at once (no uncine fade) */
    qcMod().then((m) => m.questReveal({ world, story: f.story, enemyWords: S.enemy || f.enemyWords || '', ww: f.ww, tint: coverTint(), onLanded: handOn })).catch((err) => { console.warn('questcard', err); qcP = null; }).finally(end);
  });
}
/* tests read the camp scene (companion spots, labels) */
Object.defineProperty(window.__sq, 'camp', { get: () => camp, configurable: true });

/* ---------- the hero in third person ---------- */
function shapeHero() {
  if (!S.hero) return;
  const b = Math.max(1, Math.min(4, S.build));
  const wide = 0.9 + (b - 1) * 0.085;
  const tall = S.age ? (S.age.age < 25 ? 0.95 : S.age.age >= 60 ? 0.96 : 1) : 1;
  S.hero.root.scale.set(wide, tall, wide);
}
async function setHero(model, bare) {
  const url = KNIGHT_URL;
  const actor = await makeActor(url);
  /* One kit: the same knight for every archetype, with different parts (camp.js HERO_LOOKS); a world may give its own look */
  const wlook = !bare ? (S.archetype?.model === model ? S.archetype.look || null : null) : (S.world !== 'dark' ? worldById(S.world).traveller || null : null);
  if (wlook?.wear && worldWear()) await actor.wear(worldWear());
  await dressHero(actor, model, bare, wlook); /* resolves when the real body is on (web/src/bodies.js) */
  actor.play(bare ? 'Unarmed_Idle' : 'Idle');
  if (S.hero) S.hero.dispose();
  S.hero = actor; S.heroUrl = url; S.heroBare = bare; camp?.setHero(actor);
  world.scene.add(actor.root);
  /* the title shows the hooded traveller by the fire from the first frame; only the first-person fight hides the body */
  if (S.stage === 'fight') actor.root.visible = false;
  shapeHero();
  if (S.gearOnHero) attachGear();
  return actor;
}
async function attachGear() {
  const hand = S.hero?.slot('handslotr'); if (!hand || !S.weapon) return;
  const { styleGear } = await fightMod(); /* lazy fight.js */
  for (const slot of ['handslotr', 'handslotl', 'armslotl']) { const h = S.hero.slot(slot); if (h) [...h.children].filter((c) => c.userData.forged).forEach((c) => c.removeFromParent()); }
  const g = styleGear(await makeGear(S.weapon.gear), S.material, S.element); g.userData.forged = true;
  const light = new THREE.PointLight(S.element.color, 3.5, 8, 2); light.position.set(0, 0.8, 0); g.add(light);
  hand.add(g);
  if (S.weapon.offhand) {
    const off = styleGear(await makeGear(S.weapon.offhand), S.material, S.weapon.offhand === 'dagger' ? S.element : null); off.userData.forged = true;
    if (isShield(S.weapon.offhand)) { mountGear(off, S.weapon.offhand); S.hero.slot('armslotl')?.add(off); } else S.hero.slot('handslotl')?.add(off);
  }
  S.gearOnHero = true;
  /* the hero stands in its weapon's pose (world.js holdHero) unless the forge cheer is playing: its timer does it then */
  if (S.hero && S.hero.current !== 'Cheer') holdHero(S.hero, S.weapon);
}

/* ---------- camera for the third-person stages (title, build, card): all camera code lives here ----------
   The camp names an orbit per step; the rig fits the distance and a screen shift so the stone, the hero and the fire
   sit in the clear band: under the headline and its quote, over the sentence strip, left of the feed. */
const rig = new CamRig(world.camera);
let shotId = null;
const rectOf = (el, pad = 0) => { if (!el || el.classList.contains('hidden') || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null; return { x0: r.left - pad, y0: r.top - pad, x1: r.right + pad, y1: r.bottom + pad }; };
/* the band and the no-fly boxes, measured from the DOM as it stands */
function layoutNow() {
  const W = innerWidth; const H = innerHeight; const noFly = [];
  const push = (r) => { if (r) noFly.push(r); };
  if (S.stage === 'title') {
    const box = rectOf($('title').querySelector('.box'), 28); const mark = rectOf($('title').querySelector('.mark'), 20);
    push(box); push(mark);
    return { W, H, noFly, band: { x0: Math.max(box ? box.x1 + 8 : 0, W * 0.44), x1: W - 32, y0: 64, y1: H - 56 } };
  }
  if (S.stage === 'card') {
    const c = $('card-img').getBoundingClientRect(); const k = c.width / CW; const L = card?.L;
    const win = L ? L.textTop : CH * 0.55;
    push({ x0: c.left, y0: c.top + win * k - 8, x1: c.right, y1: c.bottom }); push(rectOf($('card-side'), 12));
    return { W, H, noFly, band: { x0: c.left + 12, x1: c.right - 12, y0: c.top + 12, y1: c.top + win * k } };
  }
  /* the build: the headline zone keeps room for its sub-line and the echo quote, so the band never jumps */
  const pr = $('prompt').getBoundingClientRect(); const h2 = $('prompt').querySelector('h2').getBoundingClientRect();
  const sub = $('prompt').querySelector('p').getBoundingClientRect();
  const headBottom = Math.max(pr.bottom, h2.bottom + Math.max(26, sub.height) + 10 + 44);
  push({ x0: pr.left - 40, y0: Math.max(0, pr.top - 40), x1: pr.right + 40, y1: pr.bottom + 40 });
  push(rectOf($('dots'), 12));
  const feed = rectOf($('feed'), 16); push(feed);
  const dock = rectOf($('dock'), 24); push(CX && document.body.classList.contains('watching') ? null : dock); /* a hidden field cut a hard dark box out of the fog */
  const field = $('field').getBoundingClientRect();
  /* the growing sentence: room for two lines, or more when it already runs longer (1280 wide at the forge) */
  const tale = $('tale').getBoundingClientRect();
  const fieldTop = CX && field.height === 0 ? Infinity : field.top; /* on the build screen the field is gone (its top read 0, so the band ran upside down and the hero rose into the headline) */
  const dockTop = Math.min(fieldTop - 2 * 29 - 16 - 14, tale.height > 0 ? tale.top - 14 : Infinity);
  /* on a phone the Sage2 panel is a slim line across the top (touch.js), not a column at the right: the band keeps the full width */
  const feedSide = feed && feed.x1 - feed.x0 < W * 0.6;
  const y1 = Math.min(dockTop, dock ? dock.y0 : H) - 10; const y0 = Math.max(headBottom + 24, pr.bottom + 44);
  return { W, H, noFly, band: { x0: 24, x1: feedSide ? feed.x0 - 8 : W - 24, y0: y1 - y0 < 120 ? Math.max(pr.bottom + 8, y1 - 120) : y0, y1 } };
}
/* points the camera at a camp step; snap jumps there, rate sets how fast it moves (the title pushes in slowly) */
let aimedBand = null;
function aimCamera(id, opts = {}) {
  if (!camp) return;
  shotId = id;
  const L = layoutNow(); const spec = CX ? CX.frame(camp.focus(id), L.W, L.H, id) : camp.focus(id); const B = L.band;
  /* the list of what was decided (#rail, left) is not part of the scene's clear band */
  if (S.stage === 'build') { const rl = $('rail'); const on = rl?.querySelector('li.on'); if (on) { let x1 = 0; for (const li of rl.querySelectorAll('li.on')) x1 = Math.max(x1, li.getBoundingClientRect().right); if (x1 > 0 && x1 < L.W * 0.4) B.x0 = Math.max(B.x0, x1 + 14); } }
  const bw = B.x1 - B.x0; const bh = B.y1 - B.y0;
  const box = { x0: B.x0 + spec.box[0] * bw, x1: B.x0 + spec.box[1] * bw, y0: B.y0 + spec.box[2] * bh, y1: B.y0 + spec.box[3] * bh };
  /* a shot holds the hero and what changed (spec.pts), through its own lens, and the hero keeps a floor height */
  const heroPts = spec.minHero || spec.maxHero ? camp.framePoints('hero') : null;
  rig.aim(fitView(world.camera, id === 'card' ? camp.framePoints('card') : camp.shotPoints(spec.pts), box, L.W, L.H, { ...spec, heroPts, minHero: (spec.minHero || 0) * L.H, maxHero: (spec.maxHero || 0) * L.H }), opts);
  aimedBand = { y0: B.y0, y1: B.y1 };
  camp.setLayout(L); camp.setView(rig.targetView(L.W, L.H));
}
/* a companion sat down: fit the camera again so the named ones stay in the clear band */
function reframe() { if (camp && shotId && S.stage !== 'fight') aimCamera(shotId, S.stage === 'card' ? { snap: true } : { rate: 1.2 }); }
/* the camp asks for the camera moves of a reveal and of the final shot (camp.onShot) */
function campShot(id, o) { if (camp && S.stage === 'build') aimCamera(id, o || {}); }
function thirdPerson(dt) {
  if (rig.tgt) { rig.update(dt, innerWidth, innerHeight); return; }
  world.camera.position.set(0, 2.4, 8); world.camera.lookAt(0, 1.3, 0);
}
window.addEventListener('resize', () => { if (shotId && camp && S.stage !== 'fight') aimCamera(shotId, { snap: true }); });

/* ---------- applying a decided part: every answer lands here ---------- */
const apply = {
  name(name) { S.name = name; tell('name'); camp?.name(name); },
  /* the land comes before the birth date now and is built from the seed, so the date no longer moves the seed once a land stands */
  born(r) { S.birth = r.birth; S.sign = r.sign; S.age = r.age; S.signHidden = false; if (!S.biome) S.seed = r.seed; shapeHero(); tell('born'); camp?.born({ birth: r.birth, sign: r.sign, age: r.age }); },
  async archetype(id) {
    const a = byId(K().ARCHETYPES, id); if (!a || (S.archetype?.id === id && !S.heroBare)) return;
    S.archetype = a; world.flash(0.4);
    await setHero(a.model, false); tell('who'); camp?.hero(a, S.build);
    if (mechOf(S.nemesis) === 'twin') { world.nemesisId = null; world.setNemesis('twin', S.heroUrl, S.nemesis.id); }
  },
  /* id = a climate biome id or a world land id; S.biome = the world's land for that climate (landFor), with .climate
     set when it is a world land; a world land that is not registered yet falls back to the dark land */
  biome(id, force = false) {
    const home = landHome(id); if (!home) return;
    const b = byId(BIOMES, home.biome); let land = K().landFor(b.id) || b;
    if (land.id !== b.id && !landKnown(land.id)) land = b;
    if (!force && S.biome?.id === land.id) return;
    S.biome = land;
    world.setBiome(land, S.seed); world.setTone(S.tone); tell('land'); camp?.land(land, S.place);
  },
  /* id = a world nemesis id (edo 'lord') or a mechanics id; the sky and the fight run on n.mech */
  nemesis(id) {
    const n = K().nemesis(id); if (!n || S.nemesis?.id === n.id) return;
    S.nemesis = n;
    world.setNemesis(mechOf(n), S.heroUrl, n.id); tell('enemy'); camp?.enemy(n, S.enemy);
  },
  /* The world (game/worlds/<id>.mjs + web/src/worlds/<id>.js): UI tokens, its 3D module, camp, sounds, then every part
     already chosen is looked up again in the world's kit (same ids, the world's names and looks). */
  async world(id, { quiet = false } = {}) {
    const w = worldById(id); if (S.world === w.id && (S.worldMod || w.id === 'dark')) return;
    S.world = w.id; setWorldUi(w.ui, w.id);
    const mod = await loadWorld(w.id); if (S.world !== w.id) return;
    S.worldMod = mod; registerWorld(mod); registerLands(mod.lands || {});
    camp?.setWorld(w, mod.camp || null); setSfxWorld(w.id, mod.sfxPools || {});
    const k = K();
    const hadLook = S.archetype?.look || null;
    if (S.archetype) S.archetype = byId(k.ARCHETYPES, S.archetype.id) || S.archetype;
    if (S.weapon) S.weapon = byId(k.WEAPONS, S.weapon.id) || S.weapon;
    if (S.material) S.material = byId(k.MATERIALS, S.material.id) || S.material;
    if (S.element) S.element = byId(k.ELEMENTS, S.element.id) || S.element;
    if (S.nemesis) { const n = k.nemesis(S.nemesis.id) || k.nemesis(mechOf(S.nemesis)); if (n && n.id !== S.nemesis.id) { S.nemesis = null; apply.nemesis(n.id); } else if (n) { S.nemesis = n; world.nemesisId = null; world.setNemesis(mechOf(n), S.heroUrl, n.id); } }
    if (S.biome) apply.biome(S.biome.climate || S.biome.id, true);
    if (S.hero && !S.heroBare && S.archetype && (S.archetype.look || hadLook)) { world.flash(0.4); await setHero(S.archetype.model, false); }
    else if (S.hero && S.heroBare) await setHero('Knight', true); /* the world's traveller (or the shared hooded one) */
    if (!quiet) tell('world');
    relabelFeed(); if (S.gearOnHero) await attachGear();
    worldChips();
  },
  motive(id) { const m = byId(MOTIVES, id); if (!m) return; S.motive = m; PW.setPower(m.id, S.mentions, S.answers?.heart); tell('who'); camp?.heart(S.mentions, m, S.desire); },
  async weapon({ weapon, material, element, mention }) {
    /* a world weapon may have a second model for the player's own word (frontier: a fork or a trident gets the pitchfork, a spear gets a spear) */
    if (weapon?.alt && new RegExp(`\\b(${weapon.alt.words})s?\\b`, 'i').test(S.answers?.weapon || '')) weapon = { ...weapon, label: weapon.alt.label, gear: weapon.alt.gear };
    S.weapon = weapon; S.material = material; S.element = element;
    S.weaponName = mention ? NAME_BY_MOTIVE[(S.motive || MOTIVES[0]).id].replace('{x}', cap(mention.text)) : K().weaponNames[element.id];
    tell('weapon');
    await attachGear(); camp?.weapon(weapon, material, element, S.weaponName);
  },
};
const NAME_BY_MOTIVE = { protect: "{x}'s Oath", revenge: "{x}'s Reckoning", glory: "{x}'s Triumph", freedom: "{x}'s Wing", wonder: "{x}'s Question" };
/* the mechanic a nemesis runs on: a world nemesis carries mech, a dark one is its own */
const mechOf = (n) => (n ? n.mech || n.id : null);
/* the world's UI: CSS colour and font tokens, and the font link only when a world asks for one */
const UI_VARS = { night: '--night', cream: '--cream', ember: '--ember', serif: '--serif', sans: '--sans' }; /* ui.sans: the HUD and body font of a world */
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
/* daylight worlds: white and gold HUD text needs a dark backing on a bright sky. A world sets ui.day; frontier and storybook are day by default */
const DAY_WORLDS = new Set(['frontier', 'storybook']);
function setWorldUi(ui, id = 'dark') {
  const st = document.documentElement.style;
  document.body.classList.toggle('day', ui?.day ?? DAY_WORLDS.has(id));
  /* the dim behind the share card follows the world's card block (dark: near black at .82) */
  { const cb = id !== 'dark' ? ui?.card || CARD_DEFAULTS[id] : null; if (cb?.dim != null) st.setProperty('--card-dim', String(cb.dim)); else st.removeProperty('--card-dim'); const dc = hexRgb(cb?.dimColor); if (dc) st.setProperty('--card-dim-rgb', dc); else st.removeProperty('--card-dim-rgb'); }
  for (const [k, v] of Object.entries(UI_VARS)) { if (ui && ui[k]) st.setProperty(v, ui[k]); else st.removeProperty(v); }
  /* rgb channel twins for the rgba(var(--x-rgb),a) washes in index.html */
  for (const k of ['night', 'cream', 'ember']) { const c = ui && hexRgb(ui[k]); if (c) st.setProperty(`--${k}-rgb`, c); else st.removeProperty(`--${k}-rgb`); }
  let link = document.getElementById('world-font');
  if (ui?.font) { if (!link) { link = document.createElement('link'); link.id = 'world-font'; link.rel = 'stylesheet'; document.head.appendChild(link); } const href = `https://fonts.googleapis.com/css2?family=${ui.font}&display=swap`; if (link.href !== href) link.href = href; }
}
/* a world change loads a module and rebuilds the camp (one long frame, ~0.9 s). It happens under a deliberate
   beat: the screen goes to night with the world's name, the work runs under it, then the new camp fades in. */
async function worldTurn(id) {
  const el = $('turn'); const w = worldById(id);
  if (!el || S.world === w.id) return apply.world(id);
  el.querySelector('b').textContent = w.label; el.querySelector('span').textContent = 'Sage2 picked your world';
  el.classList.add('on');
  await wait(320); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try { await apply.world(id); } catch (err) { console.warn('world', err); }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait(450);
  el.classList.remove('on');
}
window.__sq.worldTurn = worldTurn;
/* test hook (tools): what the forge makes of one /api/act answer, in the current world */
window.__sq.readForge = (res, text) => { const fr = readForge(res, text); const wl = shortLabel(fr.weapon.label); return { kind: fr.kind, weapon: fr.word ? wordWeapon(fr.word, fr.weapon.label) : wl, material: fr.material.label, element: fr.element.label, unsure: !!fr.unsure, leadP: fr.leadP ?? null }; };
/* "Another world": a quiet link that opens five chips; the player may change the world until the enemy step ends */
let chipsOpen = false;
function worldChips() {
  let box = $('worlds');
  if (!box) {
    box = document.createElement('div'); box.id = 'worlds'; box.className = 'hidden';
    box.innerHTML = '<button class="link" id="worlds-open" type="button">Pick another world</button><span class="chips"></span>';
    document.body.appendChild(box);
    box.querySelector('#worlds-open').addEventListener('click', () => { chipsOpen = !chipsOpen; worldChips(); });
  }
  const enemyAt = STEPS.findIndex((x) => x.id === 'enemy'); const bodyAt = STEPS.findIndex((x) => x.id === 'body');
  void enemyAt; void bodyAt; /* the link is off during the steps; the final screen's "Change the weapon or the world" opens the chips */
  const on = S.stage === 'build' && !S.quick && S.rebuild && STEPS[S.step]?.id === 'weapon';
  box.classList.toggle('hidden', !on);
  const chips = box.querySelector?.('.chips'); if (!chips) return; chips.textContent = ''; /* a DOM shim (snap tools) has no chips */
  if (!on || !chipsOpen) return;
  for (const w of WORLDS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = `chip${w.id === S.world ? ' on' : ''}`; b.textContent = w.label;
    b.addEventListener('click', () => { S.worldPicked = true; chipsOpen = false; worldTurn(w.id); });
    chips.appendChild(b);
  }
}

/* ---------- the stream reads the step while the player speaks (logged in the feed; the scene waits for Enter) ---------- */
let stable = null; let onboard = null;
function onDecision(m) {
  const step = STEPS[S.step];
  if (S.stage !== 'build' || !step || m.step !== step.id || !step.live) return;
  stable?.(m.answers[step.live]);
}

/* ---------- what the player is saying ---------- */
function renderTranscript() {
  const t = $('transcript'); t.textContent = '';
  if (!S.committed && !S.interim) { const ph = document.createElement('span'); ph.className = 'ph'; ph.textContent = S.camping ? 'Listening' : `Listening. Try: ${STEPS[S.step]?.eg || ''}`; t.append(ph); return; }
  if (S.committed) { const c = document.createElement('span'); c.textContent = S.committed; t.append(c); }
  if (S.interim) { const s = document.createElement('span'); s.className = 'interim'; s.textContent = S.interim; t.append(s); }
}
/* Interim speech changes its last words. Hold two words back so the stream sees stable text. */
function streamText() {
  const words = S.interim.split(' ').filter(Boolean);
  const held = S.mode === 'voice' ? words.slice(0, Math.max(0, words.length - 2)).join(' ') : S.interim;
  return [S.committed, held].filter(Boolean).join(' ').trim();
}
function pushText() {
  renderTranscript(); campQuiet();
  const step = STEPS[S.step];
  if (S.stage === 'build' && step && camp) camp.typing(step.id, [S.committed, S.interim].filter(Boolean).join(' '));
  if (S.stage === 'build' && step?.live && onboard) { const t = streamText(); if (t) onboard.text(step.id, t, S.world); }
}
let finalTimer = null;
function onFinal() {
  clearTimeout(finalTimer); clearTimeout(S.advanceTimer);
  /* speech may still add a last phrase; a typed answer goes at once */
  finalTimer = setTimeout(() => {
    if (S.camping) return campSubmit();
    if (S.stage !== 'build') return;
    if (STEPS[S.step].id === 'weapon') runForge(); else runStep();
  }, S.mode === 'voice' && !finalNow ? 450 : 0);
  finalNow = false;
}
/* the forge's own light beat: a warm bloom from the fire that fades in under a second (world.flash is now a short tick) */
function forgeBeat() { const el = $('forge-beat'); if (!el) return; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
function clearAnswer() { S.committed = ''; S.interim = ''; $('typed').value = ''; keyedAt = 0; spokenTake = false; renderTranscript(); }

/* weapon ideas from local templates over the known answers (no Sage2 call) */
function weaponIdeas() {
  const out = []; const land = S.biome?.label; const heart = S.answers?.heart || ''; const foe = S.nemesis?.label;
  const rel = /\bmy (brother|sister|mother|mom|father|dad|grandmother|grandma|grandfather|grandpa|friend|wife|husband|partner|son|daughter|uncle|aunt)\b/i.exec(heart)?.[1];
  if (land) out.push(`A harpoon from ${/^the /i.test(land) ? land.replace(/^The /, 'the ') : 'the ' + land}`);
  out.push(rel ? `My ${rel.toLowerCase()}'s old hammer` : 'An old hammer from home');
  out.push(foe ? `A blade of cold fog to fell ${/^(the|a|an) /i.test(foe) ? foe.replace(/^(The|A|An) /, (m) => m.toLowerCase()) : 'the ' + foe}` : 'A blade of cold fog');
  return out;
}
/* ---------- the build: one question per step ---------- */
function showStep(i) {
  /* camp hook: a step starts here (the camp scene may move its camera or light per step.id) */
  clearTimeout(S.advanceTimer); clearTimeout(finalTimer); S.holding = false; thinking(false); watching(false);
  S.step = i; S.seq++;
  const step = STEPS[i];
  clearAnswer(); hideAsk(); $('said').textContent = ''; CX?.step();
  if (CX && step.id === 'weapon') CX.ideas?.(weaponIdeas()); /* three ideas from the player's own answers, for a player with no idea */
  prompt(step.ask, step.hint); dots();
  camp?.clearText();
  aimCamera(step.id);
  /* the scene changes when the answer lands (the link), not while it is typed: a half-typed answer showed a wrong land */
  stable = null; if (i > 0 && S.name && !S.railName) { S.railName = true; rail(); }
  document.body.classList.remove('built', 'clean');
  $('typed').placeholder = step.eg; renderTranscript();
  $('skip').classList.toggle('hidden', step.id === 'weapon' && !!S.weapon);
  $('skip').textContent = step.id === 'weapon' ? 'Standard weapon' : 'Skip';
  $('back')?.classList.toggle('hidden', i === 0);
  $('go').textContent = 'Start quest';
  $('go').classList.toggle('hidden', !(step.id === 'weapon' && S.weapon));
  underKeys();
  worldChips();
  if (step.id === 'weapon') { S.hero?.play('Interact', { loop: false }); setTimeout(() => S.hero?.play('Idle'), 1200); loadGLB(KNIGHT_URL); }
  $('typed').classList.remove('hidden'); $('typed').focus();
}
function advance(delay = 1500) {
  clearTimeout(S.advanceTimer);
  const mine = S.seq;
  S.holding = true;
  const ms = Math.max(delay, Math.round((camp?.revealLeft?.() || 0) * 1000) + 300); CX?.hold(ms);
  S.advanceTimer = setTimeout(() => { S.holding = false; if (mine === S.seq && S.stage === 'build' && S.step < STEPS.length - 1) showStep(S.step + 1); }, ms);
}
function again(step, note) { watching(false); $('said').textContent = ''; prompt(step.ask, note); $('typed').placeholder = step.eg; $('typed').focus(); }
function hideAsk() { clearTimeout(askTimer); $('ask').classList.add('hidden'); $('ask').innerHTML = ''; }

/* A real near-tie is a question back to the player: the top two as buttons; the leader is taken after 4 s. */
const STOP = new Set('and the all day night with that this for from but have just like really very some they them their what when then into also about only been were will would there here your mine its our out over most more much many lot lots work works working'.split(' '));
function saidWords(text, one, two) {
  const words = (String(text).toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP.has(w));
  const hit = (opt) => { const fits = opt.fits.toLowerCase().split(/[^a-z]+/); return words.find((w) => fits.some((f) => f.length >= 4 && (f.startsWith(w.slice(0, 4)) && w.startsWith(f.slice(0, 4))))); };
  const a = hit(one); const b = hit(two);
  if (a && b && a !== b) return `You said ${a} and ${b}.`;
  if (a || b) return `You said ${a || b}.`;
  return `You said “${clip(text, 60)}”.`;
}
let askTimer = null;
function askBetween(kind, a, stepId) {
  const listOf = LISTS[kind]; const find = (id) => (kind === 'biome' ? K().landFor(id) : kind === 'nemesis' ? K().nemesis(id) : byId(listOf, id));
  const one = find(a.lead); const two = find(a.second);
  if (!one || !two) return false;
  const name = (o) => (kind === 'archetype' ? bare(o.label) : o.label);
  const box = $('ask'); box.innerHTML = ''; box.classList.remove('hidden'); watching(false);
  const mine = S.seq; let done = false;
  const pick = (opt) => { if (done || mine !== S.seq) return; done = true; hideAsk(); landStep(stepId, opt.id); };
  for (const opt of [one, two]) {
    const b = document.createElement('button'); b.className = `btn${opt === one ? ' primary' : ''}`; b.textContent = name(opt);
    if (opt === one) b.insertAdjacentHTML('beforeend', '<i class="timer"></i>');
    b.addEventListener('click', () => pick(opt));
    box.appendChild(b);
  }
  clearTimeout(askTimer); askTimer = setTimeout(() => pick(one), 4000);
  prompt(`${name(one)} or ${lower(name(two))}?`, saidWords(S.answers[stepId] || '', one, two)); CX?.result();
  return true;
}

/* A null with a clear leader is taken. A real near-tie becomes a question to the player. */
const settle = (a) => { if (!a) return a; if (a.chosen == null && a.leadP >= 0.55 && a.leadP - a.secondP >= 0.15) return { ...a, chosen: a.lead, p: a.leadP }; return a; };
const STEP_KIND = { origin: 'biome', body: 'archetype', heart: 'motive', enemy: 'nemesis' };

async function runStep() {
  const step = STEPS[S.step]; const text = S.committed.trim();
  if (!text || S.busy) return;
  const mine = S.seq; S.busy = true;
  S.answers[step.id] = text; camp?.settle();
  /* the sent answer lives in the quote above; the field goes empty, so it never reads as a second, unsent answer */
  camp?.clearText(); sendWords(text); $('prompt').querySelector('h2').classList.add('wait'); clearAnswer(); $('typed').placeholder = ''; thinking(true);
  /* the chisel starts on Enter with the name as typed (Sage2 confirms it; a different name is cut again) */
  if (CX && step.id === 'name') { try { camp?.name?.(localName(text)); camp?.shot?.('r-name', { rate: 4 }); } catch (err) { console.warn('etch', err); } }
  /* the body step carries the origin answer (the world question sees the place and the days); every step carries the world */
  const r = await api('/api/step', { step: step.id, text, world: S.world }, 10000);
  S.busy = false; thinking(false);
  if (mine !== S.seq || S.stage !== 'build') { feed.dropped++; return; }
  /* no answer in time (a slow or failed call) never asks again: the step is filled and the run goes on */
  if (!r) return failStep(step, text);
  for (const k of ['biome', 'archetype', 'motive', 'nemesis']) if (r[k]) r[k] = settle(r[k]);
  if (step.id === 'name') {
    /* no name found: the player's own first words are the name (never a second prompt) */
    const nm = r.name || localName(text);
    await linkTo('name', nm); if (mine !== S.seq || S.stage !== 'build') return;
    S.seed = nameSeed(nm); apply.name(nm); stamp('', '', $('prompt'), STEP_SOUND.name); /* the stone says the name; the headline does not say it again */ stage('name'); return advance(holdStaged(3500));
  }
  if (step.id === 'born') {
    /* no date found: the run goes on (the seed comes from the words), never a second ask */
    if (!r.sign) return hiddenSign();
    await linkTo('born', r.birthday || text); if (mine !== S.seq || S.stage !== 'build') return;
    apply.born(r);
    stamp(`Born under ${r.sign}.`, '', $('prompt'), STEP_SOUND.born); stage('born', { onBeat: signFall });
    return advance(holdStaged(3500));
  }
  if (step.id === 'origin' && r.place) { S.place = r.place; if (S.biome) camp?.land(S.biome, S.place); }
  /* the world arrives with the ORIGIN step, before the land lands, so the land shown is the final world's
     land ("Kyoto. The Castle Road.") and no world card cuts in later. Taken when Sage2 is sure or has a clear leader. */
  if (step.id === 'origin' && r.world && !S.worldPicked) { const wa = settle(r.world); const wid = wa.chosen ?? (wa.leadP >= 0.45 ? wa.lead : null); if (wid && wid !== S.world) { S.worldSaid = text; await worldTurn(wid); } }
  if (mine !== S.seq || S.stage !== 'build') return;
  if (step.id === 'body') { if (r.trade) S.trade = r.trade; if (typeof r.build === 'number') { S.build = r.build; shapeHero(); if (S.archetype && !S.heroBare) camp?.hero(S.archetype, S.build); } }
  if (step.id === 'heart') { if (r.mentions?.length) { S.mentions = r.mentions; S.kinds = mentionKinds(r.mentions.slice(0, 3), text); } if (S.friend && S.friend.r !== 'f') Object.assign(S, friendHeart(r.mentions, text)); if (r.desire) S.desire = r.desire; }
  if (step.id === 'enemy') { if (r.minions) S.minions = byId(MINIONS, r.minions.chosen ?? r.minions.lead) || null; if (r.enemy) { S.enemy = r.enemy; if (S.nemesis) camp?.enemy(S.nemesis, S.enemy); } if (typeof r.tone === 'number') { S.tone = r.tone; world.setTone(r.tone); } }
  const kind = STEP_KIND[step.id]; const a = r[kind];
  /* a near-tie is a question back (two buttons, 4 s); with no clear second, Sage2's top option is taken as the closest
     fit, and with no top option at all the step is filled from the seed: never a "say more" loop */
  if (!a?.chosen) { if (askBetween(kind, a || {}, step.id)) return; if (a?.lead) { S.closest = step.id; return landStep(step.id, a.lead); } return failStep(step, text, true); }
  await landStep(step.id, a.chosen);
}

/* the class result says what it took from the answer: "You write code: a Mage. You lift weights: strong of build." */
const BUILD_WORDS = /\b(lift(?:s|ing)?(?: weights)?|weights|gym|run(?:s|ning)?|box(?:es|ing)?|climb(?:s|ing)?|swim(?:s|ming)?|hik(?:e|es|ing)|row(?:s|ing)?|wrestl\w*|carr(?:y|ies|ying) \w+|build(?:s|ing)? \w+|sit(?:s|ting)? (?:all day|at a desk))\b/i;
function tookFrom(words, n) {
  const out = []; const tr = trim(S.trade || '');
  const you = (t) => (/^(a|an|the|my)\b/i.test(t) || t.split(' ').length > 5 ? `${cap(t)}` : `You ${t.replace(/^i\s+/i, '')}`);
  if (tr) out.push(`${you(tr)}: ${art(n)} ${n}.`);
  const m = BUILD_WORDS.exec(words || ''); if (m) out.push(`You ${m[1].toLowerCase()}: a ${buildLabel().toLowerCase()} build.`);
  return out.length ? out.join(' ') : firstSentence(S.archetype.fits);
}
/* the class line gives its reason in the player's own words when they are short: "You build boats: a Mage." */
function whyHero(words, n) {
  const tr = trim(S.trade || ''); const plain = `You are ${art(n)} ${n}.`;
  if (!tr || tr.split(/\s+/).length > 5 || tr.length > 34) return plain;
  const core = tr.replace(/^i\s+/i, ''); const first = core.split(/\s+/)[0].toLowerCase();
  if (/^(a|an|the)\b/i.test(core)) return `You are ${lowFirst(core)}: ${art(n)} ${n}.`;
  if (new RegExp(`\\bi\\s+${first.replace(/[^a-z]/g, '')}`, 'i').test(words || '')) return `You ${lowFirst(core)}: ${art(n)} ${n}.`;
  return `“${cap(core)}”: ${art(n)} ${n}.`;
}
/* The reward beat for a decided step: the part lands, the headline stamps in, then the next question. */
async function landStep(stepId, id) {
  if (S.stage !== 'build') return;
  const words = S.answers[stepId]; const mine = S.seq;
  const pair = (decided) => { S.pairs = S.pairs.filter((p) => p.step !== stepId); if (words) S.pairs.push({ step: stepId, words, decided }); };
  /* the decisive words light in the panel, the streak runs to the thing, and the change happens when it lands */
  const kindOf = { origin: 'land', body: 'hero', heart: 'heart', enemy: 'enemy' }[stepId];
  const key = { origin: S.place, body: S.trade, heart: (S.mentions || []).map((m) => m.text)[0] || S.desire, enemy: S.enemy }[stepId];
  await linkTo(kindOf, key); if (mine !== S.seq || S.stage !== 'build') return;
  if (stepId === 'origin') {
    apply.biome(id); pair(lower(S.biome.label));
    /* a world land without its own fits line must not borrow the dark biome's ("a drowned fen" under the Rain District) */
    const ownFits = S.world === 'dark' || !!worldById(S.world).landInfo?.[S.biome.id]?.fits;
    const fl = ownFits ? firstSentence(S.biome.fits) : '';
    /* one line, call and response: the place the player named, then the land it became. The description is cut */
    void fl; stamp(S.place && S.place.length <= 28 ? `${S.place}. ${S.biome.label}.` : `You come from ${lower(S.biome.label)}.`, '', $('prompt'), STEP_SOUND.origin);
  }
  if (stepId === 'body') {
    /* the body changes inside the camp's light (stage 'class' runs this at its peak), and the line lands with it */
    await stage('hero', { swap: async () => {
      await apply.archetype(id); shapeHero();
      const n = bare(S.archetype.label); pair(`${n}, ${buildLabel().toLowerCase()}`);
      /* the reason, when it is short: "You build boats: a Mage." */
      /* the second half of the answer is heard too ("I lift at night": a strong build), its words lit in the echo */
      
      if (mine === S.seq && S.stage === 'build') stamp(whyHero(words, n), '', $('prompt'), STEP_SOUND.body); /* no build claim under a robe that hides it ("a strong build" over a slim mage read as false) */
    } });
    if (mine !== S.seq || S.stage !== 'build') return;
  }
  if (stepId === 'heart') {
    apply.motive(id); const names = S.mentions.map((m) => m.text);
    pair(names.length ? `fights for ${list(names)}` : S.motive.label.toLowerCase());
    const line = `You fight for ${list(names)}.`;
    if (names.length && line.split(' ').length <= 9) stamp(line, '', $('prompt'), STEP_SOUND.heart); else if (names.length) stamp('You fight for them.', '', $('prompt'), STEP_SOUND.heart); else stamp(youFight(S.motive), '', $('prompt'), STEP_SOUND.heart);
    /* the camp takes the answer, then YOU GAIN POWER! (2.8 s, any key skips it with the hold) */
    return powerAfter(Promise.race([Promise.all([stage(kindOf, { whole: true, cap: 6000 }), wait(1600)]), wait(2600)])); /* the payoff is seen, but not a long wait */
  }
  if (stepId === 'enemy') {
    apply.nemesis(id); pair(lower(S.nemesis.label));
    /* one enemy, one name: the player's words are the face the Dragon (or Giant, Lich, Twin) wears */
    /* one line. An enemy that is not a body ("the storm", "my own doubt") gets its body named here, with the
       player's words in quotes so any phrase reads true: “The storm” has a shape here: the Lich King. */
    const ew = trim(S.enemy || '').replace(/[.!?…]+$/, ''); const nl = lower(S.nemesis.label); const sameAs = ew && nl.replace(/^the /, '').split(/\s+/).some((w) => w.length > 3 && ew.toLowerCase().includes(w));
    const full = `“${cap(ew)}” has a shape here: ${nl}.`;
    /* long words stay in the sky over the camp (camp.enemy); the line then says only what they became */
    void full; void sameAs; stamp(`Your enemy: ${nl}.`, '', $('prompt'), STEP_SOUND.enemy); /* one plain pattern for every enemy */
    /* the enemy's words now burn across the sky: the small quote under the headline would say them a third time */
    if (S.enemy) { const q = $('said'); q.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => { q.textContent = ''; q.getAnimations().forEach((a) => a.cancel()); }; }
    tell('enemy'); stage('enemy');
    return advance(holdStaged(4000));
  }
  if (stepId !== 'body') stage(kindOf);
  advance(holdStaged());
}

/* Skip: the seed fills what the player left open. */
/* a step with no usable Sage2 answer: fill it as Skip does, say so in one line, go on */
function localName(t) { const w = String(t || '').replace(/[.,!?"]/g, ' ').trim().split(/\s+/).filter(Boolean); while (w.length > 1 && /^(i|i'm|im|am|is|my|name|names|named|called|call|me|they|it's|its|the)$/i.test(w[0])) w.shift(); return w.slice(0, 2).map((x) => x[0].toUpperCase() + x.slice(1)).join(' ') || 'Traveller'; }
/* the seed of a run comes from the name (a stable number from its letters), so the land can be built on the second answer */
function nameSeed(nm) { let h = 7; for (const ch of String(nm || 'Traveller').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h + 1; }
/* no date. A real sign is picked from the
   seed for the sky, and it is never named: the stone carries three dots where the date goes, the card says "a hidden sign" */
const ZODIAC = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
function hiddenSign() {
  watching(true);
  S.birth = null; S.sign = null; S.age = null; S.signHidden = true; shapeHero();
  try { camp?.born({ birth: null, sign: 'Hidden', season: (S.seed % 12) + 1, age: null }); /* its own mark, not a real sign's shape */ if (camp?.state) { camp.state.date = '\u00b7  \u00b7  \u00b7'; camp.drawStone(); } } catch (err) { console.warn('hidden sign', err); }
  rail('born'); stamp('Born under a hidden sign.', '', $('prompt'), STEP_SOUND.born); stage('born', { onBeat: signFall }); advance(holdStaged(3500));
}
/* the camp payoff plays and is seen (the companions arrive), THEN YOU GAIN POWER!!!, and only after the
   card ends or is skipped does the next question come. Nothing advances under the card; any key or Next still skips. */
function powerAfter(payoff) {
  const at = S.step; const still = () => S.step === at && S.holding && S.stage === 'build';
  clearTimeout(S.advanceTimer); S.holding = true; S.powerWait = true; CX?.hold(Math.round((camp?.revealLeft?.() || 0) * 1000) + 4600);
  Promise.resolve(payoff).then(() => (still() ? wait(300) : null)).then(() => (still() ? PW.powerMoment(PW.getPower(), { still }) : false)).finally(() => { S.powerWait = false; }).then(() => { if (still()) advance(900); });
}
function failStep(step, text, unclear = false) {
  if (step.id === 'name') { const nm = localName(text); S.seed = nameSeed(nm); apply.name(nm); stamp('', '', $('prompt'), STEP_SOUND.name); stage('name'); return advance(holdStaged(3500)); }
  if (step.id === 'born') return hiddenSign();
  addRow({ quote: text, lines: [unclear ? 'Sage2 could not place this answer: the game picked one' : 'Sage2 did not answer in time: the game picked one'] }, 0);
  S.closest = null; skipStep(true);
  stamp(unclear ? 'Sage2 was not sure. The game picked.' : 'Sage2 is slow. The game picked.', '');
}
/* the reward beat holds as long as its words need, and any key skips it (main.js typed keydown) */
/* the response stays
   for 0.35 s a word and never under 3.5 s (a name alone: 2.4 s); the land, the hero or the enemy changes during the hold */
const wordsOf = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
function holdFor(...parts) { const P = $('prompt'); const n = wordsOf(P.querySelector('h2')?.textContent) + wordsOf(P.querySelector('p')?.textContent); const min = typeof parts[0] === 'number' ? parts[0] : 3500; return Math.max(min, Math.min(7000, n * 350)); }
function skipStep(hold = false) {
  const step = STEPS[S.step]; const pick = (l) => l[S.seed % l.length].id;
  if (step.id === 'born' && !S.sign) return hiddenSign();
  if (step.id === 'origin' && !S.biome) apply.biome(pick(BIOMES));
  if (step.id === 'body' && (!S.archetype || S.heroBare)) apply.archetype(S.archetype?.id ?? pick(K().ARCHETYPES));
  if (step.id === 'heart' && !S.motive) apply.motive((hold && PW.guessMotive(S.answers?.heart)) || pick(MOTIVES)); /* guess from the words */
  if (step.id === 'enemy' && !S.nemesis) apply.nemesis(pick(K().NEMESES));
  /* Sage2 missed the heart answer and the game picked: the power still lands */
  if (hold && step.id === 'heart' && S.motive) return powerAfter(wait(Math.min(2600, Math.max(1600, Math.round((camp?.revealLeft?.() || 0) * 1000) + 300))));
  if (hold) advance(3500); else showStep(S.step + 1);
}
function skipNow() {
  if (S.camping) return campDone?.(null);
  if (S.stage !== 'build' || !STEPS[S.step] || S.busy) return;
  /* Skip at the forge = the world's standard weapon, then "Start quest" */
  if (STEPS[S.step].id === 'weapon') { if (!S.weapon) giveWeapon({ kind: 'none', ...defaultArms(), word: null }, '', null); return; }
  skipStep();
}
/* Back = answer the step before again (its old pick stays until the new answer lands) */
function backStep() { if (S.stage !== 'build' || S.busy || S.step <= 0) return; S.revision++; showStep(S.step - 1); }

/* ---------- patterns C and D: the forge ---------- */
/* every answer at the forge ends with a weapon in the hero's hand, in one step.
   weapon: Sage2's pick (its top option when it is not sure). thing ("mozzarella", "a banana"): the closest weapon, made of or
   named for the player's word. none ("my bare hands", "I don't know", a joke, a name, gibberish): the world's default
   weapon. ready: start the quest. The feed says when Sage2 was not sure and shows the closest fit with its percentage. */
const WEAPON_WORD = /\b(sword|swords|blade|sabre|saber|katana|nodachi|axe|axes|hatchet|cleaver|spear|lance|pike|javelin|trident|halberd|naginata|staff|wand|rod|dagger|daggers|knife|knives|bow|longbow|crossbow|arrows?|gun|guns|pistol|revolver|rifle|shotgun|blaster|hammer|maul|mace|club|flail|whip|scythe|claymore|rapier|katar|weapon|shield)\b/i;
const MATERIAL_WORD = /\b(iron|steel|silver|mithril|gold|golden|bone|dragonbone|obsidian|glass|chrome|platinum|black|dark|night|shadow|white|metal)\b/i;
/* a cheap tint for the player's own material word, on the hero's gear (pale and soft for food) */
const WORD_TINTS = [
  [/mozzarella|cheese|butter|cream|milk|tofu|marshmallow|bread|baguette|dough|rice|noodle|pasta|cotton|paper|snow/i, 0xf2ead2, true],
  [/banana|lemon|corn|mustard|honey|sponge/i, 0xf0d24a, true], [/chocolate|coffee|wood|wooden|bark|mud|potato|cookie|toast/i, 0x6d4a2e, true],
  [/candy|strawberry|bubblegum|pink|ham|bacon|salmon|shrimp/i, 0xef8fa8, true], [/water|ice|jelly|slime|crystal/i, 0xa9d8ee, false],
  [/carrot|pumpkin|orange|cheddar/i, 0xe8862e, true], [/lettuce|cucumber|leaf|grass|pickle|broccoli|frog/i, 0x6fa34a, true], [/rubber|chicken/i, 0xf2c14e, true],
];
const tintOf = (word) => { for (const [re, color, soft] of WORD_TINTS) if (re.test(word || '')) return { color, soft }; return null; };
/* the player's own word, cleaned: "a wheel of mozzarella" -> "mozzarella", "my cat" -> "cat"; null for a sentence or a question */
function ownWord(w) {
  let t = String(w || '').trim().replace(/[.!,;:"“”]+/g, '').replace(/^(a|an|the|my|some|one|your|his|her)\s+/i, '').trim();
  if (!t || /[?]/.test(t) || /\b(and|or|that|which|with|like)\b/i.test(t) || t.split(/\s+/).length > 3 || t.length > 22) return null;
  /* "glass of water" -> "water"; the word names the weapon only when it reads as a plain English noun ("Eis war
     hammer" from a German answer read as a typo): an unknown word is dropped and the weapon keeps its own name */
  t = t.toLowerCase().replace(/^.*\bof\s+(?:a |an |the )?/, '');
  if (!/^[a-z][a-z -]*$/.test(t) || t.split(/\s+/).length > 2) return null;
  const head = t.split(/\s+/).pop().replace(/(?<=[^s])s$/, '');
  if (NOUNS.has(head)) return t.replace(/\S+$/, head); /* "rubber ducks" -> "rubber duck" */
  return tintOf(t) || NOUNS.has(t) ? t : null;
}
/* plain English things a player may ask the smith for; with the WORD_TINTS words, the only words that name a weapon */
const NOUNS = new Set(('rock stone brick wood oak pine bamboo glass water fire lava ice snow sand mud dirt clay crystal diamond ruby ' +
  'emerald pearl copper bronze brass tin lead jade marble granite coal salt sugar candy cake pizza taco burger hotdog sausage pepperoni ' +
  'cheese mozzarella bread baguette fish salmon tuna shark whale octopus squid crab lobster cat dog duck goose chicken frog snake ' +
  'dragon wolf bear lion tiger eagle owl bee spider bone feather fur leather rope chain plastic rubber lego toy book pencil pen ' +
  'spoon fork ladle pan frying-pan umbrella broom mop shovel rake guitar violin trumpet drum keyboard phone laptop cable wire ' +
  'light lightning thunder storm wind cloud star moon sun rainbow shadow flower rose thorn vine leaf tree cactus mushroom ' +
  'pumpkin apple banana lemon orange carrot potato onion garlic pickle cucumber watermelon coconut pineapple grape cherry ' +
  'chocolate coffee tea milk butter honey jelly slime soap bubble balloon paper cardboard cotton wool silk velvet lace ' +
  'candle lantern lamp bell coin money gold silver iron steel').split(/\s+/));
/* the player's word names the weapon by its kind: "Water staff", "Mozzarella hammer" (not "Glass of water oak staff") */
const wordWeapon = (word, label) => { const l = shortLabel(label).toLowerCase().replace(/\s+pair$/, ''); const k = /\b(handle)$/.test(l) ? l : l.split(/\s+/).pop(); return `${cap(word)} ${k}`; };
const shortLabel = (l) => String(l || '').replace(/\s+and\s+.*$/i, '');
/* the world's default weapon for an answer that names none: its first weapon (sword and shield, Sabre, Katana...),
   iron, and an element from the player's seed */
function defaultArms() { const k = K(); return { weapon: k.WEAPONS[0], material: byId(k.MATERIALS, 'iron') || k.MATERIALS[0], element: k.ELEMENTS[S.seed % k.ELEMENTS.length] }; }
/* res = the /api/act answer (new server: res.answer; an older one: res.verb only) */
function readForge(res, text) {
  const k = K(); const f = res?.forge || null; const slots = res?.slots || {};
  let kind = res?.answer ? (res.answer.chosen ?? res.answer.lead) : null;
  if (!kind) { const v = res?.verb?.chosen; kind = v === 'forge' && f ? (f.weapon?.chosen ? 'weapon' : 'thing') : (v === 'fight' || v === 'travel') ? 'ready' : 'none'; }
  if (!text.trim()) kind = 'none';
  if (kind === 'ready' && !S.weapon) kind = 'none';
  if ((kind === 'weapon' || kind === 'thing') && !f?.weapon?.lead) kind = 'none';
  if (kind === 'none' || kind === 'ready') return { kind, ...defaultArms(), word: null, unsure: false };
  const weapon = byId(k.WEAPONS, f.weapon.chosen ?? f.weapon.lead) || k.WEAPONS[0];
  const material = byId(k.MATERIALS, f.material?.chosen ?? f.material?.lead) || byId(k.MATERIALS, 'iron') || k.MATERIALS[0];
  const element = byId(k.ELEMENTS, f.element?.chosen ?? f.element?.lead) || defaultArms().element;
  const unsure = f.weapon.chosen == null;
  const mat = ownWord(slots.material); const item = ownWord(slots.item);
  const matOwn = mat && !MATERIAL_WORD.test(mat) && !WEAPON_WORD.test(mat) ? mat : null;
  const itemOwn = item && !WEAPON_WORD.test(item) && !MATERIAL_WORD.test(item) && (kind === 'thing' || unsure || (f.weapon.leadP ?? 0) < 0.8) ? item : null;
  let word = matOwn || itemOwn;
  if (!word && kind === 'thing') word = ownWord(text);
  return { kind, weapon, material, element, word, unsure, leadP: f.weapon.leadP ?? 0, lead: f.weapon.lead };
}
const pctOf = (p) => `${Math.round((p || 0) * 100)}%`;
/* the forge's result line under the weapon name; the feed says the same in its own words */
function forgeLine(fr, text) {
  const wl = shortLabel(S.weapon.label).toLowerCase();
  /* one short line under the weapon's name: what it is. The power is taught in the fight (teach.js), not here */
  void text;
  if (fr.kind === 'none') return `The standard ${wl}.`;
  if (fr.word && (fr.unsure || fr.kind === 'thing')) return `Closest weapon: ${wl} (${pctOf(fr.leadP)}).`;
  if (fr.word) return `A ${wl} made of ${fr.word}.`;
  if (fr.unsure) return `Closest weapon: ${wl} (${pctOf(fr.leadP)}).`;
  return `${cap(ownArms(text, fr).mat)} ${ownArms(text, fr).noun} of ${S.element.label.toLowerCase()}.`;
}
/* a world may hand over its own model (a pitchfork for a spear, rail iron for iron): the words stay the player's.
   noun = the weapon word the player said, when the world's label does not already hold it; mat = the same for the material */
function ownArms(text, fr) {
  const wl = shortLabel((fr?.weapon || S.weapon).label).toLowerCase(); const ml = (fr?.material || S.material).label.toLowerCase();
  const w = WEAPON_WORD.exec(text || ''); const m = MATERIAL_WORD.exec(text || '');
  const said = w && !/^(weapon|blade)$/i.test(w[1]) ? w[1].toLowerCase().replace(/(?<=[^s])s$/, '') : null;
  const noun = said || wl; /* "spear" stays "spear" (not "boar spear", not "pitchfork") */
  const sm = m ? m[1].toLowerCase() : null; const mat = sm && !/^(black|dark|night|shadow|white|metal)$/.test(sm) ? sm : ml; /* "Rail iron" for a plain "iron" read as a second, unasked word */
  return { noun, mat };
}
/* the player's word on the hero's gear: a tint for food and soft things (the hero in the camp and on the card) */
function tintGear(word) {
  const t = tintOf(word); if (!t || !S.hero) return;
  for (const slot of ['handslotr', 'handslotl', 'armslotl']) S.hero.slot(slot)?.traverse((o) => {
    if (!o.isMesh || !o.parent || !o.material?.color) return;
    if (!o.userData.tinted) { o.material = o.material.clone(); o.userData.tinted = true; }
    o.material.color.lerp(new THREE.Color(t.color), 0.78);
    if (t.soft) { o.material.metalness = 0.05; o.material.roughness = 0.88; }
  });
}
function giveWeapon(fr, text, mention) {
  S.forgeWord = fr.word || null;
  S.weaponLabel = fr.word ? wordWeapon(fr.word, fr.weapon.label) : null;
  const mine = S.revision;
  /* the link first (the words light in the panel, the streak runs to the hero's hand), then the camp's forge
     (stage 'weapon': three strikes, the power, the hero takes it). The name lands when the hero takes the weapon. */
  let named = false;
  const name = (sound) => { if (named || mine !== S.revision || S.stage !== 'build') return; named = true; const head = fr.word ? `${S.weaponLabel}.` : `${S.weaponName}.`; stamp(head, forgeLine(fr, text || ''), $('prompt'), sound); };
  return linkTo('weapon', fr.word || shortLabel(fr.weapon.label)).then(() => apply.weapon({ weapon: fr.weapon, material: fr.material, element: fr.element, mention })).then(() => {
    const wl = shortLabel(S.weapon.label).toLowerCase();
    if (fr.word) tintGear(fr.word);
    S.pairs = S.pairs.filter((p) => p.step !== 'weapon');
    if (text) S.pairs.push({ step: 'weapon', words: text, decided: fr.word ? wordWeapon(fr.word, fr.weapon.label).toLowerCase() : fr.kind === 'none' ? `${wl} (standard)` : `${S.material.label.toLowerCase()} ${wl}` });
    if (typeof camp?.reveal !== 'function') {
      /* no staged forge: the old beat */
      S.hero?.play('Cheer', { loop: false }); setTimeout(() => { if (!holdHero(S.hero, S.weapon)) S.hero?.play('2H_Melee_Idle'); }, 1500);
      world.flash(0.9); world.kick(0.1); forgeBeat(); aimCamera('forged', { rate: 1.0 });
      name('forge'); return null;
    }
    if (CX) document.body.classList.add('cx-forging'); /* the chips and the quote step aside while the weapon is made */
    return stage('weapon', { whole: true, cap: 9000, onBeat: (beat) => { if (beat === 'strike') { sfx('forge', { gain: 0.5 }); if (CX && rig.cur && rig.tgt) { rig.cur.radius *= 0.9; rig.tgt.radius *= 0.96; } /* the camera pushes in on each hit */ } else if (beat === 'power') forgeBeat(); else if (beat === 'take') name('soul'); } });
  }).finally(() => document.body.classList.remove('cx-forging')).then(() => { if (mine !== S.revision || S.stage !== 'build') return; name('forge'); weaponReady(); });
}
/* after the forge: "Start quest" is the one primary button; Enter on an empty field starts too; a new answer re-forges */
function weaponReady() {
  watching(false);
  $('go').textContent = 'Start quest'; $('go').classList.remove('hidden'); $('skip').classList.add('hidden');
  $('under-keys').textContent = '';
  $('typed').placeholder = 'Name another weapon, or press Enter to start'; $('typed').focus();
  finalBuild();
}
/* the build is whole. No paragraph and no slab over the scene: the camp shows the hero (camp.beauty), the seven
   lines of the rail light one by one with a ring on the thing each one made, the weapon's name is the headline, and there
   is one button. "Change" brings the field and the worlds back; S hides everything for a clean picture. */
let builtT = [];
function finalBuild() {
  for (const t of builtT) clearTimeout(t); builtT = [];
  let box = $('built');
  if (!box) {
    box = document.createElement('div'); box.id = 'built';
    box.innerHTML = '<small id="built-foot"></small><span><button class="link" id="rebuild" type="button">Change the weapon or the world</button><kbd>S</kbd><i>clean picture</i></span>';
    $('dock').appendChild(box);
    box.querySelector('#rebuild').addEventListener('click', () => { document.body.classList.remove('built'); S.rebuild = true; chipsOpen = true; worldChips(); $('typed').focus(); });
  }
  S.rebuild = false; S.railName = true; rail();
  document.body.classList.add('built'); $('typed').blur();
  /* the build screen is about the hero: "Rowan, Mage of the Drowned Fen." with the weapon as its second line */
  if (CX && S.name && S.archetype) { const h = $('prompt').querySelector('h2'); const hero = `${S.name}, ${bare(S.archetype.label)} of ${S.biome ? lower(S.biome.label) : 'the road'}.`; if (h.textContent !== hero) S.cxWeap = `${trim(h.textContent)}. ${$('prompt').querySelector('p').textContent}`.trim(); stamp(hero, S.cxWeap || '', $('prompt'), null); }
  try { camp?.beauty?.(); } catch (err) { console.warn('beauty', err); }
  $('built-foot').innerHTML = CX ? `${feed.calls} Sage2 decisions<span class="cx-tele"> \u00b7 ${feed.median()} ms \u00b7 ${fmtCost(feed.cost)}</span>` : `Sage2 made ${feed.calls} decisions \u00b7 ${feed.median()} ms median \u00b7 ${fmtCost(feed.cost)}`; /* the panel is away on this screen (it covered a companion's head and the enemy): this line is the proof */
  const items = [...$('rail').querySelectorAll('li.on')]; for (const li of items) li.classList.remove('lit');
  items.forEach((li, i) => builtT.push(setTimeout(() => {
    if (!document.body.classList.contains('built')) return;
    li.classList.add('lit'); try { camp?.pulse?.(CAMP_KIND[li.dataset.k]); } catch { /* no pulse */ } ring(anchorPx(li.dataset.k), { size: 110, ms: 700 }); sfx('soul', { gain: 0.22, rate: 0.8 + i * 0.07 });
  }, 700 + i * 380)));
}
window.addEventListener('keydown', (e) => {
  if (S.stage !== 'build' || !document.body.classList.contains('built') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.activeElement === $('typed')) return;
  if (e.key === 'Enter' && !S.busy) { e.preventDefault(); enterFight(); }
  else if (e.key === 's' || e.key === 'S') { e.preventDefault(); document.body.classList.toggle('clean'); }
});
async function runForge() {
  const text = S.committed.trim(); if (!text || S.busy) return;
  S.busy = true; S.answers.weapon = text;
  const revision = ++S.revision;
  camp?.clearText(); sendWords(text); clearAnswer(); $('typed').placeholder = '';
  prompt('The smith is making it.', ''); $('prompt').querySelector('h2').classList.add('wait'); thinking(true, true);
  /* the wait is the forge at work, however long the call takes: a hammer blow, sparks off the fire and the fire's
     flare every 0.85 s from the moment of Enter until the reply lands (a slow call was a static camp for 10 s) */
  const beat = () => { try { sfx('forge', { gain: 0.26 }); camp?.emberFromFire?.(16, 0xffb060, 1.5); if (camp) camp.flare = Math.max(camp.flare || 0, 1.0); forgeBeat(); camp?.forgeWaitBeat?.(); } catch { /* no camp */ } };
  const guess = CX ? readArms(text, K(), S.seed || 0) : null; /* "silver ... frost" shows silver and frost from the first frame */
  try { camp?.forgeWait?.(true, lookOf(guess)); } catch { /* no camp */ } /* the anvil is out from Enter */
  const waitBeat = setInterval(beat, 850); setTimeout(() => { if (S.busy && revision === S.revision) beat(); }, 250);
  const mentions = [...S.mentions, ...(S.place ? [{ kind: 'place', text: S.place }] : [])];
  /* test hook (?cxstub=1): the forge answers after 2.5 s with the words the player gave, so the flow can be checked when Sage2 is down */
  const r = CX && CX_STUB && guess ? await new Promise((ok) => setTimeout(() => ok({ answer: { chosen: 'weapon' }, forge: { weapon: { chosen: guess.weapon.id, lead: guess.weapon.id, leadP: 0.94 }, material: { chosen: guess.material.id }, element: { chosen: guess.element.id } }, slots: {} }), 2500)) : await api('/api/act', { text, mentions, revision, world: S.world, step: 'weapon' }, 10000);
  clearInterval(waitBeat); S.busy = false; thinking(false); try { camp?.forgeWait?.(false); } catch { /* no camp */ } CX?.result(); /* the reading bar stops once Sage2 has answered (or the time ran out) */
  if (S.stage !== 'build' || revision !== S.revision) { feed.dropped++; return; }
  /* no answer in time: the standard weapon, said plainly in the feed */
  if (!r && CX && guess?.said) { addRow({ quote: text, lines: ['Sage2 did not answer in time: the smith read your words'] }, 0); return giveWeapon({ kind: 'local', weapon: guess.weapon, material: guess.material, element: guess.element, word: null }, text, null); } /* never "the standard sword" under "a silver spear" */
  if (!r) { addRow({ quote: text, lines: ['Sage2 did not answer in time: you get the standard weapon'] }, 0); return giveWeapon({ kind: 'none', ...defaultArms(), word: null }, text, null); }
  let fr = readForge(r, text);
  if (CX && fr.kind === 'none' && guess?.saidWeapon && text.trim()) fr = { kind: 'local', weapon: guess.weapon, material: guess.material, element: guess.element, word: null };
  /* the wait headline says what Sage2 heard ("The smith forges your silver spear.") until the name stamps */
  if (CX && fr.kind !== 'none' && fr.kind !== 'ready' && fr.weapon && fr.material) { const h = $('prompt').querySelector('h2'); if (h) h.textContent = `The smith forges your ${String(fr.material.label).toLowerCase()} ${shortLabel(fr.weapon.label).toLowerCase()}.`; CX.key(String(fr.weapon.label).split(' ').pop()); }
  if (fr.kind === 'ready') { enterFight(); return; }
  const mention = r.named && r.named.revision === revision ? r.named.mention : null;
  await giveWeapon(fr, text, fr.kind === 'none' ? null : mention);
}

/* ---------- voice: push to talk ----------
   The mic is closed until the player holds the mic button, or holds Space while the field is empty or holds a spoken take.
   Each hold is one take: it replaces the field. Release closes the mic; Enter sends. Nothing is sent by speech alone. */
let rec = null; let micDead = false; let pttHeld = false; let pttLive = false; let spokenTake = false;
function micState(st) { const l = $('listen'); l.classList.toggle('live', st === 'live'); l.classList.toggle('wait', st === 'wait'); l.classList.toggle('blocked', st === 'blocked'); l.classList.toggle('off', st !== 'live'); $('listen-t').textContent = st === 'live' ? 'Listening' : st === 'wait' ? 'Wait' : st === 'blocked' ? 'Mic blocked' : 'Hold to talk'; l.setAttribute('aria-pressed', st === 'live' ? 'true' : 'false'); }
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;
  if (!rec) {
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onaudiostart = () => { if (pttHeld) micState('live'); };
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) S.committed = `${S.committed} ${res[0].transcript.trim()}`.trim(); else interim += res[0].transcript;
      }
      S.interim = interim.trim();
      $('typed').value = [S.committed, S.interim].filter(Boolean).join(' '); spokenTake = true;
      pushText();
    };
    rec.onend = () => {
      pttLive = false;
      /* the browser closed the take by itself (a pause) while the player still holds: open it again */
      if (pttHeld && !micDead) { try { rec.start(); pttLive = true; } catch { /* already started */ } return; }
      if (S.interim) { S.committed = `${S.committed} ${S.interim}`.trim(); S.interim = ''; $('typed').value = S.committed; pushText(); }
      micState(micDead ? 'blocked' : 'idle');
      if (spokenTake && $('typed').value.trim() && (S.stage === 'build' || S.camping)) $('under-keys').textContent = 'Enter to send';
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { micDead = true; pttHeld = false; micState('blocked'); hint('Allow the microphone in the address bar, then hold again. Or type.', 6000); }
      else if (e.error === 'audio-capture') { pttHeld = false; hint('No microphone found. Type your answer.', 4000); }
      else if (e.error === 'network' || e.error === 'language-not-supported') { pttHeld = false; hint('Speech does not work in this browser. Type your answer.', 4000); }
    };
  }
  /* the field stays on; the mic is a hold button at its right end */
  S.mode = 'voice'; $('listen').classList.remove('hidden'); $('typed').classList.remove('hidden'); document.body.classList.add('mic');
  micState(micDead ? 'blocked' : 'idle');
  underKeys();
  return true;
}
function pttDown() {
  if (pttHeld || !rec || S.mode !== 'voice' || !(S.stage === 'build' || S.camping)) return;
  pttHeld = true; micDead = false;
  /* one hold, one take: the new take replaces the field */
  S.committed = ''; S.interim = ''; $('typed').value = ''; spokenTake = true; keyedAt = 0;
  micState('wait');
  if (!pttLive) { try { rec.start(); pttLive = true; } catch { /* still closing the last take: onend opens it */ } }
}
function pttUp() {
  if (!pttHeld) return;
  pttHeld = false;
  if (!$('listen').classList.contains('blocked')) micState('idle');
  try { rec?.stop(); } catch { /* not running */ }
}
/* the line under the field: what to do, in the words of the input that works */
function underKeys() {
  const step = STEPS[S.step]; if (!step || S.stage !== 'build') return;
  if (step.id === 'weapon' && S.weapon) { $('under-keys').textContent = ''; return; } /* the field and the button say it */
  /* said on the first question; after that the player knows */
  if (CX?.keys($('under-keys'), S.step, S.mode === 'voice', matchMedia('(pointer: coarse)').matches)) return;
  $('under-keys').textContent = S.step === 0 ? (S.mode === 'voice' ? (matchMedia('(pointer: coarse)').matches ? 'Hold the mic to talk, or type' : 'Hold Space to talk, or type. Enter sends.') : 'Type, then press Enter') : '';
}
function stopVoice() { pttHeld = false; try { rec?.stop(); } catch { /* not running */ } if (rec) micState(micDead ? 'blocked' : 'idle'); }
function useTyping(note) {
  S.mode = 'type'; $('typed').classList.remove('hidden'); $('listen').classList.add('hidden'); document.body.classList.remove('mic'); $('typed').focus();
  underKeys();
  if (note) hint(note, 3000);
}
/* the field holds the whole answer, typed or spoken: a keystroke makes the field the answer, speech adds to it */
let keyedAt = 0;
$('typed').addEventListener('input', () => { keyedAt = performance.now(); spokenTake = false; S.committed = $('typed').value.trim(); S.interim = ''; pushText(); });
$('typed').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); skipNow(); return; }
  if (e.key === 'Tab') { e.preventDefault(); if (S.stage !== 'title') $('feed').classList.toggle('hidden'); return; }
  /* a two-button question: the field is not shown; Enter takes the first button, other keys do nothing */
  if (!$('ask').classList.contains('hidden')) { if (e.key === 'Enter') { e.preventDefault(); $('ask').querySelector('button')?.click(); } else if (e.key.length === 1) e.preventDefault(); return; }
  /* a key during the reward beat skips the wait: the next question comes at once and the key lands in it */
  if (S.stage === 'build' && S.holding && !e.metaKey && !e.ctrlKey && (e.key.length === 1 || e.key === 'Enter')) { const n = S.step + 1; clearTimeout(S.advanceTimer); S.holding = false; try { camp?.skipReveal?.(); } catch { /* no staging */ } if (n < STEPS.length) showStep(n); if (e.key === 'Enter') { e.preventDefault(); return; } }
  /* Space is the talk key while the field is empty or holds a spoken take; in typed text it is a space */
  if (e.code === 'Space' && S.mode === 'voice' && !e.metaKey && !e.ctrlKey && !e.altKey && (pttHeld || !$('typed').value || spokenTake)) { e.preventDefault(); if (!e.repeat) pttDown(); return; }
  if (e.key !== 'Enter') return;
  if (pttHeld) pttUp();
  const v = $('typed').value.trim();
  /* after the forge an empty Enter starts the quest */
  if (!v) { if (S.stage === 'build' && STEPS[S.step]?.id === 'weapon' && S.weapon && !S.busy) enterFight(); return; }
  S.committed = v; S.interim = ''; $('typed').value = '';
  pushText(); finalNow = true; onFinal();
});
let finalNow = false;
/* the "Next question" button during the reward hold does what a key does there */
if (CX) CX.onNext = () => { if (S.stage !== 'build' || !S.holding || S.powerWait) return; /* Next waits for the power card */ const n = S.step + 1; clearTimeout(S.advanceTimer); S.holding = false; try { camp?.skipReveal?.(); } catch { /* no staging */ } if (n < STEPS.length) showStep(n); };
$('typed').addEventListener('keyup', (e) => { e.stopPropagation(); if (e.code === 'Space') pttUp(); });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') pttUp(); });
window.addEventListener('blur', () => pttUp());
{ const l = $('listen');
  l.addEventListener('pointerdown', (e) => { e.preventDefault(); try { l.setPointerCapture(e.pointerId); } catch { /* no capture */ } pttDown(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) l.addEventListener(ev, () => { pttUp(); $('typed').focus(); });
  l.addEventListener('contextmenu', (e) => e.preventDefault()); }

/* ---------- stages ---------- */
function startTitle() {
  /* camp hook: the title. The camp scene (fire in the centre of the frame) is set up here. */
  setStage('title');
  try { camp = new Camp(world); if (S.world !== 'dark') camp.setWorld(worldById(S.world), S.worldMod?.camp || null); camp.enter(S.hero); camp.onReframe = reframe; camp.onShot = campShot; } catch (err) { console.warn('camp', err); camp = null; }
  /* alive from the first frame: the fire burns, a slow push-in on the stone, a ghost hand carves a name and wipes it */
  aimCamera('title', { snap: true, rate: 0.75 }); if (rig.cur) rig.cur.radius *= 1.3;
  /* a threat in the title frame: a dark hooded giant on the horizon behind the camp (the run's own enemy comes later) */
  { const tn = S.world !== 'dark' ? K().NEMESES[0] : null; world.setNemesis(tn ? mechOf(tn) : 'lich', S.heroUrl, tn?.id ?? null); } camp?.titleDemo(true);
  /* the reel covers the camp with a new world every 2 s (title-reel.js); the camp stays warm under it */
  /* the cover title (the default) and ?title=clean play over the live camp instead of the reel (web/src/title2.js) */
  if (TITLE2) { import('./title2.js').then((m) => { if (S.stage === 'title' && !title2) title2 = m.startTitle2(TITLE2, { world, S, camp, root: $('title') }); }).catch((err) => { console.warn('title2', err); document.documentElement.classList.add('t2ready'); }); } else
  titleReel = startReel($('title'), { live: () => S.stage === 'title' });
}
let titleReel = null; let title2 = null; const TITLE2 = document.documentElement.dataset.title || null;
function enterBuild(mode) {
  /* camp hook: the questions start; the camp scene stays, the hero appears by the fire. */
  unlockAudio();
  S.stage = 'build'; S.mode = mode; setStage('build');
  CX?.enter(); $('title').classList.add('hidden'); camp?.titleDemo(false); titleReel?.stop(); titleReel = null; title2?.stop(); title2 = null;
  /* the title's enemy leaves; the player's own answer names the real one */
  if (world.nemesis && world.nemesisId === 'lich' && !S.nemesis) { world.nemesis.leaving = true; world.nemesis.t = 0; world.nemesisId = null; }
  for (const id of ['feed', 'dock', 'dots']) $(id).classList.remove('hidden');
  if (S.hero) S.hero.root.visible = true;
  onboard = openOnboard(onDecision);
  /* no mode choice. The field is on and focused at once; the mic starts beside it when the browser has speech
     (its permission prompt never blocks typing). No speech: a typed run with no message. */
  showStep(0);
  if (mode === 'type' || !startVoice()) useTyping();
}
/* the one start (title "Start now", Enter on the title, Play again) */
function startNow() { if (S.stage !== 'title' || document.body.classList.contains('phone')) return; if (S.friend) friendBegin(); enterBuild('auto'); if (S.friend) friendFill(); }
/* a friend's run. The heart is not asked (they fight for the one who sent the link, who walks at their side);
   a "fell" link keeps the sender's world, land and enemy, so only the name and the weapon are asked */
let shareLand = null;
function friendBegin() { shareLand?.close(); shareLand = null; const keep = SHARE.friendSteps(S.friend); STEPS.splice(0, STEPS.length, ...STEPS.filter((s) => keep.includes(s.id))); }
function friendFill() {
  const d = S.friend; S.mentions = [{ kind: 'loved one', text: d.s }]; S.kinds = ['person'];
  /* a fell link keeps the sender's cause; a won link asks the friend's own heart (the sender stays first: friendHeart) */
  if (d.r === 'f') apply.motive(d.m || 'protect');
  if (d.r === 'f' && d.b) apply.nemesis(d.b);
}
/* a won link's heart answer: the friend's own people walk with them, after the sender */
function friendHeart(ms, text) { const s = S.friend?.s; const rest = (ms || []).filter((m) => SHARE.cleanName(m.text).toLowerCase() !== String(s).toLowerCase()).slice(0, 2); return { mentions: [{ kind: 'loved one', text: s }, ...rest], kinds: ['person', ...(rest.length ? mentionKinds(rest, text) : [])] }; }
/* the scene behind the landing and the share picture: the world's colour, the boss figure (web/src/share-stage.js) */
let cardLogo = null; if (SHARE.SHARE_ON) SHARE.logoImage().then((c) => { cardLogo = c; });
let stageP = null; const stageMod = () => (stageP ??= import('./share-stage.js'));
/* each world's one colour cue on the title's stage (cloud bands, the floor's grid) */
const COVER_TINT = { dark: 0x2ee8ff, edo: 0xff6aa8, neon: 0x4dff7a, frontier: 0xffb040, storybook: 0xc9a8ff };
const coverTint = () => COVER_TINT[S.world || 'dark'] ?? 0x2ee8ff;
function shareAccent(w = S.world, land = S.biome) { if (w && w !== 'dark') { const e = worldById(w)?.ui?.ember; if (e) return new THREE.Color(e).getHex(); } return land?.accent ?? 0xff5a1e; }
async function friendLanding(d) {
  S.friend = d;
  if (d.r === 'f') { S.worldPicked = true; try { await apply.world(d.w, { quiet: true }); if (d.l && landHome(d.l)) apply.biome(d.l); } catch (err) { console.warn('share world', err); } }
  if (S.stage !== 'title' || !S.friend) return;
  const nem = d.b ? kitFor(d.w).nemesis(d.b) : null; const en = nem?.label || null;
  const land = BIOMES.find((b) => b.id === d.l || b.climate === d.l) || null; const acc = shareAccent(d.w, land);
  const night = new THREE.Color(d.w !== 'dark' ? worldById(d.w)?.ui?.night || '#0b0a0c' : '#0b0a0c');
  const stage = nem ? (host, label) => { let h = null; let dead = false; stageMod().then((m) => { if (!dead) h = m.landingStage(host, { worldId: d.w, nemId: nem.id, mech: mechOf(nem), accent: acc, label, won: d.r !== 'f', tint: COVER_TINT[d.w] ?? 0x2ee8ff, heroModel: (d.h && kitFor(d.w).ARCHETYPES.find((a) => a.id === d.h)?.model) || null, heroBodyType: d.bt || null, sky: { top: 0x24094e, hor: new THREE.Color(0xe83a50).lerp(new THREE.Color(COVER_TINT[d.w] ?? 0x2ee8ff), 0.1).getHex(), low: 0x14040e } /* the title's sky as it is (the friend's world shows in one tint) */ }); /* the title's sunset sky, a little of the world's night in it */ }).catch((err) => console.warn('share stage', err)); return { stop() { dead = true; h?.stop(); } }; } : null;
  shareLand = SHARE.showLanding(d, { enemyLabel: en, stage, onStart: () => { shareLand = null; startNow(); }, onOwn: () => { shareLand = null; S.friend = null; SHARE.dropLinkFromUrl(); } });
}
window.__sq.start = startNow;

/* ---------- saving the build, so a retry skips the questions ---------- */
const SAVE = 'sq.build'; const RETRY = 'sq.retry'; const FRESH = 'sq.fresh';
const store = { get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }, drop(k) { try { sessionStorage.removeItem(k); } catch { /* private mode */ } } };
const KEEP = ['world', 'name', 'birth', 'sign', 'signHidden', 'age', 'seed', 'place', 'trade', 'build', 'tone', 'desire', 'enemy', 'mentions', 'kinds', 'weaponName', 'mode', 'answers', 'pairs', 'vow', 'friend'];
const PARTS = { minions: MINIONS, get archetype() { return K().ARCHETYPES; }, biome: BIOMES, get nemesis() { return K().NEMESES; }, motive: MOTIVES, get weapon() { return K().WEAPONS; }, get material() { return K().MATERIALS; }, get element() { return K().ELEMENTS; }, resolve: RESOLVES };
function saveBuild() {
  const o = { ids: {}, feed: { calls: feed.calls, cost: feed.cost, latencies: feed.latencies.slice(-400) } };
  for (const k of KEEP) o[k] = S[k];
  for (const k of Object.keys(PARTS)) o.ids[k] = (k === 'biome' ? S.biome?.climate : null) ?? S[k]?.id ?? null;
  store.set(SAVE, o);
}
async function restoreBuild(o) {
  if (o.world && o.world !== 'dark') await apply.world(o.world, { quiet: true });
  for (const k of KEEP) if (o[k] !== undefined && k !== 'world') S[k] = o[k];
  for (const [k, l] of Object.entries(PARTS)) if (k !== 'biome' && k !== 'nemesis') S[k] = byId(l, o.ids?.[k]) || null;
  S.archetype ||= K().ARCHETYPES[0]; S.weapon ||= K().WEAPONS[0]; S.material ||= K().MATERIALS[0]; S.element ||= K().ELEMENTS[0]; S.motive ||= MOTIVES[0];
  if (o.feed) { feed.calls = o.feed.calls || 0; feed.cost = o.feed.cost || 0; feed.latencies = o.feed.latencies || []; tiles(); }
  await setHero(S.archetype.model, false);
  apply.biome(o.ids?.biome || BIOMES[0].id); apply.nemesis(o.ids?.nemesis || 'dragon');
}

/* ---------- the fight ---------- */
async function enterFight({ resume = null } = {}) {
  if (S.stage !== 'build' || !S.weapon) return;
  /* camp hook: the road starts; the camp scene is torn down here. */
  try { camp?.leave(); } catch (err) { console.warn('camp', err); } camp = null;
  S.stage = 'fight'; setStage('fight'); S.seq++; if (!S.quick) qcMod().catch(() => { qcP = null; }); /* the card's module loads with the fight */
  clearTimeout(S.advanceTimer); clearTimeout(finalTimer); hideAsk();
  const pick = (l) => l[S.seed % l.length];
  if (!S.archetype) S.archetype = pick(K().ARCHETYPES);
  if (!S.biome) apply.biome(pick(BIOMES).id);
  if (!S.nemesis) apply.nemesis(pick(K().NEMESES).id);
  if (!S.motive) S.motive = pick(MOTIVES);
  saveBuild();
  onboard?.close(); onboard = null;
  stopVoice();
  for (const id of ['dock', 'prompt', 'dots']) $(id).classList.add('hidden');
  $('feed').classList.add('ticker');
  /* the hand-off in one line while the fight loads: who you are, where, what comes */
  $('loading').classList.remove('hidden'); $('loading').textContent = S.quick ? 'Loading' : handOff();
  if (S.hero) S.hero.root.visible = false;
  thirdPersonOff(); world.camera.clearViewOffset();
  world.camera.position.set(0, 1.95, 0); world.camera.rotation.set(0, 0, 0);
  $('who-name').textContent = S.name || 'Traveller'; $('who-weapon').textContent = S.weaponName ? `· ${S.weaponName}` : '';
  /* a quick-start link tells no story unless it asks for one (?story=1, handled by the fight) */
  S.story = S.quick ? null : tellStory({ name: S.name, place: S.place, land: S.biome.label, motive: S.motive.id, mentions: S.mentions, kinds: S.kinds || mentionKinds((S.mentions || []).slice(0, 3), S.answers?.heart), desire: S.desire, enemyLabel: S.nemesis.label, pronoun: pronounOf(S.nemesis), fellVerb: S.nemesis?.fellVerb, words: S.enemy, ...storyFoes(), worldWords: S.world !== 'dark' ? K().words : undefined });
  let Fight; try { ({ Fight } = await fightMod()); } catch (err) { console.error(err); fightP = null; $('loading').textContent = 'Something went wrong. Reload the page.'; return; } /* lazy fight.js */
  const director = openDirector();
  S.fight = new Fight({
    world, hud, director, kit: K(), archetype: S.archetype, weapon: S.weapon, material: S.material, element: S.element, build: S.build, nemesis: S.nemesis, minions: roadMinions(), enemyWords: S.enemy || '',
    story: S.story, resume, onCamp: (story) => runCamp(story),
    onEnd: (res) => { director.close(); showCard(res); },
  });
  window.__sq.fight = S.fight;
  try { await S.fight.start(); } catch (err) { console.error(err); $('loading').textContent = 'Something went wrong. Reload the page.'; return; }
  $('loading').classList.add('hidden');
}

function handOff() {
  const hero = S.archetype ? bare(S.archetype.label) : null; const land = S.biome ? lower(S.biome.label) : null; const foe = S.nemesis ? lower(S.nemesis.label) : null;
  const who = `${S.name || 'You'}${hero ? `, ${art(hero)} ${hero}` : ''}`;
  return `${who}${land ? `, in ${land}` : ''}.`; /* the goal is the quest card's one line */
}
/* ---------- the camp: after chapter II the fight pauses for one question ---------- */
let campDone = null; let campQuietTimer = null;
function campQuiet() { if (!S.camping) return; clearTimeout(campQuietTimer); campQuietTimer = setTimeout(() => campDone?.(null), 25000); }
function campSubmit() { const t = S.committed.trim(); if (t && campDone) campDone(t); }
/* the example answer fits the question asked (a "because" line does not fit under "What did it take from you?") */
function campExample(story) {
  const ask = String(story.camp?.ask || '').toLowerCase(); const who = story.loved || ''; const are = story.many ? 'are' : 'is';
  if (/promise/.test(ask)) return who ? `That I will bring ${who} home` : 'That I will not stop';
  if (/take from you/.test(ask)) return 'My home, and the people in it';
  if (/know your name/.test(ask)) return 'So nobody forgets where I came from';
  if (/when you are free/.test(ask)) return 'Walk home, and never kneel again';
  if (/hope to find/.test(ask)) return 'A place worth the walk';
  return who ? `Because ${who} ${are} waiting for me` : 'Because nobody else will';
}
async function runCamp(story) {
  /* camp hook: the fight pauses at a dark camp; the camp scene may light its fire here. */
  if (document.pointerLockElement) document.exitPointerLock?.();
  S.camping = true; setStage('camp');
  const box = $('camp'); box.querySelector('h2').textContent = story.camp.ask; box.querySelector('p').textContent = story.camp.hint; $('camp-said').textContent = '';
  box.classList.remove('hidden'); requestAnimationFrame(() => box.classList.add('on'));
  $('dock').classList.remove('hidden'); hideAsk(); $('go').classList.add('hidden'); $('skip').classList.remove('hidden'); $('skip').textContent = 'Skip'; $('back')?.classList.add('hidden');
  $('typed').placeholder = campExample(story);
  $('under-keys').textContent = '';
  clearAnswer();
  if (S.mode === 'voice' && !startVoice()) useTyping(); else if (S.mode !== 'voice') { $('typed').classList.remove('hidden'); $('listen').classList.add('hidden'); setTimeout(() => $('typed').focus(), 50); }
  const text = await new Promise((resolve) => { campDone = (t) => { campDone = null; clearTimeout(campQuietTimer); resolve(t); }; campQuiet(); });
  stopVoice();
  let res = null; let vow = null;
  if (text) {
    lift(text, $('camp-said')); clearAnswer(); box.querySelector('h2').classList.add('wait');
    const r = await api('/api/vow', { text, ask: story.camp.ask }, 9000);
    res = byId(RESOLVES, r?.resolve?.chosen ?? r?.resolve?.lead); vow = res ? (r.vow ?? null) : null;
  }
  if (!res) res = byId(RESOLVES, RESOLVE_BY_MOTIVE[S.motive?.id] || 'love');
  S.resolve = res; S.vow = vow;
  if (text) { S.pairs = S.pairs.filter((p) => p.step !== 'vow'); S.pairs.push({ step: 'vow', words: text, decided: res.label.toLowerCase() }); }
  saveBuild();
  box.querySelector('h2').classList.remove('wait');
  $('dock').classList.add('hidden');
  /* the gift comes from the words on screen: the heart of the answer, what Sage2 hears in it, and what it gives */
  const HEARS = { love: 'love', wrath: 'wrath', defiance: 'defiance', duty: 'duty', hope: 'hope' };
  /* what Sage2 hears is a quiet system note in the feed's mono small caps, apart from the story; the gift is
     its own plain line ("Not alone: you rise once from a killing blow.") */
  /* the note is a chip in the feed's look: the live dot, "Sage2", "hears", the word in the world's accent */
  const sys = box.querySelector('.sys'); if (sys) { void HEARS; sys.textContent = ''; sys.classList.remove('on'); } /* the chip is cut: the feed says what Sage2 heard */
  /* one line: what the answer gives. The player's words stay in quotes above it; they come back once, as
     speech, in the last fight (story.recall) */
  stamp(`${cap(res.note)}.`, '', box, 'soul');
  await wait(Math.max(3500, wordsOf(res.note) * 350));
  box.classList.remove('on'); setTimeout(() => { box.classList.add('hidden'); const sn = box.querySelector('.sys'); if (sn) { sn.textContent = ''; sn.classList.remove('on'); } }, 800);
  await wait(850); /* the camp text is gone before the chapter III card comes (they stacked) */
  S.camping = false; if (S.stage === 'fight') setStage('fight'); else return { resolve: res, vow };
  if (!document.body.classList.contains('touch')) hint('Click to continue', 3500, true); /* a phone has no pointer to lock again */
  return { resolve: res, vow };
}
window.__sq.onCamp = runCamp;
window.__sq.askBetween = askBetween;
window.__sq.showCard = (res) => showCard(res);
/* test hooks for the world modules (tools and probes): apply.world(id), the live camp */
window.__sq.apply = apply; Object.defineProperty(window.__sq, 'camp', { get: () => camp, configurable: true });

/* ---------- the end card: a 4:5 image, 1080x1350. The live scene shows through its top window. ----------
   The window is as tall as the words below it allow: the layout runs from the bottom up, so there is no dead band. */
const CW = 1080; const CH = 1350;
/* the card's type and colours follow the world's ui (game/worlds/<id>.mjs ui: night, cream, ember, serif); dark = these */
const F = { get serif() { return (S.world !== 'dark' && worldById(S.world).ui?.serif) || '"Playfair Display", Georgia, serif'; }, sans: 'Geist, system-ui, sans-serif', mono: '"Geist Mono", ui-monospace, monospace' };
const CP = { c: '237,230,214', cream: '#ede6d6', gold: '#e3b672', night: '#0d0c0b', n: '13,12,11', foot: '#050505', light: false, mark: '#ede6d6' };
/* the card block of a world: ui.card = { panel, ink, accent, foot, dim, dimColor } (panel = the slab under the picture, ink = its text, dim = how dark
   the page goes behind the card, 0..1). A day world without one gets a day default here: storybook golden hour, frontier dusk. */
const CARD_DEFAULTS = {
  storybook: { panel: '#f4e6c4', ink: '#2a2236', accent: '#a5601a', foot: '#ead8b0', dim: 0.3, dimColor: '#3a2814',
    /* the card is a clear golden evening: no storm wall, a few lit clouds, a warm band on the horizon */
    sky: { clouds: 0.14, cells: 0, cloudCol: 0xe6d2bc, cloudLit: 0xfff0d2, top: 0x3a6cc4, hor: 0xe4dcc8, pow: 0.32, band: 0.3, bandCol: 0xffd296 } },
  frontier: { panel: '#2c1c14', ink: '#f2e2c6', accent: '#e39a4c', foot: '#1e130d', dim: 0.55, dimColor: '#140b06' },
};
/* the seal rim per world when the world's words give none (words.sealWon / sealLost win); dark: "Slew {enemy}" */
const SEAL_DEFAULTS = { neon: { sealWon: '{enemy} went dark' }, edo: { sealWon: '{enemy} knelt' } /* the Lord kneels alive on the card */, frontier: { sealWon: 'Ran {enemy} out' }, storybook: { sealWon: 'Broke {enemy}' } };
function cardBlock() { if (S.world === 'dark') return null; const w = worldById(S.world); return w.ui?.card || CARD_DEFAULTS[w.id] || null; }
const luma = (hex) => { const c = (hexRgb(hex) || '0,0,0').split(',').map(Number); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
function cardPalette() {
  const ui = S.world !== 'dark' ? worldById(S.world).ui : null; const cb = cardBlock();
  CP.cream = cb?.ink || ui?.cream || '#ede6d6'; CP.c = hexRgb(CP.cream) || '237,230,214'; CP.gold = cb?.accent || ui?.ember || '#e3b672'; CP.night = cb?.panel || ui?.night || '#0d0c0b'; CP.n = hexRgb(CP.night) || '13,12,11';
  CP.light = luma(CP.night) > 0.5; CP.foot = cb?.foot || (CP.light ? CP.night : '#050505'); CP.mark = ui?.cream || '#ede6d6';
}
/* the pose for the card: won = weapon raised by the fire, lost = down on one knee. Frozen, so the saved PNG matches the screen. */
/* won: standing, the weapon held low and out to the side (clear of the face for every weapon class); lost: kneeling */
const CARD_POSE = { won: ['Idle_Shield_Loop', 0.5], lost: ['Fixing_Kneeling', 1.2] };
/* the three receipts: "your words" -> what Sage2 made. The most personal answers first. */
function receipts(res) {
  const vow = res.vow ?? S.vow ?? null; const resolve = res.resolve || S.resolve;
  const rows = [];
  /* few words, so the row reads at thumbnail size: the heart of a long answer */
  /* two rows (set large for a phone), each quote with a capital ("the company..." and "The road home" mixed) */
  const add = (words, made) => { if (words && made && rows.length < 2) { const w = shortWords(words); rows.push({ words: w.charAt(0).toUpperCase() + w.slice(1), made }); } };
  /* in a world, the row says which words picked the world (the land row reads as a non-sequitur there); dark keeps the land */
  if (S.world !== 'dark' && S.worldSaid) add(S.worldSaid, lower(worldById(S.world).label)); else add(S.answers.origin, S.biome && lower(S.biome.label));
  /* the enemy row quotes the words that name the enemy (the stored enemy words), not the last clause of the answer */
  add(S.enemy && S.enemy !== S.nemesis?.label ? S.enemy : S.answers.enemy, S.nemesis && lower(S.nemesis.label));
  if (S.answers.vow || vow) add(keyPhrase(S.pairs.find((p) => p.step === 'vow')?.words || vow), resolve && `${boonOf(resolve)} (your gift)`); /* not "gift: X", which read as a debug key */
  /* the story already names the ones the hero fights for: the row says why, not who (a name at most twice on the card) */
  add(S.answers.heart, S.motive && `you fight ${S.motive.label.toLowerCase()}`);
  add(S.answers.name, S.name);
  add(S.answers.weapon, S.weaponName);
  return rows;
}
/* who the card speaks to (the first named person; in a friend's run, the one who sent the link) and every line it says */
function shareWords(res) {
  /* a fell link's run is for the sender; a won link's run is for the friend's own person (the sender if they named none) */
  const own = S.friend && S.friend.r !== 'f' ? (S.mentions || []).map((m, i) => [m, (S.kinds || [])[i]]).filter(([m]) => m.text !== S.friend.s) : null;
  const to = S.friend ? (own?.length ? SHARE.primaryOf(own.map(([m]) => m), own.map(([, k]) => k)) : null) || S.friend.s : SHARE.primaryOf(S.mentions, S.kinds || mentionKinds((S.mentions || []).slice(0, 3), S.answers?.heart));
  const me = SHARE.cleanName(S.name) || 'Traveller';
  return { ...SHARE.words({ me, to, won: !!res.won, enemy: S.nemesis?.label, motive: S.motive?.id, friend: S.friend, vow: res.vow ?? S.vow }), to, me };
}
function shortWords(t) { let q = trim(t); if (q.split(' ').length > 5) q = keyPhrase(q); const w = q.split(' '); return w.length > 6 ? `${w.slice(0, 5).join(' ')}…` : q; }
function cardData(res) {
  /* a quick start tells the fight's own story (?story=glory): the card follows it, not the default motive */
  const story = S.story || S.fight?.story || tellStory({ name: S.name, place: S.place, land: S.biome?.label, motive: S.motive?.id, mentions: S.mentions, kinds: S.kinds || mentionKinds((S.mentions || []).slice(0, 3), S.answers?.heart), desire: S.desire, enemyLabel: S.nemesis?.label, pronoun: pronounOf(S.nemesis), fellVerb: S.nemesis?.fellVerb, words: S.enemy, ...storyFoes(), worldWords: S.world !== 'dark' ? K().words : undefined });
  const resolve = res.resolve || S.resolve; const vow = res.vow ?? S.vow ?? null;
  const stage = res.stage || (res.won ? 3 : 1);
  const rows = receipts(res);
  /* a quote the receipts already show is not said twice in the story */
  const shown = rows.map((r) => r.words.toLowerCase());
  const lines = story.card({ won: res.won, vow, resolve: resolve?.label, land: lower(S.biome?.label), weaponName: S.weaponName, weapon: S.weapon?.label, stage, lost: res.lost !== false, deed: res.deed || null })
    .map((l) => l.replace(/, “([^”]*)”,/, (m, q) => (shown.some((w) => w.startsWith(q.toLowerCase().replace(/…$/, '').slice(0, 24))) ? '' : m)));
  /* the weapon is in the sub-line only when the story does not already say its name */
  const told = lines.join(' ').includes(S.weaponName || '\u0000');
  const ww = wordSwap(S.world !== 'dark' ? K().words : null);
  /* the sub-line is what they are and where from; the sign and the weapon are cut */
  const sub = [S.archetype && `${bare(S.archetype.label)} of ${lower(S.biome?.label || ww('the dark road'))}`].filter(Boolean); void told;
  /* the card speaks to the one the player fought for ("Wren, Rowan beat the Dark Twin for you.") */
  const sw = SHARE.SHARE_ON ? shareWords(res) : null;
  return {
    name: S.name || 'Traveller', to: sw?.to || null, cover: sw?.cover || null, scrim: S.world === 'storybook' || S.world === 'edo', stick: sw?.stick || null, sub, lines: sw ? [sw.head, sw.tail].filter(Boolean) : lines /* the vow quote is left out: it names the person in the third person ("him") under a line that speaks to them */, rows, won: res.won, stage,
    /* the seal rim: world words.sealWon / words.sealLost ({enemy} = the nemesis name); the dark text is the default */
    seal: (() => { const sw = S.world !== 'dark' ? { ...(SEAL_DEFAULTS[S.world] || {}), ...(K().words || {}) } : {}; const en = S.nemesis?.label || 'the enemy'; return (res.won ? (sw.sealWon || 'Slew {enemy}') : (sw.sealLost || ww('Fell on the road'))).replace('{enemy}', en).toUpperCase(); })(),
    /* a short run (a quick start) has no numbers worth showing */
    /* the call count and the median live in the Tab feed footer, not on the share card */
    stats: '',
  };
}
/* runs of plain and italic text: the player's own words (in quotes) are set in italics */
function runsOf(text) { return String(text).split(/(“[^”]*”)/).filter(Boolean).map((t) => ({ t, it: t.startsWith('“') })); }
function layout(g, text, size, maxW, fonts) {
  const words = [];
  /* breaks only at plain spaces: a no-break space holds a part of the sub-line together */
  for (const r of runsOf(text)) for (const w of r.t.split(/(?<= )/)) if (w) words.push({ w, it: r.it });
  const lines = []; let line = []; let x = 0; let prevIt = false;
  for (const wd of words) {
    /* the italic closing quote leans over the plain space after it: open the gap a little so "them.” The" never reads as one word */
    if (prevIt && !wd.it && line.length && !/^[,.;:!?…]/.test(wd.w)) x += size * 0.18; prevIt = wd.it; /* no gap before a comma */
    g.font = wd.it ? fonts.it(size) : fonts.plain(size);
    const wdt = g.measureText(wd.w).width; const wNoSpace = g.measureText(wd.w.trimEnd()).width;
    if (x + wNoSpace > maxW && line.length) { lines.push(line); line = []; x = 0; }
    line.push({ ...wd, x }); x += wdt;
  }
  if (line.length) lines.push(line);
  return lines;
}
function drawLines(g, lines, x, y, size, lh, fonts, colors) {
  for (const [i, line] of lines.entries()) for (const wd of line) { g.font = wd.it ? fonts.it(size) : fonts.plain(size); g.fillStyle = wd.it ? colors.it : colors.plain; g.fillText(wd.w, x + wd.x, y + i * lh); }
}
function fitFont(g, font, text, max, start, min) { let s = start; for (; s > min; s -= 2) { g.font = font(s); if (g.measureText(text).width <= max) break; } return s; }
function drawSeal(g, x, y, r, won, text, letter) {
  g.save(); g.translate(x, y); g.rotate(-0.17);
  g.beginPath();
  for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; const rr = r * (1 + 0.04 * Math.sin(a * 7 + 1.3) + 0.025 * Math.sin(a * 13 + 0.4) + 0.015 * Math.sin(a * 23)); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath();
  const grd = g.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.08, 0, 0, r * 1.05);
  if (won) { grd.addColorStop(0, '#c4473a'); grd.addColorStop(0.55, '#86231a'); grd.addColorStop(1, '#4c0f0b'); } else { grd.addColorStop(0, '#5a5550'); grd.addColorStop(0.55, '#2e2a27'); grd.addColorStop(1, '#141210'); }
  g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 26; g.shadowOffsetY = 10; g.fillStyle = grd; g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(0, 0, r * 0.74, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = won ? 'rgba(255,200,180,.28)' : 'rgba(237,230,214,.2)'; g.beginPath(); g.arc(0, -1.5, r * 0.76, 0, Math.PI * 2); g.stroke();
  /* the outcome runs around the rim */
  const ink = won ? 'rgba(255,226,206,.88)' : 'rgba(237,230,214,.78)';
  const rimF = S.world !== 'dark' ? F.serif : F.sans; /* a world seal speaks in the world's type */
  /* the rim reads at phone size: 30 px letters (was 21, down to 13) */
  let size = 30; g.font = `700 ${size}px ${rimF}`;
  const spaced = text.split('').join(' ');
  let rad = r * 0.87 - size * 0.35;
  while (g.measureText(spaced).width / rad > Math.PI * 1.62 && size > 24) { size -= 1; g.font = `700 ${size}px ${rimF}`; rad = r * 0.87 - size * 0.35; }
  const total = g.measureText(spaced).width / rad;
  let a = -Math.PI / 2 - total / 2;
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const ch of spaced) { const w = g.measureText(ch).width / rad; g.save(); g.rotate(a + w / 2 + Math.PI / 2); g.fillText(ch, 0, -rad); g.restore(); a += w; }
  /* the hero's initial, pressed into the middle */
  g.font = `italic 500 ${Math.round(r * 0.72)}px ${F.serif}`; g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(letter, 1.5, r * 0.36 + 2);
  g.fillStyle = ink; g.fillText(letter, 0, r * 0.36);
  g.restore();
}
/* a vermilion hanko for a world card that asks for it (ui.card.seal = 'hanko'; Edo by default): a flat rounded
   square, an inner frame line, a rough ink edge, the initial in cream, and the outcome as one short line under it */
function drawHanko(g, x, y, r, won, text, letter) {
  const h = r * 0.8; const R = h * 0.16; const ink = won ? '#b8321e' : '#5a4a44';
  g.save(); g.translate(x, y); g.rotate(-0.05); g.globalAlpha = 0.92;
  const rr = (k) => { const e = h * k; g.beginPath(); g.moveTo(-e + R, -e); g.arcTo(e, -e, e, e, R); g.arcTo(e, e, -e, e, R); g.arcTo(-e, e, -e, -e, R); g.arcTo(-e, -e, e, -e, R); g.closePath(); };
  rr(1); g.fillStyle = ink; g.fill();
  g.globalAlpha = 1; g.lineWidth = 4; g.strokeStyle = 'rgba(255,240,222,.85)'; rr(0.86); g.stroke();
  g.font = `600 ${Math.round(h * 1.1)}px ${F.serif}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f6ead6';
  g.fillText(letter || '\u5370', 0, h * 0.06);
  /* the rough ink edge: specks taken out of the stamp */
  g.globalCompositeOperation = 'destination-out'; let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) { const side = Math.floor(rnd() * 4); const t = (rnd() * 2 - 1) * h; const o = h * (0.9 + rnd() * 0.12); const px = side < 2 ? t : (side === 2 ? -o : o); const py = side < 2 ? (side ? o : -o) : t; g.beginPath(); g.arc(px, py, 1 + rnd() * 2, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  g.restore();
  g.save(); g.font = `600 30px ${F.serif}`; /* 12 px read at 6 px on a phone; 30 px */ g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = won ? '#d2603e' : 'rgba(237,230,214,.7)';
  g.fillText(String(text || '').toUpperCase(), x, y + h + 12); g.restore();
}
/* a holo chip for a near-future card (ui.card.seal = 'holo'): a rounded-square chip with a cyan rim in the
   world ember, a 7 x 7 grid of cells from a hash of the hero's name (a QR-like code), a soft glow, the outcome under it */
function drawHolo(g, x, y, r, won, text, letter) {
  const h = r * 0.78; const R = h * 0.22; const css = getComputedStyle(document.documentElement);
  const ember = (css.getPropertyValue('--ember') || '#38e8ff').trim() || '#38e8ff'; const col = won ? ember : 'rgba(170,180,190,.75)';
  const rr = (k) => { const e = h * k; g.beginPath(); g.moveTo(-e + R * k, -e); g.arcTo(e, -e, e, e, R * k); g.arcTo(e, e, -e, e, R * k); g.arcTo(-e, e, -e, -e, R * k); g.arcTo(-e, -e, e, -e, R * k); g.closePath(); };
  g.save(); g.translate(x, y); g.rotate(-0.06);
  g.shadowColor = col; g.shadowBlur = won ? 28 : 8; rr(1); g.fillStyle = 'rgba(6,12,18,.88)'; g.fill(); g.shadowBlur = 0;
  g.lineWidth = 2.5; g.strokeStyle = col; rr(1); g.stroke(); g.globalAlpha = 0.35; g.lineWidth = 1; rr(0.9); g.stroke(); g.globalAlpha = 1;
  /* the code: a 7 x 7 grid, three corner finder squares, the rest from the name's hash */
  let sd = 7; for (const c of String(S.name || letter || 'S')) sd = (sd * 31 + c.charCodeAt(0)) % 2147483647; sd = sd || 11;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const N = 7; const cell = (h * 1.3) / N; const o = -cell * N / 2; const finder = (i, j) => (i < 2 && j < 2) || (i > 4 && j < 2) || (i < 2 && j > 4);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const on = finder(i, j) || rnd() < 0.48; if (!on) continue;
    g.globalAlpha = finder(i, j) ? 0.95 : 0.55 + rnd() * 0.4; g.fillStyle = col; g.fillRect(o + i * cell + 1.5, o + j * cell + 1.5, cell - 3, cell - 3);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.restore();
  g.save(); g.font = `600 28px ${F.sans}`; /* legible at phone size; 28 px */ g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = col;
  g.fillText(String(text || '').toUpperCase(), x, y + h + 12); g.restore();
}
/* shortens at a word boundary, with an ellipsis, until it fits: never in the middle of a word */
function fitWords(g, text, maxW) {
  let words = trim(text).split(' '); let q = `“${words.join(' ')}”`;
  while (g.measureText(q).width > maxW && words.length > 1) { words = words.slice(0, -1); q = `“${words.join(' ').replace(/[,;:.]+$/, '')}…”`; }
  return q;
}
/* where everything on the card goes; textTop: the top of the name (the scene sits above it), win: where the panel is solid */
function cardLayout(g, d) {
  const X = 64; const MAXW = CW - 2 * X;
  const L = { X, MAXW };
  /* footer, from the bottom up: the last line, the stats, three receipts */
  /* the card is 1080 wide: body 34 to 40 px, labels 28 px and up, nothing under 26 */
  L.lastY = CH - 46; L.statsY = d.stats ? L.lastY - 50 : L.lastY - 10;
  L.rowY = []; for (let i = d.rows.length - 1, y = L.statsY - (d.stats ? 56 : 58); i >= 0; i--, y -= 62) L.rowY[i] = y;
  L.footTop = (d.rows.length ? L.rowY[0] : L.statsY) - 50;
  L.rowW = { q: [], made: [] };
  const fonts = { plain: (s) => `400 ${s}px ${F.sans}`, it: (s) => `italic 500 ${Math.round(s * 1.08)}px ${F.serif}` };
  const subFonts = { plain: (s) => `italic 400 ${s}px ${F.serif}`, it: (s) => `italic 400 ${s}px ${F.serif}` };
  const subText = d.sub.map((x) => x.replace(/ /g, ' ')).join(' · ');
  for (let size = 40; size >= 34; size -= 1) {
    const lines = layout(g, d.lines.join(' '), size, MAXW, fonts); const lh = Math.round(size * 1.34);
    const storyTop = L.footTop - 34 - lines.length * lh;
    let subSize = 34; let sub = layout(g, subText, subSize, MAXW - 270, subFonts);
    while (sub.length > 1 && subSize > 28) { subSize -= 1; sub = layout(g, subText, subSize, MAXW - 250, subFonts); }
    const subLh = Math.round(subSize * 1.3); const subTop = storyTop - 30 - sub.length * subLh;
    g.font = `italic 500 128px ${F.serif}`;
    const nameSize = fitFont(g, (s2) => `italic 500 ${s2}px ${F.serif}`, d.name, MAXW - 270, 128, 64);
    const nameY = subTop - 14;
    Object.assign(L, { size, lines, lh, storyTop, subSize, sub, subLh, subTop, nameSize, nameY, fonts, subFonts, textTop: nameY - nameSize * 0.8, win: nameY - nameSize * 0.2 });
    if (L.textTop > 500) break;
  }
  return L;
}
/* ta: the text's alpha (the panel lands first, the words fade in once the held frame has gone) */
function drawCard(g, d, shot, ta = 1) {
  cardPalette();
  /* the tape cover (the share on); ?share=off keeps the quiet card below */
  if (SHARE.SHARE_ON && card?.L?.cover) { COVER.drawCoverCard(g, d, card.coverShot || shot, ta, { CW, CH, L: card.L, logo: cardLogo, site: SHARE.SITE, names: [d.name, d.to] }); return; }
  const L = card?.L || cardLayout(g, d); const { X, MAXW } = L;
  g.clearRect(0, 0, CW, CH); g.globalAlpha = 1;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  if (shot) { g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, CW, L.win); g.drawImage(shot.src, shot.sx, shot.sy, shot.sw, shot.sh, 0, 0, CW, L.win); }
  /* the window: soft edges, then a fall into the dark panel behind the name */
  const vg = g.createRadialGradient(CW / 2, L.win * 0.45, L.win * 0.3, CW / 2, L.win * 0.45, CW * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${S.world === 'neon' ? 0.22 : 0.45})`); g.fillStyle = vg; g.fillRect(0, 0, CW, L.win); /* the neon card art read as dim mud: a lighter edge there */
  const fallTop = L.textTop - 120;
  const fall = g.createLinearGradient(0, fallTop, 0, L.win);
  fall.addColorStop(0, `rgba(${CP.n},0)`); fall.addColorStop(0.75, `rgba(${CP.n},.85)`); fall.addColorStop(1, CP.night);
  g.fillStyle = fall; g.fillRect(0, fallTop, CW, L.win - fallTop);
  g.fillStyle = CP.night; g.fillRect(0, L.win, CW, CH - L.win);
  g.globalAlpha = ta;
  /* the wordmark, quiet, top left */
  if (SHARE.SHARE_ON && cardLogo) { g.imageSmoothingEnabled = false; g.drawImage(cardLogo, 46, 30, cardLogo.width * 2, cardLogo.height * 2); g.imageSmoothingEnabled = true; } /* the title's pixel logo */
  else { g.font = `italic 500 34px ${F.serif}`; g.fillStyle = `rgba(${hexRgb(CP.mark) || CP.c},.82)`; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 12; g.fillText('Sage Quest', 60, 82); g.shadowColor = 'transparent'; }
  /* name, then the sub-line: what they are, where from, under which sign, with what */
  g.font = `italic 500 ${L.nameSize}px ${F.serif}`; g.fillStyle = CP.cream; g.shadowColor = CP.light ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,.6)'; g.shadowBlur = 24;
  g.fillText(d.name, X - 4, L.nameY); g.shadowColor = 'transparent';
  drawLines(g, L.sub, X, L.subTop + L.subSize, L.subSize, L.subLh, L.subFonts, { plain: `rgba(${CP.c},.72)`, it: `rgba(${CP.c},.72)` });
  /* the story: the player's words in italics */
  drawLines(g, L.lines, X, L.storyTop + L.size, L.size, L.lh, L.fonts, { plain: `rgba(${CP.c},.9)`, it: CP.gold });
  /* the seal over the edge of the window */
  ({ hanko: drawHanko, holo: drawHolo }[cardBlock()?.seal || { edo: 'hanko', neon: 'holo' }[S.world]] || drawSeal)(g, CW - 178, L.nameY - L.nameSize * 0.35, 124, d.won, d.seal, (d.name[0] || 'S').toUpperCase());
  /* the receipts: "your words" -> what Sage2 made */
  g.globalAlpha = 1; g.fillStyle = CP.foot; g.fillRect(0, L.footTop, CW, CH - L.footTop); g.globalAlpha = ta;
  g.fillStyle = `rgba(${CP.c},.1)`; g.fillRect(0, L.footTop, CW, 1);
  d.rows.forEach((r, i) => {
    const y = L.rowY[i];
    g.font = `600 31px ${F.sans}`; const made = `→  ${r.made}`; const mw = g.measureText(made).width;
    g.font = `italic 500 35px ${F.serif}`; const q = fitWords(g, r.words, MAXW - mw - 24); const qw = g.measureText(q).width;
    g.fillStyle = `rgba(${CP.c},.92)`; g.fillText(q, X, y);
    g.font = `600 31px ${F.sans}`; g.fillStyle = CP.gold; g.fillText(made, X + qw + 24, y);
  });
  /* the stats: a quiet footer, small and dim */
  if (d.stats) { g.font = `400 20px ${F.mono}`; g.fillStyle = `rgba(${CP.c},.42)`; g.fillText(d.stats, X, L.statsY); g.fillStyle = `rgba(${CP.c},.1)`; g.fillRect(X, L.statsY + 20, MAXW, 1); }
  g.font = `italic 500 30px ${F.serif}`; g.fillStyle = `rgba(${CP.c},.9)`; g.fillText('Assembled by Sage2', X, L.lastY);
  g.font = `600 28px ${F.sans}`; g.textAlign = 'right'; g.fillStyle = `rgba(${CP.c},.82)`; g.fillText(SITE, CW - X, L.lastY); g.textAlign = 'left';
}
let card = null;
/* the title's banded sun low in the card's sky, kept in the same place in the view as the camera settles; the rim goes hot */
let coverSunOff = null;
function coverSun() {
  try {
    coverSunOff?.(); const sun = COVER.makeSun({ motion: !matchMedia('(prefers-reduced-motion: reduce)').matches }); world.scene.add(sun.mesh);
    if (world.rim) { world.rim.color.set(0xff5a2a); world.rim.intensity = Math.max(world.rim.intensity, 4); }
    if (!coverSunOff && world.renderer) world.renderer.toneMappingExposure *= 1.18; /* the card is graded hot, so a little brighter */
    const v = new THREE.Vector3(); let t = 0;
    const off = world.addUpdater((dt) => { if (S.stage !== 'card') return; t += dt || 0; const cam = world.camera; cam.getWorldDirection(v); v.y = 0; v.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.14); v.y = Math.tan(-0.035); sun.place(cam, v, (cam.fov * Math.PI / 180) * 0.55, 36); sun.u.uT.value = t; });
    coverSunOff = () => { off?.(); sun.dispose(); coverSunOff = null; };
  } catch (err) { console.warn('cover sun', err); }
}
/* the card: a long weapon (pole, two-handed) in a kneeling hero's hands swings across the fire and through the companions.
   It is planted upright in the ground at the hero's side away from the fire, the butt in the earth and a slight lean. */
const PLANT_AT = new THREE.Vector3(-0.5, 0, -0.22);
function plantCardWeapon(h) {
  const hand = h.slot('handslotr'); const g = hand && hand.children.find((c) => c.userData.forged); if (!g || !h.root.parent) return;
  h.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(); const box = new THREE.Box3(); const m = new THREE.Matrix4();
  g.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); } });
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()); const ax = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const sign = Math.abs(box.max[ax]) >= Math.abs(box.min[ax]) ? 1 : -1; const butt = sign > 0 ? -box.min[ax] : box.max[ax];
  const tip = new THREE.Vector3(); tip[ax] = sign;
  const parent = h.root.parent; parent.attach(g);
  const wq = g.getWorldQuaternion(new THREE.Quaternion()); const ws = g.getWorldScale(new THREE.Vector3()).x;
  const nq = new THREE.Quaternion().setFromUnitVectors(tip.clone().applyQuaternion(wq), new THREE.Vector3(-0.2, 1, -0.04).normalize()).multiply(wq);
  const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert(); g.quaternion.copy(pq.multiply(nq));
  const foot = h.root.getWorldPosition(new THREE.Vector3()).add(PLANT_AT); foot.y += 0.02;
  const buttW = tip.clone().multiplyScalar(-Math.max(0, butt) * ws).applyQuaternion(nq);
  const at = foot.sub(buttW); parent.worldToLocal(at); g.position.copy(at); g.updateMatrixWorld(true);
}
async function showCard(res) {
  /* camp hook: the run is over. The camp comes back for the card: the stone with the name, the sign in the sky, the fire. */
  S.stage = 'card'; setStage('card'); S.camping = false;
  /* a card that fails to build never leaves the screen black */
  const fadeSafety = setTimeout(() => { $('card').style.visibility = ''; hud.fade(0, 400); hud.unfreeze(400); }, 9000);
  /* the fight may leave the letterbox on (a boss death cam): the card clears it, and hud.cinema stays off from here */
  document.body.classList.remove('cine', 'chap'); quietHint(); $('legend').classList.remove('on'); $('hud').classList.add('hidden'); $('cross').classList.add('hidden');
  $('feed').classList.remove('ticker', 'aside');
  for (const id of ['camp', 'dock']) $(id).classList.add('hidden');
  /* the world's serif must be in before the card canvas draws */
  try { await Promise.race([document.fonts.load(`600 64px ${F.serif}`), new Promise((r) => setTimeout(r, 2500))]); } catch { /* the card draws with the fallback */ }
  try { camp?.leave(); } catch { /* gone */ }
  try {
    camp = new Camp(world); if (S.world !== 'dark') camp.setWorld(worldById(S.world), S.worldMod?.camp || null); camp.enter(null); camp.onReframe = reframe; camp.onShot = campShot;
    camp.restore({ name: S.name || 'Traveller', birth: S.birth, sign: S.sign, biome: S.biome, place: S.place, weaponName: S.weaponName, element: S.element, won: !!res.won });
    /* the run's enemy is in the picture: fallen and far on a win, looming over the hero on a loss (the fight took it out of the sky) */
    /* a won card shows no enemy (a far fallen shape read as a blob) */
    if (S.nemesis && !res.won) { world.nemesisId = null; world.setNemesis(mechOf(S.nemesis), S.heroUrl, S.nemesis.id); }
    else if (world.nemesis) { world.nemesis.leaving = true; world.nemesis.t = 0; world.nemesisId = null; }
  } catch (err) { console.warn('camp', err); camp = null; }
  /* a world card may want its own sky (ui.card.sky, or the default for the world): the land's storm stays out of the picture */
  try { const cs = S.world !== 'dark' ? cardBlock()?.sky ?? CARD_DEFAULTS[S.world]?.sky : null; if (cs) world.lands?.cardSky(cs); } catch (err) { console.warn('card sky', err); }
  if (S.hero) {
    const h = S.hero; h.root.visible = true; h.root.position.set(0, 0, 0);
    /* the fight may have knocked off the helm or the hood: the card always shows the class's full look, never a bare head */
    /* in the world's look when the archetype has one (the card hero wears what the fight hero wore) */
    const wlook = S.world !== 'dark' && !S.heroBare ? S.archetype?.look || null : null;
    if (wlook?.wear && worldWear() && !h.userData?.worldWorn) { try { await h.wear(worldWear()); } catch (err) { console.warn('card wear', err); } }
    await dressHero(h, S.archetype?.model || 'Knight', false, wlook);
    camp?.setHero(h, true);
    await attachGear(); /* the world's gear for the weapon id (a world picked after the forge swaps the dark gear) */
    /* no glowing eyes on the card: the face is lit by the fire */
    h.eyes(0); h.root.traverse((n) => { if (n.isMesh && /SQ_Eyes/.test(n.material?.name || '')) n.visible = false; });
    /* the shield idle lifts a shield or buckler across the face (storybook, neon cards): a hero with one stands
       in the sword idle, both arms low, so the share image shows the face */
    const shielded = /shield|buckler|riot/i.test(String(S.weapon?.offhand || ''));
    /* a won card holds the weapon in its class pose (world.js holdFor, here weaponHold: an axe up, a staff planted, a pistol aimed), not the shield idle */
    const hold = res.won && !shielded ? weaponHold(S.weapon) : null;
    const [clip, at] = hold ? [standClip(h, hold), hold.t] : res.won && shielded && h.has('Sword_Idle') ? ['Sword_Idle', 0.5] : CARD_POSE[res.won ? 'won' : 'lost']; h.play(h.has(clip) ? clip : 'Idle', { fade: 0 }); h.mixer.update(at); S.freeze = true;
    if (hold) { holdHero(h, S.weapon, { ms: 0, fade: 0 }); h.mixer.update(0.3); } /* the fade from the fight pose finishes first (a short update left the arms half way) */
    if (!res.won && ['pole', 'two'].includes(S.weapon?.cls)) plantCardWeapon(h);
    /* a skinned hood keeps its standing bounds: in the kneel it was culled and left a bare head. Nothing on the hero is culled on the card. */
    h.root.traverse((n) => { if (n.isMesh) n.frustumCulled = false; });
    /* a bowed hood seen from above is all grazing angle: its rim light washed it into a smooth peach ball (it read as a bare head).
       On a lost card the hood keeps only a trace of rim, so it reads as dark cloth. */
    if (!res.won) for (const m of h.parts?.get('Hood') || []) { const r = m.material?.userData?.rim; if (r) r.value = Math.min(r.value, 0.12); }
  }
  thirdPersonOff = world.addUpdater(thirdPerson);
  world.camera.fov = 45; world.camera.updateProjectionMatrix();
  /* a second card in one page frees the first card's boss figure */
  if (card?.fig) { const f0 = card.fig; Promise.resolve(f0).then((f) => f?.dispose?.()).catch(() => {}); }
  const d = cardData(res); card = { d, res };
  await Promise.race([Promise.all([document.fonts.load(`italic 500 64px ${F.serif}`), document.fonts.load(`italic 400 32px ${F.serif}`), document.fonts.load(`400 24px ${F.sans}`), document.fonts.load(`600 22px ${F.sans}`), document.fonts.load(`400 22px ${F.mono}`), SHARE.SHARE_ON ? COVER.coverFonts() : null, SHARE.SHARE_ON ? SHARE.logoImage().then((c) => { cardLogo = c || cardLogo; }) : null]), wait(3000)]);
  /* the card shows whole, never as an empty frame with two buttons first: it is laid out unseen, drawn, then shown */
  $('card').style.visibility = 'hidden'; $('card').classList.remove('hidden');
  const cv = $('card-img'); const g = cv.getContext('2d');
  card.L = SHARE.SHARE_ON ? COVER.coverLayout(g, d, { CW, CH, call: !d.won && d.lines[1] ? d.lines[1].replace(/[.!]$/, '') : null }) : cardLayout(g, d);
  aimCamera('card', { snap: true }); camp?.replaceSign(0.8, 0.34);
  if (SHARE.SHARE_ON) coverSun();
  /* the ones the story is about sit by the fire on the card, with their names */
  await camp?.restoreCompanions(S.mentions || [], S.answers?.heart || '', S.kinds || mentionKinds((S.mentions || []).slice(0, 3), S.answers?.heart));
  aimCamera('card', { snap: true });
  /* the card's words wait until the held death frame has faded (they showed as ghost text over the wreck) */
  drawCard(g, d, null, 0);
  $('card').style.visibility = ''; hud.fade(0, 600); hud.unfreeze(560); clearTimeout(fadeSafety);
  setTimeout(() => { const t0 = performance.now(); const step = () => { if (card?.d !== d) return; const k = Math.min(1, (performance.now() - t0) / 260); drawCard(g, d, null, k); if (k < 1) requestAnimationFrame(step); }; step(); }, 420);
  cv.setAttribute('aria-label', `${d.name}, ${d.sub.join(', ')}. ${d.lines.join(' ')} ${d.seal.toLowerCase()}. ${d.rows.map((r) => `${r.words}: ${r.made}`).join('. ')}.`);
  $('retry').classList.toggle('hidden', !(!res.won && (d.stage >= 3 || SHARE.SHARE_ON)));
  /* a lost card offers Try again as plainly as the share (the same build; the boss again once it was reached) */
  if (SHARE.SHARE_ON && !res.won) { $('retry').textContent = 'Try again'; $('retry').classList.add('primary'); $('card-side').insertBefore($('retry'), $('again')); }
  { $('again').textContent = SHARE.SHARE_ON && !res.won ? 'New quest' : 'Play again'; /* four buttons on a win (Post on X, Copy link, Save image, Play again) */ /* one label in every world; "New quest" beside "Try again" (they read as the same) */
  /* a world nemesis says how it ends (its `death` line: "The giant breaks into rain."); the dark line is the default */
  /* no caption beside the buttons: the death line ("The giant breaks into rain.") read as a leftover subtitle */
  $('card-note').textContent = ''; } /* no developer hint by the share card (Tab still opens the feed) */
  sfx('piece');
  $('save').classList.toggle('hidden', SHARE.SHARE_ON);
  if (SHARE.SHARE_ON) mountShare(res); else $('save').focus();
  /* models that load late can move the stone or hero bounds: aim once more when they are in */
  camp?.ready().then(() => { if (S.stage === 'card') { aimCamera('card', { snap: true }); camp?.replaceSign(0.8, 0.34); } });
}
/* The image: the window region of the live canvas, rendered sharp from the same camera and the same frozen pose. */
function saveImage() {
  if (!card) return;
  const out = document.createElement('canvas'); out.width = CW; out.height = CH; const g = out.getContext('2d');
  const r = $('card-img').getBoundingClientRect(); const src = world.renderer.domElement;
  const onTouch = document.body.classList.contains('touch'); /* a phone draws the card at 2x at most (memory), and shares it (a download link does nothing in an in-app browser) */
  const pr = world.renderer.getPixelRatio(); const want = Math.min(onTouch ? 2 : 3, Math.max(pr, CW / r.width));
  world.renderer.setPixelRatio(want); world.composer.setPixelRatio?.(want); world.resize();
  rig.update(0, innerWidth, innerHeight);
  world.composer.render();
  const k = src.width / innerWidth;
  drawCard(g, card.d, { src, sx: r.left * k, sy: r.top * k, sw: r.width * k, sh: r.height * (card.L.win / CH) * k });
  world.renderer.setPixelRatio(pr); world.composer.setPixelRatio?.(pr); world.resize();
  out.toBlob((b) => {
    if (!b) return;
    const fname = `sage-quest-${(card.d.name || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    if (onTouch && navigator.canShare) { try { const file = new File([b], fname, { type: 'image/png' }); if (navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Sage Quest' }).catch(() => { /* closed */ }); return; } } catch { /* no file share here: the link below */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b);
    a.download = fname;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
  window.__sq.lastImage = out;
}
$('save').addEventListener('click', saveImage);
/* the same frozen frame, rendered sharp, handed to a drawer (the 1600 x 900 share image) */
function renderShot(use) {
  const r = $('card-img').getBoundingClientRect(); const src = world.renderer.domElement;
  const pr = world.renderer.getPixelRatio(); const want = Math.min(3, Math.max(pr, (CW / r.width) * 1.25));
  world.renderer.setPixelRatio(want); world.composer.setPixelRatio?.(want); world.resize();
  rig.update(0, innerWidth, innerHeight); world.composer.render();
  const k = src.width / innerWidth;
  try { use({ src, sx: r.left * k, sy: r.top * k, sw: r.width * k, sh: r.height * (card.L.win / CH) * k }); } finally { world.renderer.setPixelRatio(pr); world.composer.setPixelRatio?.(pr); world.resize(); }
}
async function shareImage(w) {
  const out = document.createElement('canvas'); out.width = SHARE.SW; out.height = SHARE.SH; const g = out.getContext('2d');
  cardPalette();
  /* the staged picture (the boss lit over the fallen hero; the hero's victory with the boss down), else the card's crop */
  const res = card?.res; let m = null; let fig = null; let logo = null;
  try { [m, fig, logo] = await Promise.all([stageMod(), card?.fig || null, SHARE.logoImage(), SHARE.SHARE_ON ? COVER.coverFonts() : null]); } catch (err) { console.warn('share stage', err); }
  /* the game in one line: the player's own words and what Sage2 made of them (the card's enemy row) */
  const ew = S.enemy && S.enemy !== S.nemesis?.label ? S.enemy : S.answers?.enemy; const ews = ew ? shortWords(ew) : '';
  const hook = ews && S.nemesis?.label && ews.length <= 34 ? `“${ews.charAt(0).toUpperCase() + ews.slice(1)}” became ${lower(S.nemesis.label)}.` : null;
  const cover = SHARE.SHARE_ON;
  const drawCover = (src) => COVER.drawCoverShare(g, { shot: src ? { src } : null, head: w.head, cover: w.cover, stick: w.stick, scrim: S.world === 'storybook' || S.world === 'edo', call: w.call ? w.call.replace(/[.!]$/, '') : '', won: !!(res?.won ?? w.result === 'w'), names: [w.me, w.to], hook, site: w.site || SHARE.SITE, logo, seal: card?.d?.seal || '' });
  const draw = cover ? (shot) => { if (shot?.full) return drawCover(shot.src); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(shot.sw)); c.height = Math.max(1, Math.round(shot.sh)); c.getContext('2d').drawImage(shot.src, shot.sx, shot.sy, shot.sw, shot.sh, 0, 0, c.width, c.height); drawCover(c); } : (shot) => SHARE.drawShare(g, { shot, head: w.head, tail: w.tail, quote: '', call: w.call, hook, site: w.site || SHARE.SITE, logo, names: [w.me, w.to], pal: { night: CP.night, n: CP.n, cream: CP.cream, c: CP.c, gold: CP.gold, light: CP.light, serif: F.serif, sans: F.sans } });
  let staged = null;
  if (m && S.hero && S.stage === 'card') { try { staged = SHARE.SHARE_ON ? m.titleShot({ world, hero: S.hero, fig, won: !!res?.won, tint: coverTint(), W: 1600, H: 900, aside: 0.2, top: res?.won ? 0.24 : 0.12, bottom: 0.15 }) : m.shareShot({ world, camp, hero: S.hero, fig, won: !!res?.won, accent: shareAccent() }); } catch (err) { console.warn('share shot', err); staged = null; } }
  if (staged) draw({ full: true, src: staged }); else renderShot(draw);
  window.__sq.lastShareImage = out;
  return new Promise((ok) => out.toBlob((b) => ok(b), 'image/png'));
}
/* the card's window shows the same staged scene as the posted picture (the boss over the fallen hero, or the hero's
   win with the boss down), under the sun; one still, rendered once the boss figure is in */
async function coverCardShot(res) {
  if (!SHARE.SHARE_ON || !card?.L?.cover) return; const c0 = card;
  try {
    const [m, fig] = await Promise.all([stageMod(), card.fig || null]); await wait(60);
    if (card !== c0 || S.stage !== 'card' || !S.hero) return;
    const wh = Math.round(card.L.win); const src = m.titleShot({ world, hero: S.hero, fig, won: !!res.won, tint: coverTint(), W: CW, H: wh, aside: 0, top: Math.min(0.42, (res.won ? 320 : 250) / wh), bottom: Math.min(0.45, Math.max(0.06, (wh - card.L.textTop + 20) / wh)) });
    if (!src || card !== c0) return;
    card.coverShot = { src, sx: 0, sy: 0, sw: src.width, sh: src.height };
    drawCard($('card-img').getContext('2d'), card.d, null, 1);
  } catch (err) { console.warn('cover card shot', err); }
}
function mountShare(res) {
  if (!card) return;
  const w = shareWords(res); card.share = w;
  /* the boss for the share picture, built now (hidden) so the picture is ready when the player asks for it */
  if (S.nemesis && !card.fig) { const c0 = card; card.fig = stageMod().then((m) => m.bossFigure({ worldId: S.world, nemId: S.nemesis.id, mech: mechOf(S.nemesis), accent: shareAccent() })).then((f) => { if (card !== c0 || S.stage !== 'card') { f.dispose(); return null; } f.object.visible = false; world.scene.add(f.object); return f; }).catch((err) => { console.warn('share boss', err); return null; }); }
  coverCardShot(res);
  const link = { s: w.me, t: w.to || '', w: S.world, l: S.biome?.climate || S.biome?.id || '', b: S.nemesis?.id || '', r: w.result, m: S.motive?.id || '', h: S.archetype?.id || '', bt: S.seed % 2 ? 'f' : 'm' /* the hero's body type travels with the link */ };
  const url = SHARE.linkUrl(link); window.__sq.shareUrl = url; window.__sq.shareWords = w;
  const box = SHARE.mountPanel($('card-side'), { w, url, makeImage: () => shareImage(w), fname: `sage-quest-${w.me.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'hero'}.png` });
  box.querySelector('button')?.focus();
}
window.__sq.shareImage = (w) => (card?.share ? shareImage(w ? { ...card.share, ...w } : card.share) : null); /* test hook: render the share picture (w = other words) */
/* Play again = a new run from the first question: a reload (nothing stale) that skips the title */
$('again').addEventListener('click', () => { if (S.quick) { location.reload(); return; } store.drop(SAVE); store.set(FRESH, 1); location.reload(); });
$('retry').addEventListener('click', () => {
  if (S.quick) { const q = new URLSearchParams(location.search); q.set('wave', 'boss'); location.search = q.toString(); return; }
  const resolve = (card?.res.resolve || S.resolve)?.id || RESOLVE_BY_MOTIVE[S.motive?.id] || 'love';
  store.set(RETRY, { mode: (card?.d.stage ?? 3) >= 3 ? 'boss' : 'run', resume: { resolve, vow: card?.res.vow ?? S.vow ?? null } }); location.reload();
});

for (const id of ['start', 'go-voice', 'go-type']) $(id)?.addEventListener('click', () => startNow());
window.addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.stage === 'title' && !$('title').classList.contains('hidden') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); startNow(); } });
$('skip').addEventListener('click', () => skipNow());
$('back')?.addEventListener('click', () => backStep());
$('go').addEventListener('click', () => { if (S.stage === 'build' && S.weapon) enterFight(); });

/* ---------- boot ---------- */
let thirdPersonOff = world.addUpdater(thirdPerson);
world.addUpdater((dt) => { if (S.hero && S.stage !== 'fight' && !S.freeze) S.hero.mixer.update(dt); });
setHero('Knight', true);
/* In the fight the feed is a small ticker in a corner, and it steps aside whenever an enemy is behind it. */
const _fp = new THREE.Vector3();
let tickerN = 0;
function tickerClear() {
  if (++tickerN % 6) return; /* perf: the rect read forces a layout: every 6th frame is enough for a ticker that steps aside */
  const el = $('feed'); const f = S.fight; if (!f || el.classList.contains('hidden')) return;
  const r = el.getBoundingClientRect(); const W = innerWidth; const H = innerHeight; let hit = false;
  for (const foe of f.foes || []) {
    if (!foe?.pos || foe.state === 'dead') continue;
    for (const y of [0.1, 1.0, 2.0]) {
      _fp.set(foe.pos.x, (foe.pos.y || 0) + y, foe.pos.z).project(world.camera);
      if (_fp.z > 1) continue;
      const x = (_fp.x + 1) / 2 * W; const yy = (1 - _fp.y) / 2 * H;
      if (x > r.left - 40 && x < r.right + 40 && yy > r.top - 40 && yy < r.bottom + 40) { hit = true; break; }
    }
    if (hit) break;
  }
  el.classList.toggle('aside', hit);
}
const gameDt = makeClock();
function frame(now) {
  /* quality.js decides whether this frame is drawn at all: under the opaque title reel the 3D waits (one warm frame
     every 2.5 s, after its programs are compiled in parallel), and a 100+ Hz screen that cannot hold its rate draws every 2nd frame */
  const Q = world._quality; const f0 = performance.now();
  const titleUp = S.stage === 'title' && !$('title').classList.contains('hidden');
  if (Q && Q.gate(now, titleUp && !TITLE2)) { requestAnimationFrame(frame); return; }
  /* a phone held upright in a fight: the game holds until it is turned (touch.js sets __sq.hold); the clock is read so no time piles up */
  if (window.__sq.hold) { gameDt(now); requestAnimationFrame(frame); return; }
  /* the one warm frame under the title also draws the hero (hidden until Start), so its buffers and textures are on the GPU */
  const warmHero = titleUp && !TITLE2 && S.hero && !S.hero.root.visible; if (warmHero) S.hero.root.visible = true;
  const dt = gameDt(now); /* perf: clamped; a lone hitch advances the game by at most 50 ms (quality.js makeClock) */
  const focus = S.stage === 'fight' && S.fight ? S.fight.pos : null;
  if (camp && S.stage !== 'fight') {
    const L = layoutNow(); camp.setLayout(L);
    /* the band shrank or grew (the sentence took a third line): fit the camera to it again, smoothly */
    if (S.stage === 'build' && shotId && aimedBand && Math.abs(L.band.y1 - aimedBand.y1) + Math.abs(L.band.y0 - aimedBand.y0) > 12) aimCamera(shotId, { rate: 1.2 });
  }
  if (S.stage === 'fight') tickerClear();
  camp?.update(dt);
  world.update(dt, focus);
  if (warmHero) S.hero.root.visible = false;
  Q?.cpuNote(performance.now() - f0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__sq.ready = true;
/* fetch fight.js once the title has painted and the main thread is idle (the forge and the road need it) */
{ const pre = () => fightMod().catch(() => { fightP = null; }); if (window.requestIdleCallback) setTimeout(() => requestIdleCallback(pre, { timeout: 4000 }), 1500); else setTimeout(pre, 3000); }

/* Quick start for tests and replays, no questions asked:
   ?fight=sword&material=iron&element=fire&hero=knight&land=ashlands&nemesis=dragon&wave=first&words=... */
const qs = new URLSearchParams(location.search);
const retry = store.get(RETRY); const saved = store.get(SAVE);
/* a touch device with no keyboard or mouse (a phone) sees the title and a plain notice; ?phone=1 forces it */
/* a touch device now plays (touch.js: stick, look, buttons). The old "Play on a computer" card stays for
   ?phone=1 and for a touch device opened with ?desktoponly=1 */
const TOUCH_ONLY = !!window.__sqPhone || (matchMedia('(hover: none) and (pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches); /* the same test as the head probe (index.html): pointer, user agent, screen */
const PHONE = qs.get('phone') === '1' || (qs.get('desktoponly') === '1' && matchMedia('(hover: none) and (pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
if (!PHONE && (TOUCH_ONLY || qs.get('touch') === '1')) installTouch({ S, $, sfxVoice, unlockAudio });
if (PHONE && !qs.has('fight')) {
  document.body.classList.add('phone'); $('phone')?.classList.remove('hidden');
  $('phone-copy')?.addEventListener('click', async () => { const url = location.origin + location.pathname; try { if (navigator.share) await navigator.share({ title: 'Sage Quest', url }); else { await navigator.clipboard.writeText(url); $('phone-copy').textContent = 'Link copied'; } } catch { /* closed */ } });
}
const freshRun = store.get(FRESH); store.drop(FRESH);
/* a link (?f=...) opens a landing over the title; Play again or a retry never shows it again */
const shareLink = freshRun || (retry && saved) || PHONE ? null : SHARE.readLink(); if (freshRun) SHARE.dropLinkFromUrl();
if (qs.has('fight')) { store.drop(RETRY); quickFight(qs); } else if (freshRun) { startTitle(); startNow(); } else if (retry && saved) retryFight(saved, retry); else if (qs.has('world')) { S.worldPicked = true; apply.world(qs.get('world'), { quiet: true }).then(() => { /* a forced world: its own land behind the title camp (the first land it lists) */ const wl = Object.keys(worldById(S.world).lands || {})[0]; const land = wl && !S.biome ? K().landFor(wl) : null; if (land) world.setBiome(land, S.seed); startTitle(); }); } else startTitle();
if (shareLink) friendLanding(shareLink); /* share */
const QUICK_WORDS = { dark: 'the cold that eats the old roads', neon: 'the tower that owns the whole city', edo: 'the lord who takes every harvest', frontier: 'the baron who owns the railroad', storybook: 'the storm that swallows the kingdom' };
const MINION_GUESS = [
  ['clerks', /\b(compan|corporat|office|employer|work|bureau|bank|firm|system|paperwork)/i],
  ['debts', /\b(debt|money|rent|loan|bills?|broke|price)/i], ['doubts', /\b(doubt|fear|anxi|fraud|myself|my own)/i],
  ['ghosts', /\b(ex|grief|loss|past|memor|regret|died)\b/i], ['hounds', /\b(bully|rival|competit|predator|hunt)/i],
  ['watchers', /\b(parent|expect|societ|critic|social media|judg)/i], ['chains', /\b(addict|habit|trap|dead-end|stuck)/i],
  ['plagues', /\b(ill|sick|pain|injur|tired|burnout|disease)/i], ['hours', /\b(deadline|older|time|clock)\b/i], ['liars', /\b(lie|liar|betray|cheat|fake)/i],
];
function quickMinions(words) { for (const [id, re] of MINION_GUESS) if (re.test(words)) return id; return null; }
async function quickFight(q) {
  S.quick = true;
  S.name = 'Rowan'; S.seed = 7; S.build = Number(q.get('build')) || 2.5; S.mode = 'type'; S.place = 'New Orleans';
  S.mentions = [{ kind: 'loved one', text: 'Wren' }, { kind: 'loved one', text: 'Ash' }];
  S.kinds = ['person', 'animal'];
  if (q.get('nobody') === '1') { S.mentions = []; S.kinds = []; } /* the player named no one */
  /* ?world=<id>; a world land id in land= also names its world */
  const lh = landHome(q.get('land') || '');
  const wq = q.get('world') || lh?.world || 'dark';
  if (wq !== 'dark') await apply.world(wq, { quiet: true });
  S.archetype = byId(K().ARCHETYPES, q.get('hero') || 'knight') || K().ARCHETYPES[0];
  S.stage = 'build'; setStage('fight');
  $('title').classList.add('hidden');
  await setHero(S.archetype.model, false);
  S.weapon = byId(K().WEAPONS, q.get('fight')) || K().WEAPONS[0];
  S.material = byId(K().MATERIALS, q.get('material') || 'iron') || K().MATERIALS[0];
  S.element = byId(K().ELEMENTS, q.get('element') || 'fire') || K().ELEMENTS[0];
  S.motive = MOTIVES[0]; S.weaponName = 'Wren\'s Oath';
  apply.biome(q.get('land') || BIOMES[0].id); apply.nemesis(q.get('nemesis') || 'dragon');
  /* with no words= the enemy words fit the world (they show under the boss name and on the card) */
  S.enemy = q.get('words') || QUICK_WORDS[S.world] || QUICK_WORDS.dark;
  /* the enemy's people follow the enemy words as Sage2 would pick them (minions= forces an id); words with no clear
     kind (every world's default words) keep the world's own foe names: Bandit, Outlaw, Runner, Goblin, Hollow Thrall */
  if (q.has('story')) S.minions = byId(MINIONS, q.get('minions') || quickMinions(q.get('words') || '')) || null;
  /* test hook for def.fly: ?fly=1.5[&flyfoe=rogue] makes that foe type hover (neon's Drone sets fly in its world entry) */
  if (q.has('fly')) { const fid = q.get('flyfoe') || 'rogue'; const fd = (K().FOES || []).find((d) => d.id === fid); if (fd) fd.fly = Number(q.get('fly')) || 1.5; }
  $('feed').classList.remove('hidden');
  window.__sq.firstWave = q.get('wave') || 'first';
  await enterFight();
}
async function retryFight(o, flag) {
  store.drop(RETRY);
  S.stage = 'build'; setStage('fight');
  $('title').classList.add('hidden');
  await restoreBuild(o);
  $('feed').classList.remove('hidden');
  window.__sq.firstWave = flag.mode === 'boss' ? 'boss' : undefined;
  const resume = flag.mode === 'boss' ? { resolve: flag.resume?.resolve || RESOLVE_BY_MOTIVE[S.motive?.id] || 'love', vow: flag.resume?.vow ?? null } : null;
  if (resume) { S.resolve = byId(RESOLVES, resume.resolve); S.vow = resume.vow; }
  await enterFight({ resume });
}

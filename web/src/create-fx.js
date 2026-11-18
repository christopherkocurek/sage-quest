/* the sounds of the two payoffs (the name cut into the stone, the forge) and the
   local read of a weapon answer.
   - fx(name): small procedural sounds on the game's own audio chain (sfx.js sfxVoice): a chisel tick, a low stone boom,
     an anvil strike, a quench hiss, a charge swell and the reveal chord. Every call is also written to window.__cxlog
     ([ms, name]) so a test can list the sounds beside the frames.
   - readArms(text, kit, seed): the obvious weapon, material and element words in the player's own answer ("a silver spear
     that carries frost" = spear, silver, frost). The forge shows that look from its first frame, before Sage2 answers,
     and uses it when Sage2 does not answer in time (never "the standard sword" under "a silver spear").
   ?create=off never calls this file. */
import { sfxVoice } from './sfx.js';

export function cxlog(name) { try { (window.__cxlog ||= []).push([Math.round(performance.now()), name]); } catch { /* no window */ } }

let noiseBuf = null;
function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = Math.floor(ctx.sampleRate * 1.5); noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function env(ctx, g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function tone(v, type, f0, f1, dur, peak, delay = 0) {
  const { ctx, out } = v; const t = ctx.currentTime + delay; const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(ctx, g, t, 0.006, peak, dur); o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function hiss(v, type, f0, f1, dur, peak, q = 0.8, delay = 0, attack = 0.005) {
  const { ctx, out } = v; const t = ctx.currentTime + delay; const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain(); env(ctx, g, t, attack, peak, dur); s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.05);
}
const SOUNDS = {
  /* a chisel bite: a bright crack and a short ring (pitch a little different each letter) */
  chisel: (v, k) => { hiss(v, 'bandpass', 5200, 2600, 0.05, 0.5, 1.2); tone(v, 'triangle', 2100 + (k % 5) * 140, 2000, 0.09, 0.12); tone(v, 'sine', 3300 + (k % 3) * 200, 3200, 0.06, 0.05); },
  /* the name is whole: a low stone boom with dust */
  boom: (v) => { tone(v, 'sine', 82, 38, 1.1, 0.75); tone(v, 'sine', 123, 60, 0.7, 0.3, 0.01); hiss(v, 'lowpass', 600, 90, 0.9, 0.5, 0.7); },
  /* a hammer on hot metal: a heavy ring and a thud (n = the strike, it rings higher as the blade takes shape) */
  anvil: (v, n) => { const b = 440 + n * 70; [1, 2.76, 5.4].forEach((m, i) => tone(v, i ? 'triangle' : 'sine', b * m, b * m * 0.985, 0.9 - i * 0.2, 0.22 / (1 + i))); tone(v, 'sine', 120, 45, 0.25, 0.7); hiss(v, 'highpass', 6000, 3000, 0.06, 0.6, 0.7); },
  /* the quench: a steam hiss that swells and fades */
  quench: (v) => { hiss(v, 'highpass', 2600, 5200, 1.3, 0.42, 0.6, 0, 0.04); hiss(v, 'bandpass', 900, 400, 0.6, 0.25, 0.9); },
  /* a staff, a bow or a gun charges instead of being hammered */
  charge: (v, n) => { tone(v, 'sine', 180 + n * 60, 720 + n * 120, 0.45, 0.16); tone(v, 'triangle', 360 + n * 120, 1440 + n * 240, 0.4, 0.06, 0.03); hiss(v, 'bandpass', 800, 4000, 0.4, 0.18, 2); },
  /* the weapon is lifted: a bright major chord with a shimmer above */
  chord: (v) => { [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(v, i === 3 ? 'triangle' : 'sine', f, f, 1.8, 0.14, i * 0.035)); tone(v, 'sine', 1046.5, 1046.5, 1.4, 0.05, 0.16); hiss(v, 'highpass', 8000, 6000, 1.0, 0.08, 0.5, 0.05, 0.2); },
};
export function fx(name, k = 0) {
  cxlog(name);
  const v = sfxVoice(); if (!v || !SOUNDS[name]) return;
  try { if (v.ctx.state !== 'running') return; SOUNDS[name](v, k); } catch (err) { console.warn('cx fx', name, err); }
}

/* the player's weapon words (no network): the first weapon word, the material and the element */
const W_WORDS = [
  ['spear', /\b(spear|lance|pike|javelin|trident|halberd|naginata|glaive)s?\b/i], ['staff', /\b(staff|staves|wand|rod|sceptre|scepter)s?\b/i],
  ['greatsword', /\b(greatsword|claymore|zweihander|great sword|big sword|huge sword)s?\b/i], ['maul', /\b(maul|hammer|mace|club|flail|morning star)s?\b/i],
  ['axe', /\b(axe|axes|hatchet|cleaver|tomahawk)\b/i], ['daggers', /\b(dagger|daggers|knife|knives|shiv|kunai)\b/i],
  ['bow', /\b(bow|longbow|crossbow|arrows?)\b/i], ['rifle', /\b(rifle|shotgun|carbine|musket)s?\b/i], ['pistol', /\b(pistol|revolver|gun|handgun|blaster)s?\b/i],
  ['sword', /\b(sword|blade|sabre|saber|katana|rapier|scimitar|cutlass)s?\b/i],
];
const M_WORDS = [['silver', /\b(silver|mithril|moon|moonlight|chrome|platinum|mirror|white metal)\b/i], ['gold', /\b(gold|golden|sun|sunlight|royal|holy)\b/i],
  ['bone', /\b(bone|dragonbone|fang|tooth|teeth|claw|skull)s?\b/i], ['obsidian', /\b(obsidian|black|glass|void|onyx|night)\b/i], ['iron', /\b(iron|steel)\b/i]];
const E_WORDS = [['frost', /\b(frost|ice|icy|cold|snow|freez\w*|winter|glacier|chill)\b/i], ['fire', /\b(fire|flame\w*|burn\w*|lava|ember\w*|heat|blaz\w*|inferno|sun)\b/i],
  ['storm', /\b(storm|lightning|thunder\w*|electric\w*|spark\w*|shock)\b/i], ['shadow', /\b(shadow\w*|dark\w*|poison\w*|death|curse\w*|blood|soul\w*|void)\b/i]];
/* where each word sits in the text (the first weapon word said wins, so "a spear with a sword's edge" is a spear) */
const first = (list, text) => { let best = null; for (const [id, re] of list) { const m = re.exec(text); if (m && (!best || m.index < best.at)) best = { id, at: m.index }; } return best?.id || null; };
export function readArms(text, kit, seed = 0) {
  const t = String(text || ''); const by = (arr, id) => (id ? (arr || []).find((x) => x.id === id) || null : null);
  const wid = first(W_WORDS, t); const mid = first(M_WORDS, t); const eid = first(E_WORDS, t);
  /* a world may not offer the weapon (the dark world has no guns): its first weapon stands in, the look stays the player's */
  const weapon = by(kit.WEAPONS, wid) || (wid === 'pistol' || wid === 'rifle' ? by(kit.WEAPONS, 'pistol') || by(kit.WEAPONS, 'rifle') || by(kit.WEAPONS, 'bow') : null) || kit.WEAPONS[0];
  const material = by(kit.MATERIALS, mid) || by(kit.MATERIALS, 'iron') || kit.MATERIALS[0];
  const element = by(kit.ELEMENTS, eid) || kit.ELEMENTS[seed % kit.ELEMENTS.length];
  return { weapon, material, element, said: !!(wid || mid || eid), saidWeapon: !!by(kit.WEAPONS, wid) };
}
/* how the forge makes it: blades are hammered; a staff, a bow or a gun is charged (no hammer) */
export const forgeKind = (weapon) => (/^(staff)$/.test(weapon?.id) ? 'staff' : /^(bow)$/.test(weapon?.id) || /bow|yumi/.test(weapon?.gear || '') ? 'bow' : /^(pistol|rifle)$/.test(weapon?.id) || /revolver|rifle|stunner/.test(weapon?.gear || '') ? 'gun' : 'blade');
/* the forge's first-frame look for a read: metal colour and the element's heat */
export const lookOf = (a) => (a ? { metal: a.material?.color ?? 0x8a8f99, rough: a.material?.rough ?? 0.4, metalness: a.material?.metal ?? 0.9, hot: a.element?.color ?? 0xffa040, kind: forgeKind(a.weapon) } : null);

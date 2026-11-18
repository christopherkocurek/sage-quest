/* the link codec, pure (no window): the browser (share.js) and the link-preview function (api/og.js) both use it.
   Code = base64url of "1|sender|to|world|land|nemesis|result|motive"; result w = won, f = fell, c = finished what the
   receiver began. Every field is checked on read; fields after the 8th are ignored; anything wrong returns null. */
export const WORLD_IDS = ['dark', 'edo', 'neon', 'frontier', 'storybook'];
export const MOTIVE_IDS = ['protect', 'revenge', 'glory', 'freedom', 'wonder'];
const MAX_NAME = 24;
const MAX_CODE = 400;

/* letters (any script), combining marks, spaces, apostrophes and hyphens; emoji, symbols and direction marks are
   dropped (no space left in the word), punctuation and digits become a space; 24 characters at most */
export function cleanName(raw, max = MAX_NAME) {
  let s = String(raw ?? '').slice(0, 400).normalize('NFC').replace(/[‘’ʼ]/g, "'");
  s = s.replace(/[\p{Extended_Pictographic}\p{Cf}\p{Co}\p{Cn}\p{Sk}\p{So}\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}]/gu, '');
  s = s.replace(/(\p{M}{2})\p{M}+/gu, '$1'); /* no stacks of marks */
  s = s.replace(/[^\p{L}\p{M}' -]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^['\- ]+|['\- ]+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '') || s.slice(0, max);
  s = s.trim().replace(/['\-]+$/g, '');
  return /\p{L}/u.test(s) ? s : '';
}
/* a link can carry any name: a link whose names are slurs, hate or look like an account warning opens the plain title
   instead (read side only; a player's own card still shows what they said). A short list, not a moderation system. */
/* moderation list for share names, stored encoded (base64 of space-separated words) */
const BLOCK_WORDS = new Set(atob('bmlnZ2VyIG5pZ2dhIG5pZ2dlcnMgZmFnZ290IGZhZyBmYWdzIHNwaWMgY2hpbmsgdHJhbm55IHJldGFyZCByZXRhcmRlZCBjdW50IHdob3JlIHNsdXQgcmFwaXN0IHJhcGUgcGVkbyBwZWRvcGhpbGUgcGFlZG8gaGl0bGVyIG5hemkgbmF6aXMga2trIGFjY291bnQgYWNjb3VudHMgbG9ja2VkIHN1c3BlbmRlZCB2ZXJpZnkgdmVyaWZpY2F0aW9uIGxvZ2luIHBhc3N3b3JkIHN1cHBvcnQgYWRtaW4gb2ZmaWNpYWwgc2VjdXJpdHkgYmFuayB3YWxsZXQgcmVmdW5kIHBheW1lbnQgY29vbiBwYWtpIGdvb2sgd2V0YmFjayByYWdoZWFkIHRvd2VsaGVhZCBwYWVkb3BoaWxlIGtpa2VzIGt5a2VzIGNoaW5reSBkeWtlcyBzcGlrcw==').split(' '));
const BLOCK_PARTS = atob('bmlnZ2VyIG5pZ2dhIGZhZ2dvdCBra2s=').split(' '); /* slur stems that are blocked inside a longer single word */
export function blocked(name) {
  const t = String(name || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
  const hit = (w) => BLOCK_WORDS.has(w) || BLOCK_PARTS.some((x) => w.includes(x));
  const parts = t.split(/[\s'-]+/).filter(Boolean);
  /* a word spaced or hyphenated into short pieces: join the pieces and check the stems */
  if (parts.length > 1 && parts.every((w) => w.length <= 3) && BLOCK_PARTS.some((x) => parts.join('').includes(x))) return true;
  /* a word split into pieces ("ab cd", "a-b-c-d"): join each run of pieces and check it as a whole word */
  const word = (w) => BLOCK_WORDS.has(w) || BLOCK_WORDS.has(w.replace(/s$/, '')) || BLOCK_WORDS.has(w.replace(/es$/, '')) || BLOCK_WORDS.has(w.replace(/ies$/, 'y'));
  for (let i = 0; i < parts.length; i++) { let j = parts[i]; for (let k = i + 1; k < parts.length && k < i + 10; k++) { j += parts[k]; if (word(j)) return true; } }
  return parts.some((w) => hit(w) || hit(w.replace(/s$/, '')) || hit(w.replace(/es$/, '')) || hit(w.replace(/ies$/, 'y')));
}
/* "my mom" -> "Mom", "dad" -> "Dad", "my brother Wren" -> "Wren", "Wren" -> "Wren" */
const REL = 'mom|mum|mother|dad|father|brother|sister|son|daughter|wife|husband|partner|girlfriend|boyfriend|friend|best friend|grandma|grandpa|grandmother|grandfather|nan|nana|papa|mama|kids|children|family|uncle|aunt|cousin|baby|boy|girl|coach|dog|cat|pup|puppy';
export function displayName(text) {
  let t = String(text || '').trim();
  t = t.replace(/^(for\s+)?(my|our)\s+/i, '');
  const m = new RegExp(`^(?:little |big |old |late |best )?(?:${REL})\\s+(\\S.*)$`, 'i').exec(t);
  if (m && /^[\p{Lu}]/u.test(m[1])) t = m[1];
  t = cleanName(t);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
/* the one name the card speaks to: the first named person, else the first named one (a pet) */
export function primaryOf(mentions = [], kinds = []) {
  const list = (mentions || []).map((m, i) => ({ name: displayName(m?.text), kind: kinds?.[i] || 'person' })).filter((x) => x.name);
  return (list.find((x) => x.kind !== 'animal') || list[0] || null)?.name || null;
}

const b64u = {
  enc(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(code) {
    if (typeof code !== 'string' || !code || code.length > MAX_CODE || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
    try { const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4)); const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0)); return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
  },
};
const ID = /^[a-z0-9_-]{1,20}$/;
export function encodeLink(d) {
  const f = ['1', cleanName(d.s), cleanName(d.t), WORLD_IDS.includes(d.w) ? d.w : 'dark', ID.test(d.l || '') ? d.l : '', ID.test(d.b || '') ? d.b : '', ['w', 'f', 'c'].includes(d.r) ? d.r : 'w', MOTIVE_IDS.includes(d.m) ? d.m : ''];
  /* a ninth field, the sender's hero class (the landing shows their figure); a link without it still reads */
  /* a tenth field, the sender's body type 'm' | 'f' (the landing shows the same figure); the ninth is then written empty when there is no class, so the order holds. Old links stop at nine and still read. */
  const bt = d.bt === 'm' || d.bt === 'f' ? d.bt : '';
  if (ID.test(d.h || '') || bt) f.push(ID.test(d.h || '') ? d.h : '');
  if (bt) f.push(bt);
  return b64u.enc(f.join('|'));
}
export function decodeLink(code) {
  const raw = b64u.dec(code); if (!raw) return null;
  const f = raw.split('|'); if (f.length < 8 || f[0] !== '1') return null;
  const s = cleanName(f[1]); const t = cleanName(f[2]); if (!s || blocked(s) || blocked(t)) return null;
  return { v: 1, s, t, w: WORLD_IDS.includes(f[3]) ? f[3] : 'dark', l: ID.test(f[4]) ? f[4] : '', b: ID.test(f[5]) ? f[5] : '', r: ['w', 'f', 'c'].includes(f[6]) ? f[6] : 'w', m: MOTIVE_IDS.includes(f[7]) ? f[7] : '', h: ID.test(f[8] || '') ? f[8] : '', bt: f[9] === 'm' || f[9] === 'f' ? f[9] : '' };
}
export function codeFromPath(p) { const m = /^\/f\/([A-Za-z0-9_-]{1,400})\/?$/.exec(String(p || '')); return m ? m[1] : null; }
/* a relation with no name ("my brother" -> "Brother") is not printed as a name: "their brother" about the player,
   "your brother" to the player, "my brother" in the player's own post. Never his or her. */
const REL_ONE = new RegExp(`^(?:(?:little|big|old|late|best|younger|older|baby)\\s+)?(?:${REL})s?$`, 'i');
export function relationOf(name) { const t = String(name || '').trim().replace(/\s+/g, ' '); return t && REL_ONE.test(t) ? t.toLowerCase() : null; }
/* the one fought for, as a phrase: who = 'their' | 'your' | 'my' (a proper name is returned as it is) */
export function forWhom(to, who = 'their', cap = false) { const r = relationOf(to); if (!r) return to; const t = `${who} ${r}`; return cap ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
/* the preview line for a link (og:title); the page text is the landing's own (share.js landingWords) */
export function previewTitle(d) {
  if (!d) return 'Sage Quest';
  if (!d.t) return d.r === 'f' ? `${d.s} fell. Can you finish it?` : `${d.s} fought for something. What would you fight for?`;
  const t3 = forWhom(d.t, 'their'); const T3 = forWhom(d.t, 'their', true);
  if (d.r === 'f') return `${d.s} fell fighting for ${t3}. ${T3} can finish it.`;
  if (d.r === 'c') return `${d.s} finished what ${t3} began.`;
  return `${d.s} fought for ${t3}.`;
}

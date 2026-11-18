/* Share loop ( share): "Who do you fight for?" -> the card says who -> "Send it to Wren" -> the link opens a landing
   for Wren, and Wren plays with Rowan at their side (for a "fell" link: against the same enemy, in the same world).
   Nothing is stored anywhere: the link carries the data. ?share=off turns all of it off (the plain heart hint and card).

   Link: /f/<base64url of "1|sender|to|world|land|nemesis|result|motive|hero">  result: w = won, f = fell, c = finished; hero = the sender's class for the landing figure
   what the receiver began. Names: letters, marks, spaces, apostrophes and hyphens, 24 characters at most. Every field
   is checked on read; a broken or unknown link returns null and the normal title shows. All text goes in by textContent. */

const qs = new URLSearchParams(location.search);
export const SHARE_ON = qs.get('share') !== 'off';
import { cleanName, displayName, primaryOf, encodeLink, decodeLink, codeFromPath, relationOf, forWhom } from './share-link.js';
import { coverFonts } from './cover.js'; /* the title's pixel fonts for the landing and the panel */
export { cleanName, displayName, primaryOf, encodeLink, decodeLink };

/* the link is /f/<code> (its own path, so the host can answer link-preview bots with the names: api/og.js); ?f=<code> also works */
export function readLink() { if (!SHARE_ON || qs.has('fight')) return null; try { return decodeLink(codeFromPath(location.pathname) || qs.get('f')); } catch { return null; } }
export function linkUrl(d) { return `${location.origin}/f/${encodeLink(d)}`; }
export function dropLinkFromUrl() { try { const q = new URLSearchParams(location.search); if (!q.has('f') && !codeFromPath(location.pathname)) return; q.delete('f'); const s = q.toString(); history.replaceState(null, '', '/' + (s ? `?${s}` : '') + location.hash); } catch { /* old browser */ } }

/* ---------- words ---------- */
const lower = (t) => String(t || '').replace(/^The /, 'the ');
const CAUSE = { protect: 'the people at home', revenge: 'home', glory: 'a name', freedom: 'the open road', wonder: 'the far light' };
export const causeOf = (motive) => CAUSE[motive] || CAUSE.protect;
/* what the card, the image and the post say. me = the player, to = the one they fought for (or null), friend = the link they came from */
export function words({ me, to, won, enemy, motive, friend, vow }) {
  const en = lower(enemy || 'the enemy'); const En = en.charAt(0).toUpperCase() + en.slice(1); const cause = causeOf(motive);
  const finished = won && friend?.r === 'f' && to && friend.s === to;
  /* call = the image's call;
     line = the one line under "Send it to Wren" by the card */
  let head; let tail = ''; let post; let call = 'Fight for someone.'; let line;
  /* a relation with no name: "their brother" (about the player), "your brother" (to the player), "my brother" (their own post) */
  const rel = relationOf(to); const t3 = forWhom(to, 'their'); const T3 = forWhom(to, 'their', true); const t2 = forWhom(to, 'your'); const T2 = forWhom(to, 'your', true); const t1 = forWhom(to, 'my');
  if (finished) { head = `${me} finished what ${t3} began.`; tail = `${En} is down.`; post = rel ? `I finished what ${t1} began. ${En} is down. Fight for someone in Sage Quest:` : `${to}, I finished what you began. ${En} is down. Fight for someone in Sage Quest:`; call = `${En} is down.`; line = `${T2} should see this.`; }
  else if (won && to && rel) { head = `${me} beat ${en} for ${t3}.`; post = `I beat ${en} for ${t1}. Your turn: who would you fight for? Sage Quest:`; call = 'Your turn.'; line = `${T2} should see this.`; }
  else if (won && to) { head = `${to},\n${me} beat ${en} for you.`; /* the cover blurb; "Wren," on its own line (it read as one name, "Wren Rowan") */ post = `${to}, I beat ${en} for you. Your turn: who would you fight for? Sage Quest:`; call = 'Your turn.'; line = `${to} should see this.`; }
  else if (won) { head = `${me} beat ${en} for ${cause}.`; post = `I beat ${en} for ${cause}. Fight for someone in Sage Quest:`; line = 'Who should see this?'; }
  else if (to) { head = `${me} fell fighting for ${t3}.`; tail = `${T3} can finish it.`; post = rel ? `I fell fighting for ${t1} in Sage Quest. Finish it for me:` : `${to}, I fell fighting for you in Sage Quest. Finish it for me:`; call = tail; line = `Ask ${t2} to finish it.`; }
  else { head = `${me} fell fighting for ${cause}.`; tail = `${En} still stands.`; post = `I fell to ${en} in Sage Quest. Who finishes it?`; call = 'Who finishes it?'; line = 'Who can finish it?'; }
  const q = String(vow || '').trim().replace(/^because\s+/i, '').replace(/[.,;:…]+$/, '');
  const quote = q && q.split(/\s+/).length <= 9 ? `“${q.charAt(0).toUpperCase() + q.slice(1)}${/[!?]$/.test(q) ? '' : '.'}”` : '';
  /* the cover line in the title's pixel type, and the sticker (big word, small line) */
  const cover = finished ? `${me} finished it for ${t3}` : won ? (to ? `${me} beat ${en} for ${t3}` : `${me} beat ${en}`) : (to ? `${me} fell fighting for ${t3}` : `${me} fell to ${en}`);
  const stick = won ? ['QUEST CLEAR', ''] : ['2P', to && !rel ? `${to}'s turn` : 'Your turn'];
  return { cover, stick, head, tail, quote, call, line, post, send: to ? `Send it to ${t2}` : 'Send it to someone', result: finished ? 'c' : won ? 'w' : 'f' };
}
/* the landing a link opens over the title */
export function landingWords(d, enemyLabel) {
  const en = lower(enemyLabel || 'the enemy'); const En = en.charAt(0).toUpperCase() + en.slice(1);
  if (!d.t) return d.r === 'f' ? { h: `${d.s} fell fighting for ${causeOf(d.m)}.`, p: `${En} still stands. ${d.s} walks with you.`, go: 'Finish it' } : { h: `${d.s} beat ${en} for ${causeOf(d.m)}.`, p: 'Your turn. Who do you fight for?', go: 'Start now' };
  if (d.r === 'f') return { h: `${d.s} fell fighting for you.`, p: `${En} still stands. ${d.s} walks with you.`, go: 'Finish it' };
  if (d.r === 'c') return { h: `${d.s} finished it for you.`, p: `Your turn. ${d.s} walks with you.`, go: 'Start your quest' };
  return { h: `${d.s} beat ${en} for you.`, p: `Your turn. ${d.s} walks with you.`, go: 'Start your quest' };
}
/* the address under the image: the public one when the page runs on this machine */
export const SITE = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || !location.host ? 'sage-quest-one.vercel.app' : location.host;
/* the title's pixel logo (web/assets/title/b: layers drawn bottom to top), as one 230 x 57 canvas; null if it fails */
let logoP = null;
export function logoImage() {
  if (logoP) return logoP;
  const dir = '/assets/title/b/'; const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
  logoP = (async () => {
    let order = ['swordGlow', 'glow', 'sword', 'back', 'shield', 'face', 'glint']; let w = 230; let h = 57;
    try { const o = await (await fetch(`${dir}order.json`)).json(); if (Array.isArray(o.drawOrder)) order = o.drawOrder; if (o.size1x) [w, h] = o.size1x; } catch { /* the default order */ }
    const ims = await Promise.all(order.map((n) => load(`${dir}${n}-1x.png`).catch(() => null)));
    if (!ims.some(Boolean)) return null;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    for (const im of ims) if (im) g.drawImage(im, 0, 0);
    return cv;
  })().catch(() => null);
  return logoP;
}

/* ---------- styles (own block, so index.html stays as it is) ---------- */
let styled = false;
function style() {
  if (styled) return; styled = true;
  const css = `
  #share-land { position: fixed; inset: 0; z-index: 40; display: flex; align-items: flex-end; justify-content: flex-start; padding: clamp(20px, 7vh, 80px) clamp(16px, 6vw, 96px); background: #07070a; opacity: 0; transition: opacity .5s; overflow: hidden; }
  #share-land.on { opacity: 1; }
  #share-land .share-stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; opacity: 0; transition: opacity 1.4s ease; }
  #share-land .share-stage.on { opacity: 1; }
  #share-land .wash { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(7,7,10,.86) 0%, rgba(7,7,10,.6) 34%, rgba(7,7,10,0) 58%), linear-gradient(0deg, rgba(7,7,10,.7) 0%, rgba(7,7,10,0) 38%); }
  #share-land .logo { position: absolute; z-index: 2; top: clamp(16px, 4vh, 40px); left: clamp(8px, calc(6vw - 8px), 88px); width: clamp(200px, 26vw, 460px); height: auto; image-rendering: pixelated; }
  #share-land .who { position: absolute; left: 0; top: 0; z-index: 1; font-family: var(--serif); font-style: italic; font-size: clamp(18px, 2vw, 26px); color: #ffd6a0; text-shadow: 0 0 14px rgba(255,140,60,.7), 0 2px 6px rgba(0,0,0,.8); opacity: 0; transition: opacity .8s; pointer-events: none; white-space: nowrap; }
  #share-land .who.on { opacity: 1; }
  #share-land .in { position: relative; z-index: 2; max-width: 620px; text-align: left; display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
  #share-land h1 { margin: 0; font-family: var(--serif); font-style: italic; font-weight: 500; font-size: clamp(40px, 6.4vw, 92px); line-height: 1.02; color: var(--cream); letter-spacing: -.01em; overflow-wrap: anywhere; text-wrap: balance; text-shadow: 0 2px 24px rgba(0,0,0,.6); }
  #share-land h1 bdi:first-child { color: #f2c27a; }
  #share-land h1 + p { margin-top: 8px; }
  #share-land p { margin: 0; font-size: clamp(19px, 2.1vw, 26px); line-height: 1.35; color: var(--cream); max-width: 30ch; text-wrap: balance; text-shadow: 0 1px 12px rgba(0,0,0,.8); }
  #share-land .btn.big { height: 76px; padding: 0 48px; font-size: 25px; font-weight: 700; border-radius: 999px; margin-top: 10px; background: #f2c27a; color: #160f08; border: 0; box-shadow: 0 0 0 3px rgba(242,194,122,.28), 0 10px 40px rgba(255,150,60,.35); }
  #share-land .btn.big:hover, #share-land .btn.big:focus-visible { background: #ffd697; outline: 3px solid #fff3dc; outline-offset: 3px; }
  #share-land .free { font-size: 15px; color: var(--cream-2); text-shadow: 0 1px 8px rgba(0,0,0,.8); margin-top: -4px; }
  #share-land .own { background: none; border: 0; color: var(--cream-2); font: inherit; font-size: 16px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 8px 0; min-height: 44px; }
  @media (max-aspect-ratio: 10/11) { #share-land { justify-content: center; } #share-land .in { text-align: center; align-items: center; } #share-land .wash { background: linear-gradient(0deg, rgba(7,7,10,.96) 0%, rgba(7,7,10,.86) 40%, rgba(14,3,20,.62) 56%, rgba(14,3,20,.3) 64%, rgba(14,3,20,0) 72%); } #share-land .logo { left: 50%; transform: translateX(-50%); } #share-land .btn.big { width: min(100%, 360px); } }
  @media (max-height: 520px) and (orientation: landscape) { #share-land .in { gap: 8px; max-width: 52vw; } #share-land h1 { font-size: 34px; } #share-land p { font-size: 17px; } #share-land .btn.big { height: 54px; font-size: 20px; padding: 0 32px; margin-top: 4px; } #share-land .own { min-height: 36px; } #share-land .logo { width: 180px; } #share-land .who { display: none; } }
  #share-box .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  #share-land .own:hover, #share-land .own:focus-visible { color: var(--cream); }
  body.share-landing #title > :not(.reel) { visibility: hidden !important; }
  #share-box { display: flex; flex-direction: column; gap: 10px; }
  #share-box h3 { margin: 0; font-family: var(--serif); font-style: italic; font-weight: 500; font-size: 31px; line-height: 1.1; color: var(--cream); text-shadow: var(--shadow); overflow-wrap: anywhere; }
  #share-box .why { margin: -2px 0 6px; font-size: 17px; line-height: 1.35; color: var(--cream-2); text-shadow: var(--shadow); }
  #share-box .help { margin: -6px 0 2px; padding-left: 4px; font-size: 13px; }
  #share-box .btn { width: 100%; white-space: nowrap; }
  #share-box .btn.done { border-color: var(--ember); color: var(--ember); }
  #share-box small { font-size: 14px; line-height: 1.4; color: var(--cream-2); text-shadow: var(--shadow); }
  #share-box .gap { height: 6px; }
  #share-hold { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 16px; background: rgba(5,5,6,.94); }
  #share-hold img { max-width: 100%; max-height: calc(100dvh - 140px); box-shadow: 0 20px 60px rgba(0,0,0,.6); -webkit-touch-callout: default; user-select: auto; -webkit-user-select: auto; }
  #share-hold p { margin: 0; color: var(--cream); font-size: 18px; }
  #share-hold input { width: min(100%, 560px); height: 44px; border-radius: 8px; border: 1px solid rgba(var(--cream-rgb),.3); background: rgba(var(--cream-rgb),.08); color: var(--cream); padding: 0 12px; font: inherit; font-size: 15px; }
  body.touch #share-box { flex: 1 1 100%; flex-direction: row; flex-wrap: wrap; gap: 8px; }
  body.touch #share-box h3 { flex: 1 1 100%; font-size: 26px; text-align: center; }
  body.touch #share-box .why { flex: 1 1 100%; text-align: center; font-size: 15px; margin: -4px 0 2px; }
  body.touch #share-box .btn { flex: 1 1 30%; height: 48px; font-size: 15px; padding: 0 10px; min-width: 0; }
  body.touch #share-box small { flex: 1 1 100%; text-align: center; font-size: 12px; }
  body.touch #share-box .gap { display: none; }
  @media (max-height: 520px) and (orientation: landscape) { body.touch #share-box { flex-direction: column; flex-wrap: nowrap; gap: 6px; } body.touch #share-box h3 { font-size: 18px; flex: none; } body.touch #share-box .btn { flex: none; width: 100%; height: 38px; font-size: 14px; } body.touch #share-box small { flex: none; } body.touch #card-side .btn { height: 38px; } }
  @media (prefers-reduced-motion: reduce) { #share-land { transition: none; } }
  /* ---------- the tape-cover look (the title's palette, pixel buttons, stripes, scan lines) ---------- */
  #share-land { background: #12051a; }
  #share-land::before { content: ''; position: absolute; z-index: 3; left: 0; right: 0; top: 0; height: 30px; background: #0c0408; box-shadow: 0 3px 0 #ffcf3a, 0 6px 0 #ff7a1e, 0 9px 0 #e8203a, 0 12px 0 #7a0c5a; pointer-events: none; }
  #share-land::after { content: ''; position: absolute; z-index: 1; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,.2) 0 1px, transparent 1px 3px); }
  #share-land .wash { z-index: 1; background: linear-gradient(90deg, rgba(14,3,20,.85) 0%, rgba(14,3,20,.55) 36%, rgba(14,3,20,0) 60%), linear-gradient(0deg, rgba(14,3,20,.75) 0%, rgba(14,3,20,0) 40%); }
  #share-land .logo { top: calc(30px + 12px + clamp(10px, 3vh, 30px)); filter: drop-shadow(0 6px 0 rgba(30,4,10,.7)); }
  #share-land h1 { font-weight: 900; color: #fff3d6; transform: rotate(-3deg); transform-origin: left bottom; text-shadow: 3px 3px 0 #8a0c2a, 6px 6px 0 #2a0414, -1px 0 0 rgba(0,220,255,.45), 1px 0 0 rgba(255,0,80,.45); margin-bottom: 6px; }
  #share-land h1 bdi:first-child, #share-land h1 bdi { color: #ffcf3a; font-style: normal; }
  #share-land p { font-family: VT323, var(--mono); font-size: clamp(24px, 2.4vw, 32px); line-height: 1.1; color: #ffe3c0; text-shadow: 2px 2px 0 #2a0414; max-width: 32ch; }
  #share-land .btn.big { height: auto; padding: .95em 1.4em .9em 1.1em; border-radius: 0; background: linear-gradient(#ffe27a, #ffb030 48%, #ff7a1e 52%, #e8401a); color: #2a0608; border: 0; box-shadow: 0 0 0 3px #1a0408, 6px 7px 0 3px #1a0408;
    font-family: 'Press Start 2P', var(--mono); font-weight: 400; font-size: clamp(16px, 1.6vw, 22px); letter-spacing: .06em; text-transform: uppercase; text-shadow: 1px 1px 0 rgba(255,240,180,.6); margin-top: 14px; }
  #share-land .btn.big .tri { display: inline-block; margin-right: .8em; color: #b0102a; animation: cvblink 1s steps(1) infinite; }
  #share-land .btn.big:hover, #share-land .btn.big:focus-visible { background: linear-gradient(#ffe27a, #ffb030 48%, #ff7a1e 52%, #e8401a); filter: brightness(1.08); outline: 3px solid #fff3a0; outline-offset: 5px; }
  #share-land .free { font-family: var(--sans); font-weight: 700; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: #ffb36a; text-shadow: 0 1px 0 #000; margin-top: 6px; }
  #share-land .own { font-family: VT323, var(--mono); font-size: 22px; color: #ffe3c0; text-decoration: none; }
  #share-land .own::after { content: ' ›'; }
  #share-land .tags { position: absolute; z-index: 4; top: 15px; right: clamp(16px, 2.6vw, 40px); transform: translateY(-50%); display: flex; gap: 6px; pointer-events: none; }
  #share-land .tags span { font-family: var(--sans); font-weight: 800; font-size: 12px; letter-spacing: .14em; padding: 2px 6px 1px; color: #ffe3c0; box-shadow: inset 0 0 0 2px #ffe3c0; }
  #share-land .tags span:first-child { font-style: italic; letter-spacing: .02em; font-size: 14px; color: #1a0610; background: #fff3d6; box-shadow: none; transform: skewX(-12deg); }
  #share-land .spine { position: absolute; z-index: 2; top: 42px; bottom: 0; left: 0; width: clamp(10px, 1.4vw, 22px); pointer-events: none; background: linear-gradient(90deg, #0c0408 0 18%, #ffcf3a 18% 36%, #ff7a1e 36% 54%, #e8203a 54% 72%, #7a0c5a 72% 90%, #0c0408 90%); }
  #share-land .spine.r { left: auto; right: 0; transform: scaleX(-1); }
  @media (max-aspect-ratio: 1/1) { #share-land .spine { display: none; } }
  #share-land .who { font-family: VT323, var(--mono); font-style: normal; font-size: clamp(22px, 2.2vw, 30px); color: #ffcf3a; text-shadow: 2px 2px 0 #2a0414; }
  @keyframes cvblink { 50% { opacity: 0; } }
  @media (max-aspect-ratio: 10/11) { #share-land h1 { transform-origin: center bottom; } #share-land .wash { background: linear-gradient(0deg, rgba(14,3,20,.96) 0%, rgba(14,3,20,.86) 36%, rgba(14,3,20,.4) 50%, rgba(14,3,20,0) 62%); } }
  @media (max-height: 520px) and (orientation: landscape) { #share-land::before { height: 20px; } #share-land .logo { top: 36px; } #share-land p { font-size: 20px; } #share-land .btn.big { font-size: 13px; } }
  body.cover-card #share-box h3 { font-weight: 900; font-size: 32px; white-space: nowrap; color: #fff3d6; transform: rotate(-3deg); transform-origin: left center; text-shadow: 3px 3px 0 #8a0c2a, 5px 5px 0 #2a0414; margin-bottom: 4px; }
  body.cover-card #share-box h3 bdi { color: #ffcf3a; font-style: normal; }
  body.cover-card #share-box .why { font-family: VT323, var(--mono); font-size: 24px; color: #ffe3c0; text-shadow: 2px 2px 0 #2a0414; }
  body.cover-card #share-box small { font-family: var(--sans); font-weight: 700; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #ffb36a; }
  body.cover-card #card-side .btn { border-radius: 0; height: 54px; font-family: 'Press Start 2P', var(--mono); font-weight: 400; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; background: #1a0610; color: #ffe3c0; border: 0; box-shadow: 0 0 0 3px #ffe3c0, 5px 6px 0 3px #0c0408; margin: 4px 6px 6px 3px; width: calc(100% - 12px); }
  body.cover-card #card-side .btn.primary { background: linear-gradient(#ffe27a, #ffb030 48%, #ff7a1e 52%, #e8401a); color: #2a0608; text-shadow: 1px 1px 0 rgba(255,240,180,.6); box-shadow: 0 0 0 3px #1a0408, 6px 7px 0 3px #1a0408; }
  body.cover-card #card-side .btn:hover, body.cover-card #card-side .btn:focus-visible { filter: brightness(1.1); outline: 3px solid #fff3a0; outline-offset: 5px; }
  body.cover-card #card-side .btn.done { color: #2ee8ff; box-shadow: 0 0 0 3px #2ee8ff, 5px 6px 0 3px #0c0408; }
  body.cover-card.touch #card-side .btn { font-size: 11px; white-space: nowrap; padding: 0 6px; }
  body.cover-card.touch #share-box .btn { height: 50px; font-size: 11px; padding: 0 6px; width: auto; margin: 4px 6px 8px 3px; }
  @media (prefers-reduced-motion: reduce) { #share-land .btn.big .tri { animation: none; } }
  /* the landing's line in the title's pixel type, like the cover line on the picture */
  #share-land h1 { font-family: 'Press Start 2P', var(--mono); font-style: normal; font-weight: 400; text-transform: uppercase; font-size: clamp(22px, 3.3vw, 52px); line-height: 1.34; letter-spacing: 0; transform: none; text-shadow: .08em .08em 0 #8a0c2a, .16em .16em 0 #2a0414; margin-bottom: 12px; max-width: 16em; }
  #share-land h1 bdi:first-child, #share-land h1 bdi { color: #ffcf3a; font-style: normal; }
  @media (max-aspect-ratio: 10/11) { #share-land h1 { font-size: clamp(20px, 6.2vw, 34px); } }
  @media (max-height: 520px) and (orientation: landscape) { #share-land h1 { font-size: 16px; margin-bottom: 4px; } #share-land p { font-size: 18px; } #share-land .free { display: none; } }
  /* the sticker and the bottom tape stripes, as on the picture; the panel's heading in the pixel type in every world */
  #share-land .stk { position: absolute; z-index: 4; right: clamp(20px, 4vw, 70px); top: clamp(56px, 9vh, 96px); width: clamp(84px, 9vw, 150px); aspect-ratio: 1; border-radius: 50%; display: grid; place-content: center; text-align: center; transform: rotate(12deg); pointer-events: none;
    font-family: var(--sans); font-weight: 900; font-size: clamp(15px, 1.6vw, 26px); line-height: 1; color: #1a0610; background: radial-gradient(circle at 35% 30%, #fff36a, #ffd000 45%, #ff9a00); box-shadow: 0 0 0 3px #1a0610, 0 0 0 6px #fff1a0, 4px 6px 0 6px rgba(10,2,6,.55); }
  #share-land .stk.r { color: #fff3d6; background: radial-gradient(circle at 35% 30%, #ff7a9a, #e8203a 45%, #8a0c2a); }
  #share-land .speak { font-family: 'Press Start 2P', var(--mono); text-transform: uppercase; font-size: 12px; letter-spacing: .06em; color: #2ee8ff; text-shadow: 2px 2px 0 #1a0408; margin-top: 4px; }
  #share-land .cont { font-family: 'Press Start 2P', var(--mono); text-transform: uppercase; font-size: clamp(16px, 1.8vw, 26px); color: #ffcf3a; text-shadow: 3px 3px 0 #1a0408; margin-top: 10px; }
  #share-land .stk small { display: block; margin-top: .35em; font-size: .64em; font-weight: 800; letter-spacing: .04em; color: inherit; opacity: .9; }
  #share-land .bill { position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; height: 10px; pointer-events: none; background: linear-gradient(0deg, #0c0408 0 2px, #7a0c5a 2px 4px, #e8203a 4px 6px, #ff7a1e 6px 8px, #ffcf3a 8px 10px); }
  #share-land .who { display: none !important; }
  @media (max-aspect-ratio: 10/11) { #share-land .stk { top: 74px; right: 14px; width: 72px; font-size: 12px; } }
  @media (max-height: 520px) and (orientation: landscape) { #share-land .stk { width: 76px; font-size: 12px; top: 40px; } }
  body.cover-card #share-box h3 { font-family: 'Press Start 2P', var(--mono); font-style: normal; font-weight: 400; font-size: 20px; line-height: 1.3; text-transform: uppercase; transform: none; text-shadow: 3px 3px 0 #8a0c2a, 5px 5px 0 #2a0414; }
  @media (max-height: 520px) and (orientation: landscape) { body.cover-card #card-side .btn, body.cover-card.touch #share-box .btn { height: 34px; font-size: 10px; margin: 3px 6px 5px 3px; } body.cover-card #share-box h3 { font-size: 20px; } body.cover-card #share-box .why { font-size: 17px; margin: 0; } body.cover-card #share-box small { font-size: 9px; } }`;
  const el = document.createElement('style'); el.id = 'share-css'; el.textContent = css; document.head.appendChild(el);
}

/* text with each name in its own <bdi> (a right-to-left name never turns the English sentence round); text nodes only */
function isolate(el, text, names) {
  el.dir = 'ltr'; el.textContent = '';
  const list = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) { el.textContent = text; return; }
  const re = new RegExp(`(${list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
  for (const part of String(text).split(re)) { if (!part) continue; if (list.includes(part)) { const b = document.createElement('bdi'); b.textContent = part; el.append(b); } else el.append(document.createTextNode(part)); }
}
/* ---------- the landing over the title (any title variant: it is its own layer) ---------- */
export function showLanding(d, { enemyLabel, onStart, onOwn, stage = null }) {
  style(); coverFonts();
  const w = landingWords(d, enemyLabel);
  const box = document.createElement('section'); box.id = 'share-land'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'share-land-h');
  const inner = document.createElement('div'); inner.className = 'in';
  const h = document.createElement('h1'); h.id = 'share-land-h'; isolate(h, w.h, [d.s, d.t]);
  const p = document.createElement('p'); isolate(p, w.p, [d.s, d.t]);
  const go = document.createElement('button'); go.type = 'button'; go.className = 'btn primary big'; { const tri = document.createElement('span'); tri.className = 'tri'; tri.setAttribute('aria-hidden', 'true'); tri.textContent = '▶'; go.append(tri, document.createTextNode(w.go)); }
  const own = document.createElement('button'); own.type = 'button'; own.className = 'own'; own.textContent = d.r === 'f' ? 'Play my own quest instead' : `Start fresh, without ${d.s}`;
  const free = document.createElement('small'); free.className = 'free'; free.textContent = 'Free, in your browser, about five minutes. Your words build the quest.';
  /* a fell link asks as the picture does: CONTINUE? over the button */
  const cont = document.createElement('div'); cont.className = 'cont'; cont.textContent = 'Continue?'; cont.setAttribute('aria-hidden', 'true');
  /* a hint: how the game is played, beside the start */
  const speak = document.createElement('div'); speak.className = 'speak'; speak.textContent = 'Speak or type';
  if (d.r === 'f') inner.append(h, p, cont, go, speak, free, own); else inner.append(h, p, go, speak, free, own);
  /* the tape cover's dressing (VHS tags in the top band, the striped spines) */
  const tags = document.createElement('div'); tags.className = 'tags'; tags.setAttribute('aria-hidden', 'true'); for (const t of ['VHS', 'HI-FI STEREO']) { const sp = document.createElement('span'); sp.textContent = t; tags.append(sp); }
  const spL = document.createElement('div'); spL.className = 'spine'; spL.setAttribute('aria-hidden', 'true'); const spR = spL.cloneNode(); spR.className = 'spine r';
  const stk = document.createElement('div'); stk.className = d.r === 'f' ? 'stk r' : 'stk'; stk.setAttribute('aria-hidden', 'true');
  if (d.r === 'f') { stk.append('2P'); const sm = document.createElement('small'); sm.textContent = 'Your turn'; stk.append(sm); } else { stk.append('QUEST'); stk.append(document.createElement('br')); stk.append('CLEAR'); }
  const bill = document.createElement('div'); bill.className = 'bill'; bill.setAttribute('aria-hidden', 'true');
  box.append(tags, spL, spR, stk, bill);
  /* the scene (the boss, the sender as a spirit) under a wash, the pixel logo, the sender's name by the spirit */
  const wash = document.createElement('div'); wash.className = 'wash';
  const who = document.createElement('div'); who.className = 'who'; who.setAttribute('aria-hidden', 'true'); isolate(who, d.s, [d.s]);
  const logo = document.createElement('img'); logo.className = 'logo'; logo.alt = 'Sage Quest'; logo.hidden = true;
  logoImage().then((cv) => { if (!cv) return; try { logo.src = cv.toDataURL('image/png'); logo.hidden = false; } catch { /* no logo */ } });
  box.append(wash, who, logo, inner); document.body.appendChild(box);
  document.body.classList.add('share-landing');
  requestAnimationFrame(() => box.classList.add('on'));
  let st = null; try { st = stage ? stage(box, who) : null; } catch (err) { console.warn('share landing stage', err); }
  const close = () => { document.body.classList.remove('share-landing'); box.classList.remove('on'); setTimeout(() => { try { st?.stop(); } catch { /* gone */ } box.remove(); }, 500); };
  go.addEventListener('click', () => { close(); onStart?.(); });
  own.addEventListener('click', () => { close(); onOwn?.(); });
  setTimeout(() => go.focus(), 60);
  return { close, el: box };
}

/* ---------- the friend's run: the sender walks at their side ---------- */
/* steps the friend answers: a "fell" link keeps the sender's world, enemy and cause (name, weapon); a won link lets them
   build their own world and enemy, and asks who they fight for: the sender walks with them either way. */
export function friendSteps(d) { return d.r === 'f' ? ['name', 'weapon'] : ['name', 'origin', 'heart', 'enemy', 'weapon']; }

/* ---------- the share image: 1600 x 900 for X (picture right, words left) ---------- */
export const SW = 1600; export const SH = 900;
function wrap(g, text, maxW) { const out = []; let line = ''; for (const w of String(text).split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
/* balanced lines: the last line never holds one word alone when the line above can give one */
function balance(g, lines, maxW) { if (lines.length < 2) return lines; const out = lines.map((l) => l.split(' ')); const last = out.length - 1; while (out[last].length < 2 && out[last - 1].length > 2) { const w = out[last - 1].pop(); out[last].unshift(w); if (g.measureText(out[last].join(' ')).width > maxW) { out[last - 1].push(out[last].shift()); break; } } return out.map((l) => l.join(' ')); }
/* a line with the names in gold (each name drawn as its own run) */
function richLine(g, line, x, y, names, base, hi) {
  const list = [...new Set((names || []).filter(Boolean))].sort((m, n) => n.length - m.length);
  if (!list.length) { g.fillStyle = base; g.fillText(line, x, y); return; }
  const re = new RegExp(`(${list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
  let cx = x; for (const part of line.split(re)) { if (!part) continue; g.fillStyle = list.includes(part) ? hi : base; g.fillText(part, cx, y); cx += g.measureText(part).width; }
}
/* the staged picture fills the frame (shot.full), the words sit on the left over a dark wash; the old card crop
   (shot without full) still draws on the right as before */
export function drawShare(g, { shot, head, tail, quote, call = 'Fight for someone.', hook = null, pal, site, logo, names }) {
  const P = { night: '#0d0c0b', n: '13,12,11', cream: '#ede6d6', c: '237,230,214', gold: '#e3b672', serif: '"Playfair Display", Georgia, serif', sans: 'Geist, system-ui, sans-serif', ...(pal || {}) };
  /* the image is always a dark plate (a light world's card panel would put cream words on cream) */
  const N = P.light ? '13,12,11' : P.n; const NIGHT = `rgb(${N})`; const CREAM = P.light ? '#f3ead8' : P.cream; const C = P.light ? '243,234,216' : P.c;
  const GOLD = P.light ? '#f0b65a' : P.gold;
  g.clearRect(0, 0, SW, SH); g.fillStyle = NIGHT; g.fillRect(0, 0, SW, SH);
  if (shot?.full) {
    g.drawImage(shot.src, 0, 0, SW, SH);
    const fade = g.createLinearGradient(0, 0, 980, 0);
    fade.addColorStop(0, `rgba(${N},.9)`); fade.addColorStop(0.45, `rgba(${N},.66)`); fade.addColorStop(1, `rgba(${N},0)`);
    g.fillStyle = fade; g.fillRect(0, 0, 980, SH);
    const vg = g.createLinearGradient(0, SH * 0.68, 0, SH); vg.addColorStop(0, `rgba(${N},0)`); vg.addColorStop(1, `rgba(${N},.75)`); g.fillStyle = vg; g.fillRect(0, SH * 0.68, SW, SH * 0.32);
  } else if (shot) {
    const ar = shot.sw / shot.sh; const w = SH * ar; const dx = 1200 - w / 2;
    g.drawImage(shot.src, shot.sx, shot.sy, shot.sw, shot.sh, dx, 0, w, SH);
    const fade = g.createLinearGradient(Math.max(0, dx), 0, Math.max(0, dx) + 560, 0);
    fade.addColorStop(0, NIGHT); fade.addColorStop(0.35, `rgba(${N},.88)`); fade.addColorStop(1, `rgba(${N},0)`);
    g.fillStyle = fade; g.fillRect(0, 0, Math.max(0, dx) + 560, SH); g.fillStyle = NIGHT; g.fillRect(0, 0, Math.max(0, dx) + 1, SH);
  }
  const X = 72; const MAXW = 860;
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.direction = 'inherit';
  /* the pixel logo, sharp (whole-pixel scale); the italic wordmark only if the logo failed to load */
  let top = 96;
  if (logo) { g.imageSmoothingEnabled = false; const k = 2; g.drawImage(logo, X - 10, 44, logo.width * k, logo.height * k); g.imageSmoothingEnabled = true; top = 44 + logo.height * k; }
  else { g.font = `italic 500 36px ${P.serif}`; g.fillStyle = `rgba(${C},.85)`; g.fillText('Sage Quest', X, 96); }
  /* the headline: as large as fits in four lines (at 350 px wide a 120 px line reads as 26 px) */
  /* and the whole block (headline + call) fits above the footer line */
  let size = 132; let lines; const roomH = SH - 120 - (top + 40) - (call ? 140 : 0);
  for (; size >= 72; size -= 4) { g.font = `italic 500 ${size}px ${P.serif}`; lines = balance(g, wrap(g, head, MAXW), MAXW); if (lines.length <= 4 && lines.every((l) => g.measureText(l).width <= MAXW) && lines.length * Math.round(size * 1.06) <= roomH) break; }
  const lh = Math.round(size * 1.06);
  const callH = call ? 104 : 0; const block = lines.length * lh + (call ? 36 + callH : 0);
  const room0 = top + 40; const room1 = SH - 120;
  let y = Math.max(room0 + size * 0.8, Math.round(room0 + (room1 - room0 - block) / 2 + size * 0.8));
  g.font = `italic 500 ${size}px ${P.serif}`; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 22;
  for (const l of lines) { richLine(g, l, X - 3, y, names, CREAM, GOLD); y += lh; }
  g.shadowColor = 'transparent'; g.shadowBlur = 0;
  y += 36 - lh + size * 0.2;
  if (quote) { g.font = `italic 500 42px ${P.serif}`; g.fillStyle = GOLD; const q = wrap(g, quote, MAXW)[0]; g.fillText(q, X, y + 42); y += 64; }
  if (tail && tail !== call) { g.font = `500 42px ${P.sans}`; g.fillStyle = `rgba(${C},.92)`; g.fillText(tail, X, y + 42); y += 64; }
  /* the call: a gold bar with dark words, the one thing to act on */
  if (call) {
    g.font = `700 54px ${P.sans}`; const tw = Math.min(MAXW, g.measureText(call).width); const ph = 96; const pw = tw + 76;
    g.fillStyle = GOLD; g.beginPath(); if (g.roundRect) g.roundRect(X, y, pw, ph, ph / 2); else g.rect(X, y, pw, ph); g.fill();
    g.fillStyle = NIGHT; g.textBaseline = 'middle'; g.fillText(call, X + 38, y + ph / 2 + 2, MAXW); g.textBaseline = 'alphabetic';
  }
  g.font = `600 34px ${P.sans}`; g.textAlign = 'right'; g.fillStyle = `rgba(${C},.82)`; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 10; g.fillText(site, SW - 56, SH - 52); g.textAlign = 'left'; if (hook) { g.font = `italic 500 44px ${P.serif}`; g.fillStyle = GOLD; g.fillText(hook, X, SH - 50, SW - 680); } else { g.font = `500 30px ${P.sans}`; g.fillText('A free browser game. Your words build the quest.', X, SH - 52); } g.shadowColor = 'transparent'; g.shadowBlur = 0;
}

/* ---------- the share panel by the card ---------- */
const UA = navigator.userAgent || '';
const IN_APP = /\b(Twitter|FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|TikTok|musical_ly|MicroMessenger|KAKAOTALK|Pinterest)\b|; wv\)/i.test(UA) || (/\b(iPhone|iPad)\b/.test(UA) && !/Safari\//.test(UA));
export function mountPanel(side, { w, url, makeImage, fname }) {
  style();
  side.querySelector('#share-box')?.remove(); document.body.classList.add('cover-card'); /* the tape-cover buttons */
  const box = document.createElement('div'); box.id = 'share-box';
  const h = document.createElement('h3'); isolate(h, w.send, [w.to]);
  /* one line under the heading says why ("Wren should see this.") */
  const why = document.createElement('p'); why.className = 'why'; isolate(why, w.line || '', [w.to]);
  const touch = document.body.classList.contains('touch');
  const mk = (label, primary) => { const b = document.createElement('button'); b.type = 'button'; b.className = `btn${primary ? ' primary' : ''}`; b.textContent = label; return b; };
  /* order of use: a phone sends through its share sheet (image, words and link in one go); a desktop posts on X */
  const post = mk('Post on X', !touch); post.setAttribute('aria-label', 'Post on X (opens in a new tab)'); const copy = mk('Copy link'); const img = mk(touch ? 'Share' : 'Save image', touch);
  if (touch) img.setAttribute('aria-label', `Share the image and the link${w.to ? ` with ${forWhom(w.to, 'your')}` : ''}`);
  const helper = document.createElement('small'); helper.className = 'help'; helper.textContent = 'Posts to your timeline.';
  const note = document.createElement('small'); note.textContent = w.send.startsWith('Send it to someone') ? 'The link carries your name.' : 'The link carries both names.';
  const gap = document.createElement('div'); gap.className = 'gap';
  const status = document.createElement('span'); status.className = 'sr'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  box.append(h, ...(w.line ? [why] : []), ...(touch ? [img, post, copy] : [post, helper, copy, img]), note, status, gap);
  side.prepend(box);
  const flash = (b, text) => { const old = b.dataset.label || b.textContent; b.dataset.label = old; b.textContent = text; b.classList.add('done'); status.textContent = text === 'Copied' ? 'Link copied' : 'Image saved'; setTimeout(() => { b.textContent = old; b.classList.remove('done'); }, 2200); };
  post.addEventListener('click', () => {
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(w.post)}&url=${encodeURIComponent(url)}`;
    /* an <a target=_blank> click: window.open with 'noopener' returns null even when it opened, so no fallback can hang on it */
    const a = document.createElement('a'); a.href = intent; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  });
  copy.addEventListener('click', async () => {
    let ok = false;
    /* the words and the link together, ready to paste into a message */
    const text = `${w.post} ${url}`;
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch { /* blocked */ }
    if (!ok) { try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch { ok = false; } }
    if (ok) flash(copy, 'Copied'); else hold(null, url, 'Copy the link');
    window.__sq && (window.__sq.lastShareUrl = url, window.__sq.lastCopied = text);
  });
  img.addEventListener('click', async () => {
    const blob = await makeImage(); if (!blob) return;
    if (window.__sq) window.__sq.lastShareBlob = blob;
    /* an in-app browser (the X app's webview) often drops downloads and file shares: the picture to hold comes first */
    if (IN_APP) { hold(blob, url, 'Hold the image to save it', { blob, fname, text: `${w.post} ${url}` }); return; }
    if (touch && navigator.canShare) {
      try { const file = new File([blob], fname, { type: 'image/png' }); if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `${w.post} ${url}` }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    }
    /* no file share: the sheet with the words and the link, then the picture to hold */
    if (touch && navigator.share) { try { await navigator.share({ text: w.post, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    if (touch) { hold(blob, url, 'Hold the image to save it'); return; }
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000); flash(img, 'Saved'); } catch { hold(blob, url, 'Right-click the image to save it'); }
  });
  return box;
}
/* the fallback for in-app browsers: the image as a plain <img> to hold, and the link in a field */
function hold(blob, url, text, share = null) {
  style(); document.getElementById('share-hold')?.remove();
  const back = document.activeElement;
  const box = document.createElement('div'); box.id = 'share-hold'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'share-hold-t');
  const p = document.createElement('p'); p.id = 'share-hold-t'; p.textContent = text; box.append(p);
  if (blob) { const im = document.createElement('img'); im.alt = 'Your Sage Quest card'; im.src = URL.createObjectURL(blob); box.append(im); }
  const inp = document.createElement('input'); inp.readOnly = true; inp.value = url; inp.setAttribute('aria-label', 'Link'); inp.addEventListener('focus', () => inp.select()); box.append(inp);
  if (share && navigator.canShare) {
    try { const file = new File([share.blob], share.fname, { type: 'image/png' }); if (navigator.canShare({ files: [file] })) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.textContent = 'Share'; b.addEventListener('click', () => navigator.share({ files: [file], text: share.text }).catch(() => { /* closed or blocked: the picture stays to hold */ })); box.append(b); } } catch { /* no file share here */ }
  }
  const close = document.createElement('button'); close.type = 'button'; close.className = 'btn'; close.textContent = 'Close';
  const esc = (e) => { if (e.key === 'Escape') shut(); };
  const shut = () => { box.remove(); removeEventListener('keydown', esc); try { back?.focus?.(); } catch { /* gone */ } };
  close.addEventListener('click', shut); box.append(close);
  document.body.appendChild(box); close.focus(); addEventListener('keydown', esc);
}

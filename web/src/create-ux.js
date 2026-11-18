/* the seven questions as the hook.
   - The echo: the moment an answer is sent, the player's own words sit big under the question with a tape scan
     ("Sage2 is reading"); when Sage2 has decided, the words it used light up and the rest dims. Replaces #said + #think.
   - title continuity: the VHS stripe wipe from the title into the camp, pixel progress blocks, a pixel "Start quest" button,
     a keycap line on question 1 (Hold Space to talk, or type).
   - Phones: a short build strip (what has been made so far), and an upright camera that keeps the changed thing in frame.
   ?create=off = no build echo (CX is null and every hook in main.js is a no-op). */
const OFF = (() => { try { return new URLSearchParams(location.search).get('create') === 'off'; } catch { return false; } })();

const CSS = `
html.cx #said, html.cx #think { display: none !important; }
#cx-echo { display: block; margin: 12px auto 0; max-width: 32em; min-height: 1px; text-align: center; pointer-events: none; opacity: 0; transform: translateY(8px); transition: opacity .18s ease, transform .22s cubic-bezier(.2,.9,.3,1); }
#cx-echo.on { opacity: 1; transform: none; }
#cx-echo q { display: block; quotes: none; font-family: var(--serif); font-style: italic; font-weight: 500; font-size: clamp(21px, min(1.75vw, 3.2vh), 30px); line-height: 1.28; color: var(--cream); text-wrap: balance;
  text-shadow: 0 2px 0 rgba(12,4,8,.85), 0 0 18px rgba(0,0,0,.75); transition: color .5s ease; }
#cx-echo q::before { content: '\\201C'; } #cx-echo q::after { content: '\\201D'; }
#cx-echo q em { font-style: italic; color: inherit; transition: color .35s ease, background-size .45s ease; background: linear-gradient(transparent 64%, rgba(255,122,30,.55) 64%, rgba(255,122,30,.55) 92%, transparent 92%) no-repeat 0 0 / 0% 100%; }
#cx-echo.done q { color: rgba(255,240,220,.66); }
#cx-echo.done q em { color: #ffe9a8; background-size: 100% 100%; }
#cx-echo.done.whole q { color: #ffe9a8; }
#cx-echo .scan { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; height: 18px; transition: opacity .2s; }
#cx-echo.done .scan, #cx-echo:not(.reading) .scan { opacity: 0; }
#cx-echo .scan i { display: block; width: 132px; height: 8px; box-shadow: 0 0 0 2px #0c0408; background: repeating-linear-gradient(90deg, #ffcf3a 0 12px, #ff7a1e 12px 24px, #e8203a 24px 36px, #7a0c5a 36px 48px); background-size: 48px 100%; animation: cxscan .5s linear infinite; }
#cx-echo .scan b { font-family: 'Press Start 2P', var(--mono); font-weight: 400; font-size: 11px; letter-spacing: .04em; color: #ffe3c0; text-shadow: 2px 2px 0 #1a0408; text-transform: uppercase; }
@keyframes cxscan { to { background-position: 48px 0; } }
@media (prefers-reduced-motion: reduce) { #cx-echo .scan i { animation: none; } }

/* progress: seven pixel blocks in the tape colours, the step in pixel type */
html.cx #dots { gap: 6px; }
html.cx #dots i { width: 26px; height: 10px; border-radius: 0; background: rgba(20,6,12,.55); box-shadow: 0 0 0 2px rgba(12,4,8,.9); }
html.cx #dots i.done { background: linear-gradient(#ffe27a, #ff9a2e 55%, #e8401a); }
html.cx #dots i.now { background: #fff3d6; animation: cxblink 1.4s ease-in-out infinite; }
html.cx #dots span { font-family: 'Press Start 2P', var(--mono); font-size: 11px; letter-spacing: .02em; color: #ffe3c0; text-shadow: 2px 2px 0 #1a0408; margin-left: 12px; }
@keyframes cxblink { 50% { opacity: .55; } }

/* question 1: how to answer, with keycaps */
html.cx #under .keys kbd, html.cx .cx-mic { display: inline-block; font-family: 'Press Start 2P', var(--mono); font-size: 10px; line-height: 1; padding: 5px 7px 4px; margin: 0 3px; color: #2a0608; background: linear-gradient(#ffe27a, #ffb030); box-shadow: 0 0 0 2px #1a0408, 2px 3px 0 2px #1a0408; vertical-align: 2px; }
html.cx #under .keys.cx-first { color: var(--cream); font-size: 16px; }

/* the button for Start quest */
html.cx #go { border-radius: 0; height: auto; min-height: 58px; padding: 16px 30px 15px 26px; background: linear-gradient(#ffe27a, #ffb030 48%, #ff7a1e 52%, #e8401a); border: 0; color: #2a0608;
  box-shadow: 0 0 0 3px #1a0408, 6px 7px 0 3px #1a0408; font-family: 'Press Start 2P', var(--mono); font-weight: 400; font-size: clamp(15px, 1.3vw, 20px); letter-spacing: .06em; text-transform: uppercase; }
html.cx #go::before { content: '\\25B6'; margin-right: 14px; font-size: .8em; vertical-align: 1px; }
html.cx #go:hover, html.cx #go:focus-visible { filter: brightness(1.08); outline: 3px solid #fff3a0; outline-offset: 5px; }
html.cx body.touch #go, html.cx body.touch #go.big { height: auto; min-height: 58px; font-size: 15px; }
html.cx #built #rebuild { min-height: 44px; padding: 0 16px; border: 2px solid #ffcf3a; border-radius: 0; background: rgba(12,4,8,.72); color: #ffe3c0; text-decoration: none; font-family: 'Press Start 2P', var(--mono); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; text-shadow: none; cursor: pointer; }
html.cx #built #rebuild:hover, html.cx #built #rebuild:focus-visible { background: rgba(255,176,48,.18); outline: none; }
html.cx #built small { white-space: nowrap; font-size: 13px; color: #ffcf6a; }
html.cx body.touch #built #rebuild { font-family: var(--sans); font-weight: 700; font-size: 14px; letter-spacing: .08em; white-space: nowrap; padding: 0 14px; }
/* headlines and sub-lines hold on a bright sky (a green fen sky washed them out) */
html.cx body.st-build #prompt h2 { text-shadow: 0 2px 0 rgba(12,4,8,.92), 0 0 22px rgba(0,0,0,.85), 0 0 4px rgba(0,0,0,.6); }
/* phones: a dark band behind the top text, so the type holds on a bright green or dusk sky */
#cx-scrim { display: none; }
/* phones: no timings or costs in front of the player (desktop keeps the Sage2 proof) */
body.touch #feed li .r time, body.touch .cx-tele { display: none !important; }
/* the tape-cover heat in the camp, felt not named: fine scan lines and a warm sunset edge over the 3D, under the UI */
#cx-scan { position: fixed; inset: 0; pointer-events: none; display: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, rgba(0,0,0,0) 1px 3px), radial-gradient(130% 95% at 50% 40%, rgba(0,0,0,0) 58%, rgba(122,12,90,.16) 82%, rgba(232,32,58,.2) 100%); mix-blend-mode: multiply; }
html.cx body.st-build #cx-scan { display: block; }
html.cx body.st-build #prompt h2 { text-shadow: -1px 0 0 rgba(232,32,58,.55), 1px 0 0 rgba(80,200,255,.35), 0 2px 0 rgba(12,4,8,.92), 0 0 22px rgba(0,0,0,.85); }
html.cx #prompt h2.cx-forged { animation: cxforged 1.2s cubic-bezier(.2,1.5,.4,1) both; }
/* the forged weapon's name slams in in the tape's pixel type (the build screen goes back to the serif hero line) */
html.cx body.st-build:not(.built) #prompt h2.cx-forged { font-family: 'Press Start 2P', var(--mono); font-style: normal; font-weight: 400; font-size: clamp(20px, 2.4vw, 34px); line-height: 1.3; letter-spacing: .02em; color: #ffe27a; text-transform: uppercase;
  text-shadow: 2px 2px 0 #7a0c5a, 4px 4px 0 #0c0408 !important; }
html.cx body.st-build:not(.built) #prompt h2.cx-forged + p { font-size: 17px; color: #fff3d6; }
/* answer field and buttons: square, hard shadow, pixel labels */
html.cx #typed { border-radius: 0 !important; border: 2px solid rgba(255,207,58,.75) !important; background: rgba(12,4,8,.78) !important; box-shadow: 0 0 0 2px #1a0408, 5px 6px 0 2px #1a0408 !important; }
html.cx #typed:focus { border-color: #ff9a2e !important; box-shadow: 0 0 0 2px #1a0408, 5px 6px 0 2px #1a0408, 0 0 0 6px rgba(255,122,30,.22) !important; }
html.cx #listen { border-radius: 0 !important; }
html.cx #under .link { border-radius: 0 !important; border: 2px solid rgba(255,207,58,.7) !important; background: rgba(12,4,8,.74) !important; box-shadow: 3px 4px 0 #1a0408; color: #ffe3c0 !important; font-family: 'Press Start 2P', var(--mono) !important; font-weight: 400 !important; font-size: 11px !important; letter-spacing: .04em; text-transform: uppercase; min-height: 44px; padding: 0 14px !important; }
html.cx #under .link:hover, html.cx #under .link:focus-visible { background: rgba(255,176,48,.2) !important; border-color: #ffcf3a !important; outline: none; }
body.cx-forging #cx-strip, body.cx-forging #cx-echo, body.cx-forging #feed { opacity: 0 !important; transition: opacity .2s; }
body.touch.st-build:not(.built) #prompt h2.cx-forged { font-size: 28px; }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { html.cx #prompt h2.cx-forged { transform-origin: 0 50%; } }
#cx-ideas { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 0 0 10px; }
#cx-ideas button { font: 13px/1.4 'Press Start 2P', monospace; letter-spacing: .02em; color: #ffe27a; background: rgba(12,4,8,.82); border: 2px solid rgba(255,207,58,.7); border-radius: 0; padding: 10px 12px; min-height: 44px; box-shadow: 4px 4px 0 #1a0408; cursor: pointer; text-transform: none; }
body.touch #cx-ideas button { font: 600 14px/1.25 system-ui, sans-serif; }
#cx-ideas button:hover, #cx-ideas button:focus-visible { border-color: #ff9a2e; color: #fff3d6; }
/* phones: the last answer's Sage2 line leaves with its question */
body.touch.st-build.cx-stale #feed { opacity: 0; pointer-events: none; }
@keyframes cxforged { 0% { transform: scale(1.6); filter: brightness(2.6) drop-shadow(0 0 22px #ffb030); letter-spacing: .14em; opacity: 0; } 18% { opacity: 1; } 55% { filter: brightness(1.5) drop-shadow(0 0 12px #ff7a1e); } 100% { transform: none; filter: none; letter-spacing: normal; } }
html.cx body.touch.st-build:not(.built) #cx-scrim { display: block; position: fixed; left: 0; right: 0; top: 0; height: 300px; z-index: 0; pointer-events: none; background: linear-gradient(rgba(12,4,8,.72), rgba(12,4,8,.45) 55%, rgba(12,4,8,0)); }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { html.cx body.touch.st-build:not(.built) #cx-scrim { -webkit-mask-image: linear-gradient(#000 55%, transparent); mask-image: linear-gradient(#000 55%, transparent); height: 170px; right: 35%; background: linear-gradient(100deg, rgba(12,4,8,.62), rgba(12,4,8,0)); } }
html.cx body.st-build #prompt p { text-shadow: 0 1px 0 rgba(12,4,8,.95), 0 0 14px rgba(0,0,0,.9); opacity: 1; }

/* the wipe: the tape stripes run down over the title into the camp */
#cx-wipe { position: fixed; inset: 0; z-index: 9000; pointer-events: none; display: flex; flex-direction: column; transform: translateY(-101%); }
#cx-wipe i { flex: 1; }
#cx-wipe i:nth-child(1) { background: #ffcf3a; } #cx-wipe i:nth-child(2) { background: #ff7a1e; } #cx-wipe i:nth-child(3) { background: #e8203a; } #cx-wipe i:nth-child(4) { background: #7a0c5a; } #cx-wipe i:nth-child(5) { background: #0c0408; flex: 3; }
#cx-wipe.go { animation: cxwipe .78s cubic-bezier(.6,0,.3,1) forwards; }
@keyframes cxwipe { 0% { transform: translateY(-101%); } 45% { transform: translateY(0); } 100% { transform: translateY(101%); } }
@media (prefers-reduced-motion: reduce) { #cx-wipe { display: none; } }

/* phones: the build so far as one strip of chips under the progress (the side list needs a wide screen) */
#cx-strip { display: none; }
body.touch.st-build #cx-strip:not(:empty) { display: flex; flex-wrap: nowrap; justify-content: center; gap: 6px; margin: 0 0 10px; overflow: hidden; pointer-events: none; }
body.touch.st-build:not(.built) #cx-strip:not(:empty) { flex-wrap: wrap; row-gap: 5px; max-width: 360px; margin-left: auto; margin-right: auto; }
#cx-strip span.more { font-family: 'Press Start 2P', var(--mono); font-style: normal; font-size: 10px; padding: 5px 6px; color: #ffcf6a; }
body.touch.st-build.built #cx-strip span.more { display: none; }

body.touch.st-build.built #cx-strip { display: none !important; }
body.touch.st-build.built #cx-strip span { font-size: 14px; padding: 5px 9px 6px; }
#cx-strip span { font-family: var(--serif); font-style: italic; font-size: 13px; line-height: 1; padding: 4px 8px 5px; color: #ffe9c8; background: rgba(12,4,8,.62); box-shadow: inset 0 0 0 1px rgba(255,180,90,.35); white-space: nowrap; }
#cx-strip span.new { animation: cxchip .9s ease-out; }
@keyframes cxchip { 0% { background: #ffcf3a; color: #0c0408; transform: scale(1.18); } 60% { background: #ffcf3a; color: #0c0408; transform: scale(1); } 100% { } }
body.touch.kb #cx-strip { display: none !important; }
html.cx body.touch .sq-fly { display: none !important; }
html.cx body.touch #under .link { min-height: 44px; }
/* the reward hold: a way on (any key on a desktop; a tap or this button) */
#cx-next { position: fixed; z-index: 30; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 30px); transform: translateX(-50%); display: none; align-items: center; gap: 10px; min-height: 48px; padding: 0 22px; border: 0; border-radius: 0; cursor: pointer;
  white-space: nowrap; font-family: 'Press Start 2P', var(--mono); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #2a0608; background: linear-gradient(#ffe27a, #ffb030 48%, #ff7a1e 52%, #e8401a); box-shadow: 0 0 0 3px #1a0408, 5px 6px 0 3px #1a0408; overflow: hidden; }
#cx-next u { position: absolute; left: 0; bottom: 0; height: 4px; width: 100%; background: #2a0608; opacity: .55; transform-origin: left; text-decoration: none; }
#cx-next.on u { animation: cxleft var(--cx-left, 3s) linear forwards; }
@keyframes cxleft { from { transform: scaleX(1); } to { transform: scaleX(0); } }
#cx-next kbd { font: inherit; font-size: 9px; padding: 4px 6px 3px; color: #ffe3c0; background: #2a0608; box-shadow: none; }
body.touch #cx-next kbd { display: none; }
#cx-next.on { display: inline-flex; animation: cxin .15s ease-out; }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { #cx-next { left: auto; right: calc(env(safe-area-inset-right, 0px) + 18px); bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); transform: none; } @keyframes cxin { from { opacity: 0; } } }
/* phones: the one-line Sage2 receipt shows only when it has a result (an empty pill read as a failed load) */
body.touch.st-build.cx-feed0 #feed { opacity: 0; pointer-events: none; }
body.st-build.built #cx-next, body:not(.st-build) #cx-next { display: none !important; }
@keyframes cxin { from { opacity: 0; transform: translate(-50%, 8px); } }
body.st-build.built #cx-echo { display: none; }
body.touch #cx-echo q { font-size: 18px; }
body.touch #cx-echo { margin-top: 8px; }
body.touch.kb #cx-echo { display: none; }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { body.touch.st-build #cx-strip:not(:empty) { justify-content: flex-start; margin-bottom: 6px; } #cx-strip span { font-size: 12px; } body.touch #cx-echo { text-align: left; margin-left: 0; } body.touch #cx-echo q { font-size: 16px; } body.touch #cx-echo .scan { justify-content: flex-start; } }
`;

function make() {
  const $ = (id) => document.getElementById(id);
  let echo = null; let strip = null; let wipe = null; let next = null; let nextT = 0; let seq = 0; let readT = 0; let lastKey = '';
  let holdEnd = 0; let staleLi = null;
  const hideNext = () => { clearTimeout(nextT); next?.classList.remove('on'); };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function install() {
    document.documentElement.classList.add('cx');
    const st = document.createElement('style'); st.id = 'cx-css'; st.textContent = CSS; document.head.appendChild(st);
    if (![...document.querySelectorAll('link')].some((l) => /Press\+Start\+2P/.test(l.href))) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap'; document.head.appendChild(l); }
    echo = document.createElement('div'); echo.id = 'cx-echo'; echo.setAttribute('aria-live', 'polite'); echo.innerHTML = '<q></q><span class="scan"><i></i><b>Sage2 is reading</b></span>';
    const pr = $('prompt'); if (pr) pr.insertBefore(echo, $('think') || null);
    strip = document.createElement('div'); strip.id = 'cx-strip'; strip.setAttribute('aria-label', 'Your build so far'); if (pr) pr.insertBefore(strip, pr.firstChild); else document.body.appendChild(strip);
    next = document.createElement('button'); next.id = 'cx-next'; next.type = 'button'; next.innerHTML = 'Next question <kbd>Enter</kbd><u></u>';
    next.addEventListener('click', (e) => { e.preventDefault(); const pw = document.getElementById('pw'); if (pw && getComputedStyle(pw).display !== 'none') return; hideNext(); try { api.onNext?.(); } catch (err) { console.warn('next', err); } });
    document.body.appendChild(next);
    /* phones: is the newest Sage2 row's last line empty (or only dots)? then the one-line receipt hides */
    const list = $('feed-list'); if (list) { const chk = () => { if (staleLi && list.firstElementChild !== staleLi) { staleLi = null; document.body.classList.remove('cx-stale'); } if (!document.body.classList.contains('touch')) return; const li = list.firstElementChild; const raw = li ? (li.innerText || '') : ''; const t = /could not|did not answer|no name|not sure/i.test(raw) ? '' : raw.replace(/[\s\u2192\u00b7.]+/g, ''); /* a failed call is not shown to the player as an error */ /* innerText = only what the phone layout shows */ document.body.classList.toggle('cx-feed0', !t); }; new MutationObserver(() => requestAnimationFrame(chk)).observe(list, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] }); chk(); }
    /* the phone scrim sits right above the 3D canvas, under every UI layer (tree order) */
    const cv = $('c'); if (cv) { const sc = document.createElement('div'); sc.id = 'cx-scrim'; sc.setAttribute('aria-hidden', 'true'); cv.after(sc); const sl = document.createElement('div'); sl.id = 'cx-scan'; sl.setAttribute('aria-hidden', 'true'); cv.after(sl); }
    wipe = document.createElement('div'); wipe.id = 'cx-wipe'; wipe.innerHTML = '<i></i><i></i><i></i><i></i><i></i>'; document.body.appendChild(wipe);
  }
  let ideaT = 0; let ideaBox = null;
  const api = {
    install, onNext: null,
    /* main.js advance(): the next question comes in ms by itself */
    hold(ms) { holdEnd = performance.now() + ms; },
    /* idea chips from the player's own answers.
       Shown after 3 s with an empty field (at once on phones); a tap fills the field (still editable); typing hides them. */
    ideas(list) {
      clearTimeout(ideaT); ideaBox?.remove(); ideaBox = null; if (!list?.length) return;
      const field = $('typed'); if (!field) return; const mine = seq;
      const show = () => {
        if (mine !== seq || field.value.trim() || document.body.classList.contains('watching')) return;
        ideaBox = document.createElement('div'); ideaBox.id = 'cx-ideas';
        for (const t of list.slice(0, 3)) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t;
          b.addEventListener('click', () => { field.value = t; field.dispatchEvent(new Event('input', { bubbles: true })); field.focus(); ideaBox?.remove(); ideaBox = null; }); ideaBox.append(b); }
        (field.closest('#dock') || document.body).prepend(ideaBox);
        const off = () => { if (field.value.trim()) { ideaBox?.remove(); ideaBox = null; field.removeEventListener('input', off); } }; field.addEventListener('input', off);
      };
      ideaT = setTimeout(show, matchMedia('(pointer: coarse)').matches ? 300 : 3000);
    },
    /* the title gives way to the camp */
    enter() { if (!wipe) return; wipe.classList.remove('go'); void wipe.offsetWidth; wipe.classList.add('go'); },
    /* a new question: the echo is cleared */
    step() { clearTimeout(ideaT); ideaBox?.remove(); ideaBox = null; document.querySelector('#prompt h2')?.classList.remove('cx-forged'); { const fl = $('feed-list'); staleLi = fl?.firstElementChild || null; document.body.classList.toggle('cx-stale', !!staleLi); } seq++; clearTimeout(readT); lastKey = ''; hideNext(); if (!echo) return; echo.className = ''; echo.querySelector('q').textContent = ''; },
    /* the answer is sent: the words at once, and the scan */
    sent(text) {
      if (!echo) return; const mine = ++seq; clearTimeout(readT); lastKey = '';
      const q = echo.querySelector('q'); q._marks = []; const t = String(text || '').trim().replace(/\s+/g, ' ');
      q.textContent = t.length > 110 ? `${t.slice(0, 108).replace(/\s+\S*$/, '')}…` : t;
      echo.querySelector('b').textContent = 'Sage2 is reading';
      echo.className = 'on reading'; hideNext();
      readT = setTimeout(() => { if (mine === seq) echo.querySelector('b').textContent = 'Still reading'; }, 4000);
    },
    /* Sage2 named the decisive words: they light (the rest dims on result) */
    key(words) {
      if (!echo) return; const q = echo.querySelector('q'); const t = q.textContent; const w = String(words || '').trim().replace(/[.!,;:]+$/, '');
      if (!t || w.length < 2) return; lastKey = w;
      const i = t.toLowerCase().indexOf(w.toLowerCase());
      if (i < 0) return;
      const marks = (q._marks || []).filter(([a, b]) => b <= i || a >= i + w.length); marks.push([i, i + w.length]); marks.sort((a, b) => a[0] - b[0]); q._marks = marks;
      let html = ''; let at = 0; for (const [a, b] of marks) { html += `${esc(t.slice(at, a))}<em>${esc(t.slice(a, b))}</em>`; at = b; } q.innerHTML = html + esc(t.slice(at));
      echo.classList.add('done'); echo.classList.remove('reading', 'whole');
    },
    /* the result has landed (the headline stamps) */
    result() {
      if (!echo || !echo.classList.contains('on')) return; clearTimeout(readT);
      echo.classList.remove('reading'); echo.classList.add('done');
      if (!echo.querySelector('q em')) echo.classList.add('whole');
      /* the way on comes once the result has been seen for a moment (the hold still runs out by itself) */
      const mine = seq; clearTimeout(nextT); const pg = /(\d+)\s*of\s*(\d+)/.exec($('dots')?.textContent || '');
      /* the forged weapon's name lands like a hammer blow (the wait line "The smith ..." does not) */
      if (pg && pg[1] === pg[2]) { const h = document.querySelector('#prompt h2'); if (h && h.textContent && !/^The smith/.test(h.textContent) && !document.body.classList.contains('built')) { h.classList.remove('cx-forged'); void h.offsetWidth; h.classList.add('cx-forged'); } return; } nextT = setTimeout(() => { if (mine !== seq || !document.body.classList.contains('watching') || !next) return; const left = Math.max(0.6, (holdEnd - performance.now()) / 1000); next.style.setProperty('--cx-left', `${left}s`); next.classList.remove('on'); void next.offsetWidth; next.classList.add('on'); }, 500);
    },
    /* question 1 explains how to answer, with keycaps */
    keys(el, step, voice, coarse) {
      if (!el) return false;
      el.classList.toggle('cx-first', step === 0);
      if (step !== 0) return false;
      if (!voice) { el.innerHTML = 'Type, then press <kbd>Enter</kbd>'; return true; }
      el.innerHTML = coarse ? 'Hold <span class="cx-mic">MIC</span> to talk, or type' : 'Hold <kbd>Space</kbd> to talk, or type. <kbd>Enter</kbd> sends.';
      return true;
    },
    /* the phone strip: what has been made so far (texts from main.js railText) */
    strip(items, fresh) {
      if (!strip) return; const was = strip.dataset.k || '';
      /* short words: "The Drowned Fen" -> "Drowned Fen", "For brother Wren and Ash" -> "Wren, Ash"; the name always stays */
      const short = (x) => { let t = String(x.t).replace(/^(The|For) /, ''); if (x.k === 'heart') t = t.replace(/\b(my|brother|sister|mother|father|mom|mum|dad|wife|husband|son|daughter|dog|cat|friend|best)\s+/gi, '').replace(/ and /g, ', '); if (x.k === 'born' && /hidden/i.test(t)) t = 'Hidden sign'; return t.length > 18 ? `${t.slice(0, 17).replace(/[\s,]+\S*$/, '')}` : t; };
      const keep = new Set(); const named = items.find((x) => x.k === 'name'); if (named) keep.add(named); for (const x of items.slice(-2)) keep.add(x);
      strip.innerHTML = items.map((x) => { const c = [!keep.has(x) ? 'old' : '', fresh && x.k === fresh && !was.includes(`${x.k}=${x.t}`) ? 'new' : ''].filter(Boolean).join(' '); return `<span${c ? ` class="${c}"` : ''}>${esc(short(x))}</span>`; }).join('');
      strip.dataset.k = items.map((x) => `${x.k}=${x.t}`).join('|');
    },
    /* an upright phone: the camera keeps what changed in the frame (a wider lens, a smaller hero floor) */
    frame(spec, W, H, id) {
      if (!spec) return spec; const a0 = W / H;
      /* the build screen holds the hero with the weapon and the name stone behind, still (the orbit drifted behind a log) */
      const fin = /^beauty/.test(id || '');
      let base = fin ? { ...spec, angle: 0.3, swing: 0.02, pts: 'hero+gear+stone+companions', box: [0.28, 0.8, 0.02, 1.0], minHero: 0.4, maxHero: 0.5 } : spec;
      /* the name is cut: the stone fills the middle of the frame on every screen */
      if (id === 'r-name') base = { ...spec, pts: 'stone', box: [0.3, 0.7, 0.14, 0.92], minHero: 0, maxHero: 0 };
      /* the two big payoffs may use the space under the headline too (the echo and the scan make the clear band short) */
      if (id === 'r-name' && a0 >= 0.8) { if ((a0 > 1.6 && H < 520)) base = { ...spec, pts: 'stone+hero', minHero: 0.6, maxHero: 0.7 } /* side-on the band is short and moves: the hero's height sets the distance */; else base.box = [0.3, 0.7, -0.12, 0.95]; }
      /* the smith's shot: on wide screens the hero stands at the anvil (the anvil alone filled the frame); upright phones keep the anvil close */
      /* the forge is the climax: the anvil and the weapon fill the middle of the frame on every screen (main.js pushes in on each hit) */
      if (id === 'r-forge') return (a0 > 1.6 && H < 520) ? { ...spec, pts: 'anvil+hero', box: [0.2, 0.8, 0.0, 1.6], fov: 30, angle: -0.5, elev: 0.14, swing: 0, minHero: 0.64, maxHero: 0.72, bias: 0.15 } /* side-on the band is a sliver: the hero's height sets the distance, the aim stays on the anvil */ : a0 >= 0.8 ? { ...spec, pts: 'anvil', box: [0.28, 0.72, 0.1, 1.0], fov: 30, angle: -0.5, elev: 0.12, swing: 0 } : { ...spec, pts: 'anvil', box: [0.06, 0.94, 0.3, 0.94], fov: 32, angle: -0.5, elev: 0.1, swing: 0 };
      /* the lift: the hero with the whole weapon in frame */
      if (id === 'r-take') return a0 >= 0.8 ? { ...spec, pts: 'hero+gear', box: [0.22, 0.78, 0.02, (a0 > 1.6 && H < 520) ? 1.3 : 1.02], minHero: (a0 > 1.6 && H < 520) ? 0.6 : 0.55, maxHero: 0.7, fov: 34 } : { ...spec, pts: 'hero+gear', box: [0.06, 0.94, 0.06, 1.0], minHero: 0.42, maxHero: 0.56, fov: 38 };
      const a = W / H; if (a >= 0.8) return base;
      const k = Math.max(0.5, a / 0.8); const out = { ...base };
      if (id === 'r-heart') { out.pts = 'hero+companions'; out.box = [0.12, 0.88, out.box?.[2] ?? 0.06, out.box?.[3] ?? 1.02]; }
      if (fin) { out.pts = 'hero+gear+stone'; out.box = [0.05, 0.95, 0.04, 1.0]; out.minHero = 0.28; out.maxHero = 0.4; out.elev = -0.02; /* a low camera: the hero stands against the sky, not on a slab of empty ground */ return out; }
      /* the name is cut: on an upright phone the stone fills the frame */
      if (id === 'r-name') { out.pts = 'stone'; out.box = [0.14, 0.86, 0.1, 0.92]; delete out.minHero; delete out.maxHero; return out; }
      /* the name stone stays in the frame on an upright phone, a lit landmark at every question */
      if (/^(origin|born|body|heart|r-heart|r-sign|r-land|r-land-a|r-land-back)$/.test(id || '') && !/stone/.test(out.pts || '')) out.pts = `${out.pts || 'hero'}+stone`;
      if (out.minHero) out.minHero *= k * 0.9; if (out.maxHero) out.maxHero *= k;
      if (out.pts !== 'hero') out.fov = Math.min(66, (out.fov || 40) * (1 + (1 - k) * 0.95));
      return out;
    },
  };
  return api;
}

export const CX = OFF ? null : make();

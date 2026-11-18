/* touch play. One module: the fight controls (a floating stick, look by drag, four buttons), a soft aim
   assist, the rotate prompt, the phone viewport (keyboard, safe areas, no page gestures) and audio on return to the tab.

   The fight keeps its own intent layer; touch writes into it:
     fight.touchMove {f, r}   read by Fight.moveVector (analog; the keys still work)
     fight.yaw / fight.pitch  the look drag (as the mouse does)
     fight.held / heldAt      the attack button (hold = charge, or draw a bow), fight.tryAttack()
     fight.mouseBlock         the block button
     fight.tryDodge() / castAbility() / rg.reloadKey()
   Nothing here fakes a key or a mouse event.

   URL: ?touch=1 forces touch on a desktop (tests); ?desktoponly=1 on a phone keeps the old "Play on a computer" card;
        ?kb=320 pretends an on-screen keyboard of that height is open (pictures); ?assist=0 turns the aim assist off. */

const ICON = {
  atk: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M24.5 4.5 27.5 4.5 27.5 7.5 13 22 10 19Z" fill="currentColor"/><path d="M7.5 17.5 14.5 24.5M9 23l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  aim: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="2.2" fill="currentColor"/><path d="M16 3v6M16 23v6M3 16h6M23 16h6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  blk: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4 26 7.5v8c0 6.2-4.2 10.4-10 12.5C10.200 25.900 6 21.700 6 15.500v-8Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>',
  dge: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 10l8 6-8 6M16 10l8 6-8 6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  abl: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18 3 8 18h7l-2 11 11-16h-7Z" fill="currentColor"/></svg>',
  rld: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M25 16a9 9 0 1 1-3-6.700" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M22.500 4v6h-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  rot: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="8" width="20" height="36" rx="4" fill="none" stroke="currentColor" stroke-width="2.6" opacity=".45"/><rect x="10" y="38" width="44" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M48 14a14 14 0 0 1 8 12M56 26l-4.500-3M56 26l2.500-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

const CSS = `
  /* ---------- the page on a phone ---------- */
  html.touch, body.touch { position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden; overscroll-behavior: none; touch-action: manipulation; -webkit-text-size-adjust: 100%; }
  body.touch { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
  body.touch input { -webkit-user-select: text; user-select: text; }
  body.touch canvas { touch-action: none; }
  body.touch kbd, body.touch kbd + i { display: none !important; }

  /* the fight controls */
  #tc { position: fixed; inset: 0; z-index: 12; touch-action: none; }
  #tc.hidden, #tc-rot.hidden { display: none; }
  #tc .zone { position: absolute; top: 0; bottom: 0; }
  #tc-move { left: 0; width: 42%; }
  #tc-look { right: 0; width: 58%; }
  #tc-base { position: absolute; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%; border: 2px solid rgba(237,230,214,.34); background: rgba(8,9,11,.22); pointer-events: none; opacity: .5; transition: opacity .15s ease; left: calc(env(safe-area-inset-left, 0px) + 104px); top: calc(100% - env(safe-area-inset-bottom, 0px) - 104px); }
  #tc-base.on { opacity: 1; }
  #tc-knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(237,230,214,.6); box-shadow: 0 2px 10px rgba(0,0,0,.35); }
  #tc button { position: absolute; display: grid; place-items: center; padding: 0; border-radius: 50%; border: 2px solid rgba(237,230,214,.4); background: rgba(8,9,11,.34); color: rgba(237,230,214,.92); touch-action: none; -webkit-tap-highlight-color: transparent; outline: none; }
  #tc button svg { width: 46%; height: 46%; pointer-events: none; }
  #tc button.down { background: rgba(237,230,214,.34); border-color: rgba(237,230,214,.9); transform: scale(.94); }
  #tc button.cd { opacity: .38; }
  #tc-atk { width: 92px; height: 92px; right: calc(env(safe-area-inset-right, 0px) + 22px); bottom: calc(env(safe-area-inset-bottom, 0px) + 26px); background: rgba(179,52,42,.42); border-color: rgba(237,230,214,.6); }
  #tc-blk { width: 66px; height: 66px; right: calc(env(safe-area-inset-right, 0px) + 126px); bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); }
  #tc-dge { width: 66px; height: 66px; right: calc(env(safe-area-inset-right, 0px) + 112px); bottom: calc(env(safe-area-inset-bottom, 0px) + 98px); }
  #tc-abl { width: 66px; height: 66px; right: calc(env(safe-area-inset-right, 0px) + 28px); bottom: calc(env(safe-area-inset-bottom, 0px) + 134px); }
  #tc-abl.ready { border-color: rgba(217,163,91,.95); color: #e9bd7c; box-shadow: 0 0 14px rgba(217,163,91,.4); }
  #tc-rld { width: 56px; height: 56px; right: calc(env(safe-area-inset-right, 0px) + 196px); bottom: calc(env(safe-area-inset-bottom, 0px) + 56px); }
  #tc-rld.hidden { display: none; }
  #tc-skip { position: fixed; z-index: 30; right: calc(env(safe-area-inset-right, 0px) + 16px); bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); height: 48px; padding: 0 22px; border-radius: 999px; border: 1px solid rgba(237,230,214,.4); background: rgba(8,9,11,.5); color: #ede6d6; font: 500 16px Geist, system-ui, sans-serif; }
  #tc-skip.hidden { display: none; }

  /* the fight HUD on a phone: nothing under the thumbs, the lesson points at its button */
  body.touch #teach-help, body.touch #who { display: none !important; }
  body.touch #teach { bottom: 38vh; padding: 6px 30px 8px; }
  body.touch.speaking #teach { bottom: 50vh; }
  body.touch #vitals { bottom: calc(env(safe-area-inset-bottom, 0px) + 10px); gap: 5px; }
  body.touch #hud .bar { width: min(250px, 30vw); }
  body.touch #hud::before { height: 120px; }
  body.touch #ability i { width: 64px; }
  body.touch #lane { bottom: 78px; width: 46vw; min-width: 0; }
  body.touch #banner { top: 13vh; padding: 6px 30px 9px; max-width: 72vw; }
  body.touch #banner.z-low { bottom: 84px; }
  body.touch #chapter { padding: 16px 0 20px; }
  body.touch #chapter .num { font-size: clamp(34px, 11vh, 60px); }
  body.touch #chapter h2 { font-size: clamp(26px, 9vh, 40px); margin-top: 4px; }
  body.touch #chapter p { margin-top: 8px; max-width: 80vw; }
  body.touch.st-fight #feed { width: min(250px, 30vw); }
  @keyframes tcTeach { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,211,106,.0); border-color: rgba(255,211,106,.95); } 50% { box-shadow: 0 0 0 12px rgba(255,211,106,.28); border-color: #ffd36a; } }
  body[data-teach="move"] #tc-base, body[data-teach="strike"] #tc-atk, body[data-teach="heavy"] #tc-atk, body[data-teach="shoot"] #tc-atk, body[data-teach="aim"] #tc-atk,
  body[data-teach="block"] #tc-blk, body[data-teach="dodge"] #tc-dge, body[data-teach="power"] #tc-abl, body[data-teach="reload"] #tc-rld { animation: tcTeach 1s ease-in-out infinite; opacity: 1; }

  /* the rotate prompt: the fight is played with the phone on its side */
  #tc-rot { position: fixed; inset: 0; z-index: 40; display: grid; place-content: center; justify-items: center; gap: 14px; background: rgba(8,9,11,.88); color: #ede6d6; font: 500 20px Geist, system-ui, sans-serif; text-align: center; }
  #tc-up { margin-top: 18px; height: 48px; padding: 0 24px; border-radius: 999px; border: 1px solid rgba(237,230,214,.4); background: none; color: rgba(237,230,214,.8); font: 500 16px Geist, system-ui, sans-serif; }
  /* the fight played upright: the Sage2 line, then the goal or the boss, then the bars, all at the top; the thumbs own the bottom */
  @media (orientation: portrait) {
    body.touch.st-fight #feed { width: auto; top: calc(env(safe-area-inset-top, 0px) + 6px); }
    body.touch .boss-ui { top: calc(env(safe-area-inset-top, 0px) + 52px); width: 92vw; }
    body.touch #line { bottom: 36vh; max-width: 94vw; padding: 8px 18px 10px; }
    body.touch #lane { bottom: 31vh; width: 92vw; }
    body.touch #vitals { bottom: auto; top: calc(env(safe-area-inset-top, 0px) + 168px); } /* under a goal with hearts and a bar, and under the enemy's three-line plate */
    body.touch #banner { top: 26vh; max-width: 92vw; }
    body.touch #teach, body.touch.speaking #teach { bottom: 50vh !important; }
    /* the enemy visits on the road: goal, then its plate, then the bars */
    body.touch:has(#labels > .goal-ui) .boss-ui:not(.task-ui) { top: calc(env(safe-area-inset-top, 0px) + 98px) !important; } /* the general rule (62 px) comes later in this sheet */
    body.touch:has(#labels > .goal-ui) #vitals { top: calc(env(safe-area-inset-top, 0px) + 228px); }
    body.touch #boon { left: calc(env(safe-area-inset-left, 0px) + 12px); bottom: auto; top: 31vh; max-width: 62vw; font-size: 15px; padding: 4px 9px; } /* its desktop width rule is negative on a narrow screen: one word a line, on the stick */
    /* the rounds pill went off the right edge: under the reticle */
    body.touch #labels > .ranged-pill { left: 50% !important; top: calc(50% + 30px) !important; transform: translateX(-50%); white-space: nowrap; }
    body.touch #labels > .goal-ui { top: calc(env(safe-area-inset-top, 0px) + 50px) !important; padding: 4px 18px 7px; max-width: 92vw; } /* main.js tags the goal title; its place is an inline style */
  }
  /* on its side: the goal or the boss sits left of the Sage2 line */
  /* the walk's goal and the enemy's name plate can be up together (the enemy visits on the road): the plate goes under the goal */
  body.touch:has(#labels > .goal-ui) .boss-ui:not(.task-ui) { top: calc(env(safe-area-inset-top, 0px) + 62px); }
  #tc-rld.want { animation: tcTeach 1s ease-in-out infinite; border-color: #ffd36a; }
  /* on its side, 375 to 430 px high: the fight's type scale one step down (the desktop floor is 20 to 38 px; a goal with a count and a clock ran into the Sage2 line) */
  @media (orientation: landscape) { body.touch.st-fight { --fs-min: 15px; --fs-body: 16px; --fs-lead: 20px; --fs-title: 30px; } }
  /* on its side: the narration keeps between the stick and the buttons (it was three lines over the buttons at 667 px), and the boon card leaves the stick */
  @media (orientation: landscape) {
    body.touch #line { max-width: min(54vw, 500px); padding: 6px 18px 8px; bottom: 96px; }
    body.touch #line b { font-size: clamp(19px, 5.6vh, 24px); }
    body.touch #line span { font-size: 15px; margin-top: 3px; }
    body.touch #boon { left: calc(env(safe-area-inset-left, 0px) + 12px); bottom: auto; top: 96px; max-width: 210px; font-size: 15px; padding: 4px 9px; }
  }
  /* on its side: the lesson line sits low, between the narration and the bars (its desktop place, 200 or 300 px up, is the top of a 390 px screen, on the goal, the name plates and a quest prompt); a hint in the same place waits */
  @media (orientation: landscape) { body.touch #teach, body.touch.speaking #teach { top: auto; bottom: calc(env(safe-area-inset-bottom, 0px) + 58px) !important; padding: 4px 20px 6px; } body.touch #teach b { font-size: 16px; } body.touch.teaching #hint { opacity: 0 !important; } }
  @media (orientation: landscape) { body.touch #labels > .goal-ui { padding: 4px 22px 7px; left: calc(50% - min(125px, 15vw)) !important; max-width: 44vw; } body.touch .boss-ui { width: min(440px, 46vw); left: calc(50% - min(125px, 15vw) + 0px); } }
  #tc-rot svg { width: 92px; height: 92px; animation: tcRot 1.8s ease-in-out infinite; }
  @keyframes tcRot { 0%, 30% { transform: rotate(-90deg); } 70%, 100% { transform: none; } }
  @media (prefers-reduced-motion: reduce) { #tc-rot svg { animation: none; } }

  /* ---------- the questions on a phone ----------
     top: the progress dots, the Sage2 panel as one slim line, the question. bottom: the answer dock, above the keyboard (--kb).
     The scene's clear band is what is left between them (main.js layoutNow reads these boxes). */
  body.touch #dots { top: calc(env(safe-area-inset-top, 0px) + 12px); }
  body.touch #feed { left: calc(env(safe-area-inset-left, 0px) + 12px); right: calc(env(safe-area-inset-right, 0px) + 12px); top: calc(env(safe-area-inset-top, 0px) + 36px); bottom: auto; width: auto; height: auto; min-height: 0; padding: 7px 14px; border-radius: 14px; display: block; }
  body.touch #feed header, body.touch #feed .totals, body.touch #feed li q, body.touch #feed li .m { display: none !important; }
  body.touch #feed ol { -webkit-mask-image: none; mask-image: none; overflow: visible; }
  body.touch #feed li { display: none; padding: 0; margin: 0; border: 0; }
  body.touch #feed li:first-child { display: block; } /* the newest row is first */
  body.touch #feed li .r { display: none; font-size: 15px; line-height: 1.3; margin: 0; }
  body.touch #feed li .r:last-of-type { display: flex; }
  body.touch #feed li .r span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.touch #feed ol:empty::before { padding: 0; font-size: 15px; }
  body.touch #dots i { width: 18px; flex: none; } body.touch #dots span { white-space: nowrap; flex: none; }
  body.touch #prompt { top: calc(env(safe-area-inset-top, 0px) + 90px); left: 16px; right: 16px; width: auto; min-width: 0; transform: none; }
  body.touch #prompt h2 { font-size: clamp(25px, 7.2vw, 34px); white-space: normal; text-wrap: balance; margin-bottom: 6px; }
  body.touch #prompt p { font-size: 16px; }
  body.touch #dock { left: calc(env(safe-area-inset-left, 0px) + 12px); right: calc(env(safe-area-inset-right, 0px) + 12px); width: auto; min-width: 0; transform: none; bottom: calc(var(--kb, 0px) + 12px); }
  body.touch:not(.kb) #dock { bottom: calc(env(safe-area-inset-bottom, 0px) + 14px); }
  body.touch #rail { display: none !important; } /* the side list of facts needs a wide screen (a 932 px phone on its side passed the 900 px rule) */
  body.touch #tale { margin: 0 0 10px; padding: 6px 12px; font-size: 16px; }
  body.touch #field { height: 56px; }
  body.touch #typed { height: 56px; font-size: 17px; padding: 0 20px; } /* 16 px and up: iOS does not zoom the page on focus */
  body.touch.mic #typed { padding-right: 68px; }
  body.touch #listen { width: 46px; height: 46px; padding: 0; justify-content: center; right: 5px; }
  body.touch #listen #listen-t { display: none; }
  body.touch #under { margin-top: 8px; padding: 0 4px 0 8px; min-height: 44px; }
  body.touch #under .keys { font-size: 15px; white-space: normal; }
  body.touch #under .link { min-height: 44px; padding: 0 20px; font-size: 16px; }
  body.touch #ask { flex-wrap: wrap; gap: 10px; }
  body.touch #ask .btn { min-width: 0; flex: 1 1 40%; min-height: 52px; font-size: 17px; }
  body.touch #go, body.touch #go.big { width: 100%; min-width: 0; height: 58px; margin-top: 10px; font-size: 19px; }
  body.touch #hint { white-space: normal; text-align: center; font-size: 15px; }
  body.touch #legend { display: none !important; }
  /* the keyboard is up: only the question, the field and the scene between them */
  body.touch.kb #feed, body.touch.kb #tale, body.touch.kb #dots { display: none !important; }
  body.touch.kb #prompt { top: calc(env(safe-area-inset-top, 0px) + 12px); }
  body.touch.kb #prompt p { display: none; }
  body.touch.kb #under { display: none; }
  /* the final screen */
  body.touch #built { left: 12px; right: 12px; width: auto; transform: none; }
  body.touch #built small { font-size: 12.5px; white-space: normal; text-align: center; }
  body.touch #built .link { min-height: 44px; font-size: 15px; }
  /* the camp question (the vow) */
  body.touch.st-camp #feed, body.touch.st-card #feed { display: none !important; }
  body.touch #camp .q { top: calc(env(safe-area-inset-top, 0px) + 9vh); width: calc(100vw - 32px); }
  body.touch #camp h2 { font-size: clamp(28px, 8vw, 44px); white-space: normal; text-wrap: balance; }
  body.touch.st-camp #dock { bottom: calc(var(--kb, 0px) + env(safe-area-inset-bottom, 0px) + 14px); }
  /* the end card: the picture over the buttons */
  body.touch #card { flex-direction: column; gap: 12px; padding: calc(env(safe-area-inset-top, 0px) + 10px) 12px calc(env(safe-area-inset-bottom, 0px) + 10px); }
  body.touch #card-img { height: auto; max-height: calc(100dvh - 150px); max-width: 100%; }
  body.touch #card-side { width: min(100%, 420px); flex-direction: row; flex-wrap: wrap; gap: 8px; }
  body.touch #card-side .btn { flex: 1 1 40%; height: 50px; font-size: 16px; }
  body.touch #card-side p { flex: 1 1 100%; margin: 0; font-size: 13px; text-align: center; }
  body.touch #loading { width: calc(100vw - 32px); text-align: center; font-size: 19px; }

  @media (orientation: landscape) {
    /* a phone on its side: the question at the top left, the Sage2 line at the top right, the dock in the middle below */
    body.touch #feed { left: auto; width: min(300px, 38vw); top: calc(env(safe-area-inset-top, 0px) + 10px); }
    body.touch #dots { left: calc(env(safe-area-inset-left, 0px) + 16px); transform: none; top: calc(env(safe-area-inset-top, 0px) + 14px); }
    body.touch #prompt { top: calc(env(safe-area-inset-top, 0px) + 30px); left: calc(env(safe-area-inset-left, 0px) + 16px); right: min(330px, 42vw); text-align: left; }
    body.touch #prompt h2 { font-size: clamp(22px, 6.4vh, 30px); }
    body.touch #dock { left: 50%; right: auto; width: min(560px, calc(100vw - 32px)); transform: translateX(-50%); }
    body.touch:not(.kb) #dock { bottom: calc(env(safe-area-inset-bottom, 0px) + 8px); }
    body.touch #under { min-height: 40px; margin-top: 4px; }
    body.touch #field, body.touch #typed { height: 50px; }
    body.touch.kb #prompt { right: 16px; top: calc(env(safe-area-inset-top, 0px) + 6px); }
    body.touch.kb #prompt h2 { font-size: 20px; margin: 0; }
    body.touch.kb #dock { bottom: calc(var(--kb, 0px) + 6px); }
    /* the final screen on its side: the button and the proof line sit at the right, the hero keeps the middle */
    body.touch.built #dock { left: auto; right: calc(env(safe-area-inset-right, 0px) + 12px); width: min(300px, 38vw); transform: none; }
    body.touch.built #built small { font-size: 11.5px; }
    body.touch #card { flex-direction: row; gap: 16px; }
    body.touch #card-img { height: calc(100dvh - 24px); max-height: none; width: auto; }
    body.touch #card-side { width: 200px; flex-direction: column; }
    body.touch #card-side .btn { flex: none; width: 100%; }
    body.touch #camp .q { top: calc(env(safe-area-inset-top, 0px) + 5vh); }
    body.touch #camp h2 { font-size: clamp(24px, 8vh, 38px); }
    body.touch #camp p { margin-top: 8px; font-size: 15px; }
  }
`;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function installTouch({ S, $, sfxVoice, unlockAudio } = {}) {
  if (typeof document === 'undefined' || document.body.classList.contains('touch')) return null;
  const qs = new URLSearchParams(location.search);
  document.documentElement.classList.add('touch'); document.body.classList.add('touch');
  const style = document.createElement('style'); style.id = 'touch-css'; style.textContent = CSS; document.head.appendChild(style);

  /* the viewport: no pinch or double-tap zoom, the notch is ours, the keyboard does not resize the page under us */
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual');
  /* iOS ignores user-scalable=no: stop the pinch and the double-tap zoom by hand (never on the answer field) */
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => { const now = performance.now(); if (now - lastEnd < 320 && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) e.preventDefault(); lastEnd = now; }, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !(e.target instanceof HTMLInputElement)) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });

  /* the answer field on a phone: a send key, capitals at the start, no autocorrect that renames a brother */
  const typed = $?.('typed');
  if (typed) { typed.setAttribute('enterkeyhint', 'send'); typed.setAttribute('autocapitalize', 'sentences'); typed.setAttribute('autocorrect', 'off'); typed.setAttribute('spellcheck', 'false'); typed.setAttribute('inputmode', 'text'); }

  /* ---- the on-screen keyboard: --kb is its height; the dock rides above it, the question stays in view ---- */
  const root = document.documentElement; const vv = window.visualViewport; const fakeKb = +(qs.get('kb') || 0);
  const viewport = () => {
    const full = window.innerHeight; const vis = vv ? vv.height : full;
    let kb = fakeKb && document.activeElement === typed ? fakeKb : Math.max(0, Math.round(full - vis - (vv ? vv.offsetTop : 0)));
    if (kb < 80) kb = 0; /* the browser bar sliding is not a keyboard */
    root.style.setProperty('--kb', `${kb}px`); root.style.setProperty('--vvh', `${Math.round(kb ? full - kb : vis)}px`);
    document.body.classList.toggle('kb', kb > 0);
    document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth);
    document.body.classList.toggle('landscape', window.innerHeight <= window.innerWidth);
    /* a page the keyboard pushed up comes back: everything is position: fixed and laid out from --kb */
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  };
  vv?.addEventListener('resize', viewport); vv?.addEventListener('scroll', viewport);
  window.addEventListener('resize', viewport); window.addEventListener('orientationchange', () => setTimeout(viewport, 250));
  typed?.addEventListener('focus', () => { viewport(); setTimeout(viewport, 350); }); typed?.addEventListener('blur', () => setTimeout(viewport, 60));
  viewport();
  /* a sent answer closes the keyboard: the reveal gets the whole screen. The next question focuses the field again
     (Android opens the keyboard; iOS waits for a tap on the field) */
  typed?.addEventListener('keydown', (e) => { if (e.key === 'Enter') setTimeout(() => typed.blur(), 0); });

  /* ---- audio: iOS opens it on a touch that ends; the tab coming back resumes it ---- */
  for (const ev of ['touchend', 'click']) window.addEventListener(ev, () => { try { unlockAudio?.(); const V = sfxVoice?.(); if (V?.ctx?.state === 'suspended') V.ctx.resume(); } catch { /* audio is optional */ } }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    try { const V = sfxVoice?.(); if (!V?.ctx) return; if (document.hidden) V.ctx.suspend?.(); else V.ctx.resume?.(); } catch { /* audio is optional */ }
    if (document.hidden) { release(); T.park = null; }
  });

  /* ---- the controls ---- */
  const tc = document.createElement('div'); tc.id = 'tc'; tc.className = 'hidden'; tc.setAttribute('aria-hidden', 'true');
  tc.innerHTML = `<div class="zone" id="tc-move"></div><div class="zone" id="tc-look"></div><div id="tc-base"><i id="tc-knob"></i></div>
    <button id="tc-rld" class="hidden" type="button" aria-label="Reload">${ICON.rld}</button>
    <button id="tc-blk" type="button" aria-label="Block">${ICON.blk}</button>
    <button id="tc-dge" type="button" aria-label="Dodge">${ICON.dge}</button>
    <button id="tc-abl" type="button" aria-label="Power">${ICON.abl}</button>
    <button id="tc-atk" type="button" aria-label="Attack">${ICON.atk}</button>`;
  document.body.appendChild(tc);
  const rot = document.createElement('div'); rot.id = 'tc-rot'; rot.className = 'hidden'; rot.setAttribute('role', 'status'); rot.innerHTML = `${ICON.rot}<span>Turn your phone</span><button id="tc-up" type="button">Play upright</button>`; document.body.appendChild(rot);
  /* a phone with its rotation locked cannot turn: one tap plays the fight upright (kept for this visit) */
  let upright = false; try { upright = sessionStorage.getItem('sq.upright') === '1'; } catch { /* private mode */ }
  rot.querySelector('#tc-up').addEventListener('click', () => { upright = true; try { sessionStorage.setItem('sq.upright', '1'); } catch { /* private mode */ } });
  const skip = document.createElement('button'); skip.id = 'tc-skip'; skip.className = 'hidden'; skip.type = 'button'; skip.textContent = 'Skip'; document.body.appendChild(skip);
  const el = (id) => tc.querySelector('#' + id);
  const base = el('tc-base'); const knob = el('tc-knob'); const bAtk = el('tc-atk'); const bBlk = el('tc-blk'); const bDge = el('tc-dge'); const bAbl = el('tc-abl'); const bRld = el('tc-rld');

  const fight = () => (S?.stage === 'fight' ? S.fight : null) || null;
  const live = (f) => !!(f && f.active && !f.over && !f.paused && !f.deathCam && !f.dd);
  const T = { move: null, park: null, look: null, atk: null, blk: null, lookAt: -1e9, stick: { f: 0, r: 0 } };
  const STICK_R = 54; const LOOK_X = 0.0052; const LOOK_Y = 0.004;

  function setStick(f, r) {
    T.stick.f = f; T.stick.r = r; const F = S?.fight; if (!F) return;
    F.touchMove = f || r ? T.stick : null;
    /* the road reads "forward is held" from the key set (the run, the stuck check): the stick says the same */
    /* the key set too: other modules read it (the walk's run and stuck rules, the look beat that lets go when the player moves) */
    const kset = (c, on) => { if (on) F.keys.add(c); else F.keys.delete(c); }; kset('KeyW', f > 0.45); kset('KeyS', f < -0.45); kset('KeyD', r > 0.45); kset('KeyA', r < -0.45);
  }
  function release() {
    /* a thumb still down on the stick when the controls go (a cutscene, the camp) is kept: it walks again when they come back */
    if (T.move) T.park = T.move;
    T.move = T.look = T.atk = T.blk = null; setStick(0, 0); base.classList.remove('on'); base.style.left = ''; base.style.top = ''; knob.style.transform = '';
    for (const b of [bAtk, bBlk, bDge, bAbl, bRld]) b.classList.remove('down');
    const F = S?.fight; if (F) { F.mouseBlock = false; if (F.held) { F.held = false; try { if (F.charge) F.releaseCharge(); } catch { /* no charge */ } } }
  }
  const look = (F, dx, dy) => {
    const k = F.lock ? 0.35 : 1;
    F.yaw -= dx * LOOK_X * k; F.pitch = clamp(F.pitch - dy * LOOK_Y, -1.1, 1.1); F.lookT = F.clock; T.lookAt = performance.now();
    if (F.sway) { F.sway.x = clamp(F.sway.x - dx * 0.00016, -0.05, 0.05); F.sway.y = clamp(F.sway.y + dy * 0.00016, -0.04, 0.04); }
  };
  const find = (list, id) => { for (const t of list) if (t.identifier === id) return t; return null; };

  tc.addEventListener('touchstart', (e) => {
    e.preventDefault(); const F = fight(); if (!live(F)) return;
    for (const t of e.changedTouches) {
      const at = t.target.closest ? t.target.closest('button, .zone') : null; if (!at) continue;
      if (at === bAtk) { if (T.atk) continue; T.atk = { id: t.identifier, x: t.clientX, y: t.clientY }; bAtk.classList.add('down'); F.held = true; F.heldAt = performance.now(); try { F.tryAttack(); } catch (err) { console.warn('touch attack', err); } }
      else if (at === bBlk) { if (T.blk) continue; T.blk = { id: t.identifier }; bBlk.classList.add('down'); F.mouseBlock = true; }
      else if (at === bDge) { tap(bDge); try { F.tryDodge(); } catch (err) { console.warn('touch dodge', err); } }
      else if (at === bAbl) { tap(bAbl); try { F.castAbility(); } catch (err) { console.warn('touch power', err); } }
      else if (at === bRld) { tap(bRld); try { F.rg?.reloadKey?.(); } catch (err) { console.warn('touch reload', err); } }
      else if (at.id === 'tc-move') { if (T.move) continue; T.move = { id: t.identifier, x: t.clientX, y: t.clientY }; base.style.left = `${t.clientX}px`; base.style.top = `${t.clientY}px`; base.classList.add('on'); }
      else if (at.id === 'tc-look') { if (T.look) continue; T.look = { id: t.identifier, x: t.clientX, y: t.clientY }; }
    }
  }, { passive: false });
  tc.addEventListener('touchmove', (e) => {
    e.preventDefault(); const F = S?.fight; if (!F) return;
    for (const t of e.changedTouches) {
      const M = T.move && t.identifier === T.move.id ? T.move : T.park && t.identifier === T.park.id ? T.park : null;
      if (M) {
        let dx = t.clientX - M.x; let dy = t.clientY - M.y; const d = Math.hypot(dx, dy);
        if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
        const dead = 0.16; const fx = d > 0 ? dx / d : 0; const fy = d > 0 ? dy / d : 0;
        /* a light push walks, a full push is full speed */
        const mag = Math.hypot(dx, dy) / STICK_R; const out = mag < dead ? 0 : Math.min(1, (mag - dead) / (0.82 - dead));
        M.dx = dx; M.dy = dy; M.f = -fy * out; M.r = fx * out;
        if (M === T.move) { knob.style.transform = `translate(${dx}px, ${dy}px)`; setStick(M.f, M.r); } /* a parked thumb (a cutscene hid the controls) is only followed */
      } else if (T.look && t.identifier === T.look.id) { look(F, t.clientX - T.look.x, t.clientY - T.look.y); T.look.x = t.clientX; T.look.y = t.clientY; }
      else if (T.atk && t.identifier === T.atk.id) { /* a thumb held on Attack still aims (a drawn bow, a charged blow) */ look(F, t.clientX - T.atk.x, t.clientY - T.atk.y); T.atk.x = t.clientX; T.atk.y = t.clientY; }
    }
  }, { passive: false });
  const end = (e) => {
    e.preventDefault(); const F = S?.fight;
    for (const t of e.changedTouches) {
      if (T.move && t.identifier === T.move.id) { T.move = null; setStick(0, 0); base.classList.remove('on'); base.style.left = ''; base.style.top = ''; knob.style.transform = ''; }
      else if (T.park && t.identifier === T.park.id) T.park = null;
      else if (T.look && t.identifier === T.look.id) T.look = null;
      else if (T.atk && t.identifier === T.atk.id) { T.atk = null; bAtk.classList.remove('down'); if (F && F.held) { F.held = false; try { if (F.charge) F.releaseCharge(); } catch (err) { console.warn('touch release', err); } } }
      else if (T.blk && t.identifier === T.blk.id) { T.blk = null; bBlk.classList.remove('down'); if (F) F.mouseBlock = false; }
    }
  };
  tc.addEventListener('touchend', end, { passive: false }); tc.addEventListener('touchcancel', end, { passive: false });
  function tap(b) { b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 140); }
  window.addEventListener('blur', () => { release(); T.park = null; });
  skip.addEventListener('click', () => { try { S?.fight?.dd?.skip?.(); } catch { /* no payoff */ } });

  /* ---- Android: the Start quest tap opens the full screen and locks it on its side (iOS has neither: the prompt asks) ---- */
  let locked = false;
  const goLandscape = () => {
    if (navigator.webdriver || qs.get('lock') === '0') return; /* tests keep their viewport */
    try { const el = document.documentElement; const fs = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      Promise.resolve(fs).then(() => screen.orientation?.lock?.('landscape')).then(() => { locked = true; }).catch(() => { /* not allowed here */ }); } catch { /* not allowed here */ }
  };
  const endLandscape = () => { if (!locked) return; locked = false; try { screen.orientation?.unlock?.(); } catch { /* none */ } try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* none */ } };
  $?.('go')?.addEventListener('click', goLandscape, { capture: true });

  /* ---- the soft aim assist: with no look drag for a moment, the view eases to the foe in front ---- */
  const assistOn = qs.get('assist') !== '0'; let lastT = performance.now(); let ddAt = 0;
  function assist(F, dt) {
    if (!assistOn || F.lock || performance.now() - T.lookAt < 520) return;
    const ranged = !!F.rg; const reach = (F.weapon?.reach || 2.2);
    const range = ranged ? 42 : reach + 7; const minDot = ranged ? 0.9 : 0.1;
    const fx = -Math.sin(F.yaw); const fz = -Math.cos(F.yaw);
    let best = null; let bs = -1e9;
    const consider = (p, h) => {
      if (!p) return; const dx = p.x - F.pos.x; const dz = p.z - F.pos.z; const d = Math.hypot(dx, dz); if (d > range || d < 0.05) return;
      const dot = (dx * fx + dz * fz) / d; if (dot < minDot) return;
      const s = dot * 3 - d * (ranged ? 0.05 : 0.3); if (s > bs) { bs = s; best = { x: p.x, y: (p.y || 0) + h, z: p.z, d }; }
    };
    for (const f of F.foes || []) { if (!f || f.state === 'dead' || f.state === 'spawn' || f.gone || !f.pos) continue; consider(f.pos, 1.15 * (f.scale || 1)); }
    let bf = null; try { bf = F.boss && !F.boss.dead ? F.boss.focus?.() : null; } catch { bf = null; }
    if (bf) consider(bf, 0);
    if (!best) return;
    let want = Math.atan2(-(best.x - F.pos.x), -(best.z - F.pos.z)); let dy = want - F.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    /* strong while a blow is on its way or the trigger is held, gentle otherwise */
    const busy = !!(F.swing || F.charge || F.held);
    const rate = ranged ? (busy ? 3.2 : 1.6) : (busy ? 7 : best.d < reach + 2.5 ? 3.2 : 1.4);
    F.yaw += clamp(dy, -rate * dt, rate * dt);
    if (ranged) { const eye = (F.pos.y || 0) + 1.6; const wp = clamp(Math.atan2(best.y - eye, best.d), -0.6, 0.6); F.pitch += clamp(wp - F.pitch, -rate * 0.7 * dt, rate * 0.7 * dt); }
  }

  /* ---- each frame: who shows, the rotate hold, the buttons' state ---- */
  const sq = () => (window.__sq = window.__sq || {});
  function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const F = fight(); const inFight = !!(F && F.active && !F.over);
    const cardUp = $ && !$('card').classList.contains('hidden');
    const portrait = window.innerHeight > window.innerWidth;
    if (cardUp && locked) endLandscape();
    /* the fight is played on its side: in portrait the game holds (main.js reads __sq.hold) until the phone turns */
    const loading = $ && !$('loading').classList.contains('hidden'); /* the fight still loads: frames must run */
    const needTurn = inFight && !S.camping && !cardUp && !loading && portrait && !upright;
    if (needTurn !== !rot.classList.contains('hidden')) { rot.classList.toggle('hidden', !needTurn); if (needTurn) release(); }
    sq().hold = needTurn;
    const on = live(F) && !needTurn && !S.camping && !cardUp;
    if (on !== !tc.classList.contains('hidden')) { tc.classList.toggle('hidden', !on); if (!on) release(); else if (T.park) { const M = T.move = T.park; T.park = null; base.style.left = `${M.x}px`; base.style.top = `${M.y}px`; base.classList.add('on'); knob.style.transform = `translate(${M.dx || 0}px, ${M.dy || 0}px)`; setStick(M.f || 0, M.r || 0); } document.body.classList.toggle('tc-on', on); }
    if (on) {
      /* played upright: a taller view angle, so the sides are not blind (the fight sets 70 once at its start) */
      const cam = window.__sq?.world?.camera; if (cam) { const want = portrait ? 96 : 70; if ((cam.fov === 70 || cam.fov === 96) && cam.fov !== want) { cam.fov = want; cam.updateProjectionMatrix(); } }
      assist(F, dt);
      const ranged = !!F.rg; if (bAtk.dataset.k !== (ranged ? 'aim' : 'atk')) { bAtk.dataset.k = ranged ? 'aim' : 'atk'; bAtk.innerHTML = ranged ? ICON.aim : ICON.atk; }
      const gun = ranged && F.rg?.P?.kind === 'gun'; if (gun === bRld.classList.contains('hidden')) bRld.classList.toggle('hidden', !gun);
      const empty = gun && F.rg.rounds === 0 && F.rg.st !== 'reload'; if (empty !== bRld.classList.contains('want')) bRld.classList.toggle('want', empty);
      const ready = !(F.abilityCd > 0); if (ready !== bAbl.classList.contains('ready')) { bAbl.classList.toggle('ready', ready); bAbl.classList.toggle('cd', !ready); }
      const dcd = F.dodgeCd > 0; if (dcd !== bDge.classList.contains('cd')) bDge.classList.toggle('cd', dcd);
    }
    /* the payoff: a Skip button after 2 s (the keys' rule) */
    const dd = !!(F && F.dd && !F.dd.ended && !F.dd.skipped); /* fight.over is already true while the death scene plays */ if (dd && !ddAt) ddAt = now; if (!dd) ddAt = 0;
    const showSkip = dd && now - ddAt > 2000 && !needTurn; if (showSkip === skip.classList.contains('hidden')) skip.classList.toggle('hidden', !showSkip);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const api = { release, state: T, el: { tc, rot, skip }, viewport };
  sq().touch = api;
  return api;
}

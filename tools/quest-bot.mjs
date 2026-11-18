/* Plays a whole quest with a hero that cannot die, to prove the flow of each quest shape.
   node tools/quest-bot.mjs "world=edo&fight=sword&nemesis=lord&story=freedom" out-dir [secs] [power]
   Env: URL (default http://localhost:8790/), CHROME_PATH (default is the macOS Chrome path), FAILII=1 (lose chapter II on purpose).
   Exit code 0 when the end card comes up and no error was logged, else 1.
   The bot itself is tools/lib/quest-driver.mjs (shared with tools/play.mjs). */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { installHeal, driveQuest, campHook } from './lib/quest-driver.mjs';
/* FAILII=1 (or failii=1 in the query): chapter II is lost on purpose (web/src/quest2.js FORCE_FAIL), to prove a loss still reaches the card */
const q = process.argv[2] + (process.env.FAILII === '1' && !/failii=/.test(process.argv[2]) ? '&failii=1' : ''); const OUT = process.argv[3] || 'shots'; const SECS = Number(process.argv[4] || 150); const POWER = Number(process.argv[5] || 3);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => { if (!/Pointer Lock/.test(String(e))) errors.push(String(e)); }); page.on('console', (m) => { if (m.type() === 'warn' && /^(twist|prop|prewarm|boss|companions|quest|early|chapters|journey)/.test(m.text())) errors.push(`warn: ${m.text()}`); if (m.type() === 'error' && !/varying vFogDepth|favicon|Pointer Lock/.test(m.text())) errors.push(m.text()); });
await page.goto(`${process.env.URL || 'http://localhost:8790/'}?${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sq?.fight?.active && (window.__sq.fight.foes.length > 0 || window.__sq.fight.boss || window.__sq.fight.journey), { timeout: 40000 });
await page.evaluate(() => document.getElementById('feed')?.classList.add('hidden'));
await installHeal(page, { power: POWER, full: true });
let n = 0;
/* the camp question: the bot answers after 2 s like a player (ANSWER=- leaves it to the 25 s quiet timer) */
const shot = async () => { await page.screenshot({ path: `${OUT}/f${String(n++).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 70 }); };
const hook = campHook(page, { answer: process.env.ANSWER || undefined, onWait: shot });
const { trail } = await driveQuest(page, { ms: SECS * 1000, hook, onFrame: shot });
/* the card can come up to about 10 s after the fight ends (boss death, then the freed line): wait for it, up to 12 s */
/* the frames go on through the boss's fall and the hold, and end on the card (saved as the last f### and as card.jpg) */
let cardUp = false;
for (let k = 0; k < 30; k++) {
  await sleep(500);
  const up = await page.evaluate(() => { const c = document.getElementById('card'); return !!c && !c.classList.contains('hidden') && c.style.visibility !== 'hidden'; }).catch(() => false);
  if (up) { await sleep(900); cardUp = true; break; }
  if (k % 2 === 1) await page.screenshot({ path: `${OUT}/f${String(n++).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 70 });
}
if (cardUp) { await page.screenshot({ path: `${OUT}/f${String(n++).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 70 }); await page.screenshot({ path: `${OUT}/card.jpg`, type: 'jpeg', quality: 85 }); }
const end = await page.evaluate(() => { const f = window.__sq.fight; return { over: f.over, shape: f.story?.shape || null, opening: f.story?.first?.id || null, twist: f.twistId, stage: f.stage, taken: f.taken, deed: f.deed, gift: f.resolve?.id || null, wave: f.wave, bossHp: f.bossFoe?.hp ?? f.boss?.hp ?? null, card: !document.getElementById('card')?.classList.contains('hidden') }; });
console.log(trail.join('\n')); console.log(JSON.stringify(end));
const long = await page.evaluate(() => window.__long || []); console.log('long frames on the walk', long.length, JSON.stringify(long.slice(0, 12)));
console.log('frames', n, errors.length ? `ERRORS\n${[...new Set(errors)].join('\n')}` : 'ERRORS none');
console.log('card', cardUp ? 'reached' : 'NOT reached');
await browser.close();
process.exit(cardUp && !errors.length ? 0 : 1);

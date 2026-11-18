/* Headless full run in typed mode. Screenshots go to shots/. Ends with ERRORS none or a list.
   Env: URL (default http://localhost:8790/), OUT (screenshot folder), CHROME_PATH (Chrome or Chromium binary; default is the macOS path). */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { installHeal, driveQuest } from './lib/quest-driver.mjs';

const URL = process.env.URL || 'http://localhost:8790/';
const OUT = process.env.OUT || 'shots';
const W = Number(process.env.W || 1600); const H = Number(process.env.H || 900);
const ANSWERS = process.env.ANSWERS ? JSON.parse(process.env.ANSWERS) : {
  name: 'They call me Rowan',
  origin: 'New Orleans, hot and humid, right by the gulf',
  born: 'May 5th 1990',
  body: 'I write code all day and I lift weights at night',
  heart: 'My brother Wren and my dog Ash',
  enemy: 'A storm that keeps growing, a real dragon',
};
const FORGE = process.env.FORGE || 'Forge me a silver spear that carries frost';
const VOW = process.env.VOW || 'Because Wren and Ash are waiting for me and I promised them';
const STOP = process.env.STOP || 'card';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
/* NOMIC=1: a browser with no speech input (the typed field must work at once, with no message) */
if (process.env.NOMIC === '1') await page.evaluateOnNewDocument(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
page.on('requestfailed', (r) => { if (!/fonts\.g|favicon/.test(r.url())) errors.push(`requestfailed: ${r.url()}`); });
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const state = () => page.evaluate(() => { const S = window.__sq.S; return { stage: S.stage, step: S.step, shown: S.bodyTypeShown, seed: S.seed, archetype: S.archetype?.id, biome: S.biome?.id, nemesis: S.nemesis?.id, motive: S.motive?.id, name: S.name, sign: S.sign, age: S.age?.label, place: S.place, build: S.build, enemy: S.enemy, weapon: S.weapon?.id, material: S.material?.id, element: S.element?.id, weaponName: S.weaponName, mentions: S.mentions, calls: window.__sq.feed.calls, cost: window.__sq.feed.cost, median: window.__sq.feed.median(), dropped: window.__sq.feed.dropped }; });

await page.goto(URL, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__sq?.ready && window.__sq.S.hero);
await sleep(400); await shot('00-title-black');
await sleep(3200); await shot('01-title');
/* one start, no mode choice (title button "Start now" or Enter); window.__sq.start is the hook */
await page.keyboard.press('Enter');
await sleep(300);
if (await page.evaluate(() => window.__sq.S.stage === 'title')) await page.evaluate(() => window.__sq.start());
await sleep(500);
console.log('input', JSON.stringify(await page.evaluate(() => ({ mode: window.__sq.S.mode, typed: !document.querySelector('#typed').classList.contains('hidden'), focus: document.activeElement?.id, keys: document.querySelector('#under-keys').textContent }))));

/* answer each build step in turn */
const ids = Object.keys(ANSWERS);
for (let i = 0; i < ids.length; i++) {
  await page.waitForFunction((n) => window.__sq.S.step === n, { timeout: 20000 }, i).catch(() => errors.push(`step ${ids[i]} never shown`));
  await sleep(350);
  await page.type('#typed', ANSWERS[ids[i]], { delay: 30 });
  await sleep(250);
  await shot(`0${i + 2}-step-${ids[i]}-typed`);
  await page.keyboard.press('Enter');
  await sleep(300); await shot(`0${i + 2}-step-${ids[i]}-lift`);
  await sleep(1100);
  await shot(`0${i + 2}-step-${ids[i]}`);
  for (let k = 0; k < 16; k++) {
    const st = await page.evaluate((n) => { const b = document.querySelector('#ask:not(.hidden) button'); if (b) { b.click(); return 'asked'; } return window.__sq.S.step > n ? 'next' : 'wait'; }, i);
    if (st === 'asked') console.log('asked at', ids[i]);
    if (st !== 'wait') break;
    await sleep(500);
  }
}
await page.waitForFunction(() => window.__sq.S.step === 6, { timeout: 20000 }).catch(() => errors.push('weapon step never shown'));
console.log('after build', JSON.stringify(await state()));
if (STOP === 'build') { await finish(); }
await sleep(600);
await page.type('#typed', FORGE, { delay: 20 });
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__sq.S.weapon, { timeout: 20000 }).catch(() => errors.push('forge never resolved'));
/* the forge is staged (about 6 s); the build screen and its one button come when it ends */
await page.waitForFunction(() => document.body.classList.contains('built') && !document.querySelector('#go').classList.contains('hidden'), { timeout: 25000 }).catch(() => errors.push('build screen never shown'));
await sleep(3600);
console.log('after forge', JSON.stringify(await state()));
console.log('forge screen', JSON.stringify(await page.evaluate(() => ({ head: document.querySelector('#prompt h2').textContent, sub: document.querySelector('#prompt p').textContent, go: document.querySelector('#go').textContent, goShown: !document.querySelector('#go').classList.contains('hidden'), label: window.__sq.S.weaponLabel, feed: [...document.querySelectorAll('#feed-list li')].slice(0, 3).map((l) => l.textContent.replace(/\s+/g, ' ')) }))));
await shot('09-forge-done');
if (STOP === 'forge') { await finish(); }

await page.click('#go');
await page.waitForFunction(() => document.body.classList.contains('cine'), { timeout: 30000 }).catch(() => {});
await sleep(1300); await shot('10-chapter-1');
/* every quest opens with a walk chapter (journey.js): the fight is live when the walk, the foes or the boss are */
await page.waitForFunction(() => { const f = window.__sq.fight; return f?.active && (f.journey || f.foes.length > 0 || f.boss); }, { timeout: 40000 }).catch(() => errors.push('fight never started'));
await sleep(1800); await shot('10-fight-spawn');

/* the bot of tools/lib/quest-driver.mjs: walks chapter I, does the tasks, fights.
   Test only: the hero is kept standing on every frame so the run reaches the camp and the boss (GOD=0 turns this off) */
if (process.env.GOD !== '0') await installHeal(page, { full: true });
let shots = 0; let cineShots = 0; let lastCine = Date.now();
await driveQuest(page, {
  ms: Number(process.env.FIGHT_MS || 420000),
  hook: async (i) => {
    /* the camp: answer why you go on */
    if (await page.evaluate(() => window.__sq.S.camping && !document.querySelector('#typed').classList.contains('hidden'))) {
      await sleep(1200); await shot('13-camp-ask');
      await page.type('#typed', VOW, { delay: 15 }); await page.keyboard.press('Enter');
      await sleep(900); await shot('13-camp-lift');
      await page.waitForFunction(() => !window.__sq.S.camping, { timeout: 20000 }).catch(() => errors.push('camp never closed'));
      console.log('vow', JSON.stringify(await page.evaluate(() => ({ resolve: window.__sq.S.resolve?.id, vow: window.__sq.S.vow }))));
      return true;
    }
    if (cineShots < 5 && Date.now() - lastCine > 2500 && await page.evaluate(() => document.body.classList.contains('cine') || document.querySelector('#line.on'))) { lastCine = Date.now(); cineShots++; await sleep(900); await shot(`15-cine-${cineShots}`); return true; }
    return false;
  },
  onFrame: async (d, i) => { if (i % 18 >= 9 && shots < 6 && d.dist != null) { shots++; await shot(`11-fight-${shots}`); console.log('fight', JSON.stringify(d)); } },
});
if (await page.evaluate(() => window.__sq.S.stage !== 'card' && window.__sq.fight && !window.__sq.fight.over)) { console.log('time is up: the hero falls'); await page.evaluate(() => { const f = window.__sq.fight; f.hp = 0; f.finish(false); }); }
await page.waitForFunction(() => window.__sq.S.stage === 'card', { timeout: 20000 }).catch(() => errors.push('card never shown'));
await sleep(1500);
console.log('fight end', JSON.stringify(await page.evaluate(() => window.__sq.fight.debug())));
console.log('final', JSON.stringify(await state()));
await shot('12-card');
const img = await page.evaluate(() => { document.querySelector('#save').click(); return window.__sq.lastImage?.toDataURL('image/png'); });
if (img) { fs.writeFileSync(`${OUT}/14-card-image.png`, Buffer.from(img.split(',')[1], 'base64')); console.log('shot 14-card-image'); } else errors.push('save image made nothing');
console.log('card buttons', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#card-side .btn')].filter((b) => !b.classList.contains('hidden')).map((b) => b.textContent))));
/* Play again = a fresh run from question 1 (the title is skipped, nothing from the old run stays) */
if (process.env.AGAIN !== '0') {
  const t0 = Date.now();
  await page.click('#again');
  await page.waitForFunction(() => window.__sq?.S?.stage === 'build' && window.__sq.S.step === 0, { timeout: 60000 }).catch(() => errors.push('play again never reached question 1'));
  await sleep(1500);
  console.log('play again', Date.now() - t0, 'ms', JSON.stringify(await page.evaluate(() => ({ name: window.__sq.S.name, weapon: window.__sq.S.weapon?.id ?? null, world: window.__sq.S.world, feedRows: document.querySelectorAll('#feed-list li').length, focus: document.activeElement?.id }))));
  await shot('16-play-again');
}
await finish();

async function finish() {
  console.log('feed', JSON.stringify(await page.evaluate(() => window.__sq.feed.entries.slice(0, 60).reverse().map((e) => `${e.pattern} ${e.ms}ms ${e.label} | ${e.detail}`)), null, 1).slice(0, 9000));
  await browser.close();
  console.log(errors.length ? `ERRORS\n${errors.join('\n')}` : 'ERRORS none');
  process.exit(errors.length ? 1 : 0);
}

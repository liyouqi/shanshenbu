import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const baseURL = process.env.GAME_URL || 'http://localhost:5173';
const mobile = process.env.MOBILE === '1';
const artifactDir = `.test-artifacts/coverage${mobile ? '-mobile' : ''}`;
const executablePath = process.env.BROWSER_EXECUTABLE || (process.platform === 'darwin' && existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
await mkdir(artifactDir, { recursive: true });
const evidence = [], errors = [];
const cases = [['idle', null, 1], ['walk', 'KeyD', 1], ['jump', 'KeyW', 1], ['crouch', 'KeyS', 1], ['guard', 'KeyA', 1], ['punch', 'KeyJ', 2], ['dodge', 'KeyK', 3], ['kick', 'KeyL', 3], ['nineRings', 'KeyU', 5]];
try {
  const page = await browser.newPage(mobile
    ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const load = async () => { await page.goto(baseURL); await page.waitForFunction(() => window.__shanshenbu?.visuals); };
  const observe = async (animation, frame, code = null, timeout = 4000) => page.evaluate(async ({ animation, frame, code, timeout }) => {
    if (code) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    return await new Promise((resolve, reject) => {
      const until = performance.now() + timeout;
      const poll = () => {
        const core = window.__shanshenbu.snapshot(), view = window.__shanshenbu.visuals();
        if (view.player.animation === animation && view.player.frame >= frame) {
          window.dispatchEvent(new Event('blur'));
          resolve({ core, view });
        } else if (performance.now() > until) reject(new Error(`Did not observe ${animation}:${frame}`));
        else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }, { animation, frame, code, timeout });
  const check = async (animation, sample) => {
    const v = sample.view.player, f = sample.core.fighters.player;
    assert.equal(v.animation, animation);
    assert.ok(v.texture.startsWith('teacher-'));
    assert.equal(v.scaleX, v.scaleY);
    assert.equal(v.flipX, f.facing === -1);
    // Render interpolation may be at most one movement step behind the core.
    assert.ok(Math.abs(v.x - f.x) <= 15);
    if (animation !== 'ko') assert.ok(Math.abs(v.y - (430 - f.height)) <= 15);
    const target = `${artifactDir}/${animation}.png`;
    await page.screenshot({ path: target, fullPage: true, style: '.overlay { visibility:hidden!important }' });
    evidence.push({ animation, frame: v.frame, texture: v.texture, x: v.x, y: v.y, scale: v.scaleX, screenshot: target });
    console.log(`PASS ${animation}: frame ${v.frame}, facing and world anchor`);
  };
  for (const [animation, code, frame] of cases) {
    await load();
    await check(animation, await observe(animation, frame, code));
  }
  // Actual CPU damage, without modifying combat state or accelerating the clock.
  await load();
  await check('hit', await observe('hit', 1, 'KeyS', 65000));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await check('ko', await observe('ko', 3, null, 65000));
  const stopped = await page.evaluate(() => window.__shanshenbu.snapshot().elapsed);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.locator('#result').waitFor({ state: 'visible', timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__shanshenbu.snapshot().elapsed), stopped);
  assert.equal(await page.evaluate(() => window.__shanshenbu.visuals().player.frame), 5);
  await page.click('#restart');
  assert.equal(await page.evaluate(() => window.__shanshenbu.visuals().player.animation), 'idle');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__shanshenbu.snapshot().elapsed), 0);
  assert.deepEqual(errors, []);
  await writeFile(`${artifactDir}/report.json`, JSON.stringify(evidence, null, 2));
  console.log('PASS all 11 animations, KO completes with frozen combat clock, replay resets to idle');
} finally { await browser.close(); }

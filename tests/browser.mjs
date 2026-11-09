import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const baseURL = process.env.GAME_URL || 'http://localhost:5173';
const executablePath = process.env.BROWSER_EXECUTABLE || (process.platform === 'darwin' && existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
await mkdir('.test-artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const watch = page => { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`${m.text()} @ ${m.location().url}`); }); };
const snapshot = page => page.evaluate(() => window.__shanshenbu.snapshot());
const load = async page => { await page.goto(baseURL); await page.waitForFunction(() => window.__shanshenbu); };
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await desktop.newPage(); watch(page); await load(page);
  assert.equal((await snapshot(page)).phase, 'ready');
  const initialVisual = await page.evaluate(() => window.__shanshenbu.visuals());
  await page.waitForTimeout(500); assert.equal((await snapshot(page)).elapsed, 0);
  const idleVisual = await page.evaluate(() => window.__shanshenbu.visuals());
  assert.equal(idleVisual.player.animation, 'idle');
  assert.notEqual(idleVisual.player.frame, initialVisual.player.frame);
  await page.screenshot({ path: '.test-artifacts/desktop-ready.png', fullPage: true });
  await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
  let s = await snapshot(page); assert.equal(s.phase, 'playing'); assert.ok(s.fighters.player.x > 316);
  await page.keyboard.press('k'); await page.waitForTimeout(100);
  // Acceptance persists after the short animation, even if browser automation is delayed.
  assert.ok((await snapshot(page)).fighters.player.cooldown.dodge > 0);
  await page.keyboard.press('Escape'); s = await snapshot(page); assert.equal(s.phase, 'paused');
  const pausedVisual = await page.evaluate(() => window.__shanshenbu.visuals());
  await page.waitForTimeout(350); assert.equal((await snapshot(page)).elapsed, s.elapsed);
  assert.deepEqual(await page.evaluate(() => window.__shanshenbu.visuals()), pausedVisual);
  await page.click('#resume'); await page.waitForTimeout(100); assert.equal((await snapshot(page)).phase, 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  s = await snapshot(page); assert.equal(s.phase, 'paused');
  await page.waitForTimeout(250); assert.equal((await snapshot(page)).elapsed, s.elapsed);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.click('#mute'); assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('l'); await page.waitForTimeout(100);
  await page.screenshot({ path: '.test-artifacts/desktop-fight.png', fullPage: true });
  console.log('PASS desktop: first input, keyboard, dodge, pause/resume, blur/focus, mute');

  // Let the CPU finish an actual rendered round. No mutation or skipped simulation time.
  const roundDeadline = Date.now() + 70000;
  while ((await snapshot(page)).phase !== 'result' && Date.now() < roundDeadline) {
    await page.keyboard.press('j'); await page.waitForTimeout(180);
    await page.keyboard.press('l'); await page.waitForTimeout(200);
    await page.keyboard.press('u'); await page.waitForTimeout(250);
  }
  s = await snapshot(page); assert.equal(s.phase, 'result');
  await page.locator('#result').waitFor({ state: 'visible', timeout: 2000 });
  const resultVisual = await page.evaluate(() => window.__shanshenbu.visuals());
  for (const id of ['player', 'cpu']) if (s.fighters[id].hp === 0) {
    assert.equal(resultVisual[id].animation, 'ko');
    assert.equal(resultVisual[id].frame, 5);
  }
  await page.waitForTimeout(150); assert.equal((await snapshot(page)).elapsed, s.elapsed);
  assert.ok(await page.locator('#result').isVisible());
  await page.screenshot({ path: '.test-artifacts/desktop-result.png', fullPage: true });
  await page.click('#restart'); s = await snapshot(page);
  assert.equal(s.phase, 'ready'); assert.equal(s.elapsed, 0); assert.equal(s.fighters.player.hp, 100); assert.equal(s.fighters.cpu.hp, 100);
  assert.equal((await page.evaluate(() => window.__shanshenbu.visuals())).player.animation, 'idle');
  await page.keyboard.press('j'); await page.waitForTimeout(35); assert.equal((await snapshot(page)).phase, 'playing');
  console.log('PASS full round and replay through actual UI');
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const phone = await mobile.newPage(); watch(phone); await load(phone);
  await phone.screenshot({ path: '.test-artifacts/mobile-ready.png', fullPage: true });
  const cd = await mobile.newCDPSession(phone);
  const joy = await phone.locator('#joystick').boundingBox(); const kick = await phone.locator('[data-skill="kick"]').boundingBox();
  const left = { x: joy.x + joy.width * .78, y: joy.y + joy.height / 2, id: 1 };
  const right = { x: kick.x + kick.width / 2, y: kick.y + 20, id: 2 };
  await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
  await phone.waitForTimeout(80);
  await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
  await phone.waitForTimeout(70);
  s = await snapshot(phone); assert.equal(s.phase, 'playing'); assert.ok(s.fighters.player.cooldown.kick > 0); assert.equal(s.fighters.player.input.horizontal, 1);
  await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForTimeout(50); s = await snapshot(phone); assert.equal(s.fighters.player.input.horizontal, 0);
  await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
  await cd.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await phone.waitForTimeout(50); assert.equal((await snapshot(phone)).fighters.player.input.horizontal, 0);
  await phone.screenshot({ path: '.test-artifacts/mobile-fight.png', fullPage: true });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
  assert.equal(overflow, false);
  await phone.setViewportSize({ width: 390, height: 844 }); await phone.waitForTimeout(150);
  assert.equal((await snapshot(phone)).phase, 'paused'); assert.ok(await phone.locator('#rotate').isVisible());
  await phone.screenshot({ path: '.test-artifacts/mobile-portrait.png', fullPage: true });
  await phone.setViewportSize({ width: 844, height: 390 }); await phone.waitForTimeout(150);
  assert.equal((await snapshot(phone)).phase, 'playing');
  await phone.tap('#mobile-mute'); assert.equal(await phone.locator('#mobile-mute').getAttribute('aria-pressed'), 'true');
  console.log('PASS mobile emulation: simultaneous touches, release/cancel, landscape sizing, rotation pause, mute');
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('PASS no browser runtime errors; screenshots in .test-artifacts/');
} finally { await browser.close(); }

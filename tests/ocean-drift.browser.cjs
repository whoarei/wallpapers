'use strict';
// Run with Node + Playwright, optionally --browser <Chromium path> --covers.
// --base-url supports browsers whose managed policy blocks file:// navigation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const { chromium } = require(option('--playwright') || process.env.PLAYWRIGHT_PATH || 'playwright');
const output = path.resolve(option('--output-dir') || path.join(os.tmpdir(), 'ocean-drift-qa'));
const folder = path.resolve(__dirname, '../wallpapers/ocean-drift');
const url = option('--base-url') || pathToFileURL(path.join(folder, 'index.html')).href;
const localOrigin = new URL(url).origin;
const hash = data => createHash('sha256').update(data).digest('hex');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: option('--browser'), args: ['--no-sandbox'] });
  const errors = [], external = [], checks = [];
  function watch(page) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/^https?:/i.test(request.url()) && new URL(request.url()).origin !== localOrigin) external.push(request.url()); });
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage(); watch(page);
    await page.goto(url);
    await page.waitForTimeout(250);
    const start = await page.evaluate(() => getState());
    await page.waitForTimeout(1200);
    const running = await page.evaluate(() => getState());
    assert.ok(running.time > start.time + .6, 'scene time should advance');
    assert.ok(running.frames - start.frames <= 38, 'animation must respect 30 FPS cap');
    assert.equal(running.camera, start.camera, 'initial camera must linger');
    assert.ok(running.worldWidth > running.viewWidth * 3, 'world must extend beyond the screen');
    checks.push('live animation, 30 FPS cap, initial dwell, wide world');

    await page.keyboard.press('Space');
    assert.equal((await page.evaluate(() => getState())).paused, true);
    const frozen = await page.evaluate(() => getState());
    const before = hash(await page.locator('canvas').screenshot());
    await page.waitForTimeout(350);
    assert.equal(hash(await page.locator('canvas').screenshot()), before, 'pause must freeze the actual canvas');
    assert.equal((await page.evaluate(() => getState())).time, frozen.time);
    await page.keyboard.press('Space');
    checks.push('space pauses and resumes every animation and the camera');

    await page.mouse.move(950, 400); await page.mouse.down(); await page.mouse.move(550, 400, { steps: 8 }); await page.mouse.up();
    const dragged = await page.evaluate(() => getState());
    assert.equal(dragged.auto, false, 'drag disables automatic camera');
    assert.ok(dragged.camera > running.camera + 300, 'drag should pan the world');
    await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(1599, 400, { steps: 3 }); await page.mouse.up();
    assert.equal((await page.evaluate(() => getState())).camera, 0, 'drag must clamp to world edge');
    await page.mouse.click(800, 400);
    assert.ok((await page.evaluate(() => getState())).bubbles > 0, 'tap creates bubbles');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1000);
    assert.ok((await page.evaluate(() => getState())).camera > 0, 'arrow keys pan the world');
    await page.keyboard.press('KeyA');
    assert.equal((await page.evaluate(() => getState())).auto, true);
    await page.keyboard.press('KeyH'); assert.equal(await page.locator('#help-panel').isVisible(), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#help-panel').isVisible(), false);
    await page.keyboard.press('KeyS'); assert.equal(await page.locator('body').evaluate(e => e.classList.contains('interface-hidden')), true);
    await page.keyboard.press('KeyS');
    checks.push('dragging, bounds, bubbles, arrows, automatic tour toggle, help, UI toggle');

    await page.click('#tour');
    await page.waitForTimeout(6800);
    assert.equal(await page.locator('body').evaluate(e => e.classList.contains('idle')), true, 'mouse-clicked controls must still fade away');
    await page.mouse.move(800, 300);
    assert.equal(await page.locator('body').evaluate(e => e.classList.contains('idle')), false, 'moving the pointer restores controls');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('button:focus-visible').count(), 1, 'keyboard navigation retains a visible focus target');
    checks.push('controls fade after mouse use, wake on movement, and retain keyboard focus');

    await page.evaluate(() => oceanDrift.setPaused(true));
    await page.addStyleTag({ content: '.hud,#toast{display:none!important}' });
    for (let zone = 0; zone < 3; zone++) {
      await page.evaluate(z => oceanDrift.goToZone(z, true), zone);
      assert.equal((await page.evaluate(() => getState())).zone, zone);
      await page.screenshot({ path: path.join(output, ['reef', 'kelp', 'deep'][zone] + '.jpg'), type: 'jpeg', quality: 91 });
    }
    if (args.includes('--covers')) fs.copyFileSync(path.join(output, 'reef.jpg'), path.join(folder, 'cover.jpg'));
    for (const [width, height] of [[390, 844], [780, 600], [3440, 1440], [3840, 2160]]) {
      await page.setViewportSize({ width, height });
      const state = await page.evaluate(() => ({ ...getState(), scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(state.scroll <= state.client, `${width}: no document overflow`);
      assert.ok(state.width <= 1920 && state.height <= 1920, `${width}: canvas allocation must be bounded`);
      assert.ok(state.camera >= 0 && state.camera <= state.maxCamera, `${width}: camera remains in bounds`);
      for (const zone of [0, 1, 2]) {
        await page.evaluate(z => oceanDrift.goToZone(z, true), zone);
        assert.equal((await page.evaluate(() => getState())).zone, zone);
      }
      if (width === 390) {
        await page.evaluate(() => oceanDrift.goToZone(0, true));
        await page.screenshot({ path: path.join(output, 'mobile.jpg'), type: 'jpeg', quality: 88 });
      }
    }
    checks.push('all three habitats; portrait, compact, ultrawide, and 4K viewports; bounded canvas');
    await context.close();

    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const touchPage = await touch.newPage(); watch(touchPage); await touchPage.goto(url);
    assert.equal((await touchPage.evaluate(() => getState())).auto, false, 'reduced motion disables camera by default');
    await touchPage.tap('[data-zone="2"]');
    assert.equal((await touchPage.evaluate(() => getState())).zone, 2, 'reduced-motion zone navigation is immediate');
    await touchPage.tap('#tour'); assert.equal((await touchPage.evaluate(() => getState())).auto, true, 'explicit opt-in may enable touring');
    await touchPage.tap('#pause'); assert.equal((await touchPage.evaluate(() => getState())).paused, true);
    await touchPage.tap('#help'); assert.equal(await touchPage.locator('#help-panel').isVisible(), true);
    const metrics = await touchPage.locator('#help-panel').boundingBox(); assert.ok(metrics.x >= 0 && metrics.x + metrics.width <= 390, 'mobile help stays onscreen');
    await touch.close();
    checks.push('touch controls, high DPI, reduced motion, mobile help');

    // Deterministic host clock exercises an entire outward and return journey.
    // Real drawing still occurs; only RAF scheduling and visibility are controlled.
    // Keep the same 1600-unit field of view with fewer raster pixels; all normal
    // and high-resolution rendering checks above already use real desktop sizes.
    const controlled = await browser.newContext({ viewport: { width: 160, height: 100 } });
    await controlled.addInitScript(() => {
      let queue = [], stamp = 100, hidden = false;
      window.requestAnimationFrame = callback => { queue.push(callback); return queue.length; };
      Object.defineProperty(document, 'hidden', { get: () => hidden });
      window.__step = (count, interval = 80) => { for (let i = 0; i < count; i++) { stamp += interval; const callbacks = queue; queue = []; callbacks.forEach(cb => cb(stamp)); } };
      window.__visibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    });
    const clock = await controlled.newPage(); watch(clock); await clock.goto(url);
    const initial = await clock.evaluate(() => getState());
    await clock.evaluate(() => __step(170));
    assert.equal((await clock.evaluate(() => getState())).camera, initial.camera, 'camera holds for fourteen seconds');
    await clock.evaluate(() => __step(20));
    assert.equal((await clock.evaluate(() => getState())).dwelling, false, 'camera starts after its dwell');
    const journey = [];
    for (let batch = 0; batch < 42; batch++) {
      const sampled = await clock.evaluate(() => {
        const samples = []; for (let i = 0; i < 100; i++) { const before = getState(); __step(1); const state = getState(); samples.push({ camera: state.camera, delta: state.camera - before.camera, zone: state.zone, dwelling: state.dwelling, maxCamera: state.maxCamera }); } return samples;
      });
      journey.push(...sampled);
    }
    assert.ok(journey.every(s => s.camera >= 0 && s.camera <= s.maxCamera), 'complete tour stays in world bounds');
    assert.ok(journey.every(s => Math.abs(s.delta) < 7), 'camera never jumps or teleports');
    assert.ok(journey.some(s => s.zone === 2 && s.dwelling), 'tour stops in the deep');
    assert.ok(journey.some(s => s.delta < -.01), 'camera reverses smoothly');
    const visitedDeep = journey.findIndex(s => s.zone === 2);
    assert.ok(journey.slice(visitedDeep).some(s => s.zone === 0 && s.dwelling), 'tour returns to the coral garden');
    const beforeHidden = await clock.evaluate(() => { __visibility(true); return getState(); });
    await clock.evaluate(() => __step(20, 60000));
    assert.equal((await clock.evaluate(() => getState())).frames, beforeHidden.frames, 'hidden scene does not draw');
    assert.equal((await clock.evaluate(() => getState())).time, beforeHidden.time, 'hidden scene does not advance');
    await clock.evaluate(() => { __visibility(false); __step(1); });
    assert.equal((await clock.evaluate(() => getState())).time, beforeHidden.time, 'visibility resume does not jump');
    const hostFrozen = await clock.evaluate(() => getState());
    await clock.evaluate(() => __step(1, 60000));
    const hostResumed = await clock.evaluate(() => getState());
    assert.ok(hostResumed.time - hostFrozen.time <= .081, 'host RAF suspension cannot fast-forward the scene');
    checks.push('full timed tour, habitat dwell, smooth reversal, background suspension, resume without jump');
    await controlled.close();
    assert.deepEqual(errors, [], 'no browser errors'); assert.deepEqual(external, [], 'no network dependencies');
    checks.push('local asset loading, zero external requests, zero browser errors');
    const report = { passed: true, checks, errors, external, output };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

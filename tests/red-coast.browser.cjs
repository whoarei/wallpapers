'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(process.env.WALLPAPER_ROOT || path.join(__dirname, '../wallpapers'));
const output = process.env.QA_OUTPUT_DIR || '/tmp/red-coast-scene-qa';
const state = page => page.evaluate(() => redCoast.getState());
const advance = (page, ms) => page.evaluate(ms => __advance(ms), ms);
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, offline: true });
    const errors = [], external = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://red-coast.test') { external.push(url.href); return route.abort(); }
      const file = path.join(root, 'red-coast', url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
    });
    await context.addInitScript(() => {
      let stamp = 1000, sequence = 0;
      const pending = new Map();
      performance.now = () => stamp;
      window.requestAnimationFrame = callback => { pending.set(++sequence, callback); return sequence; };
      window.cancelAnimationFrame = id => pending.delete(id);
      window.__advance = ms => {
        const steps = Math.ceil(ms / 100);
        for (let i = 0; i < steps; i++) {
          stamp += ms / steps;
          const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(cb => cb(stamp));
        }
      };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://red-coast.test/');
    await page.waitForFunction(() => redCoast.getState().ready, null, { polling: 100 });
    await advance(page, 500);
    const initial = await state(page);
    assert.equal(initial.artwork, 'reference-realistic');
    assert.ok(initial.imageWidth > 1000 && initial.imageHeight > 700, 'full-resolution local artwork is decoded');
    await advance(page, 1000);
    assert.notEqual((await state(page)).cameraOffsetX, initial.cameraOffsetX, 'subtle camera drift runs when enabled');
    await page.locator('#scan').click();
    const stoppedScan = await state(page);
    await advance(page, 1000);
    assert.equal((await state(page)).cameraOffsetX, stoppedScan.cameraOffsetX, 'camera control stops automatic drift');
    assert.ok((await state(page)).time > stoppedScan.time, 'cloud and sky simulation continue');
    const pixel = () => page.evaluate(() => {
      const c = document.querySelector('canvas').getContext('2d'), pixels = c.getImageData(350, 140, 200, 180).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
      return sum / (pixels.length / 4);
    });
    const dusk = await pixel();
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'dusk.png') });
    const coverStyle = await page.addStyleTag({ content: '.identity,.location,.hud{visibility:hidden}' });
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'cover.jpg'), type: 'jpeg', quality: 92 });
    await coverStyle.evaluate(el => el.remove());
    await page.locator('#phase').click(); await page.locator('#phase').click();
    assert.equal((await state(page)).phaseIndex, 1);
    await advance(page, 11000);
    assert.ok(dusk - await pixel() > 35, 'night mode visibly darkens the sky');
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'night.png') });
    const traceEnergy = () => page.evaluate(() => {
      const screen = redCoast.getState().receiver.screen;
      const canvas = document.querySelector('canvas'), c = canvas.getContext('2d'), ratio = canvas.width / innerWidth;
      const left = Math.round(screen.x * ratio), top = Math.round(screen.y * ratio);
      const width = Math.round(screen.width * ratio), height = Math.round(screen.height * ratio);
      const pixels = c.getImageData(left, top, width, height).data;
      let lit = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const k = (y * width + x) * 4;
        if (Math.abs(top + y - screen.baseline * ratio) > 4 * screen.scale * ratio && pixels[k + 1] > 105 && pixels[k + 1] > pixels[k] * 1.4) lit++;
      }
      return lit;
    });
    const idleTrace = await traceEnergy();
    await page.locator('#coast').click({ position: { x: 120, y: 230 } });
    assert.equal((await state(page)).signals, 0, 'empty sky is not an antenna hit');
    await page.locator('#coast').click({ position: { x: 1088, y: 396 } });
    assert.equal((await state(page)).signals, 1, 'antenna hit starts exactly one signal');
    await advance(page, 500);
    assert.ok(await traceEnergy() > idleTrace + 5, 'transmission visibly increases the phosphor oscilloscope waveform');
    assert.equal(await page.locator('#signal').isDisabled(), true);
    await page.evaluate(() => document.getElementById('signal').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal((await state(page)).signals, 1, 'cooldown also guards synthetic button events');
    await page.locator('#phase').click();
    assert.equal((await state(page)).signals, 1, 'controls do not propagate into the scene');
    await page.locator('#pause').click();
    const paused = await state(page); await advance(page, 60000);
    assert.equal((await state(page)).frames, paused.frames); assert.equal((await state(page)).time, paused.time);
    await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('Space');
    await advance(page, 100);
    assert.equal((await state(page)).paused, false);
    assert.ok((await state(page)).time - paused.time < .2, 'resume does not advance by the pause duration');
    await page.evaluate(() => {
      window.__hidden = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => __hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hidden = await state(page); await advance(page, 30000);
    assert.equal((await state(page)).frames, hidden.frames, 'background pages stop drawing');
    await page.evaluate(() => { __hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await advance(page, 11000);
    assert.equal(await page.locator('#signal').isDisabled(), false, 'cooldown expires after active simulation time');
    await page.evaluate(() => {
      window.__hostState = { paused: false, pauseReason: 'none' };
      window.wallpaperHost = { protocolVersion: 1, mode: 'desktop', instanceId: 'red-coast-test',
        capabilities: { pointer: 'relayed', pointerMove: false, keyboard: false, fullscreen: false, pause: true, actions: true },
        getState: () => __hostState };
      WallpaperRuntime.refresh(); dispatchEvent(new Event('wallpaperhost:statechange'));
    });
    const request = { protocolVersion: 1, instanceId: 'red-coast-test', requestId: 'first-signal', actionId: 'signal' };
    const invoke = req => page.evaluate(req => wallpaperApp.invoke(req), req);
    const first = await invoke(request); assert.equal(first.ok, true); assert.equal(first.data.sent, true);
    assert.equal((await invoke({ ...request, requestId: 'cooldown' })).code, 'DISABLED');
    assert.deepEqual(await invoke(request), first);
    assert.equal((await state(page)).signals, 2, 'duplicate host invocation cannot send another signal');
    await page.evaluate(() => { __hostState = { paused: true, pauseReason: 'system' }; dispatchEvent(new Event('wallpaperhost:statechange')); });
    assert.equal((await invoke({ ...request, requestId: 'paused' })).code, 'PAUSED');
    for (const viewport of [{ width: 390, height: 844 }, { width: 2560, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await page.screenshot({ animations: 'disabled', path: path.join(output, viewport.width === 390 ? 'portrait.png' : 'ultrawide.png') });
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log('Red Coast passed: offline rendering, camera drift, sky transitions, instrument response, scene hit area, signal cooldown, control isolation, keyboard/background/host pause, and idempotent host actions.');
    await context.close();
  } finally { await browser.close(); }
})();

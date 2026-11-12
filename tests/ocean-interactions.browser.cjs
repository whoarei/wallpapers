'use strict';
// Real Canvas + pointer/touch/desktop-forwarding regression checks.
// node tests/ocean-interactions.browser.cjs --browser /usr/bin/chromium
// Optional: --base-url <URL>, --host-wrapper <wallpaper-mode.js>, --output-dir <dir>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '../wallpapers/ocean-drift');
const output = option('--output-dir') || '/tmp/ocean-interactions-qa';
const hash = data => createHash('sha256').update(data).digest('hex');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.join(root, path.basename(new URL(req.url, 'http://localhost').pathname) || 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = option('--base-url') || `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true, executablePath: option('--browser'), args: ['--no-sandbox'] });
  const errors = [], external = [], checks = [];
  function watch(page) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin) external.push(request.url()); });
  }
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
    await context.addInitScript(() => {
      let queue = [], stamp = 100, hidden = false;
      window.requestAnimationFrame = callback => { queue.push(callback); return queue.length; };
      Object.defineProperty(document, 'hidden', { get: () => hidden });
      window.__step = count => { for (let i = 0; i < count; i++) { stamp += 1000 / 30 + .01; const pending = queue; queue = []; pending.forEach(cb => cb(stamp)); } return getState(); };
      window.__visibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    });
    const page = await context.newPage(); watch(page); await page.goto(url);
    await page.evaluate(() => { oceanDrift.setAuto(false); __step(2); });
    const step = n => page.evaluate(n => __step(n), n);
    const state = () => page.evaluate(() => getState());
    await page.mouse.click(480, 120);
    let s = await state();
    assert.equal(s.interactions, 1, 'Native down/up/click creates exactly one bloom');
    assert.ok(s.bubbles > 0 && s.sparks > 30);
    const tapPower = s.blooms[0].power;
    const sample = await step(60);
    const near = sample.fishStates.filter(f => Math.hypot(f.x - s.blooms[0].x, f.y - s.blooms[0].y) < 400);
    const far = sample.fishStates.filter(f => f.x > 2600);
    assert.ok(Math.max(...near.map(f => f.drift)) > 5, 'Nearby fish physically respond');
    assert.ok(far.every(f => f.drift < .1), 'Fish beyond the local current stay on course');
    await page.mouse.move(480, 120); await page.mouse.down(); await step(52);
    assert.ok((await state()).charge > .95, 'Holding accumulates a pearl');
    await page.screenshot({ path: path.join(output, 'charge.png') });
    await page.mouse.up();
    s = await state(); assert.equal(s.interactions, 2, 'Releasing a charged pearl emits once');
    assert.ok(s.blooms.at(-1).power > tapPower * 2, 'Holding makes a fuller response');
    await step(36); await page.screenshot({ path: path.join(output, 'star-sea.png') });
    checks.push('single tap, charged release, local fish motion, distant fish undisturbed');

    const beforeDrag = await state();
    await page.mouse.move(500, 250); await page.mouse.down(); await page.mouse.move(250, 280, { steps: 8 }); await page.mouse.up();
    s = await state(); assert.equal(s.interactions, beforeDrag.interactions, 'Drag does not emit a bloom');
    assert.ok(s.camera > beforeDrag.camera + 300);
    await page.mouse.move(400, 300); await page.mouse.down(); await step(20);
    await page.dispatchEvent('canvas', 'pointercancel', { pointerId: 1 });
    assert.equal((await state()).charge, 0); await page.mouse.up();
    assert.equal((await state()).interactions, s.interactions, 'Cancelled hold emits nothing');
    await step(600);
    s = await state();
    assert.equal(s.blooms.length + s.sparks + s.bubbles, 0, 'All transient effects expire');
    assert.ok(s.fishStates.every(f => f.drift < .15), 'Fish return to their routes');
    checks.push('drag/hold disambiguation, cancellation, complete cleanup and recovery');

    await page.evaluate(() => oceanDrift.goToZone(1, true));
    await page.keyboard.press('KeyE');
    let peakBend = 0;
    for (let i = 0; i < 60; i++) peakBend = Math.max(peakBend, (await step(1)).kelpBend);
    assert.ok(peakBend > 2, 'The expanding current actually bends the kelp');
    await page.evaluate(() => oceanDrift.goToZone(2, true));
    s = await state();
    const jelly = s.jellyStates.find(j => j.x > s.camera + 80 && j.x < s.camera + s.viewWidth - 80);
    await page.mouse.click((jelly.x - s.camera) / s.viewWidth * 960, jelly.y * .6);
    s = await state(); assert.ok(s.jellyStates.filter(j => j.pending > 0).length >= 2, 'A touched jelly schedules neighboring responses');
    const litCounts = [];
    for (let i = 0; i < 12; i++) { s = await step(9); litCounts.push(s.jellyStates.filter(j => j.light > .08).length); }
    assert.ok(Math.max(...litCounts) >= 3 && new Set(litCounts).size > 1, 'Jellies brighten in a traveling sequence');
    await page.screenshot({ path: path.join(output, 'jelly-echo.png') });
    checks.push('kelp responds to local current, jellyfish light propagates in sequence');

    await page.evaluate(() => oceanDrift.setPaused(true));
    // Hash the actual canvas bitmap: an element screenshot also captures HUD
    // overlays, which correctly wake up when the pointer or keyboard is used.
    const frozen = await state(), before = hash(await page.evaluate(() => document.querySelector('canvas').toDataURL()));
    await step(80); await page.mouse.click(480, 300); await page.keyboard.press('KeyE');
    assert.equal((await state()).interactions, frozen.interactions, 'Paused inputs cannot add effects');
    assert.equal(hash(await page.evaluate(() => document.querySelector('canvas').toDataURL())), before, 'Pause freezes the rendered interaction');
    await page.evaluate(() => { oceanDrift.setPaused(false); __visibility(true); });
    const hidden = await state(); await step(40);
    assert.equal((await state()).time, hidden.time);
    await page.evaluate(() => { __visibility(false); __step(1); });
    assert.equal((await state()).time, hidden.time, 'Background resume cannot advance effects');
    await step(600);
    for (let i = 0; i < 60; i++) { await page.mouse.click(480, 300); await step(4); }
    s = await state(); assert.ok(s.blooms.length <= 6 && s.sparks <= 480 && s.bubbles <= 120, 'Rapid clicking has bounded memory and particles');
    assert.ok(s.fishStates.every(f => Number.isFinite(f.x + f.y + f.vx + f.vy) && f.drift < 540));
    checks.push('pause and background freeze actual effects, rapid-click limits and stable fish motion');

    // A separate real scene keeps animal hit tests independent of earlier blooms.
    const animals = await context.newPage(); watch(animals); await animals.goto(url);
    // This context intentionally retains user preferences from the earlier page;
    // choose the reef explicitly for the independent animal hit-test fixtures.
    await animals.evaluate(() => { oceanDrift.goToZone(0, true); __step(2); });
    const animalState = () => animals.evaluate(() => getState());
    const animalStep = n => animals.evaluate(n => __step(n), n);
    async function frameAnimal(p) {
      const s = await animalState(), target = Math.max(0, Math.min(s.maxCamera, p.x - s.viewWidth / 2));
      await animals.mouse.move(480, 120); await animals.mouse.down();
      await animals.mouse.move(480 + (s.camera - target) * 960 / s.viewWidth, 120, { steps: 4 }); await animals.mouse.up();
    }
    let a = await animalState();
    const fishIndex = a.fishStates.findIndex((f, i, all) => f.x > a.camera + 100 && f.x < 1000 && all.every((other, n) => n === i || Math.hypot(other.x - f.x, other.y - f.y) > 45));
    assert.ok(fishIndex >= 0, 'An isolated visible fish is available');
    const touchedFish = a.fishStates[fishIndex], touchX = touchedFish.x - 10, touchY = touchedFish.y;
    await animals.mouse.click((touchX - a.camera) / a.viewWidth * 960, touchY * .6);
    a = await animalStep(12);
    assert.equal(a.animalTouches, 1, 'A fish body hit triggers animal avoidance');
    assert.equal(a.blooms.length, 0, 'Touching a fish does not create a lure');
    assert.ok(a.fishStates[fishIndex].x > touchedFish.x + 35 && a.fishStates[fishIndex].scared > 0, 'Fish darts away from the touched flank');
    assert.ok(a.fishStates.some((f, i) => i !== fishIndex && f.scared > 0), 'Nearby fish scatter too');
    assert.ok(a.fishStates.filter(f => f.x > 2600).every(f => f.scared === 0), 'Distant schools are not startled');
    await animals.keyboard.press('KeyE');
    a = await animalStep(60);
    assert.ok(a.fishStates[fishIndex].avoidingLight, 'Escape takes priority over newly created light');
    await animalStep(420);
    assert.ok((await animalState()).fishStates.every(f => f.scared === 0 && f.drift < .2), 'Fish settle back onto their routes');
    checks.push('fish body hit, directional escape, nearby scattering, distant fish undisturbed, escape overrides light, full recovery');

    for (const kind of ['turtle', 'ray', 'jelly']) {
      a = await animalState();
      const index = kind === 'jelly' ? 5 : null;
      const before = kind === 'jelly' ? a.jellyStates[index] : a[kind];
      await frameAnimal(before); a = await animalState();
      const x = before.x - (kind === 'jelly' ? 12 * before.size : 18), y = before.y - (kind === 'jelly' ? 10 * before.size : 0);
      const count = a.animalTouches;
      await animals.mouse.click((x - a.camera) / a.viewWidth * 960, y * .6);
      a = await animalStep(15);
      const after = kind === 'jelly' ? a.jellyStates[index] : a[kind];
      assert.equal(a.animalTouches, count + 1, `${kind}: hit after panning is delivered once`);
      assert.ok(after.scared > 0 && Math.hypot(after.x - x, after.y - y) > Math.hypot(before.x - x, before.y - y) + 20, `${kind}: actually moves away from the touch`);
      if (kind === 'jelly') assert.ok(a.jellyStates.some(j => j.pending > 0 || j.light > .05), 'Escaping jelly retains its light response');
      if (kind === 'turtle') {
        await animals.evaluate(() => oceanDrift.setPaused(true));
        const frozenAnimal = await animalState(); await animalStep(30);
        assert.deepEqual((await animalState()).turtle, frozenAnimal.turtle, 'Pause also freezes escape motion');
        await animals.evaluate(() => oceanDrift.setPaused(false));
      }
      await animalStep(420);
      a = await animalState();
      const recovered = kind === 'jelly' ? a.jellyStates[index] : a[kind];
      assert.ok(recovered.scared === 0 && recovered.drift < .2, `${kind}: returns smoothly to its route`);
    }
    checks.push('turtle, ray and jelly hit tests after camera movement, directional escape, paused escape, jellyfish light and gradual recovery');
    // Rapid re-touching uses current animal positions and cannot push them out of the world.
    await animals.evaluate(() => oceanDrift.goToZone(0, true));
    for (let i = 0; i < 25; i++) {
      a = await animalState();
      const f = a.fishStates.find(f => f.x > a.camera + 40 && f.x < a.camera + a.viewWidth - 40 && f.y > 180 && f.y < 790);
      assert.ok(f); await animals.mouse.click((f.x - a.camera) / a.viewWidth * 960, f.y * .6); await animalStep(5);
    }
    a = await animalState();
    // Adding a home coordinate back to a clamped offset can differ by a few ulps.
    assert.ok(a.fishStates.every(f => Number.isFinite(f.x + f.y + f.vx + f.vy) && f.x >= 50 - 1e-8 && f.x <= a.worldWidth - 50 + 1e-8 && f.y >= 100 - 1e-8 && f.y <= 840 + 1e-8), 'Repeated touches stay finite and within habitat bounds');
    const countBeforeDrag = a.animalTouches;
    await animals.mouse.move(480, 300); await animals.mouse.down(); await animals.mouse.move(300, 300, { steps: 4 }); await animals.mouse.up();
    assert.equal((await animalState()).animalTouches, countBeforeDrag, 'Dragging across animals never triggers escape');
    // Keep the same world field of view while running two minutes of real
    // ecology at a smaller raster size. Inspect every frame through school turns.
    await animals.setViewportSize({ width: 160, height: 100 });
    const longRun = await animals.evaluate(() => {
      let minimumFacing = 1, reversals = 0, invalid = false;
      let previous = getState().fishStates.map(f => Math.sign(f.facing));
      for (let frame = 0; frame < 3600; frame++) {
        const state = __step(1);
        state.fishStates.forEach((f, i) => {
          minimumFacing = Math.min(minimumFacing, Math.abs(f.facing));
          const facing = Math.sign(f.facing); if (facing !== previous[i]) reversals++;
          previous[i] = facing;
          if (!Number.isFinite(f.x + f.y + f.vx + f.vy + f.facing) || f.x < 50 - 1e-8 || f.x > state.worldWidth - 50 + 1e-8 || f.y < 100 - 1e-8 || f.y > 840 + 1e-8) invalid = true;
        });
      }
      return { minimumFacing, reversals, invalid };
    });
    assert.ok(longRun.minimumFacing >= .58 - 1e-8, 'Turning fish retain a nonzero three-quarter body profile');
    assert.ok(longRun.reversals > 0, 'Long-run coverage includes actual school direction changes');
    assert.equal(longRun.invalid, false, 'Two-minute schooling and repeated turns stay finite within habitat bounds');
    checks.push('two minutes of school turns, non-collapsing body profiles, finite and bounded ecology');
    await animals.close();
    await context.close();

    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const mobile = await touch.newPage(); watch(mobile); await mobile.goto(url);
    await mobile.touchscreen.tap(190, 180); await mobile.waitForTimeout(400);
    s = await mobile.evaluate(() => getState()); assert.equal(s.interactions, 1); assert.equal(s.auto, false);
    assert.ok(s.fishStates.every(f => f.drift === 0), 'Reduced motion retains light without displacing fish');
    const bloomButton = mobile.getByRole('button', { name: '唤起星海' });
    await bloomButton.tap(); await mobile.waitForTimeout(150); assert.equal((await mobile.evaluate(() => getState())).interactions, 2);
    const box = await bloomButton.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390);
    await mobile.screenshot({ path: path.join(output, 'mobile.png') });
    await touch.close(); checks.push('touch input, compact controls, reduced-motion light without fish displacement');

    if (option('--host-wrapper')) {
      const desktop = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      await desktop.addInitScript({ content: fs.readFileSync(option('--host-wrapper'), 'utf8') });
      const host = await desktop.newPage(); watch(host); await host.goto(url);
      const result = await host.evaluate(() => __SCREEN_GARDEN_DESKTOP_CLICK(.5, .5));
      assert.equal(result.delivered, true, 'Real host forwards a synthetic pointer/click sequence');
      assert.equal((await host.evaluate(() => getState())).interactions, 1, 'Desktop forwarding emits exactly once');
      await host.waitForTimeout(700);
      await host.evaluate(() => __SCREEN_GARDEN_SET_PAUSED(true));
      const stopped = await host.evaluate(() => getState()); await host.waitForTimeout(200);
      assert.equal((await host.evaluate(() => getState())).frames, stopped.frames);
      await host.evaluate(() => __SCREEN_GARDEN_SET_PAUSED(false));
      await host.waitForTimeout(100);
      assert.ok((await host.evaluate(() => getState())).time - stopped.time < .2);
      const beforeTouch = await host.evaluate(() => getState());
      const desktopFish = beforeTouch.fishStates.find(f => f.x > beforeTouch.camera + 60 && f.x < beforeTouch.camera + beforeTouch.viewWidth - 60 && f.y > 200 && f.y < 800);
      const delivered = await host.evaluate(({ x, y }) => __SCREEN_GARDEN_DESKTOP_CLICK(x, y), { x: (desktopFish.x - beforeTouch.camera) / beforeTouch.viewWidth, y: desktopFish.y / 1000 });
      assert.equal(delivered.delivered, true);
      assert.equal((await host.evaluate(() => getState())).animalTouches, beforeTouch.animalTouches + 1, 'Actual desktop forwarding also reaches animal hit tests');
      await desktop.close(); checks.push('actual desktop host click forwarding, pause and resume');
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, checks, errors, external }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checks, output }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

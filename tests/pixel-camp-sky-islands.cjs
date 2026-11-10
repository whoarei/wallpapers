'use strict';
// Browser checks for these two standalone modules; no npm dependencies required
// in the repository. Pass --playwright <module path> and --browser <executable>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const { createHash } = require('node:crypto');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const modulePath = option('--playwright') || process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(modulePath);
const output = path.resolve(option('--output-dir') || path.join(os.tmpdir(), 'wallpaper-scenes-qa'));
fs.mkdirSync(output, { recursive: true });
const root = path.resolve(__dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: option('--browser') || process.env.EDGE_PATH });
  const reports = [];
  try {
    for (const id of ['pixel-camp', 'sky-islands']) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      // Model the host's RAF suspension: callbacks stop while hidden/paused and
      // resume with the browser's current timestamp, without reloading the page.
      await context.addInitScript(() => {
        const nativeRaf = window.requestAnimationFrame.bind(window);
        let hostPaused = false;
        const pending = [];
        window.requestAnimationFrame = callback => nativeRaf(stamp => {
          if (hostPaused) pending.push(callback); else callback(stamp);
        });
        window.__testHostPause = value => {
          hostPaused = value;
          if (!value) pending.splice(0).forEach(callback => window.requestAnimationFrame(callback));
        };
      });
      const page = await context.newPage();
      const errors = [], external = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => { if (/^https?:/i.test(request.url())) external.push(request.url()); });
      await page.goto(pathToFileURL(path.join(root, 'wallpapers', id, 'index.html')).href);
      await page.addStyleTag({ content: '.hud{display:none!important}' });
      await page.waitForTimeout(400);
      const start = await page.evaluate(() => getState());
      await page.waitForTimeout(1100);
      const running = await page.evaluate(() => getState());
      assert.ok(running.time > start.time + .5, `${id}: animation did not advance`);
      assert.ok(running.frames - start.frames <= 35, `${id}: exceeds 30 FPS cap`);
      await page.keyboard.press('Space');
      const freezeStart = await page.evaluate(() => getState());
      const before = hash(await page.screenshot());
      await page.waitForTimeout(500);
      const after = hash(await page.screenshot());
      assert.equal(before, after, `${id}: local pause changed the image`);
      assert.equal((await page.evaluate(() => getState())).time, freezeStart.time);
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      await page.evaluate(() => __testHostPause(true));
      await page.waitForTimeout(100);
      const hostFrozen = await page.evaluate(() => getState());
      await page.waitForTimeout(500);
      assert.equal((await page.evaluate(() => getState())).time, hostFrozen.time, `${id}: ignores host RAF pause`);
      await page.evaluate(() => __testHostPause(false));
      await page.waitForTimeout(150);
      const resumed = await page.evaluate(() => getState());
      assert.ok(resumed.time > hostFrozen.time && resumed.time - hostFrozen.time < .25, `${id}: resume jumped`);
      const modeBefore = await page.evaluate(() => getState());
      await page.keyboard.press(id === 'pixel-camp' ? 'KeyD' : 'KeyL');
      const modeAfter = await page.evaluate(() => getState());
      if (id === 'pixel-camp') assert.ok(Math.abs(modeAfter.phase - modeBefore.phase) > .2);
      else assert.notEqual(modeAfter.golden, modeBefore.golden);
      await page.screenshot({ path: path.join(output, `${id}-alternate.png`) });
      for (const [w, h] of [[390, 844], [780, 600], [3840, 2160]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(200);
        const size = await page.evaluate(() => ({ state: getState(), scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        assert.ok(size.scroll <= size.client, `${id}: horizontal overflow at ${w}`);
        assert.ok(size.state.width <= (id === 'pixel-camp' ? 640 : 1920), `${id}: backing canvas too large`);
        if (w === 390) await page.screenshot({ path: path.join(output, `${id}-mobile.png`) });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.reload();
      await page.addStyleTag({ content: '.hud{display:none!important}' });
      await page.waitForTimeout(800);
      await page.keyboard.press('Space');
      const screenshot = path.join(output, `${id}-desktop.jpg`);
      await page.screenshot({ path: screenshot, type: 'jpeg', quality: 91 });
      if (args.includes('--covers')) fs.copyFileSync(screenshot, path.join(root, 'wallpapers', id, 'cover.jpg'));
      assert.deepEqual(errors, [], `${id}: browser errors`);
      assert.deepEqual(external, [], `${id}: external requests`);
      reports.push({ id, passed: true, framesPerSecondCap: 30, localPause: true, hostRafPause: true, resumeWithoutJump: true, alternateMode: true, viewports: ['1600x900','390x844','780x600','3840x2160'], errors, external, screenshot });
      await context.close();
    }
  } finally { await browser.close(); }
  const report = { passed: true, modules: reports };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

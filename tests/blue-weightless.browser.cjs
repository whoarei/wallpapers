/* Offline Chromium QA. Uses a virtual origin, never a network server.
 * node tests/blue-weightless.browser.cjs [--browser /path/to/chromium] [--covers]
 * Optional WALLPAPER_ROOT points to the extracted release ZIP for package QA.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const args = process.argv.slice(2), option = n => args.includes(n) ? args[args.indexOf(n) + 1] : undefined;
const folder = path.resolve(process.env.WALLPAPER_ROOT || path.join(__dirname, '../wallpapers/blue-weightless'));
const Motion = require(path.join(folder, 'motion.js'));
const output = path.resolve(option('--output-dir') || path.join(os.tmpdir(), 'blue-weightless-qa'));
const origin = 'https://blue-weightless.test/';
const errors = [], external = [], checks = [];
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const state = p => p.evaluate(() => blueWeightless.getState());
async function route(context, missingAtlas = false, missingCycle = '') {
  await context.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.origin !== new URL(origin).origin) { external.push(u.href); return r.abort(); }
    const name = decodeURIComponent(u.pathname.slice(1)) || 'index.html';
    if (name === 'favicon.ico') return r.fulfill({ status: 204 });
    if (name.includes('..') || missingAtlas && name.endsWith('heroine-poses.png') || missingCycle && name.endsWith(missingCycle)) return r.fulfill({ status: 404, body: '' });
    const file = path.join(folder, name);
    if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
    const contentType = ({ html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg' })[path.extname(name).slice(1)] || 'application/octet-stream';
    return r.fulfill({ body: fs.readFileSync(file), contentType });
  });
}
function watch(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: option('--browser'), args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN', offline: true });
    await route(context);
    const page = await context.newPage(); watch(page);
    await page.goto(origin); await page.waitForFunction(() => blueWeightless.getState().ready); await page.waitForTimeout(1200);
    let s = await state(page); assert.equal(s.characterCount, 1); assert.equal(s.targetFps, 30); assert.equal(s.fishCount, 84); assert.ok(s.plantCount > 30);
    assert.equal(s.character.mode, 'continuous-mesh'); assert.equal(s.character.error, null);
    const start = s; await page.waitForTimeout(650); s = await state(page);
    assert.ok(s.time > start.time + .4); assert.ok(s.frames - start.frames < 27);
    checks.push('all local assets load with offline networking, exactly one swimmer, bounded 30 FPS playback');

    await page.click('#pause'); const frozen = await state(page); const image = hash(await page.locator('canvas').screenshot()); await page.waitForTimeout(220);
    assert.equal((await state(page)).time, frozen.time); assert.equal(hash(await page.locator('canvas').screenshot()), image);
    for (const [t, title, file] of [[2, '纵身入蓝', 'stand'], [5.6, '纵身入蓝', 'dive'], [10, '水下滑翔', 'glide'], [24, '自由泳', 'freestyle'], [42, '蛙泳', 'breaststroke'], [59, '仰泳', 'backstroke'], [76, '蝶泳', 'butterfly'], [94, '从容归岸', 'climb'], [96, '从容归岸', 'climb-out'], [102, '从容归岸', 'shore']]) {
      await page.evaluate(t => blueWeightless.seek(t), t);
      assert.equal(await page.locator('#chapter-name').textContent(), title);
      const character = (await state(page)).character;
      assert.ok(character.minAreaRatio >= .3499); assert.ok(character.gain > 0); assert.equal(character.error, null);
      if (Motion.definitions[character.pose]) {
        assert.equal(character.mode, 'pose-cycle'); assert.equal(character.sequenceLength, 16);
        assert.equal(character.availableCycles.length, 4); assert.equal(character.cycleWarning, null);
      }
      await page.screenshot({ path: path.join(output, `${file}.jpg`), type: 'jpeg', quality: 93 });
    }
    // Check the actual rendered result throughout every stroke, not just a chapter still.
    for (const [name, d] of Object.entries(Motion.definitions)) {
      const hashes = new Set(), review = [], weights = d.holds || Array(16).fill(1), total = weights.reduce((a, b) => a + b, 0);
      let cursor = 0;
      for (let i = 0; i < 16; i++) {
        const phase = (cursor + weights[i] * .5) / total; cursor += weights[i];
        await page.evaluate(t => blueWeightless.seek(t), d.start + phase * d.period);
        const s = await state(page); assert.equal(s.character.sequenceFrame, i);
        assert.equal(s.character.sequenceSource, d.order ? d.order[i] : i);
        const shot = await page.screenshot({ clip: { x: Math.round(s.x - s.camera) - 320, y: 320, width: 640, height: 400 } });
        hashes.add(hash(shot));
        if (args.includes('--motion-review')) {
          fs.writeFileSync(path.join(output, `${name}-${String(i + 1).padStart(2, '0')}.png`), shot);
          review.push(`data:image/png;base64,${shot.toString('base64')}`);
        }
      }
      assert.equal(hashes.size, 16, `${name} renders sixteen distinct poses`);
      if (review.length) {
        const board = await context.newPage(); await board.setViewportSize({ width: 2560, height: 1760 });
        await board.setContent(`<body style="margin:0;background:#102c3a;color:#dceee5;font:24px system-ui"><h1 style="margin:20px">${name} · 16 complete poses</h1><div style="display:grid;grid-template-columns:repeat(4,640px)">${review.map((url, i) => `<figure style="margin:0;position:relative"><img style="display:block;width:640px;height:400px" src="${url}"><b style="position:absolute;left:12px;top:12px;background:#10333bad;padding:4px 10px">${i + 1}</b></figure>`).join('')}</div></body>`);
        await board.screenshot({ path: path.join(output, `${name}-contact-sheet.png`), fullPage: true }); await board.close();
      }
    }
    checks.push('all 64 authored poses render through the real pool compositor with deterministic phase and no double-body fades');
    await page.evaluate(() => blueWeightless.seek(10));
    const reaction = (await state(page)).fishReaction;
    await page.click('#pause'); await page.waitForTimeout(350); await page.click('#pause');
    assert.ok((await state(page)).fishReaction > reaction, 'fish react to the submerged swimmer');
    await page.click('#garden'); assert.equal((await state(page)).fishCount, 0); await page.click('#garden'); assert.equal((await state(page)).fishCount, 84);
    checks.push('pause freezes pixels, complete pose cycles and detail-preserving idle mesh, fish avoid swimmer, garden toggle');

    await page.evaluate(() => blueWeightless.seek(30));
    const cam = (await state(page)).camera;
    await page.mouse.move(900, 630); await page.mouse.down(); await page.mouse.move(590, 630, { steps: 10 }); await page.mouse.up();
    s = await state(page); assert.equal(s.following, false); assert.ok(s.camera > cam + 200); assert.equal(s.rippleCount, 0, 'drag does not also create a click ripple');
    await page.mouse.click(800, 700); assert.equal((await state(page)).rippleCount, 1);
    await page.keyboard.press('ArrowLeft'); assert.ok((await state(page)).camera < s.camera);
    await page.click('#follow'); assert.equal((await state(page)).following, true);
    await page.keyboard.press('Digit5'); assert.equal((await state(page)).stage, 4);
    await page.locator('#scrubber').evaluate(el => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); }); assert.equal((await state(page)).time, 40);
    await page.click('#speed'); assert.equal((await state(page)).speed, 1.5); await page.click('#speed'); assert.equal((await state(page)).speed, .5); await page.click('#speed');
    await page.click('#help'); assert.equal(await page.locator('#help-panel').isVisible(), true); await page.keyboard.press('Escape'); assert.equal(await page.locator('#help-panel').isVisible(), false);
    await page.keyboard.press('KeyS'); assert.equal(await page.locator('body').evaluate(b => b.classList.contains('clean')), true); await page.keyboard.press('Escape');
    checks.push('drag, click ripple, arrows, follow, stage keys, timeline scrubbing, all speeds, help and clean wallpaper mode');

    await page.evaluate(() => { blueWeightless.seek(10); document.body.classList.add('clean'); });
    await page.screenshot({ path: path.join(output, 'cover.jpg'), type: 'jpeg', quality: 94 });
    if (args.includes('--covers')) fs.copyFileSync(path.join(output, 'cover.jpg'), path.join(folder, 'cover.jpg'));
    for (const viewport of [{ width: 390, height: 844 }, { width: 780, height: 600 }, { width: 3440, height: 1440 }, { width: 3840, height: 2160 }]) {
      await page.setViewportSize(viewport);
      s = await state(page); const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(layout.scroll <= layout.client); assert.ok(s.width <= 2560 && s.height <= 2560); assert.ok(Number.isFinite(s.camera));
      assert.ok(s.camera >= 0 && s.camera <= 9000 - s.viewWidth + 1);
      if (viewport.width === 390) { await page.keyboard.press('KeyS'); await page.screenshot({ path: path.join(output, 'mobile.jpg'), type: 'jpeg', quality: 92 }); await page.keyboard.press('KeyS'); }
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.evaluate(() => { blueWeightless.seek(107.9); blueWeightless.setPaused(false); }); await page.waitForTimeout(400);
    s = await state(page); assert.equal(s.beginning, true); assert.ok(s.camera < 5, 'the reset camera is under the full-screen fade');
    await page.evaluate(() => { blueWeightless.seek(111.8); blueWeightless.setPaused(false); }); await page.waitForTimeout(450);
    s = await state(page); assert.ok(s.time < 1); assert.equal(s.stage, 0);
    await context.close(); checks.push('portrait, compact, ultrawide and 4K sizing; fully masked loop and smooth restart');

    if (option('--host-wrapper')) {
      const host = await browser.newContext({ viewport: { width: 1600, height: 1000 }, offline: true }); await route(host);
      await host.addInitScript({ path: path.resolve(option('--host-wrapper')) });
      const desktop = await host.newPage(); watch(desktop); await desktop.goto(origin); await desktop.waitForFunction(() => blueWeightless.getState().ready);
      await desktop.evaluate(() => blueWeightless.seek(10));
      assert.equal(await desktop.locator('.console').isVisible(), false);
      const before = (await state(desktop)).rippleCount;
      const reply = await desktop.evaluate(() => __SCREEN_GARDEN_DESKTOP_CLICK(.5, .72)); assert.equal(reply.delivered, true); assert.equal((await state(desktop)).rippleCount, before + 1);
      await desktop.evaluate(() => __SCREEN_GARDEN_SET_PAUSED(true));
      const held = await state(desktop); await desktop.waitForTimeout(280); const after = await state(desktop);
      assert.equal(after.time, held.time); assert.equal(after.frames, held.frames); assert.equal(after.camera, held.camera);
      await desktop.evaluate(() => __SCREEN_GARDEN_SET_PAUSED(false)); await desktop.waitForTimeout(200); assert.ok((await state(desktop)).time > held.time);
      await host.close(); checks.push('actual Wallpaper Box wrapper hides HUD, forwards synthetic clicks without pointer errors, freezes and resumes the complete scheduler');
    }

    const reduced = await browser.newContext({ reducedMotion: 'reduce', offline: true }); await route(reduced);
    const still = await reduced.newPage(); watch(still); await still.goto(origin); await still.waitForFunction(() => blueWeightless.getState().ready);
    assert.equal((await state(still)).paused, true); const at = (await state(still)).time; await still.waitForTimeout(150); assert.equal((await state(still)).time, at); await reduced.close();
    const fallback = await browser.newContext({ reducedMotion: 'reduce', offline: true }); await route(fallback);
    await fallback.addInitScript(() => { const native = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl' ? null : native.call(this, type, ...args); }; });
    const lowGpu = await fallback.newPage(); watch(lowGpu); await lowGpu.goto(origin); await lowGpu.waitForFunction(() => blueWeightless.getState().ready);
    assert.equal((await state(lowGpu)).character.mode, 'artwork'); await lowGpu.evaluate(() => blueWeightless.seek(59)); assert.equal((await state(lowGpu)).character.pose, 'backstroke');
    assert.equal((await state(lowGpu)).character.mode, 'pose-cycle', 'stroke cycles also work without WebGL');
    await lowGpu.screenshot({ path: path.join(output, 'fallback.jpg'), type: 'jpeg', quality: 90 }); await fallback.close();
    // Asset failures must expose a usable recovery control instead of a blank scene.
    const failed = await browser.newContext({ offline: true }); await route(failed, true);
    const broken = await failed.newPage(); await broken.goto(origin); await broken.locator('#loading button').waitFor(); assert.match(await broken.locator('#loading').textContent(), /重新加载/); await failed.close();
    const incomplete = await browser.newContext({ reducedMotion: 'reduce', offline: true }); await route(incomplete, false, 'freestyle-cycle.png');
    const partial = await incomplete.newPage(); await partial.goto(origin); await partial.waitForFunction(() => blueWeightless.getState().ready);
    await partial.evaluate(() => blueWeightless.seek(24));
    assert.equal((await state(partial)).character.sequenceLength, 0); assert.equal((await state(partial)).character.availableCycles.length, 3);
    await partial.evaluate(() => blueWeightless.seek(42)); assert.equal((await state(partial)).character.mode, 'pose-cycle'); await incomplete.close();
    checks.push('reduced-motion starts paused, CPU-only pose cycles, missing-cycle illustration fallback, required-asset recovery, no external runtime requests');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks, errors, external }, null, 2));
    console.log(JSON.stringify({ checks, output }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

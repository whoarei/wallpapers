'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { createHash } = require('node:crypto');
const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const { chromium } = require(option('--playwright') || 'playwright');
const folder = path.resolve(__dirname, '../wallpapers/zenith-sky');
const output = path.resolve(option('--output-dir') || path.join(os.tmpdir(), 'zenith-sky-qa'));
fs.mkdirSync(output, { recursive: true });
const origin = 'https://zenith.test/', key = 'zenith-sky.settings.v1:official';
const fixedTime = Date.parse('2026-11-11T13:30:00Z');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const errors = [], external = [], checks = [];
async function route(context, files) {
  await context.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.origin !== new URL(origin).origin) { external.push(u.href); return r.abort(); }
    const name = decodeURIComponent(u.pathname.slice(1)) || 'index.html';
    if (name === 'favicon.ico') return r.fulfill({ status: 204 });
    const buffer = files ? files.get(name) : fs.existsSync(path.join(folder, name)) ? fs.readFileSync(path.join(folder, name)) : undefined;
    if (!buffer) return r.fulfill({ status: 404 });
    const ext = name.split('.').pop(), contentType = ({ html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', jpg: 'image/jpeg', txt: 'text/plain; charset=utf-8' })[ext] || 'application/octet-stream';
    return r.fulfill({ contentType, body: buffer });
  });
}
function watch(page) { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); }
function unzip(bytes) {
  const files = new Map(); let pos = 0;
  while (bytes.readUInt32LE(pos) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(pos + 8), 0); const size = bytes.readUInt32LE(pos + 18), n = bytes.readUInt16LE(pos + 26), extra = bytes.readUInt16LE(pos + 28);
    const name = bytes.toString('utf8', pos + 30, pos + 30 + n), start = pos + 30 + n + extra;
    assert.ok(!name.includes('..') && !name.startsWith('/')); files.set(name, bytes.subarray(start, start + size)); pos = start + size;
  }
  assert.equal(bytes.readUInt32LE(pos), 0x02014b50); return files;
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: option('--browser'), args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Asia/Shanghai', acceptDownloads: true }); await route(context);
    const page = await context.newPage(); watch(page); await page.goto(origin);
    assert.match(await page.locator('#site-name').textContent(), /示例位置/);
    const start = await page.evaluate(() => ({ time: getState().observationTime, frames: getState().frames })); await page.waitForTimeout(1300);
    const live = await page.evaluate(() => ({ time: getState().observationTime, frames: getState().frames }));
    assert.ok(live.time > start.time + 800); assert.ok(live.frames - start.frames <= 3, 'real-time mode draws at 1 FPS');
    checks.push('explicit example location, wall-clock tracking, 1 FPS idle rendering');

    await page.evaluate(t => zenithSky.setTime(t), fixedTime);
    const first = await page.evaluate(() => getState()); assert.equal(first.starCount, 5044); assert.equal(first.constellationCount, 88);
    assert.ok(first.visible > 1000); assert.ok(first.drawnStars.every(s => s.altitude >= 0));
    const frozen = hash(await page.locator('canvas').screenshot()); await page.waitForTimeout(300); assert.equal(hash(await page.locator('canvas').screenshot()), frozen);
    await page.evaluate(t => zenithSky.setTime(t + 3600000), fixedTime);
    const afterHour = await page.evaluate(() => getState().drawnStars);
    const byId = new Map(first.drawnStars.map(s => [s.id, s]));
    const motion = afterHour.filter(s => byId.has(s.id)).map(s => Math.hypot(s.x - byId.get(s.id).x, s.y - byId.get(s.id).y));
    assert.ok(motion.reduce((a, b) => a + b, 0) / motion.length > 25, 'hourly sky must move visibly');
    await page.evaluate(t => zenithSky.setTime(t), fixedTime);
    await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(640, 650, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(100);
    assert.equal((await page.evaluate(() => getState())).atZenith, false);
    const zoom = await page.evaluate(() => getState().zoom); await page.mouse.wheel(0, -400); await page.waitForTimeout(100); assert.ok((await page.evaluate(() => getState())).zoom > zoom);
    await page.click('#zenith'); assert.equal((await page.evaluate(() => getState())).atZenith, true);
    await page.click('#fit'); assert.equal((await page.evaluate(() => getState())).zoom, 1);
    for (const z of [.01, 100]) { await page.evaluate(z => zenithSky.setZoom(z), z); const n = await page.evaluate(() => getState().zoom); assert.ok(n >= .65 && n <= 6); }
    await page.click('#zenith');
    checks.push('real catalog, geometric horizon, frozen canvas, hourly motion, spherical drag, wheel zoom, limits, zenith reset');

    await page.click('#location-button'); await page.click('[data-city="1"]');
    assert.equal((await page.evaluate(() => getState())).site.name, '北京');
    await page.reload(); assert.equal((await page.evaluate(() => getState())).site.source, 'preset');
    await page.click('#location-button'); await page.click('#custom-location summary');
    await page.fill('#place', '南半球观测点'); await page.fill('#latitude', '-33.8688'); await page.fill('#longitude', '151.2093'); await page.click('#coordinates-form button');
    assert.equal((await page.evaluate(() => getState())).site.latitude, -33.8688);
    await page.fill('#latitude', '91'); await page.click('#coordinates-form button'); assert.equal((await page.evaluate(() => getState())).site.latitude, -33.8688);
    await page.fill('#latitude', '-33.8688');
    const downloadPromise = page.waitForEvent('download'); await page.click('#export'); const download = await downloadPromise;
    const exportedPath = path.join(output, 'configured-zenith-sky.zip'); await download.saveAs(exportedPath);
    const exported = unzip(fs.readFileSync(exportedPath)); assert.equal(exported.size, 10);
    const parsed = { window: {} }; vm.runInNewContext(exported.get('settings.js').toString('utf8'), parsed);
    assert.equal(parsed.window.ZENITH_DEFAULTS.site.latitude, -33.8688); assert.ok(parsed.window.ZENITH_DEFAULTS.profile.startsWith('configured-'));
    const fresh = await browser.newContext(); await route(fresh, exported);
    // A pre-existing desktop location must not override the newly imported package.
    await fresh.addInitScript(k => localStorage.setItem(k, JSON.stringify({ site: { name: '北京', latitude: 39.9042, longitude: 116.4074, source: 'preset' } })), key);
    const imported = await fresh.newPage(); watch(imported); await imported.goto(origin);
    assert.equal((await imported.evaluate(() => getState())).site.latitude, -33.8688); await fresh.close();
    checks.push('city selection and persistence, southern coordinates, invalid coordinate rejection, configured ZIP export and isolated import settings');

    await page.reload(); await page.click('#location-button');
    await page.evaluate(() => {
      window.__locationCalls = 0;
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(ok, fail) { window.__locationCalls++; fail({ code: 1 }); } } });
    });
    assert.equal(await page.evaluate(() => window.__locationCalls), 0); await page.click('#locate');
    assert.match(await page.locator('#location-status').textContent(), /未获得定位权限/); assert.equal((await page.evaluate(() => getState())).site.latitude, -33.8688);
    await page.evaluate(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(ok) { ok({ coords: { latitude: 48.8566, longitude: 2.3522 } }); } } }));
    await page.click('#locate'); assert.equal((await page.evaluate(() => getState())).site.source, 'geolocation');
    assert.equal((await page.evaluate(() => getState())).site.latitude, 48.8566);
    await page.evaluate(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(ok) { window.__lateLocation = ok; } } }));
    await page.click('#locate'); await page.click('[data-city="0"]');
    await page.evaluate(() => window.__lateLocation({ coords: { latitude: 0, longitude: 0 } }));
    assert.equal((await page.evaluate(() => getState())).site.name, '上海', 'late location callbacks cannot override a city choice');
    await page.click('#close-location');
    await page.click('#speed'); assert.equal((await page.evaluate(() => getState())).speed, 60);
    const accelerated = await page.evaluate(() => getState().observationTime); await page.waitForTimeout(300); assert.ok((await page.evaluate(() => getState())).observationTime - accelerated > 10000);
    await page.keyboard.press('KeyT'); assert.equal((await page.evaluate(() => getState())).speed, 1);
    await page.click('#help'); assert.equal(await page.locator('#help-panel').isVisible(), true); await page.keyboard.press('Escape'); assert.equal(await page.locator('#help-panel').isVisible(), false);
    checks.push('opt-in geolocation, permission denial, success, stale callback handling, time acceleration, return to real time, keyboard help');

    await page.evaluate(t => { zenithSky.resetView(); zenithSky.setTime(t); }, fixedTime);
    await page.addStyleTag({ content: '.hud,.site-launcher,#notice{display:none!important}' });
    await page.screenshot({ path: path.join(output, 'desktop.jpg'), type: 'jpeg', quality: 93 });
    if (args.includes('--covers')) fs.copyFileSync(path.join(output, 'desktop.jpg'), path.join(folder, 'cover.jpg'));
    for (const [w, h] of [[390, 844], [780, 600], [3440, 1440], [3840, 2160]]) {
      await page.setViewportSize({ width: w, height: h });
      const s = await page.evaluate(() => ({ ...getState(), scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(s.width <= 1920 && s.height <= 1920); assert.ok(s.scroll <= s.client);
      assert.ok(s.drawnStars.every(v => Number.isFinite(v.x) && Number.isFinite(v.y) && v.altitude >= 0));
      if (w === 390) await page.screenshot({ path: path.join(output, 'mobile.jpg'), type: 'jpeg', quality: 91 });
    }
    for (const latitude of [-90, -33.8688, 0, 90]) { await page.evaluate(latitude => zenithSky.setSite({ name: '极点测试', latitude, longitude: 180, source: 'manual' }), latitude); assert.ok(await page.evaluate(() => getState().drawnStars.every(s => Number.isFinite(s.x) && Number.isFinite(s.y)))); }
    await context.close(); checks.push('portrait, compact, ultrawide, 4K, both geographic poles, equator, bounded canvas');

    if (option('--host-wrapper')) {
      const host = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); await route(host);
      await host.addInitScript({ path: path.resolve(option('--host-wrapper')) });
      const desktop = await host.newPage(); watch(desktop); await desktop.goto(origin);
      assert.equal((await desktop.evaluate(() => getState())).desktop, true);
      assert.equal(await desktop.locator('#location-button').isVisible(), true); assert.equal(await desktop.locator('.tools').isVisible(), false);
      async function hostClick(selector) { const box = await desktop.locator(selector).boundingBox(); assert.ok(box); const reply = await desktop.evaluate(({ x, y }) => __SCREEN_GARDEN_DESKTOP_CLICK(x / innerWidth, y / innerHeight), { x: box.x + box.width / 2, y: box.y + box.height / 2 }); assert.equal(reply.delivered, true); }
      await hostClick('#location-button'); assert.equal(await desktop.locator('#location-panel').isVisible(), true);
      await hostClick('[data-city="19"]'); assert.equal((await desktop.evaluate(() => getState())).site.name, '伦敦'); await hostClick('#close-location');
      const beforeInput = await desktop.evaluate(() => ({ q: getState().orientation, zoom: getState().zoom }));
      await desktop.mouse.move(800, 500); await desktop.mouse.down(); await desktop.mouse.move(1000, 600); await desktop.mouse.up(); await desktop.mouse.wheel(0, 500);
      assert.deepEqual(await desktop.evaluate(() => ({ q: getState().orientation, zoom: getState().zoom })), beforeInput);
      await desktop.evaluate(() => __SCREEN_GARDEN_SET_PAUSED(true));
      const hostPaused = await desktop.evaluate(() => ({ frames: getState().frames, time: getState().observationTime }));
      await desktop.waitForTimeout(1200); assert.deepEqual(await desktop.evaluate(() => ({ frames: getState().frames, time: getState().observationTime })), hostPaused);
      await desktop.evaluate(() => __SCREEN_GARDEN_SET_PAUSED(false)); await desktop.waitForTimeout(150);
      assert.ok((await desktop.evaluate(() => getState())).observationTime > hostPaused.time + 1000);
      await desktop.reload(); assert.equal((await desktop.evaluate(() => getState())).site.name, '伦敦');
      await host.close(); checks.push('real host wrapper: visible city controls, synthetic desktop click, persistent desktop location, no desktop drag/wheel, scheduler pause, resume to current sky');
    }
    const invalid = await browser.newContext(); await route(invalid); await invalid.addInitScript(k => localStorage.setItem(k, '{broken'), key);
    const fallback = await invalid.newPage(); watch(fallback); await fallback.goto(origin); assert.equal((await fallback.evaluate(() => getState())).site.source, 'example'); await invalid.close();
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    checks.push('corrupt-storage fallback, no external requests, no browser errors');
    const report = { passed: true, checks, errors, external, output }; fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

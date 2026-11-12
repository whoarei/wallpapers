'use strict';
// Standalone offline integration checks. No npm install or public server required.
// node tests/ocean-environment.browser.cjs --browser /usr/bin/chromium
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '../wallpapers/ocean-drift');
const output = path.resolve(option('--output-dir') || '/tmp/ocean-environment-qa');
const storageKey = 'ocean-drift.preferences.v2';
const defaults = { tourMode: 'auto', fixedZone: 0, tourSpeed: 1, brightness: 1, interactionStrength: 1, quietSide: 'none', quality: 'balanced', weather: 'auto', daylight: 'auto' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Hash the actual Canvas bitmap; DOM controls may independently fade or wake.
async function canvasHash(page) {
  const pixels = await page.locator('canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data));
  return hash(Buffer.from(pixels));
}
const climateFields = ['clear', 'overcast', 'rain', 'storm', 'light', 'warmth', 'current', 'surfaceDisturbance', 'night', 'visibility'];
const climateValues = state => Object.fromEntries(climateFields.map(key => [key, state.climate[key]]));

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.join(root, path.basename(new URL(req.url, 'http://localhost').pathname) || 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' })[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = option('--base-url') || `http://127.0.0.1:${server.address().port}/index.html`;
  let browser;
  const errors = [], external = [], checks = [], visual = {};
  const watch = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== new URL(url).origin) external.push(req.url()); });
  };
  const state = page => page.evaluate(() => oceanDrift.getState());
  const advance = async (page, seconds) => {
    const target = (await state(page)).time + seconds;
    let iterations = 0;
    while ((await state(page)).time < target - .001) {
      assert.ok(iterations++ < 500, 'scene clock must keep advancing');
      await page.evaluate(() => __step(80));
    }
    return state(page);
  };
  async function newScene(prefs, options = {}) {
    const context = await browser.newContext({ viewport: options.viewport || { width: 800, height: 500 }, deviceScaleFactor: options.deviceScaleFactor || 1, reducedMotion: options.reducedMotion || 'no-preference', hasTouch: !!options.touch, isMobile: !!options.touch });
    await context.addInitScript(({ prefs, storageKey, storageMode, wallHour }) => {
      if (Number.isFinite(wallHour)) {
        const NativeDate = Date;
        let wallTime = new NativeDate(2026, 10, 12, wallHour, 0, 0).getTime();
        class VirtualDate extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [wallTime])); }
          static now() { return wallTime; }
        }
        window.Date = VirtualDate;
        window.__jumpWallClock = milliseconds => { wallTime += milliseconds; };
      }
      if (storageMode === 'blocked') {
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage disabled', 'SecurityError'); } });
      } else if (storageMode === 'corrupt') localStorage.setItem(storageKey, '{broken json');
      else if (prefs && localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(prefs));
      let queue = [], stamp = 100, hidden = false;
      window.requestAnimationFrame = callback => { queue.push(callback); return queue.length; };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      window.__step = (count, interval = 80) => {
        for (let i = 0; i < count; i++) {
          stamp += interval;
          const pending = queue; queue = [];
          pending.forEach(callback => callback(stamp));
        }
        return window.oceanDrift?.getState();
      };
      window.__visibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    }, { prefs, storageKey, storageMode: options.storageMode, wallHour: options.wallHour });
    const page = await context.newPage(); watch(page);
    await page.goto(url);
    await page.waitForFunction(() => !!window.OceanSettings && !!window.OceanClimate && !!window.oceanDrift);
    return { context, page };
  }
  try {
    browser = await chromium.launch({ headless: true, executablePath: option('--browser') || '/usr/bin/chromium', args: ['--no-sandbox'] });

    const main = await newScene({ ...defaults, weather: 'clear', daylight: 'day' });
    const page = main.page;
    assert.deepEqual((await state(page)).preferences, await page.evaluate(() => OceanSettings.get()), 'scene consumes validated preferences');
    await page.locator('#settings').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#settings-panel').isVisible(), true, 'keyboard opens settings');
    assert.equal(await page.locator('#settings').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.querySelector('#settings-panel').contains(document.activeElement)), true, 'opening moves keyboard focus into settings');
    await page.locator('#settings-panel [name="weather"]').selectOption('rain');
    assert.equal((await state(page)).preferences.weather, 'rain', 'weather control reaches engine');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).weather, storageKey), 'rain', 'user setting is persisted');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#settings-panel').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'settings', 'Escape returns focus to opener');
    checks.push('keyboard settings, labeled weather selection, persistent update and Escape focus return');

    const selected = { tourMode: 'fixed', fixedZone: 1, tourSpeed: .5, brightness: .82, interactionStrength: .6, quietSide: 'left', quality: 'eco', weather: 'overcast', daylight: 'dusk' };
    await page.evaluate(prefs => OceanSettings.update(prefs), selected);
    assert.deepEqual((await state(page)).preferences, selected);
    await page.reload();
    assert.deepEqual((await state(page)).preferences, selected, 'all settings survive reload');
    let s = await state(page);
    assert.equal(s.auto, false); assert.equal(s.zone, 1, 'saved fixed habitat is restored');
    const camera = s.camera;
    await advance(page, 5);
    assert.equal((await state(page)).camera, camera, 'fixed habitat does not drift');
    await page.evaluate(() => OceanSettings.reset());
    assert.deepEqual((await state(page)).preferences, defaults, 'reset returns all controls and scene to defaults');
    checks.push('full preference roundtrip, fixed habitat restoration and reset');

    await page.evaluate(() => oceanDrift.setPaused(true));
    await page.setViewportSize({ width: 3840, height: 2160 });
    const quality = {};
    for (const [mode, cap, fps] of [['eco', 1280, 20], ['balanced', 1920, 30], ['high', 3840, 30]]) {
      await page.evaluate(quality => OceanSettings.update({ quality }), mode);
      s = await state(page);
      assert.ok(s.width <= cap && s.height <= cap, `${mode}: canvas allocation respects quality bound`);
      assert.equal(s.width, cap, `${mode}: uses requested resolution on a 4K display`);
      assert.equal(s.maxFps, fps, `${mode}: has expected frame limit`);
      quality[mode] = { width: s.width, height: s.height, maxFps: s.maxFps };
    }
    assert.equal(quality.high.height, 2160, 'high quality preserves native 4K height');
    await page.setViewportSize({ width: 5120, height: 1440 });
    s = await state(page);
    assert.ok(s.width <= 3840 && s.height <= 3840 && s.camera >= 0 && s.camera <= s.maxCamera, 'ultrawide canvas and camera remain bounded');
    await page.setViewportSize({ width: 800, height: 500 });
    checks.push('20/30 FPS quality choices, bounded 4K and ultrawide allocation, native 4K high quality');

    for (const storageMode of ['corrupt', 'blocked']) {
      const scene = await newScene(null, { storageMode });
      assert.deepEqual(await scene.page.evaluate(() => OceanSettings.get()), defaults, `${storageMode}: usable defaults without storage`);
      await scene.page.evaluate(() => OceanSettings.update({ weather: 'rain', brightness: .8 }));
      assert.equal((await state(scene.page)).preferences.weather, 'rain', `${storageMode}: settings still work`);
      await scene.context.close();
    }
    const invalid = await newScene({ weather: 'hurricane', daylight: 'midnight', quality: 'unbounded', quietSide: 'everywhere', tourMode: 'random', fixedZone: 99, tourSpeed: 999, brightness: null, interactionStrength: -100 });
    const safe = await invalid.page.evaluate(() => OceanSettings.get());
    assert.ok(['auto', 'clear', 'overcast', 'rain', 'storm'].includes(safe.weather));
    assert.ok(['auto', 'day', 'dusk', 'night'].includes(safe.daylight));
    assert.ok(['eco', 'balanced', 'high'].includes(safe.quality));
    assert.ok(['none', 'left', 'right'].includes(safe.quietSide));
    assert.ok(['auto', 'fixed'].includes(safe.tourMode));
    assert.ok([0, 1, 2].includes(safe.fixedZone) && [.5, 1, 1.5].includes(safe.tourSpeed));
    assert.ok(safe.brightness >= .65 && safe.brightness <= 1.2 && safe.interactionStrength >= .4 && safe.interactionStrength <= 1.4);
    await invalid.context.close();
    checks.push('corrupt/blocked storage resilience and validation of unsafe saved values');

    const timed = await newScene({ ...defaults, tourMode: 'fixed', weather: 'clear', daylight: 'day' }, { viewport: { width: 160, height: 100 } });
    const clock = timed.page;
    await clock.evaluate(() => __step(2));
    const beforeClimate = climateValues(await state(clock));
    await clock.evaluate(() => OceanSettings.update({ weather: 'storm' }));
    const switchClimate = climateValues(await state(clock));
    assert.deepEqual(switchClimate, beforeClimate, 'selecting weather does not jump climate values');
    await clock.evaluate(() => __step(1));
    const first = climateValues(await state(clock));
    assert.ok(climateFields.every(key => Math.abs(first[key] - beforeClimate[key]) < .01), 'weather transition begins gently');
    const midpoint = await advance(clock, 28);
    assert.ok(midpoint.climate.storm > .15 && midpoint.climate.storm < .95, 'weather is blended midway through transition');
    const settled = await advance(clock, 36);
    assert.ok(settled.climate.storm > .99 && settled.climate.night < .01, 'storm finishes without changing daylight');
    await clock.evaluate(() => OceanSettings.update({ daylight: 'night' }));
    const night = await advance(clock, 65);
    assert.ok(night.climate.night > .99 && night.climate.storm > .99, 'day/night changes independently of weather');
    await clock.evaluate(() => oceanDrift.setPaused(true));
    const frozen = await state(clock), frozenCanvas = await canvasHash(clock);
    await clock.evaluate(() => __step(100));
    assert.equal((await state(clock)).time, frozen.time);
    assert.deepEqual(climateValues(await state(clock)), climateValues(frozen), 'pause freezes weather and daylight');
    assert.equal(await canvasHash(clock), frozenCanvas, 'pause freezes actual weather rendering');
    await clock.evaluate(() => { oceanDrift.setPaused(false); __visibility(true); __step(100, 60000); });
    assert.equal((await state(clock)).time, frozen.time, 'background time cannot advance climate');
    await clock.evaluate(() => { __visibility(false); __step(1); });
    assert.equal((await state(clock)).time, frozen.time, 'resume has no weather jump');
    await timed.context.close();
    checks.push('rendered weather transition, independent daylight, paused/background climate and smooth resume');

    const suspended = await newScene({ ...defaults, tourMode: 'fixed' }, { viewport: { width: 160, height: 100 }, wallHour: 12 });
    const resumed = suspended.page;
    await advance(resumed, 65);
    const noon = await state(resumed), noonCanvas = await canvasHash(resumed);
    assert.ok(noon.climate.night < .01, 'virtual local noon starts in daylight');
    await resumed.evaluate(() => { __visibility(true); __jumpWallClock(12 * 60 * 60 * 1000); __step(10); __visibility(false); });
    const waking = await state(resumed);
    assert.equal(waking.time, noon.time, 'overnight suspension does not fast-forward scene or weather time');
    assert.deepEqual(climateValues(waking), climateValues(noon), 'local-time resync retains the displayed climate at the instant of resume');
    assert.equal(waking.environment.light, noon.environment.light, 'resumed physical light does not jump');
    assert.equal(await canvasHash(resumed), noonCanvas, 'overnight resume preserves actual canvas immediately');
    await resumed.evaluate(() => __step(1));
    assert.equal((await state(resumed)).time, noon.time, 'first resumed frame does not advance suspended scene time');
    const midnight = await advance(resumed, 65);
    assert.ok(midnight.climate.night > .99, 'auto daylight smoothly catches up to local midnight');
    assert.ok(midnight.environment.light < noon.environment.light, 'resumed local night changes physical lighting after the transition');
    await resumed.evaluate(() => OceanSettings.update({ daylight: 'day' }));
    await advance(resumed, 65);
    const locked = await state(resumed);
    assert.ok(locked.climate.night < .01);
    await resumed.evaluate(() => { oceanDrift.setPaused(true); __jumpWallClock(12 * 60 * 60 * 1000); oceanDrift.setPaused(false); });
    assert.equal((await state(resumed)).time, locked.time, 'long manual pause does not advance scene time');
    const stillLocked = await advance(resumed, 65);
    assert.equal(stillLocked.preferences.daylight, 'day');
    assert.ok(stillLocked.climate.night < .01, 'locked daylight survives long wall-clock pause and resumption');
    await suspended.context.close();
    checks.push('overnight wall-clock resync without scene/weather/light jump, gradual local night and locked daylight');

    const depth = await page.evaluate(() => {
      const clear = OceanClimate.create({ weather: 'clear', daylight: 'day', hour: 12 }).sample(0);
      const storm = OceanClimate.create({ weather: 'storm', daylight: 'day', hour: 12 }).sample(0);
      return [0, 1].map(depth => ({ clear: OceanClimate.atDepth(clear, depth), storm: OceanClimate.atDepth(storm, depth) }));
    });
    const shallowDifference = Math.abs(depth[0].clear.light - depth[0].storm.light);
    const deepDifference = Math.abs(depth[1].clear.light - depth[1].storm.light);
    assert.ok(shallowDifference > .1 && deepDifference < shallowDifference * .2, 'deep climate receives much less surface weather');
    checks.push('surface weather attenuation with habitat depth');

    const comfort = await newScene({ ...defaults, tourMode: 'fixed', weather: 'clear', daylight: 'day' });
    await comfort.page.evaluate(() => oceanDrift.setPaused(true));
    const thirds = () => comfort.page.evaluate(() => {
      const canvas = document.querySelector('canvas'), { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const sums = [0, 0, 0], counts = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) {
        const third = Math.min(2, Math.floor((i / 4 % canvas.width) * 3 / canvas.width));
        sums[third] += data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722; counts[third]++;
      }
      return sums.map((sum, i) => sum / counts[i]);
    });
    const normal = await thirds();
    await comfort.page.evaluate(() => OceanSettings.update({ brightness: .65 }));
    const dimmed = await thirds();
    assert.ok(dimmed.every((value, i) => value < normal[i] * .8), 'brightness changes the actual wallpaper');
    await comfort.page.evaluate(() => OceanSettings.update({ brightness: 1, quietSide: 'left' }));
    const quietLeft = await thirds();
    assert.ok(normal[0] - quietLeft[0] > Math.abs(normal[2] - quietLeft[2]) * 2 + 1, 'left icon space quiets the left side preferentially');
    await comfort.page.evaluate(() => OceanSettings.update({ quietSide: 'right' }));
    const quietRight = await thirds();
    assert.ok(normal[2] - quietRight[2] > Math.abs(normal[0] - quietRight[0]) * 2 + 1, 'right icon space quiets the right side preferentially');
    await comfort.page.evaluate(() => { OceanSettings.update({ quietSide: 'none', interactionStrength: .4 }); oceanDrift.setPaused(false); __step(2); });
    await comfort.page.keyboard.press('KeyE');
    const gentlePower = (await state(comfort.page)).blooms.at(-1).power;
    await comfort.page.evaluate(() => { __step(5); OceanSettings.update({ interactionStrength: 1.4 }); });
    await comfort.page.keyboard.press('KeyE');
    assert.ok((await state(comfort.page)).blooms.at(-1).power > gentlePower * 2, 'interaction strength changes the emitted light response');
    await comfort.context.close();
    checks.push('rendered brightness, left/right icon space and adjustable interaction response');

    // Fixed initial climates use the same scene time and deterministic geometry.
    // Pixel measurements verify that actual scenery, not only the status label, changes.
    for (const [name, weather, daylight] of [['clear-day', 'clear', 'day'], ['storm-day', 'storm', 'day'], ['clear-night', 'clear', 'night']]) {
      const scene = await newScene({ ...defaults, tourMode: 'fixed', weather, daylight }, { viewport: { width: 960, height: 600 } });
      await scene.page.addStyleTag({ content: '.hud,#toast{display:none!important}' });
      visual[name] = [];
      for (let zone = 0; zone < 3; zone++) {
        await scene.page.evaluate(zone => { oceanDrift.setPaused(true); oceanDrift.goToZone(zone, true); }, zone);
        visual[name].push(await scene.page.evaluate(() => {
          const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let luminance = 0;
          for (let i = 0; i < data.length; i += 4) luminance += data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
          return luminance / (data.length / 4);
        }));
        await scene.page.screenshot({ path: path.join(output, `${name}-${['reef', 'kelp', 'deep'][zone]}.png`) });
      }
      await scene.context.close();
    }
    assert.ok(visual['clear-day'][0] > visual['storm-day'][0] + 1, 'storm visibly changes shallow lighting');
    assert.ok(visual['clear-day'][0] > visual['clear-night'][0] + 1, 'night visibly changes shallow lighting');
    const reefWeatherDelta = Math.abs(visual['clear-day'][0] - visual['storm-day'][0]);
    const deepWeatherDelta = Math.abs(visual['clear-day'][2] - visual['storm-day'][2]);
    assert.ok(deepWeatherDelta < reefWeatherDelta * .65, 'rendered deep ocean is sheltered from surface weather');
    checks.push('nine real biome/weather/daynight screenshots and pixel-verified depth-sensitive lighting');

    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 751, height: 600 }]) {
      const mobile = await newScene(defaults, { viewport, reducedMotion: 'reduce', deviceScaleFactor: 2, touch: true });
      assert.equal((await state(mobile.page)).auto, false, 'reduced motion disables automatic camera');
      assert.equal(await mobile.page.evaluate(() => {
        const atlas = document.querySelector('.atlas').getBoundingClientRect();
        const controls = document.querySelector('.controls').getBoundingClientRect();
        return atlas.x < controls.right && atlas.right > controls.x && atlas.y < controls.bottom && atlas.bottom > controls.y;
      }), false, 'habitat navigation and controls never overlap');
      await mobile.page.locator('#settings').tap();
      const panel = await mobile.page.locator('#settings-panel').boundingBox();
      assert.ok(panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= viewport.width + 1 && panel.y + panel.height <= viewport.height + 1, 'mobile settings remain within viewport');
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile settings do not overflow page');
      await mobile.page.locator('#settings-panel [name="weather"]').selectOption('rain');
      assert.equal((await state(mobile.page)).preferences.weather, 'rain', 'touch settings can change weather');
      await mobile.page.screenshot({ path: path.join(output, `settings-${viewport.width}.png`) });
      await mobile.context.close();
    }
    checks.push('320/390/751 px touch settings, reduced-motion camera, scrolling and non-overlapping controls');

    await main.context.close();
    assert.deepEqual(errors, [], 'no browser or console errors');
    assert.deepEqual(external, [], 'no external services or assets');
    checks.push('offline assets, zero external requests and zero browser errors');
    const report = { passed: true, checks, quality, luminance: visual, errors, external, output };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

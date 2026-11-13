'use strict';
// Verify line-free surface particles and orbital transport at equal scene times.
// Optional --baseline <extracted released wallpaper> captures before/after images.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(process.env.WALLPAPER_ROOT || path.join(__dirname, '../wallpapers'), 'ocean-drift');
const output = path.resolve(option('--output-dir') || path.join(process.env.QA_OUTPUT_DIR || '/tmp', 'ocean-weather-qa'));
const baseline = option('--baseline');
const prefs = { weather: 'clear', daylight: 'day', tourMode: 'fixed', fixedZone: 0, tourSpeed: 1, brightness: 1, interactionStrength: 1, quietSide: 'none', quality: 'balanced' };
const hash = b => createHash('sha256').update(b).digest('hex');
function stats(bytes, width, height) {
  // Keep roaming animals below the sample: measure the surface, not fish motion.
  const cutoff = Math.floor(height * .15), pixels = width * cutoff;
  let mean = 0, edges = 0;
  const luma = i => bytes[i] * .2126 + bytes[i + 1] * .7152 + bytes[i + 2] * .0722;
  for (let y = 0; y < cutoff; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    mean += luma(i);
    if (x + 2 < width) edges += Math.abs(luma(i) - luma(i + 8));
    if (y + 2 < cutoff) edges += Math.abs(luma(i) - luma(i + width * 8));
  }
  return { mean: mean / pixels, spatialContrast: edges / pixels / Math.max(1, mean / pixels) };
}
function motion(a, b, width, height) {
  let sum = 0;
  const length = width * Math.floor(height * .15) * 4;
  for (let i = 0; i < length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c] - b[i + c]);
  return sum / (length / 4 * 3);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const dir = url.pathname.startsWith('/baseline/') ? baseline : root;
    const file = dir && path.join(dir, path.basename(url.pathname));
    if (!file || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' })[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: option('--browser') || process.env.BROWSER_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const errors = [], external = [], results = {};
  async function scene(settings, reduced = false, old = false) {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await context.addInitScript(settings => {
      localStorage.setItem('ocean-drift.preferences.v2', JSON.stringify(settings));
      let stamp = 100, queue = [], hidden = false;
      window.requestAnimationFrame = fn => { queue.push(fn); return queue.length; };
      Object.defineProperty(document, 'hidden', { get: () => hidden });
      window.__step = count => { for (let i = 0; i < count; i++) { stamp += 1000 / 30 + .01; const tasks = queue; queue = []; tasks.forEach(fn => fn(stamp)); } };
      window.__visibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    }, settings);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== origin) external.push(req.url()); });
    await page.goto(`${origin}/${old ? 'baseline' : 'current'}/index.html`);
    await page.waitForFunction(() => !!window.oceanDrift);
    await page.addStyleTag({ content: '.hud,#toast{display:none!important}' });
    return { page, context };
  }
  const pixels = async page => Buffer.from(await page.evaluate(() => {
    const c = document.querySelector('#ocean'), bytes = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let raw = ''; for (let i = 0; i < bytes.length; i += 32768) raw += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(raw);
  }), 'base64');
  async function capture(name, settings, reduced = false, old = false) {
    const { page, context } = await scene(settings, reduced, old);
    await page.evaluate(() => __step(61));
    const first = await pixels(page), state = await page.evaluate(() => getState());
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    await page.evaluate(() => __step(45));
    const second = await pixels(page);
    const after = await page.evaluate(() => getState());
    assert.equal(after.camera, state.camera, 'water movement never shakes the camera');
    await page.screenshot({ path: path.join(output, `${name}-later.png`) });
    const offset = animal => Math.hypot(animal?.waterOffset?.x || 0, animal?.waterOffset?.y || 0);
    const fish = state.fishStates.filter(f => f.x < 2400);
    results[name] = { ...stats(first, state.width, state.height), motion: motion(first, second, state.width, state.height), surface: state.weatherSurface,
      transport: { fish: Math.max(0, ...fish.map(offset)), fishVertical: Math.max(0, ...fish.map(f => Math.abs(f.waterOffset?.y || 0))),
        turtle: offset(state.turtle), ray: offset(state.ray), jelly: Math.max(0, ...state.jellyStates.map(offset)) } };
    if (!old && !reduced && settings.weather === 'storm' && settings.fixedZone === 0) {
      const f = after.fishStates.find(f => f.x > after.camera + 60 && f.x < after.camera + after.viewWidth - 60 && f.y > 440 && f.y < 780);
      assert.ok(f, 'a carried fish is visible for the real hit test');
      await page.mouse.click((f.x - after.camera) / after.viewWidth * 960, f.y / 1000 * 540);
      assert.equal((await page.evaluate(() => getState())).animalTouches, after.animalTouches + 1, 'touch reaches the fish at its carried position');
    }
    await context.close();
    console.log(name, JSON.stringify(results[name]));
  }
  try {
    for (const daylight of ['day', 'night']) {
      for (const weather of ['clear', 'storm']) await capture(`${daylight}-${weather}`, { ...prefs, daylight, weather });
      const clear = results[`${daylight}-clear`], storm = results[`${daylight}-storm`];
      assert.ok(storm.motion > clear.motion * 2 + .4, `${daylight}: storm has visible motion beyond global brightness`);
      assert.ok(storm.spatialContrast > clear.spatialContrast * 1.3, `${daylight}: foam and bubbles are visible`);
      assert.ok(storm.transport.fish > clear.transport.fish + 10 && storm.transport.fishVertical > 4, `${daylight}: fish respond to horizontal and vertical water movement`);
      assert.ok(storm.transport.turtle > 2 && storm.transport.ray > .5, `${daylight}: heavier animals also respond to the water`);
      if (baseline) {
        await capture(`before-${daylight}-storm`, { ...prefs, daylight, weather: 'storm' }, false, true);
        assert.ok(storm.motion > results[`before-${daylight}-storm`].motion * 3 + .4, `${daylight}: stronger motion than released 1.3.1`);
      }
    }
    await capture('deep-storm', { ...prefs, weather: 'storm', fixedZone: 2 });
    assert.equal(results['deep-storm'].surface.presence, 0);
    assert.ok(results['deep-storm'].motion < results['day-storm'].motion * .2, 'deep water is sheltered from surface surge');
    assert.ok(results['deep-storm'].transport.jelly < results['day-storm'].transport.fish * .2, 'deep jellyfish receive only a small passive drift');
    await capture('reduced-storm', { ...prefs, weather: 'storm' }, true);
    assert.equal(results['reduced-storm'].motion, 0, 'reduced-motion surface stays static');
    assert.equal(results['reduced-storm'].transport.fish + results['reduced-storm'].transport.turtle + results['reduced-storm'].transport.ray, 0, 'reduced motion disables passive transport');

    const { page, context } = await scene(prefs);
    await page.evaluate(() => { oceanDrift.setPaused(true); OceanSettings.update({ weather: 'storm' }); });
    let state = await page.evaluate(() => getState());
    assert.equal(state.climate.storm, 1, 'paused selection previews selected weather immediately');
    assert.equal(state.time, 0);
    const frozen = hash(await pixels(page));
    await page.evaluate(() => __step(90));
    assert.equal(hash(await pixels(page)), frozen, 'preview does not unpause wave animation');
    await page.evaluate(() => { oceanDrift.setPaused(false); OceanSettings.update({ weather: 'clear' }); __step(170); });
    state = await page.evaluate(() => getState());
    assert.equal(state.climate.clear, 1, 'manual weather selection finishes within five scene seconds');
    await page.evaluate(() => __visibility(true));
    const hidden = await page.evaluate(() => getState());
    await page.evaluate(() => __step(200));
    assert.equal((await page.evaluate(() => getState())).frames, hidden.frames, 'hidden waves stop drawing');
    await context.close();
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    const report = { passed: true, results, errors, external, output };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: true, output }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });

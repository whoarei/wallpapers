'use strict';
// Offline page checks with explicitly simulated v1 hosts. This does not test
// Windows Explorer's native empty-area filtering, DPI mapping or mouse passthrough.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(process.env.WALLPAPER_ROOT || path.join(__dirname, '../wallpapers'));
const output = process.env.QA_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-adaptation-'));
const scenes = {
  aquarium: 'aquarium', 'pinewind-town': 'pinewind', 'window-to-elsewhere': 'windowElsewhere',
  'pixel-camp': 'pixelCamp', 'sky-islands': 'skyIslands', 'night-train': 'nightTrain',
  'orbital-observatory': 'observatory', 'ocean-drift': 'oceanDrift',
  'blue-weightless': 'blueWeightless', 'zenith-sky': 'zenithSky', 'matrix-echo': 'matrixEcho', 'red-coast': 'redCoast'
};
const failures = [], reports = [];
const advance = (page, ms) => page.evaluate(ms => __advance(ms), ms);
const state = (page, name) => page.evaluate(name => window[name].getState(), name);
async function relay(page, selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, selector + ' must be visible: ' + (!box ? JSON.stringify(await page.locator(selector).evaluate(el => { const result = []; for (let n = el; n; n = n.parentElement) result.push({ tag: n.tagName, id: n.id, hidden: n.hidden, display: getComputedStyle(n).display }); return result; })) : ''));
  const hit = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    const hitId = target.closest('button')?.id || target.tagName;
    if (typeof window.__SCREEN_GARDEN_DESKTOP_CLICK === 'function') {
      const reply = __SCREEN_GARDEN_DESKTOP_CLICK(x / innerWidth, y / innerHeight);
      if (!reply.delivered) throw new Error('Host input was not delivered');
      return hitId;
    }
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const EventClass = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventClass(type, { bubbles: true, clientX: x, clientY: y, button: 0,
        buttons: type.endsWith('down') ? 1 : 0, pointerId: 1 }));
    }
    return hitId;
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  if (selector.startsWith('#')) assert.equal(hit, selector.slice(1), 'relay must hit the intended control');
}
async function setHostPause(page, paused, pauseReason = 'manual') {
  await page.evaluate(({ paused, pauseReason }) => {
    if (typeof window.__SCREEN_GARDEN_SET_PAUSED === 'function') {
      __SCREEN_GARDEN_SET_PAUSED({ paused, pauseReason: paused ? pauseReason : 'none' }); return;
    }
    window.__hostSnapshot = { paused, pauseReason: paused ? pauseReason : 'none' };
    // Listeners must re-read the snapshot instead of trusting event.detail.
    dispatchEvent(new CustomEvent('wallpaperhost:statechange', { detail: { paused: !paused } }));
  }, { paused, pauseReason });
}
async function checkButtons(page) {
  const bad = await page.evaluate(() => [...document.querySelectorAll('button')].flatMap(button => {
    if (!button.checkVisibility() || button.closest('[data-scene-panel]')) return [];
    const r = button.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.x < 0 || r.y < 0 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5 ||
      !button.contains(hit) ? [button.id || button.textContent] : [];
  }));
  assert.deepEqual(bad, [], 'visible controls must fit and be clickable');
}
async function checkActions(page, slug, name) {
  const currentInstance = await page.evaluate(() => wallpaperHost.instanceId);
  const expectedActions = {
    aquarium: ['feed', 'light', 'flow'], 'matrix-echo': ['speed', 'light'],
    'pinewind-town': ['phase', 'weather', 'train'], 'red-coast': ['phase', 'signal']
  }[slug];
  const actionId = slug === 'pinewind-town' ? 'train' : expectedActions[0];
  const invoke = (requestId, action = actionId, instanceId = currentInstance) => page.evaluate(
    request => typeof window.__SCREEN_GARDEN_INVOKE_ACTION === 'function' ? __SCREEN_GARDEN_INVOKE_ACTION(request).result : wallpaperApp.invoke(request), { protocolVersion: 1, requestId, instanceId, actionId: action });
  assert.deepEqual(await page.evaluate(() => wallpaperApp.getActions().map(a => a.id)), expectedActions);
  assert.equal(await page.evaluate(() => wallpaperApp.getActions()[0].enabled), false);
  assert.equal((await invoke('initial')).code, 'PAUSED');
  await setHostPause(page, false);
  const first = await invoke('first'); assert.equal(first.ok, true);
  const after = await state(page, name);
  assert.deepEqual(await invoke('first'), first, 'duplicate requests return the cached result');
  if (slug === 'aquarium') assert.equal((await state(page, name)).totalFed, after.totalFed);
  if (slug === 'matrix-echo') assert.equal((await state(page, name)).speedIndex, after.speedIndex);
  if (slug === 'red-coast') assert.equal((await state(page, name)).phaseIndex, after.phaseIndex);
  assert.equal((await invoke('first', 'other-action')).code, 'INVALID_REQUEST');
  assert.equal((await invoke('stale', actionId, 'old-instance')).code, 'STALE_INSTANCE');
  assert.equal((await invoke('unknown', 'unknown-action')).code, 'UNKNOWN_ACTION');
  assert.equal((await page.evaluate(() => wallpaperApp.invoke(null))).code, 'INVALID_REQUEST');
  assert.equal((await invoke('x'.repeat(129))).code, 'INVALID_REQUEST');
  // Both success and failure replies are retained, bounded to the latest 128.
  await setHostPause(page, true, 'occluded');
  const occluded = await invoke('occluded');
  if (slug === 'aquarium') assert.equal(occluded.ok, true, 'declared feeding updates memory while occluded');
  else assert.equal(occluded.code, 'PAUSED');
  await setHostPause(page, false);
  assert.deepEqual(await invoke('occluded'), occluded);
  if (slug === 'aquarium') {
    let reply;
    for (let i = 0; i < 9; i++) { reply = await invoke('fill-' + i); if (!reply.ok) break; }
    assert.equal(reply.code, 'DISABLED');
    assert.deepEqual(await page.evaluate(() => wallpaperApp.getActions().map(a => a.id)), expectedActions);
  assert.equal(await page.evaluate(() => wallpaperApp.getActions()[0].enabled), false);
    assert.equal((await invoke('first')).ok, true, 'cached success survives later capacity limits');
  }
  for (let i = 0; i < 128; i++) await invoke('evict-' + i, 'unknown-action');
  assert.equal((await invoke('first', 'unknown-action')).code, 'UNKNOWN_ACTION', 'old replies are evicted');
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium', headless: true });
  try {
    for (const [slug, name] of Object.entries(scenes).filter(([slug]) => !process.env.WALLPAPER_FILTER || slug === process.env.WALLPAPER_FILTER)) {
      for (const mode of ['browser', 'preview', 'desktop', 'legacy', 'unsupported', 'desktop-no-move']) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, offline: true });
        const errors = [], external = [];
        await context.route('**/*', route => {
          const u = new URL(route.request().url());
          if (u.origin !== 'https://wallpaper.test') { external.push(u.href); return route.abort(); }
          const file = path.join(root, slug, decodeURIComponent(u.pathname.slice(1)) || 'index.html');
          if (u.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
          if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
          const contentType = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream';
          return route.fulfill({ body: fs.readFileSync(file), contentType });
        });
        await context.addInitScript(({ mode, realHost }) => {
          let stamp = 1000, sequence = 0;
          const pending = new Map(), epoch = Date.now();
          performance.now = () => stamp;
          Date.now = () => epoch + stamp;
          window.requestAnimationFrame = callback => { pending.set(++sequence, callback); return sequence; };
          window.cancelAnimationFrame = id => pending.delete(id);
          window.__advance = ms => {
            const steps = ms > 2000 ? 1 : Math.ceil(ms / 50);
            for (let i = 0; i < steps; i++) {
              stamp += ms / steps;
              const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(stamp));
            }
          };
          if (mode === 'legacy') {
            // Reproduce legacy markers installed only on DOMContentLoaded.
            document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.screenGardenWallpaper = 'true'; });
          } else if (mode !== 'browser' && !realHost) {
            const hostMode = ['unsupported', 'desktop-no-move'].includes(mode) ? 'desktop' : mode;
            window.__hostSnapshot = { paused: mode === 'desktop', pauseReason: 'system' };
            window.wallpaperHost = Object.freeze({ protocolVersion: mode === 'unsupported' ? 2 : 1, mode: hostMode, instanceId: 'test-instance',
              capabilities: Object.freeze({ pointer: hostMode === 'desktop' ? 'relayed' : 'native', pointerMove: mode !== 'desktop-no-move',
                keyboard: hostMode !== 'desktop', fullscreen: hostMode !== 'desktop', pause: hostMode === 'desktop', actions: hostMode === 'desktop' }),
              getState: () => ({ ...window.__hostSnapshot }) });
          }
        }, { mode, realHost: mode === 'desktop' && Boolean(process.env.WALLPAPER_HOST_WRAPPER) });
        if (mode === 'desktop' && process.env.WALLPAPER_HOST_WRAPPER) await context.addInitScript({ path: process.env.WALLPAPER_HOST_WRAPPER });
        if (slug === 'aquarium') await context.addInitScript(() => {
          // Full raster QA lives in aquarium.browser.cjs. Keep the protocol
          // matrix fast on software-only Chromium by skipping Canvas painting.
          for (const key of ['save','restore','translate','scale','rotate','beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','ellipse','arc','clip','fill','stroke','fillRect','drawImage']) {
            CanvasRenderingContext2D.prototype[key] = function() {};
          }
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto('https://wallpaper.test/');
          await page.waitForFunction(name => window[name]?.getState().ready !== false && window[name], name, { polling: 100 });
          const desktop = mode === 'desktop' || mode === 'legacy' || mode === 'desktop-no-move';
          assert.equal(await page.evaluate(() => WallpaperRuntime.mode), desktop ? 'desktop' : mode === 'unsupported' ? 'browser' : mode);
          if (desktop) {
            assert.equal(await page.locator('#fullscreen').isVisible().catch(() => false), false);
            if (await page.locator('#help').count()) {
              await relay(page, '#help');
              const text = await page.locator('body').innerText();
              assert.doesNotMatch(text, /空格|F11|按 F|拖动|按住|←|→/);
              await relay(page, (await page.locator('#close-help').count()) ? '#close-help' : '#closeHelp');
            }
          }
          if (mode === 'desktop') {
            const initial = await state(page, name);
            await advance(page, 250);
            assert.equal((await state(page, name)).frames, initial.frames, 'initial system pause stops painting');
            if (['aquarium', 'pinewind-town', 'matrix-echo', 'red-coast'].includes(slug)) await checkActions(page, slug, name);
            await setHostPause(page, false);
          }
          if (!desktop && ['aquarium', 'pinewind-town', 'matrix-echo', 'red-coast'].includes(slug)) assert.deepEqual(await page.evaluate(() => wallpaperApp.getActions()), []);
          const start = await state(page, name);
          await advance(page, slug === 'zenith-sky' ? 1100 : 250);
          assert.ok((await state(page, name)).frames > start.frames, 'scene runs');
          if (mode === 'desktop') {
            await setHostPause(page, true);
            const stopped = await state(page, name);
            await advance(page, 60000);
            assert.equal((await state(page, name)).frames, stopped.frames, 'host pause stops painting');
            await setHostPause(page, false);
            await advance(page, 100);
            const resumed = await state(page, name);
            if (slug !== 'zenith-sky') assert.ok(resumed.time - stopped.time < .2, 'resume does not fast-forward');
            const beforeControl = await state(page, name);
            await relay(page, '#pause');
            const afterControl = await state(page, name);
            for (const key of ['flowers', 'totalFed', 'interactions', 'rippleCount']) {
              if (key in beforeControl) assert.equal(afterControl[key], beforeControl[key], 'control clicks must not trigger scene interactions');
            }
            assert.equal((await state(page, name)).paused, true);
            await setHostPause(page, true); await setHostPause(page, false);
            const local = await state(page, name);
            await advance(page, 200);
            assert.equal((await state(page, name)).frames, local.frames, 'host resume preserves user pause');
            await relay(page, '#pause');
          }
          if (mode === 'browser') {
            await page.evaluate(() => {
              Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
              WallpaperRuntime.refresh();
            });
            assert.equal(await page.locator('#fullscreen').isVisible().catch(() => false), false);
            if (await page.locator('#help').count()) {
              await relay(page, '#help');
              assert.doesNotMatch(await page.locator('body').innerText(), /F11|网页全屏|F 全屏/);
              await relay(page, (await page.locator('#close-help').count()) ? '#close-help' : '#closeHelp');
            }
          }
          if (!desktop) {
            await page.locator('#pause').focus();
            await advance(page, 12000);
            assert.equal(await page.evaluate(() => document.body.classList.contains('idle')), false, 'keyboard focus keeps controls visible');
          }
          if (desktop) {
            await page.evaluate(() => document.activeElement.blur());
            await advance(page, 12000);
            if (mode === 'legacy' || mode === 'desktop-no-move') assert.equal(await page.evaluate(() => document.body.classList.contains('idle')), false);
            await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 })));
            assert.equal(await page.evaluate(() => document.body.classList.contains('idle')), false);
            for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 480 }, { width: 800, height: 450 }]) {
              await page.setViewportSize(viewport); await checkButtons(page);
              if (await page.locator('#help').count()) {
                await relay(page, '#help');
                const close = (await page.locator('#close-help').count()) ? '#close-help' : '#closeHelp';
                const box = await page.locator(close).boundingBox();
                assert.ok(box.y >= 0 && box.x >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, 'help can be closed on small screens');
                await relay(page, close);
              }
              if (slug === 'ocean-drift' && viewport.width === 320) {
                const before = await state(page, name);
                await relay(page, '#settings');
                assert.equal(await page.locator('#pref-weather').isVisible(), false, 'desktop avoids native selects');
                await relay(page, '.desktop-preference-tabs button:nth-child(2)');
                await relay(page, '[data-cycle=weather]');
                assert.equal((await state(page, name)).preferences.weather, 'clear');
                await relay(page, '[data-cycle=daylight]');
                assert.equal((await state(page, name)).preferences.daylight, 'day');
                await relay(page, '.desktop-preference-tabs button:nth-child(3)');
                await relay(page, '[data-adjust=brightness][data-step="1"]');
                assert.equal((await state(page, name)).preferences.brightness, 1.05);
                await relay(page, '[data-adjust=brightness][data-step="-1"]');
                assert.equal((await state(page, name)).preferences.brightness, 1);
                const out = await page.evaluate(() => [...document.querySelectorAll('#settings-panel button')].filter(b => b.checkVisibility()).filter(b => { const r=b.getBoundingClientRect(); return r.y<0 || r.bottom>innerHeight || r.x<0 || r.right>innerWidth; }).map(b => b.textContent));
                assert.deepEqual(out, [], 'all desktop settings buttons fit the small viewport');
                await relay(page, '#close-settings');
                assert.equal((await state(page, name)).interactions, before.interactions, 'settings do not trigger the ocean behind them');
              }
              if (slug === 'blue-weightless') assert.ok(await page.locator('#garden').isVisible(), 'garden has a desktop mouse entry');
            }
            await page.setViewportSize({ width: 390, height: 844 });
            if (mode === 'desktop' && slug !== 'aquarium') {
              await page.evaluate(() => document.activeElement.blur());
              await page.screenshot({ path: path.join(output, slug + '-portrait.png'), animations: 'disabled' });
            }
          }
          assert.deepEqual(errors, []); assert.deepEqual(external, []);
          reports.push(slug + ': ' + mode);
        } catch (error) {
          failures.push({ slug, mode, error: error.stack, pageErrors: errors });
          console.error(slug + ': ' + mode + ': ' + error.message);
        } finally { await context.close(); }
        console.log(slug + ': ' + mode);
      }
      console.log('Checked ' + slug);
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ reports, failures }, null, 2));
  console.log(JSON.stringify({ passed: reports.length, failures, output }, null, 2));
  assert.equal(failures.length, 0);
})().catch(error => { console.error(error); process.exitCode = 1; });

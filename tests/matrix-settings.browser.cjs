'use strict';
// The unmodified v0.12.0 host SDK runs inside an opaque-origin sandbox.
// Private delivery functions below belong only to this host test harness.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.join(path.resolve(process.env.WALLPAPER_ROOT || path.join(__dirname, '../wallpapers')), 'matrix-echo');
const fixtures = path.join(__dirname, 'fixtures/wallpaper-box-v0.12.0');
const output = process.env.QA_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-settings-'));
const host = fs.readFileSync(path.join(fixtures, 'wallpaper-mode.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const personal = { id: 'settings-poem', title: '设置页作品', author: '测试', verses: ['海上生明月，天涯共此时。'] };
const jsonFile = value => ({ name: 'custom.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
const state = page => page.evaluate(() => matrixEcho.getState());
const csp = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors https://matrix.test; base-uri 'self'; form-action 'none'";
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  try {
    const c = await browser.newContext({ offline: true, viewport: { width: 1000, height: 900 } });
    const errors = [], external = [], players = [], requests = [];
    let snapshot = { revision: 0, settings: { anotherFeature: { keep: true } } }, failure = '', pending = false;
    c.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await c.exposeBinding('__settingsRequest', async (_, message) => {
      requests.push(clone(message));
      if (message.method === 'load') return { ...clone(snapshot), locale: 'zh-CN' };
      if (failure) { const error = failure; failure = ''; throw Error(error); }
      if (message.expectedRevision !== snapshot.revision) throw Error('配置已发生变化，请重新加载设置后再保存。');
      assert.ok(Buffer.byteLength(JSON.stringify(message.settings)) <= 32768);
      snapshot = { revision: snapshot.revision + 1, settings: clone(message.settings) };
      for (const page of players) await page.evaluate(s => __SCREEN_GARDEN_SET_SETTINGS({ moduleId: 'matrix-echo', ...s }), snapshot);
      return { snapshot: clone(snapshot), running: players.filter(p => p.__desktop).length, pending, locale: 'zh-CN' };
    });
    await c.route('**/*', route => {
      const url = new URL(route.request().url()), name = decodeURIComponent(url.pathname.slice(1));
      if (url.origin !== 'https://matrix.test') { external.push(url.href); return route.abort(); }
      if (name === 'parent.html') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>body{margin:0}iframe{border:0;width:100%;height:98vh}</style><iframe sandbox="allow-scripts allow-forms" src="/settings.html#wallpaper-settings=qa-session"></iframe><script>
        addEventListener('message',async event=>{
          const m=event.data, frame=document.querySelector('iframe');
          if(event.source!==frame.contentWindow||event.origin!=='null'||m?.channel!=='wallpaper-settings-v1'||m.session!=='qa-session')return;
          try { const result=await __settingsRequest(m); frame.contentWindow.postMessage({...m,ok:true,result},'*'); }
          catch(error){frame.contentWindow.postMessage({...m,ok:false,error:error.message},'*');}
        });</script>` });
      const file = name === '__wallpaper_host__/settings.js' ? path.join(fixtures, 'settings.js') : path.join(root, name || 'index.html');
      if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff' })[path.extname(file)] || 'application/octet-stream', headers: { 'Content-Security-Policy': csp } });
    });
    async function player(desktop, initial = snapshot) {
      const page = await c.newPage(); page.__desktop = desktop;
      await page.addInitScript({ content: `${host}(${JSON.stringify({ mode: desktop ? 'desktop' : 'preview', locale: 'zh-CN' })});
        __SCREEN_GARDEN_SET_SETTINGS(${JSON.stringify({ moduleId: 'matrix-echo', ...initial })});` });
      await page.goto('https://matrix.test/index.html');
      await page.waitForFunction(() => window.matrixEcho);
      await page.waitForFunction(() => matrixEcho.getState().culture.fontReady.length === 4);
      players.push(page); return page;
    }
    const desktop = await player(true), second = await player(true), preview = await player(false);
    const parent = await c.newPage(); await parent.goto('https://matrix.test/parent.html');
    const frame = parent.frameLocator('iframe');
    await frame.locator('#config-save').waitFor({ state: 'visible' });
    await frame.locator('#add-poem').waitFor({ state: 'visible' });
    assert.equal(await frame.locator('#export-poems').isVisible(), false);
    const child = parent.frames().find(f => f !== parent.mainFrame());
    assert.equal(await child.evaluate(() => { try { localStorage.getItem('x'); return false; } catch { return true; } }), true);
    await frame.locator('#add-poem').click();
    await frame.locator('#poem-title').fill(personal.title); await frame.locator('#poem-author').fill(personal.author);
    await frame.locator('#poem-verses').fill(personal.verses[0]);
    assert.equal(await frame.locator('#config-save').isDisabled(), true, 'an unfinished inner form cannot be silently omitted');
    await frame.locator('#poem-editor button[type=submit]').click();
    assert.equal(snapshot.revision, 0, 'edits remain drafts before explicit save');
    await frame.locator('#config-speed').selectOption('2'); await frame.locator('#config-light').selectOption('0');
    await frame.locator('#config-save').click();
    await frame.locator('#config-feedback').filter({ hasText: '已保存，已通知' }).waitFor();
    assert.equal(snapshot.revision, 1); assert.equal(snapshot.settings.anotherFeature.keep, true);
    for (const page of [desktop, second, preview]) {
      const s = await state(page);
      assert.equal(s.configurationSource, 'host'); assert.equal(s.speedIndex, 2); assert.equal(s.lightIndex, 0);
      assert.ok(s.culture.poems.some(p => p.title === personal.title));
    }
    assert.equal((await state(desktop)).time, 0, 'saving does not advance a suspended desktop');
    assert.equal(await desktop.evaluate(() => wallpaperHost.getState().paused), true);
    await preview.locator('#culture').click();
    assert.equal(await preview.locator('#host-settings-notice').isVisible(), true);
    assert.equal(await preview.locator('#import-poems').isVisible(), false);
    assert.equal(await preview.locator('#poem-list button').count(), 0);
    await desktop.evaluate(() => dispatchEvent(new CustomEvent('wallpaperhost:settingschange', { detail: { settings: {} } })));
    assert.equal((await state(desktop)).speedIndex, 2, 'forged events cannot replace the host snapshot');
    // Trusted file chooser clicks work despite opaque origin; import note text.
    await frame.locator('#tab-glyphs').click();
    const builtin = (await state(desktop)).culture.glyphs[0], note = '通过主程序设置导入的注释。';
    const chooser = parent.waitForEvent('filechooser'); await frame.locator('#import-glyphs').click();
    await (await chooser).setFiles(jsonFile({ ...builtin, description: note }));
    await frame.locator('#culture-status').filter({ hasText: '已导入' }).waitFor();
    pending = true; await frame.locator('#config-save').click();
    await frame.locator('#config-feedback').filter({ hasText: '部分窗口' }).waitFor(); pending = false;
    assert.equal((await state(second)).culture.glyphs.find(g => g.id === builtin.id).description, note);
    assert.deepEqual(requests.filter(r => r.method === 'save').map(r => r.expectedRevision), [0, 1]);
    // Revision conflict and failed persistence must preserve the editor draft.
    await frame.locator('#config-speed').selectOption('1'); snapshot.revision++;
    await frame.locator('#config-save').click(); await frame.locator('#config-error').filter({ hasText: '配置已发生变化' }).waitFor();
    assert.equal(await frame.locator('#config-speed').inputValue(), '1'); assert.equal(await frame.locator('#config-save').isDisabled(), true);
    await frame.locator('#config-reload').click(); await frame.locator('#config-feedback').filter({ hasText: '已读取' }).waitFor();
    assert.equal(await frame.locator('#config-speed').inputValue(), '2');
    await frame.locator('#config-light').selectOption('1'); failure = '写入配置失败';
    await frame.locator('#config-save').click(); await frame.locator('#config-error').filter({ hasText: '写入配置失败' }).waitFor();
    assert.equal(await frame.locator('#config-light').inputValue(), '1'); assert.equal(snapshot.settings.matrixEcho.lightIndex, 0);
    await frame.locator('#config-reload').click(); await frame.locator('#config-feedback').filter({ hasText: '已读取' }).waitFor();
    // Valid library imports may exceed the host's smaller persistence budget.
    await frame.locator('#tab-poems').click();
    const large = Array.from({ length: 45 }, (_, i) => ({ id: `large-${i}`, title: `容量测试${i}`, author: '测试', verses: ['山'.repeat(120), '水'.repeat(120), '月'.repeat(120)] }));
    await frame.locator('#poem-file').setInputFiles(jsonFile(large));
    await frame.locator('#config-capacity.over-limit').waitFor();
    assert.equal(await frame.locator('#config-save').isDisabled(), true);
    await frame.locator('#config-reload').click(); await frame.locator('#config-feedback').filter({ hasText: '已读取' }).waitFor();
    // No running desktop: persist now, then initialize a later document from it.
    players.splice(0); await frame.locator('#config-speed').selectOption('1');
    await frame.locator('#config-save').click(); await frame.locator('#config-feedback').filter({ hasText: '下次启动' }).waitFor();
    const later = await player(true); assert.equal((await state(later)).speedIndex, 1);
    const good = await state(later);
    await later.evaluate(revision => __SCREEN_GARDEN_SET_SETTINGS({ moduleId: 'matrix-echo', revision, settings: { matrixEcho: { version: 2 } } }), snapshot.revision + 1);
    assert.equal((await state(later)).speedIndex, good.speedIndex, 'invalid configuration keeps last valid state');
    await child.evaluate(() => scrollTo(0, 0));
    await parent.screenshot({ path: path.join(output, 'native-matrix-settings.png') });
    await frame.locator('#tab-glyphs').click(); await child.evaluate(() => scrollTo(0, 0));
    await parent.screenshot({ path: path.join(output, 'native-matrix-glyph-settings.png') });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await c.close();
    console.log('Matrix native settings passed: real SDK + host shim, sandbox file import, drafts, shared live delivery, pause preservation, revisions, failures, size budget, next-launch and read-only playback.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

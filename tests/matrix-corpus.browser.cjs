'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(process.env.WALLPAPER_ROOT || path.join(__dirname, '../wallpapers'), 'matrix-echo');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium', headless: true });
  try {
    const context = await browser.newContext({ offline: true, viewport: { width: 1000, height: 850 } });
    const errors = [], external = [];
    let missing = false;
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://matrix.test') { external.push(url.href); return route.abort(); }
      const name = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
      if (missing && name === 'data/poems-0000.js') return route.fulfill({ status: 404 });
      const file = path.join(root, name);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff' })[path.extname(file)] || 'application/octet-stream' });
    });
    await context.addInitScript(() => {
      if (location.origin !== 'https://matrix.test') return;
      if (!localStorage.getItem('matrix-echo.culture.v1:official')) localStorage.setItem('matrix-echo.culture.v1:official', JSON.stringify({
        glyphOverrides: [{ id: 'legacy-personal-deer', script: 'seal', character: '鹿', reading: 'lù', description: '扩充前的个人注释。', enabled: true },
          { id: 'glyph-seal-6797', script: 'seal', character: '林', reading: 'lín', description: '扩充前自动命名的林。', enabled: true }]
      }));
    });
    const page = await context.newPage(); await page.goto('https://matrix.test/');
    await page.waitForFunction(() => window.matrixEcho && matrixEcho.getState({ includeLibrary: false }).culture.fontReady.length === 4);
    const totals = await page.evaluate(() => {
      const state = matrixEcho.getState();
      return { poems: state.culture.poems.length, glyphs: state.culture.glyphs.length,
        deer: state.culture.glyphs.filter(e => e.script === 'seal' && e.character === '鹿') };
    });
    assert.ok(totals.poems >= 10000); assert.ok(totals.glyphs >= 9446);
    assert.equal(totals.deer.length, 1); assert.equal(totals.deer[0].id, 'legacy-personal-deer');
    assert.equal(totals.deer[0].description, '扩充前的个人注释。');
    await page.locator('#culture').click();
    assert.equal(await page.locator('#poem-list .poem-row').count(), 40);
    await page.locator('#poem-search').fill('王维');
    await page.waitForFunction(() => !document.getElementById('poem-page-status').textContent.includes('10045 条结果'));
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#poem-list .poem-row')].every(row => {
      const poem = MATRIX_POEMS.find(p => p.id === row.dataset.poemId);
      return [poem.title, poem.author, ...poem.verses].join(' ').includes('王维');
    })));
    assert.ok(await page.locator('#poem-list .poem-row').count());
    const first = await page.locator('#poem-list .poem-row').first().getAttribute('data-poem-id');
    await page.locator('#poem-next').click();
    assert.match(await page.locator('#poem-page-status').textContent(), /第 2/);
    assert.notEqual(await page.locator('#poem-list .poem-row').first().getAttribute('data-poem-id'), first);
    await page.locator('#poem-search').fill('');
    await page.locator('#poem-collection').selectOption('宋词三百首');
    await page.locator('#poem-dynasty-filter').selectOption('宋');
    await page.locator('#poem-tag').selectOption('宋词三百首');
    await page.locator('#poem-collection-toggle').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('matrix-echo.culture.v1:official')));
    assert.ok(saved.excludedPoemCollections.includes('宋词三百首')); assert.equal(saved.overrides.length, 0);
    assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 1024);
    await page.locator('#next-verse').click();
    assert.notEqual(await page.evaluate(() => {
      const s = matrixEcho.getState(); return s.culture.poems.find(p => p.id === s.culture.current?.id)?.collection;
    }), '宋词三百首');
    await page.locator('#tab-glyphs').click();
    await page.locator('#restore-glyphs').click(); await page.locator('#confirm-glyph-restore').click();
    assert.equal(await page.evaluate(() => matrixEcho.getState().culture.glyphs.find(e => e.id === 'glyph-seal-6797').description), '扩充前自动命名的林。');
    await page.locator('#glyph-search').fill('glyph-kai-4e00');
    const changedRow = page.locator('[data-glyph-id="glyph-kai-4e00"]');
    await changedRow.getByText('编辑', { exact: true }).click();
    await page.locator('#glyph-character').fill('龍'); await page.locator('#glyph-reading').fill('lóng');
    await page.locator('#glyph-description').fill('修改字符后的个人注释。');
    await page.locator('#glyph-editor button[type=submit]').click();
    await changedRow.getByText('删除', { exact: true }).click();
    assert.equal(await page.evaluate(() => matrixEcho.getState().culture.glyphs.some(e => e.id === 'glyph-kai-4e00')), false);
    await page.locator('#restore-glyphs').click(); await page.locator('#confirm-glyph-restore').click();
    assert.equal(await page.evaluate(() => matrixEcho.getState().culture.glyphs.find(e => e.id === 'glyph-kai-4e00').character), '一');
    await page.locator('#glyph-search').fill('');
    await page.locator('#glyph-filter').selectOption('kai');
    assert.equal(await page.locator('#glyph-list .glyph-row').count(), 40);
    assert.match(await page.locator('#glyph-page-status').textContent(), /3500 条结果/);
    await page.locator('#glyph-search').fill('不存在的汉字注释搜索');
    await page.locator('#glyph-empty').waitFor({ state: 'visible' });
    await page.locator('#glyph-search').fill('');
    await page.locator('#glyph-filter').selectOption('');
    await page.locator('#glyph-collection').selectOption('篆字扩展');
    await page.locator('#glyph-collection-toggle').click();
    await page.reload(); await page.waitForFunction(() => window.matrixEcho);
    assert.ok(await page.evaluate(() => matrixEcho.getState().culture.settings.excludedGlyphCollections.includes('篆字扩展')));
    assert.equal(await page.evaluate(() => matrixEcho.getState().culture.glyphs.find(e => e.id === 'legacy-personal-deer').description), '扩充前的个人注释。');
    // A missing shard is visible and never commits a partial library.
    missing = true; await page.reload();
    await page.locator('#culture-status').filter({ hasText: '无法读取离线内容' }).waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.matrixEcho)), false);
    assert.equal(await page.evaluate(() => MATRIX_POEMS.length), 0);
    missing = false; await page.reload(); await page.waitForFunction(() => window.matrixEcho);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log('Matrix large corpus passed: offline shards, 40-row pages, author/dynasty/topic search, collection persistence under 1 KiB, legacy IDs, and atomic missing-shard failure.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
// Exercise actual offline assets, atomic imports, user settings and exported ZIPs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const source = path.join(path.resolve(process.env.WALLPAPER_ROOT || path.join(__dirname, '../wallpapers')), 'matrix-echo');
const output = process.env.QA_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-echo-'));
const P = require('../wallpapers/matrix-echo/poetry.js');
fs.mkdirSync(output, { recursive: true });
const personal = { title: '测试诗词', author: '测试作者', dynasty: '唐', verses: ['海上生明月，天涯共此时。'] };
function unzip(buffer) {
  const files = new Map(); let at = 0;
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    const size = buffer.readUInt32LE(at + 18), nameLength = buffer.readUInt16LE(at + 26), extra = buffer.readUInt16LE(at + 28);
    const name = buffer.subarray(at + 30, at + 30 + nameLength).toString('utf8'), start = at + 30 + nameLength + extra;
    assert.ok(!name.includes('..') && !name.startsWith('/'));
    files.set(name, buffer.subarray(start, start + size)); at = start + size;
  }
  return files;
}
async function context(browser, root = source, options = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, offline: true, acceptDownloads: true, ...options });
  const errors = [], external = [];
  await c.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== 'https://matrix.test') { external.push(u.href); return route.abort(); }
    const name = decodeURIComponent(u.pathname.slice(1)) || 'index.html', file = path.join(root, name);
    if (name === 'favicon.ico') return route.fulfill({ status: 204 });
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    const contentType = ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff': 'font/woff' })[path.extname(name)] || 'application/octet-stream';
    return route.fulfill({ body: fs.readFileSync(file), contentType });
  });
  await c.addInitScript(() => {
    let stamp = 1000, id = 0; const pending = new Map();
    performance.now = () => stamp;
    requestAnimationFrame = cb => { pending.set(++id, cb); return id; };
    cancelAnimationFrame = id => pending.delete(id);
    window.__advance = ms => {
      for (let left = ms; left > 0; left -= 50) {
        stamp += Math.min(left, 50); const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(cb => cb(stamp));
      }
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, width, height) {
      if (this.canvas.id === 'matrix' && this.fillStyle === '#010703') {
        window.__doorBounds = { left: x, right: x + width, top: y, bottom: y + height };
      }
      return fillRect.call(this, x, y, width, height);
    };
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
      // Resizes/font completion may repaint between async assertions. Capture
      // the last complete scene frame, rather than joining several frames.
      if (this.canvas.id === 'matrix' && args.length === 2 && window.__poemPaint) window.__poemPaint = [];
      return drawImage.call(this, image, ...args);
    };
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...args) {
      if (this.canvas.id === 'matrix' && window.__poemPaint) window.__poemPaint.push({ text, x, y, font: this.font });
      return fillText.call(this, text, x, y, ...args);
    };
  });
  c.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  return { c, errors, external };
}
const state = page => page.evaluate(() => matrixEcho.getState());
const advance = (page, ms) => page.evaluate(ms => __advance(ms), ms);
async function checkRainVerse(page, expected) {
  await page.evaluate(() => { window.__poemPaint = []; }); await advance(page, 50);
  const s = await state(page), layout = s.rainPoem;
  assert.equal(layout.verse, expected);
  assert.equal(layout.columns.map(c => c.text).join(''), expected, 'whole verse remains in reading order');
  assert.ok(layout.columns.every(c => c.x > 0 && c.x < s.width && c.top >= 0 && c.bottom < s.height));
  const painted = await page.evaluate(() => { const result = window.__poemPaint; window.__poemPaint = null; return result; });
  painted.sort((a, b) => b.x - a.x || b.y - a.y);
  assert.equal(painted.map(c => c.text).join(''), expected, 'first character leads each falling column, with the full verse trailing above');
  assert.ok(painted.every(c => c.font.includes('MatrixKai')));
}
async function checkFloatingDoor(page) {
  const result = await page.evaluate(() => {
    const door = window.__doorBounds, overlaps = [], hidden = [];
    for (const el of document.querySelectorAll('.floating-glyph')) {
      if (getComputedStyle(el).visibility === 'hidden') { hidden.push(el.textContent); continue; }
      const r = el.getBoundingClientRect();
      // Include the letter's 14px shadow and the door's frame/glow clearance.
      if (r.right + 14 > door.left - 25.9 && r.left - 14 < door.right + 25.9 &&
          r.bottom + 14 > door.top - 25.9 && r.top - 14 < door.bottom + 25.9) overlaps.push(el.textContent);
    }
    return { overlaps, hidden };
  });
  assert.deepEqual(result.overlaps, [], 'floating letters and their shadows stay clear of the actual painted doorway');
  assert.deepEqual(result.hidden, [], 'supported viewports keep all floating letters visible');
}
async function open(c) {
  const page = await c.newPage(); await page.goto('https://matrix.test/');
  await page.waitForFunction(() => window.matrixEcho?.getState().culture.fontReady.length === 4, null, { polling: 100 });
  return page;
}
const jsonFile = (value, name = 'poems.json') => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
async function download(page, selector, name) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const item = await pending, dest = path.join(output, name); await item.saveAs(dest); return fs.readFileSync(dest);
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium', headless: true });
  try {
    const { c, errors, external } = await context(browser), page = await open(c);
    await advance(page, 6000);
    let s = await state(page);
    assert.ok(s.culture.current);
    assert.equal(await page.locator('#echo-verse').textContent(), s.culture.current.verse);
    assert.equal(await page.locator('#poetry-echo').count(), 0, 'verses have no independent floating overlay');
    assert.ok(s.culture.poems.find(p => p.id === s.culture.current.id).verses.includes(s.culture.current.verse));
    await checkRainVerse(page, s.culture.current.verse);
    const beforeFlow = await state(page); await advance(page, 1000); const afterFlow = await state(page);
    const distance = afterFlow.rainPoem.columns[0].top - beforeFlow.rainPoem.columns[0].top;
    assert.ok(distance > 0, 'poetry moves down in the code rain');
    assert.ok(Math.abs(distance - (afterFlow.time - beforeFlow.time) * afterFlow.rainPoem.speed) < .001, 'poem uses the carrier stream velocity');
    await page.locator('#speed').click();
    const fasterStart = await state(page); await advance(page, 1000); const fasterEnd = await state(page);
    assert.ok(fasterEnd.rainPoem.columns[0].top - fasterStart.rainPoem.columns[0].top > distance * 1.7, 'flow control accelerates poetry together with the code');
    assert.equal(s.culture.floatingCount, 9);
    await checkFloatingDoor(page);
    assert.deepEqual(new Set(await page.locator('.floating-glyph').evaluateAll(els => els.map(e => getComputedStyle(e).fontFamily))), new Set(['MatrixSeal', 'MatrixKai', 'MatrixYi', 'MatrixTibetan']));
    await page.locator('#pause').click(); const paused = await state(page);
    const transform = await page.locator('.floating-glyph').first().getAttribute('style');
    await advance(page, 5000);
    assert.equal((await state(page)).culture.clock, paused.culture.clock);
    assert.deepEqual((await state(page)).rainPoem, paused.rainPoem, 'pause freezes embedded verse positions');
    assert.equal(await page.locator('.floating-glyph').first().getAttribute('style'), transform);
    await page.locator('#pause').click();
    await page.locator('#culture').click();
    const oldSize = await page.locator('.floating-glyph').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize));
    await page.locator('#floating-size').click();
    assert.ok(await page.locator('.floating-glyph').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize)) > oldSize);
    await page.locator('#add-poem').click();
    await page.locator('#poem-title').fill(personal.title);
    await page.locator('#poem-author').fill(personal.author);
    await page.locator('#poem-verses').fill(personal.verses.join('\n'));
    await page.locator('#poem-verses').press('Space'); await page.locator('#poem-verses').press('f');
    assert.equal((await state(page)).paused, false, 'typing never triggers wallpaper shortcuts');
    await page.locator('#poem-verses').fill(personal.verses.join('\n'));
    await page.locator('#poem-editor button[type=submit]').click();
    const id = P.normalize(personal).id;
    assert.ok((await state(page)).culture.poems.some(p => p.id === id));
    const count = (await state(page)).culture.poems.length;
    await page.locator('#poem-file').setInputFiles([jsonFile({ ...personal, title: '应该回滚' }, 'valid.json'), jsonFile({ title: 123 }, 'bad.json')]);
    await page.waitForFunction(() => document.getElementById('culture-status').textContent.includes('导入失败'), null, { polling: 100 });
    assert.equal((await state(page)).culture.poems.length, count, 'failed batch is atomic');
    const changed = { ...personal, id, verses: ['明月松间照，清泉石上流。'], enabled: false };
    await page.locator('#poem-file').setInputFiles(jsonFile(changed));
    await page.waitForFunction(id => matrixEcho.getState().culture.poems.some(p => p.id === id && !p.enabled), id, { polling: 100 });
    assert.equal((await state(page)).culture.poems.length, count, 'same ID updates rather than duplicates');
    await page.locator(`[data-poem-id="${id}"]`).getByText('编辑', { exact: true }).click();
    await page.locator('#poem-title').fill('编辑后');
    await page.locator('#poem-editor button[type=submit]').click();
    assert.equal((await state(page)).culture.poems.find(p => p.id === id).enabled, false);
    await page.reload(); await page.waitForFunction(() => window.matrixEcho, null, { polling: 100 });
    assert.equal((await state(page)).culture.poems.find(p => p.id === id).title, '编辑后');
    await page.locator('#culture').click();
    const exported = JSON.parse((await download(page, '#export-poems', 'poems.json')).toString());
    assert.equal(P.collection(exported).length, count);
    const repo = unzip(await download(page, '#export-repository', 'repository.zip'));
    assert.ok(repo.has('content/poems/shan-ju-qiu-ming.json'), 'existing source filename is preserved');
    assert.ok(repo.has(`content/poems/${id}.json`));
    const configured = unzip(await download(page, '#export-wallpaper', 'configured.zip'));
    for (const asset of ['fonts/Seal.woff', 'fonts/WenKai.woff', 'fonts/Yi.woff', 'fonts/Tibetan.woff', 'poems.generated.js', 'settings.js']) assert.ok(configured.has(asset), asset);
    const exportedRoot = path.join(output, 'configured');
    for (const [name, data] of configured) { const target = path.join(exportedRoot, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); }
    const roundtrip = await context(browser, exportedRoot), exportedPage = await open(roundtrip.c);
    assert.equal((await state(exportedPage)).culture.poems.find(p => p.id === id).title, '编辑后');
    assert.equal((await state(exportedPage)).culture.settings.scale, 2.5);
    // Reopen the official assets with the same browser storage, as an update
    // does. Personal overrides and settings from the configured ZIP survive.
    await roundtrip.c.unroute('**/*');
    await roundtrip.c.route('**/*', route => {
      const u = new URL(route.request().url()), file = path.join(source, decodeURIComponent(u.pathname.slice(1)) || 'index.html');
      if (u.origin !== 'https://matrix.test') return route.abort();
      if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff' })[path.extname(file)] || 'application/octet-stream' });
    });
    await exportedPage.reload(); await exportedPage.waitForFunction(() => window.matrixEcho, null, { polling: 100 });
    assert.equal((await state(exportedPage)).culture.poems.find(p => p.id === id).title, '编辑后', 'official update retains personal poems');
    assert.equal((await state(exportedPage)).culture.settings.scale, 2.5);
    assert.deepEqual(roundtrip.errors, []); assert.deepEqual(roundtrip.external, []); await roundtrip.c.close();
    await page.locator('#restore-poems').click(); await page.locator('#confirm-restore').click();
    assert.ok((await state(page)).culture.poems.some(p => p.id === id), 'restore retains personal poems');
    const long = '明月松间照，清泉石上流。'.repeat(10);
    const all = (await state(page)).culture.poems.map(p => ({ ...p, enabled: false }));
    await page.locator('#poem-file').setInputFiles(jsonFile([...all, { title: '长句测试', author: '测试', verses: [long] }]));
    await page.waitForFunction(() => matrixEcho.getState().culture.poems.some(p => p.title === '长句测试'), null, { polling: 100 });
    await page.locator('#next-verse').click(); await page.locator('#close-culture').click();
    for (const viewport of [{ width: 320, height: 480 }, { width: 800, height: 450 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await advance(page, 50);
      assert.equal(await page.locator('#echo-verse').textContent(), long);
      await checkRainVerse(page, long);
    }
    await page.screenshot({ path: path.join(output, 'long-verse-portrait.png') });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 480 }, { width: 390, height: 844 }, { width: 800, height: 450 }]) {
      await page.setViewportSize(viewport);
      await page.locator('#culture').click();
      for (let size = 0; size < 5; size++) {
        await page.locator('#floating-size').click(); await advance(page, 50);
        await checkFloatingDoor(page);
      }
      await page.locator('#close-culture').click();
      for (const point of [{ x: 0, y: 0 }, { x: viewport.width - 1, y: viewport.height - 1 }]) {
        await page.mouse.move(point.x, point.y); await advance(page, 1500);
        await checkFloatingDoor(page);
      }
    }
    await page.screenshot({ path: path.join(output, 'door-clearance.png') });
    await page.setViewportSize({ width: 390, height: 844 }); await advance(page, 50);
    await page.locator('#culture').click(); await page.locator('#poems-toggle').click();
    assert.equal((await state(page)).rainPoem, null, 'poetry switch removes only poetry from the rain');
    assert.equal((await state(page)).culture.floatingCount, 5, 'independent floating characters remain');
    assert.deepEqual(errors, []); assert.deepEqual(external, []); await c.close();
    const reduced = await context(browser, source, { reducedMotion: 'reduce' }), reducedPage = await open(reduced.c);
    await advance(reducedPage, 1000);
    await checkFloatingDoor(reducedPage);
    const before = await reducedPage.locator('.floating-glyph').first().getAttribute('style');
    await advance(reducedPage, 26000);
    assert.equal(await reducedPage.locator('.floating-glyph').first().getAttribute('style'), before, 'reduced motion keeps floating letters stationary');
    await checkFloatingDoor(reducedPage);
    await reduced.c.close();
    console.log('Matrix Echo offline QA passed: full verses, font layers, pause, management, atomic import, persistence, exports, portrait and reduced motion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

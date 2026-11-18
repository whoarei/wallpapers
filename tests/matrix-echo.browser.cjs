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
const G = require('../wallpapers/matrix-echo/glyphs.js');
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
async function context(browser, root = source, options = {}, relayed = false) {
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
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, width, height) {
      if (this.canvas.id === 'matrix' && this.fillStyle === '#010703') {
        window.__doorBounds = { left: x, right: x + width, top: y, bottom: y + height };
      }
      return fillRect.call(this, x, y, width, height);
    };
  });
  if (relayed) await c.addInitScript(() => {
    window.wallpaperHost = Object.freeze({ protocolVersion: 1, mode: 'desktop', instanceId: 'notes-test',
      capabilities: Object.freeze({ pointer: 'relayed', pointerMove: false, keyboard: false, fullscreen: false, pause: false, actions: false }),
      getState: () => ({ paused: false, pauseReason: 'none' }) });
  });
  c.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  return { c, errors, external };
}
const state = (page, full = false) => page.evaluate(full => matrixEcho.getState({ includeLibrary: full }), full);
const contentCount = (page, kind) => page.evaluate(kind => matrixEcho.getState().culture[kind].length, kind);
const contentEntry = (page, kind, id) => page.evaluate(({ kind, id }) => matrixEcho.getState().culture[kind].find(e => e.id === id), { kind, id });
const advance = (page, ms) => page.evaluate(ms => __advance(ms), ms);
async function setViewport(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForFunction(({ width, height }) => {
    const s = matrixEcho.getState();
    return s.width === width && s.height === height;
  }, viewport, { polling: 50 });
}
async function checkPoetryWindow(page, current) {
  const overlay = page.locator('#poetry-echo');
  assert.equal(await overlay.isVisible(), true);
  assert.equal(await page.locator('#echo-verse').textContent(), current.verse);
  assert.equal(current.lines.join(''), current.verse.replaceAll('\n', ''), 'wrapping preserves every character');
  assert.equal(await page.locator('.poetry-line.is-current').textContent(), current.lines[current.lineIndex]);
  const { x, y, width, height } = await overlay.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(x >= 0 && y >= 0 && x + width <= viewport.width && y + height <= viewport.height);
  const hud = await page.locator('.hud').boundingBox();
  assert.ok(Math.abs(x + width - hud.x - hud.width) < 1 && y + height <= hud.y, 'lyrics sit above the bottom-right controls');
  const layout = await page.locator('.poetry-window').evaluate(el => {
    const rows = [...el.querySelectorAll('.poetry-line')];
    return { height: el.getBoundingClientRect().height, rowHeight: rows[0].getBoundingClientRect().height,
      font: getComputedStyle(rows[0]).fontFamily, pointerEvents: getComputedStyle(el).pointerEvents,
      clipped: rows.some(row => row.scrollWidth > row.clientWidth) };
  });
  assert.ok(Math.abs(layout.height - 4 * layout.rowHeight) < .1, 'only four rows fit in the visible window');
  assert.ok(layout.font.includes('MatrixKai'));
  assert.equal(layout.pointerEvents, 'none', 'poetry does not intercept wallpaper clicks');
  assert.equal(layout.clipped, false);
}
async function clickableGlyph(page, script) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const index = await page.locator('.floating-glyph').evaluateAll((els, script) => els.findIndex(el => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el);
      return el.dataset.script === script && style.visibility !== 'hidden' && Number(style.opacity) >= .12 &&
        el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), script);
    if (index >= 0) return page.locator('.floating-glyph').nth(index);
    await advance(page, 1000);
  }
  assert.fail('no clickable glyph for ' + script);
}
async function relayTap(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const r = await locator.boundingBox();
  await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const EventClass = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventClass(type, { bubbles: true, clientX: x, clientY: y }));
    }
  }, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
}
async function checkAnnotations(page, relay = false) {
  for (const script of ['seal', 'kai', 'yi', 'tibetan']) {
    const glyph = await clickableGlyph(page, script), character = await glyph.textContent();
    const before = await state(page);
    if (relay) await relayTap(page, glyph); else await glyph.click();
    assert.equal(await page.locator('#glyph-note').isVisible(), true);
    assert.equal((await state(page)).interactions, before.interactions, 'reading a note does not trigger a background ripple');
    assert.deepEqual((await state(page)).culture.annotation, { script, character });
    assert.ok((await page.locator('#glyph-note-title').textContent()).includes(character));
    assert.ok((await page.locator('#glyph-note-description').textContent()).length > 0);
    await advance(page, 1500);
    assert.equal(await glyph.textContent(), character, 'the annotated character remains unchanged while being read');
    const bounds = await page.locator('#glyph-note').boundingBox(), viewport = page.viewportSize();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
    if (script === 'seal') await page.screenshot({ path: path.join(output, `glyph-note-${relay ? 'desktop' : 'browser'}-${viewport.width}.png`) });
    if (relay) await relayTap(page, page.locator('#close-glyph-note')); else await page.locator('#close-glyph-note').click();
    assert.equal(await page.locator('#glyph-note').isVisible(), false);
    await page.evaluate(() => document.activeElement?.blur());
  }
  const glyph = await clickableGlyph(page, 'kai');
  if (relay) await relayTap(page, glyph); else { await glyph.focus(); await page.keyboard.press('Enter'); }
  await page.mouse.click(page.viewportSize().width - 2, page.viewportSize().height - 2);
  assert.equal(await page.locator('#glyph-note').isVisible(), false, 'clicking blank space dismisses the note');
  if (!relay) {
    await glyph.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#glyph-note').isVisible(), false, 'Escape dismisses the note');
    assert.equal(await glyph.evaluate(el => el === document.activeElement), true, 'closing restores keyboard focus');
    await glyph.evaluate(el => el.blur());
  }
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
let deer, deerId;
async function checkGlyphLibrary(page) {
  await page.locator('#tab-glyphs').click();
  const initial = (await contentCount(page, 'glyphs'));
  assert.ok(initial >= 60);
  const fixture = await page.evaluate(() => {
    const glyphs = matrixEcho.getState().culture.glyphs, coverage = MATRIX_GLYPH_COVERAGE.seal;
    const used = new Set(glyphs.filter(e => e.script === 'seal').map(e => e.character)), free = [];
    for (const ch of ['鹿', '林']) if (!used.has(ch) && coverage.some(([a, b]) => a <= ch.codePointAt(0) && ch.codePointAt(0) <= b)) free.push(ch);
    for (const [a, b] of coverage) for (let cp = a; cp <= b && free.length < 2; cp++) {
      const ch = String.fromCodePoint(cp); if (!used.has(ch) && !free.includes(ch)) free.push(ch);
    }
    return { free, full: glyphs.length >= MatrixGlyphs.limits.entries || free.length < 2, existing: glyphs.find(e => e.script === 'seal' && e.enabled) || glyphs.find(e => e.script === 'seal') };
  });
  deer = fixture.full ? { ...fixture.existing } : { script: 'seal', character: fixture.free[0], reading: fixture.free[0] === '鹿' ? 'lù' : '' };
  deer.description = '这是个人扩充的悬浮文字。\n这是个人添加的注释。';
  deerId = deer.id || G.identity(deer.script, deer.character);
  const expectedCount = initial + (fixture.full ? 0 : 1);
  if (fixture.full) {
    await page.locator('#glyph-search').fill(deerId);
    await page.locator(`[data-glyph-id="${deerId}"]`).getByText('编辑', { exact: true }).click();
  }
  else await page.locator('#add-glyph').click();
  await page.locator('#glyph-script').selectOption(deer.script);
  await page.locator('#glyph-character').fill(deer.character);
  await page.locator('#glyph-reading').fill(deer.reading);
  await page.locator('#glyph-description').fill(deer.description);
  await page.locator('#glyph-editor button[type=submit]').click();
  assert.equal((await contentCount(page, 'glyphs')), expectedCount);
  const row = page.locator(`[data-glyph-id="${deerId}"]`);
  await row.getByText('已启用', { exact: true }).click();
  await row.getByText('编辑', { exact: true }).click();
  await page.locator('#glyph-description').fill('编辑后的鹿。');
  await page.locator('#glyph-editor button[type=submit]').click();
  assert.equal((await contentEntry(page, 'glyphs', deerId)).enabled, false, 'editing preserves the entry enable state');
  const forest = fixture.full ? { ...fixture.existing, description: '这条记录应随无效文件一起回滚。' } : { script: 'seal', character: fixture.free[1], description: '这条记录应随无效文件一起回滚。' };
  const forestBefore = (await page.evaluate(forest => matrixEcho.getState().culture.glyphs.find(e => e.script === forest.script && e.character === forest.character)?.description, forest));
  await page.locator('#glyph-file').setInputFiles([jsonFile(forest, 'valid-glyph.json'), jsonFile({ ...deer, character: '𠀀' }, 'missing-font.json')]);
  await page.waitForFunction(() => document.getElementById('culture-status').textContent.includes('悬浮文字库未更改'), null, { polling: 100 });
  assert.equal((await contentCount(page, 'glyphs')), expectedCount, 'invalid font coverage rolls back the whole batch');
  assert.equal((await page.evaluate(forest => matrixEcho.getState().culture.glyphs.find(e => e.script === forest.script && e.character === forest.character)?.description, forest)), forestBefore);
  await page.locator('#glyph-file').setInputFiles(jsonFile({ ...deer, id: deerId }));
  await page.waitForFunction(id => matrixEcho.getState().culture.glyphs.find(e => e.id === id)?.enabled, deerId, { polling: 100 });
  assert.equal((await contentCount(page, 'glyphs')), expectedCount, 'same ID updates rather than duplicates');
  await page.locator('#glyph-search').fill('glyph-kai-5c71');
  await page.locator('[data-glyph-id="glyph-kai-5c71"]').getByText('删除', { exact: true }).click();
  await page.locator('#restore-glyphs').click(); await page.locator('#confirm-glyph-restore').click();
  assert.ok(Boolean(await contentEntry(page, 'glyphs', deerId)), 'restore preserves personal glyphs');
  assert.ok(Boolean(await contentEntry(page, 'glyphs', 'glyph-kai-5c71')));
  if (fixture.full) {
    await page.locator('#glyph-file').setInputFiles(jsonFile({ ...deer, id: deerId, enabled: true }));
    await page.waitForFunction(({ id, description }) => matrixEcho.getState().culture.glyphs.find(e => e.id === id)?.description === description,
      { id: deerId, description: deer.description }, { polling: 100 });
  }
  await page.locator('#glyph-count').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'glyph-library.png') });
  const exported = JSON.parse((await download(page, '#export-glyphs', 'glyphs.json')).toString());
  assert.equal(exported.find(e => e.id === deerId).description, deer.description);
  const repository = unzip(await download(page, '#export-glyph-repository', 'glyphs-repository.zip'));
  const filename = await page.evaluate(id => MATRIX_GLYPH_FILES[id] || id + '.json', deerId);
  assert.ok(repository.has(`content/glyphs/${filename}`));
  assert.ok(repository.has('content/glyphs/glyph-kai-5c71.json'));
  await page.locator('#tab-poems').click();
}
async function download(page, selector, name) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  let item;
  try { item = await pending; }
  catch (error) { throw Error(error.message + '\n' + await page.locator('#culture-status').textContent()); }
  const dest = path.join(output, name); await item.saveAs(dest); return fs.readFileSync(dest);
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium', headless: true });
  try {
    const { c, errors, external } = await context(browser), page = await open(c);
    await advance(page, 4100);
    const s = await state(page), verseOverlay = page.locator('#poetry-echo');
    assert.ok(s.culture.current);
    const sourcePoem = await contentEntry(page, 'poems', s.culture.current.id);
    assert.ok(s.culture.current.verse.split('\n').every(verse => sourcePoem.verses.includes(verse)));
    assert.ok((await page.locator('#echo-credit').textContent()).includes(`${sourcePoem.author}《${sourcePoem.title}》`));
    await checkPoetryWindow(page, s.culture.current);
    await page.screenshot({ path: path.join(output, 'scrolling-verse-desktop.png') });
    await page.locator('#speed').click();
    const fasterStart = await state(page); await advance(page, 1000); const fasterEnd = await state(page);
    assert.ok(Math.abs(fasterEnd.time - fasterStart.time - 1) < .001, 'flow control changes the speed of the code rain');
    assert.equal(s.culture.floatingCount, 9);
    await checkFloatingDoor(page);
    assert.deepEqual(new Set(await page.locator('.floating-glyph').evaluateAll(els => els.map(e => getComputedStyle(e).fontFamily))), new Set(['MatrixSeal', 'MatrixKai', 'MatrixYi', 'MatrixTibetan']));
    await page.locator('#pause').click(); const paused = await state(page);
    const transform = await page.locator('.floating-glyph').first().getAttribute('style');
    await advance(page, 5000);
    assert.equal((await state(page)).culture.clock, paused.culture.clock);
    assert.deepEqual((await state(page)).culture.current, paused.culture.current, 'pause preserves the current verse');
    assert.equal(await page.locator('.floating-glyph').first().getAttribute('style'), transform);
    await page.locator('#pause').click();
    await checkAnnotations(page);
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
    assert.ok(Boolean(await contentEntry(page, 'poems', id)));
    const count = (await contentCount(page, 'poems'));
    await page.locator('#poem-file').setInputFiles([jsonFile({ ...personal, title: '应该回滚' }, 'valid.json'), jsonFile({ title: 123 }, 'bad.json')]);
    await page.waitForFunction(() => document.getElementById('culture-status').textContent.includes('导入失败'), null, { polling: 100 });
    assert.equal((await contentCount(page, 'poems')), count, 'failed batch is atomic');
    const changed = { ...personal, id, verses: ['明月松间照，清泉石上流。'], enabled: false };
    await page.locator('#poem-file').setInputFiles(jsonFile(changed));
    await page.waitForFunction(id => matrixEcho.getState().culture.poems.some(p => p.id === id && !p.enabled), id, { polling: 100 });
    assert.equal((await contentCount(page, 'poems')), count, 'same ID updates rather than duplicates');
    await page.locator(`[data-poem-id="${id}"]`).getByText('编辑', { exact: true }).click();
    await page.locator('#poem-title').fill('编辑后');
    await page.locator('#poem-editor button[type=submit]').click();
    assert.equal((await contentEntry(page, 'poems', id)).enabled, false);
    await checkGlyphLibrary(page);
    await page.reload(); await page.waitForFunction(() => window.matrixEcho, null, { polling: 100 });
    assert.equal((await contentEntry(page, 'poems', id)).title, '编辑后');
    assert.equal((await contentEntry(page, 'glyphs', deerId)).description, deer.description, 'glyphs and notes persist after reload');
    await page.locator('#culture').click();
    const exported = JSON.parse((await download(page, '#export-poems', 'poems.json')).toString());
    assert.equal(P.collection(exported).length, count);
    const repo = unzip(await download(page, '#export-repository', 'repository.zip'));
    assert.ok(repo.has('content/poems/shan-ju-qiu-ming.json'), 'existing source filename is preserved');
    assert.ok(repo.has(`content/poems/${id}.json`));
    const configured = unzip(await download(page, '#export-wallpaper', 'configured.zip'));
    for (const entry of ['index.html', 'settings.html']) {
      for (const match of configured.get(entry).toString().matchAll(/(?:src|href)="([^"#]+)"/g)) {
        if (!match[1].startsWith('/')) assert.ok(configured.has(match[1]), `configured ${entry} retains ${match[1]}`);
      }
    }
    for (const asset of ['fonts/Seal.woff', 'fonts/WenKai.woff', 'fonts/Yi.woff', 'fonts/Tibetan.woff', 'poems.generated.js', 'settings.js', 'glyphs.js', 'glyphs.generated.js', 'glyph-library.js', 'culture-config.js', 'settings.html', 'settings-page.js', 'settings-page.css']) assert.ok(configured.has(asset), asset);
    const exportedRoot = path.join(output, 'configured');
    for (const [name, data] of configured) { const target = path.join(exportedRoot, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); }
    const roundtrip = await context(browser, exportedRoot), exportedPage = await open(roundtrip.c);
    assert.equal((await contentEntry(exportedPage, 'poems', id)).title, '编辑后');
    assert.equal((await state(exportedPage)).culture.settings.scale, 2.5);
    assert.equal((await contentEntry(exportedPage, 'glyphs', deerId)).description, deer.description);
    await exportedPage.locator('#culture').click(); await exportedPage.locator('#tab-glyphs').click();
    const onlyDeer = (await state(exportedPage, true)).culture.glyphs.map(e => ({ ...e, enabled: e.id === deerId }));
    await exportedPage.locator('#glyph-file').setInputFiles(jsonFile(onlyDeer));
    await exportedPage.waitForFunction(id => matrixEcho.getState().culture.glyphs.filter(e => e.enabled).every(e => e.id === id), deerId, { polling: 100 });
    await exportedPage.locator('#close-culture').click(); await advance(exportedPage, 2000);
    const customGlyph = await clickableGlyph(exportedPage, 'seal'); await customGlyph.click();
    assert.ok((await exportedPage.locator('#glyph-note-description').textContent()).includes('个人添加的注释'), 'configured ZIP renders personal glyph annotations offline');
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
    assert.equal((await contentEntry(exportedPage, 'poems', id)).title, '编辑后', 'official update retains personal poems');
    assert.equal((await state(exportedPage)).culture.settings.scale, 2.5);
    assert.equal((await contentEntry(exportedPage, 'glyphs', deerId)).description, deer.description, 'official updates retain personal glyphs');
    assert.deepEqual(roundtrip.errors, []); assert.deepEqual(roundtrip.external, []); await roundtrip.c.close();
    await page.locator('#restore-poems').click(); await page.locator('#confirm-restore').click();
    assert.ok(Boolean(await contentEntry(page, 'poems', id)), 'restore retains personal poems');
    const long = '浔阳江头夜送客，枫叶荻花秋瑟瑟。主人下马客在船，举酒欲饮无管弦。醉不成欢惨将别，别时茫茫江浸月。忽闻水上琵琶声，主人忘归客不发。寻声暗问弹者谁？琵琶声停欲语迟。移船相近邀相见，添酒回灯重开宴。千呼万唤始出来，犹抱琵琶半遮面。';
    const excerpt = { title: '琵琶行（节选）', author: '白居易', dynasty: '唐', verses: [long] };
    const all = (await state(page, true)).culture.poems.map(p => ({ ...p, enabled: false }));
    await page.locator('#poem-file').setInputFiles(jsonFile([...all, excerpt]));
    await page.waitForFunction(id => matrixEcho.getState().culture.poems.some(p => p.id === id && p.enabled), P.normalize(excerpt).id, { polling: 100 });
    await page.locator('#next-verse').click(); await page.locator('#close-culture').click();
    for (const viewport of [{ width: 320, height: 180 }, { width: 320, height: 480 }, { width: 800, height: 450 }, { width: 390, height: 844 }]) {
      await setViewport(page, viewport); await advance(page, 50);
      const { current } = (await state(page)).culture;
      assert.equal(current.verse, long);
      assert.ok(current.lines.length > 4);
      await checkPoetryWindow(page, current);
    }
    const beforeScroll = (await state(page)).culture;
    const timeToScroll = beforeScroll.current.lineStarted + beforeScroll.current.lineHold - beforeScroll.clock;
    const track = page.locator('#poetry-track');
    const startPosition = await track.boundingBox();
    await advance(page, timeToScroll * 1000 + 220);
    const scrollingPosition = await track.boundingBox();
    assert.ok(scrollingPosition.y < startPosition.y, 'the track scrolls upward');
    await page.locator('#pause').click();
    await advance(page, 1000);
    assert.deepEqual(await track.boundingBox(), scrollingPosition, 'pause freezes the track mid-scroll');
    await page.locator('#pause').click();
    await advance(page, 650);
    const afterScroll = (await state(page)).culture.current;
    assert.equal(afterScroll.lineIndex, beforeScroll.current.lineIndex + 1);
    assert.deepEqual(await track.boundingBox(), startPosition, 'one new row settles into the four-row window');
    await checkPoetryWindow(page, afterScroll);
    await page.locator('#culture').click();
    await page.locator('#next-verse').click();
    await page.locator('#close-culture').click();
    assert.equal((await state(page)).culture.current.lineIndex, afterScroll.lineIndex + 1, 'the next button advances one line');
    await page.screenshot({ path: path.join(output, 'long-verse-portrait.png') });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 480 }, { width: 390, height: 844 }, { width: 800, height: 450 }]) {
      await setViewport(page, viewport);
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
    await setViewport(page, { width: 390, height: 844 }); await advance(page, 50);
    await checkAnnotations(page);
    await page.locator('#culture').click(); await page.locator('#poems-toggle').click();
    assert.equal(await verseOverlay.isVisible(), false, 'poetry can be turned off independently');
    assert.equal((await state(page)).culture.floatingCount, 5, 'independent floating characters remain');
    assert.deepEqual(errors, []); assert.deepEqual(external, []); await c.close();
    const reduced = await context(browser, source, { reducedMotion: 'reduce' }), reducedPage = await open(reduced.c);
    await advance(reducedPage, 6000);
    const reducedVerse = reducedPage.locator('#poetry-echo');
    const reducedBounds = await reducedVerse.boundingBox();
    await advance(reducedPage, 2000);
    assert.deepEqual(await reducedVerse.boundingBox(), reducedBounds, 'reduced motion keeps the verse stationary');
    assert.equal(await reducedPage.locator('#poetry-track').evaluate(el => getComputedStyle(el).transform), 'none', 'reduced motion switches rows without scrolling');
    await checkFloatingDoor(reducedPage);
    const before = await reducedPage.locator('.floating-glyph').first().getAttribute('style');
    await advance(reducedPage, 26000);
    assert.equal(await reducedPage.locator('.floating-glyph').first().getAttribute('style'), before, 'reduced motion keeps floating letters stationary');
    await checkFloatingDoor(reducedPage);
    await reduced.c.close();
    const desktop = await context(browser, source, {}, true), desktopPage = await open(desktop.c);
    await advance(desktopPage, 6000); await checkAnnotations(desktopPage, true);
    await relayTap(desktopPage, desktopPage.locator('#culture')); await relayTap(desktopPage, desktopPage.locator('#tab-glyphs'));
    assert.equal(await desktopPage.locator('#add-glyph').isVisible(), false);
    assert.equal(await desktopPage.locator('#import-glyphs').isVisible(), false);
    const firstId = (await desktopPage.evaluate(() => matrixEcho.getState().culture.glyphs.find(e => e.enabled).id));
    const firstRow = desktopPage.locator(`[data-glyph-id="${firstId}"]`);
    await relayTap(desktopPage, firstRow.getByText('已启用', { exact: true }));
    assert.equal((await contentEntry(desktopPage, 'glyphs', firstId)).enabled, false);
    await relayTap(desktopPage, desktopPage.locator('#restore-glyphs')); await relayTap(desktopPage, desktopPage.locator('#confirm-glyph-restore'));
    assert.equal((await contentEntry(desktopPage, 'glyphs', firstId)).enabled, true);
    assert.deepEqual(desktop.errors, []); assert.deepEqual(desktop.external, []); await desktop.c.close();
    console.log('Matrix Echo offline QA passed: four-row scrolling verses, extensible glyph library, font coverage, notes, atomic imports, persistence, exports, desktop relay, portrait and reduced motion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

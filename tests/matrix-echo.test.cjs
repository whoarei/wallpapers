'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../wallpapers/matrix-echo/poetry.js');
const G = require('../wallpapers/matrix-echo/glyphs.js');
function loadData(kind) {
  const sandbox = { window: {} }, folder = path.join(__dirname, '../wallpapers/matrix-echo');
  vm.runInNewContext(fs.readFileSync(path.join(folder, kind + '.generated.js'), 'utf8'), sandbox);
  const constant = kind === 'poems' ? 'POEM' : 'GLYPH';
  const names = sandbox.window['MATRIX_' + constant + '_CHUNKS'] || [];
  for (const name of names) vm.runInNewContext(fs.readFileSync(path.join(folder, name), 'utf8'), sandbox);
  if (names.length) sandbox.window[kind === 'poems' ? 'MATRIX_POEMS' : 'MATRIX_GLYPHS'] = names.flatMap(name => sandbox.window.MATRIX_DATA_PARTS[name]);
  return sandbox;
}
const glyphSandbox = loadData('glyphs');
const coverage = glyphSandbox.window.MATRIX_GLYPH_COVERAGE;
const glyphs = G.collection(glyphSandbox.window.MATRIX_GLYPHS, coverage);
const findGlyph = (script, character) => glyphs.find(e => e.script === script && e.character === character);
assert.ok(glyphs.length >= 8276);
assert.equal(glyphs.filter(g => g.script === 'kai').length, 3500);
assert.equal(glyphs.filter(g => g.script === 'seal').length, 4752);
assert.match(G.describe(findGlyph('seal', '山')).reading, /对应汉字「山」.*shān/);
assert.match(G.describe(findGlyph('kai', '月')).description, /月亮/);
assert.equal(G.describe(findGlyph('yi', 'ꀀ')).reading, '音节名 · it');
assert.equal(G.describe(findGlyph('tibetan', 'ཀ')).reading, '字母名 · ka');
const personalGlyph = { script: 'seal', character: '鹿', reading: 'lù', description: '鹿科动物。\n常见于山林。' };
assert.equal(G.normalize(personalGlyph, coverage).id, 'glyph-seal-9e7f');
assert.equal(G.normalize(personalGlyph, coverage).description, personalGlyph.description);
for (const patch of [{ script: 'unknown' }, { character: '山水' }, { character: '𠀀' }, { description: '' }, { description: '字'.repeat(601) }, { enabled: 'false' }, { reading: 'a\nb' }, { id: '../escape' }, { script: 'tibetan', character: 'ི' }]) {
  assert.throws(() => G.normalize({ ...personalGlyph, ...patch }, coverage));
}
assert.throws(() => G.collection([personalGlyph, { ...personalGlyph, id: 'another-id' }], coverage), /重复/);
const poem = { title: '山居秋暝', author: '王维', verses: ['明月松间照，清泉石上流。'] };
assert.equal(P.normalize(poem).id, 'poem-d221ffd0');
for (const patch of [{ verses: [] }, { verses: ['山'.repeat(121)] }, { author: 123 }, { dynasty: null }, { enabled: 'false' }, { id: '../escape' }]) {
  assert.throws(() => P.normalize({ ...poem, ...patch }));
}
assert.throws(() => P.collection([poem, poem]), /重复/);
const sandbox = loadData('poems');
const builtins = Array.from(sandbox.window.MATRIX_POEMS, p => P.normalize(p));
assert.ok(builtins.length >= 10000);
assert.equal(builtins.filter(p => p.collection === '诗经').length, 305);
assert.ok(builtins.every(p => p.verses.every(v => /[。？！’”」』]$/.test(v))));
assert.equal(new Set(builtins.map(p => p.id)).size, builtins.length);
assert.ok(builtins.some(p => p.verses.includes('人生如梦，一尊还酹江月。')));
console.log('Matrix poetry: validation, stable IDs, complete built-in verses passed');
const configSandbox = { MatrixPoetry: P, MatrixGlyphs: G, MATRIX_POEMS: builtins, MATRIX_GLYPHS: glyphs, MATRIX_GLYPH_COVERAGE: coverage, MATRIX_LEGACY_GLYPH_IDS: glyphSandbox.window.MATRIX_LEGACY_GLYPH_IDS, TextEncoder };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../wallpapers/matrix-echo/culture-config.js'), 'utf8'), configSandbox);
const C = configSandbox.MatrixCultureConfig;
assert.equal(C.read({}), null);
assert.equal(C.host(), null);
configSandbox.wallpaperHost = { protocolVersion: 1, capabilities: { actions: true, settings: false }, getSettings() { throw Error('must not call'); } };
assert.equal(C.host(), null);
configSandbox.wallpaperHost.capabilities.settings = true;
assert.equal(C.host(), configSandbox.wallpaperHost);
const settings = C.write({ anotherFeature: { keep: true } }, { overrides: [poem] }, 2, 0);
assert.equal(settings.anotherFeature.keep, true);
assert.equal(C.read(settings).culture.overrides[0].title, poem.title);
assert.equal(C.read(settings).speedIndex, 2);
assert.equal(C.bytes({ text: '山' }), Buffer.byteLength(JSON.stringify({ text: '山' })));
assert.throws(() => C.read({ matrixEcho: { version: 2 } }), /格式/);
assert.throws(() => C.read({ matrixEcho: { version: 1, culture: { overrides: [{ title: 'invalid' }] } } }));
console.log('Matrix settings: capability gating, UTF-8 size, namespace validation and full-object preservation passed');

// New builtin characters cannot invalidate older personal IDs or annotations.
const legacy = G.normalize({ id: 'legacy-personal-deer', script: 'seal', character: '鹿', reading: 'lù', description: '升级前的个人注释。' }, coverage);
const migrated = G.merge(glyphs, [legacy]);
assert.equal(migrated.filter(g => g.script === 'seal' && g.character === '鹿').length, 1);
assert.equal(migrated.find(g => g.character === '鹿' && g.script === 'seal').id, legacy.id);
assert.equal(C.culture({ glyphOverrides: [legacy] }).glyphOverrides[0].description, legacy.description);
const automaticLegacy = G.normalize({ ...personalGlyph, description: '扩充前添加的鹿。' }, coverage);
assert.ok(C.culture({ glyphOverrides: [automaticLegacy] }).preservedGlyphIds.includes(automaticLegacy.id));
assert.ok(!C.culture({ contentVersion: 2, glyphOverrides: [automaticLegacy] }).preservedGlyphIds.includes(automaticLegacy.id));
assert.throws(() => G.normalize({ ...personalGlyph, script: 'yi', character: 'ꀕ' }, coverage), /完整字符/);
const L = require('../wallpapers/matrix-echo/library-tools.js');
const deck = L.deck(() => .3), sample = builtins.slice(0, 100);
const firstRound = sample.map(() => deck.next(sample).id);
assert.equal(new Set(firstRound).size, sample.length);
assert.notEqual(deck.next(sample).id, firstRound.at(-1));
const narrowed = sample.slice(0, 3);
assert.ok(narrowed.includes(deck.next(narrowed)));
const compact = C.write({}, { excludedPoemCollections: ['全唐诗选', '宋诗选'], excludedGlyphCollections: ['篆字扩展'] }, 0, 1);
assert.ok(C.bytes(compact) < 1024, 'whole collection switches never serialize builtin text');
assert.equal(C.read(compact).culture.excludedPoemCollections.length, 2);
assert.equal(P.normalize({ ...poem, collection: '测试选集', tags: ['山水'], source: '原文出处' }).source, '原文出处');
console.log('Matrix corpus: full-size data, provenance, legacy IDs, fair rotation and compact collection settings passed');

const unchanged = C.write({}, { overrides: builtins, glyphOverrides: glyphs }, 0, 1);
assert.equal(unchanged.matrixEcho.culture.overrides.length, 0);
assert.equal(unchanged.matrixEcho.culture.glyphOverrides.length, 0);
assert.ok(C.bytes(unchanged) < 1024, 'reimporting an unchanged full backup does not consume personal configuration capacity');
const editedDeck = L.deck(() => .3), oldEntries = [{ id: 'one', text: 'old' }, { id: 'two', text: 'old' }];
editedDeck.next(oldEntries);
assert.equal(editedDeck.next(oldEntries.map(e => ({ ...e, text: 'updated' }))).text, 'updated', 'queued IDs resolve to newly edited content');

assert.ok(builtins.filter(p => p.collection === '楚辞' && p.author === '刘向').every(p => p.dynasty === '汉'));
assert.ok(builtins.filter(p => p.collection === '花间集' && p.author === '温庭筠').every(p => p.dynasty === '唐'));

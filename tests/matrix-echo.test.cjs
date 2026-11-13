'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../wallpapers/matrix-echo/poetry.js');
const G = require('../wallpapers/matrix-echo/glyphs.js');
const glyphSandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../wallpapers/matrix-echo/glyphs.generated.js'), 'utf8'), glyphSandbox);
const coverage = glyphSandbox.window.MATRIX_GLYPH_COVERAGE;
const glyphs = G.collection(glyphSandbox.window.MATRIX_GLYPHS, coverage);
const findGlyph = (script, character) => glyphs.find(e => e.script === script && e.character === character);
assert.ok(glyphs.length >= 60);
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
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../wallpapers/matrix-echo/poems.generated.js'), 'utf8'), sandbox);
const builtins = Array.from(sandbox.window.MATRIX_POEMS, p => P.normalize(p));
assert.ok(builtins.length >= 6);
assert.ok(builtins.every(p => p.verses.every(v => /[。？！]$/.test(v))));
assert.equal(new Set(builtins.map(p => p.id)).size, builtins.length);
assert.ok(builtins.some(p => p.verses.includes('人生如梦，一尊还酹江月。')));
console.log('Matrix poetry: validation, stable IDs, complete built-in verses passed');

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../wallpapers/matrix-echo/poetry.js');
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

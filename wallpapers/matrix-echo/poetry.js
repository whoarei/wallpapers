/* Shared poem format for the manager, imports, and generated repository data. */
(function (root) {
  'use strict';
  const limits = Object.freeze({ poems: 500, verses: 128, verse: 120, bytes: 2 * 1024 * 1024 });
  function text(value, field, max, optional = false) {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || (!optional && !value.trim()) ||
        Array.from(value).length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
      throw new Error(`${field}须为${optional ? '不超过' : '非空且不超过'} ${max} 字的单行文字。`);
    }
    return value.trim();
  }
  function identity(title, author) {
    let hash = 2166136261;
    for (const ch of title + '\n' + author) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619) >>> 0;
    return 'poem-' + hash.toString(16).padStart(8, '0');
  }
  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('每首诗词须为一个对象。');
    const title = text(value.title, '篇名', 80), author = text(value.author, '作者', 40);
    const dynasty = text(value.dynasty, '朝代', 20, true);
    const id = value.id === undefined ? identity(title, author) : value.id;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('id 须为 1–64 位小写字母、数字或连字符。');
    if (!Array.isArray(value.verses) || !value.verses.length || value.verses.length > limits.verses) throw new Error('verses 须包含 1–128 条完整诗句。');
    const verses = value.verses.map((v, i) => text(v, `第 ${i + 1} 条诗句`, limits.verse));
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error('enabled 须为 true 或 false。');
    return { id, title, author, dynasty, verses, enabled: value.enabled !== false };
  }
  function collection(value) {
    const values = Array.isArray(value) ? value : [value];
    if (!values.length || values.length > limits.poems) throw new Error('一次可导入 1–500 首诗词。');
    const ids = new Set();
    return values.map(value => {
      const poem = normalize(value);
      if (ids.has(poem.id)) throw new Error(`重复的诗词 id：${poem.id}`);
      ids.add(poem.id); return poem;
    });
  }
  const api = Object.freeze({ normalize, collection, identity, limits });
  root.MatrixPoetry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

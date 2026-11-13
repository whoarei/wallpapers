(function (root) {
  'use strict';
  const scripts = Object.freeze([
    { id: 'seal', name: '小篆', family: 'MatrixSeal', lang: 'zh', sample: '山' },
    { id: 'kai', name: '楷书', family: 'MatrixKai', lang: 'zh', sample: '山' },
    { id: 'yi', name: '彝文', family: 'MatrixYi', lang: 'ii', sample: 'ꀀ' },
    { id: 'tibetan', name: '藏文', family: 'MatrixTibetan', lang: 'bo', sample: 'ཀ' }
  ]);
  const limits = Object.freeze({ entries: 500, bytes: 2 * 1024 * 1024 });
  const han = [[0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff], [0x20000, 0x323af]];
  function identity(script, character) { return `glyph-${script}-${character.codePointAt(0).toString(16)}`; }
  function normalize(value, coverage = root.MATRIX_GLYPH_COVERAGE) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('每条悬浮文字须为一个对象。');
    const script = scripts.find(s => s.id === value.script), character = value.character;
    if (!script || typeof character !== 'string' || Array.from(character).length !== 1) throw new Error('请选择字形类型，并填写一个完整汉字、彝文音节或藏文字母。');
    const cp = character.codePointAt(0);
    const valid = ['seal', 'kai'].includes(script.id) ? han.some(([a, b]) => a <= cp && cp <= b) :
      script.id === 'yi' ? cp >= 0xa000 && cp <= 0xa48c : cp >= 0xf40 && cp <= 0xf6c;
    if (!valid) throw new Error(`「${character}」不属于所选${script.name}的完整字符。`);
    if (!coverage?.[script.id]?.some(([a, b]) => a <= cp && cp <= b)) throw new Error(`当前${script.name}字体不包含「${character}」，请选择已有字形或更换文字类型。`);
    const id = value.id === undefined ? identity(script.id, character) : value.id;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('id 须为 1–64 位小写字母、数字或连字符。');
    const reading = value.reading === undefined ? '' : value.reading;
    if (typeof reading !== 'string' || Array.from(reading).length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(reading)) throw new Error('读音或字母名须为不超过 80 字的单行文字。');
    const description = typeof value.description === 'string' ? value.description.replace(/\r\n/g, '\n').trim() : '';
    if (!description || Array.from(description).length > 600 || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(description)) throw new Error('注释须包含 1–600 字，可分段填写。');
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error('enabled 须为 true 或 false。');
    return { id, script: script.id, character, reading: reading.trim(), description, enabled: value.enabled !== false };
  }
  function collection(value, coverage) {
    const values = Array.isArray(value) ? value : [value];
    if (!values.length || values.length > limits.entries) throw new Error('悬浮文字库须包含 1–500 条记录。');
    const ids = new Set(), pairs = new Set();
    return values.map(value => {
      const entry = normalize(value, coverage), pair = entry.script + ':' + entry.character;
      if (ids.has(entry.id) || pairs.has(pair)) throw new Error('存在重复 id，或同一字形类型中有重复字符。');
      ids.add(entry.id); pairs.add(pair); return entry;
    });
  }
  function describe(entry) {
    const script = scripts.find(s => s.id === entry.script);
    const label = ['seal', 'kai'].includes(entry.script) ? `${entry.script === 'seal' ? '对应汉字' : '汉字'}「${entry.character}」` :
      entry.script === 'yi' ? '音节名' : '字母名';
    return { title: `${script.name} · ${entry.character}`,
      reading: entry.reading ? label + ' · ' + entry.reading : ['seal', 'kai'].includes(entry.script) ? label : '', description: entry.description };
  }
  const api = Object.freeze({ scripts, limits, normalize, collection, identity, describe });
  root.MatrixGlyphs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

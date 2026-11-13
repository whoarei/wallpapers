(function (root) {
  'use strict';
  const MAX_BYTES = 32768;
  function culture(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('诗词与文字设置格式无效。');
    const P = root.MatrixPoetry, G = root.MatrixGlyphs;
    const overrides = Array.isArray(value.overrides) && value.overrides.length ? P.collection(value.overrides) : [];
    const glyphOverrides = Array.isArray(value.glyphOverrides) && value.glyphOverrides.length ? G.collection(value.glyphOverrides, root.MATRIX_GLYPH_COVERAGE) : [];
    const ids = value => Array.isArray(value) ? value.filter(id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)).slice(0, 500) : [];
    const poems = new Map((root.MATRIX_POEMS || []).map(p => [p.id, p]));
    overrides.forEach(p => poems.set(p.id, p));
    if (poems.size > P.limits.poems) throw new Error('诗词库最多保存 500 首，包含可恢复的内置作品。');
    const glyphs = new Map((root.MATRIX_GLYPHS || []).map(e => [e.id, e]));
    glyphOverrides.forEach(e => glyphs.set(e.id, e));
    if (glyphs.size) G.collection([...glyphs.values()], root.MATRIX_GLYPH_COVERAGE);
    return { poems: value.poems !== false, floating: value.floating !== false,
      scale: [1, 1.5, 2, 2.5, 3].includes(value.scale) ? value.scale : 2,
      scripts: Array.isArray(value.scripts) ? G.scripts.filter(s => value.scripts.includes(s.id)).map(s => s.id) : G.scripts.map(s => s.id),
      overrides, removed: ids(value.removed), glyphOverrides, glyphRemoved: ids(value.glyphRemoved),
      importSeed: typeof value.importSeed === 'string' ? value.importSeed.slice(0, 80) : '' };
  }
  function host() {
    const value = root.wallpaperHost;
    return value?.protocolVersion === 1 && value.capabilities?.settings === true && typeof value.getSettings === 'function' ? value : null;
  }
  function read(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('主程序配置格式无效。');
    if (!Object.hasOwn(settings, 'matrixEcho')) return null;
    const value = settings.matrixEcho;
    if (!value || value.version !== 1) throw new Error('暂不支持这份矩阵回声配置的格式，请更新壁纸或检查配置。');
    return { culture: culture(value.culture), speedIndex: Number.isInteger(value.speedIndex) && value.speedIndex >= 0 && value.speedIndex < 3 ? value.speedIndex : 0,
      lightIndex: Number.isInteger(value.lightIndex) && value.lightIndex >= 0 && value.lightIndex < 3 ? value.lightIndex : 1 };
  }
  function write(base, value, speedIndex, lightIndex) {
    const clean = culture(value); clean.importSeed = '';
    return { ...base, matrixEcho: { version: 1, culture: clean, speedIndex, lightIndex } };
  }
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  root.MatrixCultureConfig = Object.freeze({ culture, host, read, write, bytes, MAX_BYTES });
})(typeof globalThis !== 'undefined' ? globalThis : this);

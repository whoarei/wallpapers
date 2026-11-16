/* Ordered local script shards also work from file:// and opaque host sandboxes. */
(() => {
  'use strict';
  const groups = [
    { names: window.MATRIX_POEM_CHUNKS || [], target: 'MATRIX_POEMS' },
    { names: window.MATRIX_GLYPH_CHUNKS || [], target: 'MATRIX_GLYPHS' }
  ];
  const names = groups.flatMap(g => g.names);
  const ready = (async () => {
    // Bound parallel requests and commit only a complete, ordered collection.
    let cursor = 0;
    async function worker() {
      while (cursor < names.length) {
        const name = names[cursor++];
        if (!/^data\/(poems|glyphs)-\d{4}\.js$/.test(name)) throw Error('内容分片路径无效。');
        await new Promise((resolve, reject) => {
          const script = document.createElement('script'); script.src = name;
          script.onload = () => { script.remove(); resolve(); };
          script.onerror = () => { script.remove(); reject(Error('无法读取离线内容：' + name)); };
          document.head.append(script);
        });
        if (!Array.isArray(window.MATRIX_DATA_PARTS?.[name])) throw Error('内容分片格式无效：' + name);
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, names.length) }, worker));
    for (const group of groups) if (group.names.length) {
      window[group.target] = group.names.flatMap(name => window.MATRIX_DATA_PARTS[name]);
    }
    delete window.MATRIX_DATA_PARTS;
  })();
  // A startup consumer reports failure; suppress an early unhandled rejection.
  ready.catch(() => {});
  window.MatrixContent = Object.freeze({ ready, files: Object.freeze(names) });
})();

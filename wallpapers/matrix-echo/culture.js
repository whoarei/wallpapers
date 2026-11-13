(() => {
  'use strict';
  const P = window.MatrixPoetry;
  const scripts = [
    { id: 'seal', name: '小篆', family: 'MatrixSeal', lang: 'zh', glyphs: Array.from('山水天地日月星云风雨春秋江海松竹清明') },
    { id: 'kai', name: '楷书', family: 'MatrixKai', lang: 'zh', glyphs: Array.from('山水天地日月星云风雨春秋江海松竹清明') },
    { id: 'yi', name: '彝文', family: 'MatrixYi', lang: 'ii', glyphs: Array.from('ꀀꀁꀂꀃꀄꀅꀆꀇꀈꀉꀊꀋ') },
    // Complete base letters; combining marks are never sampled in isolation.
    { id: 'tibetan', name: '藏文', family: 'MatrixTibetan', lang: 'bo', glyphs: Array.from('ཀཁགངཅཆཇཉཏཐདན') }
  ];
  function create(runtime, wake, redraw = () => {}) {
    const $ = id => document.getElementById(id);
    const builtins = Array.isArray(window.MATRIX_POEMS) && !window.MATRIX_POEMS.length ? [] : P.collection(window.MATRIX_POEMS);
    const original = new Map(builtins.map(p => [p.id, p]));
    const defaults = window.MATRIX_DEFAULTS || {};
    const key = 'matrix-echo.culture.v1:official';
    let storageAvailable = true, initialWarning = '';
    function clean(value) {
      if (!value || typeof value !== 'object') throw new Error('设置格式无效');
      const overrides = Array.isArray(value.overrides) && value.overrides.length ? P.collection(value.overrides) : [];
      const removed = Array.isArray(value.removed) ? value.removed.filter(id => typeof id === 'string').slice(0, 500) : [];
      return { poems: value.poems !== false, floating: value.floating !== false,
        scale: [1, 1.5, 2, 2.5, 3].includes(value.scale) ? value.scale : 2,
        scripts: Array.isArray(value.scripts) ? scripts.filter(s => value.scripts.includes(s.id)).map(s => s.id) : scripts.map(s => s.id),
        overrides, removed, importSeed: typeof value.importSeed === 'string' ? value.importSeed.slice(0, 80) : '' };
    }
    let settings = clean(defaults);
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = clean(JSON.parse(saved));
        if (!settings.importSeed || parsed.importSeed === settings.importSeed) settings = parsed;
      }
    }
    catch { storageAvailable = false; initialWarning = '本地设置未能读取，已使用内置诗词；可导出文件保留本次修改。'; }
    let clock = 0, due = 4, current = null, cursor = 0, serial = 0, editId = null;
    let selectedFloat = null;
    let viewport = { width: innerWidth, height: innerHeight, x: 0, y: 0, door: null };
    const verseCursors = new Map(), fontReady = new Set(), floats = [];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function library() {
      const merged = new Map(builtins.map(p => [p.id, p]));
      settings.overrides.forEach(p => merged.set(p.id, p));
      settings.removed.forEach(id => merged.delete(id));
      return [...merged.values()];
    }
    function notify(message) { $('culture-status').textContent = message; }
    function save() {
      try { localStorage.setItem(key, JSON.stringify(settings)); storageAvailable = true; }
      catch { storageAvailable = false; notify('本次修改已应用，但当前环境无法保存。请导出文件备份。'); }
    }
    function resetVerse() { current = null; due = clock + 2; $('echo-verse').textContent = ''; $('echo-credit').textContent = ''; }
    function mutate(message, reset = true) {
      if (message) notify(message);
      save(); if (reset) resetVerse(); renderManager(); wake(); paint(); redraw();
    }
    function next() {
      const active = library().filter(p => p.enabled);
      if (!settings.poems || !active.length) { resetVerse(); return; }
      const poem = active[cursor++ % active.length];
      const verseIndex = (verseCursors.get(poem.id) || 0) % poem.verses.length;
      verseCursors.set(poem.id, verseIndex + 1);
      const verse = poem.verses[verseIndex];
      current = { id: poem.id, verse, born: clock, serial: ++serial };
      // Accessible transcript only; visible verses are painted in the code rain.
      $('echo-verse').textContent = verse;
      $('echo-credit').textContent = `—— ${poem.dynasty ? '[' + poem.dynasty + '] ' : ''}${poem.author}《${poem.title}》`;
    }
    function finishVerse(finishedSerial) {
      if (current?.serial !== finishedSerial) return;
      resetVerse(); due = clock + 6;
    }
    function rebuildFloats() {
      closeNote();
      $('floating-script').replaceChildren(); floats.length = 0;
      const available = scripts.filter(s => settings.scripts.includes(s.id) && fontReady.has(s.id));
      if (!available.length || !settings.floating) return;
      const count = viewport.width < 650 ? 5 : 9;
      for (let i = 0; i < count; i++) {
        const script = available[i % available.length], el = document.createElement('button');
        el.type = 'button'; el.dataset.script = script.id;
        el.className = 'floating-glyph'; el.lang = script.lang; el.style.fontFamily = script.family;
        el.setAttribute('aria-haspopup', 'dialog'); el.setAttribute('aria-controls', 'glyph-note'); el.setAttribute('aria-expanded', 'false');
        el.textContent = script.glyphs[(i * 7 + Math.floor(clock / 25)) % script.glyphs.length];
        $('floating-script').append(el);
        const f = { el, script, i, cycle: -1 };
        el.addEventListener('click', event => { event.stopPropagation(); selectedFloat === f ? closeNote(true) : showNote(f); });
        el.addEventListener('focus', () => { f.focusedAt = clock; paint(); });
        el.addEventListener('blur', () => { f.focusedAt = null; paint(); });
        floats.push(f);
      }
    }
    function closeNote(restoreFocus = false) {
      const previous = selectedFloat;
      if (!previous) return;
      selectedFloat = null; previous.selectedAt = null;
      previous.el.setAttribute('aria-expanded', 'false'); $('glyph-note').hidden = true;
      if (restoreFocus && runtime.capabilities.keyboard && previous.el.isConnected) previous.el.focus();
      paint(); wake();
    }
    function showNote(f) {
      const note = window.MatrixGlyphNotes.describe(f.script.id, f.el.textContent);
      if (!note) return;
      closeNote(); selectedFloat = f; f.selectedAt = clock;
      f.el.setAttribute('aria-expanded', 'true');
      $('glyph-note-title').textContent = note.title;
      $('glyph-note-title').style.fontFamily = `${f.script.family}, sans-serif`;
      $('glyph-note-reading').textContent = note.reading;
      $('glyph-note-description').textContent = note.description;
      $('glyph-note').hidden = false; paint(); wake();
      if (runtime.capabilities.keyboard) $('close-glyph-note').focus();
    }
    function positionNote() {
      if (!selectedFloat) return;
      const { width, height, door } = viewport;
      const r = selectedFloat.el.getBoundingClientRect(), note = $('glyph-note');
      const w = note.offsetWidth, h = note.offsetHeight, gap = 12;
      const candidates = [{ x: r.right + gap, y: r.top }, { x: r.left - w - gap, y: r.top },
        { x: r.left, y: r.bottom + gap }, { x: r.left, y: r.top - h - gap },
        { x: gap, y: gap }, { x: gap, y: height - h - gap }]
        .map(p => ({ x: Math.max(gap, Math.min(width - w - gap, p.x)), y: Math.max(gap, Math.min(height - h - gap, p.y)) }));
      const position = candidates.find(p => !door || p.x + w <= door.cx - door.dw / 2 - 26 ||
        p.x >= door.cx + door.dw / 2 + 26 || p.y + h <= door.top - 26 || p.y >= door.floor + 26) || candidates[0];
      note.style.left = `${position.x}px`; note.style.top = `${position.y}px`;
    }
    $('close-glyph-note').addEventListener('click', () => closeNote(true));
    document.addEventListener('click', event => {
      if (selectedFloat && !$('glyph-note').contains(event.target) && !event.target.closest('.floating-glyph')) closeNote();
    }, true);
    function floatPosition(px, py, halfWidth, halfHeight, motion = reducedMotion ? 0 : 1) {
      const { width, height, door } = viewport;
      // Reserve the full drift/parallax envelope and text shadow, so a letter
      // can keep floating without jumping aside as it approaches the frame.
      const rx = halfWidth + 14 + motion * 23;
      const ry = halfHeight + 14 + motion * 18;
      if (width < rx * 2 || height < ry * 2) return motion ? floatPosition(px, py, halfWidth, halfHeight, 0) : null;
      px = Math.max(rx, Math.min(width - rx, px));
      py = Math.max(ry, Math.min(height - ry, py));
      if (door) {
        const left = door.cx - door.dw / 2 - 26, right = door.cx + door.dw / 2 + 26;
        const top = door.top - 26, bottom = door.floor + 26;
        if (px + rx > left && px - rx < right && py + ry > top && py - ry < bottom) {
          const candidates = [{ x: left - rx, y: py }, { x: right + rx, y: py },
            { x: px, y: top - ry }, { x: px, y: bottom + ry }]
            .filter(p => p.x >= rx && p.x <= width - rx && p.y >= ry && p.y <= height - ry);
          candidates.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
          if (candidates.length) return { ...candidates[0], motion };
          // Large lettering on narrow screens can stay still in a safe space.
          return motion ? floatPosition(px, py, halfWidth, halfHeight, 0) : null;
        }
      }
      return { x: px, y: py, motion };
    }
    function paint() {
      const { width, height, x, y } = viewport;
      for (const f of floats) {
        const floatClock = f.selectedAt ?? f.focusedAt ?? clock;
        const phase = reducedMotion ? .5 : (floatClock / 24 + f.i * .137) % 1;
        const cycle = reducedMotion ? 0 : Math.floor(floatClock / 24 + f.i * .137);
        const fontSize = 24 * settings.scale * (f.i % 3 === 0 ? 1.2 : 1);
        if (cycle !== f.cycle || fontSize !== f.fontSize) {
          f.cycle = cycle; f.fontSize = fontSize;
          f.el.textContent = f.script.glyphs[(f.i * 7 + cycle * 3) % f.script.glyphs.length];
          f.el.setAttribute('aria-label', `${f.script.name} ${f.el.textContent}，查看注释`);
          f.el.style.fontSize = `${fontSize}px`;
          const bounds = f.el.getBoundingClientRect();
          f.halfWidth = bounds.width / 2; f.halfHeight = bounds.height / 2;
        }
        const fx = .28 + ((f.i * .347 + cycle * .113) % .63);
        const fy = .16 + ((f.i * .193 + cycle * .173) % .57);
        const position = floatPosition(width * fx, height * fy, f.halfWidth, f.halfHeight);
        f.el.style.visibility = position ? 'visible' : 'hidden';
        if (!position) continue;
        const held = f.selectedAt != null || f.focusedAt != null;
        const opacity = held ? .8 : reducedMotion ? .45 : Math.sin(phase * Math.PI) ** 2 * .65;
        f.el.style.opacity = String(opacity);
        f.el.style.pointerEvents = opacity >= .12 ? 'auto' : 'none';
        f.el.tabIndex = runtime.capabilities.keyboard && opacity >= .12 ? 0 : -1;
        const dx = reducedMotion ? 0 : Math.sin(floatClock * .13 + f.i) * 12 + x * 11;
        const dy = reducedMotion ? 0 : Math.cos(floatClock * .11 + f.i) * 10 + y * 8;
        f.el.style.transform = `translate(${position.x + dx * position.motion}px,${position.y + dy * position.motion}px) translate(-50%,-50%)`;
      }
      positionNote();
    }
    function update(dt, width, height, x, y, door) {
      const resized = (viewport.width < 650) !== (width < 650);
      viewport = { width, height, x, y, door }; clock += dt;
      if (resized) rebuildFloats();
      if (!current && clock >= due) { next(); if (!current) due = clock + 5; }
      paint();
    }
    function upsert(poems) {
      const merged = new Map(settings.overrides.map(p => [p.id, p]));
      poems.forEach(p => merged.set(p.id, p));
      const all = new Set([...original.keys(), ...merged.keys()]);
      if (all.size > P.limits.poems) throw new Error('诗词库最多保存 500 首，请先删除部分个人诗词。');
      settings.overrides = [...merged.values()];
      const incoming = new Set(poems.map(p => p.id));
      settings.removed = settings.removed.filter(id => !incoming.has(id));
    }
    function editor(poem = null) {
      if (!runtime.capabilities.keyboard) return;
      editId = poem?.id || null; $('poem-editor').hidden = false;
      $('editor-heading').textContent = poem ? '编辑诗词' : '添加诗词';
      $('poem-title').value = poem?.title || ''; $('poem-author').value = poem?.author || '';
      $('poem-dynasty').value = poem?.dynasty || ''; $('poem-verses').value = poem?.verses.join('\n') || '';
      $('poem-title').focus(); $('poem-editor').scrollIntoView({ block: 'nearest' });
    }
    function button(label, action, pressed) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
      b.addEventListener('click', action); return b;
    }
    function renderManager() {
      $('poems-toggle').textContent = '诗词 · ' + (settings.poems ? '开启' : '关闭');
      $('floating-toggle').textContent = '悬浮文字 · ' + (settings.floating ? '开启' : '关闭');
      $('poems-toggle').setAttribute('aria-pressed', String(settings.poems));
      $('floating-toggle').setAttribute('aria-pressed', String(settings.floating));
      $('floating-size').textContent = `字号 · ${settings.scale} 倍`;
      document.querySelectorAll('[data-script]').forEach(el => { el.checked = settings.scripts.includes(el.dataset.script); });
      const poems = library(), list = $('poem-list'); list.replaceChildren();
      $('poem-count').textContent = `${poems.filter(p => p.enabled).length} / ${poems.length} 首启用`;
      for (const poem of poems) {
        const row = document.createElement('div'); row.className = 'poem-row'; row.dataset.poemId = poem.id;
        const summary = document.createElement('div'), title = document.createElement('b'), detail = document.createElement('p');
        title.textContent = poem.title;
        detail.textContent = `${poem.author} · ${poem.verses.length} 条 · ${original.has(poem.id) ? '内置' : '个人'}`;
        summary.append(title, detail);
        const actions = document.createElement('div'); actions.className = 'row-actions';
        actions.append(button(poem.enabled ? '已启用' : '已停用', () => { upsert([{ ...poem, enabled: !poem.enabled }]); mutate(); }, poem.enabled));
        if (runtime.capabilities.keyboard) actions.append(button('编辑', () => editor(poem)));
        actions.append(button('删除', () => {
          settings.overrides = settings.overrides.filter(p => p.id !== poem.id);
          if (original.has(poem.id) && !settings.removed.includes(poem.id)) settings.removed.push(poem.id);
          if (editId === poem.id) $('poem-editor').hidden = true;
          mutate(`已删除《${poem.title}》。${original.has(poem.id) ? '可通过恢复内置诗词找回。' : ''}`);
        }));
        row.append(summary, actions); list.append(row);
      }
    }
    function togglePanel(open = $('culture-panel').hidden) {
      if (open) closeNote();
      $('culture-panel').hidden = !open; $('culture').setAttribute('aria-expanded', String(open));
      if (runtime.capabilities.keyboard) (open ? $('close-culture') : $('culture')).focus();
      wake();
    }
    $('culture').addEventListener('click', () => togglePanel());
    $('close-culture').addEventListener('click', () => togglePanel(false));
    $('poems-toggle').addEventListener('click', () => { settings.poems = !settings.poems; mutate(); });
    $('floating-toggle').addEventListener('click', () => { settings.floating = !settings.floating; rebuildFloats(); mutate('', false); });
    $('floating-size').addEventListener('click', () => { const values = [1, 1.5, 2, 2.5, 3]; settings.scale = values[(values.indexOf(settings.scale) + 1) % values.length]; mutate('', false); });
    document.querySelectorAll('[data-script]').forEach(el => el.addEventListener('change', () => {
      settings.scripts = [...document.querySelectorAll('[data-script]:checked')].map(el => el.dataset.script);
      rebuildFloats(); mutate('', false);
    }));
    $('next-verse').addEventListener('click', () => {
      if (!library().some(p => p.enabled)) { notify('请先启用或添加一首诗词。'); return; }
      settings.poems = true; next(); mutate('', false);
    });
    $('add-poem').addEventListener('click', () => editor());
    $('cancel-edit').addEventListener('click', () => { $('poem-editor').hidden = true; editId = null; });
    $('poem-editor').addEventListener('submit', event => {
      event.preventDefault(); if (!runtime.capabilities.keyboard) return;
      try {
        const old = library().find(p => p.id === editId);
        const poem = P.normalize({ ...(editId ? { id: editId } : {}), title: $('poem-title').value,
          author: $('poem-author').value, dynasty: $('poem-dynasty').value,
          verses: $('poem-verses').value.split(/\r?\n/).filter(v => v.trim()), enabled: old?.enabled ?? true });
        if (!editId && library().some(p => p.id === poem.id)) throw new Error('相同篇名和作者的诗词已存在，请直接编辑或使用 JSON 导入更新。');
        upsert([poem]); $('poem-editor').hidden = true; editId = null; mutate(`已保存《${poem.title}》。`);
      } catch (error) { notify(error.message); }
    });
    $('restore-poems').addEventListener('click', () => { $('restore-confirm').hidden = false; });
    $('cancel-restore').addEventListener('click', () => { $('restore-confirm').hidden = true; });
    $('confirm-restore').addEventListener('click', () => {
      settings.overrides = settings.overrides.filter(p => !original.has(p.id)); settings.removed = [];
      $('restore-confirm').hidden = true; $('poem-editor').hidden = true; editId = null; mutate('已恢复内置诗词，个人新增诗词已保留。');
    });
    function download(blob, name) {
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    const json = value => JSON.stringify(value, null, 2) + '\n';
    function filename(poem) {
      const existing = window.MATRIX_POEM_FILES?.[poem.id];
      return typeof existing === 'string' && /^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(existing) ? existing : poem.id + '.json';
    }
    const sourceFiles = () => library().map(p => ({ name: `content/poems/${filename(p)}`, data: json(p) }));
    $('export-poems').addEventListener('click', () => { if (runtime.capabilities.keyboard) download(new Blob([json(library())], { type: 'application/json' }), 'matrix-poems.json'); });
    $('export-repository').addEventListener('click', () => {
      if (!runtime.capabilities.keyboard) return;
      download(MatrixArchive.zip(sourceFiles()), 'matrix-poems-repository.zip');
      notify('ZIP 内每首诗词对应一个 JSON，内置作品保留原文件名。将文件加入仓库的 content/poems/，下次发布自动带入。');
    });
    $('import-poems').addEventListener('click', () => { if (runtime.capabilities.keyboard) $('poem-file').click(); });
    $('poem-file').addEventListener('change', async event => {
      if (!runtime.capabilities.keyboard) return;
      const files = [...event.target.files]; event.target.value = '';
      if (!files.length) return;
      try {
        if (files.length > 500 || files.reduce((n, f) => n + f.size, 0) > P.limits.bytes) throw new Error('一次最多导入 500 个文件，总大小不超过 2 MiB。');
        const poems = [], ids = new Set();
        for (const file of files) {
          let entries;
          try { entries = P.collection(JSON.parse((await file.text()).replace(/^\uFEFF/, ''))); }
          catch (error) { throw new Error(`${file.name}：${error.message}`); }
          for (const poem of entries) {
            if (ids.has(poem.id)) throw new Error(`${file.name}：本批文件包含重复 id：${poem.id}`);
            ids.add(poem.id); poems.push(poem);
          }
        }
        upsert(poems); mutate(`已导入 ${poems.length} 首诗词，重复 id 已更新。`);
      } catch (error) { notify('导入失败，诗词库未更改。' + error.message); }
    });
    $('export-wallpaper').addEventListener('click', async () => {
      if (!runtime.capabilities.keyboard) return;
      const b = $('export-wallpaper'), snapshot = JSON.parse(JSON.stringify(settings));
      b.disabled = true; notify('正在打包诗词、设置与离线字体…');
      try {
        const names = ['index.html', 'matrix.css', 'matrix.js', 'culture.js', 'glyph-notes.js', 'poetry.js', 'archive.js', 'wallpaper-runtime.js',
          'module.json', 'cover.jpg', 'fonts/Seal.woff', 'fonts/WenKai.woff', 'fonts/Yi.woff', 'fonts/Tibetan.woff',
          'fonts/Seal-OFL.txt', 'fonts/Seal-NOTICE.md', 'fonts/WenKai-OFL.txt', 'fonts/Noto-OFL.txt', 'fonts/NOTICE.md'];
        const files = await Promise.all(names.map(async name => {
          const response = await fetch(new URL(name, location.href));
          if (!response.ok) throw new Error(`无法读取 ${name}`);
          return { name, data: new Uint8Array(await response.arrayBuffer()) };
        }));
        files.push({ name: 'settings.js', data: 'window.MATRIX_DEFAULTS = ' + json({ ...snapshot, importSeed: 'configured-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) }) + ';\n' },
          { name: 'poems.generated.js', data: 'window.MATRIX_POEMS = ' + json(builtins).replace(/</g, '\\u003c') + ';\nwindow.MATRIX_POEM_FILES = ' + json(Object.fromEntries(builtins.map(p => [p.id, filename(p)]))) + ';\n' },
          ...builtins.map(p => ({ name: `content/poems/${filename(p)}`, data: json(p) })));
        download(MatrixArchive.zip(files), 'matrix-echo-configured.zip');
        notify('已导出已配置壁纸。在壁纸盒子的「设置 → 导入壁纸」中导入此 ZIP 即可。');
      } catch (error) { notify(`导出失败：${error.message}。请在独立预览或本地网页服务中重试。`); }
      finally { b.disabled = false; }
    });
    document.addEventListener('keydown', event => {
      if (runtime.capabilities.keyboard && selectedFloat && event.key === 'Escape') {
        event.preventDefault(); closeNote(true); return;
      }
      if (!runtime.capabilities.keyboard || $('culture-panel').hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); togglePanel(false); }
    });
    for (const script of scripts) {
      document.fonts.load(`32px ${script.family}`, script.glyphs.join('')).then(faces => {
        if (!faces.length) throw new Error('font missing');
        fontReady.add(script.id); rebuildFloats(); paint(); if (!runtime.paused) redraw();
      }).catch(() => notify(`${script.name}字体未能加载，请检查壁纸文件是否完整。`));
    }
    // Import a configured package once, then keep its personal additions under
    // the official stable key so later library updates can load them as well.
    renderManager(); if (settings.importSeed) save(); if (initialWarning) notify(initialWarning);
    return Object.freeze({ update, togglePanel, finishVerse, getVerse: () => fontReady.has('kai') && settings.poems ? current : null,
      getState: () => ({ clock, current: current ? { ...current } : null,
      settings: JSON.parse(JSON.stringify(settings)), poems: library(), fontReady: [...fontReady],
      floatingCount: floats.length, annotation: selectedFloat ? { script: selectedFloat.script.id, character: selectedFloat.el.textContent } : null,
      storageAvailable, panelOpen: !$('culture-panel').hidden }) });
  }
  window.MatrixCulture = Object.freeze({ create });
})();

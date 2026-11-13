(() => {
  'use strict';
  const G = window.MatrixGlyphs;
  function create({ runtime, settings, onChange, notify, download, editable = true }) {
    const $ = id => document.getElementById(id);
    const builtins = G.collection(window.MATRIX_GLYPHS), original = new Map(builtins.map(e => [e.id, e]));
    const active = new Map();
    let editId = null;
    function list(overrides = settings.glyphOverrides, removed = settings.glyphRemoved) {
      const merged = new Map(builtins.map(e => [e.id, e]));
      overrides.forEach(e => merged.set(e.id, e)); removed.forEach(id => merged.delete(id));
      return [...merged.values()];
    }
    function filename(entry) {
      const name = window.MATRIX_GLYPH_FILES?.[entry.id];
      return typeof name === 'string' && /^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(name) ? name : entry.id + '.json';
    }
    function sourceFiles(entries = list()) {
      return entries.map(e => ({ name: 'content/glyphs/' + filename(e), data: JSON.stringify(e, null, 2) + '\n' }));
    }
    function refresh(message) {
      const entries = list();
      G.scripts.forEach(s => active.set(s.id, entries.filter(e => e.enabled && e.script === s.id)));
      render(); if (message) onChange(message);
    }
    function upsert(entries) {
      const overrides = new Map(settings.glyphOverrides.map(e => [e.id, e]));
      for (const entry of entries) {
        const builtin = builtins.find(e => e.script === entry.script && e.character === entry.character);
        if (builtin && builtin.id !== entry.id) throw new Error('该字符已有内置 id，请保留导出记录中的 id 以更新注释。');
      }
      entries.forEach(e => overrides.set(e.id, e));
      const reserved = new Map(original); overrides.forEach((entry, id) => reserved.set(id, entry));
      G.collection([...reserved.values()]);
      const incoming = new Set(entries.map(e => e.id)), removed = settings.glyphRemoved.filter(id => !incoming.has(id));
      const prospective = list([...overrides.values()], removed);
      if (prospective.length) G.collection(prospective);
      settings.glyphOverrides = [...overrides.values()]; settings.glyphRemoved = removed;
    }
    function editor(entry = null) {
      if (!runtime.capabilities.keyboard || !editable) return;
      editId = entry?.id || null; $('glyph-editor').hidden = false;
      $('glyph-editor-title').textContent = entry ? '编辑悬浮文字' : '添加悬浮文字';
      $('glyph-script').value = entry?.script || 'kai'; $('glyph-character').value = entry?.character || '';
      $('glyph-reading').value = entry?.reading || ''; $('glyph-description').value = entry?.description || '';
      $('glyph-character').focus(); $('glyph-editor').scrollIntoView({ block: 'nearest' });
    }
    function button(label, action, pressed) {
      const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
      if (pressed !== undefined) el.setAttribute('aria-pressed', String(pressed));
      el.addEventListener('click', action); return el;
    }
    function render() {
      const entries = list(), filter = $('glyph-filter').value, container = $('glyph-list'); container.replaceChildren();
      $('glyph-count').textContent = `${entries.filter(e => e.enabled).length} / ${entries.length} 条启用`;
      for (const entry of entries.filter(e => !filter || e.script === filter)) {
        const script = G.scripts.find(s => s.id === entry.script), row = document.createElement('div');
        row.className = 'poem-row glyph-row'; row.dataset.glyphId = entry.id;
        const summary = document.createElement('div'), title = document.createElement('b'), preview = document.createElement('span'), detail = document.createElement('p'), description = document.createElement('p');
        summary.className = 'glyph-summary'; preview.className = 'glyph-preview'; preview.lang = script.lang;
        preview.style.fontFamily = script.family; preview.textContent = entry.character;
        title.append(preview, document.createTextNode(script.name + ' · ' + (original.has(entry.id) ? '内置' : '个人')));
        detail.textContent = entry.reading || '未填写读音或字母名'; description.textContent = entry.description;
        summary.append(title, detail, description);
        if (!editable) { row.append(summary); container.append(row); continue; }
        const actions = document.createElement('div'); actions.className = 'row-actions';
        actions.append(button(entry.enabled ? '已启用' : '已停用', () => {
          upsert([{ ...entry, enabled: !entry.enabled }]); refresh('已更新悬浮文字的启用状态。');
        }, entry.enabled));
        if (runtime.capabilities.keyboard) actions.append(button('编辑', () => editor(entry)));
        actions.append(button('删除', () => {
          settings.glyphOverrides = settings.glyphOverrides.filter(e => e.id !== entry.id);
          if (original.has(entry.id) && !settings.glyphRemoved.includes(entry.id)) settings.glyphRemoved.push(entry.id);
          if (editId === entry.id) $('glyph-editor').hidden = true;
          refresh(`已删除${script.name}「${entry.character}」。${original.has(entry.id) ? '可通过恢复内置文字找回。' : ''}`);
        }));
        row.append(summary, actions); container.append(row);
      }
      $('glyph-empty').hidden = entries.some(e => !filter || e.script === filter);
    }
    $('glyph-filter').addEventListener('change', render);
    $('add-glyph').addEventListener('click', () => editor());
    $('cancel-glyph-edit').addEventListener('click', () => { editId = null; $('glyph-editor').hidden = true; });
    $('glyph-editor').addEventListener('submit', event => {
      event.preventDefault(); if (!runtime.capabilities.keyboard || !editable) return;
      try {
        const old = list().find(e => e.id === editId);
        const entry = G.normalize({ ...(editId ? { id: editId } : {}), script: $('glyph-script').value,
          character: $('glyph-character').value.trim(), reading: $('glyph-reading').value, description: $('glyph-description').value,
          enabled: old?.enabled ?? true });
        if (!editId && list().some(e => e.id === entry.id || e.script === entry.script && e.character === entry.character)) throw new Error('该类型中已有此字符，请直接编辑或通过 JSON 导入更新。');
        upsert([entry]); editId = null; $('glyph-editor').hidden = true; refresh(`已保存悬浮文字「${entry.character}」。`);
      } catch (error) { notify(error.message); }
    });
    $('import-glyphs').addEventListener('click', () => { if (runtime.capabilities.keyboard && editable) $('glyph-file').click(); });
    $('glyph-file').addEventListener('change', async event => {
      if (!runtime.capabilities.keyboard || !editable) return;
      const files = [...event.target.files]; event.target.value = ''; if (!files.length) return;
      try {
        if (files.length > G.limits.entries || files.reduce((n, f) => n + f.size, 0) > G.limits.bytes) throw new Error('一次最多导入 500 个文件，总大小不超过 2 MiB。');
        const entries = [];
        for (const file of files) {
          try { entries.push(...G.collection(JSON.parse((await file.text()).replace(/^\uFEFF/, '')))); }
          catch (error) { throw new Error(`${file.name}：${error.message}`); }
        }
        G.collection(entries); upsert(entries); refresh(`已导入 ${entries.length} 条悬浮文字，重复 id 已更新。`);
      } catch (error) { notify('导入失败，悬浮文字库未更改。' + error.message); }
    });
    $('export-glyphs').addEventListener('click', () => {
      if (runtime.capabilities.keyboard) download(new Blob([JSON.stringify(list(), null, 2) + '\n'], { type: 'application/json' }), 'matrix-glyphs.json');
    });
    $('export-glyph-repository').addEventListener('click', () => {
      if (!runtime.capabilities.keyboard) return;
      download(MatrixArchive.zip(sourceFiles()), 'matrix-glyphs-repository.zip');
      notify('ZIP 内每条悬浮文字对应一个 JSON。将文件加入 content/glyphs/，下次发布自动带入。');
    });
    $('restore-glyphs').addEventListener('click', () => { $('glyph-restore-confirm').hidden = false; });
    $('cancel-glyph-restore').addEventListener('click', () => { $('glyph-restore-confirm').hidden = true; });
    $('confirm-glyph-restore').addEventListener('click', () => {
      settings.glyphOverrides = settings.glyphOverrides.filter(e => !original.has(e.id)); settings.glyphRemoved = [];
      $('glyph-restore-confirm').hidden = true; $('glyph-editor').hidden = true; editId = null;
      refresh('已恢复内置悬浮文字，个人新增文字已保留。');
    });
    for (const name of ['poems', 'glyphs']) $('tab-' + name).addEventListener('click', () => {
      for (const tab of ['poems', 'glyphs']) {
        $('library-' + tab).hidden = tab !== name;
        $('tab-' + tab).setAttribute('aria-selected', String(tab === name)); $('tab-' + tab).tabIndex = tab === name ? 0 : -1;
      }
    });
    $('library-tabs').addEventListener('keydown', event => {
      if (!runtime.capabilities.keyboard || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const next = $('library-poems').hidden ? $('tab-poems') : $('tab-glyphs'); next.click(); next.focus();
    });
    refresh();
    return Object.freeze({ list, active: script => active.get(script) || [], builtinFiles: () => sourceFiles(builtins),
      reload: () => { editId = null; $('glyph-editor').hidden = true; $('glyph-restore-confirm').hidden = true; refresh(); } });
  }
  window.MatrixGlyphLibrary = Object.freeze({ create });
})();

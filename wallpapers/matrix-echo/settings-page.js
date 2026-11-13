(() => {
  'use strict';
  window.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id), C = window.MatrixCultureConfig;
    const runtime = { capabilities: { keyboard: true, pointer: 'native', pointerMove: false }, paused: true };
    let editor = null, base = {}, draft = null, revision = 0, loaded = false, busy = false, dirty = false, needsReload = false, wasEditing = false;
    const feedback = message => { $('config-feedback').textContent = message; };
    const fail = error => { $('config-error').textContent = String(error.message || error); $('config-error').hidden = false; };
    function payload() { return C.write(base, draft, Number($('config-speed').value), Number($('config-light').value)); }
    function update() {
      const editing = !$('poem-editor').hidden || !$('glyph-editor').hidden;
      let size = 0;
      if (draft) try { size = C.bytes(payload()); } catch (error) { fail(error); }
      const oversized = size > C.MAX_BYTES;
      $('config-capacity').textContent = `配置容量：${(size / 1024).toFixed(1)} / 32 KiB${oversized ? '，请精简内容后再保存。' : ''}`;
      $('config-capacity').classList.toggle('over-limit', oversized);
      $('config-draft-state').textContent = editing ? '请先完成或取消编辑。' : needsReload ? '保存未获确认，请重新读取配置。' : dirty ? '更改尚未保存。' : loaded ? '当前内容与已保存配置一致。' : '';
      if (oversized) { $('config-details').open = true; feedback('配置超过 32 KiB，请精简后保存。'); }
      else if (editing && !busy) feedback('编辑中，请先点击「完成编辑」。');
      else if (wasEditing && !editing && !busy) feedback(dirty ? '更改尚未保存' : '');
      wasEditing = editing;
      $('config-save').disabled = !loaded || busy || !dirty || needsReload || oversized || editing;
      $('config-reload').disabled = busy; $('editor-fields').disabled = busy || !loaded;
    }
    async function load() {
      if (busy) return;
      busy = true; update(); $('config-error').hidden = true; feedback('正在读取主程序配置…');
      try {
        if (!window.wallpaperSettings || typeof wallpaperSettings.load !== 'function') throw new Error('请在壁纸盒子 v0.12.0 或更新版本的「壁纸设置」中打开此页。');
        const snapshot = await wallpaperSettings.load();
        if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error('主程序返回的配置版本无效。');
        const saved = C.read(snapshot.settings);
        const value = saved || { culture: C.culture(window.MATRIX_DEFAULTS || {}), speedIndex: 0, lightIndex: 1 };
        base = snapshot.settings; revision = snapshot.revision;
        if (!editor) editor = window.MatrixCulture.create(runtime, () => {}, () => {}, {
          storage: false, editorOnly: true, initialSettings: value.culture,
          onChange: value => { if (!busy) { draft = value; dirty = true; feedback('更改尚未保存'); update(); } }
        });
        else editor.applySettings(value.culture);
        draft = editor.getState().settings;
        $('config-speed').value = String(value.speedIndex); $('config-light').value = String(value.lightIndex);
        $('poem-editor').querySelector('button[type=submit]').textContent = '完成编辑';
        $('glyph-editor').querySelector('button[type=submit]').textContent = '完成编辑';
        editor.togglePanel(true); $('legacy-settings-hint').hidden = Boolean(saved);
        $('culture-status').textContent = '';
        loaded = true; dirty = !saved; needsReload = false;
        feedback('已读取配置。');
      } catch (error) { fail(error); feedback('未能读取配置，已保留当前草稿。'); }
      finally { busy = false; update(); }
    }
    $('config-save').addEventListener('click', async () => {
      update(); if ($('config-save').disabled) return;
      const settings = payload(); busy = true; update(); $('config-error').hidden = true; feedback('正在保存…');
      try {
        const result = await wallpaperSettings.save(settings, revision), snapshot = result.snapshot;
        if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || !C.read(snapshot.settings)) throw new Error('未能确认保存结果，请重新读取配置。');
        base = snapshot.settings; revision = snapshot.revision; draft = C.read(snapshot.settings).culture;
        editor.applySettings(draft); dirty = false; $('legacy-settings-hint').hidden = true;
        feedback(result.pending ? '已保存，部分窗口将在就绪后同步。' : result.running ? '已保存，已通知正在运行的壁纸。' : '已保存，将在壁纸下次启动时生效。');
      } catch (error) { needsReload = true; fail(error); feedback('更改已保留，请重新读取后再保存。'); }
      finally { busy = false; update(); }
    });
    $('config-reload').addEventListener('click', load);
    for (const id of ['config-speed', 'config-light']) $(id).addEventListener('change', () => { dirty = true; feedback('更改尚未保存'); update(); });
    new MutationObserver(update).observe($('editor-fields'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    $('editor-fields').addEventListener('input', update);
    load();
  }, { once: true });
})();

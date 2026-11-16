/* Bounded list rendering, collection controls and fair, non-repeating decks. */
(function (root) {
  'use strict';
  const PAGE_SIZE = 40;
  const collection = entry => entry.collection || '未分类';
  function deck(random = Math.random) {
    let queue = [], signature = '', last = '';
    return Object.freeze({ next(entries) {
      const current = entries.map(e => e.id).join('\n');
      if (current !== signature || !queue.length) {
        signature = current; queue = entries.map(e => e.id);
        for (let i = queue.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]];
        }
        if (queue.length > 1 && queue.at(-1) === last) [queue[0], queue[queue.length - 1]] = [queue.at(-1), queue[0]];
      }
      const id = queue.pop(); if (id) last = id; return entries.find(e => e.id === id);
    } });
  }
  function create(kind, { render, excluded, toggle, editable = true }) {
    const $ = suffix => document.getElementById(kind + '-' + (suffix === 'dynasty' ? 'dynasty-filter' : suffix));
    let page = 0, timer;
    function options(suffix, values) {
      const select = $(suffix); if (!select) return;
      const all = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
      const signature = all.join('\n'); if (select.dataset.options === signature) return;
      select.dataset.options = signature; const previous = select.value, first = select.options[0].textContent;
      select.replaceChildren(new Option(first, ''), ...all.map(value => new Option(value, value)));
      if (all.includes(previous)) select.value = previous;
    }
    for (const suffix of ['collection', 'dynasty', 'tag', 'filter']) $(suffix)?.addEventListener('change', () => { page = 0; render(); });
    $('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { page = 0; render(); }, 120); });
    $('previous').addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
    $('next').addEventListener('click', () => { page++; render(); });
    $('collection-toggle').addEventListener('click', () => { if (editable && $('collection').value) toggle($('collection').value); });
    return Object.freeze({
      reveal(id) {
        $('search').value = id; page = 0;
        for (const suffix of ['collection', 'dynasty', 'tag', 'filter']) if ($(suffix)) $(suffix).value = '';
      },
      page(entries) {
        options('collection', entries.map(collection)); options('dynasty', entries.map(e => e.dynasty));
        options('tag', entries.flatMap(e => e.tags || []));
        const query = $('search').value.trim().toLocaleLowerCase(), group = $('collection').value;
        const dynasty = $('dynasty')?.value, tag = $('tag')?.value, script = $('filter')?.value;
        const matches = entries.filter(e => (!group || collection(e) === group) && (!dynasty || e.dynasty === dynasty)
          && (!tag || e.tags?.includes(tag)) && (!script || e.script === script)
          && (!query || [e.id, e.title, e.author, e.character, e.reading, e.description, e.collection, e.dynasty,
            ...(e.tags || []), ...(e.verses || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
        const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE)); page = Math.min(page, pages - 1);
        $('page-status').textContent = `${matches.length} 条结果 · 第 ${page + 1} / ${pages} 页`;
        $('previous').disabled = page === 0; $('next').disabled = page + 1 >= pages;
        const button = $('collection-toggle'); button.hidden = !group || !editable;
        button.textContent = excluded().includes(group) ? '启用此选集' : '停用此选集';
        button.setAttribute('aria-pressed', String(!excluded().includes(group)));
        return matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      }
    });
  }
  const api = Object.freeze({ PAGE_SIZE, collection, deck, create });
  root.MatrixLibrary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

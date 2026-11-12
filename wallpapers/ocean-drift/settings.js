(() => {
  'use strict';
  const STORAGE_KEY = 'ocean-drift.preferences.v2';
  const defaults = Object.freeze({
    tourMode: 'auto', fixedZone: 0, tourSpeed: 1, brightness: 1,
    interactionStrength: 1, quietSide: 'none', quality: 'balanced',
    weather: 'auto', daylight: 'auto'
  });
  const choices = {
    tourMode: ['auto', 'fixed'], tourSpeed: [.5, 1, 1.5],
    quietSide: ['none', 'left', 'right'], quality: ['eco', 'balanced', 'high'],
    weather: ['auto', 'clear', 'overcast', 'rain', 'storm'],
    daylight: ['auto', 'day', 'dusk', 'night']
  };
  const bounds = { fixedZone: [0, 2], brightness: [.65, 1.2], interactionStrength: [.4, 1.4] };
  function validated(source, base = defaults) {
    const result = { ...base };
    if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
    for (const key of Object.keys(defaults)) {
      if (choices[key] && choices[key].includes(source[key])) result[key] = source[key];
      else if (bounds[key] && typeof source[key] === 'number' && Number.isFinite(source[key])) {
        const value = Math.max(bounds[key][0], Math.min(bounds[key][1], source[key]));
        result[key] = key === 'fixedZone' ? Math.round(value) : value;
      }
    }
    return result;
  }
  let preferences = { ...defaults };
  try { preferences = validated(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch { /* Storage is optional in wallpaper hosts. */ }
  const panel = document.querySelector('#settings-panel');
  const toggle = document.querySelector('#settings');
  const form = document.querySelector('#ocean-preferences');
  const saved = document.querySelector('#settings-saved');
  let returnFocus = null;
  let savedAnnouncement = 0;
  function sync() {
    if (!form) return;
    for (const [key, value] of Object.entries(preferences)) {
      const input = form.elements.namedItem(key);
      if (input) input.value = String(value);
    }
    document.querySelector('#fixed-zone-row').hidden = preferences.tourMode !== 'fixed';
    document.querySelector('#tour-speed-row').hidden = preferences.tourMode === 'fixed';
    for (const key of ['brightness', 'interactionStrength']) {
      document.querySelector(`#value-${key}`).textContent = `${Math.round(preferences[key] * 100)}%`;
      form.elements.namedItem(key).setAttribute('aria-valuetext', `${Math.round(preferences[key] * 100)}%`);
    }
    document.querySelector('#quality-note').textContent = {
      eco: '减少动态细节与耗电，适合长时间陪伴。',
      balanced: '平衡清晰度与日常运行负担。',
      high: '呈现更多清晰细节，适合高分辨率屏幕。'
    }[preferences.quality];
    panel?.querySelectorAll('[data-cycle]').forEach(button => {
      const input = form.elements.namedItem(button.dataset.cycle);
      button.textContent = input.selectedOptions[0].textContent + ' ↻';
    });
    panel?.querySelectorAll('[data-adjust]').forEach(button => {
      const input = form.elements.namedItem(button.dataset.adjust);
      button.disabled = Number(button.dataset.step) < 0 ? Number(input.value) <= Number(input.min) : Number(input.value) >= Number(input.max);
    });
  }
  function announce(text) {
    if (!saved) return;
    clearTimeout(savedAnnouncement);
    savedAnnouncement = setTimeout(() => { saved.textContent = text; }, 250);
  }
  function dispatch() {
    window.dispatchEvent(new CustomEvent('ocean-preferences-change', { detail: { ...preferences } }));
  }
  function update(patch) {
    preferences = validated(patch, preferences);
    let stored = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); stored = true; } catch { /* Current-window preferences still work. */ }
    sync();
    announce(stored ? '偏好已保存' : '已应用于当前窗口');
    dispatch();
    return { ...preferences };
  }
  function reset() {
    preferences = { ...defaults };
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Optional storage. */ }
    sync(); announce('已恢复默认'); dispatch();
    return { ...preferences };
  }
  window.OceanSettings = Object.freeze({ get: () => ({ ...preferences }), update, reset });

  function setOpen(open, restore = true) {
    if (!panel || !toggle) return;
    if (open === !panel.hidden) return;
    if (open) {
      returnFocus = document.activeElement;
      const help = document.querySelector('#help-panel');
      if (help && !help.hidden) {
        help.hidden = true;
        document.querySelector('#help').setAttribute('aria-expanded', 'false');
      }
    }
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('settings-open', open);
    document.body.classList.remove('idle');
    if (open) document.querySelector('#close-settings').focus();
    else if (restore) (returnFocus?.isConnected && returnFocus !== document.body ? returnFocus : toggle).focus();
  }
  toggle?.addEventListener('click', () => setOpen(panel.hidden));
  document.querySelector('#close-settings')?.addEventListener('click', () => setOpen(false));
  document.querySelector('#help')?.addEventListener('click', () => setOpen(false, false));
  document.querySelector('#reset-preferences')?.addEventListener('click', reset);
  form?.addEventListener('submit', event => event.preventDefault());
  form?.addEventListener('input', event => {
    if (event.target.type !== 'range') return;
    update({ [event.target.name]: Number(event.target.value) });
  });
  form?.addEventListener('change', event => {
    const input = event.target;
    if (input.tagName !== 'SELECT' || !Object.hasOwn(defaults, input.name)) return;
    update({ [input.name]: typeof defaults[input.name] === 'number' ? Number(input.value) : input.value });
  });
  panel?.addEventListener('keydown', event => {
    // Form and button keys belong to the panel, not the scene behind it.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel && !panel.hidden) {
      event.preventDefault(); event.stopImmediatePropagation(); setOpen(false);
    }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (panel && !panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) setOpen(false, false);
  }, true);
  function configureDesktop() {
    if (window.WallpaperRuntime.mode !== 'desktop' || !panel || !form) return;
    // Desktop clicks do not open native selects or provide slider dragging.
    for (const input of form.querySelectorAll('select')) {
      input.hidden = true;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.cycle = input.name; button.className = 'preference-cycle';
      button.setAttribute('aria-label', input.previousElementSibling.textContent + '，点击切换');
      button.addEventListener('click', event => {
        event.preventDefault();
        input.selectedIndex = (input.selectedIndex + 1) % input.options.length;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      input.after(button);
    }
    for (const input of form.querySelectorAll('input[type=range]')) {
      input.hidden = true;
      const group = document.createElement('span'); group.className = 'preference-stepper';
      for (const step of [-1, 1]) {
        const button = document.createElement('button'); button.type = 'button';
        button.dataset.adjust = input.name; button.dataset.step = String(step); button.textContent = step < 0 ? '−' : '+';
        button.setAttribute('aria-label', input.parentElement.querySelector('span').textContent + (step < 0 ? '降低' : '提高'));
        button.addEventListener('click', event => {
          event.preventDefault();
          input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + step * Number(input.step))));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        group.append(button);
      }
      input.after(group);
    }
    const sections = [...form.querySelectorAll('fieldset')];
    const tabs = document.createElement('nav'); tabs.className = 'desktop-preference-tabs'; tabs.setAttribute('aria-label', '偏好分类');
    sections.forEach((section, index) => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = section.querySelector('legend').textContent;
      button.addEventListener('click', () => {
        sections.forEach((item, i) => { item.hidden = i !== index; });
        [...tabs.children].forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)));
      });
      button.setAttribute('aria-pressed', String(index === 0)); section.hidden = index !== 0; tabs.append(button);
    });
    form.before(tabs); sync();
  }
  if (document.readyState === 'complete') configureDesktop();
  else document.addEventListener('DOMContentLoaded', configureDesktop, { once: true });
  sync();
})();

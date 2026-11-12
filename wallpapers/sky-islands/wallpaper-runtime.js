// Shared source; sync_runtime.py copies this file into each standalone package.
(() => {
  'use strict';
  let host = null, mode = 'browser', capabilities = {}, hostPaused = false, userPaused = false;
  const listeners = new Set(), timers = new Set();
  const titles = new WeakMap();
  function stopSceneClick(event) { event.stopPropagation(); }
  function wake() {
    document.body?.classList.remove('idle');
  }
  function applyCapabilities() {
    const root = document.documentElement;
    root.dataset.sceneMode = mode;
    document.querySelectorAll('[data-keyboard]').forEach(el => { el.hidden = !capabilities.keyboard; });
    document.querySelectorAll('[data-native-pointer]').forEach(el => { el.hidden = capabilities.pointer !== 'native'; });
    document.querySelectorAll('[data-fullscreen],#fullscreen').forEach(el => { el.hidden = !capabilities.fullscreen; });
    document.querySelectorAll('[data-desktop-only]').forEach(el => { el.hidden = mode !== 'desktop'; });
    document.querySelectorAll('[data-scene-controls],[data-scene-panel]').forEach(el => el.addEventListener('click', stopSceneClick));
    document.querySelectorAll('[title]').forEach(el => {
      if (!titles.has(el)) titles.set(el, el.title);
      el.title = capabilities.keyboard ? titles.get(el) : titles.get(el).replace(/（[^）]*）/g, '').replace(/；.*$/, '');
    });
    wake();
  }
  function refresh() {
    host = window.wallpaperHost?.protocolVersion === 1 ? window.wallpaperHost : null;
    const legacy = !host && document.documentElement.dataset.screenGardenWallpaper === 'true';
    mode = host?.mode ?? (legacy ? 'desktop' : 'browser');
    capabilities = host ? { ...host.capabilities, fullscreen: Boolean(host.capabilities.fullscreen && document.fullscreenEnabled) } : {
      pointer: legacy ? 'relayed' : 'native', pointerMove: !legacy,
      keyboard: !legacy, fullscreen: !legacy && Boolean(document.fullscreenEnabled), pause: false, actions: false
    };
    hostPaused = Boolean(capabilities.pause && host?.getState().paused);
    applyCapabilities();
  }
  function notify() {
    document.documentElement.dataset.scenePaused = String(runtime.paused);
    for (const listener of listeners) listener();
  }
  function stateChanged() {
    hostPaused = Boolean(capabilities.pause && host?.getState().paused);
    wake(); notify();
  }
  function canAct(options = {}) {
    const occluded = options.allowWhenOccluded === true && hostPaused && host?.getState().pauseReason === 'occluded';
    return !userPaused && (!(hostPaused || document.hidden) || occluded);
  }
  const runtime = Object.freeze({
    refresh,
    canAct,
    get mode() { return mode; },
    get capabilities() { return capabilities; },
    get hostPaused() { return hostPaused; },
    get paused() { return hostPaused || userPaused || document.hidden; },
    setUserPaused(value) { userPaused = Boolean(value); notify(); },
    onStateChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    canIdle() {
      return Boolean(capabilities.pointerMove) &&
        !document.querySelector('[data-scene-panel]:not([hidden]),[data-scene-panel].open') &&
        !(document.activeElement?.matches(':focus-visible') &&
          document.activeElement.closest('.hud,.overlay,.shark-tools,[data-scene-controls]'));
    },
    // Clock tasks stop for both kinds of pause and while the page is hidden.
    everySecond(callback) {
      let timer;
      function sync() {
        clearInterval(timer); timers.delete(timer);
        if (!runtime.paused) { callback(); timer = setInterval(callback, 1000); timers.add(timer); }
      }
      listeners.add(sync); sync();
    },
    registerActions(actions) {
      const replies = new Map();
      const fail = (requestId, code, message) => ({ ok: false, requestId, code, message });
      function disabled(action) {
        if (!canAct(action)) return { code: 'PAUSED', message: '画面已暂停，请先继续。' };
        const reason = action.disabledReason?.();
        return reason ? { code: 'DISABLED', message: reason } : null;
      }
      window.wallpaperApp = Object.freeze({
        protocolVersion: 1,
        getActions() {
          if (!host || !capabilities.actions) return [];
          return actions.map(action => {
            const reason = disabled(action);
            return { id: action.id, label: action.label, enabled: !reason,
              ...(reason ? { disabledReason: reason.message } : {}), allowWhenOccluded: action.allowWhenOccluded === true };
          });
        },
        invoke(request) {
          const id = typeof request?.requestId === 'string' ? request.requestId : '';
          if (!host || !capabilities.actions) return fail(id, 'UNSUPPORTED', '当前环境没有主程序操作能力。');
          if (request?.protocolVersion !== 1 || !id || id.length > 128 ||
              typeof request.instanceId !== 'string' || !request.instanceId || request.instanceId.length > 128 ||
              typeof request.actionId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(request.actionId)) {
            return fail(id, 'INVALID_REQUEST', '调用参数无效。');
          }
          if (request.instanceId !== host.instanceId) return fail(id, 'STALE_INSTANCE', '画面已经切换。');
          const old = replies.get(id);
          if (old) return old.actionId === request.actionId ? JSON.parse(old.result) : fail(id, 'INVALID_REQUEST', '重复请求内容不一致。');
          const action = actions.find(item => item.id === request.actionId);
          const reason = action && disabled(action);
          let result;
          try {
            result = !action ? fail(id, 'UNKNOWN_ACTION', '没有这个操作。') : reason ?
              fail(id, reason.code, reason.message) : { ok: true, requestId: id, data: action.run() };
          } catch {
            result = fail(id, 'RESULT_UNKNOWN', '未能确认操作结果，请查看画面，避免重复操作。');
          }
          const serialized = JSON.stringify(result);
          replies.set(id, { actionId: request.actionId, result: serialized });
          if (replies.size > 128) replies.delete(replies.keys().next().value);
          return JSON.parse(serialized);
        }
      });
    }
  });
  window.WallpaperRuntime = runtime;
  refresh();
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', () => { refresh(); notify(); }, { once: true });
  window.addEventListener('wallpaperhost:statechange', stateChanged);
  document.addEventListener('visibilitychange', () => { wake(); notify(); });
  document.addEventListener('pointermove', wake, { passive: true });
  document.addEventListener('pointerdown', wake, { passive: true });
  // Relayed desktop input does not grant keyboard focus or user activation.
  window.addEventListener('keydown', event => {
    if (!capabilities.keyboard) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-fullscreen],#fullscreen') && !capabilities.fullscreen) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('pagehide', () => { timers.forEach(clearInterval); timers.clear(); }, { once: true });
  const style = document.createElement('style');
  style.textContent = '[hidden]{display:none!important}html[data-scene-paused=true] *,html[data-scene-paused=true] *::before,html[data-scene-paused=true] *::after{animation-play-state:paused!important}';
  document.head.appendChild(style);
})();

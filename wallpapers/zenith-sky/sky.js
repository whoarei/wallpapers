(() => {
  'use strict';
  const M = window.StarMath, data = window.ZENITH_DATA;
  const canvas = document.querySelector('#sky'), ctx = canvas.getContext('2d', { alpha: false });
  const $ = s => document.querySelector(s), KEY = 'zenith-sky.settings.v1:' + String(window.ZENITH_DEFAULTS?.profile || 'official').slice(0, 80);
  // The host may install its CSS/data marker only at DOMContentLoaded, after
  // deferred module scripts. Its input bridge is available from initialization.
  const desktop = document.documentElement.dataset.screenGardenWallpaper === 'true' || typeof window.__SCREEN_GARDEN_DESKTOP_CLICK === 'function';
  document.body.dataset.desktop = String(desktop);
  const example = { name: '上海', latitude: 31.2304, longitude: 121.4737, source: 'example' };
  function validSite(s) { return s && typeof s.latitude === 'number' && typeof s.longitude === 'number' && Number.isFinite(s.latitude) && Number.isFinite(s.longitude) && Math.abs(s.latitude) <= 90 && Math.abs(s.longitude) <= 180; }
  function cleanSite(s) { return { name: String(s.name || '我的观测点').slice(0, 24), latitude: s.latitude, longitude: s.longitude, source: ['example', 'preset', 'manual', 'geolocation'].includes(s.source) ? s.source : 'manual' }; }
  function cleanSettings(s) { return { site: cleanSite(validSite(s?.site) ? s.site : example), lines: typeof s?.lines === 'boolean' ? s.lines : true, names: typeof s?.names === 'boolean' ? s.names : true, grid: typeof s?.grid === 'boolean' ? s.grid : false }; }
  let settings = cleanSettings(window.ZENITH_DEFAULTS), storageAvailable = true;
  try { const saved = localStorage.getItem(KEY); if (saved) { const parsed = JSON.parse(saved); if (validSite(parsed.site)) settings = cleanSettings(parsed); } } catch { storageAvailable = false; }
  const cities = [
    ['上海', 31.2304, 121.4737], ['北京', 39.9042, 116.4074], ['广州', 23.1291, 113.2644], ['深圳', 22.5431, 114.0579],
    ['杭州', 30.2741, 120.1551], ['南京', 32.0603, 118.7969], ['武汉', 30.5928, 114.3055], ['成都', 30.5728, 104.0668],
    ['重庆', 29.563, 106.5516], ['西安', 34.3416, 108.9398], ['昆明', 25.0389, 102.7183], ['哈尔滨', 45.8038, 126.535],
    ['乌鲁木齐', 43.8256, 87.6168], ['拉萨', 29.652, 91.1721], ['香港', 22.3193, 114.1694], ['台北', 25.033, 121.5654],
    ['东京', 35.6762, 139.6503], ['新加坡', 1.3521, 103.8198], ['悉尼', -33.8688, 151.2093], ['伦敦', 51.5074, -.1278],
    ['纽约', 40.7128, -74.006], ['洛杉矶', 34.0522, -118.2437], ['开普敦', -33.9249, 18.4241], ['布宜诺斯艾利斯', -34.6037, -58.3816]
  ];
  let width = 1600, height = 900, ratio = 1, radius = 650, zoom = 1.7, q = [0, 0, 0, 1];
  let paused = false, speed = 1, baseTime = Date.now(), baseStamp = performance.now(), frozenTime = 0;
  let observationTime = baseTime, frames = 0, lastPaint = -Infinity, lastInput = performance.now(), drag = null;
  let dirty = true, cacheKey = '', starPositions = [], projectedStars = [], currentFrame = M.frame(observationTime, settings.site.latitude, settings.site.longitude);
  let noticeTimer, locatedRequest = 0;
  const stars = data.stars.map(s => ({ id: s[0], v: M.equatorial(s[1], s[2]), magnitude: s[3], bv: s[4], name: s[5] || '' }));
  function densify(coords) {
    const result = [];
    coords.forEach((point, i) => {
      const v = M.equatorial(...point);
      if (i) { const prev = M.equatorial(...coords[i - 1]), steps = Math.max(1, Math.ceil(Math.acos(M.clamp(M.dot(prev, v), -1, 1)) * M.DEG / 3)); for (let j = 1; j < steps; j++) result.push(M.normalize(prev.map((n, k) => n + (v[k] - n) * j / steps))); }
      result.push(v);
    }); return result;
  }
  const constellations = data.constellations.map(c => ({ ...c, v: M.equatorial(...c.at), paths: c.lines.map(densify) }));
  const galacticClouds = [];
  for (let l = 0; l < 360; l += 2) for (let band = -2; band <= 2; band++) {
    const b = band * 3 + Math.sin(l * .13 + band) * 2.4;
    galacticClouds.push({ v: M.galactic(l, b), a: (.7 + Math.cos(l * M.R) * .3) * (1 - Math.abs(band) * .18), band });
  }
  const haze = document.createElement('canvas'); haze.width = haze.height = 96;
  const hc = haze.getContext('2d'), hg = hc.createRadialGradient(48, 48, 0, 48, 48, 48);
  hg.addColorStop(0, '#91a0bc35'); hg.addColorStop(.35, '#7b89a91b'); hg.addColorStop(1, '#6b82a000'); hc.fillStyle = hg; hc.fillRect(0, 0, 96, 96);
  const gridPaths = [];
  for (const alt of [15, 30, 45, 60, 75]) gridPaths.push(Array.from({ length: 181 }, (_, i) => { const a = i * 2 * M.R; return [Math.sin(a) * Math.cos(alt * M.R), Math.cos(a) * Math.cos(alt * M.R), Math.sin(alt * M.R)]; }));
  for (let az = 0; az < 360; az += 30) gridPaths.push(Array.from({ length: 46 }, (_, i) => [Math.sin(az * M.R) * Math.cos(i * 2 * M.R), Math.cos(az * M.R) * Math.cos(i * 2 * M.R), Math.sin(i * 2 * M.R)]));
  const horizon = Array.from({ length: 241 }, (_, i) => [Math.sin(i / 240 * M.TAU), Math.cos(i / 240 * M.TAU), 0]);
  function currentTime(stamp = performance.now()) { return paused ? frozenTime : speed === 1 ? Date.now() : baseTime + (stamp - baseStamp) * speed; }
  function wake() { lastInput = performance.now(); document.body.classList.remove('idle'); }
  function notify(message) { $('#notice').textContent = message; $('#notice').classList.add('visible'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').classList.remove('visible'), 4000); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); storageAvailable = true; } catch { storageAvailable = false; notify('设置已应用，本次环境无法保存；可在预览中导出桌面壁纸保留设置。'); } }
  const coordinates = s => `${Math.abs(s.latitude).toFixed(4)}° ${s.latitude < 0 ? 'S' : 'N'} / ${Math.abs(s.longitude).toFixed(4)}° ${s.longitude < 0 ? 'W' : 'E'}`;
  function updateSite() {
    const s = settings.site; $('#site-name').textContent = (s.source === 'example' ? '示例位置 · ' : '') + s.name; $('#site-coordinates').textContent = coordinates(s);
    $('#location-status').textContent = s.source === 'example' ? '尚未设置位置，当前展示上海的示例天空。' : `当前观测点：${s.name}。${s.source === 'geolocation' ? '由设备提供的位置' : s.source === 'preset' ? '使用城市中心坐标' : '使用指定经纬度'}。`;
    $('#place').value = s.source === 'example' ? '' : s.name; $('#latitude').value = s.latitude; $('#longitude').value = s.longitude;
    document.querySelectorAll('[data-city]').forEach(b => b.setAttribute('aria-pressed', String(cities[Number(b.dataset.city)][0] === s.name && s.source === 'preset')));
    ['lines', 'names', 'grid'].forEach(k => $('#' + k).setAttribute('aria-pressed', String(settings[k])));
    cacheKey = ''; dirty = true;
  }
  function setSite(site) { if (!validSite(site)) throw new RangeError('Latitude must be −90…90 and longitude −180…180.'); locatedRequest++; $('#locate').disabled = false; settings.site = cleanSite(site); save(); updateSite(); wake(); render(); }
  cities.forEach(([name, latitude, longitude], i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.city = i; b.textContent = name; b.addEventListener('click', () => setSite({ name, latitude, longitude, source: 'preset' })); $('#city-list').append(b); });
  function togglePanel(id, value) {
    const panel = $('#' + id), open = value === undefined ? panel.hidden : Boolean(value); panel.hidden = !open;
    const trigger = id === 'location-panel' ? $('#location-button') : $('#help'); trigger.setAttribute('aria-expanded', String(open));
    if (open) { const other = id === 'location-panel' ? 'help-panel' : 'location-panel'; $('#' + other).hidden = true; $(other === 'location-panel' ? '#location-button' : '#help').setAttribute('aria-expanded', 'false'); }
    wake();
  }
  $('#location-button').addEventListener('click', () => togglePanel('location-panel'));
  $('#close-location').addEventListener('click', () => togglePanel('location-panel', false));
  $('#help').addEventListener('click', () => togglePanel('help-panel'));
  $('#close-help').addEventListener('click', () => togglePanel('help-panel', false));
  $('#coordinates-form').addEventListener('submit', e => { e.preventDefault(); const latitude = $('#latitude').valueAsNumber, longitude = $('#longitude').valueAsNumber; if (!validSite({ latitude, longitude })) { $('#location-status').textContent = '请输入有效纬度（−90 至 90）和经度（−180 至 180）。'; return; } setSite({ name: $('#place').value.trim() || '我的观测点', latitude, longitude, source: 'manual' }); });
  function locate() {
    if (desktop || !navigator.geolocation || !window.isSecureContext) { $('#location-status').textContent = '当前环境无法使用设备定位，请选择城市或在预览中输入经纬度。'; return; }
    const request = ++locatedRequest; $('#locate').disabled = true; $('#location-status').textContent = '正在请求设备位置…也可以直接选择城市。';
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locatedRequest) return;
      const { latitude, longitude } = position.coords;
      if (validSite({ latitude, longitude })) setSite({ name: '我的位置', latitude, longitude, source: 'geolocation' });
      else { $('#locate').disabled = false; $('#location-status').textContent = '设备未返回有效坐标，请选择城市或输入经纬度。'; }
    }, error => { if (request !== locatedRequest) return; $('#locate').disabled = false; $('#location-status').textContent = error.code === 1 ? '未获得定位权限。可选择城市或输入经纬度。' : error.code === 3 ? '定位超时。可重试，或选择城市和经纬度。' : '暂时无法确定位置，请选择城市或输入经纬度。'; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 86400000 });
  }
  $('#locate').addEventListener('click', locate);
  function setPaused(value) { const now = currentTime(); paused = Boolean(value); if (paused) frozenTime = now; else { baseTime = now; baseStamp = performance.now(); } $('#pause').textContent = paused ? '▷' : 'Ⅱ'; $('#pause').setAttribute('aria-pressed', String(paused)); dirty = true; render(); }
  function setSpeed(value) { const now = currentTime(); speed = [1, 60, 600].includes(value) ? value : 1; baseTime = speed === 1 ? Date.now() : now; baseStamp = performance.now(); paused = false; $('#pause').textContent = 'Ⅱ'; $('#pause').setAttribute('aria-pressed', 'false'); $('#speed').textContent = speed === 1 ? '实时' : `${speed}×`; dirty = true; render(); }
  function setTime(ms) { if (!Number.isFinite(ms)) throw new RangeError('Invalid observation time'); frozenTime = ms; paused = true; $('#pause').textContent = '▷'; $('#pause').setAttribute('aria-pressed', 'true'); dirty = true; render(); }
  function setZoom(value) { zoom = M.clamp(value, .65, 6); radius = Math.min(width, height) * .45 * zoom; dirty = true; }
  function resetView() { q = [0, 0, 0, 1]; setZoom(1.7); render(); }
  $('#pause').addEventListener('click', () => setPaused(!paused)); $('#speed').addEventListener('click', () => setSpeed([1, 60, 600][([1, 60, 600].indexOf(speed) + 1) % 3]));
  $('#zenith').addEventListener('click', resetView); $('#fit').addEventListener('click', () => { q = [0, 0, 0, 1]; setZoom(1); render(); });
  $('#zoom-in').addEventListener('click', () => { setZoom(zoom * 1.3); render(); }); $('#zoom-out').addEventListener('click', () => { setZoom(zoom / 1.3); render(); });
  ['lines', 'names', 'grid'].forEach(k => $('#' + k).addEventListener('click', () => { settings[k] = !settings[k]; save(); $('#' + k).setAttribute('aria-pressed', String(settings[k])); dirty = true; render(); }));
  function projected(v) { return M.project(v, q, width * .5, height * .5, radius); }
  function onScreen(p, pad = 30) { return p && p.x > -pad && p.x < width + pad && p.y > -pad && p.y < height + pad; }
  function linePath(points, color, weight = .6, celestial = false) {
    let prev = null; ctx.beginPath();
    for (let v of points) {
      if (celestial) v = M.horizontal(v, currentFrame);
      const p = projected(v);
      if (v[2] >= -1e-10 && p && Math.abs(p.x - width * .5) < width * 4 && Math.abs(p.y - height * .5) < height * 4) {
        if (prev?.visible && Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < Math.max(width, height)) ctx.lineTo(p.x, p.y);
        else if (prev && prev.v[2] < 0) { const t = -prev.v[2] / (v[2] - prev.v[2]), edge = projected(M.normalize(prev.v.map((n, i) => n + (v[i] - n) * t))); if (edge) { ctx.moveTo(edge.x, edge.y); ctx.lineTo(p.x, p.y); } else ctx.moveTo(p.x, p.y); }
        else ctx.moveTo(p.x, p.y);
        prev = { v, p, visible: true };
      } else {
        if (prev?.visible && v[2] < 0) { const t = -prev.v[2] / (v[2] - prev.v[2]), edge = projected(M.normalize(prev.v.map((n, i) => n + (v[i] - n) * t))); if (edge) ctx.lineTo(edge.x, edge.y); }
        prev = { v, p, visible: false };
      }
    }
    ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.stroke();
  }
  function starColor(bv) {
    const colors = [[-.4, [163, 189, 246]], [0, [202, 218, 249]], [.5, [236, 237, 217]], [1, [244, 211, 167]], [2, [246, 172, 128]]];
    const n = M.clamp(bv, -.4, 2); let i = 1; while (i < colors.length - 1 && n > colors[i][0]) i++;
    const t = (n - colors[i - 1][0]) / (colors[i][0] - colors[i - 1][0]); return colors[i - 1][1].map((v, k) => Math.round(v + (colors[i][1][k] - v) * t)).join(',');
  }
  stars.forEach(s => { s.color = starColor(s.bv); });
  function render() {
    observationTime = currentTime(); currentFrame = M.frame(observationTime, settings.site.latitude, settings.site.longitude);
    const key = `${Math.floor(observationTime / 1000)}:${settings.site.latitude}:${settings.site.longitude}`;
    if (cacheKey !== key) { starPositions = stars.map(s => M.horizontal(s.v, currentFrame)); cacheKey = key; }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.globalAlpha = 1;
    const sky = ctx.createRadialGradient(width * .5, height * .45, 30, width * .5, height * .5, Math.max(width, height) * .75); sky.addColorStop(0, '#111c2d'); sky.addColorStop(.6, '#0a1221'); sky.addColorStop(1, '#050a12'); ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    ctx.save();
    for (const cloud of galacticClouds) {
      const v = M.horizontal(cloud.v, currentFrame), p = projected(v); if (v[2] < .01 || !onScreen(p, 200)) continue;
      const size = radius * .15 / (1 + p.depth); ctx.globalAlpha = .15 * cloud.a * M.clamp(v[2] * 5, 0, 1); ctx.drawImage(haze, p.x - size, p.y - size, size * 2, size * 2);
    } ctx.restore();
    if (settings.grid) gridPaths.forEach(path => linePath(path, '#73869a22', .6));
    ctx.setLineDash([2, 8]); linePath(horizon, '#a0acb238', .8); ctx.setLineDash([]);
    if (settings.lines) constellations.forEach(c => c.paths.forEach(path => linePath(path, c.rank === 1 ? '#91acc33e' : '#788ea42a', .65, true)));
    projectedStars = []; let above = 0;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i], v = starPositions[i]; if (v[2] < 0) continue; above++;
      const p = projected(v); if (!onScreen(p, 15)) continue;
      const alpha = M.clamp(1.25 - s.magnitude * .145, .25, 1) * M.clamp(v[2] * 8, .12, 1), size = (.45 + 2.2 * Math.exp(-.53 * (s.magnitude + 1.5))) * M.clamp(Math.sqrt(zoom / 1.7), .8, 1.8);
      if (s.magnitude < 2.3) { const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 7); glow.addColorStop(0, `rgba(${s.color},${alpha * .3})`); glow.addColorStop(.25, `rgba(${s.color},${alpha * .07})`); glow.addColorStop(1, `rgba(${s.color},0)`); ctx.fillStyle = glow; ctx.fillRect(p.x - size * 7, p.y - size * 7, size * 14, size * 14); }
      ctx.fillStyle = `rgba(${s.color},${alpha})`; ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, M.TAU); ctx.fill();
      if (s.magnitude < .8) { ctx.strokeStyle = `rgba(${s.color},${alpha * .18})`; ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(p.x - size * 3, p.y); ctx.lineTo(p.x + size * 3, p.y); ctx.moveTo(p.x, p.y - size * 3); ctx.lineTo(p.x, p.y + size * 3); ctx.stroke(); }
      projectedStars.push({ id: s.id, x: p.x, y: p.y, altitude: p.altitude, magnitude: s.magnitude, name: s.name });
    }
    const occupied = [];
    function label(text, p, color, font, dx = 0, dy = 0, force = false) {
      if (!onScreen(p, -35)) return; ctx.font = font; const w = ctx.measureText(text).width, x = p.x + dx, y = p.y + dy;
      const rect = { x: x - w * .5 - 7, y: y - 10, w: w + 14, h: 19 };
      if (!force && occupied.some(r => r.x < rect.x + rect.w && r.x + r.w > rect.x && r.y < rect.y + rect.h && r.y + r.h > rect.y)) return;
      occupied.push(rect); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, x, y);
    }
    if (settings.names) {
      projectedStars.filter(s => s.magnitude < 2.3 && s.name && s.altitude > 7).sort((a, b) => a.magnitude - b.magnitude).forEach(s => label(s.name, s, '#bbc7cc9c', '10px "Microsoft YaHei",sans-serif', 0, 15));
      constellations.filter(c => c.rank < 3 || zoom > 2).sort((a, b) => a.rank - b.rank).forEach(c => { const v = M.horizontal(c.v, currentFrame); if (v[2] > .12) label(c.name, projected(v), c.rank === 1 ? '#b5c1cc78' : '#9fadb650', '12px "Microsoft YaHei",sans-serif'); });
    }
    const zenith = projected([0, 0, 1]);
    if (onScreen(zenith, -15)) {
      ctx.strokeStyle = '#c7b78f85'; ctx.lineWidth = .7; ctx.beginPath(); ctx.arc(zenith.x, zenith.y, 5, 0, M.TAU); ctx.moveTo(zenith.x - 10, zenith.y); ctx.lineTo(zenith.x - 7, zenith.y); ctx.moveTo(zenith.x + 7, zenith.y); ctx.lineTo(zenith.x + 10, zenith.y); ctx.moveTo(zenith.x, zenith.y - 10); ctx.lineTo(zenith.x, zenith.y - 7); ctx.moveTo(zenith.x, zenith.y + 7); ctx.lineTo(zenith.x, zenith.y + 10); ctx.stroke();
      label('天 顶', { x: zenith.x, y: zenith.y + 24 }, '#c8b8938c', '9px "Microsoft YaHei",sans-serif', 0, 0, true);
    }
    const directions = [[0, 1, '北', 'N'], [1, 0, '东', 'E'], [0, -1, '南', 'S'], [-1, 0, '西', 'W']];
    directions.forEach(([e, n, name, en]) => {
      const p = projected([e, n, 0]); if (!p) return;
      const dx = p.x - width * .5, dy = p.y - height * .5, margin = width < 700 ? 20 : 30;
      const k = Math.min(1, (width * .5 - margin) / Math.max(.001, Math.abs(dx)), (height * .5 - (width < 700 ? 90 : 28)) / Math.max(.001, Math.abs(dy)));
      const x = width * .5 + dx * k, y = height * .5 + dy * k;
      ctx.textAlign = 'center'; ctx.fillStyle = '#a4b5c07a'; ctx.font = '10px "Microsoft YaHei",sans-serif'; ctx.fillText(name, x, y); ctx.fillStyle = '#9aabbb44'; ctx.font = '7px Consolas,monospace'; ctx.fillText(en, x, y + 12);
    });
    $('#star-count').textContent = `${above.toLocaleString()} 颗在地平线之上`;
    const date = new Date(observationTime); $('#clock').textContent = date.toLocaleTimeString('zh-CN', { hour12: false });
    $('#date').textContent = `${date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })} · 设备时间 UTC${date.getTimezoneOffset() <= 0 ? '+' : '−'}${Math.abs(date.getTimezoneOffset() / 60)}`;
    $('#time-mode').textContent = paused ? '观测暂停' : speed === 1 ? '此时 · 此地' : `时间加速 · ${speed}×`;
    $('#caption').textContent = settings.site.source === 'example' ? '选择你的位置，展开属于此地的天空。' : '抬头，是此刻真实的星辰。';
    frames++; dirty = false;
  }
  function resize() {
    width = innerWidth; height = innerHeight; ratio = Math.min(devicePixelRatio || 1, 1.5, 1920 / width, 1920 / height);
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    ratio = canvas.width / width; setZoom(zoom); render();
  }
  function sphereAt(e) { return M.unproject((e.clientX - width * .5) / radius, -(e.clientY - height * .5) / radius); }
  canvas.addEventListener('pointerdown', e => { if (desktop || e.button !== 0) return; drag = { id: e.pointerId, start: sphereAt(e), q: [...q] }; if (e.isTrusted) canvas.setPointerCapture(e.pointerId); wake(); });
  canvas.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; q = M.normalize(M.multiply(M.between(drag.start, sphereAt(e)), drag.q)); dirty = true; wake(); });
  function endDrag(e) { if (drag?.id === e.pointerId) { drag = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } }
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => { if (desktop) return; e.preventDefault(); const amount = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1); setZoom(zoom * Math.exp(-M.clamp(amount, -500, 500) * .0015)); wake(); }, { passive: false });
  addEventListener('pointermove', wake, { passive: true });
  addEventListener('keydown', e => {
    if (desktop || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; wake();
    if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest('button,summary')) return;
    if (e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
    if (e.code === 'KeyT') setSpeed(1);
    if (e.code === 'KeyC') $('#lines').click(); if (e.code === 'KeyN') $('#names').click(); if (e.code === 'KeyG') $('#grid').click();
    if (e.code === 'KeyH') togglePanel('help-panel'); if (e.code === 'KeyS') document.body.classList.toggle('interface-hidden');
    if (e.code === 'Escape') { togglePanel('location-panel', false); togglePanel('help-panel', false); }
    if (e.code === 'KeyF') { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => notify('可使用 F11 进入浏览器全屏')); }
  });
  $('#export').addEventListener('click', async () => {
    const button = $('#export'); button.disabled = true; button.textContent = '正在准备桌面壁纸…';
    const snapshot = cleanSettings(settings);
    try {
      const names = ['index.html', 'sky.css', 'astro.js', 'sky-data.js', 'settings.js', 'archive.js', 'sky.js', 'module.json', 'cover.jpg', 'NOTICE.txt'];
      const files = await Promise.all(names.map(async name => {
        if (name === 'settings.js') return { name, data: 'window.ZENITH_DEFAULTS = ' + JSON.stringify({ ...snapshot, profile: 'configured-' + Date.now().toString(36) }, null, 2) + ';\n' };
        const response = await fetch(new URL(name, location.href)); if (!response.ok) throw new Error('asset unavailable');
        if (name === 'module.json') { const metadata = await response.json(); metadata.name = `此刻星空 · ${snapshot.site.name}`; return { name, data: JSON.stringify(metadata, null, 2) + '\n' }; }
        return { name, data: new Uint8Array(await response.arrayBuffer()) };
      }));
      const blob = StarArchive.zip(files), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'zenith-sky.zip'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); notify('已生成桌面壁纸。请在壁纸盒子的设置中导入此 ZIP。');
    } catch { notify('暂时无法导出。请在壁纸盒子的独立预览或本地网页服务中重试。'); }
    finally { button.disabled = false; button.textContent = '保存此位置的桌面壁纸'; }
  });
  addEventListener('resize', resize); document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastPaint = -Infinity; dirty = true; } });
  function loop(stamp) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    if (!$('#location-panel').hidden || !$('#help-panel').hidden || document.querySelector('button:focus-visible,input:focus-visible,summary:focus-visible')) lastInput = stamp;
    if (stamp - lastInput > 7000) document.body.classList.add('idle');
    const interval = drag || dirty ? 1000 / 30 : speed > 1 && !paused ? 1000 / 15 : 1000;
    if ((paused && !dirty) || stamp - lastPaint < interval) return;
    lastPaint = stamp; render();
  }
  const getState = () => ({ id: 'zenith-sky', site: { ...settings.site }, observationTime, paused, speed, desktop, zoom, orientation: [...q], atZenith: Math.abs(q[3]) > .999999, frames, width: canvas.width, height: canvas.height, starCount: stars.length, constellationCount: new Set(constellations.map(c => c.id)).size, visible: projectedStars.length, drawnStars: projectedStars.map(s => ({ ...s })), settings: { ...settings, site: { ...settings.site } }, storageAvailable, renderFps: drag ? 30 : speed > 1 ? 15 : 1 });
  window.zenithSky = Object.freeze({ getState, setSite, setPaused, setSpeed, setTime, resetView, setZoom: value => { setZoom(value); render(); } }); window.getState = getState;
  updateSite(); resize(); requestAnimationFrame(loop);
})();

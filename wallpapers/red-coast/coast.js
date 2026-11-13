(() => {
  'use strict';
  async function startScene() {
    const runtime = window.WallpaperRuntime;
    runtime.refresh();
    const canvas = document.getElementById('coast'), ctx = canvas.getContext('2d', { alpha: false });
    const plate = new Image();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phaseNames = ['阴天', '深夜', '晨光', '流转'];
    const TAU = Math.PI * 2;
    let width = 0, height = 0, ready = false, loadError = null;
    let time = 0, scanTime = 0, phaseValue = 0, phaseIndex = 3, frames = 0, paused = false, scanning = true;
    let raf = 0, last = null, lastPaint = 0, lastInput = 0, interactions = 0, signals = 0, signalBorn = -100;
    let pointerX = 0, pointerY = 0, targetX = 0, targetY = 0, mist = null, lastSignalLabel = '';
    let view = { x: 0, y: 0, width: 0, height: 0 };
    function randomGenerator(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
    function smooth(x) { return x * x * (3 - 2 * x); }
    function appearance() {
      const phase = ((phaseValue % 3) + 3) % 3, from = Math.floor(phase), to = (from + 1) % 3, blend = smooth(phase - from);
      return { night: [0, 1, .08][from] * (1 - blend) + [0, 1, .08][to] * blend,
        warm: [0, 0, .18][from] * (1 - blend) + [0, 0, .18][to] * blend };
    }
    function cameraOffsetX() { return Math.sin(scanTime * .017) * Math.min(width, height) * .0028; }
    function glow(c, x, y, rx, ry, paint) {
      c.save(); c.translate(x, y); c.scale(rx, ry);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, paint); g.addColorStop(1, '#00000000');
      c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
    }
    function makeMist() {
      mist = document.createElement('canvas'); mist.width = 1000; mist.height = 280;
      const c = mist.getContext('2d'), random = randomGenerator(1369);
      for (let i = 0; i < 140; i++) glow(c, 100 + random() * 800, 90 + random() * 100,
        35 + random() * 120, 7 + random() * 33, 'rgba(219,229,228,.021)');
    }
    function photoPoint(u, v) { return { x: view.x + u * view.width, y: view.y + v * view.height }; }
    function drawPhoto(a) {
      const zoom = Math.max(width / plate.naturalWidth, height / plate.naturalHeight) * 1.014;
      const w = plate.naturalWidth * zoom, h = plate.naturalHeight * zoom;
      const focusX = width < 750 ? .62 : .50;
      const x = Math.max(width - w, Math.min(0, width * .5 - w * focusX)) + cameraOffsetX() + pointerX * 1.6;
      const y = (height - h) * .40 + Math.sin(scanTime * .011) * Math.min(width, height) * .0015 + pointerY;
      view = { x, y, width: w, height: h };
      ctx.drawImage(plate, x, y, w, h);
      if (a.night > .001) {
        const grade = ctx.createLinearGradient(0, 0, 0, height);
        grade.addColorStop(0, `rgba(62,83,117,${a.night * .92})`);
        grade.addColorStop(1, `rgba(78,100,123,${a.night * .88})`);
        ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = grade; ctx.fillRect(0, 0, width, height); ctx.restore();
      }
      if (a.warm > .001) { ctx.fillStyle = `rgba(195,123,65,${a.warm})`; ctx.fillRect(0, 0, width, height); }
    }
    function drawAtmosphere(a) {
      // Mist stays in the two mountain valleys, preserving the architectural detail.
      const drift = Math.sin(time * .016) * .022, lift = Math.sin(time * .023) * .003;
      ctx.save(); ctx.globalAlpha = .29 - a.night * .10;
      for (const zone of [{ u: .03, v: .54, w: .35, h: .23 }, { u: .77, v: .53, w: .28, h: .28 }]) {
        const p = photoPoint(zone.u + drift, zone.v + lift);
        ctx.drawImage(mist, p.x, p.y, zone.w * view.width, zone.h * view.height);
      }
      ctx.restore();
      // Warm work lights brighten gently at night without washing out the reference plate.
      const scale = Math.min(width / 1600, height / 900);
      for (const [u, v] of [[.663, .612], [.715, .749], [.657, .843], [.520, .827], [.692, .684]]) {
        const p = photoPoint(u, v);
        glow(ctx, p.x, p.y, Math.max(3, 10 * scale), Math.max(3, 12 * scale), `rgba(255,179,79,${a.night * .13})`);
      }
      const active = time - signalBorn >= 0 && time - signalBorn < 9;
      const lamp = photoPoint(.728, .065), pulse = .18 + Math.pow((Math.sin(time * .85) + 1) / 2, 10) * .30;
      glow(ctx, lamp.x, lamp.y, Math.max(2, 5 * scale), Math.max(2, 5 * scale), `rgba(240,91,45,${active ? .26 : pulse * .22})`);
    }
    function receiverLayout() {
      const compact = width < 750;
      if (compact && height < 600) return null;
      const q = compact ? Math.min(.54, width / 700, height / 900) : Math.min(width / 1600, height / 900);
      const x = width * .034, y = height * (compact ? .78 : .81);
      return { x, y, scale: q, width: 248 * q, height: 91 * q,
        screen: { x: x + 15 * q, y: y + 19 * q, width: 113 * q, height: 40 * q, baseline: y + 39 * q, scale: q } };
    }
    function drawListeningDesk(a) {
      const layout = receiverLayout(); if (!layout) return;
      const { x, y, scale: q } = layout, compact = width < 750;
      const active = time - signalBorn >= 0 && time - signalBorn < 9;
      // A small receiver rests quietly on the corner of the sill.
      ctx.save();
      ctx.translate(x, y); ctx.scale(q, q);
      ctx.fillStyle = '#071a1ab3'; ctx.beginPath(); ctx.ellipse(125, 92, 135, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a2823'; ctx.beginPath(); ctx.moveTo(241, 0); ctx.lineTo(254, 6); ctx.lineTo(254, 86); ctx.lineTo(241, 91); ctx.fill();
      const paint = ctx.createLinearGradient(0, 0, 0, 91); paint.addColorStop(0, '#535849'); paint.addColorStop(.12, '#3b4535'); paint.addColorStop(1, '#27382b');
      ctx.fillStyle = paint; ctx.fillRect(0, 0, 242, 91); ctx.strokeStyle = '#a49d724f'; ctx.lineWidth = .8; ctx.strokeRect(.5, .5, 241, 90);
      ctx.fillStyle = '#09231a'; ctx.fillRect(12, 16, 119, 46);
      ctx.strokeStyle = '#b1aa7b66'; ctx.strokeRect(12, 16, 119, 46);
      ctx.save(); ctx.beginPath(); ctx.rect(15, 19, 113, 40); ctx.clip();
      const glass = ctx.createLinearGradient(0, 19, 0, 59); glass.addColorStop(0, '#143b28'); glass.addColorStop(1, '#09261b');
      ctx.fillStyle = glass; ctx.fillRect(15, 19, 113, 40);
      ctx.strokeStyle = '#74ae7723'; ctx.lineWidth = .6;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.moveTo(21 + i * 20, 20); ctx.lineTo(21 + i * 20, 58); } ctx.moveTo(15, 39); ctx.lineTo(128, 39); ctx.stroke();
      const amplitude = active ? 11 : 2.2;
      for (let trail = 1; trail >= 0; trail--) {
        ctx.beginPath();
        for (let i = 0; i <= 113; i++) {
          const value = (Math.sin(i * .20 + time * 1.8 - trail * .16) * .72 + Math.sin(i * .67 + time * .7) * .20) * amplitude;
          const yy = 39 + value;
          i ? ctx.lineTo(15 + i, yy) : ctx.moveTo(15 + i, yy);
        }
        ctx.strokeStyle = trail ? '#88e6a333' : '#9befadcc'; ctx.lineWidth = trail ? 2.4 : 1; ctx.stroke();
      }
      ctx.restore();
      // One restrained analog meter and two knobs replace the former control desk.
      ctx.fillStyle = '#1a2a22'; ctx.fillRect(147, 17, 76, 43); ctx.fillStyle = '#bcb79a'; ctx.fillRect(150, 20, 70, 37);
      ctx.strokeStyle = '#485342'; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.arc(185, 53, 26, Math.PI * 1.17, Math.PI * 1.83); ctx.stroke();
      for (let i = 0; i <= 6; i++) {
        const t = Math.PI * (1.17 + i * .11);
        ctx.beginPath(); ctx.moveTo(185 + Math.cos(t) * 23, 53 + Math.sin(t) * 23); ctx.lineTo(185 + Math.cos(t) * 26, 53 + Math.sin(t) * 26); ctx.stroke();
      }
      const needle = Math.PI * (1.40 + (active ? .20 : .03) + Math.sin(time * 1.6) * .018);
      ctx.strokeStyle = '#775238'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(185, 53); ctx.lineTo(185 + Math.cos(needle) * 24, 53 + Math.sin(needle) * 24); ctx.stroke();
      for (const kx of [166, 209]) {
        ctx.fillStyle = '#152b23'; ctx.beginPath(); ctx.arc(kx, 75, 7, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#a9a37a88'; ctx.lineWidth = .8; ctx.stroke();
        ctx.strokeStyle = '#c2b78c'; ctx.beginPath(); ctx.moveTo(kx, 75); ctx.lineTo(kx + 2, 70); ctx.stroke();
      }
      ctx.font = '7px "Noto Serif CJK SC", SimSun, serif'; ctx.fillStyle = '#bab58b'; ctx.textAlign = 'left'; ctx.fillText('红 岸  ·  接 收', 16, 79);
      ctx.fillStyle = active ? '#d8ad69' : '#839a67'; ctx.beginPath(); ctx.arc(132, 75, 1.8, 0, TAU); ctx.fill();
      for (const [sx, sy] of [[5, 5], [235, 5], [5, 85], [235, 85]]) { ctx.fillStyle = '#b2a67c77'; ctx.fillRect(sx, sy, 1.4, 1.4); }
      ctx.restore();
    }
    function draw() {
      if (!ready) return;
      const a = appearance();
      ctx.globalAlpha = 1; ctx.fillStyle = '#0b171b'; ctx.fillRect(0, 0, width, height);
      drawPhoto(a); drawAtmosphere(a); drawListeningDesk(a); frames++;
    }
    function resize() {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (ready) draw();
    }
    function updateSignal() {
      const age = time - signalBorn, active = age >= 0 && age < 9;
      const label = active ? '正在发送，等待回声。' : signals ? '讯息已远去。群山依旧沉默。' : '群山沉默，星空无言。';
      if (label !== lastSignalLabel) {
        document.getElementById('transmission').textContent = label;
        document.getElementById('signal').disabled = active; lastSignalLabel = label;
      }
    }
    function tick(now) {
      raf = 0;
      if (runtime.paused || !ready) { last = null; return; }
      if (last === null) { last = now; lastPaint = now - 34; }
      if (now - lastPaint >= 1000 / 30 - .5) {
        const dt = Math.min((now - last) / 1000, .1); last = now; lastPaint = now;
        time += dt;
        if (scanning) scanTime += dt * (reducedMotion ? .15 : 1);
        if (phaseIndex === 3) phaseValue = (phaseValue + dt / (reducedMotion ? 360 : 180)) % 3;
        else {
          const difference = (phaseIndex - phaseValue + 4.5) % 3 - 1.5;
          phaseValue = (phaseValue + difference * Math.min(1, dt * .8) + 3) % 3;
          if (Math.abs(difference) < .001) phaseValue = phaseIndex;
        }
        pointerX += (targetX - pointerX) * .04; pointerY += (targetY - pointerY) * .04;
        updateSignal();
        if (runtime.canIdle() && time - lastInput > 7) document.body.classList.add('idle');
        else document.body.classList.remove('idle');
        draw();
      }
      raf = requestAnimationFrame(tick);
    }
    function wake() { lastInput = time; document.body.classList.remove('idle'); }
    function changePhase() {
      if (!runtime.canAct() || !ready) return;
      phaseIndex = (phaseIndex + 1) % 4;
      document.getElementById('phase').textContent = '天色 · ' + phaseNames[phaseIndex]; wake();
    }
    function sendSignal() {
      if (!runtime.canAct() || !ready || time - signalBorn < 9) return false;
      signalBorn = time; signals++; interactions++; updateSignal(); wake(); return true;
    }
    function togglePause() {
      paused = !paused; document.getElementById('pause').textContent = paused ? '继续' : '暂停';
      document.getElementById('pause').setAttribute('aria-pressed', String(paused));
      runtime.setUserPaused(paused); wake();
    }
    function fullscreen() {
      if (!runtime.capabilities.fullscreen) return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    }
    document.getElementById('phase').addEventListener('click', changePhase);
    document.getElementById('signal').addEventListener('click', sendSignal);
    document.getElementById('scan').addEventListener('click', () => {
      if (!runtime.canAct() || !ready) return;
      scanning = !scanning; document.getElementById('scan').textContent = '镜头 · ' + (scanning ? '缓移' : '静止');
      document.getElementById('scan').setAttribute('aria-pressed', String(scanning)); wake();
    });
    document.getElementById('pause').addEventListener('click', togglePause);
    document.getElementById('fullscreen').addEventListener('click', fullscreen);
    canvas.addEventListener('click', event => {
      wake(); if (!runtime.canAct() || !ready) return;
      const box = canvas.getBoundingClientRect();
      const x = (event.clientX - box.left) * width / box.width, y = (event.clientY - box.top) * height / box.height;
      const u = (x - view.x) / view.width, v = (y - view.y) / view.height;
      if (((u - .66) / .33) ** 2 + ((v - .26) / .32) ** 2 < 1.1) sendSignal();
    });
    document.addEventListener('pointermove', event => {
      wake(); if (!runtime.capabilities.pointerMove || !runtime.canAct() || !ready) return;
      targetX = (event.clientX / width * 2 - 1) * (reducedMotion ? 0 : 1);
      targetY = (event.clientY / height * 2 - 1) * (reducedMotion ? 0 : 1);
    }, { passive: true });
    document.addEventListener('pointerdown', wake, { passive: true }); document.addEventListener('focusin', wake);
    document.addEventListener('keydown', event => {
      if (!runtime.capabilities.keyboard || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target.closest('button')) return;
      if (event.code === 'Space') { event.preventDefault(); togglePause(); }
      if (event.key.toLowerCase() === 'f') fullscreen();
    });
    runtime.onStateChange(() => {
      cancelAnimationFrame(raf); raf = 0; last = null; lastPaint = 0; wake();
      if (!runtime.paused && ready) raf = requestAnimationFrame(tick);
    });
    runtime.registerActions([
      { id: 'phase', label: '切换红岸天色', disabledReason: () => ready ? null : '画面正在载入。', run: () => { changePhase(); return { phase: phaseNames[phaseIndex] }; } },
      { id: 'signal', label: '向远空发射信号', disabledReason: () => !ready ? '画面正在载入。' : time - signalBorn < 9 ? '讯息正在发送，请稍候。' : null,
        run: () => ({ sent: sendSignal(), signals }) }
    ]);
    addEventListener('resize', resize); addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
    window.redCoast = { getState: () => ({ ready, loadError, frames, time, paused, width, height, phaseIndex, phaseValue, scanning, scanTime,
      cameraOffsetX: cameraOffsetX(), interactions, signals, transmitting: time - signalBorn < 9, receiver: receiverLayout(), targetFps: 30,
      artwork: 'reference-realistic', imageWidth: plate.naturalWidth, imageHeight: plate.naturalHeight }) };
    makeMist(); resize();
    plate.src = 'assets/red-coast-reference.png';
    try {
      await plate.decode(); ready = true; resize(); updateSignal();
      if (!runtime.paused) raf = requestAnimationFrame(tick);
    } catch {
      loadError = 'ARTWORK_LOAD_FAILED';
      document.getElementById('transmission').textContent = '画面未能载入，请重新打开壁纸。';
    }
  }
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startScene, { once: true });
  else startScene();
})();

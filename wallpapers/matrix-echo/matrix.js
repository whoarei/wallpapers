(() => {
  'use strict';
  function startScene() {
    const runtime = window.WallpaperRuntime;
    runtime.refresh();
    const canvas = document.getElementById('matrix');
    const ctx = canvas.getContext('2d', { alpha: false });
    const background = document.createElement('canvas');
    const atlas = document.createElement('canvas');
    const glyphs = '012345789アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホミムメモヤユヨラリルレロワヲン<>:={}';
    const cell = 24, atlasCell = 32;
    let width = 0, height = 0, time = 0, frames = 0, last = null, lastPaint = 0, raf = 0;
    let paused = false, speedIndex = 0, lightIndex = 1, lastInput = 0, interactions = 0;
    let streams = [], ripples = [], poemRain = null;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const speeds = [.52, 1, 1.6], speedNames = ['缓慢', '标准', '疾速'];
    const lights = [.62, 1, 1.32], lightNames = ['柔和', '标准', '明亮'];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const culture = window.MatrixCulture.create(runtime, wake, () => { if (width && height) draw(); });
    function randomGenerator(seed) {
      return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    }
    function makeAtlas() {
      atlas.width = glyphs.length * atlasCell;
      atlas.height = atlasCell * 3;
      const c = atlas.getContext('2d');
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '19px "Noto Sans Mono CJK JP", "Noto Sans CJK JP", monospace';
      ['#2cbf5b', '#66f28f', '#d9ffe5'].forEach((color, row) => {
        c.fillStyle = color;
        for (let i = 0; i < glyphs.length; i++) c.fillText(glyphs[i], i * atlasCell + 16, row * atlasCell + 16);
      });
    }
    function glyph(index, x, y, size, row, alpha) {
      ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
      ctx.drawImage(atlas, (index % glyphs.length) * atlasCell, row * atlasCell, atlasCell, atlasCell,
        x - size / 2, y - size / 2, size, size);
    }
    function glow(c, x, y, rx, ry, color) {
      c.save(); c.translate(x, y); c.scale(rx, ry);
      const gradient = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, color); gradient.addColorStop(1, '#00000000');
      c.fillStyle = gradient; c.fillRect(-1, -1, 2, 2); c.restore();
    }
    function resize() {
      poemRain = null;
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      background.width = width; background.height = height;
      const c = background.getContext('2d');
      c.fillStyle = '#020704'; c.fillRect(0, 0, width, height);
      glow(c, width * .67, height * .45, width * .48, height * .8, '#123b2360');
      glow(c, width * .62, height * .86, width * .45, height * .17, '#1a5a332d');
      const random = randomGenerator(19990331);
      streams = [];
      for (let layer = 0; layer < 3; layer++) {
        const gap = [13, 21, 35][layer];
        for (let x = -gap; x < width + gap; x += gap) {
          if (random() < .10) continue;
          streams.push({ x: x + random() * 5, layer, size: [12, 18, 27][layer],
            speed: 28 + random() * 55 + layer * 18, offset: random() * (height + 650),
            length: 18 + Math.floor(random() * 35), seed: Math.floor(random() * 10000),
            alpha: [.35, 1, .68][layer] * (.35 + random() * .65) });
        }
      }
      // Paint one complete frame on resize, including when manually paused.
      draw();
    }
    function streamHead(stream) {
      const period = height + stream.length * stream.size * 1.18 + 240;
      return ((stream.offset + time * stream.speed) % period) - 100;
    }
    function preparePoemRain() {
      const verse = culture.getVerse();
      if (!verse) { poemRain = null; return; }
      if (poemRain?.serial === verse.serial) {
        const drained = [...poemRain.members].every(([s, member]) =>
          member.head + (time - poemRain.born) * s.speed - (member.length - 1) * poemRain.step > height + 30);
        if (drained) {
          // All old code and poem cells have left. Start the next ordinary
          // stream above the screen instead of jumping back into its middle.
          for (const s of poemRain.members.keys()) s.offset = -time * s.speed;
          culture.finishVerse(verse.serial); poemRain = null;
        }
        return;
      }
      const chars = Array.from(verse.verse);
      const dh = Math.min(height * .40, width * (width < 650 ? .66 : .28));
      const doorX = width * (width < 650 ? .57 : .655);
      // Reuse actual rain lanes and their font sizes. Long verses can use the
      // finer back layer to fit on portrait screens without dropping characters.
      let lanes, rows, columns, step;
      for (const layer of [1, 0]) {
        lanes = streams.filter(s => s.layer === layer && s.x > width * .17 && s.x < width * .95 && Math.abs(s.x - doorX) > dh * .215 + 16);
        step = [12, 18][layer] * 1.18;
        rows = Math.min(chars.length, Math.max(4, Math.floor(height * .56 / step)));
        columns = Math.ceil(chars.length / rows);
        if (lanes.length >= columns) break;
      }
      if (!lanes.length) return;
      rows = Math.max(rows, Math.ceil(chars.length / lanes.length));
      columns = Math.ceil(chars.length / rows);
      const possible = lanes.length - columns + 1;
      const start = Math.floor((verse.serial * .381966 % 1) * possible);
      // The first character leads the falling stream; later characters trail
      // above it. Long verses continue in the next column to the left.
      const chosen = lanes.slice(start, start + columns).reverse();
      const carrier = chosen[0];
      let entryDelay = 0;
      const members = new Map(chosen.map((s, i) => {
        const text = chars.slice(i * rows, (i + 1) * rows), head = streamHead(s);
        // Keep the lane's current phase and velocity. Only cells still above
        // the viewport become poetry, so existing visible code never changes.
        const firstRow = Math.max(1, Math.ceil((head + s.size + s.speed * entryDelay) / step));
        entryDelay = Math.max(entryDelay, (firstRow * step - head) / s.speed) + .65;
        return [s, { chars: text, head, firstRow, length: Math.max(s.length, firstRow + text.length) }];
      }));
      poemRain = { serial: verse.serial, verse: verse.verse, born: time, speed: carrier.speed, rows, step, members };
    }
    function rainPoemState() {
      if (!poemRain) return null;
      return { verse: poemRain.verse, serial: poemRain.serial, speed: poemRain.speed, step: poemRain.step,
        columns: [...poemRain.members].map(([s, member]) => {
          const bottom = member.head + (time - poemRain.born) * s.speed - member.firstRow * poemRain.step;
          return { text: member.chars.join(''), x: s.x + pointer.x * (s.layer + 1) * 2,
            top: bottom - (member.chars.length - 1) * poemRain.step, bottom, speed: s.speed, fontSize: s.size, layer: s.layer };
        }) };
    }
    function drawRain() {
      preparePoemRain();
      const shift = Math.floor(time * 8);
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const s of streams) {
        const poem = poemRain?.members.get(s);
        const step = s.size * 1.18;
        const head = poem ? poem.head + (time - poemRain.born) * s.speed : streamHead(s);
        const length = poem ? poem.length : s.length;
        if (poem) ctx.font = `${s.size}px MatrixKai`;
        for (let j = 0; j < length; j++) {
          const y = head - j * step;
          if (y < -30 || y > height + 30) continue;
          let x = s.x + pointer.x * (s.layer + 1) * 2;
          let boost = 0;
          for (const ripple of ripples) {
            const dx = x - ripple.x, dy = y - ripple.y;
            const distance = Math.hypot(dx, dy);
            const age = time - ripple.born;
            const wave = Math.exp(-Math.pow((distance - age * 210) / 38, 2)) * Math.max(0, 1 - age / 3.2);
            x += (dx / (distance || 1)) * wave * 17; boost += wave * .75;
          }
          // A quiet region at the left keeps desktop shortcuts legible.
          const quiet = .38 + .62 * Math.min(1, Math.max(0, (x / width - .12) / .38));
          const poemIndex = poem ? j - poem.firstRow : -1;
          if (poemIndex >= 0 && poemIndex < poem.chars.length) {
            ctx.globalAlpha = Math.min(1, (.72 + boost * .4) * lights[lightIndex]);
            ctx.fillStyle = poemIndex < 2 ? '#a4f6bb' : '#58d47d';
            ctx.fillText(poem.chars[poemIndex], x, y);
            continue;
          }
          if (j >= s.length) continue;
          const tail = Math.pow(1 - j / s.length, 1.15);
          const mutation = j % 7 === 0 ? shift : Math.floor(shift / 7);
          const code = (s.seed + j * 31 + mutation * 13) % glyphs.length;
          glyph(code, x, y, s.size * 1.25, j === 0 ? 2 : (j < 3 || boost > .3 ? 1 : 0),
            (s.alpha * tail * quiet + boost) * lights[lightIndex]);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    function drawFloor(cx, floorY, doorHeight) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, floorY, width, height - floorY); ctx.clip();
      const ground = ctx.createLinearGradient(0, floorY, 0, height);
      ground.addColorStop(0, '#020804ec'); ground.addColorStop(.5, '#031009c4'); ground.addColorStop(1, '#020704fa');
      ctx.fillStyle = ground; ctx.fillRect(0, floorY, width, height - floorY);
      ctx.lineWidth = .6;
      for (let i = -11; i <= 11; i++) {
        ctx.strokeStyle = '#458e5820'; ctx.beginPath(); ctx.moveTo(cx + i * 4, floorY);
        ctx.lineTo(cx + i * width * .15, height); ctx.stroke();
      }
      for (let i = 1; i < 10; i++) {
        const y = floorY + Math.pow(i / 10, 2.4) * (height - floorY);
        ctx.strokeStyle = `rgba(82,153,101,${.03 + i * .006})`;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      glow(ctx, cx, floorY + doorHeight * .23, doorHeight * .55, doorHeight * .36, '#58ed7f24');
      for (let i = 0; i < 85; i++) {
        const p = i / 85;
        const y = floorY + p * doorHeight * .75;
        ctx.globalAlpha = (1 - p) * .21;
        ctx.fillStyle = '#68f799';
        const jitter = Math.sin(i * 43.6 + time * .4) * (1 + p * 5);
        ctx.fillRect(cx - doorHeight * .19 + jitter, y, doorHeight * .38, .6 + p * 1.5);
      }
      ctx.globalAlpha = 1; ctx.restore();
    }
    function doorGeometry() {
      const compact = width < 650;
      const dh = Math.min(height * .40, width * (compact ? .66 : .28));
      const dw = dh * .43;
      const cx = width * (compact ? .57 : .655) + pointer.x * 5;
      const floor = height * .735 + pointer.y * 2;
      const top = floor - dh;
      return { cx, floor, top, dh, dw };
    }
    function drawDoor({ cx, floor, top, dh, dw }) {
      glow(ctx, cx, top + dh * .5, dh * .85, dh * .94, '#36bb5a18');
      drawFloor(cx, floor, dh);
      // The doorway is a dark cut in the code, rimmed with pale green light.
      ctx.fillStyle = '#010703'; ctx.fillRect(cx - dw / 2, top, dw, dh);
      const inner = ctx.createLinearGradient(cx - dw / 2, top, cx + dw / 2, floor);
      inner.addColorStop(0, '#244f2e'); inner.addColorStop(.14, '#06180d'); inner.addColorStop(.7, '#020a05'); inner.addColorStop(1, '#164a28');
      ctx.fillStyle = inner; ctx.fillRect(cx - dw / 2 + 3, top + 3, dw - 6, dh - 3);
      ctx.save();
      ctx.shadowColor = '#83ffac'; ctx.shadowBlur = 15 * lights[lightIndex];
      ctx.strokeStyle = '#acfac1'; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(cx - dw / 2, floor); ctx.lineTo(cx - dw / 2, top);
      ctx.lineTo(cx + dw / 2, top); ctx.lineTo(cx + dw / 2, floor); ctx.stroke();
      ctx.shadowBlur = 5; ctx.strokeStyle = '#6cc78755'; ctx.lineWidth = .7;
      ctx.strokeRect(cx - dw / 2 - 6, top - 6, dw + 12, dh + 6);
      ctx.restore();
      glow(ctx, cx, floor - 2, dw * 1.5, dh * .07, '#9effb94b');
      // A solitary, coat-wearing silhouette gives the digital space a human scale.
      const h = dh * .41, x = cx + dw * .03, y = floor - 1, unit = h / 100;
      ctx.save(); ctx.translate(x, y); ctx.scale(unit, unit);
      ctx.fillStyle = '#010502';
      ctx.beginPath(); ctx.ellipse(0, -92, 6.6, 8.4, -.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4, -84); ctx.lineTo(-13, -79); ctx.quadraticCurveTo(-17, -61, -18, -35);
      ctx.lineTo(-12, -34); ctx.lineTo(-9, -67); ctx.lineTo(-9, -43); ctx.lineTo(-17, -10);
      ctx.quadraticCurveTo(0, -6, 16, -11); ctx.lineTo(9, -45); ctx.lineTo(10, -66);
      ctx.lineTo(14, -36); ctx.lineTo(20, -36); ctx.lineTo(15, -75); ctx.quadraticCurveTo(12, -81, 5, -84); ctx.closePath(); ctx.fill();
      ctx.fillRect(-8, -15, 6, 15); ctx.fillRect(3, -15, 6, 15);
      ctx.strokeStyle = '#78d29460'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(-13, -78); ctx.lineTo(-17, -40); ctx.moveTo(14, -76); ctx.lineTo(19, -37); ctx.stroke();
      ctx.restore();
    }
    function draw(dt = 0) {
      const door = doorGeometry();
      culture.update(dt, width, height, pointer.x, pointer.y, door);
      ctx.globalAlpha = 1; ctx.drawImage(background, 0, 0);
      drawRain(); drawDoor(door);
      // Soft edge falloff and fine scanlines unify the layers without flashing.
      const shade = ctx.createRadialGradient(width * .64, height * .47, height * .13, width * .55, height * .5, Math.max(width, height) * .78);
      shade.addColorStop(0, '#00000000'); shade.addColorStop(1, '#000000b3');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#00000016'; for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
      frames++;
    }
    function tick(now) {
      raf = 0;
      if (runtime.paused) { last = null; return; }
      if (last === null) { last = now; lastPaint = now - 34; }
      if (now - lastPaint >= 1000 / 30 - .5) {
        const dt = Math.min((now - last) / 1000, .1);
        last = now; lastPaint = now;
        time += dt * speeds[speedIndex] * (reducedMotion ? .25 : 1);
        ripples = ripples.filter(r => time - r.born < 3.2);
        pointer.x += (pointer.targetX - pointer.x) * .05;
        pointer.y += (pointer.targetY - pointer.y) * .05;
        if (runtime.canIdle() && time - lastInput > 4) document.body.classList.add('idle');
        else document.body.classList.remove('idle');
        draw(dt);
      }
      raf = requestAnimationFrame(tick);
    }
    function wake() { lastInput = time; document.body.classList.remove('idle'); }
    function togglePause() {
      paused = !paused;
      const button = document.getElementById('pause');
      button.textContent = paused ? '继续' : '暂停'; button.setAttribute('aria-pressed', String(paused));
      runtime.setUserPaused(paused); wake();
    }
    function changeSpeed() {
      if (!runtime.canAct()) return;
      speedIndex = (speedIndex + 1) % speeds.length;
      document.getElementById('speed').textContent = '流速 · ' + speedNames[speedIndex]; wake();
    }
    function changeLight() {
      if (!runtime.canAct()) return;
      lightIndex = (lightIndex + 1) % lights.length;
      document.getElementById('light').textContent = '辉光 · ' + lightNames[lightIndex]; wake();
    }
    document.getElementById('pause').addEventListener('click', togglePause);
    document.getElementById('speed').addEventListener('click', changeSpeed);
    document.getElementById('light').addEventListener('click', changeLight);
    function fullscreen() {
      if (!runtime.capabilities.fullscreen) return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    }
    document.getElementById('fullscreen').addEventListener('click', fullscreen);
    document.addEventListener('keydown', event => {
      if (!runtime.capabilities.keyboard || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target.closest('button,input,textarea,select,[contenteditable],[data-scene-panel]')) return;
      if (event.code === 'Space') { event.preventDefault(); togglePause(); }
      if (event.key.toLowerCase() === 'f') fullscreen();
    });
    canvas.addEventListener('click', event => {
      wake(); if (!runtime.canAct()) return;
      const box = canvas.getBoundingClientRect();
      ripples.push({ x: (event.clientX - box.left) * width / box.width,
        y: (event.clientY - box.top) * height / box.height, born: time });
      if (ripples.length > 5) ripples.shift();
      interactions++;
    });
    document.addEventListener('pointermove', event => {
      wake(); if (!runtime.capabilities.pointerMove || !runtime.canAct()) return;
      pointer.targetX = event.clientX / width * 2 - 1;
      pointer.targetY = event.clientY / height * 2 - 1;
    }, { passive: true });
    document.addEventListener('pointerdown', wake, { passive: true });
    document.addEventListener('focusin', wake);
    runtime.onStateChange(() => {
      cancelAnimationFrame(raf); raf = 0; last = null; lastPaint = 0; wake();
      if (!runtime.paused) raf = requestAnimationFrame(tick);
    });
    runtime.registerActions([
      { id: 'speed', label: '切换代码雨流速', run: () => { changeSpeed(); return { speed: speedNames[speedIndex] }; } },
      { id: 'light', label: '切换矩阵辉光', run: () => { changeLight(); return { light: lightNames[lightIndex] }; } }
    ]);
    addEventListener('resize', resize);
    addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
    makeAtlas(); resize();
    if (!runtime.paused) raf = requestAnimationFrame(tick);
    window.matrixEcho = { getState: () => ({ width, height, time, frames, paused, speedIndex, lightIndex,
      interactions, rippleCount: ripples.length, streams: streams.length, targetFps: 30,
      rainPoem: rainPoemState(), culture: culture.getState() }) };
  }
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startScene, { once: true });
  else startScene();
})();

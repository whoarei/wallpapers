(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const before = $('before').getContext('2d'), after = $('after').getContext('2d');
  const names = ['伸展与推水', '抓水与回臂', '高肘前移', '推水末段', '交替伸展', '侧身换气', '前摆回臂', '重新入水'];
  const notes = [
    '伸展与推水：前臂向前延伸，另一侧完成推水。',
    '抓水与回臂：水下手臂建立支点，另一侧手肘开始出水。',
    '高肘前移：手肘领先，前臂放松向前摆动。',
    '推水末段：手向髋侧加速，身体保持修长。',
    '交替伸展：另一侧进入推进阶段，双腿持续交替打水。',
    '侧身换气：随肩带侧转，口部接近水线，避免正面抬头。',
    '前摆回臂：手臂越过肩部，换气结束，头准备回水。',
    '重新入水：向前延伸，回到下一个周期。'
  ];
  const period = 2.4;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = reduced, phase = 0, elapsed = 0, speed = 1, water = false, ready = false, visible = true;
  let last = 0, lastDraw = 0, renderer;
  const images = {};
  const paths = { poses: '../../wallpapers/blue-weightless/assets/heroine-poses.png', strokes: '../../wallpapers/blue-weightless/assets/heroine-strokes.png', glide: '../../wallpapers/blue-weightless/assets/heroine-glide.png', sequence: 'assets/freestyle-keyposes.png' };
  for (const [key, path] of Object.entries(paths)) { images[key] = new Image(); images[key].src = path; }
  const frames = [];
  const cells = Array.from({ length: 8 }, (_, i) => [i % 2 * 768, Math.floor(i / 2) * 256, 768, 256]);
  // The overhead recovery in drawing 7 extends above its nominal grid cell.
  // Preserve the whole hand/elbow rather than clipping to an assumed regular grid.
  cells[6] = [0, 744, 768, 280];
  cells[4] = [0, 512, 768, 232]; // Do not include drawing 7's raised arm.
  // Small per-drawing alignment corrections. These are still key-pose drafts:
  // drawing registration and limb-side continuity must be refined before shipping.
  const hips = [[354, 173], [343, 181], [352, 164], [342, 166], [355, 162], [344, 163], [358, 183], [345, 157]];
  function sync() {
    const index = Math.min(7, Math.floor(phase * 8));
    $('play').textContent = paused ? '播放预演' : '暂停预演';
    $('play').setAttribute('aria-pressed', String(!paused));
    $('scrub').value = index;
    $('position').value = `${String(index + 1).padStart(2, '0')} / 08`;
    $('phase-note').textContent = notes[index];
    for (let i = 0; i < frames.length; i++) frames[i].setAttribute('aria-pressed', String(i === index));
  }
  function background(c) {
    const g = c.createLinearGradient(0, 0, 0, 560);
    g.addColorStop(0, '#56818c'); g.addColorStop(.5, '#366d7e'); g.addColorStop(1, '#1d4f68');
    c.fillStyle = g; c.fillRect(0, 0, 1000, 560);
    c.strokeStyle = '#c5ede021'; c.lineWidth = 1;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 350 + i * 45); c.lineTo(1000, 350 + i * 45); c.stroke(); }
  }
  function waterOverlay(c) {
    if (!water) return;
    c.fillStyle = '#3d9aa825'; c.fillRect(0, 356, 1000, 204);
    c.strokeStyle = '#e3f5e888'; c.lineWidth = 2; c.beginPath();
    for (let x = 0; x <= 1000; x += 10) {
      const y = 356 + Math.sin(x * .018 + elapsed * 2.3) * 2;
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }
  function draw() {
    if (!ready) return;
    background(before); background(after);
    const current = renderer.draw({ motion: 'freestyle', t: 17 + elapsed, angle: 0 });
    // Register the actual illustrated hip (345,298), not just the old anchor.
    before.drawImage(current, -108.4, -161.8, 1228.8, 1024);
    const index = Math.min(7, Math.floor(phase * 8)), [hx, hy] = hips[index];
    const [sx, sy, sw, sh] = cells[index];
    after.drawImage(images.sequence, sx, sy, sw, sh, 440 - hx, 366 - hy, sw, sh);
    waterOverlay(before); waterOverlay(after); sync();
  }
  function seek(index) { phase = ((index % 8) + 8) % 8 / 8; elapsed = phase * period; paused = true; last = 0; draw(); }
  function tick(now) {
    if (!last) last = now;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (ready && visible && !paused && now - lastDraw >= 1000 / 30 - 1) {
      elapsed += dt * speed; phase = (elapsed % period) / period; lastDraw = now; draw();
    } else if (ready && visible && !paused) {
      elapsed += dt * speed; phase = (elapsed % period) / period;
    }
    requestAnimationFrame(tick);
  }
  $('play').addEventListener('click', () => { paused = !paused; last = 0; sync(); });
  $('previous').addEventListener('click', () => seek(Math.floor(phase * 8) - 1));
  $('next').addEventListener('click', () => seek(Math.floor(phase * 8) + 1));
  $('scrub').addEventListener('input', event => seek(Number(event.target.value)));
  $('speed').addEventListener('change', event => { speed = Number(event.target.value); });
  $('water').addEventListener('change', event => { water = event.target.checked; draw(); });
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; last = 0; });
  document.addEventListener('keydown', event => {
    if (/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); $('play').click(); }
    if (event.code === 'ArrowRight') { event.preventDefault(); $('next').click(); }
    if (event.code === 'ArrowLeft') { event.preventDefault(); $('previous').click(); }
  });
  for (const id of ['previous', 'play', 'next', 'scrub']) $(id).disabled = true;
  Promise.all(Object.values(images).map(image => image.decode())).then(() => {
    if (images.sequence.naturalWidth !== 1536 || images.sequence.naturalHeight !== 1024) throw new Error('Unexpected key-pose sheet dimensions');
    renderer = new SwimCharacter.Renderer(images);
    for (let i = 0; i < 8; i++) {
      const preview = document.createElement('canvas'); preview.width = 384; preview.height = 128;
      const [sx, sy, sw, sh] = cells[i], factor = Math.min(384 / sw, 128 / sh);
      preview.getContext('2d').drawImage(images.sequence, sx, sy, sw, sh,
        (384 - sw * factor) / 2, (128 - sh * factor) / 2, sw * factor, sh * factor);
      const button = document.createElement('button'), image = document.createElement('img'), label = document.createElement('span');
      button.className = 'frame'; button.setAttribute('aria-label', `关键姿态 ${i + 1}：${names[i]}`);
      image.src = preview.toDataURL(); image.alt = ''; label.textContent = `${i + 1} · ${names[i]}`;
      button.append(image, label); button.addEventListener('click', () => seek(i)); $('frames').append(button); frames.push(button);
    }
    ready = true; $('loading').textContent = '';
    for (const id of ['previous', 'play', 'next', 'scrub']) $(id).disabled = false;
    draw(); requestAnimationFrame(tick);
  }).catch(error => { $('loading').textContent = `原画加载失败，请通过本地 HTTP 预览打开：${error.message}`; });
  window.motionStudy = { seek, state: () => ({ ready, paused, phase, index: Math.floor(phase * 8), elapsed, speed, water }) };
  sync();
})();

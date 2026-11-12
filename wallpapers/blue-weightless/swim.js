(() => {
  'use strict';
function startScene() {
const runtime = window.WallpaperRuntime;
runtime.refresh();
  const J = window.SwimJourney;
  const { TAU, SURFACE, WORLD_WIDTH, DURATION, clamp, lerp, smooth, stages } = J;
  const $ = id => document.getElementById(id);
  const canvas = $('pool'), ctx = canvas.getContext('2d', { alpha: false });
  const actor = document.createElement('canvas'), ac = actor.getContext('2d');
  const wetActor = document.createElement('canvas'), wc = wetActor.getContext('2d');
  actor.width = wetActor.width = SwimCharacter.WIDTH; actor.height = wetActor.height = SwimCharacter.HEIGHT;
  let character;
  let width = 1600, height = 900, viewWidth = 1778, renderScale = .9;
  let time = 0, last = 0, drawAt = 0, frames = 0, camera = 0, targetCamera = 0;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches, following = true, garden = true, speed = 1;
  let ready = false, chapter = -1, lastActivity = performance.now(), seeking = false, pointer = null, hidden = false;
  let toastTimer = 0, fishReaction = 0, totalSplashes = 0;
  const ripples = [], fish = [], plants = [], bubbles = [];
  let seed = 28011;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pool = new Image(), poses = new Image(), strokes = new Image(), glide = new Image();
  pool.src = 'assets/pool.png'; poses.src = 'assets/heroine-poses.png'; strokes.src = 'assets/heroine-strokes.png'; glide.src = 'assets/heroine-glide.png';
  const motionImages = Object.fromEntries(Object.keys(SwimMotion.definitions).map(name => {
    const image = new Image(); image.src = `assets/${name}-cycle.png`; return [name, image];
  }));
  // A missing new atlas must fall back to the existing complete illustration.
  const motionReady = Promise.all(Object.entries(motionImages).map(async ([name, image]) => {
    try { await image.decode(); return [name, image]; } catch { return null; }
  })).then(entries => Object.fromEntries(entries.filter(Boolean)));
  try {
    const prefs = JSON.parse(localStorage.getItem('blue-weightless.v1') || '{}');
    if ([.5, 1, 1.5].includes(prefs.speed)) speed = prefs.speed;
    if (typeof prefs.garden === 'boolean') garden = prefs.garden;
  } catch { /* Storage is optional in a wallpaper host. */ }
  function save() { try { localStorage.setItem('blue-weightless.v1', JSON.stringify({ speed, garden })); } catch { /* Offline hosts may disable storage. */ } }
  for (let i = 0; i < 84; i++) {
    const school = Math.floor(i / 7), x = 680 + school * 660 + random() * 210, y = 670 + random() * 210;
    fish.push({ x, y, anchorX: x, anchorY: y, size: 10 + random() * 13, phase: random() * TAU, pace: .13 + random() * .13, direction: school % 2 ? -1 : 1, offsetX: 0, offsetY: 0, warm: i % 13 === 0 });
  }
  for (let i = 0; i < 68; i++) plants.push({ x: 120 + i * 135 + random() * 100, y: 946 + random() * 73, h: 70 + random() * 130, bend: random() * TAU, type: i % 3, scale: .7 + random() * .5 });
  for (let i = 0; i < 60; i++) bubbles.push({ x: random() * WORLD_WIDTH, y: random(), size: .9 + random() * 2.6, phase: random() * TAU });
  function ellipse(g, x, y, rx, ry, fill, angle = 0) {
    g.beginPath(); g.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), angle, 0, TAU); g.fillStyle = fill; g.fill();
  }
  function polygon(g, points, fill) {
    g.beginPath(); points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = fill; g.fill();
  }
  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2000);
  }
  function wake() { lastActivity = performance.now(); document.body.classList.remove('idle'); }
  function resize() {
    const ratio = innerWidth / Math.max(1, innerHeight), resolution = Math.min(devicePixelRatio || 1, 1.5, 2560 / Math.max(innerWidth, innerHeight));
    width = Math.max(1, Math.round(innerWidth * resolution)); height = Math.max(1, Math.round(innerHeight * resolution));
    canvas.width = width; canvas.height = height;
    // A fixed world height preserves the whole water column on portrait displays.
    viewWidth = Math.min(WORLD_WIDTH, 1000 * ratio); renderScale = height / 1000;
    camera = clamp(camera, 0, WORLD_WIDTH - viewWidth); targetCamera = camera;
    if (following) camera = targetCamera = cameraFor(J.sample(time));
    draw();
  }
  const cameraFor = state => clamp(state.x - viewWidth * (viewWidth < 750 ? .5 : .46), 0, WORLD_WIDTH - viewWidth);
  function drawBackground() {
    const wide = Math.max(viewWidth, 3000), travel = clamp(camera / Math.max(1, WORLD_WIDTH - viewWidth));
    // Mountains recede slowly while fish, swimmer and plants move through the long pool.
    const x = -(wide - viewWidth) * travel;
    if (pool.complete && pool.naturalWidth) ctx.drawImage(pool, x, 0, wide, 1000);
    else { const g = ctx.createLinearGradient(0, 0, 0, 1000); g.addColorStop(0, '#7d86c3'); g.addColorStop(.52, '#efb1a2'); g.addColorStop(.54, '#1c9ba9'); g.addColorStop(1, '#117d8d'); ctx.fillStyle = g; ctx.fillRect(0, 0, viewWidth, 1000); }
    ctx.save(); ctx.beginPath(); ctx.rect(0, SURFACE, viewWidth, 1000 - SURFACE); ctx.clip();
    for (let i = 0; i < 9; i++) {
      const bx = ((i * 419 - camera * .22 + Math.sin(time * .05 + i) * 35) % (viewWidth + 700) + viewWidth + 700) % (viewWidth + 700) - 350;
      const g = ctx.createLinearGradient(bx, SURFACE, bx + 140, 1000);
      g.addColorStop(0, '#fbe8be08'); g.addColorStop(1, '#baf6e000');
      polygon(ctx, [[bx, SURFACE], [bx + 34, SURFACE], [bx + 160, 1000], [bx - 80, 1000]], g);
    }
    ctx.restore();
  }
  function drawDeck(x, left) {
    const sx = x - camera;
    if (left && sx < -600 || !left && sx > viewWidth + 600) return;
    const y = SURFACE - 20, deckWidth = left ? 500 : 800;
    const start = left ? sx - deckWidth : sx;
    const g = ctx.createLinearGradient(0, y - 25, 0, y + 100); g.addColorStop(0, '#f6dfc1'); g.addColorStop(.16, '#e5c5aa'); g.addColorStop(1, '#88bcb5');
    polygon(ctx, [[start, y - 8], [start + deckWidth, y - 8], [start + deckWidth, y + 55], [start, y + 55]], g);
    ctx.fillStyle = '#fff0d2'; ctx.fillRect(start, y - 10, deckWidth, 8);
    ctx.strokeStyle = '#ba9e9260'; ctx.lineWidth = 1;
    for (let i = 0; i < deckWidth; i += 70) { ctx.beginPath(); ctx.moveTo(start + i, y); ctx.lineTo(start + i, y + 55); ctx.stroke(); }
    if (!left) {
      ellipse(ctx, sx + 164, y - 11, 62, 8, '#6a7c7040');
      ctx.save(); ctx.translate(sx + 135, y - 15); ctx.rotate(-.06); ctx.fillStyle = '#d6ede1'; ctx.fillRect(0, -7, 105, 10); ctx.fillStyle = '#88bbbf'; ctx.fillRect(7, -7, 5, 10); ctx.fillRect(16, -7, 2, 10); ctx.restore();
    }
  }
  function drawLadder(front) {
    const x = 8150 - camera;
    if (x < -160 || x > viewWidth + 160) return;
    const y = SURFACE;
    ctx.save();
    const metallic = ctx.createLinearGradient(x - 5, 0, x + 8, 0); metallic.addColorStop(0, '#71a7ac'); metallic.addColorStop(.4, '#ecede0'); metallic.addColorStop(.65, '#ffebd0'); metallic.addColorStop(1, '#74a6ae');
    ctx.strokeStyle = metallic; ctx.lineWidth = front ? 6 : 5; ctx.lineCap = 'round';
    const shift = front ? 52 : 0;
    ctx.beginPath(); ctx.moveTo(x + shift - 20, y + 171); ctx.lineTo(x + shift, y - 53); ctx.bezierCurveTo(x + shift + 4, y - 101, x + shift + 54, y - 101, x + shift + 57, y - 22); ctx.stroke();
    if (!front) for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x - 16 + i * 3, y + 145 - i * 34); ctx.lineTo(x + 37 + i * 3, y + 145 - i * 34); ctx.stroke(); }
    ctx.restore();
  }
  function drawPlants(state, foreground) {
    if (!garden) return;
    for (let i = 0; i < plants.length; i++) {
      const p = plants[i]; if ((i % 3 === 0) !== foreground) continue;
      const x = p.x - camera * (foreground ? 1.07 : 1);
      if (x < -200 || x > viewWidth + 200) continue;
      const influence = Math.max(0, 1 - Math.abs(state.x - p.x) / 320) * (state.submerged ? 10 : 3);
      ctx.save(); ctx.translate(x, p.y); ctx.globalAlpha = foreground ? .88 : .53;
      for (let j = 0; j < 5; j++) {
        const length = p.h * (.5 + j * .11), lean = (j - 2) * 15 + Math.sin(time * .7 + p.bend + j * .4) * (10 + influence);
        const c = j % 2 ? '#358c80' : '#256e75';
        const gradient = ctx.createLinearGradient(0, 0, lean, -length); gradient.addColorStop(0, '#175c66'); gradient.addColorStop(1, j % 2 ? '#8dbf83' : '#56aca1');
        ctx.beginPath(); ctx.moveTo((j - 2) * 5, 0); ctx.bezierCurveTo(-4 + lean * .2, -length * .35, lean - 25, -length * .73, lean + 7, -length); ctx.bezierCurveTo(lean + 4, -length * .64, 12 + lean * .3, -length * .3, (j - 2) * 5, 0); ctx.fillStyle = gradient; ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo((j - 2) * 5, 0); ctx.quadraticCurveTo(lean * .1, -length * .6, lean + 7, -length); ctx.stroke();
      }
      if (p.type === 0) {
        const sway = Math.sin(time * .5 + p.bend) * 12;
        ctx.strokeStyle = '#7bb89c'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-20, -60, sway, -p.h * 1.1); ctx.stroke();
        for (let j = 1; j < 8; j++) { const yy = -j * p.h / 8, xx = sway * (j / 8) ** 2 - 8 * Math.sin(j / 8 * Math.PI); ellipse(ctx, xx + (j % 2 ? 6 : -6), yy, 9, 3.6, j % 2 ? '#a1c59d' : '#66ad9c', j % 2 ? -.7 : .7); }
      }
      ctx.restore();
    }
  }
  function updateFish(dt, state) {
    if (!garden) return;
    for (const f of fish) {
      const baseX = f.anchorX + Math.sin(time * f.pace + f.phase) * 170;
      const baseY = f.anchorY + Math.sin(time * .35 + f.phase) * 24;
      let pushX = 0, pushY = 0;
      const dx = baseX + f.offsetX - state.x, dy = baseY + f.offsetY - state.y, d = Math.hypot(dx, dy);
      if (d < 200 && state.y > SURFACE) {
        const force = (1 - d / 200) * 130; pushX += dx / Math.max(1, d) * force; pushY += dy / Math.max(1, d) * force; fishReaction++;
      }
      for (const r of ripples) {
        const rx = baseX - r.x, ry = baseY - r.y, distance = Math.hypot(rx, ry), age = time - r.time;
        if (distance < 230 && age >= 0 && age < 3) { const force = (1 - distance / 230) * 140 * (1 - age / 3); pushX += rx / Math.max(1, distance) * force; pushY += ry / Math.max(1, distance) * force; }
      }
      const response = Math.min(1, dt * 2.4);
      f.offsetX += (pushX - f.offsetX) * response; f.offsetY += (pushY - f.offsetY) * response;
      f.x = baseX + f.offsetX; f.y = clamp(baseY + f.offsetY, SURFACE + 50, 940);
      f.direction = Math.cos(time * f.pace + f.phase) >= 0 ? 1 : -1;
    }
  }
  function drawFish() {
    if (!garden) return;
    for (const f of fish) {
      const x = f.x - camera; if (x < -50 || x > viewWidth + 50) continue;
      ctx.save(); ctx.translate(x, f.y); ctx.scale(f.direction, 1); const s = f.size, wag = Math.sin(time * 5.5 + f.phase) * 2;
      ctx.globalAlpha = .75;
      polygon(ctx, [[-s * .6, 0], [-s * 1.15, -s * .37 + wag], [-s * .98, wag], [-s * 1.15, s * .36 + wag]], f.warm ? '#efc3a0' : '#9bcec9');
      polygon(ctx, [[-s * .12, -s * .23], [s * .15, -s * .5], [s * .4, -s * .15]], '#c0e3d29c');
      const g = ctx.createLinearGradient(0, -s * .32, 0, s * .32); g.addColorStop(0, f.warm ? '#f1dab7' : '#d3eee1'); g.addColorStop(.43, f.warm ? '#dab897' : '#8dc9ca'); g.addColorStop(1, '#448d9f');
      ellipse(ctx, 0, 0, s * .78, s * .29, g);
      ctx.strokeStyle = '#e9f5d693'; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(-s * .45, -s * .07); ctx.quadraticCurveTo(0, -s * .24, s * .46, -s * .1); ctx.stroke();
      ellipse(ctx, s * .46, -s * .06, 1.2, 1.2, '#214963'); ellipse(ctx, s * .48, -s * .09, .35, .35, '#edf4d9');
      ctx.restore();
    }
  }
  function drawCharacter(state) {
    if (!character) return;
    const frame = character.draw(state);
    ac.clearRect(0, 0, actor.width, actor.height); ac.drawImage(frame, 0, 0);
    wc.clearRect(0, 0, actor.width, actor.height); wc.drawImage(actor, 0, 0);
    wc.globalCompositeOperation = 'source-atop'; wc.fillStyle = '#1499ae19'; wc.fillRect(0, 0, actor.width, actor.height); wc.globalCompositeOperation = 'source-over';
    const scale = Math.min(1, viewWidth / 540);
    const grounded = character.getState().pose === 'stand' && (state.motion === 'stand' || state.t >= 99);
    const floorAdjustment = grounded ? SURFACE - 30 - state.y - 244 * scale : 0;
    const w = actor.width * scale, h = actor.height * scale;
    const x = state.x - camera - w / 2, y = state.y - h / 2 + floorAdjustment;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, viewWidth, SURFACE); ctx.clip(); ctx.drawImage(actor, x, y, w, h); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(0, SURFACE, viewWidth, 1000 - SURFACE); ctx.clip(); ctx.globalAlpha = .98; ctx.drawImage(wetActor, x, y, w, h); ctx.restore();
  }
  function drawWater(state) {
    const x = state.x - camera;
    ctx.save(); ctx.beginPath(); ctx.rect(0, SURFACE - 12, viewWidth, 1000 - SURFACE + 12); ctx.clip();
    // Long, low-amplitude caustics drift over the painterly plate.
    for (let i = 0; i < 25; i++) {
      const yy = SURFACE + 80 + i * 20, shift = Math.sin(time * .34 + i * 2.1) * 22;
      ctx.strokeStyle = i % 4 === 0 ? '#dcf7b825' : '#acf0d514'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(-60, yy); for (let xx = 0; xx <= viewWidth + 120; xx += 95) ctx.quadraticCurveTo(xx - 48, yy + Math.sin(xx * .009 + i + time * .3) * 8, xx + shift, yy); ctx.stroke();
    }
    if (state.motion !== 'stand' && state.motion !== 'climb' && state.y > SURFACE - 40) {
      if (state.submerged || state.motion === 'dive') {
        for (let i = 0; i < 38; i++) {
          const age = (time * .38 + i / 38) % 1;
          const bx = x - 100 - age * 380, by = state.y + 12 - age * 70 + Math.sin(i * 3.7 + time) * 12;
          ctx.strokeStyle = `rgba(213,249,234,${(1 - age) * .45})`; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(bx, by, 1 + (i % 4) * .8, 0, TAU); ctx.stroke();
        }
      } else {
        for (let i = 0; i < 12; i++) {
          const age = (time * .7 + i / 12) % 1;
          ctx.strokeStyle = `rgba(222,250,231,${(1 - age) * .3})`; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.ellipse(x - 10 - age * 280, SURFACE + 7 + age * 5, 35 + age * 120, 2 + age * 5, 0, 0, TAU); ctx.stroke();
        }
      }
    }
    for (const b of bubbles) {
      const bx = b.x - camera + Math.sin(time * .35 + b.phase) * 9; if (bx < 0 || bx > viewWidth) continue;
      const by = 980 - ((b.y * 480 + time * (4 + b.size)) % 480);
      ctx.strokeStyle = '#d2f8e952'; ctx.lineWidth = .65; ctx.beginPath(); ctx.arc(bx, by, b.size, 0, TAU); ctx.stroke();
      ellipse(ctx, bx - b.size * .3, by - b.size * .4, b.size * .22, b.size * .22, '#e7fce7aa');
    }
    for (const r of ripples) {
      const age = time - r.time; if (age < 0 || age > 4) continue;
      for (let i = 0; i < 3; i++) {
        const radius = age * 54 - i * 16; if (radius < 0) continue;
        ctx.strokeStyle = `rgba(234,249,219,${(1 - age / 4) * .4})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(r.x - camera, r.y, radius, radius * (r.y < SURFACE + 35 ? .22 : .68), 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
    // Waterline highlights and splashes are composited over the swimmer.
    if (state.y < SURFACE + 65 && state.y > SURFACE - 50 && state.motion !== 'stand' && state.motion !== 'climb') {
      const cycle = SwimMotion.sample(state);
      const intensity = (state.motion === 'butterfly' ? 1.25 : .65) * (cycle ? .2 + cycle.force * .8 : 1);
      for (let i = 0; i < 27; i++) {
        const age = (time * 1.3 + i * .073) % 1, s = Math.sin(i * 7.2), sx = x + s * (40 + age * 70), sy = SURFACE + 9 - Math.sin(age * Math.PI) * (10 + (i % 7) * 4) * intensity;
        ellipse(ctx, sx, sy, 1 + (1 - age) * 1.3, 1.5 + (1 - age) * 2, `rgba(236,252,231,${(1 - age) * .75})`, s * .5);
      }
      ctx.strokeStyle = '#e0f8e699'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x - 5, SURFACE + 8, 100, 5, 0, 0, TAU); ctx.stroke();
      if (cycle) for (const event of cycle.events) {
        const age = event.age / .58, sx = x + event.x * Math.min(1, viewWidth / 540);
        for (let i = 0; i < 13; i++) {
          const spread = Math.sin(i * 2.399), px = sx + spread * age * 46;
          const py = SURFACE + 2 - Math.sin(age * Math.PI) * (9 + i % 5 * 6) * event.strength;
          ellipse(ctx, px, py, .7 + (1 - age), 1 + (1 - age) * 1.5,
            `rgba(237,252,232,${(1 - age) * .55})`, spread * .6);
        }
      }
    }
    // The dive entry blooms once per loop, expanding and settling naturally.
    if (state.t > 6.45 && state.t < 9.25) {
      const age = (state.t - 6.45) / 2.8, entryX = 1030 - camera;
      for (let i = 0; i < 48; i++) {
        const a = i * 2.399, strength = .4 + (i % 7) / 10;
        const px = entryX + Math.cos(a) * age * 160 * strength, py = SURFACE - Math.sin(age * Math.PI) * (45 + (i % 9) * 8);
        ellipse(ctx, px, py, (1 - age) * 2 + .3, (1 - age) * 4 + .3, `rgba(244,252,229,${(1 - age) * .8})`, a);
      }
      ctx.strokeStyle = `rgba(237,255,235,${(1 - age) * .5})`; ctx.beginPath(); ctx.ellipse(entryX, SURFACE, 20 + age * 190, 5 + age * 17, 0, 0, TAU); ctx.stroke();
    }
    if (state.motion === 'climb') for (let i = 0; i < 12; i++) {
      const age = (time * .7 + i / 12) % 1; ellipse(ctx, x + Math.sin(i * 3) * 26, state.y + 40 + age * 125, 1, 2.6, `rgba(246,241,206,${(1 - age) * .7})`);
    }
  }
  function drawPoolEnd() {
    const x = 8220 - camera;
    if (x > viewWidth) return;
    const shade = ctx.createLinearGradient(0, SURFACE - 20, 0, 1000);
    shade.addColorStop(0, '#ddcfb7'); shade.addColorStop(.2, '#84bfbc'); shade.addColorStop(1, '#247f8c');
    ctx.fillStyle = shade; ctx.fillRect(x, SURFACE - 20, 800, 1000 - SURFACE + 20);
    ctx.strokeStyle = '#336f822c'; ctx.lineWidth = 1;
    for (let xx = x; xx < x + 800; xx += 70) { ctx.beginPath(); ctx.moveTo(xx, SURFACE - 20); ctx.lineTo(xx, 1000); ctx.stroke(); }
    for (let y = SURFACE + 55; y < 1000; y += 70) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 800, y); ctx.stroke(); }
  }
  function updateUI(state) {
    if (chapter !== state.stage) {
      chapter = state.stage;
      $('chapter-number').textContent = `0${chapter + 1} / 07`; $('chapter-name').textContent = stages[chapter].title; $('chapter-note').textContent = stages[chapter].note;
      document.querySelectorAll('[data-stage]').forEach((b, i) => { if (i === chapter) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      $('scrubber').setAttribute('aria-valuetext', stages[chapter].title);
    }
    $('timeline-fill').style.width = `${time / DURATION * 100}%`;
    if (!seeking) $('scrubber').value = String(time);
  }
  function draw() {
    const state = J.sample(time);
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    drawBackground(); drawDeck(500, true); drawDeck(8220, false); drawLadder(false);
    drawPlants(state, false); drawFish(); drawCharacter(state); drawWater(state); drawPoolEnd(); drawLadder(true); drawPlants(state, true);
    const vignette = ctx.createRadialGradient(viewWidth * .5, 480, 250, viewWidth * .5, 500, Math.max(viewWidth, 1000) * .75);
    vignette.addColorStop(0, '#17485e00'); vignette.addColorStop(1, '#133e641c'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, viewWidth, 1000);
    if (state.fade > 0) { ctx.fillStyle = `rgba(218,239,223,${state.fade})`; ctx.fillRect(0, 0, viewWidth, 1000); }
    frames++; updateUI(state);
  }
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = last ? Math.min(.06, (now - last) / 1000) : 0; last = now;
    if (!ready || runtime.paused || now - drawAt < 1000 / 30) return;
    const elapsed = drawAt ? Math.min(.1, (now - drawAt) / 1000) : dt; drawAt = now;
    const previous = time;
    if (now - lastActivity > 9000 && runtime.canIdle()) document.body.classList.add('idle');
    if (paused && !seeking) return;
    if (!paused && !seeking) time = (time + elapsed * speed) % DURATION;
    const state = J.sample(time);
    if (state.beginning && previous < 108) camera = targetCamera = 0;
    if (following) targetCamera = cameraFor(state);
    if (!paused) camera += (targetCamera - camera) * Math.min(1, elapsed * 3.2);
    if (!paused) updateFish(elapsed * speed, state);
    if (previous < 6.2 && time >= 6.2) totalSplashes++;
    while (ripples.length && (time - ripples[0].time > 4 || time < ripples[0].time)) ripples.shift();
    draw();
  }
  function syncControls() {
    $('pause').setAttribute('aria-pressed', String(paused)); $('pause-label').textContent = paused ? '继续' : '暂停'; $('pause-icon').textContent = paused ? '▷' : 'Ⅱ';
    $('follow').setAttribute('aria-pressed', String(following)); $('follow-label').textContent = following ? '跟随' : '自由'; $('mode-label').textContent = following ? '随她，游过一整个黄昏' : '自由探索 · 轻点「跟随」回到她身边';
    $('garden').setAttribute('aria-pressed', String(garden)); $('speed').textContent = `${speed}×`; $('speed').setAttribute('aria-label', `播放速度 ${speed} 倍`);
  }
  function seek(value) {
    if (!Number.isFinite(Number(value))) return;
    time = clamp(Number(value), 0, DURATION - .01); following = true; camera = targetCamera = cameraFor(J.sample(time)); ripples.length = 0;
    updateFish(1, J.sample(time)); syncControls(); wake(); draw();
  }
  function togglePause() { paused = !paused; runtime.setUserPaused(paused); last = drawAt = 0; syncControls(); wake(); }
  function toggleFollow() { following = !following; if (following) { targetCamera = cameraFor(J.sample(time)); if (paused) { camera = targetCamera; draw(); } } syncControls(); wake(); }
  function pan(delta) { following = false; targetCamera = clamp(targetCamera + delta, 0, WORLD_WIDTH - viewWidth); syncControls(); wake(); if (paused) { camera = targetCamera; draw(); } }
  function toggleGarden() { garden = !garden; syncControls(); save(); wake(); draw(); }
  function help(open) { $('help-panel').hidden = !open; $('help').setAttribute('aria-expanded', String(open)); wake(); if (open) $('close-help').focus(); else $('help').focus(); }
  async function fullscreen() {
    if (!runtime.capabilities.fullscreen) return;
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { toast('当前窗口不支持全屏，可使用壁纸盒子的桌面模式'); }
    wake();
  }
  $('pause').addEventListener('click', togglePause); $('follow').addEventListener('click', toggleFollow); $('garden').addEventListener('click', toggleGarden);
  $('speed').addEventListener('click', () => { speed = speed === .5 ? 1 : speed === 1 ? 1.5 : .5; syncControls(); save(); wake(); });
  $('fullscreen').addEventListener('click', fullscreen); $('help').addEventListener('click', () => help($('help-panel').hidden)); $('close-help').addEventListener('click', () => help(false));
  document.addEventListener('fullscreenchange', () => $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏'));
  document.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => seek(stages[Number(b.dataset.stage)].start)));
  $('scrubber').addEventListener('pointerdown', () => { seeking = true; });
  $('scrubber').addEventListener('input', e => { seek(e.target.value); });
  $('scrubber').addEventListener('change', () => { seeking = false; });
  addEventListener('pointerup', () => { seeking = false; });
  canvas.addEventListener('pointerdown', e => {
    if (runtime.capabilities.pointer !== 'native' || e.button !== 0) return; wake(); pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    // Desktop clicks are synthetic and have no active native pointer to capture.
    if (e.isTrusted) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    wake(); if (!pointer || e.pointerId !== pointer.id) return;
    if (Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > 6) pointer.moved = true;
    if (pointer.moved) pan((pointer.x - e.clientX) / innerHeight * 1000);
    pointer.x = e.clientX; pointer.y = e.clientY;
  });
  canvas.addEventListener('pointerup', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    if (pointer.moved) canvas.dataset.suppressClick = 'true';
    pointer = null;
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('click', e => {
    if (runtime.hostPaused || document.hidden) return;
    wake(); if (canvas.dataset.suppressClick) { delete canvas.dataset.suppressClick; return; }
    const rect = canvas.getBoundingClientRect(), y = (e.clientY - rect.top) / rect.height * 1000;
    if (y < SURFACE - 18) return;
    if (ripples.length >= 12) ripples.shift(); ripples.push({ x: (e.clientX - rect.left) / rect.width * viewWidth + camera, y: Math.max(SURFACE, y), time });
    if (paused) { updateFish(1, J.sample(time)); draw(); }
  });
  canvas.addEventListener('wheel', e => { if (runtime.capabilities.pointer !== 'native') return; e.preventDefault(); pan((e.deltaX || e.deltaY) * .8); }, { passive: false });
  addEventListener('keydown', e => {
    if (e.repeat || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    wake();
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); togglePause(); }
    else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { e.preventDefault(); pan(e.code === 'ArrowRight' ? viewWidth * .18 : -viewWidth * .18); }
    else if (/^Digit[1-7]$/.test(e.code)) seek(stages[Number(e.code.slice(-1)) - 1].start);
    else if (e.code === 'KeyA') toggleFollow();
    else if (e.code === 'KeyG') toggleGarden();
    else if (e.code === 'KeyR') seek(0);
    else if (e.code === 'KeyF') fullscreen();
    else if (e.code === 'KeyH') help($('help-panel').hidden);
    else if (e.code === 'KeyS') { hidden = !hidden; document.body.classList.toggle('clean', hidden); }
    else if (e.code === 'Escape') { if (!$('help-panel').hidden) help(false); hidden = false; document.body.classList.remove('clean'); }
  });
  document.addEventListener('visibilitychange', () => { last = drawAt = 0; });
  document.addEventListener('pointermove', wake, { passive: true });
  document.addEventListener('pointerdown', wake, { passive: true });
  document.addEventListener('focusin', wake); addEventListener('resize', resize);
  window.blueWeightless = Object.freeze({
    getState: () => ({ time, paused, following, garden, speed, camera, targetCamera, width, height, viewWidth, frames, ready, fishCount: garden ? fish.length : 0, plantCount: garden ? plants.length : 0, fishReaction, rippleCount: ripples.length, totalSplashes, targetFps: 30, characterCount: 1, ...J.sample(time), character: character?.getState() }),
    seek,
    setPaused(value) { paused = Boolean(value); runtime.setUserPaused(paused); syncControls(); },
    setCamera(value) { following = false; camera = targetCamera = clamp(Number(value) || 0, 0, WORLD_WIDTH - viewWidth); syncControls(); draw(); }
  });
  runtime.onStateChange(() => { last = drawAt = 0; pointer = null; wake(); });
  runtime.setUserPaused(paused);
  syncControls(); resize();
  Promise.all([pool.decode(), poses.decode(), strokes.decode(), glide.decode(), motionReady]).then(([, , , , cycles]) => {
    character = new SwimCharacter.Renderer({ poses, strokes, glide });
    character.setCycles(cycles, SwimMotion);
    ready = true; updateFish(1, J.sample(time)); $('loading').classList.add('loaded'); draw(); requestAnimationFrame(tick);
  }).catch(() => {
    $('loading').textContent = '画面素材未能加载，请重新打开这张壁纸。';
    const retry = document.createElement('button'); retry.textContent = '重新加载'; retry.style.cssText = 'margin-top:24px;padding:10px 18px;border:1px solid #d6f3e080;border-radius:7px;background:#165f72'; retry.addEventListener('click', () => location.reload()); $('loading').appendChild(retry);
  });
}
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startScene, { once: true });
else startScene();
})();

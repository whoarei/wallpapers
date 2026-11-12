(() => {
  'use strict';
function startScene() {
const runtime = window.WallpaperRuntime;
runtime.refresh();
  const canvas = document.querySelector('#ocean');
  const ctx = canvas.getContext('2d', { alpha: false });
  const WORLD = 7200, H = 1000, TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const mix = (a, b, n) => a + (b - a) * n;
  const smooth = n => n * n * n * (n * (n * 6 - 15) + 10);
  const mod = (n, m) => ((n % m) + m) % m;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let preferences = OceanSettings.get();
  const qualityProfiles = {
    eco: { edge: 1280, pixels: 1280 * 1280, fps: 20, detail: .5, dpr: 1 },
    balanced: { edge: 1920, pixels: 1920 * 1920, fps: 30, detail: 1, dpr: 1.5 },
    high: { edge: 3840, pixels: 3840 * 2160, fps: 30, detail: 1.4, dpr: 2 }
  };
  let detailLevel = qualityProfiles[preferences.quality].detail, qualityLevel = preferences.quality;
  let renderCost = 0, performanceSamples = 0, writingPreferences = false;
  let pausedAt = 0, suspendedAt = 0, lastWallFrame = Date.now();
  const climate = OceanClimate.create({ weather: preferences.weather, daylight: preferences.daylight });
  let atmosphere = climate.sample(0);
  let time = 0, frames = 0, paused = false, auto = !reduced.matches && preferences.tourMode === 'auto';
  let view = 1778, scale = 1, camera = 50, maxCamera = WORLD - view;
  let last = 0, lastDraw = 0, nextStop = 1, direction = 1, dwell = 14, transit = null;
  let pointer = null, lastInput = performance.now(), hudTime = -1, currentZone = -1;
  function environmentAt(depth = clamp((camera + view * .5 - 1800) / 4200, 0, 1)) {
    return OceanClimate.atDepth(atmosphere, depth);
  }
  function quietMask(screenX) {
    if (preferences.quietSide === 'none') return 1;
    const position = clamp(screenX / view, 0, 1);
    const edge = preferences.quietSide === 'left' ? position : 1 - position;
    return .28 + .72 * smooth(clamp((edge - .12) / .34, 0, 1));
  }
  // Camera gestures save an area without re-entering the settings handler.
  function rememberCamera(patch) {
    writingPreferences = true;
    try { OceanSettings.update(patch); preferences = OceanSettings.get(); }
    finally { writingPreferences = false; }
  }
  function syncLocalDaylight() {
    const date = new Date();
    atmosphere = climate.synchronizeHour(date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600, time);
  }
  let seed = 6048;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  const range = (a, b) => mix(a, b, random());
  const rgb = (a, b, f) => `rgb(${a.map((v, i) => Math.round(mix(v, b[i], f))).join(',')})`;
  function ellipse(g, x, y, rx, ry, fill, rotation = 0) {
    g.beginPath(); g.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rotation, 0, TAU); g.fillStyle = fill; g.fill();
  }
  function polygon(g, pts, fill) {
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = fill; g.fill();
  }
  function stroke(g, pts, color, w) {
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.strokeStyle = color; g.lineWidth = w; g.stroke();
  }
  function gradient(g, x, y, x2, y2, stops) {
    const grad = g.createLinearGradient(x, y, x2, y2); stops.forEach(([p, c]) => grad.addColorStop(p, c)); return grad;
  }
  function surface(x) { return 870 + Math.sin(x * .0031) * 38 + Math.sin(x * .007 + 1.2) * 22 + (x > 4500 ? Math.min(140, (x - 4500) * .08) : 0); }
  const visible = (x, size = 200, depth = 1) => x > camera * depth - size && x < camera * depth + view + size;

  // Detailed coral silhouettes are painted once, then gently moved by the current.
  function coralSprite(type, color, accent, variant) {
    const image = document.createElement('canvas'); image.width = 480; image.height = 440;
    const g = image.getContext('2d'); g.translate(240, 414); g.lineCap = 'round'; g.lineJoin = 'round';
    if (type === 'branch') {
      function branch(x, y, angle, length, width, level) {
        const endX = x + Math.cos(angle) * length, endY = y + Math.sin(angle) * length;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(angle + .25) * length * .55, y + Math.sin(angle + .25) * length * .55, endX, endY);
        g.lineWidth = width + 3; g.strokeStyle = '#052d3d70'; g.stroke();
        g.lineWidth = width; g.strokeStyle = color; g.stroke();
        g.lineWidth = Math.max(.7, width * .25); g.strokeStyle = accent; g.stroke();
        if (level) {
          branch(endX, endY, angle + range(-.35, .25), length * range(.64, .82), width * .66, level - 1);
          branch(endX, endY, angle + (random() > .5 ? 1 : -1) * range(.45, 1), length * range(.5, .75), width * .57, level - 1);
        } else { ellipse(g, endX, endY, 2.4, 2.4, accent); }
      }
      for (let i = 0; i < 6; i++) branch(range(-30, 30), 0, -Math.PI / 2 + (i - 2.5) * .23, range(52, 86), range(9, 14), 4);
    } else if (type === 'fan') {
      const tips = [];
      for (let i = 0; i < 43; i++) {
        const angle = -Math.PI + .16 + i / 42 * (Math.PI - .32), radius = 230 + Math.sin(i * 2.7 + variant) * 19;
        const x = Math.cos(angle) * radius * .83, y = Math.sin(angle) * radius - 68; tips.push([x, y]);
        g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(x * .05, -90, x * .8, y * .7, x, y); g.lineWidth = 1.7; g.strokeStyle = i % 4 ? color : accent; g.stroke();
        for (let j = 1; j < 7; j++) {
          const t = j / 7, xx = x * t * t, yy = y * t - Math.sin(t * Math.PI) * 32;
          g.beginPath(); g.moveTo(xx, yy); g.quadraticCurveTo(xx + Math.cos(angle + .5) * 22, yy - 15, xx + Math.cos(angle + .4) * 40, yy - 32); g.lineWidth = .8; g.strokeStyle = accent; g.stroke();
        }
      }
      for (let j = 2; j < 9; j++) { const t = j / 9; g.beginPath(); tips.forEach(([x, y], i) => { const xx = x * t * t, yy = y * t - Math.sin(t * Math.PI) * 32; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }); g.strokeStyle = color; g.lineWidth = .9; g.stroke(); }
      stroke(g, [[0, 0], [-2, -63], [4, -115]], color, 9);
    } else if (type === 'plate') {
      for (let i = 0; i < 7; i++) {
        const x = Math.sin(i * 5.3 + variant) * 70, y = -24 - i * 31, w = 70 + (6 - i) * 9;
        stroke(g, [[0, 0], [x * .6, y + 13]], '#4a6e67', 11 - i);
        ellipse(g, x, y + 5, w, 15, color); ellipse(g, x, y, w, 12, accent);
        for (let n = 0; n < 40; n++) { const a = random() * TAU, r = Math.sqrt(random()); ellipse(g, x + Math.cos(a) * w * r, y + Math.sin(a) * 10 * r, 1, .7, color); }
        g.beginPath(); g.ellipse(x, y, w, 12, 0, 0, Math.PI); g.strokeStyle = '#efddb27a'; g.lineWidth = 1; g.stroke();
      }
    } else if (type === 'tube') {
      for (let i = 0; i < 9; i++) {
        const x = (i - 4) * 25, y = -range(70, 185), w = range(12, 22), base = range(-5, 16), lean = range(-8, 8);
        g.fillStyle = gradient(g, x - w, 0, x + w, 0, [[0, color], [.65, accent], [1, color]]);
        g.beginPath(); g.moveTo(x - w * .7 + lean, base); g.bezierCurveTo(x - w - 8, -50, x - w, y + 28, x - w, y); g.lineTo(x + w, y); g.bezierCurveTo(x + w, y + 30, x + w + 6, -40, x + w * .75 + lean, base); g.quadraticCurveTo(x + lean, base + 9, x - w * .7 + lean, base); g.fill();
        for (let n = 0; n < 16; n++) ellipse(g, x + range(-w * .7, w * .7), range(y + 12, -8), 1.5, 2.3, '#082c4140');
        ellipse(g, x, y, w + 1, 9, accent); ellipse(g, x, y - .3, w * .68, 5.5, '#10364e');
      }
    } else {
      for (let i = 0; i < 15; i++) {
        const x = range(-125, 125), y = -range(20, 60), r = range(25, 51);
        const grad = g.createRadialGradient(x - r * .3, y - r * .4, 1, x, y, r); grad.addColorStop(0, accent); grad.addColorStop(1, color);
        ellipse(g, x, y, r, r * .9, grad);
        for (let j = 0; j < 10; j++) { g.beginPath(); const yy = y - r * .65 + j * r * .14; g.moveTo(x - r * .66, yy); for (let k = 0; k < 12; k++) g.lineTo(x - r * .66 + k * r * .12, yy + Math.sin(k * 2 + j) * 3); g.strokeStyle = '#092f4633'; g.lineWidth = 2; g.stroke(); }
      }
    }
    return image;
  }
  const sprites = [
    ['branch', '#ce775d', '#f3bc84'], ['branch', '#b76b8b', '#ebadc0'], ['branch', '#d3a25b', '#f4d297'],
    ['fan', '#b27587', '#e8a9aa'], ['fan', '#bc9b58', '#e0c795'], ['plate', '#b18c70', '#d6bfa0'],
    ['tube', '#414f97', '#8a9cd0'], ['tube', '#856f99', '#c1a0be'], ['brain', '#496b6a', '#9cae85'],
    ['branch', '#4a8698', '#8ac7c7'], ['plate', '#547c7c', '#8ab6a5'], ['brain', '#54777b', '#8ab0a6']
  ].map((c, i) => coralSprite(...c, i));
  const corals = [];
  // Distinct reef islands leave open sand and long sight-lines between them.
  const reefs = [[100, 270], [740, 230], [1570, 290], [2140, 180], [2730, 180], [3970, 190], [4550, 220], [6250, 210], [7000, 170]];
  for (const [center, extent] of reefs) {
    const count = center > 4600 ? 8 : center > 2400 && center < 4100 ? 9 : 13;
    for (let i = 0; i < count; i++) {
      const x = center + range(-extent, extent), deep = x > 4600, forest = x > 2400 && x < 4000;
      const front = i >= count - 2;
      corals.push({ x, y: surface(x) + range(-24, 90), s: range(.28, front ? .9 : .72) * (forest ? .64 : deep ? .78 : 1), type: deep ? 9 + i % 3 : Math.floor(random() * 12), phase: random() * TAU, depth: front ? 1.035 : i < 4 ? .8 : 1, front });
    }
  }
  corals.sort((a, b) => a.y - b.y);
  const kelpBeds = [[2310, 2760], [2860, 3190], [3610, 4200]];
  const kelps = Array.from({ length: 43 }, (_, i) => {
    const bed = kelpBeds[i % kelpBeds.length];
    return { x: range(...bed), y: range(945, 1040), h: range(310, 770), s: range(.65, 1.18), phase: random() * TAU, front: i > 35, depth: i < 15 ? .8 : 1, lean: range(-70, 70), leaves: 10 + i % 5 };
  });
  const grasses = Array.from({ length: 78 }, () => ({ x: random() * WORLD, y: range(920, 1030), h: range(30, 110), phase: random() * TAU, s: range(.5, 1.3) }));
  const motes = Array.from({ length: 92 }, () => ({ x: random() * WORLD, y: random() * H, r: range(.5, 1.7), speed: range(.8, 3), phase: random() * TAU, depth: range(.65, 1.08) }));
  const bubbles = [];
  const blooms = [], sparks = [];
  let interactions = 0, animalTouches = 0, lastBloom = -Infinity, suppressClickUntil = 0;
  const motion = (facing = 1) => ({ ox: 0, oy: 0, vx: 0, vy: 0, facing, heading: facing < 0 ? Math.PI : 0, turn: 0, tilt: 0, scaredUntil: -Infinity, avoidUntil: -Infinity, goalX: 0, goalY: 0, stroke: 0 });
  const turtleMotion = motion(), rayMotion = motion();
  const ambientBubbles = Array.from({ length: 27 }, (_, i) => ({ x: [570, 3160, 6380][i % 3] + range(-14, 14), phase: random(), r: range(1.4, 3.8), speed: range(.04, .07) }));
  const fish = [];
  const schools = [
    { x: 800, y: 430, n: 35, spread: 680, type: 0, s: .6, speed: 16 },
    { x: 1710, y: 320, n: 58, spread: 500, type: 3, s: .35, speed: -22 },
    { x: 1400, y: 625, n: 13, spread: 920, type: 1, s: .8, speed: 12 },
    { x: 3100, y: 470, n: 31, spread: 570, type: 3, s: .5, speed: 15 },
    { x: 3700, y: 670, n: 10, spread: 430, type: 2, s: .8, speed: -12 },
    { x: 5600, y: 460, n: 42, spread: 1100, type: 4, s: .4, speed: -18 }
  ];
  schools.forEach((s, schoolIndex) => {
    s.index = schoolIndex; s.members = [];
    for (let i = 0; i < s.n; i++) {
      const f = { school: s, slot: i, x: range(-s.spread, s.spread), y: range(-115, 115), flowX: 0, flowY: 0, size: s.s * range(.7, 1.25), phase: random() * TAU, ...motion(Math.sign(Math.cos(s.x))) };
      fish.push(f); s.members.push(f);
    }
  });
  const jellies = Array.from({ length: 18 }, () => ({ x: range(4740, 7090), y: range(210, 780), size: range(.3, 1), phase: random() * TAU, echoes: [], ...motion() }));

  // All interactions live in world coordinates and use the scene clock. Pausing,
  // panning, host suspension and different display densities need no extra timers.
  const animalEnvironment = x => typeof environmentAt === 'function' ? environmentAt(clamp((x - 1800) / 4200, 0, 1)) : { current: .12, night: 0, visibility: 1 };
  function fishHome(f) {
    const s = f.school, rate = Math.abs(s.speed) / 450, cycle = time * rate + s.x;
    // A school shares a broad oval route. Its two loose ribbons occasionally
    // separate around a gap, then reunite without every fish reversing at once.
    const gathering = (.92 + Math.sin(time * .013 + s.index * 1.7) * .08) * (1 - (s.shelter || 0) * .16);
    const split = Math.pow(Math.max(0, Math.sin(time * .018 + s.index * 2.1)), 6);
    const lane = f.slot % 2 ? 1 : -1;
    const wave = time * .19 + f.x * .006 + s.index;
    return {
      x: s.x + f.x * gathering + Math.sin(cycle) * 260 + Math.sin(wave) * 12 + f.flowX,
      y: s.y + f.y * (.82 + gathering * .18) + Math.cos(cycle) * 27 + Math.sin(wave * .8) * 8 + lane * split * 35 + f.flowY,
      vx: Math.cos(cycle) * rate * 260 + Math.cos(wave) * 2.28,
      vy: -Math.sin(cycle) * rate * 27 + Math.cos(wave * .8) * 1.22
    };
  }
  const turtleHome = () => {
    const phase = .022 * (time + 18 * Math.sin(time * .045));
    const activity = .2 + .8 * (.5 + Math.cos(time * .045) * .5);
    return { x: 1300 + Math.sin(phase) * 700, y: 330 + Math.sin(time * .08) * 24 + (1 - activity) * 45, vx: Math.cos(phase) * 15.4 * (1 + .81 * Math.cos(time * .045)), vy: Math.cos(time * .08) * 1.92, activity };
  };
  const rayHome = () => {
    const phase = .018 * (time + 14 * Math.sin(time * .035));
    return { x: 3950 + Math.sin(phase) * 1020, y: 360 + Math.sin(time * .065) * 58, vx: Math.cos(phase) * 18.36 * (1 + .49 * Math.cos(time * .035)), vy: Math.cos(time * .065) * 3.77, activity: .76 + Math.cos(time * .035) * .24 };
  };
  function jellyBeat(j) {
    const phase = mod(j.stroke / 4.8 + j.phase / TAU, 1);
    // Short bell contraction, a delayed upward impulse, then a long release.
    const contraction = phase < .24 ? Math.sin(phase / .24 * Math.PI) : 0;
    const lift = phase > .12 && phase < .85 ? Math.sin((phase - .12) / .73 * Math.PI) : 0;
    return { contraction, lift };
  }
  const jellyHome = j => {
    const beat = jellyBeat(j);
    return { x: j.x + Math.sin(time * .11 + j.phase) * 23, y: j.y + Math.sin(time * .08 + j.phase) * 17 - beat.lift * 13, vx: Math.cos(time * .11 + j.phase) * 2.53, vy: 0 };
  };
  const position = (a, home) => ({ x: home.x + a.ox, y: home.y + a.oy });
  function jellyPosition(j) { return position(j, jellyHome(j)); }
  const alarm = a => clamp((a.scaredUntil - time) / 3.6, 0, 1);
  function moveAnimal(a, home, dt, tx = 0, ty = 0) {
    const fleeing = a.scaredUntil > time, limit = fleeing || a.avoidUntil > time ? 460 : 230;
    if (fleeing) { tx = clamp(a.goalX - home.x, -460, 460); ty = clamp(a.goalY - home.y, -280, 280); }
    // A bounded, damped spring gives the initial dart weight and a gradual return.
    a.vx += ((tx - a.ox) * 6 - a.vx * 4.6) * dt; a.vy += ((ty - a.oy) * 6 - a.vy * 4.6) * dt;
    a.vx = clamp(a.vx, -380, 380); a.vy = clamp(a.vy, -260, 260);
    a.ox = clamp(clamp(a.ox + a.vx * dt, -limit, limit), 50 - home.x, WORLD - 50 - home.x);
    a.oy = clamp(clamp(a.oy + a.vy * dt, -280, 280), 100 - home.y, 840 - home.y);
    const vx = home.vx + a.vx, vy = (home.vy || 0) + a.vy;
    if (Math.hypot(vx, vy) > 1.4) {
      const desired = Math.atan2(vy, vx), turn = Math.atan2(Math.sin(desired - a.heading), Math.cos(desired - a.heading));
      a.heading += clamp(turn, -dt * (fleeing ? 5.5 : 1.5), dt * (fleeing ? 5.5 : 1.5));
    }
    const profile = Math.cos(a.heading);
    // Three-quarter bodies retain volume through a turn; they never collapse
    // into the zero-width sprite produced by interpolating -1 directly to +1.
    a.facing = (profile < 0 ? -1 : 1) * (.58 + .42 * Math.abs(profile));
    a.turn = Math.abs(Math.sin(a.heading));
    a.tilt = mix(a.tilt, clamp(vy / 75, -.4, .4) * Math.sign(profile || 1) + Math.sin(a.heading) * .08, 1 - Math.exp(-dt * 3));
    a.stroke += dt * ((home.activity || 1) * .8 + .2 + alarm(a) * 3);
  }
  function finBeat(clock, period = 5.9) {
    const phase = mod(clock / period, 1);
    if (phase < .25) return Math.cos(phase / .25 * Math.PI);
    if (phase < .61) return -Math.cos((phase - .25) / .36 * Math.PI);
    return 1;
  }
  const rayFinWave = clock => finBeat(clock + 1.3, 7.4);
  function localPoint(x, y, p, rotation, sx, sy) {
    const dx = (x - p.x) / sx, dy = (y - p.y) / sy;
    return { x: dx * Math.cos(rotation) + dy * Math.sin(rotation), y: -dx * Math.sin(rotation) + dy * Math.cos(rotation) };
  }
  const inEllipse = (p, x, y, rx, ry) => Math.pow((p.x - x) / rx, 2) + Math.pow((p.y - y) / ry, 2) <= 1;
  function animalAt(x, y) {
    // Hit-test in the same layer order and transforms as drawing, including drift.
    for (let i = jellies.length - 1; i >= 0; i--) {
      const a = jellies[i], p = jellyPosition(a), water = currentAt(p.x, p.y);
      const local = { x: x - p.x - water.x * .4, y: y - p.y - water.y * .4 };
      if (inEllipse(local, 0, -10 * a.size, a.size * 45 + 7, a.size * 32 + 7) || inEllipse(local, 0, 65 * a.size, a.size * 24 + 5, a.size * 60)) return { type: 'jelly', a, p };
    }
    const tp = position(turtleMotion, turtleHome());
    const tl = localPoint(x, y, tp, -.11 + Math.sin(time * .17) * .03 + turtleMotion.tilt, .82 * turtleMotion.facing || .01, .82);
    if (inEllipse(tl, -12, -3, 79, 56) || inEllipse(tl, 82, 0, 30, 24) || inEllipse(tl, -48, 63, 45, 35) || inEllipse(tl, -48, -66, 45, 35)) return { type: 'turtle', a: turtleMotion, p: tp };
    const rp = position(rayMotion, rayHome());
    const rl = localPoint(x, y, rp, -.15 + rayMotion.tilt, .85 * rayMotion.facing || .01, .85);
    const flap = rayFinWave(rayMotion.stroke) * 33;
    if (inEllipse(rl, 5, 0, 100, 42) || inEllipse(rl, -55, -62 + flap * .5, 50, 70) || inEllipse(rl, -55, 62 - flap * .5, 50, 70)) return { type: 'ray', a: rayMotion, p: rp };
    for (let i = fish.length - 1; i >= 0; i--) {
      const a = fish[i], p = position(a, fishHome(a));
      const sx = a.size * a.facing, sy = a.size;
      const local = localPoint(x, y, p, Math.sin(time * .8 + a.phase) * .04 + a.tilt, sx, sy);
      if (inEllipse(local, -4, 0, 38 + 5 / Math.abs(sx), 22 + 5 / sy)) return { type: 'fish', a, p };
    }
    return null;
  }
  function startle(a, p, x, y, distance, speed, strength = 1) {
    let dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    if (d < 7) { dx = Math.sign(a.facing || 1); dy = Math.sin(a.phase || 1) * .4 - .2; d = Math.hypot(dx, dy); }
    const gentle = (reduced.matches ? .25 : 1) * preferences.interactionStrength;
    dx /= d; dy /= d;
    a.goalX = clamp(p.x + dx * distance * strength * gentle, 65, WORLD - 65);
    a.goalY = clamp(p.y + dy * distance * strength * gentle, 120, 820);
    a.vx = clamp(a.vx + dx * speed * strength * gentle, -380, 380);
    a.vy = clamp(a.vy + dy * speed * strength * gentle, -260, 260);
    a.scaredUntil = time + (reduced.matches ? 1.4 : 3.6) * strength;
    a.avoidUntil = time + 10;
  }
  function touchAnimal(hit, x, y) {
    animalTouches++;
    const [distance, speed] = { fish: [240, 175], turtle: [290, 130], ray: [350, 170], jelly: [140, 70] }[hit.type];
    startle(hit.a, hit.p, x, y, distance, speed);
    if (!reduced.matches) for (const a of fish) {
      if (a === hit.a) continue;
      const p = position(a, fishHome(a)), d = Math.hypot(p.x - x, p.y - y);
      if (d < 180) startle(a, p, x, y, 160, 105, .35 + .45 * (1 - d / 180));
    }
  }
  function jellyLight(j) {
    let light = 0;
    for (const e of j.echoes) { const age = time - e.at; if (age >= 0 && age < 4.8) light += Math.sin(Math.min(1, age / .7) * Math.PI / 2) * Math.exp(-age * .65) * e.power; }
    return Math.min(1.5, light);
  }
  function currentAt(x, y) {
    let dx = 0, dy = 0;
    for (const b of blooms) {
      const age = time - b.birth;
      if (age > 5 || reduced.matches) continue;
      const xx = x - b.x, yy = y - b.y, d = Math.max(1, Math.hypot(xx, yy));
      const wave = Math.exp(-Math.pow((d - age * 175) / 85, 2)) * Math.exp(-age * .75) * b.power * 32;
      dx += xx / d * wave; dy += yy / d * wave;
    }
    return { x: clamp(dx, -48, 48), y: clamp(dy, -48, 48) };
  }
  function charge() { return pointer && !pointer.dragged ? clamp((time - pointer.birth - .22) / 1.4, 0, 1) : 0; }
  function updateInteractions(dt) {
    for (let i = blooms.length - 1; i >= 0; i--) if (time - blooms[i].birth > 10) blooms.splice(i, 1);
    for (let i = bubbles.length - 1; i >= 0; i--) if (time - bubbles[i].birth > 7 || bubbles[i].y - (time - bubbles[i].birth) * bubbles[i].speed < -20) bubbles.splice(i, 1);
    for (let i = sparks.length - 1; i >= 0; i--) if (time - sparks[i].birth > sparks[i].life) sparks.splice(i, 1);
    jellies.forEach(j => { j.echoes = j.echoes.filter(e => time - e.at < 4.8); });
    for (const school of schools) {
      const weather = animalEnvironment(school.x);
      school.environment = weather;
      school.shelter = mix(school.shelter || 0, Math.max(0, weather.current - .28), 1 - Math.exp(-dt * .25));
      const homes = school.members.map(f => ({ f, p: fishHome(f) }));
      for (const { f, p } of homes) {
        let separateX = 0, separateY = 0;
        if (!reduced.matches) for (const other of homes) {
          if (other.f === f) continue;
          const dx = p.x - other.p.x, dy = p.y - other.p.y, distance = Math.hypot(dx, dy);
          const space = 23 + (f.size + other.f.size) * 13;
          if (distance > .1 && distance < space) {
            const pressure = (1 - distance / space) * 9;
            separateX += dx / distance * pressure; separateY += dy / distance * pressure;
          }
        }
        let obstacleX = 0;
        if (!reduced.matches && school.x > 2200 && school.x < 4300) for (const k of kelps) {
          if (k.depth !== 1 || p.y < k.y - k.h || p.y > k.y) continue;
          const dx = p.x - k.x, clearance = 26 * k.s;
          if (Math.abs(dx) < clearance) obstacleX += (dx < 0 ? -1 : 1) * (1 - Math.abs(dx) / clearance) * 13;
        }
        const flow = reduced.matches ? 0 : weather.current;
        const targetX = clamp(separateX + obstacleX + Math.sin(time * .1 + f.phase) * flow * 6, -25, 25);
        const floorAvoidance = Math.max(0, p.y - surface(p.x) + 125) * .45;
        const targetY = reduced.matches ? 0 : clamp(separateY - floorAvoidance + school.shelter * 27, -28, 28);
        const response = 1 - Math.exp(-dt * .75);
        f.flowX = mix(f.flowX, targetX, response); f.flowY = mix(f.flowY, targetY, response);
      }
    }
    for (const f of fish) {
      const home = fishHome(f), water = currentAt(home.x + f.ox, home.y + f.oy);
      let tx = water.x * 1.6, ty = water.y * 1.6, strongest = 0;
      if (!reduced.matches && f.avoidUntil <= time) for (const b of blooms) {
        const age = time - b.birth, d = Math.hypot(home.x - b.x, home.y - b.y);
        const interest = clamp((age - .6) / 1.2, 0, 1) * clamp((9 - age) / 3, 0, 1) * clamp(1 - d / (330 + b.power * 100), 0, 1);
        if (interest <= strongest) continue;
        strongest = interest;
        const angle = f.phase + age * .48, orbit = 55 + f.size * 70;
        tx = mix(tx, clamp(b.x + Math.cos(angle) * orbit - home.x, -210, 210), interest);
        ty = mix(ty, clamp(b.y + Math.sin(angle) * orbit * .65 - home.y, -150, 150), interest);
      }
      moveAnimal(f, home, dt, tx, ty);
    }
    moveAnimal(turtleMotion, turtleHome(), dt); moveAnimal(rayMotion, rayHome(), dt);
    jellies.forEach(j => moveAnimal(j, jellyHome(j), dt));
  }
  function bloomAt(x, y, power = .85, touch = false) {
    if (runtime.paused) return;
    power *= preferences.interactionStrength;
    // Bound both work and brightness even during a rapid burst of desktop clicks.
    if (time - lastBloom < .12) return;
    x = clamp(x, 0, WORLD); y = clamp(y, 30, 970); lastBloom = time; interactions++;
    const animal = touch ? animalAt(x, y) : null;
    if (animal) touchAnimal(animal, x, y);
    if (animal && animal.type !== 'jelly') {
      // A direct touch means "make room", never "come toward this light".
      for (let i = 0; i < 8; i++) bubbles.push({ x: x + range(-12, 12), y: y + range(-8, 8), r: range(2, 4), speed: range(35, 65), birth: time, phase: random() * TAU });
      if (bubbles.length > 120) bubbles.splice(0, bubbles.length - 120);
      if (auto) setAuto(true, false, false); wake(); return;
    }
    const hit = jellies.find(j => { const p = jellyPosition(j); return Math.hypot((p.x - x) / (j.size * 52 + 14), (p.y - y) / (j.size * 52 + 14)) < 1; });
    const b = { x, y, power, birth: time, links: [] }; blooms.push(b);
    if (blooms.length > 6) blooms.shift();
    const count = reduced.matches ? 16 : Math.round((46 + power * 45) * Math.min(1, detailLevel));
    for (let i = 0; i < count; i++) sparks.push({ x, y, birth: time, life: range(3.2, 6), angle: i * 2.39996 + range(-.12, .12), radius: range(38, 160) * power, spin: range(.2, .48), r: range(.8, 2.3), phase: random() * TAU });
    if (sparks.length > 480) sparks.splice(0, sparks.length - 480);
    for (let i = 0; i < (reduced.matches ? 5 : 12 + Math.round(power * 6)); i++) bubbles.push({ x: x + range(-20, 20), y: y + range(-12, 12), r: range(2, 7), speed: range(35, 65), birth: time, phase: random() * TAU });
    if (bubbles.length > 120) bubbles.splice(0, bubbles.length - 120);
    for (const j of jellies) {
      const p = jellyPosition(j), d = Math.hypot(p.x - x, p.y - y), reach = hit ? 1300 : 600;
      if (d > reach) continue;
      const at = time + (reduced.matches ? 0 : d / 320), strength = (hit ? 1.6 : 1) * (1 - d / (reach * 1.3));
      j.echoes.push({ at, power: strength }); if (j.echoes.length > 6) j.echoes.shift();
      if (hit && !reduced.matches) b.links.push({ j, at, x: p.x, y: p.y });
    }
    // Give the response room to breathe without changing the user's tour mode.
    if (auto) setAuto(true, false, false);
    wake();
  }
  function lightOrb(x, y, radius, alpha, violet = false) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, violet ? `rgba(191,167,255,${alpha})` : `rgba(163,255,236,${alpha})`);
    glow.addColorStop(.22, `rgba(93,218,240,${alpha * .4})`); glow.addColorStop(1, 'rgba(63,174,232,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  function drawInteractions() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of blooms) {
      if (!visible(b.x, 700)) continue;
      const age = time - b.birth, x = b.x - camera, fade = clamp(1 - age / 7, 0, 1);
      lightOrb(x, b.y, (80 + Math.min(age, 3) * 50) * b.power, .15 * fade);
      if (!reduced.matches) for (let ring = 0; ring < 3; ring++) {
        const t = age - ring * .24; if (t < 0 || t > 3.6) continue;
        const r = 10 + t * (94 + b.power * 28);
        ctx.beginPath(); ctx.ellipse(x, b.y, r, r * .74, -.22, 0, TAU);
        ctx.strokeStyle = `rgba(158,242,232,${Math.sin(Math.min(t * 4, Math.PI / 2)) * Math.pow(1 - t / 3.6, 2) * .22})`; ctx.lineWidth = 1.1; ctx.stroke();
      }
      for (const link of b.links) {
        const duration = link.at - b.birth, t = age / Math.max(.1, duration);
        if (t < 0 || t > 1) continue;
        const bend = Math.sin(t * Math.PI) * 28, xx = mix(x, link.x - camera, t), yy = mix(b.y, link.y, t) - bend;
        lightOrb(xx, yy, 18, .2); ellipse(ctx, xx, yy, 1.8, 1.8, '#bcebf2');
      }
    }
    for (const p of sparks) {
      const age = time - p.birth, t = age / p.life, fade = Math.sin(Math.PI * t) * (1 - t), expansion = reduced.matches ? .65 : 1 - Math.exp(-age * 1.3);
      const angle = p.angle + (reduced.matches ? 0 : age * p.spin), radius = p.radius * expansion;
      const x = p.x - camera + Math.cos(angle) * radius, y = p.y + Math.sin(angle) * radius * .72 - age * (reduced.matches ? 0 : 9);
      if (x < -20 || x > view + 20) continue;
      ctx.globalAlpha = fade * .8;
      ellipse(ctx, x, y, p.r * 3.2, p.r * 3.2, '#62d5e31c');
      ellipse(ctx, x, y, p.r, p.r, p.phase > Math.PI ? '#a9f8e2' : '#b6c5ff');
    }
    ctx.globalAlpha = 1;
    const held = charge();
    if (held > 0) {
      const x = pointer.x * view / innerWidth, y = pointer.y * H / innerHeight, r = 5 + held * 13;
      lightOrb(x, y, 45 + held * 75, .2 + held * .13);
      ellipse(ctx, x, y, r, r, '#d1fff4a0'); ellipse(ctx, x - r * .2, y - r * .3, r * .27, r * .18, '#f1fffcc9');
      if (!reduced.matches) for (let i = 0; i < 22; i++) {
        const a = i * 2.39996 + time * .6, d = 28 + mod(i * 13 - time * 32, 68) * (1 - held * .35);
        ellipse(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d * .7, 1, 1, '#b7f6e8a0');
      }
    }
    ctx.restore();
  }

  // Cached geology: no world-sized, device-resolution canvas and no remote assets.
  const tiles = [];
  for (let start = 0; start < WORLD; start += 900) {
    const image = document.createElement('canvas'); image.width = 720; image.height = 280;
    const g = image.getContext('2d'); g.scale(.8, .8); g.translate(-start, -650);
    const deep = clamp((start - 3900) / 2200, 0, 1);
    const floor = gradient(g, 0, 740, 0, 1010, [[0, rgb([111, 153, 147], [48, 84, 106], deep)], [.45, rgb([78, 121, 123], [32, 65, 86], deep)], [1, '#173e50']]);
    g.beginPath(); g.moveTo(start - 2, 1100); for (let x = start - 2; x <= start + 904; x += 8) g.lineTo(x, surface(x)); g.lineTo(start + 904, 1100); g.fillStyle = floor; g.fill();
    for (let i = 0; i < 26; i++) {
      const y = 878 + i * 6;
      g.beginPath(); for (let x = start; x <= start + 902; x += 12) { const yy = y + Math.sin(x * .013 + i * .49) * 3 + Math.sin(x * .003) * 12; x === start ? g.moveTo(x, yy) : g.lineTo(x, yy); }
      g.strokeStyle = '#c5dbc51a'; g.lineWidth = .8; g.stroke();
    }
    for (const [center, extent] of reefs) {
      if (center + extent < start - 100 || center - extent > start + 1000) continue;
      for (let i = 0; i < 7; i++) {
        const x = center + Math.sin(i * 24.3) * extent, y = surface(x) + 30, w = 55 + (i * 31 % 85), h = 35 + (i * 43 % 80);
        const color = gradient(g, x, y - h, x + 40, y + 30, [[0, '#4c8589'], [.3, '#365f6a'], [1, '#173e50']]);
        g.beginPath(); g.moveTo(x - w, y); g.bezierCurveTo(x - w * 1.2, y - h * .6, x - w * .5, y - h, x, y - h); g.bezierCurveTo(x + w * .55, y - h * 1.2, x + w, y - h * .6, x + w, y + 8); g.closePath(); g.fillStyle = color; g.fill();
        for (let n = 0; n < 16; n++) ellipse(g, x + range(-w * .7, w * .7), y - range(5, h * .7), range(1, 8), range(1, 3), '#a1b9a51c');
      }
    }
    for (let i = 0; i < 120; i++) { const x = range(start, start + 900), y = range(900, 1000); ellipse(g, x, y, range(.4, 1.6), range(.4, .8), i % 2 ? '#d0d7b726' : '#09364c30'); }
    tiles.push({ x: start, image });
  }
  const noise = document.createElement('canvas'); noise.width = noise.height = 180;
  const ng = noise.getContext('2d'), pixels = ng.createImageData(180, 180);
  for (let i = 0; i < pixels.data.length; i += 4) { const c = random() > .5 ? 255 : 0; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = c; pixels.data[i + 3] = 2; }
  ng.putImageData(pixels, 0, 0); const grain = ctx.createPattern(noise, 'repeat');

  function waterColor(day, night, env) {
    const shade = .73 + env.light * .27;
    return `rgb(${day.map((v, i) => Math.round(clamp((mix(v, night[i], env.night * .9) + (i === 0 ? 14 : i === 1 ? 3 : -8) * env.warmth) * shade, 0, 255))).join(',')})`;
  }
  function water() {
    const center = camera + view * .5, forest = clamp((center - 1900) / 1700, 0, 1), deep = clamp((center - 3800) / 2000, 0, 1), env = environmentAt();
    const topDay = [mix(34, 19, forest), mix(152, 116, forest), mix(170, 140, forest)].map((v, i) => mix(v, [11, 60, 94][i], deep));
    const top = waterColor(topDay, [10, 37, 70], env), middle = waterColor([mix(17, 9, deep), mix(106, 46, deep), mix(127, 79, deep)], [7, 28, 59], env);
    const bottom = waterColor([mix(7, 4, deep), mix(58, 23, deep), mix(75, 48, deep)], [3, 16, 38], env);
    ctx.fillStyle = gradient(ctx, 0, 0, 0, H, [[0, top], [.55, middle], [1, bottom]]); ctx.fillRect(0, 0, view, H);
    const sx = view * .38 - camera * .015, sunlight = env.light * (1 - deep * .78), warmth = env.warmth;
    const light = ctx.createRadialGradient(sx, -160, 30, sx, 0, 1120);
    light.addColorStop(0, `rgba(${Math.round(175 + warmth * 40)},${Math.round(231 - Math.max(0, warmth) * 8)},${Math.round(218 - warmth * 28)},${.29 * sunlight})`); light.addColorStop(1, '#9fe5db00'); ctx.fillStyle = light; ctx.fillRect(0, 0, view, H);
    const beamCount = detailLevel < .75 ? 5 : 8;
    for (let i = 0; i < beamCount; i++) {
      const drift = reduced.matches ? 0 : Math.sin(time * .045 + i * 1.9) * 30;
      const x = sx - 480 + i * 155 + drift, width = 16 + (i * 19 % 45);
      const visibility = .35 + env.visibility * .65, strength = (.025 + Math.sin(time * .07 + i) * .006) * sunlight * visibility;
      const beam = gradient(ctx, x, -20, x + 430, 950, [[0, `rgba(201,239,215,${strength})`], [1, '#a3e6d000']]);
      polygon(ctx, [[x, 0], [x + width, 0], [x + 570, 1000], [x + 260, 1000]], beam);
    }
    // Wide, soft cloud shadows drift across the incoming light, never flash.
    const cloud = (env.overcast * .055 + env.rain * .07 + env.storm * .105) * (1 - deep * .82);
    if (cloud > .001) for (let i = 0; i < 3; i++) {
      const x = view * (.12 + i * .45) + (reduced.matches ? 0 : Math.sin(time * .024 + i * 2.7) * view * .16);
      const shadow = ctx.createRadialGradient(x, 60, 10, x + 80, 160, Math.max(380, view * .45));
      shadow.addColorStop(0, `rgba(5,32,58,${cloud})`); shadow.addColorStop(1, '#05203a00'); ctx.fillStyle = shadow; ctx.fillRect(0, 0, view, H);
    }
    // Looking up through rain shows refracted surface light, not falling drops.
    if (env.surfaceDisturbance > .02 && deep < .9) {
      ctx.save(); ctx.lineWidth = .8;
      const count = detailLevel < .75 ? 8 : 15;
      for (let i = 0; i < count; i++) {
        const age = mod(time * .055 + i * .618, 1), x = mod(i * 197.3 - camera * .1 + Math.sin(i * 3.1) * 70, view + 200) - 100;
        const y = 18 + (i % 5) * 24 + age * 9;
        ctx.globalAlpha = env.surfaceDisturbance * Math.sin(age * Math.PI) * .1 * quietMask(x);
        ctx.strokeStyle = '#b9e3e0'; ctx.beginPath(); ctx.ellipse(x, y, 25 + age * 65, 1.5 + age * 3, -.12, .2, 2.9); ctx.stroke();
      }
      ctx.restore();
    }
    // Three receding shelves and a water-coloured veil give the reef its depth.
    for (let layer = 0; layer < 2; layer++) {
      ctx.save(); ctx.translate(-camera * (.33 + layer * .19), 0); ctx.globalAlpha = (.12 + layer * .09) * (.6 + env.visibility * .4);
      for (let i = 0; i < 17; i++) {
        const x = i * 510 - 120 + layer * 175, y = 745 + layer * 45 + Math.sin(i * 6 + layer) * 36, w = 250 + Math.sin(i * 7) * 85;
        ctx.beginPath(); ctx.moveTo(x - w, 1000); ctx.bezierCurveTo(x - w, y, x - w * .5, y - 60, x, y - 50); ctx.bezierCurveTo(x + w * .6, y - 135, x + w, y + 40, x + w, 1000); ctx.fillStyle = layer ? '#0a3c53' : '#407b87'; ctx.fill();
      }
      ctx.restore();
    }
    // A rare, uninterrupted passage through distant blue, once every six minutes.
    const encounter = mod(time + 17, 360), visit = clamp((encounter - 38) / 108, 0, 1);
    if (encounter > 38 && encounter < 146) {
      const wx = 5400 - visit * 4800 - camera * .62;
      if (wx > -650 && wx < view + 650) {
        const fade = Math.sin(visit * Math.PI) ** .6;
        ctx.save(); ctx.translate(wx, 255 + Math.sin(time * .055) * 12); ctx.scale(1.15, .88); ctx.globalAlpha = .11 * fade * (.5 + env.visibility * .5) * quietMask(wx);
        ctx.beginPath(); ctx.moveTo(-265, -12); ctx.bezierCurveTo(-140, -80, 132, -50, 240, 7); ctx.bezierCurveTo(290, 20, 300, -5, 345, -15); ctx.lineTo(327, 9); ctx.lineTo(349, 37); ctx.bezierCurveTo(307, 23, 277, 13, 237, 24); ctx.bezierCurveTo(75, 62, -115, 72, -244, 18); ctx.closePath(); ctx.fillStyle = '#032e48'; ctx.fill();
        polygon(ctx, [[-55, 25], [-7, 101 + Math.sin(time * .18) * 8], [73, 38]], '#032e48'); polygon(ctx, [[115, -13], [151, -58], [172, -9]], '#032e48'); ctx.restore();
      }
    }
  }
  function drawCoral(c) {
    if (!visible(c.x, 300, c.depth)) return;
    const env = environmentAt(), x = c.x - camera * c.depth, water = currentAt(c.x + camera * (1 - c.depth), c.y - 100 * c.s);
    const sway = reduced.matches ? 0 : Math.sin(time * .18 + c.phase) * (.008 + env.current * .006);
    ctx.save(); ctx.translate(x, c.y); ctx.rotate(sway + water.x * .0011); ctx.scale(c.s, c.s);
    ctx.globalAlpha = (c.depth < 1 ? .3 + env.visibility * .15 : c.front ? .94 : .92) * quietMask(x); ctx.drawImage(sprites[c.type], -240, -414); ctx.restore();
  }
  function kelp(k) {
    if (!visible(k.x, 180, k.depth)) return;
    const env = environmentAt(), x = k.x - camera * k.depth, local = currentAt(k.x + camera * (1 - k.depth), k.y - k.h * .65).x;
    const motionTime = reduced.matches ? 0 : time;
    const sway = Math.sin(motionTime * .23 + k.phase) * (20 + env.current * 22) + Math.sin(motionTime * .11 + k.phase * 2) * 14 + local * 1.1;
    // Leaves attach to the same flexible spine; lag grows toward each soft tip.
    const spine = t => k.lean * t + sway * t * t + Math.sin(t * 5.8 + k.phase + motionTime * .18) * 13 * t;
    ctx.save(); ctx.globalAlpha = (k.depth < 1 ? .22 + env.visibility * .07 : k.front ? .88 : .6) * quietMask(x);
    const dark = k.front ? '#123f43' : '#2c756c', pale = k.front ? '#4b7e67' : '#75a881';
    ctx.beginPath(); ctx.moveTo(x, k.y);
    for (let i = 1; i <= 22; i++) { const t = i / 22; ctx.lineTo(x + spine(t), k.y - k.h * t); }
    ctx.strokeStyle = dark; ctx.lineWidth = 2.2 * k.s; ctx.lineCap = 'round'; ctx.stroke();
    const leaves = detailLevel < .75 ? Math.max(8, k.leaves - 3) : k.leaves;
    for (let i = 1; i < leaves; i++) {
      const t = i / leaves, bx = x + spine(t), by = k.y - k.h * t, side = i % 2 ? 1 : -1;
      const length = (24 + Math.sin(t * Math.PI) * 54) * k.s, wave = Math.sin(motionTime * .45 - t * 3 + k.phase) * (5 + env.current * 6);
      const tx = bx + side * length + sway * .2 * t, ty = by - 28 - length * .28 + wave;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.bezierCurveTo(bx + side * length * .35, by - 4, tx + side * 18, ty + 21, tx, ty);
      ctx.bezierCurveTo(tx - side * 12, ty + 2, bx + side * length * .21, by - 25, bx, by); ctx.fillStyle = i % 4 ? dark : pale; ctx.fill();
      if (detailLevel >= .75) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + side * length * .5, by - 17, tx, ty); ctx.strokeStyle = '#a4c89930'; ctx.lineWidth = .7; ctx.stroke(); }
      if (i % 4 === 0) ellipse(ctx, bx + side * 3, by - 2, 2.5, 4, '#a4b77d');
    }
    ctx.restore();
  }
  function seaGrass(g) {
    if (!visible(g.x, 100)) return;
    const env = environmentAt(), x = g.x - camera;
    ctx.save(); ctx.globalAlpha = .8 * quietMask(x);
    for (let j = 0; j < (detailLevel < .75 ? 3 : 5); j++) {
      const h = g.h * (.6 + j * .12), sway = (reduced.matches ? 0 : Math.sin(time * .42 + g.phase + j * .2) * h * (.12 + env.current * .1)) + currentAt(g.x, g.y - h).x * .7;
      ctx.beginPath(); ctx.moveTo(x + j * 4, g.y); ctx.quadraticCurveTo(x + j * 4 - 8, g.y - h * .6, x + sway + (j - 2) * 9, g.y - h); ctx.quadraticCurveTo(x + j * 4 + 4, g.y - h * .4, x + j * 4 + 4, g.y); ctx.fillStyle = j % 2 ? '#285c58' : '#397b66'; ctx.fill();
    }
    ctx.restore();
  }
  function drawFish(f) {
    const s = f.school, home = fishHome(f), x = home.x + f.ox;
    if (!visible(x, 70)) return;
    const y = home.y + f.oy;
    ctx.save(); ctx.translate(x - camera, y); ctx.scale(f.size * f.facing, f.size); ctx.rotate(Math.sin(time * .8 + f.phase) * .04 + f.tilt);
    const turn = f.turn || 0;
    const tail = Math.sin(f.stroke * 7 + f.phase) * (3.5 + alarm(f) * 2) * (1 - turn * .2);
    const colors = [['#c9684d', '#f4bc76'], ['#234f97', '#548fc1'], ['#d6bb6a', '#eee7b3'], ['#58a6ae', '#c1dfcc'], ['#46778f', '#91b5bf']][s.type];
    const environment = s.environment || animalEnvironment(s.x);
    const quiet = quietMask(x - camera);
    ctx.globalAlpha = (s.type === 4 ? .6 + environment.night * .2 : .9) * quiet;
    polygon(ctx, [[-22, 0], [-42 + tail, -15], [-36 + tail, 1], [-42 + tail, 13]], s.type === 1 ? '#dcbd60' : colors[0]);
    const body = gradient(ctx, 0, -20, 0, 20, [[0, colors[1]], [.45, colors[0]], [1, colors[0]]]);
    const girth = s.type === 1 || s.type === 2 ? 20 : 12;
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.bezierCurveTo(-15, -girth, 13, -girth * .94, 27 - turn * 4, -2); ctx.bezierCurveTo(29 - turn * 4, girth * .55, -8, girth, -26, 0); ctx.fillStyle = body; ctx.fill();
    polygon(ctx, [[-13, -9], [-5 + tail * .18, -24], [16, -11]], colors[0]); polygon(ctx, [[-3, 8], [-10 - tail * .2, 24], [12, 10]], colors[0]);
    if (s.type === 1) { ctx.beginPath(); ctx.moveTo(-17, -8); ctx.bezierCurveTo(-9, -16, 8, 14, 19, -5); ctx.strokeStyle = '#102e56'; ctx.lineWidth = 5; ctx.stroke(); }
    if (s.type === 2) { stroke(ctx, [[0, -19], [-7, 17]], '#283e4c', 7); stroke(ctx, [[16, -13], [12, 14]], '#354756', 4); }
    ellipse(ctx, 16 - turn * 7, -2, 2.5, 2.5, '#e4e2b9'); ellipse(ctx, 16.5 - turn * 7, -2, 1.4, 1.6, '#103745');
    ctx.strokeStyle = colors[1]; ctx.globalAlpha *= .32; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(-15, -3); ctx.quadraticCurveTo(2, -girth * .72, 18, -4); ctx.stroke();
    ctx.globalAlpha = .4 * quiet; ellipse(ctx, turn * 4, 3, 8, 4 + turn * 2, colors[1], -.4 + Math.sin(time * 6 + f.phase) * .3);
    if (s.type === 4 && environment.night > .1) {
      ctx.globalAlpha = environment.night * .45 * quiet; ctx.fillStyle = '#a1e4e9'; ctx.beginPath(); ctx.ellipse(0, 1, 16, 1.2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function turtle() {
    const { x, y } = position(turtleMotion, turtleHome());
    if (!visible(x, 220)) return;
    ctx.save(); ctx.globalAlpha = quietMask(x - camera); ctx.translate(x - camera, y); ctx.scale(.82 * turtleMotion.facing, .82); ctx.rotate(-.11 + Math.sin(time * .17) * .03 + turtleMotion.tilt);
    const flap = finBeat(turtleMotion.stroke), skin = '#a2b58a';
    ctx.save(); ctx.rotate(-.15 + flap * .2); ctx.beginPath(); ctx.moveTo(8, -33); ctx.bezierCurveTo(-12, -83, -67, -122, -92, -118); ctx.bezierCurveTo(-83, -82, -36, -43, -25, -20); ctx.fillStyle = '#5c8574'; ctx.fill(); ctx.restore();
    polygon(ctx, [[-53, -12], [-98, -44 - flap * 12], [-84, -4], [-56, 12]], '#6f9982'); polygon(ctx, [[-57, 20], [-100, 60], [-69, 54], [-33, 37]], '#799d80');
    ctx.beginPath(); ctx.moveTo(48, -15); ctx.bezierCurveTo(80, -20, 111, -7, 105, 11); ctx.bezierCurveTo(98, 23, 72, 19, 45, 16); ctx.fillStyle = skin; ctx.fill();
    ellipse(ctx, 91, -1, 3.2, 3.2, '#163e42'); ellipse(ctx, 92, -2, .9, .9, '#e5e7bb');
    const shell = gradient(ctx, -20, -50, 20, 49, [[0, '#c6b77a'], [.4, '#8a9a68'], [1, '#3d6d5e']]); ellipse(ctx, -12, 0, 72, 49, '#b3bb8a'); ellipse(ctx, -12, -3, 67, 46, shell);
    ctx.save(); ctx.beginPath(); ctx.ellipse(-12, -3, 65, 44, 0, 0, TAU); ctx.clip();
    for (let row = -1; row < 2; row++) for (let col = -2; col < 3; col++) {
      const xx = -12 + col * 31 + (row % 2) * 15.5, yy = row * 27 - 4;
      ctx.beginPath(); for (let n = 0; n < 6; n++) { const a = n / 6 * TAU + Math.PI / 6; const px = xx + Math.cos(a) * 18, py = yy + Math.sin(a) * 18; n ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.strokeStyle = '#486d5390'; ctx.lineWidth = 2; ctx.stroke();
    } ctx.restore();
    ctx.beginPath(); ctx.moveTo(9, 23); ctx.bezierCurveTo(-8, 57 + flap * 23, -61, 102 + flap * 29, -87, 101 + flap * 25); ctx.bezierCurveTo(-62, 69 + flap * 12, -34, 27, -19, 17); ctx.fillStyle = skin; ctx.fill();
    for (let i = 0; i < 15; i++) ellipse(ctx, -15 - i * 3.5, 35 + i * 3 + flap * i, 2.5, 1.6, '#597d6880', -.7);
    ctx.restore();
  }
  function ray() {
    const { x, y } = position(rayMotion, rayHome());
    if (!visible(x, 320)) return;
    ctx.save(); ctx.globalAlpha = quietMask(x - camera); ctx.translate(x - camera, y); ctx.scale(.85 * rayMotion.facing, .85); ctx.rotate(-.15 + rayMotion.tilt);
    const flap = rayFinWave(rayMotion.stroke) * 33;
    const color = gradient(ctx, 0, -100, 0, 80, [[0, '#336f80'], [.5, '#598b8c'], [1, '#164b62']]);
    ctx.beginPath(); ctx.moveTo(71, -4); ctx.bezierCurveTo(25, -39, -47, -155 + flap, -113, -137 + flap); ctx.bezierCurveTo(-78, -94, -61, -36, -75, -1); ctx.bezierCurveTo(-57, 32, -81, 69, -102, 131 - flap); ctx.bezierCurveTo(-31, 125 - flap, 30, 36, 71, 13); ctx.bezierCurveTo(100, 16, 109, -4, 93, -12); ctx.lineTo(79, -4); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-70, 0); ctx.bezierCurveTo(-145, 12, -208, 3, -261, 21 + Math.sin(time) * 10); ctx.strokeStyle = '#2b6475'; ctx.lineWidth = 3; ctx.stroke();
    ellipse(ctx, 50, -8, 3, 2, '#143b51'); for (let i = 0; i < 16; i++) ellipse(ctx, -45 + (i * 17 % 90), Math.sin(i * 8) * 28, 1.6, 1.2, '#abc3b360');
    ctx.restore();
  }
  function jelly(j) {
    const p = jellyPosition(j), environment = animalEnvironment(j.x), light = jellyLight(j), water = currentAt(p.x, p.y);
    if (!visible(p.x, 140)) return;
    const x = p.x - camera + water.x * .4, y = p.y + water.y * .4;
    const quiet = quietMask(x);
    ctx.save(); ctx.globalAlpha = quiet; ctx.translate(x, y); ctx.scale(j.size, j.size);
    const beat = jellyBeat(j), pulse = 1 - beat.contraction * 2, w = 42 + pulse * 3 + light * 3 - alarm(j) * 6;
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 105); glow.addColorStop(0, `rgba(128,205,226,${.07 + environment.night * .11})`); glow.addColorStop(1, '#80cde200'); ctx.fillStyle = glow; ctx.fillRect(-105, -105, 210, 210);
    if (light > .01) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; lightOrb(0, -5, 160, light * .28, true); ctx.restore(); }
    for (let i = 0; i < 9; i++) {
      ctx.beginPath(); const xx = (i - 4) * 7; ctx.moveTo(xx, 8);
      for (let n = 1; n < 10; n++) { const yy = n * (10 + i % 3 * 3), tx = xx + Math.sin(n * .7 - time * .8 + j.phase + i * .4) * (4 + n * 1.5); ctx.lineTo(tx, yy); }
      ctx.strokeStyle = i % 2 ? '#a1badf72' : '#95d7e58a'; ctx.lineWidth = i % 3 === 0 ? 2 : .9; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-w, 10); ctx.bezierCurveTo(-w - 2, -45 - pulse * 4, w - 4, -53 - pulse * 4, w, 10); ctx.quadraticCurveTo(0, 26, -w, 10);
    ctx.fillStyle = gradient(ctx, 0, -44, 0, 22, [[0, '#b6d5e275'], [.65, '#81b3d23b'], [1, '#bdc7ee88']]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 10, w, 10, 0, 0, Math.PI); ctx.strokeStyle = '#c1e7eb9c'; ctx.lineWidth = 1.4; ctx.stroke();
    for (let i = 0; i < 4; i++) ellipse(ctx, (i - 1.5) * 12, -7 + Math.sin(i) * 4, 7, 4, `rgba(216,197,230,${.24 + environment.night * .22})`, i);
    if (light > .01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = light * .6 * quiet;
      ctx.beginPath(); ctx.moveTo(-w, 10); ctx.bezierCurveTo(-w, -44, w, -49, w, 10); ctx.strokeStyle = '#c7ddff'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 9; i++) ellipse(ctx, (i - 4) * 7, 13 + Math.sin(i + time) * 2, 1.8, 1.8, '#d2faff');
      ctx.restore();
    }
    ctx.restore();
  }
  function anemone(x, y, phase, size) {
    if (!visible(x, 100)) return;
    ctx.save(); ctx.translate(x - camera, y); ctx.scale(size, size);
    ellipse(ctx, 0, 0, 37, 13, '#b18788');
    for (let i = 0; i < 28; i++) {
      const bx = Math.sin(i * 13.4) * 34, by = Math.cos(i * 7.8) * 8, len = 20 + (i * 17 % 28), sway = Math.sin(time * 1.1 + phase + i * .19) * 8;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.bezierCurveTo(bx - 5, by - len * .4, bx + sway, by - len * .8, bx + sway + 2, by - len); ctx.strokeStyle = i % 3 ? '#cba4a9' : '#ecd0b8'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); ellipse(ctx, bx + sway + 2, by - len, 2.8, 2.8, '#e8c8c2');
    } ctx.restore();
  }
  function starfish(x, y, size, rotation) {
    if (!visible(x, 80)) return;
    ctx.save(); ctx.translate(x - camera, y); ctx.rotate(rotation); ctx.scale(size, size);
    const points = Array.from({ length: 10 }, (_, i) => [Math.cos(i * Math.PI / 5) * (i % 2 ? 9 : 29), Math.sin(i * Math.PI / 5) * (i % 2 ? 9 : 29) * .65]);
    polygon(ctx, points, '#cf9775'); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; for (let j = 1; j < 5; j++) ellipse(ctx, Math.cos(a) * j * 5, Math.sin(a) * j * 3, .9, .6, '#f1c3a0'); } ctx.restore();
  }
  function particles() {
    const env = environmentAt(), motionTime = reduced.matches ? 0 : time;
    ctx.save();
    for (let i = 0; i < motes.length; i++) {
      if (detailLevel < .75 && i % 2) continue;
      const p = motes[i], x = mod(p.x + motionTime * p.speed, WORLD) - camera * p.depth;
      if (x < -20 || x > view + 20) continue;
      const y = mod(p.y - motionTime * p.speed * .25 + Math.sin(motionTime * .2 + p.phase) * 9, H);
      const luminous = env.night * (i % 11 === 0 ? .35 : 0);
      ctx.globalAlpha = (.08 + Math.sin(motionTime * .21 + p.phase) * .045 + luminous) * quietMask(x);
      ellipse(ctx, x, y, p.r, p.r, luminous ? '#a7dfef' : '#c5e7d3');
    }
    for (let i = 0; i < ambientBubbles.length; i++) {
      if (detailLevel < .75 && i % 2) continue;
      const b = ambientBubbles[i]; if (!visible(b.x, 40)) continue;
      const age = mod(motionTime * b.speed + b.phase, 1), x = b.x - camera + Math.sin(age * 9 + b.phase) * 10, y = surface(b.x) - age * 650;
      ctx.globalAlpha = Math.sin(age * Math.PI) * .19 * quietMask(x); ctx.beginPath(); ctx.arc(x, y, b.r, 0, TAU); ctx.strokeStyle = '#b8e1db'; ctx.lineWidth = .7; ctx.stroke(); ellipse(ctx, x - b.r * .3, y - b.r * .4, b.r * .2, b.r * .12, '#e1efe5');
    }
    ctx.globalAlpha = 1;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], age = time - b.birth, y = b.y - age * b.speed, x = b.x - camera + Math.sin(age * 2 + b.phase) * 10;
      ctx.globalAlpha = .65 + quietMask(x) * .35;
      ctx.beginPath(); ctx.arc(x, y, b.r, 0, TAU); ctx.strokeStyle = `rgba(187,227,225,${Math.min(.4, (7 - age) * .15)})`; ctx.lineWidth = .8; ctx.stroke(); ellipse(ctx, x - b.r * .3, y - b.r * .4, b.r * .23, b.r * .14, '#d1eee780');
    }
    ctx.restore();
  }
  function render() {
    const started = performance.now();
    atmosphere = climate.sample(time);
    const environment = environmentAt();
    ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.globalAlpha = 1;
    water();
    kelps.filter(k => k.depth < 1).forEach(kelp);
    corals.filter(c => c.depth < 1).forEach(drawCoral);
    tiles.forEach(t => { if (visible(t.x + 450, 500)) ctx.drawImage(t.image, t.x - camera, 650, 900, 350); });
    kelps.filter(k => k.depth === 1 && !k.front).forEach(kelp);
    corals.filter(c => c.depth === 1 && !c.front).forEach(drawCoral);
    fish.forEach(drawFish); ray(); turtle(); jellies.forEach(jelly);
    grasses.forEach(seaGrass);
    anemone(540, 918, 0, 1.2); anemone(1630, 902, 1, 1); anemone(2210, 916, 2, .8);
    starfish(682, 943, 1.2, .4); starfish(1190, 952, .8, 1); starfish(4340, 971, .9, 2);
    corals.filter(c => c.front).forEach(drawCoral); kelps.filter(k => k.front).forEach(kelp);
    // Broad, very faint caustics break up the sea floor without flashing.
    ctx.save(); ctx.globalAlpha = .055 * environment.light * (1 - clamp(camera / WORLD, 0, .8));
    for (let i = 0; i < 15; i++) { const x = mod(i * 173 - camera * .8 + Math.sin(time * .3 + i) * 12, view + 200) - 100; ctx.beginPath(); ctx.ellipse(x, 845 + (i % 3) * 50, 90, 14, Math.sin(i) * .2, .2, 2.5); ctx.strokeStyle = '#c4e5c6'; ctx.lineWidth = 2; ctx.stroke(); } ctx.restore();
    // Cached reef paintings share the light of the surrounding water. Luminous
    // particles are composited afterwards so night retains points of life.
    ctx.fillStyle = `rgba(2,16,37,${clamp((1 - environment.light) * .38 + (1 - environment.visibility) * .1, 0, .48)})`;
    ctx.fillRect(0, 0, view, H);
    particles(); drawInteractions();
    const vignette = ctx.createRadialGradient(view * .5, 430, 160, view * .5, 500, Math.max(view * .7, 800)); vignette.addColorStop(0, '#012c4000'); vignette.addColorStop(1, '#01233660'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, view, H);
    ctx.fillStyle = grain; ctx.fillRect(0, 0, view, H);
    if (preferences.quietSide !== 'none') {
      const left = preferences.quietSide === 'left';
      ctx.fillStyle = gradient(ctx, left ? 0 : view, 0, left ? view * .55 : view * .45, 0, [[0, '#062b4199'], [.65, '#062b4150'], [1, '#062b4100']]);
      ctx.fillRect(0, 0, view, H);
    }
    if (preferences.brightness < 1) {
      ctx.fillStyle = `rgba(0,8,20,${1 - preferences.brightness})`; ctx.fillRect(0, 0, view, H);
    } else if (preferences.brightness > 1) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(119,183,194,${(preferences.brightness - 1) * .6})`; ctx.fillRect(0, 0, view, H); ctx.restore();
    }
    frames++;
    renderCost += ((performance.now() - started) - renderCost) * .04;
    // Reduce decorative work after sustained load; the explicit resolution and
    // frame-rate preference remains stable. Recovery is deliberately gradual.
    if (++performanceSamples % 90 === 0) {
      const target = qualityProfiles[preferences.quality].detail;
      detailLevel = clamp(detailLevel + (renderCost > 27 ? -.12 : renderCost < 16 ? .04 : 0), target * .55, target);
    }
    updateHud();
  }
  function zoneAt() { return camera + view * .5 < 2400 ? 0 : camera + view * .5 < 4550 ? 1 : 2; }
  function targetFor(zone) { return clamp(WORLD * [ .14, .46, .83 ][zone] - view * .5, 0, maxCamera); }
  function moveTo(target, duration = 4) { transit = { from: camera, to: clamp(target, 0, maxCamera), elapsed: 0, duration }; }
  function updateCamera(dt) {
    if (pointer && !pointer.dragged) return;
    if (transit) {
      transit.elapsed = Math.min(transit.duration, transit.elapsed + dt * (auto ? preferences.tourSpeed : 1));
      camera = mix(transit.from, transit.to, smooth(transit.elapsed / transit.duration));
      if (transit.elapsed >= transit.duration) { transit = null; dwell = 18; }
    } else if (auto) {
      dwell -= dt;
      if (dwell <= 0) {
        const target = targetFor(nextStop);
        moveTo(target, Math.max(28, Math.abs(target - camera) / 42));
        if (nextStop === 2) direction = -1; else if (nextStop === 0) direction = 1;
        nextStop += direction;
      }
    }
  }
  function updateHud(force = false) {
    if (!force && time - hudTime < .2 && time >= hudTime) return; hudTime = time;
    const zone = zoneAt();
    if (zone !== currentZone) {
      currentZone = zone; document.querySelector('#location').textContent = ['珊瑚花园', '海藻森林', '幽蓝深海'][zone];
      document.querySelectorAll('[data-zone]').forEach((b, i) => { if (i === zone) b.setAttribute('aria-current', 'location'); else b.removeAttribute('aria-current'); });
    }
    const marker = document.querySelector('#view-marker'); marker.style.width = `${view / WORLD * 100}%`; marker.style.left = `${camera / WORLD * 100}%`;
    document.querySelector('#journey').textContent = auto ? transit ? '正沿着洋流，缓缓前行' : '随洋流，慢慢看世界' : '这片海，由你来探索';
    const climateStatus = document.querySelector('#climate-status');
    if (climateStatus) {
      const text = `${atmosphere.label} · ${atmosphere.daylightLabel}${atmosphere.transitioning ? ' · 渐变中' : ''}`;
      if (climateStatus.textContent !== text) climateStatus.textContent = text;
    }
  }
  let toastTimer;
  function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 2600); }
  function setAuto(value, notify = false, persist = true) {
    auto = Boolean(value); transit = null; dwell = 14;
    const zone = zoneAt(); nextStop = zone === 2 ? 1 : zone + 1; direction = zone === 2 ? -1 : 1;
    document.querySelector('#tour').setAttribute('aria-pressed', String(auto)); document.querySelector('#tour-label').textContent = auto ? '自动巡游' : '自由漫游';
    if (persist) rememberCamera({ tourMode: auto ? 'auto' : 'fixed', fixedZone: zone });
    if (notify) toast(auto ? '已开启自动巡游，先在这里停留片刻' : '自由漫游 · 拖动或按方向键探索'); updateHud(true);
  }
  function setPaused(value) {
    if (Boolean(value) !== paused) {
      if (value) pausedAt = Date.now();
      else { if (pausedAt && Date.now() - pausedAt > 60000) syncLocalDaylight(); pausedAt = 0; lastWallFrame = Date.now(); }
    }
    const held = Boolean(pointer); cancelPointer(); paused = Boolean(value); runtime.setUserPaused(paused); last = 0; document.querySelector('#pause').setAttribute('aria-pressed', String(paused)); document.querySelector('#pause-label').textContent = paused ? '继续' : '暂停'; document.querySelector('#pause-icon').textContent = paused ? '▷' : 'Ⅱ';
    if (held) render();
  }
  function goToZone(zone, immediate = false, persist = true) {
    zone = clamp(Math.round(zone), 0, 2); setAuto(false, false, false);
    if (persist) rememberCamera({ tourMode: 'fixed', fixedZone: zone });
    if (immediate || paused || reduced.matches) { camera = targetFor(zone); transit = null; render(); } else moveTo(targetFor(zone), Math.max(3, Math.abs(targetFor(zone) - camera) / 480));
    updateHud(true);
  }
  function wake() { lastInput = performance.now(); document.body.classList.remove('idle'); }
  function toggleHelp(value) {
    const el = document.querySelector('#help-panel'); el.hidden = value === undefined ? !el.hidden : !value; document.querySelector('#help').setAttribute('aria-expanded', String(!el.hidden)); wake();
    if (!el.hidden) document.querySelector('#close-help').focus(); else document.querySelector('#help').focus();
  }
  function fullscreen() { if (!runtime.capabilities.fullscreen) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => toast('请使用 F11 退出浏览器全屏')); else document.documentElement.requestFullscreen().catch(() => toast('可按 F11 进入浏览器全屏')); }
  function cancelPointer(suppress = true) {
    if (!pointer) return;
    const id = pointer.id; pointer = null;
    if (suppress) suppressClickUntil = performance.now() + 500;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  canvas.addEventListener('pointerdown', e => {
    if (runtime.capabilities.pointer !== 'native' || e.button !== 0 || pointer || runtime.paused) return;
    suppressClickUntil = 0; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, camera, birth: time, dragged: false };
    // Desktop click forwarding dispatches synthetic pointer events, which have
    // no active native pointer to capture. Their subsequent click still works.
    if (e.isTrusted) canvas.setPointerCapture(e.pointerId);
    wake();
  });
  canvas.addEventListener('pointermove', e => {
    wake(); if (!pointer || pointer.id !== e.pointerId) return;
    const dx = e.clientX - pointer.x;
    if (Math.hypot(dx, e.clientY - pointer.y) > 8 && !pointer.dragged) { pointer.dragged = true; setAuto(false); }
    if (pointer.dragged) { camera = clamp(pointer.camera - dx * H / innerHeight, 0, maxCamera); transit = null; render(); }
  });
  canvas.addEventListener('pointerup', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const held = charge();
    if (pointer.dragged) rememberCamera({ tourMode: 'fixed', fixedZone: zoneAt() });
    if (pointer.dragged || held > .05) {
      suppressClickUntil = performance.now() + 500;
      if (!pointer.dragged) bloomAt(e.clientX * view / innerWidth + camera, e.clientY * H / innerHeight, .85 + held * 1.05, true);
    }
    cancelPointer(false);
  });
  canvas.addEventListener('click', e => {
    if (e.button !== 0 || performance.now() < suppressClickUntil) return;
    bloomAt(e.clientX * view / innerWidth + camera, e.clientY * H / innerHeight, .85, true);
  });
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('lostpointercapture', cancelPointer);
  addEventListener('blur', cancelPointer);
  document.querySelector('#bloom').addEventListener('click', () => bloomAt(camera + view * .5, 480, 1.9));
  document.querySelectorAll('[data-zone]').forEach(b => b.addEventListener('click', () => goToZone(Number(b.dataset.zone))));
  document.querySelector('#tour').addEventListener('click', () => setAuto(!auto, true));
  document.querySelector('#pause').addEventListener('click', () => setPaused(!paused));
  document.querySelector('#fullscreen').addEventListener('click', fullscreen);
  document.querySelector('#help').addEventListener('click', () => toggleHelp());
  document.querySelector('#close-help').addEventListener('click', () => toggleHelp(false));
  document.addEventListener('pointermove', wake, { passive: true });
  document.addEventListener('pointerdown', wake, { passive: true });
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    wake();
    if (e.target.closest('#settings-panel')) return;
    // Keep native keyboard activation on focused controls.
    if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest('button')) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault(); const base = transit ? transit.to : camera;
      setAuto(false, false, false);
      const target = clamp(base + (e.code === 'ArrowRight' ? 1 : -1) * view * .26, 0, maxCamera);
      const center = target + view * .5;
      rememberCamera({ tourMode: 'fixed', fixedZone: center < 2400 ? 0 : center < 4550 ? 1 : 2 });
      if (paused || reduced.matches) { camera = target; render(); } else moveTo(target, .8);
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
    if (e.code === 'KeyA') setAuto(!auto, true);
    if (e.code === 'KeyE') bloomAt(camera + view * .5, 480, 1.9);
    if (e.code === 'KeyF') fullscreen();
    if (e.code === 'KeyH') toggleHelp();
    if (e.code === 'Escape' && !document.querySelector('#help-panel').hidden) toggleHelp(false);
    if (e.code === 'KeyS') document.body.classList.toggle('interface-hidden');
    if (/^Digit[123]$/.test(e.code)) goToZone(Number(e.code.slice(-1)) - 1);
  });
  function resize() {
    cancelPointer();
    const center = camera + view * .5;
    const profile = qualityProfiles[preferences.quality];
    const ratio = Math.min(devicePixelRatio || 1, profile.dpr, profile.edge / innerWidth, profile.edge / innerHeight, Math.sqrt(profile.pixels / (innerWidth * innerHeight)));
    canvas.width = Math.max(1, Math.round(innerWidth * ratio)); canvas.height = Math.max(1, Math.round(innerHeight * ratio));
    scale = canvas.height / H; view = canvas.width / scale; maxCamera = Math.max(0, WORLD - view); camera = clamp(center - view * .5, 0, maxCamera);
    if (transit) { transit.from = camera; transit.to = clamp(transit.to, 0, maxCamera); transit.elapsed = 0; }
    render();
  }
  addEventListener('ocean-preferences-change', () => {
    if (writingPreferences) return;
    const previous = preferences; preferences = OceanSettings.get();
    climate.configure({ weather: preferences.weather, daylight: preferences.daylight }, time);
    if (previous.daylight !== 'auto' && preferences.daylight === 'auto') syncLocalDaylight();
    if (preferences.quality !== previous.quality) {
      qualityLevel = preferences.quality; detailLevel = qualityProfiles[qualityLevel].detail;
      renderCost = 0; performanceSamples = 0; last = 0; lastDraw = 0; resize();
    }
    if (preferences.tourMode !== previous.tourMode) setAuto(preferences.tourMode === 'auto', false, false);
    if (preferences.tourMode === 'fixed' && (previous.tourMode !== 'fixed' || preferences.fixedZone !== previous.fixedZone)) goToZone(preferences.fixedZone, false, false);
    atmosphere = climate.sample(time); render(); wake(); updateHud(true);
  });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    last = 0; cancelPointer();
    if (document.hidden) suspendedAt = Date.now();
    else {
      if (suspendedAt && Date.now() - suspendedAt > 60000) syncLocalDaylight();
      suspendedAt = 0; lastWallFrame = Date.now();
    }
  });
  reduced.addEventListener('change', e => { if (e.matches) setAuto(false, false, false); });
  const getState = () => ({ id: 'ocean-drift', time, frames, paused, auto, camera, viewWidth: view, worldWidth: WORLD, maxCamera, zone: zoneAt(), dwelling: !transit, dwell, transit: transit ? { ...transit } : null, width: canvas.width, height: canvas.height, maxFps: qualityProfiles[preferences.quality].fps, detailLevel, qualityLevel, preferences: { ...preferences }, climate: climate.sample(time), environment: environmentAt(), renderCost, fish: fish.length, bubbles: bubbles.length, reducedMotion: reduced.matches,
    interactions, animalTouches, charge: charge(), blooms: blooms.map(b => ({ x: b.x, y: b.y, power: b.power, age: time - b.birth })), sparks: sparks.length,
    fishStates: fish.map(f => ({ ...position(f, fishHome(f)), size: f.size, facing: f.facing, tilt: f.tilt, drift: Math.hypot(f.ox, f.oy), vx: f.vx, vy: f.vy, scared: alarm(f), avoidingLight: f.avoidUntil > time })),
    turtle: { ...position(turtleMotion, turtleHome()), drift: Math.hypot(turtleMotion.ox, turtleMotion.oy), scared: alarm(turtleMotion) },
    ray: { ...position(rayMotion, rayHome()), drift: Math.hypot(rayMotion.ox, rayMotion.oy), scared: alarm(rayMotion) },
    jellyStates: jellies.map(j => ({ ...jellyPosition(j), size: j.size, drift: Math.hypot(j.ox, j.oy), scared: alarm(j), light: jellyLight(j), pending: j.echoes.filter(e => e.at > time).length })),
    kelpBend: Math.max(0, ...kelps.map(k => Math.abs(currentAt(k.x + camera * (1 - k.depth), k.y - k.h * .65).x))) });
  window.oceanDrift = Object.freeze({ getState, setPaused, setAuto, goToZone }); window.getState = getState;
  function loop(stamp) {
    requestAnimationFrame(loop);
    if (!document.querySelector('#help-panel').hidden || document.body.classList.contains('settings-open') || document.querySelector('button:focus-visible')) lastInput = stamp;
    if (stamp - lastInput > 6500 && runtime.canIdle()) document.body.classList.add('idle');
    if (runtime.paused) { last = 0; return; }
    const wallFrame = Date.now();
    if (wallFrame - lastWallFrame > 60000) syncLocalDaylight();
    lastWallFrame = wallFrame;
    const interval = 1000 / qualityProfiles[preferences.quality].fps;
    if (stamp - lastDraw < interval) return;
    const dt = last ? Math.min(.08, (stamp - last) / 1000) : 0; last = stamp; lastDraw = stamp - (stamp - lastDraw) % interval;
    time += dt; atmosphere = climate.sample(time); updateCamera(dt); updateInteractions(dt); render();
  }
  runtime.onStateChange(() => { last = lastDraw = 0; cancelPointer(); wake(); });
  resize(); setAuto(auto, false, false);
  if (preferences.tourMode === 'fixed') { camera = targetFor(preferences.fixedZone); render(); }
  requestAnimationFrame(loop);
}
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startScene, { once: true });
else startScene();
})();

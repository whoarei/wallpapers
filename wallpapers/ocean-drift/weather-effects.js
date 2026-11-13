/* Subsurface foam, entrained bubbles and shared orbital surge. Every sample uses the scene clock;
 * changing weather never moves the camera or allocates a world-sized texture. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OceanWeather = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const mod = (n, m) => ((n % m) + m) % m;
  function sample(time, env, reduced = false) {
    const presence = clamp(((env.weatherInfluence ?? 1) - .06) / .94);
    const wind = clamp((env.overcast * .15 + env.rain * .42 + env.storm) * presence);
    return { time: reduced ? 0 : time, presence, wind,
      foam: presence * (env.storm * .95 + env.rain * .16),
      rain: presence * (env.rain + env.storm * .32), night: env.night, reduced };
  }
  function transport(x, y, time, env, reduced = false) {
    if (reduced) return { x: 0, y: 0, vx: 0, vy: 0 };
    const wind = clamp((env.rain * .42 + env.storm + env.overcast * .1) * (env.weatherInfluence ?? 1));
    const phase = x * .0036 + y * .0007 - time * .72;
    const secondary = phase * .53 + time * .18;
    const reach = .35 + .65 * Math.exp(-Math.max(0, y) / 760);
    // Orbital surge has both horizontal and vertical motion, attenuated down
    // the water column. Fixed frequencies avoid phase jumps during a front.
    return {
      x: wind * reach * (Math.sin(phase) * 42 + Math.sin(secondary) * 12),
      y: wind * reach * (Math.cos(phase) * 19 + Math.cos(secondary) * 5),
      vx: wind * reach * (-Math.cos(phase) * 30.24 - Math.cos(secondary) * 2.4192),
      vy: wind * reach * (Math.sin(phase) * 13.68 + Math.sin(secondary) * 1.008)
    };
  }
  function flow(x, y, time, env, reduced = false) {
    const water = transport(x, y, time, env, reduced);
    return { x: water.x, y: water.y };
  }
  const fraction = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  function drawSurface(ctx, { time, view, camera, env, reduced = false, detail = 1, quiet = () => 1 }) {
    const s = sample(time, env, reduced);
    if (s.presence < .005) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, view, 350); ctx.clip();
    // A soft, unbounded light field carries the sense of moving water. There
    // are deliberately no horizon paths, wave bands, or full-width strokes.
    if (s.wind > .01) for (let i = 0; i < 3; i++) {
      const water = flow(camera + i * 620, 120, s.time, env, reduced);
      const x = view * (.13 + i * .4) + water.x * 2.3;
      const y = 35 + water.y, radius = 250 + i % 2 * 90;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(117,185,190,${s.wind * .075 * quiet(x)})`);
      glow.addColorStop(1, 'rgba(117,185,190,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    if (s.foam > .01) {
      const count = Math.ceil(view / (detail < .75 ? 96 : 62));
      for (let i = 0; i < count; i++) {
        const bornX = mod(i * 137.3 + s.time * (3 + i % 5) - camera * .16, view + 220) - 110;
        const water = flow(bornX + camera, 80, s.time, env, reduced);
        const x = bornX + water.x * .6;
        const y = 12 + fraction(i + 7) * 105 + water.y * .4;
        const age = mod(s.time * .115 + i * .618, 1), fade = Math.sin(age * Math.PI);
        const alpha = s.foam * fade * (.27 + fraction(i) * .25) * quiet(x);
        // Irregular small clusters, spread across an area rather than joined
        // into the contour of a wave. The clusters separate and fade away.
        const spread = 7 + age * 20;
        for (let j = 0; j < 6; j++) {
          const angle = fraction(i * 11 + j) * TAU;
          const px = x + Math.cos(angle) * spread, py = y + Math.sin(angle) * spread * .35;
          const size = 1.4 + fraction(i * 7 + j) * 3.8;
          ctx.beginPath(); ctx.ellipse(px, py, size * 1.35, size * .55, -.2, 0, TAU);
          ctx.fillStyle = `rgba(221,239,228,${alpha})`; ctx.fill();
        }
        // Air is pushed down by a breaker, then rises back up. Its sideways
        // orbit uses the same water field as the animals and suspended motes.
        const bubbles = detail < .75 ? 2 : 3;
        for (let j = 0; j < bubbles; j++) {
          const age = mod(s.time * .13 + i * .618 + j * .31, 1);
          const fade = Math.sin(age * Math.PI);
          const depth = fade * (75 + fraction(i * 3 + j) * 140);
          const bx = x + water.x * age * .6 + Math.sin(i * 2.4 + age * 5 + j) * 12;
          const by = y + depth + water.y * .25;
          const r = 1.7 + fraction(i * 5 + j) * 3 + fade * 1.8;
          const alpha = s.foam * fade * (.22 + fraction(i + j) * .12) * quiet(bx);
          ctx.beginPath(); ctx.ellipse(bx, by, r, r * (1.1 + Math.sin(age * TAU) * .1), .2, 0, TAU);
          ctx.fillStyle = `rgba(171,220,222,${alpha * .18})`; ctx.fill();
          ctx.strokeStyle = `rgba(204,237,231,${alpha})`; ctx.lineWidth = 1.1; ctx.stroke();
          ctx.beginPath(); ctx.ellipse(bx - r * .25, by - r * .3, r * .23, r * .15, -.5, 0, TAU);
          ctx.fillStyle = `rgba(232,246,236,${alpha * .85})`; ctx.fill();
        }
      }
    }
    if (s.rain > .01) {
      const count = Math.ceil(view / (detail < .75 ? 105 : 65));
      for (let i = 0; i < count; i++) {
        const age = mod(s.time * .43 + i * .618, 1);
        const x = mod(i * 173.3 - camera * .13, view + 160) - 80;
        const y = 32 + fraction(i + 33) * 130;
        ctx.beginPath(); ctx.ellipse(x, y, 5 + age * 31, 1 + age * 4, -.07, 0, TAU);
        ctx.strokeStyle = `rgba(181,228,229,${s.rain * Math.sin(age * Math.PI) * .32 * quiet(x)})`;
        ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawSediment(ctx, { time, view, camera, env, reduced = false, detail = 1, quiet = () => 1 }) {
    const s = sample(time, env, reduced);
    if (s.wind < .04) return;
    const count = detail < .75 ? 38 : 72;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const age = mod(s.time * .075 + i * .618, 1);
      const x = mod(i * 137.3 - camera * .8 + s.time * (9 + i % 7), view + 160) - 80;
      const y = 965 - Math.sin(age * Math.PI) * (45 + i % 11 * 11) * s.wind;
      ctx.beginPath(); ctx.ellipse(x, y, .8 + i % 4 * .45, .7 + i % 3 * .25, 0, 0, TAU);
      ctx.fillStyle = `rgba(169,196,184,${Math.sin(age * Math.PI) * s.wind * .32 * quiet(x)})`; ctx.fill();
    }
    ctx.restore();
  }
  return Object.freeze({ sample, transport, flow, drawSurface, drawSediment });
});

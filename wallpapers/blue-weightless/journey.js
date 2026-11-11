(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SwimJourney = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const TAU = Math.PI * 2, DURATION = 112, WORLD_WIDTH = 9000, SURFACE = 535;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const stages = [
    { start: 0, title: '纵身入蓝', note: '让世界，轻一点。' },
    { start: 7, title: '水下滑翔', note: '穿过一束光。' },
    { start: 17, title: '自由泳', note: '让呼吸，追上水的节奏。' },
    { start: 35, title: '蛙泳', note: '把水，轻轻推开。' },
    { start: 51, title: '仰泳', note: '仰面，收下整片天空。' },
    { start: 67, title: '蝶泳', note: '在水面，展开双翼。' },
    { start: 88, title: '从容归岸', note: '带走水珠，把黄昏留下。' }
  ];
  function sample(input) {
    const t = ((input % DURATION) + DURATION) % DURATION;
    const beginning = t >= 108;
    let stage = beginning ? 0 : stages.reduce((n, s, i) => t >= s.start ? i : n, 0);
    let x = 450, y = SURFACE - 274, angle = -Math.PI / 2, motion = 'stand', amount = 0;
    if (!beginning && t >= 4 && t < 7) {
      const u = (t - 4) / 3;
      x = lerp(450, 920, u); y = SURFACE - 274 - Math.sin(u * Math.PI) * 125 + 406 * u * u;
      angle = lerp(-Math.PI / 2, .58, smooth(u)); motion = 'dive'; amount = smooth(u * 3);
    } else if (!beginning && t >= 7 && t < 17) {
      const u = (t - 7) / 10;
      x = lerp(920, 1830, u); y = SURFACE + lerp(132, 18, smooth(u)) + Math.sin(u * Math.PI) * 26;
      angle = .58 * (1 - smooth(u * 4)) - .08 * Math.sin(u * Math.PI); motion = 'glide';
    } else if (!beginning && t >= 17 && t < 35) {
      x = lerp(1830, 3300, (t - 17) / 18); y = SURFACE + 18 + Math.sin(t * 2.7) * 3; angle = Math.sin(t * 2.7) * .018; motion = 'freestyle';
    } else if (!beginning && t >= 35 && t < 51) {
      x = lerp(3300, 4600, (t - 35) / 16); y = SURFACE + 12 + Math.sin(t * 2.15) * 8; angle = Math.sin(t * 2.15) * .035; motion = 'breaststroke';
    } else if (!beginning && t >= 51 && t < 67) {
      x = lerp(4600, 5950, (t - 51) / 16); y = SURFACE + 11 + Math.sin(t * 2.5) * 3; angle = 0; motion = 'backstroke';
    } else if (!beginning && t >= 67 && t < 88) {
      x = lerp(5950, 7800, (t - 67) / 21); y = SURFACE + 17 + Math.sin(t * 2.8) * 12; angle = Math.sin(t * 2.8) * .065; motion = 'butterfly';
    } else if (!beginning && t >= 88 && t < 92) {
      x = lerp(7800, 8130, smooth((t - 88) / 4)); y = SURFACE + 17; angle = 0; motion = 'breaststroke';
    } else if (!beginning && t >= 92) {
      const u = smooth((t - 92) / 8);
      x = lerp(8130, 8350, u); y = lerp(SURFACE + 17, SURFACE - 274, u); angle = lerp(0, -Math.PI / 2, u); motion = t < 100 ? 'climb' : 'stand'; amount = u;
    }
    if (stage > 0 && t - stages[stage].start < 1) {
      const previous = sample(stages[stage].start - .0001), u = smooth(t - stages[stage].start);
      y = lerp(previous.y, y, u); angle = lerp(previous.angle, angle, u);
    }
    const fade = t >= 104 && t < 108 ? smooth((t - 104) / 4) : t >= 108 ? 1 - smooth((t - 108) / 4) : 0;
    return { t, stage, x, y, angle, motion, amount, fade, beginning, submerged: y > SURFACE + 50 };
  }
  return { TAU, DURATION, WORLD_WIDTH, SURFACE, clamp, lerp, smooth, stages, sample };
});

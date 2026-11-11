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
    let x = 450, y = SURFACE - 210, angle = -Math.PI / 2, motion = 'stand', amount = 0;
    if (!beginning && t >= 4 && t < 7) {
      const u = (t - 4) / 3;
      x = lerp(450, 920, u); y = SURFACE - 210 - Math.sin(u * Math.PI) * 125 + 342 * u * u;
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
      x = lerp(8130, 8350, u); y = lerp(SURFACE + 17, SURFACE - 210, u); angle = lerp(0, -Math.PI / 2, u); motion = t < 100 ? 'climb' : 'stand'; amount = u;
    }
    if (stage > 0 && t - stages[stage].start < 1) {
      const previous = sample(stages[stage].start - .0001), u = smooth(t - stages[stage].start);
      y = lerp(previous.y, y, u); angle = lerp(previous.angle, angle, u);
    }
    const fade = t >= 104 && t < 108 ? smooth((t - 104) / 4) : t >= 108 ? 1 - smooth((t - 108) / 4) : 0;
    return { t, stage, x, y, angle, motion, amount, fade, beginning, submerged: y > SURFACE + 50 };
  }
  const point = (x, y) => [x, y];
  function pose(state) {
    const t = state.t, motion = state.motion, phase = t * 2.7;
    const hip = point(-34, 7), shoulder = point(42, 0);
    let head = 1.02, arms = [], legs = [];
    for (let side = 0; side < 2; side++) {
      const far = side === 0, offset = far ? -4 : 4, p = phase + side * Math.PI;
      let elbow = point(78, offset), hand = point(121, offset - 3), knee = point(-82, 9 + offset), foot = point(-143, 10 + offset);
      if (motion === 'stand') {
        elbow = point(11, 21 + offset); hand = point(-24, 17 + offset);
        knee = point(-82, offset + 4); foot = point(-142, offset + (far ? -3 : 11)); head = Math.PI / 2;
      } else if (motion === 'freestyle') {
        const a = -p;
        elbow = point(42 + Math.cos(a) * 36, Math.sin(a) * 32 + offset);
        hand = point(elbow[0] + Math.cos(a - .7) * 43, elbow[1] + Math.sin(a - .7) * 26);
        knee = point(-82, 10 + Math.sin(p * 1.8) * 10 + offset);
        foot = point(-141, 12 + Math.sin(p * 1.8 - .7) * 17 + offset); head = .38 + Math.sin(phase * .5) * .16;
      } else if (motion === 'breaststroke') {
        const a = t * 2.15, sweep = (Math.sin(a) + 1) / 2, sign = far ? -1 : 1;
        elbow = point(76 - 32 * sweep, offset + sign * (9 + 25 * sweep));
        hand = point(119 - 67 * sweep, offset + sign * (3 + 33 * sweep));
        knee = point(-83 + 25 * sweep, 12 + sign * (8 + 16 * sweep));
        foot = point(-141 + 49 * sweep, 10 + sign * (7 + 38 * sweep)); head = .5 - Math.sin(a) * .15;
      } else if (motion === 'backstroke') {
        const a = p;
        elbow = point(42 + Math.cos(a) * 36, Math.sin(a) * 35 + offset);
        hand = point(42 + Math.cos(a) * 78, Math.sin(a) * 78 + offset);
        knee = point(-82, 8 + Math.sin(p * 2) * 7 + offset); foot = point(-143, 8 + Math.sin(p * 2 - .7) * 15 + offset); head = -1.1;
      } else if (motion === 'butterfly') {
        const a = t * 2.8, sign = far ? .75 : 1;
        elbow = point(42 + Math.cos(a) * 35, Math.sin(a) * 32 * sign + offset);
        hand = point(42 + Math.cos(a - .2) * 77, Math.sin(a - .2) * 54 * sign + offset);
        knee = point(-82, 11 + Math.sin(a - .5) * 11 + offset);
        foot = point(-141, 10 + Math.sin(a - 1) * 23 + offset); head = .65 + Math.sin(a) * .16;
      } else if (motion === 'climb') {
        const u = state.amount, a = t * 2.1 + side * Math.PI;
        elbow = point(60 - 38 * u, 22 + offset);
        hand = point(92 - 110 * u, 20 + offset);
        knee = point(-75 + Math.sin(a) * 15 * (1 - u), 24 + Math.cos(a) * 18 * (1 - u) + offset);
        foot = point(-133 + Math.cos(a) * 18 * (1 - u), 18 + offset); head = lerp(.6, Math.PI / 2, u);
      } else if (motion === 'glide' || motion === 'dive') {
        knee[1] += Math.sin(t * 1.8 + side * 2) * 3;
        foot[1] += Math.sin(t * 1.8 + side * 2 - .6) * 6;
        head = 1.13;
      }
      arms.push({ shoulder: point(shoulder[0], shoulder[1] + offset), elbow, hand });
      legs.push({ hip: point(hip[0], hip[1] + offset), knee, foot });
    }
    return { hip, shoulder, head, arms, legs };
  }
  return { TAU, DURATION, WORLD_WIDTH, SURFACE, clamp, lerp, smooth, stages, sample, pose };
});

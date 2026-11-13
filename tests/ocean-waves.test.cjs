"use strict";
const assert = require('node:assert/strict');
const Climate = require('../wallpapers/ocean-drift/climate.js');
const Waves = require('../wallpapers/ocean-drift/weather-effects.js');
const environment = (weather, depth = 0) => Climate.atDepth(Climate.create({ weather, daylight: 'night' }).sample(0), depth);
const clear = environment('clear'), storm = environment('storm');
assert.equal(Waves.sample(3, clear).foam, 0, 'calm weather has no breaker foam');
assert.ok(Waves.sample(3, storm).foam > .9, 'storm exposes substantial broken foam');
assert.equal(Waves.sample(3, environment('storm', 1)).presence, 0, 'surface particles disappear in deep water');
assert.ok(Waves.sample(3, environment('storm', .5)).foam < Waves.sample(3, storm).foam * .4);
let horizontal = 0, vertical = 0;
for (const weather of ['clear', 'overcast', 'rain', 'storm']) for (const depth of [0, .4, 1]) {
  const env = environment(weather, depth);
  for (let t = 0; t < 100; t += .25) for (const x of [0, 450, 1800, 7100]) {
    const flow = Waves.transport(x, 480, t, env), next = Waves.transport(x, 480, t + 1e-5, env);
    assert.ok(Object.values(flow).every(Number.isFinite));
    assert.ok(Math.abs(flow.x) <= 54 && Math.abs(flow.y) <= 24, 'orbital displacement remains bounded');
    assert.ok(Math.abs((next.x - flow.x) / 1e-5 - flow.vx) < .001, 'horizontal motion and velocity are continuous');
    assert.ok(Math.abs((next.y - flow.y) / 1e-5 - flow.vy) < .001, 'vertical motion and velocity are continuous');
    if (weather === 'storm' && depth === 0) { horizontal = Math.max(horizontal, Math.abs(flow.x)); vertical = Math.max(vertical, Math.abs(flow.y)); }
  }
}
assert.ok(horizontal > 25 && vertical > 12, 'water has a visible horizontal and vertical orbit');
const orbit = Array.from({ length: 240 }, (_, i) => Waves.flow(450, 300, i / 10, storm));
assert.ok(Math.min(...orbit.map(p => p.x)) < -20 && Math.max(...orbit.map(p => p.x)) > 20, 'water swings in both horizontal directions');
assert.ok(Math.min(...orbit.map(p => p.y)) < -10 && Math.max(...orbit.map(p => p.y)) > 10, 'water swings up and down');
assert.deepEqual(Waves.sample(0, storm, true), Waves.sample(9000, storm, true), 'reduced motion freezes foam emission');
assert.deepEqual(Waves.transport(100, 200, 90, storm, true), { x: 0, y: 0, vx: 0, vy: 0 });
// Deliberately leave continuous-path drawing methods out of this canvas double.
// Particle strokes must stay local: a connected wave contour is a regression.
let strokes = 0, fills = 0, min = 0, max = 0;
const ctx = {
  save() {}, restore() {}, rect() {}, clip() {}, fillRect() {},
  beginPath() { min = Infinity; max = -Infinity; },
  createRadialGradient() { return { addColorStop() {} }; },
  ellipse(x, y, rx) { min = Math.min(min, x - rx); max = Math.max(max, x + rx); },
  fill() { fills++; }, stroke() { strokes++; assert.ok(max - min < 90, 'surface has no long wave strokes'); }
};
Waves.drawSurface(ctx, { time: 2, view: 1778, camera: 120, env: storm });
assert.ok(strokes > 70 && fills > 200, 'surface includes foam clusters and many entrained bubbles');
assert.ok(strokes < 150, 'particle work remains bounded');
for (const at of [0, 3600, 86400]) {
  const climate = Climate.create({ weather: 'clear', daylight: 'night' });
  climate.configure({ weather: 'storm' }, at, 5);
  for (let dt = 0; dt < 8; dt += .1) {
    const a = Waves.flow(400, 300, at + dt, Climate.atDepth(climate.sample(at + dt), 0));
    const b = Waves.flow(400, 300, at + dt + 1 / 30, Climate.atDepth(climate.sample(at + dt + 1 / 30), 0));
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 3, 'late weather transitions do not jump');
  }
}
const preview = Climate.create({ weather: 'clear', daylight: 'night' });
preview.configure({ weather: 'storm' }, 10, 5);
assert.equal(preview.sample(10).storm, 0);
assert.ok(preview.sample(12.5).storm > .49 && preview.sample(12.5).storm < .51);
assert.equal(preview.sample(15).storm, 1);
preview.configure({ weather: 'rain', daylight: 'day' }, 15, 0);
assert.equal(preview.sample(15).rain, 1, 'paused choice immediately previews the target weather');
assert.equal(preview.sample(15).night, 0);
assert.deepEqual(preview.sample(15), preview.sample(15), 'preview does not require advancing time');
console.log('PASS: line-free foam and bubbles, visible orbital transport, calm/deep separation, reduced motion, late-transition continuity and explicit previews.');

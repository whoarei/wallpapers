'use strict';
const assert = require('node:assert/strict');
const climate = require('../wallpapers/ocean-drift/climate.js');
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);
const physical = ['light', 'warmth', 'current', 'surfaceDisturbance', 'night', 'visibility'];
function bounded(state) {
  for (const name of physical) assert.ok(Number.isFinite(state[name]) && state[name] >= (name === 'warmth' ? -1 : 0) && state[name] <= 1, `${name} is normalized`);
  close(state.clear + state.overcast + state.rain + state.storm, 1);
}

// Initial locked preferences apply immediately, then user changes take a minute.
const sea = climate.create({ weather: 'clear', daylight: 'day', hour: 12 });
assert.equal(sea.sample(0).clear, 1);
assert.equal(sea.sample(0).night, 0);
const before = sea.sample(15);
const start = sea.configure({ weather: 'storm', daylight: 'night' }, 15);
for (const name of physical) close(start[name], before[name]);
assert.equal(start.transitioning, true);
const middle = sea.sample(45), after = sea.sample(75);
assert.ok(middle.clear > 0 && middle.storm > 0 && middle.night > 0 && middle.night < 1);
assert.equal(after.storm, 1);
assert.equal(after.night, 1);
assert.equal(after.transitioning, false);
for (let t = 15; t <= 76; t += .1) {
  const a = sea.sample(t), b = sea.sample(t + .01); bounded(a);
  for (const name of physical) assert.ok(Math.abs(a[name] - b[name]) < .001, `continuous ${name}`);
}
// Changing a selection during an existing transition also cannot jump.
const changing = climate.create({ weather: 'clear', daylight: 'day', hour: 12 });
changing.configure({ weather: 'rain' }, 5);
const interrupted = changing.sample(28);
const rescheduled = changing.configure({ weather: 'overcast' }, 28);
for (const name of physical) close(interrupted[name], rescheduled[name]);
assert.equal(changing.sample(88).overcast, 1);
// Duplicate configuration must not restart an in-progress blend.
changing.configure({ weather: 'clear' }, 90);
changing.configure({ weather: 'clear' }, 120);
assert.equal(changing.sample(150).clear, 1);

// Weather fronts strongly affect shallow water, with only a trace in deep water.
const sun = climate.create({ weather: 'clear', daylight: 'day', hour: 12 }).sample(0);
const storm = climate.create({ weather: 'storm', daylight: 'day', hour: 12 }).sample(0);
const shallowSun = climate.atDepth(sun, 0), shallowStorm = climate.atDepth(storm, 0);
const deepSun = climate.atDepth(sun, 1), deepStorm = climate.atDepth(storm, 1);
close(shallowStorm.light, storm.light);
assert.ok(shallowSun.light - shallowStorm.light > .5);
assert.ok(deepSun.light - deepStorm.light < .025);
assert.ok(deepStorm.surfaceDisturbance < .03);
assert.ok(deepStorm.current - deepSun.current < .025);
assert.equal(deepStorm.weather, 'storm');
const deepNight = climate.atDepth(climate.create({ weather: 'clear', daylight: 'night' }).sample(0), 1);
assert.ok(deepNight.light < deepSun.light && deepNight.light > .5, 'deep night retains subtle ambient visibility');

// Daylight and weather stay independent, including the full real-time clock.
const day = climate.create({ weather: 'rain', daylight: 'auto', hour: 12 });
assert.equal(day.sample(0).night, 0);
assert.equal(day.sample(43200).night, 1);
close(day.sample(3600).hour, 13);
assert.equal(day.sample(43200).rain, 1);
const locked = climate.create({ weather: 'overcast', daylight: 'dusk', hour: 3 });
assert.deepEqual(physical.map(name => locked.sample(0)[name]), physical.map(name => locked.sample(12000)[name]));
assert.equal(locked.sample(0).daylightLabel, '暮色');

// Resuming after a long wall-clock suspension reanchors local time without
// advancing weather or jumping the displayed light at the first resumed frame.
const resume = climate.create({ weather: 'auto', daylight: 'auto', hour: 12, seed: 71 });
const resumeControl = climate.create({ weather: 'auto', daylight: 'auto', hour: 12, seed: 71 });
const midday = resume.sample(45);
const resumed = resume.synchronizeHour(0, 45);
close(resumed.hour, 0);
for (const name of physical) close(resumed[name], midday[name]);
assert.equal(resumed.transitioning, true);
assert.ok(resume.sample(75).night > 0 && resume.sample(75).night < 1);
assert.equal(resume.sample(105).night, 1);
close(resume.sample(3645).hour, 1);
for (const t of [45, 75, 105, 1000]) {
  const state = resume.sample(t), control = resumeControl.sample(t);
  for (const name of ['clear', 'overcast', 'rain', 'storm', 'current', 'surfaceDisturbance', 'visibility']) close(state[name], control[name]);
}
const pausedAfterResume = resume.sample(75);
for (let i = 0; i < 5; i++) assert.deepEqual(resume.sample(75), pausedAfterResume);
// A second correction during catch-up starts from the displayed light as well.
const corrected = resume.synchronizeHour(7, 75);
for (const name of physical) close(corrected[name], pausedAfterResume[name]);
const invalidSync = resume.sample(80);
assert.deepEqual(resume.synchronizeHour(NaN, 80), invalidSync);
for (const mode of ['day', 'dusk', 'night']) {
  const fixed = climate.create({ weather: 'rain', daylight: mode, hour: 12 });
  const beforeSync = fixed.sample(20);
  const afterSync = fixed.synchronizeHour(0, 20);
  for (const name of physical) close(afterSync[name], beforeSync[name]);
  assert.equal(afterSync.transitioning, false);
  close(afterSync.hour, 0);
  for (const name of physical) close(fixed.sample(80)[name], beforeSync[name]);
}

// Auto fronts are reproducible at any scene time and continuous at boundaries.
const a = climate.create({ weather: 'auto', daylight: 'auto', hour: 14.2, seed: 301 });
const b = climate.create({ weather: 'auto', daylight: 'auto', hour: 14.2, seed: 301 });
const encountered = new Set(); let hasTransition = false, previous = a.sample(0);
for (let t = 0; t < 15000; t += 1) {
  const state = a.sample(t); bounded(state); encountered.add(state.weather); hasTransition ||= state.transitioning;
  if (t % 101 === 0) assert.deepEqual(state, b.sample(t));
  for (const name of physical) assert.ok(Math.abs(state[name] - previous[name]) < .035, `auto ${name} is continuous`);
  previous = state;
}
assert.deepEqual([...encountered].sort(), ['clear', 'overcast', 'rain', 'storm']);
assert.ok(hasTransition);
// A frozen scene clock leaves weather and light completely unchanged; queries
// neither consume randomness nor advance a hidden wall clock.
const frozen = a.sample(705);
for (let i = 0; i < 10; i++) assert.deepEqual(a.sample(705), frozen);
a.sample(20000);
assert.deepEqual(a.sample(705), frozen);
const invalid = climate.create({ weather: 'invalid', daylight: 'invalid', hour: -1 });
assert.equal(invalid.sample(0).weatherMode, 'auto');
close(invalid.sample(0).hour, 23);
invalid.configure({ weather: 'invalid', daylight: 'invalid' }, 0);
bounded(invalid.sample(0));
for (const depth of [-1, 0, .5, 1, 2, NaN]) bounded(climate.atDepth(storm, depth));
console.log('Ocean climate passed: continuous fronts, independent daylight, deep attenuation, deterministic scene clock, resume synchronization, locked preferences.');

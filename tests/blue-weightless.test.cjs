'use strict';
const assert = require('node:assert/strict');
const J = require('../wallpapers/blue-weightless/journey.js');

// The long journey must not teleport or generate invalid geometry on any frame.
let previous;
for (let frame = 0; frame <= J.DURATION * 60; frame++) {
  const s = J.sample(frame / 60), pose = J.pose(s);
  for (const n of [s.x, s.y, s.angle, s.fade, pose.head]) assert.ok(Number.isFinite(n));
  assert.ok(s.x > 100 && s.x < J.WORLD_WIDTH - 100);
  assert.ok(s.y > 100 && s.y < 900);
  assert.ok(s.fade >= 0 && s.fade <= 1);
  assert.equal(pose.arms.length, 2); assert.equal(pose.legs.length, 2);
  for (const limb of [...pose.arms, ...pose.legs]) for (const point of Object.values(limb)) {
    assert.equal(point.length, 2); assert.ok(point.every(Number.isFinite));
  }
  if (previous && s.fade < .99 && previous.fade < .99) {
    assert.ok(Math.hypot(s.x - previous.x, s.y - previous.y) < 8, `position discontinuity at ${s.t}`);
    assert.ok(Math.abs(s.angle - previous.angle) < .15, `rotation discontinuity at ${s.t}`);
  }
  previous = s;
}
assert.ok(J.sample(10).submerged, 'the underwater passage must actually be below the surface');
for (const [t, name] of [[25, 'freestyle'], [42, 'breaststroke'], [59, 'backstroke'], [76, 'butterfly']]) {
  assert.equal(J.sample(t).motion, name);
  assert.ok(Math.abs(J.sample(t).angle) < .2, `${name} keeps the torso horizontal at the surface`);
  assert.notDeepEqual(J.pose(J.sample(t)).arms, J.pose(J.sample(t + .35)).arms, `${name} must move its arms`);
  assert.notDeepEqual(J.pose(J.sample(t)).legs, J.pose(J.sample(t + .35)).legs, `${name} must move its legs`);
}
assert.equal(J.sample(96).motion, 'climb');
assert.ok(J.pose(J.sample(59)).head < -1, 'backstroke faces the sky');
for (let t = 75; t < 78; t += .1) {
  const arms = J.pose(J.sample(t)).arms;
  assert.ok((arms[0].hand[1] - arms[0].shoulder[1]) * (arms[1].hand[1] - arms[1].shoulder[1]) >= 0, 'butterfly recovers both arms together');
}
assert.equal(J.sample(102).motion, 'stand');
assert.ok(J.sample(102).y < J.SURFACE - 100, 'the swimmer finishes above the pool deck');
assert.equal(J.sample(108).fade, 1, 'the camera reset must be fully hidden by the loop transition');
assert.deepEqual(J.sample(0), J.sample(J.DURATION));
assert.equal(J.sample(-1).t, J.DURATION - 1);
console.log('PASS: full 112-second trajectory at 60 FPS, continuous entry, four moving strokes, climb, masked loop and finite rig geometry');

'use strict';
const assert = require('node:assert/strict');
const J = require('../wallpapers/blue-weightless/journey.js');
const C = require('../wallpapers/blue-weightless/character.js');
const M = require('../wallpapers/blue-weightless/motion.js');
let previous;
for (let frame = 0; frame <= J.DURATION * 60; frame++) {
  const s = J.sample(frame / 60);
  for (const n of [s.x, s.y, s.angle, s.fade]) assert.ok(Number.isFinite(n));
  assert.ok(s.x > 100 && s.x < J.WORLD_WIDTH - 100); assert.ok(s.y > 100 && s.y < 900);
  assert.ok(s.fade >= 0 && s.fade <= 1); assert.ok(C.definitions[C.poseFor(s)]);
  if (previous && s.fade < .99 && previous.fade < .99) {
    assert.ok(Math.hypot(s.x - previous.x, s.y - previous.y) < 8, `position discontinuity at ${s.t}`);
    assert.ok(Math.abs(s.angle - previous.angle) < .15, `rotation discontinuity at ${s.t}`);
  }
  previous = s;
}
assert.ok(J.sample(10).submerged);
for (const [t, name] of [[25, 'freestyle'], [42, 'breaststroke'], [59, 'backstroke'], [76, 'butterfly']]) {
  assert.equal(C.poseFor(J.sample(t)), name);
  assert.ok(Math.abs(J.sample(t).angle) < .2, `${name} keeps the torso horizontal`);
}
assert.equal(C.poseFor(J.sample(94)), 'climb'); assert.equal(C.poseFor(J.sample(96)), 'stand'); assert.equal(C.poseFor(J.sample(102)), 'stand');
assert.equal(J.sample(108).fade, 1); assert.deepEqual(J.sample(0), J.sample(J.DURATION));
assert.equal(J.sample(-1).t, J.DURATION - 1);
// Every authored drawing is reachable, with repeatable timing for seeks/pauses.
for (const [name, definition] of Object.entries(M.definitions)) {
  const seen = new Set();
  assert.equal(definition.anchors.length, 16);
  for (let i = 0; i < 2400; i++) {
    const t = definition.start + i / 2400 * definition.period;
    const cycle = M.sample({ motion: name, t });
    seen.add(cycle.source);
    for (const n of [cycle.phase, cycle.heave, cycle.pitch, cycle.breath, cycle.force]) assert.ok(Number.isFinite(n));
    assert.ok(cycle.breath >= 0 && cycle.breath <= 1);
    assert.ok(cycle.force >= 0 && cycle.force <= 1);
    assert.ok(cycle.rect[0] >= 0 && cycle.rect[0] + cycle.rect[2] <= 1536);
    assert.ok(cycle.rect[1] >= 0 && cycle.rect[1] + cycle.rect[3] <= 1024);
    assert.deepEqual(cycle, M.sample({ motion: name, t }), 'seeking is deterministic');
    for (const event of cycle.events) assert.ok(event.age >= 0 && event.age < .58);
  }
  assert.equal(seen.size, 16, `${name} uses all sixteen complete drawings`);
  assert.equal(M.atPhase(name, 0).source, M.atPhase(name, 1).source, `${name} wraps its cycle`);
  const holds = definition.holds;
  if (holds) assert.ok(holds[0] > holds[5] && holds[15] > holds[7], 'breaststroke glides longer than it pulls');
}
assert.equal(M.sample({ motion: 'stand', t: 0 }), null);
assert.equal(M.definitions.butterfly.kicks, 2);
// Exercise actual rendering geometry, including rigid face, finger and toe islands.
for (const [key, definition] of Object.entries(C.definitions)) {
  const mesh = C.createMesh(definition); let moving = false;
  for (let t = 0; t < 6; t += .1) {
    const deformed = C.deform(mesh, t);
    assert.ok(mesh.minAreaRatio >= .3499, `${key} never folds or reverses its surface`);
    assert.ok(mesh.gain > 0, `${key} retains visible movement`);
    for (let i = 0; i < mesh.locks.length; i++) {
      assert.ok(Number.isFinite(deformed[i * 2]) && Number.isFinite(deformed[i * 2 + 1]));
      const delta = [deformed[i * 2] - mesh.rest[i * 2], deformed[i * 2 + 1] - mesh.rest[i * 2 + 1]];
      if (Math.hypot(...delta) > .2) moving = true;
      const control = mesh.locks[i];
      if (control === 0) assert.ok(Math.hypot(...delta) < .001, `${key} preserves face and hair geometry exactly`);
      if (control >= 0) for (let axis = 0; axis < 2; axis++) {
        assert.ok(Math.abs(delta[axis] - mesh.deltas[control * 2 + axis] * mesh.gain) < .001, `${key} preserves finger and toe shapes`);
      }
    }
  }
  assert.ok(moving, `${key} animates its complete artwork`);
}
const b = C.definitions.butterfly;
assert.equal(b.controls[7].phase, b.controls[9].phase, 'butterfly hands recover together');
const stand = C.definitions.stand;
assert.ok(Math.abs(J.sample(102).y + (1221 - stand.anchor[1]) * stand.scale - (J.SURFACE - 30)) < 1, 'standing feet rest on the deck');
console.log('PASS: journey continuity, four deterministic 16-drawing cycles, glide timing, two dolphin kicks, rigid detail meshes and grounded feet');

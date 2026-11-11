'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../wallpapers/zenith-sky/astro.js');
const { crc32 } = require('../wallpapers/zenith-sky/archive.js');
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const vectorClose = (a, b, tolerance) => a.forEach((v, i) => close(v, b[i], tolerance));
const epoch = Date.parse('2000-01-01T12:00:00Z');
close(M.julian(epoch), 2451545);
close(M.julian(Date.parse('1970-01-01T00:00:00Z')), 2440587.5);
close(M.sidereal(epoch), 280.46061837);
// Meeus, Astronomical Algorithms, Greenwich mean sidereal time example.
close(M.sidereal(Date.parse('1987-04-10T19:21:00Z')), 128.7378734, .00001);
close(M.wrap(M.sidereal(epoch + 86400000) - M.sidereal(epoch)), .98564736629, .000001);
close(M.wrap(M.sidereal(epoch, 30) - M.sidereal(epoch)), 30);

for (const latitude of [-90, -33.8688, 0, 31.2304, 90]) {
  for (const longitude of [-180, -74.006, 0, 121.4737, 180]) {
    const f = M.frame(epoch, latitude, longitude), lst = M.sidereal(epoch, longitude);
    vectorClose(M.horizontal(M.equatorial(lst, latitude), f, true), [0, 0, 1]);
    vectorClose(M.horizontal(M.equatorial(lst + 180, -latitude), f, true), [0, 0, -1]);
    close(M.altAz(M.horizontal([0, 0, 1], f, true)).altitude, latitude, 1e-6);
    close(M.horizontal(M.equatorial(lst + 90, 0), f, true)[0], 1);
  }
}
for (const t of ['1900-01-01', '2000-01-01T12:00:00Z', '2026-11-11', '2100-01-01']) {
  const p = M.precession(Date.parse(t));
  for (const [ra, dec] of [[0, 0], [359.999, -90], [101.2872, -16.7161], [37.9462, 89.2641]]) close(Math.hypot(...M.precess(M.equatorial(ra, dec), p)), 1);
}
vectorClose(M.precess([1, 0, 0], M.precession(epoch)), [1, 0, 0]);
const center = M.galactic(0, 0), pole = M.galactic(0, 90);
close(M.wrap(Math.atan2(center[1], center[0]) * M.DEG), 266.404995, .0001);
close(Math.asin(center[2]) * M.DEG, -28.936174, .0001);
close(M.wrap(Math.atan2(pole[1], pole[0]) * M.DEG), 192.85948, .0001);
close(Math.asin(pole[2]) * M.DEG, 27.12825, .0001);

const q = [0, 0, 0, 1];
assert.deepEqual(M.project([0, 0, 1], q, 800, 450, 400), { x: 800, y: 450, depth: 1, altitude: 90 });
close(M.project([1, 0, 0], q, 800, 450, 400).x, 400); // East at left.
close(M.project([0, 1, 0], q, 800, 450, 400).y, 50); // North at top.
assert.equal(M.project([0, 0, -1], q, 800, 450, 400), null);
for (const [x, y] of [[0, 0], [-1, 0], [.2, -.9], [2, 4]]) {
  const v = M.unproject(x, y), projected = M.project([-v[0], v[1], v[2]], q, 0, 0, 1);
  close(projected.x, x); close(projected.y, -y); close(Math.hypot(...v), 1);
}
for (const [a, b] of [[[0, 0, 1], [0, 0, -1]], [[0, 1, 0], [1, 0, 0]], [[0, 0, 1], [0, 0, 1]]]) vectorClose(M.rotate(a, M.between(a, b)), b);
const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync(require.resolve('../wallpapers/zenith-sky/sky-data.js'), 'utf8'), sandbox);
const data = sandbox.window.ZENITH_DATA;
assert.equal(data.stars.length, 5044); assert.equal(new Set(data.constellations.map(c => c.id)).size, 88);
assert.ok(data.stars.every(s => s.slice(0, 5).every(Number.isFinite) && Math.abs(s[2]) <= 90 && s[3] <= 6));
const sirius = data.stars.find(s => s[0] === 32349); close(sirius[1], 101.2872, .001); close(sirius[2], -16.7161, .001);
assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
console.log('PASS: published sidereal-time fixtures, 25 observing locations, hemispheres and poles, precession, galactic coordinates, spherical projection/drag, real star catalog, ZIP CRC-32.');

(function (root) {
  'use strict';
  const R = Math.PI / 180, DEG = 180 / Math.PI, TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const wrap = (n, m = 360) => ((n % m) + m) % m;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normalize = a => { const n = Math.hypot(...a); return n ? a.map(x => x / n) : [0, 0, 1]; };
  const julian = ms => ms / 86400000 + 2440587.5;
  function sidereal(ms, longitude = 0) {
    const days = julian(ms) - 2451545, t = days / 36525;
    return wrap(280.46061837 + 360.98564736629 * days + .000387933 * t * t - t * t * t / 38710000 + longitude);
  }
  function equatorial(ra, dec) { return [Math.cos(dec * R) * Math.cos(ra * R), Math.cos(dec * R) * Math.sin(ra * R), Math.sin(dec * R)]; }
  function precession(ms) {
    const t = (julian(ms) - 2451545) / 36525;
    return {
      zeta: (2306.2181 * t + .30188 * t * t + .017998 * t * t * t) / 3600 * R,
      z: (2306.2181 * t + 1.09468 * t * t + .018203 * t * t * t) / 3600 * R,
      theta: (2004.3109 * t - .42665 * t * t - .041833 * t * t * t) / 3600 * R
    };
  }
  function precess(v, p) {
    const x = Math.cos(p.zeta) * v[0] - Math.sin(p.zeta) * v[1], a = Math.sin(p.zeta) * v[0] + Math.cos(p.zeta) * v[1];
    const b = Math.cos(p.theta) * x - Math.sin(p.theta) * v[2], c = Math.sin(p.theta) * x + Math.cos(p.theta) * v[2];
    return [Math.cos(p.z) * b - Math.sin(p.z) * a, Math.sin(p.z) * b + Math.cos(p.z) * a, c];
  }
  function frame(ms, latitude, longitude) {
    const lst = sidereal(ms, longitude) * R, lat = latitude * R;
    return { lst, lat, sinL: Math.sin(lst), cosL: Math.cos(lst), sinP: Math.sin(lat), cosP: Math.cos(lat), precession: precession(ms) };
  }
  function horizontal(v, f, ofDate = false) {
    if (!ofDate) v = precess(v, f.precession);
    const meridian = f.cosL * v[0] + f.sinL * v[1];
    return [f.cosL * v[1] - f.sinL * v[0], f.cosP * v[2] - f.sinP * meridian, f.sinP * v[2] + f.cosP * meridian];
  }
  function altAz(v) { return { altitude: Math.asin(clamp(v[2], -1, 1)) * DEG, azimuth: wrap(Math.atan2(v[0], v[1]) * DEG) }; }
  function multiply(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - dot(a, b)];
  }
  function rotate(v, q) { const t = cross(q, v).map(n => n * 2), c = cross(q, t); return v.map((n, i) => n + q[3] * t[i] + c[i]); }
  function between(a, b) {
    const d = clamp(dot(a, b), -1, 1);
    if (d < -.999999) { const axis = normalize(cross(a, Math.abs(a[0]) < .8 ? [1, 0, 0] : [0, 1, 0])); return [...axis, 0]; }
    return normalize([...cross(a, b), 1 + d]);
  }
  function unproject(x, y) { const d = 1 + x * x + y * y; return [2 * x / d, 2 * y / d, (1 - x * x - y * y) / d]; }
  function project(v, q, cx, cy, radius) {
    const a = rotate([-v[0], v[1], v[2]], q), d = 1 + a[2];
    if (d < .03) return null;
    return { x: cx + radius * a[0] / d, y: cy - radius * a[1] / d, depth: a[2], altitude: Math.asin(clamp(v[2], -1, 1)) * DEG };
  }
  // IAU J2000 galactic-to-equatorial rotation (transpose of the IAU matrix).
  function galactic(l, b) {
    const v = equatorial(l, b);
    return [-.0548755604 * v[0] + .4941094279 * v[1] - .8676661490 * v[2], -.8734370902 * v[0] - .4448296300 * v[1] - .1980763734 * v[2], -.4838350155 * v[0] + .7469822445 * v[1] + .4559837762 * v[2]];
  }
  const api = Object.freeze({ R, DEG, TAU, clamp, wrap, dot, cross, normalize, julian, sidereal, equatorial, precession, precess, frame, horizontal, altAz, multiply, rotate, between, unproject, project, galactic });
  root.StarMath = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

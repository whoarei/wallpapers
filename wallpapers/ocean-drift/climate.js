/* Offline sea weather. All changes use the wallpaper's scene clock: no timers,
 * requests, flashing lightning, or raindrops drawn below the water surface.
 *
 * OceanClimate.create({ weather, daylight, hour, seed }) returns:
 *   configure({ weather, daylight }, sceneTime, transitionSeconds = 60),
 *   synchronizeHour(hour, sceneTime),
 *   sample(sceneTime), getState(sceneTime).
 * Weather: auto | clear | overcast | rain | storm.
 * Daylight: auto | day | dusk | night. `hour` anchors auto to local time at load.
 * On resume, synchronizeHour reanchors the local hour without advancing weather;
 * auto daylight catches up over 60 scene seconds, while locked daylight stays put.
 * `sample` contains clear/overcast/rain/storm mixture weights, light, current,
 * surfaceDisturbance, night, visibility in [0,1], warmth in [-1,1], weather/code,
 * label/weatherLabel, daylightLabel, hour, and transition status/progress.
 * atDepth(sample, depth) preserves the weather identity but attenuates its visual
 * and current effects: depth 0 is the coral garden, 1 the distant deep sea.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OceanClimate = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const WEATHER = ['clear', 'overcast', 'rain', 'storm'];
  const DAYLIGHT = ['auto', 'day', 'dusk', 'night'];
  const LABELS = { clear: '晴朗', overcast: '多云', rain: '雨天', storm: '风暴' };
  const DURATION = 60;
  const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = n => { const t = clamp(n); return t * t * t * (t * (t * 6 - 15) + 10); };
  const mod = (n, m) => ((n % m) + m) % m;
  const clock = n => Math.max(0, Number.isFinite(n) ? n : 0);
  const validWeather = value => value === 'auto' || WEATHER.includes(value);
  const validDaylight = value => DAYLIGHT.includes(value);
  const vector = code => WEATHER.map(value => +(code === value));
  const blendVector = (a, b, t) => a.map((value, i) => mix(value, b[i], t));
  const blendDaylight = (a, b, t) => ({ light: mix(a.light, b.light, t), warmth: mix(a.warmth, b.warmth, t), night: mix(a.night, b.night, t) });
  const weighted = (weights, values) => weights.reduce((sum, weight, i) => sum + weight * values[i], 0);
  const blendProgress = (time, blend) => blend.duration === 0 ? 1 : clamp((time - blend.at) / (blend.duration ?? DURATION));

  function daylightAt(mode, hour) {
    if (mode === 'day') return { light: 1, warmth: .06, night: 0 };
    if (mode === 'dusk') return { light: .62, warmth: .78, night: .35 };
    if (mode === 'night') return { light: .23, warmth: -.28, night: 1 };
    // A full real-time day, with broad dawn and dusk rather than a rapid loop.
    const sun = Math.sin((hour - 6) / 24 * Math.PI * 2);
    const day = smooth((sun + .12) / .42);
    const dawn = Math.exp(-Math.pow((hour - 6.6) / 1.15, 2));
    const dusk = Math.exp(-Math.pow((hour - 17.7) / 1.3, 2));
    return { light: mix(.23, 1, day), warmth: clamp(-.22 * (1 - day) + dawn * .65 + dusk * .78 + day * .04, -1, 1), night: 1 - day };
  }

  function create(options = {}) {
    let weatherMode = validWeather(options.weather) ? options.weather : 'auto';
    let daylightMode = validDaylight(options.daylight) ? options.daylight : 'auto';
    const date = new Date();
    const initialHour = mod(Number.isFinite(options.hour) ? options.hour : date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600, 24);
    let seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 6048;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // Adjacent states form plausible fronts. Storms are uncommon and approached
    // through rain. Period length is seeded, but always between 8 and 12 minutes.
    const fronts = ['clear', 'overcast', 'rain', 'overcast', 'clear', 'overcast', 'rain', 'storm', 'rain', 'overcast'];
    const offset = Math.floor(random() * 4);
    const schedule = fronts.map((_, i) => ({ code: fronts[(i + offset) % fronts.length], duration: 480 + random() * 240 }));
    const cycleDuration = schedule.reduce((total, state) => total + state.duration, 0);
    let weatherBlend = null, daylightBlend = null;
    let anchoredHour = initialHour, hourAnchorTime = 0;
    const hourAt = time => mod(anchoredHour + (time - hourAnchorTime) / 3600, 24);

    function autoWeather(time) {
      let elapsed = mod(time, cycleDuration), index = 0;
      while (index < schedule.length - 1 && elapsed >= schedule[index].duration) elapsed -= schedule[index++].duration;
      const state = schedule[index], next = schedule[(index + 1) % schedule.length];
      const progress = clamp((elapsed - state.duration + DURATION) / DURATION);
      return { weights: blendVector(vector(state.code), vector(next.code), smooth(progress)), transitioning: progress > 0 && progress < 1, progress };
    }
    function weatherAt(time) {
      const target = weatherMode === 'auto' ? autoWeather(time) : { weights: vector(weatherMode), transitioning: false, progress: 1 };
      if (!weatherBlend) return target;
      const progress = blendProgress(time, weatherBlend);
      return {
        weights: blendVector(weatherBlend.from, target.weights, smooth(progress)),
        transitioning: progress < 1 || target.transitioning,
        progress: progress < 1 ? progress : target.progress
      };
    }
    function dayAt(time) {
      const target = daylightAt(daylightMode, hourAt(time));
      if (!daylightBlend) return { ...target, transitioning: false, progress: 1 };
      const progress = blendProgress(time, daylightBlend);
      return { ...blendDaylight(daylightBlend.from, target, smooth(progress)), transitioning: progress < 1, progress };
    }
    function sample(sceneTime = 0) {
      const time = clock(sceneTime), weather = weatherAt(time), day = dayAt(time), weights = weather.weights;
      const index = weights.reduce((best, weight, i) => weight > weights[best] ? i : best, 0), code = WEATHER[index];
      const weatherLight = weighted(weights, [1, .79, .61, .43]);
      const weatherWarmth = weighted(weights, [.02, -.06, -.14, -.2]);
      const weatherVisibility = weighted(weights, [1, .91, .81, .69]);
      const active = [weather, day].filter(value => value.transitioning);
      const daylightLabel = day.night > .8 ? '夜晚' : day.warmth > .3 ? (hourAt(time) < 12 && daylightMode === 'auto' ? '晨光' : '暮色') : '白昼';
      return {
        clear: weights[0], overcast: weights[1], rain: weights[2], storm: weights[3],
        light: clamp(day.light * weatherLight), warmth: clamp(day.warmth + weatherWarmth, -1, 1),
        current: weighted(weights, [.12, .23, .41, .66]),
        surfaceDisturbance: weighted(weights, [.04, .17, .49, .81]),
        night: clamp(day.night), visibility: weatherVisibility,
        weather: code, code, label: LABELS[code], weatherLabel: LABELS[code], daylightLabel,
        weatherMode, daylightMode, daylight: daylightMode, hour: hourAt(time),
        transitioning: active.length > 0, transitionProgress: active.length ? Math.min(...active.map(value => value.progress)) : 1,
        weatherInfluence: 1, daylightLight: day.light, daylightWarmth: day.warmth,
        weatherLight, weatherWarmth, weatherVisibility
      };
    }
    function configure(patch = {}, sceneTime = 0, transitionSeconds = DURATION) {
      const time = clock(sceneTime);
      const duration = Number.isFinite(transitionSeconds) ? clamp(transitionSeconds, 0, DURATION) : DURATION;
      if (validWeather(patch.weather) && patch.weather !== weatherMode) {
        weatherBlend = { from: weatherAt(time).weights, at: time, duration };
        weatherMode = patch.weather;
      }
      if (validDaylight(patch.daylight) && patch.daylight !== daylightMode) {
        daylightBlend = { from: dayAt(time), at: time, duration };
        daylightMode = patch.daylight;
      }
      return sample(time);
    }
    function synchronizeHour(hour, sceneTime = 0) {
      const time = clock(sceneTime);
      if (!Number.isFinite(hour)) return sample(time);
      // Capture the displayed light before reanchoring. A long host suspension
      // must not instantly replace noon with night or fast-forward a weather front.
      const from = daylightMode === 'auto' ? dayAt(time) : null;
      anchoredHour = mod(hour, 24); hourAnchorTime = time;
      if (from) daylightBlend = { from, at: time };
      return sample(time);
    }
    return Object.freeze({ configure, synchronizeHour, sample, getState: sample });
  }

  function atDepth(state, depth = 0) {
    const d = clamp(Number.isFinite(depth) ? depth : 0);
    const influence = .035 + .965 * Math.pow(1 - d, 2.2);
    const daylightStrength = mix(1, .55, d);
    return {
      ...state,
      light: clamp(mix(1, state.daylightLight, daylightStrength) * mix(1, state.weatherLight, influence)),
      warmth: clamp(state.daylightWarmth * mix(1, .25, d) + state.weatherWarmth * influence, -1, 1),
      current: mix(.1, state.current, influence),
      surfaceDisturbance: state.surfaceDisturbance * influence,
      visibility: mix(1, state.weatherVisibility, influence),
      weatherInfluence: influence
    };
  }
  return Object.freeze({ create, atDepth, weatherCodes: Object.freeze([...WEATHER]), transitionDuration: DURATION });
});

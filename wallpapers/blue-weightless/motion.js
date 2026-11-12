(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SwimMotion = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const TAU = Math.PI * 2, COUNT = 16, CELL_WIDTH = 384, CELL_HEIGHT = 256;
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const x = clamp(n); return x * x * (3 - 2 * x); };
  const wrap = n => ((n % 1) + 1) % 1;
  const pulse = (phase, center, width) => {
    const distance = Math.abs(wrap(phase - center + .5) - .5);
    return smooth(1 - distance / width);
  };
  const definitions = {
    freestyle: {
      start: 17, period: 1.6, scale: 1.25,
      anchors: [[185,155],[184,148],[187,149],[178,150],[174,154],[180,149],[183,149],[181,152],[180,152],[179,151],[181,152],[180,155],[180,153],[186,146],[185,146],[183,147]],
      entries: [{ phase: .02, x: 218, strength: .8 }, { phase: .52, x: 205, strength: .8 }],
      kicks: 6
    },
    breaststroke: {
      start: 35, period: 2.4, scale: 1.25,
      anchors: [[180,158],[178,157],[177,155],[175,149],[179,151],[179,150],[181,155],[184,155],[182,160],[175,143],[173,141],[169,139],[176,139],[178,140],[178,141],[179,141]],
      // Long first/last drawings leave room to glide; the pull and kick do not pause.
      holds: [2,2,2,1,1,1,1,1,1,1,1,1,1,2,2,3],
      entries: [{ phase: .50, x: 155, strength: .5 }, { phase: .64, x: -165, strength: .8 }],
      kicks: 1
    },
    backstroke: {
      start: 51, period: 1.8, scale: 1.25,
      anchors: [[189,151],[187,151],[187,151],[186,151],[186,151],[182,152],[182,151],[184,150],[183,147],[184,149],[185,153],[186,153],[185,153],[184,154],[188,151],[187,151]],
      entries: [{ phase: .04, x: 210, strength: .7 }, { phase: .54, x: 195, strength: .7 }],
      kicks: 6
    },
    butterfly: {
      start: 67, period: 1.7, scale: 1.25,
      anchors: [[184,174],[180,169],[171,165],[168,165],[169,143],[178,142],[180,146],[181,147],[181,141],[180,139],[180,141],[176,143],[178,145],[176,144],[175,140],[169,137]],
      // Begin and finish in extension, then place the overhead drawings in recovery.
      order: [3,4,5,6,7,8,9,10,11,12,13,14,0,1,2,15],
      entries: [{ phase: .02, x: 210, strength: 1.2 }, { phase: .02, x: -160, strength: .7 }, { phase: .31, x: -165, strength: 1.1 }],
      kicks: 2
    }
  };
  function atPhase(name, value) {
    const d = definitions[name];
    if (!d) return null;
    const phase = wrap(value), weights = d.holds || Array(COUNT).fill(1), total = weights.reduce((a, b) => a + b, 0);
    let cursor = phase * total, frame = 0;
    while (frame < COUNT - 1 && cursor >= weights[frame]) cursor -= weights[frame++];
    const source = d.order ? d.order[frame] : frame;
    return { phase, frame, source, within: cursor / weights[frame], anchor: d.anchors[source],
      rect: [source % 4 * CELL_WIDTH, Math.floor(source / 4) * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT] };
  }
  function sample(state) {
    const d = definitions[state.motion];
    if (!d) return null;
    const phase = wrap((state.t - d.start) / d.period), pose = atPhase(state.motion, phase);
    let breath = 0, force = 0, heave = 0, pitch = 0;
    if (state.motion === 'freestyle') {
      breath = pulse(phase, .735, .19);
      force = Math.max(pulse(phase, .25, .17), pulse(phase, .75, .17));
      heave = 10 - breath * 8 + Math.sin(phase * TAU * 3) * 1.5;
      pitch = Math.sin(phase * TAU * 2) * .009;
    } else if (state.motion === 'breaststroke') {
      breath = pulse(phase, .43, .2); force = pulse(phase, .64, .16);
      heave = 10 + breath * 18; pitch = -.015 * breath;
    } else if (state.motion === 'backstroke') {
      force = Math.max(pulse(phase, .28, .18), pulse(phase, .78, .18));
      heave = Math.sin(phase * TAU * 2) * 2; pitch = .008 * Math.sin(phase * TAU);
    } else {
      breath = pulse(phase, .29, .17); force = pulse(phase, .31, .16);
      heave = 5 + 6 * Math.cos(phase * TAU * 2) - breath * 4;
      pitch = .018 * Math.sin(phase * TAU);
    }
    const events = d.entries.map(event => ({ ...event, age: wrap(phase - event.phase) * d.period }))
      .filter(event => event.age < .58);
    return { ...pose, period: d.period, breath, force, heave, pitch, events,
      kick: Math.sin(phase * TAU * d.kicks), count: COUNT };
  }
  return { COUNT, CELL_WIDTH, CELL_HEIGHT, definitions, wrap, pulse, atPhase, sample };
});

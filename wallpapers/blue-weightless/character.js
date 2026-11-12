(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SwimCharacter = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const WIDTH = 768, HEIGHT = 640;
  const smooth = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
  const pin = (x, y) => ({ x, y, ax: 0, ay: 0, phase: 0, rate: 1 });
  const move = (x, y, ax, ay, phase = 0, rate = 1) => ({ x, y, ax, ay, phase, rate });
  // Each source is a complete, anatomically drawn person. Faces, fingers and
  // toes are rigid islands in one continuous mesh, never separately rotated.
  const definitions = {
    glide: {
      sheet: 'glide', rect: [0, 50, 2172, 600], anchor: [1160, 410], scale: .22, rate: 1.8,
      controls: [pin(1600, 240), pin(945, 425), pin(1160, 420), pin(1380, 345), pin(1510, 330), move(1760, 363, 4, 5), move(2070, 363, 6, 8), move(480, 390, 0, 14, Math.PI), move(85, 420, 0, 25, Math.PI), move(480, 520, 0, 14), move(85, 565, 0, 25)],
      locks: [{ rect: [1350, 70, 400, 270], control: 0 }, { rect: [1940, 310, 217, 100], control: 6 }, { rect: [24, 352, 215, 111], control: 8 }, { rect: [28, 517, 210, 92], control: 10 }]
    },
    freestyle: {
      sheet: 'strokes', rect: [0, 104, 825, 278], anchor: [420, 280], scale: .55, rate: 2.1,
      controls: [pin(580, 234), pin(345, 298), pin(413, 306), pin(475, 284), pin(494, 250), pin(535, 268), move(463, 151, -7, 11), move(599, 148, 17, 17), move(641, 294, 8, 7, Math.PI), move(790, 306, 17, 13, Math.PI), move(208, 329, 0, 12), move(45, 346, 0, 24), move(211, 279, 0, 12, Math.PI), move(42, 278, 0, 24, Math.PI)],
      locks: [{ rect: [501, 174, 130, 111], control: 0 }, { rect: [550, 125, 83, 42], control: 7 }, { rect: [758, 291, 59, 35], control: 9 }, { rect: [16, 321, 67, 45], control: 11 }, { rect: [16, 254, 66, 40], control: 13 }]
    },
    breaststroke: {
      sheet: 'strokes', rect: [832, 105, 704, 304], anchor: [1190, 285], scale: .5, rate: 1.75,
      controls: [pin(1305, 181), pin(1099, 294), pin(1175, 285), pin(1239, 275), pin(1271, 251), pin(1345, 250), move(1231, 282, 6, 8), move(1335, 317, 16, -15), move(1425, 253, 8, -9), move(1470, 299, 17, -16), move(984, 366, -8, 8), move(882, 247, -14, 17), move(867, 298, -14, -14), move(1013, 328, -7, -8)],
      locks: [{ rect: [1223, 121, 146, 139], control: 0 }, { rect: [1300, 297, 81, 43], control: 7 }, { rect: [1443, 264, 58, 66], control: 9 }, { rect: [846, 211, 106, 72], control: 11 }, { rect: [833, 274, 94, 61], control: 12 }]
    },
    backstroke: {
      sheet: 'strokes', rect: [0, 617, 780, 300], anchor: [460, 800], scale: .55, rate: 1.9,
      controls: [pin(562, 726), pin(375, 806), pin(442, 792), pin(506, 783), pin(556, 777), pin(535, 751), move(650, 704, 8, 11), move(742, 650, 12, 20), move(381, 845, 12, 8, Math.PI), move(290, 878, 20, 12, Math.PI), move(202, 858, 0, 10), move(43, 872, 0, 23), move(204, 788, 0, 10, Math.PI), move(40, 787, 0, 23, Math.PI)],
      locks: [{ rect: [508, 674, 121, 110], control: 0 }, { rect: [700, 627, 68, 43], control: 7 }, { rect: [254, 849, 72, 50], control: 9 }, { rect: [13, 846, 74, 45], control: 11 }, { rect: [9, 761, 72, 44], control: 13 }]
    },
    butterfly: {
      sheet: 'strokes', rect: [780, 625, 756, 282], anchor: [1175, 820], scale: .53, rate: 2.15,
      controls: [pin(1304, 752), pin(1079, 820), pin(1160, 826), pin(1224, 816), pin(1255, 788), pin(1350, 784), move(1112, 715, 4, 12), move(998, 684, 10, 24), move(1418, 700, 4, 12), move(1489, 675, 10, 24), move(974, 826, 0, 9, -.5), move(817, 820, 0, 21, -1), move(973, 793, 0, 9, -.5), move(815, 792, 0, 21, -1)],
      locks: [{ rect: [1210, 653, 154, 134], control: 0 }, { rect: [966, 662, 77, 43], control: 7 }, { rect: [1452, 646, 73, 48], control: 9 }, { rect: [783, 802, 76, 37], control: 11 }, { rect: [782, 770, 75, 40], control: 13 }]
    },
    stand: {
      sheet: 'poses', rect: [190, 380, 330, 865], anchor: [320, 660], scale: .435, rate: 1.2,
      controls: [pin(320, 475), pin(246, 1174), pin(440, 1175), pin(306, 805), move(316, 625, 1.8, 1), move(308, 557, 1.2, .5), move(391, 540, 1.5, 1), move(368, 439, 1, .7), move(229, 766, 1.8, 0), move(225, 840, 2, 1), pin(311, 991)],
      locks: [{ rect: [206, 389, 181, 158], control: 0 }, { rect: [344, 408, 58, 81], control: 7 }, { rect: [208, 813, 52, 75], control: 9 }, { rect: [210, 1151, 118, 78], control: 1 }, { rect: [384, 1156, 114, 78], control: 2 }]
    },
    climb: {
      sheet: 'poses', rect: [770, 380, 395, 865], anchor: [940, 660], scale: .435, rate: 1.7,
      controls: [pin(968, 480), pin(914, 785), pin(943, 564), pin(944, 624), pin(1028, 643), move(1132, 601, 1, 1), move(1134, 642, 1, 1), move(1038, 827, 4, 7), move(948, 1004, 5, 9), move(830, 1158, 2, 4), move(833, 1216, 2, 4)],
      locks: [{ rect: [850, 396, 168, 158], control: 0 }, { rect: [1090, 574, 64, 54], control: 5 }, { rect: [1098, 621, 57, 46], control: 6 }, { rect: [880, 975, 120, 67], control: 8 }, { rect: [784, 1170, 120, 66], control: 10 }]
    }
  };
  function poseFor(state) {
    if (state.motion === 'stand' || state.motion === 'climb' && state.t >= 95) return 'stand';
    if (state.motion === 'dive' || state.motion === 'glide') return 'glide';
    return state.motion;
  }
  function createMesh(definition) {
    const [x, y, w, h] = definition.rect, step = Math.max(14, 8 / definition.scale), cols = Math.ceil(w / step), rows = Math.ceil(h / step);
    const count = (cols + 1) * (rows + 1), controls = definition.controls, weights = new Float32Array(count * controls.length);
    const rest = new Float32Array(count * 2), positions = new Float32Array(count * 2), locks = new Int16Array(count); locks.fill(-1);
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
      const i = row * (cols + 1) + col, px = x + col / cols * w, py = y + row / rows * h;
      rest[i * 2] = px; rest[i * 2 + 1] = py;
      for (const lock of definition.locks) {
        const [lx, ly, lw, lh] = lock.rect;
        if (px >= lx && px <= lx + lw && py >= ly && py <= ly + lh) { locks[i] = lock.control; break; }
      }
      let total = 0;
      for (let c = 0; c < controls.length; c++) {
        const d = (px - controls[c].x) ** 2 + (py - controls[c].y) ** 2 + 900;
        const weight = 1 / (d * d); weights[i * controls.length + c] = weight; total += weight;
      }
      for (let c = 0; c < controls.length; c++) weights[i * controls.length + c] /= total;
    }
    const indices = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const a = row * (cols + 1) + col, b = a + 1, c = a + cols + 1, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
    return { definition, rest, positions, weights, locks, indices: new Uint16Array(indices), offsets: new Float32Array(count * 2), deltas: new Float32Array(controls.length * 2), restArea: w / cols * h / rows, minAreaRatio: 1, gain: 1 };
  }
  function deform(mesh, time) {
    const { definition: d, rest, offsets, weights, locks, positions, indices, deltas } = mesh, n = d.controls.length;
    for (let c = 0; c < n; c++) {
      const p = d.controls[c], phase = time * d.rate * p.rate + p.phase;
      deltas[c * 2] = p.ax * Math.sin(phase); deltas[c * 2 + 1] = p.ay * Math.sin(phase);
    }
    for (let i = 0; i < locks.length; i++) {
      let dx = 0, dy = 0;
      if (locks[i] >= 0) { dx = deltas[locks[i] * 2]; dy = deltas[locks[i] * 2 + 1]; }
      else for (let c = 0; c < n; c++) { const weight = weights[i * n + c]; dx += weight * deltas[c * 2]; dy += weight * deltas[c * 2 + 1]; }
      offsets[i * 2] = dx; offsets[i * 2 + 1] = dy;
    }
    let gain = 1, minimum = 1;
    for (let attempt = 0; attempt < 5; attempt++) {
      for (let i = 0; i < rest.length; i++) positions[i] = rest[i] + offsets[i] * gain;
      minimum = Infinity;
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 2, b = indices[i + 1] * 2, c = indices[i + 2] * 2;
        const area = (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1]) - (positions[b + 1] - positions[a + 1]) * (positions[c] - positions[a]);
        minimum = Math.min(minimum, area / mesh.restArea);
      }
      if (minimum >= .35) break;
      gain = attempt === 3 ? 0 : gain * .65;
    }
    mesh.gain = gain; mesh.minAreaRatio = minimum; return positions;
  }
  function cleanAlpha(image) {
    const surface = document.createElement('canvas'); surface.width = image.naturalWidth; surface.height = image.naturalHeight;
    const c = surface.getContext('2d'); c.drawImage(image, 0, 0);
    let pixels;
    try { pixels = c.getImageData(0, 0, surface.width, surface.height); }
    catch { return image; } // Some local-file WebViews permit drawing but restrict pixel reads.
    const data = pixels.data;
    const alpha = new Uint8Array(surface.width * surface.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    for (let i = 0; i < alpha.length; i++) {
      const k = i * 4, a = alpha[i];
      const fringe = data[k] > 205 && (data[k + 1] < 85 && data[k + 2] < 85 || data[k + 1] > 180 && data[k + 2] < 80);
      const edge = i < surface.width || i >= alpha.length - surface.width || Math.min(alpha[i - 1], alpha[i + 1], alpha[i - surface.width], alpha[i + surface.width]) < 170;
      data[k + 3] = fringe && edge ? 0 : Math.round(255 * smooth((a / 255 - .18) / .68));
    }
    c.putImageData(pixels, 0, 0); return surface;
  }
  const vertexShader = `attribute vec2 aPosition; attribute vec2 aUV; uniform vec2 uSize; varying vec2 vUV;
    void main(){gl_Position=vec4(aPosition.x/uSize.x*2.0-1.0,1.0-aPosition.y/uSize.y*2.0,0.0,1.0);vUV=aUV;}`;
  const fragmentShader = `precision mediump float; uniform sampler2D uImage; varying vec2 vUV;
    void main(){gl_FragColor=texture2D(uImage,vUV);}`;
  class Renderer {
    constructor(images) {
      this.canvas = document.createElement('canvas'); this.canvas.width = WIDTH; this.canvas.height = HEIGHT;
      this.images = Object.fromEntries(Object.entries(images).map(([key, image]) => [key, cleanAlpha(image)]));
      this.meshes = Object.fromEntries(Object.entries(definitions).map(([key, d]) => [key, createMesh(d)]));
      this.mode = 'artwork'; this.currentPose = 'stand'; this.lastError = null;
      this.cycles = {}; this.cycle = null; this.cycleWarning = null;
      try { this.initializeGL(); } catch (error) { this.lastError = error.message; this.gl = null; }
      this.fallback = document.createElement('canvas'); this.fallback.width = WIDTH; this.fallback.height = HEIGHT; this.fc = this.fallback.getContext('2d');
      this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.mode = 'artwork'; this.gl = null; });
      this.canvas.addEventListener('webglcontextrestored', () => { try { this.initializeGL(); } catch (error) { this.lastError = error.message; } });
    }
    setCycles(images, motion) {
      this.motion = motion;
      for (const [name, image] of Object.entries(images)) {
        if (!motion.definitions[name]) continue;
        if (image.naturalWidth !== 1536 || image.naturalHeight !== 1024) {
          this.cycleWarning = `Invalid motion atlas: ${name}`; continue;
        }
        const sheet = cleanAlpha(image), d = motion.definitions[name];
        this.cycles[name] = Array.from({ length: motion.COUNT }, (_, index) => {
          const frame = document.createElement('canvas'); frame.width = 576; frame.height = 384;
          const c = frame.getContext('2d'), [ax, ay] = d.anchors[index];
          c.drawImage(sheet, index % 4 * 384, Math.floor(index / 4) * 256, 384, 256,
            288 - ax * d.scale, 192 - ay * d.scale, 384 * d.scale, 256 * d.scale);
          return frame;
        });
      }
    }
    drawCycle(state) {
      const cycle = this.motion.sample(state), frames = this.cycles[state.motion];
      if (!cycle || !frames) return null;
      const c = this.fc; c.clearRect(0, 0, WIDTH, HEIGHT); c.save();
      c.translate(WIDTH / 2, HEIGHT / 2 + cycle.heave); c.rotate(state.angle + cycle.pitch);
      // Exactly one complete drawing. No double-body crossfade or articulated cutouts.
      c.drawImage(frames[cycle.source], -288, -192);
      c.restore(); this.cycle = cycle; return this.fallback;
    }
    initializeGL() {
      const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
      if (!gl) return;
      const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (Object.values(this.images).some(image => image.width > maximum || image.height > maximum)) return;
      this.gl = gl;
      const compile = (type, text) => { const shader = gl.createShader(type); gl.shaderSource(shader, text); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader; };
      const program = gl.createProgram(); gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader)); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program); this.program = program;
      this.position = gl.getAttribLocation(program, 'aPosition'); this.uv = gl.getAttribLocation(program, 'aUV'); this.size = gl.getUniformLocation(program, 'uSize');
      gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0); gl.uniform2f(this.size, WIDTH, HEIGHT);
      this.positionBuffer = gl.createBuffer(); this.uvBuffer = gl.createBuffer(); this.indexBuffer = gl.createBuffer();
      this.textures = {};
      for (const [key, image] of Object.entries(this.images)) {
        const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); this.textures[key] = texture;
      }
      for (const mesh of Object.values(this.meshes)) {
        const image = this.images[mesh.definition.sheet]; mesh.uvs = new Float32Array(mesh.rest.length); mesh.screen = new Float32Array(mesh.rest.length);
        for (let i = 0; i < mesh.rest.length; i += 2) { mesh.uvs[i] = mesh.rest[i] / image.width; mesh.uvs[i + 1] = mesh.rest[i + 1] / image.height; }
      }
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0); this.mode = 'continuous-mesh';
    }
    draw(state) {
      const key = poseFor(state), mesh = this.meshes[key] || this.meshes.glide, d = mesh.definition;
      this.currentPose = key;
      this.cycle = null;
      if (this.cycles[key]) return this.drawCycle(state);
      const angle = key === 'stand' || key === 'climb' ? 0 : state.angle;
      const ca = Math.cos(angle), sa = Math.sin(angle), positions = deform(mesh, state.t);
      if (!this.gl) {
        const c = this.fc; c.clearRect(0, 0, WIDTH, HEIGHT); c.save(); c.translate(WIDTH / 2, HEIGHT / 2); c.rotate(angle);
        const [x, y, w, h] = d.rect;
        c.drawImage(this.images[d.sheet], x, y, w, h, (x - d.anchor[0]) * d.scale, (y - d.anchor[1]) * d.scale, w * d.scale, h * d.scale);
        c.restore(); return this.fallback;
      }
      for (let i = 0; i < positions.length; i += 2) {
        const x = (positions[i] - d.anchor[0]) * d.scale, y = (positions[i + 1] - d.anchor[1]) * d.scale;
        mesh.screen[i] = WIDTH / 2 + x * ca - y * sa; mesh.screen[i + 1] = HEIGHT / 2 + x * sa + y * ca;
      }
      const gl = this.gl; gl.viewport(0, 0, WIDTH, HEIGHT); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures[d.sheet]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, mesh.screen, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(this.position); gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer); gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW); gl.enableVertexAttribArray(this.uv); gl.vertexAttribPointer(this.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW); gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      return this.canvas;
    }
    getState() { const mesh = this.meshes[this.currentPose]; return {
      mode: this.cycle ? 'pose-cycle' : this.mode, pose: this.currentPose,
      gain: this.cycle ? 1 : mesh?.gain, minAreaRatio: this.cycle ? 1 : mesh?.minAreaRatio, error: this.lastError,
      sequenceFrame: this.cycle?.frame ?? null, sequenceSource: this.cycle?.source ?? null,
      sequenceLength: this.cycle?.count ?? 0, phase: this.cycle?.phase ?? null, breath: this.cycle?.breath ?? 0,
      cycleWarning: this.cycleWarning, availableCycles: Object.keys(this.cycles)
    }; }
  }
  return { WIDTH, HEIGHT, definitions, createMesh, deform, poseFor, Renderer };
});

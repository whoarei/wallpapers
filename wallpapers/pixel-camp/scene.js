(() => {
  'use strict';
  const canvas = document.querySelector('#scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  let width = 640, height = 360, time = 0, phaseOffset = 0, paused = false;
  let last = 0, lastDraw = 0, frames = 0;
  let randomState = 38191;
  const random = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; };
  const stars = Array.from({ length: 110 }, () => ({ x: random(), y: random() * .58, size: random() > .9 ? 2 : 1, seed: random() * 9 }));
  const trees = Array.from({ length: 48 }, (_, i) => ({ x: i / 47, seed: random(), size: .65 + random() * .8 }));
  const fireflies = Array.from({ length: 24 }, () => ({ x: random(), y: random(), seed: random() * 10 }));
  const stones = Array.from({ length: 120 }, () => ({ x: random(), y: random(), r: random() * 3 + 1 }));
  const floorMarks = Array.from({ length: 300 }, () => ({ x: random(), y: random(), seed: random() }));
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * clamp(t)));
  const color = c => `rgb(${c.join(',')})`;
  const blend = (a, b, t) => color(mix(a, b, t));
  const box = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function polygon(points, fill) {
    ctx.fillStyle = fill; ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(Math.round(x), Math.round(y)) : ctx.moveTo(Math.round(x), Math.round(y)));
    ctx.closePath(); ctx.fill();
  }
  function pine(x, y, size, fill, detail = false) {
    const s = size;
    box(x - 2 * s, y - 28 * s, 4 * s, 31 * s, detail ? '#35433c' : fill);
    for (let n = 0; n < 4; n++) {
      const top = y - (72 - n * 15) * s, half = (10 + n * 5) * s;
      polygon([[x, top], [x + half, top + 29 * s], [x + half, top + 31 * s], [x - half, top + 31 * s]], fill);
      if (detail) polygon([[x, top + 6 * s], [x - half + 3 * s, top + 28 * s], [x - 2 * s, top + 27 * s]], '#344f43');
    }
  }
  function creekCenter(y) {
    const n = (y - height * .6) / (height * .4);
    return width * (.72 - .11 * Math.sin(n * 5) + n * .035);
  }
  function drawSky(day, dusk) {
    const top = mix([12, 22, 46], [80, 153, 171], day);
    const bottom = mix([59, 66, 91], [183, 203, 167], day);
    const warm = mix(bottom, [207, 127, 112], dusk * .65);
    for (let y = 0; y < height * .65; y += 4) box(0, y, width, 4, color(mix(top, warm, Math.pow(y / (height * .65), 1.8))));
    const night = 1 - day;
    stars.forEach(p => {
      const alpha = night * clamp((Math.sin(time * .45 + p.seed) + 2.5) / 3.5);
      ctx.globalAlpha = alpha; box(p.x * width, p.y * height, p.size, p.size, '#d6ded0');
      if (p.size === 2 && alpha > .7) { box(p.x * width - 1, p.y * height + .5, 4, 1, '#a8bdca'); }
    }); ctx.globalAlpha = 1;
    const orbX = width * .77, orbY = height * (.19 + day * .01), r = Math.max(11, width * .022);
    const glow = ctx.createRadialGradient(orbX, orbY, r, orbX, orbY, r * 5);
    glow.addColorStop(0, day > .5 ? '#f6df8e32' : '#c0d9c012'); glow.addColorStop(1, '#c0d9c000');
    ctx.fillStyle = glow; ctx.fillRect(orbX - r * 5, orbY - r * 5, r * 10, r * 10);
    for (let y = -r; y <= r; y++) {
      const half = Math.sqrt(r * r - y * y); box(orbX - half, orbY + y, half * 2, 1, day > .5 ? '#f4dda1' : '#d6dfbd');
    }
    if (day < .5) { box(orbX - 5, orbY + 1, 4, 2, '#b7c7ad'); box(orbX + 4, orbY - 7, 3, 3, '#c0cdb1'); }
    for (let i = 0; i < 7; i++) {
      const x = ((i * .19 * width + time * (i % 2 ? 1 : .5)) % (width + 160)) - 80;
      const y = height * (.18 + (i % 3) * .075);
      const fill = blend([76, 84, 105], [212, 222, 198], day);
      ctx.globalAlpha = .34; box(x, y, 65 + i * 3, 2, fill); box(x + 15, y - 3, 39, 4, fill); box(x + 7, y + 2, 82, 2, fill); ctx.globalAlpha = 1;
    }
  }
  function drawMountains(day) {
    const horizon = height * .6;
    for (let layer = 0; layer < 3; layer++) {
      const points = [[0, horizon + 20]];
      for (let x = -20; x <= width + 20; x += 4) {
        const y = height * (.43 + layer * .045) - Math.abs(Math.sin(x * .009 + layer * 1.7)) * height * (.15 - layer * .025) - Math.sin(x * .021 + layer) * 5;
        points.push([x, y]);
      }
      points.push([width + 20, horizon + 25]);
      polygon(points, [blend([40, 47, 71], [111, 155, 150], day), blend([34, 48, 64], [76, 127, 121], day), blend([24, 43, 54], [53, 104, 95], day)][layer]);
    }
    // A still, narrow strip of lake behind the woodland.
    box(0, height * .55, width, height * .09, blend([48, 71, 80], [126, 171, 158], day));
    for (let i = 0; i < 24; i++) {
      const x = (i * 39 + Math.sin(time * .18 + i) * 5) % width;
      box(x, height * (.56 + (i % 5) * .012), 10 + (i % 4) * 5, 1, blend([74, 95, 99], [173, 196, 172], day));
    }
    trees.forEach((p, i) => pine(p.x * width, height * (.64 + p.seed * .035), p.size * (width / 640) * .62, blend([18, 40, 45], [38, 79, 63], day)));
    box(0, height * .657, width, Math.max(8, height * .03), blend([27, 47, 43], [73, 100, 59], day));
  }
  function drawGround(day) {
    const top = height * .68;
    box(0, top, width, height, blend([27, 43, 37], [82, 110, 65], day));
    floorMarks.forEach(p => {
      const y = top + p.y * (height - top);
      box(p.x * width, y, p.seed > .75 ? 4 : 2, 1, p.seed > .5 ? blend([37, 56, 40], [104, 125, 68], day) : blend([19, 36, 33], [60, 91, 58], day));
    });
    // River is drawn by scanline so the banks retain the pixel-art contour.
    for (let y = height * .6; y < height; y++) {
      const depth = clamp((y - height * .6) / (height * .4));
      const half = 3 + Math.pow(depth, 1.55) * width * .085;
      const center = creekCenter(y);
      box(center - half - 3, y, half * 2 + 6, 1, blend([16, 34, 31], [49, 77, 53], day));
      box(center - half, y, half * 2, 1, blend([35, 64, 73], [75, 133, 135], day));
      if (y % 5 === 0) {
        const shift = Math.sin(y * .4 + time * .8) * half * .28;
        box(center - half * .35 + shift, y, half * .7, 1, blend([71, 100, 111], [144, 183, 165], day));
      }
    }
    stones.forEach(p => {
      const y = height * (.69 + p.y * .31), x = creekCenter(y) + (p.x < .5 ? -1 : 1) * (4 + Math.pow(p.y, 1.5) * width * .085 + p.r * 2);
      box(x, y, p.r * 2 + 1, p.r, p.x > .5 ? '#4b5d58' : '#60716a');
      box(x, y, p.r * 1.4, 1, '#829085');
    });
  }
  function tent(x, y, s) {
    const p = (arr, fill) => polygon(arr.map(([a,b]) => [x + a*s,y + b*s]),fill);
    box(x - 45*s, y - 2*s, 94*s, 5*s, '#111f23');
    p([[-45,0],[-14,-50],[20,-54],[53,0]], '#543e38');
    p([[-45,0],[-14,-50],[5,0]], '#b26c46');
    p([[-14,-50],[20,-54],[53,0],[5,0]], '#d89354');
    p([[-14,-50],[-8,-46],[5,0],[-36,0]], '#dca562');
    p([[-28,0],[-13,-37],[-2,0]], '#28302c');
    p([[-22,0],[-13,-27],[-7,0]], '#b37842');
    box(x - 19*s,y - 6*s,12*s,5*s,'#e3ab5b');
    p([[9,-2],[-9,-45],[-4,-42],[15,-2]], '#eabd75');
    p([[22,-49],[49,-3],[45,-3],[20,-45]], '#b5734a');
    box(x - 50*s,y,5*s,2*s,'#8f9b86');box(x+54*s,y,4*s,2*s,'#8f9b86');
    ctx.strokeStyle='#a7a48a';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x-15*s,y-49*s);ctx.lineTo(x-57*s,y+3*s);ctx.moveTo(x+21*s,y-51*s);ctx.lineTo(x+63*s,y+4*s);ctx.stroke();
    box(x-60*s,y+3*s,4*s,3*s,'#b29e79');box(x+62*s,y+3*s,4*s,3*s,'#b29e79');
  }
  function fire(x, y, s) {
    const glow=ctx.createRadialGradient(x,y-6*s,0,x,y-6*s,52*s);glow.addColorStop(0,'#ffb4563a');glow.addColorStop(.5,'#ff9f3e18');glow.addColorStop(1,'#ff9f3e00');ctx.fillStyle=glow;ctx.fillRect(x-52*s,y-58*s,104*s,104*s);
    for(let i=0;i<10;i++) { const a=i/10*Math.PI*2;box(x+Math.cos(a)*12*s-2*s,y+Math.sin(a)*4*s-1*s,5*s,3*s,i%2?'#78817a':'#555e56'); }
    polygon([[x-10*s,y-3*s],[x+9*s,y+2*s],[x+9*s,y+5*s],[x-10*s,y]],'#60422c');
    polygon([[x+8*s,y-4*s],[x-8*s,y+2*s],[x-8*s,y+5*s],[x+10*s,y]],'#9b6740');
    for(let i=0;i<5;i++) {
      const flicker=Math.floor(Math.sin(time*10+i*2.1)*2),fx=x+(i-2)*3*s;
      const fh=(8+Math.sin(time*8+i)*4+(i===2?8:0))*s;
      polygon([[fx-3*s,y-2*s],[fx-3*s,y-fh*.5],[fx-1*s,y-fh+flicker*s],[fx+1*s,y-fh*.75],[fx+3*s,y-3*s]],i%2?'#ffb54d':'#e6813e');
      box(fx-1*s,y-5*s,2*s,5*s,'#ffe3a0');
    }
    for(let i=0;i<7;i++) {const age=(time*.27+i/7)%1;box(x+Math.sin(age*9+i)*5*s,y-12*s-age*40*s,(1-age)*2*s+1,1,`rgba(255,188,98,${1-age})`);}
    for(let i=0;i<5;i++){const age=(time*.07+i/5)%1;ctx.globalAlpha=(1-age)*.14;box(x+Math.sin(age*9+i)*6*s-3*s,y-19*s-age*65*s,7*s+age*12*s,2*s+age*3*s,'#bdc6bb');}ctx.globalAlpha=1;
  }
  function drawCamp(day) {
    const s = width / 640, y = height * .78, x = width * .39;
    // Dark foreground oval and a worn ochre path make the campsite readable.
    polygon([[x-87*s,y+20*s],[x-65*s,y-8*s],[x+81*s,y-13*s],[x+128*s,y+25*s],[x+57*s,y+40*s],[x-37*s,y+42*s]],blend([43,49,35],[115,113,71],day));
    for(let i=0;i<34;i++)box(x-67*s+(i*31%177)*s,y+(i*13%41)*s,3*s,s,'#6a6c47');
    tent(x, y, s);
    fire(x+91*s,y+14*s,s);
    // Firewood pile, a blue camping chair, kettle, and a sleepy cat.
    box(x+44*s,y+11*s,19*s,5*s,'#694e37');box(x+49*s,y+7*s,17*s,5*s,'#99764c');box(x+46*s,y+12*s,3*s,3*s,'#b19362');
    polygon([[x+60*s,y+27*s],[x+63*s,y+8*s],[x+73*s,y+13*s],[x+70*s,y+29*s]],'#49696b');
    box(x+60*s,y+27*s,17*s,3*s,'#749494');box(x+63*s,y+30*s,2*s,9*s,'#a9a68b');box(x+75*s,y+29*s,2*s,10*s,'#a9a68b');
    box(x+88*s,y+16*s,9*s,5*s,'#333f3d');box(x+87*s,y+15*s,10*s,2*s,'#626d61');box(x+89*s,y+13*s,4*s,2*s,'#727b6b');
    box(x-43*s,y+14*s,20*s,8*s,'#ae8c5e');box(x-44*s,y+13*s,21*s,2*s,'#d0ac73');box(x-42*s,y+16*s,17*s,s,'#685c3e');
    box(x-38*s,y+9*s,5*s,5*s,'#c6c9ad');box(x-33*s,y+10*s,2*s,2*s,'#9fae9f');
    box(x-9*s,y+12*s,14*s,6*s,'#a59174');box(x-11*s,y+13*s,6*s,4*s,'#b6a07f');polygon([[x-11*s,y+13*s],[x-10*s,y+10*s],[x-8*s,y+13*s]],'#b6a07f');box(x-9*s,y+14*s,3*s,s,'#463e34');
    // Lantern on an old stump.
    const lx=x+137*s,ly=y-5*s;
    box(lx-4*s,ly+15*s,12*s,11*s,'#614c35');box(lx-5*s,ly+13*s,14*s,3*s,'#9b8052');
    const g=ctx.createRadialGradient(lx+2*s,ly+7*s,0,lx+2*s,ly+7*s,26*s);g.addColorStop(0,'#ffd67d29');g.addColorStop(1,'#ffd67d00');ctx.fillStyle=g;ctx.fillRect(lx-24*s,ly-19*s,52*s,52*s);
    box(lx,ly,5*s,3*s,'#b1b897');box(lx-s,ly+3*s,7*s,9*s,'#3a5047');box(lx+s,ly+4*s,3*s,7*s,'#f1d18b');box(lx-s,ly+12*s,7*s,2*s,'#9ca282');
    // String lights held between two pines.
    const left=width*.13,right=width*.69,top=height*.56;
    ctx.strokeStyle='#68715d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,top);
    for(let i=1;i<=30;i++){const n=i/30;ctx.lineTo(left+(right-left)*n,top+Math.sin(n*Math.PI)*15*s);}ctx.stroke();
    for(let i=1;i<11;i++){const n=i/11,bx=left+(right-left)*n,by=top+Math.sin(n*Math.PI)*15*s;box(bx,by,1*s,4*s,'#69715e');box(bx-s,by+4*s,3*s,3*s,'#f4d58b');ctx.globalAlpha=.14;box(bx-3*s,by+2*s,7*s,7*s,'#f4d58b');ctx.globalAlpha=1;}
  }
  function foreground(day) {
    const s=width/640;
    pine(width*.045,height*.87,s*1.9,blend([10,27,29],[25,57,39],day),true);
    pine(width*.13,height*.78,s*1.35,blend([15,34,33],[31,66,43],day),true);
    pine(width*.96,height*.91,s*2.3,blend([10,27,29],[25,57,39],day),true);
    pine(width*.89,height*.76,s*1.25,blend([15,34,33],[31,66,43],day),true);
    polygon([[0,height*.91],[width*.18,height*.97],[width*.3,height],[0,height]],'#142d2a');
    for(let i=0;i<32;i++){const x=(i*53)%width,y=height*(.88+(i%4)*.03);if(x>width*.61&&x<width*.86)continue;box(x,y,1,6,'#496346');box(x-2,y+2,5,1,'#496346');if(i%5===0){box(x-1,y-1,3,2,'#b8b484');}}
    fireflies.forEach(p=>{const alpha=clamp((1-day)*1.3)*clamp(Math.sin(time*.7+p.seed)*.7+.35);if(alpha<.03)return;const x=p.x*width+Math.sin(time*.13+p.seed)*12,y=height*(.58+p.y*.28)+Math.cos(time*.2+p.seed)*6;ctx.globalAlpha=alpha*.1;box(x-3,y-3,7,7,'#dce18b');ctx.globalAlpha=alpha;box(x,y,1,1,'#e3ec9f');});ctx.globalAlpha=1;
  }
  function draw() {
    const phase=(time/480+phaseOffset+.80)%1;
    const day=clamp((Math.cos((phase-.25)*Math.PI*2)+.18)/1.18);
    const dusk=Math.pow(1-Math.abs(day-.3),5)*(1-day);
    drawSky(day,dusk);drawMountains(day);drawGround(day);drawCamp(day);foreground(day);frames++;
  }
  function resize() {
    const scale=Math.max(2,Math.ceil(innerWidth/640));
    width=Math.max(280,Math.round(innerWidth/scale));height=Math.max(180,Math.round(innerHeight/scale));
    canvas.width=width;canvas.height=height;ctx.imageSmoothingEnabled=false;draw();
  }
  function setPaused(value){paused=Boolean(value);document.querySelector('#pause').textContent=paused?'继续':'暂停';last=0;}
  function shiftTime(){phaseOffset=(phaseOffset+.25)%1;draw();}
  document.querySelector('#pause').addEventListener('click',()=>setPaused(!paused));
  document.querySelector('#daylight').addEventListener('click',shiftTime);
  addEventListener('keydown',event=>{if(event.repeat)return;if(event.code==='Space'){event.preventDefault();setPaused(!paused);}if(event.code==='KeyD')shiftTime();if(event.code==='KeyF'){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen().catch(()=>{});}});
  addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=0;});
  const getState=()=>({id:'pixel-camp',time,phase:(time/480+phaseOffset+.80)%1,paused,frames,width,height,maxFps:30});
  window.pixelCamp=Object.freeze({getState,setPaused,shiftTime});window.getState=getState;
  function loop(stamp){requestAnimationFrame(loop);if(document.hidden||paused){last=0;return;}if(stamp-lastDraw<1000/30)return;const dt=last?Math.min(.05,(stamp-last)/1000):0;last=stamp;lastDraw=stamp;time+=dt;draw();}
  resize();requestAnimationFrame(loop);
})();

(() => {
  'use strict';
function startScene() {
const runtime = window.WallpaperRuntime;
runtime.refresh();
  const canvas = document.querySelector('#scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  let width = 1600, height = 900, viewWidth = 1600, time = 0, paused = false, golden = false;
  let last = 0, lastDraw = 0, frames = 0;
  let seed = 76215;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const cloudSeeds = Array.from({ length: 22 }, () => ({ x: random(), y: random(), size: .55 + random() * 1.2, speed: .3 + random() * .7 }));
  const leafSeeds = Array.from({ length: 30 }, () => ({ x: random(), y: random(), seed: random() * 10 }));
  const rockPoints = Array.from({ length: 36 }, () => random());
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function path(points, fill, stroke, lineWidth = 1) {
    ctx.beginPath(); points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
  }
  function ellipse(x,y,rx,ry,fill) {ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
  function line(points,stroke,lineWidth=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
  function cloud(x,y,s,alpha=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha=alpha;
    const g=ctx.createLinearGradient(0,-60,0,40);g.addColorStop(0,golden?'#fff0d9':'#fcfcf0');g.addColorStop(1,golden?'#ddcbd6':'#cce5e5');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-118,24);
    ctx.bezierCurveTo(-151,9,-140,-20,-101,-22);ctx.bezierCurveTo(-103,-52,-57,-64,-34,-33);ctx.bezierCurveTo(-20,-91,66,-85,78,-33);ctx.bezierCurveTo(114,-49,145,-17,132,6);ctx.bezierCurveTo(176,6,178,38,136,40);ctx.bezierCurveTo(53,55,-54,51,-118,24);ctx.fill();
    ctx.globalAlpha=alpha*.35;line([[-104,21],[-69,28],[-32,28]],'#ffffff',2);ctx.restore();
  }
  function sky() {
    const W=viewWidth;
    const g=ctx.createLinearGradient(0,0,0,900);
    g.addColorStop(0,golden?'#b8c5df':'#8dcbd8');g.addColorStop(.53,golden?'#f4d7bd':'#d2e9e6');g.addColorStop(1,golden?'#edd5cc':'#eaf0db');ctx.fillStyle=g;ctx.fillRect(0,0,W,900);
    const sunX=W*.23,sunY=190;
    const sun=ctx.createRadialGradient(sunX,sunY,10,sunX,sunY,270);sun.addColorStop(0,golden?'#fff1bd88':'#fff8d370');sun.addColorStop(.2,'#fff8de30');sun.addColorStop(1,'#fff8de00');ctx.fillStyle=sun;ctx.fillRect(sunX-270,sunY-270,540,540);
    ellipse(sunX,sunY,golden?49:38,golden?49:38,golden?'#fff0ca':'#fff9df');
    // Quiet broad rays, visible mainly in the open upper half of the sky.
    ctx.globalAlpha=.05;path([[sunX-30,190],[sunX+20,190],[W*.9,900],[W*.35,900]],'#fff9d9');path([[sunX+10,190],[sunX+30,180],[W*1.4,800],[W,900]],'#fff9d9');ctx.globalAlpha=1;
    cloudSeeds.slice(0,9).forEach((c,i)=>cloud(((c.x*W+time*2*c.speed)%(W+500))-250,120+c.y*370,c.size*.65,.22+i*.025));
    // Fine horizontal bands keep the cloud sea airy rather than a flat fill.
    for(let i=0;i<9;i++){ctx.globalAlpha=.045;ellipse(W*.5+Math.sin(time*.018+i)*W*.1,580+i*35,W*.8,20+i*4,'#ffffff');}ctx.globalAlpha=1;
  }
  function island(x,y,w,h,depth=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(w/600,w/600);
    const H=h/w*600;
    const rock=ctx.createLinearGradient(-180,0,190,H);rock.addColorStop(0,depth<1?'#a1b5b5':'#8b9691');rock.addColorStop(.5,depth<1?'#a8b7bc':'#8c8b91');rock.addColorStop(1,depth<1?'#b7c6ca':'#716d80');
    path([[-294,7],[-273,48],[-232,62],[-203,H*.55],[-145,H*.5],[-105,H*.82],[-55,H*.78],[8,H],[51,H*.86],[96,H*.91],[147,H*.58],[203,H*.6],[242,H*.26],[278,44],[298,10]],rock);
    path([[-275,31],[-205,44],[-145,H*.5],[-203,H*.55],[-232,62]],'#a2a89b');
    path([[-205,44],[-77,26],[-55,H*.78],[-105,H*.82],[-145,H*.5]],'#93968e');
    path([[-77,26],[25,27],[8,H],[-55,H*.78]],'#80828b');
    path([[25,27],[125,26],[96,H*.91],[51,H*.86],[8,H]],'#9c9597');
    path([[125,26],[231,26],[203,H*.6],[147,H*.58]],'#aaa59b');
    path([[231,26],[278,18],[242,H*.26],[203,H*.6]],'#85858b');
    ctx.globalAlpha=.35;
    for(let i=0;i<16;i++){const xx=-250+i*31;line([[xx,30+rockPoints[i]*20],[xx+10,H*(.3+rockPoints[i]*.3)]],'#d8c9af',1.4);}ctx.globalAlpha=1;
    const grass=ctx.createLinearGradient(0,-31,0,30);grass.addColorStop(0,depth<1?'#a0bda5':'#96b986');grass.addColorStop(1,depth<1?'#779d8f':'#4d886f');
    ellipse(0,1,300,43,grass);ellipse(-35,-8,240,26,depth<1?'#b8c7a8':'#bad0a0');
    path([[-291,7],[-271,20],[-246,12],[-222,31],[-195,16],[-165,31],[-136,22],[-101,31],[-62,26],[-18,34],[31,27],[64,35],[103,24],[145,29],[183,14],[227,22],[260,6],[290,0],[277,32],[242,41],[202,35],[168,45],[126,39],[89,47],[54,42],[9,48],[-37,44],[-88,43],[-136,39],[-179,35],[-224,29],[-260,25]],depth<1?'#85aa98':'#5d9776');
    // Trailing roots and greenery hang from the island's edge.
    for(let i=0;i<10;i++){
      const xx=-260+i*56,len=18+rockPoints[i]*60;
      ctx.strokeStyle=depth<1?'#8cad97':'#5b896f';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(xx,20);ctx.bezierCurveTo(xx-12,len*.4,xx+12,len*.8,xx-7,len);ctx.stroke();
      for(let n=0;n<3;n++)ellipse(xx+(n%2?4:-4),24+n*len*.22,5,2.5,depth<1?'#a7bca0':'#8db383');
    }
    for(let i=0;i<35;i++){const xx=-266+(i*103%532),yy=-9+(i*23%32);line([[xx,yy],[xx-2,yy-5]],depth<1?'#b6c9a7':'#d1dcae',1);}
    ctx.restore();
  }
  function tree(x,y,s,wind=0) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    const sway=Math.sin(time*.36+wind)*2;
    ctx.strokeStyle='#706f5c';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-4,-28,sway,-64);ctx.stroke();
    line([[-1,-29],[-16+sway,-48]],'#73745e',2);line([[0,-36],[18+sway,-55]],'#73745e',2);
    ellipse(-20+sway,-58,25,21,'#6a9e7b');ellipse(17+sway,-65,29,25,'#75aa83');ellipse(sway,-81,27,25,'#91b58a');ellipse(-13+sway,-77,17,17,'#a5c797');ellipse(25+sway,-72,14,14,'#8fbd8c');
    for(let i=0;i<5;i++)ellipse(-25+i*12+sway,-65-(i%3)*10,3,1.4,'#d3dfad');ctx.restore();
  }
  function windmill(x,y,s) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    path([[-20,0],[-14,-75],[13,-75],[22,0]],'#efe9cf','#a3aa98');path([[6,-75],[13,-75],[22,0],[10,0]],'#c8d0b8');
    path([[-22,-75],[0,-97],[23,-75]],'#638c88');
    ctx.fillStyle='#647d78';ctx.fillRect(-5,-25,10,25);ctx.fillStyle='#8aa9a0';ctx.fillRect(-4,-59,8,12);
    ctx.save();ctx.translate(0,-69);ctx.rotate(time*.13+.35);
    for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);path([[1,4],[3,-53],[10,-53],[14,-5]],'#f5edcf','#a4afa0',1);line([[5,-10],[7,-46]],'#c3cbb6',.8);for(let j=1;j<5;j++)line([[4,-j*10],[11,-j*10]],'#c1c9b3',.8);}
    ellipse(0,0,5,5,'#9b9b80');ctx.restore();ctx.restore();
  }
  function observatory(x,y,s) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ellipse(0,5,93,17,'#6d9d80');
    path([[-74,0],[-74,-20],[72,-20],[72,0]],'#c9d4ba');ellipse(0,-20,73,14,'#eff0d1');
    path([[-52,-20],[-52,-121],[45,-121],[45,-20]],'#f0e6c9');path([[23,-121],[45,-121],[45,-20],[23,-20]],'#cfd0b5');
    // A tall open arch looks straight through to the sky beyond.
    ctx.fillStyle='#9bb8af';ctx.beginPath();ctx.moveTo(-26,-20);ctx.lineTo(-26,-80);ctx.bezierCurveTo(-26,-118,22,-118,22,-80);ctx.lineTo(22,-20);ctx.closePath();ctx.fill();
    ctx.fillStyle=golden?'#e7d7bc':'#c9e5de';ctx.beginPath();ctx.moveTo(-18,-22);ctx.lineTo(-18,-80);ctx.bezierCurveTo(-18,-107,15,-107,15,-80);ctx.lineTo(15,-22);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f8edcf';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-30,-20);ctx.lineTo(-30,-82);ctx.bezierCurveTo(-30,-123,28,-123,28,-82);ctx.lineTo(28,-20);ctx.stroke();
    path([[-61,-124],[-59,-135],[52,-135],[55,-124]],'#90afa0');
    ctx.fillStyle='#e8dfc6';ctx.fillRect(-44,-146,82,11);path([[-48,-146],[-8,-186],[42,-146]],'#679b92');path([[-8,-186],[42,-146],[5,-146]],'#558c87');
    line([[-8,-187],[-8,-204]],'#6f887e',2);path([[-8,-204],[15,-197],[-8,-191]],'#d6a578');
    for(let i=0;i<3;i++){ctx.fillStyle='#a8b7a4';ctx.fillRect(-47+i*9,-119,4,88);}
    for(let i=0;i<3;i++){ctx.fillStyle='#87aa8c';ctx.fillRect(30,-57+i*12,13,3);}
    ctx.strokeStyle='#8cae87';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(38,-126);ctx.bezierCurveTo(58,-98,25,-81,40,-52);ctx.stroke();for(let i=0;i<7;i++)ellipse(40+Math.sin(i*1.6)*6,-119+i*10,5,2.5,'#87b18b');
    // Stone steps lead down to the turquoise stream.
    for(let i=0;i<4;i++)path([[-33-i*5,-18+i*7],[28+i*5,-18+i*7],[34+i*5,-12+i*7],[-38-i*5,-12+i*7]],i%2?'#d0d7bd':'#e5e4c8');
    ctx.restore();
  }
  function waterfall(x,y,s,alpha=1) {
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.scale(s,s);
    const h=235;
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#bce5db');g.addColorStop(.65,'#d0efdfbb');g.addColorStop(1,'#e2f2df00');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-20,-2);ctx.bezierCurveTo(-15,60,-26,140,-38,h);ctx.lineTo(43,h);ctx.bezierCurveTo(17,140,24,62,20,-2);ctx.closePath();ctx.fill();
    for(let i=0;i<14;i++){
      const a=(time*.27+i/14)%1,xx=Math.sin(i*4.2)*16+Math.sin(time*.45+i)*2;
      const length=20+(i%4)*12;
      line([[xx,a*h],[xx+Math.sin(a*6)*3,a*h+length]],`rgba(247,255,235,${(1-a)*.65})`,i%3===0?3:1.2);
    }
    for(let i=0;i<9;i++){const a=(time*.18+i/9)%1;ellipse(Math.sin(i*8+time*.2)*28,170+a*80,1+a*2,2+a*3,`rgba(255,255,239,${(1-a)*.32})`);}
    cloud(3,225,.5,.26);ctx.restore();
  }
  function dock(x,y,s) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    path([[-6,-7],[95,-3],[112,10],[0,7]],'#baa482');
    for(let i=0;i<9;i++)line([[i*12,-5+i*.05],[i*12+6,7]],'#8e8e74',1);
    for(let i=0;i<4;i++){line([[10+i*28,2],[10+i*28,-22]],'#7d8971',2);}
    line([[10,-19],[94,-16]],'#a5ab8b',2);line([[10,-14],[94,-11]],'#a5ab8b',1);
    path([[4,7],[39,40],[42,8]],'#8f8e73');path([[68,9],[42,39],[49,10]],'#b4a381');
    ctx.restore();
  }
  function airship(x,y,s) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.rotate(Math.sin(time*.11)*.018);
    // Rigging, cabin and rudder are behind the balloon.
    line([[-65,24],[-41,84],[37,84],[68,24]],'#89968c',1.4);line([[-22,39],[-12,84],[20,84],[28,35]],'#a2aa96',1);
    path([[-56,75],[55,75],[41,100],[-34,100]],'#a89271');path([[-56,75],[55,75],[52,83],[-50,83]],'#d5c7a1');
    ctx.fillStyle='#f1e7c6';ctx.fillRect(-25,65,48,11);ctx.fillStyle='#89b2ae';ctx.fillRect(-18,67,11,9);ctx.fillRect(-2,67,10,9);ctx.fillRect(12,67,8,9);
    line([[-48,89],[-72,89]],'#8d998c',2);ellipse(-75,89,2,12,'#cfceb0');
    path([[-106,3],[-140,-27],[-125,8],[-142,31],[-98,20]],'#88b4ad','#adc6b5');
    const balloon=ctx.createLinearGradient(0,-61,0,56);balloon.addColorStop(0,'#fff2d4');balloon.addColorStop(.6,'#efe3bf');balloon.addColorStop(1,'#bfc5ad');
    ellipse(0,0,121,53,balloon);
    ctx.save();ctx.beginPath();ctx.ellipse(0,0,121,53,0,0,Math.PI*2);ctx.clip();
    const stripe=ctx.createLinearGradient(0,-40,0,50);stripe.addColorStop(0,'#d9ad8e');stripe.addColorStop(1,'#aeae98');
    ctx.fillStyle=stripe;ctx.beginPath();ctx.moveTo(-45,-58);ctx.bezierCurveTo(-25,-27,-25,28,-44,57);ctx.lineTo(-21,58);ctx.bezierCurveTo(-5,25,-5,-26,-21,-58);ctx.fill();
    ctx.beginPath();ctx.moveTo(34,-58);ctx.bezierCurveTo(50,-27,50,28,34,57);ctx.lineTo(53,58);ctx.bezierCurveTo(71,25,71,-26,53,-58);ctx.fill();
    for(let i=0;i<6;i++){const yy=-40+i*16;ctx.strokeStyle='#b9bfa144';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,yy,128,20,0,0,Math.PI*2);ctx.stroke();}ctx.restore();
    ctx.strokeStyle='#a8b6a5';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,121,53,0,0,Math.PI*2);ctx.stroke();
    path([[76,9],[107,39],[63,26]],'#b4c9b4','#9db6a7');
    path([[112,-8],[128,-7],[129,-2],[115,0]],'#b5c6b1');ellipse(126,-4,2,4,'#e6e4c6');
    ctx.restore();
  }
  function scene() {
    const W=viewWidth,portrait=W<800;
    sky();
    // Small distant islands drift almost imperceptibly behind the cloud layer.
    ctx.globalAlpha=.36;island(W*.79,300+Math.sin(time*.07)*3,portrait?95:190,70,.5);tree(W*.79,288,.35);island(W*.43,245,portrait?60:110,45,.5);ctx.globalAlpha=1;
    cloudSeeds.slice(9,15).forEach((c,i)=>cloud(((c.x*W+time*3*c.speed)%(W+500))-250,440+c.y*150,c.size*.9,.4));
    const lx=W*(portrait?.00:.12),ly=440+Math.sin(time*.13+1)*5,lw=portrait?200:310;
    island(lx,ly,lw,lw*.34,.8);tree(lx-lw*.25,ly-6,lw/600*.8);windmill(lx+lw*.09,ly-15,lw/600*1.15);
    const rx=W*(portrait?1.08:.92),ry=541+Math.sin(time*.12+3)*6,rw=portrait?170:280;
    island(rx,ry,rw,rw*.36,.8);tree(rx-20,ry-9,rw/600*1.1,2);tree(rx+35,ry-4,rw/600*.7,4);
    // The main island moves as a single unit; buildings and falls share its origin.
    const mx=W*.53,my=560+Math.sin(time*.14)*5,mw=clamp(W*.43,320,660),ms=mw/600;
    const fallX=mx-45*ms,fallY=my+23*ms;
    island(mx,my,mw,mw*.34);
    waterfall(fallX,fallY,ms);
    ctx.save();ctx.translate(mx,my);ctx.scale(ms,ms);
    // Stream, pebbles, path and a little terrace above the falls.
    ctx.beginPath();ctx.moveTo(-91,-24);ctx.bezierCurveTo(-126,-1,-2,-3,-23,35);ctx.lineTo(-63,35);ctx.bezierCurveTo(-17,6,-160,3,-110,-24);ctx.fillStyle='#84c8bf';ctx.fill();
    ctx.strokeStyle='#cee3c8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-102,-19);ctx.bezierCurveTo(-138,0,-34,4,-40,28);ctx.stroke();
    for(let i=0;i<5;i++)ellipse(-57+i*12,9+Math.sin(i)*4,7,3,'#e0dcc0');
    path([[2,-16],[43,-17],[105,10],[82,20]],'#d2d5b2');
    for(let i=0;i<18;i++){const xx=-244+i*28,yy=9+Math.sin(i*6)*12;if(Math.abs(xx+45)<40)continue;ellipse(xx,yy,3.2,1.8,i%3?'#e5d7a6':'#e1ac9f');line([[xx,yy],[xx,yy+5]],'#7eaa76',.7);}
    ctx.restore();
    tree(mx-mw*.34,my-9*ms,ms*.95,1);tree(mx-mw*.24,my-18*ms,ms*1.3,4);
    observatory(mx+10*ms,my-9*ms,ms);
    tree(mx+mw*.28,my-5*ms,ms*.72,5);tree(mx+mw*.36,my-2*ms,ms*.9,2);dock(mx+mw*.38,my+6*ms,ms*.75);
    // Tiny detached stones give the island weight against the empty sky.
    path([[mx-mw*.26,my+mw*.31],[mx-mw*.22,my+mw*.32],[mx-mw*.24,my+mw*.38]],'#a5a5a0');
    path([[mx+mw*.29,my+mw*.25],[mx+mw*.33,my+mw*.27],[mx+mw*.30,my+mw*.31]],'#9f9b9e');
    const shipX=W*(portrait?.53:.68)+Math.sin(time*.025)*W*.17;
    airship(shipX,265+Math.sin(time*.16)*7,portrait?.63:.85);
    // Foreground wisps drift below the suspended garden, never obscuring it fully.
    cloudSeeds.slice(15).forEach((c,i)=>cloud(((c.x*W+time*(6+c.speed*2))%(W+650))-325,750+c.y*180,c.size*1.55,.34+(i%3)*.04));
    leafSeeds.forEach(p=>{const x=(p.x*W+time*(4+p.seed))%(W+30)-15,y=365+p.y*400+Math.sin(time*.2+p.seed)*14;ctx.save();ctx.translate(x,y);ctx.rotate(time*.1+p.seed);ellipse(0,0,2.8,1,golden?'#e9d2a8a0':'#ffffde99');ctx.restore();});
    // A soft vignette leaves the horizon open and keeps desktop icons legible.
    const vignette=ctx.createRadialGradient(W*.5,420,200,W*.5,420,Math.max(W,900)*.7);vignette.addColorStop(0,'#729b9b00');vignette.addColorStop(1,'#507f8b14');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,900);frames++;
  }
  function resize(){
    const ratio=Math.min(devicePixelRatio||1,1.5,1920/innerWidth);width=Math.max(1,Math.round(innerWidth*ratio));height=Math.max(1,Math.round(innerHeight*ratio));
    canvas.width=width;canvas.height=height;viewWidth=900*width/height;ctx.setTransform(height/900,0,0,height/900,0,0);scene();
  }
  function setPaused(value){paused=Boolean(value);runtime.setUserPaused(paused);document.querySelector('#pause').textContent=paused?'继续':'暂停';last=0;}
  function toggleLight(){golden=!golden;document.querySelector('#light').textContent=golden?'清晨光线':'日落光线';scene();}
  document.querySelector('#pause').addEventListener('click',()=>setPaused(!paused));document.querySelector('#light').addEventListener('click',toggleLight);
  addEventListener('keydown',event=>{if(event.repeat)return;if(event.code==='Space'){event.preventDefault();setPaused(!paused);}if(event.code==='KeyL')toggleLight();if(event.code==='KeyF'&&runtime.capabilities.fullscreen){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen().catch(()=>{});}});
  addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=0;});
  const getState=()=>({id:'sky-islands',time,paused,golden,frames,width,height,maxFps:30});
  window.skyIslands=Object.freeze({getState,setPaused,toggleLight});window.getState=getState;
  function loop(stamp){requestAnimationFrame(loop);if(runtime.paused){last=0;return;}if(stamp-lastDraw<1000/30)return;const dt=last?Math.min(.05,(stamp-last)/1000):0;last=stamp;lastDraw=stamp;time+=dt;scene();}
  runtime.onStateChange(()=>{last=lastDraw=0;});
  resize();requestAnimationFrame(loop);
}
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startScene, { once: true });
else startScene();
})();

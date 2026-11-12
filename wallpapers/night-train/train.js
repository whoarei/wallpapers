(() => {
'use strict';
function startScene() {
const runtime = window.WallpaperRuntime;
runtime.refresh();
const canvas=document.getElementById('train'),ctx=canvas.getContext('2d',{alpha:false});
let width=0,height=0,ratio=1,time=0,frames=0,last=0,lastPaint=0,paused=false,drops=[],layers=[];
function randomGenerator(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function round(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
function cityLayer(depth){
 const c=document.createElement('canvas');c.width=Math.max(1700,Math.ceil(width*1.5));c.height=Math.ceil(height);const p=c.getContext('2d'),random=randomGenerator(55122+depth*1701),base=height*.76;
 let x=0;while(x<c.width){const w=38+random()*90,h=height*(.1+random()*.28)*(depth===0?.83:1),y=base-h;
  p.fillStyle=depth===0?'#132637':'#14252d';p.fillRect(x,y,w,h);p.fillStyle=depth===0?'#284155':'#29434a';p.fillRect(x,y,w,2);
  if(random()>.5){p.strokeStyle='#314857';p.lineWidth=1;p.beginPath();p.moveTo(x+w*.5,y);p.lineTo(x+w*.5,y-12-random()*26);p.stroke();}
  for(let yy=y+12;yy<base-8;yy+=11)for(let xx=x+6;xx<x+w-6;xx+=9){if(random()>.34){p.fillStyle=random()>.2?`rgba(213,173,111,${.12+random()*.42})`:`rgba(121,181,196,${.15+random()*.4})`;p.fillRect(xx,yy,3,5);}}
  x+=w+5+random()*15;
 }
 return c;
}
function resize(){width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);layers=[cityLayer(0),cityLayer(1)];const random=randomGenerator(207710);drops=Array.from({length:Math.min(210,Math.round(width*height/6500)+70)},()=>({x:random(),y:random(),length:6+random()*27,speed:.008+random()*.026,phase:random()*6.28,size:.6+random()*1.6}));}
function repeated(layer,speed,y=0){const offset=(time*speed)%layer.width;ctx.drawImage(layer,-offset,y);ctx.drawImage(layer,layer.width-offset,y);}
function exterior(x,y,w,h){
 ctx.save();round(ctx,x,y,w,h,Math.min(w*.065,40));ctx.clip();
 const sky=ctx.createLinearGradient(0,y,0,y+h);sky.addColorStop(0,'#0a1524');sky.addColorStop(.42,'#1c3043');sky.addColorStop(.72,'#253c48');sky.addColorStop(1,'#0b1b27');ctx.fillStyle=sky;ctx.fillRect(x,y,w,h);
 glow(ctx,width*.7,height*.29,Math.max(w*.42,250),'#61718a20');
 repeated(layers[0],12,-height*.055);ctx.fillStyle='#182c354c';ctx.fillRect(x,height*.5,w,height*.22);repeated(layers[1],37);
 const road=height*.76;ctx.fillStyle='#101f29';ctx.fillRect(x,road,w,height*.1);ctx.strokeStyle='#75929c28';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,road+8);ctx.lineTo(x+w,road+8);ctx.stroke();
 for(let i=0;i<12;i++){const px=((i*193-time*82)%(width+220)+width+220)%(width+220)-110,py=road+18+(i%3)*6;glow(ctx,px,py,17,'#dfa56c16');ctx.strokeStyle=i%3?'#d7bd8a99':'#bd665977';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+14+(i%4)*9,py);ctx.stroke();}
 // Occasional platform canopy and columns pass in the near field.
 const phase=(time+19)%46;if(phase<10){const tx=width+180-phase*(width+500)/10;ctx.fillStyle='#182c34';ctx.fillRect(tx-460,height*.27,1000,12);ctx.fillStyle='#9e9c7644';ctx.fillRect(tx-460,height*.27+12,1000,2);for(let i=0;i<4;i++){const col=tx+i*220-420;ctx.fillStyle='#1b3039';ctx.fillRect(col,height*.28,12,height*.53);glow(ctx,col+70,height*.31,45,'#eed4a01a');ctx.fillStyle='#d5c49a99';ctx.fillRect(col+24,height*.295,94,2);}ctx.fillStyle='#394852';ctx.fillRect(tx-480,height*.79,1100,7);}
 // Glass reflections and rain are drawn after the moving city.
 const reflect=ctx.createLinearGradient(x,y,x+w,y+h);reflect.addColorStop(0,'#f5d6a006');reflect.addColorStop(.35,'#e7d7bd00');reflect.addColorStop(.7,'#e7d7bd05');reflect.addColorStop(1,'#111d2900');ctx.fillStyle=reflect;ctx.fillRect(x,y,w,h);
 for(const d of drops){const px=x+d.x*w+Math.sin(time*.6+d.phase)*1.4,py=y+((d.y+time*d.speed)%1)*h;ctx.strokeStyle=`rgba(172,204,213,${.13+d.size*.07})`;ctx.lineWidth=d.size*.55;ctx.beginPath();ctx.moveTo(px-1.2,py-d.length);ctx.quadraticCurveTo(px+2,py-d.length*.4,px,py);ctx.stroke();ctx.fillStyle='#c5d6d238';ctx.beginPath();ctx.ellipse(px,py,d.size*.7,d.size*1.5,-.12,0,Math.PI*2);ctx.fill();}
 for(let i=0;i<25;i++){const px=((i*83-time*9)%width+width)%width;ctx.strokeStyle='#9bb7bf0b';ctx.beginPath();ctx.moveTo(px,y);ctx.lineTo(px-26,y+h);ctx.stroke();}
 const shade=ctx.createLinearGradient(0,y,0,y+h);shade.addColorStop(0,'#06111b4d');shade.addColorStop(.5,'#06111b00');shade.addColorStop(1,'#09101b55');ctx.fillStyle=shade;ctx.fillRect(x,y,w,h);ctx.restore();
}
function draw(){
 const compact=width<650,x=width*(compact?.065:.075),y=height*.1,w=width-2*x,h=height*.69,r=Math.min(w*.065,40);
 const cabin=ctx.createLinearGradient(0,0,0,height);cabin.addColorStop(0,'#3e342c');cabin.addColorStop(.12,'#282a2b');cabin.addColorStop(.77,'#2c2b29');cabin.addColorStop(1,'#11191d');ctx.fillStyle=cabin;ctx.fillRect(0,0,width,height);
 // A warm ceiling strip casts a soft amber rim over the cool window.
 glow(ctx,width*.5,height*.015,width*.63,'#b7874833');ctx.strokeStyle='#dbbd8566';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(width*.12,height*.045);ctx.lineTo(width*.88,height*.045);ctx.stroke();
 ctx.save();ctx.shadowColor='#000000aa';ctx.shadowBlur=16;round(ctx,x-12,y-12,w+24,h+24,r+10);ctx.fillStyle='#141c23';ctx.fill();ctx.restore();
 round(ctx,x-5,y-5,w+10,h+10,r+5);ctx.strokeStyle='#9e92734d';ctx.lineWidth=2;ctx.stroke();exterior(x,y,w,h);
 round(ctx,x,y,w,h,r);ctx.strokeStyle='#c4a87c33';ctx.lineWidth=1.2;ctx.stroke();
 // Reflected cabin light near the glass edge.
 ctx.strokeStyle='#dfb98212';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(x+w*.14,y+9);ctx.lineTo(x+w*.85,y+9);ctx.stroke();
 const sill=y+h+11;const wood=ctx.createLinearGradient(0,sill-4,0,sill+height*.065);wood.addColorStop(0,'#a18a61');wood.addColorStop(.08,'#5d5442');wood.addColorStop(.65,'#39392f');wood.addColorStop(1,'#232b29');ctx.fillStyle=wood;round(ctx,x-20,sill-3,w+40,height*.057,6);ctx.fill();
 ctx.strokeStyle='#c8ac7133';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-13,sill+2);ctx.lineTo(x+w+13,sill+2);ctx.stroke();
 const seatY=height*.91;const seat=ctx.createLinearGradient(0,seatY,0,height);seat.addColorStop(0,'#2b4245');seat.addColorStop(.2,'#26383c');seat.addColorStop(1,'#132227');ctx.fillStyle=seat;round(ctx,-20,seatY,width+40,height*.22,24);ctx.fill();ctx.strokeStyle='#65747122';ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(0,seatY+14);ctx.lineTo(width,seatY+14);ctx.stroke();ctx.setLineDash([]);
 // A small cup and closed book anchor the quiet interior.
 const cupX=x+w*(compact?.76:.83),cupY=sill-5,unit=Math.min(width*.065,55);ctx.fillStyle='#c4bea6';ctx.beginPath();ctx.moveTo(cupX-unit*.4,cupY-unit*.57);ctx.lineTo(cupX+unit*.38,cupY-unit*.57);ctx.lineTo(cupX+unit*.3,cupY);ctx.quadraticCurveTo(cupX,cupY+4,cupX-unit*.31,cupY);ctx.closePath();ctx.fill();ctx.strokeStyle='#b0ad97';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(cupX+unit*.4,cupY-unit*.32,unit*.18,unit*.2,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#5a5141';ctx.beginPath();ctx.ellipse(cupX,cupY-unit*.57,unit*.38,unit*.07,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#dfdbca1c';ctx.lineWidth=1;for(let k=0;k<2;k++){ctx.beginPath();for(let i=0;i<15;i++){const py=cupY-unit*.65-i*3,px=cupX+k*7+Math.sin(i*.35-time*.8+k)*4;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
 if(!compact){ctx.fillStyle='#5b665c';round(ctx,x+40,sill-8,105,9,2);ctx.fill();ctx.fillStyle='#c3b797';ctx.fillRect(x+44,sill-5,97,2);ctx.fillStyle='#a6aa8d33';ctx.fillRect(x+54,sill-8,2,8);}
 ctx.font=`${compact?9:10}px Consolas,monospace`;ctx.textAlign='center';ctx.fillStyle='#afa38a55';ctx.fillText('NIGHT SERVICE  /  NEXT STOP: SOMEWHERE QUIET',width*.5,height*.879);
 frames++;
}
function tick(now){if(runtime.paused){last=lastPaint=0;requestAnimationFrame(tick);return;}if(!last)last=now;if(now-lastPaint>=1000/30-.3){const dt=Math.min((now-last)/1000,.1);last=now;lastPaint=now;if(!paused)time+=dt;draw();}requestAnimationFrame(tick);}
function toggle(){paused=!paused;runtime.setUserPaused(paused);const b=document.getElementById('pause');b.textContent=paused?'继续':'暂停';b.setAttribute('aria-pressed',String(paused));}
document.getElementById('pause').onclick=toggle;document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;if(event.code==='Space'){event.preventDefault();toggle();}if(event.key.toLowerCase()==='f'&&runtime.capabilities.fullscreen){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen().catch(()=>{});}});
runtime.onStateChange(()=>{last=lastPaint=0;});
addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=0;lastPaint=0;});resize();draw();requestAnimationFrame(tick);
window.nightTrain={getState:()=>({frames,time,paused,width,height,raindrops:drops.length,targetFps:30})};
}
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startScene, { once: true });
else startScene();
})();

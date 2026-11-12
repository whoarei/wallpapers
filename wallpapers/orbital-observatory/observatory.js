(() => {
'use strict';
function startScene() {
const runtime = window.WallpaperRuntime;
runtime.refresh();
const canvas=document.getElementById('observatory'),ctx=canvas.getContext('2d',{alpha:false});
const sky=document.createElement('canvas'),planet=document.createElement('canvas');
let width=0,height=0,ratio=1,time=0,last=0,lastPaint=0,frames=0,paused=false,clock='',clockSecond=-1;
let stars=[];
function randomGenerator(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function circle(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'#00000000');circle(c,x,y,r,g);}
function makePlanet(){
 planet.width=640;planet.height=640;const c=planet.getContext('2d'),r=268;
 const atmosphere=c.createRadialGradient(320,320,r*.93,320,320,r*1.12);atmosphere.addColorStop(0,'#7ac9dc77');atmosphere.addColorStop(.65,'#65b0c625');atmosphere.addColorStop(1,'#27477100');circle(c,320,320,r*1.12,atmosphere);
 c.save();c.beginPath();c.arc(320,320,r,0,Math.PI*2);c.clip();
 const base=c.createLinearGradient(150,70,460,590);base.addColorStop(0,'#7cb2b0');base.addColorStop(.28,'#4d8596');base.addColorStop(.56,'#2b536e');base.addColorStop(.8,'#1e334c');base.addColorStop(1,'#162135');c.fillStyle=base;c.fillRect(0,0,640,640);
 const random=randomGenerator(14431);
 for(let y=55;y<610;y+=7){c.beginPath();for(let x=20;x<650;x+=14){const yy=y+Math.sin(x*.013+y*.012)*12+Math.sin(x*.032+y*.023)*4;x===20?c.moveTo(x,yy):c.lineTo(x,yy);}c.strokeStyle=random()>.45?'#cbe0cb13':'#071b3924';c.lineWidth=3+random()*6;c.stroke();}
 const light=c.createRadialGradient(160,140,10,260,280,340);light.addColorStop(0,'#d4e3cb33');light.addColorStop(.6,'#274e6c00');light.addColorStop(1,'#030613ee');c.fillStyle=light;c.fillRect(0,0,640,640);
 c.restore();c.strokeStyle='#a0cad33d';c.lineWidth=1.2;c.beginPath();c.arc(320,320,r,3.65,5.85);c.stroke();
}
function resize(){
 width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
 sky.width=width;sky.height=height;const c=sky.getContext('2d');c.fillStyle='#040a14';c.fillRect(0,0,width,height);
 glow(c,width*.43,height*.26,Math.max(width,height)*.65,'#17344777');glow(c,width*.19,height*.69,Math.max(width,height)*.48,'#40264133');glow(c,width*.83,height*.62,width*.36,'#16474133');
 const random=randomGenerator(9102026);stars=Array.from({length:Math.min(650,Math.round(width*height/2100)+150)},()=>({x:random()*width,y:random()*height,r:.35+random()*.95,phase:random()*6.28,light:.25+random()*.65}));
 for(const s of stars){circle(c,s.x,s.y,s.r,`rgba(191,211,221,${s.light*.62})`);if(s.r>1.15)glow(c,s.x,s.y,5,'#93bdcc24');}
}
function orbit(cx,cy,rx,ry,rotation,color){ctx.save();ctx.translate(cx,cy);ctx.rotate(rotation);ctx.strokeStyle=color;ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
function draw(){
 ctx.drawImage(sky,0,0);const compact=width<700;
 for(let i=0;i<stars.length;i+=5){const s=stars[i];circle(ctx,s.x+Math.sin(time*.012)*2,s.y,s.r*.8,`rgba(199,221,230,${(.3+Math.sin(time*.55+s.phase)*.22)*s.light})`);}
 const radius=Math.min(width*(compact?.28:.185),height*.255),cx=width*(compact?.56:.64)+Math.sin(time*.012)*6,cy=height*.43;
 orbit(cx,cy,radius*1.84,radius*.66,-.31,'#5f9fa72d');orbit(cx,cy,radius*2.23,radius*.95,.14,'#70a1b519');
 ctx.drawImage(planet,cx-radius*1.2,cy-radius*1.2,radius*2.4,radius*2.4);
 // A small survey satellite completes its orbit without changing the planet texture.
 const angle=time*.027+.8,rx=radius*1.84,ry=radius*.66;
 const ox=Math.cos(angle)*rx,oy=Math.sin(angle)*ry,x=cx+ox*Math.cos(-.31)-oy*Math.sin(-.31),y=cy+ox*Math.sin(-.31)+oy*Math.cos(-.31);
 glow(ctx,x,y,10,'#a7e7d644');circle(ctx,x,y,1.8,'#d2ead7');ctx.strokeStyle='#90bfb377';ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);ctx.moveTo(x,y-4);ctx.lineTo(x,y+4);ctx.stroke();
 const phase=(time+8)%29;
 if(phase<2.8){const k=phase/2.8,sx=width*.21+k*width*.27,sy=height*.16+k*height*.2;const g=ctx.createLinearGradient(sx-65,sy-40,sx,sy);g.addColorStop(0,'#a8cbd000');g.addColorStop(1,`rgba(199,224,224,${Math.sin(k*Math.PI)*.65})`);ctx.strokeStyle=g;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(sx-65,sy-40);ctx.lineTo(sx,sy);ctx.stroke();}
 // Dark observatory structure frames the view; its lights stay unobtrusive.
 const bottom=height*.83;ctx.fillStyle='#060b12';ctx.beginPath();ctx.moveTo(0,height*.7);ctx.lineTo(width*.12,bottom);ctx.lineTo(width*.88,bottom);ctx.lineTo(width,height*.7);ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.fill();
 const console=ctx.createLinearGradient(0,bottom,0,height);console.addColorStop(0,'#17262e');console.addColorStop(.08,'#0b151f');console.addColorStop(1,'#050911');ctx.fillStyle=console;ctx.fillRect(width*.12,bottom,width*.76,height-bottom);
 ctx.strokeStyle='#7ba0ab33';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,height*.7);ctx.lineTo(width*.12,bottom);ctx.lineTo(width*.88,bottom);ctx.lineTo(width,height*.7);ctx.stroke();
 ctx.fillStyle='#0b141d';ctx.fillRect(0,0,width*.025,height);ctx.fillRect(width*.975,0,width*.025,height);ctx.strokeStyle='#52697844';ctx.beginPath();ctx.moveTo(width*.025,0);ctx.lineTo(width*.025,height*.73);ctx.moveTo(width*.975,0);ctx.lineTo(width*.975,height*.73);ctx.stroke();
 const second=Math.floor(Date.now()/1000);if(second!==clockSecond){clockSecond=second;clock=new Date().toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});}
 ctx.textAlign='center';ctx.font=`${compact?10:11}px "Segoe UI",sans-serif`;ctx.fillStyle='#6b8b98';ctx.fillText('OBSERVATION DECK  /  LOCAL TIME',width*.5,bottom+height*.054);
 ctx.font=`300 ${compact?22:30}px Consolas,monospace`;ctx.fillStyle='#a5c4c5';ctx.fillText(clock,width*.5,bottom+height*.105);
 ctx.fillStyle='#526d7c';ctx.font='9px Consolas,monospace';if(!compact){ctx.textAlign='left';ctx.fillText('SECTOR 07  /  QUIET ORBIT',width*.16,bottom+height*.09);ctx.textAlign='right';ctx.fillText('OPTICAL ARRAY  ·  NOMINAL',width*.84,bottom+height*.09);}
 const dotX=width*.5-36;for(let i=0;i<5;i++)circle(ctx,dotX+i*18,bottom+height*.14,1.4,i===Math.floor(time*.3)%5?'#9cc7ab':'#314b51');
 frames++;
}
function tick(now){if(runtime.paused){last=lastPaint=0;requestAnimationFrame(tick);return;}if(!last)last=now;if(now-lastPaint>=1000/30-.3){const dt=Math.min((now-last)/1000,.1);last=now;lastPaint=now;if(!paused)time+=dt;draw();}requestAnimationFrame(tick);}
function toggle(){paused=!paused;runtime.setUserPaused(paused);const button=document.getElementById('pause');button.textContent=paused?'继续':'暂停';button.setAttribute('aria-pressed',String(paused));}
document.getElementById('pause').onclick=toggle;
document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;if(event.code==='Space'){event.preventDefault();toggle();}if(event.key.toLowerCase()==='f'&&runtime.capabilities.fullscreen){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen().catch(()=>{});}});
runtime.onStateChange(()=>{last=lastPaint=0;});
addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=0;lastPaint=0;});
makePlanet();resize();draw();requestAnimationFrame(tick);
window.observatory={getState:()=>({frames,time,paused,width,height,stars:stars.length,targetFps:30,clock})};
}
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startScene, { once: true });
else startScene();
})();

(() => {
'use strict';
const canvas=document.getElementById('window'),ctx=canvas.getContext('2d',{alpha:false});
const room=document.createElement('canvas'),rc=room.getContext('2d');
const land=document.createElement('canvas'),lc=land.getContext('2d');
let W=1600,H=1000,win={},rain=false,paused=false,clock=0,last=0,drawAt=0;
const TAU=Math.PI*2;
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd=random(102619),clouds=Array.from({length:10},()=>({x:rnd(),y:.07+rnd()*.27,s:.05+rnd()*.085,v:.001+rnd()*.0014,a:.10+rnd()*.12}));
const drops=Array.from({length:70},()=>({x:rnd(),y:rnd(),v:.025+rnd()*.09,len:.009+rnd()*.022,o:.08+rnd()*.14}));
function path(g,points,fill){g.beginPath();g.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)g.lineTo(points[i][0],points[i][1]);g.closePath();g.fillStyle=fill;g.fill();}
function ellipse(g,x,y,rx,ry,fill){g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);g.fillStyle=fill;g.fill();}
function mountain(g,y,amplitude,color,seed){const r=random(seed),pts=[[0,H]];for(let x=-.05*W;x<=W*1.06;x+=W*.032){const shaped=Math.sin(x/W*7+seed)*.5+Math.cos(x/W*16+seed)*.23+(r()-.5)*.46;pts.push([x,y-shaped*amplitude]);}pts.push([W,H]);path(g,pts,color);}
function pine(g,x,y,height,color){g.fillStyle=color;g.fillRect(x-height*.017,y-height,height*.034,height);for(let j=0;j<4;j++){const top=y-height+j*height*.18;const half=height*(.13+j*.035);path(g,[[x,top],[x-half,top+height*.39],[x+half,top+height*.39]],color);}}
function landscape(){
  lc.clearRect(0,0,W,H);
  const horizon=win.y+win.h*.51;
  mountain(lc,win.y+win.h*.34,win.h*.17,rain?'#7d9394':'#93aaa2',11);
  mountain(lc,win.y+win.h*.44,win.h*.19,rain?'#667e7b':'#799a8c',30);
  mountain(lc,win.y+win.h*.53,win.h*.12,rain?'#526f67':'#668d75',56);
  const lake=lc.createLinearGradient(0,horizon,0,win.y+win.h);lake.addColorStop(0,rain?'#8ca09b':'#b4c3ae');lake.addColorStop(1,rain?'#638581':'#8eaf9a');
  lc.fillStyle=lake;lc.fillRect(0,horizon,W,H-horizon);
  path(lc,[[0,H],[0,horizon-win.h*.10],[W*.12,horizon-win.h*.07],[W*.25,horizon+win.h*.04],[W*.32,horizon+win.h*.11],[W*.37,horizon+win.h*.21],[W*.19,H]],rain?'#34584e':'#496e55');
  path(lc,[[W,H],[W,horizon-win.h*.12],[W*.88,horizon-win.h*.06],[W*.83,horizon+win.h*.03],[W*.80,horizon+win.h*.13],[W*.74,horizon+win.h*.20],[W*.84,H]],rain?'#3c5e50':'#54775a');
  const forest=random(8321);
  for(let i=0;i<75;i++){const x=W*.02+forest()*W*.27,y=horizon-win.h*.055+(x/W)*win.h*.58+(forest()-.5)*win.h*.055;pine(lc,x,y,win.h*(.065+forest()*.075),rain?'#2f5348':'#42684f');}
  for(let i=0;i<57;i++){const x=W*.79+forest()*W*.24,y=horizon-win.h*.03+(1-x/W)*win.h*.65+forest()*win.h*.04;pine(lc,x,y,win.h*(.05+forest()*.10),rain?'#34554b':'#4b7156');}
  const islandY=horizon+win.h*.045;
  ellipse(lc,W*.68,islandY,win.w*.06,win.h*.009,rain?'#4c6d5a':'#668467');
  for(let i=0;i<9;i++)pine(lc,W*.645+i*W*.007,islandY,win.h*(.035+Math.sin(i*1.7)*.013),rain?'#496b57':'#5a7b5e');
  lc.save();lc.globalAlpha=.06;lc.translate(0,horizon*2);lc.scale(1,-1);lc.drawImage(land,0,0);lc.restore();
}
function curtain(g,left){
  g.save();if(!left){g.translate(W,0);g.scale(-1,1);}
  const fabric=g.createLinearGradient(0,0,W*.15,0);fabric.addColorStop(0,'#b8b19e');fabric.addColorStop(.2,'#e0d9c5');fabric.addColorStop(.38,'#c2bca9');fabric.addColorStop(.6,'#e8dfca');fabric.addColorStop(.8,'#c9c3af');fabric.addColorStop(1,'#e4dbc3');
  g.beginPath();g.moveTo(-W*.02,0);g.lineTo(W*.15,0);g.bezierCurveTo(W*.14,H*.21,W*.093,H*.44,W*.079,H*.65);g.bezierCurveTo(W*.065,H*.77,W*.084,H*.9,W*.08,H);g.lineTo(-W*.02,H);g.closePath();g.fillStyle=fabric;g.fill();
  g.strokeStyle='#f6ecd22b';g.lineWidth=W*.002;for(let i=0;i<5;i++){g.beginPath();g.moveTo(W*(.018+i*.024),0);g.bezierCurveTo(W*(.022+i*.019),H*.35,W*(.007+i*.014),H*.63,W*(.01+i*.013),H);g.stroke();}
  g.restore();
}
function indoor(){
  rc.clearRect(0,0,W,H);const wall=rc.createLinearGradient(0,0,W,H);wall.addColorStop(0,rain?'#a6a292':'#c9c1ab');wall.addColorStop(.45,rain?'#c0bba8':'#e0d8c0');wall.addColorStop(1,rain?'#8d9489':'#b8b79f');rc.fillStyle=wall;rc.fillRect(0,0,W,H);
  const grain=random(731);for(let i=0;i<2000;i++){rc.fillStyle=i%2?'#fff8df07':'#302b2007';rc.fillRect(grain()*W,grain()*H,1+grain()*W*.001,1+grain()*H*.001);}
  rc.clearRect(win.x,win.y,win.w,win.h);
  const {x,y,w,h}=win,f=W*.018;
  rc.save();rc.shadowColor='#233b304f';rc.shadowBlur=W*.022;rc.shadowOffsetX=W*.007;rc.shadowOffsetY=H*.012;rc.fillStyle='#7f816d';rc.fillRect(x-f*1.45,y-f*1.45,w+f*2.9,h+f*2.9);rc.restore();rc.clearRect(x,y,w,h);
  const wood=rc.createLinearGradient(x-f,0,x+f,0);wood.addColorStop(0,'#79664d');wood.addColorStop(.3,'#b49b72');wood.addColorStop(.72,'#99825f');wood.addColorStop(1,'#635b45');
  rc.fillStyle=wood;rc.fillRect(x-f,y-f,w+2*f,f);rc.fillRect(x-f,y+h,w+2*f,f);rc.fillRect(x-f,y,f,h);rc.fillRect(x+w,y,f,h);
  rc.strokeStyle='#e5d0a480';rc.lineWidth=Math.max(1,W*.0013);rc.strokeRect(x-f*.72,y-f*.72,w+f*1.44,h+f*1.44);rc.strokeStyle='#3a4c3f99';rc.lineWidth=W*.004;rc.strokeRect(x,y,w,h);
  const center=x+w*.5,transom=y+h*.235;
  rc.fillStyle='#645e47';rc.fillRect(center-f*.37,y,f*.74,h);rc.fillRect(x,transom-f*.28,w,f*.56);
  const inner=rc.createLinearGradient(center-f*.3,0,center+f*.3,0);inner.addColorStop(0,'#ceb18a');inner.addColorStop(.4,'#a78c64');inner.addColorStop(1,'#75644b');rc.fillStyle=inner;rc.fillRect(center-f*.27,y,f*.54,h);rc.fillRect(x,transom-f*.15,w,f*.3);
  rc.strokeStyle='#f0dbb45c';rc.lineWidth=W*.001;rc.beginPath();rc.moveTo(center-f*.23,y);rc.lineTo(center-f*.23,y+h);rc.moveTo(x,transom-f*.12);rc.lineTo(x+w,transom-f*.12);rc.stroke();
  rc.fillStyle='#796b4c';rc.fillRect(center-f*.62,y+h*.61,f*.24,H*.037);rc.fillStyle='#b9a26b';rc.fillRect(center-f*.59,y+h*.615,f*.17,H*.024);rc.fillStyle='#72634a';rc.fillRect(center-f*.54,y+h*.615,W*.022,H*.009);ellipse(rc,center+W*.008,y+h*.619,W*.005,H*.006,'#bba675');
  const sillY=y+h+f*.7;rc.save();rc.shadowColor='#29362a50';rc.shadowOffsetY=H*.012;rc.shadowBlur=H*.018;path(rc,[[x-f*2,sillY],[x+w+f*2,sillY],[x+w+f*3,sillY+H*.036],[x-f*3,sillY+H*.036]],'#baa783');rc.restore();
  const sill=rc.createLinearGradient(0,sillY,0,sillY+H*.043);sill.addColorStop(0,'#d8c69d');sill.addColorStop(.25,'#cbbb91');sill.addColorStop(.8,'#ae9c77');sill.addColorStop(1,'#8e8465');rc.fillStyle=sill;rc.fillRect(x-f*3,sillY+H*.034,w+f*6,H*.019);
  rc.strokeStyle='#eee0b955';rc.lineWidth=H*.001;rc.beginPath();rc.moveTo(x-f*2,sillY+H*.006);rc.lineTo(x+w+f*2,sillY+H*.006);rc.stroke();
  // A small ceramic pot and stems, on the shaded side of the window.
  const px=x+w*.13,py=sillY+H*.012,ph=H*.073;
  path(rc,[[px-W*.022,py-ph],[px+W*.022,py-ph],[px+W*.017,py],[px-W*.016,py]],'#8b9479');ellipse(rc,px,py-ph,W*.022,H*.009,'#a9af8d');ellipse(rc,px,py-ph-H*.002,W*.018,H*.005,'#5a6750');
  const leaves=random(980);for(let i=0;i<12;i++){const endX=px+(leaves()-.5)*W*.10,endY=py-ph-H*(.018+leaves()*.095);rc.strokeStyle='#5b7153';rc.lineWidth=W*.0013;rc.beginPath();rc.moveTo(px,py-ph);rc.quadraticCurveTo(px+(endX-px)*.2,endY-H*.01,endX,endY);rc.stroke();rc.save();rc.translate(endX,endY);rc.rotate((leaves()-.5)*1.5);ellipse(rc,0,0,W*.009,H*.017,i%3?'#718a60':'#90a277');rc.restore();}
  // Warm porcelain cup with a softly lit rim.
  const cupX=x+w*.82,cupY=sillY+H*.009,cw=W*.048,ch=H*.036;
  ellipse(rc,cupX,cupY+H*.008,cw*.67,H*.009,'#766f5540');rc.strokeStyle='#d4d1b7';rc.lineWidth=W*.006;rc.beginPath();rc.ellipse(cupX+cw*.55,cupY-ch*.56,cw*.25,ch*.34,0,0,TAU);rc.stroke();
  const cup=rc.createLinearGradient(cupX-cw*.5,0,cupX+cw*.5,0);cup.addColorStop(0,'#adbaa7');cup.addColorStop(.4,'#e2e4c9');cup.addColorStop(1,'#b6c3aa');path(rc,[[cupX-cw*.5,cupY-ch],[cupX+cw*.5,cupY-ch],[cupX+cw*.36,cupY],[cupX-cw*.35,cupY]],cup);ellipse(rc,cupX,cupY-ch,cw*.5,H*.008,'#e2e6cb');ellipse(rc,cupX,cupY-ch,cw*.42,H*.0055,'#737b58');
  curtain(rc,true);curtain(rc,false);
}
function resize(){
  const scale=Math.min(devicePixelRatio||1,1.5,2560/innerWidth);W=Math.max(1,Math.round(innerWidth*scale));H=Math.max(1,Math.round(innerHeight*scale));
  for(const layer of [canvas,room,land]){layer.width=W;layer.height=H;}
  const margin=innerWidth/innerHeight<1.05?.15:.12;
  win={x:W*margin,y:H*.105,w:W*(1-margin*2),h:H*.755};landscape();indoor();render();
}
function render(){
  const {x,y,w,h}=win;if(!w)return;
  const sky=ctx.createLinearGradient(0,y,0,y+h*.63);sky.addColorStop(0,rain?'#758d91':'#b9c8bd');sky.addColorStop(1,rain?'#b5c0b2':'#e3dfbd');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  if(!rain){const sunX=x+w*.73,sunY=y+h*.19;const sun=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,h*.24);sun.addColorStop(0,'#f2e4b96b');sun.addColorStop(.3,'#efe4bd27');sun.addColorStop(1,'#efe4bd00');ctx.fillStyle=sun;ctx.fillRect(x,y,w,h*.55);ellipse(ctx,sunX,sunY,h*.038,h*.038,'#eaddae76');}
  for(const cloud of clouds){const cx=x+((cloud.x+clock*cloud.v)%1.5-.2)*w,cy=y+cloud.y*h;ctx.save();ctx.globalAlpha=cloud.a*(rain?.65:1);ctx.filter=`blur(${Math.max(1,W*.003)}px)`;for(let i=0;i<5;i++)ellipse(ctx,cx+(i-2)*w*cloud.s*.33,cy-Math.sin(i*.9)*h*cloud.s*.15,w*cloud.s*.53,h*cloud.s*.19,rain?'#d5dbd0':'#f4e9cb');ctx.restore();}
  ctx.drawImage(land,0,0);
  const waterY=y+h*.54;
  for(let i=0;i<22;i++){const yy=waterY+(h*.41)*(i/22)**1.3,center=x+w*(.35+.18*Math.sin(i*2.7+clock*.05)),width=w*(.025+i*.006);ctx.strokeStyle=rain?'#c8d0bd18':'#f3edd32c';ctx.lineWidth=Math.max(1,H*.001);ctx.beginPath();ctx.moveTo(center-width*.5+Math.sin(clock*.22+i)*w*.014,yy);ctx.quadraticCurveTo(center,yy+Math.sin(clock*.4+i)*H*.001,center+width*.5,yy);ctx.stroke();}
  // A distant sail slides slowly along the far shore.
  const boatX=x+w*(.32+(clock*.0008)% .38),boatY=y+h*.57;
  ctx.fillStyle=rain?'#718b7e':'#8b9f84';ctx.fillRect(boatX-w*.008,boatY,w*.019,h*.002);path(ctx,[[boatX,boatY-h*.025],[boatX,boatY-h*.003],[boatX+w*.012,boatY-h*.003]],rain?'#b9c6b0':'#e1dcc0');
  if(!rain){ctx.strokeStyle='#4d6f6163';ctx.lineWidth=Math.max(1,W*.0007);for(let i=0;i<3;i++){const bx=x+((clock*.008+i*.025+.12)%1.15)*w,by=y+h*(.24+.015*Math.sin(clock*.3+i));ctx.beginPath();ctx.moveTo(bx-w*.005,by+Math.sin(clock*2+i)*h*.002);ctx.quadraticCurveTo(bx-w*.002,by-h*.003,bx,by);ctx.quadraticCurveTo(bx+w*.002,by-h*.003,bx+w*.005,by+Math.sin(clock*2+i)*h*.002);ctx.stroke();}}
  // Slight glass reflections keep the window present without obscuring the view.
  const reflection=ctx.createLinearGradient(x,y,x+w*.7,y+h);reflection.addColorStop(0,'#f5eccc07');reflection.addColorStop(.45,'#ffffff00');reflection.addColorStop(.51,'#fbf6da0b');reflection.addColorStop(.62,'#ffffff00');ctx.fillStyle=reflection;ctx.fillRect(x,y,w,h);
  if(rain){ctx.fillStyle='#60777311';ctx.fillRect(x,y,w,h);for(const drop of drops){const dx=x+drop.x*w,dy=y+((drop.y+clock*drop.v)%1.15-.1)*h;ctx.strokeStyle=`rgba(219,230,216,${drop.o})`;ctx.lineWidth=Math.max(1,W*.00065);ctx.beginPath();ctx.moveTo(dx,dy);ctx.lineTo(dx-w*.002,dy+h*drop.len);ctx.stroke();ellipse(ctx,dx-w*.002,dy+h*drop.len,W*.0007,H*.0014,'#d4dfd03d');}}
  ctx.restore();ctx.drawImage(room,0,0);
  const steamX=x+w*.82,steamY=y+h+W*.018*.7+H*.009-H*.036;
  for(let i=0;i<3;i++){ctx.strokeStyle='#faf4d725';ctx.lineWidth=Math.max(1,W*.001);ctx.beginPath();const phase=clock*.6+i*2;ctx.moveTo(steamX+(i-1)*W*.008,steamY-H*.007);ctx.bezierCurveTo(steamX+Math.sin(phase)*W*.012,steamY-H*.027,steamX+Math.sin(phase+.9)*W*.014,steamY-H*.048,steamX+Math.sin(phase+1.7)*W*.009,steamY-H*.072);ctx.stroke();}
  // Soft falloff around the room.
  const shade=ctx.createRadialGradient(W*.5,H*.47,H*.2,W*.5,H*.47,Math.max(W,H)*.72);shade.addColorStop(0,'#14282000');shade.addColorStop(1,'#17271f40');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
}
function tick(now){requestAnimationFrame(tick);const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!paused)clock+=dt;if(now-drawAt<1000/30)return;drawAt=now;render();}
function toggleWeather(){rain=!rain;document.getElementById('weather').textContent=rain?'晴天':'雨天';landscape();indoor();render();}
function togglePause(){paused=!paused;document.getElementById('pause').textContent=paused?'继续':'暂停';}
document.getElementById('weather').addEventListener('click',toggleWeather);document.getElementById('pause').addEventListener('click',togglePause);
addEventListener('keydown',event=>{if(event.repeat)return;if(event.code==='KeyR')toggleWeather();if(event.code==='Space'){event.preventDefault();togglePause();}if(event.code==='KeyF'){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});}});
document.addEventListener('visibilitychange',()=>{last=0;});addEventListener('resize',resize);resize();requestAnimationFrame(tick);
})();

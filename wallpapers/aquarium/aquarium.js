(() => {
'use strict';
function startScene() {
const runtime = window.WallpaperRuntime;
runtime.refresh();
const canvas=document.getElementById('aquarium');
const ctx=canvas.getContext('2d',{alpha:false});
const W=1600,H=1000,TAU=Math.PI*2;
const layer=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c;};
const backdrop=layer(),ground=layer(),shelters=layer(),foreground=layer(),frame=layer(),beams=layer();
const bg=backdrop.getContext('2d'),gc=ground.getContext('2d'),sc=shelters.getContext('2d'),fg=foreground.getContext('2d'),fc=frame.getContext('2d');
let seed=8675309;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const rnd=(a,b)=>a+(b-a)*random();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,f)=>a+(b-a)*f;
const ellipse=(c,x,y,rx,ry,color,rotation=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,rotation,0,TAU);c.fill();};
const path=(c,points,color)=>{c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill();};
let t=0,last=0,paused=false,lighting=0,flow=0,lightValue=0,wakeAt=performance.now(),toastAt=0,hidden=false;
let eaten=0,totalFed=0,frames=0,tension=0;
const foods=[],ripples=[];
const currentStrength=()=>[.65,1.3,.22][flow]+tension*.45;
const plants=[];

// A damped pressure field carries a tail stroke across the tank instead of
// making every fish and plant react to a single global animation multiplier.
const WATER_STEP=20,WATER_COLS=81,WATER_ROWS=51,WATER_SIZE=WATER_COLS*WATER_ROWS;
const waterHeight=new Float32Array(WATER_SIZE),waterVelocity=new Float32Array(WATER_SIZE),waterDrag=new Float32Array(WATER_SIZE);
let waterActive=false,waterPeak=0,waterSpeedPeak=0;
for(let y=0;y<WATER_ROWS;y++)for(let x=0;x<WATER_COLS;x++)waterDrag[y*WATER_COLS+x]=Math.max(0,4-Math.min(x,y,WATER_COLS-1-x,WATER_ROWS-1-y))*4;
function disturbWater(x,y,power,radius=65){
 if(x<-radius||x>W+radius||y<-radius||y>H+radius)return;
 const minX=Math.max(1,Math.floor((x-radius*2)/WATER_STEP)),maxX=Math.min(WATER_COLS-2,Math.ceil((x+radius*2)/WATER_STEP));
 const minY=Math.max(1,Math.floor((y-radius*2)/WATER_STEP)),maxY=Math.min(WATER_ROWS-2,Math.ceil((y+radius*2)/WATER_STEP));
 for(let j=minY;j<=maxY;j++)for(let i=minX;i<=maxX;i++){
  const weight=Math.exp(-((i*WATER_STEP-x)**2+(j*WATER_STEP-y)**2)/(radius*radius*.7)),index=j*WATER_COLS+i;
  waterHeight[index]=clamp(waterHeight[index]+power*weight,-24,24);
 }
 waterActive=true;
}
function updateWater(dt){
 if(!waterActive)return;
 // Substeps keep propagation stable at both 30 FPS and the host's 75 ms cap.
 const steps=Math.ceil(dt/(1/90)),step=dt/steps,drag=Math.exp(-step*1.35),settle=Math.exp(-step*.22),waveSpeed=360**2/WATER_STEP**2;
 for(let n=0;n<steps;n++){
  for(let y=1;y<WATER_ROWS-1;y++)for(let x=1;x<WATER_COLS-1;x++){
   const i=y*WATER_COLS+x,laplace=waterHeight[i-1]+waterHeight[i+1]+waterHeight[i-WATER_COLS]+waterHeight[i+WATER_COLS]-waterHeight[i]*4;
   waterVelocity[i]=(waterVelocity[i]+laplace*waveSpeed*step)*drag/(1+waterDrag[i]*step);
  }
  waterPeak=0;waterSpeedPeak=0;
  for(let i=0;i<WATER_SIZE;i++){
   waterHeight[i]=clamp((waterHeight[i]+waterVelocity[i]*step)*settle,-24,24);
   waterPeak=Math.max(waterPeak,Math.abs(waterHeight[i]));waterSpeedPeak=Math.max(waterSpeedPeak,Math.abs(waterVelocity[i]));
  }
 }
 if(waterPeak<.002&&waterSpeedPeak<.02){waterHeight.fill(0);waterVelocity.fill(0);waterActive=false;waterPeak=waterSpeedPeak=0;}
}
function waterAt(x,y){
 if(!waterActive||x<0||x>W||y<0||y>H)return {x:0,y:0,height:0};
 const gx=clamp(x/WATER_STEP,1,WATER_COLS-2.001),gy=clamp(y/WATER_STEP,1,WATER_ROWS-2.001),ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
 const sample=(dx,dy)=>{const i=(iy+dy)*WATER_COLS+ix+dx;return lerp(lerp(waterHeight[i],waterHeight[i+1],fx),lerp(waterHeight[i+WATER_COLS],waterHeight[i+WATER_COLS+1],fx),fy);};
 return {x:clamp((sample(-1,0)-sample(1,0))*5,-90,90),y:clamp((sample(0,-1)-sample(0,1))*5,-90,90),height:sample(0,0)};
}
function updatePlantMotion(dt){
 for(const p of plants){
  const upper=waterAt(p.x,p.y-p.h*.72),lower=waterAt(p.x,p.y-p.h*.35);
  const force=Math.abs(upper.x)+Math.abs(upper.y)>Math.abs(lower.x)+Math.abs(lower.y)?upper:lower;
  const target=clamp(force.x*2.1+force.y*.4,-85,85);
  p.swayVelocity=((p.swayVelocity||0)+(target-(p.sway||0))*32*dt)*Math.exp(-dt*4.8);
  p.sway=clamp((p.sway||0)+p.swayVelocity*dt,-85,85);
 }
}

function ribbon(c,x,y,height,width,bend,phase,color,waterBend=0){
 const sway=Math.sin(t*.43+phase)*11*currentStrength()+waterBend;
 c.fillStyle=color;c.beginPath();c.moveTo(x-width*.12,y);
 c.bezierCurveTo(x-width*.6,y-height*.33,x+bend-width*.48+sway,y-height*.73,x+bend+sway,y-height);
 c.bezierCurveTo(x+bend+width*.68+sway,y-height*.78,x+width*.5,y-height*.28,x+width*.12,y);
 c.fill();
}
function frond(c,x,y,height,phase,color,time=0,waterBend=0){
 const bend=Math.sin(time*.37+phase)*12*currentStrength()+waterBend;
 c.strokeStyle=color;c.lineWidth=1.6;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-7+bend,y-height*.6,x+bend,y-height);c.stroke();
 for(let i=1;i<12;i++){
  const k=i/12,py=y-height*k,px=x+bend*k*k,wide=Math.sin(k*Math.PI)*height*.135;
  for(const side of [-1,1]){c.fillStyle=color;c.beginPath();c.moveTo(px,py+5);c.quadraticCurveTo(px+wide*side*.3,py-15,px+wide*side,py-height*.065);c.quadraticCurveTo(px+wide*side*.65,py+4,px,py+5);c.fill();}
 }
}
function rock(c,x,y,w,h,col){
 const grad=c.createLinearGradient(x-w/2,y-h,x+w/2,y);grad.addColorStop(0,col);grad.addColorStop(.45,'#3f5144');grad.addColorStop(1,'#263d36');
 path(c,[[x-w*.55,y],[x-w*.46,y-h*.44],[x-w*.24,y-h*.89],[x+w*.08,y-h],[x+w*.43,y-h*.66],[x+w*.54,y-h*.14],[x+w*.4,y+4]],grad);
 path(c,[[x-w*.46,y-h*.44],[x-w*.24,y-h*.89],[x+w*.08,y-h],[x-w*.06,y-h*.43]],'#a0ac7633');
 c.strokeStyle='#192f2d66';c.lineWidth=2;
 for(let i=0;i<5;i++){const xx=x+rnd(-w*.3,w*.3);c.beginPath();c.moveTo(xx,y-h*rnd(.4,.75));c.lineTo(xx+w*.08,y-h*.12);c.stroke();}
 for(let i=0;i<80;i++){const px=x+rnd(-w*.37,w*.35),py=y-h*rnd(.08,.55);ellipse(c,px,py,rnd(1,3),rnd(.6,1.2),'#8b9d632b');}
}
function branch(c,points,width,color){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(...points[0]);c.bezierCurveTo(...points[1],...points[2],...points[3]);c.stroke();}
function buildScene(){
 const water=bg.createLinearGradient(0,0,0,H);water.addColorStop(0,'#16474a');water.addColorStop(.35,'#155358');water.addColorStop(.75,'#124344');water.addColorStop(1,'#1e4035');bg.fillStyle=water;bg.fillRect(0,0,W,H);
 const glow=bg.createRadialGradient(640,65,20,640,65,950);glow.addColorStop(0,'#b5d0a037');glow.addColorStop(.55,'#6dba9b0b');glow.addColorStop(1,'#0b2d3700');bg.fillStyle=glow;bg.fillRect(0,0,W,H);
 // The far bank stays soft and still; nearer leaves move independently.
 bg.save();bg.filter='blur(5px)';
 for(let i=0;i<110;i++){const x=rnd(-70,1680),y=950+rnd(-30,40),h=rnd(180,600)*(x>430&&x<1100?.55:1);frond(bg,x,y,h,rnd(0,TAU),['#1d5950','#246353','#24614b','#26594a'][i%4]);}
 bg.restore();
 const mist=bg.createLinearGradient(0,150,0,900);mist.addColorStop(0,'#2d77762b');mist.addColorStop(.65,'#23676310');mist.addColorStop(1,'#153f3a00');bg.fillStyle=mist;bg.fillRect(0,150,W,800);
 // A sand path curves between the two planted islands.
 const sand=gc.createLinearGradient(0,800,0,H);sand.addColorStop(0,'#797c56');sand.addColorStop(.55,'#a1986d');sand.addColorStop(1,'#645f43');
 gc.fillStyle=sand;gc.beginPath();gc.moveTo(0,854);gc.bezierCurveTo(350,866,438,922,750,904);gc.bezierCurveTo(1170,876,1250,850,1600,856);gc.lineTo(1600,1000);gc.lineTo(0,1000);gc.fill();
 for(let i=0;i<10500;i++){const x=rnd(0,W),y=rnd(873,H),r=rnd(.45,1.8);ellipse(gc,x,y,r,r*.5,['#c3bc8f44','#283d2940','#b1aa794b','#393e2940'][i%4]);}
 rock(sc,380,895,230,137,'#768665');rock(sc,498,912,161,86,'#7d8968');rock(sc,296,891,113,80,'#65775a');
 rock(sc,1125,908,252,142,'#758163');rock(sc,1268,914,173,85,'#7a8163');rock(sc,1015,920,111,62,'#83856a');
 // Smooth, branching driftwood and a thin highlight along the grain.
 branch(sc,[[820,911],[858,855],[1022,784],[1124,641]],65,'#354236');
 branch(sc,[[830,901],[904,846],[1012,776],[1124,641]],40,'#655e3e');
 branch(sc,[[858,893],[915,825],[1044,760],[1124,641]],17,'#8b7950');
 branch(sc,[[995,803],[954,720],[893,700],[887,639]],20,'#57553b');
 branch(sc,[[1044,750],[1104,730],[1158,726],[1197,676]],15,'#626041');
 branch(sc,[[1090,692],[1047,650],[1050,595],[1024,565]],11,'#5b5a3e');
 branch(sc,[[861,880],[773,883],[742,824],[692,816]],27,'#52553a');
 for(let i=0;i<16;i++)branch(sc,[[837+i*1.8,907],[900+i*1.3,844],[1032+i*.5,758],[1115+i*.2,656]],.8,'#b2a06b22');
 for(let i=0;i<320;i++){const q=random(),x=lerp(850,1125,q)+rnd(-20,12),y=lerp(895,650,q)+Math.sin(q*5)*17+rnd(-8,8);ellipse(sc,x,y,rnd(2,6),rnd(1,3),['#5e7947','#7a8b4d','#416b47','#91a05d66'][i%4],rnd(-1,1));}
 // Broad anubias leaves clustered around the base of the stones.
 for(const [x,y] of [[300,891],[452,908],[1100,907],[1250,916]])for(let i=0;i<25;i++){
  const a=rnd(-2.9,-.3),len=rnd(25,85),ex=x+Math.cos(a)*len,ey=y+Math.sin(a)*len;
  sc.strokeStyle='#537747';sc.lineWidth=2;sc.beginPath();sc.moveTo(x,y);sc.lineTo(ex,ey);sc.stroke();
  const gr=sc.createLinearGradient(ex-18,ey-10,ex+18,ey+10);gr.addColorStop(0,'#729351');gr.addColorStop(.48,'#517e45');gr.addColorStop(1,'#234d37');ellipse(sc,ex,ey,rnd(16,27),rnd(8,13),gr,a);
  sc.strokeStyle='#a4ba662e';sc.lineWidth=.8;sc.beginPath();sc.moveTo(ex-Math.cos(a)*19,ey-Math.sin(a)*19);sc.lineTo(ex+Math.cos(a)*19,ey+Math.sin(a)*19);sc.stroke();
 }
 // Fine foreground carpet, pebbles and two small snails.
 for(let i=0;i<500;i++){const x=rnd(-30,1630),y=rnd(935,1015);if(x>500&&x<1040&&random()<.94)continue;fg.strokeStyle=['#527746','#63834d','#355d3a','#819355'][i%4];fg.lineWidth=rnd(1,2);fg.beginPath();fg.moveTo(x,y);fg.quadraticCurveTo(x+rnd(-7,7),y-12,x+rnd(-10,10),y-rnd(10,27));fg.stroke();}
 for(let i=0;i<85;i++){const x=rnd(0,W),y=rnd(918,1000);ellipse(fg,x,y,rnd(2,6),rnd(1,2.5),['#b1ab87','#7d8061','#4f634d'][i%3]);}
 for(const [x,y] of [[595,941],[1325,947]]){ellipse(fg,x,y+4,11,3,'#56654d');ellipse(fg,x-2,y-2,8,7,'#978361');fg.strokeStyle='#5c634d';fg.lineWidth=1;fg.beginPath();fg.arc(x-2,y-2,5,0,TAU*1.5);fg.stroke();}
 // Small air stone tucked into the right-hand planting.
 ellipse(fg,1385,906,27,9,'#536956');ellipse(fg,1385,902,24,6,'#71856a');
 // Glass edge shading is cached, leaving the water itself transparent.
 const vignette=fc.createRadialGradient(800,440,300,800,440,1020);vignette.addColorStop(0,'#021d2300');vignette.addColorStop(.7,'#051f2920');vignette.addColorStop(1,'#031a2799');fc.fillStyle=vignette;fc.fillRect(0,0,W,H);
 const top=fc.createLinearGradient(0,0,0,150);top.addColorStop(0,'#0a2c3444');top.addColorStop(1,'#0a2c3400');fc.fillStyle=top;fc.fillRect(0,0,W,150);
 for(let i=0;i<37;i++)plants.push({type:'ribbon',x:rnd(-40,290),y:rnd(940,1010),h:rnd(270,690),w:rnd(8,24),bend:rnd(-60,100),phase:rnd(0,TAU),color:['#527e45','#3b6e43','#659451','#2f603d','#7c9d5b'][i%5]});
 for(let i=0;i<24;i++)plants.push({type:'frond',x:rnd(1270,1650),y:rnd(930,1015),h:rnd(230,560),phase:rnd(0,TAU),color:['#426f43','#547d44','#6a8e4f','#315c3d'][i%4]});
 for(let i=0;i<14;i++)plants.push({type:'ribbon',x:rnd(55,390),y:rnd(978,1040),h:rnd(70,180),w:rnd(5,10),bend:rnd(-20,30),phase:rnd(0,TAU),color:['#89a85a','#709749','#537e42'][i%3]});
}
buildScene();
const fish=[];
function addFish(type,count){for(let i=0;i<count;i++){
 const size=type==='angel'?rnd(61,86):type==='amber'?rnd(27,38):rnd(23,33),vx=(random()>.5?1:-1)*rnd(14,25);
 fish.push({type,size,x:rnd(240,1370),y:type==='angel'?rnd(300,675):type==='amber'?rnd(400,725):rnd(230,640),vx,vy:rnd(-3,3),phase:rnd(0,TAU),turn:vx<0?-1:1,depth:rnd(.7,1),alarm:0,recovery:0,entering:false,driftX:0,driftY:0,waterRoll:0});
}}
addFish('neon',18);addFish('amber',8);addFish('angel',4);
const motes=Array.from({length:75},()=>({x:rnd(0,W),y:rnd(80,930),r:rnd(.4,1.5),a:rnd(.08,.32),p:rnd(0,TAU),driftX:0,driftY:0}));
const bubbles=Array.from({length:24},()=>({p:rnd(0,1),r:rnd(1.4,4.8),off:rnd(-19,19),speed:rnd(14,26)}));
const rays=Array.from({length:7},(_,i)=>({x:175+i*150,w:rnd(18,45),angle:rnd(.08,.35),p:rnd(0,TAU)}));
const rayGradient=ctx.createLinearGradient(0,40,0,890);rayGradient.addColorStop(0,'#c4e4bb20');rayGradient.addColorStop(.32,'#c4e4bb0c');rayGradient.addColorStop(1,'#c4e4bb00');
const beamContext=beams.getContext('2d');
beamContext.filter='blur(17px)';beamContext.fillStyle=rayGradient;
for(const ray of rays){beamContext.beginPath();beamContext.moveTo(ray.x,-20);beamContext.lineTo(ray.x+ray.w,-20);beamContext.lineTo(ray.x+ray.w+250,930);beamContext.lineTo(ray.x+145,930);beamContext.closePath();beamContext.fill();}

// Each crab has a small patch of sand and a nearby stone to shelter behind.
// Their timers use simulation time, so local and host pauses also stop them.
const crabs=[
 {homeX:632,homeY:936,hideX:553,hideY:916,size:1.03,shell:'#c76c59',rim:'#f0ae79',leg:'#955444',claw:'#e3a16c'},
 {homeX:914,homeY:941,hideX:975,hideY:922,size:.91,shell:'#54999e',rim:'#a9d2ba',leg:'#397779',claw:'#cea56e'},
 {homeX:1180,homeY:942,hideX:1204,hideY:918,size:.98,shell:'#8a70a7',rim:'#c7abc3',leg:'#65517f',claw:'#dba079'}
].map((c,i)=>({...c,x:c.homeX,y:c.homeY,targetX:c.homeX,targetY:c.homeY,activity:'rest',timer:3+i*3.7,speed:9+i*1.3,direction:i%2?-1:1,gait:i*2,gesture:0}));

function restCrab(c){c.activity='rest';c.timer=rnd(5,13);}
function updateCrabs(dt){
 for(const c of crabs){
  const moving=['walk','retreat','emerge'].includes(c.activity);
  if(moving){
   const dx=c.targetX-c.x,dy=c.targetY-c.y,d=Math.hypot(dx,dy),step=Math.min(d,c.speed*dt);
   if(d>0){c.x+=dx/d*step;c.y+=dy/d*step;c.gait+=step*.24;if(Math.abs(dx)>.1)c.direction=Math.sign(dx);}
   if(d<=step){
    if(c.activity==='retreat'){c.activity='sheltered';c.timer=rnd(6,12);}
    else restCrab(c);
   }
  }else{
   c.timer-=dt;
   if(c.timer<=0){
    if(c.activity==='sheltered'){c.activity='emerge';c.targetX=c.homeX;c.targetY=c.homeY;}
    else if(c.activity==='wave')restCrab(c);
    else{
     const choice=random();
     if(choice<.36){c.activity='walk';c.targetX=c.homeX+rnd(-26,28);c.targetY=c.homeY+rnd(-3,5);}
     else if(choice<.63){c.activity='wave';c.timer=rnd(2.5,4.5);}
     else{c.activity='retreat';c.targetX=c.hideX;c.targetY=c.hideY;}
    }
   }
  }
  // A sheltered crab occasionally flexes the exposed claw as it peeks out.
  c.gesture=c.activity==='wave'?.5+Math.sin(t*3+c.homeX)*.5:c.activity==='sheltered'?Math.max(0,Math.sin(t*1.6+c.homeX))*.28:0;
 }
}

function crabBody(c){
 const moving=['walk','retreat','emerge'].includes(c.activity),stride=moving?1:0;
 ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.size*c.direction,c.size);
 ellipse(ctx,0,6,34,6,'#203e3450');
 ctx.lineCap='round';ctx.lineJoin='round';
 for(const side of [-1,1]){
  for(let i=0;i<4;i++){
   const phase=c.gait+i*Math.PI*.78+(side<0?Math.PI:0),swing=Math.sin(phase)*stride;
   const jointX=side*(23+i*1.4+swing*2.5),jointY=-6+i*4;
   const tipX=side*(32+i*1.8+swing*4),tipY=3+i*3-Math.max(0,Math.cos(phase))*stride*4;
   ctx.strokeStyle='#29483f';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(side*12,-9+i*3);ctx.lineTo(jointX,jointY);ctx.lineTo(tipX,tipY);ctx.stroke();
   ctx.strokeStyle=c.leg;ctx.lineWidth=2.5;ctx.stroke();
   ellipse(ctx,jointX,jointY,1.6,1.4,c.rim);
  }
  const wave=side>0?c.gesture:0,cx=side*(28+wave*3),cy=-23-wave*13;
  ctx.strokeStyle=c.leg;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(side*12,-13);ctx.lineTo(side*23,-10-wave*7);ctx.lineTo(cx,cy+4);ctx.stroke();
  ellipse(ctx,cx,cy,6.5,8,c.claw,side*.4);
  // Two separate fingers leave an open, gently moving pincer.
  ctx.strokeStyle=c.claw;ctx.lineWidth=3;
  for(const finger of [-1,1]){ctx.beginPath();ctx.moveTo(cx+finger*4,cy-3);ctx.quadraticCurveTo(cx+finger*(7+wave*3),cy-13,cx+finger*(1.5+wave*3),cy-13);ctx.stroke();}
  ellipse(ctx,cx-2,cy-2,1.5,3,'#f3d3a05e',.4);
 }
 const shell=ctx.createLinearGradient(0,-21,0,3);shell.addColorStop(0,c.rim);shell.addColorStop(.3,c.shell);shell.addColorStop(1,c.leg);
 ellipse(ctx,0,-9,18,12,'#284b42');ellipse(ctx,0,-10,17,11,shell);
 ctx.strokeStyle=c.rim;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,-11,13,7,0,Math.PI*1.12,Math.PI*1.9);ctx.stroke();
 for(const side of [-1,1]){
  ctx.strokeStyle=c.leg;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(side*8,-16);ctx.lineTo(side*10,-23);ctx.stroke();
  ellipse(ctx,side*10,-24,3,3.5,'#d9d29b');ellipse(ctx,side*10+.5,-24,1.6,2.2,'#183735');ellipse(ctx,side*10,-25,.7,.8,'#e4ead6');
  ellipse(ctx,side*9,-8,2,1,'#f0ca9259');
 }
 ctx.restore();
}

// Predator visits and returning fish use their own random stream so the quiet
// scene's plant, fish and crab choices do not determine the event schedule.
let eventSeed=713117;
const eventRnd=(a,b)=>{eventSeed=(Math.imul(eventSeed,1664525)+1013904223)>>>0;return a+(b-a)*eventSeed/4294967296;};
let shark=null,nextShark=eventRnd(90,140),visits=0,totalCaught=0,totalReturned=0;
let sharkSpeedScale=1;
try{const saved=Number(localStorage.getItem('stillwater.sharkSpeed'));if(Number.isFinite(saved)&&saved>=.5&&saved<=2)sharkSpeedScale=Math.round(saved*4)/4;}catch{}
function showSharkSpeed(){
 document.getElementById('shark-speed').textContent=`${sharkSpeedScale}×`;
 document.getElementById('shark-slower').disabled=sharkSpeedScale<=.5;
 document.getElementById('shark-faster').disabled=sharkSpeedScale>=2;
}
function changeSharkSpeed(delta){
 const previous=sharkSpeedScale;sharkSpeedScale=clamp(Math.round((sharkSpeedScale+delta)*4)/4,.5,2);
 if(shark&&!paused)shark.speed*=sharkSpeedScale/previous;
 showSharkSpeed();wake();
 try{localStorage.setItem('stillwater.sharkSpeed',String(sharkSpeedScale));}catch{}
}
const returningFish=[],wakeBubbles=[];
const populationLabel=()=>{document.getElementById('fish-count').textContent=fish.length;};
const mouthOf=s=>({x:s.x+Math.cos(s.angle)*98,y:s.y+Math.sin(s.angle)*98});
function segmentDistance(p,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,q=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
 return Math.hypot(p.x-a.x-q*dx,p.y-a.y-q*dy);
}
function startShark(){
 const direction=eventRnd(0,1)<.5?1:-1;
 shark={x:direction>0?-220:W+220,y:eventRnd(340,540),angle:direction>0?0:Math.PI,phase:'enter',age:0,huntTime:0,caught:0,goal:Math.floor(eventRnd(2,4)),target:null,bite:0,cooldown:0,trail:0,stroke:0,speed:430*sharkSpeedScale,exitDirection:direction};
 visits++;
}
function updateShark(dt){
 // Restore the same fish gradually, entering through the planting at an edge.
 // Population is conserved across visits instead of dwindling with each hunt.
 for(let i=returningFish.length-1;i>=0;i--){
  const entry=returningFish[i];entry.remaining-=dt;
  if(entry.remaining<=0&&!shark){
   const f=entry.fish,direction=eventRnd(0,1)<.5?1:-1;
   Object.assign(f,{x:direction>0?-45:W+45,y:eventRnd(260,650),vx:direction*42,vy:0,turn:direction,alarm:0,recovery:0,entering:true,driftX:0,driftY:0,waterRoll:0});
   fish.push(f);returningFish.splice(i,1);totalReturned++;populationLabel();
  }
 }
 for(let i=wakeBubbles.length-1;i>=0;i--){const b=wakeBubbles[i];b.age+=dt;b.x+=b.vx*dt;b.y-=b.rise*dt;if(b.age>b.life)wakeBubbles.splice(i,1);}
 tension=lerp(tension,shark?1:0,1-Math.exp(-dt*(shark?1.4:.23)));
 if(!shark){nextShark-=dt;if(nextShark<=0&&returningFish.length===0)startShark();return;}
 const s=shark;s.age+=dt;s.bite=Math.max(0,s.bite-dt);s.cooldown=Math.max(0,s.cooldown-dt);
 if(s.phase==='enter'&&s.x>150&&s.x<W-150)s.phase='hunt';
 if(s.phase==='hunt'){
  s.huntTime+=dt;
  if(s.caught>=s.goal||s.huntTime>28){s.phase='leave';s.target=null;s.exitDirection=Math.cos(s.angle)>=0?1:-1;}
 }
 let desired=s.exitDirection>0?0:Math.PI;
 if(s.phase==='hunt'){
  if(!s.target||!fish.includes(s.target)||s.target.entering){
   const mouth=mouthOf(s);
   s.target=fish.filter(f=>f.type!=='angel'&&!f.entering).sort((a,b)=>Math.hypot(a.x-mouth.x,a.y-mouth.y)-Math.hypot(b.x-mouth.x,b.y-mouth.y))[0]||null;
  }
  if(s.target)desired=Math.atan2(s.target.y+s.target.driftY+s.target.vy*.16-s.y,s.target.x+s.target.driftX+s.target.vx*.16-s.x);
 }
 const turn=Math.atan2(Math.sin(desired-s.angle),Math.cos(desired-s.angle)),oldMouth=mouthOf(s);
 s.angle+=clamp(turn,-dt*4.5*sharkSpeedScale,dt*4.5*sharkSpeedScale);
 const speed=(s.phase==='hunt'?(Math.abs(turn)>.65?340:640):s.phase==='enter'?430:480)*sharkSpeedScale;
 s.speed=lerp(s.speed,speed,1-Math.exp(-dt*6));
 s.x+=Math.cos(s.angle)*s.speed*dt;s.y+=Math.sin(s.angle)*s.speed*dt;
 if(s.phase==='hunt'){s.x=clamp(s.x,-30,W+30);s.y=clamp(s.y,190,760);}
 const mouth=mouthOf(s);
 if(s.phase==='hunt'&&s.cooldown===0){
  const prey=fish.find(f=>f.type!=='angel'&&!f.entering&&segmentDistance({x:f.x+f.driftX,y:f.y+f.driftY},oldMouth,mouth)<18+f.size*.3);
  if(prey){
   fish.splice(fish.indexOf(prey),1);returningFish.push({fish:prey,remaining:55+s.caught*17+eventRnd(0,12)});
   s.caught++;totalCaught++;s.bite=.6;s.cooldown=.9;s.target=null;populationLabel();
   disturbWater(prey.x,prey.y,18,85);
   for(let i=0;i<9;i++)wakeBubbles.push({x:prey.x,y:prey.y,vx:eventRnd(-24,24),rise:eventRnd(9,35),r:eventRnd(1.2,3.1),age:0,life:eventRnd(.7,1.5)});
  }
 }
 s.stroke-=dt;
 if(s.stroke<=0){
  s.stroke=.14;
  const dx=Math.cos(s.angle),dy=Math.sin(s.angle),x=s.x-dx*92,y=s.y-dy*92,power=(7+s.speed*.014)*Math.sin(t*12);
  // Opposite pressure lobes shed from the beating tail; the bow pushes water
  // ahead. All visible responses below sample the waves these strokes create.
  disturbWater(x-dy*35,y+dx*35,power,58);disturbWater(x+dy*35,y-dx*35,-power,58);
  disturbWater(s.x+dx*62,s.y+dy*62,3+s.speed*.005,95);
 }
 s.trail-=dt;
 if(s.trail<=0){s.trail=.16;wakeBubbles.push({x:s.x-Math.cos(s.angle)*110,y:s.y-Math.sin(s.angle)*110,vx:-Math.cos(s.angle)*18,rise:8,r:2,age:0,life:1});}
 if(s.phase==='leave'&&(s.x<-240||s.x>W+240)){
  shark=null;nextShark=eventRnd(180,300);
 }
}

function sharkBody(s){
 const tail=Math.sin(t*(8+s.speed*.017))*17,jaw=s.bite/.6,facing=Math.cos(s.angle)>=0?1:-1;
 ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(Math.sin(s.angle)*facing,Math.cos(s.angle)*facing));ctx.scale(facing,1);
 // Asymmetric tail, tall dorsal fin and swept pectoral fins form the silhouette.
 path(ctx,[[-86,0],[-145,-62+tail],[-127,-8+tail*.4],[-147,43+tail],[-89,10]],'#52757b');
 path(ctx,[[-35,-22],[-27,-99],[25,-28]],'#41646d');
 path(ctx,[[-52,19],[-72,54],[-6,27]],'#4a7277');
 const body=ctx.createLinearGradient(0,-36,0,33);body.addColorStop(0,'#315764');body.addColorStop(.45,'#759896');body.addColorStop(.76,'#a7bbb0');body.addColorStop(1,'#d4dcc2');
 ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-94,0);ctx.bezierCurveTo(-73,-33,24,-43,81,-18);ctx.quadraticCurveTo(100,-11,108,-1);ctx.quadraticCurveTo(100,21,67,25);ctx.bezierCurveTo(7,40,-67,24,-94,9);ctx.closePath();ctx.fill();
 path(ctx,[[23,16],[-13,79],[-5,22]],'#557b80');
 ctx.strokeStyle='#233f4b88';ctx.lineWidth=2;
 for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(38-i*6,-10);ctx.quadraticCurveTo(32-i*6,2,35-i*6,13);ctx.stroke();}
 ellipse(ctx,78,-9,4,3.4,'#19343d');ellipse(ctx,79,-10,1,1,'#d2dfc5');
 if(jaw>.05){
  path(ctx,[[81,8],[106,0],[97,16+jaw*9],[77,15]],'#243b40');
  for(let i=0;i<3;i++)path(ctx,[[84+i*6,6-i*1.5],[89+i*6,4-i*1.5],[87+i*6,11-i*1.5]],'#d7dbc4');
 }else{ctx.strokeStyle='#34535a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(82,11);ctx.quadraticCurveTo(96,12,103,5);ctx.stroke();}
 ctx.strokeStyle='#bed3c24a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-67,-12);ctx.bezierCurveTo(-28,-31,36,-27,70,-17);ctx.stroke();
 ctx.restore();
}

function fishBody(f){
 const s=f.size,tail=Math.sin(t*(3.8+f.alarm*9)+f.phase)*(f.type==='angel'?.08:.2)*(1+f.alarm*.5),squeeze=Math.max(.15,Math.abs(f.turn)),sign=f.turn<0?-1:1;
 ctx.save();ctx.translate(f.x+f.driftX,f.y+f.driftY);ctx.rotate(clamp(f.vy/Math.max(Math.abs(f.vx),10),-.28,.28)*sign+f.waterRoll);ctx.scale(sign*squeeze,1);
 ctx.globalAlpha=f.depth;
 if(f.type==='angel'){
  // Veiled fins, a silver body and three softly edged vertical bands.
  const fin=ctx.createLinearGradient(0,-s,0,s);fin.addColorStop(0,'#bad5b442');fin.addColorStop(.5,'#bfcead95');fin.addColorStop(1,'#c6dbb71f');
  ctx.fillStyle=fin;ctx.beginPath();ctx.moveTo(-s*.29,-s*.12);ctx.bezierCurveTo(-s*.14,-s*.5,s*.15,-s*.98,s*.18,-s*.75);ctx.quadraticCurveTo(s*.29,-s*.28,s*.39,-s*.06);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(-s*.2,s*.15);ctx.quadraticCurveTo(-s*.03,s*.78,s*.16,s*.91+Math.sin(t+f.phase)*4);ctx.quadraticCurveTo(s*.19,s*.42,s*.39,s*.12);ctx.closePath();ctx.fill();
  path(ctx,[[-s*.28,0],[-s*.75,-s*.28+tail*s],[-s*.66,s*.28+tail*s]],'#b1c9b16b');
  const body=ctx.createLinearGradient(-s*.4,-s*.2,s*.4,s*.2);body.addColorStop(0,'#7fa89c');body.addColorStop(.35,'#d4ddbd');body.addColorStop(.7,'#b9cbb1');body.addColorStop(1,'#afbc8e');
  ellipse(ctx,0,0,s*.38,s*.43,body);
  ctx.save();ctx.beginPath();ctx.ellipse(0,0,s*.38,s*.43,0,0,TAU);ctx.clip();
  for(const a of [-.24,-.02,.2]){ctx.fillStyle='#34544d9c';ctx.beginPath();ctx.moveTo(s*a-s*.04,-s*.47);ctx.lineTo(s*a+s*.035,-s*.47);ctx.lineTo(s*a+s*.11,s*.48);ctx.lineTo(s*a+s*.015,s*.48);ctx.fill();}
  ctx.restore();
  ctx.strokeStyle='#dce6c777';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(s*.06,s*.23);ctx.quadraticCurveTo(s*.2,s*.67,s*.03+Math.sin(t*.8+f.phase)*6,s*.99);ctx.stroke();
  ctx.strokeStyle='#dae5c87a';ctx.beginPath();ctx.moveTo(s*.15,s*.21);ctx.quadraticCurveTo(s*.3,s*.72,s*.2+Math.sin(t*.9+f.phase)*5,s*.93);ctx.stroke();
  ellipse(ctx,s*.25,-s*.04,s*.065,s*.07,'#c7b879');ellipse(ctx,s*.27,-s*.04,s*.035,s*.041,'#173b3c');ellipse(ctx,s*.28,-s*.055,s*.011,s*.014,'#d2e7d1');
  ctx.strokeStyle='#49695c66';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(s*.2,s*.04,s*.1,s*.18,0,Math.PI*.5,Math.PI*1.5);ctx.stroke();
  path(ctx,[[s*.04,s*.1],[s*.18,s*.36+Math.sin(t*4+f.phase)*s*.04],[-s*.08,s*.23]],'#d4e0b943');
 }else{
  const neon=f.type==='neon';
  const tailCol=neon?'#92a7a866':'#d4a4698c';
  path(ctx,[[-s*.44,0],[-s*.91,-s*.23+tail*s],[-s*.83,tail*s*.3],[-s*.91,s*.23+tail*s]],tailCol);
  const body=ctx.createLinearGradient(0,-s*.2,0,s*.23);body.addColorStop(0,neon?'#416b6a':'#d1a76b');body.addColorStop(.45,neon?'#92c1b5':'#ebc38a');body.addColorStop(1,neon?'#839c93':'#9a7652');
  ellipse(ctx,0,0,s*.58,s*(neon?.19:.25),body);
  path(ctx,[[-s*.1,-s*.1],[s*.05,-s*.42],[-s*.33,-s*.12]],neon?'#aacac44a':'#e6c59466');
  path(ctx,[[-s*.03,s*.12],[-s*.18,s*.37],[-s*.32,s*.1]],'#c4d6b94a');
  if(neon){
   ctx.strokeStyle='#60d8dc';ctx.lineWidth=s*.065;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-s*.42,-s*.025);ctx.quadraticCurveTo(-s*.02,-s*.11,s*.39,-s*.07);ctx.stroke();
   ctx.strokeStyle='#d75f4c';ctx.lineWidth=s*.09;ctx.beginPath();ctx.moveTo(-s*.42,s*.09);ctx.lineTo(s*.09,s*.06);ctx.stroke();
   ctx.strokeStyle='#b1f1d877';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-s*.23,-s*.1);ctx.lineTo(s*.33,-s*.12);ctx.stroke();
  }else{path(ctx,[[-s*.3,-s*.17],[s*.01,s*.03],[-s*.4,s*.19]],'#394941');ctx.strokeStyle='#f9df9c88';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-s*.24,-s*.18);ctx.quadraticCurveTo(s*.2,-s*.24,s*.44,-s*.09);ctx.stroke();}
  ellipse(ctx,s*.37,-s*.035,s*.065,s*.065,neon?'#c1e6c8':'#f1d49c');ellipse(ctx,s*.39,-s*.03,s*.032,s*.04,'#19353a');
  path(ctx,[[s*.08,s*.03],[s*.22,s*.22+Math.sin(t*6+f.phase)*s*.04],[-s*.05,s*.13]],'#dce8ca55');
 }
 ctx.restore();ctx.globalAlpha=1;
}

function update(dt){
 t+=dt;updateShark(dt);updateWater(dt);updatePlantMotion(dt);const strength=currentStrength();
 updateCrabs(dt);
 lightValue=lerp(lightValue,lighting,Math.min(1,dt*.75));
 for(let i=foods.length-1;i>=0;i--){const food=foods[i],water=waterAt(food.x,food.y);food.y+=(food.speed+water.y*.6)*dt;food.x+=(Math.sin(t*.8+food.phase)*2*strength+water.x*.6)*dt;food.age+=dt;if(food.y>906||food.age>36)foods.splice(i,1);}
 for(const f of fish){
  const water=waterAt(f.x+f.driftX,f.y+f.driftY),response=1-Math.exp(-dt*9);
  f.driftX=lerp(f.driftX,water.x*.42,response);f.driftY=lerp(f.driftY,water.y*.42+water.height*.5,response);
  f.waterRoll=lerp(f.waterRoll,clamp(water.y*.007+water.x*.0025,-.28,.28),response);
  if(f.entering){f.x+=f.vx*dt;f.y+=Math.sin(t+f.phase)*dt*2;if(f.x>65&&f.x<W-65)f.entering=false;continue;}
  const threat=shark?Math.hypot(f.x-shark.x,f.y-shark.y):Infinity;
  f.alarm=lerp(f.alarm,shark?clamp(1-threat/650,.22,1):0,1-Math.exp(-dt*(shark?3:.45)));
  f.recovery=shark?18:Math.max(0,f.recovery-dt);
  let ax=0,ay=0,target=null,best=Infinity;
  if(f.alarm<.18)for(const food of foods){const d=Math.hypot(food.x-f.x,food.y-f.y);if(d<best&&d<440){best=d;target=food;}}
  const cruise=f.type==='angel'?15:f.type==='amber'?22:26;
  if(shark&&f.alarm>.18){
   const dx=f.x-shark.x,dy=f.y-shark.y,d=Math.max(1,Math.hypot(dx,dy)),escape=cruise*(2.5+f.alarm*2);
   // Nearby fish break from their shoal and flee; the rest dart nervously.
   ax+=(dx/d*escape-f.vx)*2.3;ay+=(dy/d*escape+Math.sin(t*5+f.phase)*22-f.vy)*2.3;
  }else if(target){const dx=target.x-f.x,dy=target.y-f.y,d=Math.max(1,Math.hypot(dx,dy));const speed=cruise*2.7;ax+=(dx/d*speed-f.vx)*.7;ay+=(dy/d*speed-f.vy)*.7;
   if(d<f.size*.48+7){const i=foods.indexOf(target);if(i>=0){foods.splice(i,1);eaten++;}}
  }else{
   const direction=f.vx<0?-1:1;
   ax+=(direction*cruise*(.75+strength*.18)-f.vx)*(.16+f.alarm*.8);
   ay+=(Math.sin(t*.19+f.phase)*5-f.vy)*.3;
   const home=f.type==='angel'?510:f.type==='amber'?520:420;
   ay+=(home+Math.sin(t*.06+f.phase)*135-f.y)*.008;
   let cx=0,cy=0,n=0;
   for(const other of fish){if(other===f||other.type!==f.type)continue;const dx=other.x-f.x,dy=other.y-f.y,d=Math.hypot(dx,dy);
    if(d<42){ax-=dx*.025;ay-=dy*.045;}
    else if(d<220){cx+=other.vx;cy+=other.y;n++;}
   }
   if(n){ax+=(cx/n-f.vx)*.07;ay+=(cy/n-f.y)*.009;}
  }
  // After the chase, move back out from the glass before resuming the usual
  // wandering; otherwise an entire frightened shoal can linger at one edge.
  if(!shark&&f.recovery>0)ax+=(800+Math.sin(f.phase)*300-f.x)*.04*f.recovery/18;
  if(f.x<110)ax+=(110-f.x)*.19;if(f.x>1490)ax-=(f.x-1490)*.19;
  if(f.y<150)ay+=(150-f.y)*.09;if(f.y>815)ay-=(f.y-815)*.1;
  f.vx=clamp(f.vx+ax*dt,-85-f.alarm*65,85+f.alarm*65);f.vy=clamp(f.vy+ay*dt,-65-f.alarm*50,65+f.alarm*50);
  f.x=clamp(f.x+(f.vx+water.x*.55)*dt,65,1535);f.y=clamp(f.y+(f.vy+water.y*.55)*dt,115,850);
  f.turn=lerp(f.turn,f.vx<0?-1:1,Math.min(1,dt*(2+f.alarm*5)));
 }
 for(const mote of motes){const water=waterAt(mote.x+mote.driftX,mote.y+mote.driftY);mote.driftX+=(water.x-mote.driftX*.7)*dt;mote.driftY+=(water.y-mote.driftY*.7)*dt;}
 for(let i=ripples.length-1;i>=0;i--){ripples[i].age+=dt;if(ripples[i].age>3)ripples.splice(i,1);}
}

function renderWaterMotion(){
 if(!waterActive)return;
 // Refracted light bands follow the same local pressure used by the fish and
 // rooted plants. Their bends travel away from the wake and fade with it.
 ctx.save();ctx.lineWidth=.9;
 for(let y=170;y<890;y+=65)for(let x=65;x<W-115;x+=52){
  const a=waterAt(x,y),b=waterAt(x+26,y),c=waterAt(x+52,y),energy=Math.max(Math.abs(a.height),Math.abs(b.height),Math.abs(c.height));
  if(energy<.45)continue;
  ctx.strokeStyle=`rgba(177,224,214,${Math.min(.27,energy*.03)})`;
  ctx.beginPath();ctx.moveTo(x,y+a.height*3);ctx.quadraticCurveTo(x+26,y+b.height*3,x+52,y+c.height*3);ctx.stroke();
 }
 ctx.restore();
}

function render(){
 ctx.drawImage(backdrop,0,0);
 // Light shafts drift slowly through the water column.
 ctx.save();ctx.globalAlpha=1-clamp(lightValue*.48,0,.85);
 ctx.drawImage(beams,Math.sin(t*.11)*18*currentStrength(),0);
 ctx.restore();
 // Fish are layered among the hardscape and the closer plants.
 fish.filter(f=>f.depth<.84).sort((a,b)=>a.size-b.size).forEach(fishBody);
 ctx.drawImage(ground,0,0);
 crabs.forEach(crabBody);
 // The opaque hardscape hides only the overlapping parts of a crab;
 // exposed legs and claws stay visible while it waits behind a stone.
 ctx.drawImage(shelters,0,0);ctx.drawImage(foreground,0,0);
 // Ground caustics, thin and uneven, follow the current.
 ctx.save();ctx.globalAlpha=.1*(1-lightValue*.3);ctx.strokeStyle='#d2dfac';ctx.lineWidth=1;
 for(let k=0;k<12;k++){ctx.beginPath();for(let j=0;j<=22;j++){const x=300+j*46,y=915+k*8+Math.sin(j*.8+k+t*.23)*7+Math.sin(j*1.8+t*.15)*3+waterAt(x,915+k*8).height*1.8;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}ctx.restore();
 renderWaterMotion();
 fish.filter(f=>f.depth>=.84).sort((a,b)=>a.size-b.size).forEach(fishBody);
 for(const b of wakeBubbles){ctx.strokeStyle=`rgba(194,224,216,${(1-b.age/b.life)*.25})`;ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(b.x,b.y,b.r+b.age*2,b.r+b.age*2,0,0,TAU);ctx.stroke();}
 if(shark)sharkBody(shark);
 for(const plant of plants){if(plant.type==='ribbon')ribbon(ctx,plant.x,plant.y,plant.h,plant.w,plant.bend,plant.phase,plant.color,plant.sway||0);else frond(ctx,plant.x,plant.y,plant.h,plant.phase,plant.color,t,plant.sway||0);}
 // A few near-glass blades frame the sand without filling the open water.
 for(let i=0;i<11;i++){const x=1400+i*19;ribbon(ctx,x,1040,125+(i%4)*27,10,Math.sin(i)*18,i,'#557c46',waterAt(x,940).x*.5);}
 if(lightValue>.01){ctx.fillStyle=`rgba(${lightValue<1?'87,61,27':'13,22,67'},${lightValue<1?lightValue*.18:.18+(lightValue-1)*.24})`;ctx.fillRect(0,0,W,H);}
 for(const mote of motes){const x=(mote.x+Math.sin(t*.08+mote.p)*15+t*.4*currentStrength()+mote.driftX)%W,y=mote.y+Math.sin(t*.13+mote.p)*9+mote.driftY;ellipse(ctx,x,y,mote.r,mote.r,'rgba(215,232,199,'+mote.a+')');}
 for(const bubble of bubbles){const progress=(bubble.p+t*bubble.speed/850)%1,y=903-progress*850,x=1385+bubble.off+Math.sin(progress*12+t*.4)*7;
  const water=waterAt(x,y),bx=x+water.x*.18,by=y+water.y*.18;
  ctx.strokeStyle='#c4e4d23a';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(bx,by,bubble.r,bubble.r*1.07,0,0,TAU);ctx.stroke();ellipse(ctx,bx-bubble.r*.27,by-bubble.r*.35,.7,.7,'#d5ecdc55');
 }
 for(const food of foods){ellipse(ctx,food.x,food.y,2.5,1.5,'#d2ad72',Math.sin(t+food.phase)*.4);ellipse(ctx,food.x-.5,food.y-.7,.7,.4,'#edd9a3');}
 for(const ripple of ripples){ctx.strokeStyle=`rgba(191,226,202,${(1-ripple.age/3)*.28})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(ripple.x,ripple.y,6+ripple.age*34,2+ripple.age*10,0,0,TAU);ctx.stroke();}
 // Surface reflections and a dark glass edge keep the composition quiet.
 ctx.strokeStyle='#c4dfbd12';ctx.lineWidth=1;for(let k=0;k<3;k++){ctx.beginPath();for(let j=0;j<30;j++){const x=j*58,y=73+k*9+Math.sin(j*.45+t*.23+k)*3+waterAt(x,73+k*9).height*2;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
 ctx.drawImage(frame,0,0);frames++;
}
function tick(now){
 if(runtime.paused){last=0;requestAnimationFrame(tick);return;}
 if(!last)last=now;
 const elapsed=now-last;
 if(elapsed>=1000/30){last=now;if(!paused)update(Math.min(elapsed/1000,.075));render();}
 if(now-wakeAt>8000&&runtime.canIdle())document.body.classList.add('idle');
 if(toastAt&&now-toastAt>3000){document.getElementById('toast').classList.remove('show');toastAt=0;}
 requestAnimationFrame(tick);
}
function wake(){wakeAt=performance.now();document.body.classList.remove('idle');}
function toast(message){const node=document.getElementById('toast');node.textContent=message;node.classList.add('show');toastAt=performance.now();}
function feed(x=800,y=210,options={}){
 if(!runtime.canAct(options)){toast('先让时间继续流动吧。');return false;}
 if(foods.length>42){toast('先让鱼儿慢慢吃完这一餐。');return false;}
 for(let i=0;i<7;i++)foods.push({x:clamp(x+rnd(-18,18),90,1510),y:clamp(y+rnd(-9,9),115,760),speed:rnd(8,13),phase:rnd(0,TAU),age:0});
 ripples.push({x,y,age:0});totalFed+=7;toast('一点小小的好心情，鱼儿收到了。');return true;
}
function switchLight(){lighting=(lighting+1)%3;document.getElementById('light-label').textContent=['晨光','暮色','月光'][lighting];toast(['把清晨的光，留在水里。','水草也有自己的黄昏。','今夜，和鱼儿一起看月光。'][lighting]);}
function switchFlow(){flow=(flow+1)%3;document.getElementById('flow-label').textContent=['缓流','轻涌','静水'][flow];toast(['水草在缓缓呼吸。','一阵小小的水流经过。','安静一点，再安静一点。'][flow]);}
function pause(){paused=!paused;runtime.setUserPaused(paused);document.getElementById('pause').setAttribute('aria-pressed',String(paused));document.getElementById('pause-icon').textContent=paused?'▷':'Ⅱ';document.getElementById('pause-label').textContent=paused?'继续':'暂停';document.getElementById('pause-badge').hidden=!paused;}
async function fullscreen(){if(!runtime.capabilities.fullscreen)return;try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('按 F11，也能进入或退出全屏。');}}
function help(){const panel=document.getElementById('help-panel');panel.hidden=!panel.hidden;document.getElementById('help').setAttribute('aria-expanded',String(!panel.hidden));wake();}
function clock(){const now=new Date();document.getElementById('time').textContent=now.toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});document.getElementById('date').textContent=now.toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'short'});}
document.getElementById('feed').onclick=()=>feed();document.getElementById('light').onclick=switchLight;document.getElementById('flow').onclick=switchFlow;document.getElementById('pause').onclick=pause;document.getElementById('fullscreen').onclick=fullscreen;document.getElementById('help').onclick=help;document.getElementById('close-help').onclick=help;
document.getElementById('shark-slower').onclick=()=>changeSharkSpeed(-.25);document.getElementById('shark-faster').onclick=()=>changeSharkSpeed(.25);showSharkSpeed();
canvas.addEventListener('click',event=>{const scale=Math.max(innerWidth/W,innerHeight/H),x=(event.clientX-(innerWidth-W*scale)/2)/scale,y=(event.clientY-(innerHeight-H*scale)/2)/scale;feed(x,y);});
document.addEventListener('pointermove',wake,{passive:true});document.addEventListener('pointerdown',wake,{passive:true});
document.addEventListener('keydown',event=>{if(event.ctrlKey||event.altKey||event.metaKey||event.repeat)return;wake();switch(event.key.toLowerCase()){case 'e':feed();break;case 'l':switchLight();break;case 'c':switchFlow();break;case ' ':event.preventDefault();pause();break;case 'f':fullscreen();break;case 'h':help();break;case 's':hidden=!hidden;document.body.classList.toggle('hidden-ui',hidden);break;}});
document.addEventListener('visibilitychange',()=>{last=0;});
runtime.onStateChange(()=>{last=0;wake();});
runtime.everySecond(clock);
runtime.registerActions([
 {id:'feed',label:'投喂鱼儿',allowWhenOccluded:true,disabledReason:()=>foods.length>42?'先让鱼儿慢慢吃完这一餐。':null,run:()=>{feed(undefined,undefined,{allowWhenOccluded:true});return {totalFed,foods:foods.length};}},
 {id:'light',label:'切换光照',run:()=>{switchLight();return {lighting};}},
 {id:'flow',label:'切换水流',run:()=>{switchFlow();return {flow};}}
]);render();requestAnimationFrame(tick);
// Read-only diagnostics for local browser verification, independent of gallery discovery.
window.aquarium={sampleWater:waterAt,getState:()=>({time:t,paused,lighting,flow,fish:fish.length,crabs:crabs.length,crabStates:crabs.map(c=>({x:c.x,y:c.y,activity:c.activity,gait:c.gait,gesture:c.gesture})),shark:shark?{x:shark.x,y:shark.y,angle:shark.angle,phase:shark.phase,age:shark.age,caught:shark.caught,goal:shark.goal,bite:shark.bite,speed:shark.speed}:null,nextSharkIn:nextShark,sharkSpeedScale,visits,totalCaught,totalReturned,returning:returningFish.length,tension,water:{active:waterActive,peak:waterPeak,velocityPeak:waterSpeedPeak,fishDrift:Math.max(...fish.map(f=>Math.hypot(f.driftX,f.driftY))),plantBend:Math.max(...plants.map(p=>Math.abs(p.sway||0)))},plantStates:plants.map(p=>({x:p.x,y:p.y,bend:p.sway||0,velocity:p.swayVelocity||0})),frightened:fish.filter(f=>f.alarm>.18).length,foods:foods.length,eaten,totalFed,frames,positions:fish.map(f=>({x:f.x,y:f.y,vx:f.vx,vy:f.vy,type:f.type,alarm:f.alarm,entering:f.entering,driftX:f.driftX,driftY:f.driftY,waterRoll:f.waterRoll}))})};
}
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', startScene, { once: true });
else startScene();
})();

// Offline Canvas QA. Optional: PLAYWRIGHT_PATH, BROWSER_PATH, QA_OUTPUT_DIR,
// WALLPAPER_HOST_WRAPPER (the real host's wallpaper-mode.js).
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'../wallpapers/aquarium');
const output=process.env.QA_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'aquarium-qa-'));

(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Inline the exact local assets so the test also runs without a web server.
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8')
   .replace('<link rel="stylesheet" href="./aquarium.css">',`<style>${fs.readFileSync(path.join(root,'aquarium.css'),'utf8')}</style>`)
   .replace('<script src="./aquarium.js" defer></script>','');
  const origin='http://aquarium.test/';
  await page.context().route('**/*',route=>{
   if(route.request().url()===origin)return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
   if(route.request().url()===origin+'favicon.ico')return route.fulfill({status:204});
   external.push(route.request().url());return route.abort();
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   const pending=[];let stamp=1000;
   window.requestAnimationFrame=callback=>{pending.push(callback);return pending.length;};
   window.__qaLayers=[];
   const create=document.createElement.bind(document);
   document.createElement=(tag,...args)=>{const node=create(tag,...args);if(tag==='canvas')__qaLayers.push(node);return node;};
   // Suppress raster work only while advancing simulation. Actual screenshot
   // frames use the original Canvas methods and the original render function.
   for(const key of ['save','restore','translate','scale','rotate','beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','ellipse','arc','clip','fill','stroke','fillRect','drawImage']){
    const original=CanvasRenderingContext2D.prototype[key];
    CanvasRenderingContext2D.prototype[key]=function(...args){if(window.__qaFast&&this.canvas.id==='aquarium')return;return original.apply(this,args);};
   }
   window.__qaStep=(count,elapsed=75,draw=false)=>{
    window.__qaFast=!draw;
    for(let i=0;i<count;i++){stamp+=elapsed;const callbacks=pending.splice(0);callbacks.forEach(callback=>callback(stamp));}
    window.__qaFast=false;return window.aquarium?.getState();
   };
  });
  if(process.env.WALLPAPER_HOST_WRAPPER)await page.addScriptTag({content:fs.readFileSync(process.env.WALLPAPER_HOST_WRAPPER,'utf8')});
  const script=fs.readFileSync(path.join(root,'aquarium.js'),'utf8');
  await page.addScriptTag({content:script});
  await page.addStyleTag({content:'.hud,.pause-badge,.toast{display:none!important}'});
  const initial=await page.evaluate(()=>aquarium.getState());
  assert.equal(initial.crabs,3);assert.equal(initial.fish,30);
  assert.equal(initial.shark,null);assert.ok(initial.nextSharkIn>=90&&initial.nextSharkIn<=140);
  assert.equal(initial.sharkSpeedScale,1);
  async function speedButton(id){
   if(process.env.WALLPAPER_HOST_WRAPPER){
    const box=await page.locator('#'+id).boundingBox();assert.ok(box);
    const delivered=await page.evaluate(({x,y})=>__SCREEN_GARDEN_DESKTOP_CLICK(x/innerWidth,y/innerHeight),{x:box.x+box.width/2,y:box.y+box.height/2});
    assert.equal(delivered.delivered,true,'Desktop click forwarding reaches the floating button');
   }else await page.locator('#'+id).click();
   return page.evaluate(()=>aquarium.getState());
  }
  assert.ok(await page.locator('.shark-tools').isVisible(),'The floating control survives the host hiding .hud');
  assert.equal(await page.locator('#shark-speed').textContent(),'1×');
  assert.equal((await speedButton('shark-slower')).sharkSpeedScale,.75);
  assert.equal((await speedButton('shark-faster')).sharkSpeedScale,1);
  for(let i=0;i<4;i++)await speedButton('shark-faster');
  assert.equal((await page.evaluate(()=>aquarium.getState())).sharkSpeedScale,2);
  assert.ok(await page.locator('#shark-faster').isDisabled());
  for(let i=0;i<6;i++)await speedButton('shark-slower');
  assert.equal((await page.evaluate(()=>aquarium.getState())).sharkSpeedScale,.5);
  assert.ok(await page.locator('#shark-slower').isDisabled());
  for(let i=0;i<3;i++)await speedButton('shark-faster');
  // A second page on the same wallpaper origin checks a real localStorage read.
  const reopened=await page.context().newPage();
  await reopened.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
  await reopened.goto(origin,{waitUntil:'domcontentloaded'});await reopened.addScriptTag({content:script});
  assert.equal(await reopened.evaluate(()=>aquarium.getState().sharkSpeedScale),1.25);
  assert.equal(await reopened.locator('#shark-speed').textContent(),'1.25×');await reopened.close();
  assert.equal((await speedButton('shark-slower')).sharkSpeedScale,1);
  assert.equal((await page.evaluate(()=>aquarium.getState())).totalFed,0,'Adjusting shark speed does not feed the fish');
  await page.screenshot({path:path.join(output,'aquarium-crabs.png')});

  const seen=[new Set(),new Set(),new Set()],visits=new Map(),sharkPhases=new Set();
  let shelterChecked=false,sharkChecked=false,lastVisit=null,peakFrightened=0,peakSpeed=0,localizedWave=false,waveAfterExit=false;
  const wakePeaks={sharkSpeed:0,pressure:0,fishDrift:0,plantBend:0,fishRoll:0};
  function observeShark(state){
   assert.equal(state.fish+state.returning,30,'Population is conserved across predation and return');
   assert.equal(state.positions.filter(f=>f.type==='angel').length,4,'Only small fish are prey');
   state.positions.forEach(f=>assert.ok(Number.isFinite(f.x)&&Number.isFinite(f.y)&&Number.isFinite(f.vx)&&Number.isFinite(f.vy)));
   peakFrightened=Math.max(peakFrightened,state.frightened);
   peakSpeed=Math.max(peakSpeed,...state.positions.map(f=>Math.hypot(f.vx,f.vy)));
   wakePeaks.sharkSpeed=Math.max(wakePeaks.sharkSpeed,state.shark?.speed||0);
   wakePeaks.pressure=Math.max(wakePeaks.pressure,state.water.peak);
   wakePeaks.fishDrift=Math.max(wakePeaks.fishDrift,state.water.fishDrift);
   wakePeaks.plantBend=Math.max(wakePeaks.plantBend,state.water.plantBend);
   wakePeaks.fishRoll=Math.max(wakePeaks.fishRoll,...state.positions.map(f=>Math.abs(f.waterRoll)));
   assert.ok(state.water.peak<=24&&Number.isFinite(state.water.velocityPeak),'Wave solver stays bounded');
   assert.ok(state.water.fishDrift<60&&state.water.plantBend<=85);
   state.plantStates.forEach(p=>assert.ok(Number.isFinite(p.bend)&&Number.isFinite(p.velocity)));
   if(state.visits===1&&state.shark?.age<1.7){
    const left=Math.max(...state.plantStates.filter(p=>p.x<400).map(p=>Math.abs(p.bend)));
    const right=Math.max(...state.plantStates.filter(p=>p.x>1100).map(p=>Math.abs(p.bend)));
    if(right>2&&left<.1)localizedWave=true;
   }
   if(state.shark){
    const s=state.shark;sharkPhases.add(s.phase);
    assert.ok(s.goal>=2&&s.goal<=3&&s.caught<=s.goal);
    if(!visits.has(state.visits)){
     if(lastVisit)assert.ok(state.time-lastVisit.finished>=179,'Visits leave several quiet minutes in between');
     visits.set(state.visits,{started:state.time,goal:s.goal,caught:0});
    }
    const visit=visits.get(state.visits);visit.caught=s.caught;lastVisit=visit;
   }else if(lastVisit&&!lastVisit.finished){
    lastVisit.finished=state.time;
    if(state.water.active&&state.water.plantBend>1&&state.water.fishDrift>.1)waveAfterExit=true;
    assert.equal(lastVisit.caught,lastVisit.goal,'A visit eats only its two or three small fish');
    assert.ok(lastVisit.finished-lastVisit.started<45,'The visitor leaves promptly');
   }
  }
  for(let i=0;i<400;i++){
   const state=await page.evaluate(()=>__qaStep(10));
   observeShark(state);
   state.crabStates.forEach((c,index)=>{
    seen[index].add(c.activity);
    assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.y));
    assert.ok(c.x>500&&c.x<1250&&c.y>=910&&c.y<955,'Crab stays on the sand near its shelter');
   });
   if(!sharkChecked&&state.shark?.phase==='hunt'&&state.shark.x>400&&state.shark.x<1250){
    const faster=await speedButton('shark-faster');
    assert.ok(Math.abs(faster.shark.speed/state.shark.speed-1.25)<.001,'Speed changes apply to the shark already on screen');
    const restored=await speedButton('shark-slower');
    assert.ok(Math.abs(restored.shark.speed-state.shark.speed)<.001);
    await page.evaluate(()=>document.getElementById('pause').click());
    const frozen=await page.evaluate(()=>aquarium.getState());
    const still=await page.evaluate(()=>__qaStep(80));
    assert.equal(still.time,frozen.time);assert.deepEqual(still.shark,frozen.shark);assert.deepEqual(still.positions,frozen.positions);
    assert.equal(still.nextSharkIn,frozen.nextSharkIn);assert.equal(still.returning,frozen.returning);
    assert.deepEqual(still.water,frozen.water);assert.deepEqual(still.plantStates,frozen.plantStates);
    await page.evaluate(()=>document.getElementById('pause').click());
    await page.evaluate(()=>__qaStep(1,75,true));
    await page.screenshot({path:path.join(output,'aquarium-shark.png')});
    sharkChecked=true;
   }
   if(!shelterChecked&&state.crabStates.some(c=>c.activity==='sheltered')){
    await page.evaluate(()=>__qaStep(1,75,true));
    const coverage=await page.evaluate(()=>{
     const mask=__qaLayers[2].getContext('2d');
     return aquarium.getState().crabStates.filter(c=>c.activity==='sheltered').map(c=>{
      const pixels=mask.getImageData(Math.floor(c.x-28),Math.floor(c.y-31),56,46).data;
      let covered=0,open=0;for(let p=3;p<pixels.length;p+=4){if(pixels[p]>240)covered++;if(pixels[p]<10)open++;}
      return {covered,open};
     });
    });
    assert.ok(coverage.length>0);
    coverage.forEach(c=>assert.ok(c.covered>100&&c.open>100,'A sheltered crab is partly occluded, with room to peek out'));
    await page.screenshot({path:path.join(output,'aquarium-sheltered.png')});
    shelterChecked=true;
   }
  }
  assert.ok(shelterChecked,'Crabs occasionally shelter behind a stone');
  seen.forEach((states,index)=>{
   for(const activity of ['rest','wave','retreat','sheltered','emerge'])assert.ok(states.has(activity),`Crab ${index+1}: missing ${activity}`);
  });
  assert.ok(seen.some(states=>states.has('walk')));
  assert.ok(sharkChecked&&peakFrightened>15&&peakSpeed>70,'The visit visibly changes a quiet shoal into fleeing fish');
  assert.ok(wakePeaks.sharkSpeed>550,'A fast chase replaces the previous slow cruise');
  assert.ok(wakePeaks.pressure>5&&wakePeaks.fishDrift>8&&wakePeaks.plantBend>20&&wakePeaks.fishRoll>.08,'The wake displaces and rolls fish and bends rooted plants');
  assert.ok(localizedWave,'Plants near the first stroke react before the opposite bank');
  assert.ok(waveAfterExit,'Water and plants continue moving after the shark leaves');
  assert.deepEqual([...sharkPhases].sort(),['enter','hunt','leave']);
  const calm=await page.evaluate(()=>aquarium.getState());
  assert.equal(calm.shark,null);assert.equal(calm.fish,30);assert.equal(calm.returning,0);assert.equal(calm.frightened,0);assert.ok(calm.tension<.01);
  assert.equal(calm.water.active,false);assert.ok(calm.water.fishDrift<.01&&calm.water.plantBend<.01,'Residual motion settles fully');
  assert.equal(await page.locator('#fish-count').textContent(),'30');
  // A second complete visit catches regressions that drain the population or
  // forget to restart the timer after the first event.
  let recovered=calm;
  for(let i=0;i<800;i++){
   recovered=await page.evaluate(()=>__qaStep(10));observeShark(recovered);
   if(recovered.visits>=2&&!recovered.shark&&recovered.returning===0&&recovered.tension<.01&&recovered.positions.every(f=>!f.entering))break;
  }
  assert.ok(visits.size>=2&&[...visits.values()].every(v=>v.finished));
  assert.equal(recovered.fish,30);assert.equal(recovered.returning,0);assert.equal(recovered.totalCaught,recovered.totalReturned);
  assert.equal(recovered.frightened,0);

  await page.evaluate(()=>document.getElementById('pause').click());
  const frozen=await page.evaluate(()=>aquarium.getState());
  const still=await page.evaluate(()=>__qaStep(100));
  assert.equal(still.time,frozen.time);assert.deepEqual(still.crabStates,frozen.crabStates);
  await page.evaluate(()=>document.getElementById('pause').click());
  const resumed=await page.evaluate(()=>__qaStep(1,60000));
  assert.ok(resumed.time>still.time&&resumed.time-still.time<=.076,'Resume clamps a long host RAF gap');
  await page.evaluate(()=>{document.getElementById('feed').click();document.getElementById('light').click();document.getElementById('flow').click();});
  const controls=await page.evaluate(()=>aquarium.getState());
  assert.equal(controls.totalFed,7);assert.equal(controls.lighting,1);assert.equal(controls.flow,1);
  for(const [width,height] of [[1600,900],[320,640],[390,844],[780,600],[3840,2160]]){
   await page.setViewportSize({width,height});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   const tools=await page.locator('.shark-tools').boundingBox();assert.ok(tools);
   assert.ok(tools.x>=12&&tools.x+tools.width<=width-12&&tools.y>=0&&tools.y+tools.height<=height-62,'Floating controls stay inside the screen and above the taskbar');
   if(width===390){await page.evaluate(()=>document.body.classList.remove('idle'));await page.screenshot({path:path.join(output,'aquarium-speed-mobile.png')});}
  }
  await page.setViewportSize({width:1600,height:1000});
  await page.evaluate(()=>{document.getElementById('shark-faster').click();__qaStep(1,75,true);document.body.classList.remove('idle');});
  await page.screenshot({path:path.join(output,'aquarium-speed-desktop.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({passed:true,simulationSeconds:resumed.time,activities:seen.map(s=>[...s]),sharkVisits:[...visits.values()],peakFrightened,peakSpeed,wakePeaks,localizedWave,waveAfterExit,fishRecovered:recovered.fish,partialOcclusion:true,pause:true,activeSharkPause:true,resume:true,controls:true,offline:true,output},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

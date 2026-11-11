// Offline Canvas QA. Optional: PLAYWRIGHT_PATH, BROWSER_PATH, QA_OUTPUT_DIR.
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
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{external.push(route.request().url());return route.abort();});
  // Inline the exact local assets so the test also runs without a web server.
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8')
   .replace('<link rel="stylesheet" href="./aquarium.css">',`<style>${fs.readFileSync(path.join(root,'aquarium.css'),'utf8')}</style>`)
   .replace('<script src="./aquarium.js" defer></script>','');
  await page.setContent(html);
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
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'aquarium.js'),'utf8')});
  await page.addStyleTag({content:'.hud,.pause-badge,.toast{display:none!important}'});
  const initial=await page.evaluate(()=>aquarium.getState());
  assert.equal(initial.crabs,3);assert.equal(initial.fish,30);
  assert.equal(initial.shark,null);assert.ok(initial.nextSharkIn>=90&&initial.nextSharkIn<=140);
  await page.screenshot({path:path.join(output,'aquarium-crabs.png')});

  const seen=[new Set(),new Set(),new Set()],visits=new Map(),sharkPhases=new Set();
  let shelterChecked=false,sharkChecked=false,lastVisit=null,peakFrightened=0,peakSpeed=0;
  function observeShark(state){
   assert.equal(state.fish+state.returning,30,'Population is conserved across predation and return');
   assert.equal(state.positions.filter(f=>f.type==='angel').length,4,'Only small fish are prey');
   state.positions.forEach(f=>assert.ok(Number.isFinite(f.x)&&Number.isFinite(f.y)&&Number.isFinite(f.vx)&&Number.isFinite(f.vy)));
   peakFrightened=Math.max(peakFrightened,state.frightened);
   peakSpeed=Math.max(peakSpeed,...state.positions.map(f=>Math.hypot(f.vx,f.vy)));
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
    await page.evaluate(()=>document.getElementById('pause').click());
    const frozen=await page.evaluate(()=>aquarium.getState());
    const still=await page.evaluate(()=>__qaStep(80));
    assert.equal(still.time,frozen.time);assert.deepEqual(still.shark,frozen.shark);assert.deepEqual(still.positions,frozen.positions);
    assert.equal(still.nextSharkIn,frozen.nextSharkIn);assert.equal(still.returning,frozen.returning);
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
  assert.deepEqual([...sharkPhases].sort(),['enter','hunt','leave']);
  const calm=await page.evaluate(()=>aquarium.getState());
  assert.equal(calm.shark,null);assert.equal(calm.fish,30);assert.equal(calm.returning,0);assert.equal(calm.frightened,0);assert.ok(calm.tension<.01);
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
  for(const [width,height] of [[1600,900],[390,844],[3840,2160]]){
   await page.setViewportSize({width,height});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({passed:true,simulationSeconds:resumed.time,activities:seen.map(s=>[...s]),sharkVisits:[...visits.values()],peakFrightened,peakSpeed,fishRecovered:recovered.fish,partialOcclusion:true,pause:true,activeSharkPause:true,resume:true,controls:true,offline:true,output},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

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
  await page.screenshot({path:path.join(output,'aquarium-crabs.png')});

  const seen=[new Set(),new Set(),new Set()];let shelterChecked=false;
  for(let i=0;i<400;i++){
   const state=await page.evaluate(()=>__qaStep(10));
   state.crabStates.forEach((c,index)=>{
    seen[index].add(c.activity);
    assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.y));
    assert.ok(c.x>500&&c.x<1250&&c.y>=910&&c.y<955,'Crab stays on the sand near its shelter');
   });
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
  console.log(JSON.stringify({passed:true,simulationSeconds:resumed.time,activities:seen.map(s=>[...s]),partialOcclusion:true,pause:true,resume:true,controls:true,offline:true,output},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

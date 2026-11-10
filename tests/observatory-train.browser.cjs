/* Real offline Canvas scenes, responsive layout and host RAF pause integration.
 * Run: node tests/observatory-train.browser.cjs
 * Optional: PLAYWRIGHT_PATH, EDGE_PATH, QA_OUTPUT_DIR, UPDATE_COVERS=1.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const host=path.resolve(root,'../desktop/wallpaper-host');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||path.join(host,'node_modules/playwright-core'));
const scenes=[['orbital-observatory','observatory'],['night-train','nightTrain']];
const output=process.env.QA_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'wallpaper-scenes-qa-'));
const wrapper=fs.readFileSync(path.join(host,'src-tauri/wallpaper-mode.js'),'utf8');

(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname==='/favicon.ico'){response.writeHead(204).end();return;}
  const parts=pathname.split('/').filter(Boolean);
  if(parts.length!==2||!scenes.some(([id])=>id===parts[0])||!/^[a-z][a-z.]+$/.test(parts[1])){response.writeHead(404).end();return;}
  const file=path.join(root,'wallpapers',parts[0],parts[1]);
  if(!fs.existsSync(file)){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':({'html':'text/html; charset=utf-8','css':'text/css','js':'text/javascript'})[path.extname(file).slice(1)]||'application/octet-stream','Cache-Control':'no-store'});response.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  for(const [id,api] of scenes){
   const metadata=JSON.parse(fs.readFileSync(path.join(root,'wallpapers',id,'module.json'),'utf8'));
   assert.equal(metadata.id,id);assert.equal(metadata.version,'1.0.0');assert.equal(metadata.minAppVersion,'0.2.0');
   for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport,locale:'zh-CN'}),errors=[],external=[];
    await context.addInitScript({content:wrapper});
    const page=await context.newPage();page.setDefaultTimeout(20000);
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
    try{
     await page.goto(`${origin}/${id}/index.html`,{waitUntil:'load'});
     await page.waitForFunction(key=>window[key]?.getState().frames>3,api,{polling:50});
     const before=await page.evaluate(key=>window[key].getState(),api);
     assert.equal(before.targetFps,30);assert.ok(before.time>=0);
     const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector('canvas').width,hud:getComputedStyle(document.querySelector('.hud')).display}));
     assert.ok(dimensions.scroll<=dimensions.width,'No horizontal overflow');assert.ok(dimensions.canvas>0);assert.equal(dimensions.hud,'none');
     await page.evaluate(()=>window.__SCREEN_GARDEN_SET_PAUSED(true));
     const stopped=await page.evaluate(key=>window[key].getState(),api);await page.waitForTimeout(220);
     const still=await page.evaluate(key=>window[key].getState(),api);assert.equal(still.frames,stopped.frames,'Host pause freezes drawing');assert.equal(still.time,stopped.time,'Host pause freezes simulation');
     await page.evaluate(()=>window.__SCREEN_GARDEN_SET_PAUSED(false));
     await page.waitForFunction(({key,frame})=>window[key].getState().frames>frame,{key:api,frame:still.frames},{polling:50});
     await page.evaluate(()=>document.getElementById('pause').click());const paused=await page.evaluate(key=>window[key].getState(),api);await page.waitForTimeout(180);
     assert.equal((await page.evaluate(key=>window[key].getState(),api)).time,paused.time,'Module pause stops the scene');
     await page.evaluate(()=>document.getElementById('pause').click());
     assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
     const desktop=viewport.width>700;
     await page.screenshot({path:path.join(output,`${id}-${desktop?'desktop':'mobile'}.png`)});
     if(desktop&&process.env.UPDATE_COVERS==='1')await page.screenshot({path:path.join(root,'wallpapers',id,'cover.jpg'),type:'jpeg',quality:89});
     console.log(`PASS ${id} ${viewport.width}x${viewport.height}: real rendering, offline, pause/resume, zero overflow/errors`);
    }catch(error){console.error(JSON.stringify({id,viewport,errors,external,state:await page.evaluate(key=>window[key]?.getState(),api).catch(()=>null)}));throw error;}
    finally{await context.close();}
   }
  }
  console.log('Screenshots: '+output);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

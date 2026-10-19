const { chromium }=require('playwright');
const chromiumPackage=require('@sparticuz/chromium').default;
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:await chromiumPackage.executablePath(),args:chromiumPackage.args.filter(arg=>arg!=='--single-process'),headless:true});
 try {
  for(const width of [1200,600]){
   const page=await browser.newPage({viewport:{width,height:1000}});
   const errors=[],external=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin==='http://localhost:5173')return route.continue();
    external.push(route.request().url());return route.abort();
   });
   await page.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=()=>null;window.requestAnimationFrame=()=>0;});
   await page.setContent('<iframe id="preview" sandbox="allow-scripts allow-same-origin" src="http://localhost:5173/" style="width:100%;height:950px;border:0"></iframe>');
   const f=page.frameLocator('#preview');
   await f.locator('#build-status').filter({hasText:'v1.6.0 · 9:16 · 46/46 кадров готовы'}).waitFor();
   await f.locator('[data-sprite="player"]').waitFor({state:'visible'});
   assert(await f.locator('#scene-background').evaluate(el=>el.complete&&el.naturalWidth>0));
   await f.locator('#start').click();
   assert(await f.locator('#overlay').evaluate(el=>el.classList.contains('hidden')));
   await f.locator('[data-sprite^="falling-"]').first().waitFor();
   const cat=f.locator('[data-sprite^="falling-"]').first();
   const before=await cat.evaluate(el=>({top:parseFloat(el.style.top),frame:el.dataset.frame}));
   const frames=new Set([before.frame]);
   for(let i=0;i<5;i++){await page.waitForTimeout(150);frames.add(await cat.getAttribute('data-frame'));}
   assert((await cat.evaluate(el=>parseFloat(el.style.top)))>before.top);assert(frames.size>=3);
   const player=f.locator('[data-sprite="player"]');
   const x=await player.evaluate(el=>parseFloat(el.style.left));
   await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);await page.keyboard.up('ArrowRight');
   assert((await player.evaluate(el=>parseFloat(el.style.left)))>x);
   if(width<=750){
    const left=f.locator('#left');
    assert(await left.isVisible());
    assert.equal(await f.locator('.game-bottom').evaluate(el=>getComputedStyle(el).display),'none');
    const beforeTouch=await player.evaluate(el=>parseFloat(el.style.left));
    await left.dispatchEvent('pointerdown',{pointerId:42,pointerType:'touch',isPrimary:true,button:0,buttons:1});
    await page.waitForTimeout(200);
    await left.dispatchEvent('pointerup',{pointerId:42,pointerType:'touch',isPrimary:true,button:0,buttons:0});
    assert((await player.evaluate(el=>parseFloat(el.style.left)))<beforeTouch);
    assert.equal(await left.getAttribute('aria-pressed'),'false');
   }
   await f.locator('#pause').click();const frozen=await cat.evaluate(el=>el.style.top);
   await page.waitForTimeout(250);assert.equal(await cat.evaluate(el=>el.style.top),frozen);
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   await page.screenshot({path:`.cache/standalone-${width}.png`,fullPage:true});
   console.log('PASS iframe',width,': ready, background, player, start, falling poses, arrows, pause; no external requests or errors.');
  }
  const pwaPage=await browser.newPage({viewport:{width:390,height:844}});
  const pwaErrors=[];
  pwaPage.on('pageerror',error=>pwaErrors.push(error.message));
  await pwaPage.goto('http://localhost:5173/');
  await pwaPage.locator('#build-status').filter({hasText:'46/46 кадров готовы'}).waitFor();
  const manifest=await pwaPage.evaluate(async()=>{
   const response=await fetch(document.querySelector('link[rel="manifest"]').href);
   return response.json();
  });
  assert.equal(manifest.display,'standalone');
  await pwaPage.evaluate(()=>{
   const event=new Event('beforeinstallprompt',{cancelable:true});
   event.prompt=async()=>{};
   event.userChoice=Promise.resolve({outcome:'accepted'});
   window.dispatchEvent(event);
  });
  assert(await pwaPage.locator('#install').isVisible());
  await pwaPage.locator('#install').click();
  await pwaPage.locator('#install').waitFor({state:'hidden'});
  await pwaPage.evaluate(async()=>{await navigator.serviceWorker.ready;return true;});
  await pwaPage.reload();
  assert(await pwaPage.evaluate(()=>Boolean(navigator.serviceWorker.controller)));
  await pwaPage.context().setOffline(true);
  await pwaPage.reload();
  await pwaPage.locator('#build-status').filter({hasText:'46/46 кадров готовы'}).waitFor();
  await pwaPage.context().setOffline(false);
  assert.deepEqual(pwaErrors,[]);
  console.log('PASS Android PWA: manifest, installed service worker, and offline launch.');
  await pwaPage.close();
 } finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

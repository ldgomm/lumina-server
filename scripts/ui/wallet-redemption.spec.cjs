// Actual browser and compiled artwork; all business data is fictional and API calls are intercepted.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty'),evidence=process.env.LOYALTY_UI_EVIDENCE;
const initial={composition:'PANORAMA',frontFocus:'PROGRESS',displayName:'Café de barrio',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'s',stampSymbol:'☕',artworkStyle:'GRADIENT',artworkAccent:'#e9b774',welcome:'Bienvenido',usage:'Presenta tu QR en caja.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de barrio',currency:'USD',timezone:'America/Guayaquil'},promotionSuggestions:{category:{id:'CAFE',name:'Cafetería',source:'SELECTED'}},branches:[],programs:[{id:'s',config:{name:'Un café más cerca',kind:'STAMPS',active:true}}],rewards:[{id:'r',programId:'s',active:true,cost:5,name:'Un café de especialidad',benefitText:'Una unidad de café de la casa.'}]};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const errors=[],calls=[];
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
  if(u.pathname.startsWith('/wallet/art/')){assert.ok(await require('./wallet-artwork-fixture.cjs')(route,u));return;}
  if(u.pathname.startsWith('/api/')){assert.equal(u.pathname,'/api/staff/wallet-design');assert.equal(req.method(),'GET');calls.push(u.pathname);return route.fulfill({json:{version:3,design:initial}});}
  const name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
 const shot=async(name,selector)=>{if(!evidence)return;fs.mkdirSync(evidence,{recursive:true});await page.locator(selector).screenshot({path:path.join(evidence,name+'.png')});};
 const both=async value=>{for(const id of ['appleJourneyValue','googleJourneyValue'])assert.equal(await page.locator('#'+id).textContent(),value);};
 for(const width of [1440,1024,390,320]){
  await page.setViewportSize({width,height:1080});await page.goto('https://loyalty.test/');await page.evaluate(d=>{state.data=d;state.token='fiction';state.tab='design';exit.hidden=false;renderMerchant();},staff);await page.locator('#walletDesign').waitFor();
  assert.equal(await page.locator('#studioPreviewControls').evaluate(e=>e.open),false);await page.locator('#studioPreviewControls summary').click();await page.locator('#studioCanje').scrollIntoViewIfNeeded();await fit();assert.ok(await page.locator('#simulateWalletRedemption').isHidden());
  await page.locator('#prepareWalletRedemption').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'simulateWalletRedemption');
  await page.keyboard.press('Enter');await both('0 de 5 sellos');assert.equal(await page.evaluate(()=>document.activeElement.id),'restoreWalletSimulation');await page.keyboard.press('Enter');await both('5 sellos disponibles');
  await page.locator('[data-wallet-example=surplus]').click();assert.equal(await page.locator('#studioCanjeBefore').textContent(),'12 sellos');assert.equal(await page.locator('#studioCanjeAfter').textContent(),'7 sellos');
  await page.locator('#studioCanje').scrollIntoViewIfNeeded();await fit();await shot(width+'-canje-before','#studioCanje');await page.locator('#simulateWalletRedemption').click();await both('7 sellos disponibles');assert.equal(await page.locator('#googlePreviewStatus').textContent(),'1 canje');
  await fit();await shot(width+'-canje-after','#studioCanje');assert.ok(await page.locator('#saveDesign').isDisabled());
  await page.locator('[data-preview-provider=both]').click();for(const id of ['appleStampArtwork','googleStampArtwork'])await page.locator('#'+id).evaluate(i=>i.decode());await fit();
  for(const card of ['#designPreview','#googleDesignPreview'])assert.ok(await page.locator(card).evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  if(width===1440 || width===390)await shot(width+'-after-both','.studio-wallet-pair');
  await page.locator('[data-apple-layout=classic]').click();await both('7 sellos disponibles');await fit();
  await page.locator('#studioDetailsPreview summary').click();assert.match(await page.locator('#studioDetailsContent').textContent(),/Saldo para 1 canje/);assert.match(await page.locator('#studioDetailsContent').textContent(),/conservas 2 sellos/);
  await page.locator('#restoreWalletSimulation').click();await both('12 sellos disponibles');
  await page.locator('[data-wallet-example=paused]').click();assert.ok(await page.locator('#simulateWalletRedemption').isHidden());assert.ok(await page.locator('#prepareWalletRedemption').isHidden());assert.equal(await page.locator('#studioCanjeAfter').textContent(),'—');await fit();
 }
 assert.equal(calls.length,4);assert.deepEqual(errors,[]);console.log('WALLET_REDEMPTION_VISUAL_PASS: 320/390/1024/1440, real artwork, keyboard before/after/restore, exact surplus on Apple classic/poster and Google, pause, full conditions and zero mutation requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

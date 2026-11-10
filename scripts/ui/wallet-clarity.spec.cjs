// Real browser and compiled artwork. Only synthetic business data and intercepted requests.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty'),evidence=process.env.LOYALTY_UI_EVIDENCE;
const initial={composition:'PANORAMA',frontFocus:'AUTO',displayName:'Café de barrio',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'p',stampSymbol:'☕',artworkStyle:'GRADIENT',artworkAccent:'#e9b774',welcome:'Bienvenido',usage:'Presenta tu QR en caja para acumular y canjear.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const prize='Café de especialidad y una porción de pastel de la casa';
const staff={role:'OWNER',business:{id:'fiction',name:'Café de barrio',currency:'USD',timezone:'America/Guayaquil'},promotionSuggestions:{category:{id:'CAFE',name:'Cafetería',source:'SELECTED'}},branches:[],programs:[{id:'p',config:{name:'Un café más cerca',kind:'STAMPS',active:true}}],rewards:[{id:'r',programId:'p',active:true,cost:5,name:prize,benefitText:'Canje de un premio en caja.'}]};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const errors=[],calls=[];let design={...initial},version=3,fail=false;
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
  if(u.pathname.startsWith('/wallet/art/')){assert.ok(await require('./wallet-artwork-fixture.cjs')(route,u));return;}
  if(u.pathname.startsWith('/api/')){assert.equal(u.pathname,'/api/staff/wallet-design');calls.push({method:req.method(),payload:req.postDataJSON()});if(req.method()==='PUT'){if(fail)return route.fulfill({status:409,json:{message:'Otra persona guardó cambios.'}});design={...req.postDataJSON().design};version++;}return route.fulfill({json:{version,design}});}
  const name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
 const shot=async(name,selector)=>{if(!evidence)return;fs.mkdirSync(evidence,{recursive:true});await page.locator(selector).screenshot({path:path.join(evidence,name+'.png')});};
 for(const width of [1440,1024,390,320]){
  design={...initial};await page.setViewportSize({width,height:1080});await page.goto('https://loyalty.test/');await page.evaluate(d=>{state.data=d;state.token='fiction';state.tab='design';exit.hidden=false;renderMerchant();},staff);await page.locator('#walletDesign').waitFor();
  await page.locator('[data-studio-step="2"]').click();assert.ok(await page.locator('#saveDesign').isDisabled());
  for(const focus of ['PROGRESS','REWARD']){
   await page.locator(`[data-front-focus=${focus}]`).click();await fit();assert.equal(await page.locator('#studioChangeCount').textContent(),'1 cambio');
   await page.locator('.studio-focus').scrollIntoViewIfNeeded();if(focus==='REWARD')await shot(width+'-native-focus','.studio-focus');
   await page.locator('[data-preview-provider=both]').click();await page.locator('#appleStampArtwork').evaluate(i=>i.decode());await page.locator('#googleStampArtwork').evaluate(i=>i.decode());await fit();
   assert.equal(await page.locator('.signature-copy').evaluate(e=>e.firstElementChild.id),focus==='PROGRESS'?'appleJourney':'previewPrizeWrap');
   assert.equal(await page.locator('.composition-google-row-one').evaluate(e=>e.firstElementChild.className),focus==='PROGRESS'?'wallet-native-journey':'google-preview-headline');
   for(const card of ['#designPreview','#googleDesignPreview'])assert.ok(await page.locator(card).evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   assert.ok(await page.locator('#designPreview').evaluate(e=>{const card=e.getBoundingClientRect(),qr=e.querySelector('.wallet-preview-code').getBoundingClientRect();return qr.top>=card.top+card.width*257/358+12;}),'simulated QR covers poster artwork');
   if(width===1440 || width===390)await shot(width+'-'+focus.toLowerCase()+'-both','.studio-wallet-pair');
   await page.locator('#studioBackToEditing').click();
  }
  await page.locator('#usage').fill('Muestra tu tarjeta en caja. Acumula y consulta tus premios.');
  await page.locator('#studioReviewChanges summary').click();await page.locator('#studioReviewChanges').scrollIntoViewIfNeeded();await fit();await shot(width+'-change-review','#studioReviewChanges');
  await page.locator('[data-review-field=frontFocus]').click();assert.equal(await page.evaluate(()=>document.activeElement.dataset.frontFocus),'REWARD');
  // Real keyboard selection, no reliance on mouse-only controls.
  await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');assert.equal(await page.locator('#frontFocus').inputValue(),'PROGRESS');
  await page.locator('#studioDetailsPreview summary').click();await page.locator('#studioDetailsPreview').scrollIntoViewIfNeeded();await fit();assert.match(await page.locator('#studioDetailsContent').textContent(),new RegExp(prize));await shot(width+'-complete-details','#studioDetailsPreview');
  assert.equal(calls.filter(c=>c.method==='PUT').length,0);
 }
 fail=true;await page.locator('#saveDesign').click();await page.locator('#designSaveError').waitFor();assert.equal(await page.locator('#frontFocus').inputValue(),'PROGRESS');fail=false;await page.locator('#saveDesign').click();await page.waitForFunction(()=>document.querySelector('#designChangeStatus')?.textContent==='Diseño guardado');
 assert.equal(design.frontFocus,'PROGRESS');assert.equal(calls.filter(c=>c.method==='PUT')[1].payload.expectedVersion,3);assert.ok(await page.locator('#studioReviewChanges').isHidden());assert.deepEqual(errors,[]);
 console.log('WALLET_CLARITY_VISUAL_PASS: four widths, native priority on both platforms with real artwork, keyboard editing, optional change review, full details, conflict recovery and versioned save.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Native artwork through local compiled renderer; actual browser UI; synthetic data and intercepted API only.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/web'),evidence=process.env.LOYALTY_UI_EVIDENCE;
const initial={composition:'PANORAMA',displayName:'Café de barrio',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'p',stampSymbol:'☕',artworkStyle:'GRADIENT',artworkAccent:null,welcome:'Bienvenido',usage:'Presenta tu QR en caja.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de barrio',currency:'USD',timezone:'America/Guayaquil'},promotionSuggestions:{category:{id:'CAFE',name:'Cafetería',source:'SELECTED'}},branches:[],programs:[{id:'p',config:{name:'Puntos por compra',kind:'POINTS',active:true}}],rewards:[{id:'r',programId:'p',active:true,cost:100,name:'Café de cortesía'}]};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const errors=[],calls=[];let design={...initial},version=8,failSave=false;
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
  if(u.pathname.startsWith('/wallet/art/')){assert.ok(await require('./wallet-artwork-fixture.cjs')(route,u));return;}
  if(u.pathname.startsWith('/api/')){assert.equal(u.pathname,'/api/staff/wallet-design');calls.push({method:req.method(),payload:req.postDataJSON()});if(req.method()==='PUT'){if(failSave)return route.fulfill({status:409,json:{message:'Otra persona guardó cambios.'}});design={...req.postDataJSON().design};version++;}return route.fulfill({json:{version,design}});}
  const name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'horizontal overflow');
 const shot=async(name,selector)=>{if(!evidence)return;fs.mkdirSync(evidence,{recursive:true});await page.locator(selector).screenshot({path:path.join(evidence,name+'.png')});};
 for(const width of [1440,1024,390,320]){
  design={...initial};await page.setViewportSize({width,height:1080});await page.goto('https://loyalty.test/');await page.evaluate(d=>{state.data=d;state.token='fiction';state.tab='design';exit.hidden=false;renderMerchant();},staff);await page.locator('#walletDesign').waitFor();
  assert.equal(await page.locator('#saveDesign').isEnabled(),false);assert.equal(await page.locator('[data-wallet-look]').count(),3);
  assert.equal(await page.locator('.studio-savebar').evaluate(e=>getComputedStyle(e).position),'static');
  await page.locator('.studio-looks').scrollIntoViewIfNeeded();for(const image of await page.locator('[data-wallet-look] img').all())await image.evaluate(i=>i.decode());await fit();await shot(width+'-identity-choices','.studio-looks');
  for(const id of ['0','1','2']){
   await page.locator(`[data-wallet-look="${id}"]`).click();assert.equal(await page.locator('#displayName').inputValue(),initial.displayName);assert.equal(await page.locator('#featuredProgramId').inputValue(),'p');
   await page.locator('[data-preview-provider=both]').click();await page.locator('#appleStampArtwork').evaluate(i=>i.decode());await page.locator('#googleStampArtwork').evaluate(i=>i.decode());await fit();
   for(const card of ['#designPreview','#googleDesignPreview'])assert.equal(await page.locator(card).evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
   if(width===1440 || width===390)await shot(width+'-identity-look-'+id,'.studio-wallet-pair');
   const apple=await page.locator('#appleStampArtwork').getAttribute('src'),google=await page.locator('#googleStampArtwork').getAttribute('src');assert.equal(apple.split('?')[0],google);
   await page.locator('#studioBackToEditing').click();
  }
  await page.locator('#undoWalletLook').click();assert.equal(await page.locator('#composition').inputValue(),'EDITORIAL');await page.locator('#restoreDesign').click();assert.equal(await page.locator('#saveDesign').isEnabled(),false);
  await page.locator('[data-studio-step="1"]').click();await page.locator('#autoArtworkAccent').uncheck();await page.locator('#artworkAccent').fill('#0b1f3a');assert.match(await page.locator('#artworkAccentStatus').textContent(),/se ajusta/);await page.locator('.studio-accent').scrollIntoViewIfNeeded();await fit();await shot(width+'-identity-accent','.studio-accent');
  await page.locator('#artworkAccent').fill('#77dddd');assert.match(await page.locator('#artworkAccentStatus').textContent(),/sin ajustes/);assert.equal(await page.locator('#saveDesign').isEnabled(),true);
  // Full keyboard operation and draft guard includes the custom color.
  await page.locator('#exit').click();assert.equal(await page.locator('#studioLeaveDialog').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#artworkAccent').inputValue(),'#77dddd');
  assert.equal(calls.filter(c=>c.method==='PUT').length,0);
 }
 failSave=true;await page.locator('#saveDesign').click();await page.locator('#designSaveError').waitFor();assert.equal(await page.locator('#artworkAccent').inputValue(),'#77dddd');failSave=false;await page.locator('#saveDesign').click();await page.waitForFunction(()=>document.querySelector('#designChangeStatus')?.textContent==='Diseño guardado');assert.equal(design.artworkAccent,'#77dddd');assert.equal(calls.filter(c=>c.method==='PUT')[1].payload.expectedVersion,8);assert.equal(await page.locator('#studioStep1').isVisible(),true);
 await page.locator('#autoArtworkAccent').check();await page.locator('#saveDesign').click();await page.waitForFunction(()=>document.querySelector('#designChangeStatus')?.textContent==='Diseño guardado');assert.equal(design.artworkAccent,null);assert.equal(calls.filter(c=>c.method==='PUT').at(-1).payload.expectedVersion,9);assert.deepEqual(errors,[]);
 console.log('WALLET_IDENTITY_VISUAL_PASS: real artwork for three category combinations in four widths, both providers, custom contrast, appearance undo, guarded draft, conflict and versioned save.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

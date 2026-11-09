// Genuine server images, fictional data, fully intercepted requests. No purchases or live credentials.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/web'),artifacts=process.env.LOYALTY_ARTWORK_EVIDENCE,evidence=process.env.LOYALTY_UI_EVIDENCE;
const design={displayName:'Café de ejemplo',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'points',stampSymbol:'☕',artworkStyle:'GRADIENT',welcome:'Bienvenido',usage:'Presenta tu QR en caja.',birthdayMessage:'¡Feliz cumpleaños!',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[
 {id:'stamps',config:{name:'Cada visita cuenta',kind:'STAMPS',active:true}},
 {id:'points',config:{name:'Puntos de compras',kind:'POINTS',active:true}}],rewards:[
 {id:'r1',programId:'stamps',active:true,cost:6,name:'Café de cortesía'},
 {id:'r2',programId:'points',active:true,cost:100,name:'Café de cortesía'}]};
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const calls=[],errors=[],checks=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/wallet/art/')){
    let file=path.join(artifacts,u.pathname.slice(1)+'.'+(u.searchParams.get('layout')||'google')+'.png');
    const sample=u.pathname.match(/^\/wallet\/art\/v29\/(\w+)\/GRADIENT\/5\/0b1f3a\/(\d+)\/(\d+)\.png$/);
    if(!fs.existsSync(file) && sample)file=path.join(process.env.LOYALTY_COMPOSITION_EVIDENCE || artifacts,`${sample[1]}-${sample[2]}-${sample[3]}-${u.searchParams.get('layout')||'google'}.png`);
    assert.ok(fs.existsSync(file),'Missing native image '+file);
    return route.fulfill({body:fs.readFileSync(file),contentType:'image/png'});
   }
   if(u.pathname.startsWith('/api/')){
    calls.push({method:req.method(),path:u.pathname,payload:req.postDataJSON()});assert.equal(u.pathname,'/api/staff/wallet-design');
    if(req.method()==='PUT')Object.assign(design,req.postDataJSON().design);
    return route.fulfill({json:{design,version:9}});
   }
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const rendered=async id=>page.locator(id).evaluate(async image=>{await image.decode();});
  const shot=async(name,selector)=>{if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.locator(selector).screenshot({path:path.join(evidence,name+'.png')});}};
  await page.goto('https://loyalty.test/');await page.evaluate(data=>{state.data=data;state.tab='design';state.token='FICTION';renderMerchant();},staff);await page.locator('#walletDesign').waitFor();
  await page.locator('[data-wallet-example=half]').click();
  for(const style of ['GRADIENT','AURORA','SOLID']){
   await page.locator('#artworkStyle').selectOption(style);await rendered('#appleStampArtwork');
   assert.match(await page.locator('#appleStampArtwork').getAttribute('src'),/\/v29\/SIGNATURE\/.*layout=poster/);
   assert.equal(await page.locator('#appleJourneyValue').textContent(),'50 de 100 puntos');
   assert.equal(await page.locator('#appleJourneyLabel').textContent(),'Faltan 50 puntos');
   assert.equal(await page.locator('#saveDesign').isEnabled(),true);
   assert.equal(await page.locator('#displayName').inputValue(),'Café de ejemplo');
   await shot('v027-apple-'+style,'#designPreview');
   await page.locator('[data-preview-provider=google]').click();await rendered('#googleStampArtwork');
   assert.equal(await page.locator('#googlePreviewStatus').textContent(),'50 puntos');
   assert.equal(await page.locator('#googlePreviewReward').textContent(),'Café de cortesía');
   await shot('v027-google-'+style,'#googleDesignPreview');
   await page.locator('[data-preview-provider=apple]').click();
  }
  checks.push('Three real finishes, matching native values and brand preserved on both platforms');
  await page.locator('#artworkStyle').selectOption('GRADIENT');await page.locator('[data-apple-layout=classic]').click();await rendered('#appleStampArtwork');
  assert.match(await page.locator('#appleStampArtwork').getAttribute('src'),/layout=apple/);
  assert.match(await page.locator('#previewPlatformHint').textContent(),/versiones anteriores/);
  assert.equal(await page.locator('#appleJourneyValue').textContent(),'50 de 100 puntos');await shot('v027-apple-classic','#designPreview');
  await page.locator('[data-apple-layout=poster]').click();await page.locator('#featuredProgramId').selectOption('stamps');await page.locator('[data-wallet-example=progress]').click();await rendered('#appleStampArtwork');
  assert.equal(await page.locator('#appleJourneyValue').textContent(),'5 de 6 sellos');assert.equal(await page.locator('#appleJourneyLabel').textContent(),'Falta 1 sello');
  await shot('v027-apple-stamps','#designPreview');
  await page.locator('[data-wallet-example=paused]').click();await rendered('#appleStampArtwork');assert.match(await page.locator('#appleStampArtwork').getAttribute('src'),/\/0\/0.png/);
  assert.equal(await page.locator('#appleJourney').isVisible(),false);assert.equal(await page.locator('#previewStatus').textContent(),'Pausada');
  checks.push('Classic fallback, single-stamp guidance and paused art without stale progress');
  await page.locator('[data-wallet-example=progress]').click();
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   for(const provider of ['apple','google']){
    await page.locator(`[data-preview-provider=${provider}]`).click();await rendered(provider==='apple'?'#appleStampArtwork':'#googleStampArtwork');
    const container=provider==='apple'?'#designPreview':'#googleDesignPreview';
    assert.equal(await page.locator(container).evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    if(width===390)await shot('v027-mobile-'+provider,container);
   }
  }
  assert.equal(calls.filter(c=>c.method!=='GET').length,0);
  await page.locator('#artworkStyle').selectOption('AURORA');await page.locator('#saveDesign').click();await page.locator('#walletDesign').waitFor();
  const saved=calls.filter(c=>c.method==='PUT');assert.equal(saved.length,1);assert.equal(saved[0].payload.expectedVersion,9);assert.equal(saved[0].payload.design.artworkStyle,'AURORA');
  for(const key of ['appleLayout','previewProvider','example'])assert.equal(Object.hasOwn(saved[0].payload.design,key),false);
  assert.deepEqual(errors,[]);checks.push('320px/390px layouts and explicit versioned save; simulation never records operations');
  console.log(JSON.stringify({status:'WALLET_SIGNATURE_UI_PASS',checks},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exit(1);});

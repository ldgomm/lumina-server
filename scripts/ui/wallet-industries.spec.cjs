// New styles, accessible progress and explicit saves. All network requests are intercepted.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/web'),artifacts=process.env.LOYALTY_ARTWORK_EVIDENCE,evidence=process.env.LOYALTY_UI_EVIDENCE;
const design={displayName:'Mi negocio',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'stamps',stampSymbol:'★',artworkStyle:'GRADIENT',welcome:'Bienvenido',usage:'Presenta tu QR en caja.',birthdayMessage:'¡Feliz cumpleaños!',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Mi negocio',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[
 {id:'stamps',config:{name:'Cada visita cuenta',kind:'STAMPS',active:true}},
 {id:'points',config:{name:'Puntos de compras',kind:'POINTS',active:true}},
 {id:'cash',config:{name:'Cashback',kind:'CASHBACK',active:true}}],rewards:[
 {id:'r1',programId:'stamps',active:true,cost:5,name:'Tu premio favorito'},
 {id:'r2',programId:'points',active:true,cost:100,name:'Premio por puntos'},
 {id:'r3',programId:'cash',active:true,cost:500,name:'Beneficio de 5 USD'}]};
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const calls=[],errors=[],checks=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/wallet/art/')){
    const file=path.join(artifacts,u.pathname.slice(1)+'.'+(u.searchParams.get('layout')||'google')+'.png');
    assert.ok(fs.existsSync(file),'Missing native image '+u.pathname);
    return route.fulfill({body:fs.readFileSync(file),contentType:'image/png'});
   }
   if(u.pathname.startsWith('/api/')){
    calls.push({method:req.method(),path:u.pathname,payload:req.postDataJSON()});
    assert.equal(u.pathname,'/api/staff/wallet-design');
    if(req.method()==='PUT')Object.assign(design,req.postDataJSON().design);
    return route.fulfill({json:{design,version:9}});
   }
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const visible=()=>page.locator('[data-wallet-style]:visible');
  const rendered=async id=>{await page.locator(id).evaluate(async image=>{await image.decode();});};
  const shot=async(name,selector)=>{if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.locator(selector).screenshot({path:path.join(evidence,name+'.png')});}};
  const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.goto('https://loyalty.test/');await page.evaluate(data=>{state.data=data;state.tab='design';state.token='FICTION';renderMerchant();},staff);await page.locator('#walletDesign').waitFor();
  assert.equal(await page.locator('[data-wallet-style]').count(),32);assert.equal(await visible().count(),8);assert.equal(await page.locator('#stampSymbol option').count(),33);
  await page.locator('#walletStylesMore').click();assert.equal(await visible().count(),32);
  const ids=await page.locator('[data-wallet-style]').evaluateAll(buttons=>buttons.map(b=>b.dataset.walletStyle));
  for(const id of ids){
   await page.locator(`[data-wallet-style=${id}]`).click();await rendered('#appleStampArtwork');
   assert.equal(await page.locator('#saveDesign').isEnabled(),true,'contrast '+id);
   assert.equal(await page.locator(`[data-wallet-style=${id}]`).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#displayName').inputValue(),'Mi negocio');assert.equal(await page.locator('#usage').inputValue(),'Presenta tu QR en caja.');
   assert.equal(await page.locator('#featuredProgramId').inputValue(),'stamps');
  }
  assert.equal(calls.filter(x=>x.method!=='GET').length,0);checks.push('All 32 styles render genuine server artwork with readable colors; no operation or auto-save');
  await page.locator('#walletStyleSearch').fill('telefonia');assert.equal(await visible().count(),1);assert.equal(await visible().getAttribute('data-wallet-style'),'phone');
  await page.locator('#walletStyleSearch').fill('electrodomesticos');assert.equal(await visible().getAttribute('data-wallet-style'),'electronics');
  await page.locator('#walletStyleSearch').fill('xyz-unavailable');assert.equal(await visible().count(),0);assert.match(await page.locator('#walletStyleResults').textContent(),/Prueba otra palabra/);
  await page.locator('#walletStyleSearch').fill('');await page.locator('#walletStyleGroup').selectOption('Mascotas');assert.equal(await visible().count(),1);
  await visible().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#stampSymbol').inputValue(),'🐾');
  await page.locator('#walletStyleGroup').selectOption('');await page.locator('#walletStylesMore').click();assert.equal(await visible().count(),8);
  checks.push('Accent-insensitive and synonym search, category filters, empty state and keyboard selection');
  await page.locator('[data-wallet-style=coffee]').click();await page.locator('[data-wallet-example=new]').click();
  assert.equal(await page.locator('#appleJourneyValue').textContent(),'0 de 5 sellos');await rendered('#appleStampArtwork');
  await page.locator('[data-wallet-example=progress]').click();assert.equal(await page.locator('#appleJourneyValue').textContent(),'4 de 5 sellos');assert.match(await page.locator('#walletProgressNext').textContent(),/1 sello/);await rendered('#appleStampArtwork');await shot('v024-apple-coffee','#designPreview');
  await page.locator('[data-preview-provider=google]').click();assert.equal(await page.locator('#googleJourneyValue').textContent(),'4 de 5 sellos');await rendered('#googleStampArtwork');await shot('v024-google-coffee','#googleDesignPreview');
  await page.locator('[data-wallet-style=navy]').click();await page.locator('#featuredProgramId').selectOption('cash');await page.locator('[data-wallet-example=half]').click();
  assert.equal(await page.locator('#googleJourneyValue').textContent(),'2.50 de 5.00 USD');assert.equal(await page.locator('#googlePreviewStatus').textContent(),'2.50 USD');assert.match(await page.locator('#googleStampArtwork').getAttribute('src'),/\/50\/100.png$/);await rendered('#googleStampArtwork');await shot('v024-google-cashback','#googleDesignPreview');
  await page.locator('[data-preview-provider=apple]').click();assert.equal(await page.locator('#appleJourneyValue').textContent(),'2.50 de 5.00 USD');await rendered('#appleStampArtwork');await shot('v024-apple-cashback','#designPreview');
  await page.locator('#featuredProgramId').selectOption('points');assert.equal(await page.locator('#appleJourneyValue').textContent(),'50 de 100 puntos');
  await page.locator('[data-wallet-example=ready]').click();assert.equal(await page.locator('#appleJourneyLabel').textContent(),'META ALCANZADA');assert.match(await page.locator('#walletProgressNext').textContent(),/Confirma el canje en caja/);
  await page.locator('[data-wallet-example=paused]').click();assert.equal(await page.locator('#appleJourney').isVisible(),false);assert.equal(await page.locator('#googleJourney').isVisible(),false);assert.equal(await page.locator('#walletProgressLegend').isVisible(),false);assert.equal(await page.locator('#appleStampArtwork').isVisible(),true);
  checks.push('Exact current, target and remaining units across both providers; zero, halfway, near, ready and paused states');
  await page.locator('#featuredProgramId').selectOption('stamps');await page.locator('[data-wallet-example=progress]').click();await page.locator('[data-wallet-style=pet]').click();
  await rendered('#appleStampArtwork');await shot('v024-desktop','.wallet-design-panel');await shot('v024-catalog','.wallet-style-presets');
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await fit();await page.locator('#walletStyleSearch').fill('');if(width===390)await shot('v024-mobile','.design-preview-wrap');}
  assert.equal(calls.filter(x=>x.method!=='GET').length,0);
  await page.locator('#saveDesign').click();await page.locator('#walletDesign').waitFor();
  const saved=calls.filter(x=>x.method==='PUT');assert.equal(saved.length,1);assert.equal(saved[0].payload.design.stampSymbol,'🐾');assert.equal(saved[0].payload.design.featuredProgramId,'stamps');assert.equal(saved[0].payload.expectedVersion,9);
  for(const field of ['example','walletStyleSearch','walletStyleGroup','showAllStyles'])assert.equal(Object.hasOwn(saved[0].payload.design,field),false);
  assert.deepEqual(errors,[]);checks.push('320px and 390px layouts; one explicit versioned save with no preview or search state in payload');
  console.log(JSON.stringify({status:'WALLET_INDUSTRIES_UI_PASS',checks},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exit(1);});

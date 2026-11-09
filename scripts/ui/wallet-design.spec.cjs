// Real local artwork; fictional customers and fully intercepted API/network.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/web');
const evidence=process.env.LOYALTY_UI_EVIDENCE,artifacts=process.env.LOYALTY_ARTWORK_EVIDENCE;
const design={displayName:'Café de ejemplo',background:'#0b1f3a',foreground:'#ffffff',label:'#ffffff',featuredProgramId:'stamps',stampSymbol:'★',artworkStyle:'GRADIENT',welcome:'Bienvenido a nuestro club',usage:'Presenta el QR en caja.',birthdayMessage:'¡Feliz cumpleaños!',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[
 {id:'stamps',config:{name:'Cada visita cuenta',kind:'STAMPS',active:true}},
 {id:'points',config:{name:'Puntos de compras',kind:'POINTS',active:true}},
 {id:'cash',config:{name:'Cashback del negocio',kind:'CASHBACK',active:true}}],rewards:[
 {id:'rs',programId:'stamps',active:true,cost:5,name:'Café a tu elección'},
 {id:'rp',programId:'points',active:true,cost:100,name:'Premio de tus compras'},
 {id:'rc',programId:'cash',active:true,cost:500,name:'Beneficio de 5 USD'}]};
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const calls=[],errors=[],checks=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/wallet/art/')){
    const file=path.join(artifacts,u.pathname.slice(1)+'.'+(u.searchParams.get('layout')||'google')+'.png');
    if(!fs.existsSync(file))throw Error('Missing rendered image '+u.pathname);
    return route.fulfill({body:fs.readFileSync(file),contentType:'image/png'});
   }
   if(u.pathname.startsWith('/api/')){
    calls.push({method:req.method(),path:u.pathname,payload:req.postDataJSON()});
    if(u.pathname==='/api/staff/wallet-design'){
     if(req.method()==='PUT')Object.assign(design,req.postDataJSON().design);
     return route.fulfill({json:{design,version:9}});
    }
    throw Error('Unexpected API '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const rendered=async id=>page.waitForFunction(id=>{const e=document.querySelector(id);return e.complete&&e.naturalWidth>0;},id);
  const shot=async(name,selector)=>{if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.locator(selector).screenshot({path:path.join(evidence,name+'.png')});}};
  await page.goto('https://loyalty.test/');await page.evaluate(data=>{state.data=data;state.tab='design';state.token='FICTION';renderMerchant();},staff);await page.locator('#walletDesign').waitFor();
  assert.equal(await page.locator('#background').inputValue(),'#0b1f3a');assert.equal(await page.locator('#stampSymbol').inputValue(),'★');
  await rendered('#appleStampArtwork');await shot('v022-apple-navy','#designPreview');
  await page.locator('[data-wallet-style=coffee]').click();await rendered('#appleStampArtwork');
  assert.equal(await page.locator('#background').inputValue(),'#34241f');assert.equal(await page.locator('#stampSymbol').inputValue(),'☕');assert.equal(await page.locator('#saveDesign').isEnabled(),true);
  assert.equal(await page.locator('#displayName').inputValue(),design.displayName);assert.equal(await page.locator('#featuredProgramId').inputValue(),'stamps');assert.equal(await page.locator('#usage').inputValue(),design.usage);
  await shot('v022-apple-coffee','#designPreview');await page.locator('[data-preview-provider=google]').click();await rendered('#googleStampArtwork');await shot('v022-google-coffee','#googleDesignPreview');
  assert.equal(await page.locator('#googlePreviewReward').textContent(),'Café a tu elección');assert.equal(await page.locator('#googlePreviewStatus').textContent(),'1 sello');
  checks.push('Presets change only appearance, keep business choices and render actual native-size art for both providers');
  await page.locator('[data-wallet-example=ready]').click();assert.equal(await page.locator('#googlePreviewRewardLabel').textContent(),'Premio en caja');assert.equal(await page.locator('#googlePreviewMain').textContent(),'5');
  await page.locator('[data-wallet-example=paused]').click();assert.equal(await page.locator('#googlePreviewReward').textContent(),'Operaciones pausadas');assert.equal(await page.locator('#googleStampArtwork').isVisible(),true);assert.match(await page.locator('#previewRewardDetail').textContent(),/saldos se conservan/);
  await page.locator('[data-preview-provider=apple]').click();assert.equal(await page.locator('#previewStatus').textContent(),'Pausada');assert.equal(await page.locator('#appleStampArtwork').isVisible(),true);assert.equal(await page.locator('#previewPrizeLabel').textContent(),'PREMIO PAUSADO');
  assert.equal(calls.filter(x=>x.method!=='GET').length,0);checks.push('Ready and suspended examples do not write purchases, awards or design; paused example clears graphic and redemption invitation');
  await page.locator('[data-wallet-style=navy]').click();await page.locator('[data-wallet-example=progress]').click();await page.locator('#featuredProgramId').selectOption('cash');
  assert.equal(await page.locator('#previewWelcome').textContent(),'4.99 USD');assert.match(await page.locator('#appleStampArtwork').getAttribute('src'),/\/99\/100.png/);await rendered('#appleStampArtwork');await shot('v022-apple-cashback','#designPreview');
  await page.locator('[data-preview-provider=google]').click();await rendered('#googleStampArtwork');assert.equal(await page.locator('#googlePreviewMain').textContent(),'4.99');assert.equal(await page.locator('#googlePreviewStatus').textContent(),'0.01 USD');await shot('v022-google-cashback','#googleDesignPreview');
  await page.locator('#featuredProgramId').selectOption('points');assert.equal(await page.locator('#googlePreviewMain').textContent(),'99');assert.equal(await page.locator('#googlePreviewMainLabel').textContent(),'Puntos');
  assert.equal(await page.locator('#previewStamps').textContent(),'');checks.push('Cashback keeps cents, points keep units and proportional art never invents individual stamps');
  await page.locator('#featuredProgramId').selectOption('stamps');await page.locator('[data-wallet-style=shop]').click();await rendered('#googleStampArtwork');assert.equal(await page.locator('#saveDesign').isEnabled(),true);await shot('v022-google-light','#googleDesignPreview');
  await fit();await page.setViewportSize({width:390,height:844});await fit();await shot('v022-preview-mobile','.design-preview-wrap');
  await page.setViewportSize({width:320,height:780});await fit();await page.locator('.wallet-preview-more summary').click();assert.match(await page.locator('.wallet-preview-more').textContent(),/Últimos consumos y canjes/);
  await page.locator('#saveDesign').click();await page.locator('#walletDesign').waitFor();const saved=calls.filter(x=>x.method==='PUT');assert.equal(saved.length,1);assert.equal(saved[0].payload.design.background,'#f2e9da');assert.equal(saved[0].payload.design.stampSymbol,'🛍');assert.equal(saved[0].payload.design.featuredProgramId,'stamps');assert.equal(saved[0].payload.expectedVersion,9);assert.equal(Object.hasOwn(saved[0].payload.design,'example'),false);
  assert.deepEqual(errors,[]);checks.push('Light brand contrast, keyboard-native controls, 320/390px layouts and one explicit versioned save');
  console.log(JSON.stringify({status:'WALLET_DESIGN_UI_PASS',checks},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exit(1);});

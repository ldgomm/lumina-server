// Optional visual validation in a development environment with Playwright and a local artifact server.
// All data is fictional; all network requests are intercepted. The production server does not need Node.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/web'),artifacts=process.env.LOYALTY_COMPOSITION_EVIDENCE;
const compositions=['PANORAMA','PRECISION','ATELIER','EDITORIAL','STAMPBOOK','TICKET','MOSAIC','RIBBON','PATH','SIGNATURE'];
const design={displayName:'Café de ejemplo',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'p',stampSymbol:'☕',artworkStyle:'GRADIENT',welcome:'Bienvenido',usage:'Presenta tu QR.',birthdayMessage:'Feliz cumpleaños',logoPng:null,composition:'EDITORIAL'};
const data={role:'OWNER',business:{id:'fiction',name:'Café de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[{id:'p',config:{name:'Puntos',kind:'POINTS',active:true}}],rewards:[{id:'r',programId:'p',active:true,cost:100,name:'Premio de ejemplo'}]};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const errors=[],calls=[];try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
  if(u.pathname.startsWith('/wallet/art/')){
    if(await require('./wallet-artwork-fixture.cjs')(route,u))return;
   const match=u.pathname.match(/^\/wallet\/art\/v30\/(\w+)\/GRADIENT\/5\/0b1f3a\/(\d+)\/(\d+)\.png$/);assert.ok(match,u.pathname);
   const file=path.join(artifacts,`${match[1]}-${match[2]}-${match[3]}-${u.searchParams.get('layout')||'google'}.png`);
   return route.fulfill({body:fs.readFileSync(file),contentType:'image/png'});
  }
  if(u.pathname.startsWith('/api/')){assert.equal(u.pathname,'/api/staff/wallet-design');calls.push(req.method());return route.fulfill({json:{version:1,design}});}
  const name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
  let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
  return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://loyalty.test');await page.evaluate(d=>{state.data=d;state.token='fake';state.tab='design';renderMerchant();},data);await page.locator('#walletDesign').waitFor();await page.locator('#compositionMore').click();await page.locator('[data-wallet-example=half]').click();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1080});
  if(process.env.LOYALTY_UI_EVIDENCE){fs.mkdirSync(process.env.LOYALTY_UI_EVIDENCE,{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>[...document.querySelectorAll('[data-composition] img')].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.top<innerHeight&&r.bottom>0}).every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:path.join(process.env.LOYALTY_UI_EVIDENCE,`${width}-studio.png`)});}
  for(const c of compositions){await page.locator(`button[data-composition=${c}]`).click();
   for(const provider of ['apple','google']){
    await page.locator(`[data-preview-provider=${provider}]`).click();const card=page.locator(provider==='apple'?'#designPreview':'#googleDesignPreview');const art=page.locator(provider==='apple'?'#appleStampArtwork':'#googleStampArtwork');await art.evaluate(img=>img.decode());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(await card.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    if(process.env.LOYALTY_UI_EVIDENCE){fs.mkdirSync(process.env.LOYALTY_UI_EVIDENCE,{recursive:true});await card.screenshot({path:path.join(process.env.LOYALTY_UI_EVIDENCE,`${width}-${c}-${provider}.png`)});}
   }
  }
 }
 await page.locator('#jumpToPreview').click();assert.equal(await page.locator('#studioPreview').evaluate(e=>e===document.activeElement),true);
 await page.locator('#jumpToDesign').click();assert.equal(await page.locator('#displayName').evaluate(e=>e===document.activeElement),true);
 assert.ok(calls.every(c=>c==='GET'));assert.deepEqual(errors,[]);console.log('WALLET_COMPOSITION_VISUAL_PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

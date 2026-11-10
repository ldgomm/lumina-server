// Real browser + compiled Kotlin artwork. Business data and API responses are fictional.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/web'),evidence=process.env.LOYALTY_UI_EVIDENCE;
const initial={composition:'ATELIER',frontFocus:'REWARD',displayName:'Café de barrio',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'s',featuredRewardId:null,stampSymbol:'☕',artworkStyle:'GRADIENT',artworkAccent:'#e9b774',welcome:'Bienvenido',usage:'Presenta tu QR en caja.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de barrio',currency:'USD',timezone:'America/Guayaquil'},promotionSuggestions:{category:{id:'CAFE',name:'Cafetería',source:'SELECTED'}},branches:[],programs:[{id:'s',config:{name:'Momentos de café',kind:'STAMPS',active:true}},{id:'p',config:{name:'Club de puntos',kind:'POINTS',active:true}}],rewards:[{id:'r1',programId:'s',active:true,cost:5,name:'Un café de especialidad'},{id:'r2',programId:'s',active:true,cost:12,name:'Café para compartir',benefitText:'Dos cafés de la casa.'},{id:'r3',programId:'s',active:false,cost:3,name:'Premio pausado'},{id:'r4',programId:'p',active:true,cost:200,name:'Premio por 200 puntos'}]};
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
  await page.locator('[data-studio-step="2"]').click();await page.locator('#featuredRewardId').selectOption('r2');await both('11 de 12 sellos');
  assert.equal(await page.locator('#studioFeaturedName').textContent(),'Café para compartir');assert.match(await page.locator('#studioFeaturedRule').textContent(),/12 sellos para canjear/);assert.equal(await page.locator('#featuredRewardId option').count(),3);
  await page.locator('.studio-reward-choice').scrollIntoViewIfNeeded();await fit();await shot(width+'-reward-choice','.studio-reward-choice');
  await page.locator('#useAutomaticReward').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'featuredRewardId');await both('4 de 5 sellos');
  await page.locator('#featuredRewardId').selectOption('r2');await page.locator('[data-preview-provider=both]').click();
  for(const id of ['appleStampArtwork','googleStampArtwork'])await page.locator('#'+id).evaluate(i=>i.decode());await both('11 de 12 sellos');await fit();
  for(const card of ['#designPreview','#googleDesignPreview'])assert.ok(await page.locator(card).evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  if(width===1440 || width===390)await shot(width+'-featured-both','.studio-wallet-pair');
  await page.locator('#studioPreviewControls summary').click();await page.locator('[data-apple-layout=classic]').click();await both('11 de 12 sellos');
 await page.locator('[data-wallet-example=surplus]').click();await page.locator('#simulateWalletRedemption').click();await both('18 sellos disponibles');
  await page.locator('#studioBackToEditing').click();await page.locator('[data-studio-step="2"]').click();await page.locator('#featuredProgramId').selectOption('p');assert.equal(await page.locator('#featuredRewardId').inputValue(),'');await both('199 de 200 puntos');assert.ok(await page.locator('#restoreWalletSimulation').isHidden());
  await page.locator('#restoreDesign').click();assert.equal(await page.locator('#featuredRewardId').inputValue(),'');assert.equal(await page.locator('#featuredProgramId').inputValue(),'s');assert.ok(await page.locator('#saveDesign').isDisabled());await fit();
 }
 assert.equal(calls.length,4);assert.deepEqual(errors,[]);console.log('WALLET_FEATURED_REWARD_VISUAL_PASS: 320/390/1024/1440, compiled artwork, named reward and goal on Apple classic/poster + Google, keyboard automatic reset, program reset, restored choices, zero mutation requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

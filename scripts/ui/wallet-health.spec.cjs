'use strict';
// Real browser, synthetic customers and intercepted network; never touches a live business.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/web'),business={id:'demo',name:'Café Aurora',currency:'USD',timezone:'America/Guayaquil',joinedAt:'2026-01-01',tenureDays:314},staff={role:'OWNER',business,branches:[],programs:[],rewards:[]};
const at='2026-11-10T18:00:00Z';
const initial=()=>[
 {memberId:'carla',name:'Carla Gómez',provider:'GOOGLE',state:'RETRYING',errorCode:'GOOGLE_OBJECT_503',attempts:2,canRetry:true},
 {memberId:'carla',name:'Carla Gómez',provider:'APPLE',state:'NEEDS_CONNECTION',canRetry:false},
 {memberId:'mateo',name:'Mateo Salas',provider:'APPLE',state:'PENDING',canRetry:true},
 {memberId:'ana',name:'Ana López',provider:'GOOGLE',state:'PROVIDER_ACCEPTED',canRetry:true,lastAcceptedAt:at},
 {memberId:'pedro',name:'Pedro Vera',provider:'GOOGLE',state:'NOT_CONFIGURED',canRetry:false},
 {memberId:'new',name:'<img src=x onerror=alert(1)>',provider:'APPLE',state:'NOT_ISSUED',canRetry:false}
].map(r=>({tag:21,snapshotAt:at,nextAttemptAt:at,lastAcceptedAt:null,lastRequestedAt:null,retryAfter:null,attempts:0,errorCode:null,...r}));
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const errors=[],calls=[];let rows=initial(),failLoad=false,failRetry=false,delay=false,release;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/api/')){
    const body=req.postDataJSON();calls.push({url:u.pathname,query:u.search,method:req.method(),body,key:req.headers()['idempotency-key']});const ok=json=>route.fulfill({json});
    if(u.pathname.endsWith('/wallet-health')){
     if(failLoad)return route.fulfill({status:503,json:{code:'UNAVAILABLE',message:'No se pudo consultar. Intenta de nuevo.'}});
     const selected=rows.filter(r=>(!u.searchParams.get('q')||r.name.includes(u.searchParams.get('q')))&&(!u.searchParams.get('provider')||u.searchParams.get('provider')==='ALL'||u.searchParams.get('provider')===r.provider));
     const d={business,asOf:at,configuration:{apple:true,google:true},summary:{total:selected.length,attention:3,pending:1,accepted:1,unissued:1},items:selected,hasMore:false,recentRequests:[],deviceVerification:'NOT_OBSERVED',httpsVerification:'NOT_CHECKED'};
     if(delay){release=()=>ok(d);return;}return ok(d);
    }
    if(u.pathname.endsWith('/retry')){
     if(failRetry)return route.fulfill({status:503,json:{code:'UNAVAILABLE',message:'No se pudo completar. Conserva el motivo y reintenta.'}});
     const item=rows.find(r=>u.pathname.includes('/'+r.memberId+'/'+r.provider+'/'));item.canRetry=false;item.lastRequestedAt=at;item.retryAfter='2026-11-10T18:01:00Z';return ok({status:'QUEUED'});
    }
    if(u.pathname==='/api/staff/access')return ok({canOperate:true});
    if(u.pathname==='/api/platform/overview')return ok({summary:{businesses:1,branches:1,clients:4,newClients:2,purchases:10,redemptions:2},currencies:[],businesses:[{...business,state:'ACTIVE',clients:4,buyers:3,purchases:10,paidMinor:10000,rewards:2}],total:1,hasMore:false});
    if(u.pathname.endsWith('/account'))return ok({business,access:{effectiveState:'ACTIVE'},summary:{balanceMinor:0,overdueMinor:0,nextDueOn:null,invoiceCount:0},today:'2026-11-10',membership:null,invoices:[],payments:[],paymentCount:0,notices:[]});
    if(u.pathname.endsWith('/customer-activity'))return ok({summary:{registeredCustomers:4,periodBuyers:3,periodSpentMinor:10000,periodClaimedRewards:2},customers:[],total:0,hasMore:false,timezone:business.timezone});
    throw Error('Unexpected API '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname==='/platform'?'platform.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});let data=fs.readFileSync(path.join(web,name));
   if(name==='index.html')data=data.toString().replace('</head>','<link rel="stylesheet" href="/commercial.css"><script src="/commercial.js" defer></script><script src="/promotion-editor.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   if(name==='platform.html')data=data.toString().replace('</head>','<script src="/experience.js" defer></script></head>');
   return route.fulfill({body:data,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const show=async(role='OWNER')=>page.evaluate(({staff,role})=>{state.data={...staff,role};state.token='FICTIONAL-OWNER';state.tab=role==='OWNER'?'walletHealth':'sales';exit.hidden=false;renderMerchant();},{staff,role});
  const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
  for(const width of [1440,1024,390,320]){
   rows=initial();await page.setViewportSize({width,height:1080});await page.goto('https://loyalty.test/');await show();await page.locator('.wh-card').first().waitFor();await fit();
   assert.equal(await page.locator('.wh-metric').count(),4);assert.equal(await page.locator('.wh-card').count(),6);assert.equal(await page.locator('.wh-card img').count(),0);assert.match(await page.locator('.wh-connection').textContent(),/no comprueba la disponibilidad pública/);
   if(process.env.LOYALTY_UI_EVIDENCE&&[1440,390].includes(width)){fs.mkdirSync(process.env.LOYALTY_UI_EVIDENCE,{recursive:true});await page.screenshot({path:path.join(process.env.LOYALTY_UI_EVIDENCE,'wallet-health-'+width+'.png'),fullPage:true});}
   await page.locator('[data-wallet-customer="0"]').evaluate(button=>{window.openCustomerWorkspace=id=>window.selectedCustomer=id;button.click();});assert.equal(await page.evaluate(()=>window.selectedCustomer),'carla');
   await page.locator('[data-wallet-retry="0"]').click();await page.locator('#walletRetryForm [name=reason]').fill('Revisamos el acceso con el cliente');failRetry=true;await page.locator('#walletRetryForm button[type=submit]').click();await page.locator('#walletRetryForm .form-feedback:not([hidden])').waitFor();assert.equal(await page.locator('#walletRetryForm [name=reason]').inputValue(),'Revisamos el acceso con el cliente');
   const first=calls.filter(c=>c.url.endsWith('/retry')).at(-1);failRetry=false;await page.locator('#walletRetryForm button[type=submit]').click();await page.waitForSelector('#walletRetryDialog',{state:'detached'});await page.locator('.wh-card').first().waitFor();const second=calls.filter(c=>c.url.endsWith('/retry')).at(-1);assert.equal(first.key,second.key);assert.deepEqual(first.body,second.body);assert.equal(second.body.expectedTag,21);assert.equal(await page.locator('[data-wallet-retry="0"]').isDisabled(),true);await fit();
   await page.locator('#walletHealthFilters [name=provider]').selectOption('APPLE');await page.locator('#walletHealthFilters [name=q]').fill('Carla');await page.locator('#walletHealthFilters button').click();await page.locator('.wh-card').first().waitFor();assert.equal(await page.locator('.wh-card').count(),1);assert.match(calls.filter(c=>c.url.endsWith('/wallet-health')).at(-1).query,/provider=APPLE/);
  }
  await page.goto('https://loyalty.test/');failLoad=true;await show();await page.getByRole('button',{name:'Reintentar consulta',exact:true}).waitFor();failLoad=false;await page.getByRole('button',{name:'Reintentar consulta',exact:true}).click();await page.locator('.wh-card').first().waitFor();
  await page.locator('[data-wallet-retry="2"]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#walletRetryDialog').count(),0);
  await show('CASHIER');assert.equal(await page.locator('[data-tab=walletHealth]').count(),0);
  await page.goto('https://loyalty.test/platform');await page.locator('#platformToken').fill('FICTIONAL-PLATFORM');await page.locator('#platformLogin button').click();await page.locator('[data-open=demo][data-pane=clients]').click();await page.locator('[data-commercial-pane=walletHealth]').click();await page.locator('.wh-card').first().waitFor();assert.equal(await page.locator('[data-wallet-customer]').count(),0);assert.ok(calls.some(c=>c.url==='/api/platform/tenants/demo/wallet-health'));await fit();
  await page.goto('https://loyalty.test/');delay=true;await show();await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('Consultando las tarjetas'));while(!release)await new Promise(r=>setTimeout(r,10));await page.evaluate(()=>{state.token='CHANGED-SESSION';state.tab='sales';renderMerchant();});await release();await page.waitForTimeout(60);assert.equal(await page.locator('.wh-card').count(),0);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.ok(calls.filter(c=>c.method==='POST').every(c=>c.url.endsWith('/retry')));
  console.log(JSON.stringify({status:'WALLET_HEALTH_UI_PASS',widths:[1440,1024,390,320],checks:['Owner and platform','Scoped filters','Explicit retry and stable idempotency','Cooldown','Connection recovery entry','HTML escaping','Errors and late responses','No browser persistence']}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

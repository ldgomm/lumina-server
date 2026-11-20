// Real Chromium, fictional fixtures, all network intercepted. No customer or provider operations.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty'),evidence=process.env.LOYALTY_UI_EVIDENCE;
const config=(name,kind,extra={})=>({name,kind,active:true,unitMinor:100,pointsPerUnit:1,cashbackBps:500,stampsPerPurchase:1,minimumSpendMinor:1,branchIds:[],bonuses:[],...extra,window:{weekdays:[1,2,3,4,5,6,7],...extra.window}});
const staff={role:'OWNER',business:{id:'fiction',name:'Café Aurora',currency:'USD',timezone:'America/Guayaquil'},branches:[{id:'c',name:'Centro'},{id:'n',name:'Norte'}],programs:[{id:'p',version:1,config:config('Momentos de café','POINTS')},{id:'s',version:1,config:config('Visitas con premio','STAMPS',{minimumSpendMinor:2000})},{id:'expired',version:1,config:config('Temporada anterior','CASHBACK',{window:{endsAt:'2000-01-01T00:00:00Z'}})},{id:'future',version:1,config:config('Próxima temporada','STAMPS',{window:{startsAt:'2099-01-01T00:00:00Z'}})}],rewards:[{id:'rp',programId:'p',name:'Un café de especialidad',cost:100,active:true,version:1},{id:'rs',programId:'s',name:'Café para compartir',cost:8,active:true,version:1}],promotionSuggestions:{category:{id:'CAFE',name:'Cafetería',source:'SELECTED'},examples:[],productExamples:['café']}};
const member={member:{id:'m',name:'Ana de ejemplo',cardCode:'FAKE-QR',revision:1},balances:[{programId:'p',name:'Momentos de café',kind:'POINTS',available:44},{programId:'cash',name:'Saldo por volver',kind:'CASHBACK',available:725},{programId:'s',name:'Visitas con premio',kind:'STAMPS',available:7}],rewards:[{id:'rc',programId:'cash',name:'Canje de saldo',active:true,cost:500},...staff.rewards],history:[]};
const initial={displayName:'Café Aurora',composition:'PANORAMA',frontFocus:'AUTO',automaticPriority:'ORDER',featuredProgramId:null,featuredRewardId:null,background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',stampSymbol:'☕',artworkStyle:'GRADIENT',artworkAccent:'#ddb67c',welcome:'Bienvenido',usage:'Presenta tu QR en caja.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const activity={summary:{periodPurchases:183,periodSpentMinor:384050,periodBuyers:86,periodClaimedRewards:12,registeredCustomers:124,readyCustomers:18,nearCustomers:11,inactiveCustomers:9,newCustomers:6},customers:[{id:'a',name:'Ana de ejemplo',lastPurchase:'2026-11-09T17:00:00Z',purchases:8,spentMinor:8400},{id:'b',name:'Luis de ejemplo',lastPurchase:'2026-11-09T16:00:00Z',purchases:4,spentMinor:4200}],from:'2026-10-11T05:00:00Z',through:'2026-11-09T17:00:00Z',timezone:'America/Guayaquil'};
const account={business:{...staff.business,joinedAt:'2026-10-01',tenureDays:40},access:{effectiveState:'ACTIVE'},summary:{balanceMinor:0,overdueMinor:0,nextDueOn:null,invoiceCount:0},today:'2026-11-09',membership:null,invoices:[],payments:[],paymentCount:0};
const report={days:30,fromDate:'2026-10-11',throughDate:'2026-11-09',previousFromDate:'2026-09-11',previousThroughDate:'2026-10-10',totalClients:124,newClients:18,previousNewClients:12,purchases:183,previousPurchases:150,salesMinor:384050,previousSalesMinor:301500,activeClients:86,repeatClients:42,repeatRate:42/86*100,redemptions:12,detailedPurchases:120,daily:[{day:'2026-10-11',purchases:12,clients:9,salesMinor:24500},{day:'2026-11-09',purchases:171,clients:82,salesMinor:359550}],branches:[{name:'Centro',purchases:120,clients:60,salesMinor:242000,redemptions:8},{name:'Norte',purchases:63,clients:40,salesMinor:142050,redemptions:4}],categories:[{name:'Café',units:240}],topRewards:[{name:'Café de cortesía',claims:8}]};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const calls=[],errors=[],checks=[];let design={...initial},version=3,failPurchase=false;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/wallet/art/')){assert.ok(await require('./wallet-artwork-fixture.cjs')(route,u));return;}
   if(u.pathname.startsWith('/api/')){
    const body=req.postDataJSON();calls.push({url:u.pathname+u.search,method:req.method(),body,key:req.headers()['idempotency-key']});
    if(u.pathname==='/api/staff/dashboard')return route.fulfill({json:staff});
    if(u.pathname==='/api/staff/access')return route.fulfill({json:{canOperate:true}});
    if(u.pathname==='/api/staff/customer-activity')return route.fulfill({json:activity});
    if(u.pathname==='/api/staff/wallet-design'){if(req.method()==='PUT'){design={...body.design};version++;}return route.fulfill({json:{version,design}});}
    if(u.pathname==='/api/staff/members/lookup')return route.fulfill({json:member});
    if(u.pathname.endsWith('/account'))return route.fulfill({json:account});
    if(u.pathname.endsWith('/metrics'))return route.fulfill({json:report});
    if(u.pathname==='/api/staff/purchases/quote')return route.fulfill({json:{grossMinor:body.amountMinor,amountMinor:body.amountMinor,discountMinor:0,currency:'USD',earningReview:'fiction-review',earnings:body.programIds.map(id=>({programId:id,name:staff.programs.find(p=>p.id===id).config.name,kind:id==='p'?'POINTS':'STAMPS',amount:id==='p'?15:0,eligiblePaidMinor:1500,minimumSpendMinor:2000,reason:id==='p'?'EARNED':'MINIMUM_SPEND'}))}});
    if(u.pathname==='/api/staff/purchases'){if(failPurchase)return route.fulfill({status:409,json:{code:'EARNING_REVIEW_CHANGED',message:'Cambió la tarjeta o una condición. Revisa de nuevo antes de guardar; no se registró esta compra.'}});return route.fulfill({json:{purchaseId:'fiction-receipt',amountMinor:body.amountMinor,discountMinor:0,replayed:false,earned:[{programId:'p',kind:'POINTS',amount:15}]}});}
    throw Error('Unexpected API '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<link rel="stylesheet" href="/commercial.css"><script src="/commercial.js" defer></script><script src="/promotion-editor.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const show=async tab=>page.evaluate(({staff,tab})=>{state.data=staff;state.token='fiction';state.tab=tab;exit.hidden=false;renderMerchant();},{staff,tab});
  const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow at '+page.viewportSize().width);
  const shot=async(name,selector)=>{if(!evidence)return;fs.mkdirSync(evidence,{recursive:true});await page.locator(selector).screenshot({path:path.join(evidence,name+'.png')});};
  for(const width of [1440,1024,390,320]){
   await page.setViewportSize({width,height:1080});await page.goto('https://loyalty.test/');await show('overview');await page.locator('.setup-checklist').waitFor();
   assert.equal(await page.locator('.setup-step').count(),5);await fit();if(width===1440||width===390)await shot(width+'-command-center','#content');
   await page.selectOption('#overviewDays','7');await page.locator('.setup-checklist').waitFor();assert.ok(calls.some(c=>c.url.endsWith('customer-activity?days=7')));
   await page.locator('[data-task="0"]').click();await page.locator('#promotionCards').waitFor();assert.equal(await page.locator('[data-promotion-status=NO_REWARD]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-promotion-card]').count(),2);
   const overnight=await page.evaluate(()=>{const p={...state.data.programs[0],config:{...state.data.programs[0].config,window:{weekdays:[1],localStart:'22:00:00',localEnd:'02:00:30'}}};return [window.LoyaltyPromotionSummary(p,new Date('2026-11-10T07:00:20Z')).status,window.LoyaltyPromotionSummary(p,new Date('2026-11-10T07:00:30Z')).status];});assert.deepEqual(overnight,['NOW','OUTSIDE']);
   await page.locator('[data-promotion-status=ALL]').click();await page.locator('#searchPromotions').fill('especialidad');assert.equal(await page.locator('[data-promotion-card]').count(),1);
   await page.locator('#searchPromotions').fill('CAFE');assert.equal(await page.locator('[data-promotion-card]').count(),2);await page.locator('#searchPromotions').fill('');
   await page.locator('[data-promotion-card=p] summary').click();await fit();if(width===1440||width===390)await shot(width+'-promotion-workbench','#content');
   await page.locator('[data-promotion-status=SCHEDULED]').click();assert.equal(await page.locator('[data-promotion-card]').count(),1);assert.match(await page.locator('.promotion-state').textContent(),/Programada/);
   await page.locator('[data-promotion-status=ENDED]').click();assert.equal(await page.locator('[data-promotion-card]').count(),1);
   await page.locator('[data-program-edit=expired]').click();await page.locator('#programV7 [name=name]').fill('Borrador conservado');await page.locator('#addBonus').click();await page.locator('#backToPromotions').click();await page.locator('#operationDraftDialog').waitFor();await page.locator('#keepOperationDraft').click();assert.equal(await page.locator('#programV7 [name=name]').inputValue(),'Borrador conservado');await page.locator('#backToPromotions').click();await page.locator('#discardOperationDraft').click();await page.locator('#promotionCards').waitFor();
   await show('sales');await page.locator('#value').fill('FAKE-QR');await page.locator('#lookup button:not([type])').click();await page.locator('#purchase').waitFor();
   assert.match(await page.locator('.counter-wallet-reward').innerText(),/Disponible para canjear[\s\S]*Canje de saldo[\s\S]*5\.00 USD[\s\S]*7\.25 USD/);
   await page.locator('.counter-wallet-balances summary').click();assert.match(await page.locator('.counter-wallet-balances ul').innerText(),/44/);
   if(evidence&&(width===390||width===1440)){
     const box=await page.locator('.customer-counter').evaluate(el=>{
       const card=el.getBoundingClientRect(),last=el.querySelector('.counter-wallet-balances').getBoundingClientRect();
       return {x:card.x+scrollX,y:card.y+scrollY,width:card.width,height:last.bottom-card.top+12};
     });
     await page.screenshot({path:path.join(evidence,width+'-premio-en-caja.png'),clip:box});
   }

   await page.locator('#purchase [name=receipt]').fill('FICTICIO-001');await page.locator('#purchase [name=amount]').fill('15.00');await page.locator('#purchase [name=program][value=p]').check();await page.locator('#purchase [name=program][value=s]').check();
   await page.locator('#changeCustomer').click();await page.locator('#operationDraftDialog').waitFor();await page.locator('#keepOperationDraft').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#purchase [name=receipt]').inputValue(),'FICTICIO-001');
   await page.locator('#purchase button:not([type])').click();await page.locator('.earning-forecast').waitFor();assert.match(await page.locator('.earning-forecast').textContent(),/15 puntos/);assert.match(await page.locator('.earning-forecast').textContent(),/mínimo elegible de 20.00/);await fit();if(width===1440||width===390)await shot(width+'-purchase-review','.purchase-confirmation');
   failPurchase=true;await page.locator('#finishSimplePurchase button').click();await page.locator('#finishSimplePurchase .form-feedback:not([hidden])').waitFor();assert.equal(calls.at(-1).body.expectedEarningReview,'fiction-review');assert.equal(await page.locator('#purchase [name=receipt]').inputValue(),'FICTICIO-001');
   failPurchase=false;await page.locator('#purchase button:not([type])').click();await page.locator('#finishSimplePurchase button').click();await page.locator('.counter-receipt').waitFor();
   if(width===1440){
    await page.locator('#nextCustomer').click();await page.locator('#value').fill('FAKE-QR');await page.locator('#lookup button:not([type])').click();await page.locator('#purchase').waitFor();
    await page.getByRole('button',{name:'Registrar productos y aplicar un descuento',exact:true}).click();await page.locator('#productPurchase [name=receipt]').fill('FICTICIO-002');
    await page.locator('[data-name]').fill('Café');await page.locator('[data-group-choice]').selectOption('__custom');await page.locator('[data-group]').fill('café');await page.locator('[data-price]').fill('1.005');
    await page.locator('#addProduct').click();assert.equal(await page.locator('[data-price]').first().inputValue(),'1.005');await page.locator('[data-remove="1"]').click();
    const quoted=calls.filter(c=>c.url==='/api/staff/purchases/quote').length;await page.locator('#productPurchase button:not([type])').click();await page.locator('#productPurchase .form-feedback:not([hidden])').waitFor();assert.equal(calls.filter(c=>c.url==='/api/staff/purchases/quote').length,quoted);
    await page.locator('[data-price]').fill('1.25');await page.locator('#productPurchase button:not([type])').click();await page.locator('.earning-forecast').waitFor();assert.match(await page.locator('.earning-forecast').textContent(),/Solo se registra la compra/);assert.equal(calls.at(-1).body.amountMinor,125);
    await page.locator('[data-tab=reports]').click();await page.locator('#operationDraftDialog').waitFor();await page.locator('#discardOperationDraft').click();
   }else await show('reports');await page.locator('.report-reading').waitFor();assert.match(await page.locator('.report-reading').textContent(),/66%/);assert.match(await page.locator('.report-reading').textContent(),/120 de 183/);await fit();if(width===1440||width===390)await shot(width+'-report-reading','.report-reading');
   await show('design');await page.locator('#walletDesign').waitFor();await page.locator('[data-studio-step="2"]').click();assert.equal(await page.locator('[name=automaticPriority]').inputValue(),'PROGRESS');await page.locator('[data-front-focus=REWARD]').click();await page.locator('[data-preview-provider=both]').click();await fit();
   if(width===1440){await page.locator('#saveDesign').click();await page.waitForFunction(()=>document.querySelector('#saveDesign').disabled);const saved=calls.filter(c=>c.url==='/api/staff/wallet-design'&&c.method==='PUT').at(-1);assert.equal(saved.body.design.automaticPriority,'PROGRESS');assert.equal(saved.body.design.featuredProgramId,null);}
  }
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length),0);
  checks.push('Overview periods and setup; missing reward deep link; category/reward/accent search; schedule/expired status; guarded promotion and purchase drafts; server benefit forecast and 409 retention; report coverage; explicit smart priority for Apple and Google; 320/390/1024/1440; keyboard and no storage.');
  console.log(JSON.stringify({status:'INTEGRAL_EXPERIENCE_BROWSER_PASS',checks,physicalDevices:'PENDING'},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// All network is intercepted. Fictional contacts only; never opens a real business or Wallet.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const evidence=process.env.LOYALTY_UI_EVIDENCE;
const catalog=JSON.parse(fs.readFileSync(path.resolve(web,'../../businesses/business-categories.json'),'utf8'));
const categoryOptions=catalog.map(({id,name,group})=>({id,name,group}));
const cafe=catalog.find(c=>c.id==='CAFE');
const promotionSuggestions={version:1,category:{id:cafe.id,name:cafe.name,source:'SELECTED'},productExamples:cafe.productExamples,examples:cafe.examples};
const profile={legalName:'Aurora Ejemplo S.A.',ruc:'1790012345001',activity:'Cafetería',category:'CAFE',contactName:'Ana Ejemplo',email:'ana@example.test',phone:'+593 99 123 4567',province:'Pichincha',city:'Quito',address:'Dirección ficticia 123',website:'https://example.test',socialLinks:{}};;
const businesses=[{id:'aurora',name:'Café Aurora',ruc:profile.ruc,city:'Quito',state:'ACTIVE',clients:124,balanceMinor:2500,currency:'USD',nextChargeOn:'2026-12-01'}, {id:'legacy',name:'Taller Brújula',ruc:null,city:null,state:'ACTIVE',clients:32,balanceMinor:0,currency:'USD',nextChargeOn:null}];
const staff={role:'OWNER',business:{id:'aurora',name:'Café Aurora',currency:'USD',timezone:'America/Guayaquil'},branches:[{id:'branch',name:'Principal'}],programs:[],rewards:[],promotionSuggestions};;;;
const account={business:{...staff.business,joinedAt:'2026-10-01',tenureDays:37},access:{effectiveState:'ACTIVE'},summary:{balanceMinor:2500,overdueMinor:0,nextDueOn:null,invoiceCount:0},today:'2026-11-07',membership:null,invoices:[],payments:[],paymentCount:0};
const member={member:{id:'member',name:'Ana Ejemplo',cardCode:'FAKE-CARD-000001',revision:1},balances:[],rewards:[]};
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const checks=[],errors=[],calls=[];let pendingCreate,pendingSearch,pendingList,delayList=false,failProfile=false,profileVersion=1;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const request=route.request(),u=new URL(request.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/api/')){
    const body=request.postDataJSON();calls.push({path:u.pathname,method:request.method(),q:u.searchParams.get('q'),body});
    if(u.pathname==='/api/platform/overview')return route.fulfill({json:{summary:{businesses:1,branches:2,clients:124,newClients:0,purchases:0,redemptions:0},currencies:[],businesses:[],total:0,hasMore:false}});
    if(u.pathname.endsWith('/administration'))return route.fulfill({json:{business:account.business,asOf:'2026-11-10T18:00:00Z',profile:{present:true,category:{name:'Cafetería'},city:'Quito'},team:{active:1,owners:1,inactive:0,archived:0},branches:{total:staff.branches.length,withoutCashier:0},pendingProfileRequests:0,account:{...account,notices:{active:0,unread:0}}}});
    if(u.pathname==='/api/platform/tenants'){if(delayList){pendingList=()=>route.fulfill({json:{items:businesses,nextOffset:null}});return;}return route.fulfill({json:{items:businesses,nextOffset:null}});}
    if(u.pathname==='/api/platform/tenant-suggestions'){
     const q=u.searchParams.get('q');
     if(q==='lenta'){pendingSearch=()=>route.fulfill({json:{items:[{id:'old',name:'Respuesta antigua'}]}});return;}
     if(q==='error')return route.fulfill({status:503,json:{message:'Fallo temporal'}});
     return route.fulfill({json:{items:q==='malicioso'?[{id:'fake',name:'<img src=x onerror="window.injected=true">',ruc:null}]:businesses.filter(b=>b.name.toLowerCase().includes(q.toLowerCase())||b.ruc?.includes(q))}});
    }
    if(u.pathname==='/api/platform/businesses'){pendingCreate=()=>route.fulfill({status:201,json:{tenantId:'aurora',ownerToken:'FICTIONAL-ONE-TIME-CREDENTIAL',enrollmentPath:'/join/aurora',firstBranchId:'branch'}});return;}
        if(u.pathname==='/api/platform/business-categories')return route.fulfill({json:{version:1,categories:categoryOptions}});
    if(u.pathname.endsWith('/account'))return route.fulfill({json:account});
    if(u.pathname.endsWith('/profile')||u.pathname==='/api/staff/business-profile'){
     if(request.method()==='PUT'){
      if(failProfile)return route.fulfill({status:409,json:{code:'PROFILE_CHANGED',message:'Otra persona actualizó los datos. Recarga la ficha antes de guardar.'}});
      assert.equal(body.expectedVersion,profileVersion);profileVersion++;return route.fulfill({json:{business:staff.business,version:profileVersion,profile:body.profile,rucVerification:'NOT_VERIFIED'}});
     }
     return route.fulfill({json:{business:staff.business,version:profileVersion,profile,categoryOptions,categoryContext:promotionSuggestions.category,rucVerification:'NOT_VERIFIED'}});
    }
    if(u.pathname==='/api/staff/wallet-design')return route.fulfill({json:{version:1,design:{displayName:'Café Aurora'}}});
    if(u.pathname==='/api/staff/access')return route.fulfill({json:{canOperate:true}});
    if(u.pathname==='/api/staff/member-suggestions')return route.fulfill({json:{items:[{name:'Ana Ejemplo',cardCode:'FAKE-CARD-000001'},{name:'Ana Ejemplo',cardCode:'FAKE-CARD-000002'}]}});
    if(u.pathname==='/api/staff/members/lookup')return route.fulfill({json:member});
    if(u.pathname==='/api/staff/customer-activity')return route.fulfill({json:{summary:{periodPurchases:183,periodSpentMinor:384050,periodBuyers:86,periodClaimedRewards:12,registeredCustomers:124,nearCustomers:8,readyCustomers:14},customers:[{name:'Ana Ejemplo',lastPurchase:'2026-11-07T12:00:00Z',purchases:8,spentMinor:12000},{name:'Carlos Ejemplo',lastPurchase:'2026-11-06T12:00:00Z',purchases:5,spentMinor:8500}],from:'2026-10-08T05:00:00Z',through:'2026-11-07T20:00:00Z',timezone:'America/Guayaquil'}});
    throw new Error('Unexpected API '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname==='/platform'?'platform.html':u.pathname.slice(1);
   if(!/^[a-zA-Z0-9.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));
   if(name==='index.html')body=body.toString().replace('</head>','<link rel="stylesheet" href="/commercial.css"><script src="/commercial.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   if(name==='platform.html')body=body.toString().replace('</head>','<script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const waitUntil=async read=>{for(let i=0;i<500&&!read();i++)await new Promise(r=>setTimeout(r,10));assert.ok(read(),'Expected pending request');};
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const shot=async name=>{if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});}};
  await page.goto('https://loyalty.test/platform');await page.locator('#platformToken').fill('FICTIONAL');await page.locator('#platformLogin button').click();await page.locator('[data-manage]').click();await page.locator('#newBusiness').waitFor();
  assert.equal(await page.locator('#newBusiness').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(11, 31, 58)');await noOverflow();await shot('navy-platform-desktop');
  await page.locator('#query').fill('Caf');await page.locator('#query-suggestions [role=option]').waitFor();
  assert.equal(calls.filter(c=>c.method==='POST').length,0);assert.equal(await page.locator('#query').getAttribute('aria-expanded'),'true');
  await page.locator('#query').press('ArrowDown');await page.locator('#query').press('Enter');await page.locator('[data-commercial-pane=profile]').waitFor();
  checks.push('Platform search is read-only until explicit keyboard selection; Navy primary button');
  await page.locator('#backBusinesses').click();await page.locator('[data-manage]').click();await page.locator('#query').fill('lenta');await waitUntil(()=>pendingSearch);
  await page.locator('#query').fill('179');await page.locator('#query-suggestions [role=option]').waitFor();await pendingSearch();
  await page.waitForTimeout(80);assert.match(await page.locator('#query-suggestions').textContent(),/Café Aurora/);assert.doesNotMatch(await page.locator('#query-suggestions').textContent(),/antigua/);
  await page.locator('#query').press('Escape');assert.equal(await page.locator('#query').getAttribute('aria-expanded'),'false');
  await page.locator('#query').fill('malicioso');await page.locator('#query-suggestions [role=option]').waitFor();assert.equal(await page.locator('#query-suggestions img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  await page.locator('#query').fill('error');await page.waitForFunction(()=>document.querySelector('#query-search-status').textContent.includes('No se pudo'));
  await page.locator('#query').fill('sin resultados');await page.waitForFunction(()=>document.querySelector('#query-search-status').textContent.includes('Sin coincidencias'));
  checks.push('RUC suggestions, stale response suppression, Escape, escaped names, empty and retry states');
  await page.locator('#newBusiness').click();await page.locator('#registrationNext').click();assert.equal(await page.locator('[data-registration-panel="0"]').isVisible(),true);
  await page.locator('#name').fill('Café Aurora');await page.locator('#legalName').fill(profile.legalName);await page.locator('#ruc').fill('123');await page.locator('#activity').fill(profile.activity);await page.locator('#registrationNext').click();
  assert.equal(await page.locator('[data-registration-panel="0"]').isVisible(),true);assert.match(await page.locator('#rucHelp').textContent(),/13 dígitos/);
  await page.locator('#ruc').fill(profile.ruc);await page.locator('#category').selectOption('CAFE');await page.locator('#registrationNext').click();;assert.equal(await page.locator('[data-registration-panel="1"]').isVisible(),true);
  for(const key of ['contactName','phone','province','city','address','website'])await page.locator('#'+key).fill(profile[key]);
  await page.locator('#registrationBack').click();assert.equal(await page.locator('#legalName').inputValue(),profile.legalName);await page.locator('#registrationNext').click();assert.equal(await page.locator('#phone').inputValue(),profile.phone);assert.equal(await page.locator('input[type=email]').count(),0);
  await page.locator('#registrationNext').click();assert.match(await page.locator('#registrationSummary').textContent(),/1790012345001/);assert.equal(await page.locator('#slug').inputValue(),'cafe-aurora');
  assert.equal(calls.filter(c=>c.path==='/api/platform/businesses').length,0);await shot('navy-registration-review');
  await page.locator('#registrationNext').click();await waitUntil(()=>pendingCreate);assert.equal(await page.locator('#registrationNext').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#commercialDialog').isVisible(),true);
  await page.evaluate(()=>document.querySelector('#businessRegistration').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(calls.filter(c=>c.path==='/api/platform/businesses').length,1);
  const sent=calls.find(c=>c.path==='/api/platform/businesses').body;assert.deepEqual(sent.profile,{...profile,email:''});assert.deepEqual(sent.firstBranch,{name:'Principal',code:'PRINCIPAL'});
  await pendingCreate();await page.locator('#openCreatedBusiness').waitFor();assert.match(await page.locator('.business-created').textContent(),/FICTIONAL-ONE-TIME-CREDENTIAL/);
  checks.push('Three-step registration validates RUC, preserves previous steps, previews data and sends exactly one request');
  await page.locator('#openCreatedBusiness').click();await page.locator('#businessProfileForm').waitFor();failProfile=true;await page.locator('#city').fill('Cuenca');await page.locator('#correctionReason').fill('Cambio solicitado y verificado');await page.locator('#businessProfileForm button[type=submit]').click();
  await page.locator('#businessProfileForm>.form-feedback:not([hidden])').waitFor();assert.equal(await page.locator('#city').inputValue(),'Cuenca');assert.match(await page.locator('.form-feedback').textContent(),/Recarga/);assert.equal(await page.getByRole('button',{name:'Recargar ficha guardada'}).isVisible(),true);
  failProfile=false;await page.locator('#businessProfileForm button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#profileSaved').textContent.includes('Datos guardados'));
  checks.push('Version conflict leaves edits visible; successful save uses expected version');;
  await page.setViewportSize({width:390,height:844});await noOverflow();await shot('navy-profile-mobile');
  await page.locator('#backBusinesses').click();await page.locator('[data-manage]').click();await page.locator('#newBusiness').click();await noOverflow();await shot('navy-registration-mobile');await page.locator('#closeRegistration').click();
  await page.goto('https://loyalty.test/');
  const showStaff=async(role='OWNER',tab='sales')=>{await page.evaluate(({data,tab})=>{state.token='FICTIONAL';state.data=data;state.tab=tab;renderMerchant();}, {data:{...staff,role},tab});};
  await showStaff();await page.locator('#kind').selectOption('name');await page.locator('#value').fill('Ana');await page.locator('#value-suggestions [role=option]').first().waitFor();
  assert.equal(await page.locator('#value-suggestions [role=option]').count(),2);assert.match(await page.locator('#value-suggestions').textContent(),/000001/);assert.match(await page.locator('#value-suggestions').textContent(),/000002/);
  assert.equal(calls.filter(c=>c.path==='/api/staff/members/lookup').length,0);await page.locator('#value').press('ArrowDown');await page.locator('#value').press('Enter');await page.locator('.customer-counter').waitFor();
  assert.deepEqual(calls.find(c=>c.path==='/api/staff/members/lookup').body,{cardCode:'FAKE-CARD-000001'});assert.equal(calls.filter(c=>c.path.includes('redemptions')||c.path.includes('purchases')).length,0);
  checks.push('Same-name customers are distinguished by card suffix; selection loads the card without purchase or redemption');
  await page.locator('#workspaceSearch').fill('mi negocio');await page.locator('#workspaceSearch-suggestions [role=option]').first().click();await page.locator('#businessProfileForm').waitFor();assert.match(await page.locator('#sectionTitle').textContent(),/información de tu negocio/);await noOverflow();
  await showStaff('CASHIER');await page.locator('#workspaceSearch').fill('promociones');await page.waitForFunction(()=>document.querySelector('#workspaceSearch-search-status').textContent.includes('Sin coincidencias'));
  assert.equal(await page.locator('[data-tab=business]').count(),0);assert.equal(await page.locator('[data-tab=programs]').count(),0);
  await page.setViewportSize({width:320,height:780});await noOverflow();await page.locator('#workspaceMenu').click();await noOverflow();
  checks.push('Section finder respects existing role menu; mobile layouts fit 320 and 390 pixels');
  await page.setViewportSize({width:1440,height:1100});await showStaff('OWNER','overview');await page.locator('.overview-hero').waitFor();await shot('navy-owner-desktop');
  assert.equal(await page.locator('.workspace-sidebar').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(11, 31, 58)');await noOverflow();
  await page.goto('https://loyalty.test/platform');await page.locator('#platformToken').fill('FICTIONAL');await page.locator('#platformLogin button').click();await page.locator('[data-manage]').click();await page.locator('#newBusiness').click();
  await page.locator('#name').fill('Otra marca de ejemplo');for(const key of ['legalName','ruc','activity'])await page.locator('#'+key).fill(profile[key]);await page.locator('#category').selectOption('CAFE');await page.locator('#registrationNext').click();;
  for(const key of ['contactName','phone','province','city','address'])await page.locator('#'+key).fill(profile[key]);await page.locator('#registrationNext').click();
  pendingCreate=null;delayList=true;await page.locator('#registrationNext').click();await waitUntil(()=>pendingCreate);await pendingCreate();await waitUntil(()=>pendingList);
  await page.locator('#exit').click();await page.locator('#platformLogin').waitFor();await pendingList();await page.waitForTimeout(80);
  assert.equal(await page.locator('.business-created').count(),0);assert.doesNotMatch(await page.locator('body').textContent(),/FICTIONAL-ONE-TIME-CREDENTIAL/);
  checks.push('Logout while the post-create list refresh is pending never exposes the issued credential');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'NAVY_UI_PASS',checks,network:'Fully intercepted; fictional data',screenshots:!!evidence},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});

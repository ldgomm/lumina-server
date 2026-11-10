// Fully intercepted fictional fixtures. Never sends a real message or business operation.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/web'),evidence=process.env.LOYALTY_UI_EVIDENCE;
const catalog=JSON.parse(fs.readFileSync(path.resolve(web,'../business-categories.json'),'utf8'));
const categoryOptions=catalog.map(({id,name,group})=>({id,name,group}));
const cafe=catalog.find(c=>c.id==='CAFE');
const promotionSuggestions={version:1,category:{id:cafe.id,name:cafe.name,source:'SELECTED'},productExamples:cafe.productExamples,examples:cafe.examples};
const profile={legalName:'Aurora Ejemplo S.A.',ruc:'1790012345001',activity:'Cafetería',category:'CAFE',contactName:'Ana Ejemplo',email:'ana@example.test',phone:'0991234567',province:'Pichincha',city:'Quito',address:'Dirección de ejemplo 123',website:'',socialLinks:{}};;
const staff={role:'OWNER',business:{id:'aurora',name:'Café Aurora',currency:'USD',timezone:'America/Guayaquil'},branches:[{id:'centro',name:'Centro'},{id:'norte',name:'Norte'}],programs:[],rewards:[],promotionSuggestions};;
const account={business:{...staff.business,joinedAt:'2026-10-01',tenureDays:37},access:{effectiveState:'ACTIVE'},summary:{balanceMinor:0,overdueMinor:0,nextDueOn:null,invoiceCount:0},today:'2026-11-07',membership:null,invoices:[],payments:[],paymentCount:0};
const suggestions=[{title:'¡Feliz cumpleaños!',message:'Hoy celebramos contigo. Gracias por formar parte de nuestra comunidad.'},{title:'Un saludo en tu día',message:'Te deseamos un cumpleaños lleno de buenos momentos.'},{title:'De parte de todo el equipo',message:'Nos alegra tenerte cerca. ¡Feliz cumpleaños!'}];
const birthday={version:0,settings:{enabled:true,mode:'FIXED',title:'¡Feliz cumpleaños!',message:'Un saludo de nuestra tienda.',templates:[]},suggestions};
function report(days){const from=new Date(Date.parse('2026-11-07T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);return {days,fromDate:from,throughDate:'2026-11-07',previousFromDate:new Date(Date.parse(from+'T00:00:00Z')-days*86400000).toISOString().slice(0,10),previousThroughDate:new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10),totalClients:124,newClients:18,previousNewClients:12,purchases:183,previousPurchases:150,salesMinor:384050,previousSalesMinor:301500,activeClients:86,repeatClients:42,repeatRate:42/86*100,redemptions:12,daily:[{day:from,purchases:12,clients:9,salesMinor:24500},{day:'2026-11-07',purchases:171,clients:82,salesMinor:359550}],branches:[{name:'Centro',purchases:120,clients:60,salesMinor:242000,redemptions:8},{name:'Norte',purchases:63,clients:40,salesMinor:142050,redemptions:4}],categories:[{name:'Café',units:240},{name:'Pastelería',units:95}],topRewards:[{name:'Café de cortesía',claims:8},{name:'Descuento por visitas',claims:4}]};}
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const calls=[],errors=[],checks=[];let requests=[],pendingPromotion,pendingReport,delayReport=false,birthdayConflict=false;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/api/')){
    const body=req.postDataJSON();calls.push({path:u.pathname,method:req.method(),query:Object.fromEntries(u.searchParams),body,key:req.headers()['idempotency-key']});
    if(u.pathname.endsWith('/branch-directory'))return route.fulfill({json:{business:staff.business,items:[],total:0,offset:0,hasMore:false,from:'2026-10-12T05:00:00Z',asOf:'2026-11-10T18:00:00Z'}});
    if(u.pathname==='/api/staff/access')return route.fulfill({json:{canOperate:true}});
    if(u.pathname==='/api/staff/dashboard')return route.fulfill({json:staff});
    if(u.pathname.endsWith('/account'))return route.fulfill({json:account});
    if(u.pathname.endsWith('/metrics')){const result=report(Number(u.searchParams.get('days')));if(delayReport){pendingReport=()=>route.fulfill({json:result});return;}return route.fulfill({json:result});}
    if(u.pathname==='/api/platform/overview')return route.fulfill({json:{summary:{businesses:1,branches:2,clients:124,newClients:0,purchases:0,redemptions:0},currencies:[],businesses:[],total:0,hasMore:false}});
    if(u.pathname.endsWith('/administration'))return route.fulfill({json:{business:account.business,asOf:'2026-11-10T18:00:00Z',profile:{present:true,category:{name:'Cafetería'},city:'Quito'},team:{active:1,owners:1,inactive:0,archived:0},branches:{total:staff.branches.length,withoutCashier:0},pendingProfileRequests:0,account:{...account,notices:{active:0,unread:0}}}});
    if(u.pathname==='/api/platform/tenants')return route.fulfill({json:{items:[{...staff.business,state:'ACTIVE',clients:124,balanceMinor:0,pendingProfileRequests:requests.filter(r=>r.status==='PENDING').length}],nextOffset:null}});
    if(u.pathname==='/api/staff/business-profile/requests'){requests=[{id:'request1',details:body.details,status:'PENDING',createdAt:'2026-11-07T15:00:00Z'}];return route.fulfill({status:201,json:{id:'request1',status:'PENDING'}});}
    if(u.pathname.endsWith('/profile-requests/request1')){Object.assign(requests[0],body);return route.fulfill({json:{saved:true}});}
    if(u.pathname==='/api/staff/business-profile'||u.pathname.endsWith('/profile')){if(req.method()==='PUT')Object.assign(profile,body.profile);return route.fulfill({json:{business:staff.business,version:req.method()==='PUT'?2:1,profile,categoryOptions,categoryContext:promotionSuggestions.category,requests}});}
    if(u.pathname==='/api/staff/customer-events')return route.fulfill({json:{events:[]}});
    if(u.pathname==='/api/staff/birthday-settings'){
     if(req.method()==='PUT'){if(birthdayConflict)return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'Otra persona cambió los cumpleaños.'}});birthday.version++;birthday.settings=body.settings;return route.fulfill({json:{version:birthday.version}});}
     return route.fulfill({json:birthday});
    }
    if(['/api/staff/promotion-setups','/api/staff/promotion-templates'].includes(u.pathname)){pendingPromotion=()=>route.fulfill({json:{programId:'created',rewardId:'reward'}});return;}
    throw Error('Unexpected API '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname==='/platform'?'platform.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));
   if(name==='index.html')body=body.toString().replace('</head>','<link rel="stylesheet" href="/commercial.css"><script src="/commercial.js" defer></script><script src="/promotion-editor.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const show=async(tab)=>page.evaluate(({staff,tab})=>{state.token='FICTIONAL';state.data=staff;state.tab=tab;renderMerchant();},{staff,tab});
  const wait=async fn=>{for(let i=0;i<500&&!fn();i++)await new Promise(r=>setTimeout(r,10));assert.ok(fn(),'Expected pending request');};
  const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const shot=async name=>{if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.evaluate(()=>{clearTimeout(noticeTimer);document.querySelector('#notice').style.display='none';});await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});}};
  await page.goto('https://loyalty.test/');await show('business');await page.locator('#businessProfileForm').waitFor();
  for(const key of ['legalName','ruc','activity','province','city','address'])assert.equal(await page.locator('#'+key).getAttribute('readonly'),'');
  await page.locator('.social-fields summary').click();await page.locator('#instagram').fill('https://instagram.com/aurora');await page.locator('#businessProfileForm button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#profileSaved').textContent.includes('guardados'));
  assert.equal(calls.find(x=>x.path.endsWith('business-profile')&&x.method==='PUT').body.profile.socialLinks.instagram,'https://instagram.com/aurora');
  await page.locator('#jumpToProfileRequest').click();assert.equal(await page.locator('#profileRequestDetails').evaluate(e=>e===document.activeElement),true);
  await page.locator('#profileRequestDetails').fill('Necesito corregir la ciudad del establecimiento.');await page.locator('#profileRequestForm>button').click();await page.locator('.request-card').waitFor();assert.equal(await page.locator('#profileRequestForm').count(),0);
  await page.setViewportSize({width:390,height:844});await fit();await shot('owner-profile-mobile');checks.push('Owner fixed identity, editable socials and explicit correction request with pending status');
  await show('programs');await page.locator('#newPromotion').click();await page.locator('[data-promotion-method=CASHBACK]').click();await page.locator('#promotionNext').click();
  await page.locator('#promoName').fill('Un saldo por regresar');await page.locator('#cashbackCost').fill('5.25');await page.locator('#cashbackCost').locator('..').locator('[data-money-delta="1"]').click();assert.equal(await page.locator('#cashbackCost').inputValue(),'6.25');
  await page.locator('#cashbackCost').press('ArrowDown');assert.equal(await page.locator('#cashbackCost').inputValue(),'5.25');await page.locator('#rewardName').fill('Premio a elección');
  await page.locator('#promotionNext').click();await page.locator('#promotionReview').waitFor({state:'visible'});assert.match(await page.locator('#promotionReview').textContent(),/5.25 USD/);
  assert.equal(calls.filter(x=>x.path.endsWith('promotion-setups')).length,0);await page.locator('#promotionBack').click();assert.equal(await page.locator('#promoName').inputValue(),'Un saldo por regresar');await page.locator('#promotionNext').click();await fit();await shot('promotion-review-mobile');
  await page.locator('#promotionNext').click();await wait(()=>pendingPromotion);assert.equal(await page.locator('#promotionBack').isDisabled(),true);
  const created=calls.find(x=>x.path.endsWith('promotion-setups'));assert.equal(created.body.rewardCost,525);assert.equal(created.body.program.cashbackBps,500);assert.ok(created.key);await pendingPromotion();await page.locator('#newPromotion').waitFor();
  checks.push('Guided promotion previews before one atomic creation; whole-unit buttons preserve cents and steps preserve input');
  await page.locator('#newPromotion').click();await page.locator('[data-business-example="cafe-2"]').click();;await page.locator('#nth').fill('4');await page.locator('#percent').fill('35');await page.locator('#promotionNext').click();
  assert.match(await page.locator('#promotionReview').textContent(),/3 sellos/);assert.match(await page.locator('#promotionReview').textContent(),/35%/);assert.equal(calls.filter(x=>x.path.endsWith('promotion-templates')).length,0);
  checks.push('Examples are editable rules; changes are reflected in the review, with no implicit publication');
  await show('events');await page.locator('#birthdayForm').waitFor();await page.locator('#birthdayTitleOption').selectOption('1');assert.equal(await page.locator('#birthdayTitle').inputValue(),suggestions[1].title);
  await page.locator('#birthdayMode').selectOption('RANDOM');await page.locator('[data-greeting-choice="1"]').uncheck();await page.locator('[data-greeting-choice="2"]').uncheck();await page.locator('#birthdayForm>button:not([type])').click();await page.locator('#birthdayForm>.form-feedback:not([hidden])').waitFor();assert.equal(calls.filter(x=>x.path.endsWith('birthday-settings')&&x.method==='PUT').length,0);
  await page.locator('[data-greeting-choice="1"]').check();await page.locator('#greetingTitle1').fill('Un saludo de Aurora');await fit();await shot('birthday-mobile');
  await page.locator('#birthdayForm>button:not([type])').click();await page.waitForFunction(()=>document.querySelector('#birthdaySaved').textContent.includes('guardada'));
  const saved=calls.find(x=>x.path.endsWith('birthday-settings')&&x.method==='PUT');assert.equal(saved.body.settings.templates.length,2);assert.equal(saved.body.settings.templates[1].title,'Un saludo de Aurora');
  birthdayConflict=true;await page.locator('#greetingTitle1').fill('Edición por conservar');await page.locator('#birthdayForm>button:not([type])').click();await page.locator('#reloadBirthdays').waitFor();assert.equal(await page.locator('#greetingTitle1').inputValue(),'Edición por conservar');
  checks.push('Birthday suggestions, editable random pool, minimum two distinct choices and preserved edits on version conflict');
  await page.setViewportSize({width:1440,height:1050});await show('reports');await page.locator('#reportChart svg').waitFor();await fit();await shot('reports-owner-desktop');
  assert.match(await page.locator('.report-kpis').textContent(),/183/);await page.locator('#reportDay').fill('1');await page.locator('#reportDay').dispatchEvent('input');assert.match(await page.locator('#reportDayDetail').textContent(),/0 compras/);
  await page.locator('#reportMetric').selectOption('purchases');assert.equal(await page.locator('#reportChart svg').getAttribute('aria-label'),'Compras por día');
  const download=page.waitForEvent('download');await page.locator('#exportReport').click();const file=await download;const csv=fs.readFileSync(await file.path(),'utf8');assert.equal(csv.split('\r\n').length,31);assert.match(csv,/2026-11-07,171,82,3595.50,USD/);
  await page.locator('#reportDays').selectOption('7');await page.waitForFunction(()=>document.querySelector('#reportDay')?.max==='6');await page.setViewportSize({width:390,height:844});await fit();await shot('reports-owner-mobile');await page.setViewportSize({width:320,height:780});await fit();
  checks.push('Reports explore daily zeros, switch metrics and periods, export exact CSV and fit 320/390 pixels');
  delayReport=true;await page.locator('#reportDays').selectOption('90');await wait(()=>pendingReport);await show('business');await page.locator('#businessProfileForm').waitFor();await pendingReport();await page.waitForTimeout(80);assert.equal(await page.locator('#reportChart').count(),0);delayReport=false;
  checks.push('Late report response cannot replace another screen');
  await page.setViewportSize({width:1440,height:1050});await page.goto('https://loyalty.test/platform');await page.locator('#platformToken').fill('FICTIONAL');await page.locator('#platformLogin button').click();await page.locator('[data-manage]').click();await page.locator('[data-business=aurora]').click();
  await page.locator('[data-commercial-pane=profile]').click();await page.locator('#businessProfileForm').waitFor();assert.equal(await page.locator('#city').getAttribute('readonly'),null);await page.locator('#city').fill('Cuenca');await page.locator('#businessProfileForm button[type=submit]').click();assert.equal(await page.locator('#correctionReason').evaluate(e=>e.validity.valueMissing),true);
  await page.locator('#correctionReason').fill('Verificación con documentación del dueño');await page.locator('#businessProfileForm button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#profileSaved').textContent.includes('guardados'));
  await page.locator('#resolutionResponse').fill('Datos verificados y corrección aplicada.');await page.locator('#resolveProfileRequest input[name=reviewed]').check();await page.locator('#resolveProfileRequest>button').click();await page.waitForFunction(()=>document.querySelector('.request-card')?.textContent.includes('Atendida'));
  await page.locator('[data-commercial-pane=metrics]').click();await page.locator('#reportChart svg').waitFor();await fit();await shot('reports-admin-desktop');
  assert.ok(calls.some(x=>x.path==='/api/platform/tenants/aurora/metrics'));assert.ok(calls.some(x=>x.path.endsWith('/profile')&&x.method==='PUT'&&x.body.reason.includes('Verificación')));
  checks.push('Administrator requires documented reason, resolves request explicitly and sees the same tenant report');
  await page.goto('https://loyalty.test/');await show('branches');await page.locator('#addManagedBranch').click();await page.locator('#code').waitFor();await page.locator('#code').fill('');await page.locator('[data-reference-for=code] [data-generate-reference]').click();const code=await page.locator('#code').inputValue();assert.match(code,/^SUC-[A-F0-9]{16}$/);await page.locator('[data-reference-for=code] [data-generate-reference]').click();assert.equal(await page.locator('#code').inputValue(),code);
  checks.push('Internal reference generator is explicit and never silently replaces a retry identifier');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'OWNER_EXPERIENCE_UI_PASS',checks,network:'All requests intercepted; fictional data only'},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});

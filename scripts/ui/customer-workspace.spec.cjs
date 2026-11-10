// Fictional network fixtures. No real customer, purchase, canje, Wallet or notification is contacted.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const evidence=process.env.LOYALTY_UI_EVIDENCE;
const staff={role:'OWNER',business:{id:'aurora',name:'Café Aurora',currency:'USD',timezone:'America/Guayaquil'},branches:[{id:'centro',name:'Centro'},{id:'norte',name:'Norte'}],programs:[],rewards:[]};
const summary={registeredCustomers:51,returningCustomers:12,readyCustomers:4,nearCustomers:7,inactiveCustomers:3,newCustomers:2,periodBuyers:20,periodReturningBuyers:12,periodPurchases:48,periodSpentMinor:32500,periodDiscountMinor:2500,periodClaimedRewards:9};
const client={id:'ana',name:'Ana Ejemplo',cardSuffix:'000001',purchases:23,spentMinor:23900,claimedRewards:2,lastPurchase:'2026-11-07T16:30:00Z',firstPurchase:'2026-09-01T10:00:00Z',readyRewards:1,nearRewards:1,inactive:false,returning:true,daysSinceLastPurchase:0,averageDaysBetweenPurchases:3.5};
const events=Array.from({length:23},(_,i)=>({id:'purchase-'+i,kind:'PURCHASE',at:'2026-11-07T16:30:00Z',branchId:'centro',branch:'Centro',receipt:'REC-'+i,paidMinor:900,grossMinor:1000,discountMinor:100,items:[{name:'Café <img onerror=alert(1)>',quantity:2,group:'Bebidas'}],redemptionId:i===0?'reward-0':null}));
events[1]={id:'reward-0',kind:'REWARD',at:'2026-11-07T16:30:00Z',branchId:'norte',branch:'Norte',name:'Descuento de la visita',cost:5,balanceKind:'STAMPS'};
function details(u){
 const kind=u.searchParams.get('kind')||'ALL',branch=u.searchParams.get('branchId')||'',offset=Number(u.searchParams.get('offset')||0),rows=events.filter(e=>(kind==='ALL'||kind===e.kind)&&(!branch||branch===e.branchId));
 return {member:{id:'ana',name:client.name,cardCode:'FAKE-CARD-000001',joinedAt:'2026-08-01T12:00:00Z'},summary:{...client,discountMinor:2300},preferences:{birthday:'11-04',marketingConsent:false},rewardProgress:[{name:'Próximo café',program:'Visitas de mañana',remaining:1,kind:'STAMPS'},{name:'Premio disponible',program:'Tus puntos',remaining:0,kind:'POINTS'}],timeline:{items:rows.slice(offset,offset+20),total:rows.length,offset,hasMore:offset+20<rows.length}};
}
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const checks=[],errors=[],calls=[];let delayProfile=false,pendingProfile,delayPreferences=false,pendingPreferences,failProfile=false,failTimeline=false;
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/api/')){
    calls.push({path:u.pathname,query:Object.fromEntries(u.searchParams),method:req.method(),body:req.postDataJSON()});
    if(u.pathname==='/api/staff/access')return route.fulfill({json:{canOperate:true}});
    if(u.pathname==='/api/staff/customer-activity')return route.fulfill({json:{summary,customers:[client],total:51,offset:Number(u.searchParams.get('offset')||0),hasMore:!u.searchParams.get('offset')||u.searchParams.get('offset')==='0',from:'2026-10-09T05:00:00Z',through:'2026-11-07T17:00:00Z',timezone:'America/Guayaquil'}});
    if(u.pathname==='/api/staff/customer-suggestions')return route.fulfill({json:{items:[{id:'ana',name:client.name,cardSuffix:'000001'}]}});
    if(u.pathname==='/api/staff/customer-workspace/ana'){
     if(delayProfile){pendingProfile=()=>route.fulfill({json:details(u)});return;}
     if(failProfile||failTimeline)return route.fulfill({status:503,json:{message:'No se pudo cargar. Reintenta.'}});
     return route.fulfill({json:details(u)});
    }
    if(u.pathname==='/api/staff/customer-insights/ana/preferences'){
     if(delayPreferences){pendingPreferences=()=>route.fulfill({json:{ok:true}});return;}
     return route.fulfill({json:{ok:true}});
    }
    if(u.pathname==='/api/staff/members/lookup')return route.fulfill({json:{member:{id:'ana',name:client.name,cardCode:'FAKE-CARD-000001',revision:1},balances:[],rewards:[]}});
    throw Error('Unexpected request '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));
   if(name==='index.html')body=body.toString().replace('</head>','<link rel="stylesheet" href="/commercial.css"><script src="/commercial.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const show=async(tab='customers')=>page.evaluate(({staff,tab})=>{state.token='FICTIONAL';state.data=staff;state.tab=tab;renderMerchant();},{staff,tab});
  const waitUntil=async fn=>{for(let i=0;i<500&&!fn();i++)await new Promise(r=>setTimeout(r,10));assert.ok(fn());};
  const shot=async name=>{if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:!(await page.locator('dialog').count())});}};
  const open=async()=>{await page.locator('[data-customer=ana]').click();await page.locator('#serveCustomer').waitFor();};
  const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('dialog')].every(d=>d.scrollWidth<=d.clientWidth+1)),true);
  await page.goto('https://loyalty.test/');await show();await page.locator('[data-customer=ana]').waitFor();
  await page.locator('#q').fill('Ana');await page.locator('#sort').selectOption('SPENT');await page.locator('#customerFilters>button').click();await page.locator('[data-customer=ana]').waitFor();
  assert.equal(calls.filter(x=>x.path.endsWith('customer-activity')).at(-1).query.sort,'SPENT');await shot('customers-desktop');
  await open();assert.equal(await page.locator('dialog').getAttribute('aria-labelledby'),'profileTitle');assert.match(await page.locator('#profileBody').textContent(),/Falta 1 sello/);
  assert.equal(await page.locator('.timeline-event').count(),20);await page.locator('.timeline-event details summary').first().click();
  assert.match(await page.locator('.timeline-event details').first().textContent(),/REC-0/);assert.match(await page.locator('.receipt-totals').first().textContent(),/9.00 USD/);assert.equal(await page.locator('.timeline-event img').count(),0);await overflow();await shot('customer-profile-desktop');
  await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});assert.equal(await page.locator('#q').inputValue(),'Ana');assert.equal(await page.locator('#sort').inputValue(),'SPENT');assert.equal(await page.locator('[data-customer=ana]').evaluate(e=>e===document.activeElement),true);
  checks.push('Drawer keeps list filters and focus, shows reward progress and escaped purchase detail');
  await open();await page.locator('#timelineNext').click();await page.waitForFunction(()=>document.querySelectorAll('.timeline-event').length===3);assert.match(await page.locator('#customerTimeline').textContent(),/21–23 de 23/);
  await page.locator('#timelineKind').selectOption('REWARD');await page.waitForFunction(()=>document.querySelectorAll('.timeline-event').length===1);assert.match(await page.locator('#customerTimeline').textContent(),/Descuento de la visita/);
  assert.equal(calls.filter(x=>x.path.endsWith('workspace/ana')).at(-1).query.offset,'0');await page.locator('#timelineBranch').selectOption('centro');await page.waitForFunction(()=>document.querySelector('#customerTimeline').textContent.includes('No hay movimientos'));
  assert.match(await page.locator('.profile-metrics').textContent(),/239.00 USD/);
  failTimeline=true;await page.locator('#timelineKind').selectOption('ALL');await page.locator('#retryTimeline').waitFor();failTimeline=false;await page.locator('#retryTimeline').click();await page.locator('.timeline-event').first().waitFor();
  checks.push('Timeline paginates and filters by branch and type; totals stay all-time; failed requests can retry');
  await page.locator('.profile-section>summary').click();await page.locator('#birthday').fill('12-01');await page.locator('#customerPreferences input[name=confirmed]').check();delayPreferences=true;await page.locator('#customerPreferences button').click();await waitUntil(()=>pendingPreferences);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),true);await page.locator('#serveCustomer').click();assert.equal(await page.locator('#serveCustomer').isVisible(),true);assert.equal(calls.filter(x=>x.path.endsWith('/lookup')).length,0);
  await pendingPreferences();delayPreferences=false;await page.waitForFunction(()=>!document.querySelector('#customerPreferences').hasAttribute('aria-busy'));assert.equal(await page.locator('#customerPreferences input[name=confirmed]').isChecked(),false);
  assert.deepEqual(calls.find(x=>x.method==='PUT').body,{preferences:{birthday:'12-01',marketingConsent:false},customerConfirmed:true});
  await page.locator('#serveCustomer').click();await page.locator('.customer-counter').waitFor();assert.deepEqual(calls.find(x=>x.path.endsWith('/lookup')).body,{cardCode:'FAKE-CARD-000001'});assert.equal(calls.filter(x=>/purchases|redemptions|events/.test(x.path)).length,0);
  checks.push('Explicit preference consent resets after save; busy state blocks exit; Caja only loads the customer');
  await show();await page.locator('[data-customer=ana]').waitFor();await page.locator('#q').fill('An');await page.locator('#q-suggestions [role=option]').waitFor();await page.locator('#q').press('ArrowDown');await page.locator('#q').press('Enter');await page.locator('#serveCustomer').waitFor();await page.locator('#closeCustomer').click();assert.equal(await page.locator('#q').evaluate(e=>e===document.activeElement),true);
  delayProfile=true;await page.locator('[data-customer=ana]').click();await waitUntil(()=>pendingProfile);await page.locator('#closeCustomer').click();await pendingProfile();delayProfile=false;await page.waitForTimeout(80);assert.equal(await page.locator('dialog').count(),0);
  failProfile=true;await page.locator('[data-customer=ana]').click();await page.locator('#retryProfile').waitFor();failProfile=false;await page.locator('#retryProfile').click();await page.locator('#serveCustomer').waitFor();await page.locator('#closeCustomer').click();
  checks.push('Predictive keyboard selection, closed-drawer stale suppression, loading and error retry states');
  await show('overview');await page.locator('[data-client-segment=NEAR]').click();await page.locator('[data-segment=NEAR]').waitFor();assert.equal(await page.locator('[data-segment=NEAR]').getAttribute('aria-pressed'),'true');assert.equal(calls.filter(x=>x.path.endsWith('customer-activity')).at(-1).query.segment,'NEAR');
  await show('overview');await page.locator('[data-profile=ana]').click();await page.locator('#serveCustomer').waitFor();await page.locator('#closeCustomer').click();
  checks.push('Dashboard opportunities open the right group; recent customer opens their profile');
  await show();await page.locator('[data-customer=ana]').waitFor();await page.setViewportSize({width:390,height:844});await open();await overflow();await shot('customer-profile-mobile');await page.setViewportSize({width:320,height:780});await overflow();await page.locator('#closeCustomer').click();await overflow();
  await open();await page.locator('#recoverCustomerWallet').click();await page.locator('#walletRecoveryPanel').waitFor({state:'visible'});assert.equal(await page.locator('#restoreReason').inputValue(),'CONNECTION_REPAIR');assert.equal(await page.locator('#restoreIssue input[name=identityVerified]').isChecked(),false);assert.equal(calls.filter(x=>x.path.endsWith('/wallet/restore')).length,0);checks.push('Visible profile action opens the correct customer recovery panel without authorizing recovery');
  await show();await page.locator('[data-customer=ana]').waitFor();
  delayProfile=true;pendingProfile=null;await page.locator('[data-customer=ana]').click();await waitUntil(()=>pendingProfile);await page.evaluate(()=>{state.token='OTHER-SESSION';});await pendingProfile();delayProfile=false;await page.waitForTimeout(80);assert.equal(await page.locator('#serveCustomer').count(),0);await page.locator('#closeCustomer').click();
  checks.push('320/390 px layouts fit; stale profile from a changed session is not displayed');;
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'CUSTOMER_WORKSPACE_UI_PASS',checks},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exit(1);});

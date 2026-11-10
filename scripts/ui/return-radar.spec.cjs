// Fictional, fully intercepted network. Opening the radar must never mutate a customer.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty'),evidence=process.env.LOYALTY_UI_EVIDENCE;
const staff={role:'OWNER',business:{id:'fiction',name:'Café Aurora · Ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[],rewards:[]};
const rows=Array.from({length:23},(_,i)=>({id:'c'+i,name:i===0?'Ana <img src=x onerror=alert(1)>':'Cliente de ejemplo '+i,cardSuffix:'0000'+i,purchases:8,spentMinor:9000,lastPurchase:'2026-10-25T17:00:00Z',daysSinceLastPurchase:14,sampleDays:8,cadenceDays:7,attentionAfterDays:11,late:i<4,readyRewards:i%2,nearRewards:1}));
const base={summary:{total:23,late:4,ready:12,near:23,first:0,rhythmic:23},asOf:'2026-11-08T17:00:00Z',timezone:'America/Guayaquil',cohorts:[{month:'2026-10-01',starters:12,eligible:8,returned:5,rate:62.5},{month:'2026-11-01',starters:5,eligible:0,returned:0,rate:null}]};
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const calls=[],errors=[],checks=[];let pending,delay=false,fail=false;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/api/')){
    calls.push({path:u.pathname,method:req.method(),q:Object.fromEntries(u.searchParams)});
    if(u.pathname==='/api/staff/access')return route.fulfill({json:{canOperate:true}});
    if(u.pathname.endsWith('/return-radar')){
     const off=Number(u.searchParams.get('offset')||0),q=u.searchParams.get('q'),items=q?[]:rows.slice(off,off+20);
     const respond=()=>route.fulfill(fail?{status:503,json:{message:'Reintenta la consulta.'}}:{json:{...base,items,total:q?0:23,offset:off,hasMore:!q&&off+20<23}});
     if(delay){pending=respond;return;}return respond();
    }
    if(u.pathname.startsWith('/api/staff/customer-workspace/'))return route.fulfill({json:{member:{id:'c0',name:'Ana',cardCode:'FICTION',joinedAt:'2026-08-01'},summary:{purchases:8,spentMinor:9000,claimedRewards:0},rewardProgress:[],preferences:{marketingConsent:false},timeline:{items:[],total:0,offset:0,hasMore:false}}});
    throw new Error('Unexpected request '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));
   if(name==='index.html')body=body.toString().replace('</head>','<link rel="stylesheet" href="/commercial.css"><script src="/commercial.js" defer></script><script src="/promotion-editor.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const show=async(role='OWNER',tab='radar')=>page.evaluate(({staff,role,tab})=>{state.token='FIXTURE';state.data={...staff,role};state.tab=tab;renderMerchant();},{staff,role,tab});
  const wait=async fn=>{for(let i=0;i<300&&!fn();i++)await new Promise(r=>setTimeout(r,10));assert.ok(fn());};
  const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.goto('https://loyalty.test/');await show();await page.locator('.radar-customer').first().waitFor();
  assert.equal(await page.locator('.radar-customer').count(),20);assert.equal(await page.locator('.radar-customer img').count(),0);assert.match(await page.locator('.radar-cohorts').textContent(),/62.5%/);assert.match(await page.locator('.radar-cohorts').textContent(),/En observación/);
  await fit();assert.ok((await page.locator('#radarQuery').boundingBox()).width>300);assert.ok((await page.locator('#radarSearch button').boundingBox()).width<200);if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'radar-desktop.png'),fullPage:true});}
  await page.locator('#radarNext').click();await page.waitForFunction(()=>document.querySelectorAll('.radar-customer').length===3);assert.match(await page.locator('#radarCount').textContent(),/21–23 de 23/);
  await page.locator('[data-radar-segment=LATE]').click();await page.waitForFunction(()=>document.querySelectorAll('.radar-customer').length===20);assert.equal(calls.at(-1).q.offset,'0');assert.equal(calls.at(-1).q.segment,'LATE');
  await page.locator('[data-radar-customer=c0]').click();await page.locator('#profileTitle').waitFor();await page.locator('#closeCustomer').click();assert.equal(await page.locator('#radarQuery').count(),1);
  checks.push('Owner navigation, escaped names, real profile action, distinct cohorts, filters and pagination');
  await page.setViewportSize({width:390,height:844});await fit();if(evidence)await page.screenshot({path:path.join(evidence,'radar-mobile.png'),fullPage:true});await page.setViewportSize({width:320,height:780});await fit();
  await page.locator('#radarQuery').fill('nadie');await page.waitForFunction(()=>document.querySelector('#radarResults')?.textContent.includes('No encontramos'));assert.equal(await page.locator('#radarQuery').inputValue(),'nadie');assert.equal(await page.locator('#radarNext').isDisabled(),true);
  checks.push('320/390px layout, keyboard search and no-match state');
  fail=true;await page.locator('#radarRefresh').click();await page.locator('#radarRetry').waitFor();fail=false;await page.locator('#radarRetry').click();await page.waitForFunction(()=>document.querySelector('#radarResults')?.textContent.includes('No encontramos'));
  delay=true;await page.locator('#radarRefresh').click();await wait(()=>pending);await show('OWNER','sales');delay=false;await pending();pending=null;assert.equal(await page.locator('.radar-customer').count(),0);
  await show();await page.locator('.radar-customer').first().waitFor();delay=true;await page.locator('#radarRefresh').click();await wait(()=>pending);await page.evaluate(()=>{state.token='OTHER_SESSION';document.querySelector('#content').innerHTML='<p>Otra sesión</p>';});delay=false;await pending();pending=null;assert.equal(await page.locator('#content').textContent(),'Otra sesión');
  checks.push('Recoverable error; late response ignored after navigation or session change');
  await show();await page.locator('.radar-customer').first().waitFor();await page.evaluate(()=>window.renderReturnRadar(document.querySelector('#content'),{path:'/api/platform/tenants/fiction/return-radar',valid:()=>true,owner:false}));await page.locator('.radar-customer').first().waitFor();assert.equal(await page.locator('[data-radar-customer]').count(),0);assert.ok(calls.some(x=>x.path==='/api/platform/tenants/fiction/return-radar'));
  await show('CASHIER','sales');assert.equal(await page.locator('[data-tab=radar]').count(),0);
  assert.ok(calls.every(c=>c.method==='GET'));assert.deepEqual(errors,[]);checks.push('Private platform route, no owner-only action for admin, cashier exclusion and GET-only traffic');
  console.log(JSON.stringify({status:'RETURN_RADAR_UI_PASS',checks},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exit(1);});

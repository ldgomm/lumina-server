// All network is intercepted. This suite never creates a real business, promotion or Wallet.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/web'),evidence=process.env.LOYALTY_UI_EVIDENCE;
const catalog=JSON.parse(fs.readFileSync(path.resolve(web,'../business-categories.json'),'utf8'));
const categoryOptions=catalog.map(({id,name,group})=>({id,name,group}));
const profile={legalName:'Negocio Ejemplo S.A.',ruc:'1790012345001',activity:'Venta de alimentos',category:'CAFE',contactName:'Persona de prueba',email:'persona@example.test',phone:'0991234567',province:'Pichincha',city:'Quito',address:'Dirección ficticia 123',website:'',socialLinks:{}};
let staff={role:'OWNER',business:{id:'example',name:'Negocio de prueba',currency:'USD',timezone:'America/Guayaquil'},branches:[{id:'centro',name:'Centro'},{id:'norte',name:'Norte'}],programs:[],rewards:[]};
function forCategory(id,source='SELECTED'){const c=catalog.find(c=>c.id===id);return {version:1,category:{id:c.id,name:c.name,source},productExamples:c.productExamples,examples:c.examples};}
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const checks=[],calls=[],errors=[];let catalogMode='normal',pendingCatalog;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/api/')){
    calls.push({path:u.pathname,method:req.method(),body:req.postDataJSON(),key:req.headers()['idempotency-key']});
    if(u.pathname==='/api/platform/business-categories'){
     if(catalogMode==='fail')return route.fulfill({status:503,json:{message:'Catálogo temporalmente no disponible'}});
     if(catalogMode==='slow'){pendingCatalog=()=>route.fulfill({json:{version:1,categories:categoryOptions}});return;}
     return route.fulfill({json:{version:1,categories:categoryOptions}});
    }
    if(u.pathname==='/api/platform/tenants')return route.fulfill({json:{items:[{...staff.business,state:'ACTIVE',clients:0,balanceMinor:0}],nextOffset:null}});
    if(u.pathname==='/api/staff/access')return route.fulfill({json:{canOperate:true}});
    if(u.pathname==='/api/staff/dashboard')return route.fulfill({json:staff});
    if(u.pathname==='/api/staff/business-profile'||u.pathname.endsWith('/profile'))return route.fulfill({json:{business:staff.business,version:1,profile,categoryOptions,categoryContext:forCategory(profile.category).category,requests:[]}});
    if(['/api/staff/promotion-templates','/api/staff/promotion-setups'].includes(u.pathname))return route.fulfill({status:201,json:{programId:'fictional-program',rewardId:'fictional-reward'}});
    throw Error('Unexpected API '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname==='/platform'?'platform.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));
   if(name==='index.html')body=body.toString().replace('</head>','<link rel="stylesheet" href="/commercial.css"><script src="/commercial.js" defer></script><script src="/promotion-editor.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const wait=async fn=>{for(let i=0;i<400&&!fn();i++)await new Promise(r=>setTimeout(r,10));assert.ok(fn(),'Expected intercepted request');};
  const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const shot=async name=>{if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});}};
  const writes=()=>calls.filter(c=>c.method==='POST'||c.method==='PUT');
  const show=async(id,source='SELECTED')=>{
   staff={...staff,promotionSuggestions:forCategory(id,source)};
   await page.evaluate(staff=>{state.token='FICTIONAL';state.data=staff;state.tab='programs';renderMerchant();},staff);
   await page.locator('#newPromotion').click();
  };
  await page.goto('https://loyalty.test/');
  for(const c of catalog){
   await show(c.id);
   assert.equal(await page.locator('#businessExamplesTitle').textContent(),'Ejemplos para '+c.name);
   assert.deepEqual(await page.locator('[data-business-example]').evaluateAll(nodes=>nodes.map(n=>n.dataset.businessExample)),c.examples.map(e=>e.id));
   assert.equal(await page.locator('[data-promotion-method]').count(),4);
   await page.locator('[data-business-example]').first().click();
   const e=c.examples[0];assert.equal(await page.locator('#promoName').inputValue(),e.name);
   assert.equal(await page.locator('#group').inputValue(),e.group);assert.equal(await page.locator('#nth').inputValue(),String(e.nth));
   assert.equal(await page.locator('#percent').inputValue(),String(e.percentBps/100));assert.equal(await page.locator('#mode').inputValue(),e.countUnits?'units':'visits');
   assert.equal(await page.locator('#group').getAttribute('placeholder'),c.productExamples.slice(0,3).join(', '));
   assert.deepEqual(await page.locator('#promotionCategories option').evaluateAll(nodes=>nodes.map(n=>n.value)),c.productExamples);
  }
  assert.equal(writes().length,0);checks.push('All 42 categories show exactly their four own examples, eligible products and editable counting rules without writes');
  await show('CAFE');assert.doesNotMatch(await page.locator('.business-promotion-examples').textContent(),/pizza|cabello|barba|ropa/i);
  await shot('categories-cafe-desktop');await page.setViewportSize({width:390,height:844});await fit();await shot('categories-cafe-mobile');
  await page.setViewportSize({width:320,height:780});await fit();
  await page.locator('[data-business-example="cafe-2"]').click();
  await page.locator('#promoName').fill('Mi beneficio a medida');await page.locator('#nth').fill('7');await page.locator('#percent').fill('45');
  await page.locator('#rewardName').fill('45% en un café');await page.locator('[data-wizard-panel="1"] details summary').click();
  await page.locator('#startsAt').fill('2026-12-01T09:00');await page.locator('[name=promotionBranch][value=norte]').check();
  await page.locator('#promotionBack').click();await page.locator('[data-business-example="cafe-1"]').click();
  await page.locator('#replaceExampleConfirm').waitFor({state:'visible'});await fit();await page.locator('#keepExampleDraft').click();
  await page.locator('#promotionNext').click();assert.equal(await page.locator('#promoName').inputValue(),'Mi beneficio a medida');assert.equal(await page.locator('#nth').inputValue(),'7');
  await page.locator('#promotionNext').click();assert.match(await page.locator('#promotionReview').textContent(),/6 sellos/);assert.match(await page.locator('#promotionReview').textContent(),/45%/);
  assert.equal(writes().length,0);
  await page.locator('#promotionBack').click();await page.locator('#promotionBack').click();await page.locator('[data-business-example="cafe-1"]').click();await page.locator('#replaceExampleDraft').click();
  assert.equal(await page.locator('#nth').inputValue(),'6');assert.equal(await page.locator('#startsAt').inputValue(),'2026-12-01T09:00');assert.equal(await page.locator('[name=promotionBranch][value=norte]').isChecked(),true);
  checks.push('Edited draft survives navigation; replacement requires explicit choice and preserves dates and branches at 320px');
  await page.setViewportSize({width:1440,height:1050});await show('CAFE');await page.locator('[data-business-example="cafe-points"]').click();
  await page.locator('#pointCost').fill('200');await page.locator('#rewardName').fill('Premio elegido por el dueño');await page.locator('#promotionNext').click();
  assert.match(await page.locator('#promotionReview').textContent(),/200 puntos/);assert.equal(writes().length,0);
  await page.locator('#promotionNext').click();await page.locator('#newPromotion').waitFor();
  const points=writes()[0];assert.equal(points.path,'/api/staff/promotion-setups');assert.equal(points.body.rewardCost,200);assert.equal(points.body.program.kind,'POINTS');assert.ok(points.key);
  await show('APPLIANCES');await page.locator('[data-business-example="appliances-cashback"]').click();await page.locator('#cashbackCost').fill('7.25');await page.locator('#promotionNext').click();await page.locator('#promotionNext').click();await page.locator('#newPromotion').waitFor();
  assert.equal(writes()[1].body.rewardCost,725);assert.equal(writes()[1].body.program.cashbackBps,500);
  await show('CLOTHING');await page.locator('[data-business-example="clothing-1"]').click();await page.locator('#nth').fill('3');await page.locator('#percent').fill('30');await page.locator('#rewardName').fill('30% en ropa');await page.locator('#promotionNext').click();await page.locator('#promotionNext').click();await page.locator('#newPromotion').waitFor();
  assert.equal(writes()[2].path,'/api/staff/promotion-templates');assert.equal(writes()[2].body.nth,3);assert.equal(writes()[2].body.percentBps,3000);assert.equal(writes()[2].body.countUnits,false);
  checks.push('Only final review creates a promotion; points goal 200, exact cashback cents and custom purchase discounts reach normal endpoints');
  await show('CAFE','ACTIVITY');assert.match(await page.locator('.business-promotion-examples').textContent(),/Según tu actividad registrada/);
  await show('GENERAL','GENERAL');assert.match(await page.locator('.business-promotion-examples').textContent(),/asigne tu tipo de negocio/);
  await page.evaluate(staff=>{state.data=staff;state.tab='business';renderMerchant();},staff);await page.locator('#businessProfileForm').waitFor();
  assert.equal(await page.locator('#category').isDisabled(),true);assert.equal(await page.locator('#category').inputValue(),'CAFE');assert.equal(await page.locator('#jumpToProfileRequest').isVisible(),true);
  checks.push('Legacy fallback is explained and owner category changes use the administrator correction flow');
  await page.goto('https://loyalty.test/platform');await page.locator('#platformToken').fill('FICTIONAL');await page.locator('#platformLogin button').click();
  catalogMode='fail';await page.locator('#newBusiness').click();await page.locator('#retryCategoryLoad').waitFor();assert.equal(await page.locator('#businessRegistration').count(),0);
  catalogMode='normal';await page.locator('#retryCategoryLoad').click();await page.locator('#category').waitFor();
  assert.equal(await page.locator('#category option').count(),43);assert.equal(await page.locator('#category').getAttribute('required'),'');
  await page.locator('#name').fill('Nombre de marca');for(const key of ['legalName','ruc','activity'])await page.locator('#'+key).fill(profile[key]);await page.locator('#registrationNext').click();
  assert.equal(await page.locator('[data-registration-panel="0"]').isVisible(),true);assert.equal(await page.locator('#category').evaluate(e=>e.validity.valueMissing),true);
  await page.locator('#category').selectOption('CAFE');await page.locator('#registrationNext').click();for(const key of ['contactName','email','phone','province','city','address'])await page.locator('#'+key).fill(profile[key]);await page.locator('#registrationNext').click();
  assert.match(await page.locator('#registrationSummary').textContent(),/Cafetería/);assert.equal(writes().length,3);
  await page.locator('#registrationBack').click();await page.locator('#registrationBack').click();assert.equal(await page.locator('#activity').inputValue(),'Venta de alimentos');assert.equal(await page.locator('#category').inputValue(),'CAFE');
  await page.setViewportSize({width:390,height:844});await fit();await shot('categories-registration-mobile');await page.locator('#closeRegistration').click();
  checks.push('Registration requires a catalog choice separate from fiscal activity, preserves it between steps and retries catalog errors');
  catalogMode='slow';await page.locator('#newBusiness').click();await wait(()=>pendingCatalog);await page.locator('#cancelCategoryLoad').click();await pendingCatalog();await page.waitForTimeout(80);assert.equal(await page.locator('#commercialDialog').count(),0);
  pendingCatalog=null;await page.locator('#newBusiness').click();await wait(()=>pendingCatalog);await page.evaluate(()=>{state.token='CHANGED-SESSION';});await pendingCatalog();await page.waitForTimeout(80);assert.equal(await page.locator('#commercialDialog').count(),0);
  assert.deepEqual(errors,[]);checks.push('Closed dialog and changed session ignore delayed catalog responses');
  console.log(JSON.stringify({status:'BUSINESS_CATEGORIES_UI_PASS',checks,network:'Fully intercepted fictional data only'},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});

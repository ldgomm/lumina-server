// Fictional data and fully intercepted network; no customer account or real Wallet is contacted.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty'),evidence=process.env.LOYALTY_UI_EVIDENCE,artifacts=process.env.LOYALTY_ARTWORK_EVIDENCE;
const config={name:'Pizza a tu manera',kind:'STAMPS',active:true,stampsPerPurchase:1,minimumSpendMinor:100,unitMinor:100,pointsPerUnit:1,cashbackBps:500,productGroup:'pizza artesanal',countUnits:true,branchIds:['centro'],window:{startsAt:null,endsAt:null,weekdays:[2,4,6],localStart:'16:00',localEnd:'22:00'},bonuses:[{priority:3,multiplier:2,branchIds:['centro'],window:{startsAt:null,endsAt:null,weekdays:[4],localStart:'18:00',localEnd:'19:00'}}]};
const staff={role:'OWNER',business:{id:'fiction',name:'Pizzería de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[{id:'centro',name:'Centro'}],programs:[{id:'promo',version:4,config:structuredClone(config)}],rewards:[{id:'reward',programId:'promo',active:true,cost:5,name:'Pizza a elección',version:1}]};
const design={displayName:'Pizzería de ejemplo',background:'#0b1f3a',foreground:'#ffffff',label:'#ffffff',featuredProgramId:'promo',stampSymbol:'🍕',artworkStyle:'GRADIENT',welcome:'Bienvenido',usage:'Presenta el QR en caja.',birthdayMessage:'¡Feliz cumpleaños!',logoPng:null};
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const calls=[],errors=[],checks=[];let pendingStatus,conflict=false,pendingRecovery;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());assert.equal(u.origin,'https://loyalty.test');
   if(u.pathname.startsWith('/wallet/art/')){
    const file=artifacts&&path.join(artifacts,u.pathname.slice(1)+'.'+(u.searchParams.get('layout')||'google')+'.png');
    if(!file||!fs.existsSync(file))throw Error('Missing rendered artwork '+u.pathname+u.search);
    return route.fulfill({body:fs.readFileSync(file),contentType:'image/png'});
   }
   if(u.pathname.startsWith('/api/')){
    const payload=req.postDataJSON();calls.push({url:u.pathname,method:req.method(),payload});
    if(u.pathname==='/api/staff/programs/promo'){
     pendingStatus=async()=>{if(conflict)return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'Cambió la promoción.'}});staff.programs[0].config=payload.program;staff.programs[0].version++;return route.fulfill({json:staff.programs[0]});};return;
    }
    if(u.pathname==='/api/staff/dashboard')return route.fulfill({json:staff});
    if(u.pathname==='/api/staff/access')return route.fulfill({json:{canOperate:true}});
    if(u.pathname==='/api/staff/wallet-design'){if(req.method()==='PUT')Object.assign(design,payload.design);return route.fulfill({json:{design,version:2}});}
    if(u.pathname==='/api/staff/members/lookup')return route.fulfill({json:{member:{id:'member',name:'Ana de ejemplo',revision:1,cardCode:'FAKE-QR'},balances:[{programId:'promo',kind:'STAMPS',name:config.name,available:4}],rewards:staff.rewards}});
    if(u.pathname==='/api/staff/wallet/restore'){pendingRecovery=()=>route.fulfill({json:{path:'/join/demo#restore=fictitious',qrData:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}});return;}
    throw Error('Unexpected API '+u.pathname);
   }
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/promotion-editor.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const show=async(tab,role='OWNER')=>page.evaluate(({data,tab,role})=>{state.data={...data,role};state.token='FICTIONAL';state.tab=tab;renderMerchant();},{data:staff,tab,role});
  const wait=async fn=>{for(let i=0;i<500&&!fn();i++)await new Promise(r=>setTimeout(r,10));assert.ok(fn());};
  const shot=async name=>{if(evidence){await page.evaluate(()=>{clearTimeout(noticeTimer);document.querySelector('#notice').style.display='none';});fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:!(await page.locator('dialog').count())});}};
  const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.goto('https://loyalty.test/');await show('programs');await page.locator('[data-program-status]').waitFor();
  assert.equal(await page.locator('[data-program-status]').textContent(),'Pausar promoción');await shot('promotion-actions-desktop');
  await page.locator('[data-program-status]').click();assert.match(await page.locator('#programStatusDialog').textContent(),/saldos y el historial se conservan/);await page.locator('#cancelProgramStatus').click();assert.equal(calls.filter(x=>x.method==='PUT').length,0);
  await page.locator('[data-program-status]').click();await page.locator('#programStatusForm button[type=submit]').click();await wait(()=>pendingStatus);await page.keyboard.press('Escape');assert.equal(await page.locator('#programStatusDialog').isVisible(),true);assert.equal(await page.locator('#cancelProgramStatus').isDisabled(),true);
  assert.deepEqual(calls.find(x=>x.method==='PUT').payload,{expectedVersion:4,program:{...config,active:false}});
  await pendingStatus();await page.locator('[data-program-status]').filter({hasText:'Reactivar'}).waitFor();assert.equal(calls.filter(x=>x.method==='PUT').length,1);checks.push('Visible pause preserves every advanced rule; confirmation, single request and busy guard');
  pendingStatus=null;await page.locator('[data-program-status]').click();await page.locator('#programStatusForm button[type=submit]').click();await wait(()=>pendingStatus);await pendingStatus();await page.locator('[data-program-status]').filter({hasText:'Pausar'}).waitFor();assert.equal(staff.programs[0].config.active,true);
  conflict=true;pendingStatus=null;await page.locator('[data-program-status]').click();await page.locator('#programStatusForm button[type=submit]').click();await wait(()=>pendingStatus);await pendingStatus();await page.locator('#reloadProgramStatus').waitFor();assert.match(await page.locator('.form-feedback').textContent(),/state vigente/);await page.locator('#reloadProgramStatus').click();await page.locator('[data-program-status]').waitFor();conflict=false;checks.push('Resume keeps balance rules; stale version offers explicit refresh');
  await page.setViewportSize({width:390,height:844});await fit();await shot('promotion-actions-mobile');
  await show('sales');await page.locator('#value').fill('FAKE-QR');await page.locator('#lookup button').first().click();await page.locator('#openWalletRecovery').waitFor();assert.equal(await page.locator('#walletRecoveryPanel').isVisible(),false);await fit();await shot('recovery-action-mobile');
  await page.locator('#openWalletRecovery').click();await page.locator('#walletRecoveryPanel').waitFor({state:'visible'});assert.equal(await page.locator('#restoreReason').inputValue(),'CONNECTION_REPAIR');await page.locator('#restoreIssue button').click();assert.equal(calls.filter(x=>x.url.endsWith('/restore')).length,0);
  await page.locator('#restoreIssue input[name=identityVerified]').check();await page.locator('#restoreIssue button').click();await wait(()=>pendingRecovery);assert.equal(await page.locator('#changeCustomer').isDisabled(),true);assert.equal(await page.locator('#closeWalletRecovery').isDisabled(),true);await pendingRecovery();await page.locator('#restoreResult a').waitFor();assert.equal(await page.locator('#restoreIssue input[name=identityVerified]').isChecked(),false);assert.deepEqual(calls.find(x=>x.url.endsWith('/restore')).payload,{memberId:'member',reason:'CONNECTION_REPAIR',identityVerified:true});await fit();await shot('recovery-qr-mobile');
  await page.evaluate(()=>{window.originalNow=Date.now;Date.now=()=>window.originalNow()+300001;});await page.waitForFunction(()=>document.querySelector('#restoreResult')?.textContent.includes('venció'));assert.equal(await page.locator('#restoreResult a,#restoreResult img').count(),0);await page.evaluate(()=>{Date.now=window.originalNow;});checks.push('Visible recovery requires identity, blocks concurrent operations, preserves member and removes expired QR');
  await show('sales','CASHIER');await page.locator('#value').fill('FAKE-QR');await page.locator('#lookup button').first().click();await page.locator('.customer-counter').waitFor();assert.equal(await page.locator('#openWalletRecovery,#restoreIssue').count(),0);checks.push('Cashier cannot see owner recovery actions');
  await show('design');await page.locator('#walletDesign').waitFor();await page.waitForFunction(()=>document.querySelector('#appleStampArtwork').complete&&document.querySelector('#appleStampArtwork').naturalWidth>0);
  assert.match(await page.locator('#appleStampArtwork').getAttribute('src'),/GRADIENT\/6\/0b1f3a\/4\/5.png\?layout=poster/);await fit();await shot('pizza-apple-mobile');
  await page.locator('[data-preview-provider=google]').click();await page.waitForFunction(()=>document.querySelector('#googleStampArtwork').complete&&document.querySelector('#googleStampArtwork').naturalWidth>0);await fit();await shot('pizza-google-mobile');
  await page.locator('#stampSymbol').selectOption('☕');await page.locator('#artworkStyle').selectOption('SOLID');await page.locator('[data-wallet-example=ready]').click();await page.waitForFunction(()=>document.querySelector('#googleStampArtwork').src.includes('/SOLID/5/0b1f3a/5/5.png')&&document.querySelector('#googleStampArtwork').complete);await shot('coffee-google-mobile');
  await page.locator('#saveDesign').click();await page.locator('#walletDesign').waitFor();const saved=calls.find(x=>x.url.endsWith('/wallet-design')&&x.method==='PUT');assert.equal(saved.payload.design.stampSymbol,'☕');assert.equal(saved.payload.design.artworkStyle,'SOLID');checks.push('Real rendered Apple and Google assets follow symbol, gradient and progress; saved choices are shared');
  await page.setViewportSize({width:320,height:780});await fit();assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'WALLET_CONTROLS_UI_PASS',checks},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exit(1);});

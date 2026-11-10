// Fully intercepted fictional data. Never connects to a real business or Wallet provider.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const config={name:'Puntos por regresar',kind:'POINTS',active:true,stampsPerPurchase:1,minimumSpendMinor:100,unitMinor:100,pointsPerUnit:1,cashbackBps:500,productGroup:'',countUnits:false,branchIds:[],window:{startsAt:null,endsAt:null,weekdays:[1,2,3,4,5,6,7],localStart:null,localEnd:null},bonuses:[]};
const data={role:'OWNER',business:{id:'fictional',name:'Negocio de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[{id:'centre',name:'Centro'}],programs:[{id:'points',version:3,config},{id:'stamps',version:2,config:{...config,name:'Visitas',kind:'STAMPS'}},{id:'cash',version:1,config:{...config,name:'Cashback',kind:'CASHBACK',active:false}}],rewards:[{id:'r1',programId:'points',name:'Premio a elección',cost:100,version:2,active:true,benefit:null},{id:'r2',programId:'points',name:'Otra opción',cost:300,version:1,active:true,benefit:null},{id:'r3',programId:'stamps',name:'Descuento café',cost:4,version:1,active:true,benefit:{discountBps:5000,group:'café',scope:'ITEM'},benefitText:'50% en una unidad elegible de café'},{id:'r4',programId:'cash',name:'Saldo para premio',cost:525,version:1,active:false,benefit:null}]};
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const calls=[],errors=[],checks=[];let pending,conflict=false;
 try{
  const page=await browser.newPage({viewport:{width:1366,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://loyalty.test');
   if(url.pathname.startsWith('/api/')){
    calls.push({path:url.pathname,method:req.method(),body:req.postDataJSON()});
    if(url.pathname==='/api/staff/dashboard')return route.fulfill({json:data});
    if(url.pathname==='/api/staff/access')return route.fulfill({json:{canOperate:true}});
    if(url.pathname.startsWith('/api/staff/rewards/')){
     const body=req.postDataJSON(),reward=data.rewards.find(r=>r.id===url.pathname.split('/').pop());
     pending=async()=>{pending=null;if(conflict)return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'Cambió el premio'}});Object.assign(reward,body.reward,{version:reward.version+1});return route.fulfill({json:{id:reward.id,version:reward.version}});};return;
    }
    throw Error('Unexpected API '+url.pathname);
   }
   const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path.join(web,name)))return route.fulfill({status:404});
   let body=fs.readFileSync(path.join(web,name));if(name==='index.html')body=body.toString().replace('</head>','<script src="/promotion-editor.js" defer></script><script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
   return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  const show=async(tab='programs',role='OWNER')=>page.evaluate(({data,tab,role})=>{state.data={...data,role};state.tab=tab;state.token='FICTIONAL';renderMerchant();},{data,tab,role});
  const open=async(id)=>{await page.locator('[data-edit-reward-goal="'+id+'"]').click();await page.locator('#rewardGoalDialog').waitFor();};
  const wait=async()=>{for(let i=0;i<500&&!pending;i++)await new Promise(r=>setTimeout(r,10));assert.ok(pending);};
  const puts=()=>calls.filter(x=>x.method==='PUT');
  const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.goto('https://loyalty.test/');await show();
  assert.match(await page.locator('[data-reward-goals=points]').textContent(),/Puntos para canjear: 100 puntos/);
  assert.equal(await page.locator('[data-reward-goals=points] button').count(),2);
  await open('r1');await page.locator('#rewardGoalCost').fill('200');assert.match(await page.locator('#rewardGoalPreview').textContent(),/100 puntos → Nueva meta: 200 puntos/);
  assert.equal(await page.locator('#saveRewardGoal').isDisabled(),true);await page.locator('#cancelRewardGoal').click();assert.equal(puts().length,0);
  await open('r1');await page.locator('#rewardGoalCost').fill('200');await page.locator('#rewardGoalAcknowledged').check();await page.locator('#saveRewardGoal').click();await wait();
  await page.evaluate(()=>document.querySelector('#rewardGoalForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await page.keyboard.press('Escape');assert.equal(await page.locator('#rewardGoalDialog').isVisible(),true);assert.equal(await page.locator('#cancelRewardGoal').isDisabled(),true);assert.equal(puts().length,1);
  assert.deepEqual(puts()[0].body,{expectedVersion:2,reward:{programId:'points',name:'Premio a elección',cost:200,active:true,benefit:null}});
  await pending();await page.locator('#rewardGoalDialog').waitFor({state:'detached'});assert.match(await page.locator('[data-reward-goals=points]').textContent(),/200 puntos/);assert.equal(data.rewards[1].cost,300);checks.push('Visible per-reward goal, explicit increase acknowledgement, cancel and duplicate-submit protection');
  await page.locator('[data-program-edit=points]').click();await page.locator('#name').fill('Borrador de promoción');await open('r1');await page.locator('#rewardGoalCost').fill('50');assert.equal(await page.locator('#rewardGoalWarning').isVisible(),false);await page.locator('#saveRewardGoal').click();await wait();await pending();await page.locator('#rewardGoalDialog').waitFor({state:'detached'});assert.equal(await page.locator('#name').inputValue(),'Borrador de promoción');assert.equal(puts().filter(p=>p.path.includes('/programs/')).length,0);checks.push('Editing reward from advanced promotion preserves unsaved earning rules');
  await show();await open('r3');assert.equal(await page.locator('#rewardGoalCost').inputValue(),'4');await page.locator('#rewardGoalCost').fill('7');await page.locator('#rewardGoalAcknowledged').check();await page.locator('#saveRewardGoal').click();await wait();assert.deepEqual(puts().at(-1).body.reward.benefit,data.rewards[2].benefit);await pending();await page.locator('#rewardGoalDialog').waitFor({state:'detached'});checks.push('Discount goal keeps exact benefit, category and scope');
  await open('r4');assert.match(await page.locator('#rewardGoalDialog').textContent(),/promoción está pausada/);await page.locator('#rewardGoalCost').locator('..').locator('[data-money-delta="1"]').click();assert.equal(await page.locator('#rewardGoalCost').inputValue(),'6.25');await page.locator('#rewardGoalCost').fill('10.25');await page.locator('#rewardGoalAcknowledged').check();await page.locator('#saveRewardGoal').click();await wait();assert.equal(puts().at(-1).body.reward.cost,1025);assert.equal(puts().at(-1).body.reward.active,false);await pending();await page.locator('#rewardGoalDialog').waitFor({state:'detached'});checks.push('Cashback edits use exact cents and one-dollar controls without reactivating paused rewards');
  await open('r1');for(const value of ['0','1.5','1000000001']){await page.locator('#rewardGoalCost').fill(value);assert.equal(await page.locator('#saveRewardGoal').isDisabled(),true);}
  await page.locator('#rewardGoalCost').fill('200');await page.locator('#rewardGoalAcknowledged').check();await page.locator('#rewardGoalCost').fill('201');assert.equal(await page.locator('#rewardGoalAcknowledged').isChecked(),false);
  await page.locator('#rewardGoalAcknowledged').check();conflict=true;await page.locator('#saveRewardGoal').click();await wait();await pending();await page.locator('#rewardGoalError').waitFor();assert.equal(await page.locator('#rewardGoalCost').inputValue(),'201');assert.equal(await page.locator('#saveRewardGoal').isDisabled(),true);
  data.rewards[0].cost=175;data.rewards[0].version++;await page.locator('#reloadRewardGoal').click();await page.waitForFunction(()=>document.querySelector('#rewardGoalCost').value==='175');conflict=false;assert.equal(await page.locator('#rewardGoalAcknowledged').isChecked(),false);await page.locator('#cancelRewardGoal').click();checks.push('Invalid amounts rejected and stale version retains draft until explicit reload');
  await show('rewards');await page.locator('[data-reward=r3]').click();await page.locator('#rewardGoalDialog').waitFor();assert.equal(await page.locator('#rewardGoalCost').inputValue(),'7');await page.locator('#cancelRewardGoal').click();checks.push('Existing Premios edit uses the same safe editor');
  await show();await page.setViewportSize({width:390,height:844});await fit();await open('r1');await fit();await page.locator('#rewardGoalCost').fill('200');await page.locator('#rewardGoalAcknowledged').check();
  if(process.env.LOYALTY_UI_EVIDENCE){fs.mkdirSync(process.env.LOYALTY_UI_EVIDENCE,{recursive:true});await page.screenshot({path:path.join(process.env.LOYALTY_UI_EVIDENCE,'reward-goal-mobile.png')});}
  await page.locator('#saveRewardGoal').click();await wait();await page.evaluate(()=>{state.token='OTHER_SESSION';state.data={...state.data,business:{id:'other'},rewards:[]};});await pending();await page.locator('#rewardGoalDialog').waitFor({state:'detached'});assert.deepEqual(await page.evaluate(()=>state.data.rewards),[]);checks.push('Mobile layout fits and late response cannot overwrite another session');
  await show('sales','CASHIER');await page.evaluate(()=>window.LoyaltyRewardGoals.open({id:'r1'}));assert.equal(await page.locator('#rewardGoalDialog').count(),0);assert.deepEqual(errors,[]);checks.push('Cashier cannot open owner-only goal editor');
  console.log(JSON.stringify({status:'REWARD_GOALS_UI_PASS',checks},null,2));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exit(1)});

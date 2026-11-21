import {documentFor} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
// Real portal/session/bridge and browser scripts; native engine responses use fictional fixtures.
// This verifies DOM interaction, not physical Wallet installation or browser layout.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {agency,owner,colleague,portal,teamRevision} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
import {fakeLoyalty} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/loyalty-fixture.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const cleanups=[],errors=[],checks=[],t={after:f=>cleanups.push(f)};
const source=(name,native=false)=>readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/'+(native?'presentation/loyalty/':'lumina/presentation/assets/')+name,import.meta.url),'utf8');
function dom(html,url){
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const w=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc}).window;
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.Request=Request;w.Headers=Headers;w.ResizeObserver=class{observe(){}disconnect(){}};w.confirm=()=>false;cleanups.push(()=>w.close());return w;
}
function load(w,name,native=false){const script=w.document.createElement('script');script.textContent=source(name,native);w.document.head.append(script);}
async function settle(predicate){for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI not ready: '+errors.join('; '));}
const reward={id:'reward-fixture',programId:'program-fixture',name:'Premio de prueba',active:true,cost:1,version:1};
const fixture={programs:[{id:'program-fixture',version:1,config:{name:'Visitas',kind:'STAMPS',active:true,minimumSpendMinor:100,stampsPerPurchase:1,branchIds:[]}}],rewards:[reward],member:{member:{id:'member-fixture',name:'Persona ficticia',cardCode:'FICTIONAL-CARD',revision:1},balances:[{programId:'program-fixture',name:'Visitas',kind:'STAMPS',available:3}],rewards:[reward]}};
try{
 const native=await fakeLoyalty(t,null,fixture),world=await portal(t,native.origin,{platformToken:native.platformToken});await agency(world);
 const business=await owner(world,'Negocio ficticio','9'),person=await colleague(world,business.client,{name:'Caja de prueba',document:documentFor('caja-dom@example.test')});
 const tenant=world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',business.id).loyalty_tenant,branch=native.branches.get(tenant)[0].id;
 const assign=async values=>{const r=await business.client.post('/team/'+person.id+'/cashier/save',{revision:teamRevision(world,person.id),branch,...values});assert.equal(r.status,303,r.body);};
 const team=dom((await business.client.get('/team/'+person.id)).body,world.origin+'/team/'+person.id);load(team,'team.js');
 const cashForm=team.document.querySelector('form[action$="/access"]');assert.equal(cashForm.checkValidity(),true);
 const choose=mode=>{cashForm.elements.cash_mode.value=mode;cashForm.elements.cash_mode.dispatchEvent(new team.Event('change',{bubbles:true}));};
 choose('BOTH');assert.equal(cashForm.elements.cash_mode.value,'BOTH');assert.equal(cashForm.checkValidity(),true);
 let before=new team.Event('beforeunload',{cancelable:true});team.dispatchEvent(before);assert.equal(before.defaultPrevented,true);
 choose('REWARDS');assert.equal(cashForm.elements.cash_mode.value,'REWARDS');assert.equal(world.db.get('SELECT COUNT(*) n FROM cash_grants').n,0);
 checks.push('Owner operations use one selector and one Save; changing the draft never grants permissions');
 async function open(values){
  await assign(values);assert.equal((await person.session.get('/wallet')).location,'/cashier');
  const w=dom((await person.session.get('/cashier')).body,world.origin+'/cashier');
  w.fetch=async(resource,options={})=>{
   const url=new URL(String(resource),w.location.href);assert.equal(url.origin,world.origin);
   const h=new Headers(options.headers);assert.equal(h.has('Authorization'),false);assert.equal(h.get('X-Lumina-CSRF'),person.session.csrf);h.set('Cookie',person.session.cookie);h.set('Origin',world.origin);
   return fetch(url,{...options,headers:h});
  };
  for(const name of ['app.js','commercial.js','promotion-editor.js','jsqr.js','scanner.js','wallet-ui.js','engagement.js','experience.js'])load(w,name,true);
  load(w,'wallet-campaigns.js');load(w,'cashier.js');await settle(()=>w.document.querySelector('#lookup'));
  assert.equal(w.document.querySelector('[data-tab=qr]'),null);assert.equal(w.document.querySelector('[data-tab=design]'),null);assert.equal(w.document.querySelector('#staffLogin'),null);assert.equal(w.document.querySelector('#exit').textContent,'Volver a Lúmina');return w;
 }
 async function lookup(w){const f=w.document.querySelector('#lookup');f.elements.value.value='FICTIONAL-CARD';f.requestSubmit(f.querySelector('button'));await settle(()=>w.document.querySelector('#counterChoose')&&!f.hasAttribute('aria-busy'));}
 const w=await open({purchases:'yes',rewards:'yes'});await lookup(w);
 const account=w.document.querySelector('[data-lumina-account]');assert.equal(account.getAttribute('href'),'/account');
 const pending=w.document.querySelector('#purchase');pending.setAttribute('aria-busy','true');account.click();assert.match(w.document.querySelector('#notice').textContent,/Espera a que termine/);pending.removeAttribute('aria-busy');
 const originalLeave=w.loyaltyOperationLeave;let protectedLeave=false;w.loyaltyOperationLeave=()=>{protectedLeave=true;};account.click();assert.equal(protectedLeave,true);w.loyaltyOperationLeave=originalLeave;
 checks.push('Mi cuenta keeps the pending-operation guard; no sign-out control appears inside Caja');

 const f=w.document.querySelector('#purchase'),generate=f.querySelector('[data-reference-for="receipt"] button');
 assert.equal(generate.textContent,'Generar folio');assert.equal(f.querySelector('[data-reference-for="receipt"] select'),null);
 generate.click();assert.match(f.elements.receipt.value,/^REF-[A-F0-9]{16}$/);
 assert.equal(f.elements.description.required,false);
 f.elements.description.value='Café y pan';
 f.elements.receipt.value='FIXTURE-ONE';generate.click();assert.equal(f.elements.receipt.value,'FIXTURE-ONE');f.elements.amount.value='20';f.requestSubmit([...f.querySelectorAll('button')].find(b=>b.type==='submit'));
 await settle(()=>w.document.querySelector('#finishSimplePurchase')&&!f.hasAttribute('aria-busy'));
 assert.match(w.document.querySelector('#purchaseReview').textContent,/Café y pan/);
 const finish=w.document.querySelector('#finishSimplePurchase');finish.requestSubmit();await settle(()=>w.document.querySelector('.counter-receipt'));
 assert.match(w.document.querySelector('.counter-receipt').textContent,/Compra registrada/);assert.equal(native.calls.filter(c=>c.path==='/api/staff/purchases').length,1);assert.ok(native.calls.find(c=>c.path==='/api/staff/purchases').key);
 assert.match(w.document.querySelector('.counter-receipt').textContent,/Café y pan/);
 checks.push('Actual cashier UI → authenticated portal → restricted native bridge: customer lookup, quote, confirmation and purchase receipt');
 w.eval('renderMerchant()');await lookup(w);w.document.querySelector('[data-counter-mode=redemption]').click();w.document.querySelector('#counterChoose').requestSubmit();await settle(()=>w.document.querySelector('#counterConfirm'));
 const confirm=w.document.querySelector('#counterConfirm');assert.equal(confirm.checkValidity(),false);confirm.elements.identityVerified.checked=true;confirm.elements.customerConfirmed.checked=true;confirm.requestSubmit();await settle(()=>w.document.querySelector('.counter-receipt'));
 assert.match(w.document.querySelector('.counter-receipt').textContent,/Canje confirmado/);assert.equal(native.calls.filter(c=>c.path==='/api/staff/counter-redemptions').length,1);
 checks.push('Direct reward redemption requires holder verification and consent, then produces its receipt');
 const purchases=await open({purchases:'yes'});await lookup(purchases);assert.equal(purchases.document.querySelector('[data-counter-mode=redemption]').hidden,true);assert.equal(purchases.document.querySelector('#counterPurchase').hidden,false);
 const discount={...reward,id:'discount-first',name:'Descuento con compra',benefit:{percentBps:1000,scope:'ITEM',group:'cafe'}};
 fixture.member.rewards.unshift(discount);
 const rewards=await open({rewards:'yes'});await lookup(rewards);assert.equal(rewards.document.querySelector('[data-counter-mode=purchase]').hidden,true);assert.equal(rewards.document.querySelector('#counterRedemption').hidden,false);
 await settle(()=>rewards.document.querySelector('#counterPriorityAction')?.hidden===false);
 assert.equal(rewards.document.querySelector('#counterPriorityAction').dataset.reward,reward.id);
 assert.equal(rewards.document.querySelector('#rewardId').value,reward.id);
 assert.equal(native.calls.filter(c=>c.path==='/api/staff/counter-redemptions').length,1);
 checks.push('Purchases-only and rewards-only roles retain useful operations without design, recovery or unauthorized controls');
 const seasonal=dom('<div></div>',world.origin+'/cashier');load(seasonal,'wallet-campaigns.js');
 const program=(name,extra={})=>({config:{name,kind:'STAMPS',active:true,blackFridayYear:2026,blackFridayMessage:'Condiciones propias',branchIds:[],...extra}});
 const seasonalData={branchId:branch,programs:[program('Vigente'),program('Pausada',{active:false}),program('Otra sucursal',{branchIds:['foreign']}),program('Futura',{window:{startsAt:'2026-11-29T05:00:00Z'}}),program('<img src=x>',{blackFridayYear:2025})]};
 const at=Date.parse('2026-11-20T15:00:00Z'),summary=seasonal.luminaCampaignSummary(seasonalData,{cashier:true,at});assert.equal(summary.querySelectorAll('article').length,1);assert.match(summary.textContent,/Vigente/);assert.doesNotMatch(summary.textContent,/Pausada|Otra sucursal|Futura/);
 const all=seasonal.luminaCampaignSummary(seasonalData,{at});assert.equal(all.querySelectorAll('article').length,5);assert.match(all.textContent,/Pausada|Finalizada|Programada/);assert.equal(all.querySelector('img'),null);
 assert.ok(seasonal.luminaCampaignSummary(seasonalData,{cashier:true,at:Date.parse('2026-12-01T04:59:59Z')}));
 assert.equal(seasonal.luminaCampaignSummary(seasonalData,{cashier:true,at:Date.parse('2026-12-01T05:00:00Z')}),null);
 assert.equal(seasonal.luminaCampaignSummary(seasonalData,{cashier:true,at:Date.parse('2027-11-20T15:00:00Z')}),null);
 checks.push('Campaign summary filters cashier branch and paused/future campaigns; exact Ecuador deadline and no next-year reactivation');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'LUMINA_CASHIER_DOM_PASS',checks},null,2));
}finally{for(const cleanup of cleanups.reverse())await cleanup();}

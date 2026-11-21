// UI contract checks with jsdom 26. All requests are intercepted; no real transactions.
const {JSDOM,VirtualConsole}=require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const checks=[];
const program=(id,name,kind,extra={})=>({id,version:1,config:{active:true,name,kind,...extra}});
const programs=[program('points','Puntos de compras','POINTS'),program('cash','Cashback del 5%','CASHBACK'),program('visits','Visitas y premio','STAMPS'),program('paused','Pausada','STAMPS',{active:false})];
const fixture={role:'OWNER',business:{id:'demo',name:'Ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[{id:'a',name:'Centro'},{id:'b',name:'Norte'}],programs,rewards:[]};
const member={member:{id:'member',name:'Cliente de prueba',revision:2,cardCode:'FAKE-QR'},balances:[],rewards:[],history:[]};
async function runEnv(detailed=false){
 const errors=[],calls=[];let hold=false,release;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:'https://loyalty.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 const data=structuredClone(fixture);if(detailed)data.programs[2].config.productGroup='cafe';
 w.fetch=async(url,init)=>{
  const payload=init.body?JSON.parse(init.body):null;calls.push({url,payload,key:init.headers['Idempotency-Key']});
  const ok=body=>({ok:true,json:async()=>body});
  if(url==='/api/staff/members/lookup')return ok(member);
  if(url==='/api/staff/purchases/quote')return ok({grossMinor:payload.amountMinor,amountMinor:payload.amountMinor,discountMinor:0,rewardName:null});
  if(url==='/api/staff/purchases'){
   if(hold)return await new Promise(resolve=>{release=fail=>resolve(fail?{ok:false,status:503,json:async()=>({message:'Conexión interrumpida; reintenta.'})}:ok(result(payload)));});
   return ok(result(payload));
  }
  throw new Error('Unexpected request: '+url);
 };
 function result(p){return {purchaseId:'receipt',amountMinor:p.amountMinor,discountMinor:0,redemptionId:null,replayed:false,earned:p.programIds.map(id=>({programId:id,kind:programs.find(x=>x.id===id).config.kind,amount:id==='cash'?615:id==='points'?123:1}))};}
 for(const name of ['app.js','engagement.js','experience.js']){const script=w.document.createElement('script');script.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(script);}
 const q=s=>w.document.querySelector(s);const all=s=>[...w.document.querySelectorAll(s)];
 const settle=async test=>{for(let i=0;i<150;i++){if(test())return;await new Promise(r=>setTimeout(r,5));}throw new Error('Timed out '+test+'; '+errors.join('; '));};
 const input=(sel,value,type='input')=>{const n=q(sel);assert.ok(n,sel);if(typeof value==='boolean')n.checked=value;else n.value=value;n.dispatchEvent(new w.Event(type,{bubbles:true}));};
 const submit=sel=>{const f=q(sel);assert.ok(f,sel);f.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:f.querySelector('button:not([type]),button[type=submit]')}));};
 async function lookup(){w.eval(`state.data=${JSON.stringify(data)};state.token='fake';state.tab='sales';renderMerchant();`);input('#value','FAKE-QR');submit('#lookup');await settle(()=>q(detailed?'#productPurchase':'#purchase')&&!q('#lookup')?.getAttribute('aria-busy'));await new Promise(r=>setTimeout(r,5));}
 await lookup();
 return {w,dom,q,all,input,submit,settle,calls,errors,lookup,hold:()=>{hold=true;release=null;},release:fail=>{assert.ok(release);release(fail);},pending:()=>!!release};
}
(async()=>{
 const e=await runEnv();
 try{
  assert.equal(e.all('[name=program]').length,3);assert.equal(e.all('[name=program]:checked').length,0);
  assert.match(e.q('[data-promotion-selection-status]').textContent,/Ninguna/);
  assert.match(e.q('.purchase-selection-help').textContent,/sellos de visita/);
  assert.equal(e.calls.filter(c=>c.url.includes('purchases')).length,0);
  checks.push('Quick purchase: unchecked active promotions; lookup sends no purchase');
  e.input('#receipt','TICKET-123');
  for (const bad of ['0','0,00','1,234','1.000,50','10000000,01']) {
   e.input('#amount',bad);assert.equal(e.q('#purchase button:not([type])').disabled,true,bad);
  }
  e.input('#amount','123,50');e.q('#amount').closest('.money-control').querySelector('[data-money-delta="1"]').click();
  assert.equal(e.q('#amount').value,'124.50');
  e.input('#amount','123,50');e.input('[value=points][name=program]',true,'change');
  e.submit('#purchase');await e.settle(()=>e.q('#finishSimplePurchase'));
  assert.equal(e.calls.at(-1).payload.amountMinor,12350);
  assert.deepEqual(e.all('#purchaseReview .purchase-reference dd').map(n=>n.textContent),['TICKET-123','Centro']);
  assert.equal(e.w.document.activeElement,e.q('#purchaseReview h3'));
  assert.deepEqual(e.calls.at(-1).payload.programIds,['points']);assert.match(e.q('#purchaseReview').textContent,/Puntos de compras/);
  assert.equal(e.calls.filter(c=>c.url==='/api/staff/purchases').length,0);
  e.input('[value=cash][name=program]',true,'change');assert.equal(e.q('#finishSimplePurchase'),null);
  e.submit('#purchase');await e.settle(()=>e.q('#finishSimplePurchase')&&!e.q('#purchase').getAttribute('aria-busy'));
  assert.deepEqual(e.calls.at(-1).payload.programIds,['cash','points']);
  e.hold();e.submit('#finishSimplePurchase');await e.settle(e.pending);
  assert.ok(e.all('[name=program]').every(n=>n.disabled));e.release(true);
  await e.settle(()=>e.q('#finishSimplePurchase .form-feedback:not([hidden])'));
  assert.equal(e.all('[name=program]:checked').length,2);assert.equal(e.q('#receipt').value,'TICKET-123');
  e.hold();e.submit('#finishSimplePurchase');await e.settle(e.pending);e.release(false);await e.settle(()=>e.q('.counter-receipt'));
  assert.deepEqual(e.all('.counter-receipt .purchase-reference dd').map(n=>n.textContent),['TICKET-123','Centro']);
  assert.equal(e.q('.purchase-id').open,false);assert.equal(e.q('.purchase-id code').textContent,'receipt');
  const saves=e.calls.filter(c=>c.url==='/api/staff/purchases');assert.equal(saves.length,2);assert.ok(saves[0].key);assert.equal(saves[0].key,saves[1].key);assert.deepEqual(saves[0].payload,saves[1].payload);
  assert.match(e.q('.purchase-earning-receipt').textContent,/Cashback del 5%/);assert.doesNotMatch(e.q('.purchase-earning-receipt').textContent,/Visitas y premio/);
  checks.push('One or several promotions; review invalidation; immutable in-flight request and idempotent retry');
  await e.lookup();assert.equal(e.all('[name=program]:checked').length,0);
  e.input('#receipt','NO-PROMO');e.input('#amount','10');e.submit('#purchase');await e.settle(()=>e.q('#finishSimplePurchase'));
  assert.deepEqual(e.calls.at(-1).payload.programIds,[]);assert.match(e.q('#purchaseReview').textContent,/Sin puntos, sellos ni cashback/);
  e.hold();e.submit('#finishSimplePurchase');await e.settle(e.pending);e.release(false);await e.settle(()=>e.q('.counter-receipt'));
  assert.deepEqual(e.calls.at(-1).payload.programIds,[]);assert.match(e.q('.purchase-earning-receipt').textContent,/No seleccionaste/);
  checks.push('None is an explicit empty array; purchase-only review and receipt; next customer resets choices');
  await e.lookup();e.input('#receipt','SWITCH-1');e.input('#amount','5');e.input('[value=visits][name=program]',true,'change');e.submit('#purchase');await e.settle(()=>e.q('#finishSimplePurchase'));e.q('#purchase > button[type=button]').click();assert.equal(e.q('#finishSimplePurchase'),null);
  await e.settle(()=>e.q('#productPurchase'));assert.deepEqual(e.all('[name=program]:checked').map(n=>n.value),['visits']);
  checks.push('Switch to itemized purchase preserves only explicit choices');
  assert.deepEqual(e.errors,[]);
 }finally{e.dom.window.close();}
 const d=await runEnv(true);
 try{
  assert.equal(d.all('[name=program]:checked').length,0);assert.equal(d.q('.purchase-promotions').closest('details'),null);
  assert.deepEqual(d.all('[data-group-choice] option').map(n=>n.value),['cafe','Sin categoría','__custom']);
  d.input('[data-group-choice]','__custom','change');assert.equal(d.q('[data-custom-group]').hidden,false);d.input('[data-group]','Otra prueba');
  d.input('#receipt','PRODUCTS-1');d.input('[data-name]','Café');d.input('[data-group-choice]','cafe','change');d.input('[data-price]','5,75');d.input('[name=program][value=visits]',true,'change');
  d.q('#addProduct').click();assert.equal(d.all('[name=program]:checked').length,1);d.q('[data-remove="1"]').click();assert.equal(d.all('[name=program]:checked').length,1);
  d.input('[name=program][value=points]',true,'change');d.submit('#productPurchase');await d.settle(()=>d.q('#finishPurchase'));
  assert.deepEqual(d.calls.at(-1).payload.programIds,['points','visits']);
  d.input('#checkoutBranch','b','change');assert.equal(d.q('#finishPurchase'),null);
  d.q('[data-clear-promotion-selection]').click();assert.equal(d.all('[name=program]:checked').length,0);
  d.submit('#productPurchase');await d.settle(()=>d.q('#finishPurchase'));
  assert.deepEqual(d.calls.at(-1).payload.programIds,[]);assert.match(d.q('#receiptReview').textContent,/Solo registrar compra/);assert.equal(d.q('#finishPurchase button').textContent,'Guardar compra');
  d.submit('#finishPurchase');await d.settle(()=>d.q('.counter-receipt'));assert.deepEqual(d.calls.at(-1).payload.programIds,[]);
  assert.equal(d.calls.at(-1).payload.amountMinor,575);
  assert.deepEqual(d.all('.counter-receipt .purchase-reference dd').map(n=>n.textContent),['PRODUCTS-1','Norte']);
  checks.push('Itemized flow: unchecked and visible choices, redraw preservation, branch invalidation, clear-all, empty selection on save');
  await d.lookup();d.input('#receipt','ONE-STAMP');d.input('[data-name]','Café');d.input('[data-group-choice]','cafe','change');d.input('[data-price]','5');d.input('[name=program][value=visits]',true,'change');
  d.submit('#productPurchase');await d.settle(()=>d.q('#finishPurchase'));d.submit('#finishPurchase');await d.settle(()=>d.q('.counter-receipt'));
  assert.deepEqual(d.calls.at(-1).payload.programIds,['visits']);assert.match(d.q('.purchase-earning-receipt').textContent,/\+1 sello/);assert.doesNotMatch(d.q('.purchase-earning-receipt').textContent,/1 sellos|Cashback del 5%/);
  checks.push('Selected visit promotion produces a named single-stamp receipt without other promotions');
  assert.deepEqual(d.errors,[]);
 }finally{d.dom.window.close();}
 const result={status:'PURCHASE_SELECTION_DOM_PASS',checks,browserRendering:'PENDING',serverAndDatabase:'NOT_RUN_IN_THIS_DOM_TEST'};if(process.env.LOYALTY_UI_EVIDENCE){fs.mkdirSync(process.env.LOYALTY_UI_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.LOYALTY_UI_EVIDENCE,'purchase-selection.json'),JSON.stringify(result,null,2));}console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

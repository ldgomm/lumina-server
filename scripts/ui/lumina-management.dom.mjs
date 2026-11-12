// DOM interaction checks; no browser rendering, live accounts or Wallet devices.
// Run with Node and jsdom installed, or set LOYALTY_TEST_JSDOM to that module.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { agency, owner, portal } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
import { fakeLoyalty } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/loyalty-fixture.mjs';
import { loyaltyWorkspaceHtml } from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/wallet-pages.mjs';
import { managementDocument } from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/management-pages.mjs';
import { walletSections } from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/wallet/access-policy.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const file=(name,native=false)=>readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/'+(native?'presentation/loyalty/':'lumina/presentation/assets/')+name,import.meta.url),'utf8');
const checks=[],cleanups=[],t={after:f=>cleanups.push(f)},errors=[];
function dom(html,path='/'){
 const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const d=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test'+path,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console}),w=d.window;
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.ResizeObserver=class{observe(){}disconnect(){}};w.Request=Request;w.Headers=Headers;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 cleanups.push(()=>w.close());return w;
}
function load(w,name,native=false){const script=w.document.createElement('script');script.textContent=file(name,native);w.document.head.append(script);}
const settle=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI not ready: '+predicate+'; '+errors.join('; '));};
try{
 const l=await fakeLoyalty(t),world=await portal(t,l.origin,{platformToken:l.platformToken}),admin=await agency(world);await owner(world,'Prueba aislada','1');
 const w=dom((await admin.get('/planes/nueva')).body),q=s=>w.document.querySelector(s),form=q('.offer-publish-form'),field=n=>form.elements[n];
 for(const name of ['lumina.js','requests.js','packages.js','offers.js'])load(w,name);
 const edit=(name,value)=>{field(name).value=value;field(name).dispatchEvent(new w.Event('input',{bubbles:true}));};
 const click=s=>q(s).click(),submit=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal([...w.document.querySelectorAll('[data-offer-area]')].filter(e=>!e.hidden).length,1);
 assert.equal(submit(),false);assert.equal(form.dataset.busy,undefined);assert.match(q('[data-offer-error]').textContent,/al menos/);
 edit('VIDEO','2');click('[data-offer-tab=WALLET]');edit('WALLET','1');field('wallet_gift').checked=true;field('wallet_gift').dispatchEvent(new w.Event('change',{bubbles:true}));
 click('[data-offer-tab=WEB]');edit('MAINTENANCE','1');assert.equal(field('VIDEO').value,'2');assert.match(q('[data-offer-summary]').textContent,/2 · Videos/);
 for(let i=0;i<30;i++)edit('VIDEO',String(i+1));assert.equal(w.document.querySelectorAll('[data-offer-summary]').length,1);assert.match(q('[data-offer-review]').textContent,/30 · Videos/);assert.ok(q('[data-offer-review]').innerHTML.length<2000);
 edit('VIDEO','2');assert.equal(submit(),false);assert.equal(form.dataset.busy,undefined);assert.equal(q('[data-offer-step="1"]').hidden,false);
 edit('name','Oferta de ejemplo');field('term').value='MONTHLY';edit('price','123.45');click('[data-offer-next]');assert.equal(q('[data-offer-step="2"]').hidden,false);assert.match(q('[data-offer-review]').textContent,/123[,.]45/);
 assert.equal(submit(),false);assert.equal(form.dataset.busy,undefined);field('confirm_offer').checked=true;assert.equal(submit(),true);assert.equal(form.dataset.busy,'yes');assert.equal(form.querySelector('button[type=submit]').disabled,true);
 w.dispatchEvent(new w.Event('pageshow'));assert.equal(form.dataset.busy,undefined);assert.equal(form.querySelector('button[type=submit]').disabled,false);
 click('[data-offer-prev]');click('[data-offer-prev]');click('[data-offer-tab=BRAND]');edit('IDENTITY','1');assert.equal(field('term').value,'ONE_OFF');assert.equal(q('[name=term][value=MONTHLY]').disabled,true);edit('IDENTITY','0');assert.equal(q('[name=term][value=MONTHLY]').disabled,false);
 field('price_type').value='QUOTE';field('price_type')[1].dispatchEvent(new w.Event('change',{bubbles:true}));assert.ok(field('price').disabled);assert.equal(new w.FormData(form).has('price'),false);
 checks.push('Offer wizard: selection across areas, Enter, live review, exact price, brand one-off, quote, confirmation, duplicate submit and back navigation');
 const noJS=dom((await admin.get('/planes/nueva')).body);assert.equal(noJS.document.querySelectorAll('[data-offer-step][hidden]').length,0);assert.equal(noJS.document.querySelectorAll('[data-offer-area][hidden]').length,0);checks.push('No-JavaScript form retains all fields and server confirmation');
 // Reuse the native administration suite’s fictional fixtures with no network.
 const source=readFileSync(new URL('./administration.spec.cjs',import.meta.url),'utf8');
 const f=runInNewContext(source.slice(source.indexOf('const business='),source.indexOf('(async()=>{'))+';({business,baseBranches,baseProfile,account,users,daily})');
 const actor={kind:'OWNER',company_id:'fictional',csrf:'fictional-csrf'},company={id:'fictional',name:f.business.name},calls=[];
 async function native(section,central=false){
  const win=dom(central?managementDocument(actor,company,section):loyaltyWorkspaceHtml(actor,section,walletSections(actor),company),central?'/gestion/vista?seccion='+section+'&branchId=norte&days=7':'/wallet');
  win.fetch=async(url,opt={})=>{
   const u=new URL(String(url),win.location.href),headers=new Headers(opt.headers);calls.push({section,path:u.pathname,query:u.search,headers});assert.equal(headers.has('Authorization'),false);assert.equal(headers.get('X-Lumina-CSRF'),'fictional-csrf');assert.equal(headers.get('X-Lumina-Company'),'fictional');
   assert.ok(u.pathname.startsWith(central?'/gestion-api/':'/wallet-api/'));const path=u.pathname.replace(/^\/(gestion|wallet)-api/,'');let data;
   if(path.endsWith('/dashboard'))data={role:'OWNER',business:f.business,branches:f.baseBranches,programs:[],rewards:[]};
   else if(path.endsWith('/access'))data={canOperate:true};
   else if(path.endsWith('/branch-directory'))data={business:f.business,items:f.baseBranches,total:2,offset:0,hasMore:false};
   else if(path.endsWith('/business-profile'))data={business:f.business,profile:f.baseProfile,version:1,requests:[],categoryOptions:[{id:'cafe',name:'Cafetería',group:'Alimentación'}],categoryContext:{id:'cafe',name:'Cafetería',source:'CATEGORY'}};
   else if(path.endsWith('/account'))data=f.account;
   else if(path.endsWith('/activity'))data={business:f.business,users:f.users,branches:f.baseBranches,total:0,hasMore:false,from:'2026-11-01T05:00:00Z',asOf:'2026-11-10T18:00:00Z',summary:{purchases:0,redemptions:0,changes:0,paidMinor:0},items:[]};
   else if(path.endsWith('/operations'))data={business:f.business,summary:{purchases:84,buyers:27,paidMinor:138450,discountMinor:4200,redemptions:12,detailedPurchases:60,activeDays:21},previous:{purchases:70,paidMinor:105000,redemptions:8},returningOnAnotherDay:16,days:7,fromDate:'2026-11-04',throughDate:'2026-11-10',asOf:'2026-11-10T18:00:00Z',previousFromDate:'2026-10-28',previousThroughDate:'2026-11-03',allUsers:f.users,allBranches:f.baseBranches,userCount:0,branchCount:2,users:[],branches:f.baseBranches.map(b=>({...b,buyers:20,redemptions:b.rewards})),daily:f.daily,hours:[],rewards:[]};
   else if(path.endsWith('/metrics'))data={fromDate:'2026-10-12',throughDate:'2026-11-10',previousFromDate:'2026-09-12',previousThroughDate:'2026-10-11',salesMinor:138450,purchases:84,redemptions:12,activeClients:27,repeatClients:16,totalClients:120,newClients:10,previousNewClients:8,previousSalesMinor:105000,previousPurchases:70,detailedPurchases:60,branches:[],daily:f.daily,categories:[],topRewards:[]};
   else throw Error('Unexpected endpoint '+path);
   return{ok:true,status:200,json:async()=>structuredClone(data)};
  };
  load(win,'loyalty-context.js');for(const name of ['app.js','commercial.js','promotion-editor.js','jsqr.js','scanner.js','wallet-ui.js','engagement.js','experience.js'])load(win,name,true);load(win,central?'management-launch.js':'loyalty-launch.js');return win;
 }
 const wallet=await native('programs');await settle(()=>wallet.document.querySelector('.workspace-nav'));
 for(const tab of ['account','reports','operations','team','business','branches','activity','administration'])assert.equal(wallet.document.querySelector('[data-tab='+tab+']'),null);
 assert.ok(wallet.document.querySelector('[data-tab=design]'));assert.equal(wallet.document.querySelector('.workspace-search'),null);assert.match(wallet.document.querySelector('.workspace-business small').textContent,/Wallet de tu negocio/);
 let adminGuard=0,operationGuard=0,designGuard=0;wallet.loyaltyAdminLeave=f=>{adminGuard++;f();};wallet.loyaltyOperationLeave=f=>{operationGuard++;f();};wallet.loyaltyDesignLeave=()=>designGuard++;wallet.document.querySelector('#exit').click();assert.deepEqual([adminGuard,operationGuard,designGuard],[1,1,1]);checks.push('Actual Wallet scripts remove common administration and preserve exit draft guards');
 for(const [section,selector] of [['branches','.admin-branch'],['business','.business-profile'],['activity','#managementFilters'],['operations','#operationsFilters'],['account','.admin-account-card'],['reports','#reportChart svg']]){
  const win=await native(section,true);await settle(()=>win.document.querySelector(selector)).catch(e=>{throw Error(section+': '+e.message+'; '+win.document.querySelector('#app').textContent+'; '+win.document.querySelector('#notice').textContent);});assert.equal(win.document.querySelector('.workspace-sidebar'),null);assert.ok(win.document.querySelector('#app > #content'));assert.doesNotMatch(win.document.querySelector('#content').textContent,/undefined/);
  if(section==='operations'){const call=calls.findLast(c=>c.section===section&&c.path.endsWith('/operations'));assert.match(call.query,/branchId=norte/);assert.match(call.query,/days=7/);}
  if(section==='account'){assert.equal(win.document.querySelector('#membershipForm'),null);assert.equal(win.document.querySelector('#addCharge'),null);}
  if(section==='branches'){win.document.querySelector('[data-branch-edit=centro]').click();await settle(()=>win.document.querySelector('#adminDialogForm'));const field=win.document.querySelector('#adminDialogForm [name=name]');field.value='Borrador';field.dispatchEvent(new win.Event('input',{bubbles:true}));let left=false;win.loyaltyAdminLeave(()=>left=true);assert.equal(left,false);win.document.querySelector('#adminDraftDialog [data-stay]').click();assert.equal(field.value,'Borrador');win.loyaltyAdminLeave(()=>left=true);win.document.querySelector('#adminDraftDialog [data-discard]').click();assert.equal(left,true);}
 }
 checks.push('Six native management views embedded in Lúmina, no duplicate menu, profile/branches/reports/history, preserved filters and dirty-form guard');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'LUMINA_MANAGEMENT_DOM_PASS',checks},null,2));
}finally{for(const clean of cleanups.reverse())await clean();}

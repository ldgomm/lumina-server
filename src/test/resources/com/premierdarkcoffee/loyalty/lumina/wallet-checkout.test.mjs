import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {portal,agency,password,documentFor,colleague} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import {getPlan} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/memberships/billing.mjs';
import {localDay, priceFromInput} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';

import {advanceCalendar,firstStatement,nextCut,expiryAlerts} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/memberships/calendar.mjs';

async function world(t,configuration={},date='2027-01-22T17:00:00Z') {
 t.mock.timers.enable({apis:['Date'],now:new Date(date)});
 const native=await fakeLoyalty(t,null,configuration),w=await portal(t,native.origin,{platformToken:native.platformToken}),admin=await agency(w),client=w.session(),document=documentFor('checkout');
 const r=await client.post('/register',{company:'Comercio sin verificar',name:'Dueña',document,ruc:document+'001',phone:'0991234567',password,consent:'yes',category:'CAFE'});assert.equal(r.status,303);
 await client.get('/welcome');await client.post('/welcome',{service:'LATER'});await client.get('/services');
 const id=w.db.get('SELECT id FROM companies').id;
 return {...w,admin,client,id,native};
}
async function plan(w,extra={}) {
 const r=await w.admin.post('/plans',{catalog_version:'SIMPLE',name:'Mi oferta publicada',term:'MONTHLY',price_type:'FIXED',price:'13.75',WALLET:'1',confirm_offer:'yes',description:'Mi programa de fidelización, configuración y soporte.',...extra});assert.equal(r.status,303,r.body);
 return w.db.get('SELECT id FROM plans ORDER BY rowid DESC').id;
}
async function selection(w,plans,extra={}) {
 const r=await w.client.post('/plans/request',{key:randomUUID(),...Object.fromEntries(plans.map(id=>['qty_'+id,'1'])),...extra});assert.equal(r.status,303,r.body);
 const page=await w.client.get(r.location);assert.equal(page.status,200,page.body);
 return {path:r.location,body:page.body,data:{revision:page.body.match(/name="revision" value="([^"]+)"/)[1],offerHash:page.body.match(/name="offerHash" value="([^"]+)"/)?.[1],confirm:'yes'}};
}
async function signIn(w){
  w.client=w.session();
  assert.equal((await w.client.post('/login',{document:documentFor('checkout'),password})).status,303);
  await w.client.get('/home');
}
const state=w=>w.db.get("SELECT status FROM company_services WHERE company_id=? AND service='WALLET'",w.id)?.status||'INACTIVE';
const count=(w,table)=>w.db.get('SELECT count(*) n FROM '+table).n;

test('four reported routes lead to Wallet without redirect loops or provisioning',async t=>{
 const w=await world(t);await plan(w);
 for(const route of ['/plans','/plans/wallet','/wallet','/services']) {
  let r=await w.client.get(route),steps=0;
  while(r.status===303){assert.ok(++steps<3,route);r=await w.client.get(r.location);}
  assert.equal(r.status,200,route);assert.doesNotMatch(r.body,/identificación del proveedor/);
 }
 assert.equal(w.native.registrations.size,0);assert.equal(state(w),'INACTIVE');assert.equal(count(w,'contracts'),0);
});
test('published price review needs explicit owner consent and never admin approval or configured legal provider',async t=>{
 const w=await world(t),p=await plan(w),o=await selection(w,[p]);
 assert.ok(o.data.offerHash);assert.match(o.body,/13,75/);assert.match(o.body,/Aceptar y activar Wallet/);assert.doesNotMatch(o.body,/Lúmina revisará tu selección/);
 const checkbox=o.body.match(/<input[^>]*name="confirm"[^>]*>/)[0];assert.match(checkbox,/required/);assert.doesNotMatch(checkbox,/checked/);
 assert.equal((await w.client.post(o.path+'/accept',{...o.data,confirm:''})).status,400);assert.equal(w.native.registrations.size,0);
 const r=await w.client.post(o.path+'/accept',{...o.data,amount:'0',price:'0',companyId:randomUUID()});assert.equal(r.status,303,r.body);assert.equal(r.location,'/wallet');
 assert.equal(state(w),'ACTIVE');assert.equal(w.db.get('SELECT approved FROM companies').approved,0);assert.equal(count(w,'agency_legal'),0);
 assert.equal(w.db.get('SELECT agreed_minor FROM contracts').agreed_minor,1375);assert.equal(w.db.get('SELECT status FROM package_orders').status,'ACTIVE');
 assert.equal(w.native.registrations.size,1);assert.equal((await w.client.get('/wallet')).status,200);
 const status=JSON.parse((await w.client.get('/plans/wallet/state')).body);assert.equal(status.kind,'CATALOG');assert.equal(status.active,true);assert.match(status.description,/Mi oferta publicada/);
 assert.ok(!w.native.calls.some(c=>c.path.includes('lumina-subscription')));
});
test('duplicate clicks and response retry create one agreement and one native business',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]);
 const results=await Promise.all([1,2,3].map(()=>w.client.post(o.path+'/accept',o.data)));assert.ok(results.every(r=>r.status===303),results.map(r=>r.status));
 assert.equal(count(w,'contracts'),1);assert.equal(w.native.registrations.size,1);assert.equal(w.db.get("SELECT count(*) n FROM audit WHERE action='PROPUESTA_ACEPTADA'").n,1);
});
test('a lost native registration response retains the order and recovers the same tenant',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]);w.native.loseRegistrationResponse();
 const failed=await w.client.post(o.path+'/accept',o.data);assert.equal(failed.status,503);assert.match(failed.body,/Aceptar y activar Wallet/);assert.equal(count(w,'contracts'),0);assert.equal(state(w),'INACTIVE');
 const tenant=w.native.registrations.get(w.id).id;
 const retry=await w.client.post(o.path+'/accept',o.data);assert.equal(retry.status,303,retry.body);assert.equal(w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,tenant);assert.notEqual(tenant,w.native.business.id);assert.equal(w.native.registrations.size,1);
});
test('provider unavailable cannot create accepted agreements or active services',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]);w.native.registrationUnavailable(true);
 assert.equal((await w.client.post(o.path+'/accept',o.data)).status,503);assert.equal(count(w,'contracts'),0);assert.equal(state(w),'INACTIVE');assert.equal(w.db.get('SELECT status FROM package_orders').status,'REQUESTED');
 w.native.registrationUnavailable(false);assert.equal((await w.client.post(o.path+'/accept',o.data)).status,303);
});
test('withdrawn offers, altered review hashes and stale revisions cannot activate',async t=>{
 const w=await world(t),p=await plan(w),o=await selection(w,[p]);
 for(const data of [{...o.data,offerHash:'tampered'},{...o.data,revision:'0'}])assert.equal((await w.client.post(o.path+'/accept',data)).status,409);
 await w.admin.post('/plans/withdraw',{plan:p});assert.equal((await w.client.post(o.path+'/accept',o.data)).status,409);assert.equal(w.native.registrations.size,0);assert.equal(count(w,'contracts'),0);
});
test('agency, collaborator, another owner and invalid CSRF cannot accept for the owner',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]),member=await colleague(w,w.client,{name:'Cajera',document:documentFor('cashier'),'WALLET.VIEW':'yes'});
 assert.equal((await w.admin.post('/agency'+o.path+'/accept?company='+w.id,o.data)).status,403);
 assert.equal((await member.session.post(o.path+'/accept',o.data)).status,403);
 assert.equal((await w.client.post(o.path+'/accept',{...o.data,_csrf:'wrong'})).status,403);
 const other=w.session(),document=documentFor('another');await other.post('/register',{company:'Otro',name:'Otra',document,ruc:document+'001',phone:'0991112233',password,consent:'yes',category:'CAFE'});await other.get('/welcome');await other.post('/welcome',{service:'LATER'});
 assert.equal((await other.post(o.path+'/accept',{...o.data,company:w.id})).status,404);assert.equal(count(w,'contracts'),0);
});
test('business suspension during native preparation prevents agreement acceptance and service access',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]);
 w.native.beforeRequest(async({path})=>{if(path==='/api/staff/account')w.db.run("INSERT INTO business_controls(company_id,state,reason,revision,updated_at) VALUES(?,'SUSPENDED','Test pause',1,'2026-11-15') ON CONFLICT(company_id) DO UPDATE SET state='SUSPENDED'",w.id);});
 const r=await w.client.post(o.path+'/accept',o.data);assert.equal(r.status,423,r.body);assert.equal(count(w,'contracts'),0);assert.notEqual(state(w),'ACTIVE');
});
test('owner revision revoked during preparation never signs an agreement',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]);
 w.native.beforeRequest(async({path})=>{if(path==='/api/staff/account')w.db.run('UPDATE accounts SET revision=revision+1 WHERE company_id=?',w.id);});
 const r=await w.client.post(o.path+'/accept',o.data);assert.ok([401,403].includes(r.status),String(r.status));assert.equal(count(w,'contracts'),0);assert.notEqual(state(w),'ACTIVE');
});
test('a monthly package with Wallet activates included services at its published total',async t=>{
 const w=await world(t),p=await plan(w,{VIDEO:'2',WEBSITE:'1',name:'Contenido con Wallet',price:'120',wallet_gift:'yes'}),o=await selection(w,[p]);
 const r=await w.client.post(o.path+'/accept',o.data);assert.equal(r.status,303,r.body);assert.equal(w.db.get('SELECT agreed_minor FROM contracts').agreed_minor,12000);
 for(const code of ['WALLET','SOCIAL','WEB'])assert.equal(w.db.get('SELECT status FROM company_services WHERE service=?',code)?.status,'ACTIVE',code);
 const page=await w.client.get('/plans/wallet');assert.match(page.body,/Contenido con Wallet/);assert.match(page.body,/120,00/);assert.match(page.body,/Wallet mensual/);
});
test('two overlapping Wallet selections cannot create duplicate commercial agreements',async t=>{
 const w=await world(t),p=await plan(w),key=randomUUID();
 const submit=key=>w.client.post('/plans/request',{key,['qty_'+p]:'1'});
 const responses=await Promise.all([submit(key),submit(randomUUID())]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[303,409]);
 const path=responses.find(r=>r.status===303).location,body=(await w.client.get(path)).body;
 const data={revision:'1',confirm:'yes',offerHash:body.match(/name="offerHash" value="([^"]+)"/)[1]};
 assert.equal((await w.client.post(path+'/accept',data)).status,303);
 assert.equal((await submit(randomUUID())).status,409);
 const alias=await plan(w,{name:'Otra mensual'});
 assert.equal((await w.client.post('/plans/request',{key:randomUUID(),start_when:'NEXT_MONTH',['qty_'+alias]:'1'})).status,409);
 const annual=await plan(w,{name:'Wallet anual',term:'ANNUAL',price:'50'});
 const offers=(await w.client.get('/plans/wallet')).body;
 assert.match(offers,/Tu plan actual/);assert.match(offers,/Cambiar a anual/);
 const change=await selection(w,[annual],{start_when:'NEXT_MONTH'});
 assert.match(change.body,/Wallet anual/i);assert.match(change.body,/Confirmar para el próximo período/);assert.equal((await w.client.post(change.path+'/accept',change.data)).status,303);
 const periods=w.db.all('SELECT * FROM wallet_schedules ORDER BY starts_on');
 assert.equal(periods.length,2);assert.equal(periods[0].ends_before,periods[1].starts_on);
 assert.equal((await w.client.post('/plans/request',{key:randomUUID(),start_when:'NEXT_MONTH',['qty_'+annual]:'1'})).status,409);
 assert.equal(count(w,'contracts'),2);
});
test('unpriced and custom one-off work does not fabricate a final price or duration',async t=>{
 const w=await world(t),p=await plan(w,{price_type:'QUOTE',price:''}),o=await selection(w,[p]);assert.equal(o.data.offerHash,undefined);assert.match(o.body,/Por cotizar/);
 assert.equal((await w.client.post(o.path+'/accept',o.data)).status,409);assert.equal(count(w,'contracts'),0);assert.equal(w.native.registrations.size,0);
});
test('previously quoted Wallet orders activate on owner acceptance without a second admin action',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]),line=w.db.get('SELECT id FROM package_order_lines');
 const quote=await w.admin.post('/agency'+o.path+'/quote?company='+w.id,{revision:'1',['price_'+line.id]:'11.25',['start_'+line.id]:localDay(),terms:'Precio final acordado para este período.'});assert.equal(quote.status,303,quote.body);
 const r=await w.client.post(o.path+'/accept',{revision:'2',confirm:'yes'});assert.equal(r.status,303,r.body);assert.equal(state(w),'ACTIVE');assert.equal(w.db.get('SELECT agreed_minor FROM contracts').agreed_minor,1125);
});
test('old active contracts repair pending service through explicit POST, never by reading',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]);assert.equal((await w.client.post(o.path+'/accept',o.data)).status,303);
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant;w.db.run("UPDATE company_services SET status='SETUP' WHERE service='WALLET'");
 const p=await w.client.get('/plans/wallet');assert.equal(p.status,200);assert.match(p.body,/Activar mi Wallet/);assert.equal(state(w),'SETUP');
 assert.equal((await w.client.post('/plans/wallet/resume',{confirm:'yes'})).status,303);assert.equal(state(w),'ACTIVE');assert.equal(count(w,'contracts'),1);assert.equal(w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,tenant);
});
test('a mid-transaction failure rolls back consent, contract and all service changes',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]),run=w.db.run;
 w.db.run=(sql,...args)=>{if(sql.startsWith('INSERT INTO company_services'))throw new Error('Test transaction failure');return run(sql,...args);};
 const r=await w.client.post(o.path+'/accept',o.data);assert.equal(r.status,500);w.db.run=run;
 assert.equal(w.db.get('SELECT status FROM package_orders').status,'REQUESTED');assert.equal(count(w,'contracts'),0);assert.equal(state(w),'INACTIVE');
 assert.equal((await w.client.post(o.path+'/accept',o.data)).status,303);assert.equal(w.native.registrations.size,1);
});

test('automatic renewal keeps the published price and produces one agreement per first of month',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]);
 assert.equal((await w.client.post(o.path+'/accept',o.data)).status,303);
 const first=w.db.get('SELECT * FROM contracts');
 assert.equal((await w.client.post('/plans/request',{key:randomUUID(),renewal:first.id})).status,409);
 advanceCalendar(w.db,first.ends_before);advanceCalendar(w.db,first.ends_before);
 const periods=w.db.all('SELECT * FROM contracts ORDER BY starts_on');
 assert.equal(periods.length,2);assert.equal(periods[1].starts_on,first.ends_before);
 assert.equal(periods[1].agreed_minor,first.agreed_minor);assert.equal(periods[1].schedule_id,first.schedule_id);
 assert.equal(w.native.registrations.size,1);assert.equal(state(w),'ACTIVE');
});
test('Wallet owners can add Content next month and replace Wallet with one combined plan at the cut',async t=>{
 const w=await world(t),single=await plan(w),first=await selection(w,[single]);
 assert.equal((await w.client.post(first.path+'/accept',first.data)).status,303);
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant;
 const add=await selection(w,[await plan(w,{name:'Contenido mensual',WALLET:'0',VIDEO:'1',price:'20'})],{start_when:'NEXT_MONTH'});
 assert.ok(add.data.offerHash);assert.equal((await w.client.post(add.path+'/accept',add.data)).status,303);
 const combo=await plan(w,{name:'Wallet y página web',WEBSITE:'1',price:'30',wallet_gift:'yes'});
 const change=await selection(w,[combo],{start_when:'NEXT_MONTH'});
 assert.equal((await w.client.post(change.path+'/accept',change.data)).status,303);
 assert.notEqual(w.db.get("SELECT status FROM company_services WHERE service='SOCIAL'")?.status,'ACTIVE');
 assert.notEqual(w.db.get("SELECT status FROM company_services WHERE service='WEB'")?.status,'ACTIVE');
 const cut=nextCut(localDay());advanceCalendar(w.db,cut);advanceCalendar(w.db,cut);
 assert.equal(w.db.get("SELECT count(*) n FROM contracts c JOIN plan_items p ON p.plan_id=c.plan_id AND p.service='WALLET' WHERE c.starts_on<=? AND c.ends_before>?",cut,cut).n,1);
 for(const service of ['SOCIAL','WEB','WALLET'])assert.equal(w.db.get('SELECT status FROM company_services WHERE service=?',service)?.status,'ACTIVE');
 assert.equal(w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,tenant);
 const week=new Date(Date.parse(nextCut(cut))-4*86400000).toISOString().slice(0,10);
 assert.deepEqual(expiryAlerts(w.db,w.id,week).map(n=>n.name),['Contenido mensual']);
});
test('cancelling a scheduled replacement keeps the original plan and fee',async t=>{
 const w=await world(t),o=await selection(w,[await plan(w)]);await w.client.post(o.path+'/accept',o.data);
 const next=await selection(w,[await plan(w,{name:'Otros servicios',VIDEO:'1'})],{start_when:'NEXT_MONTH'});
 assert.equal((await w.client.post(next.path+'/accept',next.data)).status,303);
 const current=w.db.get('SELECT * FROM wallet_schedules ORDER BY starts_on LIMIT 1'),future=w.db.get('SELECT * FROM wallet_schedules ORDER BY starts_on DESC LIMIT 1');
 assert.equal((await w.client.post('/plans/wallet/stop',{schedule:future.id,confirm:'yes'})).status,303);
 assert.equal((await w.client.post('/plans/wallet/stop',{schedule:future.id,confirm:'yes'})).status,303);
 assert.equal(w.db.get("SELECT count(*) AS n FROM audit WHERE subject_id=? AND action='RENOVACIÓN_DETENIDA'",future.id).n,1);
 assert.equal(w.db.get('SELECT ends_before FROM wallet_schedules WHERE id=?',current.id).ends_before,null);
 advanceCalendar(w.db,future.starts_on);
 assert.equal(w.db.get('SELECT count(*) n FROM contracts WHERE starts_on=? AND cancelled_at IS NULL AND plan_id=?',future.starts_on,current.plan_id).n,1);
});
test('first statement counts the enrollment date and actual calendar days',()=>{
 assert.deepEqual(firstStatement('2027-04-22',499),{cut:'2027-05-01',due:'2027-05-15',days:9,monthDays:30,amount:150});
 assert.equal(firstStatement('2028-02-29',499).amount,17);
 assert.deepEqual(firstStatement('2026-11-22',499),{cut:null,due:null,days:0,monthDays:0,amount:0});
 assert.equal(firstStatement('2026-12-31',499,'2027-01-01').amount,0);
 assert.equal(firstStatement('2027-01-22',499).amount,161);
 assert.equal(firstStatement('2027-02-01',499).cut,'2027-03-01');
 assert.equal(firstStatement('2027-01-01',5000,null,12).amount,5000);
});

test('free Wallet has a single reversible choice and never creates a purchase in November or December',async t=>{
 const w=await world(t,{},'2026-11-20T17:00:00Z'),p=await plan(w,{name:'Lealtad',price:'4.99'});
 for(const date of ['2026-11-20T17:00:00Z','2026-12-31T23:00:00Z']){
  t.mock.timers.setTime(new Date(date).getTime());await signIn(w);
  const page=await w.client.get('/plans/wallet');
  assert.match(page.body,/Activar prueba gratuita/);assert.doesNotMatch(page.body,/Lealtad|qty_|4,99/);
  const catalog=await w.client.get('/plans');assert.doesNotMatch(catalog.body,new RegExp('qty_'+p));
  assert.equal((await w.client.post('/requests',{type:'PLAN',plan:p})).status,409);
  for(const start_when of ['TODAY','NEXT_MONTH'])assert.equal((await w.client.post('/plans/request',{key:randomUUID(),['qty_'+p]:'1',start_when})).status,409);
  for(const choice of ['start','start','stop','start','stop'])assert.equal((await w.client.post('/plans/wallet/choice',{choice})).status,303);
 }
 assert.equal(count(w,'package_orders'),0);assert.equal(count(w,'contracts'),0);assert.equal(count(w,'wallet_schedules'),0);assert.equal(w.native.registrations.size,1);
 assert.equal((await w.client.get('/wallet')).location,'/plans/wallet');
});

test('midnight in Ecuador requires fresh consent and a returning owner is billed only from confirmation',async t=>{
 const w=await world(t,{},'2027-01-01T04:59:59Z');
 await w.client.post('/plans/wallet/choice',{choice:'start'});
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant;
 t.mock.timers.setTime(Date.parse('2027-01-01T05:00:00Z'));
 assert.equal((await w.client.get('/wallet')).location,'/plans/wallet');
 const page=await w.client.get('/plans/wallet');assert.match(page.body,/Wallet mensual/);assert.match(page.body,/Wallet anual/);assert.match(page.body,/Ahora no/);
 assert.match((await w.client.get('/home')).body,/¿Quieres continuar con Wallet/);
 await w.client.post('/plans/wallet/choice',{choice:'later'});assert.doesNotMatch((await w.client.get('/home')).body,/¿Quieres continuar con Wallet/);
 t.mock.timers.setTime(Date.parse('2027-01-22T16:00:00Z'));await signIn(w);
 const standard='b32a3473-4d70-45ee-9937-9d702510a001',o=await selection(w,[standard]);
 assert.match(o.body,/1,61/);assert.equal((await w.client.post(o.path+'/accept',o.data)).status,303);
 const schedule=w.db.get('SELECT * FROM wallet_schedules');assert.equal(schedule.starts_on,'2027-01-22');assert.equal(schedule.consent_on,schedule.starts_on);
 await w.client.post('/plans/wallet/stop',{schedule:schedule.id,confirm:'yes'});
 t.mock.timers.setTime(Date.parse('2027-02-08T16:00:00Z'));advanceCalendar(w.db);await signIn(w);
 assert.equal((await w.client.get('/wallet')).location,'/plans/wallet');
 const back=await selection(w,[standard]);assert.equal((await w.client.post(back.path+'/accept',back.data)).status,303);
 assert.equal(w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,tenant);
 assert.deepEqual(w.db.all('SELECT starts_on,ends_before FROM wallet_schedules ORDER BY starts_on').map(x=>[x.starts_on,x.ends_before]),[['2027-01-22','2027-02-01'],['2027-02-08',null]]);
});

test('standard Wallet freezes the reviewed branch count and charges the displayed business total once',async t=>{
 let branches=2;
 const w=await world(t,{account:async()=>({branchCount:branches,membership:null,summary:{balanceMinor:0}})},'2027-01-01T04:59:00Z');
 await w.client.post('/plans/wallet/choice',{choice:'start'});
 t.mock.timers.setTime(Date.parse('2027-01-01T05:01:00Z'));
 const rate=await plan(w,{price:'4.99',name:'Lealtad'}),o=await selection(w,[rate]);
 assert.match(o.body,/10,00/);assert.match(o.body,/2 sucursales/);
 assert.match(o.body,/Pagar hasta el<\/dt><dd>15 de febrero de 2027/);
 assert.match(o.body,/Se registra el<\/dt><dd>1 de febrero de 2027/);
 assert.match(o.body,/Precio mensual del negocio<\/dt><dd>[^<]*10,00/);
 branches=3;
 assert.equal((await w.client.post(o.path+'/accept',o.data)).status,409);
 const updated=await w.client.get(o.path);
 assert.match(updated.body,/15,00/);
 const form={...o.data,offerHash:updated.body.match(/name="offerHash" value="([^"]+)"/)[1]};
 assert.equal((await w.client.post(o.path+'/accept',form)).status,303);
 assert.equal((await w.client.post(o.path+'/accept',form)).status,303);
 assert.equal(w.db.get('SELECT initial_branches FROM wallet_schedules').initial_branches,3);
 assert.equal(count(w,'contracts'),1);
 assert.match((await w.client.get(o.path)).body,/15,00/);
});
test('trial bundles quote only other services and cannot authorize Wallet for January',async t=>{
 const w=await world(t,{},'2026-12-15T16:00:00Z'),p=await plan(w,{name:'Wallet y contenido',price:'24.99',VIDEO:'1',other_price:'20'});
 const page=await w.client.get('/plans');assert.match(page.body,/20,00/);assert.doesNotMatch(page.body,/24,99/);
 const o=await selection(w,[p],{start_when:'NEXT_MONTH'});assert.match(o.body,/20,00/);assert.ok(o.data.offerHash);
 assert.equal((await w.client.post(o.path+'/accept',o.data)).status,303);
 t.mock.timers.setTime(Date.parse('2027-01-01T05:00:00Z'));advanceCalendar(w.db);await signIn(w);
 assert.equal(w.db.get("SELECT status FROM company_services WHERE service='SOCIAL'").status,'ACTIVE');
 assert.equal(count(w,'wallet_schedules'),0);assert.equal((await w.client.get('/wallet')).location,'/plans/wallet');
 // Simulate an activated mixed order carried forward from the previous release.
 w.db.run("UPDATE package_order_lines SET plan_id=?,wallet='INCLUDED',unit_minor=2499,quoted_other_minor=2000,items_json=?",p,JSON.stringify([{service:'WALLET',quantity:1},{service:'VIDEO',quantity:1}]));
 const old=await w.client.get(o.path);assert.match(old.body,/Acuerdo durante la prueba/);assert.match(old.body,/20,00/);assert.doesNotMatch(old.body,/24,99|Tu primer cargo de Wallet/);
});

test('archived trial requests stay readable and cannot reserve a paid period or be accepted by direct link',async t=>{
 const w=await world(t),p=await plan(w,{name:'Lealtad'}),o=await selection(w,[p]);
 w.db.run("UPDATE package_orders SET trial_archive=1,created_at='2026-11-20T14:00:00Z'");
 const historical=await w.client.get(o.path);assert.match(historical.body,/Historial de la prueba/);assert.doesNotMatch(historical.body,/Aceptar y activar|offerHash|13,75/);
 assert.equal((await w.client.post(o.path+'/accept',o.data)).status,409);
 assert.doesNotMatch((await w.client.get('/plans?view=orders')).body,new RegExp(o.path));
 assert.match((await w.client.get('/plans?view=orders&history=trial')).body,new RegExp(o.path));
 const fresh=await selection(w,[p]);assert.equal((await w.client.post(fresh.path+'/accept',fresh.data)).status,303);
});

test('Wallet selections return to the subscription on conflicts and open an idempotent confirmation after acceptance',async t=>{
  const w=await world(t);
  const rate=await plan(w,{name:'Wallet mensual de prueba',price:'4.99'});
  const first=await selection(w,[rate],{source:'wallet'});
  const conflict=await w.client.post('/plans/request',{source:'wallet',key:randomUUID(),['qty_'+rate]:'1'});
  assert.equal(conflict.status,409);
  assert.match(conflict.body,/Mi suscripción de Wallet/);
  assert.match(conflict.body,/role="alert"/);
  assert.ok(conflict.body.includes(first.path));
  assert.equal(count(w,'package_orders'),1);
  for(let attempt=0;attempt<2;attempt++){
    const result=await w.client.post(first.path+'/accept',{...first.data,source:'wallet'});
    assert.equal(result.status,303,result.body);
    assert.equal(result.location,first.path);
  }
  const confirmed=await w.client.get(first.path);
  assert.equal(confirmed.status,200);
  assert.ok(!confirmed.body.includes('action="'+first.path+'/accept"'));
  assert.match(confirmed.body,/Abrir Wallet/);
  assert.equal(count(w,'contracts'),1);
  assert.equal(count(w,'wallet_schedules'),1);
});

test('a pending Wallet order stays visible after other business orders and can be discarded from the subscription',async t=>{
  const w=await world(t),rate=await plan(w),wallet=await selection(w,[rate]);
  const ownerId=w.db.get("SELECT id FROM accounts WHERE company_id=? AND kind='OWNER'",w.id).id;
  for(let i=0;i<22;i++){
    w.db.run(`INSERT INTO package_orders(id,company_id,submitted_by,submission_key,status,notes,created_at)
      VALUES(?,?,?,?,'CANCELLED','','2027-01-23T14:00:00Z')`,randomUUID(),w.id,ownerId,randomUUID());
  }
  assert.ok(!(await w.client.get('/plans?view=orders')).body.includes(wallet.path));
  const center=await w.client.get('/plans/wallet');
  assert.equal(center.status,200);
  assert.ok(center.body.includes(wallet.path));
  const cancel=await w.client.post(wallet.path+'/cancel',{revision:wallet.data.revision,reason:'Prefiero decidir más adelante.',source:'wallet'});
  assert.equal(cancel.status,303);
  assert.equal(cancel.location,'/plans/wallet');
  assert.ok(!(await w.client.get(cancel.location)).body.includes(wallet.path));
  assert.equal(count(w,'contracts'),0);
});

test('catalog prices round once per unit across services and preserve other cents and quotes',async t=>{
 const w=await world(t);
 assert.equal(priceFromInput('0,99'),100);assert.equal(priceFromInput('18.98'),1898);
 assert.equal(priceFromInput('99999999.99'),priceFromInput('100000000.00'));assert.equal(priceFromInput('',true),null);
 for(const [service,scope] of [['VIDEO','MONTHLY'],['WEBSITE','ONE_OFF'],['IDENTITY','ONE_OFF']]){
   const id=await plan(w,{name:'Servicio '+service,WALLET:'0',[service]:'1',term:scope,price:'29.99'});
   assert.equal(w.db.get('SELECT price_minor FROM plans WHERE id=?',id).price_minor,3000);
   // Previously published immutable catalog records also use the new price for a new purchase.
   w.db.run('UPDATE plans SET price_minor=2999 WHERE id=?',id);
   assert.equal(getPlan(w.db,id).price_minor,3000);
 }
 const bundle=await plan(w,{name:'Paquete con contenido',price:'34,99',VIDEO:'1',other_price:'29.99'});
 const o=await selection(w,[bundle]);assert.match(o.body,/35,00/);
 const line=w.db.get('SELECT * FROM package_order_lines WHERE order_id=?',o.path.split('/').at(-1));
 assert.equal(line.unit_minor,3500);assert.equal(line.quoted_other_minor,3000);
});
test('installing over earlier prices reissues unsigned quotes once and preserves accepted amounts',async t=>{
 const w=await world(t), id=await plan(w,{name:'Paquete',price:'24.99',VIDEO:'1',other_price:'19.99'});
 const o=await selection(w,[id]), order=o.path.split('/').at(-1);
 const dir=mkdtempSync(join(tmpdir(),'lumina-prices-')),file=join(dir,'prior.sqlite');
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 w.db.run('VACUUM INTO ?',file);
 const prior=new DatabaseSync(file);
 const open=prior.prepare('SELECT id,company_id,submitted_by FROM package_orders WHERE id=?').get(order);
 prior.prepare("DELETE FROM lumina_extensions WHERE name='commercial-prices'").run();
 prior.exec('ALTER TABLE package_order_lines DROP COLUMN quoted_other_minor');
 prior.prepare('UPDATE plan_billing SET other_minor=1999 WHERE plan_id=?').run(id);
 prior.prepare('UPDATE package_order_lines SET catalog_minor=2499,unit_minor=2499 WHERE order_id=?').run(order);
 const closed=randomUUID(),now='2027-01-02T18:00:00.000Z';
 prior.prepare("INSERT INTO package_orders(id,company_id,submitted_by,submission_key,status,notes,created_at,accepted_at) VALUES(?,?,?,?,'ACCEPTED','',?,?)").run(closed,open.company_id,open.submitted_by,randomUUID(),now,now);
 prior.prepare('INSERT INTO package_order_lines(id,company_id,order_id,plan_id,name,term,wallet,units,items_json,catalog_minor,unit_minor) SELECT ?,company_id,?,plan_id,name,term,wallet,units,items_json,catalog_minor,unit_minor FROM package_order_lines WHERE order_id=?').run(randomUUID(),closed,order);
 const request=randomUUID();
 prior.prepare("INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,created_at) VALUES(?,?,?,'QUOTE','GENERAL','VIDEO',1,'Video','Trabajo solicitado','QUOTED',?)").run(request,w.id,open.submitted_by,now);
 const quote=randomUUID();
 prior.prepare("INSERT INTO quotes(id,company_id,request_id,revision,amount_minor,terms,status,created_at) VALUES(?,?,?,1,1499,'Alcance','OFFERED',?)").run(quote,w.id,request,now);
 prior.close();
 for(let run=0;run<2;run++){
   const db=openDatabase(file);
   try {
     const line=db.get('SELECT catalog_minor,unit_minor,quoted_other_minor FROM package_order_lines WHERE order_id=?',order);
     assert.deepEqual(Object.values(line),[2500,2500,2000]);
     assert.equal(db.get('SELECT revision FROM package_orders WHERE id=?',order).revision,Number(o.data.revision)+1);
     assert.deepEqual(Object.values(db.get('SELECT unit_minor,quoted_other_minor FROM package_order_lines WHERE order_id=?',closed)),[2499,1999]);
     assert.deepEqual(Object.values(db.get('SELECT amount_minor,status FROM quotes WHERE id=?',quote)),[1499,'SUPERSEDED']);
     const fresh=db.get("SELECT * FROM quotes WHERE request_id=? AND status='OFFERED'",request);
     assert.notEqual(fresh.id,quote);assert.equal(fresh.amount_minor,1500);assert.equal(fresh.revision,2);
   } finally { db.close(); }
 }
});

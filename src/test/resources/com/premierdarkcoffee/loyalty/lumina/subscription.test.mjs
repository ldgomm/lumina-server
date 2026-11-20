import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {portal,agency,owner,colleague,acceptedContract} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
const legal={revision:'0',legalName:'Agencia de prueba',ruc:'1234567890001',address:'Dirección ficticia en Quito',email:'legal@example.test',phone:'0991234567',privacyUrl:'https://example.test/privacidad',confirm:'yes'};
async function world(t,existing=false){
 const calls=[];let active=existing,cycle='MONTHLY';
 const loyalty=await fakeLoyalty(t,null,{account:async()=>({membership:active?{plan:{walletAgreement:{},recurring:true}}:null}),subscription:async call=>{
  calls.push(call);
  if(call.path.endsWith('/accept')){
   if(!call.payload.accepted)return {status:400,body:{message:'Aceptación requerida'}};
   if(call.payload.expectedHash!=='hash-oferta')return {status:409,body:{message:'La oferta cambió'}};
   active=true;cycle=call.payload.offer.cycle;return {body:{version:1,accepted:true}};
  }
  if(call.path.endsWith('/offer'))return {body:{hash:'hash-oferta',paidFrom:'2027-01-01',trialUntil:'2026-12-31',cycle:call.payload.cycle||'MONTHLY',unitMinor:call.payload.cycle==='ANNUAL'?5000:499,totalMinor:call.payload.cycle==='ANNUAL'?5000:499,branches:[{name:'Principal'}],terms:'Condiciones de prueba. Cargo de $4,99.'}};
  return {body:{version:active?1:0,accepted:active,recurring:active,legacy:false,trialUntil:active?'2026-12-31':null,nextChargeOn:active?'2027-01-01':null,cycle,unitMinor:cycle==='ANNUAL'?5000:499,periodMinor:cycle==='ANNUAL'?5000:499,monthlyMinor:499,branches:[{name:'Principal'}],agreement:active?{ownerName:'Dueño de Ejemplo',acceptedAt:'2026-11-19T15:00:00Z',terms:'Condiciones aceptadas de prueba'}:null}};
 }});
 const w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken});
 const admin=await agency(w),o=await owner(w,'Ejemplo',1,{category:'CAFE'});
 return {...w,...o,admin,calls,loyalty};
}
test('registration asks and persists business category with compatibility for older callers',async t=>{
 const w=await world(t);assert.equal(w.db.get('SELECT category FROM companies WHERE id=?',w.id).category,'CAFE');
 const signup=await w.session().get('/register');assert.match(signup.body,/name="category"[^>]*required/);assert.match(signup.body,/Cafetería/);
 const invalid=await w.session().post('/register',{company:'Otra',name:'Dueño',document:'1234567895',phone:'0991234567',document:'1723016091',password:'Pruebas Lúmina 123!',consent:'yes',category:'INVENTADA'});assert.equal(invalid.status,400);
 assert.equal(w.db.get('SELECT count(*) AS n FROM companies').n,1);
});
test('operator identification is agency only and requires confirmed valid information',async t=>{
 const w=await world(t);assert.equal((await w.client.post('/account/provider',legal)).status,403);
 assert.equal((await w.admin.post('/account/provider',{...legal,confirm:''})).status,400);
 assert.equal((await w.admin.post('/account/provider',{...legal,privacyUrl:'http://example.test'})).status,400);
 assert.equal((await w.admin.post('/account/provider',legal)).status,303);
 assert.equal((await w.admin.post('/account/provider',legal)).status,409);
});
test('unconfigured legal provider does not offer a hidden fixed subscription or invent consent',async t=>{
 const w=await world(t),p=await w.client.get('/plans/wallet');assert.equal(p.status,200);assert.match(p.body,/Elige tu plan de Wallet/);assert.doesNotMatch(p.body,/4,99|50,00|identificación del proveedor|name="accept"/);assert.equal(w.calls.length,0);
});

test('historical accepted terms remain downloadable exactly and cannot be replaced with a fresh offer',async t=>{
 const w=await world(t,true);const p=await w.client.get('/plans/wallet/legacy');assert.equal(p.status,200,p.body);assert.match(p.body,/Condiciones aceptadas de prueba/);assert.doesNotMatch(p.body,/billing-choice|name="accept"|name="cycle"/);
 const download=await w.client.get('/plans/wallet/terms');assert.equal(download.body,'Condiciones aceptadas de prueba');assert.match(download.headers.get('content-disposition'),/attachment/);
 assert.equal((await w.client.get('/plans/wallet/terms?offer=hash-oferta')).status,409);assert.ok(!w.calls.some(c=>c.path.endsWith('/offer')));
});

test('retired fixed-price endpoint cannot create a subscription even with a valid old form',async t=>{
 const w=await world(t);await w.admin.post('/account/provider',legal);
 const r=await w.client.post('/plans/wallet/accept',{requestKey:randomUUID(),hash:'hash-oferta',accept:'yes',companyId:randomUUID(),ownerId:randomUUID(),feeMinor:'0'});
 assert.equal(r.status,409);assert.match(r.body,/ofertas publicadas/);assert.ok(!w.calls.some(c=>c.path.endsWith('/accept')));
});

test('agency and collaborator cannot accept cancel or query a business subscription',async t=>{
 const w=await world(t);const member=await colleague(w,w.client,{name:'Colaborador',document:'1754634234',view:['WALLET']});
 const before=w.calls.length;
 for(const actor of [w.admin,member.session]){
  assert.equal((await actor.get('/plans/wallet')).status,403);
  assert.equal((await actor.get('/plans/wallet/state')).status,403);
  assert.equal((await actor.post('/plans/wallet/cancel',{requestKey:randomUUID(),version:'1',confirm:'yes'})).status,403);
  assert.equal((await actor.post('/plans/wallet/accept',{requestKey:randomUUID(),hash:'hash-oferta',accept:'yes'})).status,403);
 }
 assert.equal(w.calls.length,before);
});
test('native subscription routes cannot be reached through the general Wallet proxy',async t=>{
 const w=await world(t);const result=await w.client.post('/wallet-api/api/staff/lumina-subscription/accept',{accepted:true},{json:true});
 assert.ok([403,404].includes(result.status));assert.equal(w.calls.filter(c=>c.path.endsWith('/accept')).length,0);
});
test('an existing included Wallet agreement blocks a second automatic subscription',async t=>{
 const w=await world(t);await w.admin.post('/account/provider',legal);
 await w.admin.post('/agency/businesses/verify?company='+w.id);
 const offer={catalog_version:'SIMPLE',name:'Contenido con Wallet',term:'MONTHLY',price_type:'FIXED',price:'100',VIDEO:'2',WALLET:'1',wallet_gift:'yes',confirm_offer:'yes',description:'Dos videos y fidelización incluida.'};
 assert.equal((await w.admin.post('/plans',offer)).status,303);
 const plan=w.db.get('SELECT id FROM plans').id;await acceptedContract(w,w.admin,w.client,w.id,plan);
 const page=await w.client.get('/plans/wallet');assert.equal(page.status,200,page.body);assert.match(page.body,/Wallet está incluida en tu plan/);assert.doesNotMatch(page.body,/action="\/plans\/wallet\/accept"/);
});

test('old cycle query does not manufacture annual or monthly offers in an empty catalogue',async t=>{
 const w=await world(t);for(const cycle of ['ANNUAL','MONTHLY']){const p=await w.client.get('/plans/wallet?cycle='+cycle);assert.equal(p.status,200);assert.doesNotMatch(p.body,/4,99|50,00|name="cycle"/);}
 assert.equal(w.calls.length,0);
});

test('invalid billing cycle cannot reach the native subscription endpoint',async t=>{
 const w=await world(t);await w.admin.post('/account/provider',legal);const before=w.calls.length;
 assert.equal((await w.client.post('/plans/wallet/accept',{requestKey:randomUUID(),hash:'hash-oferta',cycle:'FREE',accept:'yes'})).status,409);assert.equal(w.calls.length,before);
});

test('a native Wallet agreement blocks an overlapping package and preserves the quote',async t=>{
 const w=await world(t,true);await w.admin.post('/account/provider',legal);
 await w.admin.post('/plans',{name:'Video y Wallet',term:'MONTHLY',price:'100',VIDEO:'2',wallet:'GIFT'});
 const plan=w.db.get('SELECT id FROM plans').id;
 const requested=await w.client.post('/plans/request',{key:randomUUID(),['qty_'+plan]:'1'});assert.equal(requested.status,303);
 const order=w.db.get('SELECT * FROM package_orders'),line=w.db.get('SELECT * FROM package_order_lines');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 assert.equal((await w.admin.post('/agency'+requested.location+'/quote?company='+w.id,{revision:String(order.revision),['price_'+line.id]:'100',['start_'+line.id]:day,['end_'+line.id]:day,terms:'Dos videos y Wallet incluida.'})).status,303);
 const rejected=await w.client.post(requested.location+'/accept',{revision:String(order.revision+1),confirm:'yes'});assert.equal(rejected.status,409);assert.match(rejected.body,/evitar cargos duplicados/);
 assert.equal(w.db.get('SELECT status FROM package_orders').status,'QUOTED');assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);
});
test('a previously accepted Wallet order has a visible continuation instead of another fixed agreement',async t=>{
 const w=await world(t);await w.admin.post('/account/provider',legal);await w.admin.post('/agency/businesses/verify?company='+w.id);
 await w.admin.post('/plans',{name:'Wallet incluido',term:'MONTHLY',price:'50',VIDEO:'1',wallet:'GIFT'});
 const plan=w.db.get('SELECT id FROM plans').id;await acceptedContract(w,w.admin,w.client,w.id,plan);
 w.db.run("UPDATE package_orders SET status='ACCEPTED'");w.db.run('DELETE FROM contracts');
 const page=await w.client.get('/plans/wallet');assert.match(page.body,/Continúa con tu selección/);assert.doesNotMatch(page.body,/action="\/plans\/wallet\/accept"/);
});

test('an already signed subscription resumes a pending Wallet without signing again',async t=>{
 const w=await world(t,true);w.db.run("UPDATE company_services SET status='SETUP' WHERE company_id=? AND service='WALLET'",w.id);
 const page=await w.client.get('/plans/wallet/legacy');assert.match(page.body,/Activar mi Wallet/);assert.doesNotMatch(page.body,/href="\/wallet"/);
 assert.equal(w.db.get("SELECT status FROM company_services WHERE service='WALLET'").status,'SETUP');
 const r=await w.client.post('/plans/wallet/resume',{confirm:'yes'});assert.equal(r.status,303,r.body);
 assert.equal(w.db.get("SELECT status FROM company_services WHERE service='WALLET'").status,'ACTIVE');assert.equal(w.calls.filter(c=>c.method==='POST').length,0);
});
test('resume cannot activate a pending Wallet without any accepted agreement',async t=>{
 const w=await world(t);w.db.run("UPDATE company_services SET status='SETUP' WHERE company_id=? AND service='WALLET'",w.id);
 assert.equal((await w.client.post('/plans/wallet/resume',{confirm:'yes'})).status,409);
 assert.equal(w.db.get("SELECT status FROM company_services WHERE service='WALLET'").status,'SETUP');
});

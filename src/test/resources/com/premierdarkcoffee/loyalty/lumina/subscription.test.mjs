import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {portal,agency,owner,colleague,acceptedContract} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
const legal={revision:'0',legalName:'Agencia de prueba',ruc:'1234567890001',address:'Dirección ficticia en Quito',email:'legal@example.test',phone:'0991234567',privacyUrl:'https://example.test/privacidad',confirm:'yes'};
async function world(t){
 const calls=[];let active=false;
 const loyalty=await fakeLoyalty(t,null,{subscription:async call=>{
  calls.push(call);
  if(call.path.endsWith('/accept')){
   if(!call.payload.accepted)return {status:400,body:{message:'Aceptación requerida'}};
   if(call.payload.expectedHash!=='hash-oferta')return {status:409,body:{message:'La oferta cambió'}};
   active=true;return {body:{version:1,accepted:true}};
  }
  if(call.path.endsWith('/offer'))return {body:{hash:'hash-oferta',paidFrom:'2027-01-01',trialUntil:'2026-12-31',totalMinor:499,branches:[{name:'Principal'}],terms:'Condiciones de prueba. Cargo de $4,99.'}};
  return {body:{version:active?1:0,accepted:active,recurring:active,legacy:false,trialUntil:active?'2026-12-31':null,nextChargeOn:active?'2027-01-01':null,monthlyMinor:499,branches:[{name:'Principal'}],agreement:active?{ownerName:'Dueño de Ejemplo',acceptedAt:'2026-11-19T15:00:00Z',terms:'Condiciones aceptadas de prueba'}:null}};
 }});
 const w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken});
 const admin=await agency(w),o=await owner(w,'Ejemplo',1,{category:'CAFE'});
 return {...w,...o,admin,calls,loyalty};
}
test('registration asks and persists business category with compatibility for older callers',async t=>{
 const w=await world(t);assert.equal(w.db.get('SELECT category FROM companies WHERE id=?',w.id).category,'CAFE');
 const signup=await w.session().get('/registro');assert.match(signup.body,/name="category"[^>]*required/);assert.match(signup.body,/Cafetería/);
 const invalid=await w.session().post('/registro',{company:'Otra',name:'Dueño',document:'1234567895',phone:'0991234567',email:'otra@example.test',password:'Pruebas Lúmina 123!',consent:'yes',category:'INVENTADA'});assert.equal(invalid.status,400);
 assert.equal(w.db.get('SELECT count(*) AS n FROM companies').n,1);
});
test('operator identification is agency only and requires confirmed valid information',async t=>{
 const w=await world(t);assert.equal((await w.client.post('/cuenta/proveedor',legal)).status,403);
 assert.equal((await w.admin.post('/cuenta/proveedor',{...legal,confirm:''})).status,400);
 assert.equal((await w.admin.post('/cuenta/proveedor',{...legal,privacyUrl:'http://example.test'})).status,400);
 assert.equal((await w.admin.post('/cuenta/proveedor',legal)).status,303);
 assert.equal((await w.admin.post('/cuenta/proveedor',legal)).status,409);
});
test('missing legal identity never exposes an acceptance form or invents consent',async t=>{
 const w=await world(t);const result=await w.client.get('/planes/wallet');assert.equal(result.status,200,result.body);
 assert.match(result.body,/No se han aceptado cargos/);assert.doesNotMatch(result.body,/action="\/planes\/wallet\/aceptar"/);
 assert.equal(w.calls.filter(x=>x.path.endsWith('/accept')).length,0);
});
test('owner sees an unchecked clear offer and downloads exact terms before acceptance',async t=>{
 const w=await world(t);await w.admin.post('/cuenta/proveedor',legal);
 const page=await w.client.get('/planes/wallet');assert.equal(page.status,200,page.body);
 assert.match(page.body,/\$4,99/);assert.match(page.body,/31 de diciembre de 2026/);
 const checkbox=page.body.match(/<input[^>]+name="accept"[^>]*>/)?.[0];assert.ok(checkbox);assert.doesNotMatch(checkbox,/checked/);assert.match(checkbox,/required/);
 const download=await w.client.get('/planes/wallet/condiciones?oferta=hash-oferta');assert.equal(download.body,'Condiciones de prueba. Cargo de $4,99.');assert.match(download.headers.get('content-disposition'),/attachment/);
 assert.equal((await w.client.get('/planes/wallet/condiciones?oferta=otra')).status,409);
});
test('acceptance uses actual logged in business and no posted price or identity',async t=>{
 const w=await world(t);await w.admin.post('/cuenta/proveedor',legal);
 const no=await w.client.post('/planes/wallet/aceptar',{requestKey:randomUUID(),hash:'hash-oferta'});assert.equal(no.status,400);
 const key=randomUUID();const yes=await w.client.post('/planes/wallet/aceptar',{requestKey:key,hash:'hash-oferta',accept:'yes',companyId:randomUUID(),ownerId:randomUUID(),feeMinor:'0',provider:'Inventado'});
 assert.equal(yes.status,303,yes.body);assert.equal(yes.location,'/wallet');
 const call=w.calls.filter(c=>c.path.endsWith('/accept')).at(-1);assert.equal(call.key,key);assert.equal(call.payload.offer.companyId,w.id);assert.equal(call.payload.offer.provider.legalName,legal.legalName);assert.equal(call.payload.feeMinor,undefined);
 const terms=await w.client.get('/planes/wallet/condiciones');assert.equal(terms.body,'Condiciones aceptadas de prueba');
});
test('agency and collaborator cannot accept cancel or query a business subscription',async t=>{
 const w=await world(t);const member=await colleague(w,w.client,{name:'Colaborador',email:'staff@example.test',view:['WALLET']});
 const before=w.calls.length;
 for(const actor of [w.admin,member.session]){
  assert.equal((await actor.get('/planes/wallet')).status,403);
  assert.equal((await actor.get('/planes/wallet/estado')).status,403);
  assert.equal((await actor.post('/planes/wallet/cancelar',{requestKey:randomUUID(),version:'1',confirm:'yes'})).status,403);
  assert.equal((await actor.post('/planes/wallet/aceptar',{requestKey:randomUUID(),hash:'hash-oferta',accept:'yes'})).status,403);
 }
 assert.equal(w.calls.length,before);
});
test('native subscription routes cannot be reached through the general Wallet proxy',async t=>{
 const w=await world(t);const result=await w.client.post('/wallet-api/api/staff/lumina-subscription/accept',{accepted:true},{json:true});
 assert.ok([403,404].includes(result.status));assert.equal(w.calls.filter(c=>c.path.endsWith('/accept')).length,0);
});
test('an existing included Wallet agreement blocks a second automatic subscription',async t=>{
 const w=await world(t);await w.admin.post('/cuenta/proveedor',legal);
 await w.admin.post('/agencia/clientes/verificar?empresa='+w.id);
 const offer={catalog_version:'SIMPLE',name:'Contenido con Wallet',term:'MONTHLY',price_type:'FIXED',price:'100',VIDEO:'2',WALLET:'1',wallet_gift:'yes',confirm_offer:'yes',description:'Dos videos y fidelización incluida.'};
 assert.equal((await w.admin.post('/planes',offer)).status,303);
 const plan=w.db.get('SELECT id FROM plans').id;await acceptedContract(w,w.admin,w.client,w.id,plan);
 const page=await w.client.get('/planes/wallet');assert.equal(page.status,200,page.body);assert.match(page.body,/evitar cobrar dos veces/);assert.doesNotMatch(page.body,/action="\/planes\/wallet\/aceptar"/);
});

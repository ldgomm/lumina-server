import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loyaltyOrigin } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/wallet/bridge.mjs';
import { teamRevision, agency, colleague, owner, portal } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';

async function linked(t) {
  const loyalty = await fakeLoyalty(t);
  const integration={};const world = await portal(t,loyalty.origin,integration);
  const admin = await agency(world);
  const {client,id} = await owner(world,'Restaurante de prueba','7');
  await admin.post('/agencia/clientes/verificar?empresa='+id);
  world.db.run('UPDATE companies SET loyalty_tenant=?,loyalty_name=? WHERE id=?',loyalty.business.id,loyalty.business.name,id);
  integration.platformToken=loyalty.platformToken;
  await client.get('/wallet');
  return {loyalty,world,client,id};
}
test('una cuenta combina TikTok, Instagram y Caja, con compras y canjes independientes',async t=>{
  const {loyalty,world,client} = await linked(t);
  const member = await colleague(world,client,{name:'Equipo mixto',document:'1726863523','TIKTOK.VIEW':'yes',
    'INSTAGRAM.VIEW':'yes','INSTAGRAM.REQUEST':'yes'});
  const path = '/equipo/'+member.id+'/caja';
  const input = {credential:loyalty.ownerToken,branch:loyalty.branch.id,purchases:'yes'};
  assert.equal((await client.post(path+'/sucursales',{credential:loyalty.ownerToken})).status,200);
  // Extra client-supplied secrets cannot change which tenant the backend operates on.
  assert.equal((await client.post(path+'/guardar',{...input,revision:teamRevision(world,member.id),credential:loyalty.foreignToken})).status,303);
  assert.equal((await client.post(path+'/guardar',{...input,revision:teamRevision(world,member.id),branch:loyalty.foreignBranch.id})).status,400);
  assert.equal((await client.post(path+'/guardar',{...input,revision:teamRevision(world,member.id)})).status,303);
  const original = world.db.get('SELECT * FROM cash_grants WHERE account_id=?',member.id);
  const remote = loyalty.staff.get(original.staff_id);
  assert.equal(remote.role,'CASHIER');
  assert.equal(remote.branchId,loyalty.branch.id);
  assert.ok(original.sealed_token && original.sealed_token!==remote.token);
  const counter = await member.session.get('/caja');
  assert.equal(counter.status,200);
  assert.match(counter.body,/Caja · Wallet de Lúmina/);
  assert.ok(!counter.body.includes(remote.token));
  const dash = await member.session.get('/api/staff/dashboard');
  assert.equal(dash.status,200);
  assert.deepEqual(JSON.parse(dash.body).permissions,{purchases:true,rewards:false});
  const receipt = {branchId:loyalty.branch.id,amountMinor:1970};
  const api = {json:true,headers:{'Idempotency-Key':'ab12-cd34'}};
  assert.equal((await member.session.post('/api/staff/purchases',receipt,api)).status,200);
  assert.equal((await member.session.post('/api/staff/purchases',{...receipt,branchId:loyalty.secondBranch.id},api)).status,403);
  assert.equal((await member.session.post('/api/staff/purchases',{...receipt,rewardId:'request-reward'},api)).status,403);
  assert.equal((await member.session.post('/api/staff/counter-redemptions',receipt,api)).status,403);
  assert.equal((await member.session.get('/api/staff/team')).status,404);
  assert.equal((await member.session.get('/api/staff/wallet-health')).status,404);
  assert.equal((await member.session.get('/api/platform/tenants')).status,404);
  assert.equal((await member.session.post('/api/staff/wallet/restore',{},api)).status,404);
  assert.equal((await member.session.post('/api/staff/purchases',receipt,{json:true,headers:{Origin:'https://wrong.test'}})).status,403);
  assert.equal((await member.session.get('/solicitudes?canal=TIKTOK')).status,200);
  assert.equal((await member.session.get('/solicitudes?canal=INSTAGRAM')).status,200);
  assert.equal((await member.session.get('/solicitudes?canal=FACEBOOK')).status,403);
  assert.equal((await member.session.get('/planes')).status,403);
  const edited = await client.post(path+'/guardar',{revision:teamRevision(world,member.id),credential:loyalty.ownerToken,branch:loyalty.secondBranch.id,rewards:'yes'});
  assert.equal(edited.status,303);
  assert.equal((await member.session.post('/api/staff/purchases',{...receipt,branchId:loyalty.secondBranch.id},api)).status,403);
  assert.equal((await member.session.post('/api/staff/counter-redemptions',{branchId:loyalty.secondBranch.id},api)).status,200);
  assert.equal((await client.post(path+'/revocar',{revision:teamRevision(world,member.id),credential:loyalty.ownerToken,reason:'Cambio de función'})).status,303);
  assert.equal((await member.session.get('/api/staff/dashboard')).status,403);
  assert.equal((await member.session.get('/caja')).status,403);
  assert.equal((await member.session.get('/solicitudes?canal=TIKTOK')).status,200);
  assert.equal(loyalty.staff.get(original.staff_id).state,'INACTIVE');
  assert.ok(!loyalty.calls.some(call=>call.role==='CASHIER'&&call.path.startsWith('/api/platform')));
});
test('Caja sola funciona y recupera un alta de respuesta perdida sin duplicar el acceso',async t=>{
  const {loyalty,world,client} = await linked(t);
  const member = await colleague(world,client,{name:'Solo Caja',document:'1743252924'});
  const path = '/equipo/'+member.id+'/caja/guardar';
  const data = {revision:teamRevision(world,member.id),credential:loyalty.ownerToken,branch:loyalty.branch.id,purchases:'yes',rewards:'yes'};
  loyalty.loseCreateResponse();
  assert.equal((await client.post(path,data)).status,503);
  const pending = world.db.get('SELECT * FROM cash_grants WHERE account_id=?',member.id);
  assert.equal(pending.status,'PENDING');
  assert.equal((await member.session.get('/caja')).status,403);
  assert.equal((await client.post(path,data)).status,303);
  assert.equal([...loyalty.staff.values()].filter(p=>p.role==='CASHIER').length,1);
  assert.equal((await member.session.get('/caja')).status,200);
  assert.equal((await member.session.get('/solicitudes')).status,403);
  assert.equal((await member.session.get('/reportes')).status,403);
  assert.equal((await client.post('/equipo/'+member.id+'/desactivar',{revision:teamRevision(world,member.id),confirm:'yes'})).status,303);
  assert.equal((await member.session.get('/api/staff/dashboard')).status,401);
  assert.equal(world.db.get('SELECT status FROM cash_grants WHERE account_id=?',member.id).status,'INACTIVE');
  assert.equal(world.db.get('SELECT sealed_token FROM cash_grants WHERE account_id=?',member.id).sealed_token,null);
});
test('el servidor de Caja acepta únicamente un origen privado de loopback',()=>{
  assert.equal(loyaltyOrigin('http://127.0.0.1:8097'),'http://127.0.0.1:8097');
  for (const url of ['https://example.test','http://localhost:8097','http://127.0.0.1:8097/preview',
    'http://user:secret@127.0.0.1:8097','http://127.0.0.1:8097?admin=1']) {
    assert.throws(()=>loyaltyOrigin(url));
  }
});

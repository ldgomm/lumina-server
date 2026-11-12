import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agency,owner,colleague,portal,teamRevision } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
async function setup(t,grants={}){
 const native=await fakeLoyalty(t),world=await portal(t,native.origin,{platformToken:native.platformToken}),admin=await agency(world),business=await owner(world,'Caja propia','8');
 const person=await colleague(world,business.client,{name:'Operador',email:'operador@example.test',...grants});
 const tenant=world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',business.id).loyalty_tenant,branch=native.branches.get(tenant)[0].id;
 const assign=data=>business.client.post('/equipo/'+person.id+'/caja/guardar',{revision:teamRevision(world,person.id),branch,...data});
 return {...world,native,admin,business,person,branch,assign};
}
test('Wallet es la entrada única de un cajero sin permisos de servicios y conserva el módulo visual',async t=>{
 const w=await setup(t);assert.equal((await w.assign({purchases:'yes',rewards:'yes'})).status,303);
 const home=await w.person.session.get('/inicio');assert.match(home.body,/href="\/wallet"/);assert.doesNotMatch(home.body,/Loyalty · Caja/);
 const wallet=await w.person.session.get('/wallet');assert.equal(wallet.status,303);assert.equal(wallet.location,'/caja');
 const cash=await w.person.session.get('/caja');assert.equal(cash.status,200);assert.match(cash.body,/lumina-loyalty lumina-cashier/);assert.match(cash.body,/loyalty-workspace.css/);assert.match(cash.body,/practical.css/);assert.match(cash.body,/Volver a Lúmina/);assert.match(cash.body,/wallet-campaigns.js/);
 assert.doesNotMatch(cash.body,/name="credential"|name="password"|Tus servicios de Wallet/);
 assert.equal(w.db.get('SELECT COUNT(*) AS n FROM wallet_access WHERE account_id=?',w.person.id).n,0);
});
test('acceso mixto abre Caja primero y conserva sólo las áreas expresamente asignadas',async t=>{
 const w=await setup(t,{'WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes'});await w.assign({purchases:'yes'});
 assert.equal((await w.person.session.get('/wallet')).location,'/caja');
 const design=await w.person.session.get('/wallet?seccion=design');assert.equal(design.status,200);assert.match(design.body,/lumina-wallet-cash" content="yes"/);assert.match(design.body,/lumina-wallet-editable" content="\[\]"/);
 assert.equal((await w.person.session.get('/wallet?seccion=programs')).status,403);
 assert.equal((await w.person.session.post('/wallet-api/api/staff/programs',{}, {json:true})).status,403);
 const dashboard=JSON.parse((await w.person.session.get('/api/staff/dashboard')).body);assert.equal(dashboard.role,'CASHIER');assert.equal(dashboard.permissions.rewards,false);
});
test('consultar Wallet no concede compras o canjes ni crea credenciales al abrir la página',async t=>{
 const w=await setup(t,{'WALLET.VIEW':'yes'}),before=w.native.staff.size;
 const r=await w.person.session.get('/wallet');assert.equal(r.status,200);assert.match(r.body,/Falta asignarte compras o canjes/);assert.match(r.body,/Wallet → Atención en Caja/);
 assert.equal((await w.person.session.get('/caja')).status,403);assert.equal((await w.person.session.get('/api/staff/dashboard')).status,403);
 assert.equal(w.native.staff.size,before);assert.equal(w.db.get('SELECT COUNT(*) AS n FROM cash_grants').n,0);
});
test('el dueño ve la asignación de Caja antes de otros servicios; no se seleccionan operaciones sin su decisión',async t=>{
 const w=await setup(t),r=await w.business.client.get('/equipo/'+w.person.id);assert.equal(r.status,200);
 assert.ok(r.body.indexOf('data-module="WALLET"')<r.body.indexOf('data-module="SOCIAL"'));assert.match(r.body,/Guardar acceso/);assert.match(r.body,/<option value="OFF" selected>/);assert.equal((r.body.match(/data-module="WALLET"/g)||[]).length,1);
 assert.doesNotMatch(r.body,/name="(?:purchases|rewards)"[^>]*checked/);
 assert.equal((await w.admin.get('/equipo/'+w.person.id)).status,403);assert.equal((await w.person.session.get('/equipo/'+w.person.id)).status,403);
});
test('un cajero registra compras y canjea con su sucursal, CSRF e idempotencia sin acceder a diseño',async t=>{
 const w=await setup(t);await w.assign({purchases:'yes',rewards:'yes'});
 const data={branchId:w.branch,memberId:uuid(),amountMinor:2000,receipt:'TEST-ONLY',currency:'USD'};
 assert.equal((await w.person.session.post('/api/staff/members/lookup',{cardCode:'fake'}, {json:true})).status,200);
 assert.equal((await w.person.session.post('/api/staff/purchases/quote',data,{json:true})).status,200);
 for(const path of ['/api/staff/purchases','/api/staff/counter-redemptions']){
  const key=uuid();assert.equal((await w.person.session.post(path,data,{json:true,headers:{'Idempotency-Key':key}})).status,200);assert.equal(w.native.calls.at(-1).key,key);
  assert.equal((await w.person.session.post(path,{...data,branchId:uuid()},{json:true})).status,403);
  assert.equal((await w.person.session.post(path,data,{json:true,headers:{'X-Lumina-CSRF':'stale'}})).status,403);
 }
 assert.equal((await w.person.session.post('/api/staff/programs',{}, {json:true})).status,404);assert.equal((await w.person.session.get('/wallet-api/api/staff/dashboard')).status,403);
 assert.equal((await w.admin.get('/caja')).status,403);assert.equal((await w.business.client.get('/caja')).status,403);
});
test('compras y canjes permanecen independientes al cambiar el permiso en una sesión existente',async t=>{
 const w=await setup(t),data={branchId:w.branch,memberId:uuid(),amountMinor:1000};await w.assign({purchases:'yes'});
 assert.equal((await w.person.session.post('/api/staff/purchases',data,{json:true})).status,200);
 assert.equal((await w.person.session.post('/api/staff/counter-redemptions',data,{json:true})).status,403);
 await w.assign({rewards:'yes'});
 assert.equal((await w.person.session.post('/api/staff/purchases',data,{json:true})).status,403);
 assert.equal((await w.person.session.post('/api/staff/counter-redemptions',data,{json:true})).status,200);
 assert.equal((await w.person.session.get('/wallet')).location,'/caja');
});

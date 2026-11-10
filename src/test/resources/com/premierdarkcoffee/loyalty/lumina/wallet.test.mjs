import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { agency, colleague, owner, portal } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { walletRouteAllowed } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/wallet/wallet.mjs';

async function context(t){
  const loyalty=await fakeLoyalty(t),world=await portal(t,loyalty.origin),admin=await agency(world);
  const {client,id}=await owner(world,'Negocio Wallet','5');
  await admin.post('/clientes/verificar?empresa='+id);
  return {loyalty,world,admin,client,id};
}
const connect=(client,loyalty)=>client.post('/wallet/conectar',{credential:loyalty.ownerToken,slug:loyalty.business.slug,confirm:'yes'});
test('Wallet visible para agencia y dueño; resumen, producción, agenda y canales usan datos reales',async t=>{
  const {admin,client,world,id}=await context(t);
  const before=world.db.get('SELECT count(*) AS n FROM requests').n;
  for(const route of ['/resumen','/produccion','/agenda-general','/wallet','/canales/instagram','/canales/maps','/canales/web']){
    const res=await admin.get(route);assert.equal(res.status,200,route);assert.match(res.body,/href="\/wallet"/);
  }
  assert.match((await client.get('/inicio')).body,/Wallet, siempre a mano/);
  const view=await admin.get('/resumen');assert.match(view.body,/Negocios/);assert.match(view.body,/Pendientes|pendientes/);
  assert.equal((await client.get('/produccion')).status,403);
  assert.equal((await client.get('/agenda-general')).status,403);
  assert.equal((await client.get('/canales/web')).status,200);
  assert.equal((await client.get('/wallet?empresa='+id)).status,200);
  assert.equal(world.db.get('SELECT count(*) AS n FROM requests').n,before);
});
test('dueño abre Wallet con su identidad existente y no expone su credencial al navegador',async t=>{
  const {client,loyalty,world,id}=await context(t);
  assert.equal((await client.get('/wallet-api/api/staff/wallet-design')).status,409);
  assert.equal((await connect(client,loyalty)).status,303);
  assert.equal(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant,loyalty.business.id);
  const page=await client.get('/wallet');assert.equal(page.status,200);assert.match(page.body,/Estudio de tarjetas/);assert.match(page.body,/Configurado/);assert.ok(!page.body.includes(loyalty.ownerToken));
  const shell=await client.get('/wallet/gestion?seccion=design');assert.equal(shell.status,200);assert.match(shell.body,/loyalty-context.js/);assert.ok(!shell.body.includes(loyalty.ownerToken));
  assert.match(shell.headers.get('content-security-policy'),/style-src 'self' 'unsafe-inline'/);
  const design=await client.get('/wallet-api/api/staff/wallet-design');assert.equal(design.status,200);assert.equal(JSON.parse(design.body).company,loyalty.business.id);
  assert.equal((await client.get('/wallet-api/api/platform/overview')).status,403);
  assert.equal((await client.get('/wallet-api/api/me')).status,403);
  assert.equal((await client.get('/platform')).status,403);
  const restore=await client.post('/wallet-api/api/staff/wallet/restore',{confirmed:true},{json:true,headers:{'X-Lumina-CSRF':client.csrf}});assert.equal(restore.status,200);
  const join=await client.get(JSON.parse(restore.body).path);assert.equal(join.status,303);assert.equal(join.location,loyalty.origin+'/join/'+loyalty.business.slug+'?restore=ficticio');
  assert.equal((await client.get('/api/staff/wallet-health')).status,404);
  for(const table of ['companies','accounts','sessions','audit'])assert.ok(!JSON.stringify(world.db.all('SELECT * FROM '+table)).includes(loyalty.ownerToken));
  const index=loyalty.calls.length;
  assert.equal((await client.post('/wallet/desconectar')).status,303);
  assert.equal((await client.get('/wallet-api/api/staff/wallet-design')).status,409);
  assert.equal(loyalty.calls.length,index);
});
test('Wallet exige CSRF y origen en escrituras, conserva PUT y rechaza otra cuenta de negocio',async t=>{
  const {client,loyalty,world,admin}=await context(t);
  await connect(client,loyalty);await client.get('/wallet');
  async function put(headers){return fetch(world.origin+'/wallet-api/api/staff/wallet-design',{method:'PUT',headers:{Cookie:client.cookie,'Content-Type':'application/json',...headers},body:JSON.stringify({version:9})});}
  assert.equal((await put({Origin:world.origin})).status,403);
  assert.equal((await put({Origin:'https://foreign.test','X-Lumina-CSRF':client.csrf})).status,403);
  const result=await put({Origin:world.origin,'X-Lumina-CSRF':client.csrf});assert.equal(result.status,200);assert.equal((await result.json()).version,9);
  const other=await owner(world,'Otro negocio','6');await admin.post('/clientes/verificar?empresa='+other.id);
  assert.equal((await connect(other.client,loyalty)).status,409);
  assert.equal((await other.client.get('/wallet-api/api/staff/wallet-design')).status,409);
});
test('permisos Wallet de colaborador no conceden credenciales de dueño o de plataforma',async t=>{
  const {client,loyalty,world}=await context(t);
  const member=await colleague(world,client,{name:'Solo contenido',email:'wallet-team@example.test','WALLET.VIEW':'yes','WALLET.REQUEST':'yes'});
  const page=await member.session.get('/wallet');assert.equal(page.status,200);assert.match(page.body,/Servicios de Wallet/);assert.doesNotMatch(page.body,/name="credential"/);
  assert.equal((await connect(member.session,loyalty)).status,403);
  assert.equal((await member.session.get('/wallet/gestion')).status,403);
  assert.equal((await member.session.get('/wallet-api/api/staff/dashboard')).status,403);
  assert.equal((await member.session.get('/wallet-api/api/platform/overview')).status,403);
  assert.equal((await member.session.get('/caja')).status,403);
  assert.equal((await client.post('/equipo/'+member.id+'/permisos',{'INSTAGRAM.VIEW':'yes',revision:String(world.db.get('SELECT revision FROM accounts WHERE id=?',member.id).revision)})).status,303);
  assert.equal((await member.session.get('/wallet')).status,403);
});
test('revocación de Loyalty y cierre de sesión bloquean el acceso delegado inmediatamente',async t=>{
  const {client,loyalty,world}=await context(t);await connect(client,loyalty);
  const remote=[...loyalty.staff.values()].find(p=>p.token===loyalty.ownerToken);remote.state='INACTIVE';
  assert.equal((await client.get('/wallet-api/api/staff/wallet-health')).status,401);
  assert.equal((await client.get('/wallet-api/api/staff/wallet-health')).status,409);
  remote.state='ACTIVE';await connect(client,loyalty);await client.get('/wallet');await client.post('/salir');
  assert.equal((await client.get('/wallet-api/api/staff/wallet-health')).status,401);
  assert.equal(world.db.get('SELECT count(*) AS n FROM sessions WHERE account_id=?',world.db.get("SELECT id FROM accounts WHERE kind='OWNER'").id).n,0);
});
test('agencia administra Loyalty y ambas plataformas con el acceso de plataforma existente',async t=>{
  const {admin,loyalty}=await context(t);
  const result=await admin.post('/wallet/conectar',{credential:loyalty.platformToken,confirm:'yes'});assert.equal(result.status,303);
  const page=await admin.get('/wallet');assert.equal(page.status,200);assert.match(page.body,/Apple Wallet/);assert.match(page.body,/Google Wallet/);assert.match(page.body,/Configurado/);assert.match(page.body,/Negocio conectado/);assert.ok(!page.body.includes(loyalty.platformToken));
  assert.equal((await admin.get('/platform')).status,200);
  assert.equal((await admin.get('/wallet-api/api/platform/overview')).status,200);
  assert.equal((await admin.get('/wallet-api/api/staff/dashboard')).status,403);
  assert.equal((await admin.get('/wallet-api/api/platform/tenants/'+loyalty.business.id+'/customer-activity')).status,200);
});
test('rutas delegadas limitadas; métodos, rutas públicas y roles desconocidos no se elevan',()=>{
  const id='00000000-0000-0000-0000-000000000001';
  assert.equal(walletRouteAllowed('OWNER','PUT','/api/staff/wallet-design'),true);
  assert.equal(walletRouteAllowed('OWNER','POST','/api/staff/wallet/restore'),true);
  assert.equal(walletRouteAllowed('COLLABORATOR','POST','/api/staff/wallet/restore'),false);
  assert.equal(walletRouteAllowed('OWNER','DELETE','/api/staff/programs/'+id),true);
  for(const role of ['AGENCY','OWNER','COLLABORATOR','anything'])for(const path of ['/api/me','/api/public/demo/enroll','/api/platform/wallet/reset','/api/staff/wallet-design/extra','/api/staff/../platform/overview'])for(const method of ['GET','POST','PUT','DELETE'])assert.equal(walletRouteAllowed(role,method,path),false);
  assert.equal(walletRouteAllowed('COLLABORATOR','GET','/api/staff/dashboard'),false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { teamRevision, agency,colleague,owner,portal } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { openDatabase } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import { uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const schema=relative=>readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/'+relative,import.meta.url),'utf8');
async function setup(t){const loyalty=await fakeLoyalty(t),world=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken}),admin=await agency(world);return {loyalty,world,admin};}
const scope=id=>({headers:{'X-Lumina-Company':id}});

test('activar Wallet prepara un registro propio y contacto sin verificación manual ni promociones ficticias',async t=>{
 const {loyalty,world}=await setup(t);const {client,id}=await owner(world,'Panadería Sol','1');
 const company=world.db.get('SELECT * FROM companies WHERE id=?',id);assert.equal(company.approved,0);assert.ok(company.loyalty_tenant);assert.notEqual(company.loyalty_tenant,loyalty.business.id);
 assert.equal(loyalty.registrations.size,1);assert.equal(loyalty.branches.get(company.loyalty_tenant).length,1);
 const view=await client.get('/wallet');assert.equal(view.status,200);assert.match(view.body,/<body class="lumina-loyalty">/);assert.match(view.body,/Panadería Sol/);assert.match(view.body,/name="lumina-wallet-back" content="\/home"/);
 assert.equal(world.db.get("SELECT document FROM accounts WHERE company_id=? AND kind='OWNER'",id).document,'1748639844');assert.equal(world.db.get('SELECT phone FROM companies WHERE id=?',id).phone,'+593991234567');
 assert.doesNotMatch(view.body,/Asociar negocio|Café Loyalty|Registro de Loyalty|name="credential"/);
 const dashboard=JSON.parse((await client.get('/wallet-api/api/staff/dashboard')).body);assert.equal(dashboard.business.name,'Panadería Sol');assert.deepEqual(dashboard.programs,[]);assert.deepEqual(dashboard.rewards,[]);
 const member=await colleague(world,client,{name:'Caja principal',document:'1733224974'});
 const branch=dashboard.branches[0].id;
 assert.equal((await client.post('/team/'+member.id+'/cashier/save',{revision:teamRevision(world,member.id),branch,purchases:'yes',rewards:'yes'})).status,303);
 assert.equal((await member.session.get('/cashier')).status,200);
});
test('una interrupción tras crear Wallet recupera el mismo negocio y no entrega el demo',async t=>{
 const {loyalty,world}=await setup(t);loyalty.loseRegistrationResponse();
 const {client,id}=await owner(world,'Respuesta interrumpida','2');
 assert.equal(loyalty.registrations.size,1);
 const expected=loyalty.registrations.get(id).id;
 assert.equal(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant,null);
 assert.equal((await client.get('/wallet')).status,200);
 assert.equal(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant,expected);
 for(let n=0;n<3;n++)assert.equal((await client.get('/wallet')).status,200);
 assert.equal(loyalty.registrations.size,1);
 assert.equal(world.db.get('SELECT count(*) AS n FROM wallet_access').n,1);
});
test('la caída del servicio conserva la cuenta y reintenta sin pedir asociación al regresar',async t=>{
 const {loyalty,world}=await setup(t);loyalty.registrationUnavailable(true);
 const {client,id}=await owner(world,'Registro pendiente','3');
 assert.equal(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant,null);
 const pending=await client.get('/wallet');assert.equal(pending.status,503);assert.match(pending.body,/No pudimos abrir Wallet/);assert.match(pending.body,/Volver a intentar/);assert.doesNotMatch(pending.body,/Wallet activa|Asociar negocio/);
 loyalty.registrationUnavailable(false);assert.equal((await client.get('/wallet')).status,200);
 assert.ok(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant);assert.equal(loyalty.registrations.size,1);
});
test('agencia consulta cada negocio sin abrir su sesión operativa ni emitir credenciales',async t=>{
 const {loyalty,world,admin}=await setup(t);const a=await owner(world,'Negocio A','4'),b=await owner(world,'Negocio B','5');
 const directory=await admin.get('/wallet');assert.match(directory.body,/Negocio A/);assert.match(directory.body,/Negocio B/);assert.doesNotMatch(directory.body,/Café Loyalty|Asociar negocio|Administración de Loyalty/);
 for(const company of [a,b]){
  const page=await admin.get('/wallet?company='+company.id);assert.match(page.body,/Wallet activa/);
  const workspace=await admin.get('/wallet/management?company='+company.id);assert.equal(workspace.status,403);assert.doesNotMatch(workspace.body,/lumina-wallet-mode/);
  const slug=loyalty.registrations.get(company.id).slug;
  const qr=await admin.get('/api/public/'+slug+'/qr?company='+company.id);assert.equal(qr.status,403);
  const join=await admin.get('/join/'+slug+'?company='+company.id);assert.equal(join.status,403);
 }
 const slugB=loyalty.registrations.get(b.id).slug;
 assert.equal((await admin.get('/api/public/'+slugB+'/qr?company='+a.id)).status,403);
 assert.equal((await a.client.get('/api/public/'+slugB+'/qr?company='+b.id)).status,403);
 const responses=await Promise.all([admin.get('/wallet-api/api/staff/dashboard',scope(a.id)),admin.get('/wallet-api/api/staff/dashboard',scope(b.id))]);
 assert.deepEqual(responses.map(r=>r.status),[403,403]);
 const accesses=world.db.all("SELECT w.* FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE a.kind='AGENCY'");assert.equal(accesses.length,0);
 assert.equal((await admin.get('/wallet-api/api/platform/tenants')).status,403);
 assert.equal((await admin.get('/wallet-api/api/staff/dashboard')).status,403);
 assert.equal((await a.client.get('/wallet-api/api/staff/dashboard',scope(b.id))).status,403);
 assert.equal((await admin.get('/platform')).location,'/wallet');
 assert.ok(!JSON.stringify(accesses).includes(loyalty.platformToken));
});
test('las asociaciones históricas conservan tenant y credenciales al actualizar y abrir Wallet',async t=>{
 const loyalty=await fakeLoyalty(t),integration={},world=await portal(t,loyalty.origin,integration);await agency(world);
 const {client,id}=await owner(world,'Negocio histórico','6');
 world.db.run('UPDATE companies SET loyalty_tenant=?,loyalty_name=? WHERE id=?',loyalty.business.id,loyalty.business.name,id);integration.platformToken=loyalty.platformToken;
 await client.get('/wallet');const before={...world.db.get('SELECT * FROM wallet_access')};
 for(let n=0;n<2;n++)await client.get('/wallet');
 assert.deepEqual({...world.db.get('SELECT * FROM wallet_access')},before);assert.equal(loyalty.registrations.size,0);
 assert.equal(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant,loyalty.business.id);
});
test('migración v2 preserva todos los accesos cifrados y realiza un respaldo privado sin repetirlo',()=>{
 const folder=mkdtempSync(join(tmpdir(),'lumina-onboarding-')),path=join(folder,'agency.sqlite');
 try{
  let raw=new DatabaseSync(path);raw.exec(schema('schema.sql'));raw.exec(schema('migrations/002_unified.sql'));raw.exec('PRAGMA user_version=2');
  const company=uuid(),account=uuid(),tenant=uuid();
  raw.prepare('INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at,loyalty_tenant) VALUES(?,?,?,?,?,?,?)').run(company,'Existente','private-id','1234','0991234567','2026-10-01',tenant);
  raw.prepare("INSERT INTO accounts(id,company_id,name,email,kind) VALUES(?,?,?,?,'OWNER')").run(account,company,'Persona','1759900820');
  raw.prepare("INSERT INTO wallet_access VALUES(?,?,?,?,?,?,?,'ACTIVE',?)").run(account,company,tenant,uuid(),'Lúmina · Persona',uuid(),'unchanged-ciphertext','2026-10-01');
  const before=raw.prepare('SELECT * FROM wallet_access').all();raw.close();
  let db=openDatabase(path);assert.deepEqual(db.all('SELECT * FROM wallet_access'),before);assert.equal(db.get('PRAGMA user_version').user_version,10);db.close();
  assert.equal(readdirSync(join(folder,'migrations')).length,1);db=openDatabase(path);assert.deepEqual(db.all('SELECT * FROM wallet_access'),before);db.close();assert.equal(readdirSync(join(folder,'migrations')).length,1);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('identidades y permisos del equipo se administran desde Lúmina sin emitir credenciales al navegador',async t=>{
 const {world,admin}=await setup(t);const {client,id}=await owner(world,'Equipo integrado','7');await client.get('/wallet');
 for(const method of ['GET','POST']){
  const response=method==='GET'?await client.get('/wallet-api/api/staff/team'):await client.post('/wallet-api/api/staff/credentials',{role:'OWNER'},{json:true,headers:{'X-Lumina-CSRF':client.csrf}});
  assert.equal(response.status,403);
 }
 const view=await client.get('/team');assert.match(view.body,/Añadir persona/);assert.doesNotMatch(view.body,/verify tu negocio|name="credential"/);
 const agency=await admin.get('/wallet/management?company='+id);assert.equal(agency.status,403);assert.doesNotMatch(agency.body,/lumina-wallet-mode/);
});

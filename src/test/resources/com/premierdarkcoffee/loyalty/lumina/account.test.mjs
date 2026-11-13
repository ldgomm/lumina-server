import test from 'node:test';
import assert from 'node:assert/strict';
import { portal, agency, owner, colleague, password } from './helpers.mjs';
import { cajaHtml, loyaltyWorkspaceHtml } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/wallet-pages.mjs';

for(const role of ['AGENCY','OWNER','COLLABORATOR'])test('Mi cuenta concentra perfil y salida para '+role,async t=>{
 const w=await portal(t);const admin=await agency(w);const business=await owner(w,'Cuenta prueba',1);
 const staff=await colleague(w,business.client,{name:'Colaborador',email:'cuenta-colab@example.test','SOCIAL.VIEW':'yes'});
 const session=role==='AGENCY'?admin:role==='OWNER'?business.client:staff.session;
 const account=await session.get('/cuenta');assert.equal(account.status,200);
 assert.match(account.body,/TU PERFIL/);assert.match(account.body,/name="confirmation"/);assert.equal((account.body.match(/action="\/salir"/g)||[]).length,1);
 for(const path of [role==='AGENCY'?'/clientes':'/inicio','/contenido']) {
  const page=await session.get(path);assert.equal(page.status,200,page.body);assert.match(page.body,/href="\/cuenta"/);assert.doesNotMatch(page.body,/action="\/salir"|>Cerrar sesión</);
 }
});

test('cerrar otras sesiones conserva la actual y las cuentas ajenas',async t=>{
 const w=await portal(t);const a=await owner(w,'Primero',1),b=await owner(w,'Segundo',2);
 const extra=w.session();assert.equal((await extra.post('/entrar',{email:'negocio1@example.test',password})).status,303);await extra.get('/cuenta');
 assert.match((await a.client.get('/cuenta')).body,/otra sesión abierta/);
 assert.equal((await a.client.post('/cuenta/sesiones/cerrar',{account_id:w.db.get('SELECT id FROM accounts WHERE company_id=?',b.id).id})).status,303);
 assert.equal((await a.client.get('/cuenta')).status,200);assert.equal((await extra.get('/cuenta')).location,'/');assert.equal((await b.client.get('/cuenta')).status,200);
});
test('cerrar otras sesiones exige CSRF y no admite GET mutante',async t=>{
 const w=await portal(t);const a=await owner(w,'Primero',1);const count=()=>w.db.get('SELECT count(*) n FROM sessions').n;
 const n=count();assert.equal((await a.client.post('/cuenta/sesiones/cerrar',{_csrf:'wrong'})).status,403);assert.equal(count(),n);
 assert.equal((await a.client.get('/cuenta/sesiones/cerrar')).status,404);assert.equal(count(),n);
});
test('contraseña incorrecta y confirmación fallida no cambian sesiones ni exponen campos',async t=>{
 const w=await portal(t);const a=await owner(w,'Cuenta',1);const secret='Secreto nuevo distinto 567!';
 const before=w.db.all('SELECT * FROM sessions');
 for(const data of [{current:password,password:secret,confirmation:'otra'},{current:'incorrecta',password:secret,confirmation:secret}]) {
  const result=await a.client.post('/cuenta/clave',data);assert.ok([400,403].includes(result.status));assert.match(result.body,/role="alert"/);assert.doesNotMatch(result.body,new RegExp(secret));assert.deepEqual(w.db.all('SELECT * FROM sessions'),before);
 }
});
test('cambiar contraseña mantiene identidad, negocio y permisos y renueva la sesión actual',async t=>{
 const w=await portal(t);const a=await owner(w,'Cuenta',1),next='Contraseña nueva fuerte 456!';const oldCookie=a.client.cookie;
 const before=w.db.get('SELECT id,company_id,kind FROM accounts WHERE company_id=?',a.id),company=w.db.get('SELECT * FROM companies WHERE id=?',a.id);
 const result=await a.client.post('/cuenta/clave',{current:password,password:next,confirmation:next});assert.equal(result.location,'/cuenta?estado=clave');assert.notEqual(a.client.cookie,oldCookie);
 assert.deepEqual(w.db.get('SELECT id,company_id,kind FROM accounts WHERE company_id=?',a.id),before);assert.deepEqual(w.db.get('SELECT * FROM companies WHERE id=?',a.id),company);
 const other=w.session();assert.equal((await other.post('/entrar',{email:'negocio1@example.test',password})).status,401);assert.equal((await other.post('/entrar',{email:'negocio1@example.test',password:next})).status,303);
});
test('cerrar sesión bloquea también el proxy de Wallet sin cambiar asociaciones',async t=>{
 const w=await portal(t);const a=await owner(w,'Cuenta',1);const company=w.db.get('SELECT * FROM companies WHERE id=?',a.id);
 assert.equal((await a.client.post('/salir')).status,303);assert.equal((await a.client.get('/wallet-api/api/staff/dashboard')).status,401);assert.equal((await a.client.get('/cuenta')).location,'/');assert.deepEqual(w.db.get('SELECT * FROM companies WHERE id=?',a.id),company);
});
test('Wallet y Caja enlazan la cuenta central y conservan Volver a Lúmina',()=>{
 const actor={kind:'COLLABORATOR',name:'Equipo',company_id:'c',csrf:'test',grants:[{scope:'WALLET',action:'VIEW'},{scope:'WALLET_DESIGN',action:'VIEW'}]};
 for(const html of [cajaHtml(actor,{name:'Prueba'},{branch_name:'Principal'}),loyaltyWorkspaceHtml(actor,'design',['design'],{id:'c',name:'Prueba'})]) {
  assert.match(html,/data-lumina-account href="\/cuenta"/);assert.match(html,/id="exit"[^>]*>Volver a Lúmina/);assert.doesNotMatch(html,/action="\/salir"/);
 }
});
test('Mi cuenta escapa nombres y no muestra credenciales internas',async t=>{
 const w=await portal(t);const a=await owner(w,'Cuenta',1);w.db.run('UPDATE accounts SET name=? WHERE company_id=?','<script>personal</script>',a.id);
 const p=await a.client.get('/cuenta');assert.match(p.body,/&lt;script&gt;personal/);assert.doesNotMatch(p.body,/<script>personal|password_hash|auth_cipher|session_id/);
});

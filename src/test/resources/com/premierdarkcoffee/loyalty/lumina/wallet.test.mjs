import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teamRevision, agency, colleague, owner, portal, password } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { walletRouteAllowed } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/wallet/wallet.mjs';
async function context(t,link=true){
 const loyalty=await fakeLoyalty(t),integration={},world=await portal(t,loyalty.origin,integration),admin=await agency(world);
 const {client,id}=await owner(world,'Negocio Wallet','5');await admin.post('/agencia/clientes/verificar?empresa='+id);
 // Existing businesses from previous versions retain their exact binding.
 if(link)world.db.run('UPDATE companies SET loyalty_tenant=?,loyalty_name=? WHERE id=?',loyalty.business.id,loyalty.business.name,id);
 integration.platformToken=loyalty.platformToken;
 return {loyalty,world,admin,client,id};
}
test('navegación unifica redes y mantiene servicios, cartera, agenda y Wallet',async t=>{
 const {admin,client,world}=await context(t);
 for(const path of ['/resumen','/produccion','/agenda-general','/wallet','/contenido','/servicios/maps','/servicios/web','/servicios/brand','/proximamente'])assert.equal((await admin.get(path)).status,200,path);
 const page=await client.get('/inicio');assert.match(page.body,/Contenido para redes/);assert.match(page.body,/Diseño de marca/);assert.match(page.body,/Próximamente/);assert.doesNotMatch(page.body,/href="\/canales\/(instagram|tiktok|youtube|facebook)"/);
 assert.equal((await client.get('/produccion')).status,403);
 const old=await client.get('/canales/instagram');assert.equal(old.status,303);assert.equal(old.location,'/contenido');
 assert.equal(world.db.get('SELECT count(*) AS n FROM requests').n,0);
});
test('dueño accede sin credenciales y mantiene el mismo acceso después de cerrar y volver a ingresar',async t=>{
 const {client,loyalty,world}=await context(t);
 const page=await client.get('/wallet');assert.equal(page.status,200);assert.match(page.body,/<body class="lumina-loyalty">/);assert.doesNotMatch(page.body,/name="credential"|Conecta el Wallet/);
 const row=world.db.get('SELECT * FROM wallet_access');assert.equal(row.status,'ACTIVE');const token=loyalty.staff.get(row.staff_id).token;
 for(const path of ['/wallet','/wallet/gestion?seccion=design','/equipo']){const view=await client.get(path);assert.equal(view.status,200);assert.ok(!view.body.includes(token));assert.ok(!view.body.includes(loyalty.platformToken));assert.doesNotMatch(view.body,/name="credential"/);}
 assert.ok(!JSON.stringify(world.db.all('SELECT * FROM wallet_access')).includes(token));
 assert.equal(JSON.parse((await client.get('/wallet-api/api/staff/wallet-design')).body).company,loyalty.business.id);
 assert.equal((await client.get('/wallet-api/api/platform/overview')).status,403);
 const restore=await client.post('/wallet-api/api/staff/wallet/restore',{confirmed:true},{json:true,headers:{'X-Lumina-CSRF':client.csrf}});assert.equal(restore.status,200);
 const join=await client.get(JSON.parse(restore.body).path);assert.equal(join.location,loyalty.origin+'/join/'+loyalty.business.slug+'?restore=ficticio');
 await client.post('/salir');assert.equal((await client.get('/wallet-api/api/staff/dashboard')).status,401);
 await client.post('/entrar',{email:'negocio5@example.test',password});await client.get('/wallet');
 assert.equal(world.db.get('SELECT staff_id FROM wallet_access').staff_id,row.staff_id);assert.equal(loyalty.staff.get(row.staff_id).token,token);
});
test('las escrituras de Wallet exigen origen y CSRF, incluido PUT',async t=>{
 const {client,world}=await context(t);await client.get('/wallet');
 const put=headers=>fetch(world.origin+'/wallet-api/api/staff/wallet-design',{method:'PUT',headers:{Cookie:client.cookie,'Content-Type':'application/json',...headers},body:JSON.stringify({version:9})});
 assert.equal((await put({Origin:world.origin})).status,403);
 assert.equal((await put({Origin:'https://foreign.test','X-Lumina-CSRF':client.csrf})).status,403);
 const result=await put({Origin:world.origin,'X-Lumina-CSRF':client.csrf});assert.equal(result.status,200);assert.equal((await result.json()).version,9);
});
test('alta automática usa un negocio propio y retira la asociación manual al demo',async t=>{
 const {client,loyalty,world,admin,id}=await context(t,false);
 assert.equal((await client.get('/wallet-api/api/staff/dashboard')).status,200);
 const tenant=world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant;
 assert.notEqual(tenant,loyalty.business.id);
 for(const session of [client,admin])assert.equal((await session.post('/wallet/vincular?empresa='+id,{tenant:loyalty.business.id,confirm:'yes'})).status,session===admin?403:410);
 assert.equal(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant,tenant);
 const other=await owner(world,'Otro negocio','6');
 assert.equal((await other.client.get('/wallet-api/api/staff/dashboard')).status,200);
 assert.notEqual(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',other.id).loyalty_tenant,tenant);
});
test('colaborador solo ve áreas asignadas y no hereda edición, Caja ni administración',async t=>{
 const {client,world}=await context(t);
 const member=await colleague(world,client,{name:'Diseño',email:'design@example.test','WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes'});
 const page=await member.session.get('/wallet');assert.match(page.body,/name="lumina-wallet-section" content="design"/);assert.match(page.body,/content="\[&quot;design&quot;,&quot;qr&quot;\]"/);assert.doesNotMatch(page.body,/href="\/wallet\/gestion\?seccion=(customers|programs|reports)"/);
 assert.equal((await member.session.get('/wallet/gestion?seccion=design')).status,200);
 assert.equal((await member.session.get('/wallet/gestion?seccion=customers')).status,403);
 assert.equal((await member.session.get('/wallet-api/api/staff/wallet-design')).status,200);
 for(const path of ['/wallet-api/api/platform/overview','/wallet-api/api/staff/team','/wallet-api/api/staff/customer-activity','/caja','/equipo'])assert.equal((await member.session.get(path)).status,403,path);
 const put=()=>fetch(world.origin+'/wallet-api/api/staff/wallet-design',{method:'PUT',headers:{Cookie:member.session.cookie,Origin:world.origin,'Content-Type':'application/json','X-Lumina-CSRF':member.session.csrf},body:'{"version":9}'});
 assert.equal((await put()).status,403);
 let rev=world.db.get('SELECT revision FROM accounts WHERE id=?',member.id).revision;
 await client.post('/equipo/'+member.id+'/permisos',{revision:String(rev),'WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes','WALLET_DESIGN.EDIT':'yes'});
 assert.equal((await put()).status,200);
 rev=world.db.get('SELECT revision FROM accounts WHERE id=?',member.id).revision;
 await client.post('/equipo/'+member.id+'/permisos',{revision:String(rev),'SOCIAL.VIEW':'yes'});
 assert.equal((await member.session.get('/wallet-api/api/staff/wallet-design')).status,403);
 assert.equal((await member.session.get('/wallet')).status,403);
});
test('permisos de servicios no crean acceso operativo y baja de persona cierra Wallet',async t=>{
 const {client,world}=await context(t);
 const member=await colleague(world,client,{name:'Servicios',email:'services@example.test','WALLET.VIEW':'yes','WALLET.REQUEST':'yes'});
 assert.equal((await member.session.get('/wallet')).status,200);
 assert.equal((await member.session.get('/wallet-api/api/staff/dashboard')).status,403);
 assert.equal(world.db.get('SELECT count(*) AS n FROM wallet_access').n,0);
 await client.post('/equipo/'+member.id+'/permisos',{revision:String(world.db.get('SELECT revision FROM accounts WHERE id=?',member.id).revision),'WALLET.VIEW':'yes','WALLET_REPORTS.VIEW':'yes'});
 assert.equal((await member.session.get('/wallet-api/api/staff/wallet-health')).status,200);
 await client.post('/equipo/'+member.id+'/desactivar',{revision:teamRevision(world,member.id),confirm:'yes'});
 assert.equal((await member.session.get('/wallet-api/api/staff/wallet-health')).status,401);
});
test('revocación en Loyalty queda bloqueada; no se genera otra credencial ni se reactiva silenciosamente',async t=>{
 const {client,world,loyalty}=await context(t);await client.get('/wallet');
 const row=world.db.get('SELECT * FROM wallet_access');loyalty.staff.get(row.staff_id).state='INACTIVE';
 assert.equal((await client.get('/wallet-api/api/staff/wallet-health')).status,401);
 assert.equal((await client.get('/wallet-api/api/staff/wallet-health')).status,403);
 assert.equal(world.db.get('SELECT status FROM wallet_access').status,'BLOCKED');
 assert.equal([...loyalty.staff.values()].filter(p=>p.requestId===row.request_id).length,1);
});
test('alta de acceso único recupera respuesta perdida de forma idempotente',async t=>{
 const {client,world,loyalty}=await context(t);loyalty.loseCreateResponse();
 assert.equal((await client.get('/wallet-api/api/staff/dashboard')).status,503);
 assert.equal(world.db.get('SELECT status FROM wallet_access').status,'PENDING');
 assert.equal((await client.get('/wallet-api/api/staff/dashboard')).status,200);
 const row=world.db.get('SELECT * FROM wallet_access');assert.equal(row.status,'ACTIVE');
 assert.equal([...loyalty.staff.values()].filter(p=>p.requestId===row.request_id).length,1);
});
test('agencia entra directamente con configuración interna y sin secretos en HTML',async t=>{
 const {admin,loyalty}=await context(t);
 for(const path of ['/wallet']){const response=await admin.get(path);assert.equal(response.status,200);assert.doesNotMatch(response.body,/name="credential"/);assert.ok(!response.body.includes(loyalty.platformToken));}
 assert.equal((await admin.get('/wallet-api/api/platform/overview')).status,403);
 assert.equal((await admin.get('/platform')).location,'/wallet');
 assert.equal((await admin.get('/wallet-api/api/staff/dashboard')).status,403);
 assert.equal((await admin.post('/wallet/conectar',{credential:loyalty.ownerToken})).status,410);
});
test('rutas delegadas limitadas; métodos, rutas públicas y roles desconocidos no se elevan',()=>{
  const id='00000000-0000-0000-0000-000000000001';
  assert.equal(walletRouteAllowed('OWNER','PUT','/api/staff/wallet-design'),true);
  assert.equal(walletRouteAllowed('OWNER','POST','/api/staff/wallet/restore'),true);
  assert.equal(walletRouteAllowed('COLLABORATOR','POST','/api/staff/wallet/restore'),false);
  assert.equal(walletRouteAllowed('OWNER','DELETE','/api/staff/programs/'+id),true);
  for(const role of ['AGENCY','OWNER','COLLABORATOR','anything'])for(const path of ['/api/me','/api/public/demo/enroll','/api/platform/wallet/reset','/api/staff/wallet-design/extra','/api/staff/../platform/overview'])for(const method of ['GET','POST','PUT','DELETE'])assert.equal(walletRouteAllowed(role,method,path),false);
  assert.equal(walletRouteAllowed('COLLABORATOR','GET','/api/staff/dashboard'),false);
  for(const path of ['/api/platform/overview','/api/platform/tenants','/api/platform/tenants/'+id+'/team'])assert.equal(walletRouteAllowed('AGENCY','GET',path),false);
  for(const method of ['POST','PUT','DELETE'])assert.equal(walletRouteAllowed('AGENCY',method,'/api/platform/tenants/'+id+'/profile'),false);
});

test('reparar un acceso bloqueado exige dueño y confirmación; la agencia no puede reparar ni rotar',async t=>{
 const {client,world,loyalty,admin,id}=await context(t);await client.get('/wallet');
 const row=world.db.get('SELECT * FROM wallet_access');loyalty.staff.get(row.staff_id).state='INACTIVE';
 await client.get('/wallet-api/api/staff/dashboard');
 const path='/wallet/reparar?empresa='+id,input={account:row.account_id,account_revision:teamRevision(world,row.account_id),reason:'El dueño confirmó su acceso.',confirm:'yes'};
 assert.equal((await admin.post(path,input)).status,403);
 assert.equal((await client.post(path,{...input,confirm:''})).status,400);
 assert.equal((await client.post(path,input)).status,303);
 assert.equal((await client.get('/wallet-api/api/staff/dashboard')).status,200);
 assert.equal(world.db.get('SELECT staff_id FROM wallet_access').staff_id,row.staff_id);
 assert.ok(!loyalty.calls.some(call=>call.path.includes('/wallet/reset')));
});
test('informes delegados se abren sin consultar ni mostrar la cuenta comercial',async t=>{
 const {client,world,loyalty}=await context(t);
 const member=await colleague(world,client,{name:'Analista',email:'reports@example.test','WALLET.VIEW':'yes','WALLET_REPORTS.VIEW':'yes'});
 const start=loyalty.calls.length;
 assert.equal((await member.session.get('/wallet/gestion?seccion=reports')).location,'/gestion/informes');
 const view=await member.session.get('/gestion/informes');assert.equal(view.status,200);assert.match(view.body,/Resultados por sucursal/);assert.match(view.body,/105/);
 assert.ok(!loyalty.calls.slice(start).some(c=>c.path.endsWith('/account')));
 assert.equal((await member.session.get('/wallet-api/api/staff/account')).status,403);
});

test('una pestaña anterior no mezcla datos Wallet después de cambiar de cuenta',async t=>{
 const {client,world,admin,loyalty,id}=await context(t);await client.get('/wallet');const oldCsrf=client.csrf;
 await client.post('/salir');const other=await owner(world,'Otro titular','6');await admin.post('/agencia/clientes/verificar?empresa='+other.id);
 const tenant=world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',other.id).loyalty_tenant;
 const stale=await fetch(world.origin+'/wallet-api/api/staff/dashboard',{headers:{Cookie:other.client.cookie,'X-Lumina-CSRF':oldCsrf}});assert.equal(stale.status,403);
 const valid=await other.client.get('/wallet-api/api/staff/dashboard');assert.equal(valid.status,200);assert.equal(JSON.parse(valid.body).business.id,tenant);
 assert.equal(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant,loyalty.business.id);
});

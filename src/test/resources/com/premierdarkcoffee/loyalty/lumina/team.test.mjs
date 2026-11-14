import assert from 'node:assert/strict';
import {documentFor} from './helpers.mjs';
import { test } from 'node:test';
import { agency, owner, colleague, portal, password, teamRevision } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { getSession } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import { canRequest, requestAccessSql } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/content-policy.mjs';
import { now, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
import { contentData } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/content/workspace.mjs';
import { analytics, mapsData, publicationsFor } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/analytics/reporting.mjs';

async function setup(t) {
  const loyalty=await fakeLoyalty(t),world=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken});
  const admin=await agency(world),{client,id}=await owner(world,'Equipo seguro','1');
  const branch=loyalty.branches.get(world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',id).loyalty_tenant)[0].id;
  return {...world,world,loyalty,admin,client,id,branch};
}
const inviteCode = response => response.body.match(/<code class="secret">([A-Za-z0-9_-]{43})<\/code>/)?.[1];
const person = (w,input={}) => colleague(w,w.client,{name:'Persona de prueba',document:'1738277993','SOCIAL.VIEW':'yes',...input});
const write = (w,id,action,data={}) => w.client.post('/team/'+id+'/'+action,{revision:teamRevision(w,id),...(action==='details'?{phone:'0991234567'}:{}),...data});
const activeCash = async (w,member,permissions={purchases:'yes'}) => {
  const result=await write(w,member.id,'cashier/save',{branch:w.branch,...permissions});assert.equal(result.status,303,result.body);
  return w.db.get('SELECT * FROM cash_grants WHERE account_id=?',member.id);
};
const audit = (w,id) => w.db.all("SELECT * FROM audit WHERE subject='ACCOUNT' AND subject_id=? ORDER BY seq",id);

test('directorio: búsqueda, filtros, estados y paginación no mezclan personas de otros negocios',async t=>{
  const w=await setup(t),m=await person(w),other=await owner(w,'Negocio privado','2');
  await colleague(w,other.client,{name:'Persona secreta',document:'1705666814'});
  for(let i=0;i<21;i++)assert.equal((await w.client.post('/team',{name:'Invitada '+String(i).padStart(2,'0'),document:documentFor('invitada'+i+'@example.test'),'WEB.VIEW':'yes'})).status,201);
  const first=await w.client.get('/team');assert.equal(first.status,200);assert.match(first.body,/22 personas/);assert.match(first.body,/Siguiente/);assert.doesNotMatch(first.body,/Persona secreta|secreta@example/);
  assert.match((await w.client.get('/team?page=1')).body,/Anterior/);
  assert.match((await w.client.get('/team?q=persona&state=ACTIVE&area=SOCIAL')).body,/1 persona/);
  assert.match((await w.client.get('/team?state=PENDING&area=WEB')).body,/21 personas/);
  await write(w,m.id,'disable',{confirm:'yes'});
  assert.match((await w.client.get('/team?state=INACTIVE')).body,/Persona de prueba/);
  assert.equal((await w.client.get('/team?page=-1')).status,400);
  assert.equal((await w.client.get('/team?area=ADMIN')).status,400);
});
test('crear una persona rechaza permisos desconocidos, dependencias incompletas y privilegios de dueño',async t=>{
  const w=await setup(t);
  for(const grants of [{'SOCIAL.APPROVE':'yes'},{'WALLET_DESIGN.VIEW':'yes'},{'WALLET.VIEW':'yes','WALLET_REPORTS.VIEW':'yes','WALLET_REPORTS.EDIT':'yes'},{'ADMIN.VIEW':'yes'},{'SOCIAL.VIEW':'no'},{'SOCIAL.VIEW.extra':'yes'}]){
    const r=await w.client.post('/team',{name:'Borrador intacto',document:'1736305879',...grants});assert.equal(r.status,400);assert.match(r.body,/value="Borrador intacto"/);assert.equal(w.db.get('SELECT id FROM accounts WHERE document=?','1736305879'),undefined);
  }
  const m=await person(w,{kind:'OWNER',company_id:uuid()});assert.equal(w.db.get('SELECT kind FROM accounts WHERE id=?',m.id).kind,'COLLABORATOR');
});
test('una invitación se usa una vez, no inicia sesión antes de activarse y no guarda su código en el historial',async t=>{
  const w=await setup(t),r=await w.client.post('/team',{name:'Invitación única',document:'1723435424','WEB.VIEW':'yes'}),code=inviteCode(r);
  const id=w.db.get('SELECT id FROM accounts WHERE document=?','1723435424').id;
  assert.ok(code);assert.equal((await w.session().post('/login',{document:'1723435424',password})).status,401);
  assert.match((await w.client.get('/team/'+id)).body,/Por activar/);
  assert.equal((await w.session().post('/activate',{code,password,phone:'0991234567'})).status,303);
  assert.equal((await w.session().post('/activate',{code,password,phone:'0991234567'})).status,403);
  assert.ok(!JSON.stringify(audit(w,id)).includes(code));
  assert.doesNotMatch((await w.client.get('/team/'+id)).body,/<code class="secret">/);
});
test('códigos vencidos y renovados: sólo funciona el vigente y los formularios antiguos no reinician accesos',async t=>{
  const w=await setup(t),r=await w.client.post('/team',{name:'Invitación',document:'1722743307'}),code=inviteCode(r);
  const id=w.db.get('SELECT id FROM accounts WHERE document=?','1722743307').id,old=teamRevision(w,id);
  w.db.run("UPDATE codes SET expires_at='2001-01-01T00:00:00.000Z' WHERE account_id=?",id);
  assert.equal((await w.session().post('/activate',{code,password,phone:'0991234567'})).status,403);
  assert.match((await w.client.get('/team?state=EXPIRED')).body,/Cédula ····3307/);
  assert.equal((await write(w,id,'invite')).status,400);
  const next=await write(w,id,'invite',{confirm:'yes'});assert.equal(next.status,200);
  assert.equal((await write(w,id,'invite',{revision:old,confirm:'yes'})).status,409);
  assert.equal((await w.session().post('/activate',{code,password,phone:'0991234567'})).status,403);
  assert.equal((await w.session().post('/activate',{code:inviteCode(next),password,phone:'0991234567'})).status,303);
});
test('renovar el acceso explica y cierra sesiones, invalida la contraseña anterior y conserva los permisos',async t=>{
  const w=await setup(t),m=await person(w),before=w.db.all('SELECT scope,action FROM grants WHERE account_id=?',m.id);
  const view=await w.client.get('/team/'+m.id);assert.match(view.body,/Cierra sus sesiones y reemplaza su contraseña/);
  const reset=await write(w,m.id,'invite',{confirm:'yes'});assert.equal(reset.status,200);
  assert.equal((await m.session.post('/requests',{})).status,401);
  assert.equal((await w.session().post('/login',{document:'1738277993',password})).status,401);
  assert.deepEqual(w.db.all('SELECT scope,action FROM grants WHERE account_id=?',m.id),before);
  const restored=w.session();assert.equal((await restored.post('/activate',{code:inviteCode(reset),password,phone:'0991234567'})).status,303);assert.equal((await restored.get('/content')).status,200);
});
test('permisos: dos pestañas no se sobrescriben y el conflicto conserva el borrador con la versión antigua',async t=>{
  const w=await setup(t),m=await person(w),old=teamRevision(w,m.id);
  assert.equal((await write(w,m.id,'permissions',{'WEB.VIEW':'yes'})).status,303);
  const conflict=await write(w,m.id,'permissions',{revision:old,'SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes'});
  assert.equal(conflict.status,409);assert.match(conflict.body,new RegExp('name="revision" value="'+old+'"'));assert.match(conflict.body,/name="SOCIAL.REQUEST" value="yes" checked/);
  assert.deepEqual(w.db.all('SELECT scope,action FROM grants WHERE account_id=?',m.id).map(x=>x.scope+'.'+x.action),['WEB.VIEW']);
  assert.equal((await m.session.get('/content')).status,403);assert.equal((await m.session.get('/services/web')).status,200);
  const noOp=teamRevision(w,m.id);await write(w,m.id,'permissions',{'WEB.VIEW':'yes'});assert.equal(teamRevision(w,m.id),noOp);
  const changes=audit(w,m.id).filter(x=>x.action==='PERMISOS_ACTUALIZADOS');assert.equal(changes.length,1);assert.deepEqual(JSON.parse(changes[0].details).before.grants,['SOCIAL.VIEW']);assert.deepEqual(JSON.parse(changes[0].details).after.grants,['WEB.VIEW']);
});
test('baja, reactivación y edición usan revisión y confirmación sin reactivar por accidente',async t=>{
  const w=await setup(t),m=await person(w),old=teamRevision(w,m.id);
  assert.equal((await write(w,m.id,'disable')).status,400);
  assert.equal((await w.client.post('/team/'+m.id+'/disable',{confirm:'yes'})).status,409);
  assert.equal((await write(w,m.id,'disable',{confirm:'yes'})).status,303);
  assert.equal((await m.session.get('/api/staff/dashboard')).status,401);
  assert.equal((await write(w,m.id,'invite',{revision:old,confirm:'yes'})).status,409);
  assert.equal((await write(w,m.id,'permissions',{'WEB.VIEW':'yes'})).status,303);assert.equal(w.db.get('SELECT active FROM accounts WHERE id=?',m.id).active,0);
  const code=inviteCode(await write(w,m.id,'invite',{confirm:'yes'})),s=w.session();assert.equal((await s.post('/activate',{code,password,phone:'0991234567'})).status,303);assert.equal((await s.get('/services/web')).status,200);assert.equal((await s.get('/content')).status,403);
});
test('corregir cédula cierra sesiones y códigos; duplicados e identidad ajena no se aceptan',async t=>{
  const w=await setup(t),m=await person(w),old=teamRevision(w,m.id);
  const r=await write(w,m.id,'details',{name:'Nombre corregido',document:'1730212279'});assert.equal(r.status,303);
  assert.equal((await m.session.get('/api/staff/dashboard')).status,401);
  assert.equal((await w.session().post('/login',{document:'1738277993',password})).status,401);
  assert.equal((await w.session().post('/login',{document:'1730212279',password})).status,303);
  assert.equal((await write(w,m.id,'details',{revision:old,name:'Anterior',document:'1706707138'})).status,409);
  const r2=await write(w,m.id,'details',{name:'No perder texto',document:'1748225842'});assert.equal(r2.status,409);assert.match(r2.body,/value="No perder texto"/);
  assert.equal(w.db.get('SELECT document FROM accounts WHERE id=?',m.id).document,'1730212279');
});
test('ningún colaborador, agencia u otro dueño puede leer o modificar el equipo de un negocio',async t=>{
  const w=await setup(t),m=await person(w),other=await owner(w,'Otro equipo','3');
  for(const actor of [m.session,w.admin,other.client]){
    assert.equal((await actor.get('/team/'+m.id)).status,actor===other.client?404:403);
    for(const action of ['permissions','details','invite','disable','cashier/save','cashier/revoke'])assert.equal((await actor.post('/team/'+m.id+'/'+action,{revision:teamRevision(w,m.id),confirm:'yes',name:'Intento',document:'1723017594','SOCIAL.VIEW':'yes'})).status,actor===other.client?404:403,action);
  }
  const ownerId=w.db.get("SELECT id FROM accounts WHERE company_id=? AND kind='OWNER'",w.id).id;
  assert.equal((await write(w,ownerId,'disable',{confirm:'yes'})).status,404);assert.equal(w.db.get('SELECT active FROM accounts WHERE id=?',ownerId).active,1);
});
test('Caja valida revisión, sucursal y operaciones antes de crear credenciales; jamás confía en secretos del formulario',async t=>{
  const w=await setup(t),m=await person(w),base=teamRevision(w,m.id),size=w.loyalty.staff.size;
  for(const data of [{branch:w.branch},{branch:uuid(),purchases:'yes'},{revision:'999',branch:w.branch,purchases:'yes'}])assert.ok([400,409].includes((await write(w,m.id,'cashier/save',data)).status));
  assert.equal(w.loyalty.staff.size,size); // Existing owner access is reused; no cashier is created.
  assert.equal([...w.loyalty.staff.values()].filter(p=>p.role==='CASHIER').length,0);
  const grant=await activeCash(w,m);assert.notEqual(teamRevision(w,m.id),base);
  assert.equal((await write(w,m.id,'cashier/save',{revision:base,branch:w.branch,rewards:'yes'})).status,409);
  assert.equal(w.db.get('SELECT purchases FROM cash_grants WHERE account_id=?',m.id).purchases,1);
  assert.notEqual(grant.sealed_token,w.loyalty.staff.get(grant.staff_id).token);
});
test('retirar Caja durante caída de Wallet bloquea inmediatamente y permite completar el retiro sin reactivarla',async t=>{
  const w=await setup(t),m=await person(w),grant=await activeCash(w,m);w.loyalty.unavailable(true);
  const r=await write(w,m.id,'cashier/revoke',{reason:'Cambio de tareas'});assert.equal(r.status,503);assert.match(r.body,/Caja ya está bloqueada/);
  assert.match(r.body,new RegExp('action="/team/'+m.id+'/access"[^>]*>[\\s\\S]*?name="revision" value="'+teamRevision(w,m.id)+'"'));
  assert.equal(w.db.get('SELECT status FROM cash_grants WHERE account_id=?',m.id).status,'REVOKING');assert.equal((await m.session.get('/cashier')).status,403);assert.equal((await m.session.get('/api/staff/dashboard')).status,403);
  assert.equal((await m.session.get('/content')).status,200);w.loyalty.unavailable(false);
  assert.equal((await write(w,m.id,'cashier/revoke',{reason:'Completar el retiro'})).status,303);assert.equal(w.loyalty.staff.get(grant.staff_id).state,'INACTIVE');assert.equal(w.db.get('SELECT sealed_token FROM cash_grants WHERE account_id=?',m.id).sealed_token,null);
});
test('desactivar persona durante caída de Wallet cierra sesión y la limpieza remota puede reintentarse',async t=>{
  const w=await setup(t),m=await person(w),grant=await activeCash(w,m);w.loyalty.unavailable(true);
  const r=await write(w,m.id,'disable',{confirm:'yes'});assert.equal(r.status,200);assert.match(r.body,/Acceso desactivado/);
  assert.equal((await m.session.get('/api/staff/dashboard')).status,401);assert.equal(w.db.get('SELECT active FROM accounts WHERE id=?',m.id).active,0);
  w.loyalty.unavailable(false);assert.equal((await write(w,m.id,'cashier/revoke',{reason:'Confirmar baja remota'})).status,303);assert.equal(w.loyalty.staff.get(grant.staff_id).state,'INACTIVE');
});
test('baja normal retira automáticamente Caja y no requiere un segundo trámite del dueño',async t=>{
  const w=await setup(t),m=await person(w),grant=await activeCash(w,m);assert.equal((await write(w,m.id,'disable',{confirm:'yes'})).status,303);
  assert.equal(w.loyalty.staff.get(grant.staff_id).state,'INACTIVE');assert.equal(w.db.get('SELECT status FROM cash_grants WHERE account_id=?',m.id).status,'INACTIVE');
});
test('una respuesta de Caja en vuelo no entrega datos después de la baja de la persona',async t=>{
  const w=await setup(t),m=await person(w);await activeCash(w,m);
  let entered,release;const reached=new Promise(r=>entered=r),held=new Promise(r=>release=r);
  w.loyalty.beforeRequest(async call=>{if(call.path==='/api/staff/member-suggestions'){entered();await held;}});
  const pending=m.session.get('/api/staff/member-suggestions?q=Ana');await reached;
  assert.equal((await write(w,m.id,'disable',{confirm:'yes'})).status,303);release();assert.equal((await pending).status,401);
});
test('no se restaura Caja si el dueño modifica permisos mientras se prepara el acceso remoto',async t=>{
  const w=await setup(t),m=await person(w);let entered,release;const reached=new Promise(r=>entered=r),held=new Promise(r=>release=r);
  w.loyalty.beforeRequest(async call=>{if(call.path==='/api/staff/credentials'){entered();await held;}});
  const pending=write(w,m.id,'cashier/save',{branch:w.branch,purchases:'yes'});await reached;
  assert.equal((await write(w,m.id,'permissions',{'WEB.VIEW':'yes'})).status,303);release();assert.equal((await pending).status,409);
  assert.equal((await m.session.get('/cashier')).status,403);w.loyalty.beforeRequest(null);
  await activeCash(w,m);assert.equal([...w.loyalty.staff.values()].filter(p=>p.role==='CASHIER').length,1);
});
test('las operaciones de Caja exigen CSRF y nunca llegan al motor con un token ausente o incorrecto',async t=>{
  const w=await setup(t),m=await person(w);await activeCash(w,m);
  for(const token of ['', 'incorrecto']){
    const size=w.loyalty.calls.length;
    const result=await m.session.post('/api/staff/purchases',{branchId:w.branch,amountMinor:100},{json:true,headers:{'X-Lumina-CSRF':token}});
    assert.equal(result.status,403);assert.equal(w.loyalty.calls.length,size);
  }
  assert.equal((await m.session.post('/api/staff/purchases',{branchId:w.branch,amountMinor:100},{json:true})).status,200);
});
test('la política de contenido excluye el negocio ajeno incluso cuando se usa directamente desde otro módulo',async t=>{
  const w=await setup(t),m=await person(w),actor=getSession(w.db,m.session.cookie.split('=')[1]);
  const own={id:uuid(),company_id:w.id,channel:'SOCIAL',type:'CONTENT',platforms:[]},foreign={...own,company_id:uuid()};
  assert.equal(canRequest(actor,own),true);assert.equal(canRequest(actor,foreign),false);
  const policy=requestAccessSql(actor);assert.ok(policy.params.includes(w.id));
});
test('la vista de persona carga sucursales sin un formulario de credenciales, presenta historial y escapa datos',async t=>{
  const w=await setup(t),m=await person(w,{name:'Persona <script>alert(1)</script>'});
  const view=await w.client.get('/team/'+m.id);assert.equal(view.status,200);assert.match(view.body,/name="branch"/);assert.match(view.body,/Historial de acceso/);assert.match(view.body,/&lt;script&gt;alert/);assert.doesNotMatch(view.body,/<script>alert|name="credential"/);
  const secret=w.loyalty.staff.get(w.db.get('SELECT staff_id FROM wallet_access').staff_id).token;assert.ok(!view.body.includes(secret));
});
test('una solicitud, aprobación, contratación y modificación Wallet siguen controles distintos en una misma sesión',async t=>{
  const w=await setup(t),m=await person(w,{'SOCIAL.REQUEST':'yes','WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes'});
  const create=await m.session.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Un video del negocio',phone:'0991234567'});assert.equal(create.status,303);
  assert.equal((await m.session.post('/requests',{type:'COURTESY',channel:'SOCIAL',service:'VIDEO',title:'Cortesía',phone:'0991234567'})).status,403);
  assert.equal((await m.session.post('/plans/request',{key:uuid()})).status,403);
  assert.equal((await m.session.get('/wallet-api/api/staff/wallet-design')).status,200);
  const put=await fetch(w.origin+'/wallet-api/api/staff/wallet-design',{method:'PUT',headers:{Cookie:m.session.cookie,Origin:w.origin,'X-Lumina-CSRF':m.session.csrf,'Content-Type':'application/json'},body:'{"version":1}'});assert.equal(put.status,403);
  const request=w.db.get('SELECT * FROM requests WHERE id=?',create.location.split('/').pop());const actor=getSession(w.db,m.session.cookie.split('=')[1]);assert.equal(canRequest(actor,request,'APPROVE'),false);
  assert.equal((await write(w,m.id,'permissions',{'SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'})).status,303);
  assert.equal((await m.session.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Ya sin permiso',phone:'0991234567'})).status,403);
  assert.equal(canRequest(getSession(w.db,m.session.cookie.split('=')[1]),request,'APPROVE'),true);assert.equal((await m.session.get('/wallet-api/api/staff/wallet-design')).status,403);
});
test('grabaciones prioriza la visita programada más cercana y conserva el historial al final',async t=>{
  const w=await setup(t),r=await w.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Jornada de grabación',phone:'0991234567'}),request=r.location.split('/').pop();
  for(const [status,start] of [['DONE','2026-10-10T15:00:00.000Z'],['SCHEDULED','2027-02-01T15:00:00.000Z'],['SCHEDULED','2027-01-10T15:00:00.000Z']])w.db.run('INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at) VALUES(?,?,?,?,?,?,?,?)',uuid(),w.id,request,start,'Local de prueba','',status,now());
  const actor=getSession(w.db,w.client.cookie.split('=')[1]);const view=contentData(w.db,actor,{id:w.id},new URLSearchParams({view:'calendar'}));
  assert.deepEqual(view.rows.map(x=>x.starts_at),['2027-01-10T15:00:00.000Z','2027-02-01T15:00:00.000Z','2026-10-10T15:00:00.000Z']);
});
test('los lectores de métricas, Maps y publicaciones también validan empresa fuera de las rutas HTTP',async t=>{
  const w=await setup(t),m=await person(w,{'MAPS.VIEW':'yes'}),actor=getSession(w.db,m.session.cookie.split('=')[1]),foreign=uuid();
  for(const read of [()=>analytics(w.db,actor,foreign,{}),()=>mapsData(w.db,actor,foreign),()=>publicationsFor(w.db,actor,foreign,uuid())])assert.throws(read,error=>error.status===403);
});
test('Wallet de consulta no ofrece edición ni declara permisos de Caja aunque internamente use la integración',async t=>{
  const w=await setup(t),m=await person(w,{'WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes'});
  const page=await m.session.get('/wallet');assert.match(page.body,/name="lumina-wallet-editable" content="\[\]"/);
  const dashboard=JSON.parse((await m.session.get('/wallet-api/api/staff/dashboard')).body);assert.deepEqual(dashboard.permissions,{purchases:false,rewards:false});assert.equal(dashboard.promotionSuggestions,undefined);
  await write(w,m.id,'permissions',{'WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes','WALLET_DESIGN.EDIT':'yes'});
  assert.match((await m.session.get('/wallet')).body,/name="lumina-wallet-editable" content="\[&quot;design&quot;\]"/);
});
test('reparar Wallet no restablece áreas retiradas ni acepta una versión antigua de la persona',async t=>{
  const w=await setup(t),m=await person(w,{'WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes'});await m.session.get('/wallet-api/api/staff/dashboard');
  const row=w.db.get('SELECT * FROM wallet_access WHERE account_id=?',m.id);w.loyalty.staff.get(row.staff_id).state='INACTIVE';await m.session.get('/wallet-api/api/staff/dashboard');
  const old=teamRevision(w,m.id);await write(w,m.id,'permissions',{'SOCIAL.VIEW':'yes'});
  const input={account:m.id,account_revision:old,confirm:'yes',reason:'Revisión del acceso'};
  for(const revision of [old,teamRevision(w,m.id)])assert.equal((await w.client.post('/wallet/repair',{...input,account_revision:revision})).status,409);
  assert.equal(w.loyalty.staff.get(row.staff_id).state,'INACTIVE');assert.equal(w.db.get('SELECT status FROM wallet_access WHERE account_id=?',m.id).status,'BLOCKED');
});
test('una reparación en curso se cancela si se retiran permisos antes de modificar el acceso nativo',async t=>{
  const w=await setup(t),m=await person(w,{'WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes'});await m.session.get('/wallet-api/api/staff/dashboard');
  const row=w.db.get('SELECT * FROM wallet_access WHERE account_id=?',m.id);w.loyalty.staff.get(row.staff_id).state='INACTIVE';await m.session.get('/wallet-api/api/staff/dashboard');
  let entered,release;const reached=new Promise(r=>entered=r),held=new Promise(r=>release=r);
  w.loyalty.beforeRequest(async call=>{if(call.path.endsWith('/team')&&call.path.startsWith('/api/platform/')){entered();await held;}});
  const pending=w.client.post('/wallet/repair',{account:m.id,account_revision:teamRevision(w,m.id),confirm:'yes',reason:'Revisión del acceso'});await reached;
  await write(w,m.id,'permissions',{'SOCIAL.VIEW':'yes'});release();assert.equal((await pending).status,409);
  assert.equal(w.loyalty.staff.get(row.staff_id).state,'INACTIVE');assert.equal(w.db.get('SELECT status FROM wallet_access WHERE account_id=?',m.id).status,'BLOCKED');
});

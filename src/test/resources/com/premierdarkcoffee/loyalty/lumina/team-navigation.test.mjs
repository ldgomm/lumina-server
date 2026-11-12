import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agency, owner, colleague, portal, password, teamRevision } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { getSession } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import { consultTeams } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/team-consultation.mjs';
import { now, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';

async function setup(t) {
  const native=await fakeLoyalty(t),w=await portal(t,native.origin,{platformToken:native.platformToken});
  const admin=await agency(w),business=await owner(w,'Negocio de prueba','1');
  return {...w,...business,native,admin};
}
const nav=body=>body.match(/<nav[^>]+id="workspace-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
const actor=(w,client)=>getSession(w.db,client.cookie.split('=')[1]);
const person=w=>colleague(w,w.client,{name:'Persona de prueba',email:'persona@example.test','SOCIAL.VIEW':'yes'});
const snapshot=w=>Object.fromEntries(['companies','accounts','grants','cash_grants','wallet_access','codes','audit'].map(name=>[name,w.db.all('SELECT * FROM '+name)]));

test('dueño registrado: Equipos y roles es el segundo enlace y tiene un acceso visible en el inicio',async t=>{
  const w=await setup(t),home=await w.client.get('/inicio'),menu=nav(home.body);
  assert.equal(home.status,200);assert.equal(actor(w,w.client).kind,'OWNER');
  assert.deepEqual([...menu.matchAll(/<a href="([^"]+)"/g)].slice(0,3).map(x=>x[1]),['/inicio','/equipo','/solicitudes']);
  assert.equal((menu.match(/href="\/equipo"/g)||[]).length,1);assert.match(menu,/Equipos y roles/);
  assert.match(home.body,/<section class="home-intro">[\s\S]*?href="\/equipo"[\s\S]*?Equipos y roles/);
  assert.doesNotMatch(menu,/href="\/clientes"|href="\/resumen"/);
  assert.match((await w.client.get('/equipo')).body,/<h1>Equipos y roles<\/h1>/);
});
test('volver a entrar como dueño en el mismo navegador conserva el rol y reemplaza el menú de la cuenta anterior',async t=>{
  const w=await setup(t),ownerId=actor(w,w.client).id;
  assert.equal((await w.admin.post('/salir')).status,303);
  assert.equal((await w.admin.post('/entrar',{email:'negocio1@example.test',password})).status,303);
  const session=actor(w,w.admin),home=await w.admin.get('/inicio');
  assert.equal(session.id,ownerId);assert.equal(session.kind,'OWNER');assert.equal(session.company_id,w.id);
  assert.match(nav(home.body),/href="\/equipo"/);assert.doesNotMatch(nav(home.body),/href="\/clientes"/);
  assert.equal((await w.admin.get('/equipo/nuevo')).status,200);
  assert.equal((await w.admin.post('/salir')).status,303);
  assert.equal((await w.admin.post('/entrar',{email:'agencia@example.test',password})).status,303);
  assert.equal(actor(w,w.admin).kind,'AGENCY');assert.equal((await w.admin.get('/equipo/nuevo')).status,403);
  assert.equal(w.db.get('SELECT kind FROM accounts WHERE id=?',ownerId).kind,'OWNER');
});
test('el dueño encuentra el mismo enlace en cuenta, planes y administración aunque el negocio no esté verificado',async t=>{
  const w=await setup(t);assert.equal(w.db.get('SELECT approved FROM companies WHERE id=?',w.id).approved,0);
  for(const path of ['/cuenta','/planes','/gestion','/equipo']){
    const response=await w.client.get(path);assert.equal(response.status,200,response.body);
    const menu=nav(response.body);assert.match(menu,/href="\/equipo"[^>]*>[\s\S]*?Equipos y roles/);
    assert.ok(menu.indexOf('href="/equipo"')<menu.indexOf('href="/wallet"'));
  }
  assert.match(nav((await w.client.get('/equipo')).body),/href="\/equipo" aria-current="page"/);
});
test('entrada común de equipos dirige al dueño a su editor e ignora un negocio ajeno seleccionado',async t=>{
  const w=await setup(t),other=await owner(w,'Otro negocio','2'),m=await colleague(w,other.client,{name:'Persona ajena',email:'ajena@example.test'});
  const response=await w.client.get('/equipos?empresa='+other.id);assert.equal(response.status,303);assert.equal(response.location,'/equipo');
  const own=await w.client.get(response.location+'?empresa='+other.id);assert.equal(own.status,200);assert.doesNotMatch(own.body,/Persona ajena|ajena@example.test/);
  assert.equal((await w.client.get('/equipo/'+m.id+'?empresa='+other.id)).status,404);
  const added=await w.client.post('/equipo',{name:'Nueva persona propia',email:'propia@example.test'});assert.equal(added.status,201);
  const addedId=w.db.get('SELECT id,company_id FROM accounts WHERE email=?','propia@example.test');assert.equal(addedId.company_id,w.id);
  assert.equal((await w.client.post('/equipo/'+addedId.id+'/acceso',{revision:teamRevision(w,addedId.id),cash_mode:'OFF','WEB.VIEW':'yes'})).status,303);
});
test('agencia encuentra equipos junto a Clientes y consulta un negocio manteniendo su identidad',async t=>{
  const w=await setup(t),m=await person(w),home=await w.admin.get('/resumen'),menu=nav(home.body);
  assert.deepEqual([...menu.matchAll(/<a href="([^"]+)"/g)].slice(0,4).map(x=>x[1]),['/resumen','/clientes','/equipos','/produccion']);
  assert.match((await w.admin.get('/clientes')).body,new RegExp('/equipos\\?empresa='+w.id));
  const directory=await w.admin.get('/equipos');assert.equal(directory.status,200);assert.match(directory.body,/Negocio de prueba/);
  const detail=await w.admin.get('/equipos?empresa='+w.id);assert.equal(detail.status,200);assert.match(detail.body,/Persona de prueba/);
  assert.match(detail.body,/Los permisos los administra el dueño/);assert.match(detail.body,/Consulta del negocio · Solo lectura/);
  assert.equal(actor(w,w.admin).kind,'AGENCY');assert.equal((await w.admin.get('/equipo/'+m.id)).status,403);
});
test('los colaboradores y las sesiones públicas no reciben enlaces ni acceso a equipos',async t=>{
  const w=await setup(t),m=await person(w);
  assert.doesNotMatch(nav((await m.session.get('/inicio')).body),/href="\/(equipo|equipos)(?:["?])/);
  for(const path of ['/equipos','/equipos?empresa='+w.id,'/equipo'])assert.equal((await m.session.get(path)).status,403);
  assert.equal((await w.session().get('/equipos?empresa='+w.id)).location,'/');
  assert.equal((await w.session().post('/equipos',{})).status,401);
  assert.throws(()=>consultTeams(w.db,actor(w,m.session)),error=>error.status===403);
});
test('directorio de negocios filtra antes de paginar y mantiene una página acotada',async t=>{
  const w=await setup(t);
  for(let i=0;i<23;i++){const id=uuid();w.db.run('INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at) VALUES(?,?,?,?,?,?)',id,'Sucursal '+String(i).padStart(2,'0'),id,'0000','0991234567',now());}
  const admin=actor(w,w.admin),first=consultTeams(w.db,admin);assert.equal(first.total,24);assert.equal(first.rows.length,20);assert.equal(first.more,true);
  const next=consultTeams(w.db,admin,new URLSearchParams('pagina=1'));assert.equal(next.rows.length,4);assert.equal(next.more,false);
  assert.equal(new Set([...first.rows,...next.rows].map(x=>x.id)).size,24);
  const filtered=consultTeams(w.db,admin,new URLSearchParams('q=Sucursal 22'));assert.equal(filtered.total,1);assert.equal(filtered.rows[0].name,'Sucursal 22');
  assert.match((await w.admin.get('/equipos?pagina=1')).body,/Anterior/);
});
test('consulta paginada de personas respeta el negocio, búsqueda y estados de acceso',async t=>{
  const w=await setup(t),other=await owner(w,'Negocio ajeno','2');
  await colleague(w,other.client,{name:'Persona privada ajena',email:'privada@example.test'});
  for(let i=0;i<21;i++)assert.equal((await w.client.post('/equipo',{name:'Persona '+i,email:'p'+i+'@example.test'})).status,201);
  w.db.run("UPDATE codes SET expires_at='2000-01-01T00:00:00.000Z' WHERE account_id=(SELECT id FROM accounts WHERE email='p0@example.test')");
  w.db.run("UPDATE accounts SET active=0 WHERE email='p1@example.test'");
  const query=new URLSearchParams({empresa:w.id}),admin=actor(w,w.admin),first=consultTeams(w.db,admin,query);
  assert.equal(first.total,22);assert.equal(first.rows.length,20);assert.equal(first.rows[0].kind,'OWNER');assert.equal(first.more,true);
  query.set('pagina','1');assert.equal(consultTeams(w.db,admin,query).rows.length,2);
  query.set('pagina','0');query.set('q','p0@example.test');const expired=await w.admin.get('/equipos?'+query);assert.match(expired.body,/Activación vencida/);
  query.set('q','p1@example.test');assert.match((await w.admin.get('/equipos?'+query)).body,/Desactivado/);
  const listing=await w.admin.get('/equipos?empresa='+w.id);assert.match(listing.body,/Por activar/);assert.doesNotMatch(listing.body,/Persona privada ajena|privada@example.test/);
});
test('la consulta muestra compras, canjes y permisos exactos sin preparar accesos ni modificar registros',async t=>{
  const w=await setup(t),m=await person(w),tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant;
  const saved=await w.client.post('/equipo/'+m.id+'/acceso',{revision:teamRevision(w,m.id),cash_mode:'PURCHASES',branch:w.native.branches.get(tenant)[0].id,
    'WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes','INSTAGRAM.VIEW':'yes','INSTAGRAM.APPROVE':'yes'});assert.equal(saved.status,303,saved.body);
  const before=snapshot(w),calls=w.native.calls.length;
  const view=await w.admin.get('/equipos?empresa='+w.id);assert.equal(view.status,200);assert.match(view.body,/registrar compras/);
  assert.doesNotMatch(view.body,/canjear premios y aplicar descuentos/);assert.match(view.body,/Instagram: consultar, aprobar entregas/);
  assert.doesNotMatch(view.body,/Guardar acceso|Añadir persona|Generar nuevo código|Restablecer acceso/);
  assert.deepEqual(snapshot(w),before);assert.equal(w.native.calls.length,calls);
});
test('proyección de consulta excluye contraseñas, tokens, códigos, sesiones y datos cifrados',async t=>{
  const w=await setup(t),m=await person(w),data=consultTeams(w.db,actor(w,w.admin),new URLSearchParams({empresa:w.id}));
  const allowed=['id','name','email','kind','active','activated','cash_status','branch_name','purchases','rewards','activation_expires','grants'];
  for(const row of data.rows)assert.deepEqual(Object.keys(row).sort(),allowed.sort());
  const view=await w.admin.get('/equipos?empresa='+w.id);
  const secrets=[m.code,w.native.platformToken,...w.db.all('SELECT password FROM accounts WHERE password IS NOT NULL').map(r=>r.password),...w.db.all('SELECT digest FROM codes').map(r=>r.digest)];
  for(const secret of secrets){assert.equal(view.body.includes(secret),false);assert.equal(JSON.stringify(data).includes(secret),false);}
  assert.equal(view.headers.get('cache-control'),'no-store');
});
test('ninguna ruta de consulta permite a la agencia modificar el equipo por POST PUT DELETE ni rutas heredadas',async t=>{
  const w=await setup(t),m=await person(w),before=snapshot(w),calls=w.native.calls.length;
  assert.equal((await w.admin.post('/equipos?empresa='+w.id,{kind:'OWNER',name:'Cambio'})).status,403);
  assert.equal((await w.admin.post('/equipos',{kind:'OWNER',name:'Cambio'})).status,405);
  for(const action of ['acceso','permisos','datos','invitar','desactivar','caja/guardar','caja/revocar']){
    const r=await w.admin.post('/equipo/'+m.id+'/'+action+'?empresa='+w.id,{revision:teamRevision(w,m.id),confirm:'yes',cash_mode:'BOTH'});assert.equal(r.status,403);
  }
  for(const method of ['PUT','DELETE'])assert.equal((await fetch(w.origin+'/equipos?empresa='+w.id,{method,headers:{Cookie:w.admin.cookie,Origin:w.origin}})).status,405);
  assert.deepEqual(snapshot(w),before);assert.equal(w.native.calls.length,calls);
});
test('selección inválida y textos especiales no amplían consultas ni inyectan HTML',async t=>{
  const w=await setup(t);w.db.run('UPDATE companies SET name=? WHERE id=?','<img src=x onerror=alert(1)>',w.id);
  const list=await w.admin.get('/equipos');assert.match(list.body,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(list.body,/<img src=x/);
  for(const selected of [uuid(),"' OR 1=1 --"]){const response=await w.admin.get('/equipos?empresa='+encodeURIComponent(selected));assert.equal(response.status,404);}
  assert.equal((await w.admin.get('/equipos?pagina=-1')).status,400);assert.equal((await w.admin.get('/equipos?q='+'a'.repeat(101))).status,400);
  const q='\"><svg onload=alert(1)>';assert.doesNotMatch((await w.admin.get('/equipos?q='+encodeURIComponent(q))).body,/<svg onload/);
});

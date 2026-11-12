import { acceptedContract } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agency, colleague, owner, portal } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { can } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import { canRequest } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/content-policy.mjs';
import { createRequest } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/production.mjs';
import { submitOrder } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/memberships/orders.mjs';
import { localDay, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const idea={type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Presentar el producto',brief:'Una idea en mis propias palabras.'};
const provider=(path,id)=>'/agencia'+path+'?empresa='+id;
async function setup(t) {
  const loyalty=await fakeLoyalty(t),w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken}),admin=await agency(w),a=await owner(w,'Mi negocio real','1');
  return {...w,...a,admin,loyalty,company:w.db.get('SELECT * FROM companies WHERE id=?',a.id)};
}
async function api(w,session,path,method,body={},company=w.id) {
  const r=await fetch(w.origin+'/wallet-api'+path,{method,headers:{Cookie:session.cookie,Origin:w.origin,'X-Lumina-CSRF':session.csrf,'X-Lumina-Company':company,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)}),redirect:'manual'});
  return {status:r.status,body:await r.text()};
}
const postActions=html=>[...html.matchAll(/<form method="post" action="([^"]+)"/g)].map(m=>m[1]);

test('Contenido tiene interfaz propia, salida a Lúmina y navegación completa también dentro de una solicitud',async t=>{
  const w=await setup(t),request=await w.client.post('/solicitudes',idea);
  for(const path of [...['resumen','solicitudes','produccion','revisiones','entregas','publicaciones','metricas','agenda'].map(v=>'/contenido?vista='+v),request.location,'/reportes','/contenido/grabacion']) {
    const r=await w.client.get(path);assert.equal(r.status,200,path);
    assert.match(r.body,/<body class="content-app">/);assert.match(r.body,/href="\/inicio"[^>]*>Volver a Lúmina/);
    assert.match(r.body,/aria-label="Módulo de contenido"/);assert.doesNotMatch(r.body,/class="signed-in"|aria-label="Área de trabajo"|name="credential"|name="password"/);
    for(const view of ['resumen','solicitudes','produccion','revisiones','entregas','publicaciones','metricas','agenda'])assert.ok(r.body.includes('vista='+view),path+' '+view);
  }
  assert.match((await w.client.get('/inicio')).body,/class="signed-in"/);
});

test('el cliente solo elige Video, Fotografías o Diseño; la cortesía y grabación no piden formato ni plataforma',async t=>{
  const w=await setup(t),r=await w.client.get('/contenido?vista=solicitudes');
  const form=r.body.match(/<form method="post" action="\/solicitudes"[\s\S]+?<\/form>/)[0];
  const choices=[...form.matchAll(/type="radio" name="service" value="([^"]+)"[^>]*><span><strong>([^<]+)<\/strong>/g)].map(m=>[m[1],m[2]]);
  assert.deepEqual(choices,[['VIDEO','Video'],['PHOTO','Fotografías'],['GRAPHIC','Diseño para redes']]);
  assert.doesNotMatch(form,/Story|Reel|Short|Carrusel|Publicación|name="platform|<select name="channel"|<select name="type"/);
  assert.match(form,/name="type" value="CONTENT"/);assert.match(form,/name="channel" value="SOCIAL"/);
  for(const [service] of choices)assert.equal((await w.client.post('/solicitudes',{...idea,service})).status,303);
  for(const path of ['/inicio','/contenido/grabacion']) {
    const page=(await w.client.get(path)).body;
    assert.doesNotMatch(page,/<select name="service"|name="platform|Publicar la misma pieza/);
  }
  const general=(await w.client.get('/solicitudes/nueva?area=SOCIAL')).body;
  assert.match(general,/Diseño para redes/);assert.doesNotMatch(general,/<option value="(REEL|STORY|SHORT|CAROUSEL|EDITING|COPY|PUBLICATION)"/);
  assert.equal(w.db.get('SELECT count(*) n FROM request_platforms').n,0);
});

test('la agencia no solicita contenido, cortesía, visitas, cotizaciones ni planes por ninguna URL',async t=>{
  const w=await setup(t),before=w.db.all('SELECT * FROM requests');
  for(const type of ['CONTENT','QUOTE','VISIT','COURTESY','PLAN'])for(const prefix of ['','/agencia']) {
    assert.equal((await w.admin.post(prefix+'/solicitudes?empresa='+w.id,{...idea,type,role:'OWNER',owner_id:w.client.id})).status,403,type+prefix);
  }
  assert.deepEqual(w.db.all('SELECT * FROM requests'),before);
  const actor=w.db.get("SELECT * FROM accounts WHERE kind='AGENCY'");actor.grants=[];
  for(const action of ['REQUEST','APPROVE','EDIT']){assert.equal(can(actor,'SOCIAL',action),false);assert.equal(canRequest(actor,{...idea,company_id:w.id},action),false);}
  assert.equal(can(actor,'SOCIAL'),true);
  assert.throws(()=>createRequest(w.db,actor,w.company,idea),e=>e.status===403);
  assert.throws(()=>submitOrder(w.db,actor,w.company,{key:uuid()}),e=>e.status===403);
});

test('la ficha del negocio es de solo lectura, incluyendo solicitudes, Maps, paquetes y Wallet',async t=>{
  const w=await setup(t),req=await w.client.post('/solicitudes',idea);
  await w.admin.post('/planes',{name:'Videos',term:'MONTHLY',price:'50',VIDEO:'2',wallet:'NONE'});
  const plan=w.db.get('SELECT id FROM plans').id;
  const order=await w.client.post('/planes/solicitar',{key:uuid(),['qty_'+plan]:'1'});
  const pages=['/inicio','/solicitudes',req.location,'/contenido?vista=solicitudes','/contenido?vista=agenda','/planes','/planes?vista=acuerdos',order.location,'/mapas','/wallet'];
  for(const path of pages){const r=await w.admin.get(path+(path.includes('?')?'&':'?')+'empresa='+w.id);assert.equal(r.status,200,path);assert.match(r.body,/Solo lectura|solo lectura/);assert.deepEqual(postActions(r.body),['/salir'],path);assert.doesNotMatch(r.body,/>Dueño</);}
  for(const path of ['/clientes/verificar',req.location+'/estado','/mapas/ubicacion','/planes/activar','/planes/cancelar'])assert.equal((await w.admin.post(path+'?empresa='+w.id,{status:'APPROVED',name:'Cambio'})).status,403);
  assert.equal(w.db.get('SELECT approved FROM companies WHERE id=?',w.id).approved,0);
});

test('la agencia produce en su espacio; el dueño aprueba y el historial conserva ambas identidades',async t=>{
  const w=await setup(t),r=await w.client.post('/solicitudes',idea);
  assert.equal((await w.admin.post(provider('/clientes/verificar',w.id))).status,303);
  assert.equal((await w.admin.post(provider(r.location+'/estado',w.id),{status:'APPROVED'})).status,303);
  await w.admin.post(provider(r.location+'/piezas',w.id),{title:'La pieza compartida'});
  const piece=w.db.get('SELECT * FROM pieces'),path=r.location+'/piezas/'+piece.id;
  assert.equal((await w.admin.post(provider(path+'/editar',w.id),{revision:'1',status:'REVIEW'})).status,303);
  assert.equal((await w.admin.post(provider(path+'/revisar',w.id),{revision:'2',status:'APPROVED'})).status,403);
  assert.equal((await w.client.post(path+'/revisar',{revision:'2',status:'APPROVED'})).status,303);
  const view=await w.admin.get(provider(r.location,w.id));assert.equal(view.status,200);assert.match(view.body,/Trabajo de Lúmina/);assert.match(view.body,/name="status"/);assert.doesNotMatch(view.body,/Revisar entregable/);
  assert.equal((await w.client.get(provider(r.location,w.id))).status,403);
  const events=w.db.all('SELECT x.action,a.kind FROM audit x JOIN accounts a ON a.id=x.actor_id WHERE x.subject_id=?',piece.request_id);
  assert.equal(events.find(x=>x.action==='SOLICITUD_RECIBIDA').kind,'OWNER');assert.equal(events.find(x=>x.action==='PIEZA_CREADA').kind,'AGENCY');
  assert.ok(events.some(x=>x.action==='PIEZA_APROBADA'&&x.kind==='OWNER'));
});

test('la agencia no selecciona paquetes, renueva ni acepta propuestas por el dueño',async t=>{
  const w=await setup(t);await w.admin.post('/planes',{name:'Mensual',term:'MONTHLY',price:'50',VIDEO:'1',wallet:'NONE'});
  const plan=w.db.get('SELECT id FROM plans').id,payload={key:uuid(),['qty_'+plan]:'1'};
  for(const prefix of ['','/agencia'])assert.equal((await w.admin.post(prefix+'/planes/solicitar?empresa='+w.id,payload)).status,403);
  assert.equal(w.db.get('SELECT count(*) n FROM package_orders').n,0);
  const r=await w.client.post('/planes/solicitar',payload),order=w.db.get('SELECT * FROM package_orders'),line=w.db.get('SELECT * FROM package_order_lines');
  await w.admin.post(provider(r.location+'/cotizar',w.id),{revision:'1',terms:'Un video mensual.', ['price_'+line.id]:'50',['start_'+line.id]:localDay()});
  assert.equal((await w.admin.post(provider(r.location+'/aceptar',w.id),{revision:'2',confirm:'yes'})).status,403);
  assert.equal(w.db.get('SELECT status FROM package_orders WHERE id=?',order.id).status,'QUOTED');
  assert.equal((await w.client.post(r.location+'/aceptar',{revision:'2',confirm:'yes'})).status,303);
});

test('Wallet de agencia solo consulta el tenant seleccionado y nunca crea empleados ni sesiones de dueño',async t=>{
  const w=await setup(t),b=await owner(w,'Otro negocio privado','2'),start=w.loyalty.calls.length;
  for(const company of [w,b]) {
    const tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',company.id).loyalty_tenant;
    assert.equal((await w.admin.get('/wallet?empresa='+company.id)).status,200);
    assert.equal((await api(w,w.admin,'/api/platform/tenants/'+tenant+'/profile','GET',{},company.id)).status,200);
    assert.equal((await api(w,w.admin,'/api/staff/dashboard','GET',{},company.id)).status,403);
  }
  const other=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',b.id).loyalty_tenant;
  assert.equal((await api(w,w.admin,'/api/platform/tenants/'+other+'/profile','GET')).status,403);
  assert.equal((await api(w,w.admin,'/api/platform/tenants/'+w.company.loyalty_tenant+'/profile?tenant='+other,'GET')).status,403);
  assert.equal(w.db.get("SELECT count(*) n FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE a.kind='AGENCY'").n,0);
  assert.ok(w.loyalty.calls.slice(start).every(c=>c.method==='GET'&&c.role==='PLATFORM'));
});

test('Wallet rechaza toda mutación administrativa, incluso rutas heredadas y acciones enviadas a mano',async t=>{
  const w=await setup(t),tenant=w.company.loyalty_tenant,x=uuid(),before=JSON.stringify(w.db.all('SELECT * FROM wallet_access')),start=w.loyalty.calls.length;
  const routes={POST:['/api/staff/programs','/api/staff/wallet/restore','/api/staff/purchases','/api/staff/purchases/quote','/api/staff/counter-redemptions','/api/staff/redemptions/confirm','/api/staff/credentials','/api/staff/team/'+x+'/actions','/api/platform/tenants/'+tenant+'/credentials','/api/platform/tenants/'+tenant+'/payments'],PUT:['/api/staff/wallet-design','/api/staff/business-profile','/api/staff/birthday-settings','/api/platform/tenants/'+tenant+'/profile','/api/platform/tenants/'+tenant+'/profile-requests/'+x],DELETE:['/api/staff/programs/'+x,'/api/staff/credentials/'+x]};
  for(const [method,paths] of Object.entries(routes))for(const path of paths)assert.equal((await api(w,w.admin,path,method,{role:'OWNER',confirmed:true})).status,403,path);
  for(const p of ['/wallet/gestion?empresa='+w.id,'/join/'+w.loyalty.registrations.get(w.id).slug+'?empresa='+w.id,'/loyalty-assets/style.css'])assert.equal((await w.admin.get(p)).status,403,p);
  assert.equal((await w.admin.post('/wallet/reparar?empresa='+w.id,{account:uuid(),confirm:'yes',reason:'Manual'})).status,403);
  assert.equal(w.loyalty.calls.length,start);assert.equal(JSON.stringify(w.db.all('SELECT * FROM wallet_access')),before);
});

test('credenciales antiguas de agencia quedan inutilizables sin alterar las tarjetas ni accesos del dueño',async t=>{
  const w=await setup(t);await w.client.get('/wallet');
  const account=w.db.get("SELECT id FROM accounts WHERE kind='AGENCY'").id,ownerRows=w.db.all('SELECT * FROM wallet_access');
  w.db.run("INSERT INTO wallet_access(account_id,company_id,tenant_id,request_id,staff_name,staff_id,sealed_token,status,created_at) VALUES(?,?,?,?,?,?,?,'ACTIVE',?)",account,w.id,w.company.loyalty_tenant,uuid(),'Lúmina · Agencia · Antiguo',uuid(),'old-encrypted-token-never-unsealed','2026-01-01');
  const before=w.db.all('SELECT * FROM wallet_access'),start=w.loyalty.calls.length;
  for(let i=0;i<2;i++){assert.equal((await w.admin.get('/wallet?empresa='+w.id)).status,200);assert.equal((await api(w,w.admin,'/api/staff/dashboard','GET')).status,403);}
  assert.deepEqual(w.db.all('SELECT * FROM wallet_access'),before);assert.ok(w.loyalty.calls.slice(start).every(c=>c.method==='GET'&&c.role==='PLATFORM'));
  assert.equal((await w.client.get('/wallet-api/api/staff/dashboard')).status,200);
  assert.deepEqual(w.db.all('SELECT * FROM wallet_access WHERE account_id<>?',account),ownerRows);
  assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,w.company.loyalty_tenant);
});

test('consultar una Wallet pendiente no la aprovisiona; solo el negocio reintenta su activación',async t=>{
  const w=await setup(t);w.loyalty.registrationUnavailable(true);const pending=await owner(w,'Pendiente real','3');
  assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',pending.id).loyalty_tenant,null);
  w.loyalty.registrationUnavailable(false);const start=w.loyalty.calls.length;
  assert.equal((await w.admin.get('/wallet?empresa='+pending.id)).status,200);
  assert.equal(w.loyalty.calls.length,start);assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',pending.id).loyalty_tenant,null);
  await pending.client.get('/wallet');assert.ok(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',pending.id).loyalty_tenant);
});

test('formatos simples usan cupos históricos compatibles sin modificar contratos ni duplicar reservas',async t=>{
  const w=await setup(t);await w.admin.post(provider('/clientes/verificar',w.id));
  await w.admin.post('/planes',{name:'Plan anterior',term:'MONTHLY',price:'60',REEL:'1',POST:'1',wallet:'NONE'});
  const plan=w.db.get('SELECT * FROM plans');await acceptedContract(w,w.admin,w.client,w.id,plan.id);
  const contract=w.db.get('SELECT * FROM contracts'),items=w.db.all('SELECT * FROM plan_items');
  for(const [requested,quota,bad] of [['VIDEO','REEL','POST'],['GRAPHIC','POST','REEL']]) {
    const r=await w.client.post('/solicitudes',{...idea,service:requested,quantity:'2'});await w.admin.post(provider(r.location+'/estado',w.id),{status:'APPROVED'});
    const allocation=contract.id+':'+quota;
    assert.equal((await w.admin.post(provider(r.location+'/piezas',w.id),{title:'Cupo incorrecto',allocation:contract.id+':'+bad})).status,400);
    assert.equal((await w.admin.post(provider(r.location+'/piezas',w.id),{title:'Pieza reservada',allocation})).status,303);
    assert.equal((await w.admin.post(provider(r.location+'/piezas',w.id),{title:'Segunda pieza sin cupo',allocation})).status,409);
  }
  assert.deepEqual(w.db.all('SELECT * FROM plan_items'),items);assert.deepEqual(w.db.get('SELECT * FROM contracts'),contract);
  assert.deepEqual(w.db.all('SELECT service FROM pieces ORDER BY service').map(p=>p.service),['POST','REEL']);
});

test('equipo de contenido conserva asignaciones y reparación de Wallet queda aislada al propio dueño',async t=>{
  const w=await setup(t),member=await colleague(w,w.client,{name:'Solo contenido',email:'contenido@example.test','SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes'});
  assert.equal((await member.session.get('/contenido')).status,200);assert.equal((await member.session.post('/solicitudes',idea)).status,303);
  assert.equal((await member.session.get('/wallet/gestion')).status,403);
  const other=await owner(w,'Otro dueño','2');await other.client.get('/wallet');
  const row=w.db.get('SELECT * FROM wallet_access WHERE company_id=?',other.id);w.loyalty.staff.get(row.staff_id).state='INACTIVE';await other.client.get('/wallet-api/api/staff/dashboard');
  const start=w.loyalty.calls.length;
  assert.equal((await w.client.post('/wallet/reparar?empresa='+other.id,{account:row.account_id,reason:'Intento cruzado',confirm:'yes'})).status,409);
  assert.equal((await member.session.post('/wallet/reparar',{account:row.account_id,reason:'Intento ajeno',confirm:'yes'})).status,403);
  assert.equal(w.loyalty.calls.length,start);
  assert.equal((await other.client.post('/wallet/reparar',{account:row.account_id,reason:'Recuperar mi acceso',confirm:'yes'})).status,303);
});

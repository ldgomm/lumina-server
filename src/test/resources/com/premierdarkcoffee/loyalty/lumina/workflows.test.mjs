import test from 'node:test';
import assert from 'node:assert/strict';
import { agency, colleague, owner, portal } from './helpers.mjs';
import { localDay, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';

const idea={type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Presentar nuestra cocina',brief:'Proceso de preparación.',phone:'0991234567'};
const provider=(path,id)=>'/agency'+path+'?company='+id;
test('el registro inválido conserva contacto e identidad pero nunca vuelve a imprimir secretos',async t=>{
  const w=await portal(t),session=w.session();
  const response=await session.post('/register',{company:'Mi nuevo negocio',name:'Dueña de prueba',document:'1234567891',phone:'0991234567',document:'1747556965',password:'short',consent:'yes'});
  assert.equal(response.status,400);assert.match(response.body,/role="alert"/);
  for(const value of ['Mi nuevo negocio','Dueña de prueba','0991234567','1747556965'])assert.ok(response.body.includes('value="'+value+'"'));
  assert.doesNotMatch(response.body,/value="short"/);assert.equal(w.db.get('SELECT count(*) n FROM companies').n,0);
});
async function setup(t) {
  const w=await portal(t),admin=await agency(w),a=await owner(w,'Negocio de pruebas','1');
  return {...w,...a,admin};
}

test('un reintento simultáneo del formulario crea una sola solicitud y un solo movimiento',async t=>{
  const w=await setup(t),page=await w.client.get('/requests/new?area=SOCIAL');
  const request_key=page.body.match(/name="request_key" value="([^"]+)"/)[1];
  const responses=await Promise.all([w.client.post('/requests',{...idea,request_key}),w.client.post('/requests',{...idea,request_key})]);
  assert.ok(responses.every(r=>r.status===303));
  assert.equal(responses[0].location,responses[1].location);
  assert.equal(w.db.get('SELECT count(*) n FROM requests').n,1);
  assert.equal(w.db.get("SELECT count(*) n FROM audit WHERE action='SOLICITUD_RECIBIDA'").n,1);
  assert.equal((await w.client.get(responses[0].location)).status,200);
});

test('un identificador reenviado no permite reemplazar un pedido ni consultar otro negocio',async t=>{
  const w=await setup(t),b=await owner(w,'Otro negocio','2'),request_key=uuid();
  await w.client.post('/requests',{...idea,request_key});
  for(const [client,extra] of [[w.client,{title:'Un pedido distinto'}],[b.client,{}]]) {
    const r=await client.post('/requests',{...idea,request_key,...extra});
    assert.equal(r.status,409);assert.equal(r.location,null);
  }
  assert.equal(w.db.get('SELECT count(*) n FROM requests').n,1);
  assert.equal(w.db.get('SELECT title FROM requests').title,idea.title);
});

test('al corregir una solicitud se conserva la clave y no se escribe un registro parcial',async t=>{
  const w=await setup(t),request_key=uuid();
  const r=await w.client.post('/requests',{...idea,request_key,phone:'inválido'});
  assert.equal(r.status,400);assert.ok(r.body.includes('value="'+request_key+'"'));
  assert.ok(r.body.includes('value="'+idea.title+'"'));
  assert.equal(w.db.get('SELECT count(*) n FROM requests').n,0);
  assert.equal((await w.client.post('/requests',{...idea,request_key})).status,303);
});

test('formularios de cortesía y grabación llevan claves nuevas y admiten solicitudes antiguas sin clave',async t=>{
  const w=await setup(t);
  for(const path of ['/home','/content/recording'])assert.match((await w.client.get(path)).body,/name="request_key" value="[a-f0-9-]{36}"/);
  for(let i=0;i<2;i++)assert.equal((await w.client.post('/requests',idea)).status,303);
  assert.equal(w.db.get('SELECT count(*) n FROM requests').n,2);
});

test('Web, Maps y Marca abren el pedido correcto como dueño y conservan la consulta de agencia',async t=>{
  const w=await setup(t);
  for(const [area,service] of [['WEB','WEBSITE'],['MAPS','MAPS_PROFILE'],['BRAND','LOGO']]) {
    const sent=await w.client.post('/requests',{...idea,channel:area,service});
    assert.equal(sent.status,303,sent.body);
    const workspace='/services/'+area.toLowerCase();
    const page=await w.client.get(workspace);
    assert.equal(page.status,200);assert.ok(page.body.includes('href="'+sent.location+'"'));
    assert.ok(page.body.includes('/requests/new?area='+area));
    assert.equal((await w.client.get(sent.location)).status,200);
    const agencyPage=await w.admin.get(workspace+'?company='+w.id);
    assert.ok(agencyPage.body.includes('href="'+sent.location+'?company='+w.id+'"'));
    const consult=await w.admin.get(sent.location+'?company='+w.id);
    assert.equal(consult.status,200);assert.doesNotMatch(consult.body,/Cambiar estado|Preparar cotización/);
  }
});

test('el colaborador abre solo el servicio autorizado y nunca una ruta de administración',async t=>{
  const w=await setup(t),m=await colleague(w,w.client,{name:'Colaboradora Web',document:'1710683820','WEB.VIEW':'yes'});
  const r=await w.client.post('/requests',{...idea,channel:'WEB',service:'WEBSITE'});
  const page=await m.session.get('/services/web');
  assert.equal(page.status,200);assert.ok(page.body.includes('href="'+r.location+'"'));
  assert.equal((await m.session.get(r.location)).status,200);
  assert.equal((await m.session.get('/services/maps')).status,403);
  assert.equal((await m.session.get(provider(r.location,w.id))).status,403);
  assert.equal((await m.session.post('/requests',{...idea,channel:'WEB',service:'WEBSITE'})).status,403);
});

test('Maps admite ubicaciones reales del negocio, reseñas y mediciones sin romper la pantalla',async t=>{
  const w=await setup(t);
  const result=await w.admin.post(provider('/maps/location',w.id),{name:'Sucursal de prueba',url:'https://maps.google.com/?q=example'});
  assert.equal(result.status,303,result.body);
  const editable=await w.admin.get(provider('/maps',w.id));
  assert.equal(editable.status,200);assert.match(editable.body,/Registrar o actualizar reseña/);
  assert.match(editable.body,/<option value="ANSWERED">Respondida/);
  const location=editable.body.match(/name="location" value="([^"]+)"/)[1];
  assert.equal((await w.admin.post(provider('/maps/review',w.id),{location,reference:'reseña-ficticia',date:localDay(),stars:'5',summary:'Comentario de prueba',response:'Gracias por visitarnos.',status:'ANSWERED'})).status,303);
  const view=await w.client.get('/maps');assert.equal(view.status,200);assert.match(view.body,/Comentario de prueba/);
  assert.doesNotMatch(view.body,/action="[^"]*maps\/review/);
});

test('filtrar métricas mantiene negocio, modo de consulta y pestaña de contenido',async t=>{
  const w=await setup(t);
  for(const prefix of ['','/agency']) {
    const page=await w.admin.get(prefix+'/content?company='+w.id+'&view=metrics');
    assert.equal(page.status,200);assert.ok(page.body.includes('action="'+prefix+'/content" class="filter"'));
    assert.ok(page.body.includes('name="company" value="'+w.id+'"'));assert.match(page.body,/name="view" value="metrics"/);
    const filtered=await w.admin.get(prefix+'/content?company='+w.id+'&view=metrics&from=2026-11-01&to=2026-11-13');
    assert.equal(filtered.status,200);assert.match(filtered.body,/Negocio de pruebas/);
  }
});

test('Contenido prioriza los pedidos existentes y una búsqueda vacía permite limpiar filtros',async t=>{
  const w=await setup(t);
  assert.match((await w.client.get('/content?view=requests')).body,/<details class="disclosure content-create" open>/);
  await w.client.post('/requests',idea);
  const page=await w.client.get('/content?view=requests');
  assert.match(page.body,/<details class="disclosure content-create">/);
  assert.match(page.body,/Presentar nuestra cocina/);
  const none=await w.client.get('/requests?q=sin-coincidencia');
  assert.match(none.body,/No encontramos solicitudes con estos filtros/);assert.match(none.body,/Ver todas las solicitudes/);
});

test('la cotización conserva precios y condiciones tras errores y conflictos de versión',async t=>{
  const w=await setup(t);
  await w.admin.post(provider('/businesses/verify',w.id));
  assert.equal((await w.admin.post('/plans',{name:'Dos videos',term:'MONTHLY',price:'40',VIDEO:'2',wallet:'NONE'})).status,303);
  const plan=w.db.get('SELECT id FROM plans').id;
  const sent=await w.client.post('/plans/request',{key:uuid(),['qty_'+plan]:'1'});
  const line=w.db.get('SELECT * FROM package_order_lines');
  const data={revision:'1',terms:'Producción y una revisión incluidas.',['price_'+line.id]:'45.25',['start_'+line.id]:'incorrecta'};
  const failed=await w.admin.post(provider(sent.location+'/quote',w.id),data);
  assert.equal(failed.status,400);assert.match(failed.body,/value="45.25"/);assert.match(failed.body,/Producción y una revisión incluidas/);
  assert.equal(w.db.get('SELECT revision FROM package_orders').revision,1);
  data['start_'+line.id]=localDay();assert.equal((await w.admin.post(provider(sent.location+'/quote',w.id),data)).status,303);
  const conflict=await w.admin.post(provider(sent.location+'/quote',w.id),{...data,terms:'Este borrador es distinto.'});
  assert.equal(conflict.status,409);assert.match(conflict.body,/Este borrador es distinto/);assert.match(conflict.body,/name="revision" value="1"/);
  assert.match(conflict.body,/Recargar la versión guardada/);
  assert.equal(w.db.get('SELECT revision FROM package_orders').revision,2);
});

test('una propuesta exclusivamente mensual no muestra un pago único de cero',async t=>{
  const w=await setup(t);
  await w.admin.post('/plans',{name:'Videos al mes',term:'MONTHLY',price:'40',VIDEO:'2',wallet:'NONE'});
  const plan=w.db.get('SELECT id FROM plans').id;
  const sent=await w.client.post('/plans/request',{key:uuid(),['qty_'+plan]:'1'});
  const page=await w.client.get(sent.location);
  assert.equal(page.status,200);assert.match(page.body,/Siguiente paso/);assert.match(page.body,/<span>Por mes<\/span>/);
  assert.doesNotMatch(page.body,/<span>Una sola vez<\/span>/);
});

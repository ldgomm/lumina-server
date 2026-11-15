import test from 'node:test';
import assert from 'node:assert/strict';
import {agency,colleague,documentFor,owner,portal} from './helpers.mjs';
import {getSession} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import {attentionData} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/overview.mjs';
import {agendaData} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/agenda.mjs';
import {agencyOverview} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/workspace-pages.mjs';
import {uuid,now,localDay} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const idea={type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'3',title:'Una idea concreta',phone:'0991234567'};
const selected=(path,id)=>'/agency'+path+'?company='+id;
async function setup(t){const w=await portal(t),admin=await agency(w),o=await owner(w,'Negocio de la jornada','workday');await admin.post(selected('/businesses/verify',o.id));return {...w,...o,admin};}
const actor=(w,client=w.client)=>getSession(w.db,client.cookie.split('=')[1]);
async function request(w,extra={},client=w.client){const r=await client.post('/requests',{...idea,...extra});assert.equal(r.status,303,r.body);return {id:r.location.split('/').at(-1),path:r.location};}
function review(w,id,company=w.id){w.db.run("INSERT INTO pieces(id,company_id,request_id,title,service,status,observations,created_at) VALUES(?,?,?,'Entrega','VIDEO','REVIEW','',?)",uuid(),company,id,now());}
function visit(w,r,{company=w.id,status='SCHEDULED',date='2099-04-01T15:00:00.000Z',place='Local de prueba'}={}){w.db.run('INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at) VALUES(?,?,?,?,?,?,?,?)',uuid(),company,r.id,date,place,'',status,now());}
function upcomingAgencyVisits(body){
 const section=body.match(/<h2>Próximas grabaciones<\/h2>([\s\S]*?)<\/section>/);
 assert.ok(section,'La agencia debe mostrar su sección de próximas grabaciones.');
 return section[1];
}
function assertAgencyVisitCount(body,expected){
 const metric=body.match(/<span>Visitas programadas<\/span><\/div><strong>(\d+)<\/strong>/);
 assert.ok(metric,'La agencia debe mostrar el recuento de visitas programadas.');
 assert.equal(Number(metric[1]),expected);
}

test('bandeja completa y paginada sin perder tareas del inicio',async t=>{
 const w=await setup(t);for(let i=0;i<23;i++){const r=await request(w,{title:'Entrega '+i});review(w,r.id);}
 const a=attentionData(w.db,actor(w),w.id),b=attentionData(w.db,actor(w),w.id,new URLSearchParams({page:'1'}));assert.equal(a.total,23);assert.equal(a.rows.length,20);assert.equal(b.rows.length,3);assert.equal(new Set([...a.rows,...b.rows].map(r=>r.id)).size,23);
 const home=(await w.client.get('/home')).body;assert.match(home,/Ver todos los pendientes/);assert.ok(home.indexOf('attention-card')<home.indexOf('class="home-modules"'));assert.match((await w.client.get('/attention?page=1')).body,/21–23 de 23/);
});
test('buscar pendientes admite acentos y escapa contenido',async t=>{
 const w=await setup(t),r=await request(w,{title:'Fotografía <img src=x onerror=alert(1)>'});review(w,r.id);
 const page=await w.client.get('/attention?q=fotografia');assert.equal(page.status,200);assert.match(page.body,/Fotografía &lt;img/);assert.doesNotMatch(page.body,/<img src=x/);assert.match((await w.client.get('/attention?q=inexistente')).body,/Sin coincidencias/);
});
test('cotizaciones aceptadas salen de pendientes y consultar no escribe datos',async t=>{
 const w=await setup(t),r=await request(w,{type:'QUOTE'});assert.equal((await w.admin.post(selected(r.path+'/quote',w.id),{amount:'35',terms:'Grabación acordada.'})).status,303);
 const before=w.db.all('SELECT * FROM audit');assert.match((await w.client.get('/attention?view=quotes')).body,/Una idea concreta/);assert.deepEqual(w.db.all('SELECT * FROM audit'),before);
 assert.equal((await w.client.post(r.path+'/accept',{quote:w.db.get('SELECT id FROM quotes').id})).status,303);assert.equal(attentionData(w.db,actor(w),w.id).total,0);
});
test('propuestas de paquetes abren su destino y se ocultan al colaborador',async t=>{
 const w=await setup(t);await w.admin.post('/plans',{name:'Video puntual',term:'ONE_OFF',price:'35',VIDEO:'1',wallet:'NONE'});const plan=w.db.get('SELECT id FROM plans').id;
 const order=await w.client.post('/plans/request',{key:uuid(),['qty_'+plan]:'1'}),line=w.db.get('SELECT * FROM package_order_lines');
 assert.equal((await w.admin.post(selected(order.location+'/quote',w.id),{revision:'1',terms:'Alcance de prueba.',['price_'+line.id]:'35',['start_'+line.id]:localDay(),['end_'+line.id]:localDay()})).status,303);
 assert.ok((await w.client.get('/attention?view=proposals')).body.includes('href="'+order.location+'"'));
 const m=await colleague(w,w.client,{name:'Lector',document:documentFor('workday-reader'),'SOCIAL.VIEW':'yes'});assert.ok(!(await m.session.get('/attention')).body.includes(order.location));assert.equal(attentionData(w.db,actor(w,m.session),w.id).total,0);
});
test('pendientes respeta aprobación por plataforma y revocación inmediata',async t=>{
 const w=await setup(t);for(const [title,platforms] of [['Común',[]],['Compartida',['INSTAGRAM','TIKTOK']],['Solo Instagram',['INSTAGRAM']]]){const r=await request(w,{title});review(w,r.id);for(const scope of platforms)w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,r.id,scope);}
 const m=await colleague(w,w.client,{name:'Revisor',document:documentFor('workday-review'),'INSTAGRAM.VIEW':'yes','INSTAGRAM.APPROVE':'yes'});assert.deepEqual(attentionData(w.db,actor(w,m.session),w.id).rows.map(r=>r.title),['Solo Instagram']);
 await w.client.post('/team/'+m.id+'/permissions',{revision:String(w.db.get('SELECT revision FROM accounts WHERE id=?',m.id).revision),'INSTAGRAM.VIEW':'yes'});
 const page=await m.session.get('/attention');assert.doesNotMatch(page.body,/Solo Instagram|Compartida|Común/);assert.match(page.body,/Todo al día/);
});
test('pendientes impide suplantación, mutación y lectura de otra empresa',async t=>{
 const w=await setup(t),b=await owner(w,'Negocio ajeno','workday-other'),r=await request(w,{title:'PRIVADO_OTRO_NEGOCIO'},b.client);review(w,r.id,b.id);
 assert.doesNotMatch((await w.client.get('/attention?company='+b.id)).body,/PRIVADO_OTRO_NEGOCIO/);assert.equal((await w.admin.get('/attention?company='+w.id)).status,403);assert.equal((await w.client.post('/attention')).status,405);assert.throws(()=>attentionData(w.db,actor(w),b.id),e=>e.status===403);
});
test('agenda separa futuras, atrasadas e historial sin marcar visitas realizadas',async t=>{
 const w=await setup(t),r=await request(w);visit(w,r);visit(w,r,{date:'2001-01-01T15:00:00.000Z'});visit(w,r,{status:'DONE',date:'2000-01-01T15:00:00.000Z'});visit(w,r,{status:'CANCELLED'});
 const data=agendaData(w.db,actor(w),w.id);assert.deepEqual(data.counts,{upcoming:1,pending:1,history:2});assert.equal(data.rows.length,1);assert.match((await w.client.get('/calendar?view=pending')).body,/falta registrar el resultado/);assert.equal(w.db.get("SELECT count(*) n FROM visits WHERE status='SCHEDULED'").n,2);
});
test('agenda busca en más de cien registros y ordena por cercanía con paginación',async t=>{
 const w=await setup(t),r=await request(w);for(let i=0;i<104;i++)visit(w,r,{date:new Date(Date.UTC(2099,0,i+1,15)).toISOString(),place:i===103?'Destino especial':'Lugar '+i});
 const first=agendaData(w.db,actor(w),w.id);assert.equal(first.total,104);assert.equal(first.rows.length,20);assert.equal(first.rows[0].starts_at,'2099-01-01T15:00:00.000Z');
 const page=await w.client.get('/calendar?q=Destino+especial');assert.match(page.body,/Destino especial/);assert.match(page.body,/1–1 de 1/);const last=agendaData(w.db,actor(w),w.id,new URLSearchParams({page:'999'}));assert.equal(last.page,5);assert.equal(last.rows.length,4);
});
test('solicitud cancelada sale de próximas grabaciones y conserva el historial',async t=>{
 const w=await setup(t),r=await request(w);visit(w,r);w.db.run("UPDATE requests SET status='CANCELLED' WHERE id=?",r.id);
 assert.equal(agendaData(w.db,actor(w),w.id).total,0);const history=await w.client.get('/calendar?view=history');assert.match(history.body,/Una idea concreta/);assert.match(history.body,/Cancelad/);assert.doesNotMatch((await w.client.get('/home')).body,/Ver detalles →/);
});
test('agenda limita filas y recuentos al negocio y plataforma autorizados',async t=>{
 const w=await setup(t),b=await owner(w,'Vecino privado','workday-neighbor'),own=await request(w,{title:'Solo Instagram'}),foreign=await request(w,{title:'NEGOCIO_PRIVADO'},b.client),secret=await request(w,{title:'SOLO_TIKTOK'});
 visit(w,own);visit(w,foreign,{company:b.id});visit(w,secret);w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,own.id,'INSTAGRAM');w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,secret.id,'TIKTOK');
 const m=await colleague(w,w.client,{name:'Equipo Instagram',document:documentFor('workday-instagram'),'INSTAGRAM.VIEW':'yes'});const view=agendaData(w.db,actor(w,m.session),w.id);assert.equal(view.total,1);assert.equal(view.counts.upcoming,1);
 const page=await m.session.get('/calendar?company='+b.id);assert.doesNotMatch(page.body,/NEGOCIO_PRIVADO|SOLO_TIKTOK/);assert.match(page.body,/Solo Instagram/);assert.throws(()=>agendaData(w.db,actor(w,m.session),b.id),e=>e.status===403);
});
test('agenda de agencia conserva destinos de trabajo y consulta sin suplantar',async t=>{
 const w=await setup(t),r=await request(w);visit(w,r,{place:'Sede elegida'});
 const global=await w.admin.get('/agency-calendar?q=Sede+elegida');assert.equal(global.status,200);assert.ok(global.body.includes('href="'+selected(r.path,w.id)+'#visits"'));
 const consult=await w.admin.get('/calendar?company='+w.id);assert.ok(consult.body.includes('href="'+r.path+'?company='+w.id+'#visits"'));assert.doesNotMatch(consult.body,/Solicitar grabación/);
 const work=await w.admin.get('/agency/calendar?company='+w.id);assert.ok(work.body.includes('href="'+selected(r.path,w.id)+'#visits"'));assert.match(work.body,/name="company" value="/);
});
test('solicitudes filtra antes de paginar y da totales exactos sin filtrar otros negocios',async t=>{
 const w=await setup(t);for(let i=0;i<32;i++)await request(w,{title:'Trabajo '+i});const closed=await request(w,{title:'Trabajo cerrado'});w.db.run("UPDATE requests SET status='DELIVERED' WHERE id=?",closed.id);
 const b=await owner(w,'Negocio privado','workday-request-other');await request(w,{title:'NO_VISIBLE'},b.client);
 const open=await w.client.get('/requests?view=open&page=1');assert.equal(open.status,200);assert.match(open.body,/31–32 de 32/);assert.doesNotMatch(open.body,/Trabajo cerrado|NO_VISIBLE/);
 const finished=await w.client.get('/requests?view=closed');assert.match(finished.body,/Trabajo cerrado/);assert.match(finished.body,/1–1 de 1/);assert.match((await w.client.get('/requests?view=closed&page=999')).body,/Trabajo cerrado/);
});
test('filtros inválidos se rechazan y los filtros de agencia conservan empresa',async t=>{
 const w=await setup(t);for(const path of ['/attention?view=falsa','/calendar?view=falsa','/requests?view=falsa','/calendar?page=-1','/attention?page=NaN'])assert.equal((await w.client.get(path)).status,400,path);
 await request(w);const consult=await w.admin.get('/requests?company='+w.id+'&view=open');assert.equal(consult.status,200);assert.match(consult.body,/name="company" value="/);assert.doesNotMatch(consult.body,/Nueva solicitud/);
});

test('la agenda de Contenido mantiene módulo, período, empresa y modo de consulta',async t=>{
 const w=await setup(t),r=await request(w);visit(w,r,{date:'2001-01-01T15:00:00.000Z',place:'Lugar guardado'});
 for(const prefix of ['','/agency']){
  const page=await w.admin.get(prefix+'/content?company='+w.id+'&view=calendar&period=pending');assert.equal(page.status,200);assert.match(page.body,/class="content-app"/);assert.match(page.body,/Lugar guardado/);assert.match(page.body,/name="view" value="calendar"/);assert.match(page.body,/name="period" value="pending"/);assert.ok(page.body.includes('action="'+prefix+'/content"'));
 }
 assert.equal((await w.client.get('/content?view=calendar&period=falso')).status,400);
});
test('los recuentos de inicio y agencia excluyen visitas de solicitudes canceladas',async t=>{
 const w=await setup(t),cancelled=await request(w,{title:'Grabación cancelada'});
 visit(w,cancelled,{place:'Sede de la visita cancelada'});
 w.db.run("UPDATE requests SET status='CANCELLED' WHERE id=?",cancelled.id);
 const home=await w.client.get('/home');assert.equal(home.status,200);
 assert.match(home.body,/<strong>0<\/strong><span>Próximas visitas/);
 const agencyView=await w.admin.get('/dashboard');assert.equal(agencyView.status,200);
 assertAgencyVisitCount(agencyView.body,0);
 assert.match(upcomingAgencyVisits(agencyView.body),/Tu agenda está al día/);
 assert.doesNotMatch(upcomingAgencyVisits(agencyView.body),/appointment-list|Grabación cancelada|Sede de la visita cancelada/);
 // The cancelled request remains in recent activity; only its upcoming visit is excluded.
 assert.match(agencyView.body,/Grabación cancelada/);

 const active=await request(w,{title:'Grabación vigente'});
 visit(w,active,{place:'Sede de la visita vigente'});
 const mixedHome=await w.client.get('/home');assert.equal(mixedHome.status,200);
 assert.match(mixedHome.body,/<strong>1<\/strong><span>Próximas visitas/);
 const mixedAgency=await w.admin.get('/dashboard');assert.equal(mixedAgency.status,200);
 assertAgencyVisitCount(mixedAgency.body,1);
 const upcoming=upcomingAgencyVisits(mixedAgency.body);
 assert.match(upcoming,/Grabación vigente/);assert.match(upcoming,/Sede de la visita vigente/);
 assert.doesNotMatch(upcoming,/Grabación cancelada|Sede de la visita cancelada/);
 assert.equal(w.db.get('SELECT status FROM visits WHERE request_id=?',cancelled.id).status,'SCHEDULED');
 assert.equal(agendaData(w.db,actor(w),w.id).counts.history,1);
});
test('la agenda vacía admite un identificador de negocio que contiene 2099 en actividad reciente',()=>{
 const companyId='00002099-0000-4000-8000-000000000001';
 const body=agencyOverview({counts:{companies:1,pending:0,open:0,delivered:0,visits:0},pipeline:[],visits:[],recent:[{
  id:'00000000-0000-4000-8000-000000000002',company_id:companyId,company_name:'Negocio de prueba',
  title:'Grabación cancelada',channel:'SOCIAL',status:'CANCELLED',quantity:1,created_at:'2026-01-01T15:00:00.000Z',
 }]});
 // Reproduce the former false positive without depending on a randomly generated UUID.
 assert.ok(body.includes('?company='+companyId));assert.match(body,/Grabación cancelada/);
 assertAgencyVisitCount(body,0);
 assert.match(upcomingAgencyVisits(body),/Tu agenda está al día/);
 assert.doesNotMatch(upcomingAgencyVisits(body),/appointment-list|Grabación cancelada/);
});

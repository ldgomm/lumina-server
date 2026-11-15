import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {portal,agency,owner,colleague,documentFor,password} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
import {getSession} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import {businessControl} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/control.mjs';
import {contentData} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/content/workspace.mjs';
import {visibleRequests,updateRequest} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/production.mjs';
import {agendaData} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/agenda.mjs';
const actor=(w,client=w.admin)=>getSession(w.db,client.cookie.split('=')[1]);
const selected=(path,id)=>'/agency'+path+(path.includes('?')?'&':'?')+'company='+id;
const body=r=>{assert.equal(r.status,200,r.body.slice(-1000));return r.body.split('<main id="content">')[1].split('</main>')[0];};
async function setup(t) {
 const states=new Map();let offline=false;
 const loyalty=await fakeLoyalty(t,null,{administration:async call=>{
  if(offline)return {status:503,body:{message:'Servidor de prueba no disponible'}};
  const tenant=call.path.split('/')[4],prior=states.get(tenant)||{state:'ACTIVE',version:1};
  if(call.path.endsWith('/access')){if(call.method==='GET')return {body:prior};const next={state:call.payload.state,version:prior.version+1};states.set(tenant,next);return {body:next};}
  return {body:{access:{effectiveState:prior.state},invoices:[],payments:[],summary:{balanceMinor:0},business:{id:tenant}}};
 }});
 const w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken}),admin=await agency(w),a=await owner(w,'Negocio archivado','lifecycle-a'),b=await owner(w,'Negocio operativo','lifecycle-b');
 await admin.post(selected('/businesses/verify',a.id));await admin.post(selected('/businesses/verify',b.id));
 const member=await colleague(w,a.client,{name:'Colaboradora',document:documentFor('lifecycle-person'),'SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes','SOCIAL.APPROVE':'yes'});
 const result={...w,...a,admin,other:b,member,loyalty,company:w.db.get('SELECT * FROM companies WHERE id=?',a.id),offline:v=>{offline=v;}};
 result.change=async(state,operation='state')=>admin.post('/admin/businesses/'+a.id+'/'+operation,{state,requestKey:uuid(),revision:String(businessControl(w.db,a.id).revision),reason:'Cambio solicitado para la prueba',confirm:'yes',name:'Negocio archivado'});
 result.work=[];
 for(const [channel,service]of [['SOCIAL','VIDEO'],['WEB','WEBSITE'],['MAPS','REVIEWS'],['WALLET','WALLET'],['BRAND','LOGO']]) {
  // Common work history, including legacy service identifiers, must remain readable.
  const id=uuid(),person=w.db.get("SELECT id FROM accounts WHERE company_id=? AND kind='OWNER'",a.id).id;
  w.db.run("INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,created_at) VALUES(?,?,?,'CONTENT',?,?,3,?,'Detalles históricos','PRODUCTION',?)",id,a.id,person,channel,service,'Trabajo '+channel,new Date().toISOString());result.work.push(id);
 }
 result.request=result.work[0];result.pieces=[];
 for(const status of ['REVIEW','PRODUCTION','APPROVED','DELIVERED']){const id=uuid();w.db.run("INSERT INTO pieces(id,company_id,request_id,title,service,status,observations,created_at) VALUES(?,?,?,?,'VIDEO',?,'',?)",id,a.id,result.request,'Pieza '+status,status,new Date().toISOString());result.pieces.push(id);}
 result.visits=[];
 for(const [date,status]of [['2099-11-20T15:00:00Z','SCHEDULED'],['2001-11-20T15:00:00Z','SCHEDULED'],['2001-11-19T15:00:00Z','DONE']]){const id=uuid();w.db.run("INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at) VALUES(?,?,?,?,?,'',?,?)",id,a.id,result.request,date,'Lugar conservado',status,new Date().toISOString());result.visits.push(id);}
 const response=await b.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Trabajo vigente'});assert.equal(response.status,303);result.otherRequest=response.location.split('/').at(-1);
 return result;
}
function snapshot(w) {return JSON.parse(JSON.stringify(Object.fromEntries(['requests','pieces','visits','companies','company_services','grants','evidence','publications'].map(table=>[table,w.db.all('SELECT * FROM '+table+' ORDER BY rowid')]))));}
function content(w,query='',company=w.company){return contentData(w.db,actor(w),company,new URLSearchParams(query));}

for(const state of ['PAUSED','SUSPENDED','CLOSED'])test(state+' removes work from operational queues and makes selected business read-only',async t=>{
 const w=await setup(t),before=snapshot(w);assert.equal((await w.change(state)).status,303);
 assert.equal(content(w).counts.open,0);assert.equal(content(w).counts.blocked,1);assert.equal(content(w,'view=production').total,0);assert.equal(content(w,'view=reviews').total,0);
 for(const path of ['/content?view=requests','/requests','/home','/services/web','/services/maps','/services/brand']){const html=body(await w.admin.get(path.startsWith('/services/')?path+'?company='+w.id:selected(path,w.id)));assert.match(html,new RegExp('data-business-state="'+state+'"'));assert.doesNotMatch(html,/Registra producción|Abrir tareas de Lúmina|Trabajo de Lúmina<|action="[^"]*(?:state|pieces|quote|visits)"/);}
 assert.doesNotMatch(body(await w.admin.get('/production')),/Trabajo SOCIAL|Trabajo WEB|Trabajo MAPS|Trabajo WALLET|Trabajo BRAND/);
 assert.match(body(await w.admin.get('/production')),/Trabajo vigente/);assert.deepEqual(snapshot(w),before);
});
test('delete preserves history but no longer reports requests in progress anywhere',async t=>{
 const w=await setup(t),before=snapshot(w);assert.equal((await w.change('CLOSED','delete')).status,303);
 const direct=body(await w.admin.get('/requests?company='+w.id));assert.match(direct,/0 en curso · 5 detenidas/);assert.match(direct,/Archivada · Negocio eliminado/);assert.doesNotMatch(direct,/Recibimos tu solicitud|Trabajo en producción/);
 const inbox=body(await w.admin.get(selected('/content?view=requests',w.id)));assert.match(inbox,/data-business-state="ARCHIVED"/);assert.match(inbox,/Consultar historial/);
 const count=visibleRequests(w.db,actor(w),w.id,'');assert.deepEqual(count.counts,{all:5,open:0,blocked:5,closed:0});assert.deepEqual(snapshot(w),before);
});
test('dashboard excludes deleted business from clients, pending pipeline and upcoming visits',async t=>{
 const w=await setup(t);await w.change('CLOSED','delete');const html=body(await w.admin.get('/dashboard'));
 assert.doesNotMatch(html,/Trabajo SOCIAL|Negocio archivado|Lugar conservado/);assert.match(html,/5 solicitudes detenidas/);assert.match(html,/scope=blocked/);assert.match(html,/Trabajo vigente/);
 assert.match(html,/Negocios en operación<\/span><\/div><strong>1<\/strong>/);assert.match(html,/Solicitudes abiertas<\/span><\/div><strong>1<\/strong>/);assert.match(html,/Visitas programadas<\/span><\/div><strong>0<\/strong>/);
});
test('agency can explicitly consult stopped work with effective state and its last stage',async t=>{
 const w=await setup(t);await w.change('CLOSED','delete');const html=body(await w.admin.get('/production?scope=blocked&channel=WEB&q=Trabajo'));
 assert.match(html,/Trabajo WEB/);assert.doesNotMatch(html,/Trabajo SOCIAL|Trabajo vigente/);assert.match(html,/Archivada · Negocio eliminado/);assert.match(html,/Última etapa: En producción/);
 assert.match(html,/name="scope" value="blocked"/);assert.equal((await w.admin.get('/production?scope=unknown')).status,400);
});
test('global Content separates stopped work and uses matching counts before pagination',async t=>{
 const w=await setup(t);await w.change('SUSPENDED');
 const all=content(w,'view=requests',null),stopped=content(w,'view=requests&filter=blocked',null);assert.equal(all.total,1);assert.equal(all.counts.requests,1);assert.equal(all.counts.blocked,1);assert.equal(stopped.total,1);assert.equal(stopped.rows[0].id,w.request);
 assert.equal(content(w,'view=overview',null).rows[0].id,w.otherRequest);assert.equal(content(w,'view=production',null).total,0);assert.equal(content(w,'view=reviews',null).total,0);
 const html=body(await w.admin.get('/content?view=requests&filter=blocked'));assert.match(html,/Detenida · Suspendido/);assert.doesNotMatch(html,/Trabajo vigente/);
});
test('archived home is a history screen and old Content bookmarks clearly stop work',async t=>{
 const w=await setup(t);await w.change('CLOSED','delete');
 const home=body(await w.admin.get('/home?company='+w.id));assert.match(home,/Historial del negocio/);assert.doesNotMatch(home,/Abrir Wallet|Tu producción, en un solo lugar|Próximas visitas/);
 for(const view of ['overview','requests','production','reviews','deliveries','publications','metrics','calendar']){const html=body(await w.admin.get(selected('/content?view='+view,w.id)));assert.match(html,/HISTORIAL · SOLO LECTURA/);assert.doesNotMatch(html,/Registra producción|Ir al trabajo de Lúmina|Completar entrega|Gestionar visita →/);}
});
test('archived detail retains evidence and audit without editable forms or next-step claims',async t=>{
 const w=await setup(t),e=uuid();w.db.run("INSERT INTO evidence(id,company_id,piece_id,label,url,created_at) VALUES(?,?,?,'Entrega anterior','https://example.test/evidence',?)",e,w.id,w.pieces[0],new Date().toISOString());
 await w.change('CLOSED','delete');for(const prefix of ['', '/agency']){const html=body(await w.admin.get(prefix+'/requests/'+w.request+'?company='+w.id));assert.match(html,/Entrega anterior/);assert.match(html,/CONSULTA DEL HISTORIAL/);assert.match(html,/Última etapa: En producción/);assert.match(html,/Última etapa: En revisión/);assert.match(html,/Último estado: Programada/);assert.doesNotMatch(html,/class="detail-count">[^<]*en revisión/);assert.doesNotMatch(html,/<form method="post"|SIGUIENTE PASO|aria-current="step"/);}
});
test('stopped visits leave upcoming and overdue views while historical dates remain intact',async t=>{
 const w=await setup(t);await w.change('PAUSED');const data=agendaData(w.db,actor(w),w.id);assert.deepEqual(data.counts,{upcoming:0,pending:0,history:1,blocked:2});
 const html=body(await w.admin.get(selected('/calendar?view=blocked',w.id)));assert.match(html,/Lugar conservado/);assert.match(html,/Detenida · En pausa/);assert.doesNotMatch(html,/Guardar en calendario|Gestionar visita →/);
 assert.equal((await w.admin.get(selected('/calendar/visits/'+w.visits[0]+'.ics',w.id))).status,423);
 assert.equal((await w.admin.get('/calendar/visits/'+w.visits[0]+'.ics')).status,423);
 assert.equal(w.db.get('SELECT status FROM visits WHERE id=?',w.visits[0]).status,'SCHEDULED');
});
test('pending native acknowledgement blocks views immediately and GET never retries it',async t=>{
 const w=await setup(t);w.offline(true);assert.equal((await w.change('SUSPENDED')).status,503);const calls=w.loyalty.calls.length;
 assert.match(body(await w.admin.get(selected('/content?view=requests',w.id))),/data-business-state="PENDING"/);assert.doesNotMatch(body(await w.admin.get('/production')),/Trabajo SOCIAL/);assert.equal(content(w).counts.open,0);assert.equal(w.loyalty.calls.length,calls);
});
test('restore resumes original stages and preserves business links, files, services and grants',async t=>{
 const w=await setup(t);w.db.run("UPDATE company_services SET status='SETUP' WHERE company_id=? AND service='BRAND'",w.id);const before=snapshot(w);await w.change('CLOSED','delete');
 assert.equal((await w.change('ACTIVE','restore')).status,303);assert.deepEqual(snapshot(w),before);
 assert.equal(content(w).counts.open,1);assert.equal(content(w).counts.blocked,0);assert.equal(content(w,'view=production').total,2);assert.equal(content(w,'view=reviews').total,1);
 const html=body(await w.admin.get(selected('/requests/'+w.request,w.id)));assert.match(html,/action="\/agency\/requests\/[^\"]+\/state/);assert.doesNotMatch(html,/data-business-state="ARCHIVED"/);
});
test('reactivation remains blocked until confirmation succeeds',async t=>{
 const w=await setup(t);await w.change('SUSPENDED');w.offline(true);assert.equal((await w.change('ACTIVE')).status,503);
 assert.equal(content(w).counts.open,0);assert.equal(content(w,'view=requests&filter=blocked').total,1);assert.equal((await w.admin.post(selected('/requests/'+w.request+'/state',w.id),{status:'CANCELLED',notes:'Cancelar trabajo',revision:'0'})).status,423);
 w.offline(false);assert.equal((await w.admin.post('/admin/businesses/'+w.id+'/retry',{confirm:'yes'})).status,303);assert.equal(content(w).counts.open,1);
});
test('agency direct mutations cannot bypass business hold for any operational service',async t=>{
 const w=await setup(t);await w.change('PAUSED');const before=snapshot(w);
 const paths=['/requests/'+w.request+'/state','/requests/'+w.request+'/quote','/requests/'+w.request+'/visits','/requests/'+w.request+'/pieces','/requests/'+w.request+'/pieces/'+w.pieces[0]+'/edit','/requests/'+w.request+'/pieces/'+w.pieces[0]+'/comment','/requests/'+w.request+'/pieces/'+w.pieces[0]+'/measure','/maps','/plans/request'];
 for(const path of paths)assert.equal((await w.admin.post(selected(path,w.id),{})).status,423,path);
 assert.throws(()=>updateRequest(w.db,actor(w),w.company,w.db.get('SELECT * FROM requests WHERE id=?',w.request),{status:'CANCELLED',notes:'Cerrar por prueba'}),e=>e.status===423);assert.deepEqual(snapshot(w),before);
});
test('owner and collaborator stay blocked after deletion even after logging in again',async t=>{
 const w=await setup(t),identities=[actor(w,w.client).document,actor(w,w.member.session).document];await w.change('CLOSED','delete');
 for(const document of identities){const user=w.session();assert.equal((await user.post('/login',{document,password})).status,303);for(const path of ['/requests','/content','/calendar','/services/web','/services/maps','/services/brand','/wallet']){const r=await user.get(path);assert.equal(r.status,423);assert.match(r.body,/Servicios detenidos/);}assert.equal((await user.post('/requests',{type:'CONTENT'})).status,423);assert.equal((await user.get('/account')).status,200);}
});
test('blocked search counts and page clamps cover all records without history mutations',async t=>{
 const w=await setup(t),r=w.db.get('SELECT * FROM requests WHERE id=?',w.request);
 for(let i=0;i<34;i++)w.db.run("INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,created_at) VALUES(?,?,?,'CONTENT','SOCIAL','VIDEO',1,?,'','NEW',?)",uuid(),w.id,r.owner_id,'Serie '+i,new Date().toISOString());
 await w.change('SUSPENDED');const before=snapshot(w),page=visibleRequests(w.db,actor(w),w.id,'',999,{view:'blocked',q:'Serie'});assert.equal(page.total,34);assert.equal(page.page,1);assert.equal(page.rows.length,4);assert.equal(page.counts.blocked,34);assert.equal(page.counts.open,0);
 const c=content(w,'view=requests&filter=blocked&q=Serie&page=999');assert.equal(c.page,1);assert.equal(c.rows.length,14);assert.equal(c.total,34);assert.deepEqual(snapshot(w),before);
});
test('completed and cancelled requests remain historical rather than being counted as held work',async t=>{
 const w=await setup(t);w.db.run("UPDATE requests SET status='DELIVERED' WHERE id=?",w.work[1]);w.db.run("UPDATE requests SET status='CANCELLED' WHERE id=?",w.work[2]);await w.change('CLOSED');
 const rows=visibleRequests(w.db,actor(w),w.id,'');assert.deepEqual(rows.counts,{all:5,open:0,blocked:3,closed:2});assert.equal(visibleRequests(w.db,actor(w),w.id,'',0,{view:'closed'}).total,2);
});
test('changing one business never changes another business work, routes or permissions',async t=>{
 const w=await setup(t);await w.change('SUSPENDED');assert.match(body(await w.other.client.get('/requests?company='+w.id)),/Trabajo vigente/);assert.doesNotMatch(body(await w.other.client.get('/requests?company='+w.id)),/Trabajo SOCIAL|Negocio archivado/);
 assert.equal((await w.other.client.get('/requests/'+w.request)).status,404);assert.equal((await w.other.client.get('/production?scope=blocked')).status,403);assert.equal(contentData(w.db,actor(w,w.other.client),{id:w.other.id},new URLSearchParams('view=requests')).total,1);
});
test('pre-existing archived rows need no repair migration or fake cancellation to become historical',async t=>{
 const w=await setup(t),before=snapshot(w);w.db.run("INSERT INTO business_controls(company_id,state,reason,revision,updated_at,archived_at) VALUES(?,'CLOSED','Registro anterior',2,?,?)",w.id,new Date().toISOString(),new Date().toISOString());
 assert.doesNotMatch(body(await w.admin.get('/production')),/Trabajo SOCIAL/);assert.match(body(await w.admin.get('/requests?company='+w.id)),/Archivada · Negocio eliminado/);assert.deepEqual(snapshot(w),before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {openDatabase} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import {businessDirectory} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/directory.mjs';
import {businessWorkSummary} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/work-summary.mjs';
import {businessDirectoryPage} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/business-directory-pages.mjs';
import {controlPage} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/business-control-pages.mjs';
import {visibleRequests} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/production.mjs';
import {agendaData} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/agenda.mjs';
import {portal,agency,owner} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
const actor={kind:'AGENCY',csrf:'fictional'},query=v=>new URLSearchParams(v);
function fixture(t) {
 const db=openDatabase(':memory:');t.after(()=>db.close());
 const business=(name,state='ACTIVE',approved=1,archived=false,pending=false)=>{
  const id=uuid(),person=uuid();
  db.run('INSERT INTO companies(id,name,registration_key,document_hint,phone,approved,created_at) VALUES(?,?,?,?,?,?,?)',id,name,uuid(),'1234','0991234567',approved,'2026-11-14T00:00:00Z');
  db.run("INSERT INTO accounts(id,company_id,name,email,kind) VALUES(?,?,?,?,'OWNER')",person,id,'Responsable '+name,uuid());
  db.run('INSERT INTO business_controls(company_id,state,reason,revision,pending_id,archived_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,state,'Motivo conservado',1,pending?uuid():null,archived?'2026-11-14T00:00:00Z':null,'2026-11-14T00:00:00Z');
  return {id,person};
 };
 const request=(b,status='NEW')=>{const id=uuid();db.run("INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,created_at) VALUES(?,?,?,'CONTENT','SOCIAL','VIDEO',1,'Trabajo','','"+status+"','2026-11-14T00:00:00Z')",id,b.id,b.person);return id;};
 const visit=(b,r,date,status='SCHEDULED')=>db.run('INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at) VALUES(?,?,?,?,?,?,?,?)',uuid(),b.id,r,date,'Lugar ficticio','',status,'2026-11-14T00:00:00Z');
 const person=(b,active=1,password='fictional-hash',archived=false)=>db.run("INSERT INTO accounts(id,company_id,name,email,kind,active,password,archived_at) VALUES(?,?,?,?,'COLLABORATOR',?,?,?)",uuid(),b.id,'Persona',uuid(),active,password,archived?'2026-11-14T00:00:00Z':null);
 return {db,business,request,visit,person};
}
test('business facets follow accent-insensitive search including removed businesses',t=>{
 const {db,business}=fixture(t);business('Café Aurora');business('Café Azul','PAUSED');business('Café Archivo','CLOSED',1,true);business('Otro negocio','SUSPENDED');
 const result=businessDirectory(db,actor,query({q:'CAFE'}));assert.equal(result.total,2);assert.deepEqual({...result.counts},{total:2,active:1,stopped:1,archived:1,pending:0,unverified:0});
 assert.equal(businessDirectory(db,actor,query({q:'sin coincidencias'})).counts.total,0);
});
test('verification scope applies to every lifecycle counter without depending on the selected state',t=>{
 const {db,business}=fixture(t);business('Uno','ACTIVE',0);business('Dos','PAUSED',0);business('Tres','CLOSED',0,true);business('Cuatro','ACTIVE',1);
 const a=businessDirectory(db,actor,query({verification:'PENDING',state:'STOPPED'})),b=businessDirectory(db,actor,query({verification:'PENDING',state:'ACTIVE'}));
 assert.equal(a.total,1);assert.equal(a.counts.unverified,2);assert.equal(a.counts.archived,1);assert.deepEqual(a.counts,b.counts);
});
test('pending active transitions and inconsistent historical archives never count as operative',t=>{
 const {db,business}=fixture(t);business('Pendiente','ACTIVE',1,false,true);business('Archivado antiguo','ACTIVE',1,true);business('Vigente');business('Suspendido','SUSPENDED');
 const all=businessDirectory(db,actor);assert.equal(all.counts.total,3);assert.equal(all.counts.active,1);assert.equal(all.counts.stopped,2);assert.equal(all.counts.active+all.counts.stopped,all.counts.total);
 const stopped=businessDirectory(db,actor,query({state:'STOPPED'}));assert.deepEqual(new Set(stopped.rows.map(r=>r.business_state)),new Set(['PENDING','SUSPENDED']));
 assert.equal(businessDirectory(db,actor,query({state:'ACTIVE'})).total,1);
});
test('pending archive is discoverable in both synchronization and archive views',t=>{
 const {db,business}=fixture(t);const b=business('Pendiente de eliminar','CLOSED',1,true,true);
 assert.equal(businessDirectory(db,actor).total,0);
 for(const state of ['ARCHIVED','PENDING']){const result=businessDirectory(db,actor,query({state}));assert.equal(result.total,1);assert.equal(result.rows[0].id,b.id);assert.equal(result.counts.pending,1);assert.equal(result.counts.archived,1);}
});
test('stopped search paginates without overlaps and clamps an old page',t=>{
 const {db,business}=fixture(t);for(let i=0;i<32;i++)business('Grupo '+i,'PAUSED');business('Otro','PAUSED');business('Grupo activo');
 const a=businessDirectory(db,actor,query({state:'STOPPED',q:'Grupo',sort:'NAME'})),b=businessDirectory(db,actor,query({state:'STOPPED',q:'Grupo',sort:'NAME',page:'99'}));
 assert.equal(a.total,32);assert.equal(a.rows.length,25);assert.equal(b.page,1);assert.equal(b.rows.length,7);assert.equal(new Set([...a.rows,...b.rows].map(r=>r.id)).size,32);assert.equal(a.counts.active,1);
});
test('work summary independently counts requests visits and enabled collaborators in one business',t=>{
 const {db,business,request,visit,person}=fixture(t),b=business('Uno'),other=business('Dos');
 const open=request(b),done=request(b,'DELIVERED'),cancelled=request(b,'CANCELLED');request(b,'REVIEW');
 visit(b,open,'2099-11-20T15:00:00Z');visit(b,open,'2001-11-20T15:00:00Z');visit(b,done,'2099-11-22T15:00:00Z');visit(b,cancelled,'2099-11-20T15:00:00Z');visit(b,open,'2001-11-20T15:00:00Z','DONE');visit(b,open,'2001-11-20T15:00:00Z','CANCELLED');
 person(b);person(b);person(b,0);person(b,1,null);person(b,1,'fictional-hash',true);person(other);request(other);visit(other,request(other),'2099-11-20T15:00:00Z');
 assert.deepEqual({...businessWorkSummary(db,actor,b.id)},{state:'ACTIVE',requests:2,upcoming:2,overdue:1,collaborators:2});
 assert.equal(businessDirectory(db,actor,query({q:'Uno'})).rows[0].unfinished_requests,2);
});
test('work summary matches destination request and agenda filters while stopped and after reactivation',t=>{
 const {db,business,request,visit}=fixture(t),b=business('Uno','PAUSED'),r=request(b);visit(b,r,'2099-11-20T15:00:00Z');visit(b,r,'2001-11-20T15:00:00Z');
 for(const state of ['PAUSED','ACTIVE']){db.run('UPDATE business_controls SET state=? WHERE company_id=?',state,b.id);const work=businessWorkSummary(db,actor,b.id),agenda=agendaData(db,actor,b.id);
  assert.equal(work.requests,visibleRequests(db,actor,b.id,'',0,{view:state==='ACTIVE'?'open':'blocked'}).total);
  assert.equal(work.upcoming+work.overdue,state==='ACTIVE'?agenda.counts.upcoming+agenda.counts.pending:agenda.counts.blocked);}
});
test('work summary rejects nonagency and absent businesses and makes no writes',t=>{
 const {db,business,request}=fixture(t),b=business('Uno');request(b);const before=db.get('SELECT total_changes() n').n;
 businessWorkSummary(db,actor,b.id);businessDirectory(db,actor);assert.equal(db.get('SELECT total_changes() n').n,before);
 for(const kind of ['OWNER','COLLABORATOR'])assert.throws(()=>businessWorkSummary(db,{kind,companyId:b.id},b.id),e=>e.status===403);
 assert.throws(()=>businessWorkSummary(db,actor,uuid()),e=>e.status===404);
});
test('directory preserves filter context and links exact work scope without mutating contact',t=>{
 const {db,business,request}=fixture(t),b=business('Café','SUSPENDED',0);request(b);const html=businessDirectoryPage(businessDirectory(db,actor,query({q:'cafe',state:'STOPPED',verification:'PENDING',sort:'NAME'})));
 assert.match(html,/q=cafe&amp;state=ARCHIVED&amp;verification=PENDING&amp;sort=NAME&amp;page=0/);assert.match(html,/1 solicitud detenida/);assert.match(html,new RegExp('/requests\\?company='+b.id+'&amp;view=blocked'));assert.match(html,/href="tel:0991234567"/);assert.match(html,/Consultar historial/);assert.match(html,/aria-current="page"/);
});
test('no-result copy does not pretend an existing directory is empty and unsafe contact stays plain text',t=>{
 const {db,business}=fixture(t);const b=business('<Negocio>');db.run('UPDATE companies SET phone=? WHERE id=?','javascript:alert(1)',b.id);
 const missing=businessDirectoryPage(businessDirectory(db,actor,query({q:'nada'})));assert.match(missing,/No hay coincidencias/);assert.doesNotMatch(missing,/Aún no hay negocios/);
 const html=businessDirectoryPage(businessDirectory(db,actor));assert.match(html,/&lt;Negocio&gt;/);assert.doesNotMatch(html,/href="(?:tel:)?javascript:|<Negocio>/);
});
test('state actions have no implicit destructive choice and failed drafts retain their selection and reason',t=>{
 const company={id:uuid(),name:'Negocio',phone:'0991234567'},control={state:'ACTIVE',revision:3},key=uuid();
 const initial=controlPage(actor,company,control,[],null);assert.equal((initial.match(/type="radio" name="state"/g)||[]).length,3);assert.doesNotMatch(initial,/name="state"[^>]*checked/);assert.match(initial,/próximos cargos de Wallet/);
 const retry=controlPage(actor,company,control,[],null,'Revisa el cambio',{state:'PAUSED',reason:'Razón <privada>',revision:'3',requestKey:key},{action:'state'});
 assert.match(retry,/value="PAUSED" required checked/);assert.match(retry,/Razón &lt;privada&gt;/);assert.match(retry,new RegExp('value="'+key+'"'));assert.doesNotMatch(retry,/name="confirm"[^>]*checked/);
});
test('state work cards show preserved access and read-only destinations for an archived business',t=>{
 const company={id:uuid(),name:'Negocio',phone:'0991234567'};
 const html=controlPage(actor,company,{state:'CLOSED',archived_at:'2026-11-14',revision:3},[],null,'',{}, {work:{state:'ARCHIVED',requests:2,upcoming:1,overdue:1,collaborators:3}});
 assert.match(html,/Accesos conservados/);assert.match(html,/Consultar solicitudes detenidas/);assert.match(html,/view=blocked/);assert.doesNotMatch(html,/name="state"|Aplicar cambio/);assert.match(html,/Restaurar negocio/);
});
test('business administration shows live local work even when the native account is unavailable',async t=>{
 const native=await fakeLoyalty(t,null,{administration:async()=>({status:503,body:{message:'Cuenta temporalmente no disponible'}})});
 const w=await portal(t,native.origin,{platformToken:native.platformToken}),admin=await agency(w),b=await owner(w,'Resumen local','workspace-summary');
 const created=await b.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Trabajo local'});assert.equal(created.status,303);
 const before=w.db.all('SELECT * FROM business_controls'),calls=native.calls.length;
 const response=await admin.get('/admin/businesses/'+b.id);assert.equal(response.status,200);assert.match(response.body,/Solicitudes sin terminar<\/span><strong>1<\/strong>/);assert.match(response.body,/Cuenta no disponible/);assert.deepEqual(w.db.all('SELECT * FROM business_controls'),before);
 assert.ok(native.calls.slice(calls).every(c=>c.method==='GET'));
 assert.equal((await b.client.get('/admin/businesses/'+b.id)).status,403);
});
test('directory request shortcut renders the same count and remains private over HTTP',async t=>{
 const native=await fakeLoyalty(t),w=await portal(t,native.origin,{platformToken:native.platformToken}),admin=await agency(w),b=await owner(w,'Prueba directorio','workspace-shortcut');
 assert.equal((await b.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Trabajo visible'})).status,303);
 assert.equal((await b.client.get('/businesses')).status,403);
 w.db.run("INSERT INTO business_controls(company_id,state,reason,revision,updated_at) VALUES(?,'SUSPENDED','Motivo',1,?)",b.id,new Date().toISOString());
 const directory=await admin.get('/businesses?state=STOPPED');assert.equal(directory.status,200);assert.match(directory.body,/1 solicitud detenida/);
 const requests=await admin.get('/requests?company='+b.id+'&view=blocked');assert.equal(requests.status,200);assert.match(requests.body,/Trabajo visible/);assert.match(requests.body,/1 detenida/);
 assert.equal((await w.session().get('/businesses')).status,303);assert.equal((await b.client.get('/businesses')).status,423);
});

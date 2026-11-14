import test from 'node:test';
import assert from 'node:assert/strict';
import {agency,colleague,documentFor,owner,portal} from './helpers.mjs';
import {getSession} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import {contentData} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/content/workspace.mjs';
import {uuid} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const selected=(path,id)=>'/agency'+path+'?company='+id;
const actor=(w,client=w.client)=>getSession(w.db,client.cookie.split('=')[1]);
const data=(w,query='',client=w.client)=>contentData(w.db,actor(w,client),w.company,new URLSearchParams(query));
async function setup(t){const w=await portal(t),admin=await agency(w),o=await owner(w,'Estudio de prueba','workspace-progress');await admin.post(selected('/businesses/verify',o.id));return {...w,...o,admin,company:w.db.get('SELECT * FROM companies WHERE id=?',o.id)};}
async function request(w,{title='Campaña de temporada',quantity='3',status='PRODUCTION',type='CONTENT'}={}){
 const r=await w.client.post('/requests',{type,channel:'SOCIAL',service:'VIDEO',quantity,title});assert.equal(r.status,303,r.body);
 const id=r.location.split('/').at(-1);w.db.run('UPDATE requests SET status=? WHERE id=?',status,id);return {id,path:r.location};
}
function piece(w,r,status='REVIEW',title='Video de temporada'){
 const id=uuid();w.db.run("INSERT INTO pieces(id,company_id,request_id,title,service,status,observations,created_at) VALUES(?,?,?,?,'VIDEO',?,'','2026-10-01T15:00:00.000Z')",id,w.id,r.id,title,status);return id;
}
function evidence(w,p,label='Archivo final'){
 w.db.run("INSERT INTO evidence(id,company_id,piece_id,label,url,created_at) VALUES(?,?,?,?,?,'2026-10-01T15:00:00.000Z')",uuid(),w.id,p,label,'https://example.test/file/'+uuid());
}
const list=html=>html.split('<div data-content-list>')[1]||html;

test('la misma entrega pendiente tiene acceso directo desde Inicio, Solicitudes y Contenido',async t=>{
 const w=await setup(t),r=await request(w),p=piece(w,r);
 for(const path of ['/home','/requests','/content?view=requests']){const response=await w.client.get(path);assert.equal(response.status,200);assert.match(response.body,/1 entrega por revisar/);assert.ok(response.body.includes('href="'+r.path+'#piece-'+p+'"'));}
 const review=await w.client.get('/content?view=reviews');assert.match(review.body,/Revisar pieza/);assert.ok(review.body.includes(r.path+'#piece-'+p));assert.match((await w.client.get(r.path)).body,new RegExp('id="piece-'+p+'"'));
});
test('un lector ve avances y archivos sin recibir acciones de aprobación',async t=>{
 const w=await setup(t),r=await request(w),p=piece(w,r);evidence(w,p);
 const m=await colleague(w,w.client,{name:'Consulta',document:documentFor('workspace-reader'),'SOCIAL.VIEW':'yes'});
 for(const path of ['/requests','/content?view=requests','/content?view=reviews']){const html=list((await m.session.get(path)).body);assert.match(html,/Video de temporada|Campaña de temporada/);assert.doesNotMatch(html,/Revisar pieza|Revisar entrega|Tu revisión|Aprobar entrega/);}
 const page=await m.session.get('/content?view=reviews');assert.match(page.body,/1 archivo o enlace/);assert.equal((await m.session.post(r.path+'/pieces/'+p+'/review',{status:'APPROVED',revision:'1'})).status,403);
});
test('al retirar aprobación desaparece la llamada a revisar en la sesión abierta',async t=>{
 const w=await setup(t),r=await request(w);piece(w,r);
 const m=await colleague(w,w.client,{name:'Revisión',document:documentFor('workspace-reviewer'),'SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});
 assert.match((await m.session.get('/content?view=reviews')).body,/Revisar pieza/);
 w.db.run("DELETE FROM grants WHERE account_id=? AND action='APPROVE'",m.id);
 assert.doesNotMatch(list((await m.session.get('/content?view=reviews')).body),/Revisar pieza|Tu revisión/);
});
test('la revisión histórica respeta todas las plataformas asignadas a la misma pieza',async t=>{
 const w=await setup(t),single=await request(w,{title:'Instagram autorizado'}),common=await request(w,{title:'Pieza común'}),shared=await request(w,{title:'Compartida'});
 for(const r of [single,common,shared])piece(w,r,'REVIEW',r.id);
 for(const [r,p] of [[single,'INSTAGRAM'],[shared,'INSTAGRAM'],[shared,'TIKTOK']])w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,r.id,p);
 const m=await colleague(w,w.client,{name:'Equipo Instagram',document:documentFor('workspace-legacy'),'INSTAGRAM.VIEW':'yes','INSTAGRAM.APPROVE':'yes'});
 const html=list((await m.session.get('/content?view=reviews')).body);assert.equal((html.match(/Revisar pieza/g)||[]).length,1);assert.match(html,/Instagram autorizado/);assert.match(html,/Pieza común/);
});
test('el avance cuenta entregables una vez aunque la pieza tenga varias publicaciones',async t=>{
 const w=await setup(t),r=await request(w),p=piece(w,r,'DELIVERED');piece(w,r,'PRODUCTION','Siguiente video');
 for(const channel of ['INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE'])w.db.run("INSERT INTO publications(id,company_id,piece_id,channel,url,published_at) VALUES(?,?,?,?,?,'2026-10-01T15:00:00.000Z')",uuid(),w.id,p,channel,'https://example.test/'+channel);
 for(const path of ['/home','/requests','/content?view=requests'])assert.match((await w.client.get(path)).body,/1 de 3 piezas entregadas/);
 assert.equal(data(w).counts.delivered,1);assert.equal(data(w).counts.publications,4);assert.equal(data(w).counts.production,1);
});
test('buscar por nombre de pieza encuentra su solicitud sin devolver piezas hermanas ajenas a la búsqueda',async t=>{
 const w=await setup(t),r=await request(w);const wanted=piece(w,r,'PRODUCTION','Producto Azul'),other=piece(w,r,'PRODUCTION','Producto Rojo');
 const found=data(w,'view=production&q=azul');assert.equal(found.total,1);assert.deepEqual(found.rows.map(p=>p.id),[wanted]);assert.equal(found.counts.production,1);
 assert.equal(data(w,'view=requests&q=AzUl').rows[0].id,r.id);
 const html=list((await w.client.get('/content?view=production&q=azul')).body);assert.match(html,/Producto Azul/);assert.doesNotMatch(html,/Producto Rojo/);assert.ok(!html.includes('#piece-'+other));
});
test('Solicitudes abiertas abre únicamente trabajos en curso y conserva los cerrados en su filtro',async t=>{
 const w=await setup(t),open=await request(w,{title:'Trabajo abierto'}),closed=await request(w,{title:'Trabajo terminado',status:'DELIVERED'});piece(w,closed,'DELIVERED');
 const home=await w.client.get('/content');assert.match(home.body,/view=requests&amp;q=&amp;filter=open/);
 const rows=data(w,'view=requests&filter=open');assert.equal(rows.total,1);assert.equal(rows.rows[0].id,open.id);assert.equal(rows.counts.requests,2);
 const history=data(w,'view=requests&filter=closed');assert.equal(history.total,1);assert.equal(history.rows[0].id,closed.id);
 assert.doesNotMatch(list((await w.client.get('/content?view=requests&filter=open')).body),/Trabajo terminado/);
});
test('la paginación muestra totales exactos y recupera una página que quedó vacía',async t=>{
 const w=await setup(t),r=await request(w,{quantity:'30'});for(let i=0;i<23;i++)piece(w,r,'DELIVERED','Pieza '+i);
 const first=data(w,'view=deliveries'),last=data(w,'view=deliveries&page=999');assert.equal(first.total,23);assert.equal(first.rows.length,20);assert.equal(last.page,1);assert.equal(last.rows.length,3);assert.equal(new Set([...first.rows,...last.rows].map(p=>p.id)).size,23);
 assert.match((await w.client.get('/content?view=deliveries&page=999')).body,/21–23 de 23/);
 const narrowed=data(w,'view=deliveries&page=999&q=Pieza+22');assert.equal(narrowed.page,0);assert.equal(narrowed.total,1);assert.equal(narrowed.rows[0].title,'Pieza 22');
});
test('las colas separan producción y revisión y excluyen solicitudes cerradas',async t=>{
 const w=await setup(t),r=await request(w);piece(w,r);piece(w,r,'PRODUCTION');piece(w,r,'APPROVED');
 for(const status of ['CANCELLED','DELIVERED']){const closed=await request(w,{status});piece(w,closed,'REVIEW');piece(w,closed,'PRODUCTION');}
 const overview=data(w);assert.equal(overview.counts.production,2);assert.equal(overview.counts.review,1);assert.equal(data(w,'view=production').total,2);assert.equal(data(w,'view=reviews').total,1);
});
test('agencia, consulta de negocio y dueño conservan destinos y acciones diferentes',async t=>{
 const w=await setup(t),r=await request(w),p=piece(w,r,'APPROVED');
 const work=list((await w.admin.get('/agency/content?view=production&company='+w.id)).body),consult=list((await w.admin.get('/content?view=production&company='+w.id)).body);
 assert.ok(work.includes(selected(r.path,w.id)+'#edit-'+p));assert.match(work,/Completar entrega/);assert.ok(consult.includes(r.path+'?company='+w.id+'#piece-'+p));assert.doesNotMatch(consult,/Completar entrega|Revisar pieza/);
 assert.match(list((await w.client.get('/content?view=production')).body),/Aprobada · pendiente de entrega/);
});
test('cotización disponible lleva al precio y solo el dueño recibe la llamada a revisarla',async t=>{
 const w=await setup(t),r=await request(w,{status:'NEW'});await w.admin.post(selected(r.path+'/quote',w.id),{amount:'35',terms:'Un video del negocio.'});
 assert.ok((await w.client.get('/requests')).body.includes('href="'+r.path+'#quote"'));assert.match((await w.client.get('/requests')).body,/Tu cotización está lista/);
 assert.doesNotMatch(list((await w.admin.get('/content?company='+w.id+'&view=requests')).body),/Tu cotización está lista|Revisar cotización/);
});
test('búsqueda, conteos y enlaces nunca exponen contenido de otro negocio o plataforma',async t=>{
 const w=await setup(t),r=await request(w,{title:'Permitido'});piece(w,r,'REVIEW','Título público');
 const hidden=await request(w,{title:'SECRETO_TIKTOK'});piece(w,hidden,'REVIEW','SECRETO_PIEZA');w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,hidden.id,'TIKTOK');
 const b=await owner(w,'NEGOCIO_PRIVADO','workspace-other'),bw={...w,...b,company:w.db.get('SELECT * FROM companies WHERE id=?',b.id)},br=await request(bw,{title:'SECRETO_OTRO'});piece(bw,br,'REVIEW','SECRETO_ARCHIVO');
 const m=await colleague(w,w.client,{name:'Instagram',document:documentFor('workspace-private'),'INSTAGRAM.VIEW':'yes'});
 for(const view of ['overview','requests','production','reviews','deliveries','publications']){const html=list((await m.session.get('/content?view='+view+'&company='+b.id)).body);assert.doesNotMatch(html,/SECRETO_|NEGOCIO_PRIVADO/);}
 assert.equal(data(w,'view=reviews&q=SECRETO',m.session).total,0);assert.equal(data(w,'view=reviews',m.session).counts.review,1);
});
test('la búsqueda escapa texto, rechaza filtros inválidos y conserva la vista al limpiar',async t=>{
 const w=await setup(t),r=await request(w,{title:'<script>alert(1)</script>'});piece(w,r,'DELIVERED','<img src=x onerror=alert(1)>');
 const page=await w.client.get('/content?view=deliveries&q=%3Cimg');assert.equal(page.status,200);assert.match(page.body,/&lt;img/);assert.doesNotMatch(page.body,/<img src=x/);assert.match(page.body,/view=deliveries/);
 for(const q of ['filter=invalid','page=-1','page=NaN','q='+'a'.repeat(101)])assert.equal((await w.client.get('/content?'+q)).status,400,q);
});
test('consultar el progreso y sus filtros no modifica trabajos, cobros ni autorizaciones',async t=>{
 const w=await setup(t),r=await request(w);const p=piece(w,r);evidence(w,p);
 const tables=['requests','pieces','evidence','audit','grants','contracts','company_services'];
 const before=Object.fromEntries(tables.map(t=>[t,w.db.all('SELECT * FROM '+t)]));
 for(const path of ['/home','/requests','/content','/content?view=reviews','/content?view=deliveries&page=999','/content?view=requests&filter=open'])assert.equal((await w.client.get(path)).status,200,path);
 for(const table of tables)assert.deepEqual(w.db.all('SELECT * FROM '+table),before[table],table);
});

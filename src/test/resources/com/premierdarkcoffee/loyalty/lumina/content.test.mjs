import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agency, colleague, owner, portal } from './helpers.mjs';
import { contentData } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/content/workspace.mjs';
import { localDay, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const selected= (p,id)=>'/agencia'+p+'?empresa='+id;
const yesterday=()=>localDay(new Date(Date.now()-86400000))+'T12:00';
async function setup(t) {
  const w=await portal(t),admin=await agency(w),{client,id}=await owner(w,'Contenido de prueba','1');
  await admin.post(selected('/clientes/verificar',id));
  const account=w.db.get("SELECT * FROM accounts WHERE company_id=? AND kind='OWNER'",id);
  return {...w,admin,client,id,account,company:w.db.get('SELECT * FROM companies WHERE id=?',id)};
}
async function produce(w) {
  const result=await w.client.post('/solicitudes',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Historia del producto',brief:'Preparar una pieza común'});
  const path=result.location;assert.equal(result.status,303);
  await w.admin.post(selected(path+'/estado',w.id),{status:'APPROVED'});
  await w.admin.post(selected(path+'/piezas',w.id),{title:'Video del producto'});
  const piece=w.db.get('SELECT * FROM pieces');
  const route=path+'/piezas/'+piece.id;
  await w.admin.post(selected(route+'/evidencia',w.id),{label:'Archivo maestro',url:'https://example.test/master'});
  assert.equal((await w.admin.post(selected(route+'/editar',w.id),{status:'REVIEW',revision:'1',notes:'Revisar el cierre',recorded:yesterday()})).status,303);
  return {path,route,piece};
}

test('módulo completo: solicitud común, revisión, entrega, cuatro publicaciones y métricas de una única pieza',async t=>{
  const w=await setup(t),p=await produce(w);
  const reviews=await w.client.get('/contenido?vista=revisiones');assert.equal(reviews.status,200);assert.match(reviews.body,/Video del producto/);assert.match(reviews.body,/Revisar pieza/);
  assert.equal((await w.client.post(p.route+'/revisar',{status:'APPROVED',revision:'2'})).status,303);
  assert.equal((await w.admin.post(selected(p.route+'/editar',w.id),{status:'DELIVERED',revision:'3',notes:'Entrega final',recorded:yesterday()})).status,303);
  for(const channel of ['INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE'])assert.equal((await w.admin.post(selected(p.route+'/publicacion',w.id),{channel,url:'https://example.test/'+channel,published:yesterday()})).status,303);
  const publication=w.db.get("SELECT * FROM publications WHERE channel='TIKTOK'");
  await w.admin.post(selected(p.route+'/medir',w.id),{publication:publication.id,observed:yesterday(),views:'12',likes:'0'});
  const data=contentData(w.db,w.account,w.company,new URLSearchParams());assert.equal(data.counts.pieces,1);assert.equal(data.counts.delivered,1);assert.equal(data.counts.publications,4);assert.equal(data.counts.review,0);
  for(const view of ['resumen','solicitudes','produccion','revisiones','entregas','publicaciones','metricas','agenda'])assert.equal((await w.client.get('/contenido?vista='+view)).status,200,view);
  const metrics=await w.client.get('/contenido?vista=metricas');assert.match(metrics.body,/name="vista" value="metricas"/);assert.match(metrics.body,/Fuente manual/);
  const publications=await w.client.get('/contenido?vista=publicaciones&red=TIKTOK');assert.match(publications.body,/https:\/\/example.test\/TIKTOK/);assert.doesNotMatch(publications.body,/https:\/\/example.test\/INSTAGRAM/);
  assert.equal(w.db.get('SELECT count(*) n FROM request_platforms').n,0);assert.equal(w.db.get('SELECT count(*) n FROM pieces').n,1);
  assert.match((await w.client.get(p.path)).body,/Módulo de contenido/);
});

test('permisos de plataforma, solicitudes históricas y aislamiento se conservan en todas las vistas del módulo',async t=>{
  const w=await setup(t),p=await produce(w);
  await w.client.post(p.route+'/revisar',{status:'APPROVED',revision:'2'});
  for(const channel of ['INSTAGRAM','TIKTOK'])await w.admin.post(selected(p.route+'/publicacion',w.id),{channel,url:'https://example.test/private-'+channel,published:yesterday()});
  const member=await colleague(w,w.client,{name:'Solo TikTok',email:'tiktok@example.test','TIKTOK.VIEW':'yes'});
  const pubs=await member.session.get('/contenido?vista=publicaciones');assert.equal(pubs.status,200);assert.match(pubs.body,/private-TIKTOK/);assert.doesNotMatch(pubs.body,/private-INSTAGRAM/);
  assert.equal((await member.session.get('/contenido?vista=publicaciones&red=INSTAGRAM')).status,403);
  const other=await owner(w,'Separado','2');
  for(const view of ['resumen','produccion','revisiones','entregas','publicaciones','metricas','agenda'])assert.doesNotMatch((await other.client.get('/contenido?vista='+view+'&empresa='+w.id)).body,/Video del producto|Historia del producto|private-TIKTOK/);
  const req=w.db.get('SELECT * FROM requests WHERE id=?',p.piece.request_id);
  w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,req.id,'INSTAGRAM');
  assert.doesNotMatch((await member.session.get('/contenido?vista=produccion')).body,/Video del producto/);
  assert.doesNotMatch((await member.session.get('/contenido?vista=publicaciones')).body,/private-TIKTOK/);
  w.db.run('DELETE FROM grants WHERE account_id=?',member.id);
  assert.equal((await member.session.get('/contenido')).status,403);
});

test('paginación de contenido y conteos completos: no se limitan a los veinte registros visibles',async t=>{
  const w=await setup(t);
  for(let i=0;i<45;i++)w.db.run(`INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,created_at)
    VALUES(?,?,?,'CONTENT','SOCIAL','VIDEO',1,?,'','NEW',?)`,uuid(),w.id,w.account.id,'Solicitud '+String(i).padStart(2,'0'),'2026-10-01T12:00:'+String(i).padStart(2,'0')+'.000Z');
  const first=contentData(w.db,w.account,w.company,new URLSearchParams('vista=solicitudes'));
  const second=contentData(w.db,w.account,w.company,new URLSearchParams('vista=solicitudes&pagina=1'));
  const third=contentData(w.db,w.account,w.company,new URLSearchParams('vista=solicitudes&pagina=2'));
  assert.equal(first.counts.open,45);assert.equal(first.rows.length,20);assert.equal(second.rows.length,20);assert.equal(third.rows.length,5);
  assert.equal(new Set([...first.rows,...second.rows,...third.rows].map(r=>r.id)).size,45);assert.equal(third.more,false);
  const filtered=contentData(w.db,w.account,w.company,new URLSearchParams('q=Solicitud+04'));assert.equal(filtered.counts.requests,1);assert.equal(filtered.rows.length,1);
  assert.equal((await w.client.get('/contenido?vista=noexiste')).status,404);
});

test('formularios de contenido y cortesía sin redes; solo se elige plataforma al publicar o medir',async t=>{
  const w=await setup(t);
  const normal=await w.client.get('/contenido?vista=solicitudes');assert.match(normal.body,/Nueva solicitud de contenido/);assert.doesNotMatch(normal.body,/name="platform|Publicar la misma pieza|Elegir redes/);
  assert.doesNotMatch((await w.client.get('/inicio')).body,/Publicar la misma pieza|name="platform/);
  assert.match((await w.client.get('/inicio')).body,/Abrir Contenido/);
  assert.equal((await w.client.get('/contenido?plataforma=TIKTOK')).location,'/contenido');
  const global=await w.admin.get('/contenido');assert.equal(global.status,200);assert.doesNotMatch(global.body,/Nueva solicitud de contenido/);
});

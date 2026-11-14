import { acceptedContract } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync,statSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { agency,colleague,owner,portal,browser,listen,close,password } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { openDatabase } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import { loadIntegration } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/wallet/integration.mjs';
import { createPortal } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/application/app.mjs';
import { uuid, localDay } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const when=days=>localDay(new Date(Date.now()-days*86400000));
const published=when(2)+'T09:00',observed=when(1)+'T09:00';
const platforms=['INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE'];
const social={type:'CONTENT',channel:'SOCIAL',service:'VIDEO',title:'Un mismo video',quantity:'1',brief:'El mismo material para todas las redes.'};
async function context(t){const world=await portal(t),admin=await agency(world),{client,id}=await owner(world,'Prueba de contenido','4');await admin.post('/agencia/clientes/verificar?empresa='+id);return {world,admin,client,id};}
const selected= (path,id)=>'/agencia'+path+'?empresa='+id;
async function produce(c,contract){const {world,admin,client,id}=c;const result=await client.post('/solicitudes',social);assert.equal(result.status,303);const path=result.location;await admin.post(selected(path+'/estado',id),{status:'APPROVED'});assert.equal((await admin.post(selected(path+'/piezas',id),{title:'Video común',...(contract?{contract}:{})})).status,303);const piece=world.db.get('SELECT * FROM pieces');const piecePath=path+'/piezas/'+piece.id;await admin.post(selected(piecePath+'/editar',id),{revision:String(piece.revision),status:'REVIEW',notes:'Lista para aprobación.'});return {path,piecePath,piece};}
test('una pieza, cuatro publicaciones y cuatro métricas consumen un solo cupo mensual',async t=>{
 const c=await context(t),{world,admin,client,id}=c;
 assert.equal((await admin.post('/planes',{name:'Contenido mensual',term:'MONTHLY',price:'100',wallet:'NONE',VIDEO:'1'})).status,303);
 const plan=world.db.get('SELECT id FROM plans').id;
 await acceptedContract(world,admin,client,id,plan);
 const contract=world.db.get('SELECT id FROM contracts').id;
 const {path,piecePath,piece}=await produce(c,contract);
 const revision=world.db.get('SELECT revision FROM pieces WHERE id=?',piece.id).revision;
 assert.equal((await client.post(piecePath+'/revisar',{revision:String(revision),status:'APPROVED'})).status,303);
 for(const [index,platform] of platforms.entries()){
   assert.equal((await admin.post(selected(piecePath+'/publicacion',id),{channel:platform,url:'https://example.test/'+platform,published})).status,303);
   const pub=world.db.get('SELECT id FROM publications WHERE channel=?',platform);
   assert.equal((await admin.post(selected(piecePath+'/medir',id),{publication:pub.id,observed,views:String(100+index),likes:String(index),comments:'0'})).status,303);
 }
 assert.equal(world.db.get('SELECT count(*) AS n FROM request_platforms').n,0);
 assert.equal(world.db.get('SELECT count(*) AS n FROM requests').n,1);assert.equal(world.db.get('SELECT count(*) AS n FROM pieces').n,1);assert.equal(world.db.get('SELECT count(*) AS n FROM publications').n,4);
 const view=await client.get(path);assert.equal(view.status,200);assert.match(view.body,/Contenido común/);assert.match(view.body,/cuenta una sola vez/);
 for(const platform of platforms)assert.ok(view.body.includes('https://example.test/'+platform));
 const reports=await client.get('/reportes?desde='+when(2)+'&hasta='+localDay());for(const count of [100,101,102,103])assert.match(reports.body,new RegExp('>'+count+'<'));
 const extra=await client.post('/solicitudes',{...social,title:'Otra pieza'});
 await admin.post(selected(extra.location+'/estado',id),{status:'APPROVED'});
 assert.equal((await admin.post(selected(extra.location+'/piezas',id),{title:'Fuera de cupo',contract})).status,409);
});
test('permisos por plataforma filtran métricas y no permiten aprobar globalmente una pieza compartida',async t=>{
 const c=await context(t),{world,client,admin,id}=c;
 const member=await colleague(world,client,{name:'Solo Instagram',document:'1744083856','INSTAGRAM.VIEW':'yes','INSTAGRAM.REQUEST':'yes','INSTAGRAM.APPROVE':'yes'});
 const {path,piecePath,piece}=await produce(c);
 const revision=world.db.get('SELECT revision FROM pieces WHERE id=?',piece.id).revision;
 assert.equal((await member.session.get(path)).status,200);
 assert.equal((await member.session.post(piecePath+'/revisar',{revision:String(revision),status:'APPROVED'})).status,403);
 assert.equal((await member.session.post('/solicitudes',social)).status,303);
 const oldFilter=await member.session.get('/contenido?plataforma=TIKTOK');assert.equal(oldFilter.status,303);assert.equal(oldFilter.location,'/contenido');
 await client.post(piecePath+'/revisar',{revision:String(revision),status:'APPROVED'});
 for(const channel of platforms)await admin.post(selected(piecePath+'/publicacion',id),{channel,url:'https://example.test/'+channel,published});
 const view=await member.session.get(path);assert.ok(view.body.includes('https://example.test/INSTAGRAM'));assert.ok(!view.body.includes('https://example.test/TIKTOK'));
 const onlyTikTok=await client.post('/solicitudes',{...social,title:'Video histórico TikTok',channel:'TIKTOK'});
 // Reproduce a destination stored by v042, before generic requests existed.
 const legacyId=onlyTikTok.location.split('/').pop();world.db.run('INSERT INTO request_platforms VALUES(?,?,?)',id,legacyId,'TIKTOK');
 assert.equal((await member.session.get(onlyTikTok.location)).status,404);
 assert.doesNotMatch((await member.session.get('/contenido')).body,/Video histórico TikTok/);
 const counts=await member.session.get('/inicio');assert.equal(counts.status,200);
});
test('diseño de marca es individual y WhatsApp IA no admite contratación anticipada',async t=>{
 const {world,admin,client}=await context(t);
 assert.equal((await client.post('/solicitudes',{...social,channel:'BRAND',service:'LOGO',title:'Logo nuevo'})).status,303);
 assert.equal(world.db.get("SELECT channel FROM requests WHERE service='LOGO'").channel,'BRAND');
 const offer={name:'Diseño de logo',term:'MONTHLY',price:'250',wallet:'NONE',LOGO:'1'};
 assert.equal((await admin.post('/planes',offer)).status,400);assert.equal((await admin.post('/planes',{...offer,term:'ONE_OFF'})).status,303);
 assert.equal((await client.post('/solicitudes',{...social,channel:'WHATSAPP',service:'AI'})).status,400);
 const page=await client.get('/proximamente');assert.equal(page.status,200);assert.match(page.body,/no está disponible para contratar/);
 for(const service of ['WEBSITE','STORE','CATALOG','MENU','BOOKING','LANDING','MAINTENANCE'])assert.equal((await client.post('/solicitudes',{...social,channel:'WEB',service})).status,303);
 for(const service of ['MAPS_PROFILE','MAPS_INFO','MAPS_PHOTO','MAPS_RESPONSES','MAPS_PERFORMANCE'])assert.equal((await client.post('/solicitudes',{...social,channel:'MAPS',service})).status,303);
});
test('formularios antiguos crean contenido común sin destinos y la ruta de añadir plataformas está retirada',async t=>{
 const {world,admin,client,id}=await context(t);
 for(const channel of ['SOCIAL',...platforms]){
  const res=await client.post('/solicitudes',{...social,channel,'platform.INSTAGRAM':'yes','platform.TIKTOK':'yes'});
  assert.equal(res.status,303);
  const request=world.db.get('SELECT * FROM requests WHERE id=?',res.location.split('/').pop());
  assert.equal(request.channel,'SOCIAL');
  assert.equal((await admin.post(selected(res.location+'/plataformas',id),{revision:String(request.revision),'platform.YOUTUBE':'yes'})).status,404);
  assert.equal((await client.post(res.location+'/plataformas',{'platform.YOUTUBE':'yes'})).status,404);
 }
 assert.equal(world.db.get('SELECT count(*) AS n FROM requests').n,5);
 assert.equal(world.db.get('SELECT count(*) AS n FROM request_platforms').n,0);
});
test('solicitudes, contenido y cortesía no solicitan una red; enlaces antiguos llevan al contenido común',async t=>{
 const {world,admin,client,id}=await context(t);
 for(const path of ['/inicio','/solicitudes','/solicitudes?canal=SOCIAL','/contenido']){
  const view=await client.get(path);assert.equal(view.status,200);
  assert.doesNotMatch(view.body,/name="platform\.|data-platforms|content-platform-tabs|Publicar la misma pieza|dónde publicarás/);
  for(const platform of platforms)assert.doesNotMatch(view.body,new RegExp('<option[^>]*value="'+platform+'"'));
 }
 for(const channel of platforms){
  const res=await client.get('/canales/'+channel.toLowerCase());assert.equal(res.status,303);assert.equal(res.location,'/contenido');
 }
 const query=await admin.get('/contenido?empresa='+id+'&plataforma=INSTAGRAM');assert.equal(query.location,'/contenido?empresa='+id);
 for(const type of ['CONTENT','QUOTE','VISIT']){
  const res=await client.post('/solicitudes',{...social,type,...(type==='VISIT'?{preferred:published}:{})});assert.equal(res.status,303);
 }
 assert.equal(world.db.get('SELECT count(*) AS n FROM request_platforms').n,0);
 const view=await client.get('/contenido');assert.match(view.body,/Un mismo video/);
});
test('cortesía sin destinos permite publicar después, conserva gratuidad y no se duplica',async t=>{
 const {world,admin,client,id}=await context(t);
 const gift={type:'COURTESY',channel:'SOCIAL',service:'VIDEO',title:'Nuestro primer video',brief:'Mostrar la cocina'};
 const first=await client.post('/solicitudes',gift);assert.equal(first.status,303);
 assert.equal((await client.post('/solicitudes',gift)).location,first.location);
 assert.equal(world.db.get("SELECT count(*) AS n FROM requests WHERE type='COURTESY'").n,1);
 const giftId=first.location.split('/').pop();
 assert.equal(world.db.get('SELECT count(*) AS n FROM request_platforms').n,0);
 await admin.post(selected(first.location+'/estado',id),{status:'APPROVED'});
 await admin.post(selected(first.location+'/piezas',id),{title:'Video de bienvenida'});
 const piece=world.db.get('SELECT * FROM pieces WHERE request_id=?',giftId),path=first.location+'/piezas/'+piece.id;
 assert.equal(piece.contract_id,null);
 const draft=await admin.get(selected(first.location,id));assert.doesNotMatch(draft.body,/Registrar publicación|Añadir plataformas/);
 assert.equal((await admin.post(selected(path+'/publicacion',id),{channel:'YOUTUBE',url:'https://example.test/gift',published})).status,409);
 await admin.post(selected(path+'/editar',id),{revision:String(piece.revision),status:'REVIEW'});
 await client.post(path+'/revisar',{revision:String(world.db.get('SELECT revision FROM pieces WHERE id=?',piece.id).revision),status:'APPROVED'});
 const approved=await admin.get(selected(first.location,id));assert.match(approved.body,/Registrar publicación/);assert.match(approved.body,/>Red social</);
 assert.doesNotMatch(approved.body,/Añadir plataformas|name="platform\./);
 for(const channel of platforms)assert.equal((await admin.post(selected(path+'/publicacion',id),{channel,url:'https://example.test/gift/'+channel,published})).status,303);
 assert.equal(world.db.get('SELECT count(*) AS n FROM pieces').n,1);
 assert.equal(world.db.get('SELECT count(*) AS n FROM publications').n,4);
 assert.equal(world.db.get('SELECT count(*) AS n FROM request_platforms').n,0);
 assert.equal(world.db.get('SELECT count(*) AS n FROM contracts').n,0);
});
test('aprobar contenido común requiere autorización explícita y mantiene aislamiento por negocio',async t=>{
 const c=await context(t),{world,client,admin,id}=c;
 const reader=await colleague(world,client,{name:'Lectura redes',document:'1756845671','TIKTOK.VIEW':'yes'});
 const reviewer=await colleague(world,client,{name:'Revisión contenido',document:'1756287650','SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});
 const {path,piecePath,piece}=await produce(c);
 assert.equal((await reader.session.get(path)).status,200);
 assert.equal((await reader.session.post('/solicitudes',social)).status,403);
 const stranger=await owner(world,'Otro negocio','8');
 assert.equal((await stranger.client.get(path)).status,404);
 assert.equal((await stranger.client.post(piecePath+'/revisar',{revision:'1',status:'APPROVED'})).status,404);
 assert.equal((await reader.session.post(piecePath+'/revisar',{revision:'1',status:'APPROVED'})).status,403);
 assert.equal((await reviewer.session.post(piecePath+'/revisar',{revision:String(world.db.get('SELECT revision FROM pieces WHERE id=?',piece.id).revision),status:'APPROVED'})).status,303);
 assert.equal((await reader.session.post(piecePath+'/publicacion',{channel:'TIKTOK',url:'https://example.test/not-allowed',published})).status,403);
 assert.equal(world.db.get('SELECT count(*) AS n FROM publications').n,0);
});
test('publicación y medición validan red, fecha y enlace sin exigir destinos anticipados',async t=>{
 const c=await context(t),{world,admin,client,id}=c;const {path,piecePath,piece}=await produce(c);
 await client.post(piecePath+'/revisar',{revision:String(world.db.get('SELECT revision FROM pieces WHERE id=?',piece.id).revision),status:'APPROVED'});
 const data={channel:'TIKTOK',url:'https://example.test/live',published};
 for(const change of [{channel:''},{channel:'SOCIAL'},{channel:'WHATSAPP'},{url:'http://example.test/video'},{published:'2099-12-01T09:00'}])assert.equal((await admin.post(selected(piecePath+'/publicacion',id),{...data,...change})).status,400);
 assert.equal(world.db.get('SELECT count(*) AS n FROM publications').n,0);
 assert.equal((await admin.post(selected(piecePath+'/publicacion',id),data)).status,303);
 assert.equal((await admin.post(selected(piecePath+'/publicacion',id),data)).status,409);
 const pub=world.db.get('SELECT * FROM publications');assert.equal(pub.piece_id,piece.id);
 assert.equal((await admin.post(selected(piecePath+'/medir',id),{publication:pub.id,observed,views:'400',likes:'25',comments:'3'})).status,303);
 const detail=await client.get(path);assert.match(detail.body,/https:\/\/example.test\/live/);assert.match(detail.body,/>400</);
 assert.equal(world.db.get('SELECT count(*) AS n FROM request_platforms').n,0);
});
test('migración v1 conserva IDs, vínculos Wallet, cupos, publicaciones, evidencias y permisos sin ampliarlos',()=>{
 const folder=mkdtempSync(join(tmpdir(),'lumina-migrate-')),path=join(folder,'agency.sqlite');
 try{
  const original=new DatabaseSync(path);original.exec(readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/schema.sql',import.meta.url),'utf8'));original.exec('PRAGMA user_version=1');
  const company=uuid(),account=uuid(),request=uuid(),piece=uuid(),pub=uuid(),tenant=uuid();
  original.prepare('INSERT INTO companies(id,name,registration_key,document_hint,phone,approved,loyalty_tenant,loyalty_name,created_at) VALUES(?,?,?,?,?,1,?,?,?)').run(company,'Persistente','opaque','1234','0990000000',tenant,'Existente','2026-10-01');
  original.prepare("INSERT INTO accounts(id,company_id,name,email,kind) VALUES(?,?,?,?,'COLLABORATOR')").run(account,company,'Persona','1703682060');
  original.prepare('INSERT INTO grants VALUES(?,?,?)').run(account,'INSTAGRAM','VIEW');
  original.prepare("INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,created_at) VALUES(?,?,?,'CONTENT','INSTAGRAM','VIDEO',1,'Video','Común','PRODUCTION','2026-10-01')").run(request,company,account);
  original.prepare("INSERT INTO pieces(id,company_id,request_id,title,service,status,observations,created_at) VALUES(?,?,?,'Video','VIDEO','APPROVED','Historico','2026-10-01')").run(piece,company,request);
  original.prepare('INSERT INTO publications VALUES(?,?,?,?,?,?)').run(pub,company,piece,'YOUTUBE','https://example.test/original','2026-10-01');
  original.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?)').run(uuid(),company,piece,'Master','https://example.test/video','2026-10-01');
  const initial=original.prepare('SELECT * FROM publications').all();original.close();
  let db=openDatabase(path);
  assert.equal(db.get('SELECT channel FROM requests').channel,'SOCIAL');assert.equal(db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,tenant);
  assert.deepEqual(db.all('SELECT * FROM publications'),initial);assert.equal(db.get('SELECT id FROM pieces').id,piece);assert.equal(db.get('SELECT count(*) AS n FROM evidence').n,1);
  assert.deepEqual(db.all('SELECT scope,action FROM grants').map(x=>({...x})),[{scope:'INSTAGRAM',action:'VIEW'}]);
  assert.deepEqual(db.all('SELECT platform FROM request_platforms ORDER BY platform').map(x=>x.platform),['INSTAGRAM','YOUTUBE']);db.close();
  const backups=readdirSync(join(folder,'migrations'));assert.equal(backups.length,1);assert.equal(statSync(join(folder,'migrations',backups[0])).mode&0o777,0o600);
  const snapshot=new DatabaseSync(join(folder,'migrations',backups[0]),{readOnly:true});assert.equal(snapshot.prepare('PRAGMA user_version').get().user_version,1);snapshot.close();
  db=openDatabase(path);assert.equal(db.get('SELECT count(*) AS n FROM request_platforms').n,2);db.close();assert.equal(readdirSync(join(folder,'migrations')).length,1);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('acceso único persiste cifrado al reiniciar servidor y no crea otro empleado',async t=>{
 const loyalty=await fakeLoyalty(t),folder=mkdtempSync(join(tmpdir(),'lumina-restart-')),key=randomBytes(32),integration={platformToken:loyalty.platformToken},path=join(folder,'agency.sqlite');
 let db=openDatabase(path),server=createPortal({db,key,loyaltyUrl:loyalty.origin,integration}),origin=await listen(server);
 try{
  const world={db,session:()=>browser(origin)};const admin=await agency(world),{client,id}=await owner(world,'Persistencia Wallet','2');
  await admin.post('/agencia/clientes/verificar?empresa='+id);await client.get('/wallet');
  const original={...db.get('SELECT * FROM wallet_access')};await close(server);db.close();
  db=openDatabase(path);server=createPortal({db,key,loyaltyUrl:loyalty.origin,integration});origin=await listen(server);
  const session=browser(origin);await session.post('/entrar',{document:'1755536693',password});await session.get('/inicio');
  assert.equal((await session.get('/wallet-api/api/staff/wallet-design')).status,200);
  assert.deepEqual({...db.get('SELECT * FROM wallet_access')},original);
  assert.equal([...loyalty.staff.values()].filter(p=>p.requestId===original.request_id).length,1);
 }finally{await close(server);db.close();rmSync(folder,{recursive:true,force:true});}
});
test('configuración interna usa solo .env privado, sin evaluar texto, y verifica destino',()=>{
 const folder=mkdtempSync(join(tmpdir(),'lumina-config-')),old=process.env.LUMINA_LOYALTY_ADMIN_TOKEN;
 delete process.env.LUMINA_LOYALTY_ADMIN_TOKEN;
 try{
  assert.deepEqual(loadIntegration('http://127.0.0.1:8097',folder),{});
  const path=join(folder,'.env');
  for(const length of [32,43,48,64,128]){
    const token='x'.repeat(length);
    writeFileSync(path,`STAGING_ADMIN_TOKEN=${token}\nLOYALTY_HTTP_PORT=8097\nUNRELATED=$(bad command)\n`,{mode:0o600});
    assert.equal(loadIntegration('http://127.0.0.1:8097',folder).platformToken,token);
    process.env.LUMINA_LOYALTY_ADMIN_TOKEN=token;
    assert.equal(loadIntegration('http://127.0.0.1:8097',folder).platformToken,token);
    delete process.env.LUMINA_LOYALTY_ADMIN_TOKEN;
  }
  for(const token of ['x'.repeat(31),'x'.repeat(129),'x'.repeat(43)+'!']){
    writeFileSync(path,`STAGING_ADMIN_TOKEN=${token}\nLOYALTY_HTTP_PORT=8097\n`,{mode:0o600});
    assert.throws(()=>loadIntegration('http://127.0.0.1:8097',folder));
    process.env.LUMINA_LOYALTY_ADMIN_TOKEN=token;
    assert.throws(()=>loadIntegration('http://127.0.0.1:8097',folder));
    delete process.env.LUMINA_LOYALTY_ADMIN_TOKEN;
  }
  writeFileSync(path,`STAGING_ADMIN_TOKEN=${'x'.repeat(48)}\nLOYALTY_HTTP_PORT=8097\n`,{mode:0o600});
  assert.throws(()=>loadIntegration('http://127.0.0.1:8096',folder));
  rmSync(path);symlinkSync('/tmp/never-read',path);assert.throws(()=>loadIntegration('http://127.0.0.1:8097',folder));
 }finally{if(old!==undefined)process.env.LUMINA_LOYALTY_ADMIN_TOKEN=old;rmSync(folder,{recursive:true,force:true});}
});

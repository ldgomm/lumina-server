import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { agency, colleague, owner, portal } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { getSession } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import { businessOverview } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/overview.mjs';
import { openDatabase } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import { uuid, localDay } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const idea={type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Idea de prueba',brief:'Una idea concreta.',phone:'0987654321',contact_version:'1'};
const id=r=>r.location.split('?')[0].split('/').at(-1);
const actor=(w,client=w.client)=>getSession(w.db,client.cookie.split('=')[1]);
const work=(w,path)=>'/agencia'+path+'?empresa='+w.id;
async function setup(t){const loyalty=await fakeLoyalty(t),w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken}),admin=await agency(w),o=await owner(w,'Negocio ficticio','1');await admin.post('/agencia/clientes/verificar?empresa='+o.id);return {...w,...o,admin,loyalty};}
async function request(w,extra={}){const r=await w.client.post('/solicitudes',{...idea,...extra});assert.equal(r.status,303,r.body);return r;}
async function offer(w){assert.equal((await w.admin.post('/planes',{name:'Video de prueba',offer_kind:'INDIVIDUAL',individual_service:'VIDEO',term:'ONE_OFF',price:'25.50',wallet:'NONE'})).status,303);return w.db.get('SELECT id FROM plans').id;}
async function review(w,title,platforms=[]){const r=await request(w,{title});assert.equal((await w.admin.post(work(w,r.location+'/estado'),{status:'APPROVED'})).status,303);assert.equal((await w.admin.post(work(w,r.location+'/piezas'),{title:'Entrega '+title})).status,303);const p=w.db.get('SELECT * FROM pieces WHERE request_id=?',id(r));assert.equal((await w.admin.post(work(w,r.location+'/piezas/'+p.id+'/editar'),{revision:String(p.revision),status:'REVIEW',notes:''})).status,303);for(const platform of platforms)w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,id(r),platform);return r;}

test('solicitudes simples precargan teléfono, conservan tres formatos sociales y reducen las demás áreas',async t=>{
 const w=await setup(t);
 for(const [area,codes] of Object.entries({SOCIAL:['VIDEO','PHOTO','GRAPHIC'],WEB:['WEBSITE','MAINTENANCE'],WALLET:['WALLET'],MAPS:['MAPS_PROFILE'],BRAND:['IDENTITY']})){
  const page=await w.client.get('/solicitudes/nueva?area='+area);assert.equal(page.status,200);assert.match(page.body,/name="phone"[^>]*required[^>]*value="0991234567"/);assert.match(page.body,/name="contact_version" value="1"/);
  assert.deepEqual([...page.body.matchAll(/name="service" value="([^"]+)"/g)].map(m=>m[1]),codes);
  assert.match(page.body,/<details class="request-options">/);assert.doesNotMatch(page.body,/name="platform/);
 }
 for(const path of ['/inicio','/contenido?vista=solicitudes','/contenido/grabacion'])assert.match((await w.client.get(path)).body,/name="phone"[^>]*value="0991234567"/);
});

test('teléfono de cada solicitud se conserva al cambiar el contacto del negocio y permite llamar',async t=>{
 const w=await setup(t),r=await request(w,{phone:'+593 98 765 4321'});assert.equal(w.db.get('SELECT contact_phone FROM requests WHERE id=?',id(r)).contact_phone,'+593 98 765 4321');
 w.db.run("UPDATE companies SET phone='022222222' WHERE id=?",w.id);
 for(const client of [w.client,w.admin]){const page=await client.get(r.location+(client===w.admin?'?empresa='+w.id:''));assert.match(page.body,/href="tel:\+593987654321"/);assert.match(page.body,/\+593 98 765 4321/);}
 assert.equal((await w.admin.post(work(w,'/solicitudes'),idea)).status,403);
});

test('teléfono vacío o inválido conserva el borrador escapado y no crea solicitudes',async t=>{
 const w=await setup(t);
 for(const phone of ['', 'abc1234567','+593<script>','1234567890123456']){
  const r=await w.client.post('/solicitudes',{...idea,phone,title:'Idea <b>privada</b>',brief:'Texto <img src=x>',quantity:'3'});
  assert.equal(r.status,400);assert.match(r.body,/role="alert"/);assert.match(r.body,/Idea &lt;b&gt;privada/);assert.match(r.body,/Texto &lt;img/);assert.match(r.body,/name="quantity"[^>]*value="3"/);assert.match(r.body,/<details class="request-options" open>/);assert.doesNotMatch(r.body,/<script>.*593/);
 }
 assert.equal(w.db.get('SELECT count(*) n FROM requests').n,0);
 assert.equal((await w.client.post('/solicitudes',{...idea,phone:undefined})).status,400);
});

test('cortesía valida teléfono, conserva error y sigue siendo única sin plataformas',async t=>{
 const w=await setup(t),data={...idea,type:'COURTESY',title:'Mi primer video'};
 const bad=await w.client.post('/solicitudes',{...data,phone:''});assert.equal(bad.status,400);assert.match(bad.body,/value="Mi primer video"/);assert.match(bad.body,/name="type" value="COURTESY"/);
 const good=await w.client.post('/solicitudes',data),again=await w.client.post('/solicitudes',{...data,phone:'0991111111'});assert.equal(good.status,303);assert.equal(again.location,good.location);assert.equal(w.db.get('SELECT contact_phone FROM requests').contact_phone,data.phone);assert.equal(w.db.get('SELECT count(*) n FROM request_platforms').n,0);
});

test('grabación guarda contacto y horario sugerido, no inventa una visita confirmada',async t=>{
 const w=await setup(t),r=await request(w,{type:'VISIT',preferred:'2099-03-10T09:30'}),saved=w.db.get('SELECT * FROM requests WHERE id=?',id(r));
 assert.equal(saved.contact_phone,idea.phone);assert.equal(saved.requested_at,'2099-03-10T14:30:00.000Z');assert.equal(w.db.get('SELECT count(*) n FROM visits').n,0);
});

test('contratación conserva selección, notas y clave cuando el teléfono falla; reintento no duplica',async t=>{
 const w=await setup(t),plan=await offer(w),key=uuid(),data={key,['qty_'+plan]:'3',notes:'Nota <b>del cliente</b>',phone:'',contact_version:'1'};
 const bad=await w.client.post('/planes/solicitar',data);assert.equal(bad.status,400);assert.match(bad.body,new RegExp('name="qty_'+plan+'"[^>]*value="3"'));assert.match(bad.body,new RegExp('name="key" value="'+key+'"'));assert.match(bad.body,/Nota &lt;b&gt;del cliente/);assert.equal(w.db.get('SELECT count(*) n FROM package_orders').n,0);
 const good=await w.client.post('/planes/solicitar',{...data,phone:idea.phone});assert.equal(good.status,303);const repeat=await w.client.post('/planes/solicitar',{...data,phone:'0991111111'});assert.equal(repeat.location,good.location);
 assert.equal(w.db.get('SELECT contact_phone FROM package_orders').contact_phone,idea.phone);assert.equal(w.db.get('SELECT count(*) n FROM package_orders').n,1);assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);assert.match((await w.client.get(good.location)).body,/href="tel:0987654321"/);
});

test('formularios anteriores conservan compatibilidad usando el contacto registrado sin modificar el perfil',async t=>{
 const w=await setup(t),{phone,contact_version,...legacy}=idea;const r=await w.client.post('/solicitudes',legacy);assert.equal(r.status,303);assert.equal(w.db.get('SELECT contact_phone FROM requests').contact_phone,'0991234567');
 const p=await offer(w);assert.equal((await w.client.post('/planes/solicitar',{key:uuid(),['qty_'+p]:'1'})).status,303);assert.equal(w.db.get('SELECT contact_phone FROM package_orders').contact_phone,'0991234567');assert.equal(w.db.get('SELECT phone FROM companies WHERE id=?',w.id).phone,'0991234567');
});

test('inicio reúne pendientes reales, propuesta y próxima visita con enlaces directos',async t=>{
 const w=await setup(t),r=await review(w,'Revisar mi entrega'),quote=await request(w,{title:'Cotizar mi idea',type:'QUOTE'});
 assert.equal((await w.admin.post(work(w,quote.location+'/cotizar'),{amount:'42.30',terms:'Producción de prueba y entrega.'})).status,303);
 const visit=await request(w,{title:'Grabar la fachada',type:'VISIT'});assert.equal((await w.admin.post(work(w,visit.location+'/visitas'),{starts:'2099-03-10T09:30',place:'Lugar de prueba',notes:''})).status,303);
 const p=await offer(w),order=await w.client.post('/planes/solicitar',{key:uuid(),['qty_'+p]:'1'}),line=w.db.get('SELECT * FROM package_order_lines');
 assert.equal((await w.admin.post(work(w,order.location+'/cotizar'),{revision:'1',terms:'Alcance de prueba completo',['price_'+line.id]:'25.50',['start_'+line.id]:localDay(),['end_'+line.id]:localDay()})).status,303);
 const view=businessOverview(w.db,actor(w),w.id);assert.equal(view.reviews.length,1);assert.equal(view.quotes.length,1);assert.equal(view.proposals.length,1);assert.equal(view.nextVisit.title,'Grabar la fachada');
 const page=await w.client.get('/inicio');assert.match(page.body,/Necesita tu atención/);assert.match(page.body,/attention-count">3/);assert.match(page.body,/href="\/wallet"/);assert.match(page.body,/href="\/contenido"/);assert.doesNotMatch(page.body,/wallet-entry-banner|content-entry/);
 await w.client.post(quote.location+'/aceptar',{quote:w.db.get('SELECT id FROM quotes').id});assert.equal(businessOverview(w.db,actor(w),w.id).quotes.length,0);
});

test('pendientes del colaborador respetan aprobación común y destinos históricos, sin propuestas comerciales',async t=>{
 const w=await setup(t);await review(w,'Pieza común');await review(w,'Pieza compartida',['INSTAGRAM','TIKTOK']);await review(w,'Pieza Instagram',['INSTAGRAM']);
 const limited=await colleague(w,w.client,{name:'Revisor',email:'review@example.test','INSTAGRAM.VIEW':'yes','INSTAGRAM.APPROVE':'yes'});
 let result=businessOverview(w.db,actor(w,limited.session),w.id);assert.deepEqual(result.reviews.map(r=>r.title),['Pieza Instagram']);assert.deepEqual(result.quotes,[]);assert.deepEqual(result.proposals,[]);
 const whole=await colleague(w,w.client,{name:'Revisor general',email:'allreview@example.test','SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});assert.equal(businessOverview(w.db,actor(w,whole.session),w.id).reviews.length,3);
 assert.equal((await w.client.post('/equipo/'+whole.id+'/permisos',{revision:String(w.db.get('SELECT revision FROM accounts WHERE id=?',whole.id).revision),'SOCIAL.VIEW':'yes'})).status,303);assert.equal(businessOverview(w.db,actor(w,whole.session),w.id).reviews.length,0);
});

test('inicio no filtra información entre negocios ni muestra acciones de cliente a la agencia',async t=>{
 const w=await setup(t),other=await owner(w,'Negocio separado','2');await other.client.post('/solicitudes',{...idea,title:'CONFIDENCIAL_OTRO_NEGOCIO'});
 assert.doesNotMatch((await w.client.get('/inicio?empresa='+other.id)).body,/CONFIDENCIAL_OTRO_NEGOCIO/);
 assert.throws(()=>businessOverview(w.db,actor(w),other.id),e=>e.status===403);
 assert.throws(()=>businessOverview(w.db,actor(w,w.admin),w.id),e=>e.status===403);
 const page=await w.admin.get('/inicio?empresa='+w.id);assert.equal(page.status,200);assert.doesNotMatch(page.body,/action="\/solicitudes|Solicitar un servicio|name="phone"|Necesita tu atención/);
});

test('inicio sin permisos no ofrece funciones de otro rol ni mensajes de aprobación',async t=>{
 const w=await setup(t),member=await colleague(w,w.client,{name:'Sin permisos',email:'none@example.test'});const page=await member.session.get('/inicio');assert.equal(page.status,200);assert.match(page.body,/Acceso pendiente/);assert.doesNotMatch(page.body,/Necesita tu atención|home-module|Solicitar un servicio/);
});

test('migración v4 a v5 guarda respaldo privado, mantiene vínculos y datos, y no inventa contactos históricos',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lumina-contact-')),path=join(dir,'agency.sqlite');
 try{
  let raw=new DatabaseSync(path);for(const file of ['schema.sql','migrations/002_unified.sql','migrations/003_onboarding.sql','migrations/004_packages.sql'])raw.exec(readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/'+file,import.meta.url),'utf8'));raw.exec('PRAGMA user_version=4');
  const company=uuid(),account=uuid(),requestId=uuid();raw.prepare('INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at,loyalty_tenant) VALUES(?,?,?,?,?,?,?)').run(company,'Anterior','private','1234','0990000000','2026-10-01',uuid());raw.prepare("INSERT INTO accounts(id,company_id,kind,name,email,password) VALUES(?,?,'OWNER',?,?,?)").run(account,company,'Dueño','old@example.test','hash');
  raw.prepare("INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,created_at) VALUES(?,?,?,'CONTENT','SOCIAL','REEL',2,'Original','Sin cambios','DELIVERED','2026-10-01')").run(requestId,company,account);
  const before=raw.prepare('SELECT * FROM requests').get(),business=raw.prepare('SELECT * FROM companies').get();raw.close();
  let db=openDatabase(path);assert.equal(db.get('PRAGMA user_version').user_version,5);const after=db.get('SELECT * FROM requests');assert.equal(after.contact_phone,null);for(const key of Object.keys(before))assert.deepEqual(after[key],before[key]);assert.deepEqual(db.get('SELECT * FROM companies'),business);db.close();
  const backups=readdirSync(join(dir,'migrations'));assert.equal(backups.length,1);const backup=join(dir,'migrations',backups[0]);assert.equal(statSync(backup).mode&0o777,0o600);raw=new DatabaseSync(backup,{readOnly:true});assert.equal(raw.prepare('PRAGMA user_version').get().user_version,4);assert.deepEqual(raw.prepare('SELECT * FROM requests').get(),before);raw.close();
  db=openDatabase(path);assert.deepEqual(db.get('SELECT * FROM requests'),after);db.close();assert.equal(readdirSync(join(dir,'migrations')).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('redes de Lúmina apuntan a luminadigital360 en las tres superficies y usan los iconos suministrados',async t=>{
 const w=await setup(t);for(const path of ['/inicio','/contenido','/wallet']){
  const p=await w.client.get(path);assert.equal(p.status,200);assert.match(p.body,/href="https:\/\/www.instagram.com\/luminadigital360\/"/);assert.match(p.body,/href="https:\/\/www.tiktok.com\/@luminadigital360"/);assert.match(p.body,/rel="noopener noreferrer"/);assert.match(p.body,/\/assets\/practical.css/);
 }
 for(const [asset,mime] of [['instagram.webp','image/webp'],['tiktok.jpg','image/jpeg'],['practical.css','text/css']]){const r=await w.client.get('/assets/'+asset);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(mime));}
});

test('navegación selecciona solo la página más específica y no ofrece activar planes históricos',async t=>{
 const w=await setup(t),page=await w.client.get('/gestion/informes');assert.equal(page.status,200);assert.equal((page.body.match(/aria-current="page"/g)||[]).length,1);assert.match(page.body,/href="\/gestion\/informes" aria-current="page"/);
 const p=await offer(w),r=await request(w,{type:'PLAN',plan:p});await w.admin.post(work(w,r.location+'/estado'),{status:'APPROVED'});const detail=await w.admin.get(work(w,r.location));assert.equal(detail.status,200);assert.doesNotMatch(detail.body,/action="[^\"]*\/planes\/activar|Activar este plan/);assert.match(detail.body,/mediante una propuesta aceptada por el dueño/);
});

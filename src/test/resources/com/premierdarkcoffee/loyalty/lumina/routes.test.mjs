import test from 'node:test';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalPath, canonicalTarget } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/routes.mjs';
import { portal, agency, owner, colleague, password } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
const target=value=>canonicalTarget(new URL(value,'https://lumina.test'));
const request={type:'CONTENT',channel:'SOCIAL',service:'VIDEO',title:'Una idea sin plataforma',quantity:'1',phone:'0991234567'};

test('legacy route migration covers nested agency, team, account, billing and Wallet navigation',()=>{
 for(const [before,after] of Object.entries({
 '/entrar':'/login','/registro':'/register','/planes':'/plans','/cuenta/sesiones/cerrar':'/account/sessions/close',
 '/agencia/solicitudes/123/piezas/456/revisar':'/agency/requests/123/pieces/456/review',
 '/equipo/123/caja/guardar':'/team/123/cashier/save','/administracion/negocios/123/pago':'/admin/businesses/123/payment',
 '/gestion/sucursales':'/management/branches','/wallet/gestion':'/wallet/management','/salud/listo':'/health/ready',
 '/assets/caja.js':'/assets/cashier.js','/caja-assets/api.js':'/cashier-assets/api.js'
 }))assert.equal(canonicalPath(before),after);
});
test('canonical URLs translate filters and preserve free text and exact identifiers',()=>{
 const url=target('/contenido?empresa=id-001&vista=metricas&desde=2026-11-01&hasta=2026-11-14&q=registro%20de%20visitas');
 assert.equal(url.pathname,'/content');assert.equal(url.searchParams.get('company'),'id-001');assert.equal(url.searchParams.get('view'),'metrics');assert.equal(url.searchParams.get('q'),'registro de visitas');assert.equal(url.searchParams.get('from'),'2026-11-01');
 assert.equal(target('/content?view=calendar&period=pendientes').search,'?view=calendar&period=pending');
 assert.equal(target('/team/123?guardado=caja').search,'?saved=cashier');
 assert.equal(target('/plans?view=agreements').href,'https://lumina.test/plans?view=agreements');
});
test('conflicting legacy and canonical filters fail before selecting a business',()=>{
 for(const path of ['/content?empresa=one&company=two','/content?company=one&company=two','/content?vista=agenda&view=metrics'])assert.throws(()=>target(path),e=>e.status===400);
 assert.equal(target('/content?empresa=one&company=one&vista=agenda&view=calendar').search,'?company=one&view=calendar');
});
test('public QR slugs, provider routes and opaque tokens never undergo translation',()=>{
 for(const path of ['/join/registro?token=entrada%2Fplanes','/api/apple/v1/devices/registro/registrations/planes/entrar?passesUpdatedSince=123','/wallet-api/api/staff/members/registro?search=entrar','/loyalty-assets/planes.svg','/other/entrar'])assert.equal(target(path).pathname+target(path).search,path);
});
test('login is a GET page and an old bookmark opens its English equivalent',async t=>{
 const w=await portal(t),s=w.session();
 const page=await s.get('/login');assert.equal(page.status,200);assert.match(page.body,/action="\/login"/);assert.match(page.body,/Ingresa a Lúmina/);assert.doesNotMatch(page.body,/action="\/entrar"/);
 const old=await s.get('/entrar');assert.equal(old.status,303);assert.equal(old.location,'/login');assert.equal(w.db.get('SELECT count(*) n FROM accounts').n,0);
 const login=await s.post('/login',{document:'1748225842',password:'wrong'});assert.equal(login.status,401);assert.doesNotMatch(login.body,/value="wrong"/);
});
test('legacy registration and login preserve account identity and opt-in service activation',async t=>{
 const w=await portal(t),s=w.session();
 assert.equal((await s.post('/registro',{company:'Registro compatible',category:'RESTAURANT',name:'Persona ficticia',document:'1748225842',ruc:'1748225842001',phone:'0991234567',password,consent:'yes'})).status,303);
 assert.equal(w.db.get('SELECT count(*) n FROM accounts').n,1);assert.equal(w.db.get("SELECT count(*) n FROM company_services WHERE status='ACTIVE'").n,0);
 const id=w.db.get('SELECT id FROM accounts').id;
 const other=w.session();assert.equal((await other.post('/entrar',{document:'1748225842',password})).status,303);assert.equal(w.db.get('SELECT id FROM accounts').id,id);
});
test('cached request forms keep CSRF, business ownership and their original payload',async t=>{
 const w=await portal(t),admin=await agency(w),a=await owner(w,'Solicitudes compatibles',1);
 const before=w.db.get('SELECT count(*) n FROM requests').n;
 assert.equal((await a.client.post('/solicitudes',{...request,_csrf:'wrong'})).status,403);assert.equal(w.db.get('SELECT count(*) n FROM requests').n,before);
 const response=await a.client.post('/solicitudes',request);assert.equal(response.status,303);assert.match(response.location,/^\/requests\//);
 const stored=w.db.get('SELECT * FROM requests');assert.equal(stored.company_id,a.id);assert.equal(stored.title,request.title);
 assert.equal((await admin.post('/solicitudes?empresa='+a.id,request)).status,403);assert.equal((await admin.post('/agencia/solicitudes?empresa='+a.id,request)).status,403);
 assert.equal(w.db.get('SELECT count(*) n FROM requests').n,before+1);
});
test('legacy deep links retain consultation scope without granting owner privileges',async t=>{
 const w=await portal(t),admin=await agency(w),a=await owner(w,'Consulta compatible',1),b=await owner(w,'Otro negocio',2);
 const old=await admin.get('/contenido?empresa='+a.id+'&vista=solicitudes');assert.equal(old.status,303);
 const page=await admin.get(old.location);assert.equal(page.status,200);assert.match(page.body,/Solo lectura/);assert.doesNotMatch(page.body,/form method="post"/);
 const ownTeam=await b.client.get('/team?company='+a.id);assert.equal(ownTeam.status,200);assert.match(ownTeam.body,/Otro negocio/);assert.doesNotMatch(ownTeam.body,/Consulta compatible/);
 assert.equal((await admin.get('/content?empresa='+a.id+'&company='+b.id)).status,400);
});
test('health probes and cached assets keep their response types across the route migration',async t=>{
 const w=await portal(t),s=w.session();
 for(const path of ['/salud','/salud/listo','/health','/health/ready']){const r=await s.get(path);assert.equal(r.status,200);assert.equal(JSON.parse(r.body).status,'UP');assert.equal(r.location,null);}
 const asset=await s.get('/assets/caja.js'),current=await s.get('/assets/cashier.js');assert.equal(asset.status,200);assert.equal(asset.body,current.body);assert.match(asset.headers.get('content-type'),/javascript/);
});
test('generated links and forms use English paths for agency owner and collaborator',async t=>{
 const fake=await fakeLoyalty(t),w=await portal(t,fake.origin,{platformToken:fake.platformToken}),admin=await agency(w),a=await owner(w,'Navegación en inglés',1),member=await colleague(w,a.client,{name:'Colaborador',document:'1712423381','SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes'});
 const legacy=JSON.parse(readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/legacy-routes.json',import.meta.url),'utf8'));
 for(const session of [admin,a.client,member.session])for(const path of ['/account','/content','/requests','/help',session===admin?'/teams':session===a.client?'/team':'/home',session===member.session?'/content?view=calendar':'/plans']){
  const selected=session===admin&&path==='/requests'?path+'?company='+a.id:path;
  const page=await session.get(selected);assert.equal(page.status,200,selected);
  for(const match of page.body.matchAll(/(?:href|action|src)="([^"#]+)"/g)){
   const raw=match[1].replaceAll('&amp;','&');if(!raw.startsWith('/'))continue;
   const url=new URL(raw,w.origin);assert.equal(canonicalPath(url.pathname),url.pathname,raw);
   for(const key of url.searchParams.keys())assert.ok(!Object.hasOwn(legacy.parameters,key),raw);
   for(const key of ['view','period','saved','section']){const value=url.searchParams.get(key);if(value)assert.ok(!Object.hasOwn(legacy.values,value),raw);}
  }
 }
});
test('legacy actions still require the original host and form origin',async t=>{
 const w=await portal(t),s=w.session();
 assert.equal((await s.post('/entrar',{document:'1748225842',password},{headers:{Origin:'https://untrusted.test'}})).status,403);
 const status=await new Promise((resolve,reject)=>{const req=httpRequest(w.origin+'/entrar',{headers:{Host:'untrusted.test'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(status,400);
 assert.equal(w.db.get('SELECT count(*) n FROM accounts').n,0);
});

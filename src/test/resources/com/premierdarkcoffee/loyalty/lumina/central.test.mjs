import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { agency, colleague, owner, portal, acceptedContract } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { localDay, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
import { walletSections } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/wallet/access-policy.mjs';
const data={catalog_version:'SIMPLE',name:'Contenido y fidelización',term:'MONTHLY',price_type:'FIXED',price:'100.25',VIDEO:'2',WALLET:'1',wallet_gift:'yes',confirm_offer:'yes',description:'Dos videos y configuración de fidelización.'};
async function setup(t){const l=await fakeLoyalty(t),w=await portal(t,l.origin,{platformToken:l.platformToken}),admin=await agency(w),a=await owner(w,'Negocio central','1');return {...w,...a,admin,l};}
const provider=(path,id)=>'/agency'+path+'?company='+id;
async function api(w,actor,path,method='GET',body,headers={}){const r=await fetch(w.origin+path,{method,headers:{Cookie:actor.cookie,Origin:w.origin,'X-Lumina-CSRF':actor.csrf,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});return {status:r.status,body:await r.text()};}

test('editor publica por áreas con ocho servicios claros y no mezcla los antiguos veintidós tipos',async t=>{
 const w=await setup(t),p=await w.admin.get('/plans/new');assert.equal(p.status,200);
 assert.equal([...p.body.matchAll(/data-offer-tab=/g)].length,5);assert.equal([...p.body.matchAll(/data-offer-item /g)].length,8);
 assert.doesNotMatch(p.body,/name="individual_service"|value="REEL"|value="MAPS_RESPONSES"|value="STORY"/);assert.match(p.body,/1\. Servicios/);assert.match(p.body,/3\. Revisión/);assert.match(p.body,/name="confirm_offer"/);
 assert.match((await w.admin.get('/plans')).body,/Crear oferta/);assert.doesNotMatch((await w.admin.get('/plans')).body,/name="individual_service"|name="VIDEO"/);
 assert.equal((await w.client.get('/plans/new')).status,403);assert.equal((await w.admin.get('/plans/new?company='+w.id)).status,403);
});

test('oferta nueva conserva cantidades y precio exacto, con Wallet de cortesía y sin alta adicional',async t=>{
 const w=await setup(t),tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,calls=w.l.calls.length;
 assert.equal((await w.admin.post('/plans',data)).status,303);const p=w.db.get('SELECT * FROM plans');assert.equal(p.price_minor,10025);assert.equal(p.wallet,'GIFT');
 assert.deepEqual(w.db.all('SELECT service,quantity FROM plan_items ORDER BY service').map(r=>({...r})),[{service:'VIDEO',quantity:2},{service:'WALLET',quantity:1}]);
 const catalog=await w.client.get('/plans');assert.match(catalog.body,/100[,.]25/);assert.match(catalog.body,/<strong>2<\/strong> Video/);assert.match(catalog.body,/sin recargo/);assert.equal(w.l.calls.length,calls);assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,tenant);
});

test('publicación exige revisión y valida selección, cortesía, cantidad, modalidad y precio en el servidor',async t=>{
 const w=await setup(t);
 for(const change of [{confirm_offer:''},{VIDEO:'0',WALLET:'0'},{price:''},{price:'NaN'},{REEL:'1'},{WALLET:'2'},{VIDEO:'0'},{IDENTITY:'1'},{VIDEO:'101'}])assert.equal((await w.admin.post('/plans',{...data,...change})).status,400,JSON.stringify(change));
 assert.equal(w.db.get('SELECT count(*) n FROM plans').n,0);
 const invalid=await w.admin.post('/plans',{...data,name:'<img src=x>',price:'bad'});assert.match(invalid.body,/Conservamos tu borrador/);assert.match(invalid.body,/&lt;img src=x&gt;/);assert.match(invalid.body,/name="VIDEO"[^>]*value="2"/);assert.doesNotMatch(invalid.body,/<img src=x>/);
});

test('cotización pendiente y precio cero son distintos, y una nueva tarifa no cambia la anterior',async t=>{
 const w=await setup(t);await w.admin.post('/plans',{...data,name:'A medida',price_type:'QUOTE',price:'999'});await w.admin.post('/plans',{...data,name:'Cortesía confirmada',price:'0'});
 const rows=w.db.all('SELECT name,price_minor FROM plans ORDER BY name');assert.equal(rows[0].price_minor,null);assert.equal(rows[1].price_minor,0);
 const before=w.db.all('SELECT * FROM plans');await w.admin.post('/plans',{...data,name:'Tarifa nueva',price:'125'});assert.deepEqual(w.db.all('SELECT * FROM plans WHERE name<>?', 'Tarifa nueva'),before);
});

test('Wallet del dueño solo ofrece herramientas de fidelización y los enlaces anteriores regresan a Lúmina',async t=>{
 const w=await setup(t),body=(await w.client.get('/wallet')).body;assert.match(body,/lumina-wallet-owner" content="yes"/);assert.doesNotMatch(body,/lumina-wallet-sections" content="null"/);
 const sections=walletSections({kind:'OWNER'});for(const key of ['account','reports','operations','team','business','branches','administration','activity'])assert.ok(!sections.includes(key));for(const key of ['sales','customers','radar','programs','rewards','events','design','qr'])assert.ok(sections.includes(key));
 for(const [from,to] of [['account','/plans?view=agreements'],['reports','/management/reports'],['team','/team'],['operations','/management/operations'],['administration','/management']])assert.equal((await w.client.get('/wallet/management?section='+from)).location,to);
 assert.equal((await w.client.get('/wallet/management?section=unknown')).status,403);
});

test('administración central usa la misma sesión, tiene navegación común y prohíbe la suplantación de agencia',async t=>{
 const w=await setup(t);await w.client.get('/wallet');const before=w.db.all('SELECT * FROM wallet_access');
 assert.match((await w.client.get('/management')).body,/Equipos y roles/);
 for(const slug of ['business','branches','activity','operations','history','reports']){const r=await w.client.get('/management/'+slug);assert.equal(r.status,200);assert.match(r.body,/lumina-sidebar-nav/);assert.match(r.body,/data-management-frame/);assert.equal((await w.admin.get('/management/'+slug+'?company='+w.id)).status,403);}
 const doc=await w.client.get('/management/view?section=branches');assert.equal(doc.status,200);assert.match(doc.body,/lumina-management/);assert.equal(doc.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(doc.headers.get('content-security-policy'),/frame-ancestors 'self'/);assert.match(doc.body,/management-launch.js/);
 assert.equal((await w.client.get('/management/view?section=team')).status,404);assert.deepEqual(w.db.all('SELECT * FROM wallet_access'),before);
});

test('API de Wallet rechaza gestión común y contratación; API central conserva autoridad y no emite credenciales',async t=>{
 const w=await setup(t);await w.client.get('/wallet');
 for(const path of ['account','operations','metrics','business-profile','branch-directory','activity','administration'])assert.equal((await api(w,w.client,'/wallet-api/api/staff/'+path)).status,403,path);
 assert.equal((await api(w,w.client,'/management-api/api/staff/metrics')).status,200);
 for(const prefix of ['/management-api','/wallet-api'])for(const [method,path,payload] of [['POST','/api/staff/credentials',{}],['PUT','/api/platform/tenants/'+w.l.business.id+'/membership',{}],['POST','/api/staff/team/'+uuid()+'/actions',{}]])assert.equal((await api(w,w.client,prefix+path,method,payload)).status,403);
 const foreign=await owner(w,'Negocio ajeno','2');assert.equal((await api(w,w.client,'/management-api/api/staff/metrics','GET',undefined,{'X-Lumina-Company':foreign.id})).status,403);
 assert.equal((await api(w,w.admin,'/management-api/api/staff/metrics')).status,403);
});

test('permisos de informes se aplican desde Lúmina sin exponer cargos, equipo ni datos de otros negocios',async t=>{
 const w=await setup(t),a=await colleague(w,w.client,{name:'Análisis',document:'1749844500','WALLET.VIEW':'yes','WALLET_REPORTS.VIEW':'yes'});
 assert.equal((await a.session.get('/management/reports')).status,200);assert.equal((await a.session.get('/management')).status,403);assert.equal((await a.session.get('/management/view?section=reports')).status,403);
 const before=w.l.calls.length;for(const path of ['account','operations','team','business-profile','branch-directory'])assert.equal((await api(w,a.session,'/management-api/api/staff/'+path)).status,403);assert.equal(w.l.calls.length,before);
 w.db.run('DELETE FROM grants WHERE account_id=? AND scope=?',a.id,'WALLET_REPORTS');assert.equal((await a.session.get('/management/reports')).status,403);assert.equal((await api(w,a.session,'/management-api/api/staff/metrics')).status,403);
});

test('escrituras de gestión exigen origen y CSRF, las lecturas también revalidan sesión',async t=>{
 const w=await setup(t);await w.client.get('/wallet');const before=w.l.calls.length;
 assert.equal((await api(w,w.client,'/management-api/api/staff/business-profile','PUT',{}, {'X-Lumina-CSRF':'wrong'})).status,403);
 assert.equal((await api(w,w.client,'/management-api/api/staff/business-profile','PUT',{}, {Origin:'https://foreign.test'})).status,403);assert.equal(w.l.calls.length,before);
 const cookie=w.client.cookie;await w.client.post('/logout');const r=await fetch(w.origin+'/management-api/api/staff/metrics',{headers:{Cookie:cookie}});assert.equal(r.status,401);
});

test('no hay activación alternativa sin aceptación; la propuesta conjunta activa una vez y conserva Wallet',async t=>{
 const w=await setup(t);await w.admin.post(provider('/businesses/verify',w.id));await w.admin.post('/plans',data);const plan=w.db.get('SELECT id FROM plans').id;
 assert.equal((await w.admin.post(provider('/plans/activate',w.id),{plan,startsOn:localDay()})).status,410);assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);
 await w.client.get('/wallet');const before=w.db.all('SELECT * FROM wallet_access');const contract=await acceptedContract(w,w.admin,w.client,w.id,plan);assert.equal(contract.agreed_minor,10025);
 const order=w.db.get('SELECT * FROM package_orders');assert.equal((await w.admin.post(provider('/plans/orders/'+order.id+'/activate',w.id),{revision:String(order.revision)})).status,303);assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,1);
 assert.deepEqual(w.db.all('SELECT * FROM wallet_access'),before);
});

test('cancelar un servicio no revoca Wallet ni los demás contratos y el historial no vende otro plan',async t=>{
 const w=await setup(t);await w.admin.post(provider('/businesses/verify',w.id));await w.admin.post('/plans',data);const plan=w.db.get('SELECT id FROM plans').id;
 const a=await acceptedContract(w,w.admin,w.client,w.id,plan),b=await acceptedContract(w,w.admin,w.client,w.id,plan);await w.client.get('/wallet');const before=w.db.all('SELECT * FROM wallet_access');
 assert.equal((await w.admin.post(provider('/plans/cancel',w.id),{contract:a.id,reason:'Cancelación acordada para la prueba.'})).status,303);assert.ok(w.db.get('SELECT cancelled_at FROM contracts WHERE id=?',a.id).cancelled_at);assert.equal(w.db.get('SELECT cancelled_at FROM contracts WHERE id=?',b.id).cancelled_at,null);
 assert.equal((await w.client.get('/wallet')).status,200);assert.deepEqual(w.db.all('SELECT * FROM wallet_access'),before);const page=await w.client.get('/management/history');assert.match(page.body,/acuerdos anteriores de Wallet/);assert.match(page.body,/Toda contratación nueva/);assert.doesNotMatch(page.body,/membership.*form|name="price"/);
});

test('logos se sirven como imágenes originales en acceso, Lúmina, Contenido y Wallet',async t=>{
 const w=await setup(t);for(const name of ['lumina-logo.png','lumina-symbol.png']){const r=await fetch(w.origin+'/assets/'+name);assert.equal(r.headers.get('content-type'),'image/png');const bytes=Buffer.from(await r.arrayBuffer()),file=readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/'+name,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(file).digest('hex'));}
 assert.match((await w.session().get('/')).body,/lumina-symbol.png/);for(const path of ['/home','/content','/wallet'])assert.match((await w.client.get(path)).body,/lumina-symbol.png/);
});

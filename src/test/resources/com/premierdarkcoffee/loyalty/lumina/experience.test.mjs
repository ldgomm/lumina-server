import { acceptedContract } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teamRevision, agency, colleague, owner, portal } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { describeOffer, requestCommercial } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/memberships/catalog.mjs';
import { createRequest } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/production.mjs';
import { getSession } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import { localDay, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const idea={type:'CONTENT',channel:'SOCIAL',service:'VIDEO',title:'Mostrar la cocina',brief:'Algo natural y cercano.',quantity:'1'};
async function setup(t){const loyalty=await fakeLoyalty(t),w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken}),admin=await agency(w),a=await owner(w,'Cocina ficticia','1');return {...w,...a,loyalty,admin};}
async function offer(w,extra={}){
 const data={name:'Un video',offer_kind:'INDIVIDUAL',individual_service:'VIDEO',term:'ONE_OFF',price:'35.25',wallet:'NONE',...extra};
 const r=await w.admin.post('/planes',data);assert.equal(r.status,303,r.body);return w.db.get('SELECT * FROM plans WHERE name=?',data.name);
}

test('Wallet entra al módulo sin presentación y el botón vuelve al inicio sin bucles ni nuevas credenciales',async t=>{
 const w=await setup(t),r=await w.client.get('/wallet');assert.equal(r.status,200);assert.equal(r.location,null);
 assert.match(r.body,/<body class="lumina-loyalty">/);assert.match(r.body,/lumina-wallet-section" content="overview"/);assert.match(r.body,/lumina-wallet-back" content="\/inicio"/);
 assert.doesNotMatch(r.body,/wallet-hero|Tu Wallet ya tiene|name="credential"|name="password"/);
 assert.match(r.headers.get('content-security-policy'),/style-src 'self' 'unsafe-inline'/);
 const account=w.db.get('SELECT * FROM wallet_access');await w.client.get('/wallet');assert.deepEqual(w.db.get('SELECT * FROM wallet_access'),account);
 assert.equal((await w.client.get('/inicio')).status,200);assert.equal((await w.admin.get('/wallet?empresa='+w.id)).status,200);assert.equal((await w.admin.get('/wallet/gestion?empresa='+w.id)).status,403);
});

test('Wallet dirige al personal a su permiso operativo o Caja y conserva la revocación inmediata',async t=>{
 const w=await setup(t);const designer=await colleague(w,w.client,{name:'Diseño',email:'design@example.test','WALLET.VIEW':'yes','WALLET_DESIGN.VIEW':'yes'});
 assert.match((await designer.session.get('/wallet')).body,/lumina-wallet-section" content="design"/);
 assert.equal((await designer.session.get('/wallet/gestion?seccion=programs')).status,403);
 const cashier=await colleague(w,w.client,{name:'Caja',email:'cash@example.test'}),tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant;
 assert.equal((await w.client.post('/equipo/'+cashier.id+'/caja/guardar',{revision:teamRevision(w,cashier.id),branch:w.loyalty.branches.get(tenant)[0].id,purchases:'yes',rewards:'yes'})).status,303);
 assert.equal((await cashier.session.get('/wallet')).location,'/caja');assert.equal((await cashier.session.get('/caja')).status,200);
 w.db.run('UPDATE accounts SET active=0 WHERE id=?',designer.id);assert.equal((await designer.session.get('/wallet')).location,'/');
});

test('fallo de Wallet permite reintentar y reparar desde el dueño sin alterar el tenant',async t=>{
 const w=await setup(t);await w.client.get('/wallet');const before=w.db.get('SELECT * FROM wallet_access');w.db.run("UPDATE wallet_access SET status='BLOCKED' WHERE account_id=?",before.account_id);
 const r=await w.client.get('/wallet');assert.equal(r.status,403);assert.match(r.body,/No pudimos abrir Wallet/);assert.match(r.body,/Reparar acceso interno/);assert.doesNotMatch(r.body,/wallet-hero/);
 assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,before.tenant_id);
 assert.equal((await w.client.get('/wallet/accesos')).status,200);assert.equal((await w.admin.get('/wallet/accesos?empresa='+w.id)).status,403);
 assert.match((await w.client.get('/equipo')).body,/href="\/wallet\/accesos"/);
});

test('precio individual, promedio de paquete homogéneo y combinación mixta no inventan precio por video',()=>{
 const plan={price_minor:10000,items:[{service:'VIDEO',quantity:1}]};assert.equal(describeOffer(plan).kind,'individual');assert.equal(describeOffer(plan).unitMinor,null);
 const pack={...plan,items:[{service:'VIDEO',quantity:3}]};assert.equal(describeOffer(pack).kind,'paquete');assert.equal(describeOffer(pack).unitMinor,10000/3);
 assert.equal(describeOffer({...pack,price_minor:null}).unitMinor,null);
 assert.equal(describeOffer({...pack,items:[...pack.items,{service:'WALLET',quantity:1}]}).unitMinor,null);
 assert.equal(describeOffer({...pack,items:[...pack.items,{service:'PHOTO',quantity:4}]}).unitMinor,null);
});

test('agencia publica precios unitarios exactos y el servidor impide cantidades ocultas y marca mensual',async t=>{
 const w=await setup(t),p=await offer(w,{VIDEO:'99',PHOTO:'44',wallet:'GIFT'});
 assert.equal(p.price_minor,3525);assert.equal(p.wallet,'NONE');assert.deepEqual(w.db.all('SELECT service,quantity FROM plan_items WHERE plan_id=?',p.id).map(x=>({...x})),[{service:'VIDEO',quantity:1}]);
 assert.equal((await w.admin.post('/planes',{name:'Logo',offer_kind:'INDIVIDUAL',individual_service:'LOGO',term:'MONTHLY',price:'10',wallet:'NONE'})).status,400);
 assert.equal((await w.client.post('/planes',{name:'Precio alterado',offer_kind:'INDIVIDUAL',individual_service:'VIDEO',term:'ONE_OFF',price:'0'})).status,403);
 const wallet=await offer(w,{name:'Gestión Wallet',individual_service:'WALLET',term:'MONTHLY',price:'15.10'});assert.equal(wallet.wallet,'INCLUDED');assert.equal(w.db.get('SELECT quantity FROM plan_items WHERE plan_id=?',wallet.id).quantity,1);
});

test('catálogo muestra precios reales, cantidades, modalidades y valores a cotizar sin accesos de compra para agencia',async t=>{
 const w=await setup(t),unit=await offer(w);await offer(w,{name:'Web por cotizar',individual_service:'WEBSITE',price:''});
 const bundle=await offer(w,{offer_kind:'BUNDLE',name:'Cuatro videos al mes',VIDEO:'4',PHOTO:'2',term:'MONTHLY',price:'120'});
 const page=await w.client.get('/planes');assert.equal(page.status,200);assert.match(page.body,/35[,.]25/);assert.match(page.body,/120[,.]00/);assert.match(page.body,/data-kind="individual"/);assert.match(page.body,/data-kind="paquete"/);assert.match(page.body,/Por cotizar/);assert.match(page.body,/Incluye cada mes/);assert.match(page.body,/name="qty_/);assert.doesNotMatch(page.body,/≈/);
 assert.equal((await w.admin.get('/planes?empresa='+w.id)).body.includes('name="qty_'),false);
 await w.admin.post('/planes/retirar',{plan:unit.id});assert.doesNotMatch((await w.client.get('/planes')).body,/id="oferta-.*?"[^>]*data-name="Un video"/);assert.equal(w.db.get('SELECT published FROM plans WHERE id=?',bundle.id).published,1);
});

test('solicitud guiada ofrece solo áreas autorizadas y tres formatos comunes, sin redes',async t=>{
 const w=await setup(t);const page=await w.client.get('/solicitudes/nueva');assert.equal(page.status,200);for(const area of ['SOCIAL','WALLET','MAPS','WEB','BRAND'])assert.ok(page.body.includes('area='+area));
 const r=await w.client.get('/solicitudes/nueva?area=SOCIAL');assert.match(r.body,/<body class="content-app">/);assert.match(r.body,/name="channel" value="SOCIAL"/);
 assert.deepEqual([...r.body.matchAll(/type="radio" name="service" value="([^"]+)"/g)].map(m=>m[1]),['VIDEO','PHOTO','GRAPHIC']);assert.doesNotMatch(r.body,/name="platform|value="REEL"|value="STORY"/);
 const member=await colleague(w,w.client,{name:'Solo contenido',email:'onlycontent@example.test','SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes'});
 const selection=await member.session.get('/solicitudes/nueva');assert.ok(selection.body.includes('area=SOCIAL'));assert.ok(!selection.body.includes('area=WEB'));
 assert.equal((await member.session.get('/solicitudes/nueva?area=WEB')).status,403);assert.equal((await w.admin.get('/agencia/solicitudes/nueva?empresa='+w.id)).status,403);
});

test('formulario conserva datos y formato ante error, escapa HTML y no crea registros parciales',async t=>{
 const w=await setup(t),payload={...idea,title:'Idea <script>alert(1)</script>',brief:'Texto <img src=x>',service:'GRAPHIC',quantity:'101',composer:'content'};
 const r=await w.client.post('/solicitudes',payload);assert.equal(r.status,400);assert.match(r.body,/role="alert"/);assert.match(r.body,/value="GRAPHIC" checked/);assert.match(r.body,/Idea &lt;script&gt;/);assert.match(r.body,/Texto &lt;img src=x&gt;/);assert.doesNotMatch(r.body,/<script>alert/);assert.equal(w.db.get('SELECT count(*) n FROM requests').n,0);
 assert.equal((await w.client.post('/solicitudes',{...payload,quantity:'2'})).status,303);const saved=w.db.get('SELECT * FROM requests');assert.equal(saved.service,'GRAPHIC');assert.equal(saved.quantity,2);assert.equal(saved.brief,payload.brief);assert.equal(w.db.get('SELECT count(*) n FROM request_platforms').n,0);
 assert.equal((await w.client.post('/solicitudes',{...idea,_csrf:'wrong'})).status,403);
});

test('precios y cupos del dueño se muestran en la solicitud sin revelar contratos a colaboradores',async t=>{
 const w=await setup(t);await offer(w);await w.admin.post('/agencia/clientes/verificar?empresa='+w.id);
 const pack=await offer(w,{name:'Videos mes',offer_kind:'BUNDLE',VIDEO:'4',term:'MONTHLY',price:'100'});await acceptedContract(w,w.admin,w.client,w.id,pack.id);
 const view=await w.client.get('/contenido?vista=solicitudes');assert.match(view.body,/35[,.]25/);assert.match(view.body,/4 cupo\(s\) disponibles/);assert.match(view.body,/no reserva cupos/);
 const member=await colleague(w,w.client,{name:'Contenido',email:'collabprice@example.test','SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes'});
 assert.doesNotMatch((await member.session.get('/contenido?vista=solicitudes')).body,/PRECIOS Y CUPOS|35[,.]25|Videos mes|100[,.]00/);
});

test('cupos usan reservas reales y conservan servicios heredados, períodos y negocio',()=>{
 const plans=[{id:'p',name:'Video unitario',published:1,term:'ONE_OFF',price_minor:2500,items:[{service:'VIDEO',quantity:1}]}];
 const contracts=[{name:'Vigente',starts_on:localDay(),ends_before:'2099-12-31',items:[{service:'REEL',quantity:5,used:2,reserved:2},{service:'POST',quantity:3,used:1,reserved:1}]},{name:'Vencido',starts_on:'2000-01-01',ends_before:'2001-01-01',items:[{service:'VIDEO',quantity:99,used:0,reserved:0}]}];
 const data=requestCommercial(plans,contracts,'SOCIAL');assert.equal(data.find(i=>i.service==='VIDEO').available[0].remaining,1);assert.equal(data.find(i=>i.service==='GRAPHIC').available[0].remaining,1);assert.equal(data.find(i=>i.service==='VIDEO').offers[0].price,2500);assert.equal(data.find(i=>i.service==='PHOTO').offers.length,0);
});

test('búsqueda de solicitudes aplica estado y permisos antes de paginar y trata % literalmente',async t=>{
 const w=await setup(t),other=await owner(w,'Otro local','2');
 const actor=getSession(w.db,w.client.cookie.split('=')[1]),company=w.db.get('SELECT * FROM companies WHERE id=?',w.id);
 for(let i=0;i<34;i++)createRequest(w.db,actor,company,{...idea,title:'Una idea literal % '+i});
 await other.client.post('/solicitudes',{...idea,title:'Secreto ajeno %'});
 const old=createRequest(w.db,actor,company,{...idea,title:'Video reservado'});w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,old,'TIKTOK');
 const member=await colleague(w,w.client,{name:'Instagram',email:'search@example.test','INSTAGRAM.VIEW':'yes'});
 const r=await member.session.get('/solicitudes?q=%25&estado=NEW');assert.equal(r.status,200);assert.equal((r.body.match(/class="request-record"/g)||[]).length,30);assert.match(r.body,/pagina=1/);assert.doesNotMatch(r.body,/Secreto ajeno|Video reservado/);
 const next=await member.session.get('/solicitudes?q=%25&estado=NEW&pagina=1');assert.equal((next.body.match(/class="request-record"/g)||[]).length,4);
 assert.doesNotMatch((await member.session.get('/solicitudes?estado=DELIVERED')).body,/Una idea literal/);assert.equal((await w.client.get('/solicitudes?estado=BAD')).status,400);
});

test('mezclar unidades y paquetes usa precios del servidor y nunca acepta como final un subtotal incompleto',async t=>{
 const w=await setup(t),one=await offer(w),monthly=await offer(w,{offer_kind:'BUNDLE',name:'Paquete mensual',term:'MONTHLY',price:'125.10',VIDEO:'4',GRAPHIC:'2'}),custom=await offer(w,{name:'Logo a medida',individual_service:'LOGO',price:''});
 const r=await w.client.post('/planes/solicitar',{key:uuid(),['qty_'+one.id]:'3',['qty_'+monthly.id]:'2',['qty_'+custom.id]:'1',amount:'0',price:'0'});assert.equal(r.status,303);
 const lines=w.db.all('SELECT * FROM package_order_lines');assert.equal(lines.find(l=>l.plan_id===one.id).unit_minor,3525);assert.equal(lines.find(l=>l.plan_id===monthly.id).units,2);assert.equal(lines.find(l=>l.plan_id===custom.id).unit_minor,null);
 const page=await w.client.get(r.location);assert.match(page.body,/250[,.]20/);assert.match(page.body,/105[,.]75/);assert.match(page.body,/<strong>Por cotizar<\/strong>/);assert.match(page.body,/aún no hay total definitivo/);assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {agency,owner,colleague,portal,teamRevision} from './helpers.mjs';
import {uuid} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
import {campaignDates,offerAvailable} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/campaigns/season.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,statSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openDatabase} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
const path='/plans/black-friday',boundary=Date.parse('2026-12-01T05:00:00Z');
const selected=(p,id)=>'/agency'+p+'?company='+id;
async function setup(t){
 t.mock.timers.enable({apis:['Date'],now:boundary-2000});
 const w=await portal(t),admin=await agency(w),{client,id}=await owner(w,'Negocio noviembre','1');
 await admin.post(selected('/businesses/verify',id));
 return {...w,admin,client,id};
}
async function base(w,extra={}){
 const name='Base '+uuid();const result=await w.admin.post('/plans',{name,term:'ONE_OFF',price:'99.95',VIDEO:'2',wallet:'NONE',...extra});assert.equal(result.status,303,result.body);
 return w.db.get('SELECT id FROM plans WHERE name=?',name).id;
}
function data(base,extra={}){return {key:uuid(),base,year:'2026',starts_on:'2026-11-01',discount_mode:'PERCENT',discount:'25',name:'Viernes Negro <prueba>',description:'Producción del negocio',conditions:'Una revisión incluida. Entrega según propuesta.',theme:'GOLD',confirm:'yes',...extra};}
async function campaign(w,extra={},baseExtra={}){
 const original=await base(w,baseExtra),body=data(original,extra),res=await w.admin.post(path,body);assert.equal(res.status,303,res.body);
 return {original,body,id:w.db.get('SELECT plan_id FROM seasonal_offers WHERE submission_key=?',body.key).plan_id};
}
async function order(w,id){const r=await w.client.post('/plans/request',{key:uuid(),['qty_'+id]:'2',phone:'0991234567'});assert.equal(r.status,303,r.body);return {path:r.location,id:r.location.split('/').at(-1)};}
async function quote(w,o,extra={}){const line=w.db.get('SELECT * FROM package_order_lines WHERE order_id=?',o.id);return w.admin.post(selected(o.path+'/quote',w.id),{revision:'1',terms:'Alcance confirmado con una revisión', ['price_'+line.id]:(line.unit_minor/100).toFixed(2),['start_'+line.id]:'2026-12-03',['end_'+line.id]:'2026-12-30',...extra});}

test('fechas de noviembre usan Ecuador y no reactivan campañas de otro año',()=>{
 assert.equal(campaignDates(2026).friday,'2026-11-27');assert.equal(campaignDates(2027).friday,'2027-11-26');
 const plan={published:1,campaign:{starts_on:'2026-11-20',ends_before:'2026-12-01'}};
 assert.equal(offerAvailable(plan,'2026-11-19'),false);assert.equal(offerAvailable(plan,'2026-11-30'),true);assert.equal(offerAvailable(plan,'2026-12-01'),false);assert.equal(offerAvailable(plan,'2027-11-20'),false);
});
test('ninguna promoción ni precio ficticio se publica al instalar',async t=>{
 const w=await setup(t);assert.equal(w.db.get('SELECT count(*) n FROM seasonal_offers').n,0);
 const view=await w.admin.get(path);assert.equal(view.status,200);assert.match(view.body,/Comienza por tu precio habitual/);assert.doesNotMatch(view.body,/data-bf-editor/);
 assert.doesNotMatch((await w.client.get('/home')).body,/Ver promociones →/);
});
test('la agencia publica descuento exacto e idempotente sin modificar la oferta habitual',async t=>{
 const w=await setup(t),c=await campaign(w),promo=w.db.get('SELECT * FROM plans WHERE id=?',c.id);
 assert.equal(promo.price_minor,7496);assert.equal(w.db.get('SELECT price_minor FROM plans WHERE id=?',c.original).price_minor,9995);
 assert.deepEqual(w.db.all('SELECT service,quantity FROM plan_items WHERE plan_id=?',c.id),w.db.all('SELECT service,quantity FROM plan_items WHERE plan_id=?',c.original));
 assert.equal((await w.admin.post(path,c.body)).status,303);assert.equal(w.db.get('SELECT count(*) n FROM seasonal_offers').n,1);
 assert.throws(()=>w.db.run('UPDATE seasonal_offers SET year=2027 WHERE plan_id=?',c.id));assert.throws(()=>w.db.run('DELETE FROM seasonal_offers WHERE plan_id=?',c.id));
});
test('paquetes combinados de contenido web y diseño también admiten precio especial',async t=>{
 const w=await setup(t),c=await campaign(w,{discount_mode:'PRICE',price:'70.10',theme:'VIOLET'},{VIDEO:'3',WEBSITE:'1',LOGO:'1'});
 assert.equal(w.db.get('SELECT price_minor FROM plans WHERE id=?',c.id).price_minor,7010);assert.equal(w.db.get('SELECT count(*) n FROM plan_items WHERE plan_id=?',c.id).n,3);
 const view=await w.client.get(path);assert.equal(view.status,200);assert.match(view.body,/bf-VIOLET/);assert.match(view.body,/30 de noviembre de 2026/);assert.match(view.body,/1 de diciembre a las 00:00/);assert.match(view.body,/&lt;prueba&gt;/);assert.doesNotMatch(view.body,/<prueba>/);
 assert.match((await w.client.get('/home')).body,/Ver promociones →/);
});
test('solo agencia global publica; dueño colaborador y agencia en consulta no pueden hacerlo',async t=>{
 const w=await setup(t),id=await base(w),body=data(id),team=await colleague(w,w.client,{name:'Editor',document:'1743990283','SOCIAL.VIEW':'yes'});
 assert.equal((await w.client.post(path,body)).status,403);assert.equal((await team.session.post(path,body)).status,403);assert.equal((await w.admin.post(path+'?company='+w.id,body)).status,403);
 assert.equal((await w.admin.post(path,{...body,_csrf:'incorrecto'})).status,403);assert.equal(w.db.get('SELECT count(*) n FROM seasonal_offers').n,0);
});
test('el catálogo estacional rechaza otros servicios precios desconocidos y promoción sobre promoción',async t=>{
 const w=await setup(t);
 for(const extra of [{VIDEO:'0',LOYALTY_PROGRAM:'1'},{VIDEO:'0',MAPS_PROFILE:'1'},{price:''},{price:'0'}]){const id=await base(w,extra);assert.equal((await w.admin.post(path,data(id))).status,409);}
 const c=await campaign(w);assert.equal((await w.admin.post(path,data(c.id))).status,409);
});
test('validación mantiene el borrador sin publicar ni permitir fechas fuera de noviembre',async t=>{
 const w=await setup(t),id=await base(w);
 for(const extra of [{discount:'0'},{discount:'101'},{discount:'1.5'},{discount_mode:'PRICE',price:'100'},{starts_on:'2026-12-01'},{starts_on:'2026-10-31'},{theme:'EVIL'},{confirm:''},{conditions:'x'}]){
  const r=await w.admin.post(path,data(id,{name:'<b>Borrador</b>',...extra}));assert.equal(r.status,400,r.body);assert.match(r.body,/Conservamos tu borrador/);assert.doesNotMatch(r.body,/<b>Borrador<\/b>/);
 }
 assert.equal(w.db.get('SELECT count(*) n FROM seasonal_offers').n,0);
});
test('catálogo y POST cierran exactamente a medianoche de Ecuador sin reiniciar servidor',async t=>{
 const w=await setup(t),c=await campaign(w);assert.match((await w.client.get('/plans')).body,new RegExp(c.id));
 t.mock.timers.setTime(boundary);assert.doesNotMatch((await w.client.get('/plans')).body,new RegExp(c.id));assert.doesNotMatch((await w.client.get('/home')).body,/Ver promociones →/);
 assert.match((await w.client.get(path)).body,/Esta campaña no está disponible/);
 assert.equal((await w.client.post('/plans/request',{key:uuid(),['qty_'+c.id]:'1'})).status,409);
 assert.equal((await w.admin.post(path,data(c.original))).status,409);
 assert.match((await w.admin.get(path)).body,/Finalizada/);assert.equal(w.db.get('SELECT count(*) n FROM seasonal_offers').n,1);
});
test('enlaces antiguos de solicitudes no eluden la aceptación comercial de la campaña',async t=>{
 const w=await setup(t),c=await campaign(w);
 const r=await w.client.post('/requests',{type:'PLAN',plan:c.id,channel:'SOCIAL',service:'VIDEO',title:'Promoción',brief:''});assert.equal(r.status,409);assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);
});
test('propuesta sin aceptar caduca aunque se hubiese solicitado antes',async t=>{
 const w=await setup(t),c=await campaign(w),o=await order(w,c.id);assert.equal((await quote(w,o)).status,303);
 t.mock.timers.setTime(boundary);assert.equal((await w.client.post(o.path+'/accept',{revision:'2',confirm:'yes'})).status,409);
 assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);
});
test('aceptación conserva el precio para completar el trabajo después de noviembre',async t=>{
 const w=await setup(t),c=await campaign(w),o=await order(w,c.id);assert.equal((await quote(w,o)).status,303);
 assert.equal((await w.client.post(o.path+'/accept',{revision:'2',confirm:'yes'})).status,303);
 t.mock.timers.setTime(boundary);assert.equal((await w.admin.post(selected(o.path+'/activate',w.id),{revision:'2'})).status,303);
 const contract=w.db.get('SELECT * FROM contracts');assert.equal(contract.agreed_minor,14992);assert.equal(contract.plan_id,c.id);assert.equal(contract.units,2);
});
test('la agencia no puede aumentar el precio promocional en la propuesta ni aceptar por el cliente',async t=>{
 const w=await setup(t),c=await campaign(w),o=await order(w,c.id),line=w.db.get('SELECT id FROM package_order_lines WHERE order_id=?',o.id);
 assert.equal((await quote(w,o,{['price_'+line.id]:'95'})).status,409);
 assert.equal((await w.admin.post(selected(o.path+'/accept',w.id),{revision:'1',confirm:'yes'})).status,403);
 assert.equal(w.db.get('SELECT status FROM package_orders').status,'REQUESTED');
});
test('renovación de oferta mensual usa la tarifa habitual y requiere una nueva aceptación',async t=>{
 const w=await setup(t),c=await campaign(w,{}, {term:'MONTHLY'}),o=await order(w,c.id);const prices=await w.client.get('/requests/new?area=SOCIAL');assert.match(prices.body,/primer período mensual/);assert.match(prices.body,/Después se desactiva/);await quote(w,o);await w.client.post(o.path+'/accept',{revision:'2',confirm:'yes'});await w.admin.post(selected(o.path+'/activate',w.id),{revision:'2'});
 const contract=w.db.get('SELECT * FROM contracts');t.mock.timers.setTime(boundary);
 const renew=await w.client.post('/plans/request',{key:uuid(),renewal:contract.id});assert.equal(renew.status,303,renew.body);
 const next=w.db.get('SELECT * FROM package_order_lines WHERE renewal_of=?',contract.id);assert.equal(next.plan_id,c.original);assert.equal(next.unit_minor,9995);assert.equal(next.units,2);
 assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,1);assert.match((await w.client.get('/plans?view=agreements')).body,/tarifa habitual/);
});
test('retirar una campaña corta nuevas contrataciones sin eliminar historial ni la tarifa base',async t=>{
 const w=await setup(t),c=await campaign(w);assert.equal((await w.admin.post('/plans/withdraw',{plan:c.id})).status,303);
 assert.equal((await w.client.post('/plans/request',{key:uuid(),['qty_'+c.id]:'1'})).status,409);assert.equal(w.db.get('SELECT published FROM plans WHERE id=?',c.original).published,1);
 assert.equal(w.db.get('SELECT count(*) n FROM seasonal_offers').n,1);
});
test('migración v5 conserva los vínculos Wallet, realiza respaldo privado y puede abrirse de nuevo',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bf-migration-')),path=join(dir,'agency.sqlite');
 try{let raw=new DatabaseSync(path);for(const file of ['schema.sql','migrations/002_unified.sql','migrations/003_onboarding.sql','migrations/004_packages.sql','migrations/005_request_contact.sql'])raw.exec(readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/'+file,import.meta.url),'utf8'));
 raw.exec('PRAGMA user_version=5');const id=uuid(),tenant=uuid();raw.prepare('INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at,loyalty_tenant) VALUES(?,?,?,?,?,?,?)').run(id,'Sin alterar','private','1234','0990000000','2026-10-01',tenant);const before=raw.prepare('SELECT * FROM companies').get();raw.close();
 let db=openDatabase(path);assert.deepEqual(db.get('SELECT * FROM companies'),Object.assign(Object.create(null),before,{category:'',ruc:null}));assert.equal(db.get('PRAGMA user_version').user_version,12);db.close();
 const files=readdirSync(join(dir,'migrations'));assert.equal(files.length,1);const backup=join(dir,'migrations',files[0]);assert.equal(statSync(backup).mode&0o777,0o600);raw=new DatabaseSync(backup,{readOnly:true});assert.equal(raw.prepare('PRAGMA user_version').get().user_version,5);raw.close();
 db=openDatabase(path);assert.deepEqual(db.get('SELECT * FROM companies'),Object.assign(Object.create(null),before,{category:'',ruc:null}));assert.equal(db.get('SELECT count(*) n FROM seasonal_offers').n,0);db.close();assert.equal(readdirSync(join(dir,'migrations')).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Wallet permite publicar solamente al dueño y al editor autorizado, y revoca el acceso inmediatamente',async t=>{
 const l=await fakeLoyalty(t),w=await portal(t,l.origin,{platformToken:l.platformToken}),admin=await agency(w),business=await owner(w,'Campaña del negocio','1');
 const editor=await colleague(w,business.client,{name:'Editor',document:'1743990283','WALLET.VIEW':'yes','WALLET_PROGRAMS.VIEW':'yes','WALLET_PROGRAMS.EDIT':'yes'});
 const reader=await colleague(w,business.client,{name:'Consulta',document:'1734948027','WALLET.VIEW':'yes','WALLET_PROGRAMS.VIEW':'yes'});
 const endpoint='/wallet-api/api/staff/promotion-setups',payload={program:{name:'Promoción',kind:'STAMPS',blackFridayYear:2026},rewardName:'Premio',rewardCost:3},opts={json:true,headers:{'Idempotency-Key':uuid()}};
 const own=await business.client.post(endpoint,payload,opts),edited=await editor.session.post(endpoint,payload,opts);assert.equal(own.status,200);assert.equal(edited.status,200);assert.equal(JSON.parse(own.body).company,JSON.parse(edited.body).company);
 const before=l.calls.filter(c=>c.path==='/api/staff/promotion-setups').length;
 assert.equal((await reader.session.post(endpoint,payload,opts)).status,403);assert.equal((await admin.post(endpoint,payload,opts)).status,403);
 await business.client.post('/team/'+editor.id+'/permissions',{revision:teamRevision(w,editor.id),'WALLET.VIEW':'yes','WALLET_PROGRAMS.VIEW':'yes'});
 assert.equal((await editor.session.post(endpoint,payload,opts)).status,403);assert.equal(l.calls.filter(c=>c.path==='/api/staff/promotion-setups').length,before);
});

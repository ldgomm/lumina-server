import assert from 'node:assert/strict';
import {test} from 'node:test';
import {agency,owner,colleague,portal,teamRevision} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
import {uuid} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
async function setup(t,permissions={}){
 const native=await fakeLoyalty(t),world=await portal(t,native.origin,{platformToken:native.platformToken}),admin=await agency(world),business=await owner(world,'Equipo unificado','7');
 const person=await colleague(world,business.client,{name:'Operadora',document:'1736469675',...permissions});
 const tenant=world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',business.id).loyalty_tenant,branch=native.branches.get(tenant)[0].id;
 const save=(data={})=>business.client.post('/team/'+person.id+'/access',{revision:teamRevision(world,person.id),cash_mode:'OFF',branch,...data});
 const grants=()=>world.db.all('SELECT scope,action FROM grants WHERE account_id=? ORDER BY scope,action',person.id).map(g=>g.scope+'.'+g.action);
 const cash=()=>world.db.get('SELECT * FROM cash_grants WHERE account_id=?',person.id);
 return {...world,native,admin,business,person,tenant,branch,save,grants,cash};
}
test('una decisión concede Caja y Contenido con una revisión, sin privilegios de configuración',async t=>{
 const w=await setup(t),revision=Number(teamRevision(w,w.person.id));
 const r=await w.save({cash_mode:'BOTH','SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes'});assert.equal(r.status,303,r.body);
 assert.equal(Number(teamRevision(w,w.person.id)),revision+1);assert.equal(w.cash().status,'ACTIVE');assert.deepEqual(w.grants(),['SOCIAL.REQUEST','SOCIAL.VIEW']);
 assert.equal((await w.person.session.get('/wallet')).location,'/cashier');assert.equal((await w.person.session.get('/content')).status,200);
 const data={branchId:w.branch,memberId:uuid(),amountMinor:1000};for(const path of ['/api/staff/purchases','/api/staff/counter-redemptions'])assert.equal((await w.person.session.post(path,data,{json:true})).status,200);
 assert.equal((await w.person.session.get('/wallet-api/api/staff/wallet-design')).status,403);assert.equal((await w.person.session.post('/plans/request',{key:uuid()})).status,403);
});
test('guardar sin cambios conserva permisos especiales, versión y credencial de Caja',async t=>{
 const grants={'WALLET.VIEW':'yes','WALLET.APPROVE':'yes','WALLET_CUSTOMERS.VIEW':'yes','WALLET_CUSTOMERS.EDIT':'yes','INSTAGRAM.VIEW':'yes','INSTAGRAM.APPROVE':'yes'};
 const w=await setup(t,grants);assert.equal((await w.save({...grants,cash_mode:'PURCHASES'})).status,303);
 const previous=w.cash(),before=w.grants(),revision=teamRevision(w,w.person.id),calls=w.native.calls.length;
 assert.equal((await w.save({...grants,cash_mode:'PURCHASES'})).status,303);assert.deepEqual(w.grants(),before);assert.deepEqual(w.cash(),previous);assert.equal(teamRevision(w,w.person.id),revision);assert.equal(w.native.calls.length,calls);
});
test('permisos inválidos no cambian Caja ni servicios y conservan el borrador',async t=>{
 const w=await setup(t,{'WEB.VIEW':'yes'});
 for(const data of [{'SOCIAL.APPROVE':'yes'},{'ADMIN.VIEW':'yes'},{'WALLET_CUSTOMERS.EDIT':'yes'}]){const r=await w.save({cash_mode:'BOTH',...data});assert.equal(r.status,400);assert.match(r.body,/<option value="BOTH" selected>/);assert.equal(w.cash(),undefined);assert.deepEqual(w.grants(),['WEB.VIEW']);}
 assert.equal([...w.native.staff.values()].filter(p=>p.role==='CASHIER').length,0);
});
test('sucursal ajena, modo inventado y datos incompletos no guardan permisos parciales',async t=>{
 const w=await setup(t,{'WEB.VIEW':'yes'}),other=await owner(w,'Otra empresa','6'),tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',other.id).loyalty_tenant;
 for(const data of [{cash_mode:'OWNER'},{cash_mode:'BOTH',branch:''},{cash_mode:'BOTH',branch:w.native.branches.get(tenant)[0].id}]){assert.equal((await w.save({...data,'SOCIAL.VIEW':'yes'})).status,400);assert.deepEqual(w.grants(),['WEB.VIEW']);assert.equal(w.cash(),undefined);}
});
test('formularios vencidos no sobrescriben Caja ni servicios y mantienen revisión y selección',async t=>{
 const w=await setup(t),old=teamRevision(w,w.person.id);await w.save({cash_mode:'PURCHASES','WEB.VIEW':'yes'});
 const r=await w.save({revision:old,cash_mode:'REWARDS','SOCIAL.VIEW':'yes'});assert.equal(r.status,409);assert.match(r.body,new RegExp('name="revision" value="'+old+'"'));assert.match(r.body,/<option value="REWARDS" selected>/);assert.match(r.body,/name="SOCIAL.VIEW" value="yes" checked/);assert.equal(w.cash().purchases,1);assert.equal(w.cash().rewards,0);assert.deepEqual(w.grants(),['WEB.VIEW']);
});
test('se pueden modificar servicios durante una caída sin tocar la Caja guardada',async t=>{
 const w=await setup(t);await w.save({cash_mode:'BOTH'});const cash=w.cash();w.native.unavailable(true);
 assert.equal((await w.save({cash_mode:'BOTH','SOCIAL.VIEW':'yes'})).status,303);assert.deepEqual(w.cash(),cash);assert.deepEqual(w.grants(),['SOCIAL.VIEW']);
 const page=await w.business.client.get('/team/'+w.person.id);assert.equal(page.status,200);assert.match(page.body,/No se pudieron consultar las sucursales/);assert.match(page.body,new RegExp('value="'+w.branch+'" selected'));assert.match(page.body,/<option value="BOTH" selected>/);
});
test('una caída al asignar Caja no publica los nuevos permisos de servicios',async t=>{
 const w=await setup(t,{'WEB.VIEW':'yes'});w.native.unavailable(true);const r=await w.save({cash_mode:'BOTH','SOCIAL.VIEW':'yes'});assert.equal(r.status,503);assert.deepEqual(w.grants(),['WEB.VIEW']);assert.equal(w.cash(),undefined);assert.match(r.body,/name="SOCIAL.VIEW" value="yes" checked/);
});
test('retirar Caja bloquea de inmediato y guarda el resto del acceso aunque Wallet esté caído',async t=>{
 const w=await setup(t);await w.save({cash_mode:'BOTH','WEB.VIEW':'yes'});const staff=w.cash().staff_id;w.native.unavailable(true);
 const r=await w.save({'SOCIAL.VIEW':'yes'});assert.equal(r.status,503);assert.equal(w.cash().status,'REVOKING');assert.deepEqual(w.grants(),['SOCIAL.VIEW']);assert.match(r.body,/Caja ya está bloqueada/);assert.equal((await w.person.session.get('/cashier')).status,403);assert.equal((await w.person.session.get('/content')).status,200);assert.equal((await w.person.session.get('/services/web')).status,403);
 w.native.unavailable(false);assert.equal((await w.save({'SOCIAL.VIEW':'yes'})).status,303);assert.equal(w.cash().status,'INACTIVE');assert.equal(w.cash().sealed_token,null);assert.equal(w.native.staff.get(staff).state,'INACTIVE');
});
test('operaciones y sucursal se aplican a la sesión abierta sin permitir la anterior',async t=>{
 const w=await setup(t);await w.save({cash_mode:'PURCHASES'});const other={id:uuid(),name:'Sucursal nueva'};w.native.branches.get(w.tenant).push(other);assert.equal((await w.save({cash_mode:'REWARDS',branch:other.id})).status,303);
 const body={branchId:other.id,memberId:uuid(),amountMinor:1000};assert.equal((await w.person.session.post('/api/staff/purchases',body,{json:true})).status,403);assert.equal((await w.person.session.post('/api/staff/counter-redemptions',body,{json:true})).status,200);assert.equal((await w.person.session.post('/api/staff/counter-redemptions',{...body,branchId:w.branch},{json:true})).status,403);
});
test('agencia, colaborador y dueño ajeno no pueden guardar el formulario unificado',async t=>{
 const w=await setup(t),other=await owner(w,'Otro dueño','5');for(const actor of [w.admin,w.person.session,other.client])assert.equal((await actor.post('/team/'+w.person.id+'/access',{revision:teamRevision(w,w.person.id),cash_mode:'BOTH',branch:w.branch})).status,actor===other.client?404:403);assert.equal(w.cash(),undefined);assert.deepEqual(w.grants(),[]);
});
test('el guardado requiere CSRF e ignora tokens o rol enviado por el navegador',async t=>{
 const w=await setup(t);assert.equal((await w.business.client.post('/team/'+w.person.id+'/access',{revision:teamRevision(w,w.person.id),cash_mode:'BOTH',branch:w.branch,_csrf:'incorrecto'})).status,403);
 assert.equal((await w.save({cash_mode:'BOTH',role:'OWNER',credential:'inventada'})).status,303);assert.equal(w.native.staff.get(w.cash().staff_id).role,'CASHIER');assert.equal(w.db.get('SELECT kind FROM accounts WHERE id=?',w.person.id).kind,'COLLABORATOR');
});
test('guardar los permisos de una cuenta desactivada no la reactiva',async t=>{
 const w=await setup(t);await w.business.client.post('/team/'+w.person.id+'/disable',{revision:teamRevision(w,w.person.id),confirm:'yes'});assert.equal((await w.save({'WEB.VIEW':'yes'})).status,303);assert.equal(w.db.get('SELECT active FROM accounts WHERE id=?',w.person.id).active,0);const denied=await w.person.session.get('/services/web');assert.equal(denied.status,303);assert.equal(denied.location,'/');assert.equal((await w.save({cash_mode:'BOTH'})).status,409);assert.deepEqual(w.grants(),['WEB.VIEW']);
});
async function interrupted(w){
 let enter,release;const reached=new Promise(r=>enter=r),held=new Promise(r=>release=r);w.native.beforeRequest(async call=>{if(call.path==='/api/staff/credentials'){enter();await held;}});
 const pending=w.save({cash_mode:'BOTH','SOCIAL.VIEW':'yes'});await reached;assert.equal((await w.business.client.post('/team/'+w.person.id+'/permissions',{revision:teamRevision(w,w.person.id),'WEB.VIEW':'yes'})).status,303);release();assert.equal((await pending).status,409);w.native.beforeRequest(null);
}
test('un cambio concurrente cancela el borrador; el alta pendiente se puede retirar sin activarla',async t=>{
 const w=await setup(t);await interrupted(w);assert.deepEqual(w.grants(),['WEB.VIEW']);assert.equal(w.cash().status,'PENDING');assert.equal((await w.person.session.get('/cashier')).status,403);
 assert.equal((await w.save({'WEB.VIEW':'yes'})).status,303);assert.equal(w.cash().status,'INACTIVE');assert.equal([...w.native.staff.values()].filter(p=>p.role==='CASHIER').length,1);assert.equal(w.native.staff.get(w.cash().staff_id).state,'INACTIVE');
});
test('un alta pendiente se reintenta sin duplicar Caja ni auditorías de permisos',async t=>{
 const w=await setup(t);await interrupted(w);assert.equal((await w.save({cash_mode:'BOTH','SOCIAL.VIEW':'yes'})).status,303);assert.equal(w.cash().status,'ACTIVE');assert.equal([...w.native.staff.values()].filter(p=>p.role==='CASHIER').length,1);assert.deepEqual(w.grants(),['SOCIAL.VIEW']);
 const count=w.db.get("SELECT count(*) n FROM audit WHERE subject_id=? AND action='PERMISOS_ACTUALIZADOS'",w.person.id).n;await w.save({cash_mode:'BOTH','SOCIAL.VIEW':'yes'});assert.equal(w.db.get("SELECT count(*) n FROM audit WHERE subject_id=? AND action='PERMISOS_ACTUALIZADOS'",w.person.id).n,count);
});
test('fallo al confirmar retiro no habilita Caja ni pierde el nuevo acceso',async t=>{
 const w=await setup(t);await w.save({cash_mode:'BOTH'});w.native.unavailable(true);await w.save({'WEB.VIEW':'yes'});const r=await w.save({'SOCIAL.VIEW':'yes'});assert.equal(r.status,503);assert.equal(w.cash().status,'REVOKING');assert.deepEqual(w.grants(),['SOCIAL.VIEW']);assert.match(r.body,new RegExp('name="revision" value="'+teamRevision(w,w.person.id)+'"'));
});
test('un fallo de retiro conserva su revisión propia y no autoriza sobrescribir cambios posteriores',async t=>{
 const w=await setup(t);await w.save({cash_mode:'BOTH'});let enter,release;const reached=new Promise(r=>enter=r),held=new Promise(r=>release=r);
 w.native.beforeRequest(async call=>{if(call.path==='/api/staff/team'){enter();await held;w.native.unavailable(true);}});
 const pending=w.save({'SOCIAL.VIEW':'yes'});await reached;const committed=teamRevision(w,w.person.id);
 assert.equal((await w.business.client.post('/team/'+w.person.id+'/permissions',{revision:committed,'WEB.VIEW':'yes'})).status,303);
 release();const failed=await pending;assert.equal(failed.status,503);assert.match(failed.body,new RegExp('name="revision" value="'+committed+'"'));assert.notEqual(committed,teamRevision(w,w.person.id));
 w.native.beforeRequest(null);w.native.unavailable(false);assert.equal((await w.save({revision:committed,'SOCIAL.VIEW':'yes'})).status,409);assert.deepEqual(w.grants(),['WEB.VIEW']);assert.equal(w.cash().status,'REVOKING');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {portal,agency,owner,colleague} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
import {businessControl,requestBusinessChange,createBusinessControlSync,requireOperating} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/control.mjs';
import {paymentInput,chargeInput} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/billing/payment-input.mjs';
const newId=randomUUID;
async function world(t){
 const accesses=new Map(),replies=new Map(),calls=[],rows=new Map();let fail=false,drop=false;
 const state=id=>{if(!accesses.has(id))accesses.set(id,{state:'ACTIVE',version:1});return accesses.get(id);};
 const account=(id,offset=0)=>{
  if(!rows.has(id))rows.set(id,{invoice:newId(),payments:[],paid:0});const row=rows.get(id);
  return {today:'2026-11-13',business:{id,name:'Negocio de prueba'},access:state(id),summary:{balanceMinor:5000-row.paid,overdueMinor:0,invoiceCount:101},membership:null,
   invoices:[{id:row.invoice,description:'Servicio acordado',amountMinor:5000,paidMinor:row.paid,remainingMinor:5000-row.paid,status:row.paid===5000?'PAID':row.paid?'PARTIAL':'OPEN'}],payments:row.payments,paymentCount:row.payments.length,offset};
 };
 const loyalty=await fakeLoyalty(t,null,{account:async(company,url)=>account(company.id,Number(url.searchParams.get('offset')||0)),administration:async call=>{
  calls.push(call);const id=call.path.split('/')[4],operation=call.path.split('/')[5];
  if(fail)return {status:503,body:{message:'Sin conexión temporal'}};
  if(call.method==='GET')return {body:operation==='access'?state(id):account(id,Number(call.url.searchParams.get('offset')||0))};
  const key=call.payload?.commandId||call.key;
  if(replies.has(key))return {body:{...replies.get(key),replayed:true}};
  let result;
  if(operation==='access'){
   if(call.payload.expectedVersion!==state(id).version)return {status:409,body:{code:'VERSION_CONFLICT',message:'El estado cambió'}};
   result={state:call.payload.state,version:state(id).version+1};accesses.set(id,result);
  }else if(operation==='payments'){
   const record=account(id),row=rows.get(id);
   if(call.payload.invoiceId!==row.invoice)return {status:404,body:{message:'Cargo ajeno'}};
   if(call.payload.amountMinor>record.invoices[0].remainingMinor)return {status:409,body:{message:'El importe supera el saldo'}};
   if(row.payments.some(p=>p.reference===call.payload.reference))return {status:409,body:{message:'Referencia repetida'}};
   const payment={id:newId(),...call.payload};row.payments.push(payment);row.paid+=payment.amountMinor;result={id:payment.id};
  }else result={id:newId()};
  replies.set(key,result);if(drop){drop=false;return {drop:true};}return {body:result};
 }});
 const w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken});const admin=await agency(w),o=await owner(w,'Primer negocio',1),other=await owner(w,'Segundo negocio',2);
 const actor=w.db.get("SELECT * FROM accounts WHERE kind='AGENCY'");
 return {...w,...o,other,admin,actor,loyalty,calls,accesses,rows,base:'/administracion/negocios/'+o.id,
  outage:value=>{fail=value;},drop:()=>{drop=true;},account,
  command:(state='SUSPENDED',revision=0)=>({state,reason:'Revisión solicitada por administración',confirm:'yes',requestKey:newId(),revision:String(revision)})};
}
test('agency has an administration entry while owner and collaborator cannot administer businesses',async t=>{
 const w=await world(t);const member=await colleague(w,w.client,{name:'Persona',email:'persona@example.test',view:['WALLET']});
 assert.match((await w.admin.get('/clientes')).body,new RegExp(w.base));
 assert.equal((await w.admin.get(w.base)).status,200);
 for(const actor of [w.client,w.other.client,member.session]){assert.equal((await actor.get(w.base)).status,403);assert.equal((await actor.post(w.base+'/estado',w.command())).status,403);}
 assert.equal(w.db.get('SELECT count(*) n FROM business_commands').n,0);
 assert.equal((await w.admin.post('/solicitudes?empresa='+w.id,{title:'Impersonar'})).status,403);
});
test('suspension blocks services and Wallet immediately and preserves another business and account access',async t=>{
 const w=await world(t),before={...w.db.get('SELECT * FROM companies WHERE id=?',w.id)};
 const result=await w.admin.post(w.base+'/estado',w.command());assert.equal(result.status,303,result.body);
 assert.equal(businessControl(w.db,w.id).state,'SUSPENDED');
 for(const path of ['/wallet','/contenido','/solicitudes','/agenda','/planes','/caja','/wallet-api/api/staff/dashboard'])assert.equal((await w.client.get(path)).status,423,path);
 assert.equal((await w.client.post('/solicitudes',{title:'No debe crearse'})).status,423);
 for(const path of ['/inicio','/cuenta','/ayuda','/mi-estado-cuenta'])assert.equal((await w.client.get(path)).status,200,path);
 assert.equal((await w.other.client.get('/contenido')).status,200);
 assert.deepEqual({...w.db.get('SELECT * FROM companies WHERE id=?',w.id)},before);
 const log=w.db.get("SELECT actor_name FROM audit WHERE action='CONTROL_APLICADO'");assert.equal(log.actor_name,'Equipo Lúmina');
});
test('state changes require confirmation CSRF valid reason and current revision',async t=>{
 const w=await world(t);
 for(const bad of [{confirm:''},{state:'DELETED'},{reason:'x'},{revision:'-1'},{_csrf:'incorrecto'}])assert.ok([400,403].includes((await w.admin.post(w.base+'/estado',{...w.command(),...bad})).status));
 assert.equal(w.db.get('SELECT count(*) n FROM business_commands').n,0);
 assert.equal((await w.admin.post(w.base+'/estado',w.command())).status,303);
 assert.equal((await w.admin.post(w.base+'/estado',w.command('ACTIVE'))).status,409);
});
test('provider outage leaves a durable visible block and explicit retry completes the same command',async t=>{
 const w=await world(t);w.outage(true);const command=w.command('PAUSED');
 assert.equal((await w.admin.post(w.base+'/estado',command)).status,503);
 assert.equal(businessControl(w.db,w.id).pending_id,command.requestKey);
 assert.equal((await w.client.get('/wallet')).status,423);
 w.outage(false);assert.equal((await w.admin.post(w.base+'/reintentar',{confirm:'yes'})).status,303);
 assert.equal(businessControl(w.db,w.id).state,'PAUSED');assert.equal(businessControl(w.db,w.id).pending_id,null);
 assert.equal(w.db.get('SELECT count(*) n FROM business_commands').n,1);
});
test('lost acknowledgement and replay do not apply suspension twice',async t=>{
 const w=await world(t);w.drop();const command=w.command();
 assert.equal((await w.admin.post(w.base+'/estado',command)).status,503);
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant;
 assert.equal(w.accesses.get(tenant).version,2);
 assert.equal((await w.admin.post(w.base+'/estado',command)).status,303);
 assert.equal(w.accesses.get(tenant).version,2);assert.equal(businessControl(w.db,w.id).revision,1);
});
test('reactivation stays blocked until native confirmation and reuses the original tenant',async t=>{
 const w=await world(t);await w.admin.post(w.base+'/estado',w.command());
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant;
 w.outage(true);assert.equal((await w.admin.post(w.base+'/estado',w.command('ACTIVE',1))).status,503);
 assert.equal((await w.client.get('/contenido')).status,423);
 w.outage(false);await w.admin.post(w.base+'/reintentar',{confirm:'yes'});
 assert.equal((await w.client.get('/contenido')).status,200);
 assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,tenant);
});
test('an independently changed native version requires explicit review and retry',async t=>{
 const w=await world(t);w.outage(true);const command=w.command();await w.admin.post(w.base+'/estado',command);w.outage(false);
 w.db.run('UPDATE business_commands SET native_version=0 WHERE id=?',command.requestKey);
 assert.equal((await w.admin.post(w.base+'/reintentar',{})).status,400);
 assert.equal((await w.admin.post(w.base+'/reintentar',{confirm:'yes'})).status,303);
 assert.equal(businessControl(w.db,w.id).pending_id,null);
});
test('recreated synchronizer recovers persisted commands with no credentials or identity changes',async t=>{
 const w=await world(t),command=w.command();requestBusinessChange(w.db,w.actor,w.id,command);
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant;
 const ensureCompany=async()=>({loyalty_tenant:tenant});let remoteState={state:'ACTIVE',version:1};
 const remote=async(id,action,options)=>options?(remoteState={state:options.body.state,version:options.body.expectedVersion+1}):remoteState;
 const recovered=createBusinessControlSync({db:w.db,remote,ensureCompany});await recovered.sweep();
 assert.equal(businessControl(w.db,w.id).pending_id,null);assert.throws(()=>requireOperating(w.db,w.id),e=>e.status===423);
 assert.equal(w.db.get('SELECT count(*) n FROM business_commands').n,1);
});
test('payment validation preserves exact cents and rejects invalid values before native calls',()=>{
 const good={confirm:'yes',requestKey:newId(),invoiceId:newId(),amount:'4.99',method:'TRANSFER',paidOn:'2026-11-13',reference:'REC-001'};
 assert.equal(paymentInput(good).amountMinor,499);assert.equal(paymentInput({...good,amount:'50'}).amountMinor,5000);
 for(const amount of ['0','-1','0.001','4,99','1e3','NaN','Infinity',' 5'])assert.throws(()=>paymentInput({...good,amount}));
 assert.throws(()=>paymentInput({...good,confirm:''}));assert.throws(()=>paymentInput({...good,method:'INVENTADO'}));
 assert.equal(chargeInput({...good,description:'Servicio acordado',dueOn:'2026-12-01'}).amountMinor,499);
});
test('admin records payment and business reads the same ledger without mutation authority',async t=>{
 const w=await world(t);await w.admin.get(w.base);
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,invoice=w.account(tenant).invoices[0].id;
 const data={confirm:'yes',requestKey:newId(),invoiceId:invoice,amount:'4.99',method:'TRANSFER',paidOn:'2026-11-13',reference:'REC-001'};
 assert.equal((await w.client.post(w.base+'/pago',data)).status,403);
 assert.equal((await w.admin.post(w.base+'/pago',data)).status,303);
 const view=await w.client.get('/mi-estado-cuenta');assert.equal(view.status,200);assert.match(view.body,/REC-001/);assert.doesNotMatch(view.body,/Registrar pago|Revertir registro|Anular cargo/);
 assert.equal(w.rows.get(tenant).paid,499);assert.equal(w.db.get("SELECT actor_name FROM audit WHERE action='CUENTA_PAGO'").actor_name,'Equipo Lúmina');
});
test('payment retry is idempotent and validation error retains its reference and operation key',async t=>{
 const w=await world(t);await w.admin.get(w.base);
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,invoice=w.account(tenant).invoices[0].id;
 const data={confirm:'yes',requestKey:newId(),invoiceId:invoice,amount:'50',method:'TRANSFER',paidOn:'2026-11-13',reference:'REC-RETRY'};
 w.drop();assert.equal((await w.admin.post(w.base+'/pago',data)).status,503);
 assert.equal((await w.admin.post(w.base+'/pago',data)).status,303);assert.equal(w.rows.get(tenant).payments.length,1);
 const otherTenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.other.id).loyalty_tenant;
 const bad={...data,invoiceId:w.account(otherTenant).invoices[0].id,requestKey:newId(),amount:'51',reference:'BORRADOR'};
 const result=await w.admin.post('/administracion/negocios/'+w.other.id+'/pago',bad);assert.equal(result.status,409);
 assert.match(result.body,/value="BORRADOR"/);assert.match(result.body,new RegExp(bad.requestKey));
});
test('account pagination is forwarded exactly and no tenant in posted data overrides selected company',async t=>{
 const w=await world(t);assert.equal((await w.admin.get(w.base+'?offset=100')).status,200);
 assert.equal(w.calls.at(-1).url.searchParams.get('offset'),'100');
 assert.equal((await w.admin.get(w.base+'?offset=-1')).status,400);
 const tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant;
 const before=w.calls.length;
 assert.equal((await w.admin.post(w.base+'/pago',{confirm:'yes',requestKey:newId(),invoiceId:newId(),amount:'5',method:'CASH',paidOn:'2026-11-13',reference:'AJENO',companyId:w.other.id})).status,404);
 assert.ok(w.calls.slice(before).filter(x=>x.method==='POST').every(x=>x.path.includes('/'+tenant+'/')));
});

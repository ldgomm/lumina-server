import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { agency, colleague, owner, portal } from './helpers.mjs';
import { localDay, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
import { monthlyEnd } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/memberships/orders.mjs';
import { openDatabase } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
const selected= (p,id)=>'/agencia'+p+'?empresa='+id;
const identifier=response=>response.location?.split('?')[0].split('/').at(-1);
async function setup(t) {
  const w=await portal(t),admin=await agency(w),{client,id}=await owner(w,'Comercio de prueba','1');
  await admin.post(selected('/clientes/verificar',id));
  return {...w,admin,client,id};
}
async function plan(w,name,term,price,items={VIDEO:'2'},wallet='NONE') {
  assert.equal((await w.admin.post('/planes',{name,term,price,...items,wallet})).status,303);
  return w.db.get('SELECT id FROM plans WHERE name=?',name).id;
}
async function submit(w,choices,extra={}) {
  const data={key:uuid(),...Object.fromEntries(choices.map(([p,n])=>['qty_'+p,String(n)])),...extra};
  const result=await w.client.post('/planes/solicitar',data);assert.equal(result.status,303,result.body);
  return {id:identifier(result),path:result.location,data};
}
function quotation(w,id,extra={}) {
  const data={revision:String(w.db.get('SELECT revision FROM package_orders WHERE id=?',id).revision),terms:'Incluye producción y una revisión. Pago acordado directamente.'};
  for(const line of w.db.all('SELECT * FROM package_order_lines WHERE order_id=?',id)) {
    data['price_'+line.id]=line.unit_minor===null?'49.95':(line.unit_minor/100).toFixed(2);
    data['start_'+line.id]=localDay();data['end_'+line.id]='2099-12-01';
  }
  return {...data,...extra};
}
async function accepted(w,order,overrides={}) {
  assert.equal((await w.admin.post(selected(order.path+'/cotizar',w.id),quotation(w,order.id,overrides))).status,303);
  const revision=String(w.db.get('SELECT revision FROM package_orders WHERE id=?',order.id).revision);
  assert.equal((await w.client.post(order.path+'/aceptar',{revision,confirm:'yes'})).status,303);
  return revision;
}

test('combinación mensual y puntual: precios exactos, cantidades, aceptación y activación idempotente sin tocar Wallet',async t=>{
  const w=await setup(t),monthly=await plan(w,'Videos mensuales','MONTHLY','99.95'),single=await plan(w,'Logo puntual','ONE_OFF','70.10',{LOGO:'1'});
  const tenant=uuid();w.db.run('UPDATE companies SET loyalty_tenant=? WHERE id=?',tenant,w.id);
  const o=await submit(w,[[monthly,2],[single,1]],{price:'0',amount:'0'});
  assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);
  const view=await w.client.get(o.path);assert.equal(view.status,200);assert.match(view.body,/Por mes/);assert.match(view.body,/Una sola vez/);assert.match(view.body,/199,90|199\.90/);assert.match(view.body,/70,10|70\.10/);
  assert.equal((await w.admin.post(selected(o.path+'/activar',w.id),{revision:'1'})).status,409);
  const rev=await accepted(w,o);
  const activation=()=>w.admin.post(selected(o.path+'/activar',w.id),{revision:rev});
  assert.ok((await Promise.all([activation(),activation()])).every(r=>r.status===303));
  const contracts=w.db.all('SELECT * FROM contracts');assert.equal(contracts.length,2);
  assert.equal(contracts.find(c=>c.plan_id===monthly).agreed_minor,19990);assert.equal(contracts.find(c=>c.plan_id===monthly).units,2);
  assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,tenant);
  const overview=await w.client.get('/planes?vista=acuerdos');assert.equal(overview.status,200);assert.match(overview.body,/ambos días incluidos/);assert.doesNotMatch(overview.body,/fin exclusivo/);
  const request=await w.client.post('/solicitudes',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'5',title:'Producción con cupo',brief:''});
  await w.admin.post(selected(request.location+'/estado',w.id),{status:'APPROVED'});
  const contract=contracts.find(c=>c.plan_id===monthly);
  for(let i=0;i<4;i++)assert.equal((await w.admin.post(selected(request.location+'/piezas',w.id),{title:'Pieza '+i,contract:contract.id})).status,303);
  assert.equal((await w.admin.post(selected(request.location+'/piezas',w.id),{title:'Quinta sin cupo',contract:contract.id})).status,409);
  await w.admin.post(selected('/planes/cancelar',w.id),{contract:contract.id,reason:'Cambio solicitado por cliente'});
  assert.equal(w.db.get('SELECT count(*) n FROM contracts WHERE cancelled_at IS NULL').n,1);
  assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,tenant);
});

test('ofertas a medida, consentimiento y versiones: nunca se acepta un total incompleto ni una propuesta antigua',async t=>{
  const w=await setup(t),a=await plan(w,'Web a medida','ONE_OFF','',{WEBSITE:'1'}),b=await plan(w,'Redes mensual','MONTHLY','40');
  const o=await submit(w,[[a,1],[b,1]]);
  assert.match((await w.client.get(o.path)).body,/aún no hay total definitivo/);
  assert.equal((await w.client.post(o.path+'/aceptar',{revision:'1',confirm:'yes'})).status,409);
  const custom=w.db.get('SELECT id FROM package_order_lines WHERE plan_id=?',a).id;
  assert.equal((await w.admin.post(selected(o.path+'/cotizar',w.id),quotation(w,o.id,{['price_'+custom]:''}))).status,400);
  assert.equal(w.db.get('SELECT status FROM package_orders').status,'REQUESTED');
  const first=quotation(w,o.id);assert.equal((await w.admin.post(selected(o.path+'/cotizar',w.id),first)).status,303);
  assert.equal((await w.client.post(o.path+'/aceptar',{revision:'2'})).status,400);
  assert.equal((await w.admin.post(selected(o.path+'/cotizar',w.id),quotation(w,o.id,{['price_'+custom]:'55.15'}))).status,303);
  assert.equal((await w.client.post(o.path+'/aceptar',{revision:'2',confirm:'yes'})).status,409);
  await w.admin.post('/planes/retirar',{plan:a});
  assert.equal((await w.client.post(o.path+'/aceptar',{revision:'3',confirm:'yes'})).status,303);
  assert.equal((await w.admin.post(selected(o.path+'/cotizar',w.id),quotation(w,o.id))).status,409);
  assert.equal((await w.admin.post(selected(o.path+'/activar',w.id),{revision:'3'})).status,303);
  assert.equal(w.db.get('SELECT agreed_minor FROM contracts WHERE plan_id=?',a).agreed_minor,5515);
  assert.equal(w.db.get('SELECT count(*) n FROM audit WHERE subject=? AND action=?','ORDER','PROPUESTA_PREPARADA').n,2);
});

test('contrataciones aisladas por negocio, dueño y CSRF; un permiso de contenido no concede acceso a precios',async t=>{
  const w=await setup(t),a=await plan(w,'Solo videos','MONTHLY','10'),o=await submit(w,[[a,1]]);
  const other=await owner(w,'Otro cliente','2');
  assert.equal((await other.client.get(o.path+'?empresa='+w.id)).status,404);
  assert.equal((await other.client.post(o.path+'/aceptar',{revision:'1',confirm:'yes'})).status,404);
  assert.equal((await w.client.post(o.path+'/cotizar',quotation(w,o.id))).status,403);
  assert.equal((await w.client.post('/planes/solicitar',{key:uuid(),['qty_'+a]:'1',_csrf:'bad'})).status,403);
  const collaborator=await colleague(w,w.client,{name:'Editor',email:'editor@example.test','SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes'});
  assert.equal((await collaborator.session.get('/planes')).status,403);
  assert.equal((await collaborator.session.get(o.path)).status,403);
  assert.equal((await collaborator.session.post('/planes/solicitar',{key:uuid(),['qty_'+a]:'1'})).status,403);
  assert.equal((await w.admin.get('/planes?vista=contrataciones')).status,200);
});

test('selección valida límites y retiro; reintento del envío conserva una única combinación',async t=>{
  const w=await setup(t),a=await plan(w,'Servicio independiente','MONTHLY','10.25');
  for(const qty of ['-1','1.5','11','NaN'])assert.equal((await w.client.post('/planes/solicitar',{key:uuid(),['qty_'+a]:qty})).status,400);
  assert.equal((await w.client.post('/planes/solicitar',{key:uuid()})).status,400);
  assert.equal(w.db.get('SELECT count(*) n FROM package_orders').n,0);
  const o=await submit(w,[[a,3]]);
  assert.equal((await w.client.post('/planes/solicitar',o.data)).location,o.path);
  assert.equal(w.db.get('SELECT count(*) n FROM package_order_lines').n,1);
  await w.admin.post('/planes/retirar',{plan:a});
  assert.equal((await w.client.post('/planes/solicitar',{key:uuid(),['qty_'+a]:'1'})).status,409);
  assert.equal(w.db.get('SELECT count(*) n FROM package_orders').n,1);
});

test('el mismo paquete se puede añadir de nuevo: cada contratación tiene su propio cupo y cancelación',async t=>{
  const w=await setup(t),a=await plan(w,'Solo stories','MONTHLY','15',{STORY:'3'});
  for(let i=0;i<2;i++){const o=await submit(w,[[a,1]]),revision=await accepted(w,o);assert.equal((await w.admin.post(selected(o.path+'/activar',w.id),{revision})).status,303);}
  assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,2);
  assert.equal(w.db.get('SELECT sum(agreed_minor) n FROM contracts').n,3000);
});

test('renovación conserva el día de corte, evita duplicados y exige aceptación de cada período',async t=>{
  assert.equal(monthlyEnd('2028-01-31'),'2028-02-29');assert.equal(monthlyEnd('2028-02-29','2028-01-31'),'2028-03-31');
  assert.equal(monthlyEnd('2027-02-28','2027-01-31'),'2027-03-31');assert.equal(monthlyEnd('2028-12-31'),'2029-01-31');
  const w=await setup(t),a=await plan(w,'Mensual renovable','MONTHLY','25');
  const o=await submit(w,[[a,2]]),line=w.db.get('SELECT id FROM package_order_lines WHERE order_id=?',o.id);
  const revision=await accepted(w,o,{['start_'+line.id]:'2090-01-31'});await w.admin.post(selected(o.path+'/activar',w.id),{revision});
  const first=w.db.get('SELECT * FROM contracts');assert.equal(first.ends_before,'2090-02-28');
  const r=await submit(w,[],{renewal:first.id});
  assert.equal((await w.client.post('/planes/solicitar',{key:uuid(),renewal:first.id})).status,409);
  const nextVersion=await accepted(w,r);await w.admin.post(selected(r.path+'/activar',w.id),{revision:nextVersion});
  const next=w.db.get('SELECT * FROM contracts WHERE renewal_of=?',first.id);
  assert.equal(next.starts_on,'2090-02-28');assert.equal(next.ends_before,'2090-03-31');assert.equal(next.units,2);assert.equal(next.agreed_minor,5000);
  assert.equal((await w.client.post('/planes/solicitar',{key:uuid(),renewal:first.id})).status,409);
});

test('activar una combinación es atómico: un fallo en un acuerdo no deja otros activados',async t=>{
  const w=await setup(t),a=await plan(w,'A primero','MONTHLY','10'),b=await plan(w,'B segundo','MONTHLY','20');
  const o=await submit(w,[[a,1],[b,1]]),revision=await accepted(w,o);
  w.db.run(`CREATE TRIGGER reject_second BEFORE INSERT ON contracts WHEN NEW.plan_id='${b}' BEGIN SELECT RAISE(ABORT,'simulated'); END`);
  assert.equal((await w.admin.post(selected(o.path+'/activar',w.id),{revision})).status,500);
  assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);
  assert.equal(w.db.get('SELECT status FROM package_orders').status,'ACCEPTED');
  w.db.run('DROP TRIGGER reject_second');assert.equal((await w.admin.post(selected(o.path+'/activar',w.id),{revision})).status,303);
  assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,2);
});

test('cancelar una propuesta conserva historia y no activa sus servicios',async t=>{
  const w=await setup(t),a=await plan(w,'Oferta cancelable','ONE_OFF','10'),o=await submit(w,[[a,1]]);
  assert.equal((await w.client.post(o.path+'/cancelar',{revision:'1',reason:'Cambio de idea del cliente'})).status,303);
  assert.equal((await w.admin.post(selected(o.path+'/cotizar',w.id),quotation(w,o.id))).status,409);
  assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);assert.equal(w.db.get('SELECT count(*) n FROM package_order_lines').n,1);
});

test('SQLite v3 a v4: respaldo privado, contratos y vínculos existentes intactos y migración idempotente',()=>{
  const dir=mkdtempSync(join(tmpdir(),'lumina-v4-')),path=join(dir,'agency.sqlite');
  const sql=name=>readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/'+name,import.meta.url),'utf8');
  try{
    const raw=new DatabaseSync(path);for(const file of ['schema.sql','migrations/002_unified.sql','migrations/003_onboarding.sql'])raw.exec(sql(file));raw.exec('PRAGMA user_version=3');
    const company=uuid(),account=uuid(),tenant=uuid(),planId=uuid(),contract=uuid();
    raw.prepare('INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at,loyalty_tenant) VALUES(?,?,?,?,?,?,?)').run(company,'Persistencia','private','1234','0990000000','2026-10-01',tenant);
    raw.prepare("INSERT INTO accounts(id,company_id,name,email,kind) VALUES(?,?,?,?,'OWNER')").run(account,company,'Dueño','owner@example.test');
    raw.prepare("INSERT INTO wallet_access VALUES(?,?,?,?,?,?,?,'ACTIVE',?)").run(account,company,tenant,uuid(),'Acceso',uuid(),'ciphertext-sin-cambios','2026-10-01');
    raw.prepare("INSERT INTO plans(id,name,term,price_minor,wallet,description,created_at) VALUES(?,?,'MONTHLY',1000,'NONE','','2026-10-01')").run(planId,'Histórico');
    raw.prepare('INSERT INTO plan_items VALUES(?,?,?)').run(planId,'VIDEO',3);
    raw.prepare('INSERT INTO contracts(id,company_id,plan_id,agreed_minor,starts_on,ends_before,created_at) VALUES(?,?,?,1000,?,?,?)').run(contract,company,planId,'2026-10-01','2026-11-01','2026-10-01');
    const prior=raw.prepare('SELECT * FROM contracts').get(),wallet=raw.prepare('SELECT * FROM wallet_access').all();raw.close();
    let db=openDatabase(path);const migrated=db.get('SELECT * FROM contracts');
    for(const key of Object.keys(prior))assert.equal(migrated[key],prior[key]);assert.equal(migrated.units,1);assert.deepEqual(db.all('SELECT * FROM wallet_access'),wallet);assert.equal(db.get('PRAGMA user_version').user_version,7);db.close();
    const files=readdirSync(join(dir,'migrations'));assert.equal(files.length,1);assert.equal(statSync(join(dir,'migrations',files[0])).mode&0o777,0o600);
    const backup=new DatabaseSync(join(dir,'migrations',files[0]),{readOnly:true});assert.equal(backup.prepare('PRAGMA user_version').get().user_version,3);assert.deepEqual(backup.prepare('SELECT * FROM contracts').get(),prior);backup.close();
    db=openDatabase(path);assert.deepEqual(db.all('PRAGMA foreign_key_check'),[]);db.close();assert.equal(readdirSync(join(dir,'migrations')).length,1);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

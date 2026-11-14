import test from 'node:test';
import assert from 'node:assert/strict';
import { agency, colleague, documentFor, owner, portal } from './helpers.mjs';
import { notificationRows, notifications, seeNotification } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/notifications.mjs';
import { uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const selected=(path,id)=>'/agency'+path+'?company='+id;
async function setup(t){const w=await portal(t),admin=await agency(w),o=await owner(w,'Avisos del negocio','notice');await admin.post(selected('/businesses/verify',o.id));const actor={...w.db.get("SELECT * FROM accounts WHERE company_id=? AND kind='OWNER'",o.id),grants:[]};return {...w,...o,admin,actor};}
async function request(w){const res=await w.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Plato de temporada',phone:'0991234567'});assert.equal(res.status,303);return res.location;}
async function reviewing(w){const path=await request(w);await w.admin.post(selected(path+'/state',w.id),{status:'APPROVED'});await w.admin.post(selected(path+'/pieces',w.id),{title:'Video de temporada'});const p=w.db.get('SELECT * FROM pieces WHERE request_id=?',path.split('/').at(-1));await w.admin.post(selected(path+'/pieces/'+p.id+'/edit',w.id),{status:'REVIEW',revision:String(p.revision)});return {path,p};}
const rows=w=>notificationRows(w.db,w.actor,w.id);

test('marking a notice as seen is explicit, durable, idempotent and per person',async t=>{
 const w=await setup(t);await reviewing(w);const first=rows(w)[0];assert.equal(first.seen,false);assert.match(first.path,/#piece-/);
 const page=await w.client.get('/attention');assert.equal(page.status,200);assert.equal(rows(w)[0].seen,false);
 assert.equal((await w.client.post('/attention/seen',{key:first.key,fingerprint:first.fingerprint})).status,303);assert.equal(rows(w)[0].seen,true);
 assert.equal((await w.client.post('/attention/seen',{key:first.key,fingerprint:first.fingerprint})).status,303);assert.equal(w.db.get('SELECT count(*) n FROM attention_seen').n,1);
 const colleagueActor=await colleague(w,w.client,{name:'Responsable de contenido',document:documentFor('notices-person'),'SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});
 const actor={...w.db.get('SELECT * FROM accounts WHERE id=?',colleagueActor.id),grants:w.db.all('SELECT * FROM grants WHERE account_id=?',colleagueActor.id)};
 assert.equal(notificationRows(w.db,actor,w.id)[0].seen,false);
});
test('new deliverable versions reappear; approving removes the resolved notice',async t=>{
 const w=await setup(t),r=await reviewing(w),old=rows(w)[0];seeNotification(w.db,w.actor,w.id,old);
 await w.admin.post(selected(r.path+'/pieces/'+r.p.id+'/evidence',w.id),{label:'Nueva edición',url:'https://example.test/new'});
 assert.equal(rows(w)[0].seen,false);assert.notEqual(rows(w)[0].fingerprint,old.fingerprint);
 assert.throws(()=>seeNotification(w.db,w.actor,w.id,old),/cambió/);
 await w.client.post(r.path+'/pieces/'+r.p.id+'/review',{status:'APPROVED',revision:String(w.db.get('SELECT revision FROM pieces WHERE id=?',r.p.id).revision)});assert.equal(rows(w).length,0);
});
test('new quotation versions reappear without sending repeated notices',async t=>{
 const w=await setup(t),path=await request(w);await w.admin.post(selected(path+'/quote',w.id),{amount:'20',terms:'Incluye edición.'});const old=rows(w)[0];assert.equal(old.kind,'quotes');seeNotification(w.db,w.actor,w.id,old);
 assert.equal(rows(w)[0].seen,true);await w.admin.post(selected(path+'/quote',w.id),{amount:'30',terms:'Incluye grabación y edición.'});assert.equal(rows(w)[0].seen,false);assert.equal(rows(w).length,1);
});
test('only upcoming seven-day visits appear and rescheduling generates a fresh notice',async t=>{
 const w=await setup(t),path=await request(w);const soon=new Date(Date.now()+86400000).toISOString(),later=new Date(Date.now()+10*86400000).toISOString();
 const id=uuid();w.db.run("INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at) VALUES(?,?,?,?,?,?,'SCHEDULED',?)",id,w.id,path.split('/').at(-1),soon,'Local principal','',new Date().toISOString());
 const old=rows(w)[0];assert.equal(old.kind,'visits');seeNotification(w.db,w.actor,w.id,old);w.db.run('UPDATE visits SET revision=revision+1,place=? WHERE id=?','Sucursal norte',id);assert.equal(rows(w)[0].seen,false);
 w.db.run('UPDATE visits SET starts_at=? WHERE id=?',later,id);assert.equal(rows(w).length,0);
});
test('payment notices are owner-only, track balance changes and disappear after payment',async t=>{
 const w=await setup(t),account={summary:{balanceMinor:998,overdueMinor:0,nextDueOn:'2027-01-05'},invoices:[{id:'i',status:'OPEN',remainingMinor:998}]};
 let row=notificationRows(w.db,w.actor,w.id,account)[0];assert.equal(row.kind,'payments');seeNotification(w.db,w.actor,w.id,row,account);assert.equal(notificationRows(w.db,w.actor,w.id,account)[0].seen,true);
 account.summary.balanceMinor=499;account.invoices[0].remainingMinor=499;assert.equal(notificationRows(w.db,w.actor,w.id,account)[0].seen,false);
 const actor={...w.actor,kind:'COLLABORATOR',grants:[]};assert.equal(notificationRows(w.db,actor,w.id,account).length,0);
 account.summary.balanceMinor=0;assert.equal(notificationRows(w.db,w.actor,w.id,account).length,0);
});
test('search, state filters and category counts retain unseen actions without deleting them',async t=>{
 const w=await setup(t);await reviewing(w);let row=rows(w)[0];seeNotification(w.db,w.actor,w.id,row);
 assert.equal(notifications(w.db,w.actor,w.id,new URLSearchParams('state=new')).total,0);
 assert.equal(notifications(w.db,w.actor,w.id,new URLSearchParams('state=seen&q=temporada')).total,1);
 assert.equal(notifications(w.db,w.actor,w.id,new URLSearchParams('view=deliveries')).counts.deliveries,1);
 assert.throws(()=>notifications(w.db,w.actor,w.id,new URLSearchParams('state=hidden')),/inválido/);
});
test('other companies, agency, forged keys and CSRF cannot mutate notice state',async t=>{
 const w=await setup(t);await reviewing(w);const row=rows(w)[0],other=await owner(w,'Otro negocio de avisos','other-notice');
 assert.equal((await other.client.post('/attention/seen',row)).status,409);assert.equal((await w.admin.post('/attention/seen?company='+w.id,row)).status,403);
 assert.equal((await w.client.post('/attention/seen',{...row,_csrf:'wrong'})).status,403);assert.equal((await w.client.post('/attention/seen',{key:'forged',fingerprint:row.fingerprint})).status,409);assert.equal(w.db.get('SELECT count(*) n FROM attention_seen').n,0);
});
test('revoking approval removes a delivery notice immediately',async t=>{
 const w=await setup(t);await reviewing(w);const person=await colleague(w,w.client,{name:'Responsable',document:documentFor('notice-revoke'),'SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});
 let page=await person.session.get('/attention');assert.match(page.body,/Plato de temporada/);
 await w.client.post('/team/'+person.id+'/permissions',{revision:String(w.db.get('SELECT revision FROM accounts WHERE id=?',person.id).revision),'SOCIAL.VIEW':'yes'});
 page=await person.session.get('/attention');assert.doesNotMatch(page.body,/<h3>Plato de temporada/);
});

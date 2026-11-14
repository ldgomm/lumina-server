import test from 'node:test';
import {documentFor} from './helpers.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import { businessDirectory } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/directory.mjs';
import { businessDirectoryPage } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/business-directory-pages.mjs';
const actor={kind:'AGENCY'},query=values=>new URLSearchParams(values);
function fixture(t,count=61){
 const db=openDatabase(':memory:');t.after(()=>db.close());const ids=[];
 for(let i=0;i<count;i++){
  const id=randomUUID();ids.push(id);
  db.run('INSERT INTO companies(id,name,registration_key,document_hint,phone,approved,created_at) VALUES(?,?,?,?,?,?,?)',id,i===0?'Café Órbita':i===1?'<Taller & Sol>':'Negocio '+String(i).padStart(3,'0'),randomUUID(),'1234','099000'+String(i).padStart(4,'0'),i%2,'2026-11-13T18:00:00.000Z');
  db.run("INSERT INTO accounts(id,company_id,name,email,document,kind) VALUES(?,?,?,?,?,'OWNER')",randomUUID(),id,i===0?'José Ruiz':'Responsable '+i,'owner'+i+'@example.test',documentFor('owner'+i+'@example.test'));
  if(i%4)db.run('INSERT INTO business_controls VALUES(?,?,?,?,?,?)',id,['ACTIVE','PAUSED','SUSPENDED','CLOSED'][i%4],'Motivo de prueba',1,null,'2026-11-13T18:00:00.000Z');
 }
 return {db,ids};
}
test('business directory paginates the full collection with stable nonoverlapping order',t=>{
 const {db}=fixture(t);const one=businessDirectory(db,actor,query({sort:'NAME'})),two=businessDirectory(db,actor,query({sort:'NAME',page:'1'})),three=businessDirectory(db,actor,query({sort:'NAME',page:'2'}));
 assert.equal(one.total,61);assert.equal(one.rows.length,25);assert.equal(two.rows.length,25);assert.equal(three.rows.length,11);assert.equal(new Set([...one.rows,...two.rows,...three.rows].map(r=>r.id)).size,61);assert.equal(three.more,false);
 assert.equal(businessDirectory(db,actor,query({page:'99'})).page,2);
});
test('search is literal and ignores accents across business and owner contact',t=>{
 const {db,ids}=fixture(t);for(const q of ['CAFE orbita','Jose Ruiz','1729279784','0990000000'])assert.deepEqual(businessDirectory(db,actor,query({q})).rows.map(r=>r.id),[ids[0]],q);
 assert.equal(businessDirectory(db,actor,query({q:'%_'})).total,0);
});
test('lifecycle and verification filters apply before pagination and counts describe all businesses',t=>{
 const {db,ids}=fixture(t);db.run('UPDATE business_controls SET pending_id=? WHERE company_id=?',randomUUID(),ids[1]);
 const pending=businessDirectory(db,actor,query({state:'PENDING'}));assert.equal(pending.total,1);assert.equal(pending.rows[0].id,ids[1]);assert.equal(pending.counts.total,61);assert.equal(pending.counts.pending,1);
 const paused=businessDirectory(db,actor,query({state:'PAUSED',verification:'VERIFIED'}));assert.equal(paused.total,15);assert.ok(paused.rows.every(row=>row.state==='PAUSED'&&row.approved===1));
 assert.equal(businessDirectory(db,actor).rows[0].id,ids[1]);
 db.run('INSERT INTO business_controls VALUES(?,?,?,?,?,?)',ids[0],'ACTIVE','Pendiente de confirmar',1,randomUUID(),'2026-11-13T18:00:00.000Z');
 const active=businessDirectory(db,actor,query({state:'ACTIVE'}));assert.equal(active.total,active.counts.active);assert.ok(active.rows.every(row=>!row.pending_id));
});
test('directory projection is private read only and omits credentials and personal documents',t=>{
 const {db}=fixture(t,3);const before=db.get('SELECT count(*) n FROM audit').n;const result=businessDirectory(db,actor);
 assert.equal(db.get('SELECT count(*) n FROM audit').n,before);for(const row of result.rows)assert.ok(['id','name','approved','phone','created_at','state','pending_id','owner_name'].every(k=>Object.hasOwn(row,k)));
 assert.doesNotMatch(JSON.stringify(result),/password|sealed_token|document_hint|registration_key/);
 for(const kind of ['OWNER','COLLABORATOR'])assert.throws(()=>businessDirectory(db,{kind}),e=>e.status===403);
});
test('directory rejects invalid filters and renders names and searches as text',t=>{
 const {db}=fixture(t,3);for(const values of [{state:'DELETE'},{sort:'name; DROP TABLE companies'},{page:'-1'},{page:'1e2'},{verification:'TRUE'}])assert.throws(()=>businessDirectory(db,actor,query(values)));
 const html=businessDirectoryPage(businessDirectory(db,actor,query({q:'<Taller & Sol>'})));assert.match(html,/&lt;Taller &amp; Sol&gt;/);assert.doesNotMatch(html,/<Taller/);assert.match(html,/Limpiar filtros/);
});

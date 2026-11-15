import test from 'node:test';
import assert from 'node:assert/strict';
import {agency,colleague,documentFor,owner,portal} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
import {getSession} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import {notificationRows,notifications} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/notifications.mjs';
import {agendaData} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/agenda.mjs';
import {visitCalendar} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/production/calendar-file.mjs';
import {visitTime} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/visit-time.mjs';
import {now,uuid} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';

const selected=(path,id)=>'/agency'+path+'?company='+id;
const actor=(w,client=w.client)=>getSession(w.db,client.cookie.split('=')[1]);
async function setup(t,native=null){const w=await portal(t,native?.origin, native?{platformToken:native.platformToken}:{}),admin=await agency(w),o=await owner(w,'Café de prueba','daily-work');await admin.post(selected('/businesses/verify',o.id));return {...w,...o,admin};}
async function request(w,title='Fotografía de temporada',client=w.client){const r=await client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title,phone:'0991234567'});assert.equal(r.status,303,r.body);return r.location.split('/').at(-1);}
function review(w,id){w.db.run("INSERT INTO pieces(id,company_id,request_id,title,service,status,observations,created_at) VALUES(?,?,?,'Entrega','VIDEO','REVIEW','',?)",uuid(),w.id,id,now());}
function visit(w,requestId,extra={}){const row={id:uuid(),company:w.id,date:'2099-01-01T15:00:00.000Z',place:'Local principal',status:'SCHEDULED',...extra};w.db.run('INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at) VALUES(?,?,?,?,?,?,?,?)',row.id,row.company,requestId,row.date,row.place,'Nota privada y teléfono 0999999999',row.status,now());return row.id;}
const exportPath=id=>'/calendar/visits/'+id+'.ics';
const notice=(w,client=w.client)=>notificationRows(w.db,actor(w,client),w.id)[0];

test('seen actions preserve filters and clamp a now-empty last page',async t=>{
 const w=await setup(t);for(let i=0;i<21;i++)review(w,await request(w,'Fotografía '+i));
 const last=notifications(w.db,actor(w),w.id,new URLSearchParams('view=deliveries&state=new&q=fotografia&page=1')).rows[0];
 const response=await w.client.post('/attention/seen',{...last,view:'deliveries',state:'new',q:'fotografia',page:'1',returnTo:'https://example.test/stolen'});
 assert.equal(response.status,303);assert.equal(response.location,'/attention?view=deliveries&state=new&q=fotografia');
 const page=await w.client.get(response.location);assert.equal(page.status,200);assert.match(page.body,/1–20 de 20/);assert.equal(w.db.get('SELECT count(*) n FROM pieces').n,21);
});
test('new and seen category counts match search and state, including visit location',async t=>{
 const w=await setup(t),r=await request(w);review(w,r);visit(w,r,{date:new Date(Date.now()+86400000).toISOString(),place:'Sucursal Jardín'});
 const d=notificationRows(w.db,actor(w),w.id).find(r=>r.kind==='deliveries');await w.client.post('/attention/seen',d);
 const fresh=notifications(w.db,actor(w),w.id,new URLSearchParams('state=new&q=jardin'));
 assert.equal(fresh.total,1);assert.equal(fresh.counts.all,1);assert.equal(fresh.counts.visits,1);assert.equal(fresh.counts.deliveries,0);
 const seen=notifications(w.db,actor(w),w.id,new URLSearchParams('state=seen&q=fotografia'));assert.equal(seen.total,1);assert.equal(seen.counts.visits,0);assert.equal(seen.counts.deliveries,1);
});
test('empty filtered views do not incorrectly declare all work complete',async t=>{
 const w=await setup(t);review(w,await request(w));
 const seen=await w.client.get('/attention?state=seen');assert.match(seen.body,/Sin avisos vistos/);assert.doesNotMatch(seen.body,/Todo al día/);assert.match(seen.body,/Ver todos los pendientes/);
 const category=await w.client.get('/attention?view=visits');assert.match(category.body,/Sin pendientes en esta categoría/);assert.doesNotMatch(category.body,/Todo al día/);
});
test('reopening only changes the current account notice and remains idempotent',async t=>{
 const w=await setup(t);review(w,await request(w));const member=await colleague(w,w.client,{name:'Revisora',document:documentFor('daily-person'),'SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});
 const own=notice(w),other=notice(w,member.session);await w.client.post('/attention/seen',own);await member.session.post('/attention/seen',other);
 for(let i=0;i<2;i++){const response=await w.client.post('/attention/new',{...own,state:'seen',q:'temporada'});assert.equal(response.status,303);assert.equal(response.location,'/attention?state=seen&q=temporada');}
 assert.equal(notice(w).seen,false);assert.equal(notice(w,member.session).seen,true);assert.equal(w.db.get('SELECT status FROM pieces').status,'REVIEW');
});
test('notice changes require current version, valid filters, CSRF and an authorized account',async t=>{
 const w=await setup(t);review(w,await request(w));const row=notice(w);await w.client.post('/attention/seen',row);
 assert.equal((await w.client.get('/attention/new')).status,405);assert.equal((await w.client.post('/attention/new',{...row,_csrf:'incorrect'})).status,403);
 assert.equal((await w.client.post('/attention/new',{...row,view:'other'})).status,400);assert.equal(notice(w).seen,true);
 assert.equal((await w.admin.post('/attention/new?company='+w.id,row)).status,403);
 const b=await owner(w,'Otro café','daily-other');assert.equal((await b.client.post('/attention/new',row)).status,409);
 w.db.run('UPDATE pieces SET revision=revision+1');assert.equal((await w.client.post('/attention/new',row)).status,409);
});
test('account lookup cannot render or update notices after a concurrent suspension',async t=>{
 const native=await fakeLoyalty(t),w=await setup(t,native);review(w,await request(w));const row=notice(w);
 native.beforeRequest(({path})=>{if(path==='/api/staff/account')w.db.run("INSERT INTO business_controls(company_id,state,reason,revision,updated_at) VALUES(?,'SUSPENDED','Pausa de prueba',1,?) ON CONFLICT(company_id) DO UPDATE SET state='SUSPENDED'",w.id,now());});
 const response=await w.client.post('/attention/seen',row);assert.equal(response.status,423);assert.equal(w.db.get('SELECT count(*) n FROM attention_seen').n,0);assert.doesNotMatch(response.body,/<h3>Fotografía de temporada/);
 w.db.run("UPDATE business_controls SET state='ACTIVE' WHERE company_id=?",w.id);
 assert.equal((await w.client.get('/attention')).status,423);
});
test('agenda counts apply the search across every period without altering visit status',async t=>{
 const w=await setup(t),r=await request(w);visit(w,r,{place:'Jardín norte'});visit(w,r,{place:'Centro'});visit(w,r,{place:'Jardín norte',date:'2001-01-01T15:00:00Z'});visit(w,r,{place:'Centro',status:'DONE'});
 const data=agendaData(w.db,actor(w),w.id,new URLSearchParams('q=jardin'));assert.deepEqual(data.counts,{upcoming:1,pending:1,history:0});assert.equal(data.total,1);assert.equal(data.rows[0].place,'Jardín norte');assert.equal(w.db.get("SELECT count(*) n FROM visits WHERE status='SCHEDULED'").n,3);
});
test('agenda groups by Ecuador date and uses accessible times and exact visit links',async t=>{
 const w=await setup(t),r=await request(w);const first=visit(w,r,{date:'2099-01-02T04:30:00Z'});visit(w,r,{date:'2099-01-02T05:30:00Z'});
 const page=await w.client.get('/calendar');assert.equal(page.status,200);assert.match(page.body,/id="day-2099-01-01"/);assert.match(page.body,/id="day-2099-01-02"/);assert.match(page.body,/>23:30<\/time>/);assert.match(page.body,/>00:30<\/time>/);
 assert.ok(page.body.includes('href="/requests/'+r+'#visits"'));assert.ok(page.body.includes('href="'+exportPath(first)+'"'));assert.match(page.body,/download="recording-/);
});
test('relative days stay correct at Ecuador midnight and year boundary',()=>{
 const current=new Date('2027-01-01T04:45:00Z');
 assert.equal(visitTime('2027-01-01T04:55:00Z',current).relative,'Hoy');assert.equal(visitTime('2027-01-01T05:05:00Z',current).relative,'Mañana');
 assert.equal(visitTime('2027-01-02T05:05:00Z',current).relative,'');assert.equal(visitTime('2027-01-01T05:05:00Z',current).time,'00:05');
});
test('calendar export is private, read-only and contains no fabricated duration or invitation',async t=>{
 const w=await setup(t),r=await request(w),id=visit(w,r),before=w.db.get('SELECT total_changes() n').n;
 const response=await w.client.get(exportPath(id));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/calendar; charset=utf-8/);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('content-disposition'),'attachment; filename="recording-'+id+'.ics"');
 assert.match(response.body,/DTSTART:20990101T150000Z\r\n/);assert.match(response.body,/CLASS:PRIVATE/);assert.doesNotMatch(response.body,/DTEND|DURATION|ATTENDEE|ORGANIZER|METHOD:|Nota privada|0999999999|_csrf|Bearer|password/i);
 assert.equal(w.db.get('SELECT total_changes() n').n,before);assert.equal((await w.session().get(exportPath(id))).location,'/login');assert.equal((await w.client.post(exportPath(id))).status,405);
});
test('calendar downloads preserve tenant and collaborator platform restrictions',async t=>{
 const w=await setup(t),r=await request(w,'Instagram privado'),id=visit(w,r);w.db.run('INSERT INTO request_platforms VALUES(?,?,?)',w.id,r,'INSTAGRAM');
 const b=await owner(w,'Negocio ajeno','daily-foreign');assert.equal((await b.client.get(exportPath(id)+'?company='+w.id)).status,404);
 const m=await colleague(w,w.client,{name:'TikTok',document:documentFor('daily-tiktok'),'TIKTOK.VIEW':'yes'});assert.equal((await m.session.get(exportPath(id))).status,404);
 const allowed=await colleague(w,w.client,{name:'Instagram',document:documentFor('daily-instagram'),'INSTAGRAM.VIEW':'yes'});assert.equal((await allowed.session.get(exportPath(id))).status,200);
 await w.client.post('/team/'+allowed.id+'/permissions',{revision:String(w.db.get('SELECT revision FROM accounts WHERE id=?',allowed.id).revision)});
 assert.equal((await allowed.session.get(exportPath(id))).status,404);
});
test('agency exports its authorized record without becoming the business actor',async t=>{
 const w=await setup(t),r=await request(w),id=visit(w,r),before=w.db.all('SELECT * FROM audit');
 for(const route of [exportPath(id),selected(exportPath(id),w.id)])assert.equal((await w.admin.get(route)).status,200);
 const b=await owner(w,'Otro negocio agenda','daily-agency');assert.equal((await w.admin.get(selected(exportPath(id),b.id))).status,404);
 assert.equal(actor(w,w.admin).kind,'AGENCY');assert.deepEqual(w.db.all('SELECT * FROM audit').slice(0,before.length),before);
});
test('cancelled or completed visits and cancelled requests cannot export confirmations',async t=>{
 const w=await setup(t),r=await request(w),done=visit(w,r,{status:'DONE'}),cancelled=visit(w,r,{status:'CANCELLED'}),scheduled=visit(w,r);
 for(const id of [done,cancelled])assert.equal((await w.client.get(exportPath(id))).status,409);
 w.db.run("UPDATE requests SET status='CANCELLED' WHERE id=?",r);assert.equal((await w.client.get(exportPath(scheduled))).status,409);
 assert.doesNotMatch((await w.client.get('/calendar?view=history')).body,/class="calendar-download"/);assert.equal((await w.client.get(exportPath('invalid'))).status,404);
});
test('suspended businesses and inactive content cannot download agenda files',async t=>{
 const w=await setup(t),r=await request(w),id=visit(w,r);
 w.db.run("DELETE FROM company_services WHERE company_id=? AND service='SOCIAL'",w.id);
 assert.equal((await w.client.get(exportPath(id))).status,409);
 w.db.run("INSERT INTO company_services VALUES(?,'SOCIAL','ACTIVE',NULL,?)",w.id,now());
 w.db.run("INSERT INTO business_controls(company_id,state,reason,revision,updated_at) VALUES(?,'SUSPENDED','Pausa de prueba',1,?)",w.id,now());
 const response=await w.client.get(exportPath(id));assert.equal(response.status,423);assert.doesNotMatch(response.body,/BEGIN:VCALENDAR/);
});
test('calendar text cannot inject fields and folds Unicode within75 octets',()=>{
 const row={id:uuid(),revision:2,starts_at:'2099-01-01T10:00:00-05:00',title:'🌿 Cafetería, café; '.repeat(15)+'\r\nATTENDEE:evil@example.test',place:'Calle 1\\2; local, sur\nBEGIN:VEVENT',company_name:'Café & Té'};
 const value=visitCalendar(row,new Date('2026-11-15T15:00:00Z')),unfold=value.replace(/\r\n /g,'');
assert.equal(unfold.split('\r\nBEGIN:VEVENT').length,2);assert.doesNotMatch(unfold,/\r\nATTENDEE:/);assert.match(unfold,/\\nATTENDEE:/);assert.ok(unfold.includes('Calle 1\\\\2\\; local\\, sur\\nBEGIN:VEVENT'));
 for(const line of value.trimEnd().split('\r\n'))assert.ok(Buffer.byteLength(line)<=75,line);
 assert.ok(Buffer.from(value).toString('utf8')===value);assert.doesNotMatch(value,/\ufffd/);assert.match(unfold,/DTSTART:20990101T150000Z/);
});
test('calendar identifiers remain stable across downloads and updated visits',async t=>{
 const w=await setup(t),r=await request(w),id=visit(w,r),first=(await w.client.get(exportPath(id))).body;
 w.db.run('UPDATE visits SET revision=revision+1,starts_at=? WHERE id=?','2099-02-01T18:00:00Z',id);
 const next=(await w.client.get(exportPath(id))).body;assert.equal(first.match(/UID:([^\r]+)/)[1],next.match(/UID:([^\r]+)/)[1]);assert.match(next,/SEQUENCE:2/);assert.match(next,/DTSTART:20990201T180000Z/);assert.equal(w.db.get('SELECT count(*) n FROM visits').n,1);
});


test('session revoked during account lookup cannot reveal the notice list',async t=>{
 const native=await fakeLoyalty(t),w=await setup(t,native);review(w,await request(w));
 native.beforeRequest(({path})=>{if(path==='/api/staff/account')w.db.run('DELETE FROM sessions WHERE account_id=?',actor(w).id);});
 const response=await w.client.get('/attention');assert.equal(response.status,403);assert.doesNotMatch(response.body,/<h3>Fotografía de temporada/);
});
test('removing approval immediately blocks reopening a previously seen delivery',async t=>{
 const w=await setup(t);review(w,await request(w));const m=await colleague(w,w.client,{name:'Aprobador',document:documentFor('daily-revoked'),'SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});
 const row=notice(w,m.session);await m.session.post('/attention/seen',row);
 await w.client.post('/team/'+m.id+'/permissions',{revision:String(w.db.get('SELECT revision FROM accounts WHERE id=?',m.id).revision),'SOCIAL.VIEW':'yes'});
 assert.equal((await m.session.post('/attention/new',row)).status,409);assert.equal(w.db.get('SELECT count(*) n FROM attention_seen WHERE account_id=?',m.id).n,1);
});

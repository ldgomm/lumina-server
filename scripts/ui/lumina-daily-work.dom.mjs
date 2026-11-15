import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {agency,owner,portal} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const clean=[],t={after:fn=>clean.push(fn)},checks=[];
function parse(html,path){const dom=new JSDOM(html,{url:'https://lumina.test'+path});clean.push(()=>dom.window.close());return dom.window;}
try{
 const w=await portal(t),admin=await agency(w),business=await owner(w,'Negocio de jornada','daily-dom');
 const created=await business.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Fotografía de temporada',phone:'0991234567'}),requestId=created.location.split('/').at(-1);
 w.db.run("INSERT INTO pieces(id,company_id,request_id,title,service,status,observations,created_at) VALUES(?,?,?,'Video','VIDEO','REVIEW','',?)",randomUUID(),business.id,requestId,new Date().toISOString());
 const path='/attention?view=deliveries&state=new&q=fotografia',view=parse((await business.client.get(path)).body,path),d=view.document;
 const filter=d.querySelector('.workday-search'),values=new view.FormData(filter);
 assert.equal(values.getAll('view').length,1);assert.equal(values.get('state'),'new');assert.equal(values.get('q'),'fotografia');
 assert.equal(d.querySelector('[aria-label="Estado del aviso"] [aria-current=page]').textContent,'Nuevos');
 const clear=d.querySelector('.workday-search a');assert.equal(new URL(clear.href).searchParams.get('state'),'new');assert.equal(new URL(clear.href).searchParams.get('view'),'deliveries');assert.equal(new URL(clear.href).searchParams.has('q'),false);
 const form=d.querySelector('.notification-card form'),payload=Object.fromEntries(new view.FormData(form));assert.equal(payload.view,'deliveries');assert.equal(payload.state,'new');assert.equal(payload.q,'fotografia');assert.ok(payload._csrf);assert.ok(payload.fingerprint);assert.equal(form.method,'post');
 const response=await business.client.post(new URL(form.action).pathname,payload);assert.equal(response.status,303);assert.equal(response.location,'/attention?view=deliveries&state=new&q=fotografia');
 checks.push('Native search and seen forms retain category, seen state and query without browser storage or JavaScript');
 const seen=parse((await business.client.get('/attention?state=seen&q=fotografia')).body,'/attention?state=seen&q=fotografia');
 const undo=seen.document.querySelector('.notification-card form');assert.equal(new URL(undo.action).pathname,'/attention/new');assert.equal(undo.querySelector('button').textContent,'Marcar como nuevo');
 assert.equal((await business.client.post('/attention/new',Object.fromEntries(new seen.FormData(undo)))).status,303);
 checks.push('The visible undo control submits the current item version and preserves filters');
 for(const date of ['2099-01-02T04:30:00.000Z','2099-01-02T05:30:00.000Z'])w.db.run("INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at) VALUES(?,?,?,?,?,'','SCHEDULED',?)",randomUUID(),business.id,requestId,date,'Sucursal principal',new Date().toISOString());
 for(const [client,path,scope]of [[business.client,'/calendar?q=principal',''],[business.client,'/content?view=calendar&q=principal',''],[admin,'/agency/content?company='+business.id+'&view=calendar&q=principal',business.id]]){
  const win=parse((await client.get(path)).body,path),doc=win.document,search=doc.querySelector('.workday-search'),data=new win.FormData(search);
  assert.equal(doc.querySelectorAll('.agenda-day').length,2);assert.deepEqual([...doc.querySelectorAll('.visit-date time')].map(e=>e.textContent),['23:30','00:30']);
  for(const node of doc.querySelectorAll('.agenda-day[aria-labelledby]'))assert.ok(doc.getElementById(node.getAttribute('aria-labelledby')));
  const ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
  for(const link of doc.querySelectorAll('.calendar-download')){assert.ok(link.hasAttribute('download'));const target=new URL(link.href);assert.equal(target.origin,'https://lumina.test');assert.match(target.pathname,/\/calendar\/visits\/[a-f0-9-]+\.ics$/);if(scope)assert.equal(target.searchParams.get('company'),scope);}
  if(path.includes('/content')){assert.equal(data.getAll('view').length,1);assert.equal(data.get('view'),'calendar');assert.equal(data.get('period'),'upcoming');assert.ok(search.action.includes('/content'));}
  if(scope){assert.equal(data.get('company'),scope);assert.ok([...doc.querySelectorAll('.agenda-detail')].every(a=>new URL(a.href).pathname.startsWith('/agency/requests/')));}
 }
 checks.push('Agenda days have unique accessible headings, Ecuador times and private downloads in the correct agency/content scope');
 assert.equal(view.localStorage.length,0);assert.equal(view.sessionStorage.length,0);
 console.log(JSON.stringify({status:'LUMINA_DAILY_WORK_DOM_PASS',checks},null,2));
}finally{for(const close of clean.reverse())await close();}

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {agency,owner,portal} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const clean=[],t={after:fn=>clean.push(fn)},checks=[];
async function read(client,path){const response=await client.get(path);assert.equal(response.status,200);const dom=new JSDOM(response.body,{url:'https://lumina.test'+path});clean.push(()=>dom.window.close());return dom.window;}
try{
 const w=await portal(t),admin=await agency(w),business=await owner(w,'Negocio de historial','lifecycle-dom');
 const created=await business.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Video anterior',phone:'0991234567'}),requestId=created.location.split('/').at(-1);
 w.db.run("INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at) VALUES(?,?,?,'2099-11-21T15:00:00Z','Sucursal principal','','SCHEDULED',?)",randomUUID(),business.id,requestId,new Date().toISOString());
 w.db.run("INSERT INTO business_controls(company_id,state,reason,revision,updated_at,archived_at) VALUES(?,'CLOSED','Registro archivado',1,?,?)",business.id,new Date().toISOString(),new Date().toISOString());
 const prefix='/agency/content?company='+business.id;
 const win=await read(admin,prefix+'&view=requests&filter=blocked'),doc=win.document;
 assert.equal(doc.querySelector('.business-operation-notice').dataset.businessState,'ARCHIVED');
 assert.equal(doc.querySelector('.business-operation-notice a').pathname,'/admin/businesses/'+business.id);
 assert.match(doc.querySelector('main').textContent,/Negocio eliminado/);
 assert.match(doc.querySelector('[aria-label="Estado de solicitudes"] [aria-current="page"]').textContent,/Detenidas.*1/);
 assert.match(doc.querySelector('[data-work-state="ARCHIVED"]').textContent,/Archivada/);
 assert.match(doc.querySelector('.work-last-state').textContent,/Última etapa: Recibida/);
 assert.equal(doc.querySelectorAll('main form[method="post"]').length,0);
 const form=doc.querySelector('.content-filter'),values=new win.FormData(form);assert.equal(values.get('company'),business.id);assert.equal(values.get('filter'),'blocked');assert.equal(values.get('view'),'requests');
 for(const a of doc.querySelectorAll('[aria-label="Estado de solicitudes"] a'))assert.equal(new URL(a.href).searchParams.get('company'),business.id);
 checks.push('The archived context is explicit, accessible and read-only; native filters preserve company and hold scope');
 const detail=await read(admin,'/agency/requests/'+requestId+'?company='+business.id);
 assert.equal(detail.document.querySelectorAll('main form[method="post"],.request-timeline').length,0);
 assert.match(detail.document.querySelector('.delivery-next').textContent,/CONSULTA DEL HISTORIAL/);
 for(const a of detail.document.querySelectorAll('.detail-jumps a'))assert.ok(detail.document.getElementById(a.hash.slice(1)));
 checks.push('Historical request details retain working section links without progress claims or editable forms');
 const agenda=await read(admin,prefix+'&view=calendar&period=blocked');
 assert.equal(agenda.document.querySelectorAll('.calendar-download').length,0);
 assert.match(agenda.document.querySelector('[aria-current="page"]').textContent,/Grabaciones|Detenidas/);
 const agendaSearch=agenda.document.querySelector('.workday-search'),fields=new agenda.FormData(agendaSearch);assert.equal(fields.get('view'),'calendar');assert.equal(fields.get('period'),'blocked');assert.equal(fields.get('company'),business.id);
 checks.push('Stopped appointments cannot be exported and Content calendar retains its selected business and period');
 const production=await read(admin,'/production?scope=blocked&q=Video&channel=SOCIAL');
 for(const a of production.document.querySelectorAll('[aria-label="Estado del negocio"] a')){assert.equal(new URL(a.href).searchParams.get('q'),'Video');assert.equal(new URL(a.href).searchParams.get('channel'),'SOCIAL');}
 assert.equal(new production.FormData(production.document.querySelector('.workspace-filter')).get('scope'),'blocked');
 assert.match(production.document.querySelector('tbody').textContent,/Archivada/);
 checks.push('Agency operational and stopped queues preserve search and area through visible controls');
 console.log(JSON.stringify({status:'LUMINA_WORK_LIFECYCLE_DOM_PASS',checks},null,2));
}finally{for(const close of clean.reverse())await close();}

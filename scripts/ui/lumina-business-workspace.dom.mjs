// Fictional documents only. Native HTML controls work with no script enhancement.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID as uuid} from 'node:crypto';
import {businessDirectoryPage} from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/business-directory-pages.mjs';
import {controlPage} from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/business-control-pages.mjs';
const {JSDOM}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const windows=[],actor={kind:'AGENCY',csrf:'fictional'},company={id:uuid(),name:'Café Aurora',phone:'0990000000'};
const dom=html=>{const d=new JSDOM(html,{url:'https://example.test/businesses'});windows.push(d.window);return d.window;};
try {
 const data={rows:[{...company,approved:1,state:'PAUSED',business_state:'PAUSED',owner_name:'Persona de prueba',unfinished_requests:2}],counts:{total:1,active:0,stopped:1,archived:0,pending:0},total:1,page:0,more:false,q:'cafe',state:'STOPPED',verification:'VERIFIED',sort:'NAME'};
 const w=dom(businessDirectoryPage(data)),d=w.document,form=d.querySelector('form');
 assert.equal(d.querySelectorAll('[aria-current=page]').length,1);
 const search=new w.FormData(form);for(const key of ['q','state','verification','sort'])assert.equal(search.get(key),data[key]);
 for(const a of d.querySelectorAll('.directory-overview a')){const u=new URL(a.href);assert.equal(u.searchParams.get('q'),'cafe');assert.equal(u.searchParams.get('verification'),'VERIFIED');assert.equal(u.searchParams.get('sort'),'NAME');assert.equal(u.searchParams.get('page'),'0');}
 const work=new URL(d.querySelector('.business-work-link a').href);assert.equal(work.searchParams.get('company'),company.id);assert.equal(work.searchParams.get('view'),'blocked');
 assert.equal(d.querySelector('.business-contact a').getAttribute('href'),'tel:0990000000');
 const c=dom(controlPage(actor,company,{state:'ACTIVE',revision:9},[],null,'',{}, {work:{state:'ACTIVE',requests:2,upcoming:1,overdue:1,collaborators:3}}));
 const state=c.document.querySelector('form[action$="/state"]');assert.equal(state.checkValidity(),false);assert.equal(state.querySelector('[name=state]:checked'),null);
 state.querySelector('[name=reason]').value='Cambio confirmado de prueba';state.querySelector('[name=confirm]').checked=true;assert.equal(state.checkValidity(),false);
 for(const value of ['PAUSED','SUSPENDED','CLOSED']){state.querySelector('[name=state][value='+value+']').click();assert.equal(state.checkValidity(),true);assert.equal(state.querySelectorAll('[name=state]:checked').length,1);const fields=new c.FormData(state);assert.equal(fields.get('state'),value);assert.equal(fields.get('revision'),'9');assert.equal(fields.get('_csrf'),'fictional');}
 const key=state.querySelector('[name=requestKey]').value;
 const retry=dom(controlPage(actor,company,{state:'ACTIVE',revision:9},[],null,'Revisa la confirmación',{requestKey:key,revision:'9',state:'CLOSED',reason:'Motivo retenido'}, {action:'state'}));
 assert.equal(retry.document.querySelector('.control-state-editor').open,true);assert.equal(retry.document.querySelector('[name=state]:checked').value,'CLOSED');assert.equal(retry.document.querySelector('[name=requestKey]').value,key);assert.equal(retry.document.querySelector('[name=confirm]').checked,false);
 const archived=dom(controlPage(actor,company,{state:'CLOSED',archived_at:'2026-11-14',revision:10},[],null));assert.equal(archived.document.querySelector('[name=state]'),null);assert.ok(archived.document.querySelector('form[action$="/restore"]'));
 console.log('LUMINA_BUSINESS_WORKSPACE_DOM_PASS: scoped facets, exact links, required explicit state choice, exclusive selection, retained draft and archived controls');
} finally {for(const w of windows)w.close();}

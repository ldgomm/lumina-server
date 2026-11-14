// Real presentation scripts in a DOM with fictional HTTP fixtures, not visual browser QA.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { agency, owner, portal } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const cleanups=[],t={after:f=>cleanups.push(f)},errors=[],checks=[];
function dom(html,scripts=['lumina.js','requests.js','packages.js']){
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const d=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc}),w=d.window;
 Object.defineProperty(w,'innerWidth',{value:390,writable:true});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const name of scripts){const s=w.document.createElement('script');s.textContent=readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/'+name,import.meta.url),'utf8');w.document.head.append(s);}
 cleanups.push(()=>w.close());return w;
}
try{
 const world=await portal(t),admin=await agency(world),{client}=await owner(world,'Negocio ficticio','1');
 const home=dom((await client.get('/inicio')).body),gift=home.document.querySelector('.welcome-gift details');assert.equal(gift.open,false);assert.equal(gift.querySelector('[name=phone]').value,'+593991234567');gift.querySelector('[name=title]').dispatchEvent(new home.Event('invalid',{bubbles:false}));assert.equal(gift.open,true);checks.push('Courtesy stays compact; invalid optional fields reveal their form');
 for(const path of ['/inicio','/contenido']){
  const w=dom((await client.get(path)).body),d=w.document,menu=d.querySelector('.menu-toggle'),nav=d.querySelector('#workspace-nav'),close=nav.querySelector('.navigation-close'),backdrop=d.querySelector('.navigation-backdrop');
  const field=d.querySelector('input:not([type=hidden])');field.focus();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(d.activeElement,field);
  menu.click();assert.equal(menu.getAttribute('aria-expanded'),'true');assert.equal(d.activeElement,close);assert.equal(d.querySelector('main').inert,true);assert.equal(backdrop.hidden,false);
  const focusable=[...nav.querySelectorAll('*')].filter(e=>e.tabIndex>=0&&!e.disabled&&e.type!=='hidden');assert.equal(focusable[0],close);
  close.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(d.activeElement,focusable.at(-1));
  d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(d.activeElement,close);
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(menu.getAttribute('aria-expanded'),'false');assert.equal(d.querySelector('main').inert,false);assert.equal(d.activeElement,menu);assert.equal(backdrop.hidden,true);
  menu.click();backdrop.click();assert.equal(menu.getAttribute('aria-expanded'),'false');menu.click();close.click();assert.equal(d.body.classList.contains('nav-open'),false);
 }
 checks.push('Both navigation drawers: focus loop, Escape, backdrop, close, inert content, no focus theft when closed');
 const formWin=dom((await client.get('/solicitudes/nueva?area=SOCIAL')).body),doc=formWin.document,options=doc.querySelector('.request-options'),type=doc.querySelector('[name=type]'),quantity=doc.querySelector('[name=quantity]');
 assert.equal(options.open,false);assert.equal(type.value,'CONTENT');assert.equal(quantity.value,'1');assert.equal(doc.querySelector('[name=phone]').value,'+593991234567');
 type.value='VISIT';type.dispatchEvent(new formWin.Event('change',{bubbles:true}));assert.equal(doc.querySelector('[data-visit]').hidden,false);assert.equal(quantity.disabled,true);assert.equal(new formWin.FormData(doc.querySelector('.request-composer')).has('quantity'),false);
 type.value='CONTENT';type.dispatchEvent(new formWin.Event('change',{bubbles:true}));assert.equal(quantity.disabled,false);quantity.value='101';quantity.checkValidity();assert.equal(options.open,true);assert.equal(quantity.value,'101');
 const web=dom((await client.get('/solicitudes/nueva?area=MAPS')).body);assert.equal(web.document.querySelectorAll('[name=service]').length,1);assert.equal(web.document.querySelector('[name=service]').value,'MAPS_PROFILE');checks.push('Simple forms retain values, visit behavior, contact and browser validation in collapsed controls');
 for(const p of [{name:'Video individual',individual_service:'VIDEO',term:'ONE_OFF',price:'25.50'},{name:'Contenido mensual',individual_service:'VIDEO',term:'MONTHLY',price:'90'},{name:'Web a medida',individual_service:'WEBSITE',term:'ONE_OFF',price:''}])assert.equal((await admin.post('/planes',{offer_kind:'INDIVIDUAL',wallet:'NONE',...p})).status,303);
 const catalog=dom((await client.get('/planes')).body),c=catalog.document,q=s=>c.querySelector(s),change=e=>e.dispatchEvent(new catalog.Event('input',{bubbles:true}));
 assert.equal(q('[data-catalog-filters]').open,false);assert.equal(q('[data-selection-jump]').hidden,true);assert.equal(q('form[action="/salir"]'),null); // Sign out belongs to Mi cuenta.
 const submit=q('.package-selection button[type=submit]');assert.equal(submit.disabled,true);assert.equal(q('[data-package-totals]').textContent,'');
 const card=name=>q('[data-name="'+name+'"]');card('Video individual').querySelector('[data-quantity-change="1"]').click();card('Video individual').querySelector('[data-quantity-change="1"]').click();assert.match(q('[data-package-totals]').textContent,/51[,.]00/);assert.doesNotMatch(q('[data-package-totals]').textContent,/Por mes/);assert.equal(q('[data-selection-jump]').hidden,false);
 card('Contenido mensual').querySelector('[data-quantity-change="1"]').click();q('[name=catalog_term]').value='MONTHLY';q('[name=catalog_term]').dispatchEvent(new catalog.Event('change',{bubbles:true}));assert.equal(card('Video individual').hidden,true);assert.match(q('[data-package-lines]').textContent,/2 × Video individual/);assert.match(q('[data-package-totals]').textContent,/90[,.]00/);
 q('[data-clear-filters]').click();assert.equal(card('Video individual').hidden,false);assert.equal(q('[name=catalog_term]').value,'');card('Web a medida').querySelector('[data-quantity-change="1"]').click();assert.match(q('[data-package-totals]').textContent,/Subtotal conocido, no total final/);
 q('[data-selection-jump]').click();assert.equal(c.activeElement,q('#tu-seleccion'));const contact=q('.package-selection [name=phone]');contact.value='0987654321';change(contact);assert.equal(contact.value,'0987654321');assert.match(q('[data-package-lines]').textContent,/2 × Video individual/);
 for(const remove of [...c.querySelectorAll('.basket-remove')])remove.click();assert.equal(submit.disabled,true);assert.equal(q('[data-selection-jump]').hidden,true);checks.push('Catalog selection survives filtering; exact separated totals, quotes, quantity controls, contact and mobile review link');
 const noJS=dom((await client.get('/solicitudes/nueva?area=WEB')).body,[]);assert.equal(noJS.document.querySelector('[name=phone]').required,true);assert.equal(noJS.document.querySelector('[name=quantity]').value,'1');assert.equal(noJS.document.querySelectorAll('[name=service]').length,2);checks.push('Forms work without JavaScript using native details and server validation');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'LUMINA_PRACTICAL_DOM_PASS',checks},null,2));
}finally{for(const close of cleanups.reverse())await close();}

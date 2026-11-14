import {documentFor} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
// Exercises shipped scripts against real rendered pages with fictional data.
// DOM checks do not replace browser layout or Wallet device validation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {portal,agency,owner,colleague} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const cleanup=[],errors=[],checks=[],t={after:f=>cleanup.push(f)};
function render(html,path,scripts=['lumina.js','requests.js','packages.js']) {
  const console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const d=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{
    url:'https://lumina.test'+path,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,
  });
  const w=d.window;w.confirm=()=>false;
  for(const file of scripts)w.eval(readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/'+file,import.meta.url),'utf8'));
  cleanup.push(()=>w.close());return w;
}
function submit(w,form) {
  const e=new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('button[type=submit]')});
  form.dispatchEvent(e);return e;
}
try {
  const world=await portal(t),admin=await agency(world),a=await owner(world,'Prueba integral',1);
  const path='/solicitudes/nueva?area=SOCIAL',w=render((await a.client.get(path)).body,path),d=w.document;
  const form=d.querySelector('.request-composer'),button=form.querySelector('button[type=submit]'),caption=button.textContent;
  const cancel=e=>e.preventDefault();form.addEventListener('submit',cancel);
  assert.equal(submit(w,form).defaultPrevented,true);assert.equal(button.disabled,false);assert.equal(form.dataset.busy,undefined);
  form.removeEventListener('submit',cancel);
  const title=form.elements.title;title.value='Una idea que todavía no envío';title.dispatchEvent(new w.Event('input',{bubbles:true}));
  let unload=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
  const link=d.querySelector('a[href="/inicio"]'),leave=new w.MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(leave);assert.equal(leave.defaultPrevented,true);
  assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);
  assert.equal(submit(w,form).defaultPrevented,false);assert.equal(button.disabled,true);assert.equal(form.getAttribute('aria-busy'),'true');
  assert.equal(submit(w,form).defaultPrevented,true);
  unload=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,false);
  w.dispatchEvent(new w.Event('pageshow'));assert.equal(button.disabled,false);assert.equal(button.textContent,caption);assert.equal(form.getAttribute('aria-busy'),null);
  assert.equal(title.value,'Una idea que todavía no envío');
  checks.push('Invalid submission stays editable, drafts warn, duplicate submit blocked, return restores actions without losing data');

  await admin.post('/planes',{name:'Video puntual',term:'ONE_OFF',price:'35.25',VIDEO:'1',wallet:'NONE'});
  const c=render((await a.client.get('/planes')).body,'/planes'),catalog=c.document.querySelector('.package-selection');
  catalog.querySelector('[data-quantity-change="1"]').click();
  unload=new c.Event('beforeunload',{cancelable:true});c.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
  catalog.querySelector('[name=catalog_term]').value='MONTHLY';catalog.querySelector('[name=catalog_term]').dispatchEvent(new c.Event('change',{bubbles:true}));
  assert.match(catalog.querySelector('[data-package-lines]').textContent,/Video puntual/);
  catalog.querySelector('.basket-remove').click();
  unload=new c.Event('beforeunload',{cancelable:true});c.dispatchEvent(unload);assert.equal(unload.defaultPrevented,false);
  assert.equal(catalog.querySelector('button[type=submit]').disabled,true);
  checks.push('Basket changes are protected across filters; removing all selections clears the draft');

  const member=await colleague(world,a.client,{name:'Equipo de pruebas',document:documentFor('equipo-pruebas@example.test'),'WEB.VIEW':'yes'});
  const team=render((await a.client.get('/equipo/'+member.id)).body,'/equipo/'+member.id,['lumina.js','team.js']);
  const teamForm=team.document.querySelector('[data-team-form]'),save=teamForm.querySelector('button[type=submit]'),original=save.textContent;
  submit(team,teamForm);assert.equal(save.disabled,true);team.dispatchEvent(new team.Event('pageshow'));assert.equal(save.disabled,false);assert.equal(save.textContent,original);
  checks.push('Unified team editor restores its save button after returning from submission');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'LUMINA_WORKFLOWS_DOM_PASS',checks},null,2));
} finally {for(const close of cleanup.reverse())await close();}

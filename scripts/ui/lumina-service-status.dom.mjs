import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {portal,agency,owner,colleague,documentFor} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const clean=[],t={after:f=>clean.push(f)};
const document=html=>{const dom=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test',runScripts:'dangerously'});clean.push(()=>dom.window.close());return dom.window.document;};
try{
 const w=await portal(t),admin=await agency(w),business=await owner(w,'Negocio de prueba','service-status-dom');
 const member=await colleague(w,business.client,{name:'Persona de prueba',document:documentFor('service-status-dom'),'SOCIAL.VIEW':'yes'});
 w.db.run("INSERT INTO business_controls(company_id,state,reason,revision,updated_at) VALUES(?,'SUSPENDED',?,1,?)",business.id,'Revisión solicitada por el negocio',new Date().toISOString());
 for(const [client,count]of [[business.client,5],[member.session,1]]){
  const d=document((await client.get('/services')).body);
  assert.equal(d.querySelectorAll('.service-impact-list>li').length,count);
  assert.equal(d.querySelectorAll('main form').length,0);
  assert.equal(d.querySelectorAll('.service-impact-list a').length,0);
  assert.equal(d.querySelectorAll('[data-effective-state="SUSPENDED"]').length,count);
  assert.equal(d.querySelectorAll('#workspace-nav [aria-current="page"]').length,1);
  assert.equal(d.querySelector('#workspace-nav [aria-current="page"]').getAttribute('href'),'/services');
  assert.ok([...d.querySelectorAll('#workspace-nav a')].every(a=>['/home','/services','/billing','/help','/account'].includes(a.getAttribute('href'))));
  if(count===1)assert.equal(d.querySelector('a[href="/billing"]'),null);
  for(const node of d.querySelectorAll('[aria-labelledby]'))assert.ok(d.getElementById(node.getAttribute('aria-labelledby')));
  const ids=[...d.querySelectorAll('[id]')].map(node=>node.id);assert.equal(new Set(ids).size,ids.length);
 }
 const base='/admin/businesses/'+business.id,adminPage=document((await admin.get(base)).body);
 assert.equal(adminPage.querySelectorAll('.service-impact-list>li').length,5);
 assert.ok(adminPage.querySelector('form[action="'+base+'/state"] [name="revision"]'));
 const script=adminPage.createElement('script');script.textContent=readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/billing-workspace.js',import.meta.url),'utf8');adminPage.head.append(script);
 const choices=[...adminPage.querySelectorAll('input[type="radio"][name="state"]')];
 assert.equal(choices.length,3);assert.ok(choices.every(node=>node.required&&!node.checked));
 const closing=choices.find(node=>node.value==='CLOSED');closing.click();
 assert.equal(adminPage.querySelectorAll('input[name="state"]:checked').length,1);
 assert.match(closing.closest('label').textContent,/próximos cargos de Wallet/);
 const effects=[...adminPage.querySelectorAll('[data-state-effect]')];assert.equal(effects.length,choices.length);assert.ok(effects.every(node=>!node.hidden));
 const pending=randomUUID();w.db.run('UPDATE business_controls SET pending_id=? WHERE company_id=?',pending,business.id);
 const d=document((await business.client.get('/services')).body);assert.equal(d.querySelector('[data-wallet-sync]').dataset.walletSync,'PENDING');
 assert.ok(d.querySelector('main a[href="/services"]'));assert.equal(d.querySelector('main button'),null);
 console.log('LUMINA_SERVICE_STATUS_DOM_PASS');
}finally{for(const close of clean.reverse())await close();}

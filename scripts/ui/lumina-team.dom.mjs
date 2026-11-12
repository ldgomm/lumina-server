// Real presentation scripts with fictional HTTP data. This is DOM verification, not visual/device QA.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { agency, owner, colleague, portal, teamRevision } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
import { fakeLoyalty } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/loyalty-fixture.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const checks=[],errors=[],cleanups=[],t={after:f=>cleanups.push(f)};
const source=(name,native=false)=>readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/'+(native?'presentation/loyalty/':'lumina/presentation/assets/')+name,import.meta.url),'utf8');
function dom(html){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const d=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test/equipo/nuevo',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc}),w=d.window;
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.Request=Request;w.Headers=Headers;w.ResizeObserver=class{observe(){}disconnect(){}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  cleanups.push(()=>w.close());return w;
}
function load(w,name,native=false){const s=w.document.createElement('script');s.textContent=source(name,native);w.document.head.append(s);}
const settle=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI not ready; '+errors.join('; '));};
try{
  const l=await fakeLoyalty(t),world=await portal(t,l.origin,{platformToken:l.platformToken});await agency(world);const {client}=await owner(world,'Prueba de equipo','1');
  const initial=await colleague(world,client,{name:'Persona inicial',email:'persona-inicial@example.test','WALLET.VIEW':'yes','WALLET.APPROVE':'yes','WALLET_CUSTOMERS.VIEW':'yes','WALLET_CUSTOMERS.EDIT':'yes','INSTAGRAM.VIEW':'yes','INSTAGRAM.APPROVE':'yes'});
  const response=await client.get('/equipo/'+initial.id),w=dom(response.body);for(const script of ['lumina.js','team.js'])load(w,script);
  const d=w.document,editor=d.querySelector('[data-team-editor]'),form=editor.closest('form'),field=name=>form.elements.namedItem(name),preview=()=>d.querySelector('[data-access-preview]').textContent;
  assert.equal(editor.querySelectorAll('[data-module=WALLET]').length,1);assert.equal(form.querySelectorAll('button[type=submit]').length,1);assert.equal(d.querySelector('form[action$="/caja/guardar"]'),null);assert.equal(d.querySelector('form[action$="/permisos"]'),null);
  assert.equal(d.querySelector('[data-access-level=WALLET]').value,'CUSTOM');assert.equal(field('WALLET.APPROVE').checked,true);assert.equal(field('WALLET.REQUEST').checked,false);assert.equal(d.querySelector('[data-access-level=WALLET_CUSTOMERS]').value,'EDIT');assert.equal(d.querySelector('[data-access-level=INSTAGRAM]').value,'CUSTOM');
  const unchanged=Object.fromEntries(new w.FormData(form));assert.equal((await client.post(form.getAttribute('action'),unchanged)).status,303);
  assert.match(preview(),/Instagram/);assert.equal(field('cash_mode').value,'OFF');assert.equal(d.querySelector('[data-cash-branch]').hidden,true);
  checks.push('One Wallet block and one save; custom legacy grants and per-platform rights survive an unchanged submission');
  const choose=(scope,value)=>{const select=d.querySelector('[data-access-level="'+scope+'"]');select.value=value;select.dispatchEvent(new w.Event('change',{bubbles:true}));};
  choose('SOCIAL','REQUEST');assert.equal(field('SOCIAL.VIEW').checked,true);assert.equal(field('SOCIAL.REQUEST').checked,true);assert.equal(field('SOCIAL.APPROVE').checked,false);assert.match(preview(),/solicitar/);
  const leave=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(leave);assert.equal(leave.defaultPrevented,true);assert.match(d.querySelector('[data-save-status]').textContent,/sin guardar/);
  choose('SOCIAL','NONE');assert.equal(field('SOCIAL.VIEW').checked,false);assert.equal(field('INSTAGRAM.APPROVE').checked,true);
  choose('WALLET_DESIGN','EDIT');assert.equal(field('WALLET_DESIGN.VIEW').checked,true);assert.equal(field('WALLET.VIEW').checked,true);assert.match(preview(),/modificar/);
  choose('WALLET','NONE');assert.equal(field('WALLET_DESIGN.EDIT').checked,true);assert.equal(field('WALLET.VIEW').checked,true);assert.equal(field('WALLET.APPROVE').checked,false);
  field('cash_mode').value='BOTH';field('cash_mode').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelector('[data-cash-branch]').hidden,false);assert.equal(field('branch').required,true);assert.ok(field('branch').value);assert.match(preview(),/compras y canjes/);
  assert.equal(world.db.get('SELECT COUNT(*) n FROM cash_grants').n,0);assert.equal(form.querySelectorAll('[name="WALLET_REPORTS.EDIT"],[name="ADMIN.VIEW"]').length,0);
  checks.push('Simple area choices, dependency validation, branch selection, exact summary and no permission until Save');
  w.confirm=()=>false;const link=d.querySelector('a[href="/equipo"]'),click=new w.MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(click);assert.equal(click.defaultPrevented,true);
  const submitted=Object.fromEntries(new w.FormData(form)),saved=await client.post(form.getAttribute('action'),submitted);assert.equal(saved.status,303,saved.body);assert.equal((await initial.session.get('/wallet')).location,'/caja');
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));const afterSubmit=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(afterSubmit);assert.equal(afterSubmit.defaultPrevented,false);assert.equal(form.querySelector('button[type=submit]').disabled,true);
  checks.push('Unified UI payload activates real session access through HTTP; draft navigation and double submit are guarded');
  const invite=await client.post('/equipo',{name:'Por activar',email:'activar@example.test'}),code=invite.body.match(/<code class="secret">([^<]+)</)[1];
  const copied=dom(invite.body);let value=null;Object.defineProperty(copied.navigator,'clipboard',{value:{writeText:async text=>{value=text;}}});load(copied,'team.js');assert.equal(value,null);copied.document.querySelector('[data-copy-activation]').click();await settle(()=>copied.document.querySelector('[data-copy-status]').textContent.includes('copiado'));assert.equal(value,code);assert.match(copied.document.querySelector('[data-copy-status]').textContent,/copiado/);
  checks.push('Activation code copies only after an explicit click; no automatic sharing or storage');
  const member=await colleague(world,client,{name:'Revisora',email:'revisora@example.test','WALLET.VIEW':'yes','WALLET_PROGRAMS.VIEW':'yes'});
  const bad=await client.post('/equipo/'+member.id+'/datos',{revision:teamRevision(world,member.id),name:'Borrador',email:'agencia@example.test'});assert.equal(bad.status,409);
  const invalid=dom(bad.body);assert.equal(invalid.document.querySelector('form[action$="/datos"]').closest('details').open,true);assert.equal(invalid.document.querySelector('form[action$="/datos"] [name=name]').value,'Borrador');
  const noJS=dom((await client.get('/equipo/nuevo')).body);assert.equal(noJS.document.querySelector('[name=email]').required,true);assert.equal(noJS.document.querySelector('form[action="/equipo"]').method,'post');
  const fallback=dom(response.body),fallbackForm=fallback.document.querySelector('form[action$="/acceso"]');assert.equal(fallbackForm.method,'post');assert.equal(fallbackForm.querySelector('[name="WALLET.APPROVE"]').checked,true);assert.equal(fallbackForm.querySelector('[data-custom=WALLET]').open,true);assert.equal(fallbackForm.querySelector('[data-access-level=WALLET]').parentElement.hidden,true);checks.push('Server errors keep the draft visible; complete access form remains usable without JavaScript');
  async function wallet(){
    const page=await member.session.get('/wallet'),native=dom(page.body);
    native.fetch=async(input,options={})=>{
      const path=new URL(String(input),native.location.href).pathname;assert.ok(path.startsWith('/wallet-api/'));assert.equal(new Headers(options.headers).has('Authorization'),false);
      const data=path.endsWith('/dashboard')?{role:'OWNER',business:{id:'fictional',name:'Negocio de prueba',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[],rewards:[],permissions:{purchases:false,rewards:false}}:{canOperate:true};
      return {ok:true,status:200,json:async()=>structuredClone(data)};
    };
    load(native,'loyalty-context.js');for(const name of ['app.js','commercial.js','promotion-editor.js','jsqr.js','scanner.js','wallet-ui.js','engagement.js','experience.js'])load(native,name,true);load(native,'wallet-season.js');load(native,'loyalty-launch.js');await settle(()=>native.document.querySelector('#newPromotion'));return native;
  }
  const read=await wallet();assert.equal(read.document.querySelector('#newPromotion').hidden,true);assert.equal(read.document.querySelector('#createWalletBF'),null);assert.equal(read.document.querySelector('#emptyPromotionAction').hidden,true);assert.match(read.document.querySelector('[data-lumina-readonly]').textContent,/Solo consulta/);assert.equal(read.document.querySelector('[data-tab=team]'),null);
  read.document.querySelector('[data-tab=rewards]').click();await settle(()=>read.document.querySelector('#reward'));assert.equal(read.document.querySelector('#reward').closest('section').hidden,true);
  await client.post('/equipo/'+member.id+'/permisos',{revision:teamRevision(world,member.id),'WALLET.VIEW':'yes','WALLET_PROGRAMS.VIEW':'yes','WALLET_PROGRAMS.EDIT':'yes'});
  const edit=await wallet();assert.equal(edit.document.querySelector('#newPromotion').hidden,false);assert.ok(edit.document.querySelector('#createWalletBF'));edit.document.querySelector('#createWalletBF').click();assert.ok(edit.document.querySelector('#walletBFDialog'));edit.document.querySelector('#walletBFDialog [data-close]').click();assert.equal(edit.document.querySelector('[data-lumina-readonly]'),null);
  checks.push('Actual Wallet scripts hide creation/edit controls for viewers and preserve them for explicitly authorized editors');
  const cash=dom('<meta name="lumina-csrf" content="cash-csrf"><button id="exit"></button><main id="app"></main>');let cashHeaders;
  cash.fetch=async(input,options)=>{cashHeaders=new Headers(options.headers);return {ok:true};};cash.eval('var state={};function renderMerchant(){}function merchant(){return Promise.resolve();}');load(cash,'caja.js');await cash.fetch('/api/staff/purchases',{method:'POST',headers:{'Idempotency-Key':'one-operation'}});assert.equal(cashHeaders.get('X-Lumina-CSRF'),'cash-csrf');assert.equal(cashHeaders.get('Idempotency-Key'),'one-operation');
  checks.push('Cashier requests carry the current session CSRF without losing the operation idempotency key');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'LUMINA_TEAM_DOM_PASS',checks},null,2));
}finally{for(const clean of cleanups.reverse())await clean();}

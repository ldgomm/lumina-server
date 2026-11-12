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
  const w=dom((await client.get('/equipo/nuevo')).body);for(const script of ['lumina.js','team.js'])load(w,script);
  const d=w.document,editor=d.querySelector('[data-team-editor]'),form=editor.closest('form'),field=name=>form.elements.namedItem(name),preview=()=>d.querySelector('[data-access-preview]').textContent;
  let confirms=0;w.confirm=()=>{confirms++;return false;};
  d.querySelector('[data-team-preset=CONTENT]').click();assert.equal(field('SOCIAL.VIEW').checked,true);assert.equal(field('SOCIAL.REQUEST').checked,true);assert.equal(field('SOCIAL.APPROVE').checked,false);assert.match(preview(),/solicitar/);
  const leave=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(leave);assert.equal(leave.defaultPrevented,true);
  d.querySelector('[data-team-preset=CLEAR]').click();assert.equal(confirms,1);assert.equal(field('SOCIAL.REQUEST').checked,true);
  w.confirm=()=>true;d.querySelector('[data-team-preset=CLEAR]').click();assert.equal([...editor.querySelectorAll('input')].some(e=>e.checked),false);
  const change=(name,checked)=>{field(name).checked=checked;field(name).dispatchEvent(new w.Event('change',{bubbles:true}));};
  change('WALLET_DESIGN.EDIT',true);assert.equal(field('WALLET_DESIGN.VIEW').checked,true);assert.equal(field('WALLET.VIEW').checked,true);assert.match(preview(),/modificar/);
  change('WALLET.VIEW',false);assert.equal(field('WALLET_DESIGN.VIEW').checked,false);assert.equal(field('WALLET_DESIGN.EDIT').checked,false);
  change('INSTAGRAM.REQUEST',true);assert.equal(field('INSTAGRAM.VIEW').checked,true);assert.equal(field('SOCIAL.VIEW').checked,false);assert.match(preview(),/Instagram/);
  change('SOCIAL.VIEW',true);assert.match(preview(),/Instagram/);change('SOCIAL.REQUEST',true);assert.doesNotMatch(preview(),/Instagram/);
  assert.equal(form.querySelectorAll('[name="WALLET_REPORTS.EDIT"]').length,0);assert.equal(form.querySelectorAll('[name="ADMIN.VIEW"]').length,0);
  checks.push('Presets, explicit replacement, dependent grants, effective-access summary and unsaved-change warning');
  w.confirm=()=>false;const link=d.querySelector('a[href="/equipo"]'),click=new w.MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(click);assert.equal(click.defaultPrevented,true);
  field('name').value='Mi persona';field('email').value='persona@example.test';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));const afterSubmit=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(afterSubmit);assert.equal(afterSubmit.defaultPrevented,false);
  checks.push('Leaving cancels when a draft exists; actual submit does not trigger an extra draft prompt');
  const invite=await client.post('/equipo',{name:'Por activar',email:'activar@example.test'}),code=invite.body.match(/<code class="secret">([^<]+)</)[1];
  const copied=dom(invite.body);let value=null;Object.defineProperty(copied.navigator,'clipboard',{value:{writeText:async text=>{value=text;}}});load(copied,'team.js');assert.equal(value,null);copied.document.querySelector('[data-copy-activation]').click();await settle(()=>copied.document.querySelector('[data-copy-status]').textContent.includes('copiado'));assert.equal(value,code);assert.match(copied.document.querySelector('[data-copy-status]').textContent,/copiado/);
  checks.push('Activation code copies only after an explicit click; no automatic sharing or storage');
  const member=await colleague(world,client,{name:'Revisora',email:'revisora@example.test','WALLET.VIEW':'yes','WALLET_PROGRAMS.VIEW':'yes'});
  const bad=await client.post('/equipo/'+member.id+'/datos',{revision:teamRevision(world,member.id),name:'Borrador',email:'agencia@example.test'});assert.equal(bad.status,409);
  const invalid=dom(bad.body);assert.equal(invalid.document.querySelector('form[action$="/datos"]').closest('details').open,true);assert.equal(invalid.document.querySelector('form[action$="/datos"] [name=name]').value,'Borrador');
  const noJS=dom((await client.get('/equipo/nuevo')).body);assert.equal(noJS.document.querySelector('[name=email]').required,true);assert.equal(noJS.document.querySelector('form[action="/equipo"]').method,'post');
  checks.push('Server errors keep the draft visible; ordinary HTML forms remain usable without JavaScript');
  async function wallet(){
    const page=await member.session.get('/wallet'),native=dom(page.body);
    native.fetch=async(input,options={})=>{
      const path=new URL(String(input),native.location.href).pathname;assert.ok(path.startsWith('/wallet-api/'));assert.equal(new Headers(options.headers).has('Authorization'),false);
      const data=path.endsWith('/dashboard')?{role:'OWNER',business:{id:'fictional',name:'Negocio de prueba',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[],rewards:[],permissions:{purchases:false,rewards:false}}:{canOperate:true};
      return {ok:true,status:200,json:async()=>structuredClone(data)};
    };
    load(native,'loyalty-context.js');for(const name of ['app.js','commercial.js','promotion-editor.js','jsqr.js','scanner.js','wallet-ui.js','engagement.js','experience.js'])load(native,name,true);load(native,'loyalty-launch.js');await settle(()=>native.document.querySelector('#newPromotion'));return native;
  }
  const read=await wallet();assert.equal(read.document.querySelector('#newPromotion').hidden,true);assert.equal(read.document.querySelector('#emptyPromotionAction').hidden,true);assert.match(read.document.querySelector('[data-lumina-readonly]').textContent,/Solo consulta/);assert.equal(read.document.querySelector('[data-tab=team]'),null);
  read.document.querySelector('[data-tab=rewards]').click();await settle(()=>read.document.querySelector('#reward'));assert.equal(read.document.querySelector('#reward').closest('section').hidden,true);
  await client.post('/equipo/'+member.id+'/permisos',{revision:teamRevision(world,member.id),'WALLET.VIEW':'yes','WALLET_PROGRAMS.VIEW':'yes','WALLET_PROGRAMS.EDIT':'yes'});
  const edit=await wallet();assert.equal(edit.document.querySelector('#newPromotion').hidden,false);assert.equal(edit.document.querySelector('[data-lumina-readonly]'),null);
  checks.push('Actual Wallet scripts hide creation/edit controls for viewers and preserve them for explicitly authorized editors');
  const cash=dom('<meta name="lumina-csrf" content="cash-csrf"><button id="exit"></button><main id="app"></main>');let cashHeaders;
  cash.fetch=async(input,options)=>{cashHeaders=new Headers(options.headers);return {ok:true};};cash.eval('var state={};function merchant(){return Promise.resolve();}');load(cash,'caja.js');await cash.fetch('/api/staff/purchases',{method:'POST',headers:{'Idempotency-Key':'one-operation'}});assert.equal(cashHeaders.get('X-Lumina-CSRF'),'cash-csrf');assert.equal(cashHeaders.get('Idempotency-Key'),'one-operation');
  checks.push('Cashier requests carry the current session CSRF without losing the operation idempotency key');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'LUMINA_TEAM_DOM_PASS',checks},null,2));
}finally{for(const clean of cleanups.reverse())await clean();}

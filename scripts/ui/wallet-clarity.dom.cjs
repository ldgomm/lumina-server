// Native priority, optional review, safe content and optimistic save. Fictional data only.
const {JSDOM,VirtualConsole}=require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const initial={displayName:'Mi marca',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'p',stampSymbol:'☕',composition:'PANORAMA',artworkStyle:'GRADIENT',artworkAccent:null,welcome:'Bienvenido',usage:'Presenta tu QR en caja.',birthdayMessage:'Mensaje propio',logoPng:null};
const fullPrize='Café de especialidad con un nombre completo y condiciones propias';
const staff={role:'OWNER',business:{id:'fiction',name:'Café de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[{id:'p',config:{name:'Puntos por compra',kind:'POINTS',active:true}},{id:'s',config:{name:'Visitas',kind:'STAMPS',active:true}},{id:'c',config:{name:'Cashback',kind:'CASHBACK',active:true}},{id:'e',config:{name:'Sin premio',kind:'STAMPS',active:true}},{id:'paused',config:{name:'Pausada',kind:'STAMPS',active:false}}],rewards:[{id:'r',programId:'p',active:true,cost:100,name:fullPrize,benefitText:'Una unidad de menor precio de café.'},{id:'s',programId:'s',active:true,cost:5,name:'Un corte'},{id:'c',programId:'c',active:true,cost:500,name:'Beneficio de 5 USD'},{id:'off',programId:'p',active:false,cost:1,name:'No visible'}]};
(async()=>{
 const errors=[],calls=[],checks=[];let design={...initial},version=4,fail=false,delay=false,finish=null;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:'https://loyalty.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 try{
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.fetch=async(url,init)=>{assert.equal(url,'/api/staff/wallet-design');const payload=init.body?JSON.parse(init.body):null;calls.push({method:init.method,payload});if(init.method==='PUT'){if(delay)await new Promise(r=>finish=r);if(fail)return{ok:false,status:409,json:async()=>({message:'Otra persona guardó cambios.'})};design={...payload.design};version++;}return{ok:true,json:async()=>({design,version})};};
 for(const name of ['app.js','engagement.js','experience.js']){const s=w.document.createElement('script');s.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(s);}
 const q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)];
 const settle=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out '+errors.join(';'));};
 const input=(id,value)=>{const e=q('#'+id);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const submit=()=>q('#walletDesign').dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true}));
 w.eval(`state.data=${JSON.stringify(staff)};state.token='fiction';state.tab='design';renderMerchant();`);await settle(()=>q('#walletDesign'));
 assert.equal(q('#frontFocus').value,'AUTO');assert.ok(q('#saveDesign').disabled);assert.ok(q('#studioReviewChanges').hidden);assert.equal(q('#studioDetailsPreview').open,false);
 const art=q('#appleStampArtwork').src;q('[data-studio-step="2"]').click();
 for(const composition of all('[data-composition]').map(e=>e.dataset.composition)) for(const focus of ['PROGRESS','REWARD']){
  q(`[data-composition="${composition}"]`).click();q(`[data-front-focus="${focus}"]`).click();
  assert.equal(q('.signature-copy').firstElementChild.id,focus==='PROGRESS'?'appleJourney':'previewPrizeWrap');
  assert.equal(q('.composition-google-row-one').firstElementChild.className,focus==='PROGRESS'?'wallet-native-journey':'google-preview-headline');
  assert.equal(q('#appleJourneyValue').textContent,'99 de 100 puntos');assert.equal(q('#googleJourneyValue').textContent,'99 de 100 puntos');
  assert.ok(q('#studioDetailsContent').textContent.includes(fullPrize));assert.ok(!q('#studioDetailsContent').textContent.includes('No visible'));
 }
 assert.equal(calls.filter(c=>c.method==='PUT').length,0);q('#restoreDesign').click();assert.equal(q('#frontFocus').value,'AUTO');assert.equal(q('#appleStampArtwork').src,art);assert.ok(q('#studioReviewChanges').hidden);
 checks.push('Ten compositions honor both priorities; automatic restores the original layout without altering balances or illustrations');
 q('[data-front-focus=PROGRESS]').click();assert.equal(q('#studioChangeCount').textContent,'1 cambio');assert.match(q('#studioChangeList').textContent,/Según el diseño/);assert.match(q('#studioChangeList').textContent,/Primero el avance/);
 input('usage','<img src=x onerror="alert(1)"> Instrucción');input('displayName','<b>Marca</b>');assert.equal(q('#studioChangeCount').textContent,'3 cambios');assert.equal(q('#studioChangeList img'),null);assert.equal(q('#studioChangeList b'),null);assert.equal(q('#studioDetailsContent img'),null);assert.match(q('#studioDetailsContent').textContent,/<img src=x/);
 q('[data-studio-step="0"]').click();q('[data-review-field=usage]').click();assert.equal(w.document.activeElement.id,'usage');assert.ok(!q('#studioStep2').hidden);
 q('[data-preview-provider=both]').click();q('[data-wallet-example=ready]').click();assert.equal(q('#studioChangeCount').textContent,'3 cambios');assert.match(q('#studioDetailsContent').textContent,/Saldo suficiente/);assert.match(q('#studioDetailsContent').textContent,/100 puntos/);
 for(const [id,text] of [['s','4 de 5 sellos'],['c','4.99 de 5.00 USD']]){input('featuredProgramId',id);assert.equal(q('#appleJourneyValue').textContent,text);assert.equal(q('#googleJourneyValue').textContent,text);}
 input('featuredProgramId','e');assert.ok(q('#appleJourney').hidden);assert.ok(!q('#googleJourney').hidden);assert.match(q('#googleJourneyValue').textContent,/Acumula/);assert.ok(!q('#studioDetailsContent').textContent.includes(fullPrize));
 q('[data-wallet-example=paused]').click();assert.match(q('#googleJourneyValue').textContent,/pausadas/);assert.equal(q('#featuredProgramId option[value=paused]'),null);
 checks.push('Review escapes text, reveals hidden fields and shows full rewards; stamps, points, exact money, missing targets and pause remain distinct');
 q('#restoreDesign').click();q('[data-preview-provider=apple]').click();q('[data-front-focus=REWARD]').click();q('[data-wallet-example=half]').click();
 fail=true;submit();await settle(()=>!q('#designSaveError').hidden);assert.equal(q('#frontFocus').value,'REWARD');assert.equal(q('#studioChangeCount').textContent,'1 cambio');assert.equal(q('#designFields').disabled,false);
 fail=false;delay=true;submit();await settle(()=>finish);assert.ok(q('[data-front-focus=PROGRESS]').disabled);assert.ok(q('[data-review-field=frontFocus]').disabled);assert.ok(q('#restoreDesign').disabled);submit();assert.equal(calls.filter(c=>c.method==='PUT').length,2);
 finish();await settle(()=>!q('#designFields').disabled);delay=false;assert.equal(design.frontFocus,'REWARD');assert.equal(q('#designChangeStatus').textContent,'Diseño guardado');assert.ok(q('#studioReviewChanges').hidden);assert.ok(q('#saveDesign').disabled);
 const payload=calls.filter(c=>c.method==='PUT').at(-1).payload;assert.equal(payload.expectedVersion,4);assert.equal(payload.design.birthdayMessage,initial.birthdayMessage);assert.equal(payload.design.featuredProgramId,'p');
 for(const key of ['reviewFingerprint','studioReviewChanges','studioDetailsPreview','example','previewProvider'])assert.equal(Object.hasOwn(payload.design,key),false);
 q('[data-front-focus=AUTO]').click();assert.match(q('#studioChangeList').textContent,/Primero el premio/);q('#restoreDesign').click();assert.equal(q('#frontFocus').value,'REWARD');
 checks.push('409 keeps the draft/version; saving blocks concurrent edits and double submission; success establishes the new review baseline');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'WALLET_CLARITY_DOM_PASS',checks},null,2));
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

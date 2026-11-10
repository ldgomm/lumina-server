// Reversible previews use fictional balances. Every request is intercepted.
const {JSDOM,VirtualConsole}=require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const initial={composition:'PANORAMA',frontFocus:'AUTO',displayName:'Café de ejemplo',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'s',stampSymbol:'☕',artworkStyle:'GRADIENT',artworkAccent:null,welcome:'Bienvenido',usage:'Presenta tu QR.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[['s','STAMPS'],['p','POINTS'],['c','CASHBACK'],['one','POINTS'],['cent','CASHBACK'],['large','CASHBACK'],['unsafe','POINTS'],['empty','STAMPS']].map(([id,kind])=>({id,config:{name:id,kind,active:true}})),rewards:[['s',5],['p',100],['c',500],['one',1],['cent',1],['large',9007199254740990],['unsafe',9007199254740992]].map(([programId,cost])=>({id:'r-'+programId,programId,cost,name:'Premio '+programId,active:true}))};
(async()=>{
 const errors=[],calls=[],checks=[];let design={...initial},version=4,fail=false,delay=false,finish=null;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:'https://loyalty.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 try{
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.fetch=async(url,init)=>{assert.equal(url,'/api/staff/wallet-design');const payload=init.body?JSON.parse(init.body):null;calls.push({method:init.method,payload});if(init.method==='PUT'){if(delay)await new Promise(r=>finish=r);if(fail)return{ok:false,status:409,json:async()=>({message:'Otra persona guardó cambios.'})};design={...payload.design};version++;}return{ok:true,json:async()=>({design,version})};};
 for(const name of ['app.js','engagement.js','experience.js']){const s=w.document.createElement('script');s.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(s);}
 const q=s=>w.document.querySelector(s),click=s=>q(s).click();
 const input=(id,value)=>{const e=q('#'+id);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const settle=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out '+errors.join(';'));};
 const submit=()=>q('#walletDesign').dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true}));
 const both=value=>{assert.equal(q('#appleJourneyValue').textContent,value);assert.equal(q('#googleJourneyValue').textContent,value);};
 w.eval(`state.data=${JSON.stringify(staff)};state.token='fiction';state.tab='design';renderMerchant();`);await settle(()=>q('#walletDesign'));
 assert.equal(q('#studioPreviewControls').open,false);q('#studioPreviewControls').open=true;both('4 de 5 sellos');assert.equal(q('#studioCanjeAfter').textContent,'—');assert.ok(q('#simulateWalletRedemption').disabled);
 click('#prepareWalletRedemption');both('5 sellos disponibles');assert.equal(w.document.activeElement.id,'simulateWalletRedemption');click('#simulateWalletRedemption');both('0 de 5 sellos');assert.equal(w.document.activeElement.id,'restoreWalletSimulation');click('#restoreWalletSimulation');both('5 sellos disponibles');
 checks.push('Incomplete balance prepares an explicit fictional example; exact goal becomes zero after one reward and can be restored');
 for(const [program,before,cost,after,summary] of [['s','12 sellos','5 sellos','7 sellos','7 sellos disponibles'],['p','250 puntos','100 puntos','150 puntos','150 puntos disponibles'],['c','12.50 USD','5.00 USD','7.50 USD','7.50 USD disponibles'],['one','2 puntos','1 punto','1 punto','1 punto disponible'],['cent','0.02 USD','0.01 USD','0.01 USD','0.01 USD disponibles']]){
  input('featuredProgramId',program);click('[data-wallet-example=surplus]');
  assert.equal(q('#studioCanjeBefore').textContent,before);assert.equal(q('#studioCanjeCost').textContent,cost);assert.equal(q('#studioCanjeAfter').textContent,after);
  assert.equal(q('#googlePreviewStatus').textContent,'2 canjes');click('#simulateWalletRedemption');both(summary);assert.equal(q('#googlePreviewStatus').textContent,'1 canje');assert.match(q('#studioCanjeStatus').textContent,/No se entregó ningún premio/);
  click('#simulateWalletRedemption');both(summary);assert.ok(q('#simulateWalletRedemption').hidden);click('#restoreWalletSimulation');assert.equal(q('#googlePreviewStatus').textContent,'2 canjes');
 }
 input('featuredProgramId','large');click('[data-wallet-example=surplus]');assert.equal(q('#studioCanjeBefore').textContent,'90071992547409.91 USD');assert.equal(q('#studioCanjeCost').textContent,'90071992547409.90 USD');assert.equal(q('#studioCanjeAfter').textContent,'0.01 USD');click('#simulateWalletRedemption');assert.equal(q('#googlePreviewMain').textContent,'0.01');
 input('featuredProgramId','unsafe');assert.ok(q('#simulateWalletRedemption').hidden);assert.ok(q('#prepareWalletRedemption').hidden);assert.ok(q('[data-wallet-example=surplus]').disabled);assert.ok(q('[data-wallet-example=ready]').disabled);assert.equal(q('#studioCanjeAfter').textContent,'—');assert.match(q('#studioCanjeHint').textContent,/precisión/);
 checks.push('Stamps, points and cents retain exact surplus; one-unit goals, safe integer limit and unsupported values are handled without rounding or repeated subtraction');
 input('featuredProgramId','s');click('[data-wallet-example=surplus]');click('#simulateWalletRedemption');
 for(const composition of [...w.document.querySelectorAll('[data-composition]')]){composition.click();both('7 sellos disponibles');}
 for(const focus of ['AUTO','PROGRESS','REWARD']){click('[data-front-focus='+focus+']');both('7 sellos disponibles');}
 click('[data-preview-provider=both]');both('7 sellos disponibles');click('[data-apple-layout=classic]');both('7 sellos disponibles');
 input('featuredProgramId','p');both('99 de 100 puntos');assert.ok(q('#restoreWalletSimulation').hidden);
 click('[data-wallet-example=surplus]');click('#simulateWalletRedemption');input('walletSampleProgress','50');await settle(()=>q('#appleJourneyValue').textContent==='50 de 100 puntos');assert.ok(q('#restoreWalletSimulation').hidden);
 click('[data-wallet-example=surplus]');click('#simulateWalletRedemption');click('[data-wallet-example=paused]');assert.ok(q('#appleJourney').hidden);assert.match(q('#googleJourneyValue').textContent,/pausadas/);assert.equal(q('#studioCanjeAfter').textContent,'—');assert.ok(q('#simulateWalletRedemption').hidden);assert.ok(q('#prepareWalletRedemption').hidden);
 input('featuredProgramId','empty');assert.ok(q('#studioCanje').hidden);assert.ok(q('#restoreWalletSimulation').hidden);
 assert.equal(calls.filter(c=>c.method==='PUT').length,0);assert.equal(w.localStorage.length,0);
 checks.push('Appearance and provider changes keep the example; program, slider and pause reset it; no reward hides the simulation; no transactions or local storage');
 click('#restoreDesign');click('[data-wallet-example=surplus]');click('#simulateWalletRedemption');input('displayName','Nuevo nombre');
 fail=true;submit();await settle(()=>!q('#designSaveError').hidden);both('7 sellos disponibles');assert.equal(q('#displayName').value,'Nuevo nombre');
 fail=false;delay=true;submit();await settle(()=>finish);assert.ok(q('#restoreWalletSimulation').disabled);assert.ok(q('#simulateWalletRedemption').disabled);assert.ok(q('[data-wallet-example=surplus]').disabled);click('#restoreWalletSimulation');both('7 sellos disponibles');submit();assert.equal(calls.filter(c=>c.method==='PUT').length,2);
 finish();await settle(()=>!q('#designFields').disabled);both('7 sellos disponibles');assert.equal(q('#designChangeStatus').textContent,'Diseño guardado');assert.equal(design.displayName,'Nuevo nombre');
 const payload=calls.filter(c=>c.method==='PUT').at(-1).payload;assert.equal(payload.expectedVersion,4);assert.equal(payload.design.featuredProgramId,'s');assert.equal(payload.design.birthdayMessage,initial.birthdayMessage);
 for(const key of ['simulatedCanje','baseAmount','amount','canSimulate','example','samplePercent','previewProvider','affordable'])assert.equal(Object.hasOwn(payload.design,key),false);
 click('#restoreWalletSimulation');both('12 sellos disponibles');assert.ok(q('#saveDesign').disabled);assert.deepEqual(errors,[]);
 checks.push('Conflict keeps the draft and example; save prevents concurrent changes and duplicate requests; persisted design excludes all simulated amounts');
 console.log(JSON.stringify({status:'WALLET_REDEMPTION_DOM_PASS',checks},null,2));
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

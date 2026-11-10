// Guided editor and draft-loss regressions. Executes real UI scripts with fictional data only.
const {JSDOM,VirtualConsole}=require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/web');
const design={composition:'PANORAMA',displayName:'Café de ejemplo',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'points',stampSymbol:'☕',artworkStyle:'GRADIENT',welcome:'Bienvenido',usage:'Presenta tu QR.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[{id:'points',config:{name:'Puntos',kind:'POINTS',active:true}},{id:'cash',config:{name:'Cashback',kind:'CASHBACK',active:true}},{id:'empty',config:{name:'Próximamente',kind:'STAMPS',active:true}},{id:'paused',config:{name:'Pausada',kind:'POINTS',active:false}}],rewards:[{id:'r1',programId:'points',active:true,cost:100,name:'Un café',benefitText:'Café pequeño'},{id:'r2',programId:'cash',active:true,cost:500,name:'Beneficio de 5 USD'},{id:'off',programId:'points',active:false,cost:1,name:'Premio eliminado'}]};
(async()=>{
 const errors=[],calls=[],checks=[];let version=8,resolveSave=null,blockSave=false;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:'https://loyalty.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
 try{
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.fetch=async(url,init)=>{const payload=init.body?JSON.parse(init.body):null;calls.push({url,method:init.method,payload});assert.equal(url,'/api/staff/wallet-design');if(init.method==='PUT'){if(blockSave)await new Promise(r=>resolveSave=r);Object.assign(design,payload.design);version++;}return{ok:true,json:async()=>({design,version})};};
 for(const name of ['app.js','engagement.js','experience.js']){const script=w.document.createElement('script');script.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(script);}
 const q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)];
 const wait=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timeout '+condition+' '+errors.join('; '));};
 const input=(name,value)=>{q('#'+name).value=value;q('#'+name).dispatchEvent(new w.Event('input',{bubbles:true}));};
 const enter=async()=>{w.eval(`state.data=${JSON.stringify(staff)};state.token='fake';state.tab='design';renderMerchant();`);await wait(()=>q('#walletDesign'));};
 const unload=()=>{const event=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(event);return event.defaultPrevented;};
 const submit=()=>q('#walletDesign').dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true}));
 await enter();assert.equal(all('.studio-step-panel').filter(p=>!p.hidden).length,1);assert.equal(q('[aria-current=step]').dataset.studioStep,'0');assert.ok(!q('#studioPreviewControls').open);assert.ok(q('#studioStep1').hidden);assert.ok(q('#studioStep2').hidden);assert.ok(!unload());
 q('[data-preview-provider=both]').click();assert.ok(!q('#studioAppleCard').hidden);assert.ok(!q('#studioGoogleCard').hidden);assert.ok(!q('#designPreview').hidden);assert.ok(!q('#googleDesignPreview').hidden);assert.equal(q('#appleJourneyValue').textContent,q('#googleJourneyValue').textContent);assert.ok(q('#saveDesign').disabled);assert.ok(!unload());
 q('#studioNext').click();assert.equal(q('[aria-current=step]').dataset.studioStep,'1');assert.equal(w.document.activeElement.id,'studioStep1Title');q('#studioNext').click();assert.equal(q('[aria-current=step]').dataset.studioStep,'2');assert.equal(q('#studioFeaturedName').textContent,'Un café');assert.match(q('#studioFeaturedRule').textContent,/100 puntos para canjear · Puntos/);assert.equal(q('#studioFeaturedHint').textContent,'Café pequeño');assert.equal(q('#featuredProgramId option[value=paused]'),null);
 input('featuredProgramId','empty');assert.match(q('#studioFeaturedRule').textContent,/todavía no tiene/);assert.ok(!q('#saveDesign').disabled);q('#restoreDesign').click();assert.ok(q('#saveDesign').disabled);
 q('#studioShowAll').click();assert.equal(all('.studio-step-panel').filter(p=>!p.hidden).length,3);q('[data-studio-step="0"]').click();assert.equal(all('.studio-step-panel').filter(p=>!p.hidden).length,1);
 assert.equal(calls.filter(c=>c.method==='PUT').length,0);checks.push('Three guided steps, optional all-settings view, comparison with one shared simulation and actual active reward guidance');
 // Required content in a closed step must become visible before native validation.
 input('usage','');submit();assert.ok(!q('#studioStep2').hidden);assert.equal(w.document.activeElement.id,'usage');assert.equal(calls.filter(c=>c.method==='PUT').length,0);
 input('usage','Instrucción nueva');input('foreground','#0b1f3a');q('[data-studio-step="0"]').click();assert.ok(!q('#designFixColors').hidden);assert.ok(q('#saveDesign').disabled);q('#designFixColors').click();assert.ok(!q('#studioStep1').hidden);assert.equal(w.document.activeElement.id,'fixContrast');q('#fixContrast').click();assert.ok(!q('#saveDesign').disabled);assert.ok(q('#designFixColors').hidden);
 checks.push('Hidden invalid fields are revealed; contrast failure has a visible route to the fix');
 assert.ok(unload());q('nav [data-tab=sales]').click();assert.ok(q('#studioLeaveDialog').open);assert.equal(w.document.activeElement.id,'studioKeepEditing');assert.equal(w.eval('state.tab'),'design');q('#studioKeepEditing').click();assert.equal(q('#usage').value,'Instrucción nueva');assert.ok(!q('#studioLeaveDialog').open);assert.ok(unload());
 q('#quickCounter').click();assert.ok(q('#studioLeaveDialog').open);q('#studioLeaveDialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.ok(!q('#studioLeaveDialog').open);assert.equal(w.eval('state.tab'),'design');
 q('#exit').click();assert.ok(q('#studioLeaveDialog').open);q('#studioKeepEditing').click();assert.equal(w.eval('state.token'),'fake');
 q('nav [data-tab=sales]').click();q('#studioDiscardAndLeave').click();assert.equal(w.eval('state.tab'),'sales');assert.equal(q('#walletDesign'),null);assert.equal(w.loyaltyDesignLeave,undefined);assert.ok(!unload());assert.equal(calls.filter(c=>c.method==='PUT').length,0);
 checks.push('Sidebar, quick counter and logout protect the same draft; cancel/Escape preserve edits; explicit discard navigates without saving and releases unload guard');
 await enter();input('welcome','Otro saludo');blockSave=true;submit();await wait(()=>resolveSave);assert.ok(unload());assert.ok(q('#designFields').disabled);q('#exit').click();assert.equal(w.eval('state.token'),'fake');assert.ok(!q('#studioLeaveDialog').open);resolveSave();await wait(()=>version===9 && q('#walletDesign') && !q('#designFields').disabled);blockSave=false;assert.ok(!unload());assert.equal(q('#designChangeStatus').textContent,'Diseño guardado');
 assert.equal(calls.filter(c=>c.method==='GET').length,2);assert.equal(q('#googleDesignPreview').hidden,true);
 const payload=calls.find(c=>c.method==='PUT').payload;assert.equal(payload.expectedVersion,8);assert.equal(payload.design.welcome,'Otro saludo');assert.equal(payload.design.birthdayMessage,'Feliz cumpleaños');for(const key of ['studioStep','showAllSteps','previewProvider','samplePercent'])assert.equal(Object.hasOwn(payload.design,key),false);
 checks.push('Saving cannot be interrupted by navigation; success clears draft guard and preserves versioned provider-neutral payload');
 input('welcome','Un segundo cambio');assert.ok(unload());submit();await wait(()=>version===10 && !q('#designFields').disabled);assert.equal(calls.filter(c=>c.method==='PUT').at(-1).payload.expectedVersion,9);assert.ok(!unload());
 input('welcome','Sin guardar');q('#exit').click();q('#studioDiscardAndLeave').click();await wait(()=>w.eval('state.token')==='');assert.equal(q('#walletDesign'),null);assert.equal(w.loyaltyDesignLeave,undefined);assert.ok(!unload());
 await enter();input('welcome','Borrador privado');w.eval("state.token='another-session'");let called=false;w.loyaltyDesignLeave(()=>called=true);assert.ok(called);assert.equal(w.loyaltyDesignLeave,undefined);assert.ok(!unload());
 await enter();input('welcome','Otro borrador');q('#walletDesign').remove();await wait(()=>!w.loyaltyDesignLeave);assert.ok(!unload());
 checks.push('Confirmed logout, session replacement and editor removal do not leave stale guards or persist drafts');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'WALLET_STUDIO_FLOW_DOM_PASS',checks},null,2));
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1;});

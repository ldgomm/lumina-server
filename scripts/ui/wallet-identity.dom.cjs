// Actual editor, fictional businesses, intercepted API. No issuer credentials or live customer operations.
const {JSDOM,VirtualConsole}=require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const initial={displayName:'Mi marca',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'p',stampSymbol:'☕',composition:'PANORAMA',artworkStyle:'GRADIENT',artworkAccent:null,welcome:'Bienvenido',usage:'Presenta tu QR.',birthdayMessage:'Un mensaje propio',logoPng:'fictional-logo'};
const staff={role:'OWNER',business:{id:'fiction',name:'Pizzería es solo un nombre',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[{id:'p',config:{name:'Puntos',kind:'POINTS',active:true}}],rewards:[{id:'r',programId:'p',active:true,cost:100,name:'Premio de ejemplo'}]};
const categories=JSON.parse(fs.readFileSync(path.join(web,'../../businesses/business-categories.json'),'utf8'));
(async()=>{
 const errors=[],calls=[],checks=[];let design={...initial},version=4,fail=false;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:'https://loyalty.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 try{
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.fetch=async(url,init)=>{assert.equal(url,'/api/staff/wallet-design');const payload=init.body?JSON.parse(init.body):null;calls.push({method:init.method,payload});if(init.method==='PUT'){if(fail)return{ok:false,status:409,json:async()=>({message:'Otra persona guardó cambios.'})};design={...payload.design};version++;}return{ok:true,json:async()=>({design,version})};};
 for(const name of ['app.js','engagement.js','experience.js']){const s=w.document.createElement('script');s.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(s);}
 const q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)];
 const settle=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out; '+errors.join(';'));};
 const mount=async category=>{const data={...staff,promotionSuggestions:{category:category?{id:category.id,name:category.name,source:'SELECTED'}:undefined}};w.eval(`state.data=${JSON.stringify(data)};state.token='fiction';state.tab='design';renderMerchant();`);await settle(()=>q('#walletDesign'));};
 const input=(id,value)=>{const e=q('#'+id);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const tick=(id,checked)=>{const e=q('#'+id);e.checked=checked;e.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const submit=()=>q('#walletDesign').dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true}));
 for(const category of categories){await mount(category);assert.equal(all('[data-wallet-look]').length,3);assert.equal(new Set(all('[data-wallet-look] img').map(i=>i.src.match(/v32\/(\w+)/)[1])).size,3);assert.ok(q('#saveDesign').disabled);assert.equal(q('#composition').value,initial.composition);if(category.id!=='GENERAL')assert.match(q('#studioLooksTitle').textContent,new RegExp(category.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));for(const b of all('[data-wallet-look]')){b.click();assert.ok(!q('#saveDesign').disabled);assert.equal(q('#foreground').getAttribute('aria-invalid'),'false');assert.equal(q('#label').getAttribute('aria-invalid'),'false');assert.equal(q('#featuredProgramId').value,'p');}q('#restoreDesign').click();}
 checks.push('All 42 authoritative categories offer three distinct combinations; every palette validates and no click saves automatically');
 await mount(categories.find(c=>c.id==='CAFE'));assert.match(q('[data-wallet-look="0"] img').src,/v32\/STAMPBOOK\/GRADIENT\/5\//);
 await mount(categories.find(c=>c.id==='PIZZERIA'));assert.match(q('[data-wallet-look="0"] img').src,/v32\/TICKET\/GRADIENT\/6\//);
 await mount({id:'UNKNOWN',name:'Pizzería'});assert.equal(q('#studioLooksTitle').textContent,'Tres formas de empezar');assert.match(q('[data-wallet-look="0"] img').src,/v32\/PANORAMA\/GRADIENT\/1\//);
 await mount(categories.find(c=>c.id==='CAFE'));input('displayName','Un nombre editado');input('usage','Una instrucción editada');q('[data-wallet-look="1"]').click();assert.equal(q('#displayName').value,'Un nombre editado');assert.equal(q('#usage').value,'Una instrucción editada');assert.equal(q('#featuredProgramId').value,'p');assert.equal(q('#autoArtworkAccent').checked,false);assert.equal(q('#undoWalletLook').hidden,false);q('#undoWalletLook').click();assert.equal(q('#composition').value,initial.composition);assert.equal(q('#background').value,initial.background);assert.equal(q('#displayName').value,'Un nombre editado');assert.equal(q('#autoArtworkAccent').checked,true);q('#restoreDesign').click();assert.ok(q('#saveDesign').disabled);
 checks.push('Category is never guessed from name; appearance-only apply and undo preserve personal draft fields');
 tick('autoArtworkAccent',false);input('artworkAccent','#0b1f3a');assert.match(q('#artworkAccentStatus').textContent,/se ajusta/);assert.notEqual(q('#artworkAccentApplied').textContent,'#0B1F3A');
 const applied=q('#artworkAccentApplied').textContent;
 const contrast=(a,b)=>{const lum=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};assert.ok(contrast(initial.background,applied)>=3);
 for(const id of ['appleStampArtwork','googleStampArtwork'])assert.match(q('#'+id).src,/\/0b1f3a\/0b1f3a\//);
 input('background','#ffffff');assert.equal(q('#artworkAccentApplied').textContent,'#0B1F3A');assert.match(q('#artworkAccentStatus').textContent,/sin ajustes/);assert.equal(q('#artworkAccent').value,'#0b1f3a');
 q('#restoreDesign').click();tick('autoArtworkAccent',false);input('artworkAccent','#77dddd');fail=true;submit();await settle(()=>!q('#designSaveError').hidden);assert.equal(q('#artworkAccent').value,'#77dddd');assert.equal(q('#designFields').disabled,false);fail=false;submit();await settle(()=>q('#designChangeStatus').textContent==='Diseño guardado');
 assert.equal(design.artworkAccent,'#77dddd');assert.equal(design.logoPng,'fictional-logo');assert.equal(design.birthdayMessage,initial.birthdayMessage);assert.equal(design.composition,initial.composition);assert.equal(design.featuredProgramId,'p');assert.equal(calls.filter(c=>c.method==='PUT')[0].payload.expectedVersion,4);assert.equal(calls.filter(c=>c.method==='PUT')[1].payload.expectedVersion,4);
 for(const key of ['autoArtworkAccent','previousLook','category','previewProvider','samplePercent'])assert.equal(Object.hasOwn(design,key),false);
 tick('autoArtworkAccent',true);assert.ok(q('#artworkAccent').disabled);assert.match(q('#googleStampArtwork').src,/\/auto\//);submit();await settle(()=>design.artworkAccent===null && q('#designFields').disabled===false);assert.equal(calls.filter(c=>c.method==='PUT').at(-1).payload.expectedVersion,5);assert.ok(q('#saveDesign').disabled);
 checks.push('Custom contrast adjusts visibly, recalculates on background change, persists requested color; automatic restores legacy accent; 409 preserves draft and version');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'WALLET_IDENTITY_DOM_PASS',checks},null,2));
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Interaction contract: actual app scripts, fictional data, no network or customer operations.
const {JSDOM,VirtualConsole}=require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const design={displayName:'Café de ejemplo',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:'points',stampSymbol:'☕',artworkStyle:'GRADIENT',welcome:'Bienvenido',usage:'Presenta tu QR.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de ejemplo',currency:'USD',timezone:'America/Guayaquil'},branches:[],programs:[{id:'points',config:{name:'Puntos',kind:'POINTS',active:true}},{id:'stamps',config:{name:'Sellos',kind:'STAMPS',active:true}},{id:'cash',config:{name:'Cashback',kind:'CASHBACK',active:true}}],rewards:[{id:'r1',programId:'points',active:true,cost:100,name:'Premio de ejemplo'},{id:'r2',programId:'stamps',active:true,cost:6,name:'Un café'},{id:'r3',programId:'cash',active:true,cost:500,name:'Beneficio de 5 USD'}]};
const compositions=['PANORAMA','PRECISION','ATELIER','EDITORIAL','STAMPBOOK','TICKET','MOSAIC','RIBBON','PATH','SIGNATURE'];
(async()=>{
 const errors=[],calls=[],checks=[];let version=8,saveError=false;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:'https://loyalty.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
 try{
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.fetch=async(url,init)=>{calls.push({url,method:init.method,payload:init.body?JSON.parse(init.body):null});assert.equal(url,'/api/staff/wallet-design');if(init.method==='PUT'){if(saveError)return{ok:false,status:409,json:async()=>({message:'El diseño cambió. Recarga.'})};Object.assign(design,JSON.parse(init.body).design);version++;}return{ok:true,json:async()=>({design,version})};};
 for(const name of ['app.js','engagement.js','experience.js']){const s=w.document.createElement('script');s.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(s);}
 const q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)];
 const settle=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out '+test+'; '+errors.join('; '));};
 const input=(name,value)=>{const e=q('#'+name);assert.ok(e,name);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));};
 w.eval(`state.data=${JSON.stringify(staff)};state.token='fake';state.tab='design';renderMerchant();`);await settle(()=>q('#composition'));
 assert.equal(q('#composition').value,'SIGNATURE');assert.equal(all('button[data-composition]').length,10);assert.equal(all('[data-wallet-style]').length,32);
 assert.match(q('#walletStyleResults').textContent,/paletas/);assert.match(q('#walletStylesMore').textContent,/32 paletas/);
 const thumbnails=all('button[data-composition] img').map(i=>i.getAttribute('src'));assert.equal(new Set(thumbnails).size,10);thumbnails.forEach(s=>assert.match(s,/\/GRADIENT\/5\/0b1f3a\/auto\/50\/100.png$/));
 assert.ok(q('#saveDesign').disabled);assert.equal(q('#designChangeStatus').textContent,'Diseño guardado');
 assert.equal(all('button[data-composition]').filter(b=>!b.hidden).length,4);
 q('#compositionMore').click();assert.equal(all('button[data-composition]').filter(b=>!b.hidden).length,10);assert.equal(q('#compositionMore').getAttribute('aria-expanded'),'true');
 q('#galleryBrand').click();assert.equal(q('#galleryBrand').getAttribute('aria-pressed'),'true');assert.ok(q('#saveDesign').disabled);
 input('walletSampleProgress','75');q('#walletSampleProgress').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(q('#sampleEarned').textContent,'75 puntos');assert.equal(q('#sampleRemaining').textContent,'25 puntos');assert.equal(q('#appleJourneyValue').textContent,'75 de 100 puntos');
 all('button[data-composition] img').forEach(i=>assert.match(i.src,/\/75\/100.png$/));assert.ok(q('#saveDesign').disabled);
 assert.equal(calls.filter(c=>c.method==='PUT').length,0);
 q('[data-composition=PANORAMA]').click();input('displayName','Mi nueva marca');input('usage','Una instrucción nueva');
 assert.equal(q('#designChangeStatus').textContent,'Cambios sin guardar');assert.ok(!q('#saveDesign').disabled);
 q('#restoreDesign').click();assert.equal(q('#composition').value,'SIGNATURE');assert.equal(q('#displayName').value,'Café de ejemplo');assert.equal(q('#usage').value,'Presenta tu QR.');assert.ok(q('#saveDesign').disabled);
 assert.equal(q('#sampleEarned').textContent,'75 puntos');assert.equal(calls.filter(c=>c.method==='PUT').length,0);
 input('featuredProgramId','cash');input('walletSampleProgress','37');q('#walletSampleProgress').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(q('#sampleEarned').textContent,'1.85 USD');assert.equal(q('#sampleGoal').textContent,'5.00 USD');assert.equal(q('#sampleRemaining').textContent,'3.15 USD');
 input('walletSampleProgress','20');input('featuredProgramId','points');await new Promise(r=>setTimeout(r,150));
 assert.equal(q('#sampleEarned').textContent,'99 puntos');assert.equal(q('#sampleRemaining').textContent,'1 punto');assert.ok(q('#saveDesign').disabled);
 checks.push('Cashback simulation preserves cents exactly; changing promotion cancels delayed slider updates and resets the example');
 q('#galleryBrand').click();q('#compositionMore').click();assert.equal(all('button[data-composition]').filter(b=>!b.hidden).length,4);
 checks.push('Gallery branding and progress are simulations; all ten compositions accessible; restore only local draft; dirty status excludes simulations');
 checks.push('Nine structural compositions plus original; 32 palettes explicitly separate; honest same-colour thumbnails');
 q('[data-wallet-example=half]').click();
 for(const c of compositions){
  q(`[data-composition=${c}]`).click();assert.equal(q('#composition').value,c);assert.equal(all('button[data-composition][aria-pressed=true]').length,1);
  assert.equal(q('#background').value,'#0b1f3a');assert.equal(q('#stampSymbol').value,'☕');assert.equal(q('#featuredProgramId').value,'points');
  for(const provider of ['apple','google']){q(`[data-preview-provider=${provider}]`).click();const img=q(provider==='apple'?'#appleStampArtwork':'#googleStampArtwork');assert.match(img.getAttribute('src'),new RegExp('/v32/'+c+'/GRADIENT/5/0b1f3a/auto/50/100.png'));}
  assert.equal(q('#appleJourneyValue').textContent,'50 de 100 puntos');assert.equal(q('#googleJourneyValue').textContent,'50 de 100 puntos');assert.ok(!q(`[data-composition=${c}]`).hidden);
  for(const id of ['googlePreviewMain','googlePreviewStatus','googlePreviewReward','googleJourney'])assert.equal(all('#'+id).length,1);
  if(['EDITORIAL','TICKET','RIBBON','PANORAMA','ATELIER'].includes(c))assert.equal(q('.signature-copy').firstElementChild.id,'previewPrizeWrap');else assert.equal(q('.signature-copy').firstElementChild.id,'appleJourney');
  const rows=q('.composition-google-row-one');if(c==='STAMPBOOK'||c==='ATELIER')assert.ok(rows.hidden);
  if(c==='PATH')assert.equal(rows.firstElementChild.id,'googleJourney');
 }
 checks.push('Every composition updates both provider URLs; native hierarchy follows selection; repeated toggles retain connected fields');
 q('[data-composition=TICKET]').click();input('artworkStyle','AURORA');q('[data-wallet-style=pizza]').click();assert.equal(q('#composition').value,'TICKET');assert.equal(q('#artworkStyle').value,'AURORA');
 assert.equal(q('#featuredProgramId').value,'points');assert.equal(q('#displayName').value,'Café de ejemplo');assert.equal(calls.filter(c=>c.method==='PUT').length,0);
 checks.push('Palette changes preserve composition, finish, brand and selected promotion; preview never saves');
 input('featuredProgramId','stamps');q('[data-wallet-example=progress]').click();assert.equal(q('#appleJourneyLabel').textContent,'Falta 1 sello');assert.equal(q('#appleJourneyValue').textContent,'5 de 6 sellos');
 for(const c of compositions){q(`[data-composition=${c}]`).click();q('[data-wallet-example=paused]').click();assert.match(q('#appleStampArtwork').src,/\/0\/0.png/);assert.match(q('#googleStampArtwork').src,/\/0\/0.png/);assert.ok(q('#appleJourney').hidden);assert.ok(q('#googleJourney').hidden);assert.ok(q('#walletSampleProgress').disabled);q('[data-wallet-example=ready]').click();assert.equal(q('#appleJourneyLabel').textContent,'Saldo para 1 canje');}
 q('[data-apple-layout=classic]').click();assert.match(q('#appleStampArtwork').src,/layout=apple/);q('[data-apple-layout=poster]').click();assert.match(q('#appleStampArtwork').src,/layout=poster/);
 checks.push('Stamps, remaining one, ready and paused states; classic fallback and poster');
 q('[data-composition=EDITORIAL]').click();saveError=true;
 const submit=()=>q('#walletDesign').dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true}));submit();await settle(()=>!q('#designSaveError').hidden);assert.equal(q('#composition').value,'EDITORIAL');assert.match(q('#designSaveError').textContent,/Recarga/);
 saveError=false;submit();await settle(()=>version===9 && q('#composition')?.value==='EDITORIAL'&&!q('#designFields').disabled);
 const payload=calls.filter(c=>c.method==='PUT').at(-1).payload;assert.equal(payload.expectedVersion,8);assert.equal(payload.design.composition,'EDITORIAL');assert.equal(payload.design.artworkStyle,'AURORA');assert.equal(payload.design.featuredProgramId,'stamps');
 for(const key of ['example','previewProvider','appleLayout','samplePercent','galleryBrand','walletSampleProgress','walletStyleSearch'])assert.equal(Object.hasOwn(payload.design,key),false);
 assert.deepEqual(errors,[]);checks.push('Versioned save preserves fields and composition through conflict; simulation excluded');
 console.log(JSON.stringify({status:'WALLET_COMPOSITION_DOM_PASS',checks},null,2));
 } finally{dom.window.close()}
})().catch(e=>{console.error(e);process.exitCode=1;});

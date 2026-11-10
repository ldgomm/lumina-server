// Fictional data only. All requests are intercepted; no purchases or provider calls.
const {JSDOM,VirtualConsole}=require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const initial={composition:'PANORAMA',frontFocus:'PROGRESS',displayName:'Café de ejemplo',background:'#0b1f3a',foreground:'#ffffff',label:'#b8d8ff',featuredProgramId:null,featuredRewardId:null,stampSymbol:'☕',artworkStyle:'GRADIENT',artworkAccent:null,welcome:'Bienvenido',usage:'Presenta tu QR.',birthdayMessage:'Feliz cumpleaños',logoPng:null};
const staff={role:'OWNER',business:{id:'fiction',name:'Café de ejemplo',currency:'USD'},branches:[],programs:[['s','STAMPS'],['p','POINTS'],['c','CASHBACK'],['empty','STAMPS']].map(([id,kind])=>({id,config:{name:'Promoción '+id,kind,active:true}})),rewards:[['a','s',5,'Un café'],['b','s',12,'Café para dos'],['paused','s',3,'Pausado'],['p1','p',100,'Premio de puntos'],['p2','p',200,'Premio mayor'],['c1','c',500,'Bono'],['c2','c',1025,'Bono mayor']].map(([id,programId,cost,name])=>({id,programId,cost,name,active:id!=='paused'}))};
(async()=>{
 const errors=[],calls=[],checks=[];let design={...initial},version=4,fail=false,delay=false,finish;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:'https://loyalty.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 try{
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.fetch=async(url,init)=>{assert.equal(url,'/api/staff/wallet-design');const payload=init.body?JSON.parse(init.body):null;calls.push({method:init.method,payload});if(init.method==='PUT'){if(delay)await new Promise(r=>finish=r);if(fail)return{ok:false,status:409,json:async()=>({message:'Otra persona guardó cambios.'})};design={...payload.design};version++;}return{ok:true,json:async()=>({design,version})};};
 for(const name of ['app.js','engagement.js','experience.js']){const s=w.document.createElement('script');s.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(s);}
 const q=s=>w.document.querySelector(s),click=s=>q(s).click();
 const input=(id,value)=>{const e=q('#'+id);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const settle=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out '+errors.join(';'));};
 const submit=()=>q('#walletDesign').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const both=value=>{for(const id of ['appleJourneyValue','googleJourneyValue'])assert.equal(q('#'+id).textContent,value);};
 const options=()=>Array.from(q('#featuredRewardId').options,o=>o.value);
 w.eval('state.token="fiction";state.tab="design"');w.eval('state').data=JSON.parse(JSON.stringify(staff));await w.eval('renderMerchant()');await settle(()=>q('#featuredRewardId'));
 click('[data-studio-step="2"]');assert.deepEqual(options(),['','a','b']);assert.ok(q('#saveDesign').disabled);assert.equal(q('#studioRewardMode').textContent,'Automático');both('4 de 5 sellos');
 input('featuredRewardId','b');assert.equal(q('#featuredProgramId').value,'s');assert.equal(q('#studioRewardMode').textContent,'Elegido por ti');both('11 de 12 sellos');assert.match(q('#studioFeaturedRule').textContent,/12 sellos/);assert.equal(q('#studioFeaturedName').textContent,'Café para dos');
 assert.match(q('#studioChangeList').textContent,/Premio al frente/);assert.match(q('#studioChangeList').textContent,/Café para dos/);
 click('[data-wallet-example=surplus]');click('#simulateWalletRedemption');both('18 sellos disponibles');
 click('[data-front-focus=REWARD]');click('[data-preview-provider=both]');click('[data-composition=PRECISION]');both('18 sellos disponibles');assert.equal(q('#featuredRewardId').value,'b');
 click('#useAutomaticReward');assert.equal(q('#featuredRewardId').value,'');both('4 de 5 sellos');assert.ok(q('#restoreWalletSimulation').hidden);assert.equal(w.document.activeElement.id,'featuredRewardId');
 checks.push('Only active rewards from the selected program; explicit choice pins automatic program; both Wallets, illustration and simulation share its goal; automatic is reversible and keyboard focused');
 input('featuredProgramId','p');assert.deepEqual(options(),['','p1','p2']);input('featuredRewardId','p2');both('199 de 200 puntos');click('[data-wallet-example=surplus]');click('#simulateWalletRedemption');both('300 puntos disponibles');
 input('featuredProgramId','c');assert.equal(q('#featuredRewardId').value,'');assert.ok(q('#restoreWalletSimulation').hidden);input('featuredRewardId','c2');both('10.24 de 10.25 USD');click('[data-wallet-example=new]');both('0.00 de 10.25 USD');
 input('featuredProgramId','empty');assert.deepEqual(options(),['']);assert.ok(q('#featuredRewardId').disabled);assert.ok(q('#studioCanje').hidden);
 click('#restoreDesign');assert.equal(q('#featuredProgramId').value,'');assert.equal(q('#featuredRewardId').value,'');assert.ok(q('#saveDesign').disabled);
 input('featuredRewardId','b');fail=true;submit();await settle(()=>!q('#designSaveError').hidden);assert.equal(q('#featuredRewardId').value,'b');
 fail=false;delay=true;submit();await settle(()=>finish);assert.ok(q('#featuredRewardId').disabled);assert.ok(q('#useAutomaticReward').disabled);submit();assert.equal(calls.filter(c=>c.method==='PUT').length,2);finish();await settle(()=>!q('#designFields').disabled);
 const saved=calls.filter(c=>c.method==='PUT').at(-1).payload;assert.equal(saved.expectedVersion,4);assert.equal(saved.design.featuredRewardId,'b');assert.equal(saved.design.featuredProgramId,'s');assert.equal(saved.design.birthdayMessage,initial.birthdayMessage);
 for(const key of ['selectedReward','chosenReward','example','simulatedCanje','samplePercent','previewProvider'])assert.equal(Object.hasOwn(saved.design,key),false);
 input('featuredProgramId','p');input('featuredRewardId','p2');click('#restoreDesign');assert.equal(q('#featuredProgramId').value,'s');assert.equal(q('#featuredRewardId').value,'b');both('11 de 12 sellos');assert.ok(q('#saveDesign').disabled);
 checks.push('Program changes reset target and simulation; points and cents use their own costs; save preserves version and birthday, conflict keeps choice, restoring rebuilds the original program options');
 // Reload with a paused choice: preserve the preference, show an active fallback, and allow explicit reset.
 w.eval('state').data.rewards.find(r=>r.id==='b').active=false;
 await w.eval('renderMerchant()');await settle(()=>q('#featuredRewardId')?.value==='b');both('4 de 5 sellos');assert.equal(q('#studioRewardMode').textContent,'Respaldo automático');assert.match(q('#studioRewardSelectionHint').textContent,/no está disponible/);assert.ok(q('#saveDesign').disabled);
 click('#useAutomaticReward');assert.deepEqual(options(),['','a']);assert.ok(!q('#saveDesign').disabled);
 // Names remain text in native select, review, summary and both previews.
 const evil='<img src=x onerror="window.bad=true">';w.eval('state').data.rewards.find(r=>r.id==='a').name=evil;
 input('featuredRewardId','a');assert.equal(q('#studioFeaturedName').textContent,evil);assert.equal(q('#studioFeaturedName img'),null);assert.equal(w.bad,undefined);
 assert.equal(w.localStorage.length,0);assert.deepEqual(errors,[]);
 checks.push('Inactive choice never appears as an active prize; its preference survives unrelated edits; names are escaped, previews issue no operations, no local storage');
 console.log(JSON.stringify({status:'WALLET_FEATURED_REWARD_DOM_PASS',checks},null,2));
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

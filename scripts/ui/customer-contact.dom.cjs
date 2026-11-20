const {JSDOM}=require(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
async function check(mode){
 const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script\b[^>]*src[^>]*><\/script>/g,'').replace('</head>',`<meta name="lumina-wallet-owner" content="${mode==='owner'?'yes':'no'}"><meta name="lumina-wallet-editable" content='${mode==='edit'?'["customers"]':'[]'}'></head>`),{url:'https://wallet.test/',runScripts:'dangerously'}),w=dom.window,calls=[],errors=[];
 const q=s=>w.document.querySelector(s),settle=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timeout '+errors.join('; '));};
 w.addEventListener('error',e=>errors.push(e.message));w.confirm=()=>false;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.fetch=async(url,init={})=>{calls.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});return {ok:true,json:async()=>url.endsWith('/contact')?{phone:'+593981234567',version:1}:{member:{id:'member',name:'Ana',contactPhone:'+593991234567',contactVersion:0},summary:{purchases:0,spentMinor:0,claimedRewards:0,averageDaysBetweenPurchases:null,discountMinor:0},preferences:{birthday:null,marketingConsent:false},rewardProgress:[],timeline:{total:0,items:[],offset:0,hasMore:false}}};};
 for(const name of ['app.js','engagement.js']){const script=w.document.createElement('script');script.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(script);}
 const setup=w.document.createElement('script');setup.textContent="state.token='fictional';state.data={role:'OWNER',business:{id:'business',currency:'USD'},branches:[]};";w.document.head.append(setup);
 try{await w.openCustomerWorkspace('member');assert.equal(q('#customerPhoneValue a').getAttribute('href'),'tel:+593991234567');assert.equal(Boolean(q('#serveCustomer')),mode==='owner');
 assert.equal(Boolean(q('#customerProfileEdit')),mode==='owner');assert.equal(Boolean(q('#customerRemoval')),mode==='owner');
 if(mode==='view'){assert.equal(q('#customerContact'),null);assert.equal(q('#customerPreferences'),null);assert.equal(calls.some(c=>c.method==='PUT'),false);}
 else {const f=q('#customerContact');assert.ok(f);f.elements.contactPhone.value='0981234567';q('#closeCustomer').click();assert.equal(q('dialog').open,true);f.elements.confirmed.checked=true;f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>q('#customerPhoneValue').textContent==='+593981234567');assert.deepEqual(calls.find(c=>c.method==='PUT').body,{phone:'+593981234567',expectedVersion:0,customerConfirmed:true});assert.equal(f.elements.confirmed.checked,false);q('#closeCustomer').click();assert.equal(q('dialog'),null);}
 if(mode==='owner'){
   await w.openCustomerWorkspace('member');
   const edit=q('#customerProfileEdit');edit.elements.profileName.value='Ana María';edit.elements.profileDocument.value='1710034065';
   edit.elements.confirmed.checked=true;edit.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
   await settle(()=>calls.some(c=>c.url.endsWith('/profile')&&c.method==='PUT'));
   assert.deepEqual(calls.find(c=>c.url.endsWith('/profile')).body,{name:'Ana María',document:'1710034065',expectedVersion:0,confirmed:true});
   await settle(()=>q('#customerRemoval') && q('#customerProfileEdit')!==edit);
   const remove=q('#customerRemoval');remove.elements.confirmed.checked=true;remove.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
   await settle(()=>calls.some(c=>c.method==='DELETE'));
   assert.deepEqual(calls.find(c=>c.method==='DELETE').body,{expectedVersion:0,confirmed:true});
 }
 assert.deepEqual(errors,[]);
 }finally{w.close();}
}
(async()=>{for(const mode of ['view','edit','owner'])await check(mode);console.log('CUSTOMER_CONTACT_DOM_PASS');})().catch(e=>{console.error(e);process.exitCode=1;});

const {JSDOM}=require(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const errors=[],calls=[];let failedCard=true;
const dom=new JSDOM(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://wallet.test/join/demo',runScripts:'dangerously'}),w=dom.window;
w.addEventListener('error',e=>errors.push(e.message));w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:fictional';w.URL.revokeObjectURL=()=>{};
w.fetch=async(url,init={})=>{calls.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});
 const ok=data=>({ok:true,status:200,json:async()=>data});
 if(url==='/api/public/demo')return ok({business:{id:'fictional',name:'Café Aurora',currency:'USD'},programs:[]});
 if(url==='/api/public/demo/join')return ok({token:'fictional-session'});
 if(url==='/api/me'){if(failedCard)return {ok:false,status:503,json:async()=>({message:'No pudimos abrir la tarjeta.'})};return ok({member:{id:'member',name:'Ana'},balances:[]});}
 if(url==='/api/me/qr')return {ok:true,blob:async()=>new w.Blob()};
 if(url==='/api/me/wallet-status')return ok({apple:true,google:true});
 if(url.includes('/wallet/')&&url.endsWith('/link'))return ok({url:'https://wallet.test/wallet/apple/download/'+'A'.repeat(43),expiresIn:120});
 throw Error('Unexpected request '+url);
};
for(const name of ['app.js','engagement.js','wallet-ui.js']){const script=w.document.createElement('script');script.textContent=fs.readFileSync(path.join(web,name),'utf8');w.document.head.append(script);}
const q=s=>w.document.querySelector(s),settle=async f=>{for(let n=0;n<200;n++){if(f())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timeout '+errors.join('; '));};
(async()=>{try{
 await settle(()=>q('#enroll')&&q('[name=birthMonthDay]'));
 const f=q('#enroll');assert.equal(f.elements.phone.required,true);assert.equal(f.elements.phone.type,'tel');assert.equal(f.elements.phone.autocomplete,'tel');assert.equal(q('[name=marketingConsent]').checked,false);
 f.elements.name.value='Ana';f.elements.document.value='1738277993';f.elements.acceptedTerms.checked=true;
 f.elements.phone.value='wrong';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(calls.filter(c=>c.url.endsWith('/join')).length,0);assert.equal(f.elements.phone.checkValidity(),false);assert.equal(f.elements.name.value,'Ana');
 f.elements.phone.value='099 123 4567';f.elements.phone.dispatchEvent(new w.Event('input'));
 const month=q('[name=birthMonth]')||q('#birthMonth'),day=q('[name=birthDay]')||q('#birthDay');assert.ok(month&&day);
 month.value='02';day.value='31';day.dispatchEvent(new w.Event('change'));assert.equal(day.checkValidity(),false);
 day.value='29';day.dispatchEvent(new w.Event('change'));assert.equal(day.checkValidity(),true);
 f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>q('#retryRegisteredCard'));
 const join=calls.find(c=>c.url.endsWith('/join'));assert.equal(join.body.phone,'+593991234567');assert.equal(join.body.preferences.birthday,'02-29');assert.equal(join.body.preferences.marketingConsent,false);assert.equal(q('#enroll'),null);
 failedCard=false;q('#retryRegisteredCard').click();await settle(()=>q('#walletLink a'));assert.equal(calls.filter(c=>c.url.endsWith('/join')).length,1);assert.equal(q('[aria-current=step]').textContent.includes('Guardar en Wallet'),true);
 assert.deepEqual(errors,[]);console.log('PERSONAL_CONTACT_DOM_PASS');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

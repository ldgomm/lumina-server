const {JSDOM}=require(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty/wallet-ui.js'),'utf8');
const checks=[];
async function fixture(agent,options={}){
 const dom=new JSDOM('<main></main>',{url:'https://wallet.test/',runScripts:'dangerously'}),w=dom.window;const calls=[];
 Object.defineProperty(w.navigator,'userAgent',{value:agent});let release,fail=options.fail,bad=options.bad,held=options.hold,statusFail=options.statusFail;
 w.state={token:'test-session'};w.customerCard=async()=>{w.document.querySelector('main').innerHTML='<div id="walletMount"></div>';};
 w.api=async(url)=>{
  calls.push(url);
  if(url.endsWith('wallet-status')){if(statusFail)throw new Error('Disconnected');return {apple:true,google:true};}
  if(held)await new Promise(resolve=>{release=resolve;});
  if(fail)throw new Error('No pudimos conectar. Reintenta.');
  return {url:bad?'https://pay.google.com.attacker.test/gp/v/save/a.b.c':url.includes('/apple/')?'https://wallet.test/wallet/apple/download/'+'A'.repeat(43):'https://pay.google.com/gp/v/save/a.b.c',expiresIn:120};
 };
 w.eval(source);const ready=w.customerCard();
 const q=s=>w.document.querySelector(s);
 const settle=async fn=>{for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('UI did not settle');};
 return {dom,w,q,ready,calls,settle,release:()=>release(),setFail:v=>fail=v,setBad:v=>bad=v,setHeld:v=>held=v,setStatusFail:v=>statusFail=v};
}
(async()=>{
 for(const [agent,provider] of [['Mozilla Android','google'],['Mozilla iPhone','apple']]){
  const f=await fixture(agent);try{
   await f.ready;assert.equal(f.calls.filter(x=>x.endsWith('/link')).length,1);assert.ok(f.calls.at(-1).includes('/'+provider+'/'));
   const a=f.q('#walletLink a');assert.match(a.textContent,new RegExp(provider==='apple'?'Añadir a Apple Wallet':'Añadir a Google Wallet'));assert.ok(f.q('#prepareWallet').hidden);
   let prevented=false;a.onclick({preventDefault(){prevented=true;}});assert.equal(prevented,false);assert.equal(f.calls.filter(x=>x.endsWith('/link')).length,1);
   assert.match(f.q('#walletFeedback').textContent,/Confirma/);assert.doesNotMatch(f.q('#walletFeedback').textContent,/instalada|guardada/);
   const original=f.w.Date.now;f.w.Date.now=()=>original()+121000;a.onclick({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(f.q('#walletLink a'),null);
   checks.push(provider+': prepared automatically; one ordinary link tap; native confirmation; expiry blocks navigation');
  }finally{f.dom.window.close();}
 }
 const f=await fixture('Mozilla Android',{fail:true});try{
  await f.ready;assert.equal(f.q('#walletLink a'),null);assert.equal(f.q('#prepareWallet').disabled,false);
  f.setFail(false);f.q('#prepareWallet').click();await f.settle(()=>f.q('#walletLink a'));
  f.setBad(true);f.q('[data-wallet-provider=apple]').click();await f.settle(()=>f.q('#walletFeedback').textContent.includes('verificar'));
  assert.equal(f.q('#walletLink a'),null);checks.push('Recoverable failure and provider switch; hostile destination rejected');
 }finally{f.dom.window.close();}
 const h=await fixture('Mozilla Android',{hold:true});try{
  await h.settle(()=>h.calls.some(x=>x.endsWith('/link')));h.q('#prepareWallet').click();assert.equal(h.calls.filter(x=>x.endsWith('/link')).length,1);
  h.w.state.token='different-session';h.release();await h.ready;assert.equal(h.q('#walletLink a'),null);checks.push('Concurrent preparation suppressed and late response cannot cross customer sessions');
 }finally{h.dom.window.close();}
 const r=await fixture('Mozilla Android',{statusFail:true});try{
  await r.ready;assert.ok(r.q('#retryWalletStatus'));r.setStatusFail(false);r.q('#retryWalletStatus').click();await r.settle(()=>r.q('#walletLink a'));checks.push('Status retry preserves the registration and reaches the direct link');
 }finally{r.dom.window.close();}
 console.log(JSON.stringify({status:'WALLET_REGISTRATION_DOM_PASS',checks,browserAndDevice:'PENDING'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

// Disposable accounts and provider fixture: never operates a production business.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {agency,portal,password,documentFor} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
import {fakeLoyalty} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/loyalty-fixture.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const cleanup=[],t={after:fn=>cleanup.push(fn)},output=process.env.LUMINA_UI_EVIDENCE;
let browser;
try {
 const native=await fakeLoyalty(t,fileURLToPath(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty/',import.meta.url)));
 const w=await portal(t,native.origin,{platformToken:native.platformToken}),admin=await agency(w);
 assert.equal((await admin.post('/plans',{catalog_version:'SIMPLE',name:'Wallet de mi negocio',description:'Fidelización y soporte.',term:'MONTHLY',price_type:'FIXED',price:'13.75',WALLET:'1',confirm_offer:'yes'})).status,303);
 assert.equal((await admin.post('/plans',{catalog_version:'SIMPLE',name:'Wallet con Contenido',description:'Tarjetas y videos para redes.',term:'MONTHLY',price_type:'FIXED',price:'30',VIDEO:'2',WALLET:'1',wallet_gift:'yes',confirm_offer:'yes'})).status,303);
 browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 if(output)await mkdir(output,{recursive:true});
 const errors=[];
 for(const javaScriptEnabled of [true,false]) {
  const session=w.session(),document=documentFor('browser-'+javaScriptEnabled);
  assert.equal((await session.post('/register',{company:'Comercio de prueba',name:'Responsable',document,ruc:document+'001',phone:'0991234567',password,consent:'yes',category:'CAFE'})).status,303);
  await session.get('/welcome');await session.post('/welcome',{service:'LATER'});await session.get('/services');
  const context=await browser.newContext({javaScriptEnabled,reducedMotion:'reduce'});
  await context.addCookies([{name:'lumina_session',value:session.cookie.split('=')[1],url:w.origin,httpOnly:true,sameSite:'Strict'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===w.origin?route.continue():route.abort());
  await context.addInitScript(()=>{
    window.welcomeFlashes=[];
    const observer=new MutationObserver(records=>{
      for (const record of records)for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        for(const title of node.matches('h1')?[node]:node.querySelectorAll('h1')){
          if(/(Que una visita|Dales un motivo)/i.test(title.textContent))window.welcomeFlashes.push(title.textContent);
        }
      }
    });
    observer.observe(document,{childList:true,subtree:true});
  });
  await context.route('**/wallet-api/api/staff/dashboard*',async route=>{
    await new Promise(done=>setTimeout(done,280));await route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const fit=async()=>{
    const overflowing=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1 ? [] :
      Array.from(document.querySelectorAll('main *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.tagName+'.'+e.className+' '+e.textContent.trim().slice(0,45)+' '+e.parentElement.className+' '+Math.round(e.getBoundingClientRect().right)).slice(0,12));
    assert.deepEqual(overflowing,[],`Overflow at ${page.viewportSize().width} on ${page.url()}: ${overflowing.join(', ')}`);
  };
  for(const width of [320,390,1024,1440]) {
   await page.setViewportSize({width,height:1000});
   for(const path of ['/plans','/plans/wallet','/wallet','/services']) {
    const response=await page.goto(w.origin+path);assert.equal(response.status(),200);await fit();
    if(output && path==='/plans/wallet' && javaScriptEnabled && [390,1440].includes(width))await page.screenshot({path:resolve(output,'plans-'+width+'.png'),fullPage:true});
    assert.doesNotMatch(await page.locator('body').innerText(),/\$4,99|identificación del proveedor|Por confirmar/);
   }
  }
  await page.goto(w.origin+'/wallet');assert.equal(new URL(page.url()).pathname,'/plans/wallet');
  await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Wallet de mi negocio',exact:true})}).getByRole('button',{name:'Elegir este plan'}).click();
  await page.getByRole('button',{name:'Aceptar y activar Wallet',exact:true}).waitFor();
  assert.match(await page.locator('body').innerText(),/13,75/);
  assert.doesNotMatch(await page.locator('body').innerText(),/Lúmina revisará tu selección/);
  const confirmation=page.getByLabel('Revisé los servicios, precios, fechas y condiciones de esta propuesta.',{exact:true});
  assert.equal(await confirmation.isChecked(),false);
  for(const width of [390,1440]) {
   await page.setViewportSize({width,height:1000});await fit();
   if(output)await page.screenshot({path:resolve(output,`wallet-review-${javaScriptEnabled}-${width}.png`),fullPage:true});
  }
  await confirmation.check();await page.getByRole('button',{name:'Aceptar y activar Wallet',exact:true}).click();
  await page.waitForURL(w.origin+'/wallet');
  assert.equal(await page.getByRole('link',{name:'Volver a Lúmina',exact:true}).count(),1);
  assert.equal(await page.locator('main#app').count(),1);
  const company=w.db.get('SELECT company_id FROM accounts WHERE document=?',document);
  assert.equal(w.db.get("SELECT status FROM company_services WHERE company_id=? AND service='WALLET'",company.company_id).status,'ACTIVE');
  assert.equal(w.db.get('SELECT count(*) n FROM contracts WHERE company_id=?',company.company_id).n,1);
  await page.goto(w.origin+'/plans/wallet');assert.match(await page.locator('body').innerText(),/Wallet está incluida en tu plan/);
  await page.getByRole('link',{name:'Abrir Wallet',exact:true}).click();await page.waitForURL(w.origin+'/wallet');
  if(javaScriptEnabled){
    await page.locator('body.staff-mode, #content').first().waitFor();
    assert.deepEqual(await page.evaluate(()=>window.welcomeFlashes),[]);
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
 if(output)await writeFile(resolve(output,'result.json'),JSON.stringify({status:'PASS',fictional:true,widths:[320,390,1024,1440],javascript:[true,false],ownerSelfActivation:true,deviceTest:'PENDING'},null,2));
 console.log('RESULTADO=WALLET_CHECKOUT_BROWSER_PASS');
} catch(error) {
 if(output){await mkdir(output,{recursive:true});await writeFile(resolve(output,'error.txt'),String(error.stack||error));}
 console.log('RESULTADO=WALLET_CHECKOUT_BROWSER_FAILED');process.exitCode=1;
} finally {if(browser)await browser.close();for(const close of cleanup.reverse())await close();}

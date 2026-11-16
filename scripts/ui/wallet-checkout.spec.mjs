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
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow: ${page.url()}`);
  for(const width of [320,390,1024,1440]) {
   await page.setViewportSize({width,height:1000});
   for(const path of ['/plans','/plans/wallet','/wallet','/services']) {
    const response=await page.goto(w.origin+path);assert.equal(response.status(),200);await fit();
    assert.doesNotMatch(await page.locator('body').innerText(),/\$4,99|identificación del proveedor|Por confirmar/);
   }
  }
  await page.goto(w.origin+'/wallet');assert.equal(new URL(page.url()).pathname,'/plans/wallet');
  await page.getByLabel('Cantidad de Wallet de mi negocio',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Revisar selección',exact:true}).click();
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
  assert.equal(await page.locator('.workspace-sidebar').count(),1);
  const company=w.db.get('SELECT company_id FROM accounts WHERE document=?',document);
  assert.equal(w.db.get("SELECT status FROM company_services WHERE company_id=? AND service='WALLET'",company.company_id).status,'ACTIVE');
  assert.equal(w.db.get('SELECT count(*) n FROM contracts WHERE company_id=?',company.company_id).n,1);
  await page.goto(w.origin+'/plans/wallet');assert.match(await page.locator('body').innerText(),/Tu Wallet está incluida/);
  await page.getByRole('link',{name:'Abrir Wallet',exact:true}).click();await page.waitForURL(w.origin+'/wallet');
  await context.close();
 }
 assert.deepEqual(errors,[]);
 if(output)await writeFile(resolve(output,'result.json'),JSON.stringify({status:'PASS',fictional:true,widths:[320,390,1024,1440],javascript:[true,false],ownerSelfActivation:true,deviceTest:'PENDING'},null,2));
 console.log('RESULTADO=WALLET_CHECKOUT_BROWSER_PASS');
} catch(error) {
 if(output){await mkdir(output,{recursive:true});await writeFile(resolve(output,'error.txt'),String(error.stack||error));}
 console.log('RESULTADO=WALLET_CHECKOUT_BROWSER_FAILED');process.exitCode=1;
} finally {if(browser)await browser.close();for(const close of cleanup.reverse())await close();}

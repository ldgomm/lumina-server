// UI checks use disposable SQLite, fictional accounts/prices and a fake Wallet.
// Nothing here reads the business's real database, configuration or credentials.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { agency, owner, portal } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
import { fakeLoyalty } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/loyalty-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const cleanups=[],t={after:f=>cleanups.push(f)};
const out=process.env.LUMINA_UI_EVIDENCE;
let browser;
try {
 const loyalty=await fakeLoyalty(t,fileURLToPath(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty/',import.meta.url))),w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken}),admin=await agency(w),a=await owner(w,'Negocio de prueba visual','1');
 for(const data of [
  {name:'Video individual',offer_kind:'INDIVIDUAL',individual_service:'VIDEO',term:'ONE_OFF',price:'35.25'},
  {name:'Contenido mensual',offer_kind:'BUNDLE',VIDEO:'4',GRAPHIC:'2',term:'MONTHLY',price:'120'},
  {name:'Proyecto web a medida',offer_kind:'INDIVIDUAL',individual_service:'WEBSITE',term:'ONE_OFF',price:''}
 ])assert.equal((await admin.post('/plans',{wallet:'NONE',description:'Datos ficticios exclusivamente para verificar la interfaz.',...data})).status,303);
 browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 const context=await browser.newContext({reducedMotion:'reduce'});
 await context.addCookies([{name:'lumina_session',value:a.client.cookie.split('=')[1],url:w.origin,httpOnly:true,sameSite:'Strict'}]);
 await context.route('**/*',route=>new URL(route.request().url()).origin===w.origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
 if(out)await mkdir(out,{recursive:true});
 for(const width of [320,390,1024,1440]) {
  await page.setViewportSize({width,height:1000});
  for(const path of ['/home','/content?view=requests','/requests/new','/plans','/requests']) {
   await page.goto(w.origin+path);await fit();
   if(out&&[390,1440].includes(width))await page.screenshot({path:resolve(out,`${path.split('?')[0].replaceAll('/','_')}-${width}.png`),fullPage:true});
  }
  if(width>760){
   await page.goto(w.origin+'/home');const principal=await page.locator('.site-header').boundingBox(),row=await page.locator('#workspace-nav>a').first().boundingBox();
   await page.goto(w.origin+'/content');const module=await page.locator('.content-sidebar').boundingBox(),moduleRow=await page.locator('.content-sidebar nav>a').first().boundingBox();
   assert.equal(module.width,principal.width,'Identical sidebar width');assert.equal(moduleRow.height,row.height,'Identical navigation row height');assert.ok(Math.abs(moduleRow.width-row.width)<=1,'Identical navigation insets');
   await page.goto(w.origin+'/wallet/management?section=programs');await page.locator('.workspace-sidebar').waitFor();const wallet=await page.locator('.workspace-sidebar').boundingBox(),walletRow=await page.locator('.workspace-nav button').first().boundingBox();assert.equal(wallet.width,principal.width,'Wallet sidebar width');assert.equal(walletRow.height,row.height,'Wallet navigation row height');assert.ok(Math.abs(walletRow.width-row.width)<=1,'Wallet navigation insets');await fit();
  }
  await page.goto(w.origin+'/content?view=requests');
  if(width<760){await page.getByRole('button',{name:'Abrir menú de Contenido'}).click();assert.equal(await page.locator('.content-sidebar').isVisible(),true);await page.getByRole('button',{name:'Cerrar navegación',exact:true}).first().focus();await page.keyboard.press('Escape');assert.equal(await page.locator('.content-sidebar').isVisible(),false);}
  await page.getByLabel('Diseño para redes',{exact:false}).check();assert.equal(await page.locator('[data-price-service=VIDEO]').isVisible(),false);assert.equal(await page.locator('[data-price-service=GRAPHIC]').isVisible(),true);
  await page.goto(w.origin+'/plans');
  await page.getByRole('button',{name:'Añadir una unidad de Video individual',exact:true}).click();await page.getByRole('button',{name:'Añadir una unidad de Contenido mensual',exact:true}).click();
  await page.locator('[data-catalog-filters] summary').click();await page.getByLabel('Tipo de oferta').selectOption('individual');assert.equal(await page.locator('[data-name="Contenido mensual"]').isVisible(),false);assert.match(await page.locator('[data-package-lines]').innerText(),/Contenido mensual/);
  await page.getByRole('button',{name:'Añadir una unidad de Proyecto web a medida',exact:true}).click();assert.match(await page.locator('[data-package-totals]').innerText(),/Subtotal conocido/);await fit();
 }
 await page.goto(w.origin+'/requests/new?area=SOCIAL');await page.locator('.request-options summary').click();await page.getByLabel('Tipo de solicitud').selectOption('VISIT');assert.equal(await page.locator('[data-visit]').isVisible(),true);assert.equal(await page.locator('[name=quantity]').isEnabled(),false);
 assert.equal(await page.getByLabel('Teléfono de contacto',{exact:true}).inputValue(),'0991234567');await page.getByLabel('Teléfono de contacto',{exact:true}).fill('0987654321');
 await page.getByLabel('¿Qué quieres lograr?').fill('Grabación ficticia');await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click();await page.waitForURL(/\/requests\/[a-f0-9-]+$/);assert.match(await page.locator('h1').innerText(),/Grabación ficticia/);
 assert.deepEqual(errors,[]);
 if(out)await writeFile(resolve(out,'result.json'),JSON.stringify({status:'PASS',widths:[320,390,1024,1440],data:'fictional'},null,2));
 console.log('RESULTADO=LUMINA_BROWSER_UI_PASS');
} catch(error) {
 if(out){await mkdir(out,{recursive:true});await writeFile(resolve(out,'error.txt'),String(error.stack||error));}
 console.log('RESULTADO=LUMINA_BROWSER_UI_FAILED');process.exitCode=1;
} finally {if(browser)await browser.close();for(const close of cleanups.reverse())await close();}

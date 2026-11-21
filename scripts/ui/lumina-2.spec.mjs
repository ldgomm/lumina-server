import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createFileStore} from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/content/file-store.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {agency,owner,portal,colleague,documentFor,teamRevision} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
import {fakeLoyalty} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/loyalty-fixture.mjs';

const {chromium}=createRequire(import.meta.url)('playwright');
const cleanup=[],t={after:fn=>cleanup.push(fn)},output=process.env.LUMINA_UI_EVIDENCE;
const mockPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=','base64');
let browser;
try {
  const native=await fakeLoyalty(t,fileURLToPath(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty/',import.meta.url)));
  const dir=await mkdtemp(resolve(tmpdir(),'lumina-studio-'));
  cleanup.push(()=>rm(dir,{recursive:true,force:true}));
  const world=await portal(t,native.origin,{platformToken:native.platformToken},{fileStore:createFileStore(resolve(dir,'uploads'))});
  const admin=await agency(world), business=await owner(world,'Café del Patio','studio-demo');
  const staff=await colleague(world,business.client,{name:'Caja de prueba',document:documentFor('caja-v2')});
  const scoped=path=>'/agency'+path+'?company='+business.id;
  const post=async(actor,path,values={})=>{
    const r=await actor.post(path,values);assert.equal(r.status,303,path+' '+r.status);return r.location;
  };
  await post(admin,scoped('/businesses/verify'));
  const tenant=world.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',business.id).loyalty_tenant;
  await post(business.client,'/team/'+staff.id+'/cashier/save',{revision:teamRevision(world,staff.id),branch:native.branches.get(tenant)[0].id,purchases:'yes',rewards:'yes'});
  const request=await post(business.client,'/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'La preparación del espresso',brief:'Mostrar la preparación del café.',phone:'0991234567'});
  await post(admin,scoped(request+'/state'),{status:'APPROVED'});
  await post(admin,scoped(request+'/pieces'),{title:'Del grano a la taza'});
  const piece=world.db.get('SELECT id,revision FROM pieces WHERE request_id=?',request.split('/').at(-1));
  const version=()=>String(world.db.get('SELECT revision FROM pieces WHERE id=?',piece.id).revision);
  const upload=new FormData();
  for(const [key,value] of Object.entries({_csrf:admin.csrf,revision:version(),label:'Fotograma del espresso',asset:'',request_key:randomUUID()}))upload.append(key,value);
  upload.append('file',new Blob([mockPng],{type:'image/png'}),'fotograma.png');
  const uploaded=await fetch(world.origin+scoped(request+'/pieces/'+piece.id+'/upload'),{method:'POST',headers:{Cookie:admin.cookie,Origin:world.origin},body:upload,redirect:'manual'});
  assert.equal(uploaded.status,303);
  await post(admin,scoped(request+'/pieces/'+piece.id+'/edit'),{status:'REVIEW',revision:version()});
  browser=await chromium.launch({headless:true,...(process.env.LOYALTY_UI_CHROMIUM?{executablePath:process.env.LOYALTY_UI_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
  if(output)await mkdir(output,{recursive:true});
  const errors=[];
  const contextFor=async(session,options={})=>{
    const context=await browser.newContext({reducedMotion:'reduce',...options});
    await context.route('**/*',route=>new URL(route.request().url()).origin===world.origin?route.continue():route.abort());
    if(session)await context.addCookies([{name:'lumina_session',value:session.cookie.split('=')[1],url:world.origin,httpOnly:true,sameSite:'Strict'}]);
    const page=await context.newPage();page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
    return {context,page};
  };
  const go=async(page,path)=>{assert.equal((await page.goto(world.origin+path)).status(),200,path);};
  const fits=async page=>{
    const dimensions=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);
    if(dimensions[0]>dimensions[1]+1){
      const elements=await page.locator('body *').evaluateAll(nodes=>nodes.filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>[e.tagName,e.getAttribute('class'),e.textContent.trim().slice(0,32),Math.round(e.getBoundingClientRect().right)]));
      const wide=await page.locator('body *').evaluateAll(nodes=>nodes.filter(e=>e.scrollWidth>e.clientWidth+2 && e.clientWidth>0).map(e=>[e.tagName,e.className,e.clientWidth,e.scrollWidth,e.textContent.trim().slice(0,32)]).slice(0,24));
      assert.fail(page.url()+' '+dimensions.join(' > ')+' '+JSON.stringify({elements,wide}));
    }
  };
  const snap=async(page,name,width)=>{
    if(output&&[390,1440].includes(width))await page.screenshot({path:resolve(output,name+'-'+width+'.png'),animations:'disabled'});
  };
  const widths=[320,390,768,1024,1440];
  const guest=await contextFor(null);
  for(const width of widths){
    await guest.page.setViewportSize({width,height:width<500?844:900});
    await go(guest.page,'/');await guest.page.locator('.studio-photo img').evaluate(img=>img.decode());
    await fits(guest.page);await snap(guest.page,'inicio',width);
    await guest.page.locator('#service-web summary').click();assert.ok(await guest.page.locator('#service-web').evaluate(el=>el.open));
    await go(guest.page,'/login');await fits(guest.page);
  }
  const {page,context}=await contextFor(business.client);
  let metricsAvailable=true;
  await context.route('**/wallet-api/api/staff/customer-activity*',route=>metricsAvailable?
    route.fulfill({json:{summary:{periodPurchases:0,periodSpentMinor:0,periodBuyers:0,periodClaimedRewards:0,registeredCustomers:0,nearCustomers:0,readyCustomers:0,inactiveCustomers:0,newCustomers:0},customers:[],from:'2026-11-01',through:'2026-11-20',timezone:'America/Guayaquil'}}):
    route.fulfill({status:503,json:{message:'Actividad temporalmente no disponible'}}));
  await context.route('**/api/public/*/qr*',route=>route.fulfill({contentType:'image/png',body:mockPng}));
  for(const width of widths){
    await page.setViewportSize({width,height:width<500?844:900});
    for(const [path,name] of [['/home','negocio'],['/content','contenido'],['/services','servicios'],['/services/web','web'],['/services/maps','maps'],['/services/brand','marca'],['/wallet','wallet']]){
      await go(page,path);
      if(path==='/wallet'){await page.locator('.wallet-desk').waitFor();await page.locator('.overview-metrics').waitFor();}
      await fits(page);if(['negocio','contenido','wallet'].includes(name))await snap(page,name,width);
      if(path==='/home' || path==='/content') {
        const notice=page.getByRole('complementary',{name:'Video de cortesía'});
        const details=notice.locator('#courtesy-description'),toggle=notice.getByRole('button');
        const action=notice.getByRole('link',{name:'Solicitar mi video'});
        const expanded=await notice.boundingBox();
        await toggle.click();
        await details.waitFor({state:'hidden'});
        await notice.locator('button[aria-expanded="false"]:not([aria-disabled])').waitFor();
        assert.equal(await notice.getByRole('heading').count(),0);
        assert.match(await notice.innerText(),/Video gratis/);
        const strip=await notice.boundingBox(),button=await toggle.boundingBox(),link=await action.boundingBox();
        assert.ok(strip.height<=60 && strip.height<=expanded.height*0.65, 'Aviso compacto en '+path+' a '+width+' px');
        assert.ok(Math.abs(button.y-link.y)<2 && button.x+button.width<=link.x, 'Controles en una sola fila');
        assert.ok(button.height>=44 && link.height>=44);
        await fits(page);
        await page.reload();
        assert.equal(await details.isVisible(),false);
        await toggle.focus();
        await page.keyboard.press('Enter');
        await notice.locator('button[aria-expanded="true"]:not([aria-disabled])').waitFor();
        assert.equal(await details.isVisible(),true);
        assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
      }
    }
  }
  const agencySession=await contextFor(admin);
  await go(agencySession.page,'/services/maps');
  assert.equal(await agencySession.page.locator('.task-action').getAttribute('href'),'/businesses');
  await go(agencySession.page,'/dashboard');await fits(agencySession.page);
  await go(agencySession.page,request+'?company='+business.id);
  assert.equal(await agencySession.page.getByRole('button',{name:'Aprobar entrega'}).count(),0);
  await go(page,'/content?view=reviews');
  assert.equal(await page.locator('.piece-media img').count(),0);
  await page.locator('[data-piece-preview] summary').click();
  await page.locator('.piece-media img').evaluate(image=>image.decode());
  assert.equal(await page.locator('.piece-media img').getAttribute('alt'),'Fotograma del espresso');
  await go(page,'/home');await page.locator('.task-action').click();
  assert.equal(new URL(page.url()).hash,'#piece-'+piece.id);
  await go(page,'/content');await page.locator('.task-action').click();
  await page.getByRole('button',{name:'Aprobar entrega',exact:true}).click();
  await page.waitForLoadState('networkidle');
  assert.equal(world.db.get('SELECT status FROM pieces WHERE id=?',piece.id).status,'APPROVED');
  await go(page,'/content');assert.doesNotMatch(await page.locator('.task-panel').innerText(),/en revisión/);
  await go(page,'/wallet');await page.getByRole('button',{name:/Compartir mi QR/}).click();
  await page.locator('#joinAddress').waitFor();
  const join=new URL(await page.locator('#joinAddress').inputValue());assert.equal(join.origin,native.origin);
  assert.equal(join.pathname,'/join/'+native.businesses.get(tenant).slug);assert.equal(join.search,'');
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});});
  await page.getByRole('button',{name:'Copiar enlace'}).click();assert.equal(await page.locator('#joinAddress').evaluate(i=>i.value.slice(i.selectionStart,i.selectionEnd)),join.href);
  await page.evaluate(()=>{window.print=()=>{window.printDialogRequested=true;};});
  await page.getByRole('button',{name:'Imprimir QR'}).click();assert.ok(await page.evaluate(()=>window.printDialogRequested));
  await page.emulateMedia({media:'print'});assert.ok(await page.locator('.join-sign').isVisible());assert.equal(await page.locator('.join-controls').isVisible(),false);await page.emulateMedia({media:'screen'});
  metricsAvailable=false;await go(page,'/wallet');await page.locator('#retryOverview').waitFor();
  await page.locator('[data-wallet-task="sales"]').click();await page.locator('#lookup').waitFor();
  const cashier=await contextFor(staff.session);
  await cashier.page.setViewportSize({width:390,height:844});await go(cashier.page,'/wallet');
  assert.equal(new URL(cashier.page.url()).pathname,'/cashier');await cashier.page.locator('#lookup').waitFor();await fits(cashier.page);
  await cashier.page.locator('#kind').selectOption('document');await cashier.page.locator('#value').fill('1700000001');await cashier.page.locator('#lookup button[type=submit],#lookup button:not([type])').first().click();
  const purchase=cashier.page.locator('#purchase');
  await purchase.locator('[name=receipt]').fill('VENTA-DE-PRUEBA');await purchase.locator('[name=amount]').fill('3.50');await purchase.locator('button[type=submit],button:not([type])').first().click();
  await cashier.page.locator('#finishSimplePurchase button').click();await cashier.page.locator('.counter-receipt').waitFor();
  assert.match(await cashier.page.locator('.counter-receipt').innerText(),/Compra registrada/);
  assert.equal(native.calls.filter(c=>c.path==='/api/staff/purchases').length,1);
  const off=await contextFor(business.client,{javaScriptEnabled:false});
  await off.page.setViewportSize({width:320,height:750});
  for(const path of ['/','/home','/content','/services/brand']){await go(off.page,path);await fits(off.page);}
  await go(off.page,'/home');
  const gift=off.page.getByRole('complementary',{name:'Video de cortesía'});
  await gift.getByRole('button',{name:/Minimizar/}).click();
  await gift.getByRole('button',{name:/Video gratis/}).waitFor();
  await go(off.page,'/content');
  assert.equal(await gift.getByRole('heading').count(),0);
  await gift.getByRole('link',{name:'Solicitar mi video'}).click();
  assert.equal(new URL(off.page.url()).pathname,'/courtesy');
  assert.deepEqual(errors,[]);
  console.log('RESULTADO=LUMINA_2_BROWSER_PASS');
} finally {
  if(browser)await browser.close();
  for(const close of cleanup.reverse())await close();
}

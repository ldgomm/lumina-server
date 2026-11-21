'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../src/main/resources/com/premierdarkcoffee/loyalty');
const company = {id:'fixture', name:'Café de ejemplo', slug:'cafe', currency:'USD', timezone:'America/Guayaquil'};
const code = 'LUMINA-CAJA-DEMO-' + 'A'.repeat(26);
// QR modules for the fictional personal card above, and for an unrelated QR.
const cardQr = '1fc7337f,105ad041,175aaf5d,1759115d,174b375d,10462e41,1fd5557f,137800,105215ce,2869bad,1479f5aa,118d87da,1a42b383,bae10b5,e4b0fe5,178a2146,1fc11720,103ecee7,1b7d23d4,179485ec,16f76bf9,10451e,1fc5055b,10437b12,174bd9f1,174b4e3e,174be0ba,1049d4bc,1fd2cec6';
const otherQr = '1fdcee7f,10432241,175c885d,174e335d,1744335d,105bdd41,1fd5557f,8800,1465bb25,169511c9,1679ddee,632770c,165accdd,19b4cc2d,6d52212,f86884a,1f0bb36,c221127,1f7addd3,4907799,1840cdff,1fcf12,1fdc2355,1049891a,1747bbfe,174b9218,17505f5b,1048f4f5,1fd40cb7';
const programs = [{id:'points', config:{name:'Puntos', kind:'POINTS', active:true}}, {id:'cash', config:{name:'Mi saldo', kind:'CASHBACK', active:true}}];
const rewards = [{id:'dessert', name:'Postre', programId:'points', cost:100, active:true, version:1},
    {id:'credit', name:'Premio de saldo', programId:'cash', cost:500, active:true, version:1}];

async function run() {
    const {cashierHtml, loyaltyWorkspaceHtml} = await import('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/wallet-pages.mjs');
    const {securityHeaders} = await import('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/http.mjs');
    const browser = await chromium.launch({headless:true, executablePath:process.env.LOYALTY_UI_CHROMIUM || undefined, args:['--no-sandbox','--disable-dev-shm-usage']});
    try {
        const page = await browser.newPage({viewport:{width:1440,height:1000}});
        page.setDefaultTimeout(6500);
        const calls = [], errors = [];
        let role = 'OWNER', cash = 725, conflict = true, heldSuggestions;
        page.on('pageerror', e => errors.push(e.message));
        const routes = '/api/staff/';
        await page.route('**/*', async route => {
            const req = route.request(), url = new URL(req.url());
            assert.equal(url.origin, 'https://caja.test');
            if (['/wallet','/cashier'].includes(url.pathname)) {
                role = url.pathname === '/wallet' ? 'OWNER' : 'CASHIER';
                const actor = {kind:role === 'OWNER'?'OWNER':'COLLABORATOR', csrf:'fiction', company_id:company.id, grants:[]};
                const html = role === 'OWNER' ? loyaltyWorkspaceHtml(actor,'sales',['sales'],company) : cashierHtml(actor,company,{branch_name:'Centro'});
                const headers = {}; securityHeaders({setHeader:(key,value)=>{ headers[key]=value; }},true);
                return route.fulfill({body:html,contentType:'text/html; charset=utf-8',headers});
            }
            const api = url.pathname.replace(/^\/wallet-api/, '');
            if (api.startsWith(routes)) {
                const endpoint = api.slice(routes.length), body = req.postDataJSON(), json = value => route.fulfill({json:value});
                calls.push({endpoint,body,key:req.headers()['idempotency-key']});
                if (endpoint === 'dashboard') return json({role, branchId:'main', business:company, branches:[{id:'main',name:'Centro'}],
                    programs,rewards,permissions:{rewards:true,purchases:true},walletAccess:{effectiveState:'ACTIVE'}});
                if (endpoint === 'access') return json({canOperate:true});
                if (endpoint === 'member-suggestions') {
                    if (url.searchParams.get('q') === 'lenta') { heldSuggestions = () => json({items:[{name:'Anterior',cardCode:code}]}); return; }
                    return json({items:url.searchParams.get('q') === 'ninguno' ? [] : [{name:'Ana Ruiz',cardCode:code},{name:'Ana Paz',cardCode:'OTRO-CODIGO'}]});
                }
                if (endpoint === 'members/lookup') {
                    if (body.document === '00000') return route.fulfill({status:404,json:{code:'NOT_FOUND',message:'Cliente no encontrado.'}});
                    return json({member:{id:'fiction',name:'Ana Ruiz',cardCode:code,revision:cash===725?1:2},
                        balances:[{programId:'points',name:'Puntos',kind:'POINTS',available:44},{programId:'cash',name:'Mi saldo',kind:'CASHBACK',available:cash}],rewards});
                }
                if (endpoint === 'counter-redemptions' && conflict) {
                    conflict = false; cash = 200;
                    return route.fulfill({status:409,json:{code:'CARD_CHANGED',message:'La tarjeta cambió.'}});
                }
                if (endpoint === 'redemptions/confirm') return json({receipt:'anterior',name:'Premio reservado'});
                throw Error('Unexpected API ' + api);
            }
            const file = path.basename(url.pathname);
            const folder = url.pathname.startsWith('/assets/') ? 'lumina/presentation/assets' : 'presentation/loyalty';
            const local = path.join(root,folder,file);
            const types = {'.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
            return fs.existsSync(local) ? route.fulfill({path:local,contentType:types[path.extname(file)]}) : route.fulfill({status:404});
        });
        const find = page.locator('#findCustomer'), input = page.locator('#value'), scan = page.locator('#scanWallet');
        const count = endpoint => calls.filter(c => c.endpoint === endpoint).length;
        async function open(route) { await page.goto('https://caja.test/'+route); await find.waitFor(); }
        async function capture(name) {
            if (!process.env.LOYALTY_UI_EVIDENCE) return;
            fs.mkdirSync(process.env.LOYALTY_UI_EVIDENCE,{recursive:true});
            await page.screenshot({path:path.join(process.env.LOYALTY_UI_EVIDENCE,name+'.png')});
        }
        await open('wallet');
        assert.equal(await find.isDisabled(),true);
        await capture('caja-escritorio');
        for (const width of [320,390,768,1440]) {
            await page.setViewportSize({width,height:width<500?844:1000});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            assert.ok((await scan.boundingBox()).height>=44);
            if (width===390) await capture('caja-movil');
        }
        await input.fill('    '); await input.press('Enter'); assert.equal(await find.isDisabled(),true);
        await input.fill('123'); assert.equal(await find.isDisabled(),true);
        assert.equal(count('members/lookup'),0);
        await input.fill('00000'); await find.click();
        await page.locator('#lookup .form-feedback').waitFor(); assert.equal(await input.inputValue(),'00000');
        await input.fill('ABC-123'); assert.equal(await page.locator('#lookup .form-feedback').isVisible(),false);
        await page.selectOption('#kind','name'); await input.fill('A'); assert.equal(await find.isDisabled(),true);
        await input.fill('ninguno'); await find.click();
        await page.waitForFunction(()=>document.querySelector('#value-search-status').textContent.includes('Sin coincidencias'));
        await input.fill('lenta'); await page.waitForRequest(r=>r.url().includes('q=lenta'));
        await page.selectOption('#kind','document'); await heldSuggestions(); await page.waitForTimeout(90);
        assert.equal(await page.locator('[role=option]').count(),0);
        await page.selectOption('#kind','name'); await input.fill('Ana'); await input.press('Enter');
        await page.locator('#value-suggestions [role=option]').last().waitFor();
        assert.equal(count('members/lookup'),1);
        await input.press('ArrowUp'); assert.equal(await page.locator('#value-suggestions [aria-selected=true] strong').textContent(),'Ana Paz');
        await input.press('ArrowDown'); await input.press('Enter');
        await page.locator('#counterPriorityAction').waitFor();
        assert.deepEqual(calls.filter(c=>c.endpoint==='members/lookup').at(-1).body,{cardCode:code});
        assert.equal(await page.locator('.counter-legacy').isVisible(),false);
        assert.match(await page.locator('.counter-wallet-reward').textContent(),/7\.25 USD/);
        await page.locator('#counterPriorityAction').click(); assert.equal(await page.locator('#rewardId').inputValue(),'credit');
        assert.equal(count('counter-redemptions'),0);
        await page.locator('#counterChoose button').click();
        const confirm = page.locator('#counterConfirm');
        assert.ok(await confirm.locator('button').isDisabled());
        await confirm.locator('[name=identityVerified]').check(); assert.ok(await confirm.locator('button').isDisabled());
        await confirm.locator('[name=customerConfirmed]').check();
        await confirm.evaluate(f=>{f.requestSubmit();f.requestSubmit();});
        await page.getByRole('button',{name:'Actualizar saldo y premios'}).waitFor();
        assert.equal(count('counter-redemptions'),1);
        await confirm.locator('[name=customerConfirmed]').uncheck();
        await confirm.locator('[name=customerConfirmed]').check();
        assert.ok(await confirm.locator('button:not([type])').isDisabled());
        await page.getByRole('button',{name:'Actualizar saldo y premios'}).click();
        await page.waitForFunction(()=>document.querySelector('#counterWalletReward')?.textContent==='Postre');
        assert.equal(count('counter-redemptions'),1);
        await page.locator('#changeCustomer').click(); assert.equal(await find.isDisabled(),true);

        // Exercise the real frame decoder with simulated video, cancellation and late permissions.
        await page.evaluate(({card,other})=>{
            window.cameraTests = {mode:'denied',calls:0,streams:[],card,other};
            const t = window.cameraTests;
            function makeStream() {
                const canvas=document.createElement('canvas'); canvas.width=canvas.height=296;
                const c=canvas.getContext('2d');
                function draw() {
                    c.fillStyle='white'; c.fillRect(0,0,296,296); c.fillStyle='black';
                    t.pattern.split(',').forEach((hex,y)=>{
                        const row=parseInt(hex,16);
                        for(let x=0;x<29;x++) if((row >>> (28-x)) & 1) c.fillRect((4+x)*8,(4+y)*8,8,8);
                    });
                }
                draw();
                const media=canvas.captureStream(12); t.streams.push(media);
                const timer=setInterval(()=>{if(media.getTracks().every(track=>track.readyState==='ended'))clearInterval(timer);else draw();},80);
                return media;
            }
            Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{
                if(constraints.audio !== false) throw Error('Unexpected microphone request');
                t.calls++;
                if(t.mode==='denied') throw new DOMException('denied','NotAllowedError');
                if(t.mode==='missing') throw new DOMException('missing','NotFoundError');
                if(t.mode==='busy') throw new DOMException('busy','NotReadableError');
                if(t.mode==='hold') return new Promise((resolve,reject)=>{t.grant=()=>resolve(makeStream());t.deny=()=>reject(new DOMException('late','NotAllowedError'));});
                return makeStream();
            }});
            t.pattern=t.other;
        },{card:cardQr,other:otherQr});
        for(const [mode,message] of [['denied','Permite el acceso'],['missing','no tiene una cámara'],['busy','ocupada']]){
            await page.evaluate(mode=>window.cameraTests.mode=mode,mode);await scan.click();
            await page.locator('#scannerMount [role=alert]').waitFor();
            assert.match(await page.locator('#scannerMount [role=alert]').textContent(),new RegExp(message));
            assert.equal(await scan.isEnabled(),true);await page.getByRole('button',{name:'Buscar por cédula',exact:true}).click();
            assert.ok(await input.evaluate(e=>e===document.activeElement));
        }
        await page.evaluate(()=>window.cameraTests.mode='hold');await scan.click();
        await page.getByRole('button',{name:'Cerrar cámara'}).click();await page.evaluate(()=>window.cameraTests.grant());
        await page.waitForFunction(()=>window.cameraTests.streams[0].getTracks()[0].readyState==='ended');
        await scan.click();await page.getByRole('button',{name:'Cerrar cámara'}).click();await page.evaluate(()=>window.cameraTests.deny());
        assert.equal(await page.locator('#scannerMount [role=alert]').count(),0);
        await page.evaluate(()=>window.cameraTests.mode='video');
        await scan.evaluate(b=>{b.click();b.click();});
        await page.waitForFunction(()=>document.querySelector('#scannerMount [role=status]')?.textContent.includes('no corresponde'));
        const before = count('members/lookup');
        await page.evaluate(()=>window.cameraTests.pattern=window.cameraTests.card);
        await page.locator('.customer-counter').waitFor();
        assert.equal(count('members/lookup'),before+1); assert.equal(count('purchases'),0);
        assert.deepEqual(calls.filter(c=>c.endpoint==='members/lookup').at(-1).body,{cardCode:code});
        assert.equal(await page.evaluate(()=>window.cameraTests.streams.at(-1).getTracks()[0].readyState),'ended');
        await page.locator('#changeCustomer').click();assert.equal(await scan.evaluate(b=>b===document.activeElement),true);
        await open('cashier');
        assert.ok(await find.isDisabled()); await input.fill(code);await input.press('Enter');await page.locator('.customer-counter').waitFor();
        assert.deepEqual(calls.filter(c=>c.endpoint==='members/lookup').at(-1).body,{cardCode:code});
        assert.equal(await page.locator('#openWalletRecovery').count(),0);
        const review=page.locator('#purchase button:not([type])'); assert.ok(await review.isDisabled());
        await page.locator('#receipt').fill('   ');await page.locator('#amount').fill('5');assert.ok(await review.isDisabled());
        await page.locator('#receipt').fill('CAJA-01');assert.ok(await review.isEnabled());
        await open('cashier');await page.locator('.counter-legacy summary').click();const legacy=page.locator('#confirm');
        assert.ok(await legacy.locator('button').isDisabled());await legacy.locator('#token').fill('x'.repeat(32));
        await legacy.evaluate(f=>{f.requestSubmit();f.requestSubmit();});await page.locator('.counter-receipt').waitFor();
        assert.equal(count('redemptions/confirm'),1);assert.ok(calls.find(c=>c.endpoint==='redemptions/confirm').key);
        assert.equal(await page.locator('.lookup-panel').isVisible(),false);
        await page.locator('#nextCustomer').click();assert.ok(await find.isDisabled());
        assert.deepEqual(errors,[]);
        console.log('RESULTADO=CAJA_BUSQUEDA_CAMARA_CANJE_Y_RECIBO_PASS');
    } finally { await browser.close(); }
}
run().catch(issue=>{console.error(issue);process.exitCode=1;});

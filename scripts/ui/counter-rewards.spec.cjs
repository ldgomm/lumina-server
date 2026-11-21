// Isolated cashier checks. Every request is intercepted; no real cards, providers or database.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const web = path.resolve(__dirname, '../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const evidence = process.env.LOYALTY_UI_EVIDENCE;
const program = (id, name, kind = 'STAMPS', extra = {}) => ({id, config: {active: true, name, kind, ...extra}});
const programs = [program('service', 'Servicios', 'STAMPS', {productGroup: 'servicio', countUnits: true}), program('points', 'Club de compras', 'POINTS'), program('near', 'Visitas al taller'), program('new', 'Nueva promoción'), program('cash', 'Saldo promocional', 'CASHBACK'), program('paused', 'Promoción pausada', 'STAMPS', {active: false})];
const fixture = {role: 'OWNER', business: {id: 'test', name: 'Taller Aurora', currency: 'USD', timezone: 'America/Guayaquil'}, branches: [{id: 'a', name: 'Centro'}, {id: 'b', name: 'Norte'}], programs, rewards: []};
const rewards = [
    {id: 'discount', programId: 'service', cost: 13, name: '50% en tu servicio', benefit: {percentBps: 5000, group: 'servicio', scope: 'ITEM'}, benefitText: '50% de descuento en una unidad de «servicio», la de menor precio elegible.'},
    {id: 'second', programId: 'service', cost: 7, name: '20% en tu servicio', benefit: {percentBps: 2000, group: 'servicio', scope: 'ITEM'}, benefitText: '20% de descuento en una unidad de «servicio», la de menor precio elegible.'},
    {id: 'direct', programId: 'points', cost: 100, name: 'Bolsa de regalo'},
    {id: 'direct2', programId: 'points', cost: 90, name: 'Accesorio a elección'},
    {id: 'near', programId: 'near', cost: 13, name: 'Detalle por tus visitas'},
    {id: 'zero', programId: 'new', cost: 3, name: 'Nuevo premio'},
    {id: 'cash', programId: 'cash', cost: 500, name: '<img src=x onerror="window.injected=true">'},
].map(r => ({active: true, version: 2, benefit: null, ...r}));
const member = {member: {id: 'member', name: 'Ana Ejemplo', revision: 9, cardCode: 'FAKE-CARD'}, rewards,
    balances: [['service', 13], ['points', 110], ['near', 12], ['cash', 501]].map(([programId, available]) => {
        const p = programs.find(p => p.id === programId); return {programId, available, kind: p.config.kind, name: p.config.name};
    })};

async function run() {
    const browser = await chromium.launch({headless: true, ...(process.env.LOYALTY_UI_CHROMIUM ? {executablePath: process.env.LOYALTY_UI_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']} : {})});
    const checks = [], errors = [], calls = [];
    let pendingPurchase, failPurchase = true, pendingRedemption;
    let conflictQuote = false, conflictSave = false, failRefresh = false, refreshedMember = null;
    const waitPending = async read => { const until = Date.now() + 5000; while (!read()) { if (Date.now() > until) throw new Error('Expected request was not sent'); await new Promise(r => setTimeout(r, 10)); } };
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            assert.equal(url.origin, 'https://loyalty.test');
            if (url.pathname.startsWith('/api/')) {
                const payload = request.postDataJSON(); calls.push({path: url.pathname, payload, key: request.headers()['idempotency-key']});
                if (url.pathname === '/api/staff/members/lookup') {
                    if (failRefresh) { failRefresh=false; return route.fulfill({status:503,json:{message:'Conexión interrumpida.'}}); }
                    return route.fulfill({json:refreshedMember || member});
                }
                if (url.pathname === '/api/staff/purchases/quote' && conflictQuote) {
                    conflictQuote=false; return route.fulfill({status:409,json:{code:'CARD_CHANGED'}});
                }
                if (url.pathname === '/api/staff/purchases' && conflictSave) {
                    conflictSave=false; return route.fulfill({status:409,json:{code:'REWARD_CHANGED'}});
                }
                if (url.pathname === '/api/staff/purchases/quote') return route.fulfill({json: {grossMinor: 1000, discountMinor: payload.rewardId === 'discount' ? 500 : 200, amountMinor: payload.rewardId === 'discount' ? 500 : 800, rewardName: rewards.find(r => r.id === payload.rewardId)?.name}});
                if (url.pathname === '/api/staff/purchases') {
                    pendingPurchase = () => route.fulfill(failPurchase ? {status: 503, json: {message: 'Respuesta pendiente. Reintenta con el mismo comprobante.'}} : {json: {purchaseId: 'receipt', amountMinor: payload.amountMinor, discountMinor: 200, earned: [], redemptionId: 'redemption', replayed: true}});
                    return;
                }
                if (url.pathname === '/api/staff/counter-redemptions') {
                    pendingRedemption = () => route.fulfill({json: {name: 'Accesorio a elección', receipt: 'direct-receipt', replayed: false}}); return;
                }
                throw new Error('Unexpected API ' + url.pathname);
            }
            const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
            if (!/^[a-zA-Z0-9.-]+$/.test(name) || !fs.existsSync(path.join(web, name))) return route.fulfill({status: 404});
            let body = fs.readFileSync(path.join(web, name));
            if (name === 'index.html') body = body.toString().replace('</head>', '<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
            return route.fulfill({body, contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'});
        });
        await page.goto('https://loyalty.test/');
        async function lookup() {
            await page.evaluate(data => {state.data = data; state.token = 'fictitious'; state.tab = 'sales'; renderMerchant();}, fixture);
            await page.locator('#value').fill('FAKE-CARD'); await page.locator('#lookup button').first().click();
            await page.locator('.counter-rewards').waitFor();
        }
        const pick = id => page.locator(`[data-select-counter-reward="${id}"]`);
        const card = name => page.locator('.counter-reward-card').filter({has: page.getByRole('heading', {name, exact: true})});
        await lookup();
        assert.equal(await page.locator('.counter-reward-card').count(), 2);
        await page.locator('#jumpToPurchase').click();
        assert.equal(await page.locator('#receipt').evaluate(e => e === document.activeElement), true);
        await page.locator('#moreCounterRewards').click();
        assert.equal(await page.locator('#counterRewardsTitle').textContent(), '5 opciones con saldo suficiente');
        assert.match(await card('Detalle por tus visitas').textContent(), /Falta 1 sello/);
        assert.match(await card('Nuevo premio').textContent(), /Faltan 3 sellos/);
        assert.match(await card('20% en tu servicio').textContent(), /queda en 6 sellos/);
        assert.equal(await page.locator('.counter-rewards').getByText('Promoción pausada', {exact: true}).count(), 0);
        assert.equal(calls.filter(c => c.path !== '/api/staff/members/lookup').length, 0);
        assert.match(await card(rewards[6].name).textContent(), /queda en 0.01 USD/);
        assert.equal(await page.locator('.counter-reward-grid img').count(), 0);
        assert.equal(await page.evaluate(() => window.injected), undefined);
        checks.push('Arbitrary 13-stamp goal, independent balances, exact cents, zero progress and escaped names');
        await page.locator('[data-reward-filter=ready]').click();
        await page.locator('#moreCounterRewards').click();
        assert.equal(await page.locator('.counter-reward-card').count(), 5);
        assert.equal(await card('Detalle por tus visitas').count(), 0);
        await page.locator('[data-reward-filter=all]').click();
        checks.push('Balance-ready filter counts alternatives without combining program balances');

        await page.locator('#checkoutBranch').selectOption('b'); await page.locator('#receipt').fill('AURORA-001');
        await page.locator('[data-name]').fill('Servicio elegido'); await page.locator('[data-group-choice]').selectOption('servicio');
        await page.locator('[data-price]').fill('10');
        await pick('discount').click();
        assert.equal(await page.locator('#reward').inputValue(), 'discount');
        assert.equal(await page.locator('#checkoutBranch').inputValue(), 'b'); assert.equal(await page.locator('#receipt').inputValue(), 'AURORA-001');
        assert.equal(await page.locator('[data-name]').inputValue(), 'Servicio elegido');
        assert.equal(await page.locator('[name=verified]').isChecked(), false); assert.equal(await page.locator('[name=confirmed]').isChecked(), false);
        assert.equal(calls.filter(c => c.path !== '/api/staff/members/lookup').length, 0);
        assert.match(await page.locator('#purchaseRewardDetails').textContent(), /50%.*menor precio/);
        await page.locator('[name=verified]').check(); await page.locator('[name=confirmed]').check();
        await page.locator('#productPurchase > button').last().click(); await page.locator('#finishPurchase').waitFor();
        await pick('second').click();
        assert.equal(await page.locator('#finishPurchase').count(), 0);
        assert.equal(await page.locator('[name=verified]').isChecked(), false); assert.equal(await page.locator('[name=confirmed]').isChecked(), false);
        assert.match(await page.locator('#purchaseRewardDetails').textContent(), /20%/);
        checks.push('Quick choice preserves receipt, branch and products; new reward clears quote and consent');
        await page.locator('[name=verified]').check(); await page.locator('[name=confirmed]').check();
        await page.locator('#productPurchase > button').last().click(); await page.locator('#finishPurchase').waitFor();
        await page.locator('[data-price]').fill('11'); assert.equal(await page.locator('#finishPurchase').count(), 0);
        await page.locator('[data-price]').fill('10'); await page.locator('#productPurchase > button').last().click();
        await page.locator('#finishPurchase button').click();
        await page.waitForFunction(() => document.querySelector('#finishPurchase')?.getAttribute('aria-busy') === 'true');
        assert.equal(await pick('discount').isDisabled(), true); assert.equal(await page.locator('#reward').isDisabled(), true);
        await page.evaluate(() => document.querySelector('[data-select-counter-reward="discount"]').onclick());
        assert.equal(await page.locator('#reward').inputValue(), 'second');
        await waitPending(() => pendingPurchase);
        await pendingPurchase(); await page.locator('#finishPurchase .form-feedback:not([hidden])').waitFor();
        assert.equal(await page.locator('#receipt').inputValue(), 'AURORA-001');
        pendingPurchase = null; failPurchase = false;
        await page.locator('#finishPurchase button').click(); await waitPending(() => pendingPurchase);
        await pendingPurchase(); await page.locator('.counter-receipt').waitFor();
        const purchases = calls.filter(c => c.path === '/api/staff/purchases');
        assert.equal(purchases.length, 2); assert.ok(purchases[0].key); assert.equal(purchases[0].key, purchases[1].key);
        assert.deepEqual(purchases[0].payload, purchases[1].payload); assert.equal(purchases[1].payload.rewardId, 'second');
        assert.equal(purchases[1].payload.identityVerified, true); assert.equal(purchases[1].payload.customerConfirmed, true);
        assert.equal(await page.locator('.customer-counter').count(), 0);
        assert.match(await page.locator('.counter-receipt').textContent(), /ya estaba registrada|No lo entregues otra vez/);
        checks.push('Changed products clear review; saving blocks changes and retries reuse the same idempotency key');

        await lookup(); await page.locator('#moreCounterRewards').click(); await pick('direct').click();
        assert.equal(await page.locator('#rewardId').inputValue(), 'direct');
        assert.equal(await page.locator('#counterConfirm').count(), 0);
        await page.locator('#counterChoose button').click(); await page.locator('#counterConfirm').waitFor();
        await page.locator('#counterConfirm [name=identityVerified]').check(); await page.locator('#counterConfirm [name=customerConfirmed]').check();
        await page.locator('#counterBranch').selectOption('b'); assert.equal(await page.locator('#counterConfirm').count(), 0);
        await page.locator('#counterChoose button').click(); await page.locator('#counterConfirm').waitFor();
        await pick('direct2').click(); assert.equal(await page.locator('#counterConfirm').count(), 0);
        await page.locator('#counterChoose button').click(); await page.locator('#counterConfirm').waitFor();
        assert.equal(await page.locator('#counterConfirm [name=identityVerified]').isChecked(), false);
        await page.locator('#counterConfirm [name=identityVerified]').check(); await page.locator('#counterConfirm [name=customerConfirmed]').check();
        await page.locator('#counterConfirm button').click();
        await waitPending(() => pendingRedemption);
        assert.equal(await pick('direct').isDisabled(), true); await pendingRedemption(); await page.locator('.counter-receipt').waitFor();
        const canjes = calls.filter(c => c.path === '/api/staff/counter-redemptions');
        assert.equal(canjes.length, 1); assert.equal(canjes[0].payload.rewardId, 'direct2'); assert.equal(canjes[0].payload.branchId, 'b');
        checks.push('Direct redemption requires fresh review after either reward or branch changes');

        // A manual switch from the simple form retains existing receipt and branch.
        const simple = structuredClone(fixture); simple.programs.forEach(p => {p.config.productGroup = ''; p.config.countUnits = false;});
        await page.evaluate(data => {state.data = data; renderSales();}, simple);
        await page.locator('#value').fill('FAKE-CARD'); await page.locator('#lookup button').first().click(); await page.locator('#purchase').waitFor();
        await page.locator('#purchaseBranch').selectOption('b'); await page.locator('#receipt').fill('AURORA-002'); await page.locator('#amount').fill('12.25');
        await pick('discount').click(); await page.locator('#productPurchase').waitFor();
        assert.equal(await page.locator('#checkoutBranch').inputValue(), 'b'); assert.equal(await page.locator('#receipt').inputValue(), 'AURORA-002'); assert.equal(await page.locator('[data-price]').inputValue(), '12.25');
        checks.push('Conversion from simple purchase retains amount, branch and receipt');
        await page.locator('[data-name]').fill('Dos servicios'); await page.locator('[data-group-choice]').selectOption('servicio');
        await page.locator('[data-quantity]').fill('2');
        await page.locator('#productPurchase [name=program][value=points]').check();
        await page.locator('[name=verified]').check(); await page.locator('[name=confirmed]').check();
        const refreshDiscount=page.getByRole('button',{name:'Actualizar saldo y descuento'});
        const reviewProducts=page.locator('#productPurchase > button').last();
        conflictQuote=true; await reviewProducts.click(); await refreshDiscount.waitFor();
        assert.ok(await reviewProducts.isDisabled());
        failRefresh=true; await refreshDiscount.click();
        await page.getByText('Conexión interrumpida.',{exact:false}).waitFor();
        assert.equal(await page.locator('[data-price]').inputValue(),'12.25');
        refreshedMember=structuredClone(member); refreshedMember.member.revision++;
        await refreshDiscount.click(); await page.getByText('Saldo actualizado.',{exact:false}).waitFor();
        assert.equal(await page.locator('#reward').inputValue(),'discount');
        assert.equal(await page.locator('[name=verified]').isChecked(),false);assert.ok(await reviewProducts.isDisabled());
        assert.equal(await page.locator('#checkoutBranch').inputValue(),'b');
        assert.equal(await page.locator('#receipt').inputValue(),'AURORA-002');
        assert.equal(await page.locator('[data-name]').inputValue(),'Dos servicios');
        assert.equal(await page.locator('[data-quantity]').inputValue(),'2');
        assert.ok(await page.locator('#productPurchase [name=program][value=points]').isChecked());
        await page.locator('[name=verified]').check(); await page.locator('[name=confirmed]').check();
        await reviewProducts.click();await page.locator('#finishPurchase button').waitFor();
        assert.equal(calls.filter(c=>c.path.endsWith('/quote')).at(-1).payload.expectedRevision,refreshedMember.member.revision);
        conflictSave=true;await page.locator('#finishPurchase button').click();await refreshDiscount.waitFor();
        const writes=calls.filter(c=>c.path==='/api/staff/purchases').length;
        refreshedMember.balances.find(b=>b.programId==='service').available=0;refreshedMember.member.revision++;
        await refreshDiscount.click();await page.getByText('El premio anterior ya no está disponible.',{exact:false}).waitFor();
        assert.equal(await page.locator('#reward').inputValue(),'');assert.equal(await page.locator('#reward option[value=discount]').count(),0);
        assert.equal(await page.locator('[data-price]').inputValue(),'12.25');assert.equal(await page.locator('#finishPurchase').count(),0);
        assert.equal(calls.filter(c=>c.path==='/api/staff/purchases').length,writes);
        await page.locator('#changeCustomer').click();await page.locator('#keepOperationDraft').click();
        assert.equal(await page.locator('#receipt').inputValue(),'AURORA-002');
        refreshedMember=null;
        checks.push('Changed discounts refresh read-only at quote and save, retain the full draft, remove expired options and require new consent');
        await lookup();
        await page.evaluate(() => {clearTimeout(noticeTimer); document.querySelector('#notice').style.display = 'none';});
        if (evidence) {fs.mkdirSync(evidence, {recursive: true}); await page.screenshot({path: path.join(evidence, 'counter-rewards-desktop.png'), fullPage: true});}
        await page.setViewportSize({width: 390, height: 844});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.equal(await page.locator('.counter-reward-grid').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 1);
        if (evidence) await page.screenshot({path: path.join(evidence, 'counter-rewards-mobile.png'), fullPage: true});
        await page.setViewportSize({width: 320, height: 740});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        checks.push('Desktop plus 390/320px layouts, accessible progress and no JavaScript errors');
        console.log(JSON.stringify({status: 'COUNTER_REWARDS_UI_PASS', checks}, null, 2));
    } finally {await browser.close();}
}
run().catch(error => {console.error(error); process.exitCode = 1;});

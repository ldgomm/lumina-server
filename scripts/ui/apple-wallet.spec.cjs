// Isolated browser checks with fictitious data; never connects to a business database.
// npm ci --prefix scripts/ui && node scripts/ui/apple-wallet.spec.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const web = path.resolve(__dirname, '../../src/main/resources/web');
const evidence = process.env.LOYALTY_UI_EVIDENCE;
const initial = {displayName: 'Taller Aurora', background: '#204e41', foreground: '#ffffff', label: '#dbf38b', logoPng: null, featuredProgramId: 'stamps', stampSymbol: '★', welcome: 'Bienvenido al club', usage: 'Presenta tu tarjeta en caja.', birthdayMessage: '¡Feliz cumpleaños!'};
const fixture = {role: 'OWNER', business: {id: 'test', name: 'Taller Aurora', currency: 'USD', timezone: 'America/Guayaquil'}, branches: [],
    programs: [{id: 'stamps', config: {active: true, kind: 'STAMPS', name: 'Visitas al taller'}}, {id: 'cash', config: {active: true, kind: 'CASHBACK', name: 'Saldo de compras'}}, {id: 'paused', config: {active: false, kind: 'STAMPS', name: 'Promoción pausada'}}],
    rewards: [{id: 'r', programId: 'stamps', active: true, cost: 13, name: '35% en tu próximo servicio', benefitText: '35% de descuento en una unidad de «servicio», la de menor precio elegible.'}, {id: 'c', programId: 'cash', active: true, cost: 500, name: 'Descuento de 5 USD'}]};;
async function run() {
    const browser = await chromium.launch({headless: true, ...(process.env.LOYALTY_UI_CHROMIUM ? {executablePath: process.env.LOYALTY_UI_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']} : {})});
    const errors = [], saved = [], checks = [];
    try {
        let current = {...initial}, version = 3;
        const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
        page.on('pageerror', error => errors.push(error.message));
        await page.route('http://loyalty.test/**', async route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/api/staff/wallet-design') {
                if (route.request().method() === 'PUT') {
                    const value = route.request().postDataJSON(); saved.push(value); current = value.design; version++;
                }
                return route.fulfill({json: {design: current, version}});
            }
            if (url.pathname.startsWith('/api/')) throw new Error('Unexpected API: ' + url.pathname);
            if (url.pathname.startsWith('/wallet/art/')) {
                const folder = process.env.LOYALTY_ARTWORK_EVIDENCE;
                const file = folder && path.join(folder, url.pathname.slice(1) + '.' + (url.searchParams.get('layout') === 'apple' ? 'apple' : 'google') + '.png');
                return file && fs.existsSync(file) ? route.fulfill({body: fs.readFileSync(file), contentType: 'image/png'}) : route.fulfill({status: 404});
            }
            const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
            if (!/^[a-zA-Z0-9.-]+$/.test(name) || !fs.existsSync(path.join(web, name))) return route.fulfill({status: 404});
            let body = fs.readFileSync(path.join(web, name));
            if (name === 'index.html') body = body.toString().replace('</head>', '<script src="/engagement.js" defer></script><script src="/experience.js" defer></script></head>');
            return route.fulfill({body, headers: name === 'index.html' ? {'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"} : {}, contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'});
        });
        await page.goto('http://loyalty.test/');;
        await page.evaluate(data => { state.data = data; state.tab = 'design'; renderMerchant(); }, fixture);
        await page.locator('#walletDesign').waitFor();
        assert.equal(await page.locator('#previewWelcome').textContent(), '12 / 13');
        assert.equal(await page.locator('#previewStatus').textContent(), '1 sello');
        assert.equal((await page.locator('#previewStamps').textContent()).split('★').length - 1, 12);
        assert.equal(await page.locator('#featuredProgramId option[value=paused]').count(), 0);
        assert.match(await page.locator('#previewRewardConditions').textContent(), /35%.*menor precio/);;
        checks.push('Arbitrary 13-stamp goal, remaining stamp, custom symbol and paused exclusion');
        await page.locator('[data-wallet-example=ready]').click();
        assert.equal(await page.locator('#previewWelcome').textContent(), '13 sellos');
        assert.equal(await page.locator('#previewStatus').textContent(), 'Disponible');
        await page.locator('[data-wallet-example=new]').click();
        assert.equal(await page.locator('#previewWelcome').textContent(), '0 / 13');
        assert.equal(saved.length, 0);
        checks.push('Preview states never write balances or save the design');
        await page.locator('#featuredProgramId').selectOption('cash');
        await page.locator('[data-wallet-example=progress]').click();
        assert.equal(await page.locator('#previewWelcome').textContent(), '4.99 USD');
        assert.equal(await page.locator('#previewStatus').textContent(), '0.01 USD');
        assert.equal(await page.locator('#previewStamps').textContent(), '');
        checks.push('Cashback preview uses exact currency and separate program');
        await page.locator('[data-preview-provider=google]').click();
        assert.equal(await page.locator('#designPreview').isVisible(), false);
        assert.equal(await page.locator('#googleDesignPreview').isVisible(), true);
        assert.equal(await page.locator('#googlePreviewMain').textContent(), '4.99');
        assert.equal(await page.locator('#googlePreviewMainLabel').textContent(), 'USD');
        assert.equal(await page.locator('#googlePreviewStatus').textContent(), '0.01 USD');
        assert.match(await page.locator('#previewPlatformHint').textContent(), /lo decide Google/);
        await page.locator('#featuredProgramId').selectOption('stamps');
        assert.equal(await page.locator('#googlePreviewMain').textContent(), '12/13');
        await page.locator('[data-wallet-example=ready]').click();
        assert.equal(await page.locator('#googlePreviewMain').textContent(), '13');
        assert.equal(await page.locator('#googlePreviewStatus').textContent(), 'En caja');
        assert.match(await page.locator('#previewRewardDetail').textContent(), /le quedan 0 sellos/);
        assert.equal(saved.length, 0);
        await page.setViewportSize({width: 390, height: 844});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (evidence) { fs.mkdirSync(evidence, {recursive: true}); await page.screenshot({path: path.join(evidence, 'google-preview-mobile.png'), fullPage: true}); }
        await page.setViewportSize({width: 1440, height: 1100});
        await page.locator('[data-preview-provider=apple]').click();
        assert.equal(await page.locator('#previewWelcome').textContent(), '13 sellos');
        checks.push('Google native slots, provider switching, redemption forecast and mobile layout without mutations');

        await page.locator('#featuredProgramId').selectOption('stamps');
        await page.locator('#background').fill('#ffffff');
        assert.equal(await page.locator('#foreground').inputValue(), '#000000');
        assert.equal(await page.locator('#saveDesign').isEnabled(), true);
        await page.locator('#autoContrast').uncheck();
        await page.locator('#foreground').fill('#ffffff');
        assert.equal(await page.locator('#saveDesign').isEnabled(), false);
        await page.locator('#fixContrast').click();
        assert.equal(await page.locator('#saveDesign').isEnabled(), true);
        checks.push('Contrast correction stays actionable and preserves chosen background');
        // Detailed logo remains within the server limits while taking advantage of @3x.
        const data = await page.evaluate(() => {
            const c = document.createElement('canvas'); c.width = 480; c.height = 108;
            const ctx = c.getContext('2d'); ctx.fillStyle = '#204e41'; ctx.fillRect(0, 0, 480, 108);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 50px sans-serif'; ctx.fillText('AURORA', 20, 75);
            return c.toDataURL('image/png').split(',')[1];
        });
        await page.locator('#designLogo').setInputFiles({name: 'example-logo.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64')});
        await page.locator('#logoStatus').filter({hasText: 'mayor resolución'}).waitFor();
        await page.waitForFunction(() => document.querySelector('#previewLogo').naturalWidth > 0 && document.querySelector('#googlePreviewLogo').naturalWidth > 0);
        await page.locator('#displayName').fill('<img src=x onerror=alert(1)>');
        assert.equal(await page.locator('#previewName img').count(), 0);;
        await page.locator('#displayName').fill('Taller Aurora');
        await page.locator('#background').fill('#204e41');
        await page.locator('#foreground').fill('#ffffff');
        await page.locator('#label').fill('#dbf38b');
        if (evidence) { fs.mkdirSync(evidence, {recursive: true}); await page.screenshot({path: path.join(evidence, 'wallet-desktop.png'), fullPage: true}); }
        await page.setViewportSize({width: 390, height: 844});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (evidence) await page.screenshot({path: path.join(evidence, 'wallet-mobile.png'), fullPage: true});
        await page.locator('#saveDesign').click();
        await page.waitForFunction(() => document.querySelector('#logoStatus')?.textContent.includes('guardado'));
        assert.equal(saved.length, 1); assert.equal(saved[0].expectedVersion, 3);
        assert.equal(saved[0].design.featuredProgramId, 'stamps');
        assert.equal(saved[0].design.stampSymbol, '★');
        const logo = Buffer.from(saved[0].design.logoPng, 'base64');
        assert.ok(logo.length <= 20000); assert.equal(logo.readUInt32BE(16), 480); assert.equal(logo.readUInt32BE(20), 108);
        assert.ok(!Object.hasOwn(saved[0].design, 'example'));
        checks.push('Retina logo, escaped names, 390px layout and versioned design save');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({status: 'WALLET_PREVIEW_UI_PASS', checks}, null, 2));
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });

// Isolated, fictitious customer sessions. All network requests are intercepted.
// NODE_PATH=/path/to/node_modules node scripts/ui/wallet-save.spec.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const web = path.resolve(__dirname, '../../src/main/resources/com/premierdarkcoffee/loyalty/presentation/loyalty');
const evidence = process.env.LOYALTY_UI_EVIDENCE;
const android = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1';
async function run() {
    const browser = await chromium.launch({headless: true, ...(process.env.LOYALTY_UI_CHROMIUM ? {executablePath: process.env.LOYALTY_UI_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']} : {})});
    const checks = [], errors = [];
    try {
        let requests = [], pending = null, hold = false, failed = false, badLink = false, statusFailure = false;
        async function newPage(userAgent) {
            const page = await browser.newPage({viewport: {width: 390, height: 844}, userAgent});
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', async route => {
                const u = new URL(route.request().url());
                assert.equal(u.origin, 'http://loyalty.test', 'No live provider or service may be called');
                if (u.pathname === '/api/me') return route.fulfill({json: {member: {name: 'Ana Ejemplo'}, balances: []}});
                if (u.pathname === '/api/me/qr') return route.fulfill({body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxq0AAAAASUVORK5CYII=', 'base64'), contentType: 'image/png'});
                if (u.pathname === '/api/me/wallet-status') return route.fulfill(statusFailure ? {status: 503, json: {message: 'Unavailable'}} : {json: {apple: true, google: true}});
                if (/^\/api\/me\/wallet\/(apple|google)\/link$/.test(u.pathname)) {
                    requests.push(u.pathname);
                    const provider = u.pathname.split('/')[4];
                    const response = failed ? {status: 503, json: {code: 'WALLET_RETRY', message: 'No se pudo preparar Google Wallet.'}} : {json: {expiresIn: provider === 'apple' ? 120 : 300,
                        url: badLink ? 'https://pay.google.com.attacker.test/gp/v/save/a.b.c' : provider === 'apple' ? `http://loyalty.test/wallet/apple/download/${'A'.repeat(43)}` : 'https://pay.google.com/gp/v/save/a.b.c'}};
                    if (hold) { pending = () => route.fulfill(response); return; }
                    return route.fulfill(response);
                }
                if (u.pathname.startsWith('/api/')) throw new Error('Unexpected mutation: ' + u.pathname);
                const name = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
                if (!/^[a-zA-Z0-9.-]+$/.test(name) || !fs.existsSync(path.join(web, name))) return route.fulfill({status:404});
                let body = fs.readFileSync(path.join(web, name));
                if (name === 'index.html') body = body.toString().replace('</head>', '<script src="/wallet-ui.js" defer></script></head>');
                return route.fulfill({body, contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'});
            });
            await page.goto('http://loyalty.test/');
            await page.evaluate(async () => {state.token = 'fictitious-session'; state.business = {name:'Taller Aurora', currency:'USD'}; await customerCard();});
            return page;
        }
        const page = await newPage(android);
        assert.equal(await page.locator('[data-wallet-provider=google]').getAttribute('aria-pressed'), 'true');
        assert.equal(requests.length, 0);
        checks.push('Android defaults to Google; no pass preparation until requested');
        hold = true;
        await page.locator('#prepareWallet').click();
        await page.waitForFunction(() => document.querySelector('#prepareWallet').disabled);
        assert.equal(await page.locator('[data-wallet-provider=apple]').isEnabled(), false);
        await page.evaluate(() => document.querySelector('#prepareWallet').onclick());
        assert.equal(requests.length, 1);
        await pending(); hold = false;
        await page.locator('#walletLink a').waitFor();
        assert.equal(await page.locator('#walletLink a').textContent(), 'Abrir Google Wallet');
        assert.match(await page.locator('#walletLink').textContent(), /4:5\d|5:00/);
        assert.equal(await page.locator('[data-save-step="2"]').getAttribute('aria-current'), 'step');
        checks.push('Concurrent preparation and provider switching blocked; correct Google link and expiry');
        // Invoke the click handler without navigating to a live provider.
        await page.evaluate(() => document.querySelector('#walletLink a').onclick({preventDefault(){}}));
        assert.match(await page.locator('#walletFeedback').textContent(), /no confirma/);
        assert.equal(await page.locator('[data-save-step="3"]').getAttribute('aria-current'), 'step');
        checks.push('Opening a link never claims installation');
        if (evidence) {fs.mkdirSync(evidence,{recursive:true}); await page.screenshot({path:path.join(evidence,'save-google-mobile.png'),fullPage:true});}
        await page.evaluate(() => {const original = Date.now; Date.now = () => original() + 301000;});
        await page.locator('#walletFeedback').filter({hasText:'enlace venció'}).waitFor();
        assert.equal(await page.locator('#walletLink a').count(), 0);
        assert.equal(await page.locator('#prepareWallet').isEnabled(), true);
        checks.push('Expired links are removed and can be prepared again');
        await page.close();
        const ios = await newPage(iphone);
        assert.equal(await ios.locator('[data-wallet-provider=apple]').getAttribute('aria-pressed'), 'true');
        await ios.locator('#prepareWallet').click();
        await ios.locator('#walletLink a').waitFor();
        assert.match(await ios.locator('#walletLink').textContent(), /1:5\d|2:00/);
        await ios.locator('[data-wallet-provider=google]').click();
        assert.equal(await ios.locator('#walletLink a').count(), 0);
        checks.push('iPhone defaults to Apple with 120-second lifetime; provider change clears previous link');
        failed = true;
        await ios.locator('#prepareWallet').click();
        await ios.locator('#walletFeedback').filter({hasText:'Tu registro y tus saldos se conservan'}).waitFor();
        assert.equal(await ios.locator('#prepareWallet').isEnabled(), true);
        failed = false; badLink = true;
        await ios.locator('#prepareWallet').click();
        await ios.locator('#walletFeedback').filter({hasText:'verificar el enlace'}).waitFor();
        assert.equal(await ios.locator('#walletLink a').count(), 0);
        checks.push('Provider errors explain next action and untrusted URLs never become links');
        badLink = false; hold = true; pending = null;
        await ios.locator('#prepareWallet').click();
        await ios.waitForFunction(() => document.querySelector('#prepareWallet').disabled);
        await ios.evaluate(() => {state.token = 'different-session';});
        await pending(); hold = false;
        await ios.waitForTimeout(100);
        assert.equal(await ios.locator('#walletLink a').count(), 0);
        checks.push('Late responses cannot expose links to a different session');
        await ios.close();
        statusFailure = true;
        const retry = await newPage(android);
        await retry.locator('#retryWalletStatus').waitFor();
        statusFailure = false;
        await retry.locator('#retryWalletStatus').click();
        await retry.locator('#prepareWallet').waitFor();
        await retry.setViewportSize({width:320,height:720});
        assert.equal(await retry.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await retry.evaluate(() => localStorage.length), 0);
        checks.push('Status retry recovers without registration; 320px layout and no persistent credentials');
        await retry.close();
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({status:'WALLET_SAVE_UI_PASS',checks},null,2));
    } finally {await browser.close();}
}
run().catch(error => {console.error(error); process.exitCode = 1;});

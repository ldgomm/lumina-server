// Disposable fictional businesses and native responses; never uses real accounts or payments.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { agency, owner, portal } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
import { fakeLoyalty } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/loyalty-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const cleanup = [], t = { after: fn => cleanup.push(fn) }, output = process.env.LUMINA_UI_EVIDENCE;
const invoiceId = randomUUID(), paymentId = randomUUID(), secondId = randomUUID();
let browser;
try {
  const payment = { id: paymentId, invoiceId, amountMinor: 499, paidOn: '2026-11-13', method: 'TRANSFER', reference: 'TRANSFERENCIA-001', invoiceDescription: 'Contenido mensual · noviembre', reversed: false };
  const invoice = { id: invoiceId, description: payment.invoiceDescription, amountMinor: 5000, paidMinor: 499, remainingMinor: 4501, dueOn: '2026-11-30', status: 'PARTIAL' };
  let native;
  const account = (id, offset = 0) => ({
    business: { id, name: native.businesses.get(id)?.name }, today: '2026-11-14', offset,
    summary: { balanceMinor: 10001, overdueMinor: 5500, nextDueOn: '2026-11-30', invoiceCount: 2 },
    invoices: [invoice, { ...invoice, id: secondId, description: 'Identidad visual · trabajo acordado', amountMinor: 5500, paidMinor: 0, remainingMinor: 5500, dueOn: '2026-11-01', status: 'OVERDUE' }],
    payments: [payment], paymentCount: 1,
    membership: { branchMonthlyMinor: 998, nextChargeOn: '2027-01-01', plan: { name: 'Wallet mensual', feeMinor: 499, intervalMonths: 1, recurring: true, walletAgreement: { ownerName: 'Responsable de prueba' } } },
  });
  const receipt = id => ({ business: account(id).business, today: '2026-11-14', payment, invoice });
  native = await fakeLoyalty(t, null, {
    account: (company, url) => account(company.id, Number(url.searchParams.get('offset') || 0)),
    receipt: company => ({ body: receipt(company.id) }),
    administration: async call => {
      const [, , , , id, action] = call.path.split('/');
      if (call.method === 'GET') return { body: action === 'access' ? { state: 'ACTIVE', version: 1 } : action === 'payments' ? receipt(id) : account(id) };
      return { status: 503, body: { message: 'Prueba de interrupción: vuelve a comprobar este envío.' } };
    },
  });
  const world = await portal(t, native.origin, { platformToken: native.platformToken });
  const admin = await agency(world), company = await owner(world, 'Estudio Aurora · Café y pan artesanal', 1);
  const base = '/admin/businesses/' + company.id;
  browser = await chromium.launch({ headless: true, ...(process.env.LOYALTY_UI_CHROMIUM ? { executablePath: process.env.LOYALTY_UI_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}) });
  if (output) await mkdir(output, { recursive: true });
  const errors = [], contexts = [];
  for (const [role, session] of [['agency', admin], ['owner', company.client]]) {
    const context = await browser.newContext({ reducedMotion: 'reduce' }); contexts.push(context);
    await context.addCookies([{ name: 'lumina_session', value: session.cookie.split('=')[1], url: world.origin, httpOnly: true, sameSite: 'Strict' }]);
    await context.route('**/*', route => new URL(route.request().url()).origin === world.origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    const fit = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role}: overflow at ${page.url()}`);
    const accountPath = role === 'agency' ? base : '/billing';
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, path] of [...(role === 'agency' ? [['directory', '/businesses']] : []), ['overview', accountPath], ['invoices', accountPath + '?view=charges'], ['payments', accountPath + '?view=payments'], ['receipt', accountPath + '/payments/' + paymentId]]) {
        const response = await page.goto(world.origin + path); assert.equal(response.status(), 200); await fit();
        if (output && [390, 1440].includes(width)) await page.screenshot({ path: resolve(output, `${role}-${name}-${width}.png`), fullPage: true });
        if (role === 'owner') assert.equal(await page.locator('form[action*="/admin/"]').count(), 0);
      }
      if (role === 'agency') {
        await page.goto(world.origin + base + '?view=charges');
        await page.locator('.billing-action').first().locator('summary').click();
        await fit();
        assert.equal(await page.getByLabel('Importe recibido (USD)').first().inputValue(), '45.01');
        if (output && width === 390) await page.screenshot({ path: resolve(output, 'agency-payment-form-390.png'), fullPage: true });
        await page.locator('.control-state-editor summary').first().click();
        await page.locator('[name=state][value=CLOSED]').check();
        assert.equal(await page.locator('[name=state]:checked').count(), 1);
        assert.match(await page.locator('[data-state-effect=CLOSED]').innerText(), /próximos cargos/);
        await fit();
      }
    }
    if (role === 'agency') {
      await page.goto(world.origin + '/businesses');
      await page.getByLabel('Buscar negocio o contacto').fill('aurora'); await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      assert.equal(await page.locator('.business-directory-row').count(), 1);
      assert.equal(await page.getByRole('link', { name: 'Ver equipo', exact: true }).getAttribute('href'), '/teams?company=' + company.id);
      await page.goto(world.origin + base + '?view=charges');
      const form = page.locator('.billing-action').first().locator('form');
      await page.locator('.billing-action').first().locator('summary').click();
      const requestKey = await form.locator('[name=requestKey]').inputValue();
      await form.getByLabel('Referencia o comprobante').fill('BORRADOR-CONSERVADO');
      await form.getByLabel('Verifiqué que el pago fue recibido.').check();
      await form.getByRole('button', { name: 'Guardar pago', exact: true }).click();
      await page.getByRole('heading', { name: 'Revisa el pago enviado' }).waitFor();
      const retry = page.locator('form').filter({ has: page.getByRole('button', { name: 'Comprobar y guardar pago' }) });
      assert.equal(await retry.locator('[name=requestKey]').inputValue(), requestKey);
      assert.equal(await retry.getByLabel('Referencia o comprobante').inputValue(), 'BORRADOR-CONSERVADO');
      assert.equal(await retry.locator('[name=confirm]').isChecked(), false);
    }
    await page.goto(world.origin + accountPath + '/payments/' + paymentId);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.site-header').isVisible(), false);
    assert.equal(await page.locator('.payment-receipt').isVisible(), true);
    if (output) await page.screenshot({ path: resolve(output, `${role}-receipt-print.png`), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Descargar comprobante' }).click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), 'comprobante-' + paymentId + '.txt');
    assert.equal(await download.failure(), null);
  }
  // Native controls remain usable with scripts disabled.
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  await nojs.addCookies([{ name: 'lumina_session', value: admin.cookie.split('=')[1], url: world.origin, httpOnly: true, sameSite: 'Strict' }]);
  const page = await nojs.newPage(); await page.goto(world.origin + base + '?view=charges');
  await page.locator('.control-state-editor summary').first().click(); assert.equal(await page.locator('[data-state-effect]:visible').count(), 3);
  await page.locator('.billing-action').first().locator('summary').click(); assert.equal(await page.getByLabel('Importe recibido (USD)').first().isVisible(), true);
  assert.deepEqual(errors, []);
  if (output) await writeFile(resolve(output, 'result.json'), JSON.stringify({ status: 'PASS', widths: [320, 390, 1024, 1440], roles: ['agency', 'owner'], data: 'fictional', print: true, noJavaScript: true, retainedPaymentDraft: true }, null, 2));
  console.log('RESULTADO=LUMINA_BILLING_BROWSER_PASS');
} catch (error) {
  if (output) { await mkdir(output, { recursive: true }); await writeFile(resolve(output, 'error.txt'), String(error.stack || error)); }
  console.log('RESULTADO=LUMINA_BILLING_BROWSER_FAILED'); process.exitCode = 1;
} finally { if (browser) await browser.close(); for (const close of cleanup.reverse()) await close(); }

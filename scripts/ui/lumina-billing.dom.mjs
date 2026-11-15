// DOM behavior only. Rendering and physical Wallet delivery require separate evidence.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { page } from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/components.mjs';
import { controlPage } from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/business-control-pages.mjs';
import { receiptPage, accountPage } from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/billing-account-pages.mjs';
const { JSDOM, VirtualConsole } = createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const errors = [], windows = [], actor = { kind: 'AGENCY', csrf: 'fictional', name: 'Prueba' };
const company = { id: randomUUID(), name: 'Negocio ficticio', phone: '0990000000' }, invoiceId = randomUUID(), paymentId = randomUUID();
const account = { business: company, today: '2026-11-14', offset: 0, membership: null, summary: { balanceMinor: 4501, overdueMinor: 0, invoiceCount: 1 },
  invoices: [{ id: invoiceId, description: 'Servicio acordado', amountMinor: 5000, paidMinor: 499, remainingMinor: 4501, dueOn: '2026-11-30', status: 'PARTIAL' }],
  payments: [{ id: paymentId, invoiceId, reference: 'REC-1', paidOn: '2026-11-13', amountMinor: 499, method: 'CASH' }], paymentCount: 1 };
const base = '/admin/businesses/' + company.id;
function dom(body) {
  const vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
  const browser = new JSDOM(page({ actor, company, title: 'Prueba', body, path: base }).replace(/<script\b[^>]*src[^>]*><\/script>/g, ''), { runScripts: 'dangerously', url: 'http://127.0.0.1' + base, virtualConsole: vc });
  windows.push(browser.window); return browser.window;
}
const run = window => window.eval(readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/billing-workspace.js', import.meta.url), 'utf8'));
try {
  const window = dom(controlPage(actor, company, { state: 'ACTIVE', revision: 3 }, [], account, '', {}, { view: 'charges' })), d = window.document;
  // Before enhancement every consequence remains available to a no-script browser.
  assert.equal(d.querySelectorAll('[data-state-effect]:not([hidden])').length, 3);
  assert.equal(d.querySelectorAll('.control-state-editor form [name=confirm]:checked').length, 0);
  run(window);
  const stateForm = d.querySelector('.control-state-editor form');
  assert.equal(stateForm.querySelector('[name=state]:checked'), null);
  for (const value of ['CLOSED', 'PAUSED', 'SUSPENDED']) {
    stateForm.querySelector('[name=state][value='+value+']').click();
    assert.equal(stateForm.querySelectorAll('[name=state]:checked').length, 1);
    assert.equal(stateForm.querySelector('[name=state]:checked').value, value);
    assert.equal(stateForm.querySelector('[name=state]:checked').closest('label').querySelector('[data-state-effect]').dataset.stateEffect, value);
  }
  const payment = d.querySelector('form[action*="/payment?"]');
  assert.equal(payment.checkValidity(), false);
  payment.querySelector('[name=reference]').value = 'REG-1'; payment.querySelector('[name=confirm]').checked = true;
  assert.equal(payment.checkValidity(), true);
  payment.querySelector('[name=amount]').value = '4.999'; assert.equal(payment.checkValidity(), false);
  payment.querySelector('[name=amount]').value = '4.99'; assert.equal(payment.checkValidity(), true);
  const saved = { invoiceId, requestKey: randomUUID(), amount: '50', reference: 'REENVIAR', paidOn: '2026-11-14', method: 'TRANSFER' };
  const draft = dom(accountPage(actor, { ...account, invoices: [] }, base, 'Respuesta interrumpida', saved, { view: 'charges', action: 'payment' })).document;
  const retry = draft.querySelector('form[action*="/payment?"]');
  assert.equal(retry.querySelector('[name=requestKey]').value, saved.requestKey);
  assert.equal(retry.querySelector('[name=reference]').value, 'REENVIAR');
  assert.equal(retry.querySelector('[name=confirm]').checked, false);
  assert.equal(retry.querySelector('[name=amount]').max, '');
  let printed = 0;
  const receipt = dom(receiptPage({ kind: 'OWNER' }, { business: company, payment: account.payments[0], invoice: account.invoices[0], today: account.today }, '/billing'));
  receipt.print = () => { printed++; }; run(receipt);
  assert.equal(printed, 0); receipt.document.querySelector('[data-print-receipt]').click(); assert.equal(printed, 1);
  assert.equal(receipt.document.querySelector('form[action*="/reverse"]'), null);
  assert.ok(receipt.document.querySelector('a[href$="' + paymentId + '.txt"]'));
  assert.deepEqual(errors, []);
  console.log('LUMINA_BILLING_DOM_PASS: state consequences, native validation, retained retry, explicit print and owner controls');
} finally { for (const window of windows) window.close(); }

import { randomUUID } from 'node:crypto';
import { localDay } from '../../shared/domain.mjs';
import { badge, button, card, check, displayAmount, esc, form, hidden, input, localLink, number, select, table, textarea } from './components.mjs';

export const paymentMethods = Object.freeze({ TRANSFER: 'Transferencia', CASH: 'Efectivo', CARD: 'Tarjeta', OTHER: 'Otro' });
export const invoiceStates = Object.freeze({ OPEN: 'Pendiente', PARTIAL: 'Pago parcial', PAID: 'Pagado', OVERDUE: 'Vencido', VOID: 'Anulado' });
export const money = value => esc(displayAmount(value));
export const billingDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z')) : '—';
const invoiceStatus = row => badge(invoiceStates[row.status] || row.status, row.status === 'PAID' ? 'success' : row.status === 'OVERDUE' ? 'warning' : '');
const receiptPath = (base, id) => base + '/payments/' + id;
function navigation(base, view) {
  return `<nav class="account-tabs" aria-label="Cuenta del negocio">${[['overview', 'Resumen'], ['charges', 'Cargos'], ['payments', 'Pagos']].map(([key, name]) => `<a href="${esc(base + '?view=' + key)}"${view === key ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</nav>`;
}
function pagination(base, view, account, count) {
  const offset = account.offset || 0;
  const url = next => base + '?' + new URLSearchParams({ view: view, offset: next });
  return `<nav class="account-pagination" aria-label="Páginas de ${view}"><span>${count && offset < count ? `${offset + 1}–${Math.min(count, offset + 100)} de ${number(count)}` : 'Sin registros en esta página'}</span><div class="actions">${offset > 0 ? localLink(url(Math.max(0, offset - 100)), '← Anterior', 'btn secondary') : ''}${count > offset + 100 ? localLink(url(offset + 100), 'Siguiente →', 'btn secondary') : ''}</div></nav>`;
}
function paymentForm(actor, account, base, invoice, values = {}) {
  return form(base + '/payment?view=charges&offset=' + (account.offset || 0), actor,
    hidden('invoiceId', values.invoiceId || invoice?.id) + hidden('requestKey', values.requestKey || randomUUID()) +
    `<p><strong>${esc(invoice?.description || 'Pago enviado')}</strong>${invoice ? ' · Pendiente actual: ' + money(invoice.remainingMinor) : ''}</p><div class="fields two">` +
    input('amount', 'Importe recibido (USD)', 'number', 'required min="0.01" step="0.01"', values.amount ?? String((invoice?.remainingMinor || 0) / 100)) +
    select('method', 'Medio de pago', Object.entries(paymentMethods), values.method || 'TRANSFER', 'required') +
    input('paidOn', 'Fecha de pago', 'date', 'required max="' + esc(account.today) + '"', values.paidOn || account.today) +
    input('reference', 'Referencia o comprobante', 'text', 'required maxlength="100"', values.reference || '') + '</div>' +
    check('confirm', 'Verifiqué que el pago fue recibido.', false, true) + button(values.requestKey ? 'Comprobar y guardar pago' : 'Guardar pago'), 'billing-form');
}
export function billingDraft(actor, account, base, action, values) {
  if (actor.kind !== 'AGENCY' || !action) return '';
  const today = account?.today || localDay();
  if (action === 'payment') return card('Revisa el pago enviado', `<p>Conservamos este intento. Puedes comprobarlo de nuevo; el mismo envío no registra otro pago.</p>` + paymentForm(actor, account || { today }, base, account?.invoices.find(row => row.id === values.invoiceId), values));
  if (action === 'charge') return chargeForm(actor, { today }, base, values, true);
  if (action === 'reverse' || action === 'void') return card('Revisa la corrección', correctionForm(actor, base, action, values[action === 'reverse' ? 'paymentId' : 'invoiceId'], values));
  return '';
}
function correctionForm(actor, base, action, id, values = {}) {
  const reversing = action === 'reverse';
  return form(base + '/' + action + '?view=' + (reversing ? 'payments' : 'charges'), actor,
    hidden(reversing ? 'paymentId' : 'invoiceId', id) + hidden('requestKey', values.requestKey || randomUUID()) +
    textarea('reason', 'Motivo de la corrección', 'required minlength="5" maxlength="500" rows="3"', values.reason || '') +
    check('confirm', reversing ? 'Confirmo la corrección del registro. No efectúa una devolución bancaria.' : 'Confirmo la anulación. El historial se conserva.', false, true) +
    button(reversing ? 'Revertir registro' : 'Anular cargo', 'secondary'), 'billing-form');
}
function chargeForm(actor, account, base, values = {}, open = false) {
  return `<details class="card billing-charge"${open ? ' open' : ''}><summary>Registrar un cargo acordado</summary><p>Contenido, web, diseño u otro servicio ya aceptado por el negocio.</p>${form(base + '/charge?view=charges', actor,
    hidden('requestKey', values.requestKey || randomUUID()) + input('description', 'Concepto y referencia del acuerdo', 'text', 'required minlength="5" maxlength="200"', values.description || '') +
    '<div class="fields two">' + input('amount', 'Total acordado (USD)', 'number', 'required min="0.01" step="0.01"', values.amount || '') + input('dueOn', 'Vencimiento', 'date', 'required', values.dueOn || account.today) + '</div>' +
    check('confirm', 'Verifiqué el acuerdo y que este cargo no está registrado.', false, true) + button('Registrar cargo'), 'billing-form')}</details>`;
}
function subscriptionSummary(actor, account) {
  const membership = account.membership, plan = membership?.plan, agreement = plan?.walletAgreement;
  if (!plan) return card('Wallet', `<p>No hay una tarifa recurrente aceptada.</p>${actor.kind === 'OWNER' ? localLink('/plans/wallet', 'Ver opciones de Wallet', 'btn secondary') : ''}`);
  const total = membership.branchMonthlyMinor ?? plan.feeMinor;
  const interval = plan.intervalMonths === 12 ? 'año' : plan.intervalMonths === 1 ? 'mes' : `${plan.intervalMonths} meses`;
  const free = agreement && account.today < '2027-01-01' && membership.nextChargeOn >= '2027-01-01';
  return card(plan.name, `${free ? '<p class="subscription-free">Gratis hasta el <strong>31 de diciembre de 2026</strong></p>' : ''}
    <p class="muted">${!plan.recurring ? 'Última tarifa acordada' : free ? 'Después de la promoción' : 'Tarifa para el próximo corte'}</p><p class="billing-plan-price"><strong>${money(total)}</strong> / ${interval}${agreement ? ' en total' : ''}</p>
    <p>${agreement ? money(plan.feeMinor) + ' por sucursal · ' : ''}${plan.recurring ? 'Próximo cargo: <strong>' + esc(billingDate(membership.nextChargeOn)) + '</strong>' : '<strong>Renovación desactivada</strong>'}</p>
    ${!plan.recurring && plan.walletEndsOn ? `<p>La suscripción finaliza el ${esc(billingDate(plan.walletEndsOn))}.</p>` : ''}
    ${agreement ? `<p class="muted">Aceptado por ${esc(agreement.ownerName)}. Las nuevas sucursales se suman desde el siguiente corte.</p>` : ''}
    ${actor.kind === 'OWNER' ? localLink('/plans/wallet', 'Ver acuerdo y renovación', 'btn secondary') : ''}`);
}
export function accountPage(actor, account, base = '/billing', error = '', values = {}, options = {}) {
  const admin = actor.kind === 'AGENCY', summary = account.summary;
  const view = options.view || 'overview', action = options.action || '';
  const stats = `<section class="stat-grid billing-stats" aria-label="Saldo de la cuenta"><a class="stat" href="${esc(base + '?view=charges')}"><span>Pendiente de pago</span><strong>${money(summary.balanceMinor)}</strong></a><div class="stat"><span>Saldo vencido</span><strong>${money(summary.overdueMinor)}</strong></div><div class="stat"><span>Próximo vencimiento pendiente</span><strong class="billing-stat-date">${esc(billingDate(summary.nextDueOn))}</strong></div></section>`;
  let content;
  if (view === 'charges') content = `<section class="card"><div class="split"><h2>Cargos del negocio</h2><span class="muted">${number(summary.invoiceCount)} en total</span></div><div class="billing-records">${account.invoices.map(row => `<article class="billing-record"><div class="split"><div><h3>${esc(row.description)}</h3><p>${row.periodStart ? esc(billingDate(row.periodStart) + ' → ' + billingDate(row.periodEnd)) : 'Cargo individual'} · Vence ${esc(billingDate(row.dueOn))}</p></div>${invoiceStatus(row)}</div><dl class="billing-amounts"><div><dt>Total</dt><dd>${money(row.amountMinor)}</dd></div><div><dt>Pagado</dt><dd>${money(row.paidMinor)}</dd></div><div><dt>Pendiente</dt><dd>${money(row.remainingMinor)}</dd></div></dl>${row.status === 'VOID' ? `<p class="muted">${esc(row.voidReason || 'Cargo anulado')}</p>` : ''}
      ${admin && row.remainingMinor > 0 ? `<details class="billing-action"><summary>Registrar pago</summary>${paymentForm(actor, account, base, row)}</details>` : ''}
      ${admin && row.paidMinor === 0 && row.status !== 'VOID' ? `<details class="billing-action secondary-action"><summary>Anular cargo</summary>${correctionForm(actor, base, 'void', row.id)}</details>` : ''}</article>`).join('') || '<div class="empty">Todavía no hay cargos en esta página.</div>'}</div>${pagination(base, view, account, summary.invoiceCount)}</section>${admin && action !== 'charge' ? chargeForm(actor, account, base) : ''}`;
  else if (view === 'payments') content = card('Pagos registrados', table(['Fecha', 'Referencia / concepto', 'Medio', 'Importe', 'Estado', 'Comprobante'], account.payments.map(row => [esc(billingDate(row.paidOn)), `<strong>${esc(row.reference)}</strong>${row.invoiceDescription ? '<br><small>' + esc(row.invoiceDescription) + '</small>' : ''}`, esc(paymentMethods[row.method] || row.method), money(row.amountMinor), badge(row.reversed ? 'Revertido' : 'Confirmado', row.reversed ? 'warning' : 'success'), localLink(receiptPath(base, row.id), 'Ver comprobante')]), 'Los pagos confirmados por Lúmina aparecerán aquí.') + pagination(base, view, account, account.paymentCount));
  else content = `<div class="billing-overview-grid">${subscriptionSummary(actor, account)}${card(summary.balanceMinor > 0 ? (admin ? 'Cuenta con saldo pendiente' : 'Tu cuenta tiene un saldo pendiente') : (admin ? 'Cuenta al día' : 'Tu cuenta está al día'), `<p>${summary.balanceMinor > 0 ? 'Pendiente: <strong>' + money(summary.balanceMinor) + '</strong>.' : (admin ? 'El negocio no tiene cargos pendientes de pago.' : 'No tienes cargos pendientes de pago.')}</p>${summary.overdueMinor > 0 ? '<p class="billing-warning">Hay pagos vencidos. Revisa los cargos o contacta a Lúmina.</p>' : ''}<div class="actions">${localLink(base + '?view=charges', admin ? 'Revisar y registrar pagos' : 'Ver mis cargos', 'btn')}${admin ? '' : localLink('/help', 'Contactar a Lúmina', 'btn secondary')}</div>`)}</div>
    ${card('Últimos pagos', account.payments.length ? `<div class="billing-recent">${account.payments.slice(0, 3).map(row => `<a href="${esc(receiptPath(base, row.id))}"><span><strong>${esc(row.reference)}</strong><small>${esc(billingDate(row.paidOn))} · ${row.reversed ? 'Revertido' : 'Confirmado'}</small></span><strong>${money(row.amountMinor)}</strong><span aria-hidden="true">→</span></a>`).join('')}</div>${localLink(base + '?view=payments', 'Ver todos los pagos')}` : '<p>Los pagos confirmados por Lúmina aparecerán aquí.</p>')}`;
  return `<div class="billing-workspace">${error ? `<p role="alert" class="notice">${esc(error)}</p>` : ''}${navigation(base, view)}${stats}${options.action ? billingDraft(actor, account, base, action, values) : ''}${content}<p class="billing-footnote">Cuenta en USD. Registrar un pago no realiza un débito bancario ni sustituye la factura tributaria.</p></div>`;
}
export function receiptPage(actor, receipt, base, provider = null) {
  const p = receipt.payment, invoice = receipt.invoice;
  return `<div class="billing-workspace"><div class="actions">${localLink(base + '?view=payments', '← Volver a pagos', 'btn secondary')}${localLink(receiptPath(base, p.id) + '.txt', 'Descargar comprobante', 'btn')}<button type="button" class="secondary" data-print-receipt>Imprimir</button></div>
    <article class="card payment-receipt"><div class="split"><div><p class="eyebrow">LÚMINA DIGITAL</p><h2>Comprobante de pago</h2></div>${badge(p.reversed ? 'Registro revertido' : 'Pago confirmado', p.reversed ? 'warning' : 'success')}</div>
    <p class="receipt-business">${esc(receipt.business.name)}</p><p class="receipt-total">${money(p.amountMinor)}</p>
    <dl class="receipt-details">${[['Referencia', p.reference], ['Fecha de pago', billingDate(p.paidOn)], ['Medio de pago', paymentMethods[p.method] || p.method], ['Concepto', invoice.description], ['Identificador del registro', p.id]].map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    ${p.reversed ? `<p class="notice"><strong>Este registro fue revertido.</strong> ${esc(p.reversalReason)}. No representa un pago vigente.</p>` : ''}
    <div class="receipt-balance"><span>Saldo actual del cargo</span><strong>${money(invoice.remainingMinor)}</strong><small>${invoiceStatus(invoice)} · Consultado el ${esc(billingDate(receipt.today))}</small></div>
    ${provider ? `<p>${esc(provider.legalName)} · RUC ${esc(provider.ruc)}<br>${esc(provider.email)} · ${esc(provider.phone)}</p>` : ''}
    <p class="billing-footnote">Comprobante interno de un pago registrado por Lúmina. No sustituye la factura tributaria ni confirma una operación bancaria.</p></article>
    ${actor.kind === 'AGENCY' && !p.reversed ? `<details class="card"><summary>Corregir este registro</summary>${correctionForm(actor, base, 'reverse', p.id)}</details>` : ''}</div>`;
}
export function receiptText(receipt, provider = null) {
  const p = receipt.payment, invoice = receipt.invoice;
  const plain = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ');
  return ['LÚMINA DIGITAL · COMPROBANTE DE PAGO', p.reversed ? 'ESTADO: REVERTIDO — no representa un pago vigente' : 'ESTADO: CONFIRMADO',
    'Negocio: ' + plain(receipt.business.name), 'Identificador: ' + plain(p.id), 'Referencia: ' + plain(p.reference),
    'Fecha del pago: ' + p.paidOn, 'Medio: ' + plain(paymentMethods[p.method] || p.method), 'Importe: USD ' + (p.amountMinor / 100).toFixed(2),
    'Concepto: ' + plain(invoice.description), 'Saldo actual del cargo: USD ' + (invoice.remainingMinor / 100).toFixed(2), 'Consultado: ' + receipt.today,
    ...(p.reversed ? ['Motivo de reversión: ' + plain(p.reversalReason)] : []),
    ...(provider ? ['Proveedor: ' + plain(provider.legalName), 'RUC: ' + plain(provider.ruc), 'Contacto: ' + plain(provider.email) + ' · ' + plain(provider.phone)] : []),
    'Comprobante interno. No sustituye la factura tributaria ni confirma una operación bancaria.', ''].join('\n');
}

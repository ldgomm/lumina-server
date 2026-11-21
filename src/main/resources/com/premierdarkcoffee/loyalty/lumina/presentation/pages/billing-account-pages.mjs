import { walletDues } from '../../memberships/wallet-balance.mjs';
import { contractSummary } from './contract-summary.mjs';
import { randomUUID } from 'node:crypto';
import { inclusiveEnd } from '../../memberships/orders.mjs';
import { inTrial, paidFrom, walletLine } from '../../memberships/trial.mjs';
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
export function paymentForm(actor, account, base, invoice, values = {}, view = 'charges') {
  const walletView = view === 'wallet';
  return form(base + '/payment?view=' + view + '&offset=' + (account.offset || 0), actor,
    (values.walletCut==='yes'?hidden('walletCut','yes'):'') + hidden('invoiceId', values.invoiceId || invoice?.id) + hidden('requestKey', values.requestKey || randomUUID()) +
    (walletView ? '' : `<p><strong>${esc(values.walletCut==='yes'?'Todos los cargos de Wallet con este vencimiento':invoice?.description || 'Pago enviado')}</strong>${invoice ? ' · Pendiente actual: ' + money(values.walletCut==='yes'?invoice.walletCutMinor:invoice.remainingMinor) : ''}</p>`) + '<div class="fields two">' +
    input('amount', walletView ? 'Pago completo de Wallet (USD)' : 'Importe recibido (USD)', 'number',
      'required min="0.01" step="0.01"' + (walletView ? ' readonly' : ''), values.amount ?? (((values.walletCut==='yes'?invoice?.walletCutMinor:invoice?.remainingMinor) || 0) / 100).toFixed(2)) +
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
function agencySubscriptionSummary(account, base) {
  const membership=account.membership,saved=membership?.plan;
  const signed=saved?.walletAgreement?.activationOn||saved?.startedOn;
  const plan=signed&&signed<'2027-01-01'?null:saved,agreement=plan?.walletAgreement;
  const state=account.access?.walletSubscriptionState;
  if(account.today<'2027-01-01' || state==='INACTIVE')return card('Wallet',account.today<'2027-01-01'?
    '<p><strong>Prueba gratuita hasta el 31 de diciembre de 2026.</strong> El dueño podrá elegir un plan desde enero. Importe de Wallet durante la prueba: $0,00.</p>'+(state==='TRIAL'?'<p>Prueba activa.</p>':state==='INACTIVE'?'<p>Prueba desactivada.</p>':''):
    '<p>Sin suscripción activa. El dueño puede elegir mensual o anual cuando quiera volver.</p>');
  if (!plan) return card('Wallet', `${account.nextWalletChargeOn?'<p>Próximo cargo de Wallet el <strong>'+esc(billingDate(account.nextWalletChargeOn))+'</strong>.</p>':localLink(base+'?view=wallet','Ver el estado de Wallet')}`);
  const total = membership.branchMonthlyMinor ?? plan.feeMinor;
  const branches=agreement&&plan.feeMinor>0&&Number.isSafeInteger(total/plan.feeMinor)?total/plan.feeMinor:null;
  const interval = plan.intervalMonths === 12 ? 'año' : plan.intervalMonths === 1 ? 'mes' : `${plan.intervalMonths} meses`;
  return card(plan.name, `<p class="muted">${plan.recurring?'Tarifa para el próximo corte':'Última tarifa acordada'}</p><p class="billing-plan-price"><strong>${money(total)}</strong> / ${interval}${agreement ? ' en total' : ''}</p>
    ${branches!==null?`<p class="billing-branch-calculation"><strong>${branches} ${branches===1?'sucursal':'sucursales'}</strong> × ${money(plan.feeMinor)} = <strong>${money(total)} / ${interval}</strong></p>`:''}
    <p>${agreement ? money(plan.feeMinor) + ' por sucursal · ' : ''}${plan.recurring ? 'Próximo cargo: <strong>' + esc(billingDate(membership.nextChargeOn)) + '</strong>' : '<strong>Renovación desactivada</strong>'}</p>
    ${!plan.recurring && plan.walletEndsOn ? `<p>La suscripción finaliza el ${esc(billingDate(inclusiveEnd(plan.walletEndsOn)))}.</p>` : ''}
    ${agreement ? `<p class="muted">Aceptado por ${esc(agreement.ownerName)}. Las nuevas sucursales se suman desde el siguiente corte.</p>` : ''}`);
}
function walletPayment(account) {
  const {today,cut,overdueMinor:overdue,hasOverdue,suspendedForDebt,restricted}=walletDues(account);
  const suspended=suspendedForDebt || restricted;
  if ((!cut || cut.remainingMinor <= 0) && !hasOverdue && !suspended) {
    const message = account.walletBilling?.balanceMinor === 0 ? 'Wallet no tiene pagos pendientes.' : 'Revisa los cargos registrados del negocio para consultar tu pago.';
    return `<section class="card owner-wallet-paid" id="pago-wallet" tabindex="-1"><h2>Pagos de Wallet</h2><p>${message}</p></section>`;
  }
  const recorded = cut?.remainingMinor > 0;
  const title = recorded || hasOverdue ? 'Pago pendiente de Wallet' : 'Revisa el acceso a Wallet';
  const multipleOverdue=overdue>0 && (!recorded || overdue!==cut.remainingMinor);
  const deadline = recorded && cut.dueOn ? `<p>${cut.dueOn < today ? 'Venció el' : cut.dueOn === today ? 'Vence hoy,' : 'Pagar hasta el'} <strong>${esc(billingDate(cut.dueOn))}</strong>.</p>` : '';
  let suspension = '';
  if (suspended) {
    suspension = suspendedForDebt
      ? '<p>Las tarjetas están suspendidas hasta que Lúmina registre los pagos vencidos de Wallet.</p>'
      : '<p>El acceso a Wallet está suspendido. Consulta con Lúmina qué registro necesita revisión.</p>';
  }
  return `<section class="card owner-balance${overdue > 0 || suspended ? ' attention' : ''}" id="pago-wallet" tabindex="-1"><h2>${title}</h2>
    ${multipleOverdue ? `<p class="owner-balance-total"><span>${suspendedForDebt?'Saldo vencido para reactivar Wallet':'Saldo vencido de Wallet'}</span><strong>${money(overdue)}</strong></p>` : ''}
    ${recorded ? `<p class="${multipleOverdue?'owner-balance-cut':'owner-balance-total'}"><span>${multipleOverdue?'Del vencimiento más antiguo':'Importe para este vencimiento'}</span> <strong>${money(cut.remainingMinor)}</strong></p>` : ''}${deadline}${suspension}
    ${localLink('/help?topic=payment', 'Consultar mi pago', 'btn secondary')}</section>`;
}
function ownerBalance(account, base, view) {
  const {balanceMinor, overdueMinor, nextDueOn} = account.summary;
  const wallet=walletDues(account);
  const suspended = view === 'overview' && (wallet.suspendedForDebt || wallet.restricted);
  const walletOverdue = wallet.overdueMinor;
  if (!balanceMinor && !suspended) {
    return view === 'overview' ? card('Tu cuenta está al día', '<p>No tienes pagos pendientes.</p>') : '';
  }
  let title = overdueMinor > 0 ? 'Tienes un saldo vencido' : 'Tienes un pago pendiente', detail = '';
  if (suspended) {
    title = wallet.suspendedForDebt ? 'Wallet suspendida por pago pendiente' : 'Revisa el acceso a Wallet';
    detail = wallet.suspendedForDebt && walletOverdue > 0 ? `<p>Saldo vencido de Wallet: <strong>${money(walletOverdue)}</strong>.</p>` : '<p>El acceso a Wallet está suspendido. Consulta el detalle o contacta a Lúmina.</p>';
  } else if (overdueMinor > 0) {
    detail = `<p>El importe vencido es <strong>${money(overdueMinor)}</strong>.</p>`;
  } else if (nextDueOn) {
    detail = `<p>${nextDueOn === account.today ? 'El primer cargo pendiente vence hoy' : 'El primer cargo pendiente vence el ' + esc(billingDate(nextDueOn))}.</p>`;
  }
  let action = view === 'overview' ? localLink(base + '?view=charges' + (suspended ? '#pago-wallet' : ''), suspended ? 'Revisar Wallet' : 'Ver mis cargos', 'btn') : '';
  if (view === 'charges' && !wallet.cut && !wallet.suspendedForDebt && !wallet.restricted) action = localLink('/help?topic=payment', 'Consultar mi pago', 'btn secondary');
  return `<section class="card owner-balance${suspended || overdueMinor > 0 ? ' attention' : ''}"><h2>${title}</h2>${balanceMinor > 0 ? `<p class="owner-balance-total"><span>Saldo pendiente del negocio</span><strong>${money(balanceMinor)}</strong></p>` : ''}${detail}${action}</section>`;
}
function ownerWallet(account, options) {
  const today = account.today, membership = account.membership, plan = membership?.plan;
  const action = (text, path = '/plans/wallet') => localLink(path, text);
  if (inTrial(today)) {
    const enabled = options.trial?.enabled ?? (account.access?.walletSubscriptionState === 'TRIAL');
    return card('Wallet', `<p><strong>Prueba gratuita hasta el 31 de diciembre de 2026.</strong></p><p>${enabled ? 'Tu prueba está activa.' : 'Puedes activarla cuando quieras.'} Desde el 1 de enero tú decides si contratas un plan.</p>${action(enabled ? 'Gestionar mi prueba' : 'Ver la prueba gratuita')}`);
  }
  const walletContracts = (options.contracts || []).filter(c => !c.cancelled_at && (c.consent_on || c.accepted_on || '') >= paidFrom && walletLine(c));
  const current = walletContracts.find(c => c.starts_on <= today && today < c.ends_before);
  const next = walletContracts.filter(c => c.starts_on > today).sort((a,b) => a.starts_on.localeCompare(b.starts_on))[0];
  const nextCharge = Object.hasOwn(account, 'nextWalletChargeOn') ? account.nextWalletChargeOn : membership?.nextChargeOn;
  const chargeDate = nextCharge ? `<p>Próximo cargo de Wallet el <strong>${esc(billingDate(nextCharge))}</strong>.</p>` : '';
  if (current || next) {
    let service = current ? `<p>Tu plan: <strong>${esc(current.name)}</strong>.</p>` : '';
    if (next) service += `<p><strong>${esc(next.name)}</strong> comienza el ${esc(billingDate(next.starts_on))}.</p>`;
    else if (current.stop_on) service += `<p>La renovación está desactivada. Puedes usar tu plan hasta el ${esc(billingDate(inclusiveEnd(current.stop_on)))}.</p>`;
    return card('Mi suscripción de Wallet', service + chargeDate + action('Gestionar mi suscripción'));
  }
  const legacy = plan?.walletAgreement;
  if (legacy?.activationOn >= paidFrom && (plan.recurring || plan.walletEndsOn > today)) {
    const total = membership.branchMonthlyMinor ?? plan.feeMinor;
    const branches = plan.feeMinor > 0 && Number.isSafeInteger(total / plan.feeMinor) ? total / plan.feeMinor : null;
    const interval = plan.intervalMonths === 12 ? 'año' : plan.intervalMonths === 1 ? 'mes' : `${plan.intervalMonths} meses`;
    const calculation = branches ? `<p>${number(branches)} ${branches === 1 ? 'sucursal' : 'sucursales'} × ${money(plan.feeMinor)} = <strong>${money(total)} / ${interval}</strong></p>` : '';
    const ends = !plan.recurring && plan.walletEndsOn ? `<p>Tu plan termina el ${esc(billingDate(inclusiveEnd(plan.walletEndsOn)))}.</p>` : '';
    return card('Mi suscripción de Wallet', `<p>${esc(plan.name)}</p>${calculation}${ends}${chargeDate}${action('Gestionar mi acuerdo', '/plans/wallet/legacy')}`);
  }
  if (account.access?.walletSubscriptionState === 'ACTIVE') {
    return card('Mi suscripción de Wallet', '<p>Tu negocio tiene cobertura de Wallet.</p>' + chargeDate + action('Ver mi suscripción'));
  }
  return card('Wallet', '<p>Tu negocio puede activar un plan mensual o anual cuando lo necesite.</p>' + chargeDate + action('Ver opciones de Wallet'));
}
function ownerCharges(account, base) {
  const outstanding = row => row.remainingMinor > 0 && row.status !== 'VOID';
  const invoices = [...account.invoices].sort((a,b) =>
    Number(outstanding(b)) - Number(outstanding(a)) || (outstanding(a) ? a.dueOn.localeCompare(b.dueOn) : 0));
  const rows = invoices.map(row => {
    const period = row.periodStart && row.periodEnd ? `<p>Período del ${esc(billingDate(row.periodStart))} al ${esc(billingDate(inclusiveEnd(row.periodEnd)))}.</p>` : '';
    return `<article class="billing-record owner-invoice"><div class="split"><div><h3>${esc(row.description)}</h3><p>${row.walletDue ? 'Wallet · ' : ''}${row.status === 'OVERDUE' ? 'Venció el ' : outstanding(row) ? 'Pagar hasta el ' : 'Fecha de vencimiento: '}${esc(billingDate(row.dueOn))}</p></div>${invoiceStatus(row)}</div>
      <p class="owner-invoice-amount">${outstanding(row) ? 'Por pagar' : 'Importe del cargo'} <strong>${money(outstanding(row) ? row.remainingMinor : row.amountMinor)}</strong></p>
      <details class="billing-action"><summary>Ver detalle del cargo</summary>${period}<dl class="billing-amounts"><div><dt>Total</dt><dd>${money(row.amountMinor)}</dd></div><div><dt>Pagado</dt><dd>${money(row.paidMinor)}</dd></div><div><dt>Pendiente</dt><dd>${money(row.remainingMinor)}</dd></div></dl>${row.status === 'VOID' ? `<p>${esc(row.voidReason || 'Cargo anulado')}</p>` : ''}</details></article>`;
  }).join('');
  return card('Cargos del negocio', (rows || '<p>Todavía no hay cargos en esta página.</p>') + (account.summary.invoiceCount > 100 || account.offset ? pagination(base, 'charges', account, account.summary.invoiceCount) : ''));
}
function ownerPayments(payments, base) {
  return `<div class="billing-recent owner-payments">${payments.map(row =>
    `<a href="${esc(receiptPath(base, row.id))}"><span><strong>${esc(row.reference)}</strong><small>${esc(billingDate(row.paidOn))} · ${esc(paymentMethods[row.method] || row.method)} · ${row.reversed ? 'Revertido' : 'Confirmado'}</small>${row.invoiceDescription ? `<small>${esc(row.invoiceDescription)}</small>` : ''}</span><span><strong>${money(row.amountMinor)}</strong><small>Ver comprobante</small></span></a>`
  ).join('')}</div>`;
}
function ownerAccount(account, base, error, options) {
  const view = options.view || 'overview';
  const contracts = options.contracts || [];
  let content;
  if (view === 'charges') {
    const alsoShowBalance = account.summary.balanceMinor > (account.walletBilling?.nextCut?.remainingMinor || 0);
    content = walletPayment(account) + (alsoShowBalance ? ownerBalance(account, base, view) : '') + ownerCharges(account, base);
  } else if (view === 'payments') {
    const payments = account.payments.length ? ownerPayments(account.payments, base) : '<p>Cuando Lúmina registre un pago, podrás abrir su comprobante aquí.</p>';
    content = card('Pagos registrados', payments + (account.paymentCount > 100 || account.offset ? pagination(base, view, account, account.paymentCount) : ''));
  } else {
    content = `<div class="billing-overview-grid">${ownerBalance(account, base, view)}${ownerWallet(account, options)}</div>`;
    if (account.payments.length) content += card('Últimos pagos', ownerPayments(account.payments.slice(0, 3), base) + localLink(base + '?view=payments', 'Ver todos los pagos'));
    if (contracts.length) content += contractSummary(contracts, account.today, true, {omitEmpty:true});
  }
  return `<div class="billing-workspace owner-account">${error ? `<p role="alert" class="notice">${esc(error)}</p>` : ''}${navigation(base, view)}${content}<p class="billing-footnote">Los cargos en USD se registran en tu cuenta y no se debitan de una tarjeta bancaria. Lúmina confirma los pagos recibidos.</p></div>`;
}
export function accountPage(actor, account, base = '/billing', error = '', values = {}, options = {}) {
  if (actor.kind !== 'AGENCY') return ownerAccount(account, base, error, options);
  const summary = account.summary;
  const view = options.view || 'overview', action = options.action || '';
  const stats = `<section class="stat-grid billing-stats" aria-label="Saldo de la cuenta"><a class="stat" href="${esc(base + '?view=charges')}"><span>Pendiente de pago</span><strong>${money(summary.balanceMinor)}</strong></a><div class="stat"><span>Saldo vencido</span><strong>${money(summary.overdueMinor)}</strong></div><div class="stat"><span>Próximo vencimiento pendiente</span><strong class="billing-stat-date">${esc(billingDate(summary.nextDueOn))}</strong></div></section>`;
  let content;
  if (view === 'charges') content = `<section class="card"><div class="split"><h2>Cargos del negocio</h2><span class="muted">${number(summary.invoiceCount)} en total</span></div><div class="billing-records">${account.invoices.map(row => `<article class="billing-record"><div class="split"><div><h3>${esc(row.description)}</h3><p>${row.periodStart && row.periodEnd ? esc(billingDate(row.periodStart) + ' → ' + billingDate(inclusiveEnd(row.periodEnd))) : 'Cargo individual'} · Vence ${esc(billingDate(row.dueOn))}</p></div>${invoiceStatus(row)}</div><dl class="billing-amounts"><div><dt>Total</dt><dd>${money(row.amountMinor)}</dd></div><div><dt>Pagado</dt><dd>${money(row.paidMinor)}</dd></div><div><dt>Pendiente</dt><dd>${money(row.remainingMinor)}</dd></div></dl>${row.status === 'VOID' ? `<p class="muted">${esc(row.voidReason || 'Cargo anulado')}</p>` : ''}
      ${row.remainingMinor > 0 ? `<details class="billing-action"><summary>Registrar pago</summary>${paymentForm(actor, account, base, row)}</details>` : ''}
      ${row.walletDue && row.remainingMinor>0 && row.walletCutMinor>row.remainingMinor ? `<details class="billing-action"><summary>Registrar todo el corte de Wallet · ${money(row.walletCutMinor)}</summary>${paymentForm(actor,account,base,row,{walletCut:'yes'})}</details>` : ''}
      ${row.paidMinor === 0 && row.status !== 'VOID' ? `<details class="billing-action secondary-action"><summary>Anular cargo</summary>${correctionForm(actor, base, 'void', row.id)}</details>` : ''}</article>`).join('') || '<div class="empty">Todavía no hay cargos en esta página.</div>'}</div>${pagination(base, view, account, summary.invoiceCount)}</section>${action !== 'charge' ? chargeForm(actor, account, base) : ''}`;
  else if (view === 'payments') content = card('Pagos registrados', table(['Fecha', 'Referencia / concepto', 'Medio', 'Importe', 'Estado', 'Comprobante'], account.payments.map(row => [esc(billingDate(row.paidOn)), `<strong>${esc(row.reference)}</strong>${row.invoiceDescription ? '<br><small>' + esc(row.invoiceDescription) + '</small>' : ''}`, esc(paymentMethods[row.method] || row.method), money(row.amountMinor), badge(row.reversed ? 'Revertido' : 'Confirmado', row.reversed ? 'warning' : 'success'), localLink(receiptPath(base, row.id), 'Ver comprobante')]), 'Los pagos confirmados por Lúmina aparecerán aquí.') + pagination(base, view, account, account.paymentCount));
  else content = `<div class="billing-overview-grid">${agencySubscriptionSummary(account, base)}${card(summary.balanceMinor > 0 ? 'Cuenta con saldo pendiente' : 'Cuenta al día', `<p>${summary.balanceMinor > 0 ? 'Pendiente: <strong>' + money(summary.balanceMinor) + '</strong>.' : 'El negocio no tiene cargos pendientes de pago.'}</p>${summary.overdueMinor > 0 ? '<p class="billing-warning">Hay pagos vencidos. Revisa los cargos o contacta a Lúmina.</p>' : ''}<div class="actions">${localLink(base + '?view=charges', 'Revisar y registrar pagos', 'btn')}</div>`)}</div>
    ${contractSummary(options.contracts||[],account.today,false)}
    ${card('Últimos pagos', account.payments.length ? `<div class="billing-recent">${account.payments.slice(0, 3).map(row => `<a href="${esc(receiptPath(base, row.id))}"><span><strong>${esc(row.reference)}</strong><small>${esc(billingDate(row.paidOn))} · ${row.reversed ? 'Revertido' : 'Confirmado'}</small></span><strong>${money(row.amountMinor)}</strong><span aria-hidden="true">→</span></a>`).join('')}</div>${localLink(base + '?view=payments', 'Ver todos los pagos')}` : '<p>Los pagos confirmados por Lúmina aparecerán aquí.</p>')}`;
  return `<div class="billing-workspace">${error ? `<p role="alert" class="notice">${esc(error)}</p>` : ''}${navigation(base, view)}${stats}${options.action ? billingDraft(actor, account, base, action, values) : ''}${content}<p class="billing-footnote">Cuenta en USD. Los cargos se registran en tu cuenta; no se debitan de una tarjeta bancaria. Los pagos confirmados no sustituyen la factura tributaria.</p></div>`;
}
export function receiptPage(actor, receipt, base, provider = null) {
  const p = receipt.payment, invoice = receipt.invoice;
  const walletCollection = actor.kind === 'AGENCY' && receipt.allocations?.length;
  return `<div class="billing-workspace"><div class="actions">${walletCollection ? localLink(base + '?view=wallet', '← Volver a cobros de Wallet', 'btn secondary') : localLink(base + '?view=payments', '← Volver a pagos', 'btn secondary')}${localLink(receiptPath(base, p.id) + '.txt', 'Descargar comprobante', 'btn')}<button type="button" class="secondary" data-print-receipt>Imprimir</button></div>
    <article class="card payment-receipt"><div class="split"><div><p class="eyebrow">LÚMINA DIGITAL</p><h2>Comprobante de pago</h2></div>${badge(p.reversed ? 'Registro revertido' : 'Pago confirmado', p.reversed ? 'warning' : 'success')}</div>
    <p class="receipt-business">${esc(receipt.business.name)}</p><p class="receipt-total">${money(p.amountMinor)}</p>
    <dl class="receipt-details">${[['Referencia', p.reference], ['Fecha de pago', billingDate(p.paidOn)], ['Medio de pago', paymentMethods[p.method] || p.method], ['Concepto', invoice.description], ['Identificador del registro', p.id]].map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    ${receipt.allocations?.length?table(['Cargo de Wallet','Importe aplicado'],receipt.allocations.map(a=>[esc(a.description),money(a.amountMinor)])):''}
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
    ...(receipt.allocations||[]).map(a=>plain(a.description)+' · USD '+(a.amountMinor/100).toFixed(2)),
    ...(p.reversed ? ['Motivo de reversión: ' + plain(p.reversalReason)] : []),
    ...(provider ? ['Proveedor: ' + plain(provider.legalName), 'RUC: ' + plain(provider.ruc), 'Contacto: ' + plain(provider.email) + ' · ' + plain(provider.phone)] : []),
    'Comprobante interno. No sustituye la factura tributaria ni confirma una operación bancaria.', ''].join('\n');
}

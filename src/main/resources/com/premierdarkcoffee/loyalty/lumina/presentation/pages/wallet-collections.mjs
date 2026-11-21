import { walletDues } from '../../memberships/wallet-balance.mjs';
import { maximumPaymentMinor } from '../../billing/payment-input.mjs';
import { isId, localDay } from '../../shared/domain.mjs';
import { badge, esc, localLink } from './components.mjs';
import { billingDate, money, paymentForm } from './billing-account-pages.mjs';

function walletStatus(account) {
  const state = account.access?.walletSubscriptionState;
  if (account.today < '2027-01-01') {
    return state === 'INACTIVE' ? 'Prueba desactivada' : state === 'TRIAL' ? 'Prueba activa hasta el 31 de diciembre' : 'Período de prueba gratuita';
  }
  if (state === 'OVERDUE') return account.walletBilling?.overdueMinor > 0 ? 'Pago vencido' : 'Revisar acceso de Wallet';
  return { ACTIVE: 'Suscripción vigente', INACTIVE: 'Sin suscripción activa', LEGACY: 'Acuerdo anterior' }[state] || '';
}

export function walletCollections(actor, company, account, error, values, options) {
  const base = '/admin/businesses/' + company.id;
  const balance = account?.walletBilling;
  const cut = balance?.nextCut;
  const retrying = options.action === 'payment' && values.walletCut === 'yes' && isId(values.invoiceId) && isId(values.requestKey);
  const state = account && walletStatus(account);
  const nav = `<div class="actions">${localLink('/businesses','← Negocios')}${localLink(base,'Administrar negocio')}${localLink(base+'?view=payments','Ver pagos y comprobantes')}${localLink('/businesses/wallet-outlook?company='+company.id,'Previsión del próximo corte')}</div>`;
  const heading = state ? badge(state, state === 'Pago vencido' ? 'warning' : '') : '';
  const alert = error ? `<p class="notice" role="alert">${esc(error)}</p>` : '';
  const settle = cut && {id: cut.invoiceId, walletCutMinor: cut.remainingMinor};
  let action = '';
  if (retrying) {
    action = `<section class="card"><h2>Comprobar el pago enviado</h2><p>Si el pago ya se guardó, recuperarás el mismo comprobante.</p>
      ${paymentForm(actor, account || {today: localDay()}, base, null, values, 'wallet')}
      ${localLink(base+'?view=wallet','Volver al saldo actualizado','btn secondary')}</section>`;
  } else if (cut && cut.remainingMinor > maximumPaymentMinor) {
    action = `<p>Registra por separado los pagos de este vencimiento.</p>${localLink(base+'?view=charges','Registrar un pago por cargo','btn')}`;
  } else if (cut) {
    action = `<details class="card billing-charge"><summary>Registrar pago de ${money(cut.remainingMinor)}</summary>
      <p>Verifica el ingreso recibido de ${esc(company.name)} para el vencimiento del ${esc(billingDate(cut.dueOn))}.</p>
      ${paymentForm(actor,account,base,settle,{walletCut:'yes'},'wallet')}
      ${localLink(base+'?view=charges','Registrar un abono en un cargo individual')}</details>`;
  }
  let detail;
  if (!balance) {
    detail = `<p>El saldo de Wallet no está disponible.</p>${localLink(base+'?view=wallet','Reintentar consulta','btn secondary')}`;
  } else if (!cut) {
    const state = account.access?.walletSubscriptionState;
    let next = 'Puedes consultar los pagos anteriores en el historial.';
    if (account.today < '2027-01-01') next = 'Wallet es gratis hasta el 31 de diciembre de 2026. Desde enero, el dueño decide si quiere continuar.';
    else if (state === 'OVERDUE') next = 'Revisa el estado del negocio y su cuenta general antes de solicitar un pago.';
    else if (account.nextWalletChargeOn && state !== 'LEGACY') next = 'El próximo cargo de Wallet se registrará el '+billingDate(account.nextWalletChargeOn)+'.';
    else if (state === 'INACTIVE') next = 'El dueño puede elegir su plan desde Mi suscripción cuando quiera volver.';
    detail = `<h3>Sin cobros pendientes de Wallet</h3><p>${esc(next)}</p>`;
  } else {
    const late = cut.dueOn < account.today;
    const {suspendedForDebt,overdueMinor}=walletDues(account);
    const afterCut=late && suspendedForDebt ? Math.max(0,overdueMinor-cut.remainingMinor) : 0;
    const notice=suspendedForDebt ? `<div class="billing-warning"><strong>Wallet está suspendida por mora.</strong>
      ${afterCut ? `<p>Saldo vencido para reactivar Wallet: <strong>${money(overdueMinor)}</strong>. Después de registrar este vencimiento quedarán <strong>${money(afterCut)}</strong> vencidos.</p>` :
      '<p>Revisa el ingreso antes de registrar el pago.</p>'}</div>` : '';
    detail = `${notice}<p>${late ? 'Pago vencido el' : cut.dueOn === account.today ? 'El plazo de pago termina hoy,' : 'Fecha límite de pago'} <strong>${esc(billingDate(cut.dueOn))}</strong></p>
      <p class="billing-plan-price"><strong>${money(cut.remainingMinor)}</strong></p>
      <p>${cut.invoiceCount === 1 ? 'Un cargo de Wallet' : esc(cut.invoiceCount) + ' cargos de Wallet con el mismo vencimiento'}.</p>
      ${balance.balanceMinor > cut.remainingMinor ? `<p>Quedan <strong>${money(balance.balanceMinor)}</strong> pendientes entre todos los vencimientos de Wallet. Se muestra primero el más antiguo.</p>` : ''}`;
  }
  return `<div class="billing-workspace">${nav}${alert}
    <section class="card"><div class="split"><h2>${esc(company.name)}</h2>${heading}</div>${detail}</section>
    ${action}<div class="actions">${localLink(base+'?view=charges','Ver cargos de todos los servicios','btn secondary')}</div></div>`;
}

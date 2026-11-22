import { randomUUID } from 'node:crypto';
import { button, card, check, displayAmount, esc, form, hidden, input, localLink } from './components.mjs';
import { inTrial, paidFrom } from '../../memberships/trial.mjs';
import { inclusiveEnd } from '../../memberships/orders.mjs';
import { localDay } from '../../shared/domain.mjs';
import { upcomingWalletCharge } from './billing-account-pages.mjs';

const date = day => new Intl.DateTimeFormat('es-EC', {dateStyle:'long', timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
export function subscriptionPage(actor, status, offer = null, error = '', enabled = true) {
  const today = status.today || localDay(), agreement = status.agreement;
  const signed = agreement?.activationOn || agreement?.acceptedAt?.slice(0,10);
  const authorized = Boolean(status.accepted && signed >= paidFrom);
  const renewing = authorized && status.recurring;
  const endsBefore = status.endsOn || status.coveredUntil;
  const covered = authorized && endsBefore > today;
  const lastDay = endsBefore ? date(inclusiveEnd(endsBefore)) : '';
  const period = status.cycle === 'ANNUAL' ? 'año' : 'mes';
  const total = status.periodMinor ?? status.monthlyMinor;
  const historicalTrial = signed && signed < paidFrom;
  let heading, explanation;
  if (renewing) {
    heading = 'Tu plan ' + (period === 'año' ? 'anual' : 'mensual') + ' de Wallet';
    explanation = 'Tu acuerdo se renueva automáticamente.';
  } else if (covered) {
    heading = 'Renovación desactivada';
    explanation = 'Tu plan sigue disponible hasta el ' + lastDay + ', inclusive.';
  } else if (historicalTrial) {
    heading = 'Acuerdo de la prueba gratuita';
    explanation = inTrial(today) ? 'Tu prueba es gratuita hasta el 31 de diciembre de 2026. Desde enero podrás elegir un plan.' : 'La prueba gratuita terminó el 31 de diciembre de 2026. La decisión de contratar un plan es tuya.';
  } else {
    heading = 'Acuerdo anterior de Wallet';
    explanation = status.endsOn ? 'Este acuerdo terminó el ' + lastDay + '.' : 'Consulta aquí la información conservada de tu acuerdo.';
  }
  const price = (renewing || covered) && Number.isSafeInteger(total)
    ? `<p class="billing-plan-price"><strong>${esc(displayAmount(total))}</strong> / ${period}</p>${Number.isSafeInteger(status.unitMinor) && status.branches?.length ? `<p>${status.branches.length} ${status.branches.length === 1 ? 'sucursal' : 'sucursales'} × ${esc(displayAmount(status.unitMinor))} por sucursal.</p>` : ''}` : '';
  const upcoming = renewing || covered
    ? upcomingWalletCharge(status.nextChargeOn, status.nextBranchCharge, date) : '';
  let action = localLink('/plans/wallet', historicalTrial && inTrial(today) ? 'Ver mi prueba' : 'Ver mi suscripción de Wallet', 'btn');
  if (enabled && (renewing || covered)) action = localLink('/wallet','Abrir Wallet','btn');
  else if (!enabled && covered) action = form('/plans/wallet/resume',actor,hidden('confirm','yes')+button('Activar mi Wallet'));
  const cancel = renewing ? `<details class="member-manage"><summary>Desactivar renovación</summary><p>${lastDay ? 'Podrás usar Wallet hasta el ' + esc(lastDay) + ', inclusive. ' : 'Conservarás el período vigente. '}Los cargos por el período utilizado seguirán en tu cuenta.</p>${form('/plans/wallet/cancel', actor, hidden('version',status.version)+hidden('requestKey',randomUUID())+check('confirm','Quiero detener las próximas renovaciones.',false,true)+button('Desactivar renovación','secondary'))}</details>` : '';
  const terms = agreement ? `<details class="member-manage"><summary>Condiciones aceptadas</summary><p>Aceptó ${esc(agreement.ownerName)}${signed ? ' el ' + esc(date(signed)) : ''}.</p><p class="prewrap">${esc(agreement.terms)}</p>${localLink('/plans/wallet/terms','Descargar mi acuerdo','btn secondary')}</details>` : '';
  return `<div class="member-plans owner-agreement">${error ? `<p class="notice" role="alert">${esc(error)}</p>` : ''}<section class="card"><h2>${heading}</h2><p>${esc(explanation)}</p>${price}${upcoming}<div class="actions">${action}${localLink('/billing','Ver cargos y pagos','btn secondary')}</div></section>${terms}${cancel}</div>`;
}
export function legalProfilePage(actor,profile={},error='') {
 return card('Identificación de Lúmina',`${error?`<p role="alert">${esc(error)}</p>`:''}<p>Estos datos aparecerán en las condiciones que aceptan los negocios.</p>${form('/account/provider',actor,hidden('revision',profile?.revision||0)+`<div class="fields two">${[['legalName','Nombre o razón social del proveedor','text'],['ruc','RUC','text'],['address','Domicilio','text'],['email','Correo de soporte y derechos','email'],['phone','Teléfono','tel'],['privacyUrl','Política de privacidad publicada','url']].map(([n,l,t])=>input(n,l,t,'required maxlength="'+(n==='privacyUrl'?500:250)+'"',profile?.[n]||'')).join('')}</div>`+check('confirm','Verifiqué la identificación legal y la política publicada, incluidos datos, conservación, destinatarios y derechos.',false,true)+button('Guardar datos de Lúmina'))}`);
}

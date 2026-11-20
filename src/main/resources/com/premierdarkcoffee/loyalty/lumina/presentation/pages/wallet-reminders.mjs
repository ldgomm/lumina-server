import { inTrial, paidFrom, trialChoice } from '../../memberships/trial.mjs';
import { localDay } from '../../shared/domain.mjs';
import { displayAmount } from './components.mjs';

const date = new Intl.DateTimeFormat('es-EC', {day:'numeric', month:'long', timeZone:'UTC'});
const trialReminderFrom = '2026-12-25';

export function trialEnding(day = localDay()) {
  return day >= trialReminderFrom && inTrial(day);
}

// Only a business that used the trial and has never made its next choice needs the invitation.
export function walletHomeEntry(db, company, day = localDay()) {
  const choice = trialChoice(db, company.id);
  if (inTrial(day)) return {trialEnding: choice.enabled && trialEnding(day)};
  const chosePlan = db.get(`SELECT 1 FROM wallet_choices WHERE company_id=? AND legacy_until IS NOT NULL
    UNION ALL SELECT 1 FROM wallet_schedules WHERE company_id=? AND consent_on>=?
    UNION ALL SELECT 1 FROM package_orders o JOIN package_order_lines l ON l.order_id=o.id
    WHERE o.company_id=? AND date(o.accepted_at,'-5 hours')>=? AND l.wallet<>'NONE' LIMIT 1`,
    company.id, company.id, paidFrom, company.id, paidFrom);
  return {choosePlan:choice.enabled && !choice.declined && !chosePlan,
    checkPayment:Boolean(company.loyalty_tenant && chosePlan)};
}

export function walletPaymentReminder(account) {
  if (!account) return null;
  const overdue = account.access?.overdueSuspension;
  // During an upgrade the Wallet service may answer with its earlier account format.
  const first = account.walletBilling ? account.walletBilling.nextCut : (account.invoices || []).filter(row => row.walletDue && row.remainingMinor > 0)
    .sort((a,b) => a.dueOn.localeCompare(b.dueOn))[0];
  if (!first && !overdue) return null;
  if (overdue && !(account.walletBilling ? account.walletBilling.overdueMinor > 0 : first?.status === 'OVERDUE')) {
    return {type:'suspended', title:'Revisa el acceso a Wallet',
      description:'Wallet está suspendida. Consulta tu cuenta para conocer el estado del negocio.',
      href:'/billing', action:'Revisar mi cuenta'};
  }
  const when = first?.dueOn && /^\d{4}-\d{2}-\d{2}$/.test(first.dueOn) ? date.format(new Date(first.dueOn+'T12:00:00Z')) : '';
  const amount = overdue ? account.walletBilling?.overdueMinor : first?.walletCutMinor ?? first?.remainingMinor;
  const amountText = amount > 0 ? displayAmount(amount) : '';
  const description = overdue
    ? (amountText ? 'Tienes '+amountText+' vencidos. ' : '')+'Las tarjetas volverán a estar disponibles cuando Lúmina registre los pagos vencidos.'
    : [amountText && 'Quedan '+amountText+' por pagar', when && 'Paga hasta el '+when].filter(Boolean).join('. ')+'.';
  return {type:overdue?'overdue':'payment', title:overdue?'Wallet suspendida por falta de pago':'Tienes un pago de Wallet pendiente',
    description, href:'/billing?view=charges#pago-wallet', action:'Revisar pago'};
}

export function walletTrialReminder(enabled, day=localDay()) {
  if (!enabled || !trialEnding(day)) return null;
  return {type:'trial', title:'Tu prueba termina el 31 de diciembre',
    description:'Desde el 1 de enero podrás elegir si quieres continuar. Hoy sigues usando Wallet gratis.'};
}

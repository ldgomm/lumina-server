import { inTrial, paidFrom, paidWallet, trialChoice } from '../../memberships/trial.mjs';
import { walletDues } from '../../memberships/wallet-balance.mjs';
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
  if (inTrial(day)) return {trial:choice.enabled, counterAvailable:choice.enabled, trialEnding:choice.enabled && trialEnding(day)};
  const chosePlan = db.get(`SELECT 1 FROM wallet_choices WHERE company_id=? AND legacy_until IS NOT NULL
    UNION ALL SELECT 1 FROM wallet_schedules WHERE company_id=? AND consent_on>=?
    UNION ALL SELECT 1 FROM package_orders o JOIN package_order_lines l ON l.order_id=o.id
    WHERE o.company_id=? AND date(o.accepted_at,'-5 hours')>=? AND l.wallet<>'NONE' LIMIT 1`,
    company.id, company.id, paidFrom, company.id, paidFrom);
  return {choosePlan:choice.enabled && !choice.declined && !chosePlan, counterAvailable:paidWallet(db,company.id,day),
    checkPayment:Boolean(company.loyalty_tenant && chosePlan)};
}

export function walletPaymentReminder(account) {
  if (!account) return null;
  const {today,cut,overdueMinor,hasOverdue,suspendedForDebt,restricted,inactive}=walletDues(account);
  if(restricted)return {type:'suspended',title:'Revisa el acceso a Wallet',
    description:'Wallet está suspendida. Consulta tu cuenta para conocer el estado del negocio.',href:'/billing',action:'Revisar mi cuenta'};
  if(!cut && !hasOverdue)return inactive?{type:'inactive',title:'Wallet está en pausa',
    description:'Puedes consultar tus planes y elegir cuándo volver.',href:'/plans/wallet',action:'Ver mi suscripción'}:null;
  const when=cut?.dueOn && /^\d{4}-\d{2}-\d{2}$/.test(cut.dueOn) ? date.format(new Date(cut.dueOn+'T12:00:00Z')) : '';
  let type='payment', title='Tienes un pago de Wallet pendiente';
  let detail=cut?.remainingMinor>0?'Quedan '+displayAmount(cut.remainingMinor)+' por pagar. ':'';
  if(hasOverdue){
    type=suspendedForDebt?'overdue':'late';
    title=suspendedForDebt?'Wallet suspendida por falta de pago':'Tienes un pago vencido de Wallet';
    detail=overdueMinor>0?'Saldo vencido de Wallet: '+displayAmount(overdueMinor)+'. ':'Hay pagos vencidos de Wallet. ';
    detail+=suspendedForDebt?'Las tarjetas volverán a estar disponibles cuando Lúmina registre los pagos vencidos.':'Revisa los cargos y los pagos registrados.';
  }else if(when){
    if(cut.dueOn===today)title='Tu pago de Wallet vence hoy';
    detail+=(cut.dueOn===today?'Vence hoy, ':'Paga hasta el ')+when+'.';
  }
  return {type,title,description:detail.trim(),href:'/billing?view=charges#pago-wallet',action:'Revisar pago'};
}

export function walletTrialReminder(enabled, day=localDay()) {
  if (!enabled || !trialEnding(day)) return null;
  return {type:'trial', title:'Tu prueba termina el 31 de diciembre',
    description:'Desde el 1 de enero podrás elegir si quieres continuar. Hoy sigues usando Wallet gratis.'};
}

import { localDay } from '../shared/domain.mjs';

// Older Wallet servers return invoice pages without the account-wide Wallet totals.
function legacyDues(account,today) {
  const rows=account?.invoices||[], cuts=new Map();
  const complete=!account?.offset && (account?.summary?.invoiceCount!=null
    ? rows.length===account.summary.invoiceCount : rows.length<100);
  for(const row of rows){
    if(!row.walletDue || row.status==='VOID' || !(row.remainingMinor>0) || !row.dueOn)continue;
    const cut=cuts.get(row.dueOn)||{dueOn:row.dueOn,remainingMinor:0,overdue:false};
    cut.remainingMinor=row.walletCutMinor??(cut.remainingMinor+row.remainingMinor);
    cut.overdue ||= row.status==='OVERDUE' || row.dueOn<today;
    cuts.set(row.dueOn,cut);
  }
  const open=[...cuts.values()].sort((a,b)=>a.dueOn.localeCompare(b.dueOn));
  const late=open.filter(cut=>cut.overdue);
  return {cut:open[0],overdueMinor:complete?late.reduce((total,cut)=>total+cut.remainingMinor,0):null,
    hasOverdue:late.length>0};
}

export function walletDues(account) {
  const today=account?.today||localDay(), ledger=account?.walletBilling;
  const {cut,overdueMinor,hasOverdue}=ledger
    ? {cut:ledger.nextCut,overdueMinor:ledger.overdueMinor,hasOverdue:ledger.overdueMinor>0}
    : legacyDues(account,today);
  const access=account?.access;
  const suspendedForDebt=Boolean(access?.overdueSuspension && hasOverdue);
  // The native service also suspends card operations when an otherwise open account has no plan.
  const inactive=access?.state==='ACTIVE' && access.effectiveState==='SUSPENDED' && access.walletSubscriptionState==='INACTIVE' && !access.overdueSuspension;
  const restricted=!suspendedForDebt && !inactive && Boolean(access?.overdueSuspension ||
    ['SUSPENDED','CLOSED'].includes(access?.state) || ['SUSPENDED','CLOSED'].includes(access?.effectiveState));
  return {today,cut,overdueMinor,hasOverdue,suspendedForDebt,restricted,inactive};
}

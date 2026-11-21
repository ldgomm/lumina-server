import { serviceState } from '../businesses/services.mjs';
import { localDay, Problem } from '../shared/domain.mjs';
import { contractsFor } from './billing.mjs';
import { pricedContracts } from './cut-outlook.mjs';
import { paidFrom } from './trial.mjs';

// Open Wallet selections have their own queue. A later Content or Web order
// must never displace the link needed to finish or discard a Wallet selection.
export function openWalletOrders(db, companyId) {
  const rows=db.all(`SELECT o.id,o.status,o.revision,o.created_at,l.name,l.term,l.unit_minor
    FROM package_orders o JOIN package_order_lines l ON l.order_id=o.id AND l.company_id=o.company_id
    WHERE o.company_id=? AND o.trial_archive=0 AND o.status IN ('REQUESTED','QUOTED','ACCEPTED')
      AND EXISTS(SELECT 1 FROM package_order_lines wl WHERE wl.company_id=o.company_id AND wl.order_id=o.id
        AND (wl.wallet IN ('INCLUDED','GIFT') OR EXISTS(SELECT 1 FROM json_each(wl.items_json) i WHERE json_extract(i.value,'$.service')='WALLET')))
    ORDER BY o.created_at DESC,o.id,l.term,l.name,l.id`,companyId);
  const orders=new Map();
  for(const row of rows){
    let order=orders.get(row.id);
    if(!order){
      order={id:row.id,status:row.status,revision:row.revision,names:[],wallet:true,ready:true};
      orders.set(row.id,order);
    }
    order.names.push(row.name);
    if(row.status==='REQUESTED' && (row.term!=='MONTHLY' || row.unit_minor===null))order.ready=false;
  }
  return {rows:[...orders.values()].map(order=>({...order,names:order.names.join(' + ')}))};
}

export async function walletPlanContext(db,wallets,actor,company) {
  const today=localDay();
  const all=await pricedContracts(db,wallets,actor,company,contractsFor(db,company.id,{walletSince:today}));
  const contracts=all.filter(c=>c.starts_on<=today);
  const booked=all.filter(c=>c.starts_on>today);
  let active=serviceState(db,company.id,'WALLET')==='ACTIVE',legacy=false,error='',account=null;
  if(company.loyalty_tenant)try{
    account=await wallets.account(actor);
    const plan=account.membership?.plan;
    legacy=!contracts.length && Boolean(plan?.walletAgreement?.activationOn>=paidFrom && (plan.recurring||!plan.walletEndsOn||plan.walletEndsOn>today));
    if(account.access?.effectiveState && account.access.effectiveState!=='ACTIVE')active=false;
  }catch(issue){
    if(!(issue instanceof Problem))throw issue;
    error='No pudimos consultar el saldo de Wallet. Vuelve a intentarlo para verificar tu cuenta.';
  }
  const pending=Boolean(db.get('SELECT 1 FROM wallet_calendar_sync WHERE company_id=? AND sent<revision',company.id));
  return {contracts,booked,active,legacy,error,account,pending};
}

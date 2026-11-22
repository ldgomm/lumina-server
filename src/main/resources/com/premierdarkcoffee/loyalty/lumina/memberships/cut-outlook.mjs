import { localDay, Problem } from '../shared/domain.mjs';
import { firstStatement, nextCut, selectionStart, walletLine } from './calendar.mjs';
import { inTrial, paidFrom, standardIds, trialChoice, visibleContracts } from './trial.mjs';
import { contractsFor } from './billing.mjs';

export const upcomingCut=(today=localDay())=>nextCut(today<paidFrom?paidFrom:today);

export async function accountOutlook(db,wallets,actor,company,today=localDay(),selectedCut=null) {
  const cut=selectedCut||upcomingCut(today);
  const unknown={cut,lines:[],available:false};
  if(!company.loyalty_tenant) {
    const scheduled=db.get('SELECT 1 FROM wallet_schedules WHERE company_id=? AND consent_on>=? LIMIT 1',company.id,paidFrom);
    return {cut,lines:[],available:!scheduled,referenceAvailable:!scheduled,bills:[]};
  }
  try {
    const forecast=await wallets.outlook(actor,company,selectedCut);
    const stored=db.get('SELECT revision FROM wallet_calendar_sync WHERE company_id=?',company.id);
    if(forecast.cut!==cut || !Array.isArray(forecast.lines) || !Number.isSafeInteger(forecast.revision) ||
       (cut===upcomingCut(today) && stored && stored.revision!==forecast.revision))return unknown;
    return {...forecast,available:true};
  } catch(e){
    if(!(e instanceof Problem)||![404,409,502,503].includes(e.status))throw e;
    return unknown;
  }
}

export function withPeriodBranches(contracts,outlook) {
  if(!outlook?.available||!outlook.branchHistory)return contracts;
  return contracts.map(c=>standardIds.includes(c.plan_id)&&c.schedule_start&&c.starts_on!==c.schedule_start?
    {...c,period_branches:outlook.branchHistory.reduce((sum,b)=>sum+(b.on<=c.starts_on?b.count:0),0)}:c);
}
export async function pricedContracts(db,wallets,actor,company,contracts) {
  if(!contracts.some(c=>standardIds.includes(c.plan_id)&&c.schedule_start&&c.starts_on!==c.schedule_start))return contracts;
  return withPeriodBranches(contracts,await accountOutlook(db,wallets,actor,company));
}
// Only combine prices that apply on the same day. Monthly and yearly amounts
// are independent commitments; a job is shown once, at its agreed price.
function ratesAfterChange(contracts,changes,outlook) {
  const day=changes[0]?.start;
  if(!day||!outlook.available||changes.some(c=>c.start!==day))return null;
  if((outlook.legacyActive||outlook.lines.some(line=>line.walletMinor>0))&&!contracts.some(c=>walletLine(c)&&c.starts_on<=day&&day<c.ends_before))return null;
  const groups=new Map(),seen=new Set();
  let estimatedBranches=false;
  function add(term,amount){
    const group=groups.get(term)||{term,amount:0,pending:false};
    if(amount===null)group.pending=true;else group.amount+=amount;
    groups.set(term,group);
  }
  for(const c of contracts){
    if(c.cancelled_at||c.term!=='MONTHLY'||c.starts_on>day||changes.some(change=>change.replaces===c.id||change.hasWallet&&walletLine(c)))continue;
    let price=c.agreed_minor;
    if(c.ends_before<=day){
      if(!c.schedule_id||!c.consent_on||c.stop_on&&c.stop_on<=day)continue;
      if(standardIds.includes(c.plan_id)){
        price=Number.isSafeInteger(outlook.branches)&&c.monthly_minor!=null?c.monthly_minor*outlook.branches:null;
        estimatedBranches=true;
      }
    }
    if(c.schedule_id){if(seen.has(c.schedule_id))continue;seen.add(c.schedule_id);}
    add(c.months===12?'por año':'por mes',price);
  }
  for(const change of changes)add(change.term,change.amount);
  return {day,estimatedBranches,groups:[...groups.values()]};
}

export function planComparison(db,company,order,outlook,today=localDay()) {
  const contracts=visibleContracts(withPeriodBranches(contractsFor(db,company.id),outlook));
  const current=contracts.filter(c=>!c.cancelled_at && c.starts_on<=today && today<c.ends_before);
  const trial=inTrial(today)&&trialChoice(db,company.id).enabled;
  const changes=order.lines.map(line=>{
    const start=line.starts_on||selectionStart(db,order,line,today);
    const priced=line.unit_minor!==null;
    const count=standardIds.includes(line.plan_id)?(line.branchCount||order.initial_branches||1):1;
    const amount=priced?line.unit_minor*line.units*count:null;
    const scheduled=walletLine(line)&&line.term==='MONTHLY'&&line.starts_on&&priced;
    let bill=null;
    if(scheduled){
      const other=(line.wallet==='GIFT'?line.unit_minor:(line.other_minor||0))*line.units;
      const end=line.ends_before;
      const wallet=firstStatement(start,(line.unit_minor*line.units-other)*count,end,line.months);
      const services=firstStatement(start,other,end,line.months);
      bill={cut:wallet.cut,amount:wallet.amount+services.amount};
    }
    return {name:line.name,term:line.months===12?'por año':line.term==='MONTHLY'?'por mes':'por este trabajo',start,requested:!line.starts_on,amount,bill,hasWallet:walletLine(line),replaces:line.renewal_of};
  });
  const switchAt=order.start_when==='NEXT_MONTH'?changes.find(change=>change.hasWallet&&!change.requested)?.start:null;
  const retained=outlook.lines.filter(line=>!switchAt||line.from<switchAt);
  const known=retained.reduce((sum,row)=>sum+row.walletMinor+row.otherMinor,0)+changes.reduce((sum,row)=>sum+(row.bill?.cut===outlook.cut?row.bill.amount:0),0);
  const separate=[...new Set([
    ...current.filter(c=>!c.schedule_id&&!walletLine(c)).map(c=>c.name),
    ...changes.filter(c=>!c.bill&&c.start<=outlook.cut).map(c=>c.name)
  ])];
  return {today,current,trial,changes,outlook,known,separate,switchAt,rates:ratesAfterChange(contracts,changes,outlook)};
}

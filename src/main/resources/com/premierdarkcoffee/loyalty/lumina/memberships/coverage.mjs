import { contentKind } from '../content/service-options.mjs';
import { localDay, requireThat } from '../shared/domain.mjs';
import { serviceName } from './catalog.mjs';
import { periodEnd, selectionStart, walletLine } from './calendar.mjs';

const openEnd='9999-12-31';
function services(line) {
  const result=new Set(line.items.map(i=>contentKind(i.service)).filter(s=>s==='WALLET'||line.term==='MONTHLY'));
  if(walletLine(line))result.add('WALLET');
  return result;
}
function sameServiceSet(a,b) {
  const x=services(a),y=services(b);
  return x.size===y.size && [...x].every(s=>y.has(s));
}
function windowFor(db,order,line,today) {
  const start=line.starts_on||selectionStart(db,order,line,today);
  let end=line.ends_before;
  if(!end) {
    if(walletLine(line))end=periodEnd(start,line.months);
    else {
      const date=new Date(start+'T12:00:00Z'),day=date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth()+(line.months||1));
      const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
      date.setUTCDate(Math.min(day,last));
      end=date.toISOString().slice(0,10);
    }
  }
  return {start,end:walletLine(line)&&line.term==='MONTHLY'&&!line.campaign?openEnd:end};
}
export function coverageFor(db,company,today=localDay()) {
  const plans=new Map();
  const items=id=>{
    if(!plans.has(id))plans.set(id,db.all('SELECT service,quantity FROM plan_items WHERE plan_id=?',id));
    return plans.get(id);
  };
  const records=db.all(`SELECT c.plan_id,c.starts_on AS start,c.ends_before AS end,p.name,p.term,p.wallet,coalesce(b.months,1) months
    FROM contracts c JOIN plans p ON p.id=c.plan_id LEFT JOIN plan_billing b ON b.plan_id=p.id
    WHERE c.company_id=? AND c.cancelled_at IS NULL AND c.ends_before>?`,company,today);
  const schedules=db.all(`SELECT s.plan_id,s.starts_on AS start,s.ends_before AS end,p.name,p.term,p.wallet,coalesce(b.months,1) months
    FROM wallet_schedules s JOIN plans p ON p.id=s.plan_id LEFT JOIN plan_billing b ON b.plan_id=p.id
    WHERE s.company_id=? AND (s.ends_before IS NULL OR (s.ends_before>s.starts_on AND s.ends_before>?))`,company,today);
  const current=[...records,...schedules.map(s=>({...s,schedule:true}))].map(r=>({...r,end:r.end||openEnd,items:items(r.plan_id)}));
  const pending=db.all(`SELECT o.id AS order_id,o.company_id,o.start_when,o.wallet_not_before,l.*,coalesce(b.months,1) months,
    s.plan_id AS campaign FROM package_orders o JOIN package_order_lines l ON l.order_id=o.id LEFT JOIN plan_billing b ON b.plan_id=l.plan_id
    LEFT JOIN seasonal_offers s ON s.plan_id=l.plan_id WHERE o.company_id=? AND o.status IN ('REQUESTED','QUOTED','ACCEPTED')`,company);
  for(const r of pending){
    if(r.ends_before && r.ends_before<=today)continue;
    const line={...r,items:JSON.parse(r.items_json)};
    current.push({...line,...windowFor(db,r,line,today)});
  }
  return current;
}
// Read and write paths use the same half-open coverage intervals. Writers call this
// inside BEGIN IMMEDIATE so two sessions cannot reserve the same period.
export function selectionConflict(db,order,lines,records=coverageFor(db,order.company_id),today=localDay()) {
  const occupied=records.filter(r=>!order.id || r.order_id!==order.id);
  for(const line of lines){
    const wanted=services(line);
    if(!wanted.size)continue;
    if(wanted.has('WALLET') && line.units>1)return 'Wallet se contrata una sola vez por negocio. Elige una unidad.';
    const {start,end}=windowFor(db,order,line,today);
    for(const r of occupied) {
      if(start>=r.end || r.start>=end)continue;
      const match=[...services(r)].find(s=>wanted.has(s));
      if(!match)continue;
      // A confirmed change can end the current recurring schedule, once the
      // committed contract has expired. A future reservation cannot be displaced.
      if(r.schedule && order.start_when==='NEXT_MONTH' && r.start<=today && r.start<start &&
         walletLine(line) && line.term==='MONTHLY' && (line.months!==r.months || !sameServiceSet(line,r)))continue;
      if(r.order_id)return 'Ya tienes una solicitud para '+r.name+' en este período. Puedes continuarla o cancelarla en Mis solicitudes.';
      if(r.selection)return 'La selección incluye '+serviceName(match)+' más de una vez durante el mismo período.';
      return 'Ya tienes '+r.name+' para este período. '+serviceName(match)+' ya está incluido. Puedes agregar otro servicio o programar un cambio para el siguiente período.';
    }
    occupied.push({...line,start,end,selection:true});
  }
  return '';
}
export function checkSelection(db,order,lines) {
  const message=selectionConflict(db,order,lines);
  requireThat(!message,message,409);
}
export function withEligibility(db,company,plans,native=null) {
  const records=coverageFor(db,company);
  return plans.map(p=>{
    const line={...p,plan_id:p.id,units:1},base={company_id:company};
    const legacy=legacySelection(native,p);
    const now=legacy.now||selectionConflict(db,{...base,start_when:'TODAY'},[line],records);
    const next=legacy.next||selectionConflict(db,{...base,start_when:'NEXT_MONTH',wallet_not_before:legacy.until},[line],records);
    return {...p,blockedNow:now,blockedNext:next};
  });
}
export function legacySelection(membership,line,today=localDay()) {
  const plan=membership?.plan;
  const until=plan?.walletEndsOn || membership?.coveredUntil || membership?.nextChargeOn;
  if(!walletLine(line) || !plan || !plan.recurring && (!until || until<=today))return {};
  const same=plan.recurring && line.term==='MONTHLY' && (line.months||1)===(plan.intervalMonths||1) && services(line).size===1;
  const now='Tu acuerdo anterior ya incluye Wallet durante este período.';
  if(line.term==='ONE_OFF' && plan.recurring)return {now,next:'Tu acuerdo renueva Wallet. Puedes contratar los trabajos adicionales por separado.',until};
  return {now,next:same?now+' Puedes elegir otra modalidad para el siguiente período.':'',until};
}

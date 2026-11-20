import { contentKind } from '../content/service-options.mjs';
import { localDay, nextMonth, now, requireThat, uuid } from '../shared/domain.mjs';
import { serviceArea } from './catalog.mjs';

export const monthStart = date => date.slice(0,7)+'-01';
export const nextCut = date => nextMonth(monthStart(date));
export const paidFrom='2027-01-01';
export function periodEnd(start,months=1) {
  if(months!==12)return nextCut(start);
  if(start<paidFrom)return paidFrom;
  return start.endsWith('-01')?(Number(start.slice(0,4))+1)+start.slice(4):nextCut(start);
}
export function firstStatement(start, amount, end=null, months=1) {
  const from=start<paidFrom?paidFrom:start, cut=nextCut(from);
  const stop=end&&end<cut?end:cut;
  const days=Math.max(0,(Date.parse(stop)-Date.parse(from))/86400000);
  const monthDays=(Date.parse(cut)-Date.parse(monthStart(from)))/86400000;
  const fee=months===12 && from===monthStart(from) && days===monthDays ? amount : Math.round(amount*days/(monthDays*months));
  return {cut,due:cut.slice(0,8)+'15',days,monthDays,amount:fee};
}
export const walletLine = line => ['INCLUDED','GIFT'].includes(line.wallet)||line.items.some(i=>i.service==='WALLET');

// Accepted fixed-term contracts continue through their exclusive end. A recurring
// plan can be replaced at the first uncommitted calendar cut.
export function selectionStart(db, order, line, today=localDay()) {
  if(line.renewal_of) {
    const previous=db.get('SELECT ends_before FROM contracts WHERE id=? AND company_id=? AND cancelled_at IS NULL',line.renewal_of,order.company_id);
    if(previous)return previous.ends_before;
  }
  let start=order.start_when==='NEXT_MONTH'?nextCut(today):today;
  if(order.start_when==='NEXT_MONTH') {
    const wanted=new Set(line.items.map(i=>contentKind(i.service)));
    const fixed=db.all(`SELECT c.ends_before,i.service FROM contracts c JOIN plan_items i ON i.plan_id=c.plan_id
      WHERE c.company_id=? AND c.cancelled_at IS NULL AND c.starts_on<=? AND c.ends_before>?
        AND (i.service='WALLET' OR EXISTS(SELECT 1 FROM plans p WHERE p.id=c.plan_id AND p.term='MONTHLY'))`,order.company_id,today,start);
    for(const period of fixed){
      if(wanted.has(contentKind(period.service)) && period.ends_before>start)start=period.ends_before;
    }
    if(walletLine(line) && order.wallet_not_before && order.wallet_not_before>start)start=order.wallet_not_before;
  }
  return start;
}
function dirty(db,company) {
  db.run('INSERT INTO wallet_calendar_sync(company_id) VALUES(?) ON CONFLICT(company_id) DO UPDATE SET revision=revision+1',company);
}
export function addSchedule(db,actor,company,contract,line,order) {
  const start=line.starts_on;
  const overlapping=db.all('SELECT * FROM wallet_schedules WHERE company_id=? AND (ends_before IS NULL OR starts_on<ends_before AND ends_before>?) ORDER BY starts_on',company.id,start);
  const previous=overlapping[0];
  if(overlapping.length) {
    const old=overlapping[0];
    requireThat(order.start_when==='NEXT_MONTH' && overlapping.length===1 && old.starts_on<start && old.plan_id!==line.plan_id,
      'Ya tienes Wallet para estas fechas. Elige un paquete distinto para el próximo mes o agrega solo el servicio que necesitas.',409);
    db.run('UPDATE wallet_schedules SET ends_before=? WHERE id=?',start,old.id);
  }
  // Seasonal prices apply only to their accepted period.
  const end=line.campaign?line.ends_before:null;
  db.run('INSERT INTO wallet_schedules(id,company_id,plan_id,starts_on,ends_before,next_period,amount_minor,units,owner_id,replaces_id,prior_end,other_minor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    contract,company.id,line.plan_id,start,end,line.ends_before,line.unit_minor*line.units,line.units,actor.id,previous?.id??null,previous?.ends_before??null,(line.wallet==='GIFT'?line.unit_minor:line.other_minor||0)*line.units);
  db.run('UPDATE contracts SET schedule_id=? WHERE id=?',contract,contract);
  dirty(db,company.id);
}
export function stopSchedule(db,company,schedule,day) {
  const row=db.get('SELECT * FROM wallet_schedules WHERE id=? AND company_id=?',schedule,company);
  requireThat(row,'Suscripción no encontrada.',404);
  const current=db.get('SELECT ends_before FROM contracts WHERE schedule_id=? AND starts_on<=? AND ends_before>? AND cancelled_at IS NULL',row.id,day,day);
  const end=row.starts_on>day?row.starts_on:current?.ends_before||nextCut(day);
  if(row.ends_before && row.ends_before<=end)return;
  db.run('UPDATE wallet_schedules SET ends_before=? WHERE id=?',end,row.id);
  if(end===row.starts_on && row.replaces_id && row.starts_on>day){
    db.run('UPDATE wallet_schedules SET ends_before=? WHERE id=? AND company_id=? AND ends_before=?',row.prior_end,row.replaces_id,company,row.starts_on);
  }
  if(end===row.starts_on)db.run('UPDATE contracts SET cancelled_at=? WHERE schedule_id=? AND starts_on>=? AND cancelled_at IS NULL',now(),row.id,end);
  dirty(db,company);
}
export function queueServices(db,contract,day) {
  db.run('INSERT OR IGNORE INTO scheduled_services(contract_id,starts_on) VALUES(?,?)',contract,day);
}
export function applyDueServices(db,today=localDay()) {
  const due=db.all(`SELECT q.contract_id,c.company_id,c.plan_id,a.submitted_by FROM scheduled_services q JOIN contracts c ON c.id=q.contract_id
    JOIN package_order_lines l ON l.id=c.order_line_id JOIN package_orders a ON a.id=l.order_id
    LEFT JOIN business_controls b ON b.company_id=c.company_id
    WHERE q.applied=0 AND q.starts_on<=? AND c.ends_before>? AND c.cancelled_at IS NULL
    AND coalesce(b.state,'ACTIVE')='ACTIVE' AND b.pending_id IS NULL`,today,today);
  for(const row of due) {
    for(const {service} of db.all('SELECT service FROM plan_items WHERE plan_id=?',row.plan_id)) {
      const area=serviceArea(service); if(!area)continue;
      db.run(`INSERT INTO company_services VALUES(?,?,'ACTIVE',?,?) ON CONFLICT(company_id,service) DO UPDATE SET status='ACTIVE'`,row.company_id,area,row.submitted_by,now());
    }
    db.run('UPDATE scheduled_services SET applied=1 WHERE contract_id=?',row.contract_id);
  }
}
export function advanceCalendar(db,today=localDay()) {
  db.transaction(()=>{
    // A closed business stops renewing. Explicit service choices survive a pause.
    for(const row of db.all(`SELECT s.id,s.company_id,s.starts_on,b.updated_at FROM wallet_schedules s JOIN business_controls b ON b.company_id=s.company_id
      WHERE b.state='CLOSED' AND (s.ends_before IS NULL OR s.ends_before>?)`,today)) {
      const closedOn=localDay(new Date(row.updated_at || now()));
      stopSchedule(db,row.company_id,row.id,closedOn);
    }
    for(const row of db.all('SELECT s.*,coalesce(b.months,1) months FROM wallet_schedules s LEFT JOIN plan_billing b ON b.plan_id=s.plan_id WHERE next_period<=? AND (ends_before IS NULL OR next_period<ends_before)',today)) {
      let start=row.next_period;
      while(start<=today && (!row.ends_before||start<row.ends_before)) {
        let end=periodEnd(start,row.months); if(row.ends_before && row.ends_before<end)end=row.ends_before;
        db.run(`INSERT INTO contracts(id,company_id,plan_id,agreed_minor,starts_on,ends_before,created_at,units,schedule_id,renewal_anchor)
          VALUES(?,?,?,?,?,?,?,?,?,?)`,uuid(),row.company_id,row.plan_id,row.amount_minor,start,end,now(),row.units,row.id,monthStart(start));
        start=end;
      }
      db.run('UPDATE wallet_schedules SET next_period=? WHERE id=?',start,row.id);
      dirty(db,row.company_id);
    }
    applyDueServices(db,today);
  });
}
export function calendarSnapshot(db,company) {
  const state=db.get('SELECT * FROM wallet_calendar_sync WHERE company_id=?',company);
  if(!state || state.sent===state.revision)return null;
  const entries=db.all(`SELECT s.id,p.name,s.starts_on AS "startsOn",s.ends_before AS "endsBefore",s.amount_minor AS "feeMinor",s.next_period AS "billBefore",coalesce(b.months,1) months,s.other_minor AS "otherMinor"
    FROM wallet_schedules s JOIN plans p ON p.id=s.plan_id LEFT JOIN plan_billing b ON b.plan_id=s.plan_id WHERE s.company_id=? ORDER BY s.starts_on,s.id`,company);
  const paid=db.all('SELECT contract_id AS id,name,starts_on AS startsOn,ends_before AS endsBefore,0 AS feeMinor FROM wallet_prepaid_coverage WHERE company_id=? ORDER BY starts_on,ends_before',company);
  // Previously sold bundles may share coverage; one zero-charge interval suffices.
  const coverage=[];
  for(const interval of paid){
    const prior=coverage.at(-1);
    if(prior && interval.startsOn<prior.endsBefore)prior.endsBefore=prior.endsBefore>interval.endsBefore?prior.endsBefore:interval.endsBefore;
    else coverage.push(interval);
  }
  return {companyId:company,revision:state.revision,entries:[...coverage.map(c=>({...c,billBefore:c.endsBefore,replacesLegacy:false})),...entries]};
}
export async function syncCalendars(db,remote) {
  const pending=db.all(`SELECT q.company_id,c.loyalty_tenant FROM wallet_calendar_sync q JOIN companies c ON c.id=q.company_id
    WHERE q.sent<q.revision AND c.loyalty_tenant IS NOT NULL`);
  for(const row of pending) {
    const snapshot=calendarSnapshot(db,row.company_id);
    if(!snapshot)continue;
    try {
      const result=await remote(row.loyalty_tenant,'wallet-calendar',{method:'PUT',body:snapshot});
      if(result?.revision===snapshot.revision)db.run('UPDATE wallet_calendar_sync SET sent=max(sent,?) WHERE company_id=?',snapshot.revision,row.company_id);
    } catch { /* The durable revision stays pending for the next worker pass. */ }
  }
}
export function expiryAlerts(db,company,today=localDay()) {
  const limit=new Date(Date.parse(today)+7*86400000).toISOString().slice(0,10);
  const rows=db.all(`SELECT c.id,c.ends_before,p.name,i.service FROM contracts c JOIN plans p ON p.id=c.plan_id JOIN plan_items i ON i.plan_id=p.id
    WHERE c.company_id=? AND c.cancelled_at IS NULL AND p.term='MONTHLY' AND c.starts_on<=? AND c.ends_before>? AND c.ends_before<=?
    AND NOT EXISTS(SELECT 1 FROM wallet_schedules s WHERE s.id=c.schedule_id AND (s.ends_before IS NULL OR s.ends_before>c.ends_before))
    AND NOT EXISTS(SELECT 1 FROM contracts n WHERE n.company_id=c.company_id AND n.cancelled_at IS NULL AND n.starts_on=c.ends_before AND n.plan_id=c.plan_id)
    ORDER BY c.ends_before,p.name`,company,today,today,limit);
  const seen=new Set();
  return rows.filter(row=>{
    if(!['SOCIAL','WEB'].includes(serviceArea(row.service))||seen.has(row.id))return false;
    seen.add(row.id); return true;
  });
}

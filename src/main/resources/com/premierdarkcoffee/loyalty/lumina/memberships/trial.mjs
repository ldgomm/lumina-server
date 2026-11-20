import { event, localDay, now, requireThat } from '../shared/domain.mjs';

export const paidFrom='2027-01-01';
export const inTrial=(day=localDay())=>day<paidFrom;
export const walletLine=line=>['INCLUDED','GIFT'].includes(line.wallet)||line.items.some(i=>i.service==='WALLET');
export const walletOnly=line=>walletLine(line)&&line.items.every(i=>i.service==='WALLET');
export const trialMessage='Wallet es gratis hasta el 31 de diciembre de 2026. Desde el 1 de enero podrás elegir un plan mensual o anual.';
export const standardIds=['b32a3473-4d70-45ee-9937-9d702510a001','b32a3473-4d70-45ee-9937-9d702510a012'];
export const standards=standardIds.map((id,i)=>({id,name:i?'Wallet anual':'Wallet mensual',term:'MONTHLY',months:i?12:1,price_minor:i?5000:499,
  wallet:'INCLUDED',description:'Tarjetas, puntos y premios para tus clientes.',published:1,items:[{service:'WALLET',quantity:1}],other_minor:null}));
export function standardFor(plan){
  if(plan.term!=='MONTHLY' || plan.campaign || !walletOnly(plan))return null;
  return standards.find(s=>s.months===plan.months && s.price_minor===plan.price_minor);
}
export function trialOffer(plan,day=localDay()){
  if(!inTrial(day)||!walletLine(plan))return plan;
  if(walletOnly(plan))return null;
  const price=plan.wallet==='GIFT'?plan.price_minor:plan.other_minor??null;
  return {...plan,items:plan.items.filter(i=>i.service!=='WALLET'),wallet:'NONE',price_minor:price,trialBundle:true};
}
export function trialChoice(db,company){
  const choice=db.get('SELECT * FROM wallet_choices WHERE company_id=?',company);
  return {enabled:choice?Boolean(choice.trial_active):Boolean(db.get("SELECT 1 FROM company_services WHERE company_id=? AND service='WALLET' AND status='ACTIVE'",company)),declined:Boolean(choice?.declined)};
}
export function setChoice(db,actor,action){
  const company=actor.company_id, trial=inTrial(), enable=action==='start';
  requireThat(actor.kind==='OWNER','Solo el dueño puede elegir la suscripción.',403);
  requireThat(trial?['start','stop'].includes(action):action==='later',trial?trialMessage:'La prueba gratuita terminó. Elige mensual o anual para activar Wallet.',409);
  db.transaction(()=>{
    const before=trialChoice(db,company);
    if(trial?before.enabled===enable:before.declined)return;
    db.run('INSERT INTO wallet_choices(company_id,trial_active,declined) VALUES(?,?,?) ON CONFLICT(company_id) DO UPDATE SET trial_active=excluded.trial_active,declined=excluded.declined',
      company,Number(trial?enable:before.enabled),Number(!trial));
    if(trial){
      db.run("INSERT INTO company_services VALUES(?,'WALLET',?,?,?) ON CONFLICT(company_id,service) DO UPDATE SET status=excluded.status",company,enable?'ACTIVE':'SETUP',actor.id,now());
      dirtyCalendar(db,company);
    }
    event(db,actor,company,'WALLET',company,trial?(enable?'PRUEBA_ACTIVADA':'PRUEBA_DESACTIVADA'):'CONTINUACIÓN_POSPUESTA','','WALLET');
  });
}
// Show only the commercial part that was actually authorized. The original
// amounts and signed terms remain available on the individual agreement.
export function visibleContracts(contracts){
  return contracts.flatMap(c=>{
    if(!walletLine(c))return [c];
    if((c.consent_on||c.accepted_on||'')>=paidFrom)return [{...c,agreed_minor:c.agreed_minor*(standardIds.includes(c.plan_id)?c.initial_branches||1:1)}];
    if(walletOnly(c))return [];
    const others=c.catalog_other_minor!=null?c.catalog_other_minor*(c.units||1):c.other_minor>0?c.other_minor:null;
    return [{...c,wallet:'NONE',items:c.items.filter(i=>i.service!=='WALLET'),agreed_minor:c.wallet==='GIFT'?c.agreed_minor:others}];
  });
}
export function dirtyCalendar(db,company){
  db.run('INSERT INTO wallet_calendar_sync(company_id) VALUES(?) ON CONFLICT(company_id) DO UPDATE SET revision=revision+1',company);
}
export function paidWallet(db,company,day=localDay()){
  return Boolean(db.get(`SELECT 1 FROM wallet_choices WHERE company_id=? AND legacy_until>?
    UNION ALL SELECT 1 FROM wallet_schedules s WHERE company_id=? AND consent_on>=? AND consent_on<=? AND (ends_before IS NULL OR ends_before>?) AND (starts_on<=? OR (starts_on<coalesce(ends_before,'9999-12-31') AND EXISTS(SELECT 1 FROM wallet_prepaid_coverage pc WHERE pc.company_id=s.company_id AND pc.starts_on<=? AND pc.ends_before>?)))
    UNION ALL SELECT 1 FROM contracts c JOIN package_order_lines l ON c.order_line_id=l.id JOIN package_orders o ON o.id=l.order_id
    WHERE c.company_id=? AND c.cancelled_at IS NULL AND c.schedule_id IS NULL AND l.wallet<>'NONE'
    AND date(o.accepted_at,'-5 hours')>=? AND c.starts_on<=? AND c.ends_before>? LIMIT 1`,company,day,company,paidFrom,day,day,day,day,day,company,paidFrom,day,day));
}

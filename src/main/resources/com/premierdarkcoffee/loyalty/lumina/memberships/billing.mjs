import { checkRevision } from '../shared/revision.mjs';
import { attachCampaign, offerAvailable } from '../campaigns/season.mjs';
import { checkSelection } from './coverage.mjs';
import { dirtyCalendar, inTrial, paidFrom, standardFor, standardIds, standards, trialOffer, walletLine } from './trial.mjs';
import { stopSchedule } from './calendar.mjs';
import { normalizeOffer } from './offers.mjs';
import { requireAgency, requireOwner } from '../access/accounts.mjs';
import { choice, dateOnly, event, integer, localDay, money, nextMonth, now, requireThat, services, text, uuid } from '../shared/domain.mjs';

export function listPlans(db, includeHidden = false) {
  const plans=db.all('SELECT p.*,coalesce(b.months,1) months,b.other_minor FROM plans p LEFT JOIN plan_billing b ON b.plan_id=p.id WHERE (published=1 OR ?=1) AND NOT EXISTS(SELECT 1 FROM wallet_trial_variants v WHERE v.plan_id=p.id) ORDER BY term,name,created_at DESC', Number(includeHidden))
    .map(plan => ({ ...attachCampaign(db,plan), items: db.all('SELECT service,quantity FROM plan_items WHERE plan_id=? ORDER BY service',plan.id) })).filter(plan=>includeHidden||offerAvailable(plan)).filter(p=>!standardIds.includes(p.id));
  if(includeHidden || inTrial())return plans;
  return [...plans.filter(p=>!standardFor(p)),...standards];
}
export function getPlan(db, id) {
  const standard=standards.find(p=>p.id===id);
  if(standard)return {...standard};
  const variant=db.get('SELECT source_id FROM wallet_trial_variants WHERE plan_id=?',id||'');
  const plan = db.get('SELECT p.*,coalesce(b.months,1) months,b.other_minor FROM plans p LEFT JOIN plan_billing b ON b.plan_id=p.id WHERE p.id=?',id || '');
  requireThat(plan, 'Ese plan no está disponible.', 404);
  const source=variant?getPlan(db,variant.source_id):null;
  return { ...attachCampaign(db,plan), ...(source?{published:source.published,campaign:source.campaign,trialBundle:true}:{}), items: db.all('SELECT service,quantity FROM plan_items WHERE plan_id=? ORDER BY service',id) };
}
// Store the exact items and price to which the owner agreed. A trial bundle grants
// the other services only. Wallet can subsequently be paused or resumed independently.
export function purchasePlan(db,plan) {
  const standard=standardFor(plan);
  if(standard){
    plan=standard;
    requireThat(!inTrial(),'Wallet está en prueba gratuita.',409);
    db.run("INSERT OR IGNORE INTO plans(id,name,term,price_minor,wallet,description,created_at) VALUES(?,?,'MONTHLY',?,'INCLUDED',?,?)",plan.id,plan.name,plan.price_minor,plan.description,now());
    db.run("INSERT OR IGNORE INTO plan_items(plan_id,service,quantity) VALUES(?,'WALLET',1)",plan.id);
    db.run('INSERT OR IGNORE INTO plan_billing VALUES(?,?,NULL)',plan.id,plan.months);
    return plan;
  }
  if(!inTrial()||!walletLine(plan))return plan;
  const offer=trialOffer(plan);
  requireThat(offer,'Wallet es gratis hasta el 31 de diciembre. Activa la prueba desde Mi suscripción de Wallet.',409);
  let variant=db.get('SELECT plan_id FROM wallet_trial_variants WHERE source_id=?',plan.id);
  if(!variant){
    const id=uuid();
    db.run("INSERT INTO plans(id,name,term,price_minor,wallet,description,published,created_at) VALUES(?,?,?,?,'NONE',?,0,?)",id,plan.name,plan.term,offer.price_minor,plan.description,now());
    for(const i of offer.items)db.run('INSERT INTO plan_items VALUES(?,?,?)',id,i.service,i.quantity);
    db.run('INSERT INTO plan_billing VALUES(?,?,NULL)',id,plan.months);
    db.run('INSERT INTO wallet_trial_variants VALUES(?,?)',plan.id,id);
    variant={plan_id:id};
  }
  return getPlan(db,variant.plan_id);
}
export function createPlan(db, actor, data) {
  requireAgency(actor);
  data=normalizeOffer(data);
  if(data.offer_kind==='INDIVIDUAL') {
    const selected=choice(data.individual_service,Object.keys(services),'servicio individual');
    data={...data,...Object.fromEntries(Object.keys(services).map(service=>[service,'0'])),[selected]:'1',wallet:selected==='WALLET'?'INCLUDED':'NONE'};
  } else if(data.offer_kind)choice(data.offer_kind,['BUNDLE'],'tipo de oferta');
  const name = text(data.name, 'nombre del plan', 2, 100);
  const months=data.term==='ANNUAL'?12:1;
  const term = months===12?'MONTHLY':choice(data.term, ['MONTHLY','ONE_OFF'], 'tipo de plan');
  const wallet = choice(data.wallet, ['NONE','INCLUDED','GIFT'], 'inclusión de Wallet');
  const price = money(data.price,true);
  const description = text(data.description || '', 'descripción', 0, 1200);
  const items = Object.keys(services).filter(key => key !== 'WALLET')
    .map(key => [key, integer(data[key] || '0',services[key],{ max:100 })]).filter(([,n]) => n > 0);
  requireThat(term!=='MONTHLY'||!items.some(([service])=>['LOGO','IDENTITY','BRAND_GUIDE'].includes(service)),'Diseño de marca se contrata como trabajo individual, con entrega y cierre.');
  if (wallet !== 'NONE') items.push(['WALLET',1]);
  requireThat(items.length, 'Agrega al menos un servicio al plan.');
  return db.transaction(() => {
    const id = uuid();
    db.run('INSERT INTO plans(id,name,term,price_minor,wallet,description,created_at) VALUES(?,?,?,?,?,?,?)',
      id,name,term,price,wallet,description,now());
    const other=wallet==='INCLUDED' && items.length>1 && term==='MONTHLY' ? money(data.other_price||'',true) : null;
    requireThat(other===null || price!==null && other<=price,'El importe de los otros servicios debe estar dentro del precio total.');
    if(months===12 || other!==null)db.run('INSERT INTO plan_billing VALUES(?,?,?)',id,months,other);
    for (const [service, quantity] of items) db.run('INSERT INTO plan_items VALUES(?,?,?)',id,service,quantity);
    event(db,actor,null,'PLAN',id,'PLAN_PUBLICADO',name);
    return id;
  });
}
export function hidePlan(db, actor, id) {
  requireAgency(actor);
  const plan = getPlan(db,id);
  db.transaction(() => {
    if (db.run('UPDATE plans SET published=0 WHERE id=? AND published=1',id).changes) {
      event(db,actor,null,'PLAN',id,'PLAN_RETIRADO',plan.name);
    }
  });
}
export function contractsFor(db, companyId, {walletSince=null}={}) {
  const walletFilter=walletSince?`AND c.cancelled_at IS NULL AND c.ends_before>?
    AND coalesce(ws.consent_on,date(o.accepted_at,'-5 hours'),'')>=?
    AND (p.wallet IN ('INCLUDED','GIFT') OR EXISTS(SELECT 1 FROM plan_items i WHERE i.plan_id=p.id AND i.service='WALLET'))`:'';
  const params=walletSince?[companyId,walletSince,paidFrom]:[companyId];
  return db.all(`SELECT c.*,ws.consent_on,ws.other_minor,b.other_minor AS catalog_other_minor,ws.initial_branches,date(o.accepted_at,'-5 hours') AS accepted_on,ws.ends_before AS stop_on,ws.amount_minor AS monthly_minor,p.name,p.term,p.wallet,coalesce(b.months,1) months,s.year AS campaign_year,s.base_plan_id FROM contracts c JOIN plans p ON p.id=c.plan_id LEFT JOIN package_order_lines l ON l.id=c.order_line_id LEFT JOIN package_orders o ON o.id=l.order_id LEFT JOIN wallet_schedules ws ON ws.id=c.schedule_id AND ws.company_id=c.company_id LEFT JOIN plan_billing b ON b.plan_id=p.id LEFT JOIN seasonal_offers s ON s.plan_id=p.id
    WHERE c.company_id=? ${walletFilter} ORDER BY starts_on DESC,created_at DESC`,...params).map(contract => ({
    ...contract,
    items: db.all(`SELECT i.service,i.quantity * ? AS quantity,
      (SELECT count(*) FROM pieces x WHERE x.company_id=? AND x.contract_id=? AND x.service=i.service AND x.status='DELIVERED') AS used,
      (SELECT count(*) FROM pieces x WHERE x.company_id=? AND x.contract_id=? AND x.service=i.service AND x.status NOT IN ('DELIVERED','CANCELLED')) AS reserved
      FROM plan_items i WHERE i.plan_id=? ORDER BY i.service`,
    contract.units,companyId,contract.id,companyId,contract.id,contract.plan_id),
  }));
}
export function activateContract(db, actor, company, data) {
  requireAgency(actor);
  requireThat(company.approved,'Verifica el negocio antes de activar un plan.',409);
  const plan = getPlan(db,data.plan);
  requireThat(!walletLine(plan),'Solo el dueño puede activar una suscripción de Wallet.',409);
  requireThat(!plan.campaign,'Las promociones requieren una propuesta aceptada desde Paquetes y servicios.',409);
  const startsOn = dateOnly(data.startsOn,'la fecha de inicio');
  const endsBefore = plan.term === 'MONTHLY' ? nextMonth(startsOn) : dateOnly(data.endsBefore,'la fecha de fin exclusiva');
  requireThat(endsBefore > startsOn,'La fecha de fin debe ser posterior al inicio.');
  const origin = data.requestId || null;
  return db.transaction(() => {
    let amount = plan.price_minor ?? money(data.agreed,true);
    if (origin) {
      const request = db.get("SELECT * FROM requests WHERE id=? AND company_id=? AND type='PLAN'",origin,company.id);
      requireThat(request?.plan_id === plan.id && request.status === 'APPROVED',
        'La solicitud de este plan debe estar aprobada.',409);
      const accepted = db.get("SELECT amount_minor FROM quotes WHERE company_id=? AND request_id=? AND status='ACCEPTED'",company.id,origin);
      amount = accepted?.amount_minor ?? amount;
      requireThat(plan.price_minor !== null || accepted,'El cliente debe aceptar la cotización para un plan a medida.',409);
    } else {
      requireThat(plan.published,'Selecciona un plan publicado.',409);
    }
    requireThat(amount !== null,'Registra el monto acordado.');
    checkSelection(db,{company_id:company.id,start_when:'TODAY'},[{...plan,units:1,starts_on:startsOn,ends_before:endsBefore,campaign:true}]);
    const overlap = db.get(`SELECT id FROM contracts WHERE company_id=? AND plan_id=? AND cancelled_at IS NULL
      AND starts_on<? AND ends_before>?`,company.id,plan.id,endsBefore,startsOn);
    requireThat(!overlap,'Ya existe un período superpuesto para este plan.',409);
    const id = uuid();
    db.run(`INSERT INTO contracts(id,company_id,plan_id,origin_request_id,agreed_minor,starts_on,ends_before,created_at)
      VALUES(?,?,?,?,?,?,?,?)`,id,company.id,plan.id,origin,amount,startsOn,endsBefore,now());
    if (origin) db.run("UPDATE requests SET status='DELIVERED',revision=revision+1 WHERE id=?",origin);
    event(db,actor,company.id,'CONTRACT',id,'PLAN_ACTIVADO',plan.name);
    return id;
  });
}
export function cancelContract(db, actor, company, id, reason) {
  requireAgency(actor);
  const note = text(reason,'motivo',5,500);
  db.transaction(() => {
    const current=db.get('SELECT schedule_id FROM contracts WHERE id=? AND company_id=?',id,company.id);
    if(current?.schedule_id){
      stopSchedule(db,company.id,current.schedule_id,localDay());
      event(db,actor,company.id,'CONTRACT',id,'RENOVACIÓN_DETENIDA',note);
      return;
    }
    requireThat(db.run('UPDATE contracts SET cancelled_at=? WHERE id=? AND company_id=? AND cancelled_at IS NULL',
      now(),id,company.id).changes === 1,'El período ya no está activo.',409);
    if(db.get("SELECT 1 FROM contracts c JOIN plans p ON p.id=c.plan_id WHERE c.id=? AND p.wallet<>'NONE'",id))dirtyCalendar(db,company.id);
    event(db,actor,company.id,'CONTRACT',id,'PLAN_CANCELADO',note);
  });
}
export function checkCapacity(db, companyId, contractId, service) {
  const today = localDay();
  const item = db.get(`SELECT i.quantity * c.units AS quantity FROM contracts c JOIN plan_items i ON i.plan_id=c.plan_id AND i.service=?
    WHERE c.id=? AND c.company_id=? AND c.cancelled_at IS NULL AND c.starts_on<=? AND c.ends_before>?`,
  service,contractId,companyId,today,today);
  requireThat(item, 'El contrato vigente no incluye este servicio.',409);
  const occupied = db.get(`SELECT count(*) AS total FROM pieces WHERE company_id=? AND contract_id=?
    AND service=? AND status<>'CANCELLED'`,companyId,contractId,service).total;
  requireThat(occupied < item.quantity,'Ya se usaron o reservaron todos los cupos de este servicio.',409);
}
export function currentQuote(db, companyId, requestId) {
  return db.get("SELECT * FROM quotes WHERE company_id=? AND request_id=? AND status<>'SUPERSEDED'",companyId,requestId);
}
export function offerQuote(db, actor, company, request, input) {
  requireAgency(actor);
  checkRevision(request,input);
  requireThat(request.type !== 'COURTESY','El video de bienvenida es de cortesía.',409);
  const amount = money(input.amount);
  const terms = text(input.terms,'condiciones de la cotización',5,4000);
  db.transaction(() => {
    requireThat(['NEW','REVIEW','QUOTED'].includes(request.status), 'La solicitud ya tiene otro estado.',409);
    const previous = currentQuote(db,company.id,request.id);
    requireThat(!previous || previous.status === 'OFFERED', 'La cotización ya fue aceptada.',409);
    if (previous) db.run("UPDATE quotes SET status='SUPERSEDED' WHERE id=?",previous.id);
    const id = uuid();
    db.run(`INSERT INTO quotes(id,company_id,request_id,revision,amount_minor,terms,status,created_at)
      VALUES(?,?,?,?,?,?,'OFFERED',?)`,id,company.id,request.id,(previous?.revision ?? 0)+1,amount,terms,now());
    db.run("UPDATE requests SET status='QUOTED',revision=revision+1 WHERE id=?",request.id);
    event(db,actor,company.id,'REQUEST',request.id,'COTIZACIÓN_ENVIADA','',request.channel);
  });
}
export function acceptQuote(db, actor, company, request, quoteId) {
  requireOwner(actor);
  db.transaction(() => {
    requireThat(request.status === 'QUOTED' &&
      db.run("UPDATE quotes SET status='ACCEPTED' WHERE id=? AND company_id=? AND request_id=? AND status='OFFERED'",
        quoteId || '',company.id,request.id).changes === 1,
    'La cotización cambió. Revisa la última versión antes de aceptar.',409);
    db.run("UPDATE requests SET status='APPROVED',revision=revision+1 WHERE id=?",request.id);
    event(db,actor,company.id,'REQUEST',request.id,'COTIZACIÓN_ACEPTADA','',request.channel);
  });
}

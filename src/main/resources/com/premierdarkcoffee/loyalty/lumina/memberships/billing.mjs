import { requireAgency, requireOwner } from '../access/accounts.mjs';
import { choice, dateOnly, event, integer, localDay, money, nextMonth, now, requireThat, services, text, uuid } from '../shared/domain.mjs';

export function listPlans(db, includeHidden = false) {
  return db.all('SELECT * FROM plans WHERE published=1 OR ?=1 ORDER BY term,name,created_at DESC', Number(includeHidden))
    .map(plan => ({ ...plan, items: db.all('SELECT service,quantity FROM plan_items WHERE plan_id=? ORDER BY service',plan.id) }));
}
export function getPlan(db, id) {
  const plan = db.get('SELECT * FROM plans WHERE id=?',id || '');
  requireThat(plan, 'Ese plan no está disponible.', 404);
  return { ...plan, items: db.all('SELECT service,quantity FROM plan_items WHERE plan_id=? ORDER BY service',id) };
}
export function createPlan(db, actor, data) {
  requireAgency(actor);
  const name = text(data.name, 'nombre del plan', 2, 100);
  const term = choice(data.term, ['MONTHLY','ONE_OFF'], 'tipo de plan');
  const wallet = choice(data.wallet, ['NONE','INCLUDED','GIFT'], 'inclusión de Wallet');
  const price = money(data.price,true);
  const description = text(data.description || '', 'descripción', 0, 1200);
  const items = Object.keys(services).filter(key => key !== 'WALLET')
    .map(key => [key, integer(data[key] || '0',services[key],{ max:100 })]).filter(([,n]) => n > 0);
  if (wallet !== 'NONE') items.push(['WALLET',1]);
  requireThat(items.length, 'Agrega al menos un servicio al plan.');
  return db.transaction(() => {
    const id = uuid();
    db.run('INSERT INTO plans(id,name,term,price_minor,wallet,description,created_at) VALUES(?,?,?,?,?,?,?)',
      id,name,term,price,wallet,description,now());
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
export function contractsFor(db, companyId) {
  return db.all(`SELECT c.*,p.name,p.term,p.wallet FROM contracts c JOIN plans p ON p.id=c.plan_id
    WHERE c.company_id=? ORDER BY starts_on DESC,created_at DESC`,companyId).map(contract => ({
    ...contract,
    items: db.all(`SELECT i.service,i.quantity,
      (SELECT count(*) FROM pieces x WHERE x.company_id=? AND x.contract_id=? AND x.service=i.service AND x.status='DELIVERED') AS used,
      (SELECT count(*) FROM pieces x WHERE x.company_id=? AND x.contract_id=? AND x.service=i.service AND x.status NOT IN ('DELIVERED','CANCELLED')) AS reserved
      FROM plan_items i WHERE i.plan_id=? ORDER BY i.service`,
    companyId,contract.id,companyId,contract.id,contract.plan_id),
  }));
}
export function activateContract(db, actor, company, data) {
  requireAgency(actor);
  requireThat(company.approved,'Verifica el negocio antes de activar un plan.',409);
  const plan = getPlan(db,data.plan);
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
    requireThat(db.run('UPDATE contracts SET cancelled_at=? WHERE id=? AND company_id=? AND cancelled_at IS NULL',
      now(),id,company.id).changes === 1,'El período ya no está activo.',409);
    event(db,actor,company.id,'CONTRACT',id,'PLAN_CANCELADO',note);
  });
}
export function checkCapacity(db, companyId, contractId, service) {
  const today = localDay();
  const item = db.get(`SELECT i.quantity FROM contracts c JOIN plan_items i ON i.plan_id=c.plan_id AND i.service=?
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

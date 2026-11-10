import { can, requireAccess, requireAgency, requireOwner } from '../accounts/accounts.mjs';
import { checkCapacity, getPlan } from '../billing/billing.mjs';
import { channels, choice, event, formats, httpsUrl, integer, localInstant, now, requireThat, socialChannels, text, uuid } from '../domain.mjs';

const productionStates = ['APPROVED','SCHEDULED','PRODUCTION'];
const finalStates = ['DELIVERED','CANCELLED'];

export function visibleRequests(db, actor, companyId, channel, page = 0) {
  const scopes = Object.keys(channels).filter(key => can(actor,key));
  if (actor.kind !== 'COLLABORATOR') scopes.push('GENERAL');
  if (channel) requireThat(scopes.includes(channel),'Tu acceso no incluye ese canal.',403);
  const allowed = channel ? [channel] : scopes;
  if (!allowed.length) return { rows: [], more: false };
  const placeholders = allowed.map(() => '?').join(',');
  const rows = db.all(`SELECT r.*,
    (SELECT count(*) FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='DELIVERED') AS delivered
    FROM requests r WHERE r.company_id=? AND r.channel IN (${placeholders})
    AND (r.type NOT IN ('PLAN','QUOTE','COURTESY') OR ?=0)
    ORDER BY r.created_at DESC,r.id LIMIT 31 OFFSET ?`,companyId,...allowed,Number(actor.kind === 'COLLABORATOR'),page * 30);
  return { rows: rows.slice(0,30), more: rows.length > 30 };
}
export function requestCounts(db, actor, companyId) {
  const groups = db.all(`SELECT channel,type,status,count(*) AS count,sum(quantity) AS pieces
    FROM requests WHERE company_id=? GROUP BY channel,type,status`,companyId);
  return groups.filter(row => can(actor,row.channel) &&
    (actor.kind !== 'COLLABORATOR' || !['PLAN','QUOTE','COURTESY'].includes(row.type)));
}
export function getRequest(db, actor, companyId, id) {
  const request = db.get('SELECT * FROM requests WHERE company_id=? AND id=?',companyId,id || '');
  requireThat(request && can(actor,request.channel) &&
    (actor.kind !== 'COLLABORATOR' || !['PLAN','QUOTE','COURTESY'].includes(request.type)),
  'Solicitud no encontrada.',404);
  return request;
}
export function createRequest(db, actor, company, data) {
  const type = choice(data.type,['CONTENT','QUOTE','VISIT','COURTESY','PLAN'],'tipo de solicitud');
  if (['COURTESY','PLAN'].includes(type)) requireOwner(actor);
  if (type === 'QUOTE') requireThat(actor.kind !== 'COLLABORATOR','Solo el dueño puede solicitar cotizaciones.',403);
  const channel = type === 'PLAN' ? 'GENERAL' : choice(data.channel,Object.keys(channels),'canal');
  const service = type === 'PLAN' ? 'PLAN' : choice(data.service,formats[channel],'servicio del canal');
  requireAccess(actor,channel,'REQUEST');
  if (type === 'COURTESY') {
    requireThat(socialChannels.includes(channel) && ['VIDEO','REEL','SHORT'].includes(service),
      'Elige un formato de video para la cortesía.');
  }
  if (type === 'VISIT') requireThat(socialChannels.includes(channel),'Elige un canal de video para la visita.');
  const plan = type === 'PLAN' ? getPlan(db,data.plan) : null;
  requireThat(!plan || plan.published,'El plan ya no se ofrece.',409);
  const quantity = ['COURTESY','PLAN','VISIT'].includes(type) ? 1 :
    integer(data.quantity,'cantidad',{ min:1,max:100 });
  const title = plan ? `Contratar ${plan.name}` : text(data.title,'título',2,150);
  const brief = text(data.brief || '', 'indicaciones',0,4000);
  const preferred = type === 'VISIT' ? localInstant(data.preferred,'horario sugerido',true) : null;
  return db.transaction(() => {
    if (type === 'COURTESY') {
      const prior = db.get("SELECT id FROM requests WHERE company_id=? AND type='COURTESY'",company.id);
      if (prior) return prior.id;
    }
    const id = uuid();
    db.run(`INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,plan_id,requested_at,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,'NEW',?,?,?)`,id,company.id,actor.id,type,channel,service,quantity,title,brief,plan?.id ?? null,preferred,now());
    event(db,actor,company.id,'REQUEST',id,'SOLICITUD_RECIBIDA',title,channel);
    return id;
  });
}
export function updateRequest(db, actor, company, request, data) {
  requireAgency(actor);
  const target = choice(data.status,['REVIEW','APPROVED','CANCELLED','NEW'],'estado');
  const allowed = {
    NEW:['REVIEW','APPROVED','CANCELLED'], REVIEW:['APPROVED','CANCELLED'],
    QUOTED:['CANCELLED'], APPROVED:['CANCELLED'], SCHEDULED:['CANCELLED'],
    PRODUCTION:['CANCELLED'], CANCELLED:['NEW'], DELIVERED:[],
  };
  const note = text(data.notes || '','observaciones',target === 'CANCELLED' ? 5 : 0,1000);
  requireThat(allowed[request.status].includes(target),'Ese cambio de estado no está disponible.',409);
  if (target === 'APPROVED') requireThat(company.approved,'Verifica primero el negocio.',409);
  if (target === 'NEW') requireThat(request.type === 'COURTESY','Solo la cortesía puede reabrirse desde aquí.',409);
  if (request.type === 'PLAN' && target === 'APPROVED') {
    requireThat(getPlan(db,request.plan_id).price_minor !== null,'Envía una cotización para este plan a medida.',409);
  }
  db.transaction(() => {
    if (target === 'CANCELLED') {
      requireThat(!db.get("SELECT id FROM pieces WHERE request_id=? AND status='DELIVERED'",request.id),
        'Ya hay entregas. Conserva la solicitud y gestiona las piezas pendientes.',409);
      db.run("UPDATE pieces SET status='CANCELLED',revision=revision+1 WHERE request_id=? AND status<>'CANCELLED'",request.id);
      db.run("UPDATE visits SET status='CANCELLED',revision=revision+1 WHERE request_id=? AND status='SCHEDULED'",request.id);
      db.run("UPDATE quotes SET status='SUPERSEDED' WHERE request_id=? AND status='OFFERED'",request.id);
    }
    db.run('UPDATE requests SET status=?,revision=revision+1 WHERE id=?',target,request.id);
    event(db,actor,company.id,'REQUEST',request.id,'ESTADO_' + target,note,request.channel);
  });
}
export function addVisit(db, actor, company, request, data) {
  requireAgency(actor);
  requireThat(company.approved && request.type !== 'PLAN' && !finalStates.includes(request.status),
    'La solicitud no está disponible para programar visitas.',409);
  requireThat(request.status !== 'QUOTED','Espera la aceptación de la cotización.',409);
  const starts = localInstant(data.starts,'inicio de la visita');
  const place = text(data.place,'lugar',2,260);
  const note = text(data.notes || '', 'observaciones',0,1500);
  db.transaction(() => {
    requireThat(!db.get("SELECT id FROM visits WHERE request_id=? AND status='SCHEDULED' AND starts_at=?",request.id,starts),
      'Ya existe una visita de esta solicitud en ese horario.',409);
    const id = uuid();
    db.run(`INSERT INTO visits(id,company_id,request_id,starts_at,place,notes,status,created_at)
      VALUES(?,?,?,?,?,?,'SCHEDULED',?)`,id,company.id,request.id,starts,place,note,now());
    if (!['PRODUCTION','SCHEDULED'].includes(request.status)) {
      db.run("UPDATE requests SET status='SCHEDULED',revision=revision+1 WHERE id=?",request.id);
    }
    event(db,actor,company.id,'REQUEST',request.id,'VISITA_PROGRAMADA',place,request.channel);
  });
}
export function finishVisit(db, actor, company, request, data) {
  requireAgency(actor);
  const status = choice(data.status,['DONE','CANCELLED'],'estado de la visita');
  const visit = db.get("SELECT * FROM visits WHERE id=? AND company_id=? AND request_id=? AND status='SCHEDULED'",
    data.visit || '',company.id,request.id);
  requireThat(visit,'La visita ya fue cerrada.',409);
  const recorded = status === 'DONE' ? localInstant(data.recorded,'hora de grabación o visita') : null;
  requireThat(!recorded || recorded <= now(),'La fecha real de visita no puede estar en el futuro.');
  const note = text(data.notes || '', 'observaciones',status === 'CANCELLED' ? 5 : 0,1500);
  db.transaction(() => {
    db.run('UPDATE visits SET status=?,recorded_at=?,revision=revision+1 WHERE id=?',status,recorded,visit.id);
    event(db,actor,company.id,'REQUEST',request.id,status === 'DONE' ? 'VISITA_REALIZADA' : 'VISITA_CANCELADA',note,request.channel);
    if (status === 'DONE' && request.type === 'VISIT' && !db.get("SELECT id FROM visits WHERE request_id=? AND status='SCHEDULED'",request.id)) {
      db.run("UPDATE requests SET status='DELIVERED',revision=revision+1 WHERE id=?",request.id);
    }
  });
}
export function addPiece(db, actor, company, request, data) {
  requireAgency(actor);
  requireThat(company.approved && !['PLAN','VISIT'].includes(request.type) && productionStates.includes(request.status),
    'Aprueba la solicitud antes de crear entregables.',409);
  const title = text(data.title,'título de la pieza',2,150);
  const contract = data.contract || null;
  requireThat(request.type !== 'COURTESY' || !contract,'La cortesía se gestiona por separado de los cupos del plan.');
  db.transaction(() => {
    const existing = db.get("SELECT count(*) AS total FROM pieces WHERE request_id=? AND status<>'CANCELLED'",request.id).total;
    requireThat(existing < request.quantity,'Ya se crearon todos los entregables solicitados.',409);
    if (contract) checkCapacity(db,company.id,contract,request.service);
    const id = uuid();
    db.run(`INSERT INTO pieces(id,company_id,request_id,contract_id,title,service,status,observations,created_at)
      VALUES(?,?,?,?,?,?,'PRODUCTION','',?)`,id,company.id,request.id,contract,title,request.service,now());
    db.run("UPDATE requests SET status='PRODUCTION',revision=revision+1 WHERE id=?",request.id);
    event(db,actor,company.id,'REQUEST',request.id,'PIEZA_CREADA',title,request.channel);
  });
}
export function getPiece(db, companyId, requestId, id) {
  const piece = db.get('SELECT * FROM pieces WHERE company_id=? AND request_id=? AND id=?',companyId,requestId,id || '');
  requireThat(piece,'Entregable no encontrado.',404);
  return piece;
}
export function editPiece(db, actor, company, request, piece, data) {
  requireAgency(actor);
  requireThat(!finalStates.includes(piece.status) && !finalStates.includes(request.status),
    'Este entregable ya fue cerrado.',409);
  requireThat(String(piece.revision) === data.revision,'El entregable cambió. Recarga el formulario.',409);
  const states = piece.status === 'APPROVED' ? ['APPROVED','DELIVERED','CANCELLED'] : ['PRODUCTION','REVIEW','CANCELLED'];
  const status = choice(data.status,states,'estado de la pieza');
  const recorded = localInstant(data.recorded,'fecha de grabación',true);
  requireThat(!recorded || recorded <= now(),'La grabación registrada no puede estar en el futuro.');
  const observations = text(data.notes || '', 'observaciones',status === 'CANCELLED' ? 5 : 0,2000);
  if (status === 'DELIVERED') {
    requireThat(piece.status === 'APPROVED','El cliente debe aprobar la pieza antes de entregarla.',409);
  }
  db.transaction(() => {
    db.run('UPDATE pieces SET status=?,recorded_at=?,observations=?,revision=revision+1 WHERE id=?',
      status,recorded,observations,piece.id);
    event(db,actor,company.id,'REQUEST',request.id,'PIEZA_' + status,piece.title,request.channel);
    if (status === 'DELIVERED') {
      const done = db.get("SELECT count(*) AS total FROM pieces WHERE request_id=? AND status='DELIVERED'",request.id).total;
      if (done === request.quantity) db.run("UPDATE requests SET status='DELIVERED',revision=revision+1 WHERE id=?",request.id);
    }
  });
}
export function reviewPiece(db, actor, company, request, piece, data) {
  requireThat(actor.kind !== 'AGENCY','La aprobación corresponde al cliente.',403);
  requireAccess(actor,request.channel,'APPROVE');
  requireThat(piece.status === 'REVIEW' && request.status === 'PRODUCTION' && String(piece.revision) === data.revision,
    'La pieza cambió. Revisa su versión vigente.',409);
  const status = choice(data.status,['APPROVED','PRODUCTION'],'decisión');
  const note = text(data.notes || '','observaciones',status === 'PRODUCTION' ? 5 : 0,1000);
  db.transaction(() => {
    db.run('UPDATE pieces SET status=?,revision=revision+1 WHERE id=?',status,piece.id);
    event(db,actor,company.id,'REQUEST',request.id,status === 'APPROVED' ? 'PIEZA_APROBADA' : 'CAMBIOS_SOLICITADOS',note || piece.title,request.channel);
  });
}
export function addEvidence(db, actor, company, request, piece, data) {
  requireAgency(actor);
  requireThat(piece.status !== 'CANCELLED','La pieza está cancelada.',409);
  const label = text(data.label,'nombre de la evidencia',2,100);
  const url = httpsUrl(data.url);
  db.transaction(() => {
    db.run('INSERT INTO evidence VALUES(?,?,?,?,?,?)',uuid(),company.id,piece.id,label,url,now());
    event(db,actor,company.id,'REQUEST',request.id,'EVIDENCIA_ADJUNTADA',label,request.channel);
  });
}
export function addPublication(db, actor, company, request, piece, data) {
  requireAgency(actor);
  requireThat(piece.status === 'APPROVED' || piece.status === 'DELIVERED',
    'Registra la publicación después de la aprobación.',409);
  const channel = choice(data.channel,socialChannels,'red social');
  const url = httpsUrl(data.url);
  const published = localInstant(data.published,'fecha de publicación');
  requireThat(published <= now(),'La publicación registrada no puede estar en el futuro.');
  db.transaction(() => {
    requireThat(!db.get('SELECT id FROM publications WHERE company_id=? AND channel=? AND url=?',company.id,channel,url),
      'Esa publicación ya está registrada para el negocio.',409);
    db.run('INSERT INTO publications VALUES(?,?,?,?,?,?)',uuid(),company.id,piece.id,channel,url,published);
    event(db,actor,company.id,'REQUEST',request.id,'PUBLICACIÓN_REGISTRADA',channels[channel],request.channel);
  });
}

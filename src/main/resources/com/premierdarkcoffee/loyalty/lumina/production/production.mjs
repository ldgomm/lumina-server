import { checkRevision } from '../shared/revision.mjs';
import { requestBusinessSql } from '../businesses/operation-state.mjs';
import { requireOperating } from '../businesses/control.mjs';
import { requestProgressSql, requestStages } from './request-progress.mjs';
import { requireService } from '../businesses/services.mjs';
import { requestPhone } from '../shared/contact.mjs';
import { compatibleContentQuota } from '../content/service-options.mjs';
import { canRequest, platformTargets, requestAccessSql } from '../access/content-policy.mjs';
import { can, requireAccess, requireAgency, requireOwner, requireBusinessActor } from '../access/accounts.mjs';
import { inTrial, trialMessage, walletOnly, walletLine } from '../memberships/trial.mjs';
import { checkCapacity, getPlan } from '../memberships/billing.mjs';
import { channels, areas, choice, event, formats, httpsUrl, integer, isId, localInstant, now, requireThat, socialChannels, text, uuid } from '../shared/domain.mjs';

const productionStates = ['APPROVED','SCHEDULED','PRODUCTION'];
const finalStates = ['DELIVERED','CANCELLED'];

export function visibleRequests(db, actor, companyId, channel, page = 0, {q='',state='',view='all'} = {}) {
  if (channel) requireThat(Object.hasOwn(channels,channel) && can(actor,channel),'Tu acceso no incluye esa área.',403);
  const policy=requestAccessSql(actor);
  const area=socialChannels.includes(channel)?'SOCIAL':channel;
  requireThat(!state||['NEW','REVIEW','QUOTED','APPROVED','SCHEDULED','PRODUCTION','DELIVERED','CANCELLED'].includes(state),'Estado inválido.');
  requireThat(Object.hasOwn(requestStages,view),'Vista de solicitudes no disponible.');
  const stage=requestStages;
  const filter="(?='' OR r.channel=?) AND (?='' OR r.status=?) AND (?='' OR instr(lower(r.title||' '||r.brief),lower(?))>0)";
  const values=[area||'',area||'',state,state,q,q];
  const base=`FROM requests r WHERE r.company_id=? AND ${policy.sql}`;
  const counts=Object.fromEntries(Object.entries(stage).map(([key,sql])=>[key,db.get(`SELECT count(*) n ${base} AND ${sql} AND (?='' OR r.channel=?) AND (?='' OR instr(lower(r.title||' '||r.brief),lower(?))>0)`,companyId,...policy.params,area||'',area||'',q,q).n]));
  const total=db.get(`SELECT count(*) n ${base} AND ${filter} AND ${stage[view]}`,companyId,...policy.params,...values).n;
  const currentPage=Math.min(page,Math.max(0,Math.ceil(total/30)-1));
  const rows=db.all(`SELECT r.*,${requestBusinessSql},${requestProgressSql}
    FROM requests r WHERE r.company_id=? AND ${policy.sql} AND ${filter} AND ${stage[view]}
    ORDER BY r.created_at DESC,r.id LIMIT 31 OFFSET ?`,companyId,...policy.params,...values,currentPage*30);
  return {rows:rows.slice(0,30).map(row=>({...row,platforms:platformTargets(db,row)})),more:rows.length>30,total,counts,page:currentPage};
}
export function requestCounts(db, actor, companyId) {
  const policy=requestAccessSql(actor);
  return db.all(`SELECT channel,type,status,count(*) AS count,sum(quantity) AS pieces FROM requests r WHERE company_id=? AND ${policy.sql} GROUP BY channel,type,status`,companyId,...policy.params);
}
export function getRequest(db, actor, companyId, id) {
  const request=db.get(`SELECT r.*,${requestBusinessSql} FROM requests r WHERE company_id=? AND id=?`,companyId,id||'');
  if(request)request.platforms=platformTargets(db,request);
  requireThat(request && canRequest(actor,request),'Solicitud no encontrada.',404);
  return request;
}
export function createRequest(db, actor, company, data) {
  requireOperating(db,company.id);
  requireBusinessActor(actor,company);
  const type = choice(data.type,['CONTENT','QUOTE','VISIT','COURTESY','PLAN'],'tipo de solicitud');
  if (['COURTESY','PLAN'].includes(type)) requireOwner(actor);
  if (type === 'QUOTE') requireThat(actor.kind !== 'COLLABORATOR','Solo el dueño puede solicitar cotizaciones.',403);
  const original=type==='PLAN'?'GENERAL':choice(data.channel,Object.keys(channels),'área');
  const channel=socialChannels.includes(original)?'SOCIAL':original;
  if(type!=='COURTESY') {
    if(Object.hasOwn(areas,channel))requireService(db,company.id,channel);
    if(socialChannels.includes(original))requireAccess(actor,original,'REQUEST');
    requireAccess(actor,channel,'REQUEST');
  }
  const service = type === 'PLAN' ? 'PLAN' : choice(data.service,formats[channel],'servicio del canal');
  if(type==='COURTESY')requireThat(channel==='SOCIAL' && ['VIDEO','REEL','SHORT'].includes(service),
    'Elige un formato de video para la cortesía.');
  if (type === 'VISIT') requireThat(channel==='SOCIAL','Elige un canal de video para la visita.');
  const plan = type === 'PLAN' ? getPlan(db,data.plan) : null;
  requireThat(!plan || plan.published,'El plan ya no se ofrece.',409);
  if(plan && inTrial() && walletLine(plan))requireThat(false,walletOnly(plan)?trialMessage:'Elige los otros servicios desde Paquetes y servicios. Wallet está en prueba gratuita.',409);
  requireThat(!plan?.campaign,'Solicita la promoción desde Paquetes y servicios para revisar sus condiciones.',409);
  const quantity = ['COURTESY','PLAN','VISIT'].includes(type) ? 1 :
    integer(data.quantity,'cantidad',{ min:1,max:100 });
  const title = plan ? `Contratar ${plan.name}` : text(data.title,'título',2,150);
  const brief = text(data.brief || '', 'indicaciones',0,4000);
  const phone=requestPhone(data,company);
  const preferred = type === 'VISIT' ? localInstant(data.preferred,'horario sugerido',true) : null;
  const requestKey = data.request_key || uuid();
  requireThat(isId(requestKey),'Vuelve a abrir el formulario para enviar esta solicitud.');
  return db.transaction(() => {
    // A retry of the same form must not create a second job or audit event.
    // The existing primary key makes this durable without changing the schema.
    const existing = db.get('SELECT * FROM requests WHERE id=?',requestKey);
    if (existing) {
      const expected = {company_id:company.id,owner_id:actor.id,type,channel,service,quantity,title,brief,
        contact_phone:phone,requested_at:preferred,plan_id:plan?.id ?? null};
      requireThat(Object.entries(expected).every(([key,value])=>existing[key]===value),
        'Este formulario ya fue enviado. Abre una nueva solicitud para pedir otro trabajo.',409);
      return existing.id;
    }
    if (type === 'COURTESY') {
      const prior=db.get("SELECT id,status,revision FROM requests WHERE company_id=? AND type='COURTESY'",company.id);
      if(prior) {
        if(prior.status==='CANCELLED' && data.courtesy_revision===String(prior.revision)) {
          db.run("UPDATE requests SET title=?,brief=?,contact_phone=?,status='NEW',revision=revision+1 WHERE id=?",title,brief,phone,prior.id);
          event(db,actor,company.id,'REQUEST',prior.id,'CORTESIA_SOLICITADA_DE_NUEVO',title,channel);
        }
        return prior.id;
      }
      requireThat(!db.get('SELECT company_id FROM courtesy_deliveries WHERE company_id=?',company.id),
        'Lúmina ya registró la entrega de tu video de cortesía.',409);
    }
    const id = requestKey;
    db.run(`INSERT INTO requests(id,company_id,owner_id,type,channel,service,quantity,title,brief,status,plan_id,requested_at,created_at,contact_phone)
      VALUES(?,?,?,?,?,?,?,?,?,'NEW',?,?,?,?)`,id,company.id,actor.id,type,channel,service,quantity,title,brief,plan?.id ?? null,preferred,now(),phone);
    event(db,actor,company.id,'REQUEST',id,'SOLICITUD_RECIBIDA',title,channel);
    return id;
  });
}
export function updateRequest(db, actor, company, request, data) {
  requireOperating(db,company.id);
  requireAgency(actor);
  checkRevision(request,data);
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
  requireOperating(db,company.id);
  requireAgency(actor);
  checkRevision(request,data);
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
    db.run('UPDATE requests SET status=?,revision=revision+1 WHERE id=?',
      request.status==='PRODUCTION'?'PRODUCTION':'SCHEDULED',request.id);
    event(db,actor,company.id,'REQUEST',request.id,'VISITA_PROGRAMADA',place,request.channel);
  });
}
export function finishVisit(db, actor, company, request, data) {
  requireOperating(db,company.id);
  requireAgency(actor);
  const status = choice(data.status,['DONE','CANCELLED'],'estado de la visita');
  const visit = db.get("SELECT * FROM visits WHERE id=? AND company_id=? AND request_id=? AND status='SCHEDULED'",
    data.visit || '',company.id,request.id);
  requireThat(visit,'La visita ya fue cerrada.',409);
  checkRevision(visit,data);
  const recorded = status === 'DONE' ? localInstant(data.recorded,'hora de grabación o visita') : null;
  requireThat(!recorded || recorded <= now(),'La fecha real de visita no puede estar en el futuro.');
  const note = text(data.notes || '', 'observaciones',status === 'CANCELLED' ? 5 : 0,1500);
  db.transaction(() => {
    const notes=note?[visit.notes,'Resultado: '+note].filter(Boolean).join('\n\n'):visit.notes;
    db.run('UPDATE visits SET status=?,recorded_at=?,notes=?,revision=revision+1 WHERE id=?',status,recorded,notes,visit.id);
    event(db,actor,company.id,'REQUEST',request.id,status === 'DONE' ? 'VISITA_REALIZADA' : 'VISITA_CANCELADA',note,request.channel);
    if (status === 'DONE' && request.type === 'VISIT' && !db.get("SELECT id FROM visits WHERE request_id=? AND status='SCHEDULED'",request.id)) {
      db.run("UPDATE requests SET status='DELIVERED',revision=revision+1 WHERE id=?",request.id);
    }
  });
}
export function addPiece(db, actor, company, request, data) {
  requireOperating(db,company.id);
  requireAgency(actor);
  checkRevision(request,data);
  requireThat(company.approved && !['PLAN','VISIT'].includes(request.type) && productionStates.includes(request.status),
    'Aprueba la solicitud antes de crear entregables.',409);
  const title = text(data.title,'título de la pieza',2,150);
  const allocation = (data.allocation || '').split(':');
  const contract = allocation[0] || data.contract || null;
  const service = allocation[1] || request.service;
  requireThat(!allocation[2] && (request.channel==='SOCIAL' ? compatibleContentQuota(request.service,service) : service===request.service),'El cupo no corresponde al contenido solicitado.',400);
  requireThat(request.type !== 'COURTESY' || !contract,'La cortesía se gestiona por separado de los cupos del plan.');
  db.transaction(() => {
    const existing = db.get("SELECT count(*) AS total FROM pieces WHERE request_id=? AND status<>'CANCELLED'",request.id).total;
    requireThat(existing < request.quantity,'Ya se crearon todos los entregables solicitados.',409);
    if (contract) checkCapacity(db,company.id,contract,service);
    const id = uuid();
    db.run(`INSERT INTO pieces(id,company_id,request_id,contract_id,title,service,status,observations,created_at)
      VALUES(?,?,?,?,?,?,'PRODUCTION','',?)`,id,company.id,request.id,contract,title,service,now());
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
  requireOperating(db,company.id);
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
  requireOperating(db,company.id);
  requireThat(actor.kind !== 'AGENCY','La aprobación corresponde al cliente.',403);
  requireThat(canRequest(actor,request,'APPROVE'),'Necesitas permiso de aprobación de Contenido para redes para revisar esta pieza común.',403);
  requireThat(piece.status === 'REVIEW' && request.status === 'PRODUCTION' && String(piece.revision) === data.revision,
    'La pieza cambió. Revisa su versión vigente.',409);
  const status = choice(data.status,['APPROVED','PRODUCTION'],'decisión');
  const note = text(data.notes || '','observaciones',status === 'PRODUCTION' ? 5 : 0,1000);
  db.transaction(() => {
    const updated = db.run(`UPDATE pieces SET status=?,revision=revision+1
      WHERE company_id=? AND request_id=? AND id=? AND revision=? AND status='REVIEW'
      AND EXISTS(SELECT 1 FROM requests WHERE company_id=? AND id=? AND status='PRODUCTION')`,
      status,company.id,request.id,piece.id,piece.revision,company.id,request.id);
    requireThat(updated.changes === 1,'La pieza cambió. Revisa su versión vigente.',409);
    db.run(`INSERT INTO piece_reviews(company_id,piece_id,revision,decision,note,actor_id,actor_name,reviewed_at)
      VALUES(?,?,?,?,?,?,?,?)`,company.id,piece.id,piece.revision,status,note,actor.id,actor.name,now());
    event(db,actor,company.id,'REQUEST',request.id,status === 'APPROVED' ? 'PIEZA_APROBADA' : 'CAMBIOS_SOLICITADOS',note ? piece.title+' · '+note : piece.title,request.channel);
  });
}
export function addEvidence(db, actor, company, request, piece, data) {
  requireOperating(db,company.id);
  requireAgency(actor);
  requireThat(piece.status !== 'CANCELLED' && request.status !== 'CANCELLED','La pieza está cancelada.',409);
  checkRevision(piece,data);
  const label = text(data.label,'nombre de la evidencia',2,100);
  const url = httpsUrl(data.url);
  db.transaction(() => {
    requireThat(!db.get('SELECT id FROM evidence WHERE company_id=? AND piece_id=? AND url=?',company.id,piece.id,url),
      'Este enlace ya está adjunto al entregable.',409);
    db.run('INSERT INTO evidence VALUES(?,?,?,?,?,?)',uuid(),company.id,piece.id,label,url,now());
    // A review opened before a new attachment cannot approve the changed version.
    db.run("UPDATE pieces SET revision=revision+1,status=CASE WHEN status='APPROVED' THEN 'REVIEW' ELSE status END WHERE id=?",piece.id);
    event(db,actor,company.id,'REQUEST',request.id,'EVIDENCIA_ADJUNTADA',label,request.channel);
  });
}
export function addPublication(db, actor, company, request, piece, data) {
  requireOperating(db,company.id);
  requireAgency(actor);
  requireThat(piece.status === 'APPROVED' || piece.status === 'DELIVERED',
    'Registra la publicación después de la aprobación.',409);
  requireThat(request.channel==='SOCIAL','Las publicaciones sociales corresponden a Contenido para redes.');
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

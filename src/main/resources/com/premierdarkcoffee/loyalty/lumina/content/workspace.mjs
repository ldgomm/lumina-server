import { operatingSql, requestBusinessSql } from '../businesses/operation-state.mjs';
import { can, requireAccess } from '../access/accounts.mjs';
import { canRequest, requestAccessSql } from '../access/content-policy.mjs';
import { integer, requireThat, socialChannels, text } from '../shared/domain.mjs';
import { requestProgressSql, requestStages } from '../production/request-progress.mjs';

export const contentViews=Object.freeze({overview:'Resumen',requests:'Solicitudes',production:'Producción',reviews:'Revisión',deliveries:'Entregas',publications:'Publicaciones',metrics:'Métricas',calendar:'Grabaciones'});
export function contentData(db,actor,company,query) {
  requireAccess(actor,'SOCIAL');
  requireThat(company||actor.kind==='AGENCY','Selecciona un negocio.',404);
  requireThat(actor.kind==='AGENCY'||company.id===actor.company_id,'Área no disponible.',403);
  const view=query.get('view')||'overview';
  requireThat(Object.hasOwn(contentViews,view),'Vista de contenido no encontrada.',404);
  const requestedPage=integer(query.get('page')||'0','página',{min:0,max:100000});
  const q=text(query.get('q')||'','búsqueda',0,100),filter=query.get('filter')||'all';
  requireThat(Object.hasOwn(requestStages,filter),'Filtro de solicitudes no disponible.',400);
  const policy=requestAccessSql(actor);
  const scope=`r.channel='SOCIAL' AND ${policy.sql} AND (? IS NULL OR r.company_id=?)`;
  const search="instr(search_text(r.title||' '||r.brief||' '||c.name),search_text(?))>0";
  const where=`${scope} AND (?='' OR ${search} OR EXISTS(SELECT 1 FROM pieces found WHERE found.company_id=r.company_id AND found.request_id=r.id AND instr(search_text(found.title),search_text(?))>0))`;
  const pieceWhere=`${scope} AND (?='' OR ${search} OR instr(search_text(p.title),search_text(?))>0)`;
  const params=[...policy.params,company?.id||null,company?.id||null,q,q,q];
  const from='requests r JOIN companies c ON c.id=r.company_id';
  const pieceFrom='pieces p JOIN requests r ON r.id=p.request_id AND r.company_id=p.company_id JOIN companies c ON c.id=r.company_id';
  const production=`p.status IN ('PRODUCTION','APPROVED') AND r.status NOT IN ('CANCELLED','DELIVERED') AND ${operatingSql()}`;
  const review=`p.status='REVIEW' AND r.status='PRODUCTION' AND ${operatingSql()}`;
  const counts=db.get(`SELECT coalesce(sum(${company?'1=1':operatingSql()}),0) AS requests,coalesce(sum(${requestStages.open}),0) AS open,coalesce(sum(${requestStages.blocked}),0) AS blocked,coalesce(sum(${requestStages.closed} AND ${company?'1=1':operatingSql()}),0) AS closed FROM ${from} WHERE ${where}`,...params);
  Object.assign(counts,db.get(`SELECT count(*) AS pieces,coalesce(sum(${review}),0) AS review,
    coalesce(sum(p.status='DELIVERED'),0) AS delivered,coalesce(sum(${production}),0) AS production
    FROM ${pieceFrom} WHERE ${pieceWhere} AND p.status<>'CANCELLED'`,...params));
  const directFrom=`FROM courtesy_deliveries r JOIN companies c ON c.id=r.company_id
    WHERE r.request_id IS NULL AND (? IS NULL OR r.company_id=?) AND instr(search_text('Video de cortesía '||c.name),search_text(?))>0`;
  const directParams=[company?.id||null,company?.id||null,q];
  const direct=actor.kind==='COLLABORATOR'?0:db.get('SELECT count(*) AS n '+directFrom,...directParams).n;
  counts.delivered+=direct;
  counts.pieces+=direct;
  const platforms=socialChannels.filter(p=>can(actor,p));
  // Keep joins explicit: publications never multiply content-piece or allowance counts.
  const pubFrom=`publications pub JOIN pieces p ON p.id=pub.piece_id AND p.company_id=pub.company_id
    JOIN requests r ON r.id=p.request_id AND r.company_id=p.company_id JOIN companies c ON c.id=r.company_id`;
  const pubWhere=`${pieceWhere} AND p.status<>'CANCELLED' AND pub.channel IN (${platforms.map(()=>'?').join(',')||"''"})`;
  counts.publications=db.get(`SELECT count(*) AS total FROM ${pubFrom} WHERE ${pubWhere}`,...params,...platforms).total;
  // Choose from the matching work before paginating the recent-request history.
  let nextPiece=null;
  if(view==='overview' && (counts.review || counts.production)) {
    const provider=actor.kind==='AGENCY' && (!company || actor.agencyWork) && !actor.readOnlyCompany;
    const candidates=db.iterate(`SELECT p.id,p.status,p.title,p.request_id,r.company_id,r.channel,r.type,r.title AS request_title,
      (SELECT group_concat(platform) FROM request_platforms rp WHERE rp.company_id=r.company_id AND rp.request_id=r.id) AS targets
      FROM ${pieceFrom} WHERE ${pieceWhere} AND (${review} ${provider?`OR (p.status='APPROVED' AND ${production})`:''})
      ORDER BY CASE WHEN p.status='APPROVED' THEN 0 ELSE 1 END,p.created_at,p.id`,...params);
    for(const row of candidates) {
      const canDecide=row.status==='REVIEW' && canRequest(actor,{...row,platforms:row.targets?.split(',')||[]},'APPROVE');
      if(!nextPiece || canDecide)nextPiece={...row,canDecide};
      if(canDecide || actor.kind!=='COLLABORATOR' || !can(actor,'SOCIAL','APPROVE'))break;
    }
  }
  let sql,values=[...params],title=view==='overview'?'Solicitudes recientes':contentViews[view];
  if(['production','reviews','deliveries'].includes(view)) {
    const state=view==='reviews'?review:view==='deliveries'?"p.status='DELIVERED'":production;
    sql=`SELECT p.id AS id,p.company_id,p.request_id,p.contract_id,p.title,p.service,p.status,p.recorded_at,p.observations,p.revision,p.created_at AS created_at,
      ${requestBusinessSql},r.title AS request_title,r.type AS request_type,r.status AS request_status,c.name AS company_name,
      ((SELECT count(*) FROM evidence e WHERE e.company_id=p.company_id AND e.piece_id=p.id)
        +(SELECT count(DISTINCT f.asset_id) FROM content_files f WHERE f.company_id=p.company_id AND f.piece_id=p.id)) AS evidence_count,
      preview.id AS preview_id,preview.label AS preview_label,preview.media_type AS preview_type,preview.version AS preview_version,
      (SELECT group_concat(platform) FROM request_platforms rp WHERE rp.company_id=r.company_id AND rp.request_id=r.id) AS targets
      FROM ${pieceFrom} LEFT JOIN content_files preview ON preview.id=(
        SELECT f.id FROM content_files f WHERE f.company_id=p.company_id AND f.piece_id=p.id
        ORDER BY f.created_at DESC,f.version DESC,f.id DESC LIMIT 1
      ) WHERE ${pieceWhere} AND ${state}`;
    if(view==='deliveries'&&direct) {
      // External handoffs share the ordered delivery list without creating a customer request.
      sql+=` UNION ALL SELECT r.company_id AS id,r.company_id,NULL AS request_id,NULL AS contract_id,
        'Video de cortesía' AS title,'VIDEO' AS service,'DELIVERED' AS status,NULL AS recorded_at,
        '' AS observations,NULL AS revision,r.delivered_at AS created_at,${requestBusinessSql},
        NULL AS request_title,'COURTESY' AS request_type,'DELIVERED' AS request_status,c.name AS company_name,
        (r.video_url<>'') AS evidence_count,NULL AS preview_id,NULL AS preview_label,NULL AS preview_type,
        NULL AS preview_version,NULL AS targets ${directFrom}`;
      values.push(...directParams);
    }
    sql+=' ORDER BY created_at DESC,id DESC';
  } else if(view==='publications') {
    const platform=query.get('network')||'';
    requireThat(!platform||platforms.includes(platform),'No tienes acceso a esa plataforma.',403);
    sql=`SELECT pub.*,${requestBusinessSql},p.title,p.request_id,c.name AS company_name,
      (SELECT max(m.observed_at) FROM social_metrics m WHERE m.company_id=pub.company_id AND m.publication_id=pub.id) AS measured_at
      FROM ${pubFrom} WHERE ${pubWhere} AND (?='' OR pub.channel=?) ORDER BY pub.published_at DESC,pub.id DESC`;
    values.push(...platforms,platform,platform);title='Publicaciones registradas';
  } else if(view==='calendar') {
    sql=`SELECT v.*,${requestBusinessSql},r.title,c.name AS company_name FROM visits v JOIN requests r ON r.id=v.request_id AND r.company_id=v.company_id
      JOIN companies c ON c.id=r.company_id WHERE ${where} ORDER BY CASE WHEN v.status='SCHEDULED' THEN 0 ELSE 1 END,
      CASE WHEN v.status='SCHEDULED' THEN v.starts_at END,v.starts_at DESC,v.id DESC`;
    title='Visitas y grabaciones';
  } else {
    sql=`SELECT r.*,${requestBusinessSql},c.name AS company_name,${requestProgressSql} FROM ${from} WHERE ${where} AND ${view==='requests'?requestStages[filter]:'1=1'} AND ${!company&&filter!=='blocked'?operatingSql():'1=1'} ORDER BY r.created_at DESC,r.id DESC`;
  }
  const total=db.get(`SELECT count(*) AS total FROM (${sql})`,...values).total;
  const page=Math.min(requestedPage,Math.max(0,Math.ceil(total/20)-1));
  const rows=db.all(sql+' LIMIT 20 OFFSET ?',...values,page*20);
  return {global:!company,view,q,page,total,filter,counts,title,platforms,platform:query.get('network')||'',rows,nextPiece,more:(page+1)*20<total};
}

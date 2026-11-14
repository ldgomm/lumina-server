import { can, requireAccess } from '../access/accounts.mjs';
import { requestAccessSql } from '../access/content-policy.mjs';
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
  const search="instr(lower(r.title||' '||r.brief||' '||c.name),lower(?))>0";
  const where=`${scope} AND (?='' OR ${search} OR EXISTS(SELECT 1 FROM pieces found WHERE found.company_id=r.company_id AND found.request_id=r.id AND instr(lower(found.title),lower(?))>0))`;
  const pieceWhere=`${scope} AND (?='' OR ${search} OR instr(lower(p.title),lower(?))>0)`;
  const params=[...policy.params,company?.id||null,company?.id||null,q,q,q];
  const from='requests r JOIN companies c ON c.id=r.company_id';
  const pieceFrom='pieces p JOIN requests r ON r.id=p.request_id AND r.company_id=p.company_id JOIN companies c ON c.id=r.company_id';
  const production="p.status IN ('PRODUCTION','APPROVED') AND r.status NOT IN ('CANCELLED','DELIVERED')";
  const review="p.status='REVIEW' AND r.status='PRODUCTION'";
  const counts=db.get(`SELECT count(*) AS requests,coalesce(sum(r.status NOT IN ('DELIVERED','CANCELLED')),0) AS open FROM ${from} WHERE ${where}`,...params);
  Object.assign(counts,db.get(`SELECT count(*) AS pieces,coalesce(sum(${review}),0) AS review,
    coalesce(sum(p.status='DELIVERED'),0) AS delivered,coalesce(sum(${production}),0) AS production
    FROM ${pieceFrom} WHERE ${pieceWhere} AND p.status<>'CANCELLED'`,...params));
  const platforms=socialChannels.filter(p=>can(actor,p));
  // Keep joins explicit: publications never multiply content-piece or allowance counts.
  const pubFrom=`publications pub JOIN pieces p ON p.id=pub.piece_id AND p.company_id=pub.company_id
    JOIN requests r ON r.id=p.request_id AND r.company_id=p.company_id JOIN companies c ON c.id=r.company_id`;
  const pubWhere=`${pieceWhere} AND p.status<>'CANCELLED' AND pub.channel IN (${platforms.map(()=>'?').join(',')||"''"})`;
  counts.publications=db.get(`SELECT count(*) AS total FROM ${pubFrom} WHERE ${pubWhere}`,...params,...platforms).total;
  let sql,values=[...params],title=view==='overview'?'Solicitudes recientes':contentViews[view];
  if(['production','reviews','deliveries'].includes(view)) {
    const state=view==='reviews'?review:view==='deliveries'?"p.status='DELIVERED'":production;
    sql=`SELECT p.*,r.title AS request_title,r.type AS request_type,r.status AS request_status,c.name AS company_name,
      ((SELECT count(*) FROM evidence e WHERE e.company_id=p.company_id AND e.piece_id=p.id)
        +(SELECT count(DISTINCT f.asset_id) FROM content_files f WHERE f.company_id=p.company_id AND f.piece_id=p.id)) AS evidence_count,
      (SELECT group_concat(platform) FROM request_platforms rp WHERE rp.company_id=r.company_id AND rp.request_id=r.id) AS targets
      FROM ${pieceFrom} WHERE ${pieceWhere} AND ${state} ORDER BY p.created_at DESC,p.id DESC`;
  } else if(view==='publications') {
    const platform=query.get('network')||'';
    requireThat(!platform||platforms.includes(platform),'No tienes acceso a esa plataforma.',403);
    sql=`SELECT pub.*,p.title,p.request_id,c.name AS company_name,
      (SELECT max(m.observed_at) FROM social_metrics m WHERE m.company_id=pub.company_id AND m.publication_id=pub.id) AS measured_at
      FROM ${pubFrom} WHERE ${pubWhere} AND (?='' OR pub.channel=?) ORDER BY pub.published_at DESC,pub.id DESC`;
    values.push(...platforms,platform,platform);title='Publicaciones registradas';
  } else if(view==='calendar') {
    sql=`SELECT v.*,r.title,c.name AS company_name FROM visits v JOIN requests r ON r.id=v.request_id AND r.company_id=v.company_id
      JOIN companies c ON c.id=r.company_id WHERE ${where} ORDER BY CASE WHEN v.status='SCHEDULED' THEN 0 ELSE 1 END,
      CASE WHEN v.status='SCHEDULED' THEN v.starts_at END,v.starts_at DESC,v.id DESC`;
    title='Visitas y grabaciones';
  } else {
    sql=`SELECT r.*,c.name AS company_name,${requestProgressSql} FROM ${from} WHERE ${where} AND ${view==='requests'?requestStages[filter]:'1=1'} ORDER BY r.created_at DESC,r.id DESC`;
  }
  const total=db.get(`SELECT count(*) AS total FROM (${sql})`,...values).total;
  const page=Math.min(requestedPage,Math.max(0,Math.ceil(total/20)-1));
  const rows=db.all(sql+' LIMIT 20 OFFSET ?',...values,page*20);
  return {view,q,page,total,filter,counts,title,platforms,platform:query.get('network')||'',rows,more:(page+1)*20<total};
}

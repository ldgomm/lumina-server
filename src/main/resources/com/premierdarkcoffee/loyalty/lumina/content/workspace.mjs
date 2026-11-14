import { can, requireAccess } from '../access/accounts.mjs';
import { requestAccessSql } from '../access/content-policy.mjs';
import { integer, requireThat, socialChannels, text } from '../shared/domain.mjs';

export const contentViews=Object.freeze({overview:'Resumen',requests:'Solicitudes',production:'Producción',reviews:'Por aprobar',deliveries:'Entregas',publications:'Publicaciones',metrics:'Métricas',calendar:'Grabaciones'});
export function contentData(db,actor,company,query) {
  requireAccess(actor,'SOCIAL');
  requireThat(company||actor.kind==='AGENCY','Selecciona un negocio.',404);
  requireThat(actor.kind==='AGENCY'||company.id===actor.company_id,'Área no disponible.',403);
  const view=query.get('view')||'overview';
  requireThat(Object.hasOwn(contentViews,view),'Vista de contenido no encontrada.',404);
  const page=integer(query.get('page')||'0','página',{min:0,max:100000});
  const q=text(query.get('q')||'','búsqueda',0,100);
  const policy=requestAccessSql(actor);
  const where=`r.channel='SOCIAL' AND ${policy.sql} AND (? IS NULL OR r.company_id=?)
    AND (?='' OR instr(lower(r.title||' '||r.brief||' '||c.name),lower(?))>0)`;
  const params=[...policy.params,company?.id||null,company?.id||null,q,q];
  const from='requests r JOIN companies c ON c.id=r.company_id';
  const pieceFrom='pieces p JOIN requests r ON r.id=p.request_id AND r.company_id=p.company_id JOIN companies c ON c.id=r.company_id';
  const counts=db.get(`SELECT count(*) AS requests,coalesce(sum(r.status NOT IN ('DELIVERED','CANCELLED')),0) AS open FROM ${from} WHERE ${where}`,...params);
  Object.assign(counts,db.get(`SELECT count(*) AS pieces,coalesce(sum(p.status='REVIEW'),0) AS review,
    coalesce(sum(p.status='DELIVERED'),0) AS delivered,coalesce(sum(p.status IN ('PRODUCTION','REVIEW','APPROVED')),0) AS production
    FROM ${pieceFrom} WHERE ${where} AND p.status<>'CANCELLED'`,...params));
  const platforms=socialChannels.filter(p=>can(actor,p));
  // Keep joins explicit: publications never multiply content-piece or allowance counts.
  const pubFrom=`publications pub JOIN pieces p ON p.id=pub.piece_id AND p.company_id=pub.company_id
    JOIN requests r ON r.id=p.request_id AND r.company_id=p.company_id JOIN companies c ON c.id=r.company_id`;
  const pubWhere=`${where} AND p.status<>'CANCELLED' AND pub.channel IN (${platforms.map(()=>'?').join(',')||"''"})`;
  counts.publications=db.get(`SELECT count(*) AS total FROM ${pubFrom} WHERE ${pubWhere}`,...params,...platforms).total;
  let sql,values=[...params],title=view==='overview'?'Solicitudes recientes':contentViews[view];
  if(['production','reviews','deliveries'].includes(view)) {
    const state=view==='reviews'?"p.status='REVIEW'":view==='deliveries'?"p.status='DELIVERED'":"p.status IN ('PRODUCTION','REVIEW','APPROVED')";
    sql=`SELECT p.*,r.title AS request_title,c.name AS company_name FROM ${pieceFrom} WHERE ${where} AND ${state} ORDER BY p.created_at DESC,p.id DESC`;
    title=contentViews[view];
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
    sql=`SELECT r.*,c.name AS company_name FROM ${from} WHERE ${where} ORDER BY r.created_at DESC,r.id DESC`;
  }
  const rows=db.all(sql+' LIMIT 21 OFFSET ?',...values,page*20);
  return {view,q,page,counts,title,platforms,platform:query.get('network')||'',rows:rows.slice(0,20),more:rows.length>20};
}

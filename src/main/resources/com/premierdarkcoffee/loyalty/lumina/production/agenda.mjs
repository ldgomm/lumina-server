import { requireBusinessActor, requireAgency } from '../access/accounts.mjs';
import { requestAccessSql } from '../access/content-policy.mjs';
import { integer, now, requireThat, text } from '../shared/domain.mjs';

export const agendaViews = {proximas:'Próximas',pendientes:'Por actualizar',historial:'Historial'};

// The same tenant and platform policy applies before counting, searching and paging.
export function agendaData(db,actor,companyId,params=new URLSearchParams(),onlySocial=false) {
  if(companyId) {
    if(actor.kind!=='AGENCY')requireBusinessActor(actor,{id:companyId});
  } else requireAgency(actor);
  const view=params.get('vista')||'proximas';
  requireThat(Object.hasOwn(agendaViews,view),'Vista de agenda no disponible.',400);
  const q=text(params.get('q')||'','búsqueda',0,100);
  const requested=integer(params.get('pagina')||'0','página',{max:10000});
  const instant=now(),policy=requestAccessSql(actor);
  const filters={
    proximas:"v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at>=?",
    pendientes:"v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at<?",
    historial:"(v.status<>'SCHEDULED' OR r.status='CANCELLED')",
  };
  const base=`FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
    JOIN companies c ON c.id=v.company_id WHERE (?='' OR v.company_id=?) AND ${policy.sql}${onlySocial?" AND r.channel='SOCIAL'":''}`;
  const args=[companyId||'',companyId||'',...policy.params];
  const counts=Object.fromEntries(Object.entries(filters).map(([key,filter])=>[key,
    db.get(`SELECT count(*) n ${base} AND ${filter}`,...args,...(key==='historial'?[]:[instant])).n]));
  const where=`${base} AND ${filters[view]} AND (?='' OR instr(lower(r.title||' '||c.name||' '||coalesce(v.place,'')),lower(?))>0)`;
  const values=[...args,...(view==='historial'?[]:[instant]),q,q];
  const total=db.get(`SELECT count(*) n ${where}`,...values).n;
  const page=Math.min(requested,Math.max(0,Math.ceil(total/20)-1));
  const rows=db.all(`SELECT v.*,r.title,r.status AS request_status,c.name AS company_name ${where}
    ORDER BY v.starts_at ${view==='historial'?'DESC':'ASC'},v.id LIMIT 20 OFFSET ?`,...values,page*20);
  return {view,q,page,total,counts,rows,more:(page+1)*20<total};
}

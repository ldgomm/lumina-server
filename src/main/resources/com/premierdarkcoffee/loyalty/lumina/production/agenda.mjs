import { requireBusinessActor, requireAgency } from '../access/accounts.mjs';
import { requestAccessSql } from '../access/content-policy.mjs';
import { integer, now, requireThat, text } from '../shared/domain.mjs';

export const agendaViews = {upcoming:'Próximas',pending:'Por actualizar',history:'Historial'};

// The same tenant and platform policy applies before counting, searching and paging.
export function agendaData(db,actor,companyId,params=new URLSearchParams(),onlySocial=false) {
  if(companyId) {
    if(actor.kind!=='AGENCY')requireBusinessActor(actor,{id:companyId});
  } else requireAgency(actor);
  const view=params.get('view')||'upcoming';
  requireThat(Object.hasOwn(agendaViews,view),'Vista de agenda no disponible.',400);
  const q=text(params.get('q')||'','búsqueda',0,100);
  const requested=integer(params.get('page')||'0','página',{max:10000});
  const instant=now(),policy=requestAccessSql(actor);
  const filters={
    upcoming:"v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at>=?",
    pending:"v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at<?",
    history:"(v.status<>'SCHEDULED' OR r.status='CANCELLED')",
  };
  const base=`FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
    JOIN companies c ON c.id=v.company_id WHERE (?='' OR v.company_id=?) AND ${policy.sql}${onlySocial?" AND r.channel='SOCIAL'":''}
    AND (?='' OR instr(search_text(r.title||' '||c.name||' '||coalesce(v.place,'')),search_text(?))>0)`;
  const args=[companyId||'',companyId||'',...policy.params,q,q];
  const counts=Object.fromEntries(Object.entries(filters).map(([key,filter])=>[key,
    db.get(`SELECT count(*) n ${base} AND ${filter}`,...args,...(key==='history'?[]:[instant])).n]));
  const where=`${base} AND ${filters[view]}`;
  const values=[...args,...(view==='history'?[]:[instant])];
  const total=db.get(`SELECT count(*) n ${where}`,...values).n;
  const page=Math.min(requested,Math.max(0,Math.ceil(total/20)-1));
  const rows=db.all(`SELECT v.*,r.title,r.status AS request_status,c.name AS company_name ${where}
    ORDER BY v.starts_at ${view==='history'?'DESC':'ASC'},v.id LIMIT 20 OFFSET ?`,...values,page*20);
  return {view,q,page,total,counts,rows,more:(page+1)*20<total};
}

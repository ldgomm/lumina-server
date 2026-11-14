import { canRequest, requestAccessSql } from '../access/content-policy.mjs';
import { requireBusinessActor } from '../access/accounts.mjs';
import { now, integer, requireThat, text } from '../shared/domain.mjs';

// A read-only projection of this account's workspace. Every query is tenant-bound.
export function businessOverview(db,actor,companyId) {
  requireBusinessActor(actor,{id:companyId});
  const policy=requestAccessSql(actor);
  const recent=db.all(`SELECT r.id,r.title,r.channel,r.service,r.quantity,r.status FROM requests r
    WHERE r.company_id=? AND ${policy.sql} ORDER BY r.created_at DESC,r.id DESC LIMIT 4`,companyId,...policy.params);
  const reviews=db.all(`SELECT r.*, (SELECT group_concat(platform) FROM request_platforms rp
    WHERE rp.company_id=r.company_id AND rp.request_id=r.id) AS targets FROM requests r
    WHERE r.company_id=? AND ${policy.sql} AND r.status NOT IN ('CANCELLED','DELIVERED')
    AND EXISTS(SELECT 1 FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='REVIEW')
    ORDER BY r.created_at,r.id`,companyId,...policy.params)
    .filter(r=>canRequest(actor,{...r,platforms:r.targets?r.targets.split(','):[]},'APPROVE'));
  const quotes=actor.kind==='OWNER'?db.all(`SELECT r.id,r.title,r.created_at FROM requests r
    WHERE r.company_id=? AND r.status='QUOTED'
    AND EXISTS(SELECT 1 FROM quotes q WHERE q.company_id=r.company_id AND q.request_id=r.id AND q.status='OFFERED')
    ORDER BY r.created_at,r.id`,companyId):[];
  const proposals=actor.kind==='OWNER'?db.all(`SELECT id,created_at FROM package_orders
    WHERE company_id=? AND status='QUOTED' ORDER BY created_at,id`,companyId):[];
  const nextVisit=db.get(`SELECT v.starts_at,v.place,r.id,r.title FROM visits v
    JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
    WHERE v.company_id=? AND ${policy.sql} AND v.status='SCHEDULED' AND v.starts_at>=?
    AND r.status<>'CANCELLED' ORDER BY v.starts_at,v.id LIMIT 1`,companyId,...policy.params,now());
  return {recent,reviews,quotes,proposals,nextVisit};
}

export const attentionKinds={deliveries:'Entregas por revisar',quotes:'Cotizaciones',proposals:'Propuestas de servicios'};
export function attentionRows(overview) {
  return [
    ...overview.reviews.map(r=>({...r,kind:'deliveries',path:'/requests/'+r.id})),
    ...overview.quotes.map(r=>({...r,kind:'quotes',path:'/requests/'+r.id})),
    ...overview.proposals.map(r=>({...r,title:'Propuesta de servicios',kind:'proposals',path:'/plans/orders/'+r.id})),
  ].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.path.localeCompare(b.path)||a.kind.localeCompare(b.kind));
}
export function attentionData(db,actor,companyId,params=new URLSearchParams()) {
  requireBusinessActor(actor,{id:companyId});
  const view=params.get('view')||'all';
  requireThat(view==='all'||Object.hasOwn(attentionKinds,view),'Vista de pendientes no disponible.',400);
  const q=text(params.get('q')||'','búsqueda',0,100),requested=integer(params.get('page')||'0','página',{max:10000});
  const all=attentionRows(businessOverview(db,actor,companyId));
  const counts={all:all.length,...Object.fromEntries(Object.keys(attentionKinds).map(k=>[k,all.filter(r=>r.kind===k).length]))};
  const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
  const filtered=all.filter(r=>(view==='all'||r.kind===view)&&fold(r.title).includes(fold(q)));
  const total=filtered.length,page=Math.min(requested,Math.max(0,Math.ceil(total/20)-1));
  return {view,q,counts,total,page,rows:filtered.slice(page*20,(page+1)*20)};
}

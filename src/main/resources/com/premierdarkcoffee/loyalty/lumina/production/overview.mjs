import { canRequest, requestAccessSql } from '../access/content-policy.mjs';
import { requireBusinessActor } from '../access/accounts.mjs';
import { now } from '../shared/domain.mjs';

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
  const quotes=actor.kind==='OWNER'?db.all(`SELECT r.id,r.title FROM requests r
    WHERE r.company_id=? AND r.status='QUOTED'
    AND EXISTS(SELECT 1 FROM quotes q WHERE q.company_id=r.company_id AND q.request_id=r.id AND q.status='OFFERED')
    ORDER BY r.created_at,r.id`,companyId):[];
  const proposals=actor.kind==='OWNER'?db.all(`SELECT id FROM package_orders
    WHERE company_id=? AND status='QUOTED' ORDER BY created_at,id`,companyId):[];
  const nextVisit=db.get(`SELECT v.starts_at,v.place,r.id,r.title FROM visits v
    JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
    WHERE v.company_id=? AND ${policy.sql} AND v.status='SCHEDULED' AND v.starts_at>=?
    AND r.status<>'CANCELLED' ORDER BY v.starts_at,v.id LIMIT 1`,companyId,...policy.params,now());
  return {recent,reviews,quotes,proposals,nextVisit};
}

import { requireOwner, teamMember } from './accounts.mjs';
import { areas, integer, now, requireThat, text } from '../shared/domain.mjs';

export function teamDirectory(db, actor, query = new URLSearchParams()) {
  requireOwner(actor);
  const q = text(query.get('q') || '', 'búsqueda', 0, 100);
  const state = query.get('estado') || '';
  const area = query.get('area') || '';
  const page = integer(query.get('pagina') || '0', 'página', { max: 100000 });
  requireThat(['', 'ACTIVE', 'PENDING', 'INACTIVE', 'EXPIRED'].includes(state), 'Estado de acceso inválido.');
  requireThat(!area || area === 'CASH' || Object.hasOwn(areas, area), 'Área inválida.');
  const at = now();
  const stateSql = `CASE WHEN a.active=0 THEN 'INACTIVE' WHEN a.password IS NOT NULL THEN 'ACTIVE'
    WHEN EXISTS(SELECT 1 FROM codes k WHERE k.account_id=a.id AND k.kind='ACTIVATE' AND k.expires_at>?) THEN 'PENDING' ELSE 'EXPIRED' END`;
  const where = `a.company_id=? AND a.kind='COLLABORATOR' AND (?='' OR instr(lower(a.name||' '||coalesce(a.document,'')),lower(?))>0)
    AND (?='' OR ${stateSql}=?) AND (?='' OR (?='CASH' AND EXISTS(SELECT 1 FROM cash_grants c WHERE c.account_id=a.id AND c.company_id=a.company_id AND c.status='ACTIVE'))
    OR EXISTS(SELECT 1 FROM grants g WHERE g.account_id=a.id AND g.action='VIEW' AND (g.scope=? OR (?='SOCIAL' AND g.scope IN ('INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE')))))`;
  const args = [actor.company_id, q, q, state, at, state, area, area, area, area];
  const total = db.get(`SELECT count(*) AS count FROM accounts a WHERE ${where}`, ...args).count;
  const ids = db.all(`SELECT a.id FROM accounts a WHERE ${where} ORDER BY a.active DESC,lower(a.name),a.id LIMIT 20 OFFSET ?`, ...args, page * 20);
  const counts = db.get(`SELECT count(*) AS total,coalesce(sum(active=1 AND password IS NOT NULL),0) AS active,
    coalesce(sum(active=1 AND password IS NULL),0) AS pending,coalesce(sum(active=0),0) AS inactive
    FROM accounts WHERE company_id=? AND kind='COLLABORATOR'`, actor.company_id);
  return { rows: ids.map(row => teamMember(db, actor, row.id)), total, counts, q, state, area, page, more: (page + 1) * 20 < total };
}
export function teamHistory(db, actor, id) {
  teamMember(db, actor, id);
  return db.all(`SELECT actor_name,action,details,happened_at FROM audit
    WHERE company_id=? AND subject='ACCOUNT' AND subject_id=? ORDER BY seq DESC LIMIT 30`, actor.company_id, id);
}

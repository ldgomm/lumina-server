import { requireAgency } from './accounts.mjs';
import { integer, isId, requireThat, text } from '../shared/domain.mjs';

// Agency reads are explicit projections. Never reuse an OWNER identity or prepare Wallet access.
export function consultTeams(db, actor, query = new URLSearchParams()) {
  requireAgency(actor);
  const q = text(query.get('q') || '', 'búsqueda', 0, 100);
  const page = integer(query.get('page') || '0', 'página', {max:100000});
  const selected = query.get('company');
  if (!selected) {
    const total = db.get('SELECT count(*) AS n FROM companies WHERE NOT EXISTS(SELECT 1 FROM business_controls b WHERE b.company_id=companies.id AND b.archived_at IS NOT NULL) AND instr(lower(name),lower(?))>0',q).n;
    const rows = db.all(`SELECT c.id,c.name,
      (SELECT count(*) FROM accounts a WHERE a.company_id=c.id AND a.archived_at IS NULL AND a.kind IN ('OWNER','COLLABORATOR')) AS people
      FROM companies c WHERE NOT EXISTS(SELECT 1 FROM business_controls b WHERE b.company_id=c.id AND b.archived_at IS NOT NULL) AND instr(lower(c.name),lower(?))>0
      ORDER BY lower(c.name),c.id LIMIT 20 OFFSET ?`,q,page*20);
    return {company:null,rows,total,q,page,more:(page+1)*20<total};
  }
  requireThat(isId(selected),'No se encontró ese negocio.',404);
  const company = db.get('SELECT id,name FROM companies WHERE id=?',selected);
  requireThat(company,'No se encontró ese negocio.',404);
  const where = "a.company_id=? AND a.archived_at IS NULL AND a.kind IN ('OWNER','COLLABORATOR') AND instr(lower(a.name||' '||coalesce(a.document,'')),lower(?))>0";
  const total = db.get(`SELECT count(*) AS n FROM accounts a WHERE ${where}`,company.id,q).n;
  const rows = db.all(`SELECT a.id,a.name,a.document,a.kind,a.active,a.archived_at,a.suspended_at,a.password IS NOT NULL AS activated,
    c.status AS cash_status,c.branch_name,c.purchases,c.rewards,
    (SELECT max(expires_at) FROM codes WHERE account_id=a.id AND kind='ACTIVATE') AS activation_expires
    FROM accounts a LEFT JOIN cash_grants c ON c.account_id=a.id AND c.company_id=a.company_id
    WHERE ${where} ORDER BY CASE a.kind WHEN 'OWNER' THEN 0 ELSE 1 END,a.active DESC,lower(a.name),a.id LIMIT 20 OFFSET ?`,
    company.id,q,page*20).map(member=>({...member,
      grants:db.all('SELECT scope,action FROM grants WHERE account_id=? ORDER BY scope,action',member.id)}));
  return {company,rows,total,q,page,more:(page+1)*20<total};
}

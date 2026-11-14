import { requireAgency } from '../access/accounts.mjs';
import { integer, requireThat, text } from '../shared/domain.mjs';
import { businessStates } from './control.mjs';

// One local, read-only projection. No Wallet provisioning or billing synchronization.
export function businessDirectory(db, actor, query = new URLSearchParams()) {
  requireAgency(actor);
  const q = text(query.get('q') || '', 'búsqueda', 0, 100);
  const state = query.get('estado') || '';
  const verification = query.get('verificacion') || '';
  const sort = query.get('orden') || 'ATTENTION';
  requireThat(!state || state === 'PENDING' || Object.hasOwn(businessStates, state), 'Estado inválido.');
  requireThat(['', 'PENDING', 'VERIFIED'].includes(verification), 'Verificación inválida.');
  const orders = {
    ATTENTION: "(b.pending_id IS NOT NULL) DESC,c.approved,CASE COALESCE(b.state,'ACTIVE') WHEN 'ACTIVE' THEN 1 ELSE 0 END,search_text(c.name),c.id",
    NAME: 'search_text(c.name),c.id',
    RECENT: 'c.created_at DESC,c.id',
  };
  requireThat(Object.hasOwn(orders, sort), 'Orden inválido.');
  const requestedPage = integer(query.get('pagina') || '0', 'página', { max: 100000 });
  const from = 'FROM companies c LEFT JOIN business_controls b ON b.company_id=c.id';
  const where = `instr(search_text(c.name||' '||coalesce(c.ruc,'')||' '||c.phone||' '||COALESCE((SELECT group_concat(a.name||' '||coalesce(a.document,''),' ') FROM accounts a WHERE a.company_id=c.id AND a.kind='OWNER'),'')),search_text(?))>0
    AND (?='' OR (?='PENDING' AND b.pending_id IS NOT NULL) OR (COALESCE(b.state,'ACTIVE')=? AND (?<>'ACTIVE' OR b.pending_id IS NULL)))
    AND (?='' OR c.approved=?)`;
  const args = [q, state, state, state, state, verification, verification === 'VERIFIED' ? 1 : 0];
  const total = db.get(`SELECT count(*) AS n ${from} WHERE ${where}`, ...args).n;
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(total / 25) - 1));
  const rows = db.all(`SELECT c.id,c.name,c.approved,c.phone,c.created_at,COALESCE(b.state,'ACTIVE') AS state,b.pending_id,
    (SELECT name FROM accounts a WHERE a.company_id=c.id AND a.kind='OWNER' ORDER BY a.id LIMIT 1) AS owner_name
    ${from} WHERE ${where} ORDER BY ${orders[sort]} LIMIT 25 OFFSET ?`, ...args, page * 25);
  const counts = db.get(`SELECT count(*) AS total,
    sum(CASE WHEN COALESCE(b.state,'ACTIVE')='ACTIVE' AND b.pending_id IS NULL THEN 1 ELSE 0 END) AS active,
    sum(CASE WHEN COALESCE(b.state,'ACTIVE')<>'ACTIVE' THEN 1 ELSE 0 END) AS stopped,
    sum(CASE WHEN b.pending_id IS NOT NULL THEN 1 ELSE 0 END) AS pending,
    sum(CASE WHEN c.approved=0 THEN 1 ELSE 0 END) AS unverified ${from}`);
  return { rows, total, page, more: (page + 1) * 25 < total, counts, q, state, verification, sort };
}

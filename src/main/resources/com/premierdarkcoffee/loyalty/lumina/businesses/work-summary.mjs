import { requireAgency } from '../access/accounts.mjs';
import { now, requireThat } from '../shared/domain.mjs';
import { businessStateSql } from './operation-state.mjs';

// Counts describe existing records, never a mutation plan or a provider receipt.
// Independent aggregates prevent requests, visits and people multiplying each other.
export function businessWorkSummary(db, actor, companyId) {
  requireAgency(actor);
  const instant = now();
  const row = db.get(`SELECT ${businessStateSql('c.id')} AS state,
    (SELECT count(*) FROM requests r WHERE r.company_id=c.id AND r.status NOT IN ('DELIVERED','CANCELLED')) AS requests,
    (SELECT count(*) FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
      WHERE v.company_id=c.id AND v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at>=?) AS upcoming,
    (SELECT count(*) FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
      WHERE v.company_id=c.id AND v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at<?) AS overdue,
    (SELECT count(*) FROM accounts a WHERE a.company_id=c.id AND a.kind='COLLABORATOR'
      AND a.active=1 AND a.archived_at IS NULL AND a.password IS NOT NULL) AS collaborators
    FROM companies c WHERE c.id=?`,instant,instant,companyId);
  requireThat(row,'Negocio no encontrado.',404);
  return row;
}

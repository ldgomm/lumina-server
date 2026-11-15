import { isId, now, requireThat } from '../shared/domain.mjs';

// This context is created by a dedicated agency route, never from form fields.
// The agency keeps its own identity; company_id only bounds the team operation.
export function teamAdministrator(db, actor, companyId) {
  requireThat(actor?.kind === 'AGENCY', 'Acceso de administración de Lúmina.', 403);
  requireThat(isId(companyId) && db.get('SELECT id FROM companies WHERE id=?', companyId), 'Negocio no encontrado.', 404);
  const scoped = {...actor, company_id:companyId, teamAdministration:true};
  requireLiveTeamManager(db, scoped);
  return scoped;
}

export function requireTeamManager(actor) {
  requireThat(actor?.company_id && (actor.kind === 'OWNER' || actor.kind === 'AGENCY' && actor.teamAdministration === true),
    'Solo el dueño o administración puede gestionar este equipo.', 403);
}

export function requireLiveTeamManager(db, actor) {
  requireTeamManager(actor);
  const current = db.get(`SELECT a.kind,a.company_id,a.revision FROM accounts a JOIN sessions s ON s.account_id=a.id
    WHERE a.id=? AND a.active=1 AND s.digest=? AND s.expires_at>?`, actor.id, actor.session_id, now());
  requireThat(current && current.kind === actor.kind && current.revision === actor.revision &&
    (actor.kind === 'AGENCY' ? current.company_id === null : current.company_id === actor.company_id),
    'Tu sesión cambió. Ingresa nuevamente.', 401);
}

export const teamBase = actor => actor?.kind === 'AGENCY' && actor.teamAdministration
  ? '/admin/businesses/' + actor.company_id + '/team' : '/team';

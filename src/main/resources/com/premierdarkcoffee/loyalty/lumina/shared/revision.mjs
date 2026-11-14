import { requireThat } from './domain.mjs';

// Older integrations omit revision. New forms always carry the version they showed.
export function checkRevision(record, input) {
  if (input.revision === undefined) return;
  requireThat(String(record.revision) === input.revision,
    'Hay cambios más recientes. Revisa la versión actual antes de guardar.',409);
}

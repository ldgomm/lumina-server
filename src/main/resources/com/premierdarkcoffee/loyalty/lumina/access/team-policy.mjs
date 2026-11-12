import { areas, channels, walletScopes, socialChannels, requireThat } from '../shared/domain.mjs';

export const permissions = Object.freeze({ VIEW: 'Consultar', REQUEST: 'Solicitar', APPROVE: 'Aprobar entregas' });
export const permissionRules = Object.freeze(Object.fromEntries([
  ...Object.entries(channels).map(([scope, title]) => [scope, { title, actions: Object.keys(permissions) }]),
  ...Object.entries(walletScopes).map(([scope, title]) => [scope, { title, actions: scope === 'WALLET_REPORTS' ? ['VIEW'] : ['VIEW', 'EDIT'] }]),
]));
export const permissionTitles = Object.freeze({ ...permissions, EDIT: 'Modificar' });
export const teamPresets = Object.freeze({
  CASH: { title: 'Solo Caja', grants: [], note: 'Después de crear la cuenta, elige su sucursal y las operaciones de Caja.' },
  CONTENT: { title: 'Contenido', grants: ['SOCIAL.VIEW', 'SOCIAL.REQUEST'], note: 'Consulta y solicita contenido. No aprueba entregas.' },
  READ: { title: 'Consulta de servicios', grants: ['SOCIAL.VIEW', 'MAPS.VIEW', 'WEB.VIEW', 'BRAND.VIEW'], note: 'Consulta los servicios de marketing, sin solicitar ni aprobar.' },
});
export function parseGrants(values) {
  const result = [];
  for (const [field, value] of Object.entries(values)) {
    if (!field.includes('.')) continue;
    const [scope, action, extra] = field.split('.');
    requireThat(!extra && permissionRules[scope]?.actions.includes(action) && value === 'yes', 'Revisa los permisos seleccionados.');
  }
  for (const [scope, rule] of Object.entries(permissionRules)) {
    const chosen = rule.actions.filter(action => values[`${scope}.${action}`] === 'yes');
    requireThat(!chosen.length || chosen.includes('VIEW'), `Activa Consultar en ${rule.title}.`);
    if (Object.hasOwn(walletScopes, scope) && chosen.length) requireThat(values['WALLET.VIEW'] === 'yes', 'Activa el acceso a Wallet antes de elegir sus tareas.');
    for (const action of chosen) result.push({ scope, action });
  }
  return result;
}
export function describeGrants(grants) {
  const has = (scope, action) => grants.some(g => g.scope === scope && g.action === action);
  return Object.entries(permissionRules).flatMap(([scope, rule]) => {
    const chosen = rule.actions.filter(action => has(scope, action));
    if (!chosen.length) return [];
    if (socialChannels.includes(scope) && chosen.every(action => has('SOCIAL', action))) return [];
    return [`${rule.title}: ${chosen.map(action => permissionTitles[action].toLowerCase()).join(', ')}`];
  });
}
export function grantsSnapshot(grants) {
  return grants.map(g => `${g.scope}.${g.action}`).sort();
}
export function memberState(member, at = new Date().toISOString()) {
  if (!member.active) return 'INACTIVE';
  if (member.activated) return 'ACTIVE';
  return member.activation_expires > at ? 'PENDING' : 'EXPIRED';
}

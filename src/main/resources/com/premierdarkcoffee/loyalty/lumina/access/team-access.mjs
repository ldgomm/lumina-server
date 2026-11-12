import { teamMember, requireTeamRevision, replaceTeamGrants, updateGrants } from './accounts.mjs';
import { parseGrants } from './team-policy.mjs';
import { isId, requireThat } from '../shared/domain.mjs';

export function cashMode(member) {
  if (!['ACTIVE','PENDING'].includes(member.cash_status)) return 'OFF';
  return member.purchases ? (member.rewards ? 'BOTH' : 'PURCHASES') : 'REWARDS';
}

// One owner decision. Validate everything before preparing a native credential;
// publish service grants and cashier assignment in the same local transaction.
export async function saveTeamAccess({db,bridge,wallets}, actor, id, input) {
  const member=teamMember(db,actor,id);
  requireTeamRevision(member,input);
  const grants=parseGrants(input);
  requireThat(['OFF','BOTH','PURCHASES','REWARDS'].includes(input.cash_mode),'Elige el acceso a Caja.');
  const desired=input.cash_mode;
  const commit=current=>replaceTeamGrants(db,actor,current,grants);
  const credential=()=>wallets.ownerCredential(actor);
  if(desired==='OFF') {
    if(['ACTIVE','PENDING','REVOKING'].includes(member.cash_status)) {
      await bridge.revoke(actor,id,{revision:input.revision,reason:'Cambio de permisos desde el equipo de Lúmina.',credential},commit);
    } else updateGrants(db,actor,id,input);
    return;
  }
  requireThat(isId(input.branch),'Elige una sucursal de trabajo.');
  if(member.cash_status==='ACTIVE'&&desired===cashMode(member)&&input.branch===member.branch_id) {
    updateGrants(db,actor,id,input);
    return;
  }
  await bridge.configure(actor,id,{revision:input.revision,branch:input.branch,
    purchases:desired==='BOTH'||desired==='PURCHASES'?'yes':'',
    rewards:desired==='BOTH'||desired==='REWARDS'?'yes':'',credential},commit);
}

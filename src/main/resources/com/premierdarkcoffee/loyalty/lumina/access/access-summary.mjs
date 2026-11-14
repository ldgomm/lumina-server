import { describeGrants } from './team-policy.mjs';

export function effectiveAccessSummary(member) {
  if(!member.active)return ['Acceso desactivado: no puede entrar ni operar.'];
  const lines=[],has=(scope,action)=>member.grants.some(g=>g.scope===scope&&g.action===action);
  if(!member.activated)lines.push('Debe activar su cuenta antes de usar estos permisos.');
  if(member.cash_status==='ACTIVE'){
    const tasks=[member.purchases?'registrar compras':'',member.rewards?'canjear premios y aplicar descuentos':''].filter(Boolean);
    lines.push(tasks.length?'Puede '+tasks.join(' y ')+' en '+(member.branch_name||'su sucursal')+'.':'Caja no tiene operaciones habilitadas.');
  }else lines.push(member.cash_status==='REVOKING'?'Caja bloqueada; el retiro de acceso está pendiente de sincronización.':'No tiene acceso a compras ni canjes.');
  if(!has('WALLET_DESIGN','EDIT')&&!has('WALLET_PROGRAMS','EDIT'))lines.push('No puede modificar tarjetas ni promociones.');
  else {
    if(has('WALLET_DESIGN','EDIT'))lines.push('Puede modificar el diseño de tarjetas.');
    if(has('WALLET_PROGRAMS','EDIT'))lines.push('Puede modificar promociones y premios.');
  }
  lines.push(...describeGrants(member.grants.filter(g=>!['WALLET_DESIGN','WALLET_PROGRAMS'].includes(g.scope)||!has(g.scope,'EDIT'))));
  lines.push('No puede contratar servicios ni administrar al equipo.');
  return lines;
}

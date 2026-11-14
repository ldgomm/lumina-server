import { effectiveAccessSummary } from '../../access/access-summary.mjs';
import { identityLabel } from '../../access/identity.mjs';
import { cashMode } from '../../access/team-access.mjs';
import { areas, channels, walletScopes, socialChannels } from '../../shared/domain.mjs';
import { permissionTitles, permissionRules, describeGrants, memberState } from '../../access/team-policy.mjs';
import { button, card, check, disclosure, esc, form, hidden, input, localLink, select, table, timestamp } from './components.mjs';
import { icon } from './icons.mjs';

const states = { ACTIVE: 'Acceso activo', PENDING: 'Por activar', INACTIVE: 'Desactivado', EXPIRED: 'Necesita un código' };
const scopeIcon = { SOCIAL:'social', WALLET:'wallet', MAPS:'maps', WEB:'web', BRAND:'content' };
const alert = error => error ? `<div class="team-alert" role="alert">${esc(error)}</div>` : '';
const grantValues = member => Object.fromEntries((member?.grants || []).map(g => [`${g.scope}.${g.action}`, 'yes']));
const teamForm = (path, actor, body) => form(path, actor, body, 'team-form').replace('<form ', '<form data-team-form ');
function editor(member, branches, values = null, branchError = '') {
  const selected = values || {...grantValues(member),cash_mode:cashMode(member),branch:member.branch_id};
  const controls = (scope, actions) => actions.map(action => `<label class="team-permission"><input type="checkbox" name="${scope}.${action}" value="yes" ${selected[`${scope}.${action}`] === 'yes' ? 'checked' : ''}><span>${esc(permissionTitles[action])}</span></label>`).join('');
  const level = (scope,title,extra='') => `<div class="team-level-row" data-team-scope="${scope}"><div class="team-level-heading"><strong>${esc(title)}</strong><label class="team-level-select" hidden><span class="sr-only">Acceso a ${esc(title)}</span><select data-access-level="${scope}" aria-label="Acceso a ${esc(title)}"></select></label></div><details class="team-custom" open data-custom="${scope}"><summary>Elegir tareas</summary><div class="team-permission-options">${controls(scope,permissionRules[scope].actions)}</div></details>${extra}</div>`;
  const branchOptions=branches?.length?branches.map(b=>[b.id,b.name]):member.branch_id?[[member.branch_id,member.branch_name]]:[];
  // Preserve a failed draft even if the branch list is temporarily unavailable.
  if(selected.branch&&!branchOptions.some(([id])=>id===selected.branch))branchOptions.push([selected.branch,'Sucursal por verificar']);
  const pending=member.cash_status==='PENDING'?'<p class="team-alert">Asignación pendiente. Guarda de nuevo para completarla o elige Sin acceso para retirarla.</p>':member.cash_status==='REVOKING'?'<p class="team-alert">Caja está bloqueada. Guarda de nuevo para confirmar el retiro pendiente.</p>':'';
  const wallet=`<fieldset class="team-module" data-module="WALLET"><legend>${icon('wallet')}Wallet</legend><div class="team-cash-row">${select('cash_mode','Atención en Caja',[['OFF','Sin acceso a Caja'],['BOTH','Compras y canjes'],['PURCHASES','Solo compras'],['REWARDS','Solo canjes']],selected.cash_mode||'OFF')}
    <div data-cash-branch>${select('branch','Sucursal',[['','Elegir sucursal'],...branchOptions],selected.branch||(branchOptions.length===1?branchOptions[0][0]:'')||'')}</div></div>${pending}${branchError?`<p class="team-help">No se pudieron consultar las sucursales. Puedes conservar Caja y cambiar las demás tareas.</p>`:''}
    <details class="team-more"><summary>Más opciones de Wallet</summary>${Object.entries(walletScopes).map(([scope,title])=>level(scope,title)).join('')}${level('WALLET','Solicitudes a Lúmina')}</details></fieldset>`;
  const socialExtra=`<details class="team-platforms"><summary>Permisos por red</summary><p>Opcional: para trabajar solo con algunas redes, deja el acceso general sin permisos.</p>${socialChannels.map(scope=>level(scope,channels[scope])).join('')}</details>`;
  const others=Object.entries(areas).filter(([scope])=>scope!=='WALLET').map(([scope,title])=>`<fieldset class="team-module" data-module="${scope}"><legend>${icon(scopeIcon[scope])}${esc(title)}</legend>${level(scope,'Tareas permitidas',scope==='SOCIAL'?socialExtra:'')}</fieldset>`).join('');
  return `<div data-team-editor data-definitions="${esc(JSON.stringify({rules:permissionRules,titles:permissionTitles}))}"><div class="team-access-list">${wallet}${others}</div><details class="team-access-summary"><summary>Ver resumen del acceso</summary><ul data-access-preview>${describeGrants(Object.entries(selected).filter(([key,value])=>value==='yes'&&key.includes('.')&&permissionRules[key.split('.')[0]]).map(([key])=>{const [scope,action]=key.split('.');return {scope,action};})).map(line=>`<li>${esc(line)}</li>`).join('')}</ul></details></div>`;
}
export function newMemberPage(actor, values = {}, error = '') {
  return `<div class="team-heading">${localLink('/team','← Volver al equipo')}</div>${alert(error)}${card('Añadir persona',teamForm('/team',actor,
    `<div class="fields two">${input('name','Nombre','text','required minlength="2" maxlength="100" autocomplete="name"',values.name)}${input('document','Cédula','text','required inputmode="numeric" maxlength="10" data-identity="document"',values.document)}${input('phone','Teléfono (si lo conoces)','tel','maxlength="30" autocomplete="tel" data-identity="contact" placeholder="099 123 4567"',values.phone)}</div>
    <p class="team-help">La persona confirmará su teléfono al activar el acceso. Después elige sus tareas.</p><div class="team-save">${button('Continuar')}</div>`))}`;
}
export function teamPage(actor, company, directory) {
  const {rows,counts,q,state,area,page,more,total} = directory;
  const link = page => '/team?'+new URLSearchParams({q,state:state,area,page:String(page)});
  const list = table(['Persona','Puede acceder a','Estado',''],rows.map(member=>{
    const scopes=Object.entries(areas).filter(([scope])=>member.grants.some(g=>g.action==='VIEW'&&(g.scope===scope||scope==='SOCIAL'&&socialChannels.includes(g.scope)))).map(([,title])=>title);
    if(member.cash_status==='ACTIVE'){const wallet=scopes.indexOf(areas.WALLET);if(wallet>=0)scopes.splice(wallet,1);scopes.unshift('Wallet · Caja · '+member.branch_name);}
    return [`<strong>${localLink('/team/'+member.id,member.name)}</strong><span class="team-email">${esc(identityLabel(member))}</span>${member.contact_phone?`<a class="team-phone" href="tel:${esc(member.contact_phone)}">${esc(member.contact_phone)}</a>`:'<span class="team-email">Teléfono pendiente</span>'}`,
      scopes.length?scopes.map(s=>`<span class="team-area-tag">${esc(s)}</span>`).join(''):'Sin áreas asignadas',
      `<span class="team-state ${memberState(member).toLowerCase()}">${states[memberState(member)]}</span>${member.cash_status==='REVOKING'?'<span class="team-email">Caja bloqueada · retiro pendiente</span>':''}`,
      localLink('/team/'+member.id,'Gestionar →','team-manage')];
  }),q||state||area?'No hay personas con estos filtros.':'Añade a la primera persona de tu equipo.');
  return `<div class="team-heading"><p>Cada persona, su cuenta y sus tareas.</p>${localLink('/team/new','Añadir persona','btn')}</div>
    <div class="team-stats">${[[counts.total,'Personas'],[counts.active,'Accesos activos'],[counts.pending,'Por activar'],[counts.inactive,'Desactivados']].map(([value,title])=>`<div><strong>${value}</strong><span>${title}</span></div>`).join('')}</div>
    <form method="get" action="/team" class="team-filters">${input('q','Buscar persona','search','maxlength="100"',q)}${select('state','Estado',[['','Todos'],...Object.entries(states)],state)}${select('area','Área',[['','Todas'],['CASH','Caja'],...Object.entries(areas)],area)}${button('Buscar','secondary')}${q||state||area?localLink('/team','Quitar filtros'):''}</form>
    ${card('Tu equipo',`<p class="team-help">${total} ${total===1?'persona':'personas'}${total?' · Página '+(page+1):''}</p>${list}<div class="team-pagination">${page?localLink(link(page-1),'← Anterior','btn secondary'):''}${more?localLink(link(page+1),'Siguiente →','btn secondary'):''}</div>`)}
    ${disclosure('Ayuda de acceso',localLink('/wallet/access','Revisar conexión con Wallet','team-support'))}`;
}
function auditDetails(details) {
  let parsed;try{parsed=JSON.parse(details);}catch{return `<p>${esc(details)}</p>`;}
  if(parsed?.v!==1)return `<p>${esc(details)}</p>`;
  const summary = value => {
    if(!value)return 'Sin asignación anterior';
    const parts=[];
    if(value.name)parts.push(value.name);
    if(value.documentHint)parts.push('Cédula ····'+value.documentHint);
    if(value.grants)parts.push(...describeGrants(value.grants.map(key=>{const [scope,action]=key.split('.');return {scope,action};})));
    if(value.grants&&!value.grants.length)parts.push('Sin áreas de servicios');
    if(value.branch)parts.push(value.branch);
    if('purchases' in value)parts.push(value.purchases?'Compras habilitadas':'Sin compras');
    if('rewards' in value)parts.push(value.rewards?'Canjes habilitados':'Sin canjes');
    if('active' in value)parts.push(value.active?'Activo':'Desactivado');
    if(value.status)parts.push(value.status==='REVOKING'?'Caja bloqueada':value.status==='INACTIVE'?'Caja retirada':value.status);
    if(value.contactUpdated)parts.push('Teléfono actualizado');
    if(value.reason)parts.push(value.reason);
    return parts.join(' · ')||'Sin cambios de permisos';
  };
  return `<dl class="team-audit-diff"><dt>Antes</dt><dd>${esc(summary(parsed.before))}</dd><dt>Después</dt><dd>${esc(summary(parsed.after))}</dd></dl>`;
}
const auditLabels={ACCESO_CREADO:'Acceso creado',PERMISOS_ACTUALIZADOS:'Permisos actualizados',PERSONA_ACTUALIZADA:'Datos actualizados',ACCESO_DESACTIVADO:'Acceso desactivado',ACTIVACIÓN_EMITIDA:'Código renovado',CAJA_AUTORIZADA:'Caja asignada',CAJA_BLOQUEADA:'Caja bloqueada',CAJA_REVOCADA:'Caja retirada',ACCESO_WALLET_PREPARADO:'Wallet preparada',ACCESO_WALLET_REPARADO:'Wallet reparada',CONTRASEÑA_ACTUALIZADA:'Contraseña actualizada',CONTACTO_ACTUALIZADO:'Teléfono actualizado'};
export function memberPage(actor, company, member, branches = null, options = {}) {
  const {values={},error='',section='',history=[],notice='',branchError=''}=options;
  const base='/team/'+member.id;
  const revision = type => hidden('revision',section===type&&values.revision!==undefined?values.revision:member.revision);
  const status=memberState(member);
  const fold=(kind,title,body)=>disclosure(title,body).replace('<details ',error&&section===kind?'<details open ':'<details ');
  let draft=null;
  if(section==='access')draft=values;
  if(section==='permissions')draft={...values,cash_mode:cashMode(member),branch:member.branch_id};
  if(section==='cashier')draft={...grantValues(member),...values,cash_mode:values.purchases==='yes'?(values.rewards==='yes'?'BOTH':'PURCHASES'):'REWARDS'};
  if(section==='revoke')draft={...grantValues(member),...values,cash_mode:'OFF',branch:member.branch_id};
  const accessRevision=['access','permissions','cashier','revoke'].includes(section)&&values.revision!==undefined?values.revision:member.revision;
  const invitationCopy=member.activated?'Cierra sus sesiones y reemplaza su contraseña por una nueva activación.':!member.active?'Reactiva su cuenta con los permisos que ves arriba.':'El código anterior dejará de funcionar.';
  const activity=history.length?`<ol class="team-history">${history.map(row=>`<li><div><strong>${esc(auditLabels[row.action]||row.action)}</strong><time>${timestamp(row.happened_at)}</time></div><span class="team-help">${esc(row.actor_name)}</span>${auditDetails(row.details)}</li>`).join('')}</ol>`:'<p class="team-help">Todavía no hay cambios registrados.</p>';
  return `<div class="team-heading">${localLink('/team','← Volver al equipo')}<span class="team-state ${status.toLowerCase()}">${states[status]}</span></div>
    <p class="team-contact">${esc(identityLabel(member))}${member.contact_phone?` · <a href="tel:${esc(member.contact_phone)}">${esc(member.contact_phone)}</a>`:' · Teléfono pendiente'}</p>${notice?`<p class="team-success" role="status">${esc(notice)}</p>`:''}${alert(error)}${error?localLink(base,'Descartar el borrador y cargar el acceso actual','team-support'):''}
    ${!member.active?'<p class="team-alert">Acceso desactivado. Guardar permisos no reactiva la cuenta.</p>':''}
    ${card('Acceso guardado','<ul class="team-effective">'+effectiveAccessSummary(member).map(line=>'<li>'+esc(line)+'</li>').join('')+'</ul>')}<section id="permissions" class="card team-access-card"><h2>Qué puede hacer</h2><p class="team-help">Elige sus tareas y guarda una sola vez.</p>${teamForm(base+'/access',actor,`${hidden('revision',accessRevision)}${editor(member,branches,draft,branchError)}<div class="team-save team-save-sticky"><span data-save-status role="status">Los cambios se aplican al guardar.</span>${button(member.cash_status==='REVOKING'?'Guardar y completar retiro':'Guardar acceso')}</div>`)}</section>
    <details id="details" class="card team-secondary"${['details','invite','disable'].includes(section)?' open':''}><summary>Datos y acceso</summary>${fold('details','Datos de la persona',teamForm(base+'/details',actor,`${revision('details')}<div class="fields two">${input('name','Nombre','text','required minlength="2" maxlength="100"',section==='details'?values.name:member.name)}${input('document','Cédula','text','required inputmode="numeric" maxlength="10" data-identity="document"',section==='details'?values.document:member.document)}${input('phone','Teléfono','tel','required maxlength="30" autocomplete="tel" data-identity="contact" placeholder="099 123 4567"',section==='details'?values.phone:member.contact_phone)}</div><p class="team-help">Cambiar la cédula cierra sus sesiones y anula los códigos anteriores.</p>${button('Guardar datos','secondary')}`))}
      ${member.activation_expires&&status==='PENDING'?`<p class="team-help">Código válido hasta ${timestamp(member.activation_expires)}.</p>`:''}
      ${fold('invite',!member.active?'Reactivar persona':member.activated?'Restablecer acceso':'Renovar código',form(base+'/invite',actor,`${revision('invite')}<p>${invitationCopy}</p>${check('confirm','Confirmo que la persona deberá activar su acceso de nuevo.',false,true)}${button(!member.active?'Reactivar y generar código':'Generar nuevo código','secondary')}`))}
      ${member.active?fold('disable','Desactivar persona',form(base+'/disable',actor,`${revision('disable')}<p>Se cerrarán sus sesiones y se bloqueará todo su acceso, incluida Caja. El historial se conserva.</p>${check('confirm','Confirmo la baja del acceso completo.',false,true)}${button('Desactivar persona','danger')}`)):''}
    </details><details id="history" class="card team-secondary"><summary>Historial de acceso</summary><p class="team-help">Últimos 30 cambios.</p>${activity}</details>`;
}
export function invitePage(member, code) {
  return card('Acceso listo para activar',`<p>Entrega este código a <strong>${esc(member.name)}</strong> (${esc(identityLabel(member))}). Debe abrir <strong>Activar un acceso</strong> y elegir su contraseña.</p><div class="team-code"><code class="secret">${esc(code)}</code><button type="button" class="secondary" data-copy-activation>Copiar código</button></div><p class="team-help" role="status" data-copy-status>Un solo uso · Válido por 48 horas.</p><div class="actions">${localLink('/team/'+member.id+'#permissions','Elegir tareas y permisos','btn')}${localLink('/team','Volver al equipo','btn secondary')}</div>`);
}

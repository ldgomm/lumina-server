import { areas, channels, walletScopes, socialChannels } from '../../shared/domain.mjs';
import { permissions, permissionTitles, permissionRules, teamPresets, describeGrants, memberState } from '../../access/team-policy.mjs';
import { badge, button, card, check, disclosure, esc, form, hidden, input, localLink, select, table, timestamp } from './components.mjs';
import { icon } from './icons.mjs';

const states = { ACTIVE: 'Acceso activo', PENDING: 'Por activar', INACTIVE: 'Desactivado', EXPIRED: 'Necesita un código' };
const scopeIcon = { SOCIAL:'social', WALLET:'wallet', MAPS:'maps', WEB:'web', BRAND:'content' };
const alert = error => error ? `<div class="team-alert" role="alert">${esc(error)}</div>` : '';
const grantValues = member => Object.fromEntries((member?.grants || []).map(g => [`${g.scope}.${g.action}`, 'yes']));
const teamForm = (path, actor, body) => form(path, actor, body, 'team-form').replace('<form ', '<form data-team-form ');
function editor(member, values = null) {
  const selected = values || grantValues(member);
  const controls = (scope, actions) => actions.map(action => `<label class="team-permission"><input type="checkbox" name="${scope}.${action}" value="yes" ${selected[`${scope}.${action}`] === 'yes' ? 'checked' : ''}><span>${esc(permissionTitles[action])}</span></label>`).join('');
  const areaCards = Object.entries(areas).map(([scope,title]) => `<fieldset class="team-area" data-team-scope="${scope}"><legend>${icon(scopeIcon[scope])}${esc(title)}</legend><div class="team-permission-options">${controls(scope,Object.keys(permissions))}</div>
    ${scope === 'WALLET' ? `<details class="team-wallet-tasks"${Object.keys(walletScopes).some(key=>selected[`${key}.VIEW`]==='yes')?' open':''}><summary>Tareas dentro de Wallet</summary><div>${Object.entries(walletScopes).map(([scope,title])=>`<fieldset data-team-scope="${scope}"><legend>${esc(title)}</legend><div class="team-permission-options">${controls(scope,permissionRules[scope].actions)}</div></fieldset>`).join('')}</div></details><p class="team-help">Caja tiene su propia sucursal y permisos.</p>` : ''}</fieldset>`).join('');
  const platformCards = socialChannels.map(scope=>`<fieldset data-team-scope="${scope}"><legend>${esc(channels[scope])}</legend><div class="team-permission-options">${controls(scope,Object.keys(permissions))}</div></fieldset>`).join('');
  const definitions = JSON.stringify({ rules:permissionRules,titles:permissionTitles,presets:teamPresets });
  return `<div data-team-editor data-definitions="${esc(definitions)}"><div class="team-presets"><span>Empezar con:</span>${Object.entries(teamPresets).map(([key,preset])=>`<button type="button" class="secondary" data-team-preset="${key}">${esc(preset.title)}</button>`).join('')}<button type="button" class="secondary" data-team-preset="CLEAR">Sin permisos</button></div>
    <p class="team-help" data-preset-note>Elige una base o configura las tareas. Los cambios se aplican al guardar.</p>
    <div class="team-editor-grid"><div class="team-areas">${areaCards}
      <details class="team-platforms"${socialChannels.some(scope=>Object.keys(permissions).some(action=>selected[`${scope}.${action}`]==='yes'))?' open':''}><summary>Limitar publicaciones y métricas por red</summary><p>Contenido para redes incluye todas las redes. Para limitarlo, deja esa área sin marcar y elige aquí. Aprobar una pieza nueva requiere Aprobar en Contenido para redes.</p>${platformCards}</details></div>
      <aside class="team-preview"><h3>Así quedará su acceso</h3><ul data-access-preview>${describeGrants(Object.entries(selected).filter(([key,value])=>value==='yes'&&key.includes('.')&&permissionRules[key.split('.')[0]]).map(([key])=>{const [scope,action]=key.split('.');return {scope,action};})).map(line=>`<li>${esc(line)}</li>`).join('')}</ul><p class="team-help">Precios, contrataciones y equipo quedan reservados al dueño.</p></aside></div></div>`;
}
export function newMemberPage(actor, values = {}, error = '') {
  return `<div class="team-heading">${localLink('/equipo','← Volver al equipo')}</div>${alert(error)}${card('Añadir persona',teamForm('/equipo',actor,
    `<div class="fields two">${input('name','Nombre','text','required minlength="2" maxlength="100" autocomplete="name"',values.name)}${input('email','Correo de acceso','email','required maxlength="180" autocomplete="email"',values.email)}</div>
    ${editor(null,values)}<div class="team-save">${button('Crear acceso')}<span>La persona elegirá su contraseña con un código de activación.</span></div>`))}`;
}
export function teamPage(actor, company, directory) {
  const {rows,counts,q,state,area,page,more,total} = directory;
  const link = page => '/equipo?'+new URLSearchParams({q,estado:state,area,pagina:String(page)});
  const list = table(['Persona','Puede acceder a','Estado',''],rows.map(member=>{
    const scopes=Object.entries(areas).filter(([scope])=>member.grants.some(g=>g.action==='VIEW'&&(g.scope===scope||scope==='SOCIAL'&&socialChannels.includes(g.scope)))).map(([,title])=>title);
    if(member.cash_status==='ACTIVE')scopes.push('Caja · '+member.branch_name);
    return [`<strong>${localLink('/equipo/'+member.id,member.name)}</strong><span class="team-email">${esc(member.email)}</span>`,
      scopes.length?scopes.map(s=>`<span class="team-area-tag">${esc(s)}</span>`).join(''):'Sin áreas asignadas',
      `<span class="team-state ${memberState(member).toLowerCase()}">${states[memberState(member)]}</span>${member.cash_status==='REVOKING'?'<span class="team-email">Caja bloqueada · retiro pendiente</span>':''}`,
      localLink('/equipo/'+member.id,'Gestionar →','team-manage')];
  }),q||state||area?'No hay personas con estos filtros.':'Añade a la primera persona de tu equipo.');
  return `<div class="team-heading"><p>Cada persona, su cuenta y sus tareas.</p>${localLink('/equipo/nuevo','Añadir persona','btn')}</div>
    <div class="team-stats">${[[counts.total,'Personas'],[counts.active,'Accesos activos'],[counts.pending,'Por activar'],[counts.inactive,'Desactivados']].map(([value,title])=>`<div><strong>${value}</strong><span>${title}</span></div>`).join('')}</div>
    <form method="get" action="/equipo" class="team-filters">${input('q','Buscar persona','search','maxlength="100"',q)}${select('estado','Estado',[['','Todos'],...Object.entries(states)],state)}${select('area','Área',[['','Todas'],['CASH','Caja'],...Object.entries(areas)],area)}${button('Buscar','secondary')}${q||state||area?localLink('/equipo','Quitar filtros'):''}</form>
    ${card('Tu equipo',`<p class="team-help">${total} ${total===1?'persona':'personas'}${total?' · Página '+(page+1):''}</p>${list}<div class="team-pagination">${page?localLink(link(page-1),'← Anterior','btn secondary'):''}${more?localLink(link(page+1),'Siguiente →','btn secondary'):''}</div>`)}
    ${localLink('/wallet/accesos','Revisar accesos de Wallet','team-support')}`;
}
function auditDetails(details) {
  let parsed;try{parsed=JSON.parse(details);}catch{return `<p>${esc(details)}</p>`;}
  if(parsed?.v!==1)return `<p>${esc(details)}</p>`;
  const summary = value => {
    if(!value)return 'Sin asignación anterior';
    const parts=[];
    if(value.name)parts.push(value.name);
    if(value.email)parts.push(value.email);
    if(value.grants)parts.push(...describeGrants(value.grants.map(key=>{const [scope,action]=key.split('.');return {scope,action};})));
    if(value.grants&&!value.grants.length)parts.push('Sin áreas de servicios');
    if(value.branch)parts.push(value.branch);
    if('purchases' in value)parts.push(value.purchases?'Compras habilitadas':'Sin compras');
    if('rewards' in value)parts.push(value.rewards?'Canjes habilitados':'Sin canjes');
    if('active' in value)parts.push(value.active?'Activo':'Desactivado');
    if(value.status)parts.push(value.status==='REVOKING'?'Caja bloqueada':value.status==='INACTIVE'?'Caja retirada':value.status);
    if(value.reason)parts.push(value.reason);
    return parts.join(' · ')||'Sin cambios de permisos';
  };
  return `<dl class="team-audit-diff"><dt>Antes</dt><dd>${esc(summary(parsed.before))}</dd><dt>Después</dt><dd>${esc(summary(parsed.after))}</dd></dl>`;
}
const auditLabels={ACCESO_CREADO:'Acceso creado',PERMISOS_ACTUALIZADOS:'Permisos actualizados',PERSONA_ACTUALIZADA:'Datos actualizados',ACCESO_DESACTIVADO:'Acceso desactivado',ACTIVACIÓN_EMITIDA:'Código renovado',CAJA_AUTORIZADA:'Caja asignada',CAJA_BLOQUEADA:'Caja bloqueada',CAJA_REVOCADA:'Caja retirada',ACCESO_WALLET_PREPARADO:'Wallet preparada',ACCESO_WALLET_REPARADO:'Wallet reparada',CONTRASEÑA_ACTUALIZADA:'Contraseña actualizada'};
export function memberPage(actor, company, member, branches = null, options = {}) {
  const {values={},error='',section='',history=[],notice='',branchError=''}=options;
  const base='/equipo/'+member.id;
  const revision = type => hidden('revision',section===type&&values.revision!==undefined?values.revision:member.revision);
  const status=memberState(member);
  const fold=(kind,title,body)=>disclosure(title,body).replace('<details ',error&&section===kind?'<details open ':'<details ');
  const value=(name,original)=>section==='caja'?(values[name]??''):original;
  const cashStatus=member.cash_status==='ACTIVE'?'Caja activa':member.cash_status==='REVOKING'?'Caja bloqueada · retiro pendiente':member.cash_status==='PENDING'?'Asignación pendiente':'Sin acceso a Caja';
  let cash=`<p class="team-help">${esc(cashStatus)}${member.branch_name?' · '+esc(member.branch_name):''}</p>`;
  if(branchError)cash+=alert(branchError)+localLink(base+'#caja','Volver a consultar','btn secondary');
  if(member.active&&member.cash_status!=='REVOKING'&&branches?.length)cash+=teamForm(base+'/caja/guardar',actor,`${revision('caja')}${select('branch','Sucursal',branches.map(b=>[b.id,b.name]),value('branch',member.branch_id),'required')}<div class="team-permission-options">${check('purchases','Registrar compras',value('purchases',member.purchases?'yes':'')==='yes')}${check('rewards','Canjear premios y aplicar descuentos',value('rewards',member.rewards?'yes':'')==='yes')}</div>${button('Guardar acceso de Caja')}`);
  else if(member.active&&!branches&&!branchError&&member.cash_status!=='REVOKING')cash+=form(base+'/caja/sucursales',actor,button('Cargar sucursales','secondary'));
  if(['ACTIVE','REVOKING'].includes(member.cash_status))cash+=fold('revocar',member.cash_status==='REVOKING'?'Completar retiro de Caja':'Retirar Caja',teamForm(base+'/caja/revocar',actor,`${revision('revocar')}${input('reason','Motivo','text','required minlength="5" maxlength="500"',section==='revocar'?values.reason:'')}${button(member.cash_status==='REVOKING'?'Reintentar retiro':'Retirar Caja','danger')}`));
  if(!member.active)cash+='<p class="team-help">Esta persona no puede entrar. Sus permisos se conservan para revisarlos antes de reactivarla.</p>';
  const invitationCopy=member.activated?'Cierra sus sesiones y reemplaza su contraseña por una nueva activación.':!member.active?'Reactiva su cuenta con los permisos que ves arriba.':'El código anterior dejará de funcionar.';
  const activity=history.length?`<ol class="team-history">${history.map(row=>`<li><div><strong>${esc(auditLabels[row.action]||row.action)}</strong><time>${timestamp(row.happened_at)}</time></div><span class="team-help">${esc(row.actor_name)}</span>${auditDetails(row.details)}</li>`).join('')}</ol>`:'<p class="team-help">Todavía no hay cambios registrados.</p>';
  return `<div class="team-heading">${localLink('/equipo','← Volver al equipo')}<span class="team-state ${status.toLowerCase()}">${states[status]}</span></div>
    <p class="team-contact">${esc(member.email)}</p>${notice?`<p class="team-success" role="status">${esc(notice)}</p>`:''}${alert(error)}${error?localLink(base,'Descartar el borrador y cargar el acceso actual','team-support'):''}
    <nav class="team-sections" aria-label="Configuración de la persona"><a href="#permisos">Permisos</a><a href="#caja">Caja</a><a href="#datos">Datos y acceso</a><a href="#historial">Historial</a></nav>
    ${!member.active?'<p class="team-alert">Acceso desactivado. Guardar permisos no reactiva la cuenta.</p>':''}
    <section id="permisos" class="card"><h2>Qué puede hacer</h2>${teamForm(base+'/permisos',actor,`${revision('permisos')}${editor(member,section==='permisos'?values:null)}<div class="team-save">${button('Guardar permisos')}<span>Se aplican en su próxima acción, incluso si ya inició sesión.</span></div>`)}</section>
    <section id="caja" class="card"><h2>Caja</h2><p class="team-help">Una sucursal, con compras y canjes independientes.</p>${cash}</section>
    <section id="datos" class="card"><h2>Datos y acceso</h2>${fold('datos','Nombre y correo',teamForm(base+'/datos',actor,`${revision('datos')}<div class="fields two">${input('name','Nombre','text','required minlength="2" maxlength="100"',section==='datos'?values.name:member.name)}${input('email','Correo de acceso','email','required maxlength="180"',section==='datos'?values.email:member.email)}</div><p class="team-help">Cambiar el correo cierra sus sesiones y anula los códigos anteriores.</p>${button('Guardar datos','secondary')}`))}
      ${member.activation_expires&&status==='PENDING'?`<p class="team-help">Código válido hasta ${timestamp(member.activation_expires)}.</p>`:''}
      ${fold('invitar',!member.active?'Reactivar persona':member.activated?'Restablecer acceso':'Renovar código',form(base+'/invitar',actor,`${revision('invitar')}<p>${invitationCopy}</p>${check('confirm','Confirmo que la persona deberá activar su acceso de nuevo.',false,true)}${button(!member.active?'Reactivar y generar código':'Generar nuevo código','secondary')}`))}
      ${member.active?fold('desactivar','Desactivar persona',form(base+'/desactivar',actor,`${revision('desactivar')}<p>Se cerrarán sus sesiones y se bloqueará todo su acceso, incluida Caja. El historial se conserva.</p>${check('confirm','Confirmo la baja del acceso completo.',false,true)}${button('Desactivar persona','danger')}`)):''}
    </section><section id="historial" class="card"><h2>Historial de acceso</h2><p class="team-help">Últimos 30 cambios.</p>${activity}</section>`;
}
export function invitePage(member, code) {
  return card('Acceso listo para activar',`<p>Entrega este código a <strong>${esc(member.name)}</strong> (${esc(member.email)}). Debe abrir <strong>Activar un acceso</strong> y elegir su contraseña.</p><div class="team-code"><code class="secret">${esc(code)}</code><button type="button" class="secondary" data-copy-activation>Copiar código</button></div><p class="team-help" role="status" data-copy-status>Un solo uso · Válido por 48 horas.</p><div class="actions">${localLink('/equipo/'+member.id,'Revisar permisos y Caja','btn')}${localLink('/equipo','Volver al equipo','btn secondary')}</div>`);
}

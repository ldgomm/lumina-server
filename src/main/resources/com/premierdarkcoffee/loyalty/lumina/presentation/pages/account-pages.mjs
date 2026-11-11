import { channels, areas, walletScopes, socialChannels } from '../../shared/domain.mjs';
import { permissions } from '../../access/accounts.mjs';
import { badge, button, card, check, disclosure, esc, form, hidden, input, label, localLink, message, select, table } from './components.mjs';

const password = (name,caption,extra='') => input(name,caption,'password',extra || 'required minlength="12" maxlength="128" autocomplete="new-password"');
export function publicPage(path,setupAvailable) {
  if (path === '/registro') return {
    title:'Registra tu negocio como cliente', description:'Crea tu espacio de trabajo y recibe un video de cortesía de Lúmina Digital.',
    body:card('Datos del responsable',form('/registro',null,`<div class="fields two">
      ${input('company','Nombre del negocio','text','required maxlength="100" autocomplete="organization"')}
      ${input('name','Nombre del responsable','text','required maxlength="100" autocomplete="name"')}
      ${input('document','Cédula','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" autocomplete="off"')}
      ${input('phone','Teléfono','tel','required maxlength="25" autocomplete="tel"')}
      ${input('email','Correo','email','required maxlength="180" autocomplete="email"')}
      ${password('password','Contraseña')}</div>
      <p class="muted">Usamos tus datos de contacto para administrar los servicios del negocio. Guardamos una huella y los últimos cuatro dígitos de la cédula para identificar el registro.</p>
      ${check('consent','Autorizo el registro de estos datos para gestionar mi cuenta.',false,true)}
      ${button('Crear mi cuenta')}`),'Tu cuenta es personal. Desde Equipo y accesos puedes crear las de tus colaboradores.'),
  };
  if (path === '/activar') return {
    title:'Activa tu acceso', description:'Usa el código que te entregó el dueño del negocio y elige tu contraseña.',
    body:card('Activación de colaborador',form('/activar',null,`${input('code','Código de activación','password','required minlength="43" maxlength="43" autocomplete="off"')}
      ${password('password','Nueva contraseña')}${button('Activar y entrar')}`)),
  };
  if (path === '/configurar') return {
    title:'Configura la cuenta de Lúmina', description:'Crea una sola vez el acceso de quien administra Lúmina Digital. El código aparece en la terminal donde iniciaste el portal.',
    body:card('Administrador de agencia',form('/configurar',null,`
      ${input('code','Código de configuración','password','required minlength="43" maxlength="43" autocomplete="off"')}
      ${input('name','Nombre del administrador','text','required maxlength="100" autocomplete="name"')}
      ${input('email','Correo','email','required maxlength="180" autocomplete="email"')}
      ${password('password','Contraseña')}${button('Crear cuenta de agencia')}`)),
  };
  return {
    title:'Tu marketing, en un solo lugar.', description:'Contenido, Wallet, membresías y resultados en el espacio privado de tu negocio.',
    body:`<div class="auth-grid">${card('Ingresa a tu cuenta',form('/entrar',null,`
      ${input('email','Correo','email','required maxlength="180" autocomplete="username"')}
      ${password('password','Contraseña','required maxlength="128" autocomplete="current-password"')}
      ${button('Ingresar')}`))}
      ${card('Empieza aquí',`<p>Si tienes un negocio, crea tu cuenta y solicita un video de cortesía. Si te dieron un acceso de equipo, actívalo con tu código.</p>
      <div class="actions">${localLink('/registro','Registrar mi negocio','btn secondary')}${localLink('/activar','Activar un acceso','btn secondary')}${setupAvailable ? localLink('/configurar','Configurar la agencia','btn secondary') : ''}</div>`)}</div>`,
  };
}
export function accountPage(actor) {
  return card('Cambia tu contraseña',`<p class="muted">${esc(actor.email)} · ${esc(label(actor.kind))}</p>
    ${form('/cuenta/clave',actor,`${password('current','Contraseña actual','required maxlength="128" autocomplete="current-password"')}
    ${password('password','Nueva contraseña')}${button('Actualizar contraseña')}`)}`,
  'Al guardarla se cierran tus otras sesiones.');
}
function matrix(member) {
  const chosen=(scope,action)=>Boolean(member?.grants.some(g=>g.scope===scope&&g.action===action));
  const rows=Object.entries(areas).map(([scope,name])=>[esc(name),...Object.entries(permissions).map(([action,caption])=>check(`${scope}.${action}`,caption,chosen(scope,action)))]);
  const granular=Object.entries(walletScopes).map(([scope,name])=>[esc(name),check(scope+'.VIEW','Ver',chosen(scope,'VIEW')),scope==='WALLET_REPORTS'?'—':check(scope+'.EDIT','Modificar',chosen(scope,'EDIT'))]);
  const legacy=socialChannels.map(scope=>[esc(channels[scope]),...Object.entries(permissions).map(([action,caption])=>check(`${scope}.${action}`,caption,chosen(scope,action)))]);
  return table(['Área',...Object.values(permissions)],rows)+disclosure('Permisos por plataforma',`<p class="muted">Contenido para redes da acceso al trabajo común y a todas sus publicaciones. Los permisos por plataforma limitan los enlaces y métricas visibles y permiten ver o solicitar contenido común. Para aprobar nuevas piezas, activa Aprobar en Contenido para redes. Las restricciones de solicitudes anteriores se conservan.</p>${table(['Plataforma',...Object.values(permissions)],legacy)}`)+
    disclosure('Áreas de fidelización digital',`<p class="muted">Activa Ver en Fidelización digital y elige las tareas autorizadas. Caja y su sucursal se asignan en la sección de Caja.</p>${table(['Área de Wallet','Consulta','Cambios'],granular)}`);
}
export function teamPage(actor,company,members) {
  const list = table(['Persona','Áreas de Lúmina','Loyalty · Caja','Acceso'],members.map(member=>[
    `${localLink('/equipo/' + member.id,member.name)}<div class="muted">${esc(member.email)}</div>`,
    member.grants.filter(g=>g.action==='VIEW').map(g=>badge(g.scope)).join(' ') || '—',
    member.cash_status ? `${badge(member.cash_status)} ${esc(member.branch_name)}` : '—',
    badge(!member.active ? 'INACTIVE' : member.activated ? 'ACTIVE' : 'PENDING'),
  ]),'Crea un acceso para la primera persona de tu equipo.');
  return `${card('Personas del negocio',list)}
    ${card('Fidelización digital',company.loyalty_tenant?`<p><strong>${esc(company.loyalty_name)}</strong> está asociado a este negocio. Tu equipo usa su misma cuenta de Lúmina.</p>`:'<p>Lúmina debe activar la fidelización y asociar el registro existente del negocio. Después podrás asignar Caja y las demás áreas desde aquí.</p>')}
    ${company.approved ? card('Añadir colaborador',form('/equipo',actor,`<div class="fields two">
      ${input('name','Nombre','text','required maxlength="100" autocomplete="off"')}
      ${input('email','Correo del colaborador','email','required maxlength="180" autocomplete="off"')}</div>
      <p class="muted">Puedes combinar áreas y tareas. Deja todos vacíos para configurar únicamente Caja en el siguiente paso.</p>
      ${matrix()}${button('Crear acceso')}`)) : card('Añadir colaborador',message('La agencia debe verificar tu negocio antes de habilitar los accesos del equipo.'))}`;
}
export function memberPage(actor,company,member,branches = null) {
  const base = '/equipo/' + member.id;
  let cash = message('La agencia debe activar la fidelización del negocio.');
  if (company.loyalty_tenant) {
    cash = `${member.cash_status ? `<p>${badge(member.cash_status)} <strong>${esc(member.branch_name)}</strong> ·
      ${member.purchases ? 'Compras' : ''}${member.purchases && member.rewards ? ' y ' : ''}${member.rewards ? 'canjes' : ''}</p>` : ''}
      ${member.active && member.cash_status !== 'REVOKING' ?
        branches ? form(base + '/caja/guardar',actor,`
          ${select('branch','Sucursal',branches.map(b=>[b.id,b.name]),member.branch_id,'required')}
          <div class="actions">${check('purchases','Registrar compras',Boolean(member.purchases))}
          ${check('rewards','Canjear premios y aplicar descuentos',Boolean(member.rewards))}</div>
          ${button('Guardar acceso de Caja')}`) :
        form(base + '/caja/sucursales',actor,`${button('Consultar sucursales','secondary')}`) : ''}
      ${['ACTIVE','REVOKING'].includes(member.cash_status) ? disclosure('Revocar acceso de Caja',
        form(base + '/caja/revocar',actor,`${input('reason','Motivo','text','required minlength="5" maxlength="500"')}
          ${button('Revocar Caja','danger')}`)) : ''}`;
  }
  return `<div class="actions">${localLink('/equipo','← Equipo y accesos')}</div>
    ${card('Permisos de Lúmina',form(base + '/permisos',actor,`${hidden('revision',member.revision)}${matrix(member)}
      ${button('Guardar permisos')}`),'Activa Ver en cada área donde la persona pueda solicitar contenido o aprobar entregas.')}
    ${card('Loyalty · Caja',cash,'La persona entra a Caja con su cuenta de Lúmina y opera en la sucursal asignada. Loyalty conserva la auditoría de sus compras y canjes.')}
    ${card('Credencial de acceso',`<p>${esc(member.email)} · ${badge(!member.active ? 'INACTIVE' : member.activated ? 'ACTIVE' : 'PENDING')}</p>
      <div class="actions">${form(base + '/invitar',actor,button('Emitir nuevo código','secondary'))}
      ${member.active ? form(base + '/desactivar',actor,`${check('confirm','Confirmo la baja del acceso completo.',false,true)}${button('Desactivar persona','danger')}`) : ''}</div>`,
      'La baja cierra las sesiones de la persona. Si había una Caja delegada, completa su retiro en la sección anterior.')}`;
}
export function invitePage(member,code) {
  return card('Código de un solo uso',`<p>Entrega este código a <strong>${esc(member.name)}</strong> para que abra <strong>Activar un acceso</strong> y elija su contraseña. Vence en 48 horas.</p>
    <code class="secret">${esc(code)}</code><div class="actions">${localLink('/equipo/'+member.id,'Configurar acceso de Caja','btn')}
    ${localLink('/equipo','Volver al equipo','btn secondary')}</div>`);
}

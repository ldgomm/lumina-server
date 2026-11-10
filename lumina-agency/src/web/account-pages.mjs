import { channels } from '../domain.mjs';
import { permissions } from '../accounts/accounts.mjs';
import { badge, button, card, check, disclosure, esc, form, hidden, input, label, localLink, message, select, table } from './components.mjs';

const password = (name,caption,extra='') => input(name,caption,'password',extra || 'required minlength="12" maxlength="128" autocomplete="new-password"');
export function publicPage(path,setupAvailable) {
  if (path === '/registro') return {
    title:'Registra tu negocio', description:'Crea tu espacio de trabajo y recibe un video de cortesía de Lúmina Digital.',
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
    title:'Configura la cuenta de Lúmina', description:'La terminal local muestra el código de configuración inicial.',
    body:card('Administrador de agencia',form('/configurar',null,`
      ${input('code','Código de configuración','password','required minlength="43" maxlength="43" autocomplete="off"')}
      ${input('name','Nombre del administrador','text','required maxlength="100" autocomplete="name"')}
      ${input('email','Correo','email','required maxlength="180" autocomplete="email"')}
      ${password('password','Contraseña')}${button('Crear cuenta de agencia')}`)),
  };
  return {
    title:'Tu marketing, en un solo lugar.', description:'Solicitudes, producción, membresías y resultados en el espacio privado de tu negocio.',
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
  return table(['Área',...Object.values(permissions)], Object.entries(channels).map(([key,name]) => [
    esc(name),
    ...Object.entries(permissions).map(([action,caption]) => check(`${key}.${action}`,caption,
      member?.grants.some(grant=>grant.scope===key && grant.action===action))),
  ]));
}
export function teamPage(actor,company,members) {
  const list = table(['Persona','Áreas de Lúmina','Loyalty · Caja','Acceso'],members.map(member=>[
    `${localLink('/equipo/' + member.id,member.name)}<div class="muted">${esc(member.email)}</div>`,
    member.grants.filter(g=>g.action==='VIEW').map(g=>badge(g.scope)).join(' ') || '—',
    member.cash_status ? `${badge(member.cash_status)} ${esc(member.branch_name)}` : '—',
    badge(!member.active ? 'INACTIVE' : member.activated ? 'ACTIVE' : 'PENDING'),
  ]),'Crea un acceso para la primera persona de tu equipo.');
  return `${card('Personas del negocio',list)}
    ${card('Conexión con Loyalty', company.loyalty_tenant ?
      `<p>Negocio vinculado: <strong>${esc(company.loyalty_name)}</strong>. Las asignaciones de Caja usan las sucursales y permisos de este negocio.</p>` :
      form('/equipo/loyalty/vincular',actor,`<div class="fields two">
        ${input('slug','Código de negocio de Loyalty','text','required maxlength="60" autocomplete="off"')}
        ${ownerCredential()}</div>${check('confirm','Confirmo que es el mismo negocio que administro en Lúmina.',false,true)}${button('Vincular Loyalty')}`),
    'Para vincular, usa el código del negocio que aparece en su enlace de registro de tarjetas y una credencial vigente de dueño.')}
    ${company.approved ? card('Añadir colaborador',form('/equipo',actor,`<div class="fields two">
      ${input('name','Nombre','text','required maxlength="100" autocomplete="off"')}
      ${input('email','Correo del colaborador','email','required maxlength="180" autocomplete="off"')}</div>
      <p class="muted">Puedes combinar cualquier canal. Deja todos vacíos para configurar únicamente Caja en el siguiente paso.</p>
      ${matrix()}${button('Crear acceso')}`)) : card('Añadir colaborador',message('La agencia debe verificar tu negocio antes de habilitar los accesos del equipo.'))}`;
}
const ownerCredential = () => input('credential','Credencial de dueño de Loyalty','password','required minlength="43" maxlength="43" autocomplete="off"');
export function memberPage(actor,company,member,branches = null) {
  const base = '/equipo/' + member.id;
  let cash = message('Vincula primero el negocio de Loyalty desde Equipo y accesos.');
  if (company.loyalty_tenant) {
    cash = `${member.cash_status ? `<p>${badge(member.cash_status)} <strong>${esc(member.branch_name)}</strong> ·
      ${member.purchases ? 'Compras' : ''}${member.purchases && member.rewards ? ' y ' : ''}${member.rewards ? 'canjes' : ''}</p>` : ''}
      ${member.active && member.cash_status !== 'REVOKING' ?
        branches ? form(base + '/caja/guardar',actor,`
          ${select('branch','Sucursal',branches.map(b=>[b.id,b.name]),member.branch_id,'required')}
          <div class="actions">${check('purchases','Registrar compras',Boolean(member.purchases))}
          ${check('rewards','Canjear premios y aplicar descuentos',Boolean(member.rewards))}</div>
          ${ownerCredential()}${button('Guardar acceso de Caja')}`) :
        form(base + '/caja/sucursales',actor,`${ownerCredential()}${button('Consultar sucursales','secondary')}`) : ''}
      ${['ACTIVE','REVOKING'].includes(member.cash_status) ? disclosure('Revocar acceso de Caja',
        form(base + '/caja/revocar',actor,`${ownerCredential()}${input('reason','Motivo','text','required minlength="5" maxlength="500"')}
          ${button('Revocar Caja','danger')}`)) : ''}`;
  }
  return `<div class="actions">${localLink('/equipo','← Equipo y accesos')}</div>
    ${card('Permisos de Lúmina',form(base + '/permisos',actor,`${hidden('revision',member.revision)}${matrix(member)}
      ${button('Guardar permisos')}`),'Activa Ver en cada canal donde la persona pueda solicitar contenido o aprobar entregas.')}
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

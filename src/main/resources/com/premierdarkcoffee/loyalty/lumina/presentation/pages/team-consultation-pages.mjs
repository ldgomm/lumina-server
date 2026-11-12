import { describeGrants, memberState } from '../../access/team-policy.mjs';
import { badge, button, card, disclosure, esc, hidden, input, localLink, number, table } from './components.mjs';
import { icon } from './icons.mjs';

const states = {ACTIVE:'Acceso activo',PENDING:'Por activar',INACTIVE:'Desactivado',EXPIRED:'Activación vencida'};
function accessSummary(member) {
  if(member.kind==='OWNER')return '<p class="team-help">Administra su negocio y los permisos de su equipo.</p>';
  const tasks = describeGrants(member.grants);
  if(member.cash_status==='ACTIVE')tasks.unshift(`Wallet · Caja (${member.branch_name}): ${[
    member.purchases?'registrar compras':null,member.rewards?'canjear premios y aplicar descuentos':null].filter(Boolean).join(' y ')}`);
  if(member.cash_status==='REVOKING')tasks.unshift('Caja bloqueada · retiro pendiente');
  if(member.cash_status==='PENDING')tasks.unshift('Caja pendiente de completar · sin acceso operativo');
  if(!tasks.length)return '<span class="team-help">Sin tareas asignadas</span>';
  const list=`${memberState(member)!=='ACTIVE'?'<p class="team-help">Las tareas están guardadas; el acceso aún no está activo.</p>':''}<ul class="team-read-tasks">${tasks.map(task=>`<li>${esc(task)}</li>`).join('')}</ul>`;
  return disclosure('Ver tareas asignadas',list);
}
export function teamsConsultationPage(data) {
  const {company,rows,total,q,page,more}=data;
  const link=(changes={})=>'/equipos?'+new URLSearchParams({...(company?{empresa:company.id}:{}),q,pagina:String(page),...changes});
  const filter=`<form method="get" action="/equipos" class="team-filters">${company?hidden('empresa',company.id):''}${input('q',company?'Buscar persona':'Buscar negocio','search','maxlength="100"',q)}${button('Buscar','secondary')}${q?localLink(link({q:'',pagina:'0'}),'Quitar búsqueda'):''}</form>`;
  const pagination=`<div class="team-pagination">${page?localLink(link({pagina:String(page-1)}),'← Anterior','btn secondary'):''}${more?localLink(link({pagina:String(page+1)}),'Siguiente →','btn secondary'):''}</div>`;
  if(!company)return `<div class="team-heading"><p>Consulta los equipos de tus negocios.</p>${badge('Solo consulta')}</div>${filter}
    <p class="team-help">${number(total)} ${total===1?'negocio':'negocios'}</p>
    <section class="team-company-grid" aria-label="Equipos por negocio">${rows.map(row=>`<a class="team-company-card" href="/equipos?empresa=${esc(row.id)}">${icon('clients')}<div><h2>${esc(row.name)}</h2><p>${number(row.people)} ${row.people===1?'persona registrada':'personas registradas'}</p><span>Ver equipo →</span></div></a>`).join('')||'<p class="empty">No hay negocios con esta búsqueda.</p>'}</section>${pagination}`;
  return `<div class="team-heading">${localLink('/equipos','← Todos los equipos')}${localLink('/inicio?empresa='+company.id,'Ver negocio →')}</div>
    <p class="team-help">Los permisos los administra el dueño del negocio.</p>${filter}${card('Personas y tareas',`
    <p class="team-help">${number(total)} ${total===1?'persona':'personas'} · Página ${page+1}</p>${table(['Persona','Rol','Estado','Tareas asignadas'],rows.map(member=>[
      `<strong>${esc(member.name)}</strong><span class="team-email">${esc(member.email)}</span>`,
      badge(member.kind),`<span class="team-state ${memberState(member).toLowerCase()}">${states[memberState(member)]}</span>`,
      accessSummary(member)]),'No hay personas con esta búsqueda.')}${pagination}`)}`;
}

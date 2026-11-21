import { agencyFollowUpLinks } from './agency-follow-up.mjs';
import { businessStates } from '../../businesses/control.mjs';
import { operationLabels } from '../../businesses/operation-state.mjs';
import { badge, button, esc, hidden, input, localLink, number, select } from './components.mjs';

export function businessDirectoryPage({ rows, total, page, more, counts, q, state, verification, sort }) {
  const url = changes => '/businesses?' + new URLSearchParams({ q, state, verification, sort, ...changes });
  const filtered = Boolean(q || state || verification);
  const states = [['','Negocios'],['ACTIVE','En operación'],['STOPPED','Detenidos'],['ARCHIVED','Eliminados']];
  const countKeys = ['', 'ACTIVE', 'STOPPED', 'ARCHIVED'];
  const countsByState = [counts.total, counts.active, counts.stopped, counts.archived];
  return `<section class="card business-directory">
    ${agencyFollowUpLinks}<form method="get" action="/businesses" class="directory-filter">
      ${hidden('state',state)}
      <div class="directory-search">${input('q','Buscar negocio o contacto','search','maxlength="100" placeholder="Nombre, cédula, RUC o teléfono"',q)}${button('Buscar','secondary')}</div>
      <details class="directory-options"${verification || !['','ACTIVE','STOPPED','ARCHIVED'].includes(state) || sort!=='ATTENTION'?' open':''}><summary>Más filtros</summary><div>
        ${select('verification','Registro',[['','Todos'],['PENDING','Por verificar'],['VERIFIED','Verificado']],verification)}
        ${select('sort','Ordenar',[['ATTENTION','Requieren atención primero'],['NAME','Nombre'],['RECENT','Más recientes']],sort)}
      </div></details>
    </form>
    <nav class="directory-overview" aria-label="Estado de los negocios">${states.map(([value,label],i)=>`<a href="${esc(url({state:value,page:'0'}))}"${state===value?' aria-current="page"':''}><span>${label}</span><strong>${number(countsByState[i]||0)}</strong></a>`).join('')}</nav>
    ${counts.pending?`<p class="directory-alert">${localLink(url({state:'PENDING',page:'0'}),`${number(counts.pending)} ${counts.pending===1?'cambio pendiente':'cambios pendientes'} de sincronizar →`)}</p>`:''}
    <div class="split directory-results"><h2>${number(total)} ${total===1?'negocio':'negocios'}${state&&!countKeys.includes(state)?' · '+esc(operationLabels[state]||businessStates[state]):''}</h2>${filtered?localLink('/businesses','Limpiar filtros'):''}</div>
    ${q||verification?'<p class="directory-caption">Los contadores corresponden a esta búsqueda y al filtro de registro.</p>':''}
    <div class="business-directory-list">${rows.map(row=>{
      const blocked=row.business_state!=='ACTIVE',count=row.unfinished_requests;
      const workLabel=`${number(count)} ${count===1?'solicitud':'solicitudes'} ${blocked?(count===1?'detenida':'detenidas'):'en curso'}`;
      const phone=String(row.phone||'').replace(/[\s()-]/g,'');
      const contact=/^\+?\d{7,15}$/.test(phone)?`<a href="tel:${esc(phone)}" aria-label="${esc('Llamar a '+row.name)}">${esc(row.phone)}</a>`:esc(row.phone);
      return `<article class="business-directory-row">
        <div class="business-directory-name"><span class="business-monogram" aria-hidden="true">${esc(row.name.trim().charAt(0).toUpperCase())}</span><div><h3>${localLink('/admin/businesses/'+row.id,row.name)}</h3><p>${esc(row.owner_name||'Responsable pendiente')}</p><p class="business-contact">${contact}</p>
        ${count?`<p class="business-work-link">${localLink('/requests?'+new URLSearchParams({company:row.id,view:blocked?'blocked':'open'}),workLabel+' →')}</p>`:''}</div></div>
        <div class="business-directory-state">${badge(row.archived_at?'Eliminado':operationLabels[row.business_state]||businessStates[row.state],blocked?'warning':'success')}${row.archived_at&&row.pending_id?badge('Por sincronizar','warning'):''}<small>${row.approved?'Registro verificado':'Registro por verificar'}</small></div>
        <div class="business-directory-actions">${localLink('/admin/businesses/'+row.id,'Administrar','btn secondary')}${localLink('/admin/businesses/'+row.id+'?view=wallet','Cobros de Wallet')}${localLink('/admin/businesses/'+row.id+'/team','Equipo y permisos')}${localLink('/home?company='+row.id,blocked?'Consultar historial':'Consultar negocio')}</div>
      </article>`;
    }).join('')||`<div class="empty"><strong>${filtered?'No hay coincidencias':'Aún no hay negocios'}</strong><p>${filtered?'Prueba otra búsqueda o limpia los filtros.':'Los negocios aparecerán aquí cuando creen su cuenta.'}</p></div>`}</div>
    <nav class="account-pagination" aria-label="Páginas de negocios"><span>${total?`${page*25+1}–${Math.min((page+1)*25,total)} de ${number(total)}`:'0 negocios'}</span><div class="actions">${page>0?localLink(url({page:page-1}),'← Anterior','btn secondary'):''}${more?localLink(url({page:page+1}),'Siguiente →','btn secondary'):''}</div></nav>
  </section>`;
}

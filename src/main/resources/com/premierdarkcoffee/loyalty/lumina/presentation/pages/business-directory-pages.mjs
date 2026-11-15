import { businessStates } from '../../businesses/control.mjs';
import { badge, button, esc, input, localLink, number, select } from './components.mjs';
export function businessDirectoryPage({ rows, total, page, more, counts, q, state, verification, sort }) {
  const url = changes => '/businesses?' + new URLSearchParams({ q, state: state, verification: verification, sort: sort, ...changes });
  return `<section class="directory-overview" aria-label="Todos los negocios">
    <a href="/businesses"><span>Negocios</span><strong>${number(counts.total)}</strong></a>
    <a href="/businesses?state=ACTIVE"><span>Operativos</span><strong>${number(counts.active || 0)}</strong></a>
    <a href="/businesses?state=PENDING"><span>Por sincronizar</span><strong>${number(counts.pending || 0)}</strong></a>
    <a href="/businesses?verification=PENDING"><span>Por verificar</span><strong>${number(counts.unverified || 0)}</strong></a>
  </section><section class="card business-directory">
    <form method="get" action="/businesses" class="directory-filter">
      ${input('q', 'Buscar negocio o contacto', 'search', 'maxlength="100" placeholder="Nombre, cédula, RUC o teléfono"', q)}
      ${select('state', 'Estado del servicio', [['', 'Negocios vigentes'], ...Object.entries(businessStates), ['PENDING', 'Por sincronizar'], ['ARCHIVED','Eliminados']], state)}
      ${select('verification', 'Registro', [['', 'Todos'], ['PENDING', 'Por verificar'], ['VERIFIED', 'Verificado']], verification)}
      ${select('sort', 'Ordenar', [['ATTENTION', 'Requieren atención primero'], ['NAME', 'Nombre'], ['RECENT', 'Más recientes']], sort)}
      ${button('Buscar', 'secondary')}
    </form><div class="split"><h2>${number(total)} ${total === 1 ? 'negocio' : 'negocios'}</h2>${q || state || verification ? localLink('/businesses', 'Limpiar filtros') : ''}</div>
    <div class="business-directory-list">${rows.map(row => `<article class="business-directory-row">
      <div class="business-directory-name"><span class="business-monogram" aria-hidden="true">${esc(row.name.trim().charAt(0).toUpperCase())}</span><div><h3>${localLink('/admin/businesses/' + row.id, row.name)}</h3><p>${esc(row.owner_name || 'Responsable pendiente')} · ${esc(row.phone)}</p></div></div>
      <div class="business-directory-state">${badge(row.archived_at?'Eliminado':businessStates[row.state], row.state === 'ACTIVE' && !row.pending_id ? 'success' : 'warning')}${row.pending_id ? badge('Por sincronizar', 'warning') : ''}<small>${row.approved ? 'Registro verificado' : 'Registro por verificar'}</small></div>
      <div class="business-directory-actions">${localLink('/admin/businesses/' + row.id, 'Administrar', 'btn secondary')}${localLink('/home?company=' + row.id, 'Consultar negocio')}${localLink('/admin/businesses/'+row.id+'/team','Equipo y permisos')}</div>
    </article>`).join('') || `<div class="empty"><strong>${counts.total ? 'No hay coincidencias' : 'Aún no hay negocios'}</strong><p>${counts.total ? 'Prueba otro nombre o limpia los filtros.' : 'Los negocios aparecerán aquí cuando creen su cuenta.'}</p></div>`}</div>
    <nav class="account-pagination" aria-label="Páginas de negocios"><span>${total ? `${page * 25 + 1}–${Math.min((page + 1) * 25, total)} de ${number(total)}` : '0 negocios'}</span><div class="actions">${page > 0 ? localLink(url({ page: page - 1 }), '← Anterior', 'btn secondary') : ''}${more ? localLink(url({ page: page + 1 }), 'Siguiente →', 'btn secondary') : ''}</div></nav>
  </section>`;
}

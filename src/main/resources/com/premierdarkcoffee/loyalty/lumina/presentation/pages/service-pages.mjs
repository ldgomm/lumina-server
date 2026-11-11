import { channels, localDay, services } from '../../shared/domain.mjs';
import { metrics } from '../../analytics/reporting.mjs';
import { badge, button, card, disclosure, displayAmount, esc, external, form, hidden, input, label, message,
  number, select, table, textarea, timestamp } from './components.mjs';
import { contractForm } from './production-pages.mjs';

const labels = items => items.map(key=>[key,label(key)]);
const descriptions = items => items.map(item=>`<li><strong>${item.quantity}</strong> · ${esc(label(item.service))}</li>`).join('');
function planCard(actor,url,plan) {
  return `<article class="subcard plan"><div class="split"><h3>${esc(plan.name)}</h3>${badge(plan.term)}</div>
    <p class="plan-price">${esc(displayAmount(plan.price_minor))}</p>
    <p class="prewrap">${esc(plan.description)}</p><ul>${descriptions(plan.items)}</ul>
    ${plan.wallet!=='NONE' ? `<p>${badge(plan.wallet,'success')}</p>` : ''}
    ${actor.kind==='OWNER' && plan.published ? form(url('/solicitudes'),actor,hidden('type','PLAN')+hidden('plan',plan.id)+
      button(plan.price_minor===null ? 'Solicitar cotización' : 'Solicitar contratación')) : ''}
    ${actor.kind==='AGENCY' && plan.published ? form(url('/planes/retirar'),actor,hidden('plan',plan.id)+button('Retirar oferta','secondary')) : ''}
    ${!plan.published ? badge('Retirado') : ''}</article>`;
}
export function plansPage({actor,company,url,plans,contracts}) {
  const agency = actor.kind==='AGENCY';
  const active = plans.filter(plan=>plan.published);
  const catalog = `<div class="card-grid">${plans.map(plan=>planCard(actor,url,plan)).join('') || message('Lúmina aún no ha publicado ofertas.')}</div>`;
  const periods = contracts.map(c=>{
    const status = c.cancelled_at ? 'Cancelado' : c.starts_on>localDay() ? 'Programado' : c.ends_before<=localDay() ? 'Finalizado' : 'Vigente';
    return `<article class="subcard"><div class="split"><h3>${esc(c.name)}</h3>${badge(status)}</div>
      <p>${esc(displayAmount(c.agreed_minor))} · ${esc(c.starts_on)} → ${esc(c.ends_before)} (fin exclusivo)</p>
      ${c.wallet!=='NONE' ? badge(c.wallet,'success') : ''}
      ${table(['Servicio','Incluidos','Entregados','Reservados','Libres'],c.items.map(item=>[
        esc(label(item.service)),item.quantity,item.used,item.reserved,item.quantity-item.used-item.reserved,
      ]))}
      ${agency && !c.cancelled_at && c.ends_before>localDay() ? disclosure('Cancelar período comercial',
        form(url('/planes/cancelar'),actor,hidden('contract',c.id)+input('reason','Motivo','text','required minlength="5" maxlength="500"')+
        button('Cancelar período','danger'))) : ''}</article>`;
  }).join('');
  const create = agency ? disclosure('Publicar una oferta',form(url('/planes'),actor,`
    <div class="fields three">${input('name','Nombre del plan','text','required maxlength="100"')}
    ${select('term','Modalidad',labels(['MONTHLY','ONE_OFF']))}
    ${input('price','Precio en USD (vacío para a medida)','text','inputmode="decimal"')}</div>
    ${textarea('description','Descripción','maxlength="1200"')}
    <p class="muted">El diseño de marca está disponible al elegir modalidad Individual.</p><div class="fields three">${Object.entries(services).filter(([key])=>key!=='WALLET').map(([key,name])=>
      input(key,name,'number','min="0" max="100"','0')).join('')}</div>
    ${select('wallet','Wallet',labels(['NONE','INCLUDED','GIFT']))}
    ${button('Publicar oferta')}`)) : '';
  return `${company ? card('Períodos y cupos',periods || message('Este negocio aún no tiene un plan activo.'),
    'El cupo se reserva cuando la agencia asigna la pieza. Al entregarla pasa a utilizado.') : ''}
    ${agency && company?.approved && active.length ? disclosure('Activar un acuerdo directo',contractForm(actor,url('/planes/activar'),active)) : ''}
    ${create}${card('Catálogo de servicios',catalog,'Membresías mensuales o trabajos individuales. El diseño de marca se contrata por proyecto. Una pieza publicada en varias redes consume un solo cupo.')}`;
}
export function metricsPage(actor,url,data) {
  const filters = `<form action="/reportes" class="filter">${actor.kind==='AGENCY' ? hidden('empresa',new URL(url('/reportes'),'http://localhost').searchParams.get('empresa')) : ''}
    ${input('desde','Desde','date','required',data.from)}${input('hasta','Hasta','date','required',data.to)}
    ${button('Actualizar','secondary')}</form>`;
  const blocks = data.rows.map(row=>card(channels[row.channel],`
    <p><strong>${row.measured}</strong> de ${row.publications} publicaciones con un corte en el período</p>
    ${table(['Indicador','Último corte','Publicaciones medidas','Cambio comparable'],Object.entries(metrics).map(([key,name])=>{
      const coverage = row.coverage[key];
      return [esc(name),coverage.observed ? number(row.values[key]) : '—',coverage.observed,
        coverage.comparable ? `${row.changes[key]>0n ? '+' : ''}${number(row.changes[key])} · ${coverage.comparable} comparadas` : '—'];
    }))}`)).join('');
  return card('Período de análisis',filters,
    'Fuente manual. Cada plataforma usa sus propios indicadores. Comparamos la misma publicación con su último corte anterior, cuando existe.') + blocks;
}
export function mapsPage(actor,url,locations) {
  const admin = actor.kind==='AGENCY';
  const cards = locations.map(loc=>{
    const last = loc.cuts[0];
    const previous = loc.cuts[1];
    const view = last ? `<p>${last.rating_hundredths===null ? 'Sin calificación' : (last.rating_hundredths/100).toFixed(2)+' / 5'} ·
      ${number(last.review_count)} reseñas ${previous ? `· Cambio ${last.review_count-previous.review_count>=0 ? '+' : ''}${last.review_count-previous.review_count}` : ''}</p>` :
      message('Aún no hay un corte para esta ubicación.');
    const cuts = table(['Fecha de corte','Calificación','Reseñas','Observaciones'],loc.cuts.map(row=>[
      esc(timestamp(row.observed_at)),row.rating_hundredths===null ? '—' : (row.rating_hundredths/100).toFixed(2),
      number(row.review_count),esc(row.notes),
    ]),'Sin cortes registrados.');
    const reviews = table(['Fecha','Estrellas','Referencia','Resumen','Respuesta','Estado'],loc.reviews.map(row=>[
      esc(row.reviewed_on),esc(row.stars+' / 5'),esc(row.reference),esc(row.summary),esc(row.response),badge(row.status),
    ]),'Sin reseñas registradas.');
    return card(loc.name,`<p>${external(loc.url,'Abrir ficha de Google Maps')}</p>${view}
      ${disclosure('Historial de mediciones',cuts)}${disclosure('Registro de reseñas',reviews)}
      ${admin ? disclosure('Añadir medición',form(url('/mapas/medicion'),actor,`${hidden('location',loc.id)}
        <div class="fields three">${input('observed','Fecha y hora','datetime-local','required')}
        ${input('count','Reseñas totales','number','required min="0"')}
        ${input('rating','Calificación de 1 a 5','text','inputmode="decimal"')}</div>
        ${textarea('notes','Observaciones','maxlength="1000"')}${button('Guardar medición')}`)) : ''}
      ${admin ? disclosure('Registrar o actualizar reseña',form(url('/mapas/resena'),actor,`${hidden('location',loc.id)}
        <div class="fields three">${input('reference','Referencia única','text','required maxlength="400"')}
        ${input('date','Fecha','date','required')}${input('stars','Estrellas','number','required min="1" max="5"')}</div>
        ${textarea('summary','Resumen','maxlength="1500"')}${textarea('response','Respuesta o borrador','maxlength="1500"')}
        ${select('status','Estado',labels(['PENDING','DRAFT','ANSWERED']))}${button('Guardar reseña')}`)) : ''}`);
  }).join('');
  return `${admin ? disclosure('Añadir ubicación',form(url('/mapas/ubicacion'),actor,`<div class="fields two">
    ${input('name','Nombre de la ubicación','text','required maxlength="120"')}
    ${input('url','Enlace HTTPS de la ficha','url','required maxlength="1500"')}</div>${button('Registrar ubicación')}`)) : ''}
    ${cards || card('Ubicaciones',message('Las fichas de tus sucursales aparecerán aquí.'))}`;
}

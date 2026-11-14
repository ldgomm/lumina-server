import { channels } from '../../shared/domain.mjs';
import { metrics } from '../../analytics/reporting.mjs';
import { badge, button, card, disclosure, displayAmount, esc, external, form, hidden, input, label, message,
  number, select, table, textarea, timestamp, localLink } from './components.mjs';

export function metricsPage(actor,url,data,route='/reports') {
  const filters = `<form action="${esc(url(route).split('?')[0])}" class="filter">${actor.kind==='AGENCY' ? hidden('company',new URL(url('/reports'),'http://localhost').searchParams.get('company')) : ''}
    ${route==='/content'?hidden('view','metrics'):''}${input('from','Desde','date','required',data.from)}${input('to','Hasta','date','required',data.to)}
    ${button('Actualizar','secondary')}</form>`;
  const freshness=data.freshness||[],missing=freshness.filter(p=>p.state==='unmeasured').length,stale=freshness.filter(p=>p.state==='stale').length;
  const status=card('Calidad de los datos',`<div class="stat-grid"><div class="stat"><span>Sin medición</span><strong>${missing}</strong></div><div class="stat"><span>Sin actualizar hace 7 días o más</span><strong>${stale}</strong></div><div class="stat"><span>Publicaciones registradas</span><strong>${freshness.length}</strong></div></div><p class="muted">Estado al cierre del período seleccionado. Los valores se registran manualmente.</p>`);
  const blocks = data.rows.map(row=>card(channels[row.channel],`
    <p><strong>${row.measured}</strong> de ${row.publications} publicaciones con un corte en el período</p>
    ${row.publications?`<meter class="metrics-coverage" min="0" max="${row.publications}" value="${row.measured}" aria-label="Publicaciones medidas de ${esc(channels[row.channel])}">${row.measured} de ${row.publications}</meter>`:''}
    ${table(['Indicador','Último corte','Publicaciones medidas','Cambio comparable'],Object.entries(metrics).map(([key,name])=>{
      const coverage=row.coverage[key],baseline=row.baseline?.[key]||0n;
      const percent=coverage.comparable&&baseline>0n?Number(row.changes[key]*10000n/baseline)/100:null;
      return [esc(name),coverage.observed?number(row.values[key]):'—',coverage.observed+' de '+row.publications,
        coverage.comparable?`${row.changes[key]>0n?'+':''}${number(row.changes[key])}${percent!==null?' ('+(percent>0?'+':'')+number(percent)+'%)':''}<br><small>${coverage.comparable} comparadas${baseline===0n?' · sin base para porcentaje':''}</small>`:'Sin corte anterior'];
    }))}`)).join('');
  const updates=freshness.length?card('Seguimiento de publicaciones',table(['Publicación','Red','Última medición','Estado',''],freshness.slice(0,30).map(pub=>[
    esc(pub.title),esc(channels[pub.channel]),pub.latest?esc(timestamp(pub.latest)):'Sin datos',badge(pub.state==='unmeasured'?'Sin medición':pub.state==='stale'?pub.age+' días sin actualizar':'Actualizada',pub.state==='fresh'?'success':'warning'),
    localLink(url('/requests/'+pub.request_id)+'#'+(actor.kind==='AGENCY'&&!actor.readOnlyCompany?'measure-'+pub.id:'piece-'+pub.piece_id),actor.kind==='AGENCY'&&!actor.readOnlyCompany?'Registrar medición':'Ver publicación'),
  ]))+(freshness.length>30?'<p class="muted">Primeras 30 publicaciones, priorizando las que necesitan medición.</p>':'')):'';
  return card('Período de análisis',filters,'Fuente manual. Cada plataforma usa sus propios indicadores. Comparamos la misma publicación con su último corte anterior, cuando existe.')+status+blocks+
    '<p class="billing-footnote">El cambio usa solo publicaciones con ambos cortes. Las vistas y el alcance de varias redes pueden incluir a una misma persona; no representan usuarios únicos.</p>'+updates;

}
export function mapsPage(actor,url,locations) {
  const admin = actor.kind==='AGENCY'&&!actor.readOnlyCompany;
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
      ${admin ? disclosure('Añadir medición',form(url('/maps/measurement'),actor,`${hidden('location',loc.id)}
        <div class="fields three">${input('observed','Fecha y hora','datetime-local','required')}
        ${input('count','Reseñas totales','number','required min="0"')}
        ${input('rating','Calificación de 1 a 5','text','inputmode="decimal"')}</div>
        ${textarea('notes','Observaciones','maxlength="1000"')}${button('Guardar medición')}`)) : ''}
      ${admin ? disclosure('Registrar o actualizar reseña',form(url('/maps/review'),actor,`${hidden('location',loc.id)}
        <div class="fields three">${input('reference','Referencia única','text','required maxlength="400"')}
        ${input('date','Fecha','date','required')}${input('stars','Estrellas','number','required min="1" max="5"')}</div>
        ${textarea('summary','Resumen','maxlength="1500"')}${textarea('response','Respuesta o borrador','maxlength="1500"')}
        ${select('status','Estado',['PENDING','DRAFT','ANSWERED'].map(value=>[value,label(value)]))}${button('Guardar reseña')}`)) : ''}`);
  }).join('');
  return `${admin ? disclosure('Añadir ubicación',form(url('/maps/location'),actor,`<div class="fields two">
    ${input('name','Nombre de la ubicación','text','required maxlength="120"')}
    ${input('url','Enlace HTTPS de la ficha','url','required maxlength="1500"')}</div>${button('Registrar ubicación')}`)) : ''}
    ${cards || card('Ubicaciones',message('Las fichas de tus sucursales aparecerán aquí.'))}`;
}

import { paging } from './workday-pages.mjs';
import { contactField, contactLine } from './contact.mjs';
import { businessHome } from './business-home.mjs';
import { composer, serviceChoices, requestCards } from './request-composer.mjs';
import { contentOptions, contentName, compatibleContentQuota } from '../../content/service-options.mjs';
import { canRequest } from '../../access/content-policy.mjs';
import { can } from '../../access/accounts.mjs';
import { areas, channels, formats, localDay, services, socialChannels, uuid } from '../../shared/domain.mjs';
import { metrics } from '../../analytics/reporting.mjs';
import { badge, button, card, disclosure, displayAmount, esc, external, form, hidden, input, label, localLink, localValue, message,
  number, select, table, textarea, timestamp } from './components.mjs';

const by = keys => keys.map(key=>[key,label(key)]);
const scheduleDate = (name,caption,extra='required',value='') => input(name,caption,'datetime-local',extra,value);
const stat = (caption,value) => `<div class="stat"><span>${esc(caption)}</span><strong>${number(value)}</strong></div>`;
export function companiesPage(companies, q) {
  const filter = `<form class="filter" action="/clientes"><div>${input('q','Buscar negocio','search','maxlength="100"',q)}</div>${button('Buscar','secondary')}</form>`;
  return card('Cartera de clientes',filter + table(['Negocio','Verificación','Contacto','Registro','Administración'],companies.map(company=>[
    localLink('/inicio?empresa='+company.id,company.name),company.approved ? badge('Verificado','success') : badge('Por verificar'),
    esc(company.phone),esc(timestamp(company.created_at)),localLink('/administracion/negocios/'+company.id,'Administrar →')+' · '+localLink('/equipos?empresa='+company.id,'Ver equipo'),
  ]),'Los negocios que se registren aparecerán aquí.'));
}
export function requestForm(actor,url,courtesy = false,selected='',onlySocial=false,values={}) {
  if (actor.kind==='AGENCY') return '';
  if(courtesy && actor.kind!=='OWNER')return '';
  if (courtesy) return form(url('/solicitudes'),actor,`
    ${hidden('request_key',values.request_key||uuid())}${hidden('type','COURTESY')}${hidden('channel','SOCIAL')}${hidden('service','VIDEO')}
    ${input('title','¿Qué quieres mostrar en tu video?','text','required maxlength="150"',values.title||'')}
    ${textarea('brief','Cuéntanos tu idea','maxlength="4000" rows="3"',values.brief||'')}${contactField(values.phone)}
    ${button('Solicitar mi video gratis')}`);
  if(onlySocial)return composer(actor,url,{area:'SOCIAL',onlySocial:true,values});
  return Object.hasOwn(areas,selected)?composer(actor,url,{area:selected,values}):serviceChoices(actor,url);
}
export function homePage({actor,company,url,groups,videoRequested,videoDelivered,upcoming,courtesy,cash,overview}) {
  if(actor.kind!=='AGENCY')return businessHome({actor,url,groups,videoRequested,videoDelivered,upcoming,courtesy,cash,overview,giftForm:actor.kind==='OWNER'?requestForm(actor,url,true,'',false,{phone:company.phone}):''});
  const hasScopes = Object.keys(channels).some(channel=>can(actor,channel));
  const open = groups.filter(row=>!['CANCELLED','DELIVERED'].includes(row.status)).reduce((sum,row)=>sum+row.count,0);
  const gift = actor.kind === 'OWNER' ? card('Tu video de cortesía',
    courtesy ? `<p>${badge(courtesy.status)} ${localLink(url('/solicitudes/'+courtesy.id),'Ver solicitud de cortesía')}</p>` : requestForm(actor,url,true),
    courtesy ? 'Aquí puedes consultar el estado del video que solicitaste.' : '¡Bienvenido a Lúmina Digital! Tu primer video de cortesía es gratis. Cuéntanos qué quieres mostrar y prepararemos tu video.') : '';
  const approval = actor.kind === 'AGENCY' && !actor.readOnlyCompany && !company.approved ? card('Verifica el registro del negocio',
    `<p>Cédula terminada en <strong>${esc(company.document_hint)}</strong> · ${esc(company.phone)}</p>
    ${form(url('/clientes/verificar'),actor,button('Marcar negocio verificado'))}`,
  'Confirma con el responsable que el negocio y sus datos le corresponden antes de iniciar producción o delegar Caja.') : '';
  return `${localLink('/administracion/negocios/'+company.id,'Estado, suscripción y pagos','btn')}${approval}${actor.readOnlyCompany?`<div class="actions">${localLink('/agencia/inicio?empresa='+company.id,'Abrir tareas de Lúmina','btn secondary')}</div>`:''}
    ${hasScopes ? `<section class="stat-grid" aria-label="Resumen de actividad">
      ${stat('Solicitudes abiertas',open)}${stat('Videos solicitados',videoRequested)}
      ${stat('Videos entregados',videoDelivered)}${stat('Próximas visitas',upcoming)}</section>` : ''}
    ${can(actor,'WALLET')?`<a class="wallet-entry-banner" href="${url('/wallet')}"><div><span class="eyebrow">LOYALTY / APPLE + GOOGLE</span><h2>Wallet, siempre a mano.</h2><p>Tarjetas, promociones y comunidad en un solo espacio.</p></div><span class="btn">Abrir Wallet →</span></a>`:''}
    ${can(actor,'SOCIAL')?`<a class="content-entry" href="${esc(url('/contenido'))}"><div><span class="eyebrow">MÓDULO DE CONTENIDO</span><h2>Tu producción, en un solo lugar.</h2><p>Solicitudes, grabaciones, aprobaciones, entregas y métricas.</p></div><span class="btn">Abrir Contenido →</span></a>`:''}
    ${gift}
    <div class="card-grid">${hasScopes ? card('Producción y entregas',`<p>Consulta solicitudes, visitas, grabaciones, revisiones y enlaces de entrega.</p>
      <div class="actions">${localLink(url('/solicitudes'),'Abrir solicitudes','btn')}${localLink(url('/agenda'),'Ver agenda','btn secondary')}</div>`) : ''}
    ${cash ? card('Loyalty · Caja',`<p>Sucursal asignada <strong>${esc(cash.branch_name)}</strong></p>${localLink('/caja','Abrir Caja','btn')}`) : ''}
    ${actor.kind !== 'COLLABORATOR' ? card('Paquetes y servicios',`<p>Combina paquetes mensuales y trabajos puntuales. Consulta precios, fechas y cupos.</p>
      ${localLink(url('/planes'),'Ver paquetes','btn secondary')}`) : ''}
    ${!hasScopes && !cash ? card('Acceso pendiente',message('El dueño del negocio debe asignarte al menos un área.')) : ''}</div>`;
}
export function requestsPage({actor,url,rows,channel,page,total,counts,q='',state='',view='todas'}) {
  const filters=[['','Todas las áreas'],...Object.keys(areas).filter(key=>can(actor,key)).map(key=>[key,areas[key]])];
  const states=[['','Todos los estados'],...['NEW','REVIEW','QUOTED','APPROVED','SCHEDULED','PRODUCTION','DELIVERED','CANCELLED'].map(key=>[key,label(key)])];
  const query={canal:channel,q,estado:state,vista:view};
  const create=actor.kind!=='AGENCY'&&Object.keys(areas).some(key=>can(actor,key,'REQUEST'));
  return `<section class="request-hub"><div><p class="eyebrow">TUS IDEAS EN MARCHA</p><h2>¿Qué hacemos hoy por tu negocio?</h2><p>Solicita un servicio y sigue cada avance, desde la idea hasta la entrega.</p></div>${create?localLink(url('/solicitudes/nueva'),'Nueva solicitud','btn'):''}</section>
    ${create?`<details class="disclosure request-quick"><summary>Explorar servicios</summary><div>${serviceChoices(actor,url)}</div></details>`:''}
    <section class="card"><div class="split"><h2>Tus solicitudes</h2><span class="muted">${total} ${total===1?'solicitud':'solicitudes'}</span></div>
    <nav class="workday-tabs" aria-label="Estado de solicitudes">${[['todas','Todas'],['abiertas','En curso'],['cerradas','Cerradas']].map(([key,name])=>`<a href="${esc(url('/solicitudes',{canal:channel,q,vista:key}))}"${key===view?' aria-current="page"':''}>${name} <span>${counts[key]}</span></a>`).join('')}</nav>
    <form action="${esc(url('/solicitudes').split('?')[0])}" class="request-filter">${hidden('vista',view)}${actor.kind==='AGENCY'?hidden('empresa',new URL(url('/solicitudes'),'http://localhost').searchParams.get('empresa')):''}
    ${input('q','Buscar solicitud','search','maxlength="100" placeholder="Nombre o idea…"',q)}${select('canal','Servicio',filters,channel)}${select('estado','Estado',states,state)}${button('Buscar','secondary')}</form>
    ${q||state||channel||view!=='todas'?`<p class="filter-result">Filtros aplicados · ${localLink(url('/solicitudes'),'Ver todas las solicitudes')}</p>`:''}${!rows.length&&(q||state||channel||view!=='todas')?message('No encontramos solicitudes con estos filtros.'):requestCards(rows,url)}${paging({url,path:'/solicitudes',params:query,page,total,size:30})}</section>`;
}
export function agendaPage(rows,url) {
  return card('Agenda de grabaciones',table(['Fecha y hora','Solicitud','Lugar','Estado','Grabación real'],rows.map(visit=>[
    esc(timestamp(visit.starts_at)),localLink(url('/solicitudes/'+visit.request_id),visit.title),esc(visit.place),
    badge(visit.status),esc(timestamp(visit.recorded_at)),
  ]),'Las visitas programadas aparecerán aquí. Las fechas se muestran en la hora de Ecuador continental.'),
  'Las sugerencias del cliente aparecen dentro de cada solicitud. Solo las visitas confirmadas aparecen en la agenda.');
}
function quotePanel({actor,base,quote,request}) {
  if (actor.kind==='COLLABORATOR' || request.type==='COURTESY') return '';
  const canOffer = actor.kind==='AGENCY' && !actor.readOnlyCompany && ['NEW','REVIEW','QUOTED'].includes(request.status);
  if (!quote && !canOffer) return '';
  return card('Cotización',`${quote ? `<p><strong>${esc(displayAmount(quote.amount_minor))}</strong> · ${badge(quote.status)} · Versión ${quote.revision}</p>
    <p class="prewrap">${esc(quote.terms)}</p>` : ''}
    ${quote?.status==='OFFERED' && actor.kind==='OWNER' && request.status==='QUOTED' ? form(base('/aceptar'),actor,
      hidden('quote',quote.id)+button('Aceptar cotización')) : ''}
    ${canOffer ? disclosure(quote ? 'Enviar una revisión' : 'Preparar cotización',form(base('/cotizar'),actor,
      input('amount','Importe en USD','text','required inputmode="decimal"')+
      textarea('terms','Qué incluye, plazos y condiciones','required maxlength="4000"')+button('Enviar cotización'))) : ''}`);
}
function visitsPanel({actor,base,visits,request,company}) {
  if (request.type==='PLAN' || request.channel!=='SOCIAL') return '';
  const editable = actor.kind==='AGENCY' && !actor.readOnlyCompany && company.approved;
  const visitRows = visits.map(visit=>`<article class="subcard">
    <div class="split"><strong>${esc(timestamp(visit.starts_at))}</strong>${badge(visit.status)}</div>
    <p>${esc(visit.place)} ${visit.recorded_at ? `· Realizada ${esc(timestamp(visit.recorded_at))}` : ''}</p><p class="muted prewrap">${esc(visit.notes)}</p>
    ${editable && visit.status==='SCHEDULED' ? disclosure('Cerrar visita',form(base('/visitas/cerrar'),actor,
      hidden('visit',visit.id)+select('status','Resultado',by(['DONE','CANCELLED']))+
      scheduleDate('recorded','Fecha y hora real','')+textarea('notes','Observaciones','maxlength="1500"')+button('Guardar resultado'))) : ''}</article>`).join('');
  return card('Visitas',`${request.requested_at ? `<p>Horario sugerido <strong>${esc(timestamp(request.requested_at))}</strong></p>` : ''}
    ${visitRows || message('Sin visitas programadas.')}${editable && !['QUOTED','DELIVERED','CANCELLED'].includes(request.status) ?
      disclosure('Programar una visita',form(base('/visitas'),actor,`<div class="fields two">${scheduleDate('starts','Fecha y hora','required',localValue(request.requested_at))}
      ${input('place','Lugar','text','required maxlength="260"')}</div>${textarea('notes','Observaciones','maxlength="1500"')}${button('Programar')}`)) : ''}`);
}
function snapshotsTable(snapshots) {
  return table(['Medición',...Object.values(metrics),'Fuente'],snapshots.map(row=>[
    esc(timestamp(row.observed_at)), ...Object.keys(metrics).map(key=>row[key] == null ? '—' : number(row[key])), 'Manual',
  ]),'Sin mediciones para esta publicación.');
}
function publicationView(actor,route,pub) {
  return `<div class="subcard"><div class="split"><strong>${external(pub.url,label(pub.channel))}</strong>
    <span class="muted">${esc(timestamp(pub.published_at))}</span></div>${snapshotsTable(pub.metrics)}
    ${actor.kind==='AGENCY' && !actor.readOnlyCompany ? disclosure('Registrar medición',form(route('/medir'),actor,`
    ${hidden('publication',pub.id)}${scheduleDate('observed','Fecha y hora del corte')}
    <p class="muted">Deja en blanco los indicadores que no puedas comprobar.</p>
    <div class="fields three">${Object.entries(metrics).map(([key,name])=>input(key,name,'number','min="0" max="1000000000000"')).join('')}</div>
    ${textarea('notes','Observaciones','maxlength="1000"')}${button('Guardar corte')}`)) : ''}</div>`;
}
function pieceView({actor,url,request,piece}) {
  const base = url('/solicitudes/'+request.id+'/piezas/'+piece.id).split('?')[0];
  const route = suffix => url(base + suffix);
  const edit = actor.kind==='AGENCY' && !actor.readOnlyCompany && !['CANCELLED','DELIVERED'].includes(piece.status);
  const actions = piece.status==='APPROVED' ? ['APPROVED','DELIVERED','CANCELLED'] : ['PRODUCTION','REVIEW','CANCELLED'];
  const editForm = edit ? disclosure('Actualizar entregable',form(route('/editar'),actor,`
    ${hidden('revision',piece.revision)}<div class="fields two">${select('status','Estado',by(actions),piece.status)}
    ${scheduleDate('recorded','Grabado el','',localValue(piece.recorded_at))}</div>
    ${textarea('notes','Observaciones','maxlength="2000"',piece.observations)}${button('Guardar pieza')}`)) : '';
  const reviewForm = actor.kind!=='AGENCY' && piece.status==='REVIEW' && canRequest(actor,request,'APPROVE') ?
    disclosure('Revisar entregable',form(route('/revisar'),actor,`${hidden('revision',piece.revision)}
    ${select('status','Decisión',[['APPROVED','Aprobar entrega'],['PRODUCTION','Solicitar ajustes']])}
    ${textarea('notes','Observaciones','maxlength="1000"')}${button('Guardar decisión')}`)).replace('<details class="disclosure">','<details class="disclosure review-ready" open>') : '';
  const attachForm = actor.kind==='AGENCY' && !actor.readOnlyCompany && piece.status!=='CANCELLED' ?
    disclosure('Adjuntar evidencia o entrega',form(route('/evidencia'),actor,`${input('label','Nombre del enlace','text','required maxlength="100"')}
      ${input('url','Enlace HTTPS','url','required maxlength="1500"')}${button('Adjuntar enlace')}`)) : '';
  const platforms=request.channel==='SOCIAL'?socialChannels.filter(p=>can(actor,p) && piece.publications.some(pub=>pub.channel===p)):[];
  const publishable=request.channel==='SOCIAL' && actor.kind==='AGENCY' && !actor.readOnlyCompany && ['APPROVED','DELIVERED'].includes(piece.status);
  const publishForm=publishable?disclosure('Registrar publicación',form(route('/publicacion'),actor,`
    ${select('channel','Red social',by(socialChannels))}
    ${input('url','Enlace de la publicación','url','required maxlength="1500"')}
    ${scheduleDate('published','Fecha y hora de publicación')}${button('Guardar publicación')}`)):'';
  const platformPanels=platforms.map(platform=>{
    const publications=piece.publications.filter(pub=>pub.channel===platform);
    return `<details class="platform-panel" open><summary><strong>${esc(channels[platform])}</strong>${badge('Publicada','success')}</summary><div>
      ${publications.map(pub=>publicationView(actor,route,pub)).join('')}</div></details>`;
  }).join('');
  return `<article class="subcard"><div class="split"><h3>${esc(piece.title)}</h3>${badge(piece.status)}</div>
    <p class="piece-common-label">Contenido común · archivos y revisión</p>${piece.recorded_at?`<p class="muted">Grabado el ${esc(timestamp(piece.recorded_at))}</p>`:''}<p class="prewrap">${esc(piece.observations)}</p>
    ${piece.evidence.length ? `<ul class="evidence">${piece.evidence.map(item=>`<li>${external(item.url,item.label)}</li>`).join('')}</ul>` : ''}
    ${editForm}${reviewForm}${attachForm}${platformPanels||publishForm?`<section class="piece-platforms"><h4>Publicaciones y métricas</h4><p class="muted">Esta pieza cuenta una sola vez en el plan. Cada plataforma conserva su enlace y sus resultados; las audiencias pueden coincidir.</p>${publishForm}<div class="platform-grid">${platformPanels}</div></section>`:''}</article>`;
}
export function requestDetail({actor,company,url,request,quote,pieces,visits,audit,contracts,plan}) {
  const root = '/solicitudes/'+request.id;
  const base = suffix => url(root+suffix);
  const available = {NEW:['REVIEW','APPROVED','CANCELLED'],REVIEW:['APPROVED','CANCELLED'],QUOTED:['CANCELLED'],
    APPROVED:['CANCELLED'],SCHEDULED:['CANCELLED'],PRODUCTION:['CANCELLED'],DELIVERED:[],
    CANCELLED:request.type==='COURTESY' ? ['NEW'] : []};
  const admin = actor.kind==='AGENCY' && !actor.readOnlyCompany;
  const stateOptions = available[request.status].filter(state=>state!=='APPROVED' ||
    (company.approved && (!plan || plan.price_minor!==null)));
  const step=({NEW:0,REVIEW:1,QUOTED:1,APPROVED:1,SCHEDULED:1,PRODUCTION:2,DELIVERED:3})[request.status];
  const timeline=step===undefined||request.type==='VISIT'?'':`<ol class="request-timeline" aria-label="Avance de la solicitud">${['Recibida','Coordinación','Producción','Entrega'].map((name,index)=>`<li${index===step?' aria-current="step"':''}><span>${index<step?'✓':index+1}</span>${name}</li>`).join('')}</ol>`;
  const next = actor.kind==='AGENCY' ? null : ({
    NEW:'Recibimos tu solicitud. Lúmina revisará tu idea y te contactará para coordinar.',
    REVIEW:'Lúmina está revisando los detalles de tu solicitud.',
    QUOTED:'Tu cotización está lista. Revisa el importe y las condiciones antes de aceptar.',
    APPROVED:'Tu solicitud está aprobada. Lúmina coordinará el inicio del trabajo.',
    SCHEDULED:'Tu grabación tiene una fecha confirmada. Revisa los datos de la visita.',
    PRODUCTION:pieces.some(p=>p.status==='REVIEW')?'Tienes una entrega por revisar. Abre sus archivos y aprueba o solicita ajustes.':'Lúmina está preparando tu trabajo. Aquí aparecerán los archivos para revisar.',
    DELIVERED:'Tu trabajo está entregado. Puedes abrir los archivos y consultar el historial.',
    CANCELLED:'La solicitud está cancelada. Su historial permanece disponible.',
  })[request.status];
  const details = timeline+(next?`<aside class="request-next"><strong>Estado de tu solicitud</strong><p>${esc(next)}</p></aside>`:'')+card('Ficha de la solicitud',`<div class="tags">${badge(request.type)}${badge(request.channel)}${badge(request.status)}</div>
    <p>${esc(request.channel==='SOCIAL'&&actor.kind!=='AGENCY'?contentName(request.service):label(request.service))} · Cantidad ${request.quantity} · Recibida ${esc(timestamp(request.created_at))}</p>
    <p class="prewrap">${esc(request.brief)}</p>${contactLine(request.contact_phone,company.phone)}
    ${admin && stateOptions.length ? disclosure('Cambiar estado',form(base('/estado'),actor,
      select('status','Estado',by(stateOptions))+textarea('notes','Motivo u observaciones','maxlength="1000"')+button('Guardar estado'))) : ''}
    ${plan ? `<p class="muted">Solicitud de plan anterior. Las nuevas contrataciones se gestionan desde ${localLink(url('/planes'),'Paquetes y servicios')}, mediante una propuesta aceptada por el dueño.</p>` : ''}`);
  const addPiece = admin && company.approved && ['APPROVED','SCHEDULED','PRODUCTION'].includes(request.status) &&
    pieces.filter(p=>p.status!=='CANCELLED').length<request.quantity;
  const availableContracts = contracts.filter(c=>!c.cancelled_at && c.starts_on<=localDay() && c.ends_before>localDay() &&
    c.items.some(i=>(request.channel==='SOCIAL'?compatibleContentQuota(request.service,i.service):i.service===request.service) && i.quantity>i.used+i.reserved));
  const piecePanel = ['PLAN','VISIT'].includes(request.type) ? '' : card('Entregables',pieces.map(piece=>pieceView({actor,url,request,piece})).join('') +
    (addPiece ? disclosure('Crear entregable',form(base('/piezas'),actor,
      input('title','Nombre de la pieza','text','required maxlength="150"')+
      (request.type!=='COURTESY' && availableContracts.length ? select('allocation','Cupo que se utilizará',
        [['','Sin asignar a un cupo'],...availableContracts.flatMap(contract=>contract.items.filter(i=>(request.channel==='SOCIAL'?compatibleContentQuota(request.service,i.service):i.service===request.service)&&i.quantity>i.used+i.reserved).map(i=>[contract.id+':'+i.service,contract.name+' · '+label(i.service)+' · '+(i.quantity-i.used-i.reserved)+' disponibles']))]) : '')+
      button('Añadir pieza'))) : pieces.length ? '' : message('Los entregables aparecerán al iniciar producción.')));
  return `<p>${localLink(url(request.channel==='SOCIAL'?'/contenido':'/solicitudes',request.channel==='SOCIAL'?{vista:'solicitudes'}:{}),'← Todas las solicitudes')}</p>${details}
    ${quotePanel({actor,base,quote,request})}${piecePanel}${visitsPanel({actor,base,visits,request,company})}
    ${disclosure('Historial de la solicitud',table(['Momento','Responsable','Movimiento','Detalle'],audit.map(row=>[
      esc(timestamp(row.happened_at)),esc(row.actor_name),esc(row.action.replaceAll('_',' ')),esc(row.details),
    ])))}`;
}

import { paging } from './workday-pages.mjs';
import { contactField } from './contact.mjs';
import { businessHome } from './business-home.mjs';
import { composer, serviceChoices, requestCards } from './request-composer.mjs';
import { can } from '../../access/accounts.mjs';
import { areas, channels, uuid } from '../../shared/domain.mjs';
import { badge, button, card, esc, form, hidden, input, label, localLink, message,
  number, select, table, textarea, timestamp } from './components.mjs';

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
export { requestDetail } from './request-detail-pages.mjs';

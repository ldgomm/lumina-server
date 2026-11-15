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
  const filter = `<form class="filter" action="/businesses"><div>${input('q','Buscar negocio','search','maxlength="100"',q)}</div>${button('Buscar','secondary')}</form>`;
  return card('Cartera de clientes',filter + table(['Negocio','Verificación','Contacto','Registro','Administración'],companies.map(company=>[
    localLink('/home?company='+company.id,company.name),company.approved ? badge('Verificado','success') : badge('Por verificar'),
    esc(company.phone),esc(timestamp(company.created_at)),localLink('/admin/businesses/'+company.id,'Administrar →')+' · '+localLink('/teams?company='+company.id,'Ver equipo'),
  ]),'Los negocios que se registren aparecerán aquí.'));
}
export function requestForm(actor,url,courtesy = false,selected='',onlySocial=false,values={}) {
  if (actor.kind==='AGENCY') return '';
  if(courtesy && actor.kind!=='OWNER')return '';
  if (courtesy) return form(url('/requests'),actor,`
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
    courtesy ? `<p>${badge(courtesy.status)} ${localLink(url('/requests/'+courtesy.id),'Ver solicitud de cortesía')}</p>` : requestForm(actor,url,true),
    courtesy ? 'Aquí puedes consultar el estado del video que solicitaste.' : '¡Bienvenido a Lúmina Digital! Tu primer video de cortesía es gratis. Cuéntanos qué quieres mostrar y prepararemos tu video.') : '';
  const approval = actor.kind === 'AGENCY' && !actor.readOnlyCompany && !company.approved ? card('Verifica el registro del negocio',
    `<p>Cédula terminada en <strong>${esc(company.document_hint)}</strong> · ${esc(company.phone)}</p>
    ${form(url('/businesses/verify'),actor,button('Marcar negocio verificado'))}`,
  'Confirma con el responsable que el negocio y sus datos le corresponden antes de iniciar producción o delegar Caja.') : '';
  return `${localLink('/admin/businesses/'+company.id,'Estado, suscripción y pagos','btn')}${approval}${actor.readOnlyCompany?`<div class="actions">${localLink('/agency/home?company='+company.id,'Abrir tareas de Lúmina','btn secondary')}</div>`:''}
    ${hasScopes ? `<section class="stat-grid" aria-label="Resumen de actividad">
      ${stat('Solicitudes abiertas',open)}${stat('Videos solicitados',videoRequested)}
      ${stat('Videos entregados',videoDelivered)}${stat('Próximas visitas',upcoming)}</section>` : ''}
    ${can(actor,'WALLET')?`<a class="wallet-entry-banner" href="${url('/wallet')}"><div><span class="eyebrow">LOYALTY / APPLE + GOOGLE</span><h2>Wallet, siempre a mano.</h2><p>Tarjetas, promociones y comunidad en un solo espacio.</p></div><span class="btn">Abrir Wallet →</span></a>`:''}
    ${can(actor,'SOCIAL')?`<a class="content-entry" href="${esc(url('/content'))}"><div><span class="eyebrow">MÓDULO DE CONTENIDO</span><h2>Tu producción, en un solo lugar.</h2><p>Solicitudes, grabaciones, aprobaciones, entregas y métricas.</p></div><span class="btn">Abrir Contenido →</span></a>`:''}
    ${gift}
    <div class="card-grid">${hasScopes ? card('Producción y entregas',`<p>Consulta solicitudes, visitas, grabaciones, revisiones y enlaces de entrega.</p>
      <div class="actions">${localLink(url('/requests'),'Abrir solicitudes','btn')}${localLink(url('/calendar'),'Ver agenda','btn secondary')}</div>`) : ''}
    ${cash ? card('Loyalty · Caja',`<p>Sucursal asignada <strong>${esc(cash.branch_name)}</strong></p>${localLink('/cashier','Abrir Caja','btn')}`) : ''}
    ${actor.kind !== 'COLLABORATOR' ? card('Paquetes y servicios',`<p>Combina paquetes mensuales y trabajos puntuales. Consulta precios, fechas y cupos.</p>
      ${localLink(url('/plans'),'Ver paquetes','btn secondary')}`) : ''}
    ${!hasScopes && !cash ? card('Acceso pendiente',message('El dueño del negocio debe asignarte al menos un área.')) : ''}</div>`;
}
export function requestsPage({actor,url,rows,channel,page,total,counts,q='',state='',view='all'}) {
  const filters=[['','Todas las áreas'],...Object.keys(areas).filter(key=>can(actor,key)).map(key=>[key,areas[key]])];
  const states=[['','Todos los estados'],...['NEW','REVIEW','QUOTED','APPROVED','SCHEDULED','PRODUCTION','DELIVERED','CANCELLED'].map(key=>[key,label(key)])];
  const query={channel:channel,q,state:state,view:view};
  const create=actor.kind!=='AGENCY'&&Object.keys(areas).some(key=>can(actor,key,'REQUEST'));
  return `<div class="request-tools"><p>${counts.open} en curso${counts.blocked?' · '+counts.blocked+' detenidas':''} · ${counts.closed} ${counts.closed===1?'cerrada':'cerradas'}</p>${create?localLink(url('/requests/new'),'Nueva solicitud','btn'):''}</div>
    <section class="card"><div class="split"><h2>Seguimiento de solicitudes</h2><span class="muted">${total} ${total===1?'solicitud':'solicitudes'}</span></div>
    <nav class="workday-tabs" aria-label="Estado de solicitudes">${[['all','Todas'],['open','En curso'],['closed','Cerradas'],...(counts.blocked||view==='blocked'?[['blocked','Detenidas']]:[])].map(([key,name])=>`<a href="${esc(url('/requests',{channel:channel,q,view:key}))}"${key===view?' aria-current="page"':''}>${name} <span>${counts[key]}</span></a>`).join('')}</nav>
    <form action="${esc(url('/requests').split('?')[0])}" class="request-filter">${hidden('view',view)}${actor.kind==='AGENCY'?hidden('company',new URL(url('/requests'),'http://localhost').searchParams.get('company')):''}
    ${input('q','Buscar solicitud','search','maxlength="100" placeholder="Nombre o idea…"',q)}${button('Buscar','secondary')}
    <details class="request-filters"${channel||state?' open':''}><summary>Filtrar por servicio o estado${channel||state?' · Activo':''}</summary><div class="fields two">${select('channel','Servicio',filters,channel)}${select('state','Estado',states,state)}</div></details></form>
    ${q||state||channel||view!=='all'?`<p class="filter-result">Filtros aplicados · ${localLink(url('/requests'),'Ver todas las solicitudes')}</p>`:''}${!rows.length&&(q||state||channel||view!=='all')?message('No encontramos solicitudes con estos filtros.'):requestCards(rows,url,{actor})}${paging({url,path:'/requests',params:query,page,total,size:30})}</section>`;
}
export function agendaPage(rows,url) {
  return card('Agenda de grabaciones',table(['Fecha y hora','Solicitud','Lugar','Estado','Grabación real'],rows.map(visit=>[
    esc(timestamp(visit.starts_at)),localLink(url('/requests/'+visit.request_id),visit.title),esc(visit.place),
    badge(visit.status),esc(timestamp(visit.recorded_at)),
  ]),'Las visitas programadas aparecerán aquí. Las fechas se muestran en la hora de Ecuador continental.'),
  'Las sugerencias del cliente aparecen dentro de cada solicitud. Solo las visitas confirmadas aparecen en la agenda.');
}
export { requestDetail } from './request-detail-pages.mjs';

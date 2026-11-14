import { canRequest } from '../../access/content-policy.mjs';
import { areas } from '../../shared/domain.mjs';
import { serviceName } from '../../memberships/catalog.mjs';
import { badge, esc, localLink, timestamp } from './components.mjs';
import { icon } from './icons.mjs';

const marks={SOCIAL:'social',WALLET:'wallet',MAPS:'maps',WEB:'web',BRAND:'content'};
export function requestNextStep(row,actor) {
  if(row.status==='CANCELLED')return {title:'Solicitud cancelada',caption:'Ver historial',anchor:'#history'};
  if(row.status==='DELIVERED'&&row.type==='PLAN')return {title:'Solicitud completada',caption:'Ver solicitud',anchor:'#details'};
  if(row.status==='DELIVERED')return row.type==='VISIT'?
    {title:'Visita realizada',caption:'Ver visita',anchor:'#visits'}:
    {title:'Trabajo entregado',caption:'Ver entregas',anchor:'#deliverables'};
  if(actor?.kind==='AGENCY'&&!actor.readOnlyCompany&&row.status==='PRODUCTION'&&row.approved_piece_id)return {
    title:'Una pieza ya está aprobada',caption:'Completar entrega',anchor:'#edit-'+row.approved_piece_id,
  };
  if(row.status==='QUOTED')return actor?.kind==='OWNER'?
    {title:'Tu cotización está lista',caption:'Revisar cotización',anchor:'#quote',attention:true}:
    {title:'Cotización en revisión',caption:'Ver solicitud',anchor:'#details'};
  if(row.status==='PRODUCTION'&&row.in_review>0) {
    const request={...row,platforms:row.platforms||(row.targets?row.targets.split(','):[])};
    const approve=actor&&actor.kind!=='AGENCY'&&canRequest(actor,request,'APPROVE');
    return {title:approve?`${row.in_review} ${row.in_review===1?'entrega por revisar':'entregas por revisar'}`:'Entregables en revisión',
      caption:approve?'Revisar entrega':'Ver entregables',anchor:'#piece-'+row.review_piece_id,attention:!!approve};
  }
  const states={NEW:'Recibimos tu solicitud',REVIEW:'Estamos coordinando los detalles',APPROVED:'Listo para coordinar',SCHEDULED:'Grabación programada',PRODUCTION:'Trabajo en producción'};
  return {title:states[row.status]||'Consulta el avance',caption:row.status==='SCHEDULED'?'Ver visita':'Ver detalle',anchor:row.status==='SCHEDULED'?'#visits':''};
}

export function requestCards(rows,url,{actor=null,showCompany=false,resolveLink=null}={}) {
  return `<div class="request-list">${rows.map(row=>{
    const next=requestNextStep(row,actor),work=!['VISIT','PLAN'].includes(row.type);
    const target=(resolveLink?resolveLink(row):url('/requests/'+row.id))+(work||!next.anchor.startsWith('#piece-')?next.anchor:'');
    return `<a class="request-record work-record${next.attention?' work-needs-review':''}" href="${esc(target)}">
      <span class="service-symbol" aria-hidden="true">${icon(marks[row.channel]||'content')}</span><div class="work-record-main">
      <div class="request-record-meta">${showCompany?`${esc(row.company_name)} · `:''}${esc(areas[row.channel]||row.channel)} · ${esc(serviceName(row.service))}${row.type==='COURTESY'?' · Cortesía':''}</div>
      <h3>${esc(row.title)}</h3><p class="work-next">${esc(next.title)}</p>
      ${work&&Number.isInteger(row.delivered)&&row.quantity>1?`<div class="work-progress"><span class="request-delivery-count">${row.delivered} de ${row.quantity} piezas entregadas</span><progress max="${row.quantity}" value="${row.delivered}" aria-label="Piezas entregadas de ${esc(row.title)}"></progress></div>`:''}
      ${row.created_at?`<time datetime="${esc(row.created_at)}">Solicitada: ${esc(timestamp(row.created_at))}</time>`:''}</div>
      <div class="request-record-state">${badge(next.attention?'Tu revisión':row.status,row.status==='DELIVERED'?'success':'')}<span>${esc(next.caption)} ${icon('arrow')}</span></div></a>`;
  }).join('')||'<div class="request-empty"><h3>Tu próxima idea empieza aquí.</h3><p>Cuando envíes una solicitud, podrás seguir su avance y revisar las entregas en este espacio.</p></div>'}</div>`;
}

export function pieceCards(rows,actor,resolveLink,{showCompany=false}={}) {
  return `<div class="piece-grid">${rows.map(row=>{
    const request={...row,id:row.request_id,channel:'SOCIAL',type:row.request_type,platforms:row.targets?row.targets.split(','):[]};
    const review=row.status==='REVIEW'&&row.request_status==='PRODUCTION';
    const approve=review&&actor.kind!=='AGENCY'&&canRequest(actor,request,'APPROVE');
    const agencyWork=actor.kind==='AGENCY'&&!actor.readOnlyCompany&&!['CANCELLED','DELIVERED'].includes(row.request_status);
    const action=approve?'Revisar pieza':row.status==='DELIVERED'?'Ver archivos y evidencias':agencyWork&&row.status==='APPROVED'?'Completar entrega':agencyWork?'Abrir producción':'Ver archivos y avance';
    const hint=row.status==='DELIVERED'?'Entrega final':row.status==='APPROVED'?'Aprobada · pendiente de entrega':approve?'Abre los archivos y aprueba o pide cambios.':review?'En revisión por el negocio':'Lúmina está preparando esta pieza.';
    const anchor=agencyWork&&row.status==='APPROVED'?'#edit-'+row.id:'#piece-'+row.id;
    return `<article class="piece-summary${approve?' work-needs-review':''}"><div class="piece-summary-top"><span class="service-symbol" aria-hidden="true">${icon('social')}</span>${badge(row.status,row.status==='DELIVERED'?'success':'')}</div>
      ${showCompany?`<p class="eyebrow">${esc(row.company_name)}</p>`:''}<h3>${esc(row.title)}</h3><p class="piece-request">${esc(row.request_title)}</p><p class="piece-hint">${esc(hint)}</p>
      <div class="piece-summary-meta"><span>${icon('content')}${row.evidence_count} ${row.evidence_count===1?'archivo o enlace':'archivos o enlaces'}</span>${row.recorded_at?`<time datetime="${esc(row.recorded_at)}">Grabado: ${esc(timestamp(row.recorded_at))}</time>`:''}</div>
      ${localLink(resolveLink(row)+anchor,action+' →','btn '+(approve?'':'secondary'))}</article>`;
  }).join('')}</div>`;
}

import { deliveryFiles } from './delivery-files.mjs';
import { can } from '../../access/accounts.mjs';
import { canRequest } from '../../access/content-policy.mjs';
import { compatibleContentQuota, contentName } from '../../content/service-options.mjs';
import { metrics } from '../../analytics/reporting.mjs';
import { localDay, socialChannels } from '../../shared/domain.mjs';
import { contactLine } from './contact.mjs';
import { icon } from './icons.mjs';
import { formState, operationForm, operationPanel, revisionField } from './request-feedback.mjs';
import { badge, button, displayAmount, esc, external, hidden, input, label, localLink, localValue,
  message, number, select, table, textarea, timestamp } from './components.mjs';

const by = keys => keys.map(key=>[key,label(key)]);
const agency = actor => actor.kind==='AGENCY' && !actor.readOnlyCompany;
const dateField = (name,title,state,initial='',required=true) => input(name,title,'datetime-local',required?'required':'',state.value(name,initial));
const field = (state,name,title,extra='',initial='') => textarea(name,title,extra,state.value(name,initial));
const part = (id,title,body) => `<section class="card detail-section" id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${esc(title)}</h2>${body}</section>`;

function quotePanel({actor,base,quote,request,feedback}) {
  if(actor.kind==='COLLABORATOR'||request.type==='COURTESY')return '';
  const offer=agency(actor)&&['NEW','REVIEW','QUOTED'].includes(request.status);
  if(!quote&&!offer)return '';
  const accept=formState(feedback,'/accept'),send=formState(feedback,'/quote');
  return part('quote','Cotización',`${quote?`<div class="detail-quote"><strong>${esc(displayAmount(quote.amount_minor))}</strong>${badge(quote.status)}<span>Versión ${quote.revision}</span></div><p class="prewrap">${esc(quote.terms)}</p>`:''}
    ${quote?.status==='OFFERED'&&actor.kind==='OWNER'&&request.status==='QUOTED'?operationForm(actor,base('/accept'),hidden('quote',accept.value('quote',quote.id))+button('Aceptar esta cotización'),accept,base('')+'#quote'):''}
    ${offer?operationPanel(quote?'Revisar cotización':'Preparar cotización',operationForm(actor,base('/quote'),revisionField(send,request.revision)+
      input('amount','Precio total en USD','text','required inputmode="decimal"',send.value('amount'))+
      field(send,'terms','Qué incluye y cuándo se entrega','required minlength="5" maxlength="4000" rows="4"')+button('Enviar cotización'),send,base('')+'#quote'),send,'send-quote',!quote):''}`);
}

function visitsPanel({actor,base,visits,request,company,feedback}) {
  if(request.type==='PLAN'||request.channel!=='SOCIAL')return '';
  const editable=agency(actor)&&company.approved&&!['DELIVERED','CANCELLED'].includes(request.status);
  if(!visits.length&&!request.requested_at&&!editable)return '';
  const rows=visits.map(visit=>{
    const close=formState(feedback,'/visits/close',{visit:visit.id});
    return `<article class="detail-visit"><div class="split"><h3>${esc(timestamp(visit.starts_at))}</h3>${badge(visit.status)}</div>
      <p>${icon('maps')}${esc(visit.place)}</p>${visit.recorded_at?`<p class="muted">Realizada: ${esc(timestamp(visit.recorded_at))}</p>`:''}${visit.notes?`<p class="prewrap">${esc(visit.notes)}</p>`:''}
      ${editable&&visit.status==='SCHEDULED'?operationPanel('Registrar resultado',operationForm(actor,base('/visits/close'),hidden('visit',visit.id)+revisionField(close,visit.revision)+
        select('status','¿Se realizó la visita?', [['DONE','Sí, realizada'],['CANCELLED','No, cancelada']],close.value('status','DONE'))+
        dateField('recorded','Fecha y hora real',close,'',false)+field(close,'notes','Observaciones del resultado','maxlength="1500" rows="3"')+button('Guardar resultado'),close,base('')+'#visits'),close,'close-'+visit.id):''}</article>`;
  }).join('');
  const schedule=formState(feedback,'/visits');
  return part('visits','Grabaciones y visitas',`${request.requested_at?`<p>Horario solicitado: <strong>${esc(timestamp(request.requested_at))}</strong></p>`:''}${rows||message('La fecha aún no está confirmada.')}
    ${editable&&request.status!=='QUOTED'?operationPanel('Programar una visita',operationForm(actor,base('/visits'),revisionField(schedule,request.revision)+
      `<div class="fields two">${dateField('starts','Fecha y hora',schedule,localValue(request.requested_at))}${input('place','Lugar','text','required minlength="2" maxlength="260"',schedule.value('place'))}</div>`+
      field(schedule,'notes','Indicaciones para la visita','maxlength="1500" rows="3"')+button('Confirmar visita'),schedule,base('')+'#visits'),schedule,'schedule-visit'):''}`);
}

function publicationView({actor,route,pub,piece,feedback,currentUrl}) {
  const measurement=formState(feedback,`/pieces/${piece.id}/measure`,{publication:pub.id});
  const snapshots=table(['Medición',...Object.values(metrics)],pub.metrics.map(row=>[
    esc(timestamp(row.observed_at)),...Object.keys(metrics).map(key=>row[key]===null?'—':number(row[key])),
  ]),'Todavía no hay mediciones.');
  return `<article class="detail-publication"><div class="split"><strong>${external(pub.url,label(pub.channel))}</strong><span class="muted">${esc(timestamp(pub.published_at))}</span></div>${snapshots}
    ${agency(actor)?operationPanel('Añadir medición',operationForm(actor,route('/measure'),hidden('publication',pub.id)+dateField('observed','Fecha y hora de la medición',measurement)+
      `<p class="muted">Deja en blanco lo que no puedas comprobar.</p><div class="fields three">${Object.entries(metrics).map(([key,name])=>input(key,name,'number','min="0" max="1000000000000"',measurement.value(key))).join('')}</div>`+
      field(measurement,'notes','Observaciones','maxlength="1000" rows="2"')+button('Guardar medición'),measurement,currentUrl),measurement,'measure-'+pub.id):''}</article>`;
}

function pieceView({actor,base,request,piece,feedback}) {
  const prefix='/pieces/'+piece.id,route=suffix=>base(prefix+suffix),currentUrl=base('')+'#piece-'+piece.id;
  const edit=formState(feedback,prefix+'/edit'),attach=formState(feedback,prefix+'/evidence'),publish=formState(feedback,prefix+'/publication');
  const approve=formState(feedback,prefix+'/review',{status:'APPROVED'}),changes=formState(feedback,prefix+'/review',{status:'PRODUCTION'});
  const active=!['CANCELLED','DELIVERED'].includes(request.status),editable=agency(actor)&&active&&!['CANCELLED','DELIVERED'].includes(piece.status);
  const review=actor.kind!=='AGENCY'&&request.status==='PRODUCTION'&&piece.status==='REVIEW'&&canRequest(actor,request,'APPROVE');
  const editOptions=piece.status==='APPROVED'?['APPROVED','DELIVERED','CANCELLED']:['PRODUCTION','REVIEW','CANCELLED'];
  const files=piece.evidence.length?`<ul class="delivery-files">${piece.evidence.map(item=>`<li><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${icon('content')}<span><strong>${esc(item.label)}</strong><small>Abrir archivo o enlace ↗</small></span></a></li>`).join('')}</ul>`:
    piece.files?.length?'':`<p class="muted">Los archivos aparecerán aquí.</p>`;
  const publicationBody=piece.publications.filter(pub=>can(actor,pub.channel)).map(pub=>publicationView({actor,route,pub,piece,feedback,currentUrl})).join('');
  const canPublish=request.channel==='SOCIAL'&&agency(actor)&&request.status!=='CANCELLED'&&['APPROVED','DELIVERED'].includes(piece.status);
  const publications=publicationBody||canPublish?`<details class="disclosure detail-publications"${publish.failed||feedback?.action===prefix+'/measure'?' open':''}><summary>Publicaciones y métricas${piece.publications.length?' · '+piece.publications.length:''}</summary><div>
    ${canPublish?operationPanel('Registrar publicación',operationForm(actor,route('/publication'),select('channel','Red social',by(socialChannels),publish.value('channel'))+
      input('url','Enlace de la publicación','url','required maxlength="1500"',publish.value('url'))+dateField('published','Fecha y hora de publicación',publish)+button('Guardar publicación'),publish,currentUrl),publish,'publish-'+piece.id):''}
    ${publicationBody}</div></details>`:'';
  return `<article class="delivery-card${review?' delivery-review':''}" id="piece-${piece.id}" aria-labelledby="title-${piece.id}">
    <div class="split"><h3 id="title-${piece.id}">${esc(piece.title)}</h3>${badge(piece.status)}</div>
    ${piece.recorded_at?`<p class="muted">Grabado: ${esc(timestamp(piece.recorded_at))}</p>`:''}${piece.observations?`<p class="prewrap">${esc(piece.observations)}</p>`:''}${files}${deliveryFiles({actor,request,piece,route,base,editable,feedback})}
    ${review?`<section class="delivery-decision" aria-label="Revisar entregable"><h4>¿Está listo para entregar?</h4>
      ${operationForm(actor,route('/review'),hidden('status','APPROVED')+revisionField(approve,piece.revision)+button('Aprobar entrega'),approve,currentUrl,'approve-delivery')}
      ${operationPanel('Pedir cambios',operationForm(actor,route('/review'),hidden('status','PRODUCTION')+revisionField(changes,piece.revision)+
        field(changes,'notes','¿Qué necesitas que cambiemos?','required minlength="5" maxlength="1000" rows="4" placeholder="Ejemplo: cambiar el texto del cierre…"')+button('Enviar cambios'),changes,currentUrl),changes,'changes-'+piece.id)}</section>`:''}
    ${editable?operationPanel('Actualizar entregable',operationForm(actor,route('/edit'),revisionField(edit,piece.revision)+
      `<div class="fields two">${select('status','Estado',by(editOptions),edit.value('status',piece.status))}${request.channel==='SOCIAL'?dateField('recorded','Fecha de grabación',edit,localValue(piece.recorded_at),false):hidden('recorded',edit.value('recorded',localValue(piece.recorded_at)))}</div>`+
      field(edit,'notes','Notas de producción','maxlength="2000" rows="3"',piece.observations)+button('Guardar entregable'),edit,currentUrl),edit,'edit-'+piece.id):''}
    ${agency(actor)&&piece.status!=='CANCELLED'&&request.status!=='CANCELLED'?operationPanel('Añadir enlace externo',operationForm(actor,route('/evidence'),revisionField(attach,piece.revision)+
      input('label','Nombre del archivo','text','required minlength="2" maxlength="100"',attach.value('label'))+
      input('url','Enlace al archivo','url','required maxlength="1500" placeholder="https://…"',attach.value('url'))+button('Guardar enlace'),attach,currentUrl),attach,'attach-'+piece.id):''}${publications}</article>`;
}

function nextStep({actor,company,request,pieces,visits,addPiece}) {
  const pending=pieces.filter(p=>p.status==='REVIEW'),approved=pieces.find(p=>p.status==='APPROVED');
  if(request.status==='CANCELLED')return ['Solicitud cancelada','Los archivos y el historial siguen disponibles.','#history','Ver historial'];
  if(request.status==='DELIVERED')return request.type==='VISIT'?['Visita realizada','Consulta la fecha real y las observaciones de la visita.','#visits','Ver visita']:['Trabajo entregado','Tus archivos están listos para consultar.','#deliverables','Ver entregas'];
  if(actor.kind==='AGENCY') {
    if(!agency(actor))return ['Consulta del negocio','Consulta los avances y las entregas de esta solicitud.','#deliverables','Ver entregables'];
    if(!company.approved)return ['Verifica el negocio','Confirma el registro antes de iniciar la producción.','#details','Ver solicitud'];
    if(request.status==='QUOTED')return ['Esperando al negocio','La cotización está pendiente de aceptación.','#quote','Ver cotización'];
    if(['NEW','REVIEW'].includes(request.status))return request.type==='COURTESY'?['Video de cortesía','Revisa la idea y aprueba el inicio del trabajo.','#request-state','Revisar estado']:['Solicitud recibida','Revisa la idea y prepara la cotización.','#quote','Preparar cotización'];
    if(approved)return ['Una entrega ya está aprobada','Puedes registrar su entrega al negocio.','#edit-'+approved.id,'Completar entrega'];
    if(addPiece)return ['Producción por iniciar','Crea los entregables y adjunta sus archivos.','#create-deliverable','Crear entregable'];
    if(pending.length)return ['Esperando revisión','El negocio tiene entregables pendientes de aprobación.','#piece-'+pending[0].id,'Ver entregable'];
    return ['Trabajo en curso','Consulta los entregables y registra el siguiente avance.','#deliverables','Ver producción'];
  }
  if(request.status==='QUOTED')return actor.kind==='OWNER'?['Tu cotización está lista','Revisa el precio y lo que incluye antes de aceptar.','#quote','Revisar cotización']:['Trabajo en coordinación','El dueño está revisando la cotización.','#details','Ver solicitud'];
  if(pending.length&&request.status==='PRODUCTION')return canRequest(actor,request,'APPROVE')?
    [pending.length===1?'Tienes una entrega por revisar':`Tienes ${pending.length} entregas por revisar`,'Abre los archivos y aprueba la entrega o pide cambios.','#piece-'+pending[0].id,'Revisar entrega']:
    ['Entregables en revisión','El responsable del negocio puede aprobarlos o pedir cambios.','#deliverables','Ver archivos'];
  if(visits.some(v=>v.status==='SCHEDULED'))return ['Tu visita está programada','Consulta la fecha, el lugar y las indicaciones.','#visits','Ver visita'];
  return request.status==='PRODUCTION'?['Estamos preparando tu trabajo','Aquí encontrarás los archivos y los próximos avances.','#deliverables','Ver avances']:
    ['Recibimos tu solicitud','Lúmina te contactará para coordinar el trabajo.','#details','Ver solicitud'];
}

function recovery(feedback,currentUrl) {
  const fields={title:'Nombre',brief:'Indicaciones',notes:'Observaciones',terms:'Condiciones',amount:'Precio',label:'Nombre del enlace',url:'Enlace',starts:'Fecha',recorded:'Fecha real',place:'Lugar',observed:'Medición',...metrics};
  const rows=Object.entries(fields).filter(([key])=>feedback.values[key]).map(([key,title])=>`<div><dt>${esc(title)}</dt><dd class="prewrap">${esc(feedback.values[key])}</dd></div>`).join('');
  return `<aside class="detail-error" role="alert" tabindex="-1" data-detail-error><strong>No se guardó este cambio</strong><p>${esc(feedback.error)}</p>${rows?`<details open><summary>Lo que intentaste guardar</summary><dl>${rows}</dl></details>`:''}${localLink(currentUrl,'Revisar versión actual','btn secondary')}</aside>`;
}

export function requestDetail({actor,company,url,request,quote,pieces,visits,audit,contracts,plan,feedback=null}) {
  const base=suffix=>url('/requests/'+request.id+suffix),admin=agency(actor),work=!['PLAN','VISIT'].includes(request.type);
  const states={NEW:['REVIEW','APPROVED','CANCELLED'],REVIEW:['APPROVED','CANCELLED'],QUOTED:['CANCELLED'],APPROVED:['CANCELLED'],SCHEDULED:['CANCELLED'],PRODUCTION:['CANCELLED'],DELIVERED:[],CANCELLED:request.type==='COURTESY'?['NEW']:[]};
  const options=states[request.status].filter(state=>state!=='APPROVED'||company.approved&&(!plan||plan.price_minor!==null));
  const change=formState(feedback,'/state'),create=formState(feedback,'/pieces');
  const addPiece=admin&&company.approved&&work&&['APPROVED','SCHEDULED','PRODUCTION'].includes(request.status)&&pieces.filter(p=>p.status!=='CANCELLED').length<request.quantity;
  const quota=contracts.filter(c=>!c.cancelled_at&&c.starts_on<=localDay()&&c.ends_before>localDay()).flatMap(c=>c.items
    .filter(i=>(request.channel==='SOCIAL'?compatibleContentQuota(request.service,i.service):i.service===request.service)&&i.quantity>i.used+i.reserved)
    .map(i=>[c.id+':'+i.service,c.name+' · '+label(i.service)+' · '+(i.quantity-i.used-i.reserved)+' disponibles']));
  const context={actor,company,url,base,request,quote,pieces,visits,feedback,addPiece};
  let [heading,explanation,anchor,caption]=nextStep(context);
  if(!work&&anchor==='#deliverables'){anchor=request.type==='VISIT'?'#visits':'#details';caption=request.type==='VISIT'?'Ver visita':'Ver solicitud';}
  const step=({NEW:0,REVIEW:1,QUOTED:1,APPROVED:1,SCHEDULED:1,PRODUCTION:2,DELIVERED:3})[request.status];
  const timeline=step===undefined||!work?'':`<ol class="request-timeline" aria-label="Avance de la solicitud">${['Recibida','Coordinación','Producción','Entrega'].map((name,i)=>`<li${i===step?' aria-current="step"':''}><span>${i<step?'✓':i+1}</span>${name}</li>`).join('')}</ol>`;
  const rank=actor.kind==='AGENCY'?{APPROVED:0,PRODUCTION:1,REVIEW:2,DELIVERED:3,CANCELLED:4}:{REVIEW:0,DELIVERED:1,APPROVED:2,PRODUCTION:3,CANCELLED:4};
  const allPieces=[...pieces].sort((a,b)=>rank[a.status]-rank[b.status]).map(piece=>pieceView({...context,piece})).join('');
  const deliverables=work?part('deliverables','Entregables',`<p class="detail-count">${pieces.filter(p=>p.status==='DELIVERED').length} de ${request.quantity} entregados${pieces.some(p=>p.status==='REVIEW')?' · '+pieces.filter(p=>p.status==='REVIEW').length+' en revisión':''}</p>${allPieces||message('El trabajo aún no tiene archivos para entregar.')}
    ${addPiece?operationPanel('Crear entregable',operationForm(actor,base('/pieces'),revisionField(create,request.revision)+
      input('title','Nombre del entregable','text','required minlength="2" maxlength="150"',create.value('title',request.title))+
      (request.type!=='COURTESY'&&quota.length?select('allocation','Usar un cupo de tu acuerdo',[['','Sin asignar a un cupo'],...quota],create.value('allocation')):'')+
      button('Crear entregable'),create,base('')+'#deliverables'),create,'create-deliverable',!pieces.length):''}`):'';
  const info=part('details','Tu solicitud',`<div class="tags">${badge(request.type)}${badge(request.channel)}${badge(request.status)}</div><dl class="detail-facts"><div><dt>Servicio</dt><dd>${esc(request.channel==='SOCIAL'&&actor.kind!=='AGENCY'?contentName(request.service):label(request.service))}</dd></div>${work?`<div><dt>Cantidad</dt><dd>${request.quantity}</dd></div>`:''}<div><dt>Recibida</dt><dd>${esc(timestamp(request.created_at))}</dd></div></dl>
    ${request.brief?`<h3>Lo que solicitaste</h3><p class="prewrap">${esc(request.brief)}</p>`:''}${contactLine(request.contact_phone,company.phone)}
    ${admin&&options.length?operationPanel('Cambiar estado',operationForm(actor,base('/state'),revisionField(change,request.revision)+select('status','Estado',by(options),change.value('status'))+
      field(change,'notes','Motivo u observaciones','maxlength="1000" rows="3"')+button('Guardar estado'),change,base('')+'#details'),change,'request-state'):''}
    ${plan?`<p>Las nuevas contrataciones se gestionan mediante una propuesta aceptada por el dueño. ${localLink(url('/plans'),'Ver Paquetes y servicios')}</p>`:''}`);
  const quoteBody=quotePanel(context),visitBody=visitsPanel(context);
  const tabs=[...(work?[['deliverables','Entregables']]:[]),...(quoteBody?[['quote','Cotización']]:[]),...(visitBody?[['visits','Visitas']]:[]),['details','Solicitud'],['history','Historial']];
  const history=`<details class="disclosure detail-history" id="history"><summary>Historial de la solicitud <span>Últimos ${audit.length} movimientos</span></summary><div>${table(['Fecha','Responsable','Movimiento','Detalle'],audit.map(row=>[esc(timestamp(row.happened_at)),esc(row.actor_name),esc(row.action.replaceAll('_',' ')),esc(row.details)]),'Todavía no hay movimientos.')}</div></details>`;
  const panels=quoteBody+deliverables+visitBody+info+history;
  return `<div class="request-detail" data-request-detail><p class="detail-back">${localLink(url(request.channel==='SOCIAL'?'/content':'/requests',request.channel==='SOCIAL'?{view:'requests'}:{}),'← Todas las solicitudes')}</p>
    ${feedback&&!panels.includes(' data-detail-error>')?recovery(feedback,base('')):''}
    <section class="delivery-next"><div><span class="eyebrow">SIGUIENTE PASO</span><h2>${esc(heading)}</h2><p>${esc(explanation)}</p></div>${localLink(anchor,caption,'btn')}</section>${timeline}
    <nav class="detail-jumps" aria-label="Secciones de la solicitud">${tabs.map(([id,name])=>localLink('#'+id,name)).join('')}</nav>${panels}</div>`;
}

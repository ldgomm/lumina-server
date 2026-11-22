import { localDay, uuid } from '../../shared/domain.mjs';
import { button, esc, hidden, input, localLink, textarea, timestamp } from './components.mjs';
import { billingDate, money } from './billing-account-pages.mjs';
import { outlookDetail } from './plan-comparison.mjs';
import { paging } from './workday-pages.mjs';

export const agencyFollowUpLinks='<nav class="actions" aria-label="Seguimiento de negocios">'+localLink('/businesses/follow-up','Negocios que necesitan seguimiento','btn secondary')+localLink('/businesses/wallet-outlook','Cierre y previsión de Wallet','btn secondary')+'</nav>';
const url=(path,params)=>path+'?'+new URLSearchParams(params);
function search(path,q,fields=''){
  return `<form class="workday-search" method="get" action="${path}">${fields}${input('q','Nombre del negocio','search','maxlength="100"',q)}${button('Buscar','secondary')}</form>`;
}
export function agencyOutlookPage(data) {
  const path='/businesses/wallet-outlook',month=data.cut.slice(0,7),q=data.q;
  const total=data.amounts;
  const figure=v=>v==null?'Por confirmar':money(v);
  return localLink('/businesses','← Negocios')+`<section class="card"><h2>Cierre de Wallet · ${billingDate(data.cut)}</h2>
    ${search(path,q,input('month','Corte','month','min="2027-02" max="'+data.latest.slice(0,7)+'"',month)+(data.company?hidden('company',data.company):''))}
    ${data.company?localLink(path+'?month='+month,'Ver todos los negocios'):''}
    <div class="closing-totals">${[['Previsto',total.expected,total.unknownExpected],['Emitido',total.issued,total.unknownBills],['Pagado',total.paid,total.unknownBills],['Pendiente',total.pending,total.unknownBills]].map(([name,value,missing])=>'<div><span>'+name+'</span><strong>'+figure(data.total>0&&missing===data.total?null:value)+'</strong>'+(missing?'<small>Parcial · '+missing+' por confirmar</small>':'')+'</div>').join('')}</div>
    <p>Incluye los ${data.total} negocios de esta consulta. Los pagos reflejan lo registrado hasta hoy.</p>
    ${data.rows.map(row=>{
      const detail=row.outlook.referenceAvailable===false?'<p>Sin previsión guardada para este corte.</p>':outlookDetail(row.outlook);
      const diff=data.cut!==data.latest&&row.expected!==null&&row.issued!==null?row.issued-row.expected:null;
      const bills=row.outlook.bills||[];
      return '<section class="outlook-business"><h3>'+esc(row.name)+'</h3><p>Previsto '+figure(row.expected)+' · Emitido '+figure(row.issued)+' · Pagado '+figure(row.paid)+' · Pendiente '+figure(row.pending)+'</p>'+
        (diff?'<p class="notice">Diferencia entre lo previsto y lo emitido · '+figure(diff)+'</p>':'')+
        '<details><summary>Ver períodos, sucursales y cargos</summary>'+detail+
        (bills.length?'<ul>'+bills.map(b=>'<li>'+esc(b.name)+' · '+figure(b.issued)+(b.void?' · Anulado':' · Pagado '+figure(b.paid))+'</li>').join('')+'</ul>':'')+'</details>'+
        localLink('/admin/businesses/'+row.id+'?view=wallet','Consultar cuenta de Wallet')+'</section>';
    }).join('')||'<p>Sin coincidencias.</p>'}
    ${paging({...data,path,url,params:{q,company:data.company,month}})}</section>`;
}
export function followUpPage(data,actor) {
  const {view,q,rows,unavailable}=data,path='/businesses/follow-up';
  const today=localDay();
  const label=view==='wallet'?'Pendiente la primera compra':'Pendiente de entregar el video';
  return localLink('/businesses','← Negocios')+'<section class="card"><nav class="workday-tabs" aria-label="Motivo de seguimiento">'+
    [['courtesy','Videos de cortesía'],['wallet','Primera compra en Wallet']].map(([id,label])=>`<a href="${esc(url(path,{view:id,q}))}" ${id===view?'aria-current="page"':''}>${label}</a>`).join('')+'</nav>'+search(path,q,hidden('view',view))+
    (unavailable?`<p role="status">Falta verificar la actividad de ${unavailable} ${unavailable===1?'negocio':'negocios'}. Vuelve a consultar para completar la lista.</p>`:'')+
    '<h2>'+label+'</h2>'+ (rows.length?rows.map(row=>{
      const day=localDay(new Date(row.since)),days=Math.max(0,(Date.parse(today)-Date.parse(day))/86400000);
      const target=view==='wallet'?'/admin/businesses/'+row.id:'/agency/requests/'+row.request+'?company='+row.id;
      const contacts=row.contacts||[],latest=contacts[0];
      const history=contacts.map(c=>'<li><strong>'+esc(c.actor_name)+'</strong> · '+esc(timestamp(c.happened_at))+'<p>'+esc(c.note)+'</p></li>').join('');
      const management=actor?`<details><summary>Registrar contacto</summary><form method="post" action="/businesses/follow-up/contact">${hidden('_csrf',actor.csrf)+hidden('kind',view)+hidden('case_id',row.caseId)+hidden('company',row.id)+hidden('previous',latest?.id||'')+hidden('q',q)+hidden('page',data.page)+hidden('request_key',uuid())}${textarea('note','¿Qué acordaron?','required minlength="2" maxlength="500"')}${input('next_on','Próximo contacto (opcional)','date','min="'+today+'"')}${button('Guardar contacto')}</form>${history?'<h4>Contactos recientes</h4><ol>'+history+'</ol>':''}</details>`:'';
      return `<article class="follow-up-row" id="case-${esc(row.id)}"><div><h3>${esc(row.name)}</h3><p>${days===0?'Desde hoy':days===1?'Desde ayer':'Hace '+days+' días'} · ${billingDate(day)}</p>${latest?'<p>Atendió '+esc(latest.actor_name)+' · '+esc(latest.note)+'</p>'+(latest.next_on?'<p><strong>'+(latest.next_on<today?'Contacto pendiente desde el ':latest.next_on===today?'Contactar hoy · ':'Próximo contacto · ')+esc(billingDate(latest.next_on))+'</strong></p>':''):''}${management}</div>${localLink(target,view==='wallet'?'Abrir negocio':'Abrir solicitud','btn secondary')}</article>`;
    }).join(''):'<p>'+ (q?'Sin coincidencias.':unavailable?'Sin casos confirmados en los datos disponibles.':'Todo al día.')+'</p>')+paging({...data,path,url,params:{view,q}})+'</section>';
}

import { localDay } from '../../shared/domain.mjs';
import { button, esc, hidden, input, localLink } from './components.mjs';
import { billingDate } from './billing-account-pages.mjs';
import { outlookDetail } from './plan-comparison.mjs';
import { paging } from './workday-pages.mjs';

export const agencyFollowUpLinks='<nav class="actions" aria-label="Seguimiento de negocios">'+localLink('/businesses/follow-up','Negocios que necesitan seguimiento','btn secondary')+localLink('/businesses/wallet-outlook','Previsión de cobros de Wallet','btn secondary')+'</nav>';
const url=(path,params)=>path+'?'+new URLSearchParams(params);
function search(path,q,fields=''){
  return `<form class="workday-search" method="get" action="${path}">${fields}${input('q','Nombre del negocio','search','maxlength="100"',q)}${button('Buscar','secondary')}</form>`;
}
export function agencyOutlookPage(data) {
  const path='/businesses/wallet-outlook';
  return localLink('/businesses','← Negocios')+`<section class="card"><h2>Corte del ${billingDate(data.cut)}</h2><p>Importes previstos según los planes aceptados. Si el dueño cambia su plan antes del corte, la previsión se actualizará.</p>
    ${search(path,data.q)}${data.company?localLink(path,'Ver todos los negocios'):''}
    ${data.rows.map(row=>`<section class="outlook-business"><h3>${esc(row.name)}</h3>${outlookDetail(row.outlook)}${localLink('/admin/businesses/'+row.id+'?view=wallet','Consultar cuenta de Wallet')}</section>`).join('')||'<p>Sin coincidencias.</p>'}
    ${paging({...data,path,url,params:{q:data.q,company:data.company}})}</section>`;
}
export function followUpPage(data) {
  const {view,q,rows,unavailable}=data,path='/businesses/follow-up';
  const today=localDay();
  const label=view==='wallet'?'Pendiente la primera compra':'Pendiente de entregar el video';
  return localLink('/businesses','← Negocios')+'<section class="card"><nav class="workday-tabs" aria-label="Motivo de seguimiento">'+
    [['courtesy','Videos de cortesía'],['wallet','Primera compra en Wallet']].map(([id,label])=>`<a href="${esc(url(path,{view:id,q}))}" ${id===view?'aria-current="page"':''}>${label}</a>`).join('')+'</nav>'+search(path,q,hidden('view',view))+
    (unavailable?`<p role="status">Falta verificar la actividad de ${unavailable} ${unavailable===1?'negocio':'negocios'}. Vuelve a consultar para completar la lista.</p>`:'')+
    '<h2>'+label+'</h2>'+ (rows.length?rows.map(row=>{
      const day=localDay(new Date(row.since)),days=Math.max(0,(Date.parse(today)-Date.parse(day))/86400000);
      const target=view==='wallet'?'/admin/businesses/'+row.id:'/agency/requests/'+row.request+'?company='+row.id;
      return `<article class="follow-up-row"><div><h3>${esc(row.name)}</h3><p>${days===0?'Desde hoy':days===1?'Desde ayer':'Hace '+days+' días'} · ${billingDate(day)}</p></div>${localLink(target,view==='wallet'?'Abrir negocio':'Abrir solicitud','btn secondary')}</article>`;
    }).join(''):'<p>'+ (q?'Sin coincidencias.':unavailable?'Sin casos confirmados en los datos disponibles.':'Todo al día.')+'</p>')+paging({...data,path,url,params:{view,q}})+'</section>';
}

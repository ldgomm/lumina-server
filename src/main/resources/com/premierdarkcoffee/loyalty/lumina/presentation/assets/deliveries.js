'use strict';

// Anchor navigation also reveals a collapsed operation. Everything still works
// as ordinary links and forms without JavaScript; no drafts leave this page.
const requestDetail=document.querySelector('[data-request-detail]');
if(requestDetail){
  const reveal=(target,focus=true)=>{
    for(let node=target;node&&node!==requestDetail;node=node.parentElement){
      if(node.tagName==='DETAILS')node.open=true;
    }
    if(!focus)return;
    const destination=target.tagName==='DETAILS'?target.querySelector('summary'):target;
    if(!destination)return;
    if(!destination.hasAttribute('tabindex'))destination.tabIndex=-1;
    destination.focus();
  };
  const fromHash=()=>{
    let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
    const previous=id;
    const aliases={'cotizacion':'quote','visitas':'visits','entregables':'deliverables','detalle':'details','historial':'history','enviar-cotizacion':'send-quote','programar-visita':'schedule-visit','crear-entregable':'create-deliverable','estado-solicitud':'request-state'};
    id=Object.hasOwn(aliases,id)?aliases[id]:id.replace(/^(pieza|titulo|cerrar|medir|publicar|cambios|editar|adjuntar)-/,(_,key)=>({pieza:'piece',titulo:'title',cerrar:'close',medir:'measure',publicar:'publish',cambios:'changes',editar:'edit',adjuntar:'attach'}[key])+'-');
    const target=id&&document.getElementById(id);
    if(target&&requestDetail.contains(target)&&previous!==id)history.replaceState(history.state,'',location.pathname+location.search+'#'+encodeURIComponent(id));
    if(target&&requestDetail.contains(target))reveal(target);
  };
  requestDetail.addEventListener('click',event=>{
    const anchor=event.target.closest('a[href^="#"]');
    if(!anchor||event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const target=document.getElementById(anchor.getAttribute('href').slice(1));
    if(target&&requestDetail.contains(target))reveal(target);
  });
  window.addEventListener('hashchange',fromHash);
  const error=requestDetail.querySelector('[data-detail-error]');
  if(error)reveal(error);else fromHash();
}

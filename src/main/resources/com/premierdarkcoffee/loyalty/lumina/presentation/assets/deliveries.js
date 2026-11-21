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

for(const form of document.querySelectorAll('[data-file-upload]'))form.addEventListener('submit',event=>{const file=form.querySelector('[type=file]').files[0],status=form.querySelector('[data-upload-status]');if(file&&file.size>100*1024*1024){event.preventDefault();status.hidden=false;status.textContent='El archivo supera los 100 MB. Selecciona uno más pequeño.';return;}status.hidden=false;status.textContent='Subiendo archivo… Mantén esta página abierta.';form.querySelector('button[type=submit],button:not([type])')?.setAttribute('disabled','');});

for(const panel of document.querySelectorAll('[data-piece-preview]')){
  panel.addEventListener('toggle',()=>{
    const mount=panel.querySelector('.piece-media');
    if(!panel.open){mount.querySelector('video')?.pause();return;}
    if(mount.childElementCount)return;
    const type=panel.dataset.piecePreview,link=panel.querySelector('[data-preview-file]');
    let media;
    if(type.startsWith('image/')){media=new Image();media.alt=link.firstChild.textContent.trim();}
    else if(type.startsWith('video/')){media=document.createElement('video');media.controls=true;media.playsInline=true;media.preload='none';media.setAttribute('aria-label',link.firstChild.textContent.trim());}
    if(media){media.src=link.href;mount.append(media);}
  });
}

for (const panel of document.querySelectorAll('[data-delivery-review]')) {
  const form=panel.querySelector('[data-moment-form]');
  const field=form?.elements.seconds;
  function showMoment() {
    const note=form.querySelector('[data-draft-moment]');
    note.hidden=field.value==='';
    if(!note.hidden){
      const seconds=Number(field.value);
      const time=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
      note.querySelector('[role=status]').textContent='Comentario en '+time;
    }
  }
  if(form){
    showMoment();
    const clear=()=>{field.value='';showMoment();};
    form.elements.file?.addEventListener('change',clear);
    form.querySelector('[data-clear-moment]').addEventListener('click',()=>{clear();form.elements.comment.focus();});
    for(const capture of panel.querySelectorAll('[data-capture-moment]')){
      const player=document.getElementById('video-'+capture.dataset.captureMoment);
      capture.hidden=false;
      capture.addEventListener('click',()=>{
        player.pause();
        form.closest('details').open=true;
        form.elements.file.value=capture.dataset.captureMoment;
        field.value=String(Math.floor(player.currentTime||0));
        showMoment();
        form.elements.comment.focus();
      });
    }
  }
  for(const link of panel.querySelectorAll('[data-jump-file]'))link.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const player=document.getElementById('video-'+link.dataset.jumpFile);
    if(!player||!panel.contains(player))return;
    event.preventDefault();
    for(let parent=player.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    player.pause();
    const seconds=Number(link.dataset.seconds);
    if(player.readyState>=1)player.currentTime=seconds;
    else{
      // An older video may have preload=none. The last selected moment wins
      // even when several comments are opened while its metadata loads.
      player.onloadedmetadata=()=>{player.onloadedmetadata=null;player.currentTime=seconds;};
      player.preload='metadata';
      if(player.networkState===0||player.networkState===3)player.load();
    }
    player.focus();
    player.scrollIntoView({block:'center'});
  });
}

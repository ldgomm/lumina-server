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
    const target=id&&document.getElementById(id);
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

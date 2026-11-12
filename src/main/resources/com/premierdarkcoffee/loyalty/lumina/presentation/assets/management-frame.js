'use strict';
(()=>{
 const frame=document.querySelector('[data-management-frame]');if(!frame)return;
 const status=document.querySelector('[data-frame-status]');
 const viewport=()=>{const box=frame.getBoundingClientRect();frame.contentWindow.postMessage({kind:'lumina-management-viewport',top:Math.max(0,-box.top),height:Math.max(160,Math.min(box.bottom,innerHeight)-Math.max(0,box.top))},location.origin);};
 window.addEventListener('scroll',viewport,{passive:true});window.addEventListener('resize',viewport);frame.addEventListener('load',viewport);
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.kind!=='lumina-management-size')return;const h=event.data.height;if(Number.isFinite(h)&&h>=160&&h<=60000){frame.style.height=Math.ceil(h)+'px';viewport();}});
 frame.addEventListener('load',()=>{try{const doc=frame.contentDocument;if(!doc?.querySelector('meta[name=lumina-management]'))status.textContent='La sesión o el acceso cambió. Recarga esta página para continuar.';}catch{status.textContent='No se pudo abrir esta sección.';}});
 // Preserve the native editor's dirty-form and in-flight guards when leaving the outer page.
 function leave(proceed){const w=frame.contentWindow;try{if(w.document.querySelector('form[aria-busy=true]')){status.textContent='Espera a que termine el guardado.';return;}if(typeof w.loyaltyAdminLeave==='function'){w.loyaltyAdminLeave(proceed);return;}}catch{}proceed();}
 document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link||link.target||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;event.preventDefault();leave(()=>location.assign(link.href));},true);
 document.addEventListener('submit',event=>{if(event.target.action===location.origin+'/salir'&&!event.target.dataset.leaveChecked){event.preventDefault();event.stopImmediatePropagation();leave(()=>{event.target.dataset.leaveChecked='yes';event.target.requestSubmit();});}},true);
})();

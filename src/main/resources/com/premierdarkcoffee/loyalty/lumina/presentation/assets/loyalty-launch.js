'use strict';
(async()=>{
  const mode=document.querySelector('meta[name="lumina-wallet-mode"]').content;
  try {
    if(mode==='platform') {
      const form=document.querySelector('#platformLogin');
      if(!form)throw new Error('No se pudo abrir el acceso de administración. Vuelve al centro Wallet.');
      form.elements.platformToken.value='lumina-delegated-wallet-session';
      form.requestSubmit();
    } else {
      state.token='lumina-delegated-wallet-session';
      state.data=await api('/api/staff/dashboard');state.member=null;
      const allowed=JSON.parse(document.querySelector('meta[name="lumina-wallet-sections"]').content);
      if(allowed){
        const render=renderMerchant;
        const restrict=()=>{
          for(const control of app.querySelectorAll('[data-tab]'))if(!allowed.includes(control.dataset.tab))control.remove();
          app.querySelector('#quickCounter')?.remove();app.querySelector('.workspace-search')?.remove();
          const caption=app.querySelector('.workspace-business small');if(caption&&caption.textContent!=='Equipo · Mis áreas')caption.textContent='Equipo · Mis áreas';
        };
        renderMerchant=function(){if(!allowed.includes(state.tab))state.tab=allowed[0];if(state.tab==='reports'){location.assign('/wallet/gestion?seccion=reports');return;}render();restrict();};
        document.addEventListener('click',event=>{const tab=event.target.closest('[data-tab]');if(tab&&!allowed.includes(tab.dataset.tab)){event.preventDefault();event.stopImmediatePropagation();}},true);
        new MutationObserver(restrict).observe(app,{childList:true,subtree:true});
      }
      const section=document.querySelector('meta[name="lumina-wallet-section"]').content;
      state.tab=['overview','design','walletHealth','programs','rewards','qr','customers','administration','reports','sales'].includes(section)?section:'design';
      exit.hidden=false;renderMerchant();
    }
    exit.textContent='Volver a Lúmina';exit.onclick=()=>location.assign('/wallet');
  } catch(error) { app.textContent=error.message;exit.hidden=false;exit.onclick=()=>location.assign('/wallet'); }
})();

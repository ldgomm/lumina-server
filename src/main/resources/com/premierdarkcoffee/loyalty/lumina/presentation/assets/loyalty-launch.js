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
      const section=document.querySelector('meta[name="lumina-wallet-section"]').content;
      state.tab=['overview','design','walletHealth','programs','rewards','qr','customers','administration','reports','sales'].includes(section)?section:'design';
      exit.hidden=false;renderMerchant();
    }
    exit.textContent='Volver a Lúmina';exit.onclick=()=>location.assign('/wallet');
  } catch(error) { app.textContent=error.message;exit.hidden=false;exit.onclick=()=>location.assign('/wallet'); }
})();

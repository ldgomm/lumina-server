'use strict';
(async()=>{
  const back=document.querySelector('meta[name="lumina-wallet-back"]')?.content||'/wallet';
  const mode=document.querySelector('meta[name="lumina-wallet-mode"]').content;
  try {
    if(mode==='platform') {
      const form=document.querySelector('#platformLogin');
      if(!form)throw new Error('No se pudo abrir el acceso de administración. Vuelve al centro Wallet.');
      form.elements.platformToken.value='lumina-delegated-wallet-session';
      form.requestSubmit();
    } else {
      const company=document.querySelector('meta[name="lumina-wallet-company"]')?.content;
      renderJoinQR=function(){
        const slug=encodeURIComponent(state.data.business.slug),scope=company?'?empresa='+encodeURIComponent(company):'';
        document.querySelector('#content').innerHTML=`<section class="panel narrow"><h2>Invita a tus clientes</h2><p>Coloca este QR en tu local para que tus clientes se registren y añadan su tarjeta. La misma tarjeta funciona en todas tus sucursales.</p><img class="qr" alt="QR de registro" src="/api/public/${slug}/qr${scope}"><a class="button" href="/join/${slug}${scope}" target="_blank" rel="noopener">Abrir formulario</a></section>`;
      };
      const teamUrl=document.querySelector('meta[name="lumina-wallet-team"]')?.content||back;
      if(window.LoyaltyManagement)window.LoyaltyManagement.team=async()=>location.assign(teamUrl);
      document.addEventListener('click',event=>{if(event.target.closest('[data-tab="team"],[data-destination="team"],[data-branch-team],#openTeam')){event.preventDefault();event.stopImmediatePropagation();location.assign(teamUrl);}},true);
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
    exit.textContent='Volver a Lúmina';exit.onclick=()=>location.assign(back);
  } catch(error) { app.textContent=error.message;exit.hidden=false;exit.onclick=()=>location.assign(back); }
})();

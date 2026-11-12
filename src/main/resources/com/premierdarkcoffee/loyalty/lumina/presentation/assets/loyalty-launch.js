'use strict';
(async()=>{
 const back=document.querySelector('meta[name="lumina-wallet-back"]')?.content||'/inicio';
 const central={administration:'/gestion',business:'/gestion/negocio',branches:'/gestion/sucursales',team:'/equipo',activity:'/gestion/actividad',operations:'/gestion/operacion',account:'/planes?vista=acuerdos',reports:'/gestion/informes'};
 const leave=path=>{if(document.querySelector('form[aria-busy=true]')){notice('Espera a que termine el guardado.');return;}const go=()=>location.assign(path),design=()=>window.loyaltyDesignLeave?window.loyaltyDesignLeave(go):go(),operation=()=>window.loyaltyOperationLeave?window.loyaltyOperationLeave(design):design();window.loyaltyAdminLeave(operation);};
 try{
  const company=document.querySelector('meta[name="lumina-wallet-company"]')?.content;
  renderJoinQR=function(){const slug=encodeURIComponent(state.data.business.slug),scope=company?'?empresa='+encodeURIComponent(company):'';document.querySelector('#content').innerHTML=`<section class="panel narrow"><h2>Invita a tus clientes</h2><p>Coloca este QR en tu local para que tus clientes se registren y añadan su tarjeta. La misma tarjeta funciona en todas tus sucursales.</p><img class="qr" alt="QR de registro" src="/api/public/${slug}/qr${scope}"><a class="button" href="/join/${slug}${scope}" target="_blank" rel="noopener">Abrir formulario</a></section>`;};
  state.token='lumina-delegated-wallet-session';state.data=await api('/api/staff/dashboard');state.member=null;
  const allowed=JSON.parse(document.querySelector('meta[name="lumina-wallet-sections"]').content);
  if(!Array.isArray(allowed)||!allowed.length)throw new Error('No hay áreas de Wallet asignadas a tu cuenta.');
  const owner=document.querySelector('meta[name="lumina-wallet-owner"]')?.content==='yes';
  const render=renderMerchant;
  const restrict=()=>{
   for(const control of app.querySelectorAll('[data-tab]'))if(!allowed.includes(control.dataset.tab))control.remove();
   for(const group of app.querySelectorAll('.nav-group'))if(!group.querySelector('[data-tab]'))group.remove();
   app.querySelector('.workspace-search')?.remove();if(!allowed.includes('sales'))app.querySelector('#quickCounter')?.remove();
   const caption=app.querySelector('.workspace-business small');const text=owner?'Wallet de tu negocio':'Equipo · Mis áreas';if(caption&&caption.textContent!==text)caption.textContent=text;
  };
  renderMerchant=function(){if(central[state.tab]){leave(central[state.tab]);return;}if(!allowed.includes(state.tab))state.tab=allowed[0];render();restrict();};
  document.addEventListener('click',event=>{const control=event.target.closest('[data-tab],[data-destination],[data-branch-team],#openTeam');if(!control)return;const tab=control.dataset.tab||control.dataset.destination||'team';if(central[tab]){event.preventDefault();event.stopImmediatePropagation();leave(central[tab]);}else if(control.dataset.tab&&!allowed.includes(tab)){event.preventDefault();event.stopImmediatePropagation();}},true);
  new MutationObserver(restrict).observe(app,{childList:true,subtree:true});
  state.tab=document.querySelector('meta[name="lumina-wallet-section"]').content;exit.hidden=false;renderMerchant();
  exit.textContent='Volver a Lúmina';exit.onclick=()=>leave(back);
 }catch(error){app.textContent=error.message;exit.hidden=false;exit.textContent='Volver a Lúmina';exit.onclick=()=>location.assign(back);}
})();

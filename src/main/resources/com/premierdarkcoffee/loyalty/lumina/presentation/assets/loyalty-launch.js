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
  const editable=JSON.parse(document.querySelector('meta[name="lumina-wallet-editable"]')?.content||'[]');
  const render=renderMerchant;
  const restrict=()=>{
   for(const control of app.querySelectorAll('[data-tab]'))if(!allowed.includes(control.dataset.tab))control.remove();
   for(const group of app.querySelectorAll('.nav-group'))if(!group.querySelector('[data-tab]'))group.remove();
   app.querySelector('.workspace-search')?.remove();if(!allowed.includes('sales'))app.querySelector('#quickCounter')?.remove();
   const nav=app.querySelector('.workspace-nav');
   if(nav&&document.querySelector('meta[name="lumina-wallet-cash"]')?.content==='yes'&&!nav.querySelector('[data-lumina-cash]')){
    const a=document.createElement('a');a.dataset.luminaCash='yes';a.className='wallet-section-link';a.href='/caja';a.textContent='Caja · Compras y canjes';a.onclick=e=>{e.preventDefault();leave('/caja');};nav.prepend(a);
   }
   const caption=app.querySelector('.workspace-business small');const text=owner?'Wallet de tu negocio':'Equipo · Mis áreas';if(caption&&caption.textContent!==text)caption.textContent=text;
   const content=app.querySelector('#content');
   if(!owner&&content&&!editable.includes(state.tab)&&state.tab!=='qr'){
    if(!content.querySelector('[data-lumina-readonly]')){const note=document.createElement('p');note.dataset.luminaReadonly='yes';note.className='pill';note.textContent='Solo consulta';content.prepend(note);}
    const controls={design:'#saveDesign,#restoreDesign,#designFixColors,#useAutomaticReward',programs:'#newPromotion,[data-program-edit],[data-program-delete],[data-program-status],[data-add-reward],[data-reward-goal],[data-reward]',rewards:'[data-reward],[data-reward-goal]',customers:'#openWalletRecovery,[data-customer-restore]'};
    for(const control of content.querySelectorAll(controls[state.tab]||'[data-no-control]'))control.hidden=true;
    if(state.tab==='programs'&&!state.data.programs.length){const empty=content.querySelector('#emptyPromotionAction');if(empty)empty.hidden=true;}
    for(const form of content.querySelectorAll('#walletDesign,#program,#programV7,#reward,#promotionTemplate,#customerPreferences,#customerEvent,#restoreIssue')){
      for(const control of form.querySelectorAll('input,select,textarea,button[type=submit],button:not([type])'))control.disabled=true;
      if(form.id==='reward'||form.id==='program'||form.id==='promotionTemplate')form.closest('section')?.setAttribute('hidden','');
    }
   }
  };
  renderMerchant=function(){if(central[state.tab]){leave(central[state.tab]);return;}if(!allowed.includes(state.tab))state.tab=allowed[0];render();restrict();};
  document.addEventListener('click',event=>{const control=event.target.closest('[data-tab],[data-destination],[data-branch-team],#openTeam');if(!control)return;const tab=control.dataset.tab||control.dataset.destination||'team';if(central[tab]){event.preventDefault();event.stopImmediatePropagation();leave(central[tab]);}else if(control.dataset.tab&&!allowed.includes(tab)){event.preventDefault();event.stopImmediatePropagation();}},true);
  new MutationObserver(restrict).observe(app,{childList:true,subtree:true});
  state.tab=document.querySelector('meta[name="lumina-wallet-section"]').content;exit.hidden=false;renderMerchant();
  exit.textContent='Volver a Lúmina';exit.onclick=()=>leave(back);
 }catch(error){app.textContent=error.message;exit.hidden=false;exit.textContent='Volver a Lúmina';exit.onclick=()=>location.assign(back);}
})();

'use strict';
(async()=>{
 const back=document.querySelector('meta[name="lumina-wallet-back"]')?.content||'/home';
 document.addEventListener('click',event=>{const link=event.target.closest('[data-lumina-account],[data-lumina-back],.wallet-subscription-note a,.loyalty-breadcrumb a');if(link){event.preventDefault();leave(link.getAttribute('href'));}},true);
 const central={administration:'/management',business:'/management/business',branches:'/management/branches',team:'/team',activity:'/management/activity',operations:'/management/operations',account:'/plans?view=agreements',reports:'/management/reports'};
 const leave=path=>{if(document.querySelector('form[aria-busy=true]')){notice('Espera a que termine el guardado.');return;}const go=()=>location.assign(path),design=()=>window.loyaltyDesignLeave?window.loyaltyDesignLeave(go):go(),operation=()=>window.loyaltyOperationLeave?window.loyaltyOperationLeave(design):design();window.loyaltyAdminLeave?window.loyaltyAdminLeave(operation):operation();};
 try{
  const company=document.querySelector('meta[name="lumina-wallet-company"]')?.content;
  renderJoinQR=function(){
   const slug=encodeURIComponent(state.data.business.slug),scope=company?'?company='+encodeURIComponent(company):'';
   const join='/join/'+slug+scope;
   let publicLink='';
   try {
    const url=new URL(state.data.enrollmentUrl);
    if((url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))&&
       url.pathname==='/join/'+slug&&!url.username&&!url.password&&!url.search&&!url.hash)publicLink=url.href;
   }catch{}
   const content=document.querySelector('#content');
   content.innerHTML=`<section class="join-station"><div class="join-sign"><strong>${esc(state.data.business.name)}</strong><img class="qr" alt="QR de registro" src="/api/public/${slug}/qr${scope}"><p>Escanea para guardar tu tarjeta</p></div>
    <div class="join-controls"><h2>Invita a tus clientes</h2><p>Coloca el QR en caja o comparte el enlace. El cliente puede registrarse desde su teléfono.</p>
    ${publicLink?'<label for="joinAddress">Enlace de registro</label><input id="joinAddress" readonly type="url">':''}
    <div class="actions">${publicLink?'<button type="button" data-copy-join>Copiar enlace</button>':''}<button type="button" class="quiet" data-print-join disabled>Imprimir QR</button></div>
    <p data-join-status role="status"></p><a class="text-button" href="${esc(publicLink||join)}" target="_blank" rel="noopener">Abrir formulario ↗</a></div></section>`;
   const field=content.querySelector('#joinAddress'),status=content.querySelector('[data-join-status]');
   const print=content.querySelector('[data-print-join]'),qr=content.querySelector('.qr');
   if(field)field.value=publicLink;
   if(publicLink)content.querySelector('[data-copy-join]').onclick=async()=>{
    try{await navigator.clipboard.writeText(publicLink);status.textContent='Enlace copiado.';}
    catch{field.focus();field.select();status.textContent='El enlace está seleccionado. Elige Copiar en tu dispositivo.';}
   };
   print.onclick=()=>window.print();
   qr.onload=()=>{print.disabled=false;};
   qr.onerror=()=>{status.textContent=publicLink?'El QR no se pudo cargar. Puedes compartir el enlace.':'El QR no se pudo cargar. Vuelve a abrir esta sección.';};
   if(qr.complete&&qr.naturalWidth)print.disabled=false;
  };
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
    const a=document.createElement('a');a.dataset.luminaCash='yes';a.className='wallet-section-link';a.href='/cashier';a.textContent='Caja · Compras y canjes';a.onclick=e=>{e.preventDefault();leave('/cashier');};nav.prepend(a);
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
  renderMerchant=function(){if(central[state.tab]){leave(central[state.tab]);return;}if(!allowed.includes(state.tab))state.tab=allowed[0];render();restrict();if(owner)document.dispatchEvent(new CustomEvent('lumina-wallet-section',{detail:state.tab}));};
  document.addEventListener('click',event=>{const control=event.target.closest('[data-tab],[data-destination],[data-branch-team],#openTeam');if(!control)return;const tab=control.dataset.tab||control.dataset.destination||'team';if(central[tab]){event.preventDefault();event.stopImmediatePropagation();leave(central[tab]);}else if(control.dataset.tab&&!allowed.includes(tab)){event.preventDefault();event.stopImmediatePropagation();}},true);
  new MutationObserver(restrict).observe(app,{childList:true,subtree:true});
  state.tab=document.querySelector('meta[name="lumina-wallet-section"]').content;exit.hidden=false;renderMerchant();
  exit.textContent='Volver a Lúmina';exit.onclick=()=>leave(back);
 }catch(error){app.textContent=error.message;exit.hidden=false;exit.textContent='Volver a Lúmina';exit.onclick=()=>location.assign(back);}
})();

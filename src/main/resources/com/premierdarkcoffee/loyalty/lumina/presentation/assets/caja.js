'use strict';
(() => {
 const originalFetch=window.fetch.bind(window);
 window.fetch=(resource,options={})=>{
  const url=new URL(resource instanceof Request?resource.url:String(resource),location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(resource,options);
  const headers=new Headers(resource instanceof Request?resource.headers:undefined);
  new Headers(options.headers).forEach((value,key)=>headers.set(key,value));
  headers.delete('Authorization');
  headers.set('X-Lumina-CSRF',document.querySelector('meta[name="lumina-csrf"]').content);
  return originalFetch(resource,{...options,headers,credentials:'same-origin'});
 };
 const leave=path=>{
  if(document.querySelector('form[aria-busy="true"]')){notice('Espera a que termine la operación.');return;}
  const go=()=>location.assign(path);
  window.loyaltyOperationLeave?window.loyaltyOperationLeave(go):go();
 };
 const sections=JSON.parse(document.querySelector('meta[name="lumina-wallet-sections"]')?.content||'[]');
 const titles={design:'Mi tarjeta',qr:'QR de registro',programs:'Promociones',rewards:'Premios',customers:'Mis clientes',walletHealth:'Estado de tarjetas'};
 const originalRender=renderMerchant;
 renderMerchant=function(){
  state.tab='sales';originalRender();
  // The native cashier remains a cashier. Additional areas use their own checked routes.
  for(const control of app.querySelectorAll('[data-tab]'))if(control.dataset.tab!=='sales')control.remove();
  for(const group of app.querySelectorAll('.nav-group'))if(!group.querySelector('[data-tab]'))group.remove();
  app.querySelector('.workspace-search')?.remove();
  const caption=app.querySelector('.workspace-business small'),branch=state.data.branches?.find(b=>b.id===state.data.branchId);
  if(caption)caption.textContent='Caja · '+(branch?.name||'Sucursal asignada');
  const note=app.querySelector('.sidebar-note');if(note)note.textContent='Tu acceso lo administra el dueño en Lúmina.';
  const nav=app.querySelector('.workspace-nav');
  if(nav)for(const section of sections.filter(s=>Object.hasOwn(titles,s))){
   const a=document.createElement('a');a.className='wallet-section-link';a.href='/wallet?seccion='+encodeURIComponent(section);a.textContent=titles[section];a.dataset.cashDestination='yes';nav.append(a);
  }
  const heading=app.querySelector('.workspace-heading');
  if(heading){const p=document.createElement('p');p.className='cash-operations';p.textContent=[state.data.permissions?.purchases?'Registrar compras':null,state.data.permissions?.rewards?'Canjear premios y descuentos':null].filter(Boolean).join(' · ');heading.after(p);}
  const campaigns=window.luminaCampaignSummary?.(state.data,{cashier:true});if(campaigns)document.querySelector('#content')?.prepend(campaigns);
 };
 document.addEventListener('click',event=>{const link=event.target.closest('[data-cash-destination]');if(link){event.preventDefault();leave(link.getAttribute('href'));}});
 exit.onclick=()=>leave('/inicio');exit.textContent='Volver a Lúmina';
 state.token='lumina-delegated-session';state.member=null;
 merchant().catch(issue=>{
  app.replaceChildren();const panel=document.createElement('section');panel.className='panel narrow';
  const title=document.createElement('h1');title.textContent='No pudimos abrir Caja';
  const description=document.createElement('p');description.textContent=issue.message;
  const retry=document.createElement('a');retry.href='/wallet';retry.className='button';retry.textContent='Volver a intentar';
  panel.append(title,description,retry);app.append(panel);exit.hidden=false;
 });
})();

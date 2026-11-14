'use strict';
(async()=>{
 const section=document.querySelector('meta[name=lumina-wallet-section]').content;
 const destinations={administration:'/management',business:'/management/business',branches:'/management/branches',team:'/team',activity:'/management/activity',operations:'/management/operations',account:'/plans?view=agreements',reports:'/management/reports'};
 const filterKeys=['days','branchId','actorId','fromDate','throughDate','kind'];
 const go=(tab,filters={})=>{const target=new URL(destinations[tab]||'/wallet/management?section='+encodeURIComponent(tab),location.origin);for(const key of filterKeys)if(filters[key]!=null)target.searchParams.set(key,String(filters[key]));const path=target.pathname+target.search;window.loyaltyAdminLeave(()=>{if(parent!==window)parent.location.assign(path);else location.assign(path);});};
 try{
  state.token='lumina-delegated-wallet-session';state.data=await api('/api/staff/dashboard');state.member=null;state.tab=section;
  if(section==='account'&&window.LoyaltyAdministration){const account=window.LoyaltyAdministration.account;window.LoyaltyAdministration.account=(root,opt,data)=>{account(root,opt,data);const card=root.querySelector('.admin-account-card');card.querySelector('.eyebrow').textContent='HISTORIAL ANTERIOR DE WALLET';if(!data.membership?.plan){card.querySelector('h2').textContent='Sin acuerdos anteriores';card.querySelector('p').textContent='Consulta tus servicios actuales en Paquetes y servicios de Lúmina.';}};}
  const render=renderMerchant;
  renderMerchant=function(){if(state.tab!==section){go(state.tab);return;}render();const content=document.querySelector('#content');if(content)app.replaceChildren(content);};
  window.loyaltyNavigate=go;
  if(window.LoyaltyAdministration)window.LoyaltyAdministration.navigate=(opt,tab,filters={})=>{if(tab===section){window.LoyaltyAdministration.intent={section:tab,path:opt.path,token:state.token,filters};renderMerchant();}else go(tab,filters);};
  document.addEventListener('click',event=>{const control=event.target.closest('[data-tab],[data-destination],[data-branch-team],#openTeam,#openReturnRadar');if(!control)return;event.preventDefault();event.stopImmediatePropagation();go(control.id==='openReturnRadar'?'radar':control.dataset.tab||control.dataset.destination||'team');},true);
  if(window.LoyaltyAdministration){const params=new URLSearchParams(location.search);const filters=Object.fromEntries(filterKeys.filter(k=>params.has(k)).map(k=>[k,params.get(k)]));window.LoyaltyAdministration.intent={section,path:'/api/staff',token:state.token,filters};}
  renderMerchant();
  window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.kind!=='lumina-management-viewport')return;const {top,height}=event.data;if(Number.isFinite(top)&&top>=0&&top<=60000&&Number.isFinite(height)&&height>=160&&height<=10000){document.documentElement.style.setProperty('--lumina-dialog-top',(top+16)+'px');document.documentElement.style.setProperty('--lumina-dialog-height',Math.max(128,height-32)+'px');}});
  const resize=()=>{if(parent!==window)parent.postMessage({kind:'lumina-management-size',height:Math.max(400,document.querySelector('#app').scrollHeight+80)},location.origin);};
  new ResizeObserver(resize).observe(app);resize();exit.onclick=()=>go('administration');
 }catch(error){app.textContent=error.message;}
})();

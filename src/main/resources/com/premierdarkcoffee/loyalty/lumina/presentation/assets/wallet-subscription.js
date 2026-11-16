'use strict';
(async()=>{
 if(document.querySelector('meta[name="lumina-wallet-owner"]')?.content!=='yes')return;
 const notice=document.createElement('aside');notice.className='wallet-subscription-note';notice.setAttribute('aria-label','Suscripción de Wallet');
 const text=document.createElement('span'),link=document.createElement('a');link.href='/plans/wallet';link.textContent='Mi suscripción';
 notice.append(text,link);document.querySelector('.loyalty-breadcrumb')?.after(notice);
 try {
  const response=await fetch('/plans/wallet/state',{credentials:'same-origin',redirect:'error'});if(!response.ok)throw new Error();const data=await response.json();
  text.textContent=data.description;
  if(data.kind==='LEGACY')link.href='/plans/wallet/legacy';
 }catch{text.textContent='Consulta el acuerdo de tu Wallet.';}

})();

'use strict';
(async()=>{
 if(document.querySelector('meta[name="lumina-wallet-owner"]')?.content!=='yes')return;
 const notice=document.createElement('aside');notice.className='wallet-subscription-note';notice.setAttribute('aria-label','Suscripción de Wallet');
 const text=document.createElement('span'),link=document.createElement('a');link.href='/planes/wallet';link.textContent='Mi suscripción';
 notice.append(text,link);document.querySelector('.loyalty-breadcrumb')?.after(notice);
 try {
  const response=await fetch('/planes/wallet/estado',{credentials:'same-origin',redirect:'error'});if(!response.ok)throw new Error();const data=await response.json();
  text.textContent=data.accepted?(data.recurring?(data.trialUntil?'Gratis hasta el 31-12-2026. Después, $4,99 al mes por sucursal.':'Wallet: $4,99 al mes por sucursal. Renovación automática.'):'Renovación desactivada. Revisa la fecha de finalización en tu suscripción.'):'Revisa la tarifa y acepta las condiciones para activar tu suscripción de Wallet.';
 }catch{text.textContent='Consulta tu promoción, tarifa y condiciones de Wallet.';}
})();

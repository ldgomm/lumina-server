'use strict';
(() => {
 const format=value=>new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',day:'numeric',month:'short',year:'numeric'}).format(new Date(value));
 // A presentation summary only. The native service decides eligibility and balances.
 window.luminaCampaignSummary=(data,{cashier=false,at=Date.now()}={})=>{
  const campaigns=(data.programs||[]).filter(p=>Number.isInteger(p.config?.blackFridayYear)).map(p=>{
   const c=p.config,year=c.blackFridayYear;
   const start=Math.max(Date.parse(year+'-11-01T05:00:00Z'),Date.parse(c.window?.startsAt||year+'-11-01T05:00:00Z'));
   const end=Math.min(Date.parse(year+'-12-01T05:00:00Z'),Date.parse(c.window?.endsAt||year+'-12-01T05:00:00Z'));
   const status=at>=end?'Finalizada':!c.active?'Pausada':at<start?'Programada':'En vigencia';
   return {p,c,start,end,status};
  }).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&(!cashier||x.status==='En vigencia'&&(!x.c.branchIds?.length||x.c.branchIds.includes(data.branchId))));
  if(!campaigns.length)return null;
  const section=document.createElement(cashier?'details':'section');section.className='bf-wallet-campaigns';section.dataset.walletCampaigns='yes';
  const heading=document.createElement(cashier?'summary':'h3');heading.textContent=cashier?'Viernes Negro · '+campaigns.length+' campaña(s) en esta sucursal':'Tus campañas de noviembre';section.append(heading);
  const list=document.createElement('div');list.className='bf-campaign-list';
  for(const {c,start,end,status} of campaigns.sort((a,b)=>b.c.blackFridayYear-a.c.blackFridayYear||a.start-b.start)){
   const item=document.createElement('article'),badge=document.createElement('span');badge.className='bf-state';badge.textContent=status;
   const title=document.createElement('strong');title.textContent=c.name;
   const dates=document.createElement('p');dates.textContent=format(start)+' — '+format(end-1);
   const conditions=document.createElement('p');conditions.textContent=c.blackFridayMessage||'';
   item.append(badge,title,dates,conditions);list.append(item);
  }
  section.append(list);const note=document.createElement('p');note.className='bf-help';note.textContent=cashier?'Consulta el saldo del cliente para ver sus premios disponibles.':'Después de noviembre no acumula ni permite canjes. El historial se conserva.';section.append(note);return section;
 };
})();

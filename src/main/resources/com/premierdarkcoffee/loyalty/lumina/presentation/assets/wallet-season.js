'use strict';
(() => {
 const zone='America/Guayaquil';
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const editable=()=>document.querySelector('meta[name="lumina-wallet-owner"]')?.content==='yes'||JSON.parse(document.querySelector('meta[name="lumina-wallet-editable"]')?.content||'[]').includes('programs');
 const campaignYear=()=>{const date=today(),year=Number(date.slice(0,4));return date>=year+'-12-01'?year+1:year;};
 const money=n=>new Intl.NumberFormat('es-EC',{style:'currency',currency:state.data.business.currency}).format(n);
 const original=renderPrograms;
 renderPrograms=function(edit=null,create=false){
  original(edit,create);
  const root=document.querySelector('#content');if(!root)return;
  if(!edit&&!create){const summary=window.luminaCampaignSummary?.(state.data);if(summary)root.prepend(summary);}
  if(edit?.config.blackFridayYear){
   const p=document.createElement('p');p.className='bf-wallet-expiry';p.textContent='Viernes Negro '+edit.config.blackFridayYear+'. La acumulación y los canjes terminan al finalizar su vigencia, como máximo el 30 de noviembre. El año de esta campaña no se puede cambiar.';root.prepend(p);
  }else if(!create){
   const banner=document.createElement('section');banner.className='bf-banner bf-wallet-entry';
   banner.innerHTML='<div><span class="bf-kicker">CAMPAÑA DE NOVIEMBRE</span><h2>Viernes Negro en tu Wallet.</h2><p>Un premio o descuento por las compras de tus clientes.</p><small>Se desactiva al finalizar noviembre. Los saldos y el historial se conservan.</small></div>'+(editable()?'<button type="button" class="bf-button" id="createWalletBF">Crear campaña</button>':'');
   root.prepend(banner);banner.querySelector('button')?.addEventListener('click',e=>open(e.currentTarget));
  }
 };
 function open(trigger){
  if(!editable()||document.querySelector('#walletBFDialog')||document.querySelector('form[aria-busy=true]'))return;
  const session=state.token,tenant=state.data.business.id,year=campaignYear();
  const dialog=document.createElement('dialog');dialog.id='walletBFDialog';dialog.className='bf-wallet-dialog';dialog.setAttribute('aria-labelledby','walletBFTitle');
  const first=year+'-11-01',last=year+'-11-30',start=today()>=first&&today()<=last?today():first;
  dialog.innerHTML=`<div class="bf-hero"><div><span class="bf-kicker">${esc(state.data.business.name)} · WALLET</span><h2 id="walletBFTitle">Tu Viernes Negro.</h2><p>Define el beneficio. Nosotros controlamos su vigencia.</p></div><button type="button" class="bf-close" data-close>Cerrar</button></div><form class="bf-form" id="walletBFForm"><div class="bf-editor"><div><label>Nombre de la promoción<input name="name" required maxlength="120" value="Viernes Negro"></label><label>¿Qué recibe el cliente?<select name="kind"><option value="REWARD">Un premio</option><option value="DISCOUNT">Un descuento</option></select></label><label>Nombre del premio o beneficio<input name="reward" required maxlength="120" placeholder="Describe lo que entregas"></label><div class="fields"><label>Compras para obtenerlo<input name="goal" type="number" required min="1" max="1000000" step="1" value="1"></label><label>Compra mínima (${esc(state.data.business.currency)})<input name="minimum" type="number" required min="0.01" max="10000000" step="0.01" value="1"></label></div><div data-discount hidden><label>Descuento (%)<input name="percent" type="number" min="1" max="100" step="1"></label><label>Categoría del producto<input name="group" maxlength="60" placeholder="La misma categoría que usas en caja"></label><label>Aplicar al canjear<select name="scope"><option value="ITEM">Un producto de esa categoría</option><option value="BASKET">Todos los productos de esa categoría</option></select></label><p class="bf-help">Si eliges un producto, caja descuenta la unidad de menor precio de esa categoría.</p></div><label>Condiciones para tus clientes<textarea name="conditions" required maxlength="300" rows="3" placeholder="Qué incluye y qué debe saber el cliente"></textarea></label><div class="fields"><label>Desde<input name="start" type="date" required min="${first}" max="${last}" value="${start}"></label><label>Hasta, inclusive<input name="end" type="date" required min="${start}" max="${last}" value="${last}"></label></div><details><summary>Sucursales</summary><p class="bf-help">Sin seleccionar: todas las sucursales actuales y futuras.</p>${(state.data.branches||[]).map(b=>`<label class="check"><input type="checkbox" name="branch" value="${esc(b.id)}">${esc(b.name)}</label>`).join('')}</details><label class="check"><input name="confirm" type="checkbox" required>Confirmo el beneficio y las condiciones que verá el cliente.</label></div><aside class="bf-preview bf-GOLD" aria-label="Resumen de la campaña"><span class="bf-kicker">VIERNES NEGRO ${year}</span><h3 data-title></h3><p data-rule></p><strong data-reward></strong><p data-benefit></p><p data-conditions></p><p data-dates></p><div class="bf-deadline"><strong>Solo noviembre</strong><span>Después de su fecha final no permite acumular ni canjear. Cierre máximo: 1 de diciembre a las 00:00, Ecuador continental.</span></div><p class="bf-help">Un sello por compra elegible. El premio se canjea después de acumular; no descuenta la compra que genera el sello.</p></aside></div><p data-error role="alert" hidden></p><p data-status role="status" hidden></p><div class="bf-actions"><button type="button" class="quiet" data-close>Cancelar</button><button type="submit" data-submit>Publicar campaña</button></div></form>`;
  document.body.append(dialog);
  const formNode=dialog.querySelector('form'),f=formNode.elements,button=dialog.querySelector('[data-submit]'),error=dialog.querySelector('[data-error]'),status=dialog.querySelector('[data-status]');
  let busy=false,dirty=false,uncertain=false,payload=null,key=crypto.randomUUID(),saved=false;
  const same=()=>state.token===session&&state.data?.business?.id===tenant&&editable();
  const update=()=>{
   const discount=f.kind.value==='DISCOUNT';dialog.querySelector('[data-discount]').hidden=!discount;
   for(const name of ['percent','group','scope']){f[name].disabled=!discount||busy||uncertain;f[name].required=discount;}
   f.end.min=f.start.value||first;f.end.setCustomValidity(f.end.value<f.start.value?'La fecha final debe ser igual o posterior al inicio.':'');
   const set=(s,v)=>dialog.querySelector(s).textContent=v;
   set('[data-title]',f.name.value||'Tu promoción');set('[data-rule]','Reúne '+(f.goal.value||'…')+' compra(s) de al menos '+money(Number(f.minimum.value)||0)+'.');set('[data-reward]',f.reward.value||'Tu beneficio');
   set('[data-benefit]',discount?(f.percent.value||'…')+'% al canjear, '+(f.scope.value==='ITEM'?'en una unidad de menor precio':'en el total')+' de '+(f.group.value||'la categoría elegida')+'.':'');set('[data-conditions]',f.conditions.value);set('[data-dates]',f.start.value+' — '+f.end.value+' · Ecuador continental');
  };
  const close=()=>{if(busy)return;if(!saved&&(dirty||uncertain)&&!confirm(uncertain?'La respuesta está pendiente. Comprueba Promociones antes de crear otra campaña. ¿Cerrar?':'Hay cambios sin publicar. ¿Descartarlos?'))return;dialog.close();};
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const unload=e=>{if(!saved&&(dirty||busy||uncertain)){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);
  dialog.addEventListener('close',()=>{window.removeEventListener('beforeunload',unload);dialog.remove();if(trigger?.isConnected)trigger.focus();});
  formNode.addEventListener('input',()=>{dirty=true;update();});formNode.addEventListener('change',()=>{dirty=true;update();});
  formNode.onsubmit=async e=>{
   e.preventDefault();if(busy||!same())return;
   if(!payload){update();if(!formNode.reportValidity())return;
    const end=new Date(f.end.value+'T05:00:00Z');end.setUTCDate(end.getUTCDate()+1);
    payload={program:{name:f.name.value.trim(),kind:'STAMPS',active:true,minimumSpendMinor:Math.round(Number(f.minimum.value)*100),stampsPerPurchase:1,branchIds:[...formNode.querySelectorAll('[name=branch]:checked')].map(n=>n.value),window:{startsAt:f.start.value+'T05:00:00Z',endsAt:end.toISOString()},blackFridayYear:year,blackFridayMessage:f.conditions.value.trim()},rewardName:f.reward.value.trim(),rewardCost:Number(f.goal.value)};
    if(f.kind.value==='DISCOUNT')payload.rewardBenefit={percentBps:Number(f.percent.value)*100,group:f.group.value.trim(),scope:f.scope.value};
   }
   busy=true;formNode.setAttribute('aria-busy','true');formNode.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);dialog.querySelector('.bf-close').disabled=true;error.hidden=true;status.hidden=false;status.textContent='Publicando campaña…';
   try{
    await api('/api/staff/promotion-setups',payload,'POST',key);
    saved=true;busy=false;dialog.close();if(!same())return;
    try{await merchant();notice('Campaña publicada. Se desactiva automáticamente al terminar su vigencia.');}catch{notice('Campaña publicada. Recarga Promociones para verla.');}
   }catch(issue){
    if(!dialog.isConnected)return;
    if(!same()){saved=true;busy=false;dialog.close();return;}
    uncertain=!issue.status||issue.status>=500;
    if(!uncertain){payload=null;key=crypto.randomUUID();}
    error.textContent=issue.message+(uncertain?' Reintenta para consultar o completar la misma publicación sin duplicarla.':'');error.hidden=false;
   }finally{
    busy=false;if(dialog.isConnected){formNode.setAttribute('aria-busy','false');formNode.querySelectorAll('input,select,textarea').forEach(n=>n.disabled=uncertain);formNode.querySelectorAll('button').forEach(n=>n.disabled=false);dialog.querySelector('.bf-close').disabled=false;status.hidden=true;button.textContent=uncertain?'Reintentar publicación':'Publicar campaña';update();}
   }
  };
  update();dialog.showModal();f.name.focus();
 }
})();

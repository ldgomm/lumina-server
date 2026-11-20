'use strict';
(()=>{
 const root=document.querySelector('[data-offer-editor]');if(!root)return;
 const form=root.closest('form'),steps=[...root.querySelectorAll('[data-offer-step]')],items=[...root.querySelectorAll('[data-offer-item]')];let step=0;
 const by=n=>form.elements[n],money=n=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(n/100);
 const selected=()=>items.filter(e=>Number(e.value)>0);
 const line=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
 function area(code){root.querySelectorAll('[data-offer-area]').forEach(e=>e.hidden=e.dataset.offerArea!==code);root.querySelectorAll('[data-offer-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.offerTab===code)));}
 function preview(){
  const chosen=selected(),brand=Number(by('IDENTITY').value)>0,wallet=Number(by('WALLET').value)>0;
  for(const recurring of form.querySelectorAll('[name=term]:not([value=ONE_OFF])'))recurring.disabled=brand;if(brand)by('term').value='ONE_OFF';root.querySelector('[data-brand-frequency]').hidden=!brand;
  const gift=root.querySelector('[data-wallet-gift]');gift.hidden=!wallet||chosen.length<2;by('wallet_gift').disabled=gift.hidden;if(gift.hidden)by('wallet_gift').checked=false;
  const fixed=by('price_type').value==='FIXED';root.querySelector('[data-fixed-price]').hidden=!fixed;by('price').disabled=!fixed;by('price').required=fixed;
  const split=root.querySelector('[data-other-price]');if(split){split.hidden=!(wallet&&chosen.length>1&&fixed&&!by('wallet_gift').checked&&by('term').value!=='ONE_OFF');by('other_price').disabled=split.hidden;}
  root.querySelectorAll('[data-area-count]').forEach(e=>{const count=[...root.querySelector(`[data-offer-area=${e.dataset.areaCount}]`).querySelectorAll('input')].reduce((sum,i)=>sum+(Number(i.value)||0),0);e.textContent=count?String(count):'';});
  const kind=chosen.length===1&&Number(chosen[0].value)===1?'Servicio individual':'Paquete';root.querySelector('[data-offer-kind]').textContent=chosen.length?kind:'Elige los servicios';
  const summary=document.createDocumentFragment();if(chosen.length){const list=document.createElement('ul');chosen.forEach(e=>list.append(line('li',`${Number(e.value)} · ${e.dataset.name}`)));summary.append(list);summary.append(line('p',by('term').value==='ANNUAL'?'Estas cantidades cada año':by('term').value==='MONTHLY'?'Estas cantidades cada mes':'Trabajo de una sola vez'));if(by('wallet_gift').checked)summary.append(line('p','Servicio de Wallet de cortesía, sin recargo.'));}
  else summary.append(line('p','Aún no hay servicios seleccionados.'));
  const match=by('price').value.match(/^(\d{1,8}|100000000)(?:[.,](\d{1,2}))?$/);const entered=match?Number(match[1])*100+Number((match[2]||'').padEnd(2,'0')):null;
  const amount=entered>10_000_000_000?null:entered%100===99?entered+1:entered;
  summary.append(line('strong',!fixed?'Por cotizar':amount===null?'Precio pendiente':money(amount)+(by('term').value==='ANNUAL'?' / año':by('term').value==='MONTHLY'?' / mes':' · pago único')));
  if(fixed && amount!==null && amount!==entered)summary.append(line('p','El precio publicado se redondea al siguiente dólar.'));
  const panel=root.querySelector('.offer-selection-summary [data-offer-summary]');panel.replaceChildren(summary);
  const copy=panel.cloneNode(true);copy.removeAttribute('data-offer-summary');copy.removeAttribute('aria-live');
  const review=root.querySelector('[data-offer-review]');review.replaceChildren(line('h3',by('name').value||'Nombre pendiente'),copy,line('p',by('description').value));
 }
 function show(next){step=next;steps.forEach((e,i)=>e.hidden=i!==step);root.querySelectorAll('[data-progress]').forEach(e=>{if(Number(e.dataset.progress)===step)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});root.querySelector('[data-offer-prev]').hidden=step===0;root.querySelector('[data-offer-next]').hidden=step===2;root.querySelector('[data-offer-error]').textContent='';steps[step].querySelector('h2').tabIndex=-1;steps[step].querySelector('h2').focus();}
 function valid(){if(step===0&&!selected().length){root.querySelector('[data-offer-error]').textContent='Añade al menos un servicio con una cantidad mayor a cero.';return false;}
  for(const e of steps[step].querySelectorAll('input,textarea,select'))if(!e.disabled&&!e.checkValidity()){e.reportValidity();return false;}
  if(step===1&&by('price_type').value==='FIXED'&&!/^(?:\d{1,8}(?:[.,]\d{1,2})?|100000000(?:[.,]0{1,2})?)$/.test(by('price').value)){root.querySelector('[data-offer-error]').textContent='Escribe un precio en USD con hasta dos decimales.';by('price').focus();return false;}return true;}
 root.querySelectorAll('[data-offer-tab]').forEach(b=>b.onclick=()=>area(b.dataset.offerTab));
 root.querySelector('[data-offer-next]').onclick=()=>{if(valid())show(Math.min(2,step+1));};root.querySelector('[data-offer-prev]').onclick=()=>show(Math.max(0,step-1));
 form.noValidate=true;form.addEventListener('submit',e=>{if(step<2){e.preventDefault();e.stopImmediatePropagation();if(valid())show(step+1);return;}for(let i=0;i<steps.length;i++){step=i;if(!valid()){e.preventDefault();e.stopImmediatePropagation();show(i);valid();return;}}step=2;},true);
 root.addEventListener('input',preview);root.addEventListener('change',preview);root.querySelector('.offer-step-actions').hidden=false;area(root.dataset.firstArea);preview();show(0);
})();

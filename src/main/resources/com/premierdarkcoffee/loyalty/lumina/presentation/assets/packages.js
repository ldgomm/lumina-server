'use strict';
for(const catalog of document.querySelectorAll('.catalog-layout')) {
  const cards=[...catalog.querySelectorAll('[data-package]')];
  const filters=catalog.querySelector('[data-catalog-filters]');
  if(filters){
    filters.hidden=false;
    const filter=()=>{
      let count=0;
      for(const card of cards){
        card.hidden=!!(filters.querySelector('[name=catalog_kind]').value&&card.dataset.kind!==filters.querySelector('[name=catalog_kind]').value||filters.querySelector('[name=catalog_area]').value&&!card.dataset.areas.split(' ').includes(filters.querySelector('[name=catalog_area]').value)||filters.querySelector('[name=catalog_term]').value&&card.dataset.term!==filters.querySelector('[name=catalog_term]').value);
        if(!card.hidden)count++;
      }
      catalog.querySelector('[data-catalog-empty]').hidden=count!==0;
      const active=[...filters.querySelectorAll('select')].filter(s=>s.value).length;
      const hint=filters.querySelector('[data-active-filters]');if(hint)hint.textContent=active?'('+active+' activos)':'';
      catalog.querySelector('[data-catalog-count]').textContent=`${count} ${count===1?'oferta disponible':'ofertas disponibles'}.`;
    };
    const clear=filters.querySelector('[data-clear-filters]');
    clear?.addEventListener('click',()=>{for(const select of filters.querySelectorAll('select'))select.value='';filter();});
    filters.addEventListener('change',filter);filter();
  }
  if(!catalog.matches('form'))continue;
  const summary=catalog.querySelector('[data-package-totals]'),lines=catalog.querySelector('[data-package-lines]'),submit=catalog.querySelector('button[type=submit]');
  const format=value=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(value/100);
  function update(){
    const totals={MONTHLY:0,ANNUAL:0,ONE_OFF:0},pending={MONTHLY:0,ANNUAL:0,ONE_OFF:0},known={MONTHLY:0,ANNUAL:0,ONE_OFF:0};let selected=0;lines.replaceChildren();
    for(const card of cards){
      const field=card.querySelector('[data-package-quantity]');if(!field)continue;
      const holder=field.closest('.offer-selection'), next=catalog.querySelector('[name=start_when]')?.value==='NEXT_MONTH';
      const blocked=next?holder?.dataset.next:holder?.dataset.now;
      field.disabled=Boolean(blocked);
      const note=holder?.querySelector('[data-period-note]');if(note){note.hidden=!blocked;note.textContent=blocked||'';}
      const units=!field.disabled&&field.validity.valid?Number(field.value||0):0;
      card.classList.toggle('selected',units>0);
      for(const b of card.querySelectorAll('[data-quantity-change]')){b.hidden=false;b.disabled=field.disabled || (Number(b.dataset.quantityChange)<0?units<=0:units>=Number(field.max||10));}
      if(!units)continue;selected+=units;
      const row=document.createElement('div');row.className='basket-line';
      const name=document.createElement('span');name.textContent=`${units} × ${card.dataset.name}`;
      const amount=document.createElement('strong');amount.textContent=card.dataset.price===''?'Por cotizar':format(Number(card.dataset.price)*units)+(card.dataset.term==='ANNUAL'?' / año':card.dataset.term==='MONTHLY'?' / mes':'');
      const remove=document.createElement('button');remove.type='button';remove.className='basket-remove';remove.textContent='Quitar';remove.setAttribute('aria-label','Quitar '+card.dataset.name);remove.addEventListener('click',()=>{field.value='0';field.dispatchEvent(new Event('input',{bubbles:true}));});
      row.append(name,amount,remove);lines.append(row);
      if(card.dataset.price==='')pending[card.dataset.term]++;else{totals[card.dataset.term]+=Number(card.dataset.price)*units;known[card.dataset.term]++;}
    }
    summary.replaceChildren();const container=document.createElement('div');container.className='commercial-totals';
    for(const [term,title] of [['MONTHLY','Por mes'],['ANNUAL','Por año'],['ONE_OFF','Pago único']]){
      if(!known[term]&&!pending[term])continue;
      const block=document.createElement('div'),caption=document.createElement('span'),amount=document.createElement('strong'),note=document.createElement('small');
      caption.textContent=title;amount.textContent=pending[term]&&!known[term]?'Por cotizar':format(totals[term]);
      note.textContent=pending[term]?`${pending[term]} oferta(s) pendientes de precio. ${known[term]?'Subtotal conocido, no total final.':''}`:known[term]?'Precio de referencia de lo seleccionado.':'Sin servicios de esta modalidad.';
      block.append(caption,amount,note);container.append(block);
    }
    if(selected)summary.append(container);
    const jump=catalog.querySelector('[data-selection-jump]');
    if(jump){jump.hidden=!selected;const count=jump.querySelector('[data-selection-count]');count.textContent=selected+' '+(selected===1?'selección':'selecciones');}
    if(!selected){const empty=document.createElement('p');empty.textContent='Elige una o varias ofertas para comenzar.';lines.append(empty);}
    if(submit&&!catalog.dataset.busy)submit.disabled=!selected;
  }
  for(const card of cards)for(const b of card.querySelectorAll('[data-quantity-change]'))b.addEventListener('click',()=>{const field=card.querySelector('[data-package-quantity]');field.value=String(Math.max(0,Math.min(Number(field.max||10),Number(field.value||0)+Number(b.dataset.quantityChange))));field.dispatchEvent(new Event('input',{bubbles:true}));});
  catalog.querySelector('[data-selection-jump]')?.addEventListener('click',()=>catalog.querySelector('#your-selection').focus());
  catalog.addEventListener('input',update);catalog.addEventListener('change',update);window.addEventListener('pageshow',update);update();
}

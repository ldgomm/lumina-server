'use strict';
for(const form of document.querySelectorAll('.package-selection')) {
  const summary=form.querySelector('[data-package-totals]');
  const format=value=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(value/100);
  const update=()=>{
    const totals={MONTHLY:0,ONE_OFF:0},pending={MONTHLY:0,ONE_OFF:0};
    let selected=0;
    for(const card of form.querySelectorAll('[data-package]')) {
      const field=card.querySelector('[data-package-quantity]');
      const units=field.validity.valid?Number(field.value||0):0;
      card.classList.toggle('selected',units>0);
      if(!units)continue;
      selected+=units;
      if(card.dataset.price==='')pending[card.dataset.term]++;
      else totals[card.dataset.term]+=Number(card.dataset.price)*units;
    }
    const container=document.createElement('div');container.className='commercial-totals';
    for(const [term,title] of [['MONTHLY','Por mes'],['ONE_OFF','Una sola vez']]) {
      const block=document.createElement('div'),caption=document.createElement('span'),amount=document.createElement('strong'),note=document.createElement('small');
      caption.textContent=title;amount.textContent=format(totals[term]);
      note.textContent=pending[term]?`${pending[term]} oferta(s) por cotizar; falta el total definitivo.`:'Importe de referencia de tu selección.';
      block.append(caption,amount,note);container.append(block);
    }
    summary.replaceChildren(container);
    const count=document.createElement('p');count.textContent=`${selected} paquete(s) seleccionados.`;summary.append(count);
  };
  form.addEventListener('input',update);window.addEventListener('pageshow',update);update();
}

'use strict';
for(const panel of document.querySelectorAll('[data-request-composer]')) {
  const type=panel.querySelector('[name=type]'),visits=panel.querySelector('[data-visit]'),quantity=panel.querySelector('[data-quantity]');
  const sync=()=>{
    if(visits)visits.hidden=type.value!=='VISIT';
    if(quantity){quantity.hidden=type.value==='VISIT';quantity.querySelector('input').disabled=type.value==='VISIT';}
    const service=panel.querySelector('[name=service]:checked')||panel.querySelector('select[name=service],input[type=hidden][name=service]');
    const workspace=panel.closest('.request-workspace');
    if(workspace)for(const guide of workspace.querySelectorAll('[data-price-service]'))guide.hidden=service&&guide.dataset.priceService!==service.value;
  };
  panel.addEventListener('change',sync);window.addEventListener('pageshow',sync);sync();
}

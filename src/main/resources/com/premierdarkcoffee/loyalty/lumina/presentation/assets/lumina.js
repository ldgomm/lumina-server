'use strict';

for (const panel of document.querySelectorAll('[data-request-form]')) {
  const formats = JSON.parse(panel.dataset.formats);
  const channel = panel.querySelector('[name=channel]');
  const service = panel.querySelector('[name=service]');
  const type = panel.querySelector('[name=type]');
  const allChannels = Array.from(channel.options, option => [option.value,option.textContent]);
  const videoChannels = ['SOCIAL'];
  const sync = () => {
    const previousChannel = channel.value;
    const allowed = allChannels.filter(([key]) => type.value !== 'VISIT' || videoChannels.includes(key));
    if (channel.options.length !== allowed.length) {
      channel.replaceChildren(...allowed.map(([key,title])=>new Option(title,key,false,key===previousChannel)));
    }
    const previous = service.value;
    const choices = formats[channel.value] || [];
    service.replaceChildren(...choices.map(([key,title]) => new Option(title,key,false,key === previous)));
    const visits = panel.querySelector('[data-visit]');
    const quantity = panel.querySelector('[data-quantity]');
    if (visits) visits.hidden = type.value !== 'VISIT';
    if (quantity) quantity.hidden = type.value === 'VISIT';
  };
  channel.addEventListener('change',sync);
  type.addEventListener('change',sync);
  sync();
}

const navigationButton=document.querySelector('.menu-toggle');
if(navigationButton){
  const nav=document.getElementById(navigationButton.getAttribute('aria-controls'));
  const backdrop=document.querySelector('.navigation-backdrop'),close=nav?.querySelector('.navigation-close');
  const background=[...document.querySelectorAll('main,.workspace-topbar,footer')];
  const media=window.matchMedia?.('(max-width:760px)');
  const isMobile=()=>media?media.matches:window.innerWidth<=760;
  const setOpen=(open,restore=true)=>{
    navigationButton.setAttribute('aria-expanded',String(open));document.body.classList.toggle('nav-open',open);
    if(backdrop)backdrop.hidden=!open;
    for(const node of background)node.inert=open;
    if(open)close?.focus();else if(restore)navigationButton.focus();
  };
  navigationButton.addEventListener('click',()=>setOpen(navigationButton.getAttribute('aria-expanded')!=='true'));
  close?.addEventListener('click',()=>setOpen(false));backdrop?.addEventListener('click',()=>setOpen(false));
  nav?.addEventListener('click',event=>{if(event.target.closest('a')&&document.body.classList.contains('nav-open'))setOpen(false,false);});
  document.addEventListener('keydown',event=>{
    if(!document.body.classList.contains('nav-open'))return;
    if(event.key==='Escape'){event.preventDefault();setOpen(false);}
    if(event.key==='Tab'&&nav){
      const focusable=[...nav.querySelectorAll('*')].filter(e=>e.tabIndex>=0&&!e.disabled&&e.type!=='hidden'&&!e.closest('[hidden]'));
      const first=focusable[0],last=focusable.at(-1),outside=!nav.contains(document.activeElement);
      if(event.shiftKey&&(document.activeElement===first||outside)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||outside)){event.preventDefault();first?.focus();}
    }
  });
  media?.addEventListener('change',()=>{if(!isMobile())setOpen(false,false);});
  window.addEventListener('pageshow',()=>setOpen(false,false));
}
// Reveal optional controls before the browser focuses an invalid field.
document.addEventListener('invalid',event=>{
  for(let parent=event.target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
},true);
for(const form of document.querySelectorAll('form[method="post"]'))form.addEventListener('submit',event=>{
  if(form.dataset.busy==='yes'){event.preventDefault();return;}
  form.dataset.busy='yes';form.setAttribute('aria-busy','true');
  const button=form.querySelector('button[type="submit"],button:not([type])');
  if(button){button.dataset.caption=button.textContent;button.textContent='Guardando…';button.disabled=true;}
});
window.addEventListener('pageshow',()=>{for(const form of document.querySelectorAll('form[data-busy]')){delete form.dataset.busy;form.removeAttribute('aria-busy');for(const button of form.querySelectorAll('button[data-caption]')){button.textContent=button.dataset.caption;button.disabled=false;}}});

for(const form of document.querySelectorAll('form:has([name="term"])')) {
  if(form.querySelector('[data-offer-editor]'))continue;
  const term=form.querySelector('[name="term"]');
  const sync=()=>{for(const code of ['LOGO','IDENTITY','BRAND_GUIDE']){const field=form.elements[code];if(field){field.disabled=term.value==='MONTHLY';field.closest('label').hidden=field.disabled;}}};
  term.addEventListener('change',sync);sync();
}

for(const form of document.querySelectorAll('form:has([name="individual_service"])')) {
  const service=form.querySelector('[name=individual_service]'),term=form.querySelector('[name=term]');
  const sync=()=>{const brand=['LOGO','IDENTITY','BRAND_GUIDE'].includes(service.value);const monthly=term.querySelector('option[value=MONTHLY]');monthly.disabled=brand;if(brand)term.value='ONE_OFF';};
  service.addEventListener('change',sync);sync();
}

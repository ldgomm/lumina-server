'use strict';

for (const panel of document.querySelectorAll('[data-request-form]')) {
  const formats = JSON.parse(panel.dataset.formats);
  const channel = panel.querySelector('[name=channel]');
  const service = panel.querySelector('[name=service]');
  const type = panel.querySelector('[name=type]');
  const allChannels = Array.from(channel.options, option => [option.value,option.textContent]);
  const videoChannels = ['INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE'];
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
  navigationButton.addEventListener('click',()=>{
    const open=navigationButton.getAttribute('aria-expanded')!=='true';
    navigationButton.setAttribute('aria-expanded',String(open));document.body.classList.toggle('nav-open',open);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.body.classList.remove('nav-open');navigationButton.setAttribute('aria-expanded','false');navigationButton.focus();}});
}
for(const form of document.querySelectorAll('form[method="post"]'))form.addEventListener('submit',event=>{
  if(form.dataset.busy==='yes'){event.preventDefault();return;}
  form.dataset.busy='yes';form.setAttribute('aria-busy','true');
  const button=form.querySelector('button[type="submit"],button:not([type])');
  if(button){button.dataset.caption=button.textContent;button.textContent='Guardando…';button.disabled=true;}
});
window.addEventListener('pageshow',()=>{for(const form of document.querySelectorAll('form[data-busy]')){delete form.dataset.busy;form.removeAttribute('aria-busy');for(const button of form.querySelectorAll('button[data-caption]')){button.textContent=button.dataset.caption;button.disabled=false;}}});

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

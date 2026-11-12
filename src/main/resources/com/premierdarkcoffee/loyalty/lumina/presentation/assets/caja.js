'use strict';
const cashFetch = window.fetch.bind(window);
window.fetch = (resource, options={}) => {
  const url = new URL(resource instanceof Request?resource.url:String(resource),location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return cashFetch(resource,options);
  const headers=new Headers(resource instanceof Request?resource.headers:undefined);
  new Headers(options.headers).forEach((value,key)=>headers.set(key,value));
  headers.set('X-Lumina-CSRF',document.querySelector('meta[name="lumina-csrf"]').content);
  return cashFetch(resource,{...options,headers});
};
const returnToPortal = () => window.location.assign('/inicio');
const cajaError = issue => {
  app.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'Caja requiere tu acceso vigente';
  const description = document.createElement('p');
  description.textContent = issue.message;
  const link = document.createElement('a');
  link.href = '/inicio';
  link.textContent = 'Volver a Lúmina';
  app.append(heading, description, link);
};
exit.onclick = returnToPortal;
state.token = 'lumina-delegated-session';
merchant().catch(cajaError);

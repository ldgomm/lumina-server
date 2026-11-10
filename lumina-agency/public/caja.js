'use strict';
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

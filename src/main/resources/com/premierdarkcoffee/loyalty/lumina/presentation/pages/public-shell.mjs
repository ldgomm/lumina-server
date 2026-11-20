import { esc } from './components.mjs';
import { brandSocial } from './brand-social.mjs';

export const publicArrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const publicBrand = () => '<a class="home-brand" href="/" aria-label="Lúmina Digital, inicio"><img src="/assets/lumina-symbol.png" alt="" width="42" height="42"><span>Lúmina<span class="brand-subtitle">DIGITAL</span></span></a>';

const stories={
  login:['TU ESPACIO EN LÚMINA','Las ideas crecen.','El trabajo fluye.','Contenido, proyectos y clientes que vuelven. Todo lo que tienes en marcha, desde tu cuenta.'],
  register:['EMPECEMOS POR TU NEGOCIO','Una buena idea.','Un nuevo comienzo.','Tu primer video de cortesía te espera. Después eliges los servicios que necesita tu negocio.'],
  activate:['PARTE DEL MISMO EQUIPO','Tu trabajo importa.','Tu espacio también.','Una cuenta personal para las tareas que te asignó tu negocio, con acceso a sus servicios.'],
  legacy:['EL MISMO ESPACIO, TU NUEVO ACCESO','Tus proyectos siguen.','Tu cuenta también.','Actualiza tu forma de ingresar y continúa con el trabajo que ya tienes en Lúmina.'],
  setup:['LÚMINA DIGITAL / AGENCIA','Aquí empiezan','las buenas ideas.','Un espacio para acompañar a tus negocios, coordinar proyectos y dar seguimiento a cada entrega.'],
};

/** Public access presentation only. No account, company, token or session projections. */
export function accessShell({title,description='',body,mode='login'}) {
  const [eyebrow,first,second,copy]=stories[mode]||stories.login;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1f3a"><meta name="robots" content="noindex,follow"><title>${esc(title)} · Lúmina Digital</title><link rel="icon" href="/assets/lumina-symbol.png"><link rel="stylesheet" href="/assets/homepage.css"><link rel="stylesheet" href="/assets/access.css"><script defer src="/assets/lumina.js"></script><script type="module" src="/assets/identity.js"></script></head>
  <body class="public-access"><a class="skip-link" href="#main">Saltar al contenido</a><header class="public-header"><div class="home-container header-row">${publicBrand()}<a class="access-back" href="/">Volver a Lúmina ${publicArrow}</a></div></header>
    <main id="main" class="home-container access-layout access-${esc(mode)}">
      <aside class="access-story" aria-label="Tu espacio en Lúmina"><p class="eyebrow">${eyebrow}</p><h2>${first}<br><em>${second}</em></h2><p>${copy}</p>
        <figure class="access-photo"><img src="/assets/studio-small.webp" width="640" height="427" alt=""></figure>
        <div class="access-story-foot">${mode==='register'?'<span>Una cuenta para ti y accesos propios para tu equipo.</span><span>Wallet se activa solo cuando lo eliges y aceptas sus condiciones.</span>':'<span>Una cuenta. Tus servicios. Tu equipo.</span><a href="/#services">Conoce lo que hacemos →</a>'}</div>
      </aside>
      <section class="access-panel" aria-labelledby="access-title"><header><span class="eyebrow">${mode==='register'?'CREA TU CUENTA':mode==='activate'?'ACTIVA TU ACCESO':'BIENVENIDO A LÚMINA'}</span><h1 id="access-title">${esc(title)}</h1><p>${esc(description)}</p></header>${body}</section>
    </main><footer class="access-footer home-container"><span>Lúmina Digital · Marketing y fidelización</span>${brandSocial()}</footer>
  </body></html>`;
}

import { portalVersion } from '../../shared/domain.mjs';
import { esc } from './components.mjs';
import { engagementGuide } from './engagement-guide.mjs';
import { brandSocial } from './brand-social.mjs';
import { icon } from './icons.mjs';
import { publicArrow as arrow, publicBrand } from './public-shell.mjs';

const nav = '<a href="#services">Servicios</a><a href="#loyalty">Wallet</a><a href="#process">Cómo trabajamos</a><a href="#contact">Contacto</a>';

const services = [
  ['web', 'Páginas web', 'Del interés al pedido.', 'Una página, un menú digital o una tienda para quien ya quiere saber más de tu negocio.'],
  ['maps', 'Google Maps', 'Que encuentren tu puerta.', 'Pon al día tu ubicación, tus horarios y tus fotos para que la próxima visita empiece en el mapa.'],
  ['brand', 'Diseño de marca', 'Que te reconozcan.', 'Un logo, una paleta y una identidad que se sientan tuyos, desde tu empaque hasta tus redes.'],
];

const questions = [
  ['¿Cómo pido mi video gratis?', 'Crea la cuenta de tu negocio y abre el aviso de video de cortesía. Desde allí puedes solicitarlo y seguir su entrega. Es un video por negocio y puedes pedirlo sin contratar un plan de Contenido.'],
  ['¿Puedo empezar con un solo servicio?', 'Sí. Puedes pedir un trabajo puntual, elegir un plan o combinar servicios. Después puedes sumar otros desde la misma cuenta.'],
  ['¿Dónde veo cuánto cuesta?', 'En tu cuenta encontrarás los paquetes disponibles. Si necesitas algo a medida, puedes pedir una propuesta y revisar el precio, el alcance y las fechas antes de aceptar.'],
  ['¿Crear una cuenta activa Wallet?', 'Tú decides cuándo activar Wallet. Primero puedes revisar el plan y sus condiciones desde la cuenta del negocio.'],
];

function serviceArt(id) {
  if (id === 'web') return '<span class="web-window"><i></i><i></i><i></i><b></b><em></em></span>';
  if (id === 'maps') return '<span class="map-street"></span><span class="map-pin"></span>';
  return '<span class="brand-type">Aa</span><span class="brand-chip"></span>';
}

function walletDemo() {
  return `<div class="wallet-exhibit">
    <div class="pass" aria-label="Ejemplo de tarjeta de fidelidad"><div class="pass-head"><span>Café de la casa</span>${icon('wallet')}</div>
      <div class="pass-offer">Un café <em>de regalo.</em></div><div class="stamps" aria-hidden="true"><span>✳</span><span>✳</span><span>✳</span><span>✳</span><span class="last-stamp">✳</span></div>
      <div class="pass-foot"><strong data-visit-status aria-live="polite">4 de 5 sellos</strong><span class="pass-bars" aria-hidden="true"></span></div></div>
    <div class="demo-caption"><span>Ejemplo de tarjeta</span><button type="button" data-visit-demo hidden>Simular una visita</button></div></div>`;
}

export function homepage({signedIn = false, origin = ''} = {}) {
  const start = signedIn ? '/home' : '/register';
  const action = signedIn ? 'Ir a mi espacio' : 'Pedir mi video gratis';
  const entry = signedIn ? '<a class="entry-link" href="/home">Ir a mi espacio</a>' : '<a class="entry-link" href="/login">Ingresar</a>';
  const cta = `<a class="button primary" href="${start}">${action} ${arrow}</a>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Lúmina Digital · Contenido, marca y fidelización para negocios</title>
    <meta name="application-name" content="Lúmina ${portalVersion}"><meta name="theme-color" content="#101e36">
    <meta name="description" content="Contenido para redes, páginas web, Google Maps, diseño de marca y fidelización con Wallet. Crea tu cuenta de negocio y solicita tu primer video de cortesía.">
    <meta property="og:type" content="website"><meta property="og:title" content="Lúmina Digital · Que te vean. Que vuelvan."><meta property="og:description" content="Del primer video a la próxima visita. Conoce lo que podemos crear para tu negocio.">
    <meta property="og:locale" content="es_EC"><meta name="twitter:card" content="summary_large_image">
    <meta property="og:image" content="${esc(origin)}/assets/portada-social.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Una barista sonríe detrás del mostrador de su cafetería.">
    <link rel="icon" type="image/webp" href="/assets/lumina-symbol-small.webp"><link rel="stylesheet" href="/assets/portada.css"><script defer src="/assets/homepage.js"></script></head>
    <body class="agency-home"><a class="skip-link" href="#main">Saltar al contenido</a>
    <header class="public-header"><div class="wrap header-row">${publicBrand(true)}<nav class="desktop-nav" aria-label="Navegación principal">${nav}</nav>
      <div class="header-actions">${entry}<details class="mobile-menu"><summary aria-label="Menú de navegación">${icon('menu')}<span class="sr-only">Menú</span></summary><nav aria-label="Navegación móvil">${nav}<a href="${start}">${signedIn ? 'Ir a mi espacio' : 'Crear mi cuenta'}</a></nav></details></div></div></header>
    <main id="main"><section class="hero" aria-labelledby="hero-title">
      <picture class="hero-photo"><source media="(max-width: 650px)" srcset="/assets/portada-small.webp" width="760" height="900"><img src="/assets/portada.webp" alt="" width="1448" height="1086" fetchpriority="high"></picture>
      <div class="wrap hero-inner"><div class="hero-copy"><p class="kicker hero-kicker">Estudio de marketing y fidelización</p>
      <h1 id="hero-title">Que te vean.<br><em>Que vuelvan.</em></h1><p class="hero-description">Creamos fotos y videos para que te descubran. Con una tarjeta digital, tus clientes suman puntos y vuelven por su premio.</p>
      <div class="hero-actions">${cta}<a class="hero-secondary" href="#services">Ver servicios <span aria-hidden="true">↓</span></a></div>
      ${signedIn ? '' : '<p class="hero-note">Un video de cortesía por negocio al crear tu cuenta.</p>'}</div></div></section>
    <section class="wrap section services-section" id="services" aria-labelledby="services-title"><p class="kicker">Nuestros servicios</p>
      <div class="section-heading"><h2 id="services-title">De la pantalla<br><em>a tu negocio.</em></h2><p>Elige por dónde empezar según lo que necesitas hoy.</p></div>
      <div class="features"><article id="service-content" class="feature content-feature">
        <div class="studio-visual"><img src="/assets/studio.webp" srcset="/assets/studio-small.webp 640w, /assets/studio.webp 1200w" sizes="(max-width: 760px) 100vw, 50vw" width="1200" height="800" loading="lazy" alt="Cámara y luz de estudio preparadas para fotografiar un espresso."></div>
        <div class="feature-copy"><p class="kicker">Contenido para redes</p><h3>Tu negocio, en primer plano.</h3><p>Del plato que sale de tu cocina al detalle de tu último producto. Creamos fotos y videos para mostrar lo que haces.</p><a class="text-link" href="#first-video">Conocer el video de cortesía ${arrow}</a></div></article>
        <article id="service-loyalty" class="feature wallet-feature"><div id="loyalty">${walletDemo()}</div>
        <div class="feature-copy"><p class="kicker">Fidelización digital · Wallet</p><h3>Dales un motivo para volver.</h3><p>Tus clientes guardan la tarjeta en Apple Wallet o Google Wallet. En caja suman puntos o sellos y canjean el premio que tú eliges.</p><a class="text-link" href="${start}">${signedIn ? 'Ir a mi espacio' : 'Crear mi cuenta'} ${arrow}</a></div></article>
      </div><div class="service-cards">${services.map(([id, name, title, copy]) => `<article id="service-${id}" class="small-service"><div class="service-art art-${id}" aria-hidden="true">${serviceArt(id)}</div><div class="small-copy"><p class="kicker">${name}</p><h3>${title}</h3><p>${copy}</p></div></article>`).join('')}</div>
    </section>
    <section id="first-video" class="offer"><div class="wrap offer-inner"><div><p class="kicker">Video de cortesía</p>
      <h2>Tu primer video<br><em>va por nuestra cuenta.</em></h2></div><div class="offer-action"><p>Crea la cuenta de tu negocio y solicita un video gratis para tus redes. Puedes pedirlo sin contratar un plan de Contenido.</p>${cta}</div></div></section>
    <section id="process" class="wrap section process-section" aria-labelledby="process-title"><p class="kicker">Cómo trabajamos</p>
      <div class="section-heading"><h2 id="process-title">De la idea <em>a la entrega.</em></h2></div><ol class="process-list">
        <li><h3>Cuéntanos tu idea</h3><p>Elegimos contigo qué mostrar, a quién y en qué formato.</p></li><li><h3>Revisa el trabajo</h3><p>Abre tu entrega desde la cuenta de tu negocio y deja tus comentarios.</p></li><li><h3>Recibe la versión final</h3><p>Encuentra el archivo aprobado en tu espacio de Lúmina.</p></li></ol></section>
    ${engagementGuide()}
    <section class="wrap section faq" id="questions" aria-labelledby="questions-title"><div><p class="kicker">Antes de empezar</p><h2 id="questions-title">¿Tienes <br><em>preguntas?</em></h2></div><div class="faq-list">${questions.map(([q,a]) => `<details><summary>${q}<span aria-hidden="true"></span></summary><p>${a}</p></details>`).join('')}</div></section>
    <section class="contact" id="contact"><div class="wrap contact-row"><div><p class="kicker">Contacto</p><h2>Hablemos de <em>tu negocio.</em></h2></div><a class="button primary" href="https://www.instagram.com/luminadigital360/" target="_blank" rel="noopener noreferrer">Escribir en Instagram ${arrow}<span class="sr-only"> (abre otra pestaña)</span></a></div></section>
    </main><footer class="public-footer"><div class="wrap foot-row">${publicBrand(true)}${brandSocial(true)}<a href="/activate">Activar mi invitación de equipo</a><a href="#main">Volver arriba ↑</a></div></footer></body></html>`;
}

import { engagementGuide } from './engagement-guide.mjs';
import { brandSocial } from './brand-social.mjs';
import { icon } from './icons.mjs';
import { publicArrow as arrow, publicBrand } from './public-shell.mjs';

const services = [
  ['content','social','Contenido para redes','De tu negocio a la pantalla','Planificamos y producimos fotografía, video y diseño. Revisa una entrega y sigue sus publicaciones en Instagram, TikTok, Facebook y YouTube.'],
  ['loyalty','wallet','Fidelización digital','Una tarjeta que invita a volver','Comparte un QR. Tus clientes guardan la tarjeta en Apple Wallet o Google Wallet y acumulan puntos o sellos cuando vuelven.'],
  ['web','web','Páginas web','Tu propia dirección digital','Creamos sitios empresariales, tiendas, catálogos y menús digitales. El alcance y el mantenimiento se acuerdan contigo.'],
  ['maps','maps','Google Maps','Que lleguen hasta tu puerta','Actualizamos tu Perfil de Empresa, organizamos fotos y reseñas y damos seguimiento al rendimiento de tus ubicaciones.'],
  ['brand','content','Diseño de marca','Una identidad reconocible','Trabajamos tu logo, identidad visual y manual de marca como un proyecto con entregas y revisiones acordadas.'],
];
const questions = [
  ['¿Puedo contratar un solo servicio?','Sí. Puedes empezar por una sesión de contenido, una web, tu marca o Wallet. Si después quieres sumar otro servicio, puedes hacerlo desde la misma cuenta.'],
  ['¿Necesito saber qué formato pedir?','Cuéntanos qué quieres mostrar. Te ayudamos a decidir el formato y las plataformas que tienen sentido para tu negocio.'],
  ['¿Dónde veo los precios?','En tu cuenta puedes consultar los paquetes publicados y pedir una propuesta a medida. Verás el precio, el plazo y lo que incluye antes de aceptar.'],
  ['¿Puede entrar mi equipo?','El dueño del negocio invita a cada persona desde Equipos y roles y elige las tareas que le corresponden.'],
  ['¿Crear mi cuenta activa Wallet?','La activación de Wallet es una elección del dueño. Desde tu cuenta puedes revisar la oferta y aceptar sus condiciones.'],
];
const nav='<a href="#services">Servicios</a><a href="#loyalty">Wallet</a><a href="#process">Cómo trabajamos</a><a href="#contact">Contacto</a>';

export function homepage({signedIn=false}={}) {
  const entry=signedIn?'/home':'/login', entryLabel=signedIn?'Ir a mi espacio':'Ingresar';
  const start=signedIn?'/home':'/register', startLabel=signedIn?'Ir a mi espacio':'Crear mi cuenta';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Lúmina Digital · Contenido, marca y fidelización</title><meta name="application-name" content="Lúmina 2.0">
    <meta name="description" content="Contenido para redes, páginas web, Google Maps, diseño de marca y fidelización en Apple Wallet y Google Wallet para tu negocio.">
    <meta name="theme-color" content="#111f3a"><meta property="og:type" content="website"><meta property="og:title" content="Lúmina Digital · Estudio creativo"><meta property="og:description" content="De la primera foto a la próxima visita. Contenido, marcas y fidelización para negocios.">
    <link rel="icon" href="/assets/lumina-symbol.png"><link rel="stylesheet" href="/assets/homepage.css"><script defer src="/assets/homepage.js"></script></head>
  <body class="agency-home"><a class="skip-link" href="#main">Saltar al contenido</a>
    <header class="public-header"><div class="home-container header-row">${publicBrand()}<nav class="desktop-nav" aria-label="Navegación principal">${nav}</nav><div class="header-actions"><a class="entry-link" href="${entry}">${entryLabel}${arrow}</a>
    <details class="mobile-menu"><summary aria-label="Menú de navegación">${icon('menu')}<span class="sr-only">Menú</span></summary><nav aria-label="Navegación móvil">${nav}<a href="${start}">${startLabel}</a></nav></details></div></div></header>
    <main id="main"><section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow">Estudio creativo y digital</p>
      <h1 id="hero-title">De la primera foto a la <em>próxima visita.</em></h1><p class="hero-description">Creamos el contenido que presenta tu negocio y la tarjeta que tus clientes llevan cuando vuelven.</p>
      <div class="hero-actions"><a class="home-button primary" href="#services">Explorar servicios ${arrow}</a><a class="text-link" href="${entry}">${signedIn?'Abrir mi negocio':'Ya soy cliente'} ${arrow}</a></div></div>
      <figure class="studio-photo"><img src="/assets/studio.webp" srcset="/assets/studio-small.webp 640w, /assets/studio.webp 1200w" sizes="(max-width: 740px) 100vw, 52vw" width="1200" height="800" fetchpriority="high" alt="Una cámara encuadra un espresso de taza naranja en un set de fotografía azul."></figure>
    </section>
    <section class="home-container section services-section" id="services" aria-labelledby="services-title"><div class="section-lead"><p class="eyebrow">Servicios</p><h2 id="services-title">¿Qué quieres hacer<br> por tu negocio?</h2><p>Empieza por lo que necesitas hoy. Puedes combinar servicios más adelante.</p></div>
      <div class="service-index">${services.map(([id,mark,name,headline,copy],i)=>`<details class="service-detail" id="service-${id}"${i===0?' open':''}><summary><span class="svc-icon">${icon(mark)}</span><span>${name}</span><span class="disclosure-mark" aria-hidden="true"></span></summary><div class="service-body"><h3>${headline}</h3><p>${copy}</p><a class="text-link" href="${id==='loyalty'?'#loyalty':start}">${id==='loyalty'?'Ver cómo funciona Wallet':startLabel} ${arrow}</a></div></details>`).join('')}</div>
    </section>
    <section class="loyalty-feature" id="loyalty" aria-labelledby="loyalty-title"><div class="home-container loyalty-grid"><div><p class="eyebrow">Lúmina Wallet</p><h2 id="loyalty-title">Un café hoy.<br> Un motivo para <em>volver.</em></h2><p>En caja, cada compra puede acercar a tu cliente a su próximo premio. Decide si acumula puntos o sellos y qué recibe a cambio.</p><a class="home-button light" href="${start}">${signedIn?'Ir a mi espacio':'Empezar en Lúmina'} ${arrow}</a></div>
      <figure class="pass-figure"><div class="example-pass" aria-hidden="true"><div class="pass-name">${icon('wallet')}<span>Tarjeta de fidelidad</span></div><strong>Café de la casa</strong><span class="pass-count">4 de 5 sellos</span><div class="stamp-row"><b>✦</b><b>✦</b><b>✦</b><b>✦</b><b>☆</b></div></div><figcaption>Diseño ilustrativo de una tarjeta para Apple Wallet y Google Wallet.</figcaption></figure>
    </div></section>
    <section class="home-container section process-section" id="process" aria-labelledby="process-title"><div class="section-lead"><p class="eyebrow">Cómo trabajamos</p><h2 id="process-title">De tu idea<br> a la entrega.</h2></div>
      <ol class="process-steps"><li><h3>Cuéntanos qué necesitas</h3><p>Definimos contigo el alcance, el precio y las fechas del trabajo.</p></li><li><h3>Revisa lo que creamos</h3><p>Desde tu cuenta ves la grabación programada, abres los archivos y pides ajustes.</p></li><li><h3>Recibe tu entrega</h3><p>Encuentra la versión aprobada y consulta los resultados de cada publicación.</p></li></ol></section>
    ${engagementGuide()}
    <section class="home-container section questions-section" id="questions" aria-labelledby="questions-title"><div class="section-lead"><h2 id="questions-title">Preguntas<br> frecuentes.</h2></div><div class="questions-list">${questions.map(([q,a])=>`<details><summary>${q}<span class="disclosure-mark" aria-hidden="true"></span></summary><p>${a}</p></details>`).join('')}</div></section>
    <section class="contact-section" id="contact"><div class="home-container"><div><p class="eyebrow">Contacto</p><h2>Hablemos de<br> <em>tu negocio.</em></h2></div><div><a class="home-button primary" href="https://www.instagram.com/luminadigital360/" target="_blank" rel="noopener noreferrer">Escribir en Instagram ${arrow}<span class="sr-only"> (abre otra pestaña)</span></a><a class="text-link" href="${start}">${startLabel} ${arrow}</a><a href="/activate">Activar mi invitación de equipo</a></div></div></section>
    </main><footer class="public-footer"><div class="home-container">${publicBrand()}${brandSocial()}<a href="#main">Volver arriba ↑</a><small>Lúmina Digital · 2.0</small></div></footer></body></html>`;
}

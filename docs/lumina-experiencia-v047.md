# Lúmina v008 / Loyalty v047

## Recorrido del negocio

Wallet abre directamente desde la navegación del portal. El dueño entra al resumen; los colaboradores entran a su primera sección asignada, y quienes solo operan Caja entran a Caja. Volver a Lúmina regresa al inicio. Los accesos bloqueados se consultan desde Equipo y permisos. La agencia sigue consultando, sin convertirse en el dueño ni emitir solicitudes por él.

Contenido mantiene su interfaz propia. Su navegación comparte tipografía, colores, iconos, espaciado y selección con la navegación principal. Los enlaces se agrupan en Día a día, Tu contenido y Resultados. El menú móvil se abre con su botón y se cierra con Escape.

## Precios que publica Lúmina

Desde Paquetes y servicios, la agencia puede publicar un servicio individual (precio por una unidad) o un paquete (cantidades y precio completo). El dueño ve esas ofertas y puede combinar unidades, paquetes, mensualidades y trabajos puntuales. No hay tarifas precargadas inventadas: publica los importes reales de tu agencia. Una oferta sin precio aparece Por cotizar. Cero publicado explícitamente representa precio cero.

La selección conserva sus cantidades al filtrar. Muestra el importe mensual separado del pago único y las ofertas que aún deben cotizarse. Una referencia por unidad solo se calcula en paquetes de un único servicio, con el precio completo del paquete siempre visible. No se distribuye el precio de un paquete mixto entre sus componentes.

Enviar la selección solicita una propuesta. El dueño revisa el precio, alcance, fechas y condiciones; acepta la versión vigente y la agencia activa los acuerdos. No hay débitos bancarios ni renovación automática. Para cambiar una tarifa, publica la nueva oferta y retira la anterior. Los acuerdos y propuestas anteriores conservan sus importes.

## Solicitudes

Nueva solicitud muestra cinco servicios: Contenido, Wallet, Google Maps, Web y Marca, limitados por permisos. Después se muestra un formulario para ese servicio. En contenido solo se elige Video, Fotografías o Diseño para redes; no se eligen redes sociales. El video de cortesía continúa siendo gratuito y sin elección de plataforma.

El dueño consulta precios publicados y cupos disponibles mientras solicita. Los cupos se asignan al producir, no al enviar. Un colaborador no recibe datos de precios ni contratos sin permiso comercial. Los errores de validación conservan la idea, el formato y los demás campos. El historial muestra tarjetas con estado y siguiente paso, búsqueda literal y filtros aplicados antes de paginar.

## Conservación y comprobación

Actualización sobre el commit bdc5cad1cd7dbb898daac113092547ea212eb6c2 confirmado en la evidencia v046. Sin cambios de esquema SQLite v4, SQL PostgreSQL, Kotlin, claves, vínculos, seriales, QR o identidades Apple/Google. La preparación ejecuta 80 pruebas HTTP/dominio del portal y 130 pruebas Python. El instalador ejecuta además los 580 casos nativos, PostgreSQL, Docker y 114 comprobaciones gateway antes de crear el commit local; no hace push.

La Terminal imprime una sola línea RESULTADO. Los detalles quedan en la evidencia y el log privado de arranque no se comparte. La validación de recepción en los teléfonos y la revisión visual real de la interfaz son comprobaciones separadas.

Prueba de navegador opcional, con Playwright instalado en scripts/ui: `node scripts/ui/lumina-experience.spec.mjs`. Usa cuentas y precios ficticios en una base en memoria; no utiliza datos reales. `LUMINA_UI_EVIDENCE` permite guardar capturas de pruebas localmente. Esta prueba no modifica el estado de las comprobaciones de dispositivos.

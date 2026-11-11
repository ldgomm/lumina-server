# Lúmina v006 / Loyalty v045 — Contenido y paquetes combinables

Actualización sobre v044r1, validada en la evidencia del commit local 30ebe7ff63046d1d3a7606e808db162ccdb114ea. No reinstala Loyalty ni recrea negocios.

## Contenido

`/contenido` abre un módulo con Resumen, Solicitudes, Producción, Por aprobar, Entregas, Publicaciones, Métricas y Grabaciones. Solicitudes y piezas conservan su ficha canónica con fechas, observaciones, revisiones, enlaces de entrega, evidencias e historial. La agencia coordina la producción; el cliente revisa y aprueba según sus permisos.

Una pieza es común a todas las redes. Solicitar contenido y el video de cortesía no exige elegir plataformas. Al registrar una publicación se elige su red y se conservan enlace, fecha y mediciones. Cuatro publicaciones de un video no crean cuatro piezas ni consumen cuatro cupos. Las métricas continúan siendo registros manuales; no se anuncia sincronización automática con redes.

Los conteos consultan todos los registros autorizados que coinciden con la búsqueda, independientemente de la página de 20 filas. Los colaboradores conservan exactamente sus áreas y sus restricciones heredadas por plataforma. No reciben contratos, precios ni solicitudes privadas. Las vistas globales de la agencia no eligen un negocio implícitamente.

## Paquetes y servicios

Se utiliza un catálogo único en `/planes`. No se muestran membresía y suscripción como productos distintos:

- **Oferta:** un servicio individual o un paquete de varios servicios, con cantidades y precio total.
- **Mensual:** precio y cupos por período de un mes.
- **Trabajo puntual:** precio por un proyecto o cantidad concreta, con inicio y último día acordados. No se renueva.
- **Combinación:** una o varias ofertas, de distintas áreas y modalidades, solicitadas juntas.
- **Propuesta:** selección revisada por la agencia, con precios, cantidades, fechas y condiciones que acepta el dueño.
- **Acuerdo:** cada oferta activada conserva sus fechas, precio total y cupos independientes.

El cliente puede seleccionar varias ofertas, contratar una sola, repetir un paquete de 1 a 10 veces, mezclar mensual y puntual, o solicitar ajustes. El catálogo no recibe precios inventados ni ofertas de ejemplo. Para un alcance personalizado, la agencia publica la oferta correspondiente o atiende la solicitud de cotización existente. Las cantidades adicionales multiplican tanto el precio como los cupos.

El resumen separa el total mensual de los trabajos puntuales. Una oferta por cotizar no equivale a gratis: se señala que el total aún está incompleto. El precio publicado se conserva como referencia; cualquier precio final distinto aparece en una propuesta que el cliente debe aceptar. Las retiradas del catálogo no eliminan propuestas anteriores ni acuerdos activos.

### Recorrido

1. El dueño elige cantidades y solicita su combinación. No hay activación ni cobro en este paso.
2. La agencia abre **Propuestas**, fija precio unitario por paquete, fechas y condiciones. Preparar la propuesta no envía correos automáticamente.
3. El dueño revisa la versión actual y confirma expresamente. Una versión anterior se rechaza.
4. La agencia activa los acuerdos aceptados en una sola transacción. Un reintento no duplica contratos; un fallo no deja una activación parcial.
5. **Mis acuerdos** muestra precio, período, unidades incluidas, reservadas, entregadas y disponibles. Los importes se expresan en USD, mediante centavos enteros.

No hay pasarela de pagos, débito bancario, facturación fiscal ni cobro automático en este cambio. Las condiciones de pago se documentan en la propuesta. El importe mensual de acuerdos vigentes no es un saldo de deuda; no incluye trabajos puntuales, futuros, finalizados ni cancelados.

### Renovación, cambios y cierre

Los períodos mensuales requieren una nueva solicitud y aceptación para renovarse. El botón **Solicitar siguiente período** conserva el siguiente inicio, el precio unitario anterior como referencia y el día de corte original. Por ejemplo, un inicio el 31 de enero sigue al fin de febrero y vuelve al 31 de marzo, sin deriva al 28. La renovación no arrastra cupos sin usar ni mueve piezas reservadas al nuevo período. Los trabajos puntuales no ofrecen renovación.

El cliente puede cancelar una propuesta todavía no activada. Para cambios o bajas de acuerdos activos, coordina con Lúmina; la agencia cancela únicamente el acuerdo seleccionado con un motivo obligatorio. La cancelación detiene nuevas reservas en ese acuerdo y conserva piezas, entregas y auditoría. No calcula devoluciones ni corta otros servicios.

### Wallet

El espacio Wallet ya viene con el negocio. «Servicio de Wallet incluido» o «de cortesía» representa configuración/gestión dentro del alcance comercial, no un nuevo tenant ni una llave de acceso. Estos paquetes nunca regeneran, reasignan ni bloquean las tarjetas existentes. No se agregan credenciales por módulo.

## Persistencia y archivos

Código dentro de `com/premierdarkcoffee/loyalty/lumina`:

- `content/workspace.mjs`: consultas, conteos y vistas de contenido.
- `production/`: solicitud, producción, aprobación y publicación reutilizadas.
- `memberships/billing.mjs`: catálogo, acuerdos, cupos y cotizaciones heredadas.
- `memberships/orders.mjs`: combinaciones, propuestas, aceptación, activación y renovación.
- `presentation/pages/content-pages.mjs` y `package-pages.mjs`: interfaces.
- `presentation/assets/modules.css` y `packages.js`: presentación y resumen de selección, sin almacenamiento de datos en el navegador.

SQLite v4 usa exclusivamente la migración nueva `004_packages.sql`. Antes de migrar una base existente se crea una copia privada coherente en su carpeta `migrations`. Los contratos anteriores conservan sus valores y reciben `units=1`; el catálogo anterior se reutiliza. Las migraciones SQLite previas y PostgreSQL V001–V014 permanecen byte por byte. Se conservan `agency.key`, las credenciales cifradas, vínculos Wallet, seriales, tokens, QR, saldos, URLs y presentationVersion=34.

Después de abrir SQLite v4 no ejecutar código anterior que solo acepte v3. Una recuperación debe ser explícita y conservar conjuntamente código y datos. El instalador nunca restaura ni borra automáticamente la base real.

## Comprobaciones

En el entorno de preparación: 56 pruebas HTTP/dominio/migración de Lúmina y 128 pruebas Python del flujo. El navegador local no pudo arrancar por restricciones del entorno y el navegador remoto no alcanza el servidor local; la inspección visual sigue pendiente. No interpretar pruebas HTTP como aprobación visual.

En el Mac, el instalador exige además las 580 pruebas Kotlin/HTTP/PostgreSQL (280 + 300), Docker y las 114 comprobaciones gateway antes del commit local, sin push. Mantiene las pruebas de v044r1 y añade dos suites de contenido/contrataciones. HTTPS y la recepción en Apple/Google Wallet requieren su evidencia independiente.

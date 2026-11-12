# Lúmina v012 / Loyalty v051 — Viernes Negro

Base revisada: resultado real v011/v050, commit 73e827b42be82097d2601e5a01922c83ec220d51. No publica precios, campañas ni beneficios ficticios al instalar.

## Lúmina para los negocios

Paquetes y servicios → Viernes Negro reúne la campaña. La agencia elige una oferta habitual publicada de contenido, web o diseño, individual o combinada; conserva sus cantidades y fija un porcentaje de descuento o precio especial. Personaliza nombre, alcance, condiciones, fecha inicial de noviembre y apariencia Navy con oro, violeta o hielo. La vista previa muestra precio habitual, precio promocional, ahorro y servicios incluidos. Publicar requiere confirmación. La oferta habitual se conserva; los cambios comerciales se publican como otra versión.

El dueño encuentra las ofertas vigentes en el inicio y el catálogo. Puede combinarlas con otros servicios y solicitar su propuesta con teléfono de contacto. Solo el dueño puede aceptarla; la agencia no puede actuar en su nombre. El precio promocional seleccionado no puede aumentarse en la propuesta. La agencia puede retirar una campaña sin borrar su historial.

El descuento mensual corresponde al primer período acordado. Renovar utiliza la oferta habitual y requiere otra propuesta y aceptación; no hay cobro ni renovación automática. Las ofertas puntuales mantienen el precio del trabajo aceptado.

## Los negocios para sus clientes en Wallet

Wallet → Promociones → Crear campaña abre un asistente con resumen en vivo. El negocio configura el nombre, beneficio, compras necesarias, importe mínimo, condiciones, fechas y sucursales. El dueño o una persona con permiso explícito de editar promociones puede publicarla. Consultar, tener Caja o ser administrador de agencia no concede ese permiso.

Dos opciones sencillas:

- Premio por compras: cada compra elegible aporta un sello. Al alcanzar la meta, el cliente puede canjear el premio configurado.
- Descuento como premio: al alcanzar la meta, puede canjear el porcentaje configurado en una categoría de productos. Puede aplicarse a una unidad de menor precio o a todo el importe de esa categoría. Requiere registrar esos productos en caja. No es un descuento automático en la compra que genera los sellos.

Nombre y condiciones son personalizables, así como las metas y fechas. El editor conserva los datos de campaña al guardar, pausar o ajustar una promoción. Un reintento con respuesta perdida reutiliza exactamente la misma operación para evitar duplicados. Crear una promoción no sustituye el diseño ni los identificadores de las tarjetas existentes.

## Cierre automático

Cada campaña pertenece a un año concreto. Solo admite fechas de noviembre. Las ofertas de Lúmina terminan el 1 de diciembre a las 00:00 de America/Guayaquil (05:00 UTC). Wallet permite terminar antes, pero nunca después de ese límite. No se reactivan en noviembre de otro año.

El servidor y las consultas de base de datos aplican el vencimiento; no depende de que el navegador permanezca abierto ni de un temporizador de interfaz. Se rechazan nuevas contrataciones y aceptaciones de ofertas vencidas, además de acumulación y canjes de campañas Wallet vencidas. Una propuesta aceptada a tiempo conserva su precio, entregas e historial aunque el trabajo se complete después.

Las promociones Wallet vencidas se retiran de los beneficios visibles al actualizar la tarjeta. Los saldos, movimientos, tarjetas y conexiones permanecen guardados. El bloqueo en el servidor ocurre en el límite de vigencia; la imagen o texto que ya está en un teléfono puede tardar en actualizarse según Apple, Google y la conexión del dispositivo. No se garantiza un cambio visual instantáneo en un teléfono desconectado.

## Persistencia y compatibilidad

Migración SQLite 006 con respaldo privado previo de la base del portal. Migración PostgreSQL V015 aditiva: función de vigencia y filtro de la vista de promociones visibles. No modifica V001–V014 ni las migraciones SQLite anteriores. Conserva asociaciones tenant-negocio, cuentas, tokens, seriales, claves privadas, certificados, registros Apple/Google, saldos e historial. Los campos opcionales nuevos no alteran la serialización de programas anteriores ni sus claves de idempotencia.

No elimina promociones vencidas ni borra datos de clientes. No cambia el dominio público ni regenera claves o tarjetas. Una reversión posterior a una migración de producción requiere revisar primero el esquema instalado; no se restaura una base de datos antigua automáticamente.

## Verificación y ejecución

Verificado durante la preparación: 146 pruebas HTTP/SQLite, 130 pruebas de herramientas Python y las comprobaciones DOM de campañas, equipo, solicitudes/catálogo y gestión. Datos de prueba ficticios y aislados. Se intentó la compilación Kotlin, pero la descarga de Gradle no está permitida en este entorno. El navegador Chromium tampoco pudo iniciarse aquí. Compilación, PostgreSQL, Docker, revisión visual real y teléfonos Apple/Google quedan pendientes.

El instalador exige las suites Kotlin y PostgreSQL completas (596 pruebas, incluidas 16 nuevas de campaña), las pruebas del portal y herramientas, y los controles reales de Docker/gateway antes del commit local. Sin PASS no hay commit ni push. Las pruebas de Wallet en teléfonos reales siguen pendientes incluso si esos controles pasan. Si el código local tiene cambios incompatibles, no lo sobrescribe.

1. Detén la Terminal anterior de Lúmina con Control+C.
2. Mantén Docker Desktop abierto.
3. Ejecuta desde Descargas:

```sh
bash ~/Downloads/lumina_digital_viernes_negro_v012.sh --iniciar
```

La Terminal imprime únicamente `RESULTADO=...` y, tras comprobar disponibilidad del portal, `Lúmina Digital disponible en http://127.0.0.1:8099`. Guarda el detalle en la evidencia de Descargas. `--comprobar` revisa compatibilidad y portal sin instalar. Nunca sustituye una prueba fallida por un PASS simulado.

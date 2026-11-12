# Lúmina v010 / Loyalty v049

Esta actualización parte del resultado real de v009/v048: commit `512cd6f7a884c8f0fa1229379d1c4cff471a78f2`, pruebas del Mac aprobadas e inicio confirmado. Los nuevos cambios deben pasar su propia validación antes de generar otro commit.

## Recorrido del negocio

El inicio reúne accesos directos a Wallet, Contenido, Caja y Paquetes según los permisos. Presenta entregas que la persona puede revisar, cotizaciones pendientes, propuestas de servicios y la próxima grabación confirmada. La cortesía queda disponible en un panel desplegable. Las solicitudes recientes conservan su enlace al historial.

Solicitar exige una idea y un teléfono de contacto precargado desde el negocio. Se puede reemplazar el número para esa solicitud. El campo aparece también en cortesía, grabaciones y selección de paquetes. Cantidad y tipo de solicitud están en opciones adicionales. Contenido conserva Video, Fotografías y Diseño; Web permite Proyecto o Mantenimiento; Maps, Marca y Wallet tienen una opción común y el cliente describe lo que necesita.

El teléfono queda guardado con la solicitud. Cambiarlo no modifica la ficha del negocio ni reescribe solicitudes anteriores. Una solicitud anterior sin teléfono conserva sus datos y puede mostrar el contacto actual del negocio identificado como tal. Los formularios de versiones anteriores siguen usando el teléfono registrado si no envían este campo; el formulario actual exige un valor explícito. Un dato inválido conserva el borrador y no crea una solicitud parcial. Reintentar una combinación con la misma clave no duplica el pedido ni reemplaza su contacto original.

El catálogo tiene filtros opcionales. La selección se mantiene al cambiar filtros y separa los importes mensuales de los puntuales. En móvil, un acceso fijo lleva a revisar lo seleccionado. Por cotizar sigue siendo un precio pendiente. Solicitar no cobra ni activa servicios; el dueño debe aceptar la propuesta vigente y la agencia la activa.

## Navegación e identidad

Lúmina, Contenido y Wallet comparten ancho de 244 px; hasta 1150 px usan 220 px, y hasta 760 px pasan a navegación móvil. Las filas, tipografía e iconos usan las mismas dimensiones. Contenido mantiene su espacio propio y Volver a Lúmina. Wallet sigue abriendo directamente.

El menú móvil tiene cierre, fondo, Escape y navegación de teclado. Al cerrar, devuelve el foco al botón. Escape no mueve el foco si el menú ya está cerrado. Los controles inválidos dentro de opciones desplegadas se revelan antes de recibir foco. No se guardan borradores ni teléfonos en almacenamiento del navegador.

Los pies de página enlazan a Instagram y TikTok de `luminadigital360` con los iconos suministrados. Los iconos se sirven localmente; las redes se abren en otra pestaña solo al pulsar el enlace. Los logos de Lúmina y las identidades de las tarjetas de los negocios permanecen intactos.

## Datos y accesos

SQLite v5 añade dos columnas opcionales, `requests.contact_phone` y `package_orders.contact_phone`, mediante `005_request_contact.sql`. Las migraciones anteriores permanecen idénticas. Antes de migrar una base existente, se crea un respaldo coherente y privado en su carpeta `migrations`. No se rellenan contactos históricos con información que no fue registrada en ese momento.

Código anterior a v5 rechaza una base v5; no volver a instalar versiones anteriores sobre esos datos. Una recuperación debe mantener código y datos coherentes y no descartar solicitudes nuevas. La actualización no toca claves privadas, accesos cifrados, asociaciones por negocio, tarjetas, QR, seriales, IDs Apple/Google, saldos, túneles, migraciones PostgreSQL ni código Kotlin. No renueva HTTPS.

Los pendientes se calculan dentro del negocio y con sus permisos vigentes, incluidos destinos sociales históricos. Un permiso de ver no concede aprobación. Los colaboradores no reciben precios, propuestas o cotizaciones del dueño. La agencia no puede actuar como el negocio. La entrada antigua para activar planes se sustituye por una referencia al flujo de propuestas aceptadas, conservando el historial.

## Ejecutar desde Descargas

Con Docker Desktop abierto, detener la Terminal anterior de Lúmina con Control+C y ejecutar:

```sh
bash ~/Downloads/lumina_digital_sencilla_v010.sh --iniciar
```

`--comprobar` valida compatibilidad y contratos HTTP sin instalar. La instalación compara cada archivo con v048 antes de escribir y conserva cambios locales incompatibles. Un fallo de escritura restaura los bytes anteriores. La migración de la base real ocurre al abrir el portal, con su respaldo previo. No se incluyen datos privados en la evidencia.

La Terminal imprime una línea `RESULTADO=...`. Con `--iniciar`, solo después de comprobar el arranque, imprime `Lúmina Digital disponible en http://127.0.0.1:8099` o el puerto configurado. Control+C cierra ese portal. El resultado detallado y el código antes/después quedan en la evidencia de Descargas; el registro de arranque permanece privado en `.local-staging/lumina-portal.log`.

## Validación

- 106 pruebas HTTP en 13 suites: flujo, teléfono, errores, propuestas, permisos, vínculos y migración con respaldo.
- 130 pruebas Python del flujo de instalación.
- DOM con scripts reales: editor de ofertas, selección combinada, contacto, opciones, menú y foco, páginas administrativas, guardas de borrador y comportamiento sin JavaScript. Datos ficticios y servicios aislados.
- Instalador: comparación, conflictos, segunda ejecución, enlaces simbólicos, restauración parcial y arranque real de Node con registro privado. Las simulaciones de salida del checkpoint no se consideran pruebas nativas.
- El Mac exige además 580 pruebas Kotlin/HTTP/PostgreSQL, Docker local y 114 comprobaciones del gateway antes de crear un commit local. Nunca hace push.

Las pruebas HTTP y DOM no prueban las dimensiones renderizadas de un navegador ni la recepción en un teléfono. La comprobación opcional `scripts/ui/lumina-experience.spec.mjs` cubre varios anchos, menús, formularios y selección con datos ficticios; necesita un navegador disponible. Navegador y dispositivos Wallet se reportan por separado y permanecen pendientes hasta obtener esa evidencia.

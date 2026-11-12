# Lúmina v014 / Loyalty v053 — Equipo sencillo

Actualización sobre el resultado real v013/v052 (commit db006b59bdd733f62df838292a91a625e8ca81a0).

## Experiencia del dueño

Equipo → persona → Qué puede hacer → Guardar acceso.

- Un bloque de Wallet. Atención en Caja: sin acceso, compras y canjes, solo compras o solo canjes; sucursal en el mismo bloque. Una sucursal disponible se preselecciona, pero Caja permanece desactivada hasta elegir y guardar.
- Más opciones de Wallet reúne diseño, promociones, clientes, informes y solicitudes. Las tareas existentes se muestran sin cambiarlas. El acceso general de lectura se conserva cuando es necesario para tareas delegadas; retirar solicitudes no retira esas tareas por accidente.
- Contenido, Maps, Web y Marca usan selectores compactos. Personalizar conserva combinaciones como consultar y aprobar sin poder solicitar. Los permisos por red siguen disponibles dentro de Contenido.
- Un formulario y un guardado para Caja y servicios. Datos personales, restablecimiento, baja e historial quedan en secciones secundarias desplegables.
- Alta de persona pide nombre/correo; después se eligen sus tareas. Se conserva la activación por código de un uso y no se envían mensajes automáticamente.
- Sin roles comerciales delegados: precios, contrataciones y administración del equipo pertenecen al dueño. La agencia no opera como el negocio.

## Guardado y seguridad

`access/team-access.mjs` coordina el guardado sin modificar el modelo de datos. Valida todos los permisos, modo y revisión antes de preparar Caja. Caja y los permisos del portal se publican en la misma transacción local, con una revisión. Si la preparación nativa falla, el nuevo conjunto de servicios no se publica. Guardar sin cambios no rota credenciales ni cambia la revisión.

Retirar Caja la bloquea localmente junto con el cambio de servicios antes de contactar a Wallet. Una caída remota muestra que el cambio local se guardó y que falta confirmar el retiro; no deja Caja operativa. El reintento conserva la revisión de ese guardado, nunca adopta una revisión posterior de otra pestaña. Un alta pendiente puede resolverse con su clave original y retirarse sin hacerla utilizable en Lúmina.

Las rutas anteriores siguen compatibles, con revisión y validaciones. La interfaz nueva usa `/equipo/:id/acceso`. Compras y canjes mantienen rol CASHIER, sucursal, CSRF, idempotencia, consentimiento y validación del motor nativo. Las tareas delegadas de Wallet mantienen sus propias rutas permitidas; no se entregan tokens al navegador.

## Validación

17 suites / 169 pruebas HTTP de Lúmina; 130 pruebas Python; DOM de equipo y Caja. Nuevos casos cubren guardado combinado, permisos particulares, cambios de sucursal, falta de autorización/CSRF, caída remota, revocación, activación pendiente, sesiones abiertas y modificaciones concurrentes. La prueba de arranque reintenta únicamente una colisión explícita del puerto efímero con otro proceso de prueba; errores de configuración o módulos siguen fallando. Un caso dedicado ocupa el puerto y verifica el arranque real en el siguiente. Son datos ficticios; las respuestas del motor nativo se simulan en estas pruebas HTTP/DOM.

El instalador exige además las 596 pruebas nativas, PostgreSQL, Docker local y gateway antes del commit local. No hace push. Estas comprobaciones se ejecutan en el Mac; no se declara su PASS con los resultados de la versión anterior. La revisión visual del navegador y recepción física en Apple/Google son comprobaciones distintas; Chromium no pudo iniciarse en el entorno de preparación.

No se modifican Kotlin, migraciones SQL, bases de datos existentes, identidades de tarjetas, claves privadas, vínculos ni HTTPS. No se reinstalan Wallets.

## Ejecución

Desde Descargas:

`bash lumina_digital_equipo_simple_v014.sh --iniciar`

Terminal imprime una línea RESULTADO. Solo después de confirmar disponibilidad muestra `Lúmina Digital disponible en http://127.0.0.1:8099` (o el puerto configurado). Los detalles quedan en la evidencia local; no se imprimen credenciales. Control+C detiene el portal.

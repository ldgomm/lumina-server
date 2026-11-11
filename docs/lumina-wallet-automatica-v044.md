# Lúmina v005 / Loyalty v044 — Wallet automática

## Resultado

Crear una cuenta de negocio prepara su propio espacio de fidelización, con nombre, responsable, correo, teléfono, moneda USD, horario de Ecuador y sucursal Principal. Wallet y equipo están disponibles sin una aprobación manual del registro. El dueño define promociones, premios, diseño y permisos desde su misma sesión de Lúmina.

La ficha fiscal se completa con datos reales. No se inventan RUC, razón social, ubicación, promociones, clientes ni saldos. Los servicios que requieren contratación, producción o autorización externa siguen su flujo correspondiente; activar el espacio no contrata una membresía ni conecta redes sociales sin autorización.

La agencia abre la Wallet del cliente seleccionado desde el directorio de Lúmina. Cada cuenta tiene un acceso interno separado por negocio, cifrado en el servidor. El navegador nunca recibe la credencial Loyalty. Equipo y permisos usa los usuarios Lúmina.

## Negocios existentes y recuperación

Un negocio de Lúmina sin vínculo previo obtiene su propio Wallet al abrir la página. Los vínculos ya guardados se respetan exactamente: no se borran tarjetas ni se decide automáticamente que un registro histórico es un demo. Si una asociación anterior es incorrecta, requiere una revisión específica de sus datos antes de reasignarla.

Una respuesta interrumpida no crea otro negocio: PostgreSQL conserva la relación por UUID de Lúmina, incluso tras reiniciar. Si el motor está temporalmente caído, la cuenta permanece registrada y abrir Wallet reintenta la preparación. La pantalla distingue preparación pendiente de Wallet activa.

## Integración y conservación

- Nueva migración PostgreSQL V014: relación persistente y datos de contacto. V001–V013 sin cambios.
- SQLite v3: clave de acceso cuenta+negocio. Copia íntegra de accesos cifrados, respaldo privado previo y transacción.
- Una sesión de agencia puede abrir varios negocios sin compartir una selección global. Las consultas y QR validan el negocio en cada petición.
- Se retira la asociación manual /wallet/vincular. /platform dirige a Wallet de Lúmina.
- La página local de accesos de prueba se reemplaza por un enlace a Lúmina sin credenciales. El checkpoint deja de abrir ese archivo.
- El motor y los datos demo anteriores permanecen privados para compatibilidad de comprobaciones; no se ofrecen en el directorio Lúmina ni se usan como destino del registro.
- Se conservan secretos, archivos de configuración, identidades de tarjetas Apple/Google, saldos, QR públicos, enlaces, presentación y túneles. No se renuevan conexiones.

## Instalación y verificación

El instalador admite las fuentes v042r1 y v043 reconocidas, conserva cambios ajenos mediante rechazo de conflictos y respalda las fuentes anteriores. Detener el proceso Lúmina con Control+C y mantener Docker Desktop abierto antes de ejecutarlo con --iniciar. --comprobar solo valida compatibilidad, configuración local y contratos de portal.

El gate completo exige 43 pruebas HTTP de Lúmina, 280 unitarias/HTTP Kotlin, 300 PostgreSQL, 128 Python, Docker y 114 comprobaciones del gateway. Solo entonces se permite el commit local automático, sin push. El endpoint de alta privada está expresamente rechazado por el gateway público.

Las pruebas del portal usan un motor ficticio; las de PostgreSQL ejercitan la implementación real y el endpoint Ktor. El instalador no debe informar que las pruebas nativas, el navegador o los teléfonos pasaron si no se ejecutaron. La recepción de una tarjeta en Apple/Google necesita comprobación real independiente.

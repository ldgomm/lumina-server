# Loyalty

El proyecto está en `/Users/ldgomm/Developer/pdc/sales/loyalty`. El paquete único es `com.premierdarkcoffee.loyalty`. Conserva el formato y el orden de declaraciones de IntelliJ; modifica únicamente las regiones necesarias. No confundas reformateo con cambios de lógica.

El usuario autoriza commits locales automáticos después de aprobar la validación completa. No hacer push. El script se ejecuta desde Downloads y genera allí un ZIP con el mismo .sh, código antes/después, pruebas, errores, registros redactados y commit. Excluir archivos privados, certificados, tokens, pases, cachés y `.git`.

## Comprobaciones

La entrega v016 requiere 252 pruebas Kotlin/HTTP/PostgreSQL, incluidas las de concurrencia, todas las pruebas Python del instalador, LOCAL_STAGING_PASS y LOCAL_GATEWAY_PASS antes del commit. Verificar el código actual guardado; si cambia durante las pruebas, repetir una vez con el estado nuevo. La fase HTTPS se verifica después y se informa por separado. No reutilizar el PASS de Comeback para declarar Loyalty aprobado.

## Docker y configuración

Proyecto Docker `loyalty-staging`, servicios `loyalty-server` y `loyalty-db`, volumen propio. Puerto HTTP predeterminado 8097; gateway 8098. `.env` es la única configuración del entorno local. `.env.wallet`, `.local-wallet` y `.local-staging` son privados. Generar credenciales distintas, conservar valores existentes, rechazar enlaces simbólicos y no regenerar secretos si existen recursos sin su configuración original. Nunca ejecutar down -v, borrar una base ni copiar automáticamente datos/credenciales de Comeback o Nexo.

El nombre del proyecto Gradle es `loyalty`; la distribución y el ejecutable Docker usan ese nombre. Las variables del perfil son `LOYALTY_*`. Mantener el PostgreSQL sin publicar su puerto y el servidor/gateway ligados a 127.0.0.1. El túnel solo publica las rutas permitidas de clientes y Apple Wallet; nunca paneles o API de administración.

## Reglas de negocio heredadas

V001–V007 y sus huellas son inmutables salvo formato SQL equivalente. Mantener `comeback_migrations` y los identificadores internos heredados: renombrar el producto no implica migrar la base. Nuevos esquemas requieren nueva migración.

Sin contraseña para el cliente: cédula única por negocio y saldo compartido por sus sucursales. Conocer la cédula no demuestra identidad ni permite recuperar una sesión. Recuperación por dueño con verificación presencial y enlace de un uso. Canje con empleado autenticado, verificación, consentimiento, revisión vigente, idempotencia, saldo y recibo en la misma transacción. Nunca llamar a proveedores Wallet durante la transacción de compra/canje. Conservar el orden de bloqueos: negocio, miembro, pase.

La suspensión se valida dentro de cada transacción operativa; el dueño conserva acceso a su cuenta. Los registros de pagos administrativos no ejecutan débitos bancarios reales. Crear negocio y primera sucursal es atómico; añadir sucursales es idempotente. No fusionar saldos ni reasignar sucursales entre negocios independientes sin definir esa funcionalidad. Alianzas entre negocios pendientes.

## Wallet

No regenerar WALLET_DATA_KEY, identidades del pase, emisor ni seriales para tarjetas existentes. HTTPS_PASS exige TLS, nonce correcto y pruebas de rutas públicas/privadas. Guardar diagnósticos acotados del túnel incluso si falla. Las URL temporales corresponden al arranque actual. Curl en macOS conserva validación TLS y nombre, sin curlrc ni redirecciones.

APPLE_DEVICE_VALIDATION, GOOGLE_DEVICE_VALIDATION y SINGLE_DEVICE_POLICY_PENDING requieren evidencia real. No afirmar exclusividad física de un dispositivo mediante QR o sharingProhibited. El modo --wallet-only aplica configuración privada y genera evidencia sin commits de secretos. Cambiar URL con pases emitidos requiere una migración explícita de pruebas con --renew-test-url.

Pausar una promoción oculta sus saldos y premios al cliente y bloquea acumulación/canje hasta reactivarla. Eliminar es irreversible y requiere revisión vigente del impacto, confirmación explícita del dueño y registro de pérdida de saldos. Conservar historial inmutable. Nunca restaurar promociones eliminadas.

Un túnel quick con Unauthorized: Tunnel not found debe informarse como retirado, aunque su proceso siga running. Con pases existentes, recrearlo requiere --renew-test-url. Recuperar HTTPS deja pendiente guardar la misma tarjeta con la nueva URL en el teléfono; no declarar actualización del dispositivo solo por HTTPS_PASS.

## Clientes v012

Mis clientes usa métricas por período (7/30/90 días, desde medianoche local hasta ahora) y una lista con historial acumulado. No llamar retención a una proporción simple de compradores repetidos. El gasto es el total pagado; los canjes cuentan solo CONSUMED por consumed_at. Los segmentos de premios consultan customer_programs y saldo disponible, excluyen premios inactivos y no suman sellos entre promociones. Los informes son de solo lectura y están limitados al dueño y al negocio autenticado. Conservar las rutas anteriores para compatibilidad.

## Interfaz v013

El dueño entra en Resumen y el cajero en Caja. La navegación agrupa operaciones, fidelización y administración. Resumen usa el informe de clientes existente, sin modificar saldos ni prometer notificaciones enviadas. Crear promociones es una acción explícita desde la lista; los ejemplos siguen siendo editables. Conservar las confirmaciones de eliminación y canje.

Caja usa Cliente → Operación → Recibo. Durante el guardado, bloquear edición y navegación de esa operación; conservar los datos y la clave de idempotencia si falla la conexión. Un recibo cierra todos los formularios del cliente anterior. No guardar credenciales ni cédulas en localStorage. El gateway verifica 23 rutas e incluye experience.js; los paneles y API de personal siguen excluidos. Las pruebas visuales opcionales de scripts/ui se ejecutan solo con datos ficticios en un servidor local aislado.

## Apple Wallet v014

La presentación respeta la promoción destacada. Elegir el premio de menor costo dentro de esa promoción; nunca sumar saldos o comparar costos entre programas. El frente muestra progreso y nombre breve; los detalles conservan nombres, saldos y costos completos. Promociones pausadas/eliminadas no aparecen y un negocio suspendido no invita a canjear.

El cambio de presentationVersion actualiza tarjetas existentes mediante la cola y el protocolo Apple; conservar serial, QR, token y clave de cifrado. No marcar una tarjeta como comprobada en un iPhone por pasar pruebas del servidor. La vista previa del panel usa datos ficticios explícitos y no registra movimientos. Los logos preparados pueden usar hasta 480×108, conservando el límite de 20 KB.

## Google Wallet y conexión v015

GoogleWalletExperience.kt construye campos nativos Google: saldo destacado, progreso, premio, módulos de detalle e historial. La selección del premio respeta la promoción y sus unidades; no usa campos Apple ni suma programas. Mantener ambos slots loyaltyPoints y secondaryLoyaltyPoints en cada PATCH para reemplazar información de promociones retiradas. No enviar notificaciones de marketing como efecto de la presentación. Máximo diez módulos por objeto; conservar registros completos y avisar si el cupo de detalles se agota. presentationVersion=15 conserva la identidad de ambas Wallet.

El asistente --configure-stable-https solo se ejecuta explícitamente desde Terminal, requiere dominio propio y túnel remoto previamente creado. El token se introduce oculto y se guarda exclusivamente en .local-wallet. Con tarjetas emitidas, cambiar origen o modo sigue exigiendo --renew-test-url. El token de un túnel named se aplica al conector al cambiar, conservando el hostname; nunca se vuelve a quick por un fallo de red. Un dominio fijo no sustituye la disponibilidad del servidor.

Cada fallo HTTPS reemplaza la guía local anterior por una guía de fallo y deja last-result.json privado. La página abierta al terminar debe priorizar recuperación frente al panel de accesos. Si falta guardar la misma tarjeta con la nueva conexión, el resultado es WALLET_CONNECTION_REFRESH_PENDING, aunque HTTPS haya pasado. No eliminar esa marca sin evidencia real del teléfono.

## Reparación de Wallet v015r2

Las mejoras y verificaciones de Wallet se entregan juntas para Apple y Google, adaptadas a cada proveedor. Google exige reviewStatus=UNDER_REVIEW en el PATCH de diseño de una clase aprobada; no omitirlo ni forzar APPROVED desde el emisor. Conservar clases, objetos, seriales, QR, saldos y tokens existentes. Un parche rechazado no debe quedar en la caché de diseños enviados.

El diagnóstico administrativo incluye deliveryErrors para ambas plataformas, con códigos conocidos, recuentos y máximo de intentos. Nunca incluir mensajes crudos del proveedor, claves, identificadores de clientes o contenido de pases. La API sigue limitada al administrador de plataforma. Un resultado de pruebas o HTTPS aprobado no equivale a una tarjeta instalada ni a una actualización aceptada por el proveedor.

## Experiencia de ambas Wallet v016

La vista previa del dueño alterna Apple/Google y estados ficticios. No confundir simulaciones con compras ni instalaciones. Google usa sus propios campos y decide el color del texto; los colores personalizados del texto corresponden a Apple. Conservar el fondo común y la corrección de contraste útil.

WalletRewardGuidance comparte el progreso y la previsión de saldo después de un solo premio. Usa enteros/BigDecimal y el saldo de la promoción correspondiente. No reserva saldo ni modifica los canjes; un negocio suspendido no muestra invitaciones ni previsiones. presentationVersion=16 renueva contenido en ambas plataformas conservando identidades.

El guardado del cliente prepara una sola solicitud a la vez, conserva la elección de proveedor, valida el destino y retira enlaces vencidos. Respuestas tardías de otra sesión no pueden mostrar enlaces. Preparar o abrir Wallet nunca equivale a confirmar una instalación. Las pruebas scripts/ui/apple-wallet.spec.cjs y scripts/ui/wallet-save.spec.cjs interceptan toda la red y solo usan datos ficticios; no añaden una dependencia Node al servidor.

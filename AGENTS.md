# Loyalty

El proyecto está en `/Users/ldgomm/Developer/pdc/sales/loyalty`. El paquete único es `com.premierdarkcoffee.loyalty`. Conserva el formato y el orden de declaraciones de IntelliJ; modifica únicamente las regiones necesarias. No confundas reformateo con cambios de lógica.

El usuario autoriza commits locales automáticos después de aprobar la validación completa. No hacer push. El script se ejecuta desde Downloads y genera allí un ZIP con el mismo .sh, código antes/después, pruebas, errores, registros redactados y commit. Excluir archivos privados, certificados, tokens, pases, cachés y `.git`.

## Comprobaciones

La entrega v026 requiere 388 pruebas Kotlin/HTTP/PostgreSQL, incluidas las de concurrencia, todas las pruebas Python del instalador, LOCAL_STAGING_PASS y LOCAL_GATEWAY_PASS antes del commit. Verificar el código actual guardado; si cambia durante las pruebas, repetir una vez con el estado nuevo. La fase HTTPS se verifica después y se informa por separado. No reutilizar el PASS de Comeback para declarar Loyalty aprobado.

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

## Caja y condiciones de premios v017

Caja muestra opciones según el saldo de la promoción correspondiente; saldo suficiente no significa canje confirmado. Usar exclusivamente los premios visibles de la respuesta del miembro, incluso cuando el dueño tenga promociones pausadas en su dashboard. Los premios que comparten promoción son alternativas. No sumar programas ni comparar sus unidades. Mostrar primero dos opciones, permitir consultar todas y mantener acceso directo al formulario de compra.

Seleccionar un premio solo prepara el formulario existente. Los descuentos Benefit requieren productos y cotización; los premios de entrega directa usan counter-redemptions. Conservar comprobante, sucursal, productos, validación de revisión y clave de idempotencia durante reintentos. Cambiar premio en la compra borra la cotización y el consentimiento. Cambiar premio o sucursal del canje directo invalida su revisión y exige una nueva confirmación.

RewardBenefitPresentation describe la regla real con porcentajes decimales exactos: ITEM afecta una unidad de menor precio elegible; BASKET afecta el total de su categoría, no el comprobante completo. Caja, vista previa y detalles nativos Apple/Google usan el mismo benefitText. No inventar descuentos para premios sin Benefit ni hacer visibles promociones retiradas. presentationVersion=17 actualiza ambas Wallet conservando identidades. La nueva prueba counter-rewards.spec.cjs intercepta todas las solicitudes y usa datos ficticios.

## Interfaz Navy y ficha del negocio v018

Navy (#0B1F3A) es el color principal de la aplicación. Respetar los colores propios de las vistas previas y tarjetas Apple/Google. No cambiar presentationVersion ni identidades de pases por cambios exclusivos del panel.

El registro nuevo del panel usa /api/platform/businesses y exige ficha fiscal/contacto y primera sucursal; se guardan atómicamente. Mantener /api/platform/tenants compatible con integraciones y negocios anteriores. V008 añade business_profiles con versión optimista; no inventar RUC para registros anteriores. Un RUC válido aquí significa formato de 13 dígitos, no consulta o certificación del SRI. Una entidad puede tener varias marcas: no exigir RUC único entre negocios. Los perfiles son privados para dueño/plataforma; no mostrarlos a cajeros, clientes o proveedores Wallet.

La búsqueda predictiva es de lectura, requiere selección explícita y respeta el negocio del empleado. Limitar a ocho sugerencias, dos caracteres para datos remotos, no exponer cédulas, hashes o credenciales. Buscar cédula sigue siendo exacto. Ignorar respuestas antiguas, de otra sesión o de una pantalla cerrada. Buscar secciones usa solo el menú permitido del rol. No registrar compras o canjes al seleccionar una sugerencia.

El registro tiene pasos de negocio, contacto y revisión. Conserva campos al volver y bloquea el envío duplicado mientras espera respuesta. Un conflicto de versión en la ficha conserva la edición y ofrece recargar los datos guardados explícitamente. Las pruebas navy-workspace.spec.cjs usan red interceptada y datos ficticios.

## Ficha de clientes v019

- v019 parte de v018. No añade migraciones ni cambia la presentación nativa de Wallet (`presentationVersion=17`). Apple y Google mantienen pruebas en paralelo.
- `customer-workspace/{id}` y `customer-suggestions` son privados del dueño y limitados al negocio. La ficha usa una transacción REPEATABLE READ, READ ONLY: no libera reservas vencidas, modifica saldos ni encola mensajes.
- Historial: 20 movimientos por página, compras y canjes CONSUMED hasta el instante de consulta; ordenar por fecha, tipo e id. Conservar snapshots de premios eliminados usando `programs`, pero mostrar progreso únicamente de promociones activas mediante `customer_programs`.
- Los filtros de tipo/sucursal solo afectan movimientos. Las métricas de ficha son históricas; las métricas de lista mantienen su período. `sort` admite únicamente RECENT, SPENT, VISITS, NAME y NEWEST, con SQL fijo y parámetros enlazados.
- El panel lateral conserva búsqueda/orden al cerrar, devuelve foco y descarta respuestas tardías. Las preferencias requieren autorización explícita del cliente; desmarcar la confirmación tras guardarlas. Caja solo hace lookup al elegir Atender; no autoriza compras ni canjes.
- Prueba aislada `scripts/ui/customer-workspace.spec.cjs`: navegación con teclado, móvil, consentimiento, paginación, sesión y errores. El instalador exige 137 pruebas generales + 160 PostgreSQL, Python y Docker/gateway antes del auto commit local. HTTPS se informa después.

## Corrección de la prueba de orden v019r1

La prueba CustomerWorkspacePostgresTest fija created_at de todos sus miembros con fechas relativas al reloj simulado. El alta real usa now() de PostgreSQL: no mezclarlo con Clock.fixed para inferir el orden NEWEST. Comprobar el orden completo y métricas idénticas en los cinco modos. Esta revisión no cambia consultas de producción, datos de negocio, migraciones ni Wallet. Se mantienen las 297 pruebas obligatorias (137 generales + 160 PostgreSQL), Python y Docker/gateway antes del auto commit.

## Promociones y arte de Wallet v020

Pausar/reactivar desde la lista envía la configuración completa con expectedVersion; no reconstruir ni perder bonos, horarios o categorías. La confirmación explica que se oculta a clientes y se conservan saldos. Un conflicto exige recargar. Recuperación visible en Caja y ficha de cliente es exclusiva del dueño: requiere verificación de identidad y no confirma instalación. Retirar el QR temporal al vencer y no enviar compras/canjes al abrir la ayuda.

Apple y Google reciben el mismo símbolo y acabado, con layouts nativos distintos: strip 375×123 en Apple (@1x/@2x/@3x), hero 1032×812 en Google. Símbolos vectoriales propios, sin dependencia de fuentes emoji del servidor. Hasta veinte sellos individuales; metas superiores usan barra porcentual calculada sin overflow. El saldo y el costo exactos siguen en campos nativos, también para lectores de pantalla. Nunca sumar promociones.

El strip de sellos no tiene campos primarios superpuestos: el saldo nativo se conserva en la cabecera con su clave y changeMessage. Google siempre reemplaza heroImage, incluso al pausar/eliminar: fondo sin progreso evita conservar sellos antiguos. Los assets públicos codifican solamente parámetros acotados de dibujo, sin miembros, cédulas, QR, tokens ni consultas de base. No afirmar que se cambió la tipografía nativa ni que el fondo completo admite degradado.

presentationVersion=20 renueva ambas Wallet sin cambiar identidades. Se exigen 146 pruebas generales + 160 PostgreSQL, todas las Python (122) y Docker/gateway (26 comprobaciones) antes del commit. Confirmar recepción en iPhone y Android por separado; HTTPS y compilación no sustituyen esa evidencia.

## Corrección de la prueba de actualización v020r1

La prueba de actualización en WalletPostgresTest debe esperar presentationVersion=20. Comprueba tanto la versión histórica 8 como la 17 usada hasta v019, conservando las comprobaciones de saldo, serial, token, QR, identificadores Apple/Google, registro del dispositivo y actualización idempotente. Esta revisión no cambia código de producción, migraciones ni configuración privada. Mantener las 306 pruebas Kotlin/HTTP/PostgreSQL, Python y Docker/gateway antes del auto commit; HTTPS y teléfonos se verifican por separado.

## Gestión, cumpleaños e informes v021

V001–V008 son inmutables. V009 añade solicitudes/correcciones de ficha y configuración/elecciones de cumpleaños. No cambia saldos, identidad de pases ni presentationVersion=20.

El dueño puede editar contacto, web y redes HTTPS permitidas. Razón social, RUC, actividad, provincia, ciudad y dirección requieren administrador y motivo documentado en la API. Una solicitud no aprueba cambios automáticamente ni envía correo. Solo una pendiente por negocio, reintentos idempotentes, historial privado y resolución explícita. Los negocios suspendidos pueden solicitar correcciones. No confundir formato del RUC con certificación tributaria.

El asistente de promociones es Beneficio → Reglas → Revisión. Ejemplos editables; no publicar hasta confirmar. promotion-setups crea puntos/cashback y premio en una transacción con idempotencia y sucursales verificadas; promotion-templates conserva los descuentos por categoría. Los premios directos requieren canje en caja, no descuentos automáticos. El editor avanzado sigue disponible.

Los controles monetarios avanzan una unidad (+1/−1), admiten entrada manual de centavos y calculan en enteros. Los códigos internos se generan solo a petición y nunca reemplazan un código existente. No generar identidades de cliente ni factura tributaria desde este control.

Cumpleaños admite título, mensaje y hasta ocho textos; aleatorio exige dos distintos. Elegir y persistir por negocio/cliente/año local una sola vez, reutilizando el mismo contenido en Apple y Google y durante reintentos/ediciones del día. Respetar consentimiento, estado activo, zona horaria y 29 de febrero. Pausar oculta el mensaje. El worker actualiza contenido; no prometer SMS, correo, WhatsApp ni alerta de marketing en pantalla bloqueada.

Informes compartidos por dueño y administrador, aislados por negocio, 7/30/90/365 días. Usar SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY antes de leer: Database.tx ya abrió la transacción con SET LOCAL. Los períodos comienzan a medianoche local e incluyen hoy parcialmente; la comparación corresponde a días completos anteriores. Total pagado proviene de compras; premios solo CONSUMED por consumed_at. Agregar sucursales por separado para evitar multiplicar compras por canjes. Las categorías incluyen solo productos detallados. No sumar compradores diarios o por sucursal ni llamar retención a la repetición de compra. Los gráficos y CSV son lectura, no generan cargos, reservas o mensajes.

Exigir 152 pruebas generales + 176 PostgreSQL (328), todas las Python (123), Docker y 31 comprobaciones del gateway antes del auto commit local. Mantener HTTPS y recepción en teléfonos como resultados separados. Pruebas de interfaz con fixtures ficticios: siete suites interceptadas, incluida owner-experience.spec.cjs; experience.spec.cjs sigue siendo una prueba opcional contra servidor aislado.

## Presentación nativa Apple y Google v022

V001–V009 permanecen inmutables. presentationVersion=22 actualiza ambas Wallet conservando serial, token, QR, googleId/googleClass, saldo y registros. La prueba de actualización debe esperar 22 y cubrir versiones anteriores 8, 17 y 20; esta regla reemplaza la expectativa histórica de v020r1.

Los nuevos dibujos públicos usan /wallet/art/v22 y conservan /v20 con su render original. Solo GET, versiones conocidas, parámetros acotados y sin datos personales. Apple mantiene 375×123 en sus tres escalas; Google 1032×812 según su guía vigente. No incrustar texto en imágenes ni presentar porcentajes como saldo contable. Hasta 20 sellos, casillas individuales; puntos, cashback y metas mayores, barra porcentual entera acotada, usando BigInteger para evitar desbordamientos. Sin premio elegible o negocio pausado, ilustración vacía.

Google classTemplateInfo comparte solo referencias estáticas, dos filas: balances nativos y headline del objeto. Cada cliente mantiene sus valores en su propio objeto. Todos los módulos deben ser alcanzables desde el frente o los detalles; máximo diez, registros completos y aviso de excedentes. Mantener reviewStatus=UNDER_REVIEW y reintento de actualización de clase fallida. Apple conserva saldo como texto nativo y sitúa historial antes del resto de premios. No simular movimientos de Apple Pay.

Estilos rápidos solo cambian apariencia y requieren Guardar diseño explícito; preservan nombre, logo, promoción, bienvenida e instrucciones. Ejemplos nueva/acumulando/premio/pausada no ejecutan operaciones. Mantener contraste corregible, accesibilidad y desplazamiento completo de la vista previa en pantallas pequeñas. wallet-design.spec.cjs usa ilustraciones producidas por Kotlin y datos ficticios.

Exigir 160 generales + 176 PostgreSQL (336), 123 Python, Docker y 36 comprobaciones de gateway antes del auto commit local; no push. Ocho suites UI interceptadas. HTTPS y recepción Apple/Google en teléfonos siguen pendientes hasta comprobarlas en el entorno del usuario. Nunca renovar automáticamente un túnel con tarjetas instaladas.

## Corrección de la prueba de pausa v022r1

El ZIP v022 del 7 de noviembre confirmó 160 pruebas generales y 175 PostgreSQL aprobadas. PromotionLifecyclePostgresTest falló únicamente porque la prueba de pausa esperaba presentationVersion=20, mientras que el servidor devuelve 22. Corregir esa expectativa a 22 conservando todas sus comprobaciones de saldo, premios, alta pública, identidad de ambas Wallet, ocultación de promociones y reactivación. No cambiar producción, esquema ni la versión visual por esta corrección.

Al cambiar presentationVersion en futuras entregas, buscar todas sus referencias en src/main y src/test, incluidas WalletPostgresTest y PromotionLifecyclePostgresTest; distinguir versiones históricas usadas como entrada de la versión actual esperada como resultado. No eliminar aserciones ni sustituirlas por valores tomados del mismo resultado comprobado.

Mantener las 336 pruebas completas, 123 Python, Docker y 36 comprobaciones de gateway antes del commit local. Un resultado anterior con 335 aprobadas no permite saltar ninguna. HTTPS y validación en teléfonos siguen informándose por separado.

## Radar de regreso y reglas Wallet v023

presentationVersion=23 en Apple y Google, con identidades y saldos conservados. Actualizar las expectativas actuales de WalletPostgresTest y PromotionLifecyclePostgresTest; conservar las entradas históricas 8, 17, 20 y 22. Las reglas de acumulación provienen de la configuración vigente de customer_programs y se retiran al pausar/eliminar. Compartir texto exacto entre ambas Wallet y respetar el máximo de diez módulos Google. Antes de la primera compra se puede mostrar la regla de un premio visible, sin fabricar un saldo.

El radar es privado de dueño/plataforma, aislado por negocio y de solo lectura. No liberar reservas ni encolar mensajes al consultarlo. Mediana observada inferior de hasta nueve días distintos en 365 días; exigir cuatro días y siete días de historial, umbral max(7,ceil(mediana*1.5)). La señal describe mayor intervalo, no abandono demostrado. Cercanía: 80% o un sello, sin mezclar programas. Primera compra pendiente significa cero compras registradas. Grupos superpuestos no se suman.

Cohortes de seis meses por primera compra, segunda visita en otro día local como máximo 30 días después. Solo denominadores con 30 días posteriores completos; compras futuras excluidas. No llamar ROI o efecto de campaña a este porcentaje. V001–V009 inmutables.

El instalador exige 169 generales + 187 PostgreSQL (356), todas las Python, Docker y 36 comprobaciones de gateway antes del auto commit local. Nueve suites UI interceptadas con datos ficticios, incluyendo return-radar.spec.cjs. Nunca tomar una ejecución con PostgreSQL embebido como validación de concurrencia de producción; el gate completo usa PostgreSQL real. HTTPS y teléfonos se comprueban aparte.

## Estilos por negocio y progreso explícito v024

presentationVersion=24 para ambas Wallet. Preservar identidades, claves, saldos y registros. V001–V009 inmutables. Las pruebas de actualización esperan 24 y conservan las entradas históricas 8, 17, 20, 22 y 23. No renovar automáticamente el túnel.

WalletJourney describe saldo, meta y pendiente en las unidades de la promoción destacada; porcentajes con BigInteger acotados a 100 y dinero exacto con BigDecimal. No transformar puntos o dinero en visitas, sumar promociones ni afirmar canje confirmado. Saldos excedentes permanecen exactos. Los campos de texto son nativos; no incrustarlos en PNG ni prometer cambio de fuente nativa.

presentationBalances añade ceros solo a la vista de promociones activas identificadas en earningRules, con programName y kind de configuración vigente. Nunca inserta saldo, compra ni canje. Los saldos existentes prevalecen y no se duplican. Sin metadata, conservar compatibilidad; sin programa activo, sin progreso. Negocio suspendido no genera invitaciones ni representación inicial de promociones.

Los 32 estilos y 33 símbolos son apariencia, no plantillas de reglas fijas. Buscador, categoría, estado simulado y despliegue del catálogo no se envían al servidor. Guardar diseño es explícito y versionado. Los símbolos 0–9 no cambian; 10–32 son nuevos. /wallet/art/v24 admite todos; v20/v22 solo 0–9 y conservan su render. Miniaturas y tarjetas usan el mismo dibujante, sin depender de emoji del host. Las rutas públicas aceptan solo GET y parámetros acotados, sin datos privados.

Google usa tres filas de campos propios del objeto (saldo/restante, progreso y premio). Máximo diez módulos; integrar uso en estado y conservar historial, condiciones y novedades. Todos los módulos son alcanzables desde frente o detalles. Apple combina como máximo cuatro campos secundarios/auxiliares y conserva balance/changeMessage, con progreso exacto también en detalles.

Exigir 178 pruebas generales + 189 PostgreSQL (367), todas las Python (124), Docker y 43 comprobaciones del gateway antes del auto commit local; no push. Diez suites UI interceptadas, incluyendo wallet-industries.spec.cjs. PostgreSQL embebido no valida concurrencia de producción: el gate Mac usa PostgreSQL real. HTTPS y recepción en los dos teléfonos son verificaciones separadas.

## Metas editables de premios v025

Cada premio tiene una meta versionada, visible y editable desde Promociones y Premios, incluso cuando ya existen clientes. Se permite aumentar o disminuir puntos, sellos y saldo requerido. El editor muestra antes/después y exige reconocimiento del impacto al aumentar; conserva borradores de acumulación, beneficio, categoría, disponibilidad y pertenencia al programa. Recargar tras un conflicto es explícito; no sobrescribir otra sesión ni repetir envíos concurrentes.

saveReward permite modificar cost con expectedVersion, manteniendo inmutable el tipo de Benefit. Cambiar de descuento o categoría requiere otro premio. Cada guardado programa la revisión de pases del mismo negocio para Apple y Google, sin llamadas externas en la transacción. Se conservan identidades, saldos y movimientos; presentationVersion sigue en 24. Las cotizaciones/revisiones de caja obsoletas se rechazan; reservas ya creadas conservan su costo original hasta vencer y los comprobantes consumidos son inmutables.

El gate exige 178 pruebas generales y 196 PostgreSQL (374 en total), incluidas dos nuevas de concurrencia, más Python, Docker y gateway. La suite reward-goals.spec.cjs usa exclusivamente datos ficticios e intercepta toda la red. HTTPS y validación en teléfonos se informan aparte.

## Categorías y ejemplos por negocio v026

BusinessProfile.category es un identificador explícito del catálogo business-categories.json, separado de activity. Nuevos registros desde el panel requieren elegir categoría. El servidor acepta ausencia para clientes anteriores y la conserva en ediciones antiguas. La categoría es un dato protegido: solo plataforma puede corregirla, con razón, versión y auditoría como el resto de identidad fiscal. No guardar secretos ni datos de clientes en el catálogo.

42 categorías y 168 ejemplos editables. Una categoría elegida prevalece sobre actividad; GENERAL elegido no se reemplaza por inferencias. Sin categoría explícita, coincidencia exacta normalizada de actividad con nombre/alias, nunca nombre comercial, diseño o fragmentos ambiguos. Caso desconocido: GENERAL. Consultar sugerencias no modifica el perfil ni crea promociones. Mantener contexto por tenant; catálogo de alta solo plataforma; sugerencias solo dueño.

El asistente ofrece únicamente ejemplos de la categoría resuelta, con productos correspondientes y todas las mecánicas disponibles desde cero. Elegir un ejemplo prepara un borrador, permite cambiar meta, porcentaje, conteo, nombre y premio y exige revisión final para crear. No sobrescribir ediciones sin elección explícita; conservar fechas/sucursales. Los puntos y cashback crean premios de entrega en caja, sin simular descuentos automáticos.

Cambiar categoría no altera reglas existentes, ledger ni tarjetas. presentationVersion sigue en 24; promociones creadas por ejemplos usan la misma generación Apple y Google. V001–V009 inmutables. No renovar túneles, claves ni identidades.

Gate obligatorio: 185 generales + 203 PostgreSQL (388), incluidas las de concurrencia, todas las Python, Docker y 43 comprobaciones de gateway antes del auto commit local. Doce suites UI interceptadas, incluyendo business-categories.spec.cjs. PostgreSQL embebido solo comprueba casos secuenciales; no sustituye PostgreSQL nativo. HTTPS y comprobación en teléfonos se informan aparte.

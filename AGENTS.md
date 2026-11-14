# Loyalty

## Lúmina v026 / Loyalty v065 — public agency homepage

- Baseline: installed v025/v064, commit ed9442283aa339a347076ebdba958c8aac0498f3. This section supersedes prior version and gate counts.
- `/` is the public agency homepage for every actor. `/login` is the login form, including failed POST responses. Unauthenticated private navigation redirects to `/login`; logout returns to `/`. The public page receives only a signed-in boolean and must not disclose account, company, session or billing data.
- Present only Content, Web, Google Maps, Brand Design and Wallet. The retired coming-soon service has no navigation, page or ordering option. Its old URL returns 404. Preserve normal WhatsApp contact fields and existing telephone data.
- All generated routes and anchors use English; user-facing copy stays Spanish. Legacy aliases remain solely for compatible bookmarks, forms, health probes and assets. Never translate QR slugs, provider URLs, identifiers or tokens.
- Homepage styles and optional menu enhancement are isolated from the workspace. Core navigation, native service disclosures, FAQs and account entry work without scripts. No external trackers, font dependencies, invented client claims, fixed public prices or implicit subscriptions.
- Preserve role boundaries, access grants and opt-in activation. No native Kotlin, Wallet assets, SQL, provider configuration, identity, subscription or account changes. SQLite10, PostgreSQLV017 and Wallet representation34 remain unchanged.
- Gates: 30 suites / 340 portal tests, 170 Python, 312 native unit/HTTP, 347 PostgreSQL. Docker staging and gateway before local commit; no push. 24 DOM suites are separate from browser inspection and physical Wallet device verification.
- Terminal output is limited to RESULTADO plus the URL after confirmed startup. The development installer blocks production and conflicting local edits. See docs/lumina-homepage-v065.md.

## Lúmina v025 / Loyalty v064 — English navigation and clear access

- Baseline: installed v024r1/v063, commit a4d70e146ca785dcd73e6f9e9a37348112af3c20. This section supersedes previous version and gate counts.
- English canonical routes, query keys, form actions and anchors. Spanish user-facing text. Legacy names belong only at compatibility boundaries; do not translate public QR slugs, API identifiers, free text or provider tokens.
- Normalize old POST paths without replaying requests or changing the body, CSRF checks, actor or idempotency keys. Reject conflicting query aliases. Preserve cached assets and health-probe response types.
- Keep owner, collaborator and agency permissions unchanged. Agency consultation remains read-only; team editing belongs to the owner. Preserve all existing Wallet/session grants and tenant isolation.
- Password visibility is transient and resets on submit, tab hiding and page return. Never persist account form data in browser storage. Keep native forms usable without scripts.
- No changes to native Kotlin/Wallet assets, SQL, SQLite10/PostgreSQLV017, Wallet representation34, identities, credentials, provider IDs, certificates, domains, balances, contracts or subscription terms.
- Gates: 29 suites / 326 portal tests, 170 Python tests, 312 native unit/HTTP tests and 347 PostgreSQL tests. Docker staging and gateway before local commit; no push. 23 DOM suites are separate from visual browser and physical device verification.
- Terminal output stays limited to RESULTADO and the URL after confirmed startup. Installer canonical flags are English; old flags remain aliases. Production is blocked. See docs/lumina-navigation-v064.md.

## Lúmina v024r1 / Loyalty v063 — entregas y revisión claras

- Baseline: v023 instalada y validada, commit 90fd692782e391222416298ffa555f7fc9be46e0. Esta sección prevalece para versiones y gates.
- Ficha compartida de solicitudes en request-detail-pages.mjs; conserva la shell de Contenido y la principal en los demás servicios. Siguiente paso según estado y permiso, archivos por entregable, decisiones separadas y anclas accesibles. Equipos y roles conserva su posición y los menús sus dimensiones.
- Recuperar datos únicamente en errores 400/409 de operaciones autorizadas, nunca ante 403/404. Mantener los valores de la operación y objeto exactos, el quote ID y la revisión originales. Si la acción dejó de estar disponible, mostrar los datos escapados sin reabrirla. Ningún borrador en almacenamiento local.
- Adjuntar evidencia incrementa revisión de la pieza para invalidar aprobaciones abiertas antes del cambio. Rechazar URL duplicada dentro de la transacción. Nuevos formularios de estado, cotización, pieza y visita llevan revisión; omisión heredada continúa compatible. Conservar autorización en servidor y el aislamiento entre negocios.
- Notas de cierre de visita se agregan a sus indicaciones, sin borrarlas. Cambios solicitados registran nombre de pieza y comentario. No publicar automáticamente ni aprobar por el negocio.
- Sin cambios en Kotlin, SQL, esquema SQLite10/PostgreSQLV017, representación Wallet34, identidades, claves, certificados, dominios, asociaciones, cargos, suscripciones o contratos.
- Regresión v024r1: comprobar visitas canceladas en su sección y recuento, nunca buscar un año en el HTML completo: los UUID también pueden contener 2099. Conservar una prueba determinista con ese identificador y controles con agenda vacía y una visita vigente. No omitir pruebas ni reintentar automáticamente para esconder fallos.
- Gates: 28 suites / 315 pruebas portal; 170 Python; 312 unidades/HTTP y 347 PostgreSQL. Docker y gateway antes de commit local; no push. 22 suites DOM, distintas de comprobación visual y recepción física.
- Terminal solo RESULTADO y URL después de salud confirmada. Instalador de desarrollo bloquea producción. Ver docs/lumina-entregas-claras-v063.md.

## Lúmina v023 / Loyalty v062 — jornada y navegación claras

- Baseline: v022 instalada y validada, commit 6bb8c0d534df0d775dc6a335889cf7451cd1653b. Esta sección prevalece para versiones y gates.
- Pendientes reúne entregas con permiso de aprobación y propuestas/cotizaciones del dueño. Nunca permite actuar como negocio a la agencia. Consulta sin escrituras; filtros, búsqueda y paginación conservan alcance.
- Agenda compartida entre Lúmina y Contenido: próximas, por actualizar e historial. No marcar una visita realizada por haber vencido. Las solicitudes canceladas salen de próximos y sus recuentos, conservando historial. Buscar antes de paginar; preservar empresa y modo de agencia.
- Solicitudes: todas, en curso y cerradas; totales exactos y paginación con filtros. Búsqueda de navegación únicamente sobre enlaces autorizados, sin red ni almacenamiento. Equipos y roles mantiene su posición inmediatamente después de Mi negocio para el dueño.
- Sin cambios de esquema, motor Wallet, identidades, certificados, dominios, suscripciones, cargos o contratos. SQLite10/PostgreSQLV017 y representación Wallet34 se conservan.
- Gates: 27 suites / 298 pruebas portal; 170 Python; 312 unidades/HTTP y 347 PostgreSQL. Docker y gateway antes de commit local; no push. 21 suites DOM, distintas de comprobación visual y recepción física.
- Terminal solo RESULTADO y URL después de salud confirmada. Instalador de desarrollo bloquea producción; la entrega no despliega. Ver docs/lumina-jornada-simple-v062.md.

## Lúmina v022 / Loyalty v061 — contacto y registro claros

- Esta sección prevalece sobre números de versión y gates históricos. Baseline: resultado v021 validado, commit ae2c75bd459d21eccf88d26ab293791f6293a29f.
- Teléfono obligatorio al activar colaborador y al crear cliente Wallet. Invitación del dueño admite teléfono opcional. Cuentas y clientes anteriores sin contacto siguen operando; nunca copiar el teléfono del negocio ni fabricar datos. E.164 normalizado, formato local Ecuador y extranjeros con +. Teléfono no es identidad, recuperación ni consentimiento publicitario.
- Mi cuenta modifica únicamente el contacto de la sesión. Equipo y permisos exige dueño y revisión. Ficha de cliente exige permiso WALLET_CUSTOMERS.EDIT, confirmación y contact_version; VIEW no edita. No poner contactos en auditoría, Wallet, QR, métricas o exportaciones. Mismo teléfono puede pertenecer a varias personas.
- SQLite010 y PostgreSQLV017 son aditivas; conservar todos los SQL anteriores. Guardar contacto no llama changed(), no reemite pases ni cambia saldos, claves, seriales, objetos Google, dispositivos, dominios o contratos. Mantener representación Wallet34.
- Alta pública: teléfono, cumpleaños opcional con selectores, consentimiento de novedades sin marcar. Si join ya confirmó, un fallo al leer tarjeta solo reintenta lectura. Caja desde la ficha usa memberId interno con alcance de dueño y tenant; colaborador conserva Caja mediante su ruta y permisos actuales.
- Gates: 26 suites / 283 pruebas portal, 170 Python, 312 unidades/HTTP y 347 PostgreSQL (659), Docker y gateway antes del commit; no push. 20 suites DOM, revisión visual y recepción física separadas. Terminal solo RESULTADO y URL tras salud confirmada.
- Producción exige SQLite10/V017 y sello compatible; sin migración/reseñado automático. Ver docs/production/transicion-v061.md. Entrega: docs/lumina-contacto-simple-v061.md.


## Lúmina v021 / Loyalty v060 — identificación e inicio simple

- La identidad de agencia/dueño/colaborador usa cédula y contraseña; empresas usan RUC y WhatsApp. Validar en servidor y navegador, preservar ceros iniciales y rechazar duplicados dentro de la transacción. RUC estructural no equivale a certificación SRI; no imponer módulo 11 a sociedades. Cédula consistente no prueba titularidad.
- SQLite009 es aditiva. Conservar todos los SQL anteriores, IDs, contraseñas, asociaciones, dominios y secretos. Cuentas anteriores completan la identidad con contraseña actual; no inventar documentos, no recrear cuentas, no cambiar seriales u objetos Wallet. El acceso anterior por correo se cierra al completar la transición.
- Crear un negocio no activa servicios ni prepara Wallet. La bienvenida es una sola vista y Explorar primero es la opción inicial. Solo el dueño activa módulos; Wallet requiere condiciones aceptadas o contrato vigente que ya la incluya. El colaborador solo recibe tareas asignadas en servicios activos. Aplicar el control en rutas y operaciones de dominio.
- Mis servicios permite activar los demás módulos. Ninguna visita a cuenta, catálogo o administración activa Wallet. Cargos de servicios pueden crear explícitamente una cuenta interna de facturación sin habilitar Wallet ni suscripción. Mantener USD 4,99/mes o USD 50/año/sucursal, promoción fija hasta 31-12-2026 y acuerdos previos.
- Gates: 25 suites / 272 pruebas del portal, 170 Python, 309 unidades/HTTP nativos y 341 PostgreSQL (650), Docker local y gateway antes del commit. 18 suites DOM no equivalen a comprobación visual o recepción en teléfonos. Imprimir RESULTADO y URL solo después del arranque confirmado.
- Producción exige SQLite9 y sello compatible; no migrar ni sobrescribir sellos automáticamente. Seguir docs/production/transicion-v060.md. Mantener representación Wallet34 y V001–V016. Guía de entrega: docs/lumina-inicio-simple-v060.md.

El proyecto está en `/Users/ldgomm/Developer/pdc/sales/loyalty`. El namespace base es `com.premierdarkcoffee.loyalty`, organizado en subpaquetes por responsabilidad (v041). Conserva el formato y el orden de declaraciones de IntelliJ; modifica únicamente las regiones necesarias. No confundas reformateo con cambios de lógica.

El usuario autoriza commits locales automáticos después de aprobar la validación completa. No hacer push. El script se ejecuta desde Downloads y genera allí un ZIP con el mismo .sh, código antes/después, pruebas, errores, registros redactados y commit. Excluir archivos privados, certificados, tokens, pases, cachés y `.git`.

## Comprobaciones

La entrega v040 requiere 570 pruebas Kotlin/HTTP/PostgreSQL, incluidas las de concurrencia, todas las pruebas Python del instalador, LOCAL_STAGING_PASS y LOCAL_GATEWAY_PASS antes del commit. Verificar el código actual guardado; si cambia durante las pruebas, repetir una vez con el estado nuevo. La fase HTTPS se verifica después y se informa por separado. No reutilizar el PASS de Comeback para declarar Loyalty aprobado.

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

42 categorías y 169 ejemplos editables. Una categoría elegida prevalece sobre actividad; GENERAL elegido no se reemplaza por inferencias. Sin categoría explícita, coincidencia exacta normalizada de actividad con nombre/alias, nunca nombre comercial, diseño o fragmentos ambiguos. Caso desconocido: GENERAL. Consultar sugerencias no modifica el perfil ni crea promociones. Mantener contexto por tenant; catálogo de alta solo plataforma; sugerencias solo dueño.

El asistente ofrece únicamente ejemplos de la categoría resuelta, con productos correspondientes y todas las mecánicas disponibles desde cero. Elegir un ejemplo prepara un borrador, permite cambiar meta, porcentaje, conteo, nombre y premio y exige revisión final para crear. No sobrescribir ediciones sin elección explícita; conservar fechas/sucursales. Los puntos y cashback crean premios de entrega en caja, sin simular descuentos automáticos.

Cambiar categoría no altera reglas existentes, ledger ni tarjetas. presentationVersion sigue en 24; promociones creadas por ejemplos usan la misma generación Apple y Google. V001–V009 inmutables. No renovar túneles, claves ni identidades.

Gate obligatorio: 185 generales + 203 PostgreSQL (388), incluidas las de concurrencia, todas las Python, Docker y 43 comprobaciones de gateway antes del auto commit local. Doce suites UI interceptadas, incluyendo business-categories.spec.cjs. PostgreSQL embebido solo comprueba casos secuenciales; no sustituye PostgreSQL nativo. HTTPS y comprobación en teléfonos se informan aparte.

## Wallet Signature v027

presentationVersion=27 renueva Apple y Google con las mismas identidades y saldos. La actualización cubre versiones históricas 8, 17, 20, 22, 23 y 24. No renovar túneles automáticamente. V001–V009 permanecen inmutables.

Apple añade posterGeneric (iOS/watchOS 27+) con storeCard de respaldo en el mismo pass.json, según su documentación. artwork.png mide 358×448 en tres escalas; strip clásico 375×144 en tres escalas. Conservar QR, serial, token, clave y campos de saldo/changeMessage. Un encabezado y dos campos de avance/premio; titular y demás saldos completos siguen en detalles. El sistema elige el estilo; no prometer resultado exacto sin prueba física.

Google mantiene loyaltyObject, hero 1032×812 y tres filas nativas, con premio antes de avance. Reemplazar ambos slots de saldo y hero incluso al retirar promociones. Máximo diez módulos alcanzables y reviewStatus UNDER_REVIEW. La clase contiene referencias, nunca saldo/nombre personal.

/wallet/art/v27 añade AURORA a SOLID/GRADIENT, 33 símbolos y layout=poster acotado. Sin textos incrustados, datos personales, QR ni consultas a la base. v20/v22/v24 conservan renderer y restricciones anteriores. Una tarjeta sin objetivo mantiene solo identidad gráfica, sin anillo ni sellos de progreso. SOLID/GRADIENT de diseños guardados conservan elección; Signature es el nuevo render de GRADIENT.

Vista previa con imágenes auténticas del servidor y composición orientativa, selector Apple póster/clásico y Google. No envía operaciones ni guarda opciones de simulación. Mantener campos protegidos, meta, logo y reglas; guardar acabado explícitamente y con versión. Datos ficticios en pruebas.

Gate: 195 generales + 203 PostgreSQL (398), todas las Python (125), Docker y 50 comprobaciones de gateway antes del auto commit local. Trece suites UI interceptadas, incluida wallet-signature.spec.cjs. Pruebas de PostgreSQL real, HTTPS y recepción en ambos teléfonos se informan por separado.

## Selección explícita en caja v028

Las dos interfaces de compra empiezan sin promociones marcadas. Cada petición nueva del panel envía programIds explícito: [] significa ninguna; uno o varios ids significa únicamente esa selección. La API anterior mantiene compatibilidad con clientes que omiten el campo; no modificar el cálculo del ledger ni los hashes de reintentos históricos.

Registrar una compra añade un comprobante al historial y a las métricas de compras. No equivale a conceder un sello: los sellos de visita/unidad, puntos y cashback dependen de la selección y de las condiciones vigentes. Escanear/buscar un cliente no registra compras. Las promociones pausadas quedan fuera del selector. Canjear un premio sigue siendo una elección separada.

La revisión enumera las promociones elegidas o dice Solo registrar compra. Editar selección, productos, importe o sucursal invalida la revisión. Conservar elecciones explícitas al añadir/quitar productos y al cambiar a compra detallada; eliminar cualquier revisión anterior. Durante el envío no se edita; un fallo conserva payload y clave. Tras un recibo y nuevo cliente, volver a cero seleccionadas. Mostrar beneficios realmente confirmados, con nombre de promoción y singular/plural correcto.

No cambia presentationVersion=27: el mismo registro alimenta Apple y Google. No modificar migraciones, saldos previos, identidades, diseño o túneles. Gate completo: 195 generales + 203 PostgreSQL (398), todas las Python (125), Docker y 50 controles del gateway antes del auto commit. La comprobación DOM de caja verifica interacción y peticiones con red simulada; no sustituye PostgreSQL ni una prueba visual en navegador.

## Composiciones independientes v029

Seis composiciones nuevas (EDITORIAL, STAMPBOOK, TICKET, MOSAIC, RIBBON, PATH), separadas de las 32 paletas y los tres acabados. WalletDesign.composition tiene SIGNATURE como valor compatible con JSON anterior. Cambiar paleta no cambia composición, acabado, logo ni promoción. Cada composición usa un dibujante propio adaptado a Apple clásico, póster y hero Google; no contar colores como diseños distintos.

presentationVersion=29 conserva identidades y saldos en ambas Wallet. Actualizar expectativas actuales, mantener entradas históricas incluida 27. /wallet/art/v29 incluye composición validada y GET acotado, sin consultas privadas. v20/v22/v24/v27 mantienen bytes y restricciones. Sin textos ni QR incrustados; zonas de texto del póster conservan contraste. Saldo y meta exactos siguen nativos; puntos y dinero nunca se transforman en visitas. Sin objetivo, sin progreso activo.

Los templates Google cambian jerarquía y número de filas por composición, con referencias al objeto y ningún dato personal en la clase. Review UNDER_REVIEW y ambos slots de saldo se conservan. Apple reordena los grupos permitidos y conserva todos los detalles, alertas transaccionales e identidad. La UI refleja estas reglas, con distribución orientativa sujeta al sistema.

Gate: 205 pruebas generales + 204 PostgreSQL (409), todas las Python (126), Docker y 61 controles gateway antes de auto commit. Sin push ni renovación automática de túnel. DOM de composición y regresión de caja usan red simulada. Recibir el diseño en iPhone/Android sigue siendo una comprobación física separada.

## Estudio de tarjetas v030

Tres composiciones nuevas —PANORAMA, PRECISION y ATELIER— llevan la colección a nueve más el medallón original. No confundir las 32 paletas con composiciones. Todas tienen ilustración propia en Apple clásico, póster y Google y usan campos nativos para texto y valores exactos; no incrustar texto ni QR en las imágenes.

presentationVersion=30 conserva ambas identidades, saldos y movimientos. Añadir 29 a las entradas históricas de actualización. /wallet/art/v30 admite las diez composiciones con parámetros acotados y GET; v29 mantiene su allowlist de siete y sus bytes anteriores. Las rutas anteriores no aceptan las composiciones nuevas. V001–V009 inmutables. No renovar túneles automáticamente.

El estudio muestra novedades y la selección actual, permite desplegar las diez composiciones y comparar con los colores/símbolo propios sin guardarlos. El simulador informa acumulado, meta y pendiente en las unidades de la promoción; usa enteros seguros y BigInt para el porcentaje. Cambiar promoción reinicia el ejemplo, pausar o no tener meta desactiva el control. Nunca modifica saldos ni crea operaciones.

El guardado usa una lista explícita de campos del diseño, preserva los campos existentes no editados y excluye estados del simulador, búsquedas y proveedor. Indicar cambios pendientes, deshabilitar guardado sin cambios y restaurar solo el borrador local. Conservar el borrador tras conflicto o fallo, bloquear envíos concurrentes y no sobrescribir cambios ajenos. Galería, navegación por teclado y controles de vista previa deben funcionar en 320 px, 390 px y escritorio.

Gate obligatorio: 207 pruebas generales + 204 PostgreSQL (411), todas las Python (127), Docker y 76 controles de gateway antes de auto commit local, sin push. Las pruebas de interfaz usan datos ficticios y red interceptada; nunca credenciales reales. PostgreSQL, Docker, HTTPS y recepción física en ambos teléfonos son comprobaciones independientes. Una actualización pendiente de conexión requiere recuperar la misma tarjeta, no crear otra ni cambiar su identidad.

## Editor guiado v031

La mejora del panel se entrega para Apple y Google juntas. Tres pasos (Diseño, Marca, Promoción y textos), vista completa opcional y comparación simultánea con el mismo saldo ficticio. El simulador está contraído al entrar; su estado, la selección de plataforma, los filtros y el paso abierto nunca se guardan en WalletDesign.

Conservar las diez composiciones y las 32 paletas, el esquema y las rutas de arte v30, y presentationVersion=30: esta entrega modifica el editor, no el formato nativo de los pases. Los controles de formato Apple son vistas previas, no una preferencia persistida. La vista web es aproximada; la distribución real depende de Wallet.

Un borrador permanece en memoria. Proteger navegación lateral, búsqueda de secciones, Abrir caja, salida y recarga cuando haya cambios o tareas en curso. Cancelar conserva los valores y el foco; salir sin guardar descarta únicamente el borrador. Limpiar guardas y temporizadores al abandonar el editor o cambiar sesión. No almacenar datos, credenciales ni borradores en localStorage.

Guardar es explícito, conserva el control de expectedVersion, bloquea cambios concurrentes de la UI y mantiene el paso y la simulación. La respuesta del servidor confirma la nueva versión y establece la nueva base de Restaurar guardado; un error conserva el borrador. Un error de contraste ofrece un acceso visible a la corrección y un campo inválido oculto abre su paso antes de recibir foco.

Mantener 207 pruebas unitarias/HTTP y 204 de PostgreSQL, 127 Python y 76 comprobaciones del gateway. Las pruebas de scripts/ui/wallet-studio-flow.dom.cjs y wallet-studio-flow.spec.cjs verifican navegación, pérdida de borrador, guardado versionado, campos ocultos, comparación y anchos 320/390/1024/1440 con datos ficticios. La validación del teléfono sigue siendo independiente.

## Identidad visual v032

WalletDesign.artworkAccent es opcional: null mantiene el acento automático de versiones anteriores; un #RRGGBB válido personaliza únicamente la ilustración de Apple y Google. Persistir el color elegido, no el ajustado. El renderer y el editor ajustan el acento por mezcla sRGB entera hacia negro o blanco hasta alcanzar 3:1 contra el fondo. No convertir este cálculo en una afirmación de accesibilidad para todos los píxeles, los reflejos o los campos nativos. No tintar logos ni alterar textos, QR, saldos o premios.

presentationVersion=32 actualiza los pases existentes conservando serial, token, googleId, registro y saldos. Incluir 30 en la prueba de actualización histórica. /wallet/art/v32 añade un segmento auto o seis dígitos hexadecimales y conserva los límites de composición, símbolo, progreso, formato y GET. Las rutas v20/v22/v24/v27/v29/v30 mantienen sus contratos y sus bytes. V001–V009 inmutables.

El editor ofrece tres combinaciones de apariencia basadas en promotionSuggestions.category, incluida la resolución exacta de actividad del servidor. Cubrir las 42 categorías conocidas; no inferir la categoría a partir del nombre ni inventar una promoción. Las combinaciones reutilizan las diez composiciones y las paletas disponibles: no presentarlas como nuevos renderers. Aplicar solo tras selección explícita; conservar nombre, logo, textos, cumpleaños y promoción. Deshacer combinación restaura solo la apariencia anterior del borrador, no operaciones del negocio. Los cambios posteriores de apariencia o un guardado correcto limpian ese deshacer.

El acento tiene modo Automático, selector propio, muestra del color aplicado y explicación del ajuste. Cambiar el fondo recalcula la muestra. No persistir modo de vista previa, categoría sugerida, historial de deshacer ni controles del simulador. Mantener el guardado versionado, la protección del borrador y la recuperación ante 409.

Gate completo: 217 unitarias/HTTP + 205 PostgreSQL = 422, 128 Python, Docker y 88 controles del gateway antes de auto commit local; sin push. HTTPS y recepción en teléfonos se informan aparte, sin renovar automáticamente el túnel. Las pruebas wallet-identity.dom.cjs y wallet-identity.spec.cjs usan datos ficticios y red interceptada; las imágenes de la verificación visual provienen del renderer compilado. Validar las 42 categorías y anchos 320/390/1024/1440, tanto Apple como Google.

## Claridad y revisión v033

WalletDesign.frontFocus admite AUTO, PROGRESS y REWARD, con AUTO como valor compatible. La composición y el foco son independientes: el foco reordena los campos nativos de avance y premio en Apple clásico/póster y las filas Google. Nunca altera la selección de promoción, costo, saldo, ilustración, clave, serial ni QR. El modo explícito Google usa dos filas y conserva referencias del objeto, los dos slots de saldo, detalles completos y reviewStatus UNDER_REVIEW. Sin objetivo o con negocio pausado no se fabrica progreso ni disponibilidad.

Se conservan presentationVersion=32 y las rutas de arte v32: AUTO mantiene la presentación anterior. Guardar un foco distinto incrementa designVersion y encola la actualización existente para ambas Wallet. No hay migración SQL, renovación de URL ni reinstalación de tarjetas.

El editor permite seleccionar el foco desde Promoción y textos. La revisión opcional compara los campos guardados y el borrador, muestra colores y textos completos y permite volver a editar un campo oculto. Solo muestra diferencias persistibles; no envía preferencias de simulación ni guarda automáticamente. La vista de detalles utiliza datos ficticios claramente indicados y no inventa consumos. Escapar todo contenido del negocio.

Un fallo o conflicto mantiene el borrador y expectedVersion. El guardado exitoso establece la nueva base de comparación y Restaurar. Las combinaciones visuales y Deshacer combinación conservan el foco, nombre, logo, textos y promoción.

Gate del Mac: 225 pruebas unitarias/HTTP + 206 PostgreSQL (431), 128 Python, Docker y 88 controles gateway antes del auto commit local, sin push. Las pruebas wallet-clarity.dom.cjs y wallet-clarity.spec.cjs cubren prioridades, diez composiciones, textos, conflictos, teclado y anchos 320/390/1024/1440. HTTPS y recepción en cada teléfono requieren evidencia separada.

## Saldo después de un canje v034

presentationVersion=34 actualiza contenido de ambas Wallet conservando saldos, serial, token, googleId, QR y registros. Incluir 32 en la actualización histórica. Las rutas e imágenes permanecen en v32 y sus bytes no cambian. No hay migración SQL, cambio de reglas ni renovación automática de túneles.

Al alcanzar una meta, los campos nativos muestran el saldo disponible y para cuántos canjes completos del mismo premio alcanza. Usar división y resta enteras; evitar productos que desborden y mantener centavos exactos. La capacidad por saldo no confirma una operación ni garantiza disponibilidad: caja verifica condiciones, consentimiento y saldo vigente. Detalles conserva costo, saldo tras un solo canje y condiciones; premios de un mismo programa comparten saldo. Sin meta o negocio pausado no se ofrece un canje. Cambiar presentación jamás modifica balances ni ledger.

El editor incorpora Saldo extra y una simulación reversible Antes/Costo/Queda para Apple y Google, dentro de Probar avance y canjes, contraído al entrar. No crea compras, reservas ni canjes. Después de un canje muestra el saldo restante, incluso si alcanza para otro; el botón no permite encadenar operaciones ficticias. Cambiar promoción, ejemplo o porcentaje reinicia la simulación. Cambiar apariencia conserva el saldo mostrado. Deshacer, guardado versionado, bloqueo de tareas y conflictos mantienen su comportamiento. Excluir todo estado simulado de WalletDesign y localStorage. Desactivar simulación cuando no haya meta entera segura o la tarjeta esté pausada.

Gate del Mac: 233 pruebas unitarias/HTTP + 206 PostgreSQL (439), 128 Python, Docker y 88 controles gateway antes de auto commit local, sin push. wallet-redemption.dom.cjs y wallet-redemption.spec.cjs cubren cálculo, aislamiento, reinicios, teclado, saldo sobrante y anchos 320/390/1024/1440 con datos ficticios. No confundir pruebas de navegador con recepción en iPhone/Android. HTTPS y conexión de tarjetas existentes se informan por separado.

## Premio al frente v035

WalletDesign.featuredRewardId es opcional y requiere featuredProgramId válido del mismo negocio. Validar UUID, propiedad y correspondencia con la promoción antes de guardar. La elección persiste por versión y no cambia costos, reglas, balances ni la autorización de canjes. Los premios inactivos pueden conservarse como preferencia; nunca se incluyen como activos en el snapshot. Ante ausencia, el frente vuelve al premio activo de menor costo dentro de la promoción. Al reactivarlo se recupera la elección. Una promoción pausada o eliminada sigue excluida.

Apple clásico/póster, Google, WalletJourney y las imágenes usan el mismo premio y su meta, con aritmética entera. Mantener la elección dentro de los veinte premios del snapshot, priorizando primero el premio elegido y luego su promoción. Los demás premios conservan sus detalles hasta los límites nativos; no sumar saldos entre programas. Mantener presentationVersion=34 y rutas v32; la selección automática sin preferencia conserva la presentación anterior. Guardar incrementa designVersion y adelanta el escaneo existente de ambas Wallet. V001–V009 no cambian.

El editor ofrece Premio al frente en Promoción y textos, muestra nombre, meta y condiciones del premio elegido y permite volver a Automático. Filtrar opciones por promoción y premios activos. Si la promoción era automática, elegir un premio fija su promoción explícitamente. Cambiar de promoción limpia la elección; cambiar promoción o premio reinicia la simulación. Cambios de apariencia y plataforma mantienen el objetivo. Conservar preferencias pausadas como no disponibles, mostrar el respaldo activo y permitir editar o restaurar el borrador sin eliminar la preferencia silenciosamente. Los campos se comparan en la revisión y Restaurar reconstruye las opciones de la promoción guardada. Escapar nombres; el simulador nunca se persiste.

Gate del Mac: 241 unitarias/HTTP + 211 PostgreSQL (452), 128 Python, Docker y 88 comprobaciones gateway antes del auto commit local; sin push. wallet-featured-reward.dom.cjs y wallet-featured-reward.spec.cjs cubren selección, respaldo, pausa, meta, canje simulado, aislamiento, guardado, conflictos, restauración, teclado y anchos 320/390/1024/1440. HTTPS y recepción en iPhone/Android siguen siendo comprobaciones separadas; nunca renovar túneles automáticamente.

## Experiencia integral v036

La revisión de compra devuelve el cálculo por promoción seleccionada: importe elegible pagado, acumulación exacta y causa cuando no aplica. Quote y escritura usan Program.explainReceipt. Revisar no crea compras, canjes, ledger ni auditoría. expectedEarningReview opcional valida cliente/revisión, entradas normalizadas, versión de las promociones y resultados del cálculo en el momento de guardar; una divergencia devuelve 409 y no registra la operación. Conservar la idempotencia de peticiones históricas omitiendo el campo nuevo cuando es null. Una reserva que caduca durante la confirmación se libera después de validar la revisión de compras nuevas, dentro de la misma transacción; no provocar un ciclo de revisión imposible ni cambiar el flujo anterior de clientes sin ese campo.

Caja conserva la selección explícita y empieza sin promociones marcadas. Ambas interfaces muestran el desglose del servidor; no calcular beneficios en JavaScript. Los montos escritos se convierten a centavos enteros sin redondear fracciones de centavo. Añadir/quitar productos conserva el texto en edición, incluso un precio incompleto. Los borradores de compras y promociones quedan solo en memoria y requieren aviso al navegar o recargar. Reintentos tras error conservan los datos y la clave de operación. La reserva/canje y consentimiento siguen siendo explícitos.

El catálogo de promociones reúne reglas, fechas, horarios locales, sucursales, categorías, bonos y metas. Ofrece búsqueda sin tildes por nombre/premio/producto/sucursal y filtros por estado y acumulación. Habilitada no equivale a vigente: mostrar Programada, Finalizada y Fuera de horario por separado. Mantener edición de metas, pausa y eliminación con sus revisiones de impacto. El resumen usa datos reales del período, lista pendientes y acceso directo a su resolución; comprobar respuestas tardías y cambio de sesión. No presentar completar la configuración como comprobación de teléfonos o lanzamiento a producción.

WalletDesign.automaticPriority admite ORDER (compatible por defecto) y PROGRESS (opcional). PROGRESS ordena promociones por la proporción disponible/meta de su premio activo de menor costo; primero las que alcanzan un premio, empates estables. No comparar costos absolutos ni sumar unidades entre programas. featuredProgramId/featuredRewardId explícitos siempre tienen prioridad. Apple, Google y WalletJourney comparten la selección, incluso con más de veinte premios en el negocio. Una tarjeta pausada no invita a canjear. Guardado versionado encola el mismo pase en ambos proveedores; preservar identidad, QR, tokens, saldos, presentationVersion=34 y arte v32. La vista previa usa datos ficticios y explica la elección por cliente.

Informes añade lectura del período y cobertura de compras con productos usando detailedPurchases calculado en el mismo snapshot y negocio. No llamar nuevos clientes a compradores de una sola compra en ese intervalo ni confundir repetición con retención. No inferir ventas fuera de las registradas.

Gate del Mac: 256 unitarias/HTTP + 222 PostgreSQL (478), 128 Python, Docker y 88 comprobaciones gateway antes del auto commit local, sin push. integral-experience.spec.cjs usa datos ficticios y red interceptada en 320/390/1024/1440; cubre revisión de beneficios, conflicto, borradores, catálogo, resumen, informes y guardado explícito de prioridad. Mantener regresión de caja, metas y estudio de tarjetas. HTTPS y recepción en iPhone/Android se verifican por separado; no renovar túneles automáticamente. V001–V009 inmutables.

## Administración, equipo y actividad v037

V010 añade nombres, contacto, revisión y baja definitiva a staff_tokens y atribución histórica en compras, canjes y auditoría. No modificar V001–V009. Las credenciales anteriores conservan su hash; no generar credenciales de reemplazo durante la migración. La baja es de acceso, no de historial. Reactivar y renovar generan una credencial nueva y conservan id; archivar es definitivo. El alta admite requestId con huella semántica sin almacenar la credencial para replay.

Todo cambio de equipo se serializa por business_access FOR UPDATE y compara expectedVersion. Las operaciones autorizadas toman primero negocio FOR SHARE y revalidan id, rol, sucursal, revisión y estado antes de mutar o devolver una repetición idempotente. Mantener orden negocio → miembro → pase. Impedir baja propia, cambio de alcance propio y retirada del último dueño activo. No permitir actores de otro negocio. OWNER administra todas las sucursales; CASHIER requiere una sucursal del mismo negocio. El administrador usa su autenticación propia y nunca un token del dueño.

Los informes de plataforma y actividad son de lectura, con snapshots consistentes y consultas acotadas. Separar montos por moneda. Llamar inscripciones a la suma de registros entre negocios, no personas únicas. Capturar actor_name al registrar nuevas operaciones; nunca actualizar eventos antiguos al renombrar un usuario. Para eventos anteriores a V010, indicar que el nombre es el actual. Las fichas de clientes de plataforma no incluyen cardCode. Los períodos respetan zona horaria y la actividad conserva asOf en la paginación. El historial y las rutas de equipo permanecen privados tras el gateway.

La UI muestra credenciales una sola vez, evita localStorage, documenta motivos y confirma bajas/rotaciones. Un conflicto preserva el formulario. Ignorar respuestas tardías de vistas o sesiones anteriores. Navegación de equipo y actividad solo para dueños; los permisos se verifican también en el servidor.

Gate: 260 unitarias/HTTP + 240 PostgreSQL = 500; 128 Python, Docker y 97 comprobaciones gateway antes del auto commit. management.spec.cjs cubre CRUD, ramas, credenciales, conflictos, historial, plataforma, fichas y móvil con datos ficticios. Conservar la regresión de caja e informes. HTTPS y validación física de Apple/Google se informan aparte.

## Operación, permisos y exportación v038

V011 añade allow_purchases y allow_rewards a staff_tokens, ambos true por compatibilidad. V001–V010 son inmutables. Mantener hash, id y revisión de los accesos existentes. OWNER conserva ambos permisos; CASHIER necesita al menos uno y una sucursal. Una compra que incluye premio requiere ambos. Confirmación reservada, entrega directa, compra y quote verifican permisos en el servidor; la UI no es autorización. Revalidar permisos/revisión bajo el bloqueo de negocio antes de mutar o devolver replay idempotente. Omitir permissions al editar conserva los permisos de Caja; ascender a Dueño habilita ambos. Conservar huellas de altas históricas con permisos completos.

Operación y equipo es de lectura para dueño y administrador autenticados, aislado por negocio y snapshot. Los filtros afectan resumen, evolución, horas, premios, desglose e historial. Mantener fechas locales, intervalo de hasta 366 días, corte asOf, comparación con días completos anteriores y días vacíos en cero. Compras y entregas son hechos independientes: no multiplicar dinero con joins. No llamar retención al conteo de compradores en días distintos ni inferir productividad. No sumar compradores de empleados/sucursales. Explicar límites de listas y cobertura de productos.

Activity CSV reutiliza la consulta autorizada con todos los filtros y corte, exporta todas las páginas hasta 10.000 registros y rechaza excesos con 422; nunca truncar silenciosamente. Importes decimales exactos, UTF-8, celdas protegidas contra fórmulas y comillas escapadas. Excluir tokens, QR y cédulas. Las cuatro rutas nuevas de operaciones/exportación permanecen privadas tras el gateway. Los clientes administrativos no reciben credenciales de dueños ni tokens de cliente.

La interfaz conserva permisos tras errores, oculta acciones no autorizadas, rechaza respuestas tardías y usa memoria de sesión. Un cambio de permisos invalida el contexto anterior, incluida una operación pendiente. Ambos roles de administración disponen del informe con acceso a comprobantes filtrados. No guardar credenciales o historial en localStorage. Se mantienen las identidades y el diseño actual de Apple y Google; no declarar validación física de Wallet por pruebas de informes.

Gate: 268 unitarias/HTTP + 260 PostgreSQL = 528; 128 Python, Docker y 101 comprobaciones gateway antes del auto commit. operations.spec.cjs cubre permisos, fechas, filtros, gráficos, historial, CSV, reintento y móvil en 320/390/1024/1440 px; conservar management.spec.cjs y counter-rewards.spec.cjs. El instalador debe verificarse con código original, reformateado y segunda ejecución, sin escrituras parciales ante conflictos. HTTPS se informa aparte, sin renovación automática. Guía: docs/operacion-permisos-v038.md.

## Centro de tarjetas y reintentos v039

V012 añade last_success_at y last_manual_retry_at por proveedor e índice de registros Apple por serial. No modificar V001–V011 ni inventar fechas históricas. Mantener saldos, seriales, identificadores, tokens, QR, registros, presentationVersion=34 y arte v32.

Estado de tarjetas es privado del dueño y administrador, aislado por negocio. Consultar con REPEATABLE READ READ ONLY, sin llamadas externas, escrituras, desencriptado, códigos QR, cédulas ni tokens. Dos filas posibles por cliente (Apple/Google), no personas únicas ni instalaciones. Hasta 25 registros por página, búsqueda literal por nombre, filtros acotados y orden estable; totales con los mismos filtros. Distinguir sin preparar, falta de configuración, Apple sin registro, error/reintento, actualización pendiente y solicitud procesada. No inferir recepción en el teléfono, instalación ni disponibilidad HTTPS.

Reintento explícito por cliente y proveedor: dueño vigente o administrador, Idempotency-Key, expectedTag, motivo documentado, intervalo mínimo de 60 segundos por proveedor. Autorización vigente antes de replay; bloqueo negocio → miembro → pase → entrega. Encolar la misma identidad sin llamar proveedores, regenerar secretos ni cambiar contenido financiero. El worker mantiene la actualización automática. Un resultado tardío de éxito o fallo usa wake_revision; no debe consumir ni retrasar un despertar nuevo. No enviar campañas ni mensajes de marketing como efecto del reintento. Apple necesita conexión registrada; la recuperación existente sigue exigiendo verificación del titular.

UI Navy compartida entre dueño y plataforma, acceso directo a ficha y recuperación para dueño, códigos de soporte saneados, historial con responsable/motivo. Mantener motivo y clave tras error; descartar respuestas tardías o de otra sesión; no almacenar credenciales ni datos de clientes en el navegador. El administrador consulta por negocio con su propia credencial.

Gate del Mac: 272 unitarias/HTTP + 278 PostgreSQL = 550; 128 Python, Docker local y 105 comprobaciones gateway antes del commit local, sin push. wallet-health.spec.cjs verifica dueño, plataforma, filtros, reintento, claves, errores, aislamiento, HTML y 320/390/1024/1440 px. Mantener regresión de operaciones, equipo y caja. HTTPS se informa aparte; nunca renovar túneles automáticamente. Una solicitud procesada no equivale a APPLE_DEVICE_VALIDATION ni GOOGLE_DEVICE_VALIDATION.

## Administración integral v040

V013 añade version y updated_at a branches. V001–V012 son inmutables. Conservar identidades de negocio, sucursal, personal, tarjetas, saldos, seriales, tokens, QR, presentationVersion=34 y arte v32. El cambio es del panel de administración, sin cambios de diseño nativo ni notificaciones.

El centro de Administración y el directorio de sucursales son privados del dueño vigente y administrador de plataforma. Usan REPEATABLE READ READ ONLY y revalidan el acceso. El centro informa ficha, solicitudes, equipo y cuenta emitida; nunca sincroniza cargos, envía mensajes ni consulta proveedores. No confundir acceso activo con personal conectado ni configuración disponible con Wallet verificada. El saldo pendiente incluye solo cargos ya emitidos.

El directorio consulta 25 sucursales por página, búsqueda literal sin tildes, orden estable y métricas de los últimos 30 días locales, incluido hoy. Compras, pagos y canjes se agregan independientemente para evitar multiplicación por joins; premios solo CONSUMED. Crear/editar es idempotente por actor. Revalidar acceso bajo el bloqueo del negocio antes de replay; después bloquear sucursal. Crear exige negocio activo. Editar nombre/código exige expectedVersion, motivo y auditoría antes/después; no cambia tenant, id ni relaciones. La corrección de etiquetas sigue disponible si la operación está suspendida. Código único dentro del negocio; nombres históricos de responsables permanecen inmutables. Las listas muestran el nombre actual de la sucursal.

El dueño consulta identidad fiscal, categoría y ubicación como datos protegidos; contacto, web y redes son editables. Conservar category al enviar un formulario con el selector deshabilitado. Guardado, revisión, restauración y solicitudes de corrección mantienen borradores en memoria. Cancelar, navegar y salir requieren decidir sobre borradores; un cambio de negocio/sesión retira diálogos y respuestas tardías. Un formulario en guardado bloquea la salida. Nunca guardar credenciales ni datos personales en localStorage/sessionStorage.

Equipo conserva filtros de nombre, estado, sucursal, rol, permiso y orden después de editar. Los presets de permisos solo rellenan el editor; guardar sigue siendo explícito y el servidor autoriza. La baja elimina acceso, no auditoría. Una credencial se muestra una sola vez, con comprobación de sesión. Actividad distingue antes/después, conserva filtros y permite copiar comprobantes. Operación e Informes enlazan con el historial del día y la sucursal, respetando el período y negocio.

Mi cuenta diferencia cargos y pagos, fechas de vencimiento y programación. Buscar/filtrar/exportar afecta únicamente a los registros de la página cargada; indicarlo junto al control. No llamar completa a esa exportación. Mantener exportación completa de Actividad (hasta 10.000 registros, error explícito si excede), importes exactos y protección CSV contra fórmulas. Los pagos administrativos no debitan tarjetas bancarias.

Gate del Mac: 276 unitarias/HTTP + 294 PostgreSQL = 570; 128 Python, Docker local y 113 comprobaciones gateway antes del commit automático local, sin push. Ocho comprobaciones nuevas rechazan las rutas administrativas en el gateway. administration.spec.cjs cubre los siete destinos, filtros, CRUD de sucursales, conflictos, idempotencia, formularios, cuenta, CSV, historial, plataforma, sesión y 320/390/1024/1440 px. Mantener regresiones de equipo, operación, ficha, registro, categorías, caja y centro Wallet. El instalador se prueba con código original, reformateo, orden de imports, segunda ejecución y conflicto sin escrituras parciales. HTTPS y teléfonos se informan por separado, sin renovación automática del túnel. Guía: docs/administracion-v040.md.


## Organización y portal Lúmina v041

Los paquetes Kotlin viven debajo de `com.premierdarkcoffee.loyalty`: application, access, businesses, fidelity, wallet, marketing, billing, analytics, shared e infrastructure. Wallet separa providers, presentation y artwork. Las pruebas usan los mismos subpaquetes; checkpoint.SUITES conserva las 570 pruebas existentes con sus FQN actualizados.

El portal Lúmina conserva su motor Node y SQLite actuales. Su código está en src/main/resources/com/premierdarkcoffee/loyalty/lumina, por módulos, y sus pruebas en src/test/resources con el mismo namespace. No presentar JavaScript como código Kotlin. lumina-agency/src/server.mjs es únicamente un lanzador compatible. Los datos continúan en ~/.lumina-digital/agency o LUMINA_DATA_DIR; nunca inicializar otra base por reorganizar fuentes.

Las rutas HTTP, identidades Wallet, secretos, archivos SQL y presentationVersion=34 se conservan. application.yaml y las clases JVM de entrada antiguas siguen funcionando. Los recursos internos se organizan por namespace sin cambiar URLs públicas.

Wallet usa una credencial de Loyalty existente, guardada solo en memoria durante la sesión autenticada de Lúmina. El dueño únicamente accede al tenant vinculado, y cada operación revalida esa pertenencia. El administrador de agencia necesita la credencial de plataforma. Los permisos WALLET.VIEW/REQUEST de colaborador son de servicios; no conceden acceso de dueño ni plataforma. Caja mantiene su delegación y sucursal propias. Las escrituras del espacio Wallet requieren sesión, origen y CSRF; el proxy usa una lista cerrada de rutas y métodos.

El checkpoint ejecuta además las 17 pruebas HTTP de Lúmina antes de Kotlin y PostgreSQL. No crear commit si falla cualquiera. La revisión visual en navegador y la recepción de tarjetas en dispositivos se informan separadas. No renovar túneles, claves, seriales ni identificadores por esta actualización.


## Corrección de imports v041r1

`WalletHttp` es una interfaz funcional. Su método `send` no es una declaración de paquete ni se importa desde `wallet.providers`. La revisión v041r1 retira ese import inválido de CustomerWorkspace, BusinessProfiles, WalletService y ManagementPostgresTest. No cambia cuerpos Kotlin, contratos HTTP, esquemas ni identidades Wallet. Mantener las 570 pruebas y todos los gates; un fallo de compileKotlin no constituye un fallo de Wallet ni permite omitir compileTestKotlin.


## Contenido compartido y acceso único v042

Esta revisión reemplaza el modelo de cuatro áreas sociales y el acceso Wallet en memoria de v041. Usar SOCIAL para la ficha común y request_platforms/publications/social_metrics para destinos, enlaces y mediciones. No duplicar piezas ni consumir cupos por red. Conservar permisos heredados por plataforma sin ampliarlos; aplicar autorización de solicitud y publicación en el servidor. Marca es ONE_OFF. WhatsApp Business/IA es Próximamente y no admite órdenes.

Wallet usa la misma cuenta de Lúmina. No pedir credenciales al dueño ni al colaborador para cada módulo o al configurar Caja. El backend obtiene su configuración privada existente y conserva una asociación explícita por tenant. El puente valida sesión, pertenencia y permisos en cada solicitud. Los accesos internos se cifran con la clave existente; nunca exponerlos al cliente. Un acceso revocado queda bloqueado hasta reparación explícita y auditada de la agencia. Conservar las identidades de tarjetas Apple/Google.

SQLite v2 se aplica con migración nueva y respaldo privado coherente de v1; no modificar schema.sql original. Después de migrar no arrancar código v1 sin una recuperación explícita de código/datos. El checkpoint exige 30 contratos Lúmina además de las 570 Kotlin/PostgreSQL, 128 Python y gates locales. Guía: docs/lumina-contenido-acceso-unico-v042.md.


## Reparación de arranque v042r1

La credencial de plataforma es opaca: usar el contrato de staging.read_config, base64url de 32 a 128 caracteres. init_config genera 36 bytes, que producen 48 caracteres; no aplicar el tamaño de 43 de las sesiones o de los empleados creados por Kotlin a esta credencial. Conservar el valor original, los controles de permisos y el destino privado. La corrección no modifica .env, claves, tarjetas ni esquemas.

El gate del portal ahora requiere 32 pruebas completas. Las nuevas pruebas arrancan el lanzador real en otro proceso con un .env generado por staging.init_config y comprueban salud, sesión persistente y acceso autenticado de plataforma. Una configuración inválida falla antes de crear/migrar SQLite. El instalador comprueba la configuración existente con el lector corregido antes de aplicar archivos y ejecutar el checkpoint. Mantener todos los gates existentes para el commit local, sin push.


## Solicitudes sin plataforma v043

Solicitar contenido y el video de cortesía no requiere ni muestra destinos sociales. Las solicitudes nuevas usan SOCIAL y no crean request_platforms, incluso si reciben casillas antiguas. No asignar las cuatro redes implícitamente. La cortesía es un video común, único por negocio, sin consumo de plan. El área general de contenido no tiene filtros por red.

Elegir la plataforma únicamente al registrar la publicación de una pieza aprobada o consultar sus métricas. Se admite cualquier red social válida sin un paso previo de añadir destinos. Cada publicación conserva enlace, fecha y mediciones; múltiples publicaciones no crean piezas ni consumen más cupos. Retirar POST /plataformas.

Conservar request_platforms históricos y sus límites de acceso, publicaciones, métricas, evidencias y permisos sin alterar el esquema SQLite v2. Para solicitudes nuevas comunes, un permiso social VIEW/REQUEST permite consultar/solicitar; aprobar la pieza completa requiere SOCIAL.APPROVE. La lectura de publicaciones y métricas mantiene el filtro por plataforma autorizado. Toda autorización sigue en el servidor y dentro del negocio.

Exigir 36 pruebas completas del portal, además de los gates de Kotlin, PostgreSQL, Python, Docker y gateway antes del commit local. Mantener la reparación de arranque v042r1 y el acceso único de Wallet. No modificar claves, vínculos, SQL, URLs públicas ni identidades Apple/Google. Guía: docs/lumina-solicitudes-sin-red-v043.md.


## Registro integrado y Wallet automática v044

Al registrar un negocio en Lúmina, el servidor prepara un tenant propio y una sucursal Principal con los datos conocidos. No exigir asociación manual, credencial Loyalty ni aprobación administrativa para Wallet y equipo. La validación comercial del registro sigue siendo independiente de la activación del espacio. Los permisos de colaboradores siguen siendo explícitos por área y sucursal.

POST /api/platform/lumina/businesses es privado de plataforma e idempotente por UUID de company. V014 añade su relación persistente y contacto. La transacción y el bloqueo resuelven reintentos/concurrencia sin duplicar tenant. No inventar RUC, actividad, ubicación, promociones, clientes ni saldos. No buscar coincidencias por nombre, cédula o RUC para asociar demos. Mantener intactos los vínculos previos. Ante caída del motor, conservar la cuenta y reintentar al abrir Wallet.

SQLite v3 cambia wallet_access a clave compuesta cuenta+negocio para permitir acceso separado de la agencia a cada cliente. Respaldar de forma privada antes de migrar y copiar ciphertext, staff_id, request_id y estado sin rotarlos. Mantener las claves existentes. El contexto elegido se valida en cada operación y pertenece a la agencia o al negocio autenticado; no guardarlo como selección global de sesión. El QR queda limitado al mismo negocio. La interfaz de personal se administra desde Lúmina; el proxy no expone emisión de credenciales al navegador.

El recorrido normal no abre el panel nativo de plataforma ni el archivo de credenciales demo. access.html se reemplaza por un enlace a Lúmina sin secretos; la actualización conserva los datos de prueba históricos que puedan tener tarjetas. Los endpoints públicos de tarjetas siguen funcionando sin cambios. V001–V013, SQLite schema.sql/002, claves, túneles, seriales, Google class/object IDs, tokens, QR, saldos y presentationVersion=34 permanecen intactos.

Gate Mac: 43 contratos portal, 280 unitarias/HTTP + 300 PostgreSQL = 580, 128 Python, Docker y 114 rutas gateway antes de commit local; sin push. Compilación nativa, validación visual y teléfonos se informan por separado. Guía: docs/lumina-wallet-automatica-v044.md.


## Corrección de expectativas PostgreSQL v044r1

La evidencia de v044 confirmó 280 unitarias aprobadas, 294/300 PostgreSQL aprobadas y las seis pruebas nuevas de LuminaRegistrationPostgresTest aprobadas. Seis pruebas heredadas todavía esperaban 13 filas en comeback_migrations aunque V014 ya se aplica correctamente.

Actualizar solo la expectativa a 14 (14L para getLong) en ManagementPostgresTest, OperationsPostgresTest, CommercialPostgresTest, PromotionLifecyclePostgresTest, EngagementPostgresTest y WalletFirstPostgresTest. No eliminar aserciones, saltar pruebas, reducir conteos ni cambiar migraciones para satisfacer una expectativa antigua. Conservar todas las comprobaciones posteriores de credenciales, permisos, datos, promociones y saldos. Buscar referencias a comeback_migrations en todos los paquetes de pruebas cuando se añada una migración; no limitar la búsqueda a businesses.

La revisión no cambia código de producción ni SQL respecto de v044. El instalador es acumulativo y admite el estado anterior restaurado por el fallo. Mantener los 580 casos nativos, 43 del portal, 128 Python y gates Docker/gateway antes del commit local. El resultado previo no constituye un PASS completo.

## Contenido y contrataciones combinadas v045

Contenido tiene módulo propio en lumina/content con vistas de resumen, solicitudes, producción, revisión, entregas, publicaciones, métricas y agenda. Reutiliza production y analytics; no duplica piezas, cupos ni autenticación. Aplicar requestAccessSql y filtro de plataformas también a conteos y paginación. Solicitud/cortesía sin redes; plataforma solo en publicación/métrica. Consultas de 20 filas con conteos completos y permisos vigentes.

Paquetes y servicios reemplaza la terminología ambigua de membresías/suscripciones en el catálogo. Oferta individual o combinada, MONTHLY o ONE_OFF, selección conjunta y cantidad por oferta. Precios en centavos, totales separados mensual/puntual; null es por cotizar, nunca cero. Propuesta con precio y fechas por línea, aceptación expresa de versión actual y activación conjunta transaccional/idempotente. No hay cobros bancarios, envíos de correo ni renovaciones automáticas. Preservar propuestas retiradas, contratos anteriores, cuotas y auditoría. Una pieza en cuatro redes consume un cupo.

Renovación manual de cada período mensual, con día de corte anclado, sin acumulación automática de cupos. No duplicar siguiente período ni alterar contratos aceptados. Cancelar propuesta pendiente o acuerdo activo conserva historial y no cambia otras contrataciones. Wallet incluido/de cortesía es servicio comercial de configuración/gestión, no activación ni recreación de tenant o tarjetas.

SQLite v4 se aplica con 004_packages.sql nueva y respaldo privado coherente. schema.sql, 002, 003 y PostgreSQL V001–V014 son inmutables. Contratos anteriores reciben units=1 y conservan sus valores. Mantener agency.key, datos, ciphertext, vínculos, identidad Apple/Google y URLs públicas. Código anterior a v4 requiere recuperación explícita coherente; el instalador no borra ni restaura automáticamente datos reales.

Gate: 56 pruebas del portal en nueve suites, 128 Python, 280 unitarias/HTTP + 300 PostgreSQL, Docker y 114 comprobaciones gateway antes del commit local; sin push. Revisión visual, HTTPS y teléfonos se reportan por separado. Guía: docs/lumina-contenido-paquetes-v045.md.


## Lúmina v007 / Loyalty v046 — identidad y Contenido

Las instrucciones de esta sección sustituyen los permisos administrativos de Wallet descritos en versiones anteriores.

- La agencia no representa al dueño: nunca puede crear solicitudes, reclamar cortesía, seleccionar paquetes, renovar, aceptar propuestas o aprobar entregables del negocio. Los permisos genéricos de agencia solo conceden VIEW.
- La consulta de un negocio es de solo lectura en la interfaz y en el servidor. Las tareas de producción/cotización propias de Lúmina se abren explícitamente en /agencia/... y conservan al actor AGENCY en auditoría. El prefijo no concede acciones del cliente.
- AGENCY nunca se convierte en OWNER ni recibe una credencial nativa de dueño. Wallet de agencia solo lee el tenant seleccionado mediante endpoints GET limitados; no provisiona ni repara accesos. Las credenciales anteriores de agencia permanecen inertes. No alterar conexiones, claves ni identidades de clientes.
- El dueño puede reparar accesos internos bloqueados de su mismo negocio, con confirmación y motivo; ningún colaborador o agencia puede hacerlo.
- Contenido usa content-shell.mjs y content.css, una interfaz propia con Volver a Lúmina y sesión compartida. No devolver sus fichas sociales al menú general.
- La solicitud de contenido muestra exclusivamente Video, Fotografías y Diseño para redes. Cortesía sin formatos ni plataformas. Conservar formatos y contratos históricos; cupo compatible elegido expresamente al producir.
- La Terminal del instalador/checkpoint imprime únicamente RESULTADO=... una vez. Detalles en evidencia; log de arranque privado y excluido del ZIP. No inferir PASS de reportes ausentes ni omitir gates para silenciar salida.
- Gate del portal: diez suites, al menos 68 pruebas sin omisiones. Gate Python: al menos 130. Se mantienen 580 casos nativos y 114 checks del gateway. Commit local solo tras PASS completo; nunca push.
- Ver docs/lumina-contenido-accesos-v046.md. No cambiar migraciones SQLite/PostgreSQL ni archivos privados por esta actualización.


## Lúmina v008 / Loyalty v047 — recorrido del cliente

- `/wallet` abre directamente el módulo operativo para el dueño, o la primera sección autorizada del colaborador. Caja sin otras áreas abre `/caja`. La agencia mantiene su consulta de solo lectura. No mostrar una página de presentación antes del módulo.
- Volver a Lúmina regresa a `/inicio`. Recuperación de accesos bloqueados disponible en `/wallet/accesos` desde Equipo, solo para el dueño. Un error al abrir Wallet muestra reintento y reparación explícita; nunca reinicia claves, vínculos o tarjetas.
- Contenido conserva su módulo propio y comparte estilos de navegación con el portal en `experience.css`. Los selectores de la barra lateral deben estar acotados; no ocultar la navegación interior de las páginas en móvil.
- Catálogo con individuales, paquetes, mensual y pago único. Cantidades combinables. Cada precio procede de una oferta publicada; no sembrar tarifas comerciales ficticias. `null` significa por cotizar, no gratis. Precio promedio por unidad solo como referencia aproximada en paquetes de un único servicio; nunca repartir arbitrariamente el precio de un paquete mixto.
- Publicación individual guarda exactamente una unidad del servicio. Una nueva tarifa crea una oferta nueva; no reescribir propuestas ni acuerdos históricos. Marca sigue siendo ONE_OFF. Wallet de cortesía describe trabajo comercial, no activación del tenant.
- Solicitud guiada por servicio, tres formatos sociales, sin redes. Precio y cupos solo para dueño, sin filtrar contratos al colaborador. Error de validación conserva campos escapados. Búsqueda/estado se aplican antes de paginación y dentro de permisos/negocio.
- Gate: once suites del portal, al menos 80 pruebas sin omisiones; 130 Python; 580 nativas; Docker y 114 comprobaciones gateway. Commit local solo con PASS completo, sin push. Terminal: una línea RESULTADO.
- `scripts/ui/lumina-experience.spec.mjs` verifica 320/390/1024/1440 px, filtros, selección combinada, formularios y menú con datos ficticios. No equiparar pruebas HTTP con revisión visual real. Informar navegador/dispositivos por separado.
- SQLite v4 y todas las migraciones se conservan. Guía: `docs/lumina-experiencia-v047.md`.

## Lúmina v009 / Loyalty v048 — catálogo y administración central

- Lúmina es la única superficie de contratación. Wallet conserva operaciones, clientes, promociones, premios, tarjetas, radar y QR. Cuenta, sucursales, datos, actividad, informes y equipo se gestionan desde Lúmina con la misma sesión.
- El dueño recibe una lista explícita de secciones operativas, nunca `null` como permiso total. Enlaces históricos de administración redirigen a `/gestion`, `/equipo` o `/planes`; la API Wallet rechaza esas operaciones. `/gestion-api` tiene su propia lista permitida y revalida dueño/negocio/sesión. La agencia no representa al dueño. Colaboradores de informes solo leen métricas autorizadas.
- Los formularios nativos de ficha/sucursales e informes se integran en páginas de Lúmina, conservando validaciones, versión, idempotencia y protección de borradores. El contenido interno solo admite marcos del mismo origen. El equipo se administra exclusivamente desde `/equipo`.
- Crear oferta: Servicios → Precio → Revisión. Cinco áreas con ocho servicios esenciales. Individual o paquete se deduce de cantidades; un solo precio por oferta; mensual o trabajo puntual. Marca es puntual. Web y Maps detallan sus variantes en el alcance. No inventar precios ni convertir por cotizar en cero.
- Solo la nueva publicación SIMPLE usa este vocabulario; servicios y contratos históricos se conservan. Wallet de cortesía requiere otro servicio y no activa, duplica, rota ni recrea vínculos. Nueva tarifa crea nueva oferta.
- Retirar `/planes/activar`: responde 410. Toda nueva activación procede de una propuesta aceptada por el dueño y su versión actual. Conservar propuestas, períodos, cancelaciones independientes, auditoría y cupos. No añadir renovación o cobro bancario automático.
- Cargos y programaciones anteriores de Wallet se consultan en `/gestion/historial` identificados como históricos; nunca borrarlos, cancelarlos ni convertirlos silenciosamente en un contrato nuevo. La contratación actual se abre desde `/planes`.
- Logos originales en assets propios, sin modificar sus bytes. No usar esos logos para reemplazar la identidad de las tarjetas de clientes.
- El instalador imprime RESULTADO una vez. Con `--iniciar` y disponibilidad comprobada imprime también `Lúmina Digital disponible en http://127.0.0.1:8099` (o el puerto configurado), antes de mantener el proceso abierto. Detalles y código inicial permanecen en el registro privado; nunca incluir secretos en evidencia.
- Exigir doce suites / 92 pruebas HTTP del portal, 130 Python, 580 nativas, Docker y 114 verificaciones gateway antes de commit local. Sin push. Pruebas DOM de interacción en `scripts/ui/lumina-management.dom.mjs`; no equivalen a revisión visual del navegador ni a dispositivos Wallet.
- Sin cambios de SQL, esquema, Kotlin, motor nativo Wallet, claves, HTTPS, seriales, emisor o IDs de tarjetas. Guía: `docs/lumina-gestion-v048.md`.


## Lúmina v010 / Loyalty v049 — sencillez y contacto

- El inicio del negocio muestra módulos directos, pendientes de revisión/cotización/propuestas y la próxima visita. Todas las consultas se limitan al negocio, sus permisos y los destinos sociales históricos. Solo se anuncian aprobaciones que la persona puede realizar. La agencia mantiene su identidad y consulta; nunca solicita ni aprueba como cliente.
- Solicitudes nuevas: tres opciones sociales, proyecto o mantenimiento web y una opción común para Maps, Marca y Wallet. Cantidad y tipo de solicitud son opciones adicionales; por defecto una pieza. Conservar servicios históricos y borradores ante errores. Plataformas únicamente al publicar/medir.
- Pedir teléfono en solicitudes, cortesía, grabación y combinación de paquetes, precargado desde el negocio y editable. Guardar el contacto de esa solicitud sin actualizar silenciosamente la ficha. Validación del servidor; no crear registros parciales. Formularios anteriores sin campo usan el contacto registrado por compatibilidad. No modificar el contacto original en replays idempotentes.
- SQLite v5 añade exclusivamente contact_phone nullable en requests y package_orders mediante 005_request_contact.sql. Preservar SQL anteriores, respaldar coherentemente antes de migrar y no inventar teléfonos históricos. Un código anterior a v5 no debe abrir esa base; cualquier recuperación requiere código y datos coherentes. No modificar claves, vínculos, tablas Wallet, Kotlin, PostgreSQL ni identidades de tarjetas.
- Mismo ancho de barra lateral en Lúmina, Contenido y Wallet: 244 px, 220 px hasta 1150 y navegación móvil hasta 760. Filas de 48 px, texto de 14 px e iconos de 21 px. practical.css está limitado a las superficies de Lúmina; no modifica pases, branding de clientes ni el motor nativo. Contenido conserva su módulo y Volver a Lúmina.
- Menú móvil con cierre explícito, fondo, Escape y foco contenido. No robar foco al pulsar Escape con el menú cerrado. Revelar detalles antes de enfocar campos inválidos. Sin datos personales en localStorage/sessionStorage.
- Catálogo con filtros opcionales y selección conservada al filtrar. Mostrar solo modalidades seleccionadas; importes por cotizar nunca son gratis ni un total final. Teléfono y selección se conservan tras errores. Contrataciones siempre en Lúmina y con aceptación de versión.
- Redes oficiales indicadas por el usuario: Instagram https://www.instagram.com/luminadigital360/ y TikTok https://www.tiktok.com/@luminadigital360. Iconos suministrados en assets locales; ninguna petición a redes hasta que el usuario abre el enlace.
- Gates: 13 suites / 106 pruebas HTTP sin omisiones, 130 Python, 580 nativas, Docker local y 114 comprobaciones gateway antes del commit local, sin push. Interacción DOM en lumina-practical.dom.mjs y lumina-management.dom.mjs. Navegador y teléfonos requieren evidencia propia.
- La Terminal mantiene una sola línea RESULTADO; con --iniciar imprime además la dirección después de confirmar disponibilidad. Detalles y código inicial solo en el registro privado. Guía: docs/lumina-sencilla-v049.md.

## Lúmina v011 / Loyalty v050 — equipo y revisión de flujos

- Equipo pertenece exclusivamente al dueño. Directorio paginado por empresa; filtros antes de paginar; estados de activación separados de permisos asignados. Crear persona en `/equipo/nuevo`; conservar rutas POST compatibles, con revisión obligatoria en cambios.
- `access/team-policy.mjs` es la definición de permisos, dependencias y bases de acceso. No aceptar campos desconocidos, edición sin consulta ni tareas Wallet sin `WALLET.VIEW`. Los permisos comerciales del dueño nunca se delegan. Aprobar una pieza social común exige `SOCIAL.APPROVE`.
- Actualizar permisos, datos, invitación, baja y Caja exige la revisión actual. Formulario vencido devuelve 409 y conserva el borrador sin reemplazar la versión por la nueva. Renovar código/reiniciar acceso exige confirmación y cierra sesiones. Editar permisos no reactiva personas inactivas.
- Retirar Caja bloquea localmente ANTES de consultar Wallet. Caída remota conserva REVOKING y permite reintento. La baja completa cierra sesiones y trata de retirar Caja automáticamente. Nunca dejar acceso activo mientras se espera al motor, ni reactivar al reintentar una baja.
- Caja revalida usuario, empresa, revisión y asignación antes/después de llamadas remotas; POST exige CSRF. Mantener referencias de idempotencia y controles nativos por sucursal, compras y canjes. Una respuesta en vuelo no puede revelar datos después de la baja.
- Reparar acceso Wallet valida revisión y permisos del destinatario antes/después de contactar al motor. No restaurar acceso operativo retirado. UI de consulta no ofrece creación/edición; el servidor sigue siendo autoridad. Limitar la proyección del dashboard delegado; no exponer credenciales.
- Auditoría de cambios de equipo con actor, fecha y antes/después, sin contraseña, código, token o ciphertext. Historial visible de 30 eventos; registros anteriores se conservan. Códigos copiados solo por acción explícita; sin envíos ni almacenamiento del navegador.
- Lecturas de contenido, publicaciones, Maps y métricas validan empresa incluso al reutilizar funciones fuera de rutas HTTP. Agenda de Contenido prioriza fechas programadas cercanas. Mantener consentimiento del dueño en propuestas y rol real de agencia.
- SQLite permanece en v5. Preservar SQL, Kotlin, motor Wallet, credenciales privadas, asociaciones y emisión Apple/Google. Esta actualización modifica la autorización del portal y su presentación; no reinicia datos ni HTTPS.
- Gate: 14 suites / 130 pruebas HTTP del portal, 130 Python, 580 nativas, Docker y 114 comprobaciones gateway antes de commit local; sin push. DOM en `lumina-team.dom.mjs`, `lumina-practical.dom.mjs` y `lumina-management.dom.mjs`; navegador/dispositivos requieren evidencia propia. Terminal conserva RESULTADO y URL solo tras arranque verificado. Guía: `docs/lumina-equipo-v050.md`.

## Campaign contract — v051

Black Friday metadata belongs to a single November/year. Server admission and redemption guards must enforce the exclusive December 1 midnight America/Guayaquil limit. Preserve regular offers, accepted work, wallet identities, balances and ledger. Do not remove or rewrite seasonal markers to extend a campaign. Monthly promotional renewal uses the regular base offer and explicit new acceptance. Do not seed public discounts. Preserve old Program/SimplePromotionSetup serialization when optional campaign fields are absent. New migrations: PostgreSQL V015 and SQLite 006; previous migrations remain immutable. Native suites total 596; portal contracts total 146. Physical wallet/device and visual browser validation remain separate gates.

## Lúmina v013 / Loyalty v052 — entrada de colaboradores a Wallet

- `/wallet` abre Caja para colaboradores con `cash_grants` activo; una sección explícita sigue exigiendo sus propios permisos. El cajero conserva rol CASHIER y sucursal. No ampliar `WALLET.VIEW` a compras o canjes ni dar permiso OWNER al navegador.
- Equipo muestra compras/canjes primero. Las opciones rápidas no guardan ni otorgan permisos hasta enviar el formulario del dueño con revisión vigente. La agencia no actúa en nombre del cliente.
- Caja usa el diseño común de Wallet; sólo ofrece operaciones y enlaces permitidos, conserva revisión/consentimiento/idempotencia y elimina el encabezado Authorization ficticio antes de enviar la petición. La autorización real permanece en el servidor.
- El resumen de campañas de Caja filtra por sucursal, vigencia y estado activo. No calcula elegibilidad ni saldos. El motor nativo sigue decidiendo acumulación y canje, incluido el cierre de noviembre.
- Gates: 16 suites / 152 pruebas HTTP, 130 Python, 596 nativas, PostgreSQL, Docker y gateway antes del commit local. Interacciones DOM de equipo, campañas y Caja no equivalen a prueba visual ni de dispositivos. Conservar una línea RESULTADO y URL sólo después de arranque comprobado.
- No hay cambios Kotlin ni SQL en v052. Conservar configuraciones privadas, credenciales, saldos, historial, identidades Wallet y conexión HTTPS. Guía: `docs/lumina-wallet-equipo-v052.md`.

## Lúmina v014 / Loyalty v053 — equipo unificado

- Una sola sección Wallet y un formulario `/equipo/:id/acceso` para Caja y permisos de servicios. Sin roles que eleven privilegios del colaborador; opciones simples conservan combinaciones personalizadas y límites por plataforma. Datos, recuperación e historial quedan secundarios. Rutas anteriores compatibles.
- Validar todas las entradas y revisión antes de preparar Caja. Publicar asignación y permisos en una transacción local. Sin cambios: no rotar credenciales ni aumentar revisión. Servicios sin cambios de Caja se pueden editar si el motor no responde.
- Retiro: bloquear Caja y guardar los permisos locales antes de contactar al motor. REVOKING bloquea operaciones durante fallos y reintentos. Conservar la revisión propia del cambio local en el error, nunca reemplazarla por la de otro guardado concurrente. Resolver altas pendientes con su requestId original sin publicar el token recuperado.
- Formularios sin JavaScript conservan controles nativos; interfaz con JS usa opciones compactas, mantiene borradores y bloquea envío duplicado. No almacenar información privada en el navegador.
- Gates: 17 suites / 169 pruebas HTTP, 130 Python, 596 nativas, PostgreSQL, Docker y gateway antes del commit local. Sin push. DOM no equivale a navegador visual ni recepción en teléfonos. Mantener una línea RESULTADO y URL tras arranque verificado.
- Sin cambios de Kotlin, SQL, identidades Wallet, configuraciones privadas ni HTTPS. Guía: `docs/lumina-equipo-simple-v053.md`.

## Lúmina v015 / Loyalty v054 — equipos visibles

- El dueño tiene Equipos y roles junto a Mi negocio y un botón en el inicio. La edición permanece en `/equipo`, exclusivamente para el dueño y su empresa. No condicionar el enlace a verificación comercial ni a grants de colaboradores.
- La agencia consulta `/equipos`, visible junto a Clientes: directorio paginado de negocios y personas, con roles, estados y tareas exactas. Esta lectura no otorga edición ni simula un actor OWNER; no consulta el motor Wallet ni prepara credenciales. No incluir contraseñas, tokens, códigos de activación, sesiones ni ciphertext en la proyección.
- `/equipos` lleva al dueño a su `/equipo`; un parámetro empresa nunca cambia su identidad o pertenencia. Colaboradores sin administración de equipo. Validar autorización en servidor y mantener las prohibiciones de acciones del negocio para la agencia.
- No cambiar roles registrados basándose en capturas, nombres o correo parecido. La sesión conserva el id de la cuenta autenticada y lee su rol/negocio vigente. Probar registro, salida e ingreso de dueño y cambio de cuenta en el mismo navegador.
- Gates: 18 suites / 181 pruebas HTTP, 130 Python y 596 nativas, PostgreSQL, Docker y gateway antes del commit local. Sin push. DOM en `lumina-team-navigation.dom.mjs` y `lumina-team.dom.mjs`; no equivalen a revisión visual ni teléfonos. Una línea RESULTADO y URL solo tras arranque comprobado.
- Conservar Kotlin, todas las migraciones, claves, saldos, identidades Wallet, asociaciones y HTTPS. Guía: `docs/lumina-equipos-visibles-v054.md`.

## Lúmina v016 / Loyalty v055 — cuenta y continuidad de producción

- Mi cuenta es común a agencia, dueño y colaborador. Todos los botones de cerrar sesión de personal están exclusivamente allí. Encabezados de Lúmina, Contenido, Wallet y Caja enlazan a `/cuenta`; Volver a Lúmina navega sin cerrar sesión. Conservar los bloqueos de borradores y operaciones en vuelo. El cierre del flujo público de un cliente Wallet mantiene su protección independiente.
- Cambiar contraseña requiere la actual y la confirmación; cierra sesiones antiguas. Cerrar otras sesiones afecta sólo a la cuenta autenticada y conserva la actual. Validar POST/CSRF en servidor. Nunca modificar rol, negocio, credenciales de integración ni identidad de tarjetas al cambiar una cuenta.
- Producción se ejecuta desde una versión separada y verificada, fuera del checkout de desarrollo. `ProductionGuard` y `production.mjs` verifican un sello privado, bases existentes, esquema e identidad antes de escuchar. No inicializan ni migran producción. Preservar SQL PostgreSQL V001–V015 y SQLite v6.
- Dominios Wallet, pepper, clave de cifrado, Pass Type ID/Team ID/Issuer ID, agency.key y asociaciones son persistentes. No regenerarlos por despliegue. Una renovación de certificados mantiene los identificadores y exige validación. No cambiar un dominio temporal por uno permanente sin comprobar la migración de las tarjetas instaladas.
- `production.py` requiere configuración explícita, material fuera del código, checkpoint completo y mismo commit/fuentes. Cambio de tráfico sólo con candidata saludable y respaldo con restauración verificada; conservar anterior, bloquear cambios simultáneos y no restaurar bases activas al revertir código. Futuro SQL requiere plan compatible explícito.
- El checkpoint y el instalador local rechazan perfiles/carpetas de producción. Nunca probar contra la base real, borrar volúmenes, sembrar demos, renovar URLs ni abrir accesos privados por esta actualización. No incluir respaldos, SQLite, claves ni configuración real en evidencias/commits.
- Gates locales: 20 suites / 198 pruebas Node, 160 Python, 608 Kotlin/HTTP/PostgreSQL, Docker y gateway antes del commit local. Sin push. Ensayo de restauración real, HTTPS, visual de navegador y continuidad en teléfonos son verificaciones distintas: informar pendientes sin convertir simulaciones en PASS.
- Guías: `docs/lumina-cuenta-produccion-v055.md` y `docs/production/README.md`. Conservar una línea RESULTADO y la URL únicamente tras arranque comprobado. No prometer disponibilidad absoluta ni declarar producción aceptada por pasar los gates locales.
- Desde v016r1, los datos ficticios de las pruebas de producción usan la ruta real de su directorio temporal. Comprobar las suites con un `TMPDIR` enlazado para cubrir la configuración de macOS. La validación de rutas privadas sigue rechazando enlaces simbólicos.

## Lúmina v017 / Loyalty v056 — revisión de flujos

- Mantener el acceso por rol en los enlaces de Web/Maps/Marca, el contexto de métricas y la selección activa de rutas de agencia. Una consulta del cliente nunca se convierte implícitamente en trabajo de agencia.
- `request_key` identifica el envío de un formulario de solicitud. Un reintento idéntico conserva el registro y la auditoría; un contenido o actor distinto se rechaza. Los formularios antiguos sin clave continúan admitidos. Sin nueva migración.
- Los errores de cotización conservan el borrador y su revisión original. No actualizar automáticamente una revisión obsoleta para hacerla aceptable. Registro conserva contacto, nunca contraseñas ni códigos.
- El manejador común de envío se ejecuta después de los validadores y restaura los botones al volver. No persistir datos de borradores en localStorage/sessionStorage. Equipo mantiene su propio seguimiento de cambios.
- Gate: 21 suites / 210 pruebas del portal, 160 Python y 608 Kotlin/HTTP/PostgreSQL, más Docker/gateway, antes del auto commit. Ocho suites DOM y prueba visual separada en `scripts/ui`. Guía: `docs/lumina-revision-integral-v056.md`.
- No modificar identidades, esquemas ni material privado de Wallet en esta revisión. Despliegue pausado; recrear el paquete de producción solo después del checkpoint local y al retomar esa tarea.


## Lúmina v018 / Loyalty v057 — registro y tarifa Wallet

- La promoción termina definitivamente el 31-12-2026 en America/Guayaquil; no se vuelve a abrir cada noviembre. USD 4,99 finales por sucursal y mes desde 01-01-2027, o desde el alta si es posterior.
- Solo el dueño acepta expresamente la tarifa y la renovación desde Lúmina; nada de casillas marcadas, agencia aceptando por otro, cobros por visitar Wallet ni cargos retroactivos. Se factura a la cuenta, no a una tarjeta bancaria.
- Guardar términos y resumen versionados, identidad de quien acepta y fecha. No modificar acuerdos anteriores. Contratos que ya incluyen Wallet requieren revisión para evitar cobro duplicado.
- El alta por categoría elige el diseño una vez. Reintentos, actualizaciones y cambios de categoría no vuelven a sortear diseños ni alteran identidades/saldos/pases.
- V016 y SQLite007 son expansiones aditivas; todos los SQL anteriores son inmutables. Ver docs/production/transicion-v057.md: producción previamente sellada requiere transición ensayada y retorno compatible. No sobrescribir sellos ni restaurar una base anterior sobre nuevas operaciones.
- Gates agregados: WalletSubscriptionTest (6) y WalletSubscriptionPostgresTest (13), además del portal subscription.test.mjs y wallet-registration.dom.cjs. Pruebas físicas Apple/Google continúan separadas.

- Gate actualizado de esta revisión: 218 pruebas del portal, 160 Python y 627 Kotlin/HTTP/PostgreSQL. No crear commit sin Docker/gateway local. Los 16 escenarios DOM verificados no sustituyen navegador ni dispositivos físicos.

## Lúmina v018r1 — corrección del verificador

- El catálogo HTTP contiene 22 suites / 218 pruebas. La comprobación previa del instalador y el checkpoint ejecutan el mismo `scripts/test_lumina.py`; no verificar Node por otra ruta que omita este ejecutor.
- El ejecutor exige los conteos completos, sin fallos, cancelaciones, omisiones ni pendientes. No convertir un error de catálogo o proceso en PASS. `test_lumina_runner.py` cubre estas condiciones y eleva Python a 168 pruebas; la regresión adicional del paquete de producción lleva el total a 169.
- Mantener los 627 tests nativos, Docker y gateway antes del commit local. Esta revisión no cambia lógica de Wallet, SQL, claves, identidades ni conexiones.

- El paquete de producción incluye `businesses/business-categories.json` junto a `portal`, conservando la ruta relativa del catálogo compartido. Su prueba carga el módulo Node desde la candidata después de retirar el checkout ficticio. No afirmar despliegue por esta verificación.

## Lúmina v019 / Loyalty v058 — negocios, tarifas y pagos

- La agencia controla estados y pagos desde `/administracion/negocios/:id` con su identidad; no se convierte en dueño ni acepta suscripciones. El dueño conserva Equipos y roles y tiene Mi cuenta y pagos. Colaboradores no tienen autoridad comercial.
- SQLite008 guarda estados y comandos idempotentes. Bloquear el portal antes de transmitir una suspensión; reactivar solo tras confirmación nativa. Fallos quedan pendientes visibles y se reintentan. Conflictos independientes exigen revisión explícita. Conservar atribución de las operaciones y de intentos de pago.
- Google INACTIVE / Apple voided para negocios sin operación. Reactivar conserva seriales, claves, objetos, saldos y registros. No prometer borrado remoto ni entrega inmediata a teléfonos. La autorización del servidor es independiente del aspecto del pase.
- Wallet USD 4,99/mes o USD 50/año por sucursal; promoción fija hasta 31-12-2026. Términos v2 aceptados por el dueño. Cambios en el próximo corte; conservar períodos pagados incluso tras cierre/reactivación. Cierre detiene renovación, pausa/suspensión no la cancelan.
- Evitar acuerdos Wallet duplicados en paquetes y suscripción. El portal es un solo proceso escritor; la coordinación comercial local no autoriza escalar a múltiples escritores sin revisión distribuida.
- Cargos/pagos en centavos, comprobación de pertenencia, claves de reintento, correcciones auditadas y ningún débito bancario implícito. Cargos individuales requieren acuerdo y confirmación administrativa; no equivalen a facturas tributarias.
- Gates: 23 suites / 234 HTTP, 169 Python, 304 unidades/HTTP nativos y 333 PostgreSQL (637 nativas), Docker/gateway antes del commit. 16 suites DOM y teléfonos son verificaciones independientes. Terminal: RESULTADO y URL solo tras arranque confirmado.
- No modificar PostgreSQL V001–V016, SQLite001–007 ni identidades/material privado. Esquema nuevo SQLite8; transición de producción según docs/production/transicion-v058.md, nunca sobrescribir sellos ni restaurar bases activas para volver a código antiguo.
- Ventajas y comparación comercial con fuentes oficiales en docs/lumina-control-pagos-v058.md. Clientes ilimitados no es una exclusividad. Soporte prioritario requiere contacto real; no prometer 24/7 ni tiempos garantizados.

## Lúmina v020 / Loyalty v059 — directorio y cuenta clara

- Clientes usa `businesses/directory.mjs`: búsqueda literal sin tildes por negocio/responsable/contacto, estados y verificación separados, filtros antes de paginar, 25 filas y orden estable. Proyección privada, sin aprovisionar Wallet ni consultar saldos al listar. Mantener Administrar, Consultar negocio y Ver equipo.
- Cuenta separada en Resumen, Cargos y Pagos; la paginación aplica a la vista visible. Distinguir vencimientos pendientes de renovación y tarifa futura de período vigente. Conservar tarifas, promoción y aceptación actuales.
- Los comprobantes nativos de pago son privados, por negocio, y estrictamente de lectura. No llamar `sync` al consultar un comprobante ni crear cargos/auditoría/procesos Wallet. Revalidar dueño activo/versión y pertenencia. Agencia consulta por su autoridad administrativa; colaboradores y otros negocios quedan excluidos. Nunca exponer estas rutas por el proxy genérico de Wallet ni por el gateway público.
- Conservar el intento y su clave de idempotencia al fallar una respuesta, incluso si el cargo ya está pagado o no aparece en esa página. No generar una clave nueva para el reintento ni bloquearlo con un máximo de cero. Confirmación siempre sin marcar. Correcciones y cargos conservan también sus borradores.
- Comprobantes HTML/texto muestran reversión y saldo ACTUAL del cargo; no son facturas tributarias ni pruebas de débitos bancarios. Imprimir solo tras acción explícita. Consultar una cuenta o comprobante sigue permitido al dueño de un negocio suspendido; operar servicios continúa bloqueado.
- Gates: 24 suites / 247 HTTP del portal, 169 Python, 304 unidades/HTTP nativas y 338 PostgreSQL (642 nativas), Docker local y 116 verificaciones gateway antes del commit; sin push. 17 suites DOM separadas. Prueba visual reproducible en `scripts/ui/lumina-billing.spec.mjs`; navegador y dispositivos no se consideran aprobados sin evidencia propia.
- Sin cambios a PostgreSQL V001–V016, SQLite001–008, identidad, credenciales ni versión de representación de Wallet. SQLite sigue en 8. La actualización local no modifica producción ni sus sellos. Guía: `docs/lumina-cuenta-clara-v059.md`.

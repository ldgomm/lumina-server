# Lúmina v019 / Loyalty v058 — control de negocios, Wallet y pagos

Actualización local preparada a partir del resultado confirmado de v018r1, commit `6fb23e16f637754d902e3bcf8efaca14386df96e`. No despliega ni hace push. El instalador solo crea el commit local después de las comprobaciones completas.

## Administración

**Clientes → Administrar** reúne estado del negocio, suscripción, cargos, pagos e historial. El acceso a Equipos y roles permanece visible. La agencia conserva su identidad: no puede solicitar contenido, aceptar condiciones comerciales ni operar como el dueño.

- **Pausa / suspensión:** bloquean operaciones de servicios, compras, canjes, altas y solicitudes. El negocio conserva acceso a su cuenta, pagos, soporte y cancelación de renovación. Los contratos y cargos acordados siguen vigentes; pausar el servicio no significa cancelar la suscripción.
- **Cierre:** bloquea operaciones y detiene próximos cargos de Wallet. Conserva cargos emitidos, pagos, clientes, saldos y el período ya contratado. Reactivar no reinicia la renovación cancelada; el dueño debe aceptarla de nuevo. No cobra otra vez el período vigente.
- **Reactivación:** el portal solo reabre operaciones después de confirmar el cambio en el motor Wallet.
- Cada cambio exige motivo, confirmación y versión vigente. El historial identifica a la cuenta de agencia que solicitó la operación. Un formulario antiguo no puede sobreescribir otro cambio.

El comando administrativo se guarda en SQLite antes de contactar Wallet. Una interrupción deja el cambio **pendiente**, visible y bloqueado en el portal. El servidor reintenta sin duplicar versiones; un acuse perdido se recupera con la misma clave. Un conflicto producido por una modificación independiente exige un reintento explícito de administración. Los intentos fallidos se rotan para no impedir el avance de otros negocios.

El bloqueo del portal es inmediato. La suspensión nativa se considera aplicada únicamente tras su confirmación. No se anuncia como completada cuando el motor no responde. No existe garantía de comunicación instantánea entre sistemas durante una interrupción.

## Tarjetas Apple y Google

Google recibe `INACTIVE` y Apple `voided: true` mientras el negocio no puede operar. Al reactivar reciben el estado activo correspondiente. Se preservan seriales, autenticación, objetos/clases de Google, Pass Type ID, vínculos, registros de dispositivos, saldos e historial. La versión de representación permite actualizar también las tarjetas de negocios que ya estaban inactivos antes de este parche.

**No se borran tarjetas a distancia.** El teléfono y la plataforma controlan la entrega de actualizaciones y su archivo/ocultación. Un dispositivo sin conexión puede seguir mostrando una copia anterior. La autorización de compras y canjes se verifica en servidor y no depende de lo que muestre la tarjeta.

Referencias oficiales:

- Apple, ecosistema de pases y límites de entrega: https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Ecosystem.html
- Apple, Wallet y pases vencidos: https://developer.apple.com/design/human-interface-guidelines/wallet
- Google, pases inactivos/vencidos: https://developers.google.com/wallet/retail/loyalty-cards/use-cases/expired-passes
- Google, estado del objeto: https://developers.google.com/wallet/reference/rest/v1/loyaltyobject

La aceptación de una actualización por el proveedor no acredita su visualización en un teléfono. Las pruebas físicas siguen pendientes.

## Tarifa y aceptación

Dos opciones por sucursal:

| Modalidad | Cargo por sucursal | Renovación |
|---|---:|---|
| Mensual | USD 4,99 | Cada mes |
| Anual | USD 50,00 en un solo cargo | Cada doce meses |

El anual ahorra USD 9,88 frente a doce mensualidades. Precios finales con impuestos aplicables incluidos, siguiendo la convención del acuerdo anterior. Confirmar el tratamiento tributario del prestador antes de facturar.

Se conserva la promoción única hasta el **31 de diciembre de 2026**, inclusive, según Ecuador continental. Las altas en noviembre o diciembre comienzan a pagar el 01-01-2027. Las altas posteriores no reciben una promoción nueva cada año ni cargos anteriores a su aceptación.

Solo el dueño acepta, con una casilla sin marcar y términos descargables. Se conserva la versión, texto, hash, identidad y fecha. Los acuerdos anteriores no se reescriben ni se convierten automáticamente a anual. La tarifa nueva usa la versión contractual `wallet-2026-11-13-v2`.

Los cambios de mensual a anual o viceversa entran en el siguiente corte. Se conserva el período vigente, el día de referencia y los cargos históricos. Nuevas sucursales se incorporan al cobro en el siguiente corte, con el precio y modalidad indicados antes de guardarlas. No hay un cargo adicional por renombrar una sucursal.

Se impide aceptar simultáneamente una suscripción Wallet y un paquete que ya la incluya, también durante la transición entre aceptación y activación. Si se desea cambiar a un paquete con Wallet incluida, se desactiva la renovación y se programa el paquete después del período vigente. Los acuerdos heredados requieren revisión; no se eliminan ni se inventan abonos para convertirlos.

La coordinación de las decisiones comerciales usa el proceso único del portal y transacciones locales. El despliegue actual ejecuta un solo escritor del portal SQLite; no habilitar varios procesos escritores sin sustituir esa coordinación por una exclusión distribuida validada.

## Cargos y pagos

- Administración registra pagos completos o parciales contra un cargo: importe exacto, medio, fecha y referencia/comprobante.
- El negocio consulta **Mi cuenta y pagos** y el enlace de su suscripción: cargos, saldo pendiente, vencido, pagos y próxima renovación.
- Se conservan la clave del formulario, referencia y borrador ante errores. Un reintento tras perder la respuesta no duplica el pago.
- El servidor valida pertenencia del cargo, saldo pendiente, fechas e importes en centavos enteros. La corrección de pagos conserva el registro original y el motivo; no equivale a una devolución bancaria.
- Administración puede registrar cargos individuales ya acordados de contenido, web, diseño u otros servicios. No se crean automáticamente por publicar un precio. Antes de registrarlos debe comprobar el acuerdo y que no exista otro cargo equivalente. La idempotencia impide duplicar el mismo envío, no permite identificar dos formularios distintos que describan el mismo acuerdo.
- El registro de cuenta no ejecuta débitos ni sustituye la factura tributaria. Los cobros periódicos requieren el consentimiento correspondiente.

La identidad del proveedor, RUC, domicilio, contacto y política HTTPS publicada siguen siendo indispensables para aceptar condiciones. El texto contractual mantiene derechos de reclamación y revisión de servicios no prestados. Es una propuesta para revisión jurídica y tributaria del prestador, no una certificación universal de cumplimiento.

Referencia normativa oficial consultada: Ley Orgánica de Defensa del Consumidor, versión publicada por el Ministerio de Producción: https://www.produccion.gob.ec/wp-content/uploads/2025/03/LEY-ORGANICA-DE-DEFENSA-DEL-CONSUMIDOR_2022_02_11.pdf

## Ventajas y alternativas

El portal muestra clientes y colaboradores ilimitados sin tarifa por usuario/tarjeta, Apple y Google Wallet, QR, personalización, puntos/sellos/premios, permisos por sucursal, historial e informes. El soporte prioritario se ofrece mediante el contacto real de Lúmina configurado en Mi cuenta; no se promete atención 24/7 ni tiempos no acordados. Es una política de atención, no un centro automatizado de tickets.

Revisión de ocho alternativas, 13-11-2026. Es una muestra de competidores relevantes; no todos los productos del mercado. Hay ofertas gratuitas y varios competidores también permiten clientes ilimitados. No se afirma que Lúmina sea la única ni la más barata en cualquier caso.

| Alternativa | Precio publicado de referencia | Fuente oficial |
|---|---|---|
| Loopy Loyalty | Starter USD 25/mes o 250/año; 1 local, 3 accesos de personal | https://loopyloyalty.com/pricing/ |
| PassKit | Desde USD 39,50/mes; costos adicionales por volumen y usuarios | https://passkit.com/legal/rate-card/ |
| Loyalzoo | Grow desde USD 77/mes | https://loyalzoo.com/pricing/ |
| Boomerangme | Business desde USD 199/mes; incluye 10 ubicaciones | https://boomerangme.com/pricing |
| Stamp Me | Lite desde USD 49/mes; 1 ubicación, app propia | https://www.stampme.com/pricing |
| BonusQR | Plan gratis; Basic USD 60/trimestre, equivalente a USD 20/mes | https://bonusqr.com/pricing |
| FaveCard | Opciones gratuitas y de pago; consultar funciones del plan | https://www.favecard.co/en/pricing/ |
| Square Loyalty | Según mercado y plan, integrado con Square | https://squareup.com/us/en/software/loyalty |

Comparar moneda, impuestos, localizaciones incluidas y alcance. Las tarifas de terceros pueden cambiar y no se usan para el cobro de Lúmina. La tabla se mantiene plegada para que el cliente vea primero la oferta y sus beneficios.

## Instalación y pruebas

Con Docker Desktop disponible, detener la Terminal local anterior con Control+C y ejecutar desde Descargas:

```bash
bash lumina_digital_control_pagos_v019.sh --iniciar
```

El instalador comprueba compatibilidad y ejecuta el mismo catálogo del checkpoint antes de escribir. Conserva cambios ajenos y rechaza conflictos. Tras instalar exige Node, Python, compilación/unidades, PostgreSQL, Docker y gateway antes de crear el commit local. No hace push, no despliega, no cambia claves ni reinicia tarjetas. La salida de Terminal conserva una línea RESULTADO y la URL solo cuando el portal está disponible.

Validaciones de esta revisión: 23 suites / 234 pruebas HTTP, 169 Python, 304 pruebas nativas de unidad/HTTP y 333 PostgreSQL, más 16 suites DOM. Docker/gateway en el Mac y pruebas físicas Apple/Google son comprobaciones separadas. Los resultados exactos del instalador, no este documento, determinan el commit.

SQLite008 añade exclusivamente control de negocios y comandos pendientes. PostgreSQL V001–V016 y SQLite001–007 se conservan byte por byte. La comprobación de identidad de producción ahora exige SQLite8. Ver `docs/production/transicion-v058.md` antes de actualizar un servidor sellado. La instalación local no migra producción ni sobrescribe su sello.

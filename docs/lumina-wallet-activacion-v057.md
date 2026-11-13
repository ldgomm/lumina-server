# Registro y suscripción Wallet — Lúmina v018r1 / Loyalty v057

## Corrección del instalador v018r1

El resultado del 13-11-2026 confirmó que las 218 pruebas HTTP pasaron antes de instalar. El checkpoint se detuvo porque `scripts/test_lumina.py` aún exigía 21 suites, cuando la nueva suite de suscripción elevó el catálogo a 22. No hubo compilación posterior, migración ni commit; el instalador restauró el código anterior.

Esta revisión corrige ese catálogo y hace que la comprobación previa ejecute exactamente el mismo `scripts/test_lumina.py` que usa el checkpoint. Exige las 22 suites y las 218 pruebas aprobadas, sin fallos, cancelaciones, omisiones ni pendientes. Ocho pruebas nuevas del verificador cubren catálogos incompletos, conteos inconsistentes y procesos fallidos. Junto con una regresión del paquete de producción, la validación Python sube de 160 a 169 pruebas.

El paquete de producción también incorpora el catálogo compartido de categorías que necesita el portal fuera del checkout. Se comprueba cargando el módulo Node desde una candidata aislada; esto no constituye una prueba de despliegue.

La corrección del instalador no cambia el código de Wallet, sus migraciones, tarifas, identidades ni materiales privados respecto de v018. Conserva todas las mejoras descritas abajo. Docker, gateway y las pruebas en teléfonos mantienen sus verificaciones independientes; no se eliminan controles para permitir el commit.

## Cambios para el cliente

Después del registro por QR, el portal prepara el enlace de la Wallet adecuada para el teléfono. El botón principal dice «Añadir a Apple Wallet» o «Añadir a Google Wallet» y es un enlace normal, listo antes de la pulsación. No existe el paso separado «Preparar» seguido de «Abrir». Apple o Google mantienen su confirmación final de guardado. La otra plataforma queda en una opción secundaria.

Los fallos permiten reintentar sin otra inscripción. Los enlaces vencidos se retiran, las respuestas tardías se descartan si cambió la sesión y solo se aceptan destinos de descarga conocidos. Preparar un enlace no significa que la tarjeta haya sido instalada. No se cambian seriales, tokens, emisores, saldos ni identidades de Apple/Google.

## Activación del negocio

El registro pide el tipo de negocio. La primera creación de Wallet recibe una composición, colores y símbolo compatibles con esa categoría, elegidos entre tres variantes válidas. Se guarda una sola vez. Repetir el alta después de perder una respuesta devuelve el mismo negocio y conserva su diseño. Los negocios anteriores no reciben una categoría inventada ni un diseño nuevo.

Cuando Lúmina tiene su identificación legal configurada, el negocio recién registrado pasa al resumen de suscripción. El dueño revisa los importes, lee/descarga las condiciones y marca la aceptación; la casilla nunca aparece marcada. Después entra directamente a Wallet. Los negocios existentes encuentran la suscripción en Paquetes y servicios y en una franja dentro de Wallet. Colaboradores y agencia no pueden aceptar en nombre del negocio.

## Tarifa y períodos

- Promoción única: USD 0 desde la aceptación/activación hasta el 31-12-2026 inclusive, según Ecuador continental. Las activaciones del 19-11 o 03-12 terminan la promoción el mismo día.
- Primer cargo de esas altas: 01-01-2027. Después, USD 4,99 finales por mes por sucursal registrada en Wallet. Una sucursal cuesta 4,99; dos, 9,98; tres, 14,97. Se interpreta el precio comunicado como final con impuestos aplicables incluidos.
- Altas posteriores: tarifa de pago desde el alta, sin meses retroactivos. Su corte se ancla a ese día; los meses cortos no pierden el día original.
- La aceptación autoriza cargos automáticos en la cuenta del negocio y renovación mensual. No autoriza débito bancario ni de tarjeta. El asiento interno no sustituye una factura tributaria.
- Una nueva sucursal queda incluida hasta el siguiente corte; desde ese corte suma 4,99. La creación advierte el efecto económico. Renombrar no crea otro cargo.
- Se usa la fecha histórica de creación de cada sucursal para recuperar cortes después de una interrupción. Hay unicidad por negocio/período, bloqueo transaccional e idempotencia para aceptar/cancelar. Un reinicio o reintento no debe duplicar facturas.
- El dueño desactiva la renovación desde la misma página. Conserva el período vigente, sus cargos y el historial. Al terminar el período se bloquean nuevas operaciones, sin borrar identidades ni vínculos de tarjetas. Reanudar dentro del período no lo cobra de nuevo.
- La mera existencia de una cuenta o Wallet anterior no se considera consentimiento. No se generan cargos de esta tarifa hasta su aceptación. Planes nativos anteriores y acuerdos de Lúmina con Wallet incluida requieren revisión para evitar duplicidad; no se sobrescriben ni recotizan.

## Condiciones e identificación pendiente

La agencia debe completar **Mi cuenta → Identificación de Lúmina** con razón social real, RUC, domicilio, contacto y enlace HTTPS a su aviso de privacidad publicado. No se inventan estos datos. El contrato no puede aceptarse mientras falten. Validar el formato del RUC no equivale a verificarlo con el SRI.

El texto contractual se genera con esa identidad y el resumen económico. Se guarda íntegro, versionado e inmutable junto con la cuenta que acepta, fecha, negocio, sucursales iniciales y hash de la oferta. El dueño puede descargar la misma copia después. Cambiar los datos del proveedor no reescribe acuerdos anteriores. No se presentan cláusulas de renuncia general, arbitraje obligatorio ni autorización de precios unilaterales.

Es una propuesta contractual para revisión jurídica ecuatoriana antes de ofrecerla en producción; no constituye certificación de cumplimiento. Deben verificarse identidad del prestador, tratamiento tributario del precio final, documentos fiscales, responsabilidades del negocio y de Lúmina respecto de los datos, conservación, proveedores, transferencias internacionales y mecanismos efectivos de atención y derechos. El aviso de privacidad y el acuerdo de tratamiento de datos deben corresponder a la operación real, no a una plantilla genérica.

Referencias oficiales consultadas el 13-11-2026:

- Ley Orgánica de Defensa del Consumidor, particularmente información de precios, cláusulas prohibidas, terminación, devolución y promociones (arts. 43–46 y normas de información): https://www.produccion.gob.ec/wp-content/uploads/2025/03/LEY-ORGANICA-DE-DEFENSA-DEL-CONSUMIDOR_2022_02_11.pdf
- Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos, contratación y consentimiento informado (arts. 45–49): https://www.arcotel.gob.ec/wp-content/uploads/2015/12/ley-comercio-electronico-firmas-electronicas-y-mensaje-de-datos.pdf
- Ley Orgánica de Protección de Datos Personales, información y derechos: https://www.finanzaspopulares.gob.ec/wp-content/uploads/2025/12/LEY-ORGANICA-DE-PROTECCION-DE-DATOS-PERSONALES-LOPDP-1.pdf
- SPDP, consentimiento: https://www.spdp.gob.ec/docs/proteccion-de-datos-personales/general/consentimiento/
- Apple, distribución y actualización: https://developer.apple.com/documentation/walletpasses/distributing-and-updating-a-pass
- Google, integración web de fidelización: https://developers.google.com/wallet/retail/loyalty-cards/web

La aplicabilidad de la normativa de consumo a una relación empresarial depende de sus características; el contrato conserva derechos legales aplicables sin presumir una exclusión general por ser un negocio.

## Categorías al registrar compras

En el código revisado, el campo estaba en compras detalladas de Caja; no existe un módulo independiente de gastos. Ahora se escogen categorías de las promociones/beneficios del negocio, «Sin categoría» u «Otra categoría». Si todavía no hay categorías propias, ofrece Alimentos, Bebidas, Productos y Servicios. La última permite escribir una categoría nueva. No se elige por defecto una categoría que active beneficios. Las compras y los descuentos siguen pasando por la revisión de total y autorización del cajero.

## Instalación y validación

Cerrar con Control+C la Terminal del portal local; mantener Docker Desktop disponible. Ejecutar desde Descargas:

```bash
bash lumina_digital_wallet_simple_v018r1.sh --iniciar
```

El instalador conserva cambios ajenos, rechaza conflictos antes de modificar archivos y comprueba el portal antes de instalar. Después exige pruebas de Kotlin/PostgreSQL, Python, Docker y gateway para crear el commit local. No hace push ni despliega. La Terminal muestra el resultado y, solo si se verifica el arranque, la dirección local de Lúmina.

Las pruebas de dispositivos físicos siguen siendo necesarias: guardar desde el QR en Safari/iPhone y Chrome/Android, confirmar una compra/canje y la actualización del mismo pase. Las pruebas DOM no certifican la apariencia ni el comportamiento nativo de Apple/Google.

## Esquema y producción

PostgreSQL V016 añade la categoría a la relación durable negocio–Lúmina y la fecha de incorporación de las sucursales al cálculo de cobros. Las sucursales anteriores reciben la fecha de migración, anterior a cualquier aceptación de esta tarifa; no se deducen cargos históricos de ese dato. SQLite v7 añade categoría e identificación legal del proveedor. V001–V015 y SQLite v1–v6 permanecen intactos. Los contratos se guardan en las tablas versionadas de facturación existentes. No se modifican materiales privados ni datos de clientes para instalar el parche.

Esta actualización cambia la versión de esquema exigida: el paquete v055 preparado antes no incluye estos cambios y debe reconstruirse tras un checkpoint válido. La actualización local no ejecuta migraciones en producción ni altera el sello de identidad. Consultar `docs/production/transicion-v057.md` antes de cualquier cambio de un servidor ya activo. Un esquema nuevo no habilita volver a una versión antigua que no lo soporte. Nunca recuperar disponibilidad restaurando una base antigua encima de compras nuevas.

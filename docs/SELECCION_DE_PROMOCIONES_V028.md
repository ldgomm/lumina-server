# Selección de promociones al registrar compras

## Cómo funciona desde v028

1. Escanear la tarjeta o buscar al cliente solo abre su ficha.
2. Introducir comprobante, sucursal e importe, o detallar los productos.
3. Elegir las promociones: todas empiezan desmarcadas. Se puede elegir una, varias o ninguna.
4. Revisar el total y la lista elegida antes de guardar. Sin selección, la revisión dice **Solo registrar compra** y avisa que no se añaden puntos, sellos ni cashback.
5. Guardar una sola compra. El recibo detalla únicamente los beneficios confirmados, con el nombre de cada promoción.

El historial y los informes cuentan los comprobantes registrados y sus importes. Eso es independiente de los sellos: una promoción de visitas concede sellos únicamente si está seleccionada y cumple sus condiciones. Escanear no mide por sí mismo una visita física. Dos comprobantes distintos son dos compras, aunque pertenezcan al mismo día; los informes existentes no cambian su definición.

Los puntos y el cashback siguen sus reglas vigentes. Las promociones por producto exigen detallar productos elegibles; horarios, sucursal, mínimos y disponibilidad siguen aplicándose. Elegir una promoción no garantiza acumular cuando no cumple esas condiciones. Canjear un premio es una elección separada; la promoción canjeada no vuelve a acumular en esa misma compra.

## Controles de la interfaz

- Selector visible en compra rápida y detallada, con nombre y tipo de acumulación.
- Recuento de seleccionadas y botón Desmarcar todas.
- Añadir/quitar productos o pasar a compra detallada conserva solo las elecciones explícitas.
- Cambiar datos invalida la revisión anterior. Cambiar al siguiente cliente empieza sin selección.
- Durante el envío se bloquea la edición. Un error conserva los datos y la clave de idempotencia para reintentar.
- Un recibo de un sello muestra **1 sello**; no se mezclan unidades de diferentes promociones.

## Compatibilidad y validación

El panel siempre envía `programIds`: `[]` para ninguna o los identificadores seleccionados. El servidor ya respetaba ese contrato. El problema estaba en la compra rápida, que omitía el campo, y en la detallada, que marcaba todas. Se conserva la compatibilidad de integraciones anteriores que omiten el campo, así como sus reintentos. No cambian Kotlin, SQL, reglas de acumulación, saldos históricos ni identidad de las tarjetas.

El mismo registro alimenta Apple y Google; presentationVersion permanece en 27. Este cambio no renueva el túnel ni revierte automáticamente beneficios de compras anteriores.

La comprobación `scripts/ui/purchase-selection.dom.cjs` ejecuta el JavaScript real del panel con jsdom 26 y peticiones simuladas. Comprueba ninguno/uno/varios, revisión, cambios de formulario, reintentos y recibos. Para ejecutarla, instala jsdom 26 en un entorno de pruebas y usa `LOYALTY_TEST_JSDOM` con la ruta absoluta del módulo; `LOYALTY_UI_EVIDENCE` permite guardar el resultado fuera del proyecto. No ejecuta compras reales ni sustituye una prueba visual de navegador.

El .sh valida de nuevo las 398 pruebas generales/HTTP/PostgreSQL, Python, Docker y 50 controles del gateway antes de crear un commit local. HTTPS se informa por separado. El ZIP se genera en Downloads e incluye el propio script, cambios y diagnósticos redactados.

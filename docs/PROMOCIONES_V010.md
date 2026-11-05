# Loyalty v010: promociones por producto, tarjeta y clientes

Ejecutar desde Downloads, con Docker Desktop disponible:

```bash
cd ~/Downloads
bash loyalty_promociones_v010.sh
```

Proyecto: `/Users/ldgomm/Developer/pdc/sales/loyalty`.
El instalador guarda su resultado ZIP en Downloads, con el mismo `.sh`, código anterior y nuevo, pruebas, errores y referencia del commit. Los archivos privados `.env`, certificados, claves y credenciales quedan fuera. Conserva los datos, los identificadores de Wallet y la configuración HTTPS existente.

## Configurar una promoción

Entrar como dueño → **Promociones** → elegir plantilla, cambiar sus valores si hace falta → **Crear promoción y premio**.

| Ejemplo | Lo que acumula | Meta antes del canje | Premio |
|---|---|---:|---|
| Sexta pizza gratis | Un sello por pizza pagada | 5 | Una pizza sin costo |
| Quinto café al 50% | Un sello por café pagado | 4 | 50% en un café |
| Segunda compra de ropa al 20% | Un sello por comprobante con ropa | 1 | 20% del subtotal de ropa |
| Octavo corte gratis | Un sello por corte pagado | 7 | Un corte sin costo |

Las plantillas permiten elegir categoría, número de compra premiada, porcentaje, nombre del premio y acumulación por unidad o por comprobante. Se pueden usar categorías como zapatos, ropa, electrodomésticos, pizzas o servicios. La categoría se registra en caja: esta versión no sustituye un catálogo ni una integración con el sistema de facturación.

Desde **Editar promoción** se configuran fechas, días, horarios, sucursales, compra mínima y bonos. Siguen disponibles los programas de puntos y cashback. Los bonos coincidentes usan la prioridad configurada, sin multiplicarse entre sí. Todos los establecimientos del mismo negocio comparten el saldo de la tarjeta.

Para cambiar de categoría, de unidad a comprobante, o cambiar la meta y el porcentaje de un premio, crea otra promoción o premio. No se reasignan automáticamente los saldos ni se convierten entre promociones. Cambiar los horarios o el nombre crea una nueva versión para las compras futuras. Desde v011, pausar oculta la promoción al cliente y bloquea tanto la acumulación como el canje, conservando los saldos para reactivarla. La eliminación definitiva y sus efectos se explican en [PROMOCIONES_V011.md](PROMOCIONES_V011.md).

## Registrar una compra y canjear

1. El empleado escanea el QR de la tarjeta del cliente, o lo busca por cédula.
2. Registra sucursal, comprobante, producto, categoría, cantidad y precio unitario. El código de Wallet sigue siendo el identificador del cliente; no se imprime otro código por compra.
3. El sistema evalúa las promociones seleccionadas contra los productos, fecha y sucursal. Cinco pizzas en un comprobante pueden sumar cinco sellos; en modo por compra, ese comprobante cuenta una vez.
4. Si ya hay saldo suficiente, el empleado elige el premio disponible y confirma la identidad y la petición del cliente.
5. **Revisar total y descuento** muestra el cálculo del servidor. Después del cobro o la entrega en caja, **Guardar compra y canje** registra ambos juntos.

Reglas de esta entrega:

- Un premio por comprobante, usando el saldo acumulado antes de esa compra. Para incluir la sexta unidad gratis después de cinco nuevas unidades en la misma visita, se registran primero las cinco pagadas y luego el canje con otro comprobante. No se calculan ciclos de premios dentro de un solo comprobante.
- El descuento por unidad se aplica a una unidad elegible, la de menor precio. En modo por compra, se aplica al subtotal de la categoría elegida. No descuenta otros productos, envíos ni categorías.
- Una compra con canje no acumula en esa misma promoción. Los demás programas pueden acumular según el importe neto pagado; si tienen una categoría, ese importe se distribuye proporcionalmente entre categorías.
- El porcentaje se calcula con enteros en centavos y se redondea hacia abajo. El total gratuito puede ser cero. El servidor verifica nuevamente el cálculo al guardar.
- Compra, consumo del premio, saldo, auditoría y aviso de actualización de Wallet se guardan en la misma transacción. Un reintento con la misma clave recupera el recibo; no concede un segundo premio.
- Dos cajas que revisaron el mismo saldo no pueden consumirlo dos veces. El segundo intento debe consultar la tarjeta nuevamente.
- El sistema registra el cobro; no procesa pagos bancarios. Las devoluciones y la anulación de comprobantes no se incorporan en esta entrega.

## Personalizar la tarjeta

**Mi tarjeta** permite cambiar nombre visible, logo, fondo, texto, etiquetas, saldo destacado, símbolo de sellos, bienvenida, instrucciones y felicitación de cumpleaños.

El logo se convierte en PNG pequeño y se valida en el servidor. Se exige contraste legible. La tarjeta instalada conserva su identificador y se actualiza; no hay que crear otra por sucursal ni pedir al cliente que se registre nuevamente.

Apple determina el diseño nativo: hasta tres saldos en el frente y el progreso con sellos, premios e historial en los detalles. Los sellos gráficos usan símbolos, no imágenes individuales por casilla. Google controla la disposición y los colores del texto; recibe el fondo, logo, nombre y módulos de información. La apariencia final necesita verificación en cada teléfono.

## Clientes y frecuencia

**Mis clientes** muestra compras registradas, gasto neto, última compra, promedio de días entre compras y premios reclamados. Pulsar un cliente abre sus productos, sucursales, descuentos y canjes recientes. La frecuencia se calcula entre comprobantes, no mediante seguimiento de ubicación. El historial anterior sigue disponible, pero los comprobantes antiguos no tienen productos detallados.

Los datos están separados por negocio. El dueño ve estos informes; el cajero conserva el acceso a las operaciones autorizadas de su sucursal. No se almacenan cédulas legibles en el historial ni en los pases.

## Progreso, cumpleaños y eventos

Wallet muestra cuánto falta para cada premio y cuándo está disponible. Para el octavo corte gratis después de siete pagados: con seis sellos falta uno; con siete aparece el premio disponible. La actualización de Apple incluye un mensaje de cambio al pasar al estado de un sello pendiente o premio disponible. Que aparezca una alerta depende de Wallet, las preferencias del cliente y la entrega de la actualización.

El cumpleaños es opcional y guarda solo mes y día. El cliente puede aceptar felicitaciones y anuncios al registrarse; el dueño puede cambiar esas preferencias con autorización del cliente. El 29 de febrero se celebra el 28 en años no bisiestos.

**Eventos y cumpleaños** permite programar anuncios con inicio y fin en la zona horaria del negocio. Durante ese intervalo aparecen en los detalles de las tarjetas de clientes que aceptaron anuncios. La felicitación aparece durante su día local de cumpleaños. Los negocios suspendidos no publican estos avisos. El proceso existente revisa periódicamente las tarjetas emitidas; requiere el servidor y HTTPS funcionando.

Los cumpleaños y eventos de esta entrega actualizan contenido silenciosamente. No envían notificaciones comerciales a la pantalla bloqueada de Apple. Google dispone de `TEXT_AND_NOTIFY`, pero su envío no se activa en esta versión: requiere implementar límites y registro de entregas, además de configurar y probar el emisor real. No se envían SMS, correo ni WhatsApp.

Referencias:

- [Apple Wallet: pautas de notificaciones](https://developer.apple.com/design/human-interface-guidelines/wallet)
- [Google Wallet: notificaciones](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/trigger-push-notifications)
- [Google Wallet: actualizar logos y clases](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/updates)

## Verificación y continuidad

La entrega exige 174 pruebas Kotlin/HTTP/PostgreSQL (incluidas 17 de concurrencia), 88 pruebas Python, servidor local y gateway antes del commit automático. El script informa HTTPS por separado. Las comprobaciones del entorno de desarrollo con PGlite no sustituyen PostgreSQL nativo: el instalador ejecuta esas pruebas en una base efímera separada de los datos del piloto.

Los cambios se aplican por fragmentos de código y admiten reformatear con IntelliJ y reordenar imports. Si un fragmento cambió de lógica o tiene un comentario nuevo que se perdería, el instalador conserva el archivo y genera evidencia para revisarlo.

En el teléfono, probar una nueva promoción, una compra, su canje, el logo y los detalles del premio. Se mantienen pendientes la activación real de Google y la verificación de las restricciones de un solo dispositivo. No se declara resuelta esa política por haber probado un canje.

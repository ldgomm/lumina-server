# Promociones y tarjetas · v020

Base comprobada: v019r1, commit local e611601ef77c1b0e276fa0f7790ca52935ac9dec. Se conserva la recuperación HTTPS realizada después. Este instalador no cambia el dominio ni renueva automáticamente el túnel.

## Instalar

Descargar `loyalty_promociones_y_wallet_v020.sh` en Downloads y ejecutar:

```bash
cd ~/Downloads
bash loyalty_promociones_y_wallet_v020.sh
```

El proyecto predeterminado es `/Users/ldgomm/Developer/pdc/sales/loyalty`. La aplicación aplica fragmentos semánticos: tolera formato y orden de imports de IntelliJ. Si encuentra cambios de lógica en una región afectada, se detiene antes de escribir parcialmente. No se alteran migraciones ni archivos privados.

El ZIP de Downloads incluye el instalador exacto, código antes/aplicado/probado, pruebas y registros redactados. El commit local automático exige 146 pruebas generales, 160 PostgreSQL, pruebas Python, Docker y 26 comprobaciones del gateway. HTTPS se informa después; no se hace push.

## Pausar y reactivar

En **Promociones**, cada tarjeta incluye **Pausar promoción** o **Reactivar promoción**, junto a Editar y Eliminar. La confirmación explica qué cambia. Se envía la configuración completa y su versión: se conservan horarios, bonos, categorías, sucursales y saldos.

Al pausar se retira del registro y de los saldos/premios actuales de ambas Wallet, y se bloquean nuevas acumulaciones y canjes de esa promoción. Al reactivar se recupera el saldo conservado, sujeto a las fechas y condiciones existentes. Los movimientos históricos permanecen. La actualización física depende de la conexión de cada Wallet.

## Actualizar o recuperar la misma tarjeta

Como dueño, abre Caja y busca al cliente. Encima de sus operaciones encontrarás **Actualizar o recuperar esta tarjeta**. También hay acceso directo desde **Mis clientes → ficha del cliente**.

1. Elige el motivo: no se actualiza, cambio de teléfono o tarjeta borrada.
2. Verifica presencialmente la identidad del titular y marca la confirmación.
3. Genera el QR temporal. El cliente lo abre en su teléfono y completa el guardado de la misma tarjeta en Apple o Google Wallet.

El QR vence en cinco minutos y solo admite un uso. La interfaz retira el enlace y la imagen al vencer. No se autoriza la recuperación solo por abrir la ayuda ni por conocer la cédula. Conserva la tarjeta y sus saldos: no borres el pase ni vuelvas a registrarte. Este flujo no demuestra que se hayan revocado copias físicas existentes.

## Personalizar ambas Wallet

En **Mi tarjeta** elige la promoción destacada, el símbolo y el acabado de la franja de sellos. Hay círculo, estrella, corazón, tijeras, diamante, taza, pizza, bolsa, calzado y herramienta. No establecen reglas de compra: son opciones gráficas, independientes de las cantidades y beneficios que configure el negocio.

Los sellos llenos representan saldo hacia el premio de menor costo de la promoción destacada. Hasta 20 se dibujan individualmente; metas mayores usan barra porcentual. El saldo y el costo exactos permanecen en texto. Al completar una meta se conserva el excedente: no se descuenta nada hasta confirmar el canje en caja.

- **Apple:** strip PNG a tres resoluciones. Cuando hay sellos, el saldo nativo pasa a la cabecera para no superponerse a la ilustración. Mantiene su mensaje de cambio. Historial, nombres completos y condiciones siguen en los detalles.
- **Google:** hero PNG con proporción 1032:812 y descripción accesible. Cada cambio de progreso genera otra URL de imagen. Al retirar una promoción se reemplaza por fondo sin progreso para no mantener gráficos anteriores.
- Ambos usan dibujos propios, sin depender de fuentes emoji instaladas en Docker. Los detalles sí pueden mostrar el símbolo nativo del dispositivo. La vista previa también permite el logo PNG preparado bajo la política de imágenes de la aplicación.
- Las imágenes públicas solo reciben parámetros acotados de dibujo: no identifican al cliente ni contienen cédulas, QR, tokens, nombres o consumos. No consultan la base de datos.
- La tipografía de los campos y la distribución final las decide cada Wallet. El degradado corresponde a la franja gráfica de sellos; el fondo nativo conserva el color del negocio. No se imita la lista de transacciones de una tarjeta bancaria.

Al aplicar v020 cambia `presentationVersion` para actualizar las tarjetas existentes conservando serial, QR, tokens, clases/objetos y saldos. Puedes modificar el diseño y guardarlo después; cambiar el símbolo no requiere una tarjeta nueva.

## Comprobación en teléfonos

Con una promoción de prueba y su premio activo, elegir el símbolo deseado y guardar. Verificar tanto iPhone como Android: progreso antes/después de compra, descuento tras canje, desaparición al pausar, retorno al reactivar y QR vigente. También revisar detalles y accesibilidad. Las pruebas del servidor y las vistas previas no sustituyen esta comprobación.

Si se informa `WALLET_CONNECTION_REFRESH_PENDING`, usa el acceso visible de recuperación. Si el túnel temporal dejó de funcionar, resolver HTTPS primero: renovar la URL sigue siendo una operación explícita; el instalador no borra la tarjeta ni cambia el origen silenciosamente.

Referencias de diseño: Apple [Pass Design and Creation](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html); Google [Brand guidelines](https://developers.google.com/wallet/retail/loyalty-cards/resources/brand-guidelines) y [LoyaltyObject](https://developers.google.com/wallet/reference/rest/v1/loyaltyobject). Consultadas el 7 de noviembre de 2026.

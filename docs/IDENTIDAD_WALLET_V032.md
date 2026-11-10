# Identidad de las tarjetas · v032

Tres combinaciones sugeridas para cada categoría de negocio y un color personalizable para las ilustraciones de Apple y Google. Las combinaciones usan las diez composiciones existentes: Libreta, Editorial, Cupón, Recorrido, Panorama, Precisión, Atelier, Mosaico, Cintas y el medallón original. Cada combinación elige estructura, colores, símbolo y acabado; después puedes ajustar cada parte.

## Instalar

Descarga `loyalty_identidad_wallet_v032.sh` y ejecuta:

```bash
cd ~/Downloads
bash loyalty_identidad_wallet_v032.sh
```

El destino es `/Users/ldgomm/Developer/pdc/sales/loyalty`. Se requiere v031. El instalador tolera el reformateo de IntelliJ en las regiones modificadas; un conflicto de lógica se informa antes de escribir. Ejecuta las comprobaciones y crea un commit local después de aprobar el núcleo, PostgreSQL, Docker y el gateway. HTTPS se informa por separado. Conserva el ZIP generado en Downloads: incluye el mismo script ejecutado, código antes/después y registros redactados.

## Probar el diseño

1. Abre **Mi tarjeta → Diseño**. Verás tres ideas según la categoría registrada del negocio. Si la categoría no está definida, se ofrecen opciones generales.
2. Elige una combinación. Solo modifica la apariencia del borrador. Conserva tu logo, nombre, textos y promoción; no cambia ninguna regla de acumulación. **Deshacer combinación** recupera la apariencia que tenías antes de seleccionarla.
3. En **Marca → Color de la ilustración**, desactiva **Automático** para elegir un acento. La muestra indica el color aplicado. Si tu elección se pierde sobre el fondo, se aclara u oscurece automáticamente y se explica el resultado. Cambiar de fondo vuelve a calcular el ajuste.
4. Usa **Comparar ambas** y **Probar avance y formato**. Los saldos son ficticios. La ilustración proviene del servidor; la distribución final la decide cada Wallet.
5. Pulsa **Guardar diseño**. Se conserva el QR y la tarjeta instalada; se envía su actualización por el mecanismo de cada proveedor. Un conflicto conserva el borrador sin sobrescribir una versión ajena.

Automático restaura el acento del acabado. El color del logo, los textos nativos de Apple y la selección de color de texto de Google siguen sus ajustes propios. El acento modifica trazos, sellos y elementos del avance, sin cambiar el significado ni el saldo exacto. Algunos símbolos conservan detalles reconocibles propios.

## Compatibilidad y conexión

El diseño añade un campo opcional en el JSON existente; no modifica las migraciones SQL. Los diseños anteriores conservan el modo Automático. Las imágenes nuevas usan `/wallet/art/v32`; las rutas anteriores conservan sus resultados. `presentationVersion=32` provoca la actualización de presentación manteniendo la identidad y los saldos del pase.

Si aparece `WALLET_CONNECTION_REFRESH_PENDING`, actualiza la conexión de la misma tarjeta desde el panel del dueño. No la borres ni registres al cliente otra vez. El instalador no renueva automáticamente un túnel temporal, y una validación del servidor no demuestra que un teléfono haya recibido la actualización.

## Validación de esta entrega

- 217 pruebas unitarias/HTTP Kotlin y 128 Python.
- Pruebas DOM con los scripts reales: 42 categorías, selección explícita, deshacer, contraste, modo automático, conflictos de versión y campos que se conservan.
- Navegador con datos ficticios e ilustraciones compiladas: Apple y Google, anchos 320, 390, 1024 y 1440; guardado y protección del borrador. Regresión de las diez composiciones y las 32 paletas.
- Instalador: aplicación completa, reformateo de IntelliJ, repetición idempotente, conflicto de lógica y exclusión de secretos en el ZIP.

La ejecución en el Mac exige también 205 pruebas PostgreSQL, Docker y 88 comprobaciones del gateway antes del commit. HTTPS y las pruebas físicas de iPhone/Android son independientes.

Referencias: [Apple Wallet](https://developer.apple.com/design/human-interface-guidelines/wallet) · [Personalización de fidelización en Google Wallet](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/pass-customization).

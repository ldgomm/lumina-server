# Loyalty v017 · Premios más claros en Caja y en ambas Wallet

Al buscar o escanear a un cliente, Caja muestra cuánto tiene y cuánto le falta para cada premio. Las opciones con saldo suficiente aparecen primero, sin sumar promociones. Se ven dos opciones inicialmente; «Mostrar todos» permite revisar las demás y «Ir a la compra» lleva directamente al formulario.

## Operación

1. Busca la tarjeta en Caja con el QR o la cédula.
2. Revisa el progreso y las condiciones. «Con saldo» filtra las alternativas que alcanzan el costo.
3. «Aplicar en una compra» selecciona el descuento en el formulario de productos. Conserva los productos, la sucursal y el comprobante ya escritos. Si partes de una compra simple, conserva sucursal y comprobante; completa el detalle de productos para calcular el descuento.
4. Verifica al titular y confirma con él el uso del saldo. Revisa el total antes de guardar.
5. Para un premio de entrega directa, «Preparar canje» abre su revisión. Entrega el premio después de ver el recibo.

Seleccionar una opción no descuenta saldo ni marca el consentimiento. Los premios de una misma promoción comparten saldo: no se prometen todos a la vez. Cada operación sigue siendo validada por el servidor.

Si cambia el premio de una compra, desaparecen la cotización y las casillas de confirmación anteriores. Si cambia el premio o la sucursal de una entrega directa, desaparece la revisión anterior. Durante el guardado se bloquean los cambios. Ante un fallo, reintenta sin cambiar el comprobante: se conserva la clave de operación y una respuesta repetida no vuelve a otorgar el premio.

## Apple y Google

Los detalles de la tarjeta y la vista previa del dueño muestran el alcance real del descuento. Un descuento por unidad afecta la unidad elegible de menor precio; uno por categoría afecta solamente los productos de esa categoría. Los porcentajes, nombres y categorías son configurables: los ejemplos no son reglas fijas.

Ambas plataformas conservan el progreso, el saldo previsto después de un premio, los consumos y las reglas de visibilidad existentes. El cambio de presentación actualiza la misma tarjeta mediante las colas existentes. No se cambian seriales, QR, cuentas de emisor, saldos ni certificados.

## Aplicación y comprobación

Descarga `loyalty_mejoras_caja_wallet_v017.sh` en Downloads y ejecuta:

```bash
cd ~/Downloads
bash loyalty_mejoras_caja_wallet_v017.sh
```

El instalador parte de v016, admite reformateo de IntelliJ y conserva el contenido ajeno a las regiones modificadas. Si encuentra un cambio de lógica incompatible, se detiene sin aplicar cambios parciales. No contiene migraciones nuevas ni renueva automáticamente un túnel temporal.

La validación completa requiere 262 pruebas Kotlin/HTTP/PostgreSQL (125 + 137), todas las pruebas Python, Docker local y las 23 comprobaciones del gateway. Solo entonces crea el commit local, sin push. Después verifica HTTPS y registra su resultado por separado. El ZIP de Downloads contiene el mismo instalador, resultados, código antes/después y registros redactados.

Las pruebas aisladas de navegador son `apple-wallet.spec.cjs`, `wallet-save.spec.cjs` y `counter-rewards.spec.cjs`. Interceptan toda la red y no usan negocios reales. `experience.spec.cjs` es una prueba distinta que requiere un servidor y base aislados; no ejecutarla contra datos reales.

En los teléfonos, comprueba una tarjeta Apple y una Google después de instalar: revisa el nombre del premio, su categoría, el porcentaje y el saldo. El PASS del servidor no acredita la recepción en un dispositivo. Si aparece `WALLET_CONNECTION_REFRESH_PENDING`, sigue la recuperación de conexión existente para guardar la misma tarjeta con la dirección vigente.

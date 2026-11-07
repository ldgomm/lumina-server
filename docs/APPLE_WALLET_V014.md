# Apple Wallet v014

## Qué cambia

- En **Mi tarjeta**, el dueño elige la promoción destacada y prueba Nueva, Acumulando y Con premio usando las reglas reales y saldos de ejemplo. No se registra ninguna operación desde la vista previa.
- En Apple Wallet, la promoción destacada muestra su saldo y el premio de menor costo. En sellos, el avance pendiente se expresa como `6 / 7`; con saldo suficiente se conserva el saldo real y aparece **Premio disponible**. El canje y sus condiciones se confirman en caja.
- Los detalles conservan todos los saldos visibles, nombres completos, costo y avance de cada premio, sellos personalizados, los cinco últimos movimientos en orden de fecha, sucursal y hora del negocio.
- Los nombres largos se acortan en el frente y permanecen completos en los detalles. Apple determina el tamaño y la distribución final; esta tarjeta de fidelización no obtiene la interfaz bancaria de transacciones de Apple Pay.
- Al subir un logo, se intenta conservar resolución @3x (hasta 480×108) y se reduce si excede 20 KB. Los logos anteriores no se reescalan ni reemplazan solos; vuelve a subir el original para aprovechar más resolución.

Cada promoción conserva su propio saldo. Los objetivos y nombres proceden del negocio: no hay reglas fijas de pizzas, cortes o cafés. Una promoción pausada/eliminada queda fuera de la tarjeta, mientras el historial de operaciones realizadas permanece. La suspensión del negocio conserva saldos y muestra canjes pausados.

## Aplicar desde el Mac

Guardar `loyalty_mejorar_apple_wallet_v014.sh` en Downloads y ejecutar:

```bash
cd ~/Downloads
bash loyalty_mejorar_apple_wallet_v014.sh
```

El instalador prepara todos los cambios antes de escribir y reconoce reformateos Kotlin/JavaScript y reordenamientos fuera de las funciones modificadas. Un cambio de lógica en una región necesaria se conserva y se informa para revisión. No hay que deshacer el formato de IntelliJ.

La validación completa exige **220 pruebas Kotlin/HTTP/PostgreSQL**, todas las pruebas Python (al menos 105), Docker local y las 23 comprobaciones del gateway antes del commit local automático. HTTPS se verifica después y se informa por separado. El ZIP de Downloads incluye el propio `.sh`, código anterior/posterior, pruebas, registros y resultado; excluye certificados, pases, claves y archivos de configuración privados. No hace push ni borra volúmenes.

No se cambian esquemas de base de datos, credenciales, certificados ni cuentas de Google. La actualización de presentación despierta la cola de tarjetas existentes; mantiene serial, QR y token. Las actualizaciones automáticas continúan y los campos de saldo conservan su mensaje de cambio; iOS decide cuándo refrescar o mostrar un aviso. Esta entrega no añade notificaciones publicitarias ni asegura entrega de avisos de cumpleaños/eventos.

## Comprobar en el iPhone

1. En el panel del dueño, abrir **Mi tarjeta**, elegir una promoción activa con premio, revisar los estados de ejemplo y guardar.
2. Abrir la tarjeta ya instalada, con actualizaciones automáticas activadas y conexión a Internet. Esperar el procesamiento de la cola; comprobar saldo, progreso y premio. No borrar la tarjeta ni registrar otra cédula.
3. En **… → Detalles de la tarjeta**, comprobar nombres completos, costo del canje, movimientos y sucursal. Los movimientos se muestran como campos nativos de detalles.
4. Con un cliente de prueba, registrar una compra y comprobar el avance. Canjear solo una vez desde caja y comprobar el saldo resultante. El aspecto final y la recepción en el teléfono siguen pendientes hasta verlos allí.

Si el resultado indica `WALLET_CONNECTION_REFRESH_PENDING`, la tarjeta conserva una URL antigua: usa **actualizar conexión** de la misma tarjeta desde el panel del dueño y guarda esa actualización en el iPhone. No hace falta crear otra tarjeta.

Si Cloudflare retiró el túnel, renovar explícitamente la URL de pruebas:

```bash
bash loyalty_mejorar_apple_wallet_v014.sh --wallet-only --renew-test-url
```

Después hay que actualizar la conexión de la misma tarjeta. La URL temporal no es una dirección estable de producción.

## Prueba aislada de la vista previa

```bash
npm ci --prefix scripts/ui
node scripts/ui/apple-wallet.spec.cjs
```

Usa respuestas simuladas y no accede a una base de clientes. `LOYALTY_UI_CHROMIUM` permite indicar un Chromium local y `LOYALTY_UI_EVIDENCE` una carpeta de capturas. Esta prueba de navegador no sustituye la prueba de Apple Wallet en un iPhone.

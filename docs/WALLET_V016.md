# Wallet v016

Continuación de v015r2. Apple y Google se mejoran en la misma entrega.

- Mi tarjeta permite alternar la simulación Apple/Google y los estados Nueva, Acumulando y Con premio. La promoción destacada es la misma y los saldos de otras promociones permanecen separados. La vista no registra movimientos.
- Los detalles nativos de ambas Wallet indican cuánto falta y, si alcanza, el saldo que quedaría al canjear un premio. Es una previsión; caja valida el saldo y las condiciones actuales. No se muestran invitaciones al canje si el negocio está suspendido.
- El registro ofrece Preparar → Abrir Wallet → Confirmar allí. Android sugiere Google; iPhone/iPad sugieren Apple; el cliente puede cambiar. Solo aparecen proveedores habilitados. No se exige contraseña de Loyalty.
- La preparación bloquea solicitudes simultáneas. La vigencia se calcula conservadoramente desde el inicio de la petición: Apple 120 segundos, Google 300 según la respuesta del servidor. Los enlaces vencidos se retiran, los fallos permiten reintentar y las respuestas de otra sesión se descartan.
- La versión de presentación 16 actualiza las tarjetas existentes por la cola normal. Conserva serial, QR, identificadores Google, autenticación, promociones, historial y saldos.

## Ejecutar desde Downloads

```bash
cd ~/Downloads
bash loyalty_mejoras_wallet_v016.sh
```

El script exige 252 pruebas Kotlin/HTTP/PostgreSQL, la batería Python, Docker local y gateway antes del commit local automático. HTTPS se comprueba por separado. Guarda en Downloads un ZIP con el script exacto, código antes/después, pruebas, errores y registros redactados. Nunca incorpora credenciales, certificados ni pases. No hace push.

Si el túnel temporal sigue vigente se conserva. Si Cloudflare lo retiró, el proceso explica el fallo; este cambio no renueva el origen automáticamente. Recuperar la conexión de tarjetas ya emitidas sigue requiriendo la migración explícita existente.

## Comprobación visual

1. Abre Mi tarjeta en el panel del dueño, recarga la página y alterna Apple Wallet / Google Wallet. Cambia los estados de ejemplo; verifica que la promoción destacada, el premio y sus unidades coinciden.
2. En un registro nuevo o en una recuperación verificada por el dueño, prepara la tarjeta en el teléfono. Confirma el guardado dentro de Wallet.
3. Con una promoción de prueba, registra una compra y un canje desde caja. Verifica progreso, saldo e historial en Apple y Google. El botón Abrir y un PASS del servidor no prueban instalación ni recepción en el teléfono.

Las pruebas de navegador opcionales usan datos ficticios e interceptan la red:

```bash
npm ci --prefix scripts/ui
node scripts/ui/apple-wallet.spec.cjs
node scripts/ui/wallet-save.spec.cjs
```

Requieren Chromium de Playwright instalado o LOYALTY_UI_CHROMIUM apuntando a un ejecutable local. La distribución final en el teléfono la controla cada Wallet; la simulación no reproduce cada versión del sistema operativo.

Referencias de formato: https://developers.google.com/wallet/retail/loyalty-cards/resources/template y https://developer.apple.com/documentation/walletpasses/creating-a-store-card-pass

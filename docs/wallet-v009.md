# Loyalty v009: presentación nativa de Apple Wallet

La tarjeta de fidelización conserva el tipo `storeCard`. Apple controla su disposición y no ofrece el panel bancario “Latest Transactions” como componente de este tipo de pase.

## Cambios visibles

- Logo de Loyalty en el encabezado y estado breve de la membresía.
- Se conserva el saldo principal. Hasta otros dos programas se muestran junto al cliente; los programas siguen independientes, sin mezclar puntos, cashback ni sellos.
- Los detalles conservan el resumen de saldos y muestran un campo separado por cada uno de los últimos cinco movimientos: compra o canje, fecha y hora del negocio, importe o premio, y sucursal cuando está disponible.
- El formato mantiene el límite de campos que admite Apple. Wallet determina el tamaño de letra, el espaciado y el espacio del QR; no se modifica su interfaz bancaria.

## Instalar y comprobar

```bash
cd ~/Downloads
bash loyalty_mejorar_wallet_v009.sh
```

El instalador conserva `.env`, `.env.wallet`, claves, tarjetas y datos existentes. No cambia el Pass Type ID, serial, código QR, ni el token de autenticación del pase. No requiere otro registro ni exportar de nuevo certificados. La versión de presentación cambia a 7 para que el procesamiento de actualizaciones refresque las tarjetas ya emitidas.

Se ejecutan 146 pruebas Kotlin/HTTP/PostgreSQL, 86 pruebas Python y las comprobaciones de Docker/gateway antes del commit local. HTTPS se informa por separado. El ZIP de Downloads incluye el mismo `.sh`, cambios, pruebas, registros redactados y commit; excluye los secretos. No hace push.

Después de terminar, abre la tarjeta existente en Wallet. Para la prueba realizada el 4 de noviembre, si no hubo operaciones posteriores, se esperan 0,00 USD de cashback, 100 puntos y 2 sellos. En `⋯ → Detalles del pase` deben aparecer por separado las compras de 10 y 90 USD y el canje de “Beneficio de 5 USD”. La validación visual de este nuevo diseño requiere comprobarlo en el iPhone.

## Evidencia previa y límites

El usuario mostró la tarjeta instalada, la actualización de 0,50 a 5,00 USD y el descuento a 0,00 USD en Wallet; confirmó que los detalles se pueden abrir. Esta evidencia corresponde al diseño anterior. El ZIP v008 confirmó certificados Apple y HTTPS; Google continúa sin configurar. La política estricta de un único dispositivo físico sigue pendiente.

No se incorpora una web de historial para el cliente. El historial se consulta dentro de los detalles nativos de Wallet.

## Referencias de Apple

- https://developer.apple.com/documentation/walletpasses/creating-a-store-card-pass
- https://developer.apple.com/documentation/walletpasses/defining-the-metadata-of-your-wallet-pass

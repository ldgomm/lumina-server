# Loyalty v011r1: recuperar la conexión de Wallet

El estado `CORE_TESTS_PASS_LOCAL_DOCKER_PASS_COMMIT_CREATED_HTTPS_SETUP_FAILED` significa que las pruebas del servidor y el commit terminaron, pero no quedó verificado el acceso público que usa el teléfono.

El diagnóstico recibido muestra un túnel temporal descartado por Cloudflare (`Unauthorized: Tunnel not found`) y una dirección que ya no resuelve. Un contenedor en estado `running` no demuestra que el túnel siga conectado.

## Ejecutar

Con Docker Desktop abierto:

```bash
cd ~/Downloads
bash loyalty_reparar_conexion_wallet_v011r1.sh
```

Esta entrega instala la reparación, valida el código y Docker antes del commit, y después aplica la recuperación explícita `--renew-test-url`. El túnel se recrea una sola vez si Cloudflare informa que fue descartado; una conexión sana conserva su URL. Un fallo DNS aislado no autoriza reemplazar un túnel. Los modos named y external conservan su configuración.

Se mantienen los certificados, la clave de cifrado, la base de datos, los QR y los identificadores de los pases. No se modifican saldos ni se restaura la promoción eliminada. Los resultados, el mismo `.sh`, código antes/después y logs redactados quedan en el ZIP de Downloads.

## Actualizar la tarjeta que ya existe

Si cambió la URL, el teléfono todavía apunta a la anterior. La recuperación de HTTPS deja un paso pendiente en el dispositivo:

1. En el Mac, entra como dueño al panel del negocio y abre **Caja**.
2. Busca al cliente por cédula o escanea su tarjeta.
3. Abre **Actualizar o recuperar esta tarjeta** y elige **La tarjeta no actualiza: reparar conexión**.
4. Verifica al titular, marca la comprobación y pulsa **Crear enlace temporal**.
5. Escanea ese QR con la cámara del iPhone. En Safari pulsa **Recuperar mi tarjeta**, luego **Añadir a Apple Wallet**, abre la tarjeta y confirma el guardado.
6. Revisa los detalles: la promoción eliminada debe desaparecer y los demás saldos deben mantenerse.

No borres la tarjeta ni vuelvas a registrarte. El enlace conserva la misma afiliación, serial, token de Wallet y QR. Vence en cinco minutos y se usa una sola vez. Las sesiones web anteriores se invalidan al usarlo, como en la recuperación existente.

La guía privada `.local-wallet/guide.html` muestra estos pasos cuando la URL cambió. El resultado informa `EXISTING_PASS_CONNECTION_REFRESH`; `HTTPS_PASS` por sí solo no confirma que el iPhone ya recibió la nueva tarjeta.

## Continuidad

Los túneles temporales son para pruebas y pueden perder su dirección. Para mantener tarjetas instaladas se necesita un dominio estable conectado al gateway. La configuración named/external ya está disponible en la guía, sin publicar las rutas administrativas.

Referencias: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) y [Apple: Building a Pass](https://developer.apple.com/documentation/walletpasses/building-a-pass).

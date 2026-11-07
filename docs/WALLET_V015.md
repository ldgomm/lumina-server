# Wallet v015: Google y recuperación de conexión

La ejecución v014 compartida pasó 220 pruebas Kotlin/HTTP/PostgreSQL, 105 Python, Docker y 23 rutas del gateway. El fallo posterior fue `QUICK_TUNNEL_NOT_FOUND`: Cloudflare respondió `Unauthorized: Tunnel not found` aunque el contenedor seguía ejecutándose. Ese enlace temporal dejó de servir a las tarjetas instaladas.

## Instalar y recuperar la prueba

Desde Downloads:

```bash
cd ~/Downloads
bash loyalty_wallet_v015.sh --renew-test-url
```

El instalador modifica el proyecto Loyalty, verifica 239 pruebas Kotlin/HTTP/PostgreSQL, todas las Python, Docker y gateway, y crea el commit local únicamente después del PASS completo. Después verifica HTTPS. Genera un ZIP en Downloads con su .sh, código antes/después, resultados, logs y commit; excluye secretos. No hace push ni recrea la base.

`--renew-test-url` permite reemplazar un túnel temporal retirado. Conserva un túnel que sigue sano y nunca renueva solo por un error DNS/TLS. No arregla la caducidad futura del servicio temporal.

Si HTTPS se recupera con otra URL, el resultado termina en `WALLET_CONNECTION_REFRESH_PENDING`. En el panel del dueño:

1. Caja → buscar al cliente.
2. Actualizar o recuperar esta tarjeta → La tarjeta no actualiza: reparar conexión.
3. Verificar al titular y crear el enlace temporal.
4. Abrirlo en el iPhone → Recuperar mi tarjeta → Añadir a Apple Wallet → confirmar el guardado.
5. Registrar una compra de prueba y verificar saldo e historial desde Wallet.

Se actualiza la misma tarjeta: conservar serial, QR, token, cédula y saldos. No borrar la tarjeta ni registrarse otra vez. Una URL caída no puede comunicarle al pase que ahora existe otra URL. Guardar la tarjeta con la nueva conexión es un paso real en el teléfono, no una prueba del servidor.

## Dirección fija

Tras instalar v015, abre `.local-wallet/https-estable.html`. Incluye la ruta de Cloudflare y el destino `HTTP loyalty-wallet-gateway:8080`. Requiere un dominio propio con DNS en Cloudflare y un túnel administrado remotamente; el script no compra ni crea esos recursos.

Cuando estén preparados:

```bash
cd ~/Downloads
bash loyalty_wallet_v015.sh --wallet-only --configure-stable-https --renew-test-url
```

El asistente solicita dominio y token del túnel en Terminal. El token no se muestra ni forma parte del comando, Git o el ZIP. Configura `named`, conserva las claves de Apple/Google y verifica TLS, nonce y rutas. Nunca cambia a `quick` como fallback. Si se cambia el token, recarga ese conector; los siguientes arranques lo conservan. El dominio evita la caducidad del enlace temporal; la disponibilidad sigue dependiendo del Mac, Docker, red y proveedor. Para producción falta alojamiento permanente.

Si un intento falla, `.local-wallet/guide.html` muestra el fallo actual y el siguiente paso, y `.local-wallet/last-result.json` registra esa ejecución. Ya no se abre por encima la página de accesos cuando hay que recuperar la conexión.

## GoogleWalletExperience

- Promoción destacada y premio de menor costo dentro de esa promoción, igual criterio que Apple. Cantidades, nombres, porcentaje y metas vienen del negocio; no son reglas fijas de café o pizza.
- Campos nativos `loyaltyPoints` y `secondaryLoyaltyPoints`: por ejemplo `6/7` sellos y `1 sello` restante. Premio disponible requiere confirmación en caja. No se descuentan ni conceden saldos al renderizar.
- Colores y logo existentes del negocio; nombre breve al frente y completo en detalles. Google controla el diseño y el color de texto de su aplicación.
- Detalles de premios, saldos separados, últimos cinco movimientos ordenados con fecha local y sucursal, uso y avisos. Máximo diez módulos por objeto. Los registros monetarios se conservan completos; si hay demasiados para el cupo nativo, se indica cuántos quedan para consultar en caja.
- Promociones retiradas no aparecen. Ambos campos principales y la lista de módulos se envían en cada PATCH para reemplazar el estado anterior. El historial de canjes ya realizados permanece.
- Negocios suspendidos conservan saldos, muestran pausa y no invitan a canjear ni muestran anuncios. Esta entrega no envía campañas ni promete notificaciones recibidas.
- La versión de presentación 15 actualiza el contenido manteniendo IDs de objeto/clase, serial, QR y autenticación. La cuenta de servicio pertenece al servidor; los negocios no necesitan las cuentas personales Apple/Google del administrador.

Apple mantiene su presentación v014. La validación Android con un pase guardado y la publicación del emisor Google siguen siendo pasos independientes de las pruebas locales. No se afirma que se haya probado un teléfono desde el servidor.

## Verificación de esta entrega

En el entorno de desarrollo se ejecutaron las 106 pruebas de Kotlin/HTTP sin PostgreSQL y las pruebas Python. El instalador ejecuta las 133 pruebas PostgreSQL restantes, Docker y gateway en el Mac antes del commit. La compilación incluye las clases de pruebas PostgreSQL; no equivale a ejecutar esas pruebas con una base real. El resultado de HTTPS y la comprobación de los teléfonos se reportan por separado.

Fuentes de formato y conexión:

- [Google LoyaltyObject](https://developers.google.com/wallet/reference/rest/v1/loyaltyobject)
- [Google TextModuleData](https://developers.google.com/wallet/reference/rest/v1/TextModuleData)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Crear un túnel administrado](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)

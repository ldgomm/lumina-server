# Saldo y canjes en ambas Wallet

En el panel del dueño, entra en **Mi tarjeta**. Abre **Probar avance y canjes**. El bloque **Después de un canje** permite comparar el saldo inicial, el costo de un premio y lo que conservaría el cliente. Si el ejemplo aún no alcanza, pulsa **Probar con saldo suficiente**. Para probar sobrantes, abre **Probar avance y canjes** y elige **Saldo extra**.

**Ver después de un canje** cambia las vistas previas de Apple y Google. **Volver al saldo inicial** deshace la simulación. Ninguna de estas acciones registra operaciones ni requiere guardar el diseño. Cambiar de promoción o de ejemplo inicia otra simulación; cambiar colores o composición conserva el saldo mostrado.

Por ejemplo, con 12 sellos y un premio que cuesta 5, el saldo alcanza para 2 canjes de ese premio. Después de uno quedan 7 sellos, suficientes para otro. Las tarjetas muestran el saldo disponible y los detalles explican cuánto queda después de un canje. Los premios de una misma promoción comparten ese saldo: sus posibilidades no se suman. Caja sigue verificando condiciones y confirmando cada entrega.

La actualización conserva tarjetas, QR, saldos y movimientos. Se envía mediante el mecanismo existente de Apple y Google. No modifica las reglas de las promociones ni renueva el túnel HTTPS. Si el resultado indica `WALLET_CONNECTION_REFRESH_PENDING`, recupera la conexión de la misma tarjeta desde el panel del dueño; las pruebas del servidor no confirman que el teléfono ya recibió la actualización.

El instalador requiere v033. Comprueba 439 casos Kotlin/HTTP/PostgreSQL, las pruebas Python, Docker y el gateway antes de crear un commit local. Genera el ZIP de revisión en Downloads con el mismo script y evidencia redactada. HTTPS y la comprobación física en iPhone/Android se informan por separado. Los datos y las imágenes de las pruebas de interfaz son ficticios y no usan cuentas reales.

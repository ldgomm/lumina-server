# Apple y Google Wallet · v022

Esta entrega mejora ambas tarjetas y el editor del dueño. Es una actualización de presentación: conserva la misma tarjeta, QR, identificación, certificados, saldo e historial. No cambia reglas de premios ni ejecuta canjes.

## Lo que cambia

- Sellos ilustrados en casillas: completados, próximo sello y pendientes. Se mantiene el símbolo elegido por cada negocio.
- Puntos y cashback con barra proporcional. También se usa para metas de más de 20 sellos. El porcentaje visual se redondea hacia abajo, se limita al objetivo y nunca sustituye el saldo exacto.
- Apple: progreso visual en la franja; saldo y unidades como campos nativos. Primero se encuentran las condiciones del premio destacado, los saldos y los movimientos; después, los demás premios.
- Google: dos filas nativas con saldo, avance y nombre del premio. Los detalles se ordenan por premio, saldos, consumos, otros premios y ayuda. La clase comparte únicamente la estructura; el saldo y los datos privados pertenecen al objeto del cliente.
- Editor: estilos rápidos Navy, Café, Pizzería, Barbería y Boutique, todos ajustables. Aplicarlos cambia colores y símbolo, sin cambiar nombre, logo o promociones y sin guardar automáticamente.
- Vista previa de tarjeta nueva, acumulando, con premio y pausada, para las dos plataformas. Solo usa saldos de ejemplo. Una combinación de colores inválida indica qué campo corregir y permite reparación automática.

El saldo suficiente siempre requiere confirmación del canje en caja. Una membresía suspendida conserva saldos, pero no muestra avance gráfico ni invita a canjear. Las promociones pausadas/eliminadas no se ofrecen; sus movimientos históricos se conservan.

## Probar en el teléfono

1. Ejecutar el `.sh` desde Downloads con `--https`.
2. En el panel del dueño, abrir Diseño de tarjeta. Elegir una promoción destacada, revisar los ejemplos de Apple y Google y guardar el diseño deseado.
3. Abrir la tarjeta existente en ambos teléfonos. Comprobar saldo, avance, premio y detalle de la última compra o canje.
4. Si el resultado indica `WALLET_CONNECTION_REFRESH_PENDING`, usar **Actualizar o recuperar tarjeta** en la ficha del cliente, verificar al titular y seguir el enlace temporal de la misma tarjeta. No borrar la tarjeta ni registrar nuevamente al cliente.
5. Confirmar el cambio con una operación de prueba en el negocio de demostración. Las vistas previas no registran operaciones.

La entrega y la actualización en pantalla dependen de cada proveedor y de la conexión. El instalador no declara una prueba en teléfono como aprobada automáticamente. Si caduca un túnel temporal, su renovación sigue siendo explícita mediante `--renew-test-url`; no se cambia la URL de pases instalados de forma silenciosa.

## Límites de las plataformas

La tipografía, el tamaño final, el QR y los controles los decide cada Wallet. Las ilustraciones no incluyen textos ni importes. Apple usa las imágenes de franja compatibles existentes y escalas 1×, 2× y 3×. Google mantiene su formato recomendado de 1032 × 812; no se fuerza el formato de una tarjeta bancaria ni se simula su lista nativa de transacciones.

Fuentes oficiales consultadas el 7 de noviembre de 2026:

- [Apple · Wallet Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/wallet)
- [Google · Loyalty brand guidelines](https://developers.google.com/wallet/retail/loyalty-cards/resources/brand-guidelines)
- [Google · Loyalty templates](https://developers.google.com/wallet/retail/loyalty-cards/resources/template)

## Validación y compatibilidad

La versión de presentación pasa a 22 y el worker actualiza los pases existentes por las colas habituales. Se mantienen las rutas de imágenes v20 para enlaces anteriores; las nuevas usan v22. El gateway permite exclusivamente esas versiones y GET, con parámetros acotados.

La puerta de validación del instalador exige 160 pruebas generales + 176 PostgreSQL = 336, 123 pruebas Python, Docker y 36 comprobaciones del gateway antes del commit local. HTTPS y dispositivos tienen resultados separados. Ocho suites de interfaz usan red interceptada y datos ficticios, sin contactar proveedores ni clientes.

En la preparación se compilan también las pruebas PostgreSQL; su ejecución y Docker corresponden al Mac del usuario. El `.sh` conserva los parches tolerantes al formato de IntelliJ, detiene conflictos semánticos y crea el ZIP en Downloads, incluyendo el script exacto, código, resultados y registros redactados. No empaqueta archivos privados ni certificados.

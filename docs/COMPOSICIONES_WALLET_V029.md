# Tarjetas con composiciones propias · v029

Las 32 opciones anteriores eran paletas por rubro. Ahora la composición se elige por separado y se conserva al cambiar colores, símbolo o acabado. Hay seis diseños nuevos, además del medallón original para mantener las tarjetas existentes.

| Composición | Arte | Prioridad nativa |
| --- | --- | --- |
| Editorial | Símbolo grande desplazado, corte diagonal y avance lateral | Premio primero |
| Libreta | Hojas superpuestas, encuadernación y sellos sobre papel | Avance y premio juntos |
| Cupón | Talón, perforaciones y área de avance independiente | Premio primero |
| Mosaico | Piezas geométricas, contrastes y avance en la base | Saldo y pendiente primero |
| Cintas | Bandas curvas entrelazadas y símbolo lateral | Premio primero |
| Recorrido | Ruta con destino y paradas para sellos | Avance primero |

En Mi tarjeta: elegir composición, ajustar paleta y símbolo, comprobar Apple/Google y pulsar Guardar diseño. Las miniaturas comparan el mismo azul Navy, café y avance; el color no disfraza una estructura repetida. El medallón anterior sigue seleccionado en diseños antiguos hasta que el dueño decida cambiarlo.

Cada renderer genera Apple clásico 375×144, póster 358×448 y hero Google 1032×812. El póster incluye zonas limpias detrás de los textos nativos. No hay fuentes de emojis del servidor, datos personales o QR dentro de imágenes. Saldos y metas exactos permanecen como texto nativo accesible. Puntos y dinero usan proporción de avance; solo promociones de sellos usan unidades individuales. Al pausar o retirar una meta se elimina el avance activo.

Apple decide qué formato compatible muestra y mantiene la tipografía y colocación del QR. Google limita encabezados, filas e imágenes a sus componentes nativos. Las vistas del panel son orientativas; las ilustraciones sí son las mismas que genera el servidor. No se promete una interfaz de aplicación libre dentro de Wallet.

- Referencia Apple: https://developer.apple.com/design/human-interface-guidelines/wallet
- Póster Apple: https://developer.apple.com/documentation/walletpasses/creating-a-poster-generic-pass
- Plantillas de fidelización Google: https://developers.google.com/wallet/retail/loyalty-cards/resources/template

## Compatibilidad y comprobaciones

`WalletDesign.composition` es opcional con valor predeterminado SIGNATURE; no hay migración SQL. La presentación pasa a 29 sin cambiar seriales, QR, tokens, clases ni objetos Google. Las rutas v20/v22/v24/v27 conservan su dibujo anterior; las nuevas usan `/wallet/art/v29/{composition}/…` con valores acotados. El gateway solo permite GET y comprueba 61 casos.

El instalador exige 205 pruebas generales, 204 PostgreSQL, todas las Python, Docker y gateway antes del commit local. HTTPS se informa después. No se renueva el túnel automáticamente. El ZIP de Downloads contiene el instalador exacto, código antes/después y resultados redactados. El formateo de IntelliJ se compara por fragmentos de código y los conflictos de lógica se rechazan antes de escribir.

La prueba DOM `scripts/ui/wallet-compositions.dom.cjs` comprueba selección, independencia de paletas, campos conectados, ambos proveedores, simulaciones, guardado versionado y conflictos; `purchase-selection.dom.cjs` conserva la selección explícita de promociones en caja. Estas pruebas usan jsdom 26 solo en desarrollo. El servidor no requiere Node.

La instalación y recepción de cada diseño en iPhone/Android se confirman por separado. HTTPS_PASS no equivale a validación del teléfono.

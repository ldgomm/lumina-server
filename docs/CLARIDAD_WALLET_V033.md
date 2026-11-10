# Loyalty v033 · Una tarjeta más clara

## Qué cambia

En Mi tarjeta → Promoción y textos puedes elegir **Según el diseño**, **Primero el avance** o **Primero el premio**. La elección se aplica a los campos nativos de Apple y Google; la ilustración conserva su composición propia. Hasta que guardes, todo es un borrador. Los diseños existentes conservan su orden mediante Según el diseño.

**Revisar mis cambios** compara lo guardado con el borrador. Puedes volver al campo correspondiente con Editar. El resumen se reinicia después de guardar y no cuenta el avance ficticio, el formato Apple ni el proveedor de la vista previa como cambios.

**Leer los detalles de la tarjeta** muestra el nombre completo del premio, condiciones, saldo de ejemplo, meta e instrucciones. Un título largo puede acortarse en el frente nativo; el detalle conserva el texto completo. No se fabrican consumos de clientes. La vista previa mantiene el QR separado de la ilustración también al cambiar de ancho.

## Uso

1. Entra como dueño y abre Mi tarjeta.
2. En Promoción y textos, elige qué quieres destacar.
3. Usa Comparar ambas y prueba Cerca del premio o Con premio.
4. Abre los detalles y revisa los cambios.
5. Guarda el diseño. Se encola la actualización de las mismas tarjetas.

Un guardado confirmado no demuestra que un teléfono haya recibido la actualización. Si la conexión sigue pendiente por un cambio de túnel, recupera la conexión de la misma tarjeta desde el panel del dueño. No la elimines ni te registres de nuevo.

## Compatibilidad y alcance

WalletDesign añade frontFocus con valor predeterminado AUTO y validación de tres opciones. No hay migración SQL. Se conservan presentationVersion=32, el arte v32 y todos los endpoints anteriores. Un cambio explícito se distribuye mediante designVersion y la cola existente. Se mantienen los saldos, programas, promociones, código personal, seriales e identificadores de ambas plataformas.

Apple permite reordenar sus grupos nativos, con fallback clásico y póster. Google usa referencias del objeto y dos filas en los focos explícitos; la clase nunca incorpora datos del cliente. La fuente y distribución finales dependen del sistema.

Referencia técnica: [Plantillas de fidelización de Google](https://developers.google.com/wallet/retail/loyalty-cards/resources/template), [Wallet HIG de Apple](https://developer.apple.com/design/human-interface-guidelines/wallet).

## Verificación

El instalador exige 431 pruebas Kotlin/HTTP/PostgreSQL, 128 Python, LOCAL_STAGING_PASS y LOCAL_GATEWAY_PASS (88 controles) antes de crear un commit local. HTTPS se informa después y nunca se renueva el túnel automáticamente. El ZIP del Mac incluye script, cambios, pruebas y registros redactados; excluye credenciales, certificados y pases.

Pruebas de interfaz: wallet-clarity.dom.cjs y wallet-clarity.spec.cjs con datos ficticios. La segunda requiere Playwright y el renderer local configurado mediante LOYALTY_UI_ARTWORK_ORIGIN; no usa APIs del emisor ni tarjetas reales.

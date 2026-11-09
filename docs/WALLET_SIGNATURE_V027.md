# Wallet Signature v027

La tarjeta destaca tres cosas: saldo, cuánto falta y premio. En Apple clásico se elimina la fila de cuatro columnas. El titular, los saldos adicionales, condiciones y movimientos completos siguen en los detalles. No se modifica ninguna promoción, meta, logo personalizado ni saldo.

## Apariencia

- **Signature**: relieve cálido, emblema y detalles metalizados. Actualiza el acabado GRADIENT existente.
- **Aurora**: reflejos fríos, para marcas que prefieren azules y turquesas.
- **Esencial**: un acabado discreto sobre el color elegido; conserva SOLID.
- Hasta veinte sellos individuales; puntos, cashback y metas mayores usan anillo proporcional. La cantidad exacta y lo que falta son texto nativo, no parte del PNG.
- Ilustraciones vectoriales propias de café, pizza, compras y calzado en los emblemas principales; los 33 símbolos siguen disponibles. No depende de fuentes emoji instaladas en Docker.

## Apple y Google

Apple incluye `posterGeneric` y `storeCard` en el mismo pase. Los sistemas compatibles con el póster (iOS/watchOS 27+) eligen ese formato; anteriores mantienen la versión clásica. Se empaquetan artwork de 358×448 y strip de 375×144, ambos en tres escalas. La posición y tipografía finales dependen de Wallet; las vistas del panel son orientativas.

Google usa sus campos nativos, tres filas, hero 1032×812 y el mismo progreso. El premio aparece antes del avance. Cada objeto conserva su QR y sus datos; la clase compartida no contiene datos de personas. El nuevo acabado no genera mensajes de marketing ni convierte datos de fidelización en movimientos bancarios.

La revisión 27 encola una actualización de las tarjetas existentes. Preserva número de serie, token, identificadores Apple/Google, clave de cifrado, registro del dispositivo, saldos e historial. Si el túnel temporal dejó de funcionar, el instalador lo informa sin cambiarlo silenciosamente.

## Comprobación en tu Mac

Ejecuta el .sh desde Downloads. Aplica cambios tolerantes al formato, ejecuta 398 pruebas Kotlin/HTTP/PostgreSQL, las pruebas Python, Docker local y 50 controles del gateway. Crea el commit local solo después de aprobar ese gate. La fase HTTPS se informa aparte. El ZIP de resultado incluye el mismo .sh, fuentes y evidencia redactada. No contiene certificados, .env, claves o pases personales.

En Mi tarjeta puedes comparar Apple póster, Apple clásica y Google, y cambiar el acabado antes de guardar. En el teléfono conserva la tarjeta: revisa llegada del nuevo arte, saldo, pendiente y premio. Comprueba una compra y un canje en cada plataforma. HTTPS_PASS y las pruebas del servidor no sustituyen esa comprobación visual. No hay evidencia de recepción real del v027 en dispositivos en esta entrega.

## Referencias de implementación

- [Apple: Creating a Poster Generic Pass](https://developer.apple.com/documentation/walletpasses/creating-a-poster-generic-pass)
- [Apple: Wallet Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/wallet)
- [Google: Loyalty card customization](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/pass-customization)
- [Google: Loyalty brand guidelines](https://developers.google.com/wallet/retail/loyalty-cards/resources/brand-guidelines)

Consultadas el 9 de noviembre de 2026. Las reglas visuales siguen siendo distintas para cada proveedor; no se promete cambiar las fuentes nativas ni usar una pantalla bancaria de Apple Pay.

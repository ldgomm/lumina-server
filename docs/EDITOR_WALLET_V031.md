# Mi tarjeta · v031

Esta entrega simplifica el editor de Apple y Google Wallet. Conserva las diez composiciones y las 32 paletas de v030. La mejora se concentra en elegir, personalizar y revisar el diseño.

## Instalar desde Downloads

Descarga `loyalty_editor_wallet_v031.sh` y ejecuta:

```bash
cd ~/Downloads
bash loyalty_editor_wallet_v031.sh
```

El destino predeterminado es `/Users/ldgomm/Developer/pdc/sales/loyalty`. El instalador verifica cambios compatibles con el formato de IntelliJ, ejecuta las validaciones y crea un commit local después de aprobar el núcleo, PostgreSQL, Docker y el gateway. HTTPS se comprueba por separado. El ZIP de resultados se genera en Downloads e incluye el script ejecutado, código antes/después y registros redactados. Comparte ese ZIP para continuar.

## Usar el editor

1. Abre **Mi tarjeta**. En **Diseño**, elige la composición. “Explorar las 10 composiciones” muestra toda la colección.
2. En **Marca**, ajusta nombre, logo, paleta, símbolo y acabado. Una paleta conserva la composición y la promoción que elegiste.
3. En **Promoción y textos**, elige la promoción destacada y revisa el premio y la meta que se mostrarán. El editor muestra el premio activo de menor costo de esa promoción; no cambia las reglas ni mezcla sus saldos.
4. Pulsa **Revisar ambas Wallet** o **Comparar ambas**. En una pantalla amplia se ven juntas; en el teléfono, una debajo de otra.
5. Abre **Probar avance y formato** para comprobar acumulado, meta y faltante. Ambas vistas usan el mismo ejemplo. El saldo es ficticio y no registra compras ni canjes.
6. Usa **Volver a editar** y **Guardar diseño**. El guardado conserva el paso actual y el avance de ejemplo. Las tarjetas existentes reciben el diseño por el mecanismo de actualización de cada proveedor.

**Ver todo** permite trabajar con todos los ajustes abiertos. **Restaurar guardado** recupera la última versión confirmada por el servidor, sin enviar otra actualización.

Si el contraste impide guardar, **Revisar colores** abre el campo correspondiente; **Corregir colores** ajusta el texto y las etiquetas manteniendo tu fondo. Si falta un texto obligatorio, el editor abre su paso y enfoca el campo.

Al cambiar de sección o salir con cambios pendientes, **Seguir editando** conserva el borrador. **Salir sin guardar** lo descarta. No se guarda el borrador en el navegador. La recarga utiliza el aviso nativo del navegador, cuyo texto decide cada navegador.

## Alcance

El editor usa ilustraciones del servidor con datos ficticios. Apple y Google controlan los campos nativos y la presentación final en el dispositivo. Esta entrega conserva `presentationVersion=30` y las rutas de ilustración v30. No cambia reglas de promociones, saldos, identificadores, QR ni certificados.

Si el resultado sigue indicando `WALLET_CONNECTION_REFRESH_PENDING`, aún falta actualizar la conexión de la tarjeta instalada desde el panel del dueño. Este cambio del editor no renueva automáticamente una URL temporal de Cloudflare ni demuestra que un dispositivo haya recibido el diseño.

## Verificación

- 207 pruebas unitarias/HTTP Kotlin verificadas en el entorno de preparación.
- 127 pruebas Python del instalador y asistentes.
- Interacción con scripts reales: composición, selección de promociones y flujo del editor.
- Navegador: diez composiciones, 32 paletas, comparación, navegación de teclado, campos ocultos, descarte y conflictos de versión; anchos de 320, 390, 1024 y 1440 px.
- Parche: aplicación completa, espacios de IntelliJ, repetición idempotente y rechazo de conflictos de lógica antes de escribir. SQL inmutable.

PostgreSQL, Docker, gateway, HTTPS y los teléfonos requieren la ejecución en el equipo de destino; no se declaran aprobados por estas comprobaciones del editor. El instalador mantiene los requisitos de 204 pruebas PostgreSQL y 76 comprobaciones del gateway antes del commit.

Referencias de plataforma: [Apple Wallet](https://developer.apple.com/design/human-interface-guidelines/wallet) · [Personalización de tarjetas de fidelización de Google](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/pass-customization).

# Estudio de tarjetas · v030

## Qué cambia

La colección incorpora tres composiciones con estructuras diferentes: **Panorama**, un paisaje en capas con el avance en primer plano; **Precisión**, una retícula con indicador abierto para puntos y una colección de casillas para sellos; y **Atelier**, un collage de papel con la marca y la colección separados. Se suman a las seis de v029 y al medallón original.

Las diez composiciones se adaptan a Apple clásico, Apple póster y Google Wallet. Los 32 tipos de negocio siguen siendo paletas y símbolos que se pueden combinar con cualquiera de ellas. Cambiar una paleta conserva la composición, el acabado y la promoción.

## Cómo usarlo

1. Abre **Mi tarjeta**. Verás las tres novedades y tu diseño actual. **Explorar las 10 composiciones** abre la colección completa.
2. Pulsa **Comparar con mis colores y símbolo** para comparar todas las composiciones con tu marca y el mismo avance. Este botón solo cambia la vista previa.
3. Elige composición, colores, logo, símbolo y promoción destacada.
4. En **Ver tarjeta**, alterna Apple y Google. Mueve **Prueba el avance de un cliente**: Acumulado, Meta y Faltan muestran cantidades en puntos, sellos o dinero, según la promoción. El control no registra compras ni modifica saldos. Cambiar la promoción reinicia el ejemplo.
5. **Cambios sin guardar** identifica el borrador. **Restaurar guardado** recupera el último diseño cargado; **Guardar diseño** envía el nuevo diseño a las tarjetas existentes. El botón se activa únicamente si hay cambios y el diseño es válido.

En pantallas pequeñas, los botones **Diseñar** y **Ver tarjeta** llevan directamente a cada sección. Se respeta la preferencia del sistema para reducir animaciones.

## Compatibilidad

- Se conservan la tarjeta, el QR, los identificadores Apple/Google, los saldos y el historial. No hay migraciones SQL nuevas.
- Las rutas gráficas v29 y anteriores mantienen sus contratos. Los tres diseños nuevos usan v30.
- Textos, valores exactos y QR son campos nativos. No se dibujan dentro de las imágenes. La fuente y la distribución final dependen de cada Wallet.
- Una tarjeta sin premio elegible o pausada no muestra avance hacia un premio. Puntos y dinero no se convierten en sellos.
- Las imágenes del editor son las del servidor; la distribución del pase es una aproximación. La recepción y el aspecto final se comprueban en los teléfonos.

## Ejecutar desde Downloads

```bash
cd ~/Downloads
bash loyalty_estudio_wallet_v030.sh
```

Parte del v029 comprobado. Tolera espacios y reordenamiento de imports de IntelliJ. Si encuentra un cambio de lógica incompatible, lo informa antes de escribir. Repetir el mismo instalador es idempotente.

El instalador exige 207 pruebas generales y 204 de PostgreSQL real, todas las Python (127), Docker local y 76 controles del gateway antes del commit local. HTTPS se verifica después y se informa por separado. Genera en Downloads un ZIP con el propio script, código antes/después, comprobaciones y registros redactados. No hace push ni renueva automáticamente el túnel.

Si el resultado conserva `WALLET_CONNECTION_REFRESH_PENDING`, actualiza la conexión de **la misma tarjeta** desde el panel. No la elimines ni registres otra para cambiar su apariencia.

## Referencias de diseño

- [Apple · Wallet Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/wallet)
- [Apple · Creating a poster generic pass](https://developer.apple.com/documentation/walletpasses/creating-a-poster-generic-pass)
- [Google · Loyalty pass customization](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/pass-customization)

Google utiliza referencias a campos del objeto en sus plantillas, sin guardar datos del cliente en la clase compartida. Apple conserva `storeCard` como respaldo del póster. Ningún diseño simula el historial bancario de Apple Pay.

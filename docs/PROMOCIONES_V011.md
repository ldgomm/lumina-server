# Loyalty v011: pausar y eliminar promociones

Con Docker Desktop abierto, ejecutar desde Downloads:

```bash
cd ~/Downloads
bash loyalty_eliminar_promociones_v011.sh
```

El instalador admite v010r1 y v010r2 y conserva el editor guiado de colores. Instala la función; ninguna promoción se elimina al ejecutar el script.

## Pausar

Dueño → **Promociones** → **Editar promoción** → desmarcar **Promoción activa** → **Guardar cambios**.

La promoción y sus premios dejan de aparecer en el registro del cliente, en los saldos y progreso de Wallet y en las opciones del cajero. No permiten acumular ni canjear. Los saldos se conservan y vuelven a estar disponibles al reactivarla. El dueño la sigue viendo como pausada para administrarla.

## Eliminar definitivamente

Dueño → **Promociones** → **Eliminar definitivamente**.

El aviso muestra el nombre, clientes con saldo o reservas, saldo disponible, saldo reservado, canjes pendientes y premios vinculados. Para confirmar se debe aceptar expresamente la pérdida de saldos y escribir **ELIMINAR**. **Conservar promoción** cierra el aviso sin cambiar datos.

Se puede eliminar una promoción activa o pausada aunque tenga clientes con saldo. La eliminación afecta a todas las sucursales de ese negocio: retira la promoción, anula sus saldos pendientes y cancela sus canjes reservados. No se puede reactivar ni recuperar ese saldo desde el sistema. Las demás promociones, sus saldos y la tarjeta del cliente continúan funcionando.

Si una compra, un canje o un cambio de configuración modifica el impacto después de abrir el aviso, el servidor rechaza la confirmación anterior. **Actualizar aviso** carga los importes vigentes y exige volver a confirmar. Los reintentos de una misma eliminación no descuentan dos veces.

Las compras, premios ya entregados y la auditoría se conservan en el historial del negocio. Se registra la anulación del saldo para que las cuentas sigan siendo verificables; la eliminación no borra comprobantes históricos. Los detalles actuales de Wallet omiten los premios y saldos de promociones pausadas o eliminadas.

## Tarjetas instaladas

Se solicita la actualización de todas las tarjetas emitidas del negocio, incluso las que no tenían saldo. Se conservan sus identificadores, QR y configuración. El servidor aplica la pausa o eliminación de inmediato; la tarjeta del teléfono puede tardar en reflejarla y necesita conectividad, el servidor y HTTPS funcionando.

En el iPhone, comprobar que desaparezcan el saldo y el progreso de la promoción y permanezcan los demás. No es necesario volver a registrarse ni crear otra tarjeta.

## Validación y resultado

El script exige 190 pruebas Kotlin/HTTP/PostgreSQL, incluidas 21 de concurrencia, al menos 90 pruebas Python, Docker local y gateway antes del commit local automático. HTTPS se verifica después y se informa por separado. Las comprobaciones realizadas con PGlite no sustituyen las de PostgreSQL nativo que ejecuta el instalador.

El ZIP de Downloads incluye el mismo `.sh`, código antes y después, resultados, errores y registros redactados. Se mantienen privados los archivos de entorno, certificados, claves y credenciales. Se preservan los datos del piloto, la configuración y el formato de IntelliJ. El instalador se detiene ante cambios de lógica incompatibles sin sustituirlos a ciegas.

# Loyalty v021 · Gestión e informes

Parte del ZIP aprobado v020r1 y del commit `0ded1e9a22c8fba3e8085ef600cd40477be8d0fe`.

## Qué cambia

- **Mi negocio:** razón social, RUC, actividad y ubicación protegidos en pantalla y servidor. Contacto, página web y redes se pueden editar. El dueño solicita correcciones; el administrador registra la verificación, guarda el cambio y responde desde la ficha. Una solicitud no altera datos por sí sola.
- **Promociones:** asistente de beneficio, reglas y revisión. Sellos, descuentos, puntos y cashback con ejemplos editables. Promoción y premio se crean juntos; se conserva el editor avanzado y las acciones de pausar/eliminar.
- **Montos:** botones −1/+1 y flechas del teclado cambian una unidad monetaria. Se pueden escribir centavos. Se conservan los importes reales y la precisión de los saldos.
- **Referencias:** opciones de folio corto o UUID, generadas a petición. Un código existente no se reemplaza. No son facturas tributarias ni identificadores de la tarjeta.
- **Eventos y cumpleaños:** títulos y mensajes sugeridos y editables. Selección aleatoria entre dos y ocho opciones, con una elección guardada por cliente y año, igual en Apple y Google. Conserva el texto del día ante reintentos y cambios de configuración. Pausar oculta la felicitación.
- **Informes:** tarjetas de cifras, tendencia diaria, exploración por día, repetición de compra, crecimiento de registros, ventas por sucursal, categorías compradas y premios reclamados. Períodos de 7, 30, 90 o 365 días y exportación diaria CSV. La misma vista está disponible para el administrador dentro de cada negocio.

## Comprobación visual después del PASS

1. En **Mi negocio**, confirma los campos protegidos. Prueba guardar una red y enviar una solicitud de corrección. En administración, entra al negocio, revisa la solicitud y registra motivo al corregir un dato fijo.
2. En **Promociones → Crear**, elige un tipo, modifica sus reglas y revisa el resumen antes de crearlo. Los ejemplos no son reglas fijas.
3. En **Eventos y cumpleaños**, elige selección aleatoria y al menos dos textos. Revisa los mensajes y guarda. Se aplican solo a clientes con consentimiento y cumpleaños registrado.
4. En **Informes**, compara períodos, cambia entre monto/compras/compradores y explora un día. Revisa sucursales y exporta CSV. La comparación incluye días completos anteriores y el día actual parcial.
5. Comprueba el contenido del cumpleaños en ambas Wallet con un cliente de prueba autorizado. Deben tener conexión vigente. El resultado técnico no confirma por sí solo la recepción en iPhone o Android.

Los mensajes actualizan los detalles de Wallet. No son SMS, correo ni WhatsApp, y no garantizan alertas en pantalla bloqueada. La automatización usa la zona del negocio, celebra el 29 de febrero el 28 en años no bisiestos y requiere el servidor funcionando. Los gráficos no incluyen ventas externas, utilidades ni atribución de campañas.

## Instalador y validación

Ejecutar desde Downloads:

```bash
bash ./loyalty_experiencia_e_informes_v021.sh --https
```

El script aplica regiones de código conservando reformateos, añade V009 y ejecuta 328 pruebas Kotlin/HTTP/PostgreSQL, pruebas Python, Docker local y 31 comprobaciones del gateway. Solo entonces hace commit local; no hace push. HTTPS se comprueba después y se informa por separado.

El ZIP de Downloads incluye el propio `.sh`, cambios, código antes/después, manifiesto de lo probado, informes de pruebas, registros redactados y commit. Excluye certificados, credenciales, pases y configuración privada. No elimina bases, volúmenes, saldos ni promociones.

Si existe `WALLET_CONNECTION_REFRESH_PENDING`, sigue pendiente guardar la misma tarjeta con la conexión vigente desde el flujo visible de recuperación. Esta entrega no borra la marca ni renueva automáticamente un túnel retirado.

Verificación previa de la entrega: compilación de todo el código y pruebas generales, Python e interfaz con datos ficticios. PostgreSQL, Docker y HTTPS deben validarse ejecutando el `.sh` en el Mac; las pruebas de teléfono siguen siendo independientes. No declarar PASS completo con resultados parciales.

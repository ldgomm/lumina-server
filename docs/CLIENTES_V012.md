# Loyalty v012: clientes, regreso y premios

Desde Downloads, con Docker Desktop abierto:

```bash
cd ~/Downloads
bash loyalty_clientes_y_premios_v012.sh
```

Después entra como dueño a `http://localhost:8097/` y abre **Mis clientes**.

## Lo que muestra

- Resumen de 7, 30 o 90 días: comprobantes, importe neto pagado, compradores y premios confirmados.
- Entre los compradores del período, cuántos ya tienen más de una compra registrada. Es una medida descriptiva; no una tasa de retención por cohortes.
- Lista de todo el historial, búsqueda por nombre y grupos: Todos, A un sello, Con premio, Han vuelto, Sin volver y Sin compras.
- Días sin volver configurables entre 1 y 365, calculados desde la última compra en la zona horaria del negocio.
- Al abrir un cliente: nombres de sus premios, progreso, últimas compras y productos, sucursales, descuentos, canjes y preferencias de cumpleaños.

El resumen considera todas las sucursales del negocio y no cambia al buscar un nombre o elegir un grupo. El período comienza a medianoche local e incluye el día actual hasta el momento de consulta. La lista es histórica y muestra 50 clientes por página. **Actualizar** vuelve a consultar; no implica seguimiento en tiempo real.

**A un sello** exige progreso positivo y exactamente un sello disponible pendiente de la meta. **Con premio** incluye premios activos cubiertos por saldo disponible. Los saldos reservados no están disponibles. No se suman saldos de distintas promociones. Los premios que usan un mismo saldo son alternativas: dos premios visibles no significan que se puedan consumir los dos. Caja verifica identidad, solicitud, condiciones y saldo vigente al canjear.

Las promociones pausadas o eliminadas y los premios desactivados no aparecen en el progreso ni en esos grupos. Los consumos y canjes confirmados se conservan en el historial. **Sin compras** es distinto de **Sin volver**: un cliente que todavía no compró no cuenta como inactivo.

## Avisos existentes

Se mantiene el progreso en Wallet y el aviso de cambio de Apple al faltar un sello o quedar disponible un premio, sujeto a la entrega y preferencias del teléfono. Los cumpleaños y eventos siguen apareciendo como contenido de la tarjeta, sin convertirlos en alertas publicitarias en la pantalla bloqueada. Esta entrega no envía nuevos mensajes a clientes ni cambia sus permisos.

## Verificación y datos

Esta versión añade 12 pruebas PostgreSQL de períodos, dinero neto, filtros, reservas, pausas, eliminación, permisos, separación entre negocios, paginación y lectura sin modificar saldos. La validación completa del instalador exige **203 pruebas Kotlin/HTTP/PostgreSQL**, las 105 pruebas Python y Docker/gateway antes del commit local. HTTPS se revisa después por separado.

No hay migraciones nuevas. Se conservan V001–V007, registros, certificados, configuración privada, QR e identidades de las tarjetas. El instalador admite el formato de IntelliJ; si cambió la lógica de una región que necesita modificar, conserva el archivo y genera evidencia para revisarlo. No hace push.

El ZIP en Downloads contiene el mismo `.sh`, código antes/después, comprobaciones, logs redactados, fallos y referencia del commit. No incluye credenciales, pases ni certificados. La URL HTTPS actual se conserva si el túnel sigue sano; esta versión no autoriza por defecto una renovación de la URL.

Google Wallet, un dominio HTTPS estable para producción y la política de un dispositivo siguen pendientes de configuración o comprobación específica. La confirmación del usuario sobre la recuperación de Apple no equivale a validar esos otros puntos.

# Loyalty v040 · Administración integral

Esta entrega amplía las siete secciones de Administración para el dueño y el administrador de plataforma. El color principal continúa siendo Navy. Se trabaja sobre v039 y se conservan las credenciales, la base de datos y las identidades de Apple y Google Wallet.

## Qué cambia

| Sección | Cambios y flujo |
|---|---|
| Centro de control | Resumen de sucursales, personas con acceso, saldo emitido y vencimiento. Reúne avisos, ficha pendiente, solicitudes de corrección y locales sin cajero asignado. Acceso directo a las siete secciones y al estado de ambas Wallet. |
| Mi negocio | Identidad fiscal, categoría y ubicación en una ficha protegida. Contacto y redes editables, revisión antes de guardar, restauración del borrador y solicitudes de corrección con ayudas de redacción. |
| Sucursales | Directorio con búsqueda predictiva por nombre/código, 25 resultados por página y actividad de 30 días. Alta y edición con motivo, control de versiones y accesos al equipo y la operación de cada local. |
| Equipo y accesos | Buscar y filtrar por estado, sucursal, rol y permiso; ordenar por nombre, sucursal o fecha de alta. Presets para compras, premios o ambos; explicación del alcance antes de guardar. Editar y gestionar el acceso están separados. Los filtros permanecen después de un cambio. |
| Actividad | Filtros rápidos, chips del alcance, expansión de los detalles y copia del comprobante. Las correcciones de sucursal muestran antes/después, motivo y responsable. Se conserva el CSV completo del período filtrado. |
| Operación y equipo | Navegación entre bloques del informe, filtros visibles y acceso a comprobantes del día seleccionado o del responsable. Comparación por sucursal y equipo con el mismo período. |
| Mi cuenta | Membresía y estado en primer plano, fechas legibles, distinción del vencimiento más antiguo y el próximo cargo. Pestañas para cargos/pagos, búsqueda y filtro por estado de la página cargada, exportación de los registros visibles. |
| Informes | Navegación por bloques y acceso desde un día o sucursal a sus operaciones. Conserva evolución, repetición, altas, productos, premios, cobertura y descarga de datos diarios. |

El administrador abre **Administrar** en el resumen global de un negocio y entra en su centro de control. Opera con su propia credencial y también mantiene membresías, estado, avisos y clientes. El dueño dispone de su menú habitual y del nuevo **Centro de control** en Administración.

## Sucursales: identidad e historial

Crear un local lo incorpora al mismo negocio; los clientes siguen usando su tarjeta actual. No se trasladan saldos entre negocios independientes.

Editar corrige nombre/código, conserva el identificador de la sucursal y requiere un motivo. Si otra persona ya la editó, se conserva el borrador y se ofrece recargar la versión vigente. Reintentar el mismo guardado no crea otra sucursal ni otro evento. La actividad conserva responsable y valores anteriores/nuevos.

Las listas muestran el nombre actual de la sucursal. No se reescriben las compras ni los nombres históricos de sus responsables. Esta entrega no añade eliminación de sucursales con operaciones.

Un dueño puede operar en todas sus sucursales. «Sin cajero asignado» es una señal de organización, no significa que el local esté cerrado o sin permiso para operar. «Personas con acceso» cuenta credenciales activas; no indica quién está conectado en este momento.

## Formularios y credenciales

- Los borradores viven en memoria y se revisan antes de abandonar el formulario. No se recuperan después de cerrar el navegador.
- Un error de red conserva los datos y la clave del intento. Un conflicto de revisión requiere consultar la versión vigente.
- Cambiar de negocio o sesión descarta las respuestas y diálogos anteriores.
- Razón social, RUC, actividad, categoría y ubicación requieren revisión del administrador. El RUC se valida por formato; no se certifica ante el SRI.
- Desactivar o eliminar un acceso conserva el historial. Reactivar o renovar produce una credencial nueva; se muestra una sola vez. Se mantienen las protecciones del último dueño y del acceso propio.

## Interpretar y exportar los datos

El centro consulta únicamente cargos ya emitidos. No genera cargos al abrirlo ni prueba la conexión pública de Wallet. Las métricas de sucursales son de los últimos 30 días, desde la medianoche local del primer día hasta la consulta; los canjes cuentan solo entregas confirmadas.

La búsqueda, filtro y CSV de **Mi cuenta** corresponden exclusivamente a la página cargada, hasta 100 cargos y 100 pagos. El texto junto al filtro indica cuántos registros se están mostrando. Las páginas anteriores/siguientes permiten consultar más registros. No se presenta ese CSV como un estado de cuenta completo.

El CSV de **Actividad** conserva el alcance completo de sus filtros y hasta 10.000 registros. Si los supera, exige reducir el período o filtrar; no recorta silenciosamente. Ambos CSV protegen las celdas contra fórmulas y conservan decimales.

No sumar compradores de distintas sucursales o días como personas únicas. La repetición de compra del período no es una tasa de retención. Los pagos de membresía son registros administrativos: no ejecutan débitos bancarios ni sustituyen facturas fiscales.

## Ejecutar

```bash
cd ~/Downloads
bash loyalty_administracion_v040.sh
```

Destino: `/Users/ldgomm/Developer/pdc/sales/loyalty`.

El instalador comprueba y aplica cambios sobre v039. Admite formato e imports equivalentes de IntelliJ; una modificación incompatible de lógica detiene el parche antes de escribirlo parcialmente. Puedes repetirlo. Para revisar compatibilidad sin aplicar ni hacer commit:

```bash
bash loyalty_administracion_v040.sh --check-only
```

Después de aplicar, ejecuta 570 pruebas Kotlin/HTTP/PostgreSQL (276 generales + 294 PostgreSQL), las 128 de Python y Docker/gateway (113 comprobaciones). Solo con esos resultados aprobados crea un commit local; no hace push. Si cambias el código durante la comprobación, valida otra vez el estado guardado. El ZIP de Downloads conserva el mismo `.sh`, fuentes antes/después, resultado y registros depurados.

V013 agrega revisión y fecha de actualización a sucursales. V001–V012 permanecen intactas. No se regeneran claves, QR, seriales ni certificados. La presentación nativa sigue en versión 34 y el arte en v32.

HTTPS se informa por separado después del commit. No se renueva automáticamente el túnel ni se cambia la dirección de tarjetas instaladas. El estado `WALLET_CONNECTION_REFRESH_PENDING` sigue requiriendo actualizar la conexión de la misma tarjeta desde el panel y el teléfono.

## Verificaciones de desarrollo

`administration.spec.cjs` recorre los siete destinos en 1440, 1024, 390 y 320 px con datos ficticios y red interceptada: sucursales, filtros, conflictos, reintentos, revisión/restauración de ficha, CSV, contexto de los informes, plataforma y cambios de sesión.

Se mantienen las regresiones `management`, `operations`, `owner-experience`, `navy-workspace`, `business-categories`, `wallet-health`, `counter-rewards` e `integral-experience`. Esta última utiliza el renderer local real de las imágenes de Wallet. La comprobación de teléfonos y el Docker del Mac son independientes de la validación del entorno de desarrollo.

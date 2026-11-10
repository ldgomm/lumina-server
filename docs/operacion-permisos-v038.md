# Operación, permisos e informes · v038

## Qué cambia

Dueños y administradores pueden consultar **Operación y equipo** para ver compras, importe pagado, premios, días con actividad y clientes que compran en días distintos. Los filtros de fechas, sucursal y responsable se aplican a todos los indicadores, gráficos y descargas de esta sección.

Incluye evolución diaria con un control para explorar cada día, comparación con el período anterior, resumen por persona o sucursal, mapa de compras por día de la semana y hora, premios entregados y acceso al historial de cada responsable. En móvil, el mapa se desplaza horizontalmente; cada celda también se puede consultar con teclado. Las fechas siguen la zona horaria del negocio.

La portada de plataforma conserva sus estadísticas globales. Dentro de cada negocio están sus informes, clientes, actividad y equipo, usando la autenticación del administrador. El dueño tiene estos controles dentro de su negocio.

## Permisos de caja

En **Equipo y accesos → Añadir usuario / Editar**, el rol Caja permite configurar por separado:

| Permiso | Qué permite |
| --- | --- |
| Registrar compras | Guardar compras y aplicar las promociones seleccionadas. |
| Entregar premios | Confirmar canjes directos y canjes previamente reservados. |
| Ambos | Las operaciones anteriores y aplicar un premio dentro de una compra. |

Cada cajero sigue vinculado a una sucursal. Para suspender todo su acceso, usa **Desactivar**; no se permite guardar un cajero sin ningún permiso. El rol Dueño conserva ambos permisos y la administración completa del negocio.

Los usuarios existentes mantienen sus permisos y credenciales. La migración añade ambos permisos como habilitados, para no cortar la operación actual. Edita cada acceso si necesitas separarlos. No se crean ni envían credenciales nuevas por actualizar a v038.

El servidor comprueba los permisos actuales antes de registrar una operación o devolver un intento repetido. No basta con ocultar botones. Si otro dueño cambia permisos mientras una operación espera, se rechaza el acceso anterior sin registrar la compra. El usuario debe volver a iniciar sesión para cargar su configuración actual; su credencial sigue siendo la misma salvo que se renueve o retire explícitamente.

Los cambios quedan en **Actividad** con responsable, motivo y permisos anteriores/nuevos. Continúan los controles de baja propia, último dueño activo, credenciales de un solo uso en pantalla y conflictos de edición.

## Elegir fechas y revisar cifras

- Usa 7, 30, 90 o 365 días, o **Elegir fechas** para un intervalo de hasta 366 días.
- El día final pasado incluye el día completo. Si eliges hoy, incluye hasta la hora de consulta.
- La comparación usa la misma cantidad de días anteriores y los mismos filtros. Se indican ambos intervalos; el día actual puede estar incompleto.
- **Ver comprobantes** abre las compras y entregas que respaldan el informe. Mantiene filtros y hora de corte.
- El resumen de personas incluye accesos retirados que tengan actividad. Renombrar o retirar un acceso no borra su historia.

Las compras y entregas son hechos separados. Una compra con premio aporta una compra y una entrega; el importe no se duplica. Total pagado excluye el descuento, que se informa aparte. La compra media es total pagado dividido entre compras.

“Compraron en más de un día” cuenta compradores con compras en al menos dos fechas locales dentro del intervalo filtrado. No equivale a retención ni demuestra el efecto de una promoción. Los clientes de distintas sucursales o empleados no se suman para calcular clientes únicos.

La lista muestra hasta 200 responsables o sucursales por actividad, y hasta 20 premios. Se informa el número de grupos; los indicadores superiores incluyen todos. La búsqueda y el orden de la lista trabajan sobre los grupos mostrados. El CSV permite revisar los movimientos completos del filtro.

El informe usa las operaciones registradas en Loyalty. No estima ventas externas, utilidad, horas trabajadas o productividad. Los nombres de productos dependen de que se hayan capturado productos al registrar la compra.

## Descargar actividad

**Descargar operaciones CSV** exporta compras y premios del informe. En **Actividad**, **Descargar CSV** respeta el tipo de evento, búsqueda, fechas, sucursal y responsable elegidos.

La descarga incluye todas las páginas del filtro, no solo las 50 filas visibles: fecha local y zona, tipo, identificador, responsable, cliente, sucursal, comprobante, importes exactos, premio, promoción, costo, concepto, acumulación y productos registrados. No incluye credenciales, hashes de acceso ni QR personales.

El límite es 10.000 movimientos por descarga. Si se supera, el servidor pide reducir el período o los filtros; nunca entrega un archivo incompleto silenciosamente. Los textos se escapan para evitar que una hoja de cálculo los interprete como fórmulas. El CSV usa UTF-8, separador punto y coma y campos entre comillas. Contiene datos de clientes y debe conservarse de forma privada.

La consulta tiene una hora de corte estable. Exportar después de realizar compras nuevas conserva el corte del informe; pulsa **Aplicar filtros** o **Actualizar** para iniciar una consulta nueva.

## Instalación y validación

Requiere v037. Descarga `loyalty_operacion_permisos_v038.sh` en Downloads y ejecuta:

```bash
cd ~/Downloads
bash loyalty_operacion_permisos_v038.sh
```

El instalador aplica cambios puntuales, acepta reformateo de IntelliJ y orden de imports, y detiene la actualización antes de escribir si encuentra un conflicto en la lógica que necesita modificar. Añade V011 y conserva V001–V010, datos, saldos e identidades de Apple y Google Wallet. Mantiene `presentationVersion=34` y arte v32.

Verifica 268 pruebas unitarias/HTTP y 260 PostgreSQL, las 128 pruebas Python, Docker local y 101 comprobaciones del gateway antes del auto commit local. No hace push. El ZIP de Downloads contiene el mismo `.sh`, código antes/después, resultados, registros redactados y datos del commit; excluye secretos y archivos privados.

La fase HTTPS se informa por separado. Un túnel temporal retirado no se renueva automáticamente. Esta entrega no cambia las URLs de los pases ni solicita volver a registrarse. La recepción de actualizaciones en iPhone y Android sigue necesitando evidencia del dispositivo.

Pruebas de interfaz: `scripts/ui/operations.spec.cjs`, `management.spec.cjs` y `counter-rewards.spec.cjs`, con datos ficticios y red interceptada. Cubren permisos, filtros, desglose por responsable, exportación/reintentos, teclado, pantallas pequeñas, cambios de vista y ausencia de almacenamiento persistente de credenciales. No sustituyen las pruebas de Docker en el Mac.

# Loyalty v039 · Centro de tarjetas

El dueño entra en **Estado de tarjetas**, dentro de Fidelización. El administrador abre un negocio y elige la pestaña **Estado de tarjetas**. Ambos consultan el mismo estado técnico con su propia credencial.

## Qué incluye

- Apple y Google en una sola pantalla, con búsqueda por nombre, filtros por proveedor/estado y páginas de 25 registros.
- Prioridad para errores, falta de configuración y tarjetas Apple sin conexión registrada.
- Explicaciones concretas del siguiente paso y códigos acotados para soporte.
- Reintento manual de la misma tarjeta, con motivo, responsable, fecha y protección contra duplicados.
- Acceso del dueño a la ficha del cliente para actualizar o recuperar su conexión mediante el flujo existente de verificación de identidad.
- Últimas ocho solicitudes del negocio y registro completo en Actividad.

Las métricas cuentan registros por proveedor: un cliente puede aparecer para Apple y Google. No cuentan personas únicas ni instalaciones confirmadas. Los filtros se aplican tanto al resumen como a la lista.

## Cómo interpretar los estados

| Estado | Significado | Acción |
|---|---|---|
| Sin preparar | Aún no se preparó el pase para ese proveedor | Completar el guardado desde el registro o recuperación autorizada |
| Revisar configuración | El pase existe pero el proveedor no está habilitado en este servidor | El administrador revisa configuración y credenciales |
| Conectar la tarjeta | Apple no tiene un registro de dispositivo para este pase | El dueño revisa la misma tarjeta con el cliente |
| En espera de reintento | El último envío falló | Leer el motivo; el worker conserva su reintento automático |
| Actualización pendiente | Falta preparar contenido o enviar su versión actual | Mantener servidor y conexión disponibles; volver a consultar |
| Solicitud procesada | Se completó el envío al proveedor | Abrir la tarjeta en el teléfono para comprobar el resultado |

Una solicitud procesada no prueba que el teléfono recibió o mostró la actualización. Google puede aceptar un objeto aunque el cliente aún no lo haya guardado. Apple requiere que el dispositivo consulte el servidor después del aviso.

## Reintento seguro

1. Consulta el estado y corrige la causa indicada cuando corresponda.
2. Pulsa **Solicitar reintento**, escribe el motivo y confirma.
3. Vuelve a consultar después. El botón queda limitado durante un minuto por tarjeta/proveedor.

El servidor valida la versión consultada y la autorización vigente. Repetir una petición idéntica no genera otro evento. Cada proveedor tiene su propio intervalo. El envío se programa para el worker; la solicitud HTTP no contacta a Apple ni Google. No cambia saldos, promociones, QR, claves, seriales o identificadores de los pases. No genera campañas ni mensajes de cumpleaños.

También se corrige una condición de concurrencia: un fallo tardío del proveedor ya no retrasa un reintento o contenido más reciente.

## HTTPS

El panel no comprueba desde Internet la disponibilidad de HTTPS ni cambia el dominio. Si Cloudflare retiró un túnel temporal con tarjetas emitidas, conserva la recuperación explícita:

```bash
python3 /Users/ldgomm/Developer/pdc/sales/loyalty/scripts/wallet_local.py start --renew-test-url
```

Después el dueño debe actualizar la conexión de la misma tarjeta desde la ficha del cliente. No eliminar la tarjeta ni registrarse otra vez. La dirección temporal sigue siendo temporal; el proyecto conserva el asistente explícito para un dominio fijo.

## Instalación y comprobaciones

```bash
cd ~/Downloads
bash loyalty_centro_tarjetas_v039.sh
```

V039 requiere v038. El instalador exige 550 pruebas Kotlin/HTTP/PostgreSQL, todas las Python, Docker local y 105 verificaciones del gateway antes de crear el commit local. No hace push. HTTPS se informa por separado. El ZIP de Downloads incluye el mismo .sh, código y evidencia depurada; excluye secretos y credenciales.

V012 solo agrega dos fechas operativas a la entrega y un índice por serial. Las fechas de envíos anteriores permanecen desconocidas; nunca se inventan. V001–V011 permanecen intactas. presentationVersion sigue en 34; el arte nativo continúa en v32.

Validación visual aislada: `scripts/ui/wallet-health.spec.cjs`, más regresión de operaciones, equipo y caja. Solo datos ficticios y red interceptada. El instalador se verifica con código original, cambios de formato, segunda ejecución y conflictos sin escrituras parciales. La validación real de iPhone y Android sigue siendo independiente.

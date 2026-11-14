# Lúmina v020 / Loyalty v059 — negocios y cuenta más claros

Actualización para el resultado confirmado de v019, commit `ae546963fafbbe57a2bacc14f3429f096e887472`.

## Qué mejora

- **Clientes:** búsqueda por negocio, responsable, teléfono o correo; tolera tildes y mayúsculas. Filtros de estado y verificación, orden y páginas de 25 negocios. Los cambios pendientes aparecen primero. Administrar, Consultar negocio y Ver equipo conservan accesos directos.
- **Estado del negocio:** cada opción muestra su efecto antes de confirmarla. Los cambios pendientes siguen bloqueados hasta sincronizar Wallet. Se conserva el motivo, la revisión y el historial. La agencia continúa identificada como agencia.
- **Cuenta:** tres vistas, Resumen, Cargos y Pagos. Saldo pendiente, vencido y vencimiento se distinguen de la próxima renovación. La tarifa mensual/anual y la promoción conservan sus condiciones vigentes.
- **Cargos:** cada cargo muestra total, importe pagado y saldo. Los formularios de pago y corrección se despliegan solo cuando se necesitan. El historial se pagina por la vista que se está consultando.
- **Comprobantes:** cada pago tiene una página compartida por administración y el dueño del negocio, impresión y descarga de texto. Indica referencia, medio, fecha, concepto, importe y saldo actual del cargo. Si se revierte, lo muestra expresamente. No sustituye una factura tributaria ni acredita una operación bancaria.
- **Interrupciones:** conserva el intento de pago, referencia e identificador de reintento aunque el servidor ya haya registrado el importe completo. Se puede comprobar el mismo envío sin duplicarlo. También conserva los borradores de cargos y correcciones.

Un pago registrado es un movimiento de cuenta confirmado por administración. No es un cobro automático a una tarjeta o cuenta bancaria. La idempotencia protege el mismo envío; no detecta dos cargos distintos que describan el mismo acuerdo.

## Acceso y continuidad

La agencia administra estados, cargos y pagos; no solicita servicios ni acepta suscripciones en nombre del dueño. El dueño consulta únicamente su cuenta y sus comprobantes. Los colaboradores no reciben acceso comercial. Una suspensión conserva el acceso del dueño a cuenta, comprobantes y ayuda, manteniendo bloqueadas las operaciones de servicios.

La consulta de un comprobante nativo es una transacción de lectura: no genera cargos, modifica permisos ni contacta a Apple o Google. Revalida el propietario y limita todas las consultas al negocio. Los dos endpoints privados nuevos quedan fuera del gateway público.

No cambia la tarifa de USD 4,99 mensuales o USD 50 anuales por sucursal, la promoción hasta el 31-12-2026, el consentimiento ni los acuerdos anteriores. No modifica SQL, esquema SQLite8, claves, credenciales existentes, dominios, vínculos, seriales, objetos Google, dispositivos, diseños ni saldos de Wallet. No cambia la versión de representación de los pases.

Se conserva el despliegue de un único proceso escritor de Lúmina. No habilita varios escritores ni proporciona una garantía de disponibilidad absoluta. Apple y Google siguen controlando cuándo se refleja una actualización en el dispositivo.

## Instalación local

Abre Docker Desktop, detén la Terminal anterior de Lúmina con Control+C y ejecuta:

```bash
bash ~/Downloads/lumina_digital_cuenta_clara_v020.sh --iniciar
```

El instalador valida compatibilidad antes de escribir, rechaza cambios incompatibles y ejecuta las comprobaciones completas antes del commit local. No hace push ni despliega. En Terminal imprime `RESULTADO=...` y, solo tras comprobar el arranque, `Lúmina Digital disponible en http://127.0.0.1:8099` (o el puerto configurado).

Para comprobar compatibilidad sin instalar:

```bash
bash ~/Downloads/lumina_digital_cuenta_clara_v020.sh --comprobar
```

## Evidencia y límites

- 24 suites / 247 pruebas HTTP del portal.
- 169 pruebas Python.
- 304 pruebas nativas de unidad/HTTP y 338 PostgreSQL: 642 en total; compilación e instalación de la distribución verificadas.
- 17 suites DOM, incluyendo consecuencias de estados, validación de importes, recuperación del borrador y acción explícita de impresión. No equivalen a una comprobación visual.
- Prueba de navegador reproducible en `scripts/ui/lumina-billing.spec.mjs`, con datos ficticios, anchos 320/390/1024/1440, administración/dueño, impresión y funcionamiento sin JavaScript. Su ejecución visual permanece **pendiente**: Chromium local no pudo iniciar y el navegador remoto no alcanzó el servidor de prueba de este entorno.
- Docker y 116 comprobaciones de gateway se ejecutan en el Mac antes del commit. La entrega física de actualizaciones Apple/Google requiere prueba con dispositivos.

El resultado generado por el instalador es la evidencia de su ejecución en el Mac. No reutilizar el paquete de producción v055: al retomar el despliegue debe construirse una candidata nueva desde el commit validado y seguir las verificaciones de identidad y continuidad existentes. Este instalador no modifica servidores de producción.

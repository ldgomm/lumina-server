# Lúmina v013 / Loyalty v052 — Wallet para colaboradores y campañas

La base de esta entrega es el código real del resultado v051r1 del 12 de noviembre de 2026, commit `919e9f58c4dfcdaf9daad84e8ba51f8723082744`. Aquella versión pasó Kotlin, PostgreSQL y Docker en el Mac. Esta entrega debe pasar sus propias comprobaciones antes de crear otro commit.

## Acceso del equipo

- Wallet abre directamente Caja para un colaborador con asignación activa, aunque también tenga otras áreas de Wallet.
- Caja comparte la estructura y dimensiones del módulo Wallet. Mantiene la sucursal y las operaciones autorizadas: compras, canjes o ambas. No muestra diseño, configuración, equipo ni un QR que no puede abrir.
- Las otras áreas asignadas se abren con la misma cuenta y ofrecen regreso a Caja. Tener acceso a Caja no concede ninguna de ellas.
- En **Equipo y permisos → persona**, la primera sección es **Wallet · Compras y canjes**. El dueño elige sucursal, selecciona operaciones y guarda. Las opciones rápidas sólo rellenan el formulario; no conceden permisos antes de guardar.
- Consultar solicitudes de Wallet no equivale a operar Caja. Las cuentas existentes de consulta no se convierten automáticamente en cajeros. Si el acceso no estaba asignado, el dueño debe habilitarlo una vez; el colaborador puede abrir Wallet con su misma sesión.
- Los descuentos aplicados a una compra requieren compras y canjes. El perfil de sólo canjes permite entregar premios directos; se mantienen los controles nativos de identidad, consentimiento, saldo, versión y recibo.
- La agencia continúa en consulta; no opera como el negocio. Las comprobaciones del servidor, la revocación inmediata y las restricciones por empresa/sucursal siguen siendo obligatorias.

## Viernes Negro

- Agencia: resumen de campañas disponibles, programadas, finalizadas y retiradas; creación desplegable, precio habitual, ahorro, condiciones y fechas legibles. Se conserva el borrador si falla una validación.
- Negocio: catálogo con ahorro visible, condiciones desplegables y claridad del primer período mensual. Las contrataciones siguen centralizadas en Lúmina.
- Wallet: resumen de campañas vigentes, futuras, pausadas y finalizadas. Caja consulta sólo campañas en vigencia para su sucursal; esa consulta no concede configuración ni garantiza saldo para un premio.
- Toda campaña pertenece a un noviembre/año. El cierre máximo es **1 de diciembre, 00:00 de Ecuador continental**; una fecha anterior también se respeta. No vuelve a activarse al llegar el noviembre siguiente. Los trabajos aceptados, saldos e historial se conservan.

## Instalación

Con Docker Desktop abierto, detén la Terminal anterior de Lúmina con Control+C y ejecuta:

```bash
bash ~/Downloads/lumina_digital_wallet_equipo_v013.sh --iniciar
```

El script reconoce la base v051r1 y su propia actualización; rechaza cambios ajenos antes de escribir. Guarda evidencia en Descargas y sólo crea commit local cuando pasan todos los controles. No hace push. La Terminal muestra una línea RESULTADO y, si se confirma el arranque, `Lúmina Digital disponible en http://127.0.0.1:8099` (o el puerto configurado).

## Validación y conservación

En el entorno de preparación: 152 pruebas HTTP del portal, 130 pruebas Python y suites de interacción DOM con datos ficticios. La suite `scripts/ui/lumina-cashier.dom.mjs` recorre la UI real, sesión, portal y puente restringido hasta los recibos de compra y canje; el motor remoto es una fixture. No equivale a una prueba en un teléfono ni a revisión visual del navegador.

En el Mac: se exigen de nuevo las 596 pruebas nativas, incluidas PostgreSQL, Docker local y gateway antes del commit. Apple/Google físicos y revisión visual permanecen pendientes hasta tener evidencia real. El código Kotlin, las migraciones, claves, certificados, identidades de tarjetas, vínculos, datos, saldos y configuración HTTPS no se modifican en esta entrega.

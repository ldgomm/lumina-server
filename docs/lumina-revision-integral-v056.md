# Lúmina v017 · Revisión de flujos y experiencia

Actualización local sobre Loyalty v055 (`4baa7968`). El despliegue queda pausado.

## Qué cambia

| Recorrido | Mejora aplicada |
| --- | --- |
| Inicio de agencia | Resumen compacto, accesos a producción, clientes y equipos; las tareas ocupan el espacio que antes usaba la presentación. |
| Inicio del negocio | Acceso a Web, Maps y Marca según permisos, además de Wallet, Contenido y paquetes. |
| Solicitudes | Estado explicado, siguiente paso, filtros que se pueden limpiar y protección frente al reenvío del mismo formulario. |
| Contenido | El formulario se recoge cuando hay trabajos existentes. Las entregas aparecen antes que las visitas; la revisión pendiente se abre y el historial queda desplegable. |
| Web, Maps y Marca | Los enlaces abren el trabajo como dueño o colaborador. La consulta de la agencia conserva su modo de solo lectura. |
| Paquetes | Solo aparecen totales de las modalidades presentes. Cada propuesta indica quién debe actuar. Los errores conservan precios, fechas, condiciones y versión del borrador. |
| Google Maps | Corregida la excepción al mostrar ubicaciones con herramientas de reseñas. El negocio consulta y la agencia registra su trabajo desde su área. |
| Métricas | Los filtros conservan el negocio seleccionado y el modo de consulta o producción. Se mantienen las mediciones separadas por plataforma. |
| Registro e ingreso | Los errores vuelven al formulario con los datos de contacto. No se vuelven a imprimir contraseñas ni códigos privados. |
| Navegación | Selección activa coherente en rutas de agencia, tablas accesibles por teclado y tamaños compartidos de barra lateral. |
| Formularios | Aviso al salir con cambios sin enviar, bloqueo de doble envío y restauración de botones al regresar. Los borradores no se guardan en almacenamiento del navegador. |
| Equipo | El editor conserva un único bloque de Wallet y un único guardado. Corregida la restauración del botón al regresar; se verifican los controles de permisos existentes. |

## Reglas conservadas

- La agencia trabaja con su propia identidad: no solicita, contrata ni aprueba como negocio.
- Los colaboradores tienen únicamente sus permisos y su sucursal de Caja. Compras y canjes no conceden diseño, promociones o administración.
- Una pieza de contenido se solicita una sola vez. Las redes se eligen al registrar publicaciones y métricas.
- La cortesía, el teléfono de contacto y las contrataciones centralizadas en Lúmina se conservan.
- El precio a cotizar no se convierte en cero. Mensualidad y pago único se mantienen separados; aceptar no ejecuta cobros bancarios.
- Viernes Negro mantiene su caducidad al terminar noviembre del año correspondiente. No se cambian acuerdos ya aceptados.

## Continuidad de Wallet

No se modifica el esquema PostgreSQL/SQLite, las migraciones existentes, los identificadores de negocios o tarjetas, las claves, los certificados, los emisores ni los proveedores Apple/Google. El instalador no accede a producción ni regenera credenciales. Los archivos privados y las bases reales no forman parte del paquete.

Esto es una actualización de código para validar localmente, no una garantía de disponibilidad absoluta ni una prueba física de recepción en los teléfonos.

## Comprobaciones

- 21 suites y 210 pruebas de dominio/HTTP del portal, sin omisiones. Incluyen doce regresiones nuevas: reenvíos, aislamiento, errores de formulario, rutas por rol, Maps, métricas, selección y conflictos de cotización.
- 160 pruebas Python del flujo de instalación y operación.
- Ocho suites de interacción DOM: cuenta, campañas, Caja, administración, experiencia práctica, navegación de equipos, editor de permisos y nuevos flujos.
- El instalador exige además las 608 pruebas Kotlin/HTTP/PostgreSQL y Docker/gateway local antes del commit. Nunca hace push.
- La comprobación visual con Chromium no pudo ejecutarse en este entorno por la restricción de sockets del navegador. Se incluye la prueba de navegador para 320, 390, 1024 y 1440 px; los ensayos DOM no certifican el diseño visual.
- Apple y Google en dispositivos físicos, y la validación de despliegue, siguen siendo comprobaciones separadas en el entorno del usuario.

## Aplicación

Detén la Terminal que mantiene abierto Lúmina con Control+C y deja Docker Desktop disponible. Desde Descargas:

```bash
bash lumina_digital_revision_integral_v017.sh --iniciar
```

La actualización comprueba los archivos esperados antes de escribir. Rechaza cambios incompatibles, conserva configuración y datos, y restaura las fuentes previas si falla la compilación o alguna de las pruebas principales. Guarda el diagnóstico fuera del repositorio. Solo crea commit si pasa la validación completa.

La Terminal imprime una línea `RESULTADO=...` y, si se confirma el arranque, `Lúmina Digital disponible en http://127.0.0.1:8099`.

Para comprobar compatibilidad sin instalar:

```bash
bash lumina_digital_revision_integral_v017.sh --comprobar
```

El paquete de producción v055 ya preparado no contiene esta revisión. Cuando se retome el despliegue, deberá prepararse una versión nueva a partir del commit validado.

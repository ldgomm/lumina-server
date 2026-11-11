# Lúmina v007 / Loyalty v046

Base confirmada: commit `e7b3af172c32ca839cb3869064ef6cdae7df32eb`, Loyalty v045. Esta actualización no cambia el esquema SQLite v4, las migraciones PostgreSQL V001–V014, los certificados, los identificadores de tarjetas ni la asociación de cada negocio.

## Contenido como módulo propio

`/contenido` tiene cabecera, menú lateral, contexto del negocio y botón **Volver a Lúmina** propios. Mantiene la sesión de Lúmina. Solicitudes, producción, revisión, entregas, publicaciones, métricas, agenda y fichas de solicitudes sociales usan esta interfaz; los demás servicios permanecen en el portal general.

El negocio solicita **Video**, **Fotografías** o **Diseño para redes** y explica su idea. La cantidad adicional es opcional y vale una pieza de forma predeterminada. La grabación se solicita desde su agenda. El video de cortesía no pide formato ni red social. Las plataformas se registran al publicar y medir.

Los formatos históricos conservan sus claves. Al producir una solicitud simplificada, la agencia puede elegir un cupo compatible del contrato: Video admite VIDEO/REEL/SHORT/EDITING; Fotografías, PHOTO; Diseño, GRAPHIC/POST/CAROUSEL/STORY/COPY/PUBLICATION. La elección del cupo es explícita; no se reescriben contratos ni se suman unidades de servicios diferentes. Cada pieza reserva y consume una sola unidad del servicio elegido.

## Identidad y permisos

| Área | Negocio y equipo autorizado | Agencia |
| --- | --- | --- |
| Solicitar contenido, visitas o cotización | Según permisos; cotización y cortesía corresponden al dueño | Prohibido |
| Seleccionar paquetes y renovar | Dueño | Prohibido |
| Aceptar propuesta | Dueño | Prohibido |
| Aprobar una pieza | Dueño o permiso de aprobación aplicable | Prohibido |
| Consultar información del negocio | Según permisos | Lectura explícita, conservando identidad de agencia |
| Producción, evidencias, publicaciones, métricas y cotizaciones | Consulta y revisión según permisos | Trabajo de Lúmina, registrado con su propia identidad |
| Promociones, tarjetas y Caja | Dueño o delegación correspondiente | Prohibido |
| Consultar Wallet | Según permisos | Lecturas limitadas al tenant seleccionado |
| Reparar acceso interno bloqueado | Dueño del mismo negocio, con confirmación y motivo | Prohibido |

Las rutas habituales con `empresa` muestran la consulta del negocio en modo lectura. El trabajo del proveedor se abre en `/agencia/...`, con autenticación de agencia y operaciones limitadas a producción/comercialización de Lúmina. Este prefijo nunca habilita solicitudes, aprobaciones o Wallet de dueño. Las pantallas omiten controles de edición en consulta y el servidor bloquea también envíos manuales y URLs antiguas.

Se elimina la conversión `AGENCY → OWNER`. Consultar Wallet no aprovisiona negocios ni credenciales. Las filas antiguas de acceso de agencia quedan conservadas e inutilizables por el portal: no se descifran ni utilizan. Las consultas administrativas permitidas usan únicamente GET y verifican el tenant; el proxy rechaza todas sus escrituras. No se rotan credenciales de negocios o tarjetas durante la actualización.

## Ejecución y evidencia

1. Mantener Docker Desktop abierto.
2. Detener la Terminal anterior de Lúmina con Control+C.
3. Ejecutar `bash ~/Downloads/lumina_digital_contenido_accesos_v007.sh --iniciar`.
4. Abrir `http://127.0.0.1:8099/contenido` con la cuenta del negocio.

La Terminal emite exactamente una línea `RESULTADO=...`. No se imprime PASS hasta que el checkpoint confirma todas sus verificaciones y el commit local. Con `--iniciar`, también se verifica que el portal arranque antes de imprimir el resultado. La Terminal permanece ocupada mientras el portal funciona; Control+C lo detiene.

Los detalles se conservan en el archivo `lumina_contenido_accesos_v007_resultado_*.zip` de Downloads. Un error se consulta en `RESULTADO.json` y en los logs incluidos. La salida del proceso del portal se guarda exclusivamente en `.local-staging/lumina-portal.log`, con permisos privados; no se incluye en la evidencia porque puede contener el código de configuración inicial.

`--comprobar` verifica compatibilidad y los contratos del portal sin instalar, compilar Kotlin ni generar un commit. Su resultado es `COMPATIBLE_SIN_INSTALAR`, nunca el PASS completo.

La instalación rechaza archivos modificados que no correspondan a la base confirmada o a esta actualización ya aplicada. Conserva archivos privados y devuelve los bytes originales si falla una escritura parcial. El checkpoint vuelve a validar el código real instalado y solo crea un commit local tras superar los gates; no hace push.

## Verificación

- 68 pruebas HTTP/dominio/arranque del portal en diez suites, incluidas doce regresiones de aislamiento, roles y módulo independiente.
- 130 pruebas Python, incluidas salida silenciosa de preflight/fallo y evidencia persistente.
- En el Mac: 580 casos Kotlin/PostgreSQL, Docker local y las 114 comprobaciones existentes del gateway antes del commit.
- Comprobaciones del instalador: conflicto, aplicación, segunda ejecución, rollback, protección de archivos privados, un único resultado en éxito/fallo, arranque real con datos ficticios.
- La inspección visual real y recepción de cambios en teléfonos Apple/Google permanecen pendientes. El entorno de preparación no pudo iniciar Chromium. Las pruebas HTTP no sustituyen esa revisión.

Revisión manual sugerida: entrar como negocio, abrir Contenido y volver a Lúmina; solicitar cada una de las tres opciones; entrar como agencia y comprobar la consulta en lectura; tramitar una pieza desde Producción y aprobarla desde la cuenta del negocio; comprobar la Wallet existente en ambos teléfonos sin eliminar tarjetas.

# Lúmina v011 / Loyalty v050 — revisión de flujos y equipo

Base: resultado real de v010/v049, commit `9e2ca76931a56cf7c9a28997afaa1003b7a6daed`. Esta actualización conserva el motor Wallet y revisa los recorridos del portal, con cambios concentrados en los problemas encontrados. No sustituye los datos del negocio por un demo.

## Equipo y permisos

Equipo abre un directorio con búsqueda por nombre/correo, filtros de estado y área, y páginas de 20 personas. Cada fila muestra el acceso asignado y distingue cuenta activa, invitación pendiente, código vencido y persona desactivada. El dueño conserva el control del equipo; la agencia y los colaboradores no pueden gestionar ni consultar este directorio.

Añadir persona pide nombre, correo y tareas. Las bases Solo Caja, Contenido y Consulta de servicios ayudan a empezar; se pueden ajustar antes de guardar. Cambiar una base no guarda automáticamente ni reemplaza el borrador sin avisar. Una vista lateral resume el acceso efectivo. Las tareas de Wallet y las limitaciones por red se despliegan cuando hacen falta. Precios, contratos y equipo quedan reservados al dueño.

Consultar, solicitar y aprobar son permisos distintos. Modificar una tarjeta o promoción requiere su permiso operativo de edición, además del acceso a Wallet. Consultar informes no concede edición. Caja tiene sucursal, compras y canjes independientes. Un acceso por red conserva sus límites de publicaciones y métricas; aprobar una pieza común requiere permiso de aprobación de Contenido para redes.

La ficha permite revisar permisos, asignar Caja, corregir nombre/correo y ver los últimos 30 cambios, con actor, fecha y diferencias. La auditoría completa se conserva. Los códigos no se guardan en claro en el historial ni se envían automáticamente. Copiar un código exige pulsar el botón.

Cada alta usa un código de un solo uso válido por 48 horas. Renovarlo explica que cerrará las sesiones y reemplazará la contraseña anterior por una nueva activación. Corregir el correo cierra sesiones y anula códigos pendientes. Todos los cambios de acceso llevan revisión: una pestaña antigua no puede sobrescribir permisos, cambiar Caja, desactivar o reactivar una cuenta que cambió después.

Desactivar bloquea todos los accesos en Lúmina y cierra las sesiones inmediatamente. El sistema intenta retirar Caja en Wallet en la misma operación. Si Wallet no responde, Caja permanece bloqueada y la ficha permite completar el retiro. Guardar permisos de una persona inactiva no la reactiva. Reabrir su acceso requiere una activación explícita. Retirar solo Caja mantiene los demás permisos asignados.

Los errores de formulario conservan los datos enviados y abren la sección que requiere atención. Un conflicto conserva la versión antigua para que no se pueda volver a enviar el mismo borrador sobre cambios ajenos sin revisar el acceso vigente. Un retiro que ya bloqueó Caja presenta la revisión actual para poder completar esa misma baja.

## Wallet y separación de accesos

Wallet sigue abriendo directamente y comparte la sesión de Lúmina. Los colaboradores con permiso de consulta ven esa condición; se ocultan controles de creación y se bloquean los formularios de modificación conocidos. El servidor valida de nuevo cada operación, aunque se manipule el navegador. La respuesta del panel delegado se limita a los datos necesarios y no declara permisos de compras o canjes; Caja usa su propia asignación.

La recuperación de un acceso Wallet exige la revisión vigente de la persona y comprueba sus áreas antes y después de contactar con el motor. No recupera un acceso al que se le retiraron las áreas operativas mientras se efectuaba la reparación. Las llamadas de Caja vuelven a comprobar la sesión y el acceso antes de devolver una respuesta. Las escrituras de Caja exigen origen y token CSRF, preservando la referencia de idempotencia.

No se modifican Kotlin, PostgreSQL, las migraciones SQLite existentes, el emisor Apple/Google, seriales, QR, URLs públicas, saldos, claves ni archivos privados. La base sigue en SQLite v5. No se recrean tenants ni se rotan credenciales por instalar esta versión. Las rotaciones explícitas de recuperación conservan el mecanismo existente y ahora tienen comprobaciones adicionales.

## Revisión de los recorridos

| Recorrido revisado | Resultado y límites comprobados |
| --- | --- |
| Registro e ingreso | Negocio propio, Wallet preparada, misma sesión, códigos de agencia cerrados después del alta, protección de contraseñas y caducidad. |
| Inicio y navegación | Accesos y pendientes filtrados por permiso y negocio; ancho común de Lúmina/Contenido/Wallet, menú móvil, foco y regreso a Lúmina. |
| Solicitud y cortesía | Teléfono guardado por solicitud, formatos esenciales, sin selección de redes, borrador ante errores, cortesía única y sin cargo. |
| Producción y revisión | Agencia produce con su identidad; negocio o persona autorizada revisa. Versiones, evidencias, visitas y cupos permanecen separados. |
| Grabaciones | Se corrige el orden de Contenido: las visitas programadas más próximas aparecen primero, seguidas del historial. |
| Publicaciones y métricas | Una pieza común y resultados por plataforma; permisos y tenant aplicados también en las funciones de lectura, conteos y filtros. Cortes manuales no se presentan como sincronización automática. |
| Google Maps | Ubicaciones, reseñas y mediciones permanecen en su negocio. Se refuerza la validación de empresa en lecturas reutilizadas por otros módulos. |
| Web y Marca | Solicitudes y entregas bajo los mismos controles de actor/empresa. Marca sigue siendo trabajo puntual. |
| Paquetes y servicios | Individuales y combinados; cantidades, mensual/puntual separados; precios publicados o por cotizar; aceptación de la propuesta vigente; activación y renovación explícitas. Sin cobro automático. |
| Cuenta y administración | Mi cuenta, equipo, informes y contratación se gestionan en Lúmina; Wallet mantiene operaciones de fidelización. |
| Agencia | Consulta de cada negocio de solo lectura. Producción y cotización en su espacio explícito; nunca se suplanta al dueño. |
| Actualización | Comparación de archivos, conflictos, restauración de escrituras parciales, conservación de datos privados y pruebas antes de commit. |

WhatsApp Business e IA sigue marcado como Próximamente. No se han inventado tarifas, conexiones externas, publicaciones automáticas ni nuevas capacidades comerciales.

## Validación y ejecución

El gate exige 130 pruebas del portal en 14 suites, sin omisiones. Incluye escenarios de permisos, invitaciones, revocación con Wallet caído, cambios simultáneos, respuestas en vuelo y aislamiento entre negocios. La interacción DOM usa los scripts reales de Equipo, Wallet, administración, solicitudes, catálogo y navegación con datos ficticios. Los controles del instalador prueban instalación, segunda ejecución, conflictos y recuperación parcial.

El Mac debe ejecutar sus 130 pruebas Python, 580 pruebas nativas Kotlin/HTTP/PostgreSQL, Docker local y 114 comprobaciones de gateway antes de crear un commit local. Nunca se hace push. Las pruebas del portal o DOM no certifican la renderización real en Safari ni la recepción en Apple/Google Wallet: esas verificaciones se informan por separado.

Con Docker Desktop abierto, detener la Terminal anterior de Lúmina con Control+C y ejecutar:

```sh
bash ~/Downloads/lumina_digital_equipo_v011.sh --iniciar
```

`--comprobar` verifica la compatibilidad y el portal sin instalar. La instalación conserva archivos locales incompatibles y termina sin sobreescribirlos. La evidencia contiene los cambios y resultados, sin claves ni datos privados.

La Terminal imprime `RESULTADO=...`. Con `--iniciar`, después de verificar disponibilidad, imprime también `Lúmina Digital disponible en http://127.0.0.1:8099` (o el puerto configurado). El detalle del arranque queda en el registro privado. Control+C detiene el portal.

# Mi cuenta y preparación de producción — Lúmina v016r2 / Loyalty v055

La revisión v016r2 declara explícitamente la anotación de JUnit en `ProductionGuardPostgresTest.kt` y configura Hikari con el esquema temporal que crea la prueba. La primera corrección resuelve el fallo de compilación del Mac. La segunda permite ejecutar los cuatro casos con PostgreSQL. Se mantiene la validación de todas las suites antes del commit.

La revisión v016r1 corrige las pruebas de producción que fallaban cuando macOS proporcionaba un directorio temporal a través de un enlace simbólico. Las pruebas resuelven la ruta real de sus datos ficticios y el instalador guarda el resultado completo del portal si falla. La comprobación de archivos privados de producción mantiene sus restricciones.

## Una cuenta para todos los módulos

Mi cuenta reúne el perfil, rol real, espacio de trabajo, cambio de contraseña y sesiones para agencia, dueño y colaborador. Cerrar sesión se encuentra únicamente aquí. El encabezado principal, Contenido, Wallet y Caja llevan a la misma cuenta. Volver a Lúmina continúa siendo navegación y no cierra la sesión.

El cambio de contraseña exige la actual y confirmación de la nueva; cierra las sesiones anteriores y abre una nueva. También se pueden cerrar las otras sesiones conservando la actual. Todas las acciones exigen sesión y CSRF y afectan únicamente a la cuenta autenticada. No cambia el negocio, rol, permisos ni credenciales internas de Wallet. Los enlaces de Caja y Wallet mantienen los controles de operaciones y borradores pendientes.

El acceso a Equipos y roles de v015 está incluido: dueño con su editor y agencia con consulta. Nunca se convierte a la agencia en dueño ni se modifican roles basándose en nombres o capturas.

## Continuidad de Wallet

La actualización conserva todas las migraciones SQL existentes, seriales, tokens, saldos, asociaciones, emisores, credenciales privadas y código de los proveedores Apple/Google. Se agrega una protección de arranque activada exclusivamente en producción. No crea esquemas vacíos ni ejecuta migraciones automáticamente: comprueba PostgreSQL V015 y SQLite v6, la identidad guardada de las bases, claves y dominios permanentes. Una diferencia bloquea a la candidata; no sustituye el servicio activo.

El nuevo kit `scripts/production.py` prepara versiones separadas, valida sus fuentes contra el checkpoint, respalda PostgreSQL/SQLite y claves, ensaya la restauración en un contenedor aislado y cambia el tráfico mediante recarga del proxy, conservando el proceso anterior. No restaura la base operativa al volver a una versión previa. Los materiales privados permanecen fuera del repositorio y de cada versión. Las herramientas locales rechazan perfiles o carpetas de producción.

La guía completa está en `docs/production/README.md`, con ejemplos privados de configuración, unidades de servicio y proxy HTTPS. Los ejemplos no se aplican automáticamente. No se inventan dominios, no se genera una identidad nueva y no se despliega a un servidor sin configurar. Los respaldos locales no sustituyen una copia cifrada fuera del servidor.

## Aplicación local

Desde Descargas:

```bash
bash lumina_digital_cuenta_produccion_v016r2.sh --iniciar
```

Cerrar primero la Terminal que mantiene abierto el portal local. Docker Desktop debe estar disponible. El instalador acepta las fuentes conocidas de v014, v015 y las revisiones de v016, conserva cambios ajenos y rechaza conflictos antes de escribir. No accede a producción.

La Terminal muestra `RESULTADO=...`. Si se confirma el inicio, muestra además `Lúmina Digital disponible en http://127.0.0.1:8099` y mantiene la aplicación abierta. Los detalles se guardan en la evidencia; el registro de arranque y sus códigos privados quedan fuera del ZIP. No se imprime la configuración privada.

## Qué se ha comprobado

- 20 suites y 198 pruebas HTTP/Node del portal, incluyendo cuenta, revocación de sesiones, acceso posterior a Wallet, persistencia de sesión y bloqueos de producción.
- 160 pruebas Python, incluidas preparación, integridad, restauración aislada y fallo de candidata/recarga mediante procesos simulados. Una simulación no sustituye una restauración real.
- Las 198 pruebas del portal y las 160 de Python también se ejecutaron con un `TMPDIR` enlazado, reproduciendo la estructura de rutas del reporte de macOS.
- Se compiló el código de la aplicación con Kotlin 2.4.20 y se ejecutaron las 12 pruebas de `ProductionGuard`, incluidas las cuatro de integración con PostgreSQL 16.6 en una base aislada.
- Pruebas DOM de Mi cuenta para los tres roles, navegación móvil, formularios, Caja con compras/canjes y protección al salir de una operación. No equivalen a una captura visual de navegador.
- El instalador exige además 608 pruebas Kotlin/HTTP/PostgreSQL, Docker local y las comprobaciones del gateway antes del commit. Si falla una comprobación no crea commit; nunca hace push.

Queda pendiente el checkpoint completo de Gradle, PostgreSQL, Docker y gateway en el Mac. La revisión visual también queda pendiente.

## Antes de admitir negocios reales

Quedan por confirmar el servidor, dominios permanentes y la identidad de cualquier tarjeta ya emitida. Hay que realizar una restauración real aislada y probar, en iPhone y Android, compra, canje y actualización de una tarjeta antes y después de desplegar y volver de versión, sin reinstalarla. Verificar además certificados, supervisión, reinicio del servidor y respaldos externos. El detalle de aceptación está en la guía de producción.

El código queda preparado para esas validaciones, no declarado desplegado ni aprobado en producción. Ningún cambio de software puede prometer disponibilidad absoluta frente a fallos del servidor o de Apple/Google.

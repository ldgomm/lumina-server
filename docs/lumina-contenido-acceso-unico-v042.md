# Lúmina v003 / Loyalty v042

## Operación

El menú de servicios es Contenido para redes, Fidelización digital (Wallet), Google Maps, Web y Diseño de marca. WhatsApp Business y asistentes con IA aparece como Próximamente, sin contratación ni activación.

Una solicitud de contenido contiene el formato, cantidad, indicaciones y plataformas donde se publicará. Cada pieza tiene una ficha común: grabación, observaciones, enlaces de archivos/evidencias, revisión y entrega. Dentro de ella, cada plataforma conserva su publicación y cortes de métricas. Una pieza con cuatro publicaciones consume un cupo, no cuatro. Las métricas siguen siendo registros manuales fechados; no se ha conectado una API social ni se inventan resultados. Las vistas por red no representan personas únicas entre redes.

Web incluye páginas empresariales, tiendas, catálogos, menús, reservas, campañas y mantenimiento. Maps incluye perfil, información, fotos, reseñas/respuestas y rendimiento. Marca incluye logos, identidad y manual: solo contratación individual, con cierre de entrega. Se conserva precio a medida, membresías y Wallet incluido o de cortesía.

## Acceso único

El dueño inicia sesión una vez en Lúmina. Wallet y la configuración de Caja usan esa identidad. Los colaboradores entran con su propia cuenta, únicamente a las áreas y tareas asignadas. Los permisos son comprobados en el servidor en cada operación; ocultar un enlace no es la barrera de seguridad.

Los negocios ya asociados conservan `companies.loyalty_tenant`. Para un registro anterior todavía sin asociación: agencia → Clientes → seleccionar negocio verificado → Fidelización digital → buscar y seleccionar su registro de Loyalty → confirmar. Se realiza una vez, sin pedir contraseñas adicionales al dueño. Nunca se empareja automáticamente por nombre ni se crea otro negocio para reemplazar el existente. La asociación no se puede sobrescribir desde este formulario. Si es un negocio nuevo, el administrador crea su registro completo en Administración de Loyalty antes de asociarlo.

Equipo y permisos permite asignar servicios y, por separado, diseño Wallet, promociones/premios, clientes/recuperación e informes. Ver no concede Modificar. Caja conserva su sucursal y los permisos separados de compras/canjes. Contenido para redes concede todas las plataformas; el desplegable avanzado permite restringir plataformas concretas. Un usuario limitado a una plataforma ve la ficha compartida cuando corresponde a esa plataforma, pero solo sus enlaces/métricas. Para aprobar la pieza común necesita autorización en todas las plataformas de la solicitud.

## Implementación y persistencia

No cambia Kotlin, los SQL PostgreSQL V001–V013, las URLs públicas, presentationVersion=34, seriales, clases/objetos Apple y Google, claves privadas, tokens de pases, saldos ni registros de dispositivos.

El código sigue en `src/main/resources/com/premierdarkcoffee/loyalty/lumina/`, separado en access, application, analytics, infrastructure, memberships, production, wallet y presentation. Node/SQLite permanece como el portal existente. Kotlin mantiene sus subpaquetes debajo de `com.premierdarkcoffee.loyalty`; el lanzador compatible sigue siendo `lumina-agency/src/server.mjs`.

El portal lee la configuración local original de Loyalty: `STAGING_ADMIN_TOKEN` y `LOYALTY_HTTP_PORT` de `.env`, privado, sin enlaces simbólicos ni evaluación de comandos. El destino debe ser el loopback configurado. En despliegues con gestión de secretos se puede suministrar `LUMINA_LOYALTY_ADMIN_TOKEN`; nunca en HTML, scripts de navegador, URLs ni logs. El proceso debe estar aislado en el mismo entorno de confianza del backend Loyalty.

El puente prepara un acceso interno de empleado por cuenta, con el nombre de la persona para auditoría. Se cifra con la clave `agency.key` existente y AAD que incorpora negocio, cuenta, tenant y empleado. No se entrega al navegador. Las operaciones de colaboradores pasan por una lista cerrada de rutas y permisos antes de llamar a Loyalty. La clave de plataforma únicamente está en el proceso servidor. Los nombres y roles de empleados internos no se usan como prueba de pertenencia: el tenant persistente y la sesión autorizada son obligatorios.

La sesión de Lúmina puede cerrar o el servidor puede reiniciar sin perder la asociación ni el acceso cifrado. Una revocación en Loyalty bloquea ese acceso; nunca se reactiva silenciosamente. La agencia puede repararlo explícitamente desde la ficha del negocio, indicando motivo y confirmando la persona activa. Esta reparación renueva solo el acceso del empleado interno, no las tarjetas ni sus credenciales. Se conserva el identificador del empleado. Cada escritura por el puente se registra también en la auditoría de Lúmina.

## Migración SQLite

`schema.sql` original es inmutable. `infrastructure/migrations/002_unified.sql` agrega plataformas objetivo y accesos cifrados. Los pedidos sociales anteriores pasan al área SOCIAL y conservan su plataforma original y las ya publicadas. No se fusionan solicitudes anteriores por título: podrían ser trabajos distintos. No se amplían permisos heredados. Piezas, enlaces, métricas, cotizaciones, contratos y vínculos existentes se conservan.

Antes de migrar una base v1 persistente se crea una instantánea coherente SQLite (incluido WAL) en la carpeta privada `migrations/` dentro del directorio de datos. La migración completa y la versión se aplican en una transacción. La segunda ejecución no duplica plataformas ni respaldos. El instalador no inicia el portal hasta finalizar los gates, por lo que un fallo de compilación anterior al arranque puede restaurar el código sin haber migrado la base real.

Después de una migración real no se debe iniciar la versión v002 sobre el esquema v2. Una recuperación requiere detener el portal, conservar una copia de la base actual y restaurar conjuntamente la versión anterior y su instantánea privada; no automatizar una restauración de datos que descarte trabajos nuevos. Mantener siempre la misma `agency.key`.

## Validación

30 contratos HTTP y de persistencia cubren formularios, permisos, cuatro publicaciones/un cupo, proyectos individuales, estados Próximamente, conservación de datos, acceso único, cierre/reingreso, reinicio, revocación, reparación explícita, CSRF, selección de tenant, aislamiento por negocio, Caja y sus permisos. El gate exige todos los contratos, sin omitidos.

Se conservan las 570 pruebas Kotlin/HTTP/PostgreSQL (276 + 294), las 128 Python y las comprobaciones Docker/gateway existentes antes del commit local automático. No hay push, renovación de túnel ni pruebas de teléfono simuladas. La visualización en navegador y la recepción real en Apple/Google se informan aparte.

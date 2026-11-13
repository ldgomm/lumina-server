# Transición de esquema v057

Estado: plan para revisión y ensayo; no se ejecuta automáticamente sobre producción.

## Si el sistema aún no ha salido a producción

1. Aplicar v057 y completar el checkpoint local, incluyendo Docker y gateway.
2. Comprobar que las pruebas de recuperación con PostgreSQL V016 y SQLite v7 pasan en una restauración aislada.
3. Preparar un paquete nuevo desde ese commit y su recibo; no reutilizar el tar.gz de v055.
4. Restaurar las bases y claves originales en el servidor. Confirmar los identificadores/dominios históricos y la ausencia de registros de prueba entre los clientes reales.
5. Crear el primer sello sobre las bases ya actualizadas y seguir el procedimiento normal de producción. Probar los pases existentes en ambos teléfonos antes de admitir operaciones reales.

## Si ya existe un servidor activo con sello V015/v6

La candidata v057 se detiene ante el esquema anterior. No sobrescribir el sello, cambiarlo a mano, arrancar el servidor público en perfil de desarrollo ni saltar la comprobación para forzar el arranque.

Preparar primero en una réplica aislada una transición coordinada que:

- Compruebe el sello anterior y todas sus identidades antes de cualquier cambio.
- Use un respaldo verificado de ambos motores y las mismas claves; prohíba altas concurrentes durante el punto de consistencia de la migración.
- Aplique solo V016 y 007 en transacciones de cada motor, registrando sus comprobaciones; confirme integridad, relaciones negocio–tenant, credenciales, seriales, objetos Google, saldos y eventos antes/después.
- Mantenga las rutas de pases y la cola de actualizaciones del proceso vigente mientras se prepara la candidata. La transición de versiones debe ser compatible con ambos esquemas o usar una ventana operativa acordada; no se promete disponibilidad absoluta sin ese ensayo.
- Genere evidencia explícita que vincule el sello anterior con el nuevo esquema conservando dominio, claves e identidades, y permita al operador aprobar esa transición. El comando `seal` actual rechaza sobrescritura deliberadamente.
- Disponga de una versión de retorno compatible con V016/v7. La versión v055 original exige V015/v6 y no sirve como retorno sin una revisión específica. No se hace downgrade ni restauración destructiva de las bases activas.

El kit actual no incorpora una orden automática para reemplazar un sello ya existente. Antes de actualizar ese servidor se necesita terminar y validar esa herramienta de transición con sus rutas/configuración reales. La falta de ese procedimiento es un bloqueo de despliegue, no motivo para relajar ProductionGuard.

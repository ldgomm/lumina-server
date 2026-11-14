# Transición v061: teléfonos de personas y clientes

El instalador es para el checkout de desarrollo. Rechaza una configuración de producción y no modifica sus sellos. No se debe ejecutarlo sobre una instancia productiva.

## Cambios aditivos

- SQLite9 → 10: `010_person_contact.sql` añade `accounts.contact_phone`, nullable.
- PostgreSQLV016 → V017: `members.contact_phone`, nullable, y `contact_version`, cero inicialmente.
- Todos los SQL anteriores, IDs, pases, tokens, asociaciones, saldos y dispositivos permanecen intactos. Ningún teléfono histórico se inventa o copia del negocio.

La candidata exige ambos esquemas nuevos antes de escuchar en producción. El sello incluye los hashes SQL: al añadir estas migraciones el sello anterior se rechaza, incluso si se han aplicado las columnas. No sobrescribirlo manualmente, borrar su identidad ni usar perfil de desarrollo para eludirlo.

## Ensayo y despliegue

1. Validar el commit v061 en el Mac, Docker y gateway incluidos. Construir una candidata nueva, sin reutilizar los binarios v055/v060.
2. Verificar el sello anterior con su versión compatible. Respaldar ambos motores y claves; restaurar a un entorno aislado y comparar número de clientes, asociaciones, pases Apple/Google, registros de dispositivos, saldos, movimientos y contratos.
3. En la réplica, aplicar exclusivamente las migraciones nuevas mediante los migradores versionados. Probar acceso anterior sin teléfono, nuevo registro, edición de contacto, compra y canje, así como actualización de tarjetas existentes. El protocolo público y sus identidades no cambian.
4. Preparar y ensayar un retorno compatible con los esquemas10/V017. La versión v060 sin adaptación rechaza el nuevo esquema; volver únicamente sus binarios no constituye un retorno válido. Nunca restaurar una base antigua encima de operaciones posteriores.
5. Coordinar un único escritor del portal y un solo responsable de migraciones. Ensayar locks y tiempos de ALTER TABLE con una copia realista. Mantener el servicio que atiende pases y colas disponible durante la transición; conservar las URL originales. No prometer cero interrupciones sin ensayar esta transición.
6. La actualización del sello requiere un procedimiento de transición explícito que compare la identidad anterior y autorice solamente los nuevos hashes SQL, manteniendo todos los demás campos idénticos. Ese procedimiento productivo y el cambio de tráfico no se ejecutan mediante este instalador y siguen pendientes del despliegue.

No cambiar `agency.key`, `IDENTITY_PEPPER`, `WALLET_DATA_KEY`, Pass Type ID, Team ID, Issuer ID, credenciales, claves de autenticación, seriales, URL pública o certificados como parte de esta actualización.

Los teléfonos son datos privados. Su lectura y edición están limitadas al negocio y a los permisos asignados. Las pruebas y evidencias usan números ficticios. No publicar contactos en QR, pases, métricas, registros de actividad o archivos de diagnóstico.

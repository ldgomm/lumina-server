# Transición v060: identidad y servicios opcionales

Este instalador actúa únicamente en desarrollo local. No inicia, migra ni reemplaza un servidor de producción.

## Esquema e identidades

PostgreSQL permanece en V016. Sus migraciones anteriores son inmutables. SQLite pasa de 8 a 9 con `009_identity_services.sql`: cédula y bienvenida de cuentas, RUC de empresas y activación de servicios. Conserva claves primarias, contraseñas, sesiones existentes, contratos, cuentas, asignaciones, auditoría y asociaciones Wallet. Los documentos históricos ausentes quedan NULL hasta que cada persona complete el cambio con su contraseña.

Las empresas existentes conservan Contenido, Maps, Web y Marca. Solo se marca Wallet activa si ya tenían asociación nativa. Los registros nuevos empiezan sin servicios. La migración no crea tarjetas, promociones, suscripciones o cargos.

El esquema y el sello de producción se verifican antes de escuchar. Una base SQLite8 o un sello anterior se rechazan; el proceso de producción nunca los actualiza automáticamente. No editar el sello manualmente ni arrancar producción con perfil de desarrollo.

## Primer despliegue

1. Completar el checkpoint v060 en el Mac, incluidos Docker y gateway, y preparar una candidata nueva desde ese commit.
2. Respaldar ambos motores y todas las claves fuera del código; verificar una restauración aislada. Comparar asociaciones empresa/tenant, seriales, objetos Google, dispositivos, saldos, historial, contratos y dominios antes/después.
3. Aplicar la migración SQLite9 en la réplica y comprobar el acceso de una cuenta anterior, su cambio a cédula, una compra y un canje con colaborador, y las tarjetas ya emitidas. La actualización de la identificación no debe modificar ningún identificador Wallet.
4. Crear el sello inicial únicamente con el esquema y la candidata validados. Mantener un único escritor del portal SQLite y las rutas públicas Wallet originales.

## Si ya existe producción sellada

Se requiere una transición explícita y ensayada que valide el sello anterior, haga respaldo y aplique solo SQLite009. Mantener disponible el proceso compatible que atiende los protocolos Apple/Google y sus colas; coordinar los escritores del portal para que no haya dos procesos modificando SQLite.

La candidata v059 exige SQLite8: no es un retorno compatible después de la migración sin adaptación validada. Preparar y probar el retorno sobre SQLite9 antes de cambiar tráfico. Nunca restaurar una base antigua sobre compras, canjes, cargos o pagos posteriores. Conservar comandos administrativos pendientes y claves de idempotencia.

No cambiar agency.key, pepper, WALLET_DATA_KEY, URL pública, Pass Type ID, Team ID, Issuer ID, seriales, claves de autenticación o asociaciones como parte de esta actualización. Las renovaciones de certificados y los cambios de origen tienen procedimientos independientes.

La comprobación de checksum no es una verificación gubernamental. No bloquear cuentas existentes ni eliminar datos por una cédula o RUC aún sin completar. La información de identificación se presenta enmascarada cuando no se necesita editarla; no debe aparecer en logs, evidencias ni almacenamiento del navegador.

Las pruebas locales no sustituyen el ensayo de despliegue, el respaldo restaurable, HTTPS ni la recepción de actualizaciones en teléfonos. El cambio de tráfico y los sellos siguen pendientes del trabajo de despliegue.

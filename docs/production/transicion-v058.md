# Transición v058: control administrativo

Este parche es local. No despliega ni altera un servidor activo.

## Primer despliegue pendiente

Completar el checkpoint v058, incluyendo Docker y gateway. Preparar un paquete nuevo desde ese commit validado: el paquete v055 no incluye estos cambios. Restaurar bases y claves originales en una réplica aislada, aplicar SQLite008, verificar PostgreSQL V016 sin modificaciones y probar la conservación de asociaciones, tarjetas y saldos antes de crear el primer sello de producción. Usar un único escritor del portal SQLite.

## Servidor previamente sellado

La candidata exige los hashes anteriores intactos y SQLite8. Se detiene si encuentra v7 o un sello anterior; no inicializa ni migra producción. No editar el sello a mano ni ejecutar producción en perfil de desarrollo.

Hace falta una transición explícita, ensayada y coordinada que valide el sello anterior, respalde ambos motores, aplique solamente SQLite008 y demuestre que identidades/credenciales/saldos no cambiaron. Conservar un proceso compatible para atender los protocolos de Wallet y sus colas. Impedir cambios de administración durante el corte para no perder comandos pendientes.

La versión v057 exige SQLite7, por lo que no se considera retorno compatible sin adaptación validada. Nunca restaurar una base antigua sobre compras, canjes o pagos posteriores. El retorno debe conservar SQLite8 y los comandos administrativos pendientes.

El kit existente no reemplaza automáticamente sellos. La transición del servidor sellado y el ensayo de recuperación siguen siendo trabajo de despliegue, separado de este instalador local. No se afirma disponibilidad absoluta ni actualización comprobada en teléfonos por pasar las pruebas del código.

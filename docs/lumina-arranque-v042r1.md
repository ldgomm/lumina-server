# Corrección de arranque Lúmina v003r1 / Loyalty v042r1

La v003 pasó el checkpoint y creó el commit, pero el proceso del portal rechazaba una credencial válida al arrancar. El lector exigía 43 caracteres; `scripts/staging.py` genera `token_urlsafe(36)` (48 caracteres) y admite entre 32 y 128. El formato de la credencial de plataforma es distinto del de las sesiones y de los empleados emitidos por Kotlin.

La corrección alinea ambos lectores para `.env` y `LUMINA_LOYALTY_ADMIN_TOKEN`, sin transformar ni regenerar valores. Conserva las comprobaciones de archivo privado, symlink y puerto. Distingue una credencial ausente de una que no tiene el formato admitido. El dueño y sus colaboradores mantienen el acceso único de v003.

Las 32 pruebas incluyen el arranque del lanzador real en un proceso Node separado, con configuración privada ficticia generada por el instalador real de Loyalty. Se verifica salud HTTP, sesión existente, lectura de Wallet mediante la credencial de 48 caracteres y conservación de `agency.key` y `.env`. También se comprueba que una configuración inválida no llega a crear o migrar SQLite. Los casos del lector cubren los límites 32 y 128, los formatos de 43/48/64 y entradas inválidas.

El reparador prueba primero el código aislado y el formato de la configuración local existente, sin mostrar claves ni modificarla. Después aplica la corrección y conserva los gates completos de Loyalty antes del commit local. No cambia código Kotlin, rutas, bases de negocio, identidades Apple/Google, certificados ni túneles.

# Producción de Lúmina — v057

Este kit prepara el despliegue. No publica el sistema, no cambia DNS y no declara producción aprobada por haber pasado las pruebas locales. Requiere confirmar servidor Linux y los dos dominios HTTPS definitivos; Java 21, Node 24 LTS o posterior compatible, Python 3.10+, PostgreSQL 16, clientes psql/pg_dump/pg_restore 16, Nginx, Caddy, OpenSSL y Docker para restauraciones aisladas. Los binarios y las imágenes deben fijarse a versiones verificadas en el servidor.

## Identidad que debe sobrevivir

Conservar exactamente la URL pública que llevan las tarjetas ya emitidas, IDENTITY_PEPPER, WALLET_DATA_KEY, Pass Type ID, Apple Team ID, Google Issuer ID, agency.key, bases de datos y enlaces de negocios. Renovar certificados Apple o claves de servicio Google preservando esos identificadores es posible; las nuevas credenciales deben probarse antes de reemplazar las vigentes. Nunca regenerar estas claves, borrar una tarjeta, recrear un tenant o pedir un nuevo registro como parte de una actualización.

Una URL temporal trycloudflare/ngrok no es un dominio de producción. Si las tarjetas existentes la utilizan, hace falta una migración específica comprobada en dispositivos antes de abrir al público. El primer sellado NO demuestra cuál era la URL incluida en una tarjeta anterior. Debe comprobarse contra la configuración y los pases reales; una migración de dominio no se resuelve reescribiendo el archivo de identidad.

## Preparación inicial del servidor

1. Crear un usuario de sistema `lumina`, carpetas privadas fuera del checkout y permisos 0700: `/var/lib/lumina/agency`, `/var/lib/lumina/runtime`, `/var/backups/lumina`, `/opt/lumina/releases`. Configuración en `/etc/lumina`, 0700; archivos 0600, accesibles sólo por el servicio/operador. PostgreSQL debe usar un volumen persistente propio, nunca `loyalty-staging-data`; aceptar conexiones sólo en red privada. Si es remoto, JDBC exige `sslmode=verify-full` y su CA.
2. Copiar el ejemplo a `/etc/lumina/production.json`, con valores verdaderos recuperados de la configuración privada original. No generar sustitutos. El portal y Wallet usan dominios distintos: el dominio de Wallet permite únicamente registro y rutas públicas de tarjetas. No exponer Ktor, PostgreSQL ni el administrador de Caddy a Internet.
3. Llevar PostgreSQL y SQLite al servidor mediante respaldo/restauración verificados, junto con `agency.key` y los materiales de firma. La migración inicial requiere un plan de corte coherente y conservar el origen de los pases. No se deben mantener dos bases independientes aceptando compras. Una instalación nueva se prepara explícitamente fuera del proceso público; el arranque de producción no crea esquemas ni una agencia vacía.
4. La base restaurada debe estar en PostgreSQL V016 y SQLite v7, y tener la agencia configurada. El kit no convierte el demo en negocio ni copia credenciales de prueba. No importar clientes demo como reales. Nunca eliminar datos que tengan tarjetas sin un procedimiento explícito.
5. Ejecutar `python3 scripts/production.py seal --config /etc/lumina/production.json` una sola vez, después de comprobar la identidad histórica. Registra huellas, identificadores de base y SQL; no modifica datos. No hay opción de sobrescribir el sello. `check` compara la instalación contra él y bloquea cualquier diferencia.
6. Guardar copias cifradas fuera del servidor. Los respaldos locales del kit incluyen claves y configuración privada para permitir recuperación y tienen permisos restrictivos; eso no los cifra ni sustituye una copia externa. Definir cifrado, retención, frecuencia, acceso y responsable antes de abrir al público. Para recuperación a un instante se requiere además archivado WAL/PITR administrado de PostgreSQL.

## Preparar una versión

El instalador local sigue ejecutando todas las pruebas de Kotlin/PostgreSQL, portal, Python, Docker y gateway antes del commit. La producción se ejecuta desde una copia inmutable fuera del repositorio. Desarrollar en el checkout y reiniciar Docker local no debe tocarla.

`package` exige el JSON real del checkpoint aprobado, su commit exacto y las mismas huellas de fuentes. Compila `installDist` y crea una carpeta nueva; no reemplaza la activa:

```bash
python3 scripts/production.py package --config /etc/lumina/production.json --receipt /ruta/privada/checkpoint-report.json
```

La ruta de la candidata queda en `/var/lib/lumina/runtime/last-result.json`. El paquete conserva copias de los scripts de operación; usar esos scripts al arrancar, no los de un checkout que seguirá cambiando. Todo cambio de archivo del paquete invalida su manifiesto.

## Respaldar y ensayar la restauración

```bash
python3 scripts/production.py backup --config /etc/lumina/production.json
python3 scripts/production.py verify-backup --config /etc/lumina/production.json --backup /var/backups/lumina/backup-ID
```

El primer comando usa la API de backup de SQLite (incluye transacciones WAL confirmadas), pg_dump y copias privadas de las claves. No copia SQLite en caliente como archivo suelto. El segundo restaura PostgreSQL en un contenedor nuevo sin red, puertos ni volumen de producción; comprueba integridad SQLite, esquema y asociaciones entre ambos registros. El contenedor se elimina al terminar. Un fallo no restaura nada sobre la base operativa.

Los dos motores tienen instantáneas consistentes por separado, no una transacción distribuida. Si hay altas concurrentes y el respaldo no coincide entre motores, la comprobación lo rechaza: repetir en un momento coherente o realizar una recuperación coordinada. Conservar los respaldos anteriores y nunca publicar una copia como verificada sólo porque `pg_dump` terminó.

## Arranque y cambio de versión

Hay dos posiciones: blue (Wallet 9101, portal 9199) y green (Wallet 9201, portal 9299), siempre en 127.0.0.1. Ambas usan las mismas bases y claves persistentes. Copiar las unidades `lumina-wallet@.service` y `lumina-portal@.service` a systemd y crear un archivo privado `/etc/lumina/slots/green.env` con `RELEASE=/opt/lumina/releases/CANDIDATA`. Sustituir green por la posición libre. No editar la posición activa.

Arrancar Wallet y luego el portal de la candidata. El arranque verifica identidad, esquema y proveedores; no migra producción automáticamente. Antes del primer cambio, ejecutar `prepare-gateway` con los mismos argumentos de candidata y posición. Copiar `lumina-gateway.service` a systemd y habilitar/iniciar ese servicio. `prepare-gateway` valida la candidata y crea una configuración nueva sin reemplazar otra; no expone TLS ni cambia DNS. No volver a ejecutarlo en despliegues posteriores. A continuación:

```bash
python3 /opt/lumina/releases/CANDIDATA/scripts/production.py ready --config /etc/lumina/production.json --release /opt/lumina/releases/CANDIDATA --slot green
python3 /opt/lumina/releases/CANDIDATA/scripts/production.py switch --config /etc/lumina/production.json --release /opt/lumina/releases/CANDIDATA --slot green --backup /var/backups/lumina/backup-ID
```

`switch` requiere una restauración verificada en las últimas 24 horas, comprueba que su respaldo no cambió, valida ambas aplicaciones y la misma versión, prueba la configuración Nginx y recarga las rutas. Utiliza bloqueo para evitar dos cambios simultáneos. Conserva la versión anterior ejecutándose. Si falla la recarga o las comprobaciones, repone la configuración anterior; no revierte la base ni elimina compras nuevas. Una caída del servidor completo sigue requiriendo infraestructura redundante: dos procesos en una máquina no son alta disponibilidad.

Nginx privado escucha 8100 para Lúmina y 8101 para Wallet. Este último reutiliza la lista de rutas del gateway ya probado (API de plataforma/caja no pública). Caddy termina TLS en los dominios permanentes y apunta a esos puertos. Instalarlo y validar HTTPS antes de dar acceso real. El ejemplo es configuración para adaptar, no se aplica automáticamente. Nginx queda bajo supervisión de la unidad incluida `lumina-gateway.service`, con configuración `/var/lib/lumina/runtime/nginx.conf`, mismo usuario y PID persistente. `switch` únicamente recarga un servicio ya iniciado. Comprobar el arranque tras reinicio antes de producción.

Esperar que terminen las operaciones en vuelo antes de retirar manualmente la versión anterior. Conservarla para retorno. Volver a la versión previa consiste en iniciar/verificar esa carpeta y seleccionar su posición con `switch`; nunca importar un respaldo encima de una base que recibió compras. El proceso actual exige esquemas idénticos. Una futura migración SQL requiere un plan compatible de expansión, comprobación y contracción; queda bloqueada hasta revisarlo.

## Aceptación antes de abrir al público

- Probar un dueño y un colaborador real autorizado: ingreso, Caja, compra, canje, permisos y cierre de sesión. Confirmar que no se pierde una operación ni se repite al reintentar.
- En un iPhone y un Android reales: instalar una tarjeta, conservarla, registrar compra/canje, desplegar candidata y repetir sin reinstalar ni registrar al cliente nuevamente. Comprobar actualización push y descarga por el mismo serial/token/Google Object ID, antes y después del despliegue y de un retorno de versión.
- Verificar HTTPS público y rutas permitidas/denegadas a través del proxy. Verificar arranque completo del servidor y conservación de datos tras reiniciar.
- Comprobar respaldo externo y restauración en un entorno aislado. Definir responsables, frecuencia y objetivos de recuperación. Restaurar también claves originales.
- Monitorizar disponibilidad pública, `/salud/listo`, `/health/ready`, PostgreSQL, espacio de disco, edad del último respaldo, cola de entrega/reintentos Wallet, certificados Apple/HTTPS y acceso de servicio Google. Alertar antes del vencimiento; no esperar a que deje de firmar. Los endpoints privados de salud no se publican como API administrativa.

Resultado correcto del kit: preparada para validar/desplegar. **No equivale a PRODUCCIÓN VALIDADA** hasta obtener estas evidencias con el servidor, dominios y dispositivos reales. Las comunicaciones con Apple/Google y la infraestructura pueden fallar; ningún parche puede garantizar disponibilidad absoluta.

Fuentes del protocolo: https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Updating.html ; https://developers.google.com/wallet/retail/loyalty-cards/use-cases/updates ; https://www.postgresql.org/docs/16/backup.html ; https://caddyserver.com/docs/api ; https://ktor.io/docs/server-configuration-file.html .


Para actualizar una producción previamente sellada en V015/v6, seguir primero `transicion-v057.md`. La candidata no migra ni sobrescribe su identidad automáticamente.

# Loyalty v008: Docker, configuración y continuidad

## Primera ejecución

Requiere Docker Desktop abierto, JDK 21, Git y Python 3.9 o posterior. En macOS se selecciona JDK 21 mediante java_home si está instalado. El script no instala software global ni requiere sudo.

```bash
cd ~/Downloads
bash loyalty_continuar_v008.sh
```

Se usa exclusivamente `/Users/ldgomm/Developer/pdc/sales/loyalty`. Si el proyecto no tiene Git, se inicializa un repositorio local. La validación usa una base PostgreSQL temporal y aislada; el volumen persistente del negocio se conserva.

Después de aprobar pruebas y Docker/gateway se crea el commit; HTTPS tiene su propio resultado posterior. Si el túnel falla, el servidor local sigue disponible y el ZIP conserva el diagnóstico. No se anuncia Wallet instalado por tener HTTPS.

## Configuración privada

`.env` contiene el puerto, identificador de instancia y las claves aleatorias de base, administrador, dueño y caja. El instalador no sustituye un archivo existente ni genera nuevas claves si encuentra recursos sin configuración. `.env.wallet` conserva el cifrado y los valores de proveedores; las credenciales Apple/Google se suministran cuando estén disponibles.

Los datos de demostración incluyen un café con sucursales Centro y Norte, puntos, cashback, sellos y premios, cuenta de membresía y dos clientes ficticios. Sus compras posteriores se conservan. Los tokens de administrador/dueño/caja están en `.local-staging/access.html`. Ana y Luis se buscan desde caja mediante DEMO10001 y DEMO10002; el cliente no usa contraseñas.

## Comandos del entorno

Desde la carpeta del proyecto:

```bash
cd ~/Developer/pdc/sales/loyalty
python3 scripts/staging.py status
python3 scripts/staging.py credentials --open --quiet
python3 scripts/staging.py logs
```

Para reconstruir y verificar, usa el .sh completo desde Downloads: así se genera el ZIP y el commit después de PASS. Para arrancar sin crear checkpoint, `python3 scripts/staging.py start`. El servidor escucha en 127.0.0.1:8097 y PostgreSQL queda dentro de Docker.

También puedes inspeccionar los servicios directamente:

```bash
docker compose --env-file .env -f docker-compose.staging.yml ps
docker compose --env-file .env -f docker-compose.staging.yml logs -f --tail=150 loyalty-server
```

`compose.yaml` incluye el mismo Compose local para que `docker compose up -d --build` apunte al entorno Loyalty. Se requiere Docker Compose 2.20 o posterior para ese atajo; el instalador usa explícitamente docker-compose.staging.yml. Evita mezclar el Compose base con el overlay de Wallet manualmente: los scripts eligen la configuración adecuada.

## HTTPS y Wallet

El gateway en 127.0.0.1:8098 permite solo el registro y acceso del cliente y los servicios de pases. Los paneles permanecen locales. El túnel temporal permite probar desde el teléfono mientras el Mac y Docker estén activos; una URL nueva cambia el destino de actualizaciones de pases. Antes de uso permanente se necesita un dominio estable.

Para cargar certificados/JSON cuando estén listos:

```bash
cd ~/Downloads
bash loyalty_continuar_v008.sh --wallet-only --configure
```

Para reintentar HTTPS con la configuración guardada:

```bash
bash loyalty_continuar_v008.sh --wallet-only
```

Los archivos de Apple/Google se guardan fuera del código y se referencian por su ruta. No forman parte de Git, contexto Docker o ZIP. Mantén WALLET_DATA_KEY y los archivos privados junto con tu respaldo local. La guía explica Pass Type ID, certificado PKCS12/WWDR, emisor Google y cuenta de servicio.

## Alcance de la continuidad

La lógica suministrada en loyalty.zip se conserva. Se corrigen los paquetes/imports mezclados, el plugin de serialización y los nombres de distribución/arranque. Se restauran las pruebas del último Comeback aprobado y se adapta la prueba inicial del nuevo proyecto para funcionar sin credenciales privadas.

No se migra automáticamente la base ni los archivos privados de Comeback y no se detienen sus contenedores. Las cuatro migraciones SQL recibidas se mantienen sin cambios. También se conservan sus nombres internos y los identificadores de proveedor existentes; el nombre comercial cambia a Loyalty.

Siguen pendientes las credenciales y prueba real de Apple/Google, la restricción estricta de un solo dispositivo y las alianzas entre negocios independientes. La administración de locales del mismo negocio y el saldo compartido ya forman parte del código recibido.

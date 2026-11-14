# loyalty

Lúmina Digital integra la agencia y los módulos de contenido y fidelización. La cuenta, permisos y contratación se administran desde Lúmina.

Antes de abrir al público, seguir [la preparación y validación de producción](docs/production/README.md). La producción utiliza bases, claves y dominios persistentes fuera del checkout; no se actualiza reiniciando el entorno de pruebas. Cambios de esta versión: [Mi cuenta y continuidad de Wallet](docs/lumina-cuenta-produccion-v055.md).

This project was created using the [Ktor Project Generator](https://start.ktor.io).

Here are some useful links to get you started:

* [Ktor Documentation](https://ktor.io/docs/home.html)
* [Ktor GitHub page](https://github.com/ktorio/ktor)
* [Ktor Slack chat](https://app.slack.com/client/T09229ZC6/C0A974TJ9). [Request an invite](https://surveys.jetbrains.com/s3/kotlin-slack-sign-up).

## Features

Here's a list of features included in this project:

| Name | Description |
|------|-------------|

## Building & Running

To build or run the project, use one of the following tasks:

| Task              | Description       |
|-------------------|-------------------|
| `./gradlew test`  | Run the tests     |
| `./gradlew build` | Build the project |
| `./gradlew run`   | Run the server    |

If the server starts successfully, you'll see the following output:

```
2024-12-04 14:32:45.584 [main] INFO  Application - Application started in 0.303 seconds.
2024-12-04 14:32:45.682 [main] INFO  Application - Responding at http://0.0.0.0:8080
```

<!-- loyalty-v008 -->

## Loyalty: entorno local completo

Desde `~/Downloads`, ejecuta `bash loyalty_continuar_v008.sh`. El proyecto de destino es `/Users/ldgomm/Developer/pdc/sales/loyalty`.

El instalador corrige las referencias al paquete `com.premierdarkcoffee.loyalty`, restaura las pruebas e incorpora Docker/PostgreSQL, configuración privada, accesos y HTTPS. Conserva tu código y formato fuera de los cambios indicados. Crea un commit local después de las pruebas completas y Docker/gateway aprobados; después intenta HTTPS. Siempre guarda el resultado de la ejecución y el mismo script en un ZIP de Downloads. No hace push.

- Vista de avances: `http://localhost:8097/preview`.
- Administrador: `http://localhost:8097/platform`.
- Negocio/caja: `http://localhost:8097/`.
- Credenciales privadas: `.local-staging/access.html`.
- Configuración del entorno: `.env`, creada con claves aleatorias y conservada al repetir.
- Configuración Apple/Google: `.env.wallet`.
- Guía de Wallet: `.local-wallet/guide.html`, disponible después de aprobar HTTPS.

El registro del cliente no tiene contraseña. El QR del negocio abre el formulario y después permite añadir la tarjeta al teléfono cuando el proveedor esté configurado. Las tarjetas no se consideran verificadas hasta probar instalación y actualización real en iPhone/Android.

Loyalty usa su propia base y volumen Docker; no importa automáticamente datos ni credenciales de Comeback. Conservar el proyecto anterior permite una futura migración explícita si se necesita. El nombre interno `comeback_migrations` y los identificadores de pases se mantienen para preservar compatibilidad; todas las declaraciones Kotlin usan el paquete Loyalty.

Consulta `docs/local-v008.md` para los comandos de administración y las verificaciones.

<!-- loyalty-v040 -->

## Administración integral v040

La entrega actual incorpora un centro de control para dueño y plataforma, directorio editable de sucursales, filtros y permisos de equipo, actividad conectada a los informes, ficha con cambios protegidos y una cuenta más clara.

Desde Downloads: `bash loyalty_administracion_v040.sh`. Requiere v039. Se aplican los cambios sobre el código existente, respetando reformateos equivalentes de IntelliJ; se comprueban pruebas, Docker y gateway antes del commit local. HTTPS se valida aparte. El resultado y el mismo instalador se guardan en un ZIP de Downloads.

Consulta [la guía de Administración v040](docs/administracion-v040.md) para conocer los cambios de cada sección, la validación y los límites de los informes.


Lúmina v003 / Loyalty v042: contenido compartido entre plataformas y acceso único a Wallet. Consulta [la guía de actualización](docs/lumina-contenido-acceso-unico-v042.md).


Actualización Lúmina v007 / Loyalty v046: [Contenido independiente y límites de acceso](docs/lumina-contenido-accesos-v046.md). Incluye solicitudes simplificadas, consulta administrativa de solo lectura y resultado único en Terminal.

### Lúmina v009 / Loyalty v048

Catálogo guiado en tres pasos y administración central en Lúmina. Wallet mantiene las herramientas de fidelización; paquetes, equipo, cuenta e informes se gestionan desde el portal. Ver [guía de actualización](docs/lumina-gestion-v048.md).


### Lúmina v010 / Loyalty v049

Inicio con pendientes y accesos directos, solicitudes con teléfono, navegación de dimensiones compartidas, catálogo más compacto y redes de Lúmina. Conserva el motor y las conexiones Wallet. [Guía de actualización](docs/lumina-sencilla-v049.md).

### Lúmina v011 / Loyalty v050

Equipo con búsqueda, estados, permisos claros, historial y protección ante formularios antiguos. Baja inmediata incluso si Wallet no responde, recuperación de acceso con permisos vigentes y vista de consulta sin edición. Revisión de los flujos de solicitudes, contenido, métricas, paquetes y administración. [Guía y alcance de la revisión](docs/lumina-equipo-v050.md).

## Campañas de noviembre · v051

[Promociones personalizables, vigencia y validación](docs/lumina-viernes-negro-v051.md).

### Lúmina v022 / Loyalty v061

Teléfono para colaboradores y clientes Wallet, alta más clara, contacto editable según permisos y corrección del acceso a Caja desde la ficha. [Guía de actualización](docs/lumina-contacto-simple-v061.md).

### Lúmina v023 / Loyalty v062

Pendientes completos, agenda por próximas visitas e historial, solicitudes con filtros y totales, y buscador de secciones. Conserva roles y conexiones Wallet. [Guía de actualización](docs/lumina-jornada-simple-v062.md).

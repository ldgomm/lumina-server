# Lúmina Digital y Loyalty — organización v041

## Código Kotlin

Base: `src/main/kotlin/com/premierdarkcoffee/loyalty/`.

| Paquete | Responsabilidad |
| --- | --- |
| application | Arranque, rutas HTTP y composición de servicios |
| access | Autenticación, personal y permisos |
| businesses | Ficha, categorías, sucursales y administración |
| fidelity | Compras, promociones, premios y canjes |
| wallet | Identidad, emisión, entrega, diagnóstico y migraciones Wallet |
| wallet.providers | Experiencias nativas Apple/Google y proveedores |
| wallet.presentation | Reglas de contenido, progreso y disposición nativa |
| wallet.artwork | Generación de imágenes y estilos de tarjetas |
| marketing | Campañas, cumpleaños y preferencias |
| billing | Membresías y cuenta comercial de Loyalty |
| analytics | Clientes, actividad, informes y radar |
| infrastructure | Persistencia y entorno local |
| shared | Contratos y utilidades compartidas |

Los tres archivos pequeños de entrada del paquete base conservan los nombres JVM existentes. Los módulos son paquetes dentro del proyecto Gradle actual; no son microservicios ni subproyectos Gradle independientes. Las pruebas reflejan la misma estructura.

## Portal Lúmina

Base: `src/main/resources/com/premierdarkcoffee/loyalty/lumina/`.

El portal sigue ejecutándose con Node 24.2+ y SQLite, preservando las cuentas y registros instalados. Sus módulos son application, access, memberships, production, analytics, wallet, shared, infrastructure y presentation (pages/assets). Los canales Instagram, TikTok, Facebook, YouTube, Maps y Web tienen espacios filtrados por permisos y negocio. Las métricas siguen siendo registros manuales verificables; no se simulan conexiones OAuth ni sincronizaciones externas.

Arranque compatible: `node lumina-agency/src/server.mjs` desde la raíz. Pruebas: `npm --prefix lumina-agency test`. No copiar ni mover la base `~/.lumina-digital/agency/agency.sqlite` ni su clave. `LUMINA_DATA_DIR` sigue siendo compatible.

## Centro Wallet

`/wallet` es visible desde inicio y navegación. El dueño conecta su credencial actual y abre el estudio de tarjetas, estado Apple/Google, promociones y QR. Lúmina usa las pantallas y APIs existentes de Loyalty, con credencial exclusivamente del lado del servidor y vigente durante la sesión. La agencia abre la administración global con su credencial de plataforma. Cada cuenta mantiene sus permisos.

El acceso al panel y la vinculación de las tarjetas son independientes: cerrar ese acceso no revoca ni elimina tarjetas. Las URLs públicas, seriales Apple, identificadores Google, saldos, historial, base PostgreSQL y secretos no cambian. No hay migraciones de datos nuevas. Los SQL V001–V013 se trasladan byte por byte como recursos internos. `application.yaml` y `logback.xml` permanecen donde los requiere Ktor.

## Verificación

El instalador conserva evidencia del código anterior y nuevo. Comprueba conflictos antes de escribir, prueba Node, ejecuta el checkpoint oficial con las 570 pruebas Kotlin/HTTP/PostgreSQL, pruebas Python, Docker y gateway. Solo un resultado completo permite auto commit local. Una compilación bloqueada o una prueba fallida nunca se informa como PASS. Las pruebas de teléfono y HTTPS siguen siendo verificaciones independientes.

# Lúmina Digital y Loyalty — organización v045

## Código Kotlin

Base: `src/main/kotlin/com/premierdarkcoffee/loyalty/`.

| Paquete | Responsabilidad |
| --- | --- |
| application | Arranque, rutas HTTP y composición |
| access | Autenticación, personal y permisos |
| businesses | Negocios, sucursales, ficha y registro integrado |
| fidelity | Compras, promociones, premios y canjes |
| wallet | Identidad, emisión, entrega y diagnóstico |
| wallet.providers | Apple Wallet y Google Wallet |
| wallet.presentation | Contenido y presentación nativa |
| wallet.artwork | Imágenes y estilos de tarjetas |
| marketing | Campañas, cumpleaños y preferencias |
| billing | Cuenta comercial del motor Loyalty |
| analytics | Clientes, actividad e informes |
| infrastructure | Persistencia y entorno local |
| shared | Contratos y utilidades |

Son paquetes del proyecto Gradle existente, no microservicios. Los tres archivos de entrada conservan los nombres JVM compatibles. Las pruebas reflejan la estructura.

## Portal de Lúmina

Base: `src/main/resources/com/premierdarkcoffee/loyalty/lumina/`.

| Módulo | Responsabilidad |
| --- | --- |
| application | Servidor y composición de rutas |
| access | Cuenta única, sesiones y permisos por negocio/área |
| content | Espacio de contenido, consultas, conteos y navegación |
| production | Solicitudes, grabaciones, piezas, evidencias y aprobaciones |
| memberships | Catálogo, combinaciones, propuestas, acuerdos y cupos |
| analytics | Publicaciones, métricas sociales y Google Maps |
| wallet | Registro propio por negocio, acceso cifrado y operaciones integradas |
| infrastructure | SQLite, migraciones y configuración |
| presentation | Páginas y recursos de interfaz |
| shared | Reglas y formatos comunes |

Node 24.2+; `lumina-agency/src/server.mjs` es el lanzador compatible. Los datos siguen en `~/.lumina-digital/agency`, o en `LUMINA_DATA_DIR`, con la misma clave. El portal utiliza SQLite v4; el motor Loyalty utiliza PostgreSQL. No mover ni copiar datos entre negocios para reorganizar el código.

## Espacios integrados

**Wallet** usa la misma sesión de Lúmina. Al registrarse, cada negocio obtiene un registro propio, sin asociación al demo ni nueva credencial. El backend conserva los accesos cifrados; cada ruta verifica empresa, cuenta y permisos. Vínculos anteriores, tarjetas y saldos se mantienen.

**Contenido** reúne solicitudes, producción, aprobaciones, entregas, publicaciones, métricas y agenda. Una pieza común puede publicarse en varias redes. La selección de plataformas aparece al registrar publicaciones o consultar resultados, nunca al solicitar contenido. Las métricas siguen siendo manuales.

**Paquetes y servicios** permite contratar ofertas por separado o combinadas, mensuales y puntuales. La propuesta tiene aceptación de versión; la activación conjunta crea acuerdos independientes. Las renovaciones son explícitas y no existen débitos automáticos. El espacio Wallet permanece activo independientemente de estas ofertas comerciales.

Los módulos no requieren autenticaciones separadas. Caja mantiene la sucursal y permisos asignados al colaborador dentro de la cuenta Lúmina. Las URLs públicas de tarjetas permanecen intactas.

## Validación y cambios

v045 añade SQLite `004_packages.sql` con respaldo previo; no modifica SQL anterior ni los recursos de las tarjetas. Gate completo antes del commit: 56 pruebas del portal, 128 Python, 580 Kotlin/HTTP/PostgreSQL, Docker y 114 comprobaciones gateway. No hacer push. Navegador, HTTPS y teléfonos se informan aparte.

Detalle de operación: `docs/lumina-contenido-paquetes-v045.md`.

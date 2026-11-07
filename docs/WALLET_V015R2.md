# Wallet v015r2

El diagnóstico del 7 de noviembre de 2026 confirma autenticación y acceso al emisor Google con HTTP 200. Las dos clases/objetos consultados existen; las clases están aprobadas y todavía no tienen usuarios. La cola conserva `GOOGLE_DESIGN_400`. Apple no registra errores de envío en ese informe.

El PATCH de diseño de una clase Google aprobada omitía `reviewStatus`. Esta versión envía `UNDER_REVIEW` junto con los campos de marca, como exige el contrato del proveedor. Google decide el estado aprobado. Se conserva la clase y el objeto existentes. Los diseños se consideran enviados únicamente después de una respuesta exitosa.

Referencia oficial: https://developers.google.com/wallet/reference/rest/v1/loyaltyclass#LoyaltyClass

Los informes administrativos de ambas plataformas incluyen ahora `deliveryErrors`: proveedor, código permitido, cantidad y máximo de intentos. Los mensajes crudos, datos de clientes, tokens y contenido del pase se excluyen. La ruta sigue requiriendo el token de administrador de plataforma. Los errores desconocidos se agrupan bajo el código genérico de su proveedor.

El instalador ejecuta 246 pruebas Kotlin/HTTP/PostgreSQL, las pruebas Python, Docker local y las 23 comprobaciones del gateway antes del commit local. HTTPS se comprueba después y se informa por separado. La actualización admite reformateo de IntelliJ y no cambia las migraciones, configuración privada o identidades del pase.

## Prueba de activación

Después de ejecutar el instalador, generar el enlace temporal de la misma tarjeta desde Caja si la sesión anterior venció. En Android, pulsar «Añadir a Google Wallet», después «Continuar en Google Wallet» y confirmar el guardado en Google. La petición reintenta inmediatamente la entrega de esa tarjeta, sin esperar al siguiente intento de la cola.

Una tarjeta aprobada en la API todavía necesita guardarse en el teléfono. `hasUsers=false` no es una instalación exitosa. La aceptación real de este PATCH y la prueba del dispositivo quedan pendientes de la ejecución del usuario.

Si el guardado falla, volver a ejecutar el instalador con `--wallet-only` para recoger el diagnóstico de ambas plataformas en un ZIP, sin recompilar ni crear otro commit. Esa modalidad puede reaplicar la configuración privada del servidor y comprobar el túnel; no equivale a una consulta estrictamente de solo lectura. Un fallo HTTPS requiere revisar su guía y nunca se interpreta como un error de la cuenta de Google del teléfono.

Apple y Google se verifican en cada entrega. El frente y los detalles se adaptan a las capacidades nativas de cada proveedor.

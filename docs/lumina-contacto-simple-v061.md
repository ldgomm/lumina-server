# Lúmina v022 / Loyalty v061 — contacto y registro más claros

## Cambios para las personas

- El colaborador indica su teléfono al activar su cuenta. El dueño puede añadirlo al invitarlo, si lo conoce; la persona confirma su propio número al activar. El propietario puede corregirlo en Equipo y permisos y cada persona puede cambiar el suyo en Mi cuenta.
- Cada nuevo cliente de Wallet registra nombre, cédula y teléfono. Se admiten teléfonos ecuatorianos y extranjeros con código internacional. El servidor vuelve a validar lo que llega del formulario; no depende de JavaScript.
- El alta pública es una sola pantalla con dos pasos visibles: datos y guardar en Wallet. Cumpleaños es opcional, con listas de día y mes; recibir novedades está desmarcado de inicio. Los errores conservan los datos.
- Si el registro termina y falla la consulta siguiente, se reintenta abrir la misma tarjeta; no se envía otro registro. El botón nativo de Apple/Google sigue preparándose automáticamente.
- La ficha privada del cliente muestra un enlace para llamar. Modificar el teléfono requiere permiso y confirmación con el cliente; un conflicto de versión conserva el cambio pendiente.
- Atender en Caja desde la ficha usa el identificador interno del cliente, limitado al dueño y al negocio autenticado. No depende de exponer el código de la tarjeta en esa ficha.
- Los campos de contraseña incorporan Mostrar/Ocultar. La validación deja de llenar el formulario con mensajes de éxito innecesarios.
- Buscar colaboradores por teléfono admite el número local o internacional, también con espacios y guiones.

El teléfono es contacto: no es prueba de identidad, código de recuperación ni autorización de publicidad. No se envían SMS o WhatsApp ni se comparte el dato con proveedores externos. Dos personas pueden compartir teléfono y mantener sus identidades separadas. La cédula conserva su función de identificación.

## Datos existentes

SQLite010 y PostgreSQLV017 añaden columnas de contacto. Los registros anteriores sin teléfono quedan vacíos y continúan funcionando: no se les asigna el teléfono del negocio ni se bloquean tarjetas instaladas. Una actualización de contacto no cambia saldos, identidad de pases, QR, credenciales Wallet, objetos Google, dispositivos, diseño ni contratos. Representación Wallet34 sin cambios.

Los SQL anteriores permanecen byte por byte intactos. El instalador no cambia claves, certificados, orígenes públicos, túneles, dominios ni configuración privada. No activa servicios, crea cargos, cambia precios o suscribe a nadie.

## Ejecutar en el Mac

Abrir Docker Desktop y detener únicamente la Terminal anterior de Lúmina con Control+C. Desde Descargas:

```bash
bash ~/Downloads/lumina_digital_contacto_simple_v022.sh --iniciar
```

El script admite `--comprobar` para comprobar compatibilidad sin instalar. Compara los archivos con el resultado v021 validado, prueba el portal antes de escribir y rechaza modificaciones incompatibles. Conserva reformateos equivalentes de Kotlin. No despliega ni hace push. El lanzador es ASCII y ejecuta Python en UTF-8 para conservar tildes, nombres y rutas.

Terminal: una línea RESULTADO; la URL de Lúmina aparece solamente al confirmar que el servidor responde. Los detalles de validación se guardan en el resultado descargable de Downloads, sin incluir bases, contraseñas ni configuración privada.

## Verificación de esta entrega

- 26 suites / 283 pruebas del portal.
- 170 pruebas Python.
- 312 pruebas de unidad/HTTP nativas y 347 PostgreSQL: 659 en total.
- 20 suites DOM de interacción, incluidos registro, permisos de contacto, borradores y reintentos.
- Docker local y las comprobaciones del gateway deben pasar en el Mac antes del commit local.

Las 283 pruebas del portal, 170 Python, 312 nativas, 347 PostgreSQL y 20 suites DOM pasaron en el entorno de preparación. La compilación utilizó JDK21 y PostgreSQL16.4 en una copia aislada con las mismas fuentes y versiones de bibliotecas. Para resolver las dependencias aquí, esa copia usa repositorios accesibles y el complemento Gradle `application` en lugar del complemento de empaquetado Ktor. Los archivos Gradle del proyecto entregado permanecen intactos. El empaquetado original de Ktor, Docker y el gateway se verifican nuevamente en el Mac; no se declaran aprobados desde este entorno.

DOM no acredita presentación visual en Safari ni entrega real en iPhone o Android. La revisión visual y las actualizaciones de tarjetas en dispositivos son comprobaciones separadas. Ver `docs/production/transicion-v061.md` antes de desplegar; no reutilizar el paquete de producción anterior.

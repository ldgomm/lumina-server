# Lúmina v012r1 / Loyalty v051r1 — corrección de compilación

El resultado real del 12 de noviembre de 2026 confirma que `compileKotlin` e `installDist` terminaron correctamente. `compileTestKotlin` falló porque `BlackFridayPostgresTest.kt` importaba a la vez `org.junit.jupiter.api.*` y `kotlin.test.*`: ambos aportan el nombre `Test`.

Esta revisión usa imports explícitos para las cinco anotaciones JUnit y las cuatro funciones de aserción utilizadas. Conserva los ocho casos PostgreSQL y todas sus comprobaciones. No elimina ni omite pruebas, ni modifica las reglas de las campañas para resolver el fallo.

El instalador incluye la actualización completa de Viernes Negro porque el intento anterior restauró correctamente la versión v050. También reconoce los archivos exactos de v051 si esa versión permanece aplicada. Rechaza cambios ajenos, conserva la configuración privada y mantiene todos los controles antes de crear un commit local: 146 pruebas del portal, al menos 130 Python, 596 Kotlin/PostgreSQL, Docker y gateway. No hace push.

El cierre de campañas sigue siendo el 1 de diciembre a las 00:00 de Ecuador continental, o antes si así se configuró. Las conexiones, identificadores de tarjetas y movimientos históricos se conservan. Las migraciones y el código de producción de v051 no cambian en esta corrección.

Ejecutar desde Descargas con Docker Desktop abierto y el portal anterior detenido:

```bash
bash ~/Downloads/lumina_digital_viernes_negro_v012_r1.sh --iniciar
```

La Terminal muestra una sola línea `RESULTADO=...`; la dirección de Lúmina aparece únicamente después de verificar que el portal arrancó. Los detalles quedan en el informe de ejecución. La validación nativa completa se ejecuta en el Mac; este entorno no dispone de Docker ni puede descargar Gradle. La prueba en teléfonos Apple/Google y la revisión visual real siguen pendientes.

# Corrección de PostgreSQL v020r1

El informe v020 recibido el 7 de noviembre de 2026 muestra que PostgreSQL arrancó correctamente: 159 de sus 160 pruebas pasaron. La única excepción fue `presentation upgrade refreshes installed card without changing its money or identity`, en WalletPostgresTest, con `expected: <17> but was: <20>`. Las 146 pruebas generales pasaron y no se creó un commit.

v020 actualiza intencionalmente presentationVersion a 20 para renovar el diseño de Apple y Google. La prueba conservaba la expectativa de v017. Esta revisión corrige esa expectativa y prueba la actualización desde las versiones 8 y 17, cada una con su propio negocio y cliente de prueba. Conserva todas las comprobaciones de identidad, saldo, cola de ambos proveedores, registro Apple e idempotencia. No se omite ninguna prueba ni se reduce el umbral de aprobación.

El parche se aplica sobre v020 y tolera el formato y orden de imports de IntelliJ. No cambia el código de producción, datos de negocio, migraciones, certificados ni secretos. No borres tarjetas ni vuelvas a registrar clientes por este fallo.

Desde Downloads:

```bash
bash ./loyalty_corregir_postgres_v020r1.sh --https
```

El script ejecuta las 306 pruebas Kotlin/HTTP/PostgreSQL, las pruebas Python, Docker local y las 26 comprobaciones del gateway. Solo después del PASS completo crea el commit local; no hace push. Comprueba HTTPS después, sin renovar automáticamente la URL. Una renovación explícita sigue requiriendo guardar la conexión de la misma tarjeta en el teléfono.

El ZIP de Downloads incluye este mismo script, los archivos modificados antes/después, el código comprobado, registros redactados, resultados y commit cuando corresponda. Las credenciales y tarjetas no se incluyen.

# Loyalty v019r1 · Prueba de orden determinista

## Causa comprobada en el código y el resultado recibido

El resultado v019 completó 137 pruebas generales sin fallos y 159 de 160 pruebas PostgreSQL. La única prueba fallida fue `customer sorting uses money visits names and registration without changing totals`.

El alta de miembros toma `created_at` del `now()` de PostgreSQL. La prueba usa un reloj fijo del 5 de noviembre de 2026; cambiaba solo la fecha de Zoe a ese día, pero esperaba que fuera más reciente que Ángela y Bruno, registrados con la fecha real de ejecución (7 de noviembre). Ese orden esperado era incorrecto por la preparación de datos.

## Corrección

- La prueba fija las fechas de los tres clientes ficticios a instantes distintos y anteriores al reloj fijo. No depende del día de ejecución.
- Verifica el orden completo de todos los clientes en los cinco criterios y que los totales no cambien.
- Conserva las 297 pruebas requeridas: 137 generales y 160 PostgreSQL. No omite ni marca como aprobada la prueba fallida.
- No modifica código de producción, consultas, migraciones, clientes reales, saldos, credenciales ni tarjetas Apple/Google.

## Ejecutar sobre v019

```bash
cd ~/Downloads
bash loyalty_corregir_postgres_v019r1.sh
```

El script aplica el arreglo al test y actualiza el identificador del control de ejecución. Repite pruebas generales/PostgreSQL/Python, Docker local y gateway; crea el commit local únicamente cuando esas comprobaciones aprueban. HTTPS se comprueba después y se informa por separado. No realiza push ni renueva túneles automáticamente.

El ZIP generado en Downloads conserva el mismo script, código anterior/aplicado/probado, registros redactados, resultados y commit si se creó. `--check-only` comprueba compatibilidad y genera evidencia sin modificar el proyecto ni crear commit. Los cambios de formato e imports de IntelliJ son compatibles; un conflicto real de lógica detiene el parche antes de escribir parcialmente.

# Corrección v010r1

Los botones de pizzas, cafés, ropa y cortes son ejemplos editables. Cada negocio define su categoría, acumulación por producto o compra, meta, porcentaje y premio. Los programas existentes siguen admitiendo puntos, cashback, fechas, horarios, bonos y sucursales. Las reglas que cambian el significado de lo acumulado se crean como otra promoción para conservar los saldos anteriores.

La evidencia v010 confirma 174 pruebas Kotlin/HTTP/PostgreSQL y 88 pruebas Python aprobadas, además de Docker local. No se creó commit porque el gateway respondió 404 a `/engagement.js`.

El contenedor del gateway seguía en estado `Running`: actualizar el archivo montado de configuración no obliga a Compose a recrearlo ni a Nginx a leerlo de nuevo. Esta corrección recrea únicamente `loyalty-wallet-gateway` con `--no-deps --force-recreate` y luego exige las 22 comprobaciones de rutas. El túnel conserva su contenedor y URL; no se reinician datos ni se regeneran claves. La comprobación local también verifica el archivo JavaScript y el logo antes de pasar al gateway.

Ejecutar desde Downloads:

```bash
cd ~/Downloads
bash loyalty_promociones_v010r1.sh
```

El instalador exige nuevamente 174 pruebas Kotlin/HTTP/PostgreSQL, ahora 90 pruebas Python, Docker local y gateway antes de crear el commit. HTTPS se verifica después y se informa por separado. El ZIP de Downloads incluye el `.sh`, código y resultados. Las credenciales y certificados quedan excluidos.

Referencia: https://docs.docker.com/reference/cli/docker/compose/up/

# Lúmina Digital · Jornada simple v023 / Loyalty v062

Actualización sobre la v022 instalada y validada (commit 6bb8c0d534df0d775dc6a335889cf7451cd1653b).

## Lo que cambia

- **Pendientes completos.** Entregas por revisar, cotizaciones y propuestas tienen una bandeja con búsqueda y páginas. El inicio prioriza las tareas pendientes; el enlace muestra todas, incluidas las propuestas de paquetes.
- **Agenda más clara.** Próximas grabaciones, visitas por actualizar e historial en Lúmina y en el módulo de Contenido. Fechas en hora de Ecuador; búsqueda por solicitud, lugar y, para la agencia, negocio. El historial continúa disponible al superar cien visitas.
- **Solicitudes ordenadas.** Todas, en curso y cerradas, con totales y páginas exactos. Una solicitud de varias piezas muestra las que ya se entregaron. Una página guardada que ya no existe vuelve a la última disponible.
- **Encontrar una sección.** Búsqueda en el menú de Lúmina y Contenido, también en móvil. Equipos y roles sigue junto a Mi negocio. La búsqueda muestra solo accesos autorizados y no almacena datos.
- **Cifras coherentes.** Una solicitud cancelada deja de anunciar grabaciones próximas, sin borrar visitas ni historial. Una visita cuya fecha pasó se muestra por actualizar: no se da por realizada automáticamente.

## Lo que se conserva

Cédula/RUC, teléfono de colaboradores y clientes, permisos por negocio y plataforma, acceso directo a Wallet y sesión única. La agencia consulta sin convertirse en el dueño. Los colaboradores no ven propuestas comerciales y solo reciben entregas que pueden aprobar.

No se modifica el esquema SQLite10/PostgreSQLV017 ni el motor Wallet, la representación 34, sus claves, certificados, dominios, seriales, asociaciones, saldos, dispositivos, suscripciones o contratos. No se reemiten tarjetas ni se cobran importes por ejecutar esta actualización.

## Ejecutar en el entorno local

Abre Docker Desktop. Si la Terminal anterior mantiene Lúmina abierta, detenla con Control+C. Desde Descargas:

```bash
bash ~/Downloads/lumina_digital_jornada_simple_v023.sh --iniciar
```

El instalador compara el código, detecta conflictos y conserva los cambios ajenos. Comprueba el portal antes de escribir, ejecuta los gates nativos, PostgreSQL, Docker y gateway antes del commit local, y no hace push. Los errores de pruebas restauran los archivos propios de la actualización cuando siguen coincidiendo con lo instalado.

Solo imprime el resultado; al confirmar que el portal arrancó, también imprime:

```text
Lúmina Digital disponible en http://127.0.0.1:8099
```

Guarda el resultado detallado en Descargas. El archivo funciona con Python 3 y rutas con acentos, aunque la Terminal use locale C. `--comprobar` realiza la comprobación previa sin instalar.

## Comprobaciones

27 suites y 298 pruebas del portal; 170 pruebas Python del instalador; 21 suites DOM de interacción. Se mantiene el gate nativo de 312 pruebas de unidades/HTTP y 347 PostgreSQL. Las pruebas DOM no certifican el aspecto visual en Safari ni la recepción física de Apple/Google Wallet.

Esta entrega es para el checkout local de desarrollo y bloquea perfiles de producción. No publica una nueva versión en un servidor. El paso a producción sigue el despliegue controlado y la comprobación de continuidad de la v061; no hay nuevas migraciones ni un cambio de identidad en esta entrega.

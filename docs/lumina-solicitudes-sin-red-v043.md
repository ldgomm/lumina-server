# Lúmina v004 / Loyalty v043

El cliente solicita una pieza de contenido, sin elegir Instagram, TikTok, Facebook ni YouTube. La cortesía solicita únicamente el tema del video y las indicaciones. Contenido para redes muestra los trabajos comunes sin pestañas por red.

Al aprobar el entregable, la agencia puede abrir Registrar publicación y elegir red, enlace y fecha. Después registra los cortes de métricas de cada publicación. El mismo video puede tener cuatro publicaciones y seguir contando como una sola pieza y un único cupo. No se crean destinos de forma implícita.

## Compatibilidad y permisos

No se migra ni borra la base. Las filas históricas de request_platforms quedan intactas por compatibilidad y para respetar restricciones de acceso anteriores; dejan de ser un requisito de publicación. Las nuevas solicitudes se guardan sin destinos. Los enlaces antiguos del contenido se redirigen al listado común. El formulario anterior de añadir plataformas se retira.

Un colaborador autorizado a ver o solicitar una red puede consultar o solicitar contenido común. Solo ve enlaces y métricas de las plataformas autorizadas. Aprobar nuevas piezas comunes exige el permiso explícito Aprobar de Contenido para redes. Los permisos históricos no se amplían y se conserva el aislamiento entre negocios.

Wallet conserva su acceso único, asociaciones y configuración privada. No hay cambios Kotlin, SQL de PostgreSQL, esquemas SQLite, certificados, seriales, claves, URLs públicas ni túneles.

## Validación

36 pruebas HTTP y de arranque, incluidas solicitudes sin destinos, cortesía única sin cupos, una pieza publicada en cuatro redes, permisos, datos históricos, fechas y duplicados. El instalador prueba una copia aislada y después exige los gates completos de Loyalty: 570 Kotlin/PostgreSQL, 128 Python, Docker y gateway antes del commit local, sin push. Las pruebas en teléfonos y la revisión visual se informan por separado.

## Instalación

Detener solo el portal Node con Control+C y mantener Docker Desktop abierto. Desde Downloads ejecutar `bash lumina_digital_solicitudes_sin_red_v004.sh --iniciar`. El script conserva la configuración existente y deja Lúmina abierta al terminar. `--comprobar` valida compatibilidad y el portal sin instalar.

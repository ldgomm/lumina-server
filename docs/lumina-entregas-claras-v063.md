# Lúmina Digital · Entregas claras v024r1 / Loyalty v063

Actualización sobre la v023 instalada y validada, commit `90fd692782e391222416298ffa555f7fc9be46e0`. El resultado recibido confirmó 298 pruebas del portal, gates locales, commit y arranque. Esta entrega prepara el siguiente cambio; no está instalada en tu Mac hasta ejecutar el archivo.

## Corrección de la revisión r1

El resultado de v024 del 14-11-2026 confirmó 314 pruebas en la comprobación previa, pero la segunda ejecución falló en una sola comprobación: buscaba `2099` en todo el HTML de la agencia. Lo encontró dentro del identificador aleatorio de un negocio en el enlace de una solicitud cancelada, conservada correctamente en actividad reciente. La sección de próximas grabaciones estaba vacía. El instalador restauró el código anterior y no creó commit.

La prueba ahora comprueba la sección de próximas grabaciones y sus recuentos, con una agenda vacía y otra con una visita vigente junto a la cancelada. Una regresión adicional reproduce el identificador que contiene `2099` de forma determinista. No se omiten pruebas ni se convierten fallos en aprobaciones. Esta entrega incluye todas las mejoras v024 para poder aplicarlas sobre el código restaurado.

## Solicitud y entrega

- **Siguiente paso visible.** La ficha indica si toca revisar una cotización, esperar una visita, revisar archivos o completar una entrega. Los accesos llevan al punto correspondiente y abren las secciones plegadas.
- **Archivos fáciles de encontrar.** Cada entregable reúne sus enlaces, observaciones y estado. Las revisiones pendientes aparecen primero para el negocio; la agencia prioriza los trabajos aprobados y en producción. Las publicaciones y métricas se despliegan cuando se necesitan.
- **Dos decisiones claras.** Aprobar entrega tiene su propio botón. Pedir cambios abre un campo obligatorio con la explicación. Ya no hay un selector que preseleccione la aprobación. Esto funciona también sin JavaScript.
- **Errores recuperables.** Cotizaciones, grabaciones, entregables, archivos, publicaciones y métricas conservan lo escrito ante errores de validación o versión. Se reabre el formulario correspondiente. Si el trabajo cambió de estado y ya no admite esa acción, el texto permanece visible para recuperarlo.
- **Revisión vigente.** Adjuntar un archivo incrementa la revisión del entregable. Una aprobación abierta antes del cambio se rechaza. Los formularios recuperados mantienen la revisión que enviaron; no se les asigna silenciosamente una versión nueva.
- **Menos duplicados.** Los nuevos formularios de estado, cotización, creación de entregables y visitas verifican su revisión. Un enlace repetido en el mismo entregable se rechaza sin duplicar archivos ni auditoría. Las integraciones antiguas que omiten la revisión siguen siendo compatibles.
- **Visitas con resultado.** Las notas de cierre quedan junto a la visita, conservando las indicaciones originales. La fecha real se muestra en hora de Ecuador. Pedir cambios registra el nombre del entregable junto a la observación.
- **Misma organización.** La ficha se aplica a Contenido, Web, Marca y los demás servicios. Las redes sociales se eligen al registrar publicaciones, nunca al solicitar o revisar el trabajo. Se conservan la navegación, las dimensiones de las barras laterales y el acceso a Equipos y roles.

## Permisos y continuidad

La agencia consulta el negocio sin convertirse en su dueño. El trabajo de producción se realiza en las rutas de agencia. El colaborador solo puede ver y aprobar lo autorizado; una revocación se aplica a la misma sesión. Precios y cotizaciones siguen ocultos a los colaboradores. No se recuperan formularios ante fallos de autorización o de aislamiento entre negocios.

Esta actualización no cambia archivos nativos Kotlin, SQL, esquema SQLite10/PostgreSQLV017, representación Wallet34, configuración privada, certificados, identidades, claves, dominios, seriales, saldos, dispositivos, suscripciones, precios ni contratos. No reemite tarjetas. La comprobación de servidor no equivale a comprobar una actualización recibida en un teléfono.

## Instalación local

Abre Docker Desktop. Si la Terminal anterior mantiene Lúmina abierta, detenla con Control+C. Ejecuta desde Descargas:

```bash
bash ~/Downloads/lumina_digital_entregas_claras_v024r1.sh --iniciar
```

El instalador verifica la compatibilidad antes de escribir, comprueba el portal y ejecuta las pruebas nativas, PostgreSQL, Docker y gateway antes del commit local. No hace push. Si las pruebas fallan, restaura los archivos propios que aún coinciden con lo que instaló, conservando los cambios ajenos.

Solo imprime `RESULTADO=...`. Tras confirmar la salud del portal, también imprime:

```text
Lúmina Digital disponible en http://127.0.0.1:8099
```

El resultado detallado queda en Descargas. `--comprobar` verifica sin instalar. El archivo usa Python 3 explícitamente y una envoltura ASCII comprobada con rutas con acentos y locale C.

## Verificación y alcance

28 suites y 315 pruebas del portal; 170 pruebas Python; 22 suites DOM de interacción. El gate nativo sigue siendo de 312 pruebas de unidades/HTTP y 347 PostgreSQL. Los informes distinguen pruebas DOM de revisión visual en Safari y recepción física de Apple/Google Wallet.

El instalador sirve para el checkout local de desarrollo y bloquea producción. No sustituye el despliegue controlado ni la comprobación de continuidad en producción. No hay nuevas migraciones en esta entrega.

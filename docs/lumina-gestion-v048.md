# Lúmina v009 / Loyalty v048

Lúmina concentra la contratación y administración. Wallet mantiene sus herramientas de fidelización y usa la cuenta de Lúmina. El actualizador conserva todos los vínculos y datos existentes.

## Oferta y contratación

La agencia abre **Paquetes y servicios → Crear oferta**. El editor tiene tres pasos:

1. Servicios: elegir un área y las cantidades. Contenido tiene videos, fotografías y diseños; Wallet tiene servicio de fidelización; Maps, gestión del perfil; Web, proyecto o mantenimiento; Marca, diseño de marca. Se pueden combinar áreas.
2. Precio: nombre, trabajo puntual o mensual, precio total definido o por cotizar y alcance. Marca es un trabajo puntual. La oferta puede incluir Wallet como cortesía junto a otro servicio.
3. Revisión: cantidades, modalidad, alcance y precio antes de confirmar la publicación.

Una unidad sola se muestra como servicio individual. Varias unidades o servicios forman un paquete sin otra pregunta de clasificación. Las variantes de web, Maps o marca se detallan en el alcance. El catálogo conserva los servicios históricos y los precios anteriores.

El negocio combina ofertas en **Contratar**, consulta el desglose mensual/puntual, solicita su propuesta y acepta la versión que prepara Lúmina. La agencia activa esa propuesta aceptada. **Mis servicios** muestra acuerdos, fechas y cupos. **Solicitudes** mantiene propuestas y su historial. No se cobra automáticamente ni se activa desde el panel Wallet.

El precio por cotizar se mantiene indeterminado. Cero significa gratuidad explícita. Una nueva tarifa no modifica contratos firmados. El próximo período mensual se solicita y acepta; los cupos no se acumulan. Cancelar un acuerdo no cancela otros ni desactiva el espacio Wallet. Los formatos de solicitudes de contenido y el video de cortesía siguen sin pedir redes; las plataformas se registran al publicar/medir.

## Responsabilidades

| Lúmina | Wallet |
| --- | --- |
| Precios, paquetes, propuestas y renovaciones | Caja, clientes y radar de regreso |
| Cuenta, equipo y permisos | Promociones, premios y cumpleaños |
| Datos y sucursales del negocio | Diseño, estado de tarjetas y QR |
| Actividad e informes de fidelización | Operación limitada por permisos de Lúmina |

El dueño abre Administración para los datos, sucursales, actividad, operación e informes. Los editores nativos conservan sus controles de versión, confirmación y borradores dentro de la navegación de Lúmina. La API central es independiente de las rutas operativas de Wallet y conserva el aislamiento por negocio. La agencia consulta información; no inicia sesión como dueño ni contrata por él. Un colaborador solo accede a sus áreas asignadas; el permiso de informes no concede acceso a cargos ni equipo.

Los cargos y pagos anteriores de Wallet permanecen consultables mediante **Mis servicios → Consultar cargos anteriores de Wallet**. Se identifican como historial anterior; cualquier programación antigua se conserva y sigue visible. Esta actualización no condona deudas ni modifica acuerdos anteriores. Toda contratación nueva se realiza en Lúmina.

## Actualización local

Detener la Terminal anterior con Control+C, mantener Docker Desktop abierto y ejecutar desde Descargas:

```sh
bash ~/Downloads/lumina_digital_gestion_v009.sh --iniciar
```

El script requiere la base v047 o los mismos cambios ya aplicados. Si encuentra diferencias locales incompatibles, se detiene sin sobrescribirlas. `--comprobar` valida compatibilidad y contratos HTTP sin instalar ni crear commit. La ejecución normal aplica el parche y exige las pruebas completas antes de crear un commit local; nunca hace push.

Al iniciar correctamente, la Terminal imprime el resultado y `Lúmina Digital disponible en http://127.0.0.1:8099`. Una URL no se imprime como disponible si falla la comprobación de salud. Control+C cierra solo ese portal. Los errores detallados quedan en la evidencia; el registro privado de arranque no se incluye.

## Verificación y límites

- 92 pruebas de portal: precios, cantidades, propuesta, aceptación, renovación, cancelación, accesos, agencia, falsificación de solicitudes y conservación de vínculos.
- 130 pruebas Python del flujo e instaladores.
- Interacción DOM con scripts reales: pasos/Enter/revisión, combinaciones, precio, modo sin JavaScript, menú Wallet, seis páginas de administración, filtros y protección de borradores.
- El Mac debe ejecutar además las 580 pruebas Kotlin/HTTP/PostgreSQL, Docker local y las 114 comprobaciones del gateway antes del commit.
- Los controles DOM/HTTP no prueban distribución visual real. Navegador, HTTPS y recepción en Apple/Google Wallet se informan por separado.

No se modifican migraciones SQL/SQLite, código Kotlin, motor nativo, claves privadas, túneles, emisor, seriales, tarjetas, códigos QR ni identidad Apple/Google. Los logos del portal no sustituyen los logos de los negocios en sus tarjetas.

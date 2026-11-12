# Equipos y roles — Lúmina v015 / Loyalty v054

## Acceso visible

El dueño encuentra **Equipos y roles** inmediatamente debajo de **Mi negocio** y como botón en el inicio. Se conserva su editor de personas, Caja y permisos, con un único bloque Wallet y un solo guardado. No depende de la verificación comercial ni de permisos de colaborador.

La agencia también dispone de **Equipos y roles**, junto a **Clientes**. Abre un directorio de negocios y permite consultar personas, roles, estados y tareas. Cada negocio tiene un enlace desde Clientes. La consulta no permite crear personas, cambiar permisos, reiniciar accesos ni operar por el negocio.

El nombre es el mismo en menú, inicio, administración y ayuda. `/equipos` dirige al dueño a `/equipo`; nunca usa un parámetro `empresa` para cambiar su negocio. Los colaboradores no reciben un acceso administrativo.

## Identidad y permisos

La sesión lee el rol y el negocio de la cuenta autenticada en cada petición. Esta revisión no transforma una cuenta de agencia en dueño ni modifica identidades por nombre o por lo que muestre una captura. Se comprueba registro, salida, nuevo ingreso y cambio de cuenta en el mismo navegador con cuentas ficticias.

La lectura de agencia utiliza una proyección explícita: nombre, correo, rol, estado y tareas asignadas. No devuelve contraseñas, tokens, códigos de activación, sesiones ni información cifrada. No prepara credenciales ni contacta a Wallet. La búsqueda se aplica antes de la paginación de 20 registros; las personas se limitan al negocio seleccionado.

## Validación

- 18 suites / 181 pruebas HTTP del portal, sin omisiones, incluidos 12 casos de navegación, sesión, consulta y autorización.
- Pruebas DOM de navegación móvil, enfoque, enlace del dueño, formulario editable y consulta de agencia sin controles de modificación.
- Regresión DOM del editor de permisos unificado.
- 130 pruebas Python del instalador.
- El instalador exige además las 596 pruebas nativas, PostgreSQL, Docker local y gateway antes de crear un commit local. Sin push.
- La comprobación visual en navegador y las tarjetas físicas Apple/Google se informan por separado. No se deducen de HTTP o DOM.

La evidencia anterior v014 confirmó instalación y commit `df6583b39ed3b451110064cdbd1a3e852017ffec`. Sirve de base para aplicar el cambio, no como prueba de esta nueva versión.

## Aplicación

Desde Downloads:

```bash
bash lumina_digital_equipos_visibles_v015.sh --iniciar
```

El script comprueba compatibilidad antes de escribir, rechaza conflictos y conserva cambios ajenos. No modifica Kotlin, SQL, claves privadas, negocio vinculado, tarjetas, saldos ni HTTPS. La Terminal muestra un único `RESULTADO=...`; si se inicia y se comprueba el portal, también muestra `Lúmina Digital disponible en http://127.0.0.1:8099`. El detalle queda en el ZIP de evidencia y el registro de arranque privado.

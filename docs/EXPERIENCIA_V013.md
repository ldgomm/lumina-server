# Loyalty v013 · diseño y flujo diario

## Qué cambia

- Resumen inicial para el dueño, con compras, total pagado, clientes compradores y premios reclamados de los últimos 30 días. Clientes recientes, oportunidades de regreso y accesos a Caja, Promociones, Mi tarjeta y QR.
- Menú lateral por tareas en escritorio y menú desplegable en móvil. Mantiene separados dueño, cajero, plataforma y cliente.
- Promociones se abre como una lista, con búsqueda por nombre/categoría y filtros de estado. El formulario aparece al crear o editar. Los ejemplos no fijan las reglas: cantidad, categoría, porcentaje y recompensa siguen siendo configurables.
- Creación guiada de sellos con explicación del resultado; editor avanzado independiente para puntos, cashback, horarios, bonos y sucursales. Eliminar conserva la revisión del impacto, la palabra ELIMINAR y el consentimiento explícito.
- Caja separa Cliente, Operación y Recibo. Una operación a la vez, subtotal de referencia, revisión del descuento en el servidor y botón para atender al siguiente cliente.
- Los errores permanecen junto al formulario sin borrar los campos. Mientras se envía una operación se bloquean edición, nuevos envíos y navegación. Un reintento conserva la misma clave de idempotencia. El recibo retira los formularios del cliente anterior.
- Los informes de clientes conservan etiquetas de columna cuando se muestran como tarjetas en móvil. Estados vacíos, carga, foco visible, mensajes accesibles y adaptación a pantallas pequeñas.

## Qué se conserva

No hay migraciones nuevas ni cambios en el cálculo de saldos, reglas, identidad, permisos o transacciones. No se regeneran pases, QR, certificados, claves, bases de datos ni credenciales. El servidor sigue validando condiciones, identidad y saldo al confirmar una compra o canje.

El resumen es de solo lectura. Las cifras de oportunidades usan todo el historial y promociones activas; no equivalen a premios ya entregados. La cantidad de promociones habilitadas refleja su estado configurado, sujeto a fechas y condiciones. Los avisos de marketing, Google Wallet y la política de un dispositivo conservan su estado anterior; esta entrega no certifica funcionalidades pendientes.

## Instalación

Ejecutar desde Downloads:

```bash
cd ~/Downloads
bash loyalty_diseno_y_flujo_v013.sh
```

El destino predeterminado es `/Users/ldgomm/Developer/pdc/sales/loyalty`. Actualiza fragmentos Kotlin y JavaScript por tokens y módulos Python por estructura; tolera el formato y el orden de declaraciones de IntelliJ. Si una región tiene un cambio real no reconocido, se detiene antes de escribir. No sobrescribe cambios ajenos.

La validación local exige 203 pruebas Kotlin/HTTP/PostgreSQL, incluidas 21 de concurrencia, las 105 pruebas Python, Docker staging y 23 comprobaciones del gateway antes del commit local automático. HTTPS se comprueba después. El ZIP en Downloads incluye el mismo instalador, fuente anterior y probada, resultados, errores y registros redactados. No se incluyen secretos. No se hace push ni se renueva por defecto la URL de un túnel con pases emitidos.

Después del PASS, recargar el panel en `http://localhost:8097/`. El dueño entra en Resumen y el cajero en Caja. Si el navegador conserva recursos anteriores, recargar sin caché una vez.

## Verificación de esta entrega

Se compiló y probó el servidor con JDK 21: 71 pruebas unitarias/HTTP y 111 pruebas de base de datos sin concurrencia sobre PGlite. Dos cortes transitorios de conexión del adaptador al iniciar suites se resolvieron con ejecuciones posteriores; todas las pruebas enumeradas terminaron aprobadas. PGlite no valida la concurrencia de PostgreSQL nativo: las 21 pruebas restantes se ejecutan obligatoriamente con PostgreSQL real en el Mac antes del commit.

Las 105 pruebas Python del instalador pasaron. También se probaron los recorridos en Chromium con un Ktor real y datos ficticios: acceso fallido, resumen, menú móvil, filtros, regla personalizada de novena compra al 35%, edición de bonos, pausa, eliminación con aviso, cotización, errores de red, invalidación de una cotización modificada, bloqueo durante el guardado, reintento tras una respuesta perdida sin duplicar premio, siguiente cliente, permisos y registro sin contraseña. Se revisaron capturas de escritorio y móvil. Las pruebas previas de clientes también se ejecutaron en JSDOM.

Docker, HTTPS del Mac y Apple/Google Wallet en teléfonos no se pueden certificar desde estas pruebas de interfaz. El instalador recoge esas comprobaciones del entorno local por separado.

## Repetir las pruebas de navegador (desarrollo)

`scripts/ui/experience.spec.cjs` crea un negocio y clientes ficticios. Solo ejecutarlo contra un servidor local con base de datos de pruebas aislada; requiere autorización explícita mediante la variable de entorno y una credencial de plataforma de ese entorno. No usar la base de clientes del piloto.

```bash
cd scripts/ui
npm ci
npx playwright install chromium
export LOYALTY_UI_ORIGIN=http://127.0.0.1:8097
export LOYALTY_UI_CREATE_TEST_DATA=yes
# Configurar LOYALTY_UI_ADMIN por un medio privado; nunca guardarlo en Git.
npm test
```

`LOYALTY_UI_EVIDENCE` permite elegir un directorio temporal para las capturas. Estas pruebas opcionales no añaden Node ni Chromium a la imagen del servidor y no se presentan como ejecutadas en el Mac por el instalador.

# Administración, equipo y actividad · v037

## Administrador de plataforma

Entra con tu acceso habitual en `/platform`. La portada muestra negocios, sucursales, inscripciones de clientes, compras y premios del período. El total pagado se separa por moneda. Buscar filtra la lista de negocios, no los indicadores globales.

Cada negocio ofrece:

- **Ver estadísticas / Informes:** evolución diaria, comparación de períodos, sucursales, recurrencia, productos registrados y premios. Se conserva la descarga CSV diaria existente.
- **Clientes:** búsqueda, grupos, orden por gasto o compras, ficha individual con frecuencia media, consumo histórico, movimientos y progreso de premios vigentes.
- **Actividad:** compras, premios entregados y cambios administrativos, filtrables por período, sucursal, responsable y búsqueda.
- **Equipo:** los mismos controles de acceso que tiene el dueño. El administrador puede recuperar el acceso de un dueño sin usar su credencial.
- **Negocios, membresías y cobros:** acceso a la administración existente.

Los informes describen operaciones registradas en Loyalty. Las inscripciones en dos negocios son dos registros; no se presentan como dos personas únicas. La ficha administrativa es de lectura y no expone el QR personal del cliente.

## Dueño del negocio

Abre **Administración → Equipo y accesos**.

1. Pulsa **Añadir usuario**. Escribe nombre y apellido, contacto opcional, rol y sucursal.
2. **Caja** registra compras y entrega premios únicamente en su sucursal. **Dueño** administra todas las sucursales, promociones y usuarios del negocio. Estos son los dos roles disponibles.
3. Copia la credencial que aparece al crear el usuario y entrégala por un medio privado. La aplicación conserva su hash, no una copia recuperable de la credencial.
4. **Editar** cambia nombre, contacto, rol o sucursal, con motivo. **Renovar credencial** sustituye el acceso anterior.
5. **Desactivar** bloquea el acceso temporalmente. **Reactivar** genera una credencial nueva; la antigua sigue invalidada.
6. **Eliminar acceso** es definitivo para ese usuario. Su historial permanece vinculado a su identificador. Si vuelve, crea un usuario nuevo.

La renovación, baja y reactivación piden motivo y confirmación. No puedes retirar ni cambiar el alcance de tu propio acceso. Otro dueño o el administrador puede hacerlo. Siempre debe quedar un dueño activo.

Los accesos existentes mantienen sus credenciales y permisos; aparecen inicialmente como “Dueño · …” o “Caja · …”. Usa **Editar** para poner el nombre real. Cada empleado debe usar su propia credencial para que la atribución sea útil; una credencial compartida solo identifica el acceso compartido.

Si se pierde la respuesta al crear un usuario, recarga la lista. El mismo intento no duplica el usuario. Si ya no tienes la credencial, usa **Renovar credencial**. No se envían contraseñas por correo ni se guardan credenciales en el navegador.

Si otra persona modifica el mismo usuario mientras lo editas, se rechaza el cambio con un conflicto. Tu formulario conserva el texto: cierra, pulsa **Actualizar lista**, revisa el estado nuevo y vuelve a editar.

## Quién hizo qué

Abre **Administración → Actividad**, o **Ver actividad** dentro de un usuario.

- Una compra muestra cliente, responsable, sucursal, fecha, comprobante, importe pagado, productos capturados y acumulación aplicada.
- Un premio entregado muestra cliente, responsable, sucursal, fecha, premio, promoción, saldo utilizado y comprobante o referencia del canje. Distingue entrega directa y aplicación en una compra.
- Los cambios de accesos incluyen motivo y los datos de rol/nombre/sucursal anteriores y posteriores cuando corresponde.

El nombre del responsable se captura en las operaciones nuevas y se conserva aunque luego cambie su nombre, sucursal o estado. Los movimientos anteriores a v037 conservan el identificador original y muestran una aclaración cuando se usa el nombre actual. No se inventan nombres históricos.

La actividad muestra 50 registros por página y mantiene la fecha de consulta al paginar. **Actualizar** inicia una consulta nueva. Los períodos son de 7, 30, 90 o 365 días, desde la medianoche local correspondiente hasta la hora de consulta. Un filtro de sucursal incluye sus operaciones de caja; los cambios administrativos de alcance general no tienen sucursal.

## Instalación y verificación

Ejecuta el `.sh` v037 desde Downloads con Docker iniciado. Requiere v036. Añade V010; V001–V009 conservan sus bytes y sus contratos. No cambia balances, reglas de promociones ni la identidad de las tarjetas de Apple o Google.

El instalador valida 260 pruebas unitarias/HTTP, 240 PostgreSQL, 128 Python, Docker local y 97 comprobaciones del gateway antes del auto commit local. Incluye código, el mismo `.sh`, resultados y registros redactados en el ZIP de Downloads. No hace push.

La fase HTTPS conserva la política existente: un túnel temporal retirado se informa por separado. No se renueva automáticamente ni se obliga a reinstalar tarjetas por esta entrega. La aceptación visual de Wallet en iPhone/Android continúa siendo una comprobación independiente.

La prueba `scripts/ui/management.spec.cjs` usa datos ficticios y red interceptada: usuarios, cambios, conflictos, permisos, actividad, estadísticas globales y ficha del cliente en 320/390/1024/1440 px. No sustituye las pruebas del servidor ni simula un PASS de Docker.

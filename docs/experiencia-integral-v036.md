# Loyalty v036 · Experiencia integral

Esta entrega une la operación del negocio, la configuración de promociones, la revisión de compras y la información que reciben Apple y Google Wallet.

## Qué cambia

- **Resumen:** períodos de 7, 30 y 90 días; pendientes con acceso a su resolución; cinco pasos de preparación con datos reales. Detecta promociones sin premio, finalizadas o próximas a terminar, y clientes con saldo para un beneficio.
- **Promociones:** búsqueda por promoción, premio, categoría o sucursal; filtros por acumulación y estado; reglas, condiciones y metas en la misma ficha. Pausar, reactivar, editar metas y eliminar conservan sus confirmaciones.
- **Caja:** antes de guardar se ve cuánto aportará cada promoción seleccionada y por qué otra aporta cero. El cálculo procede del servidor y considera productos, mínimo, horarios, sucursales, bonos y descuento. Ninguna promoción comienza marcada.
- **Revisión vigente:** si otra operación o un cambio de reglas invalida la revisión, la compra se rechaza antes de registrarse. Se conservan los datos para revisar de nuevo. Un reintento idéntico recupera el mismo comprobante.
- **Borradores:** cambiar de sección, cliente o salir avisa cuando hay una compra o promoción en preparación. Los datos permanecen solo en la pestaña actual; no son una copia de seguridad.
- **Apple y Google:** en Mi tarjeta → Promoción y textos, el nuevo orden automático puede destacar el premio más cercano de cada cliente. Una promoción o premio fijado explícitamente mantiene prioridad. Se actualizan las mismas tarjetas.
- **Informes:** lectura del período, días con compras registradas, compradores con una compra y porcentaje de comprobantes que incluyen productos. Explica qué datos faltan para conocer mejor las categorías compradas.

## Instalar desde Downloads

```sh
cd ~/Downloads
bash loyalty_experiencia_integral_v036.sh
```

El instalador requiere v035, comprueba los cambios sobre el código actual y conserva reformateos de IntelliJ fuera de las regiones modificadas. Si detecta lógica incompatible, genera evidencia y se detiene antes de aplicar el lote.

Ejecuta 478 pruebas Kotlin/HTTP/PostgreSQL, 128 Python, compilación, Docker local y las 88 comprobaciones del gateway antes de crear el commit local. No hace push. HTTPS se comprueba por separado. El ZIP del resultado se crea en Downloads e incluye el instalador, código antes/después, resultados y registros redactados; excluye configuración privada, certificados y claves.

## Recorrido recomendado después de instalar

1. Abre Resumen y entra en un pendiente de promociones. Comprueba la búsqueda, las condiciones y la meta de su premio.
2. Busca un cliente en Caja. Registra el importe y elige únicamente las promociones que correspondan. Revisa el desglose antes de confirmar.
3. En Mi tarjeta → Promoción y textos, deja la promoción en Automático y selecciona Mostrar primero el premio más cercano. Guarda explícitamente. Si prefieres un frente fijo, conserva la promoción destacada o el orden anterior.
4. Comprueba la misma tarjeta en un iPhone y un Android después de una compra/canje. Las pruebas del servidor y navegador no sustituyen la recepción física del pase.
5. Consulta Informes y su cobertura de compras con productos. El dato se refiere exclusivamente a lo registrado en Loyalty.

## Alcance de esta entrega

No hay migración SQL ni cambio de identidades de pases. Se mantienen los diseños, las reglas, los saldos, los registros y los protocolos existentes. El orden automático es opcional y no modifica premios ni genera canjes. Los avisos del resumen son información para el dueño; no envían campañas ni notificaciones a los clientes.

Un HTTPS temporal retirado sigue requiriendo renovación explícita y, si procede, actualizar la conexión de la misma tarjeta. El instalador nunca borra tarjetas ni renueva automáticamente el túnel. Producción pública, disponibilidad permanente, recepción física en ambos teléfonos y exclusividad de un solo dispositivo no se declaran aprobadas por este paquete.

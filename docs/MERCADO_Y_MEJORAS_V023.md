# Loyalty v023 — regreso, claridad y medición

Investigación: 8 de noviembre de 2026. Base examinada: código `after/` del resultado v022r1, commit reportado `ac43bf62c0011fa07f8b70d777ad603b8314a431`. La comparación usa documentación pública de los proveedores; no es una prueba contratada de sus productos ni demuestra exclusividad mundial.

## Qué ofrece el mercado y dónde estamos

| Referencia | Funciones publicadas | Situación comprobada en Loyalty v022r1 | Respuesta v023 |
| --- | --- | --- | --- |
| [Loopy Loyalty](https://loopyloyalty.com/features/messaging/) | Mensajes individuales y por segmentos: sellos, premios pendientes, clientes frecuentes. | Hay eventos, cumpleaños y progreso en Wallet; falta una pantalla que reúna oportunidades de regreso. | Radar privado con grupos dinámicos, explicación y acceso a la ficha. La mensajería segmentada queda pendiente. |
| [Loyalzoo](https://help.loyalzoo.com/en/articles/17297185-loyalzoo-plan-comparison) | Segmentos que se actualizan, campañas y premios por grupo, niveles de fidelidad; algunas capacidades dependen del plan. | Promociones flexibles, sucursales e informes; no encontré niveles ni un constructor de campañas por segmento. | Primera segmentación por actividad real y cercanía del premio. Sin crear niveles o campañas implícitamente. |
| [Stamp Me](https://www.stampme.com/case-studies/untamed-nutrition) | Su caso publicado muestra cumpleaños, reactivación de clientes inactivos y juegos de premios. | Cumpleaños ya implementados; faltaba explicar la inactividad según cada cliente. | Intervalo habitual individual, sin dar por perdido a quien compra con menor frecuencia. Los juegos siguen pendientes. |
| [PassKit](https://passkit.com/platform/analytics/) | Eventos de creación, instalación, actualización, retirada y fuentes de distribución. Aclara que no mide aperturas de Wallet. | Cola y diagnóstico de entrega existentes; falta un embudo consolidado por fuente y proveedor. | Se conserva el diagnóstico. Se añade una medida de segunda visita por cohortes, que mide compras registradas, no aperturas de la tarjeta. |

La personalización visual, los cumpleaños y los sellos digitales ya son habituales. Nuestra oportunidad propuesta es unir **ritmo individual + premio existente + motivo comprensible + segunda visita medible**. Es una hipótesis de diferenciación, no una afirmación de que ningún competidor pueda hacerlo ni una promesa de aumentar ventas.

## Implementado

### Radar de regreso

- Dueño: menú **Radar de regreso**. Administrador: informe del negocio → **Ver Radar de regreso**.
- Filtros: oportunidades, tardan en volver, con premio, cerca de un premio, primera compra pendiente y todos.
- Búsqueda por nombre con espera breve al escribir, paginación, estados de carga/vacío/error y botón de reintento.
- La ficha conserva el flujo existente para revisar historial y premios. Abrir el radar no envía mensajes, crea descuentos, libera reservas ni modifica balances.
- Los grupos pueden superponerse; sus cantidades no deben sumarse como clientes distintos.

### Segunda visita en 30 días

Se muestran seis meses. Cada cliente pertenece al mes de su primera compra registrada. Varias compras en el mismo día local, incluso en distintas sucursales, son una sola visita. Se cuenta una segunda visita en otro día, como máximo 30 días después de la primera. El denominador incluye solo clientes cuyo período completo ya terminó; los demás permanecen en observación. Se muestra el numerador y denominador junto al porcentaje. No se atribuye causalidad a campañas.

### Apple y Google juntas

En los detalles de la tarjeta aparece **Cómo acumular**, con el nombre y reglas de la promoción mostrada: unidad de acumulación, mínimo elegible, categoría, restricción de sucursales, días, horas, fechas y aviso de bonos. Antes de la primera compra puede usarse una promoción con premio visible. Las sucursales restringidas se indican como tales y se consultan en caja; no se publican direcciones privadas.

La versión de presentación pasa de 22 a 23. Conserva serial, QR, tokens, objetos/clases Google, registros del dispositivo y saldos. La actualización llega por la cola existente; su recepción debe comprobarse en iPhone y Android. No se prometen fuentes nativas personalizadas ni una lista bancaria de movimientos de Apple Pay.

## Cálculo y límites

- Ritmo: hasta nueve días distintos con compras en los últimos 365 días, en la zona horaria del negocio. Se exige al menos cuatro días de compra y siete días de historial.
- Se usa la mediana observada de los intervalos; con un número par de intervalos se elige la mediana inferior. La señal aparece desde `max(7, ceil(mediana × 1,5))` días sin comprar. Es una regla explícita, no un modelo entrenado ni una predicción de abandono.
- Cercanía: saldo disponible positivo, inferior al costo y de al menos el 80%, o un sello restante. Se evalúa cada promoción por separado. Solo promociones y premios activos; se comprueba el canje en caja.
- Las compras futuras no entran en actividad ni cohortes. Los informes dependen de los datos que se hayan registrado, no de toda la actividad externa del negocio.
- API privada para dueño/administrador, aislada por negocio, con SQL parametrizado y transacción `REPEATABLE READ, READ ONLY`. Cajeros y clientes no acceden al radar. No se envían estos segmentos a Apple o Google.
- No hay migración nueva. V001–V009, contabilidad y operaciones de canje permanecen intactas.

## Próximas prioridades, aún no implementadas en esta entrega

1. Campañas por segmento con consentimiento, vista previa de destinatarios, horario local, frecuencia máxima, exclusiones y cancelación. Medir entrega aceptada por cada proveedor sin confundirla con lectura; revisar las capacidades reales de cada Wallet.
2. Embudo de emisión → instalación confirmada → actualización, con origen del QR. Solo registrar señales que cada proveedor realmente exponga; no inventar aperturas ni ubicación física.
3. Referidos y niveles con reglas claras, idempotencia y reversión al devolver una compra. Requieren modelar esos casos antes de otorgar dinero o premios.
4. Experimentos con grupo de comparación y costo real de los premios. Sin margen o costo no debe mostrarse ROI ni beneficio neto como si estuvieran calculados.
5. Medir consultas del radar con volumen real y optimizar agregados si hace falta. Para operación continua, usar el asistente existente de HTTPS estable y un servidor disponible.

## Instalación y validación

Descargar `loyalty_mejorar_experiencia_v023.sh` en `~/Downloads` y ejecutar:

```bash
cd ~/Downloads
bash ./loyalty_mejorar_experiencia_v023.sh
```

El instalador aplica cambios acotados que toleran reformateo Kotlin/JavaScript y combina Python por estructura. Un cambio incompatible se detiene antes de escribir los archivos de la actualización. No compara el proyecto completo contra un hash antiguo ni sobrescribe certificados o `.env`.

Antes del commit local exige **169 pruebas generales + 187 PostgreSQL = 356**, todas las Python, Docker y gateway. Luego verifica HTTPS por separado. No hace push ni renueva un túnel de tarjetas instaladas automáticamente. El ZIP en Downloads contiene el script exacto, código antes/después, resultados, errores y registros redactados. Certificados, credenciales y pases quedan excluidos.

La validación en el entorno de desarrollo se registra aparte del resultado del Mac: compilar o probar una representación nativa no confirma instalación ni actualización física. No borrar la tarjeta para aplicar esta versión.

Documentación técnica de referencia: [campos de texto Google](https://developers.google.com/wallet/reference/rest/v1/TextModuleData), [objeto de fidelidad Google](https://developers.google.com/wallet/reference/rest/v1/loyaltyobject), [formato de pases Apple](https://developer.apple.com/documentation/walletpasses/pass).

# Ejemplos según el tipo de negocio — v026

En Administrador → Nuevo negocio, el campo **Tipo de negocio** es obligatorio. La actividad fiscal se mantiene aparte. En un negocio existente, Administrador → Datos del negocio permite asignar/corregir el tipo con motivo y revisión vigente. El dueño puede solicitar la corrección, sin cambiar ese dato por su cuenta.

En Promociones → Nueva promoción aparecen cuatro ejemplos del tipo elegido. Cada ejemplo completa un borrador; el dueño puede ajustar unidades, compras, puntos, porcentaje, meta y premio antes de revisar y crear. También puede comenzar desde cero con cualquiera de las cuatro mecánicas. No se crean promociones automáticamente.

Si ya había una actividad clara, se usa solo para sugerir ejemplos: «Cafetería» muestra café. Actividades ambiguas como «Cafetería y pizzería» conservan sugerencias generales hasta elegir una categoría. No se modifican perfiles al consultarlos.

Cambiar de categoría no reescribe promociones existentes, saldos o tarjetas. Las promociones nuevas funcionan con el flujo normal de Apple Wallet y Google Wallet. Los ejemplos de puntos y cashback ofrecen un premio de entrega en caja; la revisión explica que no aplican descuentos automáticos.

## Repertorio

Cada tipo incluye los dos ejemplos específicos indicados, más puntos y cashback con un premio adecuado al negocio. Son ejemplos ajustables, no reglas obligatorias.

| Grupo | Tipo | Ejemplo 1 | Ejemplo 2 |
|---|---|---|---|
| Comida y bebidas | Cafetería | Sexto café gratis | Quinto café al 50% |
| Comida y bebidas | Pizzería | Sexta pizza gratis | Tercera pizza al 20% |
| Comida y bebidas | Restaurante | Sexto postre gratis | Cuarta compra de platos al 15% |
| Comida y bebidas | Panadería | Sexta pieza de bollería gratis | Cuarta compra de pan al 15% |
| Comida y bebidas | Pastelería | Sexta porción gratis | Tercera compra de galletas al 20% |
| Comida y bebidas | Heladería | Sexto helado gratis | Cuarto helado al 50% |
| Comida y bebidas | Hamburguesería | Sexta hamburguesa gratis | Cuarta hamburguesa al 25% |
| Comida y bebidas | Comida rápida | Séptimo combo gratis | Tercer combo al 20% |
| Comida y bebidas | Jugos y bebidas | Sexto jugo gratis | Cuarto batido al 50% |
| Belleza y cuidado | Barbería | Octavo corte gratis | Cuarto arreglo de barba al 25% |
| Belleza y cuidado | Peluquería | Octavo corte de cabello gratis | Cuarto peinado al 30% |
| Belleza y cuidado | Salón de belleza | Sexto peinado al 50% | Tercera compra de belleza al 20% |
| Belleza y cuidado | Manicure y uñas | Sexto manicure gratis | Cuarto pedicure al 30% |
| Belleza y cuidado | Spa y bienestar | Quinta sesión de bienestar al 25% | Tercera compra de cuidado al 20% |
| Moda y compras | Cosméticos y perfumería | Tercera compra de maquillaje al 15% | Quinta compra de cuidado al 25% |
| Moda y compras | Ropa y boutique | Segunda compra de ropa al 20% | Quinta prenda al 30% |
| Moda y compras | Calzado | Segunda compra de calzado al 15% | Cuarto par al 25% |
| Moda y compras | Accesorios | Sexto accesorio al 50% | Tercera compra de bisutería al 20% |
| Moda y compras | Joyería y relojería | Segunda compra de accesorios al 10% | Cuarta compra de relojes al 15% |
| Moda y compras | Óptica | Segunda compra de gafas al 15% | Tercera compra de monturas al 20% |
| Tecnología | Electrónica y audio | Tercera compra de accesorios al 15% | Segunda compra de audio al 10% |
| Tecnología | Telefonía | Segunda funda al 20% | Tercera compra de accesorios al 15% |
| Tecnología | Computación | Segunda compra de periféricos al 10% | Cuarta compra de accesorios al 20% |
| Tecnología | Electrodomésticos | Segunda compra de electrodomésticos al 5% | Tercer pequeño electrodoméstico al 10% |
| Moda y compras | Hogar y decoración | Tercera compra de decoración al 15% | Quinto textil al 25% |
| Mascotas | Tienda de mascotas | Sexto juguete de mascota al 50% | Cuarta compra de alimento al 10% |
| Mascotas | Peluquería de mascotas | Sexto baño de mascota gratis | Cuarto corte de mascota al 25% |
| Vehículos | Taller mecánico | Tercer mantenimiento al 10% | Cuarta compra de repuestos al 15% |
| Vehículos | Lubricadora y aceites | Quinto cambio de aceite al 20% | Tercera compra de filtros al 15% |
| Vehículos | Llantas | Segunda compra de llantas al 5% | Cuarto balanceo al 50% |
| Vehículos | Lavado de vehículos | Sexto lavado de auto gratis | Cuarta limpieza interior al 25% |
| Vehículos | Gasolinera | Tercera compra en tienda al 10% | Cuarta compra de lubricantes al 15% |
| Comercio diario | Ferretería | Tercera compra de herramientas al 10% | Quinta compra de pinturas al 15% |
| Comercio diario | Supermercado y minimarket | Quinta compra de abarrotes al 5% | Cuarta compra de limpieza al 10% |
| Comercio diario | Papelería | Sexto cuaderno al 50% | Tercera compra de útiles al 15% |
| Comercio diario | Librería | Quinto libro al 20% | Tercera compra de lectura infantil al 15% |
| Comercio diario | Floristería | Quinto ramo al 50% | Tercera compra de plantas al 20% |
| Comercio diario | Regalos | Quinto regalo al 20% | Tercera compra de detalles al 15% |
| Servicios | Lavandería | Sexto planchado gratis | Cuarto lavado de edredón al 25% |
| Servicios | Gimnasio y entrenamiento | Octava clase gratis | Cuarta compra de accesorios al 20% |
| Servicios | Hotel y alojamiento | Cuarta compra de alojamiento al 10% | Sexto desayuno gratis |
| Otros | Otro tipo de negocio | Sexto producto elegible al 50% | Tercera compra de servicios al 10% |

## Validación de la entrega

El .sh conserva el código antes y después y solo realiza el auto commit tras aprobar las 388 pruebas Kotlin/HTTP/PostgreSQL, Python, Docker y gateway. La fase HTTPS se informa aparte; no renueva automáticamente una URL de prueba con tarjetas instaladas. El ZIP de Downloads incluye el script exacto y evidencia redactada; excluye credenciales y certificados.

El catálogo se mantiene en src/main/resources/business-categories.json y se valida con las reglas de dominio. La nueva suite de interfaz usa únicamente datos ficticios y red interceptada. PostgreSQL embebido no valida la concurrencia real; el gate del Mac sigue usando PostgreSQL nativo.

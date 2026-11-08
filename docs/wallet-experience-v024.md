# Wallet v024: estilos por negocio y progreso comprensible

Esta entrega parte del ZIP v023 aprobado. Apple y Google reciben la misma mejora de contenido y dibujos, adaptada a sus campos nativos. El panel conserva Navy como color principal; cada negocio elige su propia tarjeta.

## Qué cambia

- 32 estilos editables con búsqueda por nombre, categoría y términos habituales. Por ejemplo, «electrodomésticos» encuentra Electrónica y «zapatos» encuentra Calzado. Ocho estilos visibles inicialmente; el dueño puede desplegar todos.
- 33 símbolos dibujados por el servidor. Los estilos usan esos mismos dibujos en sus miniaturas; no dependen de una fuente emoji instalada en Docker.
- Seleccionar un estilo cambia solo fondo, texto, etiquetas, símbolo y acabado. Conserva nombre, logo, promoción destacada, bienvenida e instrucciones. El dueño revisa ambas vistas y pulsa Guardar diseño para publicar.
- Avance exacto en texto nativo: «4 de 5 sellos», «30 de 50 puntos» o «2.50 de 5.00 USD», más el saldo restante y el premio. Los porcentajes describen la ilustración, no sustituyen el saldo.
- Sellos completados con marca de verificación, siguiente casilla destacada y casillas pendientes. Barra dividida en diez tramos, marcador de avance y símbolo de premio al final para puntos, cashback y metas de más de veinte sellos.
- Meta alcanzada conserva cualquier saldo excedente. El canje sigue requiriendo confirmación en caja.
- Un cliente sin compras ve el avance desde cero de una promoción activa. Esta presentación no crea filas de saldo, compras ni premios. Al pausar o eliminar la promoción desaparece el progreso; no se recuperan promociones retiradas desde el historial.
- Vista previa con cinco estados ficticios: nueva, a mitad, cerca del premio, con premio y pausada. Incluye explicación de acumulado y pendiente.

## Catálogo

| Categoría | Estilos |
| --- | --- |
| General | Navy |
| Comida y bebidas | Café, Pizzería, Restaurante, Hamburguesería, Panadería, Pastelería, Heladería, Supermercado |
| Moda y compras | Boutique, Florería, Librería y papelería, Regalos, Calzado, Joyería |
| Belleza y bienestar | Barbería, Gimnasio, Clínica dental, Spa y bienestar, Óptica, Salón de belleza |
| Autos y servicios | Taller automotriz, Llantas y lubricantes, Lavandería, Hotel y alojamiento, Estación de servicio |
| Hogar y tecnología | Telefonía, Electrónica, Música y audio, Hogar y muebles, Ferretería |
| Mascotas | Veterinaria y mascotas |

Los estilos no crean promociones ni fijan cantidades, descuentos o premios. Las reglas continúan siendo editables y propias de cada negocio.

## Presentación nativa

Apple conserva los campos de saldo y aviso de cambio, usa el strip para los dibujos y añade una lectura exacta de progreso. Mantiene como máximo cuatro campos secundarios y auxiliares combinados. Los detalles contienen el texto completo, condiciones e historial. La fuente y el acomodo final dependen de Wallet y del dispositivo.

Google conserva loyaltyPoints y secondaryLoyaltyPoints; su clase organiza saldo/restante, progreso y premio en tres filas. Los valores personales permanecen en el objeto de cada cliente. El uso de la tarjeta se integra en el módulo de estado para mantener el máximo de diez módulos y conservar historial, condiciones y novedades. No se simulan las transacciones de una tarjeta bancaria.

Las imágenes no contienen texto, identificadores de clientes, cédulas, QR ni tokens. El QR sigue siendo nativo. El degradado corresponde a la ilustración; no implica un fondo degradado en toda la tarjeta. La tipografía nativa de Apple y Google no se reemplaza.

## Compatibilidad y pruebas

presentationVersion=24 actualiza ambas plataformas mediante sus mecanismos existentes, sin cambiar serial, QR, tokens, saldos, Google Object/Class ni registros Apple. Se prueban entradas históricas 8, 17, 20, 22 y 23. Las rutas /wallet/art/v20 y /v22 conservan su dibujo original y sus diez símbolos; /v24 admite los 33 símbolos. V001–V009 permanecen idénticas.

Validación realizada en el entorno de preparación:

- 178 pruebas Kotlin/HTTP, incluidas nueve nuevas sobre progreso, representación de cero, límites nativos, símbolos y aislamiento de promociones.
- Cinco casos de integración específicos mediante PostgreSQL embebido y JDBC: actualización desde versiones anteriores, primera compra, pausa/reactivación sin compras, pausa y eliminación con saldo. No sustituyen concurrencia ni PostgreSQL nativo.
- 124 pruebas Python del instalador y diez suites de interfaz con red interceptada y clientes ficticios. Revisión visual en escritorio y pantallas de 390/320 px.
- Pruebas del paquete: aplicación sobre v023, ejecución repetida, reformateo y reordenación de imports, conflictos antes de escribir y exclusión de credenciales en el ZIP.

Al ejecutar el .sh en el Mac, el gate exige 178 generales + 189 PostgreSQL = 367 pruebas, todas las Python, Docker local y 43 comprobaciones del gateway antes del auto commit local. HTTPS se verifica después. No hace push ni renueva automáticamente el túnel. La recepción real del diseño en iPhone y Android permanece pendiente hasta comprobar ambos teléfonos.

## Revisión en el negocio

1. Ejecutar el .sh desde Downloads y compartir el ZIP que genere si alguna etapa falla.
2. Panel del dueño → Diseño de la tarjeta. Buscar el negocio, seleccionar un estilo, revisar el avance de una promoción real en ambos proveedores y guardar.
3. Abrir la misma tarjeta instalada en iPhone y Android. Comprobar saldo, meta, pendiente, premio, historial y QR. No borrar ni volver a registrar al cliente.
4. Si el resultado pide actualizar la conexión por una dirección HTTPS antigua, usar la recuperación de la misma tarjeta desde Caja o la ficha del cliente. Esta entrega no cambia por sí sola la dirección del túnel.

## Referencias de diseño

Consultadas el 8 de noviembre de 2026:

- [Apple: Wallet, Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/wallet). Uso de campos nativos para texto y de imágenes para contenido visual, contraste, tarjetas de tienda y tamaños compatibles.
- [Google: personalización de pases](https://developers.google.com/wallet/tickets/boarding-passes/use-cases/pass-customization), referencia compartida por el usuario.
- [Google: personalización de tarjetas de fidelización](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/pass-customization), aplicada a LoyaltyClass/LoyaltyObject y a sus referencias de campos.

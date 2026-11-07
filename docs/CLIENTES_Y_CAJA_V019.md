# Loyalty v019 · Conocer al cliente y atenderlo

Esta entrega continúa v018 (Navy, RUC, búsqueda y ficha del negocio). Añade una ficha privada del cliente que se abre a la derecha, sin perder filtros, y ocupa la pantalla en móvil. No cambia las tarjetas nativas ni sus conexiones.

## Uso diario

1. En **Mis clientes**, escribe dos letras para ver sugerencias. Usa clic o flechas y Enter para abrir una ficha; también puedes aplicar la búsqueda al listado. Los últimos seis caracteres de la tarjeta ayudan a distinguir nombres iguales.
2. Ordena por compra reciente, gasto, cantidad de compras, nombre o registro reciente. Los grupos **A un sello**, **Con premio**, **Han vuelto**, **Sin volver** y **Sin compras** siguen disponibles.
3. Abre un cliente: verás total pagado, compras, premios reclamados, frecuencia media y progreso hacia sus premios activos.
4. En **Historial de movimientos**, filtra compras/canjes y sucursal. Se muestran 20 movimientos por página. Abre una compra para ver comprobante, productos, descuento y total pagado. Un canje aplicado a una compra figura también como premio reclamado; no se suma dos veces al gasto.
5. **Atender en Caja** busca la tarjeta de ese cliente. El personal todavía debe verificar la identidad y confirmar cada operación. Abrir una ficha o elegir un resultado no consume un premio.
6. **Cerrar** o Escape vuelve al listado con los filtros y el foco conservados. Durante el guardado de preferencias, espera a que termine para cerrar o pasar a Caja.
7. En **Resumen**, toca el número de clientes a un sello, con premio o sin volver en 30 días para abrir ese grupo. Los clientes recientes permiten abrir su ficha.

## Qué significan los datos

- La ficha muestra todo el historial; el resumen de Mis clientes mantiene el período de 7, 30 o 90 días. Filtrar movimientos no recalcula los totales de la ficha.
- Frecuencia media es el tiempo entre primera y última compra dividido entre los intervalos de compras. No predice el regreso ni es una tasa de retención.
- Los premios de una misma promoción son alternativas. Caja vuelve a comprobar el saldo disponible y las condiciones; abrir la ficha no libera reservas vencidas.
- Una promoción pausada/eliminada desaparece del progreso actual. Sus compras y canjes confirmados permanecen en el historial.
- Los nuevos datos y rutas son privados del dueño autenticado. No se exponen al cliente, a otros negocios ni a cajeros.

## Instalar después de v018

```bash
cd ~/Downloads
bash loyalty_clientes_y_caja_v019.sh
```

El script modifica el proyecto `/Users/ldgomm/Developer/pdc/sales/loyalty`. Admite `--project` para una copia distinta y `--check-only` para revisar compatibilidad sin aplicar cambios ni crear commit.

Comprueba 297 pruebas Kotlin/HTTP/PostgreSQL (137 generales y 160 de PostgreSQL), Python, Docker y gateway antes de crear el commit local, sin push. HTTPS se comprueba después y se informa por separado; renovar un túnel temporal sigue siendo explícito mediante `--renew-test-url`. No se renuevan identidades de tarjetas automáticamente.

El ZIP de Downloads incluye el mismo `.sh`, código anterior/aplicado/probado y resultados/logs redactados. Excluye `.env`, claves, certificados y otros archivos privados. Los parches semánticos toleran formato e imports reordenados; un cambio incompatible de lógica detiene el preflight antes de escribir parcialmente.

## Verificación de interfaz aislada

Desde `scripts/ui`, usando la instalación existente de Playwright:

```bash
node customer-workspace.spec.cjs
node navy-workspace.spec.cjs
node counter-rewards.spec.cjs
node apple-wallet.spec.cjs
node wallet-save.spec.cjs
```

Estas pruebas interceptan la red con datos ficticios y no hacen compras ni envían avisos reales. La entrega no cambia `presentationVersion` de Apple/Google. Un PASS local no acredita recepción de actualizaciones en un iPhone o Android: esa comprobación continúa en los dispositivos.

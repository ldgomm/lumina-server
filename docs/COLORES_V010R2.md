# Colores de la tarjeta: v010r2

Desde Downloads:

```bash
bash loyalty_colores_v010r2.sh
```

Después de que termine, recargar el panel y entrar como dueño a **Mi tarjeta**.

- Al elegir un fondo, el ajuste automático cambia a blanco o negro únicamente los textos que dejan de leerse. Conserva el fondo elegido y cualquier color de texto o etiqueta que ya sea válido.
- Cada selector indica si el texto o las etiquetas se distinguen. **Corregir colores** resuelve los campos indicados con un clic.
- Se puede desactivar **Ajustar texto y etiquetas al cambiar el fondo** para elegir toda la combinación manualmente.
- La vista previa muestra inmediatamente los colores, el nombre, el logo y los símbolos de los sellos. Sus datos son de ejemplo; Apple y Google controlan la distribución final de sus tarjetas.
- **Guardar diseño** se habilita cuando los colores son válidos y el logo terminó de procesarse. Si está desactivado, el formulario explica qué hay que corregir. Los errores del servidor permanecen junto al formulario y conservan el borrador.
- Los cambios se envían a las tarjetas existentes al guardar. No se crea una nueva tarjeta ni se cambia el QR, el serial o el saldo.

El servidor mantiene los mínimos de contraste existentes: 4,5 para el texto y 3 para las etiquetas. El navegador usa el mismo cálculo, sin redondear para decidir si permite guardar. El mensaje del servidor ahora identifica los campos afectados y sugiere blanco o negro para el fondo seleccionado.

Referencia del cálculo de luminancia y contraste: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html. Estos mínimos existentes no equivalen a una certificación de accesibilidad de toda la aplicación.

El instalador conserva los datos y la configuración privada. Ejecuta las 174 pruebas Kotlin/HTTP/PostgreSQL, las 90 pruebas Python, Docker local y el gateway antes del commit local automático. Comprueba HTTPS por separado y guarda el ZIP con registros, pruebas, código y el mismo instalador en Downloads. La apariencia en el teléfono se verifica manualmente.

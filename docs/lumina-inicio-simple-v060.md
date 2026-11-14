# Lúmina v021 / Loyalty v060 — identificación e inicio simple

Actualización local para el resultado confirmado de v020, commit `8fc7f4e66cefc6c382bd36e6d9bfa2c777a098c9`.

## Registro y acceso

- Agencia, dueño y colaboradores usan cédula y contraseña. El dueño también puede entrar con el RUC de su negocio y la misma contraseña.
- El negocio registra RUC, categoría y WhatsApp. Las cuentas nuevas no requieren correo. Los celulares ecuatorianos se guardan con +593.
- Cédula: diez dígitos, prefijo territorial admitido y dígito verificador. Conserva ceros iniciales y admite las excepciones de tercer dígito documentadas por Gob.EC.
- RUC: trece dígitos, terminación 001 y exclusión de una identidad compuesta solo de ceros. No aplica un supuesto dígito verificador a sociedades, entidades públicas o extranjeros. La administración dispone de un enlace a la consulta oficial del SRI.
- Cédulas y RUC ya registrados no crean otra cuenta o negocio. La comprobación se realiza dentro de la transacción. También se conserva la comprobación de la huella del registro anterior cuando coinciden nombre y cédula.
- Los formularios muestran errores junto al campo; el servidor vuelve a validar aunque se omita JavaScript.

Estas comprobaciones detectan errores de escritura. **No acreditan identidad, titularidad, existencia, estado tributario ni que el teléfono tenga WhatsApp.** No se envían documentos a un servicio externo. La consulta oficial es independiente.

## Bienvenida y servicios

El negocio ve una sola bienvenida: Contenido, Wallet, Google Maps, Web, Diseño de marca o Explorar primero. Ningún servicio queda seleccionado por defecto. Puede activar los demás después, desde **Mis servicios**.

El colaborador ve una bienvenida con las tareas asignadas y los servicios que el dueño haya activado. Conserva su rol y no puede activar módulos ni contratar por cuenta del negocio.

Crear la cuenta, explorar, consultar paquetes o revisar cargos no activa Wallet. Elegir Wallet inicia su configuración; solo el dueño confirma las condiciones comerciales antes de operar. Se mantienen USD 4,99 mensuales o USD 50 anuales por sucursal y la promoción fija hasta el 31-12-2026. Un paquete vigente que ya incluya Wallet evita una segunda contratación. No existe un débito bancario implícito.

Contenido conserva el video de cortesía sin elegir redes. Las redes se registran al publicar y medir resultados. Los demás trabajos se cotizan o consumen el paquete contratado; activar el módulo no crea un pedido ni promete trabajo gratuito.

La administración puede registrar cargos y pagos de contenido, web u otros servicios aunque Wallet esté inactiva. Un primer cargo explícito puede preparar la cuenta interna de facturación, sin habilitar el módulo Wallet, emitir tarjetas o crear una suscripción.

## Cuentas existentes y continuidad

Los servicios y asociaciones anteriores permanecen disponibles. La migración no inventa cédulas o RUC que antes no estaban guardados. Las personas con acceso anterior usan **Tengo una cuenta anterior**, prueban su contraseña y completan su identificación una vez. Después acceden con cédula; el correo anterior ya no sirve para iniciar sesión en esa cuenta. Una sesión previa válida permite hacer el mismo cambio en Mi cuenta.

La actualización conserva identificadores de cuentas y negocios, contraseña, asociación nativa, seriales, objetos Google, registros de dispositivos, claves, dominios, diseños, promociones y saldos. No modifica los acuerdos comerciales anteriores ni la representación 34 de los pases. No vuelve a sortear diseños existentes.

SQLite recibe únicamente la migración aditiva `009_identity_services.sql`. PostgreSQL V001–V016 y todos los SQL anteriores permanecen intactos. El servidor de producción sigue rechazando esquemas o sellos incompatibles; este instalador no los migra. Véase `docs/production/transicion-v060.md`.

## Instalación local

Abre Docker Desktop y detén la Terminal anterior de Lúmina con Control+C. Ejecuta:

```bash
bash ~/Downloads/lumina_digital_inicio_simple_v021.sh --iniciar
```

Para comprobar compatibilidad sin instalar:

```bash
bash ~/Downloads/lumina_digital_inicio_simple_v021.sh --comprobar
```

El instalador comprueba compatibilidad y el portal antes de escribir. Rechaza cambios incompatibles, conserva la configuración privada y ejecuta los gates completos antes del commit local. No hace push ni despliega. Imprime una línea `RESULTADO=...` y, solo después de comprobar el arranque, `Lúmina Digital disponible en http://127.0.0.1:8099` o el puerto configurado.

## Verificación

- 25 suites / 272 pruebas del portal HTTP y reglas de dominio.
- 170 pruebas Python.
- 309 pruebas nativas de unidad/HTTP y 341 con PostgreSQL real: 650 en total; compilación e instalación de la distribución.
- 18 suites DOM de formularios e interacción. No equivalen a una comprobación visual de navegador.
- El Mac debe ejecutar Docker local y las 116 comprobaciones de gateway antes del commit. No se declara ese resultado antes de ejecutar el instalador allí.
- La continuidad física de una tarjeta instalada en Apple/Google y la revisión visual en navegador siguen siendo pruebas separadas y pendientes. No se promete disponibilidad absoluta por una prueba de servidor.

## Referencias de identificación

- INEC, reglas de consistencia de cédula: https://anda.inec.gob.ec/anda/index.php/catalog/552/download/8237
- Gob.EC, excepciones reportadas para validadores: https://gitlab.gobiernoelectronico.gob.ec/mintel/ge/rutr/gobec/-/issues/597
- SRI, Reglamento de la Ley del Registro Único de Contribuyentes: https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/cc9751bf-9123-4219-bf2c-79daba57116a/Reglamento_Ley_RUC_ultmodificacion_09022024.pdf
- Consulta oficial: https://srienlinea.sri.gob.ec/facturacion-internet/consultas/publico/ruc-datos1.jspa

La siguiente candidata de producción debe construirse desde el commit validado de esta actualización. No reutilizar el paquete v055.

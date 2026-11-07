# Loyalty v018 · Navy, búsqueda y negocios

La aplicación usa Navy `#0B1F3A`, superficies claras y acciones principales consistentes. La navegación del negocio conserva las secciones por tarea y añade un buscador de secciones que respeta el rol. El diseño se adapta a escritorio y móvil. El color de las tarjetas y vistas previas Apple/Google sigue siendo el elegido por cada negocio.

## Uso

1. Administrador: abre `/platform` → **Añadir negocio**. Completa **Negocio**, **Contacto** y **Revisión**. Antes de crear se muestra el resumen y la primera sucursal; el enlace se propone desde el nombre comercial y es editable.
2. El formulario solicita nombre comercial, razón social, RUC, actividad, contacto, teléfono, correo, provincia, ciudad y dirección. La web es opcional. Conserva lo escrito al volver a un paso anterior.
3. Negocios anteriores: abre **Administrar → Datos del negocio**. El dueño encuentra la misma ficha en **Mi negocio**. Se puede completar sin cambiar clientes, saldos o tarjetas.
4. Busca negocios por nombre, razón social o RUC. Las sugerencias aparecen al escribir dos caracteres. Elige con un clic o con flechas y Enter; Escape las cierra. Enter sin seleccionar conserva la búsqueda normal.
5. En **Caja**, elige **Nombre · sugerencias** para encontrar clientes por nombre. Para nombres iguales se muestran los últimos seis caracteres del código de tarjeta. Elegir abre su ficha; compras y canjes mantienen sus comprobaciones y confirmaciones.

## RUC y privacidad

Se comprueba el formato de 13 dígitos, no la existencia, vigencia, checksum o situación tributaria del RUC. La respuesta mantiene `rucVerification: NOT_VERIFIED`. Referencia de formato: [instructivo de consulta del SRI](https://srienlinea.sri.gob.ec/facturacion-internet/consultas/publico/ruc_instructivo.jsp). No se consulta el SRI ni se presenta la ficha como verificada. Razón social y nombre comercial se guardan por separado.

Una entidad puede operar varias marcas; el RUC no se impone como único entre negocios. La búsqueda de clientes está limitada al negocio autenticado; no devuelve cédulas ni hashes de identidad. Los datos fiscales/de contacto solo están disponibles para el dueño y la plataforma, no para los cajeros o clientes ni en las tarjetas Wallet.

## Compatibilidad y control

- V008 añade `business_profiles`. V001–V007 se conservan. Crear perfil, negocio, primera sucursal y credencial del dueño es una transacción.
- El nuevo formulario usa `POST /api/platform/businesses`, que exige perfil y sucursal. La ruta anterior `POST /api/platform/tenants` mantiene compatibilidad; los negocios previos no se bloquean por tener una ficha incompleta.
- Las ediciones envían `expectedVersion`. Dos ediciones simultáneas no se sobrescriben. Un conflicto conserva el formulario y ofrece recargar los datos guardados.
- Sugerencias: máximo ocho resultados, demora de 280 ms, tildes normalizadas, caracteres `%` y `_` literales. Se descartan respuestas de consultas antiguas, sesiones cambiadas o pantallas cerradas.
- Apple y Google conservan sus configuraciones e identidades. Esta entrega cambia el panel y sus datos privados; no requiere renovar las tarjetas por el diseño Navy.

## Instalación y evidencia

Desde Downloads:

```bash
cd ~/Downloads
bash loyalty_interfaz_navy_v018.sh
```

El instalador exige 282 pruebas Kotlin/HTTP/PostgreSQL (133 generales y 149 PostgreSQL), las pruebas Python y Docker/gateway antes del commit local. HTTPS se comprueba después y su resultado se informa por separado. El ZIP de Downloads contiene el script exacto, código anterior/aplicado/probado, registros y resultado redactados. No hay push ni inclusión de certificados, credenciales privadas o `.env`.

Los parches Kotlin/JavaScript comparan tokens, admitiendo espacios, reformateo y orden de imports. Un conflicto real de lógica detiene el preflight antes de aplicar parcialmente. `--check-only` genera un ZIP de diagnóstico sin modificar código ni crear commit. Si el túnel temporal anterior ya no existe, su recuperación sigue siendo explícita mediante `--renew-test-url`; no se marca una conexión de tarjeta como reparada solo por aprobar HTTPS.

## Pruebas de interfaz aisladas

La nueva prueba y las tres regresiones interceptan todas las solicitudes; usan datos ficticios, no un servidor real ni proveedores Wallet. No añaden dependencias al servidor Kotlin:

```bash
cd scripts/ui
npm ci
npx playwright install chromium
node navy-workspace.spec.cjs
node apple-wallet.spec.cjs
node wallet-save.spec.cjs
node counter-rewards.spec.cjs
```

La prueba `experience.spec.cjs` existente requiere un servidor aislado propio; no usarla sobre negocios reales. Una prueba de servidor o navegador simulado no demuestra una actualización recibida en un iPhone o Android.

# Portal Lúmina Digital

El código se encuentra en `src/main/resources/com/premierdarkcoffee/loyalty/lumina`, organizado por módulos. Esta carpeta conserva únicamente los comandos de entrada compatibles.

Desde la raíz del proyecto:

```sh
node lumina-agency/src/server.mjs
npm --prefix lumina-agency test
```

Node 24.2 o posterior. Portal: http://127.0.0.1:8099. Loyalty privado: http://127.0.0.1:8097.

Los datos y la clave conservan su ubicación en ~/.lumina-digital/agency. Las variables LUMINA_DATA_DIR, LUMINA_PORT, LUMINA_LOYALTY_URL y LUMINA_ORIGIN continúan funcionando. El primer administrador se configura una vez; después, /configurar queda cerrado.

Wallet está en /wallet. Usa la credencial actual de Loyalty para abrir la administración o el negocio. Las credenciales de acceso permanecen en memoria solo durante tu sesión. Esto no modifica las tarjetas de Apple o Google.

Consulta docs/arquitectura-modular.md para el mapa del proyecto y sus límites.

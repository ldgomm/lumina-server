# Portal Lúmina Digital

El código se encuentra en `src/main/resources/com/premierdarkcoffee/loyalty/lumina`, organizado por módulos. Esta carpeta conserva únicamente los comandos de entrada compatibles.

Desde la raíz del proyecto:

```sh
node lumina-agency/src/server.mjs
npm --prefix lumina-agency test
```

Node 24.2 o posterior. Portal: http://127.0.0.1:8099. Loyalty privado: http://127.0.0.1:8097.

Los datos y la clave conservan su ubicación en ~/.lumina-digital/agency. Las variables LUMINA_DATA_DIR, LUMINA_PORT, LUMINA_LOYALTY_URL y LUMINA_ORIGIN continúan funcionando. El primer administrador se configura una vez; después, /configurar queda cerrado.

Wallet está en /wallet y usa la sesión de Lúmina y los permisos asignados. El backend conserva la asociación del negocio y sus accesos internos cifrados; el usuario no vuelve a introducir credenciales. Esto no modifica las tarjetas de Apple o Google.

Las solicitudes y la cortesía no eligen redes sociales. La plataforma se registra junto con la publicación y sus métricas. Consulta docs/lumina-solicitudes-sin-red-v043.md.

Consulta docs/arquitectura-modular.md para el mapa del proyecto y sus límites.

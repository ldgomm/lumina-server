# Lúmina v005r1 / Loyalty v044r1

La actualización de Wallet automática v005 se detuvo porque seis pruebas heredadas esperaban 13 migraciones y la nueva V014 eleva el total a 14. Las seis devolvieron `expected: <13> but was: <14>`; no hubo errores de inicialización PostgreSQL.

El informe del 11 de noviembre de 2026 confirma 280/280 pruebas unitarias y 294/300 PostgreSQL aprobadas; las seis nuevas de registro Lúmina también pasaron. El instalador restauró el código anterior y no intentó crear un commit. Docker de aplicación y gateway no alcanzaron su validación final.

## Corrección

Se cambia el total esperado de migraciones a 14 en ManagementPostgresTest, OperationsPostgresTest, CommercialPostgresTest, PromotionLifecyclePostgresTest, EngagementPostgresTest y WalletFirstPostgresTest. La consulta que devuelve Long usa 14L. Permanecen todas las comprobaciones de datos, credenciales, permisos, compras, promociones y repetición de migraciones.

No se altera el código de producción ni SQL de v044. No se borran datos, modifican claves, renuevan túneles ni cambian identidades de tarjetas.

## Ejecución

La entrega es acumulativa: vuelve a aplicar Wallet automática junto con la corrección, incluso después de la restauración del código. Conserva conflictos ajenos y acepta las versiones reconocidas de v042r1/v043/v044.

Con Docker abierto y Lúmina detenida mediante Control+C, ejecutar desde Downloads:

```bash
bash lumina_digital_wallet_automatica_v005r1.sh --iniciar
```

El instalador repite el gate completo: 280 unitarias/HTTP, 300 PostgreSQL, 43 portal, 128 Python, Docker y gateway. Solo crea el commit local si todo pasa; no hace push. HTTPS y la recepción de tarjetas en teléfonos conservan su estado independiente. El nuevo resultado de PostgreSQL se confirma únicamente después de ejecutar la revisión en el Mac.

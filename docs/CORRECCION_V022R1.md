# Corrección v022r1

El resultado v022 fue `POSTGRES_FAILED_NO_COMMIT`: 160 pruebas generales aprobaron; PostgreSQL ejecutó 176, con 175 aprobadas y una fallida. La base de pruebas arrancó correctamente.

La prueba `pause hides customer balances rewards and signup then resume restores earned balance` en `PromotionLifecyclePostgresTest` aún esperaba `presentationVersion=20`; la presentación v022 usa correctamente `22`. Esta revisión cambia esa expectativa a 22 y conserva todas las comprobaciones posteriores de pausa y reactivación. La prueba de actualización histórica `WalletPostgresTest` ya esperaba 22 y aprobó en el ZIP recibido.

Se revisaron todas las referencias de `presentationVersion` en el código y las pruebas. El código de producción, las migraciones y los diseños Apple/Google permanecen idénticos a la entrega v022.

Desde Downloads, ejecutar:

```bash
bash loyalty_corregir_postgres_v022r1.sh --https
```

El script aplica la corrección respetando el formato de IntelliJ y vuelve a ejecutar las 336 pruebas, Python, Docker y gateway. Solo crea el commit local si pasan esas validaciones. Después verifica HTTPS y genera el ZIP completo en Downloads, incluido el mismo script. No renueva silenciosamente una URL con tarjetas instaladas. La recepción en iPhone/Android continúa requiriendo comprobación real.

La preparación local compila las pruebas PostgreSQL; su ejecución completa y Docker se verifican en el Mac del usuario.

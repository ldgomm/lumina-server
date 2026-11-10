# Lúmina Digital · Portal de agencia v001

Portal local de marketing integrado con la Caja de Loyalty v040. Los dueños registran el negocio, solicitan servicios, consultan entregas y crean accesos individuales. La agencia coordina producción, agenda, cotizaciones, planes y resultados.

## Inicio local

Requiere Node.js 24.2 o superior. El instalador comprueba la estructura de Loyalty v040 y ejecuta las pruebas del portal con datos ficticios.

```bash
bash ~/Downloads/lumina_digital_agencia_v001.sh --iniciar
```

Abre la URL que imprime la terminal, normalmente `http://127.0.0.1:8099`. En el primer inicio, entra en **Configurar la agencia** y usa el código de un solo uso de la terminal. Para futuros arranques puedes ejecutar `node lumina-agency/src/server.mjs` desde la raíz del proyecto.

1. Crea la cuenta de agencia y registra un negocio desde otra sesión.
2. En **Clientes**, abre la ficha del negocio y verifica al responsable. El registro muestra la bienvenida con un video gratis. La solicitud de cortesía es única por negocio registrado y se gestiona fuera de los cupos pagados.
3. Publica una oferta mensual o individual en **Planes**. Fija precio y cupos, o deja el valor a medida y envía la cotización. El dueño acepta la cotización en la ficha. La agencia activa el período comercial y asigna sus cupos al crear piezas.
4. En **Solicitudes**, aprueba el trabajo y programa la visita. Añade entregables, hora real de grabación, observaciones y enlaces HTTPS a las evidencias. El cliente puede aprobar la entrega o pedir ajustes.
5. Registra las publicaciones y sus mediciones. **Métricas** compara cortes de la misma publicación y muestra cuántas publicaciones aportan cada indicador. **Google Maps** guarda reseñas, borradores de respuesta y cortes por ubicación.

El precio se guarda en centavos de USD. Las fechas operativas se muestran en hora de Ecuador continental. Las condiciones de un plan publicado se conservan en los períodos que lo utilizan. Para cambiar una oferta, retírala y publica la nueva. Los períodos mensuales se activan de forma explícita. Los cupos de una pieza se reservan al asignarla y pasan a utilizados al entregarla.

## Una persona y varios permisos

| Acceso | Quién lo asigna | Alcance |
| --- | --- | --- |
| Agencia | Configuración inicial local | Cartera de negocios, producción, ofertas, acuerdos y reportes |
| Dueño | Registro del negocio y verificación de Lúmina | Solicitudes, contratos, entregas y administración de su equipo |
| Colaborador | Dueño del negocio | Ver, solicitar o aprobar entregas por canal |
| Loyalty · Caja | Dueño con credencial vigente de Loyalty | Una sucursal y permisos independientes para compras y canjes |

En **Equipo y accesos**, un dueño puede dar a una persona solo Caja. También puede combinar Caja con TikTok, Instagram u otras áreas. El colaborador activa su cuenta con un código de un solo uso, elige su contraseña y entra con esa cuenta a las áreas autorizadas.

### Vincular Caja

1. Inicia Loyalty con el procedimiento que ya utilizas. Lúmina consume su HTTP privado en `127.0.0.1:8097`. Si lo ejecutas en otro puerto, define `LUMINA_LOYALTY_URL=http://127.0.0.1:PUERTO` antes de iniciar Lúmina.
2. En el portal del dueño, entra a **Equipo y accesos → Conexión con Loyalty**. Ingresa la credencial vigente de dueño de Loyalty y el código que aparece después de `/join/` en el enlace de registro del negocio. Confirma que ambos perfiles corresponden al mismo negocio.
3. Crea o abre un colaborador. En **Loyalty · Caja**, consulta las sucursales, elige una, marca compras y/o canjes y vuelve a ingresar tu credencial de dueño al guardar. La credencial del dueño se utiliza durante cada solicitud y se descarta.
4. Entrega el código de activación al colaborador. Ya dentro de Lúmina verá **Loyalty · Caja** junto con sus canales asignados. La credencial delegada de Caja se cifra en el servidor y la pantalla de v040 recibe su sesión del portal.
5. Para quitar solo Caja, usa **Revocar acceso de Caja** con tu credencial de dueño. Para cerrar toda la cuenta, usa **Desactivar persona**. Si queda un retiro pendiente en Loyalty, complétalo desde la ficha. Cada negocio puede seguir administrando sus accesos directamente en Loyalty.

Loyalty conserva la autoridad sobre el negocio, la sucursal y las operaciones de Caja. Cada llamada delegada vuelve a comprobar la credencial, el negocio, la sucursal y el permiso vigente. El portal usa una lista cerrada de rutas de Caja y nunca entrega al navegador la credencial delegada. Un cambio de permisos de redes se aplica al siguiente acceso con la sesión vigente.

## Separación de servicios y continuidad de tarjetas

```text
loyalty/
  src/main/              Aplicación Kotlin/Ktor y emisión de Wallet
  lumina-agency/
    src/accounts/        Identidad, sesiones y permisos
    src/billing/         Ofertas, contratos, cupos y cotizaciones
    src/production/      Solicitudes, visitas, piezas y evidencias
    src/reporting/       Métricas y reseñas
    src/loyalty/         Puente privado para Caja
    src/web/             Interfaz del portal
```

La instalación incorpora solamente `lumina-agency/`. El servidor de Lúmina, su puerto y su base de datos son independientes. Actualizar o detener ese servidor no exige reiniciar Loyalty, ni ejecutar migraciones de PostgreSQL o de Wallet. El puente usa las credenciales de equipo de Loyalty únicamente al vincular o usar Caja. Una compra o canje delegado recorre el mismo flujo de Loyalty y conserva su historial habitual.

Para publicar una actualización de **Loyalty** comprueba por separado la URL pública HTTPS ya grabada en los pases Apple, los seriales, los tipos de pase, los tokens, el emisor y los objetos de Google, así como las claves y registros existentes. Valida en paralelo una tarjeta Apple y una Google que ya estén instaladas. La evidencia v040 indica que las pruebas locales y el gateway pasaron, mientras HTTPS quedó pendiente por cambio de dirección del túnel con pases existentes. El portal de agencia no resuelve esa incidencia de origen.

Para copias de seguridad de Lúmina, detén su servidor y respalda `agency.sqlite` y `agency.key` de la misma carpeta privada. Restaura ambos juntos. Por defecto viven en `~/.lumina-digital/agency/`, fuera del código. El servidor está ligado a loopback. Mantén privada la configuración inicial y usa el portal local con cuentas de prueba antes de publicarlo para clientes.

## Alcance de v001

- Las métricas y reseñas se registran manualmente. Cada dato ausente se muestra como no medido.
- Web y Wallet se gestionan como servicios con solicitud, cotización, cupo y evidencia de entrega. La creación de sitios, el alta de un emisor Wallet y la publicación en redes tienen su propio flujo.
- La bienvenida y el código de activación se muestran en pantalla. La verificación de alta la realiza la agencia. El contrato registra el acuerdo comercial y sus cupos.
- El portal se entrega para ejecución local. Para producción quedan pendientes la conexión OAuth de redes, la entrega de correo y el medio de pago si se decide cobrar en línea.

## Comprobaciones

```bash
cd lumina-agency
npm test
```

Las pruebas ejercitan el portal por HTTP y usan un servidor aislado que reproduce el contrato privado de Loyalty v040. En particular comprueban la combinación de canales y Caja, el aislamiento por negocio, la sucursal, las acciones de compra y canje, la revocación, un alta reintentada sin duplicación y la ausencia de rutas de Wallet en el puente. La prueba contra Loyalty en tu Mac y la actualización en teléfonos se verifican por separado.

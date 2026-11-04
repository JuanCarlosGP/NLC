# WHOOP y Mercury

WHOOP está en Salud y Mercury en Patrimonio. **Mercury se conecta directamente
desde la APK Android**, sin servidor local. WHOOP y la versión web conservan el
servicio de Linux descrito más abajo. Los datos se guardan en SQLite en Android
e IndexedDB en web. La copia se consulta y exporta sin conexión; descargar datos
nuevos requiere Internet y el acceso a cada proveedor.

## Mercury en la APK Android

1. En Mercury, crear un token **Read Only** en Settings → API Tokens. No hace
   falta una IP fija para un token de solo lectura.
2. Abrir **Patrimonio → Mercury → Mi cuenta → Configurar Mercury**.
3. Pegar el token en el campo protegido y pulsar **Guardar y sincronizar**.
   El acceso se guarda exclusivamente en SecureStore del teléfono; no se manda
   al servicio Linux ni se guarda en preferencias, SQLite o copias exportadas.

La APK hace solo peticiones GET por HTTPS a la API de Mercury. No contiene
operaciones de pago o transferencia. La identidad se basa en el ID estable de
la organización; añadir una cuenta bancaria no cambia esa identidad. Una
organización distinta necesita confirmación antes de sustituir la copia local.

Con el token configurado, la app actualiza al abrir o volver a primer plano si
la copia tiene más de 15 minutos o no existe. Revisa cada 30 segundos mientras
está activa. Un fallo de red aplica espera creciente y vuelve a intentarlo;
un límite de peticiones respeta `Retry-After`. Los errores de acceso o de datos
requieren revisión o un intento manual. Cerrar la app detiene este trabajo: no
se promete ejecución periódica con Android suspendido.

La descarga recorre todas las páginas de cuentas, crédito, Treasury, categorías
y movimientos. Solo se guarda tras completar y validar la descarga; los fallos
conservan la copia previa. La copia contiene saldos firmados en USD y solo los
campos mostrados, con los últimos cuatro dígitos de las cuentas. No incluye EIN,
routing numbers, números completos, tokens ni respuestas crudas.

**Desconectar Mercury** cancela la descarga y elimina el token, conservando la
copia sin conexión. Borrar una copia mientras la conexión sigue activa avisa
de que la sincronización la volverá a descargar. Los datos de ejemplo se generan
en el móvil sin red y se guardan separados de la cuenta real. Importar y exportar
JSON sigue funcionando sin servidor.

No se dispone de credenciales reales durante el desarrollo; el acceso a una
cuenta real requiere que su propietario configure el token. Los fallos y el
protocolo se prueban con proveedores simulados, sin operaciones bancarias reales.

## Arranque del servicio Linux (WHOOP y web)

Requiere Node 22.23 o posterior (el resto de NLC conserva su requisito actual). Desde la raíz del repositorio:

```sh
cp .env.integrations.example .env.integrations.local
chmod 600 .env.integrations.local
# Editar .env.integrations.local con las credenciales, sin ponerlas en el chat.
npm run integrations
```

El servicio escucha solo en `127.0.0.1:8087`; NLC se abre en `http://127.0.0.1:8084`. `NLC_APP_ORIGIN` debe coincidir exactamente con el origen de NLC. Para otro puerto del servicio, configura también `EXPO_PUBLIC_NLC_INTEGRATIONS_URL` en el entorno de Expo y reinicia Metro. Esa variable solo contiene la URL, nunca claves.

Sin credenciales se pueden abrir las dos pantallas y usar **Datos de ejemplo → Ver ejemplo**. Los ejemplos son sintéticos y se almacenan aparte de **Mi cuenta**. El servicio no guarda los ejemplos como datos reales. No se contacta con los proveedores al generarlos.

## WHOOP

1. Crear una app en el [Developer Dashboard](https://developer-dashboard.whoop.com/). Activar `read:profile`, `read:body_measurement`, `read:cycles`, `read:recovery`, `read:sleep`, `read:workout` y solicitar `offline` para renovar tokens.
2. Guardar `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` y `WHOOP_REDIRECT_URI` en el archivo local; reiniciar el servicio.
3. Registrar el URI de retorno exacto que atienda este servicio: `/whoop/callback`. La documentación de WHOOP describe retornos HTTPS o de esquema personalizado. Si el panel no permite HTTP de desarrollo, usar el HTTPS local descrito abajo. No se ha verificado un login real sin una app OAuth del propietario.
4. En Salud → WHOOP → Mi cuenta, pulsar **Conectar WHOOP**, **Autorizar en WHOOP**, conceder acceso y volver a NLC. Después, **Sincronizar**. El estado se refresca al volver a la app y cada 30 segundos mientras esté activa.

Se usan los endpoints públicos v2. Se descargan todas las páginas de ciclos, recuperaciones, sueños y actividades, además de perfil y medidas. La descarga completa permite recoger cambios antiguos y eliminaciones. No se escribe sobre la copia anterior hasta completar y validar toda la descarga. La identidad se confirma antes de sustituir una copia de otra cuenta. Los estados no puntuados se muestran como datos ausentes, no como cero.

Las actividades se muestran diferenciadas en el calendario de entrenamientos; no generan sesiones, series, repeticiones ni volumen de fuerza. Las medidas no modifican el registro manual de peso. Las fechas respetan el desplazamiento horario del origen. El diario WHOOP no se importa: no hay endpoint público de diario en esta integración.

Tokens OAuth cifrados con AES-256-GCM, clave local y archivos con permisos `0600`, dentro de `~/.local/share/nlc/integrations` (`0700`). La rotación se persiste antes de descargar datos; no hay renovaciones concurrentes. **Desconectar WHOOP** elimina los tokens locales y conserva las copias. Para revocar el permiso concedido, hacerlo también desde WHOOP.

### HTTPS local opcional

Usar un certificado para `127.0.0.1` y `localhost` firmado por una CA de desarrollo que tu navegador confíe (por ejemplo, mkcert ya configurado). No se instala una CA ni se desactiva la validación TLS automáticamente. En `.env.integrations.local`:

```dotenv
NLC_TLS_CERT=/ruta/absoluta/localhost.pem
NLC_TLS_KEY=/ruta/absoluta/localhost-key.pem
WHOOP_REDIRECT_URI=https://127.0.0.1:8087/whoop/callback
```

Y arrancar Expo con `EXPO_PUBLIC_NLC_INTEGRATIONS_URL=https://127.0.0.1:8087`. Registrar ese URI HTTPS exacto en WHOOP. El servicio sigue escuchando solo en loopback.

## Mercury en el servicio Linux (web)

Crear un token **Read Only** en Mercury → Settings → API Tokens, guardarlo como `MERCURY_API_TOKEN` y reiniciar el servicio. En Patrimonio → Mercury → Mi cuenta, pulsar **Sincronizar**. No se ofrecen operaciones de pago ni de transferencia.

Se leen cuentas, crédito, Treasury, categorías, movimientos y rendimientos de Treasury. No se silencian errores de permisos ni se presentan descargas parciales como completas. Los importes de la cuenta se conservan en USD: no se toma la moneda extranjera de una compra como moneda del asiento. Las deudas de crédito ya vienen con signo negativo. Los movimientos muestran su estado y no se suman otra vez a los saldos de cuenta. Los datos de Mercury se consultan separados del patrimonio manual de NLC.

Se persisten únicamente los campos que se muestran: identificadores, nombres, últimos cuatro dígitos, saldos, fechas, importes, categorías y estados. No se guardan números de cuenta completos, routing numbers, detalles bancarios sin filtrar ni respuestas crudas.

## Copias y recuperación sin conexión

Cada pantalla tiene **Copias → Guardar copia / Importar copia / Borrar copia local**. El JSON lleva versión, proveedor, fecha, modo (real/ejemplo) e identidad, sin tokens ni claves. Importar requiere confirmación y valida tamaño, tipos, duplicados y referencias antes de escribir. Límite: 16 MiB. Ejemplos y cuentas reales tienen espacios de almacenamiento separados.

Estas copias son independientes del ZIP existente de Salud; ese formato no cambia ni elimina la caché WHOOP. El servicio mantiene también su última copia válida en disco. Borrar la copia de la app no borra el servicio ni la cuenta del proveedor. Sincronizar vuelve a descargar el historial. Los archivos exportados contienen los datos que se ven en pantalla; se elige dónde guardarlos.

## Sincronización periódica y límites

`NLC_SYNC_MINUTES=15` (o más) sincroniza cada proveedor conectado mientras este proceso está abierto. Por defecto es manual. El cliente consulta el estado y actualiza una copia existente de la misma cuenta; una cuenta diferente necesita confirmación. Cerrar el proceso detiene la sincronización. Una limitación de peticiones conserva la copia anterior y se muestra sin reintentos agresivos.

El servicio de esta sección está configurado para el entorno Linux local. No abre puertos LAN, túneles, servicios públicos ni webhooks. Para conectar WHOOP desde un móvil a un servidor persistente hará falta añadir autenticación entre dispositivo y servidor y configurar su despliegue; no se envían claves al móvil. Esta sección no valida una conexión real de WHOOP desde Android; iOS queda fuera de las pruebas.

## Verificación

```sh
npm run typecheck
npm run test:integrations
npm run test:mercury-mobile
```

Las pruebas usan proveedores simulados y datos sintéticos: OAuth y estado de navegador, rotación de tokens, paginación, cambios de estado, redacción de datos, ausencia de escrituras a los proveedores, fallos parciales, persistencia al reiniciar, separación de ejemplos y cuentas reales, rechazo de orígenes ajenos y restauración de JSON sin red. Una conexión real sigue requiriendo las credenciales y el consentimiento del propietario.

Referencias: [OAuth WHOOP](https://developer.whoop.com/docs/developing/oauth/), [API WHOOP v2](https://developer.whoop.com/api/), [tokens Mercury](https://docs.mercury.com/docs/getting-started), [paginación de movimientos](https://docs.mercury.com/reference/listtransactions), [saldos firmados](https://docs.mercury.com/reference/events).

## Resultado de QA local (4 de noviembre de 2026)

- TypeScript correcto y 10 pruebas de integraciones aprobadas; también pasan las pruebas existentes de backup de Salud y analíticas de fuerza.
- Navegador Linux: WHOOP muestra recuperación, sueño, VFC y actividad por fecha; cambiar al día anterior actualiza sus métricas. El calendario mantiene sesiones de fuerza y actividades WHOOP diferenciadas.
- Mercury muestra cuentas, Treasury, crédito con signo negativo y 22 movimientos sintéticos; el filtro por texto funciona. El JSON exportado (8.027 bytes) se ha importado y confirmado conservando saldos y movimientos.
- Tras detener el servicio y recargar, ambas pantallas leen su copia de IndexedDB. No se realizó ninguna petición a las cuentas reales.
- Tema clásico y Geist Pixel comprobados; Pixel usa la fuente local y no presenta desbordamiento horizontal a 517 px. Se restaura la apariencia que estaba seleccionada antes de la prueba.
- Servicio restablecido en loopback. Configuración local creada con valores vacíos. OAuth y API reales pendientes de las claves del propietario; no se han hecho pruebas físicas en Android ni iOS.

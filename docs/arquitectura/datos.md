# Datos en NLC

Cómo se guardan, de dónde salen y qué es fuente de verdad.
Si este documento y el código discrepan, gana el código y se actualiza aquí.

## Modelo mental

| Tipo | Dónde vive | Fuente de verdad |
| --- | --- | --- |
| Ficheros de música / podcast / vídeo | NAS (WebDAV) o carpeta local | El NAS / la carpeta |
| Catálogo indexado (artistas, álbumes, tracks) | SQLite en el teléfono | Copia tras escaneo; el NAS manda |
| Playlists importadas, recientes, likes de música | SQLite | Teléfono; playlists: copia opcional `nlc-playlists.json` en el share de música |
| Tareas (focus) y patrimonio (wealth) | SQLite | Teléfono; copia opcional en JSON del NAS |
| Preferencias de UI (zona, orden, pestaña) | AsyncStorage | Teléfono |
| Secretos (pass NAS, tokens) | SecureStore | Teléfono |
| Historial / likes de vídeo | AsyncStorage | Teléfono (el catálogo de vídeo no está en SQLite) |
| Sesión TUI + duraciones | `~/.config/nlc-tui/` | PC |

En una frase: **el media vive en el NAS; el estado de la app y la vida (tareas, finanzas) viven en el teléfono**; el puente LAN sirve una vista de solo lectura (con caché) al escritorio.

## Árbol del share de biblioteca

Un share (el que configures; no hay ruta de fábrica). Dentro, no al lado:

```
<share>/
  Artista/Álbum/pista.mp3     # biblioteca real
  Canciones/                  # dumps de yt-dlp (canciones)
  Podcasts/                   # dumps de yt-dlp (episodios)
  nlc-playlists.json
  nlc-tasks.json
  nlc-wealth.json
  nlc-push-tokens.json
```

Vídeo es **otro share** (Popcorn, Video, etc.). No va dentro de la biblioteca de música.

Si dejas vacío el path de podcasts / tareas / patrimonio, NLC usa `Podcasts/` y los JSON en la raíz de ese share. Si tienes shares separados de verdad, rellena esas rutas a mano.

El código del downloader (`nlc-downloader-app`, etc.) no se indexa. Mejor montarlo fuera del árbol de media.

```
NAS (WebDAV / carpeta)
        │ escaneo
        ▼
SQLite nlc-catalog.db  ←── AsyncStorage / SecureStore (prefs + secretos)
        │
        ├── UI Android (zonas music / podcast / video / focus / wealth)
        └── Bridge :7421 ──► TUI (mpv + session.json)
```

## Capas de almacenamiento

### SQLite — `nlc-catalog.db`

| Pieza | Ruta |
| --- | --- |
| Apertura / versión | `src/lib/db/sqlite-client.ts` (schema v7, WAL nativo, FK) |
| DDL | `src/lib/db/schema.ts` |
| API catálogo | `src/lib/db/catalog.ts` |
| Web normal (sin SQLite real) | `src/lib/db/memory.ts` (sesión; no equivale al nativo) |

| Tabla | Contenido |
| --- | --- |
| `meta` | KV: schema, `last_scan_at`, `nas_settings`, onboarding, locale |
| `artists` / `albums` / `tracks` | Catálogo; `kind` music o podcast; offline en `tracks` |
| `recents` / `favorites` | Órdenes de tracks de música |
| `playlists` / `playlist_tracks` | Import Spotify o locales + match a track del catálogo |
| `prod_projects` / `prod_tasks` / `prod_reminders` | Focus |
| `health_weight_entries` | Peso corporal: un registro por fecha, kg, nota y marcas de creación/edición |
| `wealth_accounts` / `wealth_assets` / `wealth_quotes` / `wealth_tx` / `wealth_goals` | Patrimonio |

Escrituras típicas de catálogo: `replaceLibrary` (scan NAS), `upsertLocalLibrary` (carpeta local). Lecturas: `getArtists`, `getAlbums`, `getTracks`, `searchCatalog`, `loadPlaylists`, etc.

### AsyncStorage

Preferencias y datos ligeros de UI. Claves relevantes:

| Clave | Uso |
| --- | --- |
| `nlc.settings.v1` | Espejo de ajustes NAS (en nativo manda SQLite `meta.nas_settings`) |
| `nlc.app.zone.v1` / `nlc.app.zones.enabled.v1` | Zona activa y cuáles se muestran |
| `nlc.home.browse.v1` / `nlc.library.browse.v1` / `nlc.library.tab.v1` | Orden / vista / pestaña |
| `nlc.track-meta.v2` | Artwork URL + durationMs por track |
| `nlc.video.watch.v2` / `nlc.video.likes.v1` | Resume y likes de vídeo |
| `nlc.ota.push-token` | Token Expo push local |
| `nlc.cursor.messages.v1` | Últimos mensajes del chat |

### SecureStore (`src/lib/settings/secret-store.ts`)

| Clave | Uso |
| --- | --- |
| `nlc.nas.password` | Contraseña WebDAV / NAS |
| `nlc.spotify.tokens` | OAuth Spotify |
| `nlc.cursor.api-key` / `nlc.cursor.agent-id` | Cursor |
| `nlc.download.token` | Descargador de podcasts |
| `nlc.bridge.token` / `nlc.bridge.deviceId` / `nlc.bridge.desktopHost` | Emparejado LAN |

En web, los secretos caen en AsyncStorage (sin SecureStore).

### Ficheros en disco

| Sitio | Qué |
| --- | --- |
| `{documentDirectory}offline/` | Audio descargado offline |
| NAS `nlc-wealth.json` | Copia opcional de patrimonio |
| NAS `nlc-tasks.json` | Copia opcional de focus + reminders |
| NAS `nlc-playlists.json` | Copia opcional de playlists (share de música o carpeta local) |
| NAS `nlc-push-tokens.json` | Registro de tokens push (bajo el share de música) |
| `~/.config/nlc-tui/session.json` | Token + host del teléfono |
| `~/.config/nlc-tui/durations.json` | Duraciones aprendidas por el TUI |

Los JSON del NAS no se tratan como media (`SKIP_FILES` en WebDAV).

## Por dominio

### Música y podcasts

- **SoT de ficheros:** NAS / Navidrome / carpeta local / mock (`src/lib/nas/`, `src/lib/local/`).
- **Índice:** SQLite tras escaneo. Offline: columnas en `tracks` + ficheros en `offline/`.
- **Playlists:** teléfono (`playlist-store.ts` → SQLite). Spotify aporta metadatos y match; no se reproduce Spotify. Copia opcional `nlc-playlists.json` en el share de música / carpeta local (`playlist-sync.ts`); gana el `updatedAt` más reciente. Tras un pull se reintenta el match de pistas sin `matched_id`. No se copian tokens.
- **Artwork:** AsyncStorage `nlc.track-meta.v2` + URLs del NAS.

### Vídeo

- **Catálogo:** listado en vivo (PROPFIND); **no** se indexa en SQLite.
- **Estado UI:** watch history y likes en AsyncStorage.
- **Bridge:** `GET /v1/video` lista series/películas; `?id=` o álbum `video:…` inspecciona carpeta; stream con id `video:…`.

### Focus (tareas) y wealth (finanzas)

- **SoT:** SQLite en el teléfono.
- **Copia opcional:** JSON en NAS y/o carpeta SAF.
- **Pull / push:** `pullFocusFromSources` / `pushFocusToSources`, análogo en wealth y en playlists (`pullPlaylistsFromSources`). Suele ganar el `updatedAt` más reciente; el teléfono es el sitio “vivo”.
- **Bridge:** solo lectura — `GET /v1/focus`, `GET /v1/wealth`.

### Escenario local de QA

`EXPO_PUBLIC_NLC_DEMO=1` y desarrollo web habilitan una base OPFS independiente:
`nlc-local-demo.db`. Usa las consultas reales de la app, no el intérprete SQL en
memoria. El worker web necesita COOP/COEP (configurados en Metro para esta sesión)
y diario DELETE; el nativo mantiene WAL. La sesión normal conserva su adaptador
web anterior para el catálogo; Salud usa IndexedDB con migración de sus valores previos.

`/dev/demo` carga datos sintéticos mediante los stores existentes. La biblioteca
se indexa desde `scripts/local-demo-nas.py`, un servicio de pruebas en loopback
con WebDAV, audio/vídeo generado y trabajos de descarga simulados. Los datos
canónicos del teléfono y las conexiones reales no participan.

### Salud

- Peso manual: SQLite `health_weight_entries` en el teléfono, sin red ni dependencia del NAS.
- Se actualiza por fecha; mover una entrada a un día ocupado se rechaza. Los días sin datos no se rellenan.
- Media de siete días naturales hasta la última entrada, evolución y agregados mensuales.
- La vista web conserva Salud en IndexedDB, migrando `nlc.health.weight.v1` y los otros dominios desde AsyncStorage; el catálogo general sigue en memoria.
- Los registros de salud no se añaden al snapshot de Cursor ni se exponen por el bridge LAN.

### Ajustes y zonas

- NAS: `NasSettings` en SQLite + password en SecureStore (`settings/storage.ts`, `settings-context.tsx`).
- Zonas `music | podcast | video | focus | wealth | health`: AsyncStorage (`zone-context.tsx`).

### OTA y push

- Token en AsyncStorage; registro en `nlc-push-tokens.json` del NAS.
- CI puede notificar vía `EXPO_PUSH_TOKENS` (no lee el NAS desde GitHub).

## Puente LAN (`:7421`)

Lógica de negocio: `src/lib/bridge/handle-request.ts`.  
Transporte / claim / auth: módulo nativo `modules/nlc-lan-bridge/`.  
Cliente escritorio: `tui/src/client.rs`.

| Endpoint | Qué hace |
| --- | --- |
| `GET /v1/discover` | Sin auth; anuncia NLC |
| `POST /v1/claim` | Nativo: acepta token, guarda host del PC |
| `GET /v1/hello` / `bye` / `ping` | Salud / desvincular / ping NAS |
| `GET /v1/artists` · `albums` · `tracks` · `search` | **preferCache**: SQLite si no vacío; si no, live |
| `GET /v1/playlists` | Solo SQLite (imports) |
| `GET /v1/album?id=` | Álbum, playlist `playlist:…`, o listing vídeo `video:…` |
| `GET /v1/stream?id=` | Offline local si hay; si no, stream NAS / vídeo |
| `GET /v1/cover?id=` | URL de portada live |
| `GET /v1/video` | Listado live de series/películas |
| `GET /v1/focus` · `/v1/wealth` | Dump SQLite |

`preferCache` **no** se usa en playlists, vídeo, focus ni wealth.

El bridge **no escribe** focus/wealth desde el TUI: solo lee.

## TUI en el PC

| Artefacto | Uso |
| --- | --- |
| `session.json` | Reconectar sin QR |
| `durations.json` | Rellenar tiempos que el catálogo trae a 0 |
| Carga de zona | En segundo plano (`spawn_zone`); la UI no debe bloquearse |
| Emparejado | Escaneo LAN + QR en `:7420`; claim al teléfono |

## Qué no hay (a propósito o pendiente)

- **Backup completo del catálogo** `nlc-catalog.db`: no existe. Salud tiene su propia copia ZIP portátil.
- **Escritura** de tareas/finanzas desde el TUI: no existe.
- **Índice SQLite de vídeo**: el listado es siempre live (puede ser lento; el TUI carga en background).
- **Web:** catálogo en memoria; Salud persiste en IndexedDB con migración de los valores anteriores.

## Mapa rápido de ficheros

| Tema | Entrada |
| --- | --- |
| Schema | `src/lib/db/schema.ts` |
| Catálogo | `src/lib/db/catalog.ts` |
| Ajustes / secretos | `src/lib/settings/` |
| Focus | `src/lib/productivity/` |
| Wealth | `src/lib/wealth/` |
| Vídeo | `src/lib/video/` |
| Bridge | `src/lib/bridge/handle-request.ts` |
| TUI sesión | `tui/src/session.rs` |
| Fuentes de contenido (producto/QA) | [producto/fuentes.md](../producto/fuentes.md) |
| Superficie de amenaza | [SECURITY.md](../../SECURITY.md) |

## Criterios al tocar datos

1. Decidir **fuente de verdad** antes de añadir otra capa de caché.
2. Media → NAS; estado de usuario → teléfono; secretos → SecureStore.
3. En el bridge, preferir caché SQLite para listados grandes; no bloquear el hilo UI del TUI con NAS lento.
4. Si se añade tabla o clave AsyncStorage, actualizar este documento en el mismo cambio.


### Entrenamientos sin conexión (esquema 8)

`health_training_sessions` conserva una fila por sesión, fecha indexada y payload
JSON validado con ejercicios y series ordenados. La escritura de la sesión completa
es atómica en SQLite y no necesita red, cuentas ni NAS. La migración añade tablas
sin reescribir peso, música o patrimonio. Los cambios consecutivos se serializan;
una escritura fallida mantiene el último borrador pendiente para reintentar.

`health_training_rest` contiene un único descanso con sesión, ejercicio y fecha
límite absoluta. Los ticks solo actualizan la pantalla. Los avisos Android son
notificaciones locales opcionales; se cancelan al sustituir o terminar el descanso.
El modo web normal usa IndexedDB con migración de AsyncStorage; el modo demo usa SQLite OPFS aislado.
Los entrenamientos no se envían a Cursor, al bridge LAN ni al NAS.


### Medicación y suplementos (esquema 9)

`health_medication_plans` almacena pautas como JSON validado con revisiones por
fecha efectiva. Una edición o pausa conserva revisiones de días anteriores.
`health_medication_logs` usa una clave única por pauta/fecha/hora y snapshots del
nombre, dosis e instrucciones; las correcciones actualizan ese registro sin
sumarlo dos veces. `health_medication_settings` conserva la preferencia de avisos.

Las escrituras se serializan y cada pauta/toma se guarda con una única operación
atómica. El estado visible se actualiza después de persistir; un error conserva
el formulario. La fecha y hora civil del registro se guardan separadas del timestamp
para no invalidar el historial si cambia la zona horaria del dispositivo.

Las notificaciones se programan con Expo localmente por fechas absolutas calculadas
desde horarios civiles, con límite de 40 avisos y 30 días. No requieren servidor,
conexión ni token push. No se modifican notificaciones de tareas o descansos.
Los datos no se incluyen en el bridge, NAS ni snapshot del asistente.


### Fotos de evolución (esquema 10)

`health_body_reviews` conserva metadatos validados y una fecha única por registro.
Cada vista apunta a un identificador de archivo distinto. SQLite cambia todos los
metadatos de un registro en una operación atómica; las escrituras del módulo se
serializan. Las fotos se copian a `documentDirectory/health-body-photos` antes de
referenciarlas, se limpian si falla el guardado y las anteriores se retiran después
del commit. Si el proceso se interrumpe o falla la limpieza puede quedar una copia
huérfana; no se borra automáticamente información existente para recuperarla.

En web, IndexedDB usa los almacenes `reviews` (índice único de fecha) y `photos`
(blobs), con transacciones conjuntas. La demo usa `nlc-body-photos-demo-v1` y la
sesión normal `nlc-body-photos-v1`. No usa SQLite en memoria para imágenes ni URLs
remotas. Las URL de blob son temporales y se liberan al desmontar cada vista.

La preparación de imágenes ocurre localmente, con Expo ImagePicker/ImageManipulator
nativos y canvas en web. Los módulos nuevos necesitan una APK reconstruida; sus
imports nativos se difieren hasta seleccionar una foto. Estas imágenes no forman
parte de sincronización al NAS, exportaciones existentes o snapshots del asistente.

### Nutrición (esquema 11)

`health_nutrition_days` guarda un JSON validado por fecha única: calorías, proteínas,
carbohidratos, grasas, notas, procedencia y marcas de creación/edición. Los días
importados pueden conservar un desglose de alimentos de MacroFactor. No se exige
que las kcal coincidan con la fórmula 4/4/9: se conservan los valores del archivo.

SQLite persiste en Android/iOS y en la demo web; la web normal usa IndexedDB,
independiente del catálogo en memoria. Las escrituras se serializan y publican
estado después del commit. La importación y los cambios de fecha usan transacciones
SQLite; el fallback web escribe una única instantánea. Un fallo no sustituye los
datos anteriores. El esquema es aditivo y conserva las tablas anteriores.

La importación CSV es local, con selector de documentos de Expo o pegado de texto.
Valida todas las filas antes de guardar, agrupa por fecha y muestra una vista
previa. Por defecto añade fechas nuevas y conserva las existentes; sustituir es
opcional y reemplaza cada fecha completa, conservando sus notas. Una reimportación
idéntica no modifica filas ni timestamps. Editar manualmente totales importados
retira el desglose, previa advertencia en el formulario. No se retiene el CSV ni
se incluyen estos datos en el NAS, bridge o contexto del asistente.

### Analíticas de entrenamientos

`src/lib/health/training/analytics.ts` deriva los resultados de las sesiones
existentes de `TrainingProvider`. No añade tablas, migraciones ni dependencias.
Cada reapertura usa las mismas sesiones SQLite/IndexedDB del registro local.
Editar, reabrir o eliminar una sesión recalcula los resultados sin índices de
marcas que puedan quedar obsoletos. Los cambios pendientes de persistir se señalan.

Solo cuentan series realizadas de sesiones terminadas con fecha hasta hoy; se
excluyen calentamientos y series pendientes. Se agrupan bloques del mismo ejercicio
por nombre NFC, espacios normalizados y minúsculas, sin inventar alias entre
máquinas o modalidades. Cada sesión conserva su punto aunque coincida en fecha.

El volumen suma carga registrada × repeticiones. Una carga nula no se convierte en
peso corporal ni en volumen conocido; cero explícito es cero. En mezclas se suma
el volumen conocido y se indica cuántas series carecen de carga. Las cargas y
volúmenes positivos, las repeticiones y la estimación Epley (1–10 reps, singles con
carga real) producen marcas con referencia a la sesión y serie. Los empates retienen
la primera aparición cronológica y el redondeo evita falsas marcas por flotantes.

Los filtros de 30/90/365 días usan fechas civiles inclusivas; las marcas y sus
mejoras conservan todo el historial como referencia. El gráfico mantiene huecos
para valores ausentes, muestra hasta 24 sesiones navegables y no rellena valores ausentes.
Las semanas se agrupan de lunes a domingo, mostrando las últimas ocho con sesiones
dentro del período. Todo se calcula en el dispositivo y no se envía al NAS o API.

### Backup y restauración de Salud

`health/backup` exporta un ZIP v1 con `manifest.json` y bytes de imágenes en rutas
`photos/<id>.<ext>`. El manifiesto incluye SHA-256 de datos e imágenes; el lector
comprueba estructura y CRC antes de aceptar el archivo. No lleva rutas del teléfono,
credenciales, datos de otros dominios ni resultados derivados de analíticas. Es un
archivo sin cifrar. Límites: 128 MiB de archivo/contenido, manifiesto de 8 MiB y
5.000 fotos; no se descomprimen entradas ni se extraen rutas arbitrarias.

Los stores de Salud usan `coordinatedHealthStore`, compartiendo una barrera con la
instantánea y restauración. La cola optimista de sesiones se vacía antes de operar.
Los proveedores se recargan tras aplicar el cambio. Los avisos se apagan y el
contador de descanso se limpia; el arranque sincroniza también su aviso local.

En nativo, una conexión SQLite aislada evita que escrituras ajenas en segundo plano
se unan a la transacción. Se preparan fotos con IDs nuevos y una copia ZIP íntegra
del estado anterior en `documentDirectory/health-backup`. Un commit cambia las
tablas de Salud y el meta `health_backup_recovery_v1`, que apunta a ese ZIP. Un
fallo revierte los registros y limpia las copias nuevas; tras el commit se retiran
las anteriores. Un fallo de limpieza puede dejar archivos huérfanos. No cambia la
versión 11 de las tablas de dominio ni se sustituye el catálogo completo.

La web normal migra los cuatro valores históricos de AsyncStorage al almacén
`health-values` dentro de la base de fotos existente, ahora versión 2. Se conservan
`reviews` y `photos` y se añade `maintenance` para recuperación. Los valores legados
se copian una vez y se mantienen como referencia; el catálogo general continúa
en memoria. La restauración de registros, imágenes y ZIP previo usa un solo commit
IndexedDB. La demo mantiene SQLite OPFS y usa un journal IndexedDB previo al cambio
SQL: si se interrumpe entre almacenes, revierte SQL antes de leer o escribir Salud.

La copia anterior se puede revisar/restaurar o exportar. Cada restauración sustituye
esta referencia, permitiendo alternar los dos últimos estados. Una restauración se
bloquea si no se puede guardar íntegramente el estado actual, sin borrar datos
ilegibles para continuar. El formato no repara una base de datos físicamente corrupta.

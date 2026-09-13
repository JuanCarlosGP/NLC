# Datos en NLC

Cómo se guardan, de dónde salen y qué es fuente de verdad.
Si este documento y el código discrepan, gana el código y se actualiza aquí.

## Modelo mental

| Tipo | Dónde vive | Fuente de verdad |
| --- | --- | --- |
| Ficheros de música / podcast / vídeo | NAS (WebDAV) o carpeta local | El NAS / la carpeta |
| Catálogo indexado (artistas, álbumes, tracks) | SQLite en el teléfono | Copia tras escaneo; el NAS manda |
| Playlists importadas, recientes, likes de música | SQLite | Teléfono |
| Tareas (focus) y patrimonio (wealth) | SQLite | Teléfono; copia opcional en JSON del NAS |
| Preferencias de UI (zona, orden, pestaña) | AsyncStorage | Teléfono |
| Secretos (pass NAS, tokens) | SecureStore | Teléfono |
| Historial / likes de vídeo | AsyncStorage | Teléfono (el catálogo de vídeo no está en SQLite) |
| Sesión TUI + duraciones | `~/.config/nlc-tui/` | PC |

En una frase: **el media vive en el NAS; el estado de la app y la vida (tareas, finanzas) viven en el teléfono**; el puente LAN sirve una vista de solo lectura (con caché) al escritorio.

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
| Apertura / versión | `src/lib/db/client.ts` (schema v6, WAL, FK) |
| DDL | `src/lib/db/schema.ts` |
| API catálogo | `src/lib/db/catalog.ts` |
| Web (sin SQLite real) | `src/lib/db/memory.ts` (sesión; no equivale al nativo) |

| Tabla | Contenido |
| --- | --- |
| `meta` | KV: schema, `last_scan_at`, `nas_settings`, onboarding, locale |
| `artists` / `albums` / `tracks` | Catálogo; `kind` music o podcast; offline en `tracks` |
| `recents` / `favorites` | Órdenes de tracks de música |
| `playlists` / `playlist_tracks` | Import Spotify o locales + match a track del catálogo |
| `prod_projects` / `prod_tasks` / `prod_reminders` | Focus |
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
| NAS `nlc-push-tokens.json` | Registro de tokens push (bajo el share de música) |
| `~/.config/nlc-tui/session.json` | Token + host del teléfono |
| `~/.config/nlc-tui/durations.json` | Duraciones aprendidas por el TUI |

Los JSON del NAS no se tratan como media (`SKIP_FILES` en WebDAV).

## Por dominio

### Música y podcasts

- **SoT de ficheros:** NAS / Navidrome / carpeta local / mock (`src/lib/nas/`, `src/lib/local/`).
- **Índice:** SQLite tras escaneo. Offline: columnas en `tracks` + ficheros en `offline/`.
- **Playlists:** solo teléfono (`playlist-store.ts` → SQLite). Spotify aporta metadatos y match; no se reproduce Spotify.
- **Artwork:** AsyncStorage `nlc.track-meta.v2` + URLs del NAS.

### Vídeo

- **Catálogo:** listado en vivo (PROPFIND); **no** se indexa en SQLite.
- **Estado UI:** watch history y likes en AsyncStorage.
- **Bridge:** `GET /v1/video` lista series/películas; `?id=` o álbum `video:…` inspecciona carpeta; stream con id `video:…`.

### Focus (tareas) y wealth (finanzas)

- **SoT:** SQLite en el teléfono.
- **Copia opcional:** JSON en NAS y/o carpeta SAF.
- **Pull / push:** `pullFocusFromSources` / `pushFocusToSources`, análogo en wealth. Suele ganar el `updatedAt` más reciente; el teléfono es el sitio “vivo”.
- **Bridge:** solo lectura — `GET /v1/focus`, `GET /v1/wealth`.

### Ajustes y zonas

- NAS: `NasSettings` en SQLite + password en SecureStore (`settings/storage.ts`, `settings-context.tsx`).
- Zonas `music | podcast | video | focus | wealth`: AsyncStorage (`zone-context.tsx`).

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

- **Backup completo** de `nlc-catalog.db` (export/import de toda la BBDD): no existe.
- **Escritura** de tareas/finanzas desde el TUI: no existe.
- **Índice SQLite de vídeo**: el listado es siempre live (puede ser lento; el TUI carga en background).
- **Web:** memoria en proceso; no persiste como el APK.

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

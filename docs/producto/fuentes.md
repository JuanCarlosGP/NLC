# Fuentes de contenido

Qué habla con qué. Completar cuando se pruebe F10-F14.

Entorno de esta pasada: Carpeta compartida activa. Navidrome y mock no se conmutaron.

## Biblioteca de ejemplo (mock)

- Cuándo se usa: chip "Biblioteca de ejemplo" en Ajustes > Fuente. No se activó en esta pasada.
- Qué se puede hacer: (sin probar)
- Qué no: (sin probar)

## Carpeta compartida (WebDAV / NAS)

- Activa ahora: `192.168.1.106:5005` · carpeta `/Music` · usuario `Viewer` · HTTPS off · punto verde.
- Probar: "Hay conexión. 16 canciones en 2 álbumes."
- En app: atajo Música dice 15 canciones; Recientes/Home y Canciones muestran más artistas/álbumes de los que anuncia Probar (SND-005). Audio sí sale (se escuchó `#HelloKitty^^`, `Amor Al Arte`).
- El móvil no monta SMB; esto es host:puerto + carpeta + user/pass, no un share montado.

## Navidrome / OpenSubsonic

- Host por defecto (repo): `192.168.1.106:4533`
- Cómo se configura: chip Navidrome en Ajustes (no abierto el formulario en esta pasada).
- Fallos típicos (LAN, HTTP claro, credenciales): no se tocó. HTTP claro y lock screen quedan para APK.

## Import Spotify

- Qué entra: URL de playlist (`https://open.spotify.com/playlist/...`) en el sheet Importar. Cargar.
- Cómo matchea contra la biblioteca: no se lanzó un import nuevo. Playlists liked ya aparecen como atajo y en Biblioteca > Playlists (Xistorras · b3rt1c, 🌠 · JcMDFK).
- Qué no hace (no descarga Spotify): no se comprobó; el sheet no habla de descargar.

## Podcasts yt-dlp (NAS)

- Host/puerto por defecto: `192.168.1.106:8091` (punto verde en Ajustes > Descargas).
- Dónde aterrizan los ficheros: no visto.
- Relación con Navidrome: Home modo Podcasts lista episodios (Recientes). No se bajó uno nuevo.

## Vídeo / WebDAV (One Piece)

- Cómo se resuelven sagas/arcos: One Piece → 11 sagas numeradas → arcos con rango de episodios → archivos `0004`… por episodio.
- Reproducción: no se pulsó play de vídeo en esta pasada.
# Fuentes de contenido

## Teléfono o NAS (versión actual)

El paso 2 del onboarding permite elegir **En este teléfono** o **NAS**. El recorrido local pasa directamente a las carpetas de Música, Audio/Podcasts, Vídeo, Tareas, Finanzas y Salud; no solicita servidor ni credenciales. Las carpetas se pueden omitir y configurar después.

En **Tus carpetas → Carpeta general** se puede elegir un directorio del teléfono o de la tarjeta SD. NLC crea o reutiliza dentro `Music`, `Podcasts`, `Video`, `Tasks`, `Wealth` y `Health`, y configura las seis fuentes con un único permiso. Las carpetas individuales siguen disponibles. La selección no mueve archivos de ubicaciones anteriores ni restaura datos de Salud. Si hay un archivo que impide crear una subcarpeta, no se aplica la configuración parcial.

Cada servicio tiene su propia selección Teléfono / NAS / NAS + teléfono en Ajustes. Las instalaciones anteriores conservan la combinación de fuentes que tenían. El servidor WebDAV sigue siendo compartido y las rutas son independientes por servicio; vídeo conserva su conexión propia.

Música, audio y vídeo leen los archivos de sus carpetas. Tareas y Finanzas trabajan en SQLite en el teléfono y conservan sus espejos `nlc-tasks.json` y `nlc-wealth.json` en las carpetas configuradas. **Salud siempre guarda los registros y las fotos en el teléfono**: Fuente configura la carpeta de sus copias y, opcionalmente, una ruta del NAS para guardar/abrir una copia manual. WHOOP también se abre desde esa sección. Elegir una carpeta de Salud no restaura datos automáticamente.

Las carpetas de Android se conceden con el selector del sistema; no se solicitan permisos generales de almacenamiento. Las copias no trasladan contraseñas, tokens ni permisos de acceso de otro dispositivo. Mercury sigue conectándose directamente desde Android.

## Notas históricas de QA

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
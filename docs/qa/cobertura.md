# Cobertura SND

Estado por flujo. Dos columnas porque cada pasada la hacen QA1 y QA2 por separado.

Leyenda: `-` no probado · `ok` · `fallo` (poner el id `SND-xxx`).

Actualizar este archivo al terminar una pasada. El detalle del fallo va a [hallazgos.md](hallazgos.md) y al canal SND.

Entorno de esta pasada: Expo Go · Nothing Phone A063 · Carpeta compartida `192.168.1.106:5005` `/Music` (no Navidrome)

| ID | Flujo | Qué cubre | QA1 | QA2 | Notas |
| --- | --- | --- | --- | --- | --- |
| F01 | Home | Atajos, Recientes, modos música / podcasts / vídeo, dock | ok | ok | Recientes reproduce pista, no abre álbum. Atajo 🌠 es playlist liked. |
| F02 | Biblioteca | Listas, ordenación, tiles, abrir álbum/artista | fallo | fallo | SND-001 Álbumes vacío. Chip Álbumes cortado (se lee entero si se scrollea). Canciones lista 15 pistas + 1 podcast (SND-007). |
| F03 | Buscar | Query, resultados, vacío, caracteres raros | ok | ok | Vacío lista 15 pistas (sin el podcast). Teclado no retesteado QA2. Overlay SND-004. |
| F04 | Álbum | Portada, pistas, play, shuffle, volver | fallo | fallo | No se alcanzó ficha. Recientes play; Álbumes vacío (SND-001). |
| F05 | Artista | Discografía, play desde artista | fallo | fallo | SND-002 Artistas vacío. |
| F06 | Favoritos | Marcar/desmarcar, lista, persistencia | ok | ok | Corazones rellenos en `#HelloKitty^^` y `Traw x Piru`. QA2 no abrió la pantalla Favoritos. |
| F07 | Now playing | Play/pause, skip, seek, lock screen (APK), haptics | ok | ok | Mini play/pause (Pausar) ok. Sheet ahora playing no abierto: el tap cae en la lista (SND-004). Lock screen: solo APK. |
| F08 | Cola | Ver cola, reordenar, quitar, siguiente/anterior | ok | - | QA2 no alcanzó el sheet (bloqueado por SND-004). |
| F09 | Mini player / dock | Visible entre pantallas, tap abre player, no tapa UI | fallo | fallo | SND-003 (QA1). SND-004 mini/lista tapan UI y dock. SND-008 scroll en Canciones se come dock y mini; Back tira a Home. |
| F10 | Ajustes / fuente | Mock vs Navidrome, host/puerto, probar conexión, guardar | ok | ok | Carpeta compartida Probar: "16 canciones en 2 álbumes." No se conmutó a Navidrome/mock. SND-005 recuento. |
| F11 | NAS real | Stream HTTP, transcode 320, FLAC si hay, corte de red | ok | ok | Audio por Carpeta compartida sí (mini en Pausar). Transcode/FLAC/corte no. |
| F12 | Import Spotify | Pegar URL/playlist, match contra biblioteca, importados | ok | ok | Sheet visto. Placeholder `https://open.spotify.com/playlist/.` (SND-006). No import nuevo. |
| F13 | Podcasts | Ajustes yt-dlp (host 8091, token), listar, reproducir | ok | ok | yt-dlp verde. Episodio #287 aparece como pista 16 en Biblioteca > Canciones (SND-007). No se reprodujo episodio. |
| F14 | Vídeo One Piece | Sagas/arcos, WebDAV, reproducir capítulo | ok | - | QA2 no abrió One Piece esta pasada. |
| F15 | Ajustes generales | Fuente, descargas, errores de guardado, volver | ok | ok | Fuente + yt-dlp. No se forzó error de guardado. |

Cuando un flujo pasa a `fallo`, la nota lleva el id del hallazgo (`SND-001`). No escribir el repro aquí.
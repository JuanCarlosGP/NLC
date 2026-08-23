# Pantallas

Rellenar en la primera pasada. Por pantalla: para qué existe, acciones principales, a dónde navega, rarezas.

Estado: `vacío` · `borrador QA1` · `revisado QA2`

Entorno de esta pasada: Expo Go · Nothing Phone A063 · fuente **Carpeta compartida** `192.168.1.106:5005` · `/Music` (no Navidrome).

## Home (F01)

Estado: borrador QA1

- Qué es: arranque. Logo NLC, conmutador Música / Podcasts / Vídeo, atajos y Recientes.
- Acciones: cambiar modo; abrir atajo; ordenar Recientes (sheet Recientes / alfabético / creador); grid o lista; tap en tile de Recientes reproduce esa pista (no abre álbum).
- Navega a: Música (`/music`), Favoritos música/podcast, playlist importada (`/imported/...`), Podcasts, One Piece, y a veces álbum si el atajo es un álbum.
- Rarezas: el tercer atajo de música es la playlist liked `🌠` (Spotify, autor JcMDFK), no un álbum. En vídeo no hay Recientes. El FAB Refresh/Dev Menu es de Expo Go, no de la app.

## Biblioteca (F02)

Estado: borrador QA1

- Qué es: catálogo con chips General / Playlists / Canciones / Podcasts / Artistas / Álbumes. Cabecera serif "Biblioteca", `+` (Importar).
- Acciones: filtrar por chip; orden Recientes; grid/lista; corazón en cada pista; tap en pista reproduce.
- Navega a: import Spotify (`+`); playlists importadas; now playing al reproducir.
- Rarezas: el chip Álbumes queda cortado a la derecha (`Álbu...`). Canciones lista pistas; Playlists muestra las importadas (Xistorras, 🌠). **Artistas y Álbumes salen vacíos** (sin empty state). Hallazgos SND-001 y SND-002, no es el diseño.

## Buscar (F03)

Estado: borrador QA1

- Qué es: búsqueda. Placeholder "Artista, álbum o pista". Chips Canciones / Podcasts.
- Acciones: escribir query; resultados al vuelo. Vacío muestra una lista larga (recientes/todas). Query `orslok` devolvió 4 pistas (título y artista).
- Navega a: reproduce al tap. No hay chips de álbum/artista.
- Rarezas: con el teclado abierto el dock no recibe taps (hay que cerrar teclado). La lista larga se mete debajo del dock.

## Álbum (F04)

Estado: no alcanzada en esta pasada

- Desde Home Recientes el tile reproduce la pista, no abre ficha de álbum.
- Biblioteca > Álbumes está vacío (SND-001). No documentar un flujo que no se pudo abrir.

## Artista (F05)

Estado: no alcanzada en esta pasada

- Biblioteca > Artistas vacío (SND-002).

## Favoritos (F06)

Estado: borrador QA1

- Qué es: lista "Favoritos música" / "Favoritos podcast". Cabecera LISTA, recuento, Reproducir / Aleatorio.
- Acciones: corazón en filas (añadir/quitar). En esta pasada: 2 canciones (`#HelloKitty^^`, `Traw x Piru`). El corazón relleno persiste al recargar Expo.
- Navega a: atajo de Home; now playing al reproducir.
- Rarezas: no se probó matar la app del todo (solo Reload de Expo).

## Now playing (F07)

Estado: borrador QA1

- Qué es: sheet que sube sobre la pantalla actual (asa arriba). Título serif, artista, tipo (Canciones), seek, shuffle / prev / pause / next / repeat.
- Acciones: play/pause (también tecla media), seek visible, shuffle. Lock screen no aplica en Expo Go.
- Navega a: atrás cierra el sheet. La cola va debajo (COLA).
- Rarezas: al cerrar el sheet **desaparece el dock** hasta Reload (SND-003). Accessibility del cover: "Mantén pulsado para eliminar del NAS" — no se ha pulsado largo (no vamos a borrar del NAS en QA). Duración del player 1:31 vs fila 1:32 en `#HelloKitty^^`.

## Cola (F08)

Estado: borrador QA1

- Qué es: bloque COLA dentro del sheet de now playing. Misma lista que se lanzó (canciones numeradas, corazón).
- Acciones: tap en fila (no se comprobó reordenar ni quitar en esta pasada).
- Navega a: sigue en el sheet.
- Rarezas: no hay pantalla `/queue` aparte en lo que se vio; la cola vive en el sheet.

## Mini player / dock (F09)

Estado: borrador QA1

- Qué es: mini player (portada/título, corazón, play/pause) encima del dock de 4 tabs: Inicio, Buscar, Biblioteca, Ajustes.
- Acciones: tap en el mini debería abrir now playing; play/pause en el propio mini.
- Navega a: tabs del dock.
- Rarezas: **el mini y las filas de lista se pisan**; en Canciones/Buscar las últimas filas tapan el dock y se comen el tap (SND-004). Scroll a fondo en Canciones se lleva dock y mini; Back tira a Home (SND-008). Tras cerrar now playing el dock se va (SND-003, QA1).

## Ajustes / fuente (F10, F15)

Estado: borrador QA1

- Qué es: Fuente (Carpeta compartida / Biblioteca de ejemplo / Navidrome) y Descargas (yt-dlp).
- Acciones: chip de fuente; fila Configuración abre sheet (HOST, PUERTO, USUARIO, CONTRASEÑA, CARPETA, HTTPS, Probar, Guardar). "Guardar configuración" en la pantalla principal. yt-dlp `192.168.1.106:8091` (punto verde).
- Navega a: sheet de fuente; sheet yt-dlp no abierto en esta pasada.
- Rarezas: pasada hecha con Carpeta compartida `192.168.1.106:5005` · `/Music` · usuario Viewer · HTTPS off. Probar: "Hay conexión. 16 canciones en 2 álbumes." La app en Música muestra 15 canciones y Home Recientes no cuadra con 2 álbumes (SND-005). No se cambió a Navidrome ni a mock (no romper la sesión).

## Importados Spotify (F12)

Estado: borrador QA1

- Qué es: `+` en Biblioteca abre sheet SPOTIFY / Importar. Campo URL y Cargar.
- Acciones: pegar URL de playlist y Cargar. En Home, playlists liked aparecen como atajo (🌠, y en Biblioteca Xistorras).
- Navega a: `/imported/{id}` (no se abrió la ficha en esta pasada).
- Rarezas: placeholder del campo: `https://open.spotify.com/playlist/.` (punto final raro, SND-006). No se lanzó un import nuevo.

## Podcasts (F13)

Estado: borrador QA1

- Qué es: modo Podcasts en Home. Atajos Podcasts y Favoritos podcast. Recientes con episodios (se vio `Experto en Corazón... #287`).
- Acciones: conmutar modo; abrir atajo.
- Navega a: `/podcasts`, favoritos kind=podcast.
- Rarezas: no se reprodujo un episodio en esta pasada. yt-dlp en ajustes en verde.

## Vídeo One Piece (F14)

Estado: borrador QA1

- Qué es: modo Vídeo → atajo One Piece. Lista de 11 sagas (East Blue … Egghead). Saga → arcos (East Blue: 8 arcos con rango de episodios). Arco → archivos (Buggy el Payaso: 5 archivos, Episodio 4–8).
- Acciones: tap saga, tap arco, tap episodio (no se pulsó play de vídeo para no pisar el audio).
- Navega a: `/video/onepiece` → saga → arco → watch.
- Rarezas: el mini player de música tapa las últimas sagas (SND-004).
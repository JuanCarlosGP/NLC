# Flujos

Recorridos de punta a punta. No es la tabla de cobertura: es "el usuario quiere X y pasa por estas pantallas".

Estado: `vacío` · `borrador QA1` · `revisado QA2`

Entorno: Expo Go · Nothing Phone A063 · Carpeta compartida `192.168.1.106:5005` `/Music`.

## Reproducir un álbum de la biblioteca

Estado: no cerrado en esta pasada

Pasos vistos:
1. Home o Biblioteca > Canciones: tap en una pista → mini player + audio.
2. Tap en el mini (si no lo tapa una fila) → sheet now playing + COLA.
3. Biblioteca > Álbumes está vacío: no hay ficha de álbum alcanzable por ese chip (SND-001).
4. Atajo Home "Música" abre lista plana "15 canciones" con Reproducir / Aleatorio, no una ficha de álbum.

No documentar "abrir álbum" como flujo sano hasta que Álbumes liste algo o Recientes distinga pista vs álbum.

## Buscar y meter en cola

Estado: borrador QA1

Pasos:
1. Dock Buscar.
2. Campo "Artista, álbum o pista". Sin query: lista larga. Con `orslok`: 4 pistas.
3. Tap en resultado → reproduce (la COLA del sheet es esa lista).
4. No se vio un "añadir a cola sin reproducir". El corazón es favorito, no cola.

## Cambiar de mock a Navidrome

Estado: no ejecutado

Pasos vistos (sin cambiar la fuente activa):
1. Ajustes > Fuente: tres chips (Carpeta compartida / Biblioteca de ejemplo / Navidrome).
2. Configuración abre HOST / PUERTO / USUARIO / CONTRASEÑA / CARPETA / HTTPS / Probar / Guardar.
3. Probar sobre Carpeta compartida: "Hay conexión. 16 canciones en 2 álbumes."
4. No se pulsó Navidrome ni mock para no dejar la sesión a medias. El host Navidrome por defecto del repo (`:4533`) no se verificó en UI.

## Importar una playlist de Spotify y reproducir un match

Estado: parcial

Pasos:
1. Biblioteca > `+` → sheet SPOTIFY / Importar.
2. Campo URL + Cargar. Placeholder `https://open.spotify.com/playlist/.` (SND-006).
3. No se pegó una URL nueva. Ya hay playlists liked en Home (🌠) y en Biblioteca (Xistorras, 🌠).
4. Tap en atajo 🌠 debería ir a `/imported/{id}` — no se abrió la ficha.

## Bajar / reproducir un podcast

Estado: parcial

Pasos:
1. Home > modo Podcasts.
2. Atajos Podcasts y Favoritos podcast. Recientes con al menos un episodio.
3. Ajustes > yt-dlp `192.168.1.106:8091` en verde.
4. No se reprodujo ni se disparó una descarga en esta pasada.

## Ver un capítulo de One Piece

Estado: borrador QA1 (hasta listar archivo; sin play)

Pasos:
1. Home > modo Vídeo > atajo One Piece.
2. 11 sagas. Tap East Blue → 8 arcos con rango de episodios.
3. Tap un arco (Buggy el Payaso) → 5 archivos (Episodio 4–8).
4. No se pulsó un episodio (evitar picar el audio). Mini player de música tapa el final de la lista (SND-004).

## Favorito ida y vuelta (persiste al reiniciar la app)

Estado: borrador QA1 (Reload Expo, no kill)

Pasos:
1. Corazón en Canciones / Buscar / mini player. `#HelloKitty^^` ya venía likeado; Traw x Piru también.
2. Atajo Favoritos música: 2 canciones, Reproducir / Aleatorio.
3. Tras Reload de Expo Go el like de `#HelloKitty^^` seguía. No se mató el proceso Android.
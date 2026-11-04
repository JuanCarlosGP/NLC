# Pantallas

Rellenar en la primera pasada. Por pantalla: para qué existe, acciones principales, a dónde navega, rarezas.

Estado: `vacío` · `borrador QA1` · `revisado QA2`

Entorno de esta pasada: Expo Go · Nothing Phone A063 · fuente **Carpeta compartida** `192.168.1.106:5005` · `/Music` (no Navidrome).

## Textos de la interfaz

- Priorizar datos y acciones; evitar frases de presentación que repitan el título.
- Usar frases cortas y retirar explicaciones repetidas sobre guardado local.
- Mostrar detalles de cálculos, formatos y funcionamiento en ayudas desplegables.
- Mantener visibles errores, requisitos de entrada y efectos de borrar, importar o restaurar.
- Aplicar el mismo criterio en español e inglés, conservando las etiquetas de accesibilidad.

## Densidad visual

Geist Pixel usa espacios y tipografía compactos, con tarjetas de relleno corto
y un ancho de lectura contenido. Los grupos de tarjetas aprovechan columnas
cuando caben. Los formularios mantienen campos y acciones cómodos de pulsar;
las fotos y los gráficos conservan sus proporciones.

La APK Android usa Geist Pixel por defecto, con fuente incluida y selección
sin conexión en Ajustes → App → Apariencia. NLC clásico sigue disponible.
La opción ocupa una fila; no tiene tarjetas de vista previa.

En componentes nuevos, usar `createStyles(() => ({ ... }))` de
`lib/appearance/density`, sus ayudas de espaciado, `useThemeId()` y los
componentes `Text`/`TextInput` de `components/ui/themed-text`. Los valores usados en
geometría o animaciones siguen siendo números. Classic conserva sus tamaños.

## Onboarding

El primer paso permite elegir idioma y, justo debajo, NLC clásico o Geist Pixel,
antes de Empezar. Cambiar de tema actualiza la pantalla al instante, conserva
el paso y usa la misma preferencia sin conexión que Ajustes → App → Apariencia.

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

## Salud y peso

Implementación inicial (pendiente de QA en dispositivo):

- El selector de zonas incluye Salud y Ajustes permite mostrarla u ocultarla.
- Inicio de Salud muestra último peso, media de siete días, cambio total y número de registros.
- Registrar peso abre una hoja con fecha, kg (admite coma decimal) y nota opcional.
- El historial está en `/health/weight` y en Registros del dock cuando Salud está activa.
- Cada fecha guarda una sola entrada. Registrar otra vez en ese día actualiza su valor y nota.
- Pulsar una entrada permite editarla. Moverla a una fecha ya ocupada muestra un error sin perder datos.
- El borrado pide confirmación. Los fallos al guardar mantienen abierto el formulario.
- Evolución ofrece 30 días, 90 días o todo el historial; la media usa días naturales con registros.
- Buscar, en Salud, filtra por fecha, peso o nota sin consultar el NAS.
- Resumen mensual con media, mínimo, máximo y número de entradas.
- Android guarda en SQLite; la vista web conserva Salud en IndexedDB entre recargas.


## Entrenamientos

- Salud incluye la entrada a `/health/training`: sesiones en curso y terminadas,
  búsqueda por nombre, fecha, nota o ejercicio, y creación de sesión.
- Cada sesión permite nombre, fecha y notas, ejercicios propios o usados antes,
  edición del nombre del ejercicio y descanso de 0 a 900 segundos.
- Series con kg (opcional para peso corporal), repeticiones, calentamiento y
  casilla de realización. Solo las series realizadas de trabajo cuentan en el volumen.
- Al completar una serie empieza el descanso configurado. La hora final se guarda
  en el dispositivo; se recupera al volver o reiniciar. En Android se puede activar
  un aviso local con permiso de notificaciones. La web no entrega avisos de fondo.
- Los cambios se guardan automáticamente. Un error conserva el borrador en pantalla
  con un botón de reintento; no se presenta como guardado.
- Terminar bloquea la edición. Reabrir permite corregir; Repetir crea una sesión
  independiente con las mismas cargas y todas las series pendientes.
- La columna Anterior usa la última sesión terminada anterior a la sesión actual.
- `/health/training/calendar` es un calendario mensual de lunes a domingo, con días
  marcados, selección de fecha y creación de varias sesiones en el mismo día.


## Medicación y suplementos

- Salud abre `/health/medication`, con Tomas, Calendario y Pautas.
- Pautas con nombre, tipo, dosis libre, notas, inicio/referencia, fin opcional y
  horarios HH:MM separados por comas (hasta ocho), o sin hora fija.
- Frecuencias diaria, alterna, semanal y mensual. En meses cortos se usa el último
  día cuando el día de referencia no existe.
- Cada horario tiene su toma independiente. Se puede registrar como tomada u
  omitida, corregir hora/nota y volver a pendiente. No se registra en el futuro.
- La edición y pausa se aplican desde hoy conservando el historial anterior.
- Los avisos locales Android son opcionales: hasta 40 en los próximos 30 días,
  renovados al abrir la app. El navegador mantiene horarios y registros sin avisos.


## Fotos de evolución

- Salud abre `/health/body-photos`, con Registros y Comparar.
- Registro único por fecha, notas, búsqueda y edición de fecha sin sobrescribir
  otro registro. Cuatro vistas opcionales: frontal, izquierda, derecha y espalda.
- Seleccionar foto abre una vista previa. Guardar crea una copia local; los errores
  conservan la selección para reintentar. Las eliminaciones se confirman.
- Comparar permite elegir dos fechas distintas, cambiar de vista, intercambiar las
  fechas y ampliar una foto. Ambas se muestran completas con el mismo marco.
- Android/iOS usan el selector de Expo y preparan las imágenes a JPEG de hasta
  1.800 px. Web usa el selector de archivo y preparación local equivalente.
- Las fotos guardadas están disponibles sin conexión. No se envían al NAS ni al
  asistente. Las fotos se incluyen en el ZIP de backup de Salud.

## Nutrición

- Salud abre `/health/nutrition`: Día e Historial, calendario mensual de lunes a
  domingo, calorías y tres macros, notas, edición, cambio de fecha y borrado confirmado.
- Un registro por fecha; no se admiten fechas futuras ni se sobrescribe otro día al
  editar su fecha. Cero es un valor explícito; un campo vacío se rechaza.
- Media y gráfico de siete fechas respecto al día seleccionado. Los días sin
  registro no se cuentan como cero. Historial y alimentos paginados.
- Importar MacroFactor abre un selector local de CSV o permite pegar texto. Se
  admiten las columnas nutricionales del export de alimentos usado por JARVIS y
  CSV de totales diarios. Fechas ISO, coma/punto decimal, delimitador coma, punto
  y coma o tabulador; comillas escapadas y BOM. Hasta 5 MB / 20.000 filas.
- La vista previa muestra nuevos, sustituidos, conservados y sin cambios. Sustituir
  días existentes está desactivado al abrir; activarlo advierte de días manuales.
  Cancelar o un CSV inválido no cambia los registros.
- Los CSV de alimentos muestran el desglose de kcal/macros por alimento. Editar
  sus totales convierte el día a manual y elimina ese desglose, con aviso visible.
- No requiere servidor ni cuenta de MacroFactor. No se importan XLSX, ZIP,
  entrenamientos, micronutrientes ni objetivos desde este módulo.

## Analíticas de entrenamientos

- `/health/training/analytics` se abre desde Ver analíticas en Entrenamientos o
  desde Progresión de cada ejercicio dentro de una sesión.
- Selector de ejercicio con búsqueda; muestra sesiones y series de trabajo del
  historial. Ejercicios sin series terminadas muestran un estado vacío propio.
- Períodos de 30/90 días, un año y todo el historial. Resumen de sesiones, series,
  repeticiones y volumen conocido; se explican las series sin carga externa.
- Curvas de carga máxima, volumen por sesión, máximo de repeticiones y 1RM estimado.
  Un punto por sesión, manteniendo sesiones distintas del mismo día. Selección
  táctil o con Dato anterior/siguiente y apertura de la sesión seleccionada.
- Hasta 24 puntos por ventana, sin muestreo de valores intermedios. El historial
  accesible muestra todos los números, con bloques de 20 sesiones.
- Volumen semanal del ejercicio para las últimas ocho semanas con sesiones en el
  período. No se presentan semanas ausentes como registros de cero volumen.
- Cinco marcas históricas: carga, volumen de una serie, volumen por sesión,
  repeticiones y 1RM estimado. Fecha, serie cuando corresponde y acceso a su sesión.
- Las marcas usan todo el historial aunque se filtre un período. No se atribuye
  peso corporal a series sin kilos, y una estimación no se presenta como marca
  medida de una repetición.

## Backup y restauración de Salud

- `/health/backup`, desde Salud y Ajustes de Salud. Resumen por módulo y guardado de
  ZIP portátil con todos los registros y fotos, conservando bytes y fechas.
- Seleccionar copia valida el archivo entero y abre su vista previa con fecha,
  tamaño y cantidades. Confirmar sustituye Salud completa, sin mezclar registros.
- Antes de aplicar se guarda una copia anterior íntegra. Puede revisarse para
  restaurarla o guardarse fuera de la app; se conserva la previa al último cambio.
- Se apagan los avisos de medicación y se limpia el descanso. Pautas, historiales y
  registros se conservan; los avisos se activan después en el dispositivo de destino.
- Archivo sin cifrar, hasta 128 MiB y manifiesto de 8 MiB. Se indica su contenido
  privado. Un archivo inválido, foto incompleta o fallo de escritura impide continuar.
- Android elige carpeta mediante el sistema; iOS usa su hoja de archivos/compartir;
  web descarga el ZIP. No requiere NAS ni cuenta.

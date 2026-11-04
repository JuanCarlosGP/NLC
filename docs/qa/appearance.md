# Tema Geist Pixel y pruebas locales en Linux

Verificación: 3–4 de noviembre de 2026. Entorno: demo web de NLC en
`http://127.0.0.1:8084`, Linux, SQLite/OPFS e IndexedDB locales.
Por indicación del usuario, las pruebas físicas de Android se han detenido.

## Apariencia

En **Ajustes → App → Apariencia** se puede elegir entre NLC clásico y Geist Pixel.
La opción ocupa una sola fila junto al idioma y muestra el tema actual.
Las opciones se abren al usar el desplegable, sin tarjetas de vista previa
ni una sección destacada al principio de Ajustes.
El tema nuevo usa negro puro, texto blanco/gris, líneas finas, esquinas rectas
y ninguna sombra ni desenfoque. Los errores mantienen un color distinguible.
La fuente es **Geist Pixel Square**, incluida en el repositorio: no se descarga
desde Google Fonts ni otro servicio durante el uso de la aplicación.
Su origen, versión y licencia están en `assets/fonts/geist/`.

La preferencia se guarda en `nlc.appearance.v1`. El documento aplica el tema
antes de iniciar React y los cambios actualizan las variables CSS compartidas,
sin remontar los proveedores ni borrar formularios o registros. Si falla la
escritura de la preferencia, se recupera la selección guardada y se muestra un error.
Este selector corresponde a la versión web usada en Linux; la apariencia nativa
existente se conserva.

## Densidad de Geist Pixel

Pixel tiene una escala propia de espacios y tipografía, aplicada a las hojas de
estilo compartidas y a los espacios de las tarjetas y formularios. Classic y la
versión nativa conservan los valores originales.

| Medida habitual | Classic | Geist Pixel |
| --- | --- | --- |
| Título de página | 32 px / 38 px | 26 px / 32 px |
| Relleno de tarjeta | 16 px | 12 px |
| Separación de secciones | 18 px | 12 px |
| Margen lateral | 20 px | 16 px |
| Ancho de contenido | Disponible | Máximo 1.120 px |
| Ancho de panel | Disponible | Máximo 680 px |

Los accesos de Salud y las marcas de entrenamiento se agrupan en columnas
cuando hay espacio. Los indicadores de peso usan dos columnas en ventanas
estrechas y cuatro en amplias; la biblioteca admite más portadas por fila.
Los marcos de comparación de fotos conservan su proporción y muestran la imagen
completa. Los paneles ajustan su altura al contenido dentro de su límite de
pantalla. Se conservan las alturas mínimas de botones principales, los campos
editables y el espacio reservado al reproductor y al dock.

`src/lib/appearance/density.ts` ofrece `createStyles` para hojas de estilo y
`space`, `textSize` y `leading` para valores de presentación en línea. Las
variables CSS cambian al elegir tema, sin remontar la aplicación. Las medidas
de gráficos, imágenes, animaciones y cálculos de posición permanecen numéricas.

Verificación del 4 de noviembre en Linux:

- TypeScript y `git diff --check` correctos.
- Recorridos por Música, Podcasts, Vídeo, Tareas, Patrimonio y Salud, incluidos
  Biblioteca, Peso, fotos, analíticas y formularios.
- Ventana estrecha de 390 px y ventana amplia: sin desbordamiento horizontal en
  los recorridos revisados; indicadores en dos/cuatro columnas y marcas en
  una/tres columnas, respectivamente.
- Cambio de tema comprobado: título de Ajustes a 32/38 px en Classic y 26/32 px
  en Pixel. La preferencia queda en Pixel.
- Campo de fecha de 44 px; campo de peso de 52 px. Fotos de comparación de
  315 × 420 px en ventana amplia, con la imagen completa.
- Panel corto de Peso ajustado al contenido. En la importación CSV con ayuda y
  pegado abiertos, una ventana de 600 px limita el panel a 636 px incluyendo
  los 96 px de margen técnico de arrastre: el área visible de 503 px desplaza
  sus 622 px de contenido. Al ampliar la ventana a 844 px, el panel se reajusta.
- Corregida la dependencia de altura en `BottomSheet`: un panel abierto también
  recalcula su tamaño al variar la altura de la ventana. Los formularios se
  cerraron sin guardar ni importar datos; los registros existentes se conservan.
- Las dimensiones temporales del navegador se restablecieron al terminar.

Comprobaciones realizadas:

- Selección con ratón y teclado; opción activa y foco accesibles.
- Cambio clásico → Pixel → clásico → Pixel: fondo cálido y radios originales
  al volver al clásico; negro `rgb(0, 0, 0)` y radios `0px` en Pixel.
- Persistencia al recargar y apertura de una segunda pestaña.
- Texto con `GeistPixelSquare`, iconos y gráficos visibles con la nueva paleta.
- Salud y analíticas de entrenamiento conservan sus registros y resultados.

## Regresión local

`npm run typecheck` pasa. Pasan los **96 casos** existentes:

```bash
npm run test:health-backup
npm run test:health
npm run test:training
npm run test:medication
npm run test:body-photos
npm run test:nutrition
npm run test:training-analytics
npm run test:behavior
```

También se ha probado por la interfaz una copia de **123.480.776 bytes
(117,76 MiB)** con 52 fotos y 14 registros de evolución. Se validó, restauró y
exportó. La comparación independiente del ZIP exportado comprobó CRC, SHA-256
de las 52 fotos y equivalencia de todos los registros, normalizando los nuevos
identificadores locales de las fotos. Después se restauró la copia inicial de
la demo: 81 pesos, 17 sesiones, 5 pautas, 36 tomas, 17 días de nutrición,
3 registros de evolución y 9 fotos.

Las pruebas de almacenamiento y lógica no necesitan NAS ni servicios externos.
La demo del navegador se sirve desde el proceso local de Expo; esta comprobación
no implica instalar una PWA ni validar una recarga sin ese servidor local.

Límite observado: al abrir tres pestañas simultáneas de la demo, el VFS de
SQLite/OPFS devolvió `Invalid VFS state`. Cerrar la pestaña de QA adicional y
recargar permitió arrancar de nuevo. El selector de tema y la persistencia
funcionaron con dos pestañas, pero el uso de la demo SQL con varias pestañas
simultáneas queda fuera de la cobertura aprobada.

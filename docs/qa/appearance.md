# Tema Geist Pixel en la APK y pruebas locales

Verificación: 4 de noviembre de 2026. La interfaz principal es la APK Android.
La comprobación nativa usa un emulador Android 14 aislado en Linux, sin controlar
el teléfono del usuario. Las comprobaciones web previas se conservan abajo como historial.

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

### APK Android

Geist Pixel es el tema inicial si no existe una preferencia nativa previa.
**Ajustes → App → Apariencia** permite volver a NLC clásico. La fuente OTF viaja
en la aplicación y la selección se guarda en AsyncStorage (`nlc.appearance.v1`):
ambas funcionan sin red. La pantalla espera a leer la preferencia antes de mostrar
su contenido. Un error de almacenamiento deja elegir de nuevo y muestra un aviso;
si falla una escritura, recupera la última elección confirmada.

El cambio actualiza colores, tipografía, tarjetas, formularios, dock y hojas
sin remontar proveedores, reproductor ni formularios. No cambia datos,
configuraciones de fuentes o las identidades de colores guardadas en proyectos.
El fondo de la ventana y el splash son negros. El splash requiere una APK nueva;
esta entrega usa una versión de runtime propia para no enviar la OTA a APK antiguas.

### Contrato para componentes nativos

- `createStyles(() => ({ ... }))` recibe una fábrica: colores y fuentes se leen
  al resolver cada tema. Las hojas se cachean por tema, sin mutar objetos congelados.
- Los componentes visuales llaman a `useThemeId()`, incluidos los componentes
  memorizados. Los proveedores de datos no se reinician al cambiar la selección.
- Importar `Text` y `TextInput` desde `components/ui/themed-text`. Conservan refs,
  eventos y accesibilidad y aplican la fuente también a los textos anidados.
- Usar `space`, `textSize`, `leading`, `radius` e `insetSpace` en estilos en línea.
  Dentro de una fábrica se transforman una sola vez, incluso al componer hojas.
- No escalar anchos, alturas, cálculos de gráficos, imágenes o animaciones. Se
  conservan áreas táctiles y elevación para el orden de las capas; las sombras
  se hacen transparentes. Las hojas cortas con un único `SheetScrollView` se
  ajustan al contenido; las complejas conservan su altura y desplazamiento.

La web mantiene sus variables CSS y su proveedor de apariencia independiente.

## Densidad de Geist Pixel

Pixel tiene una escala propia de espacios y tipografía, aplicada a las hojas de
estilo compartidas y a los espacios de las tarjetas y formularios, también
en Android. Classic conserva los valores originales.

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

## Comprobación nativa en Linux

Emulador Android 14, x86_64, 411 dp de ancho. APK de desarrollo compilada con
Gradle, fuente cargada por Expo Font y exportación Android de producción correctas.
Se verificaron el fondo negro, los bordes rectos y la fuente en Salud, Peso y
Ajustes; el selector cambia a Classic y vuelve a Pixel. La selección permanece
al cerrar y abrir el proceso. El formulario de peso ajusta su altura al contenido,
permite escribir y guardar, y los datos se conservan al reiniciar. Se corrigió
la altura de línea del resumen numérico de peso para no recortar los números
junto a la unidad y se mantuvo una altura mínima de 44 dp en la acción de guardar.

Los **119 casos** pasan: 13 de apariencia y 106 de dominio e integraciones.
Los de apariencia incluyen escrituras fallidas, lecturas tardías, selección
concurrente, hojas congeladas, composición sin doble escalado y cambios reales
de React sin remontar el reproductor simulado ni perder el borrador de un campo.
La exportación Android incluye la fuente local. El teléfono físico y iOS no
forman parte de esta comprobación.

## Historial de comprobación web en Linux

Verificación del 3–4 de noviembre de 2026:

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

`npm run typecheck` pasa. La regresión incluye las suites de Salud, integraciones,
comportamiento y los 13 casos nuevos de apariencia nativa:

```bash
npm run test:appearance
npm run test:integrations
```

Suites de dominio:

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

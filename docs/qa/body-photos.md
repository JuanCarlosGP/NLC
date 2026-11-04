# Fotos de evolución corporal: comprobación local

Fecha: 2026-11-03. Rama de trabajo: `codex/health-weight`.

## Alcance

- Salud → Fotos de evolución (`/health/body-photos`). Registro único por fecha,
  notas, búsqueda y edición de fecha sin sobrescribir otro registro.
- Cuatro vistas opcionales: frontal, lateral izquierda, lateral derecha y espalda.
  Se puede empezar con un registro vacío e incorporar las fotos después.
- Selección, vista previa, guardado, sustitución y eliminación por vista;
  confirmación para quitar fotos o eliminar un registro completo.
- Comparación de dos fechas diferentes con la misma vista, intercambio de fechas
  y ampliación. `contain` muestra las fotos completas, sin recortarlas para llenar
  los marcos. Las vistas que faltan muestran un marcador.
- Imágenes preparadas localmente a JPEG con un máximo de 1.800 px en el lado mayor.
  Origen de hasta 30 MB, resultado de hasta 10 MB; en web se admiten JPEG/PNG/WebP.

## Persistencia sin conexión

Android/iOS conservan metadatos en SQLite y copias en `documentDirectory` de NLC.
Las fotos originales del selector no son las copias utilizadas para consultar el
historial. La sustitución prepara la nueva copia y actualiza el registro antes
de retirar la anterior. Si falla el guardado, se conserva la copia anterior y la
selección permanece en la vista previa para reintentar.

En web, IndexedDB guarda registros y blobs en una transacción conjunta. No se usa
localStorage para las imágenes ni se necesita servidor para leerlas después.
La demo usa una base IndexedDB independiente de la normal. Las URL temporales de
las imágenes se liberan al cambiar de foto o cerrar las vistas.

El módulo no envía fotos al NAS, a Cursor ni al bridge LAN. Borrar datos de la app,
desinstalarla o limpiar el almacenamiento del sitio elimina sus copias locales;
este hito no incluye copia de seguridad ni exportación.

## Verificación automatizada

`npm run test:body-photos`: doce pruebas, con archivos y SQLite reales:

1. Detección del formato por cabecera y límites de tamaño/dimensiones.
2. Fechas reales, notas y bloqueo de fechas futuras.
3. Un registro por fecha; movimiento sin perder identidad o fotos.
4. Reapertura del catálogo y lectura de la copia tras quitar el original de prueba.
5. Fallo de escritura SQL: limpieza de la copia nueva y conservación de la anterior.
6. Fallo de copia parcial y reintento.
7. Escrituras consecutivas en las cuatro vistas; sustitución/eliminación selectiva.
8. Fallo al eliminar metadatos conservando sus fotos.
9. Fallo de limpieza posterior sin presentar como fallido un guardado ya realizado.
10. Selección de dos fechas con fotos, sin incluir borradores vacíos.
11. Metadatos corruptos o identificadores de foto reutilizados sin sobrescritura.
12. Migración desde esquema 9 conservando medicación, entrenamientos, peso y favoritos.

Pasan además las 31 pruebas anteriores y TypeScript.

## Recorridos comprobados en navegador

- Demo incremental: dos fechas, ocho ilustraciones generadas por código, con la
  etiqueta «Ilustración de prueba». No se han utilizado fotos personales.
- Comparación frontal, cambio de vista, intercambio, selección de fechas y ampliación.
- La fecha de la otra columna aparece deshabilitada en el selector.
- Una fecha duplicada produce un error conservando el formulario.
- Un archivo `.png` sin contenido de imagen se rechaza por su cabecera real.
- Importación de un PNG válido, preparación JPEG y guardado; recarga con el NAS
  simulado detenido: se conserva la imagen de 1.024 × 1.024 y se lee desde un blob
  local de IndexedDB. NAS restaurado al terminar.
- Una vista incompleta muestra «Sin foto en esta vista».
- Se corrigió una carrera de eventos de imagen al cambiar de vista: una URL de la
  foto anterior liberada podía marcar como fallida la siguiente. Se comprobó el
  cambio consecutivo entre las cuatro vistas después de aislar cada carga por ID.

## Integración nativa y límites

Se añaden `expo-image-picker` y `expo-image-manipulator` compatibles con Expo SDK 54.
El acceso a estos módulos es diferido y comprueba su disponibilidad, para que una
APK anterior muestre la necesidad de actualizar en vez de fallar al abrir NLC.
Se requiere una nueva APK; una OTA por sí sola no añade estos módulos.

La configuración de permisos conserva la cámara del QR y mantiene desactivado el
micrófono. La selección de fotos no abre la cámara ni pide permisos al arrancar.

La exportación de JS Android y la compilación de una APK debug finalizaron correctamente.
La primera compilación C++ falló sin diagnóstico del compilador; el reintento con
dos trabajos CMake y dos workers de Gradle terminó con `BUILD SUCCESSFUL`.
La APK contiene las clases ImagePickerModule e ImageManipulatorModule.
Una APK debug verifica la compilación nativa y requiere Metro para ejecutar JS.

Artefacto local: `android/app/build/outputs/apk/debug/app-debug.apk`.
Logs: `/tmp/nlc-body-android-native-retry.log` y `/tmp/nlc-body-android-js.log`.

Pendiente en un teléfono físico: selector, orientación EXIF, cancelación y memoria
con fotos grandes, recuperación tras cierre del proceso y consulta en modo avión.
No se han enviado actualizaciones OTA, publicado releases ni instalado una APK.

Referencias de integración: [selector de Expo](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
y [preparación local de imágenes](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/).

Actualización posterior: [backup de Salud](health-backup.md) incorpora exportación y
restauración de estos registros y fotos; la web normal migra sus valores a IndexedDB.

# Almacenamiento local y copias por servicio

Validación en Linux y Android API 34 x86_64 emulado, en modo avión, con datos sintéticos. No se ha utilizado un teléfono físico ni iOS.

## Cobertura

- Onboarding: elegir NAS muestra requisitos y conexión; volver y elegir teléfono muestra las seis carpetas. Permisos SAF concedidos individualmente. Entrar en modo local no conecta al NAS.
- Música: carpeta `Artist/Album/Offline.wav` indexada sin conexión; exportación e importación desde la interfaz. Verificación externa del ZIP y de todos los SHA-256. Se conserva el archivo original. Reimportar la misma copia deja una sola canción; un escaneo de la carpeta anterior no puede reinsertarla.
- Salud: importación de una foto PNG, registro visible en Fotos de evolución y nueva exportación desde su carpeta. La foto se copia a un ID privado nuevo, conservando sus bytes y checksum.
- Vídeo: copia sintética con progreso y favorito, incluyendo un nombre con `:` y `%`. La restauración usa los nombres que realmente crea el proveedor de documentos de Android. Abrir «Seguir viendo» reproduce el archivo local; los segmentos de la ruta no se decodifican dos veces.
- Prueba nativa de 320 MiB por SAF: exportar, preparar, copiar al destino y comparar SHA-256 (`fbcc65ef9f4d7dd6b69bd6d7b385d7c58847d67217d64842b98a15fdeeacb40a`). Heap Java máximo: 192 MiB. El archivo no se carga completo en el puente JS.
- Cancelación al exportar y al preparar; rechazo de rutas ascendentes y contenido dañado antes de escribir datos de la aplicación.
- Regresiones de datos: los seis servicios, listas, favoritos, metadatos editados, progreso de vídeo, fotos, Mercury/WHOOP guardados, cuenta de integración distinta, transacción fallida, importación repetida, esquema de columnas y escaneo obsoleto tras restauración. Los archivos originales de una fuente quedan excluidos de «borrar descargas».
- Compilación nativa: `npm run apk:check` genera el árbol Android y compila arm64. Los cambios requieren APK nueva; la versión usa un runtime independiente de APK anteriores.

## Repetir la prueba nativa

1. Generar e instalar una APK debug x86_64 con applicationId `app.nlc.player.dev`.
2. En el emulador, crear `Download/NLC-Service-QA/Health` y elegirla como carpeta de Salud desde la app. No usar archivos personales.
3. Ejecutar con SDK Android 36 y build-tools 36.0.0:

```bash
ANDROID_HOME="$HOME/.local/opt/android-sdk" python3 scripts/android-service-backup-qa/run.py --serial emulator-5560
```

El serial es obligatorio y se rechazan dispositivos físicos. Se instalan únicamente las pruebas de instrumentación, dirigidas a la APK de desarrollo. Por defecto se usan 320 MiB; `--size-mib 4` permite una comprobación rápida y `--private` usa la caché privada. El ejecutor elimina solo sus archivos temporales y la subcarpeta que él acaba de crear. No requiere servidor ni tokens.

## Límites prácticos

Las copias completas admiten carpetas locales y WebDAV. No descargan contenido de Spotify ni streams de Navidrome/OpenSubsonic. Las imágenes remotas ajenas a las fuentes conservan su URL pública. Una exportación completa necesita leer todos los archivos de las fuentes activas; si falta un archivo, falla sin anunciar una copia completa.

La importación combina registros, no vacía el servicio. Se conservan archivos originales y fotos privadas anteriores. Las fotos que deja de referenciar una revisión reemplazada pueden seguir ocupando espacio privado. Los tokens, las contraseñas y los permisos SAF se configuran de nuevo en cada dispositivo.

Los límites de formato (50.000 archivos, 32 MiB de metadatos y 512 GiB extraídos) no equivalen a pruebas físicas de esos máximos. Se necesita espacio temporal para preparar la importación y espacio para la copia final. Los escáneres locales mantienen sus límites de catálogo existentes.

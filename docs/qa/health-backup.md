# Backup y restauración de Salud

Fecha: 2026-11-03. Ruta: `/health/backup`, accesible desde Salud y sus Ajustes.

## Uso y alcance

Guardar copia de Salud crea un ZIP portátil que contiene peso, sesiones completas
(incluidos borradores y fechas futuras), pautas con revisiones, tomas, nutrición
con alimentos importados y las copias originales guardadas de las fotos. Las
analíticas se recalculan a partir de las sesiones. No exporta credenciales ni
otros dominios de NLC. El archivo no está cifrado; la pantalla lo indica.

Elegir copia para restaurar valida el archivo completo antes de mostrar la vista
previa: fecha, tamaño y cantidades por módulo. Restaurar requiere confirmación y
sustituye toda Salud, sin mezclar ni duplicar registros. Los avisos quedan apagados
y se detiene el descanso en curso. Se pueden activar después en ese dispositivo.

Antes del cambio se guarda una copia local del estado anterior. Revisar copia
anterior utiliza el mismo flujo de validación y confirmación; Guardar copia
anterior permite exportarla. Solo se conserva la previa a la última restauración,
por lo que recuperar la anterior también permite volver a la que acaba de sustituir.
Esta copia vive dentro de la app: para conservarla fuera hay que exportar su ZIP.

Límites de formato: ZIP v1 de NLC, hasta 128 MiB de archivo y contenido total,
8 MiB de manifiesto y 5.000 fotos de hasta 10 MiB cada una, respetando el total.
El manifiesto incluye SHA-256 de los datos y de cada foto, además de CRC del ZIP.
Los nombres/rutas son una lista cerrada. El formato almacena las entradas sin
compresión adicional y no acepta archivos recomprimidos por otras herramientas,
ZIP cifrados, archivos añadidos, rutas arbitrarias ni versiones desconocidas.
No se extraen rutas del ZIP directamente al sistema de archivos.

El límite de tamaño no garantiza fluidez al máximo en cualquier teléfono: la
codificación y lectura usan memoria. Las copias grandes requieren validación física.

## Consistencia y errores

Todos los stores de Salud comparten una barrera para que un guardado o lectura no
se intercale con la instantánea/restauración de otro módulo. Antes de operar se
vacía la cola de sesiones pendientes. La interfaz bloquea nuevas acciones durante
la operación y actualiza todos los proveedores después de restaurar.

- Android/iOS: conexión SQLite propia, staging de imágenes con IDs nuevos y ZIP
  previo completo antes de un único commit de tablas de Salud y referencia de
  recuperación. Solo después se limpian las copias antiguas. Un error antes del
  commit conserva datos, fotos, descanso y referencia de recuperación anteriores.
  Si se interrumpe la app antes del commit o falla una limpieza pueden quedar
  archivos huérfanos; no se necesita borrarlos para consultar los datos válidos.
- Web normal: IndexedDB v2 reúne registros y fotos en una sola transacción. Los
  valores de AsyncStorage anteriores se copian una vez al nuevo almacén; se conserva
  su original y nunca se vuelve a usar sobre un valor ya migrado/restaurado.
- Demo web: SQLite OPFS más fotos IndexedDB. Un journal previo durable conserva
  el estado SQL antes del cambio. Si se interrumpe entre ambos commits, el arranque
  revierte SQL antes de permitir lecturas/escrituras de Salud. Si falla la
  recuperación se conserva el journal para reintentar, sin seguir escribiendo.

La restauración exige poder crear una copia previa íntegra: datos actuales
ilegibles, fotos ausentes o falta de espacio la bloquean. No es una herramienta
para reparar una base SQLite físicamente corrupta. Un equipo nuevo con Salud vacía
sí puede restaurar una copia completa.

## Pruebas automatizadas

`npm run test:health-backup`: 20 pruebas con SQLite real en disco, archivos reales
y fake-indexeddb para transacciones y migración del navegador.

- ZIP completo, historial, timestamps, bytes de foto y Salud vacía.
- Versiones desconocidas, relaciones inválidas, metadatos alterados, fotos ausentes,
  truncadas, cambiadas o sobrantes; límites, rutas no admitidas y compresión rechazada.
- Restauración nativa, filas ajenas intactas y reapertura de la recuperación.
- Recuperar el estado anterior y volver al siguiente; restauración repetida sin duplicados.
- Fallo SQL a mitad, escritura parcial de imagen/ZIP y fallo de limpieza posterior.
- Confirmación que revalida los bytes, conservación de la recuperación tras otro fallo.
- Migración AsyncStorage e IndexedDB v1, restauración web conjunta y abortos IDB.
- Demo interrumpida, rollback entre almacenes y recuperación reintentable.
- Barrera de lectura/escritura y transporte Base64 exacto.

Pasan también las 73 pruebas anteriores y TypeScript: 93 pruebas en total. CI incluye
el nuevo comando. La exportación JS Android valida el módulo completo; logs en
`/tmp/nlc-backup-android-js-final.log`. La APK debug arm64 compiló con éxito en 1m03s,
log `/tmp/nlc-backup-android.log`; incluye ExpoSharing y el selector de documentos.
La APK debug necesita Metro para ejecutar el JS.

## Recorridos verificados en la aplicación local

Se han usado exclusivamente los datos ficticios de `/dev/demo`.

1. ZIP descargado desde la app: 81 pesos, 17 sesiones, 5 pautas, 36 logs (incluye
   pendientes), 17 días de nutrición, 3 registros y 9 fotos. Aproximadamente 0,22 MiB.
2. Edición temporal de peso del 3 de noviembre: 76,8 → 76,9 kg y nota de prueba.
3. Selección real del ZIP, vista previa, confirmación y restauración. Regresa a
   76,8 kg y la nota original. La copia anterior queda disponible.
4. Nueva exportación: pesos, sesiones, pautas/tomas y nutrición coinciden exactamente
   con el ZIP inicial. Las nueve fotos conservan exactamente los mismos bytes,
   aunque sus IDs de archivo cambian para evitar sobrescrituras.
5. ZIP con un byte cambiado en una foto: error de integridad antes de restaurar,
   sin vista previa válida ni cambios de Salud.
6. Recarga completa: la copia anterior persiste. Restaurarla devuelve 76,9 kg y la
   nota temporal; volver a la anterior recupera el estado original de 76,8 kg.
7. Recarga, recuperación y exportación con el NAS ficticio detenido. NAS restaurado
   después y comprobado con HTTP 200. La copia final vuelve a conservar todos los
   registros y los bytes de las nueve fotos.

El navegador necesita Metro para cargar la aplicación; esta prueba comprueba
independencia del NAS. No prueba un arranque web sin su servidor local.

## Nativo y pendientes

`fflate 0.8.3` prepara el ZIP localmente. `expo-sharing ~14.0.8` sirve para exportar
mediante la hoja del sistema en iOS; Android guarda con Storage Access Framework.
El selector usa el ExpoDocumentPicker ya incorporado. Los módulos opcionales se
comprueban al utilizarlos, para que una APK antigua no falle al abrir la app.

Verificados en Android los selectores locales, permiso de subcarpeta, cancelación,
restauración, exportación, reapertura, recuperación anterior y visualización de fotos
(ver abajo). Quedan pendientes interrupción del proceso durante staging/commit,
modo avión real, avisos, espacio insuficiente y memoria con copias
grandes. iOS no se ha compilado ni probado físicamente en esta sesión. No se ha
publicado ninguna OTA.

## Comprobación tras reiniciar el entorno

NLC y el NAS ficticio se han vuelto a arrancar. El enlace directo
`/health/backup` devuelve HTTP 200 después de compilar. La pantalla conserva los
81 pesos, 17 sesiones, 5 pautas, 36 logs, 17 días de nutrición, 3 registros y
9 fotos, además de la copia anterior persistida. Vuelven a pasar TypeScript y las
20 pruebas de backup. Captura de esta comprobación:
`/tmp/nlc-health-backup-preview.jpg` (archivo temporal).

## Preparación de la prueba física Android

Android conectado mediante depuración inalámbrica: A063, API 35, arm64-v8a.
Se conserva NLC y NLC Dev; la nueva instalación de prueba tiene nombre
**NLC Backup QA** y paquete `app.nlc.player.backupqa`, versión 0.1.15 (17).
Compilación debug correcta en 2m28s, instalación ADB `Success`. El paquete y la
etiqueta se cambian solo con un init de Gradle temporal, sin cambiar la identidad
de producción. Firebase Google Services se omite en esta variante local: esta
prueba cubre Salud offline y no las notificaciones push.

APK: `android/app/build/outputs/apk/debug/nlc-backup-qa-debug.apk`.
Init temporal: `/tmp/nlc-backup-qa.init.gradle`. Log de compilación:
`/tmp/nlc-backup-qa-build.log`.

Para la primera APK debug se usa Metro en localhost:8082 con reversos ADB del
dispositivo para los puertos 8081 y 8082. Esa primera APK necesita Metro. Después
se sustituye por la APK autónoma descrita abajo y se retiran estos reversos y el
Metro nativo temporal. La web en 8084 y el NAS ficticio en 8086 siguen activos.

El ZIP ficticio web se copia a
`Descargas/NLC-Backup-QA/salud-demo.zip`; SHA-256 coincide entre equipo y Android.
Contiene 81 pesos, 17 sesiones, 5 pautas, 36 logs, 17 días de nutrición y 9 fotos
en 3 registros. No se ha restaurado nada sobre las otras instalaciones.

El recorrido se ha ejecutado controlando la interfaz real por ADB. Se ha saltado
el asistente del NAS, elegido español y mantenido los avisos desactivados en QA.

## Resultado del recorrido físico Android

1. Selector de documentos de Android, ZIP local, vista previa con los siete
   contadores y confirmación explícita: restauración correcta desde Salud vacía.
2. Exportación mediante Storage Access Framework a la subcarpeta NLC-Backup-QA,
   aceptando únicamente el acceso a esa carpeta. Archivo creado y recuperado por
   ADB: `nlc-health-2026-11-03T21-29-17-480Z.zip`.
3. Verificación independiente con Python/zipfile: CRC válido, todos los registros
   de peso, sesiones, pautas/tomas y nutrición coinciden con el original. Los tres
   registros de fotos mantienen sus metadatos; los nueve archivos conservan los
   mismos bytes y SHA-256, con IDs nuevos para no sobrescribir archivos anteriores.
4. Cierre forzado y reapertura de la app: datos y copia anterior siguen disponibles.
5. Restaurar la copia anterior devuelve Salud al estado vacío. Revisar de nuevo la
   anterior y confirmarla recupera los 81 pesos y las nueve fotos. Esta última
   confirmación se ejecuta con Metro pausado y termina correctamente; Metro se
   reanuda en un `finally`. Esto valida la operación local ya cargada, no un
   arranque en frío sin Metro de la primera APK debug.
6. Cancelar tanto el selector de exportación como el de importación deja la app
   utilizable, sin error ni cambios en sus registros. La navegación Atrás del
   selector puede subir primero por las carpetas antes de cerrarlo.
7. Segunda exportación tras recuperar los datos:
   `nlc-health-2026-11-03T21-34-11-496Z.zip`. Vuelven a coincidir todos los registros
   y los nueve archivos de foto, byte por byte.
8. Fotos de evolución → Comparar muestra las imágenes ficticias restauradas. Se
   deja después la app abierta en Backup, con datos completos y copia anterior.
   No aparecen errores de ReactNativeJS, AndroidRuntime o ExpoModulesCore en los
   logs del proceso de QA durante este recorrido.

Los ZIP copiados por ADB pueden no aparecer en el proveedor especial Descargas;
se eligió Almacenamiento interno → Download → NLC-Backup-QA. Android restringe
la concesión de acceso al raíz de Download: se usa siempre la subcarpeta de QA.

Comprobación final local: `/tmp/nlc-health-android-final.zip` y
`/tmp/nlc-verify-android-backup.py`. Capturas temporales:
`/tmp/nlc-android-backup-final.png` y `/tmp/nlc-android-backup-photos.png`.


## APK autónoma y arranque sin servidores locales

Para probar el arranque completo se actualiza solo `app.nlc.player.backupqa` con
una APK que integra el JavaScript y los recursos. El init temporal
`/tmp/nlc-backup-qa-standalone.init.gradle` configura la variante de QA sin soporte
de desarrollo y con bundle integrado; un manifiesto temporal desactiva las OTA
solo para QA. La identidad y configuración de producción no se modifican.

Compilación correcta en 4m44s, incluyendo `lintVitalDebug`. Hubo que descargar dos
AAR de Android que faltaban en la caché; no se cambiaron versiones del proyecto.
Log: `/tmp/nlc-backup-qa-offline-build.log`.

APK instalada: `android/app/build/outputs/apk/debug/nlc-backup-qa-offline.apk`,
41.518.857 bytes. `aapt` confirma paquete/etiqueta QA, aplicación no depurable y
OTA desactivadas. El APK contiene un bundle Hermes de 5.422.672 bytes y 17 fuentes.
La actualización ADB conserva los datos ficticios y sus preferencias.

Con Metro nativo, Metro web y NAS ficticio pausados simultáneamente:

1. Cierre forzado de QA y arranque en frío correcto: 81 pesos y 9 fotos visibles.
2. Selector local, lectura y vista previa del ZIP ficticio.
3. Confirmación y restauración completa, incluida copia previa automática.
4. Exportación con el selector real de carpeta y confirmación de acceso.
5. Mensaje de éxito y datos completos visibles.

El control por ADB registra resultado funcional OK y reanuda los tres servidores
en un `finally`. El proceso de control devolvió 143 al final; se verificaron
además, de forma independiente, la copia generada y los servicios reanudados.
Web y NAS responden HTTP 200. No hay errores ReactNativeJS, AndroidRuntime ni
ExpoModulesCore en el proceso de la app autónoma. Estos recorridos físicos no se
cuentan como pruebas de CI.

ZIP producido con los servidores pausados:
`nlc-health-2026-11-03T21-49-59-187Z.zip`. La comparación independiente vuelve a
confirmar todos los registros y las nueve fotos exactas, con IDs renovados. Copia
local de comprobación: `/tmp/nlc-health-android-offline.zip`. Resultado y captura:
`/tmp/nlc-android-offline-result.json`, `/tmp/nlc-android-backup-offline.png`.

Al terminar se cierra el Metro nativo temporal y se retiran solo los reversos ADB
creados para esta prueba. La app QA queda abierta con sus datos y funciona con el
bundle integrado; el Android sigue vinculado y la web/NAS de demostración quedan
operativos. Se conserva Wi-Fi para el control ADB: esto no prueba modo avión real,
ni espacio insuficiente, copias grandes o interrupción durante un commit.

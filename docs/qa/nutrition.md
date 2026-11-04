# Nutrición local y MacroFactor

Fecha: 2026-11-03. Alcance: NLC, sin servidor nutricional y manteniendo el tema actual.

## Funcionalidad

Registro único por día, calorías, proteínas/carbohidratos/grasas en gramos, notas,
edición, cambio de fecha sin colisiones, borrado confirmado, calendario e historial.
Media/gráfico de siete fechas, excluyendo días sin registro e incluyendo ceros
explícitos. El historial y los alimentos se muestran por bloques.

MacroFactor: CSV de alimentos con `Date`, `Time`, `Food Name`, `Calories (kcal)`,
`Protein (g)`, `Carbs (g)` y `Fat (g)`, como el importador de JARVIS. También se
admiten totales diarios con Date y las cuatro columnas numéricas. Las columnas
adicionales se ignoran. ISO AAAA-MM-DD; HH:MM o HH:MM:SS; decimales con coma o punto
sin miles. Delimitadores coma, punto y coma y tabulador. UTF-8/BOM, CRLF y comillas
escapadas. Límite: 5 MB y 20.000 filas. No se admiten XLSX, ZIP ni CSV de entrenamiento.

Vista previa obligatoria antes de persistir. Por defecto se conservan fechas ya
registradas. Sustituir reemplaza el día completo, conserva notas y advierte de
registros manuales. No se acumulan exportaciones sobre totales existentes. Las
fechas ausentes del CSV permanecen; una reimportación idéntica es un no-op. Un
CSV de alimentos parcial representa únicamente los alimentos presentes para sus
fechas: conviene exportar días completos si se activa la sustitución.

El archivo se lee localmente y no se conserva como copia original. Android/iOS
usan SQLite; web normal usa AsyncStorage; demo web usa SQLite OPFS. No se añaden
sincronización, exportación/backup, objetivos ni micronutrientes.

## Pruebas automatizadas

`npm run test:nutrition`: 15 pruebas con SQLite real en disco y adaptador web.

- Números explícitos, ceros, tipos inválidos, coma decimal, fechas y futuro.
- CSV de alimentos, agregación, orden, BOM, CRLF, comillas y delimitadores.
- Totales diarios, filas inválidas con número de línea, límites por bytes/filas.
- Reapertura de SQLite conservando alimentos y totales; unicidad y cambio de fecha.
- Conservación por defecto de registros manuales; sustitución y notas.
- Reimportación idéntica sin nuevos registros ni cambios de timestamps.
- Exportación parcial, edición manual y eliminación del desglose previo.
- Rollback de lote, movimiento y borrado ante error de escritura; reintento.
- Escrituras concurrentes, cuota web y rechazo de almacenamiento corrupto.
- Media de siete fechas con huecos y DST.
- Migración desde esquema 10, conservando fotos, medicación, entrenamientos y peso.

Pasan TypeScript y las 43 pruebas anteriores: 58 pruebas en total. Exportación JS
Android correcta en `/tmp/nlc-nutrition-android-js-final`; log correspondiente en
`/tmp/nlc-nutrition-android-js-final.log`.

## Verificación de interfaz en local

- Demo incremental: 14 días ficticios, siete manuales y siete de alimentos CSV.
  No se han usado archivos personales ni se han restablecido datos de otros módulos.
- Formulario vacío rechazado. Guardado de 2345,5 kcal, 155,5 g de proteínas,
  280 g de carbohidratos y 65 g de grasas; notas y marca del calendario correctas.
- Selección real del archivo `scripts/fixtures/macrofactor-nutrition-demo.csv`:
  vista previa de dos fechas nuevas, importación de seis alimentos; totales
  esperados de 2000 y 2100 kcal, detalle por alimento e historial coherentes.
- Reimportación mediante pegado del mismo CSV: cero días nuevos, cero sustituidos
  y dos sin cambios, sin duplicar alimentos ni totales.
- Vista móvil de 390 px: sin desbordamiento horizontal, calendario y macros legibles;
  captura en `/tmp/nlc-nutrition-preview.jpg`.
- Pegado de CSV con calorías negativas rechazado en fila 2 sin cambios.
- CSV que coincide con un día manual: conservado por defecto; al activar sustituir
  aparece el aviso de un día manual. Cancelar conserva 2345,5 kcal.
- Recarga con el NAS ficticio detenido: registro manual conservado y editable,
  historial de 17 fechas y desglose importado disponibles. NAS restaurado después.

La recarga web requiere Metro para servir la aplicación; esta comprobación
confirma independencia del NAS, no un arranque de la web sin su servidor local.

## Integración nativa y límites

Se añade `expo-document-picker ~14.0.8`, compatible con Expo SDK 54. Carga diferida y
comprobación de módulo disponible: una APK anterior puede seguir abriendo NLC y
pegar CSV, pero su selector necesita una nueva compilación. No pide permisos
adicionales al iniciar ni incorpora iCloud, cuentas o API de MacroFactor.

Prebuild y APK debug arm64 correctos: `BUILD SUCCESSFUL` en 1m13s, con dos workers
y los límites CMake de la comprobación anterior. Log en
`/tmp/nlc-nutrition-android.log`; APK en
`android/app/build/outputs/apk/debug/app-debug.apk`. La APK debug requiere Metro.

Pendiente en un teléfono físico: selector Android, cancelación y URI de distintos
proveedores de archivos, pegado de un CSV grande, reinicio del proceso y modo avión.
La ruta iOS está implementada, sin compilación ni prueba física en esta sesión.

Actualización posterior: [backup de Salud](health-backup.md) incorpora exportación y
restauración de estos registros y fotos; la web normal migra sus valores a IndexedDB.

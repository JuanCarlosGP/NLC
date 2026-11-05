# Traslado a la carpeta general

Validación en Linux con un emulador Android API 34, ABI x86_64 y datos sintéticos. No se controla ni valida un teléfono físico ni iOS. La funcionalidad requiere APK 0.1.20 (22) por los nuevos métodos nativos.

## Comprobaciones automatizadas

- `npm run typecheck`.
- `npm run test:local-move`: 11 casos con transacción real con SQLite; conserva registros privados, metadatos, carátulas, favoritos, recientes, listas y orígenes multimedia. Actualiza progreso y favoritos de vídeo aunque el proveedor cambie un nombre. Comprueba rollback sin recibo, protección frente a configuración cambiada o identidades repetidas, reanudación sin aplicar dos veces y espera de espejos ya iniciados.
- Regresión de carpetas, exportación/importación, comportamiento local y apariencia.
- Compilación Android del módulo nativo.

La prueba nativa se ejecuta únicamente contra `app.nlc.player.dev` en un serial `emulator-NNNN`. Necesita una carpeta `NLC-General-QA` concedida desde el selector del emulador, o `--private` para limitarse a la caché privada:

```bash
python3 scripts/android-local-move-qa/run.py --serial emulator-5560 --size-mib 320
```

Crea un directorio exclusivo con UUID, utiliza archivos sintéticos y solo elimina sus propios fixtures al terminar. La prueba con **320 MiB** copia y verifica por bloques de 128 KiB con un límite de heap Java de **192 MiB**. SHA-256 del fixture: `abac14964502070f6c750eda26a585c57407910717296eca1c334d85abbcda49`.

Casos cubiertos: cancelación y continuación, nombres repetidos, copia parcial conservada como `.partial`, originales que cambian, rechazo de destino corrupto, preservación de los espejos anteriores de listas y tareas, carpeta de destino igual al origen y destino anidado. La retirada de originales exige un recibo real confirmado en la SQLite de la app; la prueba demuestra su rechazo antes de escribirlo y la recuperación de un cierre entre ese guardado y la limpieza. La pasada final con 16 MiB verifica 15 casos y añade originales sin lectura, marcadores editados y referencias compartidas que deben seguir en su ubicación. Las copias y los espejos se vacían al almacenamiento y el recibo usa SQLite con `synchronous=FULL` antes de retirar originales; no se ha simulado un corte físico de energía.

## Flujo de interfaz

Con modo avión activado y Wi-Fi desactivado, usando Metro por `adb reverse`:

1. Abrir **Ajustes → App → Trasladar archivos existentes** con Geist Pixel.
2. Elegir `NLC-Move-UI-QA` mediante el selector de Android. El destino ya contiene `Music/Artist/Album/Grouped.wav`.
3. Revisar los orígenes: tres archivos, aproximadamente 517 KB.
4. Cerrar la app antes de confirmar y abrirla otra vez. El traslado pendiente aparece automáticamente.
5. Confirmar. El destino conserva `Grouped.wav` y añade `Grouped (1).wav`, además del resto de archivos. La app muestra la finalización.
6. Inspeccionar la SQLite del emulador detenido: seis carpetas actualizadas, un recibo confirmado y ausencia del bloqueo activo. Las referencias de las tres pistas apuntan a su destino.

Los registros privados y fotos corporales no se trasladan ni se exportan automáticamente. El traslado de la carpeta de Salud afecta a los archivos que contiene (por ejemplo, ZIP de copias). Los datos privados se comprueban mediante los tests de transacción; no se usan credenciales reales ni cuentas bancarias reales en estas pruebas.

Los límites configurados de 50.000 archivos y 512 GiB son validaciones de entrada, no volúmenes probados físicamente. No se han simulado todas las averías posibles de tarjetas SD o proveedores de documentos.

# Entrenamientos: comprobación local

Fecha: 2026-11-03. Rama: `codex/health-weight`.

## Funcionalidad

- Entrada desde Salud; lista con búsqueda, sesiones en curso y terminadas.
- Crear por nombre y fecha, también desde un día del calendario mensual.
- Añadir, renombrar y quitar ejercicios; reutilizar ejercicios anteriores.
- Añadir o quitar series, kg opcionales, repeticiones, calentamiento y realización.
- Referencia de las series realizadas en la última sesión terminada anterior.
- Descanso configurable por ejercicio, automático al completar una serie y manual.
- Terminar, reabrir y repetir una sesión con identificadores nuevos y series pendientes.
- Guardado automático local; errores de escritura conservan el borrador pendiente
  en pantalla para reintentar. El borrador fallido no sobrevive a cerrar el proceso:
  se muestra como no guardado y se debe reintentar antes de salir.

## Verificación automatizada

`npm run test:training` ejecuta nueve pruebas con SQLite real y fallback web:

1. Validación de datos y volumen excluyendo calentamientos y series pendientes.
2. Repetición independiente, sin reutilizar identificadores ni marcas de realización.
3. Valores anteriores sin usar sesiones futuras, abiertas o la sesión actual.
4. Calendario con años bisiestos, cambios de hora y cambio de año.
5. Migración desde esquema 7 conservando peso, favoritos y patrimonio.
6. Reapertura de SQLite con sesiones completas y descanso; varias sesiones por día.
7. Escrituras solapadas y reintento del último borrador tras un error de disco.
8. Persistencia web, errores de cuota y JSON corrupto sin sobrescribir los datos.
9. Cuenta atrás por fecha límite absoluta, sin depender de ticks en primer plano.

También pasan `typecheck`, las cinco pruebas de peso y las seis de comportamiento
general. La exportación de JavaScript Android valida la resolución de los módulos
nativos; no equivale a probar una APK en un teléfono.

## Recorridos en la interfaz

- Demo añadida de forma incremental: tres sesiones ficticias (dos terminadas y una
  en curso), sin resetear los datos anteriores de NLC.
- Salud → Entrenamientos → sesión actual: valores anteriores y calentamientos.
- Guardar 65,5 kg y 9 repeticiones; completar la serie: volumen 589,5 kg.
- Recarga completa: valores, realización y descanso conservados; el descanso
  continúa con menos tiempo, sin empezar de nuevo.
- Calendario: noviembre de 2026 empieza en domingo; seleccionar un día vacío y crear.
- Con el NAS simulado detenido: crear sesión, añadir ejercicio, completar una serie
  de peso corporal, añadir nota y recargar conservando los cambios. NAS restaurado.
- Terminar sin series realizadas muestra un error. Terminar con una realizada
  conserva las pendientes y bloquea la edición.
- Repetir crea otra sesión de hoy con todas las series pendientes.

## Límites

- Los avisos de descanso son locales y opcionales en Android. El permiso solo se
  solicita al pulsar su botón; la web utiliza la cuenta atrás sin avisos de fondo.
- Falta comprobar en un teléfono físico el modo avión, el teclado nativo,
  la reanudación tras cierre del proceso y la entrega con pantalla bloqueada/Doze.
- No se han añadido sincronización externa ni WHOOP. Las analíticas locales de
  progresión se describen en [su informe de QA](training-analytics.md).

Actualización posterior: [backup de Salud](health-backup.md) incorpora exportación y
restauración de estos registros y fotos; la web normal migra sus valores a IndexedDB.

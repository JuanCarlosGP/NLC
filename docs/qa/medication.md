# Medicación y suplementos: comprobación local

Fecha: 2026-11-03. Rama de trabajo: `codex/health-weight`.

## Alcance implementado

- Salud → Medicación y suplementos (`/health/medication`). Pestañas Tomas,
  Calendario y Pautas, con los mismos colores, tipografía y hojas de NLC.
- Nombre, tipo, dosis en texto libre, instrucciones, hasta ocho horarios diarios
  o una toma sin hora fija; inicio/referencia y fin opcional.
- Frecuencias diaria, alterna, semanal y mensual. Las mensuales del 29–31 usan
  el último día de los meses cortos sin desplazar los meses posteriores.
- Registro independiente por elemento, fecha y horario: pendiente, tomada u omitida.
  Hora real y nota corregibles. Dejar pendiente deshace el estado registrado.
- El calendario muestra tomadas/total y distingue días completos y con omisiones.
  Permite consultar fechas futuras; no registrar tomas futuras.
- Cambiar o pausar una pauta crea una revisión desde hoy. El calendario anterior
  conserva su programación. Una toma ya registrada mantiene el nombre/dosis de su
  registro aunque cambie o se quite ese horario de la pauta actual.
- Android guarda en SQLite; el navegador normal en AsyncStorage. La demo usa su
  SQLite OPFS independiente. No hay sincronización ni envío al NAS o a Cursor.

## Verificación

`npm run test:medication`: once pruebas sobre validación, recurrencias, DST,
meses cortos, revisiones, estados, bloqueo de futuro, migración desde v8,
reapertura de SQLite, escrituras concurrentes, errores de disco/cuota, corrupción
del almacenamiento web y selección de próximos avisos.

Pasan también TypeScript y las veinte pruebas anteriores de peso, entrenamientos
y comportamiento. La exportación Android compila las nuevas rutas y los módulos
nativos de notificaciones; no sustituye una prueba de APK en un teléfono.

Recorridos realizados en el navegador:

- Cargar cuatro pautas ficticias y dos semanas de tomas sin resetear las demás áreas.
- Registrar una toma con el NAS simulado detenido y recargar conservando estado,
  hora y nota. Crear un suplemento semanal con dos horarios y recargarlo igualmente.
  Restaurar el servidor de prueba al terminar.
- Rechazar `24:00` conservando el nombre, dosis y frecuencia del formulario.
- Registrar una omisión, comprobar que no cuenta como tomada y dejarla pendiente.
- Corregir la hora real de una toma sin duplicarla.
- Editar una dosis: la toma registrada mantiene el texto anterior; la pendiente
  utiliza la nueva pauta.
- Pausar: desaparecen los horarios pendientes de hoy y se conserva la toma hecha.
  Reanudar y filtrar una pauta por su nombre.
- Consultar el calendario futuro: botones de registro desactivados.

## Avisos locales y límites

- Son opcionales y solo se pide permiso al pulsar Activar avisos locales.
- Se programan hasta 40 avisos de los próximos 30 días, en orden temporal.
  Se renuevan al abrir/volver a la app y al cambiar el día mientras está abierta.
  Una pauta sin hora no genera avisos; tomadas y omitidas se excluyen.
- Editar, pausar, registrar o desactivar avisos actualiza la programación local.
  Solo se cancelan notificaciones propias de medicación. Los avisos muestran un
  texto genérico y al tocarlos abren la fecha correspondiente del módulo.
- No hay servidor ni repetición cada hora hasta marcar la toma, como en JARVIS.
- Pendiente en Android físico: modo avión, permisos, entrega con pantalla bloqueada
  y Doze, apertura desde una notificación y renovación después de reiniciar.
- Si el dispositivo permanece sin abrir la app más allá del horizonte programado,
  no hay nuevos avisos. La UI explica esta limitación; las pautas y registros locales
  siguen disponibles.

Actualización posterior: [backup de Salud](health-backup.md) incorpora exportación y
restauración de estos registros y fotos; la web normal migra sus valores a IndexedDB.

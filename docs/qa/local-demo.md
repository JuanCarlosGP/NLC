# Escenario completo de prueba local

Fecha: 2026-11-03. Plataforma comprobada: navegador local con SQLite real (Expo/OPFS).
Datos sintéticos en `nlc-local-demo.db`, separados del catálogo normal del teléfono.

## Preparación

Se requieren Node 22.5+, Python 3 y ffmpeg. No se requieren claves externas.

```bash
npm run demo:nas
```

En otra terminal:

```bash
npm run demo:web
```

Abrir `http://127.0.0.1:8084/dev/demo`, pulsar **Cargar escenario de prueba** y
**Abrir aplicación con datos**. La segunda acción recarga los proveedores de la app.
La carga repetida conserva las modificaciones hechas durante QA.

## Datos iniciales

| Área | Escenario |
| --- | --- |
| Música | 2 artistas, 3 álbumes y 11 pistas |
| Podcasts | 2 programas y 5 episodios |
| Playlists | 2 listas locales, con pistas emparejadas al NAS simulado |
| Vídeo | 2 series, 3 episodios y 1 película; favorito y progreso inicial |
| Tareas | 4 proyectos (incluida Bandeja y uno archivado), 10 tareas, fechas y estados distintos |
| Recordatorios | 3 avisos: diario, semanal y único pausado |
| Patrimonio | 4 cuentas, 3 inversiones, 18 cotizaciones, 45 movimientos y 3 objetivos |
| Salud | 81 pesos a lo largo de 90 días, con notas y días sin registro |
| Entrenamientos | 3 sesiones iniciales: 2 terminadas, 1 abierta, ejercicios y calentamientos |
| Medicación y suplementos | 4 pautas ficticias y dos semanas de tomas, con omisiones y pendientes |
| Fotos de evolución | 2 fechas con 8 ilustraciones explícitamente etiquetadas como prueba |

Los saldos de referencia del escenario inicial son: Cuenta diaria 6.790 €, Ahorro
2.000 €, Cartera de prueba 150 € y Caja 175,50 €. Total líquido 9.115,50 €;
inversiones 2.660 €; patrimonio total 11.775,50 €. Los traspasos no cambian el total.
El objetivo de emergencia está al 40 % y la primera reserva está completada.

## Recorridos comprobados

- Carga y recarga completa: cantidades, saldos y registros se conservan.
- Salud: actualizar la fecha de hoy no duplica entradas; admite coma decimal;
  búsqueda por nota y persistencia de la corrección.
- Tareas: cambiar una tarea a Hecho la retira de las activas; filtros y búsquedas
  por proyecto/estado, archivado y borrado cubiertos con SQLite en las pruebas.
- Avisos: pausar uno conserva el estado después de recargar.
- Patrimonio: la UI coincide con los importes de referencia; las pruebas cubren
  crear/corregir/borrar gastos, traspasos y compra/reversión de inversiones.
- Objetivos: los completados muestran 100 %; un objetivo estancado no afirma que
  llegará a tiempo.
- Música: reproducción de un MP3 local, posición y duración reales, pausa,
  avance automático y regreso del dock tras cerrar el reproductor ampliado.
- Podcasts: catálogo separado de música; reproducción y pausa de un episodio.
- Playlists: aparecen las pistas emparejadas y su duración.
- Búsqueda musical: Linen devuelve su artista, álbum y cuatro pistas, sin podcasts.
- Vídeo: duración real de 40 segundos, inicio en el segundo guardado y conservación
  de progreso; el proxy devuelve `206` y exactamente los bytes solicitados.
- Descarga simulada: pasa por encolado/en curso/completado, muestra el log y escribe
  un archivo nuevo en `Music/Canciones`. La app indica que hay que refrescar.

Los cambios de QA quedan visibles: una tarea completada, un aviso pausado, una
nota de peso corregida, progreso de vídeo y una descarga local adicional.

## Defectos encontrados y corregidos

- SQLite web: el VFS de OPFS no admite WAL; la sesión usa diario DELETE.
- El simulador SQL en memoria no reproducía las consultas reales (joins,
  ordenaciones, filtros). El escenario usa SQLite real para validar comportamiento.
- El gráfico de patrimonio mostraba `common.today`; ahora usa la clave correcta.
- Un objetivo sin avance podía mostrar «Vas a tiempo»; se corrigió la evaluación.
- El proxy perdía Range/If-Range y devolvía el vídeo entero; conserva esas cabeceras
  y HEAD. Comprobado mediante petición real de 100 bytes y prueba de regresión.

## Límites

- El contenido multimedia es sintético. Las descargas son simuladas: no validan
  yt-dlp contra YouTube, Spotify u otros proveedores reales.
- El aviso de recordatorios en web aclara que la entrega se debe probar en Android.
- Quedan sin validar en un teléfono físico: notificaciones con pantalla bloqueada,
  almacenamiento offline nativo, permisos y servicios Android, bridge/TUI y OTA.
- Cursor, OAuth y otros servicios que requieren cuentas reales no se simulan como
  conectados ni se les envían estos datos.
- El chequeo global `assert:settings` conserva el hallazgo previo de cámara en un
  artefacto antiguo de `dist`; no procede del escenario ni de Salud.

## Pruebas automatizadas

```bash
npm run typecheck
npm run test:body-photos
npm run test:medication
npm run test:training
npm run test:health
npm run test:behavior
```

Las pruebas de salud cubren fechas, coma decimal, huecos y DST, migración desde v6,
reapertura de SQLite, conflictos de edición y errores del almacenamiento web.
Las de comportamiento usan SQLite real y cubren saldos, operaciones financieras,
estados/filtros de tareas, avisos y peticiones parciales del proxy.

El módulo de entrenamientos tiene su [informe de verificación](training.md). La carga
actual añade las sesiones de forma incremental sin restablecer las otras áreas.

La medicación tiene su [informe de verificación](medication.md). Los ejemplos se
añaden de forma incremental; las modificaciones de QA se mantienen.

Las fotos tienen su [informe de verificación](body-photos.md). La demo usa una base
IndexedDB independiente con ilustraciones, sin fotografías personales.

## Hito de analíticas de entrenamientos

La carga incremental añade doce sesiones ficticias de las últimas doce semanas,
con progresión de sentadilla, press de banca y series de flexiones sin kilos.
La marca `demo_training_analytics_v1` evita volver a insertarlas al repetir la carga.
Se conserva cualquier sesión anterior y sus ediciones. El recorrido y los valores
esperados están en [QA de analíticas](training-analytics.md).

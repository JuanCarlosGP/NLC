# Analíticas locales de entrenamientos

Fecha: 2026-11-03. Ruta: `/health/training/analytics`.

## Alcance y criterios

Selección/búsqueda de ejercicio, períodos de 30/90/365 días o todo el historial,
resumen, curvas de carga máxima, volumen, máximo de repeticiones y 1RM estimado,
volumen semanal, cinco marcas históricas y acceso a las sesiones de origen.

- Solo cuentan series realizadas, sin calentamientos, de sesiones terminadas cuya
  fecha es hasta hoy. Las sesiones en curso y futuras no aportan marcas.
- Nombres NFC, minúsculas y espacios normalizados agrupan el mismo ejercicio;
  no se fusionan modalidades, equipamientos ni nombres diferentes mediante alias.
- Dos sesiones del mismo día son puntos separados. Dos bloques del mismo ejercicio
  dentro de una sesión suman un único punto. Orden: fecha, inicio e ID estable.
- Volumen conocido = kg registrados × repeticiones, en kg·rep. Sin carga (null)
  no se inventa peso corporal; cero explícito es cero. Se muestran avisos de
  volumen parcial y número de series sin kilos.
- Marcas históricas de carga, volumen de una serie, volumen de una sesión,
  repeticiones y 1RM estimado. Cada una conserva su sesión y serie cuando procede.
  Los empates mantienen la primera aparición; la primera sesión es una referencia
  inicial. Los filtros no reinician marcas ni crean récords falsos.
- Epley se calcula con carga positiva y 1–10 repeticiones; una repetición devuelve
  la carga medida. Se etiqueta como estimación y no como un 1RM real.
- Comparaciones de carga/volumen/estimación usan el primer y último valor disponible
  del período; una base cero no produce un porcentaje infinito.
- El gráfico muestra hasta 24 puntos por ventana y respeta huecos de medición.
  Permite tocar puntos, usar Dato anterior/siguiente y abrir la sesión seleccionada.
  El historial ofrece los valores completos, en bloques de 20.
- Semanas de lunes a domingo: últimas ocho con sesiones dentro del período. No se
  añaden registros cero a semanas sin sesiones.

Los cálculos no escriben datos derivados ni requieren tablas nuevas, permisos,
servicios o dependencias nativas adicionales. Reabrir, corregir o eliminar una
sesión recalcula los resultados. Los cambios pendientes de guardado se señalan.

## Pruebas automatizadas

`npm run test:training-analytics`: 15 pruebas.

1. Exclusión de sesiones en curso/futuras, calentamientos y series pendientes.
2. Normalización de nombres sin fusionar equipamientos, con Unicode y bloques repetidos.
3. Varias sesiones por día y orden determinista.
4. Peso corporal y ceros sin estimar kilos o 1RM.
5. Volumen parcial de bloques con carga y sin carga.
6. Marcas con trazabilidad, empates y referencia inicial.
7. Redondeo consistente, evitando falsas marcas por coma flotante.
8. Epley, repeticiones altas y ausencia de carga positiva.
9. Límites inclusivos de fechas y DST, conservando la referencia histórica.
10. Semanas de lunes a domingo con varias sesiones y fechas filtradas.
11. Evolución negativa, valores ausentes y porcentaje con base cero.
12. Geometría finita con ceros, un punto, huecos y anchos pequeños.
13. Recalcular tras edición, reapertura y eliminación.
14. Lectura sin mutar sesiones, rechazo de duplicados y datos inválidos.
15. Reapertura de SQLite real en disco y de almacenamiento web con idénticos resultados.

Pasan también las 58 pruebas previas y TypeScript: 73 pruebas en total. El check
está integrado en CI. Exportación JS Android final correcta:
`/tmp/nlc-analytics-android-js-final`, log
`/tmp/nlc-analytics-android-js-final.log`.

## Recorridos verificados en navegador

- Demo incremental: doce sesiones ficticias añadidas a las cinco anteriores,
  conservando modificaciones y los demás módulos. Se incluyen series de peso
  corporal. Total local después de cargar: 17 sesiones, dos en curso y una futura.
- Salud → Entrenamientos → Ver analíticas: Sentadilla muestra 13 sesiones,
  38 series, 268 repeticiones y 17.085 kg·rep en 90 días.
- Progresión de carga 50 → 77,5 kg (+55%). Marca: 77,5 kg × 8 reps; mayor volumen
  de sesión 1.860 kg·rep; estimación máxima 98,17 kg.
- Filtro de 30 días: seis sesiones, 17 series, 124 reps y 8.797,5 kg·rep. La marca
  de ocho repeticiones conserva su fecha del 31 de agosto.
- Curva de volumen: 1.417,5 → 1.860 kg·rep en 30 días. Curva 1RM: 60 → 98,17 kg
  en 90 días, con explicación visible del cálculo.
- Búsqueda y selección de Flexiones: repeticiones conservadas, volumen/carga/1RM
  desconocidos, con mensajes explicativos y sin marcas de kilos inventadas.
- Selección con Dato anterior y tocando el primer punto del SVG. Abrir sesión
  llega al registro del 17 de agosto con tres series de 50 kg × 6 reps.
- Progresión de Sentadilla desde el ejercicio abre su analítica. Un ejercicio sin
  historial terminado muestra su propio estado vacío y permite elegir otro.
- La elección de ejercicio actualiza su parámetro de URL y se conserva al recargar.
- NAS ficticio detenido: recarga completa conserva resumen, curvas y marcas locales.
  NAS restaurado después y comprobado con HTTP 200.
- Ancho móvil aproximado de 390 px: no hay desbordamiento horizontal; las opciones
  se ajustan en filas. Capturas en `/tmp/nlc-training-analytics-overview.jpg` y
  `/tmp/nlc-training-analytics-preview.jpg`.

## Límites de la verificación

La web necesita su servidor local para arrancar; la prueba con NAS detenido
verifica independencia de ese servicio. La aplicación nativa calcula a partir de
SQLite, pero queda por comprobar en un teléfono físico el modo avión, la fluidez
con un historial grande y los puntos táctiles. No se ha instalado una APK ni
publicado una actualización. Este hito no requiere módulos nativos nuevos.

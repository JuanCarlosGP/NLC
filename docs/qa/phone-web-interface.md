# QA · Interfaz web desde la APK

Issue: [#16](https://github.com/JuanCarlosGP/NLC/issues/16). Rama: `codex/phone-web-interface`. Primera APK: 0.1.21 (23). Corrección nativa de vídeo en segundo plano: 0.1.22 (24).

## Entorno y aislamiento

Linux, navegador real y emulador Android API 34 x86_64. Solo fixtures sintéticas en la variante `app.nlc.player.dev`, dentro de `NLC-Move-UI-QA`. La instalación firmada anterior conserva sus datos para la comprobación de actualización. No se utilizan dispositivos físicos ni iOS. El test histórico Rust `live_phone_cover_bytes` queda excluido por defecto.

El acceso HTTP fuera de localhost se comprueba con un puente de LAN hacia el emulador. Las pruebas de API usan la SQLite real de la APK; las de escritorio utilizan la exportación `single` empaquetada, sin Metro para el navegador.

## Matriz de capacidades

| Área | Acciones remotas | Exclusivo del móvil |
|---|---|---|
| Inicio y búsqueda | Navegar por servicios, buscar y abrir registros | — |
| Música y Podcasts | Catálogo, listas, favoritos, metadatos, descargas, cola y reproducción; borrado/sustitución con confirmación | Selección y traslado de carpetas |
| Vídeo | Películas/series, favoritos, historial, progreso, reproducción y búsqueda por posición | Selección de carpetas |
| Tareas | Proyectos, tareas, estados y recordatorios | Conceder permisos de avisos |
| Patrimonio | Cuentas, activos, cotizaciones, movimientos, objetivos y Mercury | Autorizaciones que requieran el dispositivo |
| Salud | Peso, entrenamientos, analíticas, medicación, nutrición, fotos y comparación | Cámara y permisos del sistema |
| Copias | ZIP por servicio con multimedia, formato histórico de Salud y recuperación, CSV MacroFactor y subidas por bloques | Configurar destinos locales |
| Ajustes | NAS compatible, integraciones, chat, tema, idioma y presentación | Carpetas, batería, onboarding, instalación y servidores |
| Escritorio | Interfaz web y TUI sobre el backend compartido | Activar/desactivar servidores |

## Contratos y coherencia

`npm run test:phone-backend` usa SQLite en disco: commit de datos/versiones/recibo en una transacción, validaciones, reintentos tras reapertura, conflictos concurrentes, escrituras móviles, exclusiones durante restauraciones/traslados, comandos no registrados, borradores, metadatos de reintentos sin secretos y preparación/confirmación de reproducción.

La API real verifica bootstrap/paquete, SQL no expuesto, controles del teléfono rechazados, carpetas/fuentes inalterables por peticiones construidas, credenciales redactadas, conflictos e idempotencia, archivos `content://` con HEAD/rangos/sufijos/416 y peticiones simultáneas con SSE activo.

Las restauraciones tienen un recibo SQLite. Los archivos importados mantienen un marcador hasta el commit; la recuperación conserva los confirmados y retira únicamente destinos nuevos de importaciones fallidas. Los IDs sustituidos dejan de indexarse y de incluirse otra vez en la copia, conservando físicamente los archivos anteriores.

## Evidencias de la implementación

- Los 15 grupos Node pasan. Backend: 24 pruebas sobre SQLite real, incluido rollback con productores en segundo plano y reconexión sin repetir escrituras. Copias de servicios: 23 pruebas. Rust: 14 pruebas; una prueba histórica con dispositivo físico queda excluida.
- API de los seis servicios: catálogo de música/podcasts, listas, tareas, finanzas, nutrición, tomas, vídeo/rangos, fotos y estado de credenciales comprobados en la APK del emulador.
- Navegador en origen HTTP de LAN: entrenamiento de 40 kg × 8, descanso, finalización y analíticas de 320 kg·rep; comparación de fotos servidas desde Android; importación MacroFactor por archivo con 1000 kcal, 60 g de proteínas, 115 g de carbohidratos y 30 g de grasas.
- ZIP de 339.974.445 bytes: exportación y descarga por streaming, subida por bloques, reintento del mismo bloque, cancelación, falta de espacio e integridad verificados. Restaurar dos veces el mismo trabajo no duplica registros. Una segunda importación independiente conserva las fuentes/carpetas y recalcula también la cola multimedia.
- Audio y vídeo activos transferidos móvil → navegador → móvil, conservando cola y posición. La TUI reproduce su cola de dos pistas sobre la misma sesión. Borrado y sustitución probados con archivos desechables de un NAS/downloader simulado; las peticiones sin confirmación se rechazan.
- Actividad Android retirada, pantalla apagada y Doze forzado: lecturas y escrituras funcionan con la excepción de batería. Internet está bloqueado en el emulador y se usa su conexión TCP virtual, no solo el túnel ADB.
- Muerte del proceso: el servicio sticky vuelve a arrancar; Headless JS atiende peticiones sin pantalla y recupera la cola con sus rutas nuevas. El tema del navegador cambia sin modificar Geist Pixel en el teléfono.
- Cola de 10.000 pistas (petición de 1.910.216 bytes): validación por lotes, persistencia SQLite y recuperación tras muerte del proceso. Las actualizaciones de posición omiten la cola cuando no ha cambiado.
- Al recuperar una sesión tras recargar el backend se avisa también a los clientes remotos. La cola y la posición se mantienen pausadas; la prueba comprueba que el navegador reciba el nuevo estado en lugar de conservar un propietario anterior.
- Corte del puente LAN durante una edición: se conserva la nota, aparece el error de guardado y el reintento tras reconectar guarda un único registro. El cambio de paquete pide recarga conservando el borrador.
- SSE a un cliente que acepta gzip: entrega sin compresión, evento de escritura recibido en 176 ms. La compresión de NanoHTTPD retenía mensajes pequeños hasta cerrar el flujo; el servidor la excluye para `text/event-stream`.
- Acción Detener pulsada en la notificación real: cierra HTTP, persiste el interruptor apagado y libera el wake lock. Con un proceso de QA ocupando 7682, el intento desde Ajustes muestra «El puerto 7682 está ocupado» y permanece apagado.
- Reproducción sin Activity: el abandono del navegador genera el cambio de estado a los 12–14 s sin consultas periódicas; audio avanza de 25 a 29,87 s y vídeo de 10 a 15,11 s. Expo Video 3.0.16 exigía `throwingActivity` para obtener un contexto de aplicación. El plugin usa el contexto React y fuerza `expo-video` desde fuentes; un AAR precompilado no incluiría la corrección. Se aplica tanto en postinstall como en prebuild y falla si cambia el constructor esperado.
- Reinicio completo del emulador: cambia el identificador de arranque, el receptor restaura el paquete verificado y Headless JS responde sin Activity. La actualización firmada desde 0.1.20 (22) a 0.1.22 (24) conserva las trece tablas previas de Salud y Finanzas byte a byte en sus registros, las carpetas y modos de los seis servicios y la caché Mercury de tres cuentas y 21 movimientos. `PRAGMA integrity_check` devuelve `ok`.

Las integraciones reales de WHOOP y Mercury no utilizan credenciales en QA; se comprueban el contrato, los estados y la persistencia con datos sintéticos.

## APK oficial comprobada

La APK **0.1.22 (24)** se publica mediante [Release APK](https://github.com/JuanCarlosGP/NLC/actions/runs/42035832374), tras las PR [#17](https://github.com/JuanCarlosGP/NLC/pull/17) y [#18](https://github.com/JuanCarlosGP/NLC/pull/18). SHA-256: `ff738b192137c2fe2a7e0fe0bc0bd1781fc26b02d702976a1ebfdaeeaace3da6`. Conserva el certificado de firma de la versión anterior y contiene las cuatro ABI, Geist Pixel y los 42 archivos verificados del paquete web `18a1be523b4bb77d6afecdcd736cbd05f8ee94122397e4393a027cf7086a5a00`.

La instalación sobre 0.1.20 empieza con el servidor web apagado. Al activarlo desde Ajustes sirve los seis servicios, mantiene los controles del móvil desactivados en el navegador y rechaza también sus comandos. Funciona con los assets incluidos, sin Metro y con Internet bloqueado. El vídeo de la APK firmada, sin Activity, avanza de 10 a 14,22 s y sirve rangos HTTP correctamente. La comprobación de fuentes y datos se realiza antes y después de la actualización; solo se añade un vídeo sintético de QA dentro del destino ya configurado.

La primera APK 0.1.21 incorporó la interfaz, pero se detectó después que su reproductor pedía una Activity al iniciar vídeo. La entrega validada es 0.1.22, que incluye la corrección compilada desde fuentes.

## Construcción

`npm run web:package` genera un ZIP con protocolo, identificador y SHA-256 de cada archivo. Android verifica el paquete antes de activarlo. El perfil web remoto se aplica únicamente al proceso hijo de exportación; el perfil nativo conserva su configuración.

Las compilaciones oficiales y las publicaciones OTA ejecutan esta generación. Un checkout sin asset lo prepara con `npm start` o `npm run android`. El APK incluye NanoHTTPD y los servicios foreground `connectedDevice`; el backend se registra como Headless JS desde `index.ts`.

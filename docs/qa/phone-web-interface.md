# QA · Interfaz web desde la APK

Issue: [#16](https://github.com/JuanCarlosGP/NLC/issues/16). Rama: `codex/phone-web-interface`. APK prevista: 0.1.21 (23).

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

- Los 15 grupos Node pasan. Backend: 21 pruebas sobre SQLite real, incluido rollback con productores en segundo plano y reconexión sin repetir escrituras. Copias de servicios: 23 pruebas. Rust: 14 pruebas; una prueba histórica con dispositivo físico queda excluida.
- API de los seis servicios: catálogo de música/podcasts, listas, tareas, finanzas, nutrición, tomas, vídeo/rangos, fotos y estado de credenciales comprobados en la APK del emulador.
- Navegador en origen HTTP de LAN: entrenamiento de 40 kg × 8, descanso, finalización y analíticas de 320 kg·rep; comparación de fotos servidas desde Android; importación MacroFactor por archivo con 1000 kcal, 60 g de proteínas, 115 g de carbohidratos y 30 g de grasas.
- ZIP de 339.974.445 bytes: exportación y descarga por streaming, subida por bloques, reintento del mismo bloque, cancelación, falta de espacio e integridad verificados. Restaurar dos veces el mismo trabajo no duplica registros. Una segunda importación independiente conserva las fuentes/carpetas y recalcula también la cola multimedia.
- Audio activo transferido móvil → navegador → móvil, conservando dos pistas y posición. Borrado y sustitución probados con archivos desechables de un NAS/downloader simulado; las peticiones sin confirmación se rechazan.
- Actividad Android retirada, pantalla apagada y Doze forzado: lecturas y escrituras funcionan con la excepción de batería. Internet está bloqueado en el emulador y se usa su conexión TCP virtual, no solo el túnel ADB.
- Muerte del proceso: el servicio sticky vuelve a arrancar; Headless JS atiende peticiones sin pantalla y recupera la cola con sus rutas nuevas. El tema del navegador cambia sin modificar Geist Pixel en el teléfono.
- Pendiente en la revisión final: vídeo y TUI activos, corte de red con borrador, reinicio completo y comprobación de la APK firmada sobre los datos anteriores. Estas comprobaciones se anotarán antes del cierre.

Las integraciones reales de WHOOP y Mercury no utilizan credenciales en QA; se comprueban el contrato, los estados y la persistencia con datos sintéticos.

## Construcción

`npm run web:package` genera un ZIP con protocolo, identificador y SHA-256 de cada archivo. Android verifica el paquete antes de activarlo. El perfil web remoto se aplica únicamente al proceso hijo de exportación; el perfil nativo conserva su configuración.

Las compilaciones oficiales y las publicaciones OTA ejecutan esta generación. Un checkout sin asset lo prepara con `npm start` o `npm run android`. El APK incluye NanoHTTPD y los servicios foreground `connectedDevice`; el backend se registra como Headless JS desde `index.ts`.

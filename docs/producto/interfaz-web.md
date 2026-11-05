# Interfaz en el navegador

Desde **Ajustes → Escritorio**, en cualquiera de los seis servicios, «Interfaz en el navegador» activa un servidor compartido. Está apagado inicialmente. La dirección es `http://<IP-del-móvil>:7682`; la TUI conserva el puerto 7681. Si el puerto está ocupado, el interruptor queda apagado y muestra el error.

Mientras esté activo, cualquier equipo de la LAN puede acceder sin contraseña ni vinculación. El teléfono conserva la biblioteca, las credenciales y todos los datos. La notificación permite detenerlo; el ajuste de batería de la APK permite mantenerlo disponible en segundo plano. Una detención forzada requiere volver a abrir NLC.

## Servicios y pantallas

Se reutilizan Inicio, Biblioteca, búsqueda, Mensajes, Ajustes y las rutas de los seis servicios: Música, Podcasts, Vídeo, Tareas, Patrimonio y Salud. Classic y Geist Pixel conservan sus estilos y densidad compacta. Cada navegador conserva su idioma, tema y presentación; la primera visita toma los valores del teléfono.

La selección «Reproducir en: este navegador / móvil» conserva la cola y posición. El destino anterior se pausa cuando el nuevo está preparado. Si el formato no es compatible con el navegador, se ofrece reproducir en el móvil. No hay transcodificación.

Las fotos, CSV de MacroFactor y copias se seleccionan en el ordenador y se transfieren al teléfono por bloques. Las copias de servicios incluyen multimedia; Salud conserva además su formato anterior y la copia de recuperación. Las restauraciones desde el navegador mantienen las carpetas y fuentes configuradas en el teléfono. Si falta un destino multimedia, debe elegirse en la APK.

Eliminar una pista o sustituir su audio requiere confirmación. La sustitución muestra progreso y permite cancelar durante la descarga; al comenzar a guardar el archivo ya debe terminar esa operación.

## Controles del teléfono

Seleccionar o cambiar carpetas locales, trasladar la carpeta general, conceder permisos, usar la cámara nativa, instalar la APK, gestionar batería, repetir el onboarding y cambiar los servidores aparecen desactivados con «Se configura en el móvil». La API aplica estas restricciones también a peticiones manuales.

Las claves guardadas no se devuelven al navegador. Los campos indican su estado y dejarlos vacíos conserva el valor guardado. Las autorizaciones que necesitan interacción en el teléfono siguen realizándose en la APK.

Al perder la conexión se conservan los borradores y no se confirma un guardado sin respuesta del teléfono. Si otro editor modifica el registro, se pide recargar y se puede consultar el borrador anterior. Una pestaña con un paquete antiguo pide recargar sin perder sus campos.

## Actualizaciones

La interfaz se incorporó en la APK **0.1.21 (23)**. Usa **0.1.22 (24)** para iniciar vídeo en el teléfono también con NLC cerrada. Las OTA compatibles incluyen también el paquete web. La interfaz, fuentes y recursos se sirven desde el teléfono; no dependen de CDN.

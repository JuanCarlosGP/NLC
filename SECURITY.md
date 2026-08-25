# Seguridad

Si encuentras una vulnerabilidad en NLC, **no** abras un issue público.

## Cómo reportar

Usa los [avisos de seguridad privados de GitHub](https://github.com/JuanCarlosGP/NLC/security/advisories/new).

Incluye, si puedes:

- Versión de la APK o commit
- Pasos para reproducirlo
- Impacto (acceso a datos del NAS, tokens, crash remoto, etc.)

Responderé lo antes posible y coordinaré un arreglo antes de cualquier divulgación.

## Alcance

NLC habla con un NAS en la LAN (WebDAV / Navidrome), un downloader yt-dlp opcional y, en la APK oficial, notificaciones Expo/FCM.

Fuera de alcance típico:

- Credenciales o servicios de **tu** NAS mal configurados
- Spotify, YouTube u otros terceros
- Dispositivos que no están en la misma red que el servidor de medios

## Secretos de este repositorio

No commits:

- `.env`, `.env.local`, `.secrets/`
- contraseñas del NAS o tokens de descarga
- cuentas de servicio de Firebase / FCM (`*-firebase-adminsdk-*.json`)

`google-services.json` es configuración de cliente de la APK oficial (paquete `app.nlc.player`). Si haces fork, usa tu propio proyecto de Firebase o quita las notificaciones push.

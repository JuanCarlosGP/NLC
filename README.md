# SND

Reproductor Android personal para **tu** biblioteca de música en un NAS de la LAN. No es un clon de Spotify: no hay cuentas cloud, radio, amigos ni Play Store.

El teléfono **no monta SMB**. El NAS sirve la música por HTTP (Navidrome / OpenSubsonic). Hasta que tengas la biblioteca en el NAS, la app usa una **biblioteca de ejemplo** con streams públicos para poder instalar y probar el APK.

Host por defecto: `192.168.1.106:4533`.

## Requisitos

- Node 20+
- Cuenta Expo (solo para el build EAS del APK)
- Teléfono Android en la misma red que el NAS, cuando pases de mock a Navidrome

## Desarrollo (Windows / PowerShell)

```powershell
cd e:\dev\sptfy
npm install
npx expo start
```

La fuente por defecto es **Biblioteca de ejemplo**. En Ajustes puedes cambiar a Navidrome cuando esté instalado.

## APK interno (no AAB, no Play Store)

La primera vez, crea el proyecto EAS (te pedirá login):

```powershell
npx eas-cli login
npx eas-cli init
```

Luego:

```powershell
npx eas-cli build --platform android --profile preview
```

El perfil `preview` en `eas.json` genera un **APK** de distribución interna. Instálalo en el teléfono (origen desconocido).

## Navidrome en el NAS (cuando tengas la música)

1. Instala Navidrome en el NAS (Docker es lo más simple). Ejemplo:

```yaml
services:
  navidrome:
    image: deluan/navidrome:latest
    ports:
      - "4533:4533"
    environment:
      ND_SCANSCHEDULE: 1h
      ND_LOGLEVEL: info
    volumes:
      - /ruta/datos/navidrome:/data
      - /ruta/musica:/music:ro
```

2. Abre `http://192.168.1.106:4533`, crea el usuario admin y espera al primer scan.
3. En SND → Ajustes: fuente **Navidrome**, host `192.168.1.106`, puerto `4533`, usuario y contraseña. **Probar conexión** y **Guardar**.

Si el ping falla: el teléfono y el NAS deben estar en la misma LAN; Navidrome debe escuchar en `0.0.0.0:4533` (no solo localhost); HTTP en claro está permitido en la app para rangos LAN.

## Audio

- Streaming HTTP, sin descargar la librería al móvil (MVP).
- Reproductor: `expo-audio` (Expo 54). Cubre foreground, y en un development/EAS build puede mostrar controles de lock screen con `setActiveForLockScreen`.
- Formatos: mp3, m4a, ogg suelen ir bien. **FLAC** depende del decodificador del dispositivo (ExoPlayer). Si un teléfono no lo reproduce, usa calidad 320 kbps en Ajustes (transcode en Navidrome) o convierte ese álbum; no bloquea el resto de la app.
- Descargas offline: toggle deshabilitado, «próximamente».

## Stack

Expo SDK 54, React Native 0.81.5, React 19.1, TypeScript, expo-router (`src/app`), New Architecture. Misma línea que AppDomus, sin Supabase / OTA / portal.

## Estructura

```
src/app/          rutas
src/components/   UI
src/hooks/        un hook por pantalla
src/lib/nas/      MusicSource (mock + OpenSubsonic)
src/lib/player/   cola y reproducción
src/lib/settings/ host NAS + SecureStore
```

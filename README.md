# NLC

Reproductor Android de código abierto para **tu** biblioteca en un NAS de la LAN (música, podcasts, vídeo). No es un clon de Spotify: no hay cuentas cloud, radio, amigos ni Play Store.

**[Descargar la última APK](https://github.com/JuanCarlosGP/NLC/releases/latest/download/NLC.apk)** · [código en GitHub](https://github.com/JuanCarlosGP/NLC)

En Releases **solo vive esa APK**. Cada rebuild nativo la sustituye; el historial de código sigue en `main`.

## OTA vs APK

| Cambio | Cómo sale |
| --- | --- |
| JS / pantallas / estilos | `npm run update:production` (OTA + aviso en el teléfono) |
| Nativo / sistema (plugins, permisos, Expo SDK, notificaciones, `app.config` nativo) | `npm run apk:release` → GitHub Releases (una APK, la última) |

Una OTA **no** puede añadir módulos nativos. Si hace falta APK nueva, el teléfono recibe un aviso distinto y abre la descarga de GitHub.

## Requisitos

- Node 20+
- Cuenta Expo (solo para el build EAS del APK)
- Teléfono Android en la misma red que el NAS, cuando pases de mock a Navidrome

## Desarrollo (Windows / PowerShell)

```powershell
cd e:\dev\SND
npm install
npx expo start
```

La fuente por defecto es **Biblioteca de ejemplo**. En Ajustes puedes cambiar a Navidrome cuando esté instalado.

## APK (GitHub, solo la última)

Perfil EAS `github`: APK interna, canal `production`.

En el PC (con `gh` y `eas` logueados):

```powershell
$env:NLC_NAS_PASSWORD = "Viewer"
npm run apk:release
```

Por defecto sube el patch (`0.1.0` → `0.1.1`) y el `versionCode`. También: `node scripts/release-apk.mjs minor`.

En GitHub Actions: **Actions → Release APK → Run workflow**. Secret necesario: `EXPO_TOKEN` ([expo.dev](https://expo.dev/accounts/[account]/settings/access-tokens)).

La release fija `apk` se reescribe: un solo archivo `NLC.apk`.

## OTA (JS, sin reinstalar)

```powershell
$env:NLC_NAS_PASSWORD = "Viewer"
npm run update:production
```

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
3. En NLC → Ajustes: fuente **Navidrome**, host `192.168.1.106`, puerto `4533`, usuario y contraseña. **Probar conexión** y **Guardar**.

Si el ping falla: el teléfono y el NAS deben estar en la misma LAN; Navidrome debe escuchar en `0.0.0.0:4533` (no solo localhost); HTTP en claro está permitido en la app para rangos LAN.

## Audio

- Streaming HTTP, sin descargar la librería al móvil (MVP).
- Reproductor: `expo-audio` (Expo 54). Cubre foreground, y en un development/EAS build puede mostrar controles de lock screen con `setActiveForLockScreen`.
- Formatos: mp3, m4a, ogg suelen ir bien. **FLAC** depende del decodificador del dispositivo (ExoPlayer). Si un teléfono no lo reproduce, usa calidad 320 kbps en Ajustes (transcode en Navidrome) o convierte ese álbum; no bloquea el resto de la app.
- **Podcasts / yt-dlp:** el APK no embebe yt-dlp. Corre en Docker en el NAS (ver [`nas/podcast-downloader/README.md`](nas/podcast-downloader/README.md)). En NLC → Ajustes → **Podcasts (yt-dlp)** configuras host `192.168.1.106`, puerto `8091` y el mismo token que `AUTH_TOKEN` del compose. Las descargas van a `Music/Podcasts`; refresca la biblioteca para reproducirlas. No descarga audio de Spotify.

## Stack

Expo SDK 54, React Native 0.81.5, React 19.1, TypeScript, expo-router (`src/app`), New Architecture. Licencia MIT.

## Estructura

```
src/app/          rutas
src/components/   UI
src/hooks/        un hook por pantalla
src/lib/nas/      MusicSource (mock + OpenSubsonic + WebDAV)
src/lib/podcasts/ cliente del downloader yt-dlp en el NAS
src/lib/player/   cola y reproducción
src/lib/settings/ host NAS + SecureStore
nas/podcast-downloader/  Docker + API yt-dlp para Ugreen
```

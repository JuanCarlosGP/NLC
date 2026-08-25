# NLC

Reproductor Android de **código fuente público** para la biblioteca que ya tienes en un NAS de la LAN: música, podcasts, vídeo, y también foco y patrimonio. Sin cuenta en la nube, sin radio social y sin tienda.

[Descargar la última APK](https://github.com/JuanCarlosGP/NLC/releases/download/apk/NLC.apk) · [Releases](https://github.com/JuanCarlosGP/NLC/releases) · [Contribuir](CONTRIBUTING.md) · [Licencia](LICENSE)

![Licencia](https://img.shields.io/badge/licencia-MIT%20%2B%20Commons%20Clause-yellow)
![Plataforma](https://img.shields.io/badge/plataforma-Android-3DDC84)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)

NLC no es un clon de Spotify. Importa metadatos de playlists y las empareja con **tus** ficheros. No reproduce el catálogo de Spotify ni descarga audio con DRM.

## Qué puedes hacer

- Reproducir música desde WebDAV (carpeta compartida del NAS), Navidrome / OpenSubsonic, carpeta local o una biblioteca de ejemplo
- Podcasts y descargas yt-dlp en el NAS ([servicio Docker](nas/podcast-downloader/README.md))
- Vídeo por WebDAV (p. ej. series organizadas por carpeta)
- Importar playlists de Spotify y matchearlas contra la biblioteca local
- Foco: bandeja, proyectos, recordatorios
- Patrimonio: cuentas, movimientos y objetivos
- Actualizaciones JS por OTA; la APK nativa se publica en GitHub Releases

## Descarga

La release `apk` guarda **una sola APK**, la última. Cada rebuild nativo la sustituye. El historial de código sigue en `main`.

| Tipo de cambio | Cómo llega al teléfono |
| --- | --- |
| JS, pantallas, estilos | Push a `main`: el CI publica la OTA y avisa a la APK |
| Nativo (plugins, permisos, Expo SDK, `app.config`) | `npm run apk:release` o **Actions → Release APK** |

Una OTA no puede añadir módulos nativos. Si hace falta APK nueva, el aviso abre la descarga de GitHub.

## Requisitos

- Node.js 20 o superior
- Teléfono Android en la misma red que el NAS cuando dejes la biblioteca de ejemplo
- Cuenta Expo solo si vas a construir la APK con EAS

## Desarrollo

```bash
git clone https://github.com/JuanCarlosGP/NLC.git
cd NLC
npm install
npx expo start
```

En Windows / PowerShell el flujo es el mismo. La fuente por defecto del repo apunta a una carpeta compartida típica; en Ajustes puedes cambiar a Navidrome, carpeta local o **Biblioteca de ejemplo**.

```bash
npm run typecheck
```

## NAS y Navidrome

1. Instala Navidrome en el NAS (Docker es lo más simple):

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

2. Abre `http://<IP-DEL-NAS>:4533`, crea el usuario admin y espera al primer scan.
3. En NLC → Ajustes: fuente **Navidrome**, host, puerto `4533`, usuario y contraseña. **Probar conexión** y **Guardar**.

Si el ping falla: el teléfono y el NAS deben estar en la misma LAN; Navidrome debe escuchar en `0.0.0.0:4533` (no solo localhost). HTTP en claro está permitido en la app para uso en LAN.

### Audio

- Streaming HTTP; el MVP no descarga la librería entera al móvil
- Reproductor: `expo-audio` (Expo 54). En un build EAS puede mostrar controles de lock screen
- mp3, m4a y ogg suelen ir bien. **FLAC** depende del decodificador del dispositivo. Si un teléfono no lo reproduce, usa transcode 320 kbps en Ajustes (Navidrome) o convierte ese álbum

### Podcasts (yt-dlp)

El APK no embebe yt-dlp. Corre en Docker en el NAS: [`nas/podcast-downloader/README.md`](nas/podcast-downloader/README.md).

En NLC → Ajustes → Descargas: host del NAS, puerto `8091` y el mismo token que `AUTH_TOKEN` del compose. Las descargas van a `Music/Podcasts` o `Music/Canciones`. No descarga audio de Spotify.

## APK y OTA (maintainers)

Perfil EAS `github`: APK interna, canal `production`. Credenciales del NAS y tokens de push van en el entorno o en `.env` / `.secrets/` (gitignored). Hay un [`.env.example`](.env.example).

```bash
npm run apk:release
```

Por defecto sube el patch (`0.1.0` → `0.1.1`) y el `versionCode`. También: `node scripts/release-apk.mjs minor`.

En GitHub Actions: **Actions → Release APK → Run workflow**. Secret: `EXPO_TOKEN` ([token de Expo](https://expo.dev/settings/access-tokens)).

Un push a `main` que pasa el typecheck publica la OTA en el canal `production` y manda el aviso. Secretos: `EXPO_TOKEN` (obligatorio) y `EXPO_PUSH_TOKENS` (el token Expo del teléfono). GitHub no alcanza el NAS de la LAN, así que el aviso no puede leer `nlc-push-tokens.json` ahí.

OTA a mano, si hace falta:

```bash
npm run update:production
```

## Stack

Expo SDK 54, React Native 0.81.5, React 19.1, TypeScript (`strict`), expo-router (`src/app`), New Architecture.

## Estructura

```
src/app/                    rutas
src/components/             UI
src/hooks/                  un hook por pantalla
src/lib/nas/                fuentes: mock, OpenSubsonic, WebDAV
src/lib/podcasts/           cliente yt-dlp del NAS
src/lib/player/             cola y reproducción
src/lib/settings/           host NAS + SecureStore
src/lib/productivity/       foco / tareas
src/lib/wealth/             patrimonio
nas/podcast-downloader/     Docker + API yt-dlp
docs/producto/              qué hace cada pantalla y flujo
docs/qa/                    cobertura y hallazgos del equipo
```

## Documentación

| Doc | Contenido |
| --- | --- |
| [docs/README.md](docs/README.md) | Índice del producto y QA |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Cómo preparar el entorno y abrir un PR |
| [SECURITY.md](SECURITY.md) | Cómo reportar vulnerabilidades |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Normas de la comunidad |

## Licencia

El código se publica para **uso personal, educativo y no comercial**.

La base es la licencia MIT, con la [Commons Clause](https://commonsclause.com/): puedes usar, copiar, modificar y compartir NLC; **no puedes venderlo** ni ofrecer un producto o servicio de pago cuyo valor salga, de forma sustancial, de NLC.

Eso incluye, entre otras cosas, no publicar NLC (ni un fork casi idéntico) en tiendas a cambio de dinero, ni venderlo como SaaS.

Detalles en [`LICENSE`](LICENSE) y [`NOTICE`](NOTICE). Para uso comercial, contacta con [JuanCarlosGP](https://github.com/JuanCarlosGP).

NLC no está afiliado a Spotify, Navidrome, Expo ni a ningún fabricante de NAS.

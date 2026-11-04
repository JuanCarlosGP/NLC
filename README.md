# NLC

Aplicación Android de **código fuente público** para música, audio/podcasts, vídeo, tareas, finanzas y salud. Puedes usarla completamente en el teléfono o conectar un NAS de la LAN. Sin cuenta en la nube, sin radio social y sin tienda.

[Descargar la última APK](https://github.com/JuanCarlosGP/NLC/releases/download/apk/NLC.apk) · [Releases](https://github.com/JuanCarlosGP/NLC/releases) · [Contribuir](CONTRIBUTING.md) · [Licencia](LICENSE)

![Licencia](https://img.shields.io/badge/licencia-MIT%20%2B%20Commons%20Clause-yellow)
![Plataforma](https://img.shields.io/badge/plataforma-Android-3DDC84)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)

NLC no es un clon de Spotify. Importa metadatos de playlists y las empareja con **tus** ficheros. No reproduce el catálogo de Spotify ni descarga audio con DRM.

## Qué puedes hacer

- Reproducir música desde WebDAV (carpeta compartida del NAS), Navidrome / OpenSubsonic, carpeta local o una biblioteca de ejemplo
- Podcasts y descargas yt-dlp en el NAS ([servicio Docker](nas/podcast-downloader/README.md))
- Vídeo desde carpetas locales o WebDAV (p. ej. series organizadas por carpeta)
- Onboarding con elección teléfono/NAS y carpetas independientes para los seis servicios
- Exportar e importar cada servicio desde Ajustes → App: datos, música, audio, vídeos y fotos en ZIP
- Importar playlists de Spotify y matchearlas contra la biblioteca local
- Salud: peso, entrenamientos, medicación, suplementos, fotos de evolución y nutrición sin conexión
- Entrenamientos: sesiones con ejercicios, series, kg, repeticiones, calentamientos, descansos, calendario y analíticas de progresión
- Peso: registro por fecha, notas, evolución y resumen mensual
- Backup de Salud: ZIP con registros y fotos, restauración confirmada y copia del estado anterior
- Nutrición: calorías y macros diarios, calendario e importación local CSV de MacroFactor
- Fotos de evolución: cuatro vistas por fecha, comparación entre fechas y copias locales
- Medicación y suplementos: pautas, horarios, tomas, calendario y avisos locales opcionales en Android
- Foco: bandeja, proyectos, recordatorios
- Patrimonio: cuentas, movimientos y objetivos
- [Mercury en Android](docs/integrations.md): conexión directa con token Read Only, sincronización automática en primer plano y copia sin conexión
- [WHOOP y Mercury web](docs/integrations.md): servicio Linux local con sincronización de solo lectura
- Tema Geist Pixel en la APK: negro, compacto, fuente incluida y selección sin conexión en Ajustes → App → Apariencia (también NLC clásico)
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
- Teléfono Android; el NAS es opcional. Solo necesitas la misma LAN cuando uses sus archivos.
- Cuenta Expo solo si vas a construir la APK con EAS

## Desarrollo

```bash
git clone https://github.com/JuanCarlosGP/NLC.git
cd NLC
npm install
npx expo start
```

En Windows / PowerShell el flujo es el mismo. La primera apertura permite elegir teléfono o NAS. Puedes cambiar la fuente de cada servicio en Ajustes.

```bash
npm run typecheck
npm run test:health # Node 22.5+
```

## Escenario completo de prueba local

Con Python 3 y ffmpeg instalados, en dos terminales:

```bash
npm run demo:nas
npm run demo:web
```

Abre `http://127.0.0.1:8084/dev/demo` y carga el escenario. La sesión usa
`nlc-local-demo.db` (SQLite real en el navegador), medios sintéticos bajo
`/tmp/nlc-demo-media` y un WebDAV simulado en `127.0.0.1:8086`.
La carga se conserva al recargar y repetirla no reinicia tus cambios de prueba.
No necesita credenciales reales ni descarga contenido de internet.

Incluye música, podcasts, vídeo, playlists, tareas, avisos, cuentas, inversiones,
movimientos, objetivos, peso, entrenamientos, medicación, fotos ilustradas y nutrición de prueba. El modo se activa explícitamente y solo funciona
en desarrollo web; nunca carga estos datos en una APK.

```bash
npm run test:health
npm run test:behavior
```

Ver [comprobaciones y límites de la prueba](docs/qa/local-demo.md).

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

En NLC → Ajustes → Descargas: host del NAS, puerto `8091` y el mismo token que `AUTH_TOKEN` del compose. Las descargas van a `Podcasts` o `Canciones` en el share que montes. No descarga audio de Spotify.

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

El módulo de fotos añade componentes nativos de Expo: para usar el selector en el
teléfono se necesita una APK nueva. Una OTA no instala esos componentes.

El selector CSV de nutrición añade `expo-document-picker` y también requiere una
APK nueva. Se puede pegar el CSV como alternativa. Formatos y validaciones en
[QA de nutrición](docs/qa/nutrition.md).

Backup y restauración de Salud: [uso, formato y verificación](docs/qa/health-backup.md).

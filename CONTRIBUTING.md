# Cómo contribuir

Gracias por interesarte en NLC. El código es público para usarlo en casa, estudiarlo y mejorarlo. Lee primero la [licencia](LICENSE): el uso comercial no está permitido.

## Antes de escribir código

1. Abre un [issue](https://github.com/JuanCarlosGP/NLC/issues) si el cambio es más que un arreglo pequeño.
2. Busca issues abiertos para no duplicar trabajo.
3. Un pull request = un tema. No mezcles refactor, features y docs en el mismo PR.

## Entorno

- Node.js 20 o superior
- npm
- Windows, macOS o Linux
- Un teléfono Android en la misma LAN que el NAS, o la **Biblioteca de ejemplo** para UI sin hardware

```bash
git clone https://github.com/JuanCarlosGP/NLC.git
cd NLC
npm install
npx expo start
```

No hace falta cuenta de Expo para desarrollar. Sí hace falta para construir la APK oficial (`eas`).

```bash
npm run typecheck
```

## Qué se espera en un PR

- TypeScript en modo `strict`. Pasa `npm run typecheck` antes de pedir revisión.
- El código y los identificadores van en inglés; issues, PRs y docs de producto van en español.
- No subas secretos: `.env`, `.secrets/`, tokens, contraseñas del NAS, ni claves FCM.
- No hardcodees la IP de tu LAN. El usuario configura host, puerto y credenciales en Ajustes.
- Un cambio nativo (plugins, permisos, SDK de Expo) hay que decirlo en el PR: no se puede publicar solo con OTA.

## Estilo

Sigue el código que ya hay: componentes en `src/components`, rutas en `src/app`, un hook por pantalla cuando aplique, fuentes de música en `src/lib/nas`.

No reformatees archivos que no tocas.

## Docs

- Producto (qué hace la app): [`docs/producto/`](docs/producto/)
- QA interno (cobertura y hallazgos): [`docs/qa/`](docs/qa/)
- Downloader de podcasts: [`nas/podcast-downloader/README.md`](nas/podcast-downloader/README.md)

Si tu cambio altera una pantalla o un flujo, actualiza la doc de producto o dilo en el PR.

## Seguridad

No abras un issue público para una vulnerabilidad. Sigue [SECURITY.md](SECURITY.md).

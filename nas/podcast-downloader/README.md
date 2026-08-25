# Downloader de podcasts (yt-dlp)

Servicio Docker pequeño que usa **NLC**. No instales Python en UGOS: solo Docker / Container Manager.

Hace falta un Ugreen **DXP** (u otro host) con Docker. En una serie DH sin Docker, corre el compose en un PC y apunta NLC a ese host.

## Qué hace

- `GET /health` — liveness
- `POST /download` — `{ "url": "https://…" }` → `{ "id", "status": "queued" }`
- `GET /jobs/{id}` — `queued | running | done | error`

Auth (opcional): si `AUTH_TOKEN` está vacío, deja el token en blanco en NLC. Si pones un token en el compose, usa el mismo valor en NLC (`X-Download-Token` / Bearer).

El audio se guarda como MP3 en **Music/Canciones** (canciones) o **Music/Podcasts** (podcasts), sin subcarpetas de canal. yt-dlp también escribe un JPG con el mismo nombre (`Episodio.mp3` + `Episodio.jpg`). NLC usa ese fichero como portada; nunca un `cover.jpg` compartido de la carpeta.

## Despliegue en Ugreen

1. En el File Manager, dentro del share de música, crea **`Podcasts`** y **`Canciones`** (p. ej. `Music/Podcasts`, `Music/Canciones`).
2. Copia este directorio al NAS (o pega el compose en Container Manager).
3. Edita `docker-compose.yml`:
   - Lado izquierdo del volumen → ruta real de `Podcasts` (a menudo `/volume1/Music/Podcasts`).
   - Pon un `AUTH_TOKEN` (el mismo que escribirás en NLC).
4. Container Manager → **Compose** → crear stack → Deploy (build desde el Dockerfile).
5. Comprueba `http://<IP-DEL-NAS>:8091/health` desde un PC en la LAN.

## Usuario de solo lectura

- El **contenedor** escribe ficheros (mount del volumen). No usa el usuario Viewer.
- Viewer solo necesita **lectura** en `Music` / `Podcasts` para que NLC reproduzca por WebDAV.
- Escritura en Viewer solo hace falta para `nlc.json` (Guardar configuración), no para las descargas.

## App NLC

Ajustes → **Descargas**: host = IP del NAS, puerto `8091`, token = `AUTH_TOKEN`. Pega una URL de YouTube / podcast y encola. Cuando el estado sea `done`, refresca la biblioteca.

No uses enlaces de episodios de Spotify para bajar audio (DRM / no soportado). El import de Spotify en NLC sigue siendo solo metadatos.

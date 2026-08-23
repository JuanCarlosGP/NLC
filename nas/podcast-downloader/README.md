# Podcast downloader (yt-dlp) for Ugreen NAS

Small Docker service used by **NLC**. You do **not** install Python on UGOS — only Docker / Container Manager.

Requires a Ugreen **DXP** (or other host) with Docker. DH series without Docker: run this compose on a PC instead; point NLC at that host.

## What it does

- `GET /health` — liveness
- `POST /download` — `{ "url": "https://…" }` → `{ "id", "status": "queued" }`
- `GET /jobs/{id}` — `queued | running | done | error`

Auth (optional): if `AUTH_TOKEN` is empty, leave Token blank in NLC. If you set a token in compose, put the same value in NLC (`X-Download-Token` / Bearer).

Audio is saved as MP3 under **Music/Canciones** (songs) or **Music/Podcasts** (podcasts). No channel/artist subfolders. yt-dlp also writes a sidecar JPG with the same name (`Episodio.mp3` + `Episodio.jpg`). NLC only uses that file as cover — never a shared `cover.jpg` in the dump folder.

## Deploy on Ugreen

1. In File Manager, under your music share, create folders **`Podcasts`** and **`Canciones`** (e.g. `Music/Podcasts`, `Music/Canciones`).
2. Copy this directory to the NAS (or paste the compose in Container Manager).
3. Edit `docker-compose.yml`:
   - Left side of the volume → real path to `Podcasts` (often `/volume1/Music/Podcasts`).
   - Set `AUTH_TOKEN` (same value you will enter in NLC).
4. Container Manager → **Compose** → create stack → Deploy (build from Dockerfile).
5. Check `http://<NAS-IP>:8091/health` from a PC on the LAN.

## Viewer user

- The **container** writes files (volume mount). It does not use Viewer/Viewer.
- **Viewer** only needs **read** on `Music` / `Podcasts` so NLC WebDAV can play the new files.
- Write on Viewer is only needed for `nlc.json` (Guardar configuración), not for podcast downloads.

## NLC app

Ajustes → **Descargas**: host = NAS IP, puerto `8091`, token = `AUTH_TOKEN`. Paste a YouTube / podcast page URL and enqueue. When status is `done`, refresh the library.

Do not use Spotify episode links for audio download (DRM / unsupported). Spotify import in NLC remains metadata-only.

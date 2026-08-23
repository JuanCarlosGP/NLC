"""Minimal yt-dlp HTTP API for NLC downloads on the LAN."""

from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Literal

import yt_dlp
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

LIBRARY_DIR = Path(os.environ.get("LIBRARY_DIR", "")).resolve() if os.environ.get("LIBRARY_DIR") else None
PODCAST_DIR = Path(
    os.environ.get("PODCAST_DIR")
    or (str(LIBRARY_DIR / "Podcasts") if LIBRARY_DIR else "/downloads")
).resolve()
_song_raw = os.environ.get("SONG_DIR") or (str(LIBRARY_DIR / "Canciones") if LIBRARY_DIR else "/downloads")
SONG_DIR = Path(_song_raw).resolve()
# Never dump songs at the Music root (avoids channel/artist folders like GatoTemas).
if LIBRARY_DIR and SONG_DIR == LIBRARY_DIR:
    SONG_DIR = (LIBRARY_DIR / "Canciones").resolve()
_video_raw = os.environ.get("VIDEO_DIR")
VIDEO_DIR = Path(_video_raw).resolve() if _video_raw else None
VIDEO_MOVIES_DIR = (VIDEO_DIR / "movies").resolve() if VIDEO_DIR else None
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "").strip()
BIND_HOST = os.environ.get("BIND_HOST", "0.0.0.0")
BIND_PORT = int(os.environ.get("BIND_PORT", "8091"))
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", "2"))
PODCAST_MIN_SECONDS = int(os.environ.get("PODCAST_MIN_SECONDS", "600"))
LOG_LIMIT = 40
SEARCH_RESULTS = int(os.environ.get("SEARCH_RESULTS", "8"))
# Max duration delta (seconds) still considered a viable match when target duration is known.
DURATION_HARD_MAX = float(os.environ.get("DURATION_HARD_MAX", "45"))

JobStatus = Literal["queued", "running", "done", "error"]
MediaKind = Literal["podcast", "song", "video", "auto"]
ResolvedKind = Literal["podcast", "song", "video"]

app = FastAPI(title="NLC media downloader", version="1.2.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)

PROGRESS_RE = re.compile(
    r"\[download\]\s+(?P<pct>\d+(?:\.\d+)?)%.*?of\s+(?P<total>\S+).*?(?:at\s+(?P<speed>\S+))?(?:.*?ETA\s+(?P<eta>\S+))?",
    re.IGNORECASE,
)


class DownloadRequest(BaseModel):
    """Either a direct URL or a search query (title - artist), optional target duration."""

    url: str | None = None
    query: str | None = None
    durationMs: int | None = Field(default=None, ge=0)
    kind: MediaKind = Field(default="song")

    @model_validator(mode="after")
    def require_source(self) -> DownloadRequest:
        if not (self.url and self.url.strip()) and not (self.query and self.query.strip()):
            raise ValueError("Indica url o query.")
        return self

    def resolve_source(self) -> str:
        if self.query and self.query.strip():
            return self.query.strip()
        assert self.url
        return self.url.strip()


class DownloadResponse(BaseModel):
    id: str
    status: JobStatus


class JobResponse(BaseModel):
    id: str
    status: JobStatus
    url: str
    kind: MediaKind | None = None
    resolvedKind: ResolvedKind | None = None
    title: str | None = None
    filename: str | None = None
    error: str | None = None
    progress: float | None = None
    speed: str | None = None
    eta: str | None = None
    log: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    ok: bool = True
    podcastDir: str
    songDir: str
    videoDir: str | None = None
    ytDlp: str


def _require_auth(authorization: str | None, x_token: str | None) -> None:
    if not AUTH_TOKEN:
        return
    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
    token = (x_token or bearer or "").strip()
    if token != AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Token inválido.")


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return (cleaned or "audio")[:180]


def _clean_media_title(name: str) -> str:
    """Strip YouTube clutter: (Letra), [Official], _ Lyrics, etc."""
    cleaned = re.sub(r"\s*\[[a-zA-Z0-9_-]{11}\]\s*$", "", name or "")
    cleaned = re.sub(r"[\[\({（【][^\]\)}）】]*[\]\)}）】]", " ", cleaned)
    cleaned = re.sub(
        r"(?:\s*[_\-|:/]+|\s+)\b(letra|lyrics?|oficial|official|video(?:clip)?|audio|visualizer|hd|4k|mv|topic|version|versión|legal)\b.*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"[_｜|]+", " ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" .-_")
    return cleaned or (name or "audio").strip()


def _update_job(job_id: str, **fields: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.update(fields)


def _append_log(job_id: str, line: str) -> None:
    cleaned = line.strip()
    if not cleaned:
        return
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        log: list[str] = list(job.get("log") or [])
        # Collapse rapid progress updates into one live line.
        if cleaned.startswith("[download]") and log and log[-1].startswith("[download]"):
            log[-1] = cleaned
        else:
            log.append(cleaned)
            if len(log) > LOG_LIMIT:
                log = log[-LOG_LIMIT:]
        job["log"] = log
        match = PROGRESS_RE.search(cleaned)
        if match:
            try:
                job["progress"] = float(match.group("pct"))
            except ValueError:
                pass
            if match.group("speed") and match.group("speed") != "Unknown":
                job["speed"] = match.group("speed")
            if match.group("eta") and match.group("eta") not in {"Unknown", "Unkno"}:
                job["eta"] = match.group("eta")


_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def _find_sidecar(directory: Path, stems: list[str]) -> Path | None:
    wanted = {stem.lower() for stem in stems if stem}
    matches: list[Path] = []
    for path in directory.iterdir():
        if not path.is_file() or path.suffix.lower() not in _IMAGE_SUFFIXES:
            continue
        name = path.name.lower()
        stem = path.stem.lower()
        if stem in wanted or any(token and token in name for token in wanted):
            matches.append(path)
    if not matches:
        return None
    matches.sort(key=lambda item: item.stat().st_mtime, reverse=True)
    return matches[0]


def _align_sidecar(audio: Path, *stems: str) -> Path | None:
    """Make the thumbnail share the audio basename: Episode.mp3 + Episode.jpg."""
    desired = audio.with_suffix(".jpg")
    if desired.is_file():
        return desired
    found = _find_sidecar(audio.parent, [audio.stem, *stems])
    if not found:
        return None
    if found.resolve() == desired.resolve():
        return desired
    if desired.exists():
        return desired
    found.rename(desired)
    return desired


def _find_output(directory: Path, video_id: str) -> Path | None:
    matches = sorted(
        [
            *directory.glob(f"{video_id}.mp3"),
            *directory.glob(f"*{video_id}*.mp3"),
            *directory.glob(f"{video_id}.*"),
            *directory.rglob(f"{video_id}.mp3"),
            *directory.rglob(f"*{_safe_filename(video_id)}*.mp3"),
        ],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    seen: set[str] = set()
    for path in matches:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        if path.is_file() and path.suffix.lower() in {
            ".mp3",
            ".m4a",
            ".opus",
            ".ogg",
            ".webm",
            ".mp4",
            ".mkv",
            ".m4v",
            ".avi",
            ".mov",
        }:
            return path
    return None


def _normalize_text(value: str) -> str:
    cleaned = value.lower()
    cleaned = re.sub(r"\(.*?\)|\[.*?\]", " ", cleaned)
    cleaned = re.sub(r"[^a-z0-9áéíóúüñ]+", " ", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _tokens(value: str) -> list[str]:
    return [part for part in _normalize_text(value).split(" ") if len(part) > 1]


def _text_overlap_score(haystack: str, needle: str) -> float:
    tokens = _tokens(needle)
    if not tokens:
        return 0.0
    hay = _normalize_text(haystack)
    hits = sum(1 for token in tokens if token in hay)
    return hits / len(tokens)


def _duration_score(candidate_sec: float | None, expected_sec: float | None) -> float:
    """Higher is better. Exact duration wins hard over soft title matches."""
    if expected_sec is None or expected_sec <= 0:
        return 50.0
    if candidate_sec is None or candidate_sec <= 0:
        return 5.0
    delta = abs(float(candidate_sec) - float(expected_sec))
    if delta <= 1.0:
        return 100.0
    if delta <= 3.0:
        return 92.0 - delta
    if delta <= 8.0:
        return 78.0 - delta * 2.5
    if delta <= 15.0:
        return 50.0 - delta
    if delta <= DURATION_HARD_MAX:
        return max(5.0, 30.0 - delta)
    return 0.0


def _candidate_url(entry: dict[str, Any]) -> str | None:
    if entry.get("webpage_url"):
        return str(entry["webpage_url"])
    if entry.get("url") and str(entry["url"]).startswith("http"):
        return str(entry["url"])
    video_id = entry.get("id")
    if video_id and entry.get("_type") in (None, "url", "video") and len(str(video_id)) >= 6:
        return f"https://www.youtube.com/watch?v={video_id}"
    return None


def _pick_search_result(
    job_id: str,
    query: str,
    expected_sec: float | None,
) -> str:
    """Search YouTube and pick best match; duration coincidence outweighs title noise."""
    search = query
    if not search.lower().startswith("ytsearch"):
        search = f"ytsearch{SEARCH_RESULTS}:{query}"

    _append_log(job_id, f"Buscando: {query}")
    if expected_sec:
        mins = int(expected_sec // 60)
        secs = int(expected_sec % 60)
        _append_log(job_id, f"Duración objetivo: {mins}:{secs:02d}")

    # Prefer full extract so duration is reliable; flat is fallback.
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": False,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(search, download=False)

    entries: list[dict[str, Any]] = []
    if isinstance(info, dict):
        if info.get("entries"):
            entries = [e for e in info["entries"] if isinstance(e, dict)]
        else:
            entries = [info]
    if not entries:
        raise RuntimeError("La búsqueda de YouTube no devolvió resultados.")

    # query ≈ "Title - Artist"
    title_part = query
    artist_part = ""
    if " - " in query:
        title_part, artist_part = query.split(" - ", 1)

    scored: list[tuple[float, float, dict[str, Any], str]] = []
    for entry in entries:
        url = _candidate_url(entry)
        if not url:
            continue
        cand_dur = entry.get("duration")
        cand_sec = float(cand_dur) if isinstance(cand_dur, (int, float)) else None
        dur_score = _duration_score(cand_sec, expected_sec)
        if expected_sec and cand_sec is not None and abs(cand_sec - expected_sec) > DURATION_HARD_MAX:
            continue
        title = str(entry.get("title") or "")
        text_score = (
            _text_overlap_score(title, title_part) * 12.0
            + _text_overlap_score(title, artist_part) * 8.0
            + _text_overlap_score(str(entry.get("uploader") or entry.get("channel") or ""), artist_part) * 6.0
        )
        # Duration dominates: a near-exact length beats a perfect title with wrong runtime.
        total = dur_score * 10.0 + text_score
        delta = abs(cand_sec - expected_sec) if cand_sec is not None and expected_sec else 999.0
        scored.append((total, delta, entry, url))

    if not scored:
        # Relax hard duration filter once — still rank by duration.
        for entry in entries:
            url = _candidate_url(entry)
            if not url:
                continue
            cand_dur = entry.get("duration")
            cand_sec = float(cand_dur) if isinstance(cand_dur, (int, float)) else None
            dur_score = _duration_score(cand_sec, expected_sec)
            title = str(entry.get("title") or "")
            text_score = _text_overlap_score(title, title_part) * 12.0 + _text_overlap_score(title, artist_part) * 8.0
            total = dur_score * 10.0 + text_score
            delta = abs(cand_sec - expected_sec) if cand_sec is not None and expected_sec else 999.0
            scored.append((total, delta, entry, url))

    if not scored:
        raise RuntimeError("No hay candidatos válidos en la búsqueda.")

    scored.sort(key=lambda item: (-item[0], item[1]))
    best_total, best_delta, best_entry, best_url = scored[0]
    best_title = str(best_entry.get("title") or best_url)
    best_dur = best_entry.get("duration")
    if isinstance(best_dur, (int, float)):
        bm, bs = int(best_dur // 60), int(best_dur % 60)
        dur_label = f"{bm}:{bs:02d}"
    else:
        dur_label = "?"
    _append_log(
        job_id,
        f"Elegido ({best_total:.0f} pts, Δ{best_delta if best_delta < 900 else '?'}s, {dur_label}): {best_title}",
    )
    for total, delta, entry, _url in scored[:5]:
        t = str(entry.get("title") or "")[:80]
        d = entry.get("duration")
        dlabel = f"{int(d // 60)}:{int(d % 60):02d}" if isinstance(d, (int, float)) else "?"
        _append_log(job_id, f"  · {total:.0f} pts Δ{delta if delta < 900 else '?'}s {dlabel} — {t}")
    return best_url


def _resolve_kind(requested: MediaKind, duration: float | None) -> ResolvedKind:
    if requested == "podcast":
        return "podcast"
    if requested == "song":
        return "song"
    if requested == "video":
        return "video"
    if duration is not None and duration >= PODCAST_MIN_SECONDS:
        return "podcast"
    return "song"


def _run_download(
    job_id: str,
    source: str,
    requested_kind: MediaKind,
    duration_ms: int | None = None,
) -> None:
    _update_job(job_id, status="running", kind=requested_kind)
    _append_log(job_id, "Resolviendo metadatos…")
    PODCAST_DIR.mkdir(parents=True, exist_ok=True)
    SONG_DIR.mkdir(parents=True, exist_ok=True)
    if VIDEO_MOVIES_DIR:
        VIDEO_MOVIES_DIR.mkdir(parents=True, exist_ok=True)

    expected_sec = (duration_ms / 1000.0) if duration_ms and duration_ms > 0 else None
    url = source
    try:
        is_http = source.startswith("http://") or source.startswith("https://")
        is_search = (not is_http) or source.lower().startswith("ytsearch")
        if is_search:
            query = source
            if query.lower().startswith("ytsearch"):
                # ytsearchN:rest
                parts = query.split(":", 1)
                query = parts[1] if len(parts) > 1 else query
            url = _pick_search_result(job_id, query, expected_sec)
            _update_job(job_id, url=url)
    except Exception as exc:  # noqa: BLE001
        _append_log(job_id, f"Error búsqueda: {exc}")
        _update_job(job_id, status="error", error=f"No se pudo buscar: {exc}"[:500])
        return

    video_id = ""
    title = "audio"
    duration: float | None = None
    artist = "YouTube"
    try:
        probe = subprocess.run(
            ["yt-dlp", "--dump-single-json", "--no-playlist", "--skip-download", url],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        meta = json.loads(probe.stdout)
        video_id = str(meta.get("id") or "")
        title = _clean_media_title(str(meta.get("track") or meta.get("title") or video_id or "audio"))
        artist = str(meta.get("artist") or meta.get("uploader") or meta.get("channel") or "YouTube")
        raw_dur = meta.get("duration")
        if isinstance(raw_dur, (int, float)):
            duration = float(raw_dur)
        _update_job(job_id, title=title)
        _append_log(job_id, f"Título: {title}")
        if duration:
            mins = int(duration // 60)
            secs = int(duration % 60)
            _append_log(job_id, f"Duración: {mins}:{secs:02d}")
            if expected_sec:
                delta = abs(duration - expected_sec)
                _append_log(job_id, f"Δ duración vs playlist: {delta:.1f}s")
    except Exception as exc:  # noqa: BLE001
        _append_log(job_id, f"Error metadatos: {exc}")
        _update_job(job_id, status="error", error=f"No se pudo leer la URL: {exc}"[:500])
        return

    resolved = _resolve_kind(requested_kind, duration)
    _update_job(job_id, resolvedKind=resolved)
    _append_log(job_id, f"Tipo: {resolved}")

    # Flat folders: Music/Podcasts, Music/Canciones, Popcorn/movies.
    if resolved == "podcast":
        target_dir = PODCAST_DIR
        outtmpl = str(target_dir / f"{_safe_filename(title)[:100]}.%(ext)s")
    elif resolved == "video":
        if not VIDEO_MOVIES_DIR:
            _update_job(job_id, status="error", error="Falta VIDEO_DIR en el contenedor (monta /volume1/Popcorn).")
            return
        target_dir = VIDEO_MOVIES_DIR
        target_dir.mkdir(parents=True, exist_ok=True)
        outtmpl = str(target_dir / f"{_safe_filename(title)[:100]}.%(ext)s")
    else:
        target_dir = SONG_DIR
        target_dir.mkdir(parents=True, exist_ok=True)
        outtmpl = str(target_dir / f"{_safe_filename(title)[:100]}.%(ext)s")

    if resolved == "video":
        cmd = [
            "yt-dlp",
            "-f",
            "bv*+ba/b",
            "--merge-output-format",
            "mp4",
            "--no-playlist",
            "--restrict-filenames",
            "--write-thumbnail",
            "--convert-thumbnails",
            "jpg",
            "--newline",
            "-o",
            outtmpl,
            url,
        ]
    else:
        cmd = [
            "yt-dlp",
            "-f",
            "bestaudio/best",
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "192",
            "--no-playlist",
            "--restrict-filenames",
            "--write-thumbnail",
            "--convert-thumbnails",
            "jpg",
            "--newline",
            "-o",
            outtmpl,
            url,
        ]
    _append_log(job_id, "Descargando con yt-dlp…")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for raw in proc.stdout:
            _append_log(job_id, raw.rstrip("\n"))
        code = proc.wait(timeout=45 * 60)
        if code != 0:
            raise subprocess.CalledProcessError(code, cmd)

        path = _find_output(target_dir, video_id or job_id) or _find_output(
            target_dir, _safe_filename(title)[:100]
        )
        if not path:
            raise RuntimeError(
                "Descarga terminó pero no hay archivo de vídeo."
                if resolved == "video"
                else "Descarga terminó pero no hay archivo de audio."
            )

        desired = target_dir / f"{_safe_filename(title)[:100]}{path.suffix.lower()}"
        if path.resolve() != desired.resolve() and not desired.exists():
            path = path.rename(desired)
            _append_log(job_id, f"Renombrado: {path.name}")

        cover = _align_sidecar(path, video_id, _safe_filename(title)[:100])
        if cover:
            _append_log(job_id, f"Carátula: {cover.name}")
        else:
            _append_log(job_id, "Sin carátula (yt-dlp no trajo miniatura).")

        _append_log(job_id, f"Listo: {path.name}")
        _update_job(
            job_id,
            status="done",
            title=title,
            filename=path.name,
            resolvedKind=resolved,
            progress=100.0,
            error=None,
        )
    except subprocess.TimeoutExpired:
        _append_log(job_id, "Timeout")
        _update_job(job_id, status="error", error="Timeout: la descarga tardó demasiado.")
    except subprocess.CalledProcessError as exc:
        err = str(exc)[:500]
        _append_log(job_id, f"yt-dlp falló ({exc.returncode})")
        _update_job(job_id, status="error", error=err or "yt-dlp falló.")
    except Exception as exc:  # noqa: BLE001
        _append_log(job_id, str(exc))
        _update_job(job_id, status="error", error=str(exc)[:500])


def _yt_dlp_version() -> str:
    try:
        from yt_dlp.version import __version__

        return str(__version__)
    except Exception:  # noqa: BLE001
        return "unknown"


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        podcastDir=str(PODCAST_DIR),
        songDir=str(SONG_DIR),
        videoDir=str(VIDEO_MOVIES_DIR) if VIDEO_MOVIES_DIR else None,
        ytDlp=_yt_dlp_version(),
    )


@app.post("/download", response_model=DownloadResponse)
def enqueue(
    body: DownloadRequest,
    authorization: str | None = Header(default=None),
    x_download_token: str | None = Header(default=None, alias="X-Download-Token"),
) -> DownloadResponse:
    _require_auth(authorization, x_download_token)
    job_id = uuid.uuid4().hex[:12]
    source = body.resolve_source()
    with _lock:
        _jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "url": source,
            "kind": body.kind,
            "resolvedKind": None,
            "title": None,
            "filename": None,
            "error": None,
            "progress": None,
            "speed": None,
            "eta": None,
            "log": ["En cola…"],
        }
    _pool.submit(_run_download, job_id, source, body.kind, body.durationMs)
    return DownloadResponse(id=job_id, status="queued")


@app.get("/jobs/{job_id}", response_model=JobResponse)
def job_status(
    job_id: str,
    authorization: str | None = Header(default=None),
    x_download_token: str | None = Header(default=None, alias="X-Download-Token"),
) -> JobResponse:
    _require_auth(authorization, x_download_token)
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job no encontrado.")
        payload = {**job, "log": list(job.get("log") or [])}
    return JobResponse(**payload)


if __name__ == "__main__":
    import uvicorn

    PODCAST_DIR.mkdir(parents=True, exist_ok=True)
    SONG_DIR.mkdir(parents=True, exist_ok=True)
    if VIDEO_MOVIES_DIR:
        VIDEO_MOVIES_DIR.mkdir(parents=True, exist_ok=True)
    uvicorn.run(app, host=BIND_HOST, port=BIND_PORT, log_level="info")

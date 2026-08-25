#!/usr/bin/env python3
"""
On-demand off-vocal stem generator for JP_Lyrics.

The static github.io site cannot run Demucs, so this small Python service
does it on demand: given a Uta-Net song page URL it resolves the embedded
YouTube video, downloads the real song audio, runs Demucs (`--two-stems=vocals`)
to remove the vocals, caches both the full mix and the off-vocal stem, and
serves them to the web app.

The web app asks for a song's stem state; the FIRST request generates (slow,
shows the app a "Generating off-vocal…" state), every later request is served
instantly from cache. No upload needed by the user.

Run locally:
    STEMS_CACHE_DIR=./stems_cache python stems-service/app.py

Deploy (see Dockerfile): on any VPS/container with Python + ffmpeg + internet.

Endpoints
    GET  /api/health                       -> {"ok": true}
    GET  /api/stem/{song_id}               -> {state, full, vocals, error}
    POST /api/stem  {"url": "<uta-net URL>"} -> trigger generation, {state, song_id}
    GET  /stems/{song_id}/full             -> the full mix audio (or 404)
    GET  /stems/{song_id}/vocals           -> the off-vocal audio (or 404)

Env
    STEMS_CACHE_DIR    where stems are cached (default ./stems_cache)
    STEMS_MODEL        demucs model (default htdemucs)
    STEMS_DEVICE       cpu / cuda (default cpu)
    STEMS_WORKERS      max concurrent generations (default 1)
    STEMS_CORS_ORIGINS comma-separated allowed origins (default *)
    PORT               listen port (default 8000)
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ---- tuning -------------------------------------------------------------

CACHE_DIR = Path(os.environ.get("STEMS_CACHE_DIR", "./stems_cache")).resolve()
MODEL = os.environ.get("STEMS_MODEL", "htdemucs")
DEVICE = os.environ.get("STEMS_DEVICE", "cpu")  # or "cuda" if the host has a GPU
WORKERS = max(1, int(os.environ.get("STEMS_WORKERS", "1")))
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("STEMS_CORS_ORIGINS", "*").split(",")
    if o.strip()
]

# The Demucs runner that shims torchaudio.save onto soundfile (see _demucs_runner.py).
RUNNER = Path(__file__).resolve().parent / "_demucs_runner.py"

# Uta-Net movie pages embed the official YouTube video; we scrape it to get the id.
# (Same reader proxy the app uses for its lyric/video fetches.)
JINA_PREFIX = "https://r.jina.ai/"
JINA_TIMEOUT_S = 25
YOUTUBE_EMBED_RE = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/embed/|youtube\.com/watch\?[^\"'\s]*v=|youtu\.be/)"
    r"([A-Za-z0-9_-]{11})"
)
SONG_ID_RE = re.compile(r"/song/(\d+)")

# The final cached files, per song id.
FULL_SUFFIX = "_full.m4a"
OFFVOCAL_SUFFIX = "_offvocal.mp3"


def _find_spec(name: str):
    import importlib.util

    return importlib.util.find_spec(name)


def uta_net_song_id(url: str) -> Optional[str]:
    m = SONG_ID_RE.search(url or "")
    return m.group(1) if m else None


def http_get_html(url: str, timeout: int = JINA_TIMEOUT_S) -> str:
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0", "X-Return-Format": "html"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def resolve_uta_net_video_id(song_url: str) -> str:
    html = http_get_html(f"{JINA_PREFIX}https://www.uta-net.com/movie/{uta_net_song_id(song_url)}/")
    m = YOUTUBE_EMBED_RE.search(html)
    if not m:
        raise RuntimeError("No embeddable YouTube video was found on that Uta-Net movie page.")
    return m.group(1)


def download_youtube_audio(video_url: str, out_dir: Path) -> Path:
    """Download best-audio of a YouTube video -> out_dir/song.m4a (needs ffmpeg)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    out_pattern = "song.%(ext)s"
    ytdlp = shutil.which("yt-dlp")
    if ytdlp:
        # On Windows shutil.which returns a backslash path; NEVER shlex.split it
        # (shlex treats backslashes as escapes and mangles C:\Users\...).
        prefix = [ytdlp]
    elif _find_spec("yt_dlp") is not None:
        # yt-dlp is installed in this interpreter (the project venv) but not on
        # PATH (WSL/launcher scripts don't always export the venv bin dir).
        prefix = [sys.executable, "-m", "yt_dlp"]
    else:
        uvx = shutil.which("uvx") or "uvx"
        prefix = [uvx, "--from", "yt-dlp", "yt-dlp"]
    cmd = prefix + [
        "--no-playlist",
        "-f",
        "bestaudio/best",
        "-x",
        "--audio-format",
        "m4a",
        "-o",
        str(out_dir / out_pattern),
        video_url,
    ]
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        raise RuntimeError("yt-dlp failed to download the audio (network / region / copyright).")
    produced = sorted(out_dir.glob("song.m4a"), key=lambda p: p.stat().st_mtime)
    if not produced:
        produced = [
            p for p in out_dir.glob("song.*") if p.suffix.lower() in (".m4a", ".mp3", ".wav")
        ]
    if not produced:
        raise RuntimeError("yt-dlp finished but no audio file was produced.")
    return produced[-1]


def run_separation(audio: Path, output_dir: Path, device: Optional[str] = None) -> Path:
    """Run the Demucs runner (soundfile-backed save) -> the no_vocals wav."""
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        str(RUNNER),
        "--two-stems",
        "vocals",
        "-n",
        MODEL,
        "-o",
        str(output_dir),
    ]
    if device:
        cmd += ["-d", device]
    cmd.append(str(audio))
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        raise RuntimeError("Demucs failed — see its output above.")
    model_dir = output_dir / MODEL / audio.stem
    no_vocals = model_dir / "no_vocals.wav"
    if not no_vocals.exists():
        raise RuntimeError("Demucs finished but no no_vocals stem was produced.")
    dest = audio.with_name(f"{audio.stem}_no_vocals.wav")
    shutil.move(str(no_vocals), str(dest))
    if model_dir.exists():
        shutil.rmtree(model_dir, ignore_errors=True)
    return dest


def convert_to_mp3(src: Path, dst: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src), "-codec:a", "libmp3lame", "-b:a", "192k",
            str(dst),
        ],
        check=True,
    )


# ---- job registry -------------------------------------------------------

class Job:
    def __init__(self, song_url: str):
        self.song_url = song_url
        self.state = "queued"  # queued | generating | ready | error
        self.error: Optional[str] = None
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None


jobs: dict[str, Job] = {}
jobs_lock = threading.Lock()
# A small pool does the heavy work; a per-song lock stops a song being generated twice.
executor = ThreadPoolExecutor(max_workers=WORKERS)
queue_lock = threading.Lock()


def full_path(song_id: str) -> Path:
    return CACHE_DIR / f"{song_id}{FULL_SUFFIX}"


def offvocal_path(song_id: str) -> Path:
    return CACHE_DIR / f"{song_id}{OFFVOCAL_SUFFIX}"


def stem_ready(song_id: str) -> bool:
    return full_path(song_id).exists() and offvocal_path(song_id).exists()


def _generate(song_id: str) -> None:
    with jobs_lock:
        job = jobs[song_id]
        job.state = "generating"
        job.started_at = time.time()
    try:
        work = CACHE_DIR / song_id
        work.mkdir(parents=True, exist_ok=True)
        video_id = resolve_uta_net_video_id(job.song_url)
        audio = download_youtube_audio(f"https://www.youtube.com/watch?v={video_id}", work)
        # Rename the generic download so the cached full mix has a stable per-song name.
        full = full_path(song_id)
        shutil.move(str(audio), str(full))
        no_vocals_wav = run_separation(full, work, DEVICE)
        convert_to_mp3(no_vocals_wav, offvocal_path(song_id))
        no_vocals_wav.unlink(missing_ok=True)  # drop the ~40MB intermediate wav
        shutil.rmtree(work, ignore_errors=True)
        with jobs_lock:
            job.state = "ready"
            job.finished_at = time.time()
    except Exception as exc:  # noqa: BLE001 — report any failure to the caller
        with jobs_lock:
            job.state = "error"
            job.error = str(exc)
            job.finished_at = time.time()


def ensure_job(song_id: str, song_url: str) -> Job:
    with jobs_lock:
        existing = jobs.get(song_id)
        if existing and existing.state in ("queued", "generating"):
            return existing
        if stem_ready(song_id):
            job = Job(song_url)
            job.state = "ready"
            jobs[song_id] = job
            return job
        job = Job(song_url)
        jobs[song_id] = job
    queue_lock.acquire()
    try:
        executor.submit(_generate, song_id)
    finally:
        queue_lock.release()
    return job


# ---- app ----------------------------------------------------------------

app = FastAPI(title="JP_Lyrics stem generator", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StemRequest(BaseModel):
    url: str


def status_payload(song_id: str) -> dict:
    with jobs_lock:
        job = jobs.get(song_id)
    if stem_ready(song_id):
        return {
            "song_id": song_id,
            "state": "ready",
            "full": f"/stems/{song_id}/full",
            "vocals": f"/stems/{song_id}/vocals",
            "error": None,
        }
    if job:
        # A stale failure (e.g. an old yt-dlp version) shouldn't disable the
        # feature forever: after 30 s report "unknown" so the app retries with
        # a fresh POST on the next visit.
        state = job.state
        error = job.error
        if (
            state == "error"
            and job.finished_at is not None
            and time.time() - job.finished_at > 30
        ):
            state = "unknown"
            error = None
        return {
            "song_id": song_id,
            "state": state,
            "full": f"/stems/{song_id}/full",
            "vocals": f"/stems/{song_id}/vocals",
            "error": error,
        }
    return {"song_id": song_id, "state": "unknown", "full": None, "vocals": None, "error": None}


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "model": MODEL, "device": DEVICE, "demucs": _find_spec("demucs") is not None}


@app.get("/api/stem/{song_id}")
def stem_status(song_id: str) -> dict:
    return status_payload(song_id)


@app.post("/api/stem")
def stem_request(req: StemRequest) -> dict:
    song_id = uta_net_song_id(req.url)
    if not song_id:
        raise HTTPException(status_code=400, detail="Not a Uta-Net song URL (need /song/<id>/).")
    ensure_job(song_id, req.url)
    return status_payload(song_id)


@app.get("/stems/{song_id}/full")
def serve_full(song_id: str) -> FileResponse:
    p = full_path(song_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Off-vocal stem not ready yet.")
    return FileResponse(p, media_type="audio/mp4")


@app.get("/stems/{song_id}/vocals")
def serve_vocals(song_id: str) -> FileResponse:
    p = offvocal_path(song_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Off-vocal stem not ready yet.")
    return FileResponse(p, media_type="audio/mpeg")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))

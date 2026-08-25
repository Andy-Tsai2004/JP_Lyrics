# JP_Lyrics stem generator (on-demand, automated)

The static github.io site can't run Demucs, so this **FastAPI service** does it
on demand and caches the result. When a user opens a song, the app asks this
service for an off-vocal stem:

- **first request** → the service downloads the real song audio (resolving the
  embedded YouTube video from the Uta-Net page), runs Demucs
  (`--two-stems=vocals`) to remove the vocals, caches the result, and serves it
  (the app shows a "Generating off-vocal…" pulse).
- **every later request** → instant, served from cache. No upload, no CLI.

The app swaps between the **full mix** (`/stems/<id>/full`) and the **off-vocal
stem** (`/stems/<id>/vocals`) at the same `currentTime` — both come from the
same recording, so the timestamp is preserved to the millisecond.

## Quick start

**Deploy to a VPS/container (public — for the github.io site):** Docker Compose
handles the volume + restart policy + healthcheck:

```bash
cd stems-service
# set your origins in a .env next to this file (optional):
#   STEMS_CORS_ORIGINS=https://luszechai.github.io
docker compose up -d --build
```

Then put **Caddy** (or any reverse proxy) in front for HTTPS — see `Caddyfile`.
The site build needs your service's HTTPS URL: set
`VITE_STEMS_API_URL=https://stems.your-host.example` in `.github/workflows/deploy-pages.yml`.

**Run locally in WSL2 (free, your own machine):**

```bash
cd stems-service
bash run-tunnel.sh --local   # WSL-native venv + cache in ~/.jplyrics-stems, starts on :8000
```

Then in the repo, add to `.env.local`: `VITE_STEMS_API_URL=http://localhost:8000`.
Windows reaches the WSL2 service via `localhost` (WSL2 loopback forwarding).

**People on github.io, free, PC as the server (Cloudflare Tunnel):**

Recommended: run the host **inside WSL2** (clean env, native-ext4 venv/cache,
keeps torch/demucs off your Windows Python). From Windows PowerShell, in this
folder:

```powershell
.\run-tunnel-wsl.ps1                # service + tunnel in WSL, then ask to push
.\run-tunnel-wsl.ps1 -AutoUpdate    # same, but push the new URL without asking
.\run-tunnel-wsl.ps1 -LocalOnly     # service only (localhost:8000), no tunnel
.\run-tunnel-wsl.ps1 -StopOnly      # stop
```

First run installs ffmpeg + demucs/torch inside WSL (~2 GB, a few minutes);
the venv and the stems cache live in `~/.jplyrics-stems` (native ext4 — never
on `/mnt/c`, which is too slow for torch). `cloudflared` is downloaded there
too. The script prints a `https://<random>.trycloudflare.com` URL, updates
`public/stems-config.json`, and pushes it with your **Windows git
credentials**; the deployed site reads that file at runtime, so github.io
visitors get the new URL **without a rebuild** (only the config push has to
land, ~1-2 min for Pages to redeploy).

Equivalent from a WSL terminal:

```bash
cd /mnt/c/Users/<you>/<repo>/stems-service
bash run-tunnel.sh          # service + tunnel; updates the config, push manually
bash run-tunnel.sh --local  # service only
bash stop-tunnel.sh         # stop
```

Alternative — run natively on Windows (no WSL), same URL workflow:

```powershell
.\run-tunnel.ps1          # start service + tunnel, then ask to update the site
.\run-tunnel.ps1 -AutoUpdate   # same, but push the new URL without asking
```

It reuses the existing `.venv-stems` on Windows. (First request per song is a
~90 s CPU generation on your machine, then cached.)

> The site URL is resolved at runtime from `public/stems-config.json`
> (`{ "apiUrl": "" }` = feature off). `VITE_STEMS_API_URL` still works as a
> build-time fallback for local dev only.

## How it fits together

```
Static site (github.io)  ──GET /api/stem/<id>, /stems/<id>/full|vocals──▶  this service
   (Vite build, VITE_STEMS_API_URL=<service base>)
                                                                  │ downloads audio + Demucs
                                                                  │ caches into STEMS_CACHE_DIR
                                                                  ▼
                                                             volume (persists)
```

The site stays static; this service is the only place Demucs runs.

## Deploy to a VPS / container

```bash
# Build the image (CPU-only by default; swap the base/image for a CUDA + torch GPU image to be much faster)
docker build -t jplyrics-stems .

mkdir -p /srv/jplyrics-stems-cache   # persistent cache

docker run -d --name jplyrics-stems \
  -p 8000:8000 \
  -v /srv/jplyrics-stems-cache:/data \
  -e STEMS_CACHE_DIR=/data \
  -e STEMS_DEVICE=cpu \
  -e STEMS_CORS_ORIGINS=https://luszechai.github.io,https://localhost:8080 \
  jplyrics-stems
```

Put **TLS** in front (Caddy / nginx / a cloud LB) so the service is `https://`,
because the deployed site is `https://` and a browser will block calls to an
`http://` backend (mixed content). The site does **not** need a rebuild for a
URL change — put the service base URL in `public/stems-config.json`
(`{ "apiUrl": "https://stems.your-host.example" }`) and commit/push it. The
app reads it at runtime and falls back to the manual upload path when it's
empty.

## Run locally (dev)

```bash
# Ephemeral Python — never pollutes your global env (needs demucs/torch, which takes a while to fetch)
bash stems-service/run.sh

# or, with a project .venv
python -m pip install -r stems-service/requirements.txt
STEMS_CACHE_DIR=./stems_cache python stems-service/app.py
```

Then run the Vite app with a `.env.local` containing:

```
VITE_STEMS_API_URL=http://localhost:8000
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness + whether demucs is importable |
| GET | `/api/stem/{song_id}` | `{state: ready\|generating\|error\|unknown, full, vocals, error}` |
| POST | `/api/stem` | body `{"url": "<uta-net song url>"}` → trigger generation, returns state |
| GET | `/stems/{song_id}/full` | the full mix file (404 until ready) |
| GET | `/stems/{song_id}/vocals` | the off-vocal file (404 until ready) |

`song_id` is the Uta-Net id extracted from a `/song/<id>/` URL.

## Env vars

| Var | Default | Notes |
| --- | --- | --- |
| `STEMS_CACHE_DIR` | `./stems_cache` | where stems are cached |
| `STEMS_MODEL` | `htdemucs` | `htdemucs`, `htdemucs_ft`, `hts`… |
| `STEMS_DEVICE` | `cpu` | `cuda` if the host has a GPU |
| `STEMS_WORKERS` | `1` | max concurrent generations (keep low on CPU) |
| `STEMS_CORS_ORIGINS` | `*` | comma-separated allowlist |
| `PORT` | `8000` | listen port |

## Hardening notes

Generation is CPU/GPU heavy and pays for itself in caching. For a public host:
- keep `STEMS_WORKERS` low and add a per-IP rate limit / auth if it's shared,
- the `/api/stem` POST is the only endpoint that starts work — restrict it if
  you see abuse,
- serve the cache from a fast, persistent volume.

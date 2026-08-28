#!/usr/bin/env bash
# Run the stem generator in WSL2 (Ubuntu) without Docker, using a local venv.
# Free, local-only: serves your own machine/LAN, not the public github.io site.
#
#   bash run-wsl.sh                # first run creates .venv and installs deps
#
# Then point the app at it (Vite dev server on Windows reaches WSL2 via
# localhost): put  VITE_STEMS_API_URL=http://localhost:8000  in the project's
# .env.local. Generated stems are cached in ./stems_cache (gitignored).
set -euo pipefail
cd "$(dirname "$0")"

# Demucs and yt-dlp both need ffmpeg.
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it with:"
  echo "  sudo apt-get update && sudo apt-get install -y ffmpeg"
  exit 1
fi

PY=${PYTHON:-python3}
if [ ! -d .venv ]; then
  echo "Creating venv …"
  "$PY" -m venv .venv
fi
echo "Installing deps (demucs/torch ~2 GB the first time) …"
. .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

export STEMS_CACHE_DIR="${STEMS_CACHE_DIR:-${PWD}/stems_cache}"
export STEMS_CORS_ORIGINS="${STEMS_CORS_ORIGINS:-*}"
echo "Serving on http://0.0.0.0:8000  (cache: ${STEMS_CACHE_DIR})"
exec python app.py

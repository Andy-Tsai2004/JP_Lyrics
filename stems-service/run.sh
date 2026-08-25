#!/usr/bin/env bash
# Local (non-container) way to run the stem generator with ephemeral deps, so it
# never pollutes your global Python. Requires a Python with demucs/torch.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

exec uv run --with demucs --with numpy --with fastapi --with 'uvicorn[standard]' --with yt-dlp \
  python stems-service/app.py

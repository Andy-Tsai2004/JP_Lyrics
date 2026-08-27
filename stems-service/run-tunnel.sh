#!/usr/bin/env bash
# ============================================================================
# run-tunnel.sh - the JP_Lyrics stem generator HOST, for WSL2 / Linux.
#
# Runs Demucs + the FastAPI service (and optionally a free Cloudflare quick
# tunnel) INSIDE this Linux/WSL environment. The venv and the stems cache live
# in $HOME/.jplyrics-stems (native ext4) - /mnt/c is far too slow for torch.
#
#   bash run-tunnel.sh                 # service + public tunnel
#   bash run-tunnel.sh --local         # service only (http://localhost:8000)
#   bash run-tunnel.sh --no-config     # don't touch public/stems-config.json
#
# The public https://<random>.trycloudflare.com URL is written to .tunnel-url
# next to this script (Windows can read it) and, unless --no-config, into
# ../public/stems-config.json so the deployed site picks it up at runtime.
#
# Stop any time with:  bash stop-tunnel.sh
# Windows one-liner:   .\run-tunnel-wsl.ps1
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"
REPO_DIR="$(cd .. && pwd)"
PORT="${STEMS_PORT:-8000}"
STEMS_HOME="${STEMS_HOME:-$HOME/.jplyrics-stems}"
VENV="$STEMS_HOME/venv"
BIN="$STEMS_HOME/bin"
LOG_DIR="$STEMS_HOME"

LOCAL_ONLY=0
NO_CONFIG=0
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL_ONLY=1 ;;
    --no-config) NO_CONFIG=1 ;;
  esac
done

mkdir -p "$STEMS_HOME" "$BIN"

say() { echo "[stems] $*"; }
ok()  { echo "[stems] $*"; }
die() { echo "[stems] ERROR: $*" >&2; exit 1; }

# Tear down any previous instance started by these scripts.
if [ -f "$STEMS_HOME/service.pid" ]; then
  kill "$(cat "$STEMS_HOME/service.pid")" 2>/dev/null || true
  rm -f "$STEMS_HOME/service.pid"
fi
if [ -f "$STEMS_HOME/tunnel.pid" ]; then
  kill "$(cat "$STEMS_HOME/tunnel.pid")" 2>/dev/null || true
  rm -f "$STEMS_HOME/tunnel.pid"
fi

# --- 1. ffmpeg ---------------------------------------------------------------
if ! command -v ffmpeg >/dev/null 2>&1; then
  say "ffmpeg missing - installing via apt (needs sudo)…"
  if sudo -n true 2>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq ffmpeg
  else
    die "ffmpeg not found. Run:  sudo apt-get update && sudo apt-get install -y ffmpeg"
  fi
fi

# --- 2. Python venv (native ext4, not /mnt/c) ---------------------------------
if [ ! -x "$VENV/bin/python" ]; then
  say "Creating Python venv at $VENV …"
  if ! python3 -m venv "$VENV" 2>/dev/null; then
    say "python3-venv missing - installing…"
    sudo apt-get install -y -qq python3-venv
    python3 -m venv "$VENV"
  fi
fi
"$VENV/bin/python" -m pip install -q --upgrade pip
if ! "$VENV/bin/python" -c "import fastapi, demucs, numpy" 2>/dev/null; then
  say "Installing service deps (torch/demucs ~2 GB the first time)…"
  "$VENV/bin/python" -m pip install -q -r requirements.txt
fi

# --- 3. cloudflared (skipped with --local) -------------------------------------
CLF=""
if [ "$LOCAL_ONLY" -eq 0 ]; then
  if command -v cloudflared >/dev/null 2>&1; then
    CLF="$(command -v cloudflared)"
  elif [ -x "$BIN/cloudflared" ]; then
    CLF="$BIN/cloudflared"
  else
    say "Downloading cloudflared to $BIN …"
    arch="$(uname -m)"
    case "$arch" in
      x86_64) clf_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
      aarch64|arm64) clf_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
      *) die "unsupported arch: $arch" ;;
    esac
    curl -fsSL "$clf_url" -o "$BIN/cloudflared"
    chmod +x "$BIN/cloudflared"
    CLF="$BIN/cloudflared"
  fi
fi

# --- 4. Start the service -------------------------------------------------------
export STEMS_CACHE_DIR="${STEMS_CACHE_DIR:-$STEMS_HOME/cache}"
export STEMS_CORS_ORIGINS="${STEMS_CORS_ORIGINS:-https://luszechai.github.io,https://Andy-Tsai2004.github.io,http://localhost:8080}"
# Make the venv's console scripts (yt-dlp, demucs) visible to the service.
export PATH="$VENV/bin:$PATH"
say "Starting stem service on port $PORT …"
nohup "$VENV/bin/python" -u app.py >"$LOG_DIR/service.log" 2>&1 &
echo $! > "$STEMS_HOME/service.pid"
SVC_PID="$(cat "$STEMS_HOME/service.pid")"

healthy=0
for _ in $(seq 1 90); do
  if ! kill -0 "$SVC_PID" 2>/dev/null; then break; fi
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" -eq 0 ]; then
  echo "--- service.log tail ---"
  tail -20 "$LOG_DIR/service.log" 2>/dev/null || true
  die "service not healthy on port $PORT"
fi
ok "Service healthy on http://localhost:$PORT"

if [ "$LOCAL_ONLY" -eq 0 ]; then
  # --- 5. Start the tunnel -----------------------------------------------------
  say "Opening Cloudflare quick tunnel …"
  nohup "$CLF" tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG_DIR/cloudflared.log" 2>&1 &
  echo $! > "$STEMS_HOME/tunnel.pid"
  TUN_PID="$(cat "$STEMS_HOME/tunnel.pid")"

  URL=""
  for _ in $(seq 1 90); do
    if ! kill -0 "$TUN_PID" 2>/dev/null; then break; fi
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/cloudflared.log" 2>/dev/null | head -1 || true)"
    [ -n "$URL" ] && break
    sleep 1
  done
  if [ -z "$URL" ]; then
    echo "--- cloudflared.log tail ---"
    tail -20 "$LOG_DIR/cloudflared.log" 2>/dev/null || true
    die "no tunnel URL appeared"
  fi

  echo "$URL" > .tunnel-url
  ok "PUBLIC URL: $URL"

  # --- 6. Point the deployed site at this URL -----------------------------------
  if [ "$NO_CONFIG" -eq 0 ]; then
    "$VENV/bin/python" - "$URL" <<'PY'
import json, pathlib, sys
url = sys.argv[1]
p = pathlib.Path("../public/stems-config.json")
data = json.loads(p.read_text(encoding="utf-8"))
data["apiUrl"] = url
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("[stems] updated", p.resolve())
PY
    say "Config updated. Commit & push it to point github.io at this tunnel:"
    say "  git add public/stems-config.json && git commit -m 'stems: live tunnel URL' && git push"
  fi
else
  say "Local-only mode (no tunnel). Health: http://localhost:$PORT/api/health"
fi

say "Logs: $LOG_DIR/service.log  $LOG_DIR/cloudflared.log"
say "Stop with:  bash stop-tunnel.sh"

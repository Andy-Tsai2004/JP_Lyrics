#!/usr/bin/env bash
# Run the stem generator on your PC and open a PUBLIC Cloudflare Tunnel to it,
# so people on github.io can use the off-vocal feature while this PC is on.
#
#   bash run-tunnel.sh
#
# It prints a public https://<random>.trycloudflare.com URL. Copy that into the
# site's runtime config (public/stems-config.json), push, and anyone on the
# site can generate off-vocal — for as long as this PC stays on. The URL
# changes every run, so re-run this script and push the config when you
# restart. (Windows users: prefer run-tunnel.ps1, which does this for you.)
#
# Stop with Ctrl+C (kills both the service and the tunnel).
set -euo pipefail
cd "$(dirname "$0")"

# --- 1. ffmpeg ------------------------------------------------------------
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it with:"
  echo "  sudo apt-get update && sudo apt-get install -y ffmpeg"
  exit 1
fi

# --- 2. deps (demucs/torch ~2 GB first time) ------------------------------
PY=${PYTHON:-python3}
if [ ! -d .venv ]; then
  echo "Creating venv …"
  "$PY" -m venv .venv
fi
. .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

# --- 3. start the stem service in the background --------------------------
export STEMS_CACHE_DIR="${STEMS_CACHE_DIR:-${PWD}/stems_cache}"
# Public tunnel: allow the github.io site (and local dev) to call this service.
export STEMS_CORS_ORIGINS="${STEMS_CORS_ORIGINS:-https://luszechai.github.io,http://localhost:8080}"
python app.py > .stems-service.log 2>&1 &
SVC_PID=$!
echo "stem service running (pid $SVC_PID, log: .stems-service.log)"

# --- 4. cloudflared --------------------------------------------------------
ensure_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then return; fi
  echo "Installing cloudflared to ~/.local/bin …"
  local arch url
  arch=$(uname -m)
  case "$arch" in
    x86_64) url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
    aarch64|arm64) url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
    *) echo "unsupported arch: $arch"; exit 1 ;;
  esac
  mkdir -p "$HOME/.local/bin"
  curl -fsSL "$url" -o "$HOME/.local/bin/cloudflared"
  chmod +x "$HOME/.local/bin/cloudflared"
  export PATH="$HOME/.local/bin:$PATH"
}
ensure_cloudflared

cloudflared tunnel --no-autoupdate --url http://localhost:8000 > .cloudflared.log 2>&1 &
CLF_PID=$!

# Wait for the public URL to appear, then print it prominently.
echo "Waiting for tunnel URL …"
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' .cloudflared.log 2>/dev/null | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Tunnel URL not found yet — here is the tunnel log:"
  cat .cloudflared.log 2>/dev/null | tail -20 || true
fi

echo ""
echo "=============================================================="
echo "  Public URL: ${URL:-<see log above>}"
echo "  Updating ../public/stems-config.json with this URL…"
echo "=============================================================="
echo ""
echo "Ctrl+C to stop (service + tunnel)."

trap 'kill $SVC_PID $CLF_PID 2>/dev/null' EXIT

# --- 5b. Point the deployed site at this URL (runtime config, no rebuild) ---
CONFIG="../public/stems-config.json"
if [ -f "$CONFIG" ]; then
  "$PY" - "$CONFIG" "$URL" <<'PY'
import json, sys
path, url = sys.argv[1], sys.argv[2]
if not url:
    sys.exit(0)
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
data["apiUrl"] = url
with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
print("  updated", path)
PY
  echo ""
  echo "  Commit & push it to point github.io at this tunnel:"
  echo "    git add public/stems-config.json \\"
  echo "        && git commit -m 'stems: live tunnel URL' \\"
  echo "        && git push"
  echo ""
else
  echo "  No $CONFIG found. Create it manually with:"
  echo "    { \"apiUrl\": \"$URL\" }"
fi

tail -f .cloudflared.log 2>/dev/null || true

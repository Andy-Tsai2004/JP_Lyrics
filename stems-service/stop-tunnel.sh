#!/usr/bin/env bash
# stop-tunnel.sh - stop the stem service + tunnel started by run-tunnel.sh.
set -u

STEMS_HOME="${STEMS_HOME:-$HOME/.jplyrics-stems}"
for f in service.pid tunnel.pid; do
  if [ -f "$STEMS_HOME/$f" ]; then
    pid="$(cat "$STEMS_HOME/$f")"
    if kill "$pid" 2>/dev/null; then
      echo "[stems] stopping pid $pid ($f)…"
      for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      if kill -0 "$pid" 2>/dev/null; then
        echo "[stems] force-killing pid $pid ($f)"
        kill -9 "$pid" 2>/dev/null || true
      else
        echo "[stems] stopped pid $pid ($f)"
      fi
    fi
    rm -f "$STEMS_HOME/$f"
  fi
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
rm -f "$SCRIPT_DIR/.tunnel-url"
echo "[stems] done."

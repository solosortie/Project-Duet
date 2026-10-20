#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
export PORT="${PORT:-8765}"
exec python3 server.py

#!/usr/bin/env bash
set -euo pipefail

# Thư mục chứa script (tuyệt đối)
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# Venv cùng cấp với script (nếu có)
if [ -f "$SCRIPT_DIR/venv/bin/activate" ]; then
  source "$SCRIPT_DIR/venv/bin/activate"
fi

# Thư mục chứa server.py
APP_DIR="$SCRIPT_DIR/src/logic"

# Vào đúng thư mục có server.py rồi chạy uvicorn
cd "$APP_DIR"
exec uvicorn server:app --reload --host 0.0.0.0 --port 5001
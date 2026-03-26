#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi

echo "Installing dependencies..."
source .venv/bin/activate
pip install -r requirements.txt

echo "Done. Run 'nx run whisper-service:serve' to start."

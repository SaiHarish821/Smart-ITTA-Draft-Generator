#!/usr/bin/env bash
# Smart ITTA Draft Generator – startup script
set -e
echo "Starting Smart ITTA Draft Generator..."
python -m uvicorn main:app --host "${APP_HOST:-0.0.0.0}" --port "${APP_PORT:-8000}" --reload

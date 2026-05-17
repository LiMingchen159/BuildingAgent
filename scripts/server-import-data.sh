#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-/opt/BuildingAgent-data.tgz}"
APP_DIR="/opt/BuildingAgent"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Missing archive: $ARCHIVE"
  echo "Upload from Windows: scp .\\BuildingAgent-data.tgz user@SERVER:/opt/"
  exit 1
fi

cd "$APP_DIR"
tar -xzf "$ARCHIVE"
chmod 600 .env 2>/dev/null || true

echo "=== Migration checks ==="
test -f .env && echo "OK .env" || echo "MISSING .env"
test -f apps/data/store.json && echo "OK apps/data/store.json" || echo "MISSING apps/data/store.json"
test -d data && echo "OK data/" || echo "MISSING data/"
test -d "Knowledge Base" && echo "OK Knowledge Base/" || echo "MISSING Knowledge Base/"

npm run build
pm2 restart buildingagent-api

echo "Done. Verify: curl http://127.0.0.1:3000/health"

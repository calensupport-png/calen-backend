#!/usr/bin/env bash

set -euo pipefail

ACTION="${1:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v podman >/dev/null 2>&1; then
  echo "No Podman CLI found."
  echo "Install Podman and try again."
  exit 1
fi

if ! podman info >/dev/null 2>&1; then
  echo "Podman is installed, but the Podman machine/runtime is not ready."
  echo "Try: podman machine init"
  echo "Then: podman machine start"
  exit 1
fi

case "$ACTION" in
  up)
    podman compose -f "$ROOT_DIR/docker-compose.yml" up -d mongodb
    ;;
  down)
    podman compose -f "$ROOT_DIR/docker-compose.yml" down
    ;;
  logs)
    podman compose -f "$ROOT_DIR/docker-compose.yml" logs -f mongodb
    ;;
  *)
    echo "Usage: bash ./scripts/db.sh {up|down|logs}"
    exit 1
    ;;
esac

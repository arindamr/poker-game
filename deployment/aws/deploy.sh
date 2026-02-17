#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deployment/aws"
ENV_FILE="$DEPLOY_DIR/.env"
DEFAULT_BRANCH="${DEPLOY_BRANCH:-main}"
BRANCH="${1:-$DEFAULT_BRANCH}"
SERVICES=(postgres redis backend websocket nginx)

log() {
  echo "[$(date -Iseconds)] $*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

wait_for_health() {
  local name="$1"
  local retries=30
  local sleep_secs=2
  local status

  for _ in $(seq 1 "$retries"); do
    status="$(docker inspect --format='{{.State.Health.Status}}' "$name" 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    if [[ -z "$status" ]]; then
      return 0
    fi
    sleep "$sleep_secs"
  done

  echo "Timed out waiting for healthy container: $name"
  return 1
}

require_cmd git
require_cmd docker
require_cmd curl

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker compose plugin is required (docker compose)."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

if [[ ! -d "$ROOT_DIR/.git" ]]; then
  echo "This script must run from a git clone of the repo."
  exit 1
fi

log "Deploying branch: $BRANCH"
cd "$ROOT_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

cd "$DEPLOY_DIR"
log "Rebuilding and restarting services"
docker compose --env-file "$ENV_FILE" up -d --build "${SERVICES[@]}"

log "Waiting for healthy containers"
wait_for_health poker_postgres
wait_for_health poker_redis
wait_for_health poker_websocket

log "Checking backend health endpoint"
if ! curl -fsS http://localhost:3000/health >/dev/null; then
  echo "Backend health check failed."
  exit 1
fi

log "Deployment successful"
docker compose --env-file "$ENV_FILE" ps

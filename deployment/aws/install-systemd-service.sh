#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root (use sudo)."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deployment/aws"
ENV_FILE="$DEPLOY_DIR/.env"
SERVICE_FILE="/etc/systemd/system/poker-stack.service"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Poker Game Docker Compose Stack
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
WorkingDirectory=$DEPLOY_DIR
RemainAfterExit=yes
ExecStart=/usr/bin/docker compose --env-file $ENV_FILE up -d
ExecStop=/usr/bin/docker compose --env-file $ENV_FILE down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable poker-stack.service
systemctl start poker-stack.service

echo "Installed and started poker-stack.service"

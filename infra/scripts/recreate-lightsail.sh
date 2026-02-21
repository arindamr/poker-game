#!/usr/bin/env bash
set -euo pipefail

# Recreate the Lightsail stack from Terraform and reconfigure app CORS to static IP.
# Usage:
#   ./infra/scripts/recreate-lightsail.sh --key /path/to/key.pem [--yes]
#
# Optional flags:
#   --tf-dir <path>      Terraform directory (default: ./infra)
#   --tfvars <file>      Terraform vars file name/path (default: terraform.tfvars)
#   --branch <name>      Deploy branch on server (default: main)
#   --skip-remote        Skip SSH post-config/deploy steps
#   --yes                Skip confirmation prompt

TF_DIR=""
TFVARS="terraform.tfvars"
KEY_PATH=""
BRANCH="main"
SKIP_REMOTE="false"
ASSUME_YES="false"

log() {
  echo "[$(date -Iseconds)] $*"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

usage() {
  sed -n '1,40p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tf-dir)
      TF_DIR="${2:-}"
      shift 2
      ;;
    --tfvars)
      TFVARS="${2:-}"
      shift 2
      ;;
    --key)
      KEY_PATH="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --skip-remote)
      SKIP_REMOTE="true"
      shift
      ;;
    --yes)
      ASSUME_YES="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

require_cmd terraform
require_cmd ssh
require_cmd ssh-keygen
require_cmd sed

if [[ -z "$TF_DIR" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  TF_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

[[ -d "$TF_DIR" ]] || fail "Terraform directory not found: $TF_DIR"

if [[ ! -f "$TFVARS" ]]; then
  if [[ -f "$TF_DIR/$TFVARS" ]]; then
    TFVARS="$TF_DIR/$TFVARS"
  else
    fail "terraform vars file not found: $TFVARS"
  fi
fi

if [[ "$SKIP_REMOTE" != "true" ]]; then
  [[ -n "$KEY_PATH" ]] || fail "--key is required unless --skip-remote is used"
  [[ -f "$KEY_PATH" ]] || fail "SSH key not found: $KEY_PATH"
fi

if [[ "$ASSUME_YES" != "true" ]]; then
  echo "This will DESTROY and RECREATE the Lightsail infrastructure in:"
  echo "  $TF_DIR"
  echo
  read -r -p "Continue? (yes/no): " answer
  [[ "$answer" == "yes" ]] || fail "Aborted by user"
fi

log "Terraform init"
terraform -chdir="$TF_DIR" init -upgrade

log "Terraform destroy"
terraform -chdir="$TF_DIR" destroy -auto-approve -var-file="$TFVARS"

log "Terraform apply"
terraform -chdir="$TF_DIR" apply -auto-approve -var-file="$TFVARS"

PUBLIC_IP="$(terraform -chdir="$TF_DIR" output -raw instance_public_ip)"
[[ -n "$PUBLIC_IP" ]] || fail "Failed to read instance_public_ip from terraform output"
log "New instance public IP: $PUBLIC_IP"

if [[ "$SKIP_REMOTE" == "true" ]]; then
  log "Skipping remote provisioning checks (--skip-remote)."
  echo "PUBLIC_IP=$PUBLIC_IP"
  exit 0
fi

log "Resetting known_hosts entry (if present)"
ssh-keygen -R "$PUBLIC_IP" >/dev/null 2>&1 || true

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -i "$KEY_PATH")

log "Waiting for SSH availability"
for _ in $(seq 1 60); do
  if ssh "${SSH_OPTS[@]}" "ec2-user@$PUBLIC_IP" "echo ok" >/dev/null 2>&1; then
    break
  fi
  sleep 10
done

log "Waiting for bootstrap status file"
for _ in $(seq 1 60); do
  STATUS="$(ssh "${SSH_OPTS[@]}" "ec2-user@$PUBLIC_IP" "sudo cat /var/lib/poker-bootstrap/status 2>/dev/null || true")"
  if [[ "$STATUS" == "success" ]]; then
    break
  fi
  if [[ "$STATUS" == "failed" ]]; then
    ssh "${SSH_OPTS[@]}" "ec2-user@$PUBLIC_IP" "sudo cat /var/lib/poker-bootstrap/status.json; echo; sudo tail -n 200 /var/log/poker-bootstrap.log"
    fail "Bootstrap failed on remote host"
  fi
  sleep 10
done

log "Setting CORS_ORIGIN to public IP and redeploying app services"
ssh "${SSH_OPTS[@]}" "ec2-user@$PUBLIC_IP" \
  "cd /opt/poker-game && sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=http://$PUBLIC_IP|' deployment/aws/.env && ./deployment/aws/deploy.sh '$BRANCH'"

log "Final remote health checks"
ssh "${SSH_OPTS[@]}" "ec2-user@$PUBLIC_IP" \
  "curl -fsS http://localhost:3000/health && echo && docker compose -f /opt/poker-game/deployment/aws/docker-compose.yml --env-file /opt/poker-game/deployment/aws/.env ps"

echo
echo "Recreate complete."
echo "Public URL: http://$PUBLIC_IP/"
echo "API Health: http://$PUBLIC_IP/health"

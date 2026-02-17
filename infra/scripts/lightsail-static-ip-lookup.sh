#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"

REGION="$(printf '%s' "$INPUT" | jq -r '.region')"
AWS_PROFILE_INPUT="$(printf '%s' "$INPUT" | jq -r '.aws_profile // ""')"
STATIC_IP_NAME="$(printf '%s' "$INPUT" | jq -r '.static_ip_name')"

AWS_CMD=(aws --region "$REGION")
if [[ -n "$AWS_PROFILE_INPUT" ]]; then
  AWS_CMD+=(--profile "$AWS_PROFILE_INPUT")
fi

if ! ACCOUNT_JSON="$("${AWS_CMD[@]}" sts get-caller-identity 2>/tmp/static-ip-lookup-auth.err)"; then
  echo "static IP lookup failed to authenticate AWS CLI. Ensure Terraform and AWS CLI use the same account/profile." >&2
  cat /tmp/static-ip-lookup-auth.err >&2 || true
  exit 1
fi

ACCOUNT_ID="$(printf '%s' "$ACCOUNT_JSON" | jq -r '.Account // ""')"

if "${AWS_CMD[@]}" lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" >/tmp/static-ip.json 2>/tmp/static-ip-lookup.err; then
  IP_ADDRESS="$(jq -r '.staticIp.ipAddress // ""' /tmp/static-ip.json)"
  ATTACHED_TO="$(jq -r '.staticIp.attachedTo // ""' /tmp/static-ip.json)"
  printf '{"exists":"true","ip_address":"%s","attached_to":"%s","account_id":"%s"}\n' "$IP_ADDRESS" "$ATTACHED_TO" "$ACCOUNT_ID"
else
  if grep -qiE 'NotFoundException|does not exist' /tmp/static-ip-lookup.err; then
    printf '{"exists":"false","ip_address":"","attached_to":"","account_id":"%s"}\n' "$ACCOUNT_ID"
  else
    echo "static IP lookup failed unexpectedly for name '$STATIC_IP_NAME' in region '$REGION'." >&2
    cat /tmp/static-ip-lookup.err >&2 || true
    exit 1
  fi
fi

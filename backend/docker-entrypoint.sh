#!/bin/sh
set -e

# Run the wait-for-services script (non-blocking exit codes handled by script)
if [ -f /app/wait-for-services.js ]; then
  echo "[entrypoint] waiting for dependent services..."
  node /app/wait-for-services.js || true
fi

# Exec the container CMD
exec "$@"

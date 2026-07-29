#!/bin/sh
set -eu

umask 0077

exec /usr/bin/setpriv \
  --reuid=10002 \
  --regid=20000 \
  --clear-groups \
  --bounding-set=-all \
  --no-new-privs \
  -- /usr/bin/env -i \
    PATH=/usr/local/bin:/usr/bin:/bin \
    HOME=/home/polyphemus-agent \
    XDG_CACHE_HOME=/home/polyphemus-agent/.cache \
    TMPDIR=/home/polyphemus-agent/tmp \
    CI=1 \
    NO_COLOR=1 \
    TERM=dumb \
    POLYPHEMUS_MODEL_PROXY_URL="${POLYPHEMUS_MODEL_PROXY_URL-}" \
    POLYPHEMUS_TASK="${POLYPHEMUS_TASK-}" \
    POLYPHEMUS_VALIDATION_COMMANDS="${POLYPHEMUS_VALIDATION_COMMANDS-}" \
    "$@"

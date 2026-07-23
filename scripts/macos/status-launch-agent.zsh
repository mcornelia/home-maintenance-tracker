#!/bin/zsh
set -euo pipefail

readonly LABEL="com.yardtracker.household"
readonly DOMAIN="gui/$(id -u)"
readonly APP_DIR="${0:A:h:h:h}"
readonly ENV_FILE="$APP_DIR/.env"

if ! launchctl print "$DOMAIN/$LABEL"; then
  print -u2 -- "Ravenwood is not registered for this macOS user."
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  readonly PORT="$(node --env-file="$ENV_FILE" -p 'process.env.PORT || "4173"')"
  print -- ""
  if /usr/bin/curl --fail --silent --max-time 2 "http://127.0.0.1:$PORT/api/health"; then
    print -- ""
    print -- "Health check passed: http://127.0.0.1:$PORT/api/health"
  else
    print -u2 -- "Health check failed on port $PORT."
    exit 1
  fi
fi

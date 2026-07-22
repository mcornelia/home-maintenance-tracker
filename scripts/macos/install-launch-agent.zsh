#!/bin/zsh
set -euo pipefail

readonly LABEL="com.yardtracker.household"
readonly SCRIPT_DIR="${0:A:h}"
readonly APP_DIR="${SCRIPT_DIR:h:h}"
readonly ENV_FILE="$APP_DIR/.env"
readonly PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
readonly LOG_DIR="$HOME/Library/Logs/Yard Tracker"
readonly DOMAIN="gui/$(id -u)"
readonly BOOTSTRAP_ATTEMPTS=10

fail() {
  print -u2 -- "Yard Tracker install: $1"
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "native service installation is supported on macOS only"
command -v node >/dev/null || fail "Node.js 22 or newer is required"
command -v pnpm >/dev/null || fail "pnpm is required to install and build Yard Tracker"
command -v plutil >/dev/null || fail "macOS plutil was not found"

readonly NODE_PATH="$(command -v node)"
readonly NODE_MAJOR="$($NODE_PATH -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 22 )) || fail "Node.js 22 or newer is required (found $($NODE_PATH --version))"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  print -- "Created $ENV_FILE"
  print -- "Set YARD_TRACKER_DATA_DIR to a private absolute path, then rerun this command."
  exit 2
fi
chmod 600 "$ENV_FILE"

readonly DATA_DIR="$($NODE_PATH --env-file="$ENV_FILE" -p 'process.env.YARD_TRACKER_DATA_DIR || ""')"
[[ -n "$DATA_DIR" ]] || fail "YARD_TRACKER_DATA_DIR is required in .env"
[[ "$DATA_DIR" == /* ]] || fail "YARD_TRACKER_DATA_DIR must be an absolute path"
[[ "$DATA_DIR" != "/absolute/path/to/yard-tracker-data" ]] || fail "replace the example YARD_TRACKER_DATA_DIR in .env"
[[ "$DATA_DIR" != "/" && "$DATA_DIR" != "$HOME" && "$DATA_DIR" != "$APP_DIR" ]] || fail "choose a dedicated private data directory"

mkdir -p "$DATA_DIR" "$LOG_DIR" "${PLIST:h}"
chmod 700 "$DATA_DIR" "$LOG_DIR"

cd "$APP_DIR"
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build

readonly PLIST_TMP="$PLIST.tmp"
rm -f "$PLIST_TMP"
plutil -create xml1 "$PLIST_TMP"
plutil -insert Label -string "$LABEL" "$PLIST_TMP"
plutil -insert ProgramArguments -json '[]' "$PLIST_TMP"
plutil -insert ProgramArguments.0 -string "$NODE_PATH" "$PLIST_TMP"
plutil -insert ProgramArguments.1 -string "--env-file=$ENV_FILE" "$PLIST_TMP"
plutil -insert ProgramArguments.2 -string "$APP_DIR/dist/index.js" "$PLIST_TMP"
plutil -insert WorkingDirectory -string "$APP_DIR" "$PLIST_TMP"
plutil -insert EnvironmentVariables -json '{}' "$PLIST_TMP"
plutil -insert EnvironmentVariables.NODE_ENV -string production "$PLIST_TMP"
plutil -insert RunAtLoad -bool true "$PLIST_TMP"
plutil -insert KeepAlive -json '{}' "$PLIST_TMP"
plutil -insert KeepAlive.SuccessfulExit -bool false "$PLIST_TMP"
plutil -insert ThrottleInterval -integer 10 "$PLIST_TMP"
plutil -insert ProcessType -string Background "$PLIST_TMP"
plutil -insert StandardOutPath -string "$LOG_DIR/yard-tracker.log" "$PLIST_TMP"
plutil -insert StandardErrorPath -string "$LOG_DIR/yard-tracker-error.log" "$PLIST_TMP"
plutil -lint "$PLIST_TMP" >/dev/null
chmod 600 "$PLIST_TMP"
mv -f "$PLIST_TMP" "$PLIST"

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
integer bootstrap_attempt=1
until launchctl bootstrap "$DOMAIN" "$PLIST"; do
  if (( bootstrap_attempt >= BOOTSTRAP_ATTEMPTS )); then
    fail "could not register the LaunchAgent after $BOOTSTRAP_ATTEMPTS attempts"
  fi
  print -u2 -- "LaunchAgent registration is not ready; retrying in one second ($bootstrap_attempt/$BOOTSTRAP_ATTEMPTS)."
  sleep 1
  (( bootstrap_attempt += 1 ))
done
launchctl kickstart -k "$DOMAIN/$LABEL"

readonly PORT="$($NODE_PATH --env-file="$ENV_FILE" -p 'process.env.PORT || "4173"')"
integer attempt=0
until /usr/bin/curl --fail --silent --max-time 2 "http://127.0.0.1:$PORT/api/health" >/dev/null; do
  (( attempt += 1 ))
  if (( attempt >= 15 )); then
    print -u2 -- "Yard Tracker did not become healthy. Recent errors:"
    /usr/bin/tail -n 20 "$LOG_DIR/yard-tracker-error.log" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

print -- "Yard Tracker is running at http://127.0.0.1:$PORT"
print -- "LAN devices can use this Mac's hostname or LAN IP when HOST=0.0.0.0."
print -- "Data: $DATA_DIR"
print -- "Service: $PLIST"
print -- "Logs: $LOG_DIR"

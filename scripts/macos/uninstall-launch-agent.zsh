#!/bin/zsh
set -euo pipefail

readonly LABEL="com.yardtracker.household"
readonly DOMAIN="gui/$(id -u)"
readonly PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
if [[ -f "$PLIST" ]]; then
  rm "$PLIST"
  print -- "Removed $PLIST"
fi
print -- "Ravenwood has been stopped and unregistered. Household data, backups, .env, and logs were left untouched."

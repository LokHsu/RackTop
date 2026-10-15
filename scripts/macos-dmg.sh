#!/usr/bin/env bash

detach_dmg() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if hdiutil detach "$1" >/dev/null; then
      return 0
    fi
    if [ "$attempt" -lt 5 ]; then
      sleep 2
    fi
  done
  printf 'Could not detach DMG after 5 attempts: %s\n' "$1" >&2
  return 1
}

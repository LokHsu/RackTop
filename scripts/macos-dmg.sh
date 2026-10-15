#!/usr/bin/env bash

detach_dmg() {
  local attempt mounts
  for attempt in 1 2 3 4 5; do
    if hdiutil detach "$1" >/dev/null; then
      return 0
    fi
    # Finder may finish ejecting asynchronously after hdiutil reports busy.
    # A missing mount is success, but failure to read mount state is not.
    if ! mounts="$(mount)"; then
      printf 'Could not read mount state: %s\n' "$1" >&2
      return 1
    fi
    if ! printf '%s\n' "$mounts" | grep -Fq " on $1 ("; then
      return 0
    fi
    if [ "$attempt" -lt 5 ]; then
      sleep 2
    fi
  done
  printf 'Could not detach DMG after 5 attempts: %s\n' "$1" >&2
  return 1
}

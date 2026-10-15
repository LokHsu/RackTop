#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/macos-dmg.sh"

run_case() (
  local scenario="$1" calls=0
  hdiutil() {
    calls=$((calls + 1))
    case "$scenario" in
      success) return 0 ;;
      retry) [ "$calls" -ge 2 ] ;;
      *) return 1 ;;
    esac
  }
  mount() {
    case "$scenario" in
      gone) printf '/dev/disk9 on /Volumes/Other (hfs, local)\n' ;;
      unknown) return 1 ;;
      *) printf '/dev/disk4 on /Volumes/安装 RackTop 1.26.0 (hfs, local)\n' ;;
    esac
  }
  sleep() { :; }
  case "$scenario" in
    busy|unknown)
      if detach_dmg '/Volumes/安装 RackTop 1.26.0'; then
        printf 'Unexpected success: %s\n' "$scenario" >&2
        exit 1
      fi
      ;;
    *) detach_dmg '/Volumes/安装 RackTop 1.26.0' ;;
  esac
  case "$scenario" in
    retry) test "$calls" -eq 2 ;;
    busy) test "$calls" -eq 5 ;;
    *) test "$calls" -eq 1 ;;
  esac
  printf 'PASS: %s\n' "$scenario"
)
for scenario in success gone retry busy unknown; do
  run_case "$scenario"
done

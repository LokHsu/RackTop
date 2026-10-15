export LANG=C LC_ALL=C
if [ "$1" = --mount ]; then
  mount=$2
  seen=$3
  current_user=$(id -un) || exit 1
  errors=$(mktemp) || exit 1
  trap 'rm -f "$errors"' EXIT HUP INT TERM
  failure() {
    if grep -q 'Permission denied' "$errors"; then printf 'permissionDenied\n'; else printf 'failed\n'; fi
  }
  [ -x "$mount" ] || { printf 'permissionDenied\n'; exit 0; }
  duplicate=0
  set --
  for path in "$HOME" "$mount/$current_user" "$mount/home/$current_user"; do
    [ -d "$path" ] || continue
    canonical=$(readlink -f -- "$path" 2>"$errors") || { failure; exit 0; }
    discovery=$(df --output=target -- "$canonical" 2>"$errors") || { failure; exit 0; }
    actual_mount=$(printf '%s\n' "$discovery" | tail -n 1)
    [ "$actual_mount" = "$mount" ] || continue
    identity=$(stat -Lc '%d:%i' -- "$canonical" 2>"$errors") || { failure; exit 0; }
    if grep -Fxq -- "$identity" "$seen"; then duplicate=1; continue; fi
    overlap=0
    for previous do
      case "$canonical/" in "$previous/"*) overlap=1 ;; esac
    done
    [ "$overlap" = 0 ] || continue
    # A later parent replaces an already selected child rather than counting both.
    remaining=$#
    while [ "$remaining" -gt 0 ]; do
      previous=$1
      shift
      case "$previous/" in "$canonical/"*) ;; *) set -- "$@" "$previous" ;; esac
      remaining=$((remaining - 1))
    done
    printf '%s\n' "$identity" >> "$seen"
    set -- "$@" "$canonical"
  done
  if [ "$#" -eq 0 ]; then
    if [ "$duplicate" = 1 ]; then
      printf 'duplicate\n'
      exit 0
    fi
    # A missing user directory means this user owns no files on the mount.
    # It is a valid zero result; failures from the actual scan still use the
    # explicit failure/permission states below.
    user_kb=0
  elif usage=$(du -skx -- "$@" 2>"$errors"); then
    user_kb=$(printf '%s\n' "$usage" | awk '$1 !~ /^[0-9]+$/ {invalid=1} {sum += $1} END {if (invalid || NR == 0) exit 1; printf "%.0f", sum}') || { printf 'failed\n'; exit 0; }
  else
    failure
    exit 0
  fi
  # Publish capacity and distribution only after both commands succeed.
  if capacity=$(df -Pk -- "$mount" 2>"$errors"); then
    values=$(printf '%s\n' "$capacity" | awk 'NR == 2 {print $3 "|" $2 "|" $4}')
    [ -n "$values" ] || exit 1
    printf 'success|%s|%s|%s\n' "$values" "$user_kb" "$(date +%s)"
  else
    failure
  fi
  exit 0
fi
seen=$(mktemp) || exit 1
trap 'rm -f "$seen"' EXIT HUP INT TERM
index=0
for mount do
  printf '%s|scanning\n' "$index"
  if result=$(timeout -k 1 600 sh "$0" --mount "$mount" "$seen"); then
    printf '%s|%s\n' "$index" "$result"
  else
    code=$?
    case "$code" in 124|137) reason=timeout ;; *) reason=failed ;; esac
    printf '%s|%s\n' "$index" "$reason"
  fi
  index=$((index + 1))
done

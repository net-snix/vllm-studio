#!/bin/sh
set -eu

root="/sys/class/powercap"
total=0
min_max=""
count=0

for dir in "$root"/intel-rapl:*; do
  [ -d "$dir" ] || continue
  name="$(cat "$dir/name" 2>/dev/null || true)"
  case "$name" in
    package-*) ;;
    *) continue ;;
  esac

  energy="$(cat "$dir/energy_uj" 2>/dev/null || true)"
  max_range="$(cat "$dir/max_energy_range_uj" 2>/dev/null || true)"
  case "$energy" in
    ''|*[!0-9]*) continue ;;
  esac

  total=$((total + energy))
  count=$((count + 1))

  case "$max_range" in
    ''|*[!0-9]*) ;;
    *)
      if [ -z "$min_max" ] || [ "$max_range" -lt "$min_max" ]; then
        min_max="$max_range"
      fi
      ;;
  esac
done

[ "$count" -gt 0 ] || exit 2
printf '%s %s\n' "$total" "$min_max"

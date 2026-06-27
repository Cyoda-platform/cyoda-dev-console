#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script="${here}/../check-release-version.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf '{"version":"0.2.0"}\n' > "$tmp/conf.json"

fail=0
check() { # desc tag want_rc
  local rc=0
  "$script" "$2" "$tmp/conf.json" >/dev/null 2>&1 || rc=$?
  if [[ "$rc" == "$3" ]]; then echo "ok: $1";
  else echo "FAIL: $1 (rc=$rc want=$3)"; fail=1; fi
}
check "exact match"     v0.2.0        0
check "rc suffix ok"    v0.2.0-rc.1   0
check "beta suffix ok"  v0.2.0-beta.2 0
check "no-v prefix ok"  0.2.0         0
check "version mismatch" v0.3.0       1
check "rc of wrong base" v0.3.0-rc.1  1
[[ "$fail" == 0 ]] && echo "ALL PASS"

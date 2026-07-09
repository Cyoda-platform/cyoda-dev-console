#!/usr/bin/env bash
# Exercises scripts/check-mcp-release-version.sh against a fixture package.json.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
guard="$here/check-mcp-release-version.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pkg="$tmp/package.json"

expect() { # <desc> <expected-exit> <tag> <version>
  echo "{\"version\":\"$4\"}" > "$pkg"
  "$guard" "$3" "$pkg" >/dev/null 2>&1; local got=$?
  if [[ "$got" != "$2" ]]; then echo "FAIL: $1 (exit $got, wanted $2)"; exit 1; fi
  echo "ok: $1"
}

expect "stable match"            0 mcp-v0.1.0        0.1.0
expect "prerelease match (kept)" 0 mcp-v0.1.0-rc.1  0.1.0-rc.1
expect "prerelease vs stable"    1 mcp-v0.1.0-rc.1  0.1.0
expect "version mismatch"        1 mcp-v0.2.0        0.1.0
expect "build-metadata stripped" 0 mcp-v0.1.0+ci    0.1.0
echo "ALL PASS"

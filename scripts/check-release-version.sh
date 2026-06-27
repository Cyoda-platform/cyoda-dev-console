#!/usr/bin/env bash
# Assert a release tag's base version matches tauri.conf.json.
# Usage: check-release-version.sh <tag> <path-to-tauri.conf.json>
set -euo pipefail

tag="${1:?tag required}"
conf="${2:?tauri.conf.json path required}"

base="${tag#v}"        # strip leading v
base="${base%%-*}"     # strip -rc.N / -beta.N prerelease
base="${base%%+*}"     # strip +build metadata

conf_version="$(jq -r '.version' "$conf")"

if [[ "$base" != "$conf_version" ]]; then
  echo "::error::tag '${tag}' (base '${base}') != tauri.conf.json version '${conf_version}'" >&2
  exit 1
fi
echo "version-ok: ${base}"

#!/usr/bin/env bash
# Assert an mcp-v* release tag's version matches apps/model-editor-mcp/package.json.
# Unlike the desktop guard, the prerelease suffix is KEPT: npm versions are
# immutable, so mcp-v0.1.0-rc.1 must map to package.json version 0.1.0-rc.1.
# Usage: check-mcp-release-version.sh <tag> <path-to-package.json>
set -euo pipefail

tag="${1:?tag required}"
pkg="${2:?package.json path required}"

base="${tag#mcp-v}"    # strip the mcp-v prefix (keep any -rc.N suffix)
base="${base%%+*}"     # drop +build metadata only

pkg_version="$(jq -r '.version' "$pkg")"

if [[ "$base" != "$pkg_version" ]]; then
  echo "::error::tag '${tag}' (version '${base}') != package.json version '${pkg_version}'" >&2
  exit 1
fi
echo "version-ok: ${base}"

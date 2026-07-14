#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$("${here}/../render-cask.sh" v0.2.0 AAAAARM111 BBBBINTEL222)"

fail=0
has() { if grep -qF "$2" <<<"$out"; then echo "ok: $1"; else echo "FAIL: $1"; fail=1; fi; }

has "version stripped of v"  'version "0.2.0"'
has "arm sha"                'arm:   "AAAAARM111"'
has "intel sha"              'intel: "BBBBINTEL222"'
has "arch map"               'arch arm: "aarch64", intel: "x86_64"'
has "dmg url scheme"         'cyoda-dev-console_#{version}_#{arch}.dmg'
has "cyoda org in url"       'github.com/cyoda/cyoda-dev-console/releases'
has "monterey floor"         'depends_on macos: :monterey'
has "app stanza"             'app "Cyoda Dev Console.app"'
[[ "$fail" == 0 ]] && echo "ALL PASS"

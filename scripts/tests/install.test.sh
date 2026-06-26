#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# Source install.sh without running main().
INSTALL_SH_TEST=1 . "${here}/../install.sh"

fail=0
eq() { if [[ "$2" == "$3" ]]; then echo "ok: $1"; else echo "FAIL: $1 ($2 != $3)"; fail=1; fi; }

eq "x86_64 -> amd64"  "$(appimage_arch x86_64)"  amd64
eq "amd64 -> amd64"   "$(appimage_arch amd64)"   amd64
eq "aarch64 -> aarch64" "$(appimage_arch aarch64)" aarch64
eq "arm64 -> aarch64" "$(appimage_arch arm64)"   aarch64
if appimage_arch riscv64 >/dev/null 2>&1; then echo "FAIL: riscv should be rejected"; fail=1; else echo "ok: riscv rejected"; fi
eq "VERSION override" "$(VERSION=v9.9.9 resolve_version)" v9.9.9
[[ "$fail" == 0 ]] && echo "ALL PASS"

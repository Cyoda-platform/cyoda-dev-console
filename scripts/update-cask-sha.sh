#!/usr/bin/env bash
# Given two .dmg paths, prints the sha256 lines to paste into the cask formula.
# Usage: ./scripts/update-cask-sha.sh <arm.dmg> <intel.dmg>
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <arm-dmg-path> <intel-dmg-path>" >&2
  exit 1
fi

ARM_DMG="$1"
INTEL_DMG="$2"

ARM_SHA=$(shasum -a 256 "$ARM_DMG" | awk '{print $1}')
INTEL_SHA=$(shasum -a 256 "$INTEL_DMG" | awk '{print $1}')

echo "  sha256 arm:   \"${ARM_SHA}\","
echo "         intel: \"${INTEL_SHA}\""

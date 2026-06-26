#!/usr/bin/env bash
# Render the Homebrew cask for a cyoda-dev-console release.
# Usage: render-cask.sh <tag> <arm_sha256> <intel_sha256>
set -euo pipefail

tag="${1:?tag required}"
arm="${2:?arm sha256 required}"
intel="${3:?intel sha256 required}"
ver="${tag#v}"

cat <<EOF
cask "cyoda-dev-console" do
  version "${ver}"
  sha256 arm:   "${arm}",
         intel: "${intel}"

  arch arm: "aarch64", intel: "x86_64"
  url "https://github.com/cyoda/cyoda-dev-console/releases/download/v#{version}/cyoda-dev-console_#{version}_#{arch}.dmg"

  name "Cyoda Dev Console"
  desc "Local file-based editor for Cyoda workflows"
  homepage "https://cyoda.com"

  auto_updates false
  depends_on macos: ">= :monterey"

  app "Cyoda Dev Console.app"

  zap trash: [
    "~/Library/Application Support/Cyoda Dev Console",
    "~/Library/Preferences/com.cyoda.devconsole.plist",
    "~/Library/Saved Application State/com.cyoda.devconsole.savedState",
  ]
end
EOF

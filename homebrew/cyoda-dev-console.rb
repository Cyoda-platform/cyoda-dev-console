cask "cyoda-dev-console" do
  version "0.1.0"
  sha256 arm:   "REPLACE_WITH_ARM_SHA",
         intel: "REPLACE_WITH_X86_SHA"

  arch arm: "aarch64", intel: "x86_64"
  url "https://github.com/Cyoda-platform/cyoda-dev-console/releases/download/v#{version}/Cyoda-Dev-Console_#{version}_#{arch}.dmg"

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

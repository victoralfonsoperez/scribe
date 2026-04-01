cask "scribe" do
  version "VERSION_PLACEHOLDER"

  url "https://github.com/victoralfonsoperez/scribe/releases/download/v#{version}/Scribe-#{version}-arm64.dmg"
  sha256 "ARM64_SHA256_PLACEHOLDER"

  name "Scribe"
  desc "Local-first meeting transcription and summarization for macOS"
  homepage "https://github.com/victoralfonsoperez/scribe"

  depends_on macos: ">= :ventura"

  app "Scribe.app"

  zap trash: [
    "~/Library/Application Support/Scribe",
    "~/Library/Logs/Scribe",
    "~/Library/Preferences/com.scribe.app.plist",
  ]
end

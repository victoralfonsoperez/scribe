cask "scribe" do
  version "VERSION_PLACEHOLDER"

  on_arm do
    url "https://github.com/victoralfonsoperez/scribe/releases/download/v#{version}/Scribe-#{version}-arm64.dmg"
    sha256 "ARM64_SHA256_PLACEHOLDER"
  end

  on_intel do
    url "https://github.com/victoralfonsoperez/scribe/releases/download/v#{version}/Scribe-#{version}-x64.dmg"
    sha256 "X64_SHA256_PLACEHOLDER"
  end

  name "Scribe"
  desc "Local-first meeting transcription and summarization for macOS"
  homepage "https://github.com/victoralfonsoperez/scribe"

  app "Scribe.app"

  zap trash: [
    "~/Library/Application Support/Scribe",
    "~/Library/Logs/Scribe",
    "~/Library/Preferences/com.scribe.app.plist",
  ]
end

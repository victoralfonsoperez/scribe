# Scribe

Local-first meeting transcription and summarization for macOS.

Scribe captures system and microphone audio during meetings, transcribes it locally using [whisper.cpp](https://github.com/ggerganov/whisper.cpp), and generates structured summaries via the Claude API.

## Features (planned)

- System + microphone audio capture via ScreenCaptureKit / CoreAudio
- Local transcription with whisper.cpp (no data leaves your machine)
- AI-powered meeting summaries (action items, decisions, follow-ups)
- Meeting history with full-text search
- Optional fully-local summarization via Ollama

## Tech stack

- **App shell**: Electron 28+
- **Frontend**: React, TypeScript, Tailwind CSS
- **Bundler**: Vite
- **Audio capture**: ScreenCaptureKit (system audio), CoreAudio (mic) via node-addon-api
- **Transcription**: whisper.cpp
- **Summarization**: Anthropic Claude API (Ollama fallback)
- **Storage**: SQLite (better-sqlite3) + filesystem

## Install

```bash
brew install --cask victoralfonsoperez/tap/scribe
```

## Prerequisites

- macOS 13+ (Ventura or later, required for ScreenCaptureKit)
- [fnm](https://github.com/Schniz/fnm) for Node version management
- Node.js 22 (pinned in `.node-version`)
- pnpm (via corepack — no global install needed)

## Getting started

```bash
# Install the correct Node version
fnm install

# Enable corepack so pnpm is available without a global install
corepack enable

# Install dependencies (scripts are disabled for security — see .npmrc)
pnpm install

# Build the native audio addon
pnpm run setup

# Start in development mode
pnpm dev
```

## Releasing a new version

1. Bump the version in `package.json`
2. Push a tag: `git tag v0.x.y && git push origin v0.x.y`
3. The [release workflow](.github/workflows/release.yml) builds for arm64 and x64, creates the GitHub Release, and auto-updates the Homebrew tap

> **First-time setup**: create a `github.com/victoralfonsoperez/homebrew-tap` repo and add a `TAP_TOKEN` secret (a GitHub PAT with `repo` scope for the tap) to this repository's settings.

## License

See [LICENSE](LICENSE).

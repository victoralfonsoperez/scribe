# Scribe

Local-first meeting transcription and summarization for macOS.

Scribe captures system and microphone audio during meetings, transcribes it locally using [whisper.cpp](https://github.com/ggerganov/whisper.cpp), and generates structured summaries via the Claude API.

## Features

- System + microphone audio capture via ScreenCaptureKit / CoreAudio
- Local transcription with whisper.cpp (no data leaves your machine)
- AI-powered meeting summaries (action items, decisions, follow-ups)
- Meeting history with full-text search
- Screenshot capture during meetings, inline in the transcript timeline
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

## Development setup

### macOS (13+ / Ventura required)

**Prerequisites:**

```bash
# Xcode Command Line Tools (git, clang, make)
xcode-select --install

# fnm — Node version manager
brew install fnm
# Add to your shell profile (~/.zshrc or ~/.bashrc), then restart your shell:
#   eval "$(fnm env --use-on-cd)"
```

**First-time setup:**

```bash
# Install and activate the pinned Node version (reads .node-version)
fnm install
fnm use

# Enable corepack (one-time per machine — makes pnpm available without a global install)
corepack enable

# Install dependencies (install scripts are disabled for security — see .npmrc)
pnpm install

# Build the native audio addon
pnpm run setup

# Start in development mode
pnpm dev
```

### Windows

**Prerequisites:**

- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) — select the **Desktop development with C++** workload
- [Git for Windows](https://git-scm.com/download/win)
- [cmake](https://cmake.org/download/) — or via winget: `winget install Kitware.CMake`
- [fnm](https://github.com/Schniz/fnm) — Node version manager:
  ```powershell
  winget install Schniz.fnm
  # Add to your PowerShell profile ($PROFILE), then restart:
  #   fnm env --use-on-cd | Out-String | Invoke-Expression
  ```

**First-time setup (PowerShell):**

```powershell
# Install and activate the pinned Node version (reads .node-version)
fnm install
fnm use

# Enable corepack (one-time per machine)
corepack enable

# Install dependencies
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

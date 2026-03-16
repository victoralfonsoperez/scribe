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

## Prerequisites

- macOS 13+ (Ventura or later, required for ScreenCaptureKit)
- Node.js (see `.nvmrc`)

## Getting started

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev
```

## License

See [LICENSE](LICENSE).

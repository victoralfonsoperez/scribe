# CLAUDE.md

## Project overview

Scribe is a local-first macOS Electron app for meeting transcription and summarization. It captures system and mic audio, transcribes locally with whisper.cpp, and summarizes via the Claude API.

## Tech stack

- Electron 28+ with Vite bundler
- React + TypeScript + Tailwind CSS (renderer)
- Node.js main process with native addons (node-addon-api + Objective-C++)
- whisper.cpp for local transcription
- Anthropic Claude API for summarization (Ollama as offline fallback)
- SQLite (better-sqlite3) + filesystem for storage
- electron-builder for packaging

## Architecture

- **Main process**: native audio bridge (ScreenCaptureKit/CoreAudio), whisper.cpp runner, LLM client, SQLite storage
- **Renderer**: React UI with recording controls, live transcript view, summary view, meeting history
- Communication between main and renderer via Electron IPC

## Code conventions

- Use TypeScript everywhere (strict mode)
- Use ESLint + Prettier for formatting and linting
- Prefer `const` over `let`; avoid `var`
- Use async/await over raw promises
- Keep main process and renderer concerns cleanly separated
- Native addon code is Objective-C++ (`.mm` files) using node-addon-api

## File structure conventions

- `src/main/` — Electron main process code
- `src/renderer/` — React frontend code
- `src/native/` — Native addon code (audio capture)
- `src/shared/` — Types and utilities shared between main and renderer

## Key patterns

- Audio is captured as PCM, written to WAV in 30-second segments
- Transcription runs whisper.cpp as a child process, fed WAV chunks
- Transcript segments stream to the renderer via IPC
- Meetings, transcript segments, and summaries are stored in SQLite
- Raw audio files are stored on the filesystem in the app data directory

## Testing

- Write tests for business logic and data layer
- Native audio code may require manual testing on macOS

## Git workflow

- Use feature branches for all development (never commit directly to main)
- Push changes and create PRs against main for review
- After completing a feature/phase, mark it as done in `ROADMAP.md`

## Platform

- macOS only (13+ / Ventura required for ScreenCaptureKit)
- Target architectures: arm64 and x86_64

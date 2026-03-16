# Scribe — Roadmap

> Local-first meeting transcription and summarization for macOS

## Architecture overview

```
┌─────────────────────────────────────────────────┐
│  Electron app                                   │
│                                                 │
│  Main process (Node.js)     Renderer (React)    │
│  ├── Native audio bridge    ├── Recording UI    │
│  │   (ScreenCaptureKit)     ├── Live transcript │
│  ├── Whisper runner          ├── Summary view    │
│  │   (whisper.cpp)          └── Meeting history │
│  ├── LLM client                                 │
│  │   (Claude API / Ollama)                      │
│  └── Storage                                    │
│      (SQLite + filesystem)                      │
└─────────────────────────────────────────────────┘
```

## Tech stack

- **Shell**: Electron 28+
- **Frontend**: React, Tailwind CSS, TypeScript
- **Bundler**: Vite
- **Audio capture**: ScreenCaptureKit (system), CoreAudio (mic) via node-addon-api
- **Transcription**: whisper.cpp (local)
- **Summarization**: Anthropic Claude API (with optional Ollama fallback)
- **Storage**: better-sqlite3, electron-store
- **Packaging**: electron-builder

## Milestones

### Phase 0 — Skeleton ✅

Set up the project foundation. Nothing functional yet, just a working dev loop.

- [x] Init Electron + Vite + React + TypeScript boilerplate
- [x] Configure Tailwind CSS
- [x] Set up electron-builder for macOS (dmg/zip)
- [x] Basic window with placeholder UI
- [x] Dev hot-reload working (renderer + main)
- [x] ESLint + Prettier config

### Phase 1 — Audio capture (proof of concept) ✅

The highest-risk piece. Validate that system audio capture works before building anything else.

- [x] Build native addon (node-addon-api + Objective-C++)
- [x] Capture microphone audio via CoreAudio → PCM buffer
- [x] Capture system/app audio via ScreenCaptureKit → PCM buffer
- [x] Mix both streams into a single buffer
- [x] Write PCM chunks to WAV files (30s segments)
- [x] Request and handle macOS permissions (microphone, screen recording)
- [x] Basic UI: start/stop recording button, audio level indicator

### Phase 2 — Transcription ✅

Wire up whisper.cpp and get text from audio.

- [x] Bundle whisper.cpp binary for macOS (arm64 + x86_64)
- [x] Download/manage Whisper models (tiny, base, small)
- [x] Spawn whisper.cpp as child process, feed WAV chunks
- [x] Parse whisper output (timestamps + text segments)
- [x] Stream transcript segments to renderer via IPC
- [x] Live transcript view (auto-scrolling, timestamped lines)
- [x] Model selector in settings (size vs speed tradeoff)

### Phase 3 — Storage & history ✅

Persist meetings so they're not lost when the app closes.

- [x] Design SQLite schema (meetings, segments, summaries)
- [x] Save transcript segments as they arrive
- [x] Save raw audio files to app data directory
- [x] Meeting history list view (date, duration, title)
- [x] Full-text search across transcripts
- [x] Delete / rename meetings
- [x] Export transcript as markdown / plain text

### Phase 4 — Summarization

The feature that turns a wall of text into something useful.

- [ ] Anthropic SDK integration (API key stored in electron-store)
- [ ] Summary prompt engineering (action items, decisions, key topics, follow-ups)
- [ ] Generate summary on meeting end (or on demand)
- [ ] Summary view with structured sections
- [ ] Re-summarize with different prompts / focus areas
- [ ] Optional: Ollama integration for fully local summarization
- [ ] Copy / export summary as markdown

### Phase 5 — Polish

Make it feel like a real app.

- [ ] Menu bar / tray icon with quick recording toggle
- [ ] Global keyboard shortcut to start/stop
- [ ] Notification when transcription completes
- [ ] Meeting auto-detection (optional — detect when Meet/Teams window is active)
- [ ] Drag-and-drop audio file import (transcribe existing recordings)
- [ ] Auto-update via electron-updater
- [ ] App icon and branding
- [ ] Light/dark theme support

## Data flow

```
Mic audio ─┐
            ├──▶ Mixer ──▶ WAV chunks ──▶ whisper.cpp ──▶ Transcript ──▶ Claude API ──▶ Summary
System audio┘       │                         │                              │
                    ▼                         ▼                              ▼
               Audio files              SQLite (segments)            SQLite (summaries)
```

## Key decisions

| Decision      | Choice              | Rationale                                           |
| ------------- | ------------------- | --------------------------------------------------- |
| App framework | Electron            | Web dev friendly, large ecosystem, proven           |
| Transcription | whisper.cpp (local) | Free, private, no internet required                 |
| Summarization | Claude API          | Best quality; Ollama as offline fallback            |
| Storage       | SQLite + filesystem | Simple, portable, no external DB                    |
| Audio capture | ScreenCaptureKit    | Only supported way for system audio on modern macOS |
| Native bridge | node-addon-api      | Stable, well-documented, good DX                    |

## Build order rationale

Phase 1 (audio) comes first because it's the highest-risk component. If system audio capture doesn't work well, the rest of the app design may need to change. Each subsequent phase builds on the previous one, so you always have a working (if incomplete) app at every stage.

## Open questions

- Speaker diarization: whisper.cpp has limited support — worth exploring whisperX or pyannote for identifying who said what
- Real-time vs batch transcription: start with batch (simpler), move to streaming later
- Meeting title: auto-generate from first few minutes of transcript via LLM?
- Multi-language support: Whisper handles this natively, but summary prompts may need adjustment

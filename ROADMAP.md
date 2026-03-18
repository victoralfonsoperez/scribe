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

- [x] Anthropic SDK integration (API key stored in settings)
- [x] Summary prompt engineering (action items, decisions, key topics, follow-ups)
- [x] Generate summary on demand
- [x] Summary view with structured sections
- [x] Re-summarize with different prompts (standard, brief, detailed)
- [x] Ollama integration for fully local summarization
- [x] Copy / export summary as markdown

### Phase 5 — Polish

Make it feel like a real app.

- [x] App icon and branding
- [x] Notification when transcription completes
- [x] Notification when summary generation completes
- [x] Menu bar / tray icon with quick recording toggle
- [ ] Global keyboard shortcut to start/stop *(deferred)*
- [ ] Meeting auto-detection (optional — detect when Meet/Teams window is active) *(deferred)*
- [ ] Drag-and-drop audio file import (transcribe existing recordings) *(deferred)*
- [ ] Auto-update via electron-updater *(deferred)*
- [x] Light/dark/system theme support

### Phase 6 — Speaker Diarization (WhisperX)

Identify *who* said *what* using WhisperX + pyannote.audio as a post-recording step. Keep whisper.cpp for live transcription.

- [ ] Bundle Python environment (micromamba/conda sidecar) for WhisperX runtime
- [ ] Install WhisperX + dependencies (faster-whisper, pyannote.audio, PyTorch)
- [ ] Settings UI for Hugging Face access token (required for pyannote diarization models)
- [ ] New `DiarizationService` — runs WhisperX on full audio after recording stops
- [ ] Add `speaker` field to `TranscriptSegment` type and SQLite schema
- [ ] Post-recording flow: merge diarization results back into existing transcript segments
- [ ] Transcript UI: color-coded speaker labels per segment
- [ ] Speaker name editing (map "Speaker 1" → "Alice")
- [ ] Include speaker attribution in summary prompts for better summaries

**Approach**: Hybrid — whisper.cpp handles real-time 30-second chunk transcription during recording. After recording stops, WhisperX processes the full audio for speaker diarization, then merges speaker labels into the existing segments. This gives pyannote full audio context for accurate speaker identification without replacing the live transcription pipeline.

### Phase 7 — Screenshot Capture (Meeting Notebook)

Capture screenshots on demand during a meeting to build a visual record alongside the transcript. Think of Scribe as a meeting notebook — audio gives you the words, screenshots give you the slides, diagrams, and shared screens.

- [ ] Add `screenshots` table in SQLite (id, meetingId, timestamp, filePath, caption)
- [ ] Screenshot capture via ScreenCaptureKit — capture current screen on demand
- [ ] Tray icon menu item: "Capture Screenshot" (available while recording)
- [ ] Global keyboard shortcut to capture screenshot during recording
- [ ] In-app capture button in the recording toolbar
- [ ] Store screenshots as PNGs in the app data directory alongside audio files
- [ ] Visual indicator / toast when a screenshot is captured (non-disruptive)
- [ ] Transcript view: inline screenshot thumbnails at the correct timestamp position
- [ ] Meeting detail view: screenshot gallery / timeline view
- [ ] Include screenshots in summary generation — send images to Claude (multimodal) for richer summaries that reference visual content
- [ ] Export: include screenshots in markdown export (as embedded images or file references)

**Approach**: User-initiated capture only — no automatic or periodic screenshots. The user decides what's worth capturing (an important slide, a diagram, a code snippet on screen) by pressing a shortcut or clicking a button. Screenshots are timestamped and linked to the transcript timeline so they appear in context. When generating summaries, attached screenshots are sent alongside the transcript to Claude's multimodal API, enabling the LLM to reference visual content in its output.

## Data flow

```
Mic audio ─┐
            ├──▶ Mixer ──▶ WAV chunks ──▶ whisper.cpp ──▶ Transcript ─┐
System audio┘       │                         │                        ├──▶ Claude API ──▶ Summary
                    ▼                         ▼                        │         │
               Audio files              SQLite (segments)              │         ▼
                                                                       │   SQLite (summaries)
               User trigger ──▶ Screenshot ──▶ PNG files ─────────────┘
                                    │
                                    ▼
                              SQLite (screenshots)
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

- Speaker diarization: planned in Phase 6 — hybrid approach with WhisperX post-processing
- Real-time vs batch transcription: using hybrid (live whisper.cpp + batch WhisperX diarization)
- Meeting title: auto-generate from first few minutes of transcript via LLM?
- Multi-language support: Whisper handles this natively, but summary prompts may need adjustment

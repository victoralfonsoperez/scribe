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
- [ ] ESC key to close screenshot lightbox *(deferred)*
- [ ] Meeting auto-detection (optional — detect when Meet/Teams window is active) *(deferred)*
- [x] Drag-and-drop audio file import (transcribe existing recordings)
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

### Phase 7 — Screenshot Capture (Meeting Notebook) ✅

Capture screenshots on demand during a meeting to build a visual record alongside the transcript. Think of Scribe as a meeting notebook — audio gives you the words, screenshots give you the slides, diagrams, and shared screens.

- [x] Add `screenshots` table in SQLite (id, meetingId, timestamp, filePath, caption)
- [x] Screenshot capture via `screencapture` CLI — capture current screen on demand
- [x] Tray icon menu item: "Capture Screenshot" (available while recording)
- [x] Global keyboard shortcut to capture screenshot during recording (⌘⇧S)
- [x] In-app capture button in the recording toolbar
- [x] Store screenshots as PNGs in the app data directory alongside audio files
- [x] Visual indicator / toast when a screenshot is captured (non-disruptive)
- [x] Transcript view: inline screenshot thumbnails at the correct timestamp position
- [x] Meeting detail view: screenshot gallery / timeline view
- [x] Include screenshots in summary generation — send images to Claude (multimodal) for richer summaries that reference visual content
- [x] Export: include screenshots in markdown export (as embedded images or file references)

**Approach**: User-initiated capture only — no automatic or periodic screenshots. The user decides what's worth capturing (an important slide, a diagram, a code snippet on screen) by pressing a shortcut or clicking a button. Screenshots are timestamped and linked to the transcript timeline so they appear in context. When generating summaries, attached screenshots are sent alongside the transcript to Claude's multimodal API, enabling the LLM to reference visual content in its output.

### Phase 8 — Windows Platform Support

Bring Scribe to Windows while keeping the macOS experience intact. The core architecture (IPC, TypeScript services, SQLite, React renderer) is already platform-agnostic — the work concentrates on replacing macOS-native components and adding platform conditionals.

#### 8a. Native Audio Capture (WASAPI) ✅

The entire native addon is Objective-C++ using ScreenCaptureKit/CoreAudio. Windows needs a parallel implementation.

- [x] Restructure `src/native/` into `darwin/`, `win32/`, `common/` directories
- [x] Extract `wav_writer.mm` → `common/wav_writer.cpp` (already pure C++, just rename)
- [x] Write `src/native/win32/audio_capture.cpp` using WASAPI
  - System audio loopback via `IAudioClient` with `AUDCLNT_STREAMFLAGS_LOOPBACK`
  - Microphone capture via WASAPI capture endpoint
  - Same N-API interface so `audio-bridge.ts` requires no changes
- [x] Permissions: return `{ mic: true, screen: true }` on Windows (no macOS-style prompts)
- [x] Update `binding.gyp` with OS conditions to select sources and link libraries per platform

#### 8b. Whisper.cpp Windows Build ✅

- [x] Platform-conditional cmake flags (remove `-DWHISPER_METAL=ON`, use CPU-only on Windows)
- [x] Binary name: `whisper-cli.exe` on Windows
- [x] Skip `fixDylibs` step (macOS-only `otool`/`install_name_tool`)
- [x] Handle Windows cmake output paths (`Release/` subdirectory)
- [x] Windows-specific prerequisite messages (Visual Studio Build Tools instead of Xcode)

#### 8c. UI Platform Adaptation

- [ ] Platform-conditional `titleBarStyle`: `hiddenInset` on macOS, standard frame on Windows
- [ ] Expose `process.platform` to renderer via preload script
- [ ] Conditional header padding (`pl-20` only on macOS for traffic light buttons)

#### 8d. Packaging & Distribution

- [ ] Add `win` target in electron-builder config (NSIS installer, x64 + arm64)
- [ ] Add `package:win` script
- [ ] Convert app icon to `.ico` format for Windows
- [ ] Document Windows build prerequisites (Visual Studio Build Tools, cmake, git)

#### 8e. Tray Icon & Platform Behavior

- [ ] Guard `setTemplateImage(true)` (macOS-only API)
- [ ] Adjust tray icon size (16x16 for Windows vs 22x22 for macOS)
- [ ] Verify tray click behavior on Windows (left-click vs right-click context menu)

#### 8f. Process & Signal Handling

- [ ] Verify `SIGTERM` process kill works correctly on Windows (Node translates to `TerminateProcess`)
- [ ] Confirm `killed` property check in transcription service handles Windows behavior

**Risk assessment**: The WASAPI audio addon is the highest-risk item — COM threading requirements and loopback capture setup need careful handling. Whisper.cpp build is medium risk (users need VS Build Tools). Everything else is low risk (straightforward platform conditionals).

**Approach**: Keep a single codebase with platform conditionals rather than forking. The N-API interface contract stays identical across platforms so all TypeScript code above the native layer works unchanged. Test on Windows end-to-end: install whisper, download model, record, transcribe, summarize.

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

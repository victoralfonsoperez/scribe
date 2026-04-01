import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingStatus, Screenshot } from "../shared/types.js";
import AudioLevelMeter from "./components/AudioLevelMeter.js";
import RecordButton from "./components/RecordButton.js";
import TranscriptView from "./components/TranscriptView.js";
import ModelSelector from "./components/ModelSelector.js";
import MeetingHistory from "./components/MeetingHistory.js";
import MeetingDetail from "./components/MeetingDetail.js";
import { useTranscription } from "./hooks/useTranscription.js";

type RecordingState = RecordingStatus["state"];
type View = "recording" | "history" | "meeting";

function App() {
  const [state, setState] = useState<RecordingState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<View>("recording");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const [importingTranscript, setImportingTranscript] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [screenshotToast, setScreenshotToast] = useState<Screenshot | null>(null);
  const screenshotToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRefs = useRef<(() => void)[]>([]);
  const handleClickRef = useRef<() => void>(() => {});
  const {
    segments,
    status: transcriptionStatus,
    clearSegments,
  } = useTranscription();

  const handleClick = useCallback(async () => {
    setError(null);

    if (state === "idle" || state === "error") {
      setState("recording");
      setSegmentCount(0);
      setLevel(0);
      clearSegments();
      const result = await window.scribe.startRecording();
      if (!result.ok) {
        setState("error");
        setError(result.error ?? "Failed to start recording");
      }
    } else if (state === "recording") {
      setState("stopping");
      const result = await window.scribe.stopRecording();
      if (!result.ok) {
        setState("error");
        setError(result.error ?? "Failed to stop recording");
      } else {
        setState("idle");
        setLevel(0);
      }
    }
  }, [state, clearSegments]);

  handleClickRef.current = handleClick;

  useEffect(() => {
    const unsub1 = window.scribe.onRecordingStatus((status) => {
      setState(status.state);
      if (status.error) setError(status.error);
    });

    const unsub2 = window.scribe.onAudioLevel(({ rms }) => {
      setLevel(rms);
    });

    const unsub3 = window.scribe.onAudioSegment(() => {
      setSegmentCount((c) => c + 1);
    });

    const unsub4 = window.scribe.onTrayToggleRecording(() => {
      handleClickRef.current();
    });

    const unsub5 = window.scribe.onScreenshotCaptured((screenshot) => {
      setScreenshotToast(screenshot);
      if (screenshotToastTimer.current) {
        clearTimeout(screenshotToastTimer.current);
      }
      screenshotToastTimer.current = setTimeout(() => {
        setScreenshotToast(null);
      }, 3000);
    });

    cleanupRefs.current = [unsub1, unsub2, unsub3, unsub4, unsub5];

    return () => {
      cleanupRefs.current.forEach((fn) => fn());
    };
  }, []);

  const handleSelectMeeting = useCallback((id: string) => {
    setSelectedMeetingId(id);
    setView("meeting");
  }, []);

  const handleBackFromMeeting = useCallback(() => {
    setSelectedMeetingId(null);
    setView("history");
  }, []);

  const handleImportAudio = useCallback(
    async (filePath?: string) => {
      setError(null);
      setImporting(true);
      clearSegments();
      const result = await window.scribe.importAudio(filePath);
      setImporting(false);

      if (!result.ok) {
        if (result.error !== "Cancelled") {
          setError(result.error ?? "Import failed");
        }
        return;
      }

      if (result.meetingId) {
        setSelectedMeetingId(result.meetingId);
        setView("meeting");
      }
    },
    [clearSegments],
  );

  const handleImportTranscript = useCallback(
    async (filePath?: string) => {
      setError(null);
      setImportingTranscript(true);
      const result = await window.scribe.importTranscript(filePath);
      setImportingTranscript(false);

      if (!result.ok) {
        if (result.error !== "Cancelled") {
          setError(result.error ?? "Import failed");
        }
        return;
      }

      if (result.meetingId) {
        setSelectedMeetingId(result.meetingId);
        setView("meeting");
      }
    },
    [],
  );

  const handlePasteTranscript = useCallback(async () => {
    setError(null);
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setError("Could not read clipboard. Make sure the app has clipboard access.");
      return;
    }
    if (!text.trim()) {
      setError("Clipboard is empty");
      return;
    }
    setImportingTranscript(true);
    const result = await window.scribe.importTranscriptText(text);
    setImportingTranscript(false);
    if (!result.ok) {
      setError(result.error ?? "Import failed");
      return;
    }
    if (result.meetingId) {
      setSelectedMeetingId(result.meetingId);
      setView("meeting");
    }
  }, []);

  const handleCaptureScreenshot = useCallback(async () => {
    await window.scribe.captureScreenshot();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (!file) return;

      // Electron provides the full path via the path property
      const filePath = (file as File & { path?: string }).path;
      if (!filePath) return;

      const lower = filePath.toLowerCase();
      if (lower.endsWith(".vtt")) {
        handleImportTranscript(filePath);
      } else if (lower.endsWith(".wav")) {
        handleImportAudio(filePath);
      } else {
        setError("Only WAV audio or VTT transcript files are supported");
      }
    },
    [handleImportAudio, handleImportTranscript],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const isRecording = state === "recording" || state === "stopping";

  // Sync recording state to tray icon
  useEffect(() => {
    window.scribe.sendTrayRecordingState(state === "recording");
  }, [state]);

  return (
    <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
      {/* Header — pl-20 avoids macOS traffic light buttons */}
      <div className="flex items-center justify-between border-b border-border-default py-3 pl-20 pr-4">
        <h1 className="text-lg font-bold">Scribe</h1>
        <div className="flex items-center gap-2">
          {/* Tab navigation */}
          <div className="flex rounded-lg border border-border-default bg-bg-secondary p-0.5">
            <button
              onClick={() => setView("recording")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === "recording"
                  ? "bg-bg-active text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Recording
            </button>
            <button
              onClick={() => setView("history")}
              disabled={isRecording}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === "history" || view === "meeting"
                  ? "bg-bg-active text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              History
            </button>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Recording view */}
      {view === "recording" && (
        <>
          {error && (
            <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-2">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Idle state — prominent centered CTA */}
          {(state === "idle" || state === "error") &&
            segments.length === 0 &&
            !importing &&
            !importingTranscript && (
              <div
                className={`flex flex-1 flex-col items-center justify-center gap-5 ${
                  dragOver
                    ? "rounded-xl border-2 border-dashed border-blue-500 bg-blue-500/5 m-4"
                    : ""
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {dragOver ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-12 w-12 text-blue-500"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.5 3.75a6 6 0 00-5.98 6.496A5.25 5.25 0 006.75 20.25H18a4.5 4.5 0 002.206-8.423 3.75 3.75 0 00-4.133-4.303A6.001 6.001 0 0010.5 3.75zm2.03 5.47a.75.75 0 00-1.06 0l-3 3a.75.75 0 101.06 1.06l1.72-1.72v4.19a.75.75 0 001.5 0v-4.19l1.72 1.72a.75.75 0 101.06-1.06l-3-3z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-sm text-blue-400">
                      Drop WAV or VTT file to import
                    </p>
                  </>
                ) : (
                  <>
                    <RecordButton
                      state={state}
                      onClick={handleClick}
                      size="large"
                    />
                    <p className="text-sm text-text-tertiary">
                      {state === "error"
                        ? "Something went wrong. Try again."
                        : "Press to start recording"}
                    </p>
                    <div className="flex items-center gap-2 text-text-tertiary">
                      <div className="h-px w-8 bg-border-default" />
                      <span className="text-xs">or</span>
                      <div className="h-px w-8 bg-border-default" />
                    </div>
                    <button
                      onClick={() => handleImportAudio()}
                      className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      Import audio file
                    </button>
                      <button
                      onClick={() => handleImportTranscript()}
                      className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      Import transcript (.vtt)
                    </button>
                    <button
                      onClick={handlePasteTranscript}
                      className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      Paste transcript
                    </button>
                    <p className="text-xs text-text-tertiary">
                      or drag &amp; drop a WAV or VTT file here
                    </p>
                  </>
                )}
              </div>
            )}

          {/* Importing state */}
          {(importing || importingTranscript) && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
              <p className="text-sm text-text-secondary">
                {importingTranscript ? "Importing transcript..." : "Importing and transcribing..."}
              </p>
            </div>
          )}

          {/* Active / has-transcript state — compact toolbar */}
          {(state === "recording" ||
            state === "stopping" ||
            segments.length > 0) && (
            <>
              <div className="flex items-center gap-4 border-b border-border-default px-4 py-3">
                <RecordButton state={state} onClick={handleClick} />

                <div className="min-w-0 flex-1">
                  <AudioLevelMeter level={level} />
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs font-medium text-text-secondary">
                      {state === "idle" && "Recording complete"}
                      {state === "recording" && "Recording..."}
                      {state === "stopping" && "Stopping..."}
                      {state === "error" && "Recording failed"}
                    </p>
                    {state === "recording" && segmentCount > 0 && (
                      <span className="text-xs text-text-tertiary">
                        · {segmentCount} chunk
                        {segmentCount !== 1 ? "s" : ""} captured
                      </span>
                    )}
                  </div>
                </div>

                {state === "recording" && (
                  <button
                    onClick={handleCaptureScreenshot}
                    aria-label="Capture screenshot (⌘⇧S)"
                    title="Capture screenshot (⌘⇧S)"
                    className="shrink-0 rounded-lg p-2 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M1 8a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 018.07 3h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0016.07 6H17a2 2 0 012 2v7a2 2 0 01-2 2H3a2 2 0 01-2-2V8zm13.5 3a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM10 14a3 3 0 100-6 3 3 0 000 6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>

              <TranscriptView
                segments={segments}
                status={transcriptionStatus}
              />
            </>
          )}
        </>
      )}

      {/* History view */}
      {view === "history" && (
        <MeetingHistory onSelect={handleSelectMeeting} />
      )}

      {/* Meeting detail view */}
      {view === "meeting" && selectedMeetingId && (
        <MeetingDetail
          meetingId={selectedMeetingId}
          onBack={handleBackFromMeeting}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <ModelSelector onClose={() => setShowSettings(false)} />
      )}

      {/* Screenshot toast */}
      {screenshotToast && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-border-default bg-bg-secondary px-3 py-2 shadow-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 shrink-0 text-green-400"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs text-text-primary">Screenshot captured</span>
        </div>
      )}
    </div>
  );
}

export default App;

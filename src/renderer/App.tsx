import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingStatus } from "../shared/types.js";
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

    cleanupRefs.current = [unsub1, unsub2, unsub3, unsub4];

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
            segments.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-5">
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
    </div>
  );
}

export default App;

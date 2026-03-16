import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingStatus } from "../shared/types.js";
import AudioLevelMeter from "./components/AudioLevelMeter.js";
import RecordButton from "./components/RecordButton.js";
import TranscriptView from "./components/TranscriptView.js";
import ModelSelector from "./components/ModelSelector.js";
import { useTranscription } from "./hooks/useTranscription.js";

type RecordingState = RecordingStatus["state"];

function App() {
  const [state, setState] = useState<RecordingState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const cleanupRefs = useRef<(() => void)[]>([]);
  const { segments, status: transcriptionStatus, clearSegments } =
    useTranscription();

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

    cleanupRefs.current = [unsub1, unsub2, unsub3];

    return () => {
      cleanupRefs.current.forEach((fn) => fn());
    };
  }, []);

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

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      {/* Header — pl-20 avoids macOS traffic light buttons */}
      <div className="flex items-center justify-between border-b border-gray-800 py-3 pl-20 pr-4">
        <h1 className="text-lg font-bold">Scribe</h1>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
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

      {/* Controls Bar */}
      <div className="flex items-center gap-4 border-b border-gray-800 px-4 py-3">
        <RecordButton state={state} onClick={handleClick} />

        <div className="flex-1">
          <AudioLevelMeter level={level} />
          <div className="mt-1 flex items-center gap-2">
            <p className="text-xs font-medium text-gray-400">
              {state === "idle" && "Ready to record"}
              {state === "recording" && "Recording..."}
              {state === "stopping" && "Stopping..."}
              {state === "error" && "Error occurred"}
            </p>
            {state === "recording" && segmentCount > 0 && (
              <span className="text-xs text-gray-500">
                · {segmentCount} segment{segmentCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Transcript View */}
      <TranscriptView segments={segments} status={transcriptionStatus} />

      {/* Settings Modal */}
      {showSettings && (
        <ModelSelector onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default App;

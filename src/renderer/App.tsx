import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingStatus } from "../shared/types.js";
import AudioLevelMeter from "./components/AudioLevelMeter.js";
import RecordButton from "./components/RecordButton.js";

type RecordingState = RecordingStatus["state"];

function App() {
  const [state, setState] = useState<RecordingState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);
  const cleanupRefs = useRef<(() => void)[]>([]);

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
  }, [state]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-950 text-white">
      <h1 className="mb-2 text-2xl font-bold">Scribe</h1>
      <p className="mb-8 text-gray-400">
        Meeting transcription & summarization
      </p>

      <RecordButton state={state} onClick={handleClick} />

      <p className="mt-4 text-sm font-medium text-gray-300">
        {state === "idle" && "Ready to record"}
        {state === "recording" && "Recording..."}
        {state === "stopping" && "Stopping..."}
        {state === "error" && "Error occurred"}
      </p>

      <div className="mt-6">
        <AudioLevelMeter level={level} />
      </div>

      {state === "recording" && segmentCount > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {segmentCount} segment{segmentCount !== 1 ? "s" : ""} saved
        </p>
      )}

      {error && (
        <p className="mt-3 max-w-xs text-center text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default App;

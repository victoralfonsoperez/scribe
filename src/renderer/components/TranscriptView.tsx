import { useEffect, useRef } from "react";
import type {
  TranscriptSegment,
  TranscriptionStatus,
} from "../../shared/types.js";

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  status: TranscriptionStatus;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function TranscriptView({
  segments,
  status,
}: TranscriptViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments.length, status]);

  if (segments.length === 0 && status.state === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        <p className="text-sm">No transcript yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="space-y-3">
        {segments.map((seg) => (
          <div key={seg.id} className="flex gap-3">
            <span className="shrink-0 pt-0.5 font-mono text-xs text-gray-500">
              {formatTime(seg.startTime)}
            </span>
            <p className="text-sm leading-relaxed text-gray-200">{seg.text}</p>
          </div>
        ))}
      </div>

      {status.state === "transcribing" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          Transcribing audio...
        </div>
      )}

      {status.state === "error" && (
        <p className="mt-4 text-xs text-red-400">{status.error}</p>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

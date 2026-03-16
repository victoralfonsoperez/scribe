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
        <p className="text-sm">
          Transcript will appear here during recording...
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="space-y-2">
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
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          Transcribing segment {status.segmentIndex + 1}...
        </div>
      )}

      {status.state === "error" && (
        <p className="mt-3 text-xs text-red-400">{status.error}</p>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

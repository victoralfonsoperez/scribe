import { useEffect, useRef, useState } from "react";
import type {
  TranscriptSegment,
  TranscriptionStatus,
  Screenshot,
} from "../../shared/types.js";

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  status: TranscriptionStatus;
  screenshots?: Screenshot[];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function InlineScreenshot({ screenshot }: { screenshot: Screenshot }) {
  const [src, setSrc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.scribe.getScreenshotImage(screenshot.filePath).then((data) => {
      if (!cancelled) setSrc(data);
    });
    return () => { cancelled = true; };
  }, [screenshot.filePath]);

  if (!src) return null;

  return (
    <>
      <button
        onClick={() => setExpanded(true)}
        className="my-1 block overflow-hidden rounded border border-border-default"
        aria-label="View screenshot"
      >
        <img
          src={src}
          alt="Screenshot"
          className="h-16 max-w-full object-cover"
        />
      </button>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpanded(false)}
        >
          <img
            src={src}
            alt="Screenshot"
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={() => setExpanded(false)}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

export default function TranscriptView({
  segments,
  status,
  screenshots = [],
}: TranscriptViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments.length, status]);

  if (segments.length === 0 && status.state === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center text-text-tertiary">
        <p className="text-sm">No transcript yet</p>
      </div>
    );
  }

  // Build interleaved list of segments and screenshots sorted by time
  const items: Array<
    | { kind: "segment"; seg: TranscriptSegment }
    | { kind: "screenshot"; ss: Screenshot }
  > = [];
  let ssIdx = 0;
  for (const seg of segments) {
    while (
      ssIdx < screenshots.length &&
      screenshots[ssIdx].relativeTime <= seg.endTime
    ) {
      items.push({ kind: "screenshot", ss: screenshots[ssIdx] });
      ssIdx++;
    }
    items.push({ kind: "segment", seg });
  }
  while (ssIdx < screenshots.length) {
    items.push({ kind: "screenshot", ss: screenshots[ssIdx] });
    ssIdx++;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="space-y-3">
        {items.map((item) =>
          item.kind === "segment" ? (
            <div key={item.seg.id} className="flex gap-3">
              <span className="shrink-0 pt-0.5 font-mono text-xs text-text-tertiary">
                {formatTime(item.seg.startTime)}
              </span>
              <p className="text-sm leading-relaxed text-text-secondary">
                {item.seg.text}
              </p>
            </div>
          ) : (
            <div key={item.ss.id} className="flex gap-3">
              <span className="shrink-0 pt-0.5 font-mono text-xs text-text-tertiary">
                {formatTime(item.ss.relativeTime)}
              </span>
              <InlineScreenshot screenshot={item.ss} />
            </div>
          ),
        )}
      </div>

      {status.state === "transcribing" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-text-secondary">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
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

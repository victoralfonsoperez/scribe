import { useEffect, useState } from "react";
import type { Screenshot } from "../../shared/types.js";

interface ScreenshotGalleryProps {
  meetingId: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function ScreenshotThumbnail({
  screenshot,
  onDelete,
}: {
  screenshot: Screenshot;
  onDelete: (id: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.scribe.getScreenshotImage(screenshot.filePath).then((data) => {
      if (!cancelled) setSrc(data);
    });
    return () => {
      cancelled = true;
    };
  }, [screenshot.filePath]);

  return (
    <>
      <div className="group relative overflow-hidden rounded-lg border border-border-default bg-bg-secondary">
        <button
          className="block w-full"
          onClick={() => setExpanded(true)}
          aria-label={`View screenshot at ${formatTime(screenshot.relativeTime)}`}
        >
          {src ? (
            <img
              src={src}
              alt={`Screenshot at ${formatTime(screenshot.relativeTime)}`}
              className="h-36 w-full object-cover"
            />
          ) : (
            <div className="flex h-36 items-center justify-center">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
            </div>
          )}
        </button>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="font-mono text-xs text-text-tertiary">
            {formatTime(screenshot.relativeTime)}
          </span>
          <button
            onClick={() => onDelete(screenshot.id)}
            aria-label="Delete screenshot"
            className="rounded p-0.5 text-text-tertiary opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path
                fillRule="evenodd"
                d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5A.75.75 0 019.95 6z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {expanded && src && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpanded(false)}
        >
          <img
            src={src}
            alt={`Screenshot at ${formatTime(screenshot.relativeTime)}`}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={() => setExpanded(false)}
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

export default function ScreenshotGallery({ meetingId }: ScreenshotGalleryProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.scribe.listScreenshots(meetingId).then((list) => {
      setScreenshots(list);
      setLoading(false);
    });
  }, [meetingId]);

  const handleDelete = async (id: string) => {
    await window.scribe.deleteScreenshot(id);
    setScreenshots((prev) => prev.filter((s) => s.id !== id));
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-tertiary">
        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
        Loading screenshots...
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-tertiary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-10 w-10 opacity-30"
        >
          <path
            fillRule="evenodd"
            d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm">No screenshots captured</p>
        <p className="text-xs">
          Use the camera button or ⌘⇧S while recording
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3">
        {screenshots.map((ss) => (
          <ScreenshotThumbnail
            key={ss.id}
            screenshot={ss}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

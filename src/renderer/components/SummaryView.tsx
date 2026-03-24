import { useCallback, useEffect, useRef, useState } from "react";
import type { Summary, SummaryStatus } from "../../shared/types.js";

interface SummaryViewProps {
  summaries: Summary[];
  status: SummaryStatus;
  onGenerate: (promptKey?: string) => void;
  onDelete: (id: string) => void;
}

const PROMPT_OPTIONS = [
  { key: "default", label: "Standard" },
  { key: "brief", label: "Brief (TL;DR)" },
  { key: "detailed", label: "Detailed" },
  { key: "decisions", label: "Decisions & Owners" },
];

function formatSummaryContent(content: string) {
  // Split into lines and render with basic markdown-like formatting
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          className="mt-4 mb-2 text-sm font-semibold text-text-primary first:mt-0"
        >
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <li key={i} className="ml-4 text-sm text-text-secondary">
          {line.slice(2)}
        </li>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-text-secondary">
          {line}
        </p>,
      );
    }
  }
  return elements;
}

export default function SummaryView({
  summaries,
  status,
  onGenerate,
  onDelete,
}: SummaryViewProps) {
  const [showPromptMenu, setShowPromptMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const latestSummary = summaries[0] ?? null;
  const isGenerating = status.state === "generating";

  // Close prompt menu on outside click or Escape
  useEffect(() => {
    if (!showPromptMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPromptMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPromptMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPromptMenu]);

  const handleCopy = useCallback(async () => {
    if (!latestSummary) return;
    await navigator.clipboard.writeText(latestSummary.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [latestSummary]);

  // No summary yet — show generate button
  if (!latestSummary && !isGenerating) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-text-tertiary">
          No summary yet. Generate one from the transcript.
        </p>
        {status.state === "error" && (
          <p className="text-xs text-red-400">{status.error}</p>
        )}
        <button
          onClick={() => onGenerate("default")}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Generate Summary
        </button>
      </div>
    );
  }

  // Generating state
  if (isGenerating) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-text-secondary">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
        <span className="text-sm">Generating summary...</span>
      </div>
    );
  }

  // Show the latest summary
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border-default px-4 py-3">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowPromptMenu(!showPromptMenu)}
            aria-expanded={showPromptMenu}
            aria-haspopup="true"
            className="flex items-center gap-1 rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            Re-summarize
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`h-3 w-3 transition-transform ${showPromptMenu ? "rotate-180" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {showPromptMenu && (
            <div
              className="absolute top-full left-0 z-10 mt-1 rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg"
              role="menu"
            >
              {PROMPT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  role="menuitem"
                  onClick={() => {
                    setShowPromptMenu(false);
                    onGenerate(opt.key);
                  }}
                  className="block w-full px-4 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {copied && <span className="text-xs text-green-400">Copied!</span>}
        <button
          onClick={handleCopy}
          className="rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          Copy
        </button>

        <button
          onClick={() => onDelete(latestSummary.id)}
          className="rounded-lg border border-border-default px-3 py-1.5 text-xs text-red-400 hover:bg-bg-hover hover:text-red-300"
        >
          Delete
        </button>

        <span className="ml-auto truncate text-xs text-text-tertiary">
          via {latestSummary.model}
        </span>
      </div>

      {status.state === "error" && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-2">
          <p className="text-xs text-red-400">{status.error}</p>
        </div>
      )}

      {/* Summary content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {formatSummaryContent(latestSummary.content)}
      </div>
    </div>
  );
}

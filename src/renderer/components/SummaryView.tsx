import { useCallback, useState } from "react";
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
          className="mt-4 mb-2 text-sm font-semibold text-white first:mt-0"
        >
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <li key={i} className="ml-4 text-sm text-gray-300">
          {line.slice(2)}
        </li>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-gray-300">
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

  const latestSummary = summaries[0] ?? null;
  const isGenerating = status.state === "generating";

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
        <p className="text-sm text-gray-500">
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
      <div className="flex flex-1 items-center justify-center gap-2 text-gray-400">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        <span className="text-sm">Generating summary...</span>
      </div>
    );
  }

  // Show the latest summary
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-2">
        <div className="relative">
          <button
            onClick={() => setShowPromptMenu(!showPromptMenu)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            Re-summarize
          </button>
          {showPromptMenu && (
            <div className="absolute top-full left-0 z-10 mt-1 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-lg">
              {PROMPT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setShowPromptMenu(false);
                    onGenerate(opt.key);
                  }}
                  className="block w-full px-4 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-800"
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
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          Copy Summary
        </button>

        <button
          onClick={() => onDelete(latestSummary.id)}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800 hover:text-red-300"
        >
          Delete
        </button>

        <span className="ml-auto text-xs text-gray-600">
          {latestSummary.model} · {latestSummary.prompt}
        </span>
      </div>

      {status.state === "error" && (
        <div className="border-b border-red-900/50 bg-red-950/30 px-4 py-2">
          <p className="text-xs text-red-400">{status.error}</p>
        </div>
      )}

      {/* Summary content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {formatSummaryContent(latestSummary.content)}
      </div>
    </div>
  );
}

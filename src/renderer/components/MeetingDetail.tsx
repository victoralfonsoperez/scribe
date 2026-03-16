import { useCallback, useState } from "react";
import type { ExportFormat } from "../../shared/types.js";
import { useMeetingDetail } from "../hooks/useMeetings.js";
import { useSummary } from "../hooks/useSummary.js";
import TranscriptView from "./TranscriptView.js";
import SummaryView from "./SummaryView.js";

interface MeetingDetailProps {
  meetingId: string;
  onBack: () => void;
}

type Tab = "transcript" | "summary";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function MeetingDetail({
  meetingId,
  onBack,
}: MeetingDetailProps) {
  const { detail, loading } = useMeetingDetail(meetingId);
  const {
    summaries,
    status: summaryStatus,
    generate,
    deleteSummary,
  } = useSummary(meetingId);
  const [tab, setTab] = useState<Tab>("transcript");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setExporting(true);
      const content = await window.scribe.exportMeeting(meetingId, format);
      if (content) {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      setExporting(false);
    },
    [meetingId],
  );

  if (loading || !detail) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        Loading...
      </div>
    );
  }

  const { meeting, segments } = detail;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
        <button
          onClick={onBack}
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
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-white">
            {meeting.title}
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{formatDate(meeting.startedAt)}</span>
            {meeting.durationSeconds && (
              <>
                <span>·</span>
                <span>{formatDuration(meeting.durationSeconds)}</span>
              </>
            )}
            <span>·</span>
            <span>
              {segments.length} segment{segments.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Export buttons (only in transcript tab) */}
        {tab === "transcript" && (
          <div className="flex shrink-0 gap-2">
            {copied && (
              <span className="text-xs text-green-400">Copied!</span>
            )}
            <button
              onClick={() => handleExport("markdown")}
              disabled={exporting}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
            >
              Copy MD
            </button>
            <button
              onClick={() => handleExport("text")}
              disabled={exporting}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
            >
              Copy Text
            </button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-800 px-4">
        <button
          onClick={() => setTab("transcript")}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            tab === "transcript"
              ? "border-blue-500 text-white"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          Transcript
        </button>
        <button
          onClick={() => setTab("summary")}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            tab === "summary"
              ? "border-blue-500 text-white"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          Summary
        </button>
      </div>

      {/* Tab content */}
      {tab === "transcript" ? (
        <TranscriptView segments={segments} status={{ state: "idle" }} />
      ) : (
        <SummaryView
          summaries={summaries}
          status={summaryStatus}
          onGenerate={generate}
          onDelete={deleteSummary}
        />
      )}
    </div>
  );
}

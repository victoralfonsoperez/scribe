import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingListItem, SearchResultGroup } from "../../shared/types.js";
import { useMeetings, useMeetingSearch } from "../hooks/useMeetings.js";

interface MeetingHistoryProps {
  onSelect: (id: string) => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${Math.floor(seconds)}s`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function MeetingHistory({ onSelect }: MeetingHistoryProps) {
  const { meetings, loading, refresh } = useMeetings();
  const { query, results, searching, search } = useMeetingSearch();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Close delete dialog on Escape
  useEffect(() => {
    if (!deletingId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeletingId(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deletingId]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleSearchChange = useCallback(
    (value: string) => {
      clearTimeout(searchTimerRef.current);
      if (!value.trim()) {
        search("");
        return;
      }
      searchTimerRef.current = setTimeout(() => {
        search(value);
      }, 300);
    },
    [search],
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!renameValue.trim()) {
        setRenamingId(null);
        return;
      }
      await window.scribe.renameMeeting(id, renameValue.trim());
      setRenamingId(null);
      refresh();
    },
    [renameValue, refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await window.scribe.deleteMeeting(id);
      setDeletingId(null);
      refresh();
    },
    [refresh],
  );

  const showSearchResults = query.trim().length > 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search bar */}
      <div className="border-b border-border-default px-4 py-3">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="Search transcripts..."
            className="w-full rounded-lg border border-border-default bg-bg-tertiary py-2 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none"
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searching && (
            <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-text-tertiary">
            <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
            Loading meetings...
          </div>
        ) : showSearchResults ? (
          <SearchResults results={results} onSelect={onSelect} />
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <p className="text-sm">No meetings yet</p>
            <p className="mt-1 text-xs text-text-tertiary">
              Start recording to create your first meeting
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {meetings.map((meeting) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                isRenaming={renamingId === meeting.id}
                isDeleting={deletingId === meeting.id}
                renameValue={renameValue}
                renameInputRef={
                  renamingId === meeting.id ? renameInputRef : undefined
                }
                onSelect={() => onSelect(meeting.id)}
                onStartRename={() => {
                  setRenamingId(meeting.id);
                  setRenameValue(meeting.title);
                }}
                onRenameChange={setRenameValue}
                onRenameSubmit={() => handleRename(meeting.id)}
                onRenameCancel={() => setRenamingId(null)}
                onStartDelete={() => setDeletingId(meeting.id)}
                onDeleteConfirm={() => handleDelete(meeting.id)}
                onDeleteCancel={() => setDeletingId(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deletingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setDeletingId(null); }}
        >
          <div className="mx-4 w-full max-w-sm rounded-xl bg-bg-secondary p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-text-primary">
              Delete Meeting?
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              This will permanently delete the meeting and its audio files. This
              action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                Keep meeting
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MeetingRowProps {
  meeting: MeetingListItem;
  isRenaming: boolean;
  isDeleting: boolean;
  renameValue: string;
  renameInputRef?: React.RefObject<HTMLInputElement | null>;
  onSelect: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onStartDelete: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

function MeetingRow({
  meeting,
  isRenaming,
  renameValue,
  renameInputRef,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onStartDelete,
}: MeetingRowProps) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-bg-secondary/50">
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameSubmit();
              if (e.key === "Escape") onRenameCancel();
            }}
            onBlur={onRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-lg border border-border-default bg-bg-tertiary px-2 py-0.5 text-sm text-text-primary focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <span className="truncate text-sm font-medium text-text-primary">
            {meeting.title}
          </span>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
          <span>{formatDate(meeting.startedAt)}</span>
          <span>{formatTime(meeting.startedAt)}</span>
          {meeting.durationSeconds && (
            <>
              <span>·</span>
              <span>{formatDuration(meeting.durationSeconds)}</span>
            </>
          )}
          <span>·</span>
          <span>
            {meeting.segmentCount} part
            {meeting.segmentCount !== 1 ? "s" : ""}
          </span>
        </div>
      </button>

      {/* Actions (visible on hover) */}
      {!isRenaming && (
        <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            aria-label="Rename meeting"
            title="Rename"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path d="M13.488 2.513a1.75 1.75 0 00-2.475 0L3.22 10.306a1.75 1.75 0 00-.434.725l-.856 2.854a.75.75 0 00.926.926l2.854-.856a1.75 1.75 0 00.725-.434l7.793-7.793a1.75 1.75 0 000-2.475l-.74-.74z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartDelete();
            }}
            className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-hover hover:text-red-400"
            aria-label="Delete meeting"
            title="Delete"
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
      )}
    </div>
  );
}

interface SearchResultsProps {
  results: SearchResultGroup[];
  onSelect: (meetingId: string) => void;
}

function SearchResults({ results, onSelect }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-text-tertiary">
        No matching transcripts. Try a different search.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-subtle">
      {results.map((group) => (
        <button
          key={group.meetingId}
          onClick={() => onSelect(group.meetingId)}
          className="w-full px-4 py-3 text-left hover:bg-bg-secondary/50"
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-text-primary">
              {group.meetingTitle}
            </span>
            <span className="shrink-0 text-xs text-text-tertiary">
              {formatDate(group.startedAt)}
            </span>
          </div>
          <div className="mt-1 space-y-1">
            {group.matches.slice(0, 3).map((match) => (
              <div
                key={match.segmentId}
                className="flex gap-2 text-xs text-text-secondary"
              >
                <span className="shrink-0 font-mono text-text-tertiary">
                  {formatTimestamp(match.startTime)}
                </span>
                <span className="truncate">{match.text}</span>
              </div>
            ))}
            {group.matches.length > 3 && (
              <span className="text-xs text-text-tertiary">
                +{group.matches.length - 3} more
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

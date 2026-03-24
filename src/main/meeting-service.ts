import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  MeetingRepository,
  MeetingRow,
  SegmentRow,
  SearchResultRow,
} from "./meeting-repository.js";
import type { TranscriptSegment } from "../shared/types.js";
import { splitWavIntoSegments, getWavDuration } from "./audio-import.js";
import { parseVTT, parseVTTContent, parsePlainText } from "./transcript-import.js";

export type ExportFormat = "markdown" | "text";

export interface MeetingWithSegments {
  meeting: MeetingRow;
  segments: SegmentRow[];
}

export interface SearchResultGroup {
  meetingId: string;
  meetingTitle: string;
  startedAt: number;
  matches: Array<{
    segmentId: string;
    segmentIndex: number;
    startTime: number;
    endTime: number;
    text: string;
  }>;
}

export class MeetingService {
  private activeMeetingId: string | null = null;

  constructor(private repo: MeetingRepository) {}

  getActiveMeetingId(): string | null {
    return this.activeMeetingId;
  }

  setActiveMeetingId(id: string | null): void {
    this.activeMeetingId = id;
  }

  startMeeting(sessionDir: string): string {
    const id = crypto.randomUUID();
    const now = Date.now();
    const title = `Meeting ${new Date(now).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;

    this.repo.createMeeting(id, title, now, sessionDir);
    this.activeMeetingId = id;
    return id;
  }

  endMeeting(): void {
    if (!this.activeMeetingId) return;

    const meeting = this.repo.getMeeting(this.activeMeetingId);
    if (!meeting) {
      this.activeMeetingId = null;
      return;
    }

    const now = Date.now();
    const durationSeconds = (now - meeting.started_at) / 1000;
    this.repo.endMeeting(this.activeMeetingId, now, durationSeconds);
    this.activeMeetingId = null;
  }

  addSegment(segment: TranscriptSegment): void {
    if (!this.activeMeetingId) return;
    this.repo.addSegment(this.activeMeetingId, segment);
  }

  addSegmentToMeeting(meetingId: string, segment: TranscriptSegment): void {
    this.repo.addSegment(meetingId, segment);
  }

  importAudioFile(filePath: string): {
    meetingId: string;
    sessionDir: string;
    segmentCount: number;
  } {
    const { sessionDir, segmentCount } = splitWavIntoSegments(filePath);
    const duration = getWavDuration(filePath);

    const id = crypto.randomUUID();
    const now = Date.now();
    const fileName = path.basename(filePath, path.extname(filePath));
    const title = `Imported: ${fileName}`;

    this.repo.createMeeting(id, title, now, sessionDir);
    this.repo.endMeeting(id, now, duration);

    return { meetingId: id, sessionDir, segmentCount };
  }

  importTranscriptText(text: string): { meetingId: string; segmentCount: number } {
    const isVTT = text.trimStart().startsWith("WEBVTT");
    const segments = isVTT ? parseVTTContent(text) : parsePlainText(text);
    if (segments.length === 0) {
      throw new Error("No transcript content found in the pasted text");
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const title = `Pasted transcript ${new Date(now).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;
    const duration = segments[segments.length - 1].endTime;

    this.repo.createMeeting(id, title, now, "");
    this.repo.endMeeting(id, now, duration);

    for (const seg of segments) {
      this.repo.addSegment(id, seg);
    }

    return { meetingId: id, segmentCount: segments.length };
  }

  importTranscriptFile(filePath: string): { meetingId: string; segmentCount: number } {
    const segments = parseVTT(filePath);
    if (segments.length === 0) {
      throw new Error("No transcript content found in the VTT file");
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const fileName = path.basename(filePath, path.extname(filePath));
    const title = `Imported: ${fileName}`;
    const duration = segments[segments.length - 1].endTime;

    this.repo.createMeeting(id, title, now, "");
    this.repo.endMeeting(id, now, duration);

    for (const seg of segments) {
      this.repo.addSegment(id, seg);
    }

    return { meetingId: id, segmentCount: segments.length };
  }

  listMeetings(): MeetingRow[] {
    return this.repo.listMeetings();
  }

  getMeeting(id: string): MeetingWithSegments | null {
    const meeting = this.repo.getMeeting(id);
    if (!meeting) return null;

    const segments = this.repo.getSegments(id);
    return { meeting, segments };
  }

  renameMeeting(id: string, title: string): void {
    this.repo.renameMeeting(id, title);
  }

  deleteMeeting(id: string): void {
    const meeting = this.repo.getMeeting(id);
    if (!meeting) return;

    // Delete audio files from filesystem
    if (meeting.session_dir && fs.existsSync(meeting.session_dir)) {
      fs.rmSync(meeting.session_dir, { recursive: true, force: true });
    }

    // Delete from DB (CASCADE deletes segments)
    this.repo.deleteMeeting(id);
  }

  search(query: string): SearchResultGroup[] {
    const rows = this.repo.searchSegments(query);
    return this.groupSearchResults(rows);
  }

  exportTranscript(id: string, format: ExportFormat): string | null {
    const data = this.getMeeting(id);
    if (!data) return null;

    if (format === "markdown") {
      return this.formatMarkdown(data);
    }
    return this.formatText(data);
  }

  private formatMarkdown(data: MeetingWithSegments): string {
    const { meeting, segments } = data;
    const lines: string[] = [];

    lines.push(`# ${meeting.title}`);
    lines.push("");
    lines.push(
      `**Date:** ${new Date(meeting.started_at).toLocaleString()}`,
    );
    if (meeting.duration_seconds) {
      lines.push(`**Duration:** ${this.formatDuration(meeting.duration_seconds)}`);
    }
    lines.push("");
    lines.push("## Transcript");
    lines.push("");

    for (const seg of segments) {
      const time = this.formatTime(seg.start_time);
      lines.push(`**[${time}]** ${seg.text}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  private formatText(data: MeetingWithSegments): string {
    const { meeting, segments } = data;
    const lines: string[] = [];

    lines.push(meeting.title);
    lines.push("=".repeat(meeting.title.length));
    lines.push("");
    lines.push(
      `Date: ${new Date(meeting.started_at).toLocaleString()}`,
    );
    if (meeting.duration_seconds) {
      lines.push(`Duration: ${this.formatDuration(meeting.duration_seconds)}`);
    }
    lines.push("");
    lines.push("Transcript");
    lines.push("-".repeat(10));
    lines.push("");

    for (const seg of segments) {
      const time = this.formatTime(seg.start_time);
      lines.push(`[${time}] ${seg.text}`);
    }

    return lines.join("\n");
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  private formatDuration(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }

  private groupSearchResults(rows: SearchResultRow[]): SearchResultGroup[] {
    const groups = new Map<string, SearchResultGroup>();

    for (const row of rows) {
      let group = groups.get(row.meeting_id);
      if (!group) {
        group = {
          meetingId: row.meeting_id,
          meetingTitle: row.meeting_title,
          startedAt: row.started_at,
          matches: [],
        };
        groups.set(row.meeting_id, group);
      }

      group.matches.push({
        segmentId: row.segment_id,
        segmentIndex: row.segment_index,
        startTime: row.start_time,
        endTime: row.end_time,
        text: row.text,
      });
    }

    return Array.from(groups.values());
  }
}

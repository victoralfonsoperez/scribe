import type Database from "better-sqlite3";
import type { TranscriptSegment } from "../shared/types.js";

export interface MeetingRow {
  id: string;
  title: string;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number | null;
  session_dir: string;
  created_at: number;
  updated_at: number;
}

export interface SegmentRow {
  id: string;
  meeting_id: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  text: string;
  timestamp: number;
}

export interface SearchResultRow {
  segment_id: string;
  meeting_id: string;
  meeting_title: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  text: string;
  started_at: number;
}

export class MeetingRepository {
  private stmts: ReturnType<typeof this.prepareStatements>;

  constructor(private db: Database.Database) {
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insertMeeting: this.db.prepare(`
        INSERT INTO meetings (id, title, started_at, session_dir, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      updateMeetingEnd: this.db.prepare(`
        UPDATE meetings SET ended_at = ?, duration_seconds = ?, updated_at = ?
        WHERE id = ?
      `),
      getMeeting: this.db.prepare(`
        SELECT * FROM meetings WHERE id = ?
      `),
      listMeetings: this.db.prepare(`
        SELECT id, title, started_at, ended_at, duration_seconds, session_dir, created_at
        FROM meetings
        ORDER BY started_at DESC
      `),
      renameMeeting: this.db.prepare(`
        UPDATE meetings SET title = ?, updated_at = ? WHERE id = ?
      `),
      deleteMeeting: this.db.prepare(`
        DELETE FROM meetings WHERE id = ?
      `),
      insertSegment: this.db.prepare(`
        INSERT INTO segments (id, meeting_id, segment_index, start_time, end_time, text, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      getSegments: this.db.prepare(`
        SELECT * FROM segments WHERE meeting_id = ? ORDER BY segment_index ASC
      `),
      searchSegments: this.db.prepare(`
        SELECT
          s.id AS segment_id,
          s.meeting_id,
          m.title AS meeting_title,
          s.segment_index,
          s.start_time,
          s.end_time,
          s.text,
          m.started_at
        FROM segments_fts fts
        JOIN segments s ON s.rowid = fts.rowid
        JOIN meetings m ON m.id = s.meeting_id
        WHERE segments_fts MATCH ?
        ORDER BY m.started_at DESC, s.segment_index ASC
      `),
    };
  }

  createMeeting(
    id: string,
    title: string,
    startedAt: number,
    sessionDir: string,
  ): void {
    const now = Date.now();
    this.stmts.insertMeeting.run(id, title, startedAt, sessionDir, now, now);
  }

  endMeeting(id: string, endedAt: number, durationSeconds: number): void {
    this.stmts.updateMeetingEnd.run(endedAt, durationSeconds, Date.now(), id);
  }

  getMeeting(id: string): MeetingRow | undefined {
    return this.stmts.getMeeting.get(id) as MeetingRow | undefined;
  }

  listMeetings(): MeetingRow[] {
    return this.stmts.listMeetings.all() as MeetingRow[];
  }

  renameMeeting(id: string, title: string): void {
    this.stmts.renameMeeting.run(title, Date.now(), id);
  }

  deleteMeeting(id: string): void {
    this.stmts.deleteMeeting.run(id);
  }

  addSegment(meetingId: string, segment: TranscriptSegment): void {
    this.stmts.insertSegment.run(
      segment.id,
      meetingId,
      segment.segmentIndex,
      segment.startTime,
      segment.endTime,
      segment.text,
      segment.timestamp,
    );
  }

  getSegments(meetingId: string): SegmentRow[] {
    return this.stmts.getSegments.all(meetingId) as SegmentRow[];
  }

  searchSegments(query: string): SearchResultRow[] {
    // Sanitize for FTS5: wrap each token in quotes to avoid syntax errors
    const sanitized = query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => `"${token}"`)
      .join(" ");

    if (!sanitized) return [];

    return this.stmts.searchSegments.all(sanitized) as SearchResultRow[];
  }
}

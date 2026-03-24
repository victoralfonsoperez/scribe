import { ipcMain, dialog } from "electron";
import path from "node:path";
import type { MeetingService } from "./meeting-service.js";
import type { MeetingRepository } from "./meeting-repository.js";
import type { TranscriptionService } from "./transcription-service.js";
import type {
  MeetingListItem,
  MeetingDetail,
  ExportFormat,
} from "../shared/types.js";

export function registerMeetingIPC(
  meetingService: MeetingService,
  meetingRepo: MeetingRepository,
  transcriptionService?: TranscriptionService,
): void {
  ipcMain.handle("meeting:list", (): MeetingListItem[] => {
    const meetings = meetingService.listMeetings();
    return meetings.map((m) => {
      const segments = meetingRepo.getSegments(m.id);
      return {
        id: m.id,
        title: m.title,
        startedAt: m.started_at,
        endedAt: m.ended_at,
        durationSeconds: m.duration_seconds,
        segmentCount: segments.length,
      };
    });
  });

  ipcMain.handle("meeting:get", (_event, id: string): MeetingDetail | null => {
    const data = meetingService.getMeeting(id);
    if (!data) return null;

    return {
      meeting: {
        id: data.meeting.id,
        title: data.meeting.title,
        startedAt: data.meeting.started_at,
        endedAt: data.meeting.ended_at,
        durationSeconds: data.meeting.duration_seconds,
        sessionDir: data.meeting.session_dir,
        createdAt: data.meeting.created_at,
        updatedAt: data.meeting.updated_at,
      },
      segments: data.segments.map((s) => ({
        id: s.id,
        segmentIndex: s.segment_index,
        startTime: s.start_time,
        endTime: s.end_time,
        text: s.text,
        timestamp: s.timestamp,
      })),
    };
  });

  ipcMain.handle(
    "meeting:rename",
    (_event, id: string, title: string) => {
      try {
        meetingService.renameMeeting(id, title);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle("meeting:delete", (_event, id: string) => {
    try {
      meetingService.deleteMeeting(id);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("meeting:search", (_event, query: string) => {
    return meetingService.search(query);
  });

  ipcMain.handle(
    "meeting:export",
    (_event, id: string, format: ExportFormat) => {
      return meetingService.exportTranscript(id, format);
    },
  );

  ipcMain.handle("meeting:import-transcript-text", (_event, text: string) => {
    try {
      const { meetingId } = meetingService.importTranscriptText(text);
      return { ok: true, meetingId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("meeting:import-transcript", async (_event, filePath?: string) => {
    try {
      let targetPath = filePath;

      if (!targetPath) {
        const result = await dialog.showOpenDialog({
          title: "Import Transcript File",
          filters: [{ name: "Transcript Files", extensions: ["vtt"] }],
          properties: ["openFile"],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { ok: false, error: "Cancelled" };
        }
        targetPath = result.filePaths[0];
      }

      const ext = path.extname(targetPath).toLowerCase();
      if (ext !== ".vtt") {
        return { ok: false, error: "Only VTT files are supported" };
      }

      const { meetingId } = meetingService.importTranscriptFile(targetPath);
      return { ok: true, meetingId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("meeting:import-audio", async (_event, filePath?: string) => {
    try {
      let targetPath = filePath;

      if (!targetPath) {
        const result = await dialog.showOpenDialog({
          title: "Import Audio File",
          filters: [{ name: "Audio Files", extensions: ["wav"] }],
          properties: ["openFile"],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { ok: false, error: "Cancelled" };
        }
        targetPath = result.filePaths[0];
      }

      const ext = path.extname(targetPath).toLowerCase();
      if (ext !== ".wav") {
        return { ok: false, error: "Only WAV files are supported" };
      }

      const { meetingId, sessionDir, segmentCount } =
        meetingService.importAudioFile(targetPath);

      // Enqueue all segments for transcription.
      // The existing segment callback in transcription-bridge already handles
      // sending segments to the renderer and calling the onSegment callback,
      // which is wired to meetingService.addSegment in index.ts.
      // We set the active meeting so addSegment works.
      if (transcriptionService) {
        meetingService.setActiveMeetingId(meetingId);
        transcriptionService.clearSegments();
        for (let i = 0; i < segmentCount; i++) {
          const segPath = path.join(
            sessionDir,
            `segment_${String(i).padStart(4, "0")}.wav`,
          );
          transcriptionService.enqueue(segPath, i);
        }
      }

      return { ok: true, meetingId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });
}

import { execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { Screenshot } from "../shared/types.js";
import type { MeetingRepository } from "./meeting-repository.js";
import type { MeetingService } from "./meeting-service.js";

export class ScreenshotService {
  constructor(
    private meetingRepo: MeetingRepository,
    private meetingService: MeetingService,
  ) {}

  async captureScreenshot(): Promise<Screenshot | null> {
    const meetingId = this.meetingService.getActiveMeetingId();
    if (!meetingId) return null;

    const meeting = this.meetingRepo.getMeeting(meetingId);
    if (!meeting || !meeting.session_dir) return null;

    const id = crypto.randomUUID();
    const now = Date.now();
    const relativeTime = (now - meeting.started_at) / 1000;
    const filePath = path.join(meeting.session_dir, `screenshot-${now}.png`);

    await new Promise<void>((resolve, reject) => {
      execFile("screencapture", ["-x", "-t", "png", filePath], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const screenshot: Screenshot = {
      id,
      meetingId,
      timestamp: now,
      relativeTime,
      filePath,
      caption: null,
      createdAt: now,
    };

    this.meetingRepo.addScreenshot(screenshot);
    return screenshot;
  }

  listScreenshots(meetingId: string): Screenshot[] {
    return this.meetingRepo.getScreenshots(meetingId).map((row) => ({
      id: row.id,
      meetingId: row.meeting_id,
      timestamp: row.timestamp,
      relativeTime: row.relative_time,
      filePath: row.file_path,
      caption: row.caption,
      createdAt: row.created_at,
    }));
  }

  deleteScreenshot(id: string): void {
    const row = this.meetingRepo.getScreenshot(id);
    if (row?.file_path && fs.existsSync(row.file_path)) {
      try {
        fs.unlinkSync(row.file_path);
      } catch {
        // ignore fs errors
      }
    }
    this.meetingRepo.deleteScreenshot(id);
  }

  async getScreenshotImage(filePath: string): Promise<string | null> {
    try {
      const data = await fs.promises.readFile(filePath);
      return `data:image/png;base64,${data.toString("base64")}`;
    } catch {
      return null;
    }
  }
}

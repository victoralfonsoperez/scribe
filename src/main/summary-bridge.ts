import { ipcMain, BrowserWindow } from "electron";
import type { SummaryService } from "./summary-service.js";
import type { SummarySettings } from "../shared/types.js";

export function registerSummaryIPC(
  summaryService: SummaryService,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    "summary:generate",
    async (_event, meetingId: string, promptKey?: string) => {
      const win = getWindow();
      try {
        win?.webContents.send("summary:status", {
          state: "generating",
        });

        await summaryService.generateSummary(meetingId, promptKey);

        win?.webContents.send("summary:status", { state: "done" });
        return { ok: true };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        win?.webContents.send("summary:status", {
          state: "error",
          error,
        });
        return { ok: false, error };
      }
    },
  );

  ipcMain.handle("summary:list", (_event, meetingId: string) => {
    return summaryService.getSummaries(meetingId);
  });

  ipcMain.handle("summary:delete", (_event, id: string) => {
    try {
      summaryService.deleteSummary(id);
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error };
    }
  });

  ipcMain.handle("summary:get-settings", () => {
    return summaryService.getSettings();
  });

  ipcMain.handle(
    "summary:set-settings",
    (_event, settings: SummarySettings) => {
      return summaryService.setSettings(settings);
    },
  );
}

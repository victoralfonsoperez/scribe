import { ipcMain, BrowserWindow } from "electron";
import type { ScreenshotService } from "./screenshot-service.js";
import type { Screenshot } from "../shared/types.js";

const HIDE_DELAY_MS = 250;

async function hideAndCapture(
  screenshotService: ScreenshotService,
  win: BrowserWindow | null,
): Promise<Screenshot | null> {
  const shouldHide = win && !win.isDestroyed() && win.isVisible();

  if (shouldHide) {
    win.hide();
    await new Promise((resolve) => setTimeout(resolve, HIDE_DELAY_MS));
  }

  try {
    return await screenshotService.captureScreenshot();
  } finally {
    if (shouldHide && win && !win.isDestroyed()) {
      win.show();
    }
  }
}

export function registerScreenshotIPC(
  screenshotService: ScreenshotService,
  getMainWindow: () => BrowserWindow | null,
): {
  captureAndNotify: () => Promise<Screenshot | null>;
} {
  ipcMain.handle("screenshot:capture", async () => {
    try {
      const win = getMainWindow();
      const screenshot = await hideAndCapture(screenshotService, win);
      if (!screenshot) {
        return { ok: false, error: "No active recording" };
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send("screenshot:captured", screenshot);
      }
      return { ok: true, screenshot };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("screenshot:list", (_event, meetingId: string) => {
    return screenshotService.listScreenshots(meetingId);
  });

  ipcMain.handle("screenshot:delete", (_event, id: string) => {
    try {
      screenshotService.deleteScreenshot(id);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("screenshot:get-image", (_event, filePath: string) => {
    return screenshotService.getScreenshotImage(filePath);
  });

  // Helper to capture and notify from main-process triggers (tray, shortcut)
  async function captureAndNotify(): Promise<Screenshot | null> {
    try {
      const win = getMainWindow();
      const screenshot = await hideAndCapture(screenshotService, win);
      if (screenshot && win && !win.isDestroyed()) {
        win.webContents.send("screenshot:captured", screenshot);
      }
      return screenshot;
    } catch {
      return null;
    }
  }

  return { captureAndNotify };
}

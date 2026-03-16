import { ipcMain, BrowserWindow, app } from "electron";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);

interface NativeAddon {
  startRecording: (outputDir: string) => { ok: boolean; error?: string };
  stopRecording: () => { ok: boolean; error?: string };
  checkPermissions: () => { mic: boolean; screen: boolean };
  requestMicPermission: () => Promise<boolean>;
  setStatusCallback: (
    cb: (status: { state: string; error?: string }) => void,
  ) => void;
  setLevelCallback: (cb: (level: { rms: number }) => void) => void;
  setSegmentCallback: (
    cb: (segment: { path: string; index: number }) => void,
  ) => void;
}

function loadAddon(): NativeAddon {
  if (app.isPackaged) {
    const addonPath = path.join(
      process.resourcesPath,
      "native",
      "scribe_audio.node",
    );
    return require(addonPath) as NativeAddon;
  }
  // In development, load from build directory
  const addonPath = path.join(
    app.getAppPath(),
    "build",
    "Release",
    "scribe_audio.node",
  );
  return require(addonPath) as NativeAddon;
}

function getRecordingsDir(): string {
  const dir = path.join(app.getPath("userData"), "recordings");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getSessionDir(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(getRecordingsDir(), `session-${timestamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export type OnSegmentCallback = (segment: {
  path: string;
  index: number;
}) => void;

export function registerAudioIPC(
  getMainWindow: () => BrowserWindow | null,
  onSegment?: OnSegmentCallback,
): void {
  let addon: NativeAddon | null = null;

  function ensureAddon(): NativeAddon {
    if (!addon) {
      addon = loadAddon();
    }
    return addon;
  }

  function sendToRenderer(channel: string, data: unknown): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }

  // Set up native callbacks once addon is loaded
  function setupCallbacks(): void {
    const native = ensureAddon();

    native.setStatusCallback((status) => {
      sendToRenderer("recording:status", status);
    });

    native.setLevelCallback((level) => {
      sendToRenderer("recording:level", level);
    });

    native.setSegmentCallback((segment) => {
      sendToRenderer("recording:segment", segment);
      onSegment?.(segment);
    });
  }

  ipcMain.handle("recording:start", async () => {
    try {
      setupCallbacks();
      const native = ensureAddon();

      // Request mic permission first
      await native.requestMicPermission();

      const sessionDir = getSessionDir();
      const result = native.startRecording(sessionDir);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("recording:stop", async () => {
    try {
      const native = ensureAddon();
      const result = native.stopRecording();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("permissions:check", async () => {
    try {
      const native = ensureAddon();
      return native.checkPermissions();
    } catch {
      return { mic: false, screen: false };
    }
  });
}

import { app, BrowserWindow, ipcMain, globalShortcut } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerAudioIPC } from "./audio-bridge.js";
import {
  createTranscriptionServices,
  registerTranscriptionIPC,
} from "./transcription-bridge.js";
import { initDatabase, closeDatabase } from "./database.js";
import { MeetingRepository } from "./meeting-repository.js";
import { MeetingService } from "./meeting-service.js";
import { registerMeetingIPC } from "./meeting-bridge.js";
import { LLMClient } from "./llm-client.js";
import { SummaryService } from "./summary-service.js";
import { registerSummaryIPC } from "./summary-bridge.js";
import { createTray, destroyTray } from "./tray.js";
import { ScreenshotService } from "./screenshot-service.js";
import { registerScreenshotIPC } from "./screenshot-bridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST_ELECTRON = path.join(__dirname, "..");
process.env.DIST = path.join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST_ELECTRON, "../public");

let mainWindow: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    backgroundColor: "#030712",
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(__dirname, "../../build/icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, "index.html"));
  }
};

ipcMain.handle("get-version", () => app.getVersion());

// Initialize database
const db = initDatabase();
const meetingRepo = new MeetingRepository(db);
const meetingService = new MeetingService(meetingRepo);

// Set up transcription services
const { whisperManager, modelManager, transcriptionService } =
  createTranscriptionServices();

// Register transcription IPC handlers (with meeting segment persistence)
const transcriptionControls = registerTranscriptionIPC(
  () => mainWindow,
  whisperManager,
  modelManager,
  transcriptionService,
  (segment) => {
    meetingService.addSegment(segment);
  },
);

// Register audio IPC with callbacks for meeting lifecycle
registerAudioIPC(() => mainWindow, {
  onSegment: (segment) => {
    transcriptionService.enqueue(segment.path, segment.index);
  },
  onRecordingStart: (sessionDir) => {
    meetingService.startMeeting(sessionDir);
    transcriptionService.clearSegments();
    transcriptionControls.onRecordingStart();
  },
  onRecordingStop: () => {
    meetingService.endMeeting();
    transcriptionControls.onRecordingStop();
  },
});

// Register meeting IPC handlers
registerMeetingIPC(meetingService, meetingRepo, transcriptionService);

// Set up summary services
const llmClient = new LLMClient();
const summaryService = new SummaryService(llmClient, meetingRepo);
registerSummaryIPC(summaryService, () => mainWindow);

// Set up screenshot service
const screenshotService = new ScreenshotService(meetingRepo, meetingService);
const { captureAndNotify } = registerScreenshotIPC(
  screenshotService,
  () => mainWindow,
);

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(__dirname, "../../build/icon.png");
    try {
      app.dock?.setIcon(iconPath);
    } catch {
      // Icon not found — continue with default
    }
  }
  createWindow();
  createTray(() => mainWindow, () => { void captureAndNotify(); });

  globalShortcut.register("CommandOrControl+Shift+S", () => {
    void captureAndNotify();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  mainWindow = null;
  transcriptionService.stop();
  closeDatabase();
  destroyTray();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

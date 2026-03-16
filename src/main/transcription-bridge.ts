import { ipcMain, BrowserWindow } from "electron";
import { WhisperManager } from "./whisper-manager.js";
import { ModelManager } from "./model-manager.js";
import {
  TranscriptionService,
  type TranscriptSegmentCallback,
} from "./transcription-service.js";

export function createTranscriptionServices() {
  const whisperManager = new WhisperManager();
  const modelManager = new ModelManager();
  const transcriptionService = new TranscriptionService(
    whisperManager,
    modelManager,
  );

  return { whisperManager, modelManager, transcriptionService };
}

export function registerTranscriptionIPC(
  getMainWindow: () => BrowserWindow | null,
  whisperManager: WhisperManager,
  modelManager: ModelManager,
  transcriptionService: TranscriptionService,
  onSegment?: TranscriptSegmentCallback,
): void {
  function sendToRenderer(channel: string, data: unknown): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }

  // Wire up transcription callbacks to IPC
  transcriptionService.setSegmentCallback((segment) => {
    sendToRenderer("transcription:segment", segment);
    onSegment?.(segment);
  });

  transcriptionService.setStatusCallback((status) => {
    sendToRenderer("transcription:status", status);
  });

  // Transcription handlers
  ipcMain.handle("transcription:get-all", () => {
    return transcriptionService.getAllSegments();
  });

  // Model handlers
  ipcMain.handle("model:list", () => {
    return modelManager.listModels();
  });

  ipcMain.handle("model:download", async (_event, name: string) => {
    modelManager.setProgressCallback((progress) => {
      sendToRenderer("model:download-progress", progress);
    });

    const result = await modelManager.downloadModel(name);

    modelManager.setProgressCallback(null);
    return result;
  });

  ipcMain.handle("model:download-cancel", () => {
    modelManager.cancelDownload();
  });

  ipcMain.handle("model:delete", async (_event, name: string) => {
    return modelManager.deleteModel(name);
  });

  ipcMain.handle("model:get-selected", () => {
    return modelManager.getSelectedModel();
  });

  ipcMain.handle("model:set-selected", async (_event, name: string) => {
    await modelManager.setSelectedModel(name);
  });

  // Whisper binary handlers
  ipcMain.handle("whisper:status", () => {
    return whisperManager.getStatus();
  });

  ipcMain.handle("whisper:install", async () => {
    whisperManager.setProgressCallback((progress) => {
      sendToRenderer("whisper:install-progress", progress);
    });

    const result = await whisperManager.install();

    whisperManager.setProgressCallback(null);
    return result;
  });
}

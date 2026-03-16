import { contextBridge, ipcRenderer } from "electron";
import type { ScribeAPI } from "../shared/types.js";

function onEvent<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T) =>
    callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: ScribeAPI = {
  getVersion: () => ipcRenderer.invoke("get-version"),
  startRecording: () => ipcRenderer.invoke("recording:start"),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  checkPermissions: () => ipcRenderer.invoke("permissions:check"),
  onRecordingStatus: (callback) => onEvent("recording:status", callback),
  onAudioLevel: (callback) => onEvent("recording:level", callback),
  onAudioSegment: (callback) => onEvent("recording:segment", callback),

  // Transcription
  getTranscriptSegments: () => ipcRenderer.invoke("transcription:get-all"),
  onTranscriptSegment: (callback) =>
    onEvent("transcription:segment", callback),
  onTranscriptionStatus: (callback) =>
    onEvent("transcription:status", callback),

  // Model management
  listModels: () => ipcRenderer.invoke("model:list"),
  downloadModel: (name) => ipcRenderer.invoke("model:download", name),
  cancelModelDownload: () => ipcRenderer.invoke("model:download-cancel"),
  deleteModel: (name) => ipcRenderer.invoke("model:delete", name),
  getSelectedModel: () => ipcRenderer.invoke("model:get-selected"),
  setSelectedModel: (name) => ipcRenderer.invoke("model:set-selected", name),
  onModelDownloadProgress: (callback) =>
    onEvent("model:download-progress", callback),

  // Whisper binary
  getWhisperStatus: () => ipcRenderer.invoke("whisper:status"),
  installWhisper: () => ipcRenderer.invoke("whisper:install"),
  onWhisperInstallProgress: (callback) =>
    onEvent("whisper:install-progress", callback),
};

contextBridge.exposeInMainWorld("scribe", api);

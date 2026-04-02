import { contextBridge, ipcRenderer } from "electron";
import type { ScribeAPI } from "../shared/types.js";

function onEvent<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T) =>
    callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: ScribeAPI = {
  platform: process.platform,
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

  // Meetings
  listMeetings: () => ipcRenderer.invoke("meeting:list"),
  getMeeting: (id) => ipcRenderer.invoke("meeting:get", id),
  renameMeeting: (id, title) =>
    ipcRenderer.invoke("meeting:rename", id, title),
  deleteMeeting: (id) => ipcRenderer.invoke("meeting:delete", id),
  searchMeetings: (query) => ipcRenderer.invoke("meeting:search", query),
  exportMeeting: (id, format) =>
    ipcRenderer.invoke("meeting:export", id, format),

  // Import
  importAudio: (filePath?: string) =>
    ipcRenderer.invoke("meeting:import-audio", filePath),
  importTranscript: (filePath?: string) =>
    ipcRenderer.invoke("meeting:import-transcript", filePath),
  importTranscriptText: (text: string) =>
    ipcRenderer.invoke("meeting:import-transcript-text", text),

  // Model management
  listModels: () => ipcRenderer.invoke("model:list"),
  downloadModel: (name) => ipcRenderer.invoke("model:download", name),
  cancelModelDownload: () => ipcRenderer.invoke("model:download-cancel"),
  deleteModel: (name) => ipcRenderer.invoke("model:delete", name),
  getSelectedModel: () => ipcRenderer.invoke("model:get-selected"),
  setSelectedModel: (name) => ipcRenderer.invoke("model:set-selected", name),
  onModelDownloadProgress: (callback) =>
    onEvent("model:download-progress", callback),

  // Summaries
  generateSummary: (meetingId, promptKey) =>
    ipcRenderer.invoke("summary:generate", meetingId, promptKey),
  listSummaries: (meetingId) =>
    ipcRenderer.invoke("summary:list", meetingId),
  deleteSummary: (id) => ipcRenderer.invoke("summary:delete", id),
  getSummarySettings: () => ipcRenderer.invoke("summary:get-settings"),
  setSummarySettings: (settings) =>
    ipcRenderer.invoke("summary:set-settings", settings),
  onSummaryStatus: (callback) => onEvent("summary:status", callback),

  // Whisper binary
  getWhisperStatus: () => ipcRenderer.invoke("whisper:status"),
  installWhisper: () => ipcRenderer.invoke("whisper:install"),
  onWhisperInstallProgress: (callback) =>
    onEvent("whisper:install-progress", callback),

  // Screenshots
  captureScreenshot: () => ipcRenderer.invoke("screenshot:capture"),
  listScreenshots: (meetingId) =>
    ipcRenderer.invoke("screenshot:list", meetingId),
  deleteScreenshot: (id) => ipcRenderer.invoke("screenshot:delete", id),
  getScreenshotImage: (filePath) =>
    ipcRenderer.invoke("screenshot:get-image", filePath),
  onScreenshotCaptured: (callback) =>
    onEvent("screenshot:captured", callback),

  // Tray
  sendTrayRecordingState: (recording) =>
    ipcRenderer.send("tray:recording-state", recording),
  onTrayToggleRecording: (callback) =>
    onEvent("tray:toggle-recording", callback),
};

contextBridge.exposeInMainWorld("scribe", api);

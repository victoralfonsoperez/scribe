import { contextBridge, ipcRenderer } from "electron";
import type { ScribeAPI } from "../shared/types.js";

const api: ScribeAPI = {
  getVersion: () => ipcRenderer.invoke("get-version"),
  startRecording: () => ipcRenderer.invoke("recording:start"),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  checkPermissions: () => ipcRenderer.invoke("permissions:check"),
  onRecordingStatus: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: Parameters<typeof callback>[0],
    ) => callback(status);
    ipcRenderer.on("recording:status", handler);
    return () => ipcRenderer.removeListener("recording:status", handler);
  },
  onAudioLevel: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      level: Parameters<typeof callback>[0],
    ) => callback(level);
    ipcRenderer.on("recording:level", handler);
    return () => ipcRenderer.removeListener("recording:level", handler);
  },
  onAudioSegment: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      segment: Parameters<typeof callback>[0],
    ) => callback(segment);
    ipcRenderer.on("recording:segment", handler);
    return () => ipcRenderer.removeListener("recording:segment", handler);
  },
};

contextBridge.exposeInMainWorld("scribe", api);

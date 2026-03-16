import { contextBridge, ipcRenderer } from "electron";
import type { ScribeAPI } from "../shared/types.js";

const api: ScribeAPI = {
  getVersion: () => ipcRenderer.invoke("get-version"),
};

contextBridge.exposeInMainWorld("scribe", api);

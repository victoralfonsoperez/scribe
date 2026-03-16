import type { ScribeAPI } from "../shared/types.js";

declare global {
  interface Window {
    scribe: ScribeAPI;
  }
}

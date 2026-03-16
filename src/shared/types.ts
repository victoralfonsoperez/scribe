export interface RecordingStatus {
  state: "idle" | "recording" | "stopping" | "error";
  error?: string;
}

export interface AudioLevel {
  rms: number;
}

export interface AudioSegment {
  path: string;
  index: number;
}

export interface PermissionsStatus {
  mic: boolean;
  screen: boolean;
}

export interface TranscriptSegment {
  id: string;
  segmentIndex: number;
  startTime: number;
  endTime: number;
  text: string;
  timestamp: number;
}

export type TranscriptionStatus =
  | { state: "idle" }
  | { state: "transcribing"; segmentIndex: number }
  | { state: "error"; error: string };

export interface WhisperModelInfo {
  name: string;
  size: string;
  downloaded: boolean;
  filePath?: string;
}

export interface ModelDownloadProgress {
  model: string;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface WhisperInstallProgress {
  percent: number;
  status: string;
}

export interface ScribeAPI {
  getVersion: () => Promise<string>;
  startRecording: () => Promise<{ ok: boolean; error?: string }>;
  stopRecording: () => Promise<{ ok: boolean; error?: string }>;
  checkPermissions: () => Promise<PermissionsStatus>;
  onRecordingStatus: (
    callback: (status: RecordingStatus) => void,
  ) => () => void;
  onAudioLevel: (callback: (level: AudioLevel) => void) => () => void;
  onAudioSegment: (callback: (segment: AudioSegment) => void) => () => void;

  // Transcription
  getTranscriptSegments: () => Promise<TranscriptSegment[]>;
  onTranscriptSegment: (
    callback: (segment: TranscriptSegment) => void,
  ) => () => void;
  onTranscriptionStatus: (
    callback: (status: TranscriptionStatus) => void,
  ) => () => void;

  // Model management
  listModels: () => Promise<WhisperModelInfo[]>;
  downloadModel: (name: string) => Promise<{ ok: boolean; error?: string }>;
  cancelModelDownload: () => Promise<void>;
  deleteModel: (name: string) => Promise<{ ok: boolean; error?: string }>;
  getSelectedModel: () => Promise<string>;
  setSelectedModel: (name: string) => Promise<void>;
  onModelDownloadProgress: (
    callback: (progress: ModelDownloadProgress) => void,
  ) => () => void;

  // Whisper binary
  getWhisperStatus: () => Promise<{
    installed: boolean;
    path?: string;
    version?: string;
  }>;
  installWhisper: () => Promise<{ ok: boolean; error?: string }>;
  onWhisperInstallProgress: (
    callback: (progress: WhisperInstallProgress) => void,
  ) => () => void;
}

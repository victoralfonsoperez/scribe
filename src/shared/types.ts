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
}

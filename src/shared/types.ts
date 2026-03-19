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

// Meeting types
export interface Meeting {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number | null;
  sessionDir: string;
  createdAt: number;
  updatedAt: number;
}

export interface MeetingListItem {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number | null;
  segmentCount: number;
}

export interface MeetingDetail {
  meeting: Meeting;
  segments: TranscriptSegment[];
}

export interface SearchResultMatch {
  segmentId: string;
  segmentIndex: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface SearchResultGroup {
  meetingId: string;
  meetingTitle: string;
  startedAt: number;
  matches: SearchResultMatch[];
}

export type ExportFormat = "markdown" | "text";

// Summary types
export interface Summary {
  id: string;
  meetingId: string;
  prompt: string;
  content: string;
  model: string;
  createdAt: number;
}

export interface SummarySettings {
  apiKey: string;
  provider: "claude" | "ollama";
  ollamaUrl: string;
  ollamaModel: string;
}

export interface SummaryStatus {
  state: "idle" | "generating" | "done" | "error";
  error?: string;
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

  // Meetings
  listMeetings: () => Promise<MeetingListItem[]>;
  getMeeting: (id: string) => Promise<MeetingDetail | null>;
  renameMeeting: (
    id: string,
    title: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteMeeting: (
    id: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  searchMeetings: (query: string) => Promise<SearchResultGroup[]>;
  exportMeeting: (
    id: string,
    format: ExportFormat,
  ) => Promise<string | null>;

  // Import
  importAudio: (
    filePath?: string,
  ) => Promise<{ ok: boolean; meetingId?: string; error?: string }>;

  // Summaries
  generateSummary: (
    meetingId: string,
    promptKey?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  listSummaries: (meetingId: string) => Promise<Summary[]>;
  deleteSummary: (id: string) => Promise<{ ok: boolean; error?: string }>;
  getSummarySettings: () => Promise<SummarySettings>;
  setSummarySettings: (settings: SummarySettings) => Promise<void>;
  onSummaryStatus: (callback: (status: SummaryStatus) => void) => () => void;

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

  // Tray
  sendTrayRecordingState: (recording: boolean) => void;
  onTrayToggleRecording: (callback: () => void) => () => void;
}

import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import type {
  TranscriptSegment,
  TranscriptionStatus,
} from "../shared/types.js";
import { convertStereoToMono, cleanupMonoFile } from "./wav-utils.js";
import { WhisperManager } from "./whisper-manager.js";
import { ModelManager } from "./model-manager.js";

interface QueueItem {
  wavPath: string;
  segmentIndex: number;
}

export type TranscriptSegmentCallback = (segment: TranscriptSegment) => void;
export type TranscriptionStatusCallback = (
  status: TranscriptionStatus,
) => void;

export class TranscriptionService {
  private queue: QueueItem[] = [];
  private processing = false;
  private segments: TranscriptSegment[] = [];
  private currentProcess: ChildProcess | null = null;
  private onSegment: TranscriptSegmentCallback | null = null;
  private onStatus: TranscriptionStatusCallback | null = null;

  constructor(
    private whisperManager: WhisperManager,
    private modelManager: ModelManager,
  ) {}

  setSegmentCallback(cb: TranscriptSegmentCallback | null): void {
    this.onSegment = cb;
  }

  setStatusCallback(cb: TranscriptionStatusCallback | null): void {
    this.onStatus = cb;
  }

  enqueue(wavPath: string, segmentIndex: number): void {
    this.queue.push({ wavPath, segmentIndex });
    this.processNext();
  }

  getAllSegments(): TranscriptSegment[] {
    return [...this.segments];
  }

  clearSegments(): void {
    this.segments = [];
  }

  async stop(): Promise<void> {
    this.queue = [];
    if (this.currentProcess) {
      this.currentProcess.kill("SIGTERM");
      this.currentProcess = null;
    }
    this.processing = false;
    this.emitStatus({ state: "idle" });
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const item = this.queue.shift()!;

    try {
      this.emitStatus({
        state: "transcribing",
        segmentIndex: item.segmentIndex,
      });

      const segment = await this.transcribeSegment(item);
      if (segment) {
        this.segments.push(segment);
        this.onSegment?.(segment);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(
        `Transcription failed for segment ${item.segmentIndex}:`,
        error,
      );
      this.emitStatus({ state: "error", error });
    }

    this.processing = false;

    if (this.queue.length > 0) {
      this.processNext();
    } else {
      this.emitStatus({ state: "idle" });
    }
  }

  private async transcribeSegment(
    item: QueueItem,
  ): Promise<TranscriptSegment | null> {
    const whisperStatus = await this.whisperManager.getStatus();
    if (!whisperStatus.installed || !whisperStatus.path) {
      throw new Error("whisper.cpp is not installed");
    }

    const selectedModel = await this.modelManager.getSelectedModel();
    if (!selectedModel) {
      throw new Error("No model selected");
    }

    const modelPath = this.modelManager.getModelPath(selectedModel);
    if (!modelPath) {
      throw new Error(`Model "${selectedModel}" is not downloaded`);
    }

    // Convert stereo to mono
    let monoPath: string | null = null;
    try {
      monoPath = await convertStereoToMono(item.wavPath);

      const result = await this.runWhisper(
        whisperStatus.path,
        modelPath,
        monoPath,
        item.segmentIndex,
      );

      return result;
    } finally {
      if (monoPath) {
        await cleanupMonoFile(monoPath);
      }
    }
  }

  private runWhisper(
    whisperPath: string,
    modelPath: string,
    audioPath: string,
    segmentIndex: number,
  ): Promise<TranscriptSegment | null> {
    return new Promise((resolve, reject) => {
      const args = [
        "-m",
        modelPath,
        "-f",
        audioPath,
        "--output-json",
        "--no-prints",
        "--threads",
        "4",
        "--language",
        "auto",
      ];

      const child = execFile(
        whisperPath,
        args,
        {
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          this.currentProcess = null;

          if (err) {
            // Killed by us (stop) — don't report error
            if (
              (err as { signal?: string }).signal === "SIGTERM" ||
              (err as { killed?: boolean }).killed
            ) {
              resolve(null);
              return;
            }
            reject(
              new Error(
                `whisper.cpp failed: ${err.message}\nstderr: ${stderr}`,
              ),
            );
            return;
          }

          try {
            const segment = this.parseWhisperOutput(
              stdout,
              audioPath,
              segmentIndex,
            );
            resolve(segment);
          } catch (parseErr) {
            reject(parseErr);
          }
        },
      );

      this.currentProcess = child;
    });
  }

  private parseWhisperOutput(
    stdout: string,
    audioPath: string,
    segmentIndex: number,
  ): TranscriptSegment | null {
    // First try to parse the JSON output file that whisper creates
    const jsonPath = audioPath + ".json";

    let jsonData: WhisperJsonOutput | null = null;

    if (fs.existsSync(jsonPath)) {
      try {
        jsonData = JSON.parse(
          fs.readFileSync(jsonPath, "utf-8"),
        ) as WhisperJsonOutput;
        // Clean up JSON file
        fs.unlinkSync(jsonPath);
      } catch {
        // Fall through to stdout parsing
      }
    }

    // Fall back to parsing stdout
    if (!jsonData && stdout.trim()) {
      try {
        jsonData = JSON.parse(stdout) as WhisperJsonOutput;
      } catch {
        // If JSON parsing fails, treat stdout as plain text
        const text = stdout.trim();
        if (!text) return null;

        return {
          id: `seg-${segmentIndex}-${Date.now()}`,
          segmentIndex,
          startTime: segmentIndex * 30,
          endTime: (segmentIndex + 1) * 30,
          text,
          timestamp: Date.now(),
        };
      }
    }

    if (!jsonData) return null;

    // Combine all transcription segments into one
    const texts: string[] = [];
    let minStart = Infinity;
    let maxEnd = 0;

    const transcription =
      jsonData.transcription ?? jsonData.result?.segments ?? [];

    for (const seg of transcription) {
      const segText =
        typeof seg.text === "string" ? seg.text.trim() : String(seg.text ?? "");
      if (segText) {
        texts.push(segText);
      }

      const offsets = seg.offsets ?? seg.timestamps ?? {
        from: seg.t0 ?? seg.start ?? 0,
        to: seg.t1 ?? seg.end ?? 0,
      };

      const fromMs =
        typeof offsets.from === "number" ? offsets.from : parseInt(String(offsets.from), 10);
      const toMs =
        typeof offsets.to === "number" ? offsets.to : parseInt(String(offsets.to), 10);

      if (fromMs < minStart) minStart = fromMs;
      if (toMs > maxEnd) maxEnd = toMs;
    }

    const combinedText = texts.join(" ").trim();
    if (!combinedText) return null;

    // Convert ms offsets to absolute seconds based on segment index
    const baseTime = segmentIndex * 30;

    return {
      id: `seg-${segmentIndex}-${Date.now()}`,
      segmentIndex,
      startTime: baseTime + (minStart === Infinity ? 0 : minStart / 1000),
      endTime: baseTime + (maxEnd === 0 ? 30 : maxEnd / 1000),
      text: combinedText,
      timestamp: Date.now(),
    };
  }

  private emitStatus(status: TranscriptionStatus): void {
    this.onStatus?.(status);
  }
}

interface WhisperJsonSegment {
  text?: string;
  offsets?: { from: number; to: number };
  timestamps?: { from: number; to: number };
  t0?: number;
  t1?: number;
  start?: number;
  end?: number;
}

interface WhisperJsonOutput {
  transcription?: WhisperJsonSegment[];
  result?: { segments?: WhisperJsonSegment[] };
}

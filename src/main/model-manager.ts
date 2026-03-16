import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { WhisperModelInfo, ModelDownloadProgress } from "../shared/types.js";

const HF_BASE_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

const MODELS: Record<string, { file: string; size: string }> = {
  tiny: { file: "ggml-tiny.bin", size: "~75 MB" },
  base: { file: "ggml-base.bin", size: "~148 MB" },
  small: { file: "ggml-small.bin", size: "~488 MB" },
};

const SETTINGS_FILE = "settings.json";

export type ModelDownloadProgressCallback = (
  progress: ModelDownloadProgress,
) => void;

export class ModelManager {
  private modelsDir: string;
  private onProgress: ModelDownloadProgressCallback | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    this.modelsDir = path.join(app.getPath("userData"), "models");
    fs.mkdirSync(this.modelsDir, { recursive: true });
  }

  setProgressCallback(cb: ModelDownloadProgressCallback | null): void {
    this.onProgress = cb;
  }

  async listModels(): Promise<WhisperModelInfo[]> {
    const result: WhisperModelInfo[] = [];

    for (const [name, info] of Object.entries(MODELS)) {
      const filePath = path.join(this.modelsDir, info.file);
      const downloaded = fs.existsSync(filePath);
      result.push({
        name,
        size: info.size,
        downloaded,
        filePath: downloaded ? filePath : undefined,
      });
    }

    return result;
  }

  async downloadModel(
    name: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const model = MODELS[name];
    if (!model) {
      return { ok: false, error: `Unknown model: ${name}` };
    }

    const filePath = path.join(this.modelsDir, model.file);
    if (fs.existsSync(filePath)) {
      return { ok: true };
    }

    try {
      this.abortController = new AbortController();
      const url = `${HF_BASE_URL}/${model.file}`;

      const res = await fetch(url, {
        signal: this.abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Download failed: ${res.statusText}`);
      }

      const totalBytes = parseInt(
        res.headers.get("content-length") ?? "0",
        10,
      );
      let downloadedBytes = 0;

      const partPath = filePath + ".part";
      const fileStream = createWriteStream(partPath);
      const reader = res.body.getReader();

      const readable = new Readable({
        async read() {
          try {
            const { done, value } = await reader.read();
            if (done) {
              this.push(null);
              return;
            }
            downloadedBytes += value.byteLength;
            this.push(Buffer.from(value));
          } catch (err) {
            this.destroy(err as Error);
          }
        },
      });

      // Track progress via interval
      const progressInterval = setInterval(() => {
        const percent =
          totalBytes > 0
            ? Math.round((downloadedBytes / totalBytes) * 100)
            : 0;
        this.onProgress?.({
          model: name,
          percent,
          downloadedBytes,
          totalBytes,
        });
      }, 500);

      await pipeline(readable, fileStream);
      clearInterval(progressInterval);

      // Rename .part to final
      await fs.promises.rename(partPath, filePath);

      this.onProgress?.({
        model: name,
        percent: 100,
        downloadedBytes: totalBytes,
        totalBytes,
      });

      this.abortController = null;
      return { ok: true };
    } catch (err) {
      this.abortController = null;

      // Clean up partial download
      const partPath = filePath + ".part";
      await fs.promises.unlink(partPath).catch(() => {});

      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: "Download cancelled" };
      }

      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error };
    }
  }

  cancelDownload(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async deleteModel(
    name: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const model = MODELS[name];
    if (!model) {
      return { ok: false, error: `Unknown model: ${name}` };
    }

    const filePath = path.join(this.modelsDir, model.file);
    try {
      await fs.promises.unlink(filePath);

      // If deleted model was selected, clear selection
      const selected = await this.getSelectedModel();
      if (selected === name) {
        await this.setSelectedModel("");
      }

      return { ok: true };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ok: true };
      }
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error };
    }
  }

  async getSelectedModel(): Promise<string> {
    const settingsPath = path.join(this.modelsDir, SETTINGS_FILE);
    try {
      const data = JSON.parse(
        await fs.promises.readFile(settingsPath, "utf-8"),
      ) as { selected?: string };
      return data.selected ?? "";
    } catch {
      return "";
    }
  }

  async setSelectedModel(name: string): Promise<void> {
    const settingsPath = path.join(this.modelsDir, SETTINGS_FILE);
    await fs.promises.writeFile(
      settingsPath,
      JSON.stringify({ selected: name }, null, 2),
    );
  }

  getModelPath(name: string): string | null {
    const model = MODELS[name];
    if (!model) return null;
    const filePath = path.join(this.modelsDir, model.file);
    return fs.existsSync(filePath) ? filePath : null;
  }
}

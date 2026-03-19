import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import crypto from "node:crypto";

const SEGMENT_DURATION_SEC = 30;

interface WavInfo {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

function parseWavHeader(buf: Buffer): WavInfo {
  const riff = buf.toString("ascii", 0, 4);
  if (riff !== "RIFF") {
    throw new Error("Not a valid WAV file");
  }

  const wave = buf.toString("ascii", 8, 12);
  if (wave !== "WAVE") {
    throw new Error("Not a valid WAV file");
  }

  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  // Find the data chunk
  let offset = 12;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < buf.length - 8) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  if (dataOffset === 0) {
    throw new Error("No data chunk found in WAV file");
  }

  return { sampleRate, numChannels, bitsPerSample, dataOffset, dataSize };
}

function writeWavSegment(
  outputPath: string,
  pcmData: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): void {
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(outputPath, Buffer.concat([header, pcmData]));
}

/**
 * Split a WAV file into 30-second segment files for transcription.
 * Returns the session directory and the number of segments created.
 */
export function splitWavIntoSegments(inputPath: string): {
  sessionDir: string;
  segmentCount: number;
} {
  const buf = fs.readFileSync(inputPath);
  const info = parseWavHeader(buf);

  const bytesPerSample = info.bitsPerSample / 8;
  const blockAlign = info.numChannels * bytesPerSample;
  const bytesPerSecond = info.sampleRate * blockAlign;
  const segmentBytes = SEGMENT_DURATION_SEC * bytesPerSecond;

  // Create session directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.join(
    app.getPath("userData"),
    "recordings",
    `import-${timestamp}-${crypto.randomUUID().slice(0, 8)}`,
  );
  fs.mkdirSync(sessionDir, { recursive: true });

  const pcmData = buf.subarray(info.dataOffset, info.dataOffset + info.dataSize);
  const totalBytes = pcmData.length;
  let segmentIndex = 0;

  for (let offset = 0; offset < totalBytes; offset += segmentBytes) {
    const end = Math.min(offset + segmentBytes, totalBytes);
    const chunk = pcmData.subarray(offset, end);

    const segmentPath = path.join(
      sessionDir,
      `segment_${String(segmentIndex).padStart(4, "0")}.wav`,
    );

    writeWavSegment(
      segmentPath,
      chunk,
      info.sampleRate,
      info.numChannels,
      info.bitsPerSample,
    );

    segmentIndex++;
  }

  return { sessionDir, segmentCount: segmentIndex };
}

/**
 * Get the duration of a WAV file in seconds.
 */
export function getWavDuration(filePath: string): number {
  const buf = fs.readFileSync(filePath);
  const info = parseWavHeader(buf);
  const blockAlign = info.numChannels * (info.bitsPerSample / 8);
  return info.dataSize / (info.sampleRate * blockAlign);
}

/**
 * Tests for WAV file parsing and segmentation.
 *
 * These tests validate the TypeScript WAV parsing against the binary format
 * that our C++ WavWriter produces — acting as a cross-language contract test.
 * The WavWriter spec (common/wav_writer.cpp):
 *   - 44-byte header, PCM format (tag 1), 16-bit samples, little-endian
 *   - Supports any sample rate and channel count via reconfigure()
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, unlinkSync, rmSync } from "node:fs";
import { describe, it, expect, afterEach, vi } from "vitest";

// audio-import.ts imports `app` from electron at the top level, even though
// getWavDuration and splitWavIntoSegments don't always need it. Mock it out.
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue(tmpdir()),
  },
}));

import { getWavDuration, splitWavIntoSegments } from "../audio-import.js";

// ---------------------------------------------------------------------------
// Helper: build a minimal valid WAV buffer matching WavWriter's output format
// ---------------------------------------------------------------------------

function buildWavBuffer({
  sampleRate,
  channels,
  bitsPerSample = 16,
  durationSeconds,
}: {
  sampleRate: number;
  channels: number;
  bitsPerSample?: number;
  durationSeconds: number;
}): Buffer {
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = Math.floor(sampleRate * durationSeconds) * blockAlign;

  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // PCM data region is already zeroed (silence)
  return buf;
}

function writeTmp(buf: Buffer): string {
  const p = join(tmpdir(), `scribe-test-${Date.now()}.wav`);
  writeFileSync(p, buf);
  return p;
}

const tmpFiles: string[] = [];

afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    try {
      unlinkSync(f);
    } catch {
      // ignore — file may not exist
    }
  }
});

// ---------------------------------------------------------------------------
// getWavDuration
// ---------------------------------------------------------------------------

describe("getWavDuration", () => {
  it("returns correct duration for a 48kHz stereo 16-bit WAV (WavWriter default)", () => {
    const path = writeTmp(
      buildWavBuffer({ sampleRate: 48000, channels: 2, durationSeconds: 30 }),
    );
    tmpFiles.push(path);
    expect(getWavDuration(path)).toBeCloseTo(30, 3);
  });

  it("returns correct duration for a 44100Hz stereo WAV (common WASAPI output on Windows)", () => {
    const path = writeTmp(
      buildWavBuffer({ sampleRate: 44100, channels: 2, durationSeconds: 10 }),
    );
    tmpFiles.push(path);
    expect(getWavDuration(path)).toBeCloseTo(10, 3);
  });

  it("returns correct duration for a mono WAV", () => {
    const path = writeTmp(
      buildWavBuffer({ sampleRate: 48000, channels: 1, durationSeconds: 5 }),
    );
    tmpFiles.push(path);
    expect(getWavDuration(path)).toBeCloseTo(5, 3);
  });

  it("returns correct duration for a sub-second WAV", () => {
    const path = writeTmp(
      buildWavBuffer({ sampleRate: 48000, channels: 2, durationSeconds: 0.1 }),
    );
    tmpFiles.push(path);
    expect(getWavDuration(path)).toBeCloseTo(0.1, 2);
  });

  it("throws on a non-WAV file", () => {
    const path = join(tmpdir(), `scribe-test-bad-${Date.now()}.wav`);
    writeFileSync(path, Buffer.from("not a wav file at all"));
    tmpFiles.push(path);
    expect(() => getWavDuration(path)).toThrow("Not a valid WAV file");
  });

  it("throws when the data chunk is missing", () => {
    // Build a header with no data chunk
    const buf = Buffer.alloc(36);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(28, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(48000, 24);
    buf.writeUInt32LE(192000, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(16, 34);
    // no data chunk
    const path = join(tmpdir(), `scribe-test-nodata-${Date.now()}.wav`);
    writeFileSync(path, buf);
    tmpFiles.push(path);
    expect(() => getWavDuration(path)).toThrow("No data chunk found");
  });
});

// ---------------------------------------------------------------------------
// splitWavIntoSegments
// ---------------------------------------------------------------------------

describe("splitWavIntoSegments", () => {
  it("produces a single segment for a file shorter than 30s", () => {
    const path = writeTmp(
      buildWavBuffer({ sampleRate: 48000, channels: 2, durationSeconds: 10 }),
    );
    tmpFiles.push(path);

    const { sessionDir, segmentCount } = splitWavIntoSegments(path);
    tmpFiles.push(sessionDir); // cleaned up specially below

    expect(segmentCount).toBe(1);

    // The first segment duration should match the original
    const segPath = join(sessionDir, "segment_0000.wav");
    expect(getWavDuration(segPath)).toBeCloseTo(10, 1);
  });

  it("splits a 75s file into three segments (30 + 30 + 15)", () => {
    const path = writeTmp(
      buildWavBuffer({ sampleRate: 48000, channels: 2, durationSeconds: 75 }),
    );
    tmpFiles.push(path);

    const { segmentCount } = splitWavIntoSegments(path);
    expect(segmentCount).toBe(3);
  });

  it("produces exactly 30s segments for an even multiple", () => {
    const path = writeTmp(
      buildWavBuffer({ sampleRate: 48000, channels: 2, durationSeconds: 60 }),
    );
    tmpFiles.push(path);

    const { sessionDir, segmentCount } = splitWavIntoSegments(path);
    expect(segmentCount).toBe(2);

    for (let i = 0; i < 2; i++) {
      const seg = join(sessionDir, `segment_${String(i).padStart(4, "0")}.wav`);
      expect(getWavDuration(seg)).toBeCloseTo(30, 1);
    }
  });

  it("works for 44100Hz input (WASAPI loopback sample rate on many Windows systems)", () => {
    const path = writeTmp(
      buildWavBuffer({ sampleRate: 44100, channels: 2, durationSeconds: 45 }),
    );
    tmpFiles.push(path);

    const { segmentCount } = splitWavIntoSegments(path);
    expect(segmentCount).toBe(2);
  });
});

// Clean up session directories (rmSync recursive) after each test
afterEach(() => {
  for (const f of tmpFiles) {
    try {
      rmSync(f, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

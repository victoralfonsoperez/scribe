import fs from "node:fs";
import path from "node:path";

/**
 * Convert a stereo WAV file to mono by averaging L/R channels.
 * Returns the path to the mono WAV file (placed next to the original with _mono suffix).
 * The caller is responsible for cleaning up the mono file.
 */
export async function convertStereoToMono(inputPath: string): Promise<string> {
  const buf = await fs.promises.readFile(inputPath);

  // Parse WAV header
  const riff = buf.toString("ascii", 0, 4);
  if (riff !== "RIFF") {
    throw new Error(`Not a valid WAV file: ${inputPath}`);
  }

  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  // If already mono, just return the original path
  if (numChannels === 1) {
    return inputPath;
  }

  if (numChannels !== 2) {
    throw new Error(`Unsupported channel count: ${numChannels}`);
  }

  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
  }

  // Find the data chunk
  let dataOffset = 12;
  let dataSize = 0;

  while (dataOffset < buf.length - 8) {
    const chunkId = buf.toString("ascii", dataOffset, dataOffset + 4);
    const chunkSize = buf.readUInt32LE(dataOffset + 4);

    if (chunkId === "data") {
      dataOffset += 8;
      dataSize = chunkSize;
      break;
    }

    dataOffset += 8 + chunkSize;
  }

  if (dataSize === 0) {
    throw new Error("No data chunk found in WAV file");
  }

  const bytesPerSample = bitsPerSample / 8;
  const stereoFrameSize = bytesPerSample * 2;
  const numFrames = dataSize / stereoFrameSize;
  const monoDataSize = numFrames * bytesPerSample;

  // Build mono WAV header (44 bytes)
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + monoDataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  header.writeUInt16LE(bytesPerSample, 32); // block align
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(monoDataSize, 40);

  // Average L/R channels
  const monoData = Buffer.alloc(monoDataSize);
  for (let i = 0; i < numFrames; i++) {
    const offset = dataOffset + i * stereoFrameSize;
    const left = buf.readInt16LE(offset);
    const right = buf.readInt16LE(offset + bytesPerSample);
    const mono = Math.round((left + right) / 2);
    monoData.writeInt16LE(
      Math.max(-32768, Math.min(32767, mono)),
      i * bytesPerSample,
    );
  }

  const outputPath = path.join(
    path.dirname(inputPath),
    path.basename(inputPath, ".wav") + "_mono.wav",
  );

  await fs.promises.writeFile(outputPath, Buffer.concat([header, monoData]));
  return outputPath;
}

/**
 * Clean up a temporary mono WAV file.
 */
export async function cleanupMonoFile(monoPath: string): Promise<void> {
  if (monoPath.endsWith("_mono.wav")) {
    try {
      await fs.promises.unlink(monoPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

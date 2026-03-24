import fs from "node:fs";
import type { TranscriptSegment } from "../shared/types.js";

function parseTimestamp(ts: string): number {
  const clean = ts.trim().split(" ")[0]; // strip position info
  const parts = clean.split(":");
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

function stripVttTags(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

export function parseVTT(filePath: string): TranscriptSegment[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  const segments: TranscriptSegment[] = [];
  let i = 0;
  let segmentIndex = 0;
  const now = Date.now();

  // Skip to first cue (find first --> line)
  while (i < lines.length && !lines[i].includes("-->")) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes("-->")) {
      const arrowIdx = line.indexOf("-->");
      const startStr = line.slice(0, arrowIdx).trim();
      const rest = line.slice(arrowIdx + 3).trim();
      const endStr = rest.split(" ")[0]; // strip cue settings

      const startTime = parseTimestamp(startStr);
      const endTime = parseTimestamp(endStr);

      i++;

      // Collect all text lines until blank line or end
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }

      const rawText = textLines.join(" ").trim();
      if (!rawText) continue;

      // Teams uses <v Speaker Name>text format
      const speakerMatch = rawText.match(/^<v ([^>]+)>(.*)/s);
      let text: string;
      if (speakerMatch) {
        const speaker = speakerMatch[1].trim();
        const body = stripVttTags(speakerMatch[2]);
        text = body ? `[${speaker}]: ${body}` : "";
      } else {
        text = stripVttTags(rawText);
      }

      if (text) {
        segments.push({
          id: `seg-${segmentIndex}-${now}-${Math.random().toString(36).slice(2, 7)}`,
          segmentIndex: segmentIndex++,
          startTime,
          endTime,
          text,
          timestamp: now,
        });
      }
    } else {
      i++;
    }
  }

  return segments;
}

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

function getLogPath(): string {
  try {
    return path.join(app.getPath("logs"), "main.log");
  } catch {
    return path.join(process.cwd(), "main.log");
  }
}

function write(level: string, ...args: unknown[]): void {
  const message = args
    .map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a)))
    .join(" ");
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(getLogPath(), line);
  } catch {
    // ignore — can't log the logger failing
  }
}

export const log = {
  info: (...args: unknown[]) => write("INFO", ...args),
  warn: (...args: unknown[]) => write("WARN", ...args),
  error: (...args: unknown[]) => write("ERROR", ...args),
};

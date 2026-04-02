/**
 * Tests for WhisperManager platform-conditional build logic (Phase 8b).
 *
 * These tests verify the TypeScript layer behaviour without actually running
 * cmake or git. The install() flow is exercised with mocked child_process and
 * fs so the suite runs on any platform including macOS CI.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue(tmpdir()),
    getAppPath: vi.fn().mockReturnValue("/mock/app"),
  },
}));

// Capture execFile calls so we can assert on the arguments
const execFileCalls: { cmd: string; args: string[] }[] = [];

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd: string, args: string[], _opts: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
    execFileCalls.push({ cmd, args });
    cb(null, { stdout: "mock output", stderr: "" });
  }),
}));

// Mock fs — mkdir always succeeds; existsSync returns false by default
// (overridden per-test where needed)
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    default: {
      ...real,
      existsSync: vi.fn().mockReturnValue(false),
      promises: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        rm: vi.fn().mockResolvedValue(undefined),
        copyFile: vi.fn().mockResolvedValue(undefined),
        chmod: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue([]),
      },
    },
    existsSync: vi.fn().mockReturnValue(false),
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      copyFile: vi.fn().mockResolvedValue(undefined),
      chmod: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
    },
  };
});

import fs from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Make existsSync return true only for a specific path
function fakeExists(...paths: string[]) {
  vi.mocked(fs.existsSync).mockImplementation((p) =>
    paths.includes(String(p)),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BINARY_NAME", () => {
  // BINARY_NAME is a module-level constant evaluated at import time.
  // vi.resetModules() clears the module cache so the next import re-evaluates
  // it with the current process.platform. The vi.mock() factories registered
  // at the top of this file are NOT cleared by resetModules, so mocks stay.

  it("uses .exe extension on Windows", async () => {
    vi.resetModules();
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    expect(mgr.getWhisperPath()).toMatch(/whisper-cli\.exe$/);
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("has no extension on macOS", async () => {
    vi.resetModules();
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    const p = mgr.getWhisperPath();
    expect(p).toMatch(/whisper-cli$/);
    expect(p).not.toMatch(/\.exe/);
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });
});

describe("cmake configuration flags", () => {
  beforeEach(() => {
    execFileCalls.length = 0;
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it("includes -DWHISPER_METAL=ON on macOS", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

    // Simulate finding the built binary at a known path
    const fakeBinary = join(tmpdir(), "bin", "build", "bin", "whisper-cli");
    fakeExists(fakeBinary);
    vi.mocked(fs.promises.readdir).mockResolvedValue([
      { name: "whisper-cli", isFile: () => true, isDirectory: () => false } as never,
    ]);

    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    await mgr.install();

    const cmakeConfigCall = execFileCalls.find(
      (c) => c.cmd === "cmake" && c.args.includes(".."),
    );
    expect(cmakeConfigCall?.args).toContain("-DWHISPER_METAL=ON");

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("omits -DWHISPER_METAL=ON on Windows (CPU-only build)", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    const fakeBinary = join(tmpdir(), "bin", "build", "bin", "whisper-cli.exe");
    fakeExists(fakeBinary);
    vi.mocked(fs.promises.readdir).mockResolvedValue([
      { name: "whisper-cli.exe", isFile: () => true, isDirectory: () => false } as never,
    ]);

    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    await mgr.install();

    const cmakeConfigCall = execFileCalls.find(
      (c) => c.cmd === "cmake" && c.args.includes(".."),
    );
    expect(cmakeConfigCall?.args).not.toContain("-DWHISPER_METAL=ON");

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("always includes -DBUILD_SHARED_LIBS=OFF regardless of platform", async () => {
    for (const platform of ["darwin", "win32"] as const) {
      execFileCalls.length = 0;
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: platform, configurable: true });

      vi.mocked(fs.promises.readdir).mockResolvedValue([
        { name: platform === "win32" ? "whisper-cli.exe" : "whisper-cli", isFile: () => true, isDirectory: () => false } as never,
      ]);

      const { WhisperManager } = await import("../whisper-manager.js");
      const mgr = new WhisperManager();
      await mgr.install();

      const cmakeConfigCall = execFileCalls.find(
        (c) => c.cmd === "cmake" && c.args.includes(".."),
      );
      expect(cmakeConfigCall?.args).toContain("-DBUILD_SHARED_LIBS=OFF");
      expect(cmakeConfigCall?.args).toContain("-DCMAKE_BUILD_TYPE=Release");

      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });
});

describe("cmake build command", () => {
  beforeEach(() => {
    execFileCalls.length = 0;
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it("always passes --config Release (required for MSVC multi-config generators)", async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValue([
      { name: "whisper-cli", isFile: () => true, isDirectory: () => false } as never,
    ]);

    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    await mgr.install();

    const buildCall = execFileCalls.find(
      (c) => c.cmd === "cmake" && c.args.includes("--build"),
    );
    expect(buildCall?.args).toContain("--config");
    expect(buildCall?.args).toContain("Release");
  });
});

describe("prerequisite error messages", () => {
  it("gives Windows-specific git error on win32", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    const { execFile } = await import("node:child_process");
    vi.mocked(execFile).mockImplementationOnce(
      (_cmd, _args, _opts, cb: (err: Error) => void) => cb(new Error("not found")),
    );

    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    const result = await mgr.install();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Git for Windows/i);
    expect(result.error).not.toMatch(/xcode/i);

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("gives macOS-specific git error on darwin", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

    const { execFile } = await import("node:child_process");
    vi.mocked(execFile).mockImplementationOnce(
      (_cmd, _args, _opts, cb: (err: Error) => void) => cb(new Error("not found")),
    );

    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    const result = await mgr.install();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/xcode/i);

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("gives Windows-specific cmake error on win32", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    const { execFile } = await import("node:child_process");
    // git succeeds, cmake fails
    vi.mocked(execFile)
      .mockImplementationOnce((_cmd, _args, _opts, cb: (err: null, r: { stdout: string; stderr: string }) => void) =>
        cb(null, { stdout: "git version 2.x", stderr: "" }),
      )
      .mockImplementationOnce(
        (_cmd, _args, _opts, cb: (err: Error) => void) => cb(new Error("not found")),
      );

    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    const result = await mgr.install();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Visual Studio Build Tools/i);
    expect(result.error).not.toMatch(/brew/i);

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("gives macOS-specific cmake error on darwin", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

    const { execFile } = await import("node:child_process");
    vi.mocked(execFile)
      .mockImplementationOnce((_cmd, _args, _opts, cb: (err: null, r: { stdout: string; stderr: string }) => void) =>
        cb(null, { stdout: "git version 2.x", stderr: "" }),
      )
      .mockImplementationOnce(
        (_cmd, _args, _opts, cb: (err: Error) => void) => cb(new Error("not found")),
      );

    const { WhisperManager } = await import("../whisper-manager.js");
    const mgr = new WhisperManager();
    const result = await mgr.install();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/brew install cmake/i);

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });
});

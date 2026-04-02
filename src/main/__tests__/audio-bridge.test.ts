/**
 * Tests for the audio IPC bridge.
 *
 * The bridge wraps the native addon (C++, platform-specific) behind Electron
 * IPC handlers. These tests verify the TypeScript layer: callback wiring,
 * handler routing, and error handling — using a mock addon so the tests run
 * on any platform without a compiled .node file.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Mock: native addon injected via createRequire
// ---------------------------------------------------------------------------

const mockAddon = {
  startRecording: vi.fn().mockReturnValue({ ok: true }),
  stopRecording: vi.fn().mockReturnValue({ ok: true }),
  checkPermissions: vi.fn().mockReturnValue({ mic: true, screen: true }),
  requestMicPermission: vi.fn().mockResolvedValue(true),
  setStatusCallback: vi.fn(),
  setLevelCallback: vi.fn(),
  setSegmentCallback: vi.fn(),
};

vi.mock("node:module", () => ({
  createRequire: vi.fn(() => vi.fn(() => mockAddon)),
}));

// ---------------------------------------------------------------------------
// Mock: Electron (ipcMain, app, BrowserWindow)
// We capture the registered IPC handlers so we can invoke them directly.
// ---------------------------------------------------------------------------

type IpcHandler = (...args: unknown[]) => unknown;
const ipcHandlers: Record<string, IpcHandler> = {};

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: IpcHandler) => {
      ipcHandlers[channel] = fn;
    }),
  },
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue(tmpdir()),
    getAppPath: vi.fn().mockReturnValue("/mock/app"),
  },
  BrowserWindow: class {},
}));

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------

import { registerAudioIPC } from "../audio-bridge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() },
  };
}

function setup(windowOverride?: ReturnType<typeof makeWindow>) {
  const win = windowOverride ?? makeWindow();
  const callbacks = {
    onSegment: vi.fn(),
    onRecordingStart: vi.fn(),
    onRecordingStop: vi.fn(),
  };
  registerAudioIPC(() => win as never, callbacks);
  return { win, callbacks };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(ipcHandlers).forEach((k) => delete ipcHandlers[k]);
});

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

describe("registerAudioIPC", () => {
  it("registers recording:start, recording:stop, and permissions:check handlers", () => {
    setup();
    expect(ipcHandlers["recording:start"]).toBeDefined();
    expect(ipcHandlers["recording:stop"]).toBeDefined();
    expect(ipcHandlers["permissions:check"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// recording:start
// ---------------------------------------------------------------------------

describe("recording:start handler", () => {
  it("requests mic permission before starting capture", async () => {
    setup();
    await ipcHandlers["recording:start"]();
    expect(mockAddon.requestMicPermission).toHaveBeenCalledOnce();
    expect(mockAddon.startRecording).toHaveBeenCalledOnce();
    // Permission must be requested before capture starts
    expect(
      mockAddon.requestMicPermission.mock.invocationCallOrder[0],
    ).toBeLessThan(mockAddon.startRecording.mock.invocationCallOrder[0]);
  });

  it("passes a session directory path to startRecording", async () => {
    setup();
    await ipcHandlers["recording:start"]();
    const [dir] = mockAddon.startRecording.mock.calls[0] as [string];
    expect(dir).toMatch(/session-\d{4}-\d{2}-\d{2}/);
  });

  it("invokes onRecordingStart callback with session directory on success", async () => {
    const { callbacks } = setup();
    await ipcHandlers["recording:start"]();
    expect(callbacks.onRecordingStart).toHaveBeenCalledOnce();
  });

  it("does not invoke onRecordingStart when native addon returns ok: false", async () => {
    mockAddon.startRecording.mockReturnValueOnce({
      ok: false,
      error: "WASAPI init failed",
    });
    const { callbacks } = setup();
    const result = await ipcHandlers["recording:start"]();
    expect(callbacks.onRecordingStart).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false });
  });

  it("returns { ok: false, error } when addon throws", async () => {
    mockAddon.requestMicPermission.mockRejectedValueOnce(
      new Error("permission denied"),
    );
    setup();
    const result = await ipcHandlers["recording:start"]();
    expect(result).toMatchObject({ ok: false, error: "permission denied" });
  });
});

// ---------------------------------------------------------------------------
// recording:stop
// ---------------------------------------------------------------------------

describe("recording:stop handler", () => {
  it("calls stopRecording on the native addon", async () => {
    setup();
    await ipcHandlers["recording:stop"]();
    expect(mockAddon.stopRecording).toHaveBeenCalledOnce();
  });

  it("invokes onRecordingStop callback on success", async () => {
    const { callbacks } = setup();
    await ipcHandlers["recording:stop"]();
    expect(callbacks.onRecordingStop).toHaveBeenCalledOnce();
  });

  it("does not invoke onRecordingStop when native addon returns ok: false", async () => {
    mockAddon.stopRecording.mockReturnValueOnce({ ok: false, error: "not recording" });
    const { callbacks } = setup();
    await ipcHandlers["recording:stop"]();
    expect(callbacks.onRecordingStop).not.toHaveBeenCalled();
  });

  it("returns { ok: false, error } when addon throws", async () => {
    mockAddon.stopRecording.mockImplementationOnce(() => {
      throw new Error("capture thread panic");
    });
    setup();
    const result = await ipcHandlers["recording:stop"]();
    expect(result).toMatchObject({ ok: false, error: "capture thread panic" });
  });
});

// ---------------------------------------------------------------------------
// permissions:check
// ---------------------------------------------------------------------------

describe("permissions:check handler", () => {
  it("returns { mic, screen } from the native addon", async () => {
    setup();
    const result = await ipcHandlers["permissions:check"]();
    expect(result).toEqual({ mic: true, screen: true });
  });

  it("returns { mic: false, screen: false } when addon throws (e.g. not yet loaded)", async () => {
    mockAddon.checkPermissions.mockImplementationOnce(() => {
      throw new Error("addon load failed");
    });
    setup();
    const result = await ipcHandlers["permissions:check"]();
    expect(result).toEqual({ mic: false, screen: false });
  });

  it("propagates whatever the platform reports (Windows always returns true)", async () => {
    mockAddon.checkPermissions.mockReturnValueOnce({ mic: true, screen: true });
    setup();
    const result = await ipcHandlers["permissions:check"]();
    expect(result).toMatchObject({ mic: true, screen: true });
  });
});

// ---------------------------------------------------------------------------
// Renderer forwarding (native callbacks → webContents.send)
// ---------------------------------------------------------------------------

describe("native callbacks → renderer forwarding", () => {
  // setupCallbacks() runs lazily on the first recording:start call.
  // We trigger recording:start so the native callbacks are registered, then
  // access them from mock.calls before beforeEach clears them.
  async function setupWithCallbacks(windowOverride?: ReturnType<typeof makeWindow>) {
    const result = setup(windowOverride);
    await ipcHandlers["recording:start"]();
    return result;
  }

  it("forwards status updates to the renderer", async () => {
    const { win } = await setupWithCallbacks();
    const [statusCb] = mockAddon.setStatusCallback.mock.calls[0] as [
      (s: { state: string }) => void,
    ];
    statusCb({ state: "recording" });
    expect(win.webContents.send).toHaveBeenCalledWith("recording:status", {
      state: "recording",
    });
  });

  it("forwards level updates to the renderer", async () => {
    const { win } = await setupWithCallbacks();
    const [levelCb] = mockAddon.setLevelCallback.mock.calls[0] as [
      (l: { rms: number }) => void,
    ];
    levelCb({ rms: 0.42 });
    expect(win.webContents.send).toHaveBeenCalledWith("recording:level", {
      rms: 0.42,
    });
  });

  it("forwards segment events to both the renderer and the onSegment callback", async () => {
    const { win, callbacks } = await setupWithCallbacks();
    const [segCb] = mockAddon.setSegmentCallback.mock.calls[0] as [
      (s: { path: string; index: number }) => void,
    ];
    segCb({ path: "/tmp/segment_0000.wav", index: 0 });
    expect(win.webContents.send).toHaveBeenCalledWith("recording:segment", {
      path: "/tmp/segment_0000.wav",
      index: 0,
    });
    expect(callbacks.onSegment).toHaveBeenCalledWith({
      path: "/tmp/segment_0000.wav",
      index: 0,
    });
  });

  it("does not throw when the window is destroyed", async () => {
    await setupWithCallbacks(makeWindow(true)); // destroyed window
    const [statusCb] = mockAddon.setStatusCallback.mock.calls[0] as [
      (s: { state: string }) => void,
    ];
    expect(() => statusCb({ state: "idle" })).not.toThrow();
  });
});

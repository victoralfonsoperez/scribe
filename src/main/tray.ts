import { Tray, Menu, nativeImage, BrowserWindow, ipcMain, app } from "electron";

let tray: Tray | null = null;
let isRecording = false;
let onCaptureScreenshot: (() => void) | null = null;

function createTrayIcon(recording: boolean): Electron.NativeImage {
  // macOS menu bar icons are 22×22; Windows system tray icons are 16×16
  const size = process.platform === "win32" ? 16 : 22;
  const canvas = Buffer.alloc(size * size * 4, 0);

  const setPixel = (x: number, y: number, alpha: number) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const offset = (y * size + x) * 4;
    if (recording) {
      // Red tint when recording
      canvas[offset] = 255; // R
      canvas[offset + 1] = 59; // G
      canvas[offset + 2] = 48; // B
    } else {
      // Black for template image
      canvas[offset] = 0;
      canvas[offset + 1] = 0;
      canvas[offset + 2] = 0;
    }
    canvas[offset + 3] = alpha;
  };

  const fillCircle = (cx: number, cy: number, r: number, alpha: number) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) {
          setPixel(Math.round(x), Math.round(y), alpha);
        }
      }
    }
  };

  const fillRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    alpha: number,
  ) => {
    for (let iy = y; iy < y + h; iy++) {
      for (let ix = x; ix < x + w; ix++) {
        setPixel(Math.round(ix), Math.round(iy), alpha);
      }
    }
  };

  // Draw microphone icon — all coordinates scale proportionally from 22px baseline
  const s = (n: number) => Math.round(n * (size / 22));
  const cx = Math.round(size / 2);
  const a = 220;

  // Mic head (rounded rect via circle + rect)
  fillCircle(cx, s(5), s(3), a);
  fillRect(cx - s(3), s(5), s(7), s(6), a);
  fillCircle(cx, s(11), s(3), a);

  // Mic stand arc (approximate with pixels)
  for (let angle = 0; angle <= Math.PI; angle += 0.1) {
    const rx = s(5);
    const ry = s(5);
    const px = cx + rx * Math.cos(angle);
    const py = s(10) + ry * Math.sin(angle);
    setPixel(Math.round(px), Math.round(py), a);
    setPixel(Math.round(px) + 1, Math.round(py), a);
  }

  // Stem
  fillRect(cx - s(1), s(15), s(3), s(3), a);

  // Base
  fillRect(cx - s(3), s(18), s(7), s(2), a);

  const img = nativeImage.createFromBuffer(canvas, {
    width: size,
    height: size,
  });

  // setTemplateImage is macOS-only — it makes the icon adapt to light/dark
  // menu bar automatically. Skip on Windows where it has no effect.
  if (!recording && process.platform === "darwin") {
    img.setTemplateImage(true);
  }

  return img;
}

export function createTray(
  getMainWindow: () => BrowserWindow | null,
  captureScreenshot?: () => void,
): Tray {
  onCaptureScreenshot = captureScreenshot ?? null;
  const icon = createTrayIcon(false);
  tray = new Tray(icon);
  tray.setToolTip("Scribe");

  updateTrayMenu();

  // On macOS, setContextMenu() intercepts all tray clicks so this handler is
  // effectively a no-op there — the menu appears directly on click.
  // On Windows, left-click fires "click" (show window) and right-click fires
  // "right-click" (show context menu).
  tray.on("click", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  if (process.platform === "win32") {
    tray.on("right-click", () => {
      tray?.popUpContextMenu();
    });
  }

  // Listen for recording state changes from the renderer
  ipcMain.on("tray:recording-state", (_event, recording: boolean) => {
    isRecording = recording;
    if (tray) {
      tray.setImage(createTrayIcon(recording));
      updateTrayMenu();
    }
  });

  return tray;
}

function updateTrayMenu(): void {
  if (!tray) return;

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: isRecording ? "Stop Recording" : "Start Recording",
      click: () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send("tray:toggle-recording");
        }
      },
    },
    {
      label: "Capture Screenshot",
      enabled: isRecording,
      click: () => {
        onCaptureScreenshot?.();
      },
    },
    { type: "separator" },
    {
      label: "Show Window",
      click: () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit Scribe",
      click: () => {
        app.quit();
      },
    },
  ];

  const contextMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(contextMenu);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

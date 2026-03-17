import { Tray, Menu, nativeImage, BrowserWindow, ipcMain, app } from "electron";

let tray: Tray | null = null;
let isRecording = false;

function createTrayIcon(recording: boolean): Electron.NativeImage {
  // Create a 32x32 (16x16 @2x) template image for macOS menu bar
  // Using a simple microphone shape drawn with raw pixel data
  const size = 22;
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

  // Draw microphone icon
  const cx = 11;
  const a = 220;

  // Mic head (rounded rect via circle + rect)
  fillCircle(cx, 5, 3, a);
  fillRect(cx - 3, 5, 7, 6, a);
  fillCircle(cx, 11, 3, a);

  // Mic stand arc (approximate with pixels)
  for (let angle = 0; angle <= Math.PI; angle += 0.1) {
    const rx = 5;
    const ry = 5;
    const px = cx + rx * Math.cos(angle);
    const py = 10 + ry * Math.sin(angle);
    setPixel(Math.round(px), Math.round(py), a);
    setPixel(Math.round(px) + 1, Math.round(py), a);
  }

  // Stem
  fillRect(cx - 1, 15, 3, 3, a);

  // Base
  fillRect(cx - 3, 18, 7, 2, a);

  const img = nativeImage.createFromBuffer(canvas, {
    width: size,
    height: size,
  });

  if (!recording) {
    img.setTemplateImage(true);
  }

  return img;
}

export function createTray(
  getMainWindow: () => BrowserWindow | null,
): Tray {
  const icon = createTrayIcon(false);
  tray = new Tray(icon);
  tray.setToolTip("Scribe");

  updateTrayMenu();

  tray.on("click", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

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
